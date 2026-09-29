import { ARMOR_METALS, ODYSSEY_GUNS, SABER_COLORS } from '../furniture/armory'
import { FILMS, PINUPS } from '../furniture/posters'
import { CONSOLES, CRT_CASES, HANDHELDS } from '../furniture/retro'
import { tr } from '../i18n'
import type { CatalogEntry } from './catalog'
import { fabrics, type Variant } from './variants'

/*
 * Le mobilier fait main des quartiers pour se sentir chez soi : écrans et consoles (télé
 * cathodique, consoles de salon, micro 8 bits…), armurerie décorative, affiches de films et
 * pin-up, et quelques objets de salle de bain (cf. src/furniture/retro.ts, armory.ts,
 * posters.ts, bath.ts).
 */

const CASES: Variant[] = [
  { id: 'wood', label: tr('Bois', 'Wood'), swatch: CRT_CASES.wood.body },
  { id: 'beige', label: tr('Beige', 'Beige'), swatch: CRT_CASES.beige.body },
  { id: 'red', label: tr('Rouge', 'Red'), swatch: CRT_CASES.red.body },
  { id: 'black', label: tr('Noir', 'Black'), swatch: CRT_CASES.black.body },
]

const TV_TEXTS = [
  tr('Vous zappez : la mire, GalNet, un vieux match de tennis sans fin, les aventures de Comète. Rien d\'autre.', 'You flick channels: test card, GalNet, an endless old tennis match, Comète\'s adventures. Nothing else.'),
  tr('Un coup sur le côté du poste, et l\'image revient. La technologie de 3310 n\'a rien inventé de mieux.', 'A thump on the side of the set and the picture comes back. 3310 technology has invented nothing better.'),
  tr('Les aventures de Comète, épisode 212 : Comète contre l\'aspirateur. Suspense insoutenable.', 'Comète\'s adventures, episode 212: Comète versus the vacuum cleaner. Unbearable suspense.'),
]

const CONSOLE_TEXTS: Record<string, string> = {
  nes: tr('Vous soufflez dans la cartouche, par principe. Le jeu démarre du premier coup.', 'You blow into the cartridge, on principle. The game boots first time.'),
  snes: tr('Une partie de course de karts spatiaux. Comète a encore pris la carapace bleue.', 'A game of space kart racing. Comète got the blue shell again.'),
  mega: tr('Un hérisson bleu court plus vite qu\'un FSD. Personne ne sait comment.', 'A blue hedgehog runs faster than an FSD. Nobody knows how.'),
  disc: tr('Le disque tourne, crisse, et charge. Vous avez le temps d\'aller vous faire un café.', 'The disc spins, whirrs and loads. You have time to make a coffee.'),
  n64: tr('Quatre manettes, un écran partagé, et une amitié qui ne s\'en remettra pas.', 'Four controllers, a split screen, and a friendship that won\'t recover.'),
  modern: tr('Mise à jour obligatoire : 212 Go. Vous jouerez au prochain saut.', 'Mandatory update: 212 GB. You\'ll play after the next jump.'),
}

const GUN_NAMES: Record<(typeof ODYSSEY_GUNS)[number], string> = {
  'karma-ar50': 'Karma AR-50',
  'karma-l6': 'Karma L-6',
  'manticore-executioner': 'Manticore Executioner',
  'tk-aphelion': 'TK Aphelion',
}

const SABERS: Variant[] = [
  { id: 'blue', label: tr('Bleu', 'Blue'), swatch: SABER_COLORS.blue[0] },
  { id: 'green', label: tr('Vert', 'Green'), swatch: SABER_COLORS.green[0] },
  { id: 'red', label: tr('Rouge', 'Red'), swatch: SABER_COLORS.red[0] },
  { id: 'purple', label: tr('Violet', 'Purple'), swatch: SABER_COLORS.purple[0] },
  { id: 'duel', label: tr('Duel (bleu et rouge)', 'Duel (blue and red)'), swatch: 'linear-gradient(135deg, #4fb4ff 50%, #ff3b3b 50%)' },
]

