import type * as THREE from 'three'
import type { Sound } from './audio'

/*
 * Bruitages du stand de tir, synthétisés (Web Audio) : des armes à énergie, mais des armes. Un tir
 * est d'abord un coup (une sinusoïde grave qui plonge), un claquement (du bruit, bref et sec) et un
 * corps saturé (deux dents de scie désaccordées derrière un filtre qui se referme) ; le sifflement
 * de « laser » n'en est plus qu'un reflet. Tout passe par une réverbération de salle métallique,
 * qui donne aux tirs leur poids. Chaque arme a son timbre ; les cibles se brisent en éclats, les
 * murs grésillent, les chargeurs claquent. Les personnages de l'arène ont, en plus des timbres du
 * stand, les leurs : la seringue de Betty, la graine et le cocktail qu'on lance, la tomate qui
 * s'écrase, le verre qui éclate et la flaque qui s'embrase, la fleur qui mord, le soin qui tinte.
 *
 * `pos` : là où cela se passe (monde) ; null : à l'oreille, non spatialisé.
 *
 * Chaque bruitage quitte le graphe audio dès que sa dernière voix s'est tue (cf. bus) : dans
 * l'arène, six combattants tirent à la fois, et des sorties laissées branchées s'entasseraient par
 * milliers jusqu'à saturer le rendu du son. Leur nombre est aussi borné (cf. VOICES).
 */

type Pos = THREE.Vector3 | null

/**
 * Sortie d'un bruitage : `dry` va à l'oreille, `mix` y va aussi en passant par la salle ; `until` :
 * l'instant (horloge audio) où sa dernière voix se tait.
 */
interface Bus {
  dry: AudioNode
  mix: AudioNode
  until: number
}

/**
 * Bruitages à la fois, au plus : au-delà, le nouveau ne part pas (dans la mêlée, on ne l'entendrait
 * pas). Une balle perdue sur un mur cède la place bien avant (`wall`) : une gerbe en fait neuf d'un coup.
 */
const VOICES = { most: 28, wall: 10 }
/**
 * Sur un téléphone, le rendu du son a bien moins de marge : pas de réverbération de salle (une
 * convolution qui tourne en continu), et deux fois moins de bruitages à la fois.
 */
const LIGHT = matchMedia('(pointer: coarse)').matches

export class RangeSfx {
  private room?: ConvolverNode
  private curves = new Map<number, Float32Array<ArrayBuffer>>()
  /** Le bruitage en cours de fabrication (ses voix disent quand elles se taisent, cf. heard), et ceux qui sonnent encore. */
  private last: Bus | null = null
  private sounding = 0

  constructor(private sound: Sound) {}

  private get ctx(): AudioContext {
    return this.sound.ctx
  }

