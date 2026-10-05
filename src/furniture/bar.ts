import * as THREE from 'three'
import { animatedScreen, barX, box, compact, cylinder, drawnTexture, glass, glow, lit, mesh, part, sphere, type Builder } from './kit'
import { tr } from '../i18n'

/*
 * Chez Jacques, le bar clandestin de la cale : même acier que le reste du pont, mais du bois
 * ciré, du laiton et des bouteilles partout. Arrière-bar, comptoir, tabourets, tables de bistro,
 * et Jacques, le robot barman, vissé derrière son comptoir.
 */

const C = {
  wood: '#6e4228',
  woodDark: '#3f2517',
  woodTop: '#2c1a12',
  brass: '#c9a24a',
  chrome: '#c3c9d2',
  steel: '#3b4048',
  steelDark: '#24272d',
  black: '#141519',
  rubber: '#23262b',
  leather: '#8a2c22',
  leatherDark: '#5a1b15',
  cream: '#efe6d2',
  mirror: '#2b3a47',
  amber: '#ffb45e',
  label: '#e9dcc0',
}

/** Verre des bouteilles : ambre, vert, rouge, or, bleu gin, clair, violet, orange (le Brandy de Lave). */
const BOTTLES = ['#6b3a1c', '#2f6b3a', '#8a1f2a', '#d8b86a', '#3a5f8f', '#dfe8ec', '#6d2a6b', '#d0651e', '#4a2412', '#9fbf5a']

/** Largeur d'un meuble en longueur (comptoir, arrière-bar) : `label` en mètres, 3,6 par défaut. */
const widthOf = (label: string | undefined, fallback = 3.6) => {
  const w = Number(label)
  return Number.isFinite(w) && w >= 1 && w <= 6 ? w : fallback
}

/** Une bouteille debout, posée en (x, y, z) : corps (`tall` de haut au plus), épaule, goulot, capsule, étiquette. */
function bottle(g: THREE.Group, x: number, y: number, z: number, color: string, random: () => number, tall = 0.17) {
  const h = 0.1 + random() * (tall - 0.1)
  const r = 0.022 + random() * 0.01
  const m = lit(color)
  g.add(cylinder(r, r, h, m, x, y + h / 2, z, 8))
  g.add(cylinder(0.009, r, 0.035, m, x, y + h + 0.017, z, 8))
  g.add(cylinder(0.009, 0.009, 0.035, m, x, y + h + 0.05, z, 6))
  g.add(cylinder(0.011, 0.011, 0.012, lit(random() < 0.5 ? C.brass : C.black), x, y + h + 0.072, z, 6))
  if (random() < 0.8) g.add(box(r * 1.5, h * 0.4, 0.004, lit(random() < 0.7 ? C.label : C.black), x, y + h * 0.45, z + r))
}

/** Un verre (gobelet ou verre à pied), posé en (x, y, z). */
function tumbler(g: THREE.Group, x: number, y: number, z: number, stem = false) {
  const m = lit('#c9dde6')
  if (stem) {
    g.add(cylinder(0.018, 0.018, 0.004, m, x, y + 0.002, z, 8), cylinder(0.003, 0.003, 0.04, m, x, y + 0.022, z, 5))
    g.add(cylinder(0.022, 0.012, 0.035, m, x, y + 0.058, z, 8))
  } else {
    g.add(cylinder(0.02, 0.017, 0.045, m, x, y + 0.023, z, 8))
  }
}

/** Enseigne au néon « CHEZ JACQUES » (le nom du bar ne se traduit pas), qui grésille de temps en temps. */
let signTexture: THREE.CanvasTexture | null = null
function neonSign(w: number, h: number) {
  signTexture ??= drawnTexture(768, 160, (c) => {
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.font = 'italic 800 104px Georgia, "Times New Roman", serif'
    c.shadowColor = '#ff8a1c'
    c.shadowBlur = 28
    c.fillStyle = '#ffe2bf'
    c.fillText('Chez Jacques', 384, 84)
    c.fillText('Chez Jacques', 384, 84)
  })
  const material = new THREE.MeshBasicMaterial({ map: signTexture, transparent: true, depthWrite: false })
  const sign = part(new THREE.PlaneGeometry(w, h), material)
  return {
    sign,
    update(t: number) {
      const crisis = Math.sin(t * 0.5) + Math.sin(t * 2.3) * 0.5 > 1.35
      material.opacity = crisis && Math.sin(t * 60) > 0 ? 0.4 : 1
    },
  }
}

