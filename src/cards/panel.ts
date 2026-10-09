import { formatCredits } from '../economy/data'
import type { Wallet } from '../economy/wallet'
import type { GameEmbed } from '../game-embed'
import { EN, tr } from '../i18n'
import { backUrl, buyBooster, cardSound, cardUrl, cardsInfo, coverUrl, openBooster, type BoosterInfo, type CardRef, type CardsInfo, type Rarity } from './site'

/*
 * Le Comptoir des Cartes Dangereuses (pont supérieur, cf. src/furniture/cards.ts) : chez Ludo, on
 * achète des boosters contre des crédits du jeu (cher, et peu par semaine : le site tient le
 * compte), on ouvre ceux qu'on a, collection par collection, et on file voir son classeur.
 *
 * Deux écrans, dans la fenêtre des jeux du site (cf. GameEmbed.openPanel) :
 * - le présentoir : le sachet choisi sous le projecteur, son bouton « Ouvrir » juste dessous, les
 *   autres collections sur l'étagère, et à côté l'ardoise de Ludo (la réserve, les prix) ;
 * - la table de tirage : les cartes distribuées face cachée sur le feutre, qu'on retourne une à
 *   une, avec les bruits de cartes de Galactic Clash.
 */

const RARITY_NAMES: Record<Rarity, string> = { c: tr('Commune', 'Common'), r: tr('Rare', 'Rare'), u: tr('Ultra-rare', 'Ultra rare'), m: tr('Mythique', 'Mythic') }
const RANK = 'crum'
const LINES = [
  tr('« Un booster, c\'est quatre cartes et une promesse. Je ne garantis que les cartes. »', '“A booster is four cards and a promise. I only guarantee the cards.”'),
  tr('« Deux par semaine, pas un de plus : la rareté, ça s\'entretient. »', '“Two a week, not one more: rarity takes upkeep.”'),
  tr('« La mythique ? Une chance sur cent, par carte. J\'en ai vu pleurer à cette table. »', '“The mythic? One in a hundred, per card. I\'ve seen people cry at this table.”'),
  tr('« Les aventures du site paient mieux que moi : un booster chacune. Moi, je dépanne. »', '“The site\'s adventures pay better than I do: a booster each. I just help out.”'),
  tr('« Prenez votre temps pour les retourner. C\'est le meilleur moment. »', '“Take your time turning them over. It\'s the best part.”'),
]
/** Temps laissé au sachet pour se déchirer, même si le site répond plus vite (ms). */
const TEAR_TIME = 850
/** Écart entre deux cartes distribuées (ms). */
const DEAL_GAP = 150

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (className) e.className = className
  if (text !== undefined) e.textContent = text
  return e
}
const button = (className: string, text: string, onClick: () => void) => {
  const b = el('button', className, text)
  b.type = 'button'
  b.onclick = onClick
  return b
}
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

export class CardsPanel {
  private body = el('div', 'ludo')
  private view = el('div', 'ludo-view')
  private purse = el('strong')
  private info: CardsInfo | null = null
  private busy = false
  private selected = ''
  private message = ''
  private line = Math.floor(Math.random() * LINES.length)
  private unsubscribe: (() => void) | null = null
  /** Le tirage affiché, et le nombre de cartes déjà retournées. */
  private pull: CardRef[] | null = null
  private revealed = 0
  private timers: number[] = []
  /** On vient de tirer ces cartes (l'autel de la pièce les montre). */
  onPull?: (cards: CardRef[]) => void
  /** Un achat réussi, ou une demande refusée : les sons du jeu. */
  onSound?: (kind: 'buy' | 'deny') => void

  /** @param volume volume des bruits de cartes (celui du jeu), de 0 à 1 */
  constructor(private embed: GameEmbed, private wallet: Wallet, private volume: () => number) {
    const head = el('header', 'ludo-head')
    const title = el('div', 'ludo-title')
    title.append(el('h2', '', tr('Chez Ludo', 'Ludo\'s')), el('p', 'ludo-quote'))
    const side = el('div', 'ludo-purse')
    const close = button('ludo-close', '×', () => this.embed.close())
    close.setAttribute('aria-label', tr('Fermer', 'Close'))
    side.append(el('span', '', tr('Votre solde', 'Your balance')), this.purse, close)
    head.append(title, side)
    this.body.append(head, this.view)
    this.body.addEventListener('keydown', (e) => this.onKey(e))
  }

