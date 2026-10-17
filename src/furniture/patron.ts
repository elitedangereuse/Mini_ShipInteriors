import * as THREE from 'three'
import { box, cylinder, drawnTexture, glass, glow, keepShared, lit, mesh, part, sphere, type Builder } from './kit'
import { tr } from '../i18n'

/*
 * Les mécènes : ceux qui soutiennent l'Élite Dangereuse sur Patreon et ont lié leur compte au site
 * (cf. patreon.php du site). Leur salon, au fond de l'arcade (cf. PATRON_ROOM) : un petit salon Art
 * déco, noir et or, velours lie-de-vin, où l'on trinque au champagne sous le blason du site ; et,
 * dans la salle commune, la plaque dorée où leurs noms sont gravés, que tout le bord peut lire.
 *
 * Le jeu fournit les noms (cf. setPatrons) : le mobilier ne parle pas au site.
 *
 * Un objet accroché est construit dos au mur (origine sur la face du mur, au niveau du sol,
 * contenu vers +z).
 */

const C = {
  gold: '#d9a93e',
  goldLight: '#f6dc8e',
  goldDeep: '#9a6c1c',
  ink: '#3a2708',
  lacquer: '#0d0c0b',
  marble: '#141317',
  velvet: '#5e1624',
  velvetDark: '#3f0d18',
  leather: '#5a2416',
  cream: '#f3e6c4',
}
const SERIF = 'Georgia, "Times New Roman", serif'
const DECO = '"Futura", "Century Gothic", "Avenir Next", "Trebuchet MS", system-ui, sans-serif'

/** Un mécène, tel que le site le montre : son nom visible et son palier. */
export interface Patron {
  name: string
  tier: 'supporter' | 'elite' | 'triple_elite' | string
}

/** Les noms, quand le site les a donnés (null tant qu'il n'a pas répondu), et leur version. */
const roll = { patrons: null as Patron[] | null, error: false, revision: 0 }
/** Le jeu donne la liste des mécènes (cf. community-feed.ts) ; `null` : le site ne répond pas. */
export function setPatrons(patrons: Patron[] | null) {
  if (patrons === null) roll.error = true
  else {
    roll.patrons = patrons
    roll.error = false
  }
  roll.revision++
}

/** L'or brossé d'une plaque : un dégradé en biais, et un grain fin. */
function goldLeaf(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const grad = g.createLinearGradient(x, y, x + w, y + h)
  grad.addColorStop(0, '#b8842a')
  grad.addColorStop(0.28, '#f1cf78')
  grad.addColorStop(0.5, '#c9973a')
  grad.addColorStop(0.74, '#f6dc8e')
  grad.addColorStop(1, '#a8761f')
  g.fillStyle = grad
  g.fillRect(x, y, w, h)
  g.globalAlpha = 0.07
  for (let i = 0; i < h; i += 3) {
    g.fillStyle = i % 2 ? '#fff6d8' : '#5a3a08'
    g.fillRect(x, y + i, w, 1)
  }
  g.globalAlpha = 1
}

/** Un texte gravé dans l'or : le creux sombre, et la lumière qui accroche le bord du bas. */
function engrave(g: CanvasRenderingContext2D, text: string, x: number, y: number, max?: number) {
  g.fillStyle = 'rgba(255, 246, 214, 0.7)'
  g.fillText(text, x, y + 1.5, max)
  g.fillStyle = C.ink
  g.fillText(text, x, y, max)
}

/** Un éventail Art déco : des rayons qui partent d'un point, entre deux angles. */
function fan(g: CanvasRenderingContext2D, x: number, y: number, r: number, from: number, to: number, rays: number, color: string, width: number) {
  g.strokeStyle = color
  g.lineWidth = width
  for (let i = 0; i <= rays; i++) {
    const a = from + ((to - from) * i) / rays
    g.beginPath()
    g.moveTo(x + Math.cos(a) * r * 0.25, y + Math.sin(a) * r * 0.25)
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
    g.stroke()
  }
}

// ---------------------------------------------------------------- la plaque des mécènes

/** Secondes passées sur une page de la plaque. */
const PAGE_TIME = 8
/** Noms par colonne, et colonnes, sur une page. */
const ROWS = 9
const COLS = 2

