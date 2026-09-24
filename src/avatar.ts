import * as THREE from 'three'
import type { Rig } from './assets'
import type { IconName } from './icons'

export type Locomotion = 'idle' | 'walk' | 'sprint'

export interface EmoteDef {
  id: string
  icon: IconName | ''
  label: string
  /** Animations jouées à la suite (en boucle pour mode 'loop'). */
  anims: string[]
  /** once : joue `repeat` fois puis revient au repos · loop : jusqu'au prochain mouvement · hold : garde la pose finale. */
  mode: 'once' | 'loop' | 'hold'
  repeat?: number
}

export const EMOTES: EmoteDef[] = [
  { id: 'salut', icon: 'hand-waving', label: 'Salut', anims: ['interact-left'], mode: 'once', repeat: 2 },
  { id: 'oui', icon: 'thumbs-up', label: 'Oui', anims: ['emote-yes'], mode: 'once', repeat: 2 },
  { id: 'non', icon: 'thumbs-down', label: 'Non', anims: ['emote-no'], mode: 'once', repeat: 2 },
  { id: 'joie', icon: 'confetti', label: 'Joie', anims: ['jump'], mode: 'once', repeat: 3 },
  { id: 'danse', icon: 'disco-ball', label: 'Danse', anims: ['attack-kick-left', 'attack-kick-right'], mode: 'loop' },
  { id: 'assis', icon: 'armchair', label: 'Assis', anims: ['sit'], mode: 'hold' },
  { id: 'dodo', icon: 'moon-stars', label: 'Dodo', anims: ['die'], mode: 'hold' },
]

/** Emote interne (non proposée dans la barre) : utiliser une console. */
const INTERACT: EmoteDef = { id: 'interact', icon: '', label: '', anims: ['interact-right'], mode: 'once' }

/** Animations de repli quand un pack ne fournit pas un clip (les Blocky Characters n'ont pas « jump »). */
const FALLBACK: Record<string, string> = { jump: 'emote-yes', crouch: 'sit' }

const WALK_NOMINAL = 1.7
const SPRINT_NOMINAL = 3.4

/**
 * Personnage animé (Mini Characters de Kenney) : locomotion + emotes.
 * Sert au joueur local comme aux autres joueurs connectés.
 */
export class Avatar {
  /** À déplacer / orienter. */
  readonly root = new THREE.Group()
  /** Modèle, décalé localement pour certaines poses (assis, sauts). */
  private model: THREE.Object3D
  private mixer: THREE.AnimationMixer
  private actions = new Map<string, THREE.AnimationAction>()
  private current?: THREE.AnimationAction
  private base: Locomotion = 'idle'
  private speed = 0
  private emote: EmoteDef | null = null
  private step = 0
  private stepTime = 0
  private emoteTime = 0
  private height: number

  constructor(rig: Rig & { height?: number }) {
    this.height = rig.height ?? 0.67
    this.model = rig.root
    this.root.add(this.model)
    this.mixer = new THREE.AnimationMixer(this.model)
    for (const clip of rig.clips) {
      const a = this.mixer.clipAction(clip)
      if (!['idle', 'walk', 'sprint'].includes(clip.name)) {
        a.setLoop(THREE.LoopOnce, 1)
        a.clampWhenFinished = true
      }
      this.actions.set(clip.name, a)
    }
    this.fadeTo('idle', 0)
  }

  get locomotion(): Locomotion {
    return this.base
  }

  get emoteId(): string | null {
    return this.emote && this.emote !== INTERACT ? this.emote.id : null
  }

  /** @param speed vitesse réelle (pour caler la cadence des pas sur le déplacement) */
  setLocomotion(base: Locomotion, speed = 0) {
    this.speed = speed
    if (base !== 'idle' && this.emote) this.emote = null
    this.base = base
  }

  playEmote(id: string): EmoteDef | null {
    const def = id === 'interact' ? INTERACT : EMOTES.find((e) => e.id === id)
    if (!def) return null
    this.emote = def
    this.step = 0
    this.emoteTime = 0
    this.startStep(true)
    return def
  }

  stopEmote() {
    this.emote = null
  }

  private startStep(restart: boolean) {
    const e = this.emote!
    let name = e.anims[this.step % e.anims.length]
    if (!this.actions.has(name)) name = FALLBACK[name] ?? 'idle'
    const clip = this.actions.get(name)?.getClip()
    this.stepTime = clip?.duration ?? 0.5
    this.fadeTo(name, 0.12, restart)
  }

  private fadeTo(name: string, fade: number, restart = false) {
    const next = this.actions.get(name)
    if (!next) return
    if (next === this.current && !restart) return
    if (next === this.current) {
      next.reset().play()
      return
    }
    next.reset().setEffectiveWeight(1).fadeIn(fade).play()
    this.current?.fadeOut(fade)
    this.current = next
  }

  update(dt: number) {
    let hop = 0
    let sway = 0
    let sink = 0
    if (this.emote) {
      const e = this.emote
      this.emoteTime += dt
      this.stepTime -= dt
      if (this.stepTime <= 0) {
        this.step++
        const total = e.anims.length * (e.repeat ?? 1)
        if (e.mode === 'once' && this.step >= total) this.emote = null
        else if (e.mode === 'loop' || (e.mode === 'once' && this.step < total)) this.startStep(true)
        else this.stepTime = Infinity // hold : on garde la pose
      }
      if (this.emote?.id === 'joie') hop = Math.abs(Math.sin((this.emoteTime / 0.5) * Math.PI)) * 0.18
      if (this.emote?.id === 'danse') sway = Math.sin(this.emoteTime * 5) * 0.6
      if (this.emote?.id === 'assis') sink = 0.2
    }
    if (!this.emote) {
      this.fadeTo(this.base, 0.2)
      const walk = this.actions.get('walk'), sprint = this.actions.get('sprint')
      if (walk) walk.timeScale = this.base === 'walk' ? THREE.MathUtils.clamp(this.speed / WALK_NOMINAL, 0.4, 1.4) : 1
      if (sprint) sprint.timeScale = this.base === 'sprint' ? THREE.MathUtils.clamp(this.speed / SPRINT_NOMINAL, 0.4, 1.4) : 1
    }
    this.model.position.y = THREE.MathUtils.damp(this.model.position.y, hop - sink, hop ? 30 : 10, dt)
    this.model.rotation.y = THREE.MathUtils.damp(this.model.rotation.y, sway, 8, dt)
    this.mixer.update(dt)
  }

  /** Position monde au-dessus de la tête (bulles, noms). */
  head(out: THREE.Vector3): THREE.Vector3 {
    return this.root.getWorldPosition(out).setY(out.y + this.height + 0.28)
  }
}
