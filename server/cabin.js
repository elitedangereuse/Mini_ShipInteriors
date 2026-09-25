// Aménagement des quartiers d'un CMDR, tel que le relais le garde et le rediffuse à ses invités.
//
// Le catalogue des objets vit dans le client (src/cabin/catalog.ts) : le relais ne vérifie que la
// forme, bornée (64 objets, identifiants courts, nombres finis dans le vaisseau), et chaque client
// écarte à la lecture ce qu'il ne connaît pas. Mêmes règles que le site
// (phputils/mini_shipinteriors/cabin.php), qui enregistre l'aménagement.

export const MAX_ITEMS = 64

const MODEL = /^[a-z0-9-]{1,32}$/
const VARIANT = /^[a-z0-9.:-]{1,24}$/

/** Nombre fini compris entre min et max, arrondi au millimètre, ou null. */
function bounded(v, min, max) {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v * 1000) / 1000 : null
}

/**
 * Aménagement propre à rediffuser ({ v: 1, items }), ou null s'il n'a pas la forme attendue.
 * Les objets mal formés sont écartés un par un ; au-delà de 64, le reste est ignoré.
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
  return { v: 1, items: out }
}
