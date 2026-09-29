import type { Door, EdgeKind, ShipMap } from './ship-map.js'

export declare const ZONE_LEVEL: -2
export declare const LOBBY: { level: -1; room: 'h' }
export declare const LOBBY_RETURN: { x: number; z: number }

export declare const RULES: {
  team: number
  parcels: { min: number; max: number }
  enemies: { min: number; max: number }
  walk: number
  sprint: number
  carry: number
  vision: number
  hiddenVision: number
  stamina: { drain: number; carryDrain: number; walkRegen: number; idleRegen: number; recover: number }
  noise: { sprint: number; carrySprint: number; locker: number; drop: number; eject: number }
  locker: { max: number; cooldown: number; enter: number }
  flare: { carry: number; burn: number; radius: number; range: number }
  monster: {
    patrol: number; investigate: number; chase: number; lured: number
    sight: number; fov: number; sense: number; touch: number; memory: number; attack: number; search: number; look: number
  }
  reach: number
  grace: number
  maxDuration: number
  countdown: number
}

export interface Tile { x: number; z: number }
export interface Locker extends Tile { id: number; /** Mur contre lequel il se dresse. */ dir: number }
export interface Pickup extends Tile { id: number }
export interface ZoneContainer extends Tile { w: number; d: number; kind: 'container' | 'crates'; color: number; flip: boolean }
export interface ZoneDecor { kind: 'cables' | 'bones' | 'crystals' | 'barrel' | 'goo' | 'debris'; x: number; z: number; rot: number; wall: number }

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
  open: Uint8Array
  room: string[]
  hall: Int16Array
  lockers: Locker[]
  flares: Pickup[]
  cargo: Pickup[]
  monsters: Pickup[]
  decor: ZoneDecor[]
  adj: Int32Array
  monsterAdj: Int32Array
  map: ShipMap
  sightMap: { isFloor(x: number, z: number): boolean; room(x: number, z: number): string | null; edge(x: number, z: number, dir: number): EdgeKind }
}

export declare function salvageReward(economy: { parcel: number; enemyBonus: number } | null | undefined, parcels: number, enemies: number): number
export declare function zoneSize(team: number, parcels: number): { width: number; height: number }
export declare function mulberry32(seed: number): () => number
export declare function generateZone(seed: number, settings: { team: number; parcels: number; enemies: number }): Zone
export declare function tileOf(zone: Zone, p: { x: number; z: number }): Tile | null
export declare function walkable(zone: Zone, x: number, z: number): boolean
export declare function inAirlock(zone: Zone, p: { x: number; z: number }): boolean
export declare function distances(zone: Zone, sources: { x: number; z: number }[], options?: { monster?: boolean; max?: number }): Int16Array
export declare function findPath(zone: Zone, from: { x: number; z: number }, to: { x: number; z: number }, options?: { monster?: boolean }): Tile[] | null
export declare function zoneSight(zone: Zone, from: { x: number; z: number }, to: { x: number; z: number }): boolean
export declare function straightWalk(zone: Zone, from: { x: number; z: number }, to: { x: number; z: number }, radius?: number): boolean
export declare function smoothPath(zone: Zone, from: { x: number; z: number }, tiles: Tile[]): Tile[]
export declare function pickSpawns(zone: Zone, count: number, monsters: { x: number; z: number }[], random: () => number): Tile[]
export declare function lockerSpot(locker: Locker): { x: number; z: number }
export declare function lockerFront(locker: Locker): { x: number; z: number }
