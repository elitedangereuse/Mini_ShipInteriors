import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { Avatar } from './avatar'
import type { Deck, Interactable } from './deck'
import { tr } from './i18n'
import type { IconName } from './icons'
import { NURSE, type Nurse } from './nurse'
import type { Player } from './player'
import type { SeatSpot } from './seats'
import { NURSE_PATCH, NURSE_ROOM, bedOf } from '../shared/nurse.js'

/*
 * L'infirmerie, côté joueur : la consultation avec Betty, et le pansement.
 *
 * Allongé sur un lit de l'infirmerie, Espace appelle Betty. Elle vient au chevet (pour tout le bord,
 * cf. shared/nurse.js), ausculte (stéthoscope, langue, pouls qui s'emballe), rend son diagnostic
 * (un mal du bord, façon Elite), puis soigne : le joueur repart avec un pansement en croix sur la
 * tête, que tout le bord voit une dizaine de minutes. Se relever en cours de route interrompt la
 * consultation (sans pansement). Une consultation à la fois : si Betty est déjà au chevet d'un
 * autre, elle le dit. Le nombre de consultations est gardé dans ce navigateur.
 */

export interface InfirmaryHost {
  /** Le pont principal (l'infirmerie). */
  deck: Deck
  nurse: Nurse
  player: Player
  /** Pont où se trouve le joueur. */
  here: () => Deck
  /** Place où le joueur est installé, s'il l'est. */
  seat: () => { item: Interactable; spot: SeatSpot } | null
  /** Numéro du joueur local au relais (-1 hors ligne). */
  self: () => number
  /** Texte dans la boîte de dialogue. */
  show: (text: string) => void
  /** Bulle au-dessus de l'infirmière. */
  nurseSays: (text: string) => void
  /** Icône au-dessus du joueur (le cœur qui s'emballe). */
  feel: (icon: IconName) => void
  /** On l'appelle au lit `bed`, ou la consultation est finie (-1 ; `healed` : menée à son terme). */
  care: (bed: number, healed: boolean) => void
}

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]

/** Consultations de ce joueur, gardées dans ce navigateur (le stockage peut manquer). */
const VISITS_KEY = 'mini-shipinteriors-consultations'
function loadVisits(): number {
  try {
    return Math.max(0, Number(localStorage.getItem(VISITS_KEY)) || 0)
  } catch {
    return 0
  }
}
function saveVisits(n: number) {
  try {
    localStorage.setItem(VISITS_KEY, String(n))
  } catch {
    // Stockage indisponible (navigation privée) : on compte pour cette visite seulement.
  }
}

// --------------------------------------------------------------- répliques

