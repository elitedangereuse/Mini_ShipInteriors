import type { ProcessId, StationKind, Text } from './mess-rush-catalog.js'

export declare const MESS_LEVEL: -6
export declare const MESS_LOBBY: { level: 0; room: 'm'; rail: { x: number; z: number } }
export declare const MESS_RETURN: { level: 0; x: number; z: number; yaw: number }
export declare const MESS_LAYOUT: string[]
export declare const MESS_BOUNDS: { minX: number; maxX: number; minZ: number; maxZ: number }
export declare const MESS_SPAWNS: { x: number; z: number }[]
export declare function onMessFloor(x: number, z: number): boolean

export interface Station { id: string; kind: StationKind; x: number; z: number }
export declare const STATIONS: Station[]
export declare const STATION_BY_ID: Record<string, Station>
export declare const STATION_NAMES: Record<StationKind, Text>

export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }
export interface KitchenZone { id: string; bounds: Rect; spawn: { x: number; z: number }; stations: string[] }
export interface Kitchen { walls: Rect[]; zones: KitchenZone[]; stations: string[] }
export declare const KITCHENS: Record<1 | 2 | 3 | 4, Kitchen>
export declare function kitchenOf(state: ServiceState): Kitchen
export declare function zoneOf(state: ServiceState, pid: string | number): KitchenZone | null
export declare function canReach(state: ServiceState, pid: string | number, stationId: string): boolean
export declare function wallsOf(state: ServiceState): Rect[]
export declare function inZone(state: ServiceState, pid: string | number, x: number, z: number, margin?: number): boolean
export declare function openKitchen(state: ServiceState): ServiceEvent[]

export type Medal = 'none' | 'bronze' | 'silver' | 'gold'
export declare const MEDALS: Medal[]

export interface Pace { maxOrders: number; every: number; timeScale: number; without?: string[] }
export declare const RULES: {
  lobbies: number
  team: number
  countdown: number
  arrival: number
  reconnect: number
  keepResult: number
  service: number
  reach: number
  plateCapacity: number
  potCapacity: number
  panCapacity: number
  firstOrder: number
  complexAfter: number
  byPlayers: Record<1 | 2 | 3 | 4, Pace>
  speedBonus: [number, number][]
  combo: { step: number; max: number }
  expiredPenalty: number
  medals: Record<1 | 2 | 3 | 4, [number, number, number]>
}

