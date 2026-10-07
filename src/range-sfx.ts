import type * as THREE from 'three'
import type { Sound } from './audio'
import type { WeaponId } from './range-weapons'

/*
 * Bruitages du stand de tir, synthétisés (Web Audio) : des armes à énergie, mais des armes. Un tir
 * est d'abord un coup (une sinusoïde grave qui plonge), un claquement (du bruit, bref et sec) et un
 * corps saturé (deux dents de scie désaccordées derrière un filtre qui se referme) ; le sifflement
 * de « laser » n'en est plus qu'un reflet. Tout passe par une réverbération de salle métallique,
 * qui donne aux tirs leur poids. Chaque arme a son timbre ; les cibles se brisent en éclats, les
 * murs grésillent, les chargeurs claquent.
 *
 * `pos` : là où cela se passe (monde) ; null : à l'oreille, non spatialisé.
 */

type Pos = THREE.Vector3 | null

/** Sortie d'un bruitage : `dry` va à l'oreille, `mix` y va aussi en passant par la salle. */
interface Bus {
  dry: AudioNode
  mix: AudioNode
}

export class RangeSfx {
  private room?: ConvolverNode
  private curves = new Map<number, Float32Array<ArrayBuffer>>()

  constructor(private sound: Sound) {}

  private get ctx(): AudioContext {
    return this.sound.ctx
  }

  /**
   * Réverbération du stand : une demi-seconde de bruit qui s'éteint, précédée de trois réflexions
   * nettes (les murs d'acier sont tout près). Fabriquée une fois, à la première détonation.
   */
  private get reverb(): ConvolverNode | null {
    if (this.room) return this.room
    const out = this.sound.voice(null, 0.9)
    if (!out) return null
    const ctx = this.ctx, rate = ctx.sampleRate, len = Math.floor(rate * 0.75)
    const impulse = ctx.createBuffer(2, len, rate)
    for (let c = 0; c < 2; c++) {
      const data = impulse.getChannelData(c)
      let smooth = 0
      for (let i = 0; i < len; i++) {
        const t = i / rate
        // Le grave dure plus que l'aigu : le bruit est lissé de plus en plus à mesure qu'il s'éteint.
        smooth += ((Math.random() * 2 - 1) - smooth) * Math.max(0.12, 1 - t * 2.2)
        data[i] = smooth * Math.exp(-t * 7.5)
      }
      for (const [at, gain] of [[0.011, 0.7], [0.023, -0.5], [0.039, 0.35]]) data[Math.floor((at + c * 0.003) * rate)] += gain
    }
    this.room = ctx.createConvolver()
    this.room.buffer = impulse
    this.room.connect(out)
    return this.room
  }

  /** Sortie d'un bruitage, à `volume`, dont `wet` part dans la salle. */
  private bus(pos: Pos, volume: number, wet: number): Bus | null {
    const dry = this.sound.voice(pos, volume, 2.5, 1)
    if (!dry) return null
    const mix = this.ctx.createGain()
    mix.connect(dry)
    const reverb = this.reverb
    if (reverb && wet > 0) {
      const send = this.ctx.createGain()
      send.gain.value = wet * volume
      mix.connect(send).connect(reverb)
    }
    return { dry, mix }
  }

  /** Saturation : écrase le signal (`amount` : de 1, à peine, à 6, très fort) et lui donne du grain. */
  private drive(out: AudioNode, amount: number): WaveShaperNode {
    let curve = this.curves.get(amount)
    if (!curve) {
      curve = new Float32Array(1024)
      for (let i = 0; i < 1024; i++) curve[i] = Math.tanh(((i / 511.5) - 1) * amount) / Math.tanh(amount)
      this.curves.set(amount, curve)
    }
    const shaper = this.ctx.createWaveShaper()
    shaper.curve = curve
    shaper.connect(out)
    return shaper
  }

