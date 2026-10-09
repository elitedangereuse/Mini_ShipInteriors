import * as THREE from 'three'
import { cardUrl, cardsInfo, coverUrl, type CardsInfo, type Rarity } from '../cards/site'
import { tr } from '../i18n'
import { counterStaff } from './counter-staff'
import { animatedScreen, beamMaterial, box, cylinder, drawnTexture, glass, glow, holoMaterial, keepShared, lit, mesh, part, sphere, type Builder } from './kit'

/*
 * Le Comptoir des Cartes Dangereuses, au fond du hall du pont supérieur : la boutique de boosters
 * (un mur de sachets, ceux du site, chacun sa collection), Ludo derrière son comptoir, l'autel
 * d'ouverture au milieu de la pièce, les tables de Galactic Clash, les pupitres où feuilleter sa
 * collection, les vitrines des cartes du jour. Une pièce feutrée : noyer, laiton, velours bleu nuit,
 * et la lumière des cartes. Ce qu'on y fait est dans src/cards/.
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

/** Dos d'une carte, d'après celui du site : noir rayé, un médaillon, le bandeau « ÉLITE DANGEREUSE ». */
function drawCardBack(g: CanvasRenderingContext2D, w: number, h: number) {
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

let cardBack: THREE.MeshBasicMaterial | undefined
const cardBackMaterial = () => (cardBack ??= keepShared(new THREE.MeshBasicMaterial({ map: keepShared(drawnTexture(96, 132, (g) => drawCardBack(g, 96, 132))) })))

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

/**
 * Parquet de la pièce (`label` : largeur x profondeur) : des lames de noyer en point de Hongrie, un
 * filet de laiton le long des murs, et au milieu, autour de l'autel, une rosace aux quatre raretés.
 */
const cardsFloor: Builder = ({ label = '7.7x9.7', random }) => {
  const [w, d] = label.split('x').map(Number), px = 96
  const W = Math.round(w * px), D = Math.round(d * px)
  const map = drawnTexture(W, D, (g) => {
    g.fillStyle = '#3d2618'
    g.fillRect(0, 0, W, D)
    // Point de Hongrie : des bandes verticales de lames inclinées, une sur deux dans l'autre sens.
    const band = px * 0.55, plank = px * 0.16
    for (let bx = 0, k = 0; bx < W; bx += band, k++) {
      g.save()
      g.beginPath()
      g.rect(bx, 0, band, D)
      g.clip()
      for (let y = -band; y < D + band; y += plank) {
        const l = 30 + random() * 9
        g.fillStyle = `hsl(${22 + random() * 8} ${36 + random() * 10}% ${l}%)`
        g.beginPath()
        const a = k % 2 ? band : 0, b = k % 2 ? 0 : band
        g.moveTo(bx, y + a)
        g.lineTo(bx + band, y + b)
        g.lineTo(bx + band, y + b + plank - 1)
        g.lineTo(bx, y + a + plank - 1)
        g.fill()
      }
      g.restore()
      g.fillStyle = '#2a190f'
      g.fillRect(bx, 0, 1, D)
    }
    // Filet de laiton, et la frise sombre le long des murs.
    g.strokeStyle = '#2a190f'
    g.lineWidth = px * 0.3
    g.strokeRect(0, 0, W, D)
    g.strokeStyle = C.brass
    g.lineWidth = 3
    g.strokeRect(px * 0.2, px * 0.2, W - px * 0.4, D - px * 0.4)
    // La rosace : un disque de velours bleu nuit cerclé de laiton, une étoile à huit branches, et
    // quatre losanges aux couleurs des raretés.
    const cx = W / 2, cy = D / 2, r = px * 1.55
    g.fillStyle = C.nightDeep
    g.beginPath()
    g.arc(cx, cy, r, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = C.brass
    g.lineWidth = 5
    g.stroke()
    g.lineWidth = 2
    for (const k of [0.86, 0.5]) {
      g.beginPath()
      g.arc(cx, cy, r * k, 0, Math.PI * 2)
      g.stroke()
    }
    g.fillStyle = C.brassDark
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4, len = r * (i % 2 ? 0.62 : 0.84)
      g.beginPath()
      g.moveTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len)
      g.lineTo(cx + Math.cos(a + 0.2) * r * 0.2, cy + Math.sin(a + 0.2) * r * 0.2)
      g.lineTo(cx + Math.cos(a - 0.2) * r * 0.2, cy + Math.sin(a - 0.2) * r * 0.2)
      g.fill()
    }
    ;(['c', 'r', 'u', 'm'] as const).forEach((id, i) => {
      const a = Math.PI / 4 + (i * Math.PI) / 2, x = cx + Math.cos(a) * r * 0.93, y = cy + Math.sin(a) * r * 0.93, s = px * 0.09
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
let shopSign: THREE.Texture | undefined

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
  // Le fronton, au-dessus du mur.
  shopSign ??= keepShared(drawnTexture(1024, 112, (c) => {
    c.fillStyle = C.nightDeep
    c.fillRect(0, 0, 1024, 112)
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.font = '800 66px Georgia, serif'
    c.shadowColor = '#ff8a1c'
    c.shadowBlur = 22
    c.fillStyle = '#ffe2bf'
    const title = tr('CARTES  DANGEREUSES', 'CARTES  DANGEREUSES')
    c.fillText(title, 512, 60)
    c.fillText(title, 512, 60)
  }))
  g.add(box(w, 0.24, 0.1, dark, 0, 1.12, 0.05, 0.01), part(new THREE.PlaneGeometry(w - 0.3, 0.2), new THREE.MeshBasicMaterial({ map: shopSign }), 0, 1.12, 0.102))
  // Les ampoules du fronton : deux jeux, allumés tour à tour.
  const bulbs = [new THREE.MeshBasicMaterial({ color: '#fff3c4' }), new THREE.MeshBasicMaterial({ color: '#b0702a' })]
  const lamp = new THREE.SphereGeometry(0.013, 6, 4)
  for (let i = 0; i < 30; i++) {
    for (const y of [1.02, 1.22]) live.add(part(lamp, bulbs[i % 2], -w / 2 + 0.06 + (i * (w - 0.12)) / 29, y, 0.106))
  }
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
      const on = Math.floor(t * 2) % 2
      bulbs.forEach((bulb, k) => bulb.color.set(k === on ? '#fff3c4' : '#b0702a'))
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
  g.add(cylinder(0.3, 0.3, 0.01, glow('#bff2ff'), 0, 0.206, 0, 32))
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    g.add(box(0.05, 0.012, 0.05, glow(RARITY_COLORS[(['c', 'r', 'u', 'm'] as const)[i]]), Math.cos(a) * 0.5, 0.126, Math.sin(a) * 0.5))
  }
  const beam = beamMaterial()
  beam.uniforms.uColor.value.set('#6fd8ff')
  beam.uniforms.uIntensity.value = 0.32
  live.add(part(new THREE.CylinderGeometry(0.4, 0.28, 0.8, 24, 1, true), beam, 0, 0.61, 0))
  // Le sachet du moment, celui que le site met en avant.
  const pack = packMesh(0.22, 0.4, 212)
  pack.mesh.position.y = 0.62
  live.add(pack.mesh)
  // Les cartes : cinq, chacune son cadre et sa face.
  const cards = Array.from({ length: 5 }, (_, i) => {
    const holder = new THREE.Group()
    const texture = drawnTexture(96, 132, (c) => drawCardBack(c, 96, 132))
    const frame = part(new THREE.PlaneGeometry(0.152, 0.205), new THREE.MeshBasicMaterial({ color: RARITY_COLORS.c, side: THREE.DoubleSide }), 0, 0, -0.002)
    const face = part(new THREE.PlaneGeometry(0.14, 0.192), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }))
    const halo = part(new THREE.PlaneGeometry(0.3, 0.36), haloMaterial(RARITY_COLORS.c, 0), 0, 0, -0.004)
    holder.add(halo, frame, face)
    live.add(holder)
    return { holder, texture, frame, halo, phase: (i * Math.PI * 2) / 5 }
  })
  const sparks = Array.from({ length: 14 }, (_, i) => {
    const s = part(new THREE.SphereGeometry(0.008, 5, 4), haloMaterial(i % 3 ? '#9fe8ff' : C.amber, 0.9))
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
          const c = card.texture.image as HTMLCanvasElement
          drawCardBack(c.getContext('2d')!, c.width, c.height)
          card.texture.needsUpdate = true
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
    const texture = drawnTexture(176, 240, (c) => drawCardBack(c, 176, 240))
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

/**
 * Banquette d'angle en velours, adossée au mur : là où l'on compare ses tirages. Trois places.
 */
const cardsBench: Builder = () => {
  const g = new THREE.Group()
  const w = 1.7, fabric = lit(C.velvet, 'cloth'), wood = lit(C.walnutDark, 'wood')
  g.add(box(w, 0.2, 0.46, wood, 0, 0.1, 0.25, 0.01), box(w - 0.04, 0.1, 0.42, fabric, 0, 0.25, 0.27, 0.03), box(w, 0.42, 0.1, fabric, 0, 0.5, 0.06, 0.03))
  for (let i = 0; i < 6; i++) g.add(sphere(0.012, lit(C.brass, 'metal'), -w / 2 + 0.2 + i * ((w - 0.4) / 5), 0.52, 0.112, 6))
  for (const [x, color] of [[-0.6, '#c9a24a'], [0.62, '#7a2f2a']] as const) g.add(box(0.24, 0.22, 0.08, lit(color, 'cloth'), x, 0.42, 0.14, 0.04))
  return { solid: g }
}

/** Places de la banquette (cf. seats.ts). */
export const BENCH_SEATS_X = [-0.5, 0, 0.5]

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
  'cards-bench': cardsBench,
} satisfies Record<string, Builder>
