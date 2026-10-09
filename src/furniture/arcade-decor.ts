import * as THREE from 'three'
import { cometePlush, thargoidPlush } from './arcade'
import { barX, box, cylinder, drawnTexture, glass, glow, keepShared, lit, mesh, part, rng, sphere, type Builder } from './kit'
import { tr } from '../i18n'

/*
 * Décor du salon d'arcade, façon salle des années 90 : moquette à motifs fluo qui luit sous la
 * lumière noire, doubles tubes de néon le long des murs, fresques peintes, comptoir à lots,
 * monnayeur et distributeurs de boules de gomme. Les bornes sont dans arcade.ts.
 *
 * Un objet accroché est construit dos au mur (origine sur la face du mur, au niveau du sol,
 * contenu vers +z).
 */

/** Les fluos de la salle. */
const FLUO = { pink: '#ff3bd0', cyan: '#39e0ff', yellow: '#ffe14f', green: '#9dff5a', orange: '#ff8a1c', purple: '#b98cff' }
const FLUOS = Object.values(FLUO)

const C = {
  black: '#121318',
  night: '#120d2e',
  chrome: '#cfd6de',
  steel: '#8a9098',
  teal: '#19b5b0',
  violet: '#3a1d6e',
}

/** Lueur ajoutée à ce qui est derrière ; elle échappe au tone mapping (cf. haloMaterial dans lights.ts). */
const halo = (color: string, opacity: number) =>
  new THREE.MeshBasicMaterial({ color, opacity, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })

/** Bande de lueur sur un mur : pleine à la hauteur `at` (de 0, en bas, à 1), éteinte en haut et en bas, et aux deux bouts. */
function glowBand(len: number, h: number, at = 0.5): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(len, h, 8, 2)
  const p = geo.attributes.position
  const colors = new Float32Array(p.count * 4)
  for (let i = 0; i < p.count; i++) {
    const row = Math.floor(i / 9)
    if (row === 1) p.setY(i, (at - 0.5) * h)
    const end = 1 - THREE.MathUtils.smoothstep(Math.abs(p.getX(i)) / (len / 2), 0.8, 1)
    colors.set([1, 1, 1, row === 1 ? end : 0], i * 4)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 4))
  return geo
}

// ---------------------------------------------------------------- moquette

/** Motifs de la moquette, dessinés autour de l'origine, pour une taille `s`. */
const CARPET_SHAPES: ((g: CanvasRenderingContext2D, s: number) => void)[] = [
  // Vaguelette.
  (g, s) => {
    g.beginPath()
    for (let i = 0; i <= 24; i++) g.lineTo((i / 24 - 0.5) * s * 2.2, Math.sin((i / 24) * Math.PI * 3) * s * 0.32)
    g.stroke()
  },
  // Zigzag.
  (g, s) => {
    g.beginPath()
    for (let i = 0; i < 5; i++) g.lineTo((i / 4 - 0.5) * s * 1.9, (i % 2 ? -1 : 1) * s * 0.3)
    g.stroke()
  },
  // Triangle au trait.
  (g, s) => {
    g.beginPath()
    for (let i = 0; i < 3; i++) g.lineTo(Math.cos((i / 3) * Math.PI * 2) * s * 0.62, Math.sin((i / 3) * Math.PI * 2) * s * 0.62)
    g.closePath()
    g.stroke()
  },
  // Pastille.
  (g, s) => {
    g.beginPath()
    g.arc(0, 0, s * 0.3, 0, Math.PI * 2)
    g.fill()
  },
  // Anneau.
  (g, s) => {
    g.beginPath()
    g.arc(0, 0, s * 0.42, 0, Math.PI * 2)
    g.stroke()
  },
  // Confetti.
  (g, s) => g.fillRect(-s * 0.5, -s * 0.11, s, s * 0.22),
  // Croix.
  (g, s) => {
    g.beginPath()
    g.moveTo(-s * 0.4, 0)
    g.lineTo(s * 0.4, 0)
    g.moveTo(0, -s * 0.4)
    g.lineTo(0, s * 0.4)
    g.stroke()
  },
  // Virgule.
  (g, s) => {
    g.beginPath()
    g.arc(0, 0, s * 0.5, 0.2, Math.PI * 1.1)
    g.stroke()
  },
]

