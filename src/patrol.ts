import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { Avatar } from './avatar'
import type { Deck } from './deck'
import type { TaskKind } from './economy/data'
import { tr } from './i18n'
import { suitRig, type SuitStyle } from './looks'
import type { PatrolState } from './net'
import { dampAngle } from './player'
import { PATROL_SPEED, holdPatrol, patrolAt, patrolTime, type PatrolClock } from '../shared/patrol.js'

/*
 * Le sergent Rourke, de la sécurité de bord : un soldat en armure, fusil laser en main, qui fait
 * sa ronde de pièce en pièce sur le pont principal. Il s'arrête à chaque poste pour surveiller
 * les lieux, répond au salut « o7 », et quand on lui parle, il s'interrompt, se tourne vers le
 * commandant et lui glisse une réplique : son métier, l'état du vaisseau, la propreté du bord.
 * Il est le même pour tout le bord : sa ronde suit l'horloge que tient le relais (cf.
 * shared/patrol.js) ; hors ligne, l'heure de l'appareil.
 */

export const SERGEANT = tr('Sergent Rourke', 'Sergeant Rourke')

/** Combinaison de la sécurité : sous-couche anthracite, plaques gris clair, visière cyan. */
const SOLDIER_SUIT: SuitStyle = {
  ramp: [[0, '#0b0f15'], [0.4, '#1b222c'], [0.75, '#35414f'], [0.87, '#7f93a8'], [1, '#cfdbe6']],
  glove: '#1a2029',
  helmet: 'visor',
  shell: '#c3ccd6',
  visor: '#27c6ff',
  light: '#27c6ff',
}

/** Au-delà de cet écart avec sa place dans la ronde (reconnexion, arrêt venu du relais), il y saute. */
const SNAP = 1.5

// --------------------------------------------------------------- apparence

/** Direction de repos des bras (pose en T) : le long de x, vers l'extérieur. */
const REST_RIGHT = new THREE.Vector3(-1, 0, 0)
const REST_LEFT = new THREE.Vector3(1, 0, 0)
/**
 * Pose « fusil en main » (dans le repère du torse, le personnage regarde vers +z) : la main
 * droite à la poignée, la gauche plus en avant, sous le canon.
 */
const HOLD = {
  right: new THREE.Vector3(0.38, -0.5, 0.78).normalize(),
  left: new THREE.Vector3(-0.5, -0.22, 0.84).normalize(),
}
const holdRight = new THREE.Quaternion()
const holdLeft = new THREE.Quaternion()

function armorMaterials() {
  return {
    plate: new THREE.MeshLambertMaterial({ color: SOLDIER_SUIT.shell }),
    trim: new THREE.MeshLambertMaterial({ color: '#2a323d' }),
    metal: new THREE.MeshLambertMaterial({ color: '#3b4450' }),
    dark: new THREE.MeshLambertMaterial({ color: '#15191f' }),
    glow: new THREE.MeshBasicMaterial({ color: SOLDIER_SUIT.light }),
  }
}

const rbox = (w: number, h: number, d: number, m: THREE.Material, r = Math.min(w, h, d) * 0.2) =>
  new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 1, r), m)
const box = (w: number, h: number, d: number, m: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)

