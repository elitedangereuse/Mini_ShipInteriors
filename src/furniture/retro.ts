import * as THREE from 'three'
import { tr } from '../i18n'
import { renderQuality } from '../quality'
import { COBRA_EDGES, COBRA_VERTICES } from './cobra'
import { animatedScreen, box, cylinder, drawnTexture, glow, lit, mesh, part, sphere, type Builder } from './kit'

/*
 * Écrans et consoles des quartiers : la télé cathodique (posée, ou sur pieds comme dans les
 * années 60) qui zappe toute seule, les consoles de salon et leur manette, la console portable,
 * le micro-ordinateur 8 bits où tourne le Cobra d'Elite (1984), le PC de joueur et ses
 * ventilateurs arc-en-ciel, une pile de cassettes vidéo. Tout est construit face à +z.
 */

const C = {
  black: '#16171b',
  plastic: '#2a2c33',
  grey: '#9fa3aa',
  greyLight: '#c9ccd1',
  beige: '#d8cfb8',
  beigeDark: '#b9ae93',
  chrome: '#c3c9d2',
  wood: '#6b4630',
  woodLight: '#8e6242',
}

// ---------------------------------------------------------------- télé cathodique

/** Coffrets de la télé : bois (défaut), beige, rouge, noir. */
const CRT_CASES: Record<string, { body: string; face: string }> = {
  wood: { body: C.wood, face: '#3b2a1f' },
  beige: { body: C.beige, face: C.beigeDark },
  red: { body: '#b8322a', face: '#7d1f1a' },
  black: { body: '#23262d', face: '#141519' },
}

/** Les chaînes que la télé enchaîne : quelques secondes chacune, avec de la neige entre deux. */
const CHANNEL = 5.5
const NOISE = 0.5

function snow(c: CanvasRenderingContext2D, w: number, h: number) {
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const v = Math.floor(Math.random() * 255)
      c.fillStyle = `rgb(${v},${v},${v})`
      c.fillRect(x, y, 2, 2)
    }
  }
}

function colorBars(c: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const bars = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0']
  bars.forEach((col, i) => {
    c.fillStyle = col
    c.fillRect((i * w) / bars.length, 0, w / bars.length + 1, h * 0.72)
  })
  c.fillStyle = '#111'
  c.fillRect(0, h * 0.72, w, h * 0.28)
  c.fillStyle = '#fff'
  c.font = 'bold 11px monospace'
  c.textAlign = 'center'
  c.fillText(Math.floor(t) % 2 ? 'LAVE TV' : '3310', w / 2, h * 0.9)
}

function galnet(c: CanvasRenderingContext2D, w: number, h: number, t: number) {
  c.fillStyle = '#0a1420'
  c.fillRect(0, 0, w, h)
  // Le présentateur : une silhouette devant une carte des Pléiades.
  c.fillStyle = '#12304a'
  c.fillRect(8, 10, w - 16, h - 38)
  c.fillStyle = '#6fd8ff'
  for (let i = 0; i < 7; i++) c.fillRect(60 + ((i * 37) % 50), 16 + ((i * 23) % 30), 2, 2)
  c.fillStyle = '#e2b28c'
  c.beginPath()
  c.arc(34, 34, 9, 0, Math.PI * 2)
  c.fill()
  c.fillStyle = '#2b3a55'
  c.fillRect(20, 44, 28, 14)
  // Bandeau défilant.
  c.fillStyle = '#ff8a1c'
  c.fillRect(0, h - 26, w, 12)
  c.fillStyle = '#111'
  c.fillRect(0, h - 14, w, 14)
  c.fillStyle = '#111'
  c.font = 'bold 9px sans-serif'
  c.textAlign = 'left'
  c.fillText('GALNET', 3, h - 17)
  c.fillStyle = '#ffd9a8'
  const news = tr('THARGOÏDES APERÇUS PRÈS DE MAIA · LA PAINITE S\'ENVOLE · HUTTON ORBITAL : RECORD DE VISITEURS (3) · ', 'THARGOIDS SIGHTED NEAR MAIA · PAINITE PRICES SOAR · HUTTON ORBITAL: RECORD VISITORS (3) · ')
  c.font = '9px sans-serif'
  const width = c.measureText(news).width || 400
  const x = w - ((t * 40) % (width + w))
  c.fillText(news, x, h - 4)
}

