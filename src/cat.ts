import * as THREE from 'three'
import type { Rig } from './assets'
import type { Deck } from './deck'
import { clearPath, resolveCircle } from './physics'
import { dampAngle } from './player'

type State = 'idle' | 'walk' | 'groom' | 'dance' | 'happy'

const RADIUS = 0.12
const WALK = 0.9
const RUN = 2.6
const SCALE = 0.26
const PLAYER_CLEARANCE = 0.38
/** Options d'un compagnon adopté (cf. pets.ts) ; Comète s'en passe. */
export interface PetOptions {
  name?: string
  scale?: number
  /** Zone où il se promène (ses quartiers) ; il ne vient au joueur que s'il s'y trouve. */
  area?: { minX: number; maxX: number; minZ: number; maxZ: number }
  /** Gamelles où il va manger de temps en temps. */
  bowls?: () => { x: number; z: number }[]
  /** Ne quitte jamais sa zone, même poussé par le joueur (Moustache, dans le labo du L.J.P.C.). */
  confine?: boolean
}

/** Temps sans vraie avance au bout duquel le chat renonce à son trajet (coincé contre une chaise…). */
const STUCK_AFTER = 0.4

/**
 * Comète, le chat du bord (Cube Pets de Kenney).
 * Flâne, suit parfois le joueur, fait sa toilette, pique des sprints,
 * danse quand on danse à côté de lui et adore les caresses.
 */
export class Cat {
  readonly root = new THREE.Group()
  readonly name: string
  private mixer: THREE.AnimationMixer
  private actions = new Map<string, THREE.AnimationAction>()
  private current?: THREE.AnimationAction
  private state: State = 'idle'
  private timer = 2
  private path: { x: number; z: number }[] = []
  private speed = WALK
  private yaw = 0
  private stride = 0
  private stuckTime = 0
  /** Garder le même côté pendant un contournement évite les hésitations gauche/droite. */
  private avoidSide = 1
  private meowIn = 15 + Math.random() * 20
  /** En route vers une gamelle : il y mangera en arrivant. */
  private hungry = false

  onStep?: () => void
  onMeow?: (purr: boolean) => void

  constructor(
    rig: Rig,
    readonly deck: Deck,
    x: number,
    z: number,
    private readonly options: PetOptions = {},
  ) {
    this.name = options.name ?? 'Comète'
    rig.root.scale.setScalar(options.scale ?? SCALE)
    this.root.add(rig.root)
    this.root.position.set(x, 0, z)
    this.mixer = new THREE.AnimationMixer(rig.root)
    for (const clip of rig.clips) this.actions.set(clip.name, this.mixer.clipAction(clip))
    this.play('idle')
    deck.group.add(this.root)
  }

  private play(name: string, fade = 0.2) {
    const next = this.actions.get(name)
    if (!next || next === this.current) return
    next.reset().fadeIn(fade).play()
    this.current?.fadeOut(fade)
    this.current = next
  }

  private goTo(x: number, z: number, speed: number): boolean {
    const from = { x: Math.round(this.root.position.x), z: Math.round(this.root.position.z) }
    const tiles = this.deck.pathfinder.find(from, { x, z })
    if (!tiles || tiles.length < 2) return false
    // Lissage simple : on saute les points visibles en ligne droite.
    const pts = tiles.slice(1)
    const out: { x: number; z: number }[] = []
    let cur = { x: this.root.position.x, z: this.root.position.z }
    let i = 0
    while (i < pts.length) {
      let j = pts.length - 1
      while (j > i && !clearPath(cur, pts[j], RADIUS * 1.1, this.deck.colliders)) j--
      out.push(pts[j])
      cur = pts[j]
      i = j + 1
    }
    this.path = out
    this.speed = speed
    this.state = 'walk'
    this.hungry = false
    this.stuckTime = 0
    return true
  }

  private randomTile(range: number): { x: number; z: number } | null {
    const p = this.root.position
    for (let tries = 0; tries < 20; tries++) {
      const x = Math.round(p.x + (Math.random() * 2 - 1) * range)
      const z = Math.round(p.z + (Math.random() * 2 - 1) * range)
      if (this.deck.pathfinder.walkable(x, z) && this.inArea(x, z)) return { x, z }
    }
    return null
  }

  private inArea(x: number, z: number): boolean {
    const a = this.options.area
    return !a || (x >= a.minX && x <= a.maxX && z >= a.minZ && z <= a.maxZ)
  }

  /** Posé ailleurs d'un coup (d'autres quartiers affichés) : il oublie son trajet et repart de là. */
  settle(x: number, z: number) {
    this.root.position.set(x, 0, z)
    this.path = []
    this.hungry = false
    this.state = 'idle'
    this.timer = 1 + Math.random() * 2
  }

