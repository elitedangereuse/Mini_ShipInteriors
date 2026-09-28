import * as THREE from 'three'
import { BASE } from './assets'
import type { Sound } from './audio'
import { tr } from './i18n'
import { icon } from './icons'
import { syncTempo } from './tempo'
import { $ } from './ui'
import { musicCue, musicOrder } from '../shared/music-playlist.js'

/* Le relais partage le choix et l'heure de départ. Chaque client retrouve le même titre,
 * y compris à l'intérieur d'un album, après une reconnexion. */

type MusicStyle = 'ambient' | 'classical' | 'disco' | 'synthwave' | 'lofi' | 'spacesynth' | 'chiptune' | 'lounge'
const STYLE_LABELS: Record<MusicStyle, string> = {
  ambient: tr('Ambient', 'Ambient'), classical: tr('Classique', 'Classical'), disco: 'Disco',
  synthwave: 'Synthwave', lofi: 'Lo-fi', spacesynth: 'Spacesynth', chiptune: 'Chiptune', lounge: 'Lounge',
}

interface Song {
  title: string
  file: string
  duration: number
  bpm?: number | null
  offset?: number
}

export interface Track {
  id: string
  title: string
  artist: string
  mood: string
  style: MusicStyle
  cover: string
  songs?: Song[]
  /** Durée du fichier (s) : la liste s'enchaîne de façon prévisible, chez tous les joueurs. */
  duration: number
  /** Tempo et premier temps (s) ; null : pas de pulsation stable (la valse), la soirée garde le sien. */
  bpm: number | null
  offset: number
}

