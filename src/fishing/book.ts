import { tr } from '../i18n'
import { FISH, FISH_RARITIES, type FishSpecies } from '../../shared/fishing.js'
import type { FishCollection } from './collection'
import { fishPortrait } from './portraits'
import { fishAbout, fishName, RARITY_COLOR, RARITY_NAME } from './species'

/*
 * Le livre des prises, sur son lutrin au bord de l'étang : la collection du joueur. Une case par
 * espèce, rangées par rareté ; une espèce jamais prise n'y est qu'une ombre sans nom. On clique une
 * case pour ouvrir la page de l'espèce, en grand : son portrait, sa rareté, ses prises (nombre,
 * record de taille, première prise) et sa description. De page en page avec les flèches.
 */

/** Les espèces dans l'ordre du livre : par rareté, puis dans l'ordre de la liste. */
const PAGES = FISH_RARITIES.flatMap((rarity) => FISH.filter((f) => f.rarity === rarity))

export class FishBook {
  private root?: HTMLElement
  /** Page ouverte (identifiant de l'espèce), ou null : le sommaire, toutes les cases. */
  private page: string | null = null

  constructor(private collection: FishCollection) {
    const before = collection.onChange
    collection.onChange = () => { before?.(); if (this.root) this.render() }
  }

  get isOpen() { return !!this.root }

  open() {
    if (this.root) return
    this.root = document.createElement('div')
    this.root.className = 'fish-book'
    this.root.setAttribute('role', 'dialog')
    this.root.setAttribute('aria-label', tr('Livre des prises', 'Catch book'))
    // Un clic à côté du livre le referme.
    this.root.onpointerdown = (e) => { if (e.target === this.root) this.close() }
    document.body.append(this.root)
    // Le livre s'ouvre à la page d'une espèce nouvelle, s'il y en a une ; sinon au sommaire.
    this.page = this.collection.fresh[0] ?? null
    this.render()
    void this.collection.load()
  }

  close() {
    if (!this.root) return
    this.root.remove()
    this.root = undefined
    // Les pages nouvelles ont été vues : leur pastille, et le signal du lutrin, s'éteignent.
    this.collection.markSeen()
  }

  /** Touche pressée, livre ouvert : Échap (ou E) revient au sommaire, puis ferme ; les flèches tournent les pages. */
  key(e: KeyboardEvent) {
    if (e.code === 'Escape' || e.code === 'KeyE') {
      if (this.page) this.show(null)
      else this.close()
    } else if (this.page && (e.code === 'ArrowLeft' || e.code === 'KeyA')) this.turn(-1)
    else if (this.page && (e.code === 'ArrowRight' || e.code === 'KeyD')) this.turn(1)
  }

  private show(page: string | null) {
    this.page = page
    this.render()
  }

  private turn(step: number) {
    const i = PAGES.findIndex((f) => f.id === this.page)
    this.show(PAGES[(i + step + PAGES.length) % PAGES.length].id)
  }

  private render() {
    const root = this.root
    if (!root) return
    const { caught, total } = this.collection.progress
    const panel = el('div', 'fish-book-panel')
    const head = el('div', 'fish-book-head')
    const close = button('fish-book-close', tr('Fermer (Échap)', 'Close (Esc)'), () => this.close())
    head.append(el('strong', 'fish-book-title', tr('Livre des prises', 'Catch book')), el('span', 'fish-book-count', tr(`${caught} / ${total} espèces`, `${caught} / ${total} species`)), close)
    const fish = PAGES.find((f) => f.id === this.page)
    if (fish) panel.append(head, this.sheet(fish))
    else {
      const grid = el('div', 'fish-book-grid')
      for (const f of PAGES) grid.append(this.cell(f))
      const hint = caught
        ? tr('Cliquez un poisson pour ouvrir sa page.', 'Click a fish to open its page.')
        : tr('Rien dans le livre pour l\'instant. Le ponton est juste là : lancez votre appât, et ferrez quand le bouchon plonge.', 'Nothing in the book yet. The dock is right there: cast your bait, and strike when the bobber dives.')
      panel.append(head, grid, el('p', 'fish-book-hint', hint))
    }
    root.replaceChildren(panel)
  }