// ---------------------------------------------------------------- arrière-bar

/**
 * Arrière-bar, adossé au mur (dos à -z, 0,3 de profondeur) : buffet bas couvert de bouteilles,
 * miroir, deux étagères éclairées par-dessous et chargées de bouteilles (celles du haut assez
 * basses pour laisser voir l'enseigne au néon au-dessus). `label` : largeur.
 */
const backBar: Builder = ({ label, random }) => {
  const W = widthOf(label)
  const g = new THREE.Group()
  const wood = lit(C.wood, 'wood'), dark = lit(C.woodDark, 'wood')
  // Buffet bas : portes à panneaux, poignées en laiton, dessus ciré.
  g.add(box(W, 0.32, 0.3, dark, 0, 0.16, 0, 0.01), box(W + 0.02, 0.025, 0.31, lit(C.woodTop, 'wood'), 0, 0.33, 0.005))
  const doors = Math.max(2, Math.round(W / 0.45))
  for (let i = 0; i < doors; i++) {
    const x = -W / 2 + (i + 0.5) * (W / doors)
    g.add(box(W / doors - 0.04, 0.24, 0.01, wood, x, 0.16, 0.152), box(0.012, 0.05, 0.012, lit(C.brass, 'metal'), x + (i % 2 ? -1 : 1) * (W / doors / 2 - 0.05), 0.2, 0.162))
  }
  // Miroir du fond et montants.
  g.add(box(W, 0.56, 0.02, lit(C.mirror), 0, 0.62, -0.14))
  for (const x of [-W / 2, 0, W / 2]) g.add(box(0.05, 0.56, 0.18, wood, x - Math.sign(x) * 0.025, 0.62, -0.06))
  // Étagères, liseré de laiton, néon ambré dessous ; les bouteilles se serrent dessus.
  for (const [y, tall] of [[0.47, 0.17], [0.66, 0.14]]) {
    g.add(box(W - 0.04, 0.02, 0.16, wood, 0, y, -0.06), box(W - 0.04, 0.008, 0.006, lit(C.brass, 'metal'), 0, y + 0.006, 0.022))
    g.add(box(W - 0.1, 0.006, 0.01, glow(C.amber), 0, y - 0.014, 0.0))
    for (let x = -W / 2 + 0.08; x < W / 2 - 0.06; x += 0.055 + random() * 0.03) {
      if (Math.abs(x) < 0.05 || random() < 0.1) continue
      bottle(g, x, y + 0.01, -0.07 + random() * 0.04, BOTTLES[Math.floor(random() * BOTTLES.length)], random, tall)
    }
  }
  // Sur le buffet : des verres retournés, une caisse enregistreuse, encore quelques bouteilles.
  for (let x = -W / 2 + 0.12; x < -W / 2 + 0.7; x += 0.06) tumbler(g, x, 0.343, 0.06, (x * 100) % 2 < 1)
  g.add(box(0.2, 0.1, 0.16, lit(C.steel, 'metal'), W / 2 - 0.3, 0.395, 0.04, 0.01), box(0.16, 0.06, 0.01, glow('#7dffa8'), W / 2 - 0.3, 0.42, 0.122))
  for (let x = -W / 2 + 0.78; x < W / 2 - 0.48; x += 0.06 + random() * 0.05) {
    if (random() < 0.15) continue
    bottle(g, x, 0.343, -0.02 + random() * 0.06, BOTTLES[Math.floor(random() * BOTTLES.length)], random, 0.13)
  }
  // Couronne : planche de bois qui porte l'enseigne.
  g.add(box(W, 0.13, 0.05, dark, 0, 0.965, -0.11, 0.008), box(W, 0.012, 0.06, lit(C.brass, 'metal'), 0, 0.9, -0.11))
  const neon = neonSign(Math.min(W * 0.6, 1.4), 0.2)
  neon.sign.position.set(0, 0.965, -0.08)
  const live = new THREE.Group()
  live.add(neon.sign)
  return { solid: g, live, update: neon.update }
}

