import * as THREE from 'three'
import type { Sound } from '../audio'
import type { IsoCamera } from '../camera'
import { formatCredits, itemPrice, wingPrice } from '../economy/data'
import type { Wallet } from '../economy/wallet'
import { EN, tr } from '../i18n'
import { icon } from '../icons'
import type { Rot } from '../levels'
import { DIRS } from '../map'
import { $ } from '../ui'
import { CATALOG, CATEGORIES, entryOf, joinVariant, splitVariant, type CatalogEntry, type CategoryId } from './catalog'
import { paintThumb, stylesOf, styleOf, type Slot } from './finishes'
import { cloneItems, cloneLayout, cloneWings, DEFAULT_CABIN, defaultLayout, ROOM_ITEMS, sameItems, sameLayout, WING_ITEMS, wingShapes, type CabinItem, type CabinLayout, type CabinWings, type Finish, type Partition } from './layout'
import { drawPartition, kindOf, PARTITION_KINDS, partitionCenter } from './partitions'
import { hangingOn, partitionRefusal, refusal, ridersOf, surfacesOf, type Surface } from './rules'
import { isDoor, MAX_PARTITIONS, partitionKey } from '../../shared/cabin-partitions.js'
import { thumbnail } from './thumbs'
import { artChoice } from './art-choice'
import { rotateLocal, type CabinView, type WallLine } from './view'
import { DEFAULT_PATTERN, WING_PATTERNS, WING_ROOMS, WING_SIZE, WING_SLOTS, wingPlan, type PatternId, type WingId } from '../../shared/cabin-wings.js'

/*
 * Mode aménagement : dans ses quartiers, le CMDR pose, déplace, tourne et retire meubles et
 * objets, et choisit le revêtement des murs et du sol. À la souris : clic pour choisir,
 * glisser pour déplacer, une carte du catalogue pour poser un nouvel objet (clic, ou
 * glisser-déposer). Au clavier : R pour tourner, Suppr pour retirer, flèches pour ajuster,
 * Ctrl+Z pour annuler, Échap pour finir. Chaque changement passe par les règles de pose
 * (rules.ts) ; main.ts l'enregistre et le montre aux invités.
 *
 * Les objets payants se débloquent une fois en crédits (cf. economy/) et peuvent ensuite être
 * posés plusieurs fois. Le mobilier d'origine reste offert et disponible en quantité limitée.
 *
 * Onglet « Cloisons » : des murs et des portes posés sur les lignes du quadrillage, pour découper
 * une pièce en plusieurs (gratuits, cf. partitions.ts) ; un clic pose, glisser trace une ligne de
 * murs, la gomme retire. Chaque partie des quartiers doit rester accessible depuis la porte.
 *
 * Onglet « Pièces » : les trois espaces d'extension (SHIP-02). Un espace se débloque une fois,
 * puis reçoit une pièce dont on choisit la forme de plan ; changer de forme vide la pièce de ses
 * objets (ils restent débloqués). Chaque pièce a ses murs et son sol (onglet « Murs et sol »).
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
  /** L'aménagement a changé : à enregistrer et à montrer aux invités. */
  onChange: (layout: CabinLayout) => void
  /** Le joueur quitte le mode aménagement (Terminer, Échap). */
  onClose: () => void
  /** Crédits du CMDR : les objets du catalogue se débloquent une fois. */
  wallet: Wallet
  /** Position du joueur : l'onglet « Murs et sol » s'ouvre sur la pièce où il se trouve. */
  player: THREE.Vector3
  /**
   * Sur la parcelle du pont des quartiers (housing v2) : murs, revêtements et taille se règlent en
   * mode construction (cf. housing/builder.ts) ; l'onglet « Construction » y passe.
   */
  build?: () => void
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

/** Noms des espaces d'extension et des formes de plan. */
const WING_NAMES: Record<WingId, string> = {
  left: tr('Extension gauche', 'Left extension'),
  middle: tr('Extension du milieu', 'Middle extension'),
  right: tr('Extension droite', 'Right extension'),
}
const PATTERN_NAMES: Record<PatternId, string> = {
  carre: tr('Carré', 'Square'),
  octogone: tr('Octogone', 'Octagon'),
  rectangle: tr('Rectangle', 'Rectangle'),
  galerie: tr('Galerie', 'Gallery'),
  l: tr('En L', 'L-shaped'),
  t: tr('En T', 'T-shaped'),
  u: tr('En U', 'U-shaped'),
  losange: tr('Losange', 'Diamond'),
  'deux-pieces': tr('Deux pièces', 'Two rooms'),
  suite: tr('Suite', 'Suite'),
}

/** Outil de l'onglet « Cloisons » qui retire une cloison. */
const ERASE = 'erase'

/** Carte « d'origine » des revêtements : murs et sol du vaisseau, sans rien dessus. */
const ORIGIN = 'origin'
/** Vignettes des revêtements (px) : un pan de mur de 1 m de haut, ou 0,8 m de sol. */
const THUMB = 128

const RESET = tr('Réinitialiser', 'Reset')
/** Le mobilier d'origine des quartiers est offert : exemplaires de chaque objet. */
const FREE = new Map<string, number>()
for (const it of DEFAULT_CABIN) FREE.set(it.m, (FREE.get(it.m) ?? 0) + 1)

const snap = (v: number, step = SNAP) => Math.round(Math.round(v / step) * step * 1000) / 1000
const round3 = (v: number) => Math.round(v * 1000) / 1000

