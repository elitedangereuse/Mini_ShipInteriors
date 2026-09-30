import * as THREE from 'three'
import { cobraGeometry } from './cobra'
import { tr } from '../i18n'
import { renderQuality } from '../quality'
import {
  barX, barZ, box, cylinder, drawnTexture, ED_ORANGE, glass, glow, holoMaterial, instanced, lit, mesh, part, setInstance, sphere, type Builder,
} from './kit'

/*
 * Pont supérieur, les quartiers : bois chaud, tissus, plantes, lumières douces. Le dortoir de
 * l'équipage, les douches et la serre y ont aussi leurs petits objets du quotidien.
 */

const C = {
  wood: '#9a6a45',
  woodDark: '#6b4630',
  woodLight: '#c49a6c',
  linen: '#f1e8d8',
  cream: '#fbf4e6',
  white: '#eef1f4',
  chrome: '#b9c1cc',
  steel: '#4f6275',
  soil: '#3a2a1e',
  lamp: '#ffdca6',
}

/** Couleurs de tissu, choisies par le `label` du meuble (« teal », « mustard »…). */
export const FABRIC: Record<string, string> = {
  teal: '#3f8f8c',
  terracotta: '#c0643f',
  mustard: '#d9a441',
  navy: '#34507a',
  sage: '#8fae7e',
  rose: '#d98b8b',
  plum: '#7a4f7a',
  cream: '#e9dcc4',
  purple: '#5a3a8a',
}
export const fabric = (label: string | undefined, fallback: keyof typeof FABRIC) => lit(FABRIC[label ?? ''] ?? FABRIC[fallback])

export const LEAVES = ['#5aa35a', '#3c7a44', '#86c46a', '#4f9a4a']

// ---------------------------------------------------------------- chambre

/** Grand lit : couette, plaid au pied, oreillers… et une peluche qui ressemble à Comète. Couette : `label`. */
const cozyBed: Builder = ({ label }) => {
  const g = new THREE.Group()
  g.add(box(1.25, 0.16, 1.7, lit(C.wood), 0, 0.08, 0, 0.03))
  g.add(box(1.15, 0.12, 1.55, lit(C.linen), 0, 0.22, 0.03, 0.04))
  g.add(box(1.19, 0.07, 1.02, fabric(label, 'teal'), 0, 0.29, 0.28, 0.03), box(1.19, 0.03, 0.12, lit(C.cream), 0, 0.31, -0.24, 0.012))
  g.add(box(1.21, 0.03, 0.26, lit(FABRIC.mustard), 0, 0.335, 0.63, 0.01))
  for (const x of [-0.27, 0.27]) g.add(box(0.42, 0.1, 0.24, lit(C.cream), x, 0.33, -0.6, 0.04))
  g.add(box(0.2, 0.14, 0.07, lit(FABRIC.rose), 0.05, 0.36, -0.44, 0.03))
  g.add(box(1.3, 0.56, 0.08, lit(C.woodDark), 0, 0.34, -0.83, 0.03), box(1.1, 0.34, 0.03, lit('#c9b79a'), 0, 0.4, -0.78, 0.02))
  // La peluche de chat.
  const grey = lit('#8a8f99')
  g.add(sphere(0.07, grey, 0.35, 0.37, 0.2, 10), sphere(0.05, grey, 0.35, 0.45, 0.25, 10))
  for (const x of [0.32, 0.38]) g.add(mesh(new THREE.ConeGeometry(0.018, 0.04, 4), grey, x, 0.5, 0.25))
  return { solid: g }
}

/** Lits superposés, échelle au pied. Couvertures : `label` (en bas) et moutarde (en haut). */
const bunkBed: Builder = ({ label }) => {
  const g = new THREE.Group()
  const post = lit(C.woodDark)
  for (const [x, z] of [[-0.28, -0.55], [0.28, -0.55], [-0.28, 0.55], [0.28, 0.55]]) g.add(box(0.045, 0.96, 0.045, post, x, 0.48, z))
  for (const [y, blanket] of [[0.18, fabric(label, 'navy')], [0.62, lit(FABRIC.terracotta)]] as const) {
    g.add(box(0.6, 0.05, 1.12, lit(C.wood), 0, y, 0), box(0.54, 0.06, 1.04, lit(C.linen), 0, y + 0.055, 0, 0.02))
    g.add(box(0.56, 0.03, 0.62, blanket, 0, y + 0.095, 0.2, 0.01), box(0.36, 0.06, 0.18, lit(C.cream), 0, y + 0.1, -0.38, 0.025))
  }
  g.add(box(0.02, 0.1, 0.8, post, 0.29, 0.74, -0.05))
  for (const x of [-0.1, 0.1]) g.add(box(0.02, 0.78, 0.02, post, x, 0.39, 0.58))
  for (const y of [0.2, 0.4, 0.6]) g.add(barX(0.01, 0.2, post, 0, y, 0.58, 6))
  return { solid: g }
}

/** Table de chevet : lampe allumée, livre, tasse. */
const nightstand: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.34, 0.28, 0.32, lit(C.wood), 0, 0.14, 0, 0.02), box(0.28, 0.01, 0.01, lit(C.woodDark), 0, 0.16, 0.162), sphere(0.012, lit(C.chrome), 0, 0.2, 0.165, 6))
  g.add(cylinder(0.04, 0.045, 0.02, lit(C.woodDark), -0.07, 0.29, -0.04, 10), cylinder(0.008, 0.008, 0.12, lit(C.chrome), -0.07, 0.36, -0.04, 6))
  g.add(cylinder(0.05, 0.08, 0.09, glow(C.lamp), -0.07, 0.45, -0.04, 12))
  g.add(box(0.12, 0.025, 0.09, lit(FABRIC.plum), 0.08, 0.293, 0.05), cylinder(0.025, 0.025, 0.05, lit(C.white), 0.1, 0.305, -0.08, 10))
  return { solid: g }
}

/** Canapé trois places, coussins contrastés, plaid sur l'accoudoir. Tissu : `label`. */
const sofa: Builder = ({ label }) => {
  const g = new THREE.Group()
  const cloth = fabric(label, 'terracotta')
  g.add(box(1.3, 0.16, 0.6, cloth, 0, 0.12, 0, 0.04))
  for (const x of [-0.31, 0.31]) g.add(box(0.6, 0.1, 0.5, cloth, x, 0.25, 0.04, 0.04))
  g.add(box(1.3, 0.34, 0.16, cloth, 0, 0.36, -0.23, 0.05))
  for (const x of [-0.62, 0.62]) g.add(box(0.14, 0.28, 0.6, cloth, x, 0.25, 0, 0.05))
  g.add(box(0.22, 0.2, 0.08, lit(FABRIC.mustard), -0.42, 0.38, -0.12, 0.03), box(0.2, 0.18, 0.08, lit(C.cream), 0.44, 0.37, -0.12, 0.03))
  g.add(box(0.16, 0.02, 0.5, lit(FABRIC.sage), 0.62, 0.4, 0.02, 0.01), box(0.16, 0.2, 0.02, lit(FABRIC.sage), 0.62, 0.3, 0.28))
  for (const x of [-0.58, 0.58]) for (const z of [-0.25, 0.25]) g.add(cylinder(0.02, 0.015, 0.05, lit(C.woodDark), x, 0.025, z, 6))
  return { solid: g }
}

/** Pouf. Tissu : `label`. */
const beanbag: Builder = ({ label }) => {
  const g = new THREE.Group()
  const bag = mesh(new THREE.IcosahedronGeometry(0.27, 2), fabric(label, 'mustard'), 0, 0.16, 0)
  bag.scale.set(1, 0.6, 1)
  g.add(bag)
  return { solid: g }
}

