import type { Sfx } from './game'

/*
 * Bruitages des bornes, synthétisés comme sur une puce sonore de 1980 : ondes carrées et
 * triangles, bruit blanc filtré pour les explosions. Non spatialisés : on a la borne sous le nez.
 */

type Wave = OscillatorType

export class ArcadeSfx {
  private noise: AudioBuffer

  constructor(
    private readonly ctx: AudioContext,
    private readonly out: AudioNode,
  ) {
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = this.noise.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }

  /** Une note : de la fréquence `from` à `to`, `len` secondes, au volume `level`, dans `at` secondes. */
  private tone(type: Wave, from: number, to: number, len: number, level: number, at = 0) {
    const t = this.ctx.currentTime + 0.005 + at
    const osc = this.ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(from, t)
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + len)
    const env = this.ctx.createGain()
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(level, t + 0.004)
    env.gain.setTargetAtTime(0, t + len * 0.6, len * 0.25)
    osc.connect(env).connect(this.out)
    osc.start(t)
    osc.stop(t + len + 0.1)
  }

  /** Souffle de bruit filtré (explosion, poussée). */
  private hiss(len: number, type: BiquadFilterType, freq: number, level: number, at = 0, sweep?: number) {
    const t = this.ctx.currentTime + 0.005 + at
    const src = this.ctx.createBufferSource()
    src.buffer = this.noise
    const f = this.ctx.createBiquadFilter()
    f.type = type
    f.frequency.setValueAtTime(freq, t)
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + len)
    const env = this.ctx.createGain()
    env.gain.setValueAtTime(level, t)
    env.gain.exponentialRampToValueAtTime(0.001, t + len)
    src.connect(f).connect(env).connect(this.out)
    src.start(t, Math.random() * 0.5)
    src.stop(t + len + 0.05)
  }

  private arpeggio(notes: number[], gap: number, len: number, level: number, type: Wave = 'square') {
    notes.forEach((f, i) => this.tone(type, f, f, len, level, i * gap))
  }

  play(s: Sfx) {
    switch (s) {
      case 'move': return this.tone('square', 196, 196, 0.03, 0.12)
      case 'rotate': return this.tone('square', 440, 587, 0.045, 0.12)
      case 'hold': return this.arpeggio([523, 392], 0.05, 0.06, 0.12)
      case 'drop':
        this.tone('triangle', 180, 55, 0.14, 0.5)
        return this.hiss(0.08, 'lowpass', 900, 0.25)
      case 'lock': return this.tone('triangle', 130, 90, 0.07, 0.35)
      case 'line': return this.arpeggio([523, 659, 784], 0.06, 0.08, 0.14)
      case 'tetra': return this.arpeggio([523, 659, 784, 1047, 1319, 1568], 0.055, 0.09, 0.15)
      case 'level': return this.arpeggio([392, 523, 659, 784, 1047], 0.08, 0.12, 0.14)
      case 'over': return this.arpeggio([392, 349, 311, 262, 196], 0.18, 0.22, 0.16, 'triangle')
      case 'eat': return this.tone('square', 660, 990, 0.06, 0.13)
      case 'bonus': return this.arpeggio([784, 988, 1175, 1568], 0.045, 0.07, 0.14)
      case 'turn': return this.tone('square', 1200, 1200, 0.012, 0.03)
      case 'shoot': return this.tone('square', 1100, 260, 0.09, 0.1)
      case 'bang':
        this.hiss(0.55, 'lowpass', 1400, 0.7, 0, 160)
        return this.tone('triangle', 90, 35, 0.4, 0.4)
      case 'bang-small': return this.hiss(0.22, 'lowpass', 2600, 0.45, 0, 400)
      case 'thrust': return this.hiss(0.14, 'bandpass', 320, 0.22)
      case 'saucer': return this.tone('square', 880, 1180, 0.12, 0.06)
      case 'life': return this.arpeggio([1047, 1319, 1568, 2093, 1568, 2093], 0.06, 0.07, 0.1)
      case 'warp':
        this.tone('sawtooth', 200, 1600, 0.25, 0.08)
        return this.tone('sawtooth', 1600, 200, 0.25, 0.08, 0.25)
      case 'beat-hi': return this.tone('triangle', 118, 100, 0.09, 0.45)
      case 'beat-lo': return this.tone('triangle', 98, 84, 0.09, 0.45)
    }
  }
}
