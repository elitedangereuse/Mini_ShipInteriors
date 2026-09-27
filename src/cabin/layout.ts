import type { Rot } from '../levels'
import { entryOf, knownVariant } from './catalog'
import { normalizeFinish } from './finishes'

/*
 * Aménagement d'une cabine : la liste de ses objets, et les revêtements de ses murs et de son
 * sol. C'est ce qui est enregistré sur le site (outils/mini-shipinteriors-cabin.php) et envoyé
 * par le relais aux CMDR invités. Format compact, identique partout :
 * { v: 1, items: [{ m, x, z, r, v?, y?, s? }], wall?: { style, color }, floor?: { style, color } }.
 */

export interface CabinItem {
  /** Identifiant de l'objet dans le catalogue (cf. catalog.ts). */
  m: string
  /** Position (coordonnées du pont) : centre au sol, ou point du mur pour un objet accroché. */
  x: number
  z: number
  /** Orientation en quarts de tour (0 = face au sud, cf. Rot). */
  r: Rot
  /** Variante : couleur d'un tissu, palette d'un tapis, affiche… */
  v?: string
  /** Hauteur de pose : objet posé sur un meuble (0 ou absent = au sol). */
  y?: number
  /** Graine de l'aléatoire du meuble (feuillage d'une plante…) : même graine, même objet. */
  s?: number
}

/** Revêtement des murs ou du sol : un motif (cf. finishes.ts) et sa couleur (#rrggbb). */
export interface Finish {
  style: string
  color: string
}

/** Aménagement complet ; sans revêtement, murs et sol restent ceux d'origine du vaisseau. */
export interface CabinLayout {
  items: CabinItem[]
  wall?: Finish
  floor?: Finish
}

export const CABIN_FORMAT = 1
/** Nombre d'objets au plus, Holo-Me compris (même limite dans le relais et sur le site). */
export const MAX_ITEMS = 64

