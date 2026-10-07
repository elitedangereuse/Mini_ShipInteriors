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
export type SalvageAction = 'create' | 'join' | 'leave' | 'settings' | 'ready' | 'pickup' | 'hide' | 'unhide' | 'flare' | 'quit' | 'resume'

export type ServerMessage =
  /** À la connexion : qui l'on est, qui est à bord, et le jukebox du pont principal. */
  | { t: 'welcome'; id: number; you: { name: string; verified: boolean; ljpc: boolean; voie: boolean; bar?: boolean; welcome?: boolean }; players: PlayerState[]; homes?: { id: number; name: string }[]; music?: MusicState; hold?: MusicState; system?: SystemId; patrol?: PatrolState; chef?: ChefState; nurse?: NurseState; mechanic?: MechanicState; gardener?: GardenerState; chief?: ChiefState; salvage?: SalvageLobby }
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

/**
 * Réponse du relais à une invitation : partie, ou pourquoi pas (guest : on n'est pas CMDR,
 * gone : l'invité n'est plus à bord, here : il est déjà chez nous, busy : trop d'invitations).
 */
export type InviteReply = { ok: true } | { ok: false; reason: 'guest' | 'gone' | 'here' | 'busy' }
/** Réponse du relais à un chuchotement : parti, ou pourquoi pas (gone : il n'est plus à bord, busy : trop d'un coup). */
export type WhisperReply = { ok: true } | { ok: false; reason: 'gone' | 'busy' | 'empty' }

type LocalState = Omit<PlayerState, 'id' | 'name' | 'skin' | 'cabin' | 'open'>

/** Chemin de la socket : le même que WS_PATH dans server/relay.js et que la conf nginx du site. */
const WS_PATH = import.meta.env.VITE_WS_PATH || '/ws/mini-shipinteriors'
const EVENTS: ServerMessage['t'][] = ['welcome', 'join', 'leave', 'state', 'chat', 'emote', 'profile', 'cabin', 'invite', 'decline', 'visit', 'open', 'whisper', 'nudge', 'ring', 'music', 'jump', 'patrol', 'chef', 'nurse', 'mechanic', 'gardener', 'chief', 'board:state', 'board:error', 'fight:state', 'fight:error', 'cinema:state', 'cinema:error',
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
    private devBar = false,
  ) {}

  connect() {
    const socket = io({
      path: WS_PATH,
      // Relu à chaque (re)connexion : le relais reçoit le nom et l'apparence du moment.
      auth: (cb) => cb({ ...this.profile, cmdr: this.devCmdr, ljpc: this.devLjpc, voie: this.devVoie, bar: this.devBar }),
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

  /** On cuisine avec le chef (une étape de plus), ou on a fini : il attend à la passe, ou repart. */
  sendChefCook(on: boolean) {
    this.send('chef:cook', { on })
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
}
