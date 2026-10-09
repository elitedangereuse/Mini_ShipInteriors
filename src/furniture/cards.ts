import * as THREE from 'three'
import { backUrl, cardUrl, cardsInfo, coverUrl, type CardsInfo, type Rarity } from '../cards/site'
import { tr } from '../i18n'
import { counterStaff } from './counter-staff'
import { animatedScreen, beamMaterial, box, cylinder, drawnTexture, glass, glow, holoMaterial, keepShared, lit, mesh, part, pointCloud, sphere, type Builder } from './kit'

/*
 * Le Comptoir des Cartes Dangereuses, au fond du hall du pont supérieur : la boutique de boosters
 * (un mur de sachets, ceux du site, chacun sa collection), Ludo derrière son comptoir, l'autel
 * d'ouverture au milieu de la pièce, les tables de Galactic Clash, les pupitres où feuilleter sa
 * collection, les vitrines des cartes du jour. Une pièce où l'on a envie de rester : parquet de
 * noyer et tapis, laiton, velours bleu nuit, guirlandes d'ampoules, lampes à vitrail, un chariot de
 * chocolat chaud. Ce qu'on y fait est dans src/cards/.
 *
 * Un objet accroché est construit dos au mur (origine sur la face du mur, au niveau du sol,
 * contenu vers +z).
 */

const C = {
  walnut: '#5a3a26', walnutDark: '#3a2418', walnutLight: '#8a5c3a', brass: '#c9a24a', brassDark: '#8f6f2c',
  night: '#16233a', nightDeep: '#0e1626', velvet: '#1d3a5c', felt: '#17414a', cream: '#f1e6d0', ink: '#11151c',
  amber: '#ffc46b', cyan: '#7fe3ff',
}
/** Couleurs des raretés : commune, rare, ultra-rare, mythique. */
export const RARITY_COLORS: Record<Rarity, string> = { c: '#cfd6de', r: '#49a6ff', u: '#ffc94a', m: '#ff5ad0' }
const haloMaterial = (color: string, opacity: number, map: THREE.Texture | null = null) =>
  new THREE.MeshBasicMaterial({ color, map, opacity, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })

// ---------------------------------------------------------------- dessins

/** Le dos des cartes du site, une fois arrivé ; d'ici là (ou sans site), un dos dessiné d'après lui. */
let backImage: HTMLImageElement | null = null
let backAsked = false
/** Textures qui montrent un dos de carte : redessinées quand celui du site arrive. */
const backs = new Set<THREE.CanvasTexture>()

/** Dos d'une carte : celui du site (un visage tramé, le bandeau « ÉLITE DANGEREUSE »). */
function drawCardBack(g: CanvasRenderingContext2D, w: number, h: number) {
  if (backImage) {
    g.clearRect(0, 0, w, h)
    g.drawImage(backImage, 0, 0, w, h)
    return
  }
  g.fillStyle = '#f2f2f2'
  g.fillRect(0, 0, w, h)
  g.fillStyle = '#0c0c0e'
  g.beginPath()
  g.roundRect(w * 0.03, h * 0.02, w * 0.94, h * 0.96, w * 0.04)
  g.fill()
  g.fillStyle = '#2b2b30'
  for (let y = h * 0.04; y < h * 0.96; y += Math.max(2, h / 64)) g.fillRect(w * 0.05, y, w * 0.9, 1)
  g.fillStyle = '#d8d8dc'
  g.beginPath()
  g.ellipse(w / 2, h * 0.42, w * 0.24, h * 0.22, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#0c0c0e'
  for (let y = h * 0.2; y < h * 0.64; y += Math.max(3, h / 40)) g.fillRect(w * 0.2, y, w * 0.6, Math.max(1, h / 128))
  g.fillStyle = '#ffffff'
  g.fillRect(w * 0.12, h * 0.72, w * 0.76, h * 0.08)
  g.fillStyle = '#0c0c0e'
  g.fillRect(w * 0.36, h * 0.727, w * 0.51, h * 0.066)
}

/** Montre le dos sur une texture de carte ; il devient celui du site dès qu'il est chargé. */
function showBack(texture: THREE.CanvasTexture) {
  const c = texture.image as HTMLCanvasElement
  drawCardBack(c.getContext('2d')!, c.width, c.height)
  texture.needsUpdate = true
  backs.add(texture)
  if (backAsked || typeof Image === 'undefined') return
  backAsked = true
  const img = new Image()
  img.onload = () => {
    backImage = img
    for (const t of backs) showBack(t)
  }
  img.src = backUrl()
}

/** Texture d'une carte, face cachée. */
function backTexture(w: number, h: number): THREE.CanvasTexture {
  const texture = drawnTexture(w, h, () => {})
  showBack(texture)
  return texture
}

let cardBack: THREE.MeshBasicMaterial | undefined
const cardBackMaterial = () => (cardBack ??= keepShared(new THREE.MeshBasicMaterial({ map: keepShared(backTexture(96, 132)) })))

/** Teintes des sachets d'attente, avant que le site n'ait donné les siens. */
const PACK_HUES = [212, 150, 28, 280, 190, 350, 48, 120, 250, 8, 170, 310]
const PACK = { w: 128, h: 232 }

/** Sachet de booster générique : aluminium sombre gaufré aux deux bouts, un médaillon, un titre. */
function drawPack(g: CanvasRenderingContext2D, hue: number) {
  const { w, h } = PACK
  g.clearRect(0, 0, w, h)
  const body = g.createLinearGradient(0, 0, w, h)
  body.addColorStop(0, `hsl(${hue} 45% 26%)`)
  body.addColorStop(0.5, `hsl(${hue} 55% 15%)`)
  body.addColorStop(1, `hsl(${hue} 50% 22%)`)
  g.fillStyle = body
  g.beginPath()
  g.roundRect(6, 4, w - 12, h - 8, 5)
  g.fill()
  g.fillStyle = `hsl(${hue} 30% 34%)`
  for (const y of [4, h - 20]) for (let x = 8; x < w - 8; x += 4) g.fillRect(x, y, 2, 16)
  g.fillStyle = '#0b0d12'
  g.beginPath()
  g.arc(w / 2, h * 0.42, 26, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#ff8a1c'
  g.lineWidth = 3
  g.stroke()
  g.fillStyle = '#ff8a1c'
  g.font = '700 13px system-ui, sans-serif'
  g.textAlign = 'center'
  g.fillText('ÉLITE', w / 2, h * 0.63)
  g.fillText('DANGEREUSE', w / 2, h * 0.7)
  g.fillStyle = '#ffffff'
  g.font = '600 9px system-ui, sans-serif'
  g.fillText('4 CARDS BOOSTER', w / 2, h * 0.85)
}

/** Remplace le dessin d'une texture par une image du site, quand elle arrive ; sinon le dessin reste. */
function paint(texture: THREE.CanvasTexture, url: string) {
  if (typeof Image === 'undefined') return
  backs.delete(texture)
  const img = new Image()
  img.onload = () => {
    const c = texture.image as HTMLCanvasElement, g = c.getContext('2d')!
    g.clearRect(0, 0, c.width, c.height)
    g.drawImage(img, 0, 0, c.width, c.height)
    texture.needsUpdate = true
  }
  img.src = url
}

/**
 * Ce que le site dit des cartes, demandé quand la pièce s'affiche et partagé par ses meubles ; null
 * tant qu'il n'a pas répondu (on le lui redemande alors toutes les vingt secondes, à l'horloge de
 * l'appareil : le temps du jeu ralentit quand l'image peine).
 */
const site = { info: null as CardsInfo | null, asked: -Infinity, busy: false }
function siteCards(): CardsInfo | null {
  const now = performance.now()
  if (!site.info && !site.busy && now - site.asked > 20000) {
    site.asked = now
    site.busy = true
    void cardsInfo().then((info) => { site.info = info }).finally(() => { site.busy = false })
  }
  return site.info
}

/** Sachet de booster à plat (face vers +z) : sa texture attend la couverture d'une collection du site. */
function packMesh(w: number, h: number, hue: number) {
  const texture = drawnTexture(PACK.w, PACK.h, (g) => drawPack(g, hue))
  const m = part(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }))
  return { mesh: m, texture }
}