/** Affiches des faux films d'Elite du cinéma du bord (cf. furniture/cinema-posters.ts). */
const CINEMA_FILMS: Variant[] = [
  { id: 'hutton', label: 'Hutton Orbital' },
  { id: 'thargoid', label: tr('Thargoïdes', 'Thargoids') },
  { id: 'jameson', label: 'Jameson Memorial' },
]

export const FUN_ENTRIES: CatalogEntry[] = [
  // --- Écrans et consoles
  {
    id: 'crt-tv', name: tr('Télé cathodique', 'CRT television'), category: 'tech', model: 'crt-tv', mount: 'top', variants: CASES, action: tr('Zapper', 'Channel-hop'),
    interact: TV_TEXTS, light: { color: '#9fd0ff', intensity: 0.35, at: [0, 0.2, 0.3], flicker: 'neon', priority: 5 },
  },
  {
    id: 'crt-tv-stand', name: tr('Télé cathodique sur pieds', 'CRT television on legs'), category: 'tech', model: 'crt-tv-stand', mount: 'floor', variants: CASES,
    action: tr('Zapper', 'Channel-hop'), interact: TV_TEXTS, light: { color: '#9fd0ff', intensity: 0.4, at: [0, 0.5, 0.35], flicker: 'neon', priority: 5 },
  },
  {
    id: 'game-console', name: tr('Console de jeu', 'Games console'), category: 'tech', model: 'game-console', mount: 'top', action: tr('Jouer', 'Play'),
    variants: Object.entries(CONSOLES).map(([id, c]) => ({ id, label: c.label })),
    interact: (v) => CONSOLE_TEXTS[v ?? ''] ?? CONSOLE_TEXTS.nes,
  },
  {
    id: 'handheld', name: tr('Console portable', 'Handheld console'), category: 'tech', model: 'handheld', mount: 'top', action: tr('Jouer', 'Play'),
    variants: Object.entries(HANDHELDS).map(([id, swatch]) => ({ id, label: { grey: tr('Grise', 'Grey'), yellow: tr('Jaune', 'Yellow'), teal: tr('Turquoise', 'Teal'), purple: tr('Violette', 'Purple'), red: tr('Rouge', 'Red') }[id] ?? id, swatch })),
    interact: tr('Quatre lignes d\'un coup ! Les piles, elles, rendent l\'âme juste après.', 'Four lines at once! The batteries die right after.'),
  },
  {
    id: 'retro-computer', name: tr('Micro-ordinateur 8 bits', '8-bit home computer'), category: 'tech', model: 'retro-computer', mount: 'top', action: tr('Jouer', 'Play'),
    light: { color: '#dfe8ff', intensity: 0.3, at: [0, 0.17, 0.2], priority: 5 },
    interact: [
      tr('ELITE, 1984 : 22 Ko de mémoire, huit galaxies, et le Cobra en fil de fer. Tout a commencé ici.', 'ELITE, 1984: 22 KB of memory, eight galaxies, and the wireframe Cobra. It all started here.'),
      tr('« Chargement… » La cassette crisse depuis quatre minutes. Il fallait être patient, à l\'époque.', '“Loading…” The tape has been screeching for four minutes. You had to be patient back then.'),
    ],
  },
  {
    id: 'gaming-pc', name: tr('PC de joueur', 'Gaming PC'), category: 'tech', model: 'gaming-pc', mount: 'top',
    interact: tr('Seize cœurs, trois ventilateurs arc-en-ciel, et il fait tourner Elite en 4K. Ou un tableur.', 'Sixteen cores, three rainbow fans, and it runs Elite in 4K. Or a spreadsheet.'),
  },
  { id: 'vhs-stack', name: tr('Cassettes vidéo', 'Video tapes'), category: 'tech', model: 'vhs-stack', mount: 'top', interact: tr('Il faut rembobiner avant de rendre. C\'est la règle.', 'Be kind, rewind. That\'s the rule.') },

  // --- Armurerie
  {
    id: 'saber-display', name: tr('Sabres laser', 'Laser swords'), category: 'weapons', model: 'saber-display', mount: 'wall', variants: SABERS,
    light: (v) => ({ color: (SABER_COLORS[v ?? ''] ?? SABER_COLORS.blue)[0], intensity: 0.4, at: [0, 0.6, 0.15], priority: 5 }),
    interact: tr('Deux sabres laser, lames allumées « pour l\'ambiance ». Le service sécurité a demandé qu\'on ne les décroche pas.', 'Two laser swords, blades lit “for the atmosphere”. Security has asked that they stay on the wall.'),
  },
  {
    id: 'sword-display', name: tr('Trophée d\'armes', 'Weapon trophy'), category: 'weapons', model: 'sword-display', mount: 'wall',
    variants: [{ id: 'knight', label: tr('Chevalier', 'Knight') }, { id: 'viking', label: 'Viking' }, { id: 'pirate', label: tr('Pirate (La Buse)', 'Pirate (La Buse)') }],
    interact: (v) => v === 'pirate'
      ? tr('Deux sabres d\'abordage et le pavillon de La Buse. Le trésor, lui, est dans le coffre.', 'Two cutlasses and La Buse\'s flag. The treasure is in the chest.')
      : v === 'viking'
        ? tr('Haches et bouclier rond : l\'équipement de base d\'un pilote de Sidewinder qui a du caractère.', 'Axes and a round shield: the basic kit of a Sidewinder pilot with character.')
        : tr('Épées croisées et écu : les armes d\'un chevalier de l\'Empire. Ou d\'un brocanteur de Lave.', 'Crossed swords and a shield: the arms of an Imperial knight. Or of a Lave junk dealer.'),
  },
  {
    id: 'katana-stand', name: tr('Présentoir à katanas', 'Katana stand'), category: 'weapons', model: 'katana-stand', mount: 'top',
    variants: [{ id: 'black', label: tr('Laque noire', 'Black lacquer'), swatch: '#15151a' }, { id: 'red', label: tr('Laque rouge', 'Red lacquer'), swatch: '#8e1f1c' }],
    interact: tr('Un katana et son petit frère. Forgés à Tanmark, affûtés pour trancher les factures de réparation.', 'A katana and its little brother. Forged in Tanmark, sharpened to slice through repair bills.'),
  },
  {
    id: 'odyssey-rack', name: tr('Arme d\'Odyssey au mur', 'Odyssey weapon display'), category: 'weapons', model: 'odyssey-rack', mount: 'wall',
    variants: ODYSSEY_GUNS.map((id) => ({ id, label: GUN_NAMES[id] })),
    interact: (v) => tr(`${GUN_NAMES[(v ?? 'karma-ar50') as keyof typeof GUN_NAMES] ?? 'Karma AR-50'}, déchargée, mise sous clé. Souvenir d'une zone de conflit sur Leesti.`, `${GUN_NAMES[(v ?? 'karma-ar50') as keyof typeof GUN_NAMES] ?? 'Karma AR-50'}, unloaded and locked. A souvenir from a conflict zone on Leesti.`),
  },
  {
    id: 'weapon-rack', name: tr('Râtelier d\'armes', 'Weapon rack'), category: 'weapons', model: 'weapon-rack', mount: 'floor',
    interact: tr('Trois fusils, cadenassés. La caisse de munitions est vide : on n\'est jamais trop prudent.', 'Three rifles, padlocked. The ammo box is empty: you can never be too careful.'),
  },
  {
    id: 'blaster-stand', name: tr('Pistolet sous cloche', 'Pistol under glass'), category: 'weapons', model: 'blaster-stand', mount: 'top',
    variants: [{ id: 'blaster', label: tr('Blaster de contrebandier', 'Smuggler\'s blaster') }, { id: 'tormentor', label: 'Manticore Tormentor' }, { id: 'zenith', label: 'TK Zenith' }],
    interact: tr('Sous la cloche, un pistolet de collection. Il a tiré le premier, paraît-il.', 'Under the glass, a collector\'s pistol. It shot first, apparently.'),
  },
  {
    id: 'armor-stand', name: tr('Armure de chevalier', 'Suit of armour'), category: 'weapons', model: 'armor-stand', mount: 'floor',
    variants: [{ id: 'steel', label: tr('Acier', 'Steel'), swatch: ARMOR_METALS.steel[0] }, { id: 'gold', label: tr('Or', 'Gold'), swatch: ARMOR_METALS.gold[0] }, { id: 'black', label: tr('Noire', 'Black'), swatch: ARMOR_METALS.black[0] }],
    interact: [
      tr('Une armure de chevalier. Quand on passe, on a l\'impression que la visière vous suit.', 'A suit of armour. When you walk past, the visor seems to follow you.'),
      tr('Comète a déjà essayé de dormir dans le heaume.', 'Comète has already tried to sleep in the helmet.'),
    ],
  },

  // --- Affiches
  {
    id: 'film-poster', name: tr('Affiche de film', 'Film poster'), category: 'posters', model: 'film-poster', mount: 'wall',
    variants: Object.entries(FILMS).map(([id, f]) => ({ id, label: f.label })),
    interact: (v) => tr(`Affiche de « ${FILMS[v ?? '']?.label ?? 'Terminator'} ». Un classique d'avant les sauts hyperspatiaux, toujours projeté dans les stations.`, `A “${FILMS[v ?? '']?.label ?? 'Terminator'}” poster. A classic from before hyperspace, still screened in stations.`),
  },
  {
    id: 'pinup-poster', name: 'Pin-up', category: 'posters', model: 'pinup-poster', mount: 'wall',
    variants: Object.entries(PINUPS).map(([id, p]) => ({ id, label: p.label })),
    interact: tr('Une pin-up à l\'ancienne, comme celles qu\'on peignait sur le nez des vaisseaux.', 'An old-style pin-up, like the ones they used to paint on ships\' noses.'),
  },
  {
    id: 'cinema-poster', name: tr('Affiche de cinéma lumineuse', 'Illuminated cinema poster'), category: 'posters', model: 'movie-poster', mount: 'wall', variants: CINEMA_FILMS,
    interact: tr('L\'affiche du cinéma du bord, ampoules comprises. À l\'affiche ce soir : les faux films d\'Elite.', 'The ship cinema\'s poster, bulbs included. Showing tonight: Elite\'s fake films.'),
  },
  {
    id: 'podcast-poster', name: tr('Affiche d\'émission', 'Show poster'), category: 'posters', model: 'podcast-poster', mount: 'wall',
    variants: [{ id: 'radio', label: 'Radio Dangereuse' }, { id: 'galeres', label: tr('Les Galères Galactiques', 'Les Galères Galactiques') }, { id: 'gg', label: tr('Les Galères Galactiques (logo)', 'Les Galères Galactiques (logo)') }],
  },

  // --- Salle de bain
  {
    id: 'rubber-duck', name: tr('Canard en plastique', 'Rubber duck'), category: 'bath', model: 'rubber-duck', mount: 'top', action: tr('Presser', 'Squeeze'),
    interact: [tr('Couic !', 'Squeak!'), tr('Le canard vous fixe. Il a vu des choses, dans cette baignoire.', 'The duck stares at you. It has seen things, in that bath.')],
  },
  { id: 'toothbrush-cup', name: tr('Gobelet à brosses à dents', 'Toothbrush cup'), category: 'bath', model: 'toothbrush-cup', mount: 'top' },
  {
    id: 'toilet-roll', name: tr('Dérouleur de papier', 'Toilet roll holder'), category: 'bath', model: 'toilet-roll', mount: 'wall',
    interact: tr('Dernier rouleau. Ajoutez-le à la liste des courses de Jameson Memorial.', 'Last roll. Add it to the Jameson Memorial shopping list.'),
  },
  { id: 'bath-mat', name: tr('Tapis de bain', 'Bath mat'), category: 'bath', model: 'bath-mat', mount: 'flat', variants: fabrics('sage') },
]
