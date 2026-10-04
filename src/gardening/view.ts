import * as THREE from 'three'
import type { CabinItem } from '../cabin/layout'
import type { Deck, Interactable } from '../deck'
import { markerMaterial } from '../economy/tasks'
import { compact, disposeFurniture, rng } from '../furniture/kit'
import { cropPlants, SOIL_SIZE, tilledSoil, weedTufts } from '../furniture/gardening'
import type { IconName } from '../icons'
import { plotKey, plotStatus, type Plot, type PlotNeed, type PlotStatus } from '../../shared/gardening.js'
import { CROPS, RULES } from './data'

/*
 * Ce qui pousse sur les tuiles de terre des quartiers affichés (les siens, ou ceux de son hôte) :
 * la terre préparée, les plants à leur stade, les mauvaises herbes, et pour son propre jardin un
 * hexagone au-dessus des tuiles qui attendent un geste. Les tuiles elles-mêmes sont des objets des
 * quartiers (cf. CabinView) ; leur état vient du site (cf. store.ts) et avance tout seul avec
 * l'heure (cf. shared/gardening.js).
 */

/** Objet du catalogue qui fait une tuile de terre. */
export const SOIL_ITEM = 'soil-tile'

/** Une tuile posée, ce qui y pousse, et où elle en est. */
export interface GardenTile {
  key: string
  x: number
  z: number
  plot: Plot | null
  /** Null : terre nue, pas encore préparée. */
  status: PlotStatus | null
  /** Ce qu'on en fait à la touche d'interaction (cf. GardenMode). */
  item: Interactable
}

interface Shown extends GardenTile {
  holder: THREE.Group
  marker: THREE.Sprite
  /** Ce qui est dessiné : rien n'est refait tant que ça ne change pas. */
  drawn: string
}

/** Hexagone d'une tuile qui attend un geste : son icône et sa couleur. */
const NEED_MARK: Record<PlotNeed, { icon: IconName; color: string }> = {
  sow: { icon: 'grains', color: '#c9a86a' },
  water: { icon: 'drop', color: '#6fc8ff' },
  weed: { icon: 'shovel', color: '#ffd23c' },
  harvest: { icon: 'basket', color: '#7dffa8' },
}

const MARKER_Y = 0.95
const PICK = new THREE.MeshBasicMaterial()

/** Graine du dessin d'une tuile : sa position (tout le monde voit les mêmes pieds). */
const seedOf = (x: number, z: number) => Math.abs(Math.round(x * 97 + z * 389)) + 1

export class GardenView {
  readonly group = new THREE.Group()
  private shown = new Map<string, Shown>()
  private plots: Record<string, Plot> = {}
  /** Son propre jardin : hexagones des gestes à faire, et tuiles qu'on peut travailler. */
  private own = false
  private clock = 0
  /** Les tuiles ou leur état ont changé (les invites du mode jardinage sont à refaire). */
  onChange?: () => void

  constructor(
    private readonly deck: Deck,
    /** Mobilier affiché sur le pont des quartiers. */
    private readonly items: () => CabinItem[],
    /** L'heure du site (secondes). */
    private readonly now: () => number,
  ) {
    deck.group.add(this.group)
  }

  /** Les tuiles posées, dans l'ordre de leur pose. */
  get tiles(): GardenTile[] {
    return [...this.shown.values()]
  }

  tile(key: string): GardenTile | undefined {
    return this.shown.get(key)
  }

  /** Le jardin à montrer : celui du joueur (`own`), ou les tuiles de son hôte. */
  setPlots(plots: Record<string, Plot>, own: boolean) {
    this.plots = plots
    this.own = own
    this.refresh()
  }

