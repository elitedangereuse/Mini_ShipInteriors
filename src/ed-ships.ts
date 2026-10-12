import * as THREE from 'three'
import { BASE, rig } from './assets'
import { PaintedHull, type Livery, type ShipPaint } from './ship-paint'

/*
 * Les vaisseaux d'Elite Dangerous (public/assets/ships/, cf. scripts/import-ed-ships.mjs) : les
 * modèles imprimables de Kahnindustries, allégés (8 000 à 10 000 triangles), lissés et peints. En
 * mètres, à l'échelle du jeu d'origine, nez vers +z, dessus vers +y, centrés sur leur boîte. Le nœud
 * du modèle porte dans userData ses dimensions, ses tuyères, sa verrière et la livrée de son
 * constructeur (cf. EdShipInfo). La coque est peinte par son shader (cf. ship-paint.ts) : la livrée
 * du constructeur, ou une des peintures de la boutique d'Elite (cf. paintShip).
 *
 * Ils croisent autour du vaisseau (trafic, cf. traffic.ts ; passage derrière le bouclier du
 * hangar, cf. shield.ts). Chacun n'est chargé qu'à sa première sortie.
 */

/** Du plus petit au plus grand. */
export const ED_SHIPS = [
  'sidewinder', 'eagle', 'imperial-eagle', 'viper-mk3', 'viper-mk4', 'cobra-mk3', 'cobra-mk4', 'adder',
  'diamondback-scout', 'diamondback-explorer', 'imperial-courier', 'vulture', 'asp-explorer', 'keelback', 'type-6',
  'dolphin', 'fer-de-lance', 'mamba', 'krait-mk2', 'krait-phantom', 'alliance-chieftain', 'alliance-crusader',
  'federal-dropship', 'federal-assault-ship', 'type-7', 'python', 'orca', 'imperial-clipper', 'type-9', 'type-10',
  'federal-corvette', 'imperial-cutter',
] as const

export type EdShipId = (typeof ED_SHIPS)[number]

/**
 * Les vaisseaux tels que Frontier les nomme dans le profil du CMDR (`ship.name`, en minuscules),
 * pour ceux qui ont un modèle ici. Les autres (Anaconda, Hauler, Beluga, Python Mk II…) n'en ont
 * pas encore : en ajouter un, c'est ajouter sa ligne.
 */
const ELITE_SHIPS: Record<string, EdShipId> = {
  sidewinder: 'sidewinder', eagle: 'eagle', empire_eagle: 'imperial-eagle', viper: 'viper-mk3', viper_mkiv: 'viper-mk4',
  cobramkiii: 'cobra-mk3', cobramkiv: 'cobra-mk4', adder: 'adder', diamondback: 'diamondback-scout',
  diamondbackxl: 'diamondback-explorer', empire_courier: 'imperial-courier', vulture: 'vulture', asp: 'asp-explorer',
  independant_trader: 'keelback', type6: 'type-6', dolphin: 'dolphin', ferdelance: 'fer-de-lance', mamba: 'mamba',
  krait_mkii: 'krait-mk2', krait_light: 'krait-phantom', typex: 'alliance-chieftain', typex_2: 'alliance-crusader',
  federation_dropship: 'federal-dropship', federation_dropship_mkii: 'federal-assault-ship', type7: 'type-7',
  python: 'python', orca: 'orca', empire_trader: 'imperial-clipper', type9: 'type-9', type9_military: 'type-10',
  federation_corvette: 'federal-corvette', cutter: 'imperial-cutter',
}

/** Le modèle d'un vaisseau du profil Frontier (cf. ELITE_SHIPS), ou null s'il n'en a pas. */
export const edShipFromElite = (type: string): EdShipId | null => ELITE_SHIPS[type.trim().toLowerCase()] ?? null

export interface EdShipInfo {
  name: string
  maker: string
  /** Largeur, hauteur, longueur (m). */
  size: [number, number, number]
  /** Tuyères : centre (m) et demi-tailles du disque lumineux, [x, y, z, rx, ry]. */
  engines: [number, number, number, number, number][]
  /** Centre de la verrière (m), s'il y en a une. */
  canopy?: [number, number, number]
  /**
   * Plan au sol (vu de dessus) : une grille sur la boîte du vaisseau (cases de `cell` m), rangée
   * par rangée de la poupe au nez, chaque rangée de tribord à bâbord ; dans chaque case, la hauteur
   * du dessous et du dessus de la coque (m, depuis le bas du vaisseau ; -1 : rien).
   */
  plan: { cell: number; cols: number; rows: number; low: number[]; high: number[] }
  /** Silhouette vue de dessus, nez vers +x, bâbord en haut : un chemin SVG de 56 unités sur la plus grande dimension, centré. */
  silhouette: string
  /** Les couleurs du constructeur (dos, ventre, panneaux sombres, liserés). */
  livery: Livery
  credit: string
}

/** Un vaisseau du catalogue (public/assets/ships/catalog.json) : de quoi le présenter sans charger son modèle. */
export interface EdShipEntry {
  id: EdShipId
  name: string
  maker: string
  size: [number, number, number]
  silhouette: string
}

