import * as THREE from 'three'
import { ceilingSlab, domeRoof, type Box2, type Deck } from '../deck'
import { buildFixtures, type Fixture } from '../lighting/fixtures'
import { DIRS } from '../map'
import { StaticMerge, type FadeFocus } from '../merge'
import { PartitionShell } from '../cabin/partitions'
import { FinishTexture, type Slot } from '../cabin/finishes'
import { ForceField, PlotShell } from './plot'
import { applyWalls, cellAt, CELLS, clearWalls, isLow, type HomeFinish, type HomePlan, type PlanWall } from '../../shared/housing-home.js'
import { inPlot, type PlotEdge } from '../../shared/housing-plot.js'
import { partitionEdge, partitionKey } from '../../shared/cabin-partitions.js'

/*
 * La parcelle affichée sur le pont des quartiers (housing v2) : sa taille (palier
 * d'agrandissement), ses murs, posés sur le plan du pont (cf. shared/housing-home.js) et
 * construits comme les cloisons des quartiers (cf. cabin/partitions.ts ; en vue subjective, ils
 * montent jusqu'au toit), le papier peint de chacune de leurs faces, et le revêtement de chaque
 * case du sol. Le toit (vue subjective) : un plafond au-dessus des pièces fermées, comme dans le
 * reste du vaisseau, et le dôme de verre de la bulle au-dessus de ce qui reste ouvert (cf.
 * buildRoof). Le champ de force n'est tendu que sur les arêtes
 * du pourtour qu'aucun mur ne remplace.
 *
 * Les revêtements sont dessinés par le jeu (cf. cabin/finishes.ts) : une texture et un matériau
 * par motif et couleur en usage, partagés par toutes les faces et les cases qui les portent.
 */

/** Revêtement du sol, juste au-dessus des dalles (comme dans les anciens quartiers). */
const FLOORING_Y = 0.002

/** Plafonniers des pièces fermées : un toutes les LAMP_STEP tuiles, de la couleur des lumières de la parcelle. */
const LAMP_STEP = 3
const LAMP_COLOR = '#ffd9b0'

/** Le dôme de verre monte de ça en son milieu, au-dessus du plafond : une base, plus tant par tuile de côté. */
const DOME_RISE = 1
const DOME_RISE_PER_TILE = 0.2

/** Plan vide : ni murs ni revêtements. */
export const emptyPlan = (): HomePlan => ({ walls: [], floor: Array(CELLS).fill(null) })

/** Copie d'un plan, à modifier sans toucher l'original. */
export function clonePlan(plan: HomePlan): HomePlan {
  return {
    ...plan,
    walls: plan.walls.map((w) => ({ ...w, ...(w.a ? { a: { ...w.a } } : {}), ...(w.b ? { b: { ...w.b } } : {}) })),
    floor: plan.floor.map((f) => f && { ...f }),
    items: (plan.items ?? []).map((i) => ({ ...i })),
  }
}

export const finishKey = (f: HomeFinish) => `${f.style}:${f.color}`
export const sameFinish = (a: HomeFinish | null | undefined, b: HomeFinish | null | undefined) => (a ? !!b && finishKey(a) === finishKey(b) : !b)
const wallsKey = (walls: PlanWall[]) => walls.map((w) => `${partitionKey(w)}:${w.k ?? ''}:${w.a ? finishKey(w.a) : ''}:${w.b ? finishKey(w.b) : ''}`).join('|')
const floorKey = (floor: HomePlan['floor']) => floor.map((f) => (f ? finishKey(f) : '')).join('|')

export class HomeView {
  /** Palier d'agrandissement affiché (-1 : rien encore). */
  stage = -1
  /** Plan affiché, et les murs qui ont pu être posés. */
  plan: HomePlan = emptyPlan()
  placed: PlanWall[] = []
  /**
   * Mode construction, onglet « Murs » : les murs restent pleins (ailleurs, en mode construction,
   * ceux tournés vers la caméra s'estompent).
   */
  solid = false
  /** Les lumières de la parcelle ont changé (nouvelle taille) : à réaffecter. */
  onLights?: () => void
  private plot?: PlotShell
  private shell?: PartitionShell
  private field?: ForceField
  private floors: THREE.Mesh[] = []
  /** Toit, dans le plafond du pont (vue subjective), et ses géométries, libérées avec lui. */
  private readonly roof = new THREE.Group()
  private roofGeos: THREE.BufferGeometry[] = []
  /**
   * Collisions et lumières de la parcelle : ajoutées à celles du pont, par elle, ou par la cabine
   * du pont s'il en a une (cf. CabinView.rebuild, qui refait la fin de ces listes).
   */
  colliders: Box2[] = []
  lights: Deck['lights'] = []
  private wallsKey = ''
  private floorKey = ''
  /** Revêtements en usage, par emplacement, motif et couleur. */
  private finishes = new Map<string, { texture: FinishTexture; material: THREE.MeshLambertMaterial }>()

  constructor(private deck: Deck) {}

  /** Tuiles et arêtes de la parcelle affichée. */
  get plotPlan() {
    return this.plot!.plan
  }

