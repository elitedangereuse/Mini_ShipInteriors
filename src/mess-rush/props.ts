import * as THREE from 'three'
import { FOOD_PACK, packModel } from '../assets'
import type { Avatar } from '../avatar'
import type { Box2 } from '../deck'
import { markerMaterial } from '../economy/tasks'
import { EN } from '../i18n'
import type { IconName } from '../icons'
import { INGREDIENTS, PROCESSES, type StationKind } from '../../shared/mess-rush-catalog.js'
import { RULES, STATIONS, STATION_BY_ID, canReach, ingredientState, kitchenOf, nextPrep, wallsOf, type Item, type Rect, type ServiceState } from '../../shared/mess-rush.js'

/*
 * Ce qu'on voit en cuisine, d'après l'état du service (cf. shared/mess-rush.js) : les ingrédients,
 * assiettes et tasses posés sur les postes ou portés à deux mains, la marmite et la poêle de chaque
 * fourneau (et ce qui y cuit), les planches des plans de travail, une jauge devant chaque geste ou
 * cuisson en cours, le repère de chaque poste (grisé chez un coéquipier), les flèches du guidage, et,
 * à plusieurs, les cloisons et leurs passe-plats. Les modèles viennent du Food Kit de Kenney (cf.
 * FOOD_PACK), chargé en entrant dans la cuisine.
 */

/** Hauteur des plans de travail, du comptoir et des fourneaux (cf. furniture/kitchen.ts). */
const TOP = 0.47
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

/** Un ingrédient cuit, en plus sombre (les matériaux du pack, teintés une fois). */
const browned = new Map<THREE.Material, THREE.Material>()
function brown(o: THREE.Object3D): THREE.Object3D {
  o.traverse((c) => {
    if (!(c instanceof THREE.Mesh)) return
    const swap = (m: THREE.Material) => {
      let d = browned.get(m)
      if (!d) {
        d = m.clone()
        if ('color' in d && d.color instanceof THREE.Color) d.color.lerp(new THREE.Color('#5a3418'), 0.45)
        browned.set(m, d)
      }
      return d
    }
    c.material = Array.isArray(c.material) ? c.material.map(swap) : swap(c.material)
  })
  return o
}

/** Les modèles d'un ingrédient préparé (coupé en deux, en tranches), quand le pack en a un. */
const CUT: Record<string, string> = { apple: 'apple-half', mushroom: 'mushroom-half', paprika: 'paprika-slice' }

/** Un ingrédient, dans son état : cru, préparé, cuit. */
function ingredientObject(ing: string, state: string, size = 0.13): THREE.Object3D {
  const base = INGREDIENTS[ing].model
  if (state === 'cuit' && base === 'meat-raw') return model('meat-cooked', size)
  const name = state === 'coupé' || state === 'fouetté' ? CUT[base] ?? base : base
  const o = model(name, state === 'coupé' && !CUT[base] ? size * 0.85 : size)
  return state === 'cuit' ? brown(o) : o
}

/** Ce que contient une assiette, en petit, en cercle sur elle. */
function plateObject(contents: [string, string][]): THREE.Object3D {
  const g = new THREE.Group()
  g.add(model('plate', 0.26))
  contents.forEach(([ing, state], i) => {
    const o = ingredientObject(ing, state, 0.09)
    const a = (i / Math.max(1, contents.length)) * Math.PI * 2
    const r = contents.length > 1 ? 0.05 : 0
    o.position.set(Math.cos(a) * r, 0.015, Math.sin(a) * r)
    g.add(o)
  })
  return g
}

/** Un objet de la partie : ingrédient, assiette garnie, tasse. */
export function itemObject(item: Item): THREE.Object3D {
  if (item.kind === 'plate') return plateObject(item.contents ?? [])
  if (item.kind === 'cup') return model(item.contents?.[0]?.[0] === 'the-ethgreze' ? 'cup-tea' : 'cup-coffee', 0.11)
  return ingredientObject(item.ing!, ingredientState(item))
}

/** Signature d'un objet : on ne refait son modèle que quand elle change. */
function signature(item: Item | null | undefined): string {
  if (!item) return ''
  if (item.kind === 'ingredient') return `${item.id}:${item.ing}:${ingredientState(item)}`
  return `${item.id}:${item.kind}:${(item.contents ?? []).map((c) => c.join('/')).join(',')}`
}

/** Taille d'une jauge (m) : lisible de la vue du dessus de la cuisine. */
const GAUGE_W = 0.85
const GAUGE_H = 0.16

