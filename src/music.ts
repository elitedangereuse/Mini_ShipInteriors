import * as THREE from 'three'
import { BASE } from './assets'
import type { Sound } from './audio'
import { tr } from './i18n'
import { icon } from './icons'
import { syncTempo } from './tempo'
import { $ } from './ui'

/*
 * Le jukebox : sept morceaux libres de droits (CC0 ou domaine public, cf.
 * public/assets/music/CREDITS.txt), joués depuis le jukebox, spatialisés. Un morceau fini, le
 * suivant de la liste enchaîne. La piste de danse, la boule à facettes et les danseurs battent
 * sur son tempo (cf. tempo.ts). Le relais transmet le choix aux autres (au pont principal, ou
 * aux quartiers où l'on se trouve), avec le temps écoulé : chacun retombe sur le même morceau,
 * au même endroit.
 */

export interface Track {
  id: string
  title: string
  artist: string
  mood: string
  /** Durée du fichier (s) : la liste s'enchaîne de façon prévisible, chez tous les joueurs. */
  duration: number
  /** Tempo et premier temps (s) ; null : pas de pulsation stable (la valse), la soirée garde le sien. */
  bpm: number | null
  offset: number
}

export const TRACKS: Track[] = [
  {
    id: 'danube', title: tr('Le Beau Danube bleu', 'The Blue Danube'), artist: 'U.S. Marine Band · J. Strauss II', duration: 203.1, bpm: null, offset: 0,
    mood: tr('La valse de l\'ordinateur d\'amarrage : détendez-vous, il s\'occupe de l\'approche.', 'The docking computer waltz: relax, it handles the approach.'),
  },
  {
    id: 'disco', title: 'Funky Disco Beats to Boogie/Woogie to', artist: 'Fupi', duration: 133.1, bpm: 110, offset: 0.005,
    mood: tr('Basse funky, cuivres et cordes : la boule à facettes tourne, tout le monde sur la piste !', 'Funky bass, brass and strings: the mirror ball is spinning, everybody on the dance floor!'),
  },
  {
    id: 'synthwave', title: 'Day Dreams', artist: 'HoliznaCC0', duration: 194.3, bpm: 130, offset: 0.005,
    mood: tr('Néons, arpèges et grosse caisse : virée nocturne rétro-futuriste.', 'Neon, arpeggios and a four-on-the-floor kick: a retro-futuristic night drive.'),
  },
  {
    id: 'lofi', title: 'Chills', artist: 'HoliznaCC0', duration: 174.9, bpm: 96, offset: 0.007,
    mood: tr('Saxo feutré et beat nonchalant pour décompresser entre deux sauts.', 'Mellow sax and a lazy beat to unwind between two jumps.'),
  },
  {
    id: 'space', title: 'Ganymede', artist: 'congusbongus', duration: 183.3, bpm: 118, offset: 0.211,
    mood: tr('Spacesynth en orbite de Jupiter : arpèges cosmiques pour danser en apesanteur.', 'Spacesynth in orbit around Jupiter: cosmic arpeggios for zero-g dancing.'),
  },
  {
    id: 'chiptune', title: 'Interstellar Fleet 1', artist: 'Zane Little Music', duration: 193.2, bpm: 130, offset: 0.005,
    mood: tr('8-bit héroïque pour pilotes d\'élite : la borne d\'arcade de la flotte.', 'Heroic 8-bit for Elite pilots: the fleet\'s arcade cabinet.'),
  },
  {
    id: 'lounge', title: 'Two Left Socks', artist: 'congusbongus', duration: 200.2, bpm: 135, offset: 0.215,
    mood: tr('Bossa nova d\'ascenseur en synthé FM : cocktail au bar du carrier.', 'FM-synth elevator bossa nova: cocktails at the carrier bar.'),
  },
]

export const trackById = (id: string | null | undefined) => TRACKS.find((t) => t.id === id) ?? null
const nextTrack = (t: Track) => TRACKS[(TRACKS.indexOf(t) + 1) % TRACKS.length]
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** Un jukebox qui joue : son morceau, spatialisé à sa place, qu'on n'entend que sur son pont. */
export class JukeboxPlayer {
  private readonly audio = new Audio()
  private node: ReturnType<Sound['speaker']> = null
  private readonly at = new THREE.Vector3()
  private audible = true
  /** Morceau en cours (null : le jukebox se tait). */
  track: Track | null = null
  /** Un morceau démarre (choisi, ou le suivant qui enchaîne). */
  onTrack?: (track: Track) => void

  constructor(
    private readonly sound: Sound,
    private readonly volume: number,
  ) {
    this.audio.preload = 'auto'
    this.audio.addEventListener('ended', () => {
      if (this.track) this.play(nextTrack(this.track), this.at, 0)
    })
  }

