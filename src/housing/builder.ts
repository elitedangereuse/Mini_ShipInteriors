import * as THREE from 'three'
import type { Sound } from '../audio'
import type { IsoCamera } from '../camera'
import { WALL_T, type Deck } from '../deck'
import { EN, tr } from '../i18n'
import { icon, type IconName } from '../icons'
import { DIRS } from '../map'
import { drawPartition, HALF_H, PARTITION_KINDS, partitionCenter } from '../cabin/partitions'
import { FINISH_THUMB, paintThumb, stylesOf, styleOf, type Slot } from '../cabin/finishes'
import { clonePlan, sameFinish } from './home'
import { partitionEdge, partitionKey } from '../../shared/cabin-partitions.js'
import {
  cellAt, cellIndex, finishCounts, HOME_DOOR_KINDS, isHomeDoor, MAX_FINISHES, MAX_HOME_WALLS, wallRefusal,
  type HomeFinish, type HomePlan, type PlanWall, type WallRefusal,
} from '../../shared/housing-home.js'
import { inPlot, LANDING_ROOM, plotRect, type PlotRect } from '../../shared/housing-plot.js'

/*
 * Mode construction de la parcelle (housing v2, cf. docs/housing-v2.md) : sur le pont des
 * quartiers, chez soi, `B` ou « Aménager » ouvre la vue d'architecte sur sa bulle. Trois onglets,
 * chacun avec ses outils (touches 1 à 4), et un seul historique (Ctrl+Z, Ctrl+Y) :
 *
 * « Murs » : un type de mur (plein, demi-mur, à hublot, arche, ou l'une des portes), puis
 *   - Tracer : un clic pose un mur sur la ligne du quadrillage visée, glisser en trace une ligne ;
 *   - Pièce : glisser d'un coin à l'autre pose les quatre murs d'une pièce (pleins, ou du type
 *     choisi s'il n'a pas de passage : on y perce ensuite ses portes) ;
 *   - Gomme, et Pipette (reprend le type d'un mur posé).
 *   Sur le pourtour, un mur remplace le champ de force (et le rend s'il est gommé). Une partie de
 *   la parcelle qu'on ne rejoint plus depuis l'ascenseur est signalée : il lui manque une porte.
 *
 * « Papier peint » : un revêtement (motif et teinte), puis
 *   - Pinceau : la face de mur visée, ou toutes celles qu'on survole en glissant ;
 *   - Pièce : toutes les faces tournées vers la pièce visée (la zone fermée par les murs) ;
 *   - Gomme, et Pipette ; « Tous les murs » habille d'un coup toutes les faces.
 *
 * « Sol » : un revêtement, puis
 *   - Pinceau : la case visée, ou un rectangle en glissant ;
 *   - Remplir : la pièce visée (toute la parcelle si rien ne la ferme) ;
 *   - Gomme (retour à la dalle du vaisseau), et Pipette.
 *
 * Seize revêtements au plus pour le sol, seize pour le papier peint (cf. shared/housing-home.js).
 */

type Mode = 'walls' | 'paper' | 'floor'

/** Vue plongeante, comme le mode aménagement des anciens quartiers. */
export const BUILD_ELEVATION = THREE.MathUtils.degToRad(56)
const HISTORY = 80
/** Écran étroit : le panneau est une feuille en bas, sur 38 % de la hauteur (cf. style.css). */
const NARROW = 720
const SHEET = 0.38
const THUMB = 96

export interface BuilderHost {
  canvas: HTMLCanvasElement
  iso: IsoCamera
  sound: Sound
  /** Le plan a changé : à poser sur la parcelle et à enregistrer. */
  onChange: (plan: HomePlan) => void
  /** Le joueur quitte le mode construction (Terminer, Échap, B). */
  onClose: () => void
}

/** Noms des types de murs, dans l'ordre de l'onglet. */
const NAMES: Record<string, string> = {
  wall: tr('Mur', 'Wall'),
  half: tr('Demi-mur', 'Half wall'),
  window: tr('Mur à hublot', 'Porthole wall'),
  arch: tr('Mur avec arche', 'Archway'),
  ...Object.fromEntries(PARTITION_KINDS.filter((k) => k.door && k.id !== 'arch').map((k) => [k.id, k.name])),
}
const WALL_GROUP = ['wall', 'half', 'window', 'arch']
const DOOR_GROUP = HOME_DOOR_KINDS.filter((k) => k !== 'arch')

interface ToolDef {
  id: string
  name: string
  glyph: IconName
}
const ERASE: ToolDef = { id: 'erase', name: tr('Gomme', 'Eraser'), glyph: 'eraser' }
const PICK: ToolDef = { id: 'pick', name: tr('Pipette', 'Picker'), glyph: 'eyedropper' }
const TOOLS: Record<Mode, ToolDef[]> = {
  walls: [{ id: 'line', name: tr('Tracer', 'Draw'), glyph: 'line-segment' }, { id: 'rect', name: tr('Pièce', 'Room'), glyph: 'rectangle' }, ERASE, PICK],
  paper: [{ id: 'face', name: tr('Pinceau', 'Brush'), glyph: 'paint-brush' }, { id: 'room', name: tr('Pièce', 'Room'), glyph: 'rectangle' }, ERASE, PICK],
  floor: [{ id: 'brush', name: tr('Pinceau', 'Brush'), glyph: 'paint-brush' }, { id: 'fill', name: tr('Remplir', 'Fill'), glyph: 'paint-roller' }, ERASE, PICK],
}

const REFUSALS: Record<WallRefusal | 'full', string> = {
  outside: tr('Hors de votre parcelle', 'Outside your plot'),
  landing: tr('C\'est le mur du palier de l\'ascenseur', 'That is the lift landing\'s wall'),
  void: tr('Une porte sur le pourtour donnerait sur le vide', 'A door on the edge would open onto the void'),
  full: tr(`${MAX_HOME_WALLS} murs au plus`, `${MAX_HOME_WALLS} walls at most`),
}
const TOO_MANY: Record<Slot, string> = {
  floor: tr(`${MAX_FINISHES} revêtements de sol au plus : réutilisez-en un (pipette)`, `${MAX_FINISHES} floorings at most: reuse one (picker)`),
  wall: tr(`${MAX_FINISHES} papiers peints au plus : réutilisez-en un (pipette)`, `${MAX_FINISHES} wallpapers at most: reuse one (picker)`),
}

const GHOST_OK = new THREE.Color('#7dffa8')
const GHOST_NO = new THREE.Color('#ff4f5e')
const GHOST_ERASE = new THREE.Color('#ffb03a')
const GHOST_SAME = new THREE.Color('#9fdcff')

type Effect = 'set' | 'remove' | 'same' | 'refused'
const effectColor = (e: Effect) => (e === 'refused' ? GHOST_NO : e === 'remove' ? GHOST_ERASE : e === 'same' ? GHOST_SAME : GHOST_OK)

