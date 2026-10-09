import * as THREE from 'three'
import { pixelText } from '../arcade/game'
import { animatedScreen, box, cylinder, drawnTexture, glow, keepShared, lit, part, rng, type Builder } from './kit'
import { tr } from '../i18n'

/*
 * Salle de la Pixel War, au bout d'un petit couloir qui part du salon d'arcade : la toile du site
 * (pixel_war.php, un pixel toutes les trente secondes, façon r/place) affichée en direct sur son
 * mur, un poste et une borne pour y jouer (cf. src/game-embed.ts ; la borne est dans arcade.ts), le nuancier, et un sol qui est lui-même
 * une toile. Une pièce blanche et claire, à l'opposé de l'arcade : ce sont les pixels qui la colorent.
 *
 * Un objet accroché est construit dos au mur (origine sur la face du mur, au niveau du sol,
 * contenu vers +z).
 */

/**
 * Les soixante-douze couleurs de la Pixel War, dans l'ordre du site (cf. phputils/pixel_war/config.php,
 * repo elitedangereuselight). La toile en direct arrive avec sa propre palette : celle-ci sert au décor.
 */
const PALETTE = [
  '#6D001A', '#BE0039', '#FA6D00', '#FFA800', '#FFD635', '#FFF8B8', '#00A368', '#00CC78', '#7EED56', '#00756F', '#009EAA', '#00CCC0',
  '#2450A4', '#3690EA', '#51E9F4', '#493AC1', '#6A5CFF', '#94B3FF', '#811E9F', '#B44AC0', '#E4ABFF', '#DE107F', '#FF3881', '#FF99AA',
  '#6D482F', '#9C6926', '#FFB470', '#000000', '#515252', '#898D90', '#D4D7D9', '#FFFFFF',
  '#FF4500', '#D4A017', '#6B7A1E', '#1B4D2E', '#B8F5D0', '#003B40', '#BFE6FF', '#16235C', '#3D1A52', '#7A0C4A', '#F5D0B0', '#E0A07A',
  '#C8B560', '#A63A1B', '#3E1F14', '#262829',
  '#E8202F', '#FF6B6B', '#FF9A4D', '#FFE680', '#0E2A16', '#2F7A3A', '#B5D33D', '#E4F7A8', '#0A1330', '#4A6A8A', '#7FB2D9', '#E8F6FF',
  '#1E0F33', '#6B4E9E', '#9E2B6B', '#FF6BD6', '#FFD9E1', '#E8C9A0', '#C68642', '#8D5524', '#3A3D40', '#6E7275', '#B0B4B7', '#ECEEEF',
]
/** Le nuancier du site : les couleurs rangées par teinte, douze par ligne. */
const PALETTE_ORDER = [
  0, 1, 48, 49, 32, 2, 50, 3, 33, 4, 51, 5, 52, 35, 53, 34, 6, 7, 54, 8, 55, 36, 37, 9,
  10, 11, 14, 59, 38, 17, 58, 13, 57, 12, 39, 56, 60, 40, 15, 61, 16, 18, 19, 20, 41, 62, 21, 63,
  22, 23, 64, 42, 65, 26, 43, 66, 44, 25, 67, 45, 24, 46, 27, 47, 68, 28, 69, 29, 70, 30, 71, 31,
]
/** Couleurs vives, pour les pixels semés et les cubes. */
const BRIGHT = [1, 2, 3, 4, 6, 8, 11, 13, 14, 16, 18, 19, 21, 22, 23].map((i) => PALETTE[i])

const C = { frame: '#1b1d24', panel: '#2a2e36', white: '#f4f6f8', grid: '#dfe3e7', chrome: '#cfd6de' }

