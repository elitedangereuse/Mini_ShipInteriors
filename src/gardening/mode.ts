import type { WorkSound } from '../economy/tasks'
import { tr } from '../i18n'
import { icon, type IconName } from '../icons'
import { $ } from '../ui'
import { stockRoom, stockTotal, type GardenTool, type PlotNeed } from '../../shared/gardening.js'
import { cropName, CROPS, FERTS, formatDuration, gradeStars, RULES, SOILS, TOOLS } from './data'
import type { GardenAction, GardenRefusal, GardenStore } from './store'
import type { GardenTile, GardenView } from './view'

/*
 * Le mode jardinage, dans ses quartiers : la barre des emotes laisse la place aux outils du
 * jardinier (bêche, plantoir, arrosoir, engrais, sécateur), et la touche d'interaction fait, sur la
 * tuile de terre la plus proche, ce que fait l'outil en main. Chaque geste prend quelques secondes
 * (moins avec un meilleur outil, cf. `tools` dans economy.json), puis le site l'enregistre (cf.
 * store.ts). Avec le mauvais outil en main, la touche prend d'abord le bon.
 */

/** Ce qu'on a en main : un outil, ou l'engrais (qui se répand à la main). */
export type GardenHand = GardenTool | 'feed'

const HANDS: { id: GardenHand; label: string; icon: IconName }[] = [
  { id: 'hoe', label: TOOLS.hoe.does, icon: TOOLS.hoe.icon },
  { id: 'trowel', label: TOOLS.trowel.does, icon: TOOLS.trowel.icon },
  { id: 'can', label: TOOLS.can.does, icon: TOOLS.can.icon },
  { id: 'feed', label: tr('Nourrir à l\'engrais', 'Feed with fertiliser'), icon: 'sparkle' },
  { id: 'shears', label: TOOLS.shears.does, icon: TOOLS.shears.icon },
]

/** L'outil qu'il faut pour ce qu'attend une tuile. */
const NEED_HAND: Record<PlotNeed, GardenHand> = { sow: 'trowel', water: 'can', weed: 'hoe', harvest: 'shears' }

/** Geste d'engrais : il ne dépend d'aucun outil. */
const FEED_TIME = 1.5

export interface GardenModeHost {
  store: GardenStore
  view: GardenView
  /** Pourquoi on ne peut pas jardiner maintenant (en visite, invité…), ou null. */
  refusal: () => string | null
  /** Se met à l'ouvrage (cf. startWork dans main.ts) ; false si le joueur est occupé ailleurs. */
  work: (job: { x: number; z: number; duration: number; label: string; sound: WorkSound; alive: () => boolean; finish: () => void }) => boolean
  /** Texte dans la boîte de dialogue. */
  show: (text: string) => void
  /** Ligne dans le journal. */
  log: (text: string) => void
  sound: (kind: 'pick' | 'deny' | 'win') => void
  /** Le mode s'ouvre ou se ferme (cf. main.ts : la barre des emotes, les invites). */
  onToggle: (active: boolean) => void
}

/** Ce que ferait la touche d'interaction sur une tuile : l'invite, et le geste. */
interface Plan {
  label: string
  run: () => void
}

export class GardenMode {
  active = false
  hand: GardenHand = 'hoe'
  /** Ce qu'on a choisi pour la bêche, le plantoir, l'engrais. */
  private soil = 'plain'
  private seed: string | null = null
  private fert: string | null = null
  private readonly bar = $('garden-tools')
  private readonly hands = document.createElement('div')
  private readonly choices = document.createElement('div')
  /** Tuiles dont le site n'a pas encore confirmé le geste. */
  private pending = new Set<string>()
  /** Arracher une culture se confirme : la tuile visée, et jusqu'à quand (ms). */
  private uproot: { key: string; until: number } | null = null

  constructor(private readonly host: GardenModeHost) {
    this.bar.setAttribute('role', 'toolbar')
    this.bar.setAttribute('aria-label', tr('Outils de jardinage', 'Gardening tools'))
    this.choices.className = 'gt-choices'
    this.hands.className = 'gt-hands'
    this.bar.append(this.choices, this.hands)
    host.store.subscribe(() => this.refresh())
    host.view.onChange = () => this.refresh()
    this.refresh()
  }

  toggle() {
    if (this.active) this.stop()
    else this.start()
  }

