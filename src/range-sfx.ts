import type * as THREE from 'three'
import type { Sound } from './audio'
import type { WeaponId } from './range-weapons'

/*
 * Bruitages du stand de tir, synthétisés (Web Audio) : des blasters, pas des armes à feu. Chaque
 * tir superpose un « zap » (une porteuse modulée en fréquence qui plonge), un claquement de bruit
 * et un coup sourd ; chaque arme a son timbre. Les cibles éclatent comme de la céramique, les murs
 * grésillent, le chargeur s'éjecte et se réarme avec un sifflement de condensateur.
 *
 * `pos` : là où cela se passe (monde) ; null : à l'oreille, non spatialisé.
 */

type Pos = THREE.Vector3 | null

export class RangeSfx {
  constructor(private sound: Sound) {}

  private get ctx(): AudioContext {
    return this.sound.ctx
  }

  /** Oscillateur qui glisse de `f0` à `f1` en `len` secondes, à attaque franche et chute exponentielle. */
  private sweep(out: AudioNode, type: OscillatorType, f0: number, f1: number, t: number, len: number, peak: number): OscillatorNode {
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(f0, t)
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + len)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(peak, t + 0.004)
    env.gain.exponentialRampToValueAtTime(0.0008, t + len)
    osc.connect(env).connect(out)
    osc.start(t)
    osc.stop(t + len + 0.03)
    return osc
  }

  /** Modulation de fréquence : `depth` Hz d'écart, à `ratio` fois la porteuse, qui s'éteint en `len`. */
  private fm(carrier: OscillatorNode, freq: number, depth: number, t: number, len: number) {
    const ctx = this.ctx
    const mod = ctx.createOscillator()
    mod.frequency.setValueAtTime(freq, t)
    mod.frequency.exponentialRampToValueAtTime(Math.max(1, freq * 0.25), t + len)
    const amount = ctx.createGain()
    amount.gain.setValueAtTime(depth, t)
    amount.gain.exponentialRampToValueAtTime(1, t + len)
    mod.connect(amount).connect(carrier.frequency)
    mod.start(t)
    mod.stop(t + len + 0.03)
  }

  /** Bouffée de bruit filtré, dont le filtre glisse de `f0` à `f1`. */
  private burst(out: AudioNode, kind: BiquadFilterType, f0: number, f1: number, q: number, t: number, len: number, peak: number) {
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.sound.noiseBuffer
    const filter = ctx.createBiquadFilter()
    filter.type = kind
    filter.Q.value = q
    filter.frequency.setValueAtTime(f0, t)
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + len)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(peak, t + 0.003)
    env.gain.exponentialRampToValueAtTime(0.0008, t + len)
    src.connect(filter).connect(env).connect(out)
    src.start(t, Math.random() * 0.5)
    src.stop(t + len + 0.03)
  }

  /** Note de cloche : une sinusoïde et son partiel, qui sonnent `len` secondes. */
  private bell(out: AudioNode, f: number, t: number, len: number, peak: number) {
    this.sweep(out, 'sine', f, f * 0.995, t, len, peak)
    this.sweep(out, 'sine', f * 2.76, f * 2.74, t, len * 0.45, peak * 0.35)
  }

  /** Un tir. `pitch` : hauteur (autour de 1), tirée au hasard par le jeu pour qu'aucun tir ne sonne comme le précédent. */
  shot(weapon: WeaponId, pos: Pos, pitch: number) {
    const out = this.sound.voice(pos, weapon === 'rifle' ? 0.5 : weapon === 'smg' ? 0.38 : 0.42, 2.5, 1)
    if (!out) return
    const t = this.ctx.currentTime + 0.004
    if (weapon === 'pistol') {
      // « Piou » rond : la porteuse plonge de deux octaves et demie, la modulation lui donne son grain.
      const zap = this.sweep(out, 'triangle', 1750 * pitch, 240 * pitch, t, 0.17, 0.7)
      this.fm(zap, 2600 * pitch, 900, t, 0.12)
      this.sweep(out, 'square', 880 * pitch, 150 * pitch, t, 0.1, 0.16)
      this.burst(out, 'highpass', 3200, 1800, 0.7, t, 0.035, 0.5)
      this.sweep(out, 'sine', 190, 60, t, 0.13, 0.9)
    } else if (weapon === 'smg') {
      // Sec et aigu, sans traîne : il doit s'enchaîner onze fois par seconde sans bouillie.
      const zap = this.sweep(out, 'sawtooth', 2500 * pitch, 520 * pitch, t, 0.075, 0.45)
      this.fm(zap, 3900 * pitch, 1300, t, 0.05)
      this.sweep(out, 'triangle', 1250 * pitch, 330 * pitch, t, 0.06, 0.3)
      this.burst(out, 'bandpass', 4200, 2400, 1.2, t, 0.03, 0.55)
      this.sweep(out, 'sine', 230, 110, t, 0.06, 0.6)
    } else {
      // Décharge lourde : un jappement aigu, puis le plasma qui gronde et s'éteint dans le grave.
      this.sweep(out, 'square', 3400 * pitch, 900 * pitch, t, 0.045, 0.3)
      const zap = this.sweep(out, 'sawtooth', 1100 * pitch, 62 * pitch, t, 0.5, 0.6)
      this.fm(zap, 180 * pitch, 520, t, 0.42)
      this.sweep(out, 'triangle', 1650 * pitch, 90 * pitch, t, 0.36, 0.35)
      this.sweep(out, 'sine', 120, 34, t, 0.5, 1)
      this.burst(out, 'lowpass', 5200, 260, 0.8, t, 0.55, 0.42)
      this.burst(out, 'highpass', 2600, 2200, 0.7, t, 0.04, 0.6)
    }
  }

  /** Une cible éclate ; en plein centre, deux notes de carillon par-dessus. */
  hit(pos: Pos, bullseye: boolean, pitch: number) {
    const out = this.sound.voice(pos, 0.5, 3, 0.8)
    if (!out) return
    const t = this.ctx.currentTime + 0.004
    this.burst(out, 'bandpass', 4200, 1700, 1.1, t, 0.11, 0.8)
    for (const [f, len, peak] of [[1180, 0.16, 0.45], [1735, 0.12, 0.3], [2590, 0.09, 0.22]]) this.sweep(out, 'sine', f * pitch, f * pitch * 0.97, t, len, peak)
    this.sweep(out, 'sine', 260, 105, t, 0.09, 0.7)
    if (!bullseye) return
    const chime = this.sound.voice(null, 0.16)
    if (!chime) return
    this.bell(chime, 1568, t + 0.02, 0.42, 0.8)
    this.bell(chime, 2349, t + 0.09, 0.5, 0.7)
  }

  /** Une balle perdue grésille sur le mur. */
  wall(pos: Pos, pitch: number) {
    const out = this.sound.voice(pos, 0.34, 2.5, 1)
    if (!out) return
    const t = this.ctx.currentTime + 0.004
    this.burst(out, 'bandpass', 5200 * pitch, 1400, 2.2, t, 0.14, 0.8)
    this.sweep(out, 'sine', 2100 * pitch, 640, t, 0.1, 0.25)
    this.sweep(out, 'sine', 170, 80, t, 0.06, 0.5)
  }

  /** Le chargeur s'éjecte : un claquement, et le condensateur qui se vide. */
  reload() {
    const out = this.sound.voice(null, 0.3)
    if (!out) return
    const t = this.ctx.currentTime + 0.004
    this.clack(out, t, 0.9)
    this.sweep(out, 'sawtooth', 820, 190, t + 0.03, 0.26, 0.12)
  }

  /** Le chargeur neuf est en place : claquement, le condensateur se recharge, un bip. */
  loaded() {
    const out = this.sound.voice(null, 0.3)
    if (!out) return
    const t = this.ctx.currentTime + 0.004
    this.clack(out, t, 1.25)
    const whine = this.sweep(out, 'triangle', 380, 1500, t + 0.02, 0.2, 0.2)
    this.fm(whine, 60, 40, t + 0.02, 0.2)
    this.sweep(out, 'sine', 1760, 1760, t + 0.2, 0.08, 0.3)
  }

  /** Détente pressée, chargeur vide. */
  dry() {
    const out = this.sound.voice(null, 0.22)
    if (!out) return
    const t = this.ctx.currentTime + 0.004
    this.burst(out, 'highpass', 2600, 2000, 0.7, t, 0.018, 0.7)
    this.sweep(out, 'square', 520, 300, t, 0.035, 0.25)
  }

  /** On décroche une arme du mur (ou on l'y remet, plus grave). */
  take(back = false) {
    const out = this.sound.voice(null, 0.28)
    if (!out) return
    const t = this.ctx.currentTime + 0.004
    this.clack(out, t, back ? 0.8 : 1.1)
    const notes = back ? [880, 587] : [587, 880, 1175]
    notes.forEach((f, i) => this.sweep(out, 'triangle', f, f, t + 0.04 + i * 0.055, 0.09, 0.3))
  }

  /** Palier franchi, fin de la manche : les airs des bornes. */
  tier() { this.sound.jingle('win') }
  end() { this.sound.jingle('lose') }

  /** Claquement mécanique : une bouffée de bruit sourde et un coup. */
  private clack(out: AudioNode, t: number, pitch: number) {
    this.burst(out, 'lowpass', 2400 * pitch, 700 * pitch, 0.9, t, 0.04, 0.9)
    this.sweep(out, 'sine', 300 * pitch, 130 * pitch, t, 0.05, 0.7)
  }
}
