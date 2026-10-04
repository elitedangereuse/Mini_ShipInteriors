import { formatCredits } from '../economy/data'
import type { Wallet } from '../economy/wallet'
import { tr } from '../i18n'
import { icon, type IconName } from '../icons'
import { GARDEN_TOOLS, stockRoom, stockTotal, TOOL_TIERS, unitPrice } from '../../shared/gardening.js'
import { cropName, CROPS, FERTS, formatDuration, GRADES, gradeStars, RULES, SOILS, TOOLS } from './data'
import type { GardenAction, GardenOutcome, GardenRefusal, GardenStore } from './store'

/*
 * Les panneaux du jardinier, un seul à la fois :
 * - l'étal de Capucine, à la serre : graines, terreaux, engrais et outils (il faut un cabanon) ;
 * - le chef Marcel, au mess, qui achète la récolte (jusqu'à son plafond du jour) ;
 * - le cabanon et les caisses de récolte, dans ses quartiers : le sac, les outils, la réserve.
 * Tout passe par le site (cf. store.ts) : le panneau montre ce qu'il rend.
 */

export type GardenPanelKind = 'shop' | 'sell' | 'shed' | 'stock'

export interface GardenPanelHost {
  store: GardenStore
  wallet: Wallet
  /** Objets débloqués : le cabanon (pour acheter), les caisses de récolte (la réserve agrandie). */
  shed: () => boolean
  crate: () => boolean
  /** Une phrase du membre d'équipage, à l'ouverture et quand on lui parle. */
  line: (kind: 'shop' | 'sell') => string
  sound: (kind: 'pick' | 'deny' | 'win') => void
  onOpen: () => void
  onClose: () => void
}

type ShopTab = 'seeds' | 'supplies' | 'tools'

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (className) e.className = className
  if (text) e.textContent = text
  return e
}

export class GardenPanel {
  private root = el('section', 'garden-overlay')
  private small = el('small')
  private title = el('h2')
  private speech = el('div', 'gp-speech')
  private line = el('p')
  private tabs = el('div', 'gp-tabs')
  private body = el('div', 'gp-body')
  private status = el('p', 'gp-status')
  private kind: GardenPanelKind = 'shop'
  private tab: ShopTab = 'seeds'
  private busy = false
  private note = ''
  private previousFocus: HTMLElement | null = null

