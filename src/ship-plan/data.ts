import { tr } from '../i18n'
import { LEVELS, LIFT } from '../levels'
import { ShipMap } from '../map'
import { mezzanineOf, shipMapOptions } from '../../shared/ship-layouts.js'
import { HOUSING_LEVEL } from '../../shared/housing-plot.js'
import { deckPlan, type DeckPlan } from './geometry'

/*
 * Ce que le plan du vaisseau dit de chaque pièce : sa zone (sa couleur), ce qu'on y fait, et
 * comment on y entre quand sa porte ne s'ouvre pas à tous. Les noms des pièces et des ponts sont
 * ceux de levels.ts. Une pièce ajoutée à un pont sans fiche ici reste sur le plan, en « passage ».
 */

export type ZoneId = 'life' | 'play' | 'sport' | 'lore' | 'work' | 'way'

/** Zones du plan : leur nom, la teinte de leurs pièces sur la feuille, et leur encre (pastille, contour). */
export const ZONES: Record<ZoneId, { name: string; fill: string; ink: string }> = {
  life: { name: tr('Vie à bord', 'Life aboard'), fill: '#f3dca9', ink: '#a8700f' },
  play: { name: tr('Jeux et spectacles', 'Games and shows'), fill: '#e2c8ec', ink: '#8440a0' },
  sport: { name: tr('Sport et tir', 'Sport and shooting'), fill: '#f6c6b6', ink: '#bf4225' },
  lore: { name: tr('Savoirs et nature', 'Learning and nature'), fill: '#c5e3c1', ink: '#2c7a43' },
  work: { name: tr('Postes de travail', 'Work stations'), fill: '#bdd3ee', ink: '#2a5c9e' },
  way: { name: tr('Passages', 'Passages'), fill: '#e3e7eb', ink: '#5b6676' },
}
export const ZONE_ORDER: ZoneId[] = ['life', 'play', 'sport', 'lore', 'work', 'way']

/** Couleurs de la feuille. */
export const SHEET = { paper: '#e9eef0', ink: '#172338', soft: '#536075', rule: '#b4bfc9', here: '#e5401c', hatch: '#9aa5b1' }

/** Police des panneaux : une DIN, celle de la signalétique, ou ce que le système a de plus proche. */
export const SIGN_FONT = '"DIN Alternate", "Bahnschrift", "Roboto Condensed", "Arial Narrow", system-ui, sans-serif'

export interface RoomInfo {
  zone: ZoneId
  /** Ce qu'on y trouve, ce qu'on y fait. */
  what: string
  /** Pourquoi la porte ne s'ouvre pas, quand elle est verrouillée. */
  locked?: string
  /** Pièce cachée : tant qu'elle est fermée au joueur, le plan ne la nomme pas. */
  secret?: boolean
  /** À mettre en avant sur l'affiche. */
  star?: boolean
}

const QUEST_LOCK = tr('S\'ouvre au fil d\'une quête du bord (journal : touche J).', 'Opens through one of the ship\'s quests (journal: J key).')

