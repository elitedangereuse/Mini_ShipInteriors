import * as THREE from 'three'
import { Avatar } from './avatar'
import type { Deck } from './deck'
import { markerMaterial } from './economy/tasks'
import { beamMaterial } from './furniture/kit'
import { tr } from './i18n'
import { icon, type IconName } from './icons'
import type { LevelDef } from './levels'
import { suitRig, type SuitStyle } from './looks'
import { dampAngle } from './player'
import { TUTORIAL_CLOSED, TUTORIAL_LAYOUT, TUTORIAL_LEVEL, TUTORIAL_TELEPORTER } from '../shared/tutorial.js'

/*
 * Le simulateur d'accueil (cf. shared/tutorial.js) : à sa toute première venue à bord, la recrue
 * s'y réveille, seule dans son instance. Le lieutenant Swann, l'instructrice, lui apprend les
 * gestes de base, une leçon après l'autre : marcher, courir, regarder autour de soi, examiner,
 * s'asseoir, saluer, discuter. Chaque leçon réussie ouvre la suite ; la dernière ouvre le
 * téléporteur, qui la dépose sur le pont principal (cf. main.ts). On peut passer la formation à
 * tout moment, et la refaire avec /tuto.
 */

/** L'instructrice. */
export const INSTRUCTOR = tr('Lt Swann', 'Lt Swann')

/** Combinaison de vol de l'instructrice : bleu nuit, liserés cyan du simulateur. */
const INSTRUCTOR_SUIT: SuitStyle = {
  ramp: [[0, '#0b111d'], [0.4, '#18253b'], [0.74, '#2c4669'], [0.87, '#39d0ff'], [1, '#e6fbff']],
  glove: '#141b26',
  helmet: 'none',
  shell: '#2c4669',
  visor: '#000000',
  light: '#39d0ff',
}

export function instructorRig() {
  return suitRig('female', 'a', INSTRUCTOR_SUIT)
}

