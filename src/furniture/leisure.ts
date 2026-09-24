import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  animatedScreen, barX, box, compact, cylinder, drawnTexture, glow, holoMaterial, lit, mesh, part, sphere, type Builder,
} from './kit'
import { COBRA_EDGES, COBRA_VERTICES } from './cobra'

/*
 * Pont principal : infirmerie, salle de sport et salon d'arcade.
 */

const C = {
  white: '#e8edf1',
  whiteDark: '#aeb8c2',
  teal: '#3fa89c',
  tealLight: '#cfe9e6',
  medGreen: '#39d98a',
  rubber: '#23262c',
  black: '#15161a',
  chrome: '#b9c1cc',
  gymRed: '#c8373a',
  padding: '#1d1f24',
}

// ---------------------------------------------------------------- infirmerie

/** Tracé d'électrocardiogramme (onde P, complexe QRS, onde T) ; `p` dans [0, 1[. */
function heartbeat(p: number): number {
  if (p > 0.1 && p < 0.14) return 0.2 * Math.sin(((p - 0.1) / 0.04) * Math.PI)
  if (p > 0.2 && p < 0.22) return -0.2
  if (p >= 0.22 && p < 0.25) return 1
  if (p >= 0.25 && p < 0.27) return -0.35
  if (p > 0.4 && p < 0.5) return 0.3 * Math.sin(((p - 0.4) / 0.1) * Math.PI)
  return 0
}

/** Lit médical : arche de scanner, moniteur cardiaque animé (à droite, ou à gauche si `label` = left). */
const medBed: Builder = ({ label }) => {
  const side = label === 'left' ? -0.33 : 0.33
  const g = new THREE.Group()
  g.add(box(0.55, 0.2, 1.1, lit(C.white), 0, 0.12, 0, 0.03), box(0.45, 0.04, 1.0, lit(C.whiteDark), 0, 0.02, 0))
  g.add(box(0.5, 0.07, 1.0, lit(C.tealLight), 0, 0.255, 0, 0.03), box(0.36, 0.06, 0.18, lit('#ffffff'), 0, 0.31, -0.38, 0.03))
  g.add(box(0.52, 0.03, 0.5, lit(C.teal), 0, 0.3, 0.2, 0.01))
  // Arche du scanner.
  const arch = mesh(new THREE.TorusGeometry(0.34, 0.035, 6, 20, Math.PI), lit(C.white), 0, 0.12, -0.05)
  const halo = mesh(new THREE.TorusGeometry(0.34, 0.012, 4, 20, Math.PI), glow('#5ff2d8'), 0, 0.12, -0.02)
  g.add(arch, halo)
  // Moniteur sur pied.
  g.add(cylinder(0.012, 0.012, 0.62, lit(C.whiteDark), side, 0.31, -0.45, 6), box(0.26, 0.17, 0.04, lit(C.white), side, 0.66, -0.45, 0.015))
  const ecg = animatedScreen(64, 40, 15, (c, t) => {
    c.fillStyle = '#04110c'
    c.fillRect(0, 0, 64, 40)
    c.strokeStyle = '#39ff8a'
    c.lineWidth = 1.5
    c.beginPath()
    for (let x = 0; x < 64; x++) {
      const p = ((((x / 64) * 2 - t * 1.2) % 1) + 1) % 1
      const y = 24 - heartbeat(p) * 15
      if (x) c.lineTo(x, y)
      else c.moveTo(x, y)
    }
    c.stroke()
    c.fillStyle = '#39ff8a'
    c.font = '9px monospace'
    c.fillText('72', 48, 10)
  })
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(0.22, 0.13), new THREE.MeshBasicMaterial({ map: ecg.texture }), side, 0.66, -0.428))
  return { solid: g, live, update: (t) => ecg.tick(t) }
}