const ROOMS: Record<string, Record<string, RoomInfo>> = {
  '-1': {
    j: { zone: 'way', what: tr('L\'ascenseur, au milieu. Tout le reste de la cale part d\'ici.', 'The lift, in the middle. The rest of the hold starts here.') },
    a: { zone: 'work', what: tr('Établis, soudure et ferraille : on y bricole, et des tâches de bord y rapportent des crédits.', 'Workbenches, welding and scrap: tinker here, and ship chores pay credits.'), star: true },
    e: { zone: 'work', what: tr('Le réacteur dans sa cage et le FSD. On y entre par l\'atelier.', 'The reactor in its cage and the FSD. Enter through the workshop.') },
    c: { zone: 'way', what: tr('Seau, balais et robot laveur, sous une ampoule nue.', 'Bucket, brooms and a cleaning robot, under a bare bulb.') },
    u: { zone: 'way', what: tr('Du palier à la porte du Zorb.', 'From the landing to the Zorb\'s door.') },
    n: {
      zone: 'play', star: true,
      what: tr('La boîte de nuit des aliens : un DJ, une piste, et on y danse.', 'The aliens\' nightclub: a DJ, a dance floor, and dancing.'),
      locked: tr('Le videur ne laisse entrer que les aliens : portez une apparence d\'alien (Holo-Me de vos quartiers).', 'The bouncer only lets aliens in: wear an alien look (Holo-Me in your quarters).'),
    },
    r: { zone: 'sport', what: tr('Cinq armes au mur, des cibles, et un classement.', 'Five weapons on the wall, targets, and a leaderboard.'), locked: QUEST_LOCK, star: true },
    m: { zone: 'work', what: tr('Fusion du minerai, lingots et drones collecteurs. Des tâches de bord y rapportent des crédits.', 'Ore smelting, ingots and collector limpets. Ship chores pay credits.') },
    g: { zone: 'work', what: tr('Conteneurs et cargaison. Elle relie le stand de tir, la raffinerie et le lobby.', 'Containers and cargo. It links the shooting range, the refinery and the lobby.') },
    b: {
      zone: 'play', secret: true,
      what: tr('Le bar des habitués : les cocktails de Jacques, un flipper Mini-CQC et des tables de Galactic Clash.', 'The regulars\' bar: Jacques\' cocktails, a Mini-CQC pinball and Galactic Clash tables.'),
      locked: tr('Seulement pour les habitués.', 'Regulars only.'),
    },
    h: { zone: 'work', what: tr('Départ des missions en zone thargoïde : on forme son équipe au terminal, on s\'équipe au vestiaire.', 'Where Thargoid zone missions start: form a team at the terminal, gear up at the lockers.'), star: true },
    t: { zone: 'work', what: tr('Odile y surveille la zone thargoïde.', 'Odile watches over the Thargoid zone from here.'), locked: tr('Personnel seulement. On parle à Odile par l\'interphone du lobby.', 'Staff only. Talk to Odile through the lobby intercom.') },
    k: { zone: 'work', what: tr('Le Krait Mk II sur son pad, face au bouclier, et Nico, le mécano.', 'The Krait Mk II on its pad, facing the shield, and Nico the mechanic.'), star: true },
    v: { zone: 'lore', secret: true, what: tr('Le portail de Raxxla, les Chroniques et les Reliques, gardés par l\'Adepte Supérieur.', 'The Raxxla gate, the Chronicles and the Relics, kept by the High Adept.'), locked: tr('Seuls les Adeptes trouvent la Voie.', 'Only Adepts find the Path.') },
    w: { zone: 'way', what: tr('Une porte de service du lobby y mène. Au bout : la planque des Scavengers et le poste d\'exploration.', 'A service door in the lobby leads here. At the end: the Scavengers\' den and the exploration post.') },
    s: { zone: 'play', what: tr('Kael, ARIA et le poste d\'où l\'on joue à Scavengers, le jeu de fouille d\'épaves.', 'Kael, ARIA and the station where you play Scavengers, the wreck-salvage game.') },
    i: { zone: 'play', what: tr('Le poste d\'où l\'on joue à It\'s Dangerous Out There, devant sa baie d\'observation.', 'The station where you play It\'s Dangerous Out There, by its observation bay.') },
  },
  '0': {
    e: { zone: 'life', what: tr('Le hall du vaisseau : les comptoirs de l\'officier de liaison et du L.J.P.C., le tableau d\'honneur, et à l\'étage la mezzanine et son jukebox.', 'The ship\'s hall: the liaison officer\'s and L.J.P.C. counters, the honours board, and upstairs the mezzanine and its jukebox.'), star: true },
    c: { zone: 'way', what: tr('De la salle commune au poste de pilotage. Avant la proue, elle s\'élargit en Promenade, un atrium vitré autour de la maquette du Cobra.', 'From the common room to the cockpit. Before the bow it widens into the Promenade, a glazed atrium around the Cobra model.') },
    q: { zone: 'life', what: tr('Betty soigne : allongez-vous sur un lit, elle vient en consultation.', 'Betty takes care of you: lie down on a bed and she comes over.') },
    r: { zone: 'sport', what: tr('Boxe, course, vélo et musculation : un mini-jeu par appareil, et ses records.', 'Boxing, running, cycling and weights: a mini-game per machine, with records.'), locked: QUEST_LOCK, star: true },
    m: { zone: 'life', what: tr('Le self de Marcel. On y mange, et on donne un coup de main en cuisine contre des crédits.', 'Marcel\'s canteen. Eat here, and lend a hand in the kitchen for credits.'), star: true },
    s: { zone: 'play', what: tr('Bornes jouables, flipper, pince à peluches, et trois jeux de plateau à deux.', 'Playable cabinets, pinball, a claw machine, and three two-player board games.'), star: true },
    x: { zone: 'way', what: tr('Du salon d\'arcade à la salle de la Pixel War.', 'From the arcade lounge to the Pixel War room.') },
    p: { zone: 'play', what: tr('La toile du site en direct : on y pose ses pixels.', 'The site\'s canvas, live: place your pixels.') },
    b: { zone: 'work', what: tr('Les sièges de l\'équipage, la carte galactique, et l\'espace droit devant.', 'The crew seats, the galaxy map, and space dead ahead.'), star: true },
    l: { zone: 'lore', what: tr('James et son tableau d\'enquête, Julia, et Moustache.', 'James and his investigation board, Julia, and Moustache.'), locked: tr('Réservé aux membres du L.J.P.C. : terminez l\'aventure « Connais ton ennemi » sur le site.', 'L.J.P.C. members only: complete the “Know Your Enemy” adventure on the site.') },
    v: { zone: 'work', what: tr('Les caméras du bord, sur le pupitre du sergent.', 'The ship\'s cameras, on the sergeant\'s desk.'), locked: QUEST_LOCK },
  },
  '1': {
    c: { zone: 'way', what: tr('L\'ascenseur, la serre d\'un côté, le salon d\'écoute de l\'autre.', 'The lift, the greenhouse on one side, the listening lounge on the other.') },
    k: { zone: 'lore', what: tr('L\'interro de la professeure Kepler : asseyez-vous à une table pour le quiz.', 'Professor Kepler\'s test: sit at a desk to take the quiz.') },
    d: { zone: 'life', what: tr('Trois cabines et deux lavabos. Tirer la chasse pendant un saut est déconseillé.', 'Three stalls and two sinks. Flushing during a jump is not advised.') },
    p: { zone: 'lore', what: tr('Bugenhagen et l\'hologramme du système : asseyez-vous pour la séance.', 'Bugenhagen and the system hologram: sit down for the show.'), star: true },
    g: { zone: 'lore', what: tr('Le potager de Capucine sous verrière. Au sud, le jardin exotique et son étang, où l\'on pêche.', 'Capucine\'s kitchen garden under glass. To the south, the exotic garden and its pond, where you fish.'), star: true },
    o: { zone: 'play', what: tr('Les émissions de Radio Dangereuse, au coin du feu.', 'Radio Dangereuse shows, by the fire.') },
    s: { zone: 'play', what: tr('Les animateurs autour de leur table, derrière la vitre du salon.', 'The hosts around their table, behind the lounge window.') },
    n: { zone: 'play', what: tr('Le grand écran, pour regarder à plusieurs ; la régie est au fond.', 'The big screen, to watch together; the booth is at the back.'), star: true },
    h: { zone: 'way', what: tr('Du cinéma au hall de la zone sportive, puis au Comptoir des Cartes Dangereuses.', 'From the cinema to the sports hall, then to the Cartes Dangereuses counter.') },
    b: { zone: 'sport', what: tr('Un demi-terrain : on tire au panier depuis la marque.', 'A half court: shoot hoops from the mark.'), locked: QUEST_LOCK },
    f: { zone: 'sport', what: tr('Une cage, un gardien en carton, des tirs au but.', 'A goal, a cardboard keeper, penalty shots.'), locked: QUEST_LOCK },
    x: { zone: 'play', what: tr('Les boosters de Ludo, les tables de Galactic Clash et les pupitres de collection.', 'Ludo\'s boosters, the Galactic Clash tables and the collection desks.'), star: true },
  },
}

