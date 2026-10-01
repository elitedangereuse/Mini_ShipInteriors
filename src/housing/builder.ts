import * as THREE from 'three'
import type { Sound } from '../audio'
import type { IsoCamera } from '../camera'
import type { Deck } from '../deck'
import { EN, tr } from '../i18n'
import { icon, type IconName } from '../icons'
import { DIRS } from '../map'
import { drawPartition, PARTITION_KINDS, partitionCenter } from '../cabin/partitions'
import { partitionKey } from '../../shared/cabin-partitions.js'
import { HOME_DOOR_KINDS, isHomeDoor, MAX_HOME_WALLS, wallRefusal, type HomeWall, type WallRefusal } from '../../shared/housing-home.js'
import { LANDING_ROOM, plotRect, type PlotRect } from '../../shared/housing-plot.js'

/*
 * Mode construction de la parcelle (housing v2, cf. docs/housing-v2.md) : sur le pont des
 * quartiers, chez soi, `B` ou « Construire » ouvre la vue d'architecte sur sa bulle. Onglet
 * « Murs » : on choisit un type de mur (plein, demi-mur, à hublot, arche, ou l'une des portes),
 * puis un outil :
 *   - Tracer : un clic pose un mur sur la ligne du quadrillage visée, glisser en trace une ligne ;
 *   - Pièce : glisser d'un coin à l'autre pose les quatre murs d'une pièce (pleins, ou du type
 *     choisi s'il n'a pas de passage : on y perce ensuite ses portes) ;
 *   - Gomme : comme Tracer, mais retire ;
 *   - Pipette : reprend le type d'un mur posé.
 * Sur le pourtour, un mur remplace le champ de force (et le rend s'il est gommé). Tout s'annule
 * (Ctrl+Z) et se rétablit (Ctrl+Y). Une partie de la parcelle qu'on ne rejoint plus depuis
 * l'ascenseur est signalée : il lui manque une porte.
 *
 * Les autres onglets (papier peint, sol, mobilier, parcelle) arrivent avec les lots suivants.
 */

type Tool = 'line' | 'rect' | 'erase' | 'pick'

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
  /** Les murs ont changé : à poser sur la parcelle et à enregistrer. */
  onChange: (walls: HomeWall[]) => void
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

const TOOLS: { id: Tool; name: string; glyph: IconName; key: string }[] = [
  { id: 'line', name: tr('Tracer', 'Draw'), glyph: 'line-segment', key: '1' },
  { id: 'rect', name: tr('Pièce', 'Room'), glyph: 'rectangle', key: '2' },
  { id: 'erase', name: tr('Gomme', 'Eraser'), glyph: 'eraser', key: '3' },
  { id: 'pick', name: tr('Pipette', 'Picker'), glyph: 'eyedropper', key: '4' },
]

const REFUSALS: Record<WallRefusal | 'full', string> = {
  outside: tr('Hors de votre parcelle', 'Outside your plot'),
  landing: tr('C\'est le mur du palier de l\'ascenseur', 'That is the lift landing\'s wall'),
  void: tr('Une porte sur le pourtour donnerait sur le vide', 'A door on the edge would open onto the void'),
  full: tr(`${MAX_HOME_WALLS} murs au plus`, `${MAX_HOME_WALLS} walls at most`),
}

const GHOST_OK = new THREE.Color('#7dffa8')
const GHOST_NO = new THREE.Color('#ff4f5e')
const GHOST_ERASE = new THREE.Color('#ffb03a')
const GHOST_SAME = new THREE.Color('#9fdcff')

/** Ce que ferait l'outil sur une arête : la poser, la retirer, rien (déjà ainsi), ou un refus. */
interface Step {
  wall: HomeWall
  key: string
  effect: 'set' | 'remove' | 'same' | 'refused'
  refusal?: string
}

const keyOf = (w: { x: number; z: number; e: 'v' | 'h' }) => partitionKey(w)

export class HomeBuilder {
  private open = false
  private walls: HomeWall[] = []
  private stage = 0
  private past: HomeWall[][] = []
  private future: HomeWall[][] = []
  private tool: Tool = 'line'
  private kind = 'wall'
  /** Trait en cours : l'arête (Tracer, Gomme) ou le coin (Pièce) où il a commencé. */
  private stroke: { edge?: HomeWall; corner?: { x: number; z: number } } | null = null
  private steps: Step[] = []
  private lastPointer: { clientX: number; clientY: number } | null = null
  private pointerDirty = false

  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()
  private readonly plane = new THREE.Plane()
  private readonly hit = new THREE.Vector3()
  /** Aperçus des murs visés, un par arête (réutilisés d'un trait à l'autre). */
  private readonly ghosts: THREE.Mesh[] = []
  private readonly ghostGeo = new THREE.BoxGeometry(1, 1, 0.34)
  private readonly corner: THREE.Mesh
  private grid = new THREE.Group()
  private readonly helpers = new THREE.Group()

