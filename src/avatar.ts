import * as THREE from 'three'
import type { Rig } from './assets'
import { tr } from './i18n'
import type { IconName } from './icons'
import type { PoseId } from './seats'
import { beatNow, tempo } from './tempo'

export type Locomotion = 'idle' | 'walk' | 'sprint'

export interface EmoteDef {
  /** Identifiant envoyé aux autres joueurs, et commande du chat (/salut). */
  id: string
  /** Commande anglaise du chat (/wave), acceptée aussi. */
  en: string
  icon: IconName | ''
  label: string
  /** Animations jouées à la suite (en boucle pour mode 'loop'). */
  anims: string[]
  /** once : joue `repeat` fois puis revient au repos · loop : jusqu'au prochain mouvement · hold : garde la pose finale. */
  mode: 'once' | 'loop' | 'hold'
  repeat?: number
}

export const EMOTES: EmoteDef[] = [
  { id: 'salut', en: 'wave', icon: 'hand-waving', label: tr('Salut', 'Wave'), anims: ['interact-left'], mode: 'once', repeat: 2 },
  { id: 'oui', en: 'yes', icon: 'thumbs-up', label: tr('Oui', 'Yes'), anims: ['emote-yes'], mode: 'once', repeat: 2 },
  { id: 'non', en: 'no', icon: 'thumbs-down', label: tr('Non', 'No'), anims: ['emote-no'], mode: 'once', repeat: 2 },
  { id: 'joie', en: 'cheer', icon: 'confetti', label: tr('Joie', 'Cheer'), anims: ['jump'], mode: 'once', repeat: 3 },
  { id: 'danse', en: 'dance', icon: 'disco-ball', label: tr('Danse', 'Dance'), anims: ['attack-kick-left', 'attack-kick-right'], mode: 'loop' },
  { id: 'assis', en: 'sit', icon: 'armchair', label: tr('Assis', 'Sit'), anims: ['sit'], mode: 'hold' },
  { id: 'dodo', en: 'sleep', icon: 'moon-stars', label: tr('Dodo', 'Sleep'), anims: ['die'], mode: 'hold' },
]

/** Emote interne (non proposée dans la barre) : utiliser une console. */
const INTERACT: EmoteDef = { id: 'interact', en: 'interact', icon: '', label: '', anims: ['interact-right'], mode: 'once' }

/** Animations de repli quand un pack ne fournit pas un clip (les Blocky Characters n'ont pas « jump »). */
const FALLBACK: Record<string, string> = { jump: 'emote-yes', crouch: 'sit' }

/**
 * Pose tenue sur un meuble (cf. seats.ts) : ses animations, jouées en boucle, ou la dernière image
 * tenue (`hold`). `hip` : hauteur du bassin dans l'animation assise (le modèle descend d'autant,
 * le bassin se pose sur l'assise) ; `from` : part de la première animation sautée (la chute de
 * « die » : on s'allonge sans tomber) ; `speed` : vitesse de lecture ; `motion` : petit
 * mouvement du modèle en plus (pédaler, dodeliner de la tête aux platines).
 */
interface PoseDef {
  anims: string[]
  hold?: boolean
  hip?: number
  from?: number
  speed?: number
  motion?: 'pedal' | 'mix'
}

const POSES: Record<PoseId, PoseDef> = {
  sit: { anims: ['sit'], hold: true, hip: 0.125 },
  // Couché, le corps descend jusqu'à 6 cm sous l'origine (et la tête, 12 cm) : on le remonte.
  lie: { anims: ['die'], hold: true, from: 0.55, hip: -0.07 },
  pilot: { anims: ['drive'], hold: true, hip: 0.2 },
  arcade: { anims: ['interact-right', 'interact-left'], speed: 1.5 },
  claw: { anims: ['interact-right', 'idle'], speed: 0.8 },
  punch: { anims: ['attack-melee-right', 'attack-melee-left'], speed: 1.1 },
  run: { anims: ['sprint'], speed: 0.85 },
  pedal: { anims: ['drive'], hold: true, hip: 0.2, motion: 'pedal' },
  mix: { anims: ['interact-left', 'interact-right'], speed: 0.9, motion: 'mix' },
}

/**
 * La danse : un pas tous les deux temps de la soirée (cf. tempo.ts), joué une ou deux fois
 * (`reps`) ; les danseurs battent ensemble, chacun partant d'un pas différent.
 */
