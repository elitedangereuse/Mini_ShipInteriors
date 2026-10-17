import type { ArenaMapId } from '../shared/arena.js'
import type { FighterId } from '../shared/fight-roster.js'
import type { FightSnapshot } from '../shared/fight.js'
import type { SystemId } from '../shared/systems.js'
import type { Medal, ServiceEvent, ServiceState } from '../shared/mess-rush.js'
/** Client du relais multijoueur (server/relay.js, socket.io). Sans serveur, le jeu reste en solo. */
import { io, type Socket } from 'socket.io-client'
import type { CharacterId } from '../shared/arena.js'

export interface PlayerState {
  id: number
  name: string
  /** CMDR reconnu par elitedangereuse.fr (sinon : invité). */
  verified?: boolean
  skin: string
  x: number
  z: number
  level: number
  yaw: number
  anim: string
  /** Pose tenue sur un meuble (cf. seats.ts), et hauteur au-dessus du pont (assis, couché). */
  pose?: string
  py?: number
  /** Instance des quartiers où il se trouve : l'id du joueur qui reçoit (le sien, chez lui). */
  cabin: number
  /** Ses quartiers sont ouverts (housing v2) : on y entre sans invitation. */
  open?: boolean
}

/** Où est un jukebox : à la salle commune du pont principal, au bar de la cale, ou dans des quartiers. */
export type JukeboxWhere = 'deck' | 'hold' | 'cabin'

/** Ce que joue un jukebox : son morceau (null : il se tait), depuis `at` secondes, à sa place. */
export interface MusicState {
  where: JukeboxWhere
  track: string | null
  at: number
  x: number
  z: number
  song?: number
  loop?: boolean
  shuffle?: boolean
  seed?: number
}

/**
 * Ronde du sergent (cf. shared/patrol.js) : l'instant de la ronde (s), l'arrêt restant (s) et,
 * pendant un arrêt, le joueur vers qui il se tourne.
 */
export interface PatrolState {
  tau: number
  hold: number
  face?: { x: number; z: number }
}

/**
 * Tournée du chef du mess (cf. shared/chef.js) : comme la ronde du sergent, plus la commande en
 * cours (s restantes) qui le retient à la passe.
 */
export interface ChefState extends PatrolState {
  cook: number
}

/** Horloge des habitués du mess (cf. shared/diners.js) : où en est leur journée. */
export interface DinersState {
  tau: number
}

/**
 * Tournée de l'infirmière (cf. shared/nurse.js) : comme la ronde du sergent, plus la consultation en
 * cours (s restantes, lit, id du patient ; 0, -1 et 0 sans consultation) qui la retient au chevet,
 * et les pansements du bord ([id du joueur, s restantes]).
 */
export interface NurseState extends PatrolState {
  care: number
  bed: number
  patient: number
  patched: [number, number][]
}

/**
 * Tournée du mécano du hangar (cf. shared/mechanic.js) : comme la ronde du sergent, plus la
 * révision en cours (s restantes) qui le retient au nez du Krait, et les réacteurs du Krait (s
 * restantes, et le pilote qui les a mis en route) qui le font paniquer.
 */
export interface MechanicState extends PatrolState {
  help: number
  panic: number
  pilot?: number
}

/**
 * Tournée de la jardinière de la serre (cf. shared/gardener.js) : comme la ronde du sergent, plus
 * la fiche de culture en cours (s restantes) qui la retient sur les pas japonais.
 */
export interface GardenerState extends PatrolState {
  help: number
}

/**
 * Ronde d'Ada, la cheffe de la base au sol (cf. shared/ground-base.js) : comme celle du sergent,
 * plus les réacteurs du Krait de la base (s restantes, et le pilote qui les a mis en route).
 */
export interface ChiefState extends PatrolState {
  burn: number
  pilot?: number
}

export interface CinemaTrailer { id: number; title: string; image: string; video: string }
export interface CinemaVideo { video: string; title: string; image: string }
/** Direct d'une chaîne Twitch : son login, son nom affiché, le titre du direct, un aperçu. */
export interface CinemaStream { channel: string; name: string; title: string; image: string; game?: string }
export interface CinemaState {
  trailers: CinemaTrailer[]
  live: boolean
  liveTitle: string
  selected: number | null
  youtube: CinemaVideo | null
  twitch: CinemaStream | null
  since: number
  operator: number | null
  now: number
}

export type BoardGameId = 'draughts' | 'guardian-connect' | 'imperial-chess'

export interface BoardPlayer {
  id: number
  name: string
  color: string
}

export interface BoardMove {
  from: [number, number]
  to: [number, number]
}

export interface BoardState {
  game: BoardGameId
  table: string
  players: BoardPlayer[]
  board: (string | null)[][]
  turn: string
  status: 'waiting' | 'playing' | 'ended'
  winner: string | null
  message: string
  continueAt: [number, number] | null
  legalMoves: BoardMove[]
}

