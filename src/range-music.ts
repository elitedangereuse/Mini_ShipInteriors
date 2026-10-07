import type { Sound } from './audio'

/*
 * Musique du stand de tir : elle n'est pas enregistrée, elle se joue à mesure, et suit la partie.
 * Un séquenceur à seize pas par mesure, en ré mineur, sur quatre accords (ré, ré, si bémol, do) :
 *
 * - arme en main, avant le premier tir : une nappe et un charleston clairsemé, on attend ;
 * - au premier tir : la grosse caisse entre, sur chaque temps, avec une basse en croches ;
 * - à chaque palier, une couche de plus : les charlestons en doubles croches, puis la caisse
 *   claire et la basse qui roule, puis l'arpège, puis son octave ; et le tempo monte ;
 * - dans les dix dernières secondes : le tempo s'emballe et la caisse claire roule en fin de mesure.
 *
 * Les notes sont programmées un quart de seconde à l'avance sur l'horloge audio (`update`, à chaque
 * image) : la musique ne dépend pas de la cadence d'affichage. `pulse` donne le battement de la
 * grosse caisse, pour que les lumières du stand le suivent.
 */

/** Ce que la partie donne à la musique. */
export interface RangeMood {
  /** Le chrono tourne (depuis le premier tir). */
  started: boolean
  /** Palier atteint. */
  level: number
  /** Dix dernières secondes. */
  rush: boolean
}

/** Accords, une mesure chacun : fondamentale de la basse (Hz), et les quatre notes de l'arpège. */
const CHORDS: { bass: number; arp: number[] }[] = [
  { bass: 73.42, arp: [293.66, 349.23, 440, 587.33] },
  { bass: 73.42, arp: [293.66, 440, 349.23, 587.33] },
  { bass: 58.27, arp: [233.08, 293.66, 349.23, 466.16] },
  { bass: 65.41, arp: [261.63, 329.63, 392, 523.25] },
]
/** Avance de programmation (secondes) : assez pour une image qui traîne, pas assez pour qu'un palier tarde à s'entendre. */
const AHEAD = 0.25

export class RangeMusic {
  private out: GainNode | null = null
  private bus: AudioNode | null = null
  /** Prochain pas à programmer : son instant (horloge audio) et son numéro depuis le début. */
  private next = 0
  private step = 0
  /** Instants des derniers coups de grosse caisse programmés. */
  private kicks: number[] = []

  constructor(private sound: Sound) {}

  private get ctx(): AudioContext {
    return this.sound.ctx
  }

  get playing(): boolean {
    return !!this.out
  }

  start() {
    if (this.out) return
    const voice = this.sound.voice(null, 1)
    if (!voice) return
    const ctx = this.ctx
    this.out = ctx.createGain()
    this.out.gain.setValueAtTime(0, ctx.currentTime)
    this.out.gain.linearRampToValueAtTime(0.6, ctx.currentTime + 1.2)
    this.out.connect(voice)
    // Un écho court, pour l'arpège et la caisse claire : il donne de l'espace sans réverbération.
    const delay = ctx.createDelay(0.5)
    delay.delayTime.value = 0.19
    const feedback = ctx.createGain()
    feedback.gain.value = 0.3
    delay.connect(feedback).connect(delay)
    delay.connect(this.out)
    this.bus = delay
    this.next = ctx.currentTime + 0.1
    this.step = 0
    this.kicks = []
  }

  /** La partie s'arrête : la musique s'éteint en une demi-seconde. */
  stop() {
    const out = this.out
    if (!out) return
    this.out = this.bus = null
    const t = this.ctx.currentTime
    out.gain.cancelScheduledValues(t)
    out.gain.setValueAtTime(out.gain.value, t)
    out.gain.linearRampToValueAtTime(0, t + 0.5)
    setTimeout(() => out.disconnect(), 1500)
  }

  /** Battement de la grosse caisse : 1 au coup, puis il retombe (0 quand elle se tait). */
  get pulse(): number {
    if (!this.out) return 0
    const now = this.ctx.currentTime
    let last = -1
    for (const t of this.kicks) if (t <= now) last = t
    return last < 0 ? 0 : Math.exp(-(now - last) * 7)
  }

  /** Programme les pas à venir. À appeler à chaque image. */
  update(mood: RangeMood) {
    if (!this.out) return
    const now = this.ctx.currentTime
    // Onglet resté en arrière-plan, image très longue : on reprend d'ici, sans rattraper le retard.
    if (this.next < now - 0.05) this.next = now + 0.02
    while (this.next < now + AHEAD) {
      const bpm = (116 + 5 * Math.min(mood.level, 6)) * (mood.rush ? 1.08 : 1)
      this.play(this.step, this.next, mood)
      this.next += 60 / bpm / 4
      this.step++
    }
    this.kicks = this.kicks.filter((t) => t > now - 1)
  }

