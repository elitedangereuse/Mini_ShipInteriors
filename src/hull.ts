import * as THREE from 'three'
import { renderQuality } from './quality'
import { SHIP_LAYOUTS } from '../shared/ship-layouts.js'
import { WING_SIZE, WING_SLOTS } from '../shared/cabin-wings.js'
import { HOUSING_LEVEL } from '../shared/housing-plot.js'
import { HOUSING_V2 } from './housing/flag'

/*
 * La coque (SHIP-03) : un seul corps de vaisseau, dont la silhouette épouse les trois ponts à la
 * fois (et la place des extensions de quartiers), débordant d'une tuile. Chaque pont se pose
 * dessus, un cran plus haut : on voit le pont affiché sur le dos du vaisseau, et non des pièces
 * qui flottent dans l'espace. Le dessus du corps reste sous le plancher, il ne cache jamais rien.
 * Tôles, feux de navigation (rouge à bâbord, au nord ; vert à tribord, au sud ; blanc à la poupe)
 * et tuyères complètent l'ensemble.
 */

/** Dessus du corps : sous le plancher des pièces (cf. FLOOR_Y dans deck.ts). */
export const HULL_TOP = -0.3
/** Épaisseur du corps, biseau compris. */
const DEPTH = 1.1
const BEVEL = 0.25
/** Passes de lissage de la silhouette (cf. smooth). */
const SMOOTHING = 3
/**
 * Un angle n'est pas rogné de plus de ça (tuiles) le long de chacun de ses côtés : la coque déborde
 * d'une tuile, l'arrondi reste en deçà des pièces.
 */
const MAX_CUT = 1.5

type Cell = string

/**
 * Tuiles occupées par au moins un pont, ou réservées à une extension de quartiers. Le pont des
 * quartiers n'en est pas : ses parcelles reposent sur leur propre socle (cf. housing/plot.ts).
 */
function footprint(): Set<Cell> {
  const cells = new Set<Cell>()
  for (const [id, rows] of Object.entries(SHIP_LAYOUTS)) {
    if (Number(id) === HOUSING_LEVEL) continue
    rows.forEach((row, z) => {
      for (let x = 0; x < row.length; x++) if (row[x] !== ' ') cells.add(`${x},${z}`)
    })
  }
  // Les extensions des quartiers sont parties avec eux sur le pont des quartiers (housing v2).
  if (!HOUSING_V2) for (const s of WING_SLOTS) {
    for (let z = s.z0; z < s.z0 + WING_SIZE; z++) for (let x = s.x0; x < s.x0 + WING_SIZE; x++) cells.add(`${x},${z}`)
  }
  return cells
}

const parse = (c: Cell) => c.split(',').map(Number) as [number, number]

/** Dilatation (8 voisins) de `r` tuiles. */
function dilate(cells: Set<Cell>, r: number): Set<Cell> {
  const out = new Set<Cell>()
  for (const c of cells) {
    const [x, z] = parse(c)
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) out.add(`${x + dx},${z + dz}`)
  }
  return out
}

/** Érosion (8 voisins) de `r` tuiles. */
function erode(cells: Set<Cell>, r: number): Set<Cell> {
  const out = new Set<Cell>()
  for (const c of cells) {
    const [x, z] = parse(c)
    let keep = true
    for (let dz = -r; dz <= r && keep; dz++) for (let dx = -r; dx <= r && keep; dx++) keep = cells.has(`${x + dx},${z + dz}`)
    if (keep) out.add(c)
  }
  return out
}

/**
 * Contours de l'union des tuiles (sommets aux coins des tuiles, en coordonnées du pont), chacun
 * fermé ; les sommets alignés sont retirés.
 */
