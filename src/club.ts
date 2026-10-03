import { BASE } from './assets'
import type { Sound } from './audio'
import { syncTempo } from './tempo'
import { CLUB_ROOM } from '../shared/ship-layouts.js'

/*
 * La musique du Zorb, la boîte de nuit des aliens de la cale (cf. levels.ts) : un seul morceau, en
 * boucle, que personne ne choisit. Dans la salle, on l'entend en plein ; du couloir et des pièces
 * voisines, étouffée derrière la porte, de plus en plus faible à mesure qu'on s'éloigne ; ailleurs,
 * pas du tout. Tous les joueurs l'entendent au même endroit du morceau (l'horloge de l'appareil
 * suffit : la boucle part de minuit), et la piste bat à son tempo.
 */

/** « Sewer Nightclub », de section31 (CC0, cf. public/assets/music/CREDITS.txt) : tempo et premier temps mesurés sur le MP3. */
const TRACK = { file: 'alien-club.mp3', duration: 139.64, bpm: 110.35, offset: 0.171 }

/** La porte du club (bord est de sa tuile) et le centre de la piste, sur le plan de la cale. */
const DOOR = { x: 3.5, z: 1 }
const FLOOR = { x: 1.5, z: 1.3 }

/**
 * Ce qu'on entend du club depuis la tuile d'un joueur de la cale : 1 dans la salle, de 0 à 1 dehors
 * (étouffé : fort devant la porte, plus rien à une dizaine de tuiles ; les murs en retiennent
 * davantage que le couloir).
 */
export function clubProximity(room: string | null, x: number, z: number): number {
  if (room === CLUB_ROOM) return 1
  if (!room) return 0
  const corridor = room === 'u'
  const from = corridor ? DOOR : FLOOR
  const k = 1 - Math.hypot(x - from.x, z - from.z) / (corridor ? 11 : 8)
  return Math.max(0, k) * (corridor ? 1 : 0.55)
}

export class ClubMusic {
  private readonly audio = new Audio()
  private output: GainNode | null = null
  private filter: BiquadFilterNode | null = null
  private inside = false
  private gain = -1

  constructor(
    private readonly sound: Sound,
    private readonly volume: number,
  ) {
    this.audio.preload = 'none'
    this.audio.loop = true
    this.audio.src = `${BASE}music/${TRACK.file}`
    // Parti après son chargement : on se recale sur l'horloge commune.
    this.audio.addEventListener('playing', () => this.align())
  }

  /** Où en est la boucle, la même pour tous. */
  private position(): number {
    return (Date.now() / 1000) % TRACK.duration
  }

  private align() {
    const at = this.position()
    const gap = Math.abs(this.audio.currentTime - at)
    if (gap > 0.25 && gap < TRACK.duration - 0.25) this.audio.currentTime = at
  }

  /**
   * À appeler à chaque image : `inside`, le joueur est dans la salle ; sinon `proximity` (de 0 à
   * 1, cf. clubProximity) règle ce qui filtre à travers la porte. Hors de portée, la lecture
   * s'arrête.
   */
  update(inside: boolean, proximity: number) {
    const gain = inside ? this.volume : this.volume * 0.3 * proximity
    if (gain <= 0.001) {
      if (!this.audio.paused) this.audio.pause()
      this.gain = -1
      return
    }
    // Avant le premier geste du joueur, le son n'a pas démarré.
    if (!this.sound.ready) return
    const ctx = this.sound.ctx
    if (!this.output || !this.filter) {
      this.filter = ctx.createBiquadFilter()
      this.filter.type = 'lowpass'
      this.filter.Q.value = 0.9
      this.filter.frequency.value = inside ? 16000 : 380
      this.output = ctx.createGain()
      this.output.gain.value = 0
      ctx.createMediaElementSource(this.audio).connect(this.filter).connect(this.output).connect(this.sound.listener.getInput())
    }
    if (this.audio.paused) {
      this.audio.currentTime = this.position()
      this.audio.play().catch(() => { /* lecture refusée : on réessaie à l'image suivante */ })
    }
    if (inside !== this.inside || this.gain < 0) {
      this.inside = inside
      // La porte passée, les aigus reviennent d'un coup ; dehors, il ne reste que les basses.
      const f = this.filter.frequency
      f.cancelScheduledValues(ctx.currentTime)
      f.setValueAtTime(f.value, ctx.currentTime)
      f.exponentialRampToValueAtTime(inside ? 16000 : 380, ctx.currentTime + 0.5)
    }
    if (Math.abs(gain - this.gain) > 0.004) {
      this.gain = gain
      this.output.gain.setTargetAtTime(gain, ctx.currentTime, 0.2)
    }
  }

  /** Dans la salle, la piste, les lumières et les danseurs battent sur le morceau ; false sinon. */
  syncTempo(): boolean {
    if (!this.inside || this.gain < 0 || this.audio.paused) return false
    syncTempo(TRACK, this.audio.currentTime)
    return true
  }
}
