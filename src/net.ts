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

export type ServerMessage =
  | { t: 'welcome'; id: number; you: { name: string; verified: boolean }; players: PlayerState[] }
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
 * Réponse du relais à une invitation : partie, ou pourquoi pas (guest : on n'est pas CMDR,
 * gone : l'invité n'est plus à bord, here : il est déjà chez nous, busy : trop d'invitations).
 */
export type InviteReply = { ok: true } | { ok: false; reason: 'guest' | 'gone' | 'here' | 'busy' }

type LocalState = Omit<PlayerState, 'id' | 'name' | 'skin' | 'cabin'>

/** Chemin de la socket : le même que WS_PATH dans server/relay.js et que la conf nginx du site. */
const WS_PATH = import.meta.env.VITE_WS_PATH || '/ws/mini-shipinteriors'
const EVENTS: ServerMessage['t'][] = ['welcome', 'join', 'leave', 'state', 'chat', 'emote', 'profile', 'cabin', 'invite', 'decline', 'visit']

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
  ) {}

  connect() {
    const socket = io({
      path: WS_PATH,
      // Relu à chaque (re)connexion : le relais reçoit le nom et l'apparence du moment.
      auth: (cb) => cb({ ...this.profile, cmdr: this.devCmdr }),
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

  /** Raccompagner un visiteur de ses quartiers. */
  sendKick(id: number) {
    this.send('kick', { id })
  }
}