/**
 * La plaque des mécènes, dans la salle commune : une stèle de marbre noir, debout, où une plaque
 * d'or porte gravés les noms des soutiens Patreon du site, les plus hauts paliers d'abord (une
 * étoile pour l'Élite, trois pour le Triple Élite). Quand ils ne tiennent pas sur la plaque, elle
 * les fait défiler, page par page. Sous sa lampe de laiton. 1,0 × 0,34, 1,4 de haut.
 */
const patronRoll: Builder = () => {
  const W = 640, H = 800
  const Wd = 0.8, Hd = 1.0, Y = 0.76
  const draw = (g: CanvasRenderingContext2D, page: number) => {
    goldLeaf(g, 0, 0, W, H)
    // Le double filet du bord, en creux.
    g.strokeStyle = 'rgba(58, 39, 8, 0.85)'
    g.lineWidth = 4
    g.strokeRect(18, 18, W - 36, H - 36)
    g.lineWidth = 1.5
    g.strokeRect(30, 30, W - 60, H - 60)
    // Les coins : un petit éventail.
    for (const [x, y, a] of [[30, 30, 0], [W - 30, 30, Math.PI / 2], [W - 30, H - 30, Math.PI], [30, H - 30, -Math.PI / 2]] as const) {
      fan(g, x, y, 46, a, a + Math.PI / 2, 5, 'rgba(58, 39, 8, 0.7)', 2)
    }
    g.textAlign = 'center'
    g.textBaseline = 'alphabetic'
    // L'éventail du fronton, et le titre.
    fan(g, W / 2, 96, 70, Math.PI * 1.08, Math.PI * 1.92, 13, 'rgba(58, 39, 8, 0.75)', 2.5)
    g.font = `700 58px ${SERIF}`
    engrave(g, tr('MÉCÈNES', 'PATRONS'), W / 2, 150)
    g.font = `600 19px ${DECO}`
    engrave(g, tr('ILS SOUTIENNENT L’ÉLITE DANGEREUSE', 'THEY SUPPORT ÉLITE DANGEREUSE'), W / 2, 184)
    g.fillStyle = C.ink
    g.fillRect(W / 2 - 200, 204, 400, 2)
    g.fillRect(W / 2 - 6, 199, 12, 12)
    const patrons = roll.patrons
    if (!patrons || !patrons.length) {
      g.font = `italic 600 34px ${SERIF}`
      const lines = patrons
        ? [tr('Votre nom ici', 'Your name here'), '', tr('Soutenez le site sur Patreon,', 'Support the site on Patreon,'), tr('liez votre compte,', 'link your account,'), tr('et il sera gravé.', 'and it will be engraved.')]
        : [roll.error ? tr('Le site ne répond pas', 'The site is not answering') : tr('Gravure en cours…', 'Engraving…')]
      lines.forEach((line, i) => engrave(g, line, W / 2, 330 + i * 52))
    } else {
      const perPage = ROWS * COLS
      const pages = Math.ceil(patrons.length / perPage)
      const shown = patrons.slice((page % pages) * perPage, (page % pages) * perPage + perPage)
      // Une seule colonne, centrée, tant qu'elle suffit.
      const cols = shown.length > ROWS ? COLS : 1
      shown.forEach((p, i) => {
        const col = Math.floor(i / ROWS), row = i % ROWS
        const x = cols === 1 ? W / 2 : W / 2 + (col === 0 ? -1 : 1) * 138
        const stars = p.tier === 'triple_elite' ? '✦✦✦ ' : p.tier === 'elite' ? '✦ ' : ''
        g.font = `${p.tier === 'supporter' ? 600 : 700} ${p.tier === 'triple_elite' ? 27 : 25}px ${SERIF}`
        engrave(g, `${stars}${p.name}`, x, 262 + row * 50, cols === 1 ? 480 : 262)
      })
      // Où l'on en est du défilement : un losange par page.
      if (pages > 1) {
        for (let i = 0; i < pages; i++) {
          const x = W / 2 + (i - (pages - 1) / 2) * 22
          g.fillStyle = i === page % pages ? C.ink : 'rgba(58, 39, 8, 0.35)'
          g.beginPath()
          g.moveTo(x, 712)
          g.lineTo(x + 6, 718)
          g.lineTo(x, 724)
          g.lineTo(x - 6, 718)
          g.fill()
        }
      }
    }
    g.font = `600 17px ${DECO}`
    engrave(g, tr('PATREON · MERCI, COMMANDANTS · o7', 'PATREON · THANK YOU, COMMANDERS · o7'), W / 2, H - 50)
  }
  const map = drawnTexture(W, H, (g) => draw(g, 0))
  map.anisotropy = 8
  const g = new THREE.Group()
  const marble = lit(C.marble, 'metal')
  const brass = lit(C.gold, 'metal')
  g.add(box(1.0, 0.1, 0.34, marble, 0, 0.05, 0, 0.012))
  g.add(box(0.92, 0.03, 0.26, brass, 0, 0.115, 0, 0.006))
  g.add(box(0.94, 1.18, 0.12, marble, 0, 0.72, 0, 0.012))
  // Le cadre d'or autour de la plaque, et le fronton de laiton.
  g.add(box(Wd + 0.06, Hd + 0.06, 0.02, brass, 0, Y, 0.065, 0.006))
  g.add(box(1.0, 0.06, 0.18, brass, 0, 1.34, 0, 0.012))
  g.add(box(0.5, 0.05, 0.1, brass, 0, 1.395, 0, 0.01))
  g.add(cylinder(0.012, 0.012, 0.12, brass, 0, 1.31, 0.12, 6))
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(Wd, Hd), new THREE.MeshBasicMaterial({ map, toneMapped: false }), 0, Y, 0.077))
  // La lampe de tableau, qui éclaire la plaque.
  live.add(part(new THREE.BoxGeometry(0.44, 0.025, 0.05), glow('#ffe7b0'), 0, 1.3, 0.17))
  let drawn = ''
  return {
    solid: g,
    live,
    update(t) {
      const key = `${Math.floor(t / PAGE_TIME)}:${roll.revision}`
      if (key === drawn) return
      drawn = key
      draw((map.image as HTMLCanvasElement).getContext('2d')!, Math.floor(t / PAGE_TIME))
      map.needsUpdate = true
    },
  }
}

