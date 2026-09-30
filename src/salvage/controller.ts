import * as THREE from 'three'
import { Avatar } from '../avatar'
import { tr } from '../i18n'
import { boxInBone, suitRig, type SuitStyle } from '../looks'
import { dampAngle } from '../player'

/*
 * Odile, la contrôleuse de la zone thargoïde : elle tient le poste de sécurité du lobby de la cale,
 * derrière ses vitres blindées et sa porte verrouillée (cf. la pièce 't' de shared/ship-layouts.js).
 * Le mur des caméras de la baie est dans son dos : elle y jette un œil, se retourne quand quelqu'un
 * s'approche de l'interphone, et parle. Elle briefe les équipes, rappelle les règles de la baie,
 * s'inquiète pour Gaspard (son collègue, barricadé dans le guichet de la baie), et suit la mission
 * de chacun. De temps en temps, elle lâche un mot dans le micro du lobby. Elle n'existe que dans
 * l'affichage : chaque client a la sienne.
 */

export const CONTROLLER = 'Odile'

/** Où elle se tient (coordonnées de la cale) et où l'on se met pour lui parler, à l'interphone. */
export const CONTROL_POST = { at: { x: 21, z: 0.62 }, intercom: { x: 21, z: 2.05 }, screens: { x: 21, z: -0.4 } }

/** Uniforme bleu nuit de la sécurité, galons orange d'Elite, gants noirs. */
const CONTROL_SUIT: SuitStyle = {
  ramp: [[0, '#0d1420'], [0.35, '#1f2d48'], [0.6, '#34507a'], [0.85, '#5b7eb0'], [1, '#ff8a1c']],
  glove: '#15181c',
  helmet: 'none',
  shell: '#1f2d48',
  visor: '#000000',
  light: '#5fd4ff',
}

/** Casque-micro, lunettes, badge de la sécurité et tablette. */
function addControllerGear(root: THREE.Object3D) {
  const head = root.getObjectByName('head')
  const headMesh = root.getObjectByName('head-mesh') as THREE.Mesh | undefined
  const dark = new THREE.MeshLambertMaterial({ color: '#1b1e24' })
  if (head && headMesh) {
    root.updateMatrixWorld(true)
    const hb = boxInBone(headMesh, head)
    const size = hb.getSize(new THREE.Vector3())
    const center = hb.getCenter(new THREE.Vector3())
    // Arceau par-dessus la tête, deux écouteurs, la tige du micro devant la bouche.
    const band = new THREE.Mesh(new THREE.TorusGeometry(size.x * 0.52, size.x * 0.035, 6, 20, Math.PI), dark)
    band.position.set(center.x, center.y + size.y * 0.05, center.z)
    head.add(band)
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CylinderGeometry(size.x * 0.13, size.x * 0.13, size.x * 0.09, 12), dark)
      ear.rotation.z = Math.PI / 2
      ear.position.set(center.x + s * size.x * 0.52, center.y, center.z)
      head.add(ear)
    }
    const boom = new THREE.Mesh(new THREE.BoxGeometry(size.x * 0.03, size.x * 0.03, size.z * 0.5), dark)
    boom.position.set(center.x + size.x * 0.4, center.y - size.y * 0.2, center.z + size.z * 0.25)
    boom.rotation.y = -0.5
    const mic = new THREE.Mesh(new THREE.SphereGeometry(size.x * 0.05, 8, 6), new THREE.MeshBasicMaterial({ color: '#5fd4ff' }))
    mic.position.set(center.x + size.x * 0.15, center.y - size.y * 0.22, hb.max.z + size.z * 0.03)
    // Lunettes fines.
    const frame = new THREE.MeshBasicMaterial({ color: '#0b0d10' })
    for (const s of [-1, 1]) {
      const lens = new THREE.Mesh(new THREE.TorusGeometry(size.x * 0.1, size.x * 0.014, 5, 14), frame)
      lens.position.set(center.x + s * size.x * 0.17, center.y + size.y * 0.05, hb.max.z + size.z * 0.005)
      head.add(lens)
    }
    head.add(boom, mic)
  }
  const torso = root.getObjectByName('torso')
  if (torso) {
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.06, 0.005), new THREE.MeshBasicMaterial({ color: '#ffd166' }))
    badge.position.set(-0.08, 0.08, 0.142)
    const tablet = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.012), dark)
    tablet.position.set(0.05, -0.02, 0.17)
    tablet.rotation.x = -0.5
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.08), new THREE.MeshBasicMaterial({ color: '#2b6f9e' }))
    screen.position.set(0.05, -0.016, 0.177)
    screen.rotation.x = -0.5
    torso.add(badge, tablet, screen)
  }
}