function pong(c: CanvasRenderingContext2D, w: number, h: number, t: number) {
  c.fillStyle = '#050805'
  c.fillRect(0, 0, w, h)
  c.fillStyle = '#b8ffb8'
  for (let y = 4; y < h; y += 10) c.fillRect(w / 2 - 1, y, 2, 5)
  // La balle rebondit dans un triangle d'allers-retours ; les raquettes la suivent.
  const bx = 10 + Math.abs(((t * 70) % ((w - 20) * 2)) - (w - 20))
  const by = 8 + Math.abs(((t * 47) % ((h - 16) * 2)) - (h - 16))
  c.fillRect(bx - 2, by - 2, 4, 4)
  c.fillRect(4, Math.min(h - 18, Math.max(0, by - 9)), 3, 18)
  c.fillRect(w - 7, Math.min(h - 18, Math.max(0, by - 9 + Math.sin(t * 3) * 6)), 3, 18)
  c.font = 'bold 12px monospace'
  c.textAlign = 'center'
  c.fillText(`${Math.floor(t / 7) % 10}`, w / 2 - 16, 14)
  c.fillText(`${Math.floor(t / 11) % 10}`, w / 2 + 16, 14)
}

function cartoon(c: CanvasRenderingContext2D, w: number, h: number, t: number) {
  // Dessin animé du samedi matin : Comète en combinaison, qui flotte parmi les étoiles.
  c.fillStyle = '#1c1446'
  c.fillRect(0, 0, w, h)
  c.fillStyle = '#fff'
  for (let i = 0; i < 24; i++) c.fillRect((i * 53 + t * 20) % w, (i * 29) % h, 1, 1)
  const x = w / 2 + Math.sin(t * 1.3) * 30, y = h / 2 + Math.cos(t * 1.7) * 12
  c.fillStyle = 'rgba(180,230,255,0.35)'
  c.beginPath()
  c.arc(x, y, 17, 0, Math.PI * 2)
  c.fill()
  c.fillStyle = '#8a8f99'
  c.beginPath()
  c.arc(x, y, 11, 0, Math.PI * 2)
  c.fill()
  c.beginPath()
  c.moveTo(x - 10, y - 5)
  c.lineTo(x - 7, y - 16)
  c.lineTo(x - 2, y - 9)
  c.moveTo(x + 10, y - 5)
  c.lineTo(x + 7, y - 16)
  c.lineTo(x + 2, y - 9)
  c.fill()
  c.fillStyle = '#9dff7a'
  c.fillRect(x - 6, y - 3, 3, 3)
  c.fillRect(x + 3, y - 3, 3, 3)
  c.fillStyle = '#ffd23c'
  c.font = 'bold 10px sans-serif'
  c.textAlign = 'center'
  c.fillText(tr('LES AVENTURES DE COMÈTE', 'COMÈTE\'S ADVENTURES'), w / 2, h - 6)
}

const CHANNELS = [colorBars, galnet, pong, cartoon]

/** Image de la télé à l'instant t : la chaîne en cours, un voile de lignes, un coin arrondi. */
function tvFrame(c: CanvasRenderingContext2D, t: number) {
  const { width: w, height: h } = c.canvas
  const k = t % CHANNEL
  if (k < NOISE && !renderQuality.light) snow(c, w, h)
  else CHANNELS[Math.floor(t / CHANNEL) % CHANNELS.length](c, w, h, t)
  c.fillStyle = 'rgba(0,0,0,0.18)'
  for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1)
}

