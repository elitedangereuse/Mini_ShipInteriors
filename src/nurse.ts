import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { Avatar } from './avatar'
import type { Deck } from './deck'
import { tr } from './i18n'
import { boxInBone, lookRig, parseLook } from './looks'
import type { NurseState } from './net'
import { dampAngle } from './player'
import { recolored } from './recolor'
import {
  NURSE_BEDS, NURSE_CARE, NURSE_CATCH_UP, NURSE_POSTS, NURSE_SNAP, NURSE_SPEED, careNurse, holdNurse, nurseAt, nurseStep, nurseTime,
  type NurseClock, type NurseWork,
} from '../shared/nurse.js'

/*
 * Betty, l'infirmière du bord : blonde platine, yeux bleus, rouge à lèvres « Rouge Achenar », blouse
 * blanche décolletée, coiffe à croix rouge et stéthoscope ; le cliché de l'infirmière, assumé. Elle
 * fait la tournée de l'infirmerie (son poste de soins, la pharmacie, les lits, le scanner, le frigo
 * à vaccins, la quarantaine, le lavabo, la salle d'attente). Quand on lui parle, elle s'interrompt
 * et se tourne vers le commandant ; quand un joueur allongé sur un lit l'appelle (cf.
 * infirmary.ts), elle vient à son chevet. Elle est la même pour tout le bord : sa tournée suit
 * l'horloge que tient le relais (cf. shared/nurse.js) ; hors ligne, celle de l'appareil.
 */

export const NURSE = 'Betty'

// --------------------------------------------------------------- apparence

/** Cases (32 px) de la palette des Mini Characters, telles que les emploie le modèle « female f ». */
const cell = (x: number, y: number) => [x >> 5, y >> 5] as const

/** Cases libres de la palette, repeintes pour le rouge à lèvres et les iris. */
const LIPSTICK_CELL = [0, 0] as const
const IRIS_CELL = [2, 0] as const
const LIPSTICK = new THREE.Color('#e3102e')
const IRIS = new THREE.Color('#2f86ff')

/** Blond platine : du doré de l'ombre au presque blanc des reflets. */
const BLONDE = ['#b58a2e', '#e2bd55', '#f7e29a', '#fff6d8'].map((c) => new THREE.Color(c))
const WHITE_DRESS = [new THREE.Color('#d6dde6'), new THREE.Color('#fbfcfd')]
const STOCKINGS = [new THREE.Color('#d9ccc8'), new THREE.Color('#fbf3f0')]
const RED = [new THREE.Color('#8f0d1f'), new THREE.Color('#e8263f')]

const ramp = (stops: THREE.Color[], k: number, out: THREE.Color) => {
  const t = THREE.MathUtils.clamp(k, 0, 1) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(t))
  return out.copy(stops[i]).lerp(stops[i + 1], t - i)
}
const norm = (l: number, lo: number, hi: number) => (l - lo) / (hi - lo)

/**
 * La palette de Betty : cheveux blonds, blouse blanche (le blouson, le haut et les liserés du
 * modèle), ceinture et escarpins rouges, bas blancs, barrette rouge ; la peau ne change pas.
 */
function bettyTexture(src: THREE.Texture): THREE.Texture {
  return recolored(src, 'nurse:betty', (hsl, c, x, y) => {
    const [cx, cy] = cell(x, y)
    if (cx === LIPSTICK_CELL[0] && cy === LIPSTICK_CELL[1]) c.copy(LIPSTICK)
    else if (cx === IRIS_CELL[0] && cy === IRIS_CELL[1]) c.copy(IRIS)
    // Cheveux (et mèche du front).
    else if (cx === 13 || (cx === 11 && cy >= 12)) ramp(BLONDE, norm(hsl.l, 0.34, 0.7), c)
    // Blouse : blouson sombre, haut jaune, sangles claires.
    else if (cx === 1) ramp(WHITE_DRESS, norm(hsl.l, 0.19, 0.3), c)
    else if (cx === 5) ramp(WHITE_DRESS, norm(hsl.l, 0.55, 0.72), c)
    else if (cx === 7) ramp(WHITE_DRESS, norm(hsl.l, 0.4, 0.8), c)
    // Ceinture, puis escarpins et barrette.
    else if (cx === 3) ramp(RED, norm(hsl.l, 0.3, 0.5), c)
    else if (cx === 15 && cy >= 9 && cy <= 10) ramp(RED, norm(hsl.l, 0.45, 0.65), c)
    // Jean : bas blancs.
    else if (cx === 11 && cy <= 10) ramp(STOCKINGS, norm(hsl.l, 0.5, 0.62), c)
  })
}