export interface FightState {
  session: number
  players: { id: number; name: string; fighter: FighterId }[]
  status: 'waiting' | 'playing' | 'ended'
  rematch: number[]
  snapshot: FightSnapshot | null
}

/** Zone thargoïde (cf. server/salvage.js) : un des lobbys du sas (son numéro), vide, en formation ou en mission. */
export interface SalvageTeam {
  id: number
  leader: number | null
  parcels: number
  enemies: number
  status: 'forming' | 'countdown' | 'playing'
  startsIn?: number
  members: { id: number; name: string; verified: boolean; ready: boolean }[]
  delivered?: number
  alive?: number
}
export interface SalvageLobby { teams: SalvageTeam[] }
export interface SalvageStart {
  game: string
  seed: number
  team: number
  parcels: number
  enemies: number
  members: { id: number; name: string }[]
  spawn: { x: number; z: number }
  spawns: Record<string, { x: number; z: number }>
  /** Ticket de reconnexion (à soi seul) : il rend sa place après une déconnexion. */
  ticket: string
  status: SalvageStatus
  /** Retour dans une partie en cours, après une déconnexion. */
  resumed?: boolean
}
export type SalvageStatus = 'arriving' | 'alive' | 'captured' | 'left' | 'away' | 'gone'
export interface SalvageMember { id: number; status: SalvageStatus; carrying: number | null; hidden: number | null; left?: number; flares: number }
export interface SalvageState {
  game: string
  monsters: { id: number; x: number; z: number; yaw: number; mode: 'patrol' | 'investigate' | 'chase' | 'lured' | 'look' | 'search' | 'attack' }[]
  members: SalvageMember[]
  cargo: { id: number; state: 'ground' | 'carried' | 'delivered'; x: number; z: number }[]
  flares: number[]
  flare: { x: number; z: number; left: number } | null
  lockers: number[]
  searching: number[]
  delivered: number
  /** La ruche s'agite : 0 au départ, 1 quand il ne reste qu'un colis. */
  hive?: number
  elapsed: number
}
/** Événement d'une partie, pour les sons, les messages et les animations. */
export interface SalvageEvent {
  kind: 'arrive' | 'pickup' | 'drop' | 'deposit' | 'capture' | 'hide' | 'unhide' | 'eject' | 'search' | 'searched' | 'flare' | 'flare-out'
    | 'flare-pickup' | 'quit' | 'gone' | 'spotted' | 'heard' | 'away' | 'back' | 'hive'
  id?: number
  /** `hive` : l'agitation de la ruche (0 à 1). */
  level?: number
  /** `back` : l'ancien id du joueur revenu. */
  old?: number
  /** `away` : combien de temps sa place l'attend (s). */
  wait?: number
  monster?: number
  cargo?: number
  locker?: number
  flare?: number
  count?: number
  delivered?: number
  found?: boolean
  burn?: number
  x?: number
  z?: number
}
export interface SalvageEnd {
  game: string; won: boolean; reason: 'won' | 'lost' | 'timeout'; delivered: number; parcels: number; enemies: number; team: number; duration: number
  /** Note de la mission (cf. salvageGrade), temps de référence (s) et captures de l'équipe. */
  grade?: 'S' | 'A' | 'B' | 'C' | 'D'
  par?: number
  captures?: number
  /** Les chiffres de chaque membre. */
  stats?: SalvageMemberStats[]
  /** Partie finie pendant une déconnexion : le résultat, à qui revient avec son ticket. */
  late?: boolean
}
export interface SalvageMemberStats { id: number; name: string; delivered: number; spotted: number; flares: number; hides: number; captured: number }
export type SalvageAction = 'join' | 'leave' | 'settings' | 'ready' | 'pickup' | 'hide' | 'unhide' | 'flare' | 'quit' | 'resume'

/** L'arène (cf. server/arena.js) : un des lobbys du terminal (son numéro), vide, ses deux camps, ou sa partie en cours. */
export interface ArenaMember { id: number; name: string; verified: boolean; team: 0 | 1; character: CharacterId; ready: boolean }
export interface ArenaRoom {
  id: number
  leader: number | null
  /** Le plan de la partie, tiré au hasard à son lancement (cf. ARENA_MAPS) ; aucun au lobby. */
  map: ArenaMapId | null
  /** Joueurs par équipe ; `bots` : ils complètent les deux équipes, au niveau `skill` (0 à 2). */
  size: number
  bots: boolean
  skill: number
  /** Limite de points : la première équipe à l'atteindre gagne. */
  goal: number
  status: 'forming' | 'countdown' | 'playing'
  startsIn?: number
  members: ArenaMember[]
  /** En partie : les points de la manche en cours, et les manches gagnées par chaque équipe. */
  score?: [number, number]
  rounds?: [number, number]
  /** En partie : ceux qui la regardent. */
  watchers?: number
}
export interface ArenaLobby { rooms: ArenaRoom[] }
/** Un combattant de la partie, et le personnage qu'il joue (cf. ARENA_CHARACTERS). */
export interface ArenaFighter { id: number; name: string; team: 0 | 1; bot: boolean; character: CharacterId }
export interface ArenaStart {
  game: string
  map: ArenaMapId
  team: 0 | 1
  size: number
  /** Points à atteindre pour gagner une manche ; manches à gagner pour gagner la partie. */
  goal: number
  wins: number
  duration: number
  warmup: number
  fighters: ArenaFighter[]
  spawn: { x: number; z: number; yaw: number }
  /** On la regarde seulement (spectateur) : du côté de l'équipe 0, depuis le milieu de l'arène. */
  watch?: boolean
}
export interface ArenaFighterState {
  id: number; x: number; z: number; yaw: number; anim: string; hp: number; alive: boolean
  /** Protégé (il vient de revenir à sa base) ; `wait` : secondes avant son retour. */
  shield: boolean
  kills: number
  deaths: number
  wait: number
}
/**
 * Une fleur carnivore de Capucine, ou une flaque en feu de Jacques : où, de quel camp, et pour combien
 * de temps (s). Une fleur qui s'arme : sa proie (`aim`), et dans combien de temps elle mord (`strike`, s).
 */
