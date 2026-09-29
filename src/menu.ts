import { tr } from './i18n'

/*
 * Menu du jour du mess : une entrée, un plat, un dessert et une boisson, tirés des
 * marchandises rares d'Elite Dangerous. Il ne dépend que de la date : tout le bord mange la
 * même chose, et le menu change à minuit (heure de l'appareil). Le tableau du mess l'affiche,
 * le self le sert, Marcel en parle (cf. furniture/kitchen.ts, kitchen.ts, chef.ts).
 */

export interface Menu {
  starter: string
  main: string
  dessert: string
  drink: string
}

const STARTERS = [
  tr('Velouté de baies de Neritus', 'Neritus berry velouté'),
  tr('Salade de riz de Jaroua', 'Jaroua rice salad'),
  tr('Chips de criquets de Karsuki', 'Karsuki locust crisps'),
  tr('Tartine de pâte marine de Chi Eridani', 'Chi Eridani marine paste on toast'),
  tr('Œufs coriaces mimosa', 'Devilled leathery eggs'),
  tr('Bouillon de sangsues de Kachirigin', 'Kachirigin leech broth'),
]

const MAINS = [
  tr('Ragoût de lapin de Ceti', 'Ceti rabbit stew'),
  tr('Escargots géants d\'Irukama au beurre', 'Giant Irukama snails in butter'),
  tr('Curry aux piments d\'Ochoeng', 'Ochoeng chilli curry'),
  tr('Mammouth albinos Quechua braisé', 'Braised Albino Quechua mammoth'),
  tr('Omelette à l\'œuf d\'Aepyornis', 'Aepyornis egg omelette'),
  tr('Ailes basse-g d\'Uzumoku', 'Uzumoku low-g wings'),
  tr('Festin de bête de Mokojing', 'Mokojing beast feast'),
  tr('Bœuf de Kobe de Witchhaul, sauce CD-75', 'Witchhaul Kobe beef, CD-75 sauce'),
]

const DESSERTS = [
  tr('Tarte aux baies de Neritus', 'Neritus berry tart'),
  tr('Crème au lait azur', 'Azure milk custard'),
  tr('Mousse au café CD-75', 'CD-75 coffee mousse'),
  tr('Riz au lait de Jaroua', 'Jaroua rice pudding'),
  tr('Barre protéinée « goût Achenar »', '“Achenar flavour” protein bar'),
]

const DRINKS = [
  tr('Café CD-75 Kitten Brand', 'CD-75 Kitten Brand coffee'),
  tr('Thé en bourgeons d\'Ethgreze', 'Ethgreze tea buds'),
  tr('Haiden Black Brew', 'Haiden Black Brew'),
  tr('Thé tranquille de Tanmark', 'Tanmark tranquil tea'),
  tr('Eau recyclée, millésime du jour', 'Recycled water, today\'s vintage'),
]

/** Numéro du jour (heure de l'appareil) : le menu change à minuit. */
export function dayNumber(date = new Date()): number {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60000) / 86400000)
}

/**
 * Menu d'un jour : chaque liste avance d'un pas différent, premier avec sa longueur, pour que
 * deux jours de suite ne se ressemblent pas.
 */
export function menuOf(day = dayNumber()): Menu {
  const at = <T,>(list: readonly T[], step: number) => list[(((day * step) % list.length) + list.length) % list.length]
  return { starter: at(STARTERS, 5), main: at(MAINS, 3), dessert: at(DESSERTS, 2), drink: at(DRINKS, 3) }
}

/** Date affichée au tableau du mess : le calendrier d'Elite a 1286 ans d'avance. */
export function menuDate(date = new Date()): string {
  const d = String(date.getDate()).padStart(2, '0'), m = String(date.getMonth() + 1).padStart(2, '0')
  return tr(`${d}/${m}/${date.getFullYear() + 1286}`, `${date.getFullYear() + 1286}-${m}-${d}`)
}
