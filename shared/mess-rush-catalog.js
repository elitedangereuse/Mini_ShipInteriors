// MESS RUSH : le catalogue de la cuisine (ingrédients, procédés, recettes), en données seulement.
// Partagé par le relais, qui arbitre la partie, et par le client, qui la dessine (cf.
// shared/mess-rush.js pour les règles, docs/mess-rush.md pour la conception).
//
// Ajouter une recette ne demande pas de toucher au moteur : un ingrédient dit d'où il sort, ce
// qu'on lui fait (`prep`, dans l'ordre) et où il cuit (`cook`) ; une recette dit ce qu'on attend
// dans l'assiette ou la tasse (`dish`). server/mess-rush-catalog.test.js vérifie que tout se tient.
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
 * Ce qu'on fait à un ingrédient, et où : un geste actif (on reste au poste, la jauge avance tant
 * qu'on y est) ou une cuisson passive (on lance, on peut s'en aller). `result` : l'état qui en sort.
 * Les durées sont en secondes.
 */
export const PROCESSES = {
  rincer: { station: 'sink', active: true, duration: 2, result: 'rincé', verb: { fr: 'Rincer', en: 'Rinse' } },
  couper: { station: 'board', active: true, duration: 2.5, result: 'coupé', verb: { fr: 'Couper', en: 'Chop' } },
  fouetter: { station: 'board', active: true, duration: 3, result: 'fouetté', verb: { fr: 'Fouetter', en: 'Whisk' } },
  marmite: { station: 'pot', active: false, duration: 8, result: 'cuit', verb: { fr: 'Lancer la cuisson', en: 'Start cooking' } },
  poele: { station: 'pan', active: false, duration: 5, result: 'cuit', verb: { fr: 'Lancer la cuisson', en: 'Start cooking' } },
  infuser: { station: 'fountain', active: false, duration: 4, result: 'infusé', verb: { fr: 'Infuser', en: 'Brew' } },
}

/**
 * Ingrédients. `source` : le distributeur d'où il sort ; `prep` : les gestes à faire, dans
 * l'ordre ; `cook` : où il peut cuire (marmite, poêle ou fontaine), une fois préparé. `gender` :
 * genre et nombre du nom court (« Lapin coupé », « Crevettes rincées »), 'ms', 'fs', 'mp' ou 'fp'.
 */