/** Plastron, ceinturon, épaulières et genouillères, accrochés aux os des Mini Characters. */
function addArmor(root: THREE.Object3D, m: ReturnType<typeof armorMaterials>) {
  const torso = root.getObjectByName('torso')
  if (!torso) return
  // Repère du torse : le bassin à l'origine, les épaules vers y = 0,11, l'avant du buste vers z = 0,13.
  const chest = rbox(0.25, 0.11, 0.05, m.plate)
  chest.position.set(0, 0.1, 0.128)
  const plateau = rbox(0.17, 0.05, 0.03, m.trim)
  plateau.position.set(0, 0.075, 0.152)
  const badge = box(0.04, 0.02, 0.01, m.glow)
  badge.position.set(0.06, 0.125, 0.155)
  const belt = rbox(0.31, 0.04, 0.29, m.trim, 0.012)
  belt.position.set(0, 0.018, 0)
  const buckle = box(0.05, 0.03, 0.01, m.metal)
  buckle.position.set(0, 0.018, 0.147)
  torso.add(chest, plateau, badge, belt, buckle)
  // Cartouchières de part et d'autre de la boucle.
  for (const x of [-0.1, 0.1]) {
    const pouch = rbox(0.045, 0.04, 0.03, m.metal, 0.008)
    pouch.position.set(x, 0.01, 0.15)
    torso.add(pouch)
  }
  // Épaulières sur le torse : elles restent en place quand les bras tiennent le fusil.
  for (const side of [-1, 1]) {
    const pad = rbox(0.12, 0.05, 0.15, m.plate, 0.02)
    pad.position.set(side * 0.13, 0.155, 0.005)
    pad.rotation.z = side * -0.35
    const rim = box(0.1, 0.012, 0.152, m.trim)
    rim.position.set(side * 0.145, 0.13, 0.005)
    rim.rotation.z = side * -0.35
    torso.add(pad, rim)
  }
  // Casque de la sécurité : une crête sur le dessus et une antenne radio.
  const head = root.getObjectByName('head')
  if (head) {
    // Le dessus du casque est vers y = 0,405, ses flancs vers x = ±0,25.
    const crest = rbox(0.05, 0.045, 0.3, m.trim, 0.012)
    crest.position.set(0, 0.41, -0.01)
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.16, 6), m.dark)
    mast.position.set(-0.26, 0.42, -0.1)
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 6), m.glow)
    beacon.position.set(-0.26, 0.505, -0.1)
    head.add(crest, mast, beacon)
  }
  for (const name of ['leg-left', 'leg-right']) {
    const leg = root.getObjectByName(name)
    if (!leg) continue
    const knee = rbox(0.09, 0.06, 0.03, m.plate, 0.01)
    knee.position.set(0, -0.085, 0.075)
    leg.add(knee)
  }
}

/** Fusil laser (le canon vers +z) : crosse, carcasse, cellule d'énergie lumineuse, lunette, émetteur. */
function laserRifle(m: ReturnType<typeof armorMaterials>): THREE.Group {
  const g = new THREE.Group()
  const body = rbox(0.05, 0.06, 0.2, m.metal, 0.01)
  const stock = rbox(0.04, 0.055, 0.1, m.dark, 0.01)
  stock.position.set(0, -0.012, -0.14)
  const cell = box(0.054, 0.014, 0.12, m.glow)
  cell.position.set(0, 0.008, 0.01)
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.15, 10), m.dark)
  barrel.rotation.x = Math.PI / 2
  barrel.position.set(0, 0.008, 0.17)
  const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.05, 10), m.trim)
  shroud.rotation.x = Math.PI / 2
  shroud.position.set(0, 0.008, 0.12)
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.013, 0.02, 10), m.glow)
  tip.rotation.x = Math.PI / 2
  tip.position.set(0, 0.008, 0.25)
  const scope = rbox(0.022, 0.026, 0.08, m.dark, 0.006)
  scope.position.set(0, 0.046, 0.02)
  const lens = box(0.016, 0.016, 0.004, m.glow)
  lens.position.set(0, 0.046, 0.061)
  const grip = box(0.03, 0.06, 0.03, m.dark)
  grip.position.set(0, -0.05, -0.04)
  grip.rotation.x = -0.25
  const mag = box(0.032, 0.05, 0.04, m.trim)
  mag.position.set(0, -0.048, 0.05)
  g.add(body, stock, cell, barrel, shroud, tip, scope, lens, grip, mag)
  g.traverse((o) => { o.castShadow = true })
  return g
}

/** Le soldat, prêt à patrouiller : combinaison, armure, fusil dans les mains. */
export async function soldierRig() {
  const r = await suitRig('male', 'd', SOLDIER_SUIT)
  const m = armorMaterials()
  addArmor(r.root, m)
  const torso = r.root.getObjectByName('torso')
  const rifle = laserRifle(m)
  // Entre les deux mains, légèrement pointé vers le sol (arme basse, doigt hors de la détente).
  rifle.scale.setScalar(1.6)
  rifle.position.set(-0.03, 0.05, 0.3)
  rifle.rotation.set(0.18, 0, 0)
  ;(torso ?? r.root).add(rifle)
  return { ...r, rifle }
}

// --------------------------------------------------------------- répliques

