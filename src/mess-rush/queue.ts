import * as THREE from 'three'
import { refereeRig } from '../arena/referee'
import type { Rig } from '../assets'
import { Avatar } from '../avatar'
import { chefRig } from '../chef'
import { gardenerRig } from '../gardener'
import { iconSvg, type IconName } from '../icons'
import { lookRig, parseLook } from '../looks'
import { mechanicRig } from '../mechanic'
import { nurseRig } from '../nurse'
import { soldierRig } from '../patrol'
import { controllerRig } from '../salvage/controller'
import { technicianRig } from '../salvage/technician'
import { GUESTS, RECIPES } from '../../shared/mess-rush-catalog.js'
import { QUEUE, type ServiceState } from '../../shared/mess-rush.js'

/*
 * La file des clients de MESS RUSH, derrière le comptoir de service (cf. QUEUE dans
 * shared/mess-rush.js) : un client par bon. Il arrive par l'est, prend sa place dans la file et
 * attend, sa bulle au-dessus de la tête : la couleur de son plat (celle de son bon, cf. RECIPES)
 * et une assiette, et sa patience qui baisse avec le délai du bon. Un visiteur de marque (cf.
 * GUESTS) vient sous ses traits, ceux qu'il a à bord (le chef Marcel, Betty, Nico…), sa bulle à sa
 * couleur, cerclée d'or, avec son pictogramme. Servi, il saute de joie et s'en va content par l'ouest ; son bon expiré, il fait non de la
 * tête et s'en va fâché. Rien de tout cela ne passe par le relais : la file se lit dans les bons de
 * l'état du service, que toute l'équipe partage.
 */

/** Les tenues des clients : l'équipage du vaisseau, un peu de tout le monde. */
const LOOKS = [
  'human.male.a', 'human.female.b', 'suit.male.c.maverick', 'human.female.d', 'alien.male.b.blue',
  'human.male.e', 'suit.female.a.flight', 'human.female.f', 'alien.female.d.blue', 'human.male.c',
]
/** Les visiteurs de marque, sous leurs traits du bord (cf. chef.ts, nurse.ts…). */
const GUEST_RIGS: Record<string, () => Promise<Rig>> = {
  marcel: chefRig,
  betty: nurseRig,
  nico: mechanicRig,
  capucine: gardenerRig,
  rourke: async () => {
    const r = await soldierRig()
    // Au mess, le fusil reste au râtelier.
    r.rifle.visible = false
    return r
  },
  odile: controllerRig,
  gaspard: technicianRig,
  tessa: refereeRig,
  kael: () => lookRig(parseLook('suit.male.d.kael')),
}

/** Leurs places dans la file, d'ouest en est. */
const SLOTS = 7
/** Leur pas (m/s), et d'où ils viennent, où ils vont. */
const SPEED = 1.4
const ENTER_X = QUEUE.maxX + 0.5
const EXIT_X = QUEUE.minX - 0.5
/** Hauteur de la bulle au-dessus d'eux. */
const BUBBLE_Y = 1.15