const COMING = [
  tr('J\'arrive, mon chou ! Ne bougez pas.', 'Coming, sugar! Don\'t move.'),
  tr('Une seconde, chéri, j\'arrive !', 'Just a sec, honey, I\'m coming!'),
  tr('On a sonné ? J\'arrive !', 'Did somebody ring? On my way!'),
]
const BUSY = [
  tr('Un instant, mon chou, j\'ai déjà un patient !', 'Just a moment, sugar, I\'ve already got a patient!'),
  tr('Chacun son tour, chéri. Je finis avec celui-là.', 'One at a time, honey. Let me finish with this one.'),
]
const HELLO = [
  tr('Alors, qu\'est-ce qui ne va pas ? Voyons voir ça…', 'So, what seems to be the trouble? Let\'s have a look…'),
  tr('Encore vous ? Allez, on regarde ça.', 'You again? All right, let\'s take a look.'),
  tr('Détendez-vous, mon chou. Je suis très douce.', 'Relax, sugar. I\'m very gentle.'),
]
const STETHO = [
  tr('Respirez… Toussez… Encore…', 'Breathe in… Cough… Again…'),
  tr('Le stéthoscope est un peu froid. Désolée, chéri.', 'The stethoscope\'s a little cold. Sorry, honey.'),
]
const CHECK = [
  tr('Tirez la langue… Parfait.', 'Say “aah”… Perfect.'),
  tr('Suivez mon doigt… Non, mon doigt. Pas le décolleté.', 'Follow my finger… No, my finger. Not the neckline.'),
  tr('Votre pouls : 140 ! Ah, c\'est l\'effet Betty. Ça passe.', 'Your pulse: 140! Oh, that\'s just the Betty effect. It wears off.'),
]
/** Diagnostics : les maux du bord, façon Elite. */
const DIAGNOSES = [
  tr('Syndrome de la supercroisière : vous n\'avez pas cligné des yeux pendant quarante minutes.', 'Supercruise syndrome: you didn\'t blink for forty minutes.'),
  tr('Carence aiguë en café CD-75. Traitement : une tasse, noire, tout de suite.', 'Acute CD-75 coffee deficiency. Treatment: one cup, black, right now.'),
  tr('Mal de l\'hyperespace. Ne regardez plus le tunnel de saut en mangeant.', 'Hyperspace sickness. Stop watching the jump tunnel while eating.'),
  tr('Torticolis du pilote de Viper : trop de tonneaux en combat.', 'Viper pilot\'s neck: too many barrel rolls in combat.'),
  tr('Coup de soleil d\'étoile à neutrons. Vous avez écopé trop près, hein ?', 'Neutron star sunburn. Scooped a little too close, didn\'t you?'),
  tr('Tendinite du salut militaire. Trop de o7. Levez le bras un peu moins haut.', 'Salute tendinitis. Too many o7s. Raise that arm a bit less.'),
  tr('Nostalgie aiguë de Jameson Memorial. Ça se soigne avec un saut ou deux.', 'Acute Jameson Memorial homesickness. A jump or two will cure it.'),
  tr('Excès de ragoût de Marcel. Ça passera. Lentement.', 'Too much of Marcel\'s stew. It\'ll pass. Slowly.'),
  tr('Allergie aux Thargoïdes. Rassurez-vous, tout le monde l\'a.', 'Thargoid allergy. Don\'t worry, everybody has it.'),
  tr('Crampe du joueur d\'arcade. Posez ce joystick de temps en temps.', 'Arcade player\'s cramp. Put that joystick down now and then.'),
  tr('Tachycardie. Ah non, attendez… c\'est normal, c\'est moi.', 'Tachycardia. Oh wait… that\'s normal, it\'s me.'),
  tr('Rien du tout. Vous vouliez juste me voir, avouez.', 'Nothing at all. You just wanted to see me, admit it.'),
]
/** Le soin : chacun finit par le pansement. */
const TREATMENTS = [
  tr('Deux cachets d\'aspirine spatiale, beaucoup d\'eau… et un petit pansement pour la route !', 'Two space aspirins, plenty of water… and a little plaster for the road!'),
  tr('Une piqûre de vitamines : ça ne pique pas… voilà, ça piquait un peu. Un pansement, et c\'est fini !', 'A vitamin shot: it won\'t sting… there, it stung a bit. A plaster, and we\'re done!'),
  tr('Un pansement Pioneer Supplies, spécial héros. Et une sucette, parce que vous avez été courageux.', 'A Pioneer Supplies plaster, the heroes\' kind. And a lollipop, because you were brave.'),
  tr('Repos, hydratation, et ce pansement. Je vous le mets bien en vue : il faut que ça se voie.', 'Rest, fluids, and this plaster. I\'ll put it where it shows: people should see it.'),
]
const DONE = [
  tr('Et voilà ! Reposez-vous encore un peu, mon chou. Revenez me voir si ça pique.', 'There you go! Rest a little longer, sugar. Come back if it stings.'),
  tr('Guéri ! Enfin, presque. Revenez quand vous voulez, chéri.', 'All better! Well, nearly. Come back any time, honey.'),
]
const LEFT = [
  tr('Hé ! Je n\'avais pas fini !', 'Hey! I wasn\'t finished!'),
  tr('Déjà debout ? Vous êtes un dur, vous.', 'Up already? Aren\'t you the tough one.'),
]

/** La consultation, après l'arrivée au chevet : ce que fait Betty, et quand (secondes). */
const TIMELINE = { hello: 0, stetho: 3, check: 6, diagnosis: 9.5, treat: 13, done: 16.5 } as const
type Stage = keyof typeof TIMELINE
const STAGES = Object.keys(TIMELINE) as Stage[]

/**
 * Consultation en cours. Ses temps sont ceux de l'horloge (ms), comme la consultation que tient le
 * relais : une image qui traîne ne la décale pas.
 */
