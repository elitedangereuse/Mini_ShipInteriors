import type * as THREE from 'three'

/*
 * Faces confondues d'un meuble. Deux pièces qui se recouvrent sur un même plan (le flanc d'une
 * étagère et celui d'un livre qui l'affleure, le dessus d'un meuble et son plateau, un écran posé
 * à plat sur sa console) se disputent les mêmes pixels : faute d'écart de profondeur, le gagnant
 * change d'un pixel à l'autre, et avec l'angle de vue. La surface « grésille » quand la caméra
 * bouge ou tourne, alors qu'à l'arrêt elle avait l'air juste.
 *
 * Avant la fusion d'un meuble (cf. compact dans kit.ts), on repère sur chaque plan les triangles
 * qui en recouvrent un autre, d'une autre couleur, posé avant eux et tourné du même côté ; on les
 * avance d'un demi-millimètre (par couche) le long de leur normale. La pièce posée après (le
 * détail, l'étiquette, le liseré) passe devant, toujours : c'est ce que l'on voyait le plus
 * souvent, sans le grésillement.
 *
 * Tout le mobilier du vaisseau passe par là au démarrage (un million de triangles) : les faces
 * sont rangées dans des tableaux typés, réutilisés d'un meuble à l'autre, sans un objet par face.
 */

/** Avancée d'une couche (mètres) : invisible, même de près, mais bien plus que l'erreur de profondeur. */
const STEP = 0.0005
/** Épaisseur d'un plan (mètres) : deux faces plus proches que ça sont confondues. */
const SLAB = 0.0003
/** Finesse de l'orientation d'un plan : deux normales plus proches que ça sont les mêmes. */
const TURN = 1000
/** Plans trop chargés : on ne compare pas tout à tout (un tapis de milliers de brins). */
const CROWD = 1500
/** Chaque face est rétrécie d'un poil vers son centre : se toucher par un bord ne compte pas. */
const SHRINK = 0.97

/** Une pièce : sa géométrie non indexée (repère du meuble), et la teinte de chacun de ses triangles. */
export interface Piece {
  geometry: THREE.BufferGeometry
  color: (triangle: number) => number
}

/**
 * Faces rangées : par face, ses trois sommets dans le plan (x, y), puis son emprise (min x, max x,
 * min y, max y) ; sa teinte, son côté (+1, -1) et sa couche à part.
 */
const STRIDE = 10
let coords = new Float64Array(STRIDE * 4096)
let tints = new Int32Array(4096)
let sides = new Int8Array(4096)
let layers = new Int32Array(4096)

function reserve(count: number) {
  if (tints.length >= count) return
  const size = Math.max(count, tints.length * 2)
  coords = new Float64Array(size * STRIDE)
  tints = new Int32Array(size)
  sides = new Int8Array(size)
  layers = new Int32Array(size)
}

/** Étendue de la face `f` le long de (nx, ny), dans LOW et HIGH. */
let LOW = 0, HIGH = 0
function extent(f: number, nx: number, ny: number) {
  const o = f * STRIDE
  const a = coords[o] * nx + coords[o + 1] * ny, b = coords[o + 2] * nx + coords[o + 3] * ny, c = coords[o + 4] * nx + coords[o + 5] * ny
  LOW = a < b ? (a < c ? a : c) : b < c ? b : c
  HIGH = a > b ? (a > c ? a : c) : b > c ? b : c
}

/** Un côté de la face `p` la sépare-t-il de la face `q` ? */
function sideSeparates(p: number, q: number): boolean {
  const o = p * STRIDE
  for (let k = 0; k < 3; k++) {
    const m = (k + 1) % 3
    const nx = coords[o + k * 2 + 1] - coords[o + m * 2 + 1], ny = coords[o + m * 2] - coords[o + k * 2]
    extent(p, nx, ny)
    const low = LOW, high = HIGH
    extent(q, nx, ny)
    if (high <= LOW || HIGH <= low) return true
  }
  return false
}

/**
 * Avance, dans l'ordre où les pièces ont été posées, les triangles qui en recouvrent un autre
 * sur le même plan (cf. plus haut). Modifie les positions des géométries ; renvoie le nombre de
 * triangles avancés.
 */
