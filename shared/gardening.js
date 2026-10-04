// Le jardinage dans les quartiers (cf. src/gardening/) : des tuiles de terre cultivable, qu'on
// prépare, sème, arrose, désherbe et récolte. Ici : comment pousse une culture, et ce qu'elle donne.
// Les chiffres (cultures, outils, terreaux, engrais, prix) sont dans src/economy/economy.json,
// section `gardening` : le jeu les intègre, le site les relit.
//
// Le site tient le jardin de chaque CMDR et fait foi (phputils/mini_shipinteriors/gardening.php, qui
// reprend ces règles : les deux doivent rester identiques, un test de chaque côté rejoue les mêmes
// cas). Le jeu s'en sert pour montrer où en est chaque tuile sans le lui redemander.
//
// Une tuile travaillée (`plot`) : { s, c?, p?, g?, t?, w?, d?, f?, x?, k? }
// - s : son terreau ; c : sa culture (absente : la terre est prête, rien n'est semé) ;
// - p : date du semis ; t : date jusqu'à laquelle la pousse est comptée ;
// - g : pousse acquise, en points (deux par seconde sans engrais, cf. growRate) ;
// - w : arrosée jusqu'à cette date ; d : secondes passées à ne pas pousser avant d'être mûre
//   (à sec, ou sous les mauvaises herbes) ;
// - f : son engrais ; x : pousse à laquelle les mauvaises herbes lèvent (0 : jamais) ; k : désherbée.
// Les dates sont en secondes Unix, à l'heure du site.

/** Les outils, dans l'ordre de la barre du mode jardinage. */
export const GARDEN_TOOLS = ['hoe', 'trowel', 'can', 'shears']

/** Niveaux d'un outil : de base (offert), renforcé, de maître. */
export const TOOL_TIERS = 3

/** Clé d'une tuile : la position de l'objet posé dans les quartiers, « x,z ». */
export const PLOT_KEY = /^-?\d{1,3}(?:\.\d{1,3})?,-?\d{1,3}(?:\.\d{1,3})?$/

export const plotKey = (x, z) => `${x},${z}`

/** Jardin d'un CMDR qui n'a encore rien fait. */
export function emptyGarden() {
  return { plots: {}, bag: { seeds: {}, soils: {}, ferts: {} }, tools: { hoe: 0, trowel: 0, can: 0, shears: 0 }, stock: {} }
}

/** Points de pousse d'une culture mûre. */
export const growGoal = (crop) => crop.grow * 2

/** Points de pousse par seconde : deux, plus avec un engrais. */
export function growRate(rules, plot) {
  const fert = plot.f ? rules.fertilizers[plot.f] : undefined
  return Math.round((fert ? fert.speed : 1) * 2)
}

/** Cette culture a-t-elle des mauvaises herbes à un moment de sa pousse ? Les plus rapides, non. */
export const hasWeeds = (rules, crop) => crop.grow >= rules.weedsFrom

/** Les mauvaises herbes ont levé et n'ont pas été arrachées : la pousse est arrêtée. */
export const weedy = (plot) => plot.x > 0 && !plot.k && plot.g >= plot.x

/**
 * Compte la pousse de la tuile jusqu'à `now` (modifie `plot` et le rend). Elle ne pousse
 * qu'arrosée, s'arrête quand les mauvaises herbes lèvent, et ne dépasse pas sa maturité.
 */
export function advancePlot(rules, plot, now) {
  const crop = plot.c ? rules.crops[plot.c] : undefined
  if (!crop) return plot
  const goal = growGoal(crop), rate = growRate(rules, plot)
  let cursor = plot.t
  while (cursor < now && plot.g < goal) {
    if (weedy(plot)) {
      plot.d += now - cursor
      break
    }
    const wet = Math.min(plot.w, now) - cursor
    if (wet <= 0) {
      plot.d += now - cursor
      break
    }
    const limit = plot.x > 0 && !plot.k && plot.g < plot.x ? plot.x : goal
    const span = Math.min(wet, Math.ceil((limit - plot.g) / rate))
    plot.g = Math.min(limit, plot.g + span * rate)
    cursor += span
  }
  plot.t = Math.max(plot.t, now)
  return plot
}

/**
 * Où en est la tuile à l'instant `now` (sans la modifier) : `stage` de 0 (semis) à 3 (mûre), -1 si
 * rien n'est semé ; `progress` de 0 à 1 ; ce qu'elle attend (`need` : sow, water, weed, harvest,
 * ou null si elle pousse) ; `wet` : elle est arrosée ; `next` : date du prochain changement (0 :
 * rien ne change sans le joueur).
 */
export function plotStatus(rules, plot, now) {
  const crop = plot.c ? rules.crops[plot.c] : undefined
  if (!crop) return { stage: -1, progress: 0, need: 'sow', wet: false, next: 0 }
  const p = advancePlot(rules, { ...plot }, now)
  const goal = growGoal(crop)
  if (p.g >= goal) return { stage: 3, progress: 1, need: 'harvest', wet: false, next: 0 }
  const progress = p.g / goal
  const stage = progress < 0.3 ? 0 : progress < 0.7 ? 1 : 2
  if (weedy(p)) return { stage, progress, need: 'weed', wet: p.w > now, next: 0 }
  if (p.w <= now) return { stage, progress, need: 'water', wet: false, next: 0 }
  const limit = p.x > 0 && !p.k && p.g < p.x ? p.x : goal
  return { stage, progress, need: null, wet: true, next: Math.min(p.w, now + Math.ceil((limit - p.g) / growRate(rules, p))) }
}

/** Ce que coûte la négligence : 0, 1 ou 2, selon le temps passé à ne pas pousser. */
export function neglect(rules, crop, plot) {
  const { floor, factor } = rules.neglect
  if (plot.d > Math.max(floor[1], crop.grow * factor[1])) return 2
  return plot.d > Math.max(floor[0], crop.grow * factor[0]) ? 1 : 0
}

/**
 * Récolte d'une tuile mûre (déjà comptée jusqu'à maintenant) : sa qualité (`grade`, 0 à 2 : celle
 * du terreau, moins la négligence) et le nombre d'unités (le rendement de la culture, plus ce
 * qu'ajoute le sécateur, moins la négligence ; une au moins).
 */
export function harvestOf(rules, plot, tools) {
  const crop = rules.crops[plot.c]
  const lost = neglect(rules, crop, plot)
  return {
    grade: Math.max(0, rules.soils[plot.s].grade - lost),
    count: Math.max(1, crop.yield + rules.tools.shears.bonus[tools.shears] - lost),
  }
}

/** Prix auquel Marcel achète une unité de cette culture, à cette qualité. */
export const unitPrice = (rules, crop, grade) => Math.round(rules.crops[crop].price * rules.grades[grade])

/** Clé d'une récolte en réserve : la culture et sa qualité. */
export const stockKey = (crop, grade) => `${crop}:${grade}`

/** Unités en réserve. */
export const stockTotal = (stock) => Object.values(stock).reduce((sum, n) => sum + n, 0)

/** Place de la réserve : celle du cabanon, plus grande avec des caisses de récolte. */
export const stockRoom = (rules, crate) => (crate ? rules.stock.crate : rules.stock.base)
