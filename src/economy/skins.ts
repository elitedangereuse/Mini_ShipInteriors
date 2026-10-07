import { RACES, variantsOf, type Look } from '../looks'
import { skinPrice } from './data'
import type { Wallet } from './wallet'

/*
 * Apparences payantes du Holo-Me (prix : « skins » dans economy.json). Les humains et la
 * combinaison de vol sont offerts ; une combinaison ou une teinte d'alien s'achète une fois pour
 * tous les modèles (une projection d'hologramme aussi, mais elle ne s'achète pas : une quête
 * l'offre, cf. shared/quests.js) ; un robot, une créature ou une forme de Gardien, un par un. Une apparence sans
 * prix dans economy.json est gratuite. On essaie tout au Holo-Me ; on ne porte que ce qu'on a.
 */

/** Races dont on achète une teinte (pour tous les modèles), plutôt qu'un modèle. */
const BY_TINT = new Set<string>(['suit', 'alien', 'holo'])

/** Clé d'achat d'une apparence (« suit.artemis », « robot.g »…), ou null si elle est gratuite. */
export function skinProduct(look: Look): string | null {
  const key = BY_TINT.has(look.race) ? `${look.race}.${look.tint}` : `${look.race}.${look.variant}`
  return skinPrice(key) !== null ? key : null
}

/** Le joueur peut-il porter cette apparence (gratuite, ou achetée) ? */
export function lookOwned(look: Look, wallet: Wallet): boolean {
  const product = skinProduct(look)
  return product === null || wallet.skins.has(product)
}

/** Toutes les apparences du catalogue (une par race, sexe, modèle et teinte). */
export function allLooks(): Look[] {
  const out: Look[] = []
  for (const race of RACES) {
    for (const sex of race.sexed ? (['female', 'male'] as const) : (['female'] as const)) {
      for (const v of variantsOf(race, sex)) {
        for (const tint of race.tints?.map((t) => t.id) ?? ['green']) out.push({ race: race.id, sex, variant: v.id, tint })
      }
    }
  }
  return out
}

/** Apparence d'un nouveau joueur : la combinaison de vol, offerte, sur un modèle au hasard. */
export function starterLook(): Look {
  const sex = Math.random() < 0.5 ? 'female' : 'male'
  const suit = RACES.find((r) => r.id === 'suit')!
  const variants = variantsOf(suit, sex)
  return { race: 'suit', sex, variant: variants[Math.floor(Math.random() * variants.length)].id, tint: 'flight' }
}
