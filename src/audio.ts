import * as THREE from 'three'
import { BASE } from './assets'
import type { Voice } from './pets'

const SOUNDS = {
  step: ['footstep_concrete_000', 'footstep_concrete_001', 'footstep_concrete_002', 'footstep_concrete_003', 'footstep_concrete_004'],
  catStep: ['footstep_carpet_000', 'footstep_carpet_001', 'footstep_carpet_002'],
  softStep: ['footstep_carpet_000', 'footstep_carpet_001', 'footstep_carpet_002'],
  engine: ['spaceEngineLow_000'],
  doorOpen: ['doorOpen_000'],
  doorClose: ['doorClose_000'],
  lift: ['forceField_000'],
  computer: ['computerNoise_000', 'computerNoise_001', 'computerNoise_002', 'computerNoise_003'],
  chat: ['select_001'],
  emote: ['confirmation_001'],
  ding: ['maximize_006'],
} as const

export type SoundName = keyof typeof SOUNDS

interface PlayOptions {
  volume?: number
  rate?: number
  /** Distance en dessous de laquelle le volume est maximal. */
  ref?: number
  rolloff?: number
}

const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)]

/**
 * Sons légers et spatialisés (HRTF). L'auditeur est placé au-dessus du joueur et
 * tourné comme la caméra : un son à droite de l'écran s'entend à droite.
 * Les sons Kenney sont des fichiers ; les bips et le chat sont synthétisés.
 */
/** Réglages des cris : onde, hauteurs (départ, sommet, fin), durée, formant, répétitions… */
const VOICES: Record<Exclude<Voice, 'meow'>, {
  wave: OscillatorType; f: [number, number, number]; len: number; formant: number; q: number
  reps?: number; gap?: number; vib?: [number, number]; noise?: number; volume?: number
}> = {
  bark: { wave: 'square', f: [420, 540, 260], len: 0.14, formant: 900, q: 3, reps: 2, gap: 0.2, noise: 0.3 },
  yip: { wave: 'sawtooth', f: [900, 1300, 700], len: 0.12, formant: 1500, q: 4, reps: 2, gap: 0.16 },
  squeak: { wave: 'sine', f: [1800, 2600, 2000], len: 0.09, formant: 2200, q: 1, reps: 2, gap: 0.12, volume: 0.12 },
  chirp: { wave: 'sine', f: [2400, 3600, 2200], len: 0.07, formant: 2800, q: 1, reps: 3, gap: 0.09, volume: 0.12 },
  grunt: { wave: 'sawtooth', f: [110, 135, 90], len: 0.28, formant: 420, q: 2, noise: 0.4, volume: 0.3 },
  honk: { wave: 'square', f: [320, 390, 300], len: 0.22, formant: 1100, q: 4, reps: 2, gap: 0.27 },
  roar: { wave: 'sawtooth', f: [140, 190, 90], len: 0.8, formant: 600, q: 1.5, noise: 0.6, vib: [9, 15], volume: 0.3 },
  buzz: { wave: 'sawtooth', f: [210, 222, 200], len: 0.7, formant: 900, q: 1, vib: [30, 25], volume: 0.1 },
  moo: { wave: 'sawtooth', f: [150, 172, 118], len: 0.9, formant: 520, q: 3, vib: [5, 4], volume: 0.3 },
  trumpet: { wave: 'sawtooth', f: [380, 640, 520], len: 0.6, formant: 1400, q: 5, vib: [7, 10] },
  click: { wave: 'square', f: [3000, 3000, 2800], len: 0.02, formant: 3000, q: 2, reps: 4, gap: 0.07, noise: 0.8, volume: 0.1 },
}

export class Sound {
  readonly listener = new THREE.AudioListener()
  /** Objet à placer dans la scène ; porte l'auditeur. */
  readonly rig = new THREE.Object3D()
  private buffers = new Map<string, AudioBuffer>()
  private started = false
  private muted = false
  private volume = 0.6
  private noise?: AudioBuffer
  /** Fin du morceau en cours (horloge audio) : un seul à la fois. */
  private grooveUntil = 0
  private arcade?: GainNode