  start(hand?: GardenHand) {
    if (this.active) return
    const { host } = this
    const refusal = host.refusal()
    if (refusal) return host.log(refusal)
    if (!host.view.tiles.length) {
      return host.show(tr(
        'Pas de terre à jardiner : posez d\'abord des tuiles de terre cultivable dans vos quartiers (Aménager, catégorie Jardinage).',
        'No soil to garden: first place plots of soil in your quarters (Decorate, Gardening category).',
      ))
    }
    this.active = true
    if (hand) this.hand = hand
    this.bar.hidden = false
    document.body.classList.add('gardening')
    host.onToggle(true)
    this.refresh()
  }

  stop() {
    if (!this.active) return
    this.active = false
    this.uproot = null
    this.bar.hidden = true
    document.body.classList.remove('gardening')
    this.host.onToggle(false)
    this.refresh()
  }

  /** Un chiffre du clavier : l'outil de ce rang. Rend vrai s'il a servi. */
  key(digit: number): boolean {
    const hand = HANDS[digit - 1]
    if (!this.active || !hand) return false
    this.take(hand.id)
    return true
  }

  private take(hand: GardenHand) {
    this.hand = hand
    this.uproot = null
    this.host.sound('pick')
    this.refresh()
  }

  /** Niveau de l'outil en main (0 pour l'engrais). */
  private tier(tool: GardenTool): number {
    return this.host.store.garden.tools[tool] ?? 0
  }

  // ------------------------------------------------------------ ce que fait la touche

  private plan(tile: GardenTile): Plan {
    const { host } = this
    if (!this.active) return { label: tr('Jardiner', 'Garden'), run: () => this.start(this.wanted(tile) ?? undefined) }
    if (this.pending.has(tile.key)) return { label: tr('Un instant…', 'One moment…'), run: () => {} }
    // Ce que la tuile attend passe d'abord : avec un autre outil en main (l'engrais mis à part,
    // qui se donne quand on veut), la touche prend celui qu'il faut.
    const wanted = this.wanted(tile)
    const own = wanted && wanted !== this.hand && this.hand !== 'feed' ? null : this.action(tile)
    if (own) return own
    if (wanted && wanted !== this.hand) {
      const name = wanted === 'feed' ? HANDS[3].label : TOOLS[wanted].names[this.tier(wanted)]
      return { label: tr(`Prendre : ${name.toLowerCase()}`, `Take: ${name.toLowerCase()}`), run: () => this.take(wanted) }
    }
    return { label: tr('Regarder la culture', 'Check the crop'), run: () => host.show(this.describe(tile)) }
  }

  /** L'outil qu'il faut pour cette tuile, ou null si elle pousse sans rien demander. */
  private wanted(tile: GardenTile): GardenHand | null {
    if (!tile.plot) return 'hoe'
    return tile.status?.need ? NEED_HAND[tile.status.need] : null
  }