export function separateCoplanar(pieces: Piece[]): number {
  let total = 0
  for (const piece of pieces) total += piece.geometry.getAttribute('position').count / 3
  reserve(total)
  /** Plans : orientation (normale arrondie, sans son sens) et tranche de profondeur → leurs faces. */
  const planes = new Map<number, number[]>()
  // Une normale arrondie au millième par composante (2001 valeurs chacune), puis la tranche.
  const key = (qx: number, qy: number, qz: number, slab: number) => (((qx + TURN) * 2001 + qy + TURN) * 2001 + qz + TURN) * 262144 + (slab & 262143)
  let faces = 0, moved = 0
  for (const piece of pieces) {
    const pos = piece.geometry.getAttribute('position') as THREE.BufferAttribute
    const a = pos.array as Float32Array
    let dirty = false
    for (let t = 0, n = pos.count / 3; t < n; t++) {
      const o = t * 9
      const ux = a[o + 3] - a[o], uy = a[o + 4] - a[o + 1], uz = a[o + 5] - a[o + 2]
      const vx = a[o + 6] - a[o], vy = a[o + 7] - a[o + 1], vz = a[o + 8] - a[o + 2]
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
      if (len < 1e-10) continue
      nx /= len
      ny /= len
      nz /= len
      // Le plan sans son sens (première composante non nulle positive), et le côté où la face regarde.
      const lead = nx > 1e-4 || nx < -1e-4 ? nx : ny > 1e-4 || ny < -1e-4 ? ny : nz
      const facing = lead > 0 ? 1 : -1
      const px = nx * facing, py = ny * facing, pz = nz * facing
      const depth = (px * (a[o] + a[o + 3] + a[o + 6]) + py * (a[o + 1] + a[o + 4] + a[o + 7]) + pz * (a[o + 2] + a[o + 5] + a[o + 8])) / 3
      const slab = Math.round(depth / SLAB)
      const qx = Math.round(px * TURN), qy = Math.round(py * TURN), qz = Math.round(pz * TURN)
      // Les deux axes du plan : ceux qui ne sont pas l'axe dominant de la normale.
      const ex = nx < 0 ? -nx : nx, ey = ny < 0 ? -ny : ny, ez = nz < 0 ? -nz : nz
      const dominant = ex >= ey && ex >= ez ? 0 : ey >= ez ? 1 : 2
      const i = dominant === 0 ? 1 : 0, j = dominant === 2 ? 1 : 2
      const gx = (a[o + i] + a[o + 3 + i] + a[o + 6 + i]) / 3, gy = (a[o + j] + a[o + 3 + j] + a[o + 6 + j]) / 3
      const f = faces++
      const c = f * STRIDE
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      for (let k = 0; k < 3; k++) {
        const x = gx + (a[o + k * 3 + i] - gx) * SHRINK, y = gy + (a[o + k * 3 + j] - gy) * SHRINK
        coords[c + k * 2] = x
        coords[c + k * 2 + 1] = y
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
      coords[c + 6] = minX
      coords[c + 7] = maxX
      coords[c + 8] = minY
      coords[c + 9] = maxY
      const tint = (tints[f] = piece.color(t))
      sides[f] = facing
      let layer = 0
      // Les faces déjà posées sur ce plan (et sur ses deux voisins, à la limite d'une tranche).
      for (let d = -1; d <= 1; d++) {
        const list = planes.get(key(qx, qy, qz, slab + d))
        if (!list || list.length > CROWD) continue
        for (let l = 0; l < list.length; l++) {
          const g = list[l], e = g * STRIDE
          if (tints[g] === tint || sides[g] !== facing || layers[g] < layer) continue
          if (coords[e + 7] <= minX || maxX <= coords[e + 6] || coords[e + 9] <= minY || maxY <= coords[e + 8]) continue
          if (sideSeparates(f, g) || sideSeparates(g, f)) continue
          layer = layers[g] + 1
        }
      }
      layers[f] = layer
      if (layer) {
        // Le long de sa normale, vers celui qui la regarde.
        const shift = layer * STEP
        for (let k = 0; k < 3; k++) {
          a[o + k * 3] += nx * shift
          a[o + k * 3 + 1] += ny * shift
          a[o + k * 3 + 2] += nz * shift
        }
        dirty = true
        moved++
      }
      const at = key(qx, qy, qz, slab)
      const list = planes.get(at)
      if (list) list.push(f)
      else planes.set(at, [f])
    }
    if (dirty) pos.needsUpdate = true
  }
  return moved
}
