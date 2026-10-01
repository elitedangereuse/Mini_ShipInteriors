import * as THREE from 'three'
import type { Deck, Interactable } from '../deck'
import { cargoCanister, flareStick, lockerParts } from '../furniture'
import { tr } from '../i18n'
import { groundHeight, lockerFront, lockerSpot, type Zone } from '../../shared/salvage.js'
import { DIRS } from '../map'
import type { SalvageState } from '../net'
import { FACING } from './zone-deck'

/*
 * Ce qui change dans la baie pendant la partie : les casiers (occupés, fouillés), les colis (au
 * sol, portés, livrés), les fusées à ramasser et celle qui brûle. Chacun a son invite (E) ; les
 * actions partent au relais, qui tranche (cf. server/salvage.js), et l'état qu'il renvoie remet
 * tout à jour.
 */

export interface ItemActions {
  pickup(kind: 'cargo' | 'flare', id: number): void
  hide(locker: number): void
}

interface Locker {
  id: number
  body: THREE.Group
  door: THREE.Group
  item: Interactable
  occupied: boolean
  searched: boolean
  open: number
  shake: number
}

interface Cargo {
  id: number
  object: THREE.Group
  item: Interactable
  state: 'ground' | 'carried' | 'delivered'
}

const LOCKER_LABEL = tr('Se cacher', 'Hide')

export class ZoneItems {
  readonly group = new THREE.Group()
  private lockers = new Map<number, Locker>()
  private cargo = new Map<number, Cargo>()
  private flares = new Map<number, { object: THREE.Group; item: Interactable; available: boolean }>()
  private burning: { object: THREE.Group; glow: THREE.Mesh; at: THREE.Vector3; until: number; from: THREE.Vector3; t: number } | null = null
  /** Colis livrés, empilés sur la plateforme d'extraction. */
  private delivered: THREE.Group[] = []
  private time = 0

