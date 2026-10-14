import * as THREE from 'three'
import { CAT_MODEL, FOOD_PACK, packModel, rig } from '../assets'
import type { Avatar } from '../avatar'
import type { Box2 } from '../deck'
import { markerMaterial } from '../economy/tasks'
import { EN } from '../i18n'
import type { IconName } from '../icons'
import { INGREDIENTS, PROCESSES, RECIPES, type StationKind } from '../../shared/mess-rush-catalog.js'
import {
  COUNTER_TOP, RULES, STATIONS, STATION_BY_ID, canReach, ingredientState, kitchenOf, nextPrep, wallsOf,
  type CountState, type Item, type Rect, type ServiceState, type UtensilState,
} from '../../shared/mess-rush.js'

/*
 * Ce qu'on voit en cuisine, d'après l'état du service (cf. shared/mess-rush.js), pour qu'on comprenne
 * d'un coup d'œil, comme dans Overcooked : l'ingrédient en grand sur sa caisse, ce qui est posé sur
 * les planches et les comptoirs ou porté à deux mains, la marmite et la poêle de chaque feu, ce
 * qu'elles contiennent (en images au-dessus), leur jauge de cuisson, l'alerte quand ça va brûler et la
 * fumée quand c'est brûlé ; la pile d'assiettes propres, la vaisselle sale au retour et dans la
 * plonge ; un anneau de la couleur du plat sous chaque assiette qui le devient ; le repère de chaque
 * poste (grisé chez un coéquipier), les flèches du guidage ; à plusieurs, les cloisons et leurs
 * passe-plats ; et les imprévus : le plateau renversé sur la passe, Comète sur son comptoir, les feux
 * en surchauffe. Les modèles viennent du Food Kit de Kenney (cf. FOOD_PACK), chargé en entrant dans
 * la cuisine.
 */

/** Hauteur des comptoirs, des planches et des fourneaux (cf. furniture/mess-rush.ts). */
const TOP = COUNTER_TOP + 0.005
/** Ce qu'on porte repose sur les mains : un peu au-dessus de leur bout. */
const HAND_LIFT = 0.02

/** Un modèle du Food Kit, à la taille voulue (plus grande dimension au sol), posé sur y = 0. */
const fitted = new Map<string, THREE.Object3D>()
function model(name: string, size: number): THREE.Object3D {
  const key = `${name}:${size}`
  let base = fitted.get(key)
  if (!base) {
    const raw = packModel(name, FOOD_PACK).clone(true)
    const box = new THREE.Box3().setFromObject(raw)
    const s = size / Math.max(1e-3, box.max.x - box.min.x, box.max.z - box.min.z)
    raw.scale.setScalar(s)
    raw.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s)
    base = new THREE.Group()
    base.add(raw)
    fitted.set(key, base)
  }
  return base.clone(true)
}

/** Teinte les matériaux d'un modèle (une fois par matériau et par teinte) : cuit, brûlé, sale. */
const tinted = new Map<string, THREE.Material>()
function tint(o: THREE.Object3D, color: string, amount: number): THREE.Object3D {
  o.traverse((c) => {
    if (!(c instanceof THREE.Mesh)) return
    const swap = (m: THREE.Material) => {
      const key = `${m.uuid}:${color}:${amount}`
      let d = tinted.get(key)
      if (!d) {
        d = m.clone()
        if ('color' in d && d.color instanceof THREE.Color) d.color.lerp(new THREE.Color(color), amount)
        tinted.set(key, d)
      }
      return d
    }
    c.material = Array.isArray(c.material) ? c.material.map(swap) : swap(c.material)
  })
  return o
}

/** Les modèles d'un ingrédient coupé, quand le pack en a un. */
const CUT: Record<string, string> = { apple: 'apple-half', mushroom: 'mushroom-half', paprika: 'paprika-slice' }

