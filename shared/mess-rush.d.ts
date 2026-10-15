import type { ProcessId, StationKind, Text } from './mess-rush-catalog.js'

export declare const MESS_LEVEL: -6
export declare const MESS_LOBBY: { level: 0; room: 'm'; rail: { x: number; z: number } }
export declare const MESS_RETURN: { level: 0; x: number; z: number; yaw: number }
export declare const MESS_LAYOUT: string[]
export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }
export declare const MESS_BOUNDS: Rect
/** La rangée des caisses (au nord de l'ouest), le comptoir de service (les clients derrière), le sol des cuisiniers, la file des clients. */
export declare const CRATE_ROW: Rect
export declare const SERVICE_COUNTER: Rect
export declare const KITCHEN_FLOOR: Rect
export declare const QUEUE: { minX: number; maxX: number; z: number }
/** Hauteur du dessus des meubles de la cuisine. */
export declare const COUNTER_TOP: number
export declare const MESS_SPAWNS: { x: number; z: number }[]
export declare function onMessFloor(x: number, z: number): boolean

/** Un poste ; une caisse dit son ingrédient (`ing`). */
export interface Station { id: string; kind: StationKind; x: number; z: number; ing?: string }
export declare const STATIONS: Station[]
export declare const STATION_BY_ID: Record<string, Station>
export declare const STATION_NAMES: Record<StationKind, Text>

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
  /** La cuisson : le temps qu'ajoute un ingrédient de plus, le temps avant de brûler, l'alerte avant. */
  cook: { potExtra: number; burn: { pot: number; pan: number }; warn: number }
  /** Les assiettes au départ, le temps avant qu'une assiette servie revienne sale, le temps pour en laver une. */
  plates: Record<1 | 2 | 3 | 4, number>
  plateReturn: number
  wash: number
  firstOrder: number
  complexAfter: number
  byPlayers: Record<1 | 2 | 3 | 4, Pace>
  speedBonus: [number, number][]
  combo: { step: number; max: number }
  expiredPenalty: number
  /** Les imprévus (cf. EVENT_KINDS). */
  events: { first: number; every: [number, number]; quiet: number; clean: number; cat: number; overheat: { time: number; speed: number }; vip: { points: number; time: number } }
  medals: Record<1 | 2 | 3 | 4, [number, number, number]>
}

/** Les imprévus : plateau renversé sur la passe, le chat du bord sur un comptoir, surchauffe des fourneaux, coup de feu, l'amiral à bord. */
export type EventKind = 'spill' | 'cat' | 'overheat' | 'rush' | 'vip'
export declare const EVENT_KINDS: EventKind[]
/** L'imprévu en cours : sa fin (le chat, la surchauffe), le nettoyage en cours (le plateau), son poste (la passe, le comptoir du chat). */
export interface ServiceIncident { kind: EventKind; at: number; until?: number; progress?: number; station?: string }

