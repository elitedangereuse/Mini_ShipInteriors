import * as THREE from 'three'

export interface HSL {
  h: number
  s: number
  l: number
}

const cache = new Map<string, THREE.Texture>()

/**
 * Copie d'une texture dont chaque pixel passe par `recolor` (calculée une fois, sur CPU, puis mise en cache).
 * `recolor` reçoit la couleur (et sa version HSL, espace sRGB) et la position du pixel ; il modifie `c`.
 */
export function recolored(src: THREE.Texture, key: string, recolor: (hsl: HSL, c: THREE.Color, x: number, y: number) => void): THREE.Texture {
  const cacheKey = `${src.uuid}:${key}`
  const hit = cache.get(cacheKey)
  if (hit) return hit
  const img = src.image as CanvasImageSource & { width: number; height: number }
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const g = canvas.getContext('2d', { willReadFrequently: true })!
  g.drawImage(img, 0, 0)
  const data = g.getImageData(0, 0, canvas.width, canvas.height)
  const c = new THREE.Color()
  const hsl = { h: 0, s: 0, l: 0 }
  const rgb = { r: 0, g: 0, b: 0 }
  const d = data.data
  for (let i = 0; i < d.length; i += 4) {
    c.setRGB(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, THREE.SRGBColorSpace)
    c.getHSL(hsl, THREE.SRGBColorSpace)
    const p = i / 4
    recolor(hsl, c, p % canvas.width, Math.floor(p / canvas.width))
    c.getRGB(rgb, THREE.SRGBColorSpace)
    d[i] = rgb.r * 255
    d[i + 1] = rgb.g * 255
    d[i + 2] = rgb.b * 255
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