  /** Pans de mur et portes posés (murs d'accroche de la cabine, cf. CabinView.findWalls). */
  get segments() {
    return this.shell?.walls ?? []
  }

  /** Poteaux d'angle des murs posés. */
  get posts() {
    return this.shell?.posts ?? []
  }

  /** Affiche la parcelle à ce palier, avec ce plan ; seul ce qui change se reconstruit. */
  set(stage: number, plan: HomePlan) {
    const deck = this.deck
    const restage = stage !== this.stage
    const wk = wallsKey(plan.walls), fk = floorKey(plan.floor)
    const rewall = restage || wk !== this.wallsKey
    const refloor = restage || fk !== this.floorKey
    this.plan = plan
    if (!rewall && !refloor) return
    if (rewall) clearWalls(deck.map, this.placed)
    if (restage) {
      this.plot?.dispose()
      const plot = (this.plot = new PlotShell(deck, stage))
      deck.group.add(plot.group)
      this.stage = stage
      if (!deck.cabin) {
        drop(deck.lights, this.lights)
        deck.lights.push(...plot.lights)
      }
      this.lights = plot.lights
    }
    if (rewall) {
      this.wallsKey = wk
      this.buildWalls(plan.walls)
    }
    if (refloor) {
      this.floorKey = fk
      this.buildFloors(plan.floor)
    }
    this.collect()
    // La cabine de la parcelle reprend tuiles, murs d'accroche, collisions et lumières.
    if (rewall) deck.cabin?.reshape()
    if (restage) this.onLights?.()
  }

  /** Murs, leur papier peint, et le champ de force sur le reste du pourtour. */
  private buildWalls(walls: PlanWall[]) {
    const deck = this.deck
    this.placed = applyWalls(deck.map, walls, this.stage)
    this.shell?.dispose()
    this.field?.dispose()
    const paper = (p: PlanWall, side: 'a' | 'b') => {
      const f = p[side]
      return f ? this.material('wall', f) : undefined
    }
    const shell = (this.shell = new PartitionShell(deck, this.placed, { walls: deck.walls, posts: deck.posts }, true, paper))
    deck.group.add(shell.group)
    const walled = new Set(this.placed.map((w) => {
      const { x, z, dir } = partitionEdge(w)
      return deck.map.edgeKey(x, z, dir)
    }))
    const free = this.plot!.plan.field.filter((e) => !walled.has(deck.map.edgeKey(e.x, e.z, e.dir)))
    const field = (this.field = new ForceField(free, [...deck.posts, ...shell.posts]))
    deck.group.add(field.group)
    this.buildRoof(free)

    if (!deck.cabin) drop(deck.colliders, this.colliders)
    this.colliders = [...shell.colliders, ...field.colliders]
    if (!deck.cabin) deck.colliders.push(...this.colliders)
    deck.pathfinder.invalidate()
  }

  /**
   * Toit de la parcelle (vue subjective) : un dôme de verre sur toute la bulle, et dessous, un
   * plafond et ses plafonniers au-dessus des pièces fermées.
   */
  private buildRoof(free: PlotEdge[]) {
    const deck = this.deck
    this.roof.clear()
    for (const g of this.roofGeos) g.dispose()
    this.roofGeos = []
    const rooms = this.closedRooms(free)
    const { rect } = this.plot!.plan
    // Une parcelle sous plafond d'un bout à l'autre n'a pas besoin de dôme.
    const covered = rooms.flat().length
    const meshes = covered < this.plot!.plan.tiles.length ? domeRoof(rect, deck.ceilingY, DOME_RISE + DOME_RISE_PER_TILE * (rect.maxX - rect.minX + 1)) : []
    if (covered) meshes.push(ceilingSlab(rooms.flat(), deck.ceilingY, deck.ceilingMaterial))
    for (const m of meshes) {
      m.castShadow = false
      this.roof.add(m)
      this.roofGeos.push(m.geometry)
    }
    const fixtures: Fixture[] = []
    for (const room of rooms) {
      let lit = room.filter((t) => t.x % LAMP_STEP === 1 && t.z % LAMP_STEP === 1)
      if (!lit.length) {
        // Petite pièce : un seul plafonnier, au plus près de son milieu.
        const cx = room.reduce((s, t) => s + t.x, 0) / room.length, cz = room.reduce((s, t) => s + t.z, 0) / room.length
        const d = (t: { x: number; z: number }) => (t.x - cx) ** 2 + (t.z - cz) ** 2
        lit = [room.reduce((a, b) => (d(b) < d(a) ? b : a))]
      }
      fixtures.push(...lit.map((t): Fixture => ({ kind: 'dome', x: t.x, z: t.z, color: LAMP_COLOR })))
    }
    const merge = new StaticMerge()
    const glows = buildFixtures(fixtures, deck.ceilingY, merge)
    for (const m of [...merge.flush(this.roof), ...(glows ? [glows] : [])]) {
      m.castShadow = false
      this.roof.add(m)
      this.roofGeos.push(m.geometry)
    }
    deck.ceiling.add(this.roof)
  }

