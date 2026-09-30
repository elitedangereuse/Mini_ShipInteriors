import * as THREE from 'three'
import { Avatar } from '../avatar'
import type { Deck } from '../deck'
import { tr } from '../i18n'
import { suitRig, type SuitStyle } from '../looks'
import type { ChiefState } from '../net'
import { dampAngle } from '../player'
import { BASE_COCKPIT, CHIEF_POSTS, CHIEF_SPEED, chiefAt, chiefTime, holdChief, type ChiefPost } from '../../shared/ground-base.js'
import type { PatrolClock } from '../../shared/patrol.js'

/*
 * Ada Kerlan, la cheffe de l'avant-poste Bradbury : seule habitante de la base, en combinaison de
 * surface blanche et orange, casque bulle. Elle fait sa ronde d'un bâtiment à l'autre (la même pour
 * tous, cf. shared/ground-base.js), s'arrête pour parler aux visiteurs, et salue de la main chaque
 * Krait qui met les gaz sur l'aire d'atterrissage.
 */

export const CHIEF = 'Ada Kerlan'

/** Combinaison de surface : blanc cassé, liserés orange, gants orange, bulle transparente. */
const SURFACE_SUIT: SuitStyle = {
  ramp: [[0, '#2a2e36'], [0.35, '#626874'], [0.7, '#dfe3ea'], [0.86, '#ff9a3c'], [1, '#fff4e6']],
  glove: '#f2842a',
  helmet: 'glass',
  shell: '#eef1f5',
  visor: '#9fd8ff',
  light: '#ff8a1c',
}

/** Au-delà de cet écart avec sa place dans la ronde (reconnexion, arrêt venu du relais), elle y saute. */
const SNAP = 1.5

export function chiefRig() {
  return suitRig('female', 'c', SURFACE_SUIT)
}

/** Ce que la cheffe sait quand on lui parle (cf. main.ts). */
export interface ChiefReport {
  /** Système où se trouve le vaisseau (et donc la planète de la base). */
  system: string
  /** Autres CMDR sur la base. */
  visitors: number
}

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]

/** Sa base, sa vie, la planète. */
const TALK = [
  tr('Bienvenue à Bradbury, commandant. Population : une. Deux, si on compte la tomate de la serre.', 'Welcome to Bradbury, commander. Population: one. Two, if you count the tomato in the greenhouse.'),
  tr('Ici, la poussière s\'infiltre partout. Dans les filtres, dans le café, dans les rêves.', 'Out here, the dust gets everywhere. In the filters, in the coffee, in your dreams.'),
  tr('Un conseil : ne marchez pas trop près du bord. La falaise, elle, ne fait pas de ronde.', 'A tip: don\'t walk too close to the edge. The cliff doesn\'t do rounds.'),
  tr('La fusée part une fois par semaine. Les autres jours, je lui parle. Elle écoute bien.', 'The rocket leaves once a week. The rest of the time, I talk to it. It\'s a good listener.'),
  tr('Les cristaux verts, au sud-est ? Magnifiques. Radioactifs ? Un peu. Juste un peu.', 'The green crystals to the south-east? Beautiful. Radioactive? A little. Just a little.'),
  tr('Votre mécano, Nico, m\'a envoyé un message : « Si elle revient rayée, je démissionne. » Je crois qu\'il parle du Krait.', 'Your mechanic, Nico, sent me a message: “If she comes back scratched, I quit.” I think he means the Krait.'),
  tr('Le rover ? Pas aujourd\'hui. La dernière fois qu\'un visiteur l\'a conduit, on l\'a retrouvé sur le toit du garage.', 'The rover? Not today. The last time a visitor drove it, we found it on the garage roof.'),
  tr('Le coucher de soleil ici dure quatre heures. Je ne m\'en lasse pas. Enfin, un peu, vers la troisième heure.', 'Sunset here lasts four hours. I never tire of it. Well, a bit, around the third hour.'),
  tr('J\'ai une tourelle de défense et je n\'ai jamais eu à m\'en servir. Je l\'astique quand même. On ne sait jamais.', 'I have a defence turret and never had to use it. I polish it anyway. You never know.'),
  tr('À la serre, on fait pousser des salades. Et une tomate. Ne touchez pas à la tomate.', 'In the greenhouse we grow lettuce. And one tomato. Don\'t touch the tomato.'),
  tr('Si vous entendez un bruit la nuit, c\'est le générateur. Si c\'est une voix, c\'est moi qui parle au générateur.', 'If you hear a noise at night, it\'s the generator. If it\'s a voice, it\'s me talking to the generator.'),
  tr('Ça fait du bien de voir du monde. La dernière visite, c\'était un Thargoïde. Il n\'est pas resté longtemps.', 'It\'s nice to see people. The last visitor was a Thargoid. It didn\'t stay long.'),
  tr('Pour repartir : l\'escabeau du Krait, le cockpit, Espace pour les réacteurs, et encore Espace pour décoller. Faites-moi un signe en partant.', 'To leave: the Krait\'s ladder, the cockpit, Space for the thrusters, and Space again to take off. Wave at me on the way out.'),
]