export const TRACKS: Track[] = [
  {
    id: 'danube', title: tr('Le Beau Danube bleu', 'The Blue Danube'), artist: 'U.S. Marine Band · J. Strauss II', duration: 203.1, bpm: null, offset: 0,
    style: 'classical', cover: 'danube.svg',
    mood: tr('La valse de l\'ordinateur d\'amarrage : détendez-vous, il s\'occupe de l\'approche.', 'The docking computer waltz: relax, it handles the approach.'),
  },
  {
    id: 'disco', title: 'Funky Disco Beats to Boogie/Woogie to', artist: 'Fupi', duration: 133.1, bpm: 110, offset: 0.005,
    style: 'disco', cover: 'disco.svg',
    mood: tr('Basse funky, cuivres et cordes : la boule à facettes tourne, tout le monde sur la piste !', 'Funky bass, brass and strings: the mirror ball is spinning, everybody on the dance floor!'),
  },
  {
    id: 'synthwave', title: 'Day Dreams', artist: 'HoliznaCC0', duration: 194.3, bpm: 130, offset: 0.005,
    style: 'synthwave', cover: 'synthwave.svg',
    mood: tr('Néons, arpèges et grosse caisse : virée nocturne rétro-futuriste.', 'Neon, arpeggios and a four-on-the-floor kick: a retro-futuristic night drive.'),
  },
  {
    id: 'lofi', title: 'Chills', artist: 'HoliznaCC0', duration: 174.9, bpm: 96, offset: 0.007,
    style: 'lofi', cover: 'lofi.svg',
    mood: tr('Saxo feutré et beat nonchalant pour décompresser entre deux sauts.', 'Mellow sax and a lazy beat to unwind between two jumps.'),
  },
  {
    id: 'space', title: 'Ganymede', artist: 'congusbongus', duration: 183.3, bpm: 118, offset: 0.211,
    style: 'spacesynth', cover: 'space.svg',
    mood: tr('Spacesynth en orbite de Jupiter : arpèges cosmiques pour danser en apesanteur.', 'Spacesynth in orbit around Jupiter: cosmic arpeggios for zero-g dancing.'),
  },
  {
    id: 'chiptune', title: 'Interstellar Fleet 1', artist: 'Zane Little Music', duration: 193.2, bpm: 130, offset: 0.005,
    style: 'chiptune', cover: 'chiptune.svg',
    mood: tr('8-bit héroïque pour pilotes d\'élite : la borne d\'arcade de la flotte.', 'Heroic 8-bit for Elite pilots: the fleet\'s arcade cabinet.'),
  },
  {
    id: 'lounge', title: 'Two Left Socks', artist: 'congusbongus', duration: 200.2, bpm: 135, offset: 0.215,
    style: 'lounge', cover: 'lounge.svg',
    mood: tr('Bossa nova d\'ascenseur en synthé FM : cocktail au bar du carrier.', 'FM-synth elevator bossa nova: cocktails at the carrier bar.'),
  },
  {
    id: 'fight-left', title: 'All The Fight Left!', artist: 'HoliznaCC0', duration: 171.9, bpm: null, offset: 0,
    style: 'synthwave', cover: 'fight-left.svg',
    mood: tr('Synthwave mélancolique et cinématique pour regarder défiler les étoiles.', 'Melancholy, cinematic synthwave for watching the stars go by.'),
  },
  {
    id: 'synesthesia', title: 'Synesthesia', artist: 'Zane Little Music', duration: 155.6, bpm: null, offset: 0,
    style: 'synthwave', cover: 'synesthesia.svg',
    mood: tr('Synthés pétillants et un brin étranges : la nuit prend une autre couleur.', 'Bubbly, slightly spooky synths: the night takes on a different color.'),
  },
  {
    id: 'dangerous-spaces', title: 'Dangerous Spaces', artist: 'Ben Carter Jr', style: 'ambient',
    cover: 'dangerous-spaces.png', duration: 1123.52, bpm: null, offset: 0,
    mood: tr('Quatre voyages contemplatifs aux confins de l’espace.', 'Four contemplative journeys to the edge of space.'),
    songs: [
      { title: 'Infinite Drift', file: 'dangerous-spaces-01.mp3', duration: 303.12 },
      { title: 'Orbit of Glass', file: 'dangerous-spaces-02.mp3', duration: 261.05 },
      { title: 'And beyond', file: 'dangerous-spaces-03.mp3', duration: 289.49 },
      { title: 'H.O.P.E.', file: 'dangerous-spaces-04.mp3', duration: 269.86 },
    ],
  },
  {
    id: 'end-of-everything', title: 'The End of Everything', artist: 'Ben Carter Jr', style: 'ambient',
    cover: 'end-of-everything.png', duration: 1107.96, bpm: null, offset: 0,
    mood: tr('Quatre paysages sonores sombres et majestueux.', 'Four dark, majestic soundscapes.'),
    songs: [
      { title: 'Abyssal Silence', file: 'end-of-everything-01.mp3', duration: 309.89 },
      { title: 'Alone', file: 'end-of-everything-02.mp3', duration: 253.68 },
      { title: 'No Safety', file: 'end-of-everything-03.mp3', duration: 287.23 },
      { title: 'The End', file: 'end-of-everything-04.mp3', duration: 257.16 },
    ],
  },
]

export const trackById = (id: string | null | undefined) => TRACKS.find((t) => t.id === id) ?? null
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const now = () => performance.now() / 1000
const coverUrl = (track: Track) => `${BASE}music/covers/${track.cover}`
export interface MusicOptions { song: number; loop: boolean; shuffle: boolean; seed: number }
const SONGS = TRACKS.flatMap((track) => (track.songs ?? [{ title: track.title, file: `${track.id}.mp3`, duration: track.duration, bpm: track.bpm, offset: track.offset }])
  .map((song, index) => ({ track, song, index })))
const DURATIONS = SONGS.map((entry) => entry.song.duration)
const songId = (track: Track, index: number) => SONGS.findIndex((entry) => entry.track === track && entry.index === index)