const lambert = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra })

/** Cylindre de `a` à `b` (un tuyau de stéthoscope). */
function tube(a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material): THREE.Mesh {
  const len = a.distanceTo(b)
  const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), m)
  t.position.copy(a).add(b).multiplyScalar(0.5)
  t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
  return t
}

/**
 * Le visage : les yeux (bleus, pupille, reflet, trait d'eye-liner), les joues rosées, le grain de
 * beauté, et la bouche au rouge à lèvres. Les iris et la bouche passent par les UV du maillage
 * (cloné) ; le reste s'accroche à l'os de la tête, dans le repère du maillage.
 */
function paintFace(headMesh: THREE.SkinnedMesh, head: THREE.Object3D) {
  const geometry = headMesh.geometry.clone()
  const uv = geometry.attributes.uv as THREE.BufferAttribute
  const pos = geometry.attributes.position as THREE.BufferAttribute
  const at = ([cx, cy]: readonly [number, number]) => [(cx + 0.5) / 16, (cy + 0.5) / 16]
  for (let i = 0; i < uv.count; i++) {
    // Traits du visage : la colonne sombre de la palette. Au-dessus de la bouche, les yeux.
    if (Math.floor(uv.getX(i) * 16) !== 1) continue
    const [u, v] = at(pos.getY(i) > 0.45 ? IRIS_CELL : LIPSTICK_CELL)
    uv.setXY(i, u, v)
  }
  headMesh.geometry = geometry

  const face = new THREE.Group()
  face.matrixAutoUpdate = false
  face.matrix.copy(head.matrixWorld).invert().multiply(headMesh.matrixWorld)
  head.add(face)
  const front = 0.1615
  const pupil = new THREE.MeshBasicMaterial({ color: '#0c1733' })
  const shine = new THREE.MeshBasicMaterial({ color: '#ffffff' })
  const liner = new THREE.MeshBasicMaterial({ color: '#15161a' })
  const blush = new THREE.MeshBasicMaterial({ color: '#ff7f9e', transparent: true, opacity: 0.45, depthWrite: false })
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.CircleGeometry(0.0125, 14), pupil)
    eye.position.set(s * 0.072, 0.485, front)
    const glint = new THREE.Mesh(new THREE.CircleGeometry(0.0055, 10), shine)
    glint.position.set(s * 0.072 + 0.007, 0.493, front + 0.0005)
    // Eye-liner en aile, vers l'extérieur ; et trois cils.
    const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.034, 0.006), liner)
    wing.position.set(s * 0.1, 0.507, front)
    wing.rotation.z = s * 0.45
    face.add(eye, glint, wing)
    for (let i = 0; i < 3; i++) {
      const lash = new THREE.Mesh(new THREE.PlaneGeometry(0.004, 0.014), liner)
      lash.position.set(s * (0.058 + i * 0.013), 0.515 + i * 0.001, front)
      lash.rotation.z = -s * (0.25 + i * 0.25)
      face.add(lash)
    }
    const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.02, 14), blush)
    cheek.position.set(s * 0.108, 0.44, front - 0.0005)
    face.add(cheek)
  }
  const mole = new THREE.Mesh(new THREE.CircleGeometry(0.0045, 8), liner)
  mole.position.set(0.058, 0.428, front)
  face.add(mole)
}

