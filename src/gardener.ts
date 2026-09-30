import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { Avatar } from './avatar'
import type { Deck } from './deck'
import { tr } from './i18n'
import { boxInBone, suitRig, type SuitStyle } from './looks'
import type { GardenerState } from './net'
import { dampAngle } from './player'
import {
  GARDEN_CATCH_UP, GARDEN_HELP, GARDEN_POSTS, GARDEN_SNAP, GARDEN_SPEED, GARDEN_WAIT, gardenAt, gardenStep, gardenTime, helpGarden, holdGarden,
  type GardenClock, type GardenWork,
} from '../shared/gardener.js'

/*
 * Capucine, la jardinière de la serre hydroponique : née sur un monde agricole de la Fédération,
 * un chapeau de paille, une salopette verte, de la terre sous les ongles et un tournesol à la
 * boutonnière. Elle parle aux plantes, donne un nom à chaque pied de tomate, et voue une rivalité
 * silencieuse à la tomate de la base Bradbury. Elle fait la tournée de la serre (grainothèque,
 * bacs, arbre, bassin, compost…) ; quand on lui parle, elle s'interrompt ; quand un joueur prend
 * une fiche de culture avec elle (cf. greenhouse.ts), elle l'attend sur les pas japonais. Elle est
 * la même pour tout le bord : sa tournée suit l'horloge que tient le relais (cf.
 * shared/gardener.js) ; hors ligne, celle de l'appareil.
 */

export const GARDENER = 'Capucine'

/** Salopette vert sauge, tee-shirt crème, gants de jardinage vert pomme. */
const GARDEN_SUIT: SuitStyle = {
  ramp: [[0, '#1f2a1c'], [0.35, '#3c5a34'], [0.6, '#6f9a5a'], [0.85, '#a9c98f'], [1, '#f4ecd8']],
  glove: '#8ac44a',
  helmet: 'none',
  shell: '#6f9a5a',
  visor: '#000000',
  light: '#9dff9a',
}

// --------------------------------------------------------------- apparence

const rbox = (w: number, h: number, d: number, m: THREE.Material, r = Math.min(w, h, d) * 0.2) =>
  new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 1, r), m)