/** Écran bombé (w × h), bord à 0, centre bombé de `bulge`, face à +z. */
function bulgedScreen(w: number, h: number, bulge: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h, 8, 6)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const u = (2 * p.getX(i)) / w, v = (2 * p.getY(i)) / h
    p.setZ(i, bulge * (1 - u * u) * (1 - v * v))
  }
  g.computeVertexNormals()
  return g
}

/**
 * Télé cathodique : coffret, écran bombé qui zappe tout seul, boutons et haut-parleur à droite,
 * antenne « oreilles de lapin ». `standing` : sur pieds, en meuble (plus grande). Coffret : `label`.
 */
function crt(label: string | undefined, standing: boolean) {
  const kind = CRT_CASES[label ?? ''] ?? CRT_CASES.wood
  const s = standing ? 1.35 : 1
  const g = new THREE.Group()
  const inner = new THREE.Group()
  inner.scale.setScalar(s)
  const body = lit(kind.body), face = lit(kind.face), black = lit(C.black)
  const W = 0.44, H = 0.34, D = 0.3
  inner.add(box(W, H, D, body, 0, H / 2 + 0.02, 0, 0.03))
  // Le cul du tube, en tronc de pyramide.
  const back = mesh(new THREE.CylinderGeometry(0.1, 0.17, 0.14, 4, 1), body, 0, H / 2 + 0.02, -D / 2 - 0.06)
  back.rotation.set(-Math.PI / 2, Math.PI / 4, 0)
  inner.add(back)
  // Façade : cadre sombre de l'écran, panneau de commandes à droite.
  inner.add(box(0.31, 0.26, 0.02, face, -0.055, H / 2 + 0.02, D / 2 + 0.005, 0.02))
  inner.add(box(0.08, 0.26, 0.012, face, 0.165, H / 2 + 0.02, D / 2 + 0.002))
  for (const [y, r] of [[0.28, 0.018], [0.22, 0.014]] as const) {
    const knob = cylinder(r, r, 0.02, lit(C.chrome), 0.165, y, D / 2 + 0.014, 12)
    knob.rotation.x = Math.PI / 2
    inner.add(knob)
  }
  for (let i = 0; i < 5; i++) inner.add(box(0.05, 0.005, 0.004, black, 0.165, 0.09 + i * 0.018, D / 2 + 0.009))
  inner.add(box(0.012, 0.006, 0.004, glow('#ff3b2f'), 0.19, 0.16, D / 2 + 0.01))
  // Petits pieds, antenne.
  for (const x of [-0.17, 0.17]) for (const z of [-0.1, 0.1]) inner.add(box(0.04, 0.02, 0.04, black, x, 0.01, z))
  inner.add(sphere(0.035, black, 0.02, H + 0.03, -0.04, 10))
  for (const a of [-0.45, 0.5]) {
    const rod = cylinder(0.004, 0.004, 0.3, lit(C.chrome), 0.02 + Math.sin(a) * 0.15, H + 0.03 + Math.cos(a) * 0.15, -0.04, 5)
    rod.rotation.z = -a
    inner.add(rod)
  }
  g.add(inner)
  const bottom = standing ? 0.26 : 0
  inner.position.y = bottom
  if (standing) {
    // Meuble télé des années 60 : plateau et quatre pieds fuselés, évasés.
    const wood = lit(C.woodLight)
    g.add(box(W * s + 0.04, 0.03, D * s + 0.02, wood, 0, bottom - 0.015, 0, 0.01))
    for (const x of [-1, 1]) {
      for (const z of [-1, 1]) {
        const leg = cylinder(0.016, 0.01, 0.25, wood, x * (W * s / 2 - 0.02), bottom / 2 - 0.02, z * (D * s / 2 - 0.04), 6)
        leg.rotation.set(z * 0.12, 0, -x * 0.12)
        g.add(leg)
      }
    }
  }
  const screen = animatedScreen(128, 96, 10, tvFrame)
  const live = new THREE.Group()
  const glass = part(bulgedScreen(0.27, 0.21, 0.015), new THREE.MeshBasicMaterial({ map: screen.texture }), -0.055 * s, bottom + (H / 2 + 0.02) * s, (D / 2 + 0.016) * s)
  glass.scale.setScalar(s)
  live.add(glass)
  return { solid: g, live, update: (t: number) => screen.tick(t) }
}