/** Les ponts du plan, du plus haut au plus bas : ceux qu'on visite. Les quartiers, privés, n'y sont qu'une mention. */
export const PLAN_LEVELS = [1, 0, -1]

/** Nom d'un pont, et son étage tel que l'ascenseur l'écrit (« +1 », « 0 », « -1 »). */
export const deckName = (level: number) => LEVELS.find((l) => l.id === level)?.name ?? ''
export const deckNumber = (level: number) => (level > 0 ? `+${level}` : String(level))
/** Les quartiers, tels que l'affiche et la fenêtre les mentionnent : « Quartiers (+2) ». */
export const QUARTERS_LEVEL = HOUSING_LEVEL
export const deckLabel = (level: number) => `${deckName(level)} (${deckNumber(level)})`
/** « Prenez l'ascenseur… » jusqu'à ce pont. */
export const liftTo = (level: number) => ({
  '1': tr('jusqu\'au pont supérieur (+1)', 'to the upper deck (+1)'),
  '0': tr('jusqu\'au pont principal (0)', 'to the main deck (0)'),
  '-1': tr('jusqu\'à la cale (-1)', 'to the hold (-1)'),
}[String(level)] ?? '')

export const roomName = (level: number, room: string) => LEVELS.find((l) => l.id === level)?.rooms[room] ?? ''
export const roomInfo = (level: number, room: string): RoomInfo => ROOMS[String(level)]?.[room] ?? { zone: 'way', what: '' }