/** Un ingrédient, dans son état : cru, coupé, cuit (le riz reste blanc), saisi (doré), brûlé (noir). */
function ingredientObject(ing: string, state: string, size = 0.15): THREE.Object3D {
  const base = INGREDIENTS[ing].model
  if (state === 'brûlé') return tint(model(base === 'meat-raw' ? 'meat-cooked' : base, size), '#1b1410', 0.85)
  if ((state === 'cuit' || state === 'saisi') && base === 'meat-raw') return model('meat-cooked', size)
  const name = state === 'coupé' ? CUT[base] ?? base : base
  const o = model(name, state === 'coupé' && !CUT[base] ? size * 0.85 : size)
  return state === 'saisi' || (state === 'cuit' && base !== 'rice-ball') ? tint(o, '#5a3418', 0.45) : o
}

/** Ce que contient une assiette, en petit, en cercle sur elle. */
function plateObject(contents: [string, string][]): THREE.Object3D {
  const g = new THREE.Group()
  g.add(model('plate', 0.3))
  contents.forEach(([ing, state], i) => {
    const o = ingredientObject(ing, state, 0.1)
    const a = (i / Math.max(1, contents.length)) * Math.PI * 2
    const r = contents.length > 1 ? 0.06 : 0
    o.position.set(Math.cos(a) * r, 0.015, Math.sin(a) * r)
    g.add(o)
  })
  return g
}

/** Une pile d'assiettes : propres (blanches) ou sales (grises, tachées), `n` au plus 6 visibles. */
function plateStack(n: number, dirty: boolean): THREE.Object3D {
  const g = new THREE.Group()
  for (let i = 0; i < Math.min(6, n); i++) {
    const p = model('plate', 0.3)
    p.position.y = i * 0.025
    p.rotation.y = i * 0.7
    g.add(dirty ? tint(p, '#6b5a48', 0.55) : p)
  }
  return g
}

/** Un objet de la partie : ingrédient, assiette garnie, pile d'assiettes sales. */
export function itemObject(item: Item): THREE.Object3D {
  if (item.kind === 'plate') return plateObject(item.contents ?? [])
  if (item.kind === 'dirty') return plateStack(item.count ?? 1, true)
  return ingredientObject(item.ing!, ingredientState(item))
}

/** Signature d'un objet : on ne refait son modèle que quand elle change. */
function signature(item: Item | null | undefined): string {
  if (!item) return ''
  if (item.kind === 'ingredient') return `${item.id}:${item.ing}:${ingredientState(item)}`
  if (item.kind === 'dirty') return `${item.id}:dirty:${item.count}`
  return `${item.id}:${item.kind}:${(item.contents ?? []).map((c) => c.join('/')).join(',')}`
}

/** Le plat que devient une assiette : le bon le plus ancien qu'elle sert, ou dont elle a déjà une partie. */
export function dishOf(state: ServiceState, item: Item | null | undefined): string | null {
  if (item?.kind !== 'plate' || !item.contents?.length) return null
  const got = item.contents.map(([i, s]) => `${i}:${s}`)
  const pending = state.orders.filter((o) => o.status === 'pending').sort((a, b) => a.at - b.at)
  const fits = (recipe: string) => {
    const left = RECIPES[recipe].dish.contents.map(([i, s]) => `${i}:${s}`)
    return got.every((g) => {
      const k = left.indexOf(g)
      if (k < 0) return false
      left.splice(k, 1)
      return true
    })
  }
  return pending.find((o) => fits(o.recipe))?.recipe ?? null
}

/** La couleur du plat que devient une assiette (celle de son bon), ou null. */
export function dishColor(state: ServiceState, item: Item | null | undefined): string | null {
  const recipe = dishOf(state, item)
  return recipe ? RECIPES[recipe].color : null
}

/** Un anneau de couleur sous une assiette : le plat qu'elle devient (cf. dishColor). */
const ringGeometry = new THREE.RingGeometry(0.15, 0.2, 28).rotateX(-Math.PI / 2)
const ringMaterials = new Map<string, THREE.Material>()
function tintRing(color: string): THREE.Object3D {
  let m = ringMaterials.get(color)
  if (!m) ringMaterials.set(color, (m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false })))
  const ring = new THREE.Mesh(ringGeometry, m)
  ring.position.y = 0.006
  ring.renderOrder = 3
  return ring
}