/** Scanner corporel : un hologramme d'humain qui tourne, parcouru par un anneau de balayage. */
const bodyScan: Builder = () => {
  const g = new THREE.Group()
  g.add(cylinder(0.28, 0.32, 0.12, lit(C.white), 0, 0.06, 0, 18))
  const ring = mesh(new THREE.TorusGeometry(0.25, 0.016, 5, 28), glow('#5ff2d8'), 0, 0.125, 0)
  ring.rotation.x = Math.PI / 2
  g.add(ring)
  // Silhouette : quelques volumes fusionnés ; les « uv » suivent la hauteur, pour des lignes de balayage horizontales.
  const pieces: THREE.BufferGeometry[] = [
    new THREE.IcosahedronGeometry(0.055, 1).translate(0, 0.5, 0),
    new THREE.BoxGeometry(0.15, 0.18, 0.07).translate(0, 0.36, 0),
    new THREE.BoxGeometry(0.12, 0.06, 0.07).translate(0, 0.245, 0),
    new THREE.BoxGeometry(0.05, 0.22, 0.05).translate(-0.035, 0.11, 0),
    new THREE.BoxGeometry(0.05, 0.22, 0.05).translate(0.035, 0.11, 0),
    new THREE.BoxGeometry(0.035, 0.18, 0.035).rotateZ(0.12).translate(-0.1, 0.33, 0),
    new THREE.BoxGeometry(0.035, 0.18, 0.035).rotateZ(-0.12).translate(0.1, 0.33, 0),
  ].map((p) => (p.index ? p.toNonIndexed() : p))
  const body = mergeGeometries(pieces)!
  const pos = body.attributes.position
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) uv.set([pos.getX(i) + 0.5, pos.getY(i) / 0.56], i * 2)
  body.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  const live = new THREE.Group()
  const figure = part(body, holoMaterial(null, '#5ff2d8', 0.5), 0, 0.14, 0)
  const scan = part(new THREE.TorusGeometry(0.14, 0.006, 4, 32), glow('#aefcf0'), 0, 0.3, 0)
  scan.rotation.x = Math.PI / 2
  live.add(figure, scan)
  return {
    solid: g,
    live,
    update: (t) => {
      figure.rotation.y = t * 0.6
      scan.position.y = 0.16 + (0.5 + 0.5 * Math.sin(t * 1.4)) * 0.52
    },
  }
}

/** Armoire à pharmacie, croix verte lumineuse. */
const medCabinet: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.6, 0.85, 0.3, lit(C.white), 0, 0.425, 0, 0.02))
  for (const x of [-0.145, 0.145]) g.add(box(0.27, 0.66, 0.01, lit('#f6f8fa'), x, 0.46, 0.152), box(0.015, 0.08, 0.015, lit(C.whiteDark), x > 0 ? 0.03 : -0.03, 0.46, 0.162))
  g.add(box(0.2, 0.06, 0.01, glow(C.medGreen), 0, 0.72, 0.16), box(0.06, 0.2, 0.01, glow(C.medGreen), 0, 0.72, 0.16))
  g.add(box(0.6, 0.06, 0.3, lit(C.whiteDark), 0, 0.03, 0))
  return { solid: g }
}

// ---------------------------------------------------------------- salle de sport

/** Tapis de course, console à l'avant (+z). */
const treadmill: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.5, 0.08, 1.2, lit(C.rubber), 0, 0.06, 0, 0.02), box(0.4, 0.02, 1.08, lit(C.black), 0, 0.11, -0.02))
  for (const x of [-0.23, 0.23]) {
    const post = box(0.04, 0.62, 0.05, lit(C.chrome), x, 0.39, 0.5)
    post.rotation.x = -0.18
    g.add(post, box(0.03, 0.03, 0.4, lit(C.chrome), x, 0.55, 0.36))
  }
  const console_ = box(0.46, 0.05, 0.16, lit(C.rubber), 0, 0.7, 0.55, 0.02)
  console_.rotation.x = 0.5
  g.add(console_, box(0.2, 0.012, 0.08, glow('#39e0ff'), 0, 0.73, 0.56))
  return { solid: g }
}

/** Vélo d'appartement. */
const exerciseBike: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.36, 0.03, 0.7, lit(C.rubber), 0, 0.015, 0))
  g.add(barX(0.15, 0.06, lit(C.rubber), 0, 0.2, 0.2, 18), barX(0.06, 0.07, lit(C.gymRed), 0, 0.2, 0.2, 10))
  const frame = box(0.06, 0.5, 0.06, lit(C.gymRed), 0, 0.3, -0.05)
  frame.rotation.x = -0.35
  g.add(frame, box(0.05, 0.3, 0.05, lit(C.gymRed), 0, 0.2, 0.3))
  g.add(box(0.16, 0.04, 0.2, lit(C.padding), 0, 0.5, -0.12, 0.02), box(0.3, 0.03, 0.03, lit(C.chrome), 0, 0.56, 0.3))
  g.add(box(0.12, 0.08, 0.02, lit(C.rubber), 0, 0.52, 0.34), box(0.08, 0.04, 0.004, glow('#39e0ff'), 0, 0.53, 0.352))
  return { solid: g }
}