/**
 * Une jauge devant un poste, côté salle : un cadre clair, un fond sombre, la part faite en orange
 * (vert quand c'est prêt). Elle se dessine par-dessus tout, et plus bas que l'invite « E », qui se
 * pose au-dessus du poste (cf. main.ts) : avant, l'invite la cachait. Ses matériaux sont
 * « transparents » pour passer après le décor : opaque et sans test de profondeur, le remplissage
 * était recouvert par la passe transparente du pont.
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
  set(f: number | null, done = false) {
    this.root.visible = f !== null
    if (f === null) return
    const k = THREE.MathUtils.clamp(f, 0.02, 1)
    this.fill.scale.x = k
    this.fill.position.x = -((GAUGE_W - 0.03) / 2) * (1 - k)
    ;(this.fill.material as THREE.MeshBasicMaterial).color.set(done ? '#4cd88a' : '#ff8a1c')
  }
}

/** Le repère de chaque sorte de poste (les places du comptoir n'en ont pas, sauf les passe-plats). */
const STATION_ICONS: Partial<Record<StationKind, IconName>> = {
  fridge: 'snowflake', pantry: 'basket', board: 'knife', sink: 'drop', pot: 'cooking-pot', pan: 'flame', fountain: 'coffee',
  plates: 'fork-knife', pass: 'bell-ringing', trash: 'recycle',
}
/** Hauteur des repères, et des flèches au-dessus d'eux. */
const ICON_Y = 1.5
const ARROW_Y = 2.05
/** Les flèches du guidage, au plus. */
const ARROWS = 3
/** Hauteur des cloisons : celle des plans de travail, qu'on se passe les plats par-dessus. */
const WALL_TOP = 0.47

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
  g.scale.setScalar(1.3)
  const body = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: '#4cd88a', depthTest: false, depthWrite: false, transparent: true }))
  edge.renderOrder = 23
  body.renderOrder = 24
  g.add(edge, body)
  g.visible = false
  return g
}

/**
 * Les cloisons d'une cuisine à plusieurs : des plans de travail bas (on se passe les plats
 * par-dessus), les passe-plats marqués d'un carré orange, le bac de recyclage encastré.
 */
function wallObject(walls: Rect[], stations: string[]): THREE.Object3D {
  const g = new THREE.Group()
  // Comme le comptoir du self : un caisson sombre, un dessus inox, une baguette orange tout du long.
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
    if (!id.startsWith('passe-plat') && id !== 'recyclage-2') continue
    // (Les marques se posent sur le dessus de la cloison, cf. plus bas : elles ne se trament pas.)
    // Le passe-plat : un carré cerclé d'orange sur le dessus ; le bac : une trappe sombre cerclée de vert.
    const ring = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.012, 0.5), id === 'recyclage-2' ? new THREE.MeshBasicMaterial({ color: '#4cd88a' }) : stripe)
    const inner = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.014, 0.42), id === 'recyclage-2' ? new THREE.MeshBasicMaterial({ color: '#10141b' }) : top)
    ring.position.set(s.x, WALL_TOP + 0.006, s.z)
    inner.position.set(s.x, WALL_TOP + 0.008, s.z)
    g.add(ring, inner)
  }
  // Basse, la cloison ne cache jamais personne : elle ne se trame pas (cf. Deck.addRuntime).
  g.traverse((o) => (o.userData.keepMaterial = true))
  return g
}

/** Pose un objet sur le pont de la cuisine, avec ses rectangles de collision (cf. Deck.addRuntime) ; rend de quoi le retirer. */
export type PlaceOnDeck = (o: THREE.Object3D, solids: Box2[], fade: THREE.Vector3) => () => void

/** Qui tient quoi : le joueur local et ses coéquipiers (leur avatar, s'il est là). */
export type AvatarOf = (pid: string) => Avatar | null

/**
 * Une flaque (les imprévus) : quelques taches rondes qui se chevauchent, à plat, un peu brillantes.
 * Le plateau renversé laisse une sauce sur la passe ; la plonge bouchée déborde sur le sol.
 */
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