/** Un jukebox qui joue en stéréo, avec une acoustique différente de part et d'autre des cloisons. */
export class JukeboxPlayer {
  private readonly audio = new Audio()
  private output: GainNode | null = null
  private filter: BiquadFilterNode | null = null
  private readonly at = new THREE.Vector3()
  private acoustics: 'inside' | 'outside' | 'away' = 'away'
  /** Titre choisi, ordre partagé et heure où il a commencé. */
  private origin: { entry: number; t0: number; loop: boolean; shuffle: boolean; seed: number } | null = null
  private order: number[] = []
  /** Recalé sur cette horloge depuis le dernier démarrage (cf. align). */
  private aligned = false
  private retrying = false
  private entryIndex = -1
  /** Morceau en cours (null : le jukebox se tait). */
  track: Track | null = null
  /** Un morceau démarre (choisi, ou le suivant qui enchaîne). */
  onTrack?: (track: Track) => void

  constructor(
    private readonly sound: Sound,
    private readonly volume: number,
  ) {
    this.audio.preload = 'auto'
    this.audio.muted = true
    // Un morceau fini : le suivant, là où en est la soirée.
    this.audio.addEventListener('ended', () => this.ended())
    this.audio.addEventListener('playing', () => this.align())
  }

  /** État à rendre au relais après reconnexion. */
  get playing(): { track: Track; position: number; x: number; z: number } & MusicOptions | null {
    const o = this.origin
    const cue = this.cue()
    return o && cue ? {
      track: SONGS[o.entry].track, song: SONGS[o.entry].index,
      position: (now() - o.t0) % cue.cycle, x: this.at.x, z: this.at.z,
      loop: o.loop, shuffle: o.shuffle, seed: o.seed,
    } : null
  }

  get current(): { track: Track; song: Song; songIndex: number; elapsed: number; position: number } | null {
    const cue = this.cue()
    if (!cue) return null
    const { track, song, index } = SONGS[cue.index]
    const elapsed = (track.songs?.slice(0, index).reduce((sum, item) => sum + item.duration, 0) ?? 0) + cue.position
    return { track, song, songIndex: index, elapsed, position: cue.position }
  }

  get options(): Omit<MusicOptions, 'song'> {
    const o = this.origin
    return { loop: o?.loop ?? false, shuffle: o?.shuffle ?? false, seed: o?.seed ?? 0 }
  }

  adjacent(step: -1 | 1): { track: Track; song: number } | null {
    const cue = this.cue()
    if (!cue) return null
    const index = this.order[(cue.orderIndex + step + this.order.length) % this.order.length]
    return { track: SONGS[index].track, song: SONGS[index].index }
  }

  /**
   * Joue `track` depuis `position` secondes ; au-delà de sa fin, la liste a enchaîné (on
   * rejoint une soirée commencée plus tôt).
   */
  play(track: Track, at: THREE.Vector3, position = 0, options: Partial<MusicOptions> = {}) {
    const selected = songId(track, Math.max(0, Math.min((track.songs?.length ?? 1) - 1, Math.trunc(options.song ?? 0))))
    if (selected < 0) return
    const preserve = position > 0 && selected === this.entryIndex && !this.audio.paused && Math.abs(this.audio.currentTime - position) < 0.5
    const shuffle = options.shuffle ?? false
    const seed = options.seed ?? 0
    this.origin = { entry: selected, t0: now() - Math.max(0, position), loop: options.loop ?? false, shuffle, seed }
    this.order = musicOrder(SONGS.length, selected, shuffle, seed)
    this.at.copy(at)
    this.attach()
    this.start(!preserve)
  }

  /** Titre et position à l'heure commune, indépendamment du chargement local. */
  private cue(): { index: number; orderIndex: number; position: number; cycle: number } | null {
    const o = this.origin
    if (!o) return null
    return musicCue(DURATIONS, this.order, now() - o.t0, o.loop)
  }

  private ended() {
    const cue = this.cue()
    if (cue && this.origin && cue.index === this.entryIndex) {
      if (this.origin.loop) this.origin.t0 = now()
      else this.origin.t0 -= DURATIONS[cue.index] - cue.position
    }
    this.start()
  }