const DANCE: { anim: string; reps: number; move: 'sway' | 'bounce' | 'hop' | 'spin' }[] = [
  { anim: 'attack-kick-left', reps: 1, move: 'sway' },
  { anim: 'attack-kick-right', reps: 1, move: 'sway' },
  { anim: 'attack-melee-right', reps: 2, move: 'bounce' },
  { anim: 'attack-melee-left', reps: 2, move: 'bounce' },
  { anim: 'interact-left', reps: 1, move: 'spin' },
  { anim: 'emote-yes', reps: 2, move: 'bounce' },
  { anim: 'jump', reps: 2, move: 'hop' },
  { anim: 'crouch', reps: 1, move: 'bounce' },
]
const TAU = Math.PI * 2

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
  private pose: PoseDef | null = null
  private posed: PoseId | null = null
  private poseStep = 0
  private poseStepTime = 0
  private poseTime = 0
  /** Pas de danse en cours, et celui d'où part ce danseur. */
  private dance = -1
  private danceRep = 0
  private readonly danceStart = Math.floor(Math.random() * DANCE.length)
  /** À chaque animation d'une pose (un coup de poing dans le sac, cf. main.ts). */
  onPoseStep?: (step: number) => void

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

  /** Pose tenue sur un meuble, ou null. */
  get poseId(): PoseId | null {
    return this.posed
  }

  /** S'installe dans une pose (cf. seats.ts), ou la quitte (null). Une emote l'interrompt aussi. */
  setPose(id: PoseId | null) {
    if (id === this.posed) return
    this.posed = id
    this.pose = id ? POSES[id] : null
    this.poseStep = 0
    this.poseTime = 0
    if (this.pose) {
      this.emote = null
      this.startPoseStep()
    }
  }

  private startPoseStep() {
    const p = this.pose!
    let name = p.anims[this.poseStep % p.anims.length]
    if (!this.actions.has(name)) name = FALLBACK[name] ?? 'idle'
    const action = this.actions.get(name)
    const clip = action?.getClip()
    const skip = this.poseStep === 0 ? (p.from ?? 0) : 0
    this.fadeTo(name, 0.18, true)
    if (action && clip) {
      action.timeScale = p.speed ?? 1
      action.time = clip.duration * skip
    }
    this.poseStepTime = p.hold && p.anims.length === 1 ? Infinity : ((clip?.duration ?? 0.5) * (1 - skip)) / (p.speed ?? 1)
    this.onPoseStep?.(this.poseStep)
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
    this.setPose(null)
    this.emote = def
    this.dance = -1
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
    // Une pose ou un pas de danse a pu changer sa vitesse : on repart à vitesse normale.
    next.timeScale = 1
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
    let spin: number | null = null
    if (this.pose) {
      const p = this.pose
      this.poseTime += dt
      this.poseStepTime -= dt
      if (this.poseStepTime <= 0) {
        this.poseStep++
        this.startPoseStep()
      }
      sink = p.hip ?? 0
      if (p.motion === 'pedal') hop = Math.abs(Math.sin(this.poseTime * 6)) * 0.018
      if (p.motion === 'mix') sway = Math.sin(beatNow() * Math.PI) * 0.18
    } else if (this.emote?.id === 'danse') {
      this.emoteTime += dt
      const beat = beatNow()
      const k = (((Math.floor(beat / 2) + this.danceStart) % DANCE.length) + DANCE.length) % DANCE.length
      const step = DANCE[k]
      if (k !== this.dance) {
        // Nouveau pas, calé sur deux temps.
        this.dance = k
        this.danceRep = 0
        const name = this.actions.has(step.anim) ? step.anim : FALLBACK[step.anim] ?? 'idle'
        this.fadeTo(name, 0.12, true)
        const action = this.actions.get(name)
        if (action) action.timeScale = THREE.MathUtils.clamp((action.getClip().duration * step.reps * tempo.bpm) / 120, 0.5, 2.5)
      }
      const phase = ((beat % 2) + 2) % 2
      if (step.reps === 2 && phase >= 1 && !this.danceRep) {
        // Deuxième fois, sur le second temps.
        this.danceRep = 1
        this.current?.reset().play()
      }
      if (step.move === 'sway') sway = Math.sin(phase * Math.PI) * (k % 2 ? -0.5 : 0.5)
      if (step.move === 'bounce') sink = Math.abs(Math.sin(beat * Math.PI)) * 0.035
      if (step.move === 'hop') hop = Math.abs(Math.sin(beat * Math.PI)) * 0.12
      if (step.move === 'spin') spin = (phase / 2) * TAU
    } else if (this.emote) {
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
      if (this.emote?.id === 'assis') sink = 0.2
    }
    if (!this.emote && !this.pose) {
      this.fadeTo(this.base, 0.2)
      const walk = this.actions.get('walk'), sprint = this.actions.get('sprint')
      if (walk) walk.timeScale = this.base === 'walk' ? THREE.MathUtils.clamp(this.speed / WALK_NOMINAL, 0.4, 1.4) : 1
      if (sprint) sprint.timeScale = this.base === 'sprint' ? THREE.MathUtils.clamp(this.speed / SPRINT_NOMINAL, 0.4, 1.4) : 1
    }
    this.model.position.y = THREE.MathUtils.damp(this.model.position.y, hop - sink, hop ? 30 : 10, dt)
    if (spin !== null) this.model.rotation.y = spin
    else {
      // Au sortir d'une pirouette, on revient par le plus court chemin.
      this.model.rotation.y = THREE.MathUtils.euclideanModulo(this.model.rotation.y + Math.PI, TAU) - Math.PI
      this.model.rotation.y = THREE.MathUtils.damp(this.model.rotation.y, sway, 8, dt)
    }
    this.mixer.update(dt)
  }

  /** Position monde au-dessus de la tête (bulles, noms). */
  head(out: THREE.Vector3): THREE.Vector3 {
    return this.root.getWorldPosition(out).setY(out.y + this.height + 0.28)
  }
}