export interface PlanArea {
  name: string
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  room: string
}

/** Parties d'une pièce qui ont leur propre nom sur le plan : la Promenade, le jardin exotique, la mezzanine. */
export function planAreas(level: number): PlanArea[] {
  const def = LEVELS.find((l) => l.id === level)
  if (!def) return []
  const map = staticMap(level)
  const areas: PlanArea[] = (def.areas ?? []).map((a) => ({ ...a, room: map.room(Math.round((a.minX + a.maxX) / 2), Math.round((a.minZ + a.maxZ) / 2)) ?? '' }))
  const mezz = mezzanineOf(level)
  if (mezz && def.mezzanine) {
    const floor = [...mezz.tiles.values()].filter((t) => t.stair < 0)
    areas.push({
      name: tr('Mezzanine', 'Mezzanine'), room: mezz.room,
      minX: Math.min(...floor.map((t) => t.x)), maxX: Math.max(...floor.map((t) => t.x)), minZ: Math.min(...floor.map((t) => t.z)), maxZ: Math.max(...floor.map((t) => t.z)),
    })
  }
  return areas
}

const maps = new Map<number, ShipMap>()
/** Plan d'un pont tel qu'il est au départ : ses pièces réservées fermées (cf. shipMapOptions). */
export function staticMap(level: number): ShipMap {
  let m = maps.get(level)
  if (!m) maps.set(level, (m = new ShipMap(LEVELS.find((l) => l.id === level)!.layout, shipMapOptions(level))))
  return m
}

/** Géométrie du plan d'un pont (cf. geometry.ts), le nom d'une pièce laissant la place à ceux de ses parties. */
export function planOf(level: number, map: ShipMap = staticMap(level)): DeckPlan {
  const areas = planAreas(level)
  // Pas de nom non plus sur la tuile de l'ascenseur : son pictogramme y est.
  return deckPlan(map, (room, x, z) => (x === LIFT.x && z === LIFT.z) || areas.some((a) => a.room === room && x >= a.minX && x <= a.maxX && z >= a.minZ && z <= a.maxZ))
}
