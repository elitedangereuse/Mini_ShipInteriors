import * as THREE from 'three'
import type { Sound } from '../audio'

/*
 * Bruitages de la baie infestée, synthétisés (Web Audio), sans musique : les grognements et les
 * pas des ennemis (des indices de leur proximité), le cœur qui s'emballe quand l'un d'eux est
 * tout près, le chuintement d'une fusée, le claquement des casiers, le détecteur de cargaison,
 * le dépôt au sas, la capture. Les sons de la scène passent par l'écho (cf. Sound.setEcho).
 */

export class SalvageSfx {
  constructor(private sound: Sound) {}

  private get ctx(): AudioContext {
    return this.sound.ctx
  }

  /** Oscillateur à enveloppe (attaque, maintien, relâche), branché sur `out`. */
  private tone(out: AudioNode, type: OscillatorType, f0: number, f1: number, t: number, len: number, peak = 1) {
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(f0, t)
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + len)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(peak, t + Math.min(0.02, len * 0.2))
    env.gain.setTargetAtTime(0, t + len * 0.6, len * 0.25)
    osc.connect(env).connect(out)
    osc.start(t)
    osc.stop(t + len + 0.2)
  }

  /** Souffle de bruit filtré (passe-bande), à enveloppe. */
  private hiss(out: AudioNode, t: number, len: number, freq: number, q: number, peak = 1, to?: number) {
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.sound.noiseBuffer
    src.loop = len > 0.9
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.setValueAtTime(freq, t)
    if (to) band.frequency.exponentialRampToValueAtTime(to, t + len)
    band.Q.value = q
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(peak, t + Math.min(0.05, len * 0.2))
    env.gain.setTargetAtTime(0, t + len * 0.7, len * 0.15)
    src.connect(band).connect(env).connect(out)
    src.start(t, Math.random() * 0.5)
    src.stop(t + len + 0.3)
  }

  /** Grognement rauque d'un ennemi : une voix grave qui râle, vibrée, dans un formant. */
  groan(pos: THREE.Vector3, angry = false) {
    const out = this.sound.voice(pos, angry ? 0.5 : 0.32, 1.4, 1.1)
    if (!out) return
    const ctx = this.ctx
    const t = ctx.currentTime + 0.01
    const len = angry ? 0.9 : 1.2 + Math.random() * 0.8
    const pitch = (angry ? 1.4 : 1) * (0.85 + Math.random() * 0.3)
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(70 * pitch, t)
    osc.frequency.linearRampToValueAtTime(95 * pitch, t + len * 0.35)
    osc.frequency.linearRampToValueAtTime(58 * pitch, t + len)
    const vib = ctx.createOscillator()
    vib.frequency.value = angry ? 13 : 6 + Math.random() * 4
    const depth = ctx.createGain()
    depth.gain.value = angry ? 14 : 7
    vib.connect(depth).connect(osc.frequency)
    const formant = ctx.createBiquadFilter()
    formant.type = 'bandpass'
    formant.frequency.setValueAtTime(angry ? 700 : 420, t)
    formant.frequency.linearRampToValueAtTime(angry ? 1100 : 560, t + len * 0.4)
    formant.frequency.linearRampToValueAtTime(380, t + len)
    formant.Q.value = 2.5
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(1, t + 0.12)
    env.gain.linearRampToValueAtTime(0.7, t + len * 0.7)
    env.gain.linearRampToValueAtTime(0, t + len)
    osc.connect(formant).connect(env).connect(out)
    osc.start(t)
    vib.start(t)
    osc.stop(t + len + 0.05)
    vib.stop(t + len + 0.05)
    this.hiss(out, t, len, angry ? 1400 : 900, 1.2, angry ? 0.7 : 0.45)
  }

  /** Il vous a vu : un cri qui monte, et un coup sourd. */
  shriek(pos: THREE.Vector3) {
    const out = this.sound.voice(pos, 0.45, 1.6, 1)
    if (!out) return
    const t = this.ctx.currentTime + 0.01
    this.tone(out, 'sawtooth', 180, 420, t, 0.5, 0.8)
    this.tone(out, 'square', 240, 560, t + 0.02, 0.45, 0.4)
    this.hiss(out, t, 0.6, 2200, 2, 0.8, 800)
  }

  /** Pas lourds et traînants d'un ennemi (le pas du vaisseau, plus grave). */
  step(pos: THREE.Vector3, running: boolean) {
    this.sound.play('step', pos, { volume: running ? 0.22 : 0.15, rate: 0.62 + Math.random() * 0.08, ref: 1.3, rolloff: 1.3 })
  }

  /** Battement de cœur (non spatialisé) ; `fear` de 0 à 1 le rend plus fort. */
  heartbeat(fear: number) {
    const out = this.sound.voice(null, 0.1 + fear * 0.28)
    if (!out) return
    const t = this.ctx.currentTime + 0.01
    for (const [dt, k] of [[0, 1], [0.16, 0.7]] as const) {
      this.tone(out, 'sine', 62, 38, t + dt, 0.16, k)
    }
  }

  /** Fusée allumée : un craquement, puis un chuintement qui dure `burn` secondes. */
  flare(pos: THREE.Vector3, burn: number) {
    const out = this.sound.voice(pos, 0.3, 1.3, 1.1)
    if (!out) return
    const t = this.ctx.currentTime + 0.01
    this.hiss(out, t, 0.18, 3200, 1, 1)
    this.hiss(out, t + 0.1, burn, 2600, 0.7, 0.35)
  }

  /** Porte de casier : un claquement métallique (plus fort quand on en est éjecté ou tiré). */
  locker(pos: THREE.Vector3, loud = false) {
    const out = this.sound.voice(pos, loud ? 0.4 : 0.22, 1.2, 1.3)
    if (!out) return
    const t = this.ctx.currentTime + 0.01
    this.tone(out, 'square', 320, 180, t, 0.08, 0.6)
    this.tone(out, 'triangle', 1240, 900, t + 0.01, 0.22, 0.25)
    this.hiss(out, t, 0.1, 1800, 1.5, 0.6)
  }

  /** Casier fouillé : on secoue la porte, plusieurs fois. */
  rattle(pos: THREE.Vector3) {
    const out = this.sound.voice(pos, 0.3, 1.2, 1.2)
    if (!out) return
    const t = this.ctx.currentTime + 0.01
    for (let i = 0; i < 4; i++) this.tone(out, 'square', 260 + Math.random() * 60, 150, t + i * 0.18, 0.06, 0.5)
  }

  /** Colis ramassé : deux notes claires. */
  pickup() {
    const out = this.sound.voice(null, 0.1)
    if (!out) return
    const t = this.ctx.currentTime + 0.01
    this.tone(out, 'triangle', 660, 660, t, 0.1)
    this.tone(out, 'triangle', 990, 990, t + 0.09, 0.16)
  }

  /** Colis livré au sas : un arpège qui monte, et le monte-charge. */
  deposit() {
    const out = this.sound.voice(null, 0.1)
    if (!out) return
    const t = this.ctx.currentTime + 0.01
    ;[523, 659, 784, 1047].forEach((f, i) => this.tone(out, 'triangle', f, f, t + i * 0.08, 0.14))
    this.hiss(out, t, 1.2, 400, 0.8, 0.4, 900)
  }

  /** Capture : un rugissement et un choc sourd, pour celui qui est attrapé comme pour son équipe. */
  capture(pos: THREE.Vector3 | null) {
    const out = this.sound.voice(pos, pos ? 0.55 : 0.4, 1.8, 1)
    if (!out) return
    const t = this.ctx.currentTime + 0.01
    this.tone(out, 'sawtooth', 120, 60, t, 0.9, 0.9)
    this.tone(out, 'sine', 90, 30, t + 0.25, 0.4, 1)
    this.hiss(out, t, 0.9, 700, 1, 0.9, 300)
  }

  /** Détecteur de cargaison : un bip, plus aigu quand le colis est proche. */
  detector(near: number) {
    const out = this.sound.voice(null, 0.035 + near * 0.03)
    if (!out) return
    const t = this.ctx.currentTime + 0.005
    const f = 880 + near * 700
    this.tone(out, 'sine', f, f, t, 0.07)
  }

  /** Ramasser une fusée, ou n'en rien pouvoir faire. */
  click(ok = true) {
    const out = this.sound.voice(null, 0.07)
    if (!out) return
    const t = this.ctx.currentTime + 0.005
    this.tone(out, 'square', ok ? 1200 : 300, ok ? 1500 : 220, t, 0.06)
  }

  /** Fin de mission : victoire (fanfare brève) ou défaite (trois notes qui tombent). */
  end(won: boolean) {
    const out = this.sound.voice(null, 0.09)
    if (!out) return
    const t = this.ctx.currentTime + 0.01
    if (won) [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(out, 'triangle', f, f, t + i * 0.1, i === 5 ? 0.4 : 0.12))
    else [392, 330, 262, 196].forEach((f, i) => this.tone(out, 'sawtooth', f, f * 0.98, t + i * 0.22, 0.26, 0.6))
  }
}