/** La coiffe d'infirmière, un peu en arrière sur les boucles, croix rouge sur le devant. */
function addCap(headMesh: THREE.Mesh, head: THREE.Object3D) {
  const hb = boxInBone(headMesh, head)
  const size = hb.getSize(new THREE.Vector3())
  const center = hb.getCenter(new THREE.Vector3())
  const cap = new THREE.Group()
  const white = lambert('#fbfcfd')
  const band = new THREE.Mesh(new RoundedBoxGeometry(size.x * 0.62, size.y * 0.14, size.z * 0.34, 2, 0.012), white)
  const fold = new THREE.Mesh(new RoundedBoxGeometry(size.x * 0.5, size.y * 0.1, size.z * 0.3, 2, 0.01), lambert('#e9eef3'))
  fold.position.set(0, size.y * 0.09, -size.z * 0.05)
  cap.add(band, fold)
  const red = new THREE.MeshBasicMaterial({ color: '#e0263a' })
  const crossFront = size.z * 0.17 + 0.002
  cap.add(new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.016), red).translateZ(crossFront), new THREE.Mesh(new THREE.PlaneGeometry(0.016, 0.05), red).translateZ(crossFront))
  cap.position.set(center.x, hb.max.y - size.y * 0.02, center.z + size.z * 0.12)
  cap.rotation.x = -0.35
  head.add(cap)
}

/**
 * La silhouette : poitrine généreuse sous un décolleté en V, col de la blouse, boutons, jupe
 * évasée à liseré rouge, stéthoscope autour du cou. Repère du torse : le bassin à l'origine, le
 * haut des épaules vers y = 0,21, le devant vers z = 0,14, les flancs à x = ±0,14.
 */
function addDress(torso: THREE.Object3D) {
  const skin = lambert('#efba94')
  const dress = lambert('#f7f9fb')
  const dressSide = lambert('#f7f9fb', { side: THREE.DoubleSide })
  const red = lambert('#d8203a')
  // Décolleté : la peau en V, du col jusqu'entre les seins.
  const v = new THREE.Shape()
  v.moveTo(-0.068, 0.207)
  v.lineTo(0.068, 0.207)
  v.lineTo(0, 0.1)
  v.closePath()
  const neckline = new THREE.Mesh(new THREE.ShapeGeometry(v), skin)
  neckline.position.z = 0.1405
  torso.add(neckline)
  // Col de la blouse, le long du V.
  for (const s of [-1, 1]) {
    const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.008), dress)
    lapel.position.set(s * 0.043, 0.155, 0.143)
    lapel.rotation.z = s * 0.56
    torso.add(lapel)
  }
  // Poitrine : le haut en peau, le bas sous la blouse.
  for (const s of [-1, 1]) {
    const x = s * 0.052, y = 0.112, z = 0.126
    const breast = new THREE.Mesh(new THREE.SphereGeometry(0.056, 16, 12), skin)
    breast.scale.set(1, 0.92, 0.9)
    breast.position.set(x, y, z)
    const cup = new THREE.Mesh(new THREE.SphereGeometry(0.0585, 16, 12, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.6), dress)
    cup.scale.copy(breast.scale)
    cup.position.set(x, y, z)
    torso.add(breast, cup)
  }
  // Boutons, sous la poitrine.
  for (const y of [0.05, 0.022]) {
    const button = new THREE.Mesh(new THREE.SphereGeometry(0.007, 6, 4), lambert('#c9d1da'))
    button.position.set(0, y, 0.142)
    torso.add(button)
  }
  // Jupe évasée, courte : on voit les bas blancs jusqu'aux escarpins.
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.152, 0.19, 0.095, 20, 1, true), dressSide)
  skirt.position.set(0, -0.0175, 0.015)
  skirt.scale.z = 0.86
  torso.add(skirt)
  // Petite croix rouge brodée sur la poche de poitrine (côté gauche, sous le sein).
  const cross = new THREE.Group()
  cross.add(new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.008, 0.004), red), new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.026, 0.004), red))
  cross.position.set(0.09, 0.034, 0.142)
  torso.add(cross)
  // Stéthoscope : tubulure autour du cou, qui descend de part et d'autre de la poitrine.
  const rubber = lambert('#2b2e35')
  const steel = lambert('#c9d1da')
  const neck = [new THREE.Vector3(-0.058, 0.212, 0.1), new THREE.Vector3(0.058, 0.212, 0.1)]
  torso.add(tube(neck[0], neck[1], 0.006, rubber))
  torso.add(tube(neck[0], new THREE.Vector3(-0.124, 0.1, 0.15), 0.006, rubber))
  torso.add(tube(neck[1], new THREE.Vector3(0.122, 0.12, 0.152), 0.006, rubber))
  torso.add(tube(new THREE.Vector3(0.122, 0.12, 0.152), new THREE.Vector3(0.124, 0.07, 0.155), 0.006, rubber))
  const chestPiece = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.01, 14), steel)
  chestPiece.rotation.x = Math.PI / 2
  chestPiece.position.set(0.124, 0.062, 0.159)
  const ear = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), steel)
  ear.position.set(-0.124, 0.095, 0.152)
  torso.add(chestPiece, ear)
}

