import manifest from './assets/fighters/manifest'
import { fightAnimation, type FightClip } from '../../shared/fight-animation.js'
import { fighterProfile, type FighterId } from '../../shared/fight-roster.js'
import type { Fighter } from '../../shared/fight.js'

const urls: Record<string, string> = {
  'character-1': new URL('./assets/fighters/character-1.png', import.meta.url).href,
  'character-2': new URL('./assets/fighters/character-2.png', import.meta.url).href,
  'character-3': new URL('./assets/fighters/character-3.png', import.meta.url).href,
  'character-4': new URL('./assets/fighters/character-4.png', import.meta.url).href,
  'character-5': new URL('./assets/fighters/character-5.png', import.meta.url).href,
  'character-6': new URL('./assets/fighters/character-6.png', import.meta.url).href,
}
interface Frame { x: number; y: number; w: number; h: number; ox: number; oy: number }
interface Sheet {
  scale: number
  contacts: Partial<Record<FightClip, number>>
  animations: Partial<Record<FightClip, Frame[]>> & Record<'idle' | 'run' | 'jump' | 'fall' | 'light' | 'heavy' | 'hit' | 'death', Frame[]>
}
const sheets = manifest as Record<string, Sheet>
const images = new Map<string, HTMLImageElement>()
let pending: Promise<void> | null = null
let failed = false
export const fightSpritesReady = () => images.size === Object.keys(urls).length
export function loadFightSprites(retry = false): Promise<void> {
  if (fightSpritesReady()) return Promise.resolve()
  if (retry && failed) { pending = null; failed = false }
  return pending ??= Promise.all(Object.entries(urls).map(([asset, url]) => new Promise<void>((resolve, reject) => {
    if (images.has(asset)) { resolve(); return }
    const img = new Image()
    img.onload = () => { images.set(asset, img); resolve() }
    img.onerror = () => reject(new Error(`Sprite non disponible : ${asset}`))
    img.src = url
  }))).then(() => {}).catch(error => { failed = true; throw error })
}

/** Atlas des six combattants CC0 : mêmes pivots pour toutes les frames, aucune interpolation. */
export function drawFighterSprite(g: CanvasRenderingContext2D, f: Fighter, time: number, floor: number, koTime = 0) {
  if (!pending && !fightSpritesReady()) void loadFightSprites().catch(() => {})
  const asset = fighterProfile(f.character).asset, image = images.get(asset)
  if (!image) return
  const sheet = sheets[asset]
  const counts = Object.fromEntries(Object.entries(sheet.animations).map(([key, frames]) => [key, frames.length])) as Parameters<typeof fightAnimation>[1]
  const { clip, frame } = fightAnimation(f, counts, time, koTime, sheet.contacts)
  const cell = sheet.animations[clip]![frame]
  g.save()
  g.imageSmoothingEnabled = false
  g.translate(Math.round(f.x), Math.round(floor - f.y))
  g.scale(f.face * sheet.scale, sheet.scale * (f.crouch && !counts.crouch && !f.y ? 0.72 : 1))
  g.drawImage(image, cell.x, cell.y, cell.w, cell.h, Math.round(cell.ox), Math.round(cell.oy), cell.w, cell.h)
  g.restore()
}

export function fighterSpriteSource(id: FighterId) { return sheets[fighterProfile(id).asset] }