/** Bretelles et poche de la salopette, sécateur, arrosoir à la hanche, chapeau de paille fleuri. */
function addGardenGear(root: THREE.Object3D) {
  const denim = new THREE.MeshLambertMaterial({ color: '#4f7a44' })
  const brass = new THREE.MeshLambertMaterial({ color: '#d9a441' })
  const straw = new THREE.MeshLambertMaterial({ color: '#e8c872' })
  const band = new THREE.MeshLambertMaterial({ color: '#c0643f' })
  const torso = root.getObjectByName('torso')
  if (torso) {
    // Repère du torse (cf. chef.ts) : le bassin à l'origine, les épaules vers y = 0,11, l'avant vers z = 0,13.
    const bib = rbox(0.15, 0.1, 0.02, denim, 0.006)
    bib.position.set(0, 0.07, 0.135)
    const pocket = rbox(0.07, 0.045, 0.01, new THREE.MeshLambertMaterial({ color: '#3c5a34' }), 0.004)
    pocket.position.set(0, 0.07, 0.148)
    torso.add(bib, pocket)
    for (const s of [-1, 1]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.28), denim)
      strap.position.set(s * 0.06, 0.13, 0)
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.008), brass)
      buckle.position.set(s * 0.06, 0.11, 0.146)
      torso.add(strap, buckle)
    }
    // Le sécateur dans la poche, un tournesol à la boutonnière.
    const handle = rbox(0.012, 0.05, 0.01, new THREE.MeshLambertMaterial({ color: '#d9453a' }), 0.004)
    handle.position.set(0.02, 0.1, 0.15)
    const petals = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.008, 10), new THREE.MeshLambertMaterial({ color: '#ffd23c' }))
    petals.rotation.x = Math.PI / 2
    petals.position.set(-0.07, 0.115, 0.145)
    const heart = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.01, 8), new THREE.MeshLambertMaterial({ color: '#6b4630' }))
    heart.rotation.x = Math.PI / 2
    heart.position.set(-0.07, 0.115, 0.15)
    torso.add(handle, petals, heart)
    // Le petit arrosoir, accroché à la ceinture côté droit.
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.038, 0.07, 10), new THREE.MeshLambertMaterial({ color: '#3f8f8c' }))
    can.position.set(0.17, -0.07, 0.03)
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.008, 0.07, 6), new THREE.MeshLambertMaterial({ color: '#3f8f8c' }))
    spout.rotation.x = 0.9
    spout.position.set(0.17, -0.05, 0.08)
    torso.add(can, spout)
  }
  const head = root.getObjectByName('head')
  const headMesh = root.getObjectByName('head-mesh') as THREE.Mesh | undefined
  if (head && headMesh) {
    root.updateMatrixWorld(true)
    const hb = boxInBone(headMesh, head)
    const size = hb.getSize(new THREE.Vector3())
    const center = hb.getCenter(new THREE.Vector3())
    // Chapeau de paille : large bord, calotte, ruban terracotta et deux fleurs.
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(size.x * 0.74, size.x * 0.78, size.y * 0.04, 24), straw)
    brim.position.set(center.x, hb.max.y - size.y * 0.02, center.z)
    brim.rotation.x = -0.08
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(size.x * 0.42, size.x * 0.5, size.y * 0.3, 18), straw)
    crown.position.set(center.x, hb.max.y + size.y * 0.13, center.z)
    const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(size.x * 0.505, size.x * 0.505, size.y * 0.07, 18), band)
    ribbon.position.set(center.x, hb.max.y + size.y * 0.02, center.z)
    head.add(brim, crown, ribbon)
    for (const [dx, color] of [[0.3, '#ff6ad5'], [0.42, '#ffffff']] as const) {
      const flower = new THREE.Mesh(new THREE.SphereGeometry(size.x * 0.09, 8, 6), new THREE.MeshLambertMaterial({ color }))
      flower.position.set(center.x + size.x * dx, hb.max.y + size.y * 0.05, center.z + size.z * 0.3)
      head.add(flower)
    }
    // Une trace de terre sur la joue.
    const smudge = new THREE.Mesh(new THREE.BoxGeometry(size.x * 0.1, size.y * 0.035, 0.004), new THREE.MeshLambertMaterial({ color: '#5a3a24' }))
    smudge.position.set(center.x + size.x * 0.24, center.y - size.y * 0.12, hb.max.z + 0.002)
    head.add(smudge)
  }
}

/** Capucine, prête à jardiner. */
export async function gardenerRig() {
  const r = await suitRig('female', 'd', GARDEN_SUIT)
  addGardenGear(r.root)
  return { ...r, height: r.height + 0.06 }
}

// --------------------------------------------------------------- répliques

/** Ce que la jardinière sait au moment où on lui parle (cf. main.ts). */
export interface GardenerReport {
  /** Système où se trouve le vaisseau. */
  system: string
  /** Fiches de culture faites par ce joueur avec elle (cf. greenhouse.ts). */
  done: number
}

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]