// ---------------------------------------------------------------- l'entrée, côté arcade

/** Enseigne au-dessus de la porte : « MÉCÈNES » en lettres d'or sur laque noire, entre deux éventails. */
let signMap: THREE.Texture | null = null
const patronSign: Builder = () => {
  signMap ??= keepShared(drawnTexture(512, 128, (c) => {
    c.fillStyle = C.lacquer
    c.fillRect(0, 0, 512, 128)
    c.strokeStyle = C.gold
    c.lineWidth = 4
    c.strokeRect(8, 8, 496, 112)
    c.lineWidth = 1.5
    c.strokeRect(16, 16, 480, 96)
    fan(c, 16, 64, 44, -Math.PI / 2.4, Math.PI / 2.4, 6, C.gold, 2)
    fan(c, 496, 64, 44, Math.PI - Math.PI / 2.4, Math.PI + Math.PI / 2.4, 6, C.gold, 2)
    const grad = c.createLinearGradient(0, 30, 0, 100)
    grad.addColorStop(0, C.goldLight)
    grad.addColorStop(0.55, C.gold)
    grad.addColorStop(1, C.goldDeep)
    c.fillStyle = grad
    c.font = `700 62px ${SERIF}`
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(tr('MÉCÈNES', 'PATRONS'), 256, 68)
  }))
  const g = new THREE.Group()
  g.add(box(0.9, 0.24, 0.05, lit(C.lacquer, 'metal'), 0, 1.2, 0.025, 0.008))
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(0.86, 0.215), new THREE.MeshBasicMaterial({ map: signMap, toneMapped: false }), 0, 1.2, 0.052))
  live.add(part(new THREE.BoxGeometry(0.7, 0.012, 0.012), glow(C.goldLight), 0, 1.06, 0.04))
  return { solid: g, live }
}