  private start(force = false) {
    const cue = this.cue()
    if (!cue) return
    const { track, song } = SONGS[cue.index]
    const position = cue.position
    // Ce morceau-là passe déjà, à l'heure (le relais nous le rappelle) : on ne le recharge pas.
    if (!force && cue.index === this.entryIndex && !this.audio.paused && Math.abs(this.audio.currentTime - position) < 1) return
    this.track = track
    this.entryIndex = cue.index
    this.aligned = false
    this.audio.src = `${BASE}music/${song.file}#t=${position.toFixed(2)}`
    this.audio.play().catch((e: unknown) => {
      if (e instanceof DOMException && e.name === 'NotAllowedError') this.retryOnGesture()
    })
    this.onTrack?.(track)
  }

  /** Parti après son chargement : on rattrape le temps perdu, une fois par morceau. */
  private align() {
    if (this.aligned) return
    this.aligned = true
    const cue = this.cue()
    if (cue?.index === this.entryIndex && Math.abs(this.audio.currentTime - cue.position) > 0.25) this.audio.currentTime = cue.position
  }

  /** Lecture refusée (réglage strict du navigateur) : on réessaie au premier geste, à l'heure. */
  private retryOnGesture() {
    if (this.retrying) return
    this.retrying = true
    const retry = () => {
      removeEventListener('pointerdown', retry, true)
      removeEventListener('keydown', retry, true)
      this.retrying = false
      if (this.track && this.audio.paused) this.start()
    }
    addEventListener('pointerdown', retry, true)
    addEventListener('keydown', retry, true)
  }

  /**
   * Branche le jukebox sur le son du jeu (volume général, stéréo). Avant le premier geste
   * du joueur, le son n'a pas démarré : le morceau tourne en muet, pour rester à l'heure.
   */
  private attach() {
    if (this.output || !this.sound.ready) return
    const filter = this.sound.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.Q.value = 0.7
    filter.frequency.value = this.acoustics === 'inside' ? 16000 : 900
    const output = this.sound.ctx.createGain()
    output.gain.value = this.acoustics === 'inside' ? this.volume : this.acoustics === 'outside' ? this.volume * 0.16 : 0
    this.sound.ctx.createMediaElementSource(this.audio).connect(filter).connect(output).connect(this.sound.listener.getInput())
    this.filter = filter
    this.output = output
    this.audio.muted = false
  }

  stop() {
    this.track = null
    this.entryIndex = -1
    this.origin = null
    this.order = []
    this.audio.pause()
    this.audio.removeAttribute('src')
    this.audio.load()
  }

  /** Son plein dans la pièce, assourdi sur le même pont, silencieux aux autres ponts. */
  setRoom(onDeck: boolean, sameRoom: boolean) {
    const next = !onDeck ? 'away' : sameRoom ? 'inside' : 'outside'
    if (next === this.acoustics) return
    this.acoustics = next
    if (!this.output || !this.filter) return
    this.sound.fade(this.output, next === 'inside' ? this.volume : next === 'outside' ? this.volume * 0.16 : 0, 0.65)
    const frequency = this.filter.frequency
    const t = this.sound.ctx.currentTime
    frequency.cancelScheduledValues(t)
    frequency.setValueAtTime(frequency.value, t)
    frequency.exponentialRampToValueAtTime(next === 'inside' ? 16000 : next === 'outside' ? 900 : 450, t + 0.65)
  }

  /** Cale la soirée sur le morceau (si on l'entend et qu'il a un tempo) ; false sinon. */
  syncTempo(): boolean {
    if (this.track && !this.output) this.attach()
    const song = this.current?.song
    if (this.acoustics !== 'inside' || !song?.bpm || this.audio.paused) return false
    syncTempo({ bpm: song.bpm, offset: song.offset ?? 0 }, this.audio.currentTime)
    return true
  }
}