export const INGREDIENTS = {
  'lapin-ceti': {
    name: { fr: 'Lapins de Ceti', en: 'Ceti rabbits' }, short: { fr: 'Lapin', en: 'Rabbit' }, gender: 'ms',
    canonical: 'Ceti Rabbits', category: 'Foods', rare: true, origin: { system: '47 Ceti', station: 'Kaufmanis Hub' },
    source: 'fridge', prep: ['couper'], cook: ['marmite'], model: 'meat-raw', color: '#c9705a',
    status: 'canonique', sources: RARE,
  },
  'legumes': {
    name: { fr: 'Fruits et légumes', en: 'Fruit and vegetables' }, short: { fr: 'Légumes', en: 'Vegetables' }, gender: 'mp',
    canonical: 'Fruit and Vegetables', category: 'Foods', rare: false,
    source: 'pantry', prep: ['couper'], cook: ['marmite'], model: 'carrot', color: '#e8772a',
    status: 'canonique', sources: COMMON,
  },
  'escargots-irukama': {
    name: { fr: 'Escargots géants d\'Irukama', en: 'Giant Irukama snails' }, short: { fr: 'Escargots', en: 'Snails' }, gender: 'mp',
    canonical: 'Giant Irukama Snails', category: 'Foods', rare: true, origin: { system: 'Irukama', station: 'Blaauw City' },
    source: 'fridge', prep: ['rincer'], cook: ['poele'], model: 'mussel', color: '#8a6a4a',
    status: 'canonique', sources: RARE,
  },
  'crevettes-baltahsine': {
    name: { fr: 'Crevettes stellaires de Baltah\'sine', en: 'Baltah\'sine vacuum krill' }, short: { fr: 'Crevettes', en: 'Krill' }, gender: 'fp',
    canonical: 'Baltah\'sine Vacuum Krill', category: 'Foods', rare: true, origin: { system: 'Baltah\'Sine', station: 'Baltha\'sine Station' },
    source: 'fridge', prep: ['rincer'], cook: ['poele'], model: 'fish', color: '#f08a7a',
    status: 'canonique', sources: RARE,
  },
  'cafe-goman': {
    name: { fr: 'Café Goman Yaupon', en: 'Goman Yaupon coffee' }, short: { fr: 'Café', en: 'Coffee' }, gender: 'ms',
    canonical: 'Goman Yaupon Coffee', category: 'Foods', rare: true, origin: { system: 'Goman', station: 'Gustav Sporer Port' },
    source: 'pantry', prep: [], cook: ['infuser'], model: 'bag', color: '#5a3a24',
    status: 'canonique', sources: RARE,
  },
  'the-ethgreze': {
    name: { fr: 'Bourgeons de thé d\'Ethgreze', en: 'Ethgreze tea buds' }, short: { fr: 'Thé', en: 'Tea' }, gender: 'ms',
    canonical: 'Ethgreze Tea Buds', category: 'Foods', rare: true, origin: { system: 'Ethgreze', station: 'Bloch Station' },
    source: 'pantry', prep: [], cook: ['infuser'], model: 'bag-flat', color: '#6f9a4a',
    status: 'canonique', sources: RARE,
  },
  'pommes-aerial': {
    name: { fr: 'Pommes d\'eden d\'Aerial', en: 'Eden apples of Aerial' }, short: { fr: 'Pomme', en: 'Apple' }, gender: 'fs',
    canonical: 'Eden Apples of Aerial', category: 'Foods', rare: true, origin: { system: 'Aerial', station: 'Andrade Legacy' },
    source: 'pantry', prep: ['couper'], cook: [], model: 'apple', color: '#d8323c',
    status: 'canonique', sources: RARE,
  },
  'ma-corn-diso': {
    name: { fr: 'Ma Corn de Diso', en: 'Diso Ma Corn' }, short: { fr: 'Ma Corn', en: 'Ma Corn' }, gender: 'ms',
    canonical: 'Diso Ma Corn', category: 'Foods', rare: true, origin: { system: 'Diso', station: 'Shifnalport' },
    source: 'pantry', prep: [], cook: ['poele'], model: 'corn', color: '#f2c94c',
    // Le lore en fait une plante dont on prise la poussière de graines : la griller est une adaptation.
    status: 'canonique', sources: RARE,
  },
  'gateaux-wheemete': {
    name: { fr: 'Gâteaux de blé Wheemete', en: 'Wheemete wheat cakes' }, short: { fr: 'Gâteaux de blé', en: 'Wheat cakes' }, gender: 'mp',
    canonical: 'Wheemete Wheat Cakes', category: 'Foods', rare: true, origin: { system: 'Wheemete', station: 'Eisinga Enterprise' },
    source: 'pantry', prep: [], cook: ['poele'], model: 'pancakes', color: '#d9a55a',
    status: 'canonique', sources: RARE,
  },
  'truffes-deuringas': {
    name: { fr: 'Truffes de Deuringas', en: 'Deuringas truffles' }, short: { fr: 'Truffes', en: 'Truffles' }, gender: 'fp',
    canonical: 'Deuringas Truffles', category: 'Foods', rare: true, origin: { system: 'Deuringas', station: 'Shukor Hub' },
    source: 'pantry', prep: ['couper', 'fouetter'], cook: [], model: 'mushroom', color: '#3d2f2a',
    status: 'canonique', sources: RARE,
  },
  'piments-ochoeng': {
    name: { fr: 'Piments d\'Ochoeng', en: 'Ochoeng chillies' }, short: { fr: 'Piments', en: 'Chillies' }, gender: 'mp',
    canonical: 'Ochoeng Chillies', category: 'Foods', rare: true, origin: { system: 'Ochoeng', station: 'Roddenberry Gateway' },
    source: 'pantry', prep: ['couper'], cook: ['poele'], model: 'paprika', color: '#c0262d',
    status: 'canonique', sources: RARE,
  },
  'balanes': {
    name: { fr: 'Balanes spatiales', en: 'Space barnacles' }, short: { fr: 'Balanes', en: 'Barnacles' }, gender: 'fp',
    // Pas une marchandise : les Thargoid Barnacles sont des structures au sol. Seul l'article de
    // GalNet en fait un mets (« space barnacle broth »).
    canonical: null, category: null, rare: false,
    source: 'fridge', prep: ['rincer'], cook: ['marmite'], model: 'mussel-open', color: '#5f8f7a',
    status: 'création', sources: ['galnet'],
  },
}

/** Difficultés : valeur de base (points) et délai de base (s) d'une commande. */
export const DIFFICULTIES = {
  rapide: { points: 20, time: 60, name: { fr: 'Rapide', en: 'Quick' } },
  intermediaire: { points: 40, time: 90, name: { fr: 'Intermédiaire', en: 'Intermediate' } },
  complexe: { points: 80, time: 150, name: { fr: 'Complexe', en: 'Complex' } },
}

/**
 * Recettes. `dish` : le contenant et ce qu'il doit contenir, exactement (l'ingrédient et son
 * état) ; l'ordre n'importe pas. `steps` : les étapes, dans l'ordre, pour le bon et la
 * documentation (le test du catalogue vérifie qu'elles suivent les ingrédients). `prototype` :
 * dans la sélection de la phase 2.
 */