/** Odile, casque sur les oreilles. */
export async function controllerRig() {
  const r = await suitRig('female', 'c', CONTROL_SUIT)
  addControllerGear(r.root)
  return r
}

// --------------------------------------------------------------- répliques

/** Ce qu'Odile sait de celui qui lui parle (cf. client.ts). */
export interface ControllerReport {
  /** none : pas d'équipe ; forming : en train de se former ; playing : son équipe est dans la baie ; caught : capturé, l'équipe continue. */
  phase: 'none' | 'forming' | 'playing' | 'caught'
  /** Membres de son équipe, colis et ennemis réglés. */
  team: number
  parcels: number
  enemies: number
  /** Colis livrés et coéquipiers encore debout (en mission). */
  delivered: number
  alive: number
  /** Dernière mission finie (de ce joueur), s'il y en a une. */
  last: { won: boolean; grade?: string; delivered: number; parcels: number } | null
  /** Invité (pas de crédits). */
  guest: boolean
}

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]

/** Le briefing : comment se passe une mission. */
const BRIEFING = [
  tr('Le terminal, au milieu : vous formez une équipe, jusqu\'à quatre. Le chef règle les colis et les ennemis. Tout le monde se déclare prêt, et la porte blindée s\'ouvre.', 'The terminal in the middle: form a crew, up to four. The leader sets crates and enemies. Everyone says ready, and the blast door opens.'),
  tr('Vous entrez dans la baie 7, au hasard, loin d\'eux. Vous trouvez les colis, vous les rapportez au sas d\'extraction, au sud. Ils n\'y entrent pas.', 'You enter bay 7 at random, away from them. Find the crates, bring them back to the extraction airlock, to the south. They don\'t go in there.'),
  tr('Un seul colis à la fois, et il pèse. La flèche verte au sol montre le sas. Ne vous perdez pas : le plan est sur la table de briefing.', 'One crate at a time, and it\'s heavy. The green arrow on the floor points to the airlock. Don\'t get lost: the map is on the briefing table.'),
  tr('Si l\'un d\'eux vous attrape, vous revenez ici, et vous suivez l\'équipe sur les caméras. Parlez-leur : vous verrez des choses qu\'ils ne voient pas.', 'If one of them catches you, you come back here and follow the crew on the cameras. Talk to them: you\'ll see things they can\'t.'),
]

/** Les règles de la baie, et ce qui a changé. */
const TIPS = [
  tr('Sous les projecteurs, la serre, le carrefour du guichet, le quai : on voit loin. Eux aussi. Traversez vite.', 'Under the floodlights, the hydroponics, the desk crossroads, the dock: you see far. So do they. Cross quickly.'),
  tr('La passerelle du hall de fret domine les conteneurs. De là-haut, on repère tout. Et tout vous repère.', 'The freight hall catwalk overlooks the containers. From up there you spot everything. And everything spots you.'),
  tr('Zone effondrée : du verre partout. Un pas dessus, et toute la baie l\'entend.', 'Collapsed zone: glass everywhere. One step on it and the whole bay hears.'),
  tr('Le nid est plein de flaques caustiques. On y avance comme dans de la colle. Contournez.', 'The nest is full of caustic puddles. It\'s like wading through glue. Go around.'),
  tr('Chaque colis livré réveille un peu plus la ruche. Gardez le plus facile pour la fin.', 'Every crate delivered wakes the hive a little more. Keep the easiest one for last.'),
  tr('Casiers : ils perdent votre trace, sauf s\'ils vous soufflent dans le cou quand vous y entrez.', 'Lockers: they lose your trail, unless they\'re breathing down your neck as you get in.'),
  tr('Les fusées rouges les attirent quinze secondes. Lancez loin de vous, pas à vos pieds.', 'Red flares draw them for fifteen seconds. Throw far from you, not at your feet.'),
  tr('Marcher ne fait pas de bruit. Courir, si. Et courir avec un colis, encore plus.', 'Walking is silent. Running isn\'t. Running with a crate, even less so.'),
]