  open() {
    this.clearPull()
    this.message = ''
    this.line = (this.line + 1) % LINES.length
    this.body.querySelector('.ludo-quote')!.textContent = LINES[this.line]
    this.unsubscribe ??= this.wallet.subscribe(() => this.updatePurse())
    this.embed.openPanel({
      kicker: tr('PONT SUPÉRIEUR · COMPTOIR DES CARTES DANGEREUSES', 'UPPER DECK · CARTES DANGEREUSES COUNTER'),
      title: tr('Chez Ludo, le Comptoir des Cartes Dangereuses', 'Ludo\'s, the Cartes Dangereuses counter'),
      hint: LINES[this.line],
      body: this.body,
      bare: true,
      onClose: () => { this.unsubscribe?.(); this.unsubscribe = null; this.clearPull() },
    })
    this.updatePurse()
    this.renderShop()
    void this.refresh()
  }

  private sound(name: Parameters<typeof cardSound>[0], gain = 1) {
    cardSound(name, this.volume() * gain)
  }

  private clearPull() {
    for (const t of this.timers) clearTimeout(t)
    this.timers = []
    this.pull = null
    this.revealed = 0
  }

  private updatePurse() {
    this.purse.textContent = this.wallet.ready ? formatCredits(this.wallet.balance) : '—'
    if (!this.pull) this.renderSlate()
  }

  private async refresh() {
    const info = await cardsInfo(true)
    if (info) this.info = info
    else if (!this.info) this.message = tr('Le terminal de Ludo ne répond pas. Fermez et réessayez dans un instant.', 'Ludo\'s terminal is not answering. Close and try again in a moment.')
    if (this.pull) return
    if (this.info && !this.current()) this.selected = (this.info.registry.find((b) => b.featured) ?? this.info.registry[0])?.slug ?? ''
    // Mêmes collections qu'à l'écran : on met à jour sans reconstruire l'étagère (ni recharger ses images).
    const shelf = [...this.view.querySelectorAll<HTMLElement>('.ludo-pack')]
    if (!this.info || shelf.length !== this.info.registry.length || shelf.some((pack, i) => pack.dataset.slug !== this.info!.registry[i].slug)) return this.renderShop()
    shelf.forEach((pack, i) => this.gauge(pack.querySelector<HTMLElement>('.ludo-gauge')!, this.info!.registry[i]))
    this.select(this.selected, false)
    this.renderSlate()
  }

  /** La jauge d'un sachet de l'étagère : la part de la collection déjà dans le classeur. */
  private gauge(gauge: HTMLElement, booster: BoosterInfo) {
    gauge.classList.toggle('full', booster.total > 0 && booster.owned >= booster.total)
    gauge.style.setProperty('--done', String(booster.total ? Math.min(1, booster.owned / booster.total) : 0))
  }

  private current(): BoosterInfo | undefined {
    return this.info?.registry.find((b) => b.slug === this.selected)
  }

  private canOpen(): boolean {
    const info = this.info
    return !!info && !this.busy && !!this.current() && !info.guest && (info.unlimited || info.boosters > 0)
  }

  // ---------------------------------------------------------------- le présentoir

