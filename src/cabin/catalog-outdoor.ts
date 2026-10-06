import { tr } from '../i18n'
import type { CatalogEntry } from './catalog'
import { fabrics, type Variant } from './variants'

/*
 * L'extérieur des quartiers : de quoi faire un jardin sur sa parcelle (cf. src/furniture/outdoor.ts
 * pour les constructeurs). Le gazon se pose avec les sols du mode construction (cf. finishes.ts) ;
 * ici, ce qu'on plante et ce qu'on installe dessus. Les arbres, les haies, les arbustes et les
 * champs se gagnent au jardinage : Capucine ne les confie qu'à qui a récolté assez (cf.
 * `gardening.unlocks` dans economy.json, et `unlockHarvests` dans shared/gardening.js).
 */

const SEASONS: Variant[] = [
  { id: 'summer', label: tr('Été', 'Summer'), swatch: '#4f9a4a' },
  { id: 'autumn', label: tr('Automne', 'Autumn'), swatch: '#c8752a' },
]

/** Couleurs franches des petits objets peints (nichoir, barbecue, nappe). */
const PAINTS: Variant[] = [
  { id: '#d9453a', label: tr('Rouge', 'Red'), swatch: '#d9453a' },
  { id: '#3c6aa8', label: tr('Bleu', 'Blue'), swatch: '#3c6aa8' },
  { id: '#3f8f5c', label: tr('Vert', 'Green'), swatch: '#3f8f5c' },
  { id: '#e8b23c', label: tr('Jaune', 'Yellow'), swatch: '#e8b23c' },
  { id: '#f1efe8', label: tr('Blanc', 'White'), swatch: '#f1efe8' },
]

const lampLight = (y: number, intensity = 1.2) => ({ color: '#ffd9a0', intensity, at: [0, y, 0] as [number, number, number], priority: 2 })

