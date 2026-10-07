import * as THREE from 'three'
import type { Sound } from '../audio'
import type { IsoCamera } from '../camera'
import { formatCredits, itemPrice } from '../economy/data'
import type { Wallet } from '../economy/wallet'
import { RULES } from '../gardening/data'
import type { GardenStore } from '../gardening/store'
import { unlockHarvests } from '../../shared/gardening.js'
import { QUEST_UNLOCKS } from '../../shared/quests.js'
import { questContent } from '../quests/content'
import { EN, tr } from '../i18n'
import { icon } from '../icons'
import type { Rot } from '../levels'
import { DIRS } from '../map'
import { $ } from '../ui'
import { CATALOG, CATEGORIES, entryOf, joinVariant, splitVariant, type CatalogEntry, type CategoryId } from './catalog'
import { cloneItems, DEFAULT_CABIN, sameItems, type CabinItem, type CabinLayout } from './layout'
import { furnitureCount, refusal, ridersOf, surfacesOf, type Surface } from './rules'
import { MAX_HOME_ITEMS } from '../../shared/housing-home.js'
import { thumbnail } from './thumbs'
import { artChoice } from './art-choice'
import { rotateLocal, type CabinView, type WallLine } from './view'

/*
 * Mode aménagement : sur sa parcelle, le CMDR pose, déplace, tourne et retire meubles et
 * objets (murs, papier peint, sol et taille se règlent en mode construction, cf.
 * housing/builder.ts). À la souris : clic pour choisir,
 * glisser pour déplacer, une carte du catalogue pour poser un nouvel objet (clic, ou
 * glisser-déposer). Au clavier : R pour tourner, Suppr pour retirer, flèches pour ajuster,
 * Ctrl+Z pour annuler, Échap pour finir. Chaque changement passe par les règles de pose
 * (rules.ts) ; main.ts l'enregistre et le montre aux invités.
 *
 * Les objets payants se débloquent une fois en crédits (cf. economy/) et peuvent ensuite être
 * posés plusieurs fois. Le mobilier d'origine reste offert et disponible en quantité limitée.
 * Quelques objets ne s'achètent pas : une quête du bord les offre (cf. shared/quests.js).
 */

/** Pas de la grille de pose, et distance à laquelle un meuble se colle à un mur. */
const SNAP = 0.05
const SNAP_TOP = 0.02
const MAGNET = 0.12
const HISTORY = 60
/** Vue plongeante (vue d'architecte). */
export const EDIT_ELEVATION = THREE.MathUtils.degToRad(56)
/** Écran étroit : le catalogue est une feuille en bas, sur 38 % de la hauteur (cf. style.css). */
const NARROW = 720
const SHEET = 0.38
/** L'objet en main se soulève un peu : on voit qu'il est « pris ». */
const LIFT = 0.05

export interface EditorHost {
  canvas: HTMLCanvasElement
  iso: IsoCamera
  sound: Sound
  /** Le mobilier a changé : à enregistrer et à montrer aux invités. */
  onChange: (layout: CabinLayout) => void
  /** Le joueur quitte le mode aménagement (Terminer, Échap). */
  onClose: () => void
  /** Crédits du CMDR : les objets du catalogue se débloquent une fois. */
  wallet: Wallet
  /** Jardin du CMDR : ses récoltes débloquent les arbres, les haies et les arbustes de l'extérieur. */
  garden: GardenStore
  /** Passer au mode construction (murs, revêtements, taille de la parcelle, cf. housing/builder.ts). */
  build: () => void
}

/** Objet en main : un objet de la cabine qu'on déplace, ou un nouvel objet du catalogue. */
interface Held {
  /** Index dans l'aménagement ; -1 : nouvel objet, pas encore posé. */
  index: number
  item: CabinItem
  entry: CatalogEntry
  /** Aperçu d'un nouvel objet. */
  ghost?: THREE.Group
  /** Décalage entre le curseur et l'objet, pris au moment de le saisir. */
  grab: { x: number; z: number }
  /** Objets posés dessus, qui le suivent. */
  riders: { index: number; dx: number; dz: number; dy: number; r: Rot }[]
  /** Orientation de départ (les objets posés dessus tournent avec lui). */
  r0: Rot
  refusal: string | null
  /** A-t-on visé un endroit (sinon, l'objet n'a pas encore suivi le curseur) ? */
  aimed: boolean
}

/** Le mobilier d'origine des quartiers est offert : exemplaires de chaque objet. */
const FREE = new Map<string, number>()
for (const it of DEFAULT_CABIN) FREE.set(it.m, (FREE.get(it.m) ?? 0) + 1)

const snap = (v: number, step = SNAP) => Math.round(Math.round(v / step) * step * 1000) / 1000
const round3 = (v: number) => Math.round(v * 1000) / 1000