/** Grille cyan, panneaux holographiques, sol argenté : une salle d'entraînement hors du temps. */
export const TUTORIAL_DECK: LevelDef = {
  id: TUTORIAL_LEVEL,
  name: tr('Simulateur d\'accueil', 'Welcome simulator'),
  theme: 'station',
  tutorial: true,
  mapOptions: { closed: TUTORIAL_CLOSED },
  ambience: { sky: '#8fb4e6', ground: '#0b1426', hemi: 1.15, sun: '#e6f6ff', sunIntensity: 1.5 },
  layout: TUTORIAL_LAYOUT,
  rooms: {
    a: tr('Sas d\'accueil', 'Welcome airlock'),
    b: tr('Salle d\'essai', 'Practice room'),
    t: tr('Téléporteur', 'Teleporter'),
  },
  floors: { a: 'floor-panel', b: 'floor-panel', t: 'floor-detail' },
  floorFinish: { a: 'silver', b: 'silver', t: 'silver' },
  windows: { a: 0, b: 0, t: 0 },
  closed: {
    b: tr('Porte verrouillée : le lieutenant Swann l\'ouvrira à la fin de la leçon.', 'Locked door: Lt Swann will open it at the end of the lesson.'),
    t: tr('Le téléporteur s\'ouvre à la fin de la formation.', 'The teleporter opens at the end of the training.'),
  },
  props: [
    // Le sas d'accueil : se déplacer, courir, regarder.
    { model: 'sim-grid', x: 3.5, z: 2.5, label: '8x6', solid: false },
    { model: 'sim-sign', x: 2, z: -0.3, label: tr('SIMULATEUR|Bienvenue à bord, recrue|Suivez l\'instructrice', 'SIMULATOR|Welcome aboard, recruit|Follow the instructor'), solid: false },
    { model: 'sim-sign', x: 5.5, z: -0.3, label: tr('LEÇON 1|Marcher, courir|Regarder autour de soi', 'LESSON 1|Walk, run|Look around'), solid: false },
    { model: 'plant', x: 0.1, z: 0.1 },
    { model: 'plant', x: 7.1, z: 5.1 },
    // La salle d'essai : examiner, s'asseoir, saluer, discuter.
    { model: 'sim-grid', x: 11, z: 2.5, label: '7x6', solid: false },
    { model: 'sim-sign', x: 9, z: -0.3, label: tr('LEÇON 2|Examiner, s\'asseoir|Saluer, discuter', 'LESSON 2|Examine, sit|Salute, chat'), solid: false },
    {
      model: 'side-console', x: 11.6, z: 0.05, label: 'scan', action: tr('Examiner', 'Examine'),
      interact: [
        tr('Console d\'entraînement : « Système nominal. Recrue : prometteuse. Café : insuffisant. »', 'Training console: “Systems nominal. Recruit: promising. Coffee: insufficient.”'),
        tr('Console d\'entraînement : « Dernière recrue : a confondu l\'ascenseur et le placard à balais. Note : 12/20. »', 'Training console: “Last recruit: mistook the lift for the broom cupboard. Score: 12/20.”'),
      ],
    },
    { model: 'sofa', x: 11, z: 4.82, rot: 2, label: 'teal' },
    { model: 'plant', x: 8.1, z: 5.1 },
    { model: 'plant', x: 14.1, z: 0.1 },
    // Le téléporteur, vers le pont principal.
    { model: 'sim-grid', x: 16.5, z: 2.5, label: '4x4', solid: false },
    { model: 'sim-sign', x: 16.5, z: 0.7, label: tr('TÉLÉPORTEUR|Destination :|Pont principal', 'TELEPORTER|Destination:|Main deck'), solid: false },
    {
      model: 'sim-teleporter', x: TUTORIAL_TELEPORTER.x, z: TUTORIAL_TELEPORTER.z, solid: false, action: tr('Se téléporter', 'Teleport'),
      // Remplacé par le départ (cf. main.ts) : il en faut un pour qu'on puisse s'en servir.
      interact: tr('Le téléporteur bourdonne doucement.', 'The teleporter hums softly.'),
    },
  ],
  lights: [
    [3.5, 2.5, '#bfeaff', 1.3],
    [11, 2.5, '#bfeaff', 1.2],
    [TUTORIAL_TELEPORTER.x, TUTORIAL_TELEPORTER.z, '#39d0ff', 1.6, 'neon', 5],
  ],
}

// --------------------------------------------------------------- l'instructrice

const WALK_SPEED = 1.5

/** L'instructrice : elle attend à son poste, tournée vers la recrue, et la précède d'une salle à l'autre. */
export class Instructor {
  readonly avatar: Avatar
  readonly root: THREE.Group
  private path: { x: number; z: number }[] = []
  private yaw = 0
  private stride = 0
  /** Un pas (le bruit de ses bottes). */
  onStep?: () => void

  constructor(rig: Awaited<ReturnType<typeof instructorRig>>, readonly deck: Deck) {
    this.avatar = new Avatar(rig)
    this.root = this.avatar.root
    deck.group.add(this.root)
  }

  get position(): THREE.Vector3 {
    return this.root.position
  }

  get walking(): boolean {
    return this.path.length > 0
  }

  /** Tout de suite à sa place (au début de la formation). */
  place(x: number, z: number, yaw = -Math.PI / 2) {
    this.path = []
    this.root.position.set(x, 0, z)
    this.yaw = yaw
    this.root.rotation.y = yaw
  }

  /** Elle va à (x, z), par le chemin le plus court (les portes s'ouvrent devant elle). */
  walkTo(x: number, z: number) {
    const p = this.root.position
    const tiles = this.deck.pathfinder.find({ x: Math.round(p.x), z: Math.round(p.z) }, { x: Math.round(x), z: Math.round(z) }, false)
    this.path = [...(tiles?.slice(1, -1) ?? []), { x, z }]
  }

  emote(id: string) {
    this.avatar.playEmote(id)
  }