// ---------------------------------------------------------------- comptoir

/**
 * Comptoir, face aux clients (+z) : caisson capitonné, dessus ciré au liseré de laiton, repose-pieds,
 * tireuse, verres et chevalet au nom de Jacques. Derrière (-z), le tapis de service qui réserve
 * le passage du barman. `label` : largeur.
 */
const barCounter: Builder = ({ label, random }) => {
  const W = widthOf(label)
  const g = new THREE.Group()
  // Tapis de service, de 0,25 à 0,85 derrière le comptoir.
  g.add(box(W, 0.01, 0.6, lit(C.rubber), 0, 0.005, -0.55))
  g.add(box(W - 0.04, 0.46, 0.44, lit(C.woodDark, 'wood'), 0, 0.23, 0, 0.01))
  // Façade : panneaux de cuir capitonné entre des baguettes de laiton.
  const panels = Math.max(2, Math.round(W / 0.5))
  for (let i = 0; i < panels; i++) {
    const x = -W / 2 + (i + 0.5) * (W / panels)
    g.add(box(W / panels - 0.05, 0.3, 0.02, lit(C.leather, 'leather'), x, 0.25, 0.225, 0.008))
    for (const dx of [-0.06, 0.06]) for (const y of [0.2, 0.3]) g.add(sphere(0.008, lit(C.leatherDark, 'leather'), x + dx, y, 0.237, 5))
  }
  for (let i = 0; i <= panels; i++) g.add(box(0.014, 0.34, 0.014, lit(C.brass, 'metal'), -W / 2 + i * (W / panels), 0.25, 0.235))
  g.add(box(W - 0.04, 0.06, 0.02, lit(C.woodTop, 'wood'), 0, 0.04, 0.225))
  // Dessus ciré, débordant côté clients ; néon ambré sous le rebord.
  g.add(box(W + 0.06, 0.04, 0.56, lit(C.woodTop, 'wood'), 0, 0.48, 0.03, 0.008))
  g.add(box(W + 0.07, 0.012, 0.012, lit(C.brass, 'metal'), 0, 0.47, 0.315), box(W - 0.1, 0.008, 0.008, glow(C.amber), 0, 0.45, 0.285))
  // Repose-pieds en laiton sur ses consoles.
  g.add(barX(0.012, W - 0.1, lit(C.brass, 'metal'), 0, 0.08, 0.3, 8))
  for (let x = -W / 2 + 0.2; x < W / 2 - 0.1; x += 0.8) g.add(box(0.015, 0.02, 0.08, lit(C.brass, 'metal'), x, 0.08, 0.26))
  const top = 0.5
  // Tireuse à bière : colonne chromée, trois becs aux poignées orange Elite.
  const tapX = -W / 2 + 0.45
  g.add(cylinder(0.03, 0.035, 0.18, lit(C.chrome, 'metal'), tapX, top + 0.09, -0.08, 10), box(0.26, 0.04, 0.06, lit(C.chrome, 'metal'), tapX, top + 0.19, -0.08, 0.01))
  for (const dx of [-0.08, 0, 0.08]) {
    g.add(cylinder(0.006, 0.006, 0.04, lit(C.chrome, 'metal'), tapX + dx, top + 0.15, -0.05, 6), box(0.018, 0.07, 0.018, lit('#ff8a1c'), tapX + dx, top + 0.25, -0.08, 0.004))
  }
  g.add(box(0.3, 0.01, 0.1, lit(C.steelDark, 'metal'), tapX, top + 0.005, -0.03))
  // Verres, sous-bocks, un seau à glace et sa bouteille.
  for (let x = -W / 2 + 0.8; x < W / 2 - 0.3; x += 0.35 + random() * 0.4) {
    if (random() < 0.35) continue
    g.add(cylinder(0.035, 0.035, 0.004, lit(C.cream), x, top + 0.002, 0.14, 10))
    tumbler(g, x, top + 0.004, 0.14, random() < 0.4)
  }
  const bucketX = W / 2 - 0.45
  g.add(cylinder(0.06, 0.05, 0.1, lit(C.chrome, 'metal'), bucketX, top + 0.05, -0.06, 12), cylinder(0.055, 0.055, 0.01, lit('#dff2f8'), bucketX, top + 0.095, -0.06, 12))
  bottle(g, bucketX + 0.01, top + 0.03, -0.06, '#2f6b3a', random)
  // Chevalet au nom du barman, tourné vers les clients.
  const card = drawnTexture(256, 96, (c) => {
    c.fillStyle = '#1d1410'; c.fillRect(0, 0, 256, 96)
    c.strokeStyle = C.brass; c.lineWidth = 4; c.strokeRect(6, 6, 244, 84)
    c.textAlign = 'center'; c.fillStyle = '#f3dfb0'
    c.font = 'italic bold 38px Georgia, serif'; c.fillText('Jacques', 128, 48)
    c.font = '18px sans-serif'; c.fillStyle = '#c9a24a'; c.fillText(tr('BARMAN · DEPUIS 3301', 'BARTENDER · SINCE 3301'), 128, 78)
  })
  const tent = mesh(new THREE.PlaneGeometry(0.2, 0.075), new THREE.MeshLambertMaterial({ map: card }), 0.1, top + 0.045, 0.2)
  tent.rotation.x = -0.25
  g.add(tent, box(0.2, 0.075, 0.004, lit('#1d1410'), 0.1, top + 0.045, 0.188))
  return { solid: g }
}