export class CabinEditor {
  /** Mobilier en cours d'édition. */
  items: CabinItem[] = []
  private open = false
  private past: CabinItem[][] = []
  private future: CabinItem[][] = []
  private selected = -1
  private hovered = -1
  private held: Held | null = null
  /** Clic sur un objet, qui devient un déplacement si l'on glisse. */
  private press: { index: number; x: number; y: number } | null = null
  /** Nouvel objet saisi sur une carte du catalogue : on le pose en relâchant au-dessus de la cabine. */
  private placeOnRelease = false
  /** Bouton enfoncé avec un sol en main (`grid` du catalogue) : chaque tuile survolée en reçoit un. */
  private painting = false
  private lastPointer: { clientX: number; clientY: number } | null = null
  private pointerDirty = false
  /** Dernier petit pas au clavier : les suivants, sur le même objet, s'y ajoutent dans l'historique. */
  private lastNudge: { index: number; at: number } | null = null
  private category: CategoryId = 'rest'
  /** Déblocage en cours : l'objet, la réponse attendue du site, un refus. */
  private buying: { entry: CatalogEntry; pending: boolean; error: string } | null = null
  /** Étiquette de déblocage ou de stock offert de chaque carte affichée. */
  private cardTags = new Map<string, { card: HTMLElement; tag: HTMLElement; entry: CatalogEntry }>()

  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()
  private readonly plane = new THREE.Plane()
  private readonly hit = new THREE.Vector3()
  private readonly tmpBox = new THREE.Box3()
  // Repères visuels : empreinte (verte ou rouge), cadres de survol et de sélection, grille.
  private readonly footprint: THREE.Mesh
  private readonly hoverBox = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('#bff3ff'))
  private readonly selectBox = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('#59d8ff'))
  private readonly heldBox = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('#7dffa8'))
  private grid: THREE.Group
  private readonly helpers = new THREE.Group()

  // Interface.
  private readonly root = $('editor')
  private readonly bar: HTMLElement
  private readonly countEl: HTMLElement
  private readonly balanceEl: HTMLElement
  private readonly saveEl: HTMLElement
  private readonly buyEl: HTMLElement
  private readonly undoBtn: HTMLButtonElement
  private readonly redoBtn: HTMLButtonElement
  private readonly modes: HTMLElement
  private readonly tabs: HTMLElement
  private readonly cards: HTMLElement
  private readonly tools: HTMLElement
  private readonly hint: HTMLElement
  private readonly status: HTMLElement
  private readonly keysEl: HTMLElement
  private readonly toastEl: HTMLElement
  private toastTimer = 0

  constructor(
    private view: CabinView,
    private host: EditorHost,
  ) {
    this.footprint = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: '#7dffa8', transparent: true, opacity: 0.3, depthWrite: false, depthTest: false, side: THREE.DoubleSide }),
    )
    // Par-dessus tout : l'empreinte teinte aussi l'objet en main, en vert ou en rouge.
    this.footprint.renderOrder = 5
    for (const h of [this.hoverBox, this.selectBox, this.heldBox]) {
      ;(h.material as THREE.LineBasicMaterial).transparent = true
      ;(h.material as THREE.LineBasicMaterial).depthTest = false
      h.renderOrder = 3
    }
    ;(this.hoverBox.material as THREE.LineBasicMaterial).opacity = 0.55
    this.grid = this.makeGrid()
    this.heldBox.visible = false
    this.helpers.add(this.footprint, this.hoverBox, this.selectBox, this.heldBox, this.grid)
    this.helpers.visible = false
    view.group.add(this.helpers)

    // Barre du haut : compteur, annuler, rétablir, terminer.
    const bar = (this.bar = document.createElement('div'))
    bar.className = 'panel ed-bar'
    const title = document.createElement('div')
    title.className = 'ed-title'
    title.textContent = tr('Aménagement des quartiers', 'Decorating your quarters')
    this.countEl = document.createElement('div')
    this.countEl.className = 'ed-count'
    this.saveEl = document.createElement('div')
    this.saveEl.className = 'ed-save'
    this.balanceEl = document.createElement('div')
    this.balanceEl.className = 'ed-balance'
    const button = (label: string, glyph: Parameters<typeof icon>[0], onClick: () => void, cls = '') => {
      const b = document.createElement('button')
      b.className = cls
      b.title = label
      b.append(icon(glyph), document.createTextNode(label))
      b.onclick = onClick
      return b
    }
    this.undoBtn = button(tr('Annuler', 'Undo'), 'arrow-u-up-left', () => this.undo())
    this.undoBtn.title = tr('Annuler (Ctrl+Z)', 'Undo (Ctrl+Z)')
    this.redoBtn = button(tr('Rétablir', 'Redo'), 'arrow-u-up-right', () => this.redo())
    this.redoBtn.title = tr('Rétablir (Ctrl+Y)', 'Redo (Ctrl+Y)')
    const done = button(tr('Terminer', 'Done'), 'check', () => this.host.onClose(), 'ed-done')
    done.title = tr('Terminer (Échap)', 'Done (Esc)')
    const info = document.createElement('div')
    info.className = 'ed-info'
    info.append(title, this.countEl, this.balanceEl, this.saveEl)
    const actions = document.createElement('div')
    actions.className = 'ed-actions'
    actions.append(this.undoBtn, this.redoBtn, done)
    bar.append(info, actions)

    // Catalogue : le mobilier (onglets par catégorie, cartes avec vignette), et de quoi passer en construction.
    const catalog = document.createElement('div')
    catalog.className = 'panel ed-catalog'
    this.modes = document.createElement('div')
    this.modes.className = 'ed-modes'
    const furniture = document.createElement('button')
    furniture.className = 'active'
    furniture.title = tr('Mobilier', 'Furniture')
    furniture.append(icon('couch'), document.createTextNode(furniture.title))
    const build = document.createElement('button')
    build.title = tr('Construction : murs, papier peint, sol', 'Building: walls, wallpaper, floor')
    build.append(icon('wall'), document.createTextNode(tr('Construction', 'Building')))
    build.onclick = () => host.build()
    this.modes.append(furniture, build)
    this.tabs = document.createElement('div')
    this.tabs.className = 'ed-tabs'
    this.cards = document.createElement('div')
    this.cards.className = 'ed-cards'
    // Déblocage d'un objet : en bas du catalogue, sous les cartes.
    this.buyEl = document.createElement('div')
    this.buyEl.className = 'ed-buy'
    this.buyEl.hidden = true
    catalog.append(this.modes, this.tabs, this.cards, this.buyEl)
    for (const c of CATEGORIES) {
      const b = document.createElement('button')
      b.title = c.label
      b.setAttribute('aria-label', c.label)
      b.dataset.cat = c.id
      b.append(icon(c.icon))
      b.onclick = () => this.showCategory(c.id)
      this.tabs.appendChild(b)
    }
    // Molette sur le catalogue : il défile, le zoom de la caméra ne bouge pas.
    catalog.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true })

    // Outils de l'objet choisi, en bas de l'écran (ils ne masquent jamais la cabine là où l'on clique).
    this.tools = document.createElement('div')
    this.tools.className = 'panel ed-tools'
    this.tools.hidden = true

    this.hint = document.createElement('div')
    this.hint.className = 'ed-hint'
    this.status = document.createElement('span')
    this.status.className = 'ed-status'
    this.keysEl = document.createElement('span')
    this.hint.append(this.status, this.keysEl)
    this.toastEl = document.createElement('div')
    this.toastEl.className = 'ed-toast'
    this.toastEl.hidden = true
    this.root.append(bar, catalog, this.tools, this.hint, this.toastEl)
    for (const el of [bar, catalog, this.tools]) el.addEventListener('pointerdown', (e) => e.stopPropagation())

    // Solde, stock et achat suivent les crédits (achat fait, réponse du site…).
    host.wallet.subscribe(() => {
      if (!this.open) return
      this.renderBalance()
      this.refreshCards()
      this.renderBuy()
    })
    // Une récolte de plus peut ouvrir un arbre ou une haie.
    host.garden.subscribe(() => {
      if (!this.open) return
      this.refreshCards()
      this.renderBuy()
    })

    // Carte saisie, relâchée au-dessus de la cabine : l'objet est posé là.
    addEventListener('pointerup', (e) => {
      if (!this.placeOnRelease) return
      this.placeOnRelease = false
      if (e.target === this.host.canvas && this.held?.index === -1) {
        this.aimAt(e)
        this.place(e.shiftKey)
      }
    })
    addEventListener('pointerup', () => (this.painting = false))
    addEventListener('blur', () => (this.painting = false))
  }

  get active(): boolean {
    return this.open
  }

  /**
   * Zone de l'écran où l'on voit la cabine, en pixels, et le décalage de son centre par rapport
   * au centre de l'écran : à droite, le catalogue ; sur écran étroit, la barre en haut et le
   * catalogue en bas.
   */
  private visible(): { w: number; h: number; dx: number; dy: number } {
    if (innerWidth > NARROW) {
      const panel = Math.min(360, innerWidth * 0.3)
      return { w: innerWidth - panel, h: innerHeight, dx: panel / 2, dy: 0 }
    }
    const top = this.bar.getBoundingClientRect().bottom + 8
    const bottom = innerHeight * (1 - SHEET) - 8
    return { w: innerWidth, h: Math.max(80, bottom - top), dx: 0, dy: innerHeight / 2 - (top + bottom) / 2 }
  }

  /**
   * Zoom qui fait tenir toute la cabine dans la zone visible, autour de ce point (le joueur),
   * en vue plongeante et sous les quatre vues isométriques.
   */
  fitZoom(center: THREE.Vector3): number {
    const b = this.view.bounds
    const v = this.visible()
    const s = Math.sin(EDIT_ELEVATION), c = Math.cos(EDIT_ELEVATION)
    let wide = 0, tall = 0
    for (let q = 0; q < 4; q++) {
      const a = Math.PI / 4 + (q * Math.PI) / 2
      for (const x of [b.minX, b.maxX]) {
        for (const z of [b.minZ, b.maxZ]) {
          const dx = x - center.x, dz = z - center.z
          wide = Math.max(wide, Math.abs(dx * Math.cos(a) - dz * Math.sin(a)))
          // Le sol s'éloigne en remontant l'écran ; la caméra vise 0,4 au-dessus, et les murs font une tuile.
          const away = -(dx * Math.sin(a) + dz * Math.cos(a)) * s
          tall = Math.max(tall, Math.abs(away - 0.4 * c), Math.abs(away + 0.6 * c))
        }
      }
    }
    return 1.12 * Math.max((wide * innerHeight) / v.w, (tall * innerHeight) / v.h)
  }

  /**
   * Toute la cabine à l'écran, autour du joueur : sur un téléphone, joueur dans un coin, on dézoome
   * plus loin que d'habitude (cf. closeEditor, qui remet la limite).
   */
  reframe(center: THREE.Vector3 = this.host.iso.target) {
    const iso = this.host.iso
    const z = this.fitZoom(center)
    iso.zoomMax = Math.max(iso.zoomMax, z)
    iso.zoomTo(z)
  }

  /** Le joueur au milieu de la zone que le catalogue laisse visible. */
  frameCamera() {
    const v = this.visible()
    this.host.iso.frameCenter(v.dx, v.dy, innerHeight)
  }

  // ---------------------------------------------------------------- ouverture

  start(layout: CabinLayout) {
    this.items = cloneItems(layout.items)
    this.refreshGrid()
    this.past = []
    this.future = []
    this.selected = this.hovered = -1
    this.held = null
    this.press = null
    this.lastNudge = null
    this.open = true
    this.root.hidden = false
    this.helpers.visible = true
    this.showCategory(this.category)
    this.renderBar()
    this.renderBalance()
    this.renderTools()
    this.setHint()
  }

  stop() {
    if (!this.open) return
    this.closeBuy()
    this.cancelHeld()
    this.open = false
    this.root.hidden = true
    this.helpers.visible = false
    this.tools.hidden = true
    this.selected = this.hovered = -1
    this.view.detach([])
  }

  /** Enregistrement de l'aménagement : en cours, fait, ou en échec. */
  setSaveState(state: 'saving' | 'saved' | 'error' | 'local') {
    this.saveEl.replaceChildren()
    const text = {
      saving: tr('Enregistrement…', 'Saving…'),
      saved: tr('Enregistré', 'Saved'),
      error: tr('Non enregistré : site injoignable', 'Not saved: site unreachable'),
      local: tr('Enregistré sur cet appareil', 'Saved on this device'),
    }[state]
    this.saveEl.className = `ed-save ${state}`
    this.saveEl.append(icon(state === 'error' ? 'cloud-slash' : 'cloud-check'), document.createTextNode(text))
  }

  /** Objets au plus, selon la taille de la parcelle. */
  private get capacity(): number {
    return this.view.capacity
  }

  // ---------------------------------------------------------------- catalogue

  private showCategory(id: CategoryId) {
    this.category = id
    for (const b of this.tabs.children) (b as HTMLElement).classList.toggle('active', (b as HTMLElement).dataset.cat === id)
    this.cards.replaceChildren()
    const title = document.createElement('div')
    title.className = 'ed-cat-title'
    title.textContent = CATEGORIES.find((c) => c.id === id)?.label ?? ''
    this.cards.appendChild(title)
    this.cardTags.clear()
    for (const entry of CATALOG.filter((e) => e.category === id)) {
      if (entry.model === 'site-art' && !entry.variants?.length) continue
      const card = document.createElement('button')
      card.className = 'ed-card'
      card.title = `${entry.name}${entry.mount === 'wall' ? tr(' (à accrocher)', ' (hangs on a wall)') : entry.mount === 'top' ? tr(' (se pose sur un meuble)', ' (goes on furniture)') : ''}`
      const img = document.createElement('img')
      img.alt = ''
      img.draggable = false
      thumbnail(entry, entry.variants?.[0]?.id, (url) => {
        if (url) img.src = url
      })
      const name = document.createElement('span')
      name.textContent = entry.name
      const tag = document.createElement('span')
      tag.className = 'ed-card-tag'
      card.append(img, name, tag)
      // À la souris, on saisit la carte (clic, ou glisser-déposer dans la cabine) ; au doigt,
      // glisser fait défiler le catalogue, et toucher une carte la prend en main. Sans
      // exemplaire d'origine disponible, sinon la carte ouvre le déblocage.
      card.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.pointerType !== 'mouse') return
        e.preventDefault()
        if (this.stock(entry.id) <= 0) return this.openBuy(entry)
        this.startPlacing(entry)
        this.placeOnRelease = true
      })
      card.addEventListener('click', (e) => {
        if ((e as PointerEvent).pointerType !== 'mouse') this.startPlacing(entry)
      })
      this.cards.appendChild(card)
      this.cardTags.set(entry.id, { card, tag, entry })
    }
    this.refreshCards()
  }

  // ---------------------------------------------------------------- crédits

  /** Objets débloqués sans limite ; les exemplaires d'origine restent comptés séparément. */
  private stock(id: string): number {
    if (itemPrice(id) === null) return Infinity
    if (this.host.wallet.items.has(id)) return Infinity
    let placed = 0
    for (const it of this.items) if (it.m === id) placed++
    return (FREE.get(id) ?? 0) - placed
  }

  /**
   * Récoltes qui manquent au CMDR pour acheter cet objet (cf. `gardening.unlocks` de l'économie) ;
   * 0 s'il ne se gagne pas au jardinage, s'il est déjà débloqué, ou si le compte y est.
   */
  private harvestsShort(id: string): number {
    const needed = unlockHarvests(RULES, id)
    if (!needed || this.host.wallet.items.has(id)) return 0
    return Math.max(0, needed - (this.host.garden.garden.harvests ?? 0))
  }

  /**
   * Quête qui offre cet objet, s'il ne s'achète pas et que le CMDR ne l'a pas encore (cf.
   * QUEST_UNLOCKS) ; null sinon.
   */
  private questFor(id: string): string | null {
    const quest = QUEST_UNLOCKS[id]
    return quest && !this.host.wallet.items.has(id) ? quest : null
  }

  /** Étiquettes des cartes : déblocage, stock offert, ou prix (grisé si le solde est insuffisant). */
  private refreshCards() {
    const { wallet } = this.host
    for (const { card, tag, entry } of this.cardTags.values()) {
      const stock = this.stock(entry.id)
      const price = itemPrice(entry.id)
      const unlocked = price !== null && wallet.items.has(entry.id)
      const inStock = stock > 0
      // À gagner au jardinage : le nombre de récoltes demandé, à la place du prix.
      const needed = unlockHarvests(RULES, entry.id)
      const short = inStock ? 0 : this.harvestsShort(entry.id)
      // À gagner par une quête : ni prix, ni achat.
      const quest = inStock ? null : this.questFor(entry.id)
      tag.textContent = unlocked
        ? tr('Débloqué', 'Unlocked')
        : !Number.isFinite(stock)
          ? ''
          : inStock
            ? tr(`${stock} offert${stock > 1 ? 's' : ''}`, `${stock} free`)
            : quest ? tr('Quête', 'Quest')
            : short ? tr(`${needed} récolte${needed > 1 ? 's' : ''}`, `${needed} harvest${needed > 1 ? 's' : ''}`)
              : price === null ? '' : formatCredits(price)
      tag.classList.toggle('stock', inStock)
      card.classList.toggle('garden-locked', short > 0)
      card.classList.toggle('quest-locked', !!quest)
      card.classList.toggle('poor', short > 0 || !!quest || (!inStock && !unlocked && wallet.ready && price !== null && price > wallet.balance))
      const mount = entry.mount === 'wall' ? tr(' (à accrocher)', ' (hangs on a wall)') : entry.mount === 'top' ? tr(' (se pose sur un meuble)', ' (goes on furniture)') : ''
      const state = unlocked
        ? tr(' · Débloqué : posez-en autant que vous voulez', ' · Unlocked: place as many as you like')
        : price === null || inStock
          ? price !== null ? tr(` · ${stock} exemplaire${stock > 1 ? 's' : ''} offert${stock > 1 ? 's' : ''} · déblocage ${formatCredits(price)}`, ` · ${stock} free ${stock === 1 ? 'copy' : 'copies'} · unlock ${formatCredits(price)}`) : ''
          : quest
            ? tr(' · Se gagne à bord, au bout d\'une quête', ' · Earned aboard, at the end of a quest')
          : short
            ? tr(` · Se gagne au jardinage : ${needed} récoltes (encore ${short})`, ` · Earned by gardening: ${needed} harvests (${short} to go)`)
            : tr(` · Débloquer pour ${formatCredits(price)}`, ` · Unlock for ${formatCredits(price)}`)
      card.title = `${entry.name}${mount}${state}`
    }
  }

  private renderBalance() {
    const { wallet } = this.host
    this.balanceEl.replaceChildren(icon('coins'), document.createTextNode(wallet.ready ? formatCredits(wallet.balance) : tr('Crédits indisponibles', 'Credits unavailable')))
    this.balanceEl.classList.toggle('offline', !wallet.ready)
  }

  /** Ouvre le déblocage d'un objet (en bas du catalogue). */
  private openBuy(entry: CatalogEntry) {
    this.cancelHeld()
    this.buying = { entry, pending: false, error: '' }
    this.host.sound.ui('pick')
    this.renderBuy()
  }

  private closeBuy() {
    if (!this.buying) return
    this.buying = null
    this.renderBuy()
  }

  private renderBuy() {
    const b = this.buying
    this.buyEl.hidden = !b
    if (!b) return
    const { wallet } = this.host
    const price = itemPrice(b.entry.id) ?? 0
    this.buyEl.replaceChildren()

    const head = document.createElement('div')
    head.className = 'eb-head'
    const img = document.createElement('img')
    img.alt = ''
    img.draggable = false
    thumbnail(b.entry, b.entry.variants?.[0]?.id, (url) => {
      if (url) img.src = url
    })
    const what = document.createElement('div')
    const name = document.createElement('div')
    name.className = 'eb-name'
    name.textContent = b.entry.name
    const unit = document.createElement('div')
    unit.className = 'eb-unit'
    unit.textContent = tr(`Déblocage · ${formatCredits(price)}`, `Unlock · ${formatCredits(price)}`)
    what.append(name, unit)
    const close = document.createElement('button')
    close.className = 'eb-close'
    close.title = tr('Fermer (Échap)', 'Close (Esc)')
    close.append(icon('x'))
    close.onclick = () => this.closeBuy()
    head.append(img, what, close)

    const note = document.createElement('div')
    note.className = 'eb-note'
    const short = wallet.ready && price > wallet.balance
    const needed = unlockHarvests(RULES, b.entry.id), harvests = this.harvestsShort(b.entry.id)
    const quest = this.questFor(b.entry.id)
    if (b.error) {
      note.textContent = b.error
      note.classList.add('error')
    } else if (quest) {
      // Le titre de la quête n'est dit que si elle est connue du jeu : c'est à bord qu'on la trouve.
      const title = questContent(quest)?.title
      note.textContent = title
        ? tr(`Cet objet ne s'achète pas : il se gagne à bord, au bout de la quête « ${title} ».`, `This item can't be bought: it is earned aboard, at the end of the quest “${title}”.`)
        : tr('Cet objet ne s\'achète pas : il se gagne à bord, au bout d\'une quête.', 'This item can\'t be bought: it is earned aboard, at the end of a quest.')
      note.classList.add('error')
    } else if (harvests) {
      const done = needed - harvests
      note.textContent = tr(
        `Capucine ne le confie qu'aux jardiniers : ${needed} récoltes à faire sur vos tuiles de terre, vous en êtes à ${done}. Encore ${harvests}.`,
        `Capucine only entrusts it to gardeners: ${needed} harvests from your plots of soil, you have made ${done}. ${harvests} to go.`,
      )
      note.classList.add('error')
    } else if (wallet.state === 'offline') {
      note.textContent = tr('Boutique indisponible : le site ne répond pas.', 'Shop unavailable: the site isn\'t responding.')
      note.classList.add('error')
    } else if (!wallet.ready) note.textContent = tr('Chargement de vos crédits…', 'Loading your credits…')
    else if (short) {
      note.textContent = tr(
        `Il vous manque ${formatCredits(price - wallet.balance)}. Les tâches de bord et les bornes d'arcade en rapportent.`,
        `You're ${formatCredits(price - wallet.balance)} short. Ship chores and the arcade cabinets pay.`,
      )
      note.classList.add('error')
    } else note.textContent = tr(
      `Débloquez cet objet une fois, puis posez-en autant que vous voulez. Solde après : ${formatCredits(wallet.balance - price)}`,
      `Unlock this item once, then place as many as you like. Balance after: ${formatCredits(wallet.balance - price)}`,
    )

    const buy = document.createElement('button')
    buy.className = 'eb-buy'
    buy.append(icon('lock-simple'), document.createTextNode(b.pending ? tr('Déblocage…', 'Unlocking…') : tr('Débloquer', 'Unlock')))
    buy.disabled = b.pending || !wallet.ready || short || harvests > 0 || !!quest
    buy.onclick = () => void this.confirmBuy()
    this.buyEl.append(head, note, buy)
  }

  /** Débloque l'objet ; il passe en main et peut désormais être posé librement. */
  private async confirmBuy() {
    const b = this.buying
    if (!b || b.pending) return
    b.pending = true
    b.error = ''
    this.renderBuy()
    const result = await this.host.wallet.buyItem(b.entry.id)
    if (this.buying !== b) return
    b.pending = false
    if (!result.ok) {
      this.host.sound.ui('deny')
      b.error = {
        funds: tr('Crédits insuffisants.', 'Not enough credits.'),
        owned: tr('Cet objet est déjà débloqué. Cliquez sur sa carte pour le poser.', 'This item is already unlocked. Click its card to place it.'),
        max: tr('Cet objet est déjà débloqué.', 'This item is already unlocked.'),
        guest: tr('Achats réservés aux CMDR connectés au site.', 'Only CMDRs logged in to the site can buy.'),
        garden: tr('Il vous manque des récoltes : cet objet se gagne au jardinage.', 'You are short of harvests: this item is earned by gardening.'),
        quest: tr('Cet objet ne s\'achète pas : une quête du bord l\'offre.', 'This item can\'t be bought: a quest aboard awards it.'),
      }[result.reason as 'funds' | 'max' | 'owned' | 'guest' | 'garden' | 'quest'] ?? tr('Déblocage non abouti : le site ne répond pas. Réessayez.', 'Unlock failed: the site isn\'t responding. Try again.')
      return this.renderBuy()
    }
    const price = itemPrice(b.entry.id) ?? 0
    this.buying = null
    this.renderBuy()
    this.host.sound.credits()
    this.toast(tr(`${b.entry.name} débloqué · ${formatCredits(price)}. Cliquez dans la cabine pour le poser, autant de fois que vous voulez.`, `${b.entry.name} unlocked · ${formatCredits(price)}. Click in your quarters to place it as many times as you like.`))
    this.startPlacing(b.entry)
  }

  private startPlacing(entry: CatalogEntry) {
    this.cancelHeld()
    if (entry.grid ? this.items.length >= MAX_HOME_ITEMS : furnitureCount(this.items) >= this.capacity) return this.refuse(tr(`Cabine pleine : ${this.capacity} objets au plus`, `Quarters full: ${this.capacity} items at most`))
    // Variantes à gagner : rien à poser tant qu'on n'en possède aucune (le trophée de pêche).
    const first = entry.owned ? entry.variants?.find((v) => entry.owned!(v.id)) : entry.variants?.[0]
    if (entry.owned && !first) return this.refuse(entry.locked ?? '')
    if (this.stock(entry.id) <= 0) return this.openBuy(entry)
    this.closeBuy()
    const item: CabinItem = { m: entry.id, x: this.view.center.x, z: this.view.center.z, r: 0, s: Math.floor(Math.random() * 100000) }
    if (first) item.v = first.id
    const ghost = this.view.makeGhost(item)
    if (!ghost) return
    ghost.visible = false
    this.held = { index: -1, item, entry, ghost, grab: { x: 0, z: 0 }, riders: [], r0: 0, refusal: null, aimed: false }
    this.selected = -1
    this.renderTools()
    this.host.sound.ui('pick')
    this.setHint()
    if (this.lastPointer) this.aimAt(this.lastPointer)
  }

  /** Le quadrillage suit les pièces affichées. */
  private refreshGrid() {
    this.grid.removeFromParent()
    for (const m of this.grid.children) (m as THREE.Mesh).geometry.dispose()
    this.grid = this.makeGrid()
    this.helpers.add(this.grid)
  }

  // ---------------------------------------------------------------- souris

  pointerDown(e: PointerEvent) {
    this.lastPointer = e
    if (e.button !== 0) return
    // Un objet déjà en main (relâché hors de la fenêtre…) se pose là, comme un nouvel objet.
    if (this.held) {
      this.aimAt(e)
      // Un sol se pose d'un trait : tant que le bouton reste enfoncé, les tuiles survolées suivent.
      this.painting = this.held.index === -1 && !!this.held.entry.grid
      return this.held.index === -1 ? this.place(e.shiftKey) : this.drop()
    }
    const index = this.view.pickItem(this.ray(e))
    this.select(index)
    this.press = index >= 0 ? { index, x: e.clientX, y: e.clientY } : null
  }

  pointerMove(e: PointerEvent) {
    this.lastPointer = e
    this.pointerDirty = true
    if (this.press && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > 5) {
      const { index, x, y } = this.press
      this.press = null
      // L'objet est pris là où l'on a cliqué : il ne saute pas de la distance déjà parcourue.
      this.grabItem(index, { clientX: x, clientY: y })
    }
  }

  pointerUp(e: PointerEvent) {
    this.press = null
    if (this.held && this.held.index >= 0) {
      this.aimAt(e)
      this.drop()
    }
  }

  /** Geste interrompu (un second doigt prend la caméra) : l'objet qu'on déplaçait retourne à sa place. */
  pointerCancel() {
    this.press = null
    this.painting = false
    if (this.held && this.held.index >= 0) this.cancelHeld()
  }

  private ray(e: { clientX: number; clientY: number }): THREE.Raycaster {
    this.pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.host.iso.camera)
    return this.raycaster
  }

  /** Point (coordonnées du pont) du plan horizontal de hauteur y sous le curseur. */
  private atHeight(ray: THREE.Ray, y: number): THREE.Vector3 | null {
    this.plane.set(new THREE.Vector3(0, 1, 0), -(this.view.deck.y + y))
    const p = ray.intersectPlane(this.plane, this.hit)
    return p ? p.setY(y) : null
  }

  /** Pan de mur de la cabine visé par le curseur (le plus proche de la caméra). */
  private wallAt(ray: THREE.Ray): { wall: WallLine; along: number } | null {
    const b = this.view.bounds
    let best: { wall: WallLine; along: number; t: number } | null = null
    for (const wall of this.view.walls) {
      const alongX = DIRS[wall.dir].dz !== 0
      this.plane.set(alongX ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0), -wall.face)
      const p = ray.intersectPlane(this.plane, this.hit)
      if (!p) continue
      const y = p.y - this.view.deck.y
      const along = alongX ? p.x : p.z
      if (y < 0.05 || y > 1.05 || along < (alongX ? b.minX : b.minZ) - 0.2 || along > (alongX ? b.maxX : b.maxZ) + 0.2) continue
      // Seulement là où le mur existe : une cloison au milieu de la pièce ne capte pas la visée des murs du fond.
      if (!wall.cover.some(([u, v]) => along > u - 0.2 && along < v + 0.2)) continue
      const t = ray.origin.distanceTo(p)
      if (!best || t < best.t) best = { wall, along, t }
    }
    return best
  }

  /** Saisit un objet de la cabine pour le déplacer (avec ce qui est posé dessus). */
  private grabItem(index: number, e: { clientX: number; clientY: number }) {
    const item = this.items[index]
    const entry = item && entryOf(item.m)
    if (!entry) return
    this.cancelHeld()
    const ray = this.ray(e).ray
    let grab = { x: 0, z: 0 }
    if (entry.mount === 'wall') {
      const hit = this.wallAt(ray)
      const wall = this.view.wallOf(item)
      if (hit && wall && hit.wall === wall) grab = { x: (DIRS[wall.dir].dz !== 0 ? item.x : item.z) - hit.along, z: 0 }
    } else {
      const p = this.atHeight(ray, item.y ?? 0)
      if (p) grab = { x: item.x - p.x, z: item.z - p.z }
    }
    const riders = ridersOf(this.view, this.items, index).map((j) => {
      const r = this.items[j]
      return { index: j, dx: r.x - item.x, dz: r.z - item.z, dy: (r.y ?? 0) - (item.y ?? 0), r: r.r }
    })
    this.held = {
      index,
      item: { ...item },
      entry,
      grab,
      riders,
      r0: item.r,
      refusal: null,
      aimed: false,
    }
    this.view.detach([index, ...riders.map((r) => r.index)])
    this.host.sound.ui('pick')
    this.setHint()
  }

  /** Place l'objet en main sous le curseur (aperçu, validité). */
  private aimAt(e: { clientX: number; clientY: number }) {
    const held = this.held
    if (!held) return
    const ray = this.ray(e).ray
    const { item, entry } = held
    if (entry.mount === 'wall') {
      const hit = this.wallAt(ray)
      if (!hit) return this.showHeld(false)
      const alongX = DIRS[hit.wall.dir].dz !== 0
      const along = snap(hit.along + held.grab.x)
      item.r = hit.wall.rot
      if (alongX) {
        item.x = along
        item.z = hit.wall.face
      } else {
        item.x = hit.wall.face
        item.z = along
      }
    } else if (entry.mount === 'top') {
      // Sur le dessus d'un meuble si le curseur le vise, sinon au sol.
      const skip = new Set([held.index, ...held.riders.map((r) => r.index)])
      let best: { x: number; z: number; t: number; surface: Surface } | null = null
      for (const surface of surfacesOf(this.view, this.items, skip)) {
        const p = this.atHeight(ray, surface.y)
        if (!p || p.x < surface.minX || p.x > surface.maxX || p.z < surface.minZ || p.z > surface.maxZ) continue
        const t = ray.origin.distanceTo(p.clone().setY(p.y + this.view.deck.y))
        if (!best || t < best.t) best = { x: p.x, z: p.z, t, surface }
      }
      if (best) {
        item.x = snap(best.x + held.grab.x, SNAP_TOP)
        item.z = snap(best.z + held.grab.z, SNAP_TOP)
        item.y = round3(best.surface.y)
        this.keepInside(held, best.surface)
      } else {
        const p = this.atHeight(ray, 0)
        if (!p) return this.showHeld(false)
        item.x = snap(p.x + held.grab.x, SNAP_TOP)
        item.z = snap(p.z + held.grab.z, SNAP_TOP)
        delete item.y
        this.keepInside(held, this.view.bounds)
      }
    } else {
      const p = this.atHeight(ray, 0)
      if (!p) return this.showHeld(false)
      if (entry.grid) {
        // Un sol : la tuile du quadrillage sous le curseur, sans orientation.
        item.x = Math.round(p.x)
        item.z = Math.round(p.z)
        item.r = 0
      } else {
        item.x = snap(p.x + held.grab.x)
        item.z = snap(p.z + held.grab.z)
        this.magnet(held)
        this.keepInside(held, this.view.bounds)
      }
    }
    held.aimed = true
    this.validate()
    this.showHeld(true)
  }

  /** Poussé contre un mur (ou le bord d'un meuble), l'objet glisse le long au lieu d'en sortir. */
  private keepInside(held: Held, rect: { minX: number; maxX: number; minZ: number; maxZ: number }) {
    const box = this.view.boxOf(held.item, this.tmpBox)
    if (!box) return
    const into = (lo: number, hi: number, min: number, max: number) => (hi - lo > max - min ? 0 : lo < min ? min - lo : hi > max ? max - hi : 0)
    held.item.x = round3(held.item.x + into(box.min.x, box.max.x, rect.minX, rect.maxX))
    held.item.z = round3(held.item.z + into(box.min.z, box.max.z, rect.minZ, rect.maxZ))
  }

  /** Aimant : un meuble à quelques centimètres d'un mur vient s'y coller. */
  private magnet(held: Held) {
    const box = this.view.boxOf(held.item, this.tmpBox)
    if (!box) return
    const b = this.view.bounds
    const pull = (lo: number, hi: number, min: number, max: number) => (Math.abs(lo - min) < MAGNET ? min - lo : Math.abs(max - hi) < MAGNET ? max - hi : 0)
    held.item.x = round3(held.item.x + pull(box.min.x, box.max.x, b.minX, b.maxX))
    held.item.z = round3(held.item.z + pull(box.min.z, box.max.z, b.minZ, b.maxZ))
  }

  /** Aménagement tel qu'il serait avec l'objet en main à sa place (et ce qui est posé dessus). */
  private candidate(held: Held): { items: CabinItem[]; index: number; moving: Set<number> } {
    const items = cloneItems(this.items)
    let index = held.index
    if (index < 0) {
      index = items.length
      items.push({ ...held.item })
    } else items[index] = { ...held.item }
    const turn = ((((held.item.r - held.r0) % 4) + 4) % 4) as Rot
    for (const r of held.riders) {
      const d = rotateLocal(turn, r.dx, r.dz)
      const it = items[r.index]
      it.x = round3(held.item.x + d.x)
      it.z = round3(held.item.z + d.z)
      it.r = ((r.r + turn) % 4) as Rot
      const y = round3((held.item.y ?? 0) + r.dy)
      if (y > 0) it.y = y
    }
    return { items, index, moving: new Set([index, ...held.riders.map((r) => r.index)]) }
  }

  /** Raison pour laquelle l'objet en main (et ce qui est posé dessus) ne peut pas aller là, ou null. */
  private check(held: Held): string | null {
    const c = this.candidate(held)
    for (const i of c.moving) {
      const why = refusal(this.view, c.items, i, c.moving)
      if (why) return why
    }
    return null
  }

  private validate() {
    if (this.held) this.held.refusal = this.check(this.held)
  }

  /** Aperçu de l'objet en main, et son empreinte (verte : il peut aller là ; rouge : non). */
  private showHeld(visible: boolean) {
    const held = this.held
    if (!held) return
    const c = this.candidate(held)
    const lift = held.entry.mount === 'wall' ? 0 : LIFT
    if (held.ghost) {
      held.ghost.visible = visible
      const it = c.items[c.index]
      held.ghost.position.set(it.x, (it.y ?? 0) + lift, it.z)
      held.ghost.rotation.y = (it.r * Math.PI) / 2
    } else {
      for (const i of c.moving) {
        const it = c.items[i]
        this.view.moveDetached(i, it.x, (it.y ?? 0) + lift, it.z, it.r)
      }
    }
    this.footprint.visible = this.heldBox.visible = visible
    this.setStatus(visible ? held.refusal : null)
    if (!visible) return
    const box = this.view.boxOf(c.items[c.index], this.tmpBox)
    if (!box) return
    const color = held.refusal ? '#ff4f5e' : '#7dffa8'
    this.heldBox.box.copy(box).expandByScalar(0.02)
    ;(this.heldBox.material as THREE.LineBasicMaterial).color.set(color)
    const size = box.getSize(new THREE.Vector3())
    const mat = this.footprint.material as THREE.MeshBasicMaterial
    mat.color.set(color)
    if (held.entry.mount === 'wall') {
      const wall = this.view.wallOf(held.item)
      const alongX = wall ? DIRS[wall.dir].dz !== 0 : true
      this.footprint.rotation.set(0, alongX ? 0 : Math.PI / 2, 0)
      this.footprint.scale.set(alongX ? size.x : size.z, size.y, 1)
      box.getCenter(this.footprint.position)
      const d = wall ? DIRS[wall.dir] : { dx: 0, dz: -1 }
      this.footprint.position.x -= d.dx * 0.03
      this.footprint.position.z -= d.dz * 0.03
    } else {
      this.footprint.rotation.set(-Math.PI / 2, 0, 0)
      this.footprint.scale.set(size.x, size.z, 1)
      this.footprint.position.set((box.min.x + box.max.x) / 2, (held.item.y ?? 0) + 0.02, (box.min.z + box.max.z) / 2)
    }
  }

  /**
   * Pose le nouvel objet en main (Maj : on en garde un autre en main ; un sol, toujours).
   * `stroke` : la suite d'un trait de sol, qui ne fait qu'une étape de l'historique.
   */
  private place(keep: boolean, stroke = false) {
    const held = this.held
    if (!held || held.index !== -1 || !held.aimed) return
    if (held.refusal) return this.refuse(held.refusal)
    const c = this.candidate(held)
    const entry = held.entry
    keep ||= !!entry.grid
    this.clearHeld()
    this.commit(c.items, keep ? -1 : c.index, stroke)
    this.host.sound.ui('drop')
    // Maj+clic : garder la carte en main pour poser un autre exemplaire.
    if (keep && this.stock(entry.id) > 0) this.startPlacing(entry)
    else if (keep) this.toast(tr(`La carte du catalogue permet de débloquer ${entry.name.toLowerCase()}.`, `Use the catalogue card to unlock ${entry.name.toLowerCase()}.`))
    this.setHint()
  }

  /** Relâche l'objet déplacé : il reste là où il est, ou revient à sa place s'il ne peut pas. */
  private drop() {
    const held = this.held
    if (!held || held.index < 0) return
    if (!held.aimed) return this.cancelHeld()
    if (held.refusal) {
      this.refuse(held.refusal)
      return this.cancelHeld()
    }
    const c = this.candidate(held)
    this.host.sound.ui('drop')
    // Revenu à sa place : rien ne change, mais l'objet doit quitter la main (et se reposer).
    if (sameItems(c.items, this.items)) return this.cancelHeld()
    this.clearHeld()
    this.commit(c.items, c.index)
    this.setHint()
  }

  private clearHeld() {
    const held = this.held
    if (!held) return
    if (held.ghost) this.view.disposeGhost(held.ghost)
    this.held = null
    this.footprint.visible = this.heldBox.visible = false
    this.setStatus(null)
  }

  /** Abandonne l'objet en main : un nouvel objet disparaît, un objet déplacé revient à sa place. */
  private cancelHeld() {
    const moved = this.held && this.held.index >= 0
    this.clearHeld()
    this.placeOnRelease = false
    if (moved) this.view.setLayout({ items: this.items })
    this.setHint()
  }

  // ---------------------------------------------------------------- choix, outils

  private select(index: number) {
    if (index === this.selected) return
    this.selected = index
    if (index >= 0) this.host.sound.ui('pick')
    this.renderTools()
  }

  private artSearch = ''
  private artSearchIndex = -1

  private renderTools() {
    if (this.artSearchIndex !== this.selected) { this.artSearch = ''; this.artSearchIndex = this.selected }
    const item = this.items[this.selected]
    const entry = item && entryOf(item.m)
    this.tools.classList.toggle('has-art', entry?.model === 'site-art')
    this.tools.hidden = !entry
    if (!entry) return
    this.tools.replaceChildren()
    const name = document.createElement('div')
    name.className = 'ed-tool-name'
    name.textContent = entry.name
    const row = document.createElement('div')
    row.className = 'ed-tool-row'
    const tool = (label: string, glyph: Parameters<typeof icon>[0], onClick: () => void, cls = '') => {
      const b = document.createElement('button')
      b.title = label
      b.setAttribute('aria-label', label)
      b.className = cls
      b.append(icon(glyph))
      b.onclick = onClick
      return b
    }
    if (entry.mount !== 'wall') {
      row.append(
        tool(tr('Tourner à gauche (Maj+R)', 'Rotate left (Shift+R)'), 'arrow-counter-clockwise', () => this.rotate(-1)),
        tool(tr('Tourner à droite (R)', 'Rotate right (R)'), 'arrow-clockwise', () => this.rotate(1)),
      )
    }
    if (!entry.fixed) row.append(tool(tr('Retirer (Suppr)', 'Remove (Del)'), 'trash', () => this.remove(), 'ed-remove'))
    this.tools.append(name)
    if (row.children.length) this.tools.append(row)
    if (entry.model === 'site-art' && entry.variants?.length) {
      this.tools.append(artChoice(entry.variants, item.v, entry.id === 'site-card', this.artSearch,
        (query) => { this.artSearch = query }, (id) => this.setVariant(id)))
    } else if (entry.variants) {
      const [base, tint] = splitVariant(entry, item.v)
      const variants = document.createElement('div')
      variants.className = 'ed-variants'
      for (const v of entry.variants) {
        // Variantes à gagner : celles du joueur, et celle qui est posée.
        if (entry.owned && v.id !== base && !entry.owned(v.id)) continue
        const b = document.createElement('button')
        b.title = v.label
        b.setAttribute('aria-label', v.label)
        b.classList.toggle('active', v.id === base)
        if (v.swatch) {
          b.className += ' swatch'
          b.style.setProperty('--swatch', v.swatch)
        } else {
          const img = document.createElement('img')
          img.alt = ''
          img.draggable = false
          thumbnail(entry, v.id, (url) => {
            if (url) img.src = url
          })
          b.append(img)
        }
        b.onclick = () => this.setVariant(joinVariant(entry, v.id, tint))
        variants.appendChild(b)
      }
      this.tools.append(variants)
      if (entry.tints?.length && base) {
        const tints = document.createElement('div')
        tints.className = 'ed-variants'
        for (const t of entry.tints) {
          const b = document.createElement('button')
          b.className = 'swatch'
          b.title = t.label
          b.setAttribute('aria-label', t.label)
          b.classList.toggle('active', t.id === tint)
          b.style.setProperty('--swatch', t.swatch ?? '')
          b.onclick = () => this.setVariant(joinVariant(entry, base, t.id))
          tints.appendChild(b)
        }
        this.tools.append(tints)
      }
    }
  }

  private rotate(step: 1 | -1) {
    const held = this.held
    if (held) {
      if (held.entry.mount === 'wall') return
      held.item.r = ((held.item.r + step + 4) % 4) as Rot
      this.host.sound.ui('rotate')
      this.validate()
      this.showHeld(held.aimed)
      return
    }
    const i = this.selected
    const item = this.items[i]
    const entry = item && entryOf(item.m)
    if (!entry || entry.mount === 'wall') return
    // Tourner sur place : comme un déplacement, avec ce qui est posé dessus.
    const riders = ridersOf(this.view, this.items, i).map((j) => {
      const r = this.items[j]
      return { index: j, dx: r.x - item.x, dz: r.z - item.z, dy: (r.y ?? 0) - (item.y ?? 0), r: r.r }
    })
    const probe: Held = { index: i, item: { ...item, r: ((item.r + step + 4) % 4) as Rot }, entry, grab: { x: 0, z: 0 }, riders, r0: item.r, refusal: null, aimed: true }
    // Tourné contre un mur, un meuble allongé en sortirait : il glisse d'autant vers l'intérieur.
    if (entry.mount !== 'top' || !(item.y ?? 0)) this.keepInside(probe, this.view.bounds)
    const why = this.check(probe)
    const reason = why && why.charAt(0).toLowerCase() + why.slice(1)
    if (why) return this.refuse(tr(`Pas la place de le tourner : ${reason}`, `No room to rotate it: ${reason}`))
    this.commit(this.candidate(probe).items, i)
    this.host.sound.ui('rotate')
  }

  private setVariant(id: string) {
    const i = this.selected
    const item = this.items[i]
    if (!item || item.v === id) return
    const next = cloneItems(this.items)
    next[i].v = id
    // Une autre variante peut être un peu plus grande (un grand tapis…) : on vérifie.
    const why = refusal(this.view, next, i)
    if (why) return this.refuse(why)
    this.commit(next, i)
    this.host.sound.ui('drop')
  }

  private remove() {
    const i = this.selected
    const item = this.items[i]
    const entry = item && entryOf(item.m)
    if (!entry) return
    if (entry.fixed) return this.refuse(tr('Le Holo-Me ne se range pas : déplacez-le plutôt', 'The Holo-Me can\'t be put away: move it instead'))
    // Ce qui était posé dessus part avec lui (Ctrl+Z pour tout récupérer).
    const gone = new Set([i, ...ridersOf(this.view, this.items, i)])
    this.commit(this.items.filter((_, j) => !gone.has(j)), -1)
    this.host.sound.ui('drop')
    if (gone.size > 1) this.toast(tr(`${entry.name} retiré, avec ce qui était posé dessus (Ctrl+Z pour annuler)`, `${entry.name} removed, along with what was on it (Ctrl+Z to undo)`))
  }

  /** Ajuste l'objet choisi au clavier, par petits pas (le long des axes de l'écran). */
  private nudge(sx: number, sy: number, fine: boolean) {
    const i = this.selected
    const item = this.items[i]
    const entry = item && entryOf(item.m)
    if (!entry) return
    const g = this.host.iso.screenToGround(sx, sy, new THREE.Vector3())
    // On suit l'axe du sol le plus proche de la direction de la flèche ; un sol avance d'une tuile.
    const step = entry.grid ? 1 : fine ? SNAP : 0.25
    const dx = Math.abs(g.x) > Math.abs(g.z) ? Math.sign(g.x) * step : 0
    const dz = dx ? 0 : Math.sign(g.z) * step
    const riders = ridersOf(this.view, this.items, i)
    const next = cloneItems(this.items)
    const wall = entry.mount === 'wall' ? this.view.wallOf(item) : null
    for (const j of [i, ...riders]) {
      if (wall) {
        // Au mur, on glisse le long du mur seulement.
        if (DIRS[wall.dir].dz !== 0) next[j].x = round3(next[j].x + (dx || dz))
        else next[j].z = round3(next[j].z + (dz || dx))
      } else {
        next[j].x = round3(next[j].x + dx)
        next[j].z = round3(next[j].z + dz)
      }
    }
    const moving = new Set([i, ...riders])
    for (const j of moving) {
      const why = refusal(this.view, next, j, moving)
      if (why) return this.refuse(why)
    }
    // Les petits pas qui se suivent sur un même objet ne font qu'une seule étape d'annulation.
    const now = performance.now()
    const merge = this.lastNudge?.index === i && now - this.lastNudge.at < 800
    this.commit(next, i, merge)
    this.lastNudge = { index: i, at: now }
  }

  // ---------------------------------------------------------------- historique

  /** Nouveau mobilier ; `merge` : la suite d'une même retouche, une seule étape d'annulation. */
  private commit(next: CabinItem[], select: number, merge = false) {
    if (sameItems(next, this.items)) return
    if (!merge || !this.past.length) this.past.push(this.items)
    if (this.past.length > HISTORY) this.past.shift()
    this.future = []
    this.apply(next, select)
  }

  private apply(next: CabinItem[], select: number) {
    // Un autre changement, une annulation : le prochain petit pas est une nouvelle étape, et un
    // clic en cours ne vise plus le même objet.
    this.lastNudge = null
    this.press = null
    this.items = next
    this.view.setLayout({ items: next })
    this.selected = select < next.length ? select : -1
    this.renderTools()
    this.renderBar()
    this.refreshCards()
    this.host.onChange({ items: cloneItems(next) })
  }

  private undo() {
    const prev = this.past.pop()
    if (!prev) return
    this.cancelHeld()
    this.future.push(this.items)
    this.apply(prev, -1)
    this.host.sound.ui('rotate')
  }

  private redo() {
    const next = this.future.pop()
    if (!next) return
    this.cancelHeld()
    this.past.push(this.items)
    this.apply(next, -1)
    this.host.sound.ui('rotate')
  }

  private renderBar() {
    this.countEl.textContent = tr(`${furnitureCount(this.items)} / ${this.capacity} objets`, `${furnitureCount(this.items)} / ${this.capacity} items`)
    this.undoBtn.disabled = !this.past.length
    this.redoBtn.disabled = !this.future.length
  }

  // ---------------------------------------------------------------- clavier

  /** @returns vrai si la touche a été prise par le mode aménagement */
  keyDown(e: KeyboardEvent): boolean {
    const ctrl = e.ctrlKey || e.metaKey
    if (ctrl && e.code === 'KeyZ') {
      if (e.shiftKey) this.redo()
      else this.undo()
    } else if (ctrl && e.code === 'KeyY') this.redo()
    else if (this.buying && (e.code === 'Enter' || e.code === 'NumpadEnter')) void this.confirmBuy()
    else if (e.code === 'Escape') {
      if (this.buying) this.closeBuy()
      else if (this.held) this.cancelHeld()
      else if (this.selected >= 0) this.select(-1)
      else this.host.onClose()
    } else if (e.code === 'KeyR' && (this.held || this.selected >= 0)) this.rotate(e.shiftKey ? -1 : 1)
    else if ((e.code === 'Delete' || e.code === 'Backspace') && !this.held) this.remove()
    else if (!this.held && this.selected >= 0 && /^(Arrow(Up|Down|Left|Right)|Key[WASD])$/.test(e.code)) {
      const up = e.code === 'ArrowUp' || e.code === 'KeyW', down = e.code === 'ArrowDown' || e.code === 'KeyS'
      const left = e.code === 'ArrowLeft' || e.code === 'KeyA', right = e.code === 'ArrowRight' || e.code === 'KeyD'
      this.nudge(right ? 1 : left ? -1 : 0, up ? 1 : down ? -1 : 0, !e.shiftKey)
    } else return false
    e.preventDefault()
    return true
  }

  // ---------------------------------------------------------------- image

  update(t: number) {
    if (!this.open) return
    if (this.pointerDirty && this.lastPointer) {
      this.pointerDirty = false
      if (this.held) {
        this.aimAt(this.lastPointer)
        // Un trait de sol : la tuile survolée est posée si elle est libre (sinon on passe, sans refus).
        if (this.painting && this.held.index === -1 && this.held.aimed && !this.held.refusal) {
          this.place(true, true)
          if (this.held) this.aimAt(this.lastPointer)
        }
      } else {
        const i = this.view.pickItem(this.ray(this.lastPointer))
        this.hovered = i
        this.host.canvas.style.cursor = i >= 0 ? 'grab' : 'default'
      }
    }
    if (this.held) this.host.canvas.style.cursor = this.held.index >= 0 ? 'grabbing' : 'copy'
    if (this.held?.ghost) this.view.tickGhost(this.held.ghost, t)

    const outline = (helper: THREE.Box3Helper, index: number) => {
      const item = this.items[index]
      helper.visible = !!item && !(this.held && this.held.index === index) && !!this.view.boxOf(item, helper.box)
      if (helper.visible) helper.box.expandByScalar(0.02)
    }
    outline(this.hoverBox, this.held || this.hovered === this.selected ? -1 : this.hovered)
    outline(this.selectBox, this.held ? -1 : this.selected)

    this.tools.style.visibility = this.held ? 'hidden' : ''
  }

  // ---------------------------------------------------------------- aide et messages

  /** Raison pour laquelle l'objet en main ne peut pas aller là, en direct. */
  private setStatus(text: string | null) {
    if ((this.status.dataset.text ?? '') === (text ?? '')) return
    this.status.dataset.text = text ?? ''
    this.status.replaceChildren()
    if (text) this.status.append(icon('warning-circle'), document.createTextNode(text))
    this.hint.classList.toggle('refused', !!text)
  }

  private setHint() {
    this.keysEl.replaceChildren()
    const parts: [string, string][] = this.held
      ? this.held.index < 0
        ? EN
          ? this.held.entry.grid ? [['Click', 'place'], ['Drag', 'place several'], ['Esc', 'done']] : [['Click', 'place'], ['Shift+click', 'place several'], ['R', 'rotate'], ['Esc', 'cancel']]
          : this.held.entry.grid ? [['Clic', 'poser'], ['Glisser', 'en poser plusieurs'], ['Échap', 'terminer']] : [['Clic', 'poser'], ['Maj+clic', 'en poser plusieurs'], ['R', 'tourner'], ['Échap', 'annuler']]
        : EN
          ? [['Release', 'place'], ['R', 'rotate'], ['Esc', 'cancel']]
          : [['Relâcher', 'poser'], ['R', 'tourner'], ['Échap', 'annuler']]
      : EN
        ? [['Click', 'select'], ['Drag', 'move'], ['R', 'rotate'], ['Arrows', 'nudge'], ['Del', 'remove'], ['Ctrl+Z', 'undo'], ['Esc', 'done']]
        : [['Clic', 'choisir'], ['Glisser', 'déplacer'], ['R', 'tourner'], ['Flèches', 'ajuster'], ['Suppr', 'retirer'], ['Ctrl+Z', 'annuler'], ['Échap', 'terminer']]
    parts.forEach(([key, what], i) => {
      if (i) this.keysEl.append(' · ')
      const k = document.createElement('kbd')
      k.textContent = key
      this.keysEl.append(k, ` ${what}`)
    })
  }

  private refuse(text: string) {
    this.host.sound.ui('deny')
    this.toast(text, true)
  }

  private toast(text: string, error = false) {
    this.toastEl.replaceChildren()
    if (error) this.toastEl.append(icon('warning-circle'))
    this.toastEl.append(text)
    this.toastEl.classList.toggle('error', error)
    this.toastEl.hidden = false
    clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => (this.toastEl.hidden = true), 2600)
  }

  /**
   * Quadrillage du sol de la cabine (un trait par bord de tuile) : un trait clair sur un liseré
   * sombre, lisible sur un sol uni comme sur un motif chargé.
   */
  private makeGrid(): THREE.Group {
    // Les bords intérieurs des tuiles de la cabine et de ses pièces (pas ceux qui longent un mur).
    const edges: [number, number, number, number][] = []
    const own = new Set(this.view.tiles.map((t) => `${t.x},${t.z}`))
    for (const key of own) {
      const [x, z] = key.split(',').map(Number)
      const map = this.view.deck.map
      if (own.has(`${x + 1},${z}`) && map.edge(x, z, 1) === 'open') edges.push([x + 0.5, z - 0.5, x + 0.5, z + 0.5])
      if (own.has(`${x},${z + 1}`) && map.edge(x, z, 2) === 'open') edges.push([x - 0.5, z + 0.5, x + 0.5, z + 0.5])
    }
    const halo = new THREE.Mesh(gridStrips(edges, 0.04, 0.003), GRID_HALO)
    const line = new THREE.Mesh(gridStrips(edges, 0.014, 0.004), GRID_LINE)
    halo.renderOrder = 1
    line.renderOrder = 2
    return new THREE.Group().add(halo, line)
  }
}