  /** Ce que l'outil en main fait à cette tuile, ou null s'il n'y fait rien. */
  private action(tile: GardenTile): Plan | null {
    const { hand } = this
    const { plot, status } = tile
    const bag = this.host.store.garden.bag
    const crop = plot?.c
    const growing = !!crop && status?.need !== 'harvest'
    if (hand === 'hoe') {
      if (!plot) {
        return {
          label: tr(`Préparer la terre (${SOILS[this.soil].name.toLowerCase()})`, `Till the soil (${SOILS[this.soil].name.toLowerCase()})`),
          run: () => this.gesture(tile, 'hoe', tr('Bêchage…', 'Digging…'), 'scrub', { action: 'till', plot: tile.key, soil: this.soil }),
        }
      }
      if (status?.need === 'weed') return { label: tr('Désherber', 'Weed'), run: () => this.gesture(tile, 'hoe', tr('Désherbage…', 'Weeding…'), 'scrub', { action: 'weed', plot: tile.key }) }
      // Une culture qui pousse sans rien demander : la bêche peut l'arracher (deux fois la touche).
      if (growing && !status?.need) return { label: tr(`Arracher : ${cropName(crop).toLowerCase()}`, `Uproot: ${cropName(crop).toLowerCase()}`), run: () => this.confirmUproot(tile) }
      return null
    }
    if (hand === 'trowel') {
      if (!plot || crop) return null
      const seed = this.seed
      if (!seed) return { label: tr('Semer (pas de graines)', 'Sow (no seeds)'), run: () => this.host.show(tr('Votre sac de graines est vide. Capucine en vend à la serre, au pont supérieur.', 'Your seed bag is empty. Capucine sells some at the greenhouse, on the upper deck.')) }
      return { label: tr(`Semer : ${cropName(seed).toLowerCase()}`, `Sow: ${cropName(seed).toLowerCase()}`), run: () => this.gesture(tile, 'trowel', tr('Semis…', 'Sowing…'), 'scrub', { action: 'sow', plot: tile.key, crop: seed }) }
    }
    if (hand === 'can') {
      if (!growing) return null
      const label = status?.wet ? tr('Arroser (encore humide)', 'Water (still wet)') : tr('Arroser', 'Water')
      return { label, run: () => this.gesture(tile, 'can', tr('Arrosage…', 'Watering…'), 'water', { action: 'water', plot: tile.key }) }
    }
    if (hand === 'feed') {
      if (!growing) return null
      if (plot!.f) return { label: tr('Déjà nourrie', 'Already fed'), run: () => this.host.show(this.describe(tile)) }
      const fert = this.fert
      if (!fert || !bag.ferts[fert]) return { label: tr('Nourrir (pas d\'engrais)', 'Feed (no fertiliser)'), run: () => this.host.show(tr('Pas d\'engrais dans votre sac. Capucine en vend à la serre, au pont supérieur.', 'No fertiliser in your bag. Capucine sells some at the greenhouse, on the upper deck.')) }
      return { label: tr(`Nourrir : ${FERTS[fert].name.toLowerCase()}`, `Feed: ${FERTS[fert].name.toLowerCase()}`), run: () => this.gesture(tile, null, tr('Engrais…', 'Feeding…'), 'scrub', { action: 'feed', plot: tile.key, fert }) }
    }
    if (status?.need !== 'harvest' || !crop) return null
    return { label: tr(`Récolter : ${CROPS[crop]?.plural ?? crop}`, `Harvest: ${CROPS[crop]?.plural ?? crop}`), run: () => this.gesture(tile, 'shears', tr('Récolte…', 'Harvesting…'), 'chop', { action: 'harvest', plot: tile.key }) }
  }

  /** Où en est une tuile, en une phrase. */
  private describe(tile: GardenTile): string {
    const { plot, status } = tile
    if (!plot || !status) return tr('De la terre tassée. Un coup de bêche la préparerait.', 'Packed soil. The spade would get it ready.')
    if (!plot.c) return tr(`Terre prête (${SOILS[plot.s]?.name.toLowerCase() ?? plot.s}). Il n'y manque qu'une graine.`, `Soil ready (${SOILS[plot.s]?.name.toLowerCase() ?? plot.s}). All it needs is a seed.`)
    const name = cropName(plot.c)
    if (status.need === 'harvest') return tr(`${name} : mûr, à récolter au sécateur.`, `${name}: ripe, ready for the secateurs.`)
    const done = Math.round(status.progress * 100)
    if (status.need === 'weed') return tr(`${name} : ${done} %. Les mauvaises herbes l'étouffent, elle ne pousse plus.`, `${name}: ${done}%. Weeds are choking it, it has stopped growing.`)
    if (status.need === 'water') return tr(`${name} : ${done} %. La terre est sèche, elle ne pousse plus.`, `${name}: ${done}%. The soil is dry, it has stopped growing.`)
    const now = this.host.store.now()
    const fed = plot.f ? tr(`, nourrie (${FERTS[plot.f]?.name.toLowerCase() ?? plot.f})`, `, fed (${FERTS[plot.f]?.name.toLowerCase() ?? plot.f})`) : ''
    return tr(`${name} : ${done} %${fed}. Humide encore ${formatDuration(plot.w - now)}.`, `${name}: ${done}%${fed}. Wet for another ${formatDuration(plot.w - now)}.`)
  }

