import * as THREE from 'three'
import arrowsSvg from '@phosphor-icons/core/fill/arrows-clockwise-fill.svg?raw'
import bellSvg from '@phosphor-icons/core/fill/bell-ringing-fill.svg?raw'
import potSvg from '@phosphor-icons/core/fill/cooking-pot-fill.svg?raw'
import dropSvg from '@phosphor-icons/core/fill/drop-fill.svg?raw'
import flameSvg from '@phosphor-icons/core/fill/flame-fill.svg?raw'
import forkKnifeSvg from '@phosphor-icons/core/fill/fork-knife-fill.svg?raw'
import knifeSvg from '@phosphor-icons/core/fill/knife-fill.svg?raw'
import trashSvg from '@phosphor-icons/core/fill/trash-fill.svg?raw'
import warningSvg from '@phosphor-icons/core/fill/warning-fill.svg?raw'
import { CAT_MODEL, FOOD_PACK, packModel, rig } from '../assets'
import type { Avatar } from '../avatar'
import { EN } from '../i18n'
import { INGREDIENTS, PROCESSES, RECIPES, type StationKind } from '../../shared/mess-rush-catalog.js'
import {
  COUNTER_TOP, RULES, STATIONS, STATION_BY_ID, ingredientState, nextPrep,
  type CountState, type Item, type ServiceState, type UtensilState,
} from '../../shared/mess-rush.js'

/*
 * Ce qu'on voit en cuisine, d'après l'état du service (cf. shared/mess-rush.js), pour qu'on comprenne
 * d'un coup d'œil, comme dans Overcooked : des aliments gros et reconnaissables (entiers, puis en
 * morceaux une fois coupés, dorés une fois cuits, noirs une fois brûlés), en grand sur leur caisse,
 * posés sur les planches et les comptoirs ou portés à deux mains ; la marmite et la poêle de chaque
 * feu, ce qu'elles contiennent (en bulles au-dessus), leur jauge, l'alerte quand ça va brûler et la
 * fumée quand c'est brûlé ; la pile d'assiettes propres, la vaisselle sale au retour et dans la
 * plonge ; un anneau de la couleur du plat sous chaque assiette qui le devient ; une pastille ronde
 * au-dessus de chaque poste ; et les imprévus : le plateau renversé sur la passe, Comète sur son
 * plan, les feux en surchauffe. Les modèles viennent du Food Kit de Kenney (cf. FOOD_PACK), chargé à
 * l'ouverture du salon ; Comète se charge avec lui, pas au milieu du service.
 */

/** Hauteur des comptoirs, des planches et des fourneaux (cf. furniture/mess-rush.ts). */
const TOP = COUNTER_TOP + 0.005
/** Ce qu'on porte repose sur les mains : un peu au-dessus de leur bout. */
const HAND_LIFT = 0.02
/** Taille d'un aliment (m) : posé ou porté, sur sa caisse, dans une assiette. */
const FOOD = 0.25
const ON_CRATE = 0.36
const ON_PLATE = 0.14
const PLATE = 0.34

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
const CUT: Record<string, string> = { apple: 'apple-half' }

/** Coupé : trois morceaux (ou deux moitiés), pour qu'on voie d'un coup que c'est prêt. */
function pieces(name: string, size: number): THREE.Object3D {
  const g = new THREE.Group()
  const half = CUT[name]
  const spots: [number, number, number][] = half ? [[-0.22, 0, 0.4], [0.22, 0.05, -0.5]] : [[-0.22, -0.12, 0.3], [0.2, -0.14, 1.9], [0, 0.18, 3.6]]
  for (const [x, z, a] of spots) {
    const p = model(half ?? name, size * (half ? 0.62 : 0.55))
    p.position.set(x * size, 0, z * size)
    p.rotation.y = a
    g.add(p)
  }
  return g
}

/**
 * Un ingrédient, dans son état : entier, coupé (en morceaux), cuit (doré, le riz reste blanc), saisi,
 * brûlé (noir). Dans une assiette (`whole`), en un seul morceau, pour rester lisible en petit.
 */