  /** Caresse : le chat se tourne vers le joueur, ronronne et se réjouit. */
  pet(from: THREE.Vector3) {
    this.path = []
    this.state = 'happy'
    this.timer = 2.2
    this.yaw = Math.atan2(from.x - this.root.position.x, from.z - this.root.position.z)
    this.play('gesture-positive', 0.1)
    this.onMeow?.(true)
  }

  /**
   * @param player position du joueur s'il est sur le même pont que le chat, sinon null
   * @param dancing le joueur danse-t-il ?
   */
  update(dt: number, player: THREE.Vector3 | null, dancing: boolean) {
    this.mixer.update(dt)
    if (dt <= 0) return
    const p = this.root.position
    const distPlayer = player ? Math.hypot(player.x - p.x, player.z - p.z) : Infinity

    // Danse contagieuse.
    if (dancing && distPlayer < 3 && this.state !== 'dance' && this.state !== 'happy') {
      this.state = 'dance'
      this.path = []
      this.play('dance')
    } else if (this.state === 'dance' && (!dancing || distPlayer >= 3)) {
      this.state = 'idle'
      this.timer = 1
    }

    this.timer -= dt
    switch (this.state) {
      case 'idle':
        this.play('idle')
        if (this.timer <= 0) this.decide(player, distPlayer)
        break
      case 'groom':
        this.play('eat')
        if (this.timer <= 0) {
          this.state = 'idle'
          this.timer = 1 + Math.random() * 2
        }
        break
      case 'happy':
        if (this.timer <= 0) {
          this.state = 'idle'
          this.timer = 2 + Math.random() * 3
        }
        break
      case 'dance':
        if (player) this.yaw = Math.atan2(player.x - p.x, player.z - p.z)
        break
      case 'walk':
        this.walk(dt, player)
        break
    }

    // Ne pas marcher dans les pieds du joueur.
    if (player) this.keepAway(p, player)
    // Tenu dans sa zone : on ne le pousse pas dehors, pas même par la porte.
    const a = this.options.area
    if (this.options.confine && a) {
      p.x = THREE.MathUtils.clamp(p.x, a.minX - 0.5 + RADIUS, a.maxX + 0.5 - RADIUS)
      p.z = THREE.MathUtils.clamp(p.z, a.minZ - 0.5 + RADIUS, a.maxZ + 0.5 - RADIUS)
    }

    // Miaulement spontané quand le joueur est dans les parages.
    this.meowIn -= dt
    if (this.meowIn <= 0) {
      this.meowIn = 20 + Math.random() * 30
      if (distPlayer < 6) this.onMeow?.(false)
    }

    this.root.rotation.y = dampAngle(this.root.rotation.y, this.yaw, 8, dt)
  }

