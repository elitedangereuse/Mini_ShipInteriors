import * as THREE from 'three'
import { Avatar } from '../avatar'
import { tr } from '../i18n'
import { boxInBone, suitRig, type SuitStyle } from '../looks'

/*
 * Gaspard, le technicien de la baie : il faisait l'inventaire quand les Thargoïdes sont entrés,
 * et s'est barricadé dans le guichet de sécurité (cf. BAY_BOOTH dans shared/salvage.js). Il n'en
 * sortira pas, et personne n'y entre. Il tremble, il regarde partout, il parle trop : lui parler
 * par l'hygiaphone détend un peu l'atmosphère, et il glisse quelques conseils entre deux
 * crises de nerfs. Il n'existe que dans l'affichage (chaque client a le sien).
 */

export const TECHNICIAN = 'Gaspard'

/** Combinaison grise de la maintenance, bandes réfléchissantes jaunes. */
const TECH_SUIT: SuitStyle = {
  ramp: [[0, '#16181c'], [0.35, '#3b4048'], [0.6, '#6b727c'], [0.85, '#9aa1aa'], [1, '#f2d24a']],
  glove: '#2a2e36',
  helmet: 'none',
  shell: '#3a3f47',
  visor: '#000000',
  light: '#ffd23f',
}

/** Casque de chantier jaune, micro-casque, planchette à pince dans la main. */
function addTechnicianGear(root: THREE.Object3D) {
  const head = root.getObjectByName('head')
  const headMesh = root.getObjectByName('head-mesh') as THREE.Mesh | undefined
  const yellow = new THREE.MeshLambertMaterial({ color: '#f2c230' })
  const dark = new THREE.MeshLambertMaterial({ color: '#23262c' })
  if (head && headMesh) {
    root.updateMatrixWorld(true)
    const hb = boxInBone(headMesh, head)
    const size = hb.getSize(new THREE.Vector3())
    const center = hb.getCenter(new THREE.Vector3())
    // Casque : une calotte et sa visière, un peu de travers (il l'a enfilé en courant).
    const shell = new THREE.Mesh(new THREE.SphereGeometry(size.x * 0.4, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), yellow)
    shell.position.set(center.x, hb.max.y - size.y * 0.12, center.z - size.z * 0.04)
    shell.rotation.z = 0.12
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(size.x * 0.45, size.x * 0.45, size.y * 0.03, 16), yellow)
    brim.position.set(center.x, hb.max.y - size.y * 0.12, center.z + size.z * 0.02)
    brim.rotation.z = 0.12
    // Micro-casque : l'écouteur et la tige du micro devant la bouche.
    const ear = new THREE.Mesh(new THREE.CylinderGeometry(size.x * 0.12, size.x * 0.12, size.x * 0.08, 10), dark)
    ear.rotation.z = Math.PI / 2
    ear.position.set(hb.max.x + size.x * 0.02, center.y, center.z)
    const boom = new THREE.Mesh(new THREE.BoxGeometry(size.x * 0.03, size.x * 0.03, size.z * 0.55), dark)
    boom.position.set(hb.max.x - size.x * 0.05, center.y - size.y * 0.2, center.z + size.z * 0.25)
    boom.rotation.y = -0.35
    const mic = new THREE.Mesh(new THREE.SphereGeometry(size.x * 0.05, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff3b2f' }))
    mic.position.set(center.x + size.x * 0.12, center.y - size.y * 0.22, hb.max.z + size.z * 0.04)
    head.add(shell, brim, ear, boom, mic)
  }
  const torso = root.getObjectByName('torso')
  if (torso) {
    // Planchette serrée contre la poitrine, et un badge.
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.012), new THREE.MeshLambertMaterial({ color: '#8a5a2a' }))
    board.position.set(0.02, 0.02, 0.16)
    board.rotation.x = -0.2
    const paper = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.004), new THREE.MeshLambertMaterial({ color: '#e9e6dc' }))
    paper.position.set(0.02, 0.01, 0.168)
    paper.rotation.x = -0.2
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.004), new THREE.MeshBasicMaterial({ color: '#39d0ff' }))
    badge.position.set(-0.08, 0.1, 0.142)
    torso.add(board, paper, badge)
  }
}

/** Gaspard, prêt à paniquer. */
export async function technicianRig() {
  const r = await suitRig('male', 'b', TECH_SUIT)
  addTechnicianGear(r.root)
  return r
}

// --------------------------------------------------------------- répliques

/** Ce que Gaspard voit de la mission quand on lui parle (cf. client.ts). */
export interface TechnicianReport {
  /** Le joueur porte un colis. */
  carrying: boolean
  /** Distance du Thargoïde le plus proche du guichet (tuiles). */
  danger: number
  delivered: number
  parcels: number
  /** Fusées en poche. */
  flares: number
}

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]