/** Ce que le sergent sait du bord au moment où on lui parle (cf. main.ts). */
export interface ShipReport {
  /** Système où se trouve le vaisseau. */
  system: string
  /** Pièce du pont principal où il se trouve. */
  room: string
  /** Tâches en attente sur le pont principal : leur nature et leur pièce. */
  deck: { kind: TaskKind; room: string }[]
  /** Tâches en attente dans les quartiers du commandant. */
  quarters: TaskKind[]
  /** Tâches en attente dans la cale. */
  hold: number
}

/** Ce que le sergent voit d'une tâche, dans ses mots. */
const SEEN: Record<TaskKind, string> = {
  trash: tr('des ordures qui traînent', 'litter lying around'),
  spill: tr('une flaque suspecte', 'a suspicious puddle'),
  plant: tr('une plante qui fait grise mine', 'a plant looking sorry for itself'),
  fur: tr('des poils de chat partout', 'cat fur everywhere'),
  dishes: tr('de la vaisselle sale', 'dirty dishes'),
  crates: tr('des conteneurs mal rangés', 'badly stacked canisters'),
  limpets: tr('des drones qui traînent hors de leur baie', 'limpets roaming outside their bay'),
  console: tr('une console déréglée', 'a console out of calibration'),
  filter: tr('un filtre à air encrassé', 'a clogged air filter'),
  breach: tr('une brèche dans la coque', 'a hull breach'),
  broken: tr('un panneau en panne', 'a broken panel'),
  steam: tr('une fuite de vapeur', 'a steam leak'),
}
/** Tâches qui relèvent de la sécurité du vaisseau plutôt que du ménage. */
const HAZARDS: TaskKind[] = ['breach', 'steam', 'broken', 'console', 'filter']

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]

/** Son métier, sa ronde, sa vie à bord. */
const DUTY = [
  tr('Patrouille en cours. Pont principal : rien à signaler. Enfin… rien d\'officiel.', 'Patrol in progress. Main deck: nothing to report. Well… nothing official.'),
  tr('Si vous croisez un Thargoïde, ne courez pas. Enfin si, courez. Mais pas dans la coursive.', 'If you run into a Thargoid, don\'t run. Actually, do run. Just not in the corridor.'),
  tr('Ce fusil laser ? Modèle réglementaire. Il n\'a jamais tiré que sur des cibles d\'entraînement. Et sur un grille-pain, une fois. Il l\'avait cherché.', 'This laser rifle? Standard issue. It has only ever fired at training targets. And a toaster, once. It had it coming.'),
  tr('Quarante-deuxième ronde aujourd\'hui. Mes bottes connaissent la coursive mieux que moi.', 'Forty-second round today. My boots know the corridor better than I do.'),
  tr('On m\'a demandé de surveiller les passagers clandestins. Pour l\'instant, mon seul suspect, c\'est Comète.', 'I was told to watch for stowaways. So far my only suspect is Comète.'),
  tr('Règle n° 1 à bord : on ne court pas dans la coursive. Règle n° 2 : voir règle n° 1.', 'Rule #1 aboard: no running in the corridor. Rule #2: see rule #1.'),
  tr('Contrôle de routine : visière propre, cellule d\'énergie chargée, moral… en cours de chargement.', 'Routine check: visor clean, power cell charged, morale… still loading.'),
  tr('J\'ai servi trois ans sur un Farragut. Ici, au moins, on entend le jukebox.', 'I served three years on a Farragut. Here, at least, you can hear the jukebox.'),
  tr('Pas de pirates en vue. Je vérifie quand même sous les tables du Mess. On ne sait jamais.', 'No pirates in sight. I still check under the mess tables. You never know.'),
  tr('Si l\'alarme sonne, restez derrière moi. Si c\'est l\'alarme incendie, passez devant : c\'est vous qui connaissez la sortie.', 'If the alarm goes off, stay behind me. If it\'s the fire alarm, go first: you know where the exit is.'),
  tr('Mon casque filtre tout. Sauf l\'odeur du café de la salle commune. Heureusement.', 'My helmet filters everything. Except the smell of coffee from the common room. Thankfully.'),
  tr('Interdiction formelle de toucher au gros bouton rouge du cockpit. Oui, même « juste pour voir ».', 'Strictly forbidden to touch the big red button in the cockpit. Yes, even “just to see”.'),
  tr('Le fauteuil du commandant est sous ma protection. Personne ne s\'y assoit sans autorisation. Sauf vous. Évidemment.', 'The commander\'s chair is under my protection. Nobody sits in it without clearance. Except you. Obviously.'),
  tr('Les gamins du L.J.P.C. m\'ont proposé de rejoindre leur club. J\'ai décliné : ils me font plus peur que les Thargoïdes.', 'The L.J.P.C. kids asked me to join their club. I declined: they scare me more than the Thargoids.'),
  tr('Rapport de ronde : zéro incident, trois tasses oubliées, un chat endormi sur une console.', 'Patrol log: zero incidents, three forgotten mugs, one cat asleep on a console.'),
  tr('Quelqu\'un a encore mangé ma ration marquée « SERGENT » au Mess. J\'ouvre une enquête.', 'Someone ate my ration marked “SERGEANT” in the mess again. I\'m opening an investigation.'),
  tr('Trente-deux kilos d\'armure. Je la garde même à la salle de sport. Surtout à la salle de sport.', 'Thirty-two kilos of armour. I keep it on even at the gym. Especially at the gym.'),
  tr('À l\'infirmerie, ils me connaissent bien. La porte double et moi, on a un contentieux.', 'The medical bay knows me well. The double door and I have a history.'),
  tr('Un jour, on me mutera sur une station Orbis. En attendant, cette coursive est ma frontière.', 'One day they\'ll transfer me to an Orbis station. Until then, this corridor is my frontier.'),
  tr('Le salon d\'arcade est calme. Trop calme. Quelqu\'un prépare un record au Mini-CQC, je le sens.', 'The arcade lounge is quiet. Too quiet. Someone is going for a Mini-CQC record, I can feel it.'),
  tr('Consigne du jour : garder l\'œil ouvert. Le droit, du moins. Le gauche se repose.', 'Today\'s orders: keep your eyes open. The right one, at least. The left one\'s resting.'),
  tr('Je ne dors jamais pendant le service. Je fais des inspections de paupières, nuance.', 'I never sleep on duty. I conduct eyelid inspections. Big difference.'),
]