/** Le tapis rouge devant la porte, liseré d'or, posé sur la moquette de l'arcade (`label` : largeur x longueur). */
const patronRunner: Builder = ({ label = '0.9x0.9' }) => {
  const [w, d] = label.split('x').map(Number)
  const PX = 128
  const map = drawnTexture(Math.round(w * PX), Math.round(d * PX), (c) => {
    const cw = c.canvas.width, ch = c.canvas.height
    c.fillStyle = '#7a1020'
    c.fillRect(0, 0, cw, ch)
    c.fillStyle = 'rgba(0, 0, 0, 0.18)'
    for (let y = 0; y < ch; y += 4) c.fillRect(0, y, cw, 1)
    c.fillStyle = C.gold
    c.fillRect(6, 0, 5, ch)
    c.fillRect(cw - 11, 0, 5, ch)
    c.fillRect(15, 0, 2, ch)
    c.fillRect(cw - 17, 0, 2, ch)
  })
  const floor = part(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map, polygonOffset: true, polygonOffsetFactor: -4 }), 0, 0.01, 0)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  const g = new THREE.Group()
  g.add(floor)
  return { solid: g }
}

// ---------------------------------------------------------------- le salon

/**
 * Le tapis du salon, de mur à mur (`label` : largeur x profondeur) : un bleu de nuit presque noir,
 * une frise d'or en gradins, et au centre un médaillon en soleil levant.
 */
const patronFloor: Builder = ({ label = '3x5' }) => {
  const [w, d] = label.split('x').map(Number)
  const PX = 160
  const cw = Math.round(w * PX), ch = Math.round(d * PX)
  const map = drawnTexture(cw, ch, (c) => {
    c.fillStyle = '#0c0f1a'
    c.fillRect(0, 0, cw, ch)
    // Un fin chevron ton sur ton.
    c.strokeStyle = 'rgba(255, 255, 255, 0.025)'
    c.lineWidth = 2
    for (let y = -cw; y < ch + cw; y += 22) {
      c.beginPath()
      c.moveTo(0, y)
      c.lineTo(cw / 2, y + cw / 4)
      c.lineTo(cw, y)
      c.stroke()
    }
    // La frise : trois filets d'or, et des gradins aux coins.
    c.strokeStyle = C.gold
    for (const [inset, lw] of [[14, 6], [28, 2], [40, 2]] as const) {
      c.lineWidth = lw
      c.strokeRect(inset, inset, cw - inset * 2, ch - inset * 2)
    }
    c.fillStyle = C.gold
    for (const [x, y, sx, sy] of [[40, 40, 1, 1], [cw - 40, 40, -1, 1], [cw - 40, ch - 40, -1, -1], [40, ch - 40, 1, -1]] as const) {
      for (let k = 0; k < 3; k++) c.fillRect(x + sx * 8, y + sy * (8 + k * 10), sx * 14 * (3 - k), sy * 4)
    }
    // Le médaillon : un soleil levant, rayons alternés.
    const cx = cw / 2, cy = ch / 2, r = Math.min(cw, ch) * 0.36
    c.strokeStyle = C.gold
    c.lineWidth = 3
    c.beginPath()
    c.arc(cx, cy, r, 0, Math.PI * 2)
    c.stroke()
    c.lineWidth = 1.5
    c.beginPath()
    c.arc(cx, cy, r - 10, 0, Math.PI * 2)
    c.stroke()
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2
      const long = i % 2 === 0
      c.lineWidth = long ? 3 : 1.5
      c.beginPath()
      c.moveTo(cx + Math.cos(a) * r * 0.3, cy + Math.sin(a) * r * 0.3)
      c.lineTo(cx + Math.cos(a) * (r - (long ? 16 : 34)), cy + Math.sin(a) * (r - (long ? 16 : 34)))
      c.stroke()
    }
    c.fillStyle = '#0c0f1a'
    c.beginPath()
    c.arc(cx, cy, r * 0.28, 0, Math.PI * 2)
    c.fill()
    c.strokeStyle = C.gold
    c.lineWidth = 3
    c.stroke()
    c.fillStyle = C.gold
    c.font = `700 ${Math.round(r * 0.24)}px ${SERIF}`
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText('ÉD', cx, cy + 2)
  })
  map.anisotropy = 8
  const floor = part(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map, polygonOffset: true, polygonOffsetFactor: -2 }), 0, 0.006, 0)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  const g = new THREE.Group()
  g.add(floor)
  return { solid: g }
}

