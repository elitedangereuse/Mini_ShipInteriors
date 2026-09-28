import * as THREE from 'three'
import { tr } from './i18n'
import { icon } from './icons'
import { CINEMA_SCREEN, setProjection } from './furniture/cinema'
import type { CinemaState, CinemaTrailer } from './net'

const ENDPOINT = '/outils/mini-shipinteriors-cinema.php'

interface YouTubePlayer {
  destroy(): void
  getCurrentTime(): number
  getDuration(): number
  seekTo(seconds: number, allowSeekAhead: boolean): void
  playVideo(): void
  pauseVideo(): void
  mute(): void
  unMute(): void
}
interface YouTubeApi {
  Player: new (holder: HTMLElement, options: { videoId: string; playerVars: Record<string, string | number>; events: {
    onReady: (event: { target: YouTubePlayer }) => void
    onStateChange: (event: { data: number }) => void
  } }) => YouTubePlayer
}
interface TwitchPlayer {
  addEventListener(event: string, listener: () => void): void
  setMuted(muted: boolean): void
  play(): void
  pause(): void
}
interface TwitchApi {
  Player: { new (holderId: string, options: { width: number; height: number; channel: string; parent: string[]; muted: boolean; autoplay: boolean }): TwitchPlayer; READY: string }
}
declare global {
  interface Window { YT?: YouTubeApi; Twitch?: TwitchApi; onYouTubeIframeAPIReady?: () => void }
}
let youtubeApiPromise: Promise<YouTubeApi> | null = null
function youtubeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  youtubeApiPromise ??= new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(window.YT!) }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.onerror = () => { youtubeApiPromise = null; reject(new Error('YouTube API unavailable')) }
    document.head.append(script)
  })
  return youtubeApiPromise
}
let twitchApiPromise: Promise<TwitchApi> | null = null
function twitchApi(): Promise<TwitchApi> {
  if (window.Twitch?.Player) return Promise.resolve(window.Twitch)
  twitchApiPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://player.twitch.tv/js/embed/v1.js'
    script.onload = () => window.Twitch?.Player ? resolve(window.Twitch) : reject(new Error('Twitch API unavailable'))
    script.onerror = () => { twitchApiPromise = null; reject(new Error('Twitch API unavailable')) }
    document.head.append(script)
  })
  return twitchApiPromise
}

/** Régie et lecteur partagés : seul le fauteuil bleu peut changer la séance. */
export class CinemaRoom {
  private root = document.createElement('section')
  private shell = document.createElement('div')
  private title = document.createElement('h2')
  private status = document.createElement('p')
  private cards = document.createElement('div')
  private stage = document.createElement('div')
  private frame = document.createElement('iframe')
  private soundButton = document.createElement('button')
  private soundOn = false
  private onCinemaDeck = false
  private inCinemaRoom = false
  private readonly topLeft = new THREE.Vector3()
  private readonly topRight = new THREE.Vector3()
  private readonly bottomLeft = new THREE.Vector3()
  private youtubePlayer: YouTubePlayer | null = null
  private twitchPlayer: TwitchPlayer | null = null
  private playerToken = 0
  private closeButton = document.createElement('button')
  private previousFocus: HTMLElement | null = null
  private controller = false
  private playing = ''
  private catalogKey = ''
  private state: CinemaState = { trailers: [], live: false, liveTitle: '', selected: null, since: 0, operator: null, now: Date.now() }
  private receivedAt = performance.now()