  /** @param look ce qu'elle regarde à l'arrêt (la recrue) */
  update(dt: number, look: THREE.Vector3 | null) {
    const p = this.root.position
    const next = this.path[0]
    let speed = 0
    if (next) {
      const dx = next.x - p.x, dz = next.z - p.z
      const d = Math.hypot(dx, dz)
      const step = Math.min(d, WALK_SPEED * dt)
      if (d > 1e-4) {
        p.x += (dx / d) * step
        p.z += (dz / d) * step
        this.yaw = Math.atan2(dx, dz)
      }
      if (d - step < 0.05) this.path.shift()
      speed = WALK_SPEED
      this.stride += step
      if (this.stride > 0.32) {
        this.stride = 0
        this.onStep?.()
      }
    } else if (look && Math.hypot(look.x - p.x, look.z - p.z) < 7) {
      this.yaw = Math.atan2(look.x - p.x, look.z - p.z)
    }
    this.root.rotation.y = dampAngle(this.root.rotation.y, this.yaw, 10, dt)
    this.avatar.setLocomotion(speed ? 'walk' : 'idle', speed)
    this.avatar.update(dt)
  }
}

// --------------------------------------------------------------- les leçons

/** Ce qu'on a en main : les consignes en tiennent compte. */
export type Controls = 'keyboard' | 'gamepad' | 'touch'

type LessonId = 'move' | 'run' | 'camera' | 'examine' | 'sit' | 'emote' | 'chat' | 'teleport'

interface Lesson {
  id: LessonId
  /** Intitulé court, dans la liste du panneau. */
  title: string
  icon: IconName
  /** Ce que dit l'instructrice en ouvrant la leçon. */
  intro: string
  /** Comment faire, selon les commandes (`[X]` : une touche). */
  how: Record<Controls, string>
  /** Où se tient l'instructrice pendant la leçon. */
  post: { x: number; z: number }
  /** Ce qu'elle dit quand c'est réussi. */
  praise: string
}

/** Les deux repères de la course : l'un, puis l'autre. */
const BEACONS = [{ x: 6, z: 1 }, { x: 1, z: 5 }]

