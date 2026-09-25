import * as THREE from 'three'
import { DIRS } from '../map'
import { Pathfinder } from '../pathfinding'
import { entryOf, isSolid, type CatalogEntry } from './catalog'
import type { CabinItem } from './layout'
import type { CabinView } from './view'

/*
 * Règles de pose du mode aménagement : un objet doit tenir dans la cabine (ou sur un pan de
 * mur libre), ne pas en traverser un autre, laisser la porte dégagée, et le Holo-Me doit rester
 * accessible depuis la porte. Quelques tolérances rendent l'aménagement naturel : un tapis
 * passe sous les meubles, un objet se pose sur le dessus d'un meuble, une affiche peut dépasser
 * un peu derrière le dossier d'un canapé.
 */

const EPS = 0.004
/** Une affiche peut être masquée à 30 % par ce qui est posé devant elle. */
const WALL_COVER = 0.3
/** Écart de hauteur toléré entre un objet posé et le dessus de son meuble. */
const ON_TOP = 0.02

/** Dessus d'un meuble où l'on peut poser des objets (coordonnées du pont). */
export interface Surface {
  index: number
  y: number
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export function surfacesOf(view: CabinView, items: CabinItem[], skip?: Set<number>): Surface[] {
  const out: Surface[] = []
  const box = new THREE.Box3()
  items.forEach((item, index) => {
    const entry = entryOf(item.m)
    if (!entry?.surface || skip?.has(index) || !view.boxOf(item, box)) return
    const m = 0.03
    out.push({ index, y: (item.y ?? 0) + entry.surface, minX: box.min.x + m, maxX: box.max.x - m, minZ: box.min.z + m, maxZ: box.max.z - m })
  })
  return out
}

/** Meuble sur lequel est posé l'objet `i`, ou -1 (au sol, ou objet qui ne se pose pas). */
export function baseOf(view: CabinView, items: CabinItem[], i: number, surfaces = surfacesOf(view, items)): number {
  const item = items[i]
  if (entryOf(item.m)?.mount !== 'top' || !(item.y ?? 0)) return -1
  const s = surfaces.find((s) => s.index !== i && Math.abs(s.y - (item.y ?? 0)) < ON_TOP && item.x > s.minX && item.x < s.maxX && item.z > s.minZ && item.z < s.maxZ)
  return s ? s.index : -1
}

/** Objets posés sur le meuble `i` (ils le suivent quand on le déplace). */
export function ridersOf(view: CabinView, items: CabinItem[], i: number): number[] {
  const surfaces = surfacesOf(view, items)
  const out: number[] = []
  items.forEach((_, j) => {
    if (j !== i && baseOf(view, items, j, surfaces) === i) out.push(j)
  })
  return out
}

const overlapXZ = (a: THREE.Box3, b: { minX: number; maxX: number; minZ: number; maxZ: number }) =>
  a.min.x < b.maxX - EPS && a.max.x > b.minX + EPS && a.min.z < b.maxZ - EPS && a.max.z > b.minZ + EPS

const boxXZ = (b: THREE.Box3) => ({ minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z })

/** Deux objets se gênent-ils ? */
function conflict(ea: CatalogEntry, a: THREE.Box3, eb: CatalogEntry, b: THREE.Box3): boolean {
  // Un tapis passe sous tout, mais deux tapis ne se chevauchent pas.
  if (ea.mount === 'flat' || eb.mount === 'flat') return ea.mount === eb.mount && overlapXZ(a, boxXZ(b))
  if (!overlapXZ(a, boxXZ(b))) return false
  const dy = Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y)
  if (dy <= EPS) return false
  // Un objet accroché peut être un peu masqué par ce qui est posé devant lui.
  if ((ea.mount === 'wall') !== (eb.mount === 'wall')) {
    const wall = ea.mount === 'wall' ? a : b
    return dy > (wall.max.y - wall.min.y) * WALL_COVER
  }
  return true
}

