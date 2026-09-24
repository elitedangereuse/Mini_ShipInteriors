import * as THREE from 'three'
import { Avatar, type Locomotion } from './avatar'
import { lookRig, parseLook } from './looks'
import type { PlayerState } from './net'
import { dampAngle } from './player'

/** Autre membre d'équipage connecté : position interpolée, animations et emotes rejouées. */
export class RemotePlayer {
  readonly group = new THREE.Group()
  avatar?: Avatar
  name: string
  skin: string
  level: number
  private target = new THREE.Vector3()
  private yaw = 0
  private anim: Locomotion = 'idle'
  private stride = 0
  private pendingEmote: string | null = null
  onStep?: (position: THREE.Vector3, sprint: boolean) => void

  constructor(
    readonly id: number,
    s: PlayerState,
    private levelY: (level: number) => number,
  ) {
    this.name = s.name
    this.skin = s.skin
    this.level = s.level
    this.apply(s)
    this.group.position.copy(this.target)
    void this.load()
  }

  /** (Re)charge le modèle du personnage (changement d'apparence ; `skin` = identifiant d'apparence, cf. looks.ts). */
  async load() {
    const skin = this.skin
    const r = await lookRig(parseLook(skin))
    if (skin !== this.skin) return // changé entre-temps
    if (this.avatar) this.group.remove(this.avatar.root)
    this.avatar = new Avatar(r)
    this.group.add(this.avatar.root)
    if (this.pendingEmote) this.avatar.playEmote(this.pendingEmote)
    this.pendingEmote = null
  }

  apply(s: Pick<PlayerState, 'x' | 'z' | 'yaw' | 'level' | 'anim'>) {
    const changedLevel = s.level !== this.level
    this.level = s.level
    this.target.set(s.x, this.levelY(s.level), s.z)
    this.yaw = s.yaw
    this.anim = (['idle', 'walk', 'sprint'].includes(s.anim) ? s.anim : 'idle') as Locomotion
    if (changedLevel) this.group.position.copy(this.target) // ascenseur : pas d'interpolation
  }

  emote(id: string) {
    if (this.avatar) this.avatar.playEmote(id)
    else this.pendingEmote = id
  }

  update(dt: number) {
    const p = this.group.position
    const bx = p.x, bz = p.z
    p.x = THREE.MathUtils.damp(p.x, this.target.x, 10, dt)
    p.z = THREE.MathUtils.damp(p.z, this.target.z, 10, dt)
    p.y = this.target.y
    if (p.distanceTo(this.target) > 4) p.copy(this.target) // trop loin : téléportation
    const moved = Math.hypot(p.x - bx, p.z - bz)
    this.group.rotation.y = dampAngle(this.group.rotation.y, this.yaw, 12, dt)

    const stride = this.anim === 'sprint' ? 0.85 : 0.57
    if (this.anim !== 'idle') {
      this.stride += moved
      if (this.stride >= stride) {
        this.stride -= stride
        this.onStep?.(p, this.anim === 'sprint')
      }
    }
    if (this.avatar) {
      this.avatar.setLocomotion(this.anim, moved / Math.max(dt, 1e-3))
      this.avatar.update(dt)
    }
  }
}