  constructor(private readonly host: GardenPanelHost) {
    this.root.hidden = true
    this.root.setAttribute('role', 'dialog')
    const panel = el('div', 'gp-panel')
    const header = el('header', 'gp-heading')
    const intro = el('div')
    intro.append(this.small, this.title)
    const close = el('button', 'gp-close', '×')
    close.type = 'button'
    close.setAttribute('aria-label', tr('Fermer', 'Close'))
    close.onclick = () => this.close()
    header.append(intro, close)
    const talk = el('button', '', tr('Parler ↻', 'Talk ↻'))
    talk.type = 'button'
    talk.onclick = () => (this.line.textContent = this.host.line(this.kind === 'sell' ? 'sell' : 'shop'))
    this.speech.append(this.line, talk)
    this.status.setAttribute('aria-live', 'polite')
    panel.append(header, this.speech, this.tabs, this.body, this.status)
    this.root.append(panel)
    document.body.append(this.root)
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        this.close()
      }
      e.stopPropagation()
    })
    this.root.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true })
    host.store.subscribe(() => this.isOpen && this.render())
    host.wallet.subscribe(() => this.isOpen && this.render())
  }

  get isOpen(): boolean {
    return !this.root.hidden
  }

  contains(target: EventTarget | null): boolean {
    return target instanceof Node && this.root.contains(target)
  }

  open(kind: GardenPanelKind) {
    this.kind = kind
    this.note = ''
    const talks = kind === 'shop' || kind === 'sell'
    this.speech.hidden = !talks
    if (talks) this.line.textContent = this.host.line(kind)
    const [small, title] = {
      shop: [tr('SERRE · PONT SUPÉRIEUR', 'GREENHOUSE · UPPER DECK'), tr('L\'étal de Capucine', 'Capucine\'s stall')],
      sell: [tr('MESS · LE CHEF ACHÈTE', 'MESS · THE CHEF IS BUYING'), 'Marcel'],
      shed: [tr('VOS QUARTIERS · JARDINAGE', 'YOUR QUARTERS · GARDENING'), tr('Cabanon', 'Garden shed')],
      stock: [tr('VOS QUARTIERS · JARDINAGE', 'YOUR QUARTERS · GARDENING'), tr('Réserve de récolte', 'Harvest store')],
    }[kind]
    this.small.textContent = small
    this.title.textContent = title
    this.root.setAttribute('aria-label', title)
    if (!this.isOpen) {
      this.previousFocus = document.activeElement as HTMLElement
      this.root.hidden = false
      this.host.onOpen()
    }
    this.render()
    this.root.querySelector<HTMLButtonElement>('.gp-close')?.focus()
    // Le jardin a pu changer ailleurs (un autre onglet) : on le relit.
    void this.host.store.load()
  }

  close() {
    if (!this.isOpen) return
    this.root.hidden = true
    this.host.onClose()
    this.previousFocus?.focus()
  }

  // ------------------------------------------------------------ contenu

  private render() {
    const { store } = this.host
    const focused = (document.activeElement as HTMLElement | null)?.dataset?.key
    this.tabs.replaceChildren()
    this.body.replaceChildren()
    if (!store.ready) {
      this.body.append(el('p', 'gp-empty', store.state === 'guest'
        ? tr('Le jardinage est réservé aux CMDR connectés au site.', 'Gardening is for CMDRs logged in to the site.')
        : store.state === 'loading' ? tr('Chargement du jardin…', 'Loading the garden…')
          : tr('Le jardin est indisponible : le site ne répond pas.', 'The garden is unavailable: the site isn\'t responding.')))
      this.status.textContent = ''
      return
    }
    if (this.kind === 'shop') this.renderShop()
    else if (this.kind === 'sell') this.renderSale()
    else this.renderShed()
    if (focused) this.root.querySelector<HTMLElement>(`[data-key="${focused}"]`)?.focus()
  }

  /** Une ligne : une pastille, un nom, un détail, et des boutons. */
  private row(glyph: IconName, color: string, name: string, detail: string, ...actions: HTMLElement[]): HTMLElement {
    const row = el('article', 'gp-row')
    const dot = el('span', 'gp-dot')
    dot.style.setProperty('--gp-color', color)
    dot.append(icon(glyph))
    const text = el('div')
    text.append(el('strong', '', name), el('small', '', detail))
    const box = el('div', 'gp-actions')
    box.append(...actions)
    row.append(dot, text, box)
    return row
  }

  private button(key: string, label: string, enabled: boolean, onClick: () => void, title = ''): HTMLButtonElement {
    const b = el('button', '', label)
    b.type = 'button'
    b.dataset.key = key
    b.disabled = this.busy || !enabled
    if (title) b.title = title
    b.onclick = onClick
    return b
  }

  private section(title: string, aside = '') {
    const h = el('div', 'gp-section')
    h.append(el('span', '', title), el('small', '', aside))
    this.body.append(h)
  }

  private renderShop() {
    const { store, wallet } = this.host
    const { garden } = store
    if (!this.host.shed()) {
      this.body.append(el('p', 'gp-empty', tr(
        'Capucine ne vend qu\'aux jardiniers installés : il vous faut un cabanon de jardinage dans vos quartiers, et des tuiles de terre cultivable (Aménager, catégorie Jardinage).',
        'Capucine only sells to settled gardeners: you need a garden shed in your quarters, and plots of soil (Decorate, Gardening category).',
      )))
      this.status.textContent = ''
      return
    }
    const names: Record<ShopTab, string> = { seeds: tr('Graines', 'Seeds'), supplies: tr('Terreau et engrais', 'Compost and fertiliser'), tools: tr('Outils', 'Tools') }
    for (const id of Object.keys(names) as ShopTab[]) {
      const b = el('button', '', names[id])
      b.type = 'button'
      b.dataset.key = `tab-${id}`
      b.setAttribute('aria-selected', String(this.tab === id))
      b.onclick = () => {
        this.tab = id
        this.render()
      }
      this.tabs.append(b)
    }
    const can = (cost: number) => wallet.balance >= cost
    const buy = (kind: 'seed' | 'soil' | 'fert', id: string, price: number, have: number) => [1, 5].map((count) =>
      this.button(`${kind}-${id}-${count}`, `×${count} · ${formatCredits(price * count)}`, can(price * count) && have + count <= RULES.bagMax, () => void this.act({ action: 'buy', kind, id, count })))
    if (this.tab === 'seeds') {
      for (const [id, crop] of Object.entries(RULES.crops)) {
        const info = CROPS[id]
        const have = garden.bag.seeds[id] ?? 0
        const locked = garden.tools.trowel < crop.tier
        const detail = locked
          ? tr(`Demande : ${TOOLS.trowel.names[crop.tier].toLowerCase()}`, `Needs: ${TOOLS.trowel.names[crop.tier].toLowerCase()}`)
          : tr(`${formatDuration(crop.grow)} · ${crop.yield} par récolte · Marcel : ${formatCredits(crop.price)} pièce${have ? ` · en sac : ${have}` : ''}`, `${formatDuration(crop.grow)} · ${crop.yield} per harvest · Marcel: ${formatCredits(crop.price)} each${have ? ` · in bag: ${have}` : ''}`)
        const row = this.row('grains', info?.color ?? '#86c46a', cropName(id), detail, ...(locked ? [] : buy('seed', id, crop.seed, have)))
        row.classList.toggle('locked', locked)
        if (info) row.title = info.about
        this.body.append(row)
      }
    } else if (this.tab === 'supplies') {
      for (const [id, soil] of Object.entries(RULES.soils)) {
        if (!soil.price) continue
        const have = garden.bag.soils[id] ?? 0
        this.body.append(this.row('shovel', '#b08a5a', SOILS[id]?.name ?? id, `${SOILS[id]?.about ?? ''}${have ? tr(` En sac : ${have}.`, ` In bag: ${have}.`) : ''}`, ...buy('soil', id, soil.price, have)))
      }
      for (const [id, fert] of Object.entries(RULES.fertilizers)) {
        const have = garden.bag.ferts[id] ?? 0
        this.body.append(this.row('sparkle', '#c8e86a', FERTS[id]?.name ?? id, `${FERTS[id]?.about ?? ''}${have ? tr(` En sac : ${have}.`, ` In bag: ${have}.`) : ''}`, ...buy('fert', id, fert.price, have)))
      }
    } else {
      for (const id of GARDEN_TOOLS) {
        const tier = garden.tools[id]
        const tool = TOOLS[id]
        if (tier >= TOOL_TIERS - 1) {
          this.body.append(this.row(tool.icon, '#ffd23c', tool.names[tier], tr('Le meilleur qui soit. Prends-en soin.', 'The best there is. Look after it.')))
          continue
        }
        const price = RULES.tools[id].prices[tier]
        this.body.append(this.row(tool.icon, '#8fe9ff', tool.names[tier + 1], tr(`${tool.better} Vous avez : ${tool.names[tier].toLowerCase()}.`, `${tool.better} You have: ${tool.names[tier].toLowerCase()}.`),
          this.button(`tool-${id}`, formatCredits(price), can(price), () => void this.act({ action: 'buy', kind: 'tool', id }))))
      }
    }
    this.status.textContent = this.note || tr(`Solde : ${formatCredits(wallet.balance)}`, `Balance: ${formatCredits(wallet.balance)}`)
  }

  /** La réserve, récolte par récolte, la plus chère d'abord. */
  private stockRows(): { key: string; crop: string; grade: number; count: number; price: number }[] {
    return Object.entries(this.host.store.garden.stock)
      .map(([key, count]) => {
        const [crop, grade] = key.split(':')
        return { key, crop, grade: Number(grade), count, price: RULES.crops[crop] ? unitPrice(RULES, crop, Number(grade)) : 0 }
      })
      .sort((a, b) => b.price - a.price)
  }

  private renderSale() {
    const { store } = this.host
    const rows = this.stockRows()
    const left = Math.max(0, RULES.saleDaily - store.sold)
    if (!rows.length) {
      this.body.append(el('p', 'gp-empty', tr(
        'Rien à vendre : votre réserve est vide. Marcel achète les légumes, les fruits et les fleurs de votre jardin.',
        'Nothing to sell: your store is empty. Marcel buys vegetables, fruit and flowers from your garden.',
      )))
    }
    for (const r of rows) {
      const all = Math.min(r.count, Math.floor(left / r.price))
      this.body.append(this.row('basket', CROPS[r.crop]?.color ?? '#86c46a', `${cropName(r.crop)} ${gradeStars(r.grade)} × ${r.count}`, tr(`Qualité ${GRADES[r.grade]} · ${formatCredits(r.price)} pièce`, `${GRADES[r.grade]} quality · ${formatCredits(r.price)} each`),
        this.button(`sell-${r.key}-1`, '×1', left >= r.price, () => void this.act({ action: 'sell', item: r.key, count: 1 })),
        this.button(`sell-${r.key}-all`, tr(`Tout · ${formatCredits(all * r.price)}`, `All · ${formatCredits(all * r.price)}`), all > 0, () => void this.act({ action: 'sell', item: r.key, count: r.count }))))
    }
    if (rows.length > 1) {
      const all = this.button('sell-all', tr('Tout vendre', 'Sell everything'), left > 0, () => void this.act({ action: 'sell', all: true }))
      all.className = 'gp-wide'
      this.body.append(all)
    }
    this.status.textContent = this.note || (left > 0
      ? tr(`Marcel peut encore payer ${formatCredits(left)} aujourd'hui.`, `Marcel can still pay ${formatCredits(left)} today.`)
      : tr('Marcel a dépensé le budget légumes du jour. Il rachète demain.', 'Marcel has spent today\'s vegetable budget. He buys again tomorrow.'))
  }

  private renderShed() {
    const { garden } = this.host.store
    const room = stockRoom(RULES, this.host.crate())
    const rows = this.stockRows()
    this.section(tr('Récolte', 'Harvest'), `${stockTotal(garden.stock)}/${room}`)
    for (const r of rows) this.body.append(this.row('basket', CROPS[r.crop]?.color ?? '#86c46a', `${cropName(r.crop)} ${gradeStars(r.grade)} × ${r.count}`, tr(`Qualité ${GRADES[r.grade]} · Marcel : ${formatCredits(r.price)} pièce`, `${GRADES[r.grade]} quality · Marcel: ${formatCredits(r.price)} each`)))
    if (!rows.length) this.body.append(el('p', 'gp-empty', tr('Rien en réserve pour l\'instant.', 'Nothing in store for now.')))
    if (this.kind === 'shed') {
      this.section(tr('Outils', 'Tools'))
      for (const id of GARDEN_TOOLS) this.body.append(this.row(TOOLS[id].icon, '#8fe9ff', TOOLS[id].names[garden.tools[id]], TOOLS[id].does))
      this.section(tr('Sac', 'Bag'))
      const bag: [IconName, string, string, number][] = [
        ...Object.entries(garden.bag.seeds).map(([id, n]): [IconName, string, string, number] => ['grains', CROPS[id]?.color ?? '#86c46a', tr(`Graines : ${cropName(id).toLowerCase()}`, `Seeds: ${cropName(id).toLowerCase()}`), n]),
        ...Object.entries(garden.bag.soils).map(([id, n]): [IconName, string, string, number] => ['shovel', '#b08a5a', SOILS[id]?.name ?? id, n]),
        ...Object.entries(garden.bag.ferts).map(([id, n]): [IconName, string, string, number] => ['sparkle', '#c8e86a', FERTS[id]?.name ?? id, n]),
      ]
      for (const [glyph, color, name, n] of bag) this.body.append(this.row(glyph, color, name, `× ${n}`))
      if (!bag.length) this.body.append(el('p', 'gp-empty', tr('Sac vide. Capucine vend graines, terreau et engrais à la serre, au pont supérieur.', 'Empty bag. Capucine sells seeds, compost and fertiliser at the greenhouse, on the upper deck.')))
    }
    this.status.textContent = this.host.crate()
      ? tr('Le chef Marcel, au mess, achète votre récolte.', 'Chef Marcel, in the mess, buys your harvest.')
      : tr(`Le chef Marcel, au mess, achète votre récolte. Des caisses de récolte portent la réserve à ${RULES.stock.crate}.`, `Chef Marcel, in the mess, buys your harvest. Harvest crates raise the store to ${RULES.stock.crate}.`)
  }

  // ------------------------------------------------------------ achats et ventes

  private async act(action: GardenAction) {
    if (this.busy) return
    this.busy = true
    this.render()
    const result = await this.host.store.act(action)
    this.busy = false
    this.note = this.said(action, result)
    this.host.sound(result.ok ? (action.action === 'sell' ? 'win' : 'pick') : 'deny')
    this.render()
  }

  private said(action: GardenAction, result: GardenOutcome): string {
    if (result.ok) {
      const balance = formatCredits(this.host.wallet.balance)
      return action.action === 'sell'
        ? tr(`Vendu : ${result.units} pour ${formatCredits(result.earned)}. Solde : ${balance}`, `Sold: ${result.units} for ${formatCredits(result.earned)}. Balance: ${balance}`)
        : tr(`C'est dans le cabanon. Solde : ${balance}`, `It's in your shed. Balance: ${balance}`)
    }
    const refusals: Partial<Record<GardenRefusal, string>> = {
      funds: tr('Crédits insuffisants.', 'Not enough credits.'),
      shed: tr('Il vous faut un cabanon de jardinage dans vos quartiers.', 'You need a garden shed in your quarters.'),
      tier: tr('Cette graine demande un meilleur plantoir.', 'This seed needs a better dibber.'),
      max: action.action === 'sell'
        ? tr('Marcel a dépensé le budget légumes du jour. Il rachète demain.', 'Marcel has spent today\'s vegetable budget. He buys again tomorrow.')
        : tr(`Le sac est plein (${RULES.bagMax} au plus de chaque sorte).`, `The bag is full (${RULES.bagMax} of each kind at most).`),
      empty: tr('Il n\'y en a plus en réserve.', 'There is none left in store.'),
      guest: tr('Connectez-vous au site pour jardiner.', 'Log in to the site to garden.'),
    }
    return refusals[result.reason] ?? tr('Le site ne répond pas. Réessayez.', 'The site isn\'t responding. Try again.')
  }
}