  private readonly root = document.createElement('div')
  private readonly bar: HTMLElement
  private readonly countEl: HTMLElement
  private readonly warnEl: HTMLElement
  private readonly undoBtn: HTMLButtonElement
  private readonly redoBtn: HTMLButtonElement
  private readonly toolEls = new Map<Tool, HTMLButtonElement>()
  private readonly kindEls = new Map<string, HTMLButtonElement>()
  private readonly hint: HTMLElement
  private readonly status: HTMLElement
  private readonly keysEl: HTMLElement

  constructor(
    private deck: Deck,
    private host: BuilderHost,
  ) {
    this.corner = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.04, 16),
      new THREE.MeshBasicMaterial({ color: '#59d8ff', transparent: true, opacity: 0.8, depthTest: false }),
    )
    this.corner.renderOrder = 6
    this.corner.visible = false
    this.helpers.add(this.corner, this.grid)
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

    // Panneau : les onglets (seul « Murs » est ouvert), les outils, les types de murs.
    const panel = document.createElement('div')
    panel.className = 'panel ed-catalog'
    const modes = document.createElement('div')
    modes.className = 'ed-modes'
    const MODES: [string, IconName, boolean][] = [
      [tr('Murs', 'Walls'), 'wall', true],
      [tr('Papier peint', 'Wallpaper'), 'paint-roller', false],
      [tr('Sol', 'Floor'), 'square-half', false],
      [tr('Mobilier', 'Furniture'), 'couch', false],
    ]
    for (const [label, glyph, on] of MODES) {
      const b = document.createElement('button')
      b.append(icon(glyph), document.createTextNode(label))
      b.classList.toggle('active', on)
      b.disabled = !on
      b.title = on ? label : tr(`${label} : bientôt`, `${label}: coming soon`)
      modes.appendChild(b)
    }
    const cards = document.createElement('div')
    cards.className = 'ed-cards finish'
    const intro = document.createElement('div')
    intro.className = 'ed-rooms-intro'
    intro.textContent = tr(
      'Bâtissez vos pièces sur le quadrillage : choisissez un type de mur, puis tracez. Sur le bord, un mur remplace le champ de force. C\'est gratuit.',
      'Build your rooms on the grid: pick a wall type, then draw. On the edge, a wall replaces the force field. It\'s free.',
    )
    const tools = document.createElement('div')
    tools.className = 'ed-room-chips hb-tools'
    for (const t of TOOLS) {
      const b = document.createElement('button')
      b.title = `${t.name} (${t.key})`
      b.append(icon(t.glyph), document.createTextNode(t.name))
      b.onclick = () => this.setTool(t.id)
      tools.appendChild(b)
      this.toolEls.set(t.id, b)
    }
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
    cards.append(intro, tools, ...group(tr('Murs', 'Walls'), WALL_GROUP), ...group(tr('Portes', 'Doors'), DOOR_GROUP))
    panel.append(modes, cards)
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
    this.setTool('line')
    this.setKind('wall')
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

  start(walls: HomeWall[], stage: number) {
    this.walls = walls.map((w) => ({ ...w }))
    this.stage = stage
    this.past = []
    this.future = []
    this.stroke = null
    this.steps = []
    this.open = true
    this.root.hidden = false
    this.helpers.visible = true
    this.deck.home!.solid = true
    this.buildGrid()
    this.renderBar()
    this.setHint()
  }

  stop() {
    if (!this.open) return
    this.open = false
    this.root.hidden = true
    this.helpers.visible = false
    this.deck.home!.solid = false
    this.showGhosts([])
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

  // ---------------------------------------------------------------- outils

  private setTool(tool: Tool) {
    this.tool = tool
    this.stroke = null
    for (const [id, b] of this.toolEls) b.classList.toggle('active', id === tool)
    for (const b of this.kindEls.values()) b.classList.toggle('dim', tool === 'erase' || tool === 'pick')
    this.pointerDirty = true
    this.setHint()
  }

  private setKind(kind: string) {
    this.kind = kind
    for (const [id, b] of this.kindEls) b.classList.toggle('active', id === kind)
    // Une porte se perce dans un mur : on la pose au trait, pas en traçant une pièce.
    if (this.tool === 'erase' || this.tool === 'pick' || (this.tool === 'rect' && HOME_DOOR_KINDS.includes(kind))) this.setTool('line')
    this.host.sound.ui('pick')
  }

  /** Mur du type choisi sur l'arête (`solid` : jamais de passage, pour l'outil Pièce). */
  private wallOn(at: { x: number; z: number; e: 'v' | 'h' }, solid = false): HomeWall {
    const w: HomeWall = { x: at.x, z: at.z, e: at.e }
    const k = solid && isHomeDoor({ ...w, k: this.kind }) ? 'wall' : this.kind
    if (k !== 'wall') w.k = k
    return w
  }

  /** Point du sol de la parcelle sous le curseur. */
  private ground(e: { clientX: number; clientY: number }): THREE.Vector3 | null {
    this.pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.host.iso.camera)
    this.plane.set(new THREE.Vector3(0, 1, 0), -this.deck.y)
    return this.raycaster.ray.intersectPlane(this.plane, this.hit)
  }

  /** Arête du quadrillage la plus proche du point visé (dans la parcelle ou sur son bord). */
  private edgeAt(p: THREE.Vector3): HomeWall | null {
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

  /** Arêtes d'un trait : de l'arête de départ à celle visée, sur la même ligne. */
  private lineFrom(start: HomeWall, p: THREE.Vector3): HomeWall[] {
    const vertical = start.e === 'v'
    const from = vertical ? start.z : start.x
    const r = plotRect(this.stage)
    const to = vertical ? Math.max(r.minZ - 1, Math.min(r.maxZ + 1, Math.round(p.z))) : Math.max(r.minX - 1, Math.min(r.maxX + 1, Math.round(p.x)))
    const out: HomeWall[] = []
    for (let i = Math.min(from, to); i <= Math.max(from, to); i++) out.push(vertical ? { x: start.x, z: i, e: 'v' } : { x: i, z: start.z, e: 'h' })
    return out
  }

  /** Arêtes du contour d'une pièce, d'un coin à l'autre. */
  private rectFrom(a: { x: number; z: number }, b: { x: number; z: number }): HomeWall[] {
    const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x), minZ = Math.min(a.z, b.z), maxZ = Math.max(a.z, b.z)
    const out: HomeWall[] = []
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

  /** Ce que ferait l'outil sur ces arêtes. */
  private plan(edges: HomeWall[]): Step[] {
    const byKey = new Map(this.walls.map((w) => [keyOf(w), w]))
    let count = this.walls.length
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

  /** Vise sous le curseur : l'aperçu du trait en cours, ou de l'arête (du coin) survolé. */
  private aim(e: { clientX: number; clientY: number }) {
    const p = this.ground(e)
    this.corner.visible = false
    if (!p) return this.preview([])
    if (this.tool === 'rect') {
      const c = this.cornerAt(p)
      this.corner.visible = true
      this.corner.position.set(c.x, 0.03, c.z)
      return this.preview(this.stroke?.corner ? this.rectFrom(this.stroke.corner, c) : [])
    }
    if (this.tool === 'pick') {
      const at = this.edgeAt(p)
      const existing = at && this.walls.find((w) => keyOf(w) === keyOf(at))
      this.steps = existing ? [{ wall: existing, key: keyOf(existing), effect: 'same' }] : []
      this.showGhosts(this.steps)
      return this.setStatus(at && !existing ? tr('Pas de mur ici', 'No wall here') : null)
    }
    const start = this.stroke?.edge
    const at = this.edgeAt(p)
    this.preview(start ? this.lineFrom(start, p) : at ? [at] : [])
  }

  private preview(edges: HomeWall[]) {
    this.steps = this.plan(edges)
    this.showGhosts(this.steps)
    const refused = this.steps.find((s) => s.effect === 'refused')
    // Un refus s'affiche seulement s'il n'y a rien d'autre à faire (un trait qui longe le palier pose le reste).
    this.setStatus(refused && !this.steps.some((s) => s.effect === 'set' || s.effect === 'remove') ? refused.refusal! : null)
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
      ;(m.material as THREE.MeshBasicMaterial).color.copy(
        s.effect === 'refused' ? GHOST_NO : s.effect === 'remove' ? GHOST_ERASE : s.effect === 'same' ? GHOST_SAME : this.tool === 'erase' ? GHOST_ERASE : GHOST_OK,
      )
    })
  }

  /** Applique le trait : un seul pas d'annulation. */
  private commit() {
    const changes = this.steps.filter((s) => s.effect === 'set' || s.effect === 'remove')
    const refused = this.steps.find((s) => s.effect === 'refused')
    if (!changes.length) {
      if (refused) {
        this.host.sound.ui('deny')
        this.setStatus(refused.refusal!)
      }
      return
    }
    const drop = new Set(changes.map((s) => s.key))
    const next = this.walls.filter((w) => !drop.has(keyOf(w)))
    for (const s of changes) if (s.effect === 'set') next.push(s.wall)
    this.record(next)
    this.host.sound.ui(this.tool === 'erase' ? 'rotate' : 'drop')
  }

  private record(next: HomeWall[]) {
    this.past.push(this.walls)
    if (this.past.length > HISTORY) this.past.shift()
    this.future = []
    this.apply(next)
  }

  private apply(next: HomeWall[]) {
    this.walls = next
    this.host.onChange(next)
    this.renderBar()
    this.pointerDirty = true
  }

  undo() {
    const prev = this.past.pop()
    if (!prev) return
    this.future.push(this.walls)
    this.apply(prev)
    this.host.sound.ui('rotate')
  }

  redo() {
    const next = this.future.pop()
    if (!next) return
    this.past.push(this.walls)
    this.apply(next)
    this.host.sound.ui('rotate')
  }

  // ---------------------------------------------------------------- souris et clavier

  pointerDown(e: PointerEvent) {
    this.lastPointer = e
    if (e.button !== 0) return
    const p = this.ground(e)
    if (!p) return
    if (this.tool === 'pick') {
      const at = this.edgeAt(p)
      const existing = at && this.walls.find((w) => keyOf(w) === keyOf(at))
      if (existing) this.setKind(existing.k ?? 'wall')
      else this.host.sound.ui('deny')
      return
    }
    if (this.tool === 'rect') this.stroke = { corner: this.cornerAt(p) }
    else {
      const edge = this.edgeAt(p)
      if (!edge) return
      this.stroke = { edge }
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
    } else if (!ctrl && /^Digit[1-4]$/.test(e.code)) this.setTool(TOOLS[+e.code.slice(5) - 1].id)
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
    const refused = this.steps.length > 0 && this.steps.every((s) => s.effect === 'refused')
    this.host.canvas.style.cursor = refused ? 'not-allowed' : this.steps.length || this.tool === 'rect' ? 'crosshair' : 'default'
  }

  // ---------------------------------------------------------------- barre et aide

  private renderBar() {
    const doors = this.walls.filter(isHomeDoor).length
    this.countEl.textContent = tr(
      `${this.walls.length} / ${MAX_HOME_WALLS} murs · ${doors} porte${doors > 1 ? 's' : ''}`,
      `${this.walls.length} / ${MAX_HOME_WALLS} walls · ${doors} door${doors === 1 ? '' : 's'}`,
    )
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
    const parts: [string, string][] =
      this.tool === 'rect'
        ? EN ? [['Drag', 'corner to corner'], ['Ctrl+Z', 'undo'], ['Esc', 'done']] : [['Glisser', 'd\'un coin à l\'autre'], ['Ctrl+Z', 'annuler'], ['Échap', 'terminer']]
        : this.tool === 'pick'
          ? EN ? [['Click', 'a wall to reuse its type'], ['Esc', 'done']] : [['Clic', 'sur un mur pour reprendre son type'], ['Échap', 'terminer']]
          : this.tool === 'erase'
            ? EN ? [['Click', 'remove'], ['Drag', 'remove a line'], ['Ctrl+Z', 'undo'], ['Esc', 'done']] : [['Clic', 'retirer'], ['Glisser', 'retirer une ligne'], ['Ctrl+Z', 'annuler'], ['Échap', 'terminer']]
            : EN ? [['Click', 'place'], ['Drag', 'draw a line'], ['1–4', 'tools'], ['Ctrl+Z', 'undo'], ['Esc', 'done']] : [['Clic', 'poser'], ['Glisser', 'tracer une ligne'], ['1–4', 'outils'], ['Ctrl+Z', 'annuler'], ['Échap', 'terminer']]
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
  const start = `${l.minX},${l.minZ}`
  const seen = new Set([start])
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
  return home.plan.tiles.filter((t) => !seen.has(`${t.x},${t.z}`)).length
}