/** Betty, en blouse, prête à soigner. */
export async function nurseRig() {
  const r = await lookRig(parseLook('human.female.f'))
  const root = r.root
  root.updateMatrixWorld(true)
  const head = root.getObjectByName('head')
  const torso = root.getObjectByName('torso')
  const headMesh = root.getObjectByName('head-mesh') as THREE.SkinnedMesh | undefined
  const bodyMesh = root.getObjectByName('body-mesh') as THREE.SkinnedMesh | undefined
  // Sa palette à elle : les joueurs au même modèle gardent la leur.
  for (const m of [headMesh, bodyMesh]) {
    if (!m) continue
    const src = m.material as THREE.MeshLambertMaterial
    const own = src.clone()
    if (src.map) own.map = bettyTexture(src.map)
    m.material = own
  }
  if (head && headMesh) {
    paintFace(headMesh, head)
    addCap(headMesh, head)
  }
  if (torso) addDress(torso)
  return { ...r, height: r.height + 0.06 }
}

// --------------------------------------------------------------- répliques

/** Ce que l'infirmière sait au moment où on lui parle (cf. main.ts). */
export interface NurseReport {
  /** Système où se trouve le vaisseau. */
  system: string
  /** Consultations de ce joueur avec elle (cf. infirmary.ts). */
  visits: number
  /** Il porte encore son pansement. */
  patched: boolean
}

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]

