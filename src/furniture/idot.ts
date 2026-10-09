import * as THREE from 'three'
import { animatedScreen, box, cylinder, drawnTexture, glow, instanced, lit, mesh, part, setInstance, type Builder } from './kit'
import { tr } from '../i18n'

/*
 * Le poste d'exploration, au bout de la gaine technique de la cale (cf. levels.ts) : la pièce
 * d'It's Dangerous Out There (https://idot.elitedangereuse.fr), le roguelite d'exploration en
 * pixel art de Ben Carter Jr, inspiré d'Out There et de FTL. Une destination lointaine, un
 * Mandalay, du carburant compté : « La destination est certaine. Le voyage ne l'est jamais. »
 *
 * Tout y est en pixels, comme dans le jeu : les écrans sont dessinés en basse définition et
 * agrandis sans lissage, les maquettes du Mandalay et du commandant sont leurs sprites, extrudés
 * pixel par pixel. Les couleurs sont celles du jeu (indigo, violet, orange, cyan : cf. son
 * css/style.css), ses sprites sont repris tels quels (cf. son src/sprites.js, licence MIT).
 */

const C = {
  bg: '#04051a',
  panel: '#111330',
  panelHi: '#1c1f4a',
  line: '#2a2e6e',
  line2: '#3b4199',
  card: '#8f86ff',
  accent: '#ffb054',
  accentHi: '#ffd18a',
  accentDeep: '#f0943c',
  coral: '#ff8a5c',
  cyan: '#74dcff',
  violet: '#a993ff',
  good: '#7df0b4',
  ink: '#ecebff',
  muted: '#a4a7d8',
}

/** Matériaux de la soute du jeu : sigle et couleur (cf. son src/data.js). */
const MATERIALS: [string, string][] = [['Fe', '#ff7f5e'], ['Ni', '#c3cde6'], ['C', '#ffd36e'], ['V', '#6fe08f'], ['Ge', '#62d6ff'], ['Po', '#c98bff']]

// ---------------------------------------------------------------- les sprites du jeu

/** Palette des sprites du jeu : ombres bleu-violet, lumières chaudes. */
const SPRITE: Record<string, string> = {
  o: '#141a2b', x: '#0c0f1a', d: '#3d4363', s: '#6c7392', m: '#a4aabd', l: '#d4d8df', w: '#f6f2e8',
  a: '#ea8a2e', b: '#a14c22', y: '#ffe9a8', c: '#17223a', k: '#2f4d7a', g: '#cdf2ff', e: '#20283d', r: '#4d5472',
}
/** Celle du commandant : la même, avec la visière dorée et le scanner. */
const ASTRO_COLORS: Record<string, string> = { ...SPRITE, V: '#ffd27a', v: '#e0902e', u: '#7a3a22', g: '#ffffff', k: '#232a45', c: '#6fe8ff' }

/** Le Mandalay de profil, nez à droite (64 × 20) : celui des surfaces de planètes. */
const SHIP = [
  '..ooo...........................................................',
  '..oaloo.........................................................',
  '...odlmsooo.........ooooooooo...................................',
  '....oodssssooooooooollllllllloooo...............................',
  '.....ooooowwwwwwwwwwwwwwwwwwwwwwo...............................',
  '......ooolllllllllllllllllllllllwoooo...........................',
  '.....oerwlllllllllllllllmllllllllwwwwooo.......ooooo............',
  '.....oerlsssssssssssslllmllllllllllllwwwooo...ocggkcooo.........',
  '.....odddddddddddddddsssdsmmmmmmmllllmllwwwooockkccccccoo.......',
  '.oooowwwwlwwwwwwwlwwwdddddsssmmmmmmmmmlllllwwwwwwcckkkcccoo.....',
  '.orllllllmlllllllmlllwwwwwdddssmmmmmmsmmllllllwwwwaaaackkccoo...',
  '.oerlllllmlllllllmllllllllwwwddaaaabaaaaaaaaaabaaawwwwwwwwwwwooo',
  '.oermmmmmsaaaaaaabaaaaaaaaaaassssssssdssssssssdsslllllmmmooooo..',
  '.oermmmmmsmmmmmmmsmsssssssdddddddddddddlllllsoooooooooooo.......',
  '.oersssssdsssssssdsddddddddddddddllllllssoooo...................',
  '.orddddddodddddddodssssssslllllllsssooooo.......................',
  '...oooooooooossssdslllllllssssoooooo............................',
  '.............oaalllsssoooooooo..................................',
  '.........oaaaaoooooooo..........................................',
]
/** Le même, petit (30 × 11) : celui des scènes spatiales. */
const SHIP_SMALL = [
  '.oo...........................',
  '..oaoo........................',
  '...osdoooooooooo..............',
  '...owwwwwwwwwwwwoooooo........',
  '...oddddddddllllwwwkgcoooo....',
  'oooowwwwwwwwmmmmmmmccccwwwooo.',
  'oerlllllllllmaaaaaaaaaaammlwoo',
  'oermaaaaaaamssssssddddooooo...',
  '.ossssssssssommmmlllloooo.....',
  '..oaassssssmmmooooooo.........',
  '...ooooooooooo................',
]
/** Colonnes des jambes du train d'atterrissage (2 pixels de large, 4 de haut). */
const GEAR = [22, 39, 52]

/** Le commandant en combinaison (12 × 16), tourné vers la droite : au repos (deux images), et qui scanne. */
const ASTRO = {
  idle0: ['...oooooo...', '..owwwlloo..', '.owwllloVVo.', '.owllloVgVo.', '.ollmmovvvo.', 'ooosmmouuo..', 'olmossoooo..', 'olmolwaaso..', 'oamoldwlmo..', 'osmsldwlmo..', 'osdsmoddmo..', '.ooosoosso..', '...omsowlo..', '...omsowlo..', '..okddodsso.', '...ooo.ooo..'],
  idle1: ['............', '...oooooo...', '..owwwlloo..', '.owwllloVVo.', '.owllloVgVo.', '.ollmmovvvo.', 'ooosmmouuo..', 'olmossoooo..', 'olmolwaaso..', 'oamoldwlmo..', 'osmsldwlmo..', 'osdsmoddmo..', '.ooosoosso..', '...omsowlo..', '..okddodsso.', '...ooo.ooo..'],
  scan: ['...oooooo...', '..owwwlloo..', '.owwllloVVo.', '.owllloVgVo.', '.ollmmovvvo.', 'ooosmmouuo..', 'olmossoooooo', 'olmolwawlkco', 'oamoldlmdkko', 'osmslldddoo.', 'osdsmmmmmo..', '.ooosddsso..', '...omsowlo..', '...omsowlo..', '..okddodsso.', '...ooo.ooo..'],
}

/** L'emblème du jeu (13 × 13) : une planète et son anneau. */
const MARK = [
  '.............',
  '.............',
  '....ppppp....',
  '...pHHHppp...',
  '..pHHppppppvv',
  '..pHpppppppv.',
  '..pHpppppp...',
  '..ppppppppp..',
  'vvpppppprrp..',
  '.vvppppprp...',
  '...vvvvrrp...',
  '.............',
  '.............',
]
const MARK_COLORS: Record<string, string> = { p: '#ff9a5c', H: '#ffd18a', r: '#c9567a', v: '#a993ff' }

