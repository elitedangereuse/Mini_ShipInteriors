import * as THREE from 'three'
import { animatedScreen, box, cylinder, ED_ORANGE, glow, lit, mat, mesh, part, type Builder } from './kit'

/*
 * Le poste de pilotage agrandi : tableau de bord du pilote, consoles d'équipage, sièges du
 * copilote et du navigateur, fauteuil du commandant. Acier sombre et écrans orange d'Elite.
 */

/** Écran de tableau de bord (canvas animé à 6 images/s) : courbes, jauges et texte orange. */
function dashScreen(kind: 'nav' | 'sys' | 'comms' | 'scan', seed: number) {
  return animatedScreen(128, 80, 6, (g, t) => {
    g.fillStyle = '#140a02'
    g.fillRect(0, 0, 128, 80)
    g.strokeStyle = g.fillStyle = ED_ORANGE
    g.lineWidth = 2
    g.strokeRect(3, 3, 122, 74)
    g.globalAlpha = 0.9
    if (kind === 'nav') {
      // Cap et route : un cercle gradué qui tourne doucement.
      g.beginPath()
      g.arc(64, 40, 26, 0, Math.PI * 2)
      g.stroke()
      const a = t * 0.3 + seed
      g.beginPath()
      g.moveTo(64, 40)
      g.lineTo(64 + Math.cos(a) * 24, 40 + Math.sin(a) * 24)
      g.stroke()
      for (let i = 0; i < 12; i++) {
        const b = (i / 12) * Math.PI * 2
        g.fillRect(64 + Math.cos(b) * 30 - 1, 40 + Math.sin(b) * 30 - 1, 2, 2)
      }
    } else if (kind === 'sys') {
      // Jauges : boucliers, coque, carburant, chaleur.
      for (let i = 0; i < 4; i++) {
        const v = 0.55 + 0.4 * Math.abs(Math.sin(t * 0.4 + i * 1.7 + seed))
        g.globalAlpha = 0.3
        g.fillRect(12 + i * 28, 14, 18, 52)
        g.globalAlpha = 0.95
        g.fillRect(12 + i * 28, 14 + 52 * (1 - v), 18, 52 * v)
      }
    } else if (kind === 'comms') {
      // Messages qui défilent.
      for (let i = 0; i < 6; i++) {
        const w = 30 + ((i * 37 + Math.floor(t * 2) * 13 + seed * 7) % 70)
        g.fillRect(10, 12 + i * 10, w, 4)
      }
    } else {
      // Signal du scanner : une onde qui défile.
      g.beginPath()
      for (let x = 8; x < 120; x += 2) {
        const y = 40 + Math.sin(x * 0.12 + t * 3 + seed) * 12 * Math.sin(x * 0.03 + t * 0.7)
        if (x === 8) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.stroke()
    }
    g.globalAlpha = 1
  })
}

/** Écran incliné vers l'opérateur (côté +z), à la hauteur `y`, qui s'anime. */
function screen(live: THREE.Group, updates: ((t: number) => void)[], kind: Parameters<typeof dashScreen>[0], seed: number, x: number, y: number, z: number, w = 0.42, h = 0.26, tilt = -0.9) {
  const s = dashScreen(kind, seed)
  const p = part(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: s.texture }), x, y, z)
  p.rotation.x = tilt
  live.add(p)
  updates.push(s.tick)
}

/**
 * Tableau de bord du pilote (1,7 de large) : un pupitre en arc, quatre écrans animés, le
 * voyant du FSD. L'opérateur est côté +z.
 */
const helmConsole: Builder = () => {
  const g = new THREE.Group()
  const live = new THREE.Group()
  const updates: ((t: number) => void)[] = []
  // Pupitre en trois pans : le centre face au siège, les ailes orientées vers lui.
  const pans: [number, number][] = [[-0.62, 0.35], [0, 0], [0.62, -0.35]]
  for (const [x, a] of pans) {
    const pan = new THREE.Group()
    pan.add(box(0.62, 0.42, 0.34, mat.steelDark, 0, 0.21, 0, 0.03))
    const top = box(0.62, 0.05, 0.4, mat.steel, 0, 0.45, 0.02, 0.02)
    top.rotation.x = 0.35
    pan.add(top)
    pan.add(box(0.6, 0.025, 0.02, mat.trim, 0, 0.38, 0.19))
    pan.position.set(x, 0, Math.abs(x) * 0.28)
    pan.rotation.y = a
    g.add(pan)
  }
  // Boutons et manettes sur le pupitre central.
  for (let i = 0; i < 6; i++) g.add(box(0.035, 0.02, 0.035, i % 3 ? mat.lamp : mat.lampCyan, -0.2 + i * 0.08, 0.5, 0.1))
  g.add(box(0.05, 0.12, 0.05, mat.seat, 0.22, 0.52, 0.12, 0.015), box(0.02, 0.02, 0.02, mat.lampRed, 0.22, 0.59, 0.12))
  // Écrans, deux au centre, un sur chaque aile.
  screen(live, updates, 'nav', 0.1, -0.16, 0.66, -0.02, 0.3, 0.2)
  screen(live, updates, 'sys', 0.7, 0.16, 0.66, -0.02, 0.3, 0.2)
  for (const [x, z, a, kind] of [[-0.64, 0.16, 0.35, 'comms'], [0.64, 0.16, -0.35, 'scan']] as const) {
    const s = dashScreen(kind, x)
    const p = part(new THREE.PlaneGeometry(0.4, 0.24), new THREE.MeshBasicMaterial({ map: s.texture }), x, 0.64, z)
    p.rotation.set(-0.9, a, 0, 'YXZ')
    live.add(p)
    updates.push(s.tick)
  }
  return { solid: g, live, update: (t) => updates.forEach((u) => u(t)) }
}

