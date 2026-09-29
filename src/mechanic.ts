import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { Avatar } from './avatar'
import type { Deck } from './deck'
import { ED_ORANGE } from './furniture'
import { tr } from './i18n'
import { boxInBone, suitRig, type SuitStyle } from './looks'
import type { MechanicState } from './net'
import { dampAngle } from './player'
import {
  MECH_CATCH_UP, MECH_HELP, MECH_POSTS, MECH_SNAP, MECH_SPEED, MECH_WAIT, helpMech, holdMech, mechAt, mechStep, mechTime,
  type MechClock, type MechWork,
} from '../shared/mechanic.js'

/*
 * Nico, le mécano du hangar : vingt ans, des taches de graisse jusqu'aux oreilles, les lunettes
 * de soudeur sur le front, et une passion pour le Krait Mk II qu'il appelle « la Princesse ».
 * Boulon, son petit drone de maintenance, flotte autour de lui : il éclaire, il scanne, il
 * compte les vis. Nico fait le tour du Krait (établi, train, étagère, soudure, pupitre, nez,
 * bouclier, ravitaillement, propulseurs) ; quand on lui parle, il s'interrompt ; quand un joueur
 * fait une révision avec lui (cf. hangar.ts), il l'attend devant le nez du Krait. Il est le même
 * pour tout le bord : sa tournée suit l'horloge que tient le relais (cf. shared/mechanic.js) ;
 * hors ligne, celle de l'appareil. Boulon, lui, n'est qu'une affaire d'affichage : il suit Nico.
 */

export const MECHANIC = 'Nico'
export const DROID = tr('Boulon', 'Bolt')

/** Combinaison de travail orange, genoux et coudes gris, gants de travail. */
const MECH_SUIT: SuitStyle = {
  ramp: [[0, '#231a14'], [0.35, '#8a4818'], [0.6, '#e07a2c'], [0.85, '#f6a052'], [1, '#ffd9a8']],
  glove: '#3a3f47',
  helmet: 'none',
  shell: '#3a3f47',
  visor: '#000000',
  light: '#ff8a2a',
}

// --------------------------------------------------------------- apparence

const rbox = (w: number, h: number, d: number, m: THREE.Material, r = Math.min(w, h, d) * 0.2) =>
  new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 1, r), m)

/** Lunettes de soudeur sur le front, ceinture à outils, clé à la hanche, trace de graisse. */
function addMechanicGear(root: THREE.Object3D) {
  const dark = new THREE.MeshLambertMaterial({ color: '#2a2e36' })
  const leather = new THREE.MeshLambertMaterial({ color: '#5a3a24' })
  const chrome = new THREE.MeshLambertMaterial({ color: '#b8c0c8' })
  const lens = new THREE.MeshBasicMaterial({ color: '#39d0ff' })
  const grease = new THREE.MeshLambertMaterial({ color: '#2b241e' })
  const torso = root.getObjectByName('torso')
  if (torso) {
    // Repère du torse (cf. chef.ts) : le bassin à l'origine, l'avant vers z = 0,13.
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.035, 0.29), leather)
    belt.position.set(0, -0.06, 0)
    torso.add(belt)
    // Sacoches et clé à molette à la ceinture.
    for (const s of [-1, 1]) {
      const pouch = rbox(0.06, 0.07, 0.05, leather, 0.01)
      pouch.position.set(s * 0.12, -0.09, 0.1)
      torso.add(pouch)
    }
    const wrench = rbox(0.018, 0.12, 0.012, chrome, 0.004)
    wrench.position.set(0.16, -0.1, 0.04)
    wrench.rotation.z = 0.25
    torso.add(wrench)
    // Poche de poitrine, avec un tournevis, et une trace de graisse.
    const pocket = rbox(0.06, 0.05, 0.012, dark, 0.006)
    pocket.position.set(-0.07, 0.08, 0.14)
    const driver = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 6), new THREE.MeshLambertMaterial({ color: '#e9a917' }))
    driver.position.set(-0.08, 0.12, 0.145)
    const smudge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.004), grease)
    smudge.position.set(0.06, 0.02, 0.142)
    smudge.rotation.z = -0.3
    torso.add(pocket, driver, smudge)
  }
  const head = root.getObjectByName('head')
  const headMesh = root.getObjectByName('head-mesh') as THREE.Mesh | undefined
  if (head && headMesh) {
    root.updateMatrixWorld(true)
    const hb = boxInBone(headMesh, head)
    const size = hb.getSize(new THREE.Vector3())
    const center = hb.getCenter(new THREE.Vector3())
    // Bandeau des lunettes tout autour de la tête, et les deux verres relevés sur le front.
    const strap = new THREE.Mesh(new THREE.BoxGeometry(size.x * 0.9, size.y * 0.06, size.z * 0.9), dark)
    strap.position.set(center.x, hb.min.y + size.y * 0.78, center.z)
    head.add(strap)
    for (const s of [-1, 1]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(size.x * 0.13, size.x * 0.13, size.z * 0.1, 12), dark)
      cup.rotation.x = Math.PI / 2 - 0.4
      cup.position.set(center.x + s * size.x * 0.18, hb.min.y + size.y * 0.82, hb.max.z + size.z * 0.02)
      const glass = new THREE.Mesh(new THREE.CircleGeometry(size.x * 0.1, 12), lens)
      glass.rotation.x = -0.4
      glass.position.set(center.x + s * size.x * 0.18, hb.min.y + size.y * 0.84, hb.max.z + size.z * 0.075)
      head.add(cup, glass)
    }
    // Une trace de graisse sur la joue.
    const cheek = new THREE.Mesh(new THREE.BoxGeometry(size.x * 0.12, size.y * 0.04, 0.004), grease)
    cheek.position.set(center.x - size.x * 0.25, center.y - size.y * 0.12, hb.max.z + 0.002)
    head.add(cheek)
  }
}