/** Carte posée (face vers +y), ou dressée si `up` : un bord de couleur, le dos du site. */
function cardSlab(w: number, color: string, up = false): THREE.Group {
  const h = w * 1.37, g = new THREE.Group()
  if (up) g.add(box(w + 0.012, h + 0.012, 0.006, glow(color)), part(new THREE.PlaneGeometry(w, h), cardBackMaterial(), 0, 0, 0.004))
  else {
    const face = part(new THREE.PlaneGeometry(w, h), cardBackMaterial(), 0, 0.004, 0)
    face.rotation.x = -Math.PI / 2
    g.add(box(w + 0.012, 0.005, h + 0.012, glow(color)), face)
  }
  return g
}

// ---------------------------------------------------------------- sol

/** Teintes d'un tapis : sa bordure, son champ, ses motifs, son filet. */
type RugColors = { border: string; field: string; motif: string; line: string }
const RUGS = {
  wine: { border: '#3f1418', field: '#6a2227', motif: '#8f3a34', line: '#d2ab5c' },
  night: { border: '#14203a', field: '#1f3458', motif: '#2f4b78', line: '#d2ab5c' },
  moss: { border: '#152f2e', field: '#1f4a47', motif: '#2f6660', line: '#d8b866' },
} satisfies Record<string, RugColors>

/**
 * Tapis tissé, dessiné sur le parquet (centre et taille en pixels) : franges aux deux bouts,
 * bordure, filet doré, champ semé de losanges, médaillon au milieu.
 */
function drawRug(g: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, c: RugColors, random: () => number) {
  const x = cx - w / 2, y = cy - h / 2, along = w >= h, b = Math.min(w, h) * 0.09
  // L'ombre portée du tapis, puis ses franges.
  g.fillStyle = '#0000003d'
  g.fillRect(x + 3, y + 4, w, h)
  g.strokeStyle = '#e9dcc0'
  g.lineWidth = 1.5
  for (let k = 3; k < (along ? h : w) - 2; k += 4) {
    g.beginPath()
    if (along) { g.moveTo(x - 7, y + k); g.lineTo(x, y + k); g.moveTo(x + w, y + k); g.lineTo(x + w + 7, y + k) }
    else { g.moveTo(x + k, y - 7); g.lineTo(x + k, y); g.moveTo(x + k, y + h); g.lineTo(x + k, y + h + 7) }
    g.stroke()
  }
  g.fillStyle = c.border
  g.fillRect(x, y, w, h)
  g.fillStyle = c.field
  g.fillRect(x + b, y + b, w - 2 * b, h - 2 * b)
  // Le semis de losanges, à peine plus clair que le champ.
  g.save()
  g.beginPath()
  g.rect(x + b, y + b, w - 2 * b, h - 2 * b)
  g.clip()
  const step = Math.max(14, Math.min(w, h) * 0.16)
  for (let j = 0, yy = y + b; yy < y + h; yy += step / 2, j++) {
    for (let xx = x + b + (j % 2 ? step / 2 : 0); xx < x + w; xx += step) {
      g.fillStyle = random() < 0.5 ? c.motif : c.border
      g.beginPath()
      g.moveTo(xx, yy - step * 0.22)
      g.lineTo(xx + step * 0.16, yy)
      g.lineTo(xx, yy + step * 0.22)
      g.lineTo(xx - step * 0.16, yy)
      g.fill()
    }
  }
  g.restore()
  g.strokeStyle = c.line
  g.lineWidth = 2
  g.strokeRect(x + b * 0.5, y + b * 0.5, w - b, h - b)
  g.lineWidth = 1
  g.strokeRect(x + b * 1.25, y + b * 1.25, w - b * 2.5, h - b * 2.5)
  // Le médaillon : un losange cerné d'or, ton sur ton.
  const r = Math.min(w, h) * 0.17
  const lozenge = (k: number) => {
    g.beginPath()
    g.moveTo(cx, cy - r * k)
    g.lineTo(cx + r * k * (along ? 1.7 : 0.75), cy)
    g.lineTo(cx, cy + r * k)
    g.lineTo(cx - r * k * (along ? 1.7 : 0.75), cy)
    g.closePath()
  }
  g.fillStyle = c.motif
  lozenge(1)
  g.fill()
  g.stroke()
  g.fillStyle = c.border
  lozenge(0.55)
  g.fill()
  g.stroke()
}

/**
 * Le sol de la pièce (`label` : largeur x profondeur), d'un seul tenant : un parquet de noyer en
 * point de Hongrie, un filet de laiton le long des murs, et les tapis, posés là où l'on s'arrête
 * (la position de chacun est donnée depuis le milieu de la pièce, en mètres). Au milieu, sous
 * l'autel, le grand tapis rond : une étoile dorée, un losange par rareté.
 */
const cardsFloor: Builder = ({ label = '7.7x9.7', random }) => {
  const [w, d] = label.split('x').map(Number), px = 96
  const W = Math.round(w * px), D = Math.round(d * px)
  const map = drawnTexture(W, D, (g) => {
    g.fillStyle = '#33211a'
    g.fillRect(0, 0, W, D)
    // Point de Hongrie : des bandes verticales de lames inclinées, une sur deux dans l'autre sens.
    const band = px * 0.55, plank = px * 0.16
    for (let bx = 0, k = 0; bx < W; bx += band, k++) {
      g.save()
      g.beginPath()
      g.rect(bx, 0, band, D)
      g.clip()
      for (let y = -band; y < D + band; y += plank) {
        g.fillStyle = `hsl(${23 + random() * 7} ${30 + random() * 9}% ${25 + random() * 9}%)`
        g.beginPath()
        const a = k % 2 ? band : 0, b = k % 2 ? 0 : band
        g.moveTo(bx, y + a)
        g.lineTo(bx + band, y + b)
        g.lineTo(bx + band, y + b + plank - 1)
        g.lineTo(bx, y + a + plank - 1)
        g.fill()
      }
      g.restore()
      g.fillStyle = '#24160f'
      g.fillRect(bx, 0, 1, D)
    }
    // Frise sombre et filet de laiton, le long des murs.
    g.strokeStyle = '#24160f'
    g.lineWidth = px * 0.3
    g.strokeRect(0, 0, W, D)
    g.strokeStyle = C.brass
    g.lineWidth = 3
    g.strokeRect(px * 0.2, px * 0.2, W - px * 0.4, D - px * 0.4)
    // Les tapis : devant la boutique, de la porte à l'autel, sous les tables de jeu, au coin canapé.
    const cx = W / 2, cy = D / 2
    const rug = (x: number, z: number, rw: number, rd: number, c: RugColors) => drawRug(g, cx + x * px, cy + z * px, rw * px, rd * px, c, random)
    rug(0, -2.45, 4.4, 0.95, RUGS.moss)
    rug(-2.75, 0, 1.7, 1.25, RUGS.night)
    rug(0.95, 3.05, 4.5, 2.85, RUGS.wine)
    rug(-2.7, 3.75, 2.0, 1.7, RUGS.night)
    // Le tapis rond de l'autel : franges, bordure bleu nuit à pastilles d'or, anneau lie-de-vin,
    // champ bleu, étoile à huit branches.
    const r = px * 1.6
    g.fillStyle = '#0000003d'
    g.beginPath()
    g.arc(cx + 3, cy + 5, r, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = '#e9dcc0'
    g.lineWidth = 1.5
    for (let i = 0; i < 180; i++) {
      const a = (i / 180) * Math.PI * 2
      g.beginPath()
      g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
      g.lineTo(cx + Math.cos(a) * (r + 7), cy + Math.sin(a) * (r + 7))
      g.stroke()
    }
    const disc = (k: number, color: string) => {
      g.fillStyle = color
      g.beginPath()
      g.arc(cx, cy, r * k, 0, Math.PI * 2)
      g.fill()
    }
    disc(1, RUGS.night.border)
    disc(0.84, RUGS.wine.field)
    disc(0.76, RUGS.night.field)
    g.fillStyle = RUGS.night.line
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2
      g.beginPath()
      g.arc(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92, 2.6, 0, Math.PI * 2)
      g.fill()
    }
    g.strokeStyle = RUGS.night.line
    g.lineWidth = 2
    for (const k of [0.84, 0.76, 0.46]) {
      g.beginPath()
      g.arc(cx, cy, r * k, 0, Math.PI * 2)
      g.stroke()
    }
    g.fillStyle = '#b8964b'
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4, len = r * (i % 2 ? 0.56 : 0.72)
      g.beginPath()
      g.moveTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len)
      g.lineTo(cx + Math.cos(a + 0.2) * r * 0.18, cy + Math.sin(a + 0.2) * r * 0.18)
      g.lineTo(cx + Math.cos(a - 0.2) * r * 0.18, cy + Math.sin(a - 0.2) * r * 0.18)
      g.fill()
    }
    ;(['c', 'r', 'u', 'm'] as const).forEach((id, i) => {
      const a = Math.PI / 4 + (i * Math.PI) / 2, x = cx + Math.cos(a) * r * 0.92, y = cy + Math.sin(a) * r * 0.92, s = px * 0.075
      g.fillStyle = RUGS.night.border
      g.beginPath()
      g.arc(x, y, s * 1.9, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = RARITY_COLORS[id]
      g.beginPath()
      g.moveTo(x, y - s * 1.4)
      g.lineTo(x + s, y)
      g.lineTo(x, y + s * 1.4)
      g.lineTo(x - s, y)
      g.fill()
    })
  })
  const floor = part(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map, polygonOffset: true, polygonOffsetFactor: -2 }), 0, 0.006, 0)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  const g = new THREE.Group()
  g.add(floor)
  return { solid: g }
}

