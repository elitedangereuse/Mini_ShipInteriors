import { shipCatalog, silhouetteRects, type EdShipEntry, type EdShipId } from './ed-ships'
import { EN, tr } from './i18n'
import { Modal } from './salvage/ui'
import { BAY_SCALE, bayScale } from './ship-bay'
import { FACTORY, factoryPaint, familyLabel, shipPaints, type Livery, type ShipPaint } from './ship-paint'
import { ShipPreview } from './ship-preview'

/*
 * Le registre du hangar (l'écran mural du mur sud, cf. levels.ts), en deux onglets.
 *
 * Vaisseaux : on y choisit son vaisseau parmi ceux d'Elite Dangerous (cf. ed-ships.ts), du plus
 * petit au plus grand. Chacun a sa fiche : sa silhouette vue de dessus, son nom, son constructeur,
 * sa longueur ; ceux qui ne tiennent pas dans le hangar à l'échelle commune y sont réduits (cf.
 * ship-bay.ts), et la fiche le dit.
 *
 * Peinture : les peintures de la boutique d'Elite pour le vaisseau posé (cf. ship-paint.ts), rangées
 * par famille en pastilles, et la livrée du constructeur. L'aperçu montre le vaisseau dans celle
 * qu'on survole ; un clic la pose, au hangar comme sur la base.
 */
type Tab = 'ship' | 'paint'

export class ShipPicker extends Modal {
  /** Un vaisseau choisi (pas celui qui est déjà posé). */
  onPick?: (id: EdShipId) => void
  /** Une peinture posée sur le vaisseau du registre (null : la livrée du constructeur). */
  onPaint?: (ship: EdShipId, paint: ShipPaint | null) => void
  /** La peinture de ce vaisseau (son identifiant ; FACTORY : la livrée du constructeur). */
  paintOf: (ship: EdShipId) => string = () => FACTORY
  /** Le vaisseau du joueur dans Elite Dangerous, si le site l'a dit : sa fiche est marquée, et y revenir, c'est le suivre à nouveau. */
  elite: EdShipId | null = null
  private current: EdShipId | null = null
  private tab: Tab = 'ship'
  private readonly tabs = document.createElement('div')
  private readonly tabButtons: Record<Tab, HTMLButtonElement>
  private readonly shipPane = document.createElement('div')
  private readonly grid = document.createElement('div')
  private readonly status = document.createElement('p')
  private readonly paintPane = document.createElement('div')
  private readonly preview = new ShipPreview()
  private readonly paintName = document.createElement('span')
  private readonly paintFamily = document.createElement('span')
  private readonly paintIntro = document.createElement('p')
  private readonly paintList = document.createElement('div')
  private readonly paintStatus = document.createElement('p')
  /** Les peintures du vaisseau affiché, et pour quel vaisseau. */
  private paints: ShipPaint[] = []
  private paintsFor: EdShipId | null = null
  /** La peinture posée (null : la livrée du constructeur). */
  private applied: ShipPaint | null = null
  private livery: Livery | null = null

