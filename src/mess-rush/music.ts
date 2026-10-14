import type { Sound } from '../audio'

/*
 * Les musiques de MESS RUSH : deux morceaux enregistrés (public/assets/music/mess-rush/, cf.
 * CREDITS.txt).
 *
 * - au mess, « MESS RUSH », en fond : c'est la platine de la salle (cf. turntable), et on ne
 *   l'entend que dedans, comme la sono du lobby de CMDR Arena ;
 * - en cuisine, « Arcade Groove », en boucle du début du service jusqu'à la fin des cinq minutes.
 *
 * Les deux finissent sur un blanc (0,26 et 0,68 s) : la boucle s'arrête juste avant.
 */

const LOBBY = { file: 'mess-rush/mess-rush.mp3', volume: 0.24, loop: { from: 0, to: 149.42 } }
const SERVICE = { file: 'mess-rush/arcade-groove.mp3', volume: 0.36, loop: { from: 0, to: 149.29 } }

/** Le craquement d'un vinyle : un souffle très bas, et des petits clics épars (2 s, en boucle). */
let crackles: AudioBuffer | null = null
function crackle(ctx: AudioContext): AudioBuffer {
  if (crackles?.sampleRate === ctx.sampleRate) return crackles
  const length = ctx.sampleRate * 2
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const d = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) d[i] = (Math.random() * 2 - 1) * 0.04
  // Une quarantaine de clics par tour de boucle, de force et de longueur variables.
  for (let n = 0; n < 40; n++) {
    const at = Math.floor(Math.random() * (length - 64))
    const amp = (0.25 + Math.random() * 0.75) * (Math.random() < 0.5 ? -1 : 1)
    const len = 3 + Math.floor(Math.random() * 24)
    for (let i = 0; i < len; i++) d[at + i] += amp * Math.exp(-i / (len / 3))
  }
  crackles = buffer
  return buffer
}

/**
 * Une platine de mess : le pleurage et le scintillement du plateau (la hauteur qui ondule, à peine),
 * le son chaud et un peu étroit d'un vinyle (ni sub-graves, aigus adoucis, une pointe de saturation),
 * et son craquement, qui s'arrête avec le disque.
 */
function turntable(ctx: AudioContext, from: AudioBufferSourceNode): AudioNode {
  const filter = (type: BiquadFilterType, frequency: number, q: number, gain = 0) => {
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = frequency
    f.Q.value = q
    f.gain.value = gain
    return f
  }
  // Pleurage (0,55 tour par seconde) et scintillement (7 Hz) : un retard qui ondule fait onduler la hauteur.
  const wobble = ctx.createDelay(0.05)
  wobble.delayTime.value = 0.012
  const lfos = [[0.55, 0.0011], [7, 0.00008]].map(([rate, depth]) => {
    const lfo = ctx.createOscillator()
    lfo.frequency.value = rate
    const amount = ctx.createGain()
    amount.gain.value = depth
    lfo.connect(amount).connect(wobble.delayTime)
    return lfo
  })
  const drive = ctx.createWaveShaper()
  const curve = new Float32Array(257)
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(1.4 * (i / 128 - 1)) / Math.tanh(1.4)
  drive.curve = curve
  drive.oversample = '2x'
  const out = ctx.createGain()
  from
    .connect(wobble)
    .connect(filter('highpass', 50, 0.7))
    .connect(filter('peaking', 180, 0.9, 2.5))
    .connect(filter('highshelf', 6500, 0.7, -5))
    .connect(drive)
    .connect(filter('lowpass', 11000, 0.6))
    .connect(out)
  const noise = ctx.createBufferSource()
  noise.buffer = crackle(ctx)
  noise.loop = true
  const level = ctx.createGain()
  level.gain.value = 0.09
  noise.connect(filter('bandpass', 2400, 0.5)).connect(level).connect(out)
  const t = ctx.currentTime
  for (const lfo of lfos) lfo.start(t)
  noise.start(t)
  from.addEventListener('ended', () => {
    for (const lfo of lfos) lfo.stop()
    noise.stop()
    out.disconnect()
  })
  return out
}

/** La platine du mess : elle joue tant qu'on y est, la même mesure pour tous ceux qui s'y trouvent. */
export class MessLobbyMusic {
  private tune: { stop: () => void } | null = null

  constructor(private sound: Sound) {}

  /** On l'entend (le jukebox du pont et le bruit des machines lui laissent la place). */
  get audible(): boolean {
    return !!this.tune
  }

  /** À appeler à chaque image : `inside`, le joueur est au mess. */
  update(inside: boolean) {
    if (inside === !!this.tune) return
    if (!inside) {
      this.tune!.stop()
      this.tune = null
      // Avant le premier geste du joueur, le son n'a pas démarré.
    } else if (this.sound.ready) this.tune = this.sound.music(LOBBY.file, LOBBY.volume, { loop: LOBBY.loop, shared: true, through: turntable })
  }
}

/** La musique du service : du départ en cuisine à la fin du service (ou au retour au mess). */
export class MessServiceMusic {
  private tune: { stop: () => void } | null = null

  constructor(private sound: Sound) {}

  get audible(): boolean {
    return !!this.tune
  }

  start() {
    if (this.tune || !this.sound.ready) return
    this.tune = this.sound.music(SERVICE.file, SERVICE.volume, { loop: SERVICE.loop })
  }

  stop() {
    this.tune?.stop()
    this.tune = null
  }
}