const crtTv: Builder = ({ label }) => crt(label, false)
const crtTvStand: Builder = ({ label }) => crt(label, true)

// ---------------------------------------------------------------- consoles

interface ConsoleDef {
  /** Boîtier, en repère du meuble. */
  build: (g: THREE.Group) => void
  /** Manette : couleur, et ses boutons. */
  pad: { body: string; buttons: string[]; shape: 'brick' | 'bone' | 'trident' | 'modern' }
}

/** Manette posée à droite de la console, reliée par son câble. */
function gamepad(g: THREE.Group, pad: ConsoleDef['pad'], x: number, z: number, wired: boolean) {
  const body = lit(pad.body), black = lit(C.black)
  const p = new THREE.Group()
  p.position.set(x, 0, z)
  p.rotation.y = -0.35
  if (pad.shape === 'brick') {
    p.add(box(0.1, 0.018, 0.045, body, 0, 0.009, 0, 0.004))
    p.add(box(0.02, 0.004, 0.006, black, -0.03, 0.019, 0), box(0.006, 0.004, 0.02, black, -0.03, 0.019, 0))
  } else if (pad.shape === 'bone') {
    p.add(box(0.07, 0.018, 0.04, body, 0, 0.009, 0, 0.006))
    for (const s of [-1, 1]) p.add(cylinder(0.024, 0.024, 0.018, body, s * 0.04, 0.009, 0, 12))
    p.add(box(0.018, 0.004, 0.006, black, -0.04, 0.02, 0), box(0.006, 0.004, 0.018, black, -0.04, 0.02, 0))
  } else if (pad.shape === 'trident') {
    p.add(box(0.1, 0.02, 0.04, body, 0, 0.01, 0, 0.006))
    for (const px of [-0.04, 0, 0.04]) p.add(box(0.022, 0.02, 0.05, body, px, 0.01, 0.035, 0.006))
    p.add(cylinder(0.006, 0.006, 0.02, lit(C.greyLight), 0, 0.026, 0.01, 6))
  } else {
    p.add(box(0.09, 0.022, 0.05, body, 0, 0.011, 0, 0.01))
    for (const s of [-1, 1]) p.add(sphere(0.022, body, s * 0.04, 0.012, 0.022, 10))
    for (const s of [-1, 1]) p.add(cylinder(0.008, 0.008, 0.01, black, s * 0.018, 0.026, 0.012, 8))
  }
  const btn = pad.shape === 'brick' ? 0.03 : 0.04
  pad.buttons.forEach((col, i) => p.add(cylinder(0.006, 0.006, 0.006, glow(col), btn + (i % 2) * 0.012, 0.022, (i < 2 ? -1 : 1) * 0.006, 8)))
  g.add(p)
  if (wired) {
    // Le câble : quelques segments qui serpentent de la console à la manette.
    const pts = [new THREE.Vector3(0.05, 0.01, 0.05), new THREE.Vector3(0.07, 0.003, 0.09), new THREE.Vector3(x - 0.04, 0.003, z + 0.04), new THREE.Vector3(x - 0.035, 0.008, z + 0.01)]
    const curve = new THREE.CatmullRomCurve3(pts)
    g.add(mesh(new THREE.TubeGeometry(curve, 12, 0.0025, 4), lit(C.black)))
  }
}