/** Banc de développé couché, barre et disques sur le rack. */
const weightBench: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.28, 0.08, 0.9, lit(C.padding), 0, 0.3, 0.1, 0.03), box(0.2, 0.26, 0.06, lit(C.chrome), 0, 0.13, 0.45), box(0.2, 0.26, 0.06, lit(C.chrome), 0, 0.13, -0.25))
  for (const x of [-0.22, 0.22]) g.add(box(0.05, 0.78, 0.05, lit(C.chrome), x, 0.39, -0.42), box(0.07, 0.04, 0.08, lit(C.gymRed), x, 0.7, -0.4))
  g.add(barX(0.015, 1.1, lit(C.chrome), 0, 0.73, -0.4, 8))
  for (const x of [-0.45, -0.39, 0.39, 0.45]) g.add(barX(Math.abs(x) > 0.42 ? 0.1 : 0.13, 0.04, lit(Math.abs(x) > 0.42 ? C.gymRed : C.black), x, 0.73, -0.4, 16))
  return { solid: g }
}

/** Râtelier d'haltères (0,9 m le long de x). */
const dumbbellRack: Builder = () => {
  const g = new THREE.Group()
  for (const x of [-0.42, 0.42]) g.add(box(0.04, 0.42, 0.3, lit(C.rubber), x, 0.21, 0))
  for (const [y, z] of [[0.2, 0.06], [0.38, -0.06]] as const) {
    const shelf = box(0.84, 0.03, 0.16, lit(C.rubber), 0, y, z)
    shelf.rotation.x = 0.25
    g.add(shelf)
    for (let i = 0; i < 4; i++) {
      const x = -0.3 + i * 0.2, r = 0.035 + i * 0.006
      g.add(barX(0.01, 0.16, lit(C.chrome), x, y + 0.05, z, 6))
      for (const dx of [-0.07, 0.07]) g.add(barX(r, 0.04, lit(i % 2 ? C.black : C.gymRed), x + dx, y + 0.05, z, 8))
    }
  }
  return { solid: g }
}

/** Sac de frappe sur potence ; il se balance doucement. */
const punchingBag: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.5, 0.03, 0.5, lit(C.rubber), 0, 0.015, -0.2), box(0.06, 1.05, 0.06, lit(C.chrome), 0, 0.525, -0.38), box(0.05, 0.05, 0.42, lit(C.chrome), 0, 1.02, -0.18))
  const live = new THREE.Group()
  const pivot = new THREE.Group()
  pivot.position.set(0, 1.0, 0)
  pivot.add(part(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 4), lit(C.chrome), 0, -0.1, 0))
  const model = new THREE.Group()
  model.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.45, 14), lit(C.gymRed)))
  for (const y of [-0.16, 0.16]) model.add(mesh(new THREE.CylinderGeometry(0.143, 0.143, 0.04, 14), lit(C.black), 0, y, 0))
  const bag = compact(model)
  bag.position.y = -0.42
  pivot.add(bag)
  live.add(pivot)
  return {
    solid: g,
    live,
    update: (t) => {
      pivot.rotation.x = Math.sin(t * 1.9) * 0.06
      pivot.rotation.z = Math.sin(t * 1.3 + 1) * 0.04
    },
  }
}

// ---------------------------------------------------------------- arcade

type Draw = (c: CanvasRenderingContext2D, t: number) => void

const W = 96, H = 80

/** Projection de la Cobra Mk III en fil de fer (façon Elite, 1984). */
const drawElite: Draw = (c, t) => {
  c.fillStyle = '#000'
  c.fillRect(0, 0, W, H)
  // Étoiles qui défilent.
  c.fillStyle = '#9aa'
  for (let i = 0; i < 18; i++) {
    const x = (i * 37 + t * (8 + (i % 3) * 6)) % W
    c.fillRect(W - x, (i * 23) % 50, 1, 1)
  }
  const ay = t * 0.9, ax = 0.35 + Math.sin(t * 0.6) * 0.25
  const pts = COBRA_VERTICES.map(([x, y, z]) => {
    const x1 = x * Math.cos(ay) - z * Math.sin(ay), z1 = x * Math.sin(ay) + z * Math.cos(ay)
    const y1 = y * Math.cos(ax) - z1 * Math.sin(ax), z2 = y * Math.sin(ax) + z1 * Math.cos(ax)
    const k = 34 / (z2 + 3)
    return [W / 2 + x1 * k, 26 - y1 * k] as const
  })
  c.strokeStyle = '#f2f2f2'
  c.lineWidth = 1
  c.beginPath()
  for (const [a, b] of COBRA_EDGES) {
    c.moveTo(pts[a][0], pts[a][1])
    c.lineTo(pts[b][0], pts[b][1])
  }
  c.stroke()
  // Tableau de bord : le scanner elliptique d'origine.
  c.strokeStyle = '#e8c33a'
  c.beginPath()
  c.ellipse(W / 2, 64, 26, 9, 0, 0, Math.PI * 2)
  c.stroke()
  c.fillStyle = '#e8c33a'
  c.fillRect(W / 2 + Math.cos(t) * 16, 64 + Math.sin(t) * 5, 2, 2)
  c.fillStyle = '#6f6'
  c.font = '7px monospace'
  c.fillText('JAMESON', 3, 8)
}

