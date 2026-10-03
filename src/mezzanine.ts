import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { solidBox, type Box2 } from './deck'
import { DIRS } from './map'
import type { Mezzanine, MezzanineTile } from '../shared/mezzanine.js'

/*
 * Mezzanine d'une pièce (cf. shared/mezzanine.js) : son plancher, sa façade, ses escaliers et ses
 * garde-corps, et les grandes baies vitrées au-dessus de ses murs extérieurs. Tout est fusionné
 * avec le pont (un appel de dessin par matériau, comme les murs) : l'étage ne coûte presque rien.
 * Le verre est un seul maillage, comme celui des verrières.
 */

/** Main courante du garde-corps, au-dessus du sol où l'on marche. */
const RAIL_H = 0.4
/** Épaisseur de la façade et du garde-corps, comme de leur collision. */
const RAIL_T = 0.1
/** Marches par tuile d'escalier. */
const STEPS = 4
/** Baie vitrée au-dessus d'un mur extérieur de la mezzanine : du haut du mur à son linteau. */
export const BAY_BOTTOM = 1.02
export const BAY_TOP = 1.9
/** Haut du linteau des baies, et de leurs montants. */
export const BAY_FRAME_TOP = 1.98

/** Bandeau lumineux de la façade et des baies, à l'orange d'Elite. */
const TRIM = new THREE.MeshBasicMaterial({ color: '#ff8a1c' })
/** Nez de marche, orange mat. */
const NOSING = new THREE.MeshLambertMaterial({ color: '#d9741f' })
/** Verre des garde-corps, comme celui des verrières. */
const RAIL_GLASS = new THREE.MeshLambertMaterial({ color: '#9fd8ff', transparent: true, opacity: 0.26, depthWrite: false, side: THREE.DoubleSide })

export interface MezzanineParts {
  /** Plancher et marches : fusionnés avec le pont. */
  statics: THREE.Object3D[]
  /** Façade, flancs des escaliers et garde-corps : ils s'estompent quand ils cachent le joueur. */
  fading: { object: THREE.Object3D; center: THREE.Vector3 }[]
  /** Verre des garde-corps, en un maillage. */
  glass: THREE.Mesh | null
  /** Collisions des garde-corps (les arêtes du plan qu'on ne franchit pas). */
  colliders: Box2[]
}

/**
 * Pièce posée dans le repère d'une arête ou d'une marche : `u` le long de l'axe, `y` en hauteur,
 * `v` en travers ; `angle` tourne l'axe local x sur la direction voulue.
 */
function put(o: THREE.Object3D, cx: number, cz: number, angle: number, u: number, y: number, v = 0): THREE.Object3D {
  const c = Math.cos(angle), s = Math.sin(angle)
  o.position.set(cx + u * c + v * s, y, cz - u * s + v * c)
  o.rotation.y = angle
  o.updateMatrixWorld(true)
  return o
}

/** Angle qui tourne l'axe x local sur la direction `dir` (0 nord… 3 ouest). */
const angleOf = (dir: number) => Math.atan2(-DIRS[dir].dz, DIRS[dir].dx)

/**
 * Bande en pente (vue de profil : de u = -0,5 à 0,5, du bas `b0`/`b1` au haut `t0`/`t1`), épaisse de
 * `depth` : un pavé du kit (même peinture que les murs, fusionnable avec eux) qu'on cisaille.
 */
function slopedBand(b0: number, b1: number, t0: number, t1: number, depth: number, material: THREE.Material): THREE.Mesh {
  const m = solidBox(1, 1, depth, material)
  const pos = m.geometry.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const k = pos.getX(i) + 0.5
    pos.setY(i, pos.getY(i) < 0 ? b0 + (b1 - b0) * k : t0 + (t1 - t0) * k)
  }
  m.geometry.computeVertexNormals()
  return m
}

/** Pan de verre vertical, en pente ou non, dans le repère local (u, y). */
function glassPane(u0: number, u1: number, b0: number, b1: number, t0: number, t1: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute([u0, b0, 0, u1, b1, 0, u1, t1, 0, u0, b0, 0, u1, t1, 0, u0, t0, 0], 3))
  g.computeVertexNormals()
  return g
}