export interface Item {
  id: string
  kind: 'ingredient' | 'plate' | 'cup'
  ing?: string
  /** Gestes faits (cf. `prep` de l'ingrédient). */
  step?: number
  /** Avancée du geste en cours (s). */
  progress?: number
  /** Cuit : la cuisson qui l'a cuit. */
  cooked?: ProcessId
  /** Assiette ou tasse : ce qu'elle contient, [ingrédient, état]. */
  contents?: [string, string][]
}
export interface Order { id: string; recipe: string; at: number; until: number; status: 'pending' | 'served' | 'expired'; done?: number; points?: number }
export interface SlotState { item: string | null; cook?: { start: number; until: number } | null; done?: boolean }
export interface UtensilState { items: string[]; cook: { start: number; until: number } | null; done: boolean }
export interface ServiceState {
  id: string
  players: number
  /** Le plan de la cuisine (cf. KITCHENS), d'après le nombre de joueurs au départ. */
  kitchen: 1 | 2 | 3 | 4
  /** La zone de chaque joueur (son rang dans le plan). */
  zones: Record<string, number>
  /** Les cloisons sont tombées (un cuisinier est parti) : chacun atteint tous les postes. */
  open: boolean
  recipes: string[]
  startedAt: number
  endsAt: number
  endedAt?: number
  status: 'running' | 'ended'
  rng?: number
  seq: number
  orderSeq: number
  nextOrderAt: number
  orders: Order[]
  items: Record<string, Item>
  stations: Record<string, SlotState | UtensilState>
  hands: Record<string, string | null>
  work: Record<string, { station: string; item: string }>
  score: number
  combo: number
  bestCombo: number
  served: number
  expired: number
  wasted: number
}
export interface ServiceEvent { kind: 'served' | 'expired' | 'wasted' | 'prepared' | 'cooked' | 'cooking' | 'order' | 'dropped' | 'end' | 'emptied' | 'cleared' | 'open'; order?: string; recipe?: string; points?: number; combo?: number; penalty?: number; station?: string; ing?: string; process?: ProcessId; by?: string; count?: number }
export interface UseAction { kind: 'take-ingredient' | 'take-plate' | 'take' | 'take-back' | 'put' | 'plate-pick' | 'plate-add' | 'fill' | 'serve-utensil' | 'deliver' | 'trash'; ing?: string; order?: string | null }
export interface WorkAction { kind: 'cycle' | 'process' | 'cook' | 'empty'; process?: ProcessId; busy?: boolean }
export type GuideStep = 'prep' | 'cook' | 'plate' | 'put' | 'deliver' | 'complete' | 'fill-plate' | 'wait' | 'hold' | 'trash' | 'handoff' | 'take-dish' | 'take-plate' | 'need-plate' | 'work' | 'start' | 'take' | 'tidy' | 'fetch'
export interface Guide { step: GuideStep; stations: string[]; ing?: string; process?: ProcessId }
export interface ServiceResult {
  game: string
  version: 1
  startedAt: number
  endedAt: number
  duration: number
  players: number
  score: number
  medal: Medal
  won: boolean
  served: number
  expired: number
  bestCombo: number
  wasted: number
}

export declare function pace(players: number, rules?: typeof RULES): Pace
export declare function menuFor(players: number, recipes?: string[], rules?: typeof RULES): string[]
export declare function medalOf(score: number, players: number, rules?: typeof RULES): Medal
export declare function comboMultiplier(combo: number, rules?: typeof RULES): number
export declare function speedBonus(remaining: number, rules?: typeof RULES): number
export declare function recipeValue(id: string): { points: number; time: number }
export declare function createService(o: { id: string; seed: number; players: number; now: number; recipes?: string[]; members?: (string | number)[]; rules?: typeof RULES }): ServiceState
export declare function ingredientState(item: Item): string
export declare function nextPrep(item: Item): ProcessId | null
export declare function dishMatches(item: Item, recipeId: string): boolean
export declare function matchingOrder(state: ServiceState, item: Item | null): Order | null
export declare function dispenserChoices(state: ServiceState, stationId: string): string[]
export declare function resolveAction(state: ServiceState, pid: string, stationId: string, pick?: string, rules?: typeof RULES): { use: UseAction | null; work: WorkAction | null }
export declare function useStation(state: ServiceState, pid: string, stationId: string, pick: string | undefined, now: number, rules?: typeof RULES): { ok: true; events: ServiceEvent[] } | { ok: false; code: string }
export declare function workStation(state: ServiceState, pid: string, stationId: string, now: number, rules?: typeof RULES): { ok: true; events: ServiceEvent[] } | { ok: false; code: string }
export declare function stopWork(state: ServiceState, pid: string): void
export declare function dropHeld(state: ServiceState, pid: string): ServiceEvent[]
export declare function finalState(ing: string): string
export declare function guide(state: ServiceState, pid: string, rules?: typeof RULES): Guide | null
export declare function clearUnneeded(state: ServiceState): number
export declare function stepService(state: ServiceState, now: number, dt: number, near: (pid: string, stationId: string) => boolean, rules?: typeof RULES): ServiceEvent[]
export declare function currentMedal(state: ServiceState, rules?: typeof RULES): Medal
export declare function serviceResult(state: ServiceState, endedAt?: number, rules?: typeof RULES): ServiceResult
export declare function serviceView(state: ServiceState): ServiceState