/** La bulle d'un client : un disque de la couleur de son plat, cerclé de sombre (d'or, pour un visiteur de marque), et ce qu'il attend. */
const bubbles = new Map<string, THREE.SpriteMaterial>()
function bubbleMaterial(color: string, glyph: IconName, ring = '#0b0d12'): THREE.SpriteMaterial {
  const key = `${color}:${glyph}:${ring}`
  let m = bubbles.get(key)
  if (m) return m
  const S = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = S
  const g = canvas.getContext('2d')!
  g.beginPath()
  g.arc(S / 2, S / 2, 54, 0, Math.PI * 2)
  g.fillStyle = color
  g.fill()
  g.lineWidth = 10
  g.strokeStyle = ring
  g.stroke()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const img = new Image()
  img.onload = () => {
    g.drawImage(img, S * 0.26, S * 0.26, S * 0.48, S * 0.48)
    texture.needsUpdate = true
  }
  // Le pictogramme, sombre sur les couleurs claires, blanc sur les foncées.
  const c = new THREE.Color(color)
  const light = c.r * 0.3 + c.g * 0.59 + c.b * 0.11 > 0.6
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg(glyph).replace('currentColor', light ? '#0b0d12' : '#ffffff'))}`
  m = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, transparent: true })
  bubbles.set(key, m)
  return m
}

/** Un sprite de couleur unie (la barre de patience). */
const flat = (color: string) => new THREE.SpriteMaterial({ color, depthTest: false, depthWrite: false, transparent: true })

interface Customer {
  order: string
  avatar: Avatar | null
  root: THREE.Group
  bubble: THREE.Sprite
  mood: THREE.Sprite
  bar: THREE.Sprite
  fill: THREE.Sprite
  slot: number
  x: number
  z: number
  /** Servi (content), expiré (fâché), ou il attend encore. */
  leaving: 'happy' | 'angry' | null
  /** Le temps qu'il reste à sa place après avoir été servi (ou fâché), avant de partir. */
  linger: number
  look: number
}

export class MessQueue {
  readonly group = new THREE.Group()
  private readonly customers = new Map<string, Customer>()
  private readonly barBack = flat('#0b0d12')
  private readonly moodHappy: THREE.SpriteMaterial
  private readonly moodAngry: THREE.SpriteMaterial

  constructor(parent: THREE.Object3D) {
    parent.add(this.group)
    this.moodHappy = bubbleMaterial('#4cd88a', 'smiley')
    this.moodAngry = bubbleMaterial('#ff5a4a', 'smiley-angry')
  }

  /** À chaque image : les clients des bons en attente arrivent, ceux des bons finis s'en vont. */
  update(state: ServiceState, now: number, dt: number) {
    const pending = state.orders.filter((o) => o.status === 'pending')
    for (const o of pending) if (!this.customers.has(o.id)) this.arrive(o.id, o.recipe, o.guest)
    for (const c of this.customers.values()) {
      const o = state.orders.find((x) => x.id === c.order)
      if (!c.leaving && o && o.status !== 'pending') this.leave(c, o.status === 'served' ? 'happy' : 'angry')
      if (!c.leaving && !o) this.leave(c, 'angry')
      // Sa patience : la part du délai qui reste.
      if (o && !c.leaving) {
        const left = THREE.MathUtils.clamp((o.until - now) / (o.until - o.at), 0, 1)
        c.fill.scale.x = 0.5 * Math.max(0.02, left)
        c.fill.material.color.set(left > 0.5 ? '#4cd88a' : left > 0.25 ? '#ffb15c' : '#ff5a4a')
      }
      this.walk(c, dt)
    }
  }

  /** Un nouveau bon : un client arrive par l'est, vers la première place libre (un visiteur de marque, sous ses traits). */
  private arrive(order: string, recipe: string, guest?: string) {
    const taken = new Set([...this.customers.values()].filter((c) => !c.leaving).map((c) => c.slot))
    let slot = 0
    while (taken.has(slot) && slot < SLOTS - 1) slot++
    const root = new THREE.Group()
    root.position.set(ENTER_X, 0, QUEUE.z)
    const color = RECIPES[recipe].color
    const vip = guest ? GUESTS[guest] : null
    const bubble = new THREE.Sprite(vip ? bubbleMaterial(vip.color, vip.icon as IconName, '#ffd23f') : bubbleMaterial(color, 'fork-knife'))
    bubble.scale.setScalar(vip ? 0.5 : 0.42)
    bubble.position.y = BUBBLE_Y
    bubble.renderOrder = 25
    const mood = new THREE.Sprite(this.moodHappy)
    mood.scale.setScalar(0.42)
    mood.position.y = BUBBLE_Y
    mood.renderOrder = 26
    mood.visible = false
    const bar = new THREE.Sprite(this.barBack)
    bar.center.set(0, 0.5)
    bar.scale.set(0.54, 0.08, 1)
    bar.position.set(-0.27, BUBBLE_Y - 0.28, 0)
    bar.renderOrder = 25
    const fill = new THREE.Sprite(flat('#4cd88a'))
    fill.center.set(0, 0.5)
    fill.scale.set(0.5, 0.05, 1)
    fill.position.set(-0.25, BUBBLE_Y - 0.28, 0)
    fill.renderOrder = 26
    root.add(bubble, mood, bar, fill)
    this.group.add(root)
    const look = [...order].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % LOOKS.length
    const c: Customer = { order, avatar: null, root, bubble, mood, bar, fill, slot, x: ENTER_X, z: QUEUE.z, leaving: null, linger: 0, look }
    this.customers.set(order, c)
    // La tenue, une fois chargée (la bulle arrive tout de suite). Un modèle par client : deux clients
    // à la même tenue ne se partagent pas le même squelette (le fichier, lui, n'est chargé qu'une fois).
    const rig = guest && GUEST_RIGS[guest] ? GUEST_RIGS[guest]() : lookRig(parseLook(LOOKS[look]))
    void rig.then((r) => {
      if (this.customers.get(order) !== c) return
      c.avatar = new Avatar(r)
      root.add(c.avatar.root)
    }).catch(() => {})
  }

  /** Servi ou fâché : il le montre un instant à sa place, puis s'en va par l'ouest. */
  private leave(c: Customer, mood: 'happy' | 'angry') {
    c.leaving = mood
    c.linger = 1.2
    c.bubble.visible = c.bar.visible = c.fill.visible = false
    c.mood.material = mood === 'happy' ? this.moodHappy : this.moodAngry
    c.mood.visible = true
    c.avatar?.playEmote(mood === 'happy' ? 'joie' : 'non')
  }

  /** Il marche vers sa place, ou vers la sortie (en passant derrière la file). */
  private walk(c: Customer, dt: number) {
    const slotX = QUEUE.maxX - 0.2 - (c.slot + 0.5) * ((QUEUE.maxX - QUEUE.minX - 0.4) / SLOTS)
    let tx = slotX, tz = QUEUE.z
    if (c.leaving) {
      c.linger -= dt
      if (c.linger > 0) {
        tx = c.x
        tz = c.z
      } else {
        tx = EXIT_X
        tz = QUEUE.z - 0.38
      }
    }
    const dx = tx - c.x, dz = tz - c.z
    const d = Math.hypot(dx, dz)
    const step = Math.min(d, SPEED * (c.leaving === 'angry' ? 1.3 : 1) * dt)
    if (d > 1e-3) {
      c.x += (dx / d) * step
      c.z += (dz / d) * step
    }
    c.root.position.set(c.x, 0, c.z)
    const moving = d > 0.02
    if (c.avatar) {
      // Face au comptoir à sa place ; dans le sens de la marche, sinon.
      c.avatar.root.rotation.y = moving ? Math.atan2(dx, dz) : 0
      c.avatar.setLocomotion(moving ? 'walk' : 'idle', moving ? SPEED : 0)
      c.avatar.update(dt)
    }
    // Arrivé à la sortie : il disparaît.
    if (c.leaving && c.linger <= 0 && d < 0.05) {
      c.root.removeFromParent()
      c.fill.material.dispose()
      this.customers.delete(c.order)
    }
  }

  /** Fin du service : la file se vide d'un coup. */
  clear() {
    for (const c of this.customers.values()) {
      c.root.removeFromParent()
      c.fill.material.dispose()
    }
    this.customers.clear()
  }
}