const LESSONS: Lesson[] = [
  {
    id: 'move',
    title: tr('Se déplacer', 'Move'),
    icon: 'footprints',
    intro: tr(
      'Bienvenue à bord, recrue ! Lieutenant Swann, chargée de l\'accueil. Ici, c\'est le simulateur : rien ne casse, personne ne regarde. Marchez jusqu\'au repère lumineux.',
      'Welcome aboard, recruit! Lieutenant Swann, in charge of new arrivals. This is the simulator: nothing breaks, nobody watches. Walk to the glowing marker.',
    ),
    how: {
      keyboard: tr('[Z][Q][S][D], [W][A][S][D] ou les flèches pour marcher. Un clic sur le sol vous y mène aussi.', '[W][A][S][D], [Z][Q][S][D] or the arrow keys to walk. Clicking the floor takes you there too.'),
      gamepad: tr('Stick gauche ou croix directionnelle pour marcher.', 'Left stick or D-pad to walk.'),
      touch: tr('Le joystick, à gauche, pour marcher. Toucher le sol vous y mène aussi.', 'The joystick, on the left, to walk. Touching the floor takes you there too.'),
    },
    post: { x: 3, z: 3 },
    praise: tr('Parfait. Vous marchez comme un vrai commandant.', 'Perfect. You walk like a real commander.'),
  },
  {
    id: 'run',
    title: tr('Courir', 'Run'),
    icon: 'person-simple-run',
    intro: tr('Maintenant, courez jusqu\'à l\'autre repère. À bord, on court beaucoup. Surtout vers le mess.', 'Now run to the other marker. Aboard, we run a lot. Mostly to the mess hall.'),
    how: {
      keyboard: tr('Maintenez [Maj] en marchant pour courir (avec le sprint auto, on court sans rien maintenir).', 'Hold [Shift] while walking to run (with auto-sprint on, you run without holding anything).'),
      gamepad: tr('Maintenez [L3] (clic du stick gauche) pour courir.', 'Hold [L3] (left stick click) to run.'),
      touch: tr('Poussez le joystick à fond pour courir.', 'Push the joystick all the way to run.'),
    },
    post: { x: 3.5, z: 3 },
    praise: tr('Quelle pointe de vitesse ! Marcel vous embauchera pour le service de midi.', 'What a sprint! Marcel will hire you for the lunch rush.'),
  },
  {
    id: 'camera',
    title: tr('Regarder autour de soi', 'Look around'),
    icon: 'arrows-clockwise',
    intro: tr('Le vaisseau est grand, et il y a toujours un coin caché derrière un mur. Faites pivoter la vue, puis zoomez.', 'The ship is big, and there\'s always a corner hidden behind a wall. Rotate the view, then zoom.'),
    how: {
      keyboard: tr('[R] pivote la vue d\'un quart de tour, la molette zoome. Clic droit maintenu : caméra libre.', '[R] rotates the view a quarter turn, the mouse wheel zooms. Hold right-click: free camera.'),
      gamepad: tr('[LB] et [RB] pivotent la vue, les gâchettes zooment, le stick droit tourne la caméra.', '[LB] and [RB] rotate the view, the triggers zoom, the right stick turns the camera.'),
      touch: tr('Glissez un doigt sur le décor pour tourner la vue ; écartez deux doigts pour zoomer.', 'Drag one finger across the scene to turn the view; spread two fingers to zoom.'),
    },
    post: { x: 4, z: 2.5 },
    praise: tr('Voilà : rien ne vous échappe. La porte est ouverte, suivez-moi.', 'There: nothing escapes you. The door is open, follow me.'),
  },
  {
    id: 'examine',
    title: tr('Examiner', 'Examine'),
    icon: 'magnifying-glass',
    intro: tr('À bord, presque tout s\'examine : meubles, panneaux, gens. Allez voir cette console.', 'Aboard, almost everything can be examined: furniture, panels, people. Go and look at that console.'),
    how: {
      keyboard: tr('Approchez-vous : une invite s\'affiche. [E] (ou un clic sur l\'objet) pour interagir.', 'Get close: a prompt appears. [E] (or click the object) to interact.'),
      gamepad: tr('Approchez-vous : une invite s\'affiche. [A / ×] pour interagir.', 'Get close: a prompt appears. [A / ×] to interact.'),
      touch: tr('Touchez la console, ou le bouton main quand l\'invite s\'affiche.', 'Touch the console, or the hand button when the prompt appears.'),
    },
    post: { x: 10, z: 2 },
    praise: tr('Bien. Gardez l\'œil curieux : les meilleures blagues du bord sont écrites en petit.', 'Good. Stay curious: the best jokes aboard are in the small print.'),
  },
  {
    id: 'sit',
    title: tr('S\'asseoir, se relever', 'Sit, stand up'),
    icon: 'armchair',
    intro: tr('Asseyez-vous sur le canapé, puis relevez-vous. Oui, ça fait partie de la formation : on s\'assoit beaucoup, ici.', 'Sit on the sofa, then stand up. Yes, it\'s part of the training: we sit a lot around here.'),
    how: {
      keyboard: tr('[E] près du canapé pour vous asseoir ; un pas, ou [E] encore, pour vous relever.', '[E] near the sofa to sit; one step, or [E] again, to stand up.'),
      gamepad: tr('[A / ×] près du canapé pour vous asseoir ; le stick, ou [A / ×] encore, pour vous relever.', '[A / ×] near the sofa to sit; the stick, or [A / ×] again, to stand up.'),
      touch: tr('Touchez le canapé pour vous y asseoir ; la flèche, ou le joystick, pour vous relever.', 'Touch the sofa to sit on it; the arrow, or the joystick, to stand up.'),
    },
    post: { x: 13, z: 3 },
    praise: tr('Impeccable. Chaises, lits, bornes d\'arcade, siège du pilote : tout marche pareil.', 'Spotless. Chairs, beds, arcade cabinets, the pilot\'s seat: they all work the same way.'),
  },
  {
    id: 'emote',
    title: tr('Saluer', 'Salute'),
    icon: 'o7',
    intro: tr('À bord, on se salue. Faites-moi le salut des commandants : o7.', 'Aboard, we salute each other. Give me the commanders\' salute: o7.'),
    how: {
      keyboard: tr('Les touches [1] à [8] jouent les emotes, [8] : le salut o7. La barre du bas aussi.', 'Keys [1] to [8] play emotes, [8]: the o7 salute. The bar at the bottom too.'),
      gamepad: tr('La barre d\'emotes, en bas de l\'écran : le salut o7.', 'The emote bar, at the bottom of the screen: the o7 salute.'),
      touch: tr('Le bouton au sourire, puis le salut o7.', 'The smiley button, then the o7 salute.'),
    },
    post: { x: 12, z: 2.5 },
    praise: tr('o7, commandant ! Voilà qui est réglementaire.', 'o7, commander! Now that\'s by the book.'),
  },
  {
    id: 'chat',
    title: tr('Discuter', 'Chat'),
    icon: 'chat-circle-dots',
    intro: tr('Pour parler à l\'équipage, il y a le chat. Dites-moi quelque chose. Ici, je suis seule à vous entendre.', 'To talk to the crew, there\'s the chat. Say something to me. In here, I\'m the only one listening.'),
    how: {
      keyboard: tr('[Entrée] ouvre le chat ; écrivez, puis [Entrée] pour envoyer.', '[Enter] opens the chat; type, then [Enter] to send.'),
      gamepad: tr('[Entrée] au clavier ouvre le chat ; écrivez, puis [Entrée] pour envoyer.', '[Enter] on the keyboard opens the chat; type, then [Enter] to send.'),
      touch: tr('Touchez la bulle du chat, écrivez, puis envoyez.', 'Touch the chat bubble, type, then send.'),
    },
    post: { x: 12, z: 2.5 },
    praise: tr('Reçu cinq sur cinq. À bord, tout l\'équipage vous lira, dans une bulle au-dessus de votre tête.', 'Loud and clear. Aboard, the whole crew will read you, in a bubble above your head.'),
  },
  {
    id: 'teleport',
    title: tr('Rejoindre le bord', 'Join the crew'),
    icon: 'sparkle',
    intro: tr('Formation terminée ! Le téléporteur, à côté, vous dépose sur le pont principal. Ensuite, l\'ascenseur vous mène partout.', 'Training complete! The teleporter, next door, drops you on the main deck. From there, the lift takes you everywhere.'),
    how: {
      keyboard: tr('Passez la porte, montez sur le téléporteur et activez-le avec [E].', 'Go through the door, step onto the teleporter and activate it with [E].'),
      gamepad: tr('Passez la porte, montez sur le téléporteur et activez-le avec [A / ×].', 'Go through the door, step onto the teleporter and activate it with [A / ×].'),
      touch: tr('Passez la porte, puis touchez le téléporteur.', 'Go through the door, then touch the teleporter.'),
    },
    post: { x: 13.6, z: 1.6 },
    praise: '',
  },
]

