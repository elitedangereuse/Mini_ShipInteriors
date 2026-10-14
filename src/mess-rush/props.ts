import * as THREE from 'three'
import { FOOD_PACK, packModel } from '../assets'
import type { Avatar } from '../avatar'
import { EN } from '../i18n'
import { INGREDIENTS, PROCESSES } from '../../shared/mess-rush-catalog.js'
import { STATIONS, ingredientState, nextPrep, type Item, type ServiceState } from '../../shared/mess-rush.js'

/*
 * Ce qu'on voit en cuisine, d'après l'état du service (cf. shared/mess-rush.js) : les ingrédients,
 * assiettes et tasses posés sur les postes ou portés à deux mains, la marmite et la poêle de chaque
 * fourneau (et ce qui y cuit), les planches des plans de travail, et une jauge au-dessus de chaque
 * geste ou cuisson en cours. Les modèles viennent du Food Kit de Kenney (cf. FOOD_PACK), chargé en
 * entrant dans la cuisine.
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

/** Une jauge au-dessus d'un poste : un fond sombre, la part faite en orange (vert quand c'est prêt). */
class Gauge {
  readonly root = new THREE.Group()
  private readonly fill: THREE.Mesh
  constructor() {
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.06), new THREE.MeshBasicMaterial({ color: '#0b0d12', transparent: true, opacity: 0.8, depthTest: false }))
    this.fill = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.032), new THREE.MeshBasicMaterial({ color: '#ff8a1c', depthTest: false }))
    this.fill.position.z = 0.001
    back.renderOrder = this.fill.renderOrder = 5
    this.root.add(back, this.fill)
    this.root.visible = false
  }
  set(f: number | null, done = false) {
    this.root.visible = f !== null
    if (f === null) return
    const k = THREE.MathUtils.clamp(f, 0.02, 1)
    this.fill.scale.x = k
    this.fill.position.x = -0.15 * (1 - k)
    ;(this.fill.material as THREE.MeshBasicMaterial).color.set(done ? '#4cd88a' : '#ff8a1c')
  }
}

/** Qui tient quoi : le joueur local et ses coéquipiers (leur avatar, s'il est là). */
export type AvatarOf = (pid: string) => Avatar | null

export class KitchenProps {
  readonly group = new THREE.Group()
  /** Ce qui est posé sur chaque poste, et sa signature. */
  private readonly onStation = new Map<string, { key: string; obj: THREE.Object3D }>()
  /** Ce que chaque joueur porte, et sa signature. */
  private readonly inHands = new Map<string, { key: string; obj: THREE.Object3D }>()
  private readonly gauges = new Map<string, Gauge>()
  private readonly utensils = new Map<string, { pot: THREE.Object3D; stew?: THREE.Object3D }>()
  private readonly tmp = new THREE.Vector3()

  constructor(private readonly parent: THREE.Object3D) {
    parent.add(this.group)
    for (const s of STATIONS) {
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
      if (s.kind !== 'fridge' && s.kind !== 'pantry' && s.kind !== 'plates' && s.kind !== 'trash' && s.kind !== 'pass') {
        const g = new Gauge()
        g.root.position.set(s.x, 1.05, s.z - 0.1)
        this.group.add(g.root)
        this.gauges.set(s.id, g)
      }
    }
  }

  /** L'état a changé : chaque poste montre ce qu'il porte. */
  sync(state: ServiceState) {
    for (const s of STATIONS) {
      const slot = state.stations[s.id] as { item?: string | null; items?: string[]; done?: boolean } | undefined
      if (!slot) continue
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
      if (slot?.cook) gauge.set(slot.done ? 1 : (now - slot.cook.start) / (slot.cook.until - slot.cook.start), !!slot.done)
      else if (item && next && (item.progress ?? 0) > 0) gauge.set((item.progress ?? 0) / PROCESSES[next].duration)
      else gauge.set(null)
      gauge.root.quaternion.copy(camera.quaternion)
    }
  }

  /** Fin du service : on vide les mains de chacun. */
  release(avatarOf: AvatarOf) {
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
