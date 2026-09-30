import * as THREE from 'three'
import { rig } from '../assets'
import { hash } from '../deck'
import { DIRS, type ShipMap } from '../map'

/*
 * Modèles de la base au sol : le Space Kit de Kenney (CC0), sans texture, coloré par matériau
 * (roche ocre, pistes plus claires, métal blanc, bandes orange). Chaque modèle est recentré sur
 * son origine (le kit les pose dans un repère décalé), puis cloné à la demande. Le sol du plateau
 * (sable, pistes orientées d'après leurs voisines) et ses falaises, qui plongent dans le vide.
 */

const MODELS = [
  'terrain', 'terrain_roadStraight', 'terrain_roadCorner', 'terrain_roadCross', 'terrain_roadSplit', 'terrain_roadEnd',
  'crater', 'craterLarge', 'rocks_smallA', 'rocks_smallB', 'rock_largeA', 'rock_largeB',
  'rock_crystals', 'rock_crystalsLargeA', 'rock_crystalsLargeB', 'meteor', 'meteor_detailed', 'meteor_half',
  'hangar_largeA', 'hangar_roundA', 'hangar_roundGlass', 'structure_detailed', 'structure_closed',
  'platform_large', 'platform_center', 'satelliteDish_detailed',
  'machine_generator', 'machine_generatorLarge', 'machine_wireless', 'machine_barrelLarge',
  'barrel', 'barrels', 'barrels_rail', 'rover', 'rocket_baseA', 'rocket_sidesA', 'rocket_topA',
  'craft_cargoA', 'craft_miner', 'gate_complex', 'turret_double',
] as const

export type SpaceModel = (typeof MODELS)[number]

/** Base au sol d'un pont (cf. LevelDef.ground) : son sol, ses falaises, son centre. */
export interface GroundDef {
  /** Sol d'une tuile du plateau (sable, piste…), posé à y = 0. */
  floor(x: number, z: number): THREE.Object3D
  /** Les falaises du plateau, d'un seul tenant (fusionnées avec le sol, cf. Deck). */
  skirt: THREE.Object3D
  /** Milieu du plateau : le soleil y cadre ses ombres (cf. main.ts). */
  center: { x: number; z: number }
}

export interface BaseKit {
  /**
   * Un modèle du kit, centré sur l'origine en x et z, posé au sol, à l'échelle `scale` (le kit est
   * un jouet : ses hangars font une tuile de haut, on les grandit pour y faire tenir un CMDR).
   */
  model(name: SpaceModel, scale?: number): THREE.Object3D
  /** Sol et falaises d'un plateau (le plan d'un pont), avec ses pistes (tuiles « x,z »). */
  ground(map: ShipMap, roads: Set<string>, center: { x: number; z: number }): GroundDef
}

let loading: Promise<BaseKit> | null = null

/** Charge le kit (une fois) : au premier voyage vers la base. */
export function loadBaseKit(onProgress?: (ratio: number) => void): Promise<BaseKit> {
  return (loading ??= build(onProgress))
}

async function build(onProgress?: (ratio: number) => void): Promise<BaseKit> {
  let done = 0
  const roots = await Promise.all(MODELS.map(async (m) => {
    const r = (await rig(`space/${m}.glb`)).root
    onProgress?.(++done / MODELS.length)
    return r
  }))
  const protos = new Map<SpaceModel, THREE.Object3D>()
  MODELS.forEach((name, i) => protos.set(name, centered(roots[i], name)))

  const model = (name: SpaceModel, scale = 1): THREE.Object3D => {
    const o = protos.get(name)!.clone(true)
    if (scale !== 1) {
      const g = new THREE.Group()
      o.scale.setScalar(scale)
      g.add(o)
      return g
    }
    return o
  }
  return { model, ground: (map, roads, center) => ground(model, map, roads, center) }
}

/**
 * Le kit pose chaque modèle dans un nœud décalé (x = 2, z = 1,5) : on l'en sort, et on recentre
 * les pièces de terrain qui débordent d'un côté (les virages et les embranchements des pistes).
 */
function centered(root: THREE.Object3D, name: string): THREE.Object3D {
  const node = root.getObjectByName(name) ?? root
  node.removeFromParent()
  node.position.set(0, 0, 0)
  node.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(node)
  const g = new THREE.Group()
  g.add(node)
  if (name === 'terrain_roadCorner' || name === 'terrain_roadSplit') node.position.set(-0.5, 0, 0.5)
  else if (box.min.x > -0.01 || box.max.z < 0.01) node.position.set(-(box.min.x + box.max.x) / 2, 0, -(box.min.z + box.max.z) / 2)
  return g
}

// --------------------------------------------------------------- le sol

/**
 * Pistes du kit : leurs sorties (bits : 1 nord, 2 est, 4 sud, 8 ouest) sans rotation. Un quart
 * de tour (rotation.y = π/2) envoie l'est au nord, le nord à l'ouest…
 */
const ROADS: [SpaceModel, number][] = [
  ['terrain_roadCross', 0b1111],
  ['terrain_roadSplit', 0b1110],
  ['terrain_roadStraight', 0b0101],
  ['terrain_roadCorner', 0b1001],
  ['terrain_roadEnd', 0b0001],
]