/** Ce qu'il faut au simulateur pour faire son travail (cf. main.ts). */
export interface TutorialHost {
  deck: Deck
  instructor: Instructor
  /** Position du joueur (sur le pont du simulateur). */
  player: THREE.Vector3
  /** Ce qu'on a en main, pour les consignes. */
  controls(): Controls
  /** Cadrage de la caméra : son azimut visé et son zoom. */
  camera(): { heading: number; zoom: number }
  /** Le joueur est-il installé sur un meuble ? */
  seated(): boolean
  /** L'instructrice parle (bulle au-dessus de sa tête). */
  say(text: string): void
  /** Bruitages : une leçon réussie, une porte qui s'ouvre. */
  sound(kind: 'done' | 'open'): void
  /** Formation finie (ou passée) : au téléporteur. */
  finish(skipped: boolean): void
}

/** Le simulateur et sa formation. */
export class Tutorial {
  /** Formation en cours. */
  active = false
  private lesson = 0
  /** Repère du moment (marcher, courir), et compteur des pas de course. */
  private beacon = 0
  private sprintSteps = 0
  /** Leçon de la caméra : déjà pivoté, déjà zoomé. */
  private turned = false
  private zoomed = false
  private cameraFrom = { heading: 0, zoom: 0 }
  /** Leçon du canapé : déjà assis. */
  private sat = false
  /** Une leçon réussie : la suivante attend un instant (`pause`), le temps de la féliciter. */
  private waiting = false
  private pause = 0
  /** Second clic sur « Passer » : confirmé. */
  private skipArmed = 0
  private line = ''
  private panelKey = ''
  private readonly panel = document.getElementById('tutorial')!
  /** Repère au sol (anneau et colonne de lumière) et icône flottante au-dessus de l'objectif. */
  private readonly ring: THREE.Group
  private readonly marker = new THREE.Sprite()
  private readonly beam = beamMaterial()

