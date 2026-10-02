import * as THREE from 'three'
import { tr } from './i18n'
import { icon } from './icons'
import { CINEMA_SCREEN, setProjection } from './furniture/cinema'
import { FILM_H, FILM_W } from './furniture/cinema-film'
import type { CinemaState, CinemaStream, CinemaTrailer, CinemaVideo } from './net'
import { TwitchChat } from './twitch-chat'

const ENDPOINT = '/outils/mini-shipinteriors-cinema.php'
/** La chaîne du site : son direct passe avant tout le reste. */
const SITE_CHANNEL = 'elitedangereuse'
type Tab = 'trailers' | 'youtube' | 'twitch'

interface YouTubePlayer {
  destroy(): void
  getCurrentTime(): number
  getDuration(): number
  seekTo(seconds: number, allowSeekAhead: boolean): void
  playVideo(): void
  pauseVideo(): void
  mute(): void
  unMute(): void
  setVolume(volume: number): void
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
  setVolume(volume: number): void
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
  private selector = document.createElement('div')
  private tabs = document.createElement('div')
  private trailersTab = document.createElement('button')
  private youtubeTab = document.createElement('button')
  private twitchTab = document.createElement('button')
  private cards = document.createElement('div')
  private searchPanel = document.createElement('div')
  private searchForm = document.createElement('form')
  private searchInput = document.createElement('input')
  private searchButton = document.createElement('button')
  private searchStatus = document.createElement('p')
  private searchResults = document.createElement('div')
  private stage = document.createElement('div')
  private frame = document.createElement('iframe')
  private volumeControl = document.createElement('div')
  private volumeIcon = document.createElement('button')
  private volumeInput = document.createElement('input')
  private volumeValue = document.createElement('output')
  private volume = 0
  /** Volume rétabli par l'icône après une coupure. */
  private lastVolume = 50
  private onCinemaDeck = false
  private inCinemaRoom = false
  private readonly topLeft = new THREE.Vector3()
  private readonly topRight = new THREE.Vector3()
  private readonly bottomLeft = new THREE.Vector3()
  private readonly bottomRight = new THREE.Vector3()
  private readonly corner = new THREE.Vector4()
  private readonly toClip = new THREE.Matrix4()
  private readonly toScreen = new THREE.Matrix4()
  private readonly toCanvas = new THREE.Matrix4()
  private readonly frustum = new THREE.Frustum()
  private readonly bounds = new THREE.Box3()
  private youtubePlayer: YouTubePlayer | null = null
  private twitchPlayer: TwitchPlayer | null = null
  private twitchChat = new TwitchChat()
  private playerToken = 0
  private closeButton = document.createElement('button')
  private previousFocus: HTMLElement | null = null
  private controller = false
  private playing = ''
  private catalogKey = ''
  private tab: Tab = 'trailers'
  private searchSerial = 0
  private searching = false
  private state: CinemaState = { trailers: [], live: false, liveTitle: '', selected: null, youtube: null, twitch: null, since: 0, operator: null, now: Date.now() }
  private receivedAt = performance.now()