function outlines(cells: Set<Cell>): THREE.Vector2[][] {
  // Arêtes orientées du bord (l'intérieur à gauche), d'un coin de tuile à l'autre.
  const edges = new Map<string, [number, number][]>()
  const add = (ax: number, az: number, bx: number, bz: number) => {
    const k = `${ax},${az}`
    const list = edges.get(k) ?? []
    list.push([bx, bz])
    edges.set(k, list)
  }
  for (const c of cells) {
    const [x, z] = parse(c)
    // Coins de la tuile : (x ± 0,5, z ± 0,5), notés par leur coin nord-ouest entier.
    if (!cells.has(`${x},${z - 1}`)) add(x + 1, z, x, z)
    if (!cells.has(`${x + 1},${z}`)) add(x + 1, z + 1, x + 1, z)
    if (!cells.has(`${x},${z + 1}`)) add(x, z + 1, x + 1, z + 1)
    if (!cells.has(`${x - 1},${z}`)) add(x, z, x, z + 1)
  }
  const loops: THREE.Vector2[][] = []
  while (edges.size) {
    const [startKey] = edges.keys()
    let [cx, cz] = startKey.split(',').map(Number)
    const loop: [number, number][] = []
    let prev: [number, number] | null = null
    for (let guard = 0; guard < 100000; guard++) {
      const k = `${cx},${cz}`
      const list = edges.get(k)
      if (!list) break
      // Deux arêtes partent d'un même coin (tuiles en diagonale) : on tourne à droite.
      let i = 0
      if (list.length > 1 && prev) {
        const din = [cx - prev[0], cz - prev[1]]
        i = list.findIndex(([nx, nz]) => din[0] * (nz - cz) - din[1] * (nx - cx) < 0)
        if (i < 0) i = 0
      }
      const [nx, nz] = list.splice(i, 1)[0]
      if (!list.length) edges.delete(k)
      loop.push([cx, cz])
      prev = [cx, cz]
      cx = nx
      cz = nz
      if (`${cx},${cz}` === startKey && !edges.has(startKey)) break
    }
    // Sommets alignés retirés ; coordonnées du pont (coins des tuiles à ± 0,5).
    const pts = loop.filter((p, j) => {
      const a = loop[(j - 1 + loop.length) % loop.length], b = loop[(j + 1) % loop.length]
      return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0
    })
    loops.push(pts.map(([x, z]) => new THREE.Vector2(x - 0.5, z - 0.5)))
  }
  return loops
}

/**
 * Lissage de Chaikin : chaque côté est remplacé par ses points au quart et aux trois quarts. Les
 * escaliers de tuiles deviennent des pans obliques, les angles s'arrondissent.
 */
function smooth(loop: THREE.Vector2[], iterations: number): THREE.Vector2[] {
  let pts = loop
  for (let k = 0; k < iterations; k++) {
    const out: THREE.Vector2[] = []
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length]
      // Sur un long côté droit, l'angle n'est pas rogné de plus de MAX_CUT : sinon l'arrondi
      // mordrait sur les pièces du coin (le hangar de la cale, sous la proue).
      const t = Math.min(0.25, MAX_CUT / p.distanceTo(q))
      out.push(p.clone().lerp(q, t), p.clone().lerp(q, 1 - t))
    }
    pts = out
  }
  return pts
}

const area = (loop: THREE.Vector2[]) => loop.reduce((s, p, i) => s + p.x * loop[(i + 1) % loop.length].y - loop[(i + 1) % loop.length].x * p.y, 0) / 2

/** Tôles de la coque : plaques cerclées de joints, rivets, quelques trappes. */
function platingTexture(): THREE.CanvasTexture {
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  g.fillStyle = '#4a5064'
  g.fillRect(0, 0, S, S)
  // Nuances d'une plaque à l'autre.
  const plates = [[0, 0, 128, 96], [128, 0, 128, 96], [0, 96, 96, 160], [96, 96, 160, 64], [96, 160, 160, 96]]
  plates.forEach(([x, y, w, h], i) => {
    g.fillStyle = ['#474d61', '#4d5367', '#454b5e', '#4b5165', '#484e62'][i]
    g.fillRect(x, y, w, h)
    g.strokeStyle = '#2b2f3c'
    g.lineWidth = 3
    g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3)
    g.fillStyle = '#5c6378'
    for (const [rx, ry] of [[x + 8, y + 8], [x + w - 8, y + 8], [x + 8, y + h - 8], [x + w - 8, y + h - 8]]) g.fillRect(rx - 2, ry - 2, 4, 4)
  })
  // Une trappe et une grille d'aération.
  g.strokeStyle = '#2b2f3c'
  g.lineWidth = 2
  g.strokeRect(150, 190, 60, 40)
  for (let i = 0; i < 6; i++) g.fillRect(20, 120 + i * 10, 50, 3)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  return t
}

/** Feux de navigation le long du bord de la coque : position (pont) et couleur. */
interface NavLight {
  x: number
  z: number
  color: string
  /** Décalage du clignotement. */
  phase: number
}

interface HullParts {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  lights: NavLight[]
  /** Poupe : bord ouest de la coque, au milieu (tuyères). */
  stern: number
}