/** Son métier, son infirmerie, sa vie à bord. */
const DUTY = [
  tr('Bonjour, mon chou ! Vous avez bonne mine. Enfin, pour quelqu\'un qui vit dans une boîte de conserve.', 'Hi there, sugar! You look well. For someone who lives in a tin can, anyway.'),
  tr('Je viens de l\'Ohio. Enfin, de la station Ohio, en orbite autour de Sol. On y cultive du maïs en hydroponie, vous savez.', 'I\'m from Ohio. Well, Ohio Station, in orbit around Sol. They grow hydroponic corn there, you know.'),
  tr('Le sergent Rourke passe me voir trois fois par jour. Il dit que c\'est la ronde. Il n\'a jamais rien. Il reste quand même.', 'Sergeant Rourke drops by three times a day. He says it\'s his patrol. There\'s never anything wrong with him. He stays anyway.'),
  tr('Marcel m\'apporte un café tous les matins. « Pour l\'équipe médicale », qu\'il dit. L\'équipe médicale, c\'est moi.', 'Marcel brings me a coffee every morning. “For the medical team”, he says. The medical team is me.'),
  tr('Mon rouge à lèvres ? « Rouge Achenar », importé de l\'Empire. Il résiste aux casques, aux combinaisons et aux sauts FSD.', 'My lipstick? “Achenar Red”, imported from the Empire. It survives helmets, suits and FSD jumps.'),
  tr('Lavez-vous les mains avant d\'entrer. Oui, vous. Oui, même là.', 'Wash your hands before you come in. Yes, you. Yes, even now.'),
  tr('Le yaourt dans le frigo à vaccins, c\'est le mien. Le premier qui y touche, je lui fais un vaccin. Un gros.', 'The yoghurt in the vaccine fridge is mine. The first one who touches it gets a shot. A big one.'),
  tr('Un pilote de Viper m\'a demandé mon numéro. Je lui ai donné celui des urgences.', 'A Viper pilot asked for my number. I gave him the emergency line.'),
  tr('Le Bacterium Aurasus de la cuve m\'a fait un clin d\'œil hier. Je crois. Il n\'a pas d\'yeux.', 'The Bacterium Aurasus in the tank winked at me yesterday. I think. It doesn\'t have eyes.'),
  tr('Avant, je voulais être pilote. Mais on ne met pas de rouge à lèvres sous un casque. Enfin, pas longtemps.', 'I wanted to be a pilot, once. But you can\'t wear lipstick under a helmet. Not for long, anyway.'),
  tr('Ne courez pas dans les coursives. La dernière fois, quelqu\'un a percuté la porte double. Le sergent, en fait.', 'No running in the corridors. Last time someone ran into the double door. The sergeant, actually.'),
  tr('Le défibrillateur ? Jamais servi. Les cœurs repartent tout seuls quand j\'entre dans la pièce.', 'The defibrillator? Never used it. Hearts start up on their own when I walk in.'),
  tr('Les sucettes, c\'est pour les courageux. Les pleurnicheurs aussi en ont une, remarquez. Tout le monde en a une.', 'The lollipops are for the brave. The crybabies get one too, mind you. Everybody gets one.'),
  tr('Mal au cœur après le ragoût de Marcel ? C\'est normal. Mal au cœur en me voyant ? C\'est normal aussi.', 'Heartburn after Marcel\'s stew? That\'s normal. Heart racing when you see me? That\'s normal too.'),
  tr('Les Thargoïdes, je ne les soigne pas. Mais s\'ils se tiennent bien dans la salle d\'attente, ils auront une sucette.', 'I don\'t treat Thargoids. But if they behave in the waiting room, they get a lollipop.'),
  tr('Comète est venu se faire vacciner. Enfin, il est venu dormir sur le lit trois. J\'ai fait comme si.', 'Comète came in for his shots. Well, he came in to sleep on bed three. I played along.'),
  tr('Moustache, la chatte du labo, a un dossier médical plus épais que le vôtre. Elle mange des cartouches d\'encre.', 'Moustache, the lab cat, has a thicker medical file than yours. She eats ink cartridges.'),
  tr('On m\'appelle « l\'ange de la coursive ». Surtout ceux qui ont encore de la fièvre.', 'They call me “the angel of the corridor”. Mostly the ones still running a fever.'),
]

/** Répliques qui dépendent du bord et des visites du joueur. */
function reportLines(r: NurseReport): string[] {
  const lines = [
    tr(`${r.system} ? Pensez à boire de l'eau. Le mal de l'espace, ça ne prévient pas.`, `${r.system}? Remember to drink water. Space sickness doesn't give warning.`),
  ]
  if (r.patched) lines.push(tr('Gardez ce pansement, mon chou. Il vous va très bien.', 'Keep that plaster on, sugar. It suits you.'))
  if (!r.visits) lines.push(tr('Un petit bobo ? Allongez-vous sur un lit et appelez-moi. Je ne mords pas. Sauf les Thargoïdes.', 'Got a boo-boo? Lie down on a bed and call me. I don\'t bite. Except Thargoids.'))
  else if (r.visits < 5) lines.push(tr(`Déjà ${r.visits} consultation${r.visits > 1 ? 's' : ''}, chéri. Vous avez un lit préféré ?`, `${r.visits} check-up${r.visits > 1 ? 's' : ''} already, honey. Got a favourite bed?`))
  else lines.push(tr(`${r.visits} consultations ! Vous savez, vous pouvez juste venir me dire bonjour.`, `${r.visits} check-ups! You know, you can just come and say hi.`))
  return lines
}

/** Répliques lancées en passant, dans une bulle. */
const BARKS = [
  tr('Au suivant !', 'Next!'),
  tr('Hmm… 72. Parfait.', 'Hmm… 72. Perfect.'),
  tr('Qui a laissé traîner cette seringue ?', 'Who left this syringe lying around?'),
  tr('Ce yaourt est à moi…', 'That yoghurt is mine…'),
  tr('Tout le monde va bien ? Parfait.', 'Everybody feeling fine? Perfect.'),
  tr('On se lave les mains !', 'Hands washed, please!'),
]