/** Ce que ferait l'outil « Murs » sur une arête : poser, retirer, rien (déjà ainsi), ou un refus. */
interface Step {
  wall: PlanWall
  key: string
  effect: Effect
  refusal?: string
}

/** Face d'un mur : le mur, et son côté (`a` vers sa tuile, au nord ou à l'ouest ; `b` vers la voisine). */
interface Face {
  wall: PlanWall
  side: 'a' | 'b'
}

/** Changement en attente (aperçu) : le plan qui en résulterait, ou un refus, ou rien. */
interface Pending {
  plan: HomePlan | null
  refusal: string | null
}

const keyOf = (w: { x: number; z: number; e: 'v' | 'h' }) => partitionKey(w)
const faceKey = (f: Face) => `${keyOf(f.wall)}:${f.side}`

/** Normale d'une face (vers la pièce qu'elle regarde). */
function normalOf(f: Face): { dx: number; dz: number } {
  const d = DIRS[partitionEdge(f.wall).dir]
  return f.side === 'a' ? { dx: -d.dx, dz: -d.dz } : { dx: d.dx, dz: d.dz }
}

export class HomeBuilder {
  private open = false
  private plan: HomePlan = { walls: [], floor: [] }
  private stage = 0
  private past: HomePlan[] = []
  private future: HomePlan[] = []
  private mode: Mode = 'walls'
  private tools: Record<Mode, string> = { walls: 'line', paper: 'face', floor: 'brush' }
  private kind = 'wall'
  private paper: HomeFinish
  private flooring: HomeFinish
  /** Trait en cours : l'arête, le coin ou la case où il a commencé ; les faces déjà peintes. */
  private stroke: { edge?: PlanWall; corner?: { x: number; z: number }; cell?: { x: number; z: number }; faces?: Map<string, Face> } | null = null
  private steps: Step[] = []
  private pending: Pending = { plan: null, refusal: null }
  private lastPointer: { clientX: number; clientY: number } | null = null
  private pointerDirty = false

  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()
  private readonly plane = new THREE.Plane()
  private readonly hit = new THREE.Vector3()
  /** Aperçus des murs visés, un par arête (réutilisés d'un trait à l'autre). */
  private readonly ghosts: THREE.Mesh[] = []
  private readonly ghostGeo = new THREE.BoxGeometry(1, 1, 0.34)
  /** Aperçus des faces visées (papier peint). */
  private readonly faceMarks: THREE.Mesh[] = []
  private readonly faceGeo = new THREE.PlaneGeometry(1, 1)
  /** Aperçu des cases visées (sol) : un maillage, des quadrilatères colorés. */
  private readonly cells: THREE.Mesh
  private readonly corner: THREE.Mesh
  private grid = new THREE.Group()
  private readonly helpers = new THREE.Group()

  private readonly root = document.createElement('div')
  private readonly bar: HTMLElement
  private readonly countEl: HTMLElement
  private readonly warnEl: HTMLElement
  private readonly undoBtn: HTMLButtonElement
  private readonly redoBtn: HTMLButtonElement
  private readonly modeEls = new Map<Mode, HTMLButtonElement>()
  private readonly body: HTMLElement
  private toolEls = new Map<string, HTMLButtonElement>()
  private kindEls = new Map<string, HTMLButtonElement>()
  private finishEls: { cards: Map<string, HTMLButtonElement>; colors: HTMLElement; style: string } | null = null
  private readonly hint: HTMLElement
  private readonly status: HTMLElement
  private readonly keysEl: HTMLElement