/** Côté du carreau de moquette, en mètres : son motif se répète. */
const CARPET_SPAN = 2
let carpet: THREE.MeshLambertMaterial | undefined

/**
 * Carreau de moquette : un fond de nuit moucheté, semé de motifs fluo. Chaque motif est dessiné
 * aussi de l'autre côté des bords qu'il dépasse : le carreau se raccorde à lui-même.
 */
function carpetMaterial(): THREE.MeshLambertMaterial {
  if (carpet) return carpet
  const S = 512, cells = 7, cell = S / cells
  const random = rng(1994)
  const map = drawnTexture(S, S, (g) => {
    g.fillStyle = C.night
    g.fillRect(0, 0, S, S)
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = random() < 0.5 ? '#1c1547' : '#0a0720'
      g.fillRect(random() * S, random() * S, 2, 2)
    }
    g.lineCap = g.lineJoin = 'round'
    for (let j = 0; j < cells; j++) {
      for (let i = 0; i < cells; i++) {
        const x = (i + 0.2 + random() * 0.6) * cell, y = (j + 0.2 + random() * 0.6) * cell
        const shape = CARPET_SHAPES[Math.floor(random() * CARPET_SHAPES.length)]
        const color = FLUOS[Math.floor(random() * FLUOS.length)]
        const angle = random() * Math.PI * 2, s = 24 + random() * 16
        for (const ox of [-S, 0, S]) {
          for (const oy of [-S, 0, S]) {
            g.save()
            g.translate(x + ox, y + oy)
            g.rotate(angle)
            g.strokeStyle = g.fillStyle = color
            g.lineWidth = 6
            shape(g, s)
            g.restore()
          }
        }
      }
    }
  })
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.anisotropy = 8
  // Sous la lumière noire, les fluos luisent : la moquette s'éclaire un peu d'elle-même.
  carpet = keepShared(new THREE.MeshLambertMaterial({ map: keepShared(map), emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.55, polygonOffset: true, polygonOffsetFactor: -2 }))
  return carpet
}

/** Moquette d'arcade, d'un mur à l'autre (`label` : largeur x profondeur). */
const arcadeCarpet: Builder = ({ label = '4x3' }) => {
  const [w, d] = label.split('x').map(Number)
  const geo = new THREE.PlaneGeometry(w, d)
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / CARPET_SPAN, (uv.getY(i) * d) / CARPET_SPAN)
  const floor = part(geo, carpetMaterial(), 0, 0.006, 0)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  const g = new THREE.Group()
  g.add(floor)
  return { solid: g }
}

// ---------------------------------------------------------------- néons

/** Couleurs d'un tube : le verre, et son cœur presque blanc. */
const TUBES: Record<string, { tube: string; core: string }> = {
  pink: { tube: FLUO.pink, core: '#ffd6f6' },
  cyan: { tube: FLUO.cyan, core: '#d6f6ff' },
  yellow: { tube: FLUO.yellow, core: '#fff7d6' },
  purple: { tube: '#9a5cff', core: '#e6dcff' },
}

/**
 * Double tube de néon le long d'un mur, sur son bandeau haut, et sa lueur sur le mur.
 * `label` : « longueur|couleur du haut|couleur du bas » (rose sur cyan par défaut).
 */
