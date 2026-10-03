import * as THREE from 'three'
import { box, compact, cylinder, drawnTexture, lit, part, sphere, type Builder } from './kit'

/*
 * Le Zorb, la boîte de nuit des aliens, au bout du couloir de service de la cale : son enseigne
 * au néon, le cordon de la file d'attente, et les emplacements du videur, du DJ et des habitués
 * (les personnages sont ceux du Holo-Me, cf. src/club.ts).
 */

const C = {
  brass: '#c9a24a',
  rope: '#a3182c',
}

/**
 * Emplacement d'un alien du Zorb : son ombre au sol et son volume de clic et de collision. Le
 * personnage lui-même est un Mini Character du Holo-Me, posé dessus par src/club.ts (`label` :
 * son apparence, ex. « alien.male.c.blue »).
 */
const spot = (radius: number, height: number): Builder => () => {
  const g = new THREE.Group()
  g.add(cylinder(radius, radius, 0.004, lit('#101014'), 0, 0.002, 0, 14))
  return { solid: g, extent: new THREE.Box3(new THREE.Vector3(-radius, 0, -radius), new THREE.Vector3(radius, height, radius)) }
}

// ---------------------------------------------------------------- l'entrée

/** Enseigne au néon « LE ZORB », accrochée au mur : le tube grésille de temps en temps. */
const clubSign: Builder = ({ random }) => {
  const texture = drawnTexture(256, 96, (g) => {
    g.clearRect(0, 0, 256, 96)
    g.font = 'italic 900 52px Arial, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.shadowColor = '#ff3df0'
    g.shadowBlur = 14
    g.strokeStyle = '#ff7bf5'
    g.lineWidth = 3
    g.strokeText('LE ZORB', 128, 44)
    g.shadowColor = '#39ff9a'
    g.strokeStyle = '#8dffc4'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(34, 80)
    g.lineTo(222, 80)
    g.stroke()
  })
  const g = new THREE.Group()
  g.add(box(0.86, 0.34, 0.02, lit('#101014'), 0, 0.72, 0.01, 0.01))
  const live = new THREE.Group()
  const neon = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
  live.add(part(new THREE.PlaneGeometry(0.82, 0.31), neon, 0, 0.72, 0.023))
  const phase = random() * 20
  return {
    solid: g,
    live,
    update(t) {
      const u = (t + phase) % 9
      neon.opacity = u > 8.6 && Math.sin(u * 90) > 0 ? 0.35 : 0.92 + Math.sin(t * 3) * 0.08
    },
  }
}

/** Cordon de file d'attente : deux poteaux de laiton et une corde de velours. Longueur : `label` (m). */
const clubRope: Builder = ({ label }) => {
  const len = Math.min(3, Math.max(0.5, Number(label) || 1.2))
  const g = new THREE.Group()
  for (const side of [-1, 1]) {
    const x = (side * len) / 2
    g.add(cylinder(0.06, 0.07, 0.015, lit(C.brass), x, 0.008, 0, 14), cylinder(0.012, 0.012, 0.36, lit(C.brass), x, 0.19, 0, 8), sphere(0.024, lit(C.brass), x, 0.38, 0, 8))
  }
  // La corde pend entre les deux : une chaînette, en six tronçons.
  const n = 6
  const y = (k: number) => 0.34 - Math.sin(k * Math.PI) * 0.09
  for (let i = 0; i < n; i++) {
    const k0 = i / n, k1 = (i + 1) / n
    const x0 = (k0 - 0.5) * len, x1 = (k1 - 0.5) * len
    const seg = cylinder(0.014, 0.014, Math.hypot(x1 - x0, y(k1) - y(k0)), lit(C.rope), (x0 + x1) / 2, (y(k0) + y(k1)) / 2, 0, 6)
    seg.rotation.z = Math.atan2(y(k1) - y(k0), x1 - x0) + Math.PI / 2
    g.add(seg)
  }
  return { solid: compact(g) }
}

export const CLUB = {
  'club-bouncer': spot(0.2, 0.95),
  'club-dancer': spot(0.13, 0.75),
  'club-dj': spot(0.13, 0.75),
  'club-sign': clubSign,
  'club-rope': clubRope,
} satisfies Record<string, Builder>