  constructor() {
    this.rig.add(this.listener)
    try {
      this.muted = localStorage.getItem('mute') === '1'
      const v = Number(localStorage.getItem('volume'))
      if (localStorage.getItem('volume') !== null && Number.isFinite(v)) this.volume = Math.min(1, Math.max(0, v))
    } catch {}
    // Chaîne maître : on adoucit les aigus et on écrase les pics (plus de sons « qui claquent »).
    const soften = this.ctx.createBiquadFilter()
    soften.type = 'lowpass'
    soften.frequency.value = 6500
    soften.Q.value = 0.5
    const comp = this.ctx.createDynamicsCompressor()
    comp.threshold.value = -24
    comp.knee.value = 24
    comp.ratio.value = 3
    comp.attack.value = 0.01
    comp.release.value = 0.3
    this.listener.gain.disconnect()
    this.listener.gain.connect(soften).connect(comp).connect(this.ctx.destination)
    this.applyVolume()
  }

  private applyVolume() {
    this.listener.setMasterVolume(this.muted ? 0 : this.volume)
  }

  get level(): number {
    return this.volume
  }

  setLevel(v: number) {
    this.volume = Math.min(1, Math.max(0, v))
    if (this.volume > 0 && this.muted) this.muted = false
    this.applyVolume()
    try {
      localStorage.setItem('volume', String(this.volume))
      localStorage.setItem('mute', this.muted ? '1' : '0')
    } catch {}
  }

  get ctx(): AudioContext {
    return this.listener.context
  }

  get isMuted(): boolean {
    return this.muted
  }

  toggleMute(): boolean {
    this.muted = !this.muted
    this.applyVolume()
    try {
      localStorage.setItem('mute', this.muted ? '1' : '0')
    } catch {}
    return this.muted
  }

  /** À appeler sur le premier geste de l'utilisateur (politique d'autoplay des navigateurs). */
  async start(onReady: () => void) {
    if (this.started) return
    this.started = true
    await this.ctx.resume()
    const names = Object.values(SOUNDS).flat()
    await Promise.all(
      names.map(async (n) => {
        try {
          const res = await fetch(`${BASE}sounds/${n}.ogg`)
          this.buffers.set(n, await this.ctx.decodeAudioData(await res.arrayBuffer()))
        } catch {
          // Format non supporté (ancien Safari…) : le jeu reste muet pour ce son.
        }
      }),
    )
    onReady()
  }

  get ready(): boolean {
    return this.started && this.ctx.state === 'running'
  }

  /**
   * Haut-parleur spatialisé (le jukebox) : son entrée, dont on règle le volume, et de quoi le
   * déplacer ; null tant que le son n'a pas démarré.
   */
  speaker(pos: THREE.Vector3, volume: number, ref = 2, rolloff = 1.2): { input: GainNode; move: (p: THREE.Vector3) => void } | null {
    if (!this.ready) return null
    const input = this.ctx.createGain()
    input.gain.value = volume
    const panner = this.panner(pos, ref, rolloff)
    input.connect(panner)
    return {
      input,
      move: (p) => {
        panner.positionX.value = p.x
        panner.positionY.value = p.y
        panner.positionZ.value = p.z
      },
    }
  }

  /** Sortie non spatialisée des bornes d'arcade (cf. arcade/sfx.ts) ; null tant que le son n'a pas démarré. */
  arcadeOutput(): AudioNode | null {
    if (!this.ready) return null
    if (!this.arcade) {
      this.arcade = this.ctx.createGain()
      this.arcade.gain.value = 0.5
      this.arcade.connect(this.listener.getInput())
    }
    return this.arcade
  }

  update(position: THREE.Vector3, azimuth: number) {
    this.rig.position.set(position.x, position.y + 1.2, position.z)
    this.rig.rotation.set(0, azimuth, 0)
  }

  private panner(pos: THREE.Vector3, ref = 1.5, rolloff = 1.2): PannerNode {
    const p = this.ctx.createPanner()
    p.panningModel = 'HRTF'
    p.distanceModel = 'inverse'
    p.refDistance = ref
    p.rolloffFactor = rolloff
    p.maxDistance = 200
    p.positionX.value = pos.x
    p.positionY.value = pos.y
    p.positionZ.value = pos.z
    p.connect(this.listener.getInput())
    return p
  }