  /**
   * Réverbération du stand : une demi-seconde de bruit qui s'éteint, précédée de trois réflexions
   * nettes (les murs d'acier sont tout près). Fabriquée une fois, à la première détonation.
   */
  private get reverb(): ConvolverNode | null {
    if (LIGHT) return null
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
  private bus(pos: Pos, volume: number, wet: number, most = VOICES.most): Bus | null {
    if (this.sounding >= (LIGHT ? most / 2 : most)) return null
    const dry = this.sound.voice(pos, volume, 2.5, 1)
    if (!dry) return null
    const ctx = this.ctx
    const mix = ctx.createGain()
    mix.connect(dry)
    const reverb = this.reverb
    let send: GainNode | null = null
    if (reverb && wet > 0) {
      send = ctx.createGain()
      send.gain.value = wet * volume
      mix.connect(send).connect(reverb)
    }
    const bus: Bus = { dry, mix, until: ctx.currentTime + 0.05 }
    this.last = bus
    this.sounding++
    // Ses voix sont créées dans la foulée ; la dernière éteinte, il quitte le graphe audio (la
    // salle, elle, finit de résonner toute seule).
    queueMicrotask(() => setTimeout(() => {
      this.sounding--
      mix.disconnect()
      send?.disconnect()
      this.sound.release(dry)
    }, Math.max(0, bus.until - ctx.currentTime) * 1000 + 60))
    return bus
  }

  /** Une voix du bruitage en cours se tait à l'instant `end`. */
  private heard(end: number) {
    if (this.last) this.last.until = Math.max(this.last.until, end)
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
    this.heard(t + len + 0.03)
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
    this.heard(t + len + 0.03)
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
    this.heard(t + len + 0.05)
    this.burst(chop, 'bandpass', 3400, 2200, 3.5, t, len, peak)
  }

  /** Un tir. `pitch` : hauteur (autour de 1), tirée au hasard par le jeu pour qu'aucun tir ne sonne comme le précédent. */
  shot(weapon: string, pos: Pos, pitch: number) {
    const t = this.ctx.currentTime + 0.004
    if (weapon === 'syringe') {
      // La seringue de Betty : un « pfft » d'air comprimé, et le tintement de l'aiguille.
      const b = this.bus(pos, 0.42, 0.2)
      if (!b) return
      this.burst(b.mix, 'highpass', 2600 * pitch, 5200 * pitch, 0.8, t, 0.07, 0.8)
      this.burst(b.mix, 'bandpass', 900, 500, 1.2, t, 0.05, 0.5)
      this.sweep(b.dry, 'sine', 2900 * pitch, 2600 * pitch, t + 0.02, 0.09, 0.08)
      return
    }
    if (weapon === 'throw' || weapon === 'seed' || weapon === 'cocktail') {
      // Un objet lancé : le bras qui fouette l'air ; on reconnaît ce qui part sans le voir.
      const b = this.bus(pos, 0.36, 0.15)
      if (!b) return
      this.burst(b.mix, 'bandpass', 500 * pitch, 2400 * pitch, 1.6, t, 0.22, 0.75)
      this.sweep(b.mix, 'sine', 160, 90, t, 0.08, 0.4)
      if (weapon === 'seed') {
        // Les graines qui crépitent dans le sachet, sèches et légères.
        for (let i = 0; i < 5; i++) {
          const f = (2600 + Math.random() * 1800) * pitch
          this.burst(b.mix, 'bandpass', f, f * 0.9, 8, t + 0.01 + i * 0.022 + Math.random() * 0.01, 0.018, 0.4)
        }
      } else if (weapon === 'cocktail') {
        // Le verre qui tinte, et le cocktail qui clapote dedans.
        this.sweep(b.dry, 'sine', 2950 * pitch, 2930 * pitch, t, 0.32, 0.1)
        this.sweep(b.dry, 'sine', 4420 * pitch, 4400 * pitch, t + 0.005, 0.22, 0.05)
        this.burst(b.mix, 'bandpass', 420, 900, 3, t + 0.05, 0.14, 0.45)
      }
      return
    }
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

  /** Une tomate s'écrase : un « splotch » mouillé, sourd. */
  splat(pos: Pos) {
    const b = this.bus(pos, 0.55, 0.4)
    if (!b) return
    const t = this.ctx.currentTime + 0.004
    this.sweep(b.mix, 'sine', 150, 48, t, 0.22, 1)
    this.burst(this.drive(b.mix, 2), 'lowpass', 1800, 240, 0.8, t, 0.26, 0.9)
    this.burst(b.mix, 'bandpass', 700, 380, 2.5, t + 0.01, 0.16, 0.6)
    for (let i = 0; i < 3; i++) this.burst(b.mix, 'bandpass', 1100 + Math.random() * 900, 600, 4, t + 0.04 + Math.random() * 0.1, 0.05, 0.3)
  }

  /** Le cocktail de Jacques : le verre éclate, puis la flaque s'embrase dans un souffle. */
  shatter(pos: Pos) {
    const b = this.bus(pos, 0.5, 0.5)
    if (!b) return
    const t = this.ctx.currentTime + 0.004
    for (let i = 0; i < 8; i++) {
      const f = 3800 + Math.random() * 5200
      this.burst(b.mix, 'bandpass', f, f * 0.94, 9, t + Math.random() * 0.12, 0.04 + Math.random() * 0.06, 0.45)
    }
    this.burst(b.mix, 'highpass', 6000, 4200, 0.7, t, 0.03, 0.6)
    this.burst(b.mix, 'lowpass', 300, 1600, 0.7, t + 0.06, 0.5, 0.55)
    this.sweep(b.mix, 'sine', 120, 60, t + 0.05, 0.3, 0.5)
  }

  /** La graine de Capucine touche le sol : un « pof » de terre. */
  plant(pos: Pos) {
    const b = this.bus(pos, 0.4, 0.2)
    if (!b) return
    const t = this.ctx.currentTime + 0.004
    this.sweep(b.mix, 'sine', 240, 90, t, 0.12, 0.8)
    this.burst(b.mix, 'lowpass', 900, 200, 0.8, t, 0.12, 0.6)
  }

  /** Une fleur carnivore jaillit de terre : un froissement de feuilles, et un « pop » qui s'ouvre. */
  sprout(pos: Pos) {
    const b = this.bus(pos, 0.3, 0.2)
    if (!b) return
    const t = this.ctx.currentTime + 0.004
    this.burst(b.mix, 'bandpass', 1800, 3400, 2, t, 0.18, 0.5)
    this.sweep(b.mix, 'sine', 260, 520, t + 0.12, 0.09, 0.5)
  }

  /** Une fleur carnivore s'arme : un sifflement qui monte, comme une bête qui va mordre. */
  hiss(pos: Pos) {
    const b = this.bus(pos, 0.3, 0.2)
    if (!b) return
    const t = this.ctx.currentTime + 0.004
    this.burst(b.mix, 'highpass', 2600, 5200, 1.2, t, 0.22, 0.6)
    this.sweep(b.mix, 'triangle', 300, 420, t, 0.2, 0.12)
  }

  /** Une fleur carnivore fane : un souffle qui retombe, des feuilles sèches. */
  wilt(pos: Pos) {
    const b = this.bus(pos, 0.24, 0.3)
    if (!b) return
    const t = this.ctx.currentTime + 0.004
    this.sweep(b.mix, 'sine', 520, 180, t, 0.4, 0.35)
    this.burst(b.mix, 'bandpass', 2400, 900, 2.5, t + 0.05, 0.3, 0.3)
  }

  /** La flaque de Jacques s'embrase : un souffle de flamme qui part d'un coup. */
  ignite(pos: Pos) {
    const b = this.bus(pos, 0.3, 0.3)
    if (!b) return
    const t = this.ctx.currentTime + 0.004
    this.burst(b.mix, 'lowpass', 300, 2600, 0.9, t, 0.45, 0.8)
    this.sweep(b.mix, 'sine', 90, 55, t, 0.4, 0.5)
  }

  /** La flaque brûle : des crépitements secs, de temps en temps (on l'entend sans la voir). */
  burning(pos: Pos) {
    const b = this.bus(pos, 0.16, 0.15, VOICES.most / 2)
    if (!b) return
    const t = this.ctx.currentTime + 0.004
    for (let i = 0; i < 3; i++) {
      const f = 1400 + Math.random() * 2600
      this.burst(b.mix, 'bandpass', f, f * 0.7, 4, t + Math.random() * 0.12, 0.02 + Math.random() * 0.02, 0.6)
    }
    this.burst(b.mix, 'lowpass', 500, 300, 0.7, t, 0.18, 0.25)
  }

  /**
   * Un objet lancé d'en face qui retombe (`len` : sa chute, s) : un sifflement qui descend, à
   * l'endroit où il va tomber. On sait qu'il arrive, et où, avant de le voir.
   */
  whistle(pos: Pos, len: number) {
    const b = this.bus(pos, 0.14, 0.2)
    if (!b) return
    const t = this.ctx.currentTime + 0.004
    const d = Math.max(0.2, len)
    this.sweep(b.mix, 'sine', 1900, 700, t, d, 0.5)
    this.sweep(b.mix, 'sine', 1910, 705, t, d, 0.2, 12)
  }

  /** Une fleur carnivore mord : deux mâchoires qui claquent. */
  chomp(pos: Pos) {
    const b = this.bus(pos, 0.45, 0.25)
    if (!b) return
    const t = this.ctx.currentTime + 0.004
    this.clack(b.mix, t, 0.6, 0.8)
    this.clack(b.mix, t + 0.07, 0.75, 0.9)
    this.sweep(b.mix, 'sine', 170, 70, t + 0.06, 0.12, 0.6)
  }

  /** Betty soigne un coéquipier : deux notes claires. */
  heal(pos: Pos) {
    const b = this.bus(pos, 0.2, 0.5)
    if (!b) return
    const t = this.ctx.currentTime + 0.01
    this.sweep(b.mix, 'sine', 988, 986, t, 0.25, 0.7)
    this.sweep(b.mix, 'sine', 1480, 1477, t + 0.07, 0.3, 0.6)
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

  /** Une balle dans le sol : un coup mat, et la terre (ou le sable) qui gicle. */
  ground(pos: Pos, pitch: number) {
    const b = this.bus(pos, 0.28, 0.25, VOICES.wall)
    if (!b) return
    const t = this.ctx.currentTime + 0.004
    this.sweep(b.mix, 'sine', 150 * pitch, 60, t, 0.07, 0.8)
    this.burst(b.mix, 'lowpass', 1600 * pitch, 300, 0.8, t, 0.09, 0.7)
    this.burst(b.mix, 'bandpass', 3000 * pitch, 1800, 1.5, t + 0.01, 0.06, 0.3)
  }

  /**
   * Le tireur touche un combattant : un « tic » net, aigu, qui confirme la touche même loin (plus
   * clair qu'une balle perdue), et le choc mat de l'impact.
   */
  touch(pos: Pos, pitch: number) {
    const b = this.bus(null, 0.26, 0.15)
    if (!b) return
    const t = this.ctx.currentTime + 0.004
    this.sweep(b.dry, 'triangle', 1850 * pitch, 1700 * pitch, t, 0.05, 0.6)
    this.sweep(b.dry, 'sine', 3700 * pitch, 3600 * pitch, t, 0.03, 0.25)
    const thud = this.bus(pos, 0.3, 0.2)
    if (!thud) return
    this.sweep(thud.mix, 'sine', 180, 70, t, 0.08, 0.8)
    this.burst(thud.mix, 'lowpass', 900, 250, 0.8, t, 0.06, 0.6)
  }

  /**
   * Le tireur élimine : deux notes qui montent, franches, et un coup grave par-dessous ; on ne le
   * confond ni avec une touche, ni avec un soin.
   */
  kill() {
    const b = this.bus(null, 0.3, 0.4)
    if (!b) return
    const t = this.ctx.currentTime + 0.004
    this.sweep(b.mix, 'sine', 90, 40, t, 0.35, 1)
    this.sweep(b.dry, 'triangle', 1175, 1170, t, 0.12, 0.6)
    this.sweep(b.dry, 'triangle', 1760, 1755, t + 0.09, 0.32, 0.7)
    this.sweep(b.dry, 'sine', 2349, 2345, t + 0.09, 0.3, 0.2)
  }

  /**
   * Le joueur est touché : un coup sourd, étouffé, comme reçu dans la poitrine (`heavy` : de 0 à 1,
   * la part de ses points de vie que le coup emporte).
   */
  hurt(heavy: number) {
    const b = this.bus(null, 0.3 + 0.25 * heavy, 0.15)
    if (!b) return
    const t = this.ctx.currentTime + 0.004
    this.sweep(b.mix, 'sine', 120 + 40 * heavy, 45, t, 0.16, 1)
    this.burst(b.mix, 'lowpass', 700, 160, 0.8, t, 0.12, 0.8)
    this.sweep(b.mix, 'square', 260, 180, t, 0.05, 0.12)
  }

  /** Le joueur reçoit un soin : trois notes claires qui montent, et un souffle doux. */
  soothe() {
    const b = this.bus(null, 0.18, 0.6)
    if (!b) return
    const t = this.ctx.currentTime + 0.01
    ;[784, 988, 1319].forEach((f, i) => this.sweep(b.mix, 'sine', f, f * 1.002, t + i * 0.06, 0.32, 0.6))
    this.burst(b.mix, 'bandpass', 1800, 3600, 1.2, t, 0.3, 0.15)
  }

  /** Le joueur est éliminé : une chute, une note grave qui s'effondre et le souffle qui s'éteint. */
  down() {
    const b = this.bus(null, 0.3, 0.5)
    if (!b) return
    const t = this.ctx.currentTime + 0.004
    this.sweep(b.mix, 'sawtooth', 330, 55, t, 0.7, 0.35)
    this.sweep(b.mix, 'sine', 160, 40, t, 0.5, 0.9)
    this.burst(b.mix, 'lowpass', 1200, 90, 0.7, t + 0.05, 0.7, 0.45)
  }

  /** On revient en jeu : un souffle qui monte, et un accord bref qui s'ouvre (la téléportation). */
  spawn(pos: Pos) {
    const b = this.bus(pos, 0.24, 0.5)
    if (!b) return
    const t = this.ctx.currentTime + 0.004
    this.burst(b.mix, 'bandpass', 400, 3800, 2, t, 0.35, 0.5)
    ;[523, 784, 1047].forEach((f, i) => this.sweep(b.mix, 'triangle', f * 0.98, f, t + 0.12 + i * 0.03, 0.28, 0.35))
  }

  /** Une balle sur un combattant protégé : la bulle sonne, rien ne passe. */
  shield(pos: Pos) {
    const b = this.bus(pos, 0.2, 0.45)
    if (!b) return
    const t = this.ctx.currentTime + 0.004
    this.sweep(b.mix, 'sine', 1400, 1100, t, 0.18, 0.6)
    this.sweep(b.mix, 'sine', 2100, 1650, t, 0.14, 0.3)
  }

  /** Une balle perdue grésille sur le mur. */
  wall(pos: Pos, pitch: number) {
    const b = this.bus(pos, 0.34, 0.35, VOICES.wall)
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

  /**
   * Une série d'éliminations sans tomber (`level` : 2 pour un doublé, 3 un triplé…) : une fanfare
   * qui monte d'autant de notes, plus haut à chaque palier.
   */
  streak(level: number) {
    const b = this.bus(null, 0.3, 0.5)
    if (!b) return
    const t = this.ctx.currentTime + 0.004
    const base = 523 * 2 ** ((Math.min(5, level) - 2) / 12 * 2)
    const steps = [1, 1.26, 1.5, 2, 2.52].slice(0, Math.min(5, level + 1))
    steps.forEach((k, i) => {
      this.sweep(b.mix, 'square', base * k, base * k, t + i * 0.07, 0.14, 0.18)
      this.sweep(b.mix, 'triangle', base * k * 2, base * k * 2, t + i * 0.07, 0.12, 0.25)
    })
    this.burst(b.mix, 'highpass', 5000, 9000, 1, t + steps.length * 0.07, 0.25, 0.3)
  }

  /**
   * Balle de manche ou de match (`ours` : pour les siens) : deux coups de cloche qui montent, ou
   * qui descendent, plus graves, si c'est l'équipe d'en face ; trois pour une balle de match.
   */
  alarm(ours: boolean, match: boolean) {
    const b = this.bus(null, 0.3, 0.6)
    if (!b) return
    const t = this.ctx.currentTime + 0.004
    const notes = ours ? [784, 1047, 1319] : [622, 466, 349]
    notes.slice(0, match ? 3 : 2).forEach((f, i) => {
      this.sweep(b.mix, 'sine', f, f, t + i * 0.16, 0.5, 0.55)
      this.sweep(b.mix, 'triangle', f * 2.01, f * 2, t + i * 0.16, 0.25, 0.2)
    })
  }

  /** Le verdict : un accord qui s'ouvre (victoire), qui retombe (défaite), ou suspendu (égalité). */
  verdict(kind: 'won' | 'lost' | 'draw') {
    const b = this.bus(null, 0.32, 0.7)
    if (!b) return
    const t = this.ctx.currentTime + 0.004
    const chord = kind === 'won' ? [523, 659, 784, 1047] : kind === 'lost' ? [440, 349, 294, 220] : [523, 698, 784]
    chord.forEach((f, i) => {
      this.sweep(b.mix, 'triangle', f, f, t + i * 0.09, 0.9 - i * 0.1, 0.4)
      this.sweep(b.mix, 'sine', f / 2, f / 2, t + i * 0.09, 0.8, 0.25)
    })
    if (kind === 'won') this.burst(b.mix, 'bandpass', 600, 5000, 1.2, t, 0.5, 0.4)
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
    this.heard(t + 0.7)
  }

  /**
   * La clameur des tribunes de l'arène (`strength` : de 0 à 1) : du bruit sur les formants d'une
   * foule qui crie, qui enfle en une demi-seconde et retombe, brassé de vagues lentes et
   * désaccordées d'une bande à l'autre ; forte, des sifflets par-dessus.
   */
  crowd(strength: number) {
    const b = this.bus(null, 0.16 + 0.2 * strength, 0.45)
    if (!b) return
    const ctx = this.ctx, t = ctx.currentTime + 0.01, len = 1.5 + 1.5 * strength
    for (const [f, q, peak] of [[480, 1.3, 1], [1100, 2, 0.6], [2500, 2.6, 0.28]]) {
      const src = ctx.createBufferSource()
      src.buffer = this.sound.noiseBuffer
      src.loop = true
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = f * (0.92 + Math.random() * 0.16)
      filter.Q.value = q
      const env = ctx.createGain()
      env.gain.setValueAtTime(0, t)
      env.gain.linearRampToValueAtTime(peak * 0.7, t + 0.22)
      env.gain.linearRampToValueAtTime(peak, t + 0.55)
      env.gain.exponentialRampToValueAtTime(0.0008, t + len)
      const swell = ctx.createGain()
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 2.5 + Math.random() * 3
      const depth = ctx.createGain()
      depth.gain.value = 0.3
      lfo.connect(depth).connect(swell.gain)
      src.connect(filter).connect(env).connect(swell).connect(b.mix)
      src.start(t, Math.random() * 0.5)
      src.stop(t + len + 0.03)
      lfo.start(t)
      lfo.stop(t + len + 0.03)
    }
    this.heard(t + len + 0.03)
    if (strength < 0.7) return
    for (let i = 0; i < 3; i++) {
      const at = t + 0.15 + Math.random() * 0.7, f = 2300 + Math.random() * 700
      this.sweep(b.mix, 'sine', f, f * 1.25, at, 0.32, 0.05)
    }
  }

  /**
   * Le carillon de la relique gardienne (`strength` : de 0 à 1) : un accord de sinusoïdes pures,
   * légèrement désaccordées, qui s'élève puis s'éteint lentement, une note de plus quand il est fort.
   */
  chime(strength: number) {
    const b = this.bus(null, 0.1 + 0.12 * strength, 0.7)
    if (!b) return
    const ctx = this.ctx, t = ctx.currentTime + 0.01
    const notes = strength >= 1 ? [392, 587.3, 784, 1174.7] : [440, 659.3, 880]
    notes.forEach((f, i) => {
      for (const detune of [-6, 6]) {
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.value = f
        osc.detune.value = detune
        const env = ctx.createGain()
        const at = t + i * 0.09, len = 1.8 + strength * 1.2
        env.gain.setValueAtTime(0, at)
        env.gain.linearRampToValueAtTime(0.22 / notes.length, at + 0.05)
        env.gain.exponentialRampToValueAtTime(0.0008, at + len)
        osc.connect(env).connect(b.mix)
        osc.start(at)
        osc.stop(at + len + 0.05)
        this.heard(at + len + 0.05)
      }
    })
  }
}