/** Son métier, ses plantes, sa vie à bord. */
const DUTY = [
  tr('Je suis née sur un monde agricole de la Fédération. Quatre cents millions d\'hectares de blé. Ici j\'ai cinquante tuiles, et je les aime plus.', 'I was born on a Federation agricultural world. Four hundred million hectares of wheat. Here I have fifty tiles, and I love them more.'),
  tr('Chaque pied de tomate a un nom. Celui-là, c\'est Jameson. Il grimpe partout et il ne rentre jamais à l\'heure.', 'Every tomato plant has a name. That one\'s Jameson. He climbs everywhere and never comes home on time.'),
  tr('La cheffe de la base Bradbury est très fière de SA tomate. Une seule. Moi, j\'en ai quarante. Je dis ça, je ne dis rien.', 'The chief at Bradbury base is very proud of HER tomato. Just one. I have forty. Just saying.'),
  tr('Je parle aux plantes. Elles poussent mieux. Le basilic, lui, préfère qu\'on lui chante du Ben Carter Jr.', 'I talk to the plants. They grow better. The basil prefers to be sung Ben Carter Jr.'),
  tr('Les carpes s\'appellent Faulcon, DeLacy et Gutamaya. Gutamaya ne mange que des granulés importés d\'Achenar.', 'The koi are called Faulcon, DeLacy and Gutamaya. Gutamaya only eats pellets imported from Achenar.'),
  tr('Un jour, j\'irai récolter des Stratum Tectonicas pour Vista Genomics. En attendant, je récolte des radis pour Marcel.', 'One day I\'ll go and sample Stratum Tectonicas for Vista Genomics. In the meantime, I harvest radishes for Marcel.'),
  tr('Marcel me vole du basilic tous les matins. Il laisse un mot : « Pour la science. » La science, c\'est son pesto.', 'Marcel steals basil every morning. He leaves a note: “For science.” Science is his pesto.'),
  tr('Comète vient faire la sieste dans le massif de fleurs. J\'ai planté de l\'herbe à chat exprès. Ne le dites à personne.', 'Comète comes to nap in the flower bed. I planted catnip on purpose. Don\'t tell anyone.'),
  tr('Le pommier de Lave a fait trois sauts FSD sans perdre une feuille. Moi, j\'ai perdu mon chapeau au deuxième.', 'The Lave apple tree has made three FSD jumps without dropping a leaf. I lost my hat on the second one.'),
  tr('La verrière ? C\'est pour les plantes. Elles aiment voir les étoiles. Et moi aussi, un peu.', 'The glass roof? It\'s for the plants. They like to see the stars. So do I, a little.'),
  tr('Le compost, c\'est la vie. Et un peu les soufflés ratés du chef. Surtout les soufflés ratés du chef.', 'Compost is life. And a bit of the chef\'s failed soufflés. Mostly the chef\'s failed soufflés.'),
  tr('Nico m\'a proposé de souder un arrosage automatique. J\'ai dit non. Les plantes, ça s\'arrose à la main. Avec amour.', 'Nico offered to weld me an automatic sprinkler. I said no. Plants are watered by hand. With love.'),
  tr('Les graines de Colonia ont voyagé vingt-deux mille années-lumière. Elles méritent un bon terreau.', 'The Colonia seeds travelled twenty-two thousand light years. They deserve good soil.'),
  tr('Les drones pollinisateurs, c\'est bien. Mais une vraie abeille, ça me manque. Elles bourdonnent avec plus de conviction.', 'Pollinator drones are fine. But I miss a real bee. They buzz with more conviction.'),
  tr('Un Thargoïde est passé près du vaisseau, une fois. Toutes mes laitues ont fané d\'un coup. Je ne leur ai jamais pardonné.', 'A Thargoid came near the ship once. All my lettuces wilted at once. I have never forgiven them.'),
]

/** Répliques qui dépendent du bord et de ce que le joueur a fait avec elle. */
function reportLines(r: GardenerReport): string[] {
  const lines = [tr(`${r.system} ? J'espère que l'étoile est douce. Les tomates prennent des coups de soleil à travers la verrière.`, `${r.system}? I hope the star is gentle. The tomatoes get sunburnt through the glass.`)]
  if (!r.done) lines.push(tr('Tu veux mettre les mains dans la terre ? Prends une fiche de culture à la grainothèque, on la fait ensemble.', 'Want to get your hands in the soil? Take a growing sheet from the seed library and we\'ll do it together.'))
  else if (r.done < 10) lines.push(tr(`${r.done} fiche${r.done > 1 ? 's' : ''} de culture avec moi. Les tomates commencent à te reconnaître.`, `${r.done} growing sheet${r.done > 1 ? 's' : ''} with me. The tomatoes are starting to recognise you.`))
  else lines.push(tr(`${r.done} fiches ! Tu as la main verte. Enfin, le gant vert. Je te donnerai un pied de tomate à ton nom.`, `${r.done} sheets! You\'ve got green fingers. Well, green gloves. I\'ll name a tomato plant after you.`))
  return lines
}