/** Des Thargoïdes (octogones) qui descendent, un canon qui tire. */
const drawInvaders: Draw = (c, t) => {
  c.fillStyle = '#000'
  c.fillRect(0, 0, W, H)
  const dx = Math.sin(t * 0.8) * 12, dy = (Math.floor(t / 3) % 5) * 2
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 5; col++) {
      const x = 16 + col * 16 + dx, y = 12 + row * 12 + dy, r = 4 + (Math.floor(t * 4) % 2)
      c.fillStyle = row === 0 ? '#ff5ad8' : '#6dff7a'
      c.beginPath()
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + Math.PI / 8, rr = k % 2 ? r : r * 0.6
        if (k) c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
        else c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
      }
      c.fill()
    }
  }
  const px = W / 2 + Math.sin(t * 1.3) * 30
  c.fillStyle = '#39e0ff'
  c.fillRect(px - 5, 70, 10, 4)
  c.fillRect(px - 1, 67, 2, 3)
  const shot = (t * 70) % 60
  c.fillStyle = '#fff'
  c.fillRect(px - 0.5, 66 - shot, 1, 4)
  c.font = '7px monospace'
  c.fillText('1984', 3, 8)
}

const ROCKS = Array.from({ length: 5 }, (_, i) => ({
  x: (i * 29) % W, y: (i * 41) % H, vx: ((i % 3) - 1) * 6 + 3, vy: ((i % 2) * 2 - 1) * 5, r: 5 + (i % 3) * 3,
  shape: Array.from({ length: 9 }, (_, k) => 0.7 + (((i * 7 + k * 13) % 10) / 10) * 0.5),
}))

/** Astéroïdes vectoriels qui dérivent, un vaisseau qui tourne et tire. */
const drawAsteroids: Draw = (c, t) => {
  c.fillStyle = '#000'
  c.fillRect(0, 0, W, H)
  c.strokeStyle = '#f2f2f2'
  c.lineWidth = 1
  for (const r of ROCKS) {
    const x = (((r.x + r.vx * t) % W) + W) % W, y = (((r.y + r.vy * t) % H) + H) % H
    c.beginPath()
    r.shape.forEach((k, i) => {
      const a = (i / r.shape.length) * Math.PI * 2 + t * 0.3
      if (i) c.lineTo(x + Math.cos(a) * r.r * k, y + Math.sin(a) * r.r * k)
      else c.moveTo(x + Math.cos(a) * r.r * k, y + Math.sin(a) * r.r * k)
    })
    c.closePath()
    c.stroke()
  }
  const a = t * 1.1, sx = W / 2, sy = H / 2
  c.beginPath()
  c.moveTo(sx + Math.cos(a) * 6, sy + Math.sin(a) * 6)
  c.lineTo(sx + Math.cos(a + 2.5) * 5, sy + Math.sin(a + 2.5) * 5)
  c.lineTo(sx + Math.cos(a - 2.5) * 5, sy + Math.sin(a - 2.5) * 5)
  c.closePath()
  c.stroke()
  const d = ((t * 60) % 40) + 8
  c.fillStyle = '#fff'
  c.fillRect(sx + Math.cos(a - 0.6) * d, sy + Math.sin(a - 0.6) * d, 1.5, 1.5)
}

const GAMES: Record<string, { title: string; side: string; neon: string; draw: Draw }> = {
  elite: { title: 'ELITE', side: '#1f3f8a', neon: '#39e0ff', draw: drawElite },
  invaders: { title: 'THARGOID INVADERS', side: '#4a1f6a', neon: '#ff4fd8', draw: drawInvaders },
  asteroids: { title: 'ASTÉROÏDES', side: '#7a1f1f', neon: '#ffe14f', draw: drawAsteroids },
}

