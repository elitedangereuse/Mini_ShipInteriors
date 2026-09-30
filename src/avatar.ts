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
  /** Durée de l'emote, quand elle ne suit pas celle de ses animations (un geste ajouté par-dessus). */
  duration?: number
  /** Geste du bras droit posé par-dessus l'animation (le salut « o7 ») : le squelette n'a pas de clip pour ça. */
  gesture?: 'salute'
}

export const EMOTES: EmoteDef[] = [
  { id: 'salut', en: 'wave', icon: 'hand-waving', label: tr('Salut', 'Wave'), anims: ['interact-left'], mode: 'once', repeat: 2 },
  { id: 'oui', en: 'yes', icon: 'thumbs-up', label: tr('Oui', 'Yes'), anims: ['emote-yes'], mode: 'once', repeat: 2 },
  { id: 'non', en: 'no', icon: 'thumbs-down', label: tr('Non', 'No'), anims: ['emote-no'], mode: 'once', repeat: 2 },
  { id: 'joie', en: 'cheer', icon: 'confetti', label: tr('Joie', 'Cheer'), anims: ['jump'], mode: 'once', repeat: 3 },
  { id: 'danse', en: 'dance', icon: 'disco-ball', label: tr('Danse', 'Dance'), anims: ['attack-kick-left', 'attack-kick-right'], mode: 'loop' },
  { id: 'assis', en: 'sit', icon: 'armchair', label: tr('Assis', 'Sit'), anims: ['sit'], mode: 'hold' },
  { id: 'dodo', en: 'sleep', icon: 'moon-stars', label: tr('Dodo', 'Sleep'), anims: ['die'], mode: 'hold' },
  { id: 'o7', en: 'o7', icon: 'o7', label: tr('Salut militaire (o7)', 'Salute (o7)'), anims: ['idle'], mode: 'once', duration: 2.2, gesture: 'salute' },
]

/** Visage d'un personnage (cf. holo-style.ts) : null rend son expression de tous les jours. */
export interface FaceControl {
  show(expression: string | null): void
}

/** L'expression que joue chaque emote, le temps du geste. */
const EMOTE_FACES: Record<string, string> = { joie: 'gr', danse: 'gr', oui: 'sm', salut: 'wi', o7: 'wi', non: 'fr', dodo: 'zz' }

/** Emote interne (non proposée dans la barre) : utiliser une console. */
const INTERACT: EmoteDef = { id: 'interact', en: 'interact', icon: '', label: '', anims: ['interact-right'], mode: 'once' }

/** Animations de repli quand un pack ne fournit pas un clip (les Blocky Characters n'ont pas « jump »). */
const FALLBACK: Record<string, string> = { jump: 'emote-yes', crouch: 'sit', drive: 'sit' }

/**
 * Pose tenue sur un meuble (cf. seats.ts) : ses animations, jouées en boucle, ou la dernière image
 * tenue (`hold`). `seated` : le bassin se pose sur l'assise, à la hauteur mesurée sur
 * l'animation de chaque modèle (comme « sit ») ; `hip` : sinon, de combien le modèle descend ; `from` : part de la première animation sautée (la chute de
 * « die » : on s'allonge sans tomber) ; `speed` : vitesse de lecture ; `motion` : petit
 * mouvement du modèle en plus (pédaler, dodeliner de la tête aux platines).
 */
interface PoseDef {
  anims: string[]
  hold?: boolean
  seated?: boolean
  hip?: number
  from?: number
  speed?: number
  motion?: 'pedal' | 'mix'
}