/** Console d'équipage (0,8 de large) : un pupitre, deux écrans et une rangée de voyants. */
const sideConsole: Builder = ({ label = 'nav', random }) => {
  const g = new THREE.Group()
  const live = new THREE.Group()
  const updates: ((t: number) => void)[] = []
  g.add(box(0.8, 0.42, 0.34, mat.steelDark, 0, 0.21, 0, 0.03))
  const top = box(0.8, 0.05, 0.4, mat.steel, 0, 0.45, 0.02, 0.02)
  top.rotation.x = 0.35
  g.add(top, box(0.78, 0.025, 0.02, mat.trim, 0, 0.38, 0.19))
  for (let i = 0; i < 5; i++) g.add(box(0.03, 0.018, 0.03, random() < 0.5 ? mat.lamp : mat.lampGreen, -0.3 + i * 0.07, 0.49, 0.12))
  const kind = label === 'comms' ? 'comms' : label === 'scan' ? 'scan' : 'nav'
  screen(live, updates, kind, random() * 6, -0.17, 0.66, -0.03, 0.34, 0.22)
  screen(live, updates, kind === 'nav' ? 'sys' : 'nav', random() * 6, 0.19, 0.66, -0.03, 0.34, 0.22)
  return { solid: g, live, update: (t) => updates.forEach((u) => u(t)) }
}

/** Siège d'équipage (copilote, navigateur) : dossier haut, liserés orange, sans HOTAS. */
const crewSeat: Builder = () => {
  const g = new THREE.Group()
  g.add(cylinder(0.12, 0.16, 0.18, mat.steelDark, 0, 0.09, 0, 12))
  g.add(box(0.48, 0.11, 0.46, mat.seat, 0, 0.24, 0.02, 0.04))
  const back = box(0.48, 0.58, 0.11, mat.seat, 0, 0.55, -0.2, 0.05)
  back.rotation.x = -0.14
  g.add(back)
  for (const x of [-0.17, 0.17]) {
    const strip = box(0.03, 0.46, 0.02, mat.trim, x, 0.55, -0.14)
    strip.rotation.x = -0.14
    g.add(strip)
  }
  for (const x of [-0.27, 0.27]) g.add(box(0.07, 0.06, 0.38, mat.steel, x, 0.34, 0, 0.02))
  return { solid: g }
}

/**
 * Fauteuil du commandant, sur son estrade ronde : accoudoirs à écrans, repose-tête, et une
 * plaque « CMDR » sur le dossier.
 */
const commandChair: Builder = () => {
  const g = new THREE.Group()
  const live = new THREE.Group()
  g.add(cylinder(0.5, 0.54, 0.08, mat.steelDark, 0, 0.04, 0, 28))
  const ring = mesh(new THREE.TorusGeometry(0.5, 0.012, 6, 40), glow(ED_ORANGE), 0, 0.08, 0)
  ring.rotation.x = Math.PI / 2
  g.add(ring)
  g.add(cylinder(0.12, 0.16, 0.16, mat.steel, 0, 0.16, 0, 12))
  g.add(box(0.56, 0.12, 0.52, lit('#2a1a12'), 0, 0.3, 0.02, 0.05))
  const back = box(0.58, 0.7, 0.13, lit('#2a1a12'), 0, 0.68, -0.23, 0.06)
  back.rotation.x = -0.12
  g.add(back)
  g.add(box(0.34, 0.16, 0.12, lit('#2a1a12'), 0, 1.08, -0.3, 0.05))
  g.add(box(0.2, 0.05, 0.02, mat.trim, 0, 0.92, -0.22))
  for (const x of [-0.34, 0.34]) {
    g.add(box(0.12, 0.08, 0.5, mat.steel, x, 0.44, 0.02, 0.03))
    const pad = part(new THREE.PlaneGeometry(0.09, 0.14), glow('#ffb05c'), x, 0.49, 0.1)
    pad.rotation.x = -Math.PI / 2
    live.add(pad)
  }
  return { solid: g, live }
}

export const COCKPIT = {
  'helm-console': helmConsole,
  'side-console': sideConsole,
  'crew-seat': crewSeat,
  'command-chair': commandChair,
} satisfies Record<string, Builder>