/** Répliques qui dépendent de l'état du bord. */
function reportLines(r: ShipReport): string[] {
  const lines = [
    tr(`Position : ${r.system}. Périmètre sécurisé, à mon humble avis.`, `Position: ${r.system}. Perimeter secure, in my humble opinion.`),
    tr(`${r.room} : ronde effectuée, aucun intrus. À part vous, commandant. Mais vous, vous êtes autorisé.`, `${r.room}: sweep complete, no intruders. Apart from you, commander. But you\'re cleared.`),
    tr('Boucliers à 100 %, coque à 100 %. Moral de l\'équipage : je vérifie et je reviens vers vous.', 'Shields at 100%, hull at 100%. Crew morale: I\'ll check and get back to you.'),
  ]
  // Le pont principal : une anomalie au hasard, ou des félicitations.
  if (r.deck.length) {
    const t = pick(r.deck)
    const seen = SEEN[t.kind]
    if (HAZARDS.includes(t.kind)) {
      lines.push(tr(
        `Alerte de niveau jaune : ${seen} (${t.room}). J'ai posé un panneau « Attention ». Le protocole ne m'autorise pas davantage.`,
        `Yellow alert: ${seen} (${t.room}). I put up a “Caution” sign. Protocol doesn't allow me to do more.`,
      ))
    } else {
      lines.push(tr(
        `Rapport de ronde : ${seen} (${t.room}). Ce n'est pas mon travail. Mais si c'était mon travail, ce serait déjà fait.`,
        `Patrol report: ${seen} (${t.room}). Not my job. But if it were my job, it would already be done.`,
      ))
    }
    if (r.deck.length > 2) lines.push(tr(`${r.deck.length} anomalies sur le pont principal. À ce rythme, je vais devoir demander des renforts. Avec des serpillières.`, `${r.deck.length} anomalies on the main deck. At this rate I\'ll need reinforcements. With mops.`))
  } else {
    lines.push(
      tr('Pont principal impeccable. Je pourrais manger par terre. Je ne le ferai pas, mais je pourrais.', 'Main deck spotless. I could eat off the floor. I won\'t, but I could.'),
      tr('Aucune anomalie sur le pont. Même les consoles sont alignées au millimètre. J\'ai vérifié. Deux fois.', 'No anomalies on deck. Even the consoles are lined up to the millimetre. I checked. Twice.'),
    )
  }
  // Les quartiers du commandant.
  if (r.quarters.length) {
    const seen = SEEN[pick(r.quarters)]
    lines.push(
      tr(`Inspection de vos quartiers, commandant : ${seen}. Je le note au rapport… au crayon, pour que vous puissiez l'effacer.`, `Inspection of your quarters, commander: ${seen}. I\'m noting it in my report… in pencil, so you can erase it.`),
      tr(`Sans vouloir vous commander, commandant : dans vos quartiers, ${seen}. Un soldat ne laisserait pas passer ça.`, `Not to give you orders, commander, but in your quarters: ${seen}. A soldier wouldn\'t let that slide.`),
    )
  } else {
    lines.push(
      tr('Vos quartiers ? Inspection passée : sol propre, lit fait. Je vous mets un 18 sur 20. Les deux points, c\'est pour la forme.', 'Your quarters? Inspection passed: clean floor, bed made. I\'m giving you 18 out of 20. The missing two are a matter of principle.'),
      tr('Vos quartiers sont d\'une propreté militaire, commandant. Je suis presque jaloux.', 'Your quarters are military-grade clean, commander. I\'m almost jealous.'),
    )
  }
  if (r.hold) lines.push(tr('Je ne descends pas à la cale : ce n\'est pas mon secteur. Mais d\'ici, ça sent le travail en retard.', 'I don\'t go down to the hold: not my sector. But from here, it smells like overdue chores.'))
  else lines.push(tr('Jacques dit que la cale est nickel. Venant d\'un barman, je prends ça avec des pincettes.', 'Jacques says the hold is spotless. Coming from a bartender, I take that with a grain of salt.'))
  return lines
}

