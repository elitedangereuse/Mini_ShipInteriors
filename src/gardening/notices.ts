import { tr } from '../i18n'
import { plotStatus, type PlotNeed } from '../../shared/gardening.js'
import { CROPS, RULES } from './data'
import type { GardenStore } from './store'

/*
 * Les rappels de Capucine : quand une culture du joueur a soif, se couvre de mauvaises herbes ou
 * est mûre, elle lui écrit, dans leur conversation du combiné de bord (cf. crew/phone.ts). Le jeu
 * regarde le jardin de temps en temps, où que soit le joueur à bord ; à son arrivée, le premier
 * message résume ce qui l'attend depuis sa dernière visite.
 */

/** Ce dont Capucine parle (une terre prête où rien n'est semé n'attend personne). */
type Told = Exclude<PlotNeed, 'sow'>

/** Entre deux regards sur le jardin (secondes). */
const EVERY = 20

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]

/** « tomates », « tomates et carottes », « tomates, carottes et radis ». */
function list(crops: string[]): string {
  const names = [...new Set(crops)].map((id) => CROPS[id]?.plural ?? id)
  if (names.length < 2) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} ${tr('et', 'and')} ${names.at(-1)}`
}

/** Les phrases ne s'accordent pas avec les cultures (« tomates », « radis ») : elles tiennent pour toutes. */
const LINES: Record<Told, ((what: string, n: number) => string)[]> = {
  water: [
    (what, n) => tr(`Tes ${what} ont soif (${n} tuile${n > 1 ? 's' : ''}). Un coup d'arrosoir, ça ne pousse plus !`, `Your ${what} are thirsty (${n} plot${n > 1 ? 's' : ''}). Grab the watering can, nothing is growing!`),
    (what) => tr(`La terre de tes ${what} est sèche comme Hutton Orbital. L'arrosoir, vite.`, `The soil under your ${what} is as dry as Hutton Orbital. The watering can, quick.`),
  ],
  weed: [
    (what) => tr(`Des mauvaises herbes étouffent tes ${what}. Sors la bêche, ça ne pousse plus là-dessous.`, `Weeds are choking your ${what}. Get the spade out, nothing grows under there.`),
    (what, n) => tr(`Tes ${what} disparaissent sous les mauvaises herbes (${n} tuile${n > 1 ? 's' : ''}). Un bon désherbage et ça repart.`, `Your ${what} are vanishing under the weeds (${n} plot${n > 1 ? 's' : ''}). A good weeding and off they go again.`),
  ],
  harvest: [
    (what) => tr(`C'est mûr : ${what} ! Le sécateur, et Marcel t'attend au mess.`, `Ripe: ${what}! Secateurs out, and Marcel is waiting in the mess.`),
    (what, n) => tr(`C'est le jour de la récolte : ${what} (${n} tuile${n > 1 ? 's' : ''}). C'est magnifique, bravo.`, `Harvest day: ${what} (${n} plot${n > 1 ? 's' : ''}). It looks wonderful, well done.`),
  ],
}

export class GardenNotices {
  /** Ce que chaque tuile attendait la dernière fois qu'on a regardé. */
  private told = new Map<string, Told | null>()
  private clock = EVERY
  private first = true

  constructor(
    private readonly store: GardenStore,
    /** Capucine écrit au joueur. */
    private readonly post: (text: string) => void,
  ) {}

  update(dt: number) {
    this.clock += dt
    if (this.clock < EVERY || !this.store.ready) return
    this.clock = 0
    const now = this.store.now()
    const fresh: Record<Told, string[]> = { water: [], weed: [], harvest: [] }
    const seen = new Set<string>()
    for (const [key, plot] of Object.entries(this.store.garden.plots)) {
      if (!plot.c) continue
      // Replantée depuis : c'est une autre culture, qui aura ses propres rappels.
      const id = `${key}@${plot.p}`
      seen.add(id)
      const need = plotStatus(RULES, plot, now).need
      const told = need === 'sow' ? null : need
      if (told && this.told.get(id) !== told) fresh[told].push(plot.c)
      this.told.set(id, told)
    }
    for (const id of [...this.told.keys()]) if (!seen.has(id)) this.told.delete(id)
    const parts = (['harvest', 'water', 'weed'] as const).filter((need) => fresh[need].length).map((need) => pick(LINES[need])(list(fresh[need]), fresh[need].length))
    const hello = this.first ? tr('Je suis passée voir ton jardin. ', 'I dropped by your garden. ') : ''
    this.first = false
    if (!parts.length) return
    this.post(hello + parts.join(' '))
  }
}
