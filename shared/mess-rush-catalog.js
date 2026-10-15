// MESS RUSH : le catalogue de la cuisine (ingrédients, procédés, recettes), en données seulement.
// Partagé par le relais, qui arbitre la partie, et par le client, qui la dessine (cf.
// shared/mess-rush.js pour les règles, docs/mess-rush.md pour la conception).
//
// MESS RUSH 2 : peu de gestes, tous lisibles, comme dans Overcooked. Chaque ingrédient sort de sa
// caisse ; on le coupe sur une planche, puis il cuit tout seul (marmite ou poêle) ou se sert cru ;
// une recette dit ce qu'on attend dans l'assiette (`dish`, un même ingrédient peut y être plusieurs
// fois) et sa couleur (`color` : son bon, son client, les assiettes qui le deviennent).
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
 * Recettes. `dish` : ce que l'assiette doit contenir, exactement (l'ingrédient et son état ; un
 * même ingrédient peut y être plusieurs fois, l'ordre n'importe pas). `steps` : les étapes, dans
 * l'ordre, pour la documentation (le test du catalogue vérifie qu'elles suivent les ingrédients).
 * `color` : la couleur du plat, toutes différentes. `prototype` : la sélection du premier essai.
 *
 * Les soupes et le ragoût cuisent ensemble dans une marmite (trois ingrédients) ; les crevettes se
 * saisissent à la poêle ; le riz aux crevettes et le festin réunissent sur l'assiette ce qui sort
 * de la marmite, de la poêle et de la planche.
 */
export const RECIPES = {
  'pommes-aerial': {
    name: { fr: 'Pommes d\'eden en quartiers', en: 'Eden apple slices' },
    difficulty: 'rapide', color: '#e5484d', prototype: true,
    dish: { container: 'plate', contents: [['pommes-aerial', 'coupé']] },
    steps: [['crate', 'pommes-aerial'], ['board', 'couper'], ['plates'], ['pass']],
    success: { fr: 'Les pommes coupées, en assiette, arrivent à la passe à temps.', en: 'The sliced apples, plated, reach the pass in time.' },
    failure: { fr: 'Le délai expire.', en: 'The timer runs out.' },
    status: 'adaptation', sources: ['fdev', 'clientFr'],
  },
  'crevettes-saisies': {
    name: { fr: 'Crevettes stellaires saisies', en: 'Seared vacuum krill' },
    difficulty: 'rapide', color: '#ff7eb6', prototype: true,
    dish: { container: 'plate', contents: [['crevettes-baltahsine', 'saisi']] },
    steps: [['crate', 'crevettes-baltahsine'], ['board', 'couper'], ['pan', 'saisir'], ['plates'], ['pass']],
    success: { fr: 'Les crevettes, décortiquées et saisies, arrivent en assiette à temps.', en: 'The krill, shelled and seared, reach the pass plated in time.' },
    failure: { fr: 'Le délai expire.', en: 'The timer runs out.' },
    status: 'adaptation', sources: ['fdev', 'clientFr'],
  },
  'bouillon-legumes': {
    name: { fr: 'Bouillon de légumes du bord', en: 'Ship\'s vegetable broth' },
    difficulty: 'intermediaire', color: '#2fb36d', prototype: true,
    dish: { container: 'plate', contents: [['legumes', 'cuit'], ['legumes', 'cuit'], ['legumes', 'cuit']] },
    steps: [['crate', 'legumes'], ['board', 'couper'], ['pot', 'cuire'], ['plates'], ['pass']],
    success: { fr: 'Trois légumes coupés, cuits ensemble à la marmite, arrivent en assiette à temps.', en: 'Three chopped vegetables, boiled together in the pot, reach the pass plated in time.' },
    failure: { fr: 'Le délai expire.', en: 'The timer runs out.' },
    status: 'création', sources: COMMON,
  },
  'ragout-lapin': {
    name: { fr: 'Ragoût de lapin de Ceti', en: 'Ceti rabbit stew' },
    difficulty: 'intermediaire', color: '#f76b15',
    dish: { container: 'plate', contents: [['lapin-ceti', 'cuit'], ['legumes', 'cuit'], ['legumes', 'cuit']] },
    steps: [['crate', 'lapin-ceti'], ['board', 'couper'], ['crate', 'legumes'], ['board', 'couper'], ['pot', 'cuire'], ['plates'], ['pass']],
    success: { fr: 'Le lapin et deux légumes, cuits ensemble à la marmite, arrivent en assiette à temps.', en: 'The rabbit and two vegetables, boiled together in the pot, reach the pass plated in time.' },
    failure: { fr: 'Le délai expire.', en: 'The timer runs out.' },
    status: 'adaptation', sources: ['fdev', 'clientFr'],
  },
  'riz-crevettes': {
    name: { fr: 'Riz jarouan aux crevettes stellaires', en: 'Jaroua rice with vacuum krill' },
    difficulty: 'intermediaire', color: '#8b5cf6', points: 60, time: 110,
    dish: { container: 'plate', contents: [['riz-jaroua', 'cuit'], ['crevettes-baltahsine', 'saisi']] },
    steps: [['crate', 'riz-jaroua'], ['pot', 'cuire'], ['crate', 'crevettes-baltahsine'], ['board', 'couper'], ['pan', 'saisir'], ['plates'], ['pass']],
    success: { fr: 'Le riz cuit et les crevettes saisies arrivent ensemble en assiette à temps.', en: 'The boiled rice and the seared krill reach the pass together, plated, in time.' },
    failure: { fr: 'Le délai expire.', en: 'The timer runs out.' },
    status: 'adaptation', sources: ['fdev', 'clientFr'],
  },
  'festin-du-bord': {
    name: { fr: 'Festin du bord', en: 'Captain\'s feast' },
    difficulty: 'complexe', color: '#22c5e8', points: 100, time: 150,
    dish: { container: 'plate', contents: [['riz-jaroua', 'cuit'], ['crevettes-baltahsine', 'saisi'], ['pommes-aerial', 'coupé']] },
    steps: [['crate', 'riz-jaroua'], ['pot', 'cuire'], ['crate', 'crevettes-baltahsine'], ['board', 'couper'], ['pan', 'saisir'], ['crate', 'pommes-aerial'], ['board', 'couper'], ['plates'], ['pass']],
    success: { fr: 'Le riz, les crevettes saisies et les pommes arrivent réunis dans une même assiette à temps.', en: 'Rice, seared krill and apples reach the pass together on one plate in time.' },
    failure: { fr: 'Le délai expire.', en: 'The timer runs out.' },
    status: 'création', sources: ['fdev', 'clientFr'],
  },
}

/** Recettes de la sélection du premier essai. */
export const PROTOTYPE_RECIPES = Object.keys(RECIPES).filter((id) => RECIPES[id].prototype)

/** La carte du service : toutes les recettes (les complexes n'arrivent qu'après deux minutes, cf. RULES.complexAfter). */
export const SERVICE_RECIPES = Object.keys(RECIPES)