  private output(pos: THREE.Vector3 | null, o: PlayOptions): { input: AudioNode; gain: GainNode } {
    const gain = this.ctx.createGain()
    gain.gain.value = o.volume ?? 1
    if (pos) gain.connect(this.panner(pos, o.ref, o.rolloff))
    else gain.connect(this.listener.getInput())
    return { input: gain, gain }
  }

  /** Joue un son (variante au hasard) ; `pos` null = non spatialisé (interface). */
  play(name: SoundName, pos: THREE.Vector3 | null, o: PlayOptions = {}) {
    if (!this.ready) return
    const buffer = this.buffers.get(pick(SOUNDS[name]))
    if (!buffer) return
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.playbackRate.value = o.rate ?? 1
    src.connect(this.output(pos, o).input)
    src.start()
  }

  /** Boucle continue à une position fixe (moteurs). */
  loop(name: SoundName, pos: THREE.Vector3, o: PlayOptions = {}): GainNode | null {
    if (!this.ready) return null
    const buffer = this.buffers.get(SOUNDS[name][0])
    if (!buffer) return null
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true
    src.playbackRate.value = o.rate ?? 1
    const { input, gain } = this.output(pos, o)
    src.connect(input)
    // Démarrage en fondu, à un point aléatoire pour désynchroniser les boucles.
    const target = gain.gain.value
    gain.gain.setValueAtTime(0, this.ctx.currentTime)
    gain.gain.linearRampToValueAtTime(target, this.ctx.currentTime + 2)
    src.start(0, Math.random() * buffer.duration)
    return gain
  }

  /** « Bip bip » d'ordinateur de bord : sinusoïdes douces, attaque et relâche arrondies. */
  beep(pos: THREE.Vector3) {
    if (!this.ready) return
    const patterns = [[880, 1175], [660, 660], [988, 784, 988], [1319], [784, 988]]
    const notes = pick(patterns)
    const out = this.output(pos, { volume: 0.05, ref: 1.2, rolloff: 1.6 }).input
    const t0 = this.ctx.currentTime + 0.02
    notes.forEach((f, i) => {
      const t = t0 + i * 0.13
      const osc = this.ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = f
      const env = this.ctx.createGain()
      env.gain.setValueAtTime(0, t)
      env.gain.linearRampToValueAtTime(1, t + 0.012)
      env.gain.setTargetAtTime(0, t + 0.05, 0.025)
      osc.connect(env).connect(out)
      osc.start(t)
      osc.stop(t + 0.2)
    })
  }

  /**
   * Petits sons d'interface du mode aménagement (non spatialisés) : prendre un objet, le poser,
   * le tourner, refuser une place.
   */
  ui(kind: 'pick' | 'drop' | 'rotate' | 'deny') {
    if (!this.ready) return
    const notes = { pick: [660, 990], drop: [880, 587], rotate: [740], deny: [220, 196] }[kind]
    const out = this.output(null, { volume: kind === 'deny' ? 0.07 : 0.05 }).input
    const t0 = this.ctx.currentTime + 0.01
    notes.forEach((f, i) => {
      const t = t0 + i * 0.06
      const osc = this.ctx.createOscillator()
      osc.type = kind === 'deny' ? 'triangle' : 'sine'
      osc.frequency.value = f
      const env = this.ctx.createGain()
      env.gain.setValueAtTime(0, t)
      env.gain.linearRampToValueAtTime(1, t + 0.008)
      env.gain.setTargetAtTime(0, t + 0.03, kind === 'deny' ? 0.04 : 0.02)
      osc.connect(env).connect(out)
      osc.start(t)
      osc.stop(t + 0.25)
    })
  }