const CONSOLES: Record<string, ConsoleDef & { label: string }> = {
  nes: {
    label: tr('8 bits', '8-bit'),
    build: (g) => {
      g.add(box(0.2, 0.06, 0.16, lit(C.greyLight), 0, 0.03, 0, 0.006), box(0.2, 0.025, 0.06, lit(C.grey), 0, 0.062, -0.05, 0.004))
      g.add(box(0.12, 0.012, 0.004, lit(C.plastic), -0.02, 0.03, 0.081), box(0.02, 0.008, 0.004, glow('#ff3b2f'), -0.07, 0.045, 0.081))
      // Une cartouche grise enfoncée.
      g.add(box(0.1, 0.05, 0.015, lit('#8d8f93'), 0, 0.085, -0.05))
    },
    pad: { body: '#d9dadc', buttons: ['#c62a22', '#c62a22'], shape: 'brick' },
  },
  snes: {
    label: tr('16 bits', '16-bit'),
    build: (g) => {
      g.add(box(0.21, 0.055, 0.17, lit('#c9c9cf'), 0, 0.028, 0, 0.02), box(0.12, 0.02, 0.08, lit('#b8b8c2'), 0, 0.064, -0.01, 0.01))
      g.add(box(0.03, 0.012, 0.02, lit('#6b5aa0'), -0.07, 0.06, 0.05, 0.004), box(0.03, 0.012, 0.02, lit('#8a7ab8'), 0.07, 0.06, 0.05, 0.004))
      g.add(box(0.11, 0.04, 0.014, lit('#7d7d85'), 0, 0.088, -0.01))
    },
    pad: { body: '#c9c9cf', buttons: ['#6b5aa0', '#8a7ab8', '#4b3a80', '#a898d8'], shape: 'bone' },
  },
  mega: {
    label: tr('16 bits noire', 'Black 16-bit'),
    build: (g) => {
      g.add(box(0.22, 0.05, 0.18, lit(C.black), 0, 0.025, 0, 0.012))
      const disc = cylinder(0.055, 0.055, 0.008, lit('#2b2d34'), -0.02, 0.054, 0.01, 20)
      g.add(disc, box(0.06, 0.006, 0.01, glow('#e0322a'), 0.06, 0.052, 0.07))
      g.add(box(0.1, 0.035, 0.014, lit('#303238'), -0.02, 0.07, -0.04))
    },
    pad: { body: '#1d1e22', buttons: ['#6fa0ff', '#ffd23c', '#ff5a4a'], shape: 'bone' },
  },
  disc: {
    label: tr('32 bits à CD', '32-bit CD'),
    build: (g) => {
      g.add(box(0.23, 0.05, 0.17, lit('#bfc0c5'), 0, 0.025, 0, 0.01))
      g.add(cylinder(0.06, 0.06, 0.008, lit('#a8a9ae'), -0.03, 0.054, -0.005, 24))
      g.add(cylinder(0.009, 0.009, 0.006, lit('#5b5d63'), 0.07, 0.054, 0.04, 10), cylinder(0.009, 0.009, 0.006, lit('#5b5d63'), 0.07, 0.054, -0.01, 10))
      g.add(box(0.008, 0.004, 0.008, glow('#7dffa8'), 0.07, 0.056, 0.065))
    },
    pad: { body: '#bfc0c5', buttons: ['#39c07a', '#e0322a', '#3b8cff', '#ff6fae'], shape: 'bone' },
  },
  n64: {
    label: tr('64 bits', '64-bit'),
    build: (g) => {
      g.add(box(0.2, 0.05, 0.19, lit('#2c2e33'), 0, 0.025, 0, 0.02), box(0.14, 0.03, 0.1, lit('#34363c'), 0, 0.06, -0.02, 0.015))
      g.add(box(0.1, 0.05, 0.02, lit('#8a8c92'), 0, 0.1, -0.02))
      g.add(box(0.012, 0.012, 0.012, glow('#ff3b2f'), 0.06, 0.05, 0.09))
    },
    pad: { body: '#3a3c42', buttons: ['#3b8cff', '#2fbf5a', '#ffd23c', '#ffd23c'], shape: 'trident' },
  },
  modern: {
    label: tr('De salon moderne', 'Modern home console'),
    build: (g) => {
      // Une tour mince, debout, et sa bande lumineuse.
      g.add(box(0.07, 0.24, 0.2, lit(C.black), 0, 0.12, 0, 0.01), box(0.074, 0.006, 0.18, glow('#59d8ff'), 0, 0.2, 0))
      g.add(box(0.12, 0.012, 0.1, lit('#23252b'), 0, 0.006, 0, 0.004))
    },
    pad: { body: '#e9ecef', buttons: ['#1d1e22', '#1d1e22', '#1d1e22', '#1d1e22'], shape: 'modern' },
  },
}