export interface Item {
  id: string
  /** Un ingrédient, une assiette (propre, garnie ou non), une pile d'assiettes sales. */
  kind: 'ingredient' | 'plate' | 'dirty'
  ing?: string
  /** Gestes faits (cf. `prep` de l'ingrédient). */
  step?: number
  /** Avancée du geste en cours (s). */
  progress?: number
  /** Cuit : la cuisson qui l'a cuit ; brûlé. */
  cooked?: ProcessId
  burnt?: boolean
  /** Assiette : ce qu'elle contient, [ingrédient, état]. */
  contents?: [string, string][]
  /** Pile d'assiettes sales : combien. */
  count?: number
}
export interface Order { id: string; recipe: string; at: number; until: number; status: 'pending' | 'served' | 'expired'; done?: number; points?: number; vip?: boolean }
/** Une cuisson : de quand à quand, quand ça brûle, laquelle. */
export interface Cooking { start: number; until: number; burnAt: number; process: ProcessId }
/** Une planche, une place de comptoir. */
export interface SlotState { item: string | null }
/** Une marmite, une poêle. */
export interface UtensilState { items: string[]; cook: Cooking | null; done: boolean; burnt: boolean }
/** La pile d'assiettes, le retour de vaisselle (et ce qui revient bientôt), la plonge (et l'assiette en cours). */
export interface CountState { count: number; pending?: number[]; progress?: number }
export type StationState = SlotState | UtensilState | CountState
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
  /** L'imprévu en cours, et l'heure du prochain tirage. */
  event?: ServiceIncident | null
  nextEventAt?: number
  orders: Order[]
  items: Record<string, Item>
  stations: Record<string, StationState>
  hands: Record<string, string | null>
  work: Record<string, { station: string; item?: string; clean?: boolean; wash?: boolean }>
  score: number
  combo: number
  bestCombo: number
  served: number
  expired: number
  wasted: number
}
export interface ServiceEvent {
  kind: 'served' | 'expired' | 'wasted' | 'prepared' | 'cooked' | 'cooking' | 'burnt' | 'order' | 'dropped' | 'end' | 'emptied' | 'cleared' | 'open'
    | 'event' | 'event-end' | 'merged' | 'washed' | 'dirty' | 'shooed' | 'eaten'
  order?: string; recipe?: string; points?: number; combo?: number; penalty?: number; station?: string; ing?: string; process?: ProcessId; by?: string; count?: number
  event?: EventKind; until?: number; vip?: boolean
}
/** Ce que fait la touche à un poste. */
export type ActionKind = 'shoo' | 'clean' | 'work' | 'wash' | 'take-ingredient' | 'take' | 'put' | 'plate-pick' | 'plate-add' | 'merge' | 'stack' | 'fill' | 'serve' | 'empty'
  | 'take-plate' | 'take-dirty' | 'put-dirty' | 'deliver' | 'trash'
export interface Action { kind: ActionKind; ing?: string; order?: string | null; busy?: boolean }
export type GuideStep = 'shoo' | 'clean' | 'empty' | 'take-dish' | 'take-plate' | 'fill-plate' | 'complete' | 'merge' | 'take-merge' | 'wash' | 'take-dirty' | 'work' | 'take' | 'fetch'
  | 'prep' | 'cook' | 'plate' | 'put' | 'wait' | 'hold' | 'deliver' | 'trash' | 'handoff' | 'need-plate'
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
export declare function finalState(ing: string): string
export declare function dishMatches(item: Item, recipeId: string): boolean
export declare function matchingOrder(state: ServiceState, item: Item | null): Order | null
/** Ce que ferait la touche à ce poste, pour ce joueur (null : rien). */
export declare function resolveAction(state: ServiceState, pid: string, stationId: string, rules?: typeof RULES): Action | null
export declare function useStation(state: ServiceState, pid: string, stationId: string, pick: string | undefined, now: number, rules?: typeof RULES): { ok: true; events: ServiceEvent[] } | { ok: false; code: string }
export declare function workStation(state: ServiceState, pid: string, stationId: string, now: number, rules?: typeof RULES): { ok: true; events: ServiceEvent[] } | { ok: false; code: string }
export declare function stopWork(state: ServiceState, pid: string): void
/** Un poste hors d'usage à cause d'un imprévu (la passe renversée, le chat assis dessus) ? */
export declare function isBlocked(state: ServiceState, stationId: string): boolean
export declare function dropHeld(state: ServiceState, pid: string): ServiceEvent[]
export declare function guide(state: ServiceState, pid: string, rules?: typeof RULES): Guide | null
export declare function clearUnneeded(state: ServiceState): number
export declare function stepService(state: ServiceState, now: number, dt: number, near: (pid: string, stationId: string) => boolean, rules?: typeof RULES): ServiceEvent[]
export declare function currentMedal(state: ServiceState, rules?: typeof RULES): Medal
export declare function serviceResult(state: ServiceState, endedAt?: number, rules?: typeof RULES): ServiceResult
export declare function serviceView(state: ServiceState): ServiceState
