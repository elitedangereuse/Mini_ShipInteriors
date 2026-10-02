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

/**
 * Coque en facettes (normales à plat, faces tournées vers l'extérieur) : un contour à plat, relié
 * à une arête dessus et une dessous. Sert aussi aux vaisseaux du trafic (cf. traffic.ts).
 */
export function wedgeGeometry(outline: [number, number, number][], top: [number, number, number], bottom: [number, number, number]): THREE.BufferGeometry {
  const v = [...outline, top, bottom].map(([x, y, z]) => new THREE.Vector3(x, y, z))
  const n = outline.length
  const inside = new THREE.Vector3().addVectors(v[n], v[n + 1]).multiplyScalar(0.5)
  const pos: number[] = []
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a))
    const centroid = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3)
    if (normal.dot(centroid.sub(inside)) < 0) [b, c] = [c, b]
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    tri(v[i], v[j], v[n])
    tri(v[i], v[j], v[n + 1])
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

export const cobraGeometry = () => wedgeGeometry(OUTLINE, TOP, BOTTOM)