  private decide(player: THREE.Vector3 | null, distPlayer: number) {
    const r = Math.random()
    const bowl = this.options.bowls?.().sort(() => Math.random() - 0.5)[0]
    if (bowl && r < 0.12) {
      // Un petit creux : direction la gamelle, puis on mange.
      for (const [dx, dz] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
        const tx = Math.round(bowl.x + dx * 0.5), tz = Math.round(bowl.z + dz * 0.5)
        if (this.deck.pathfinder.walkable(tx, tz) && this.goTo(tx, tz, WALK)) {
          this.hungry = true
          return
        }
      }
    }
    if (player && distPlayer > 2 && distPlayer < 12 && r < 0.35 && this.inArea(player.x, player.z)) {
      // Vient se frotter au joueur.
      const tx = Math.round(player.x), tz = Math.round(player.z)
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (this.deck.pathfinder.walkable(tx + dx, tz + dz) && this.goTo(tx + dx, tz + dz, WALK * 1.3)) return
      }
    }
    if (r < 0.55) {
      const t = this.randomTile(5)
      if (t && this.goTo(t.x, t.z, WALK)) return
    } else if (r < 0.75) {
      this.state = 'groom'
      this.timer = 2 + Math.random() * 2
      return
    } else if (r < 0.87) {
      // Sprint soudain à l'autre bout de la pièce.
      const t = this.randomTile(9)
      if (t && this.goTo(t.x, t.z, RUN)) return
    }
    this.timer = 2 + Math.random() * 4
  }

  /** Séparation calculée à la position actuelle, y compris si le joueur vient sur le chat. */
  private keepAway(p: { x: number; z: number }, player: { x: number; z: number }) {
    const dx = p.x - player.x, dz = p.z - player.z
    const dist = Math.hypot(dx, dz)
    if (dist >= PLAYER_CLEARANCE) return
    // Superposition exacte : reculer dans le repère du chat, plutôt que diviser par zéro.
    const ux = dist > 1e-4 ? dx / dist : -Math.sin(this.yaw)
    const uz = dist > 1e-4 ? dz / dist : -Math.cos(this.yaw)
    p.x = player.x + ux * PLAYER_CLEARANCE
    p.z = player.z + uz * PLAYER_CLEARANCE
    resolveCircle(p, RADIUS, this.deck.colliders)
  }

  /** Le segment du prochain pas traverse-t-il les pieds du joueur ? */
  private playerBlocks(to: { x: number; z: number }, player: { x: number; z: number }, p: { x: number; z: number } = this.root.position): boolean {
    const dx = to.x - p.x, dz = to.z - p.z
    const lengthSq = dx * dx + dz * dz
    const t = lengthSq ? THREE.MathUtils.clamp(((player.x - p.x) * dx + (player.z - p.z) * dz) / lengthSq, 0, 1) : 0
    const distance = Math.hypot(p.x + dx * t - player.x, p.z + dz * t - player.z)
    return distance < PLAYER_CLEARANCE - 1e-6
  }

  private walk(dt: number, player: THREE.Vector3 | null) {
    const p = this.root.position
    let target = this.path[0]
    if (!target) {
      this.state = this.hungry ? 'groom' : 'idle'
      this.timer = this.hungry ? 3 + Math.random() * 2 : 1.5 + Math.random() * 4
      this.hungry = false
      return
    }
    if (player) {
      this.keepAway(p, player)
      // Le joueur occupe la destination : attendre un autre trajet, sans tourner autour de lui.
      if (Math.hypot(target.x - player.x, target.z - player.z) < PLAYER_CLEARANCE) {
        this.path = []
        this.state = 'idle'
        this.timer = 0.3 + Math.random() * 0.8
        this.play('idle')
        return
      }
    }
    let dx = target.x - p.x, dz = target.z - p.z
    let dist = Math.hypot(dx, dz)
    let step = Math.min(this.speed * dt, dist)
    // Même en atteignant un point, on ne se pose jamais dans un meuble.
    let q = dist <= step ? { x: target.x, z: target.z } : { x: p.x + (dx / dist) * step, z: p.z + (dz / dist) * step }
    if (player && this.playerBlocks(q, player)) {
      // Vérifier tout le détour avant de s'engager : un côté peut finir contre un meuble.
      const margin = PLAYER_CLEARANCE + RADIUS
      const ux = dx / dist, uz = dz / dist
      let detour: { x: number; z: number }[] | null = null
      for (const side of [this.avoidSide, -this.avoidSide]) {
        const near = { x: player.x - ux * margin + side * uz * margin, z: player.z - uz * margin - side * ux * margin }
        const far = { x: player.x + ux * margin + side * uz * margin, z: player.z + uz * margin - side * ux * margin }
        if ([ [p, near], [near, far], [far, target] ].every(([from, to]) =>
          !this.playerBlocks(to, player, from) && clearPath(from, to, RADIUS, this.deck.colliders),
        )) {
          detour = [near, far]
          this.avoidSide = side
          break
        }
      }
      if (!detour) {
        this.path = []
        this.state = 'idle'
        this.timer = 0.3 + Math.random() * 0.8
        this.play('idle')
        return
      }
      this.path.unshift(...detour)
      target = this.path[0]
      dx = target.x - p.x
      dz = target.z - p.z
      dist = Math.hypot(dx, dz)
      step = Math.min(this.speed * dt, dist)
      q = { x: p.x + dx / dist * step, z: p.z + dz / dist * step }
    }
    resolveCircle(q, RADIUS, this.deck.colliders)
    if (player) this.keepAway(q, player)
    const moved = Math.hypot(q.x - p.x, q.z - p.z)
    if (moved > 1e-6) this.yaw = Math.atan2(q.x - p.x, q.z - p.z)
    p.x = q.x
    p.z = q.z
    const reached = Math.hypot(target.x - p.x, target.z - p.z) < 0.01
    if (reached) this.path.shift()
    // Coincé (la collision le repousse à chaque pas) : il renonce, et repartira ailleurs.
    this.stuckTime = !reached && moved < step * 0.3 ? this.stuckTime + dt : 0
    if (this.stuckTime > STUCK_AFTER) {
      this.path = []
      this.stuckTime = 0
      this.state = 'idle'
      this.timer = 0.3 + Math.random() * 0.8
      return
    }
    this.play(this.speed > WALK * 1.5 ? 'run' : 'walk')
    this.stride += moved
    if (this.stride > 0.22) {
      this.stride = 0
      this.onStep?.()
    }
  }
}