/** Table basse : théière, deux tasses, un livre. */
const coffeeTable: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.8, 0.04, 0.5, lit(C.wood), 0, 0.2, 0, 0.015))
  for (const x of [-0.34, 0.34]) for (const z of [-0.2, 0.2]) g.add(cylinder(0.02, 0.018, 0.18, lit(C.woodDark), x, 0.09, z, 6))
  g.add(sphere(0.055, lit(C.white), -0.18, 0.27, 0, 10), sphere(0.015, lit(C.white), -0.18, 0.33, 0, 6))
  const spout = cylinder(0.01, 0.014, 0.07, lit(C.white), -0.11, 0.28, 0, 6)
  spout.rotation.z = -0.9
  g.add(spout)
  for (const [x, z] of [[0.02, 0.1], [0.12, -0.1]]) g.add(cylinder(0.025, 0.02, 0.035, lit(C.cream), x, 0.238, z, 10))
  g.add(box(0.14, 0.025, 0.1, lit(FABRIC.navy), 0.24, 0.233, 0.08), box(0.12, 0.02, 0.09, lit(FABRIC.rose), 0.25, 0.255, 0.08))
  return { solid: g }
}

/**
 * Tapis : bordure, fond, deux rayures. `label` = « palette » ou « palette:LxP »
 * (palettes : warm, blue, rubber, neon, bath, bar, arcade, cinema, cosy).
 */
const RUGS: Record<string, [string, string, string]> = {
  warm: ['#b8563a', '#efe0c4', '#d9a441'],
  blue: ['#34507a', '#e9e2d0', '#8fae7e'],
  rubber: ['#2a2d33', '#3a3e46', '#5a5f68'],
  neon: ['#241640', '#3a2766', '#ff4fd8'],
  bath: ['#6fa8b8', '#dff0f4', '#ffffff'],
  bar: ['#3c1712', '#5e241b', '#c9a24a'],
  arcade: ['#1f5a63', '#b8573c', '#e8b24a'],
  cinema: ['#2a0a10', '#4a1119', '#c9a24a'],
  cosy: ['#4a2a22', '#7a4232', '#d9a441'],
}
const rug: Builder = ({ label = 'warm' }) => {
  const [name, size] = label.split(':')
  const [w, d] = (size ?? '1.8x1.2').split('x').map(Number)
  const [border, field, stripe] = RUGS[name] ?? RUGS.warm
  const g = new THREE.Group()
  g.add(box(w, 0.012, d, lit(border), 0, 0.012, 0), box(w - 0.16, 0.014, d - 0.16, lit(field), 0, 0.014, 0))
  for (const z of [-d * 0.28, d * 0.28]) g.add(box(w - 0.3, 0.016, 0.05, lit(stripe), 0, 0.015, z))
  return { solid: g }
}

/** Lampadaire, abat-jour allumé. */
const floorLamp: Builder = () => {
  const g = new THREE.Group()
  g.add(cylinder(0.12, 0.13, 0.03, lit(C.woodDark), 0, 0.015, 0, 14), cylinder(0.012, 0.012, 0.82, lit(C.chrome), 0, 0.44, 0, 6))
  g.add(cylinder(0.1, 0.15, 0.16, glow(C.lamp), 0, 0.9, 0, 14))
  return { solid: g }
}

/** Plante touffue en pot de terre cuite. */
const plant: Builder = ({ random }) => {
  const g = new THREE.Group()
  g.add(cylinder(0.15, 0.11, 0.22, lit('#b8653f'), 0, 0.11, 0, 12), cylinder(0.14, 0.14, 0.02, lit(C.soil), 0, 0.215, 0, 12))
  for (let i = 0; i < 6; i++) {
    const a = random() * Math.PI * 2, d = random() * 0.09
    g.add(mesh(new THREE.IcosahedronGeometry(0.08 + random() * 0.06, 0), lit(LEAVES[i % 4]), Math.cos(a) * d, 0.3 + random() * 0.14, Math.sin(a) * d))
  }
  return { solid: g }
}

/** Grande plante (façon palmier) en pot de céramique. */
const plantTall: Builder = ({ random }) => {
  const g = new THREE.Group()
  g.add(cylinder(0.14, 0.12, 0.26, lit('#e9e2d6'), 0, 0.13, 0, 12), cylinder(0.13, 0.13, 0.02, lit(C.soil), 0, 0.255, 0, 12))
  const trunk = cylinder(0.02, 0.035, 0.55, lit('#7a5a3a'), 0, 0.53, 0, 6)
  trunk.rotation.z = 0.05
  g.add(trunk)
  for (let i = 0; i < 8; i++) {
    const frond = new THREE.Group()
    frond.position.set(0.012, 0.8, 0)
    frond.rotation.set(0, (i / 8) * Math.PI * 2 + random() * 0.3, 0)
    const leaf = new THREE.Group()
    leaf.rotation.x = 0.55 + random() * 0.35
    leaf.add(box(0.05, 0.012, 0.34, lit(LEAVES[i % 4]), 0, 0, 0.16))
    frond.add(leaf)
    g.add(frond)
  }
  return { solid: g }
}

/** Bibliothèque : trois étagères de livres, une plante et un cadre sur le dessus. */
const bookshelf: Builder = ({ random }) => {
  const g = new THREE.Group()
  const wood = lit(C.wood)
  for (const x of [-0.435, 0.435]) g.add(box(0.03, 0.95, 0.3, wood, x, 0.475, 0))
  g.add(box(0.9, 0.03, 0.3, wood, 0, 0.935, 0), box(0.9, 0.03, 0.3, wood, 0, 0.015, 0), box(0.9, 0.95, 0.02, lit(C.woodDark), 0, 0.475, -0.14))
  for (const y of [0.31, 0.62]) g.add(box(0.84, 0.02, 0.28, wood, 0, y, 0))
  const spines = ['#8a3b32', '#34507a', '#d9a441', '#3f8f8c', '#e9dcc4', '#5a3a8a', '#2f2f35', '#c0643f']
  for (const y0 of [0.03, 0.32, 0.63]) {
    let x = -0.41
    while (x < 0.36) {
      const w = 0.03 + random() * 0.035, h = 0.15 + random() * 0.1
      if (random() < 0.1) {
        x += 0.05
        continue
      }
      const book = box(w, h, 0.2, lit(spines[Math.floor(random() * spines.length)]), x + w / 2, y0 + h / 2, 0.02)
      if (random() < 0.12) book.rotation.z = -0.25
      g.add(book)
      x += w + 0.004
    }
  }
  g.add(cylinder(0.05, 0.04, 0.07, lit('#b8653f'), 0.3, 0.985, 0, 10), mesh(new THREE.IcosahedronGeometry(0.06, 0), lit(LEAVES[0]), 0.3, 1.06, 0))
  g.add(box(0.16, 0.12, 0.02, lit(C.woodDark), -0.2, 1.01, 0.02), box(0.12, 0.08, 0.005, lit('#7fa4c9'), -0.2, 1.01, 0.032))
  return { solid: g }
}

/**
 * Écran du bureau : la page d'accueil d'elitedangereuse.fr, dessinée (bandeau et logo du site,
 * menu, grande bannière, trois cartes d'actualité). Le logo arrive après coup : on redessine.
 */