/** Nico, prêt à bricoler. */
export async function mechanicRig() {
  const r = await suitRig('male', 'd', MECH_SUIT)
  addMechanicGear(r.root)
  return { ...r, height: r.height + 0.04 }
}

/**
 * Boulon, le drone de maintenance : une coque ronde, un œil cyan, deux rotors, un bandeau orange
 * et, dessous, le cône de son scanner (allumé quand il scanne ou éclaire une soudure).
 */
function droidModel() {
  const g = new THREE.Group()
  const shell = new THREE.MeshLambertMaterial({ color: '#dfe3e8' })
  const dark = new THREE.MeshLambertMaterial({ color: '#2a2e36' })
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), shell)
  body.scale.y = 0.85
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.074, 0.012, 6, 24), new THREE.MeshLambertMaterial({ color: ED_ORANGE }))
  band.rotation.x = Math.PI / 2
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#39d0ff' })
  const eye = new THREE.Mesh(new THREE.CircleGeometry(0.028, 16), eyeMat)
  eye.position.set(0, 0.01, 0.073)
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.045, 0.02), dark)
  visor.position.set(0, 0.01, 0.063)
  const rotors: THREE.Mesh[] = []
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.016), dark)
    arm.position.set(s * 0.09, 0.03, 0)
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.004, 12), new THREE.MeshBasicMaterial({ color: '#9aa3ad', transparent: true, opacity: 0.5 }))
    rotor.position.set(s * 0.12, 0.04, 0)
    rotors.push(rotor)
    g.add(arm, rotor)
  }
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 5), dark)
  antenna.position.set(0.02, 0.085, -0.01)
  const tipMat = new THREE.MeshBasicMaterial({ color: '#ff3b2f' })
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 4), tipMat)
  tip.position.set(0.02, 0.118, -0.01)
  const beamMat = new THREE.MeshBasicMaterial({ color: '#39d0ff', transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
  // Le cône du scanner : sa pointe sous le drone, sa base vers le sol.
  const beam = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 20, 1, true).translate(0, -0.2, 0), beamMat)
  beam.position.y = -0.05
  beam.visible = false
  g.add(body, band, visor, eye, antenna, tip, beam)
  return { group: g, rotors, eyeMat, tipMat, beam }
}

// --------------------------------------------------------------- répliques

/** Ce que le mécano sait au moment où on lui parle (cf. main.ts). */
export interface MechanicReport {
  /** Système où se trouve le vaisseau. */
  system: string
  /** Révisions faites par ce joueur avec lui (cf. hangar.ts). */
  done: number
  /** Le joueur est installé aux commandes du Krait. */
  aboard: boolean
}

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]