export interface ArenaTrap { id: number; kind: 'flower' | 'fire'; team: 0 | 1; x: number; z: number; left: number; aim?: number; strike?: number }
export interface ArenaState { game: string; warmup: number; left: number; score: [number, number]; round: number; rounds: [number, number]; fighters: ArenaFighterState[]; traps: ArenaTrap[] }
export type ArenaEvent =
  /** `to`, `dur` : un objet lancé, où il retombe et en combien de temps. */
  | { kind: 'shot'; id: number; character: CharacterId; o: [number, number, number]; d: [number, number, number][]; to?: [number, number]; dur?: number }
  /** `trap` : la fleur qui a mordu, ou la flaque qui a brûlé. */
  | { kind: 'hit'; id: number; by: number; hp: number; dmg: number; x: number; y: number; z: number; trap?: number }
  /** Betty soigne un coéquipier. */
  | { kind: 'heal'; id: number; by: number; hp: number; amount: number; x: number; y: number; z: number }
  /** `from` : où il est tombé ; `x`, `z`, `yaw` : sa base, où il attend en fantôme de revenir en jeu. */
  | { kind: 'kill'; id: number; by: number; character: CharacterId; score: [number, number]; wait: number; from: { x: number; z: number }; x: number; z: number; yaw: number }
  | { kind: 'spawn'; id: number; x: number; z: number; yaw: number }
  | { kind: 'left'; id: number }
  /** Une manche se termine (`winner` : -1 à égalité) ; la suivante part dans `wait` secondes. */
  | { kind: 'round'; round: number; winner: number; reason: 'score' | 'time'; score: [number, number]; rounds: [number, number]; wait: number }
  | { kind: 'join'; fighter: ArenaFighter; x: number; z: number; yaw: number }
  /** Il change de chargeur (rien qu'un geste : le relais borne la cadence lui-même). */
  | { kind: 'reload'; id: number }
/**
 * La fiche de fin d'un combattant : éliminations, chutes, dégâts, soins ; ses projectiles tirés et
 * ceux qui ont porté (sa précision), sa meilleure série (absents d'un relais plus ancien).
 */
export interface ArenaStats extends ArenaFighter { kills: number; deaths: number; damage: number; heal: number; shots?: number; hits?: number; best?: number }
export interface ArenaEnd {
  game: string
  /** Équipe gagnante ; -1 : égalité. */
  winner: number
  reason: 'score' | 'time' | 'forfeit'
  /** Les points de la dernière manche, et les manches gagnées par chaque équipe. */
  score: [number, number]
  rounds: [number, number]
  goal: number
  duration: number
  stats: ArenaStats[]
}
export type ArenaAction = 'join' | 'leave' | 'side' | 'settings' | 'character' | 'ready' | 'fire' | 'reload' | 'quit' | 'watch' | 'unwatch' | 'debug' | 'stats'

/** Les statistiques d'un personnage, sur les parties des joueurs (cf. server/arena-stats.js, summarize). */
export interface ArenaCharacterSummary {
  picks: number
  /** Part des places qu'il occupe, et des parties décidées qu'il gagne (null : aucune). */
  pickRate: number
  winRate: number | null
  /** Éliminations et chutes par partie ; dégâts et soins par minute ; durée moyenne d'une vie (s). */
  kills: number
  deaths: number
  kd: number
  damage: number
  heals: number
  survival: number
  /** Part des projectiles qui ont porté, et distance moyenne de ses coups (tuiles). */
  accuracy: number | null
  range: number | null
  best: number
}
/** Les mêmes, par commande (souris, manette, doigt, tir rapide). */
export interface ArenaControlSummary { picks: number; winRate: number | null; kills: number; deaths: number; accuracy: number | null; shots: number }
export interface ArenaCharacterStats {
  games: number
  since: number
  characters: Partial<Record<CharacterId, ArenaCharacterSummary>>
  controls: Record<string, Partial<Record<CharacterId, ArenaControlSummary>>>
}

