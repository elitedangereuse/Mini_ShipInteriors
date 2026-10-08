// La pêche à l'étang du jardin exotique, au sud de la serre du pont supérieur (cf. src/fishing/,
// le mini-jeu, et src/furniture/fishing.ts, l'étang, le ponton et le livre). Ici : où est l'étang,
// les espèces qu'on y prend, et le déroulé d'une touche (les feintes, puis le bouchon qui plonge).
// Les noms et les descriptions des poissons sont dans src/fishing/species.ts ; le site garde la
// collection de chaque CMDR (phputils/mini_shipinteriors/fish.php, qui reprend la liste des espèces).

/** Pont de l'étang (le pont supérieur). */
export const FISHING_LEVEL = 1

/**
 * L'étang : son centre, sa largeur (x) et sa profondeur (z) hors tout, margelle comprise, le rayon
 * de ses coins et la largeur de la margelle. L'eau est à `water` du sol.
 *
 * Sa taille et sa place laissent une rangée de tuiles libre tout autour (x = 1 et 6, z = 9 et 13) :
 * une tuile dont le centre est sous un meuble est fermée aux trajets (cf. Deck), et l'on doit
 * pouvoir faire le tour de l'étang en cliquant. Le décor, lui, va contre les murs (x = 0 et 7, z = 14).
 */
export const FISHING_POND = { x: 3.55, z: 11.35, w: 4.6, d: 3, corner: 1.1, rim: 0.2, water: 0.075 }

/** Le ponton, sur la rive nord : là où l'on se tient pour pêcher, face au sud (+z). */
export const FISHING_DOCK = { x: 3.55, z: 9.42 }

/** Là où l'on nourrit les carpes, sur la rive ouest (cf. src/greenhouse.ts et gardener.js). */
export const FISHING_FEED = { x: 0.95, z: 11.35 }

/** On lance au moins à cette distance du bord de l'eau : le bouchon ne se pose pas sur la margelle. */
const CAST_MARGIN = 0.22

/**
 * Le point (x, z) est-il dans l'eau de l'étang, à `margin` au moins de la margelle ? L'étang est un
 * rectangle aux coins arrondis.
 */
export function inPond(x, z, margin = 0) {
  const p = FISHING_POND
  const inset = p.rim + margin
  const hw = p.w / 2 - inset, hd = p.d / 2 - inset, r = Math.max(0, p.corner - inset)
  const dx = Math.abs(x - p.x), dz = Math.abs(z - p.z)
  if (dx > hw || dz > hd) return false
  const cx = dx - (hw - r), cz = dz - (hd - r)
  return cx <= 0 || cz <= 0 || cx * cx + cz * cz <= r * r
}

/** Le point de l'eau le plus proche de (x, z) où le bouchon peut se poser. */
export function castPoint(x, z) {
  const p = FISHING_POND
  if (inPond(x, z, CAST_MARGIN)) return { x, z }
  // Vers le centre, jusqu'à entrer dans l'eau.
  let lo = 0, hi = 1
  for (let i = 0; i < 20; i++) {
    const k = (lo + hi) / 2
    if (inPond(x + (p.x - x) * k, z + (p.z - z) * k, CAST_MARGIN)) hi = k
    else lo = k
  }
  return { x: x + (p.x - x) * hi, z: z + (p.z - z) * hi }
}

/** Raretés, de la plus courante à la plus rare. */
export const FISH_RARITIES = ['common', 'rare', 'epic', 'legendary']

/**
 * Ce que change la rareté : la part des touches (`weight`), le nombre de feintes avant la vraie
 * touche (de `feints[0]` à `feints[1]`), le temps laissé pour ferrer quand le bouchon plonge
 * (`window`, secondes).
 */
export const FISH_RARITY = {
  common: { weight: 62, feints: [0, 1], window: 1.05 },
  rare: { weight: 25, feints: [1, 2], window: 0.8 },
  epic: { weight: 10, feints: [1, 3], window: 0.62 },
  legendary: { weight: 3, feints: [2, 4], window: 0.48 },
}

/**
 * Les espèces de l'étang. `model` : le modèle d'un des deux packs de Quaternius (cf.
 * scripts/import-quaternius-fish.mjs et import-quaternius-cute-fish.mjs) ; `colors` : la couleur
 * de ses parties (le nom de ses matériaux), celles qu'on ne nomme pas gardant la couleur du pack ;
 * `glow` : la part de cette couleur qu'une partie émet (les poissons qui luisent) ; `size` : la
 * taille des prises, de la plus petite à la plus grande (cm).
 *
 * Le premier pack compte sept modèles sans couleurs propres : chacun donne plusieurs espèces, par
 * ses couleurs. Les vingt-cinq du second ont les leurs : une espèce par modèle. Cinq légendaires
 * seulement, plus une sixième qui ne mord pas au hasard (`quest`) : elle ne passe dans l'étang que
 * dans le sillage d'un saut FSD, pour qui sait l'y attendre (cf. QUEST_FISH).
 */
