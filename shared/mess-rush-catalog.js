// MESS RUSH : le catalogue de la cuisine (ingrédients, procédés, recettes), en données seulement.
// Partagé par le relais, qui arbitre la partie, et par le client, qui la dessine (cf.
// shared/mess-rush.js pour les règles, docs/mess-rush.md pour la conception).
//
// MESS RUSH 2 : peu de gestes, tous lisibles, comme dans Overcooked. Chaque ingrédient sort de sa
// caisse ; on le coupe sur une planche, puis il cuit tout seul (marmite ou poêle) ou se sert cru ;
// une recette dit ce qu'on attend dans l'assiette (`dish` : deux ou trois ingrédients différents) et
// sa couleur (`color` : son bon, son client, les assiettes qui le deviennent).
// server/mess-rush-catalog.test.js vérifie que tout se tient.
//
// Les noms affichés sont en français (et en anglais, comme tout le jeu, cf. src/i18n.ts). Le nom
// canonique d'Elite Dangerous (`canonical`) n'est qu'une métadonnée : il n'est jamais affiché.
// Statuts : 'canonique' (attesté par le jeu ou GalNet), 'adaptation' (un ingrédient canonique
// dans une recette inventée), 'création' (une invention de gameplay).

/** Sources consultées (cf. docs/mess-rush.md, « Le catalogue »). */
export const SOURCES = {
  fdev: { title: 'EDCD FDevIDs (rare_commodity.csv, commodity.csv)', url: 'https://github.com/EDCD/FDevIDs' },
  clientFr: { title: 'Journal Market.json d\'un client français du jeu (noms localisés)', url: 'https://github.com/Mirooz/EliteDangerousWarboard' },
  bgsTally: { title: 'BGS-Tally, fr.rare_commodity.csv', url: 'https://github.com/aussig/BGS-Tally' },
  wikiRares: { title: 'Liste des marchandises rares du wiki (miroir)', url: 'https://raw.githubusercontent.com/DarkSession/Elite-Dangerous-RAG-Knowledge/main/Wiki/List-of-Rare-Commodities.md' },
  jackies: { title: 'jackies-map, rares.csv', url: 'https://github.com/KayJohnston/jackies-map' },
  galnet: { title: 'GalNet, « Freelance Report: Pleased To Eat You », 06 MAR 3302', url: 'https://community.elitedangerous.com/galnet/uid/56d9702c9657baef074bf67d' },
}

const RARE = ['fdev', 'clientFr', 'bgsTally', 'wikiRares', 'jackies']
const COMMON = ['fdev', 'clientFr']

/**
 * Ce qu'on fait à un ingrédient, et où : un geste actif (couper : on reste devant la planche, la
 * jauge avance tant qu'on y est) ou une cuisson passive (elle part dès qu'on pose l'ingrédient dans
 * la marmite ou la poêle, et l'on peut s'en aller ; trop longtemps sur le feu, ça brûle). `result` :
 * l'état qui en sort. Les durées sont en secondes.
 */
export const PROCESSES = {
  couper: { station: 'board', active: true, duration: 2.5, result: 'coupé', verb: { fr: 'Couper', en: 'Chop' } },
  cuire: { station: 'pot', active: false, duration: 8, result: 'cuit', verb: { fr: 'Cuire', en: 'Boil' } },
  saisir: { station: 'pan', active: false, duration: 4, result: 'saisi', verb: { fr: 'Saisir', en: 'Sear' } },
}

/**
 * Ingrédients, chacun dans sa caisse. `prep` : les gestes à faire, dans l'ordre ; `cook` : sa
 * cuisson, une fois préparé (aucune : il se sert cru). `gender` : genre et nombre du nom court
 * (« Lapin coupé », « Crevettes saisies »), 'ms', 'fs', 'mp' ou 'fp'. `model` : son modèle du Food
 * Kit de Kenney (et son image sur les bons, cf. public/assets/mess-rush/food/).
 */