const arcadeNeon: Builder = ({ label = '2' }) => {
  const [size, top = 'pink', bottom = 'cyan'] = label.split('|')
  const len = Number(size) || 2
  const g = new THREE.Group()
  const live = new THREE.Group()
  const lines: [string, number][] = [[top, 0.93], [bottom, 0.86]]
  for (const [id, y] of lines) {
    const c = TUBES[id] ?? TUBES.pink
    g.add(barX(0.011, len - 0.06, glow(c.core), 0, y, 0.03, 8))
    live.add(part(glowBand(len, 0.11), halo(c.tube, 0.9), 0, y, 0.022))
  }
  // Fixations, tous les mètres environ.
  const n = Math.max(2, Math.round(len))
  for (let i = 0; i < n; i++) g.add(box(0.016, 0.11, 0.03, lit(C.black), -len / 2 + 0.1 + (i * (len - 0.2)) / (n - 1), 0.895, 0.015))
  // La lueur des deux tubes se mêle en descendant le mur.
  live.add(part(glowBand(len, 0.7, 0.92), halo((TUBES[bottom] ?? TUBES.cyan).tube, 0.32), 0, 0.5, 0.004))
  return { solid: g, live }
}

// ---------------------------------------------------------------- fresques

const MURAL = { w: 2, h: 0.6, px: 640, py: 192 }