/** Chiffres 3 × 5 des étiquettes du jeu. */
const DIGITS: Record<string, string[]> = {
  1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['###', '..#', '###', '#..', '###'], 3: ['###', '..#', '.##', '..#', '###'],
  4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '###', '..#', '###'], 6: ['###', '#..', '###', '#.#', '###'],
}

type G = CanvasRenderingContext2D
/** Composantes d'une couleur « #rrggbb », telles qu'un canvas les attend (sRGB, de 0 à 255). */
const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const rect = (g: G, x: number, y: number, w: number, h: number, color: string) => {
  g.fillStyle = color
  g.fillRect(Math.round(x), Math.round(y), w, h)
}

function canvasOf(w: number, h: number, draw: (g: G) => void): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  return c
}

/** Dessins qui ne changent pas, faits une fois pour tous les meubles (et tous les ponts). */
const baked = new Map<string, HTMLCanvasElement>()
function cached(key: string, make: () => HTMLCanvasElement): HTMLCanvasElement {
  let c = baked.get(key)
  if (!c) baked.set(key, (c = make()))
  return c
}

/** Un sprite du jeu (une lettre par pixel), dans son canvas. */
const sprite = (key: string, rows: string[], colors: Record<string, string>, flip = false) =>
  cached(`sprite:${key}:${flip}`, () => canvasOf(rows[0].length, rows.length, (g) => {
    rows.forEach((row, j) => [...row].forEach((ch, i) => {
      if (colors[ch]) rect(g, flip ? row.length - 1 - i : i, j, 1, 1, colors[ch])
    }))
  }))

/** Texte en pixels francs : écrit petit, puis seuillé (aucun gris de lissage). */
function pixelText(text: string, size: number, color: string): HTMLCanvasElement {
  return cached(`text:${text}:${size}:${color}`, () => {
    const font = `${size >= 9 ? 'bold ' : ''}${size}px Verdana, sans-serif`
    const probe = document.createElement('canvas').getContext('2d')!
    probe.font = font
    const w = Math.max(1, Math.ceil(probe.measureText(text).width) + 2), h = Math.ceil(size * 1.4)
    return canvasOf(w, h, (g) => {
      g.font = font
      g.textBaseline = 'middle'
      g.fillStyle = '#ffffff'
      g.fillText(text, 1, h / 2)
      const img = g.getImageData(0, 0, w, h)
      const [r, gr, b] = rgbOf(color)
      for (let i = 0; i < img.data.length; i += 4) {
        const on = img.data[i + 3] > 100
        img.data[i] = r
        img.data[i + 1] = gr
        img.data[i + 2] = b
        img.data[i + 3] = on ? 255 : 0
      }
      g.putImageData(img, 0, 0)
    })
  })
}

/** Pose un texte en pixels ; `align` : -1 à gauche de x, 0 centré, 1 à droite. Renvoie sa largeur. */
function write(g: G, text: string, x: number, y: number, size: number, color: string, align = -1): number {
  const t = pixelText(text, size, color)
  g.drawImage(t, Math.round(align === 0 ? x - t.width / 2 : align > 0 ? x - t.width : x), Math.round(y - t.height / 2))
  return t.width
}

// ---------------------------------------------------------------- le ciel et les planètes

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5)
const dither = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)]

function hash(x: number, y: number, seed: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
  return s - Math.floor(s)
}
function noise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy)
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let sum = 0, amp = 0.5, norm = 0
  for (let o = 0; o < octaves; o++) {
    sum += noise(x, y, seed + o * 13) * amp
    norm += amp
    amp *= 0.5
    x *= 2
    y *= 2
  }
  return sum / norm
}

/** Rampes de l'espace du jeu, du plus sombre au plus clair (cf. THEMES dans son src/scenery.js). */
const VIOLET = ['#0b0722', '#170c40', '#251262', '#391a86', '#5222ad', '#6a36d2', '#5c62ee', '#4f9cff', '#86dcff'].map(rgbOf)
const MAGENTA = ['#110519', '#260a30', '#430e4c', '#69186a', '#912680', '#bd3d96', '#e463a6'].map(rgbOf)

/** Fond d'espace : une nébuleuse tramée, violette et bleu électrique, un voile magenta, des étoiles. */
function nebula(w: number, h: number, seed: number): HTMLCanvasElement {
  return cached(`nebula:${w}:${h}:${seed}`, () => canvasOf(w, h, (g) => {
    const img = g.createImageData(w, h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const n = fbm(x * 0.021, y * 0.03, seed)
        // Le nuage s'efface vers les bords, et se creuse de vides.
        const veil = fbm(x * 0.009 + 7, y * 0.013, seed + 5, 2)
        const v = Math.max(0, n * 1.7 - 0.45) * THREE.MathUtils.smoothstep(veil, 0.3, 0.62)
        const pink = fbm(x * 0.03 + 30, y * 0.04, seed + 9, 3)
        const ramp = pink > 0.6 && v < 0.5 ? MAGENTA : VIOLET
        const k = THREE.MathUtils.clamp(Math.floor(v * (ramp.length + 1) + dither(x, y) * 1.2 + 0.5), 0, ramp.length - 1)
        const i = (y * w + x) * 4
        img.data[i] = ramp[k][0]
        img.data[i + 1] = ramp[k][1]
        img.data[i + 2] = ramp[k][2]
        img.data[i + 3] = 255
      }
    }
    g.putImageData(img, 0, 0)
    for (let s = 0; s < (w * h) / 110; s++) {
      const x = Math.floor(hash(s, 1, seed) * w), y = Math.floor(hash(s, 2, seed) * h)
      g.globalAlpha = 0.35 + hash(s, 3, seed) * 0.6
      rect(g, x, y, 1, 1, ['#ffffff', '#cfd6ff', '#ffe2b8'][s % 3])
    }
    g.globalAlpha = 1
  }))
}

interface PlanetLook {
  /** Sombre, moyen, clair (cf. les palettes des corps dans le src/data.js du jeu). */
  colors: [string, string, string]
  /** Géante gazeuse : des bandes. Sinon, un relief. */
  banded?: boolean
  ring?: string
  seed: number
}
const PLANETS: Record<string, PlanetLook> = {
  metal: { colors: ['#3a3236', '#7a6a62', '#d0c0a8'], seed: 3 },
  gas: { colors: ['#7a4a2a', '#c9905a', '#ecd2a6'], banded: true, seed: 5 },
  ringed: { colors: ['#6b3a24', '#c98a52', '#f0d6a6'], banded: true, ring: '#8a5a3a', seed: 8 },
  icy: { colors: ['#3d5a73', '#7fa8c9', '#d6ecff'], seed: 11 },
  hmc: { colors: ['#4a2f2a', '#9a6248', '#d9a07a'], seed: 14 },
  water: { colors: ['#123a6a', '#2a6fc0', '#8fd0ff'], seed: 17 },
}