export const INGREDIENTS = {
  'lapin-ceti': {
    name: { fr: 'Lapins de Ceti', en: 'Ceti rabbits' }, short: { fr: 'Lapin', en: 'Rabbit' }, gender: 'ms',
    canonical: 'Ceti Rabbits', category: 'Foods', rare: true, origin: { system: '47 Ceti', station: 'Kaufmanis Hub' },
    prep: ['couper'], cook: ['cuire'], model: 'meat-raw', color: '#c9705a',
    status: 'canonique', sources: RARE,
  },
  'legumes': {
    name: { fr: 'Fruits et légumes', en: 'Fruit and vegetables' }, short: { fr: 'Légumes', en: 'Vegetables' }, gender: 'mp',
    canonical: 'Fruit and Vegetables', category: 'Foods', rare: false,
    prep: ['couper'], cook: ['cuire'], model: 'carrot', color: '#e8772a',
    status: 'canonique', sources: COMMON,
  },
  'crevettes-baltahsine': {
    name: { fr: 'Crevettes stellaires de Baltah\'sine', en: 'Baltah\'sine vacuum krill' }, short: { fr: 'Crevettes', en: 'Krill' }, gender: 'fp',
    canonical: 'Baltah\'sine Vacuum Krill', category: 'Foods', rare: true, origin: { system: 'Baltah\'Sine', station: 'Baltha\'sine Station' },
    prep: ['couper'], cook: ['saisir'], model: 'fish', color: '#f08a7a',
    status: 'canonique', sources: RARE,
  },
  'riz-jaroua': {
    name: { fr: 'Riz jarouan', en: 'Jaroua rice' }, short: { fr: 'Riz', en: 'Rice' }, gender: 'ms',
    canonical: 'Jaroua Rice', category: 'Foods', rare: true, origin: { system: 'Jaroua', station: 'McCool City' },
    prep: [], cook: ['cuire'], model: 'rice-ball', color: '#f4efe2',
    status: 'canonique', sources: RARE,
  },
  'pommes-aerial': {
    name: { fr: 'Pommes d\'eden d\'Aerial', en: 'Eden apples of Aerial' }, short: { fr: 'Pomme', en: 'Apple' }, gender: 'fs',
    canonical: 'Eden Apples of Aerial', category: 'Foods', rare: true, origin: { system: 'Aerial', station: 'Andrade Legacy' },
    prep: ['couper'], cook: [], model: 'apple', color: '#d8323c',
    status: 'canonique', sources: RARE,
  },
}

/** Difficultés : valeur de base (points) et délai de base (s) d'une commande. */
export const DIFFICULTIES = {
  rapide: { points: 20, time: 60, name: { fr: 'Rapide', en: 'Quick' } },
  intermediaire: { points: 40, time: 90, name: { fr: 'Intermédiaire', en: 'Intermediate' } },
  complexe: { points: 80, time: 150, name: { fr: 'Complexe', en: 'Complex' } },
}

/**
 * Recettes. `dish` : ce que l'assiette doit contenir, exactement (l'ingrédient et son état ; l'ordre
 * n'importe pas). Chaque plat réunit des ingrédients tous différents : deux pour les clients du mess
 * (difficulté intermédiaire), trois pour les visiteurs de marque, les personnages du vaisseau
 * (complexe, cf. GUEST_RECIPES et RULES.guests). `steps` : les étapes, dans l'ordre, pour la
 * documentation (le test du catalogue vérifie qu'elles suivent les ingrédients). `color` : la couleur
 * du plat, toutes différentes. `prototype` : la sélection du premier essai.
 *
 * Ce qui cuit à l'eau (le lapin, les légumes, le riz) cuit ensemble dans une marmite ; les crevettes
 * se saisissent à la poêle ; les pommes se servent coupées, crues.
 */