/** Dessins en pixels : une lettre par case (cf. INK), '.' pour une case vide. */
const INK: Record<string, string> = {
  r: '#BE0039', R: '#E8202F', o: '#FA6D00', y: '#FFD635', g: '#00A368', l: '#7EED56', t: '#00CCC0', c: '#51E9F4', b: '#3690EA', n: '#2450A4',
  v: '#811E9F', m: '#FF3881', p: '#FF99AA', k: '#000000', d: '#515252', s: '#898D90', a: '#D4D7D9', w: '#FFFFFF',
}
const SPRITES = {
  heart: ['.rr.rr.', 'rRRrRRr', 'rRRRRRr', '.rRRRr.', '..rRr..', '...r...'],
  o7: ['ooo.ooo', 'o.o...o', 'o.o..o.', 'o.o..o.', 'ooo..o.'],
  // Un Cobra vu de dessus, ses deux tuyères allumées.
  cobra: ['....a....', '...asa...', '..asssa..', '.assossa.', 'asssssssa', 'ad.sss.da', '.c.....c.'],
  invader: ['..l..l..', '.gllllg.', 'gl.ll.lg', 'llllllll', '.l.gg.l.', 'l......l'],
  smiley: ['.yyyy.', 'yykyky', 'yyyyyy', 'ykyyky', 'yykkyy', '.yyyy.'],
  // La fleur thargoïde, à huit pétales.
  flower: ['..g.g..', '.glglg.', 'gltttlg', '.ltctl.', 'gltttlg', '.glglg.', '..g.g..'],
  rainbow: ['rrrrrrrrrrrr', 'oooooooooooo', 'yyyyyyyyyyyy', 'gggggggggggg', 'bbbbbbbbbbbb', 'vvvvvvvvvvvv'],
  star: ['...y...', '...y...', 'yyyyyyy', '.yyyyy.', '..yyy..', '.yy.yy.', 'y.....y'],
} satisfies Record<string, string[]>

/** Pose un dessin, case (x, y) en haut à gauche, sur un contexte dont l'unité est la case. */
function stamp(g: CanvasRenderingContext2D, sprite: string[], x: number, y: number) {
  sprite.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      if (row[i] === '.') continue
      g.fillStyle = INK[row[i]]
      g.fillRect(x + i, y + j, 1, 1)
    }
  })
}

// ---------------------------------------------------------------- sol

/** Cases par mètre : huit, soit quarante sur la largeur de la pièce. */
const CELLS = 8

/** Sol de la salle : une toile blanche quadrillée, déjà bien entamée (`label` : largeur x profondeur). */
const pixelFloor: Builder = ({ label = '5x3', random }) => {
  const [w, d] = label.split('x').map(Number)
  const cols = Math.round(w * CELLS), rows = Math.round(d * CELLS), px = 8
  const map = drawnTexture(cols * px, rows * px, (g) => {
    g.fillStyle = C.white
    g.fillRect(0, 0, cols * px, rows * px)
    g.save()
    g.scale(px, px)
    // Des pixels isolés, et une bordure disputée le long du mur du fond.
    for (let i = 0; i < cols * rows * 0.035; i++) {
      g.fillStyle = BRIGHT[Math.floor(random() * BRIGHT.length)]
      g.fillRect(Math.floor(random() * cols), Math.floor(random() * rows), 1, 1)
    }
    for (let x = 0; x < cols; x++) {
      const h = 1 + Math.floor(random() * 3)
      g.fillStyle = PALETTE[x < cols / 2 ? (random() < 0.8 ? 2 : 3) : random() < 0.8 ? 13 : 14]
      g.fillRect(x, rows - h, 1, h)
    }
    const at = (fx: number, fz: number) => [Math.floor(fx * cols), Math.floor(fz * rows)] as const
    const placed: [string[], number, number][] = [
      [SPRITES.rainbow, 0.3, 0.3], [SPRITES.heart, 0.62, 0.62], [SPRITES.cobra, 0.7, 0.26], [SPRITES.smiley, 0.08, 0.34],
      [SPRITES.o7, 0.32, 0.64], [SPRITES.flower, 0.06, 0.66],
    ]
    for (const [sprite, fx, fz] of placed) stamp(g, sprite, ...at(fx, fz))
    g.restore()
    // Le quadrillage, à peine marqué.
    g.fillStyle = C.grid
    for (let x = 0; x <= cols; x++) g.fillRect(x * px, 0, 1, rows * px)
    for (let z = 0; z <= rows; z++) g.fillRect(0, z * px, cols * px, 1)
  })
  map.magFilter = THREE.NearestFilter
  const floor = part(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map, polygonOffset: true, polygonOffsetFactor: -2 }), 0, 0.006, 0)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  const g = new THREE.Group()
  g.add(floor)
  return { solid: g }
}

/**
 * Pixels semés au sol, de plus en plus serrés vers +z : la traînée qui mène de l'arcade à la
 * salle (`label` : largeur x longueur).
 */