export class KitchenProps {
  readonly group = new THREE.Group()
  /** Ce qui est posé sur chaque poste, et sa signature. */
  private readonly onStation = new Map<string, { key: string; obj: THREE.Object3D }>()
  /** Ce que chaque joueur porte, et sa signature. */
  private readonly inHands = new Map<string, { key: string; obj: THREE.Object3D }>()
  private readonly gauges = new Map<string, Gauge>()
  private readonly utensils = new Map<string, { pot: THREE.Object3D; stew?: THREE.Object3D }>()
  private readonly icons = new Map<string, THREE.Sprite>()
  private readonly arrows: THREE.Object3D[] = []
  private readonly tmp = new THREE.Vector3()
  /** Les cloisons posées, et ce qui les a fait poser (plan, ouverte). */
  private walls: { key: string; remove: () => void } | null = null
  /** Postes visés par les flèches. */
  private aimed: string[] = []
  /** Les flaques des imprévus : la sauce du plateau renversé sur la passe, l'eau de la plonge bouchée. */
  private readonly spill = puddle('#7a3b17', 0.42)
  private readonly flood = puddle('#5fa8d8', 0.9)

  constructor(private readonly parent: THREE.Object3D, private readonly place: PlaceOnDeck) {
    parent.add(this.group)
    for (let i = 0; i < ARROWS; i++) {
      const a = arrowMesh()
      this.arrows.push(a)
      this.group.add(a)
    }
    for (const s of STATIONS) {
      const name = STATION_ICONS[s.kind] ?? (s.id.startsWith('passe-plat') ? 'arrows-left-right' : null)
      if (name) {
        // Chaque repère a son matériau (son opacité : grisé chez un coéquipier), sur la texture partagée.
        const sprite = new THREE.Sprite(markerMaterial(name).clone())
        sprite.scale.setScalar(0.42)
        sprite.position.set(s.x, ICON_Y, s.z)
        sprite.renderOrder = 18
        sprite.visible = false
        this.icons.set(s.id, sprite)
        this.group.add(sprite)
      }
      if (s.kind === 'pot' || s.kind === 'pan') {
        const pot = model(s.kind === 'pot' ? 'pot' : 'frying-pan', s.kind === 'pot' ? 0.24 : 0.3)
        pot.position.set(s.x, TOP, s.z - 0.05)
        this.group.add(pot)
        const u: { pot: THREE.Object3D; stew?: THREE.Object3D } = { pot }
        if (s.kind === 'pot') {
          u.stew = model('pot-stew', 0.24)
          u.stew.position.copy(pot.position)
          u.stew.visible = false
          this.group.add(u.stew)
        }
        this.utensils.set(s.id, u)
      }
      if (s.kind === 'board') {
        const board = model('cutting-board', 0.32)
        board.position.set(s.x, TOP, s.z - 0.05)
        this.group.add(board)
      }
      if (s.kind === 'pass') {
        this.spill.position.set(s.x, TOP + 0.006, s.z)
        this.group.add(this.spill)
      }
      if (s.kind === 'sink') {
        this.flood.position.set(s.x - 0.1, 0.012, s.z - 0.65)
        this.group.add(this.flood)
      }
      // La passe a sa jauge pour le nettoyage du plateau renversé.
      if (s.kind !== 'fridge' && s.kind !== 'pantry' && s.kind !== 'plates' && s.kind !== 'trash') {
        const g = new Gauge()
        // Devant le poste, côté salle (vers le milieu de la pièce), sous l'invite.
        g.root.position.set(s.x, 0.85, s.z + (s.z > 8.5 ? -0.55 : 0.55))
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
        this.walls = { key, remove: this.place(o, solids, new THREE.Vector3(12.675, 0, 9.3)) }
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
      const slot = state.stations[s.id] as { item?: string | null; items?: string[]; done?: boolean } | undefined
      // Un poste qui n'est pas (ou plus) de la cuisine : les passe-plats, une fois les cloisons tombées.
      if (!slot) {
        this.onStation.get(s.id)?.obj.removeFromParent()
        this.onStation.delete(s.id)
        continue
      }
      const items = slot.items ? slot.items.map((id) => state.items[id]).filter(Boolean) : slot.item ? [state.items[slot.item]] : []
      const key = items.map(signature).join('|')
      const shown = this.onStation.get(s.id)
      if (shown?.key === key) continue
      shown?.obj.removeFromParent()
      const g = new THREE.Group()
      items.forEach((it, i) => {
        const o = itemObject(it!)
        // Dans la marmite ou la poêle : au fond ; sinon, posé sur le poste.
        const inside = s.kind === 'pot' || s.kind === 'pan'
        o.position.set(inside ? (i - (items.length - 1) / 2) * 0.06 : 0, inside ? 0.04 : 0, 0)
        if (inside) o.scale.multiplyScalar(0.7)
        g.add(o)
      })
      g.position.set(s.x, TOP, s.z - (s.kind === 'counter' || s.kind === 'pass' || s.kind === 'plates' ? 0 : 0.05))
      if (s.id.startsWith('passe-plat')) g.position.y = WALL_TOP + 0.015
      if (s.kind === 'fountain') g.position.set(s.x + 0.12, 0.62, s.z + 0.1)
      this.group.add(g)
      this.onStation.set(s.id, { key, obj: g })
      // La marmite cuite : le ragoût fumant à la place de la marmite vide.
      const u = this.utensils.get(s.id)
      if (u?.stew) {
        u.stew.visible = !!slot.done
        u.pot.visible = !slot.done
        g.visible = !slot.done
      }
    }
  }

  /**
   * À chaque image : ce que chacun porte suit ses mains (les bras se tendent), et les jauges
   * avancent (gestes : la progression de l'ingrédient ; cuissons : l'heure du relais, `now`).
   */
  update(state: ServiceState, now: number, avatarOf: AvatarOf, camera: THREE.Camera) {
    const holders = new Set<string>()
    for (const [pid, id] of Object.entries(state.hands)) {
      const item = id ? state.items[id] : null
      const avatar = avatarOf(pid)
      if (!item || !avatar) continue
      holders.add(pid)
      const key = signature(item)
      let held = this.inHands.get(pid)
      if (held?.key !== key) {
        held?.obj.removeFromParent()
        held = { key, obj: itemObject(item) }
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
    for (const s of STATIONS) {
      const gauge = this.gauges.get(s.id)
      if (!gauge) continue
      const slot = state.stations[s.id] as { item?: string | null; cook?: { start: number; until: number } | null; done?: boolean }
      const item = slot?.item ? state.items[slot.item] : null
      const next = item ? nextPrep(item) : null
      if (s.kind === 'pass') gauge.set(state.event?.kind === 'spill' && state.event.progress ? state.event.progress / RULES.events.clean : null)
      else if (slot?.cook) gauge.set(slot.done ? 1 : (now - slot.cook.start) / (slot.cook.until - slot.cook.start), !!slot.done)
      else if (item && next && (item.progress ?? 0) > 0) gauge.set((item.progress ?? 0) / PROCESSES[next].duration)
      else gauge.set(null)
      gauge.root.quaternion.copy(camera.quaternion)
    }
    // Les flèches : elles rebondissent au-dessus des repères visés, qui battent un peu.
    const t = performance.now() / 1000
    this.arrows.forEach((a, i) => {
      const id = this.aimed[i]
      a.visible = !!id
      if (!id) return
      const s = STATION_BY_ID[id]
      a.position.set(s.x, ARROW_Y + Math.abs(Math.sin(t * 5)) * 0.12, s.z)
      a.quaternion.copy(camera.quaternion)
    })
    for (const [id, sprite] of this.icons) sprite.scale.setScalar(this.aimed.includes(id) ? 0.42 * (1.12 + Math.sin(t * 8) * 0.06) : 0.42)
    this.spill.visible = state.event?.kind === 'spill'
    this.flood.visible = state.event?.kind === 'sink'
    // La flaque de la passe s'efface à mesure qu'on la nettoie.
    if (this.spill.visible) this.spill.scale.setScalar(1 - 0.7 * Math.min(1, (state.event?.progress ?? 0) / RULES.events.clean))
  }

  /** Fin du service : on vide les mains de chacun, les cloisons tombent, plus de repère ni de flèche. */
  release(avatarOf: AvatarOf) {
    this.walls?.remove()
    this.walls = null
    this.aimed = []
    for (const a of this.arrows) a.visible = false
    for (const sprite of this.icons.values()) sprite.visible = false
    this.spill.visible = this.flood.visible = false
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

/** Le nom de l'état d'un ingrédient, accordé (genre et nombre de son nom court, cf. le catalogue). */
export function stateLabel(ing: string, state: string): string {
  if (EN) return { brut: '', rincé: 'rinsed', coupé: 'chopped', fouetté: 'whipped', cuit: 'cooked', infusé: 'brewed' }[state] ?? ''
  const g = INGREDIENTS[ing].gender
  const agree = (adj: string) => adj + (g === 'fs' ? 'e' : g === 'mp' ? 's' : g === 'fp' ? 'es' : '')
  if (state === 'brut') return ''
  if (state === 'fouetté') return 'en mousse'
  return agree(state)
}
