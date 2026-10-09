import { formatCredits } from '../economy/data'
import type { Wallet } from '../economy/wallet'
import type { GameEmbed } from '../game-embed'
import { EN, tr } from '../i18n'
import { buyBooster, cardUrl, cardsInfo, coverUrl, openBooster, type BoosterInfo, type CardRef, type CardsInfo, type Rarity } from './site'

/*
 * Le Comptoir des Cartes Dangereuses (pont supérieur, cf. src/furniture/cards.ts) : chez Ludo, on
 * achète des boosters contre des crédits du jeu (cher, et peu par semaine : le site tient le
 * compte), on ouvre ceux qu'on a, collection par collection, et on file voir son classeur. Le
 * panneau s'affiche dans la fenêtre des jeux du site (cf. GameEmbed.openPanel).
 */

const RARITY_NAMES: Record<Rarity, string> = { c: tr('Commune', 'Common'), r: tr('Rare', 'Rare'), u: tr('Ultra-rare', 'Ultra rare'), m: tr('Mythique', 'Mythic') }
const LINES = [
  tr('« Un booster, c\'est quatre cartes et une promesse. Je ne garantis que les cartes. »', '“A booster is four cards and a promise. I only guarantee the cards.”'),
  tr('« Deux par semaine, pas un de plus : la rareté, ça s\'entretient. »', '“Two a week, not one more: rarity takes upkeep.”'),
  tr('« La mythique ? Une chance sur cent, par carte. J\'en ai vu pleurer devant l\'autel. »', '“The mythic? One in a hundred, per card. I\'ve seen people cry at the altar.”'),
  tr('« Les aventures du site paient mieux que moi : un booster chacune. Moi, je dépanne. »', '“The site\'s adventures pay better than I do: a booster each. I just help out.”'),
  tr('« Ouvrez-le sur l\'autel : tout le monde aime voir briller une ultra-rare. »', '“Open it on the altar: everyone likes to see an ultra rare shine.”'),
]

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (className) e.className = className
  if (text !== undefined) e.textContent = text
  return e
}

export class CardsPanel {
  private body = el('div', 'cards-panel')
  private status = el('p', 'cards-status')
  private info: CardsInfo | null = null
  private loading = false
  private busy = false
  private selected = ''
  private pull: CardRef[] | null = null
  private revealed = 0
  private message = ''
  private line = Math.floor(Math.random() * LINES.length)
  private unsubscribe: (() => void) | null = null
  /** On vient de tirer ces cartes (l'autel de la pièce les montre). */
  onPull?: (cards: CardRef[]) => void
  /** Une carte se retourne ; un booster est acheté. */
  onSound?: (kind: 'flip' | 'rare' | 'buy' | 'deny') => void

  constructor(private embed: GameEmbed, private wallet: Wallet) {}

  open() {
    this.pull = null
    this.message = ''
    this.line = (this.line + 1) % LINES.length
    this.unsubscribe ??= this.wallet.subscribe(() => { if (!this.pull) this.render() })
    this.embed.openPanel({
      kicker: tr('PONT SUPÉRIEUR · COMPTOIR DES CARTES DANGEREUSES', 'UPPER DECK · CARTES DANGEREUSES COUNTER'),
      title: tr('Chez Ludo', 'Ludo\'s'),
      hint: LINES[this.line],
      body: this.body,
      onClose: () => { this.unsubscribe?.(); this.unsubscribe = null },
    })
    this.render()
    void this.refresh()
  }

  private async refresh() {
    this.loading = true
    this.render()
    const info = await cardsInfo(true)
    this.loading = false
    if (info) this.info = info
    else if (!this.info) this.message = tr('Le terminal de Ludo ne répond pas. Réessayez dans un instant.', 'Ludo\'s terminal is unavailable. Try again in a moment.')
    if (this.info && !this.info.registry.some((b) => b.slug === this.selected)) this.selected = (this.info.registry.find((b) => b.featured) ?? this.info.registry[0])?.slug ?? ''
    this.render()
  }