const pixelTrail: Builder = ({ label = '1x3', random }) => {
  const [w, d] = label.split('x').map(Number)
  const cols = Math.round(w * CELLS), rows = Math.round(d * CELLS)
  const map = drawnTexture(cols, rows, (g) => {
    for (let z = 0; z < rows; z++) {
      for (let x = 0; x < cols; x++) {
        if (random() > 0.05 + 0.5 * (z / rows) ** 2) continue
        g.fillStyle = BRIGHT[Math.floor(random() * BRIGHT.length)]
        g.fillRect(x, z, 1, 1)
      }
    }
  })
  map.magFilter = THREE.NearestFilter
  map.minFilter = THREE.NearestFilter
  map.generateMipmaps = false
  // Par-dessus la moquette de l'arcade : un peu plus haut qu'elle, et la peinture luit comme ses fluos.
  const floor = part(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.4, transparent: true, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -4 }), 0, 0.009, 0)
  floor.rotation.x = -Math.PI / 2
  const g = new THREE.Group()
  g.add(floor)
  return { solid: g }
}

// ---------------------------------------------------------------- la toile en direct

/** État de la toile, servi par le site sans compte (le mode streamer s'en sert aussi). */
const STATE_URL = '/phputils/pixel_war/api/state.php'
/** Secondes entre deux lectures de la toile, tant qu'on voit le pont. */
const REFRESH = 30

interface PixelWarState {
  bounds?: { x0: number; y0: number; x1: number; y1: number }
  palette?: string[]
  empty_color?: string
  cooldown?: number
  board?: { cells?: [number, number, number, ...number[]][] }
}

/** La toile, partagée par tous les écrans : une image d'attente, puis celle du site. */
const canvas = { image: null as HTMLCanvasElement | null, live: false, pixels: 0, cooldown: 30, asked: -Infinity, busy: false }

function waitingImage(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#FFFFFF'
  g.fillRect(0, 0, 64, 64)
  const random = rng(2022)
  for (let i = 0; i < 260; i++) {
    g.fillStyle = BRIGHT[Math.floor(random() * BRIGHT.length)]
    g.fillRect(Math.floor(random() * 64), Math.floor(random() * 64), 1, 1)
  }
  stamp(g, SPRITES.cobra, 27, 10)
  stamp(g, SPRITES.heart, 10, 40)
  stamp(g, SPRITES.invader, 44, 42)
  stamp(g, SPRITES.o7, 28, 30)
  stamp(g, SPRITES.rainbow, 6, 6)
  return c
}

/** Relit la toile du site ; sans réponse (hors ligne, site local éteint), l'image en place reste. */
async function refreshCanvas() {
  if (canvas.busy) return
  canvas.busy = true
  try {
    const response = await fetch(STATE_URL, { signal: AbortSignal.timeout(10000) })
    if (!response.ok) return
    const state = (await response.json()) as PixelWarState
    const b = state.bounds, cells = state.board?.cells, palette = state.palette
    if (!b || !cells || !palette) return
    const image = document.createElement('canvas')
    image.width = b.x1 - b.x0 + 1
    image.height = b.y1 - b.y0 + 1
    const g = image.getContext('2d')!
    g.fillStyle = state.empty_color ?? '#FFFFFF'
    g.fillRect(0, 0, image.width, image.height)
    for (const [x, y, color] of cells) {
      g.fillStyle = palette[color] ?? '#000000'
      g.fillRect(x - b.x0, y - b.y0, 1, 1)
    }
    Object.assign(canvas, { image, live: true, pixels: cells.length, cooldown: state.cooldown ?? 30 })
  } catch {
    // Pas de site : on garde l'image d'attente.
  } finally {
    canvas.busy = false
  }
}

const SCREEN = { w: 1.05, px: 256, head: 30, foot: 22 }

/**
 * Grand écran mural : la toile de la Pixel War telle qu'elle est sur le site, relue toutes les
 * trente secondes ; dessous, le compte des pixels posés et le délai entre deux pixels.
 */
