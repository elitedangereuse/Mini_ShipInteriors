import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { Avatar } from './avatar'
import type { Deck } from './deck'
import { tr } from './i18n'
import { boxInBone, suitRig, type SuitStyle } from './looks'
import type { Menu } from './menu'
import type { ChefState } from './net'
import { dampAngle } from './player'
import {
  CHEF_CATCH_UP, CHEF_COOK, CHEF_POSTS, CHEF_SNAP, CHEF_SPEED, CHEF_WAIT, chefAt, chefStep, chefTime, cookChef, holdChef,
  type ChefClock, type ChefWork,
} from '../shared/chef.js'

/*
 * Marcel, le chef du mess : trente ans de cuisines de la Fédération, une toque, une moustache et
 * un caractère de ragoût. Il fait la tournée de ses postes (frigo, plan de travail, fourneau,
 * passe, plonge, garde-manger) et, de temps en temps, un tour de salle. Quand on lui parle, il
 * s'interrompt et se tourne vers le commandant ; quand un joueur prend une commande (cf.
 * kitchen.ts), il l'attend au bout de la ligne du self et lui dit quoi faire. Il est le même
 * pour tout le bord : sa tournée suit l'horloge que tient le relais (cf. shared/chef.js) ; hors
 * ligne, celle de l'appareil.
 */

export const CHEF = tr('Chef Marcel', 'Chef Marcel')

/** Veste de cuisine blanche, pantalon gris foncé, mains nues. */
const CHEF_SUIT: SuitStyle = {
  ramp: [[0, '#2b2e35'], [0.35, '#4a4f59'], [0.6, '#d9dde3'], [0.85, '#f4f6f8'], [1, '#ffffff']],
  glove: '#d9a88a',
  helmet: 'none',
  shell: '#f4f6f8',
  visor: '#000000',
  light: '#ffffff',
}

// --------------------------------------------------------------- apparence

const rbox = (w: number, h: number, d: number, m: THREE.Material, r = Math.min(w, h, d) * 0.2) =>
  new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 1, r), m)

/** Toque, foulard rouge, boutons de la veste, tablier et moustache, accrochés aux os. */
function addChefGear(root: THREE.Object3D) {
  const white = new THREE.MeshLambertMaterial({ color: '#f6f7f9' })
  const cloth = new THREE.MeshLambertMaterial({ color: '#e4e7ec' })
  const red = new THREE.MeshLambertMaterial({ color: '#c8321e' })
  const dark = new THREE.MeshLambertMaterial({ color: '#2b2e35' })
  const grey = new THREE.MeshLambertMaterial({ color: '#b9b3aa' })
  const torso = root.getObjectByName('torso')
  if (torso) {
    // Repère du torse (cf. patrol.ts) : le bassin à l'origine, les épaules vers y = 0,11, l'avant vers z = 0,13.
    const apron = rbox(0.24, 0.2, 0.02, cloth, 0.008)
    apron.position.set(0, -0.02, 0.135)
    const bib = rbox(0.14, 0.08, 0.02, cloth, 0.006)
    bib.position.set(0, 0.1, 0.132)
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.018, 0.29), dark)
    strap.position.set(0, 0.05, 0)
    const scarf = rbox(0.12, 0.035, 0.05, red, 0.01)
    scarf.position.set(0, 0.155, 0.11)
    torso.add(apron, bib, strap, scarf)
    // Veste croisée : deux rangées de boutons.
    for (const x of [-0.045, 0.045]) for (const y of [0.1, 0.06]) {
      const button = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 4), dark)
      button.position.set(x, y + 0.02, 0.146)
      torso.add(button)
    }
    // Torchon glissé dans le cordon du tablier.
    const towel = rbox(0.05, 0.1, 0.012, new THREE.MeshLambertMaterial({ color: '#4a78c8' }), 0.004)
    towel.position.set(0.12, -0.02, 0.13)
    towel.rotation.z = 0.2
    torso.add(towel)
  }
  const head = root.getObjectByName('head')
  const headMesh = root.getObjectByName('head-mesh') as THREE.Mesh | undefined
  if (head && headMesh) {
    root.updateMatrixWorld(true)
    const hb = boxInBone(headMesh, head)
    const size = hb.getSize(new THREE.Vector3())
    const center = hb.getCenter(new THREE.Vector3())
    // Toque : bandeau, puis le champignon plissé.
    const band = new THREE.Mesh(new THREE.CylinderGeometry(size.x * 0.44, size.x * 0.46, size.y * 0.3, 18), white)
    band.position.set(center.x, hb.max.y + size.y * 0.08, center.z)
    head.add(band)
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2
      const puff = new THREE.Mesh(new THREE.SphereGeometry(size.x * 0.2, 10, 8), white)
      puff.position.set(center.x + Math.cos(a) * size.x * 0.28, hb.max.y + size.y * 0.42, center.z + Math.sin(a) * size.x * 0.28)
      head.add(puff)
    }
    const crown = new THREE.Mesh(new THREE.SphereGeometry(size.x * 0.3, 12, 10), white)
    crown.position.set(center.x, hb.max.y + size.y * 0.5, center.z)
    head.add(crown)
    // Moustache grise, en guidon.
    for (const s of [-1, 1]) {
      const half = rbox(size.x * 0.24, size.y * 0.07, size.z * 0.1, grey, 0.01)
      half.position.set(center.x + s * size.x * 0.11, center.y - size.y * 0.1, hb.max.z + size.z * 0.02)
      half.rotation.z = s * -0.25
      head.add(half)
    }
  }
}

