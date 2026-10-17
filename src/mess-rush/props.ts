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
import { FOOD_PACK, packModel } from '../assets'
import { keepShared } from '../dispose'
import { petRig, type Species } from '../pets'
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
 * au-dessus de chaque poste, et à côté, l'icône de chaque aliment qui y est posé ; et les imprévus :
 * le plateau renversé sur la passe, Moustache sur son
 * plan, les feux en surchauffe. Les modèles viennent du Food Kit de Kenney (cf. FOOD_PACK), chargé à
 * l'ouverture du salon ; Moustache se charge avec lui, pas au milieu du service.
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
  if (item.kind === 'extinguisher') return extinguisherObject()
  return ingredientObject(item.ing!, ingredientState(item))
}

/**
 * L'extincteur : un corps rouge, son col noir, la poignée et le tuyau. On en refait un chaque fois
 * qu'on le prend ou le pose (cf. signature) : ses formes et ses matières sont communes à tous.
 */
const EXT = {
  red: keepShared(new THREE.MeshLambertMaterial({ color: '#d4141e' })),
  black: keepShared(new THREE.MeshLambertMaterial({ color: '#1b1d22' })),
  steel: keepShared(new THREE.MeshLambertMaterial({ color: '#c6ccd4' })),
  label: keepShared(new THREE.MeshLambertMaterial({ color: '#f4efe2' })),
}
const EXT_SHAPE = {
  body: keepShared(new THREE.CylinderGeometry(0.06, 0.06, 0.26, 16)),
  dome: keepShared(new THREE.SphereGeometry(0.06, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
  label: keepShared(new THREE.CylinderGeometry(0.061, 0.061, 0.08, 16, 1, true)),
  neck: keepShared(new THREE.CylinderGeometry(0.02, 0.025, 0.05, 10)),
  handle: keepShared(new THREE.BoxGeometry(0.1, 0.012, 0.025)),
  hose: keepShared(new THREE.TorusGeometry(0.06, 0.008, 6, 12, Math.PI)),
}
function extinguisherObject(): THREE.Object3D {
  const g = new THREE.Group()
  const body = new THREE.Mesh(EXT_SHAPE.body, EXT.red)
  body.position.y = 0.13
  const dome = new THREE.Mesh(EXT_SHAPE.dome, EXT.red)
  dome.position.y = 0.26
  const label = new THREE.Mesh(EXT_SHAPE.label, EXT.label)
  label.position.y = 0.13
  const neck = new THREE.Mesh(EXT_SHAPE.neck, EXT.black)
  neck.position.y = 0.33
  const handle = new THREE.Mesh(EXT_SHAPE.handle, EXT.steel)
  handle.position.set(0.03, 0.36, 0)
  handle.rotation.z = -0.25
  const hose = new THREE.Mesh(EXT_SHAPE.hose, EXT.black)
  hose.position.set(-0.06, 0.28, 0)
  hose.rotation.z = Math.PI / 2
  g.add(body, dome, label, neck, handle, hose)
  return g
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
/** Le repère de ce qu'on a fait à un aliment, sur son icône : coupé, cuit, saisi, brûlé. */
const STATE_PIPS: Record<string, { svg: string; fill: string }> = {
  coupé: { svg: knifeSvg, fill: '#ffb020' },
  cuit: { svg: potSvg, fill: '#ff7a2f' },
  saisi: { svg: flameSvg, fill: '#ff4d3d' },
  brûlé: { svg: warningSvg, fill: '#14161c' },
}

/**
 * L'icône d'un aliment, dans son état : une pastille ronde cerclée de sa couleur, son image (noircie
 * une fois brûlé) et, en bas à droite, le repère de ce qu'on lui a fait (couteau, marmite, flamme).
 * Elle s'affiche à côté de la pastille d'un poste tant que l'aliment y est (cf. KitchenProps.sync).
 */
const foodTags = new Map<string, THREE.SpriteMaterial>()
function foodTag(ing: string, state: string): THREE.SpriteMaterial {
  const key = `${ing}:${state}`
  let m = foodTags.get(key)
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
  disc(60, 66, 52, 'rgba(0, 0, 0, 0.35)')
  disc(60, 58, 54, '#14161c')
  disc(60, 58, 46, INGREDIENTS[ing].color)
  disc(60, 58, 38, '#fdf6e3')
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
  const pip = STATE_PIPS[state]
  void Promise.all([load(foodImage(ing, state)), pip ? load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(pip.svg.replace(/currentColor/g, '#ffffff'))}`) : null]).then(([food, glyph]) => {
    if (state === 'brûlé') g.filter = 'brightness(0.3) saturate(0.4)'
    g.drawImage(food, 26, 24, 68, 68)
    g.filter = 'none'
    if (pip && glyph) {
      disc(100, 98, 24, '#14161c')
      disc(100, 98, 18, pip.fill)
      g.drawImage(glyph, 89, 87, 22, 22)
    }
    texture.needsUpdate = true
  }).catch(() => {})
  m = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false })
  foodTags.set(key, m)
  return m
}
/** Un compteur rond (les assiettes propres de la pile, la vaisselle sale au retour et à la plonge). */
const countTags = new Map<string, THREE.SpriteMaterial>()
function countTag(n: number, fill: string): THREE.SpriteMaterial {
  const key = `${n}:${fill}`
  let m = countTags.get(key)
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
  disc(60, 66, 50, 'rgba(0, 0, 0, 0.35)')
  disc(60, 58, 52, '#14161c')
  disc(60, 58, 43, fill)
  g.fillStyle = '#ffffff'
  g.strokeStyle = '#14161c'
  g.lineWidth = 8
  g.font = '900 56px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const text = `×${n}`
  g.strokeText(text, 60, 62)
  g.fillText(text, 60, 62)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  m = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false })
  countTags.set(key, m)
  return m
}
/** Les couleurs des compteurs : les assiettes propres, la vaisselle sale. */
const CLEAN = '#2fa865'
const DIRTY = '#8a6a4a'

/** Taille des icônes d'aliments (m), et leur écart. */
const TAG_SIZE = 0.32
const TAG_GAP = 0.03

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

/** Moustache, la chatte noire du labo du L.J.P.C. (la même espèce que dans main.ts). */
const MOUSTACHE: Species = { id: 'moustache', model: 'cat', label: '', name: 'Moustache', scale: 0.24, voice: 'meow', home: 'cushion', says: [] }

/** Qui tient quoi : le joueur local et ses coéquipiers (leur avatar, s'il est là). */
export type AvatarOf = (pid: string) => Avatar | null

/** Un ustensile sur son feu : l'alerte, la fumée, la lueur de la surchauffe, les flammes de l'imprévu du feu. */
interface Burner {
  warn: THREE.Sprite
  smoke: THREE.Mesh[]
  heat: THREE.Mesh
  flames: THREE.Group
}

/** Les flammes d'un ustensile en feu : des cônes orange et jaunes qui dansent, sur lui seul. */
const FLAME_GEOMETRY = new THREE.ConeGeometry(0.09, 0.42, 10).translate(0, 0.21, 0)
const FLAME_OUTER = new THREE.MeshBasicMaterial({ color: '#ff5a1c', transparent: true, opacity: 0.9, depthWrite: false })
const FLAME_INNER = new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.95, depthWrite: false })
function flamesObject(): THREE.Group {
  const g = new THREE.Group()
  for (let i = 0; i < 7; i++) {
    const inner = i === 6
    const f = new THREE.Mesh(FLAME_GEOMETRY, inner || i % 2 ? FLAME_INNER : FLAME_OUTER)
    const a = (i / 6) * Math.PI * 2
    if (!inner) f.position.set(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12)
    f.scale.setScalar(inner ? 1.5 : 1)
    f.userData.phase = i * 1.37
    f.userData.size = inner ? 1.5 : 1
    f.renderOrder = 4
    g.add(f)
  }
  g.visible = false
  return g
}

/** La mousse de l'extincteur : quelques bouffées blanches, de la main au feu. */
const SPRAY = 14
const SPRAY_GEOMETRY = new THREE.SphereGeometry(0.04, 8, 6)
const SPRAY_MATERIAL = new THREE.MeshBasicMaterial({ color: '#f4f8ff', transparent: true, opacity: 0.85, depthWrite: false })

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
  /** Les icônes des aliments posés sur chaque poste, et leur signature. */
  private readonly tags = new Map<string, { key: string; sprites: THREE.Sprite[] }>()
  /** La droite de l'écran, à plat : les icônes s'alignent à côté de la pastille du poste. */
  private readonly right = new THREE.Vector3()
  /** La flaque du plateau renversé, sur la passe. */
  private readonly spill = puddle('#7a3b17', 0.42)
  /** Moustache, la chatte du labo, pour l'imprévu du chat (chargée avec la cuisine) : debout, en marche. */
  private cat: { root: THREE.Object3D; mixer: THREE.AnimationMixer; idle: THREE.AnimationAction | null; walk: THREE.AnimationAction | null; walking: boolean } | null = null
  /** La mousse de l'extincteur. */
  private readonly spray: THREE.Mesh[] = []
  /** Les lumières de la cuisine (le saut en hyperespace les fait vaciller), et leur réglage d'origine. */
  private lights: { light: THREE.Light; intensity: number; color: THREE.Color }[] | null = null
  private shaking = false

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
        warn.position.set(s.x, ICON_Y + 0.3, s.z - 0.1)
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
        const flames = flamesObject()
        flames.position.set(s.x, TOP + 0.08, s.z - 0.02)
        this.group.add(warn, glowRing, flames)
        this.burners.set(s.id, { warn, smoke: puffs, heat: glowRing, flames })
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
    for (let i = 0; i < SPRAY; i++) {
      const p = new THREE.Mesh(SPRAY_GEOMETRY, SPRAY_MATERIAL)
      p.visible = false
      p.renderOrder = 5
      this.spray.push(p)
      this.group.add(p)
    }
    // Moustache se charge tout de suite, en même temps que la cuisine : pas d'à-coup au premier imprévu
    // du chat. La chatte noire du labo, celle qui vient mendier chez Marcel (cf. main.ts, MOUSTACHE).
    void petRig(MOUSTACHE, 'nuit').then((r) => {
      r.root.scale.setScalar(0.3)
      const mixer = new THREE.AnimationMixer(r.root)
      const idleClip = r.clips.find((c) => /idle/i.test(c.name)) ?? r.clips[0]
      const walkClip = r.clips.find((c) => /walk/i.test(c.name)) ?? r.clips.find((c) => /run/i.test(c.name))
      const idle = idleClip ? mixer.clipAction(idleClip) : null
      const walk = walkClip ? mixer.clipAction(walkClip) : null
      idle?.play()
      this.cat = { root: r.root, mixer, idle, walk, walking: false }
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
      g.userData.baseY = g.position.y
      this.group.add(g)
      this.onStation.set(s.id, { key, obj: g })
      // Les icônes de ce qui est sur le poste, à côté de sa pastille : elles partent avec l'aliment.
      // La pile d'assiettes, le retour et la plonge : leur compte.
      const foods: [string, string][] = []
      for (const it of items) {
        if (it?.kind === 'ingredient') foods.push([it.ing!, ingredientState(it)])
        else if (it?.kind === 'plate') foods.push(...(it.contents ?? []))
      }
      const counted = s.kind === 'plates' || s.kind === 'return' || s.kind === 'sink'
      const tkey = counted ? `#${count}` : foods.map((f) => f.join(':')).join(',')
      const shownTags = this.tags.get(s.id)
      if (shownTags?.key !== tkey) {
        for (const sp of shownTags?.sprites ?? []) sp.removeFromParent()
        const materials = counted ? (count > 0 ? [countTag(count, s.kind === 'plates' ? CLEAN : DIRTY)] : []) : foods.map(([ing, st]) => foodTag(ing, st))
        const sprites = materials.map((material) => {
          const sp = new THREE.Sprite(material)
          sp.scale.setScalar(TAG_SIZE)
          sp.renderOrder = 25
          return sp
        })
        if (sprites.length) this.group.add(...sprites)
        this.tags.set(s.id, { key: tkey, sprites })
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
        // Au feu : les flammes dansent sur cet ustensile seul, et baissent à mesure qu'on l'éteint.
        const fire = state.event?.kind === 'fire' && state.event.station === s.id ? state.event : null
        b.flames.visible = !!fire
        if (fire) {
          const left = 1 - 0.75 * Math.min(1, (fire.progress ?? 0) / RULES.events.fire.put)
          b.flames.scale.setScalar(left)
          for (const f of b.flames.children) {
            const ph = f.userData.phase as number, size = f.userData.size as number
            f.scale.set(size * (0.85 + 0.15 * Math.sin(t * 11 + ph)), size * (0.75 + 0.45 * Math.abs(Math.sin(t * 7 + ph))), size * (0.85 + 0.15 * Math.cos(t * 9 + ph)))
          }
        }
        b.smoke.forEach((p, i) => {
          p.visible = !!st?.burnt || !!fire
          if (!p.visible) return
          const k = (t * 0.5 + i / 3) % 1
          p.position.set(s.x + Math.sin(t + i * 2) * 0.05, TOP + 0.15 + k * 0.7, s.z - 0.05)
          p.scale.setScalar(0.6 + k * 1.6)
        })
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
    // Les icônes des aliments : à droite de la pastille du poste (à l'écran), ou centrées sur le
    // comptoir qui n'en a pas.
    this.right.set(1, 0, 0).applyQuaternion(camera.quaternion).setY(0).normalize()
    for (const [id, { sprites }] of this.tags) {
      if (!sprites.length) continue
      const s = STATION_BY_ID[id]
      const step = TAG_SIZE + TAG_GAP
      const first = this.icons.has(id) ? ICON_SIZE / 2 + TAG_GAP + TAG_SIZE / 2 : -((sprites.length - 1) * step) / 2
      sprites.forEach((sp, i) => {
        const d = first + i * step
        sp.position.set(s.x + this.right.x * d, ICON_Y, s.z + this.right.z * d)
      })
    }
    // L'extincteur en action : la mousse va de la main de qui l'éteint jusqu'au feu.
    const sprayers = Object.entries(state.work).filter(([, w]) => w.extinguish)
    this.spray.forEach((p, i) => {
      const w = sprayers[i % Math.max(1, sprayers.length)]
      const avatar = w ? avatarOf(w[0]) : null
      p.visible = !!w && !!avatar
      if (!w || !avatar) return
      const from = this.parent.worldToLocal(avatar.hands(this.tmp) ?? avatar.root.getWorldPosition(this.tmp).setY(avatar.root.getWorldPosition(this.tmp).y + 0.35))
      const s = STATION_BY_ID[w[1].station]
      const k = (t * 2.4 + i / SPRAY) % 1
      p.position.set(from.x + (s.x - from.x) * k + Math.sin(i * 7.1) * 0.05 * k, from.y + (TOP + 0.2 - from.y) * k + Math.sin(k * Math.PI) * 0.08, from.z + (s.z - from.z) * k + Math.cos(i * 5.3) * 0.05 * k)
      p.scale.setScalar(0.6 + k * 1.4)
    })
    this.hyperspace(state.event?.kind === 'hyperspace', t)
    // Le plateau renversé : la flaque s'efface à mesure qu'on nettoie.
    this.spill.visible = state.event?.kind === 'spill'
    if (this.spill.visible) this.spill.scale.setScalar(1 - 0.7 * Math.min(1, (state.event?.progress ?? 0) / RULES.events.clean))
    this.updateCat(state, now, t)
  }

  /**
   * Le saut en hyperespace : les lumières vacillent doucement en bleuissant (sans éclair), et ce qui
   * est posé sursaute de temps en temps. Tout revient comme avant à la sortie.
   */
  private hyperspace(on: boolean, t: number) {
    if (!on && !this.shaking) return
    this.shaking = on
    if (!this.lights) {
      this.lights = []
      this.parent.traverse((o) => {
        if (o instanceof THREE.PointLight || o instanceof THREE.SpotLight) this.lights!.push({ light: o, intensity: o.intensity, color: o.color.clone() })
      })
    }
    const blue = new THREE.Color('#9fc2ff')
    const k = on ? 0.78 + 0.12 * Math.sin(t * 2.3) + 0.06 * Math.sin(t * 7.3) : 1
    for (const l of this.lights) {
      l.light.intensity = l.intensity * k
      l.light.color.copy(l.color)
      if (on) l.light.color.lerp(blue, 0.35)
    }
    let i = 0
    for (const { obj } of this.onStation.values()) {
      const base = (obj.userData.baseY as number | undefined) ?? obj.position.y
      obj.position.y = base + (on ? Math.pow(Math.max(0, Math.sin(t * 5 + i * 1.7)), 14) * 0.07 : 0)
      i++
    }
  }

  /**
   * Moustache pendant son imprévu : d'abord sa promenade dans la cuisine (son chemin vient du relais,
   * à l'heure du relais), puis un bond sur la préparation qu'elle bloque, où elle se tient.
   */
  private lastT = 0
  private updateCat(state: ServiceState, now: number, t: number) {
    const e = state.event?.kind === 'cat' ? state.event : null
    if (!this.cat) return
    const cat = this.cat
    cat.root.visible = !!e
    if (!e) return
    const path = e.path?.length ? e.path : [{ x: 12, z: 10 }, { x: 12.2, z: 10 }]
    const walking = !e.station
    if (walking !== cat.walking && cat.walk && cat.idle) {
      ;(walking ? cat.walk : cat.idle).reset().fadeIn(0.2).play()
      ;(walking ? cat.idle : cat.walk).fadeOut(0.2)
    }
    cat.walking = walking
    if (walking) {
      const f = THREE.MathUtils.clamp((now - e.at) / Math.max(1, (e.perchAt ?? now) - e.at), 0, 1)
      const seg = f * (path.length - 1)
      const i = Math.min(path.length - 2, Math.floor(seg))
      const u = seg - i
      const a = path[i], b = path[i + 1]
      cat.root.position.set(a.x + (b.x - a.x) * u, 0, a.z + (b.z - a.z) * u)
      cat.root.rotation.y = Math.atan2(b.x - a.x, b.z - a.z)
    } else {
      // Le bond, du bout de sa promenade jusque sur le plan, puis elle s'y tient.
      const s = STATION_BY_ID[e.station!]
      const from = path[path.length - 1]
      const k = THREE.MathUtils.clamp((now - (e.perchAt ?? now)) / 500, 0, 1)
      cat.root.position.set(from.x + (s.x + 0.12 - from.x) * k, (TOP + 0.01) * k + Math.sin(k * Math.PI) * 0.35, from.z + (s.z - from.z) * k)
      cat.root.rotation.y = k < 1 ? Math.atan2(s.x - from.x, s.z - from.z) : Math.sin(t * 1.3) * 0.4
    }
    cat.mixer.update(this.lastT ? Math.min(0.1, t - this.lastT) : 0)
    this.lastT = t
  }

  /** Fin du service : on vide les mains de chacun, plus de pastille ni d'alerte. */
  release(avatarOf: AvatarOf) {
    for (const sprite of this.icons.values()) sprite.visible = false
    this.hyperspace(false, 0)
    for (const p of this.spray) p.visible = false
    for (const b of this.burners.values()) b.flames.visible = false
    for (const { sprites } of this.tags.values()) for (const sp of sprites) sp.removeFromParent()
    this.tags.clear()
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
