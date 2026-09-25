import * as THREE from 'three'
import type { Sound } from '../audio'
import type { IsoCamera } from '../camera'
import { icon } from '../icons'
import type { Rot } from '../levels'
import { DIRS } from '../map'
import { $ } from '../ui'
import { CATALOG, CATEGORIES, entryOf, type CatalogEntry, type CategoryId } from './catalog'
import { cloneLayout, DEFAULT_CABIN, MAX_ITEMS, sameLayout, type CabinItem } from './layout'
import { refusal, ridersOf, surfacesOf, type Surface } from './rules'
import { thumbnail } from './thumbs'
import { rotateLocal, type CabinView, type WallLine } from './view'

/*
 * Mode aménagement : dans ses quartiers, le CMDR pose, déplace, tourne et retire meubles et
 * objets. À la souris : clic pour choisir, glisser pour déplacer, une carte du catalogue pour
 * poser un nouvel objet (clic, ou glisser-déposer). Au clavier : R pour tourner, Suppr pour
 * retirer, flèches pour ajuster, Ctrl+Z pour annuler, Échap pour finir. Chaque changement
 * passe par les règles de pose (rules.ts) ; main.ts l'enregistre et le montre aux invités.
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
  onChange: (items: CabinItem[]) => void
  /** Le joueur quitte le mode aménagement (Terminer, Échap). */
  onClose: () => void
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

const snap = (v: number, step = SNAP) => Math.round(Math.round(v / step) * step * 1000) / 1000
const round3 = (v: number) => Math.round(v * 1000) / 1000

export class CabinEditor {
  /** Aménagement en cours d'édition. */
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
  private lastPointer: { clientX: number; clientY: number } | null = null
  private pointerDirty = false
  private lastNudge = 0
  private category: CategoryId = 'rest'
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
  private readonly grid: THREE.LineSegments
  private readonly helpers = new THREE.Group()

  // Interface.
  private readonly root = $('editor')
  private readonly bar: HTMLElement
  private readonly countEl: HTMLElement
  private readonly saveEl: HTMLElement
  private readonly undoBtn: HTMLButtonElement
  private readonly redoBtn: HTMLButtonElement
  private readonly resetBtn: HTMLButtonElement
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

    // Barre du haut : compteur, annuler, rétablir, réinitialiser, terminer.
    const bar = (this.bar = document.createElement('div'))
    bar.className = 'panel ed-bar'
    const title = document.createElement('div')
    title.className = 'ed-title'
    title.textContent = 'Aménagement des quartiers'
    this.countEl = document.createElement('div')
    this.countEl.className = 'ed-count'
    this.saveEl = document.createElement('div')
    this.saveEl.className = 'ed-save'
    const button = (label: string, glyph: Parameters<typeof icon>[0], onClick: () => void, cls = '') => {
      const b = document.createElement('button')
      b.className = cls
      b.title = label
      b.append(icon(glyph), document.createTextNode(label))
      b.onclick = onClick
      return b
    }
    this.undoBtn = button('Annuler', 'arrow-u-up-left', () => this.undo())
    this.undoBtn.title = 'Annuler (Ctrl+Z)'
    this.redoBtn = button('Rétablir', 'arrow-u-up-right', () => this.redo())
    this.redoBtn.title = 'Rétablir (Ctrl+Y)'
    this.resetBtn = button('Réinitialiser', 'broom', () => this.reset())
    this.resetBtn.title = 'Réinitialiser : revenir aux quartiers d\'origine'
    const done = button('Terminer', 'check', () => this.host.onClose(), 'ed-done')
    done.title = 'Terminer (Échap)'
    const info = document.createElement('div')
    info.className = 'ed-info'
    info.append(title, this.countEl, this.saveEl)
    const actions = document.createElement('div')
    actions.className = 'ed-actions'
    actions.append(this.undoBtn, this.redoBtn, this.resetBtn, done)
    bar.append(info, actions)

    // Catalogue : onglets par catégorie, cartes avec vignette.
    const catalog = document.createElement('div')
    catalog.className = 'panel ed-catalog'
    this.tabs = document.createElement('div')
    this.tabs.className = 'ed-tabs'
    this.cards = document.createElement('div')
    this.cards.className = 'ed-cards'
    catalog.append(this.tabs, this.cards)
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

  /** Zoom qui fait tenir toute la cabine dans la zone visible (vue plongeante, sous tous les angles). */
  fitZoom(): number {
    const b = this.view.bounds
    // Vue à 45° : la cabine forme un losange de (largeur + profondeur) · cos 45° de large.
    const diag = (b.maxX - b.minX + (b.maxZ - b.minZ)) * Math.SQRT1_2
    const tall = diag * Math.sin(EDIT_ELEVATION) + Math.cos(EDIT_ELEVATION)
    const v = this.visible()
    return 1.12 * Math.max((diag * innerHeight) / (2 * v.w), (tall * innerHeight) / (2 * v.h))
  }