  /**
   * Pièces fermées de la parcelle : les cases qu'on rejoint l'une de l'autre sans franchir de mur
   * ni de porte (un demi-mur ne ferme rien), quand aucune ne touche le champ de force.
   * @param free arêtes du pourtour où le champ de force est tendu
   */
  private closedRooms(free: PlotEdge[]): { x: number; z: number }[][] {
    const map = this.deck.map
    const edgeOf = (w: PlanWall) => {
      const { x, z, dir } = partitionEdge(w)
      return map.edgeKey(x, z, dir)
    }
    const low = new Set(this.placed.filter(isLow).map(edgeOf))
    const sky = new Set(free.map((e) => map.edgeKey(e.x, e.z, e.dir)))
    const seen = new Set<string>()
    const rooms: { x: number; z: number }[][] = []
    for (const start of this.plot!.plan.tiles) {
      if (seen.has(`${start.x},${start.z}`)) continue
      seen.add(`${start.x},${start.z}`)
      const room = [start]
      let open = false
      for (let i = 0; i < room.length; i++) {
        const { x, z } = room[i]
        for (let dir = 0; dir < 4; dir++) {
          const nx = x + DIRS[dir].dx, nz = z + DIRS[dir].dz
          const edge = map.edgeKey(x, z, dir)
          const through = map.edge(x, z, dir) === 'open' || low.has(edge)
          if (!inPlot(this.stage, nx, nz)) {
            if (through || sky.has(edge)) open = true
            continue
          }
          if (!through || seen.has(`${nx},${nz}`)) continue
          seen.add(`${nx},${nz}`)
          room.push({ x: nx, z: nz })
        }
      }
      if (!open) rooms.push(room)
    }
    return rooms
  }

  /** Sol : une dalle par case revêtue, un maillage par revêtement, coordonnées de texture en mètres. */
  private buildFloors(floor: HomePlan['floor']) {
    for (const m of this.floors) {
      m.removeFromParent()
      m.geometry.dispose()
    }
    this.floors = []
    const groups = new Map<string, { finish: HomeFinish; cells: { x: number; z: number }[] }>()
    for (let i = 0; i < CELLS; i++) {
      const f = floor[i]
      if (!f) continue
      const t = cellAt(i)
      if (!inPlot(this.stage, t.x, t.z)) continue
      const key = finishKey(f)
      if (!groups.has(key)) groups.set(key, { finish: f, cells: [] })
      groups.get(key)!.cells.push(t)
    }
    for (const { finish, cells } of groups.values()) {
      const material = this.material('floor', finish)
      if (!material) continue
      const pos: number[] = [], uv: number[] = [], index: number[] = []
      for (const t of cells) {
        const i = pos.length / 3
        for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
          pos.push(t.x + dx, FLOORING_Y, t.z + dz)
          uv.push(t.x + dx, -(t.z + dz))
        }
        index.push(i, i + 3, i + 2, i, i + 2, i + 1)
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
      geo.setIndex(index)
      geo.computeVertexNormals()
      const mesh = new THREE.Mesh(geo, material)
      mesh.receiveShadow = true
      this.deck.group.add(mesh)
      this.floors.push(mesh)
    }
  }

  /** Matériau d'un revêtement (créé à la première demande), ou rien si son motif est inconnu. */
  private material(slot: Slot, f: HomeFinish): THREE.MeshLambertMaterial | undefined {
    const key = `${slot}:${finishKey(f)}`
    let entry = this.finishes.get(key)
    if (!entry) {
      const texture = new FinishTexture()
      if (!texture.set(slot, f)) {
        texture.dispose()
        return undefined
      }
      // Le sol passe devant les dalles du kit, juste en dessous (cf. FLOORING_Y).
      const material = slot === 'floor'
        ? new THREE.MeshLambertMaterial({ map: texture.texture, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
        : new THREE.MeshLambertMaterial({ map: texture.texture })
      this.finishes.set(key, (entry = { texture, material }))
    }
    return entry.material
  }

  /** Oublie les revêtements qui ne servent plus. */
  private collect() {
    const used = new Set<string>()
    for (const w of this.placed) for (const f of [w.a, w.b]) if (f) used.add(`wall:${finishKey(f)}`)
    for (const f of this.plan.floor) if (f) used.add(`floor:${finishKey(f)}`)
    for (const [key, { texture, material }] of this.finishes) {
      if (used.has(key)) continue
      texture.dispose()
      material.dispose()
      this.finishes.delete(key)
    }
  }

  /**
   * Murs qui masquent le joueur (tramés), champ de force animé.
   * @param fade temps écoulé pour le tramage (il suit la caméra même quand l'instant est figé)
   */
  update(dt: number, fade: number, view: FadeFocus, toCamera: THREE.Vector3, ceiling: number | null) {
    this.shell?.update(view, fade, this.solid)
    this.field?.update(dt, toCamera, ceiling)
  }
}

/** Retire de `list` ce qui est dans `gone` (sur place : d'autres en gardent la référence). */
function drop<T>(list: T[], gone: T[]) {
  if (!gone.length) return
  const out = new Set(gone)
  list.splice(0, list.length, ...list.filter((o) => !out.has(o)))
}