/** Marcel, prêt à cuisiner. */
export async function chefRig() {
  const r = await suitRig('male', 'e', CHEF_SUIT)
  addChefGear(r.root)
  return { ...r, height: r.height + 0.12 }
}

// --------------------------------------------------------------- répliques

/** Ce que le chef sait au moment où on lui parle (cf. main.ts). */
export interface ChefReport {
  /** Système où se trouve le vaisseau. */
  system: string
  menu: Menu
  /** Plats envoyés par ce joueur avec le chef (cf. kitchen.ts). */
  served: number
}

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]

/** Son métier, sa cuisine, sa vie à bord. */
const DUTY = [
  tr('Trente ans que je cuisine dans l\'espace. Trente ans que personne ne finit ses légumes.', 'Thirty years cooking in space. Thirty years of nobody finishing their vegetables.'),
  tr('Mon ragoût a du caractère. Comme moi. Et comme moi, il ne se laisse pas faire.', 'My stew has character. Like me. And like me, it doesn\'t go down without a fight.'),
  tr('J\'ai servi sur un Farragut de la Fédération. Deux mille couverts par service. Ici vous êtes trois, et vous vous plaignez plus.', 'I served on a Federal Farragut. Two thousand covers a sitting. Here there are three of you, and you complain more.'),
  tr('Pas de casque dans ma cuisine. Sauf le sergent. Je n\'ai jamais vu son visage. Je soupçonne qu\'il n\'en a pas.', 'No helmets in my kitchen. Except the sergeant\'s. I\'ve never seen his face. I suspect he doesn\'t have one.'),
  tr('Quelqu\'un a encore pris la ration du sergent dans mon frigo. Ce n\'est pas moi. Mais c\'était très bon.', 'Someone took the sergeant\'s ration from my fridge again. It wasn\'t me. But it was very good.'),
  tr('Jacques, le robot du bar ? Il croit que secouer un shaker, c\'est de la cuisine. Pff.', 'Jacques, the bar robot? He thinks shaking a shaker is cooking. Pff.'),
  tr('Un escargot géant d\'Irukama s\'est échappé ce matin. S\'il passe par l\'arcade, prévenez-moi.', 'A giant Irukama snail escaped this morning. If it goes through the arcade, let me know.'),
  tr('La gravité artificielle fait retomber les soufflés. C\'est pour ça que je n\'en fais plus. C\'est la seule raison.', 'Artificial gravity makes soufflés collapse. That\'s why I don\'t make them any more. That\'s the only reason.'),
  tr('Lavez-vous les mains. Oui, même avec des gants de combinaison.', 'Wash your hands. Yes, even with suit gloves on.'),
  tr('On m\'a proposé une cuisine sur un Orbis : quatre cents mètres carrés, des robots commis. J\'ai refusé. Ils n\'avaient pas mon couteau.', 'They offered me a kitchen on an Orbis: four hundred square metres, robot kitchen hands. I said no. They didn\'t have my knife.'),
  tr('Le secret de l\'omelette d\'Aepyornis ? Un œuf. Un seul. Il pèse trois kilos.', 'The secret of an Aepyornis omelette? One egg. Just one. It weighs three kilos.'),
  tr('Moustache, la chatte du labo, vient mendier du mammouth tous les soirs. Je lui en donne. Ne le dites pas aux gamins.', 'Moustache, the lab cat, comes begging for mammoth every evening. I give her some. Don\'t tell the kids.'),
  tr('Comète est interdit de cuisine. Il le sait. Il vient quand même. On a un accord.', 'Comète is banned from the kitchen. He knows it. He comes anyway. We have an understanding.'),
  tr('La hotte fait ce bruit depuis Achenar. Le jour où elle se tait, inquiétez-vous.', 'The hood has made that noise since Achenar. The day it goes quiet, start worrying.'),
  tr('Les Thargoïdes ? Qu\'ils viennent. J\'ai une louche.', 'Thargoids? Let them come. I have a ladle.'),
  tr('Un bon cuisinier goûte tout. C\'est pour ça que la veste est un peu juste.', 'A good cook tastes everything. That\'s why the jacket is a little tight.'),
  tr('Les piments d\'Ochoeng, c\'est une cuillère. Pas deux. La dernière fois, le sergent a pleuré derrière sa visière.', 'Ochoeng chillies: one spoonful. Not two. Last time, the sergeant cried behind his visor.'),
  tr('Le café CD-75 se boit noir. Comme l\'espace. Et comme mon humeur avant le service.', 'CD-75 coffee is taken black. Like space. And like my mood before service.'),
]