/** Teinte de la surface d'une planète (0 sombre, 1 clair) en un point (longitude u en tours, latitude v de -1 à 1). */
function surfaceTone(look: PlanetLook, u: number, v: number): number {
  // Le bruit boucle en longitude : on mélange deux tirages décalés d'un tour.
  const wrap = (f: (uu: number) => number) => {
    const k = u - Math.floor(u)
    return f(k) * (1 - k) + f(k - 1) * k
  }
  if (look.banded) return 0.5 + 0.5 * Math.sin(v * 9 + wrap((k) => fbm(k * 5, v * 2.5, look.seed, 3)) * 5)
  return wrap((k) => fbm(k * 6, v * 3 + 9, look.seed, 4)) * 1.5 - 0.25
}

/** Planète en pixels, de rayon `r`, éclairée du haut à gauche, à la rotation `phase` (en tours). */
function planet(kind: string, r: number, phase = 0): HTMLCanvasElement {
  return cached(`planet:${kind}:${r}:${phase.toFixed(3)}`, () => {
    const look = PLANETS[kind]
    const pad = look.ring ? Math.ceil(r * 0.9) : 0
    const size = r * 2 + 1
    const tones = [`rgb(${rgbOf(look.colors[0]).map((v) => Math.round(v * 0.55)).join(',')})`, ...look.colors]
    return canvasOf(size + pad * 2, size, (g) => {
      const ring = (front: boolean) => {
        if (!look.ring) return
        const a = r * 1.75, b = r * 0.42
        for (let y = -Math.ceil(b); y <= Math.ceil(b); y++) {
          for (let x = -Math.ceil(a); x <= Math.ceil(a); x++) {
            // Anneau incliné : la moitié du bas passe devant la planète.
            const yy = y - x * 0.18
            const d = (x / a) ** 2 + (yy / b) ** 2
            if (d < 0.55 || d > 1 || (yy > 0) !== front) continue
            rect(g, pad + r + x, r + y, 1, 1, d > 0.8 || (x + y) % 3 === 0 ? look.ring : look.colors[1])
          }
        }
      }
      ring(false)
      for (let y = -r; y <= r; y++) {
        for (let x = -r; x <= r; x++) {
          const nx = x / (r + 0.5), ny = y / (r + 0.5), d2 = nx * nx + ny * ny
          if (d2 > 1) continue
          const nz = Math.sqrt(1 - d2)
          const light = Math.max(0, -0.62 * nx - 0.5 * ny + 0.6 * nz)
          const tone = surfaceTone(look, Math.atan2(nx, nz) / (Math.PI * 2) + phase, ny)
          const k = THREE.MathUtils.clamp(Math.floor((light * 0.85 + (tone - 0.5) * 0.4) * 4 + dither(x + r, y + r) * 0.9 + 0.35), 0, 3)
          rect(g, pad + r + x, r + y, 1, 1, tones[k])
        }
      }
      ring(true)
    })
  })
}

/** Texture d'une planète pour une sphère (carte équirectangulaire basse définition, sans lissage). */
function planetMap(kind: string): THREE.CanvasTexture {
  const look = PLANETS[kind]
  const W = 48, H = 24
  const t = drawnTexture(W, H, (g) => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const tone = surfaceTone(look, x / W, (y / H) * 2 - 1)
        rect(g, x, y, 1, 1, look.colors[THREE.MathUtils.clamp(Math.floor(tone * 3 + dither(x, y) * 0.8), 0, 2)])
      }
    }
  })
  t.magFilter = THREE.NearestFilter
  t.minFilter = THREE.NearestFilter
  t.generateMipmaps = false
  return t
}

/** Étoile de classe G, au bord gauche de l'écran : un disque pâle, sa couronne tramée, ses protubérances. */
function drawSun(g: G, cx: number, cy: number, r: number, t: number) {
  for (let y = -r - 9; y <= r + 9; y++) {
    for (let x = -r - 9; x <= r + 9; x++) {
      const px = cx + x, py = cy + y
      if (px < 0) continue
      const d = Math.hypot(x, y)
      const flare = Math.sin(Math.atan2(y, x) * 9 + t * 0.7) * 2 + Math.sin(Math.atan2(y, x) * 4 - t * 0.4) * 2
      if (d < r - 3) rect(g, px, py, 1, 1, noise(x * 0.25, y * 0.25 + t * 0.2, 4) > 0.62 ? '#ffe7a0' : '#fff7dc')
      else if (d < r) rect(g, px, py, 1, 1, '#ffe7a0')
      else if (d < r + 3 + flare && dither(px, py) > (d - r) / 7 - 0.5) rect(g, px, py, 1, 1, d < r + 2 ? '#ffd36b' : '#ff9e3d')
    }
  }
}

/** Le Mandalay en vol (petit sprite), et le panache de sa tuyère. */
function drawFlight(g: G, x: number, y: number, t: number) {
  const plume = ['#eaffff', '#8ff3ff', '#4fb8ff', '#3a6fd0']
  for (let i = 0; i < 12; i++) {
    for (const row of [6, 7]) {
      if (hash(i, row + Math.floor(t * 14), 7) < i / 14) continue
      rect(g, x - 1 - i, y + row, 1, 1, plume[Math.min(3, Math.floor(i / 3))])
    }
  }
  g.drawImage(sprite('ship-small', SHIP_SMALL, SPRITE), Math.round(x), Math.round(y))
  if (t % 1.2 < 0.25) rect(g, x + 3, y + 9, 1, 1, '#ff4a4a')
}

/** Étiquette numérotée d'un corps du système, comme dans le jeu. */
function drawTag(g: G, n: number, x: number, y: number, selected: boolean) {
  rect(g, x - 3, y, 7, 9, selected ? C.accent : C.line2)
  rect(g, x - 2, y + 1, 5, 7, '#0c0d26')
  const glyph = DIGITS[n]
  glyph?.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === '#') rect(g, x - 1 + i, y + 2 + j, 1, 1, selected ? C.accentHi : C.ink)
  }))
}

/** Cartouche du jeu : fond sombre aux coins rognés, liseré. */
function drawCard(g: G, x: number, y: number, w: number, h: number, edge: string, fill = '#0f0f2a') {
  rect(g, x + 1, y, w - 2, h, edge)
  rect(g, x, y + 1, w, h - 2, edge)
  rect(g, x + 1, y + 1, w - 2, h - 2, fill)
}

/** Le Mandalay posé (grand sprite) sur son train ; (x, y) : le coin haut gauche de la coque. */
function drawLanded(g: G, x: number, y: number, t: number) {
  for (const gx of GEAR) {
    rect(g, x + gx, y + SHIP.length - 3, 2, 6, SPRITE.d)
    rect(g, x + gx - 1, y + SHIP.length + 3, 4, 1, SPRITE.s)
  }
  g.drawImage(sprite('ship', SHIP, SPRITE), Math.round(x), Math.round(y))
  if (t % 1.4 < 0.3) rect(g, x + 10, y + 18, 1, 1, '#ff4a4a')
  if ((t + 0.7) % 1.4 < 0.3) rect(g, x + 3, y + 1, 1, 1, '#eaffff')
}