function siteHomeScreen(): THREE.CanvasTexture {
  const W = 512, H = 294
  const paint = (c: CanvasRenderingContext2D, logo?: HTMLImageElement) => {
    c.fillStyle = '#0d0f14'; c.fillRect(0, 0, W, H)
    // Bandeau : logo, menu, bouton de connexion.
    c.fillStyle = '#16191f'; c.fillRect(0, 0, W, 44)
    c.fillStyle = '#ff6600'; c.fillRect(0, 44, W, 2)
    if (logo) c.drawImage(logo, 10, 5, 107, 34)
    else { c.fillStyle = '#ff6600'; c.font = 'bold 16px sans-serif'; c.textBaseline = 'middle'; c.fillText('ÉLITE DANGEREUSE', 12, 22) }
    c.font = '11px sans-serif'; c.textBaseline = 'middle'; c.fillStyle = '#c8ccd4'
    const menu = [tr('Actus', 'News'), tr('Guides', 'Guides'), tr('Aventures', 'Adventures'), 'Radio', 'Discord']
    let x = 136
    for (const m of menu) { c.fillText(m, x, 23); x += c.measureText(m).width + 16 }
    c.font = 'bold 10px sans-serif'
    const login = tr('CONNEXION', 'LOG IN'), lw = c.measureText(login).width + 14
    c.fillStyle = '#ff6600'; c.fillRect(W - 10 - lw, 13, lw, 20)
    c.fillStyle = '#0d0f14'; c.fillText(login, W - 3 - lw, 23)
    // Bannière : un ciel étoilé, une planète, le titre.
    const sky = c.createLinearGradient(0, 52, 0, 168)
    sky.addColorStop(0, '#1a1030'); sky.addColorStop(1, '#3a1a10')
    c.fillStyle = sky; c.fillRect(10, 54, W - 20, 116)
    for (let i = 0; i < 70; i++) {
      c.fillStyle = i % 5 ? 'rgba(255, 255, 255, 0.55)' : '#ffd8a8'
      c.fillRect(12 + ((i * 97.3) % (W - 24)), 56 + ((i * 53.7) % 110), 1.4, 1.4)
    }
    const planet = c.createRadialGradient(400, 150, 10, 420, 170, 90)
    planet.addColorStop(0, '#ffb070'); planet.addColorStop(0.6, '#c0501a'); planet.addColorStop(1, 'rgba(60, 20, 10, 0)')
    c.save(); c.beginPath(); c.rect(10, 54, W - 20, 116); c.clip()
    c.fillStyle = planet; c.beginPath(); c.arc(420, 175, 85, 0, Math.PI * 2); c.fill()
    c.restore()
    c.fillStyle = '#ffffff'; c.font = 'bold 22px sans-serif'; c.textBaseline = 'alphabetic'
    c.fillText(tr('Le BASTION francophone', 'The French-speaking BASTION'), 26, 100)
    c.fillText(tr('d\'Elite Dangerous', 'of Elite Dangerous'), 26, 126)
    c.fillStyle = '#ff6600'; c.fillRect(26, 140, 110, 20)
    c.fillStyle = '#0d0f14'; c.font = 'bold 11px sans-serif'; c.fillText(tr('REJOINDRE', 'JOIN US'), 48, 154)
    // Trois cartes d'actualité.
    const cards = [['#2a4a6a', tr('Actualités', 'News')], ['#5a3a1a', tr('Guides', 'Guides')], ['#3a2a5a', tr('Aventures', 'Adventures')]] as const
    cards.forEach(([color, label], i) => {
      const x = 10 + i * 166
      c.fillStyle = '#1b1f27'; c.fillRect(x, 180, 158, 104)
      c.fillStyle = color; c.fillRect(x, 180, 158, 52)
      c.fillStyle = '#ff6600'; c.font = 'bold 11px sans-serif'; c.fillText(label.toUpperCase(), x + 8, 250)
      c.fillStyle = '#8a909c'
      for (let l = 0; l < 2; l++) c.fillRect(x + 8, 260 + l * 10, 130 - l * 40, 4)
    })
  }
  const texture = drawnTexture(W, H, (c) => paint(c))
  const context = (texture.image as HTMLCanvasElement).getContext('2d')!
  const logo = new Image()
  logo.onload = () => { paint(context, logo); texture.needsUpdate = true }
  logo.src = import.meta.env.BASE_URL + 'logo-elite-dangereuse.svg'
  return texture
}

/** Bureau : écran affichant elitedangereuse.fr, clavier, tasse, lampe, et une maquette de Cobra Mk III. */
const desk: Builder = () => {
  const g = new THREE.Group()
  g.add(box(1.1, 0.04, 0.55, lit(C.wood), 0, 0.38, 0, 0.012), box(0.3, 0.36, 0.5, lit(C.woodDark), -0.38, 0.18, 0))
  for (const z of [-0.2, 0.2]) g.add(box(0.04, 0.36, 0.04, lit(C.woodDark), 0.5, 0.18, z))
  for (const y of [0.12, 0.26]) g.add(box(0.26, 0.01, 0.01, lit(C.wood), -0.38, y, 0.252))
  g.add(box(0.05, 0.08, 0.05, lit('#2a2e36'), 0.05, 0.44, -0.16), box(0.44, 0.27, 0.025, lit('#2a2e36'), 0.05, 0.6, -0.17, 0.01))
  g.add(part(new THREE.PlaneGeometry(0.4, 0.23), new THREE.MeshBasicMaterial({ map: siteHomeScreen() }), 0.05, 0.6, -0.156))
  g.add(box(0.3, 0.015, 0.1, lit('#2a2e36'), 0.05, 0.408, 0.08), cylinder(0.03, 0.03, 0.06, lit(C.white), -0.3, 0.43, 0.12, 10))
  const handle = mesh(new THREE.TorusGeometry(0.018, 0.006, 4, 10), lit(C.white), -0.27, 0.43, 0.12)
  handle.rotation.y = Math.PI / 2
  g.add(handle)
  // Lampe de bureau.
  g.add(cylinder(0.04, 0.045, 0.015, lit('#2a2e36'), 0.42, 0.408, -0.15, 10))
  const arm = cylinder(0.008, 0.008, 0.26, lit('#2a2e36'), 0.42, 0.53, -0.1, 6)
  arm.rotation.x = 0.4
  g.add(arm, cylinder(0.025, 0.05, 0.05, lit(ED_ORANGE), 0.42, 0.64, -0.03, 10), sphere(0.02, glow(C.lamp), 0.42, 0.62, -0.03, 8))
  // Maquette de Cobra Mk III sur son socle.
  g.add(cylinder(0.035, 0.045, 0.02, lit(C.woodDark), 0.3, 0.41, 0.12, 10), cylinder(0.005, 0.005, 0.06, lit(C.chrome), 0.3, 0.45, 0.12, 4))
  const cobra = mesh(cobraGeometry(), lit('#c9cdd4'), 0.3, 0.49, 0.12)
  cobra.scale.setScalar(0.09)
  cobra.rotation.set(-0.15, 0.7, 0.1)
  g.add(cobra)
  return { solid: g }
}