/** Répliques qui dépendent du bord, du menu, et de ce que le joueur a cuisiné. */
function reportLines(r: ChefReport): string[] {
  const { menu } = r
  const lines = [
    tr(`Aujourd'hui : ${menu.main}. En entrée, ${menu.starter}. Et ${menu.dessert} pour ceux qui ont été sages.`, `Today: ${menu.main}. To start, ${menu.starter}. And ${menu.dessert} for those who behaved.`),
    tr(`${menu.main} ? C'est la recette de ma mère. Enfin, de la mère de quelqu'un.`, `${menu.main}? It\'s my mother\'s recipe. Well, somebody\'s mother.`),
    tr(`Le ${menu.drink} est chaud depuis six heures. Il n'a jamais été aussi fort.`, `The ${menu.drink} has been on since six. It\'s never been stronger.`),
    tr(`${r.system} ? Tant mieux. J'espère qu'ils vendent des épices.`, `${r.system}? Good. I hope they sell spices.`),
  ]
  if (!r.served) lines.push(tr('Tu veux m\'aider ? Prends un bon au rail de la passe. Je ne mords pas. Presque pas.', 'Want to help? Take a ticket from the rail at the pass. I don\'t bite. Hardly.'))
  else if (r.served < 10) lines.push(tr(`${r.served} plat${r.served > 1 ? 's' : ''} envoyé${r.served > 1 ? 's' : ''} avec moi. Je vais finir par te mettre au planning.`, `${r.served} dish${r.served > 1 ? 'es' : ''} sent out with me. I\'ll end up putting you on the rota.`))
  else lines.push(tr(`${r.served} plats ! Toi, tu as un vrai coup de couteau. Tu veux ma toque ? Non. Personne n'aura ma toque.`, `${r.served} dishes! You\'ve got real knife skills. Want my hat? No. Nobody gets my hat.`))
  return lines
}

