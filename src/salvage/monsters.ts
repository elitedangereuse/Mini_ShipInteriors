import * as THREE from 'three'
import { dampAngle } from '../player'
import type { SalvageSfx } from './sfx'
import { ThargoidBody } from './thargoid'

/*
 * Les ennemis de la baie, tels que le relais les fait vivre (cf. server/salvage.js) : des
 * Thargoïdes humanoïdes (cf. thargoid.ts), plus grands que les joueurs, aux lueurs vertes qui
 * battent dans le noir. Leur position est interpolée entre deux états du relais (dix par
 * seconde) ; leur allure suit leur humeur : ils errent, pressent le pas quand ils ont entendu
 * quelque chose, courent en poursuite, fouillent un casier, frappent. Loin de la vue du joueur,
 * ils sont dans le noir : on ne les dessine pas.
 */

export type MonsterMode = 'patrol' | 'investigate' | 'chase' | 'lured' | 'look' | 'search' | 'attack'

export interface MonsterState {
  id: number
  x: number
  z: number
  yaw: number
  mode: MonsterMode
}

/** Au-delà (tuiles), un Thargoïde est hors de la vue du joueur : on ne le dessine pas. */
const VISIBLE = 7
/** Distance entre deux pas, en marchant et en courant. */
const STRIDE = { walk: 0.5, sprint: 0.8 }

class Monster {
  readonly root = new THREE.Group()
  readonly body = new ThargoidBody()
  readonly target = new THREE.Vector3()
  yaw = 0
  mode: MonsterMode = 'patrol'
  private stride = 0
  private voice = 2 + Math.random() * 6

  constructor(readonly id: number, s: MonsterState, y: number) {
    this.target.set(s.x, y, s.z)
    this.root.position.copy(this.target)
    this.yaw = s.yaw
    this.root.rotation.y = s.yaw
    this.root.add(this.body.root)
  }

  apply(s: MonsterState, y: number) {
    this.target.set(s.x, y, s.z)
    this.yaw = s.yaw
    this.mode = s.mode
  }

  update(dt: number, sfx: SalvageSfx, hearing: THREE.Vector3 | null) {
    const p = this.root.position
    const bx = p.x, bz = p.z
    p.x = THREE.MathUtils.damp(p.x, this.target.x, 9, dt)
    p.z = THREE.MathUtils.damp(p.z, this.target.z, 9, dt)
    p.y = this.target.y
    if (Math.hypot(this.target.x - p.x, this.target.z - p.z) > 3) p.copy(this.target)
    const moved = Math.hypot(p.x - bx, p.z - bz)
    this.root.rotation.y = dampAngle(this.root.rotation.y, this.yaw, 10, dt)
    const speed = moved / Math.max(dt, 1e-3)
    const running = this.mode === 'chase' || speed > 2
    // Hors de portée de vue (plus quelques tuiles de marge), il est dans le noir : pas dessiné.
    const near = hearing ? Math.hypot(p.x - hearing.x, p.z - hearing.z) : Infinity
    this.root.visible = near < VISIBLE
    if (this.root.visible) this.body.update(dt, this.mode, speed)
    // Pas et voix : on n'entend que ceux qui sont à portée d'oreille.
    if (near > 14) return
    this.stride += moved
    const stride = running ? STRIDE.sprint : STRIDE.walk
    if (this.stride >= stride) {
      this.stride -= stride
      sfx.step(p.clone().setY(p.y + 0.2), running)
    }
    this.voice -= dt * (this.mode === 'chase' ? 2.2 : 1)
    if (this.voice <= 0) {
      this.voice = 4 + Math.random() * 7
      sfx.groan(p.clone().setY(p.y + 0.6), this.mode === 'chase')
    }
  }
}

export class MonsterView {
  readonly group = new THREE.Group()
  private monsters = new Map<number, Monster>()
  private last = new Map<number, MonsterMode>()

  constructor(private sfx: SalvageSfx, private y: number) {}

  /** État reçu du relais. */
  apply(states: MonsterState[]) {
    for (const s of states) {
      let m = this.monsters.get(s.id)
      if (!m) {
        m = new Monster(s.id, s, this.y)
        this.monsters.set(s.id, m)
        this.group.add(m.root)
      }
      m.apply(s, this.y)
      // Il vient de repérer quelqu'un : un cri.
      if (s.mode === 'chase' && this.last.get(s.id) !== 'chase') this.sfx.shriek(m.root.position.clone().setY(this.y + 0.6))
      this.last.set(s.id, s.mode)
    }
  }

  /** @param hearing où l'on écoute (le joueur, ou le coéquipier suivi par la caméra) */
  update(dt: number, hearing: THREE.Vector3 | null) {
    for (const m of this.monsters.values()) m.update(dt, this.sfx, hearing)
  }

  /** Distance du plus proche (en tuiles), pour le cœur qui bat. */
  nearest(p: { x: number; z: number }): number {
    let best = Infinity
    for (const m of this.monsters.values()) best = Math.min(best, Math.hypot(m.root.position.x - p.x, m.root.position.z - p.z))
    return best
  }

  position(id: number): THREE.Vector3 | null {
    return this.monsters.get(id)?.root.position ?? null
  }

  dispose() {
    this.group.removeFromParent()
    this.group.clear()
    this.monsters.clear()
    this.last.clear()
  }
}