/** L'image d'un ingrédient (cf. public/assets/mess-rush/food/), en sprite : ce que contient une marmite. */
const foodMaterials = new Map<string, THREE.SpriteMaterial>()
export function foodImage(ing: string, state = 'brut'): string {
  const base = INGREDIENTS[ing].model
  const name = state === 'coupé' && CUT[base] ? CUT[base] : (state === 'cuit' || state === 'saisi') && base === 'meat-raw' ? 'meat-cooked' : base
  return `${import.meta.env.BASE_URL}assets/mess-rush/food/${name}.png`
}
function foodMaterial(ing: string): THREE.SpriteMaterial {
  let m = foodMaterials.get(ing)
  if (!m) {
    const t = new THREE.TextureLoader().load(foodImage(ing))
    t.colorSpace = THREE.SRGBColorSpace
    foodMaterials.set(ing, (m = new THREE.SpriteMaterial({ map: t, depthTest: false, depthWrite: false, transparent: true })))
  }
  return m
}
/** La pastille sombre sous les images d'une marmite. */
const bubbleMaterial = new THREE.SpriteMaterial({ color: '#0b0d12', opacity: 0.75, depthTest: false, depthWrite: false, transparent: true })

/** Taille d'une jauge (m) : lisible de la vue du dessus de la cuisine. */
const GAUGE_W = 0.62
const GAUGE_H = 0.12

/**
 * Une jauge au-dessus d'un poste : un cadre clair, un fond sombre, la part faite en orange (vert quand
 * c'est prêt, rouge quand ça va brûler). Elle se dessine par-dessus tout ; ses matériaux sont
 * « transparents » pour passer après le décor.
 */
class Gauge {
  readonly root = new THREE.Group()
  private readonly fill: THREE.Mesh
  constructor() {
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(GAUGE_W + 0.04, GAUGE_H + 0.04), new THREE.MeshBasicMaterial({ color: '#f4efe2', depthTest: false, depthWrite: false, transparent: true }))
    const back = new THREE.Mesh(new THREE.PlaneGeometry(GAUGE_W, GAUGE_H), new THREE.MeshBasicMaterial({ color: '#0b0d12', depthTest: false, depthWrite: false, transparent: true }))
    this.fill = new THREE.Mesh(new THREE.PlaneGeometry(GAUGE_W - 0.03, GAUGE_H - 0.03), new THREE.MeshBasicMaterial({ color: '#ff8a1c', depthTest: false, depthWrite: false, transparent: true }))
    frame.renderOrder = 20
    back.renderOrder = 21
    this.fill.renderOrder = 22
    this.root.add(frame, back, this.fill)
    this.root.visible = false
  }
  set(f: number | null, color = '#ff8a1c') {
    this.root.visible = f !== null
    if (f === null) return
    const k = THREE.MathUtils.clamp(f, 0.02, 1)
    this.fill.scale.x = k
    this.fill.position.x = -((GAUGE_W - 0.03) / 2) * (1 - k)
    ;(this.fill.material as THREE.MeshBasicMaterial).color.set(color)
  }
}

/** Le repère de chaque sorte de poste (les caisses n'en ont pas : l'ingrédient est posé dessus). */
const STATION_ICONS: Partial<Record<StationKind, IconName>> = {
  board: 'knife', sink: 'drop', pot: 'cooking-pot', pan: 'flame', plates: 'fork-knife', return: 'arrows-clockwise', pass: 'bell-ringing', trash: 'trash',
}
/** Hauteur des repères, des jauges, des images d'une marmite, et des flèches. */
const ICON_Y = 1.2
const GAUGE_Y = 0.78
const BUBBLE_Y = 0.98
const ARROW_Y = 1.75
/** Les flèches du guidage, au plus. */
const ARROWS = 3
/** Hauteur des cloisons : celle des comptoirs, qu'on se passe les plats par-dessus. */
const WALL_TOP = COUNTER_TOP