// --------------------------------------------------------------- tournée

export class Nurse {
  readonly avatar: Avatar
  readonly root: THREE.Group
  /** Horloge de la tournée (ms de l'appareil) : celle du relais, recalée à chacun de ses messages. */
  private clock: NurseClock = { tau: Date.now() / 1000, at: Date.now(), holdUntil: 0 }
  /** Consultation en cours (ms de l'appareil) : elle reste au chevet du lit `bed` jusque-là. */
  private careUntil = 0
  private careBed = -1
  /** Patient de la consultation (id au relais ; -1 : nous, hors ligne). */
  patient = 0
  /** Pansements du bord : id du joueur -> fin (ms de l'appareil). */
  readonly patched = new Map<number, number>()
  /** Pendant un arrêt : le joueur vers qui elle se tourne. */
  private face: { x: number; z: number } | null = null
  private yaw = 0
  private placed = false
  private stride = 0
  private workIn = 1
  private lastPost = -1
  private barkIn = 18 + Math.random() * 10
  private reactCooldown = 0
  private greeting: { x: number; z: number; until: number } | null = null
  private recent: string[] = []

  onStep?: () => void
  onBark?: (text: string) => void
  /** Un geste de travail (le bruit qui va avec, cf. main.ts). */
  onWork?: (work: NurseWork) => void

  constructor(rig: Awaited<ReturnType<typeof nurseRig>>, readonly deck: Deck) {
    this.avatar = new Avatar(rig)
    this.root = this.avatar.root
    deck.group.add(this.root)
  }

  get position(): THREE.Vector3 {
    return this.root.position
  }

  /** Une consultation est en cours (la nôtre, ou celle d'un autre joueur) : lit, ou -1. */
  get caringBed(): number {
    return Date.now() < this.careUntil ? this.careBed : -1
  }

  /** Arrivée au chevet de la consultation en cours, et à l'arrêt. */
  get atBedside(): boolean {
    const bed = this.caringBed
    if (bed < 0) return false
    const side = NURSE_BEDS[bed].side
    return Math.hypot(this.root.position.x - side.x, this.root.position.z - side.z) < 0.05
  }

  /** Où en est la tournée, d'après le relais (à l'arrivée à bord, quand on lui parle ou qu'on l'appelle). */
  sync(s: NurseState) {
    const now = Date.now()
    this.clock = { tau: s.tau, at: now, holdUntil: now + s.hold * 1000 }
    this.careUntil = now + s.care * 1000
    this.careBed = s.bed
    this.patient = s.patient
    this.face = s.face ?? null
    this.patched.clear()
    for (const [id, secs] of s.patched) this.patched.set(id, now + secs * 1000)
  }

  /** On lui parle : elle s'arrête tout de suite (le relais confirme pour tout le bord) et répond. */
  talk(from: THREE.Vector3, report: NurseReport): string {
    const now = Date.now()
    this.clock = holdNurse(this.clock, now)
    this.face = { x: from.x, z: from.z }
    const pool = Math.random() < 0.45 ? reportLines(report) : DUTY
    const fresh = pool.filter((l) => !this.recent.includes(l))
    const line = pick(fresh.length ? fresh : pool)
    this.recent = [line, ...this.recent].slice(0, 8)
    return line
  }

  /**
   * Le joueur local l'appelle à son lit (`bed`), ou la consultation est finie (-1) : comme le
   * relais, sans attendre sa réponse (et hors ligne, sans relais du tout).
   */
  care(bed: number, patient: number) {
    const now = Date.now()
    const was = this.careBed
    this.careUntil = bed >= 0 ? now + NURSE_CARE * 1000 : 0
    if (bed >= 0) {
      this.careBed = bed
      this.patient = patient
    }
    const at = bed >= 0 ? bed : was
    if (at >= 0) this.clock = careNurse(this.clock, now, this.careUntil, at)
    if (bed < 0) this.patient = 0
  }

