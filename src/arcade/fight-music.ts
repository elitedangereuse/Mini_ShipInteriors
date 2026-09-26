import { composeFightMusic } from '../../shared/fight-music.js'
export type FightMusicScene = 'intro' | 'select' | 'battle' | 'pause' | 'over'
let tune: Float32Array<ArrayBuffer> | null = null

/** Musique de la borne : sortie du jeu, donc volume et mute M restent communs. */
export class FightMusic {
  private readonly source: AudioBufferSourceNode
  private readonly gain: GainNode
  private scene: FightMusicScene | null = null
  private stopped = false
  constructor(private readonly ctx: AudioContext, out: AudioNode) {
    tune ??= new Float32Array(composeFightMusic(22050))
    const buffer = ctx.createBuffer(1, tune.length, 22050)
    buffer.copyToChannel(tune, 0)
    this.source = ctx.createBufferSource()
    this.source.buffer = buffer
    this.source.loop = true
    this.gain = ctx.createGain()
    this.gain.gain.value = 0
    this.source.connect(this.gain).connect(out)
    this.source.start()
    this.setScene('intro')
  }
  setScene(scene: FightMusicScene) {
    if (this.scene === scene || this.stopped) return
    this.scene = scene
    const volume = { intro: 0.7, select: 0.4, battle: 0.55, pause: 0, over: 0.35 }[scene]
    this.gain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.08)
  }
  stop() {
    if (this.stopped) return
    this.stopped = true
    this.source.stop()
    this.source.disconnect()
    this.gain.disconnect()
  }
}
