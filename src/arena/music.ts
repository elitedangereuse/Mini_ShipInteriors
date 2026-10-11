import type { Sound } from '../audio'
import type { RangeTune } from '../range-music'

/*
 * Les musiques de CMDR Arena : deux morceaux enregistrés (public/assets/music/cmdr-arena/, cf.
 * CREDITS.txt), chacun en boucle.
 *
 * - pendant la partie, « Pixel Brawl », à 60 % ;
 * - au lobby, « Game Menu Groove », en fond : c'est la sono de la pièce, un haut-parleur de hall
 *   (cf. speaker), et on ne l'entend que dedans.
 *
 * Aucun des deux n'a été coupé pour boucler : le fichier s'arrête net au milieu d'une mesure, puis
 * un quart de seconde de blanc. La boucle prend donc, depuis le début, un nombre entier de mesures
 * (tempo mesuré sur le fichier) : au raccord, le rythme ne saute pas.
 */

/** `n` mesures à quatre temps depuis le début du morceau. */
const bars = (bpm: number, n: number) => ({ from: 0, to: (n * 4 * 60) / bpm })

const MATCH = { file: 'cmdr-arena/pixel-brawl.mp3', volume: 0.6, loop: bars(150.025, 52) }
const LOBBY = { file: 'cmdr-arena/game-menu-groove.mp3', volume: 0.26, loop: bars(114.905, 32) }

/** La musique de la partie, pour le moteur du stand de tir (cf. src/arena/gun.ts). */
export class ArenaMusic implements RangeTune {
  private tune: { stop: () => void } | null = null
  /** Un morceau enregistré : les lumières n'ont pas de grosse caisse à suivre. */
  readonly pulse = 0

  constructor(private sound: Sound) {}

  start() {
    if (this.tune || !this.sound.ready) return
    this.tune = this.sound.music(MATCH.file, MATCH.volume, { loop: MATCH.loop })
  }

  stop() {
    this.tune?.stop()
    this.tune = null
  }

  /** Le morceau ne suit pas la partie : l'ardeur que lui donne le moteur (cf. RangeMood) n'est pas lue. */
  update() {}
}

/**
 * Le son d'un haut-parleur de hall : une seule voie, ni graves ni aigus, la bosse nasillarde du
 * pavillon dans les médiums, et une membrane qui sature un peu.
 */
function speaker(ctx: AudioContext, from: AudioNode): AudioNode {
  const mono = ctx.createGain()
  mono.channelCount = 1
  mono.channelCountMode = 'explicit'
  const filter = (type: BiquadFilterType, frequency: number, q: number, gain = 0) => {
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = frequency
    f.Q.value = q
    f.gain.value = gain
    return f
  }
  const drive = ctx.createWaveShaper()
  const curve = new Float32Array(257)
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(2.2 * (i / 128 - 1)) / Math.tanh(2.2)
  drive.curve = curve
  drive.oversample = '2x'
  const out = filter('lowpass', 3400, 0.8)
  from.connect(mono).connect(filter('highpass', 330, 0.7)).connect(filter('peaking', 1500, 1.1, 6)).connect(drive).connect(out)
  return out
}

/** La sono du lobby : elle joue tant qu'on y est, la même mesure pour tous ceux qui s'y trouvent. */
export class ArenaLobbyMusic {
  private tune: { stop: () => void } | null = null

  constructor(private sound: Sound) {}

  /** On l'entend (les autres musiques de la cale et le bruit des machines lui laissent la place). */
  get audible(): boolean {
    return !!this.tune
  }

  /** À appeler à chaque image : `inside`, le joueur est dans le lobby. */
  update(inside: boolean) {
    if (inside === !!this.tune) return
    if (!inside) {
      this.tune!.stop()
      this.tune = null
      // Avant le premier geste du joueur, le son n'a pas démarré.
    } else if (this.sound.ready) this.tune = this.sound.music(LOBBY.file, LOBBY.volume, { loop: LOBBY.loop, shared: true, through: speaker })
  }
}