  /** Tuiles du mobilier affiché, puis ce qui pousse dessus. */
  private refresh() {
    const live = new Set<string>()
    let changed = false
    for (const it of this.items()) {
      if (it.m !== SOIL_ITEM) continue
      const key = plotKey(it.x, it.z)
      live.add(key)
      if (!this.shown.has(key)) {
        this.shown.set(key, this.add(key, it.x, it.z))
        changed = true
      }
    }
    for (const [key, tile] of this.shown) {
      if (live.has(key)) continue
      this.remove(tile)
      this.shown.delete(key)
      changed = true
    }
    const now = this.now()
    for (const tile of this.shown.values()) changed = this.draw(tile, now) || changed
    if (changed) this.onChange?.()
  }

  private add(key: string, x: number, z: number): Shown {
    const holder = new THREE.Group()
    holder.position.set(x, 0, z)
    // Volume de clic de la tuile : on clique la terre comme un meuble.
    const pick = new THREE.Mesh(new THREE.BoxGeometry(SOIL_SIZE, 0.3, SOIL_SIZE), PICK)
    pick.position.set(x, 0.15, z)
    pick.visible = false
    const marker = new THREE.Sprite()
    marker.scale.setScalar(0.3)
    marker.renderOrder = 4
    marker.position.set(x, MARKER_Y, z)
    marker.visible = false
    this.group.add(holder, pick, marker)
    const item: Interactable = { object: pick, position: new THREE.Vector3(x, 0, z), label: '' }
    return { key, x, z, plot: null, status: null, item, holder, marker, drawn: '' }
  }

  private remove(tile: Shown) {
    this.unlist(tile)
    disposeFurniture(tile.holder)
    tile.holder.removeFromParent()
    tile.item.object.removeFromParent()
    ;(tile.item.object as THREE.Mesh).geometry.dispose()
    tile.marker.removeFromParent()
  }

  private unlist(tile: Shown) {
    const i = this.deck.interactables.indexOf(tile.item)
    if (i >= 0) this.deck.interactables.splice(i, 1)
  }

  /** Redessine la tuile si son allure a changé ; rend vrai si son état (ce qu'elle attend) a changé. */
  private draw(tile: Shown, now: number): boolean {
    const plot = this.plots[tile.key] ?? null
    const status = plot ? plotStatus(RULES, plot, now) : null
    const before = `${tile.status?.need}|${tile.status?.stage}|${tile.plot?.c}|${!!tile.plot}`
    tile.plot = plot
    tile.status = status
    // On ne travaille que son propre jardin : chez un hôte, les tuiles se regardent.
    const listed = this.deck.interactables.includes(tile.item)
    if (this.own && !listed) this.deck.interactables.push(tile.item)
    else if (!this.own && listed) this.unlist(tile)

    const weeds = status?.need === 'weed'
    const drawn = plot ? `${plot.c ?? ''}|${status!.stage}|${status!.wet}|${weeds}` : ''
    if (drawn !== tile.drawn) {
      tile.drawn = drawn
      disposeFurniture(tile.holder)
      tile.holder.clear()
      if (plot && status) {
        const random = rng(seedOf(tile.x, tile.z))
        const g = new THREE.Group()
        g.add(tilledSoil(status.wet))
        const crop = plot.c ? CROPS[plot.c] : undefined
        if (plot.c) g.add(cropPlants(crop?.look ?? 'leafy', crop?.color ?? '#86c46a', Math.max(0, status.stage), random))
        if (weeds) g.add(weedTufts(random))
        tile.holder.add(compact(g))
      }
    }
    const mark = this.own && status?.need ? NEED_MARK[status.need] : null
    tile.marker.visible = !!mark
    if (mark) tile.marker.material = markerMaterial(mark.icon, mark.color)
    return before !== `${status?.need}|${status?.stage}|${plot?.c}|${!!plot}`
  }

  /** À chaque image : les hexagones flottent ; deux fois par seconde, les tuiles et la pousse sont relues. */
  update(dt: number) {
    const bob = Math.sin(performance.now() / 450) * 0.035
    for (const tile of this.shown.values()) if (tile.marker.visible) tile.marker.position.y = MARKER_Y + bob
    this.clock += dt
    if (this.clock < 0.5) return
    this.clock = 0
    this.refresh()
  }
}
