import * as THREE from 'three'

/*
 * Une Cobra Mk III très simplifiée, le vaisseau mythique d'Elite : un hexagone large et
 * plat (nez à +z), avec une arête dessus et une dessous. Sert à la maquette du bureau
 * (en facettes) et à la borne d'arcade (en fil de fer, comme en 1984).
 */

const OUTLINE: [number, number, number][] = [
  [-0.26, 0, 0.7], // nez gauche
  [0.26, 0, 0.7], // nez droit
  [1.0, -0.03, -0.3], // pointe d'aile droite
  [0.42, 0, -0.45], // arrière droit
  [-0.42, 0, -0.45], // arrière gauche
  [-1.0, -0.03, -0.3], // pointe d'aile gauche
]
const TOP: [number, number, number] = [0, 0.2, -0.1]
const BOTTOM: [number, number, number] = [0, -0.12, -0.05]

export const COBRA_VERTICES = [...OUTLINE, TOP, BOTTOM]

export const COBRA_EDGES: [number, number][] = [
  ...OUTLINE.map((_, i) => [i, (i + 1) % OUTLINE.length] as [number, number]),
  ...OUTLINE.map((_, i) => [i, 6] as [number, number]),
  [0, 7], [1, 7], [3, 7], [4, 7],
]

/** Géométrie en facettes (normales à plat), faces tournées vers l'extérieur. */
export function cobraGeometry(): THREE.BufferGeometry {
  const v = COBRA_VERTICES.map(([x, y, z]) => new THREE.Vector3(x, y, z))
  const inside = new THREE.Vector3(0, 0.03, -0.05)
  const pos: number[] = []
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a))
    const centroid = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3)
    if (n.dot(centroid.sub(inside)) < 0) [b, c] = [c, b]
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
  }
  for (let i = 0; i < OUTLINE.length; i++) {
    const j = (i + 1) % OUTLINE.length
    tri(v[i], v[j], v[6])
    tri(v[i], v[j], v[7])
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

// ---------------------------------------------------------------- maquette détaillée

/**
 * Coupes de la coque, du nez (+z) à la poupe : demi-envergure, puis l'épaule (où l'aile rejoint
 * le fuselage), le pont dorsal et la quille, chacun en demi-largeur et hauteur.
 */
const SECTIONS = [
  { z: 0.74, span: 0.3, sx: 0.27, sy: 0.02, dx: 0.16, dy: 0.035, bx: 0.24, by: -0.03 },
  { z: 0.46, span: 0.5, sx: 0.36, sy: 0.05, dx: 0.21, dy: 0.12, bx: 0.33, by: -0.07 },
  { z: 0.08, span: 0.8, sx: 0.43, sy: 0.08, dx: 0.27, dy: 0.2, bx: 0.43, by: -0.11 },
  { z: -0.3, span: 1, sx: 0.46, sy: 0.085, dx: 0.3, dy: 0.2, bx: 0.46, by: -0.12 },
  { z: -0.46, span: 1, sx: 0.46, sy: 0.085, dx: 0.3, dy: 0.19, bx: 0.46, by: -0.12 },
  { z: -0.6, span: 0.52, sx: 0.45, sy: 0.08, dx: 0.3, dy: 0.16, bx: 0.43, by: -0.1 },
]
/** Hauteur du bord d'attaque des ailes. */
const TIP_Y = -0.015

/** Contour de la coque vue de dessus (x, z), pour la graver sur une plaque. */
export const COBRA_PLAN: [number, number][] = [...SECTIONS.map((s): [number, number] => [s.span, s.z]), ...SECTIONS.map((s): [number, number] => [-s.span, s.z]).reverse()]

/**
 * Coque d'un Cobra Mk III, en facettes : un coin large et plat, le fuselage en dos d'âne, les
 * ailes qui s'élargissent jusqu'à la poupe (nez à +z, demi-envergure 1).
 */
export function cobraHullGeometry(): THREE.BufferGeometry {
  const rings = SECTIONS.map((s) => [
    [s.span, TIP_Y], [s.sx, s.sy], [s.dx, s.dy], [-s.dx, s.dy], [-s.sx, s.sy], [-s.span, TIP_Y], [-s.bx, s.by], [s.bx, s.by],
  ].map(([x, y]) => new THREE.Vector3(x, y, s.z)))
  const pos: number[] = []
  const inside = new THREE.Vector3()
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a))
    const centroid = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3)
    if (n.dot(centroid.sub(inside)) < 0) [b, c] = [c, b]
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
  }
  for (let k = 0; k < rings.length - 1; k++) {
    const a = rings[k], b = rings[k + 1]
    inside.set(0, 0.03, (SECTIONS[k].z + SECTIONS[k + 1].z) / 2)
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8
      tri(a[i], a[j], b[j])
      tri(a[i], b[j], b[i])
    }
  }
  // Le nez et la poupe, fermés en éventail.
  for (const k of [0, rings.length - 1]) {
    const centre = new THREE.Vector3(0, 0.02, SECTIONS[k].z)
    inside.set(0, 0.03, 0)
    for (let i = 0; i < 8; i++) tri(centre, rings[k][i], rings[k][(i + 1) % 8])
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}