/** Sa vie au poste. */
const LIFE = [
  tr('Gaspard est coincé dans le guichet de la baie depuis trois jours. Si vous passez devant, dites-lui que je garde sa tasse au chaud.', 'Gaspard\'s been stuck in the bay\'s security desk for three days. If you pass by, tell him I\'m keeping his mug warm.'),
  tr('La baie 7 était la plus propre de la flotte. On y mangeait par terre. Maintenant, c\'est eux qui y mangent.', 'Bay 7 was the cleanest in the fleet. You could eat off the floor. Now they do.'),
  tr('Je regarde ces écrans douze heures par jour. Hier, l\'une des caméras m\'a regardée.', 'I watch these screens twelve hours a day. Yesterday one of the cameras looked back.'),
  tr('Ma porte ? Verrouillée. Mes vitres ? Blindées. Mon café ? Froid. Deux sur trois, c\'est un bon jour.', 'My door? Locked. My windows? Armoured. My coffee? Cold. Two out of three is a good day.'),
  tr('Nico passe me voir le soir. Il parle de la Princesse, je parle des Thargoïdes. On ne s\'écoute pas, mais ça fait du bien.', 'Nico drops by in the evening. He talks about the Princess, I talk about Thargoids. We don\'t listen to each other, but it helps.'),
  tr('Jacques m\'a envoyé un cocktail « Anti-Hydre ». Je ne l\'ai pas bu. Il est vert. Il brille.', 'Jacques sent me an “Anti-Hydra” cocktail. I didn\'t drink it. It\'s green. It glows.'),
  tr('Consigne de sécurité : ne jamais tapoter la vitre. Je sursaute, je renverse mon café, et je deviens désagréable.', 'Safety rule: never tap the glass. I jump, I spill my coffee, and I get unpleasant.'),
]

function reportLines(r: ControllerReport): string[] {
  const lines: string[] = []
  if (r.phase === 'caught') {
    lines.push(
      tr(`Vous êtes rentré, c'est l'essentiel. Votre équipe est encore dedans : le mur des caméras, à gauche. Guidez-les.`, 'You made it back, that\'s what matters. Your crew is still inside: the camera wall, on the left. Guide them.'),
      tr(`Encore ${r.alive} debout, ${r.delivered} colis sur ${r.parcels}. Allez aux caméras, ils ont besoin de vos yeux.`, `${r.alive} still standing, ${r.delivered} of ${r.parcels} crates. Go to the cameras, they need your eyes.`),
    )
  } else if (r.phase === 'playing') {
    lines.push(tr(`Votre équipe est dans la baie : ${r.delivered} colis sur ${r.parcels}. Je croise les doigts. Les deux mains.`, `Your crew is in the bay: ${r.delivered} of ${r.parcels} crates. Fingers crossed. Both hands.`))
  } else if (r.phase === 'forming') {
    const tough = r.enemies > r.team * 1.5
    lines.push(tough
      ? tr(`${r.enemies} ennemis pour ${r.team} ? Vous êtes courageux. Ou mal informés. Je prépare les formulaires.`, `${r.enemies} enemies for ${r.team}? You\'re brave. Or badly briefed. I\'ll get the forms ready.`)
      : tr(`${r.parcels} colis, ${r.enemies} ennemi${r.enemies > 1 ? 's' : ''}. Raisonnable. Déclarez-vous prêts au terminal, j'ouvre la porte.`, `${r.parcels} crate${r.parcels > 1 ? 's' : ''}, ${r.enemies} ${r.enemies > 1 ? 'enemies' : 'enemy'}. Sensible. Say ready at the terminal and I\'ll open the door.`))
  } else {
    lines.push(tr('Pas encore d\'équipe ? Le terminal est au milieu du lobby. Seul, c\'est possible. Ensemble, c\'est plus drôle.', 'No crew yet? The terminal is in the middle of the lobby. Solo works. Together it\'s more fun.'))
  }
  if (r.last && r.phase !== 'playing' && r.phase !== 'caught') {
    if (r.last.won) {
      lines.push(r.last.grade === 'S'
        ? tr('Note S. Personne capturé, dans les temps. Je l\'encadre. Au-dessus de la machine à café.', 'An S grade. Nobody caught, on time. I\'m framing it. Above the coffee machine.')
        : tr(`Cargaison reçue au monte-charge${r.last.grade ? `, note ${r.last.grade}` : ''}. Beau travail. La prochaine fois, plus vite.`, `Cargo received at the lift${r.last.grade ? `, grade ${r.last.grade}` : ''}. Nice work. Next time, faster.`))
    } else {
      lines.push(tr(`On a perdu le signal de toute l'équipe : ${r.last.delivered} colis sur ${r.last.parcels}. Buvez un café, et on y retourne.`, `We lost signal from the whole crew: ${r.last.delivered} of ${r.last.parcels} crates. Have a coffee, then back in.`))
    }
  }
  if (r.guest) lines.push(tr('Vous n\'êtes pas connecté au site : pas de prime. Mais la baie ne fait pas la différence.', 'You\'re not logged in to the site: no bonus. But the bay doesn\'t care.'))
  return lines
}