/** Le canapé Chesterfield : velours lie-de-vin capitonné, accoudoirs roulés, pieds d'or. 1,3 × 0,62. */
const patronSofa: Builder = () => {
  const g = new THREE.Group()
  const velvet = lit(C.velvet, 'cloth'), deep = lit(C.velvetDark, 'cloth'), brass = lit(C.gold, 'metal')
  g.add(box(1.3, 0.16, 0.6, velvet, 0, 0.13, 0, 0.04))
  for (const x of [-0.31, 0.31]) g.add(box(0.6, 0.09, 0.5, velvet, x, 0.255, 0.04, 0.035))
  g.add(box(1.36, 0.32, 0.15, velvet, 0, 0.37, -0.24, 0.05))
  // Les accoudoirs roulés, à la hauteur du dossier.
  for (const x of [-0.65, 0.65]) {
    g.add(box(0.13, 0.26, 0.6, velvet, x, 0.24, 0, 0.04))
    const roll = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.6, 12), velvet, x, 0.38, 0)
    roll.rotation.x = Math.PI / 2
    g.add(roll)
  }
  // Le capiton : des boutons sombres en quinconce sur le dossier.
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 7 - row; i++) g.add(sphere(0.012, deep, -0.48 + row * 0.08 + i * 0.16, 0.33 + row * 0.1, -0.163, 5))
  }
  for (const x of [-0.6, 0.6]) for (const z of [-0.24, 0.24]) g.add(cylinder(0.022, 0.014, 0.05, brass, x, 0.025, z, 8))
  // Deux coussins : l'or, et le noir brodé.
  g.add(box(0.22, 0.2, 0.08, lit(C.gold, 'cloth'), -0.42, 0.4, -0.13, 0.03), box(0.2, 0.18, 0.08, lit('#1b1a1f', 'cloth'), 0.44, 0.39, -0.13, 0.03))
  return { solid: g }
}

/** Le fauteuil club : cuir sang-de-bœuf, dossier rond, passepoil d'or. 0,62 × 0,62. */
const patronArmchair: Builder = () => {
  const g = new THREE.Group()
  const leather = lit(C.leather, 'leather'), brass = lit(C.gold, 'metal')
  g.add(box(0.6, 0.18, 0.58, leather, 0, 0.14, 0, 0.05))
  g.add(box(0.44, 0.08, 0.44, leather, 0, 0.27, 0.05, 0.04))
  g.add(box(0.62, 0.36, 0.14, leather, 0, 0.36, -0.23, 0.06))
  for (const x of [-0.27, 0.27]) g.add(box(0.1, 0.26, 0.56, leather, x, 0.26, 0, 0.045))
  g.add(box(0.6, 0.012, 0.012, brass, 0, 0.055, 0.29))
  for (const x of [-0.25, 0.25]) for (const z of [-0.24, 0.24]) g.add(cylinder(0.02, 0.014, 0.05, brass, x, 0.025, z, 8))
  return { solid: g }
}

/**
 * La table basse : un plateau rond de marbre noir sur un fût d'or, et dessus le seau à champagne,
 * sa bouteille, deux coupes. 0,6 de diamètre.
 */
const patronTable: Builder = () => {
  const g = new THREE.Group()
  const brass = lit(C.gold, 'metal')
  g.add(cylinder(0.3, 0.3, 0.035, lit(C.marble, 'metal'), 0, 0.33, 0, 28))
  g.add(cylinder(0.305, 0.305, 0.012, brass, 0, 0.312, 0, 28))
  g.add(cylinder(0.04, 0.06, 0.3, brass, 0, 0.16, 0, 10))
  g.add(cylinder(0.18, 0.2, 0.025, brass, 0, 0.0125, 0, 20))
  // Le seau, la bouteille dans la glace.
  g.add(cylinder(0.075, 0.06, 0.14, lit('#c9ccd2', 'metal'), -0.08, 0.418, -0.04, 14))
  g.add(cylinder(0.032, 0.035, 0.16, lit('#123020', 'glass'), -0.08, 0.5, -0.04, 10))
  g.add(cylinder(0.014, 0.022, 0.05, lit(C.gold, 'metal'), -0.08, 0.6, -0.04, 8))
  const live = new THREE.Group()
  for (const [x, z] of [[0.12, 0.06], [0.04, 0.16]]) {
    live.add(part(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 5), glass('#ffffff', 0.5), x, 0.38, z))
    live.add(part(new THREE.CylinderGeometry(0.035, 0.008, 0.025, 12, 1, true), glass('#fff2c0', 0.45), x, 0.42, z))
    live.add(part(new THREE.CylinderGeometry(0.03, 0.008, 0.018, 12), glass('#ffd86a', 0.55), x, 0.418, z))
  }
  return { solid: g, live }
}