/** Console de salon et sa manette. Modèle : `label` (cf. CONSOLES). */
const gameConsole: Builder = ({ label }) => {
  const def = CONSOLES[label ?? ''] ?? CONSOLES.nes
  const g = new THREE.Group()
  const body = new THREE.Group()
  body.position.x = -0.05
  def.build(body)
  g.add(body)
  gamepad(g, def.pad, 0.12, 0.08, label !== 'modern')
  return { solid: g }
}

// ---------------------------------------------------------------- console portable

const HANDHELDS: Record<string, string> = { grey: '#c9c9c4', yellow: '#f2c83a', teal: '#3fb0a8', purple: '#7a5ac8', red: '#d8453b' }

/** Écran vert à quatre nuances : une partie de blocs qui tombent. */
function brickScreen(c: CanvasRenderingContext2D, t: number) {
  const { width: w, height: h } = c.canvas
  const shades = ['#9bbc0f', '#8bac0f', '#306230', '#0f380f']
  c.fillStyle = shades[0]
  c.fillRect(0, 0, w, h)
  const cell = 6
  c.fillStyle = shades[2]
  for (let x = 0; x < w; x += cell) for (let y = h - cell * 3; y < h; y += cell) if (((x / cell) * 7 + (y / cell) * 3) % 5 !== 0) c.fillRect(x + 1, y + 1, cell - 2, cell - 2)
  const fall = Math.floor((t * 4) % ((h - cell * 3) / cell)) * cell
  c.fillStyle = shades[3]
  for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [1, 1]]) c.fillRect(18 + dx * cell + 1, fall + dy * cell + 1, cell - 2, cell - 2)
}

/** Console portable, couchée sur le dos : écran vert qui joue, croix, deux boutons. Coloris : `label`. */
const handheld: Builder = ({ label }) => {
  const color = HANDHELDS[label ?? ''] ?? HANDHELDS.grey
  const g = new THREE.Group()
  const body = lit(color), dark = lit(C.plastic)
  g.add(box(0.09, 0.02, 0.14, body, 0, 0.01, 0, 0.012))
  g.add(box(0.07, 0.003, 0.06, lit('#4d5058'), 0, 0.021, -0.03, 0.004))
  g.add(box(0.022, 0.004, 0.007, dark, -0.02, 0.022, 0.03), box(0.007, 0.004, 0.022, dark, -0.02, 0.022, 0.03))
  for (const [x, z] of [[0.018, 0.034], [0.03, 0.024]]) g.add(cylinder(0.006, 0.006, 0.004, lit('#8a2250'), x, 0.022, z, 10))
  const screen = animatedScreen(48, 44, 6, brickScreen)
  const face = part(new THREE.PlaneGeometry(0.05, 0.045), new THREE.MeshBasicMaterial({ map: screen.texture }), 0, 0.0235, -0.03)
  face.rotation.x = -Math.PI / 2
  return { solid: g, live: new THREE.Group().add(face), update: (t) => screen.tick(t) }
}

// ---------------------------------------------------------------- micro-ordinateur 8 bits