const POSES: Record<PoseId, PoseDef> = {
  sit: { anims: ['sit'], hold: true },
  // Couché, le corps descend jusqu'à 6 cm sous l'origine (et la tête, 12 cm) : on le remonte.
  lie: { anims: ['die'], hold: true, from: 0.55, hip: -0.07 },
  pilot: { anims: ['drive'], hold: true, seated: true },
  arcade: { anims: ['interact-right', 'interact-left'], speed: 1.5 },
  claw: { anims: ['interact-right', 'idle'], speed: 0.8 },
  punch: { anims: ['attack-melee-right', 'attack-melee-left'], speed: 1.1 },
  run: { anims: ['sprint'], speed: 0.85 },
  pedal: { anims: ['drive'], hold: true, seated: true, motion: 'pedal' },
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

/**
 * Le salut « o7 » : le bras droit (un seul os, sans coude) levé devant la tempe. Repère de l'os :
 * le bras pend vers -y, le personnage regarde vers +z. Le geste monte en 0,25 s et redescend
 * pendant les 0,3 dernières secondes de l'emote.
 */
export const SALUTE = new THREE.Euler(-2.2, 0, 1.1)
const saluteQ = new THREE.Quaternion()

/**
 * Porter à deux mains (un plateau) : les bras tendus droit devant soi, un peu vers le bas, les
 * mains sous les bords du plateau (repère du parent des bras : le personnage regarde vers +z ;
 * x vers l'intérieur).
 */
const CARRY = new THREE.Vector3(0, -0.42, 0.9).normalize()
const carryQ = new THREE.Quaternion()
const carryDir = new THREE.Vector3()

/**
 * Manger, assis devant son plateau : le bras droit pique dans l'assiette (PLATE : droit devant,
 * à hauteur du plateau ; le bras, court, n'irait pas plus bas sans passer sous la table), monte
 * la fourchette à la bouche (MOUTH), et redescend ; une bouchée par EAT_BITE secondes. Même
 * repère que CARRY (x vers l'intérieur).
 */
const PLATE = new THREE.Vector3(0.1, -0.1, 0.99).normalize()
const MOUTH = new THREE.Vector3(0.62, 0.52, 0.6).normalize()
export const EAT_BITE = 1.4
const eatDir = new THREE.Vector3()

/** Un bras : l'os, sa direction au repos (repère du parent, quaternion identité) et sa longueur. */
interface Arm {
  bone: THREE.Object3D
  rest: THREE.Vector3
  length: number
  /** -1 ou 1 : de quel côté du corps il pend (x du repère du parent). */
  side: number
}

/**
 * Mesure un bras (un seul os, sans coude) : vers où part-il quand son quaternion est à l'identité,
 * et jusqu'où ? Les modèles n'ont pas tous la même pose de repos : on la mesure sur les sommets
 * de la peau que l'os entraîne (repère de l'os, qui à l'identité est celui de son parent).
 */
function measureArm(model: THREE.Object3D, bone: THREE.Object3D | undefined): Arm | null {
  if (!bone?.parent) return null
  const sum = new THREE.Vector3()
  const points: THREE.Vector3[] = []
  model.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh
    if (!mesh.isSkinnedMesh) return
    const index = mesh.skeleton.bones.indexOf(bone as THREE.Bone)
    if (index < 0) return
    const position = mesh.geometry.getAttribute('position')
    const skinIndex = mesh.geometry.getAttribute('skinIndex')
    const skinWeight = mesh.geometry.getAttribute('skinWeight')
    if (!position || !skinIndex || !skinWeight) return
    const toBone = mesh.skeleton.boneInverses[index].clone().multiply(mesh.bindMatrix)
    for (let i = 0; i < position.count; i++) {
      let weight = 0
      for (let k = 0; k < skinIndex.itemSize; k++) if (skinIndex.getComponent(i, k) === index) weight += skinWeight.getComponent(i, k)
      if (weight < 0.5) continue
      const p = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(toBone)
      points.push(p)
      sum.add(p)
    }
  })
  if (points.length < 3) return null
  const rest = sum.divideScalar(points.length).normalize()
  const length = Math.max(...points.map((p) => p.dot(rest)))
  return length > 0 ? { bone, rest, length, side: Math.sign(bone.position.x) || 1 } : null
}

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
  /** Dessous de l'assise et point le plus bas de « sit », après mise à l'échelle du modèle. */
  private sitting = { seat: 0, ground: 0 }
  /** Même mesure, sur l'animation des commandes (« drive » : pilote, vélo). */
  private driving = { seat: 0, ground: 0 }
  /** Garde le contact avec le sol pendant l'emote assise et son relevé. */
  private groundSit = 0
  private readonly groundBounds = new THREE.Box3()
  private readonly groundOrigin = new THREE.Vector3()
  private pose: PoseDef | null = null
  private posed: PoseId | null = null
  private poseStep = 0
  private poseStepTime = 0
  private poseTime = 0
  /** Pas de danse en cours, et celui d'où part ce danseur. */
  private dance = -1
  private danceRep = 0
  private readonly danceStart = Math.floor(Math.random() * DANCE.length)
  private readonly armRight: THREE.Object3D | null
  /** Les deux bras mesurés (porter un plateau), s'ils existent. */
  private readonly arms: Arm[]
  /** Porte quelque chose à deux mains devant soi (cf. hands) ; les bras s'y mettent en douceur. */
  carrying = false
  private carryWeight = 0
  /** Mange (cf. PLATE, MOUTH) : le bras droit fait des allers-retours de l'assiette à la bouche. */
  eating = false
  private eatWeight = 0
  private eatTime = 0
  /** À chaque animation d'une pose (un coup de poing dans le sac, cf. main.ts). */
  onPoseStep?: (step: number) => void
  private readonly face: FaceControl | null

  constructor(rig: Rig & { height?: number; face?: FaceControl }) {
    this.height = rig.height ?? 0.67
    this.face = rig.face ?? null
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
    this.sitting = this.measureSitting('sit')
    this.driving = this.measureSitting(this.actions.has('drive') ? 'drive' : FALLBACK.drive)
    this.armRight = this.model.getObjectByName('arm-right') ?? null
    const arms = [measureArm(this.model, this.armRight ?? undefined), measureArm(this.model, this.model.getObjectByName('arm-left'))]
    this.arms = arms.every((a) => a) ? (arms as Arm[]) : []
    this.fadeTo('idle', 0)
  }

  /**
   * « sit » et « drive » abaissent déjà le squelette. Les Mini et les Blocky n'ont ni les mêmes
   * unités, ni la même hauteur de bassin : on mesure la pose, au lieu de la descendre à nouveau.
   */
  private measureSitting(clip: string): { seat: number; ground: number } {
    const action = this.actions.get(clip)
    if (!action) return { seat: 0, ground: 0 }
    action.reset().play()
    this.mixer.update(action.getClip().duration)
    this.model.updateMatrixWorld(true)
    const hip = this.model.getObjectByName('leg-left')
    const at = hip?.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3()
    const point = new THREE.Vector3()
    let seat = Infinity, ground = Infinity
    this.model.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) (mesh as THREE.SkinnedMesh).skeleton.update()
      const vertices = mesh.geometry.getAttribute('position')
      for (let i = 0; i < vertices.count; i++) {
        mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld)
        ground = Math.min(ground, point.y)
        // Le bassin et l'arrière des cuisses reposent sur le coussin ; les pieds pendent devant.
        if (point.z < at.z + this.height * 0.09) seat = Math.min(seat, point.y)
      }
    })
    this.mixer.stopAllAction()
    this.model.updateMatrixWorld(true)
    return { seat: Number.isFinite(seat) ? seat - 0.005 : 0, ground: Number.isFinite(ground) ? ground - 0.005 : 0 }
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
    this.stepTime = e.duration ?? clip?.duration ?? 0.5
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
      sink = this.posed === 'sit' ? this.sitting.seat : p.seated ? this.driving.seat : p.hip ?? 0
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
      if (this.emote?.id === 'assis') sink = this.sitting.ground
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
    if (this.emote?.gesture === 'salute' && this.armRight) {
      const t = this.emoteTime, end = this.emote.duration ?? 2
      const w = THREE.MathUtils.smoothstep(t, 0, 0.25) * (1 - THREE.MathUtils.smoothstep(t, end - 0.3, end))
      this.armRight.quaternion.slerp(saluteQ.setFromEuler(SALUTE), w)
    }
    // À deux mains, par-dessus l'animation (sauf installé sur un meuble, et le bras qui salue).
    this.carryWeight = THREE.MathUtils.damp(this.carryWeight, this.carrying && !this.pose ? 1 : 0, 12, dt)
    if (this.carryWeight > 0.001) {
      for (const arm of this.arms) {
        if (arm.bone === this.armRight && this.emote?.gesture === 'salute') continue
        carryDir.set(-arm.side * CARRY.x, CARRY.y, CARRY.z)
        arm.bone.quaternion.slerp(carryQ.setFromUnitVectors(arm.rest, carryDir), this.carryWeight)
      }
    }
    // La fourchette : à l'assiette au début de chaque bouchée, puis à la bouche, et on redescend.
    this.eatTime = this.eating ? this.eatTime + dt : 0
    this.eatWeight = THREE.MathUtils.damp(this.eatWeight, this.eating ? 1 : 0, 8, dt)
    const right = this.arms.find((a) => a.bone === this.armRight)
    if (right && this.eatWeight > 0.001) {
      const k = (this.eatTime % EAT_BITE) / EAT_BITE
      const up = THREE.MathUtils.smoothstep(k, 0.25, 0.5) * (1 - THREE.MathUtils.smoothstep(k, 0.72, 0.95))
      eatDir.copy(PLATE).lerp(MOUTH, up).normalize()
      eatDir.x *= -right.side
      right.bone.quaternion.slerp(carryQ.setFromUnitVectors(right.rest, eatDir), this.eatWeight)
    }
    this.face?.show(this.eating && this.eatTime % EAT_BITE > EAT_BITE * 0.55 ? 'sm' : (this.emote && EMOTE_FACES[this.emote.id]) ?? null)
    // Le fondu des clips et le décalage du modèle n'avancent pas à la même vitesse : empêcher
    // aussi l'enfoncement pendant la transition, particulièrement visible sur les Blocky.
    this.groundSit = this.emote?.id === 'assis' ? 0.6 : Math.max(0, this.groundSit - dt)
    if (this.groundSit && !this.pose) {
      this.root.updateWorldMatrix(true, false)
      this.root.updateMatrixWorld(true)
      this.model.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.update()
      })
      this.groundBounds.setFromObject(this.model, true)
      const floor = this.root.getWorldPosition(this.groundOrigin).y
      this.model.position.y += Math.max(0, floor + 0.005 - this.groundBounds.min.y)
    }
  }

  /**
   * Entre les deux mains (monde), là où poser ce qu'on porte ; null si le modèle n'a pas deux bras
   * mesurables.
   */
  hands(out: THREE.Vector3): THREE.Vector3 | null {
    if (this.arms.length !== 2) return null
    out.set(0, 0, 0)
    const tip = new THREE.Vector3()
    for (const arm of this.arms) {
      arm.bone.updateWorldMatrix(true, false)
      out.add(arm.bone.localToWorld(tip.copy(arm.rest).multiplyScalar(arm.length)))
    }
    return out.multiplyScalar(0.5)
  }

  /** Bout de la main droite (monde), où tenir la fourchette ; null sans bras mesurable. */
  rightHand(out: THREE.Vector3): THREE.Vector3 | null {
    const arm = this.arms.find((a) => a.bone === this.armRight)
    if (!arm) return null
    arm.bone.updateWorldMatrix(true, false)
    return arm.bone.localToWorld(out.copy(arm.rest).multiplyScalar(arm.length))
  }

  /** Position monde au-dessus de la tête (bulles, noms). */
  head(out: THREE.Vector3): THREE.Vector3 {
    return this.root.getWorldPosition(out).setY(out.y + this.height + 0.28)
  }
}