/**
 * Le bar des mécènes : un meuble de laque noire à portes d'or, un soleil en marqueterie, et dessus
 * les bouteilles, la pyramide de coupes et un miroir fumé. 0,9 × 0,45, 1,0 de haut.
 */
const patronBar: Builder = () => {
  const g = new THREE.Group()
  const lacquer = lit(C.lacquer, 'metal'), brass = lit(C.gold, 'metal')
  g.add(box(0.9, 0.62, 0.42, lacquer, 0, 0.33, 0.21, 0.01))
  g.add(box(0.94, 0.03, 0.46, brass, 0, 0.655, 0.21, 0.006))
  g.add(box(0.86, 0.03, 0.4, brass, 0, 0.02, 0.21, 0.006))
  // Les portes : la marqueterie d'un soleil levant.
  const door = keepShared(drawnTexture(256, 160, (c) => {
    c.fillStyle = C.lacquer
    c.fillRect(0, 0, 256, 160)
    c.strokeStyle = C.gold
    c.lineWidth = 3
    c.strokeRect(6, 6, 116, 148)
    c.strokeRect(134, 6, 116, 148)
    fan(c, 128, 150, 120, Math.PI, Math.PI * 2, 14, C.gold, 2)
    c.fillStyle = C.gold
    c.beginPath()
    c.arc(128, 150, 28, Math.PI, Math.PI * 2)
    c.fill()
  }))
  g.add(part(new THREE.PlaneGeometry(0.84, 0.52), new THREE.MeshLambertMaterial({ map: door }), 0, 0.33, 0.421))
  // Le miroir fumé, au mur, dans son cadre d'or : sous le haut des murs (1).
  g.add(box(0.8, 0.3, 0.02, brass, 0, 0.83, 0.01, 0.006))
  g.add(box(0.74, 0.25, 0.01, lit('#3a3b44', 'glass'), 0, 0.83, 0.022))
  // Les bouteilles.
  for (const [x, color, h] of [[-0.34, '#1f4a2c', 0.24], [-0.27, '#5a1a12', 0.2], [-0.2, '#c9a24a', 0.22], [0.3, '#1d2a4a', 0.21]] as const) {
    g.add(cylinder(0.028, 0.03, h, lit(color, 'glass'), x, 0.67 + h / 2, 0.16, 10))
    g.add(cylinder(0.01, 0.016, 0.06, lit(color, 'glass'), x, 0.67 + h + 0.03, 0.16, 6))
  }
  const live = new THREE.Group()
  // La pyramide de coupes, au milieu du comptoir.
  const coupe = (x: number, y: number, z: number) => {
    live.add(part(new THREE.CylinderGeometry(0.004, 0.004, 0.05, 5), glass('#ffffff', 0.5), x, y + 0.025, z))
    live.add(part(new THREE.CylinderGeometry(0.034, 0.008, 0.022, 12, 1, true), glass('#fff2c0', 0.5), x, y + 0.061, z))
  }
  for (const [x, z] of [[-0.04, 0.2], [0.04, 0.2], [0, 0.27], [0.08, 0.27], [-0.08, 0.27]]) coupe(x + 0.06, 0.67, z)
  coupe(0.06, 0.745, 0.235)
  return { solid: g, live }
}

/**
 * Le blason des mécènes, au mur : un soleil d'or à rayons alternés autour d'un médaillon noir où
 * se lit le monogramme du site, et le ruban « MERCI ». Il respire doucement. 0,74 × 0,74.
 */
