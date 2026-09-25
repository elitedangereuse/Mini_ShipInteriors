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
}

export type ServerMessage =
  | { t: 'welcome'; id: number; you: { name: string; verified: boolean }; players: PlayerState[] }
  | { t: 'join'; player: PlayerState }
  | { t: 'leave'; id: number }
  | { t: 'state'; id: number; x: number; z: number; yaw: number; level: number; anim: string }
  | { t: 'chat'; id: number; name: string; verified?: boolean; text: string }
  | { t: 'emote'; id: number; emote: string }
  | { t: 'profile'; id: number; name: string; verified?: boolean; skin: string }

type LocalState = Omit<PlayerState, 'id' | 'name' | 'skin'>

/** Chemin de la socket : le même que WS_PATH dans server/relay.js et que la conf nginx du site. */
const WS_PATH = import.meta.env.VITE_WS_PATH || '/ws/mini-shipinteriors'
const EVENTS: ServerMessage['t'][] = ['welcome', 'join', 'leave', 'state', 'chat', 'emote', 'profile']

export class Net {
  online = false
  onMessage?: (m: ServerMessage) => void
  onStatus?: (online: boolean) => void
  private socket?: Socket
  private last = ''
  private lastSent = 0

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
    const msg = { x: round(s.x), z: round(s.z), yaw: round(s.yaw), level: s.level, anim: s.anim }
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
}
