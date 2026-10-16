import * as THREE from 'three'

/*
 * Atlas des images fixes d'un pont (cf. StaticMerge) : enseignes, affiches, décalcomanies, plaques.
 * Fusionnées avec le reste, elles coûtaient encore un appel de dessin chacune, une par texture.
 * Rangées dans quelques grandes pages, celles qui se dessinent de la même façon (même matériau, au
 * dessin près) ne font plus qu'un maillage par page.
 *
 * Seules y entrent les textures déclarées fixes (cf. stillTexture) : une texture qu'on redessine
 * (écran animé, compteur) garde son maillage. Une texture fixe peut l'être une fois de plus, quand
 * l'image qu'elle attendait arrive (un logo chargé après coup) : `syncAtlases` recopie alors sa
 * nouvelle image dans sa page. Au-delà, elle s'anime : on le signale en développement.
 */

/** Côté des pages (px) : de quoi ranger les plus grandes affiches (1024). */
const PAGE = 2048
/**
 * Marge autour de chaque image, remplie de son bord (comme une texture « clamp ») et alignée sur
 * elle : les trois premiers niveaux de mipmap ne mélangent pas deux images voisines.
 */
const PAD = 8

/** Déclare une texture fixe : elle ne sera plus redessinée, elle peut rejoindre un atlas. */
export function stillTexture<T extends THREE.Texture>(t: T): T {
  t.userData.still = true
  // En développement, d'où elle vient : pour la retrouver si elle est redessinée (cf. syncAtlases).
  if (import.meta.env.DEV) t.userData.stillFrom = new Error().stack?.split('\n').slice(2, 5).join(' ← ')
  return t
}

/** Une texture qu'on peut ranger : déclarée fixe, son image prête, sans transformation d'UV. */
export function atlasable(t: THREE.Texture | null | undefined): t is THREE.Texture {
  if (!t?.userData.still || (t as THREE.DataTexture).isDataTexture || (t as THREE.VideoTexture).isVideoTexture) return false
  const img = t.image as { width?: number; height?: number } | null
  if (!img?.width || !img.height || img.width + 2 * PAD > PAGE || img.height + 2 * PAD > PAGE) return false
  return t.offset.x === 0 && t.offset.y === 0 && t.repeat.x === 1 && t.repeat.y === 1 && t.rotation === 0
}

/** Ce qui, dans une texture, doit être commun à toute sa page (l'anisotropie : la page prend la plus forte). */
export function samplingKey(t: THREE.Texture): string {
  return [t.colorSpace, t.magFilter, t.minFilter, t.generateMipmaps, t.premultiplyAlpha].join('|')
}

/** Place d'une image dans sa page (px, sans la marge). */
export interface AtlasRect {
  page: THREE.CanvasTexture
  x: number
  y: number
  w: number
  h: number
}

interface Watched extends AtlasRect {
  source: THREE.Texture
  version: number
  /** Fois où elle a été redessinée depuis son rangement. */
  redrawn: number
  g: CanvasRenderingContext2D
}
const watched = new Set<Watched>()

/** L'image d'une texture rangeable (canvas, image, bitmap : cf. atlasable). */
const img = (t: THREE.Texture) => t.image as HTMLCanvasElement
const align = (v: number) => Math.ceil(v / PAD) * PAD
const pow2 = (v: number) => 2 ** Math.ceil(Math.log2(Math.max(1, v)))

/** Recopie une image et sa marge à sa place. */
function blit(g: CanvasRenderingContext2D, img: CanvasImageSource, x: number, y: number, w: number, h: number) {
  g.clearRect(x - PAD, y - PAD, w + 2 * PAD, h + 2 * PAD)
  g.drawImage(img, x, y, w, h)
  // Bords et coins étirés dans la marge.
  g.drawImage(img, 0, 0, 1, h, x - PAD, y, PAD, h)
  g.drawImage(img, w - 1, 0, 1, h, x + w, y, PAD, h)
  g.drawImage(img, 0, 0, w, 1, x, y - PAD, w, PAD)
  g.drawImage(img, 0, h - 1, w, 1, x, y + h, w, PAD)
  g.drawImage(img, 0, 0, 1, 1, x - PAD, y - PAD, PAD, PAD)
  g.drawImage(img, w - 1, 0, 1, 1, x + w, y - PAD, PAD, PAD)
  g.drawImage(img, 0, h - 1, 1, 1, x - PAD, y + h, PAD, PAD)
  g.drawImage(img, w - 1, h - 1, 1, 1, x + w, y + h, PAD, PAD)
}

