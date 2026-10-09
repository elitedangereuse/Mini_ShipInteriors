import { tr } from '../i18n'
import { plotStatus, type PlotNeed } from '../../shared/gardening.js'
import { CROPS, RULES } from './data'
import type { GardenStore } from './store'

/*
 * Les rappels de Capucine : quand une culture du joueur a soif, se couvre de mauvaises herbes ou
 * est mûre, elle lui écrit, dans leur conversation du combiné de bord (cf. crew/phone.ts). Le jeu
 * regarde le jardin de temps en temps, où que soit le joueur à bord ; à son arrivée, le premier
 * message résume ce qui l'attend depuis sa dernière visite.
 *
 * Elle prévient, elle ne relance pas : une chose dite (« tes carottes sont mûres ») ne l'est qu'une
 * fois, tant qu'elle reste vraie. Elle le redira si ça se reproduit après avoir été réglé (les
 * carottes récoltées, puis d'autres qui mûrissent).
 */

/** Ce dont Capucine parle (une terre prête où rien n'est semé n'attend personne). */
type Told = Exclude<PlotNeed, 'sow'>

/** Entre deux regards sur le jardin (secondes). */
const EVERY = 20

/** Ce qu'elle a déjà dit, gardé le temps de l'onglet : recharger la page ne le lui fait pas répéter. */
const SAID_KEY = 'mini-shipinteriors-garden-said'

function restore(): Set<string> | null {
  try {
    const said: unknown = JSON.parse(sessionStorage.getItem(SAID_KEY) ?? 'null')
    return Array.isArray(said) ? new Set(said.filter((s) => typeof s === 'string')) : null
  } catch {
    return null
  }
}

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
  /** Ce qu'elle a dit et qui est toujours vrai : « harvest:carrot », une fois pour toutes les tuiles de carottes. */
  private said: Set<string>
  private clock = EVERY
  private first: boolean

  constructor(
    private readonly store: GardenStore,
    /** Capucine écrit au joueur. */
    private readonly post: (text: string) => void,
  ) {
    const said = restore()
    this.said = said ?? new Set()
    this.first = !said
  }

  update(dt: number) {
    this.clock += dt
    if (this.clock < EVERY || !this.store.ready) return
    this.clock = 0
    const now = this.store.now()
    /** Par état, puis par culture : le nombre de tuiles qui l'attendent. */
    const waiting: Record<Told, Map<string, number>> = { water: new Map(), weed: new Map(), harvest: new Map() }
    for (const plot of Object.values(this.store.garden.plots)) {
      if (!plot.c) continue
      const need = plotStatus(RULES, plot, now).need
      if (need && need !== 'sow') waiting[need].set(plot.c, (waiting[need].get(plot.c) ?? 0) + 1)
    }
    const current = new Set<string>()
    const parts: string[] = []
    for (const need of ['harvest', 'water', 'weed'] as const) {
      const fresh: string[] = []
      let plots = 0
      for (const [crop, n] of waiting[need]) {
        current.add(`${need}:${crop}`)
        if (this.said.has(`${need}:${crop}`)) continue
        fresh.push(crop)
        plots += n
      }
      if (fresh.length) parts.push(pick(LINES[need])(list(fresh), plots))
    }
    // Ce qui n'est plus vrai est oublié : elle pourra le redire le jour où ça revient.
    this.said = current
    try {
      sessionStorage.setItem(SAID_KEY, JSON.stringify([...current]))
    } catch {
      /* Stockage indisponible. */
    }
    if (!parts.length) return
    const hello = this.first ? tr('Je suis passée voir ton jardin. ', 'I dropped by your garden. ') : ''
    this.first = false
    this.post(hello + parts.join(' '))
  }
}