/** Répliques lancées en passant, dans une bulle. */
const BARKS = [
  tr('Chaud devant !', 'Hot behind!'),
  tr('Ça mijote…', 'Simmering…'),
  tr('Qui a touché à mes couteaux ?', 'Who touched my knives?'),
  tr('Une pincée de sel…', 'A pinch of salt…'),
  tr('Hmm. Ça manque de piment.', 'Hmm. Needs more chilli.'),
]
const SERVICE = [tr('Service !', 'Service!'), tr('Ça part !', 'Order up!'), tr('Une assiette, une !', 'One plate, going out!')]

// --------------------------------------------------------------- tournée

export class Chef {
  readonly avatar: Avatar
  readonly root: THREE.Group
  /** Horloge de la tournée (ms de l'appareil) : celle du relais, recalée à chacun de ses messages. */
  private clock: ChefClock = { tau: Date.now() / 1000, at: Date.now(), holdUntil: 0 }
  /** Fin de la commande en cours (ms de l'appareil) : il attend au bout du self jusque-là. */
  private cookUntil = 0
  /** Pendant un arrêt ou une commande : le joueur vers qui il se tourne. */
  private face: { x: number; z: number } | null = null
  private yaw = 0
  private placed = false
  private stride = 0
  private workIn = 1
  private lastPost = -1
  private barkIn = 15 + Math.random() * 10
  private reactCooldown = 0
  private greeting: { x: number; z: number; until: number } | null = null
  private recent: string[] = []

  onStep?: () => void
  onBark?: (text: string) => void
  /** Un geste de travail (le bruit qui va avec, cf. main.ts). */
  onWork?: (work: ChefWork) => void

  constructor(rig: Awaited<ReturnType<typeof chefRig>>, readonly deck: Deck) {
    this.avatar = new Avatar(rig)
    this.root = this.avatar.root
    deck.group.add(this.root)
  }

  get position(): THREE.Vector3 {
    return this.root.position
  }

  /** Une commande est en cours (le sien ou celle d'un autre joueur) : il attend au bout du self. */
  get cooking(): boolean {
    return Date.now() < this.cookUntil
  }

  /** Où en est la tournée, d'après le relais (à l'arrivée à bord, quand on lui parle ou qu'on cuisine). */
  sync(s: ChefState) {
    const now = Date.now()
    this.clock = { tau: s.tau, at: now, holdUntil: now + s.hold * 1000 }
    this.cookUntil = now + s.cook * 1000
    this.face = s.face ?? null
  }

  /** On lui parle : il s'arrête tout de suite (le relais confirme pour tout le bord) et répond. */
  talk(from: THREE.Vector3, report: ChefReport): string {
    const now = Date.now()
    this.clock = holdChef(this.clock, now)
    this.face = { x: from.x, z: from.z }
    const pool = Math.random() < 0.5 ? reportLines(report) : DUTY
    const fresh = pool.filter((l) => !this.recent.includes(l))
    const line = pick(fresh.length ? fresh : pool)
    this.recent = [line, ...this.recent].slice(0, 8)
    return line
  }

  /**
   * Le joueur local cuisine (`on`, à chaque étape) ou a fini : comme le relais, sans attendre sa
   * réponse (et hors ligne, sans relais du tout).
   */
  cook(from: { x: number; z: number }, on: boolean) {
    const now = Date.now()
    this.cookUntil = on ? now + CHEF_COOK * 1000 : 0
    if (on) this.face = { x: from.x, z: from.z }
    this.clock = cookChef(this.clock, now, this.cookUntil)
  }

  /** Pendant sa commande, le commis local bouge : le chef le suit des yeux depuis la passe. */
  watch(p: { x: number; z: number }) {
    if (this.cooking) this.face = { x: p.x, z: p.z }
  }