/** Répliques lancées en passant, dans une bulle. */
const BARKS = [
  tr('Allez, on boit, on boit…', 'Come on, drink up, drink up…'),
  tr('Qui a marché dans mes semis ?', 'Who stepped on my seedlings?'),
  tr('Oh, une fleur ! Bonjour, toi.', 'Oh, a flower! Hello, you.'),
  tr('Jameson, redescends de ce tuteur.', 'Jameson, get down off that stake.'),
  tr('Ça sent bon la terre mouillée…', 'Smells of wet soil…'),
]

// --------------------------------------------------------------- tournée

export class Gardener {
  readonly avatar: Avatar
  readonly root: THREE.Group
  /** Horloge de la tournée (ms de l'appareil) : celle du relais, recalée à chacun de ses messages. */
  private clock: GardenClock = { tau: Date.now() / 1000, at: Date.now(), holdUntil: 0 }
  /** Fin de la fiche de culture en cours (ms de l'appareil) : elle attend sur les pas japonais jusque-là. */
  private helpUntil = 0
  /** Pendant un arrêt ou une fiche : le joueur vers qui elle se tourne. */
  private face: { x: number; z: number } | null = null
  private yaw = 0
  private placed = false
  private stride = 0
  private workIn = 1
  private lastPost = -1
  private barkIn = 14 + Math.random() * 10
  private reactCooldown = 0
  private greeting: { x: number; z: number; until: number } | null = null
  private recent: string[] = []

  onStep?: () => void
  onBark?: (text: string) => void
  /** Un geste de travail (le bruit qui va avec, cf. main.ts). */
  onWork?: (work: GardenWork) => void

  constructor(rig: Awaited<ReturnType<typeof gardenerRig>>, readonly deck: Deck) {
    this.avatar = new Avatar(rig)
    this.root = this.avatar.root
    deck.group.add(this.root)
  }

  get position(): THREE.Vector3 {
    return this.root.position
  }

  /** Une fiche de culture est en cours (la sienne ou celle d'un autre joueur) : elle attend sur les pas japonais. */
  get helping(): boolean {
    return Date.now() < this.helpUntil
  }

  /** Où en est la tournée, d'après le relais (à l'arrivée à bord, quand on lui parle ou qu'on l'aide). */
  sync(s: GardenerState) {
    const now = Date.now()
    this.clock = { tau: s.tau, at: now, holdUntil: now + s.hold * 1000 }
    this.helpUntil = now + s.help * 1000
    this.face = s.face ?? null
  }

  /** On lui parle : elle s'arrête tout de suite (le relais confirme pour tout le bord) et répond. */
  talk(from: THREE.Vector3, report: GardenerReport): string {
    const now = Date.now()
    this.clock = holdGarden(this.clock, now)
    this.face = { x: from.x, z: from.z }
    const pool = Math.random() < 0.4 ? reportLines(report) : DUTY
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
    this.helpUntil = on ? now + GARDEN_HELP * 1000 : 0
    if (on) this.face = { x: from.x, z: from.z }
    this.clock = helpGarden(this.clock, now, this.helpUntil)
  }

  /** Pendant la fiche, l'aide local bouge : la jardinière le suit des yeux. */
  watch(p: { x: number; z: number }) {
    if (this.helping) this.face = { x: p.x, z: p.z }
  }