  /** Miaulement : dent de scie filtrée par deux formants qui glissent (« mi-a-ou »). */
  meow(pos: THREE.Vector3) {
    if (!this.ready) return
    const ctx = this.ctx
    const t = ctx.currentTime + 0.01
    const len = 0.55 + Math.random() * 0.25
    const pitch = 0.9 + Math.random() * 0.25
    const out = this.output(pos, { volume: 0.25, ref: 1.2, rolloff: 1.4 }).input

    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(480 * pitch, t)
    osc.frequency.linearRampToValueAtTime(760 * pitch, t + len * 0.3)
    osc.frequency.linearRampToValueAtTime(520 * pitch, t + len)
    const vib = ctx.createOscillator()
    vib.frequency.value = 7
    const vibAmt = ctx.createGain()
    vibAmt.gain.value = 12
    vib.connect(vibAmt).connect(osc.frequency)

    const f1 = ctx.createBiquadFilter()
    f1.type = 'bandpass'
    f1.Q.value = 6
    f1.frequency.setValueAtTime(700, t)
    f1.frequency.linearRampToValueAtTime(1500, t + len * 0.35)
    f1.frequency.linearRampToValueAtTime(650, t + len)
    const f2 = ctx.createBiquadFilter()
    f2.type = 'bandpass'
    f2.Q.value = 9
    f2.frequency.setValueAtTime(2300, t)
    f2.frequency.linearRampToValueAtTime(1100, t + len)

    const env = ctx.createGain()
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(1, t + 0.06)
    env.gain.linearRampToValueAtTime(0.7, t + len * 0.7)
    env.gain.linearRampToValueAtTime(0, t + len)
    osc.connect(f1).connect(env)
    osc.connect(f2).connect(env)
    env.connect(out)
    osc.start(t)
    vib.start(t)
    osc.stop(t + len + 0.05)
    vib.stop(t + len + 0.05)
  }

  /**
   * Cri d'un compagnon (cf. pets.ts), synthétisé comme le miaulement : une onde dont la hauteur
   * monte puis retombe, passée dans un formant, avec un souffle de bruit et un vibrato au besoin.
   */
  critter(voice: Voice, pos: THREE.Vector3) {
    if (voice === 'meow') return this.meow(pos)
    if (!this.ready) return
    const v = VOICES[voice]
    const ctx = this.ctx
    const out = this.output(pos, { volume: v.volume ?? 0.22, ref: 1.2, rolloff: 1.4 }).input
    const pitch = 0.9 + Math.random() * 0.2
    for (let i = 0; i < (v.reps ?? 1); i++) {
      const t = ctx.currentTime + 0.01 + i * (v.gap ?? 0)
      const osc = ctx.createOscillator()
      osc.type = v.wave
      osc.frequency.setValueAtTime(v.f[0] * pitch, t)
      osc.frequency.linearRampToValueAtTime(v.f[1] * pitch, t + v.len * 0.3)
      osc.frequency.linearRampToValueAtTime(v.f[2] * pitch, t + v.len)
      const formant = ctx.createBiquadFilter()
      formant.type = 'bandpass'
      formant.frequency.value = v.formant
      formant.Q.value = v.q
      const env = ctx.createGain()
      env.gain.setValueAtTime(0, t)
      env.gain.linearRampToValueAtTime(1, t + Math.min(0.04, v.len * 0.2))
      env.gain.linearRampToValueAtTime(0.6, t + v.len * 0.7)
      env.gain.linearRampToValueAtTime(0, t + v.len)
      osc.connect(formant).connect(env).connect(out)
      const stops: AudioScheduledSourceNode[] = [osc]
      if (v.vib) {
        const vib = ctx.createOscillator()
        vib.frequency.value = v.vib[0]
        const depth = ctx.createGain()
        depth.gain.value = v.vib[1]
        vib.connect(depth).connect(osc.frequency)
        stops.push(vib)
      }
      if (v.noise) {
        const noise = ctx.createBufferSource()
        noise.buffer = this.whiteNoise
        const amount = ctx.createGain()
        amount.gain.value = v.noise
        noise.connect(amount).connect(formant)
        stops.push(noise)
      }
      for (const n of stops) {
        n.start(t)
        n.stop(t + v.len + 0.05)
      }
    }
  }

