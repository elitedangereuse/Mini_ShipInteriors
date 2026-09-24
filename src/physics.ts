import type { Box2 } from './deck'

/** Repousse un cercle hors des rectangles de collision. Modifie `p` en place. */
export function resolveCircle(p: { x: number; z: number }, r: number, boxes: Box2[]) {
  for (let iter = 0; iter < 3; iter++) {
    let moved = false
    for (const b of boxes) {
      const cx = Math.max(b.minX, Math.min(p.x, b.maxX))
      const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ))
      const dx = p.x - cx
      const dz = p.z - cz
      const d2 = dx * dx + dz * dz
      if (d2 >= r * r) continue
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2)
        p.x += (dx / d) * (r - d)
        p.z += (dz / d) * (r - d)
      } else {
        // Centre à l'intérieur du rectangle : sortie par le côté le plus proche.
        const pushes = [
          [b.minX - r - p.x, 0],
          [b.maxX + r - p.x, 0],
          [0, b.minZ - r - p.z],
          [0, b.maxZ + r - p.z],
        ]
        pushes.sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]))
        p.x += pushes[0][0]
        p.z += pushes[0][1]
      }
      moved = true
    }
    if (!moved) break
  }
}

/** Vrai si un cercle de rayon r peut glisser en ligne droite de a à b sans rien toucher. */
export function clearPath(a: { x: number; z: number }, b: { x: number; z: number }, r: number, boxes: Box2[]): boolean {
  const len = Math.hypot(b.x - a.x, b.z - a.z)
  const steps = Math.max(1, Math.ceil(len / 0.08))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = a.x + (b.x - a.x) * t
    const z = a.z + (b.z - a.z) * t
    for (const box of boxes) {
      const cx = Math.max(box.minX, Math.min(x, box.maxX))
      const cz = Math.max(box.minZ, Math.min(z, box.maxZ))
      if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return false
    }
  }
  return true
}
