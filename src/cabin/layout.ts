import type { Rot } from '../levels'
import { entryOf, knownVariant } from './catalog'
import { normalizeFinish } from './finishes'
import { DEFAULT_PATTERN, WING_PATTERNS, WING_SLOTS, wingPlan, type PatternId, type WingId } from '../../shared/cabin-wings.js'
import { DOOR_KINDS, partitionEdge, sanitizePartitions, WALL_KINDS, type Partition } from '../../shared/cabin-partitions.js'

export type { Partition } from '../../shared/cabin-partitions.js'

/*
 * Aménagement d'une cabine : la liste de ses objets, et les revêtements de ses murs et de son
 * sol. C'est ce qui est enregistré sur le site (outils/mini-shipinteriors-cabin.php) et envoyé
 * par le relais aux CMDR invités. Format compact, identique partout :
 * { v: 1, items: [{ m, x, z, r, v?, y?, s? }], wall?: { style, color }, floor?: { style, color },
 *   wings?: { left?: { shape, wall?, floor? }, middle?: …, right?: … }, partitions?: [{ x, z, e, k? }] }.
 * `wings` : les pièces des extensions débloquées (cf. shared/cabin-wings.js), leur forme et leurs
 * revêtements ; leurs objets sont dans `items`, comme ceux des quartiers.
 * `partitions` : les cloisons (murs et portes) posées sur les arêtes du quadrillage (cf.
 * shared/cabin-partitions.js et partitions.ts) ; elles ne comptent pas parmi les objets.
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

/** Pièce d'une extension : sa forme de plan, et ses revêtements (absents : ceux d'origine). */
export interface WingLayout {
  shape: PatternId
  wall?: Finish
  floor?: Finish
}

export type CabinWings = Partial<Record<WingId, WingLayout>>

/** Aménagement complet ; sans revêtement, murs et sol restent ceux d'origine du vaisseau. */
export interface CabinLayout {
  items: CabinItem[]
  wall?: Finish
  floor?: Finish
  wings?: CabinWings
  /** Cloisons : murs et portes posés par le CMDR. */
  partitions?: Partition[]
}

export const CABIN_FORMAT = 1
/** Objets au plus dans les quartiers, Holo-Me compris, et dans chaque pièce d'extension. */
export const ROOM_ITEMS = 64
export const WING_ITEMS = 32
/** Objets au plus en tout : les quartiers et trois extensions (même limite dans le relais et sur le site). */
export const MAX_ITEMS = ROOM_ITEMS + WING_ITEMS * WING_SLOTS.length

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
  if (layout.wings) out.wings = cloneWings(layout.wings)
  if (layout.partitions?.length) out.partitions = layout.partitions.map((p) => ({ ...p }))
  return out
}

/** Cloisons : même ensemble, même clé (l'ordre ne compte pas). */
export const partitionsKey = (partitions: Partition[] | undefined) =>
  (partitions ?? []).map((p) => `${p.x},${p.z},${p.e},${p.k ?? ''}`).sort().join('|')

export function cloneWings(wings: CabinWings): CabinWings {
  const out: CabinWings = {}
  for (const [id, w] of Object.entries(wings) as [WingId, WingLayout][]) {
    out[id] = { shape: w.shape, ...(w.wall ? { wall: { ...w.wall } } : {}), ...(w.floor ? { floor: { ...w.floor } } : {}) }
  }
  return out
}

/** Formes des pièces : même clé, mêmes pièces sur le plan (les revêtements n'y changent rien). */
export const wingShapes = (wings: CabinWings | undefined) => WING_SLOTS.map((s) => wings?.[s.id]?.shape ?? '').join('|')

