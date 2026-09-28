import * as THREE from 'three'
import { tr } from './i18n'
import { icon } from './icons'
import { CINEMA_SCREEN, setProjection } from './furniture/cinema'
import { FILM_H, FILM_W } from './furniture/cinema-film'
import type { CinemaState, CinemaTrailer, CinemaVideo } from './net'

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
  private youtubePlayer: YouTubePlayer | null = null
  private twitchPlayer: TwitchPlayer | null = null
  private playerToken = 0
  private closeButton = document.createElement('button')
  private previousFocus: HTMLElement | null = null
  private controller = false
  private playing = ''
  private catalogKey = ''
  private tab: 'trailers' | 'youtube' = 'trailers'
  private searchSerial = 0
  private searching = false
  private state: CinemaState = { trailers: [], live: false, liveTitle: '', selected: null, youtube: null, since: 0, operator: null, now: Date.now() }
  private receivedAt = performance.now()

  constructor(
    private network: { online: () => boolean; self: () => number; choose: (id: number | null) => void;
      search: (query: string) => Promise<{ videos: CinemaVideo[]; reason?: string }>; video: (id: string) => void;
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
    this.trailersTab.onclick = () => { this.tab = 'trailers'; this.renderControls() }
    this.youtubeTab.type = 'button'
    this.youtubeTab.textContent = 'YouTube'
    this.youtubeTab.onclick = () => { this.tab = 'youtube'; this.renderControls() }
    this.tabs.append(this.trailersTab, this.youtubeTab)
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
    document.body.append(this.stage, this.volumeControl, this.root)
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
    setProjection(state.live ? 'twitch' : current ? 'trailer' : null,
      state.live ? (state.liveTitle || 'Élite Dangereuse') : current?.title ?? '', state.youtube ? '' : current?.image ?? '')
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
        selected: live ? null : this.state.selected, youtube: live ? null : this.state.youtube,
        operator: this.controller ? this.network.self() : null, now: Date.now() })
    } catch { /* Le faux film reste disponible sans le site. */ }
  }

  private choose(id: number | null) {
    if (!this.controller || this.state.live) return
    if (this.network.online()) this.network.choose(id)
    else this.receive({ ...this.state, selected: id, youtube: null, since: id === null ? 0 : Date.now(), now: Date.now() })
  }

  private async search() {
    if (!this.controller || this.state.live || !this.network.online()) return
    const query = this.searchInput.value.trim()
    if (query.length < 2) return
    const serial = ++this.searchSerial
    this.searching = true
    this.searchButton.disabled = true
    this.searchStatus.textContent = tr('Recherche en cours…', 'Searching…')
    const result = await this.network.search(query)
    if (serial !== this.searchSerial) return
    this.searching = false
    this.searchButton.disabled = false
    this.searchResults.replaceChildren(...result.videos.map((video) => this.videoCard(video)))
    this.searchStatus.textContent = result.reason === 'seat'
      ? tr('Installez-vous dans le fauteuil de régie.', 'Sit in the projection chair.')
      : result.reason === 'live' ? tr('Le direct Twitch est prioritaire.', 'Twitch live takes priority.')
      : result.reason === 'busy' ? tr('Patientez avant une nouvelle recherche.', 'Wait before searching again.')
      : result.reason ? tr('Recherche indisponible. Vous pouvez coller un lien YouTube.', 'Search unavailable. You can paste a YouTube link.')
      : result.videos.length ? tr('Choisissez une vidéo à diffuser.', 'Choose a video to screen.')
      : tr('Aucune vidéo trouvée.', 'No videos found.')
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

  error(reason: string) {
    this.status.textContent = reason === 'live'
      ? tr('Le direct Twitch a commencé : les vidéos sont suspendues.', 'Twitch is live: videos are paused.')
      : reason === 'busy' ? tr('Un instant entre deux changements de séance.', 'Wait a moment between screenings.')
      : reason === 'invalid' ? tr('Cette vidéo n’est plus disponible dans la recherche. Relancez-la.', 'This video is no longer in the search results. Search again.')
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
      button.setAttribute('aria-pressed', (button.dataset.id ? Number(button.dataset.id) === this.state.selected : this.state.selected === null && !this.state.youtube) ? 'true' : 'false')
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
    this.searchPanel.hidden = this.tab !== 'youtube'
    this.trailersTab.setAttribute('aria-selected', String(this.tab === 'trailers'))
    this.youtubeTab.setAttribute('aria-selected', String(this.tab === 'youtube'))
    if (this.controller) this.renderCards()
    const canChoose = this.network.online() && this.state.operator === this.network.self() && !this.state.live
    this.searchInput.disabled = !canChoose
    this.searchButton.disabled = !canChoose || this.searching
    this.searchPanel.querySelector<HTMLButtonElement>('.cinema-room-stop')!.disabled = this.state.live || (this.network.online() && !canChoose)
    for (const button of this.searchResults.querySelectorAll<HTMLButtonElement>('.cinema-room-card')) {
      button.disabled = !canChoose
      button.setAttribute('aria-pressed', String(button.dataset.video === this.state.youtube?.video))
    }
    if (!this.network.online() && this.tab === 'youtube') this.searchStatus.textContent = tr('La recherche demande une connexion au relais.', 'Search requires a relay connection.')
    const current = this.state.youtube ?? this.state.trailers.find((t) => t.id === this.state.selected)
    this.title.textContent = this.controller ? tr('Régie de projection', 'Projection booth') : tr('Séance en cours', 'Now showing')
    this.status.textContent = this.state.live
      ? tr('🔴 Direct Twitch · la sélection des vidéos est suspendue.', '🔴 Twitch live · video selection is paused.')
      : current ? current.title : tr('La salle attend une séance.', 'Waiting for a screening.')
  }

  private renderScreen() {
    const current = this.state.youtube ?? this.state.trailers.find((t) => t.id === this.state.selected)
    const key = this.state.live ? 'twitch' : current ? `youtube:${current.video}:${this.state.since}` : 'none'
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
    if (this.state.live) {
      const token = this.playerToken
      const holder = document.createElement('div')
      holder.className = 'cinema-room-twitch'
      holder.id = 'cinema-twitch-player'
      this.stage.replaceChildren(holder)
      void twitchApi().then((api) => {
        if (token !== this.playerToken) return
        const player = new api.Player(holder.id, {
          width: FILM_W, height: FILM_H, channel: 'elitedangereuse',
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
          const current = this.state.youtube ?? this.state.trailers.find((t) => t.id === this.state.selected)
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
        const current = this.state.youtube ?? this.state.trailers.find((t) => t.id === this.state.selected)
        this.frame.src = this.state.live ? this.twitchSource() : current ? this.youtubeSource(current.video) : ''
      }
    }
    if (this.playing === 'none' || !this.playing || !onCinemaDeck) {
      this.stage.hidden = true
      this.volumeControl.hidden = true
      return
    }
    const { width, height, centerY, depth } = CINEMA_SCREEN
    const screenZ = z + depth
    if (camera.position.z <= screenZ) {
      this.stage.hidden = true
      this.volumeControl.hidden = true
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
      this.volumeControl.hidden = true
      return
    }
    this.stage.hidden = false
    this.stage.style.pointerEvents = inCinemaRoom ? 'auto' : 'none'
    this.stage.style.transform = `matrix(${(b.x - a.x) / FILM_W}, ${(b.y - a.y) / FILM_W}, ${(c.x - a.x) / FILM_H}, ${(c.y - a.y) / FILM_H}, ${a.x}, ${a.y})`
    this.volumeControl.hidden = !inCinemaRoom || (this.state.live ? !this.twitchPlayer : !this.youtubePlayer)
    this.volumeControl.style.left = `${c.x + (b.x - a.x) / 2}px`
    this.volumeControl.style.top = `${c.y + (b.y - a.y) / 2 + 4}px`
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