/** Aquarium : sable, plantes, six poissons qui tournent et des bulles. */
const aquarium: Builder = ({ random }) => {
  const g = new THREE.Group()
  g.add(box(0.9, 0.36, 0.38, lit(C.woodDark), 0, 0.18, 0, 0.02), box(0.84, 0.04, 0.34, lit('#d9c49a'), 0, 0.4, 0))
  for (let i = 0; i < 5; i++) {
    const h = 0.1 + random() * 0.14
    g.add(mesh(new THREE.ConeGeometry(0.025, h, 5), lit(LEAVES[i % 4]), -0.35 + i * 0.17 + random() * 0.05, 0.42 + h / 2, -0.08 + random() * 0.1))
  }
  for (let i = 0; i < 4; i++) g.add(mesh(new THREE.DodecahedronGeometry(0.025, 0), lit(['#8a8f99', '#c9a27a', '#6f7a86'][i % 3]), -0.2 + i * 0.13, 0.43, 0.08))
  g.add(box(0.9, 0.04, 0.38, lit('#2a2e36'), 0, 0.76, 0), box(0.8, 0.008, 0.02, glow('#bfe8ff'), 0, 0.737, 0.12))

  const live = new THREE.Group()
  live.add(
    part(new THREE.BoxGeometry(0.86, 0.34, 0.36), glass('#bfe8ff', 0.16), 0, 0.57, 0),
    part(new THREE.BoxGeometry(0.84, 0.3, 0.34), holoMaterial(null, '#3a9dff', 0.16, 0, true), 0, 0.56, 0),
  )
  const fishColors = ['#ff8a3c', '#ffd23c', '#3cc8ff', '#ff5a8a', '#ff8a3c', '#9dff5a']
  const fishGeo = new THREE.ConeGeometry(0.018, 0.06, 5).rotateZ(-Math.PI / 2)
  const fish = instanced(fishGeo, fishColors)
  const swim = fishColors.map((_, i) => ({ r: 0.18 + random() * 0.16, y: 0.47 + random() * 0.18, speed: (0.35 + random() * 0.4) * (i % 2 ? 1 : -1), phase: random() * 6 }))
  const bubbles = instanced(new THREE.SphereGeometry(0.008, 5, 4), Array(6).fill('#e8f8ff'))
  live.add(fish, bubbles)
  return {
    solid: g,
    live,
    update: (t) => {
      swim.forEach((s, i) => {
        const a = s.phase + t * s.speed
        setInstance(fish, i, Math.cos(a) * s.r, s.y + Math.sin(t * 1.3 + i) * 0.015, Math.sin(a) * 0.1, 1, -a + (s.speed > 0 ? -Math.PI / 2 : Math.PI / 2))
      })
      fish.instanceMatrix.needsUpdate = true
      for (let i = 0; i < 6; i++) {
        const k = (t * 0.4 + i / 6) % 1
        setInstance(bubbles, i, 0.34 + Math.sin(i * 3 + t * 3) * 0.01, 0.43 + k * 0.28, 0.05, 0.7 + k)
      }
      bubbles.instanceMatrix.needsUpdate = true
    },
  }
}

/** Cheminée holographique : de fausses bûches, des flammes d'hologramme, des braises qui s'envolent. */
const fireplace: Builder = ({ random }) => {
  const g = new THREE.Group()
  g.add(box(1.3, 0.36, 0.34, lit('#6b6259'), 0, 0.18, 0, 0.02), box(0.8, 0.26, 0.02, lit('#121212'), 0, 0.17, 0.162))
  g.add(box(1.42, 0.04, 0.38, lit(C.wood), 0, 0.38, 0, 0.01))
  for (const [x, rot] of [[-0.12, 0.25], [0.12, -0.2]] as const) {
    const log = barX(0.04, 0.34, lit('#4a3020'), x, 0.07, 0.2, 8)
    log.rotation.y = rot
    g.add(log)
  }
  // Sur le manteau : bougies, cadre photo, petite plante.
  for (const x of [-0.5, -0.42]) g.add(cylinder(0.022, 0.022, 0.08 + (x + 0.5) * 0.6, lit(C.cream), x, 0.44, 0.02, 8), sphere(0.012, glow('#ffd27a'), x, 0.5 + (x + 0.5) * 0.3, 0.02, 6))
  g.add(box(0.16, 0.13, 0.02, lit(C.woodDark), 0.1, 0.465, -0.05), box(0.12, 0.09, 0.005, lit('#d98b5a'), 0.1, 0.465, -0.038))
  g.add(cylinder(0.045, 0.035, 0.07, lit('#b8653f'), 0.5, 0.435, 0, 10), mesh(new THREE.IcosahedronGeometry(0.06, 0), lit(LEAVES[2]), 0.5, 0.51, 0))

  const live = new THREE.Group()
  const flames = [-0.22, -0.11, 0, 0.11, 0.22].map((x, i) => {
    const h = 0.16 + random() * 0.08
    const f = part(new THREE.ConeGeometry(0.06, h, 8, 1, true), holoMaterial(null, ['#ff6a1c', '#ffa23c', '#ffd27a'][i % 3], 0.85, 1, true), x, 0.06 + h / 2, 0.19)
    live.add(f)
    return { f, h, phase: random() * 6 }
  })
  const embers = instanced(new THREE.BoxGeometry(0.012, 0.012, 0.012), Array(8).fill('#ffae4a'))
  live.add(embers)
  return {
    solid: g,
    live,
    update: (t) => {
      flames.forEach(({ f, h, phase }) => {
        const s = 0.8 + 0.25 * Math.sin(t * 9 + phase) + 0.12 * Math.sin(t * 23 + phase * 2)
        f.scale.set(1 + 0.1 * Math.sin(t * 13 + phase), s, 1)
        f.position.y = 0.06 + (h * s) / 2
      })
      for (let i = 0; i < 8; i++) {
        const k = (t * 0.5 + i / 8) % 1
        setInstance(embers, i, -0.25 + ((i * 0.37) % 0.5) + Math.sin(t * 2 + i) * 0.03, 0.08 + k * 0.28, 0.19, 1 - k)
      }
      embers.instanceMatrix.needsUpdate = true
    },
  }
}

/** Casier vitré : une combinaison sur son mannequin (Maverick par défaut, ou `label` = artemis). */
const suitLocker: Builder = ({ label }) => {
  const artemis = label === 'artemis'
  const suit = lit(artemis ? '#e9eef4' : '#c98a34'), dark = lit(artemis ? '#aab6c4' : '#3a3e46')
  const g = new THREE.Group()
  const steel = lit('#3a3e46')
  g.add(box(0.7, 0.04, 0.45, steel, 0, 0.02, 0), box(0.7, 0.04, 0.45, steel, 0, 0.98, 0), box(0.7, 1.0, 0.03, steel, 0, 0.5, -0.21))
  for (const x of [-0.335, 0.335]) g.add(box(0.03, 1.0, 0.45, steel, x, 0.5, 0))
  // Fond éclairé, comme une vitrine : le mannequin s'y découpe.
  g.add(box(0.64, 0.9, 0.01, glow('#e9dcc2'), 0, 0.5, -0.19), box(0.3, 0.035, 0.01, glow(ED_ORANGE), 0, 0.98, 0.228))
  // Mannequin.
  g.add(cylinder(0.12, 0.12, 0.03, dark, 0, 0.055, 0, 12))
  for (const x of [-0.05, 0.05]) g.add(box(0.07, 0.3, 0.08, suit, x, 0.22, 0, 0.02))
  g.add(box(0.2, 0.24, 0.12, suit, 0, 0.48, 0, 0.03))
  for (const x of [-0.13, 0.13]) g.add(box(0.05, 0.24, 0.06, dark, x, 0.47, 0, 0.02))
  g.add(box(0.18, 0.16, 0.17, dark, 0, 0.7, 0, 0.05), box(0.16, 0.18, 0.06, dark, 0, 0.5, -0.09, 0.02))
  g.add(box(0.14, 0.07, 0.01, glow(artemis ? '#a8ecff' : '#ffb640'), 0, 0.7, 0.087))
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(0.64, 0.92), glass('#d8ecff', 0.18), 0, 0.5, 0.222))
  return { solid: g, live }
}

