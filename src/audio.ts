import * as THREE from 'three'
import { BASE } from './assets'

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
export class Sound {
  readonly listener = new THREE.AudioListener()
  /** Objet à placer dans la scène ; porte l'auditeur. */
  readonly rig = new THREE.Object3D()
  private buffers = new Map<string, AudioBuffer>()
  private started = false
  private muted = false
  private volume = 0.6
  private noise?: AudioBuffer

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
}