/**
 * Range des textures (de même échantillonnage, cf. samplingKey) en pages, par étagères, les plus
 * hautes d'abord. Renvoie la place de chacune.
 */
export function packTextures(textures: THREE.Texture[]): Map<THREE.Texture, AtlasRect> {
  const sorted = [...textures].sort((a, b) => img(b).height - img(a).height || img(b).width - img(a).width)
  const pages: { items: { t: THREE.Texture; x: number; y: number }[]; width: number; height: number }[] = []
  let page: (typeof pages)[number] | null = null
  let shelfX = 0, shelfY = 0, shelfH = 0
  for (const t of sorted) {
    const w = align(img(t).width + 2 * PAD), h = align(img(t).height + 2 * PAD)
    if (page && shelfX + w > PAGE) {
      shelfY += shelfH
      shelfX = shelfH = 0
    }
    if (!page || shelfY + h > PAGE) {
      pages.push((page = { items: [], width: 0, height: 0 }))
      shelfX = shelfY = shelfH = 0
    }
    page.items.push({ t, x: shelfX + PAD, y: shelfY + PAD })
    shelfX += w
    shelfH = Math.max(shelfH, h)
    page.width = Math.max(page.width, shelfX)
    page.height = Math.max(page.height, shelfY + shelfH)
  }
  const out = new Map<THREE.Texture, AtlasRect>()
  for (const p of pages) {
    const c = document.createElement('canvas')
    c.width = pow2(p.width)
    c.height = pow2(p.height)
    const g = c.getContext('2d')!
    const first = p.items[0].t
    const texture = new THREE.CanvasTexture(c)
    texture.colorSpace = first.colorSpace
    texture.magFilter = first.magFilter
    texture.minFilter = first.minFilter
    texture.anisotropy = Math.max(...p.items.map(({ t }) => t.anisotropy))
    texture.generateMipmaps = first.generateMipmaps
    texture.premultiplyAlpha = first.premultiplyAlpha
    texture.name = 'atlas'
    for (const { t, x, y } of p.items) {
      const rect: Watched = { page: texture, x, y, w: img(t).width, h: img(t).height, source: t, version: t.version, redrawn: 0, g }
      blit(g, img(t), x, y, rect.w, rect.h)
      out.set(t, rect)
      watched.add(rect)
    }
    texture.addEventListener('dispose', () => {
      for (const w of watched) if (w.page === texture) watched.delete(w)
    })
  }
  return out
}

/** Les UV d'une géométrie restent-ils dans l'image (sans répétition) ? */
export function uvInside(g: THREE.BufferGeometry): boolean {
  const uv = g.getAttribute('uv')
  if (!uv) return false
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i)
    if (u < -1e-4 || u > 1 + 1e-4 || v < -1e-4 || v > 1 + 1e-4) return false
  }
  return true
}

/** Reporte les UV d'une géométrie (sur la texture `source`) à sa place dans la page. */
export function remapUv(g: THREE.BufferGeometry, source: THREE.Texture, rect: AtlasRect) {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute
  const W = img(rect.page).width, H = img(rect.page).height
  for (let i = 0; i < uv.count; i++) {
    const u = THREE.MathUtils.clamp(uv.getX(i), 0, 1), v = THREE.MathUtils.clamp(uv.getY(i), 0, 1)
    // Ligne de l'image comptée du haut : une texture retournée (flipY, le cas des canvas) a son v = 0 en bas.
    const row = source.flipY ? (1 - v) * rect.h : v * rect.h
    uv.setXY(i, (rect.x + u * rect.w) / W, 1 - (rect.y + row) / H)
  }
  uv.needsUpdate = true
}

/**
 * Une texture rangée a été redessinée (à chaque image, avant le rendu) : sa nouvelle image rejoint
 * sa page. Redessinée plus de deux fois, elle s'anime et n'aurait pas dû être déclarée fixe (chaque
 * fois, c'est toute la page qui repart au GPU) : on le signale en développement.
 */
export function syncAtlases() {
  for (const w of watched) {
    if (w.source.version === w.version) continue
    w.version = w.source.version
    blit(w.g, img(w.source), w.x, w.y, w.w, w.h)
    w.page.needsUpdate = true
    if (import.meta.env.DEV && ++w.redrawn === 3) console.warn(`Atlas : texture animée, à ne pas déclarer fixe (${w.w} × ${w.h}) : ${w.source.userData.stillFrom}`)
  }
}