  /** Ronronnement : bruit grave modulé ~25 Hz. */
  /** Bruit blanc d'une seconde, créé à la demande (ronronnement, étincelles). */
  private get whiteNoise(): AudioBuffer {
    if (!this.noise) {
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate)
      const d = this.noise.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    }
    return this.noise
  }

  /** Fondu du volume d'une boucle (cf. `loop`). */
  fade(gain: GainNode, to: number, seconds = 0.6) {
    const now = this.ctx.currentTime
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(gain.gain.value, now)
    gain.gain.linearRampToValueAtTime(to, now + seconds)
  }

  /** Crépitement de soudure : quelques claquements de bruit filtré, très brefs. */
  sparks(pos: THREE.Vector3) {
    if (!this.ready) return
    const ctx = this.ctx
    const out = this.output(pos, { volume: 0.16, ref: 1, rolloff: 1.8 }).input
    const n = 3 + Math.floor(Math.random() * 6)
    for (let i = 0; i < n; i++) {
      const t = ctx.currentTime + 0.02 + Math.random() * 0.4
      const src = ctx.createBufferSource()
      src.buffer = this.whiteNoise
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 2200 + Math.random() * 2500
      const env = ctx.createGain()
      env.gain.setValueAtTime(0, t)
      env.gain.linearRampToValueAtTime(1, t + 0.003)
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.03 + Math.random() * 0.05)
      src.connect(hp).connect(env).connect(out)
      src.start(t, Math.random() * 0.8)
      src.stop(t + 0.12)
    }
  }

  /**
   * Quatre mesures de disco (platines), dans `delay` secondes (sur un temps de la piste de
   * danse), au tempo de la soirée : grosse caisse à chaque temps, charleston entre les temps,
   * basse en octaves, accords en contretemps, sur la mineur, fa, do, sol. Une seule à la fois.
   * @returns durée (s), ou 0 si rien ne joue
   */
  groove(pos: THREE.Vector3, delay = 0, bpm = 120): number {
    if (!this.ready) return 0
    const ctx = this.ctx
    const t0 = ctx.currentTime + delay
    if (t0 < this.grooveUntil) return 0
    const beat = 60 / bpm, bars = 4
    this.grooveUntil = t0 + bars * 4 * beat
    const out = this.output(pos, { volume: 0.22, ref: 1.6, rolloff: 1.3 }).input
    const roots = [110, 87.31, 130.81, 98]
    const chords = [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]]
    const note = (type: OscillatorType, f: number, t: number, len: number, level: number, cutoff: number) => {
      const osc = ctx.createOscillator()
      osc.type = type
      osc.frequency.value = f
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = cutoff
      const env = ctx.createGain()
      env.gain.setValueAtTime(0, t)
      env.gain.linearRampToValueAtTime(level, t + 0.006)
      env.gain.setTargetAtTime(0, t + len * 0.6, len * 0.25)
      osc.connect(lp).connect(env).connect(out)
      osc.start(t)
      osc.stop(t + len + 0.2)
    }
    for (let bar = 0; bar < bars; bar++) {
      for (let b = 0; b < 4; b++) {
        const t = t0 + (bar * 4 + b) * beat
        // Grosse caisse : une sinusoïde qui plonge de 150 à 45 Hz.
        const kick = ctx.createOscillator()
        kick.frequency.setValueAtTime(150, t)
        kick.frequency.exponentialRampToValueAtTime(45, t + 0.12)
        const kEnv = ctx.createGain()
        kEnv.gain.setValueAtTime(1, t)
        kEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
        kick.connect(kEnv).connect(out)
        kick.start(t)
        kick.stop(t + 0.32)
        // Charleston : un souffle très aigu, entre les temps.
        const hat = ctx.createBufferSource()
        hat.buffer = this.whiteNoise
        const hp = ctx.createBiquadFilter()
        hp.type = 'highpass'
        hp.frequency.value = 7500
        const hEnv = ctx.createGain()
        hEnv.gain.setValueAtTime(0.35, t + beat / 2)
        hEnv.gain.exponentialRampToValueAtTime(0.001, t + beat / 2 + 0.05)
        hat.connect(hp).connect(hEnv).connect(out)
        hat.start(t + beat / 2, Math.random() * 0.5)
        hat.stop(t + beat / 2 + 0.07)
        // Basse en octaves (croches), accords en contretemps un temps sur deux.
        note('sawtooth', roots[bar], t, beat * 0.42, 0.32, 700)
        note('sawtooth', roots[bar] * 2, t + beat / 2, beat * 0.42, 0.26, 900)
        if (b % 2 === 1) for (const f of chords[bar]) note('square', f, t + beat / 2, beat * 0.35, 0.07, 2200)
      }
    }
    return bars * 4 * beat
  }

  /** Petite mélodie de borne d'arcade (ondes carrées, parfois un « piou » descendant). */
  chiptune(pos: THREE.Vector3) {
    if (!this.ready) return
    const ctx = this.ctx
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 2800
    lp.connect(this.output(pos, { volume: 0.03, ref: 1, rolloff: 1.8 }).input)
    const scale = [523, 587, 659, 784, 880, 1047, 1175, 1319]
    const n = 3 + Math.floor(Math.random() * 5)
    const t0 = ctx.currentTime + 0.02
    for (let i = 0; i < n; i++) {
      const t = t0 + i * 0.075
      const f = pick(scale)
      const osc = ctx.createOscillator()
      osc.type = 'square'
      osc.frequency.setValueAtTime(f, t)
      if (Math.random() < 0.3) osc.frequency.exponentialRampToValueAtTime(f * 0.4, t + 0.07)
      const env = ctx.createGain()
      env.gain.setValueAtTime(0, t)
      env.gain.linearRampToValueAtTime(1, t + 0.005)
      env.gain.setTargetAtTime(0, t + 0.04, 0.02)
      osc.connect(env).connect(lp)
      osc.start(t)
      osc.stop(t + 0.1)
    }
  }

  purr(pos: THREE.Vector3, duration = 2.5) {
    if (!this.ready) return
    const ctx = this.ctx
    const t = ctx.currentTime + 0.3
    const src = ctx.createBufferSource()
    src.buffer = this.whiteNoise
    src.loop = true
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 260
    const am = ctx.createGain()
    am.gain.value = 0.5
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 24
    const lfoAmt = ctx.createGain()
    lfoAmt.gain.value = 0.5
    lfo.connect(lfoAmt).connect(am.gain)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(1, t + 0.4)
    env.gain.setValueAtTime(1, t + duration - 0.6)
    env.gain.linearRampToValueAtTime(0, t + duration)
    src.connect(lp).connect(am).connect(env).connect(this.output(pos, { volume: 0.55, ref: 1, rolloff: 1.8 }).input)
    src.start(t)
    lfo.start(t)
    src.stop(t + duration + 0.1)
    lfo.stop(t + duration + 0.1)
  }

  /** Coup de poing dans le sac : un souffle grave et une sinusoïde qui plonge. */
  thud(pos: THREE.Vector3) {
    if (!this.ready) return
    const ctx = this.ctx
    const t = ctx.currentTime + 0.005
    const out = this.output(pos, { volume: 0.32, ref: 1.2, rolloff: 1.6 }).input
    const body = ctx.createOscillator()
    body.frequency.setValueAtTime(130 + Math.random() * 20, t)
    body.frequency.exponentialRampToValueAtTime(48, t + 0.12)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.9, t)
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
    body.connect(env).connect(out)
    body.start(t)
    body.stop(t + 0.2)
    const slap = ctx.createBufferSource()
    slap.buffer = this.whiteNoise
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 900
    const sEnv = ctx.createGain()
    sEnv.gain.setValueAtTime(0.5, t)
    sEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.07)
    slap.connect(lp).connect(sEnv).connect(out)
    slap.start(t, Math.random() * 0.5)
    slap.stop(t + 0.08)
  }

  /**
   * Petits airs de borne (non spatialisés) : une pièce qui tombe, une partie gagnée, perdue ;
   * le bourdonnement du moteur de la pince.
   */
  jingle(kind: 'coin' | 'win' | 'lose' | 'motor') {
    if (!this.ready) return
    const ctx = this.ctx
    const out = this.output(null, { volume: kind === 'motor' ? 0.035 : 0.07 }).input
    const t0 = ctx.currentTime + 0.01
    const tone = (f: number, t: number, len: number, type: OscillatorType = 'square', to?: number) => {
      const osc = ctx.createOscillator()
      osc.type = type
      osc.frequency.setValueAtTime(f, t)
      if (to) osc.frequency.exponentialRampToValueAtTime(to, t + len)
      const env = ctx.createGain()
      env.gain.setValueAtTime(0, t)
      env.gain.linearRampToValueAtTime(1, t + 0.006)
      env.gain.setTargetAtTime(0, t + len * 0.7, len * 0.2)
      osc.connect(env).connect(out)
      osc.start(t)
      osc.stop(t + len + 0.1)
    }
    if (kind === 'coin') [988, 1319].forEach((f, i) => tone(f, t0 + i * 0.08, 0.1))
    else if (kind === 'win') [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, t0 + i * 0.09, i === 5 ? 0.3 : 0.1))
    else if (kind === 'lose') [392, 330, 262].forEach((f, i) => tone(f, t0 + i * 0.16, 0.18, 'triangle'))
    else tone(95, t0, 0.5, 'sawtooth', 70)
  }

  /**
   * Saut FSD : le moteur se charge (un sifflement qui monte, `charge` secondes), puis le saut
   * (un grondement et un souffle), puis l'arrivée.
   */
  fsd(charge: number, jump: number) {
    if (!this.ready) return
    const ctx = this.ctx
    const t0 = ctx.currentTime + 0.02
    const out = this.output(null, { volume: 0.18 }).input
    // Charge : deux dents de scie désaccordées qui montent, sous un filtre qui s'ouvre.
    for (const detune of [-8, 8]) {
      const osc = ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.detune.value = detune
      osc.frequency.setValueAtTime(70, t0)
      osc.frequency.exponentialRampToValueAtTime(420, t0 + charge)
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.setValueAtTime(300, t0)
      lp.frequency.exponentialRampToValueAtTime(2600, t0 + charge)
      const env = ctx.createGain()
      env.gain.setValueAtTime(0, t0)
      env.gain.linearRampToValueAtTime(0.22, t0 + charge * 0.8)
      env.gain.linearRampToValueAtTime(0, t0 + charge + 0.05)
      osc.connect(lp).connect(env).connect(out)
      osc.start(t0)
      osc.stop(t0 + charge + 0.1)
    }
    // Saut : un souffle de bruit qui balaie les graves aux aigus, et un grondement.
    const t1 = t0 + charge
    const rush = ctx.createBufferSource()
    rush.buffer = this.whiteNoise
    rush.loop = true
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 0.8
    bp.frequency.setValueAtTime(200, t1)
    bp.frequency.exponentialRampToValueAtTime(3000, t1 + jump * 0.5)
    bp.frequency.exponentialRampToValueAtTime(300, t1 + jump)
    const rEnv = ctx.createGain()
    rEnv.gain.setValueAtTime(0, t1)
    rEnv.gain.linearRampToValueAtTime(0.9, t1 + 0.15)
    rEnv.gain.linearRampToValueAtTime(0.5, t1 + jump * 0.7)
    rEnv.gain.linearRampToValueAtTime(0, t1 + jump)
    rush.connect(bp).connect(rEnv).connect(out)
    rush.start(t1)
    rush.stop(t1 + jump + 0.1)
    const boom = ctx.createOscillator()
    boom.frequency.setValueAtTime(90, t1)
    boom.frequency.exponentialRampToValueAtTime(30, t1 + 1.2)
    const bEnv = ctx.createGain()
    bEnv.gain.setValueAtTime(1, t1)
    bEnv.gain.exponentialRampToValueAtTime(0.001, t1 + 1.4)
    boom.connect(bEnv).connect(out)
    boom.start(t1)
    boom.stop(t1 + 1.5)
  }

  /**
   * Crédits encaissés (non spatialisé) : le cliquetis d'une caisse enregistreuse, puis deux
   * notes de clochette qui montent (trois pour une grosse somme).
   */
  credits(big = false) {
    if (!this.ready) return
    const ctx = this.ctx
    const out = this.output(null, { volume: 0.09 }).input
    const t0 = ctx.currentTime + 0.01
    const clink = ctx.createBufferSource()
    clink.buffer = this.whiteNoise
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 5200
    bp.Q.value = 3
    const cEnv = ctx.createGain()
    cEnv.gain.setValueAtTime(0.6, t0)
    cEnv.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05)
    clink.connect(bp).connect(cEnv).connect(out)
    clink.start(t0, Math.random() * 0.5)
    clink.stop(t0 + 0.06)
    ;(big ? [1319, 1760, 2637] : [1568, 2093]).forEach((f, i) => {
      const t = t0 + 0.05 + i * 0.075
      for (const [type, gain] of [['sine', 1], ['triangle', 0.3]] as const) {
        const osc = ctx.createOscillator()
        osc.type = type
        osc.frequency.value = f
        const env = ctx.createGain()
        env.gain.setValueAtTime(0, t)
        env.gain.linearRampToValueAtTime(gain, t + 0.005)
        env.gain.setTargetAtTime(0, t + 0.02, i === (big ? 2 : 1) ? 0.12 : 0.05)
        osc.connect(env).connect(out)
        osc.start(t)
        osc.stop(t + 0.8)
      }
    })
  }

  /**
   * Bruit d'une tâche de bord en cours (spatialisé) : frotter (ordures, flaque, vaisselle),
   * une clé sur du métal (réparations), un sifflement (vapeur, brèche), de l'eau (plantes).
   */
  work(kind: 'scrub' | 'wrench' | 'hiss' | 'water', pos: THREE.Vector3) {
    if (!this.ready) return
    const ctx = this.ctx
    const t = ctx.currentTime + 0.01
    const out = this.output(pos, { volume: kind === 'hiss' ? 0.1 : 0.14, ref: 1.2, rolloff: 1.6 }).input
    const noise = (filter: BiquadFilterType, freq: number, q: number, len: number, peak = 1) => {
      const src = ctx.createBufferSource()
      src.buffer = this.whiteNoise
      const f = ctx.createBiquadFilter()
      f.type = filter
      f.frequency.value = freq
      f.Q.value = q
      const env = ctx.createGain()
      env.gain.setValueAtTime(0, t)
      env.gain.linearRampToValueAtTime(peak, t + len * 0.3)
      env.gain.exponentialRampToValueAtTime(0.001, t + len)
      src.connect(f).connect(env).connect(out)
      src.start(t, Math.random() * 0.5)
      src.stop(t + len + 0.02)
      return f
    }
    if (kind === 'scrub') noise('bandpass', 1400 + Math.random() * 900, 0.8, 0.22)
    else if (kind === 'hiss') noise('highpass', 3500, 0.7, 0.5, 0.8)
    else if (kind === 'water') {
      // Glouglou : un bruit filtré dont la fréquence saute, comme des bulles.
      const f = noise('bandpass', 700, 6, 0.35)
      for (let i = 1; i < 5; i++) f.frequency.setValueAtTime(500 + Math.random() * 900, t + i * 0.06)
    } else {
      noise('bandpass', 3100, 9, 0.12)
      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.value = 1850 + Math.random() * 300
      const env = ctx.createGain()
      env.gain.setValueAtTime(0.35, t)
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.25)
      osc.connect(env).connect(out)
      osc.start(t)
      osc.stop(t + 0.3)
    }
  }

  /** Déclencheur du mode photo : le claquement de l'obturateur, puis le réarmement. */
  shutter() {
    if (!this.ready) return
    const ctx = this.ctx
    const out = this.output(null, { volume: 0.18 }).input
    for (const [at, freq, len] of [[0, 3200, 0.03], [0.07, 1800, 0.05]] as const) {
      const t = ctx.currentTime + 0.005 + at
      const src = ctx.createBufferSource()
      src.buffer = this.whiteNoise
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = freq
      bp.Q.value = 1.2
      const env = ctx.createGain()
      env.gain.setValueAtTime(1, t)
      env.gain.exponentialRampToValueAtTime(0.001, t + len)
      src.connect(bp).connect(env).connect(out)
      src.start(t, Math.random() * 0.5)
      src.stop(t + len + 0.02)
    }
  }
}