/** MESS RUSH (cf. server/mess-rush.js) : un salon du mess, et qui s'y trouve. */
export interface MessMember { id: number; name: string; verified: boolean; ready: boolean }
export interface MessTeam {
  id: number
  leader: number | null
  status: 'forming' | 'countdown' | 'playing'
  startsIn?: number
  members: MessMember[]
  /** En service : le score de l'équipe, et les secondes qui restent. */
  score?: number
  endsIn?: number
}
export interface MessLobby { teams: MessTeam[] }
/** Un membre d'un service (identifiant de joueur en texte, comme les clés de l'état). */
export interface MessCrew { id: string; name: string; status: 'arriving' | 'in' | 'away' | 'left' | 'gone' }
export interface MessStart { game: string; now: number; spawn: { x: number; z: number }; ticket: string; you: string; members: MessCrew[]; state: ServiceState; resumed?: boolean }
/** Ce qui se passe en cuisine : celui de la partie (cf. shared/mess-rush.js), et les allées et venues de l'équipe. */
export type MessEvent = ServiceEvent | { kind: 'left' | 'gone' | 'away' | 'back' | 'arrive'; by: string; old?: string; wait?: number }
export interface MessEnd {
  game: string
  reason: 'end' | 'abandoned'
  score: number
  medal?: Medal
  won?: boolean
  served: number
  expired: number
  bestCombo: number
  wasted: number
  players: number
  duration?: number
  members: MessCrew[]
  orders: { id: string; recipe: string; status: 'pending' | 'served' | 'expired'; points: number }[]
  /** Revenu après la fin : le résultat, en retard. */
  late?: boolean
  /** Le relais présente cette victoire au site pour ce joueur : sa réponse suit (`mess:reward`). */
  rewarding?: boolean
}
/**
 * La récompense d'une victoire (cf. docs/mess-rush-site.md) : en route (`pending`), confirmée par le
 * site (`success`), pas encore en service (`unavailable`), refusée (`refused`), ou sans réponse du
 * site après plusieurs tentatives (`failed`).
 */
export interface MessReward {
  game: string
  status: 'pending' | 'success' | 'unavailable' | 'refused' | 'failed'
  reward?: 'booster' | 'credits' | 'capped' | 'none'
  boosters?: number
  earned?: number
  balance?: number
  already?: boolean
  code?: string
}
export type MessAction = 'join' | 'leave' | 'ready' | 'resume' | 'use' | 'work' | 'stop' | 'quit'