/** Malle de pied de lit : cantine d'acier cerclée, autocollants, une serviette pliée et des bottes à côté. */
const footlocker: Builder = () => {
  const g = new THREE.Group()
  const steel = lit('#3f5a4a'), band = lit('#2a3a30')
  g.add(box(0.52, 0.22, 0.3, steel, 0, 0.11, 0, 0.015), box(0.54, 0.05, 0.32, band, 0, 0.245, 0, 0.012))
  for (const x of [-0.18, 0.18]) g.add(box(0.03, 0.23, 0.31, band, x, 0.115, 0))
  g.add(box(0.06, 0.05, 0.01, lit(C.chrome), 0, 0.2, 0.158), box(0.1, 0.06, 0.004, lit(ED_ORANGE), -0.09, 0.12, 0.152))
  g.add(box(0.07, 0.07, 0.004, lit('#e9dcc4'), 0.1, 0.1, 0.152), box(0.05, 0.012, 0.005, lit('#34507a'), 0.1, 0.1, 0.155))
  // Serviette pliée sur le couvercle, bottes de vol au pied.
  g.add(box(0.22, 0.04, 0.16, lit(FABRIC.teal), 0.1, 0.29, 0, 0.012), box(0.2, 0.012, 0.16, lit(C.cream), 0.1, 0.305, 0))
  for (const x of [-0.33, -0.43]) g.add(box(0.07, 0.14, 0.09, lit('#2a2e36'), x, 0.07, 0.04, 0.02), box(0.07, 0.04, 0.16, lit('#2a2e36'), x, 0.02, 0.08, 0.015))
  return { solid: g }
}

/** Patères au mur : deux blousons de vol, un casque et une serviette. */
const coatHooks: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.62, 0.05, 0.03, lit(C.woodDark), 0, 0.84, 0.015, 0.01))
  for (const x of [-0.22, 0, 0.22]) g.add(barZ(0.008, 0.07, lit(C.chrome), x, 0.82, 0.05, 6))
  // Blousons : un orange aux bandes réfléchissantes, un bleu marine, épaules et manches pendantes.
  for (const [x, color] of [[-0.22, ED_ORANGE], [0.22, '#34507a']] as const) {
    const cloth = lit(color)
    g.add(box(0.18, 0.34, 0.06, cloth, x, 0.62, 0.07, 0.025), box(0.2, 0.05, 0.07, cloth, x, 0.77, 0.07, 0.02))
    for (const s of [-1, 1]) g.add(box(0.045, 0.28, 0.05, cloth, x + s * 0.11, 0.62, 0.08, 0.015))
    g.add(box(0.17, 0.02, 0.005, lit('#e8eef4'), x, 0.56, 0.1), box(0.01, 0.3, 0.005, lit('#2a2e36'), x, 0.62, 0.101))
  }
  // Casque accroché au milieu, visière ambrée ; serviette rayée qui pend dessous.
  g.add(sphere(0.07, lit('#e9e2d6'), 0, 0.73, 0.09, 12), box(0.09, 0.05, 0.02, glow('#ffb640'), 0, 0.72, 0.155, 0.01))
  g.add(box(0.12, 0.2, 0.012, lit(FABRIC.sage), 0, 0.55, 0.05), box(0.12, 0.02, 0.013, lit(C.cream), 0, 0.5, 0.05))
  return { solid: g }
}

/** Tableau de liège de l'équipage : tours de corvée, photos, post-it, une carte avec l'itinéraire. */
const crewBoard: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.74, 0.46, 0.03, lit(C.woodDark), 0, 0.62, 0.015, 0.008))
  const face = drawnTexture(352, 216, (c) => {
    c.fillStyle = '#b98b5a'
    c.fillRect(0, 0, 352, 216)
    for (let i = 0; i < 700; i++) {
      c.fillStyle = i % 2 ? 'rgba(90, 55, 25, 0.25)' : 'rgba(255, 220, 170, 0.18)'
      c.fillRect((i * 137.3) % 352, (i * 71.9) % 216, 2, 2)
    }
    const pin = (x: number, y: number, color: string) => {
      c.fillStyle = color
      c.beginPath()
      c.arc(x, y, 5, 0, Math.PI * 2)
      c.fill()
    }
    // La feuille des corvées.
    c.save()
    c.translate(18, 16)
    c.rotate(-0.03)
    c.fillStyle = '#f7f3ea'
    c.fillRect(0, 0, 118, 150)
    c.fillStyle = '#2a2e36'
    c.font = '700 13px system-ui, sans-serif'
    c.fillText(tr('CORVÉES', 'CHORES'), 10, 20)
    c.font = '11px system-ui, sans-serif'
    const chores = [tr('Vaisselle', 'Dishes'), tr('Filtres', 'Filters'), tr('Plantes', 'Plants'), tr('Litière', 'Litter'), tr('Quart', 'Watch')]
    const who = ['Jacques', 'Julia', 'James', tr('Vous', 'You'), 'Comète']
    chores.forEach((chore, i) => {
      c.fillStyle = '#2a2e36'
      c.fillText(chore, 10, 44 + i * 22)
      c.fillStyle = '#c0643f'
      c.fillText(who[i], 62, 44 + i * 22)
      c.fillStyle = 'rgba(42, 46, 54, 0.2)'
      c.fillRect(8, 49 + i * 22, 102, 1)
    })
    c.restore()
    pin(78, 18, '#d9453a')
    // Deux photos façon polaroïd.
    for (const [x, y, rot, sky, ground] of [[150, 22, 0.08, '#3a6ac0', '#c98a4a'], [150, 110, -0.06, '#1a1440', '#8a5ad0']] as const) {
      c.save()
      c.translate(x, y)
      c.rotate(rot)
      c.fillStyle = '#fbfaf5'
      c.fillRect(0, 0, 74, 84)
      c.fillStyle = sky
      c.fillRect(6, 6, 62, 58)
      c.fillStyle = ground
      c.beginPath()
      c.arc(37, 80, 44, Math.PI, 0)
      c.fill()
      c.fillStyle = '#fbfaf5'
      c.fillRect(0, 64, 74, 20)
      c.restore()
      pin(x + 36, y + 6, '#3f8f8c')
    }
    // La carte, l'itinéraire tracé au feutre rouge.
    c.save()
    c.translate(238, 20)
    c.rotate(0.04)
    c.fillStyle = '#0d1428'
    c.fillRect(0, 0, 98, 86)
    c.fillStyle = '#cfe0ff'
    for (let i = 0; i < 40; i++) c.fillRect((i * 53) % 96, (i * 31) % 84, 1.5, 1.5)
    c.strokeStyle = '#ff5a4a'
    c.lineWidth = 2
    c.beginPath()
    c.moveTo(12, 70)
    c.lineTo(34, 48)
    c.lineTo(58, 56)
    c.lineTo(84, 16)
    c.stroke()
    c.restore()
    pin(287, 22, '#d9a441')
    // Post-it.
    for (const [x, y, color, text] of [[246, 124, '#ffe46a', tr('Rendre le casque', 'Return the helmet')], [292, 150, '#ff9ac0', 'o7 !']] as const) {
      c.fillStyle = color
      c.fillRect(x, y, 54, 50)
      c.fillStyle = '#3a2a4a'
      c.font = '600 10px system-ui, sans-serif'
      c.fillText(text, x + 4, y + 20, 48)
    }
  })
  g.add(part(new THREE.PlaneGeometry(0.68, 0.42), new THREE.MeshLambertMaterial({ map: face }), 0, 0.62, 0.032))
  return { solid: g }
}

/** Panier à linge en osier : chaussettes, un tee-shirt qui dépasse. */
const laundryBasket: Builder = () => {
  const g = new THREE.Group()
  const wicker = lit('#c49a6c')
  g.add(cylinder(0.16, 0.13, 0.3, wicker, 0, 0.15, 0, 14))
  for (const y of [0.08, 0.16, 0.24]) {
    const ring = mesh(new THREE.TorusGeometry(0.15 - y * 0.08, 0.008, 4, 18), lit(C.woodDark), 0, y, 0)
    ring.rotation.x = Math.PI / 2
    g.add(ring)
  }
  g.add(sphere(0.1, lit(FABRIC.navy), -0.03, 0.29, 0.02, 8), sphere(0.08, lit(C.linen), 0.05, 0.3, -0.03, 8))
  const shirt = box(0.14, 0.02, 0.1, lit(FABRIC.terracotta), 0.13, 0.28, 0.05, 0.008)
  shirt.rotation.z = -0.7
  g.add(shirt, box(0.05, 0.03, 0.1, lit(FABRIC.mustard), -0.08, 0.33, -0.05, 0.01))
  return { solid: g }
}