/** Panorama de surface : ciel de nébuleuse, géante qui se lève, crêtes violettes, régolithe pâle. */
function panorama(w: number, h: number, ground: number): HTMLCanvasElement {
  return cached(`panorama:${w}:${h}:${ground}`, () => canvasOf(w, h, (g) => {
    g.drawImage(nebula(w, h, 23), 0, 0)
    const big = planet('gas', Math.round(h * 0.26))
    g.drawImage(big, Math.round(w * 0.56), Math.round(h * 0.3))
    // Le soleil, haut dans le ciel, et deux lunes.
    const sx = Math.round(w * 0.36), sy = Math.round(h * 0.2)
    for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) {
      const d = Math.hypot(x, y)
      if (d < 4.4) rect(g, sx + x, sy + y, 1, 1, '#ffffff')
      else if (d < 6.2 && dither(x + 8, y + 8) > (d - 4.4) / 2 - 0.5) rect(g, sx + x, sy + y, 1, 1, '#b9c8ff')
    }
    rect(g, Math.round(w * 0.2), Math.round(h * 0.3), 2, 2, '#f6f2e8')
    rect(g, Math.round(w * 0.27), Math.round(h * 0.26), 1, 1, '#c7b39b')
    // Trois plans de crêtes, du plus lointain (clair, brumeux) au plus proche.
    const ridges: [number, number, string, string, number][] = [
      [0.52, 0.11, '#4a3a8a', '#6a59a8', 31], [0.62, 0.1, '#352a6e', '#8c80b0', 37], [0.72, 0.09, '#241c50', '#6f6596', 43],
    ]
    for (const [base, amp, dark, lit, seed] of ridges) {
      for (let x = 0; x < w; x++) {
        const top = Math.round(h * (base - amp * (fbm(x * 0.035, 0, seed, 3) * 1.6 - 0.4) - amp * 0.5 * Math.abs(Math.sin(x * 0.06 + seed))))
        for (let y = top; y < ground; y++) {
          // Le versant éclairé (à gauche de chaque bosse) prend la lumière, en trame.
          const slope = fbm((x + 2) * 0.035, 0, seed, 3) - fbm((x - 2) * 0.035, 0, seed, 3)
          rect(g, x, y, 1, 1, slope > 0.004 && dither(x, y) > (y - top) / 14 - 0.45 ? lit : dark)
        }
      }
    }
    // Le sol : régolithe pâle, cailloux, ombres en trame vers le bas.
    for (let y = ground; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const n = fbm(x * 0.09, y * 0.2, 51, 3) + dither(x, y) * 0.22
        const depth = (y - ground) / Math.max(1, h - ground)
        rect(g, x, y, 1, 1, y === ground ? '#e9e2d2' : n - depth * 0.3 > 0.52 ? '#cfc6b6' : n - depth * 0.3 > 0.36 ? '#a59c98' : '#6f6878')
      }
    }
  }))
}

// ---------------------------------------------------------------- les maquettes en pixels

/** Ombrage d'un cube de maquette, par face (+x, -x, +y, -y, +z, -z) : la lumière vient du haut et de l'avant. */
const FACE_SHADE = [0.8, 0.68, 1, 0.5, 0.94, 0.72]

/**
 * Un sprite extrudé : un cube par pixel, de la couleur du pixel. Centré en x, posé sur y = 0, de
 * `depth` d'épaisseur. Un seul appel de dessin. Ses couleurs ne dépendent pas de l'éclairage de la
 * pièce (un sprite reste un sprite, même dans la pénombre) : le relief est peint sur les faces.
 */
function voxels(rows: string[], colors: Record<string, string>, px: number, depth: number, flip = false): THREE.InstancedMesh {
  const cells: [number, number, string][] = []
  rows.forEach((row, j) => [...row].forEach((ch, i) => {
    if (colors[ch]) cells.push([flip ? row.length - 1 - i : i, rows.length - 1 - j, colors[ch]])
  }))
  const cube = new THREE.BoxGeometry(px, px, depth)
  cube.setAttribute('color', new THREE.Float32BufferAttribute(FACE_SHADE.flatMap((k) => Array(12).fill(k)), 3))
  const im = instanced(cube, cells.map((c) => c[2]), new THREE.MeshBasicMaterial({ vertexColors: true }))
  cells.forEach(([i, j], k) => setInstance(im, k, (i - rows[0].length / 2 + 0.5) * px, (j + 0.5) * px, 0))
  im.instanceMatrix.needsUpdate = true
  return im
}

/** Plan texturé en pixels francs, sans éclairage (un écran, une image rétroéclairée). */
function pixelPlane(texture: THREE.Texture, w: number, h: number, transparent = false): THREE.Mesh {
  texture.magFilter = THREE.NearestFilter
  return part(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture, transparent, depthWrite: !transparent }))
}

/** Cadre à coins rognés autour d'un écran (adossé, face à +z) : le « pas d'escalier » des fenêtres du jeu. */
function steppedFrame(g: THREE.Group, w: number, h: number, y: number, z: number, edge: string, depth = 0.05) {
  const dark = lit(C.panel, 'metal'), s = 0.03
  g.add(box(w, h + s * 2, depth, dark, 0, y, z), box(w + s * 2, h, depth, dark, 0, y, z))
  const line = glow(edge)
  for (const sy of [-1, 1]) g.add(box(w - s, 0.012, 0.012, line, 0, y + sy * (h / 2 + s), z + depth / 2))
  for (const sx of [-1, 1]) g.add(box(0.012, h - s, 0.012, line, sx * (w / 2 + s), y, z + depth / 2))
}

// ---------------------------------------------------------------- le mobilier

/**
 * La baie d'observation (adossée, face à +z, 3,2 de large) : un mur de pixels où passe la vue d'un
 * système, telle que le jeu la montre. L'étoile à gauche, le Mandalay qui en revient, les corps
 * numérotés ; le scan les passe en revue un à un. Au-dessus, le titre du jeu, en lettres de lumière.
 */