  /** Point que la caméra regarde : la cabine, au milieu de la zone que le catalogue laisse visible. */
  focus(out: THREE.Vector3): THREE.Vector3 {
    out.copy(this.view.center)
    const v = this.visible()
    const unit = (2 * this.host.iso.zoomLevel) / innerHeight
    // Au sol vu en biais, un pixel vertical couvre plus de terrain qu'un pixel horizontal.
    const g = this.host.iso.screenToGround(v.dx * unit, (-v.dy * unit) / Math.sin(EDIT_ELEVATION), this.hit)
    return out.add(g)
  }

  // ---------------------------------------------------------------- ouverture

  start(items: CabinItem[]) {
    this.items = cloneLayout(items)
    this.past = []
    this.future = []
    this.selected = this.hovered = -1
    this.held = null
    this.press = null
    this.open = true
    this.root.hidden = false
    this.helpers.visible = true
    this.showCategory(this.category)
    this.renderBar()
    this.renderTools()
    this.setHint()
  }

  stop() {
    if (!this.open) return
    this.cancelHeld()
    this.open = false
    this.root.hidden = true
    this.helpers.visible = false
    this.tools.hidden = true
    this.selected = this.hovered = -1
    this.view.detach([])
  }

  /** Aménagement remplacé de l'extérieur (réinitialisation de la cabine depuis un autre onglet…). */
  replace(items: CabinItem[]) {
    this.cancelHeld()
    this.items = cloneLayout(items)
    this.selected = -1
    this.renderBar()
    this.renderTools()
  }

