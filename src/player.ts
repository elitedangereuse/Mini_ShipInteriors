import * as THREE from 'three'
import { Avatar } from './avatar'
import type { Box2 } from './deck'
import { clearPath, funnelDoorway, resolveCircle, type Doorway } from './physics'

const RADIUS = 0.18
const WALK_SPEED = 1.7
const SPRINT_SPEED = 3.4
/** Distance parcourue entre deux bruits de pas (calée sur les cycles de marche/course). */
const STRIDE_WALK = 0.57
const STRIDE_SPRINT = 0.85

/** Montée douce de 0 à 1. */
const smooth = (u: number) => u * u * (3 - 2 * u)

/**
 * Trajet scripté, sans collisions : s'installer sur un meuble (le personnage recule sur
 * l'assise, monte sur le lit), ou s'en relever. `walk` : on marche pendant le trajet.
 */
interface Glide {
  from: { x: number; y: number; z: number; yaw: number }
  to: { x: number; y: number; z: number; yaw: number }
  t: number
  duration: number
  walk: boolean
  done?: () => void
}

/** Joueur local : clavier, suivi de chemin et collisions, par-dessus un Avatar. */
export class Player {
  readonly root = new THREE.Group()
  /** Effet temporaire d'un cocktail ; 1 hors effet. */
  speedMultiplier = 1
  readonly position: THREE.Vector3
  private path: { x: number; z: number }[] = []
  private stuckTime = 0
  private busyTime = 0
  private stride = 0
  private yaw = 0
  private glide: Glide | null = null
  /** Appelé quand le personnage atteint la fin d'un chemin. */
  onArrive?: () => void
  /** Appelé à chaque pas. */
  onStep?: (sprint: boolean) => void
  /** Portes où l'on passe, sur le pont du joueur (guidage dans l'embrasure au clavier). */
  doorways: () => Doorway[] = () => []

  constructor(
    public avatar: Avatar,
    public colliders: Box2[],
  ) {
    this.position = this.root.position
    this.root.add(avatar.root)
  }

  /** Change d'apparence (autre personnage du pack). */
  setAvatar(avatar: Avatar) {
    this.root.remove(this.avatar.root)
    this.avatar = avatar
    this.root.add(avatar.root)
  }

  get moving(): boolean {
    return this.path.length > 0
  }

  setPath(points: { x: number; z: number }[]) {
    this.path = this.smooth(points)
    this.stuckTime = 0
    this.busyTime = 0
  }

  cancelPath() {
    this.path = []
    this.onArrive = undefined
  }

  /** Trajet scripté en cours (installation sur un meuble, relevé) ? */
  get gliding(): boolean {
    return this.glide !== null
  }

  /** Où finit le trajet scripté en cours, s'il y en a un. */
  get glideEnd(): Readonly<Glide['to']> | null {
    return this.glide?.to ?? null
  }

  /**
   * Va en ligne droite à (x, y, z), tourné vers `yaw`, en `duration` secondes, sans tenir compte
   * des collisions (on s'assoit dans le volume du fauteuil) ; `walk` : en marchant.
   */
  glideTo(to: { x: number; y: number; z: number; yaw: number }, duration: number, walk: boolean, done?: () => void) {
    this.cancelPath()
    this.busyTime = 0
    const p = this.position
    this.glide = { from: { x: p.x, y: p.y, z: p.z, yaw: this.root.rotation.y }, to, t: 0, duration: Math.max(0.05, duration), walk, done }
  }

  /** Interrompt un trajet scripté, sur place (téléportation, changement de pont). */
  stopGlide() {
    this.glide = null
  }

  /** Supprime les points intermédiaires quand une ligne droite est possible. */
  private smooth(points: { x: number; z: number }[]): { x: number; z: number }[] {
    if (points.length < 3) return points
    const out = []
    let from = { x: this.position.x, z: this.position.z }
    let i = 0
    while (i < points.length) {
      let j = points.length - 1
      while (j > i && !clearPath(from, points[j], RADIUS * 1.05, this.colliders)) j--
      out.push(points[j])
      from = points[j]
      i = j + 1
    }
    return out
  }

  setHeading(yaw: number) {
    this.yaw = yaw
  }

  lookAt(target: THREE.Vector3) {
    this.yaw = Math.atan2(target.x - this.position.x, target.z - this.position.z)
  }

  interact() {
    this.path = []
    this.busyTime = 0.7
    this.avatar.playEmote('interact')
  }