  private renderShop() {
    const info = this.info
    this.view.className = 'ludo-view ludo-shop'
    if (!info) {
      this.view.replaceChildren(el('p', 'ludo-empty', this.message || tr('Ludo cherche votre classeur…', 'Ludo is looking for your binder…')))
      return
    }
    const stage = el('section', 'ludo-stage')
    // Le sachet choisi, sous le projecteur : on l'ouvre en cliquant dessus, ou avec son bouton.
    const spot = el('div', 'ludo-spot')
    const hero = button('ludo-hero', '', () => void this.openPack())
    const img = el('img')
    img.alt = ''
    hero.append(img, el('span', 'ludo-sheen'))
    hero.onpointermove = (e) => {
      const r = hero.getBoundingClientRect()
      hero.style.setProperty('--px', ((e.clientX - r.left) / r.width).toFixed(3))
      hero.style.setProperty('--py', ((e.clientY - r.top) / r.height).toFixed(3))
    }
    hero.onpointerleave = () => { hero.style.removeProperty('--px'); hero.style.removeProperty('--py') }
    spot.append(hero)
    const name = el('h3', 'ludo-name')
    const progress = el('p', 'ludo-progress')
    const open = button('ludo-open', '', () => void this.openPack())
    open.dataset.autofocus = ''
    const left = el('p', 'ludo-left')
    // L'étagère : un sachet par collection.
    const shelf = el('div', 'ludo-shelf')
    shelf.setAttribute('role', 'listbox')
    shelf.setAttribute('aria-label', tr('Collections', 'Collections'))
    for (const booster of info.registry) {
      const pack = button('ludo-pack', '', () => this.select(booster.slug, true))
      pack.dataset.slug = booster.slug
      pack.setAttribute('role', 'option')
      pack.title = booster.title
      const cover = el('img')
      cover.src = coverUrl(booster.slug)
      cover.alt = booster.title
      cover.loading = 'lazy'
      cover.onerror = () => { cover.style.visibility = 'hidden' }
      const gauge = el('span', 'ludo-gauge')
      this.gauge(gauge, booster)
      pack.append(cover, gauge)
      shelf.append(pack)
    }
    stage.append(spot, name, progress, open, left, shelf)
    this.view.replaceChildren(stage, el('aside', 'ludo-slate'))
    this.select(this.selected, false)
    this.renderSlate()
    if (!this.body.contains(document.activeElement) || document.activeElement === this.body) open.focus()
  }

  /** Met le sachet de la collection `slug` sous le projecteur. */
  private select(slug: string, heard: boolean) {
    const booster = this.info?.registry.find((b) => b.slug === slug)
    const stage = this.view.querySelector('.ludo-stage')
    if (!booster || !stage) return
    const changed = this.selected !== slug
    this.selected = slug
    if (heard && changed) this.sound('card-select', 0.7)
    const hero = stage.querySelector<HTMLElement>('.ludo-hero')!
    const img = hero.querySelector('img')!
    if (img.dataset.slug !== slug) {
      img.dataset.slug = slug
      img.src = coverUrl(slug, true)
      // Le reflet épouse la forme du sachet.
      hero.style.setProperty('--mask', `url("${coverUrl(slug, true)}")`)
      // Le sachet change : il se pose sur le présentoir.
      hero.classList.remove('settle')
      void hero.offsetWidth
      hero.classList.add('settle')
    }
    stage.querySelector('.ludo-name')!.textContent = booster.title
    const done = booster.total > 0 && booster.owned >= booster.total
    stage.querySelector('.ludo-progress')!.textContent = !booster.total ? ''
      : done ? tr(`Collection complète : ${booster.total} cartes sur ${booster.total}`, `Collection complete: ${booster.total} of ${booster.total} cards`)
        : tr(`${booster.owned} ${plural(booster.owned, 'carte', 'cartes')} sur ${booster.total} dans votre classeur`, `${booster.owned} of ${booster.total} cards in your binder`)
    for (const pack of stage.querySelectorAll<HTMLElement>('.ludo-pack')) {
      const on = pack.dataset.slug === slug
      pack.classList.toggle('selected', on)
      pack.setAttribute('aria-selected', String(on))
      if (on && changed) pack.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
    }
    this.updateOpen()
  }

  /** Le bouton « Ouvrir » et ce qu'il reste à ouvrir. */
  private updateOpen() {
    const info = this.info, stage = this.view.querySelector('.ludo-stage')
    if (!info || !stage) return
    const open = stage.querySelector<HTMLButtonElement>('.ludo-open')!, hero = stage.querySelector<HTMLButtonElement>('.ludo-hero')!
    const can = this.canOpen()
    open.disabled = hero.disabled = !can
    hero.setAttribute('aria-label', tr('Ouvrir ce booster', 'Open this booster'))
    open.textContent = stage.classList.contains('tearing') ? tr('Le sachet se déchire…', 'Tearing the pack open…') : tr('Ouvrir ce booster', 'Open this booster')
    stage.querySelector('.ludo-left')!.textContent = info.guest ? tr('Connectez-vous au site pour ouvrir des boosters.', 'Sign in to the site to open boosters.')
      : info.unlimited ? tr('Site de développement : boosters à volonté.', 'Development site: unlimited boosters.')
        : info.boosters > 0 ? tr(`Il vous en reste ${info.boosters} à ouvrir, dans la collection de votre choix.`, `You have ${info.boosters} left to open, in any collection you like.`)
          : tr('Votre réserve est vide. Ludo en vend ; les aventures du site et la zone thargoïde en donnent.', 'Your stock is empty. Ludo sells some; the site\'s adventures and the Thargoid zone give some.')
  }