  constructor(private readonly host: TutorialHost) {
    this.ring = new THREE.Group()
    const torus = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.025, 6, 40), new THREE.MeshBasicMaterial({ color: '#39d0ff', transparent: true, opacity: 0.9 }))
    torus.rotation.x = Math.PI / 2
    torus.position.y = 0.03
    this.beam.uniforms.uColor.value.set('#39d0ff')
    this.beam.uniforms.uIntensity.value = 0.55
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 1.4, 24, 1, true), this.beam)
    column.position.y = 0.72
    this.ring.add(torus, column)
    this.ring.visible = false
    this.marker.scale.setScalar(0.34)
    this.marker.renderOrder = 4
    this.marker.visible = false
    host.deck.group.add(this.ring, this.marker)
    this.panel.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-skip]')) this.skip()
    })
  }

  private get current(): Lesson {
    return LESSONS[this.lesson]
  }

  /** La formation commence (ou recommence) : portes fermées, instructrice à son poste. */
  start() {
    const { deck, instructor } = this.host
    this.active = true
    this.lesson = 0
    this.pause = 0
    this.skipArmed = 0
    deck.setRoomOpen('b', false)
    deck.setRoomOpen('t', false)
    instructor.place(LESSONS[0].post.x, LESSONS[0].post.z, -Math.PI / 2)
    this.open(0)
    instructor.emote('salut')
  }

  /** On quitte le simulateur (téléporté, ou parti autrement) : plus de panneau ni de repère. */
  stop() {
    this.active = false
    this.panel.hidden = true
    this.panelKey = ''
    this.ring.visible = this.marker.visible = false
  }

  /** L'instructrice redit la consigne (on lui parle). */
  talk(): string {
    if (!this.active) return tr('Bon vol, commandant. o7', 'Fly safe, commander. o7')
    this.host.instructor.emote('salut')
    return this.line || this.current.intro
  }

  /** Un pas, en courant ou non (cf. Player.onStep). */
  stepped(sprint: boolean) {
    if (this.active && this.current.id === 'run' && sprint) this.sprintSteps++
  }

  /** On a examiné la console. */
  examined() {
    if (this.active && this.current.id === 'examine') this.done()
  }

  /** Une emote (o7 attendu, mais toute emote est un salut). */
  emoted(id: string) {
    if (!this.active || this.current.id !== 'emote') return
    if (id === 'o7') this.host.instructor.emote('o7')
    else this.speak(tr('Pas mal ! Le salut réglementaire, c\'est o7, mais je vous l\'accorde.', 'Not bad! The regulation salute is o7, but I\'ll allow it.'))
    this.done(id === 'o7' ? undefined : '')
  }

  /** Un message au chat : elle seule l'entend, et elle répond. */
  chatted() {
    if (this.active && this.current.id === 'chat') this.done()
  }

  /** Le téléporteur : actif à la dernière leçon seulement. */
  teleport(): string | null {
    if (!this.active || this.current.id === 'teleport') {
      this.host.finish(false)
      return null
    }
    return tr('Le téléporteur est en veille : finissez d\'abord la formation.', 'The teleporter is on standby: finish the training first.')
  }

  /** Passer la formation : un premier clic arme, le second confirme. */
  skip() {
    if (!this.active) return
    if (this.skipArmed <= 0) {
      this.skipArmed = 4
      this.panelKey = ''
      return
    }
    this.host.finish(true)
  }

  private speak(text: string) {
    this.line = text
    this.host.say(text)
    this.panelKey = ''
  }

  /** Ouvre la leçon `i` : l'instructrice va à son poste et l'annonce, le repère se place. */
  private open(i: number) {
    this.lesson = i
    const l = this.current
    this.sprintSteps = 0
    this.turned = this.zoomed = false
    this.cameraFrom = this.host.camera()
    this.sat = false
    this.beacon = 0
    const p = this.host.instructor.position
    if (Math.hypot(p.x - l.post.x, p.z - l.post.z) > 0.1) this.host.instructor.walkTo(l.post.x, l.post.z)
    this.speak(l.intro)
    this.aim()
  }

  /** Le repère de la leçon : un anneau au sol pour marcher et courir, une icône au-dessus de l'objet sinon. */
  private aim() {
    const l = this.current
    const { deck } = this.host
    this.ring.visible = l.id === 'move' || l.id === 'run'
    if (this.ring.visible) {
      const b = l.id === 'move' ? BEACONS[0] : BEACONS[1 - (this.beacon % 2)]
      this.ring.position.set(b.x, 0, b.z)
      this.marker.material = markerMaterial(l.icon, '#39d0ff')
      this.marker.position.set(b.x, 1.5, b.z)
      this.marker.visible = true
      return
    }
    const model = l.id === 'examine' ? 'side-console' : l.id === 'sit' ? 'sofa' : l.id === 'teleport' ? 'sim-teleporter' : null
    const item = model && deck.interactables.find((it) => it.furniture?.model === model)
    this.marker.visible = !!item
    if (item) {
      this.marker.material = markerMaterial(l.icon, '#39d0ff')
      this.marker.position.set(item.position.x, 1.32, item.position.z)
    }
  }

  /** Leçon réussie : bravo (`praise` : autre chose à dire, '' : rien de plus), puis la suite. */
  private done(praise?: string) {
    const l = this.current
    const text = praise ?? l.praise
    if (text) this.speak(text)
    this.host.instructor.emote(l.id === 'emote' ? 'o7' : 'oui')
    this.host.sound('done')
    this.ring.visible = this.marker.visible = false
    // La caméra ouvre la salle d'essai ; la conversation, le téléporteur.
    if (l.id === 'camera') this.unlock('b')
    if (l.id === 'chat') this.unlock('t')
    // La leçon suivante s'ouvre au bout de la pause (cf. update) ; d'ici là, rien ne compte.
    this.pause = text ? 2.6 : 1.4
    this.waiting = true
    this.panelKey = ''
  }

  private unlock(room: string) {
    const { deck } = this.host
    deck.setRoomOpen(room, true)
    // Ouvrir une pièce ouvre toutes ses portes : le téléporteur reste fermé jusqu'à la fin.
    if (room === 'b') deck.setRoomOpen('t', false)
    this.host.sound('open')
  }

  update(dt: number) {
    if (!this.active) return
    const { player, instructor } = this.host
    instructor.update(dt, player)
    const t = performance.now() / 1000
    if (this.ring.visible) {
      this.beam.uniforms.uTime.value = t
      this.ring.scale.setScalar(1 + Math.sin(t * 4) * 0.06)
    }
    if (this.marker.visible) this.marker.position.y = (this.ring.visible ? 1.5 : 1.32) + Math.sin(t * 2.2) * 0.035
    if (this.skipArmed > 0) {
      this.skipArmed -= dt
      if (this.skipArmed <= 0) this.panelKey = ''
    }

    if (this.waiting) {
      this.pause -= dt
      if (this.pause <= 0) {
        this.waiting = false
        this.open(Math.min(this.lesson + 1, LESSONS.length - 1))
      }
      this.render()
      return
    }

    const l = this.current
    const near = (x: number, z: number) => Math.hypot(player.x - x, player.z - z) < 0.55
    if (l.id === 'move' && near(BEACONS[0].x, BEACONS[0].z)) this.done()
    else if (l.id === 'run') {
      const b = BEACONS[1 - (this.beacon % 2)]
      if (near(b.x, b.z)) {
        if (this.sprintSteps >= 3) this.done()
        else {
          // Arrivé en marchant : l'autre repère, et cette fois en courant.
          this.beacon++
          this.sprintSteps = 0
          this.speak(tr('En marchant, ça ne compte pas ! Courez jusqu\'à l\'autre repère.', 'Walking doesn\'t count! Run to the other marker.'))
          this.aim()
        }
      }
    } else if (l.id === 'camera') {
      const c = this.host.camera()
      if (!this.turned && Math.abs(c.heading - this.cameraFrom.heading) > 0.3) this.turned = true
      if (!this.zoomed && Math.abs(c.zoom - this.cameraFrom.zoom) > 0.25) this.zoomed = true
      if (this.turned && this.zoomed) this.done()
    } else if (l.id === 'sit') {
      if (!this.sat && this.host.seated()) {
        this.sat = true
        this.marker.visible = false
        this.speak(tr('Confortable, hein ? Maintenant, debout !', 'Comfy, right? Now, on your feet!'))
      } else if (this.sat && !this.host.seated()) this.done()
    }
    this.render()
  }

  /** Le panneau de la leçon : où l'on en est, ce que dit l'instructrice, comment faire. */
  private render() {
    const l = this.current
    const controls = this.host.controls()
    const parts = l.id === 'camera' ? `${this.turned}${this.zoomed}` : l.id === 'sit' ? `${this.sat}` : ''
    const key = `${this.lesson}|${this.waiting}|${controls}|${this.line}|${parts}|${this.skipArmed > 0}`
    if (key === this.panelKey) return
    this.panelKey = key
    const el = this.panel
    el.replaceChildren()

    const head = document.createElement('div')
    head.className = 'tuto-head'
    const title = document.createElement('span')
    title.textContent = tr(`Simulateur d'accueil · ${this.lesson + 1}/${LESSONS.length}`, `Welcome simulator · ${this.lesson + 1}/${LESSONS.length}`)
    const skip = document.createElement('button')
    skip.type = 'button'
    skip.dataset.skip = ''
    skip.className = 'tuto-skip'
    skip.textContent = this.skipArmed > 0 ? tr('Vraiment ? Encore un clic', 'Sure? Click again') : tr('Passer', 'Skip')
    head.append(title, skip)

    const dots = document.createElement('div')
    dots.className = 'tuto-dots'
    LESSONS.forEach((_, i) => {
      const d = document.createElement('i')
      d.className = i < this.lesson || (i === this.lesson && this.waiting) ? 'done' : i === this.lesson ? 'now' : ''
      dots.append(d)
    })

    const goal = document.createElement('div')
    goal.className = 'tuto-goal'
    goal.classList.toggle('done', this.waiting)
    goal.append(icon(this.waiting ? 'check' : l.icon), l.title)

    const quote = document.createElement('div')
    quote.className = 'tuto-say'
    quote.textContent = tr(`${INSTRUCTOR} : « ${this.line} »`, `${INSTRUCTOR}: “${this.line}”`)

    const how = document.createElement('div')
    how.className = 'tuto-how'
    // « [X] » : une touche.
    for (const [i, bit] of l.how[controls].split(/\[([^\]]+)\]/).entries()) {
      if (i % 2) {
        const k = document.createElement('kbd')
        k.textContent = bit
        how.append(k)
      } else how.append(bit)
    }

    el.append(head, dots, goal)
    if (l.id === 'camera' || l.id === 'sit') {
      const list = document.createElement('ul')
      list.className = 'tuto-checks'
      const items: [boolean, string][] = l.id === 'camera'
        ? [[this.turned, tr('Pivoter la vue', 'Rotate the view')], [this.zoomed, tr('Zoomer', 'Zoom')]]
        : [[this.sat, tr('S\'asseoir', 'Sit down')], [this.waiting, tr('Se relever', 'Stand up')]]
      for (const [ok, text] of items) {
        const li = document.createElement('li')
        li.className = ok ? 'done' : ''
        li.append(icon(ok ? 'check' : 'caret-right'), text)
        list.append(li)
      }
      el.append(list)
    }
    el.append(quote, how)
    el.hidden = false
  }
}