const idotWall: Builder = () => {
  const g = new THREE.Group(), live = new THREE.Group()
  const W = 320, H = 54
  // Les corps du système : type, rayon, position ; ceux du bas ont leur étiquette dessous.
  const bodies: [string, number, number, number][] = [['metal', 4, 118, 27], ['gas', 9, 150, 30], ['ringed', 10, 190, 22], ['gas', 8, 226, 31], ['icy', 5, 256, 28], ['hmc', 7, 286, 24]]
  const screen = animatedScreen(W, H, 8, (c, t) => {
    c.drawImage(nebula(W, H, 2), 0, 0)
    // Quelques étoiles scintillent.
    for (let i = 0; i < 14; i++) {
      if (Math.sin(t * (1.1 + (i % 5) * 0.4) + i * 2.3) > 0.55) rect(c, 60 + ((i * 53) % 255), 3 + ((i * 29) % 46), 1, 1, '#ffffff')
    }
    drawSun(c, -14, 27, 34, t)
    drawFlight(c, 58 + Math.sin(t * 0.5) * 5, 22 + Math.sin(t * 1.3) * 1.5, t)
    const selected = Math.floor(t / 3.5) % bodies.length
    bodies.forEach(([kind, r, x, y], i) => {
      // Les planètes tournent : douze images par tour, chacune dessinée une fois.
      const spin = (Math.floor(t * 0.8 + i * 3) % 12) / 12
      const img = planet(kind, r, spin)
      c.drawImage(img, x - Math.floor(img.width / 2), y - r)
      drawTag(c, i + 1, x, y + r + 3 > H - 10 ? y - r - 11 : y + r + 3, i === selected)
      if (i === selected) {
        // Le réticule du scan détaillé : quatre coins qui se resserrent.
        const k = r + 3 + Math.round(Math.abs(Math.sin(t * 3)) * 2)
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          rect(c, x + sx * k - (sx > 0 ? 2 : 0), y + sy * k, 3, 1, C.accent)
          rect(c, x + sx * k, y + sy * k - (sy > 0 ? 2 : 0), 1, 3, C.accent)
        }
      }
    })
    // Le message du scan, en bas à gauche.
    const text = tr('6 corps détectés', '6 bodies detected')
    drawCard(c, 3, H - 14, pixelText(text, 8, C.ink).width + 11, 12, C.line2)
    rect(c, 6, H - 9, 2, 2, C.violet)
    write(c, text, 10, H - 8, 8, C.ink)
  })
  steppedFrame(g, 3.2, 0.54, 0.44, 0.03, C.line2)
  const view = pixelPlane(screen.texture, 3.2, 0.54)
  view.position.set(0, 0.44, 0.058)
  live.add(view)
  // Le titre : l'emblème, « It's Dangerous » en orange, « Out There » en corail.
  const a = pixelText('It\'s Dangerous', 11, C.accent), b = pixelText('Out There', 11, C.coral)
  const TW = 48 + (a.width + b.width) * 2, TH = 36
  const title = drawnTexture(TW, TH, (c) => {
    c.clearRect(0, 0, TW, TH)
    c.imageSmoothingEnabled = false
    c.drawImage(sprite('mark', MARK, MARK_COLORS), 4, 5, 26, 26)
    c.drawImage(a, 36, TH / 2 - a.height, a.width * 2, a.height * 2)
    c.drawImage(b, 42 + a.width * 2, TH / 2 - b.height, b.width * 2, b.height * 2)
  })
  g.add(box(2.0, 0.2, 0.02, lit('#0a0b24'), 0, 0.875, 0.01, 0.006))
  for (const s of [-1, 1]) g.add(box(0.02, 0.24, 0.03, lit(C.line2, 'metal'), s * 0.99, 0.875, 0.015))
  const sign = new THREE.MeshBasicMaterial({ map: title, transparent: true, depthWrite: false })
  title.magFilter = THREE.NearestFilter
  live.add(part(new THREE.PlaneGeometry(1.9, (1.9 * TH) / TW), sign, 0, 0.875, 0.024))
  return {
    solid: g,
    live,
    update: (t) => {
      screen.tick(t)
      sign.opacity = 0.9 + Math.sin(t * 1.7) * 0.08
    },
  }
}

/** L'écran du poste (240 × 135) : la carte de titre du jeu, puis une sortie à la surface. */
function drawTitleCard(c: G, t: number) {
  c.drawImage(nebula(240, 135, 9), 0, 0)
  c.drawImage(planet('gas', 45, 0.2), 172, 62)
  drawCard(c, 44, 9, 152, 117, C.card)
  write(c, tr('ROGUELITE D\'EXPLORATION', 'EXPLORATION ROGUELITE'), 120, 22, 8, C.violet, 0)
  write(c, 'It\'s Dangerous', 120, 42, 17, C.accent, 0)
  write(c, 'Out There', 120, 62, 13, C.coral, 0)
  write(c, 'Mandalay · 48 al · 24 t', 120, 82, 8, C.muted, 0)
  // Le bouton « Décoller » : il bat.
  const on = Math.floor(t * 2) % 2 === 0
  drawCard(c, 76, 94, 88, 22, on ? C.accentHi : C.accent, on ? C.accent : C.accentDeep)
  write(c, tr('Décoller', 'Launch'), 120, 105, 11, '#1a1030', 0)
}

function drawSurface(c: G, t: number) {
  const ground = 108
  c.drawImage(panorama(240, 135, ground), 0, 0)
  drawLanded(c, 34, ground - SHIP.length - 5, t)
  // Le commandant, descendu de la rampe : il scanne, puis regarde autour de lui.
  const scanning = t % 9 > 4.5
  const key = scanning ? 'scan' : t % 1.8 < 1.1 ? 'idle0' : 'idle1'
  c.drawImage(sprite(`astro-${key}`, ASTRO[key], ASTRO_COLORS), 124, ground - 16)
  if (scanning && Math.floor(t * 4) % 2) {
    // Le faisceau du scanner : un cône pointillé vers le sol.
    for (let i = 1; i <= 8; i++) for (let j = 0; j < 1 + Math.floor(i * 0.8); j++) {
      if ((i + j + Math.floor(t * 12)) % 3 === 0) rect(c, 135 + i, ground - 9 + Math.floor(i * 0.5) + j, 1, 1, '#6fe8ff')
    }
  }
  const text = scanning ? tr('Analyse de la surface…', 'Surveying the surface…') : tr('Le commandant descend la rampe. Le silence est total.', 'The commander walks down the ramp. The silence is total.')
  drawCard(c, 4, 4, pixelText(text, 8, C.ink).width + 9, 13, C.line2)
  write(c, text, 8, 10.5, 8, C.ink)
}

/** Les trois jauges du jeu (carburant, coque, énergie), en segments, et la route. */
function drawGauges(c: G, t: number) {
  rect(c, 0, 0, 48, 80, '#0a0c2c')
  const gauges: [string, string, number][] = [
    [tr('CARB.', 'FUEL'), C.accent, 0.55 + 0.4 * Math.abs(Math.sin(t * 0.07))],
    [tr('COQUE', 'HULL'), C.violet, 0.8],
    [tr('ÉNER.', 'POWER'), C.cyan, 0.35 + 0.6 * Math.abs(Math.sin(t * 0.11 + 1))],
  ]
  gauges.forEach(([name, color, level], i) => {
    const y = 4 + i * 19
    write(c, name, 3, y + 3, 6, color)
    for (let k = 0; k < 14; k++) rect(c, 3 + k * 3, y + 9, 2, 5, k / 14 < level ? color : C.line)
  })
  // La route : du départ à la destination, saut après saut.
  write(c, '1000 al', 24, 66, 6, C.cyan, 0)
  const hops = 9, done = Math.floor(t / 4) % (hops + 1)
  for (let k = 0; k < hops; k++) rect(c, 5 + k * 4, 73, 2, 2, k < done ? C.accent : C.line2)
  rect(c, 42, 72, 4, 4, C.good)
}

/**
 * Le poste d'où l'on lance It's Dangerous Out There (cf. main.ts) : un pupitre indigo, son
 * écran de pixels (le titre du jeu, puis une sortie à la surface), les trois jauges à droite, et
 * sur la tablette, le gros bouton orange « Décoller ».
 */