/** Double casier d'équipage, cabossé et couvert d'autocollants. */
const locker: Builder = () => {
  const g = new THREE.Group()
  for (const x of [-0.2, 0.2]) {
    g.add(box(0.38, 0.9, 0.34, lit(C.steel), x, 0.45, 0, 0.01))
    for (let i = 0; i < 3; i++) g.add(box(0.2, 0.012, 0.005, lit('#2a3440'), x, 0.8 - i * 0.03, 0.172))
    g.add(box(0.02, 0.08, 0.02, lit(C.chrome), x + 0.13, 0.5, 0.178))
  }
  g.add(box(0.06, 0.06, 0.005, lit(ED_ORANGE), -0.26, 0.62, 0.173), box(0.07, 0.05, 0.005, lit(FABRIC.teal), 0.14, 0.3, 0.173))
  return { solid: g }
}

// ---------------------------------------------------------------- sanitaires

/** Douche sonique d'angle : parois carrelées, parois vitrées, pommeau, flacons. */
const shower: Builder = () => {
  const g = new THREE.Group()
  const tile = lit('#8ec5cf')
  g.add(box(0.8, 0.06, 0.8, lit(C.white), 0, 0.03, 0), box(0.8, 0.95, 0.04, tile, 0, 0.5, -0.38), box(0.04, 0.95, 0.8, tile, -0.38, 0.5, 0))
  g.add(cylinder(0.012, 0.012, 0.82, lit(C.chrome), 0, 0.47, -0.34, 6), barZ(0.012, 0.12, lit(C.chrome), 0, 0.88, -0.29, 6), cylinder(0.07, 0.05, 0.02, lit(C.chrome), 0, 0.86, -0.22, 12))
  g.add(box(0.04, 0.6, 0.005, glow('#8ff0ff'), 0.25, 0.45, -0.357))
  g.add(box(0.2, 0.02, 0.08, lit(C.white), -0.28, 0.5, -0.28))
  ;['#ff8a6a', '#6ad0ff', '#d9f06a'].forEach((col, i) => g.add(cylinder(0.018, 0.018, 0.07, lit(col), -0.34 + i * 0.045, 0.545, -0.3, 8)))
  const live = new THREE.Group()
  const front = part(new THREE.PlaneGeometry(0.78, 0.86), glass('#d8f4ff', 0.2), 0, 0.49, 0.39)
  const side = part(new THREE.PlaneGeometry(0.78, 0.86), glass('#d8f4ff', 0.2), 0.39, 0.49, 0)
  side.rotation.y = Math.PI / 2
  live.add(front, side)
  // Les ondes de la douche sonique : des anneaux pâles qui descendent du pommeau, en boucle.
  const waveMat = new THREE.MeshBasicMaterial({ color: '#8ff0ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
  const waves = [0, 1, 2].map(() => {
    const w = part(new THREE.TorusGeometry(0.2, 0.006, 4, 28), waveMat.clone())
    w.rotation.x = Math.PI / 2
    live.add(w)
    return w
  })
  return {
    solid: g,
    live,
    update(t) {
      for (const [i, w] of waves.entries()) {
        const k = (t * 0.45 + i / 3) % 1
        w.visible = !renderQuality.light
        w.position.set(0, 0.84 - k * 0.76, -0.02)
        w.scale.setScalar(0.55 + k * 0.5)
        ;(w.material as THREE.MeshBasicMaterial).opacity = Math.sin(k * Math.PI) * 0.28
      }
    },
  }
}

/** Porte-serviettes chauffant, au mur : barreaux chromés, deux serviettes pliées dessus. */
const towelRail: Builder = () => {
  const g = new THREE.Group()
  const chrome = lit(C.chrome)
  for (const x of [-0.24, 0.24]) g.add(cylinder(0.012, 0.012, 0.56, chrome, x, 0.55, 0.05, 6), barZ(0.01, 0.05, chrome, x, 0.3, 0.025, 6), barZ(0.01, 0.05, chrome, x, 0.8, 0.025, 6))
  for (let i = 0; i < 6; i++) g.add(barX(0.008, 0.48, chrome, 0, 0.32 + i * 0.09, 0.05, 6))
  g.add(box(0.2, 0.3, 0.035, lit(FABRIC.teal), -0.1, 0.62, 0.07, 0.012), box(0.2, 0.025, 0.036, lit(C.cream), -0.1, 0.52, 0.07))
  g.add(box(0.18, 0.24, 0.035, lit(FABRIC.rose), 0.12, 0.66, 0.07, 0.012))
  g.add(box(0.04, 0.02, 0.01, glow('#ff8a5a'), 0.24, 0.26, 0.06))
  return { solid: g }
}

/** Armoire de toilette murale : porte-miroir entrouverte, étagère de flacons, verre à dents. */
const bathCabinet: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.44, 0.3, 0.12, lit(C.white), 0, 0.72, 0.06, 0.01), box(0.4, 0.01, 0.1, lit('#dfe3e8'), 0, 0.66, 0.07))
  // Porte miroir entrouverte, pivotée sur sa charnière gauche.
  const door = new THREE.Group()
  door.position.set(-0.21, 0.72, 0.125)
  door.rotation.y = -0.6
  door.add(box(0.21, 0.28, 0.012, lit('#dfe3e8'), 0.105, 0, 0), box(0.18, 0.25, 0.004, lit('#bcd7e3'), 0.105, 0, 0.008))
  g.add(door)
  // L'intérieur, côté droit : flacons, dentifrice, gobelet et deux brosses.
  ;['#6ad0ff', '#ff8a6a', '#d9f06a'].forEach((col, i) => g.add(cylinder(0.018, 0.018, 0.07 - i * 0.01, lit(col), 0.05 + i * 0.045, 0.7 - i * 0.005, 0.08, 8)))
  g.add(box(0.1, 0.02, 0.03, lit('#f4f7fa'), 0.1, 0.78, 0.08))
  // Tablette sous l'armoire : gobelet et brosses à dents.
  g.add(box(0.36, 0.02, 0.1, lit(C.white), 0, 0.53, 0.05), cylinder(0.022, 0.018, 0.06, lit(FABRIC.teal), -0.1, 0.57, 0.06, 8))
  for (const [x, col] of [[-0.11, '#ff8a6a'], [-0.09, '#6ad0ff']] as const) {
    const brush = cylinder(0.004, 0.004, 0.1, lit(col), x, 0.62, 0.06, 4)
    brush.rotation.z = x < -0.1 ? 0.2 : -0.2
    g.add(brush)
  }
  g.add(cylinder(0.03, 0.03, 0.05, lit(C.cream), 0.1, 0.565, 0.06, 10), sphere(0.012, glow('#8ff0ff'), 0.18, 0.84, 0.12, 6))
  return { solid: g }
}

/** Pèse-personne à affichage lumineux, posé au sol. */
const bathScale: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.28, 0.035, 0.3, lit(C.white), 0, 0.018, 0, 0.015), box(0.24, 0.004, 0.18, lit('#dfe3e8'), 0, 0.037, 0.03))
  g.add(box(0.1, 0.004, 0.04, glow('#7dffa8'), 0, 0.038, -0.1))
  return { solid: g }
}