export const FISH = [
  // --- Communs
  { id: 'lave-carp', model: 'fish1', rarity: 'common', size: [18, 45], colors: { Top: '#d9532b', Bottom: '#f3e2c4', Fins: '#f0a63a' } },
  { id: 'hull-roach', model: 'fish1', rarity: 'common', size: [9, 22], colors: { Top: '#6f7f8c', Bottom: '#dfe6ea', Fins: '#9aa9b5' } },
  { id: 'sol-bluefin', model: 'fish2', rarity: 'common', size: [12, 30], colors: { Body: '#2f5fd0', Front: '#5aa2ee', Fins: '#f0d878' } },
  { id: 'hydro-grazer', model: 'fish2', rarity: 'common', size: [8, 19], colors: { Body: '#3f8f4a', Front: '#8fce6a', Fins: '#d8f0a0' } },
  { id: 'jameson-clown', model: 'fish3', rarity: 'common', size: [6, 14], colors: { Body: '#f07a1c', Stripes: '#fbf6ea', Outline: '#1f1f24' } },
  { id: 'pilot-goldfish', model: 'goldfish', rarity: 'common', size: [5, 16], colors: {} },
  { id: 'cargo-tetra', model: 'tetra', rarity: 'common', size: [3, 8], colors: {} },
  { id: 'coolant-catfish', model: 'catfish', rarity: 'common', size: [20, 48], colors: {} },
  { id: 'sidewinder-tang', model: 'tang', rarity: 'common', size: [10, 26], colors: {} },
  { id: 'eravate-butterfly', model: 'butterfly', rarity: 'common', size: [8, 20], colors: {} },
  { id: 'hauler-cowfish', model: 'cowfish', rarity: 'common', size: [12, 30], colors: {} },
  { id: 'paintjob-gramma', model: 'gramma', rarity: 'common', size: [5, 12], colors: {} },
  { id: 'limpet-parrot', model: 'parrot', rarity: 'common', size: [20, 50], colors: {} },
  { id: 'onionhead-horn', model: 'flowerhorn', rarity: 'common', size: [15, 35], colors: {} },
  // --- Rares
  { id: 'runaway-koi', model: 'fish1', rarity: 'rare', size: [35, 70], colors: { Top: '#f4f1e8', Bottom: '#fbf8f0', Fins: '#ff6a1f' } },
  { id: 'federal-fighter', model: 'fish2', rarity: 'rare', size: [10, 24], colors: { Body: '#c0262d', Front: '#f4f4f4', Fins: '#2b4ea8' } },
  { id: 'achenar-angel', model: 'fish3', rarity: 'rare', size: [12, 28], colors: { Body: '#2a5fc4', Stripes: '#ffd24a', Outline: '#f4f1e8' } },
  { id: 'dwarf-manta', model: 'manta', rarity: 'rare', size: [40, 85], colors: { Top: '#27406e', Bottom: '#e8ecf0' } },
  { id: 'imperial-betta', model: 'betta', rarity: 'rare', size: [5, 11], colors: {} },
  { id: 'kumo-koi', model: 'koi', rarity: 'rare', size: [30, 75], colors: {} },
  { id: 'pirate-piranha', model: 'piranha', rarity: 'rare', size: [12, 30], colors: {} },
  { id: 'heatsink-puffer', model: 'puffer', rarity: 'rare', size: [10, 28], colors: {} },
  { id: 'cubeo-idol', model: 'idol', rarity: 'rare', size: [10, 23], colors: {} },
  { id: 'colonia-mandarin', model: 'mandarin', rarity: 'rare', size: [4, 9], colors: {} },
  { id: 'anaconda-wrasse', model: 'humphead', rarity: 'rare', size: [45, 110], colors: {} },
  { id: 'type9-tuna', model: 'tuna', rarity: 'rare', size: [80, 170], colors: {} },
  { id: 'interdictor-sole', model: 'flatfish', rarity: 'rare', size: [20, 45], colors: {} },
  // --- Épiques
  { id: 'diso-dolphin', model: 'dolphin', rarity: 'epic', size: [60, 110], colors: { Top: '#6f8da6', Bottom: '#e6eef2' } },
  { id: 'archon-shark', model: 'shark', rarity: 'epic', size: [70, 140], colors: { Top: '#3c4350', Bottom: '#cfd5da' } },
  { id: 'caustic-fish', model: 'fish3', rarity: 'epic', size: [15, 33], colors: { Body: '#1f3a2a', Stripes: '#7dff5a', Outline: '#0c1410' }, glow: { Stripes: 0.8 } },
  { id: 'nebula-ray', model: 'manta', rarity: 'epic', size: [55, 120], colors: { Top: '#6a2fb0', Bottom: '#ff8ad8' }, glow: { Bottom: 0.35 } },
  { id: 'fdl-lionfish', model: 'lionfish', rarity: 'epic', size: [18, 40], colors: {} },
  { id: 'stealth-lionfish', model: 'lionfish-black', rarity: 'epic', size: [18, 40], colors: { Light: '#55626e' } },
  { id: 'railgun-swordfish', model: 'swordfish', rarity: 'epic', size: [90, 190], colors: {} },
  { id: 'witch-goblin', model: 'goblin', rarity: 'epic', size: [100, 190], colors: {} },
  { id: 'explorer-blobfish', model: 'blobfish', rarity: 'epic', size: [20, 38], colors: {} },
  // --- Légendaires
  { id: 'pocket-whale', model: 'whale', rarity: 'legendary', size: [90, 180], colors: { Top: '#2c3f78', Bottom: '#e9d9b0' } },
  { id: 'raxxla-shark', model: 'shark', rarity: 'legendary', size: [120, 200], colors: { Top: '#e8b838', Bottom: '#fff4c8' }, glow: { Top: 0.3 } },
  { id: 'guardian-fish', model: 'fish1', rarity: 'legendary', size: [25, 50], colors: { Top: '#12202c', Bottom: '#1c3444', Fins: '#5ff0ff' }, glow: { Fins: 1 } },
  { id: 'beagle-sunfish', model: 'sunfish', rarity: 'legendary', size: [100, 200], colors: {} },
  { id: 'void-angler', model: 'angler', rarity: 'legendary', size: [20, 60], colors: { Lamp: '#5ff0ff' }, glow: { Lamp: 1 } },
  // --- Hors du tirage : la koï du sillage, la dernière page du livre (quête « Le poisson qui n'existe pas »).
  { id: 'witchspace-koi', model: 'fish1', rarity: 'legendary', size: [42, 88], colors: { Top: '#7a4bd8', Bottom: '#e3d6ff', Fins: '#b98cff' }, glow: { Top: 0.45, Fins: 1 }, quest: 'poisson-fantome' },
]

