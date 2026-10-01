import * as THREE from 'three'
import type { Box2, Deck } from '../deck'
import type { FadeFocus } from '../merge'
import { PartitionShell } from '../cabin/partitions'
import { FinishTexture, type Slot } from '../cabin/finishes'
import { ForceField, PlotShell } from './plot'
import { applyWalls, cellAt, CELLS, clearWalls, type HomeFinish, type HomePlan, type PlanWall } from '../../shared/housing-home.js'
import { inPlot } from '../../shared/housing-plot.js'
import { partitionEdge, partitionKey } from '../../shared/cabin-partitions.js'

/*
 * La parcelle affichée sur le pont des quartiers (housing v2) : sa taille (palier
 * d'agrandissement), ses murs, posés sur le plan du pont (cf. shared/housing-home.js) et
 * construits comme les cloisons des quartiers (cf. cabin/partitions.ts, sans haut de mur : il n'y
 * a pas de plafond sous la bulle), le papier peint de chacune de leurs faces, et le revêtement de
 * chaque case du sol. Le champ de force n'est tendu que sur les arêtes du pourtour qu'aucun mur ne
 * remplace.
 *
 * Les revêtements sont dessinés par le jeu (cf. cabin/finishes.ts) : une texture et un matériau
 * par motif et couleur en usage, partagés par toutes les faces et les cases qui les portent.
 */

/** Revêtement du sol, juste au-dessus des dalles (comme dans les anciens quartiers). */
const FLOORING_Y = 0.002

/** Plan vide : ni murs ni revêtements. */
export const emptyPlan = (): HomePlan => ({ walls: [], floor: Array(CELLS).fill(null) })

/** Copie d'un plan, à modifier sans toucher l'original. */
export function clonePlan(plan: HomePlan): HomePlan {
  return {
    walls: plan.walls.map((w) => ({ ...w, ...(w.a ? { a: { ...w.a } } : {}), ...(w.b ? { b: { ...w.b } } : {}) })),
    floor: plan.floor.map((f) => f && { ...f }),
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
  /** Collisions et lumières ajoutées à celles du pont. */
  private colliders: Box2[] = []
  private lights: Deck['lights'] = []
  private wallsKey = ''
  private floorKey = ''
  /** Revêtements en usage, par emplacement, motif et couleur. */
  private finishes = new Map<string, { texture: FinishTexture; material: THREE.MeshLambertMaterial }>()

  constructor(private deck: Deck) {}

  /** Tuiles et arêtes de la parcelle affichée. */
  get plotPlan() {
    return this.plot!.plan
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
      drop(deck.lights, this.lights)
      this.lights = plot.lights
      deck.lights.push(...this.lights)
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
    const shell = (this.shell = new PartitionShell(deck, this.placed, { walls: deck.walls, posts: deck.posts }, false, paper))
    deck.group.add(shell.group)
    const walled = new Set(this.placed.map((w) => {
      const { x, z, dir } = partitionEdge(w)
      return deck.map.edgeKey(x, z, dir)
    }))
    const free = this.plot!.plan.field.filter((e) => !walled.has(deck.map.edgeKey(e.x, e.z, e.dir)))
    const field = (this.field = new ForceField(free, [...deck.posts, ...shell.posts]))
    deck.group.add(field.group)

    drop(deck.colliders, this.colliders)
    this.colliders = [...shell.colliders, ...field.colliders]
    deck.colliders.push(...this.colliders)
    deck.pathfinder.invalidate()
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