/** Le Holo-Me reste-t-il accessible depuis la porte, avec ces meubles ? */
export function holoReachable(view: CabinView, items: CabinItem[]): boolean {
  const holo = items.find((i) => entryOf(i.m)?.fixed)
  if (!holo) return true
  const st = view.staticBlockers()
  const own = view.blockers(items)
  const pf = new Pathfinder(view.deck.map, new Set([...st.tiles, ...own.tiles]), [...st.colliders, ...own.colliders])
  // On monte sur la plateforme depuis une tuile voisine.
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const t = { x: Math.round(holo.x) + dx, z: Math.round(holo.z) + dz }
      if (Math.hypot(t.x - holo.x, t.z - holo.z) > 0.8 || !pf.walkable(t.x, t.z)) continue
      if (pf.find(view.def.door, t)) return true
    }
  }
  return false
}

/**
 * Raison pour laquelle l'objet `i` ne peut pas être là (texte montré au joueur), ou null.
 * @param moving objets déplacés ensemble (un meuble et ce qui est posé dessus) : ils ne se gênent pas entre eux
 */
export function refusal(view: CabinView, items: CabinItem[], i: number, moving: Set<number> = new Set([i])): string | null {
  const item = items[i]
  const entry = entryOf(item.m)
  const box = view.boxOf(item)
  if (!entry || !box) return 'Objet inconnu'
  const b = view.bounds

  if (entry.mount === 'wall') {
    const wall = view.wallOf(item)
    if (!wall) return 'Accrochez-le à un mur'
    const alongX = DIRS[wall.dir].dz !== 0
    const a0 = alongX ? box.min.x : box.min.z, a1 = alongX ? box.max.x : box.max.z
    if (!wall.spans.some(([u, v]) => a0 >= u - EPS && a1 <= v + EPS)) return 'Pas de place sur ce pan de mur (porte, hublot, pilier)'
    if (box.max.y > 1 + EPS) return 'Trop haut pour ce mur'
  } else {
    if (box.min.x < b.minX - EPS || box.max.x > b.maxX + EPS || box.min.z < b.minZ - EPS || box.max.z > b.maxZ + EPS) return 'Hors des quartiers'
    if (view.posts.some((p) => overlapXZ(box, p))) return 'Pas de place contre ce poteau'
  }

  const surfaces = surfacesOf(view, items)
  const base = baseOf(view, items, i, surfaces)
  if (entry.mount === 'top' && (item.y ?? 0) > 0) {
    const s = surfaces.find((s) => s.index === base)
    if (!s) return 'Posez-le sur un meuble, ou au sol'
    if (box.min.x < s.minX - EPS || box.max.x > s.maxX + EPS || box.min.z < s.minZ - EPS || box.max.z > s.maxZ + EPS) return 'Trop grand pour ce meuble'
  }

  const other = new THREE.Box3()
  for (let j = 0; j < items.length; j++) {
    if (j === i || (moving.has(j) && moving.has(i))) continue
    const ej = entryOf(items[j].m)
    if (!ej || !view.boxOf(items[j], other)) continue
    // Un objet et le meuble qui le porte ne se gênent pas.
    if (base === j || baseOf(view, items, j, surfaces) === i) continue
    if (conflict(entry, box, ej, other)) return `Pas la place ici (${ej.name.toLowerCase()})`
  }

  // Devant la porte, on passe : rien au sol (un tapis, si).
  if (entry.mount !== 'wall' && entry.mount !== 'flat' && !(item.y ?? 0)) {
    const d = view.def.door
    if (overlapXZ(box, { minX: d.x - 0.45, maxX: d.x + 0.45, minZ: d.z - 0.45, maxZ: d.z + 0.45 })) return 'Laissez le passage de la porte libre'
  }
  if ((isSolid(entry) || entry.fixed) && !holoReachable(view, items)) return 'Le Holo-Me doit rester accessible depuis la porte'
  return null
}