  constructor(
    private deck: Deck,
    private host: BuilderHost,
  ) {
    const first = (slot: Slot): HomeFinish => {
      const s = stylesOf(slot)[0]
      return { style: s.id, color: s.palette[0] }
    }
    this.paper = first('wall')
    this.flooring = first('floor')

    this.corner = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.04, 16),
      new THREE.MeshBasicMaterial({ color: '#59d8ff', transparent: true, opacity: 0.8, depthTest: false }),
    )
    this.corner.renderOrder = 6
    this.corner.visible = false
    this.cells = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.42, depthWrite: false, depthTest: false }))
    this.cells.renderOrder = 5
    this.cells.frustumCulled = false
    this.helpers.add(this.corner, this.grid, this.cells)
    this.helpers.visible = false
    deck.group.add(this.helpers)

    this.root.className = 'editor builder'
    this.root.hidden = true

    // Barre du haut : titre, compteur, accessibilité, annuler, rétablir, terminer.
    const bar = (this.bar = document.createElement('div'))
    bar.className = 'panel ed-bar'
    const title = document.createElement('div')
    title.className = 'ed-title'
    title.textContent = tr('Construction des quartiers', 'Building your quarters')
    this.countEl = document.createElement('div')
    this.countEl.className = 'ed-count'
    this.warnEl = document.createElement('div')
    this.warnEl.className = 'ed-save error'
    const info = document.createElement('div')
    info.className = 'ed-info'
    info.append(title, this.countEl, this.warnEl)
    const button = (label: string, glyph: IconName, onClick: () => void, cls = '') => {
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
    const actions = document.createElement('div')
    actions.className = 'ed-actions'
    actions.append(this.undoBtn, this.redoBtn, done)
    bar.append(info, actions)

    // Panneau : les onglets, puis ceux de l'onglet ouvert (outils, types de murs ou revêtements).
    const panel = document.createElement('div')
    panel.className = 'panel ed-catalog'
    const modes = document.createElement('div')
    modes.className = 'ed-modes'
    const MODES: [Mode | null, string, IconName][] = [
      ['walls', tr('Murs', 'Walls'), 'wall'],
      ['paper', tr('Papier peint', 'Wallpaper'), 'paint-roller'],
      ['floor', tr('Sol', 'Floor'), 'square-half'],
      [null, tr('Mobilier', 'Furniture'), 'couch'],
    ]
    for (const [mode, label, glyph] of MODES) {
      const b = document.createElement('button')
      b.append(icon(glyph), document.createTextNode(label))
      b.title = mode ? label : tr(`${label} : bientôt`, `${label}: coming soon`)
      b.disabled = !mode
      if (mode) {
        b.onclick = () => this.setMode(mode)
        this.modeEls.set(mode, b)
      }
      modes.appendChild(b)
    }
    this.body = document.createElement('div')
    this.body.className = 'ed-cards finish'
    panel.append(modes, this.body)
    panel.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true })

    this.hint = document.createElement('div')
    this.hint.className = 'ed-hint'
    this.status = document.createElement('span')
    this.status.className = 'ed-status'
    this.keysEl = document.createElement('span')
    this.hint.append(this.status, this.keysEl)
    this.root.append(bar, panel, this.hint)
    for (const el of [bar, panel]) el.addEventListener('pointerdown', (e) => e.stopPropagation())
    const editor = document.getElementById('editor')
    if (editor) editor.after(this.root)
    else document.body.appendChild(this.root)
    this.setMode('walls')
  }

  get active(): boolean {
    return this.open
  }

  /** Centre de la parcelle (coordonnées monde) : la caméra le suit pendant la construction. */
  get focus(): THREE.Vector3 {
    const r = plotRect(this.stage)
    return new THREE.Vector3((r.minX + r.maxX) / 2, this.deck.y, (r.minZ + r.maxZ) / 2)
  }

  // ---------------------------------------------------------------- ouverture

  start(plan: HomePlan, stage: number) {
    this.plan = clonePlan(plan)
    this.stage = stage
    this.past = []
    this.future = []
    this.stroke = null
    this.open = true
    this.root.hidden = false
    this.helpers.visible = true
    this.buildGrid()
    this.setMode(this.mode)
  }

  stop() {
    if (!this.open) return
    this.open = false
    this.root.hidden = true
    this.helpers.visible = false
    this.deck.home!.solid = false
    this.clearPreview()
    this.setStatus(null)
  }

  /** Quadrillage de la parcelle, pourtour compris. */
  private buildGrid() {
    for (const m of this.grid.children) (m as THREE.LineSegments).geometry.dispose()
    this.grid.clear()
    const r = plotRect(this.stage)
    const pts: number[] = []
    const y = 0.012
    for (let x = r.minX - 0.5; x <= r.maxX + 0.5; x++) pts.push(x, y, r.minZ - 0.5, x, y, r.maxZ + 0.5)
    for (let z = r.minZ - 0.5; z <= r.maxZ + 0.5; z++) pts.push(r.minX - 0.5, y, z, r.maxX + 0.5, y, z)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#59d8ff', transparent: true, opacity: 0.22, depthWrite: false }))
    lines.renderOrder = 2
    this.grid.add(lines)
  }

  // ---------------------------------------------------------------- caméra

  /** Zone de l'écran laissée à la parcelle, et le décalage de son centre (panneau à droite, ou en bas). */
  private visible(): { w: number; h: number; dx: number; dy: number } {
    if (innerWidth > NARROW) {
      const panel = Math.min(360, innerWidth * 0.3)
      return { w: innerWidth - panel, h: innerHeight, dx: panel / 2, dy: 0 }
    }
    const top = this.bar.getBoundingClientRect().bottom + 8
    const bottom = innerHeight * (1 - SHEET) - 8
    return { w: innerWidth, h: Math.max(80, bottom - top), dx: 0, dy: innerHeight / 2 - (top + bottom) / 2 }
  }

  /** Zoom qui fait tenir la parcelle et le palier dans la zone visible, sous les quatre vues. */
  fitZoom(): number {
    const r = plotRect(this.stage)
    const b = { minX: Math.min(r.minX, landing(this.deck).minX) - 0.5, maxX: r.maxX + 0.5, minZ: r.minZ - 0.5, maxZ: r.maxZ + 0.5 }
    const center = this.focus
    const v = this.visible()
    const s = Math.sin(BUILD_ELEVATION), c = Math.cos(BUILD_ELEVATION)
    let wide = 0, tall = 0
    for (let q = 0; q < 4; q++) {
      const a = Math.PI / 4 + (q * Math.PI) / 2
      for (const x of [b.minX, b.maxX]) {
        for (const z of [b.minZ, b.maxZ]) {
          const dx = x - center.x, dz = z - center.z
          wide = Math.max(wide, Math.abs(dx * Math.cos(a) - dz * Math.sin(a)))
          const away = -(dx * Math.sin(a) + dz * Math.cos(a)) * s
          tall = Math.max(tall, Math.abs(away - 0.4 * c), Math.abs(away + 0.6 * c))
        }
      }
    }
    return 1.08 * Math.max((wide * innerHeight) / v.w, (tall * innerHeight) / v.h)
  }

  /** La parcelle au milieu de la zone que le panneau laisse visible. */
  frameCamera() {
    const v = this.visible()
    this.host.iso.frameCenter(v.dx, v.dy, innerHeight)
  }

  // ---------------------------------------------------------------- onglets et outils

  private get tool(): string {
    return this.tools[this.mode]
  }

  private setMode(mode: Mode) {
    this.mode = mode
    this.stroke = null
    for (const [id, b] of this.modeEls) b.classList.toggle('active', id === mode)
    // Les murs restent pleins pour qu'on les bâtisse et les habille ; on les estompe pour voir le sol.
    this.deck.home!.solid = mode !== 'floor'
    this.body.replaceChildren()
    this.kindEls = new Map()
    this.finishEls = null
    const intro = document.createElement('div')
    intro.className = 'ed-rooms-intro'
    intro.textContent = {
      walls: tr(
        'Bâtissez vos pièces sur le quadrillage : choisissez un type de mur, puis tracez. Sur le bord, un mur remplace le champ de force. C\'est gratuit.',
        'Build your rooms on the grid: pick a wall type, then draw. On the edge, a wall replaces the force field. It\'s free.',
      ),
      paper: tr(
        'Habillez chaque face de mur : un papier peint, puis une face, une pièce entière, ou tous les murs d\'un coup.',
        'Dress each side of your walls: pick a wallpaper, then a side, a whole room, or every wall at once.',
      ),
      floor: tr(
        'Posez un revêtement case par case, en rectangle (glisser), ou sur toute une pièce (Remplir). La gomme rend la dalle du vaisseau.',
        'Lay a flooring tile by tile, as a rectangle (drag), or over a whole room (Fill). The eraser brings back the ship\'s deck plates.',
      ),
    }[mode]
    const tools = document.createElement('div')
    tools.className = 'ed-room-chips hb-tools'
    this.toolEls = new Map()
    TOOLS[mode].forEach((t, i) => {
      const b = document.createElement('button')
      b.title = `${t.name} (${i + 1})`
      b.append(icon(t.glyph), document.createTextNode(t.name))
      b.onclick = () => this.setTool(t.id)
      tools.appendChild(b)
      this.toolEls.set(t.id, b)
    })
    this.body.append(intro, tools)
    if (mode === 'walls') {
      const group = (label: string, kinds: string[]) => {
        const head = document.createElement('div')
        head.className = 'ed-cat-title'
        head.textContent = label
        const grid = document.createElement('div')
        grid.className = 'ed-finishes'
        for (const id of kinds) {
          const b = document.createElement('button')
          b.className = 'ed-finish'
          b.title = NAMES[id]
          const canvas = document.createElement('canvas')
          canvas.width = canvas.height = THUMB
          drawPartition(canvas, id)
          const name = document.createElement('span')
          name.textContent = NAMES[id]
          b.append(canvas, name)
          b.onclick = () => this.setKind(id)
          grid.appendChild(b)
          this.kindEls.set(id, b)
        }
        return [head, grid]
      }
      this.body.append(...group(tr('Murs', 'Walls'), WALL_GROUP), ...group(tr('Portes', 'Doors'), DOOR_GROUP))
      this.refreshKinds()
    } else {
      if (mode === 'paper') {
        const all = document.createElement('button')
        all.className = 'hb-all'
        all.append(icon('paint-roller'), document.createTextNode(tr('Tous les murs', 'Every wall')))
        all.title = tr('Ce papier peint sur toutes les faces de tous les murs', 'This wallpaper on every side of every wall')
        all.onclick = () => this.paperAll()
        tools.appendChild(all)
      }
      this.renderFinishes(mode === 'paper' ? 'wall' : 'floor')
    }
    this.setTool(this.tool)
    this.renderBar()
  }

  private setTool(tool: string) {
    this.tools[this.mode] = tool
    this.stroke = null
    for (const [id, b] of this.toolEls) b.classList.toggle('active', id === tool)
    const passive = tool === 'erase' || tool === 'pick'
    for (const b of this.kindEls.values()) b.classList.toggle('dim', passive)
    for (const b of this.finishEls?.cards.values() ?? []) b.classList.toggle('dim', passive)
    this.pointerDirty = true
    this.setHint()
  }

  private setKind(kind: string) {
    this.kind = kind
    this.refreshKinds()
    // Une porte se perce dans un mur : on la pose au trait, pas en traçant une pièce.
    if (this.tool === 'erase' || this.tool === 'pick' || (this.tool === 'rect' && HOME_DOOR_KINDS.includes(kind))) this.setTool('line')
    this.host.sound.ui('pick')
  }

  private refreshKinds() {
    for (const [id, b] of this.kindEls) b.classList.toggle('active', id === this.kind)
  }

  // ---------------------------------------------------------------- revêtements

  private finishOf(slot: Slot): HomeFinish {
    return slot === 'wall' ? this.paper : this.flooring
  }

  /** Motifs (vignettes) et nuancier du revêtement choisi, pour le papier peint ou le sol. */
  private renderFinishes(slot: Slot) {
    const head = document.createElement('div')
    head.className = 'ed-cat-title'
    head.textContent = slot === 'wall' ? tr('Papiers peints', 'Wallpapers') : tr('Revêtements de sol', 'Floorings')
    const grid = document.createElement('div')
    grid.className = 'ed-finishes'
    const cards = new Map<string, HTMLButtonElement>()
    for (const style of stylesOf(slot)) {
      const b = document.createElement('button')
      b.className = 'ed-finish'
      b.title = style.name
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = FINISH_THUMB
      paintThumb(canvas, slot, { style: style.id, color: style.palette[0] })
      const name = document.createElement('span')
      name.textContent = style.name
      b.append(canvas, name)
      b.onclick = () => this.setFinish(slot, { style: style.id, color: this.finishOf(slot).style === style.id ? this.finishOf(slot).color : style.palette[0] })
      grid.appendChild(b)
      cards.set(style.id, b)
    }
    const colors = document.createElement('div')
    colors.className = 'ed-colors'
    this.body.append(head, grid, colors)
    this.finishEls = { cards, colors, style: '' }
    this.refreshFinishes(slot)
  }

  private setFinish(slot: Slot, finish: HomeFinish, quiet = false) {
    if (slot === 'wall') this.paper = finish
    else this.flooring = finish
    this.refreshFinishes(slot)
    if (this.tool === 'erase' || this.tool === 'pick') this.setTool(TOOLS[this.mode][0].id)
    if (!quiet) this.host.sound.ui('pick')
    this.pointerDirty = true
  }

  /** Carte du motif choisi (dans sa teinte) et nuancier de ce motif. */
  private refreshFinishes(slot: Slot) {
    const els = this.finishEls
    if (!els) return
    const finish = this.finishOf(slot)
    for (const [id, b] of els.cards) b.classList.toggle('active', id === finish.style)
    const card = els.cards.get(finish.style)
    if (card) paintThumb(card.querySelector('canvas')!, slot, finish)
    if (els.style !== finish.style) {
      els.style = finish.style
      els.colors.replaceChildren()
      for (const color of styleOf(slot, finish.style)?.palette ?? []) {
        const b = document.createElement('button')
        b.className = 'ed-swatch'
        b.dataset.color = color
        b.title = color
        b.setAttribute('aria-label', tr(`Teinte ${color}`, `Colour ${color}`))
        b.style.setProperty('--swatch', color)
        b.onclick = () => this.setFinish(slot, { style: this.finishOf(slot).style, color })
        els.colors.appendChild(b)
      }
      const custom = document.createElement('label')
      custom.className = 'ed-swatch custom'
      custom.title = tr('Autre teinte', 'Custom colour')
      const input = document.createElement('input')
      input.type = 'color'
      input.oninput = () => this.setFinish(slot, { style: this.finishOf(slot).style, color: input.value.toLowerCase() }, true)
      custom.append(icon('palette'), input)
      els.colors.appendChild(custom)
    }
    for (const b of els.colors.querySelectorAll<HTMLElement>('[data-color]')) b.classList.toggle('active', b.dataset.color === finish.color)
    const input = els.colors.querySelector('input')
    if (input && input.value !== finish.color) input.value = finish.color
    els.colors.querySelector('.custom')?.classList.toggle('active', !styleOf(slot, finish.style)?.palette.includes(finish.color))
  }

  // ---------------------------------------------------------------- visée

  /** Rayon sous le curseur. */
  private ray(e: { clientX: number; clientY: number }): THREE.Ray {
    this.pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.host.iso.camera)
    return this.raycaster.ray
  }

  /** Point du sol de la parcelle sous le curseur. */
  private ground(e: { clientX: number; clientY: number }): THREE.Vector3 | null {
    this.plane.set(new THREE.Vector3(0, 1, 0), -this.deck.y)
    return this.ray(e).intersectPlane(this.plane, this.hit)
  }

  /** Case de la parcelle sous le point, ou null. */
  private cellUnder(p: THREE.Vector3 | null): { x: number; z: number } | null {
    if (!p) return null
    const x = Math.round(p.x), z = Math.round(p.z)
    return inPlot(this.stage, x, z) ? { x, z } : null
  }

  /** Arête du quadrillage la plus proche du point visé (dans la parcelle ou sur son bord). */
  private edgeAt(p: THREE.Vector3): PlanWall | null {
    const r = plotRect(this.stage)
    if (p.x < r.minX - 0.9 || p.x > r.maxX + 0.9 || p.z < r.minZ - 0.9 || p.z > r.maxZ + 0.9) return null
    const tx = Math.round(p.x), tz = Math.round(p.z)
    const fx = p.x - tx, fz = p.z - tz
    if (0.5 - Math.abs(fx) < 0.5 - Math.abs(fz)) return { x: fx > 0 ? tx : tx - 1, z: tz, e: 'v' }
    return { x: tx, z: fz > 0 ? tz : tz - 1, e: 'h' }
  }

  /** Sommet du quadrillage le plus proche (demi-entiers), borné au pourtour de la parcelle. */
  private cornerAt(p: THREE.Vector3): { x: number; z: number } {
    const r = plotRect(this.stage)
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo - 0.5, Math.min(hi + 0.5, Math.round(v - 0.5) + 0.5))
    return { x: clamp(p.x, r.minX, r.maxX), z: clamp(p.z, r.minZ, r.maxZ) }
  }

  /** Face de mur posé sous le curseur (la plus proche de la caméra, tournée vers elle). */
  private faceAt(e: { clientX: number; clientY: number }): Face | null {
    const ray = this.ray(e)
    const t = WALL_T / 2
    let best: { face: Face; d: number } | null = null
    const n = new THREE.Vector3()
    for (const wall of this.deck.home!.placed) {
      const { cx, cz, alongX } = partitionCenter(wall)
      const h = wall.k === 'half' ? HALF_H : 1
      for (const side of ['a', 'b'] as const) {
        const face = { wall, side }
        const { dx, dz } = normalOf(face)
        n.set(dx, 0, dz)
        const denom = ray.direction.dot(n)
        if (denom >= -1e-6) continue
        this.plane.set(n, -(n.x * (cx + dx * t) + n.z * (cz + dz * t)))
        const p = ray.intersectPlane(this.plane, this.hit)
        if (!p) continue
        const along = alongX ? p.x - cx : p.z - cz
        const y = p.y - this.deck.y
        if (Math.abs(along) > 0.5 || y < 0 || y > h) continue
        const d = p.distanceTo(ray.origin)
        if (!best || d < best.d) best = { face, d }
      }
    }
    return best?.face ?? null
  }

  /** Cases d'une pièce : celles qu'on rejoint depuis `start` sans franchir un mur ni une porte. */
  private room(start: { x: number; z: number }): { x: number; z: number }[] {
    const map = this.deck.map
    const seen = new Set([`${start.x},${start.z}`])
    const out = [start]
    for (let i = 0; i < out.length; i++) {
      const { x, z } = out[i]
      for (let dir = 0; dir < 4; dir++) {
        const nx = x + DIRS[dir].dx, nz = z + DIRS[dir].dz
        const k = `${nx},${nz}`
        if (seen.has(k) || !inPlot(this.stage, nx, nz) || map.edge(x, z, dir) !== 'open') continue
        seen.add(k)
        out.push({ x: nx, z: nz })
      }
    }
    return out
  }

  /** Faces de murs tournées vers ces cases. */
  private facesToward(cells: { x: number; z: number }[]): Face[] {
    const byEdge = new Map(this.deck.home!.placed.map((w) => [keyOf(w), w]))
    const out: Face[] = []
    for (const c of cells) {
      for (let dir = 0; dir < 4; dir++) {
        // L'arête entre la case et sa voisine, écrite depuis la tuile à l'ouest ou au nord.
        const forward = dir === 1 || dir === 2
        const at = forward ? { x: c.x, z: c.z, e: dir === 1 ? 'v' : 'h' } as const : { x: c.x + DIRS[dir].dx, z: c.z + DIRS[dir].dz, e: dir === 3 ? 'v' : 'h' } as const
        const wall = byEdge.get(keyOf(at))
        if (wall) out.push({ wall, side: forward ? 'a' : 'b' })
      }
    }
    return out
  }

  // ---------------------------------------------------------------- aperçus

  /** Vise sous le curseur : calcule le changement en attente et son aperçu. */
  private aim(e: { clientX: number; clientY: number }) {
    this.clearPreview()
    this.pending = { plan: null, refusal: null }
    if (this.mode === 'walls') this.aimWalls(e)
    else if (this.mode === 'paper') this.aimPaper(e)
    else this.aimFloor(e)
    this.setStatus(this.pending.plan ? null : this.pending.refusal)
  }

  private clearPreview() {
    for (const m of this.ghosts) m.visible = false
    for (const m of this.faceMarks) m.visible = false
    this.cells.visible = false
    this.corner.visible = false
  }

  // -- murs

  private aimWalls(e: { clientX: number; clientY: number }) {
    const p = this.ground(e)
    if (!p) return
    let edges: PlanWall[] = []
    if (this.tool === 'rect') {
      const c = this.cornerAt(p)
      this.corner.visible = true
      this.corner.position.set(c.x, 0.03, c.z)
      if (this.stroke?.corner) edges = this.rectFrom(this.stroke.corner, c)
    } else if (this.tool === 'pick') {
      const at = this.edgeAt(p)
      const existing = at && this.plan.walls.find((w) => keyOf(w) === keyOf(at))
      this.showGhosts(existing ? [{ wall: existing, key: keyOf(existing), effect: 'same' }] : [])
      if (at && !existing) this.pending.refusal = tr('Pas de mur ici', 'No wall here')
      return
    } else {
      const start = this.stroke?.edge
      const at = this.edgeAt(p)
      edges = start ? this.lineFrom(start, p) : at ? [at] : []
    }
    this.steps = this.wallSteps(edges)
    this.showGhosts(this.steps)
    const changes = this.steps.filter((s) => s.effect === 'set' || s.effect === 'remove')
    // Un refus s'affiche seulement s'il n'y a rien d'autre à faire (un trait qui longe le palier pose le reste).
    if (!changes.length) {
      this.pending.refusal = this.steps.find((s) => s.effect === 'refused')?.refusal ?? null
      return
    }
    const next = clonePlan(this.plan)
    const byKey = new Map(next.walls.map((w) => [keyOf(w), w]))
    for (const s of changes) {
      const old = byKey.get(s.key)
      if (s.effect === 'remove') byKey.delete(s.key)
      // Un mur remplacé garde son papier peint.
      else byKey.set(s.key, { ...s.wall, ...(old?.a ? { a: old.a } : {}), ...(old?.b ? { b: old.b } : {}) })
    }
    next.walls = [...byKey.values()]
    this.pending.plan = next
  }

  /** Mur du type choisi sur l'arête (`solid` : jamais de passage, pour l'outil Pièce). */
  private wallOn(at: { x: number; z: number; e: 'v' | 'h' }, solid = false): PlanWall {
    const w: PlanWall = { x: at.x, z: at.z, e: at.e }
    const k = solid && isHomeDoor({ ...w, k: this.kind }) ? 'wall' : this.kind
    if (k !== 'wall') w.k = k
    return w
  }

  /** Arêtes d'un trait : de l'arête de départ à celle visée, sur la même ligne. */
  private lineFrom(start: PlanWall, p: THREE.Vector3): PlanWall[] {
    const vertical = start.e === 'v'
    const from = vertical ? start.z : start.x
    const r = plotRect(this.stage)
    const to = vertical ? Math.max(r.minZ - 1, Math.min(r.maxZ + 1, Math.round(p.z))) : Math.max(r.minX - 1, Math.min(r.maxX + 1, Math.round(p.x)))
    const out: PlanWall[] = []
    for (let i = Math.min(from, to); i <= Math.max(from, to); i++) out.push(vertical ? { x: start.x, z: i, e: 'v' } : { x: i, z: start.z, e: 'h' })
    return out
  }

  /** Arêtes du contour d'une pièce, d'un coin à l'autre. */
  private rectFrom(a: { x: number; z: number }, b: { x: number; z: number }): PlanWall[] {
    const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x), minZ = Math.min(a.z, b.z), maxZ = Math.max(a.z, b.z)
    const out: PlanWall[] = []
    for (let x = minX + 0.5; x < maxX; x++) {
      out.push({ x, z: minZ - 0.5, e: 'h' })
      if (maxZ > minZ) out.push({ x, z: maxZ - 0.5, e: 'h' })
    }
    for (let z = minZ + 0.5; z < maxZ; z++) {
      out.push({ x: minX - 0.5, z, e: 'v' })
      if (maxX > minX) out.push({ x: maxX - 0.5, z, e: 'v' })
    }
    return out
  }

  /** Ce que ferait l'outil « Murs » sur ces arêtes. */
  private wallSteps(edges: PlanWall[]): Step[] {
    const byKey = new Map(this.plan.walls.map((w) => [keyOf(w), w]))
    let count = this.plan.walls.length
    const seen = new Set<string>()
    const steps: Step[] = []
    for (const at of edges) {
      const key = keyOf(at)
      if (seen.has(key)) continue
      seen.add(key)
      const existing = byKey.get(key)
      if (this.tool === 'erase') {
        steps.push({ wall: existing ?? at, key, effect: existing ? 'remove' : 'same' })
        continue
      }
      const wall = this.wallOn(at, this.tool === 'rect')
      const why = wallRefusal(this.deck.map, this.stage, wall)
      if (why) {
        steps.push({ wall, key, effect: 'refused', refusal: REFUSALS[why] })
        continue
      }
      if (existing && (existing.k ?? 'wall') === (wall.k ?? 'wall')) {
        steps.push({ wall, key, effect: 'same' })
        continue
      }
      if (!existing && ++count > MAX_HOME_WALLS) {
        steps.push({ wall, key, effect: 'refused', refusal: REFUSALS.full })
        continue
      }
      steps.push({ wall, key, effect: 'set' })
    }
    return steps
  }

  private showGhosts(steps: Step[]) {
    while (this.ghosts.length < steps.length) {
      const m = new THREE.Mesh(this.ghostGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.42, depthWrite: false, depthTest: false }))
      m.renderOrder = 5
      this.helpers.add(m)
      this.ghosts.push(m)
    }
    this.ghosts.forEach((m, i) => {
      const s = steps[i]
      m.visible = !!s
      if (!s) return
      const { cx, cz, alongX } = partitionCenter(s.wall)
      const low = s.wall.k === 'half'
      const door = isHomeDoor(s.wall)
      m.position.set(cx, low ? 0.25 : door ? 0.36 : 0.5, cz)
      m.rotation.y = alongX ? 0 : Math.PI / 2
      m.scale.set(1.02, low ? 0.5 : door ? 0.72 : 1.02, 1)
      ;(m.material as THREE.MeshBasicMaterial).color.copy(s.effect === 'set' && this.tool === 'erase' ? GHOST_ERASE : effectColor(s.effect))
    })
  }

  // -- papier peint

  private aimPaper(e: { clientX: number; clientY: number }) {
    const tool = this.tool
    let faces: Face[] = []
    if (tool === 'room') {
      const cell = this.cellUnder(this.ground(e))
      if (cell) faces = this.facesToward(this.room(cell))
      if (cell && !faces.length) this.pending.refusal = tr('Aucun mur autour de cette pièce', 'No walls around this room')
    } else {
      const face = this.faceAt(e)
      if (tool === 'pick') {
        if (face) this.showFaces([{ face, effect: face.wall[face.side] ? 'same' : 'refused' }])
        if (face && !face.wall[face.side]) this.pending.refusal = tr('Pas de papier peint ici', 'No wallpaper here')
        return
      }
      const stroke = this.stroke?.faces
      if (face && stroke) stroke.set(faceKey(face), face)
      faces = stroke ? [...stroke.values()] : face ? [face] : []
    }
    const erase = tool === 'erase'
    const marks = faces.map((face) => ({ face, effect: (erase ? (face.wall[face.side] ? 'remove' : 'same') : sameFinish(face.wall[face.side], this.paper) ? 'same' : 'set') as Effect }))
    this.showFaces(marks)
    this.paperPlan(marks.filter((m) => m.effect !== 'same').map((m) => m.face), erase ? null : this.paper)
  }

  /** Plan avec ce papier peint (ou aucun) sur ces faces, ou un refus. */
  private paperPlan(faces: Face[], finish: HomeFinish | null) {
    if (!faces.length) return
    const next = clonePlan(this.plan)
    const byKey = new Map(next.walls.map((w) => [keyOf(w), w]))
    for (const { wall, side } of faces) {
      const w = byKey.get(keyOf(wall))
      if (!w) continue
      if (finish) w[side] = { ...finish }
      else delete w[side]
    }
    if (finishCounts(next).paper > MAX_FINISHES) this.pending.refusal = TOO_MANY.wall
    else this.pending.plan = next
  }

  /** « Tous les murs » : le papier peint choisi sur toutes les faces. */
  private paperAll() {
    this.pending = { plan: null, refusal: null }
    const faces = this.deck.home!.placed.flatMap((wall) => (['a', 'b'] as const).map((side) => ({ wall, side })))
    this.paperPlan(faces.filter((f) => !sameFinish(f.wall[f.side], this.paper)), this.paper)
    if (this.pending.plan) this.commit()
    else this.refuse(this.pending.refusal ?? (faces.length ? tr('Tous les murs ont déjà ce papier peint', 'Every wall already has this wallpaper') : tr('Posez d\'abord des murs', 'Build some walls first')))
  }

  private showFaces(marks: { face: Face; effect: Effect }[]) {
    while (this.faceMarks.length < marks.length) {
      const m = new THREE.Mesh(this.faceGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false, depthTest: false, side: THREE.DoubleSide }))
      m.renderOrder = 5
      this.helpers.add(m)
      this.faceMarks.push(m)
    }
    this.faceMarks.forEach((m, i) => {
      const mark = marks[i]
      m.visible = !!mark
      if (!mark) return
      const { cx, cz } = partitionCenter(mark.face.wall)
      const { dx, dz } = normalOf(mark.face)
      const h = mark.face.wall.k === 'half' ? HALF_H : 1
      const off = WALL_T / 2 + 0.01
      m.position.set(cx + dx * off, h / 2, cz + dz * off)
      m.rotation.set(0, Math.atan2(dx, dz), 0)
      m.scale.set(0.96, h * 0.96, 1)
      ;(m.material as THREE.MeshBasicMaterial).color.copy(effectColor(mark.effect))
    })
  }

  // -- sol

  private aimFloor(e: { clientX: number; clientY: number }) {
    const tool = this.tool
    const cell = this.cellUnder(this.ground(e))
    let cells: { x: number; z: number }[] = []
    if (tool === 'fill') cells = cell ? this.room(cell) : []
    else if (tool === 'pick') {
      if (cell) {
        const has = !!this.plan.floor[cellIndex(cell.x, cell.z)]
        this.showCells([cell], has ? 'same' : 'refused')
        if (!has) this.pending.refusal = tr('Pas de revêtement ici', 'No flooring here')
      }
      return
    } else {
      const start = this.stroke?.cell
      const end = cell ?? (start && this.cellUnder(this.clampToPlot(this.ground(e))))
      if (start && end) {
        for (let z = Math.min(start.z, end.z); z <= Math.max(start.z, end.z); z++) {
          for (let x = Math.min(start.x, end.x); x <= Math.max(start.x, end.x); x++) cells.push({ x, z })
        }
      } else if (cell) cells = [cell]
    }
    const erase = tool === 'erase'
    const finish = erase ? null : this.flooring
    const changed = cells.filter((c) => !sameFinish(this.plan.floor[cellIndex(c.x, c.z)], finish))
    this.showCells(cells, changed.length ? (erase ? 'remove' : 'set') : 'same', new Set(changed.map((c) => `${c.x},${c.z}`)))
    if (!changed.length) return
    const next = clonePlan(this.plan)
    for (const c of changed) next.floor[cellIndex(c.x, c.z)] = finish && { ...finish }
    if (finishCounts(next).floor > MAX_FINISHES) this.pending.refusal = TOO_MANY.floor
    else this.pending.plan = next
  }

  /** Point ramené dans la parcelle (un rectangle tiré au-delà du bord s'arrête au bord). */
  private clampToPlot(p: THREE.Vector3 | null): THREE.Vector3 | null {
    if (!p) return null
    const r = plotRect(this.stage)
    return p.set(Math.max(r.minX, Math.min(r.maxX, p.x)), p.y, Math.max(r.minZ, Math.min(r.maxZ, p.z)))
  }

  /** Aperçu des cases : `effect` pour celles qui changent (`changed`), bleu pour les autres. */
  private showCells(cells: { x: number; z: number }[], effect: Effect, changed?: Set<string>) {
    const pos: number[] = [], col: number[] = [], index: number[] = []
    for (const c of cells) {
      const color = effectColor(changed && !changed.has(`${c.x},${c.z}`) ? 'same' : effect)
      const i = pos.length / 3
      for (const [dx, dz] of [[-0.46, -0.46], [0.46, -0.46], [0.46, 0.46], [-0.46, 0.46]]) {
        pos.push(c.x + dx, 0.02, c.z + dz)
        col.push(color.r, color.g, color.b)
      }
      index.push(i, i + 3, i + 2, i, i + 2, i + 1)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    geo.setIndex(index)
    this.cells.geometry.dispose()
    this.cells.geometry = geo
    this.cells.visible = cells.length > 0
  }

  // ---------------------------------------------------------------- changements

  /** Applique le changement en attente : un seul pas d'annulation. */
  private commit() {
    const next = this.pending.plan
    if (!next) {
      if (this.pending.refusal) this.refuse(this.pending.refusal)
      return
    }
    this.past.push(this.plan)
    if (this.past.length > HISTORY) this.past.shift()
    this.future = []
    this.apply(next)
    this.host.sound.ui(this.tool === 'erase' ? 'rotate' : 'drop')
  }

  private refuse(text: string) {
    this.host.sound.ui('deny')
    this.setStatus(text)
  }

  private apply(next: HomePlan) {
    this.plan = next
    this.pending = { plan: null, refusal: null }
    this.host.onChange(next)
    this.renderBar()
    this.pointerDirty = true
  }

  undo() {
    const prev = this.past.pop()
    if (!prev) return
    this.future.push(this.plan)
    this.apply(prev)
    this.host.sound.ui('rotate')
  }

  redo() {
    const next = this.future.pop()
    if (!next) return
    this.past.push(this.plan)
    this.apply(next)
    this.host.sound.ui('rotate')
  }

  /** Pipette : reprend ce qui est sous le curseur (type de mur, papier peint, revêtement de sol). */
  private pick(e: { clientX: number; clientY: number }) {
    if (this.mode === 'walls') {
      const p = this.ground(e)
      const at = p && this.edgeAt(p)
      const existing = at && this.plan.walls.find((w) => keyOf(w) === keyOf(at))
      return existing ? this.setKind(existing.k ?? 'wall') : this.host.sound.ui('deny')
    }
    if (this.mode === 'paper') {
      const face = this.faceAt(e)
      const f = face?.wall[face.side]
      return f ? this.setFinish('wall', { ...f }) : this.host.sound.ui('deny')
    }
    const cell = this.cellUnder(this.ground(e))
    const f = cell && this.plan.floor[cellIndex(cell.x, cell.z)]
    return f ? this.setFinish('floor', { ...f }) : this.host.sound.ui('deny')
  }

  // ---------------------------------------------------------------- souris et clavier

  pointerDown(e: PointerEvent) {
    this.lastPointer = e
    if (e.button !== 0) return
    const tool = this.tool
    if (tool === 'pick') return this.pick(e)
    const p = this.ground(e)
    if (this.mode === 'walls') {
      if (!p) return
      if (tool === 'rect') this.stroke = { corner: this.cornerAt(p) }
      else {
        const edge = this.edgeAt(p)
        if (!edge) return
        this.stroke = { edge }
      }
    } else if (this.mode === 'paper') {
      // Pièce : un clic suffit ; Pinceau et Gomme peignent les faces qu'on survole.
      if (tool === 'room') {
        this.aim(e)
        return this.commit()
      }
      this.stroke = { faces: new Map() }
    } else {
      if (tool === 'fill') {
        this.aim(e)
        return this.commit()
      }
      const cell = this.cellUnder(p)
      if (!cell) return
      this.stroke = { cell }
    }
    this.aim(e)
  }

  pointerMove(e: PointerEvent) {
    this.lastPointer = e
    this.pointerDirty = true
  }

  pointerUp(e: PointerEvent) {
    if (!this.stroke) return
    this.aim(e)
    this.commit()
    this.stroke = null
    this.aim(e)
  }

  /** Touches du mode construction ; vrai si la touche est prise. */
  keyDown(e: KeyboardEvent): boolean {
    const ctrl = e.ctrlKey || e.metaKey
    if (ctrl && e.code === 'KeyZ') e.shiftKey ? this.redo() : this.undo()
    else if (ctrl && e.code === 'KeyY') this.redo()
    else if (e.code === 'Escape') {
      if (this.stroke) {
        this.stroke = null
        this.pointerDirty = true
      } else this.host.onClose()
    } else if (!ctrl && /^Digit[1-4]$/.test(e.code)) this.setTool(TOOLS[this.mode][+e.code.slice(5) - 1].id)
    else return false
    e.preventDefault()
    return true
  }

  // ---------------------------------------------------------------- image

  update() {
    if (!this.open) return
    if (this.pointerDirty && this.lastPointer) {
      this.pointerDirty = false
      this.aim(this.lastPointer)
    }
    const aiming = this.pending.plan || this.stroke || this.tool === 'rect'
    this.host.canvas.style.cursor = this.pending.refusal && !this.pending.plan ? 'not-allowed' : aiming ? 'crosshair' : 'default'
  }

  // ---------------------------------------------------------------- barre et aide

  private renderBar() {
    if (this.mode === 'walls') {
      const doors = this.plan.walls.filter(isHomeDoor).length
      this.countEl.textContent = tr(
        `${this.plan.walls.length} / ${MAX_HOME_WALLS} murs · ${doors} porte${doors > 1 ? 's' : ''}`,
        `${this.plan.walls.length} / ${MAX_HOME_WALLS} walls · ${doors} door${doors === 1 ? '' : 's'}`,
      )
    } else {
      const counts = finishCounts(this.plan)
      const n = this.mode === 'paper' ? counts.paper : counts.floor
      const used = this.mode === 'paper'
        ? this.plan.walls.reduce((s, w) => s + (w.a ? 1 : 0) + (w.b ? 1 : 0), 0)
        : this.plan.floor.filter((f, i) => f && inPlot(this.stage, cellAt(i).x, cellAt(i).z)).length
      this.countEl.textContent = this.mode === 'paper'
        ? tr(`${used} face${used > 1 ? 's' : ''} habillée${used > 1 ? 's' : ''} · ${n} / ${MAX_FINISHES} papiers peints`, `${used} side${used === 1 ? '' : 's'} dressed · ${n} / ${MAX_FINISHES} wallpapers`)
        : tr(`${used} case${used > 1 ? 's' : ''} revêtue${used > 1 ? 's' : ''} · ${n} / ${MAX_FINISHES} revêtements`, `${used} tile${used === 1 ? '' : 's'} covered · ${n} / ${MAX_FINISHES} floorings`)
    }
    this.undoBtn.disabled = !this.past.length
    this.redoBtn.disabled = !this.future.length
    const shut = unreachable(this.deck)
    this.warnEl.hidden = !shut
    this.warnEl.textContent = tr(
      `${shut} case${shut > 1 ? 's' : ''} sans accès depuis l'ascenseur : ajoutez une porte`,
      `${shut} tile${shut === 1 ? '' : 's'} cut off from the lift: add a door`,
    )
  }

  private setStatus(text: string | null) {
    if ((this.status.dataset.text ?? '') === (text ?? '')) return
    this.status.dataset.text = text ?? ''
    this.status.replaceChildren()
    if (text) this.status.append(icon('warning-circle'), document.createTextNode(text))
    this.hint.classList.toggle('refused', !!text)
  }

  private setHint() {
    this.keysEl.replaceChildren()
    const done: [string, string] = EN ? ['Esc', 'done'] : ['Échap', 'terminer']
    const undo: [string, string] = EN ? ['Ctrl+Z', 'undo'] : ['Ctrl+Z', 'annuler']
    const tools: [string, string] = EN ? ['1–4', 'tools'] : ['1–4', 'outils']
    const t = this.tool
    const parts: [string, string][] =
      t === 'pick'
        ? [EN ? ['Click', 'to reuse what is there'] : ['Clic', 'pour reprendre ce qui est là'], tools, done]
        : t === 'rect'
          ? this.mode === 'walls'
            ? [EN ? ['Drag', 'corner to corner'] : ['Glisser', 'd\'un coin à l\'autre'], undo, done]
            : [EN ? ['Click', 'in a room'] : ['Clic', 'dans une pièce'], undo, done]
          : t === 'room' || t === 'fill'
            ? [EN ? ['Click', 'in a room'] : ['Clic', 'dans une pièce'], tools, undo, done]
            : this.mode === 'walls'
              ? [EN ? ['Click', t === 'erase' ? 'remove' : 'place'] : ['Clic', t === 'erase' ? 'retirer' : 'poser'], EN ? ['Drag', 'a line'] : ['Glisser', 'une ligne'], tools, undo, done]
              : this.mode === 'paper'
                ? [EN ? ['Click', 'a side'] : ['Clic', 'une face'], EN ? ['Drag', 'over several'] : ['Glisser', 'sur plusieurs'], tools, undo, done]
                : [EN ? ['Click', 'a tile'] : ['Clic', 'une case'], EN ? ['Drag', 'a rectangle'] : ['Glisser', 'un rectangle'], tools, undo, done]
    parts.forEach(([k, label], i) => {
      if (i) this.keysEl.append(' · ')
      const kbd = document.createElement('kbd')
      kbd.textContent = k
      this.keysEl.append(kbd, ` ${label}`)
    })
  }
}