function ingredientObject(ing: string, state: string, size = FOOD, whole = false): THREE.Object3D {
  const base = INGREDIENTS[ing].model
  const meat = base === 'meat-raw'
  const cut = (name: string) => (whole ? model(CUT[name] ?? name, size) : pieces(name, size))
  if (state === 'brûlé') return tint(model(meat ? 'meat-cooked' : base, size), '#1b1410', 0.85)
  if ((state === 'cuit' || state === 'saisi') && meat) return model('meat-cooked', size)
  if (state === 'coupé') return cut(base)
  if (state === 'cuit' || state === 'saisi') {
    const o = INGREDIENTS[ing].prep.length ? cut(base) : model(base, size)
    return base === 'rice-ball' ? o : tint(o, '#5a3418', 0.45)
  }
  return model(base, size)
}

/** Une ombre douce sous ce qui est posé : l'aliment se détache du comptoir clair. */
const shadowGeometry = new THREE.CircleGeometry(0.15, 20).rotateX(-Math.PI / 2)
const shadowMaterial = new THREE.MeshBasicMaterial({ color: '#0b0d12', transparent: true, opacity: 0.28, depthWrite: false })
function withShadow(o: THREE.Object3D): THREE.Object3D {
  const s = new THREE.Mesh(shadowGeometry, shadowMaterial)
  s.position.y = 0.003
  s.renderOrder = 1
  o.add(s)
  return o
}

/** Ce que contient une assiette, en cercle sur elle. */
function plateObject(contents: [string, string][]): THREE.Object3D {
  const g = new THREE.Group()
  g.add(model('plate', PLATE))
  contents.forEach(([ing, state], i) => {
    const o = ingredientObject(ing, state, ON_PLATE, true)
    const a = (i / Math.max(1, contents.length)) * Math.PI * 2
    const r = contents.length > 1 ? 0.07 : 0
    o.position.set(Math.cos(a) * r, 0.015, Math.sin(a) * r)
    g.add(o)
  })
  return g
}

/** Une pile d'assiettes : propres (blanches) ou sales (grises, tachées), `n` au plus 6 visibles. */
function plateStack(n: number, dirty: boolean): THREE.Object3D {
  const g = new THREE.Group()
  for (let i = 0; i < Math.min(6, n); i++) {
    const p = model('plate', PLATE)
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
const ringGeometry = new THREE.RingGeometry(0.17, 0.23, 28).rotateX(-Math.PI / 2)
const ringMaterials = new Map<string, THREE.Material>()
function tintRing(color: string): THREE.Object3D {
  let m = ringMaterials.get(color)
  if (!m) ringMaterials.set(color, (m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false })))
  const ring = new THREE.Mesh(ringGeometry, m)
  ring.position.y = 0.006
  ring.renderOrder = 3
  return ring
}

/** L'image d'un ingrédient (cf. public/assets/mess-rush/food/), pour les bons et les bulles des marmites. */
export function foodImage(ing: string, state = 'brut'): string {
  const base = INGREDIENTS[ing].model
  const name = state === 'coupé' && CUT[base] ? CUT[base] : (state === 'cuit' || state === 'saisi') && base === 'meat-raw' ? 'meat-cooked' : base
  return `${import.meta.env.BASE_URL}assets/mess-rush/food/${name}.png`
}

/**
 * Une pastille ronde, façon dessin animé : un gros cerne sombre, un fond vif avec son reflet, et le
 * pictogramme (plein) au milieu ; ou, sans pictogramme, l'image d'un aliment (les bulles des
 * marmites). Une texture par pastille, dessinée une fois.
 */