// ---------------------------------------------------------------- la boutique

const SHOP = { w: 4.4, slots: 8, rows: [0.2, 0.6], packW: 0.19, packH: 0.345 }
/** L'enseigne de la boutique : taille de son dessin (pixels) et de sa planche (mètres). */
const SIGN = { w: 1720, h: 216, width: 4.3, height: 0.54 }
let shopSign: THREE.Texture | undefined
let spotMap: THREE.Texture | undefined
/** Tache de lumière douce, pour les lueurs. */
const spot = () => (spotMap ??= keepShared(drawnTexture(64, 64, (g) => {
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.9)')
  grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)')
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
})))

/**
 * Le dessin de l'enseigne, sur fond transparent : trois cartes en éventail, tracées d'un tube de
 * néon, puis « Cartes Dangereuses » en lettres d'ambre, soulignées d'un trait orange.
 */
function drawShopSign(c: CanvasRenderingContext2D) {
  const { w, h } = SIGN
  c.lineJoin = c.lineCap = 'round'
  /** Un tube : sa lueur, large et diffuse, puis son verre, presque blanc. */
  const tube = (trace: () => void, color: string, core: string, width: number) => {
    c.shadowColor = color
    c.strokeStyle = color
    for (const [blur, extra] of [[38, 5], [14, 2]]) {
      c.shadowBlur = blur
      c.lineWidth = width + extra
      trace()
    }
    c.shadowBlur = 0
    c.strokeStyle = core
    c.lineWidth = width * 0.55
    trace()
  }
  const text = 'Cartes Dangereuses'
  c.font = 'italic 700 132px Georgia, "Times New Roman", serif'
  c.textBaseline = 'alphabetic'
  const tw = c.measureText(text).width, fan = 190, gap = 46
  const x0 = (w - (fan + gap + tw)) / 2, base = h * 0.68
  // L'éventail : trois cartes, la plus rare devant.
  const fx = x0 + fan / 2, fy = h * 0.6
  ;([[-0.42, '#63d8ff', '#e6fbff'], [0.42, '#ff6fd0', '#ffe6f7'], [0, '#ffc94a', '#fff6d6']] as const).forEach(([a, color, core]) => {
    c.save()
    c.translate(fx, fy + 52)
    c.rotate(a)
    tube(() => {
      c.beginPath()
      c.roundRect(-38, -150, 76, 108, 10)
      c.stroke()
    }, color, core, 7)
    c.restore()
  })
  // Le losange de la carte du milieu.
  tube(() => {
    c.beginPath()
    c.moveTo(fx, fy - 62)
    c.lineTo(fx + 15, fy - 40)
    c.lineTo(fx, fy - 18)
    c.lineTo(fx - 15, fy - 40)
    c.closePath()
    c.stroke()
  }, '#ffc94a', '#fff6d6', 5)
  // Les lettres : pleines, d'un ambre très clair, dans leur halo.
  const tx = x0 + fan + gap
  c.shadowColor = '#ff9a2e'
  c.fillStyle = '#ffb657'
  for (const blur of [44, 18]) {
    c.shadowBlur = blur
    c.fillText(text, tx, base)
  }
  c.shadowBlur = 5
  c.fillStyle = '#fff3dc'
  c.fillText(text, tx, base)
  // Le trait qui souligne, d'un seul geste.
  tube(() => {
    c.beginPath()
    c.moveTo(tx + 8, base + 34)
    c.bezierCurveTo(tx + tw * 0.3, base + 20, tx + tw * 0.7, base + 48, tx + tw - 4, base + 30)
    c.stroke()
  }, '#ff7a1c', '#ffe0c2', 6)
}

/**
 * Le mur de la boutique : deux rayons de sachets sous leurs réglettes, un sachet par collection du
 * site (chacune sa couverture), et le fronton « CARTES DANGEREUSES » bordé d'ampoules.
 */
const cardsShop: Builder = () => {
  const { w, slots, rows, packW, packH } = SHOP
  const g = new THREE.Group(), live = new THREE.Group()
  const wood = lit(C.walnut, 'wood'), dark = lit(C.walnutDark, 'wood'), brass = lit(C.brass, 'metal')
  g.add(box(w, 0.98, 0.04, lit(C.night), 0, 0.51, 0.02))
  for (const x of [-w / 2 + 0.04, w / 2 - 0.04]) g.add(box(0.08, 1, 0.16, wood, x, 0.5, 0.08, 0.01), box(0.1, 0.03, 0.18, brass, x, 0.985, 0.08))
  g.add(box(w, 0.1, 0.16, dark, 0, 0.05, 0.08))
  const packs: THREE.CanvasTexture[] = []
  rows.forEach((y, row) => {
    g.add(box(w - 0.16, 0.022, 0.14, wood, 0, y - 0.011, 0.09), box(w - 0.16, 0.008, 0.008, brass, 0, y - 0.004, 0.164))
    // La réglette, sous le rayon du dessus : elle éclaire les sachets par le haut.
    g.add(box(w - 0.2, 0.01, 0.02, glow('#ffe7b8'), 0, y + packH + 0.03, 0.12))
    for (let i = 0; i < slots; i++) {
      const x = -w / 2 + 0.36 + (i * (w - 0.72)) / (slots - 1), k = row * slots + i
      const pack = packMesh(packW, packH, PACK_HUES[k % PACK_HUES.length])
      pack.mesh.position.set(x, y + packH / 2 + 0.004, 0.1)
      pack.mesh.rotation.x = -0.1
      g.add(pack.mesh, box(packW * 0.9, packH * 0.94, 0.012, lit('#0d1118'), x + 0.012, y + packH / 2 + 0.004, 0.066), box(0.12, 0.018, 0.004, brass, x, y - 0.011, 0.162))
      packs.push(pack.texture)
    }
  })
  // L'enseigne, au-dessus du mur : un néon sur sa planche de noyer, tenue par deux équerres de laiton.
  shopSign ??= keepShared(drawnTexture(SIGN.w, SIGN.h, drawShopSign))
  const sy = 1.0 + SIGN.height / 2 + 0.03
  g.add(box(SIGN.width + 0.12, SIGN.height + 0.08, 0.05, dark, 0, sy, 0.035, 0.012), box(SIGN.width + 0.16, 0.02, 0.07, brass, 0, sy + SIGN.height / 2 + 0.04, 0.04), box(SIGN.width + 0.16, 0.02, 0.07, brass, 0, sy - SIGN.height / 2 - 0.04, 0.04))
  for (const x of [-SIGN.width / 2 + 0.3, SIGN.width / 2 - 0.3]) g.add(box(0.03, 0.1, 0.03, brass, x, 0.99, 0.03))
  const neon = new THREE.MeshBasicMaterial({ map: shopSign, transparent: true, depthWrite: false, toneMapped: false })
  // La lueur du néon : sur sa planche, et sur le haut du mur de sachets.
  const halo = haloMaterial('#ffb24a', 0.5, spot())
  live.add(part(new THREE.PlaneGeometry(SIGN.width * 1.05, SIGN.height * 2.1), halo, 0, sy - 0.04, 0.064), part(new THREE.PlaneGeometry(SIGN.width, SIGN.height), neon, 0, sy, 0.066))
  let asked = false
  return {
    solid: g,
    live,
    update: (t) => {
      const info = asked ? null : siteCards()
      if (info) {
        asked = true
        if (info.registry.length) packs.forEach((texture, k) => paint(texture, coverUrl(info.registry[k % info.registry.length].slug)))
      }
      // Le néon respire à peine, et grésille une fraction de seconde de loin en loin.
      const buzz = (t * 0.37) % 1 > 0.985 ? 0.72 + 0.28 * Math.sin(t * 90) : 1
      neon.opacity = (0.94 + 0.06 * Math.sin(t * 2.3)) * buzz
      halo.opacity = 0.5 * neon.opacity
    },
  }
}