/** Fresques peintes à même le mur, par variante (dessin sur 640 × 192). */
const MURALS: Record<string, (g: CanvasRenderingContext2D) => void> = {
  // Le coup de pinceau turquoise et son gribouillis violet.
  jazz: (g) => {
    g.lineCap = 'round'
    g.strokeStyle = '#19c8c0'
    for (let k = 0; k < 9; k++) {
      g.lineWidth = 9
      g.globalAlpha = 0.55 + (k % 3) * 0.2
      g.beginPath()
      g.moveTo(40, 70 + k * 9)
      g.bezierCurveTo(200, 20 + k * 9, 380, 150 + k * 5, 600, 60 + k * 8)
      g.stroke()
    }
    g.globalAlpha = 1
    g.strokeStyle = '#a348ff'
    g.lineWidth = 8
    g.beginPath()
    for (let i = 0; i <= 60; i++) g.lineTo(90 + i * 7.6, 96 + Math.sin(i * 0.9) * (16 + i * 0.35) * (i % 2 ? 1 : -0.6))
    g.stroke()
  },
  // Formes de Memphis : triangle, disque, damier, pois, zigzag.
  memphis: (g) => {
    g.fillStyle = FLUO.yellow
    g.beginPath()
    g.moveTo(40, 160)
    g.lineTo(120, 28)
    g.lineTo(200, 160)
    g.fill()
    g.fillStyle = FLUO.pink
    g.beginPath()
    g.arc(300, 92, 58, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = C.night
    g.beginPath()
    g.arc(318, 80, 30, 0, Math.PI * 2)
    g.fill()
    for (let j = 0; j < 4; j++) for (let i = 0; i < 5; i++) {
      g.fillStyle = (i + j) % 2 ? '#f4f0ea' : '#121318'
      g.fillRect(392 + i * 22, 30 + j * 22, 22, 22)
    }
    g.fillStyle = FLUO.cyan
    for (let j = 0; j < 3; j++) for (let i = 0; i < 6; i++) {
      g.beginPath()
      g.arc(160 + i * 20, 22 + j * 18, 4.5, 0, Math.PI * 2)
      g.fill()
    }
    g.strokeStyle = FLUO.green
    g.lineWidth = 9
    g.lineJoin = 'round'
    g.beginPath()
    for (let i = 0; i < 9; i++) g.lineTo(380 + i * 30, 150 + (i % 2 ? -22 : 14))
    g.stroke()
    g.fillStyle = FLUO.orange
    g.fillRect(536, 34, 70, 18)
  },
  // Damier de course, entre deux filets fluo.
  checker: (g) => {
    for (let j = 0; j < 3; j++) for (let i = 0; i < 20; i++) {
      g.fillStyle = (i + j) % 2 ? '#f4f0ea' : '#121318'
      g.fillRect(i * 32, 48 + j * 32, 32, 32)
    }
    g.fillStyle = FLUO.pink
    g.fillRect(0, 22, 640, 12)
    g.fillStyle = FLUO.cyan
    g.fillRect(0, 158, 640, 12)
  },
}

const murals = new Map<string, THREE.Material>()

/** Fresque peinte sur le mur, entre ses bandeaux : `label` (cf. MURALS). La peinture fluo luit un peu. */
const arcadeMural: Builder = ({ label }) => {
  const id = MURALS[label ?? ''] ? label! : 'memphis'
  let material = murals.get(id)
  if (!material) {
    const map = keepShared(drawnTexture(MURAL.px, MURAL.py, MURALS[id]))
    material = keepShared(new THREE.MeshLambertMaterial({ map, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.45, transparent: true, depthWrite: false }))
    murals.set(id, material)
  }
  const g = new THREE.Group()
  g.add(part(new THREE.PlaneGeometry(MURAL.w, MURAL.h), material, 0, 0.5, 0.012))
  return { solid: g }
}

// ---------------------------------------------------------------- comptoir à lots

const PRIZE = { w: 1.7, backH: 1.3, shelfD: 0.15, counterZ: 0.44, counterD: 0.36 }
const TOYS = ['#ff5a5a', '#ffb03a', '#ffe14f', '#5ad1ff', '#b98cff', '#ff8ad8', '#8fe06a', '#f4f0ea']

/** Ours en peluche assis, taille `s`. */
function teddy(s: number, color: string): THREE.Group {
  const p = new THREE.Group()
  const fur = lit(color)
  const body = sphere(0.05 * s, fur, 0, 0.045 * s, 0, 8)
  body.scale.set(1, 0.95, 0.9)
  p.add(body, sphere(0.036 * s, fur, 0, 0.11 * s, 0.005 * s, 8), sphere(0.014 * s, lit('#f1dcc0'), 0, 0.103 * s, 0.035 * s, 6))
  for (const x of [-1, 1]) {
    p.add(sphere(0.014 * s, fur, x * 0.028 * s, 0.14 * s, 0, 6), sphere(0.018 * s, fur, x * 0.05 * s, 0.06 * s, 0.02 * s, 6), sphere(0.02 * s, fur, x * 0.03 * s, 0.014 * s, 0.045 * s, 6))
  }
  return p
}

/** Un lot au hasard, posé sur une étagère : peluche, boîte de jouet, ballon, lampe à lave, robot. */
function prize(random: () => number): THREE.Object3D {
  const color = TOYS[Math.floor(random() * TOYS.length)]
  const kind = Math.floor(random() * 7)
  const p = new THREE.Group()
  if (kind === 0) p.add(cometePlush(1.5))
  else if (kind === 1) {
    const t = thargoidPlush()
    t.scale.setScalar(1.5)
    p.add(t)
  } else if (kind === 2) p.add(teddy(0.9, color))
  else if (kind === 3) {
    // Boîte de jouet, avec sa fenêtre.
    const h = 0.1 + random() * 0.06
    p.add(box(0.1, h, 0.06, lit(color), 0, h / 2, 0), box(0.06, h * 0.5, 0.004, lit('#1c1f25'), 0, h * 0.55, 0.031))
  } else if (kind === 4) p.add(sphere(0.045, lit(color), 0, 0.045, 0, 10), box(0.092, 0.012, 0.012, lit('#f4f0ea'), 0, 0.045, 0))
  else if (kind === 5) p.add(cylinder(0.022, 0.03, 0.03, lit(C.chrome, 'metal'), 0, 0.015, 0, 10), cylinder(0.014, 0.024, 0.1, glow(color), 0, 0.08, 0, 10), cylinder(0.012, 0.014, 0.02, lit(C.chrome, 'metal'), 0, 0.14, 0, 10))
  else {
    // Petit robot de fer-blanc.
    p.add(box(0.06, 0.07, 0.045, lit(color), 0, 0.065, 0), box(0.045, 0.04, 0.04, lit(C.chrome, 'metal'), 0, 0.12, 0), box(0.03, 0.01, 0.004, glow('#ff3b2f'), 0, 0.125, 0.021))
    for (const x of [-0.018, 0.018]) p.add(box(0.018, 0.03, 0.03, lit('#2a2e36'), x, 0.015, 0))
  }
  p.rotation.y = (random() - 0.5) * 0.5
  return p
}

let prizeSign: THREE.Texture | undefined

/**
 * Comptoir à lots, adossé au mur : un mur d'étagères éclairées, chargé de peluches et de jouets,
 * son fronton à ampoules, et devant, une vitrine de bricoles avec la compteuse de tickets et la
 * sonnette.
 */
const prizeCounter: Builder = ({ random }) => {
  const g = new THREE.Group()
  const live = new THREE.Group()
  const { w, backH, shelfD, counterZ, counterD } = PRIZE
  const dark = lit(C.black), chrome = lit(C.chrome, 'metal')
  // Le mur d'étagères : fond violet à pois, montants, trois rayons au nez lumineux.
  g.add(box(w, backH, 0.05, lit(C.violet), 0, backH / 2, 0.025))
  for (const x of [-w / 2 + 0.02, w / 2 - 0.02]) g.add(box(0.04, backH, shelfD + 0.04, lit('#241048'), x, backH / 2, shelfD / 2 + 0.03))
  const shelves = [0.62, 0.84, 1.06]
  shelves.forEach((y, row) => {
    g.add(box(w - 0.08, 0.014, shelfD, lit('#241048'), 0, y, 0.05 + shelfD / 2), box(w - 0.08, 0.01, 0.006, glow(row % 2 ? FLUO.cyan : FLUO.pink), 0, y, 0.05 + shelfD + 0.003))
    let x = -w / 2 + 0.14
    while (x < w / 2 - 0.12) {
      if (random() < 0.9) {
        const p = prize(random)
        p.position.set(x, y + 0.007, 0.05 + shelfD / 2)
        g.add(p)
      }
      x += 0.13 + random() * 0.05
    }
  })
  // Le gros lot, au-dessus du dernier rayon : il faut dix mille tickets.
  const jackpot = teddy(1.7, '#ff8ad8')
  jackpot.position.set(-0.5, 1.067 + 0.007, 0.05 + shelfD / 2)
  g.add(jackpot)
  // Fronton : le mot en lettres jaunes, bordé d'ampoules qui courent.
  prizeSign ??= keepShared(drawnTexture(512, 80, (c) => {
    c.fillStyle = '#1a0b33'
    c.fillRect(0, 0, 512, 80)
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.font = 'italic 900 54px system-ui, sans-serif'
    c.fillStyle = FLUO.pink
    c.fillText(tr('LOTS', 'PRIZES'), 259, 45)
    c.fillStyle = FLUO.yellow
    c.fillText(tr('LOTS', 'PRIZES'), 256, 42)
  }))
  g.add(box(w, 0.2, 0.1, dark, 0, backH + 0.1, 0.05), part(new THREE.PlaneGeometry(w - 0.16, 0.15), new THREE.MeshBasicMaterial({ map: prizeSign }), 0, backH + 0.1, 0.102))
  const bulbs: THREE.Mesh[][] = [[], []]
  const lamp = new THREE.SphereGeometry(0.012, 6, 4)
  for (let i = 0; i < 20; i++) {
    for (const y of [backH + 0.02, backH + 0.18]) {
      const bulb = part(lamp, glow(i % 2 ? '#fff3c4' : FLUO.orange), -w / 2 + 0.045 + (i * (w - 0.09)) / 19, y, 0.104)
      bulbs[i % 2].push(bulb)
      live.add(bulb)
    }
  }
  // La vitrine : socle, deux plateaux de bricoles sous verre, et le dessus stratifié turquoise.
  const cz = counterZ
  g.add(box(w, 0.16, counterD, dark, 0, 0.08, cz), box(w - 0.02, 0.012, counterD - 0.02, glow('#fff3de'), 0, 0.166, cz))
  g.add(box(w - 0.06, 0.008, counterD - 0.06, lit('#d8dde4'), 0, 0.33, cz))
  for (const y of [0.172, 0.334]) {
    for (let x = -w / 2 + 0.1; x < w / 2 - 0.08; x += 0.085 + random() * 0.03) {
      const color = lit(TOYS[Math.floor(random() * TOYS.length)])
      const z = cz + (random() - 0.5) * 0.18
      if (random() < 0.5) g.add(sphere(0.016 + random() * 0.01, color, x, y + 0.02, z, 6))
      else g.add(box(0.04, 0.02 + random() * 0.03, 0.03, color, x, y + 0.02, z))
    }
  }
  for (const x of [-w / 2 + 0.012, w / 2 - 0.012]) g.add(box(0.024, 0.34, counterD, chrome, x, 0.33, cz))
  g.add(box(w + 0.04, 0.03, counterD + 0.04, lit(C.teal), 0, 0.515, cz, 0.008), box(w + 0.04, 0.012, 0.004, glow(FLUO.pink), 0, 0.49, cz + counterD / 2 + 0.02))
  live.add(part(new THREE.PlaneGeometry(w - 0.05, 0.33), glass('#dff4ff', 0.18), 0, 0.335, cz + counterD / 2))
  // Sur le comptoir : la compteuse de tickets et son ruban, la sonnette, le bocal de jetons.
  g.add(box(0.2, 0.14, 0.2, lit('#e8463c'), 0.52, 0.6, cz, 0.012), box(0.12, 0.045, 0.004, glow('#7dffa8'), 0.52, 0.63, cz + 0.101), box(0.12, 0.012, 0.03, dark, 0.52, 0.565, cz + 0.1))
  const strip = box(0.03, 0.002, 0.16, lit('#ffb03a'), 0.3, 0.532, cz + 0.03)
  strip.rotation.y = 0.5
  g.add(strip, cylinder(0.04, 0.04, 0.03, lit('#ffb03a'), 0.24, 0.545, cz - 0.05, 14))
  g.add(cylinder(0.045, 0.05, 0.012, dark, -0.2, 0.536, cz + 0.04, 14), mesh(new THREE.SphereGeometry(0.04, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), chrome, -0.2, 0.54, cz + 0.04), sphere(0.008, chrome, -0.2, 0.584, cz + 0.04, 6))
  g.add(cylinder(0.045, 0.04, 0.1, lit('#bfe4ff'), -0.6, 0.58, cz - 0.02, 12), cylinder(0.04, 0.036, 0.06, lit('#e2b23c', 'metal'), -0.6, 0.565, cz - 0.02, 12), cylinder(0.047, 0.047, 0.012, lit('#e8463c'), -0.6, 0.636, cz - 0.02, 12))
  return {
    solid: g,
    live,
    update: (t) => {
      const odd = Math.floor(t * 2.5) % 2 === 1
      for (const b of bulbs[0]) b.visible = !odd
      for (const b of bulbs[1]) b.visible = odd
    },
  }
}

// ---------------------------------------------------------------- monnayeur

let tokenSign: THREE.Texture | undefined

/** Monnayeur, adossé au mur : il change les crédits en jetons. Caisse jaune, fente lumineuse, sébile pleine. */
const tokenMachine: Builder = () => {
  const g = new THREE.Group()
  const dark = lit(C.black), chrome = lit(C.chrome, 'metal')
  g.add(box(0.46, 1.02, 0.3, lit('#ffc93c'), 0, 0.51, 0.15, 0.015), box(0.38, 0.6, 0.012, dark, 0, 0.56, 0.3))
  tokenSign ??= keepShared(drawnTexture(256, 72, (c) => {
    c.fillStyle = '#1a0b33'
    c.fillRect(0, 0, 256, 72)
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.font = '900 40px system-ui, sans-serif'
    c.fillStyle = FLUO.cyan
    c.fillText(tr('JETONS', 'TOKENS'), 128, 38)
  }))
  g.add(part(new THREE.PlaneGeometry(0.4, 0.11), new THREE.MeshBasicMaterial({ map: tokenSign }), 0, 0.93, 0.303))
  // Fente à billets, flèche, afficheur du change, bouton.
  g.add(box(0.16, 0.022, 0.01, glow('#7dffa8'), -0.07, 0.76, 0.308), box(0.2, 0.06, 0.008, chrome, -0.07, 0.76, 0.304))
  g.add(box(0.1, 0.05, 0.008, glow('#ff3b2f'), 0.12, 0.76, 0.306), cylinder(0.022, 0.022, 0.012, glow(FLUO.pink), 0.12, 0.66, 0.306, 12).rotateX(Math.PI / 2))
  g.add(box(0.03, 0.06, 0.01, chrome, -0.07, 0.62, 0.306), box(0.006, 0.04, 0.012, dark, -0.07, 0.62, 0.308))
  // La sébile, et les jetons qui y traînent.
  g.add(box(0.24, 0.07, 0.07, chrome, 0, 0.36, 0.33, 0.01), box(0.2, 0.04, 0.05, dark, 0, 0.375, 0.335))
  for (const [x, z] of [[-0.05, 0.335], [0.02, 0.34], [0.06, 0.33]]) g.add(cylinder(0.014, 0.014, 0.004, lit('#e2b23c', 'metal'), x, 0.398, z, 10))
  g.add(box(0.36, 0.2, 0.008, lit('#e0a920'), 0, 0.16, 0.302), box(0.02, 0.03, 0.012, chrome, 0.14, 0.2, 0.306))
  return { solid: g }
}

// ---------------------------------------------------------------- boules de gomme

const GUM = ['#ff5a5a', '#ffe14f', '#5ad1ff', '#8fe06a', '#ff8ad8', '#f4f0ea', '#ff9a3c']

/** Distributeur de boules de gomme sur son pied : globe de verre, mécanisme à pièce (`label` : sa couleur). */
const gumballMachine: Builder = ({ label, random }) => {
  const body = lit(label === 'blue' ? '#2f6fe0' : label === 'yellow' ? '#ffc93c' : '#e8463c')
  const chrome = lit(C.chrome, 'metal')
  const g = new THREE.Group()
  g.add(cylinder(0.11, 0.13, 0.03, body, 0, 0.015, 0, 16), cylinder(0.016, 0.016, 0.4, chrome, 0, 0.23, 0, 8))
  g.add(cylinder(0.085, 0.1, 0.12, body, 0, 0.49, 0, 16), box(0.05, 0.05, 0.02, chrome, 0, 0.49, 0.095), cylinder(0.012, 0.012, 0.02, chrome, 0, 0.49, 0.11, 8).rotateX(Math.PI / 2), box(0.05, 0.025, 0.03, lit(C.black), 0, 0.445, 0.09))
  // Les boules, entassées au fond du globe.
  for (let i = 0; i < 26; i++) {
    const a = random() * Math.PI * 2, r = Math.sqrt(random()) * 0.07, y = 0.565 + random() * 0.075
    g.add(sphere(0.017, lit(GUM[Math.floor(random() * GUM.length)]), Math.cos(a) * r * (1 - (y - 0.565) * 3), y, Math.sin(a) * r * (1 - (y - 0.565) * 3), 6))
  }
  g.add(cylinder(0.05, 0.085, 0.03, body, 0, 0.745, 0, 16), sphere(0.014, chrome, 0, 0.77, 0, 6))
  const live = new THREE.Group()
  live.add(part(new THREE.SphereGeometry(0.1, 16, 12), glass('#eaf6ff', 0.2), 0, 0.64, 0))
  return { solid: g, live }
}

export const ARCADE_DECOR = {
  'arcade-carpet': arcadeCarpet,
  'arcade-neon': arcadeNeon,
  'arcade-mural': arcadeMural,
  'prize-counter': prizeCounter,
  'token-machine': tokenMachine,
  'gumball-machine': gumballMachine,
} satisfies Record<string, Builder>