/** Catalogue du jukebox : albums, morceaux et filtre de style. */
export class JukeboxPanel {
  private readonly el: HTMLDivElement
  private rows: { track: Track; button: HTMLButtonElement }[] = []
  private selected = 0
  private filter: MusicStyle | null = null
  private filters: HTMLButtonElement[] = []
  private list!: HTMLDivElement
  private detail!: HTMLDivElement
  private detailRows: HTMLButtonElement[] = []
  private album: Track | null = null
  private hero!: HTMLDivElement
  private controls: Partial<Record<'previous' | 'next' | 'loop' | 'shuffle', HTMLButtonElement>> = {}
  private off?: HTMLButtonElement
  private player: JukeboxPlayer | null = null
  private refreshTimer: number | null = null
  private pick?: (t: Track, song: number) => void
  private command?: (kind: 'previous' | 'next' | 'loop' | 'shuffle') => void

  constructor() {
    this.el = document.createElement('div')
    this.el.className = 'panel jukebox'
    this.el.hidden = true
    // La molette fait défiler le catalogue sans atteindre le zoom global de la caméra.
    this.el.addEventListener('wheel', (event) => event.stopPropagation(), { passive: true })
    $('hud').append(this.el)
  }

  get isOpen(): boolean {
    return !this.el.hidden
  }

  contains(target: EventTarget | null): boolean {
    return target instanceof Node && this.el.contains(target)
  }

  open(player: JukeboxPlayer, pick: (t: Track, song: number) => void, stop: () => void, command: (kind: 'previous' | 'next' | 'loop' | 'shuffle') => void) {
    this.player = player
    this.pick = pick
    this.command = command
    this.album = null
    const heading = document.createElement('header')
    heading.className = 'jb-heading'
    const headingText = document.createElement('div')
    const eyebrow = document.createElement('div')
    eyebrow.className = 'jb-eyebrow'
    eyebrow.textContent = tr('MUSIQUE À BORD', 'MUSIC ON BOARD')
    const title = document.createElement('h2')
    title.append(icon('vinyl-record'), ' Jukebox')
    const intro = document.createElement('p')
    intro.textContent = tr('Choisissez la bande-son du vaisseau.', 'Choose the ship’s soundtrack.')
    headingText.append(eyebrow, title, intro)
    const closeTop = document.createElement('button')
    closeTop.className = 'jb-close'
    closeTop.type = 'button'
    closeTop.textContent = '×'
    closeTop.setAttribute('aria-label', tr('Fermer', 'Close'))
    closeTop.onclick = () => this.close()
    heading.append(headingText, closeTop)

    this.hero = document.createElement('div')
    this.hero.className = 'jb-hero'
    this.hero.setAttribute('aria-live', 'polite')
    this.renderHero()

    const transport = document.createElement('div')
    transport.className = 'jb-transport'
    const controls: { kind: 'previous' | 'next' | 'loop' | 'shuffle'; label: string; iconName: 'skip-back' | 'skip-forward' | 'repeat-once' | 'shuffle' }[] = [
      { kind: 'previous', label: tr('Piste précédente', 'Previous track'), iconName: 'skip-back' },
      { kind: 'next', label: tr('Piste suivante', 'Next track'), iconName: 'skip-forward' },
      { kind: 'loop', label: tr('Répéter ce titre', 'Repeat this track'), iconName: 'repeat-once' },
      { kind: 'shuffle', label: tr('Ordre aléatoire', 'Shuffle order'), iconName: 'shuffle' },
    ]
    this.controls = {}
    for (const item of controls) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `jb-transport-${item.kind}`
      const label = document.createElement('span')
      label.textContent = item.label
      button.append(icon(item.iconName), label)
      button.title = item.label
      button.setAttribute('aria-label', item.label)
      button.onclick = () => { this.command?.(item.kind); this.renderHero() }
      this.controls[item.kind] = button
      transport.append(button)
    }
    this.updateControls()