// Le revêtement du sol est décollé vers la caméra (cf. view.ts, d'autant plus qu'on dézoome) : le
// quadrillage l'est un peu plus, et reste sous les tapis imprimés (cf. decal()). Il écrit sa
// profondeur et la compare strictement : aux croisements, une bande ne se dessine pas deux fois
// par-dessus elle-même, le liseré garde la même teinte partout.
const GRID_DEPTH = { depthFunc: THREE.LessDepth, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }
const GRID_HALO = new THREE.MeshBasicMaterial({ color: '#03121c', transparent: true, opacity: 0.5, ...GRID_DEPTH })
const GRID_LINE = new THREE.MeshBasicMaterial({ color: '#8fe9ff', transparent: true, opacity: 0.75, ...GRID_DEPTH })

/** Bandes plates au sol, de demi-largeur `half`, prolongées d'autant aux bouts pour fermer les angles. */
function gridStrips(edges: [number, number, number, number][], half: number, y: number): THREE.BufferGeometry {
  const pos = new Float32Array(edges.length * 12)
  const index: number[] = []
  edges.forEach(([x0, z0, x1, z1], i) => {
    const [ax, az, bx, bz] = [x0 - half, z0 - half, x1 + half, z1 + half]
    pos.set([ax, y, az, bx, y, az, bx, y, bz, ax, y, bz], i * 12)
    const k = i * 4
    index.push(k, k + 2, k + 1, k, k + 3, k + 2)
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geometry.setIndex(index)
  return geometry
}
