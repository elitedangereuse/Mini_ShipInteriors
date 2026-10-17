import * as THREE from 'three'

export interface HSL {
  h: number
  s: number
  l: number
}

/**
 * Textures repeintes, par contenu de l'image source (son empreinte) et par repeinte : chaque modèle
 * GLB a sa copie de la palette (les personnages en ont autant que de modèles), une même palette
 * n'est repeinte qu'une fois, et la texture obtenue est partagée.
 */
const cache = new Map<string, THREE.Texture>()
/** Empreinte des pixels de chaque image déjà lue (les images sources ne changent pas). */
const prints = new WeakMap<object, string>()

/** Une couleur de la palette : ses valeurs d'entrée (linéaire, HSL sRGB) et la dernière sortie calculée. */
class Swatch {
  /** Octets sRGB de la dernière sortie, empaquetés ; -1 : pas encore calculée. */
  out = -1
  /** La couleur (linéaire) qui a donné `out`. */
  or = NaN
  og = NaN
  ob = NaN
  constructor(readonly r: number, readonly g: number, readonly b: number, readonly h: number, readonly s: number, readonly l: number) {}
}

type Img = CanvasImageSource & { width: number; height: number }

function pixels(img: Img) {
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const g = canvas.getContext('2d', { willReadFrequently: true })!
  g.drawImage(img, 0, 0)
  return { canvas, g, data: g.getImageData(0, 0, canvas.width, canvas.height) }
}

/** Empreinte (64 bits : deux hachages de 32) des pixels d'une image, avec sa taille. */
function fingerprint(data: ImageData): string {
  const words = new Uint32Array(data.data.buffer, data.data.byteOffset, data.data.length >> 2)
  let a = 0x811c9dc5, b = 0x9747b28c
  for (let i = 0; i < words.length; i++) {
    const v = words[i]
    a = Math.imul(a ^ v, 0x01000193)
    b = Math.imul(b ^ v, 0x5bd1e995)
    b ^= b >>> 15
  }
  return `${data.width}x${data.height}:${(a >>> 0).toString(36)}.${(b >>> 0).toString(36)}`
}

/**
 * Copie d'une texture dont chaque pixel passe par `recolor` (calculée une fois, sur CPU, puis mise en cache).
 * `recolor` reçoit la couleur (et sa version HSL, espace sRGB) et la position du pixel ; il modifie `c`.
 * Un `recolor` qui ne déclare pas la position (moins de 3 paramètres) ne dépend que de la couleur :
 * il n'est appelé qu'une fois par couleur distincte de la palette (quelques centaines).
 */
export function recolored(src: THREE.Texture, key: string, recolor: (hsl: HSL, c: THREE.Color, x: number, y: number) => void): THREE.Texture {
  const img = src.image as Img
  let read = prints.has(img) ? null : pixels(img)
  const print = prints.get(img) ?? fingerprint(read!.data)
  prints.set(img, print)
  const cacheKey = `${print}:${src.flipY}:${src.colorSpace}:${src.magFilter}:${src.minFilter}:${src.generateMipmaps}:${key}`
  const hit = cache.get(cacheKey)
  if (hit) return hit
  read ??= pixels(img)
  const { canvas, g, data } = read
  const c = new THREE.Color()
  const hsl = { h: 0, s: 0, l: 0 }
  const rgb = { r: 0, g: 0, b: 0 }
  const d = data.data
  // Conversions (sRGB → linéaire → HSL) une fois par couleur ; la sortie aussi quand elle ne dépend
  // que de la couleur, sinon tant que `recolor` redonne la même (même résultat, au bit près).
  const pure = recolor.length < 3
  const swatches = new Map<number, Swatch>()
  let last = -1
  let sw: Swatch | undefined
  for (let i = 0; i < d.length; i += 4) {
    const packed = d[i] | (d[i + 1] << 8) | (d[i + 2] << 16)
    if (packed !== last) {
      last = packed
      sw = swatches.get(packed)
      if (!sw) {
        c.setRGB(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, THREE.SRGBColorSpace)
        c.getHSL(hsl, THREE.SRGBColorSpace)
        swatches.set(packed, (sw = new Swatch(c.r, c.g, c.b, hsl.h, hsl.s, hsl.l)))
      }
    }
    const s = sw!
    if (!pure || s.out < 0) {
      c.r = s.r
      c.g = s.g
      c.b = s.b
      hsl.h = s.h
      hsl.s = s.s
      hsl.l = s.l
      const p = i / 4
      recolor(hsl, c, p % canvas.width, Math.floor(p / canvas.width))
      if (s.out < 0 || c.r !== s.or || c.g !== s.og || c.b !== s.ob) {
        c.getRGB(rgb, THREE.SRGBColorSpace)
        d[i] = rgb.r * 255
        d[i + 1] = rgb.g * 255
        d[i + 2] = rgb.b * 255
        s.out = d[i] | (d[i + 1] << 8) | (d[i + 2] << 16)
        s.or = c.r
        s.og = c.g
        s.ob = c.b
        continue
      }
    }
    d[i] = s.out & 255
    d[i + 1] = (s.out >> 8) & 255
    d[i + 2] = s.out >> 16
  }
  g.putImageData(data, 0, 0)
  const t = new THREE.CanvasTexture(canvas)
  t.flipY = src.flipY
  t.colorSpace = src.colorSpace
  t.magFilter = src.magFilter
  t.minFilter = src.minFilter
  t.generateMipmaps = src.generateMipmaps
  cache.set(cacheKey, t)
  return t
}