  /** Un joueur salue (o7) à côté d'elle : elle répond d'un signe de la main, sans quitter son poste. */
  greet(from: { x: number; z: number }, local: boolean) {
    const p = this.root.position
    if (this.reactCooldown > 0 || Math.hypot(from.x - p.x, from.z - p.z) > 3.5) return
    this.reactCooldown = 8
    this.greeting = { x: from.x, z: from.z, until: Date.now() + 2400 }
    this.avatar.playEmote('salut')
    if (local) this.onBark?.(tr('o7, mon chou !', 'o7, sugar!'))
  }

  /** Un geste de soin, au chevet (cf. infirmary.ts). */
  tend() {
    this.avatar.playEmote('interact')
  }

  /**
   * @param player position du joueur s'il est sur le pont principal, sinon null
   * @param emote emote en cours du joueur (elle répond au salut « o7 », et à la danse)
   */
  update(dt: number, player: THREE.Vector3 | null, emote: string | null) {
    const now = Date.now()
    const p = this.root.position
    const bed = now < this.careUntil ? this.careBed : -1
    const holding = now < this.clock.holdUntil
    const routine = nurseAt(nurseTime(this.clock, now))
    const goal = bed >= 0 ? NURSE_BEDS[bed].side : routine
    this.reactCooldown -= dt

    // Sa place : elle suit sa tournée, ou y revient en contournant les meubles, un peu plus vite
    // qu'elle ne marche pour la rattraper ; trop loin (arrivée à bord), elle y saute.
    const step = nurseStep(p, goal, NURSE_SPEED * NURSE_CATCH_UP * dt)
    let moved = 0
    if (!this.placed || step.left > NURSE_SNAP) {
      p.x = goal.x
      p.z = goal.z
      this.placed = true
    } else {
      p.x = step.x
      p.z = step.z
      moved = step.moved
      if (step.heading !== null) this.yaw = step.heading
    }
    const walking = moved > NURSE_SPEED * 0.3 * dt

    const distPlayer = player ? Math.hypot(player.x - p.x, player.z - p.z) : Infinity
    if (player && emote === 'o7') this.greet(player, true)
    else if (player && emote === 'danse' && distPlayer < 3 && this.reactCooldown <= 0) {
      this.reactCooldown = 30
      this.avatar.playEmote('joie')
      this.onBark?.(tr('Oh, j\'adore cette chanson ! Mais pas dans l\'infirmerie, chéri.', 'Ooh, I love this song! But not in the medical bay, honey.'))
    }

    // Où elle regarde : en marche, devant elle ; au chevet, vers le patient ; à l'arrêt, vers qui
    // lui parle, vers qui la salue, sinon vers son poste.
    if (!walking) {
      const toward = holding && bed < 0 && this.face ? this.face : this.greeting && now < this.greeting.until ? this.greeting : null
      this.yaw = bed >= 0 ? NURSE_BEDS[bed].side.yaw : toward ? Math.atan2(toward.x - p.x, toward.z - p.z) : routine.yaw
    }
    this.avatar.setLocomotion(walking ? 'walk' : 'idle', walking ? NURSE_SPEED : 0)
    if (walking) {
      this.stride += moved
      if (this.stride > 0.28) {
        this.stride = 0
        this.onStep?.()
      }
    }

    // Au travail : un geste de temps en temps (taper au clavier, prendre, vérifier, se laver les mains).
    const atPost = !walking && !holding && bed < 0 && !routine.walking
    if (atPost) {
      const work = NURSE_POSTS[routine.post].work
      if (routine.post !== this.lastPost) {
        this.lastPost = routine.post
        this.workIn = 0.4
      }
      this.workIn -= dt
      if (this.workIn <= 0 && work !== 'look') {
        this.workIn = work === 'fetch' ? 1.8 : 1.2 + Math.random() * 0.6
        this.avatar.playEmote('interact')
        this.onWork?.(work)
      }
    } else if (routine.walking) this.lastPost = -1

    this.barkIn -= dt
    if (this.barkIn <= 0) {
      this.barkIn = 25 + Math.random() * 25
      if (distPlayer < 5 && !holding && bed < 0) this.onBark?.(pick(BARKS))
    }

    this.root.rotation.y = dampAngle(this.root.rotation.y, this.yaw, 8, dt)
    this.avatar.update(dt)
  }
}