const pixelScreen: Builder = () => {
  const { w, px, head, foot } = SCREEN
  const H = head + px + foot, h = (w * H) / px, y = 0.2 + h / 2
  const g = new THREE.Group()
  g.add(box(w + 0.12, h + 0.12, 0.05, lit(C.frame), 0, y, 0.025, 0.012), box(w + 0.04, h + 0.04, 0.012, lit(C.panel), 0, y, 0.052))
  // Un liseré de pixels de couleur, sous le cadre.
  for (let i = 0; i < 12; i++) g.add(box(0.07, 0.03, 0.02, glow(PALETTE[PALETTE_ORDER[i * 6 + 3]]), -0.44 + i * 0.08, 0.12, 0.03))
  const screen = animatedScreen(px, H, 1, (c, t) => {
    c.imageSmoothingEnabled = false
    c.fillStyle = '#101218'
    c.fillRect(0, 0, px, H)
    'PIXEL WAR'.split('').forEach((ch, i) => {
      c.fillStyle = BRIGHT[(i * 4 + 1) % BRIGHT.length]
      pixelText(c, ch, 12 + i * 18, 8, 2)
    })
    c.fillStyle = canvas.live && Math.floor(t) % 2 ? '#E8202F' : '#515252'
    c.fillRect(px - 62, 11, 8, 8)
    c.fillStyle = '#ECEEEF'
    pixelText(c, canvas.live ? tr('DIRECT', 'LIVE') : tr('DÉMO', 'DEMO'), px - 48, 12, 1)
    c.drawImage((canvas.image ??= waitingImage()), 0, head, px, px)
    c.fillStyle = '#FFD635'
    pixelText(c, canvas.live ? `${canvas.pixels} PIXELS` : tr('LA TOILE DU SITE', 'THE SITE CANVAS'), 8, head + px + 8, 1)
    c.fillStyle = '#ECEEEF'
    pixelText(c, `1 PIXEL / ${canvas.cooldown} S`, px - 8, head + px + 8, 1, 'right')
  })
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: screen.texture }), 0, y, 0.06))
  return {
    solid: g,
    live,
    update: (t) => {
      if (t - canvas.asked > REFRESH) {
        canvas.asked = t
        void refreshCanvas()
      }
      screen.tick(t)
    },
  }
}

// ---------------------------------------------------------------- postes de jeu

/**
 * Poste de la Pixel War, adossé au mur : un pupitre incliné à gros boutons de couleur, et un
 * moniteur où un curseur pose ses pixels un à un, le temps de recharge entre deux.
 */
const pixelTerminal: Builder = ({ random }) => {
  const g = new THREE.Group()
  const dark = lit(C.frame), panel = lit(C.panel)
  // Caisson blanc, joues de couleur : chaque poste a les siennes.
  const cheek = lit(BRIGHT[Math.floor(random() * BRIGHT.length)])
  g.add(box(0.7, 0.5, 0.42, lit(C.white), 0, 0.25, 0.23, 0.012))
  for (const x of [-0.36, 0.36]) g.add(box(0.03, 1.02, 0.46, cheek, x, 0.51, 0.23, 0.008))
  g.add(box(0.7, 0.5, 0.1, dark, 0, 0.77, 0.07), box(0.72, 0.04, 0.2, dark, 0, 1.0, 0.12))
  const desk = box(0.7, 0.03, 0.3, panel, 0, 0.535, 0.3)
  desk.rotation.x = 0.22
  g.add(desk)
  // Les boutons : huit couleurs, et le gros bouton blanc qui pose le pixel.
  const keys = [1, 2, 4, 6, 13, 16, 19, 22]
  keys.forEach((k, i) => g.add(cylinder(0.024, 0.024, 0.016, glow(PALETTE[k]), -0.26 + (i % 4) * 0.066, 0.553 - Math.floor(i / 4) * 0.014, 0.27 + Math.floor(i / 4) * 0.07, 10)))
  g.add(cylinder(0.045, 0.045, 0.02, lit(C.white), 0.18, 0.548, 0.3, 14), cylinder(0.052, 0.052, 0.008, lit(C.chrome, 'metal'), 0.18, 0.54, 0.3, 14))
  // Le moniteur : la toile vue de près, le dessin qui se pose case par case, la barre de recharge.
  const order = SPRITES.heart.flatMap((row, j) => row.split('').map((ch, i) => ({ ch, i, j }))).filter((p) => p.ch !== '.')
  const offset = Math.floor(random() * order.length)
  const screen = animatedScreen(64, 48, 2, (c, t) => {
    c.fillStyle = '#FFFFFF'
    c.fillRect(0, 0, 64, 48)
    c.fillStyle = C.grid
    for (let x = 0; x <= 64; x += 4) c.fillRect(x, 0, 1, 40)
    for (let y = 0; y <= 40; y += 4) c.fillRect(0, y, 64, 1)
    const step = Math.floor(t * 0.5) + offset, n = step % (order.length + 6)
    order.slice(0, n).forEach((p) => {
      c.fillStyle = INK[p.ch]
      c.fillRect(18 + p.i * 4 + 1, 8 + p.j * 4 + 1, 3, 3)
    })
    const next = order[Math.min(n, order.length - 1)]
    c.strokeStyle = '#000000'
    c.strokeRect(18 + next.i * 4 + 0.5, 8 + next.j * 4 + 0.5, 4, 4)
    c.fillStyle = '#262829'
    c.fillRect(0, 41, 64, 7)
    c.fillStyle = '#FA6D00'
    c.fillRect(2, 43, 60 * ((t * 0.5) % 1), 3)
  })
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(0.58, 0.435), new THREE.MeshBasicMaterial({ map: screen.texture }), 0, 0.775, 0.122))
  return { solid: g, live, update: (t) => screen.tick(t) }
}