const badges = new Map<string, THREE.SpriteMaterial>()
function badge(key: string, fill: string, draw: { svg: string; color: string } | { image: string }): THREE.SpriteMaterial {
  let m = badges.get(key)
  if (m) return m
  const S = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = S
  const g = canvas.getContext('2d')!
  const disc = (x: number, y: number, r: number, color: string) => {
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fillStyle = color
    g.fill()
  }
  disc(64, 70, 55, 'rgba(0, 0, 0, 0.35)')
  disc(64, 62, 57, '#14161c')
  disc(64, 62, 47, fill)
  g.beginPath()
  g.ellipse(64, 40, 30, 14, 0, 0, Math.PI * 2)
  g.fillStyle = 'rgba(255, 255, 255, 0.32)'
  g.fill()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  const img = new Image()
  img.onload = () => {
    if ('svg' in draw) g.drawImage(img, 30, 28, 68, 68)
    else g.drawImage(img, 22, 20, 84, 84)
    texture.needsUpdate = true
  }
  img.src = 'svg' in draw ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(draw.svg.replace(/currentColor/g, draw.color))}` : draw.image
  m = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false })
  badges.set(key, m)
  return m
}

/** La pastille de chaque sorte de poste (les caisses et les comptoirs n'en ont pas : ce qu'ils portent se voit). */
const STATION_BADGES: Partial<Record<StationKind, { svg: string; fill: string; color?: string }>> = {
  board: { svg: knifeSvg, fill: '#ffb020' },
  pot: { svg: potSvg, fill: '#ff7a2f' },
  pan: { svg: flameSvg, fill: '#ff4d3d' },
  sink: { svg: dropSvg, fill: '#3fa9ff' },
  plates: { svg: forkKnifeSvg, fill: '#4cd88a' },
  return: { svg: arrowsSvg, fill: '#8f9bb0' },
  pass: { svg: bellSvg, fill: '#ffd23f', color: '#2a211a' },
  trash: { svg: trashSvg, fill: '#6b7280' },
}
const stationBadge = (kind: StationKind) => {
  const b = STATION_BADGES[kind]
  return b ? badge(`station:${kind}`, b.fill, { svg: b.svg, color: b.color ?? '#ffffff' }) : null
}
/** La bulle d'un aliment au-dessus d'une marmite. */
const foodBadge = (ing: string) => badge(`food:${ing}`, '#fdf6e3', { image: foodImage(ing) })

/** Taille d'une jauge (m) : lisible de la vue du dessus de la cuisine. */
const GAUGE_W = 0.62
const GAUGE_H = 0.13

/**
 * Une jauge au-dessus d'un poste : un cadre sombre, la part faite en orange (vert quand c'est prêt,
 * rouge quand ça va brûler). Elle se dessine par-dessus tout ; ses matériaux sont « transparents »
 * pour passer après le décor.
 */
class Gauge {
  readonly root = new THREE.Group()
  private readonly fill: THREE.Mesh
  constructor() {
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(GAUGE_W + 0.05, GAUGE_H + 0.05), new THREE.MeshBasicMaterial({ color: '#14161c', depthTest: false, depthWrite: false, transparent: true }))
    const back = new THREE.Mesh(new THREE.PlaneGeometry(GAUGE_W, GAUGE_H), new THREE.MeshBasicMaterial({ color: '#3a3f4b', depthTest: false, depthWrite: false, transparent: true }))
    this.fill = new THREE.Mesh(new THREE.PlaneGeometry(GAUGE_W, GAUGE_H), new THREE.MeshBasicMaterial({ color: '#ff8a1c', depthTest: false, depthWrite: false, transparent: true }))
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
    this.fill.position.x = -(GAUGE_W / 2) * (1 - k)
    ;(this.fill.material as THREE.MeshBasicMaterial).color.set(color)
  }
}

/** Hauteur des pastilles, des jauges, des bulles d'une marmite. */
const ICON_Y = 1.0
const ICON_SIZE = 0.4
const GAUGE_Y = 0.66
const BUBBLE_Y = ICON_Y

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

/** Qui tient quoi : le joueur local et ses coéquipiers (leur avatar, s'il est là). */
export type AvatarOf = (pid: string) => Avatar | null

/** Un ustensile sur son feu : le modèle, l'alerte, la fumée, les bulles de ce qu'il contient, la lueur de la surchauffe. */
interface Burner {
  warn: THREE.Sprite
  smoke: THREE.Mesh[]
  bubbles: THREE.Sprite[]
  heat: THREE.Mesh
  key: string
}

/** Où se pose ce qui est sur un poste : au mur est, un peu vers la cuisine. */
const placeOf = (s: (typeof STATIONS)[number]) => ({ x: s.x - (s.x > 16.8 ? 0.05 : 0), z: s.z - (s.kind === 'pot' || s.kind === 'pan' ? 0.02 : 0) })

export class KitchenProps {
  readonly group = new THREE.Group()
  /** Ce qui est posé sur chaque poste, et sa signature. */
  private readonly onStation = new Map<string, { key: string; obj: THREE.Object3D }>()
  /** Ce que chaque joueur porte, et sa signature. */
  private readonly inHands = new Map<string, { key: string; obj: THREE.Object3D }>()
  private readonly gauges = new Map<string, Gauge>()
  private readonly burners = new Map<string, Burner>()
  private readonly icons = new Map<string, THREE.Sprite>()
  private readonly tmp = new THREE.Vector3()
  /** La flaque du plateau renversé, sur la passe. */
  private readonly spill = puddle('#7a3b17', 0.42)
  /** Comète, le chat du bord, pour l'imprévu du chat (chargé avec la cuisine). */
  private cat: { root: THREE.Object3D; mixer: THREE.AnimationMixer } | null = null

  constructor(private readonly parent: THREE.Object3D) {
    parent.add(this.group)
    const smoke = new THREE.MeshLambertMaterial({ color: '#2a2a2a', transparent: true, opacity: 0.55, depthWrite: false })
    const heat = new THREE.MeshBasicMaterial({ color: '#ff3b1c', transparent: true, opacity: 0.4, depthWrite: false })
    const smokeGeometry = new THREE.SphereGeometry(0.07, 8, 6)
    for (const s of STATIONS) {
      const material = stationBadge(s.kind)
      if (material) {
        const sprite = new THREE.Sprite(material)
        sprite.scale.setScalar(ICON_SIZE)
        sprite.position.set(s.x, ICON_Y, s.z)
        sprite.renderOrder = 18
        sprite.visible = false
        this.icons.set(s.id, sprite)
        this.group.add(sprite)
      }
      if (s.kind === 'crate') {
        // L'ingrédient, en grand, sur sa caisse.
        const o = ingredientObject(s.ing!, 'brut', ON_CRATE)
        o.position.set(s.x, TOP, s.z)
        this.group.add(o)
      }
      if (s.kind === 'pot' || s.kind === 'pan') {
        const pot = model(s.kind === 'pot' ? 'pot' : 'frying-pan', s.kind === 'pot' ? 0.34 : 0.4)
        pot.position.set(s.x, TOP, s.z - 0.02)
        this.group.add(pot)
        const warn = new THREE.Sprite(badge('warn', '#ff3b1c', { svg: warningSvg, color: '#ffffff' }))
        warn.scale.setScalar(0.42)
        warn.position.set(s.x, BUBBLE_Y + 0.3, s.z - 0.1)
        warn.renderOrder = 26
        warn.visible = false
        const puffs = [0, 1, 2].map(() => {
          const p = new THREE.Mesh(smokeGeometry, smoke)
          p.visible = false
          this.group.add(p)
          return p
        })
        const glowRing = new THREE.Mesh(new THREE.RingGeometry(0.14, 0.24, 24).rotateX(-Math.PI / 2), heat)
        glowRing.position.set(s.x, TOP + 0.004, s.z - 0.02)
        glowRing.visible = false
        this.group.add(warn, glowRing)
        this.burners.set(s.id, { warn, smoke: puffs, bubbles: [], heat: glowRing, key: '' })
      }
      if (s.kind === 'board') {
        const board = model('cutting-board', 0.4)
        board.position.set(s.x, TOP, s.z)
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
    // Comète se charge tout de suite, en même temps que la cuisine : pas d'à-coup au premier imprévu du chat.
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

  /** Le service commence : les pastilles des postes apparaissent. */
  show() {
    for (const sprite of this.icons.values()) sprite.visible = true
  }

  /** L'état a changé : chaque poste montre ce qu'il porte. */
  sync(state: ServiceState) {
    for (const s of STATIONS) {
      const st = state.stations[s.id] as (Partial<UtensilState> & Partial<CountState> & { item?: string | null }) | undefined
      if (!st) continue
      const items = st.items ? st.items.map((id) => state.items[id]).filter(Boolean) : st.item ? [state.items[st.item]] : []
      const count = st.count ?? 0
      const key = `${items.map((it) => `${signature(it)}:${dishColor(state, it) ?? ''}`).join('|')}#${count}`
      const shown = this.onStation.get(s.id)
      if (shown?.key === key) continue
      shown?.obj.removeFromParent()
      const g = new THREE.Group()
      if (s.kind === 'plates') g.add(plateStack(count, false))
      else if (s.kind === 'return' || s.kind === 'sink') g.add(plateStack(count, true))
      const inside = s.kind === 'pot' || s.kind === 'pan'
      items.forEach((it, i) => {
        const o = itemObject(it!)
        // Dans la marmite ou la poêle : côte à côte, au fond ; sinon, posé sur le poste, avec son ombre.
        o.position.set(inside ? (i - (items.length - 1) / 2) * 0.07 : 0, inside ? 0.05 : 0, 0)
        if (inside) o.scale.multiplyScalar(0.6)
        else if (it!.kind === 'ingredient') withShadow(o)
        const color = dishColor(state, it)
        if (color) o.add(tintRing(color))
        g.add(o)
      })
      const at = placeOf(s)
      g.position.set(at.x, TOP, at.z)
      if (s.kind === 'sink') g.position.set(s.x - 0.2, TOP - 0.02, s.z + 0.02)
      this.group.add(g)
      this.onStation.set(s.id, { key, obj: g })
      // Les bulles de ce que contient la marmite, au-dessus d'elle.
      const b = this.burners.get(s.id)
      if (b) {
        const ings = (st.items ?? []).map((id) => state.items[id]?.ing).filter(Boolean) as string[]
        const bkey = ings.join(',')
        if (bkey !== b.key) {
          b.key = bkey
          for (const sp of b.bubbles) sp.removeFromParent()
          b.bubbles = ings.map((ing, i) => {
            const sp = new THREE.Sprite(foodBadge(ing))
            sp.scale.setScalar(0.27)
            sp.position.set(s.x + (i - (ings.length - 1) / 2) * 0.24, BUBBLE_Y, s.z - 0.1)
            sp.renderOrder = 25
            return sp
          })
          if (b.bubbles.length) this.group.add(...b.bubbles)
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
        // Ce qu'il contient prend la place de sa pastille (sinon, elles se chevaucheraient).
        const sprite = this.icons.get(s.id)
        if (sprite) sprite.visible = !b.bubbles.length || !!st?.burnt
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
    // Le plateau renversé : la flaque s'efface à mesure qu'on nettoie.
    this.spill.visible = state.event?.kind === 'spill'
    if (this.spill.visible) this.spill.scale.setScalar(1 - 0.7 * Math.min(1, (state.event?.progress ?? 0) / RULES.events.clean))
    this.updateCat(state, t)
  }

  /** Comète sur son plan pendant l'imprévu du chat ; la pastille du poste clignote. */
  private lastT = 0
  private updateCat(state: ServiceState, t: number) {
    const e = state.event?.kind === 'cat' ? state.event : null
    if (!this.cat) return
    this.cat.root.visible = !!e
    if (!e?.station) return
    const s = STATION_BY_ID[e.station]
    this.cat.root.position.set(s.x + 0.12, TOP + 0.01, s.z)
    this.cat.root.rotation.y = Math.sin(t * 1.3) * 0.4
    this.cat.mixer.update(this.lastT ? Math.min(0.1, t - this.lastT) : 0)
    this.lastT = t
  }

  /** Fin du service : on vide les mains de chacun, plus de pastille ni d'alerte. */
  release(avatarOf: AvatarOf) {
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
