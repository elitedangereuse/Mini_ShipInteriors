import { tr } from '../i18n'
import { FISH, FISH_RARITIES, type FishSpecies } from '../../shared/fishing.js'
import type { FishCollection } from './collection'
import { fishPortrait } from './portraits'
import { fishAbout, fishName, RARITY_COLOR, RARITY_NAME } from './species'

/*
 * Le livre des prises, sur son lutrin au bord de l'étang : la collection du joueur. Une case par
 * espèce, rangées par rareté ; une espèce jamais prise n'y est qu'une ombre sans nom. On clique une
 * case pour lire sa fiche (nombre de prises, record de taille, première prise, description).
 */

export class FishBook {
  private root?: HTMLElement
  private selected: string | null = null

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
    this.selected = FISH.find((f) => this.collection.has(f.id))?.id ?? null
    this.render()
    void this.collection.load()
  }

  close() {
    this.root?.remove()
    this.root = undefined
  }

  private render() {
    const root = this.root
    if (!root) return
    const el = (tag: string, className: string, text = '') => {
      const node = document.createElement(tag)
      node.className = className
      node.textContent = text
      return node
    }
    const { caught, total } = this.collection.progress
    const panel = el('div', 'fish-book-panel')
    const head = el('div', 'fish-book-head')
    const close = el('button', 'fish-book-close', tr('Fermer (Échap)', 'Close (Esc)')) as HTMLButtonElement
    close.type = 'button'
    close.onclick = () => this.close()
    head.append(el('strong', 'fish-book-title', tr('Livre des prises', 'Catch book')), el('span', 'fish-book-count', tr(`${caught} / ${total} espèces`, `${caught} / ${total} species`)), close)
    const grid = el('div', 'fish-book-grid')
    for (const rarity of FISH_RARITIES) {
      for (const fish of FISH.filter((f) => f.rarity === rarity)) grid.append(this.cell(fish))
    }
    panel.append(head, grid, this.detail())
    root.replaceChildren(panel)
  }

  private cell(fish: FishSpecies): HTMLElement {
    const got = this.collection.caught[fish.id]
    const cell = document.createElement('button')
    cell.type = 'button'
    cell.className = 'fish-cell' + (got ? '' : ' unknown') + (this.selected === fish.id ? ' selected' : '')
    cell.style.setProperty('--rarity', RARITY_COLOR[fish.rarity])
    const img = document.createElement('img')
    img.alt = ''
    img.draggable = false
    img.src = fishPortrait(fish)
    const name = document.createElement('span')
    name.className = 'fish-cell-name'
    name.textContent = got ? fishName(fish) : '???'
    cell.append(img, name)
    if (got) {
      const count = document.createElement('span')
      count.className = 'fish-cell-count'
      count.textContent = `×${got.count}`
      cell.append(count)
    }
    cell.setAttribute('aria-label', got ? fishName(fish) : tr(`Espèce inconnue (${RARITY_NAME[fish.rarity]})`, `Unknown species (${RARITY_NAME[fish.rarity]})`))
    cell.onclick = () => { this.selected = fish.id; this.render() }
    return cell
  }

  /** La fiche de l'espèce choisie. */
  private detail(): HTMLElement {
    const box = document.createElement('div')
    box.className = 'fish-book-detail'
    const fish = FISH.find((f) => f.id === this.selected)
    const line = (className: string, text: string) => {
      const node = document.createElement(className === 'fish-about' ? 'p' : 'span')
      node.className = className
      node.textContent = text
      box.append(node)
    }
    if (!fish) {
      line('fish-about', tr('Rien dans le livre pour l\'instant. Le ponton est juste là : lancez votre appât, et ferrez quand le bouchon plonge.', 'Nothing in the book yet. The dock is right there: cast your bait, and strike when the bobber dives.'))
      return box
    }
    box.style.setProperty('--rarity', RARITY_COLOR[fish.rarity])
    const got = this.collection.caught[fish.id]
    line('fish-rarity', RARITY_NAME[fish.rarity])
    if (!got) {
      line('fish-name', '???')
      line('fish-about', tr('Une ombre au fond de l\'étang. Personne à bord ne l\'a encore sortie de l\'eau… en tout cas pas vous.', 'A shadow at the bottom of the pond. Nobody aboard has landed it yet… not you, at any rate.'))
      return box
    }
    line('fish-name', fishName(fish))
    const since = new Date(got.first * 1000).toLocaleDateString()
    line('fish-stats', tr(`${got.count} prise${got.count > 1 ? 's' : ''} · record : ${got.best} cm · première prise le ${since}`, `${got.count} caught · best: ${got.best} cm · first caught on ${since}`))
    line('fish-about', fishAbout(fish))
    return box
  }
}