  private confirmUproot(tile: GardenTile) {
    const now = Date.now()
    if (this.uproot?.key === tile.key && now < this.uproot.until) {
      this.uproot = null
      return this.gesture(tile, 'hoe', tr('Arrachage…', 'Uprooting…'), 'scrub', { action: 'clear', plot: tile.key })
    }
    this.uproot = { key: tile.key, until: now + 5000 }
    this.host.show(tr(
      `Arracher ${cropName(tile.plot!.c!).toLowerCase()} ? La culture est perdue, graine et terreau compris. Refaites le geste pour confirmer.`,
      `Uproot ${cropName(tile.plot!.c!).toLowerCase()}? The crop is lost, seed and compost included. Do it again to confirm.`,
    ))
  }

  /** Le geste (quelques secondes, moins avec un meilleur outil), puis le site l'enregistre. */
  private gesture(tile: GardenTile, tool: GardenTool | null, label: string, sound: WorkSound, action: GardenAction) {
    const duration = tool ? RULES.tools[tool].time[this.tier(tool)] ?? RULES.tools[tool].time[0] : FEED_TIME
    this.host.work({
      x: tile.x, z: tile.z, duration, label, sound,
      alive: () => this.active && !this.pending.has(tile.key),
      finish: () => void this.send(tile, action),
    })
  }

  private async send(tile: GardenTile, action: GardenAction) {
    const { host } = this
    this.pending.add(tile.key)
    this.refresh()
    const result = await host.store.act(action)
    this.pending.delete(tile.key)
    this.refresh()
    if (!result.ok) {
      host.sound('deny')
      return host.show(this.refused(result.reason))
    }
    if (!result.harvest) return
    host.sound('win')
    const { crop, grade, count } = result.harvest
    const { garden } = host.store
    const room = stockRoom(RULES, this.crate())
    host.log(tr(
      `Récolte : ${count} × ${cropName(crop).toLowerCase()} ${gradeStars(grade)}. Réserve : ${stockTotal(garden.stock)}/${room}. Le chef Marcel, au mess, vous l'achète.`,
      `Harvest: ${count} × ${cropName(crop).toLowerCase()} ${gradeStars(grade)}. Store: ${stockTotal(garden.stock)}/${room}. Chef Marcel, in the mess, will buy it.`,
    ))
  }

  /** Le joueur a débloqué des caisses de récolte : sa réserve est plus grande (cf. main.ts). */
  crate: () => boolean = () => false

  private refused(reason: GardenRefusal): string {
    const room = stockRoom(RULES, this.crate())
    return {
      tile: tr('Débloquez d\'abord la tuile de terre cultivable (Aménager, catégorie Jardinage).', 'Unlock the plot of soil first (Decorate, Gardening category).'),
      shed: tr('Il faut un cabanon de jardinage.', 'You need a garden shed.'),
      max: tr(`Vous travaillez déjà ${RULES.maxPlots} tuiles : c'est le plus qu'un jardinier seul puisse tenir.`, `You are already working ${RULES.maxPlots} plots: that is as many as one gardener can keep.`),
      busy: tr('Cette tuile est déjà occupée.', 'This plot is already in use.'),
      empty: tr('Il vous manque ce qu\'il faut dans le sac. Capucine en vend à la serre, au pont supérieur.', 'Your bag is missing what it takes. Capucine sells some at the greenhouse, on the upper deck.'),
      tier: tr('Cette graine demande un meilleur plantoir. Capucine en vend à la serre.', 'This seed needs a better dibber. Capucine sells them at the greenhouse.'),
      unripe: tr('Ce n\'est pas encore mûr.', 'It is not ripe yet.'),
      full: tr(`Réserve pleine (${room}) : vendez votre récolte au chef Marcel, au mess${this.crate() ? '' : ', ou débloquez des caisses de récolte'}.`, `Store full (${room}): sell your harvest to Chef Marcel, in the mess${this.crate() ? '' : ', or unlock harvest crates'}.`),
      none: tr('Rien à faire ici pour l\'instant.', 'Nothing to do here for now.'),
      funds: tr('Crédits insuffisants.', 'Not enough credits.'),
      guest: tr('Connectez-vous au site pour jardiner.', 'Log in to the site to garden.'),
      offline: tr('Le site ne répond pas : le geste n\'est pas enregistré. Réessayez.', 'The site isn\'t responding: the gesture wasn\'t recorded. Try again.'),
    }[reason]
  }

  // ------------------------------------------------------------ affichage

