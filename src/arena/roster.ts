import { tr } from '../i18n'
import type { IconName } from '../icons'
import { ARENA_CHARACTERS, type CharacterId } from '../../shared/arena.js'

/*
 * Qui sont les personnages de CMDR Arena, en quelques mots : leur nom, leur rôle, leur arme, leur
 * couleur, leur humour, et ce qu'en dit leur fiche au terminal (leur difficulté, leur jeu en une
 * phrase, leurs forces, leurs faiblesses, ce qu'ils sont seuls à faire). Rien d'autre ici, pour que
 * le décor du lobby (le tableau des personnages, cf. src/furniture/arena.ts) puisse les lire sans
 * charger leurs modèles (cf. characters.ts). Les chiffres cités viennent des règles (ARENA_CHARACTERS) :
 * un réglage d'équilibrage les suit ; un essai vérifie que les superlatifs restent vrais
 * (server/arena-roles.test.js).
 */

/** Un nombre, à la française (virgule) ou à l'anglaise. */
const num = (n: number) => tr(String(n).replace('.', ','), String(n))
const C = ARENA_CHARACTERS
const FLOWER = C.capucine.weapon.flower!, FIRE = C.jacques.weapon.fire!, SCAN = C.nico.scan!

export interface Identity {
  /** Son nom, et son nom complet (« Sergent Rourke »). */
  name: string
  full: string
  role: string
  /** Le nom de son arme. */
  weapon: string
  /** Une ligne d'humour, sur sa fiche au terminal. */
  quip: string
  /** Sa couleur : sa fiche, sa pastille, le liseré de son arme. */
  color: string
  icon: IconName
  /** Est-il difficile à bien jouer ? 1 : facile, 2 : moyen, 3 : difficile. */
  difficulty: 1 | 2 | 3
  /** Comment il se joue, en une phrase courte : la première chose qu'on lit sur sa fiche. */
  style: string
  /** Ses forces et ses faiblesses, deux de chaque, courtes. */
  strengths: string[]
  weaknesses: string[]
  /** Ce qu'il est seul à faire. */
  special: string
}

/** Le nom de chaque niveau de difficulté (cf. Identity.difficulty). */
export const DIFFICULTY = ['', tr('Facile', 'Easy'), tr('Moyen', 'Medium'), tr('Difficile', 'Hard')]

