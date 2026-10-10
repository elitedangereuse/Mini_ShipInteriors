import type { EdgeKind } from './ship-map.js'
import type { WeaponId } from './weapons.js'
import type { ZoneContainer } from './salvage.js'

export declare const ARENA_LEVEL: -5
export declare const ARENA_RETURN: { x: number; z: number }
export declare const ARENA_TERMINAL: { x: number; z: number }
export declare const ARENA_LOBBY: { level: -1; room: 'y'; rooms: string }
export declare const ARENA_BOOTH: { x: number; z: number; yaw: number; referee: { x: number; z: number }; counter: { x: number; z: number } }
export declare const ARENA_RULES: {
  lobbies: number
  team: number
  hp: number
  goals: number[]
  goal: number
  duration: number
  countdown: number
  warmup: number
  respawn: number
  shield: number
  regenAfter: number
  regen: number
  bush: { near: number; reveal: number }
  body: { r: number; h: number }
  aim: number
  ceiling: number
  sprint: number
  bot: number
  self: number
}
export declare const ARENA_TEAMS: { id: 0 | 1; color: string }[]
export declare const ARENA_SKILLS: { reaction: number; error: number; pace: number }[]
export declare const ARENA_BOTS: string[]
export declare const ARENA_MAP: string[]

interface PlanMap {
  isFloor(x: number, z: number): boolean
  room(x: number, z: number): string | null
  edge(x: number, z: number, dir: number): EdgeKind
}

/** L'arène : son plan fixe, ses obstacles, les points d'apparition de chaque équipe. */
export interface ArenaZone {
  width: number
  height: number
  layout: string[]
  blocked: Uint8Array
  /** Tuiles de buisson : on s'y cache. */
  bush: Uint8Array
  room: string[]
  open: Uint8Array
  adj: Int32Array
  spawns: [{ x: number; z: number }[], { x: number; z: number }[]]
  containers: (Omit<ZoneContainer, 'kind'> & { kind: 'container' | 'crates' | 'pillar' })[]
  walkMap: PlanMap
  sightMap: PlanMap
}

export declare function arenaZone(): ArenaZone
export declare function arenaSight(zone: ArenaZone, from: { x: number; z: number }, to: { x: number; z: number }): boolean
export declare function inBush(zone: ArenaZone, p: { x: number; z: number }): boolean
export declare function arenaHidden(zone: ArenaZone, p: { x: number; z: number }, viewer: { x: number; z: number }, revealed: boolean): boolean
export declare function blastDamage(weapon: WeaponId, d: number): number
export declare function castArena(
  zone: ArenaZone,
  p: { x: number; y: number; z: number },
  d: { x: number; y: number; z: number },
  max: number,
  bodies: Iterable<{ id: number; x: number; z: number }>,
  skip?: (id: number) => boolean,
): { t: number; body: number | null; normal: [number, number, number] | null; wall: boolean }
export declare function arenaSpawn(zone: ArenaZone, team: number, foes: { x: number; z: number }[], mates?: { x: number; z: number }[]): { x: number; z: number }
export declare function spawnYaw(zone: ArenaZone, at: { x: number; z: number }): number