/** Écran du micro : le Cobra Mk III d'Elite (1984) qui tourne, en fil de fer, et le titre. */
function eliteScreen(c: CanvasRenderingContext2D, t: number) {
  const { width: w, height: h } = c.canvas
  c.fillStyle = '#000'
  c.fillRect(0, 0, w, h)
  c.strokeStyle = '#f2f2f2'
  c.fillStyle = '#f2f2f2'
  c.lineWidth = 1
  c.font = 'bold 10px monospace'
  c.textAlign = 'center'
  c.fillText('---- E L I T E ----', w / 2, 11)
  c.font = '8px monospace'
  c.fillText(tr('Commandant Jameson', 'Commander Jameson'), w / 2, h - 14)
  c.fillText(tr('Charger ? (O/N)', 'Load new commander (Y/N)?'), w / 2, h - 4)
  const a = t * 0.9, b = 0.35 + Math.sin(t * 0.4) * 0.2
  const proj = COBRA_VERTICES.map(([x, y, z]) => {
    // Rotation autour de y puis de x, projection en perspective.
    const x1 = x * Math.cos(a) + z * Math.sin(a), z1 = -x * Math.sin(a) + z * Math.cos(a)
    const y2 = y * Math.cos(b) - z1 * Math.sin(b), z2 = y * Math.sin(b) + z1 * Math.cos(b)
    const k = 38 / (z2 + 3)
    return [w / 2 + x1 * k, h / 2 - 2 - y2 * k]
  })
  c.beginPath()
  for (const [i, j] of COBRA_EDGES) {
    c.moveTo(proj[i][0], proj[i][1])
    c.lineTo(proj[j][0], proj[j][1])
  }
  c.stroke()
}

/** Micro-ordinateur des années 80 : clavier-unité centrale beige, moniteur posé dessus, lecteur de cassettes. */
const retroComputer: Builder = () => {
  const g = new THREE.Group()
  const beige = lit(C.beige), dark = lit(C.beigeDark), black = lit(C.black)
  // Le clavier-boîtier, en pente douce, ses touches.
  const kb = new THREE.Group()
  kb.position.set(0, 0.03, 0.1)
  kb.rotation.x = 0.1
  kb.add(box(0.36, 0.05, 0.14, beige, 0, 0, 0, 0.008))
  for (let r = 0; r < 4; r++) for (let k = 0; k < 11; k++) kb.add(box(0.022, 0.008, 0.02, r === 0 && k > 7 ? lit('#c96a2a') : black, -0.14 + k * 0.028 + (r % 2) * 0.008, 0.028, -0.045 + r * 0.028))
  kb.add(box(0.2, 0.008, 0.018, black, 0, 0.028, 0.066))
  g.add(kb)
  // Le moniteur, derrière, sur son socle.
  g.add(box(0.3, 0.03, 0.2, dark, 0, 0.015, -0.1, 0.01))
  g.add(box(0.3, 0.24, 0.22, beige, 0, 0.16, -0.1, 0.02))
  const back = mesh(new THREE.CylinderGeometry(0.07, 0.12, 0.1, 4, 1), beige, 0, 0.16, -0.25)
  back.rotation.set(-Math.PI / 2, Math.PI / 4, 0)
  g.add(back, box(0.24, 0.19, 0.012, dark, 0, 0.165, 0.011, 0.01))
  g.add(box(0.012, 0.006, 0.004, glow('#ff3b2f'), 0.12, 0.06, 0.012))
  // Lecteur de cassettes, à côté.
  g.add(box(0.12, 0.04, 0.09, lit('#2f3138'), 0.25, 0.02, 0.08, 0.006), box(0.08, 0.005, 0.05, lit('#55585f'), 0.25, 0.042, 0.075))
  const screen = animatedScreen(128, 100, 12, eliteScreen)
  const face = part(bulgedScreen(0.21, 0.16, 0.008), new THREE.MeshBasicMaterial({ map: screen.texture }), 0, 0.165, 0.018)
  return { solid: g, live: new THREE.Group().add(face), update: (t) => screen.tick(t) }
}

