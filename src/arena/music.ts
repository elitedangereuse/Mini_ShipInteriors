import { RangeMusic, type RangeMood } from '../range-music'

/*
 * Musique de l'arène : le séquenceur du stand de tir (cf. src/range-music.ts), avec un autre
 * morceau, plus vif et plus joueur. En la mineur, sur quatre accords qui tournent (la mineur, fa, do,
 * sol), à 138 battements par minute et au-delà :
 *
 * - pendant la mise en place : une montée, la caisse claire qui roule de plus en plus serré ;
 * - au coup d'envoi : la grosse caisse sur chaque temps, le charleston à contretemps, une basse
 *   qui rebondit ;
 * - puis, à mesure que la partie chauffe (`level`, de 0 à 3 : le score qui monte, les balles qu'on
 *   échange) : les claquements de mains et les accords plaqués à contretemps, le thème, puis son
 *   contre-chant à l'octave et les charlestons en doubles croches ;
 * - balle de match, ou dernières secondes (`rush`) : tout monte d'un ton, le tempo s'emballe, la
 *   caisse claire roule en fin de mesure.
 */

/** Demi-tons au-dessus du la : fréquence. */
const note = (semitones: number, octave = 4) => 440 * 2 ** (semitones / 12 + octave - 4)

/** Accords, une mesure chacun : la basse, les trois notes plaquées. */
const CHORDS = [
  { bass: note(0, 2), stab: [note(0), note(3), note(7)] }, // la mineur
  { bass: note(-4, 2), stab: [note(-4), note(0), note(3)] }, // fa
  { bass: note(3, 2), stab: [note(3), note(7), note(10)] }, // do
  { bass: note(-2, 2), stab: [note(-2), note(2), note(5)] }, // sol
]

/** Le thème : une note (demi-tons au-dessus du la 4) ou un silence par double croche, une ligne par accord. */
const _ = null
const THEME: (number | null)[][] = [
  [7, _, _, 7, _, 5, _, 3, _, _, 0, _, 3, _, 5, _],
  [3, _, _, 3, _, 0, _, -4, _, _, 0, _, 3, _, 8, _],
  [7, _, _, 7, _, 10, _, 7, _, _, 3, _, 5, _, 7, _],
  [5, _, _, 5, _, 2, _, -2, _, _, 2, _, 5, _, 10, 7],
]
/** La basse rebondit : octave de la fondamentale (0 ou 1) ou silence, par double croche. */
const BOUNCE = [0, _, _, 0, _, _, 1, _, 0, _, 1, _, _, 0, 1, _]

export class ArenaMusic extends RangeMusic {
  protected override tempo(mood: RangeMood): number {
    return (138 + 4 * Math.min(mood.level, 3)) * (mood.rush ? 1.07 : 1)
  }

  protected override play(n: number, t: number, mood: RangeMood) {
    const out = this.out!, bus = this.bus!
    const s = n % 16, bar = Math.floor(n / 16) % CHORDS.length
    const chord = CHORDS[bar]
    // Balle de match : tout monte d'un ton.
    const lift = mood.rush ? 2 ** (2 / 12) : 1
    if (!mood.started) {
      // La mise en place : une note tenue, et la caisse claire qui roule de plus en plus serré.
      if (s === 0) this.tone(out, 'sawtooth', chord.bass * 2, chord.bass * 2, t, 1.6, 0.05, 600, 0, 0.4)
      const every = bar < 1 ? 8 : bar < 2 ? 4 : s < 8 ? 2 : 1
      if (s % every === 0) this.snare(bus, out, t, 0.1 + (bar * 16 + s) * 0.004)
      return
    }
    const level = mood.level + (mood.rush ? 1 : 0)
    if (s % 4 === 0) {
      this.kick(out, t)
      this.kicks.push(t)
    }
    // Charleston : à contretemps, puis en doubles croches quand ça chauffe.
    if (s % 4 === 2) this.noise(out, t, 0.06, 8000, 0.17)
    else if (level >= 3) this.noise(out, t, 0.025, 9000, 0.08)
    // La basse qui rebondit.
    const hop = BOUNCE[s]
    if (hop !== null) {
      const f = chord.bass * (hop ? 2 : 1) * lift
      this.tone(out, 'sawtooth', f, f, t, 0.14, 0.22, 500 + 180 * Math.min(level, 4), 0, 0.004)
    }
    if (level >= 1) {
      // Les mains claquent sur les temps faibles, les accords se plaquent juste après.
      if (s === 4 || s === 12) this.snare(bus, out, t, 0.32)
      if (s === 6 || s === 14) for (const f of chord.stab) this.tone(bus, 'square', f * lift, f * lift, t, 0.09, 0.035, 1800, 0, 0.003)
    }
    if (level >= 2) {
      const step = THEME[bar][s]
      if (step !== null) {
        const f = note(step, 5) * lift
        this.tone(out, 'square', f, f, t, 0.16, 0.075, 3200, 0, 0.004)
        this.tone(bus, 'triangle', f, f, t, 0.16, 0.05, 4000, 0, 0.004)
        // Le contre-chant, une octave plus haut, une note sur deux.
        if (level >= 3 && s % 4 === 0) this.tone(bus, 'square', f * 2, f * 2, t, 0.1, 0.03, 5000, 0, 0.003)
      }
    }
    // Balle de match : la caisse claire roule sur le dernier temps.
    if (mood.rush && s >= 12) this.snare(bus, out, t, 0.12 + (s - 12) * 0.06)
  }
}