export type ServerMessage =
  /** À la connexion : qui l'on est, qui est à bord, et le jukebox du pont principal. */
  | { t: 'welcome'; id: number; you: { name: string; verified: boolean; ljpc: boolean; voie: boolean; bar?: boolean; patreon?: boolean; welcome?: boolean }; players: PlayerState[]; homes?: { id: number; name: string }[]; music?: MusicState; hold?: MusicState; system?: SystemId; patrol?: PatrolState; chef?: ChefState; diners?: DinersState; nurse?: NurseState; mechanic?: MechanicState; gardener?: GardenerState; chief?: ChiefState; salvage?: SalvageLobby; arena?: ArenaLobby; mess?: MessLobby }
  | { t: 'join'; player: PlayerState }
  | { t: 'leave'; id: number }
  | { t: 'state'; id: number; x: number; z: number; yaw: number; level: number; anim: string; pose?: string; py?: number }
  | { t: 'chat'; id: number; name: string; verified?: boolean; text: string }
  | { t: 'emote'; id: number; emote: string }
  | { t: 'profile'; id: number; name: string; verified?: boolean; skin: string }
  /** Le joueur `id` nous chuchote un message : nous seuls le recevons. */
  | { t: 'whisper'; id: number; name: string; verified?: boolean; text: string }
  /** Le joueur `id` nous a écrit sur le site (cf. crew/site.ts) : nos messages sont à relire. */
  | { t: 'nudge'; id: number }
  /** Le joueur `id` sonne à la porte de nos quartiers : à nous de l'inviter. */
  | { t: 'ring'; id: number; name: string; verified?: boolean }
  /**
   * Aménagement des quartiers du joueur `id` (on s'y trouve, ou l'on vient d'y entrer) ; `name` :
   * ce sont ceux d'un CMDR absent (`id` : leur instance), que l'on visite sans lui.
   */
  | { t: 'cabin'; id: number; layout: unknown; name?: string }
  /** Le joueur `id` nous invite dans ses quartiers. */
  | { t: 'invite'; id: number; name: string; verified?: boolean }
  /** Le joueur `id` a décliné notre invitation. */
  | { t: 'decline'; id: number; name: string }
  /**
   * Le joueur `id` est désormais dans les quartiers de `cabin` (les siens s'il rentre) ; `by` :
   * raccompagné par l'hôte. `expired` : notre demande d'entrée est refusée (invitation expirée,
   * quartiers fermés), on reste dans `cabin`. `host` : ce sont les quartiers d'un CMDR absent,
   * voici son nom.
   */
  | { t: 'visit'; id: number; cabin: number; by?: number; expired?: boolean; host?: string }
  /** Le joueur `id` ouvre ses quartiers (on y entre sans invitation) ou les ferme. */
  | { t: 'open'; id: number; open: boolean }
  /**
   * Jukebox du pont principal ou des quartiers où l'on est ; `id` : qui l'a choisi (0 : le
   * relais, à l'arrivée) ; `busy` : notre choix est refusé (trop d'un coup), voici celui de tous.
   */
  | ({ t: 'music'; id: number; busy?: boolean; far?: boolean } & MusicState)
  /** Saut FSD lancé par le pilote `id` : tout le bord part vers `system`. */
  | { t: 'jump'; id: number; name: string; system: SystemId }
  /** Le joueur `id` parle au sergent : la ronde s'arrête pour tout le bord. */
  | ({ t: 'patrol'; id: number } & PatrolState)
  | ({ t: 'chef'; id: number } & ChefState)
  | ({ t: 'mechanic'; id: number } & MechanicState)
  | ({ t: 'gardener'; id: number } & GardenerState)
  | ({ t: 'chief'; id: number } & ChiefState)
  | ({ t: 'nurse'; id: number } & NurseState)
  | ({ t: 'board:state' } & BoardState)
  | ({ t: 'fight:state' } & FightState)
  | { t: 'fight:error'; code: 'full' | 'unavailable' | 'busy' }
  | ({ t: 'cinema:state' } & CinemaState)
  | { t: 'cinema:error'; reason: 'live' | 'seat' | 'invalid' | 'busy' | 'unavailable' }
  | { t: 'board:error'; game: string; table: string; code: 'full' | 'invalid' | 'busy' | 'unavailable' | 'far' }
  | ({ t: 'salvage:lobby' } & SalvageLobby)
  | ({ t: 'salvage:start' } & SalvageStart)
  | ({ t: 'salvage:state' } & SalvageState)
  | ({ t: 'salvage:event' } & SalvageEvent)
  | ({ t: 'salvage:end' } & SalvageEnd)
  /**
   * Gain d'une mission ; `refused` : pas payée (missions du jour déjà payées, mission trop rapide).
   * `boosters` : boosters de cartes du site gagnés (première victoire de la semaine) ; `badge` : le
   * badge de la zone vient d'être décerné sur le site.
   */
  | { t: 'salvage:reward'; game: string; earned: number; balance?: number; refused?: 'max' | 'early'; boosters?: number; badge?: boolean }
  | { t: 'salvage:error'; code: string }
  | ({ t: 'arena:lobby' } & ArenaLobby)
  | ({ t: 'arena:start' } & ArenaStart)
  | ({ t: 'arena:state' } & ArenaState)
  | ({ t: 'arena:event' } & ArenaEvent)
  | ({ t: 'arena:end' } & ArenaEnd)
  | { t: 'arena:error'; code: string }
  /** Après la fin : la partie du joueur est notée au classement, ou pourquoi pas (invité ; le site ne l'a pas prise). */
  | { t: 'arena:ranked'; game: string; ok: boolean; reason?: 'guest' | 'site' }
  /** Les statistiques des personnages (en réponse à `stats`), pour le classement. */
  | ({ t: 'arena:stats' } & ArenaCharacterStats)
  | ({ t: 'mess:lobby' } & MessLobby)
  | ({ t: 'mess:start' } & MessStart)
  /** L'état du service, quand il change (heure du relais : `now`). */
  | { t: 'mess:state'; game: string; now: number; state: ServiceState; members: MessCrew[] }
  | { t: 'mess:event'; game: string; events: MessEvent[] }
  | ({ t: 'mess:end' } & MessEnd)
  | ({ t: 'mess:reward' } & MessReward)
  /** Une action refusée par le relais : trop loin du poste (`far`), poste occupé (`busy`), rien à faire (`state`)… */
  | { t: 'mess:refused'; game: string; station: string; code: string }
  /** On a quitté le service (abandon, arrivée manquée) : retour au mess. */
  | { t: 'mess:left'; game: string }
  | { t: 'mess:error'; code: string }

/**
 * Réponse du relais à une invitation : partie, ou pourquoi pas (guest : on n'est pas CMDR,
 * gone : l'invité n'est plus à bord, here : il est déjà chez nous, busy : trop d'invitations).
 */
export type InviteReply = { ok: true } | { ok: false; reason: 'guest' | 'gone' | 'here' | 'busy' }
/** Réponse du relais à un chuchotement : parti, ou pourquoi pas (gone : il n'est plus à bord, busy : trop d'un coup). */
export type WhisperReply = { ok: true } | { ok: false; reason: 'gone' | 'busy' | 'empty' }

type LocalState = Omit<PlayerState, 'id' | 'name' | 'skin' | 'cabin' | 'open'>

