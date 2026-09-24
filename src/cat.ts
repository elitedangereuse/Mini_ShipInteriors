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
/** Temps sans vraie avance au bout duquel le chat renonce à son trajet (coincé contre une chaise…). */
const STUCK_AFTER = 0.4

/**
 * Comète, le chat du bord (Cube Pets de Kenney).
 * Flâne, suit parfois le joueur, fait sa toilette, pique des sprints,
 * danse quand on danse à côté de lui et adore les caresses.
 */
export class Cat {
  readonly root = new THREE.Group()
  readonly name = 'Comète'
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
  private meowIn = 15 + Math.random() * 20

  onStep?: () => void
  onMeow?: (purr: boolean) => void

  constructor(
    rig: Rig,
    readonly deck: Deck,
    x: number,
    z: number,
  ) {
    rig.root.scale.setScalar(SCALE)
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
    this.stuckTime = 0
    return true
  }

  private randomTile(range: number): { x: number; z: number } | null {
    const p = this.root.position
    for (let tries = 0; tries < 20; tries++) {
      const x = Math.round(p.x + (Math.random() * 2 - 1) * range)
      const z = Math.round(p.z + (Math.random() * 2 - 1) * range)
      if (this.deck.pathfinder.walkable(x, z)) return { x, z }
    }
    return null
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
        this.walk(dt)
        break
    }

    // Ne pas marcher dans les pieds du joueur.
    if (player && distPlayer < 0.38 && distPlayer > 1e-4) {
      const k = (0.38 - distPlayer) / distPlayer
      p.x -= (player.x - p.x) * k
      p.z -= (player.z - p.z) * k
      const q = { x: p.x, z: p.z }
      resolveCircle(q, RADIUS, this.deck.colliders)
      p.x = q.x
      p.z = q.z
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
    if (player && distPlayer > 2 && distPlayer < 12 && r < 0.35) {
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

  private walk(dt: number) {
    const p = this.root.position
    const target = this.path[0]
    if (!target) {
      this.state = 'idle'
      this.timer = 1.5 + Math.random() * 4
      return
    }
    const dx = target.x - p.x, dz = target.z - p.z
    const dist = Math.hypot(dx, dz)
    const step = this.speed * dt
    const reached = dist <= step
    if (reached) this.path.shift()
    // Même en atteignant un point, on ne se pose jamais dans un meuble.
    const q = reached ? { x: target.x, z: target.z } : { x: p.x + (dx / dist) * step, z: p.z + (dz / dist) * step }
    resolveCircle(q, RADIUS, this.deck.colliders)
    const moved = Math.hypot(q.x - p.x, q.z - p.z)
    p.x = q.x
    p.z = q.z
    if (!reached) this.yaw = Math.atan2(dx, dz)
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
    this.stride += step
    if (this.stride > 0.22) {
      this.stride = 0
      this.onStep?.()
    }
  }
}