/** Ce qu'elle dit de son poste du moment. */
const POST_LINES: Record<ChiefPost, string> = {
  pad: tr('Je surveille l\'aire. Votre Krait est bien garé, pour une fois qu\'un pilote ne prend pas deux places.', 'Keeping an eye on the pad. Your Krait is parked nicely, for once a pilot doesn\'t take up two spots.'),
  tower: tr('Contrôle Bradbury, tout est vert. Enfin, tout est rouge, c\'est la planète. Mais les voyants sont verts.', 'Bradbury Control, all green. Well, everything\'s red, it\'s the planet. But the lights are green.'),
  garage: tr('Le rover a encore perdu une roue. Il en a six, il ne s\'en rendra pas compte.', 'The rover lost a wheel again. It has six, it won\'t notice.'),
  greenhouse: tr('J\'arrose la serre. Enfin, je regarde le système d\'arrosage arroser. C\'est un travail aussi.', 'Watering the greenhouse. Well, watching the sprinklers water it. That\'s a job too.'),
  quarters: tr('Chez moi. Six couchettes, j\'en utilise une. Les cinq autres, ce sont mes étagères.', 'Home. Six bunks, I use one. The other five are my shelves.'),
  rocket: tr('Je vérifie la fusée. Réservoirs pleins, ailerons en place, graffiti toujours là.', 'Checking the rocket. Tanks full, fins in place, graffiti still there.'),
  machines: tr('Générateur à 98 %. Les 2 % restants, il les garde pour lui.', 'Generator at 98%. It keeps the other 2% for itself.'),
  crystals: tr('Je compte les cristaux. Il en pousse un par an. Celui-là, il est tout neuf.', 'Counting the crystals. One grows every year. That one is brand new.'),
}

/** Répliques lancées en passant, dans une bulle. */
const BARKS = [
  tr('Bienvenue à Bradbury !', 'Welcome to Bradbury!'),
  tr('Attention à la poussière.', 'Mind the dust.'),
  tr('Les cristaux, on regarde, on ne touche pas.', 'Crystals: look, don\'t touch.'),
  tr('Contrôle, ici Kerlan. RAS.', 'Control, Kerlan here. All clear.'),
  tr('Belle journée. Rouge, mais belle.', 'Lovely day. Red, but lovely.'),
]

/** Quand un Krait met les gaz sur l'aire. */
const TAKEOFF = [
  tr('Bon vol, commandant !', 'Safe flight, commander!'),
  tr('Revenez quand vous voulez !', 'Come back anytime!'),
  tr('Saluez Nico de ma part !', 'Say hi to Nico for me!'),
]

export class Chief {
  readonly avatar: Avatar
  readonly root: THREE.Group
  private clock: PatrolClock = { tau: Date.now() / 1000, at: Date.now(), holdUntil: 0 }
  private face: { x: number; z: number } | null = null
  private yaw = 0
  private placed = false
  private stride = 0
  /** Fin de l'allumage des réacteurs du Krait de la base (ms de l'appareil), 0 sinon. */
  private burnUntil = 0
  private barkIn = 10 + Math.random() * 10
  private recent: string[] = []

  onStep?: () => void
  onBark?: (text: string) => void

  constructor(rig: Awaited<ReturnType<typeof chiefRig>>, readonly deck: Deck) {
    this.avatar = new Avatar(rig)
    this.root = this.avatar.root
    deck.group.add(this.root)
  }

  get position(): THREE.Vector3 {
    return this.root.position
  }