/**
 * Construit la mezzanine : `rails` sont les garde-corps du plan (cf. mezzanineRails), `floor` pose
 * une dalle du pont à la hauteur voulue (la même que celle des pièces), `shell` est la peinture
 * de la coque du pont.
 */
export function buildMezzanine(mezz: Mezzanine, rails: { x: number; z: number; dir: number }[], shell: THREE.Material, floor: (x: number, y: number, z: number) => THREE.Object3D): MezzanineParts {
  const h = mezz.height
  const parts: MezzanineParts = { statics: [], fading: [], glass: null, colliders: [] }
  const glass: THREE.BufferGeometry[] = []
  const at = (x: number, z: number) => mezz.tiles.get(`${x},${z}`)
  /** Montants déjà posés (un sommet de la grille, à une hauteur). */
  const posts = new Set<string>()
  const post = (x: number, z: number, y: number, group: THREE.Group) => {
    const key = `${x},${z},${y.toFixed(2)}`
    if (posts.has(key)) return
    posts.add(key)
    const m = solidBox(0.06, RAIL_H, 0.06, shell)
    m.position.set(x, y + RAIL_H / 2, z)
    group.add(m)
  }

  // Le plancher : les dalles du pont, à la hauteur de la mezzanine.
  for (const t of mezz.tiles.values()) if (t.stair < 0) parts.statics.push(floor(t.x, h - 0.3, t.z))

  // Les marches : des blocs pleins jusqu'au sol, un nez orange au bord de chacune.
  for (const t of mezz.tiles.values()) {
    if (t.stair < 0) continue
    const g = new THREE.Group()
    const angle = angleOf(t.stair)
    const rise = h / t.run
    for (let i = 0; i < STEPS; i++) {
      const top = rise * (t.step + (i + 0.5) / STEPS)
      const u = -0.5 + (i + 0.5) / STEPS
      g.add(put(solidBox(1 / STEPS, top, 1 - RAIL_T, shell), t.x, t.z, angle, u, top / 2))
      g.add(put(new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 1 - RAIL_T - 0.04), NOSING), t.x, t.z, angle, u - 0.5 / STEPS + 0.02, top + 0.004))
    }
    parts.statics.push(g)
  }

  for (const r of rails) {
    const d = DIRS[r.dir]
    const cx = r.x + d.dx * 0.5, cz = r.z + d.dz * 0.5
    const alongX = d.dz !== 0
    parts.colliders.push(alongX
      ? { minX: cx - 0.5, maxX: cx + 0.5, minZ: cz - RAIL_T / 2, maxZ: cz + RAIL_T / 2 }
      : { minX: cx - RAIL_T / 2, maxX: cx + RAIL_T / 2, minZ: cz - 0.5, maxZ: cz + 0.5 })
    const a = at(r.x, r.z), b = at(r.x + d.dx, r.z + d.dz)
    const g = new THREE.Group()
    // Axe de l'arête : le long du mur ; `side` pointe vers le côté bas.
    const edgeAngle = alongX ? 0 : Math.PI / 2
    const ends = alongX ? [[cx - 0.5, cz], [cx + 0.5, cz]] : [[cx, cz - 0.5], [cx, cz + 0.5]]
    const floorSide = a?.stair === -1 ? a : b?.stair === -1 ? b : null
    if (floorSide) {
      // Bord du plancher : la façade, pleine jusqu'au sol, son bandeau lumineux, le garde-corps.
      const low = floorSide === a ? b : a
      const toLow = floorSide === a ? 1 : -1
      const lx = d.dx * toLow, lz = d.dz * toLow
      g.add(put(solidBox(1, h, RAIL_T, shell), cx, cz, edgeAngle, 0, h / 2))
      g.add(put(solidBox(1.02, 0.05, RAIL_T + 0.05, shell), cx, cz, edgeAngle, 0, h - 0.025))
      // Côté sol (pas côté escalier, contre lequel la façade est un mur) : le bandeau orange.
      if (!low) {
        const strip = put(new THREE.Mesh(new THREE.BoxGeometry(1, 0.035, 0.012), TRIM), cx + lx * (RAIL_T / 2 + 0.006), cz + lz * (RAIL_T / 2 + 0.006), edgeAngle, 0, h - 0.11)
        g.add(strip)
      }
      g.add(put(solidBox(1.0, 0.035, 0.07, shell), cx, cz, edgeAngle, 0, h + RAIL_H))
      for (const [x, z] of ends) post(x, z, h, g)
      glass.push(glassPane(-0.5, 0.5, h + 0.04, h + 0.04, h + RAIL_H - 0.02, h + RAIL_H - 0.02).applyMatrix4(put(new THREE.Object3D(), cx, cz, edgeAngle, 0, 0).matrixWorld))
    } else {
      // Flanc d'un escalier, côté sol : un limon plein qui suit les marches, un garde-corps en pente.
      const t = (a?.stair !== undefined && a.stair >= 0 ? a : b) as MezzanineTile
      const angle = angleOf(t.stair)
      const rise = h / t.run
      const y0 = rise * t.step, y1 = rise * (t.step + 1)
      const across = (r.x + d.dx * 0.5 - t.x) * DIRS[t.stair].dz * -1 + (r.z + d.dz * 0.5 - t.z) * DIRS[t.stair].dx
      const frame = put(new THREE.Object3D(), t.x, t.z, angle, 0, 0, across)
      const band = (b0: number, b1: number, t0: number, t1: number, depth: number, material: THREE.Material) => {
        const m = slopedBand(b0, b1, t0, t1, depth, material)
        m.applyMatrix4(frame.matrixWorld)
        g.add(m)
      }
      band(0, 0, y0 + 0.06, y1 + 0.06, RAIL_T, shell)
      band(y0 + RAIL_H - 0.018, y1 + RAIL_H - 0.018, y0 + RAIL_H + 0.018, y1 + RAIL_H + 0.018, 0.07, shell)
      for (const [x, z] of ends) {
        const s = ((x - t.x) * DIRS[t.stair].dx + (z - t.z) * DIRS[t.stair].dz) > 0 ? y1 : y0
        post(x, z, s, g)
      }
      glass.push(glassPane(-0.5, 0.5, y0 + 0.1, y1 + 0.1, y0 + RAIL_H - 0.02, y1 + RAIL_H - 0.02).applyMatrix4(frame.matrixWorld))
    }
    g.updateMatrixWorld(true)
    parts.fading.push({ object: g, center: new THREE.Vector3(cx, 0.5, cz) })
  }

  if (glass.length) {
    const mesh = new THREE.Mesh(mergeGeometries(glass), RAIL_GLASS)
    for (const g of glass) g.dispose()
    mesh.renderOrder = 2
    parts.glass = mesh
  }
  return parts
}

/**
 * Cadre d'une baie vitrée au-dessus d'un mur extérieur de la mezzanine (arête de milieu cx, cz) :
 * un bandeau lumineux sur le haut du mur, un montant à chaque bout, le linteau. Le verre est posé
 * à part, avec celui des verrières (cf. Deck).
 */
export function bayFrame(cx: number, cz: number, alongX: boolean, shell: THREE.Material): THREE.Object3D {
  const g = new THREE.Group()
  const angle = alongX ? 0 : Math.PI / 2
  g.add(put(new THREE.Mesh(new THREE.BoxGeometry(1, 0.03, 0.32), TRIM), cx, cz, angle, 0, 1.015))
  g.add(put(solidBox(1, BAY_FRAME_TOP - BAY_TOP, 0.24, shell), cx, cz, angle, 0, (BAY_TOP + BAY_FRAME_TOP) / 2))
  for (const u of [-0.5, 0.5]) g.add(put(solidBox(0.07, BAY_FRAME_TOP - 1, 0.2, shell), cx, cz, angle, u, (1 + BAY_FRAME_TOP) / 2))
  g.updateMatrixWorld(true)
  return g
}