  /**
   * Joue `track` depuis `position` secondes ; au-delà de sa fin, la liste a enchaîné (on
   * rejoint une soirée commencée plus tôt).
   */
  play(track: Track, at: THREE.Vector3, position = 0) {
    let t = track, p = Math.max(0, position)
    for (let i = 0; i < 64 && p >= t.duration; i++) {
      p -= t.duration
      t = nextTrack(t)
    }
    this.track = t
    this.at.copy(at)
    this.attach()
    this.node?.move(this.at)
    this.audio.src = `${BASE}music/${t.id}.mp3#t=${p.toFixed(2)}`
    void this.audio.play().catch(() => {})
    this.onTrack?.(t)
  }

  /**
   * Branche le jukebox sur le son du jeu (volume général, spatialisation). Avant le premier geste
   * du joueur, le son n'a pas démarré : le morceau tourne en muet, pour rester à l'heure.
   */
  private attach() {
    if (this.node) return
    this.node = this.sound.speaker(this.at, this.audible ? this.volume : 0, 2.2, 1.1)
    this.audio.muted = !this.node
    if (!this.node) return
    this.sound.ctx.createMediaElementSource(this.audio).connect(this.node.input)
    this.node.move(this.at)
  }

  stop() {
    this.track = null
    this.audio.pause()
    this.audio.removeAttribute('src')
    this.audio.load()
  }

  /** On l'entend sur son pont seulement (fondu). */
  setAudible(on: boolean) {
    if (on === this.audible) return
    this.audible = on
    if (this.node) this.sound.fade(this.node.input, on ? this.volume : 0, 0.8)
  }

  /** Cale la soirée sur le morceau (si on l'entend et qu'il a un tempo) ; false sinon. */
  syncTempo(): boolean {
    if (this.track && !this.node) this.attach()
    if (!this.audible || !this.track?.bpm || this.audio.paused) return false
    syncTempo({ bpm: this.track.bpm, offset: this.track.offset }, this.audio.currentTime)
    return true
  }
}

/**
 * Panneau du jukebox : la liste des morceaux (le morceau en cours marqué), et de quoi l'arrêter.
 * Au clavier : haut, bas, Entrée ; E ou Échap pour fermer (cf. main.ts).
 */
export class JukeboxPanel {
  private readonly el: HTMLDivElement
  private rows: HTMLButtonElement[] = []
  private selected = 0
  private pick?: (t: Track) => void

  constructor() {
    this.el = document.createElement('div')
    this.el.className = 'panel jukebox'
    this.el.hidden = true
    $('hud').append(this.el)
  }

  get isOpen(): boolean {
    return !this.el.hidden
  }

  contains(target: EventTarget | null): boolean {
    return target instanceof Node && this.el.contains(target)
  }

  open(current: Track | null, pick: (t: Track) => void, stop: () => void) {
    this.pick = pick
    const title = document.createElement('div')
    title.className = 'lift-title'
    title.append(icon('vinyl-record'), tr(' Jukebox', ' Jukebox'))
    const list = document.createElement('div')
    list.className = 'jb-list'
    this.rows = TRACKS.map((t, i) => {
      const b = document.createElement('button')
      b.className = t === current ? 'playing' : ''
      const name = document.createElement('span')
      name.className = 'jb-title'
      name.textContent = t.title
      const by = document.createElement('span')
      by.className = 'jb-artist'
      by.textContent = `${t.artist} · ${clock(t.duration)}`
      const mood = document.createElement('span')
      mood.className = 'jb-mood'
      mood.textContent = t.mood
      b.append(icon(t === current ? 'music-notes' : 'play'), name, by, mood)
      b.onclick = () => this.choose(i)
      b.onpointerenter = () => this.select(i)
      return b
    })
    list.append(...this.rows)
    const actions = document.createElement('div')
    actions.className = 'jb-actions'
    if (current) {
      const off = document.createElement('button')
      off.append(icon('stop'), tr('Arrêter la musique', 'Stop the music'))
      off.onclick = () => {
        this.close()
        stop()
      }
      actions.append(off)
    }
    const close = document.createElement('button')
    close.className = 'lift-close'
    close.append(tr('Fermer', 'Close'))
    for (const key of ['E', tr('Échap', 'Esc')]) {
      const k = document.createElement('kbd')
      k.textContent = key
      close.append(k)
    }
    close.onclick = () => this.close()
    actions.append(close)
    const hint = document.createElement('div')
    hint.className = 'lift-hint'
    hint.textContent = tr('↑ ↓ choisir · Entrée : jouer', '↑ ↓ choose · Enter: play')
    this.el.replaceChildren(title, list, hint, actions)
    this.selected = -1
    this.select(Math.max(0, current ? TRACKS.indexOf(current) : 0))
    this.el.hidden = false
  }

  move(step: number) {
    this.select((this.selected + step + this.rows.length) % this.rows.length)
  }

  confirm() {
    this.choose(this.selected)
  }

  private select(i: number) {
    this.rows[this.selected]?.classList.remove('selected')
    this.selected = i
    this.rows[i]?.classList.add('selected')
    this.rows[i]?.scrollIntoView({ block: 'nearest' })
  }

  private choose(i: number) {
    const t = TRACKS[i]
    if (!t) return
    this.close()
    this.pick?.(t)
  }

  close() {
    this.el.hidden = true
  }
}