  constructor(private zone: Zone, private deck: Deck, actions: ItemActions) {
    this.deck.group.add(this.group)
    for (const l of zone.lockers) {
      const { body, door } = lockerParts(l.id + 1, l.id % 3 === 1)
      body.add(door)
      const spot = lockerSpot(l)
      body.position.set(spot.x + DIRS[l.dir].dx * 0.01, 0, spot.z + DIRS[l.dir].dz * 0.01)
      body.rotation.y = (FACING[l.dir] * Math.PI) / 2
      this.group.add(body)
      const front = lockerFront(l)
      const item: Interactable = { object: body, position: new THREE.Vector3(front.x, 0, front.z), label: LOCKER_LABEL, onInteract: () => actions.hide(l.id) }
      deck.interactables.push(item)
      this.lockers.set(l.id, { id: l.id, body, door, item, occupied: false, searched: false, open: 0, shake: 0 })
      // La caisse du casier arrête le passage ; sa porte, non (on s'y glisse).
      const a = { x: spot.x - DIRS[l.dir].dx * 0.08, z: spot.z - DIRS[l.dir].dz * 0.08 }
      const b = { x: spot.x + DIRS[l.dir].dx * 0.14, z: spot.z + DIRS[l.dir].dz * 0.14 }
      const half = 0.2
      deck.colliders.push(DIRS[l.dir].dx
        ? { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: spot.z - half, maxZ: spot.z + half }
        : { minX: spot.x - half, maxX: spot.x + half, minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) })
    }
    deck.pathfinder.invalidate()
    for (const c of zone.cargo) {
      const object = new THREE.Group()
      object.add(cargoCanister())
      // Lueur caustique au sol : on la devine quand on arrive à portée de vue.
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.26, 24), new THREE.MeshBasicMaterial({ color: '#6dff9a', transparent: true, opacity: 0.5, depthWrite: false }))
      halo.rotation.x = -Math.PI / 2
      halo.position.y = 0.01
      object.add(halo)
      object.position.set(c.x, groundHeight(zone, c), c.z)
      this.group.add(object)
      const item: Interactable = { object, position: object.position, label: tr('Ramasser le colis', 'Pick up the crate'), onInteract: () => actions.pickup('cargo', c.id) }
      deck.interactables.push(item)
      this.cargo.set(c.id, { id: c.id, object, item, state: 'ground' })
    }
    for (const f of zone.flares) {
      const object = new THREE.Group()
      const stick = flareStick()
      stick.position.y = 0.022
      stick.rotation.y = (f.id * 1.7) % Math.PI
      object.add(stick)
      object.position.set(f.x + ((f.id % 3) - 1) * 0.12, groundHeight(zone, f), f.z + ((f.id % 2) - 0.5) * 0.14)
      this.group.add(object)
      const item: Interactable = { object, position: object.position, label: tr('Prendre la fusée', 'Take the flare'), onInteract: () => actions.pickup('flare', f.id) }
      deck.interactables.push(item)
      this.flares.set(f.id, { object, item, available: true })
    }
  }

  private setInteractable(item: Interactable, on: boolean) {
    const i = this.deck.interactables.indexOf(item)
    if (on && i < 0) this.deck.interactables.push(item)
    else if (!on && i >= 0) this.deck.interactables.splice(i, 1)
  }

  /** L'état de la partie : ce qui reste à ramasser, où sont les colis, quels casiers sont pris. */
  sync(state: SalvageState, hidingSelf: number | null) {
    for (const c of state.cargo) {
      const cargo = this.cargo.get(c.id)
      if (!cargo) continue
      if (c.state === 'delivered' && cargo.state !== 'delivered') this.stackDelivered()
      cargo.state = c.state
      cargo.object.visible = c.state === 'ground'
      cargo.object.position.set(c.x, groundHeight(this.zone, c), c.z)
      this.setInteractable(cargo.item, c.state === 'ground')
    }
    const available = new Set(state.flares)
    for (const [id, f] of this.flares) {
      f.available = available.has(id)
      f.object.visible = f.available
      this.setInteractable(f.item, f.available)
    }
    const occupied = new Set(state.lockers)
    const searching = new Set(state.searching)
    for (const [id, l] of this.lockers) {
      l.occupied = occupied.has(id)
      l.searched = searching.has(id)
      // Un casier pris ne se propose plus (sauf à celui qui s'y cache, qui en sort avec E).
      l.item.label = hidingSelf === id ? tr('Sortir du casier', 'Leave the locker') : LOCKER_LABEL
      this.setInteractable(l.item, !l.occupied || hidingSelf === id)
    }
  }

  /** Porte d'un casier qu'on ouvre (on y entre, on en sort, un ennemi le fouille). */
  bang(locker: number, open = 1) {
    const l = this.lockers.get(locker)
    if (l) l.open = Math.max(l.open, open)
  }

  shake(locker: number) {
    const l = this.lockers.get(locker)
    if (l) l.shake = 1.2
  }

  lockerPosition(locker: number): THREE.Vector3 | null {
    const l = this.lockers.get(locker)
    return l ? l.body.position.clone().setY(this.deck.y + 0.5) : null
  }

  /** Fusée lancée de `from` à `to` : elle vole, tombe, et brûle `burn` secondes. */
  throwFlare(from: THREE.Vector3, to: { x: number; z: number }, burn: number) {
    this.stopFlare()
    const object = new THREE.Group()
    object.add(flareStick(true))
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshBasicMaterial({ color: '#ff3b2f', transparent: true, opacity: 0.6, depthWrite: false }))
    object.add(glow)
    this.group.add(object)
    this.burning = { object, glow, at: new THREE.Vector3(to.x, groundHeight(this.zone, to) + 0.03, to.z), from: new THREE.Vector3(from.x, groundHeight(this.zone, from) + 0.7, from.z), until: this.time + burn, t: 0 }
    object.position.copy(this.burning.from)
  }

  stopFlare() {
    if (!this.burning) return
    this.burning.object.removeFromParent()
    this.burning = null
  }

  /** Où brûle la fusée (coordonnées du pont), et combien elle éclaire (0 à 1). */
  get flare(): { x: number; z: number; k: number } | null {
    const b = this.burning
    if (!b || b.t < 0.5) return null
    const left = b.until - this.time
    return { x: b.at.x, z: b.at.z, k: Math.min(1, left / 1.5) * (0.8 + 0.2 * Math.sin(this.time * 23) * Math.sin(this.time * 7)) }
  }

  /** Les colis livrés s'empilent sur la plateforme d'extraction, puis montent vers le vaisseau. */
  private stackDelivered() {
    const pad = this.zone.airlock.pad
    const c = cargoCanister(0.9)
    const n = this.delivered.length
    c.position.set(pad.x + ((n % 3) - 1) * 0.26, 0.05, pad.z + (Math.floor(n / 3) - 0.5) * 0.26)
    this.group.add(c)
    this.delivered.push(c)
  }

  update(dt: number) {
    this.time += dt
    for (const l of this.lockers.values()) {
      l.open = Math.max(0, l.open - dt * 1.6)
      const swing = l.searched ? 0.5 + Math.sin(this.time * 18) * 0.3 : Math.min(1, l.open * 1.4) * 1.3
      l.door.rotation.y = -swing
      l.shake = Math.max(0, l.shake - dt)
      const k = l.shake > 0 || l.searched ? 0.012 : 0
      l.body.position.y = k * Math.sin(this.time * 60)
    }
    for (const c of this.cargo.values()) {
      if (c.state !== 'ground') continue
      c.object.children[0].rotation.y += dt * 0.4
      const halo = c.object.children[1] as THREE.Mesh
      ;(halo.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.2 * Math.sin(this.time * 2.4 + c.id)
    }
    // Les colis livrés montent lentement dans le faisceau, et disparaissent vers le vaisseau.
    for (const d of this.delivered) {
      d.position.y = Math.min(1.4, d.position.y + dt * 0.12)
      d.visible = d.position.y < 1.35
    }
    const b = this.burning
    if (b) {
      b.t += dt
      const k = Math.min(1, b.t / 0.5)
      b.object.position.lerpVectors(b.from, b.at, k)
      b.object.position.y = THREE.MathUtils.lerp(b.from.y, b.at.y, k) + Math.sin(k * Math.PI) * 0.8
      b.object.rotation.z += dt * (k < 1 ? 12 : 0)
      b.glow.scale.setScalar(0.8 + Math.random() * 0.5)
      if (this.time > b.until) this.stopFlare()
    }
  }

  dispose() {
    this.group.removeFromParent()
  }
}