/**
 * La koï du sillage : elle ne mord que dans les minutes qui suivent un saut FSD (`window`,
 * secondes), à qui la cherche pour sa quête (`quest`, cf. shared/quests.js) ; la quête terminée,
 * elle repasse de temps en temps dans le même sillage (`chance`, par lancer).
 */
export const QUEST_FISH = { id: 'witchspace-koi', quest: 'poisson-fantome', window: 300, chance: 0.25 }

/** Espèce de cet identifiant, ou undefined. */
export const fishById = (id) => FISH.find((f) => f.id === id)

/** Tire une espèce : la rareté selon son poids, puis une espèce de cette rareté. `random` : de 0 à 1. */
export function pickFish(random = Math.random) {
  const total = FISH_RARITIES.reduce((sum, r) => sum + FISH_RARITY[r].weight, 0)
  let roll = random() * total
  let rarity = FISH_RARITIES[0]
  for (const r of FISH_RARITIES) {
    rarity = r
    if ((roll -= FISH_RARITY[r].weight) < 0) break
  }
  // Une espèce de quête ne sort jamais du tirage.
  const pool = FISH.filter((f) => f.rarity === rarity && !f.quest)
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]
}

/** Taille d'une prise (cm) : plutôt petite, rarement proche du maximum de l'espèce. */
export function fishSize(fish, random = Math.random) {
  const [min, max] = fish.size
  return Math.round(min + (max - min) * random() ** 2)
}

/** Durée d'une feinte : le bouchon frémit, s'enfonce à peine et remonte (secondes). */
export const FEINT_TIME = 0.55

/**
 * Déroulé d'une touche pour ce poisson, en secondes depuis que le bouchon s'est posé : les
 * instants des feintes (`feints`), puis celui où le bouchon plonge (`bite`) et le temps laissé pour
 * ferrer (`window`).
 */
export function bitePlan(fish, random = Math.random) {
  const rule = FISH_RARITY[fish.rarity]
  const count = rule.feints[0] + Math.floor(random() * (rule.feints[1] - rule.feints[0] + 1))
  let t = 2.2 + random() * 3.6
  const feints = []
  for (let i = 0; i < count; i++) {
    feints.push(t)
    t += FEINT_TIME + 0.7 + random() * 1.9
  }
  return { feints, bite: t, window: rule.window }
}