let parts: HullParts | null = null

/** Corps de la coque, construit une fois pour tous les ponts. */
function hullParts(): HullParts {
  if (parts) return parts
  // Silhouette : l'empreinte des ponts, élargie d'une tuile, creux comblés (fermeture).
  const cells = erode(dilate(dilate(footprint(), 1), 1), 1)
  const loops = outlines(cells).map((l) => smooth(l, SMOOTHING))
  loops.sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)))
  const [outer, ...holes] = loops
  // Forme dans le plan (x, -z) : extrudée vers le haut une fois tournée (cf. plus bas).
  const shape = new THREE.Shape(outer.map((p) => new THREE.Vector2(p.x, -p.y)))
  for (const h of holes) shape.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p.x, -p.y))))
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: DEPTH - 2 * BEVEL, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelOffset: -BEVEL, bevelSegments: 1, curveSegments: 1 })
  // (x, y, z) → (x, z, -y) : la forme se couche dans le plan du pont, l'épaisseur vers le haut.
  geometry.rotateX(-Math.PI / 2)
  geometry.translate(0, HULL_TOP - DEPTH + BEVEL, 0)
  // Coordonnées de texture en mètres, une plaque toutes les deux tuiles.
  const uv = geometry.getAttribute('uv')
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2)
  const material = new THREE.MeshLambertMaterial({ map: platingTexture() })

  // Feux : un tous les ~4 m sur le pourtour, rouge au nord, vert au sud, blanc à la poupe.
  const xs = outer.map((p) => p.x), zs = outer.map((p) => p.y)
  const minX = Math.min(...xs), midZ = (Math.min(...zs) + Math.max(...zs)) / 2
  const lights: NavLight[] = []
  let run = 0
  outer.forEach((p, i) => {
    const q = outer[(i + 1) % outer.length]
    const len = p.distanceTo(q)
    for (let t = (4 - run) % 4; t < len; t += 4) {
      const at = p.clone().lerp(q, t / len)
      const stern = at.x < minX + 1.5
      const color = stern ? '#ffffff' : at.y < midZ ? '#ff3b2f' : '#4dff7a'
      lights.push({ x: at.x, z: at.y, color, phase: (at.x * 0.37 + at.y * 0.11) % 1 })
    }
    run = (run + len) % 4
  })
  // Le feu de proue, à la pointe.
  const bow = outer.reduce((b, p) => (p.x > b.x ? p : b), outer[0])
  lights.push({ x: bow.x - 0.2, z: bow.y, color: '#ffffff', phase: 0.5 })
  return (parts = { geometry, material, lights, stern: minX })
}

/** Hauteur des feux : à la taille de la coque, là où elle est la plus large. */
const LAMP_Y = HULL_TOP - BEVEL

/** La coque sous un pont : le corps (fusionné une fois), ses feux, qui clignotent. */
export class Hull {
  readonly group = new THREE.Group()
  private lamps: THREE.InstancedMesh
  private phases: number[]

  constructor() {
    const p = hullParts()
    const body = new THREE.Mesh(p.geometry, p.material)
    body.receiveShadow = true
    this.group.add(body)
    this.lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial(), p.lights.length)
    const m = new THREE.Matrix4()
    const c = new THREE.Color()
    p.lights.forEach((l, i) => {
      this.lamps.setMatrixAt(i, m.makeTranslation(l.x, LAMP_Y, l.z))
      this.lamps.setColorAt(i, c.set(l.color))
    })
    this.phases = p.lights.map((l) => l.phase)
    this.group.add(this.lamps)
  }

  /** Poupe de la coque (x du bord ouest) : les tuyères y sont fixées. */
  static get stern(): number {
    return hullParts().stern
  }

  /** Feux qui clignotent : un éclat bref toutes les deux secondes (fixes en mode léger). */
  update(t: number) {
    if (renderQuality.light) return
    const m = new THREE.Matrix4()
    const p = hullParts()
    for (let i = 0; i < this.phases.length; i++) {
      const on = ((t * 0.5 + this.phases[i]) % 1) < 0.18
      const s = on ? 1.6 : 0.7
      m.makeScale(s, s, s).setPosition(p.lights[i].x, LAMP_Y, p.lights[i].z)
      this.lamps.setMatrixAt(i, m)
    }
    this.lamps.instanceMatrix.needsUpdate = true
  }
}