interface Visit {
  bed: number
  /** Appel. */
  called: number
  /** Arrivée au chevet, 0 tant qu'elle n'y est pas. */
  arrived: number
  next: number
}

// --------------------------------------------------------------- consultation

export class Infirmary {
  /** Consultations de ce joueur avec Betty (dans ce navigateur). */
  visits = loadVisits()
  private visit: Visit | null = null
  /** Notre pansement, en attendant le relais (et hors ligne) : fin (ms). */
  private patchedUntil = 0

  constructor(private readonly host: InfirmaryHost) {}

  /** Une consultation est en cours. */
  get busy(): boolean {
    return this.visit !== null
  }

  /** On est allongé sur un lit de l'infirmerie : Espace appelle Betty. */
  canCall(seat: { item: Interactable; spot: SeatSpot } | null): boolean {
    return !!seat && seat.spot.pose === 'lie' && seat.item.furniture?.model === 'med-bed' && this.host.here() === this.host.deck
  }

  /** Porte-t-il un pansement ? (le relais le sait pour tout le bord ; hors ligne, nous seuls) */
  patched(id: number): boolean {
    const until = this.host.nurse.patched.get(id) ?? (id === this.host.self() ? this.patchedUntil : 0)
    return until > Date.now()
  }

  /** Ce que Betty répond si on lui parle pendant la consultation (null : elle bavarde). */
  reminder(): string | null {
    return this.visit ? tr('Chut, mon chou. Je vous ausculte.', 'Hush, sugar. I\'m listening to your chest.') : null
  }

  /** Espace, allongé sur un lit : on appelle Betty. */
  call() {
    const { host } = this
    if (this.visit) return host.nurseSays(this.reminder()!)
    const { nurse } = host
    const bed = bedOf(host.player.position)
    if (bed < 0) return
    if (nurse.caringBed >= 0 && nurse.patient !== host.self()) return host.nurseSays(pick(BUSY))
    this.visit = { bed, called: Date.now(), arrived: 0, next: 0 }
    host.care(bed, false)
    host.nurseSays(pick(COMING))
  }

  /** On arrête là : relevé, parti, ou Betty repartie. */
  private stop(said?: string) {
    if (!this.visit) return
    this.visit = null
    this.host.care(-1, false)
    if (said) this.host.nurseSays(said)
  }

  update() {
    const v = this.visit
    if (!v) return
    const { host } = this
    const { nurse } = host
    const now = Date.now()
    const since = (now - v.called) / 1000
    // Relevé, ou parti de l'infirmerie : la consultation s'arrête.
    if (!this.canCall(host.seat()) || host.deck.map.room(Math.round(host.player.position.x), Math.round(host.player.position.z)) !== NURSE_ROOM) {
      return this.stop(v.arrived || since > 1 ? pick(LEFT) : undefined)
    }
    if (since > 1.5) {
      // Le relais a donné la priorité à un autre patient (appel au même instant).
      if (nurse.caringBed >= 0 && nurse.patient !== host.self()) {
        this.visit = null
        return host.nurseSays(pick(BUSY))
      }
      // Le relais l'a libérée (consultation trop longue) : on en reste là.
      if (nurse.caringBed < 0) return this.stop(tr('On m\'appelle ailleurs, mon chou. Rappelez-moi !', 'I\'m needed elsewhere, sugar. Call me again!'))
    }
    // Elle arrive : la consultation commence au chevet (ou au bout d'un moment, si elle traîne).
    if (!v.arrived) {
      if (nurse.atBedside || since > 18) v.arrived = now
      else return
    }
    const at = (now - v.arrived) / 1000
    while (v.next < STAGES.length && at >= TIMELINE[STAGES[v.next]]) this.play(STAGES[v.next++])
  }

