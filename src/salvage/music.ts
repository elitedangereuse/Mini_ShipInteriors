import type { Sound } from '../audio'

/*
 * La musique du lobby de récupération thargoïde : une piste inquiétante, volontairement glitchée
 * dans son fichier, que la sono de sécurité rend encore plus étroite et saturée.
 */

const LOBBY = { file: 'thargoid-salvage/corrupted-lobby.mp3', volume: 0.25 }

/** Un vieux haut-parleur de sécurité : mono, peu de graves et d'aigus, médiums durs et saturés. */
function damagedSpeaker(ctx: AudioContext, from: AudioNode): AudioNode {
  const mono = ctx.createGain()
  mono.channelCount = 1
  mono.channelCountMode = 'explicit'

  const high = ctx.createBiquadFilter()
  high.type = 'highpass'
  high.frequency.value = 300
  high.Q.value = 0.9

  const mid = ctx.createBiquadFilter()
  mid.type = 'peaking'
  mid.frequency.value = 1450
  mid.Q.value = 1.3
  mid.gain.value = 7

  const low = ctx.createBiquadFilter()
  low.type = 'lowpass'
  low.frequency.value = 3100
  low.Q.value = 1.1

  const drive = ctx.createWaveShaper()
  const curve = new Float32Array(257)
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(4 * (i / 128 - 1)) / Math.tanh(4)
  drive.curve = curve
  drive.oversample = '2x'

  from.connect(mono).connect(high).connect(mid).connect(drive).connect(low)
  return low
}

/** La sono du lobby : elle ne joue que lorsque le joueur se trouve dans la pièce. */
export class SalvageLobbyMusic {
  private tune: { stop: () => void } | null = null

  constructor(private sound: Sound) {}

  get audible(): boolean {
    return !!this.tune
  }

  update(inside: boolean) {
    if (inside === !!this.tune) return
    if (!inside) {
      this.tune!.stop()
      this.tune = null
    } else if (this.sound.ready) {
      this.tune = this.sound.music(LOBBY.file, LOBBY.volume, { shared: true, through: damagedSpeaker })
    }
  }
}
