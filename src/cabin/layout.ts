import type { Rot } from '../levels'
import { entryOf } from './catalog'

/*
 * Aménagement d'une cabine : la liste de ses objets. C'est ce qui est enregistré sur le site
 * (outils/mini-shipinteriors-cabin.php) et envoyé par le relais aux CMDR invités.
 * Format compact, identique partout : { v: 1, items: [{ m, x, z, r, v?, y?, s? }] }.
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
]

const round = (v: number) => Math.round(v * 1000) / 1000

export function cloneLayout(items: CabinItem[]): CabinItem[] {
  return items.map((i) => ({ ...i }))
}

export function sameLayout(a: CabinItem[], b: CabinItem[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Ce qui part au site et au relais. */
export function serializeLayout(items: CabinItem[]): { v: number; items: CabinItem[] } {
  return { v: CABIN_FORMAT, items }
}

/**
 * Aménagement lisible par ce client, quelle qu'en soit la source (site, relais) : objets
 * inconnus du catalogue écartés, variantes inconnues remplacées, positions dans la cabine,
 * un Holo-Me et un seul. Ne vérifie pas les chevauchements : c'est le rôle du mode aménagement.
 * @param raw { v, items } ou directement la liste des objets
 */
export function normalizeLayout(raw: unknown, bounds: Rect): CabinItem[] {
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as { items?: unknown })?.items) ? (raw as { items: unknown[] }).items : null
  if (!list) return cloneLayout(DEFAULT_CABIN)
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
    if (entry.variants) item.v = entry.variants.some((v) => v.id === o.v) ? (o.v as string) : entry.variants[0].id
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