/** Son métier, le Krait, Boulon, sa vie à bord. */
const DUTY = [
  tr('Elle, c\'est la Princesse. Krait Mk II, Faulcon DeLacy. Je l\'ai remontée boulon par boulon. Enfin, Boulon m\'a aidé.', 'That\'s the Princess. Krait Mk II, Faulcon DeLacy. I rebuilt her bolt by bolt. Well, Bolt helped.'),
  tr('Boulon ? C\'est mon drone. Il compte les vis, il éclaire les recoins et il juge mes soudures. Surtout, il juge.', 'Bolt? He\'s my drone. He counts the screws, lights up the corners and judges my welds. Mostly he judges.'),
  tr('Tu entends ce petit sifflement dans la tuyère gauche ? Non ? Moi si. Elle me dit qu\'elle a froid.', 'Hear that little whistle in the port thruster? No? I do. She\'s telling me she\'s cold.'),
  tr('Le bouclier laisse passer les vaisseaux, pas l\'air. Ni les gens. J\'ai testé avec une clé de 12. Adieu, clé de 12.', 'The shield lets ships through, not air. Not people either. I tested it with a 12 mm spanner. Farewell, 12 mm spanner.'),
  tr('Un jour, je la sortirai du hangar. Juste un tour. Juste jusqu\'à la balise de navigation et retour. Chut.', 'One day I\'ll take her out. Just one lap. Just to the nav beacon and back. Shh.'),
  tr('Les Thargoïdes du lobby grattent la porte toute la nuit. Moi je mets de la musique et je soude plus fort.', 'The Thargoids by the lobby scratch at the door all night. I put some music on and weld louder.'),
  tr('J\'ai appris la mécanique sur une Sidewinder de récup\'. Elle n\'avait plus de train, alors on se posait sur le ventre.', 'I learned mechanics on a scrapyard Sidewinder. She had no landing gear, so we landed on her belly.'),
  tr('Le Krait a un hangar à chasseur. Je rêve d\'y ranger un chasseur. Pour l\'instant, j\'y range mes sandwichs.', 'The Krait has a fighter bay. I dream of parking a fighter in there. For now, I keep my sandwiches in it.'),
  tr('Le chef Marcel me garde toujours une assiette. Il dit que je suis trop maigre pour tenir une clé à choc.', 'Chef Marcel always saves me a plate. He says I\'m too skinny to hold an impact wrench.'),
  tr('Betty m\'a déjà recousu trois fois. Elle dit que je suis son meilleur client. Je crois que c\'est un compliment.', 'Betty has stitched me up three times already. She says I\'m her best customer. I think that\'s a compliment.'),
  tr('Ne touche pas au levier rouge du cockpit. Ni au jaune. Tu sais quoi ? Ne touche à rien.', 'Don\'t touch the red lever in the cockpit. Or the yellow one. You know what? Don\'t touch anything.'),
  tr('Soixante-treize mètres de delta et elle tourne comme une Eagle. C\'est ce qu\'on raconte. Je ne l\'ai jamais pilotée.', 'Seventy-three metres of delta and she turns like an Eagle. So they say. I\'ve never flown her.'),
  tr('Les pilotes rayent la peinture, les mécanos la repeignent. C\'est le cycle de la vie.', 'Pilots scratch the paint, mechanics repaint it. It\'s the circle of life.'),
  tr('Il manque toujours une vis. Toujours. Boulon dit qu\'il n\'en manque pas. Boulon ment.', 'There\'s always one screw missing. Always. Bolt says there isn\'t. Bolt lies.'),
  tr('Le sergent Rourke passe parfois vérifier le hangar. Il regarde le Krait longtemps. Je crois qu\'il est amoureux.', 'Sergeant Rourke sometimes comes by to check the hangar. He stares at the Krait for ages. I think he\'s in love.'),
]