/** Lavabo sur meuble, miroir, gobelet. */
const sink: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.6, 0.34, 0.4, lit(C.wood), 0, 0.17, 0, 0.02), box(0.62, 0.04, 0.42, lit(C.white), 0, 0.36, 0))
  g.add(box(0.36, 0.05, 0.24, lit(C.white), 0, 0.395, 0.03, 0.02), box(0.28, 0.01, 0.18, lit('#8ec5cf'), 0, 0.42, 0.03))
  g.add(cylinder(0.01, 0.01, 0.08, lit(C.chrome), 0, 0.42, -0.12, 6), barZ(0.008, 0.08, lit(C.chrome), 0, 0.46, -0.09, 6))
  g.add(box(0.46, 0.4, 0.03, lit('#dfe3e8'), 0, 0.68, -0.18), box(0.4, 0.34, 0.005, lit('#bcd7e3'), 0, 0.68, -0.163))
  g.add(cylinder(0.02, 0.018, 0.06, lit(FABRIC.teal), 0.22, 0.41, -0.1, 8), box(0.05, 0.02, 0.03, lit('#ffd8e8'), -0.2, 0.39, -0.1))
  return { solid: g }
}

/** Toilettes à dépression. */
const toilet: Builder = () => {
  const g = new THREE.Group()
  g.add(cylinder(0.13, 0.1, 0.2, lit(C.white), 0, 0.1, 0.05, 14))
  const seat = mesh(new THREE.TorusGeometry(0.11, 0.025, 5, 16), lit(C.white), 0, 0.21, 0.05)
  seat.rotation.x = Math.PI / 2
  g.add(seat, box(0.3, 0.3, 0.12, lit(C.white), 0, 0.3, -0.18, 0.02), sphere(0.02, glow('#8ff0ff'), 0, 0.46, -0.16, 6))
  return { solid: g }
}

// ---------------------------------------------------------------- serre et coins détente

/** Bac hydroponique à deux étages, sous LED roses. */
const hydroRack: Builder = ({ random }) => {
  const g = new THREE.Group()
  const frame = lit('#dfe3e8')
  for (const x of [-0.57, 0.57]) for (const z of [-0.2, 0.2]) g.add(box(0.03, 0.86, 0.03, frame, x, 0.43, z))
  for (const y of [0.18, 0.5]) {
    g.add(box(1.16, 0.06, 0.42, frame, 0, y, 0), box(1.1, 0.02, 0.36, lit(C.soil), 0, y + 0.035, 0))
    g.add(box(1.1, 0.03, 0.06, lit('#2a2e36'), 0, y + 0.25, 0), box(1.06, 0.02, 0.012, glow('#ff6ad5'), 0, y + 0.25, 0.036))
    for (let i = 0; i < 8; i++) {
      const x = -0.48 + i * 0.137, z = (random() - 0.5) * 0.2, kind = random()
      if (kind < 0.4) {
        const lettuce = mesh(new THREE.IcosahedronGeometry(0.055, 1), lit(LEAVES[i % 4]), x, y + 0.08, z)
        lettuce.scale.y = 0.6
        g.add(lettuce)
      } else if (kind < 0.75) g.add(mesh(new THREE.ConeGeometry(0.03, 0.12, 5), lit(LEAVES[(i + 1) % 4]), x, y + 0.1, z))
      else g.add(mesh(new THREE.ConeGeometry(0.035, 0.11, 5), lit(LEAVES[1]), x, y + 0.095, z), sphere(0.018, lit('#e0453a'), x + 0.02, y + 0.1, z + 0.02, 6))
    }
  }
  g.add(barX(0.012, 1.14, lit(C.chrome), 0, 0.12, -0.19, 6))
  return { solid: g }
}

/**
 * Mur végétal, au mur : trois rangées de poches de feutre débordantes de feuillage et de fleurs,
 * goutte-à-goutte, rampe de LED roses au-dessus. Largeur : `label` (mètres, 1,6 par défaut).
 */
const plantWall: Builder = ({ label, random }) => {
  const width = Number(label) || 1.6
  const g = new THREE.Group()
  g.add(box(width, 0.78, 0.03, lit('#2f3a2a'), 0, 0.5, 0.015, 0.01))
  const cols = Math.round(width / 0.2)
  const flowers = ['#ff6ad5', '#ffd23c', '#ffffff', '#ff8a5a']
  for (const y of [0.22, 0.46, 0.7]) {
    g.add(box(width - 0.04, 0.012, 0.03, lit('#8a9099'), 0, y + 0.13, 0.04))
    for (let i = 0; i < cols; i++) {
      const x = -width / 2 + 0.1 + i * ((width - 0.2) / (cols - 1))
      g.add(box(0.16, 0.1, 0.07, lit('#4a3a2a'), x, y, 0.05, 0.02))
      for (let k = 0; k < 3; k++) {
        const leaf = mesh(new THREE.IcosahedronGeometry(0.045 + random() * 0.035, 0), lit(LEAVES[Math.floor(random() * 4)]), x + (random() - 0.5) * 0.14, y + 0.05 + random() * 0.08, 0.08 + random() * 0.04)
        leaf.scale.y = 0.8
        g.add(leaf)
      }
      // Du lierre qui retombe, une fleur de temps en temps.
      if (random() < 0.45) g.add(box(0.02, 0.12 + random() * 0.1, 0.02, lit(LEAVES[1]), x + (random() - 0.5) * 0.1, y - 0.1, 0.09, 0.008))
      if (random() < 0.35) g.add(sphere(0.022, lit(flowers[Math.floor(random() * 4)]), x + (random() - 0.5) * 0.1, y + 0.1, 0.12, 6))
    }
  }
  g.add(box(width, 0.035, 0.1, lit('#2a2e36'), 0, 0.93, 0.06), box(width - 0.06, 0.012, 0.012, glow('#ff6ad5'), 0, 0.91, 0.11))
  return { solid: g }
}

/**
 * Établi de rempotage : plateaux de semis, pots de terre cuite, sac de terreau, arrosoir,
 * transplantoir ; bocaux de graines sur l'étagère du dessous. Face à +z.
 */
const pottingBench: Builder = ({ random }) => {
  const g = new THREE.Group()
  const wood = lit(C.woodLight), dark = lit(C.wood)
  g.add(box(1.0, 0.04, 0.42, wood, 0, 0.42, 0, 0.01), box(1.0, 0.03, 0.38, dark, 0, 0.14, 0))
  for (const x of [-0.47, 0.47]) for (const z of [-0.18, 0.18]) g.add(box(0.04, 0.42, 0.04, dark, x, 0.21, z))
  g.add(box(1.0, 0.18, 0.02, wood, 0, 0.53, -0.2))
  // Deux plateaux de semis, rangées de pousses.
  for (const x of [-0.3, 0.02]) {
    g.add(box(0.28, 0.04, 0.22, lit('#2a2e36'), x, 0.46, 0.02), box(0.26, 0.012, 0.2, lit(C.soil), x, 0.48, 0.02))
    for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) {
      const h = 0.03 + random() * 0.04
      g.add(mesh(new THREE.ConeGeometry(0.014, h, 4), lit(LEAVES[(i + k) % 4]), x - 0.1 + i * 0.066, 0.49 + h / 2, -0.05 + k * 0.07))
    }
  }
  // Pots vides empilés, le sac de terreau ouvert, l'arrosoir.
  for (let i = 0; i < 3; i++) g.add(cylinder(0.06, 0.045, 0.06, lit('#b8653f'), 0.3, 0.47 + i * 0.03, -0.08, 10))
  g.add(box(0.18, 0.2, 0.1, lit('#6b8a3a'), 0.36, 0.26, 0.05, 0.03), box(0.15, 0.03, 0.08, lit(C.soil), 0.36, 0.37, 0.05, 0.01))
  g.add(cylinder(0.05, 0.055, 0.1, lit('#3f8f8c'), 0.3, 0.49, 0.11, 10))
  const spout = cylinder(0.008, 0.012, 0.12, lit('#3f8f8c'), 0.37, 0.52, 0.11, 6)
  spout.rotation.z = -1.0
  g.add(spout)
  // Bocaux de graines sur la tablette basse.
  ;['#d9a441', '#8a5a3a', '#e9dcc4', '#5aa35a'].forEach((col, i) => g.add(cylinder(0.035, 0.035, 0.08, lit(col), -0.36 + i * 0.1, 0.195, 0.02, 8), cylinder(0.037, 0.037, 0.015, lit(C.woodDark), -0.36 + i * 0.1, 0.24, 0.02, 8)))
  return { solid: g }
}