export const ROSTER: Record<CharacterId, Identity> = {
  rourke: {
    name: 'Rourke', full: tr('Sergent Rourke', 'Sergeant Rourke'), role: tr('Soldat polyvalent', 'All-round soldier'), weapon: tr('Mitraillette de service', 'Service SMG'),
    quip: tr('Il fait sa ronde jusque dans l\'arène. Rien à signaler, sauf vous.', 'He walks his beat all the way into the arena. Nothing to report, except you.'),
    color: '#4fc3ff', icon: 'shield-warning',
    difficulty: 1,
    style: tr('Des rafales à moyenne portée : il va partout, sans exceller nulle part.', 'Bursts at mid range: he fits anywhere, excels nowhere.'),
    strengths: [
      tr('Des dégâts réguliers, faciles à placer', 'Steady damage, easy to land'),
      tr(`Le plus grand chargeur : ${C.rourke.weapon.mag} balles`, `The biggest magazine: ${C.rourke.weapon.mag} rounds`),
    ],
    weaknesses: [
      tr('Imprécis de loin : la rafale s\'ouvre', 'Inaccurate at range: the burst spreads'),
      tr('Rien d\'exceptionnel face à un spécialiste', 'Nothing special against a specialist'),
    ],
    special: tr('Le seul automatique : il tire tant qu\'on tient la détente.', 'The only automatic: he fires as long as you hold the trigger.'),
  },
  marcel: {
    name: 'Marcel', full: tr('Chef Marcel', 'Chef Marcel'), role: tr('Tank à dégâts de zone', 'Splash tank'), weapon: tr('Lance-tomates', 'Tomato launcher'),
    quip: tr('Les tomates du jardin, la sauce du chef. Réclamations au sergent Rourke.', 'Tomatoes from the garden, sauce by the chef. Complaints to Sergeant Rourke.'),
    color: '#ff5a3c', icon: 'chef-hat',
    difficulty: 1,
    style: tr('Il encaisse et fonce : ses tomates éclatent et éclaboussent autour.', 'He soaks it up and charges in: his tomatoes burst and splash around.'),
    strengths: [
      tr(`La plus grosse santé : ${C.marcel.hp} PV`, `The most health: ${C.marcel.hp} HP`),
      tr('Ses tomates touchent un groupe entier', 'His tomatoes hit a whole group'),
    ],
    weaknesses: [
      tr('Le plus lent', 'The slowest'),
      tr(`Courte portée (${num(C.marcel.weapon.range)} cases) : de loin, il ne fait rien`, `Short range (${C.marcel.weapon.range} tiles): at range he does nothing`),
    ],
    special: tr('Sa tomate éclate aussi contre un obstacle ou au bout de sa course : pas besoin de viser juste.', 'His tomato also bursts on cover or at the end of its flight: no need to aim true.'),
  },
  nico: {
    name: tr('Nico et Boulon', 'Nico & Bolt'), full: tr('Nico et Boulon', 'Nico & Bolt'), role: tr('Glass cannon mobile', 'Mobile glass cannon'), weapon: tr('Fusil laser', 'Laser rifle'),
    quip: tr('Nico vise, Boulon scanne les buissons. Ni l\'un ni l\'autre n\'encaisse.', 'Nico aims, Bolt scans the bushes. Neither of them can take a hit.'),
    color: '#ff9a2e', icon: 'rocket',
    difficulty: 3,
    style: tr('Le laser porte loin et traverse : on tire, on bouge, on ne se fait pas toucher.', 'The laser reaches far and pierces: shoot, move, don\'t get hit.'),
    strengths: [
      tr(`La plus longue portée (${num(C.nico.weapon.range)} cases), ${C.nico.weapon.damage} dégâts par tir`, `The longest range (${C.nico.weapon.range} tiles), ${C.nico.weapon.damage} damage a shot`),
      tr('Le plus rapide', 'The fastest'),
    ],
    weaknesses: [
      tr(`Le plus fragile : ${C.nico.hp} PV`, `The frailest: ${C.nico.hp} HP`),
      tr(`${C.nico.weapon.mag} tirs, lents : chaque raté se paie`, `${C.nico.weapon.mag} slow shots: every miss costs`),
    ],
    special: tr(`Son laser traverse tous ceux qu'il trouve ; Boulon voit dans les buissons à ${num(SCAN)} cases.`, `His laser pierces everyone in line; Bolt sees into bushes within ${SCAN} tiles.`),
  },
  betty: {
    name: 'Betty', full: tr('Betty, l\'infirmière', 'Betty the nurse'), role: tr('Soutien et soigneuse', 'Support healer'), weapon: tr('Pistolet à seringues', 'Syringe gun'),
    quip: tr('Une seringue pour les siens, une autre pour les autres. Elle ne dit pas laquelle est laquelle.', 'One syringe for her side, another for the rest. She won\'t say which is which.'),
    color: '#ff7bc0', icon: 'first-aid-kit',
    difficulty: 2,
    style: tr('Elle soigne les siens et pique ceux d\'en face : elle tient son équipe en vie.', 'She heals her side and stings the other: she keeps her team alive.'),
    strengths: [
      tr(`Rend ${C.betty.weapon.heal} PV par seringue à un coéquipier blessé`, `Restores ${C.betty.weapon.heal} HP per syringe to a wounded teammate`),
      tr('Tir rapide et précis', 'Fast, accurate fire'),
    ],
    weaknesses: [
      tr('Peu de dégâts, seule', 'Little damage on her own'),
      tr('Ne se soigne pas elle-même', 'Can\'t heal herself'),
    ],
    special: tr('La seule qui soigne ; sa seringue traverse un coéquipier en pleine forme.', 'The only healer; her syringe passes through a healthy teammate.'),
  },
  capucine: {
    name: 'Capucine', full: tr('Capucine, la jardinière', 'Capucine the gardener'), role: tr('Contrôle de zone', 'Area control'), weapon: tr('Graines carnivores', 'Carnivorous seeds'),
    quip: tr('Elle plante, ça pousse, ça mord. Arrosage déconseillé.', 'She plants, it grows, it bites. Watering not advised.'),
    color: '#8ad94a', icon: 'potted-plant',
    difficulty: 3,
    style: tr('Elle sème des fleurs carnivores là où passera l\'adversaire.', 'She sows carnivorous flowers where the enemy will walk.'),
    strengths: [
      tr('Lance par-dessus les obstacles', 'Lobs over obstacles'),
      tr(`Une fleur tient un passage ${num(FLOWER.life)} secondes`, `A flower holds a lane for ${FLOWER.life} seconds`),
    ],
    weaknesses: [
      tr(`Fragile : ${C.capucine.hp} PV`, `Frail: ${C.capucine.hp} HP`),
      tr('Il faut deviner où ira l\'adversaire : une fleur s\'arme avant de mordre', 'You have to read the enemy: a flower winds up before it bites'),
    ],
    special: tr(
      `${FLOWER.most} fleurs à la fois, qui mordent toutes les ${num(FLOWER.every)} s qui s'approche à ${num(FLOWER.radius)} case.`,
      `${FLOWER.most} flowers at a time, biting anyone within ${FLOWER.radius} tiles every ${FLOWER.every} s.`,
    ),
  },
  jacques: {
    name: 'Jacques', full: tr('Jacques, le barman', 'Jacques the bartender'), role: tr('Tank explosif', 'Explosive tank'), weapon: tr('Cocktails spéciaux', 'Special cocktails'),
    quip: tr('Le cocktail de la maison flambe au comptoir. Ici, il flambe partout.', 'The house cocktail is flambéed at the bar. Here, it flambés everywhere.'),
    color: '#b6ff3a', icon: 'robot',
    difficulty: 2,
    style: tr('Ses cocktails éclatent en une flaque qui brûle : il ferme un passage.', 'His cocktails burst into a burning puddle: he shuts a lane.'),
    strengths: [
      tr(`Solide : ${C.jacques.hp} PV`, `Sturdy: ${C.jacques.hp} HP`),
      tr('Lance par-dessus les obstacles, punit les groupes', 'Lobs over obstacles, punishes groups'),
    ],
    weaknesses: [
      tr('Lent', 'Slow'),
      tr(`Long rechargement : ${num(C.jacques.weapon.reload)} s`, `Long reload: ${C.jacques.weapon.reload} s`),
    ],
    special: tr(
      `La flaque brûle encore ${num(FIRE.life)} s : ${FIRE.damage} dégâts toutes les ${num(FIRE.every)} s à qui s'y tient.`,
      `The puddle burns on for ${FIRE.life} s: ${FIRE.damage} damage every ${FIRE.every} s to anyone in it.`,
    ),
  },
}