/** Répliques qui dépendent du bord et de ce que le joueur a fait avec lui. */
function reportLines(r: MechanicReport): string[] {
  if (r.aboard) {
    return [
      tr('Hé ! Descends de là ! … Bon, d\'accord, deux minutes. Mais tu ne touches à RIEN.', 'Hey! Get down from there! … Fine, two minutes. But you touch NOTHING.'),
      tr('Confortable, hein ? C\'est moi qui ai refait la mousse du siège. Ne mets pas tes pieds sur la console.', 'Comfy, eh? I redid the seat foam myself. Keep your feet off the console.'),
    ]
  }
  const lines = [tr(`${r.system} ? Si on sort, je veux une place au premier rang. Enfin, au bouclier.`, `${r.system}? If we head out, I want a front-row seat. Well, at the shield.`)]
  if (!r.done) lines.push(tr('Tu veux mettre les mains dans le cambouis ? Prends une révision au pupitre du hangar, on la fait à deux. À trois, avec Boulon.', 'Want to get your hands greasy? Take a service job at the hangar console and we\'ll do it together. Three of us, with Bolt.'))
  else if (r.done < 10) lines.push(tr(`${r.done} révision${r.done > 1 ? 's' : ''} avec moi. Boulon t'a mis dans ses favoris.`, `${r.done} service${r.done > 1 ? 's' : ''} with me. Bolt put you in his favourites.`))
  else lines.push(tr(`${r.done} révisions ! Tu veux ma place ? Non, pas ma place. Mais je te prête ma clé de 13.`, `${r.done} services! Want my job? No, not my job. But I\'ll lend you my 13 mm spanner.`))
  return lines
}

/** Répliques lancées en passant, dans une bulle. */
const BARKS = [
  tr('Hop hop hop !', 'Hup hup hup!'),
  tr('Où est passée ma clé de 12 ?', 'Where did my 12 mm spanner go?'),
  tr('Tout doux, ma belle…', 'Easy, girl…'),
  tr('Boulon, de la lumière !', 'Bolt, light!'),
  tr('Ça, ça va rouiller…', 'That\'s going to rust…'),
]
/** Ce que dit Boulon, de temps en temps. */
const BEEPS = [tr('Bip ?', 'Beep?'), tr('Bip-bip !', 'Beep-beep!'), tr('Brrzzt.', 'Brrzzt.'), tr('Bip-bop-bip.', 'Beep-boop-beep.')]

// --------------------------------------------------------------- tournée

/** Voyant de l'antenne de Boulon, qui clignote. */
const TIP_ON = new THREE.Color('#ff3b2f')
const TIP_OFF = new THREE.Color('#4a1410')

/** Où Boulon se tient pendant chaque geste de Nico : devant lui (scan, soudure), ou à son épaule. */
const DROID_WORK: Partial<Record<MechWork, { ahead: number; y: number; beam: boolean }>> = {
  scan: { ahead: 0.55, y: 0.55, beam: true },
  weld: { ahead: 0.35, y: 0.4, beam: true },
  wrench: { ahead: 0.3, y: 0.3, beam: true },
  refuel: { ahead: 0.35, y: 0.5, beam: false },
}

export class Mechanic {
  readonly avatar: Avatar
  readonly root: THREE.Group
  /** Boulon, qui flotte autour de lui (coordonnées du pont). */
  readonly droid: THREE.Group
  /** Horloge de la tournée (ms de l'appareil) : celle du relais, recalée à chacun de ses messages. */
  private clock: MechClock = { tau: Date.now() / 1000, at: Date.now(), holdUntil: 0 }
  /** Fin de la révision en cours (ms de l'appareil) : il attend au nez du Krait jusque-là. */
  private helpUntil = 0
  /** Pendant un arrêt ou une révision : le joueur vers qui il se tourne. */
  private face: { x: number; z: number } | null = null
  private yaw = 0
  private placed = false
  private stride = 0
  private workIn = 1
  private lastPost = -1
  private barkIn = 12 + Math.random() * 10
  private beepIn = 20 + Math.random() * 20
  private reactCooldown = 0
  private greeting: { x: number; z: number; until: number } | null = null
  private recent: string[] = []
  private readonly bot: ReturnType<typeof droidModel>
  private droidAngle = Math.random() * Math.PI * 2
  private time = 0

  onStep?: () => void
  onBark?: (text: string) => void
  /** Boulon parle (sa bulle). */
  onBeep?: (text: string) => void
  /** Un geste de travail (le bruit qui va avec, cf. main.ts). */
  onWork?: (work: MechWork) => void

