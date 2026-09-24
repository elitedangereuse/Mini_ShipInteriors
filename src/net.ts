/** Client du relais multijoueur (server/relay.js). Sans serveur, le jeu reste en solo. */

export interface PlayerState {
  id: number
  name: string
  /** CMDR authentifié par elitedangereuse.fr (sinon : invité). */
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

export class Net {
  online = false
  onMessage?: (m: ServerMessage) => void
  onStatus?: (online: boolean) => void
  private ws?: WebSocket
  private last = ''
  private lastSent = 0
  private retry = 2000

  /** Identifiant attribué par le relais au joueur local. */
  id = -1

  /**
   * @param getTicket fournit un billet signé par elitedangereuse.fr (compte lié) ; appelé à
   *   chaque connexion, car un billet n'est valable que quelques minutes
   */
  constructor(
    private profile: { name: string; skin: string },
    private getTicket?: () => Promise<string | undefined>,
  ) {}

  connect() {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch {
      return
    }
    this.ws = ws
    ws.onopen = () => {
      this.retry = 2000
      this.last = ''
      void (async () => {
        const ticket = await this.getTicket?.().catch(() => undefined)
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'hello', ...this.profile, ticket }))
      })()
    }
    ws.onmessage = (e) => {
      let m: ServerMessage
      try {
        m = JSON.parse(e.data)
      } catch {
        return
      }
      if (m.t === 'welcome') {
        this.id = m.id
        this.online = true
        this.onStatus?.(true)
      }
      this.onMessage?.(m)
    }
    ws.onclose = () => {
      if (this.online) {
        this.online = false
        this.onStatus?.(false)
      }
      // Reconnexion avec délai croissant (hébergement statique : on abandonne vite).
      setTimeout(() => this.connect(), this.retry)
      this.retry = Math.min(this.retry * 2, 60000)
    }
  }

  private send(msg: object) {
    if (this.online && this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  /** Envoie la position si elle a changé (10 Hz max), ou au moins toutes les 2 s. */
  sendState(s: LocalState, now: number) {
    if (now - this.lastSent < 100) return
    const round = (v: number) => Math.round(v * 100) / 100
    const msg = { t: 'state', x: round(s.x), z: round(s.z), yaw: round(s.yaw), level: s.level, anim: s.anim }
    const key = JSON.stringify(msg)
    if (key === this.last && now - this.lastSent < 2000) return
    this.last = key
    this.lastSent = now
    this.send(msg)
  }

  sendChat(text: string) {
    this.send({ t: 'chat', text })
  }

  sendEmote(emote: string) {
    this.send({ t: 'emote', emote })
  }

  sendProfile(profile: { name: string; skin: string }) {
    this.profile = profile
    this.send({ t: 'profile', ...profile })
  }
}