/**
 * Serveur de dev : une latence simulée (`?lag=300`, en millisecondes, aller-retour), la moitié à
 * l'envoi, la moitié à la réception, pour essayer le jeu comme sur un mauvais réseau (cf. la matrice
 * des essais de l'arène, docs/arena-test-matrix.md). Les messages du jeu (positions, tirs, ce que dit
 * le relais) gardent leur ordre, la déconnexion comprise ; les requêtes qui attendent une réponse
 * (invitations, chuchotements, quartiers…) partent sans délai.
 */
const LAG = import.meta.env.DEV ? Math.min(5000, Math.max(0, Number(new URLSearchParams(location.search).get('lag')) || 0)) : 0

/** Chemin de la socket : le même que WS_PATH dans server/relay.js et que la conf nginx du site. */
const WS_PATH = import.meta.env.VITE_WS_PATH || '/ws/mini-shipinteriors'
const EVENTS: ServerMessage['t'][] = ['welcome', 'join', 'leave', 'state', 'chat', 'emote', 'profile', 'cabin', 'invite', 'decline', 'visit', 'open', 'whisper', 'nudge', 'ring', 'music', 'jump', 'patrol', 'chef', 'nurse', 'mechanic', 'gardener', 'chief', 'board:state', 'board:error', 'fight:state', 'fight:error', 'cinema:state', 'cinema:error',
  'salvage:lobby', 'salvage:start', 'salvage:state', 'salvage:event', 'salvage:end', 'salvage:reward', 'salvage:error',
  'arena:lobby', 'arena:start', 'arena:state', 'arena:event', 'arena:end', 'arena:error', 'arena:ranked', 'arena:stats',
  'mess:lobby', 'mess:start', 'mess:state', 'mess:event', 'mess:end', 'mess:reward', 'mess:refused', 'mess:left', 'mess:error']

export class Net {
  online = false
  onMessage?: (m: ServerMessage) => void
  onStatus?: (online: boolean) => void
  private socket?: Socket
  private last = ''
  private lastSent = 0
  private cabinTimer = 0
  private cabinSent = 0
  private cabinPending: unknown = null

  /** Identifiant attribué par le relais au joueur local. */
  id = -1

  /**
   * L'identité d'un CMDR ne passe pas par ici : le cookie du site accompagne la connexion et le
   * relais le fait reconnaître par le site.
   * @param devCmdr dev uniquement : nom de CMDR simulé (?cmdr=Nom)
   */
  constructor(
    private profile: { name: string; skin: string },
    private devCmdr?: string,
    private devLjpc = false,
    private devVoie = false,
    private devBar = false,
    private devPatreon = false,
  ) {}

  connect() {
    const socket = io({
      path: WS_PATH,
      // Relu à chaque (re)connexion : le relais reçoit le nom et l'apparence du moment.
      auth: (cb) => cb({ ...this.profile, cmdr: this.devCmdr, ljpc: this.devLjpc, voie: this.devVoie, bar: this.devBar, patreon: this.devPatreon }),
      // Délai croissant (hébergement statique sans relais : on insiste de moins en moins).
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,
    })
    this.socket = socket
    for (const t of EVENTS) {
      socket.on(t, (data: object) => {
        if (LAG) window.setTimeout(() => this.receive(t, data), LAG / 2)
        else this.receive(t, data)
      })
    }
    socket.on('disconnect', (reason) => {
      // Débarqué par le relais (une erreur en traitant l'un de nos messages, vaisseau plein) :
      // socket.io ne se reconnecte pas de lui-même, on y retourne un peu plus tard.
      if (reason === 'io server disconnect') setTimeout(() => !socket.connected && socket.connect(), 15000)
      // Après les messages reçus avant elle (la latence simulée les retient encore).
      const gone = () => {
        if (!this.online) return
        this.online = false
        this.onStatus?.(false)
      }
      if (LAG) window.setTimeout(gone, LAG / 2)
      else gone()
    })
    socket.on('connect_error', () => {
      // Refus du relais (vaisseau complet) : socket.io ne réessaie pas de lui-même.
      if (!socket.active) setTimeout(() => socket.connect(), 60000)
    })
  }

  /** Un message du relais (après la latence simulée, s'il y en a une). */
  private receive(t: ServerMessage['t'], data: object) {
    // Retenu par la latence simulée, il arrive après une déconnexion : il n'a plus cours.
    if (LAG && !this.socket?.connected) return
    const m = { ...data, t } as ServerMessage
    if (m.t === 'welcome') {
      this.id = m.id
      this.last = ''
      this.online = true
      this.onStatus?.(true)
    }
    this.onMessage?.(m)
  }

  private send(event: string, msg: object) {
    if (!this.online || !this.socket?.connected) return
    const socket = this.socket
    if (LAG) window.setTimeout(() => socket.connected && socket.emit(event, msg), LAG / 2)
    else socket.emit(event, msg)
  }

