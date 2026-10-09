import { CATALOG, type CatalogLight } from '../cabin/catalog'

/*
 * Mobilier qui éclaire. Les objets du catalogue des quartiers disent leur lumière dans leur fiche
 * (cf. `light` dans cabin/catalog.ts) ; le mobilier du vaisseau qui n'y figure pas la dit ici. Un
 * meuble posé sur un pont (cf. Deck) ou dans des quartiers (cf. CabinView) éclaire de la même façon.
 */

export interface FurnitureLight extends CatalogLight {
  /** Rayon du halo de la lampe (une ampoule, une flamme) ; rien pour un écran, qui brille déjà. */
  halo?: number
  /** Lueur diffuse (un écran, une vitrine) : dans le champ de lumière seulement, sans vraie lumière. */
  soft?: boolean
}

const SCREEN = { color: '#7fd6ff', intensity: 0.45, at: [0, 0.7, 0.3], priority: 6, soft: true } satisfies FurnitureLight
const TANK = { color: '#7dffa8', intensity: 0.6, at: [0, 0.7, 0], priority: 6, soft: true } satisfies FurnitureLight

/** Mobilier du vaisseau hors catalogue : sa lumière, dans le repère du meuble (face à +z). */
const SHIP: Record<string, FurnitureLight> = {
  'promenade-lamp': { color: '#ffd9a8', intensity: 1.1, at: [0, 0.75, 0], priority: 3, halo: 0.42 },
  'tiki-torch': { color: '#ffb36b', intensity: 1, at: [0, 1, 0], flicker: 'fire', priority: 3, halo: 0.5 },
  'vending-machine': { color: '#bfe4ff', intensity: 0.7, at: [0, 0.7, 0.35], priority: 6, soft: true },
  arcade: { color: '#8fb8ff', intensity: 0.5, at: [0, 0.75, 0.3], priority: 6, soft: true },
  pinball: { color: '#ff8ad0', intensity: 0.5, at: [0, 0.7, 0], priority: 6, soft: true },
  'claw-machine': { color: '#ffd0f0', intensity: 0.6, at: [0, 0.8, 0], priority: 6, soft: true },
  'prize-counter': { color: '#ffd9f4', intensity: 0.9, at: [0, 0.9, 0.5], priority: 6, soft: true },
  'token-machine': { color: '#9df0ff', intensity: 0.4, at: [0, 0.8, 0.4], priority: 6, soft: true },
  'pixelwar-screen': { color: '#ffffff', intensity: 0.7, at: [0, 0.9, 0.4], priority: 6, soft: true },
  'pixelwar-terminal': SCREEN,
  // Le Comptoir des Cartes Dangereuses : les réglettes de la boutique, le faisceau de l'autel, les
  // guirlandes, les lampes à vitrail et celles des tables.
  'cards-shop': { color: '#ffdca8', intensity: 1.1, at: [0, 0.8, 0.6], priority: 5, soft: true },
  'cards-counter': { color: '#ffe7c0', intensity: 0.6, at: [0, 0.4, 0.5], priority: 6, soft: true },
  'cards-altar': { color: '#ffcf8a', intensity: 1.3, at: [0, 0.7, 0], priority: 3 },
  'cards-festoon': { color: '#ffd9a0', intensity: 0.8, at: [0, 0.9, 0], priority: 6, soft: true },
  'stained-lamp': { color: '#ffb96a', intensity: 0.9, at: [0, 0.6, 0], priority: 4 },
  'clash-table': { color: '#ffe2b0', intensity: 0.3, at: [0, 0.65, 0], priority: 6, soft: true },
  'binder-table': { color: '#d8ffc8', intensity: 0.5, at: [-0.3, 0.6, -0.1], priority: 6, soft: true },
  'card-showcase': { color: '#fff0cf', intensity: 0.5, at: [0, 0.6, 0.3], priority: 6, soft: true },
  jukebox: { color: '#ff9a4a', intensity: 0.7, at: [0, 0.6, 0.25], priority: 6, soft: true },
  'popcorn-machine': { color: '#ffd08a', intensity: 0.6, at: [0, 0.8, 0], priority: 6, soft: true },
  computer: SCREEN,
  'computer-screen': SCREEN,
  'computer-system': SCREEN,
  // Le poste de pilotage s'éclaire de ses instruments : l'orange des hologrammes d'Elite.
  'side-console': { color: '#ff9a3c', intensity: 0.5, at: [0, 0.75, 0.25], priority: 6, soft: true },
  'helm-console': { color: '#ff8a1c', intensity: 1.1, at: [0, 0.8, 0.5], priority: 6, soft: true },
  'hangar-console': SCREEN,
  'security-desk': SCREEN,
  'galaxy-map': { color: '#ff9a3c', intensity: 0.8, at: [0, 0.8, 0], priority: 6, soft: true },
  'holo-panel': { color: '#ff8a1c', intensity: 0.5, at: [0, 0.8, 0.2], priority: 6, soft: true },
  'exit-sign': { color: '#6dff9a', intensity: 0.4, at: [0, 0.9, 0.15], priority: 6, soft: true },
  // Le plan du vaisseau, sur son écran holographique : une lueur froide sur le mur et le sol.
  'ship-map': { color: '#7fc8ff', intensity: 0.45, at: [0, 0.62, 0.3], priority: 6, soft: true },
  'sample-tank': TANK,
  'nutrient-tank': TANK,
  'containment-pod': TANK,
  'hydro-rack': { color: '#ffb3e6', intensity: 0.7, at: [0, 0.8, 0], priority: 6, soft: true },
  'med-fridge': { color: '#d6f4ff', intensity: 0.4, at: [0, 0.7, 0.3], priority: 6, soft: true },
}

type Entry = (typeof CATALOG)[number]
let byModel: Map<string, Entry> | null = null

/** Lumière d'un objet du catalogue, dans sa variante. */
export function entryLight(entry: Entry, variant: string | undefined): FurnitureLight | undefined {
  const l = typeof entry.light === 'function' ? entry.light(variant) : entry.light
  if (!l) return SHIP[entry.model]
  // Une lampe (catégorie « Lumières »), une flamme : on voit son ampoule briller.
  return entry.category === 'light' || l.flicker === 'fire' ? { ...l, halo: 0.3 + 0.25 * l.intensity } : l
}

/**
 * Lumière d'un meuble posé sur un pont, s'il éclaire.
 * @param label texte libre du meuble (la variante, pour un objet du catalogue)
 */
export function furnitureLight(model: string, label: string | undefined): FurnitureLight | undefined {
  if (!byModel) {
    byModel = new Map()
    for (const e of CATALOG) if (e.light && !byModel.has(e.model)) byModel.set(e.model, e)
  }
  const entry = byModel.get(model)
  return entry ? entryLight(entry, label) : SHIP[model]
}