export const RECIPES = {
  'cafe-goman': {
    name: { fr: 'Café Goman Yaupon', en: 'Goman Yaupon coffee' },
    difficulty: 'rapide', prototype: true,
    dish: { container: 'cup', contents: [['cafe-goman', 'infusé']] },
    steps: [['pantry', 'cafe-goman'], ['fountain', 'infuser'], ['pass']],
    success: { fr: 'La tasse arrive à la passe avant la fin du délai.', en: 'The cup reaches the pass before the timer runs out.' },
    failure: { fr: 'Le délai expire.', en: 'The timer runs out.' },
    status: 'adaptation', sources: ['fdev', 'clientFr'],
  },
  'the-ethgreze': {
    name: { fr: 'Thé en bourgeons d\'Ethgreze', en: 'Ethgreze bud tea' },
    difficulty: 'rapide',
    dish: { container: 'cup', contents: [['the-ethgreze', 'infusé']] },
    steps: [['pantry', 'the-ethgreze'], ['fountain', 'infuser'], ['pass']],
    success: { fr: 'La tasse arrive à la passe avant la fin du délai.', en: 'The cup reaches the pass before the timer runs out.' },
    failure: { fr: 'Le délai expire.', en: 'The timer runs out.' },
    status: 'adaptation', sources: ['fdev', 'clientFr'],
  },
  'pommes-aerial': {
    name: { fr: 'Pommes d\'eden d\'Aerial', en: 'Eden apples of Aerial' },
    difficulty: 'rapide',
    dish: { container: 'plate', contents: [['pommes-aerial', 'coupé']] },
    steps: [['pantry', 'pommes-aerial'], ['board', 'couper'], ['plates'], ['pass']],
    success: { fr: 'Les pommes coupées, en assiette, arrivent à la passe à temps.', en: 'The sliced apples, plated, reach the pass in time.' },
    failure: { fr: 'Le délai expire.', en: 'The timer runs out.' },
    status: 'adaptation', sources: ['fdev', 'clientFr'],
  },
  'ma-corn-diso': {
    name: { fr: 'Ma Corn de Diso grillé', en: 'Grilled Diso Ma Corn' },
    difficulty: 'rapide',
    dish: { container: 'plate', contents: [['ma-corn-diso', 'cuit']] },
    steps: [['pantry', 'ma-corn-diso'], ['pan', 'poele'], ['plates'], ['pass']],
    success: { fr: 'Le Ma Corn grillé, en assiette, arrive à la passe à temps.', en: 'The grilled Ma Corn, plated, reaches the pass in time.' },
    failure: { fr: 'Le délai expire.', en: 'The timer runs out.' },
    status: 'adaptation', sources: ['fdev', 'clientFr'],
  },
  'ragout-lapin': {
    name: { fr: 'Ragoût de lapin de Ceti', en: 'Ceti rabbit stew' },
    difficulty: 'intermediaire', prototype: true,
    dish: { container: 'plate', contents: [['lapin-ceti', 'cuit'], ['legumes', 'cuit']] },
    steps: [['fridge', 'lapin-ceti'], ['board', 'couper'], ['pantry', 'legumes'], ['board', 'couper'], ['pot', 'marmite'], ['plates'], ['pass']],
    success: { fr: 'Le lapin et les légumes, mijotés ensemble, arrivent en assiette à la passe à temps.', en: 'The rabbit and vegetables, stewed together, reach the pass plated in time.' },
    failure: { fr: 'Le délai expire.', en: 'The timer runs out.' },
    status: 'adaptation', sources: ['fdev', 'clientFr'],
  },
  'escargots-irukama': {
    name: { fr: 'Escargots géants d\'Irukama', en: 'Giant Irukama snails' },
    difficulty: 'intermediaire', prototype: true,
    dish: { container: 'plate', contents: [['escargots-irukama', 'cuit']] },
    steps: [['fridge', 'escargots-irukama'], ['sink', 'rincer'], ['pan', 'poele'], ['plates'], ['pass']],
    success: { fr: 'Les escargots rincés et poêlés arrivent en assiette à la passe à temps.', en: 'The rinsed, pan-fried snails reach the pass plated in time.' },
    failure: { fr: 'Le délai expire.', en: 'The timer runs out.' },
    status: 'adaptation', sources: ['fdev', 'clientFr'],
  },
  'crevettes-baltahsine': {
    name: { fr: 'Crevettes stellaires de Baltah\'sine sautées', en: 'Sautéed Baltah\'sine vacuum krill' },
    difficulty: 'intermediaire',
    dish: { container: 'plate', contents: [['crevettes-baltahsine', 'cuit']] },
    steps: [['fridge', 'crevettes-baltahsine'], ['sink', 'rincer'], ['pan', 'poele'], ['plates'], ['pass']],
    success: { fr: 'Les crevettes rincées et sautées arrivent en assiette à la passe à temps.', en: 'The rinsed, sautéed krill reach the pass plated in time.' },
    failure: { fr: 'Le délai expire.', en: 'The timer runs out.' },
    status: 'adaptation', sources: ['fdev', 'clientFr'],
  },
  'gateaux-wheemete': {
    name: { fr: 'Gâteaux de blé Wheemete aux pommes d\'eden', en: 'Wheemete wheat cakes with Eden apples' },
    difficulty: 'intermediaire',
    dish: { container: 'plate', contents: [['gateaux-wheemete', 'cuit'], ['pommes-aerial', 'coupé']] },
    steps: [['pantry', 'gateaux-wheemete'], ['pan', 'poele'], ['pantry', 'pommes-aerial'], ['board', 'couper'], ['plates'], ['pass']],
    success: { fr: 'Les gâteaux réchauffés et les pommes coupées arrivent ensemble en assiette à temps.', en: 'The warmed cakes and sliced apples reach the pass together, plated, in time.' },
    failure: { fr: 'Le délai expire.', en: 'The timer runs out.' },
    status: 'adaptation', sources: ['fdev', 'clientFr'],
  },
  'bouillon-balanes': {
    name: { fr: 'Bouillon de balanes spatiales', en: 'Space barnacle broth' },
    difficulty: 'complexe',
    dish: { container: 'plate', contents: [['balanes', 'cuit']] },
    steps: [['fridge', 'balanes'], ['sink', 'rincer'], ['pot', 'marmite'], ['plates'], ['pass']],
    success: { fr: 'Le bouillon arrive en assiette à la passe à temps.', en: 'The broth reaches the pass plated in time.' },
    failure: { fr: 'Le délai expire.', en: 'The timer runs out.' },
    status: 'création', sources: ['galnet'],
  },
  'mousse-truffe': {
    name: { fr: 'Mousse à l\'huile de truffe de Deuringas', en: 'Deuringas truffle oil foam' },
    difficulty: 'complexe',
    dish: { container: 'plate', contents: [['truffes-deuringas', 'fouetté']] },
    steps: [['pantry', 'truffes-deuringas'], ['board', 'couper'], ['board', 'fouetter'], ['plates'], ['pass']],
    success: { fr: 'La mousse arrive en assiette à la passe à temps.', en: 'The foam reaches the pass plated in time.' },
    failure: { fr: 'Le délai expire.', en: 'The timer runs out.' },
    status: 'adaptation', sources: ['fdev', 'clientFr', 'galnet'],
  },
  'reduction-piments': {
    name: { fr: 'Réduction de piments d\'Ochoeng', en: 'Ochoeng chilli reduction' },
    difficulty: 'complexe',
    dish: { container: 'plate', contents: [['piments-ochoeng', 'cuit']] },
    steps: [['pantry', 'piments-ochoeng'], ['board', 'couper'], ['pan', 'poele'], ['plates'], ['pass']],
    success: { fr: 'La réduction arrive en assiette à la passe à temps.', en: 'The reduction reaches the pass plated in time.' },
    failure: { fr: 'Le délai expire.', en: 'The timer runs out.' },
    status: 'adaptation', sources: ['fdev', 'clientFr', 'galnet'],
  },
  'bouillon-imperial': {
    name: { fr: 'Bouillon impérial de balanes spatiales', en: 'Imperial space barnacle broth' },
    difficulty: 'complexe', points: 160, time: 210,
    dish: { container: 'plate', contents: [['balanes', 'cuit'], ['truffes-deuringas', 'fouetté'], ['piments-ochoeng', 'cuit']] },
    steps: [
      ['fridge', 'balanes'], ['sink', 'rincer'], ['pot', 'marmite'],
      ['pantry', 'truffes-deuringas'], ['board', 'couper'], ['board', 'fouetter'],
      ['pantry', 'piments-ochoeng'], ['board', 'couper'], ['pan', 'poele'],
      ['plates'], ['pass'],
    ],
    success: { fr: 'Le bouillon, la mousse et la réduction arrivent réunis dans une même assiette à temps.', en: 'The broth, foam and reduction reach the pass together on one plate in time.' },
    failure: { fr: 'Le délai expire.', en: 'The timer runs out.' },
    // Le plat d'Oliver Gordon (« a dish fit for an emperor ») ; le nom est une création.
    status: 'création', sources: ['galnet'],
  },
}

/** Recettes de la sélection du prototype (phase 2). */
export const PROTOTYPE_RECIPES = Object.keys(RECIPES).filter((id) => RECIPES[id].prototype)

/** La carte du service : toutes les recettes (les complexes n'arrivent qu'après deux minutes, cf. RULES.complexAfter). */
export const SERVICE_RECIPES = Object.keys(RECIPES)