  constructor(rig: Awaited<ReturnType<typeof mechanicRig>>, readonly deck: Deck) {
    this.avatar = new Avatar(rig)
    this.root = this.avatar.root
    deck.group.add(this.root)
    this.bot = droidModel()
    this.droid = this.bot.group
    deck.group.add(this.droid)
  }

  get position(): THREE.Vector3 {
    return this.root.position
  }

  /** Une révision est en cours (la sienne ou celle d'un autre joueur) : il attend au nez du Krait. */
  get helping(): boolean {
    return Date.now() < this.helpUntil
  }

  /** Où en est la tournée, d'après le relais (à l'arrivée à bord, quand on lui parle ou qu'on l'aide). */
  sync(s: MechanicState) {
    const now = Date.now()
    this.clock = { tau: s.tau, at: now, holdUntil: now + s.hold * 1000 }
    this.helpUntil = now + s.help * 1000
    this.face = s.face ?? null
  }

  /** On lui parle : il s'arrête tout de suite (le relais confirme pour tout le bord) et répond. */
  talk(from: THREE.Vector3, report: MechanicReport): string {
    const now = Date.now()
    this.clock = holdMech(this.clock, now)
    this.face = { x: from.x, z: from.z }
    const pool = report.aboard || Math.random() < 0.45 ? reportLines(report) : DUTY
    const fresh = pool.filter((l) => !this.recent.includes(l))
    const line = pick(fresh.length ? fresh : pool)
    this.recent = [line, ...this.recent].slice(0, 8)
    return line
  }

  /**
   * Le joueur local l'aide (`on`, à chaque étape) ou a fini : comme le relais, sans attendre sa
   * réponse (et hors ligne, sans relais du tout).
   */
  help(from: { x: number; z: number }, on: boolean) {
    const now = Date.now()
    this.helpUntil = on ? now + MECH_HELP * 1000 : 0
    if (on) this.face = { x: from.x, z: from.z }
    this.clock = helpMech(this.clock, now, this.helpUntil)
  }

  /** Pendant la révision, l'aide local bouge : le mécano le suit des yeux. */
  watch(p: { x: number; z: number }) {
    if (this.helping) this.face = { x: p.x, z: p.z }
  }

  /** Un joueur salue (o7) à côté de lui : il répond d'un signe de la main, sans quitter son poste. */
  greet(from: { x: number; z: number }, local: boolean) {
    const p = this.root.position
    if (this.reactCooldown > 0 || Math.hypot(from.x - p.x, from.z - p.z) > 3.5) return
    this.reactCooldown = 8
    this.greeting = { x: from.x, z: from.z, until: Date.now() + 2400 }
    this.avatar.playEmote('salut')
    if (local) this.onBark?.(tr('o7 ! Attention, j\'ai de la graisse plein les gants.', 'o7! Careful, my gloves are covered in grease.'))
  }

  /** Une phrase en l'air (quelqu'un s'est installé aux commandes, par exemple). */
  say(text: string) {
    this.onBark?.(text)
  }

