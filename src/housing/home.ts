import type * as THREE from 'three'
import type { Box2, Deck } from '../deck'
import type { FadeFocus } from '../merge'
import { PartitionShell } from '../cabin/partitions'
import { ForceField, PlotShell } from './plot'
import { applyWalls, clearWalls, type HomeWall } from '../../shared/housing-home.js'
import { partitionEdge, partitionKey } from '../../shared/cabin-partitions.js'

/*
 * La parcelle affichée sur le pont des quartiers (housing v2) : sa taille (palier
 * d'agrandissement) et ses murs, posés sur le plan du pont (cf. shared/housing-home.js) et
 * construits comme les cloisons des quartiers (cf. cabin/partitions.ts, sans haut de mur : il n'y
 * a pas de plafond sous la bulle). Le champ de force n'est tendu que sur les arêtes du pourtour
 * qu'aucun mur ne remplace.
 */

export class HomeView {
  /** Palier d'agrandissement affiché (-1 : rien encore). */
  stage = -1
  /** Murs demandés, et ceux qui ont pu être posés. */
  walls: HomeWall[] = []
  placed: HomeWall[] = []
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
  /** Collisions et lumières ajoutées à celles du pont. */
  private colliders: Box2[] = []
  private lights: Deck['lights'] = []

  constructor(private deck: Deck) {}

  /** Tuiles et arêtes de la parcelle affichée. */
  get plan() {
    return this.plot!.plan
  }

  /** Affiche la parcelle à ce palier, avec ces murs ; rien ne se reconstruit si rien ne change. */
  set(stage: number, walls: HomeWall[]) {
    const deck = this.deck
    const restage = stage !== this.stage
    if (!restage && sameWalls(walls, this.walls)) return
    clearWalls(deck.map, this.placed)
    if (restage) {
      this.plot?.dispose()
      const plot = (this.plot = new PlotShell(deck, stage))
      deck.group.add(plot.group)
      this.stage = stage
      drop(deck.lights, this.lights)
      this.lights = plot.lights
      deck.lights.push(...this.lights)
    }
    this.walls = walls
    this.placed = applyWalls(deck.map, walls, stage)

    this.shell?.dispose()
    this.field?.dispose()
    const shell = (this.shell = new PartitionShell(deck, this.placed, { walls: deck.walls, posts: deck.posts }, false))
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
    if (restage) this.onLights?.()
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

/** Mêmes murs, dans le même ordre ? */
export function sameWalls(a: HomeWall[], b: HomeWall[]): boolean {
  return a.length === b.length && a.every((w, i) => partitionKey(w) === partitionKey(b[i]) && (w.k ?? '') === (b[i].k ?? ''))
}

/** Retire de `list` ce qui est dans `gone` (sur place : d'autres en gardent la référence). */
function drop<T>(list: T[], gone: T[]) {
  if (!gone.length) return
  const out = new Set(gone)
  list.splice(0, list.length, ...list.filter((o) => !out.has(o)))
}