/**
 * Le comptoir de Ludo : noyer et laiton, une vitrine de cartes éclairée en façade, le tapis de
 * vente, la caisse et son écran, un tourniquet de cartes, des présentoirs de sachets. Ludo se
 * tient derrière (-z), une main de cartes en hologramme entre les doigts.
 */
const cardsCounter: Builder = ({ random }) => {
  const g = new THREE.Group(), live = new THREE.Group()
  const w = 3.2, d = 0.52, top = 0.5
  const wood = lit(C.walnut, 'wood'), dark = lit(C.walnutDark, 'wood'), brass = lit(C.brass, 'metal')
  g.add(box(w, 0.08, d, dark, 0, 0.04, 0), box(w, 0.03, d + 0.06, wood, 0, top - 0.015, 0, 0.008), box(w + 0.02, 0.012, 0.012, brass, 0, top - 0.03, d / 2 + 0.03))
  g.add(box(w, top - 0.11, 0.04, wood, 0, 0.08 + (top - 0.11) / 2, -d / 2 + 0.02))
  for (const x of [-w / 2 + 0.03, -w / 6, w / 6, w / 2 - 0.03]) g.add(box(0.05, top - 0.11, d, wood, x, 0.08 + (top - 0.11) / 2, 0))
  // La vitrine : un plateau de velours éclairé, des cartes de toutes les raretés sous la vitre.
  g.add(box(w - 0.1, 0.012, d - 0.1, lit(C.velvet, 'cloth'), 0, 0.2, 0.03), box(w - 0.12, 0.008, 0.012, glow('#fff0cf'), 0, top - 0.045, d / 2 - 0.02))
  const rarities: Rarity[] = ['c', 'c', 'r', 'c', 'u', 'r', 'c', 'm', 'r', 'c', 'u', 'c']
  rarities.forEach((r, i) => {
    const card = cardSlab(0.1, RARITY_COLORS[r])
    card.position.set(-w / 2 + 0.24 + i * ((w - 0.48) / (rarities.length - 1)), 0.212, 0.05 + (random() - 0.5) * 0.05)
    card.rotation.y = (random() - 0.5) * 0.5
    card.rotation.x = 0.35
    g.add(card)
  })
  live.add(part(new THREE.PlaneGeometry(w - 0.1, top - 0.13), glass('#bfe6ff', 0.14), 0, 0.08 + (top - 0.11) / 2, d / 2))
  // Sur le plateau : le tapis de vente, la caisse, les présentoirs.
  g.add(box(0.7, 0.006, 0.36, lit(C.felt, 'cloth'), 0, top + 0.003, 0.03), box(0.72, 0.004, 0.38, brass, 0, top + 0.001, 0.03))
  for (let i = 0; i < 3; i++) {
    const card = cardSlab(0.085, RARITY_COLORS[(['r', 'u', 'm'] as const)[i]])
    card.position.set(-0.2 + i * 0.2, top + 0.01, 0.04)
    card.rotation.y = (i - 1) * -0.12
    g.add(card)
  }
  g.add(box(0.3, 0.1, 0.24, dark, 1.12, top + 0.05, -0.02, 0.01), box(0.26, 0.012, 0.1, lit('#22262e'), 1.12, top + 0.106, 0.05))
  const till = animatedScreen(96, 64, 2, (c, t) => {
    c.fillStyle = '#0a1420'
    c.fillRect(0, 0, 96, 64)
    c.fillStyle = C.amber
    c.font = '700 13px system-ui, sans-serif'
    c.textAlign = 'center'
    c.fillText('BOOSTERS', 48, 18)
    c.fillStyle = Math.floor(t) % 2 ? '#7fe3ff' : '#4a8ba0'
    c.fillText(tr('EN STOCK', 'IN STOCK'), 48, 38)
    c.fillStyle = '#ffffff'
    c.fillRect(10, 48, 76 * ((t * 0.2) % 1), 4)
  })
  const screen = part(new THREE.PlaneGeometry(0.24, 0.16), new THREE.MeshBasicMaterial({ map: till.texture }), 1.12, top + 0.2, -0.08)
  screen.rotation.x = -0.25
  g.add(box(0.27, 0.19, 0.02, lit('#1a1d24'), 1.12, top + 0.2, -0.094))
  live.add(screen)
  // Présentoirs de sachets, en éventail.
  for (const [x, hue] of [[-1.28, 212], [-1.05, 28], [-0.82, 280]] as const) {
    g.add(box(0.2, 0.02, 0.12, brass, x, top + 0.01, -0.04))
    for (let i = 0; i < 3; i++) {
      const pack = packMesh(0.11, 0.2, hue + i * 14)
      pack.mesh.position.set(x + (i - 1) * 0.045, top + 0.12, -0.06 + i * 0.03)
      pack.mesh.rotation.set(-0.18, (i - 1) * -0.25, 0)
      g.add(pack.mesh)
    }
  }
  // Le tourniquet : des cartes sur quatre faces, qui tourne lentement.
  const spinner = new THREE.Group()
  spinner.position.set(0.68, top, -0.02)
  spinner.add(cylinder(0.008, 0.008, 0.34, brass, 0, 0.17, 0, 6), cylinder(0.07, 0.08, 0.016, brass, 0, 0.008, 0, 12), sphere(0.014, brass, 0, 0.35, 0, 8))
  for (let side = 0; side < 4; side++) {
    for (let row = 0; row < 2; row++) {
      const card = cardSlab(0.07, RARITY_COLORS[(['c', 'r', 'u', 'm'] as const)[(side + row) % 4]], true)
      const a = (side * Math.PI) / 2
      card.position.set(Math.sin(a) * 0.06, 0.1 + row * 0.13, Math.cos(a) * 0.06)
      card.rotation.y = a
      spinner.add(card)
    }
  }
  live.add(spinner)
  // Ludo, et sa main de cartes.
  const staff = counterStaff(false, random() * 12)
  staff.root.position.set(-0.1, 0, -0.14)
  const head = staff.root.getObjectByName('head')
  head?.add(box(0.23, 0.012, 0.13, lit('#1f8a5a'), 0, 0.165, 0.1), box(0.215, 0.05, 0.19, lit('#17402f'), 0, 0.19, -0.006, 0.016))
  live.add(staff.root)
  const hand = new THREE.Group()
  hand.position.set(-0.1, top + 0.2, -0.26)
  const fan: THREE.Mesh[] = []
  ;(['c', 'r', 'u', 'm', 'r'] as const).forEach((r, i) => {
    const card = part(new THREE.PlaneGeometry(0.06, 0.084), holoMaterial(null, RARITY_COLORS[r], 0.75))
    card.position.set((i - 2) * 0.045, -Math.abs(i - 2) * 0.008, 0)
    card.rotation.z = (i - 2) * -0.16
    fan.push(card)
    hand.add(card)
  })
  live.add(hand)
  return {
    solid: g,
    live,
    extent: new THREE.Box3(new THREE.Vector3(-w / 2, 0, -0.6), new THREE.Vector3(w / 2, 0.85, d / 2 + 0.03)),
    update: (t) => {
      till.tick(t)
      staff.update(t)
      spinner.rotation.y = t * 0.35
      hand.position.y = top + 0.2 + Math.sin(t * 1.3) * 0.012
      fan.forEach((card, i) => (card.position.y = -Math.abs(i - 2) * 0.008 + Math.sin(t * 2.2 + i) * 0.006))
    },
  }
}

// ---------------------------------------------------------------- l'autel d'ouverture

/** Les cartes du dernier tirage, à montrer au-dessus de l'autel (cf. showPull). */
const pull = { cards: [] as { key: string; rarity: Rarity }[], at: -Infinity, fresh: false }
/** Secondes pendant lesquelles un tirage reste au-dessus de l'autel. */
const PULL_TIME = 14

/** Affiche les cartes qu'on vient de tirer au-dessus de l'autel de la pièce (cf. src/cards/panel.ts). */
export function showPull(cards: { key: string; rarity: Rarity }[]) {
  pull.cards = cards.slice(0, 5)
  pull.fresh = true
}

