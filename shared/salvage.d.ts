import type { Door, EdgeKind, ShipMap } from './ship-map.js'

export declare const ZONE_LEVEL: -2
export declare const LOBBY: { level: -1; room: 'h' }
export declare const LOBBY_RETURN: { x: number; z: number }
/** Plan fixe de la baie (une lettre par tuile). */
export declare const BAY: string[]
export interface BayLight { x: number; z: number; color: string; intensity: number; flicker?: 'neon' | 'fire' }
export interface BayFurniture { model: string; x: number; z: number; rot?: 0 | 1 | 2 | 3; y?: number; block?: true | [number, number][]; label?: string }
export interface BayRoom { id: string; x: number; z: number; w: number; d: number; doors: { x: number; z: number; dir: number }[]; light: BayLight; furniture: BayFurniture[] }
export interface BayArea { id: string; x: number; z: number; w: number; d: number; density: number; decor: string[]; lights: BayLight[] }
/** Zone éclairée : son rectangle, la couleur et la force de ses projecteurs, et leur place. */
export interface BayLit { id: string; x: number; z: number; w: number; d: number; color: string; intensity: number; lamps: { x: number; z: number }[] }
/** Caméra de surveillance de la baie (spectateurs). */
export interface BayCamera { id: string; x: number; z: number }
/** Le guichet de sécurité : tuiles, côté de la vitre, place du technicien et du comptoir. */
export declare const BAY_BOOTH: { x: number; z: number; w: number; d: number; window: number; technician: { x: number; z: number }; counter: { x: number; z: number } }
export declare const BAY_ROOMS: BayRoom[]
export declare const BAY_PROPS: BayFurniture[]
export declare const BAY_AREAS: BayArea[]
export declare const BAY_LIT: BayLit[]
export declare const BAY_CAMERAS: BayCamera[]
/** Ce que fait le sol : rien, verre qui crisse, flaque qui ralentit. */
export declare const FX: { none: 0; glass: 1; goo: 2 }

export declare const RULES: {
  team: number
  parcels: { min: number; max: number }
  enemies: { min: number; max: number }
  walk: number
  sprint: number
  carry: number
  vision: number
  hiddenVision: number
  litVision: number
  deck: number
  high: number
  goo: number
  stamina: { drain: number; carryDrain: number; walkRegen: number; idleRegen: number; recover: number }
  noise: { sprint: number; carrySprint: number; locker: number; drop: number; eject: number; glass: number; lift: number }
  locker: { max: number; cooldown: number; enter: number; betray: number }
  flare: { carry: number; burn: number; radius: number; range: number }
  monster: {
    patrol: number; investigate: number; chase: number; lured: number
    sight: number; fov: number; sense: number; touch: number; memory: number; attack: number; search: number; look: number
    litSight: number
  }
  hive: { speed: number; roam: number; hearing: number }
  camera: number
  reach: number
  grace: number
  maxDuration: number
  countdown: number
  reconnect: number
}

export interface Tile { x: number; z: number }
export interface Locker extends Tile { id: number; /** Mur contre lequel il se dresse. */ dir: number }
export interface Pickup extends Tile { id: number }
export interface ZoneContainer extends Tile { w: number; d: number; kind: 'container' | 'crates' | 'planter' | 'growth'; color: number; flip: boolean }
export type DecorKind = 'cables' | 'bones' | 'crystals' | 'barrel' | 'goo' | 'debris' | 'glass' | 'papers' | 'soil'
export interface ZoneDecor { kind: DecorKind; x: number; z: number; rot: number; wall: number }
type SightMap = { isFloor(x: number, z: number): boolean; room(x: number, z: number): string | null; edge(x: number, z: number, dir: number): EdgeKind }