// ---------------------------------------------------------------- tabourets, tables, chaises

/** Tabouret de bar : pied chromé, repose-pieds, assise de cuir (`label` : 'black' pour du noir). */
const barStool: Builder = ({ label }) => {
  const g = new THREE.Group()
  const chrome = lit(C.chrome, 'metal')
  const leather = lit(label === 'black' ? '#1f1d1f' : C.leather, 'leather')
  g.add(cylinder(0.14, 0.15, 0.025, chrome, 0, 0.012, 0, 16), cylinder(0.018, 0.022, 0.36, chrome, 0, 0.19, 0, 8))
  const ring = mesh(new THREE.TorusGeometry(0.1, 0.008, 5, 18), chrome, 0, 0.14, 0)
  ring.rotation.x = Math.PI / 2
  g.add(ring)
  g.add(cylinder(0.15, 0.13, 0.03, chrome, 0, 0.37, 0, 16), cylinder(0.155, 0.15, 0.05, leather, 0, 0.405, 0, 16))
  return { solid: g }
}

/** Table de bistro ronde : plateau ciré cerclé de laiton, pied en fonte, bougie ; verres au hasard. */
const barTable: Builder = ({ random, label }) => {
  const g = new THREE.Group()
  const iron = lit(C.black)
  g.add(cylinder(0.3, 0.3, 0.03, lit(C.woodTop, 'wood'), 0, 0.42, 0, 24), cylinder(0.305, 0.305, 0.012, lit(C.brass, 'metal'), 0, 0.41, 0, 24))
  g.add(cylinder(0.025, 0.03, 0.4, iron, 0, 0.2, 0, 8))
  for (const a of [0, Math.PI / 2]) {
    const foot = box(0.42, 0.025, 0.04, iron, 0, 0.013, 0)
    foot.rotation.y = a
    g.add(foot)
  }
  const top = 0.435
  if (label === 'galactic-clash') {
    // Une table de cartes reconnaissable parmi les tables du bar, avec deux mains face à face.
    g.add(cylinder(0.255, 0.255, 0.006, lit('#173d51'), 0, top + 0.003, 0, 24))
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
      const card = box(0.075, 0.005, 0.11, lit('#e1e9ee'), (i - 1) * 0.075, top + 0.011, side * 0.13)
      card.rotation.y = (i - 1) * -0.1
      g.add(card, box(0.036, 0.003, 0.065, glow(side < 0 ? '#ffaf56' : '#75dfff'), (i - 1) * 0.075, top + 0.015, side * 0.13))
    }
    return { solid: g }
  }
  // Bougie dans son photophore : la flamme luit.
  g.add(cylinder(0.018, 0.018, 0.04, lit(C.cream), 0, top + 0.02, 0, 8), sphere(0.01, glow('#ffcf6a'), 0, top + 0.05, 0, 6))
  g.add(cylinder(0.03, 0.028, 0.006, lit(C.brass, 'metal'), 0, top + 0.003, 0, 10))
  const seats = 2 + Math.floor(random() * 2)
  for (let i = 0; i < seats; i++) {
    const a = random() * Math.PI * 2
    tumbler(g, Math.cos(a) * 0.17, top, Math.sin(a) * 0.17, random() < 0.5)
  }
  if (random() < 0.7) bottle(g, 0.08, top, -0.12, BOTTLES[Math.floor(random() * BOTTLES.length)], random)
  return { solid: g }
}