/**
 * L'autel d'ouverture, au milieu de la pièce : un socle rond à trois degrés, cerclé de laiton, d'où
 * monte un faisceau. Un sachet y flotte en tournant, cinq cartes gravitent autour ; quand on vient
 * d'ouvrir un booster, ce sont ses cartes qui s'y déploient, bordées de la couleur de leur rareté.
 */
const cardsAltar: Builder = () => {
  const g = new THREE.Group(), live = new THREE.Group()
  const steel = lit('#232a36', 'metal'), brass = lit(C.brass, 'metal')
  ;[[0.62, 0.06], [0.5, 0.12], [0.38, 0.2]].forEach(([r, h], i) => {
    g.add(cylinder(r, r + 0.03, h, i === 2 ? lit(C.walnutDark, 'wood') : steel, 0, h / 2, 0, 32))
    const ring = mesh(new THREE.TorusGeometry(r, 0.012, 6, 40), brass, 0, h, 0)
    ring.rotation.x = Math.PI / 2
    g.add(ring)
  })
  g.add(cylinder(0.3, 0.3, 0.01, glow('#fff0d2'), 0, 0.206, 0, 32))
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    g.add(box(0.05, 0.012, 0.05, glow(RARITY_COLORS[(['c', 'r', 'u', 'm'] as const)[i]]), Math.cos(a) * 0.5, 0.126, Math.sin(a) * 0.5))
  }
  const beam = beamMaterial()
  beam.uniforms.uColor.value.set('#ffc777')
  beam.uniforms.uIntensity.value = 0.32
  live.add(part(new THREE.CylinderGeometry(0.4, 0.28, 0.8, 24, 1, true), beam, 0, 0.61, 0))
  // Le sachet du moment, celui que le site met en avant.
  const pack = packMesh(0.22, 0.4, 212)
  pack.mesh.position.y = 0.62
  live.add(pack.mesh)
  // Les cartes : cinq, chacune son cadre et sa face.
  const cards = Array.from({ length: 5 }, (_, i) => {
    const holder = new THREE.Group()
    const texture = backTexture(128, 176)
    const frame = part(new THREE.PlaneGeometry(0.152, 0.205), new THREE.MeshBasicMaterial({ color: RARITY_COLORS.c, side: THREE.DoubleSide }), 0, 0, -0.002)
    const face = part(new THREE.PlaneGeometry(0.14, 0.192), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }))
    const halo = part(new THREE.PlaneGeometry(0.3, 0.36), haloMaterial(RARITY_COLORS.c, 0), 0, 0, -0.004)
    holder.add(halo, frame, face)
    live.add(holder)
    return { holder, texture, frame, halo, phase: (i * Math.PI * 2) / 5 }
  })
  const sparks = Array.from({ length: 14 }, (_, i) => {
    const s = part(new THREE.SphereGeometry(0.008, 5, 4), haloMaterial(i % 3 ? '#ffe2ad' : '#fff7e0', 0.9))
    live.add(s)
    return { s, phase: i * 1.7, r: 0.16 + (i % 5) * 0.06, speed: 0.25 + (i % 4) * 0.08 }
  })
  let asked = false
  return {
    solid: g,
    live,
    update: (t) => {
      const info = asked ? null : siteCards()
      if (info) {
        asked = true
        const featured = info.registry.find((b) => b.featured) ?? info.registry[0]
        if (featured) paint(pack.texture, coverUrl(featured.slug))
      }
      if (pull.fresh) {
        pull.fresh = false
        pull.at = t
        cards.forEach((card, i) => {
          const drawn = pull.cards[i]
          card.holder.visible = !!drawn
          if (!drawn) return
          paint(card.texture, cardUrl(drawn.key))
          ;(card.frame.material as THREE.MeshBasicMaterial).color.set(RARITY_COLORS[drawn.rarity])
          ;(card.halo.material as THREE.MeshBasicMaterial).color.set(RARITY_COLORS[drawn.rarity])
        })
      }
      const age = t - pull.at, showing = age < PULL_TIME
      if (!showing && pull.at > -Infinity) {
        // Le tirage s'efface : les cartes reprennent leur dos et leur ronde.
        pull.at = -Infinity
        cards.forEach((card) => {
          card.holder.visible = true
          showBack(card.texture)
          ;(card.frame.material as THREE.MeshBasicMaterial).color.set(RARITY_COLORS.c)
        })
      }
      beam.uniforms.uTime.value = t
      pack.mesh.visible = !showing
      pack.mesh.rotation.y = t * 0.7
      pack.mesh.position.y = 0.62 + Math.sin(t * 1.4) * 0.025
      const shown = showing ? pull.cards.length : cards.length
      cards.forEach((card, i) => {
        if (showing) {
          // En éventail, face à la vue du pont (le sud-est), montées d'un coup puis à peine balancées.
          const k = Math.min(1, age / 0.9), u = i - (shown - 1) / 2, s = 1 + 0.5 * k
          card.holder.position.set(u * 0.17, 0.3 + 0.42 * (1 - (1 - k) ** 3) + Math.sin(t * 1.6 + i) * 0.008, -u * 0.17)
          card.holder.rotation.set(0, Math.PI / 4 + Math.sin(t * 0.8 + i * 0.4) * 0.1, 0)
          card.holder.scale.setScalar(s)
          ;(card.halo.material as THREE.MeshBasicMaterial).opacity = pull.cards[i]?.rarity === 'c' ? 0 : 0.35 + 0.2 * Math.sin(t * 3 + i)
        } else {
          const a = t * 0.45 + card.phase
          card.holder.position.set(Math.cos(a) * 0.36, 0.5 + Math.sin(t * 1.1 + card.phase) * 0.05, Math.sin(a) * 0.36)
          card.holder.rotation.set(0, -a + Math.PI / 2, Math.sin(t + card.phase) * 0.12)
          card.holder.scale.setScalar(1)
          ;(card.halo.material as THREE.MeshBasicMaterial).opacity = 0
        }
      })
      for (const p of sparks) {
        const a = t * p.speed * 4 + p.phase, y = (t * p.speed + p.phase) % 1
        p.s.position.set(Math.cos(a) * p.r, 0.22 + y * 0.8, Math.sin(a) * p.r)
        p.s.scale.setScalar(1 - y)
      }
    },
  }
}

// ---------------------------------------------------------------- tables

/** Chaise de la pièce : noyer, assise et dossier de velours (dossier côté -z). */
function chair(color: string): THREE.Group {
  const g = new THREE.Group()
  const wood = lit(C.walnutDark, 'wood'), fabric = lit(color, 'cloth')
  for (const x of [-0.13, 0.13]) for (const z of [-0.12, 0.12]) g.add(box(0.03, 0.24, 0.03, wood, x, 0.12, z))
  g.add(box(0.32, 0.03, 0.3, wood, 0, 0.245, 0, 0.008), box(0.29, 0.03, 0.27, fabric, 0, 0.27, 0.005, 0.012))
  for (const x of [-0.13, 0.13]) g.add(box(0.03, 0.3, 0.03, wood, x, 0.4, -0.135))
  g.add(box(0.3, 0.2, 0.035, fabric, 0, 0.43, -0.13, 0.012), box(0.32, 0.03, 0.04, wood, 0, 0.55, -0.135, 0.008))
  return g
}

/** Places de la table de Galactic Clash (cf. seats.ts) : l'écart des chaises à son centre. */
export const CLASH_SEAT_X = 0.6

/**
 * Table de Galactic Clash : un plateau de noyer gainé de feutre, la grille de trois sur trois où
 * les cartes se posent, orange d'un côté, cyan de l'autre, les deux mains et les deux pioches, et
 * au-dessus, la partie en hologramme. Deux chaises face à face (de part et d'autre, le long de x).
 */
