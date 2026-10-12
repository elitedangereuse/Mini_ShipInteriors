import type { EdgeKind } from './ship-map.js'
import type { ZoneContainer } from './salvage.js'

export declare const ARENA_LEVEL: -5
export declare const ARENA_RETURN: { x: number; z: number }
export declare const ARENA_TERMINAL: { x: number; z: number }
export declare const ARENA_LOBBY: { level: -1; room: 'y'; rooms: string }
export declare const ARENA_BOOTH: { x: number; z: number; yaw: number; referee: { x: number; z: number }; counter: { x: number; z: number } }
export declare const ARENA_RULES: {
  lobbies: number
  team: number
  baseDepth: number
  goals: number[]
  goal: number
  wins: number
  rounds: number
  intermission: number
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
  lob: number
}

export type CharacterId = 'rourke' | 'marcel' | 'nico' | 'betty' | 'capucine' | 'jacques'

/** L'arme d'un personnage (cf. ARENA_CHARACTERS dans arena.js). */
export interface CharacterWeapon {
  auto: boolean
  burst?: number
  interval: number
  mag: number
  reload: number
  speed: number
  pierce: boolean
  pellets: number
  spread: number
  damage: number
  range: number
  reach: number
  blast: number
  heal?: number
  lob?: boolean
  flower?: { life: number; radius: number; every: number; grow: number; most: number; windup: number }
  fire?: { life: number; radius: number; every: number; damage: number }
}

export interface CharacterStats {
  hp: number
  speed: number
  scan?: number
  weapon: CharacterWeapon
}

export declare const ARENA_CHARACTERS: Record<CharacterId, CharacterStats>
export declare const CHARACTER_IDS: CharacterId[]
export declare const DEFAULT_CHARACTER: CharacterId
export declare const ARENA_TEAMS: { id: 0 | 1; color: string }[]
export declare const ARENA_PALETTE: { self: string; ally: string; enemy: string; heal: string }
export declare const ARENA_SKILLS: { reaction: number; error: number; pace: number }[]
export declare const ARENA_BOTS: string[]
/** Les plans de l'arène (cf. ARENA_MAPS dans arena.js). */
export type ArenaMapId = 'bay' | 'guardian' | 'hive'
export interface ArenaMap { id: ArenaMapId; name: [string, string]; plan: string[]; plateau?: number }
export declare const ARENA_MAPS: ArenaMap[]
export declare function arenaMap(id?: string | null): ArenaMap

interface PlanMap {
  isFloor(x: number, z: number): boolean
  room(x: number, z: number): string | null
  edge(x: number, z: number, dir: number): EdgeKind
}

/** L'arène d'un plan : ses obstacles, les points d'apparition de chaque équipe. */
export interface ArenaZone {
  id: ArenaMapId
  plan: string[]
  width: number
  height: number
  layout: string[]
  blocked: Uint8Array
  /** Gouffres : bloqués pour les pas (ils le sont dans `blocked`), pas pour les balles ni la vue. */
  pit: Uint8Array
  /** Tuiles de buisson : on s'y cache. */
  bush: Uint8Array
  room: string[]
  open: Uint8Array
  adj: Int32Array
  spawns: [{ x: number; z: number }[], { x: number; z: number }[]]
  /** Hauteur du haut (0 : un seul niveau) ; sol de chaque tuile ; rampe (sens de la montée, -1 : aucune). */
  top: number
  elev: Float64Array
  stairs: Int8Array
  /** Garde-corps (falaises, flancs des rampes) : arêtes entre deux tuiles libres qu'on ne franchit pas (vers l'est ou le sud). */
  rails: { x: number; z: number; dir: number }[]
  containers: (Omit<ZoneContainer, 'kind'> & { kind: 'container' | 'crates' | 'pillar' | 'pod' | 'core' })[]
  walkMap: PlanMap
  sightMap: PlanMap
}

export declare function arenaZone(id?: string | null): ArenaZone
export declare function arenaGround(zone: ArenaZone, p: { x: number; z: number }): number
export declare function arenaSight(zone: ArenaZone, from: { x: number; z: number }, to: { x: number; z: number }): boolean
export declare function inArenaBase(zone: ArenaZone, team: number, p: { x: number; z: number }): boolean
export declare function inBush(zone: ArenaZone, p: { x: number; z: number }): boolean
export declare function arenaHidden(zone: ArenaZone, p: { x: number; z: number }, viewer: { x: number; z: number }, revealed: boolean, near?: number): boolean
export declare function bushSight(character: string): number
export declare function blastDamage(w: { blast: number; damage: number }, d: number): number
export declare function lobTarget(zone: ArenaZone, from: { x: number; z: number }, dir: { x: number; z: number }, dist: number, range: number): { x: number; z: number }
export declare function lobTime(w: { speed: number }, dist: number): number
export declare const MUZZLE_SLACK: number
export declare function shotOrigin(zone: ArenaZone, foot: { x: number; z: number }, want: { x: number; z: number }): { x: number; z: number }
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