  /** Les réacteurs du Krait de la base tournent (d'après le relais, ou nous-mêmes). */
  get burning(): boolean {
    return Date.now() < this.burnUntil
  }

  /** Où en est la ronde, et le Krait de la base, d'après le relais. */
  sync(s: ChiefState) {
    const now = Date.now()
    this.clock = { tau: s.tau, at: now, holdUntil: now + s.hold * 1000 }
    this.face = s.face ?? null
    this.setBurn(s.burn, false)
  }

  /**
   * Réacteurs du Krait de la base : allumés pour `seconds` (0 : coupés). Elle se tourne vers le
   * cockpit et salue de la main. `local` : c'est nous qui les avons lancés (elle ne l'apprendra du
   * relais qu'un peu plus tard).
   */
  setBurn(seconds: number, local: boolean) {
    const now = Date.now()
    const was = this.burning
    this.burnUntil = seconds > 0 ? now + seconds * 1000 : 0
    if (!this.burning || was) return
    if (local) this.clock = holdChief(this.clock, now, seconds)
    this.face = { x: BASE_COCKPIT.x, z: BASE_COCKPIT.z }
    this.avatar.playEmote('salut')
    this.onBark?.(pick(TAKEOFF))
  }

  /** On lui parle : elle s'arrête, se tourne vers le commandant et répond. Rend la réplique. */
  talk(from: THREE.Vector3, report: ChiefReport): string {
    const now = Date.now()
    const post = CHIEF_POSTS[chiefAt(chiefTime(this.clock, now)).post]
    this.clock = holdChief(this.clock, now)
    this.face = { x: from.x, z: from.z }
    const pool = [
      ...TALK,
      POST_LINES[post.at],
      tr(`Nous sommes sur la quatrième planète de ${report.system}. Votre vaisseau est là-haut, quelque part derrière la poussière.`, `We\'re on the fourth planet of ${report.system}. Your ship is up there, somewhere behind the dust.`),
      report.visitors > 0
        ? tr(`${report.visitors + 1} visiteurs en même temps ! C'est l'heure de pointe. Je devrais installer un feu rouge.`, `${report.visitors + 1} visitors at once! It\'s rush hour. I should put up a traffic light.`)
        : tr('Vous êtes mon seul visiteur aujourd\'hui. Mon préféré, du coup.', 'You\'re my only visitor today. My favourite, then.'),
    ]
    const fresh = pool.filter((l) => !this.recent.includes(l))
    const line = pick(fresh.length ? fresh : pool)
    this.recent = [line, ...this.recent].slice(0, 8)
    return line
  }

  /** @param player position du joueur s'il est sur la base, sinon null */
  update(dt: number, player: THREE.Vector3 | null) {
    const now = Date.now()
    const p = this.root.position
    const at = chiefAt(chiefTime(this.clock, now))
    const holding = now < this.clock.holdUntil
    const walking = at.walking && !holding

    const before = { x: p.x, z: p.z }
    if (!this.placed || Math.hypot(at.x - p.x, at.z - p.z) > SNAP) {
      p.set(at.x, 0, at.z)
      this.yaw = at.yaw
      this.root.rotation.y = at.yaw
      this.placed = true
    } else {
      p.x = THREE.MathUtils.damp(p.x, at.x, 12, dt)
      p.z = THREE.MathUtils.damp(p.z, at.z, 12, dt)
    }
    const moved = Math.hypot(p.x - before.x, p.z - before.z)

    // Vers celui qui lui parle, vers le Krait qui décolle, sinon sa ronde.
    const toward = (holding || this.burning) && this.face ? this.face : null
    this.yaw = toward ? Math.atan2(toward.x - p.x, toward.z - p.z) : at.yaw

    this.avatar.setLocomotion(walking ? 'walk' : 'idle', walking ? CHIEF_SPEED : 0)
    if (walking) {
      this.stride += moved
      if (this.stride > 0.32) {
        this.stride = 0
        this.onStep?.()
      }
    }

    const distPlayer = player ? Math.hypot(player.x - p.x, player.z - p.z) : Infinity
    this.barkIn -= dt
    if (this.barkIn <= 0) {
      this.barkIn = 25 + Math.random() * 25
      if (distPlayer < 5 && !holding) this.onBark?.(pick(BARKS))
    }

    this.root.rotation.y = dampAngle(this.root.rotation.y, this.yaw, 7, dt)
    this.avatar.update(dt)
  }
}