  /** Invites des tuiles, et barre des outils : après un geste, un changement d'outil, une pousse. */
  refresh() {
    const { bag } = this.host.store.garden
    // Ce qu'on a choisi existe encore dans le sac ; sinon, le premier qui s'y trouve.
    if (this.soil !== 'plain' && !bag.soils[this.soil]) this.soil = 'plain'
    if (!this.seed || !bag.seeds[this.seed]) this.seed = Object.keys(bag.seeds)[0] ?? null
    if (!this.fert || !bag.ferts[this.fert]) this.fert = Object.keys(bag.ferts)[0] ?? null
    for (const tile of this.host.view.tiles) {
      const plan = this.plan(tile)
      tile.item.label = plan.label
      tile.item.onInteract = plan.run
    }
    if (this.active) this.render()
  }

  private render() {
    const { garden } = this.host.store
    this.hands.replaceChildren()
    HANDS.forEach((h, i) => {
      const b = document.createElement('button')
      b.type = 'button'
      const name = h.id === 'feed' ? h.label : `${TOOLS[h.id].names[this.tier(h.id)]} : ${h.label.toLowerCase()}`
      b.title = `${name} (${i + 1})`
      b.setAttribute('aria-label', name)
      b.setAttribute('aria-pressed', String(this.hand === h.id))
      b.classList.toggle('active', this.hand === h.id)
      b.append(icon(h.icon))
      const n = document.createElement('span')
      n.textContent = String(i + 1)
      b.append(n)
      // Les niveaux gagnés par l'outil, en pastilles.
      if (h.id !== 'feed' && this.tier(h.id) > 0) {
        const pips = document.createElement('i')
        pips.className = 'gt-tier'
        pips.textContent = '•'.repeat(this.tier(h.id))
        b.append(pips)
      }
      b.onclick = () => this.take(h.id)
      this.hands.append(b)
    })
    const quit = document.createElement('button')
    quit.type = 'button'
    quit.className = 'gt-quit'
    quit.title = tr('Ranger les outils (G)', 'Put the tools away (G)')
    quit.setAttribute('aria-label', quit.title)
    quit.append(icon('x'))
    quit.onclick = () => this.stop()
    this.hands.append(quit)

    // Ce que l'outil en main utilise : le terreau de la bêche, la graine du plantoir, l'engrais.
    this.choices.replaceChildren()
    const chip = (label: string, count: string, on: boolean, pick: () => void) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.classList.toggle('active', on)
      b.setAttribute('aria-pressed', String(on))
      const n = document.createElement('b')
      n.textContent = count
      b.append(label, n)
      b.onclick = () => {
        pick()
        this.refresh()
      }
      this.choices.append(b)
    }
    const empty = (text: string) => {
      const p = document.createElement('span')
      p.className = 'gt-empty'
      p.textContent = text
      this.choices.append(p)
    }
    if (this.hand === 'hoe') {
      for (const id of Object.keys(RULES.soils)) {
        const free = RULES.soils[id].price === 0
        if (free || garden.bag.soils[id]) chip(SOILS[id]?.name ?? id, free ? '∞' : String(garden.bag.soils[id]), this.soil === id, () => (this.soil = id))
      }
    } else if (this.hand === 'trowel') {
      const seeds = Object.keys(garden.bag.seeds)
      for (const id of seeds) chip(cropName(id), String(garden.bag.seeds[id]), this.seed === id, () => (this.seed = id))
      if (!seeds.length) empty(tr('Pas de graines : Capucine en vend à la serre.', 'No seeds: Capucine sells some at the greenhouse.'))
    } else if (this.hand === 'feed') {
      const ferts = Object.keys(garden.bag.ferts)
      for (const id of ferts) chip(FERTS[id]?.name ?? id, String(garden.bag.ferts[id]), this.fert === id, () => (this.fert = id))
      if (!ferts.length) empty(tr('Pas d\'engrais : Capucine en vend à la serre.', 'No fertiliser: Capucine sells some at the greenhouse.'))
    } else if (this.hand === 'can') {
      empty(tr(`Un arrosage tient ${formatDuration(RULES.tools.can.wet[this.tier('can')])}.`, `One watering lasts ${formatDuration(RULES.tools.can.wet[this.tier('can')])}.`))
    } else {
      empty(tr(`Réserve : ${stockTotal(garden.stock)}/${stockRoom(RULES, this.crate())}`, `Store: ${stockTotal(garden.stock)}/${stockRoom(RULES, this.crate())}`))
    }
  }
}