const plate = (...contents) => ({ container: 'plate', contents })
const crate = (ing) => ['crate', ing]
const DELAY = { fr: 'Le délai expire.', en: 'The timer runs out.' }
export const RECIPES = {
  // --- Deux ingrédients : les clients du mess.
  'ragout-lapin': {
    name: { fr: 'Ragoût de lapin de Ceti', en: 'Ceti rabbit stew' },
    difficulty: 'intermediaire', color: '#f76b15', prototype: true,
    dish: plate(['lapin-ceti', 'cuit'], ['legumes', 'cuit']),
    steps: [crate('lapin-ceti'), ['board', 'couper'], crate('legumes'), ['board', 'couper'], ['pot', 'cuire'], ['plates'], ['pass']],
    success: { fr: 'Le lapin et les légumes, cuits ensemble à la marmite, arrivent en assiette à temps.', en: 'The rabbit and the vegetables, boiled together in the pot, reach the pass plated in time.' },
    failure: DELAY, status: 'adaptation', sources: ['fdev', 'clientFr'],
  },
  'riz-crevettes': {
    name: { fr: 'Riz jarouan aux crevettes stellaires', en: 'Jaroua rice with vacuum krill' },
    difficulty: 'intermediaire', color: '#8b5cf6', prototype: true,
    dish: plate(['riz-jaroua', 'cuit'], ['crevettes-baltahsine', 'saisi']),
    steps: [crate('riz-jaroua'), ['pot', 'cuire'], crate('crevettes-baltahsine'), ['board', 'couper'], ['pan', 'saisir'], ['plates'], ['pass']],
    success: { fr: 'Le riz cuit et les crevettes saisies arrivent ensemble en assiette à temps.', en: 'The boiled rice and the seared krill reach the pass together, plated, in time.' },
    failure: DELAY, status: 'adaptation', sources: ['fdev', 'clientFr'],
  },
  'crevettes-pommes': {
    name: { fr: 'Crevettes saisies aux pommes d\'eden', en: 'Seared krill with Eden apples' },
    difficulty: 'intermediaire', color: '#ff7eb6', prototype: true,
    dish: plate(['crevettes-baltahsine', 'saisi'], ['pommes-aerial', 'coupé']),
    steps: [crate('crevettes-baltahsine'), ['board', 'couper'], ['pan', 'saisir'], crate('pommes-aerial'), ['board', 'couper'], ['plates'], ['pass']],
    success: { fr: 'Les crevettes saisies et les quartiers de pomme arrivent en assiette à temps.', en: 'The seared krill and the apple slices reach the pass plated in time.' },
    failure: DELAY, status: 'création', sources: ['fdev', 'clientFr'],
  },
  'lapin-pommes': {
    name: { fr: 'Lapin de Ceti aux pommes d\'eden', en: 'Ceti rabbit with Eden apples' },
    difficulty: 'intermediaire', color: '#e5484d',
    dish: plate(['lapin-ceti', 'cuit'], ['pommes-aerial', 'coupé']),
    steps: [crate('lapin-ceti'), ['board', 'couper'], ['pot', 'cuire'], crate('pommes-aerial'), ['board', 'couper'], ['plates'], ['pass']],
    success: { fr: 'Le lapin cuit et les quartiers de pomme arrivent en assiette à temps.', en: 'The boiled rabbit and the apple slices reach the pass plated in time.' },
    failure: DELAY, status: 'création', sources: ['fdev', 'clientFr'],
  },
  'riz-legumes': {
    name: { fr: 'Riz jarouan aux légumes du bord', en: 'Jaroua rice with ship\'s vegetables' },
    difficulty: 'intermediaire', color: '#2fb36d',
    dish: plate(['riz-jaroua', 'cuit'], ['legumes', 'cuit']),
    steps: [crate('legumes'), ['board', 'couper'], crate('riz-jaroua'), ['pot', 'cuire'], ['plates'], ['pass']],
    success: { fr: 'Le riz et les légumes, cuits ensemble à la marmite, arrivent en assiette à temps.', en: 'The rice and the vegetables, boiled together in the pot, reach the pass plated in time.' },
    failure: DELAY, status: 'création', sources: COMMON,
  },
  // --- Trois ingrédients : les visiteurs de marque.
  'festin-du-bord': {
    name: { fr: 'Festin du bord', en: 'Captain\'s feast' },
    difficulty: 'complexe', color: '#22c5e8',
    dish: plate(['riz-jaroua', 'cuit'], ['crevettes-baltahsine', 'saisi'], ['pommes-aerial', 'coupé']),
    steps: [crate('riz-jaroua'), ['pot', 'cuire'], crate('crevettes-baltahsine'), ['board', 'couper'], ['pan', 'saisir'], crate('pommes-aerial'), ['board', 'couper'], ['plates'], ['pass']],
    success: { fr: 'Le riz, les crevettes saisies et les pommes arrivent réunis dans une même assiette à temps.', en: 'Rice, seared krill and apples reach the pass together on one plate in time.' },
    failure: DELAY, status: 'création', sources: ['fdev', 'clientFr'],
  },
  'pot-au-feu': {
    name: { fr: 'Pot-au-feu de Ceti', en: 'Ceti hotpot' },
    difficulty: 'complexe', color: '#eab308',
    dish: plate(['lapin-ceti', 'cuit'], ['legumes', 'cuit'], ['riz-jaroua', 'cuit']),
    steps: [crate('lapin-ceti'), ['board', 'couper'], crate('legumes'), ['board', 'couper'], crate('riz-jaroua'), ['pot', 'cuire'], ['plates'], ['pass']],
    success: { fr: 'Le lapin, les légumes et le riz, cuits ensemble à la marmite, arrivent en assiette à temps.', en: 'Rabbit, vegetables and rice, boiled together in the pot, reach the pass plated in time.' },
    failure: DELAY, status: 'création', sources: ['fdev', 'clientFr'],
  },
  'assiette-commandant': {
    name: { fr: 'Assiette du commandant', en: 'Commander\'s platter' },
    difficulty: 'complexe', color: '#3b82f6',
    dish: plate(['lapin-ceti', 'cuit'], ['legumes', 'cuit'], ['crevettes-baltahsine', 'saisi']),
    steps: [crate('lapin-ceti'), ['board', 'couper'], crate('legumes'), ['board', 'couper'], ['pot', 'cuire'], crate('crevettes-baltahsine'), ['board', 'couper'], ['pan', 'saisir'], ['plates'], ['pass']],
    success: { fr: 'Le lapin et les légumes de la marmite, et les crevettes saisies, arrivent dans une même assiette à temps.', en: 'Rabbit and vegetables from the pot, with seared krill, reach the pass on one plate in time.' },
    failure: DELAY, status: 'création', sources: ['fdev', 'clientFr'],
  },
  'jardin-aerial': {
    name: { fr: 'Jardin d\'Aerial', en: 'Aerial garden plate' },
    difficulty: 'complexe', color: '#84cc16',
    dish: plate(['legumes', 'cuit'], ['riz-jaroua', 'cuit'], ['pommes-aerial', 'coupé']),
    steps: [crate('legumes'), ['board', 'couper'], crate('riz-jaroua'), ['pot', 'cuire'], crate('pommes-aerial'), ['board', 'couper'], ['plates'], ['pass']],
    success: { fr: 'Les légumes et le riz de la marmite, et les quartiers de pomme, arrivent dans une même assiette à temps.', en: 'Vegetables and rice from the pot, with apple slices, reach the pass on one plate in time.' },
    failure: DELAY, status: 'création', sources: ['fdev', 'clientFr'],
  },
}