/** Rectangle intérieur d'une pièce (face intérieure des murs). */
export interface Rect {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/**
 * Les quartiers du commandant tels qu'on les découvre : le mobilier d'origine, dans la cabine
 * agrandie d'une rangée côté sud.
 */
export const DEFAULT_CABIN: CabinItem[] = [
  { m: 'holo-me', x: 11.6, z: 8.4, r: 0 },
  // Coin nuit, sous les hublots.
  { m: 'suit-locker', x: 7.95, z: 6.4, r: 1 },
  { m: 'nightstand', x: 7.95, z: 7.6, r: 1 },
  { m: 'cozy-bed', x: 8.55, z: 8.7, r: 1, v: 'teal' },
  { m: 'aquarium', x: 8.25, z: 10.12, r: 0 },
  { m: 'bookshelf', x: 9.35, z: 6.2, r: 0 },
  { m: 'plant-tall', x: 10.1, z: 6.12, r: 0, s: 7 },
  // Coin bureau, contre la coursive.
  { m: 'desk', x: 12.7, z: 6.33, r: 0 },
  { m: 'chair', x: 12.7, z: 6.95, r: 2 },
  // Coin salon, au coin du feu.
  { m: 'fireplace', x: 14.55, z: 6.24, r: 0 },
  { m: 'cat-bed', x: 15.0, z: 7.1, r: 0 },
  { m: 'rug', x: 14.2, z: 8.75, r: 0, v: 'warm' },
  { m: 'coffee-table', x: 14.2, z: 8.7, r: 0 },
  { m: 'sofa', x: 14.25, z: 9.97, r: 2, v: 'terracotta' },
  { m: 'floor-lamp', x: 12.95, z: 10.05, r: 0 },
  { m: 'beanbag', x: 15.0, z: 8.0, r: 0, v: 'mustard' },
  // Aux murs : une affiche au-dessus de la table de chevet, l'horloge au-dessus du feu, un tableau.
  { m: 'poster', x: 7.65, z: 7.05, r: 1, v: 'colonia' },
  { m: 'wall-clock', x: 14.0, z: 5.65, r: 0 },
  { m: 'frame', x: 15.35, z: 8.9, r: 3, v: 'ringed' },
]

const round = (v: number) => Math.round(v * 1000) / 1000

/** Les quartiers tels qu'on les découvre : mobilier d'origine, murs et sol du vaisseau. */
export function defaultLayout(): CabinLayout {
  return { items: cloneItems(DEFAULT_CABIN) }
}

export function cloneItems(items: CabinItem[]): CabinItem[] {
  return items.map((i) => ({ ...i }))
}

export function cloneLayout(layout: CabinLayout): CabinLayout {
  const out: CabinLayout = { items: cloneItems(layout.items) }
  if (layout.wall) out.wall = { ...layout.wall }
  if (layout.floor) out.floor = { ...layout.floor }
  return out
}

export function sameItems(a: CabinItem[], b: CabinItem[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function sameLayout(a: CabinLayout, b: CabinLayout): boolean {
  return JSON.stringify(serializeLayout(a)) === JSON.stringify(serializeLayout(b))
}

/** Ce qui part au site et au relais. */
export function serializeLayout(layout: CabinLayout): { v: number; items: CabinItem[]; wall?: Finish; floor?: Finish } {
  const out: { v: number; items: CabinItem[]; wall?: Finish; floor?: Finish } = { v: CABIN_FORMAT, items: layout.items }
  if (layout.wall) out.wall = layout.wall
  if (layout.floor) out.floor = layout.floor
  return out
}

/**
 * Aménagement lisible par ce client, quelle qu'en soit la source (site, relais) : objets
 * inconnus du catalogue écartés, variantes inconnues remplacées, positions dans la cabine,
 * un Holo-Me et un seul, revêtements inconnus oubliés (ceux d'origine à la place). Ne vérifie
 * pas les chevauchements : c'est le rôle du mode aménagement.
 * @param raw { v, items, wall?, floor? } ou directement la liste des objets
 */
export function normalizeLayout(raw: unknown, bounds: Rect): CabinLayout {
  const layout: CabinLayout = { items: normalizeItems(raw, bounds) }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const { wall, floor } = raw as { wall?: unknown; floor?: unknown }
    const w = normalizeFinish('wall', wall), f = normalizeFinish('floor', floor)
    if (w) layout.wall = w
    if (f) layout.floor = f
  }
  return layout
}

function normalizeItems(raw: unknown, bounds: Rect): CabinItem[] {
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as { items?: unknown })?.items) ? (raw as { items: unknown[] }).items : null
  if (!list) return cloneItems(DEFAULT_CABIN)
  const out: CabinItem[] = []
  let holo = false
  for (const it of list) {
    if (out.length >= MAX_ITEMS) break
    if (!it || typeof it !== 'object') continue
    const o = it as Record<string, unknown>
    const entry = typeof o.m === 'string' ? entryOf(o.m) : undefined
    const x = Number(o.x), z = Number(o.z)
    if (!entry || !Number.isFinite(x) || !Number.isFinite(z)) continue
    // Un peu de marge : un objet accroché est posé sur la face du mur.
    if (x < bounds.minX - 0.3 || x > bounds.maxX + 0.3 || z < bounds.minZ - 0.3 || z > bounds.maxZ + 0.3) continue
    if (entry.fixed) {
      if (holo) continue
      holo = true
    }
    const item: CabinItem = { m: entry.id, x: round(x), z: round(z), r: ([0, 1, 2, 3].includes(o.r as number) ? o.r : 0) as Rot }
    if (entry.model === 'site-art') {
      const kind = { 'site-card': 'card', 'site-badge': 'badge', 'adventure-poster': 'adv' }[entry.id]
      if (typeof o.v !== 'string' || !new RegExp(`^${kind}:[a-f0-9]{16}$`).test(o.v)) continue
      item.v = o.v
    } else if (entry.variants?.length) item.v = typeof o.v === 'string' && knownVariant(entry, o.v) ? (o.v as string) : entry.variants[0].id
    const y = Number(o.y)
    if (entry.mount === 'top' && Number.isFinite(y) && y > 0 && y < 2) item.y = round(y)
    const s = Number(o.s)
    if (Number.isInteger(s) && s >= 0 && s < 100000) item.s = s
    out.push(item)
  }
  if (!holo) {
    const home = DEFAULT_CABIN.find((i) => entryOf(i.m)?.fixed)!
    out.unshift({ ...home })
    if (out.length > MAX_ITEMS) out.length = MAX_ITEMS
  }
  return out
}