/** Sa vie, sa peur, son guichet. */
const NERVES = [
  tr('Ne tapez pas sur la vitre ! … Pardon. Bonjour. Guichet de sécurité, que puis-je… NON, n\'entrez pas, c\'est fermé.', 'Don\'t knock on the glass! … Sorry. Hello. Security desk, how can I… NO, don\'t come in, it\'s closed.'),
  tr('Je faisais l\'inventaire. Quatre cent douze caisses. Et puis quelque chose est entré, et j\'ai arrêté de compter.', 'I was doing the inventory. Four hundred and twelve crates. Then something came in, and I stopped counting.'),
  tr('Cette vitre résiste à un tir de laser pulsé. Je l\'ai lu sur la notice. Je relis la notice toutes les dix minutes.', 'This glass stops a pulse laser. I read it in the manual. I reread the manual every ten minutes.'),
  tr('J\'ai des biscuits, de l\'eau et un rapport d\'incident de quarante pages. Je vais bien. Très bien. Tout va bien.', 'I have biscuits, water and a forty-page incident report. I\'m fine. Very fine. Everything is fine.'),
  tr('Vous entendez ce chant ? On dirait une baleine qui aurait avalé une ventilation. Je n\'en dors plus.', 'Hear that singing? Like a whale that swallowed an air vent. I can\'t sleep any more.'),
  tr('Mon contrat disait « poste calme, au chaud, avec vue ». La vue, c\'est eux.', 'My contract said “quiet job, warm, with a view”. The view is them.'),
  tr('Si vous voyez ma tasse dans la salle de pause, laissez-la. Elle est à moi. C\'est tout ce qui me reste.', 'If you see my mug in the break room, leave it. It\'s mine. It\'s all I have left.'),
  tr('Je ne sors pas. On m\'a dit « quoi qu\'il arrive, restez au guichet ». Il est arrivé quoi. J\'y reste.', 'I\'m not coming out. They said “whatever happens, stay at the desk”. Whatever happened. I\'m staying.'),
  tr('J\'ai rempli le formulaire B-12 « Présence xénomorphe ». Il faut le tamponner à l\'accueil. L\'accueil, c\'est moi. Je n\'ose pas.', 'I filled in form B-12 “Xenomorph presence”. It needs a stamp from reception. I am reception. I don\'t dare.'),
  tr('Le gyrophare tourne depuis trois jours. Je l\'aime bien, maintenant. Il s\'appelle Roger.', 'The beacon\'s been spinning for three days. I like it now. His name is Roger.'),
  tr('Respirez avec moi. Inspirez… Expirez… AH ! … Non, c\'était mon reflet.', 'Breathe with me. In… Out… AH! … No, that was my reflection.'),
  tr('Nico, du hangar, m\'avait promis de venir me chercher avec la Princesse. Dites-lui que j\'attends. Poliment.', 'Nico from the hangar promised to come get me in the Princess. Tell him I\'m waiting. Politely.'),
  tr('Le chef Marcel me doit un gratin. S\'il vous plaît, ramenez les colis, que je puisse rentrer manger mon gratin.', 'Chef Marcel owes me a gratin. Please bring the crates back so I can go home and eat my gratin.'),
  tr('J\'ai compté les casiers. Il y en a assez pour tout le monde. Sauf pour moi. Moi, j\'ai le guichet.', 'I counted the lockers. There\'s enough for everyone. Except me. I have the desk.'),
]

/** Des conseils, entre deux frissons. */
const TIPS = [
  tr('Conseil de sécurité numéro un : ne courez pas. Ils entendent tout. Conseil numéro deux : COUREZ s\'ils vous voient.', 'Safety tip number one: don\'t run. They hear everything. Tip number two: RUN if they see you.'),
  tr('Les casiers ! Dans un casier, ils vous perdent. Sauf s\'ils vous soufflent dans le cou quand vous entrez. Prenez un peu d\'avance.', 'Lockers! In a locker, they lose you. Unless they\'re breathing down your neck when you get in. Get a head start.'),
  tr('Les fusées rouges, ils adorent. Lancez-en une loin de vous, et ils y courent comme des papillons. De gros papillons.', 'They love the red flares. Throw one away from you and they run to it like moths. Big moths.'),
  tr('Le sas d\'extraction, au sud : ils n\'y entrent pas. C\'est écrit dans le règlement. Eux, ils l\'ont lu.', 'The extraction airlock, to the south: they don\'t go in. It\'s in the rules. They read them.'),
  tr('Le petit bip de votre détecteur, c\'est un colis tout près. Le grand chant grave, c\'est eux. Ne confondez pas.', 'The little beep of your detector is a crate nearby. The deep singing is them. Don\'t mix them up.'),
  tr('Les colis, c\'est lourd. Avec un colis sur le dos, vous traînez. Prévoyez le chemin du retour avant de le ramasser.', 'Crates are heavy. With one on your back, you drag. Plan the way back before you pick it up.'),
]