  /**
   * Envoie la position si elle a changé (10 Hz max), ou au moins toutes les 2 s.
   * `now = Infinity` force l'envoi (changement de pont).
   */
  sendState(s: LocalState, now: number) {
    const force = now === Infinity
    if (!force && now - this.lastSent < 100) return
    const round = (v: number) => Math.round(v * 100) / 100
    const msg = { x: round(s.x), z: round(s.z), yaw: round(s.yaw), level: s.level, anim: s.anim, ...(s.pose ? { pose: s.pose, py: round(s.py ?? 0) } : {}) }
    const key = JSON.stringify(msg)
    if (!force && key === this.last && now - this.lastSent < 2000) return
    this.last = key
    // Jamais Infinity ici : les envois suivants attendraient « 100 ms après l'infini », soit
    // plus aucune position après le premier trajet en ascenseur.
    this.lastSent = force ? performance.now() : now
    this.send('state', msg)
  }

  sendChat(text: string) {
    this.send('chat', { text })
  }

  sendEmote(emote: string) {
    this.send('emote', { emote })
  }

  /** Demande un saut FSD (installé dans le siège du pilote) : le relais choisit la destination. */
  sendJump() {
    this.send('jump', {})
  }

  /**
   * Au bout des conduits de ventilation, on soulève la grille du bar : le relais, qui nous y a
   * suivis, fait de nous un habitué de Chez Jacques (`badge` : 'new' si le site vient de décerner
   * le badge, 'had' s'il l'était déjà, null pour un invité). null : pas de réponse (hors ligne).
   */
  async ventsExit(): Promise<{ ok: boolean; badge?: 'new' | 'had' | null } | null> {
    if (!this.socket?.connected) return null
    try {
      return (await this.socket.timeout(10000).emitWithAck('vents:exit', {})) as { ok: boolean; badge?: 'new' | 'had' | null }
    } catch {
      return null
    }
  }

  /**
   * Nos quêtes terminées (cf. shared/quests.js) : elles ouvrent des pièces. Pour un CMDR, le relais
   * le redemande au site, qui fait foi ; il croit un invité, dont le journal reste dans son navigateur.
   */
  sendQuests(done: string[]) {
    this.send('quests', { done })
  }

  /** On parle au sergent : le relais arrête sa ronde pour tout le bord. */
  sendPatrolTalk() {
    this.send('patrol:talk', {})
  }

  /** On parle au chef : le relais arrête sa tournée pour tout le bord. */
  sendChefTalk() {
    this.send('chef:talk', {})
  }

  /** On parle à l'infirmière : le relais arrête sa tournée pour tout le bord. */
  sendNurseTalk() {
    this.send('nurse:talk', {})
  }

  /** On l'appelle depuis un lit (on), ou la consultation est finie (healed : menée à son terme). */
  sendNurseCare(on: boolean, healed = false) {
    this.send('nurse:care', { on, healed })
  }

  /** On parle au mécano : le relais arrête sa tournée pour tout le bord. */
  sendMechTalk() {
    this.send('mech:talk', {})
  }

  /** Aux commandes du Krait, on met les réacteurs en route (on) ou on les coupe : Nico panique, ou souffle. */
  sendKraitEngines(on: boolean) {
    this.send('krait:engines', { on })
  }

  /** On aide le mécano (une étape de plus de la révision), ou on a fini : il attend au nez du Krait, ou repart. */
  sendMechHelp(on: boolean) {
    this.send('mech:help', { on })
  }

  /** On parle à la jardinière : le relais arrête sa tournée pour tout le bord. */
  sendGardenTalk() {
    this.send('garden:talk', {})
  }

  /** On aide la jardinière (une étape de plus de la fiche), ou on a fini : elle attend sur les pas japonais, ou repart. */
  sendGardenHelp(on: boolean) {
    this.send('garden:help', { on })
  }

  /** On parle à la cheffe de la base : le relais arrête sa ronde pour tous. */
  sendChiefTalk() {
    this.send('chief:talk', {})
  }

  /** Aux commandes du Krait de la base, on met les réacteurs en route (on) ou on les coupe : tous les voient. */
  sendBaseEngines(on: boolean) {
    this.send('base:engines', { on })
  }

  sendCinemaChoice(id: number | null) {
    this.send('cinema:choose', { id })
  }

  sendCinemaVideo(video: string) {
    this.send('cinema:video', { video })
  }

  async searchCinema(query: string): Promise<{ videos: CinemaVideo[]; reason?: string }> {
    if (!this.online || !this.socket?.connected) return { videos: [], reason: 'unavailable' }
    try {
      return await this.socket.timeout(8500).emitWithAck('cinema:search', { query }) as { videos: CinemaVideo[]; reason?: string }
    } catch {
      return { videos: [], reason: 'unavailable' }
    }
  }

  sendCinemaStream(channel: string) {
    this.send('cinema:stream', { channel })
  }