/** Cuve de solution nutritive : colonne vitrée où montent des bulles, tuyaux vers les bacs, manomètre. */
const nutrientTank: Builder = ({ random }) => {
  const g = new THREE.Group()
  const steel = lit('#dfe3e8'), dark = lit('#2a2e36')
  g.add(cylinder(0.2, 0.22, 0.1, dark, 0, 0.05, 0, 16), cylinder(0.2, 0.2, 0.06, dark, 0, 0.85, 0, 16))
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    g.add(box(0.03, 0.72, 0.03, steel, Math.cos(a) * 0.19, 0.46, Math.sin(a) * 0.19))
  }
  g.add(cylinder(0.165, 0.165, 0.6, glow('#3fd08a'), 0, 0.42, 0, 16))
  // Tuyaux qui partent vers les bacs, manomètre et vanne.
  g.add(barX(0.02, 0.3, steel, 0.3, 0.8, 0, 8), cylinder(0.02, 0.02, 0.5, steel, 0.44, 0.55, 0, 8))
  g.add(cylinder(0.045, 0.045, 0.02, steel, 0.0, 0.72, 0.21, 12))
  const gauge = cylinder(0.04, 0.04, 0.012, lit('#f4f7fa'), 0, 0.72, 0.222, 12)
  gauge.rotation.x = Math.PI / 2
  g.add(gauge, box(0.004, 0.03, 0.004, lit('#d9453a'), 0.008, 0.73, 0.23))
  g.add(cylinder(0.035, 0.035, 0.015, lit('#d9453a'), 0.3, 0.86, 0, 10))
  const live = new THREE.Group()
  live.add(part(new THREE.CylinderGeometry(0.18, 0.18, 0.62, 18, 1, true), glass('#d8fff0', 0.25), 0, 0.42, 0))
  const COUNT = 10
  const bubbles = instanced(new THREE.SphereGeometry(0.012, 6, 4), Array(COUNT).fill('#e8fff4'))
  const rise = Array.from({ length: COUNT }, () => ({ x: (random() - 0.5) * 0.2, z: (random() - 0.5) * 0.2, speed: 0.25 + random() * 0.3, phase: random() }))
  live.add(bubbles)
  return {
    solid: g,
    live,
    update(t) {
      bubbles.visible = !renderQuality.light
      if (!bubbles.visible) return
      rise.forEach((b, i) => {
        const k = (t * b.speed + b.phase) % 1
        setInstance(bubbles, i, b.x + Math.sin(t * 3 + i) * 0.01, 0.14 + k * 0.56, b.z, 0.6 + k * 0.6)
      })
      bubbles.instanceMatrix.needsUpdate = true
    },
  }
}

/**
 * Drone pollinisateur : un petit bourdon mécanique qui fait la tournée des plantes, en huit,
 * ses rotors flous et son voyant qui clignote. Sans collision. Rayon de sa ronde : `label`.
 */
const pollinatorDrone: Builder = ({ label }) => {
  const reach = Number(label) || 0.8
  const drone = new THREE.Group()
  drone.add(sphere(0.035, lit('#ffd23c'), 0, 0, 0, 10), box(0.05, 0.012, 0.02, lit('#2a2e36'), 0, 0, 0.025))
  for (const x of [-0.045, 0.045]) {
    drone.add(barX(0.004, 0.04, lit('#2a2e36'), x * 0.6, 0.02, 0, 4))
    const rotor = part(new THREE.CircleGeometry(0.03, 12), glass('#e8f4ff', 0.35), x, 0.03, 0)
    rotor.rotation.x = -Math.PI / 2
    drone.add(rotor)
  }
  const led = sphere(0.01, glow('#7dffa8'), 0, -0.03, 0, 6)
  drone.add(led)
  const live = new THREE.Group()
  live.add(drone)
  return {
    live,
    update(t) {
      const a = t * 0.5
      drone.position.set(Math.sin(a) * reach, 0.82 + Math.sin(t * 1.7) * 0.06, Math.sin(a * 2) * reach * 0.45)
      drone.rotation.y = Math.atan2(Math.cos(a) * reach, Math.cos(a * 2) * reach * 0.9)
      drone.rotation.z = Math.sin(t * 9) * 0.06
      led.visible = Math.floor(t * 2) % 2 === 0
    },
  }
}

/** Panier de Comète : coussin rose, rebord moelleux, et une souris en tissu. */
const catBed: Builder = () => {
  const g = new THREE.Group()
  g.add(cylinder(0.22, 0.2, 0.06, lit(C.woodLight), 0, 0.03, 0, 16), cylinder(0.16, 0.16, 0.03, lit(FABRIC.rose), 0, 0.07, 0, 16))
  const rim = mesh(new THREE.TorusGeometry(0.18, 0.045, 6, 18), lit(FABRIC.cream), 0, 0.085, 0)
  rim.rotation.x = Math.PI / 2
  g.add(rim)
  const grey = lit('#8a8f99')
  g.add(sphere(0.03, grey, 0.25, 0.03, 0.1, 8), sphere(0.012, lit(FABRIC.rose), 0.23, 0.055, 0.12, 6))
  const tail = cylinder(0.004, 0.004, 0.08, grey, 0.29, 0.015, 0.1, 4)
  tail.rotation.z = Math.PI / 2
  g.add(tail)
  return { solid: g }
}

/** Banc de bois, coussin. */
const bench: Builder = ({ label }) => {
  const g = new THREE.Group()
  for (const z of [-0.1, 0, 0.1]) g.add(box(1.0, 0.025, 0.09, lit(C.woodLight), 0, 0.28, z))
  for (const x of [-0.42, 0.42]) g.add(box(0.05, 0.27, 0.3, lit('#3a3e46'), x, 0.135, 0))
  g.add(box(0.4, 0.04, 0.26, fabric(label, 'sage'), -0.2, 0.31, 0, 0.02))
  return { solid: g }
}

export const COZY = {
  'cozy-bed': cozyBed,
  'bunk-bed': bunkBed,
  nightstand,
  sofa,
  beanbag,
  'coffee-table': coffeeTable,
  rug,
  'floor-lamp': floorLamp,
  plant,
  'plant-tall': plantTall,
  bookshelf,
  desk,
  aquarium,
  fireplace,
  'suit-locker': suitLocker,
  locker,
  footlocker,
  'coat-hooks': coatHooks,
  'crew-board': crewBoard,
  'laundry-basket': laundryBasket,
  shower,
  sink,
  toilet,
  'towel-rail': towelRail,
  'bath-cabinet': bathCabinet,
  'bath-scale': bathScale,
  'hydro-rack': hydroRack,
  'plant-wall': plantWall,
  'potting-bench': pottingBench,
  'nutrient-tank': nutrientTank,
  'pollinator-drone': pollinatorDrone,
  bench,
  'cat-bed': catBed,
} satisfies Record<string, Builder>