const idotTerminal: Builder = () => {
  const g = new THREE.Group(), live = new THREE.Group()
  const dark = lit(C.panel, 'metal'), hi = lit(C.panelHi, 'metal')
  // Le pupitre : un socle en retrait, un corps, une tablette qui déborde.
  g.add(box(1.0, 0.08, 0.4, lit('#0a0b24', 'metal'), 0, 0.04, 0))
  g.add(box(1.14, 0.3, 0.46, dark, 0, 0.23, 0, 0.012))
  g.add(box(1.2, 0.045, 0.52, hi, 0, 0.4, 0.01, 0.008))
  g.add(box(1.16, 0.012, 0.012, glow(C.line2), 0, 0.4, 0.272))
  for (const s of [-1, 1]) g.add(box(0.02, 0.2, 0.012, glow(C.line2), s * 0.5, 0.23, 0.232))
  // L'écran, sur son pied.
  g.add(box(0.16, 0.08, 0.1, dark, -0.16, 0.46, -0.12))
  const frame = new THREE.Group()
  frame.position.set(-0.16, 0, -0.12)
  steppedFrame(frame, 0.74, 0.416, 0.71, 0, C.card, 0.06)
  g.add(frame)
  const main = animatedScreen(240, 135, 8, (c, t) => {
    if (t % 30 < 10) drawTitleCard(c, t)
    else drawSurface(c, t)
  })
  const view = pixelPlane(main.texture, 0.74, 0.416)
  view.position.set(-0.16, 0.71, -0.086)
  live.add(view)
  // Les jauges, à droite, tournées vers le pilote.
  const side = new THREE.Group()
  side.position.set(0.42, 0.66, -0.06)
  side.rotation.y = -0.5
  side.add(box(0.27, 0.42, 0.04, dark, 0, 0, 0, 0.008))
  g.add(side, cylinder(0.014, 0.014, 0.26, dark, 0.42, 0.52, -0.1, 6))
  const gauges = animatedScreen(48, 80, 2, drawGauges)
  const sideLive = new THREE.Group()
  sideLive.position.copy(side.position)
  sideLive.rotation.copy(side.rotation)
  const gaugeView = pixelPlane(gauges.texture, 0.23, 0.38)
  gaugeView.position.z = 0.022
  sideLive.add(gaugeView)
  live.add(sideLive)
  // La tablette : des touches carrées, comme la barre d'actions du jeu, et le bouton de décollage.
  const keys = [C.line2, C.line2, C.violet, C.line2, C.cyan, C.line2]
  keys.forEach((color, i) => g.add(box(0.07, 0.016, 0.07, lit(color), -0.5 + i * 0.09, 0.43, 0.14, 0.006)))
  g.add(box(0.26, 0.02, 0.1, lit('#7a4418'), 0.24, 0.43, 0.14, 0.008))
  const launch = new THREE.MeshBasicMaterial({ color: C.accentDeep })
  live.add(part(new THREE.BoxGeometry(0.23, 0.02, 0.075), launch, 0.24, 0.442, 0.14))
  // Un carnet de bord et une tasse.
  g.add(box(0.14, 0.012, 0.18, lit('#e9e2d2', 'cloth'), 0.46, 0.428, 0.12), box(0.14, 0.004, 0.02, lit(C.coral), 0.46, 0.436, 0.05))
  g.add(cylinder(0.028, 0.024, 0.06, lit('#d4d8df'), -0.53, 0.452, -0.02, 10), cylinder(0.022, 0.022, 0.004, lit('#3a1c0c'), -0.53, 0.482, -0.02, 10))
  return {
    solid: g,
    live,
    update: (t) => {
      main.tick(t)
      gauges.tick(t)
      launch.color.set(C.accentDeep).multiplyScalar(0.75 + 0.25 * Math.abs(Math.sin(t * 2.2)))
    },
  }
}

/**
 * La maquette de l'atterrissage (adossée, face à +z, 2 de large) : la scène signature du jeu en
 * trois dimensions. Devant le panorama d'un monde riche en métaux, le Mandalay posé sur son train,
 * et le commandant qui vient de descendre la rampe : leurs sprites, un cube par pixel.
 */
const idotDiorama: Builder = () => {
  const g = new THREE.Group(), live = new THREE.Group()
  const dark = lit(C.panel, 'metal'), PX = 0.02, TOP = 0.3
  g.add(box(1.9, 0.06, 0.52, lit('#0a0b24', 'metal'), 0, 0.03, 0.3))
  g.add(box(2.0, TOP - 0.06, 0.6, dark, 0, TOP / 2 + 0.03, 0.3, 0.012))
  g.add(box(1.96, 0.012, 0.012, glow(C.line2), 0, TOP - 0.03, 0.604))
  // Le sol de la maquette : le même régolithe que derrière.
  const soil = drawnTexture(96, 28, (c) => {
    for (let y = 0; y < 28; y++) for (let x = 0; x < 96; x++) {
      const n = fbm(x * 0.12, y * 0.2, 51, 3) + dither(x, y) * 0.22
      rect(c, x, y, 1, 1, n > 0.56 ? '#cfc6b6' : n > 0.4 ? '#a59c98' : '#6f6878')
    }
  })
  soil.magFilter = THREE.NearestFilter
  const ground = part(new THREE.PlaneGeometry(1.94, 0.56), new THREE.MeshLambertMaterial({ map: soil }), 0, TOP + 0.002, 0.3)
  ground.rotation.x = -Math.PI / 2
  g.add(ground)
  // Le panorama, rétroéclairé, dans son cadre.
  const back = new THREE.CanvasTexture(panorama(194, 62, 61))
  back.colorSpace = THREE.SRGBColorSpace
  steppedFrame(g, 1.94, 0.62, TOP + 0.33, 0.02, C.card, 0.03)
  const view = pixelPlane(back, 1.94, 0.62)
  view.position.set(0, TOP + 0.33, 0.038)
  live.add(view)
  // Le Mandalay sur son train.
  const ship = voxels(SHIP, SPRITE, PX, 0.12)
  ship.position.set(-0.22, TOP + 4 * PX, 0.3)
  live.add(ship)
  for (const gx of GEAR) {
    const x = -0.22 + (gx + 1 - 32) * PX
    g.add(box(PX * 2, 6 * PX, 0.03, lit(SPRITE.d, 'metal'), x, TOP + 3 * PX, 0.3), box(PX * 4, PX, 0.06, lit(SPRITE.s, 'metal'), x, TOP + PX / 2, 0.3))
  }
  // Ses feux de navigation.
  const red = new THREE.MeshBasicMaterial({ color: '#ff4a4a' }), white = new THREE.MeshBasicMaterial({ color: '#eaffff' })
  live.add(part(new THREE.BoxGeometry(PX, PX, 0.13), red, -0.22 + (10.5 - 32) * PX, TOP + 4 * PX + 0.5 * PX, 0.3))
  live.add(part(new THREE.BoxGeometry(PX, PX, 0.13), white, -0.22 + (3.5 - 32) * PX, TOP + 4 * PX + 17.5 * PX, 0.3))
  // Le commandant : deux images qui alternent (il respire).
  const frames = [ASTRO.idle0, ASTRO.idle1].map((rows) => {
    const a = voxels(rows, ASTRO_COLORS, PX, 0.06)
    a.position.set(0.74, TOP, 0.4)
    live.add(a)
    return a
  })
  // Sa plaque.
  const plate = drawnTexture(160, 16, (c) => {
    rect(c, 0, 0, 160, 16, '#0f0f2a')
    write(c, tr('PREMIER PAS', 'FIRST FOOTFALL'), 80, 8, 9, C.accent, 0)
  })
  const label = pixelPlane(plate, 0.6, 0.06)
  label.position.set(0, 0.14, 0.607)
  g.add(box(0.64, 0.08, 0.01, lit(C.line2, 'metal'), 0, 0.14, 0.602), label)
  return {
    solid: g,
    live,
    extent: new THREE.Box3(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0.95, 0.6)),
    update: (t) => {
      frames[0].visible = t % 1.8 < 1.1
      frames[1].visible = !frames[0].visible
      red.color.set('#ff4a4a').multiplyScalar(t % 1.4 < 0.3 ? 1 : 0.12)
      white.color.set('#eaffff').multiplyScalar((t + 0.7) % 1.4 < 0.3 ? 1 : 0.12)
    },
  }
}

