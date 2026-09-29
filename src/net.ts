import type { FighterId } from '../shared/fight-roster.js'
import type { FightSnapshot } from '../shared/fight.js'
import type { SystemId } from '../shared/systems.js'
/** Client du relais multijoueur (server/relay.js, socket.io). Sans serveur, le jeu reste en solo. */
import { io, type Socket } from 'socket.io-client'

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

export interface CinemaTrailer { id: number; title: string; image: string; video: string }
export interface CinemaVideo { video: string; title: string; image: string }
export interface CinemaState {
  trailers: CinemaTrailer[]
  live: boolean
  liveTitle: string
  selected: number | null
  youtube: CinemaVideo | null
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

/** Zone thargoïde (cf. server/salvage.js) : une équipe du lobby, ou en mission. */
export interface SalvageTeam {
  id: number
  leader: number
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
}
export type SalvageStatus = 'arriving' | 'alive' | 'captured' | 'left' | 'gone'
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
  elapsed: number
}
/** Événement d'une partie, pour les sons, les messages et les animations. */
export interface SalvageEvent {
  kind: 'arrive' | 'pickup' | 'drop' | 'deposit' | 'capture' | 'hide' | 'unhide' | 'eject' | 'search' | 'searched' | 'flare' | 'flare-out'
    | 'flare-pickup' | 'quit' | 'gone' | 'spotted' | 'heard'
  id?: number
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
export interface SalvageEnd { game: string; won: boolean; reason: 'won' | 'lost' | 'timeout'; delivered: number; parcels: number; enemies: number; team: number; duration: number }
export type SalvageAction = 'create' | 'join' | 'leave' | 'settings' | 'ready' | 'pickup' | 'hide' | 'unhide' | 'flare' | 'quit'

export type ServerMessage =
  /** À la connexion : qui l'on est, qui est à bord, et le jukebox du pont principal. */
  | { t: 'welcome'; id: number; you: { name: string; verified: boolean; ljpc: boolean; voie: boolean }; players: PlayerState[]; music?: MusicState; hold?: MusicState; system?: SystemId; patrol?: PatrolState; salvage?: SalvageLobby }
  | { t: 'join'; player: PlayerState }
  | { t: 'leave'; id: number }
  | { t: 'state'; id: number; x: number; z: number; yaw: number; level: number; anim: string; pose?: string; py?: number }
  | { t: 'chat'; id: number; name: string; verified?: boolean; text: string }
  | { t: 'emote'; id: number; emote: string }
  | { t: 'profile'; id: number; name: string; verified?: boolean; skin: string }
  /** Aménagement des quartiers du joueur `id` (on s'y trouve, ou l'on vient d'y entrer). */
  | { t: 'cabin'; id: number; layout: unknown }
  /** Le joueur `id` nous invite dans ses quartiers. */
  | { t: 'invite'; id: number; name: string; verified?: boolean }
  /** Le joueur `id` a décliné notre invitation. */
  | { t: 'decline'; id: number; name: string }
  /**
   * Le joueur `id` est désormais dans les quartiers de `cabin` (les siens s'il rentre) ; `by` :
   * raccompagné par l'hôte. `expired` : notre demande d'entrée est refusée (invitation expirée),
   * on reste dans `cabin`.
   */
  | { t: 'visit'; id: number; cabin: number; by?: number; expired?: boolean }
  /**
   * Jukebox du pont principal ou des quartiers où l'on est ; `id` : qui l'a choisi (0 : le
   * relais, à l'arrivée) ; `busy` : notre choix est refusé (trop d'un coup), voici celui de tous.
   */
  | ({ t: 'music'; id: number; busy?: boolean; far?: boolean } & MusicState)
  /** Saut FSD lancé par le pilote `id` : tout le bord part vers `system`. */
  | { t: 'jump'; id: number; name: string; system: SystemId }
  /** Le joueur `id` parle au sergent : la ronde s'arrête pour tout le bord. */
  | ({ t: 'patrol'; id: number } & PatrolState)
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
  | { t: 'salvage:reward'; game: string; earned: number; balance: number }
  | { t: 'salvage:error'; code: string }

/**
 * Réponse du relais à une invitation : partie, ou pourquoi pas (guest : on n'est pas CMDR,
 * gone : l'invité n'est plus à bord, here : il est déjà chez nous, busy : trop d'invitations).
 */
export type InviteReply = { ok: true } | { ok: false; reason: 'guest' | 'gone' | 'here' | 'busy' }

type LocalState = Omit<PlayerState, 'id' | 'name' | 'skin' | 'cabin'>

/** Chemin de la socket : le même que WS_PATH dans server/relay.js et que la conf nginx du site. */
const WS_PATH = import.meta.env.VITE_WS_PATH || '/ws/mini-shipinteriors'
const EVENTS: ServerMessage['t'][] = ['welcome', 'join', 'leave', 'state', 'chat', 'emote', 'profile', 'cabin', 'invite', 'decline', 'visit', 'music', 'jump', 'patrol', 'board:state', 'board:error', 'fight:state', 'fight:error', 'cinema:state', 'cinema:error',
  'salvage:lobby', 'salvage:start', 'salvage:state', 'salvage:event', 'salvage:end', 'salvage:reward', 'salvage:error']

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
  ) {}

  connect() {
    const socket = io({
      path: WS_PATH,
      // Relu à chaque (re)connexion : le relais reçoit le nom et l'apparence du moment.
      auth: (cb) => cb({ ...this.profile, cmdr: this.devCmdr, ljpc: this.devLjpc, voie: this.devVoie }),
      // Délai croissant (hébergement statique sans relais : on insiste de moins en moins).
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,
    })
    this.socket = socket
    for (const t of EVENTS) {
      socket.on(t, (data: object) => {
        const m = { ...data, t } as ServerMessage
        if (m.t === 'welcome') {
          this.id = m.id
          this.last = ''
          this.online = true
          this.onStatus?.(true)
        }
        this.onMessage?.(m)
      })
    }
    socket.on('disconnect', () => {
      if (!this.online) return
      this.online = false
      this.onStatus?.(false)
    })
    socket.on('connect_error', () => {
      // Refus du relais (vaisseau complet) : socket.io ne réessaie pas de lui-même.
      if (!socket.active) setTimeout(() => socket.connect(), 60000)
    })
  }

  private send(event: string, msg: object) {
    if (this.online && this.socket?.connected) this.socket.emit(event, msg)
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

  /** On parle au sergent : le relais arrête sa ronde pour tout le bord. */
  sendPatrolTalk() {
    this.send('patrol:talk', {})
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

  sendDecline(to: number) {
    this.send('decline', { to })
  }

  /** Entrer dans les quartiers de `host` (sur invitation), ou rentrer chez soi (null). */
  sendVisit(host: number | null) {
    this.send('visit', { host })
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
}