  private cell(fish: FishSpecies): HTMLElement {
    const got = this.collection.caught[fish.id]
    const cell = button('fish-cell' + (got ? '' : ' unknown'), '', () => this.show(fish.id))
    cell.style.setProperty('--rarity', RARITY_COLOR[fish.rarity])
    cell.append(portrait(fish), el('span', 'fish-cell-name', got ? fishName(fish) : '???'))
    if (got) {
      cell.append(el('span', 'fish-cell-count', `×${got.count}`))
      if (this.collection.fresh.includes(fish.id)) cell.append(el('span', 'fish-cell-new', tr('Nouveau', 'New')))
    }
    cell.setAttribute('aria-label', got ? fishName(fish) : tr(`Espèce inconnue (${RARITY_NAME[fish.rarity]})`, `Unknown species (${RARITY_NAME[fish.rarity]})`))
    return cell
  }

  /** La page d'une espèce, en grand. */
  private sheet(fish: FishSpecies): HTMLElement {
    const got = this.collection.caught[fish.id]
    const sheet = el('div', 'fish-sheet' + (got ? '' : ' unknown'))
    sheet.style.setProperty('--rarity', RARITY_COLOR[fish.rarity])
    const picture = el('div', 'fish-sheet-picture')
    picture.append(
      button('fish-sheet-turn', '‹', () => this.turn(-1), tr('Page précédente', 'Previous page')),
      portrait(fish),
      button('fish-sheet-turn', '›', () => this.turn(1), tr('Page suivante', 'Next page')),
    )
    const text = el('div', 'fish-sheet-text')
    const tags = el('div', 'fish-tags')
    tags.append(el('span', 'fish-rarity', RARITY_NAME[fish.rarity]))
    if (got) {
      tags.append(el('span', 'fish-size', tr(`Record : ${got.best} cm`, `Best: ${got.best} cm`)))
      if (this.collection.fresh.includes(fish.id)) tags.append(el('span', 'fish-new', tr('Nouveau', 'New')))
      const since = new Date(got.first * 1000).toLocaleDateString()
      text.append(
        tags, el('strong', 'fish-name', fishName(fish)),
        el('span', 'fish-stats', tr(`${got.count} prise${got.count > 1 ? 's' : ''} · tailles connues : de ${fish.size[0]} à ${fish.size[1]} cm · première prise le ${since}`, `${got.count} caught · known sizes: ${fish.size[0]} to ${fish.size[1]} cm · first caught on ${since}`)),
        el('p', 'fish-about', fishAbout(fish)),
      )
    } else {
      text.append(tags, el('strong', 'fish-name', '???'), el('p', 'fish-about', tr('Une ombre au fond de l\'étang. Personne à bord ne l\'a encore sortie de l\'eau… en tout cas pas vous.', 'A shadow at the bottom of the pond. Nobody aboard has landed it yet… not you, at any rate.')))
    }
    const index = PAGES.indexOf(fish) + 1
    const foot = el('div', 'fish-sheet-foot')
    foot.append(button('fish-book-close', tr('‹ Toutes les espèces', '‹ All species'), () => this.show(null)), el('span', 'fish-book-count', tr(`Page ${index} / ${PAGES.length}`, `Page ${index} / ${PAGES.length}`)))
    sheet.append(picture, text, foot)
    return sheet
  }
}

function el(tag: string, className: string, text = ''): HTMLElement {
  const node = document.createElement(tag)
  node.className = className
  node.textContent = text
  return node
}

function button(className: string, text: string, onClick: () => void, label?: string): HTMLButtonElement {
  const b = el('button', className, text) as HTMLButtonElement
  b.type = 'button'
  b.onclick = onClick
  if (label) { b.title = label; b.setAttribute('aria-label', label) }
  return b
}

function portrait(fish: FishSpecies): HTMLImageElement {
  const img = document.createElement('img')
  img.alt = ''
  img.draggable = false
  img.src = fishPortrait(fish)
  return img
}