  private render() {
    if (this.pull) return this.renderPull()
    const info = this.info
    this.body.replaceChildren()
    this.body.classList.remove('cards-reveal')
    if (!info) {
      this.body.append(el('p', 'cards-empty', this.message || tr('Ludo cherche votre classeur…', 'Ludo is looking for your binder…')))
      return
    }
    // --- La boutique, à gauche.
    const shop = el('section', 'cards-shop')
    shop.append(el('h3', '', tr('La boutique', 'The shop')))
    const stock = el('div', 'cards-stock')
    const count = el('strong', '', info.unlimited ? '∞' : String(info.boosters))
    stock.append(count, el('span', '', tr(info.boosters > 1 ? 'boosters à ouvrir' : 'booster à ouvrir', info.boosters === 1 ? 'booster to open' : 'boosters to open')))
    shop.append(stock)
    if (info.guest) shop.append(el('p', 'cards-note', tr('Connectez-vous au site pour acheter et ouvrir des boosters.', 'Sign in to the site to buy and open boosters.')))
    else if (!info.shop) shop.append(el('p', 'cards-note', tr('Ludo attend sa livraison : la boutique ouvre bientôt.', 'Ludo is waiting for his delivery: the shop opens soon.')))
    else {
      const { prices, bought, reset } = info.shop
      const list = el('ol', 'cards-prices')
      prices.forEach((price, i) => {
        const row = el('li', i < bought ? 'sold' : i === bought ? 'next' : '')
        row.append(el('span', '', tr(`Booster n° ${i + 1} de la semaine`, `Booster #${i + 1} this week`)), el('b', '', i < bought ? tr('Acheté', 'Bought') : formatCredits(price)))
        list.append(row)
      })
      shop.append(list)
      const next = prices[bought]
      const buy = el('button', 'cards-buy', next === undefined ? tr('Stock de la semaine épuisé', 'This week\'s stock is sold out') : tr(`Acheter un booster · ${formatCredits(next)}`, `Buy a booster · ${formatCredits(next)}`))
      buy.type = 'button'
      buy.disabled = this.busy || next === undefined || !this.wallet.ready || this.wallet.balance < next
      buy.onclick = () => void this.buy()
      shop.append(buy)
      const when = new Date(reset * 1000).toLocaleString(EN ? 'en-GB' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
      shop.append(el('p', 'cards-note', next === undefined
        ? tr(`Retour du stock : ${when}.`, `Back in stock: ${when}.`)
        : this.wallet.ready && this.wallet.balance < next
          ? tr(`Il vous manque ${formatCredits(next - this.wallet.balance)}. Solde : ${formatCredits(this.wallet.balance)}.`, `You are ${formatCredits(next - this.wallet.balance)} short. Balance: ${formatCredits(this.wallet.balance)}.`)
          : tr(`Solde : ${formatCredits(this.wallet.balance)}. ${prices.length} boosters par semaine au plus, le suivant plus cher ; le stock revient ${when}.`, `Balance: ${formatCredits(this.wallet.balance)}. ${prices.length} boosters a week at most, each dearer than the last; stock returns ${when}.`)))
    }
    const binder = el('button', 'cards-link', tr('Voir ma collection ↗', 'See my collection ↗'))
    binder.type = 'button'
    binder.disabled = info.guest
    binder.onclick = () => this.embed.open('collection')
    shop.append(binder)
    this.status.textContent = this.message || (this.loading ? tr('Mise à jour…', 'Updating…') : '')
    shop.append(this.status)

    // --- Les boosters, à droite : un sachet par collection.
    const open = el('section', 'cards-open')
    const current = info.registry.find((b) => b.slug === this.selected)
    open.append(el('h3', '', tr('Ouvrir un booster', 'Open a booster')))
    const grid = el('div', 'cards-grid')
    for (const booster of info.registry) grid.append(this.pack(booster))
    const go = el('button', 'cards-go', current
      ? tr(`Ouvrir · ${current.title}`, `Open · ${current.title}`)
      : tr('Choisissez une collection', 'Pick a collection'))
    go.type = 'button'
    go.disabled = this.busy || !current || info.guest || (!info.unlimited && info.boosters < 1)
    go.onclick = () => void this.openPack()
    // Le bouton avant les sachets : il reste sous les yeux, quel que soit le nombre de collections.
    open.append(go, grid)
    if (!info.guest && !info.unlimited && info.boosters < 1) open.append(el('p', 'cards-note', tr('Plus de booster à ouvrir : la boutique, les aventures du site et la zone thargoïde en donnent.', 'No booster left to open: the shop, the site\'s adventures and the Thargoid zone give some.')))
    this.body.append(shop, open)
  }

  private pack(booster: BoosterInfo): HTMLElement {
    const card = el('button', booster.slug === this.selected ? 'cards-pack selected' : 'cards-pack')
    card.type = 'button'
    card.setAttribute('aria-pressed', String(booster.slug === this.selected))
    const img = el('img')
    img.src = coverUrl(booster.slug)
    img.alt = ''
    img.loading = 'lazy'
    img.onerror = () => { img.style.visibility = 'hidden' }
    const done = booster.total > 0 && booster.owned >= booster.total
    const bar = el('span', 'cards-progress')
    bar.style.setProperty('--done', String(booster.total ? Math.min(1, booster.owned / booster.total) : 0))
    card.append(img, el('strong', '', booster.title), el('small', done ? 'complete' : '', booster.total ? `${booster.owned} / ${booster.total}` : '—'), bar)
    card.onclick = () => { this.selected = booster.slug; this.render() }
    return card
  }

  private async buy() {
    if (this.busy) return
    this.busy = true
    this.message = tr('Ludo descend un sachet du mur…', 'Ludo takes a pack down from the wall…')
    this.render()
    const result = await buyBooster()
    this.busy = false
    if (typeof result.balance === 'number') this.wallet.site({ earned: 0, balance: result.balance })
    if (result.ok) {
      this.info = result.info
      this.message = tr(`Un booster de plus dans votre poche, pour ${formatCredits(result.price)}.`, `One more booster in your pocket, for ${formatCredits(result.price)}.`)
      this.onSound?.('buy')
    } else {
      this.message = result.reason === 'funds' ? tr('Crédits insuffisants pour ce booster.', 'Not enough credits for this booster.')
        : result.reason === 'max' ? tr('Le stock de la semaine est épuisé.', 'This week\'s stock is sold out.')
          : result.reason === 'guest' ? tr('Connectez-vous au site pour acheter des boosters.', 'Sign in to the site to buy boosters.')
            : tr('Le terminal de Ludo ne répond pas. Réessayez.', 'Ludo\'s terminal is unavailable. Try again.')
      this.onSound?.('deny')
      if (result.reason === 'max') void this.refresh()
    }
    this.render()
  }

  private async openPack() {
    if (this.busy || !this.selected) return
    this.busy = true
    this.message = tr('Le sachet se déchire…', 'The pack tears open…')
    this.render()
    const result = await openBooster(this.selected)
    this.busy = false
    if (!result) {
      this.message = tr('Le booster ne s\'est pas ouvert. Vérifiez qu\'il vous en reste, puis réessayez.', 'The booster did not open. Check that you have one left, then try again.')
      this.onSound?.('deny')
      void this.refresh()
      return
    }
    this.message = ''
    this.pull = result.cards
    this.revealed = 0
    this.onPull?.(result.cards)
    this.renderPull()
    // Le compte des boosters et l'avancée des collections ont changé.
    void cardsInfo(true).then((info) => { if (info) this.info = info })
  }

  /** Le tirage : les cartes face cachée, qu'on retourne une à une (ou toutes d'un coup). */
  private renderPull() {
    const cards = this.pull!
    this.body.replaceChildren()
    this.body.classList.add('cards-reveal')
    const row = el('div', 'cards-pull')
    cards.forEach((card, i) => {
      const slot = el('button', `cards-card rarity-${card.rarity}`)
      slot.type = 'button'
      const inner = el('span', 'cards-card-inner')
      const front = el('img', 'cards-card-front')
      front.src = cardUrl(card.key)
      front.alt = card.key
      inner.append(el('span', 'cards-card-back'), front)
      slot.append(inner, el('small'))
      slot.onclick = () => {
        if (i < this.revealed) return void window.open(cardUrl(card.key, true), '_blank', 'noopener')
        if (i === this.revealed) this.flip()
      }
      row.append(slot)
    })
    const actions = el('div', 'cards-actions')
    const main = el('button', 'cards-go')
    main.type = 'button'
    main.onclick = () => (this.revealed >= cards.length ? this.back() : this.flip())
    const all = el('button', 'cards-link', tr('Tout retourner', 'Turn them all over'))
    all.type = 'button'
    all.onclick = () => { while (this.revealed < cards.length) this.flip() }
    actions.append(main, all)
    this.body.append(row, el('p', 'cards-status'), actions)
    this.updatePull()
    main.focus()
  }

  /** Met le tirage affiché à jour : les cartes retournées, ce qu'en dit Ludo, le bouton. */
  private updatePull() {
    const cards = this.pull!, done = this.revealed >= cards.length
    this.body.querySelectorAll<HTMLElement>('.cards-card').forEach((slot, i) => {
      const shown = i < this.revealed
      slot.classList.toggle('flipped', shown)
      slot.querySelector('small')!.textContent = shown ? RARITY_NAMES[cards[i].rarity] : ''
      slot.setAttribute('aria-label', shown ? `${cards[i].key}, ${RARITY_NAMES[cards[i].rarity]}` : tr('Retourner la carte', 'Turn the card over'))
    })
    const best = cards.slice(0, this.revealed).reduce<Rarity>((b, c) => ('crum'.indexOf(c.rarity) > 'crum'.indexOf(b) ? c.rarity : b), 'c')
    this.body.querySelector('.cards-status')!.textContent = !this.revealed ? tr('Quatre cartes, face cachée. À vous.', 'Four cards, face down. Your move.')
      : best === 'm' ? tr('Une MYTHIQUE. Ludo en lâche son éventail.', 'A MYTHIC. Ludo drops his fan of cards.')
        : best === 'u' ? tr('Une ultra-rare ! Elle brille jusque dans le hall.', 'An ultra rare! It shines all the way to the hall.')
          : best === 'r' ? tr('Une rare : joli tirage.', 'A rare: nice pull.') : tr('Des communes, pour l\'instant…', 'Commons, so far…')
    const [main, all] = this.body.querySelectorAll<HTMLButtonElement>('.cards-actions button')
    main.textContent = done ? tr('Ouvrir un autre booster', 'Open another booster') : tr('Retourner la carte suivante', 'Turn the next card over')
    all.hidden = done
  }

  private flip() {
    const card = this.pull?.[this.revealed]
    if (!card) return
    this.revealed++
    this.onSound?.(card.rarity === 'c' ? 'flip' : 'rare')
    this.updatePull()
  }

  private back() {
    this.pull = null
    this.render()
    void this.refresh()
  }
}