/** Chaise de bistro : bois sombre, assise de cuir, dossier cintré (côté -z). */
const barChair: Builder = () => {
  const g = new THREE.Group()
  const wood = lit(C.woodDark, 'wood')
  for (const x of [-0.14, 0.14]) {
    for (const z of [-0.13, 0.13]) {
      const leg = cylinder(0.014, 0.012, 0.24, wood, x, 0.12, z, 6)
      leg.rotation.set(z * 0.3, 0, -x * 0.3)
      g.add(leg)
    }
  }
  g.add(cylinder(0.18, 0.17, 0.03, wood, 0, 0.235, 0, 16), cylinder(0.165, 0.165, 0.025, lit(C.leather, 'leather'), 0, 0.26, 0, 16))
  // Dossier : deux montants et une traverse courbe.
  for (const x of [-0.13, 0.13]) {
    const post = cylinder(0.012, 0.012, 0.3, wood, x, 0.4, -0.15, 6)
    post.rotation.x = -0.12
    g.add(post)
  }
  const rail = mesh(new THREE.TorusGeometry(0.14, 0.018, 5, 12, Math.PI), wood, 0, 0.48, -0.08)
  rail.rotation.x = -Math.PI / 2 - 0.12
  g.add(rail, box(0.24, 0.05, 0.02, wood, 0, 0.51, -0.16))
  return { solid: g }
}

// ---------------------------------------------------------------- Jacques

/**
 * Visage de Jacques : un écran où luisent deux yeux et une moustache en guidon de vélo.
 * Il cligne, sourit quand il secoue le shaker, fait un clin d'œil de temps en temps.
 */
function jacquesFace() {
  let mood: 'calm' | 'happy' | 'wink' = 'calm'
  const screen = animatedScreen(128, 96, 12, (c, t) => {
    c.fillStyle = '#0c1a20'
    c.fillRect(0, 0, 128, 96)
    c.fillStyle = c.strokeStyle = '#ffc46a'
    c.lineWidth = 7
    c.lineCap = 'round'
    const blink = t % 4.3 < 0.13
    for (const [x, side] of [[40, -1], [88, 1]] as const) {
      if (mood === 'happy' || (mood === 'wink' && side > 0)) {
        c.beginPath(); c.arc(x, 40, 11, Math.PI * 1.1, Math.PI * 1.9); c.stroke()
      } else if (blink) {
        c.fillRect(x - 11, 36, 22, 5)
      } else {
        c.beginPath(); c.ellipse(x, 36, 9, 13, 0, 0, Math.PI * 2); c.fill()
      }
    }
    // Moustache en guidon, dont les pointes frémissent.
    const k = Math.sin(t * 3) * 2
    c.lineWidth = 8
    for (const s of [-1, 1]) {
      c.beginPath()
      c.moveTo(64, 66)
      c.bezierCurveTo(64 + s * 16, 58, 64 + s * 30, 76, 64 + s * 40, 62 + k)
      c.bezierCurveTo(64 + s * 44, 57 + k, 64 + s * 40, 52, 64 + s * 35, 55)
      c.stroke()
    }
  })
  return {
    texture: screen.texture,
    tick(t: number, m: typeof mood) {
      mood = m
      screen.tick(t)
    },
  }
}

/**
 * Jacques, le robot barman : vissé au sol sur sa colonne (la partie fixe, qui sert aux
 * collisions et au clic), le buste tourne, les bras essuient un verre, secouent le shaker,
 * versent, puis il salue la salle. Gilet, nœud papillon et béret : un barman qui se respecte.
 */