const patronCrest: Builder = () => {
  const S = 512
  const map = keepShared(drawnTexture(S, S, (c) => {
    c.clearRect(0, 0, S, S)
    const cx = S / 2, cy = S / 2 - 20
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2
      const long = i % 2 === 0
      const r0 = 92, r1 = long ? 240 : 190
      const grad = c.createLinearGradient(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
      grad.addColorStop(0, C.goldLight)
      grad.addColorStop(1, C.goldDeep)
      c.fillStyle = grad
      const half = long ? 0.045 : 0.03
      c.beginPath()
      c.moveTo(cx + Math.cos(a - half) * r0, cy + Math.sin(a - half) * r0)
      c.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
      c.lineTo(cx + Math.cos(a + half) * r0, cy + Math.sin(a + half) * r0)
      c.fill()
    }
    c.fillStyle = C.lacquer
    c.beginPath()
    c.arc(cx, cy, 96, 0, Math.PI * 2)
    c.fill()
    c.strokeStyle = C.gold
    c.lineWidth = 7
    c.stroke()
    c.lineWidth = 2
    c.beginPath()
    c.arc(cx, cy, 82, 0, Math.PI * 2)
    c.stroke()
    const grad = c.createLinearGradient(0, cy - 50, 0, cy + 50)
    grad.addColorStop(0, C.goldLight)
    grad.addColorStop(1, C.gold)
    c.fillStyle = grad
    c.font = `700 92px ${SERIF}`
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText('ÉD', cx, cy + 6)
    // Le ruban.
    c.fillStyle = '#6e1424'
    c.beginPath()
    c.moveTo(cx - 190, cy + 140)
    c.lineTo(cx + 190, cy + 140)
    c.lineTo(cx + 170, cy + 168)
    c.lineTo(cx + 190, cy + 196)
    c.lineTo(cx - 190, cy + 196)
    c.lineTo(cx - 170, cy + 168)
    c.closePath()
    c.fill()
    c.strokeStyle = C.gold
    c.lineWidth = 3
    c.stroke()
    c.fillStyle = C.goldLight
    c.font = `700 34px ${DECO}`
    c.fillText(tr('MERCI', 'THANK YOU'), cx, cy + 170)
  }))
  const g = new THREE.Group()
  // Un panneau de laque où il est fixé, qui l'empêche de se perdre dans le mur ; sous le haut des
  // murs (1), pour qu'on le voie aussi d'en haut.
  g.add(box(0.74, 0.74, 0.03, lit(C.lacquer, 'metal'), 0, 0.6, 0.015, 0.01))
  g.add(box(0.78, 0.025, 0.04, lit(C.gold, 'metal'), 0, 0.98, 0.02))
  g.add(box(0.78, 0.025, 0.04, lit(C.gold, 'metal'), 0, 0.22, 0.02))
  const live = new THREE.Group()
  const face = part(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ map, transparent: true, toneMapped: false, depthWrite: false }), 0, 0.6, 0.033)
  live.add(face)
  const material = face.material as THREE.MeshBasicMaterial
  return {
    solid: g,
    live,
    update(t) {
      const k = 0.88 + 0.12 * Math.sin(t * 0.9)
      material.color.setRGB(k, k, k)
    },
  }
}

/** Le lampadaire : un fût de laiton, un abat-jour plissé crème, qui luit. */
const patronLamp: Builder = () => {
  const g = new THREE.Group()
  const brass = lit(C.gold, 'metal')
  g.add(cylinder(0.14, 0.16, 0.03, brass, 0, 0.015, 0, 18))
  g.add(cylinder(0.012, 0.012, 1.08, brass, 0, 0.56, 0, 8))
  g.add(cylinder(0.03, 0.03, 0.03, brass, 0, 0.6, 0, 8))
  const live = new THREE.Group()
  live.add(part(new THREE.CylinderGeometry(0.11, 0.18, 0.2, 16, 1, true), keepShared(new THREE.MeshBasicMaterial({ color: '#ffe6b0', side: THREE.DoubleSide, toneMapped: false })), 0, 1.16, 0))
  live.add(part(new THREE.CylinderGeometry(0.115, 0.115, 0.012, 16), glow(C.gold), 0, 1.26, 0))
  return { solid: g, live }
}

export const PATRON = {
  'patron-roll': patronRoll,
  'patron-sign': patronSign,
  'patron-runner': patronRunner,
  'patron-floor': patronFloor,
  'patron-sofa': patronSofa,
  'patron-armchair': patronArmchair,
  'patron-table': patronTable,
  'patron-bar': patronBar,
  'patron-crest': patronCrest,
  'patron-lamp': patronLamp,
} satisfies Record<string, Builder>