  /** Un joueur salue (o7) à côté d'elle : elle répond d'un signe de la main, sans quitter son poste. */
  greet(from: { x: number; z: number }, local: boolean) {
    const p = this.root.position
    if (this.reactCooldown > 0 || Math.hypot(from.x - p.x, from.z - p.z) > 3.5) return
    this.reactCooldown = 8
    this.greeting = { x: from.x, z: from.z, until: Date.now() + 2400 }
    this.avatar.playEmote('salut')
    if (local) this.onBark?.(tr('o7 ! Pardon, j\'ai de la terre plein les gants.', 'o7! Sorry, my gloves are full of soil.'))
  }

  /** Une phrase en l'air. */
  say(text: string) {
    this.onBark?.(text)
  }

  /**
   * @param player position du joueur s'il est sur le pont supérieur, sinon null
   * @param emote emote en cours du joueur (elle répond au salut « o7 », et à la danse)
   */
  update(dt: number, player: THREE.Vector3 | null, emote: string | null) {
    const now = Date.now()
    const p = this.root.position
    const helping = now < this.helpUntil
    const holding = now < this.clock.holdUntil
    const routine = gardenAt(gardenTime(this.clock, now))
    const goal = helping ? GARDEN_WAIT : routine
    this.reactCooldown -= dt

    // Sa place : elle suit sa tournée, ou y revient en contournant les bacs, un peu plus vite
    // qu'elle ne marche pour la rattraper ; trop loin (arrivée à bord), elle y saute.
    const step = gardenStep(p, goal, GARDEN_SPEED * GARDEN_CATCH_UP * dt)
    let moved = 0
    if (!this.placed || step.left > GARDEN_SNAP) {
      p.x = goal.x
      p.z = goal.z
      this.placed = true
    } else {
      p.x = step.x
      p.z = step.z
      moved = step.moved
      if (step.heading !== null) this.yaw = step.heading
    }
    const walking = moved > GARDEN_SPEED * 0.3 * dt

    const distPlayer = player ? Math.hypot(player.x - p.x, player.z - p.z) : Infinity
    if (player && emote === 'o7') this.greet(player, true)
    else if (player && emote === 'danse' && distPlayer < 3 && this.reactCooldown <= 0) {
      this.reactCooldown = 30
      this.onBark?.(tr('Oh oui, dansez ! Les tomates adorent. Pas dans les semis, par contre.', 'Oh yes, dance! The tomatoes love it. Not in the seedlings, though.'))
    }

    // Où elle regarde : en marche, devant elle ; à l'arrêt, vers qui lui parle ou l'aide, vers qui
    // la salue, sinon vers son poste.
    if (!walking) {
      const toward = (holding || helping) && this.face ? this.face : this.greeting && now < this.greeting.until ? this.greeting : null
      this.yaw = toward ? Math.atan2(toward.x - p.x, toward.z - p.z) : helping ? GARDEN_WAIT.yaw : routine.yaw
    }
    this.avatar.setLocomotion(walking ? 'walk' : 'idle', walking ? GARDEN_SPEED : 0)
    if (walking) {
      this.stride += moved
      if (this.stride > 0.3) {
        this.stride = 0
        this.onStep?.()
      }
    }

    // Au travail : un geste de temps en temps (arroser, tailler, cueillir, bêcher…).
    const atPost = !walking && !holding && !helping && !routine.walking
    if (atPost) {
      const work = GARDEN_POSTS[routine.post].work
      if (routine.post !== this.lastPost) {
        this.lastPost = routine.post
        this.workIn = 0.4
      }
      this.workIn -= dt
      if (this.workIn <= 0 && work !== 'look') {
        this.workIn = work === 'water' ? 2 : 1.2 + Math.random() * 0.6
        this.avatar.playEmote('interact')
        this.onWork?.(work)
      }
    } else if (routine.walking) this.lastPost = -1

    this.barkIn -= dt
    if (this.barkIn <= 0) {
      this.barkIn = 25 + Math.random() * 25
      if (distPlayer < 5 && !holding && !helping) this.onBark?.(pick(BARKS))
    }

    this.root.rotation.y = dampAngle(this.root.rotation.y, this.yaw, 8, dt)
    this.avatar.update(dt)
  }
}