  /** @param input direction voulue au clavier ou au stick (plan XZ, longueur 0 à 1) */
  update(dt: number, input: THREE.Vector3, sprint: boolean) {
    if (this.glide) {
      const g = this.glide
      g.t = Math.min(g.duration, g.t + dt)
      const k = smooth(g.t / g.duration)
      const bx = this.position.x, bz = this.position.z
      this.position.set(g.from.x + (g.to.x - g.from.x) * k, g.from.y + (g.to.y - g.from.y) * k, g.from.z + (g.to.z - g.from.z) * k)
      let d = (g.to.yaw - g.from.yaw) % (Math.PI * 2)
      if (d > Math.PI) d -= Math.PI * 2
      if (d < -Math.PI) d += Math.PI * 2
      this.yaw = g.from.yaw + d * k
      this.root.rotation.y = this.yaw
      const speed = Math.hypot(this.position.x - bx, this.position.z - bz) / Math.max(dt, 1e-3)
      this.avatar.setLocomotion(g.walk && g.t < g.duration ? 'walk' : 'idle', speed)
      if (g.walk) {
        this.stride += speed * dt
        if (this.stride >= STRIDE_WALK) {
          this.stride -= STRIDE_WALK
          this.onStep?.(false)
        }
      }
      if (g.t >= g.duration) {
        this.glide = null
        g.done?.()
      }
      this.avatar.update(dt)
      return
    }
    const hasInput = input.lengthSq() > 0
    if (this.busyTime > 0 && !hasInput) {
      this.busyTime -= dt
      this.turn(dt)
      this.avatar.update(dt)
      return
    }
    this.busyTime = 0

    const dir = new THREE.Vector3()
    if (hasInput) {
      this.cancelPath()
      dir.copy(input)
    } else if (this.path.length) {
      const target = this.path[0]
      dir.set(target.x - this.position.x, 0, target.z - this.position.z)
      const dist = dir.length()
      const speed = sprint ? SPRINT_SPEED * this.speedMultiplier : WALK_SPEED
      if (dist < Math.max(0.06, speed * dt)) {
        this.path.shift()
        if (!this.path.length) {
          this.position.x = target.x
          this.position.z = target.z
          dir.set(0, 0, 0)
          const cb = this.onArrive
          this.onArrive = undefined
          cb?.()
        }
      }
      if (dir.lengthSq() > 0) dir.normalize()
    }

    if (dir.lengthSq() > 0) {
      const speed = sprint ? SPRINT_SPEED * this.speedMultiplier : WALK_SPEED
      const bx = this.position.x, bz = this.position.z
      const next = { x: bx + dir.x * speed * dt, z: bz + dir.z * speed * dt }
      // Au clavier, on vise mal une ouverture étroite (et en diagonale, en vue isométrique) : de quoi
      // compenser la dérive latérale d'une direction à 45°.
      if (hasInput) funnelDoorway(this.position, next, dir, RADIUS, this.doorways(), speed * dt * 1.5)
      resolveCircle(next, RADIUS, this.colliders)
      this.position.x = next.x
      this.position.z = next.z
      this.yaw = Math.atan2(dir.x, dir.z)

      const moved = Math.hypot(next.x - bx, next.z - bz)
      const realSpeed = moved / dt
      // Bloqué contre un obstacle en suivant un chemin : on abandonne.
      this.stuckTime = realSpeed < speed * 0.2 && this.path.length ? this.stuckTime + dt : 0
      if (this.stuckTime > 0.6) this.cancelPath()

      this.stride += moved
      const strideLen = sprint ? STRIDE_SPRINT : STRIDE_WALK
      if (this.stride >= strideLen) {
        this.stride -= strideLen
        this.onStep?.(sprint)
      }
      this.avatar.setLocomotion(realSpeed < 0.05 ? 'idle' : sprint ? 'sprint' : 'walk', realSpeed)
    } else {
      this.stride = STRIDE_WALK * 0.5
      this.avatar.setLocomotion('idle')
    }
    this.turn(dt)
    this.avatar.update(dt)
  }

  get heading(): number {
    return this.yaw
  }

  private turn(dt: number) {
    this.root.rotation.y = dampAngle(this.root.rotation.y, this.yaw, 14, dt)
  }
}

export function dampAngle(a: number, b: number, lambda: number, dt: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * (1 - Math.exp(-lambda * dt))
}