  /** Enregistrement de l'aménagement : en cours, fait, ou en échec. */
  setSaveState(state: 'saving' | 'saved' | 'error' | 'local') {
    this.saveEl.replaceChildren()
    const text = { saving: 'Enregistrement…', saved: 'Enregistré', error: 'Non enregistré : site injoignable', local: 'Enregistré sur cet appareil' }[state]
    this.saveEl.className = `ed-save ${state}`
    this.saveEl.append(icon(state === 'error' ? 'cloud-slash' : 'cloud-check'), document.createTextNode(text))
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
    for (const entry of CATALOG.filter((e) => e.category === id)) {
      const card = document.createElement('button')
      card.className = 'ed-card'
      card.title = `${entry.name}${entry.mount === 'wall' ? ' (à accrocher)' : entry.mount === 'top' ? ' (se pose sur un meuble)' : ''}`
      const img = document.createElement('img')
      img.alt = ''
      img.draggable = false
      thumbnail(entry, entry.variants?.[0].id, (url) => {
        if (url) img.src = url
      })
      const name = document.createElement('span')
      name.textContent = entry.name
      card.append(img, name)
      // À la souris, on saisit la carte (clic, ou glisser-déposer dans la cabine) ; au doigt,
      // glisser fait défiler le catalogue, et toucher une carte la prend en main.
      card.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.pointerType !== 'mouse') return
        e.preventDefault()
        this.startPlacing(entry)
        this.placeOnRelease = true
      })
      card.addEventListener('click', (e) => {
        if ((e as PointerEvent).pointerType !== 'mouse') this.startPlacing(entry)
      })
      this.cards.appendChild(card)
    }
  }

  private startPlacing(entry: CatalogEntry) {
    this.cancelHeld()
    if (this.items.length >= MAX_ITEMS) return this.refuse(`Cabine pleine : ${MAX_ITEMS} objets au plus`)
    const item: CabinItem = { m: entry.id, x: this.view.center.x, z: this.view.center.z, r: 0, s: Math.floor(Math.random() * 100000) }
    if (entry.variants) item.v = entry.variants[0].id
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

  // ---------------------------------------------------------------- souris

  pointerDown(e: PointerEvent) {
    this.lastPointer = e
    if (e.button !== 0) return
    if (this.held?.index === -1) {
      this.aimAt(e)
      return this.place(e.shiftKey)
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
      const t = ray.origin.distanceTo(p)
      if (!best || t < best.t) best = { wall, along, t }
    }
    return best
  }

  /** Saisit un objet de la cabine pour le déplacer (avec ce qui est posé dessus). */
  private grabItem(index: number, e: { clientX: number; clientY: number }) {
    const item = this.items[index]
    const entry = entryOf(item.m)
    if (!entry) return
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
      item.x = snap(p.x + held.grab.x)
      item.z = snap(p.z + held.grab.z)
      this.magnet(held)
      this.keepInside(held, this.view.bounds)
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
    const items = cloneLayout(this.items)
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
    if (keep) this.startPlacing(entry)
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
    this.clearHeld()
    this.commit(c.items, c.index)
    this.host.sound.ui('drop')
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
    if (moved) this.view.setLayout(this.items)
    this.setHint()
  }

  // ---------------------------------------------------------------- choix, outils

  private select(index: number) {
    if (index === this.selected) return
    this.selected = index
    if (index >= 0) this.host.sound.ui('pick')
    this.renderTools()
  }

  private renderTools() {
    const item = this.items[this.selected]
    const entry = item && entryOf(item.m)
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
      row.append(tool('Tourner à gauche (Maj+R)', 'arrow-counter-clockwise', () => this.rotate(-1)), tool('Tourner à droite (R)', 'arrow-clockwise', () => this.rotate(1)))
    }
    if (!entry.fixed) row.append(tool('Retirer (Suppr)', 'trash', () => this.remove(), 'ed-remove'))
    this.tools.append(name)
    if (row.children.length) this.tools.append(row)
    if (entry.variants) {
      const variants = document.createElement('div')
      variants.className = 'ed-variants'
      for (const v of entry.variants) {
        const b = document.createElement('button')
        b.title = v.label
        b.setAttribute('aria-label', v.label)
        b.classList.toggle('active', v.id === item.v)
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
        b.onclick = () => this.setVariant(v.id)
        variants.appendChild(b)
      }
      this.tools.append(variants)
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
    if (why) return this.refuse(`Pas la place de le tourner : ${why.charAt(0).toLowerCase()}${why.slice(1)}`)
    this.commit(this.candidate(probe).items, i)
    this.host.sound.ui('rotate')
  }

  private setVariant(id: string) {
    const i = this.selected
    const item = this.items[i]
    if (!item || item.v === id) return
    const next = cloneLayout(this.items)
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
    if (entry.fixed) return this.refuse('Le Holo-Me ne se range pas : déplacez-le plutôt')
    // Ce qui était posé dessus part avec lui (Ctrl+Z pour tout récupérer).
    const gone = new Set([i, ...ridersOf(this.view, this.items, i)])
    this.commit(this.items.filter((_, j) => !gone.has(j)), -1)
    this.host.sound.ui('drop')
    if (gone.size > 1) this.toast(`${entry.name} retiré, avec ce qui était posé dessus (Ctrl+Z pour annuler)`)
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
    const next = cloneLayout(this.items)
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
    // Les petits pas qui se suivent ne font qu'une seule étape d'annulation.
    const merge = performance.now() - this.lastNudge < 800
    this.lastNudge = performance.now()
    this.commit(next, i, merge)
  }

  // ---------------------------------------------------------------- historique

  private commit(next: CabinItem[], select: number, merge = false) {
    if (sameLayout(next, this.items)) return
    if (!merge || !this.past.length) this.past.push(this.items)
    if (this.past.length > HISTORY) this.past.shift()
    this.future = []
    this.apply(next, select)
  }

  private apply(next: CabinItem[], select: number) {
    this.items = next
    this.view.setLayout(next)
    this.selected = select < next.length ? select : -1
    this.renderTools()
    this.renderBar()
    this.host.onChange(cloneLayout(next))
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

  /** Retour aux quartiers d'origine (deuxième clic pour confirmer ; Ctrl+Z pour revenir). */
  private reset() {
    if (performance.now() - this.confirmReset > 3000) {
      this.confirmReset = performance.now()
      this.resetBtn.classList.add('confirm')
      this.resetBtn.lastChild!.textContent = 'Confirmer ?'
      setTimeout(() => this.renderBar(), 3000)
      return
    }
    this.confirmReset = 0
    this.cancelHeld()
    this.commit(cloneLayout(DEFAULT_CABIN), -1)
    this.toast('Quartiers remis comme au premier jour (Ctrl+Z pour annuler)')
  }

  private renderBar() {
    this.countEl.textContent = `${this.items.length} / ${MAX_ITEMS} objets`
    this.undoBtn.disabled = !this.past.length
    this.redoBtn.disabled = !this.future.length
    if (performance.now() - this.confirmReset > 3000) {
      this.resetBtn.classList.remove('confirm')
      this.resetBtn.lastChild!.textContent = 'Réinitialiser'
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
    else if (e.code === 'Escape') {
      if (this.held) this.cancelHeld()
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
    const parts: [string, string][] = this.held
      ? this.held.index < 0
        ? [['Clic', 'poser'], ['Maj+clic', 'en poser plusieurs'], ['R', 'tourner'], ['Échap', 'annuler']]
        : [['Relâcher', 'poser'], ['R', 'tourner'], ['Échap', 'annuler']]
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

  /** Quadrillage discret du sol de la cabine (une ligne par bord de tuile). */
  private makeGrid(): THREE.LineSegments {
    const b = this.view.bounds
    const pts: THREE.Vector3[] = []
    for (let x = Math.ceil(b.minX - 0.5) + 0.5; x < b.maxX; x++) pts.push(new THREE.Vector3(x, 0.006, b.minZ), new THREE.Vector3(x, 0.006, b.maxZ))
    for (let z = Math.ceil(b.minZ - 0.5) + 0.5; z < b.maxZ; z++) pts.push(new THREE.Vector3(b.minX, 0.006, z), new THREE.Vector3(b.maxX, 0.006, z))
    const grid = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: '#59d8ff', transparent: true, opacity: 0.22, depthWrite: false }),
    )
    grid.renderOrder = 1
    return grid
  }
}