/** Recettes de la sélection du premier essai. */
export const PROTOTYPE_RECIPES = Object.keys(RECIPES).filter((id) => RECIPES[id].prototype)

/** La carte du service : les plats à deux ingrédients, que commandent les clients du mess. */
export const SERVICE_RECIPES = Object.keys(RECIPES).filter((id) => RECIPES[id].dish.contents.length === 2)

/** Les plats à trois ingrédients : ceux des visiteurs de marque (cf. GUESTS). */
export const GUEST_RECIPES = Object.keys(RECIPES).filter((id) => RECIPES[id].dish.contents.length === 3)

/**
 * Les visiteurs de marque : des personnages du vaisseau qui viennent manger au mess pendant le
 * service (entre quatre et cinq par service, tirés au sort, cf. RULES.guests). Chacun commande son
 * plat préféré, à trois ingrédients, qui rapporte plus ; son bon a sa carte à lui (sa couleur, son
 * pictogramme, son rôle, un mot), et il fait la queue sous ses traits (cf. src/mess-rush/queue.ts).
 * `icon` : un pictogramme de src/icons.ts.
 */
export const GUESTS = {
  marcel: {
    name: 'Chef Marcel', role: { fr: 'Le chef du mess', en: 'The mess chef' }, dish: 'pot-au-feu', color: '#d9dde3', icon: 'chef-hat',
    quote: { fr: 'Je viens voir si vous tenez ma cuisine. Pas de pitié.', en: 'Let\'s see if you can run my kitchen. No mercy.' },
  },
  betty: {
    name: 'Betty', role: { fr: 'L\'infirmière', en: 'The nurse' }, dish: 'jardin-aerial', color: '#ff5d7a', icon: 'first-aid-kit',
    quote: { fr: 'Des légumes et des fruits : l\'infirmière l\'exige.', en: 'Vegetables and fruit: nurse\'s orders.' },
  },
  nico: {
    name: 'Nico', role: { fr: 'Le mécanicien du hangar', en: 'The hangar mechanic' }, dish: 'assiette-commandant', color: '#e07a2c', icon: 'wrench',
    quote: { fr: 'Un plein de calories, et vite : j\'ai un moteur ouvert.', en: 'A full tank of calories, quick: I\'ve got an engine open.' },
  },
  capucine: {
    name: 'Capucine', role: { fr: 'La jardinière de la serre', en: 'The greenhouse gardener' }, dish: 'jardin-aerial', color: '#6f9a5a', icon: 'plant',
    quote: { fr: 'Mes légumes, mes pommes : traitez-les bien.', en: 'My vegetables, my apples: treat them well.' },
  },
  rourke: {
    name: 'Sergent Rourke', role: { fr: 'La sécurité du bord', en: 'Ship security' }, dish: 'assiette-commandant', color: '#27c6ff', icon: 'shield-warning',
    quote: { fr: 'Ration de patrouille. Au pas de course.', en: 'Patrol ration. On the double.' },
  },
  odile: {
    name: 'Odile', role: { fr: 'La contrôleuse de la zone', en: 'The zone controller' }, dish: 'festin-du-bord', color: '#5fd4ff', icon: 'eye',
    quote: { fr: 'Entre deux rotations : un festin, s\'il vous plaît.', en: 'Between two shifts: a feast, please.' },
  },
  gaspard: {
    name: 'Gaspard', role: { fr: 'Le technicien de la baie', en: 'The bay technician' }, dish: 'pot-au-feu', color: '#f2d24a', icon: 'toolbox',
    quote: { fr: 'Quelque chose de chaud. La baie est glaciale.', en: 'Something hot. The bay is freezing.' },
  },
  tessa: {
    name: 'Tessa', role: { fr: 'L\'arbitre de l\'arène', en: 'The arena referee' }, dish: 'festin-du-bord', color: '#ff8a1c', icon: 'trophy',
    quote: { fr: 'Je chronomètre. Ne me décevez pas.', en: 'I\'m timing you. Don\'t let me down.' },
  },
  kael: {
    name: 'Kael', role: { fr: 'Le chef des Scavengers', en: 'The Scavengers\' leader' }, dish: 'assiette-commandant', color: '#c9a227', icon: 'sword',
    quote: { fr: 'Ce que vous avez de mieux. Je paie bien.', en: 'Your best. I pay well.' },
  },
}