const clashTable: Builder = ({ random }) => {
  const g = new THREE.Group(), live = new THREE.Group()
  const wood = lit(C.walnut, 'wood'), brass = lit(C.brass, 'metal'), top = 0.42
  g.add(box(0.78, 0.04, 0.74, wood, 0, top - 0.02, 0, 0.012), box(0.7, 0.006, 0.66, lit(C.felt, 'cloth'), 0, top + 0.003, 0))
  g.add(cylinder(0.05, 0.07, top - 0.06, lit(C.walnutDark, 'wood'), 0, (top - 0.06) / 2 + 0.02, 0, 10), cylinder(0.22, 0.24, 0.025, lit(C.walnutDark, 'wood'), 0, 0.0125, 0, 16))
  for (const [x, z] of [[-0.37, -0.35], [0.37, -0.35], [-0.37, 0.35], [0.37, 0.35]]) g.add(sphere(0.016, brass, x, top, z, 8))
  // La grille, et les cartes déjà posées : à qui elles sont.
  const cell = 0.105
  for (let i = 0; i < 9; i++) {
    const cx = ((i % 3) - 1) * cell, cz = (Math.floor(i / 3) - 1) * cell * 1.3
    g.add(box(cell - 0.01, 0.002, cell * 1.3 - 0.01, lit('#0f2c33'), cx, top + 0.007, cz))
    const roll = random()
    if (roll < 0.62) {
      const card = cardSlab(0.07, roll < 0.32 ? '#ffaf56' : '#75dfff')
      card.position.set(cx, top + 0.011, cz)
      card.rotation.y = Math.PI / 2 + (random() - 0.5) * 0.08
      g.add(card)
    }
  }
  for (const side of [-1, 1]) {
    // La main, en éventail devant le joueur, et sa pioche.
    for (let i = 0; i < 3; i++) {
      const card = cardSlab(0.06, side < 0 ? '#ffaf56' : '#75dfff')
      card.position.set(side * 0.27, top + 0.011 + i * 0.001, (i - 1) * 0.085)
      card.rotation.y = Math.PI / 2 + (i - 1) * 0.1 * side
      g.add(card)
    }
    g.add(box(0.07, 0.03, 0.095, lit('#0c0c0e'), side * 0.27, top + 0.021, side * -0.26), box(0.074, 0.004, 0.099, glow(side < 0 ? '#ffaf56' : '#75dfff'), side * 0.27, top + 0.008, side * -0.26))
    const seat = chair(side < 0 ? '#7a2f2a' : C.velvet)
    seat.position.set(side * CLASH_SEAT_X, 0, 0)
    seat.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2
    g.add(seat)
  }
  // La partie en hologramme : deux anneaux qui se font face, un score qui flotte.
  const holo = new THREE.Group()
  holo.position.y = top + 0.2
  const rings = [-1, 1].map((side) => {
    const ring = part(new THREE.TorusGeometry(0.05, 0.004, 4, 20), holoMaterial(null, side < 0 ? '#ffaf56' : '#75dfff', 0.8, 0, true), side * 0.09, 0, 0)
    holo.add(ring)
    return ring
  })
  live.add(holo)
  return {
    solid: g,
    live,
    update: (t) => {
      holo.rotation.y = t * 0.5
      holo.position.y = top + 0.2 + Math.sin(t * 1.2) * 0.01
      rings.forEach((ring, i) => (ring.rotation.x = t * (i ? 1.1 : -0.9)))
    },
  }
}

/** Où l'on s'assoit au pupitre de collection (cf. seats.ts). */
export const BINDER_SEAT_Z = 0.42

/**
 * Pupitre de collection : un bureau de noyer, un grand classeur ouvert sur ses pochettes de cartes,
 * une lampe de banquier, une pile de classeurs et une boîte de deck. On s'y assoit (côté +z) pour
 * feuilleter sa collection.
 */
const binderTable: Builder = ({ random }) => {
  const g = new THREE.Group()
  const wood = lit(C.walnut, 'wood'), dark = lit(C.walnutDark, 'wood'), brass = lit(C.brass, 'metal'), top = 0.42
  g.add(box(0.96, 0.035, 0.5, wood, 0, top - 0.018, 0, 0.01), box(0.9, 0.1, 0.03, dark, 0, top - 0.085, -0.22))
  for (const x of [-0.42, 0.42]) g.add(box(0.05, top - 0.035, 0.44, dark, x, (top - 0.035) / 2, 0))
  g.add(box(0.6, 0.006, 0.36, lit('#243b2c', 'leather'), 0, top + 0.003, 0.02))
  // Le classeur ouvert : deux pages de neuf pochettes.
  const colors: Rarity[] = ['c', 'r', 'c', 'u', 'c', 'r', 'm', 'c', 'r']
  for (const side of [-1, 1]) {
    const page = box(0.25, 0.012, 0.32, lit(C.ink, 'leather'), side * 0.128, top + 0.012, 0.02)
    page.rotation.z = side * -0.05
    g.add(page, box(0.23, 0.003, 0.3, lit('#e9edf2'), side * 0.128, top + 0.021, 0.02))
    for (let i = 0; i < 9; i++) {
      if (random() < 0.15) continue
      const r = colors[(i + (side > 0 ? 4 : 0)) % 9]
      g.add(box(0.062, 0.003, 0.085, glow(RARITY_COLORS[r]), side * 0.128 + ((i % 3) - 1) * 0.073, top + 0.024, 0.02 + (Math.floor(i / 3) - 1) * 0.098),
        box(0.052, 0.003, 0.075, lit('#16181d'), side * 0.128 + ((i % 3) - 1) * 0.073, top + 0.026, 0.02 + (Math.floor(i / 3) - 1) * 0.098))
    }
  }
  g.add(cylinder(0.012, 0.012, 0.32, brass, 0, top + 0.022, 0.02, 6).rotateX(Math.PI / 2))
  // La lampe de banquier, et sa lumière sur le classeur.
  g.add(cylinder(0.05, 0.06, 0.012, brass, -0.36, top + 0.006, -0.16, 12), cylinder(0.008, 0.008, 0.16, brass, -0.36, top + 0.09, -0.16, 6))
  const shade = box(0.2, 0.05, 0.08, glow('#3fe08a'), -0.3, top + 0.18, -0.16, 0.02)
  g.add(shade, box(0.16, 0.006, 0.05, glow('#fff3c4'), -0.3, top + 0.153, -0.16))
  // Classeurs en pile, boîte de deck.
  const spines = ['#7a2f2a', '#1d3a5c', '#2f6b4a', '#6b3f7a']
  for (let i = 0; i < 3; i++) g.add(box(0.2, 0.035, 0.26, lit(spines[Math.floor(random() * spines.length)], 'leather'), 0.34, top + 0.018 + i * 0.036, -0.08 + (random() - 0.5) * 0.03, 0.006))
  g.add(box(0.07, 0.1, 0.05, lit('#b23a48'), 0.36, top + 0.05, 0.17, 0.006), box(0.074, 0.02, 0.054, brass, 0.36, top + 0.1, 0.17))
  const seat = chair(C.velvet)
  seat.position.set(0, 0, BINDER_SEAT_Z)
  seat.rotation.y = Math.PI
  g.add(seat)
  return { solid: g }
}

// ---------------------------------------------------------------- murs

/** Bibliothèque de classeurs, adossée au mur : quatre rayons de dos de toutes les couleurs, des boîtes de deck, un trophée. */
const binderShelf: Builder = ({ random }) => {
  const g = new THREE.Group()
  const w = 1.3, h = 0.98, d = 0.2
  const wood = lit(C.walnut, 'wood'), dark = lit(C.walnutDark, 'wood'), brass = lit(C.brass, 'metal')
  g.add(box(w, h, 0.03, dark, 0, h / 2, 0.015), box(w + 0.04, 0.04, d + 0.03, wood, 0, h, d / 2, 0.008), box(w, 0.06, d, dark, 0, 0.03, d / 2))
  for (const x of [-w / 2 + 0.02, w / 2 - 0.02]) g.add(box(0.04, h, d, wood, x, h / 2, d / 2))
  const spines = ['#7a2f2a', '#1d3a5c', '#2f6b4a', '#6b3f7a', '#c9a24a', '#22262e', '#b23a48', '#3f7f95', '#e8dcc0']
  ;[0.07, 0.3, 0.53, 0.76].forEach((y, row) => {
    g.add(box(w - 0.08, 0.018, d - 0.02, wood, 0, y, d / 2))
    let x = -w / 2 + 0.07
    while (x < w / 2 - 0.1) {
      const roll = random()
      if (row === 3 && x > 0.15 && x < 0.3) {
        // Le trophée du tournoi de Galactic Clash.
        g.add(cylinder(0.035, 0.045, 0.02, dark, x + 0.05, y + 0.02, d / 2, 10), cylinder(0.01, 0.014, 0.06, brass, x + 0.05, y + 0.06, d / 2, 6), cylinder(0.05, 0.02, 0.07, brass, x + 0.05, y + 0.125, d / 2, 12))
        x += 0.14
      } else if (roll < 0.14) {
        // Boîtes de deck empilées.
        for (let i = 0; i < 2; i++) g.add(box(0.1, 0.06, 0.13, lit(spines[Math.floor(random() * spines.length)]), x + 0.05, y + 0.04 + i * 0.062, d / 2, 0.006))
        x += 0.12
      } else {
        const t = 0.035 + random() * 0.025, bh = 0.17 + random() * 0.035
        const spine = box(t, bh, d - 0.05, lit(spines[Math.floor(random() * spines.length)], 'leather'), x + t / 2, y + 0.009 + bh / 2, d / 2 + 0.005, 0.004)
        if (random() < 0.12) spine.rotation.z = -0.16
        g.add(spine, box(t * 0.6, 0.03, 0.004, lit(C.cream), x + t / 2, y + 0.009 + bh * 0.68, d - 0.018))
        x += t + 0.004
      }
    }
  })
  return { solid: g }
}