  /**
   * @param player position du joueur s'il est sur le pont de la cale, sinon null
   * @param emote emote en cours du joueur (il répond au salut « o7 », et à la danse)
   */
  update(dt: number, player: THREE.Vector3 | null, emote: string | null) {
    const now = Date.now()
    this.time += dt
    const p = this.root.position
    const helping = now < this.helpUntil
    const holding = now < this.clock.holdUntil
    const routine = mechAt(mechTime(this.clock, now))
    const goal = helping ? MECH_WAIT : routine
    this.reactCooldown -= dt

    // Sa place : il suit sa tournée, ou y revient par l'allée qui fait le tour du Krait, un peu
    // plus vite qu'il ne marche pour la rattraper ; trop loin (arrivée à bord), il y saute.
    const step = mechStep(p, goal, MECH_SPEED * MECH_CATCH_UP * dt)
    let moved = 0
    if (!this.placed || step.left > MECH_SNAP) {
      p.x = goal.x
      p.z = goal.z
      this.placed = true
    } else {
      p.x = step.x
      p.z = step.z
      moved = step.moved
      if (step.heading !== null) this.yaw = step.heading
    }
    const walking = moved > MECH_SPEED * 0.3 * dt

    const distPlayer = player ? Math.hypot(player.x - p.x, player.z - p.z) : Infinity
    if (player && emote === 'o7') this.greet(player, true)
    else if (player && emote === 'danse' && distPlayer < 3 && this.reactCooldown <= 0) {
      this.reactCooldown = 30
      this.onBark?.(tr('Pas de danse sous l\'aile, ça fait trembler le train !', 'No dancing under the wing, it rattles the landing gear!'))
    }

    // Où il regarde : en marche, devant lui ; à l'arrêt, vers qui lui parle ou l'aide, vers qui
    // le salue, sinon vers son poste.
    if (!walking) {
      const toward = (holding || helping) && this.face ? this.face : this.greeting && now < this.greeting.until ? this.greeting : null
      this.yaw = toward ? Math.atan2(toward.x - p.x, toward.z - p.z) : helping ? MECH_WAIT.yaw : routine.yaw
    }
    this.avatar.setLocomotion(walking ? 'walk' : 'idle', walking ? MECH_SPEED : 0)
    if (walking) {
      this.stride += moved
      if (this.stride > 0.3) {
        this.stride = 0
        this.onStep?.()
      }
    }

    // Au travail : un geste de temps en temps (clé, soudure, scan, plein…).
    const atPost = !walking && !holding && !helping && !routine.walking
    const work = atPost ? MECH_POSTS[routine.post].work : null
    if (atPost && work) {
      if (routine.post !== this.lastPost) {
        this.lastPost = routine.post
        this.workIn = 0.4
      }
      this.workIn -= dt
      if (this.workIn <= 0 && work !== 'look') {
        this.workIn = work === 'fetch' ? 1.8 : 1.1 + Math.random() * 0.5
        this.avatar.playEmote('interact')
        this.onWork?.(work)
      }
    } else if (routine.walking) this.lastPost = -1

    this.barkIn -= dt
    if (this.barkIn <= 0) {
      this.barkIn = 25 + Math.random() * 25
      if (distPlayer < 5 && !holding && !helping) this.onBark?.(pick(BARKS))
    }
    this.beepIn -= dt
    if (this.beepIn <= 0) {
      this.beepIn = 30 + Math.random() * 30
      if (distPlayer < 5) this.onBeep?.(pick(BEEPS))
    }

    this.root.rotation.y = dampAngle(this.root.rotation.y, this.yaw, 8, dt)
    this.avatar.update(dt)
    this.updateDroid(dt, work)
  }

  /**
   * Boulon : il tourne autour de Nico à hauteur d'épaule ; pendant un geste, il vient se placer
   * devant lui, et son scanner s'allume. Il regarde toujours ce que Nico regarde.
   */
  private updateDroid(dt: number, work: MechWork | null) {
    const p = this.root.position
    const at = work ? DROID_WORK[work] : undefined
    const target = new THREE.Vector3()
    if (at) {
      const yaw = this.root.rotation.y
      target.set(p.x + Math.sin(yaw) * at.ahead, at.y, p.z + Math.cos(yaw) * at.ahead)
    } else {
      this.droidAngle += dt * 0.7
      target.set(p.x + Math.cos(this.droidAngle) * 0.42, 0.62, p.z + Math.sin(this.droidAngle) * 0.42)
    }
    target.y += Math.sin(this.time * 2.3) * 0.025
    const d = this.droid.position
    if (!this.placed || d.distanceTo(target) > 4) d.copy(target)
    else d.lerp(target, 1 - Math.exp(-dt * 3))
    // Il regarde là où Nico travaille, sinon là où il va.
    const lookYaw = at ? this.root.rotation.y : Math.atan2(target.x - p.x, target.z - p.z) + Math.PI / 2
    this.droid.rotation.y = dampAngle(this.droid.rotation.y, lookYaw, 5, dt)
    this.droid.rotation.z = Math.sin(this.time * 1.7) * 0.08
    for (const r of this.bot.rotors) r.rotation.y += dt * 40
    this.bot.beam.visible = !!at?.beam && Math.sin(this.time * 9) > -0.6
    this.bot.tipMat.color.copy(this.time % 1.2 < 0.15 ? TIP_ON : TIP_OFF)
  }
}
