// Aménagement des quartiers d'un CMDR, tel que le relais le garde et le rediffuse à ses invités.
//
// Le catalogue des objets et des revêtements vit dans le client (src/cabin/catalog.ts,
// src/cabin/finishes.ts) : le relais ne vérifie que la forme, bornée (160 objets, identifiants
// courts, nombres finis dans le vaisseau, couleurs #rrggbb, pièces d'extension connues, 48
// cloisons sur des arêtes du quadrillage), et chaque client écarte à la lecture ce qu'il ne
// connaît pas. Mêmes règles que le site
// (phputils/mini_shipinteriors/cabin.php), qui enregistre l'aménagement et ne garde que les pièces
// des espaces débloqués.

import { sanitizePartitions } from '../shared/cabin-partitions.js'
import { WING_PATTERNS, WING_SLOTS } from '../shared/cabin-wings.js'

/** Les quartiers (64 objets) et trois pièces d'extension (32 chacune). */
export const MAX_ITEMS = 64 + 32 * WING_SLOTS.length

const MODEL = /^[a-z0-9-]{1,32}$/
const VARIANT = /^[a-z0-9.:-]{1,24}$/
const STYLE = /^[a-z0-9-]{1,24}$/
const COLOR = /^#[0-9a-f]{6}$/

/** Nombre fini compris entre min et max, arrondi au millimètre, ou null. */
function bounded(v, min, max) {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v * 1000) / 1000 : null
}

/** Revêtement des murs ou du sol ({ style, color }), ou null. */
function finish(raw) {
  if (!raw || typeof raw !== 'object') return null
  const { style, color } = raw
  return typeof style === 'string' && STYLE.test(style) && typeof color === 'string' && COLOR.test(color) ? { style, color } : null
}

/**
 * Aménagement propre à rediffuser ({ v: 1, items, wall?, floor?, wings?, partitions? }), ou null s'il n'a pas la
 * forme attendue. Les objets mal formés sont écartés un par un ; au-delà de 64, le reste est
 * ignoré ; un revêtement mal formé est oublié (le client pose alors celui d'origine).
 */
export function sanitizeLayout(raw) {
  const items = raw && typeof raw === 'object' && Array.isArray(raw.items) ? raw.items : null
  if (!items) return null
  const out = []
  for (const it of items) {
    if (out.length >= MAX_ITEMS) break
    if (!it || typeof it !== 'object' || typeof it.m !== 'string' || !MODEL.test(it.m)) continue
    // Coordonnées du pont : les mêmes bornes que les positions des joueurs.
    const x = bounded(it.x, -5, 40), z = bounded(it.z, -5, 20)
    if (x === null || z === null) continue
    const item = { m: it.m, x, z, r: [0, 1, 2, 3].includes(it.r) ? it.r : 0 }
    if (typeof it.v === 'string' && VARIANT.test(it.v)) item.v = it.v
    const y = bounded(it.y, 0, 2)
    if (y) item.y = y
    if (Number.isInteger(it.s) && it.s >= 0 && it.s < 100000) item.s = it.s
    out.push(item)
  }
  const layout = { v: 1, items: out }
  const wall = finish(raw.wall), floor = finish(raw.floor)
  if (wall) layout.wall = wall
  if (floor) layout.floor = floor
  const wings = sanitizeWings(raw.wings)
  if (wings) layout.wings = wings
  const partitions = sanitizePartitions(raw.partitions)
  if (partitions) layout.partitions = partitions
  return layout
}

/** Pièces d'extension ({ left?, middle?, right? } : forme connue, revêtements), ou null. */
export function sanitizeWings(raw) {
  if (!raw || typeof raw !== 'object') return null
  const out = {}
  for (const slot of WING_SLOTS) {
    const w = raw[slot.id]
    if (!w || typeof w !== 'object' || typeof w.shape !== 'string' || !Object.hasOwn(WING_PATTERNS, w.shape)) continue
    const wing = { shape: w.shape }
    const wall = finish(w.wall), floor = finish(w.floor)
    if (wall) wing.wall = wall
    if (floor) wing.floor = floor
    out[slot.id] = wing
  }
  return Object.keys(out).length ? out : null
}