function reportLines(r: TechnicianReport): string[] {
  const lines: string[] = []
  if (r.danger < 4) {
    lines.push(
      tr('Chut… chut chut chut… il est juste là… ne bougez pas… ne respirez pas… respirez un peu quand même.', 'Shh… shh shh shh… it\'s right there… don\'t move… don\'t breathe… breathe a little, actually.'),
      tr('IL EST DERRIÈRE VOUS ! … Non. Si. Je ne sais pas, il fait noir, allez-vous-en !', 'IT\'S BEHIND YOU! … No. Yes. I don\'t know, it\'s dark, go away!'),
    )
  }
  if (r.carrying) {
    lines.push(
      tr('Vous l\'avez ! Le colis ! Au sas, vite ! Enfin, pas vite. Doucement. Mais vite. Vous voyez l\'idée.', 'You got it! The crate! To the airlock, quick! Well, not quick. Quietly. But quick. You get the idea.'),
      tr('Numéro de série… vérifié. Tampon… je n\'ai plus d\'encre. Allez, filez, je vous fais confiance.', 'Serial number… checked. Stamp… I\'m out of ink. Go on, off you go, I trust you.'),
    )
  }
  if (r.delivered > 0 && r.delivered < r.parcels) {
    lines.push(tr(`${r.delivered} sur ${r.parcels} ! On y arrive ! Je coche ma liste. Ça me calme, de cocher.`, `${r.delivered} of ${r.parcels}! We\'re getting there! I\'m ticking my list. Ticking calms me down.`))
  }
  if (!r.flares) lines.push(tr('Pas de fusée ? Il en traîne partout, des caisses entières se sont renversées. Ramassez, ramassez !', 'No flares? They\'re lying everywhere, whole crates got knocked over. Pick them up!'))
  return lines
}

/** Gaspard derrière sa vitre : il tremble, il regarde partout, il sursaute, il parle. */
export class Technician {
  readonly avatar: Avatar
  readonly root: THREE.Group
  private time = Math.random() * 10
  private startle = 0
  private startleIn = 4 + Math.random() * 6
  private recent: string[] = []
  private readonly baseYaw: number

  constructor(rig: Awaited<ReturnType<typeof technicianRig>>, at: { x: number; z: number }, yaw: number) {
    this.avatar = new Avatar(rig)
    this.root = this.avatar.root
    this.root.position.set(at.x, 0, at.z)
    this.baseYaw = yaw
    this.root.rotation.y = yaw
  }

  /** Une réplique (pas deux fois la même de suite), selon la mission ; il sursaute en parlant. */
  talk(report: TechnicianReport): string {
    const pool = [...reportLines(report), ...reportLines(report), ...NERVES, ...TIPS].filter((l) => !this.recent.includes(l))
    const line = pick(pool.length ? pool : NERVES)
    this.recent = [...this.recent, line].slice(-6)
    this.avatar.playEmote(report.danger < 4 ? 'non' : pick(['non', 'oui', 'salut']))
    return line
  }

  /** `danger` : distance du Thargoïde le plus proche (il tremble plus fort quand il approche). */
  update(dt: number, danger: number) {
    this.time += dt
    const fear = THREE.MathUtils.clamp(1 - danger / 7, 0, 1)
    // Il regarde partout, de plus en plus vite quand l'un d'eux approche ; parfois il sursaute.
    if ((this.startleIn -= dt) <= 0) {
      this.startle = 0.45
      this.startleIn = (fear > 0.4 ? 2 : 6) + Math.random() * 6
    }
    this.startle = Math.max(0, this.startle - dt)
    const look = Math.sin(this.time * (0.9 + fear * 2.2)) * 0.7 + Math.sin(this.time * 2.3) * 0.15
    const jolt = this.startle > 0 ? Math.sin(this.startle * 40) * 0.25 : 0
    this.root.rotation.y = this.baseYaw + look * 0.8 + jolt
    // Tremblement, et le petit saut du sursaut.
    const shake = 0.004 + fear * 0.01
    this.root.position.y = Math.abs(Math.sin(this.time * 31)) * shake + (this.startle > 0.3 ? (this.startle - 0.3) * 0.25 : 0)
    this.avatar.update(dt)
  }

  dispose() {
    this.root.removeFromParent()
  }
}
