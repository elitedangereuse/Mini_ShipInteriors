import { shipCatalog, silhouetteRects, type EdShipEntry, type EdShipId } from './ed-ships'
import { EN, tr } from './i18n'
import { Modal } from './salvage/ui'
import { BAY_SCALE, bayScale } from './ship-bay'

/*
 * Le registre du hangar (l'écran mural du mur sud, cf. levels.ts) : on y choisit son vaisseau parmi
 * ceux d'Elite Dangerous (cf. ed-ships.ts), du plus petit au plus grand. Chacun a sa fiche : sa
 * silhouette vue de dessus, son nom, son constructeur, sa longueur ; ceux qui ne tiennent pas dans
 * le hangar à l'échelle commune y sont réduits (cf. ship-bay.ts), et la fiche le dit.
 */
export class ShipPicker extends Modal {
  /** Un vaisseau choisi (pas celui qui est déjà posé). */
  onPick?: (id: EdShipId) => void
  private current: EdShipId | null = null
  private readonly grid = document.createElement('div')
  private readonly status = document.createElement('p')

  constructor() {
    super(tr('REGISTRE · HANGAR 01', 'REGISTRY · HANGAR 01'), tr('Mon vaisseau', 'My ship'))
    this.root.classList.add('ship-picker')
    const intro = document.createElement('p')
    intro.className = 'salvage-intro'
    intro.textContent = tr(
      'Le vaisseau posé sur le pad, celui que vous pilotez jusqu\'à la base au sol. Chacun voit le sien.',
      'The ship parked on the pad, the one you fly down to the ground base. Everyone sees their own.',
    )
    this.grid.className = 'ship-picker-grid'
    this.grid.setAttribute('role', 'group')
    this.grid.setAttribute('aria-label', tr('Vaisseaux', 'Ships'))
    this.status.className = 'salvage-note'
    this.status.setAttribute('aria-live', 'polite')
    this.body.append(intro, this.grid, this.status)
  }

  /** Ouvre le registre, le vaisseau posé en surbrillance. */
  async open(current: EdShipId) {
    this.current = current
    this.show()
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

  /** Le vaisseau posé : sa fiche est marquée, et a le focus. */
  private mark() {
    for (const b of this.grid.querySelectorAll<HTMLButtonElement>('.ship-card')) {
      const on = b.dataset.ship === this.current
      b.setAttribute('aria-pressed', String(on))
      if (on && this.isOpen) b.focus({ preventScroll: false })
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
}