/**
 * Le commandant, grandeur nature : son sprite du jeu, un cube par pixel, sur un socle. Il est
 * tourné vers la gauche (`label: 'right'` : vers la droite), et sort son scanner de temps en temps.
 */
const idotAstro: Builder = ({ label, random }) => {
  const g = new THREE.Group(), live = new THREE.Group()
  const PX = 0.042, flip = label !== 'right'
  g.add(cylinder(0.3, 0.33, 0.04, lit(C.panel, 'metal'), 0, 0.02, 0, 8))
  const ring = new THREE.MeshBasicMaterial({ color: C.cyan })
  const halo = part(new THREE.TorusGeometry(0.27, 0.012, 4, 8), ring, 0, 0.043, 0)
  halo.rotation.x = Math.PI / 2
  live.add(halo)
  const poses = [ASTRO.idle0, ASTRO.idle1, ASTRO.scan].map((rows) => {
    const a = voxels(rows, ASTRO_COLORS, PX, 0.13, flip)
    a.position.y = 0.04
    live.add(a)
    return a
  })
  // Le voyant du scanner, au bout de son bras.
  const lamp = new THREE.MeshBasicMaterial({ color: '#8ff3ff' })
  const eye = part(new THREE.BoxGeometry(PX, PX, 0.14), lamp, (flip ? -1 : 1) * 4.5 * PX, 0.04 + 8.5 * PX, 0)
  live.add(eye)
  const phase = random() * 20
  return {
    solid: g,
    live,
    extent: new THREE.Box3(new THREE.Vector3(-0.3, 0, -0.2), new THREE.Vector3(0.3, 0.72, 0.2)),
    update: (t) => {
      const scanning = (t + phase) % 14 > 9
      const pose = scanning ? 2 : (t + phase) % 1.8 < 1.1 ? 0 : 1
      poses.forEach((p, i) => { p.visible = i === pose })
      eye.visible = scanning && Math.floor(t * 4) % 2 === 0
      ring.color.set(C.cyan).multiplyScalar(0.55 + 0.3 * Math.sin(t * 1.6 + phase))
    },
  }
}

/** La carte de navigation de la table : des étoiles, deux régions, la route en pointillés jusqu'à la destination. */
function drawNavMap(c: G, t: number) {
  const S = 96
  rect(c, 0, 0, S, S, '#06071e')
  // Une nébuleuse et une zone thargoïde, en trame.
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (Math.hypot(x - 62, y - 30) < 20 + noise(x * 0.2, y * 0.2, 3) * 6 && (x + y) % 2 === 0) rect(c, x, y, 1, 1, '#3a1c5e')
    if (Math.hypot(x - 30, y - 66) < 13 + noise(x * 0.2, y * 0.2, 8) * 5 && (x + y) % 2 === 0) rect(c, x, y, 1, 1, '#123d2a')
  }
  // Les étoiles, de la couleur de leur classe.
  const classes = ['#ff9d6f', '#ffd29a', '#fff4c9', '#f8f7ff', '#aabfff', '#ff9d6f', '#ffd29a']
  for (let i = 0; i < 46; i++) rect(c, 3 + Math.floor(hash(i, 1, 12) * 90), 3 + Math.floor(hash(i, 2, 12) * 90), i % 9 === 0 ? 2 : 1, i % 9 === 0 ? 2 : 1, classes[i % classes.length])
  // La route : chaque saut s'allume à son tour.
  const route: [number, number][] = [[10, 84], [20, 74], [27, 60], [40, 54], [48, 42], [60, 38], [70, 26], [84, 14]]
  const done = Math.floor(t / 2.5) % (route.length + 1)
  for (let k = 1; k < route.length; k++) {
    const [ax, ay] = route[k - 1], [bx, by] = route[k]
    for (let s = 0; s <= 6; s++) {
      if (s % 2) continue
      rect(c, ax + ((bx - ax) * s) / 6, ay + ((by - ay) * s) / 6, 1, 1, k <= done ? C.accent : C.line2)
    }
  }
  route.forEach(([x, y], k) => rect(c, x - 1, y - 1, 3, 3, k === route.length - 1 ? C.good : k <= done ? C.accentHi : C.card))
  const [hx, hy] = route[Math.min(done, route.length - 1)]
  if (Math.floor(t * 3) % 2) {
    rect(c, hx - 3, hy - 3, 7, 1, C.ink)
    rect(c, hx - 3, hy + 3, 7, 1, C.ink)
    rect(c, hx - 3, hy - 3, 1, 7, C.ink)
    rect(c, hx + 3, hy - 3, 1, 7, C.ink)
  }
}

/**
 * La table de navigation, au milieu de la pièce : sur son plateau, la carte et la route jusqu'à la
 * destination ; au-dessus, le système en cours, en hologramme : une étoile, trois planètes en
 * pixels qui lui tournent autour, et un Mandalay grand comme le pouce qui fait le tour du tout.
 */