/** Répliques lancées en passant, dans une bulle. */
const BARKS = [
  tr('RAS.', 'All clear.'),
  tr('Secteur sécurisé.', 'Sector secure.'),
  tr('Ronde en cours.', 'On patrol.'),
  tr('Circulez, commandant.', 'Carry on, commander.'),
  tr('Contrôle, ici Rourke. Rien à signaler.', 'Control, Rourke here. Nothing to report.'),
  tr('Garde à vous… Repos.', 'Attention… At ease.'),
]

// --------------------------------------------------------------- ronde

export class Patroller {
  readonly avatar: Avatar
  readonly root: THREE.Group
  /** Horloge de la ronde (ms de l'appareil) : celle du relais, recalée à chacun de ses messages. */
  private clock: PatrolClock = { tau: Date.now() / 1000, at: Date.now(), holdUntil: 0 }
  /** Pendant un arrêt : le joueur vers qui il se tourne. */
  private face: { x: number; z: number } | null = null
  private yaw = 0
  private placed = false
  private stride = 0
  /** Salut rendu : il regarde celui qui l'a salué, s'il est à son poste. */
  private greeting: { x: number; z: number; until: number } | null = null
  private barkIn = 12 + Math.random() * 10
  private saluteCooldown = 0
  private danceCooldown = 0
  private recent: string[] = []
  private readonly torso: THREE.Object3D | null
  /** Buste au repos (avant toute animation) : il y revient en marchant, le fusil bien droit. */
  private readonly torsoRest = new THREE.Quaternion()
  private readonly armRight: THREE.Object3D | null
  private readonly armLeft: THREE.Object3D | null

  onStep?: () => void
  onBark?: (text: string) => void

  constructor(rig: Awaited<ReturnType<typeof soldierRig>>, readonly deck: Deck) {
    this.torso = rig.root.getObjectByName('torso') ?? null
    if (this.torso) this.torsoRest.copy(this.torso.quaternion)
    this.avatar = new Avatar(rig)
    this.root = this.avatar.root
    this.armRight = rig.root.getObjectByName('arm-right') ?? null
    this.armLeft = rig.root.getObjectByName('arm-left') ?? null
    deck.group.add(this.root)
  }

  get position(): THREE.Vector3 {
    return this.root.position
  }

  /** Où en est la ronde, d'après le relais (à l'arrivée à bord, ou quand quelqu'un lui parle). */
  sync(s: PatrolState) {
    const now = Date.now()
    this.clock = { tau: s.tau, at: now, holdUntil: now + s.hold * 1000 }
    this.face = s.face ?? null
  }