export function sameItems(a: CabinItem[], b: CabinItem[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function sameLayout(a: CabinLayout, b: CabinLayout): boolean {
  return JSON.stringify(serializeLayout(a)) === JSON.stringify(serializeLayout(b))
}

/** Ce qui part au site et au relais. */
export function serializeLayout(layout: CabinLayout): { v: number; items: CabinItem[]; wall?: Finish; floor?: Finish; wings?: CabinWings; partitions?: Partition[] } {
  const out: { v: number; items: CabinItem[]; wall?: Finish; floor?: Finish; wings?: CabinWings; partitions?: Partition[] } = { v: CABIN_FORMAT, items: layout.items }
  if (layout.wall) out.wall = layout.wall
  if (layout.floor) out.floor = layout.floor
  if (layout.wings && Object.keys(layout.wings).length) out.wings = layout.wings
  if (layout.partitions?.length) out.partitions = layout.partitions
  return out
}

/**
 * Aménagement lisible par ce client, quelle qu'en soit la source (site, relais) : objets
 * inconnus du catalogue écartés, variantes inconnues remplacées, positions dans la cabine (ou
 * dans une de ses pièces d'extension), un Holo-Me et un seul, revêtements inconnus oubliés
 * (ceux d'origine à la place), formes inconnues remplacées par la forme par défaut. Ne vérifie
 * pas les chevauchements : c'est le rôle du mode aménagement.
 * @param raw { v, items, wall?, floor?, wings? } ou directement la liste des objets
 * @param bounds rectangle intérieur des quartiers (hors extensions)
 */
export function normalizeLayout(raw: unknown, bounds: Rect): CabinLayout {
  const wings = raw && typeof raw === 'object' && !Array.isArray(raw) ? normalizeWings((raw as { wings?: unknown }).wings) : undefined
  const layout: CabinLayout = { items: normalizeItems(raw, bounds, wings) }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const { wall, floor } = raw as { wall?: unknown; floor?: unknown }
    const w = normalizeFinish('wall', wall), f = normalizeFinish('floor', floor)
    if (w) layout.wall = w
    if (f) layout.floor = f
  }
  if (wings) layout.wings = wings
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const partitions = normalizePartitions((raw as { partitions?: unknown }).partitions, bounds, wings)
    if (partitions.length) layout.partitions = partitions
  }
  return layout
}

/**
 * Cloisons lisibles : bien formées (cf. sanitizePartitions), leurs deux tuiles dans la cabine,
 * un modèle connu (une porte inconnue devient coulissante, un pan inconnu un mur plein). La
 * cabine affichée ignore en plus celles qui ne tombent pas entre deux tuiles d'une même pièce.
 */
export function normalizePartitions(raw: unknown, bounds: Rect, wings?: CabinWings): Partition[] {
  const annex = wingTiles(wings)
  const inside = (x: number, z: number) =>
    (x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ) || annex.has(`${x},${z}`)
  return (sanitizePartitions(raw) ?? []).flatMap((p): Partition[] => {
    const { x, z, nx, nz } = partitionEdge(p)
    if (!inside(x, z) || !inside(nx, nz)) return []
    if (p.k && !WALL_KINDS.includes(p.k) && !DOOR_KINDS.includes(p.k)) return [{ x: p.x, z: p.z, e: p.e, k: 'sliding' }]
    return [p]
  })
}

/** Pièces d'extension : espaces connus, formes connues (sinon celle par défaut), revêtements lisibles. */
export function normalizeWings(raw: unknown): CabinWings | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const out: CabinWings = {}
  for (const slot of WING_SLOTS) {
    const w = (raw as Record<string, unknown>)[slot.id]
    if (!w || typeof w !== 'object') continue
    const { shape, wall, floor } = w as { shape?: unknown; wall?: unknown; floor?: unknown }
    const wing: WingLayout = { shape: typeof shape === 'string' && shape in WING_PATTERNS ? (shape as PatternId) : DEFAULT_PATTERN }
    const wf = normalizeFinish('wall', wall), ff = normalizeFinish('floor', floor)
    if (wf) wing.wall = wf
    if (ff) wing.floor = ff
    out[slot.id] = wing
  }
  return Object.keys(out).length ? out : undefined
}

/** Tuiles des pièces d'extension (« x,z »), pour savoir si un objet y est. */
export function wingTiles(wings: CabinWings | undefined): Set<string> {
  const out = new Set<string>()
  for (const slot of WING_SLOTS) {
    const w = wings?.[slot.id]
    if (w) for (const t of wingPlan(slot, w.shape).tiles) out.add(`${t.x},${t.z}`)
  }
  return out
}

function normalizeItems(raw: unknown, bounds: Rect, wings?: CabinWings): CabinItem[] {
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as { items?: unknown })?.items) ? (raw as { items: unknown[] }).items : null
  if (!list) return cloneItems(DEFAULT_CABIN)
  const out: CabinItem[] = []
  let holo = false
  const annex = wingTiles(wings)
  // Un peu de marge : un objet accroché est posé sur la face du mur.
  const inside = (x: number, z: number) =>
    (x >= bounds.minX - 0.3 && x <= bounds.maxX + 0.3 && z >= bounds.minZ - 0.3 && z <= bounds.maxZ + 0.3) ||
    [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]].some(([dx, dz]) => annex.has(`${Math.round(x + dx)},${Math.round(z + dz)}`))
  for (const it of list) {
    if (out.length >= MAX_ITEMS) break
    if (!it || typeof it !== 'object') continue
    const o = it as Record<string, unknown>
    const entry = typeof o.m === 'string' ? entryOf(o.m) : undefined
    const x = Number(o.x), z = Number(o.z)
    if (!entry || !Number.isFinite(x) || !Number.isFinite(z)) continue
    if (!inside(x, z)) continue
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