const idotNavtable: Builder = () => {
  const g = new THREE.Group(), live = new THREE.Group()
  const dark = lit(C.panel, 'metal')
  // Un pied en croix, un plateau à coins rognés.
  g.add(box(0.5, 0.36, 0.5, lit('#0a0b24', 'metal'), 0, 0.18, 0, 0.01))
  g.add(box(1.0, 0.06, 0.86, dark, 0, 0.39, 0), box(0.86, 0.06, 1.0, dark, 0, 0.39, 0))
  const edge = glow(C.line2)
  for (const s of [-1, 1]) g.add(box(0.82, 0.012, 0.012, edge, 0, 0.4, s * 0.502), box(0.012, 0.012, 0.82, edge, s * 0.502, 0.4, 0))
  const map = animatedScreen(96, 96, 3, drawNavMap)
  const top = pixelPlane(map.texture, 0.8, 0.8)
  top.rotation.x = -Math.PI / 2
  top.position.y = 0.423
  live.add(top)
  // L'étoile : un cube de lumière et sa couronne.
  const HOLO = 0.72
  const star = part(new THREE.BoxGeometry(0.11, 0.11, 0.11), new THREE.MeshBasicMaterial({ color: '#fff4c9' }), 0, HOLO, 0)
  const corona = part(new THREE.BoxGeometry(0.15, 0.15, 0.15), new THREE.MeshBasicMaterial({ color: '#ffd36b', transparent: true, opacity: 0.35, depthWrite: false }), 0, HOLO, 0)
  live.add(star, corona)
  // Les planètes : des sphères à facettes, texturées en pixels.
  const orbits: [string, number, number, number, number][] = [['hmc', 0.035, 0.17, 1.1, 0], ['ringed', 0.06, 0.3, 0.55, 2.1], ['icy', 0.04, 0.42, 0.32, 4.4]]
  const planets = orbits.map(([kind, r, dist, speed, phase]) => {
    const body = new THREE.Group()
    body.add(part(new THREE.SphereGeometry(r, 12, 8), new THREE.MeshBasicMaterial({ map: planetMap(kind) })))
    if (PLANETS[kind].ring) {
      const ring = part(new THREE.RingGeometry(r * 1.35, r * 1.9, 12), new THREE.MeshBasicMaterial({ color: PLANETS[kind].ring, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }))
      ring.rotation.x = -Math.PI / 2 + 0.3
      body.add(ring)
    }
    live.add(body)
    // Son orbite, en pointillés sur le plateau de lumière.
    const dots = 20
    const trail = instanced(new THREE.BoxGeometry(0.012, 0.004, 0.012), Array(dots).fill(C.line2))
    for (let k = 0; k < dots; k++) setInstance(trail, k, Math.cos((k / dots) * Math.PI * 2) * dist, HOLO - 0.02, Math.sin((k / dots) * Math.PI * 2) * dist * 0.8)
    trail.instanceMatrix.needsUpdate = true
    live.add(trail)
    return { body, dist, speed, phase }
  })
  const ship = new THREE.Group()
  ship.add(voxels(SHIP_SMALL, SPRITE, 0.006, 0.03))
  live.add(ship)
  return {
    solid: g,
    live,
    extent: new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 0.95, 0.5)),
    update: (t) => {
      map.tick(t)
      star.rotation.y = t * 0.4
      corona.rotation.y = -t * 0.3
      corona.scale.setScalar(1 + Math.sin(t * 2.3) * 0.08)
      for (const p of planets) {
        const a = t * p.speed * 0.5 + p.phase
        p.body.position.set(Math.cos(a) * p.dist, HOLO + Math.sin(t * 0.9 + p.phase) * 0.008, Math.sin(a) * p.dist * 0.8)
        p.body.children[0].rotation.y = t * 0.6
      }
      // Le Mandalay : une grande boucle, le nez dans le sens de la marche.
      const a = -t * 0.35
      ship.position.set(Math.cos(a) * 0.36, HOLO + 0.13 + Math.sin(t * 1.1) * 0.01, Math.sin(a) * 0.3)
      ship.rotation.y = -a + Math.PI / 2
    },
  }
}

/**
 * La soute (adossée, face à +z, 1 de large) : les six matériaux du jeu dans leurs conteneurs, aux
 * couleurs de la barre de soute, le polonium à part, sous cloche. De quoi réparer, fabriquer,
 * améliorer.
 */
const idotCargo: Builder = () => {
  const g = new THREE.Group(), live = new THREE.Group()
  const dark = lit(C.panel, 'metal')
  g.add(box(0.96, 0.05, 0.36, lit('#0a0b24', 'metal'), 0, 0.025, 0.19))
  for (const sx of [-1, 1]) g.add(box(0.03, 0.78, 0.34, dark, sx * 0.47, 0.42, 0.19))
  for (const y of [0.06, 0.42, 0.78]) g.add(box(0.96, 0.03, 0.34, dark, 0, y, 0.19))
  g.add(box(0.94, 0.012, 0.012, glow(C.line2), 0, 0.78, 0.362))
  const lamps = MATERIALS.map(([name, color], i) => {
    const x = -0.3 + (i % 3) * 0.3, y = i < 3 ? 0.075 : 0.435
    g.add(box(0.24, 0.26, 0.26, lit('#1c1f4a', 'metal'), x, y + 0.13, 0.19, 0.02))
    g.add(box(0.2, 0.03, 0.22, lit(color), x, y + 0.275, 0.19, 0.008))
    // L'étiquette : le sigle, de la couleur du matériau.
    const tag = drawnTexture(32, 20, (c) => {
      rect(c, 0, 0, 32, 20, '#0f0f2a')
      rect(c, 0, 0, 2, 20, color)
      write(c, name, 17, 10, 11, color, 0)
    })
    const plate = pixelPlane(tag, 0.16, 0.1)
    plate.position.set(x, y + 0.15, 0.322)
    g.add(plate)
    const lamp = new THREE.MeshBasicMaterial({ color })
    live.add(part(new THREE.BoxGeometry(0.16, 0.012, 0.006), lamp, x, y + 0.06, 0.322))
    return { lamp, color }
  })
  // Sur le dessus : une cellule d'énergie et une injection FSD, les deux synthèses qui sauvent un voyage.
  g.add(cylinder(0.05, 0.05, 0.14, lit('#27306a', 'metal'), -0.26, 0.865, 0.19, 8))
  const cell = new THREE.MeshBasicMaterial({ color: C.cyan })
  live.add(part(new THREE.CylinderGeometry(0.052, 0.052, 0.05, 8), cell, -0.26, 0.865, 0.19))
  g.add(box(0.2, 0.08, 0.12, lit('#7a4418', 'metal'), 0.18, 0.835, 0.19, 0.01))
  const fsd = new THREE.MeshBasicMaterial({ color: C.accent })
  live.add(part(new THREE.BoxGeometry(0.14, 0.02, 0.124), fsd, 0.18, 0.84, 0.19))
  return {
    solid: g,
    live,
    update: (t) => {
      lamps.forEach(({ lamp, color }, i) => lamp.color.set(color).multiplyScalar(0.6 + 0.4 * Math.abs(Math.sin(t * 0.9 + i * 0.8))))
      cell.color.set(C.cyan).multiplyScalar(0.7 + 0.3 * Math.sin(t * 2.4))
      fsd.color.set(C.accent).multiplyScalar(0.7 + 0.3 * Math.sin(t * 1.3 + 1))
    },
  }
}

/**
 * Tapis de sol (2,4 × 1,6) : l'emblème du jeu et sa devise, tissés en gros points.
 */
const idotRug: Builder = () => {
  const texture = drawnTexture(120, 80, (c) => {
    rect(c, 0, 0, 120, 80, '#0d0e30')
    for (let y = 0; y < 80; y++) for (let x = 0; x < 120; x++) if (hash(x, y, 77) > 0.985) rect(c, x, y, 1, 1, '#5a62c8')
    drawCard(c, 2, 2, 116, 76, C.line2, '#0d0e30')
    for (let y = 3; y < 77; y++) for (let x = 3; x < 117; x++) if (hash(x, y, 77) > 0.985) rect(c, x, y, 1, 1, '#5a62c8')
    c.imageSmoothingEnabled = false
    c.drawImage(sprite('mark', MARK, MARK_COLORS), 41, 12, 39, 39)
    write(c, tr('LE VOYAGE NE L\'EST JAMAIS', 'THE JOURNEY NEVER IS'), 60, 63, 7, C.accent, 0)
  })
  texture.magFilter = THREE.NearestFilter
  const rug = mesh(new THREE.PlaneGeometry(2.4, 1.6), new THREE.MeshLambertMaterial({ map: texture, polygonOffset: true, polygonOffsetFactor: -2 }), 0, 0.006, 0)
  rug.rotation.x = -Math.PI / 2
  rug.receiveShadow = true
  const g = new THREE.Group()
  g.add(rug)
  return { solid: g }
}

export const IDOT = {
  'idot-wall': idotWall,
  'idot-terminal': idotTerminal,
  'idot-diorama': idotDiorama,
  'idot-astro': idotAstro,
  'idot-navtable': idotNavtable,
  'idot-cargo': idotCargo,
  'idot-rug': idotRug,
} satisfies Record<string, Builder>