export interface Zone {
  seed: number
  width: number
  height: number
  team: number
  parcels: number
  enemies: number
  layout: string[]
  walls: Door[]
  doors: Door[]
  airlock: { side: number; tiles: Tile[]; pad: Tile; inward: number }
  halls: { x: number; z: number; w: number; d: number }[]
  containers: ZoneContainer[]
  blocked: Uint8Array
  /** Tuiles du guichet de sécurité (bloquées, mais on y voit par la vitre). */
  booth: Uint8Array
  rooms: BayRoom[]
  areas: BayArea[]
  props: BayFurniture[]
  lights: BayLit[]
  cameras: BayCamera[]
  /** Obstacles bas (bacs de la serre) : ils bloquent le passage, pas la vue. */
  low: Uint8Array
  /** Obstacles hauts (cloisons, excroissances) : ils arrêtent même le regard d'en haut. */
  tall: Uint8Array
  /** Hauteur nominale du sol de chaque tuile (cf. groundHeight pour les escaliers). */
  elev: Float32Array
  /** Escalier : direction (0 à 3) de la passerelle vers laquelle il monte ; -1 ailleurs. */
  stairs: Int8Array
  /** Tuiles des zones éclairées. */
  lit: Uint8Array
  /** Ce que fait le sol de chaque tuile (cf. FX). */
  fx: Uint8Array
  open: Uint8Array
  /** Garde-corps sur l'arête (tuile * 4 + direction) : on ne passe pas, on voit et l'on entend. */
  rail: Uint8Array
  /** Garde-corps, vus de la tuile haute (passerelle ou escalier). */
  rails: { x: number; z: number; dir: number }[]
  room: string[]
  hall: Int16Array
  lockers: Locker[]
  flares: Pickup[]
  cargo: Pickup[]
  monsters: Pickup[]
  decor: ZoneDecor[]
  adj: Int32Array
  monsterAdj: Int32Array
  hearAdj: Int32Array
  map: ShipMap
  sightMap: SightMap
  highSightMap: SightMap
  walkMap: SightMap
}

export declare function salvageReward(economy: { parcel: number; enemyBonus: number } | null | undefined, parcels: number, enemies: number): number
export declare function salvageMinDuration(economy: { minPerParcel: number } | null | undefined, parcels: number, team: number): number
export declare function salvagePar(parcels: number, team: number): number
export type SalvageGrade = 'S' | 'A' | 'B' | 'C' | 'D'
export declare function salvageGrade(r: { won: boolean; delivered: number; parcels: number; team: number; duration: number; captures: number }): SalvageGrade
export declare function mulberry32(seed: number): () => number
export declare function generateZone(seed: number, settings: { team: number; parcels: number; enemies: number }): Zone
export declare function tileOf(zone: Zone, p: { x: number; z: number }): Tile | null
export declare function walkable(zone: Zone, x: number, z: number): boolean
export declare function inAirlock(zone: Zone, p: { x: number; z: number }): boolean
export declare function groundHeight(zone: Zone, p: { x: number; z: number }): number
export declare function elevated(zone: Zone, p: { x: number; z: number }): boolean
export declare function isLit(zone: Zone, p: { x: number; z: number }): boolean
export declare function floorFx(zone: Zone, p: { x: number; z: number }): number
export declare function distances(zone: Zone, sources: { x: number; z: number }[], options?: { monster?: boolean; hear?: boolean; max?: number }): Int16Array
export declare function findPath(zone: Zone, from: { x: number; z: number }, to: { x: number; z: number }, options?: { monster?: boolean }): Tile[] | null
export declare function sightOrigin(zone: Zone, p: { x: number; z: number }): { x: number; z: number }
export declare function zoneSight(zone: Zone, from: { x: number; z: number }, to: { x: number; z: number }, high?: boolean): boolean
export declare function straightWalk(zone: Zone, from: { x: number; z: number }, to: { x: number; z: number }, radius?: number): boolean
export declare function smoothPath(zone: Zone, from: { x: number; z: number }, tiles: Tile[]): Tile[]
export declare function pickSpawns(zone: Zone, count: number, monsters: { x: number; z: number }[], random: () => number): Tile[]
export declare function lockerSpot(locker: Locker): { x: number; z: number }
export declare function lockerFront(locker: Locker): { x: number; z: number }