  private play(stage: Stage) {
    const { host } = this
    switch (stage) {
      case 'hello':
        host.nurse.tend()
        return host.nurseSays(pick(HELLO))
      case 'stetho':
        host.nurse.tend()
        return host.nurseSays(pick(STETHO))
      case 'check':
        host.feel('heart')
        return host.nurseSays(pick(CHECK))
      case 'diagnosis':
        return host.show(tr(`${NURSE} : « Diagnostic : ${pick(DIAGNOSES)} »`, `${NURSE}: “Diagnosis: ${pick(DIAGNOSES)}”`))
      case 'treat':
        host.nurse.tend()
        host.feel('heart')
        this.patchedUntil = Date.now() + NURSE_PATCH * 1000
        return host.nurseSays(pick(TREATMENTS))
      case 'done':
        this.visits++
        saveVisits(this.visits)
        this.visit = null
        host.care(-1, true)
        return host.nurseSays(pick(DONE))
    }
  }
}

// --------------------------------------------------------------- pansement

const plasterMat = new THREE.MeshLambertMaterial({ color: '#ff8fbd' })
const padMat = new THREE.MeshLambertMaterial({ color: '#ffffff' })
const heartMat = new THREE.MeshBasicMaterial({ color: '#e0263a' })

/**
 * Deux bandes roses en croix, compresse blanche au milieu, un cœur rouge : le pansement de Betty
 * (mètres). Rose vif, pour se voir sur toutes les coiffures.
 */
function plaster(): THREE.Group {
  const g = new THREE.Group()
  for (const a of [Math.PI / 4, -Math.PI / 4]) {
    const strip = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.008, 0.038, 1, 0.003), plasterMat)
    strip.rotation.y = a
    g.add(strip)
  }
  const pad = new THREE.Mesh(new RoundedBoxGeometry(0.042, 0.011, 0.042, 1, 0.003), padMat)
  pad.rotation.y = Math.PI / 4
  const heart = new THREE.Mesh(new THREE.CircleGeometry(0.011, 12), heartMat)
  heart.rotation.x = -Math.PI / 2
  heart.position.y = 0.0058
  g.add(pad, heart)
  return g
}

/**
 * Le pansement, posé tout en haut de la tête (on le voit d'en haut, comme la caméra ; sur un
 * chignon s'il y en a un), accroché à l'os de la tête : il suit les animations. Placé d'après le
 * maillage de la tête dans sa pose de repos, ou du personnage entier s'il n'en a pas (robots,
 * créatures) : le sommet le plus haut, et le centre de la face qu'il couronne.
 */
function wearPlaster(root: THREE.Object3D): THREE.Object3D | null {
  const head = root.getObjectByName('head')
  let mesh = root.getObjectByName('head-mesh') as THREE.SkinnedMesh | undefined
  if (!mesh) root.traverse((o) => { if (!mesh && (o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh })
  if (!head || !mesh) return null
  const i = mesh.skeleton.bones.indexOf(head as THREE.Bone)
  if (i < 0) return null
  root.updateMatrixWorld(true)
  /** Échelle de l'os de la tête : le pansement se mesure en mètres. */
  const scale = head.getWorldScale(new THREE.Vector3()).x || 1
  const toHead = new THREE.Matrix4().multiplyMatrices(mesh.skeleton.boneInverses[i], mesh.bindMatrix)
  const pos = mesh.geometry.attributes.position as THREE.BufferAttribute
  const points: THREE.Vector3[] = []
  let highest = new THREE.Vector3(0, -Infinity, 0)
  for (let k = 0; k < pos.count; k++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, k).applyMatrix4(toHead)
    points.push(v)
    if (v.y > highest.y) highest = v
  }
  // La face du sommet (d'un seul chignon, s'il y en a deux à la même hauteur).
  const top = highest.y
  const crown = points.filter((p) => p.y > top - 0.004 / scale && Math.hypot(p.x - highest.x, p.z - highest.z) < 0.08 / scale)
  const at = crown.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(crown.length)
  const p = plaster()
  p.scale.setScalar(1 / scale)
  p.position.set(at.x, top + 0.003 / scale, at.z)
  p.rotation.y = 0.3
  head.add(p)
  return p
}

/** Les pansements portés : un par personnage, créé à la première fois, montré ou caché ensuite. */
export class Plasters {
  private worn = new WeakMap<Avatar, THREE.Object3D | null>()

  show(avatar: Avatar | undefined, on: boolean) {
    if (!avatar) return
    let p = this.worn.get(avatar)
    if (p === undefined) {
      if (!on) return
      p = wearPlaster(avatar.root)
      this.worn.set(avatar, p)
    }
    if (p) p.visible = on
  }
}