// ---------------------------------------------------------------- nuancier, cubes, enseigne

/** Nuancier mural : les soixante-douze couleurs de la Pixel War, rangées par teinte comme sur le site. */
const pixelPalette: Builder = () => {
  const g = new THREE.Group()
  const cell = 0.112, w = 12 * cell, h = 6 * cell, y0 = 0.2
  g.add(box(w + 0.1, h + 0.1, 0.03, lit(C.frame), 0, y0 + h / 2, 0.015, 0.008))
  PALETTE_ORDER.forEach((index, k) => {
    const i = k % 12, j = Math.floor(k / 12)
    g.add(box(cell - 0.016, cell - 0.016, 0.02, lit(PALETTE[index]), -w / 2 + (i + 0.5) * cell, y0 + h - (j + 0.5) * cell, 0.038))
  })
  return { solid: g }
}

/** Tas de gros pixels : des cubes de couleur empilés, comme des cases qu'on n'a pas encore posées. */
const pixelCubes: Builder = ({ random }) => {
  const g = new THREE.Group()
  const s = 0.2
  const cube = (i: number, j: number, k: number) => g.add(box(s - 0.008, s - 0.008, s - 0.008, lit(BRIGHT[Math.floor(random() * BRIGHT.length)]), (i - 1) * s, (j + 0.5) * s, (k - 0.5) * s))
  for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) cube(i, 0, k)
  for (const [i, k] of [[0, 0], [1, 0], [1, 1], [2, 1]]) if (random() < 0.85) cube(i, 1, k)
  cube(1, 2, random() < 0.5 ? 0 : 1)
  return { solid: g }
}

let sign: THREE.Texture | undefined

/** Enseigne lumineuse au-dessus d'une porte : « PIXEL WAR » en lettres de pixels, une couleur par lettre. */
const pixelSign: Builder = () => {
  sign ??= keepShared(drawnTexture(128, 32, (c) => {
    c.fillStyle = '#101218'
    c.fillRect(0, 0, 128, 32)
    'PIXEL WAR'.split('').forEach((ch, i) => {
      c.fillStyle = BRIGHT[(i * 4 + 1) % BRIGHT.length]
      pixelText(c, ch, 11 + i * 12, 9, 2)
    })
  }))
  sign.magFilter = THREE.NearestFilter
  const g = new THREE.Group()
  g.add(box(0.86, 0.24, 0.05, lit(C.frame), 0, 1.2, 0.025, 0.008))
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(0.8, 0.2), new THREE.MeshBasicMaterial({ map: sign }), 0, 1.2, 0.052))
  return { solid: g, live }
}

export const PIXELWAR = {
  'pixelwar-floor': pixelFloor,
  'pixelwar-trail': pixelTrail,
  'pixelwar-screen': pixelScreen,
  'pixelwar-terminal': pixelTerminal,
  'pixelwar-palette': pixelPalette,
  'pixelwar-cubes': pixelCubes,
  'pixelwar-sign': pixelSign,
} satisfies Record<string, Builder>