/** Sorties d'une pièce tournée de `k` quarts de tour. */
function turned(mask: number, k: number): number {
  let out = 0
  for (let d = 0; d < 4; d++) if (mask & (1 << d)) out |= 1 << ((d - k + 4) % 4)
  return out
}

/** Pièce de piste et quarts de tour pour relier les voisines `mask` (au moins une sortie). */
function roadPiece(mask: number): { name: SpaceModel; k: number } {
  for (const [name, base] of ROADS) {
    for (let k = 0; k < 4; k++) if (turned(base, k) === mask) return { name, k }
  }
  // Une piste isolée, ou qui ne sort que d'un côté : un bout de piste.
  const d = [0, 1, 2, 3].find((i) => mask & (1 << i)) ?? 0
  return { name: 'terrain_roadEnd', k: (0 - d + 4) % 4 }
}

function ground(model: BaseKit['model'], map: ShipMap, roads: Set<string>, center: { x: number; z: number }): GroundDef {
  return {
    center,
    floor(x, z) {
      let o: THREE.Object3D
      if (roads.has(`${x},${z}`)) {
        let mask = 0
        DIRS.forEach((d, i) => {
          if (roads.has(`${x + d.dx},${z + d.dz}`)) mask |= 1 << i
        })
        const { name, k } = roadPiece(mask)
        o = model(name)
        o.rotation.y = (k * Math.PI) / 2
      } else o = model('terrain')
      o.position.set(x, 0, z)
      return o
    },
    skirt: cliffs(map),
  }
}

// --------------------------------------------------------------- les falaises

/** Roche des falaises : l'ocre du kit en haut, de plus en plus sombre en descendant, par strates. */
const CLIFF_TOP = new THREE.Color('#e0805f')
const CLIFF_MID = new THREE.Color('#b35a3c')
const CLIFF_LOW = new THREE.Color('#5e2a1f')

/** Bruit fixe d'un sommet de la grille (le même vu des deux arêtes qui s'y rejoignent), dans [0, 1[. */
const noise = (x: number, z: number, salt: number) => (hash(Math.round(x * 2) + salt * 131, Math.round(z * 2) - salt * 71) % 1000) / 1000

/**
 * Les falaises : sous chaque arête du bord du plateau, une paroi à trois étages de sommets (le
 * bord, une corniche qui avance ou recule un peu, le pied qui rentre sous le plateau), partagés
 * d'une arête à l'autre : la paroi est d'un seul tenant, taillée à facettes. Couleurs par sommet.
 */
function cliffs(map: ShipMap): THREE.Object3D {
  const pos: number[] = []
  const col: number[] = []
  const color = new THREE.Color()
  /** Sommets d'un coin du bord, à trois hauteurs ; `out` : vers l'extérieur du plateau. */
  const column = (vx: number, vz: number, ox: number, oz: number): [number, number, number][] => {
    const depth = 1.3 + noise(vx, vz, 1) * 1.1
    const ledge = 0.12 + noise(vx, vz, 2) * 0.16
    const tuck = 0.35 + noise(vx, vz, 3) * 0.45
    return [
      [vx, 0, vz],
      [vx + ox * ledge, -0.38 - noise(vx, vz, 4) * 0.2, vz + oz * ledge],
      [vx - ox * tuck, -depth, vz - oz * tuck],
    ]
  }
  const shade = (y: number, vx: number, vz: number) => {
    const k = Math.min(1, -y / 2.2)
    color.copy(CLIFF_TOP).lerp(CLIFF_MID, Math.min(1, k * 2.2)).lerp(CLIFF_LOW, Math.max(0, k * 1.6 - 0.5))
    // Strates : une bande un peu plus claire ou plus sombre selon le coin.
    color.multiplyScalar(0.92 + noise(vx, vz, 5) * 0.16)
    return color
  }
  const tri = (a: [number, number, number], b: [number, number, number], c: [number, number, number]) => {
    for (const p of [a, b, c]) {
      pos.push(...p)
      const s = shade(p[1], p[0], p[2])
      col.push(s.r, s.g, s.b)
    }
  }
  for (let z = 0; z < map.height; z++) {
    for (let x = 0; x < map.width; x++) {
      if (!map.isFloor(x, z)) continue
      for (let dir = 0; dir < 4; dir++) {
        const d = DIRS[dir]
        if (map.isFloor(x + d.dx, z + d.dz)) continue
        // L'arête, de gauche à droite vue de l'extérieur : la face regarde vers le vide.
        const cx = x + d.dx * 0.5, cz = z + d.dz * 0.5
        const ax = -d.dz * 0.5, az = d.dx * 0.5
        const left = column(cx - ax, cz - az, d.dx, d.dz)
        const right = column(cx + ax, cz + az, d.dx, d.dz)
        for (let i = 0; i < 2; i++) {
          tri(left[i], right[i], left[i + 1])
          tri(right[i], right[i + 1], left[i + 1])
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }))
  mesh.receiveShadow = true
  return mesh
}