/** Fond d'une carte de vitrine, tant que le site n'a pas donné la sienne. */
const SHOWCASE_RARITIES: Rarity[] = ['m', 'u', 'u', 'm', 'u', 'r']

/**
 * Vitrine murale des cartes du jour : trois cartes rares du site, tirées chaque jour, sous verre et
 * sous leur réglette, chacune bordée de la couleur de sa rareté (`label` : rang de la première).
 */
const cardShowcase: Builder = ({ label = '0' }) => {
  const g = new THREE.Group(), live = new THREE.Group()
  const first = Number(label) || 0, w = 1.5, y = 0.56, cw = 0.36, ch = cw * 1.365
  const dark = lit(C.walnutDark, 'wood'), brass = lit(C.brass, 'metal')
  g.add(box(w, 0.72, 0.05, dark, 0, y, 0.025, 0.012), box(w - 0.08, 0.64, 0.01, lit(C.velvet, 'cloth'), 0, y, 0.052))
  g.add(box(w - 0.1, 0.012, 0.03, glow('#fff0cf'), 0, y + 0.335, 0.07), box(w + 0.03, 0.03, 0.08, brass, 0, y + 0.37, 0.04), box(w + 0.03, 0.03, 0.08, brass, 0, y - 0.37, 0.04))
  const slots = [0, 1, 2].map((i) => {
    const x = (i - 1) * 0.47
    const texture = backTexture(176, 240)
    const frame = new THREE.MeshBasicMaterial({ color: RARITY_COLORS[SHOWCASE_RARITIES[(first + i) % 6]] })
    g.add(part(new THREE.PlaneGeometry(cw + 0.03, ch + 0.03), frame, x, y - 0.01, 0.058), part(new THREE.PlaneGeometry(cw, ch), new THREE.MeshBasicMaterial({ map: texture }), x, y - 0.01, 0.06))
    return { texture, frame }
  })
  live.add(part(new THREE.PlaneGeometry(w - 0.08, 0.64), glass('#cfeaff', 0.1), 0, y, 0.075))
  let asked = false
  return {
    solid: g,
    live,
    update: () => {
      const info = asked ? null : siteCards()
      if (!info) return
      asked = true
      slots.forEach((slot, i) => {
        const card = info.showcase[first + i]
        if (!card) return
        paint(slot.texture, cardUrl(card.key))
        slot.frame.color.set(RARITY_COLORS[card.rarity])
      })
    },
  }
}

/** Chances de tirage par carte, comme sur le site (phputils/cartes/get_booster.php). */
const ODDS: [Rarity, string, string][] = [['c', tr('COMMUNE', 'COMMON'), '74 %'], ['r', 'RARE', '20 %'], ['u', tr('ULTRA-RARE', 'ULTRA RARE'), '5 %'], ['m', tr('MYTHIQUE', 'MYTHIC'), '1 %']]

/**
 * Tableau encadré, au mur : `rarity`, les quatre raretés et leurs chances de tirage ; `clash`,
 * l'affiche du tournoi de Galactic Clash.
 */
const cardsBoard: Builder = ({ label = 'rarity' }) => {
  const g = new THREE.Group()
  const w = 0.9, h = 0.62, y = 0.56
  const map = drawnTexture(360, 248, (c) => {
    c.fillStyle = C.nightDeep
    c.fillRect(0, 0, 360, 248)
    c.textAlign = 'center'
    c.fillStyle = C.amber
    c.font = '700 22px Georgia, serif'
    if (label === 'clash') {
      c.fillText('GALACTIC CLASH', 180, 38)
      c.font = '600 13px system-ui, sans-serif'
      c.fillStyle = '#bcd1dd'
      c.fillText(tr('TROIS SUR TROIS · LA PLUS FORTE L\'EMPORTE', 'THREE BY THREE · HIGHEST SIDE WINS'), 180, 62)
      for (let i = 0; i < 9; i++) {
        c.fillStyle = [0, 2, 4, 7].includes(i) ? '#ffaf56' : [1, 5, 6].includes(i) ? '#75dfff' : '#1d2c40'
        c.fillRect(105 + (i % 3) * 52, 80 + Math.floor(i / 3) * 48, 46, 42)
      }
      c.fillStyle = '#ffffff'
      c.font = '700 14px system-ui, sans-serif'
      c.fillText(tr('SOLO OU DUEL · À TOUTES LES TABLES', 'SOLO OR DUEL · AT EVERY TABLE'), 180, 238)
    } else {
      c.fillText(tr('DANS CHAQUE BOOSTER', 'IN EVERY BOOSTER'), 180, 38)
      ODDS.forEach(([id, name, odds], i) => {
        const top = 62 + i * 44
        c.fillStyle = RARITY_COLORS[id]
        c.fillRect(34, top, 26, 34)
        c.textAlign = 'left'
        c.font = '700 19px system-ui, sans-serif'
        c.fillText(name, 76, top + 24)
        c.textAlign = 'right'
        c.fillStyle = '#ffffff'
        c.fillText(odds, 326, top + 24)
      })
    }
  })
  g.add(box(w + 0.07, h + 0.07, 0.03, lit(C.brass, 'metal'), 0, y, 0.015, 0.008), part(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map }), 0, y, 0.032))
  return { solid: g }
}

// ---------------------------------------------------------------- ce qui rend la pièce douce

/**
 * Guirlande d'ampoules tendue au-dessus des tables, le long de x (`label` : sa longueur) : un fil sombre en trois festons, une ampoule tous les vingt-cinq centimètres.
 */
const cardsFestoon: Builder = ({ label = '7.4', random }) => {
  const len = Number(label) || 7.4, spans = 3, top = 1.04, drop = 0.16, pitch = 0.25
  const g = new THREE.Group()
  const wire = lit('#3a2a1e'), cap = lit(C.brassDark, 'metal'), bulb = glow('#ffe7b8')
  const at = (x: number) => {
    const u = ((x + len / 2) / (len / spans)) % 1
    return top - drop * 4 * u * (1 - u)
  }
  const curve = new THREE.CatmullRomCurve3(Array.from({ length: spans * 12 + 1 }, (_, i) => {
    const x = -len / 2 + (i / (spans * 12)) * len
    return new THREE.Vector3(x, at(x), 0)
  }))
  g.add(mesh(new THREE.TubeGeometry(curve, spans * 24, 0.006, 5, false), wire))
  // Les suspentes, entre deux festons.
  for (let k = 1; k < spans; k++) g.add(cylinder(0.003, 0.003, 0.5, wire, -len / 2 + (k * len) / spans, top + 0.25, 0, 4))
  const n = Math.floor(len / pitch)
  const positions = new Float32Array(n * 3), colors = new Float32Array(n * 3), sizes = new Float32Array(n)
  const tint = new THREE.Color()
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + (i + 0.5) * (len / n), y = at(x) - 0.035
    g.add(cylinder(0.009, 0.009, 0.018, cap, x, y + 0.022, 0, 6), sphere(0.017, bulb, x, y, 0, 8))
    positions.set([x, y, 0], i * 3)
    tint.set(random() < 0.3 ? '#ffd08a' : '#ffe2b0').multiplyScalar(0.9)
    colors.set([tint.r, tint.g, tint.b], i * 3)
    sizes[i] = 0.1 + random() * 0.03
  }
  const live = new THREE.Group()
  live.add(pointCloud(positions, colors, sizes))
  return { solid: g, live }
}