    const catalogue = document.createElement('div')
    catalogue.className = 'jb-catalogue'
    const filterLabel = document.createElement('div')
    filterLabel.className = 'jb-section-title'
    filterLabel.textContent = tr('Explorer par style', 'Browse by style')
    const filters = document.createElement('div')
    filters.className = 'jb-filters'
    const styles: (MusicStyle | null)[] = [null, ...new Set(TRACKS.map((t) => t.style))]
    this.filters = styles.map((style) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'jb-filter'
      button.textContent = style ? STYLE_LABELS[style] : tr('Tout', 'All')
      button.onclick = () => this.setFilter(style)
      filters.append(button)
      return button
    })
    const libraryTitle = document.createElement('div')
    libraryTitle.className = 'jb-section-title jb-library-title'
    libraryTitle.textContent = tr('Albums et morceaux', 'Albums and tracks')
    this.list = document.createElement('div')
    this.list.className = 'jb-list'
    this.rows = [...TRACKS].sort((a, b) => Number(!!b.songs) - Number(!!a.songs)).map((t) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'jb-card'
      const cover = document.createElement('img')
      cover.className = 'jb-cover'
      cover.src = coverUrl(t)
      cover.alt = ''
      cover.loading = 'lazy'
      const content = document.createElement('span')
      content.className = 'jb-card-content'
      const tag = document.createElement('span')
      tag.className = 'jb-card-tag'
      tag.textContent = t.songs ? tr(`ALBUM · ${t.songs.length} TITRES`, `ALBUM · ${t.songs.length} TRACKS`) : STYLE_LABELS[t.style].toUpperCase()
      const name = document.createElement('span')
      name.className = 'jb-title'
      name.textContent = t.title
      const by = document.createElement('span')
      by.className = 'jb-artist'
      by.textContent = `${t.artist} · ${clock(t.duration)}`
      content.append(tag, name, by)
      if (t.songs) {
        const songs = document.createElement('span')
        songs.className = 'jb-song-preview'
        songs.textContent = t.songs.map((s) => s.title).join(' · ')
        content.append(songs)
      }
      const play = document.createElement('span')
      play.className = 'jb-play'
      play.append(icon(t.songs ? 'caret-right' : 'play'))
      b.append(cover, content, play)
      b.setAttribute('aria-label', tr(`${t.songs ? 'Ouvrir l’album' : 'Jouer'} ${t.title}, ${t.artist}`, `${t.songs ? 'Open album' : 'Play'} ${t.title}, ${t.artist}`))
      b.onclick = () => t.songs ? this.showAlbum(t) : this.choose(t, 0)
      b.onpointerenter = () => this.select(this.visibleRows().findIndex((row) => row.track === t), false)
      return { track: t, button: b }
    })
    this.list.append(...this.rows.map((row) => row.button))
    this.detail = document.createElement('div')
    this.detail.className = 'jb-album-detail'
    this.detail.hidden = true
    catalogue.append(filterLabel, filters, libraryTitle, this.list, this.detail)
    const actions = document.createElement('div')
    actions.className = 'jb-actions'
    const off = document.createElement('button')
    off.className = 'jb-stop'
    off.append(icon('stop'), tr('Arrêter la musique', 'Stop the music'))
    off.hidden = !player.track
    off.onclick = () => { this.close(); stop() }
    this.off = off
    actions.append(off)
    const close = document.createElement('button')
    close.className = 'jb-done'
    close.append(tr('Fermer', 'Close'))
    close.onclick = () => this.close()
    actions.append(close)
    const hint = document.createElement('div')
    hint.className = 'jb-hint'
    hint.textContent = tr('← → filtrer · ↑ ↓ choisir · Entrée : ouvrir / jouer · Échap : fermer', '← → filter · ↑ ↓ choose · Enter: open / play · Esc: close')
    this.el.replaceChildren(heading, this.hero, transport, catalogue, hint, actions)
    this.setFilter(this.filter)
    this.select(Math.max(0, this.visibleRows().findIndex((row) => row.track === player.track)))
    this.el.hidden = false
    this.renderHero()
    if (this.refreshTimer !== null) clearInterval(this.refreshTimer)
    this.refreshTimer = window.setInterval(() => this.renderHero(), 500)
  }

  move(step: number) {
    const count = this.album ? this.detailRows.length : this.visibleRows().length
    if (count) {
      this.select((this.selected + step + count) % count)
      ;(this.album ? this.detailRows[this.selected] : this.visibleRows()[this.selected]?.button)?.focus({ preventScroll: true })
    }
  }

  filterMove(step: number) {
    const styles: (MusicStyle | null)[] = [null, ...new Set(TRACKS.map((t) => t.style))]
    this.setFilter(styles[(styles.indexOf(this.filter) + step + styles.length) % styles.length])
    this.visibleRows()[this.selected]?.button.focus({ preventScroll: true })
  }

  confirm() {
    const active = document.activeElement
    if (active instanceof HTMLButtonElement && this.el.contains(active) && !active.classList.contains('jb-card')) return active.click()
    if (this.album) this.detailRows[this.selected]?.click()
    else this.visibleRows()[this.selected]?.button.click()
  }

  private visibleRows() {
    return this.rows.filter((row) => !this.filter || row.track.style === this.filter)
  }

  private setFilter(style: MusicStyle | null) {
    this.hideAlbum()
    this.filter = style
    const styles: (MusicStyle | null)[] = [null, ...new Set(TRACKS.map((t) => t.style))]
    this.filters.forEach((button, i) => {
      button.classList.toggle('active', styles[i] === style)
      button.setAttribute('aria-pressed', String(styles[i] === style))
    })
    this.rows.forEach(({ track, button }) => { button.hidden = !!style && track.style !== style })
    this.select(0)
  }

  private select(i: number, scroll = true) {
    this.rows.forEach(({ button }) => button.classList.remove('selected'))
    this.detailRows.forEach((button) => button.classList.remove('selected'))
    if (i < 0) return
    this.selected = i
    const button = this.album ? this.detailRows[i] : this.visibleRows()[i]?.button
    button?.classList.add('selected')
    if (scroll) button?.scrollIntoView({ block: 'nearest' })
  }

  private showAlbum(track: Track) {
    if (!track.songs) return this.choose(track, 0)
    this.album = track
    const back = document.createElement('button')
    back.type = 'button'
    back.className = 'jb-album-back'
    back.append(icon('arrow-left'), tr('Tous les albums et morceaux', 'All albums and tracks'))
    back.onclick = () => this.hideAlbum()
    const heading = document.createElement('div')
    heading.className = 'jb-album-heading'
    const cover = document.createElement('img')
    cover.src = coverUrl(track)
    cover.alt = ''
    const info = document.createElement('div')
    const eyebrow = document.createElement('span')
    eyebrow.className = 'jb-card-tag'
    eyebrow.textContent = tr(`ALBUM · ${track.songs.length} TITRES`, `ALBUM · ${track.songs.length} TRACKS`)
    const name = document.createElement('strong')
    name.textContent = track.title
    const artist = document.createElement('span')
    artist.textContent = `${track.artist} · ${clock(track.duration)}`
    info.append(eyebrow, name, artist)
    heading.append(cover, info)
    const all = document.createElement('button')
    all.type = 'button'
    all.className = 'jb-album-all'
    all.append(icon('play'), tr('Lire l’album depuis le début', 'Play album from the start'))
    all.onclick = () => this.choose(track, 0)
    this.detailRows = [all]
    const songs = document.createElement('div')
    songs.className = 'jb-album-songs'
    track.songs.forEach((song, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'jb-album-song'
      const number = document.createElement('span')
      number.className = 'jb-album-number'
      number.textContent = String(index + 1).padStart(2, '0')
      const title = document.createElement('strong')
      title.textContent = song.title
      const duration = document.createElement('span')
      duration.textContent = clock(song.duration)
      button.append(number, title, duration, icon('play'))
      button.onclick = () => this.choose(track, index)
      button.onpointerenter = () => this.select(index + 1, false)
      this.detailRows.push(button)
      songs.append(button)
    })
    this.detail.replaceChildren(back, heading, all, songs)
    this.list.hidden = true
    this.detail.hidden = false
    const current = this.player?.current
    this.select(current?.track === track ? current.songIndex + 1 : 0)
    this.detailRows[this.selected]?.focus({ preventScroll: true })
  }

  private hideAlbum() {
    this.album = null
    this.detailRows = []
    if (this.detail) this.detail.hidden = true
    if (this.list) this.list.hidden = false
  }

  private choose(t?: Track, song = 0) {
    if (!t) return
    this.close()
    this.pick?.(t, song)
  }

  private updateControls() {
    const active = !!this.player?.current
    for (const [kind, button] of Object.entries(this.controls) as ['previous' | 'next' | 'loop' | 'shuffle', HTMLButtonElement][]) {
      button.disabled = !active
      if (kind === 'loop' || kind === 'shuffle') {
        const on = this.player?.options[kind] ?? false
        button.classList.toggle('active', on)
        button.setAttribute('aria-pressed', String(on))
      }
    }
    if (this.off) this.off.hidden = !active
  }

  private renderHero() {
    if (!this.hero) return
    this.updateControls()
    const current = this.player?.current
    if (!current) {
      this.rows.forEach(({ button }) => button.classList.remove('playing'))
      this.detailRows.forEach((button) => button.classList.remove('playing'))
      if (this.hero.classList.contains('empty')) return
      delete this.hero.dataset.song
      this.hero.replaceChildren()
      this.hero.classList.add('empty')
      const message = document.createElement('div')
      message.innerHTML = `<span class="jb-hero-eyebrow">${tr('À L’ÉCOUTE', 'NOW PLAYING')}</span><strong>${tr('À vous de choisir', 'Your turn to choose')}</strong><span>${tr('Une ambiance pour chaque traversée.', 'A soundtrack for every journey.')}</span>`
      this.hero.append(icon('music-notes'), message)
      return
    }
    this.hero.classList.remove('empty')
    const { track, song, songIndex, elapsed } = current
    const signature = `${track.id}:${songIndex}`
    if (this.hero.dataset.song !== signature) {
      this.hero.dataset.song = signature
      const img = document.createElement('img')
      img.src = coverUrl(track)
      img.alt = ''
      const body = document.createElement('div')
      body.className = 'jb-hero-body'
      const label = document.createElement('span')
      label.className = 'jb-hero-eyebrow'
      label.textContent = tr('À L’ÉCOUTE', 'NOW PLAYING')
      const name = document.createElement('strong')
      name.textContent = track.title
      const artist = document.createElement('span')
      artist.textContent = track.artist
      const songName = document.createElement('span')
      songName.className = 'jb-hero-song'
      songName.textContent = track.songs ? `${String(songIndex + 1).padStart(2, '0')} / ${track.songs.length} · ${song.title}` : STYLE_LABELS[track.style]
      const progress = document.createElement('div')
      progress.className = 'jb-progress'
      progress.append(document.createElement('span'))
      const time = document.createElement('span')
      time.className = 'jb-time'
      time.setAttribute('aria-hidden', 'true')
      body.append(label, name, artist, songName, progress, time)
      this.hero.replaceChildren(img, body)
    }
    const bar = this.hero.querySelector<HTMLElement>('.jb-progress span')
    if (bar) bar.style.width = `${Math.min(100, elapsed / track.duration * 100)}%`
    const time = this.hero.querySelector<HTMLElement>('.jb-time')
    if (time) time.textContent = `${clock(elapsed)} / ${clock(track.duration)}`
    this.rows.forEach(({ track: t, button }) => button.classList.toggle('playing', t === track))
    this.detailRows.forEach((button, i) => button.classList.toggle('playing', this.album === track && i === songIndex + 1))
  }

  close() {
    this.el.hidden = true
    this.hideAlbum()
    if (this.refreshTimer !== null) clearInterval(this.refreshTimer)
    this.refreshTimer = null
  }
}