/** Ce qu'elle dit dans le micro du lobby, de temps en temps. */
const BARKS = [
  tr('Caméra trois… rien. Caméra quatre… rien. Caméra cinq… ah. Non. Rien.', 'Camera three… nothing. Camera four… nothing. Camera five… oh. No. Nothing.'),
  tr('Poste de sécurité : la porte blindée reste fermée hors mission.', 'Security post: the blast door stays shut outside missions.'),
  tr('Quelqu\'un a vu ma tasse ? Grise, avec écrit « Chef ». Je ne suis pas chef.', 'Has anyone seen my mug? Grey, says “Boss”. I\'m not the boss.'),
  tr('Rappel : on ne court pas dans la baie. On ne court pas non plus dans le lobby, d\'ailleurs.', 'Reminder: no running in the bay. No running in the lobby either, by the way.'),
  tr('Gaspard, si tu m\'entends… non, tu ne m\'entends pas. Bon.', 'Gaspard, if you can hear me… no, you can\'t. Right.'),
  tr('Température de la baie : moins quatre. Humidité : beaucoup trop. Présences : oui.', 'Bay temperature: minus four. Humidity: far too much. Presences: yes.'),
]

/** Odile au poste : elle surveille ses écrans, se retourne vers qui approche, et parle. */
export class Controller {
  readonly avatar: Avatar
  readonly root: THREE.Group
  private time = Math.random() * 10
  private recent: string[] = []
  private yaw = 0
  /** Tournée vers ses écrans (dans son dos) ou vers la vitre. */
  private watching = false
  private switchIn = 5
  private barkIn = 25 + Math.random() * 20
  private busy = 0

  constructor(rig: Awaited<ReturnType<typeof controllerRig>>) {
    this.avatar = new Avatar(rig)
    this.root = this.avatar.root
    this.root.position.set(CONTROL_POST.at.x, 0, CONTROL_POST.at.z)
  }

  /** Une réplique selon la situation de celui qui parle (pas deux fois la même de suite). */
  talk(report: ControllerReport): string {
    const news = reportLines(report).filter((l) => !this.recent.includes(l))
    const pool = news.length && Math.random() < 0.6 ? news : [...news, ...BRIEFING, ...TIPS, ...LIFE].filter((l) => !this.recent.includes(l))
    const line = pick(pool.length ? pool : BRIEFING)
    this.recent = [...this.recent, line].slice(-8)
    this.watching = false
    this.busy = 3
    this.avatar.playEmote(pick(['salut', 'oui', 'interact']))
    return line
  }

  /**
   * @param visitor le joueur, s'il est près de l'interphone (elle se tourne vers lui)
   * @param inLobby le joueur est dans le lobby (elle parle dans le micro de temps en temps)
   * @returns une annonce à afficher, s'il y en a une
   */
  update(dt: number, visitor: { x: number; z: number } | null, inLobby: boolean): string | null {
    this.time += dt
    this.busy = Math.max(0, this.busy - dt)
    if ((this.switchIn -= dt) <= 0) {
      this.watching = !this.watching
      this.switchIn = this.watching ? 4 + Math.random() * 5 : 6 + Math.random() * 8
      // Face aux écrans, elle pianote.
      if (this.watching) this.avatar.playEmote('interact')
    }
    const p = this.root.position
    let goal = 0
    if (visitor && !this.busy) goal = Math.atan2(visitor.x - p.x, visitor.z - p.z)
    else if (this.watching && !this.busy) goal = Math.PI + Math.sin(this.time * 0.6) * 0.5
    else goal = Math.sin(this.time * 0.4) * 0.35
    this.yaw = dampAngle(this.yaw, goal, 5, dt)
    this.root.rotation.y = this.yaw
    this.avatar.update(dt)
    if (!inLobby) return null
    if ((this.barkIn -= dt) > 0) return null
    this.barkIn = 30 + Math.random() * 30
    return pick(BARKS)
  }

  dispose() {
    this.root.removeFromParent()
  }
}