  constructor() {
    super(tr('REGISTRE · HANGAR 01', 'REGISTRY · HANGAR 01'), tr('Mon vaisseau', 'My ship'))
    this.root.classList.add('ship-picker')

    this.tabs.className = 'ship-picker-tabs'
    this.tabs.setAttribute('role', 'tablist')
    const tabButton = (tab: Tab, label: string) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = label
      b.setAttribute('role', 'tab')
      b.addEventListener('click', () => this.select(tab))
      this.tabs.append(b)
      return b
    }
    this.tabButtons = { ship: tabButton('ship', tr('Vaisseaux', 'Ships')), paint: tabButton('paint', tr('Peinture', 'Paint')) }
    this.tabs.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      const next: Tab = this.tab === 'ship' ? 'paint' : 'ship'
      this.select(next)
      this.tabButtons[next].focus()
    })

    const intro = document.createElement('p')
    intro.className = 'salvage-intro'
    intro.textContent = tr(
      'Le vaisseau posé sur le pad, celui que vous pilotez jusqu\'à la base au sol. Chacun voit le sien : celui de votre CMDR dans Elite Dangerous, tant que vous n\'en choisissez pas un autre ici.',
      'The ship parked on the pad, the one you fly down to the ground base. Everyone sees their own: the one your CMDR flies in Elite Dangerous, until you pick another one here.',
    )
    this.grid.className = 'ship-picker-grid'
    this.grid.setAttribute('role', 'group')
    this.grid.setAttribute('aria-label', tr('Vaisseaux', 'Ships'))
    this.status.className = 'salvage-note'
    this.status.setAttribute('aria-live', 'polite')
    this.shipPane.append(intro, this.grid, this.status)

    // La peinture : l'aperçu (et la peinture regardée), puis le nuancier.
    this.paintIntro.className = 'salvage-intro'
    const stage = document.createElement('div')
    stage.className = 'ship-paint-stage'
    const caption = document.createElement('p')
    caption.className = 'ship-paint-caption'
    caption.setAttribute('aria-live', 'polite')
    this.paintName.className = 'ship-paint-name'
    this.paintFamily.className = 'ship-paint-family'
    caption.append(this.paintName, this.paintFamily)
    stage.append(this.preview.element, caption)
    this.paintList.className = 'ship-paint-list'
    this.paintList.setAttribute('aria-label', tr('Peintures', 'Paints'))
    this.paintList.addEventListener('keydown', (e) => this.navigate(e))
    // Plus rien sous le pointeur ni le focus : l'aperçu revient à la peinture posée.
    this.paintList.addEventListener('pointerleave', () => {
      if (!this.paintList.contains(document.activeElement)) this.look(this.applied)
    })
    this.paintList.addEventListener('focusout', (e) => {
      if (!this.paintList.contains(e.relatedTarget as Node | null)) this.look(this.applied)
    })
    this.paintStatus.className = 'salvage-note'
    this.paintStatus.setAttribute('aria-live', 'polite')
    const paints = document.createElement('div')
    paints.className = 'ship-paints'
    paints.append(stage, this.paintList)
    this.paintPane.append(this.paintIntro, paints, this.paintStatus)
    this.preview.onLoad = (livery) => {
      this.livery = livery
      const chip = this.paintList.querySelector<HTMLElement>(`[data-paint="${FACTORY}"] .ship-paint-swatch`)
      if (chip) chip.style.background = swatch(factoryPaint(livery))
    }

    this.body.append(this.tabs, this.shipPane, this.paintPane)
    this.select('ship')
  }

  /** Ouvre le registre (sur l'onglet des vaisseaux, sauf demande), le vaisseau posé en surbrillance. */
  async open(current: EdShipId, tab: Tab = 'ship') {
    if (current !== this.current) this.paintsFor = null
    this.current = current
    this.show()
    this.select(tab)
    if (this.grid.childElementCount) {
      this.mark()
      return
    }
    this.status.textContent = tr('Lecture du registre…', 'Reading the registry…')
    try {
      const list = await shipCatalog()
      this.grid.replaceChildren(...list.map((e) => this.card(e)))
      this.status.textContent = ''
      this.mark()
    } catch (e) {
      console.error(e)
      this.status.textContent = tr('Le registre ne répond pas. Fermez-le et réessayez dans un instant.', 'The registry is not answering. Close it and try again in a moment.')
    }
  }

  close() {
    super.close()
    this.preview.release()
  }

  private select(tab: Tab) {
    this.tab = tab
    for (const [t, b] of Object.entries(this.tabButtons) as [Tab, HTMLButtonElement][]) {
      const on = t === tab
      b.setAttribute('aria-selected', String(on))
      b.tabIndex = on ? 0 : -1
    }
    this.shipPane.hidden = tab !== 'ship'
    this.paintPane.hidden = tab !== 'paint'
    if (tab === 'paint') void this.openPaints()
    else this.preview.release()
  }

  /** Le dernier vaisseau choisi (posé, ou encore en route) : sa fiche est marquée, et a le focus. */
  private mark() {
    for (const b of this.grid.querySelectorAll<HTMLButtonElement>('.ship-card')) {
      const on = b.dataset.ship === this.current
      b.setAttribute('aria-pressed', String(on))
      if (on && this.isOpen && this.tab === 'ship') b.focus({ preventScroll: false })
      // Le vaisseau d'Elite peut n'arriver qu'après les fiches : sa marque se pose ici.
      b.querySelector('.ship-card-elite')?.remove()
      if (b.dataset.ship === this.elite) {
        const tag = document.createElement('span')
        tag.className = 'ship-card-tag ship-card-elite'
        tag.textContent = tr('Dans Elite', 'In Elite')
        tag.title = tr('Le vaisseau que vous pilotez dans Elite Dangerous : le choisir, c\'est laisser le hangar le suivre.', 'The ship you fly in Elite Dangerous: picking it lets the hangar follow it.')
        b.append(tag)
      }
    }
  }

  private card(e: EdShipEntry): HTMLButtonElement {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'ship-card'
    b.dataset.ship = e.id
    // La silhouette, nez vers le haut.
    const canvas = document.createElement('canvas')
    canvas.width = 140
    canvas.height = 80
    canvas.setAttribute('aria-hidden', 'true')
    const c = canvas.getContext('2d')
    if (c) {
      c.translate(70, 40)
      c.rotate(-Math.PI / 2)
      c.scale(1.3, 1.3)
      c.fillStyle = '#cfe2f5'
      // Chaque case déborde un peu sur ses voisines : pas de jour entre les rangées.
      for (const [x, y, w, h] of silhouetteRects(e.silhouette)) c.fillRect(x - 0.25, y - 0.25, w + 0.5, h + 0.5)
    }
    const name = document.createElement('span')
    name.className = 'ship-card-name'
    name.textContent = e.name
    const meta = document.createElement('span')
    meta.className = 'ship-card-meta'
    const length = e.size[2].toLocaleString(EN ? 'en' : 'fr', { maximumFractionDigits: 0 })
    meta.textContent = tr(`${e.maker}, ${length} m`, `${e.maker}, ${length} m`)
    b.append(canvas, name, meta)
    if (bayScale(e.size) < BAY_SCALE * 0.999) {
      const tag = document.createElement('span')
      tag.className = 'ship-card-tag'
      tag.textContent = tr('Réduit au hangar', 'Scaled down in the hangar')
      tag.title = tr('Trop grand pour le hangar à la même échelle que les autres : il y est réduit.', 'Too big for the hangar at the same scale as the others: it is scaled down there.')
      b.append(tag)
    }
    b.setAttribute('aria-label', tr(`${e.name}, ${e.maker}, ${length} mètres`, `${e.name}, ${e.maker}, ${length} metres`))
    b.addEventListener('click', () => {
      this.close()
      if (e.id !== this.current) this.onPick?.(e.id)
    })
    return b
  }

  // ---------------------------------------------------------------- peinture

  /** L'onglet de la peinture : le nuancier du vaisseau posé (chargé une fois par vaisseau), l'aperçu. */
  private async openPaints() {
    const ship = this.current
    if (!ship) return
    const name = (await shipCatalog().catch(() => [])).find((e) => e.id === ship)?.name ?? ''
    if (this.current !== ship || this.tab !== 'paint') return
    if (this.paintsFor !== ship) {
      this.paintList.replaceChildren()
      this.paintStatus.textContent = tr('Lecture du nuancier…', 'Reading the paint chart…')
      try {
        this.paints = await shipPaints(ship)
      } catch (e) {
        console.error(e)
        this.paints = []
        this.paintStatus.textContent = tr('Le nuancier ne répond pas. Fermez le registre et réessayez dans un instant.', 'The paint chart is not answering. Close the registry and try again in a moment.')
      }
      // Fermé, ou un autre onglet, pendant la lecture : on en reste là.
      if (this.current !== ship || !this.isOpen || this.tab !== 'paint') return
      this.paintsFor = ship
      if (this.paints.length) this.paintStatus.textContent = ''
      this.renderPaints()
    }
    this.paintIntro.textContent = tr(
      `Les ${this.paints.length} peintures de la boutique d'Elite Dangerous pour votre ${name}, et la livrée de son constructeur. Cliquez sur une pastille : elle est posée aussitôt, au hangar comme sur la base. Faites tourner l'aperçu en le glissant.`,
      `The ${this.paints.length} Elite Dangerous store paint jobs for your ${name}, and its maker's livery. Click a swatch: it is applied at once, in the hangar and at the base. Drag the preview to turn it.`,
    )
    if (!this.isOpen || this.tab !== 'paint') return
    const id = this.paintOf(ship)
    this.applied = this.paints.find((p) => p.id === id) ?? null
    this.markPaint()
    this.look(this.applied)
    // La pastille posée, en vue dans le nuancier.
    this.paintList.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' })
    void this.preview.show(ship, this.applied).catch((e) => console.error(e))
  }

  /** Les pastilles, famille par famille (dans l'ordre de la boutique), la livrée du constructeur en tête. */
  private renderPaints() {
    const families = new Map<string, ShipPaint[]>()
    for (const p of this.paints) {
      const list = families.get(p.family) ?? []
      list.push(p)
      families.set(p.family, list)
    }
    const groups: [string, (ShipPaint | null)[]][] = [[FACTORY, [null]], ...families]
    this.paintList.replaceChildren(...groups.map(([family, list]) => {
      const group = document.createElement('div')
      group.className = 'ship-paint-group'
      group.setAttribute('role', 'group')
      const label = document.createElement('span')
      label.className = 'ship-paint-group-label'
      label.id = `ship-paint-${family}`
      label.textContent = family === FACTORY ? tr('Livrée du constructeur', 'Factory livery') : familyLabel(family)
      group.setAttribute('aria-labelledby', label.id)
      const chips = document.createElement('div')
      chips.className = 'ship-paint-chips'
      chips.append(...list.map((p) => this.chip(p)))
      group.append(label, chips)
      return group
    }))
  }

  private chip(p: ShipPaint | null): HTMLButtonElement {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'ship-paint-chip'
    b.dataset.paint = p?.id ?? FACTORY
    b.tabIndex = -1
    const name = p ? p.name : tr('Livrée du constructeur', 'Factory livery')
    b.setAttribute('aria-label', name)
    b.title = name
    const s = document.createElement('span')
    s.className = 'ship-paint-swatch'
    s.style.background = p ? swatch(p) : this.livery ? swatch(factoryPaint(this.livery)) : '#8a8f96'
    b.append(s)
    b.addEventListener('pointerenter', () => this.look(p))
    b.addEventListener('focus', () => this.look(p))
    b.addEventListener('click', () => {
      this.applied = p
      this.markPaint()
      this.look(p)
      if (this.current) this.onPaint?.(this.current, p)
    })
    return b
  }

  /** La pastille de la peinture posée : marquée, et seule dans l'ordre de tabulation (les flèches mènent aux autres). */
  private markPaint() {
    const id = this.applied?.id ?? FACTORY
    for (const b of this.paintList.querySelectorAll<HTMLButtonElement>('.ship-paint-chip')) {
      const on = b.dataset.paint === id
      b.setAttribute('aria-pressed', String(on))
      b.tabIndex = on ? 0 : -1
    }
  }

  /** Montre une peinture dans l'aperçu (sans la poser). */
  private look(p: ShipPaint | null) {
    this.preview.setPaint(p)
    this.paintName.textContent = p ? p.name : tr('Livrée du constructeur', 'Factory livery')
    const applied = (this.applied?.id ?? FACTORY) === (p?.id ?? FACTORY)
    this.paintFamily.textContent = [
      p ? familyLabel(p.family) : tr('Les couleurs du chantier naval', 'The shipyard colours'),
      applied ? tr('posée', 'applied') : tr('aperçu', 'preview'),
    ].join(', ')
  }

  /** Les flèches : gauche et droite d'une pastille à l'autre, haut et bas d'une famille à l'autre. */
  private navigate(e: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return
    const chips = [...this.paintList.querySelectorAll<HTMLButtonElement>('.ship-paint-chip')]
    const at = chips.indexOf(document.activeElement as HTMLButtonElement)
    if (at < 0) return
    e.preventDefault()
    let next = at
    if (e.key === 'ArrowLeft') next = Math.max(0, at - 1)
    else if (e.key === 'ArrowRight') next = Math.min(chips.length - 1, at + 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = chips.length - 1
    else {
      // La famille d'avant ou d'après, à la même place (ou la dernière pastille de la rangée).
      const groups = [...this.paintList.querySelectorAll('.ship-paint-group')]
      const g = groups.findIndex((x) => x.contains(chips[at]))
      const target = groups[g + (e.key === 'ArrowUp' ? -1 : 1)]
      if (!target) return
      const mine = [...groups[g].querySelectorAll('.ship-paint-chip')].indexOf(chips[at])
      const theirs = [...target.querySelectorAll<HTMLButtonElement>('.ship-paint-chip')]
      next = chips.indexOf(theirs[Math.min(mine, theirs.length - 1)])
    }
    chips[next].focus()
  }
}

/** Une pastille : le fond de la peinture, ses deux autres couleurs en biais, sa lueur en liseré. */
function swatch(p: ShipPaint): string {
  const [c0, c1, c2] = p.colors
  const glow = p.glow ? `linear-gradient(0deg, ${p.glow} 0 3px, transparent 3px), ` : ''
  return `${glow}linear-gradient(135deg, ${c0} 0 54%, ${c1} 54% 80%, ${c2} 80%)`
}