/**
 * Les rectangles d'une silhouette ([x, y, largeur, hauteur], cf. EdShipInfo.silhouette), pour la
 * dessiner case par case dans un canvas : plus sûr qu'un Path2D, que certains navigateurs mélangent
 * d'un petit canvas à l'autre.
 */
export function silhouetteRects(d: string): [number, number, number, number][] {
  return [...d.matchAll(/M(-?[\d.]+) (-?[\d.]+)h(-?[\d.]+)v(-?[\d.]+)/g)].map((m) => [+m[1], +m[2], +m[3], +m[4]])
}

let catalog: Promise<EdShipEntry[]> | null = null

/** Le catalogue des vaisseaux, du plus petit au plus grand (chargé une fois). */
export function shipCatalog(): Promise<EdShipEntry[]> {
  return (catalog ??= fetch(`${BASE}ships/catalog.json?v=${import.meta.env.VITE_MODELS_STAMP}`).then((r) => {
    if (!r.ok) throw new Error(`catalogue des vaisseaux : ${r.status}`)
    return r.json() as Promise<EdShipEntry[]>
  }).catch((e) => {
    catalog = null
    throw e
  }))
}

/** Lueur des tuyères : le bleu des réacteurs du trafic, partagé par tous les vaisseaux. */
export const ENGINE_GLOW = new THREE.Color('#8fd0ff')

/**
 * Peintures du modèle (noms des matériaux du GLB) → matériaux du jeu. Le chargeur a déjà fait de
 * ses matériaux des Lambert ; la coque, elle, est peinte à part (cf. PaintedHull).
 */
function gameMaterial(src: THREE.MeshLambertMaterial): THREE.Material {
  if (src.name === 'engine') return new THREE.MeshBasicMaterial({ color: ENGINE_GLOW, name: 'engine' })
  if (src.name === 'glass') {
    return new THREE.MeshPhongMaterial({ color: src.color, emissive: src.emissive, specular: '#9cc3ff', shininess: 80, name: 'glass' })
  }
  return new THREE.MeshLambertMaterial({ color: src.color, name: src.name })
}

/** Livrée de secours (un modèle d'avant les livrées) : celle de Faulcon DeLacy. */
const FALLBACK_LIVERY: Livery = { hull: '#d8dad6', belly: '#a9adb0', dark: '#4d5359', trim: '#7e8790' }

const protos = new Map<EdShipId, Promise<THREE.Object3D>>()

/** Un vaisseau, prêt à poser (géométries et matériaux partagés avec ses semblables : ne pas les jeter). */
export async function edShip(id: EdShipId): Promise<THREE.Object3D> {
  let proto = protos.get(id)
  if (!proto) {
    proto = rig(`ships/${id}.glb`).then(({ root }) => {
      const converted = new Map<THREE.Material, THREE.Material>()
      root.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.castShadow = mesh.receiveShadow = false
        const src = mesh.material as THREE.MeshLambertMaterial
        if (src.name === 'hull') return
        let dst = converted.get(src)
        if (!dst) converted.set(src, (dst = gameMaterial(src)))
        mesh.material = dst
      })
      // La coque des copies : la livrée du constructeur, partagée tant qu'on ne les peint pas.
      paintShip(root, null)
      return root
    })
    protos.set(id, proto)
    // Raté (le réseau) : le prochain appel retente.
    const failed = proto
    failed.catch(() => {
      if (protos.get(id) === failed) protos.delete(id)
    })
  }
  return (await proto).clone(true)
}

/**
 * Peint ce vaisseau (une copie rendue par edShip) : la première fois, il reçoit sa propre coque, que
 * ses semblables ne partagent pas. Rend la coque, de quoi changer de peinture ensuite (cf.
 * PaintedHull.set) ; son matériau est à jeter avec le vaisseau.
 */
export function paintShip(ship: THREE.Object3D, paint: ShipPaint | null): PaintedHull {
  const own = hulls.get(ship)
  if (own) {
    own.set(paint)
    return own
  }
  const info = shipInfo(ship)
  const hull = new PaintedHull(info.name, ship, info.size, info.livery ?? FALLBACK_LIVERY)
  hull.set(paint)
  ship.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh && (mesh.material as THREE.Material).name === 'hull') mesh.material = hull.material
  })
  hulls.set(ship, hull)
  return hull
}

/** Les coques peintes, par vaisseau (pas dans userData : clone() le recopie en JSON). */
const hulls = new WeakMap<THREE.Object3D, PaintedHull>()

/** Les infos d'un vaisseau chargé (cf. EdShipInfo). */
export function shipInfo(ship: THREE.Object3D): EdShipInfo {
  let info: EdShipInfo | undefined
  ship.traverse((o) => {
    if (!info && o.userData.size) info = o.userData as EdShipInfo
  })
  return info!
}

/**
 * Longueur à l'écran (tuiles) d'un vaisseau qui croise au large : les tailles du jeu d'origine
 * (de 14 m pour le Sidewinder à 193 m pour le Cutter) tassées en racine, pour que les plus gros
 * tiennent dans la vue serrée sans écraser les petits (de 1,3 à 5 tuiles).
 */
export const trafficLength = (meters: number) => 0.36 * Math.sqrt(meters)