  /** Oscillateur qui glisse de `f0` à `f1` en `len` secondes, à attaque franche et chute exponentielle. */
  private sweep(out: AudioNode, type: OscillatorType, f0: number, f1: number, t: number, len: number, peak: number, detune = 0) {
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    osc.type = type
    osc.detune.value = detune
    osc.frequency.setValueAtTime(f0, t)
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + len)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(peak, t + 0.003)
    env.gain.exponentialRampToValueAtTime(0.0008, t + len)
    osc.connect(env).connect(out)
    osc.start(t)
    osc.stop(t + len + 0.03)
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
    env.gain.linearRampToValueAtTime(peak, t + 0.002)
    env.gain.exponentialRampToValueAtTime(0.0008, t + len)
    src.connect(filter).connect(env).connect(out)
    src.start(t, Math.random() * 0.5)
    src.stop(t + len + 0.03)
  }

  /**
   * Corps d'un tir : deux dents de scie désaccordées qui plongent de `f0` à `f1`, saturées, derrière
   * un passe-bas qui se referme de `open` à `shut` Hz. C'est ce qui grogne.
   */
  private body(out: AudioNode, f0: number, f1: number, open: number, shut: number, t: number, len: number, peak: number, amount: number) {
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.Q.value = 1.4
    filter.frequency.setValueAtTime(open, t)
    filter.frequency.exponentialRampToValueAtTime(shut, t + len)
    filter.connect(out)
    const shaper = this.drive(filter, amount)
    this.sweep(shaper, 'sawtooth', f0, f1, t, len, peak, -14)
    this.sweep(shaper, 'sawtooth', f0, f1, t, len, peak, 14)
  }

  /** Claquement mécanique : une bouffée de bruit sourde, un coup, et la résonance d'une pièce de métal. */
  private clack(out: AudioNode, t: number, pitch: number, peak = 1) {
    this.burst(out, 'lowpass', 2600 * pitch, 800 * pitch, 0.9, t, 0.035, 0.9 * peak)
    this.burst(out, 'bandpass', 3100 * pitch, 2900 * pitch, 9, t, 0.05, 0.5 * peak)
    this.sweep(out, 'sine', 280 * pitch, 120 * pitch, t, 0.05, 0.7 * peak)
  }

  /** Air qui crépite : du bruit aigu, haché à une quarantaine de hertz. */
  private crackle(out: AudioNode, t: number, len: number, peak: number) {
    const ctx = this.ctx
    const chop = ctx.createGain()
    chop.gain.value = 0.5
    const lfo = ctx.createOscillator()
    lfo.type = 'square'
    lfo.frequency.setValueAtTime(47, t)
    lfo.frequency.linearRampToValueAtTime(23, t + len)
    const depth = ctx.createGain()
    depth.gain.value = 0.5
    lfo.connect(depth).connect(chop.gain)
    chop.connect(out)
    lfo.start(t)
    lfo.stop(t + len + 0.05)
    this.burst(chop, 'bandpass', 3400, 2200, 3.5, t, len, peak)
  }

  /** Un tir. `pitch` : hauteur (autour de 1), tirée au hasard par le jeu pour qu'aucun tir ne sonne comme le précédent. */
  shot(weapon: WeaponId, pos: Pos, pitch: number) {
    const t = this.ctx.currentTime + 0.004
    if (weapon === 'pistol') {
      const b = this.bus(pos, 0.5, 0.3)
      if (!b) return
      this.sweep(b.mix, 'sine', 170, 46, t, 0.12, 1)
      this.body(b.mix, 430 * pitch, 96 * pitch, 2800, 420, t, 0.13, 0.42, 2.5)
      this.burst(b.mix, 'bandpass', 1900, 1300, 0.8, t, 0.045, 0.9)
      this.burst(b.mix, 'highpass', 5200, 4200, 0.7, t, 0.012, 0.5)
      this.sweep(b.dry, 'sine', 2300 * pitch, 720 * pitch, t, 0.06, 0.1)
    } else if (weapon === 'smg') {
      // Sec, sans traîne : il doit s'enchaîner onze fois par seconde sans bouillie.
      const b = this.bus(pos, 0.42, 0.16)
      if (!b) return
      this.sweep(b.mix, 'sine', 195, 84, t, 0.055, 0.8)
      this.body(b.mix, 570 * pitch, 170 * pitch, 3300, 700, t, 0.06, 0.4, 2)
      this.burst(b.mix, 'bandpass', 2600, 1900, 0.9, t, 0.03, 0.85)
      this.burst(b.mix, 'highpass', 5600, 4600, 0.7, t, 0.01, 0.45)
      this.sweep(b.dry, 'sine', 3000 * pitch, 1150 * pitch, t, 0.035, 0.08)
    } else if (weapon === 'shotgun') {
      // Une déflagration large, puis la pompe : deux claquements.
      const b = this.bus(pos, 0.52, 0.45)
      if (!b) return
      this.sweep(b.mix, 'sine', 124, 36, t, 0.24, 1.1)
      this.burst(this.drive(b.mix, 3), 'lowpass', 3600, 260, 0.7, t, 0.3, 1)
      this.body(b.mix, 300 * pitch, 58 * pitch, 2200, 300, t, 0.22, 0.45, 3)
      this.burst(b.mix, 'highpass', 4800, 3800, 0.7, t, 0.018, 0.6)
      this.clack(b.dry, t + 0.3, 0.85, 0.5)
      this.clack(b.dry, t + 0.44, 1.05, 0.55)
    } else if (weapon === 'rifle') {
      // Canon électrique : un claquement, le grondement qui s'effondre dans le grave, et l'air qui crépite.
      const b = this.bus(pos, 0.5, 0.55)
      if (!b) return
      this.sweep(b.mix, 'sine', 98, 28, t, 0.5, 1.2)
      this.body(b.mix, 265 * pitch, 42 * pitch, 4200, 300, t, 0.5, 0.5, 4)
      this.sweep(this.drive(b.mix, 3), 'square', 132 * pitch, 40 * pitch, t, 0.4, 0.3)
      this.burst(b.mix, 'bandpass', 1500, 900, 0.7, t, 0.06, 1)
      this.burst(b.mix, 'highpass', 5000, 4000, 0.7, t, 0.014, 0.6)
      this.crackle(b.mix, t + 0.03, 0.38, 0.28)
      this.sweep(b.dry, 'sine', 5000 * pitch, 1700 * pitch, t, 0.18, 0.07)
    } else {
      // Lance-plasma : un « thoump » creux, celui d'un tube.
      const b = this.bus(pos, 0.72, 0.35)
      if (!b) return
      this.sweep(b.mix, 'sine', 215 * pitch, 58, t, 0.2, 1)
      this.burst(b.mix, 'lowpass', 1000, 200, 0.8, t, 0.22, 0.7)
      this.burst(b.mix, 'bandpass', 430, 380, 7, t, 0.16, 0.9)
      this.burst(b.mix, 'highpass', 4200, 3600, 0.7, t, 0.012, 0.3)
    }
  }

  /** Le plasma explose : un coup très grave, un souffle, et la salle qui gronde. */
  boom(pos: Pos) {
    const b = this.bus(pos, 0.6, 0.7)
    if (!b) return
    const t = this.ctx.currentTime + 0.004
    this.sweep(b.mix, 'sine', 88, 24, t, 0.7, 1.3)
    this.burst(this.drive(b.mix, 3), 'lowpass', 2800, 120, 0.7, t, 0.8, 1)
    this.body(b.mix, 180, 36, 1800, 200, t, 0.5, 0.4, 4)
    this.crackle(b.mix, t + 0.05, 0.45, 0.25)
  }

  /** Une cible vole en éclats ; en plein centre, une confirmation discrète par-dessus. */
  hit(pos: Pos, bullseye: boolean, pitch: number) {
    const b = this.bus(pos, 0.5, 0.3)
    if (!b) return
    const t = this.ctx.currentTime + 0.004
    this.sweep(b.mix, 'sine', 310, 115, t, 0.06, 0.8)
    this.burst(b.mix, 'bandpass', 2400, 1500, 0.9, t, 0.05, 0.8)
    // Les éclats : des grains de bruit résonants, épars, sur un dixième de seconde.
    for (let i = 0; i < 6; i++) {
      const f = (2300 + Math.random() * 3200) * pitch
      this.burst(b.mix, 'bandpass', f, f * 0.92, 7, t + 0.01 + Math.random() * 0.13, 0.03 + Math.random() * 0.04, 0.45)
    }
    if (!bullseye) return
    const tone = this.bus(null, 0.16, 0.5)
    if (!tone) return
    this.sweep(tone.mix, 'sine', 880, 878, t + 0.02, 0.22, 0.8)
    this.sweep(tone.mix, 'sine', 1320, 1317, t + 0.02, 0.26, 0.6)
  }

  /** Une cible dorée : la même, et trois notes claires. */
  bonus(pos: Pos) {
    this.hit(pos, false, 1.2)
    const tone = this.bus(null, 0.18, 0.6)
    if (!tone) return
    const t = this.ctx.currentTime + 0.02
    ;[1047, 1319, 1568].forEach((f, i) => this.sweep(tone.mix, 'sine', f, f, t + i * 0.07, 0.3, 0.7))
  }

  /** Une balle perdue grésille sur le mur. */
  wall(pos: Pos, pitch: number) {
    const b = this.bus(pos, 0.34, 0.35)
    if (!b) return
    const t = this.ctx.currentTime + 0.004
    this.burst(b.mix, 'bandpass', 4600 * pitch, 1300, 2.2, t, 0.13, 0.8)
    this.burst(b.mix, 'lowpass', 1400, 500, 0.8, t, 0.04, 0.7)
    this.sweep(b.mix, 'sine', 190, 80, t, 0.06, 0.6)
  }

  /** Le chargeur s'éjecte : un claquement, et il glisse hors de l'arme. */
  reload() {
    const b = this.bus(null, 0.3, 0.2)
    if (!b) return
    const t = this.ctx.currentTime + 0.004
    this.clack(b.mix, t, 0.9)
    this.burst(b.mix, 'bandpass', 1500, 600, 1.5, t + 0.03, 0.12, 0.35)
  }

  /** Le chargeur neuf est en place : deux claquements, et le condensateur qui se recharge, en sourdine. */
  loaded() {
    const b = this.bus(null, 0.3, 0.2)
    if (!b) return
    const t = this.ctx.currentTime + 0.004
    this.clack(b.mix, t, 1.1)
    this.clack(b.mix, t + 0.08, 1.35, 0.8)
    this.sweep(b.dry, 'triangle', 300, 950, t + 0.09, 0.26, 0.07)
  }

  /** Détente pressée, chargeur vide. */
  dry() {
    const b = this.bus(null, 0.24, 0.1)
    if (!b) return
    const t = this.ctx.currentTime + 0.004
    this.burst(b.mix, 'highpass', 2600, 2000, 0.7, t, 0.018, 0.7)
    this.burst(b.mix, 'bandpass', 2900, 2700, 9, t, 0.04, 0.4)
    this.sweep(b.mix, 'sine', 420, 260, t, 0.03, 0.3)
  }

  /** On décroche une arme du mur (ou on l'y remet, plus grave) : le métal du support, la main sur la poignée. */
  take(back = false) {
    const b = this.bus(null, 0.3, 0.25)
    if (!b) return
    const t = this.ctx.currentTime + 0.004
    this.clack(b.mix, t, back ? 0.75 : 1)
    this.burst(b.mix, 'lowpass', 900, 400, 0.8, t + (back ? 0 : 0.06), 0.1, 0.4)
    if (!back) this.clack(b.mix, t + 0.14, 1.3, 0.6)
  }

  /** Les lumières se resserrent sur les cibles (ou se rallument) : un contacteur, et le bourdon des projecteurs. */
  lights(on: boolean) {
    const b = this.bus(null, 0.3, 0.5)
    if (!b) return
    const t = this.ctx.currentTime + 0.004
    this.clack(b.mix, t, on ? 0.6 : 0.5, 0.9)
    this.sweep(b.mix, 'sine', on ? 70 : 120, on ? 120 : 60, t, 0.5, 0.5)
    this.burst(b.mix, 'lowpass', on ? 300 : 900, on ? 900 : 250, 0.8, t, 0.45, 0.25)
  }

  /** Les cinq dernières secondes : un top par seconde, de plus en plus haut. */
  tick(left: number) {
    const b = this.bus(null, 0.3, 0.3)
    if (!b) return
    const t = this.ctx.currentTime + 0.004
    const f = 620 + (5 - left) * 70
    this.sweep(b.mix, 'sine', f, f * 0.98, t, 0.07, 0.8)
    this.burst(b.mix, 'bandpass', 2200, 2000, 5, t, 0.02, 0.5)
  }

  /** Palier franchi : un souffle qui monte, deux notes. */
  tier() {
    const b = this.bus(null, 0.3, 0.6)
    if (!b) return
    const t = this.ctx.currentTime + 0.004
    this.burst(b.mix, 'bandpass', 500, 4200, 1.4, t, 0.34, 0.6)
    this.sweep(b.mix, 'triangle', 660, 660, t + 0.22, 0.16, 0.6)
    this.sweep(b.mix, 'triangle', 990, 990, t + 0.34, 0.3, 0.7)
    this.sweep(b.mix, 'sine', 495, 495, t + 0.34, 0.3, 0.4)
  }

  /** Fin de la manche : la sonnerie du stand, grave et courte. */
  end() {
    const b = this.bus(null, 0.24, 0.6)
    if (!b) return
    const t = this.ctx.currentTime + 0.004
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 1100
    filter.connect(b.mix)
    for (const [f, detune] of [[146, -9], [146, 9], [219, 0]]) {
      const osc = this.ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = f
      osc.detune.value = detune
      const env = this.ctx.createGain()
      env.gain.setValueAtTime(0, t)
      env.gain.linearRampToValueAtTime(0.4, t + 0.02)
      env.gain.setValueAtTime(0.4, t + 0.5)
      env.gain.linearRampToValueAtTime(0, t + 0.62)
      osc.connect(env).connect(filter)
      osc.start(t)
      osc.stop(t + 0.7)
    }
  }
}