  /** Les notes du pas `n`, à l'instant `t`. */
  private play(n: number, t: number, mood: RangeMood) {
    const out = this.out!, bus = this.bus!
    const s = n % 16, chord = CHORDS[Math.floor(n / 16) % CHORDS.length]
    const level = mood.started ? mood.level + (mood.rush ? 1 : 0) : -1
    // Nappe : une note tenue par mesure, deux dents de scie et leur quinte, très en retrait.
    if (s === 0) for (const [f, detune] of [[chord.bass * 2, -8], [chord.bass * 2, 8], [chord.bass * 3, 0]]) this.tone(out, 'sawtooth', f, f, t, 2.4, 0.05, 700, detune, 0.5)
    if (level < 0) {
      // On attend le premier tir : un charleston sur le temps, c'est tout.
      if (s % 8 === 0) this.noise(out, t, 0.04, 7500, 0.16)
      return
    }
    if (s % 4 === 0) {
      this.kick(out, t)
      this.kicks.push(t)
    }
    // Basse : en croches à contretemps, puis, deux paliers plus haut, elle roule en doubles croches entre les coups.
    if (level >= 2 ? s % 4 !== 0 : s % 4 === 2) this.tone(out, 'sawtooth', chord.bass * (s === 14 ? 2 : 1), chord.bass * (s === 14 ? 2 : 1), t, 0.13, 0.2, 420 + 160 * Math.min(level, 5), 0, 0.004)
    if (level >= 1) this.noise(out, t, s % 4 === 2 ? 0.07 : 0.03, 8000, s % 4 === 2 ? 0.17 : 0.1)
    if (level >= 2 && (s === 4 || s === 12)) this.snare(bus, out, t, 0.36)
    // Arpège : les notes de l'accord en doubles croches, une octave plus haut au dernier étage.
    if (level >= 3) {
      const f = chord.arp[(s + (s >> 2)) % 4] * (level >= 4 && s % 2 ? 2 : 1)
      this.tone(bus, 'square', f, f, t, 0.11, 0.055, 2400, 0, 0.004)
      this.tone(out, 'square', f, f, t, 0.11, 0.07, 2400, 0, 0.004)
    }
    // Dix dernières secondes : la caisse claire roule sur le dernier temps de la mesure, de plus en plus fort.
    if (mood.rush && s >= 12) this.snare(bus, out, t, 0.12 + (s - 12) * 0.06)
  }

  private kick(out: AudioNode, t: number) {
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    osc.frequency.setValueAtTime(150, t)
    osc.frequency.exponentialRampToValueAtTime(44, t + 0.11)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, t)
    env.gain.linearRampToValueAtTime(0.55, t + 0.004)
    env.gain.exponentialRampToValueAtTime(0.0008, t + 0.22)
    osc.connect(env).connect(out)
    osc.start(t)
    osc.stop(t + 0.25)
    this.noise(out, t, 0.012, 3000, 0.12)
  }

  private snare(echo: AudioNode, out: AudioNode, t: number, peak: number) {
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.sound.noiseBuffer
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 1900
    band.Q.value = 0.8
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, t)
    env.gain.linearRampToValueAtTime(peak, t + 0.003)
    env.gain.exponentialRampToValueAtTime(0.0008, t + 0.13)
    src.connect(band).connect(env)
    env.connect(out)
    const send = ctx.createGain()
    send.gain.value = 0.35
    env.connect(send).connect(echo)
    src.start(t, Math.random() * 0.5)
    src.stop(t + 0.16)
    this.tone(out, 'sine', 210, 150, t, 0.07, peak * 0.6, 4000, 0, 0.002)
  }

  /** Souffle bref et aigu : charleston, claquement de la grosse caisse. */
  private noise(out: AudioNode, t: number, len: number, freq: number, peak: number) {
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.sound.noiseBuffer
    const high = ctx.createBiquadFilter()
    high.type = 'highpass'
    high.frequency.value = freq
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, t)
    env.gain.linearRampToValueAtTime(peak, t + 0.002)
    env.gain.exponentialRampToValueAtTime(0.0008, t + len)
    src.connect(high).connect(env).connect(out)
    src.start(t, Math.random() * 0.5)
    src.stop(t + len + 0.02)
  }

  /** Note : un oscillateur derrière un passe-bas (`cutoff`), qui monte en `attack` secondes et retombe en `len`. */
  private tone(out: AudioNode, type: OscillatorType, f0: number, f1: number, t: number, len: number, peak: number, cutoff: number, detune: number, attack: number) {
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    osc.type = type
    osc.detune.value = detune
    osc.frequency.setValueAtTime(f0, t)
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + len)
    const low = ctx.createBiquadFilter()
    low.type = 'lowpass'
    low.frequency.value = cutoff
    low.Q.value = 1.2
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, t)
    env.gain.linearRampToValueAtTime(peak, t + attack)
    env.gain.exponentialRampToValueAtTime(0.0008, t + len)
    osc.connect(low).connect(env).connect(out)
    osc.start(t)
    osc.stop(t + len + 0.03)
  }
}