  /** L'ardoise de Ludo : la réserve, les prix de la semaine, l'achat, le classeur. */
  private renderSlate() {
    const info = this.info, slate = this.view.querySelector('.ludo-slate')
    if (!info || !slate) return
    slate.replaceChildren()
    const stock = el('div', 'ludo-stock')
    stock.append(el('strong', '', info.unlimited ? '∞' : String(info.boosters)), el('span', '', tr(plural(info.boosters, 'booster dans votre réserve', 'boosters dans votre réserve'), plural(info.boosters, 'booster in your stock', 'boosters in your stock'))))
    slate.append(stock, el('h3', '', tr('L\'ardoise de la semaine', 'This week\'s slate')))
    if (info.guest) slate.append(el('p', 'ludo-note', tr('Connectez-vous au site pour acheter des boosters.', 'Sign in to the site to buy boosters.')))
    else if (!info.shop) slate.append(el('p', 'ludo-note', tr('Ludo attend sa livraison : la boutique ouvre bientôt.', 'Ludo is waiting for his delivery: the shop opens soon.')))
    else {
      const { prices, bought, reset } = info.shop
      const list = el('ol', 'ludo-prices')
      prices.forEach((price, i) => {
        const row = el('li', i < bought ? 'sold' : i === bought ? 'next' : '')
        row.append(el('span', '', i === 0 ? tr('Le premier', 'The first') : i === 1 ? tr('Le deuxième', 'The second') : tr(`Le n° ${i + 1}`, `No. ${i + 1}`)), el('i'), el('b', '', i < bought ? tr('Acheté', 'Bought') : formatCredits(price)))
        list.append(row)
      })
      slate.append(list)
      const next = prices[bought]
      const short = next !== undefined && this.wallet.ready && this.wallet.balance < next
      // Le libellé à gauche, le prix à droite, comme sur l'ardoise.
      const buy = button('ludo-buy', '', () => void this.buy())
      if (next === undefined) buy.append(el('span', '', tr('Stock de la semaine épuisé', 'Sold out for the week')))
      else buy.append(el('span', '', tr('Acheter un booster', 'Buy a booster')), el('b', '', formatCredits(next)))
      buy.disabled = this.busy || next === undefined || !this.wallet.ready || short
      slate.append(buy)
      const when = new Date(reset * 1000).toLocaleString(EN ? 'en-GB' : 'fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' })
      slate.append(el('p', 'ludo-note', this.message || (next === undefined ? tr(`Le stock revient ${when}.`, `Stock returns ${when}.`)
        : short ? tr(`Il vous manque ${formatCredits(next - this.wallet.balance)}.`, `You are ${formatCredits(next - this.wallet.balance)} short.`)
          : tr(`${prices.length} par semaine, pas un de plus. Le stock revient ${when}.`, `${prices.length} a week, not one more. Stock returns ${when}.`))))
    }
    const binder = button('ludo-binder', tr('Feuilleter ma collection', 'Browse my collection'), () => this.embed.open('collection'))
    binder.disabled = info.guest
    slate.append(binder)
  }

  private async buy() {
    if (this.busy) return
    this.busy = true
    this.message = tr('Ludo descend un sachet du mur…', 'Ludo takes a pack down from the wall…')
    this.renderSlate()
    this.updateOpen()
    const result = await buyBooster()
    this.busy = false
    if (typeof result.balance === 'number') this.wallet.site({ earned: 0, balance: result.balance })
    if (result.ok) {
      this.info = result.info
      this.message = tr(`Un booster de plus dans votre réserve, pour ${formatCredits(result.price)}.`, `One more booster in your stock, for ${formatCredits(result.price)}.`)
      this.onSound?.('buy')
    } else {
      this.message = result.reason === 'funds' ? tr('Crédits insuffisants pour ce booster.', 'Not enough credits for this booster.')
        : result.reason === 'max' ? tr('Le stock de la semaine est épuisé.', 'This week\'s stock is sold out.')
          : result.reason === 'guest' ? tr('Connectez-vous au site pour acheter des boosters.', 'Sign in to the site to buy boosters.')
            : tr('Le terminal de Ludo ne répond pas. Réessayez.', 'Ludo\'s terminal is not answering. Try again.')
      this.onSound?.('deny')
      if (result.reason === 'max') void this.refresh()
    }
    if (this.pull) return
    this.renderSlate()
    this.updateOpen()
  }

  private async openPack() {
    if (!this.canOpen()) return
    const stage = this.view.querySelector('.ludo-stage')
    this.busy = true
    this.message = ''
    stage?.classList.add('tearing')
    this.updateOpen()
    this.renderSlate()
    this.sound('card-select')
    // Le sachet a le temps de se déchirer, même si le site répond tout de suite.
    const [result] = await Promise.all([openBooster(this.selected), new Promise((r) => setTimeout(r, TEAR_TIME))])
    this.busy = false
    stage?.classList.remove('tearing')
    if (!this.embed.isOpen) return
    if (!result || !result.cards.length) {
      this.message = tr('Le booster ne s\'est pas ouvert. Vérifiez qu\'il vous en reste, puis réessayez.', 'The booster did not open. Check that you have one left, then try again.')
      this.onSound?.('deny')
      await this.refresh()
      return
    }
    if (this.info && !this.info.unlimited) this.info = { ...this.info, boosters: result.boosters }
    this.pull = result.cards
    this.revealed = 0
    this.onPull?.(result.cards)
    this.renderTable()
    // Le compte des boosters et l'avancée des collections ont changé.
    void cardsInfo(true).then((info) => { if (info) { this.info = info; if (this.pull) this.updateTable() } })
  }

  // ---------------------------------------------------------------- la table de tirage

  /** Les cartes distribuées face cachée sur le feutre. */
  private renderTable() {
    const cards = this.pull!, booster = this.current()
    this.view.className = 'ludo-view ludo-table'
    const hand = el('div', 'ludo-hand')
    cards.forEach((card, i) => {
      const slot = button(`ludo-card rarity-${card.rarity}`, '', () => {
        if (slot.classList.contains('flipped')) return void window.open(cardUrl(card.key, true), '_blank', 'noopener')
        this.flip(i)
      })
      slot.style.setProperty('--i', String(i))
      // Chaque carte tombe un peu de travers, comme distribuée à la main.
      slot.style.setProperty('--tilt', `${((i * 37) % 7) - 3}deg`)
      const inner = el('span', 'ludo-card-inner')
      const back = el('img', 'ludo-card-back')
      back.src = backUrl(true)
      back.alt = ''
      const front = el('img', 'ludo-card-front')
      front.src = cardUrl(card.key)
      front.alt = ''
      inner.append(back, front, el('span', 'ludo-card-foil'))
      slot.append(el('span', 'ludo-card-aura'), inner, el('small'))
      hand.append(slot)
      this.timers.push(window.setTimeout(() => this.sound('card-place', 0.8), 120 + i * DEAL_GAP))
    })
    const actions = el('div', 'ludo-actions')
    const main = button('ludo-open', '', () => (this.revealed < cards.length ? this.flip(this.nextHidden()) : void this.again()))
    main.dataset.autofocus = ''
    actions.append(main, button('ludo-quiet', tr('Tout retourner', 'Turn them all over'), () => this.flipAll()), button('ludo-quiet', tr('Revenir au présentoir', 'Back to the display'), () => this.back()))
    this.view.replaceChildren(el('p', 'ludo-from', booster?.title ?? ''), hand, el('p', 'ludo-caption'), actions)
    this.updateTable()
    main.focus()
  }

  private nextHidden(): number {
    return [...this.view.querySelectorAll('.ludo-card')].findIndex((c) => !c.classList.contains('flipped'))
  }

  /** Retourne la carte `i`, si elle est encore face cachée. */
  private flip(i: number) {
    const card = this.pull?.[i], slot = this.view.querySelectorAll<HTMLElement>('.ludo-card')[i]
    if (!card || !slot || slot.classList.contains('flipped')) return
    slot.classList.add('flipped')
    this.revealed++
    // Une carte retournée ; un bruit plus plein pour une ultra-rare ou une mythique.
    this.sound(card.rarity === 'u' || card.rarity === 'm' ? 'card-capture' : 'card-place')
    this.updateTable()
  }

  private flipAll() {
    const hidden = [...this.view.querySelectorAll<HTMLElement>('.ludo-card')].flatMap((c, i) => (c.classList.contains('flipped') ? [] : [i]))
    hidden.forEach((i, k) => this.timers.push(window.setTimeout(() => this.flip(i), k * 220)))
  }

  /** Ce que dit la table du tirage en cours, et ses boutons. */
  private updateTable() {
    const cards = this.pull
    if (!cards) return
    const slots = [...this.view.querySelectorAll<HTMLElement>('.ludo-card')]
    const shown = slots.map((s) => s.classList.contains('flipped'))
    slots.forEach((slot, i) => {
      slot.querySelector('small')!.textContent = shown[i] ? RARITY_NAMES[cards[i].rarity] : ''
      slot.setAttribute('aria-label', shown[i] ? tr(`${RARITY_NAMES[cards[i].rarity]} : voir la carte en grand`, `${RARITY_NAMES[cards[i].rarity]}: see the card full size`) : tr(`Retourner la carte ${i + 1}`, `Turn card ${i + 1} over`))
    })
    const done = this.revealed >= cards.length, info = this.info
    const best = cards.filter((_, i) => shown[i]).reduce<Rarity>((b, c) => (RANK.indexOf(c.rarity) > RANK.indexOf(b) ? c.rarity : b), 'c')
    this.view.querySelector('.ludo-caption')!.textContent = !this.revealed ? tr(`${cards.length} cartes, face cachée. Retournez-les à votre rythme.`, `${cards.length} cards, face down. Turn them over at your own pace.`)
      : best === 'm' ? tr('Une mythique. Ludo en lâche son éventail.', 'A mythic. Ludo drops his fan of cards.')
        : best === 'u' ? tr('Une ultra-rare. Elle brille jusque dans le hall.', 'An ultra rare. It shines all the way to the hall.')
          : best === 'r' ? tr('Une rare : joli tirage.', 'A rare: nice pull.')
            : done ? tr('Des communes, cette fois. Elles sont dans votre classeur.', 'Commons, this time. They are in your binder.') : tr('Des communes, pour l\'instant.', 'Commons, so far.')
    const [main, all, back] = this.view.querySelectorAll<HTMLButtonElement>('.ludo-actions button')
    const more = !!info && !info.guest && (info.unlimited || info.boosters > 0)
    main.textContent = !done ? tr('Retourner la carte suivante', 'Turn the next card over')
      : more ? tr('Ouvrir un autre booster', 'Open another booster') : tr('Revenir au présentoir', 'Back to the display')
    all.hidden = done || cards.length - this.revealed < 2
    // Sans autre booster à ouvrir, le bouton principal ramène déjà au présentoir.
    back.hidden = !done || !more
    this.view.classList.toggle('done', done)
  }

  /** Tirage fini : un autre booster de la même collection, s'il en reste. */
  private async again() {
    const info = this.info
    if (!info || info.guest || (!info.unlimited && info.boosters < 1)) return this.back()
    this.clearPull()
    this.renderShop()
    await this.openPack()
  }

  private back() {
    this.clearPull()
    this.renderShop()
    void this.refresh()
  }

  /** Au clavier : les flèches changent de collection sur le présentoir. */
  private onKey(e: KeyboardEvent) {
    if (this.pull || !this.info || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    const list = this.info.registry, i = list.findIndex((b) => b.slug === this.selected)
    const next = list[(i + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length]
    if (!next) return
    e.preventDefault()
    this.select(next.slug, true)
  }
}