/** Une flèche verte qui pointe vers le bas, au-dessus d'un poste. */
function arrowMesh(): THREE.Object3D {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.lineTo(0.2, 0.2)
  shape.lineTo(0.08, 0.2)
  shape.lineTo(0.08, 0.4)
  shape.lineTo(-0.08, 0.4)
  shape.lineTo(-0.08, 0.2)
  shape.lineTo(-0.2, 0.2)
  shape.closePath()
  const geometry = new THREE.ShapeGeometry(shape)
  const g = new THREE.Group()
  const edge = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: '#0b0d12', depthTest: false, depthWrite: false, transparent: true }))
  edge.scale.setScalar(1.25)
  edge.position.y = -0.03
  g.scale.setScalar(1.2)
  const body = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: '#4cd88a', depthTest: false, depthWrite: false, transparent: true }))
  edge.renderOrder = 23
  body.renderOrder = 24
  g.add(edge, body)
  g.visible = false
  return g
}

/**
 * Les cloisons d'une cuisine à plusieurs : des comptoirs bas (on se passe les plats par-dessus), les
 * passe-plats marqués d'un carré orange.
 */
function wallObject(walls: Rect[], stations: string[]): THREE.Object3D {
  const g = new THREE.Group()
  const cabinet = new THREE.MeshLambertMaterial({ color: '#2a2f3a' })
  const top = new THREE.MeshLambertMaterial({ color: '#b9c0ca' })
  const stripe = new THREE.MeshBasicMaterial({ color: '#ff8a1c' })
  for (const w of walls) {
    const sx = w.maxX - w.minX, sz = w.maxZ - w.minZ
    const body = new THREE.Mesh(new THREE.BoxGeometry(sx, WALL_TOP - 0.03, sz), cabinet)
    body.position.set((w.minX + w.maxX) / 2, (WALL_TOP - 0.03) / 2, (w.minZ + w.maxZ) / 2)
    const plate = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.04, 0.03, sz + 0.04), top)
    plate.position.set(body.position.x, WALL_TOP - 0.015, body.position.z)
    const line = new THREE.Mesh(new THREE.BoxGeometry(sx > sz ? sx : 0.05, 0.006, sx > sz ? 0.05 : sz), stripe)
    line.position.set(body.position.x, WALL_TOP + 0.003, body.position.z)
    g.add(body, plate, line)
  }
  for (const id of stations) {
    const s = STATION_BY_ID[id]
    if (!id.startsWith('passe-plat')) continue
    // Le passe-plat : un carré cerclé d'orange sur le dessus de la cloison.
    const ring = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.012, 0.42), stripe)
    const inner = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.014, 0.34), top)
    ring.position.set(s.x, WALL_TOP + 0.006, s.z)
    inner.position.set(s.x, WALL_TOP + 0.008, s.z)
    g.add(ring, inner)
  }
  // Basse, la cloison ne cache jamais personne : elle ne se trame pas (cf. Deck.addRuntime).
  g.traverse((o) => (o.userData.keepMaterial = true))
  return g
}

/** Une flaque (le plateau renversé) : quelques taches rondes qui se chevauchent, à plat, un peu brillantes. */
function puddle(color: string, size: number): THREE.Object3D {
  const g = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85, depthWrite: false })
  const spots: [number, number, number][] = [[0, 0, 1], [0.45, 0.2, 0.6], [-0.4, 0.25, 0.55], [0.15, -0.4, 0.5], [-0.3, -0.3, 0.4]]
  for (const [x, z, r] of spots) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r * size * 0.5, 20), mat)
    m.rotation.x = -Math.PI / 2
    m.position.set(x * size * 0.5, 0, z * size * 0.5)
    m.renderOrder = 2
    g.add(m)
  }
  g.visible = false
  return g
}

/** Pose un objet sur le pont de la cuisine, avec ses rectangles de collision (cf. Deck.addRuntime) ; rend de quoi le retirer. */
export type PlaceOnDeck = (o: THREE.Object3D, solids: Box2[], fade: THREE.Vector3) => () => void

/** Qui tient quoi : le joueur local et ses coéquipiers (leur avatar, s'il est là). */
export type AvatarOf = (pid: string) => Avatar | null

/** Un ustensile sur son feu : le modèle, l'alerte, la fumée, les images de ce qu'il contient, la lueur de la surchauffe. */
interface Burner {
  pot: THREE.Object3D
  warn: THREE.Sprite
  smoke: THREE.Mesh[]
  bubbles: THREE.Sprite[]
  heat: THREE.Mesh
  key: string
}