export const OUTDOOR_ENTRIES: CatalogEntry[] = [
  // --- Fleurs et herbes
  {
    id: 'flower-bed', name: tr('Massif de fleurs', 'Flower bed'), category: 'outdoor', model: 'flower-bed', mount: 'floor', solid: false,
    variants: [
      { id: 'tulips', label: tr('Tulipes', 'Tulips'), swatch: '#e0453a' },
      { id: 'daisies', label: tr('Marguerites', 'Daisies'), swatch: '#ffffff' },
      { id: 'lavender', label: tr('Lavande', 'Lavender'), swatch: '#8a6fd8' },
      { id: 'roses', label: tr('Roses', 'Roses'), swatch: '#d83a5a' },
      { id: 'poppies', label: tr('Coquelicots', 'Poppies'), swatch: '#e8382a' },
      { id: 'cornflowers', label: tr('Bleuets', 'Cornflowers'), swatch: '#4a7ae8' },
      { id: 'marigolds', label: tr('Œillets d\'Inde', 'Marigolds'), swatch: '#ff9a1c' },
    ],
    interact: [
      tr('Un massif bien serré. Capucine dit qu\'il faut leur parler. Vous leur avez donné votre grade, pour commencer.', 'A tightly planted bed. Capucine says you should talk to them. You started with your rank.'),
      tr('Ça sent bon. Rien à voir avec l\'air recyclé d\'un Sidewinder.', 'It smells lovely. Nothing like the recycled air of a Sidewinder.'),
    ],
  },
  {
    id: 'meadow-flowers', name: tr('Fleurs des prés', 'Meadow flowers'), category: 'outdoor', model: 'meadow-flowers', mount: 'floor', solid: false,
    variants: [{ id: 'blue', label: tr('Myosotis', 'Forget-me-nots'), swatch: '#4a7ae8' }, { id: 'red', label: tr('Coquelicots', 'Poppies'), swatch: '#e8382a' }],
  },
  {
    id: 'grass-tuft', name: tr('Herbes folles', 'Tall grass'), category: 'outdoor', model: 'grass-tuft', mount: 'floor', solid: false,
    variants: [{ id: 'tall', label: tr('Hautes', 'Tall') }, { id: 'wide', label: tr('Larges', 'Broad') }, { id: 'leafs', label: tr('En touffe', 'Tufted') }],
  },
  {
    id: 'toadstools', name: tr('Champignons', 'Toadstools'), category: 'outdoor', model: 'toadstools', mount: 'floor', solid: false,
    variants: [{ id: 'red', label: tr('Amanites', 'Fly agarics'), swatch: '#d9453a' }, { id: 'tan', label: tr('Cèpes', 'Ceps'), swatch: '#c8a06a' }, { id: 'toy', label: tr('Géants', 'Giant'), swatch: '#ff5a3a' }],
    interact: tr('Marcel jure qu\'ils sont comestibles. Marcel a aussi juré que le soufflé tiendrait pendant le saut.', 'Marcel swears they are edible. Marcel also swore the soufflé would hold through the jump.'),
  },
  { id: 'planter-box', name: tr('Jardinière', 'Planter'), category: 'outdoor', model: 'planter-box', mount: 'floor' },
  {
    id: 'topiary', name: tr('Topiaire', 'Topiary'), category: 'outdoor', model: 'topiary', mount: 'floor',
    variants: [
      { id: 'ball', label: tr('Boule', 'Ball') },
      { id: 'cone', label: tr('Cône', 'Cone') },
      { id: 'spiral', label: tr('Spirale', 'Spiral') },
      { id: 'tiers', label: tr('Trois boules', 'Three tiers') },
      { id: 'cube', label: tr('Cube', 'Cube') },
    ],
    interact: tr('Taillé au millimètre. On dirait un jardin d\'Achenar, la garde impériale en moins.', 'Trimmed to the millimetre. Like a garden on Achenar, minus the Imperial guard.'),
  },
  {
    id: 'flowering-shrub', name: tr('Hortensia', 'Hydrangea'), category: 'outdoor', model: 'flowering-shrub', mount: 'floor',
    variants: [
      { id: '#ff8ac8', label: tr('Rose', 'Pink'), swatch: '#ff8ac8' },
      { id: '#6f9aff', label: tr('Bleu', 'Blue'), swatch: '#6f9aff' },
      { id: '#f6f1e6', label: tr('Blanc', 'White'), swatch: '#f6f1e6' },
      { id: '#a48ae8', label: tr('Mauve', 'Mauve'), swatch: '#a48ae8' },
      { id: '#ffd23c', label: tr('Jaune', 'Yellow'), swatch: '#ffd23c' },
    ],
  },
  {
    id: 'hedge', name: tr('Haie taillée', 'Clipped hedge'), category: 'outdoor', model: 'hedge', mount: 'floor',
    variants: [{ id: 'straight', label: tr('Droite', 'Straight') }, { id: 'corner', label: tr('Angle', 'Corner') }, { id: 'gate', label: tr('Passage', 'Opening') }],
  },
  {
    id: 'hedge-low', name: tr('Bordure de buis', 'Box edging'), category: 'outdoor', model: 'hedge-low', mount: 'floor',
    variants: [
      { id: 'straight', label: tr('Droite', 'Straight') },
      { id: 'corner', label: tr('Courbe', 'Curve') },
      { id: 'gate', label: tr('Passage', 'Opening') },
      { id: 'boxwood', label: tr('Haute', 'Tall') },
      { id: 'angle', label: tr('Haute, en angle', 'Tall corner') },
    ],
  },
  {
    id: 'cereal-patch', name: tr('Carré de céréales', 'Cereal patch'), category: 'outdoor', model: 'cereal-patch', mount: 'floor', solid: false,
    variants: [{ id: 'wheat', label: tr('Blé', 'Wheat'), swatch: '#e8c872' }, { id: 'corn', label: tr('Maïs', 'Maize'), swatch: '#6aa84f' }],
    interact: tr('Quatre cents millions d\'hectares sur le monde natal de Capucine. Ici, un mètre carré. C\'est un début.', 'Four hundred million hectares on Capucine\'s home world. Here, one square metre. It\'s a start.'),
  },

  // --- Arbres
  {
    id: 'tree-oak', name: tr('Chêne', 'Oak'), category: 'outdoor', model: 'tree-oak', mount: 'floor', variants: SEASONS,
    interact: tr('Un chêne. Il mettra deux siècles à devenir grand. Le vaisseau est assuré pour moins que ça.', 'An oak. It will take two centuries to grow tall. The ship is insured for less.'),
  },
  { id: 'tree-linden', name: tr('Tilleul', 'Linden'), category: 'outdoor', model: 'tree-linden', mount: 'floor', variants: SEASONS },
  { id: 'tree-maple', name: tr('Érable', 'Maple'), category: 'outdoor', model: 'tree-maple', mount: 'floor', variants: SEASONS },
  { id: 'tree-chestnut', name: tr('Marronnier', 'Chestnut'), category: 'outdoor', model: 'tree-chestnut', mount: 'floor', variants: SEASONS },
  { id: 'tree-birch', name: tr('Bouleau', 'Birch'), category: 'outdoor', model: 'tree-birch', mount: 'floor', variants: SEASONS },
  {
    id: 'tree-formal', name: tr('Arbre taillé', 'Clipped tree'), category: 'outdoor', model: 'tree-formal', mount: 'floor',
    variants: [
      { id: 'cone', label: tr('En cône', 'Cone') },
      { id: 'cube', label: tr('En cubes', 'Cubes') },
      { id: 'plateau', label: tr('En plateau', 'Flat-topped') },
      { id: 'column', label: tr('En colonne', 'Column') },
      { id: 'stem', label: tr('Sur tige', 'Standard') },
    ],
  },
  {
    id: 'tree-pine', name: tr('Sapin', 'Fir tree'), category: 'outdoor', model: 'tree-pine', mount: 'floor',
    variants: [
      { id: 'classic', label: tr('Classique', 'Classic') },
      { id: 'tall', label: tr('Élancé', 'Slender') },
      { id: 'round', label: tr('Rond', 'Rounded') },
      { id: 'small', label: tr('Petit', 'Small') },
      { id: 'bushy', label: tr('Touffu', 'Bushy') },
      { id: 'snowy', label: tr('Enneigé', 'Snowy') },
    ],
  },
  {
    id: 'tree-cypress', name: tr('Cyprès', 'Cypress'), category: 'outdoor', model: 'tree-cypress', mount: 'floor',
    variants: [{ id: 'round', label: tr('Fuseau', 'Spindle') }, { id: 'crooked', label: tr('Tordu', 'Crooked') }, { id: 'fir', label: tr('Étagé', 'Tiered') }],
  },
  {
    id: 'tree-orchard', name: tr('Arbre fruitier', 'Fruit tree'), category: 'outdoor', model: 'tree-orchard', mount: 'floor',
    variants: [
      { id: 'apple', label: tr('Pommier', 'Apple tree'), swatch: '#e0453a' },
      { id: 'cherry', label: tr('Cerisier en fleurs', 'Cherry in blossom'), swatch: '#ffb3d1' },
      { id: 'snowy', label: tr('Sous la neige', 'Under snow'), swatch: '#ffffff' },
    ],
    interact: tr('Les pommes tombent toujours vers le sol. À bord, c\'est une bonne nouvelle : la gravité artificielle tient.', 'The apples always fall towards the floor. Aboard, that\'s good news: the artificial gravity is holding.'),
  },
  {
    id: 'tree-palm', name: tr('Grand palmier', 'Tall palm'), category: 'outdoor', model: 'tree-palm', mount: 'floor',
    variants: [{ id: 'tall', label: tr('Élancé', 'Slender') }, { id: 'fan', label: tr('En éventail', 'Fan') }],
  },
  {
    id: 'tree-willow', name: tr('Saule pleureur', 'Weeping willow'), category: 'outdoor', model: 'tree-willow', mount: 'floor',
    interact: tr('Ses branches frôlent le sol. Comète s\'y cache quand le FSD charge.', 'Its branches brush the floor. Comète hides under it when the FSD charges.'),
  },

  // --- Rochers, bois, allées
  {
    id: 'garden-rock', name: tr('Rocher', 'Rock'), category: 'outdoor', model: 'garden-rock', mount: 'floor',
    variants: [
      { id: 'moss-a', label: tr('Moussu', 'Mossy') },
      { id: 'moss-b', label: tr('Moussu, plat', 'Mossy, flat') },
      { id: 'tall-a', label: tr('Dressé', 'Standing') },
      { id: 'tall-b', label: tr('Aiguille', 'Spire') },
      { id: 'stone-a', label: tr('Granit', 'Granite') },
      { id: 'stone-b', label: tr('Bloc de granit', 'Granite block') },
      { id: 'pebbles', label: tr('Galets', 'Pebbles') },
    ],
    interact: tr('Analyse du prospecteur : 0 % de painite. On le garde pour la décoration.', 'Prospector analysis: 0% painite. Kept for decoration.'),
  },
  {
    id: 'tree-stump', name: tr('Souche', 'Tree stump'), category: 'outdoor', model: 'tree-stump', mount: 'floor', surface: 0.3,
    variants: [{ id: 'round', label: tr('Ronde', 'Round') }, { id: 'old', label: tr('Vieille', 'Old') }, { id: 'tall', label: tr('Haute', 'Tall') }, { id: 'big', label: tr('Grosse', 'Large') }],
  },
  {
    id: 'log-pile', name: tr('Tas de bûches', 'Log pile'), category: 'outdoor', model: 'log-pile', mount: 'floor',
    variants: [{ id: 'stack', label: tr('Petit tas', 'Small stack') }, { id: 'large', label: tr('Grand tas', 'Large stack') }, { id: 'hollow', label: tr('Tronc creux', 'Hollow trunk') }, { id: 'single', label: tr('Une bûche', 'Single log') }],
  },
  {
    id: 'paving-stones', name: tr('Pas japonais', 'Stepping stones'), category: 'outdoor', model: 'paving-stones', mount: 'flat',
    variants: [{ id: 'line', label: tr('En ligne', 'In a line') }, { id: 'circle', label: tr('En rond', 'In a ring') }, { id: 'scattered', label: tr('Éparses', 'Scattered') }],
  },
  { id: 'boardwalk', name: tr('Caillebotis', 'Boardwalk'), category: 'outdoor', model: 'boardwalk', mount: 'flat' },

  // --- Clôtures et murets
  {
    id: 'rail-fence', name: tr('Barrière de bois', 'Wooden fence'), category: 'outdoor', model: 'rail-fence', mount: 'floor',
    variants: [
      { id: 'rails', label: tr('Lisses', 'Rails') },
      { id: 'planks', label: tr('Planches', 'Planks') },
      { id: 'gate', label: tr('Portillon', 'Gate') },
      { id: 'corner', label: tr('Angle', 'Corner') },
      { id: 'rope', label: tr('Cordage', 'Rope') },
    ],
  },
  {
    id: 'iron-fence', name: tr('Grille en fer forgé', 'Wrought-iron railing'), category: 'outdoor', model: 'iron-fence', mount: 'floor',
    variants: [{ id: 'plain', label: tr('Simple', 'Plain') }, { id: 'base', label: tr('Sur muret', 'On a plinth') }, { id: 'curve', label: tr('Courbe', 'Curve') }, { id: 'gate', label: tr('Piliers d\'entrée', 'Gate posts') }],
  },
  {
    id: 'stone-wall', name: tr('Muret de pierre', 'Stone wall'), category: 'outdoor', model: 'stone-wall', mount: 'floor',
    variants: [{ id: 'plain', label: tr('Simple', 'Plain') }, { id: 'column', label: tr('Avec pilier', 'With pillar') }, { id: 'curve', label: tr('Courbe', 'Curve') }, { id: 'brick', label: tr('Briques', 'Brick') }],
  },

  // --- Mobilier de jardin
  {
    id: 'park-bench', name: tr('Banc de jardin', 'Garden bench'), category: 'outdoor', model: 'park-bench', mount: 'floor',
    variants: [{ id: 'wood', label: tr('Bois', 'Timber') }, { id: 'slats', label: tr('Lattes', 'Slatted') }],
  },
  {
    id: 'garden-swing', name: tr('Balançoire', 'Swing'), category: 'outdoor', model: 'garden-swing', mount: 'floor',
  },
  { id: 'parasol-table', name: tr('Table et parasol', 'Table and parasol'), category: 'outdoor', model: 'parasol-table', mount: 'floor', surface: 0.44, variants: fabrics('terracotta') },
  { id: 'deck-chair', name: tr('Transat', 'Deckchair'), category: 'outdoor', model: 'deck-chair', mount: 'floor', variants: fabrics('mustard') },
  { id: 'hammock', name: tr('Hamac', 'Hammock'), category: 'outdoor', model: 'hammock', mount: 'floor', variants: fabrics('teal') },
  { id: 'picnic-blanket', name: tr('Nappe de pique-nique', 'Picnic blanket'), category: 'outdoor', model: 'picnic-blanket', mount: 'flat', variants: PAINTS.slice(0, 4) },
  {
    id: 'pergola', name: tr('Pergola', 'Pergola'), category: 'outdoor', model: 'pergola', mount: 'floor', solid: false,
    variants: [{ id: 'wisteria', label: tr('Glycine', 'Wisteria'), swatch: '#a48ae8' }, { id: 'roses', label: tr('Rosier grimpant', 'Climbing rose'), swatch: '#ff7a9a' }, { id: 'vine', label: tr('Vigne', 'Vine'), swatch: '#5a3a8a' }],
  },
  {
    id: 'barbecue', name: tr('Barbecue', 'Barbecue'), category: 'outdoor', model: 'barbecue', mount: 'floor', variants: [PAINTS[0], { id: '#2b2d31', label: tr('Noir', 'Black'), swatch: '#2b2d31' }, PAINTS[1], PAINTS[2]],
    action: tr('Surveiller la cuisson', 'Watch the grill'),
    interact: [
      tr('Deux brochettes. Marcel passe « par hasard » toutes les cinq minutes pour donner son avis.', 'Two skewers. Marcel drops by “by chance” every five minutes to give his opinion.'),
      tr('Les détecteurs d\'incendie du bord ont été prévenus. Normalement.', 'The ship\'s fire sensors have been warned. Supposedly.'),
    ],
    light: { color: '#ff7a3a', intensity: 0.5, at: [0, 0.8, 0], flicker: 'fire', priority: 4 },
  },
  {
    id: 'campfire', name: tr('Feu de camp', 'Campfire'), category: 'outdoor', model: 'campfire', mount: 'floor',
    variants: [{ id: 'stones', label: tr('Pierres', 'Stones') }, { id: 'bricks', label: tr('Briques', 'Bricks') }],
    action: tr('Se réchauffer', 'Warm up'),
    interact: [
      tr('Un vrai feu, à bord d\'un vaisseau. Nico a dit non. Vous avez dit « c\'est holographique ». Ce n\'est pas holographique.', 'A real fire, aboard a ship. Nico said no. You said “it\'s holographic”. It is not holographic.'),
      tr('Il ne manque que des chamallows et une histoire de Thargoïdes.', 'All that\'s missing is marshmallows and a Thargoid story.'),
    ],
    light: { color: '#ff9a4a', intensity: 1.8, at: [0, 0.5, 0], flicker: 'fire', priority: 1 },
  },
  {
    id: 'camp-tent', name: tr('Tente', 'Tent'), category: 'outdoor', model: 'camp-tent', mount: 'floor',
    variants: [{ id: 'ridge', label: tr('Canadienne', 'Ridge tent') }, { id: 'small', label: tr('Une place', 'One-person') }, { id: 'canvas', label: tr('Abri de toile', 'Canvas shelter') }],
    interact: tr('Camper dans ses propres quartiers : le dépaysement, sans les quarante heures de supercroisière.', 'Camping in your own quarters: a change of scene, without forty hours of supercruise.'),
  },
  { id: 'canoe', name: tr('Canoë', 'Canoe'), category: 'outdoor', model: 'canoe', mount: 'floor', interact: tr('Portée : un étang. Saut FSD : non installé.', 'Range: one pond. FSD: not fitted.') },
  {
    id: 'market-stall', name: tr('Étal de marché', 'Market stall'), category: 'outdoor', model: 'market-stall', mount: 'floor', surface: 0.42,
    variants: [{ id: 'red', label: tr('Rouge', 'Red'), swatch: '#e8384f' }, { id: 'green', label: tr('Vert', 'Green'), swatch: '#3fa88a' }],
  },
  { id: 'hand-cart', name: tr('Charrette', 'Hand cart'), category: 'outdoor', model: 'hand-cart', mount: 'floor', variants: [{ id: 'flat', label: tr('Plateau', 'Flatbed') }, { id: 'covered', label: tr('Chargée', 'Loaded') }] },
  { id: 'hay-bale', name: tr('Botte de foin', 'Hay bale'), category: 'outdoor', model: 'hay-bale', mount: 'floor', surface: 0.42, variants: [{ id: 'plain', label: tr('Simple', 'Plain') }, { id: 'bundled', label: tr('Ficelée', 'Tied') }] },
  {
    id: 'wood-sign', name: tr('Panneau de bois', 'Wooden sign'), category: 'outdoor', model: 'wood-sign', mount: 'floor',
    variants: [{ id: 'arrow', label: tr('Flèche', 'Arrow') }, { id: 'plain', label: tr('Écriteau', 'Notice') }, { id: 'post', label: tr('Poteau indicateur', 'Signpost') }],
    interact: [
      tr('« Pelouse interdite aux SRV. »', '“No SRVs on the grass.”'),
      tr('« Hutton Orbital : 0,22 al. Tout droit. »', '“Hutton Orbital: 0.22 ly. Straight ahead.”'),
      tr('« Attention, chat méchant. » Comète dort dessous.', '“Beware of the cat.” Comète is asleep under it.'),
    ],
  },

  // --- Eau, pierre, lumière
  {
    id: 'fountain', name: tr('Fontaine', 'Fountain'), category: 'outdoor', model: 'fountain', mount: 'floor',
    variants: [{ id: 'round', label: tr('Ronde', 'Round') }, { id: 'square', label: tr('Carrée', 'Square') }],
    interact: [
      tr('Le clapotis couvre presque le ronron des recycleurs d\'air.', 'The splashing almost covers the hum of the air recyclers.'),
      tr('Quelqu\'un a jeté un crédit au fond. Un vœu : « Elite avant la fin de l\'année ».', 'Someone tossed a credit in. One wish: “Elite before the year is out”.'),
    ],
  },
  { id: 'bird-bath', name: tr('Bain d\'oiseaux', 'Bird bath'), category: 'outdoor', model: 'bird-bath', mount: 'floor', interact: tr('Un moineau. Personne ne sait comment il est monté à bord. Capucine le nourrit en cachette.', 'A sparrow. Nobody knows how it got aboard. Capucine feeds it in secret.') },
  { id: 'bird-house', name: tr('Nichoir', 'Bird house'), category: 'outdoor', model: 'bird-house', mount: 'floor', variants: PAINTS },
  {
    id: 'garden-well', name: tr('Puits', 'Well'), category: 'outdoor', model: 'garden-well', mount: 'floor',
    interact: tr('Vous lâchez un caillou. Plouf. En dessous, c\'est pourtant le pont supérieur.', 'You drop a pebble. Splash. And yet below here is the upper deck.'),
  },
  {
    id: 'garden-statue', name: tr('Statue de jardin', 'Garden statue'), category: 'outdoor', model: 'garden-statue', mount: 'floor',
    variants: [
      { id: 'column', label: tr('Colonne', 'Column') },
      { id: 'ruin', label: tr('Colonne brisée', 'Broken column') },
      { id: 'head', label: tr('Tête de pierre', 'Stone head') },
      { id: 'obelisk', label: tr('Obélisque', 'Obelisk') },
      { id: 'ring', label: tr('Anneau', 'Ring') },
      { id: 'block', label: tr('Bloc gravé', 'Carved block') },
      { id: 'spire', label: tr('Stèle', 'Stele') },
    ],
    interact: tr('Ce n\'est pas gardien. Vous avez vérifié deux fois avec le scanner.', 'It isn\'t Guardian. You checked twice with the scanner.'),
  },
  { id: 'garden-urn', name: tr('Vasque de pierre', 'Stone urn'), category: 'outdoor', model: 'garden-urn', mount: 'top', variants: [{ id: 'round', label: tr('Ronde', 'Round') }, { id: 'square', label: tr('Carrée', 'Square') }] },
  {
    id: 'garden-bridge', name: tr('Petit pont', 'Footbridge'), category: 'outdoor', model: 'garden-bridge', mount: 'floor',
    variants: [{ id: 'wood', label: tr('Bois', 'Timber') }, { id: 'wood-round', label: tr('Bois, en dos d\'âne', 'Timber, humpback') }, { id: 'stone', label: tr('Pierre', 'Stone') }, { id: 'stone-round', label: tr('Pierre, en dos d\'âne', 'Stone, humpback') }],
  },
  {
    id: 'street-lamp', name: tr('Réverbère', 'Street lamp'), category: 'outdoor', model: 'street-lamp', mount: 'floor',
    variants: [
      { id: 'single', label: tr('Une lanterne', 'One lantern') },
      { id: 'double', label: tr('Deux lanternes', 'Two lanterns') },
      { id: 'four', label: tr('Quatre lanternes', 'Four lanterns') },
      { id: 'town', label: tr('Lanterne de ville', 'Town lantern') },
      { id: 'park', label: tr('Lampadaire de parc', 'Park lamp') },
    ],
    light: lampLight(1.25, 1.5),
  },
  {
    id: 'garden-lantern', name: tr('Lanterne de jardin', 'Garden lantern'), category: 'outdoor', model: 'garden-lantern', mount: 'top',
    variants: [{ id: 'glass', label: tr('Vitrée', 'Glazed') }, { id: 'candle', label: tr('À bougie', 'Candle') }],
    light: { ...lampLight(0.3, 0.7), priority: 4 },
  },

  // --- Saisons
  {
    id: 'pumpkin', name: tr('Citrouille', 'Pumpkin'), category: 'outdoor', model: 'pumpkin', mount: 'top',
    variants: [{ id: 'plain', label: tr('Ronde', 'Round') }, { id: 'carved', label: tr('Ronde, sculptée', 'Round, carved') }, { id: 'tall', label: tr('Haute', 'Tall') }, { id: 'tall-carved', label: tr('Haute, sculptée', 'Tall, carved') }],
  },
  {
    id: 'snowman', name: tr('Bonhomme de neige', 'Snowman'), category: 'outdoor', model: 'snowman', mount: 'floor',
    variants: [{ id: 'plain', label: tr('Nu-tête', 'Bareheaded') }, { id: 'hat', label: tr('Chapeau et écharpe', 'Hat and scarf') }],
    interact: tr('Il ne fond pas. Nico refuse de dire ce qu\'il a fait à la climatisation.', 'It doesn\'t melt. Nico won\'t say what he did to the air conditioning.'),
  },
  { id: 'snow-pile', name: tr('Tas de neige', 'Snow drift'), category: 'outdoor', model: 'snow-pile', mount: 'floor', solid: false },
  { id: 'sled', name: tr('Luge', 'Sledge'), category: 'outdoor', model: 'sled', mount: 'floor' },
  { id: 'reindeer', name: tr('Renne', 'Reindeer'), category: 'outdoor', model: 'reindeer', mount: 'floor', interact: tr('Un renne au nez rouge. Il regarde le hangar avec envie : il a déjà tiré plus lourd qu\'un Krait.', 'A red-nosed reindeer. It eyes the hangar wistfully: it has hauled heavier than a Krait.') },
  {
    id: 'tree-decorated', name: tr('Sapin décoré', 'Decorated fir'), category: 'outdoor', model: 'tree-decorated', mount: 'floor',
    variants: [{ id: 'classic', label: tr('Guirlandes', 'Garlands') }, { id: 'snowy', label: tr('Enneigé', 'Snowy') }],
    light: { color: '#ffd9a0', intensity: 0.8, at: [0, 1, 0], flicker: 'pulse', priority: 3 },
  },
  {
    id: 'gift-box', name: tr('Cadeau', 'Present'), category: 'outdoor', model: 'gift-box', mount: 'top',
    variants: [{ id: 'cube', label: tr('Cube', 'Cube') }, { id: 'round', label: tr('Rond', 'Round') }, { id: 'long', label: tr('Long', 'Long') }],
    interact: tr('L\'étiquette dit « Pour le CMDR ». Ça pèse exactement une tonne de biodéchets. Vous préférez ne pas l\'ouvrir.', 'The tag says “For the CMDR”. It weighs exactly one tonne of biowaste. You\'d rather not open it.'),
  },
]