export class CabinEditor {
  /** Aménagement en cours d'édition : les objets, et les revêtements (absents : ceux d'origine). */
  items: CabinItem[] = []
  wall?: Finish
  floor?: Finish
  /** Pièces des extensions débloquées : forme et revêtements. */
  wings?: CabinWings
  /** Cloisons : murs et portes posés sur le quadrillage. */
  partitions: Partition[] = []
  private open = false
  private past: CabinLayout[] = []
  private future: CabinLayout[] = []
  private selected = -1
  private hovered = -1
  private held: Held | null = null
  /** Clic sur un objet, qui devient un déplacement si l'on glisse. */
  private press: { index: number; x: number; y: number } | null = null
  /** Nouvel objet saisi sur une carte du catalogue : on le pose en relâchant au-dessus de la cabine. */
  private placeOnRelease = false
  private lastPointer: { clientX: number; clientY: number } | null = null
  private pointerDirty = false
  /** Dernier petit pas au clavier : les suivants, sur le même objet, s'y ajoutent dans l'historique. */
  private lastNudge: { index: number; at: number } | null = null
  /** Dernière retouche d'une teinte (nuancier) : les suivantes s'y ajoutent dans l'historique. */
  private lastTint: { slot: Slot; room: 'main' | WingId; at: number } | null = null
  /** Pièce dont l'onglet « Murs et sol » change les revêtements. */
  private finishRoom: 'main' | WingId = 'main'
  /** Changement de forme d'une pièce qui a des objets : un second clic confirme. */
  private confirmShape: { id: WingId; shape: PatternId; at: number } | null = null
  /** Déblocage d'un espace : réponse du site attendue, refus. */
  private wingBuy: { id: WingId; pending: boolean; error: string } | null = null
  private category: CategoryId = 'rest'
  /** Déblocage en cours : l'objet, la réponse attendue du site, un refus. */
  private buying: { entry: CatalogEntry; pending: boolean; error: string } | null = null
  /** Étiquette de déblocage ou de stock offert de chaque carte affichée. */
  private cardTags = new Map<string, { card: HTMLElement; tag: HTMLElement; entry: CatalogEntry }>()
  /** Catalogue du mobilier, revêtements des murs et du sol, cloisons, ou pièces des extensions. */
  private mode: 'objects' | 'finish' | 'partitions' | 'rooms' = 'objects'
  /** Onglet « Cloisons » : l'outil choisi (un modèle de cloison, ou la gomme). */
  private tool = 'wall'
  /** Arête visée et ce qu'y ferait l'outil (refus éventuel), recalculés quand l'arête ou l'aménagement changent. */
  private edge: { p: Partition; key: string; existing?: Partition; refusal: string | null; noop: boolean } | null = null
  /** Tracé en cours (bouton enfoncé) : les arêtes déjà traitées, et si l'historique a sa première étape. */
  private painting: { done: Set<string>; committed: boolean } | null = null
  private partitionEls: { cards: Map<string, HTMLElement>; count: HTMLElement } | null = null
  private confirmReset = 0

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
  /** Aperçu au sol d'un espace ou d'une forme (onglet « Pièces »). */
  private readonly preview: THREE.Mesh
  /** Onglet « Cloisons » : aperçu de la cloison visée, et marques au sol des cloisons posées. */
  private readonly edgeGhost: THREE.Mesh
  private marks = new THREE.Group()
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
  private readonly resetBtn: HTMLButtonElement
  private readonly modes: HTMLElement
  private readonly tabs: HTMLElement
  private readonly cards: HTMLElement
  /** Onglet des revêtements : cartes des motifs et nuancier, par emplacement. */
  private finishEls: Partial<Record<Slot, { cards: Map<string, HTMLButtonElement>; colors: HTMLElement; style?: string }>> = {}
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
    this.preview = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({ color: '#59d8ff', transparent: true, opacity: 0.28, depthWrite: false, depthTest: false, side: THREE.DoubleSide }),
    )
    this.preview.renderOrder = 4
    this.preview.visible = false
    this.edgeGhost = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, WALL_GHOST),
      new THREE.MeshBasicMaterial({ color: '#7dffa8', transparent: true, opacity: 0.4, depthWrite: false, depthTest: false }),
    )
    this.edgeGhost.renderOrder = 5
    this.edgeGhost.visible = false
    this.helpers.add(this.footprint, this.hoverBox, this.selectBox, this.heldBox, this.grid, this.preview, this.edgeGhost, this.marks)
    this.helpers.visible = false
    view.group.add(this.helpers)

    // Barre du haut : compteur, annuler, rétablir, réinitialiser, terminer.
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
    this.resetBtn = button(RESET, 'broom', () => this.reset())
    this.resetBtn.title = tr('Réinitialiser : revenir aux quartiers d\'origine', 'Reset: back to the original quarters')
    const done = button(tr('Terminer', 'Done'), 'check', () => this.host.onClose(), 'ed-done')
    done.title = tr('Terminer (Échap)', 'Done (Esc)')
    const info = document.createElement('div')
    info.className = 'ed-info'
    info.append(title, this.countEl, this.balanceEl, this.saveEl)
    const actions = document.createElement('div')
    actions.className = 'ed-actions'
    actions.append(this.undoBtn, this.redoBtn, this.resetBtn, done)
    bar.append(info, actions)

    // Catalogue : mobilier (onglets par catégorie, cartes avec vignette) ou murs et sol.
    const catalog = document.createElement('div')
    catalog.className = 'panel ed-catalog'
    this.modes = document.createElement('div')
    this.modes.className = 'ed-modes'
    const MODES = [
      ['objects', tr('Mobilier', 'Furniture'), 'couch'], ['finish', tr('Murs et sol', 'Walls & floor'), 'paint-roller'],
      ['partitions', tr('Cloisons', 'Partitions'), 'wall'], ['rooms', tr('Pièces', 'Rooms'), 'grid-four'],
    ] as const
    for (const [mode, label, glyph] of MODES) {
      // Sur la parcelle, seuls les meubles se posent ici.
      if (host.build && mode !== 'objects') continue
      const b = document.createElement('button')
      b.dataset.mode = mode
      b.title = label
      b.append(icon(glyph), document.createTextNode(label))
      b.onclick = () => (mode === 'finish' ? this.showFinishes(true) : mode === 'rooms' ? this.showRooms() : mode === 'partitions' ? this.showPartitions() : this.showCategory(this.category))
      this.modes.appendChild(b)
    }
    if (host.build) {
      const b = document.createElement('button')
      b.title = tr('Construction : murs, papier peint, sol', 'Building: walls, wallpaper, floor')
      b.append(icon('wall'), document.createTextNode(tr('Construction', 'Building')))
      b.onclick = () => host.build?.()
      this.modes.appendChild(b)
      this.resetBtn.hidden = true
    }
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
      if (this.mode === 'rooms' && !this.wingBuy?.pending) this.showRooms()
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
    const b = this.frame()
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

  /** Ce que la caméra cadre : la cabine et ses pièces ; dans l'onglet « Pièces », les trois espaces aussi. */
  private frame(): { minX: number; maxX: number; minZ: number; maxZ: number } {
    const b = { ...this.view.extent }
    if (this.mode === 'rooms') {
      for (const s of WING_SLOTS) {
        b.minX = Math.min(b.minX, s.x0 - 0.5)
        b.maxX = Math.max(b.maxX, s.x0 + WING_SIZE - 0.5)
        b.minZ = Math.min(b.minZ, s.z0 - 0.5)
        b.maxZ = Math.max(b.maxZ, s.z0 + WING_SIZE - 0.5)
      }
    }
    return b
  }

  // ---------------------------------------------------------------- ouverture

  /**
   * @param tab onglet à ouvrir (sinon le dernier) ; `wing` : l'espace à montrer dans « Pièces »
   */
  start(layout: CabinLayout, tab?: 'rooms') {
    const own = cloneLayout(layout)
    this.items = own.items
    this.wall = own.wall
    this.floor = own.floor
    this.wings = own.wings
    this.partitions = own.partitions ?? []
    this.edge = null
    this.painting = null
    if (tab) this.mode = tab
    if (this.finishRoom !== 'main' && !this.wings?.[this.finishRoom]) this.finishRoom = 'main'
    this.refreshGrid()
    this.past = []
    this.future = []
    this.selected = this.hovered = -1
    this.held = null
    this.press = null
    this.lastNudge = this.lastTint = null
    this.open = true
    this.root.hidden = false
    this.helpers.visible = true
    if (this.mode === 'finish') this.showFinishes(true)
    else if (this.mode === 'rooms') this.showRooms()
    else if (this.mode === 'partitions') this.showPartitions()
    else this.showCategory(this.category)
    this.renderBar()
    this.renderBalance()
    this.renderTools()
    this.setHint()
  }

  stop() {
    if (!this.open) return
    this.closeBuy()
    this.showPreview(null)
    this.cancelHeld()
    this.open = false
    this.root.hidden = true
    this.helpers.visible = false
    this.tools.hidden = true
    this.selected = this.hovered = -1
    this.painting = null
    this.edge = null
    this.view.solidPartitions = false
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

  /** Aménagement en cours (les objets et les revêtements). */
  get layout(): CabinLayout {
    const layout: CabinLayout = { items: this.items }
    if (this.wall) layout.wall = this.wall
    if (this.floor) layout.floor = this.floor
    if (this.wings && Object.keys(this.wings).length) layout.wings = this.wings
    if (this.partitions.length) layout.partitions = this.partitions
    return layout
  }

  /** Objets au plus : les quartiers, et chaque pièce d'extension ; sur la parcelle, selon sa taille. */
  private get capacity(): number {
    if (this.view.def.home) return this.view.roomCap('main')
    return ROOM_ITEMS + WING_ITEMS * Object.keys(this.wings ?? {}).length
  }

  // ---------------------------------------------------------------- catalogue

  private setMode(mode: 'objects' | 'finish' | 'partitions' | 'rooms') {
    const reframe = (mode === 'rooms') !== (this.mode === 'rooms')
    this.mode = mode
    for (const b of this.modes.children) (b as HTMLElement).classList.toggle('active', (b as HTMLElement).dataset.mode === mode)
    this.tabs.hidden = mode !== 'objects'
    this.cards.classList.toggle('finish', mode !== 'objects')
    if (mode !== 'rooms') this.showPreview(null)
    if (mode !== 'partitions') {
      this.partitionEls = null
      this.edge = null
      this.painting = null
      this.edgeGhost.visible = false
      this.setStatus(null)
    }
    this.view.solidPartitions = mode === 'partitions'
    this.refreshMarks()
    this.setHint()
    // L'onglet « Pièces » cadre aussi les espaces encore fermés.
    if (reframe && this.open) this.reframe()
  }

  private showCategory(id: CategoryId) {
    this.setMode('objects')
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

  /** Étiquettes des cartes : déblocage, stock offert, ou prix (grisé si le solde est insuffisant). */
  private refreshCards() {
    const { wallet } = this.host
    for (const { card, tag, entry } of this.cardTags.values()) {
      const stock = this.stock(entry.id)
      const price = itemPrice(entry.id)
      const unlocked = price !== null && wallet.items.has(entry.id)
      const inStock = stock > 0
      tag.textContent = unlocked
        ? tr('Débloqué', 'Unlocked')
        : !Number.isFinite(stock)
          ? ''
          : inStock
            ? tr(`${stock} offert${stock > 1 ? 's' : ''}`, `${stock} free`)
            : price === null ? '' : formatCredits(price)
      tag.classList.toggle('stock', inStock)
      card.classList.toggle('poor', !inStock && !unlocked && wallet.ready && price !== null && price > wallet.balance)
      const mount = entry.mount === 'wall' ? tr(' (à accrocher)', ' (hangs on a wall)') : entry.mount === 'top' ? tr(' (se pose sur un meuble)', ' (goes on furniture)') : ''
      const state = unlocked
        ? tr(' · Débloqué : posez-en autant que vous voulez', ' · Unlocked: place as many as you like')
        : price === null || inStock
          ? price !== null ? tr(` · ${stock} exemplaire${stock > 1 ? 's' : ''} offert${stock > 1 ? 's' : ''} · déblocage ${formatCredits(price)}`, ` · ${stock} free ${stock === 1 ? 'copy' : 'copies'} · unlock ${formatCredits(price)}`) : ''
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
    if (b.error) {
      note.textContent = b.error
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
    buy.disabled = b.pending || !wallet.ready || short
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
      }[result.reason as 'funds' | 'max' | 'owned' | 'guest'] ?? tr('Déblocage non abouti : le site ne répond pas. Réessayez.', 'Unlock failed: the site isn\'t responding. Try again.')
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
    if (this.items.length >= this.capacity) return this.refuse(tr(`Cabine pleine : ${this.capacity} objets au plus`, `Quarters full: ${this.capacity} items at most`))
    if (this.stock(entry.id) <= 0) return this.openBuy(entry)
    this.closeBuy()
    const item: CabinItem = { m: entry.id, x: this.view.center.x, z: this.view.center.z, r: 0, s: Math.floor(Math.random() * 100000) }
    if (entry.variants?.length) item.v = entry.variants[0].id
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

  // ---------------------------------------------------------------- revêtements

  /** Onglet des revêtements : pour les murs puis le sol, les motifs, puis les teintes du motif choisi. */
  private showFinishes(here = false) {
    this.cancelHeld()
    this.closeBuy()
    this.setMode('finish')
    if (here) this.finishRoom = this.roomHere()
    this.cards.replaceChildren()
    this.cardTags.clear()
    this.finishEls = {}
    // Avec des extensions : la pièce à repeindre (les quartiers, ou une des extensions).
    const wings = WING_SLOTS.filter((s) => this.wings?.[s.id])
    if (this.finishRoom !== 'main' && !this.wings?.[this.finishRoom]) this.finishRoom = 'main'
    if (wings.length) {
      const chips = document.createElement('div')
      chips.className = 'ed-room-chips'
      for (const [id, name] of [['main', tr('Quartiers', 'Quarters')], ...wings.map((s) => [s.id, WING_NAMES[s.id]])] as ['main' | WingId, string][]) {
        const b = document.createElement('button')
        b.textContent = name
        b.classList.toggle('active', id === this.finishRoom)
        b.onclick = () => {
          this.finishRoom = id
          this.showFinishes()
        }
        chips.appendChild(b)
      }
      this.cards.appendChild(chips)
    }
    for (const [slot, title] of [['wall', tr('Murs', 'Walls')], ['floor', tr('Sol', 'Floor')]] as const) {
      const h = document.createElement('div')
      h.className = 'ed-cat-title'
      h.textContent = title
      const grid = document.createElement('div')
      grid.className = 'ed-finishes'
      const cards = new Map<string, HTMLButtonElement>()
      const styles = [{ id: ORIGIN, name: tr('D\'origine', 'Original') }, ...stylesOf(slot)]
      for (const style of styles) {
        const b = document.createElement('button')
        b.className = 'ed-finish'
        b.title = style.name
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = THUMB
        paintThumb(canvas, slot, style.id === ORIGIN ? undefined : { style: style.id, color: styleOf(slot, style.id)!.palette[0] })
        const name = document.createElement('span')
        name.textContent = style.name
        b.append(canvas, name)
        b.onclick = () => {
          if ((this.finishOf(slot)?.style ?? ORIGIN) === style.id) return
          this.setFinish(slot, style.id === ORIGIN ? undefined : { style: style.id, color: styleOf(slot, style.id)!.palette[0] })
          this.host.sound.ui('pick')
        }
        grid.appendChild(b)
        cards.set(style.id, b)
      }
      const colors = document.createElement('div')
      colors.className = 'ed-colors'
      this.cards.append(h, grid, colors)
      this.finishEls[slot] = { cards, colors }
    }
    this.refreshFinishes()
  }

  /** Carte du motif choisi (dans sa teinte) et nuancier de ce motif, pour les murs et le sol. */
  private refreshFinishes() {
    for (const slot of ['wall', 'floor'] as const) {
      const els = this.finishEls[slot]
      if (!els) continue
      const finish = this.finishOf(slot)
      const id = finish?.style ?? ORIGIN
      for (const [key, b] of els.cards) b.classList.toggle('active', key === id)
      const card = els.cards.get(id)
      if (finish && card) paintThumb(card.querySelector('canvas')!, slot, finish)
      if (els.style !== id) {
        els.style = id
        this.renderColors(slot, els.colors)
      }
      for (const b of els.colors.querySelectorAll<HTMLElement>('[data-color]')) b.classList.toggle('active', b.dataset.color === finish?.color)
      const input = els.colors.querySelector('input')
      if (input && finish && input.value !== finish.color) input.value = finish.color
      els.colors.querySelector('.custom')?.classList.toggle('active', !!finish && !styleOf(slot, finish.style)?.palette.includes(finish.color))
    }
  }

  /** Nuancier du motif choisi : ses teintes, et une teinte libre (sélecteur de couleur). */
  private renderColors(slot: Slot, row: HTMLElement) {
    row.replaceChildren()
    const finish = this.finishOf(slot)
    const style = finish && styleOf(slot, finish.style)
    row.hidden = !style
    if (!style) return
    for (const color of style.palette) {
      const b = document.createElement('button')
      b.className = 'ed-swatch'
      b.dataset.color = color
      b.title = color
      b.setAttribute('aria-label', tr(`Teinte ${color}`, `Colour ${color}`))
      b.style.setProperty('--swatch', color)
      b.onclick = () => {
        const current = this.finishOf(slot)
        if (current && current.color !== color) this.setFinish(slot, { style: current.style, color })
      }
      row.appendChild(b)
    }
    const custom = document.createElement('label')
    custom.className = 'ed-swatch custom'
    custom.title = tr('Autre teinte', 'Custom colour')
    const input = document.createElement('input')
    input.type = 'color'
    input.value = finish.color
    // Le sélecteur envoie une teinte à chaque mouvement : une seule étape d'annulation en tout.
    input.oninput = () => {
      const current = this.finishOf(slot)
      if (current) this.setFinish(slot, { style: current.style, color: input.value.toLowerCase() }, true)
    }
    input.onchange = () => (this.lastTint = null)
    custom.append(icon('palette'), input)
    row.appendChild(custom)
  }

  /** Pièce où se tient le joueur : une extension, sinon les quartiers. */
  private roomHere(): 'main' | WingId {
    const letter = this.view.deck.map.room(Math.round(this.host.player.x), Math.round(this.host.player.z))
    const slot = letter ? WING_SLOTS.find((s) => WING_ROOMS[s.id].includes(letter) && this.wings?.[s.id]) : undefined
    return slot?.id ?? 'main'
  }

  /** Revêtement affiché de la pièce choisie (cf. finishRoom). */
  private finishOf(slot: Slot): Finish | undefined {
    return this.finishRoom === 'main' ? this[slot] : this.wings?.[this.finishRoom]?.[slot]
  }

  /** Nouveau revêtement de la pièce choisie (undefined : celui d'origine). `tint` : retouche continue d'une teinte. */
  private setFinish(slot: Slot, finish: Finish | undefined, tint = false) {
    const now = performance.now()
    const room = this.finishRoom
    const merge = tint && this.lastTint?.slot === slot && this.lastTint.room === room && now - this.lastTint.at < 1500
    const next = { ...this.layout }
    const target: { wall?: Finish; floor?: Finish } | undefined = room === 'main' ? next : (next.wings = cloneWings(next.wings ?? {}))[room]
    if (!target) return
    if (finish) target[slot] = finish
    else delete target[slot]
    this.commitLayout(next, this.selected, merge)
    if (tint) this.lastTint = { slot, room, at: now }
  }

  // ---------------------------------------------------------------- cloisons

  /** Onglet « Cloisons » : les modèles (murs, portes) et la gomme ; la cloison se pose dans la cabine. */
  private showPartitions() {
    this.cancelHeld()
    this.closeBuy()
    this.select(-1)
    this.setMode('partitions')
    this.cards.replaceChildren()
    this.cardTags.clear()
    const intro = document.createElement('div')
    intro.className = 'ed-rooms-intro'
    intro.textContent = tr(
      'Posez des murs et des portes sur les lignes du quadrillage pour découper vos pièces : un clic pose, glisser trace une ligne de murs. Les murs prennent le papier peint de leur pièce. C\'est gratuit.',
      'Place walls and doors on the grid lines to split your rooms: click to place, drag to draw a line of walls. Walls take on their room\'s wallpaper. It\'s free.',
    )
    const count = document.createElement('div')
    count.className = 'ed-cat-title'
    const grid = document.createElement('div')
    grid.className = 'ed-finishes'
    const cards = new Map<string, HTMLElement>()
    for (const kind of [...PARTITION_KINDS, { id: ERASE, name: tr('Gomme', 'Eraser'), door: false }]) {
      const b = document.createElement('button')
      b.className = 'ed-finish'
      b.title = kind.name
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = THUMB
      drawPartition(canvas, kind.id)
      const name = document.createElement('span')
      name.textContent = kind.name
      b.append(canvas, name)
      b.onclick = () => {
        this.tool = kind.id
        this.edge = null
        for (const [id, c] of cards) c.classList.toggle('active', id === this.tool)
        this.host.sound.ui('pick')
      }
      b.classList.toggle('active', kind.id === this.tool)
      grid.appendChild(b)
      cards.set(kind.id, b)
    }
    this.cards.append(intro, count, grid)
    this.partitionEls = { cards, count }
    this.renderPartitionCount()
  }

  private renderPartitionCount() {
    if (!this.partitionEls) return
    const doors = this.partitions.filter(isDoor).length
    this.partitionEls.count.textContent = tr(
      `${this.partitions.length} / ${MAX_PARTITIONS} cloisons · ${doors} porte${doors > 1 ? 's' : ''}`,
      `${this.partitions.length} / ${MAX_PARTITIONS} partitions · ${doors} door${doors === 1 ? '' : 's'}`,
    )
  }

  /** Arête du quadrillage la plus proche du point visé au sol (tuile à l'ouest ou au nord, et sens). */
  private edgeUnder(e: { clientX: number; clientY: number }): Partition | null {
    const p = this.atHeight(this.ray(e).ray, 0)
    if (!p) return null
    const tx = Math.round(p.x), tz = Math.round(p.z)
    const fx = p.x - tx, fz = p.z - tz
    if (!this.view.contains(p.x, p.z)) return null
    // La ligne la plus proche : verticale (x = k + 0,5) ou horizontale (z = k + 0,5).
    if (0.5 - Math.abs(fx) < 0.5 - Math.abs(fz)) return { x: fx > 0 ? tx : tx - 1, z: tz, e: 'v' }
    return { x: tx, z: fz > 0 ? tz : tz - 1, e: 'h' }
  }

  /** Ce que ferait l'outil sur l'arête visée, avec son aperçu (vert, rouge, ou orange pour la gomme). */
  private aimEdge(e: { clientX: number; clientY: number }) {
    const at = this.edgeUnder(e)
    if (!at) {
      this.edge = null
      this.edgeGhost.visible = false
      this.setStatus(null)
      return
    }
    const key = `${partitionKey(at)}|${this.tool}`
    if (this.edge?.key !== key) {
      const existing = this.partitions.find((q) => partitionKey(q) === partitionKey(at))
      let why: string | null = null
      let noop = false
      if (this.tool === ERASE) {
        noop = !existing
        if (!existing) why = tr('Pas de cloison ici', 'No partition here')
      } else if (existing && kindOf(existing) === this.tool) noop = true
      else {
        const next = this.nextPartitions(at, existing)
        const p = next[next.length - 1]
        const leaving = existing && this.tool !== 'wall' ? hangingOn(this.view, this.items, existing) : []
        why = partitionRefusal(this.view, this.items, next, p, existing, leaving)
      }
      this.edge = { p: at, key, existing, refusal: why, noop }
    }
    const { cx, cz, alongX } = partitionCenter(at)
    const erase = this.tool === ERASE
    this.edgeGhost.visible = true
    this.edgeGhost.position.set(cx, 0.5, cz)
    this.edgeGhost.rotation.y = alongX ? 0 : Math.PI / 2
    const door = PARTITION_KINDS.find((k) => k.id === this.tool)?.door
    this.edgeGhost.scale.set(1.02, door ? 0.72 : 1.02, 1)
    this.edgeGhost.position.y = door ? 0.36 : 0.5
    ;(this.edgeGhost.material as THREE.MeshBasicMaterial).color.set(this.edge.refusal ? '#ff4f5e' : erase ? '#ffb03a' : this.edge.noop ? '#9fdcff' : '#7dffa8')
    this.setStatus(this.edge.refusal)
  }

  /** Cloisons une fois l'outil passé sur l'arête `at` (qui remplace `existing`) ; la nouvelle en dernier. */
  private nextPartitions(at: Partition, existing?: Partition): Partition[] {
    const rest = this.partitions.filter((q) => q !== existing)
    if (this.tool === ERASE) return rest
    const p: Partition = { x: at.x, z: at.z, e: at.e }
    if (this.tool !== 'wall') p.k = this.tool
    return [...rest, p]
  }

  /** Passe l'outil sur l'arête visée ; `click` : premier appui (un refus s'affiche alors). */
  private paintEdge(click: boolean) {
    const edge = this.edge
    const painting = this.painting
    if (!edge || !painting || painting.done.has(edge.key)) return
    painting.done.add(edge.key)
    if (edge.noop) return
    if (edge.refusal) {
      if (click) this.refuse(edge.refusal)
      return
    }
    // Les objets accrochés à l'ancien pan partent avec lui (Ctrl+Z pour tout récupérer).
    const leaving = edge.existing && this.tool !== 'wall' ? new Set(hangingOn(this.view, this.items, edge.existing)) : new Set<number>()
    const partitions = this.nextPartitions(edge.p, edge.existing)
    const items = leaving.size ? this.items.filter((_, i) => !leaving.has(i)) : this.items
    this.commitLayout({ ...this.layout, items, partitions }, -1, painting.committed)
    painting.committed = true
    this.host.sound.ui(this.tool === ERASE ? 'rotate' : 'drop')
    if (leaving.size) this.toast(tr(`${leaving.size} objet(s) accroché(s) retiré(s) avec le mur (Ctrl+Z pour annuler)`, `${leaving.size} hanging item(s) removed with the wall (Ctrl+Z to undo)`))
  }

  /** Marques au sol des cloisons posées (onglet « Cloisons ») : bleu pour un mur, orange pour une porte. */
  private refreshMarks() {
    for (const m of this.marks.children) (m as THREE.Mesh).geometry.dispose()
    this.marks.clear()
    if (this.mode !== 'partitions') return
    for (const p of this.partitions) {
      const { cx, cz, alongX } = partitionCenter(p)
      const m = new THREE.Mesh(new THREE.PlaneGeometry(alongX ? 0.96 : 0.34, alongX ? 0.34 : 0.96), isDoor(p) ? MARK_DOOR : MARK_WALL)
      m.rotation.x = -Math.PI / 2
      m.position.set(cx, 0.03, cz)
      m.renderOrder = 4
      this.marks.add(m)
    }
  }

  // ---------------------------------------------------------------- pièces (extensions)

  /**
   * Onglet « Pièces » : les trois espaces d'extension. Fermé : son prix, et de quoi le débloquer.
   * Ouvert : les dix formes de plan de sa pièce.
   */
  private showRooms() {
    this.cancelHeld()
    this.closeBuy()
    this.setMode('rooms')
    this.cards.replaceChildren()
    this.cardTags.clear()
    const wallet = this.host.wallet
    const intro = document.createElement('div')
    intro.className = 'ed-rooms-intro'
    intro.textContent = tr(
      'Trois espaces bordent vos quartiers, chacun derrière sa porte. Débloquez-en un, puis choisissez la forme de sa pièce ; vous pourrez en changer à tout moment.',
      'Three spaces border your quarters, each behind its own door. Unlock one, then pick the shape of its room; you can change it at any time.',
    )
    this.cards.appendChild(intro)
    const price = wingPrice(wallet.wings.size)
    for (const slot of WING_SLOTS) {
      const box = document.createElement('div')
      box.className = 'ed-wing'
      const head = document.createElement('div')
      head.className = 'ed-wing-head'
      const name = document.createElement('div')
      name.className = 'ed-wing-name'
      name.textContent = WING_NAMES[slot.id]
      head.appendChild(name)
      box.appendChild(head)
      box.onpointerenter = () => this.showPreview(slot.id, this.wings?.[slot.id]?.shape)
      box.onpointerleave = () => this.showPreview(null)
      if (!wallet.wings.has(slot.id)) {
        const state = document.createElement('div')
        state.className = 'ed-wing-state'
        state.append(icon('lock-simple'), document.createTextNode(tr('Fermé', 'Locked')))
        head.appendChild(state)
        const note = document.createElement('div')
        note.className = 'eb-note'
        note.textContent = tr(`Une pièce jusqu'à ${WING_SIZE} × ${WING_SIZE} tuiles, et ${WING_ITEMS} objets de plus.`, `A room of up to ${WING_SIZE} × ${WING_SIZE} tiles, and ${WING_ITEMS} more items.`)
        const buy = document.createElement('button')
        buy.className = 'ed-wing-buy'
        const pending = this.wingBuy?.id === slot.id && this.wingBuy.pending
        buy.append(icon('shopping-cart'), document.createTextNode(price === null ? '—' : pending ? tr('Déblocage…', 'Unlocking…') : tr(`Débloquer · ${formatCredits(price)}`, `Unlock · ${formatCredits(price)}`)))
        buy.disabled = price === null || pending || !wallet.ready || wallet.balance < price
        buy.onclick = () => void this.buyWing(slot.id)
        box.append(note, buy)
        const why = this.wingBuy?.id === slot.id ? this.wingBuy.error : !wallet.ready ? tr('Crédits indisponibles pour le moment.', 'Credits unavailable at the moment.') : price !== null && wallet.balance < price ? tr('Crédits insuffisants.', 'Not enough credits.') : ''
        if (why) {
          const err = document.createElement('div')
          err.className = 'eb-note error'
          err.textContent = why
          box.appendChild(err)
        }
      } else {
        const current = this.wings?.[slot.id]?.shape
        const grid = document.createElement('div')
        grid.className = 'ed-patterns'
        // Sous les vignettes : le nom de la forme survolée (sinon de la forme choisie), ou la confirmation attendue.
        const caption = document.createElement('div')
        caption.className = 'ed-pattern-name'
        const pending = this.confirmShape?.id === slot.id && performance.now() - this.confirmShape.at < 4000 ? this.confirmShape.shape : null
        const describe = (id: PatternId | undefined) => {
          caption.classList.toggle('confirm', !!pending && id === pending)
          caption.textContent = !id ? '' : pending && id === pending ? tr(`${PATTERN_NAMES[id]} : cliquez à nouveau pour confirmer`, `${PATTERN_NAMES[id]}: click again to confirm`) : PATTERN_NAMES[id]
        }
        for (const id of Object.keys(WING_PATTERNS) as PatternId[]) {
          const b = document.createElement('button')
          b.className = 'ed-pattern'
          b.title = PATTERN_NAMES[id]
          b.setAttribute('aria-label', PATTERN_NAMES[id])
          b.classList.toggle('active', id === current)
          b.classList.toggle('confirm', id === pending)
          const canvas = document.createElement('canvas')
          canvas.width = canvas.height = 60
          drawPattern(canvas, id)
          b.append(canvas)
          b.onpointerenter = () => {
            this.showPreview(slot.id, id)
            describe(id)
          }
          b.onpointerleave = () => describe(pending ?? current)
          b.onclick = () => this.chooseShape(slot.id, id)
          grid.appendChild(b)
        }
        describe(pending ?? current)
        box.append(grid, caption)
      }
      this.cards.appendChild(box)
    }
  }

  /** Débloque un espace : le site débite, puis l'espace reçoit une pièce de la forme par défaut. */
  private async buyWing(id: WingId) {
    if (this.wingBuy?.pending) return
    this.wingBuy = { id, pending: true, error: '' }
    this.showRooms()
    const outcome = await this.host.wallet.buyWing(id)
    if (!this.open) return
    this.wingBuy = null
    if (outcome.ok || outcome.reason === 'owned') {
      this.host.wallet.wings.add(id)
      const next = { ...this.layout, wings: { ...cloneWings(this.wings ?? {}), [id]: this.wings?.[id] ?? { shape: DEFAULT_PATTERN } } }
      this.commitLayout(next, this.selected)
      this.host.sound.ui('drop')
      this.toast(tr(`${WING_NAMES[id]} débloquée : choisissez la forme de sa pièce`, `${WING_NAMES[id]} unlocked: pick the shape of its room`))
    } else {
      const reason = outcome.reason
      this.wingBuy = {
        id,
        pending: false,
        error: reason === 'funds' ? tr('Crédits insuffisants.', 'Not enough credits.') : reason === 'guest' ? tr('Réservé aux CMDR connectés.', 'For logged-in CMDRs only.') : tr('Le site ne répond pas, réessayez.', 'The site is not answering, try again.'),
      }
    }
    this.showRooms()
  }

  /**
   * Nouvelle forme pour la pièce de l'espace `id`. Ses objets en sortent (ils restent débloqués) :
   * s'il y en a, un second clic confirme.
   */
  private chooseShape(id: WingId, shape: PatternId) {
    const wing = this.wings?.[id]
    if (!wing || wing.shape === shape) return
    const inside = this.items.filter((it) => this.view.roomAt(it.x, it.z) === id)
    const now = performance.now()
    if (inside.length && !(this.confirmShape?.id === id && this.confirmShape.shape === shape && now - this.confirmShape.at < 4000)) {
      this.confirmShape = { id, shape, at: now }
      this.toast(tr(`${inside.length} objet(s) quitteront cette pièce (ils restent débloqués). Cliquez à nouveau pour confirmer.`, `${inside.length} item(s) will leave this room (they stay unlocked). Click again to confirm.`))
      setTimeout(() => this.mode === 'rooms' && this.open && this.showRooms(), 4000)
      return this.showRooms()
    }
    this.confirmShape = null
    const wings = cloneWings(this.wings ?? {})
    wings[id] = { ...wings[id]!, shape }
    // Les cloisons de la pièce partent avec elle.
    const partitions = this.partitions.filter((p) => this.view.roomAt(p.x, p.z) !== id)
    this.commitLayout({ ...this.layout, items: this.items.filter((it) => !inside.includes(it)), wings, partitions }, -1)
    this.host.sound.ui('pick')
    this.showRooms()
    this.showPreview(id, shape)
  }

  /** Aperçu au sol : tout l'espace `id` (fermé), ou la forme `shape` qu'il recevrait ; null : rien. */
  private showPreview(id: WingId | null, shape?: PatternId) {
    const slot = id && WING_SLOTS.find((s) => s.id === id)
    this.preview.visible = !!slot
    if (!slot) return
    const tiles = shape ? wingPlan(slot, shape).tiles : Array.from({ length: WING_SIZE * WING_SIZE }, (_, i) => ({ x: slot.x0 + (i % WING_SIZE), z: slot.z0 + Math.floor(i / WING_SIZE) }))
    const pos: number[] = []
    for (const t of tiles) {
      const [x0, x1, z0, z1] = [t.x - 0.46, t.x + 0.46, t.z - 0.46, t.z + 0.46]
      pos.push(x0, 0.02, z0, x1, 0.02, z1, x1, 0.02, z0, x0, 0.02, z0, x0, 0.02, z1, x1, 0.02, z1)
    }
    this.preview.geometry.dispose()
    this.preview.geometry = new THREE.BufferGeometry()
    this.preview.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
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
    if (this.mode === 'partitions') {
      this.painting = { done: new Set(), committed: false }
      this.edge = null
      this.aimEdge(e)
      return this.paintEdge(true)
    }
    // Un objet déjà en main (relâché hors de la fenêtre…) se pose là, comme un nouvel objet.
    if (this.held) {
      this.aimAt(e)
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
    this.painting = null
    if (this.held && this.held.index >= 0) {
      this.aimAt(e)
      this.drop()
    }
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
    const b = this.view.extent
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
        this.keepInside(held, this.view.roomRect(item.x, item.z))
      }
    } else {
      const p = this.atHeight(ray, 0)
      if (!p) return this.showHeld(false)
      item.x = snap(p.x + held.grab.x)
      item.z = snap(p.z + held.grab.z)
      this.magnet(held)
      this.keepInside(held, this.view.roomRect(item.x, item.z))
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
    const b = this.view.roomRect(held.item.x, held.item.z)
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

  /** Pose le nouvel objet en main (Maj : on en garde un autre en main). */
  private place(keep: boolean) {
    const held = this.held
    if (!held || held.index !== -1 || !held.aimed) return
    if (held.refusal) return this.refuse(held.refusal)
    const c = this.candidate(held)
    const entry = held.entry
    this.clearHeld()
    this.commit(c.items, keep ? -1 : c.index)
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
    if (moved) this.view.setLayout(this.layout)
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
    if (entry.mount !== 'top' || !(item.y ?? 0)) this.keepInside(probe, this.view.roomRect(item.x, item.z))
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
    // On suit l'axe du sol le plus proche de la direction de la flèche.
    const step = fine ? SNAP : 0.25
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

  /** Nouveaux objets (les revêtements ne changent pas). */
  private commit(next: CabinItem[], select: number, merge = false) {
    this.commitLayout({ ...this.layout, items: next }, select, merge)
  }

  private commitLayout(next: CabinLayout, select: number, merge = false) {
    if (sameLayout(next, this.layout)) return
    if (!merge || !this.past.length) this.past.push(this.layout)
    if (this.past.length > HISTORY) this.past.shift()
    this.future = []
    this.apply(next, select)
  }

  private apply(next: CabinLayout, select: number) {
    // Un autre changement, une annulation : le prochain petit pas (ou la prochaine teinte) est
    // une nouvelle étape, et un clic en cours ne vise plus le même objet.
    this.lastNudge = this.lastTint = null
    this.press = null
    const reshaped = wingShapes(next.wings) !== wingShapes(this.wings)
    this.items = next.items
    this.wall = next.wall
    this.floor = next.floor
    this.wings = next.wings
    this.partitions = next.partitions ?? []
    // L'arête visée est à réévaluer (la cloison posée, les meubles déplacés…).
    this.edge = null
    this.view.setLayout(next)
    if (reshaped) this.refreshGrid()
    this.selected = select < next.items.length ? select : -1
    this.renderTools()
    this.renderBar()
    this.refreshCards()
    if (this.mode === 'finish') {
      if (reshaped) this.showFinishes()
      else this.refreshFinishes()
    }
    if (this.mode === 'rooms' && reshaped) this.showRooms()
    if (this.mode === 'partitions') this.renderPartitionCount()
    this.refreshMarks()
    this.host.onChange(cloneLayout(next))
  }

  private undo() {
    const prev = this.past.pop()
    if (!prev) return
    this.cancelHeld()
    this.future.push(this.layout)
    this.apply(prev, -1)
    this.host.sound.ui('rotate')
  }

  private redo() {
    const next = this.future.pop()
    if (!next) return
    this.cancelHeld()
    this.past.push(this.layout)
    this.apply(next, -1)
    this.host.sound.ui('rotate')
  }

  /** Retour aux quartiers d'origine (deuxième clic pour confirmer ; Ctrl+Z pour revenir). */
  private reset() {
    if (performance.now() - this.confirmReset > 3000) {
      this.confirmReset = performance.now()
      this.resetBtn.classList.add('confirm')
      this.resetBtn.lastChild!.textContent = tr('Confirmer ?', 'Confirm?')
      setTimeout(() => this.renderBar(), 3000)
      return
    }
    this.confirmReset = 0
    this.cancelHeld()
    // Les espaces débloqués le restent : leurs pièces reviennent vides, à la forme par défaut.
    const reset = defaultLayout()
    const wings: CabinWings = {}
    for (const id of Object.keys(this.wings ?? {}) as WingId[]) wings[id] = { shape: DEFAULT_PATTERN }
    if (Object.keys(wings).length) reset.wings = wings
    this.commitLayout(reset, -1)
    this.toast(tr('Quartiers remis comme au premier jour (Ctrl+Z pour annuler)', 'Quarters back the way they were on day one (Ctrl+Z to undo)'))
  }

  private renderBar() {
    this.countEl.textContent = tr(`${this.items.length} / ${this.capacity} objets`, `${this.items.length} / ${this.capacity} items`)
    this.undoBtn.disabled = !this.past.length
    this.redoBtn.disabled = !this.future.length
    if (performance.now() - this.confirmReset > 3000) {
      this.resetBtn.classList.remove('confirm')
      this.resetBtn.lastChild!.textContent = RESET
    }
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
    if (this.mode === 'partitions') {
      if (this.pointerDirty && this.lastPointer) {
        this.pointerDirty = false
        this.aimEdge(this.lastPointer)
        if (this.painting) this.paintEdge(false)
      } else if (!this.edge && this.lastPointer) this.aimEdge(this.lastPointer)
      this.hoverBox.visible = this.selectBox.visible = false
      this.tools.hidden = true
      this.host.canvas.style.cursor = this.edge ? (this.edge.refusal ? 'not-allowed' : 'crosshair') : 'default'
      return
    }
    if (this.pointerDirty && this.lastPointer) {
      this.pointerDirty = false
      if (this.held) this.aimAt(this.lastPointer)
      else {
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
    const parts: [string, string][] = this.mode === 'partitions'
      ? EN
        ? [['Click', 'place'], ['Drag', 'draw a wall'], [tr('Gomme', 'Eraser'), 'remove'], ['Ctrl+Z', 'undo'], ['Esc', 'done']]
        : [['Clic', 'poser'], ['Glisser', 'tracer un mur'], ['Gomme', 'retirer'], ['Ctrl+Z', 'annuler'], ['Échap', 'terminer']]
      : this.held
      ? this.held.index < 0
        ? EN
          ? [['Click', 'place'], ['Shift+click', 'place several'], ['R', 'rotate'], ['Esc', 'cancel']]
          : [['Clic', 'poser'], ['Maj+clic', 'en poser plusieurs'], ['R', 'tourner'], ['Échap', 'annuler']]
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
    const own = new Set(this.view.floorTiles.map((t) => `${t.x},${t.z}`))
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

/** Épaisseur de l'aperçu d'une cloison, et marques au sol des cloisons posées. */
const WALL_GHOST = 0.32
const MARK_WALL = new THREE.MeshBasicMaterial({ color: '#59d8ff', transparent: true, opacity: 0.55, depthWrite: false, depthTest: false })
const MARK_DOOR = new THREE.MeshBasicMaterial({ color: '#ffb03a', transparent: true, opacity: 0.6, depthWrite: false, depthTest: false })

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

// ---------------------------------------------------------------- vignettes des formes de plan

/** Vignette d'une forme de plan, vue depuis la porte (en haut) : ses tuiles, ses deux pièces, ses portes. */
function drawPattern(canvas: HTMLCanvasElement, id: PatternId) {
  const g = canvas.getContext('2d')!
  const W = canvas.width, cell = (W - 8) / WING_SIZE, o = 4
  const shape = WING_PATTERNS[id]
  g.clearRect(0, 0, W, W)
  shape.rows.forEach((row, pz) => {
    for (let px = 0; px < row.length; px++) {
      if (row[px] === ' ') continue
      g.fillStyle = row[px] === 'a' ? 'rgba(89, 216, 255, 0.55)' : 'rgba(125, 255, 168, 0.5)'
      g.fillRect(o + px * cell + 1, o + pz * cell + 1, cell - 2, cell - 2)
    }
  })
  // La porte des quartiers, au milieu du bord du haut ; les portes intérieures, en orange.
  g.fillStyle = '#ffb03a'
  g.fillRect(o + 2 * cell + cell * 0.2, 0, cell * 0.6, 4)
  for (const d of shape.doors ?? []) {
    const cx = o + (d.px + 0.5) * cell, cz = o + (d.pz + 0.5) * cell
    const vertical = d.dir === 1 || d.dir === 3
    const ex = cx + (d.dir === 1 ? cell / 2 : d.dir === 3 ? -cell / 2 : 0), ez = cz + (d.dir === 2 ? cell / 2 : d.dir === 0 ? -cell / 2 : 0)
    if (vertical) g.fillRect(ex - 2, ez - cell * 0.3, 4, cell * 0.6)
    else g.fillRect(ex - cell * 0.3, ez - 2, cell * 0.6, 4)
  }
}