export class KitchenProps {
  readonly group = new THREE.Group()
  /** Ce qui est posé sur chaque poste, et sa signature. */
  private readonly onStation = new Map<string, { key: string; obj: THREE.Object3D }>()
  /** Ce que chaque joueur porte, et sa signature. */
  private readonly inHands = new Map<string, { key: string; obj: THREE.Object3D }>()
  private readonly gauges = new Map<string, Gauge>()
  private readonly burners = new Map<string, Burner>()
  private readonly icons = new Map<string, THREE.Sprite>()
  private readonly arrows: THREE.Object3D[] = []
  private readonly tmp = new THREE.Vector3()
  /** Les cloisons posées, et ce qui les a fait poser (plan, ouverte). */
  private walls: { key: string; remove: () => void } | null = null
  /** Postes visés par les flèches. */
  private aimed: string[] = []
  /** La flaque du plateau renversé, sur la passe. */
  private readonly spill = puddle('#7a3b17', 0.42)
  /** Comète, le chat du bord, quand il saute sur un comptoir (chargé à la première fois). */
  private cat: { root: THREE.Object3D; mixer: THREE.AnimationMixer } | null = null
  private catLoading = false

  constructor(private readonly parent: THREE.Object3D, private readonly place: PlaceOnDeck) {
    parent.add(this.group)
    for (let i = 0; i < ARROWS; i++) {
      const a = arrowMesh()
      this.arrows.push(a)
      this.group.add(a)
    }
    const smoke = new THREE.MeshLambertMaterial({ color: '#2a2a2a', transparent: true, opacity: 0.55, depthWrite: false })
    const heat = new THREE.MeshBasicMaterial({ color: '#ff3b1c', transparent: true, opacity: 0.4, depthWrite: false })
    for (const s of STATIONS) {
      const name = STATION_ICONS[s.kind] ?? (s.id.startsWith('passe-plat') ? 'arrows-left-right' : null)
      if (name) {
        // Chaque repère a son matériau (son opacité : grisé chez un coéquipier), sur la texture partagée.
        const sprite = new THREE.Sprite(markerMaterial(name).clone())
        sprite.scale.setScalar(0.38)
        sprite.position.set(s.x, ICON_Y, s.z)
        sprite.renderOrder = 18
        sprite.visible = false
        this.icons.set(s.id, sprite)
        this.group.add(sprite)
      }
      if (s.kind === 'crate') {
        // L'ingrédient, en grand, sur sa caisse.
        const o = ingredientObject(s.ing!, 'brut', 0.3)
        o.position.set(s.x, TOP, s.z)
        this.group.add(o)
      }
      if (s.kind === 'pot' || s.kind === 'pan') {
        const pot = model(s.kind === 'pot' ? 'pot' : 'frying-pan', s.kind === 'pot' ? 0.3 : 0.36)
        pot.position.set(s.x, TOP, s.z - 0.02)
        this.group.add(pot)
        const warn = new THREE.Sprite(markerMaterial('warning-circle', '#ff3b1c'))
        warn.scale.setScalar(0.4)
        warn.position.set(s.x, BUBBLE_Y + 0.28, s.z - 0.1)
        warn.renderOrder = 26
        warn.visible = false
        const puffs = [0, 1, 2].map(() => {
          const p = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), smoke)
          p.visible = false
          this.group.add(p)
          return p
        })
        const glowRing = new THREE.Mesh(new THREE.RingGeometry(0.14, 0.24, 24).rotateX(-Math.PI / 2), heat)
        glowRing.position.set(s.x, TOP + 0.004, s.z - 0.02)
        glowRing.visible = false
        this.group.add(warn, glowRing)
        this.burners.set(s.id, { pot, warn, smoke: puffs, bubbles: [], heat: glowRing, key: '' })
      }
      if (s.kind === 'board') {
        const board = model('cutting-board', 0.34)
        board.position.set(s.x, TOP, s.z)
        if (s.x < 8.3) board.rotation.y = Math.PI / 2
        this.group.add(board)
      }
      if (s.kind === 'pass') {
        this.spill.position.set(s.x, TOP + 0.006, s.z)
        this.group.add(this.spill)
      }
      if (['board', 'pot', 'pan', 'sink', 'pass'].includes(s.kind)) {
        const g = new Gauge()
        // Au-dessus du poste, un peu vers la caméra (le nord).
        g.root.position.set(s.x, GAUGE_Y, s.z - 0.15)
        this.group.add(g.root)
        this.gauges.set(s.id, g)
      }
    }
  }

  /**
   * Le plan de la cuisine, pour ce joueur : les cloisons (posées ou retirées quand il change), et
   * les repères des postes de la cuisine, pleins dans sa zone, grisés chez un coéquipier.
   */
  layout(state: ServiceState, you: string) {
    const kitchen = kitchenOf(state)
    const walls = wallsOf(state)
    const key = `${state.kitchen}:${walls.length}`
    if (this.walls?.key !== key) {
      this.walls?.remove()
      this.walls = null
      if (walls.length) {
        const o = wallObject(walls, kitchen.stations)
        const solids = walls.map((w) => ({ minX: w.minX, maxX: w.maxX, minZ: w.minZ, maxZ: w.maxZ }))
        this.walls = { key, remove: this.place(o, solids, new THREE.Vector3(12.4, 0, 10)) }
      } else this.walls = { key, remove: () => {} }
    }
    for (const [id, sprite] of this.icons) {
      sprite.visible = kitchen.stations.includes(id)
      ;(sprite.material as THREE.SpriteMaterial).opacity = canReach(state, you, id) ? 1 : 0.35
    }
  }

  /** Les postes que montrent les flèches du guidage (aucun : pas de flèche). */
  aim(stations: string[]) {
    this.aimed = stations.slice(0, ARROWS)
  }

  /** L'état a changé : chaque poste montre ce qu'il porte. */
  sync(state: ServiceState) {
    for (const s of STATIONS) {
      const st = state.stations[s.id] as (Partial<UtensilState> & Partial<CountState> & { item?: string | null }) | undefined
      // Un poste qui n'est pas (ou plus) de la cuisine : les passe-plats, une fois les cloisons tombées.
      if (!st) {
        this.onStation.get(s.id)?.obj.removeFromParent()
        this.onStation.delete(s.id)
        continue
      }
      const items = st.items ? st.items.map((id) => state.items[id]).filter(Boolean) : st.item ? [state.items[st.item]] : []
      const count = st.count ?? 0
      const key = `${items.map((it) => `${signature(it)}:${dishColor(state, it) ?? ''}`).join('|')}#${count}`
      const shown = this.onStation.get(s.id)
      if (shown?.key === key) continue
      shown?.obj.removeFromParent()
      const g = new THREE.Group()
      if (s.kind === 'plates') g.add(plateStack(count, false))
      else if (s.kind === 'return' || s.kind === 'sink') g.add(plateStack(count, true))
      items.forEach((it, i) => {
        const o = itemObject(it!)
        // Dans la marmite ou la poêle : côte à côte, au fond ; sinon, posé sur le poste.
        const inside = s.kind === 'pot' || s.kind === 'pan'
        o.position.set(inside ? (i - (items.length - 1) / 2) * 0.07 : 0, inside ? 0.05 : 0, 0)
        if (inside) o.scale.multiplyScalar(0.75)
        const color = dishColor(state, it)
        if (color) o.add(tintRing(color))
        g.add(o)
      })
      g.position.set(s.x, s.id.startsWith('passe-plat') ? WALL_TOP + 0.015 : TOP, s.z - (s.kind === 'pot' || s.kind === 'pan' ? 0.02 : 0))
      if (s.kind === 'sink') g.position.set(s.x - 0.2, TOP - 0.02, s.z + 0.02)
      this.group.add(g)
      this.onStation.set(s.id, { key, obj: g })
      // Les images de ce que contient la marmite, au-dessus d'elle, sur une pastille sombre.
      const b = this.burners.get(s.id)
      if (b) {
        const bkey = (st.items ?? []).map((id) => state.items[id]?.ing).join(',')
        if (bkey !== b.key) {
          b.key = bkey
          for (const sp of b.bubbles) sp.removeFromParent()
          b.bubbles = []
          const ings = (st.items ?? []).map((id) => state.items[id]?.ing).filter(Boolean) as string[]
          if (ings.length) {
            const back = new THREE.Sprite(bubbleMaterial)
            back.scale.set(0.2 * ings.length + 0.08, 0.26, 1)
            back.position.set(s.x, BUBBLE_Y, s.z - 0.1)
            back.renderOrder = 24
            b.bubbles.push(back)
            ings.forEach((ing, i) => {
              const sp = new THREE.Sprite(foodMaterial(ing))
              sp.scale.setScalar(0.2)
              sp.position.set(s.x + (i - (ings.length - 1) / 2) * 0.2, BUBBLE_Y, s.z - 0.1)
              sp.renderOrder = 25
              b.bubbles.push(sp)
            })
            this.group.add(...b.bubbles)
          }
        }
      }
    }
  }

  /**
   * À chaque image : ce que chacun porte suit ses mains (les bras se tendent), les jauges avancent
   * (gestes : la progression ; cuissons : l'heure du relais, `now`), l'alerte clignote quand ça va
   * brûler, la fumée monte de ce qui a brûlé ; le chat, la flaque, la surchauffe.
   */
  update(state: ServiceState, now: number, avatarOf: AvatarOf, camera: THREE.Camera) {
    const holders = new Set<string>()
    for (const [pid, id] of Object.entries(state.hands)) {
      const item = id ? state.items[id] : null
      const avatar = avatarOf(pid)
      if (!item || !avatar) continue
      holders.add(pid)
      const color = dishColor(state, item)
      const key = `${signature(item)}:${color ?? ''}`
      let held = this.inHands.get(pid)
      if (held?.key !== key) {
        held?.obj.removeFromParent()
        const obj = itemObject(item)
        if (color) obj.add(tintRing(color))
        held = { key, obj }
        this.group.add(held.obj)
        this.inHands.set(pid, held)
      }
      avatar.carrying = true
      const at = avatar.hands(this.tmp) ?? avatar.root.getWorldPosition(this.tmp).setY(avatar.root.getWorldPosition(this.tmp).y + 0.35)
      held.obj.position.copy(this.parent.worldToLocal(at))
      held.obj.position.y += HAND_LIFT
    }
    for (const [pid, held] of this.inHands) {
      if (holders.has(pid)) continue
      held.obj.removeFromParent()
      this.inHands.delete(pid)
      const avatar = avatarOf(pid)
      if (avatar) avatar.carrying = false
    }
    const t = performance.now() / 1000
    const warnAt = RULES.cook.warn * 1000
    for (const s of STATIONS) {
      const gauge = this.gauges.get(s.id)
      const st = state.stations[s.id] as (Partial<UtensilState> & Partial<CountState> & { item?: string | null }) | undefined
      const b = this.burners.get(s.id)
      if (b) {
        const cook = st?.cook
        const warn = !!cook && !st?.burnt && !!st?.done && now >= cook.burnAt - warnAt
        b.warn.visible = warn && Math.sin(t * 14) > -0.3
        b.heat.visible = state.event?.kind === 'overheat' && !!st
        if (b.heat.visible) (b.heat.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.abs(Math.sin(t * 6)) * 0.35
        b.smoke.forEach((p, i) => {
          p.visible = !!st?.burnt
          if (!p.visible) return
          const k = (t * 0.5 + i / 3) % 1
          p.position.set(s.x + Math.sin(t + i * 2) * 0.05, TOP + 0.15 + k * 0.7, s.z - 0.05)
          p.scale.setScalar(0.6 + k * 1.6)
        })
        for (const sp of b.bubbles) sp.visible = !st?.burnt
        if (gauge) {
          if (!cook || st?.burnt) gauge.set(null)
          else if (!st?.done) gauge.set((now - cook.start) / (cook.until - cook.start))
          else gauge.set(1, warn ? '#ff3b1c' : '#4cd88a')
        }
      } else if (gauge) {
        if (s.kind === 'pass') gauge.set(state.event?.kind === 'spill' && state.event.progress ? state.event.progress / RULES.events.clean : null)
        else if (s.kind === 'sink') gauge.set(st?.count && st.progress ? st.progress / RULES.wash : null)
        else {
          const item = st?.item ? state.items[st.item] : null
          const next = item ? nextPrep(item) : null
          gauge.set(item && next && (item.progress ?? 0) > 0 ? (item.progress ?? 0) / PROCESSES[next].duration : null)
        }
      }
      if (gauge) gauge.root.quaternion.copy(camera.quaternion)
    }
    // Les flèches : elles rebondissent au-dessus des repères visés, qui battent un peu.
    this.arrows.forEach((a, i) => {
      const id = this.aimed[i]
      a.visible = !!id
      if (!id) return
      const s = STATION_BY_ID[id]
      a.position.set(s.x, ARROW_Y + Math.abs(Math.sin(t * 5)) * 0.12, s.z)
      a.quaternion.copy(camera.quaternion)
    })
    for (const [id, sprite] of this.icons) sprite.scale.setScalar(this.aimed.includes(id) ? 0.38 * (1.12 + Math.sin(t * 8) * 0.06) : 0.38)
    // Le plateau renversé : la flaque s'efface à mesure qu'on nettoie.
    this.spill.visible = state.event?.kind === 'spill'
    if (this.spill.visible) this.spill.scale.setScalar(1 - 0.7 * Math.min(1, (state.event?.progress ?? 0) / RULES.events.clean))
    this.updateCat(state, t)
  }

  /** Comète sur son comptoir pendant l'imprévu du chat (son modèle se charge la première fois). */
  private lastT = 0
  private updateCat(state: ServiceState, t: number) {
    const e = state.event?.kind === 'cat' ? state.event : null
    if (e && !this.cat && !this.catLoading) {
      this.catLoading = true
      void rig(CAT_MODEL).then((r) => {
        r.root.scale.setScalar(0.3)
        const mixer = new THREE.AnimationMixer(r.root)
        const clip = r.clips.find((c) => /idle/i.test(c.name)) ?? r.clips[0]
        if (clip) mixer.clipAction(clip).play()
        this.cat = { root: r.root, mixer }
        r.root.visible = false
        this.group.add(r.root)
      }).catch(() => {})
    }
    if (!this.cat) return
    this.cat.root.visible = !!e
    if (!e?.station) return
    const s = STATION_BY_ID[e.station]
    this.cat.root.position.set(s.x + 0.12, (s.id.startsWith('passe-plat') ? WALL_TOP : TOP) + 0.01, s.z)
    this.cat.root.rotation.y = Math.sin(t * 1.3) * 0.4
    this.cat.mixer.update(this.lastT ? Math.min(0.1, t - this.lastT) : 0)
    this.lastT = t
    // Il guette ce qui est posé : son repère clignote, chassez-le !
    const sprite = this.icons.get(e.station)
    if (sprite) sprite.visible = Math.sin(t * 10) > 0
  }

  /** Fin du service : on vide les mains de chacun, les cloisons tombent, plus de repère ni de flèche. */
  release(avatarOf: AvatarOf) {
    this.walls?.remove()
    this.walls = null
    this.aimed = []
    for (const a of this.arrows) a.visible = false
    for (const sprite of this.icons.values()) sprite.visible = false
    this.spill.visible = false
    if (this.cat) this.cat.root.visible = false
    for (const b of this.burners.values()) {
      b.warn.visible = b.heat.visible = false
      for (const p of b.smoke) p.visible = false
    }
    for (const [pid, held] of this.inHands) {
      held.obj.removeFromParent()
      const avatar = avatarOf(pid)
      if (avatar) avatar.carrying = false
    }
    this.inHands.clear()
  }

  dispose() {
    this.group.removeFromParent()
  }
}

/** L'état d'un ingrédient, accordé à son nom court (« Lapin coupé », « Crevettes saisies »). */
export function stateLabel(ing: string, state: string): string {
  if (EN) return { brut: '', coupé: 'chopped', cuit: 'boiled', saisi: 'seared', brûlé: 'burnt' }[state] ?? ''
  const g = INGREDIENTS[ing].gender
  const agree = (adj: string) => adj + (g === 'fs' ? 'e' : g === 'mp' ? 's' : g === 'fp' ? 'es' : '')
  if (state === 'brut') return ''
  return agree(state)
}