  /**
   * On lui parle : il s'arrête tout de suite (le relais confirme l'arrêt pour tout le bord), se
   * tourne vers le commandant et répond. Rend la réplique.
   */
  talk(from: THREE.Vector3, report: ShipReport): string {
    this.clock = holdPatrol(this.clock, Date.now())
    this.face = { x: from.x, z: from.z }
    // Une réplique sur l'état du bord une fois sur deux, sans redire les dernières.
    const pool = Math.random() < 0.5 ? reportLines(report) : DUTY
    const fresh = pool.filter((l) => !this.recent.includes(l))
    const line = pick(fresh.length ? fresh : pool)
    this.recent = [line, ...this.recent].slice(0, 8)
    return line
  }

  /** Un joueur le salue (o7) à côté de lui : il rend le salut, sans quitter sa ronde. */
  greet(from: { x: number; z: number }, local: boolean) {
    const p = this.root.position
    if (this.saluteCooldown > 0 || Math.hypot(from.x - p.x, from.z - p.z) > 3.5) return
    this.saluteCooldown = 8
    this.greeting = { x: from.x, z: from.z, until: Date.now() + 2400 }
    this.avatar.playEmote('o7')
    if (local) this.onBark?.(tr('o7, commandant !', 'o7, commander!'))
  }

  /**
   * @param player position du joueur s'il est sur le pont principal, sinon null
   * @param emote emote en cours du joueur (il répond au salut « o7 »)
   */
  update(dt: number, player: THREE.Vector3 | null, emote: string | null) {
    const now = Date.now()
    const p = this.root.position
    const at = patrolAt(patrolTime(this.clock, now))
    const holding = now < this.clock.holdUntil
    const walking = at.walking && !holding
    this.saluteCooldown -= dt
    this.danceCooldown -= dt

    // Sa place dans la ronde : il la suit de près, et y saute s'il en est loin.
    const before = { x: p.x, z: p.z }
    if (!this.placed || Math.hypot(at.x - p.x, at.z - p.z) > SNAP) {
      p.x = at.x
      p.z = at.z
      this.yaw = at.yaw
      this.root.rotation.y = at.yaw
      this.placed = true
    } else {
      p.x = THREE.MathUtils.damp(p.x, at.x, 12, dt)
      p.z = THREE.MathUtils.damp(p.z, at.z, 12, dt)
    }
    const moved = Math.hypot(p.x - before.x, p.z - before.z)

    const distPlayer = player ? Math.hypot(player.x - p.x, player.z - p.z) : Infinity
    if (player && emote === 'o7') this.greet(player, true)
    else if (player && emote === 'danse' && distPlayer < 3 && this.danceCooldown <= 0) {
      this.danceCooldown = 30
      this.onBark?.(tr('Négatif. Pas de danse pendant le service.', 'Negative. No dancing on duty.'))
    }

    // Où il regarde : vers celui qui lui parle, vers celui qui le salue (à l'arrêt), sinon la ronde.
    const toward = holding && this.face ? this.face : !walking && this.greeting && now < this.greeting.until ? this.greeting : null
    this.yaw = toward ? Math.atan2(toward.x - p.x, toward.z - p.z) : at.yaw

    this.avatar.setLocomotion(walking ? 'walk' : 'idle', walking ? PATROL_SPEED : 0)
    if (walking) {
      this.stride += moved
      if (this.stride > 0.32) {
        this.stride = 0
        this.onStep?.()
      }
    }

    this.barkIn -= dt
    if (this.barkIn <= 0) {
      this.barkIn = 25 + Math.random() * 25
      if (distPlayer < 5 && !holding) this.onBark?.(pick(BARKS))
    }

    this.root.rotation.y = dampAngle(this.root.rotation.y, this.yaw, 7, dt)
    this.avatar.update(dt)
    this.holdRifle()
  }

  /** Les bras tiennent le fusil par-dessus l'animation (sauf le bras droit pendant le salut). */
  private holdRifle() {
    const saluting = this.avatar.emoteId === 'o7'
    if (this.armRight && !saluting) this.armRight.quaternion.copy(holdRight.setFromUnitVectors(REST_RIGHT, HOLD.right))
    if (this.armLeft) this.armLeft.quaternion.copy(holdLeft.setFromUnitVectors(REST_LEFT, HOLD.left))
    // Le buste reste droit : l'animation de marche le balance, le fusil avec.
    if (this.torso) this.torso.quaternion.slerp(this.torsoRest, 0.6)
  }
}