  async searchCinemaStreams(query: string): Promise<{ streams: CinemaStream[]; reason?: string }> {
    if (!this.online || !this.socket?.connected) return { streams: [], reason: 'unavailable' }
    try {
      return await this.socket.timeout(8500).emitWithAck('cinema:streams', { query }) as { streams: CinemaStream[]; reason?: string }
    } catch {
      return { streams: [], reason: 'unavailable' }
    }
  }

  sendCinemaDuration(id: number | string, since: number, duration: number) {
    this.send('cinema:duration', { id, since, duration })
  }

  sendProfile(profile: { name: string; skin: string }) {
    this.profile = profile
    this.send('profile', profile)
  }

  /** Aménagement de ses quartiers, pour ses invités (4 envois par seconde au plus, le dernier gagne). */
  sendCabin(layout: unknown) {
    this.cabinPending = layout
    if (this.cabinTimer) return
    const wait = Math.max(0, 250 - (performance.now() - this.cabinSent))
    this.cabinTimer = window.setTimeout(() => {
      this.cabinTimer = 0
      this.cabinSent = performance.now()
      this.send('cabin', { layout: this.cabinPending })
    }, wait)
  }

  /** Invite `to` dans ses quartiers ; null : pas de réponse du relais (liaison perdue). */
  async sendInvite(to: number): Promise<InviteReply | null> {
    if (!this.online || !this.socket?.connected) return null
    try {
      return (await this.socket.timeout(5000).emitWithAck('invite', { to })) as InviteReply
    } catch {
      return null
    }
  }

  /** Sonne chez `to` (un CMDR à bord) ; null : pas de réponse du relais. Mêmes refus qu'une invitation (guest : il n'a pas de quartiers). */
  async sendRing(to: number): Promise<InviteReply | null> {
    if (!this.online || !this.socket?.connected) return null
    try {
      return (await this.socket.timeout(5000).emitWithAck('ring', { to })) as InviteReply
    } catch {
      return null
    }
  }

  /** Chuchote à `to` ; null : pas de réponse du relais (liaison perdue). */
  async sendWhisper(to: number, text: string): Promise<WhisperReply | null> {
    if (!this.online || !this.socket?.connected) return null
    try {
      return (await this.socket.timeout(5000).emitWithAck('whisper', { to, text })) as WhisperReply
    } catch {
      return null
    }
  }

  /** On vient d'écrire à `to` sur le site : il relira ses messages aussitôt. */
  sendNudge(to: number) {
    this.send('nudge', { to })
  }

  sendDecline(to: number) {
    this.send('decline', { to })
  }

  /** Entrer dans les quartiers de `host` (sur invitation), ou rentrer chez soi (null). */
  sendVisit(host: number | null) {
    this.send('visit', { host })
  }

  /** Entrer dans les quartiers ouverts d'un CMDR absent (`cmdr` : son identifiant dans l'annuaire du site). */
  sendVisitAbsent(cmdr: string) {
    this.send('visit', { cmdr })
  }

  /**
   * Choisit un morceau au jukebox du pont principal, de la cale ou des quartiers où l'on est (null : l'arrêter),
   * depuis son début ou `at` secondes plus loin. Avec `at`, c'est la musique de ses quartiers,
   * rendue au relais après une reconnexion : il ne vérifie pas qu'on est au jukebox.
   */
  sendMusic(where: JukeboxWhere, track: string | null, x: number, z: number, at?: number, options?: Pick<MusicState, 'song' | 'loop' | 'shuffle' | 'seed'>) {
    this.send('music', { where, track, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, ...(at !== undefined ? { at: Math.round(at * 100) / 100 } : {}), ...options })
  }

  sendFightJoin(fighter: FighterId) { this.send('fight:join', { fighter }) }
  sendFightLeave() { this.send('fight:leave', {}) }
  sendFightInput(session: number, held: string[], pressed: string[]) { this.send('fight:input', { session, held, pressed }) }
  sendFightRematch() { this.send('fight:rematch', {}) }

  sendBoardJoin(game: BoardGameId, table: string) {
    this.send('board:join', { game, table })
  }

  sendBoardMove(game: BoardGameId, table: string, move: object) {
    this.send('board:move', { game, table, move })
  }

  sendBoardLeave() {
    this.send('board:leave', {})
  }

  /** Raccompagner un visiteur de ses quartiers. */
  sendKick(id: number) {
    this.send('kick', { id })
  }

  /** Zone thargoïde : former son équipe au lobby, puis agir en mission (cf. server/salvage.js). */
  sendSalvage(action: SalvageAction, data: object = {}) {
    this.send(`salvage:${action}`, data)
  }

  /** L'arène : son lobby au terminal, puis ses tirs en partie (cf. server/arena.js). */
  sendArena(action: ArenaAction, data: object = {}) {
    this.send(`arena:${action}`, data)
  }

  /** MESS RUSH : son salon au rail des bons du mess, puis ses gestes en cuisine (cf. server/mess-rush.js). */
  sendMess(action: MessAction, data: object = {}) {
    this.send(`mess:${action}`, data)
  }
}