// ---------------------------------------------------------------- PC de joueur

/** Tour de PC de joueur, flanc vitré : trois ventilateurs arc-en-ciel qui tournent de couleur. */
const gamingPc: Builder = () => {
  const g = new THREE.Group()
  const black = lit(C.black)
  g.add(box(0.2, 0.44, 0.42, black, 0, 0.22, 0, 0.01))
  g.add(box(0.004, 0.36, 0.34, lit('#30343c'), 0.101, 0.23, 0))
  g.add(box(0.03, 0.01, 0.01, glow('#59d8ff'), 0.05, 0.43, 0.211))
  const live = new THREE.Group()
  const fans = [0.34, 0.22, 0.1].map((y) => {
    const ring = part(new THREE.TorusGeometry(0.05, 0.008, 6, 20), new THREE.MeshBasicMaterial({ color: '#ff3bd0' }), 0, y, 0.212)
    live.add(ring)
    return ring
  })
  const c = new THREE.Color()
  return {
    solid: g,
    live,
    update(t) {
      fans.forEach((f, i) => (f.material as THREE.MeshBasicMaterial).color.copy(c.setHSL((t * 0.15 + i * 0.12) % 1, 1, 0.55)))
    },
  }
}

// ---------------------------------------------------------------- cassettes vidéo

const TAPES = [
  'TERMINATOR', 'ALIEN', 'E.T.', tr('RETOUR VERS LE FUTUR', 'BACK TO THE FUTURE'), 'STAR WARS', 'BLADE RUNNER',
  tr('COMÈTE, SAISON 3', 'COMÈTE, SEASON 3'), tr('GALNET 3309 (NE PAS EFFACER)', 'GALNET 3309 (DO NOT ERASE)'),
]

/** Étiquettes des cassettes, une par ligne de la texture (partagée par toute la pile). */
function tapeLabels(): THREE.CanvasTexture {
  return drawnTexture(128, 16 * TAPES.length, (c) => {
    TAPES.forEach((title, i) => {
      c.fillStyle = '#f4ecd8'
      c.fillRect(0, i * 16, 128, 16)
      c.fillStyle = '#1b1b8a'
      c.font = 'bold 10px sans-serif'
      c.textBaseline = 'middle'
      c.fillText(title, 5, i * 16 + 9, 118)
    })
  })
}

/** Pile de cassettes vidéo, étiquettes manuscrites sur la tranche. */
const vhsStack: Builder = ({ random }) => {
  const g = new THREE.Group()
  const labels = new THREE.MeshLambertMaterial({ map: tapeLabels() })
  for (let i = 0; i < 6; i++) {
    const row = Math.floor(random() * TAPES.length)
    const face = new THREE.PlaneGeometry(0.15, 0.017)
    // La ligne `row` de la texture (le haut de la texture est en v = 1).
    const uv = face.attributes.uv
    for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - (row + 1 - uv.getY(k)) / TAPES.length)
    const tape = new THREE.Group()
    tape.position.set((random() - 0.5) * 0.02, 0.012 + i * 0.024, (random() - 0.5) * 0.02)
    tape.rotation.y = (random() - 0.5) * 0.25
    tape.add(box(0.19, 0.023, 0.105, lit(i % 3 ? C.black : '#23252b')), mesh(face, labels, 0, 0, 0.0535))
    g.add(tape)
  }
  return { solid: g }
}

export const RETRO = {
  'crt-tv': crtTv,
  'crt-tv-stand': crtTvStand,
  'game-console': gameConsole,
  handheld,
  'retro-computer': retroComputer,
  'gaming-pc': gamingPc,
  'vhs-stack': vhsStack,
} satisfies Record<string, Builder>

export { CONSOLES, HANDHELDS, CRT_CASES }