/** Couleurs des pans de verre d'une lampe à vitrail. */
const STAINED = ['#ffab3d', '#ff8a35', '#ffd27a', '#d9502f', '#ffab3d', '#2f9a8f']

/**
 * Lampe à vitrail, sur son pied de laiton : un abat-jour de verre coloré, éclairé de l'intérieur.
 * Posée par terre, elle fait un lampadaire (`label` : `floor`) ; sinon, une lampe de table.
 */
const stainedLamp: Builder = ({ label }) => {
  const g = new THREE.Group(), live = new THREE.Group()
  const brass = lit(C.brass, 'metal'), tall = label === 'floor'
  const stem = tall ? 0.62 : 0.2, r = tall ? 0.15 : 0.11
  g.add(cylinder(r * 0.55, r * 0.7, 0.02, brass, 0, 0.01, 0, 14), cylinder(0.011, 0.016, stem, brass, 0, 0.02 + stem / 2, 0, 8), sphere(0.02, brass, 0, 0.02 + stem * 0.45, 0, 8))
  const y = 0.02 + stem
  // L'abat-jour : douze pans, une couleur chacun, cerclés de plomb.
  const pane = new THREE.CylinderGeometry(r * 0.28, r, r * 0.8, 12, 1, true)
  const colors = new Float32Array(pane.attributes.position.count * 3), tint = new THREE.Color()
  for (let i = 0; i < pane.attributes.position.count; i++) {
    const a = Math.atan2(pane.attributes.position.getZ(i), pane.attributes.position.getX(i))
    tint.set(STAINED[(Math.round(((a + Math.PI) / (Math.PI * 2)) * 12) + 12) % STAINED.length])
    colors.set([tint.r, tint.g, tint.b], i * 3)
  }
  pane.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  live.add(part(pane, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }), 0, y + r * 0.34, 0))
  for (const [rr, yy] of [[r, y - r * 0.06], [r * 0.28, y + r * 0.74]]) {
    const ring = mesh(new THREE.TorusGeometry(rr, 0.006, 4, 16), lit('#2a2018', 'metal'), 0, yy, 0)
    ring.rotation.x = Math.PI / 2
    g.add(ring)
  }
  g.add(sphere(0.016, brass, 0, y + r * 0.78, 0, 8), sphere(r * 0.2, glow('#fff0cf'), 0, y + r * 0.2, 0, 8))
  const halo = part(new THREE.PlaneGeometry(r * 5, r * 5), haloMaterial('#ffbe6a', 0.4, spot()), 0, y + r * 0.3, 0)
  halo.rotation.x = -Math.PI / 2
  halo.position.y = 0.012
  halo.scale.setScalar(tall ? 2.2 : 1.4)
  live.add(halo)
  return { solid: g, live }
}

/**
 * Chariot de chocolat chaud : une desserte de noyer sur deux grandes roues, une bouilloire de cuivre
 * qui fume, des tasses, un bocal de guimauves, et l'ardoise du prix (c'est offert).
 */
const cocoaCart: Builder = () => {
  const g = new THREE.Group(), live = new THREE.Group()
  const wood = lit(C.walnut, 'wood'), dark = lit(C.walnutDark, 'wood'), brass = lit(C.brass, 'metal'), copper = lit('#c0703a', 'metal')
  const top = 0.44
  g.add(box(0.72, 0.03, 0.42, wood, 0, top, 0, 0.01), box(0.66, 0.02, 0.38, wood, 0, 0.2, 0, 0.008))
  for (const x of [-0.33, 0.33]) for (const z of [-0.18, 0.18]) g.add(box(0.03, top, 0.03, dark, x, top / 2, z))
  for (const z of [-0.23, 0.23]) {
    const wheel = mesh(new THREE.TorusGeometry(0.11, 0.014, 6, 20), dark, -0.26, 0.11, z)
    g.add(wheel, cylinder(0.02, 0.02, 0.02, brass, -0.26, 0.11, z, 8).rotateX(Math.PI / 2))
  }
  g.add(cylinder(0.012, 0.012, 0.46, brass, 0.4, top + 0.06, 0, 6).rotateX(Math.PI / 2))
  for (const z of [-0.2, 0.2]) g.add(box(0.07, 0.014, 0.014, brass, 0.37, top + 0.06, z))
  // La bouilloire, sur son réchaud.
  g.add(cylinder(0.07, 0.08, 0.03, lit('#22262e', 'metal'), -0.18, top + 0.03, 0.02, 12), box(0.05, 0.008, 0.012, glow('#ff8a3c'), -0.18, top + 0.026, 0.1))
  g.add(cylinder(0.062, 0.085, 0.12, copper, -0.18, top + 0.105, 0.02, 14), sphere(0.02, brass, -0.18, top + 0.175, 0.02, 8))
  const spout = cylinder(0.012, 0.018, 0.09, copper, -0.1, top + 0.12, 0.02, 8)
  spout.rotation.z = -0.9
  const handle = mesh(new THREE.TorusGeometry(0.05, 0.007, 5, 12, Math.PI), dark, -0.18, top + 0.16, 0.02)
  g.add(spout, handle)
  // Les tasses, deux pleines ; le bocal de guimauves ; l'ardoise.
  const mugs: [number, number, string, boolean][] = [[0.04, 0.1, '#e9dcc4', true], [0.16, 0.1, '#b23a48', true], [0.1, -0.08, '#1d3a5c', false], [0.22, -0.07, '#e9dcc4', false]]
  for (const [x, z, color, full] of mugs) {
    g.add(cylinder(0.032, 0.028, 0.055, lit(color), x, top + 0.043, z, 10), mesh(new THREE.TorusGeometry(0.018, 0.005, 4, 8), lit(color), x + 0.036, top + 0.043, z))
    if (full) g.add(cylinder(0.027, 0.027, 0.004, lit('#4a2a1c'), x, top + 0.069, z, 10), sphere(0.01, lit('#fff6ee'), x - 0.006, top + 0.074, z + 0.004, 6))
  }
  live.add(part(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 12), glass('#dff3ff', 0.25), 0.05, top + 0.065, -0.1))
  for (let i = 0; i < 9; i++) g.add(box(0.022, 0.018, 0.022, lit(i % 3 ? '#fff6ee' : '#ffd0dc'), 0.05 + ((i % 3) - 1) * 0.024, top + 0.03 + Math.floor(i / 3) * 0.02, -0.1 + ((i * 7) % 3 - 1) * 0.02))
  g.add(cylinder(0.047, 0.047, 0.012, brass, 0.05, top + 0.12, -0.1, 12))
  for (let i = 0; i < 3; i++) g.add(box(0.2, 0.05 - i * 0.004, 0.14, lit(['#c0643f', '#34507a', '#d9a441'][i], 'cloth'), 0.02, 0.24 + i * 0.05, 0, 0.012))
  // La vapeur de la bouilloire, et celle des deux tasses pleines.
  const puffs = [[-0.07, top + 0.17, 0.02], [0.04, top + 0.08, 0.1], [0.16, top + 0.08, 0.1]].flatMap(([x, y, z], k) => Array.from({ length: k ? 2 : 4 }, (_, i) => {
    const puff = part(new THREE.PlaneGeometry(0.07, 0.07), haloMaterial('#fff6ea', 0.3, spot()))
    live.add(puff)
    return { puff, x, y, z, phase: i / (k ? 2 : 4) + k * 0.31, rise: k ? 0.12 : 0.24 }
  }))
  return {
    solid: g,
    live,
    update: (t) => {
      for (const p of puffs) {
        const u = (t * 0.32 + p.phase) % 1
        p.puff.position.set(p.x + Math.sin(u * 5 + p.phase * 9) * 0.02, p.y + u * p.rise, p.z)
        p.puff.scale.setScalar(0.5 + u * 1.1)
        ;(p.puff.material as THREE.MeshBasicMaterial).opacity = 0.34 * Math.sin(u * Math.PI)
        p.puff.rotation.y = Math.PI / 4
      }
    },
  }
}

export const CARDS = {
  'cards-floor': cardsFloor,
  'cards-shop': cardsShop,
  'cards-counter': cardsCounter,
  'cards-altar': cardsAltar,
  'clash-table': clashTable,
  'binder-table': binderTable,
  'binder-shelf': binderShelf,
  'card-showcase': cardShowcase,
  'cards-board': cardsBoard,
  'cards-festoon': cardsFestoon,
  'stained-lamp': stainedLamp,
  'cocoa-cart': cocoaCart,
} satisfies Record<string, Builder>
