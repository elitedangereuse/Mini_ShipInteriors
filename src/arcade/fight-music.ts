import { composeFightMusic } from '../../shared/fight-music.js'
import { fightStage, type FightStageId } from '../../shared/fight-stages.js'
export type FightMusicScene = 'intro' | 'select' | 'battle' | 'pause' | 'over'
const tunes = new Map<FightStageId, Float32Array<ArrayBuffer>>()
const volumes = { intro: 0.7, select: 0.4, battle: 0.55, pause: 0, over: 0.35 }

/** Une boucle par stage ; changement en fondu, volume/mute communs au jeu. */
export class FightMusic {
  private readonly gain: GainNode
  private readonly buffers = new Map<FightStageId, AudioBuffer>()
  private readonly voices = new Set<{ source: AudioBufferSourceNode; fade: GainNode }>()
  private current: { source: AudioBufferSourceNode; fade: GainNode } | null = null
  private track: FightStageId | null = null
  private scene: FightMusicScene | null = null
  private stopped = false
  constructor(private readonly ctx: AudioContext, out: AudioNode) {
    this.gain = ctx.createGain()
    this.gain.gain.value = 0
    this.gain.connect(out)
    this.setScene('intro')
  }
  setScene(scene: FightMusicScene, stage?: FightStageId) {
    if (this.stopped) return
    const track = fightStage(stage ?? (scene === 'pause' ? this.track : null) ?? 'street').music
    if (this.track !== track) {
      let buffer = this.buffers.get(track)
      if (!buffer) {
        if (!tunes.has(track)) tunes.set(track, new Float32Array(composeFightMusic(22050, track)))
        const tune = tunes.get(track)!
        buffer = this.ctx.createBuffer(1, tune.length, 22050)
        buffer.copyToChannel(tune, 0)
        this.buffers.set(track, buffer)
      }
      const now = this.ctx.currentTime
      if (this.current) {
        this.current.fade.gain.setTargetAtTime(0, now, 0.04)
        this.current.source.stop(now + 0.25)
      }
      const voice = { source: this.ctx.createBufferSource(), fade: this.ctx.createGain() }
      voice.source.buffer = buffer; voice.source.loop = true
      voice.fade.gain.value = 0
      voice.source.connect(voice.fade).connect(this.gain)
      voice.source.onended = () => {
        voice.source.disconnect(); voice.fade.disconnect(); this.voices.delete(voice)
      }
      this.voices.add(voice)
      voice.source.start()
      voice.fade.gain.setTargetAtTime(1, now, 0.04)
      this.current = voice; this.track = track
    }
    if (this.scene !== scene) {
      this.scene = scene
      this.gain.gain.setTargetAtTime(volumes[scene], this.ctx.currentTime, 0.08)
    }
  }
  stop() {
    if (this.stopped) return
    this.stopped = true
    for (const voice of this.voices) {
      voice.source.onended = null
      voice.source.stop(); voice.source.disconnect(); voice.fade.disconnect()
    }
    this.voices.clear(); this.current = null; this.buffers.clear()
    this.gain.disconnect()
  }
}