  constructor(
    private network: { online: () => boolean; self: () => number; choose: (id: number | null) => void; duration: (id: number, since: number, duration: number) => void },
  ) {
    this.root.className = 'cinema-room-overlay'
    this.root.hidden = true
    this.root.setAttribute('role', 'dialog')
    this.root.setAttribute('aria-modal', 'true')
    this.shell.className = 'cinema-room-shell'
    const header = document.createElement('header')
    header.className = 'cinema-room-header'
    const heading = document.createElement('div')
    const kicker = document.createElement('small')
    kicker.textContent = tr('PONT SUPÉRIEUR · CINÉMA', 'UPPER DECK · CINEMA')
    heading.append(kicker, this.title, this.status)
    this.closeButton.type = 'button'
    this.closeButton.textContent = tr('Fermer ×', 'Close ×')
    this.closeButton.onclick = () => this.close()
    header.append(heading, this.closeButton)
    const body = document.createElement('div')
    body.className = 'cinema-room-body'
    this.cards.className = 'cinema-room-cards'
    this.stage.className = 'cinema-room-stage'
    this.frame.title = tr('Projection commune', 'Shared screening')
    this.frame.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media')
    this.frame.setAttribute('allowfullscreen', '')
    body.append(this.cards)
    this.shell.append(header, body)
    this.root.append(this.shell)
    this.stage.setAttribute('aria-label', tr('Écran du cinéma', 'Cinema screen'))
    this.soundButton.type = 'button'
    this.soundButton.className = 'cinema-screen-sound'
    this.soundButton.onclick = () => {
      this.soundOn = !this.soundOn
      this.applySound()
      this.updateSoundButton()
    }
    this.updateSoundButton()
    document.body.append(this.stage, this.soundButton, this.root)
    this.stage.hidden = true
    this.soundButton.hidden = true
    this.root.addEventListener('click', (event) => { if (event.target === this.root) this.close() })
    this.root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); this.close() }
      event.stopPropagation()
    })
    // Hors relais, le même catalogue reste disponible pour une séance solo.
    setInterval(() => { if (!this.network.online()) void this.refreshSolo() }, 30000)
    setInterval(() => this.syncYouTube(), 5000)
  }

  get isOpen() { return !this.root.hidden }
  get isController() { return this.isOpen && this.controller }

  private updateSoundButton() {
    const label = this.soundOn ? tr('Couper le son du cinéma', 'Mute cinema audio') : tr('Activer le son du cinéma', 'Enable cinema audio')
    this.soundButton.replaceChildren(icon(this.soundOn ? 'speaker-high' : 'speaker-slash'))
    this.soundButton.title = label
    this.soundButton.setAttribute('aria-label', label)
    this.soundButton.setAttribute('aria-pressed', String(this.soundOn))
  }

  private applySound() {
    const audible = this.soundOn && this.inCinemaRoom
    try {
      if (audible) this.youtubePlayer?.unMute()
      else this.youtubePlayer?.mute()
      this.twitchPlayer?.setMuted(!audible)
    } catch { /* Un lecteur externe peut être en cours de chargement. */ }
  }

  receive(state: CinemaState) {
    this.state = state
    this.receivedAt = performance.now()
    const current = state.trailers.find((t) => t.id === state.selected)
    setProjection(state.live ? 'twitch' : current ? 'trailer' : null,
      state.live ? (state.liveTitle || 'Élite Dangereuse') : current?.title ?? '', current?.image ?? '')
    this.renderScreen()
    if (this.isOpen) this.renderControls()
  }

  async open(controller: boolean) {
    if (!controller) {
      if (!this.network.online()) await this.refreshSolo()
      return
    }
    if (!this.isOpen) {
      this.previousFocus = document.activeElement as HTMLElement
    }
    this.controller = controller
    this.root.hidden = false
    this.renderControls()
    this.closeButton.focus()
    if (!this.network.online()) await this.refreshSolo()
  }

  private async refreshSolo() {
    try {
      const response = await fetch(ENDPOINT, { signal: AbortSignal.timeout(5000), headers: { Accept: 'application/json' } })
      const data = await response.json()
      if (data.status !== 'success' || !Array.isArray(data.trailers)) return
      const live = data.live === true
      this.receive({ ...this.state, trailers: data.trailers, live, liveTitle: data.liveTitle ?? '',
        selected: live ? null : this.state.selected, operator: this.controller ? this.network.self() : null, now: Date.now() })
    } catch { /* Le faux film reste disponible sans le site. */ }
  }

  private choose(id: number | null) {
    if (!this.controller || this.state.live) return
    if (this.network.online()) this.network.choose(id)
    else this.receive({ ...this.state, selected: id, since: id === null ? 0 : Date.now(), now: Date.now() })
  }

  error(reason: string) {
    this.status.textContent = reason === 'live'
      ? tr('Le direct Twitch a commencé : les trailers sont suspendus.', 'Twitch is live: trailers are paused.')
      : reason === 'busy' ? tr('Un instant entre deux changements de séance.', 'Wait a moment between screenings.')
      : tr('Installez-vous dans le fauteuil de régie pour choisir.', 'Sit in the projection chair to choose.')
  }

  private renderCards() {
    const key = JSON.stringify(this.state.trailers)
    if (key !== this.catalogKey) {
      this.catalogKey = key
      this.cards.replaceChildren()
      const stop = document.createElement('button')
      stop.type = 'button'
      stop.className = 'cinema-room-card cinema-room-stop'
      stop.textContent = tr('Arrêter la projection', 'Stop screening')
      stop.onclick = () => this.choose(null)
      this.cards.append(stop)
      for (const trailer of this.state.trailers) this.cards.append(this.card(trailer))
    }
    for (const button of this.cards.querySelectorAll<HTMLButtonElement>('.cinema-room-card')) {
      button.disabled = this.state.live || (this.network.online() && this.state.operator !== this.network.self())
      button.setAttribute('aria-pressed', (button.dataset.id ? Number(button.dataset.id) === this.state.selected : this.state.selected === null) ? 'true' : 'false')
    }
  }

  private card(trailer: CinemaTrailer): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'cinema-room-card'
    button.dataset.id = String(trailer.id)
    const image = document.createElement('img')
    image.src = trailer.image
    image.alt = ''
    image.loading = 'lazy'
    const title = document.createElement('strong')
    title.textContent = trailer.title
    button.append(image, title)
    button.onclick = () => this.choose(trailer.id)
    return button
  }

  private renderControls() {
    this.shell.classList.toggle('cinema-room-control', this.controller)
    this.cards.hidden = !this.controller || this.state.live
    if (this.controller) this.renderCards()
    const current = this.state.trailers.find((t) => t.id === this.state.selected)
    this.title.textContent = this.controller ? tr('Régie de projection', 'Projection booth') : tr('Séance en cours', 'Now showing')
    this.status.textContent = this.state.live
      ? tr('🔴 Direct Twitch · la sélection des trailers est suspendue.', '🔴 Twitch live · trailer selection is paused.')
      : current ? current.title : tr('La salle attend une séance.', 'Waiting for a screening.')
  }

  private renderScreen() {
    const current = this.state.trailers.find((t) => t.id === this.state.selected)
    const key = this.state.live ? 'twitch' : current ? `trailer:${current.id}:${this.state.since}` : 'none'
    if (key === this.playing) return
    this.playing = key
    this.playerToken++
    this.youtubePlayer?.destroy()
    this.youtubePlayer = null
    try { this.twitchPlayer?.setMuted(true); this.twitchPlayer?.pause() } catch { /* Le lecteur se ferme. */ }
    this.twitchPlayer = null
    this.frame.removeAttribute('src')
    this.frame.remove()
    if (key === 'none') {
      this.stage.replaceChildren()
      this.stage.hidden = true
      this.soundButton.hidden = true
      return
    }
    if (this.state.live) {
      const token = this.playerToken
      const holder = document.createElement('div')
      holder.className = 'cinema-room-twitch'
      holder.id = 'cinema-twitch-player'
      this.stage.replaceChildren(holder)
      void twitchApi().then((api) => {
        if (token !== this.playerToken) return
        const player = new api.Player(holder.id, {
          width: 533, height: 300, channel: 'elitedangereuse',
          parent: [location.hostname || 'elitedangereuse.fr'], muted: true, autoplay: true,
        })
        this.twitchPlayer = player
        player.addEventListener(api.Player.READY, () => {
          if (token !== this.playerToken) return
          this.applySound()
          if (!this.onCinemaDeck) player.pause()
        })
      }).catch(() => {
        if (token !== this.playerToken) return
        this.frame.src = this.twitchSource()
        this.stage.replaceChildren(this.frame)
      })
    } else if (current) {
      const token = this.playerToken
      const holder = document.createElement('div')
      holder.className = 'cinema-room-youtube'
      this.stage.replaceChildren(holder)
      void youtubeApi().then((api) => {
        if (token !== this.playerToken) return
        this.youtubePlayer = new api.Player(holder, {
          videoId: current.video,
          playerVars: { autoplay: 1, controls: 1, playsinline: 1, origin: location.origin },
          events: { onReady: ({ target }) => {
            if (token !== this.playerToken) return
            if (this.onCinemaDeck) {
              this.applySound()
              this.syncYouTube(true)
            } else {
              target.mute()
              target.pauseVideo()
            }
          }, onStateChange: ({ data }) => { if (data === 0) this.finishTrailer() } },
        })
      }).catch(() => {
        if (token !== this.playerToken) return
        // Si l'API est bloquée, le lecteur standard garde la séance accessible.
        this.frame.src = this.youtubeSource(current.video)
        this.stage.replaceChildren(this.frame)
      })
    }
  }

  private youtubeSource(video: string) {
    const elapsed = Math.max(0, Math.floor((this.state.now - this.state.since + performance.now() - this.receivedAt) / 1000))
    return `https://www.youtube.com/embed/${video}?autoplay=1&mute=1&start=${elapsed}`
  }

  private twitchSource() {
    const parent = location.hostname || 'elitedangereuse.fr'
    return `https://player.twitch.tv/?channel=elitedangereuse&parent=${encodeURIComponent(parent)}&muted=true&autoplay=true`
  }

  /** Aligne le lecteur HTML sur la toile 3D de la salle, même pendant les mouvements de caméra. */
  placeScreen(camera: THREE.Camera, onCinemaDeck: boolean, inCinemaRoom: boolean, x: number, y: number, z: number) {
    if (onCinemaDeck !== this.onCinemaDeck) {
      this.onCinemaDeck = onCinemaDeck
      if (onCinemaDeck) {
        if (this.state.live) {
          if (this.twitchPlayer) {
            try { this.twitchPlayer.play() } catch { /* Le lecteur charge. */ }
          }
          else if (this.frame.isConnected) this.frame.src = this.twitchSource()
        } else if (this.frame.isConnected) {
          const current = this.state.trailers.find((t) => t.id === this.state.selected)
          if (current) this.frame.src = this.youtubeSource(current.video)
        }
        this.syncYouTube(true)
      } else {
        if (this.state.live) {
          try { this.twitchPlayer?.pause() } catch { /* Le lecteur charge. */ }
        }
        this.frame.removeAttribute('src')
        this.youtubePlayer?.mute()
        this.youtubePlayer?.pauseVideo()
      }
    }
    if (inCinemaRoom !== this.inCinemaRoom) {
      this.inCinemaRoom = inCinemaRoom
      this.applySound()
      // Le lecteur simple de secours n'a pas d'API de volume : le recharger muet en sortant.
      if (!inCinemaRoom && onCinemaDeck && this.frame.isConnected) {
        const current = this.state.trailers.find((t) => t.id === this.state.selected)
        this.frame.src = this.state.live ? this.twitchSource() : current ? this.youtubeSource(current.video) : ''
      }
    }
    if (this.playing === 'none' || !this.playing || !onCinemaDeck) {
      this.stage.hidden = true
      this.soundButton.hidden = true
      return
    }
    const { width, height, centerY, depth } = CINEMA_SCREEN
    const screenZ = z + depth
    if (camera.position.z <= screenZ) {
      this.stage.hidden = true
      this.soundButton.hidden = true
      return
    }
    const point = (v: THREE.Vector3) => ({ x: (v.x + 1) * innerWidth / 2, y: (1 - v.y) * innerHeight / 2 })
    const a = point(this.topLeft.set(x - width / 2, y + centerY + height / 2, screenZ).project(camera))
    const b = point(this.topRight.set(x + width / 2, y + centerY + height / 2, screenZ).project(camera))
    const c = point(this.bottomLeft.set(x - width / 2, y + centerY - height / 2, screenZ).project(camera))
    const w = Math.hypot(b.x - a.x, b.y - a.y)
    const h = Math.hypot(c.x - a.x, c.y - a.y)
    if (w < 30 || h < 12 || Math.max(a.x, b.x, c.x) < 0 || Math.min(a.x, b.x, c.x) > innerWidth
      || Math.max(a.y, b.y, c.y) < 0 || Math.min(a.y, b.y, c.y) > innerHeight) {
      this.stage.hidden = true
      this.soundButton.hidden = true
      return
    }
    this.stage.hidden = false
    this.stage.style.pointerEvents = inCinemaRoom ? 'auto' : 'none'
    this.stage.style.transform = `matrix(${(b.x - a.x) / 640}, ${(b.y - a.y) / 640}, ${(c.x - a.x) / 256}, ${(c.y - a.y) / 256}, ${a.x}, ${a.y})`
    this.soundButton.hidden = !inCinemaRoom || (this.state.live ? !this.twitchPlayer : !this.youtubePlayer)
    this.soundButton.style.left = `${c.x + (b.x - a.x) / 2}px`
    this.soundButton.style.top = `${c.y + (b.y - a.y) / 2 + 8}px`
  }

  private syncYouTube(force = false) {
    const player = this.youtubePlayer
    if (!player || !this.onCinemaDeck || this.state.live || this.state.selected === null) return
    try {
      const elapsed = Math.max(0, (this.state.now - this.state.since + performance.now() - this.receivedAt) / 1000)
      const duration = player.getDuration()
      this.reportTrailerDuration(duration)
      if (duration > 0 && elapsed >= duration) {
        this.finishTrailer()
        return
      }
      const target = elapsed
      if (force || Math.abs(player.getCurrentTime() - target) > 2.5) player.seekTo(target, true)
      player.playVideo()
    } catch { /* Le player n'est pas encore prêt. */ }
  }

  private reportTrailerDuration(duration: number) {
    const { selected, since } = this.state
    if (!this.network.online() || !this.onCinemaDeck || selected === null || !Number.isFinite(duration) || duration < 5) return
    this.network.duration(selected, since, duration)
  }

  private finishTrailer() {
    if (this.state.selected === null || this.state.live) return
    this.youtubePlayer?.pauseVideo()
    if (this.network.online()) this.reportTrailerDuration(this.youtubePlayer?.getDuration() ?? 0)
    else this.receive({ ...this.state, selected: null, since: 0, now: Date.now() })
  }

  close() {
    if (!this.isOpen) return
    this.root.hidden = true
    this.previousFocus?.focus()
  }
}