  /** Un joueur salue (o7) à côté de lui : il répond d'un signe de la main, sans quitter son poste. */
  greet(from: { x: number; z: number }, local: boolean) {
    const p = this.root.position
    if (this.reactCooldown > 0 || Math.hypot(from.x - p.x, from.z - p.z) > 3.5) return
    this.reactCooldown = 8
    this.greeting = { x: from.x, z: from.z, until: Date.now() + 2400 }
    this.avatar.playEmote('salut')
    if (local) this.onBark?.(tr('o7 ! Enfin… o7 avec une louche.', 'o7! Well… o7 with a ladle.'))
  }

  /**
   * @param player position du joueur s'il est sur le pont principal, sinon null
   * @param emote emote en cours du joueur (il répond au salut « o7 », et à la danse)
   */
  update(dt: number, player: THREE.Vector3 | null, emote: string | null) {
    const now = Date.now()
    const p = this.root.position
    const cooking = now < this.cookUntil
    const holding = now < this.clock.holdUntil
    const routine = chefAt(chefTime(this.clock, now))
    const goal = cooking ? CHEF_WAIT : routine
    this.reactCooldown -= dt

    // Sa place : il suit sa tournée, ou y revient par le chemin de la cuisine (par le passage s'il
    // faut changer de côté du comptoir), un peu plus vite qu'il ne marche pour la rattraper ; trop
    // loin (arrivée à bord), il y saute.
    const step = chefStep(p, goal, CHEF_SPEED * CHEF_CATCH_UP * dt)
    let moved = 0
    if (!this.placed || step.left > CHEF_SNAP) {
      p.x = goal.x
      p.z = goal.z
      this.placed = true
    } else {
      p.x = step.x
      p.z = step.z
      moved = step.moved
      if (step.heading !== null) this.yaw = step.heading
    }
    const walking = moved > CHEF_SPEED * 0.3 * dt

    const distPlayer = player ? Math.hypot(player.x - p.x, player.z - p.z) : Infinity
    if (player && emote === 'o7') this.greet(player, true)
    else if (player && emote === 'danse' && distPlayer < 3 && this.reactCooldown <= 0) {
      this.reactCooldown = 30
      this.onBark?.(tr('Pas de danse en cuisine. Ça fait retomber les soufflés.', 'No dancing in the kitchen. It makes the soufflés collapse.'))
    }

    // Où il regarde : en marche, devant lui ; à l'arrêt, vers qui lui parle ou cuisine avec lui,
    // vers qui le salue, sinon vers son poste.
    if (!walking) {
      const toward = (holding || cooking) && this.face ? this.face : this.greeting && now < this.greeting.until ? this.greeting : null
      this.yaw = toward ? Math.atan2(toward.x - p.x, toward.z - p.z) : cooking ? CHEF_WAIT.yaw : routine.yaw
    }
    this.avatar.setLocomotion(walking ? 'walk' : 'idle', walking ? CHEF_SPEED : 0)
    if (walking) {
      this.stride += moved
      if (this.stride > 0.3) {
        this.stride = 0
        this.onStep?.()
      }
    }

    // Au travail : un geste de temps en temps (couper, remuer, laver…), et « Service ! » à la passe.
    const atPost = !walking && !holding && !cooking && !routine.walking
    if (atPost) {
      const work = CHEF_POSTS[routine.post].work
      if (routine.post !== this.lastPost) {
        this.lastPost = routine.post
        this.workIn = 0.4
        if (work === 'serve' && distPlayer < 6) this.onBark?.(pick(SERVICE))
      }
      this.workIn -= dt
      if (this.workIn <= 0 && work !== 'look' && work !== 'serve') {
        this.workIn = work === 'fetch' ? 1.8 : 1.1 + Math.random() * 0.5
        this.avatar.playEmote('interact')
        this.onWork?.(work)
      }
    } else if (routine.walking) this.lastPost = -1

    this.barkIn -= dt
    if (this.barkIn <= 0) {
      this.barkIn = 25 + Math.random() * 25
      if (distPlayer < 5 && !holding && !cooking) this.onBark?.(pick(BARKS))
    }

    this.root.rotation.y = dampAngle(this.root.rotation.y, this.yaw, 8, dt)
    this.avatar.update(dt)
  }
}