function marquee(title: string, neon: string): THREE.Texture {
  return drawnTexture(256, 64, (c) => {
    const grad = c.createLinearGradient(0, 0, 256, 0)
    grad.addColorStop(0, '#12081f')
    grad.addColorStop(0.5, '#2a1440')
    grad.addColorStop(1, '#12081f')
    c.fillStyle = grad
    c.fillRect(0, 0, 256, 64)
    c.font = `800 ${title.length > 10 ? 24 : 38}px system-ui, sans-serif`
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.shadowColor = neon
    c.shadowBlur = 12
    c.fillStyle = '#fff'
    c.fillText(title, 128, 34)
  })
}

/** Borne d'arcade jouable (écran animé). Jeux : `elite`, `invaders`, `asteroids`. */
const arcade: Builder = ({ label = 'elite' }) => {
  const game = GAMES[label] ?? GAMES.elite
  const g = new THREE.Group()
  const side = lit(game.side), black = lit('#121318')
  for (const x of [-0.285, 0.285]) g.add(box(0.05, 0.95, 0.52, side, x, 0.475, 0))
  g.add(box(0.52, 0.95, 0.04, black, 0, 0.475, -0.24), box(0.52, 0.42, 0.3, black, 0, 0.21, 0.09))
  g.add(box(0.52, 0.025, 0.02, glow(game.neon), 0, 0.3, 0.245), box(0.06, 0.04, 0.012, glow('#ffd84f'), 0, 0.22, 0.246))
  // Pupitre incliné : joystick et trois boutons.
  const deck = new THREE.Group()
  deck.position.set(0, 0.47, 0.17)
  deck.rotation.x = 0.25
  deck.add(box(0.52, 0.05, 0.2, lit('#2a2a33'), 0, 0, 0))
  deck.add(cylinder(0.01, 0.01, 0.07, lit('#cfd3d8'), -0.12, 0.06, 0, 6), sphere(0.022, glow('#ff3b3b'), -0.12, 0.1, 0, 8))
  ;['#39e0ff', '#ffe14f', '#ff4fd8'].forEach((col, i) => deck.add(cylinder(0.018, 0.018, 0.015, glow(col), 0.04 + i * 0.06, 0.03, 0, 10)))
  g.add(deck)
  // Écran incliné dans son cadre, fronton.
  const bezel = new THREE.Group()
  bezel.position.set(0, 0.67, 0.02)
  bezel.rotation.x = -0.18
  bezel.add(box(0.52, 0.34, 0.04, black, 0, 0, 0))
  g.add(bezel, box(0.52, 0.14, 0.22, black, 0, 0.88, -0.07))

  const screen = animatedScreen(W, H, 12, game.draw)
  const live = new THREE.Group()
  const glass = new THREE.Group()
  glass.position.copy(bezel.position)
  glass.rotation.copy(bezel.rotation)
  glass.add(part(new THREE.PlaneGeometry(0.42, 0.3), new THREE.MeshBasicMaterial({ map: screen.texture }), 0, 0, 0.022))
  live.add(glass, part(new THREE.PlaneGeometry(0.5, 0.12), new THREE.MeshBasicMaterial({ map: marquee(game.title, game.neon) }), 0, 0.88, 0.042))
  return { solid: g, live, emitter: 'arcade', update: (t) => screen.tick(t) }
}

/** Enseigne au néon (texte : `label`), qui grésille de temps en temps. */
const neonSign: Builder = ({ label = 'ARCADE' }) => {
  const texture = drawnTexture(512, 160, (c) => {
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.font = '800 92px system-ui, sans-serif'
    c.shadowColor = '#ff4fd8'
    c.shadowBlur = 26
    c.fillStyle = '#ffd6f6'
    c.fillText(label, 256, 84)
    c.fillText(label, 256, 84)
    c.shadowColor = '#39e0ff'
    c.shadowBlur = 16
    c.strokeStyle = '#8ff4ff'
    c.lineWidth = 7
    c.beginPath()
    c.roundRect(14, 14, 484, 132, 30)
    c.stroke()
  })
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(0.9, 0.28), material, 0, 0.95, 0))
  return {
    live,
    update: (t) => {
      const crisis = Math.sin(t * 0.7) + Math.sin(t * 2.9) * 0.5 > 1.25
      material.opacity = crisis && Math.sin(t * 70) > 0 ? 0.35 : 1
    },
  }
}

export const LEISURE = {
  'med-bed': medBed,
  'body-scan': bodyScan,
  'med-cabinet': medCabinet,
  treadmill,
  'exercise-bike': exerciseBike,
  'weight-bench': weightBench,
  'dumbbell-rack': dumbbellRack,
  'punching-bag': punchingBag,
  arcade,
  'neon-sign': neonSign,
} satisfies Record<string, Builder>