const bartender: Builder = ({ random }) => {
  const g = new THREE.Group()
  const chrome = lit(C.chrome, 'metal'), enamel = lit('#e3ddcf'), dark = lit(C.steelDark, 'metal')
  g.add(cylinder(0.16, 0.18, 0.04, dark, 0, 0.02, 0, 16), cylinder(0.12, 0.12, 0.012, glow('#ffb45e'), 0, 0.045, 0, 16))
  g.add(cylinder(0.045, 0.06, 0.28, chrome, 0, 0.18, 0, 10), cylinder(0.07, 0.07, 0.04, dark, 0, 0.32, 0, 12))

  const live = new THREE.Group()
  const upper = new THREE.Group()
  upper.position.y = 0.34
  live.add(upper)
  // Buste : émail crème, gilet noir, col blanc, nœud papillon rouge, plaque de laiton.
  const body = new THREE.Group()
  body.add(box(0.26, 0.24, 0.17, enamel, 0, 0.12, 0, 0.04))
  body.add(box(0.2, 0.2, 0.012, lit(C.black), 0, 0.11, 0.084, 0.01), box(0.07, 0.12, 0.014, lit('#f4f1ea'), 0, 0.17, 0.086))
  for (const s of [-1, 1]) {
    const bow = box(0.05, 0.035, 0.02, lit('#b0202a'), s * 0.028, 0.215, 0.095, 0.008)
    bow.rotation.z = s * 0.25
    body.add(bow)
  }
  body.add(sphere(0.012, lit('#b0202a'), 0, 0.215, 0.1, 6))
  for (let i = 0; i < 3; i++) body.add(sphere(0.007, lit(C.brass, 'metal'), 0.035, 0.12 - i * 0.035, 0.093, 5))
  body.add(box(0.05, 0.016, 0.004, lit(C.brass, 'metal'), -0.06, 0.16, 0.092))
  body.add(cylinder(0.035, 0.04, 0.05, dark, 0, 0.26, 0, 10))
  upper.add(compact(body))
  // Tête : un écran pour visage, des oreilles d'antenne, un béret.
  const head = new THREE.Group()
  head.position.y = 0.285
  upper.add(head)
  const skull = new THREE.Group()
  skull.add(box(0.21, 0.16, 0.16, enamel, 0, 0.08, 0, 0.04), box(0.17, 0.12, 0.01, lit('#0c1a20'), 0, 0.08, 0.078, 0.01))
  for (const s of [-1, 1]) skull.add(cylinder(0.03, 0.03, 0.02, dark, s * 0.11, 0.08, 0, 10).rotateZ(Math.PI / 2))
  const beret = sphere(0.1, lit('#1b1b24'), 0.02, 0.17, -0.01, 12)
  beret.scale.set(1, 0.32, 0.95)
  beret.rotation.z = -0.18
  skull.add(beret, cylinder(0.006, 0.004, 0.025, lit('#1b1b24'), 0.03, 0.205, -0.01, 5))
  head.add(compact(skull))
  const face = jacquesFace()
  head.add(part(new THREE.PlaneGeometry(0.15, 0.108), new THREE.MeshBasicMaterial({ map: face.texture }), 0, 0.08, 0.0845))

  // Bras : épaule, coude, pince ; le shaker dans la main droite, un verre et un torchon dans la gauche.
  const arms = [-1, 1].map((side) => {
    const shoulder = new THREE.Group()
    shoulder.position.set(side * 0.155, 0.2, 0)
    upper.add(shoulder)
    const arm = new THREE.Group()
    arm.add(sphere(0.035, dark, 0, 0, 0, 8), box(0.05, 0.12, 0.05, enamel, 0, -0.07, 0, 0.015))
    shoulder.add(compact(arm))
    const elbow = new THREE.Group()
    elbow.position.y = -0.13
    shoulder.add(elbow)
    const fore = new THREE.Group()
    fore.add(sphere(0.028, dark, 0, 0, 0, 8), box(0.045, 0.11, 0.045, lit(C.chrome, 'metal'), 0, -0.06, 0, 0.012))
    for (const dx of [-0.018, 0.018]) fore.add(box(0.012, 0.035, 0.03, dark, dx, -0.13, 0))
    elbow.add(compact(fore))
    const hand = new THREE.Group()
    hand.position.y = -0.14
    elbow.add(hand)
    return { shoulder, elbow, hand }
  })
  const [left, right] = arms
  // Shaker : timbale chromée et son couvercle.
  const shaker = new THREE.Group()
  shaker.add(cylinder(0.03, 0.024, 0.09, lit(C.chrome, 'metal'), 0, -0.03, 0, 10), cylinder(0.022, 0.03, 0.04, lit('#dfe4ea'), 0, 0.03, 0, 10))
  right.hand.add(shaker)
  const rag = box(0.07, 0.012, 0.07, lit('#f2efe6'), 0, -0.01, 0.02)
  right.hand.add(rag)
  const wineGlass = new THREE.Group()
  wineGlass.add(cylinder(0.022, 0.012, 0.045, glass('#dff4ff', 0.45), 0, 0.03, 0, 10), cylinder(0.003, 0.003, 0.03, lit('#c9dde6'), 0, 0, 0, 5))
  left.hand.add(wineGlass)
  // Filet de cocktail versé depuis le shaker.
  const pour = part(new THREE.CylinderGeometry(0.005, 0.005, 0.12, 6), glow('#ff9a3c'), 0, -0.1, 0)
  right.hand.add(pour)

  // Postures : [épaule x, épaule z, coude x] par bras, visage, rotation du buste.
  type Pose = { l: [number, number, number]; r: [number, number, number]; mood: 'calm' | 'happy' | 'wink'; turn: number }
  const WIPE: Pose = { l: [-0.9, 0.35, -0.9], r: [-0.9, -0.35, -0.9], mood: 'calm', turn: 0 }
  const SHAKE: Pose = { l: [-0.2, 0.1, -0.3], r: [-2.3, 0.5, -0.7], mood: 'happy', turn: 0 }
  const POUR: Pose = { l: [-1.0, 0.3, -0.5], r: [-1.25, -0.15, -0.35], mood: 'calm', turn: 0 }
  const GREET: Pose = { l: [-0.25, 0.12, -0.3], r: [-0.3, -0.12, -0.4], mood: 'wink', turn: 0 }
  const cur = { l: [...WIPE.l], r: [...WIPE.r], turn: 0 }
  const phase = random() * 20
  let last = 0
  const update = (time: number) => {
    const t = time + phase
    const dt = Math.min(0.1, Math.max(0, time - last))
    last = time
    const c = t % 16
    const pose = c < 5 ? WIPE : c < 8.5 ? SHAKE : c < 10.5 ? POUR : GREET
    const k = 1 - Math.exp(-dt * 7)
    for (const side of ['l', 'r'] as const) for (let i = 0; i < 3; i++) cur[side][i] += (pose[side][i] - cur[side][i]) * k
    const turn = pose === GREET ? Math.sin(t * 0.7) * 0.45 : 0
    cur.turn += (turn - cur.turn) * k
    upper.rotation.y = cur.turn
    upper.position.y = 0.34 + Math.sin(t * 1.6) * 0.004
    // Le geste : essuyer en rond, secouer vite, pencher le shaker, hocher la tête.
    const wipe = pose === WIPE ? Math.sin(t * 5) : 0
    const shake = pose === SHAKE ? Math.sin(t * 30) * 0.18 : 0
    left.shoulder.rotation.set(cur.l[0], 0, cur.l[1])
    left.elbow.rotation.x = cur.l[2]
    right.shoulder.rotation.set(cur.r[0] + shake + wipe * 0.06, 0, cur.r[1] + wipe * 0.08)
    right.elbow.rotation.x = cur.r[2] + Math.cos(t * 5) * (pose === WIPE ? 0.12 : 0)
    right.hand.rotation.z = pose === POUR ? -1.6 : 0
    head.rotation.y = pose === GREET ? Math.sin(t * 0.9) * 0.3 : pose === WIPE ? Math.sin(t * 0.4) * 0.12 : 0
    head.rotation.x = pose === GREET ? Math.max(0, Math.sin(t * 2.2)) * 0.12 : pose === WIPE ? 0.18 : 0
    shaker.visible = pose !== WIPE
    rag.visible = pose === WIPE
    pour.visible = pose === POUR && c > 9
    wineGlass.visible = pose !== SHAKE
    face.tick(t, pose.mood)
  }
  update(0)
  return { solid: g, live, update }
}

export const BAR = {
  'back-bar': backBar,
  'bar-counter': barCounter,
  'bar-stool': barStool,
  'bar-table': barTable,
  'bar-chair': barChair,
  bartender,
} satisfies Record<string, Builder>