  constructor(
    private network: { online: () => boolean; self: () => number; choose: (id: number | null) => void;
      search: (query: string) => Promise<{ videos: CinemaVideo[]; reason?: string }>; video: (id: string) => void;
      streams: (query: string) => Promise<{ streams: CinemaStream[]; reason?: string }>; stream: (channel: string) => void;
      duration: (id: number | string, since: number, duration: number) => void },
  ) {
    try {
      const stored = localStorage.getItem('mini-shipinteriors-cinema-volume')
      if (stored !== null) {
        const value = Number(stored)
        if (Number.isFinite(value)) this.volume = Math.max(0, Math.min(100, Math.round(value)))
        if (this.volume > 0) this.lastVolume = this.volume
      }
    } catch { /* Le navigateur peut interdire le stockage local. */ }
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
    this.selector.className = 'cinema-room-selector'
    this.tabs.className = 'cinema-room-tabs'
    this.trailersTab.type = 'button'
    this.trailersTab.textContent = tr('Trailers', 'Trailers')
    this.trailersTab.onclick = () => this.setTab('trailers')
    this.youtubeTab.type = 'button'
    this.youtubeTab.textContent = 'YouTube'
    this.youtubeTab.onclick = () => this.setTab('youtube')
    this.twitchTab.type = 'button'
    this.twitchTab.textContent = 'Twitch'
    this.twitchTab.onclick = () => this.setTab('twitch')
    this.tabs.append(this.trailersTab, this.youtubeTab, this.twitchTab)
    this.cards.className = 'cinema-room-cards'
    this.searchPanel.className = 'cinema-room-search'
    this.searchForm.className = 'cinema-room-search-form'
    this.searchInput.type = 'search'
    this.searchInput.maxLength = 500
    this.searchInput.minLength = 2
    this.searchInput.placeholder = tr('Recherche ou lien YouTube…', 'Search or YouTube link…')
    this.searchInput.setAttribute('aria-label', tr('Recherche ou lien YouTube', 'Search or YouTube link'))
    this.searchButton.type = 'submit'
    this.searchButton.textContent = tr('Chercher', 'Search')
    this.searchForm.onsubmit = (event) => { event.preventDefault(); void this.search() }
    this.searchForm.append(this.searchInput, this.searchButton)
    this.searchStatus.className = 'cinema-room-search-status'
    this.searchResults.className = 'cinema-room-search-results'
    const stopSearch = document.createElement('button')
    stopSearch.type = 'button'
    stopSearch.className = 'cinema-room-card cinema-room-stop'
    stopSearch.textContent = tr('Arrêter la projection', 'Stop screening')
    stopSearch.onclick = () => this.choose(null)
    this.searchPanel.append(this.searchForm, this.searchStatus, stopSearch, this.searchResults)
    this.stage.className = 'cinema-room-stage'
    this.frame.title = tr('Projection commune', 'Shared screening')
    this.frame.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media')
    this.frame.setAttribute('allowfullscreen', '')
    this.selector.append(this.tabs, this.cards, this.searchPanel)
    body.append(this.selector)
    this.shell.append(header, body)
    this.root.append(this.shell)
    this.stage.setAttribute('aria-label', tr('Écran du cinéma', 'Cinema screen'))
    this.volumeControl.className = 'cinema-screen-volume'
    this.volumeControl.setAttribute('role', 'group')
    this.volumeControl.setAttribute('aria-label', tr('Volume du cinéma', 'Cinema volume'))
    this.volumeIcon.className = 'cinema-screen-volume-icon'
    this.volumeInput.type = 'range'
    this.volumeInput.min = '0'
    this.volumeInput.max = '100'
    this.volumeInput.step = '1'
    this.volumeInput.value = String(this.volume)
    this.volumeInput.setAttribute('aria-label', tr('Volume du cinéma', 'Cinema volume'))
    this.volumeInput.oninput = () => this.setVolume(Number(this.volumeInput.value))
    this.volumeIcon.type = 'button'
    this.volumeIcon.onclick = () => this.setVolume(this.volume > 0 ? 0 : this.lastVolume)
    this.volumeControl.addEventListener('keydown', (event) => event.stopPropagation())
    // La molette règle le volume au lieu de zoomer la caméra.
    this.volumeControl.addEventListener('wheel', (event) => {
      event.preventDefault()
      event.stopPropagation()
      this.setVolume(this.volume + (event.deltaY < 0 ? 5 : -5))
    }, { passive: false })
    this.volumeControl.append(this.volumeIcon, this.volumeInput, this.volumeValue)
    this.updateVolumeControl()
    // L'écran est un calque du décor : on le glisse avant le HUD, qui doit rester par-dessus.
    const hud = document.getElementById('hud')
    if (hud) hud.before(this.stage, this.volumeControl)
    else document.body.append(this.stage, this.volumeControl)
    document.body.append(this.root)
    this.stage.hidden = true
    this.volumeControl.hidden = true
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
  /** Chaîne Twitch à l'écran : celle du site en direct, sinon celle que la régie a choisie. */
  private get stream(): string | null { return this.state.live ? SITE_CHANNEL : this.state.twitch?.channel ?? null }

  /** YouTube et Twitch partagent le panneau de recherche : ses résultats ne passent pas d'un onglet à l'autre. */
  private setTab(tab: Tab) {
    if (tab !== this.tab) {
      this.searchSerial++
      this.searching = false
      this.searchInput.value = ''
      this.searchStatus.textContent = ''
      this.searchResults.replaceChildren()
    }
    this.tab = tab
    const label = tab === 'twitch' ? tr('Chaîne, jeu ou lien Twitch', 'Channel, game or Twitch link') : tr('Recherche ou lien YouTube', 'Search or YouTube link')
    this.searchInput.placeholder = `${label}…`
    this.searchInput.setAttribute('aria-label', label)
    this.renderControls()
  }
  get isController() { return this.isOpen && this.controller }

  /** Volume propre à chaque spectateur, gardé d'une visite à l'autre. */
  private setVolume(value: number) {
    this.volume = Math.max(0, Math.min(100, Math.round(value)))
    if (this.volume > 0) this.lastVolume = this.volume
    try { localStorage.setItem('mini-shipinteriors-cinema-volume', String(this.volume)) } catch { /* Stockage indisponible. */ }
    this.applySound()
    this.updateVolumeControl()
  }

  private updateVolumeControl() {
    const label = this.volume > 0 ? tr('Couper le son du cinéma', 'Mute cinema audio') : tr('Rétablir le son du cinéma', 'Unmute cinema audio')
    this.volumeIcon.replaceChildren(icon(this.volume === 0 ? 'speaker-slash' : this.volume < 45 ? 'speaker-low' : 'speaker-high'))
    this.volumeIcon.title = label
    this.volumeIcon.setAttribute('aria-label', label)
    this.volumeInput.value = String(this.volume)
    this.volumeValue.textContent = `${this.volume} %`
  }

  private applySound() {
    const audible = this.inCinemaRoom && this.volume > 0
    try {
      this.youtubePlayer?.setVolume(this.volume)
      if (audible) this.youtubePlayer?.unMute()
      else this.youtubePlayer?.mute()
      this.twitchPlayer?.setVolume(this.volume / 100)
      this.twitchPlayer?.setMuted(!audible)
    } catch { /* Un lecteur externe peut être en cours de chargement. */ }
  }

  receive(state: CinemaState) {
    this.state = state
    this.receivedAt = performance.now()
    const current = state.youtube ?? state.trailers.find((t) => t.id === state.selected)
    setProjection(this.stream ? 'twitch' : current ? 'trailer' : null,
      state.live ? (state.liveTitle || 'Élite Dangereuse') : state.twitch ? `${state.twitch.name} · ${state.twitch.title}` : current?.title ?? '',
      state.youtube || this.stream ? '' : current?.image ?? '')
    this.renderScreen()
    this.twitchChat.show(this.inCinemaRoom ? this.stream : null)
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
        selected: live ? null : this.state.selected, youtube: live ? null : this.state.youtube, twitch: live ? null : this.state.twitch,
        operator: this.controller ? this.network.self() : null, now: Date.now() })
    } catch { /* Le faux film reste disponible sans le site. */ }
  }

  private choose(id: number | null) {
    if (!this.controller || this.state.live) return
    if (this.network.online()) this.network.choose(id)
    else this.receive({ ...this.state, selected: id, youtube: null, twitch: null, since: id === null ? 0 : Date.now(), now: Date.now() })
  }

  private async search() {
    if (!this.controller || this.state.live || !this.network.online()) return
    const query = this.searchInput.value.trim()
    if (query.length < 2) return
    const serial = ++this.searchSerial
    this.searching = true
    this.searchButton.disabled = true
    this.searchStatus.textContent = tr('Recherche en cours…', 'Searching…')
    const twitch = this.tab === 'twitch'
    const result = twitch ? await this.network.streams(query) : await this.network.search(query)
    if (serial !== this.searchSerial) return
    this.searching = false
    this.searchButton.disabled = false
    const cards = 'streams' in result ? result.streams.map((stream) => this.streamCard(stream)) : result.videos.map((video) => this.videoCard(video))
    this.searchResults.replaceChildren(...cards)
    this.searchStatus.textContent = result.reason === 'seat'
      ? tr('Installez-vous dans le fauteuil de régie.', 'Sit in the projection chair.')
      : result.reason === 'live' ? tr('Le direct Twitch est prioritaire.', 'Twitch live takes priority.')
      : result.reason === 'busy' ? tr('Patientez avant une nouvelle recherche.', 'Wait before searching again.')
      : result.reason ? twitch ? tr('Recherche Twitch indisponible.', 'Twitch search unavailable.')
        : tr('Recherche indisponible. Vous pouvez coller un lien YouTube.', 'Search unavailable. You can paste a YouTube link.')
      : cards.length ? twitch ? tr('Choisissez un direct à diffuser.', 'Choose a stream to screen.') : tr('Choisissez une vidéo à diffuser.', 'Choose a video to screen.')
      : twitch ? tr('Aucun direct trouvé.', 'No live streams found.') : tr('Aucune vidéo trouvée.', 'No videos found.')
    this.renderControls()
  }

  private videoCard(video: CinemaVideo): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'cinema-room-card'
    button.dataset.video = video.video
    const image = document.createElement('img')
    image.src = video.image
    image.alt = ''
    image.loading = 'lazy'
    const title = document.createElement('strong')
    title.textContent = video.title
    button.append(image, title)
    button.onclick = () => {
      if (this.network.online() && !this.state.live && this.state.operator === this.network.self()) this.network.video(video.video)
    }
    return button
  }

  private streamCard(stream: CinemaStream): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'cinema-room-card'
    button.dataset.stream = stream.channel
    const image = document.createElement('img')
    image.src = stream.image
    image.alt = ''
    image.loading = 'lazy'
    const name = document.createElement('strong')
    name.textContent = stream.name
    const title = document.createElement('small')
    title.textContent = stream.game ? `${stream.title} · ${stream.game}` : stream.title
    button.append(image, name, title)
    button.onclick = () => {
      if (this.network.online() && !this.state.live && this.state.operator === this.network.self()) this.network.stream(stream.channel)
    }
    return button
  }

  error(reason: string) {
    this.status.textContent = reason === 'live'
      ? tr('Le direct Twitch a commencé : les vidéos sont suspendues.', 'Twitch is live: videos are paused.')
      : reason === 'busy' ? tr('Un instant entre deux changements de séance.', 'Wait a moment between screenings.')
      : reason === 'invalid' ? tr('Ce choix n’est plus dans les résultats de la recherche. Relancez-la.', 'This choice is no longer in the search results. Search again.')
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
      button.setAttribute('aria-pressed', (button.dataset.id ? Number(button.dataset.id) === this.state.selected : this.state.selected === null && !this.state.youtube && !this.state.twitch) ? 'true' : 'false')
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
    this.selector.hidden = !this.controller || this.state.live
    this.cards.hidden = this.tab !== 'trailers'
    this.searchPanel.hidden = this.tab === 'trailers'
    this.trailersTab.setAttribute('aria-selected', String(this.tab === 'trailers'))
    this.youtubeTab.setAttribute('aria-selected', String(this.tab === 'youtube'))
    this.twitchTab.setAttribute('aria-selected', String(this.tab === 'twitch'))
    if (this.controller) this.renderCards()
    const canChoose = this.network.online() && this.state.operator === this.network.self() && !this.state.live
    this.searchInput.disabled = !canChoose
    this.searchButton.disabled = !canChoose || this.searching
    this.searchPanel.querySelector<HTMLButtonElement>('.cinema-room-stop')!.disabled = this.state.live || (this.network.online() && !canChoose)
    for (const button of this.searchResults.querySelectorAll<HTMLButtonElement>('.cinema-room-card')) {
      button.disabled = !canChoose
      button.setAttribute('aria-pressed', String(button.dataset.stream ? button.dataset.stream === this.state.twitch?.channel : button.dataset.video === this.state.youtube?.video))
    }
    if (!this.network.online() && this.tab !== 'trailers') this.searchStatus.textContent = tr('La recherche demande une connexion au relais.', 'Search requires a relay connection.')
    const current = this.state.youtube ?? this.state.trailers.find((t) => t.id === this.state.selected)
    this.title.textContent = this.controller ? tr('Régie de projection', 'Projection booth') : tr('Séance en cours', 'Now showing')
    this.status.textContent = this.state.live
      ? tr('🔴 Direct Twitch · la sélection des vidéos est suspendue.', '🔴 Twitch live · video selection is paused.')
      : this.state.twitch ? `🔴 ${this.state.twitch.name} · ${this.state.twitch.title}`
      : current ? current.title : tr('La salle attend une séance.', 'Waiting for a screening.')
  }

  private renderScreen() {
    const current = this.state.youtube ?? this.state.trailers.find((t) => t.id === this.state.selected)
    const stream = this.stream
    const key = stream ? `twitch:${stream}` : current ? `youtube:${current.video}:${this.state.since}` : 'none'
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
      this.volumeControl.hidden = true
      return
    }
    if (stream) {
      const token = this.playerToken
      const holder = document.createElement('div')
      holder.className = 'cinema-room-twitch'
      holder.id = 'cinema-twitch-player'
      this.stage.replaceChildren(holder)
      void twitchApi().then((api) => {
        if (token !== this.playerToken) return
        const player = new api.Player(holder.id, {
          width: FILM_W, height: FILM_H, channel: stream,
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
        this.frame.src = this.twitchSource(stream)
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
          }, onStateChange: ({ data }) => { if (data === 0) this.finishVideo() } },
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

  private twitchSource(channel: string) {
    const parent = location.hostname || 'elitedangereuse.fr'
    return `https://player.twitch.tv/?channel=${channel}&parent=${encodeURIComponent(parent)}&muted=true&autoplay=true`
  }

  /** Aligne le lecteur HTML sur la toile 3D de la salle, même pendant les mouvements de caméra. */
  placeScreen(camera: THREE.Camera, onCinemaDeck: boolean, inCinemaRoom: boolean, x: number, y: number, z: number) {
    const stream = this.stream
    if (onCinemaDeck !== this.onCinemaDeck) {
      this.onCinemaDeck = onCinemaDeck
      if (onCinemaDeck) {
        if (stream) {
          if (this.twitchPlayer) {
            try { this.twitchPlayer.play() } catch { /* Le lecteur charge. */ }
          }
          else if (this.frame.isConnected) this.frame.src = this.twitchSource(stream)
        } else if (this.frame.isConnected) {
          const current = this.state.youtube ?? this.state.trailers.find((t) => t.id === this.state.selected)
          if (current) this.frame.src = this.youtubeSource(current.video)
        }
        this.syncYouTube(true)
      } else {
        if (stream) {
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
      this.twitchChat.show(inCinemaRoom ? stream : null)
      // Le lecteur simple de secours n'a pas d'API de volume : le recharger muet en sortant.
      if (!inCinemaRoom && onCinemaDeck && this.frame.isConnected) {
        const current = this.state.youtube ?? this.state.trailers.find((t) => t.id === this.state.selected)
        this.frame.src = stream ? this.twitchSource(stream) : current ? this.youtubeSource(current.video) : ''
      }
    }
    if (this.playing === 'none' || !this.playing || !onCinemaDeck) {
      this.stage.hidden = true
      this.volumeControl.hidden = true
      return
    }
    const { width, height, centerY, depth } = CINEMA_SCREEN
    const screenZ = z + depth
    // En perspective (vue FPS), le lecteur HTML passe par-dessus tout le canvas : hors de la salle,
    // les murs ne le cacheraient pas. La toile 3D (affiche de la séance) prend alors le relais.
    const perspective = (camera as THREE.PerspectiveCamera).isPerspectiveCamera === true
    if (camera.position.z <= screenZ || (perspective && !inCinemaRoom)) {
      this.stage.hidden = true
      this.volumeControl.hidden = true
      return
    }
    const tl = this.topLeft.set(x - width / 2, y + centerY + height / 2, screenZ)
    const tr = this.topRight.set(x + width / 2, y + centerY + height / 2, screenZ)
    const bl = this.bottomLeft.set(x - width / 2, y + centerY - height / 2, screenZ)
    const br = this.bottomRight.set(x + width / 2, y + centerY - height / 2, screenZ)
    const clip = this.toClip.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    if (!this.frustum.setFromProjectionMatrix(clip).intersectsBox(this.bounds.setFromPoints([tl, tr, bl, br]))) {
      this.stage.hidden = true
      this.volumeControl.hidden = true
      return
    }
    // Coin à l'écran, ou null s'il est derrière l'œil (sa projection 2D n'a alors plus de sens).
    const point = (v: THREE.Vector3) => {
      const p = this.corner.set(v.x, v.y, v.z, 1).applyMatrix4(clip)
      return p.w > 1e-4 ? { x: (p.x / p.w + 1) * innerWidth / 2, y: (1 - p.y / p.w) * innerHeight / 2 } : null
    }
    const a = point(tl), b = point(tr), c = point(bl), d = point(br)
    // Vu de trop loin pour y cliquer : la toile 3D suffit.
    if (a && b && c && d && Math.max(Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(d.x - c.x, d.y - c.y)) < 30
      && Math.max(Math.hypot(c.x - a.x, c.y - a.y), Math.hypot(d.x - b.x, d.y - b.y)) < 12) {
      this.stage.hidden = true
      this.volumeControl.hidden = true
      return
    }
    // Pixel du lecteur -> point de la toile -> caméra -> écran, en coordonnées homogènes : le navigateur
    // fait lui-même la division perspective (et coupe ce qui passe derrière l'œil), comme le rendu 3D.
    // L'ancienne matrix() affine, tirée de 3 coins projetés, ne tombait juste qu'en vue iso orthographique.
    const film = this.toCanvas.set(
      width / FILM_W, 0, 0, tl.x,
      0, -height / FILM_H, 0, tl.y,
      0, 0, 1, tl.z,
      0, 0, 0, 1)
    const m = this.toScreen.set(
      innerWidth / 2, 0, 0, innerWidth / 2,
      0, -innerHeight / 2, 0, innerHeight / 2,
      0, 0, 1, 0,
      0, 0, 0, 1).multiply(clip).multiply(film).elements
    this.stage.hidden = false
    this.stage.style.pointerEvents = inCinemaRoom ? 'auto' : 'none'
    this.stage.style.transform = `matrix3d(${m.map((n) => +n.toPrecision(10)).join(', ')})`
    this.volumeControl.hidden = !inCinemaRoom || !c || !d || (stream ? !this.twitchPlayer : !this.youtubePlayer)
    if (c && d) {
      this.volumeControl.style.left = `${(c.x + d.x) / 2}px`
      this.volumeControl.style.top = `${Math.max(c.y, d.y) + 4}px`
    }
  }

  private syncYouTube(force = false) {
    const player = this.youtubePlayer
    if (!player || !this.onCinemaDeck || this.state.live || (this.state.selected === null && !this.state.youtube)) return
    try {
      const elapsed = Math.max(0, (this.state.now - this.state.since + performance.now() - this.receivedAt) / 1000)
      const duration = player.getDuration()
      this.reportTrailerDuration(duration)
      if (duration > 0 && elapsed >= duration) {
        this.finishVideo()
        return
      }
      const target = elapsed
      if (force || Math.abs(player.getCurrentTime() - target) > 2.5) player.seekTo(target, true)
      player.playVideo()
    } catch { /* Le player n'est pas encore prêt. */ }
  }

  private reportTrailerDuration(duration: number) {
    const { selected, youtube, since } = this.state
    const id = youtube?.video ?? selected
    if (!this.network.online() || !this.onCinemaDeck || id === null || !Number.isFinite(duration) || duration < 1) return
    this.network.duration(id, since, duration)
  }

  private finishVideo() {
    if ((this.state.selected === null && !this.state.youtube) || this.state.live) return
    this.youtubePlayer?.pauseVideo()
    if (this.network.online()) this.reportTrailerDuration(this.youtubePlayer?.getDuration() ?? 0)
    else this.receive({ ...this.state, selected: null, youtube: null, since: 0, now: Date.now() })
  }

  close() {
    if (!this.isOpen) return
    this.root.hidden = true
    this.previousFocus?.focus()
  }
}
