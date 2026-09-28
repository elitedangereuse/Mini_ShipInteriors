import { tr } from './i18n'
import { setProjection } from './furniture/cinema'
import type { CinemaState, CinemaTrailer } from './net'

const ENDPOINT = '/outils/mini-shipinteriors-cinema.php'

interface YouTubePlayer {
  destroy(): void
  getCurrentTime(): number
  getDuration(): number
  seekTo(seconds: number, allowSeekAhead: boolean): void
  playVideo(): void
  mute(): void
}
interface YouTubeApi {
  Player: new (holder: HTMLElement, options: { videoId: string; playerVars: Record<string, string | number>; events: { onReady: (event: { target: YouTubePlayer }) => void } }) => YouTubePlayer
}
declare global {
  interface Window { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void }
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

/** Régie et lecteur partagés : seul le fauteuil bleu peut changer la séance. */
export class CinemaRoom {
  private root = document.createElement('section')
  private shell = document.createElement('div')
  private title = document.createElement('h2')
  private status = document.createElement('p')
  private cards = document.createElement('div')
  private stage = document.createElement('div')
  private frame = document.createElement('iframe')
  private youtubePlayer: YouTubePlayer | null = null
  private playerToken = 0
  private closeButton = document.createElement('button')
  private previousFocus: HTMLElement | null = null
  private zoomBefore: number | null = null
  private controller = false
  private playing = ''
  private catalogKey = ''
  private state: CinemaState = { trailers: [], live: false, liveTitle: '', selected: null, since: 0, operator: null, now: Date.now() }
  private receivedAt = performance.now()

  constructor(
    private zoom: { get: () => number; set: (value: number) => void },
    private network: { online: () => boolean; self: () => number; choose: (id: number | null) => void },
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
    body.append(this.cards, this.stage)
    this.shell.append(header, body)
    this.root.append(this.shell)
    document.body.append(this.root)
    this.root.addEventListener('click', (event) => { if (event.target === this.root) this.close() })
    this.root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); this.close() }
      event.stopPropagation()
    })
    // Hors relais, le même catalogue reste disponible pour une séance solo.
    setInterval(() => { if (!this.network.online() && this.isOpen) void this.refreshSolo() }, 30000)
    setInterval(() => this.syncYouTube(), 5000)
  }

  get isOpen() { return !this.root.hidden }
  get isController() { return this.isOpen && this.controller }

  receive(state: CinemaState) {
    this.state = state
    this.receivedAt = performance.now()
    const current = state.trailers.find((t) => t.id === state.selected)
    setProjection(state.live ? 'twitch' : current ? 'trailer' : null,
      state.live ? (state.liveTitle || 'Élite Dangereuse') : current?.title ?? '', current?.image ?? '')
    if (this.isOpen) this.render()
  }

  async open(controller: boolean) {
    if (!this.isOpen) {
      this.previousFocus = document.activeElement as HTMLElement
      this.zoomBefore = this.zoom.get()
      this.zoom.set(Math.min(this.zoomBefore, 2.8))
    }
    this.controller = controller
    this.root.hidden = false
    this.render()
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

  private render() {
    this.shell.classList.toggle('cinema-room-control', this.controller)
    this.cards.hidden = !this.controller || this.state.live
    if (this.controller) this.renderCards()
    const current = this.state.trailers.find((t) => t.id === this.state.selected)
    this.title.textContent = this.controller ? tr('Régie de projection', 'Projection booth') : tr('Séance en cours', 'Now showing')
    this.status.textContent = this.state.live
      ? tr('🔴 Direct Twitch · la sélection des trailers est suspendue.', '🔴 Twitch live · trailer selection is paused.')
      : current ? current.title : tr('La salle attend une séance.', 'Waiting for a screening.')
    const key = this.state.live ? 'twitch' : current ? `trailer:${current.id}:${this.state.since}` : 'none'
    if (key === this.playing) return
    this.playing = key
    this.playerToken++
    this.youtubePlayer?.destroy()
    this.youtubePlayer = null
    this.frame.removeAttribute('src')
    this.frame.remove()
    if (key === 'none') {
      const empty = document.createElement('div')
      empty.className = 'cinema-room-empty'
      empty.textContent = tr('La bande-annonce du vaisseau tourne en attendant le prochain choix.', 'The ship trailer is playing until the next choice.')
      this.stage.replaceChildren(empty)
      return
    }
    if (this.state.live) {
      const parent = location.hostname || 'elitedangereuse.fr'
      this.frame.src = `https://player.twitch.tv/?channel=elitedangereuse&parent=${encodeURIComponent(parent)}&muted=true&autoplay=true`
      this.stage.replaceChildren(this.frame)
    } else if (current) {
      const token = this.playerToken
      const holder = document.createElement('div')
      holder.className = 'cinema-room-youtube'
      this.stage.replaceChildren(holder)
      void youtubeApi().then((api) => {
        if (token !== this.playerToken || !this.isOpen) return
        this.youtubePlayer = new api.Player(holder, {
          videoId: current.video,
          playerVars: { autoplay: 1, controls: 1, playsinline: 1, origin: location.origin },
          events: { onReady: ({ target }) => {
            if (token !== this.playerToken) return
            target.mute() // lecture automatique autorisée ; chacun peut ensuite activer le son
            this.syncYouTube(true)
          } },
        })
      }).catch(() => {
        if (token !== this.playerToken) return
        // Si l'API est bloquée, le lecteur standard garde la séance accessible.
        const elapsed = Math.max(0, Math.floor((this.state.now - this.state.since + performance.now() - this.receivedAt) / 1000))
        this.frame.src = `https://www.youtube.com/embed/${current.video}?autoplay=1&mute=1&start=${elapsed}`
        this.stage.replaceChildren(this.frame)
      })
    }
  }

  private syncYouTube(force = false) {
    const player = this.youtubePlayer
    if (!player || !this.isOpen || this.state.live || this.state.selected === null) return
    try {
      const elapsed = Math.max(0, (this.state.now - this.state.since + performance.now() - this.receivedAt) / 1000)
      const duration = player.getDuration()
      const target = duration > 0 ? elapsed % duration : elapsed
      if (force || Math.abs(player.getCurrentTime() - target) > 2.5) player.seekTo(target, true)
      player.playVideo()
    } catch { /* Le player n'est pas encore prêt. */ }
  }

  close() {
    if (!this.isOpen) return
    this.root.hidden = true
    this.playerToken++
    this.youtubePlayer?.destroy()
    this.youtubePlayer = null
    this.frame.removeAttribute('src')
    this.playing = ''
    if (this.zoomBefore !== null) this.zoom.set(this.zoomBefore)
    this.zoomBefore = null
    this.previousFocus?.focus()
  }
}