/** Tuiles du palier de l'ascenseur. */
function landing(deck: Deck): PlotRect {
  const r = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity }
  for (let z = 0; z < deck.map.height; z++) {
    for (let x = 0; x < deck.map.width; x++) {
      if (deck.map.room(x, z) !== LANDING_ROOM) continue
      r.minX = Math.min(r.minX, x), r.maxX = Math.max(r.maxX, x)
      r.minZ = Math.min(r.minZ, z), r.maxZ = Math.max(r.maxZ, z)
    }
  }
  return r
}

/** Cases de la parcelle qu'on ne rejoint plus à pied depuis le palier (murs posés sur le plan). */
export function unreachable(deck: Deck): number {
  const map = deck.map
  const home = deck.home
  if (!home) return 0
  const l = landing(deck)
  const seen = new Set([`${l.minX},${l.minZ}`])
  const todo = [[l.minX, l.minZ]]
  while (todo.length) {
    const [x, z] = todo.pop()!
    for (let dir = 0; dir < 4; dir++) {
      const nx = x + DIRS[dir].dx, nz = z + DIRS[dir].dz
      const k = `${nx},${nz}`
      if (seen.has(k) || !map.isFloor(nx, nz) || map.edge(x, z, dir) === 'wall') continue
      seen.add(k)
      todo.push([nx, nz])
    }
  }
  return home.plotPlan.tiles.filter((t) => !seen.has(`${t.x},${t.z}`)).length
}
