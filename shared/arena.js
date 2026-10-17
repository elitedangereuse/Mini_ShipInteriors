// L'arène : duels par équipes, à trois contre trois au plus, entre personnages jouables (des membres
// de l'équipage du vaisseau, cf. ARENA_CHARACTERS), chacun avec son arme et sa façon de jouer.
// Règles communes au relais, qui arbitre la partie (points de vie, tirs, bots, score), et au
// client, qui la dessine et y fait jouer le moteur du stand (cf. src/range.ts, src/arena/).
//
// Le terminal de l'arène est dans son propre lobby (la pièce 'y' de la cale, cf. ARENA_LOBBY). Le
// plan de la partie est tiré au hasard à son lancement (ARENA_MAPS : la baie, un stade tous projecteurs
// allumés ; la ruche, une structure thargoïde), une base par équipe à chaque bout. Tout obstacle y
// occupe sa tuile entière, du sol au plafond : il arrête les pas, la vue et les balles, pour le
// relais comme pour le client, quelle que soit la vue. Seuls les buissons laissent tout passer : on s'y cache.
//
// La partie s'inspire de Brawl Stars : on voit tout ce que la caméra montre (pas de brouillard), sauf
// qui se tient dans un buisson ; les points de vie remontent vite quand on ne prend plus de balles ;
// la première équipe à la limite de points gagne la manche, et la partie se joue en deux manches gagnantes.
// Chacun choisit son personnage au lobby et le garde toute la partie.

import { DIRS } from './ship-map.js'
import { lineOfSight } from './sight.js'

/** « Pont » de l'arène : hors du vaisseau, sous les autres (baie infestée -2, conduits -3, simulateur -4). */
export const ARENA_LEVEL = -5
/**
 * Le lobby de l'arène : la pièce 'y' de la cale (cf. shared/ship-layouts.js), à l'ouest du hall de
 * la cale ('p'), d'où l'on vient, à la place de l'ancienne soute. On garde sa place dans un lobby
 * du terminal tant qu'on reste dans l'une ou l'autre.
 */
export const ARENA_LOBBY = { level: -1, room: 'y', rooms: 'yp' }
/** Où l'on revient (fin de partie, abandon) : au milieu du lobby, entre le terminal et le guichet. */
export const ARENA_RETURN = { x: 18.4, z: 2.3 }
/** Le terminal, contre le mur ouest, face au guichet (cf. src/levels.ts). */
export const ARENA_TERMINAL = { x: 16.92, z: 1.7 }
/**
 * Le guichet de l'arbitre, adossé au mur est, tourné vers l'ouest (`yaw`) : où elle se tient
 * derrière sa vitre, et où l'on se met pour lui parler, devant le comptoir.
 */
export const ARENA_BOOTH = { x: 20.03, z: 1.15, yaw: -Math.PI / 2, referee: { x: 19.95, z: 1.15 }, counter: { x: 18.75, z: 1.15 } }

/**
 * Chiffres de la partie (tuiles et secondes).
 * - `team` : joueurs par équipe, au plus ; `goals` : les limites de points au choix du chef du lobby
 *   (une élimination, un point ; la première équipe à la limite gagne la manche), `goal` : celle de départ ;
 * - `wins`, `rounds` : la partie se joue en manches, la première équipe à `wins` manches l'emporte,
 *   en `rounds` manches au plus (deux manches gagnantes, en trois) ;
 * - `duration` : au bout du temps d'une manche, l'équipe en tête la gagne (à égalité, personne) ;
 *   `warmup` : avant le coup d'envoi, on se place, personne ne tire ; `intermission` : de même
 *   entre deux manches, chacun revenu à sa base ;
 * - `respawn` : délai avant de revenir à sa base ; `shield` : invulnérable ensuite, tant qu'on ne tire pas ;
 * - `regenAfter`, `regen` : sans dégât depuis ce délai, les points de vie remontent (`regen` : la part
 *   de ses points de vie de départ qu'un combattant regagne par seconde) ;
 * - `bush` : dans un buisson, un adversaire ne nous voit que de tout près (`near`), ou pendant
 *   `reveal` secondes après qu'on a tiré ou pris une balle ;
 * - `body` : ce qu'une balle touche d'un combattant (un cylindre posé au sol) ; `aim` : la hauteur
 *   d'où part un tir à plat (vue de dessus, bots) ; `ceiling` : le plafond ;
 * - `sprint` : la vitesse d'un joueur à la course (celle de src/player.ts) ; `bot` : celle d'un bot.
 *   L'une et l'autre pour un personnage de vitesse 1 (cf. ARENA_CHARACTERS) ;
 * - `lob` : durée de vol d'un objet lancé (graine, cocktail), au plus court (s) ;
 * - `assist` : le tir rapide (au doigt, toucher le stick de tir sans viser ; en vue subjective, le
 *   tir sur l'adversaire le plus près de la mire) vise l'adversaire le plus proche, mais pas mieux
 *   qu'un bon joueur à la souris : il s'en écarte au hasard de `assist` degrés au plus, comme un bot
 *   (cf. ARENA_SKILLS, assistAim) ; un lancer, de deux pour cent par degré de sa distance. Un essai
 *   (server/arena-assist.test.js) le situe entre un bot recrue et un bot d'élite, contre une cible qui court.
 */
export const ARENA_RULES = {
  /** Lobbys du terminal : autant de parties qui peuvent se préparer (et se jouer) en même temps. */
  lobbies: 4,
  team: 3,
  /** Profondeur d'une base, depuis le bord de l'arène (tuiles). */
  baseDepth: 3,
  goals: [5, 10, 15],
  goal: 15,
  wins: 2,
  rounds: 3,
  duration: 300,
  countdown: 3,
  warmup: 4,
  intermission: 6,
  respawn: 3,
  shield: 2,
  regenAfter: 3,
  regen: 0.18,
  bush: { near: 1.6, reveal: 1.2 },
  body: { r: 0.24, h: 0.75 },
  aim: 0.24,
  ceiling: 2.2,
  sprint: 3.4,
  bot: 2.5,
  lob: 0.35,
  assist: 4.5,
}

/**
 * Les personnages jouables, des membres de l'équipage (leurs noms, leur allure et leur humour sont
 * côté client : src/arena/characters.ts). Chacun a ses forces et ses faiblesses : aucun ne gagne
 * partout, et ils se complètent dans une équipe.
 * - `hp` : points de vie ; `speed` : part de la vitesse de course (1 : Rourke, la référence) ;
 * - `scan` : Nico et Boulon, son drone : à moins de cette distance (tuiles), un buisson ne leur cache
 *   personne (Boulon le scanne) ;
 * - `weapon` : son arme, qui ne se change pas :
 *   - `auto` : tire tant que la détente est tenue ; `burst` : au stick tactile, balles d'une rafale ;
 *   - `interval`, `mag`, `reload` : délai entre deux tirs, chargeur, rechargement (s) ;
 *   - `speed` : vitesse du projectile (tuiles par seconde ; à plat, pour un objet lancé) ;
 *     `pierce` : il traverse ceux qu'il touche ; `pellets` : projectiles par tir ; `spread` :
 *     dispersion au repos (degrés) ;
 *   - `damage` : points de vie retirés par coup (au centre de l'explosion, s'il y en a une ; par
 *     morsure, pour les fleurs de Capucine) ; `range` : distance qu'il parcourt avant de s'éteindre
 *     (tuiles), ou jusqu'où l'on lance ; `reach` : d'où un bot aime s'en servir, en deçà ;
 *   - `blast` : rayon de l'explosion à l'impact (0 : aucune ; dégâts pleins au centre, un tiers au bord) ;
 *   - `heal` : Betty : ce que rend à un coéquipier blessé chacun de ses projectiles, qui blessent les
 *     adversaires (ils traversent les coéquipiers en pleine forme, et jamais elle-même) ;
 *   - `lob` : on le lance en cloche, par-dessus les obstacles, là où l'on vise (à portée) : il ne
 *     touche rien en vol, et retombe au point visé ;
 *   - `flower` : Capucine : là où retombe sa graine pousse une fleur carnivore, qui mord (`damage`)
 *     l'adversaire le plus proche à moins de `radius`, toutes les `every` secondes, une fois sortie
 *     de terre (`grow`) et pendant `life` secondes ; `most` fleurs à la fois, la plus vieille fane.
 *     Avant chaque morsure, elle s'arme (`windup` secondes, compris dans `every`) : elle se tourne
 *     vers sa proie et ouvre grand ses mâchoires ; qui sort de sa portée à temps y échappe ;
 *   - `fire` : Jacques : là où éclate son cocktail, une flaque brûle `life` secondes, et chaque
 *     adversaire qui s'y tient (à moins de `radius`) perd `damage` toutes les `every` secondes.
 */
export const ARENA_CHARACTERS = {
  rourke: {
    hp: 100, speed: 1,
    weapon: { auto: true, burst: 8, interval: 0.09, mag: 18, reload: 1.6, speed: 46, pierce: false, pellets: 1, spread: 2.4, damage: 8, range: 5.5, reach: 4, blast: 0 },
  },
  marcel: {
    hp: 160, speed: 0.78,
    weapon: { auto: false, interval: 0.55, mag: 3, reload: 1.6, speed: 11, pierce: false, pellets: 1, spread: 1, damage: 45, range: 4.5, reach: 3.2, blast: 0.85 },
  },
  nico: {
    hp: 65, speed: 1.15, scan: 3,
    weapon: { auto: false, interval: 0.85, mag: 3, reload: 1.9, speed: 80, pierce: true, pellets: 1, spread: 0, damage: 60, range: 8, reach: 6.5, blast: 0 },
  },
  betty: {
    hp: 100, speed: 1,
    weapon: { auto: false, interval: 0.38, mag: 5, reload: 1.4, speed: 26, pierce: false, pellets: 1, spread: 0.6, damage: 24, heal: 24, range: 6, reach: 4.5, blast: 0 },
  },
  capucine: {
    hp: 90, speed: 1,
    weapon: {
      auto: false, interval: 0.8, mag: 3, reload: 2.2, speed: 9, lob: true, pierce: false, pellets: 1, spread: 0, damage: 20, range: 6.5, reach: 4.5, blast: 0,
      flower: { life: 6, radius: 1.6, every: 0.6, grow: 0.3, most: 2, windup: 0.25 },
    },
  },
  jacques: {
    hp: 140, speed: 0.85,
    weapon: {
      auto: false, interval: 0.9, mag: 3, reload: 2.2, speed: 9, lob: true, pierce: false, pellets: 1, spread: 0, damage: 32, range: 6, reach: 4.8, blast: 0.9,
      fire: { life: 2.5, radius: 1, every: 0.4, damage: 11 },
    },
  },
}

export const CHARACTER_IDS = Object.keys(ARENA_CHARACTERS)
/** Le personnage qu'on a tant qu'on n'en a pas choisi d'autre. */
export const DEFAULT_CHARACTER = 'rourke'

/** Les deux équipes : leur couleur, celle des bases, des noms et des anneaux au sol. */
export const ARENA_TEAMS = [
  { id: 0, color: '#ff8a1c' },
  { id: 1, color: '#3fc8ff' },
]

/**
 * Les couleurs de la partie, telles que le joueur la voit (cf. src/arena/palette.ts) : lui
 * (`self`), les siens (`ally`), ceux d'en face (`enemy`), et les soins (`heal`). Les mêmes partout :
 * anneaux, contours, plaques, projectiles, pièges, score, chiffres. Choisies pour rester distinctes
 * aux formes courantes de daltonisme (protanopie, deutéranopie, tritanopie ; les essais le
 * vérifient) : le bleu des siens et le rouge-orangé d'en face ne se confondent pour aucune, le
 * jaune de soi et le vert d'eau des soins se distinguent aussi par leur clarté. La forme double la
 * couleur là où elle compte : les dents de l'anneau d'un adversaire, la flèche du sien, le signe et
 * la croix des soins.
 */
export const ARENA_PALETTE = { self: '#ffe14d', ally: '#2e86ff', enemy: '#ff4733', heal: '#9cffd6' }

/**
 * Niveau des bots : délai avant le premier tir sur qui ils viennent de voir (s), écart de visée
 * (degrés, au hasard autour de la cible), part de la cadence de l'arme qu'ils tiennent.
 */
export const ARENA_SKILLS = [
  { reaction: 0.8, error: 7, pace: 0.5 },
  { reaction: 0.5, error: 4, pace: 0.7 },
  { reaction: 0.28, error: 2, pace: 0.9 },
]

/** Noms des bots, tirés au hasard à chaque partie. */
export const ARENA_BOTS = ['Drone Vipère', 'Drone Cobra', 'Drone Python', 'Drone Anaconda', 'Drone Krait', 'Drone Mamba', 'Drone Asp', 'Drone Orca', 'Drone Faucon', 'Drone Aigle']

/**
 * Les plans, une lettre par tuile :
 *   ' '  hors du terrain (le vide)   '.'  sol   '#'  cloison (plein)
 *   '='  conteneurs couchés (par paires, de gauche à droite)
 *   'H'  conteneurs debout (par paires, de haut en bas)
 *   'c'  caisses d'armes blindées (une tuile)      'p'  pilier (une tuile)
 *   'o'  cosse thargoïde (une tuile)               'X'  le cœur, la relique (un rectangle de tuiles)
 *   'g'  buisson : on y passe, les balles aussi, et l'on s'y cache ; 'G' : le même, sur le haut
 *   'u'  le haut : un sol surélevé de `plateau` (cf. le plan)
 *   'r'  rampe : elle monte vers le haut voisin, depuis le sol d'en face
 *   'P'  pilier posé sur le haut (une tuile)
 *   'v'  gouffre : on ne le traverse pas, mais les balles et le regard passent par-dessus
 *   'A', 'B'  points d'apparition de chaque équipe (la première à l'ouest, l'autre à l'est)
 * Sur chaque plan, obstacles et buissons se répondent d'un bout à l'autre (un demi-tour autour du
 * centre) : aucune équipe n'a l'avantage du terrain. `name` : en français, en anglais.
 *
 * - La baie (17 × 11) : le stade de CMDR Arena (cf. src/arena/venue.ts). Trois allées : au nord, au
 *   milieu par la cour centrale et ses deux buissons, au sud.
 * - La ruche (23 × 15) : une structure thargoïde, en chrysalide (un octogone étiré d'une base à
 *   l'autre, renflé au milieu). Au milieu, la chambre du cœur, octogone elle aussi, fermée de
 *   nervures, ses coins coupés : une porte de trois tuiles sur chaque côté droit, des massifs de
 *   spores (buissons) dans ses coins. Autour, deux galeries au nord et au sud, une spire au milieu de
 *   chacune et des spores dans le renflement, coupées d'une nervure de chaque côté ; devant chaque
 *   base, deux chevrons et une spire ; des spores encore, au coin des bases et devant la porte de la
 *   chambre. Tout le terrain sert : rien n'y est à l'écart du chemin d'une base à l'autre (cf.
 *   src/arena/hive.ts).
 * - Le site gardien (23 × 17) : le sanctuaire du gouffre, des ruines gardiennes de nuit, suspendues
 *   au-dessus du vide, sur deux hauteurs. Au milieu, le sanctuaire en croix, en hauteur (`plateau`),
 *   à bras de cinq tuiles : sa travée d'ouest en est (9 × 5), et ses bras nord et sud ; on y monte par
 *   une rampe de toute la largeur du bras, au bout de chacun, depuis un palier au-dessus du gouffre.
 *   La relique au milieu, un obélisque à chaque coin de son carré, de la brume en haut des rampes de
 *   la travée. Autour, quatre gouffres ; au nord et au sud, deux ponts au sol ; à l'ouest et à l'est,
 *   les esplanades des bases. On ne traverse pas un gouffre, mais on tire par-dessus. D'en bas, on ne voit
 *   (et ne touche) que qui se tient près du bord du haut ; d'en haut, on tire par-dessus le vide. Des
 *   obélisques, des pans de ruines et des nappes de brume (les buissons), où se cacher, sur les ponts
 *   et les esplanades (cf. src/arena/guardian.ts).
 */
export const ARENA_MAPS = [
  {
    id: 'bay',
    name: ['La baie', 'The bay'],
    plan: [
      '.....g....==.....',
      '...c.g.......c...',
      '.A.....H...gg..B.',
      '...==..H.#.......',
      '......gg.#..==...',
      '.A..p.......p..B.',
      '...==..#.gg......',
      '.......#.H..==...',
      '.A..gg...H.....B.',
      '...c.......g.c...',
      '.....==....g.....',
    ],
  },
  {
    id: 'guardian',
    name: ['Le site gardien', 'The Guardian site'],
    plateau: 0.42,
    plan: [
      '  .....#.......#.....  ',
      ' .gg....gg.p.gg....gg. ',
      '......#...ggg...#......',
      '...#.vvvv.....vvvv.#...',
      '..p.gvvvvrrrrrvvvvg.p..',
      '....gvvvvuuuuuvvvvg....',
      '.A....rGuPuuuPuGr....B.',
      '......rGuuuuuuuGr......',
      '.A.g..ruuuuXuuuur..g.B.',
      '......rGuuuuuuuGr......',
      '.A....rGuPuuuPuGr....B.',
      '....gvvvvuuuuuvvvvg....',
      '..p.gvvvvrrrrrvvvvg.p..',
      '...#.vvvv.....vvvv.#...',
      '......#...ggg...#......',
      ' .gg....gg.p.gg....gg. ',
      '  .....#.......#.....  ',
    ],
  },
  {
    id: 'hive',
    name: ['La ruche', 'The hive'],
    plan: [
      '        ..g.g..        ',
      '   ...#....o....#...   ',
      '  .gg.#.........#.gg.  ',
      ' .......##...##....... ',
      '....##.#.......#.##....',
      '.A..#..#g.....g#..#..B.',
      '.....g....XXX....g.....',
      '.A..o.....XXX.....o..B.',
      '.....g....XXX....g.....',
      '.A..#..#g.....g#..#..B.',
      '....##.#.......#.##....',
      ' .......##...##....... ',
      '  .gg.#.........#.gg.  ',
      '   ...#....o....#...   ',
      '        ..g.g..        ',
    ],
  },
]

/** Le plan d'une partie, s'il existe (sinon le premier). */
export function arenaMap(id) {
  return ARENA_MAPS.find((m) => m.id === id) ?? ARENA_MAPS[0]
}

/** Ce qui arrête les pas, la vue et les balles ; ce qui est un obstacle posé (le reste : le vide, les cloisons). */
const SOLID = ' #=HcpPo Xv'
const PROPS = { '=': 'container', H: 'container', c: 'crates', p: 'pillar', P: 'pillar', o: 'pod', X: 'core' }
/** Ce qui est en haut (le sol du haut, ce qui y est posé, sa brume). */
const HIGH = 'uPXG'
/** Le sol du haut, où l'on se tient (une rampe y monte). */
const TOP = 'uG'

const cached = new Map()

/**
 * L'arène d'un plan (`id`, cf. ARENA_MAPS), prête à l'emploi (construite une fois). Elle a la forme
 * de la baie de la zone thargoïde (cf. generateZone dans salvage.js) : `blocked`, `adj`, `walkMap`…
 * si bien que ses fonctions de chemin (findPath, smoothPath, walkable, tileOf) s'y appliquent telles
 * quelles.
 */
export function arenaZone(id) {
  const map = arenaMap(id)
  const known = cached.get(map.id)
  if (known) return known
  const plan = map.plan
  const top = map.plateau ?? 0
  const H = plan.length, W = plan[0].length
  const N = W * H
  const idx = (x, z) => z * W + x
  const inside = (x, z) => x >= 0 && z >= 0 && x < W && z < H
  const blocked = new Uint8Array(N)
  /** Gouffre : bloqué pour les pas (cf. blocked), pas pour les balles ni la vue. */
  const pit = new Uint8Array(N)
  const bush = new Uint8Array(N)
  const room = new Array(N)
  const spawns = [[], []]
  const containers = []
  const done = new Uint8Array(N)
  const elev = new Float64Array(N)
  const stairs = new Int8Array(N).fill(-1)
  const cell = (x, z) => (inside(x, z) ? plan[z][x] : ' ')
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const c = plan[z][x]
      const i = idx(x, z)
      room[i] = c === '#' || c === ' ' || c === 'v' ? ' ' : 'a'
      if (SOLID.includes(c)) blocked[i] = 1
      if (c === 'v') {
        pit[i] = 1
        // Son fond, très bas : une balle passe au-dessus.
        elev[i] = -3
      }
      if (top && HIGH.includes(c)) elev[i] = top
      if (c === 'r') {
        // Une rampe monte vers le haut voisin, depuis un sol praticable en face.
        const up = [0, 1, 2, 3].find((d) => TOP.includes(cell(x + DIRS[d].dx, z + DIRS[d].dz)))
        const down = up === undefined ? ' ' : cell(x - DIRS[up].dx, z - DIRS[up].dz)
        if (!top || up === undefined || SOLID.includes(down) || 'urG'.includes(down)) throw new Error(`Rampe mal placée en (${x}, ${z}) sur le plan ${map.id}`)
        stairs[i] = up
        elev[i] = top / 2
      }
      if (c === 'g' || c === 'G') bush[i] = 1
      if (c === 'A') spawns[0].push({ x, z })
      if (c === 'B') spawns[1].push({ x, z })
      if (done[i] || !PROPS[c]) continue
      // Un conteneur fait deux tuiles ; le cœur, tout son rectangle.
      let w = c === '=' ? 2 : 1, d = c === 'H' ? 2 : 1
      if (c === 'X') {
        while (inside(x + w, z) && plan[z][x + w] === c) w++
        while (inside(x, z + d) && plan[z + d][x] === c) d++
      }
      for (let tz = z; tz < z + d; tz++) {
        for (let tx = x; tx < x + w; tx++) {
          if (!inside(tx, tz) || plan[tz][tx] !== c || done[idx(tx, tz)]) throw new Error(`Obstacle '${c}' incomplet en (${x}, ${z}) sur le plan ${map.id}`)
          done[idx(tx, tz)] = 1
        }
      }
      containers.push({ x, z, w, d, kind: PROPS[c], color: (x * 7 + z * 13) % 3, flip: (x + z) % 2 === 1 })
    }
  }
  // Garde-corps : le haut ne se rejoint que par ses rampes (et une rampe, que par son bas, son haut,
  // ou la rampe jumelle d'à côté). Ailleurs, ses bords sont des falaises.
  const tier = (x, z) => (TOP.includes(cell(x, z)) ? 'u' : cell(x, z) === 'r' ? 'r' : 'g')
  const joins = (x, z, dir) => {
    const nx = x + DIRS[dir].dx, nz = z + DIRS[dir].dz
    const a = tier(x, z), b = tier(nx, nz)
    const sa = stairs[idx(x, z)], sb = inside(nx, nz) ? stairs[idx(nx, nz)] : -1
    if (a === b && a !== 'r') return true
    if (a === 'r' && b === 'u') return sa === dir
    if (a === 'u' && b === 'r') return sb === (dir + 2) % 4
    if (a === 'r' && b === 'g') return sa === (dir + 2) % 4
    if (a === 'g' && b === 'r') return sb === dir
    return a === 'r' && b === 'r' && sa === sb && dir % 2 !== sa % 2
  }
  // Graphe des tuiles libres (4 directions ; -1 : cloison, bord, obstacle, garde-corps).
  const adj = new Int32Array(N * 4).fill(-1)
  const open = new Uint8Array(N * 4)
  const rails = []
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const i = idx(x, z)
      for (let dir = 0; dir < 4; dir++) {
        const nx = x + DIRS[dir].dx, nz = z + DIRS[dir].dz
        if (!inside(nx, nz) || room[i] === ' ' || room[idx(nx, nz)] === ' ') continue
        open[i * 4 + dir] = 1
        if (blocked[i] || blocked[idx(nx, nz)]) continue
        if (!joins(x, z, dir)) {
          // Une fois par arête, vue de l'est ou du sud (comme les murs d'un plan de pont).
          if (dir === 1 || dir === 2) rails.push({ x, z, dir })
          continue
        }
        adj[i * 4 + dir] = idx(nx, nz)
      }
    }
  }
  const free = (x, z) => inside(x, z) && !blocked[idx(x, z)]
  // Le regard passe par-dessus un gouffre.
  const clear = (x, z) => inside(x, z) && (!blocked[idx(x, z)] || pit[idx(x, z)] === 1)
  const tileRoom = (x, z) => (inside(x, z) ? room[idx(x, z)] : null)
  // Plan de vue et de tir : tout obstacle y arrête tout (sur un plan à deux hauteurs, la vue suit
  // les balles, cf. arenaSight). Plan de marche : chaque arête franchie est un passage.
  const sight = {
    isFloor: clear,
    room: tileRoom,
    edge: (x, z, dir) => (clear(x, z) && clear(x + DIRS[dir].dx, z + DIRS[dir].dz) ? 'open' : 'wall'),
  }
  const walk = {
    isFloor: free,
    room: tileRoom,
    edge: (x, z, dir) => (free(x, z) && adj[idx(x, z) * 4 + dir] >= 0 ? 'open' : 'wall'),
  }
  const zone = {
    id: map.id, plan,
    width: W, height: H, blocked, pit, bush, room, open, adj, spawns, containers,
    layout: plan.map((line) => line.replace(/[#v]/g, ' ').replace(/[^ ]/g, 'a')),
    stairs, elev, top, rails,
    walkMap: walk, sightMap: sight,
  }
  cached.set(map.id, zone)
  return zone
}

/**
 * Hauteur du sol en `p` : celle du haut, qui monte le long d'une rampe (0 sur un plan d'un seul
 * niveau). Hors du terrain, 0.
 */
export function arenaGround(zone, p) {
  if (!zone.top) return 0
  const x = Math.round(p.x), z = Math.round(p.z)
  if (x < 0 || z < 0 || x >= zone.width || z >= zone.height) return 0
  const i = z * zone.width + x
  const up = zone.stairs[i]
  if (up < 0) return zone.elev[i]
  const s = (p.x - x) * DIRS[up].dx + (p.z - z) * DIRS[up].dz
  return zone.top * Math.min(1, Math.max(0, s + 0.5))
}

/**
 * Rien ne sépare `from` de `to` dans l'arène (ni cloison, ni conteneur). Sur un plan à deux
 * hauteurs, le regard part de la hauteur d'un tir à plat au-dessus du sol de chacun, et une falaise
 * l'arrête comme une balle : d'en bas, on ne voit que qui se tient près du bord du haut.
 */
export function arenaSight(zone, from, to) {
  if (!zone.top) return lineOfSight(zone.sightMap, from, to)
  const a = { x: from.x, y: arenaGround(zone, from) + ARENA_RULES.aim, z: from.z }
  const dx = to.x - a.x, dy = arenaGround(zone, to) + ARENA_RULES.aim - a.y, dz = to.z - a.z
  const len = Math.hypot(dx, dy, dz)
  if (len < 1e-6) return true
  return castArena(zone, a, { x: dx / len, y: dy / len, z: dz / len }, len, []).t >= len - 1e-6
}

/**
 * Dans la base de l'équipe `team` ? (ses `baseDepth` colonnes, au bout de l'arène qui est le sien :
 * l'ouest pour l'équipe 0, l'est pour l'autre). Personne n'entre dans la base adverse, et ni fleur ni
 * flaque n'y prend.
 */
export function inArenaBase(zone, team, p) {
  return team === 0 ? p.x < ARENA_RULES.baseDepth - 0.5 : p.x > zone.width - ARENA_RULES.baseDepth - 0.5
}

/** Dans un buisson ? */
export function inBush(zone, p) {
  const x = Math.round(p.x), z = Math.round(p.z)
  return x >= 0 && z >= 0 && x < zone.width && z < zone.height && zone.bush[z * zone.width + x] === 1
}

/**
 * Un adversaire en `viewer` ne voit pas le combattant en `p` : il est dans un buisson, pas tout
 * près, et n'a ni tiré ni pris de balle depuis un moment (`revealed` : il vient de le faire).
 * `near` : en deçà, le buisson ne cache rien (plus loin pour Nico, que Boulon renseigne).
 */
export function arenaHidden(zone, p, viewer, revealed, near = ARENA_RULES.bush.near) {
  return !revealed && inBush(zone, p) && Math.hypot(p.x - viewer.x, p.z - viewer.z) > Math.max(near, ARENA_RULES.bush.near)
}

/** D'aussi près, `viewer` voit qui se cache dans un buisson : de tout près, ou plus loin s'il est Nico. */
export function bushSight(character) {
  return ARENA_CHARACTERS[character]?.scan ?? ARENA_RULES.bush.near
}

/**
 * Dégâts d'une explosion de l'arme `w` à la distance `d` de son centre : pleins au centre, un tiers
 * au bord du rayon (plus le corps), rien au-delà.
 */
export function blastDamage(w, d) {
  const reach = w.blast + ARENA_RULES.body.r
  return d > reach ? 0 : Math.round(w.damage * (1 - (2 / 3) * (d / reach)))
}

/**
 * Le tir rapide (cf. ARENA_RULES.assist) : le cap visé `yaw` (radians) et, pour un lancer, sa
 * distance `dist`, écartés au hasard (la somme de deux tirages, comme l'écart de visée des bots).
 */
export function assistAim(yaw, dist, random = Math.random) {
  const spread = ARENA_RULES.assist
  return {
    yaw: yaw + (random() + random() - 1) * spread * (Math.PI / 180),
    dist: dist * (1 + (random() + random() - 1) * spread * 0.02),
  }
}

/**
 * Où retombe un objet lancé de `from` dans la direction `dir` (au sol, longueur 1), à `dist` tuiles
 * (bornées à la portée `range`) : au point visé, ou, s'il est sur un obstacle ou hors de l'arène, à
 * la dernière tuile libre en deçà, sur la même ligne.
 */
export function lobTarget(zone, from, dir, dist, range) {
  const free = (x, z) => {
    const tx = Math.round(x), tz = Math.round(z)
    return tx >= 0 && tz >= 0 && tx < zone.width && tz < zone.height && !zone.blocked[tz * zone.width + tx]
  }
  let d = Math.min(range, Math.max(0, dist))
  while (d > 0 && !free(from.x + dir.x * d, from.z + dir.z * d)) d = Math.max(0, d - 0.1)
  const round = (v) => Math.round(v * 100) / 100
  return { x: round(from.x + dir.x * d), z: round(from.z + dir.z * d) }
}

/** Durée de vol d'un objet lancé à `dist` tuiles par l'arme `w` (s). */
export function lobTime(w, dist) {
  return Math.max(ARENA_RULES.lob, dist / w.speed)
}

/** D'aussi loin du tireur, au plus, part un projectile (tuiles) : sa main, un peu devant lui. */
export const MUZZLE_SLACK = 1.2

/**
 * D'où part vraiment un tir qu'on voudrait faire partir de `want` (la main du tireur, un peu devant
 * lui) : de là, s'il est sur le sol de l'arène, à moins de MUZZLE_SLACK des pieds du tireur
 * (`foot`) et sans obstacle entre eux ; sinon, de ses pieds (le tireur colle à un conteneur, et sa
 * main passerait de l'autre côté). Le relais tranche ainsi, et le client de même pour son cône et
 * son tir : ce que le cône montre est ce que le relais fera voler.
 * @returns un point au sol (x, z)
 */
export function shotOrigin(zone, foot, want) {
  const x = Math.round(want.x), z = Math.round(want.z)
  const free = x >= 0 && z >= 0 && x < zone.width && z < zone.height && !zone.blocked[z * zone.width + x]
  if (free && Math.hypot(want.x - foot.x, want.z - foot.z) <= MUZZLE_SLACK && arenaSight(zone, foot, want)) return { x: want.x, z: want.z }
  return { x: foot.x, z: foot.z }
}

/**
 * Premier obstacle sur la demi-droite p + t·d (d de longueur 1), à moins de `max` : un combattant
 * (`body` : son identifiant), sinon une cloison, un conteneur, le sol ou le plafond (`normal`).
 * Sans rien sur le trajet : t vaut `max`, sans `body` ni `normal`. `wall` : c'est une cloison (son
 * parement est en retrait de la tuile, cf. le client), pas un conteneur.
 * @param {{ x: number, y: number, z: number }} p
 * @param {{ x: number, y: number, z: number }} d
 * @param {Iterable<{ id: number, x: number, z: number }>} bodies combattants debout
 * @param {(id: number) => boolean} [skip] ceux que la balle ne touche pas (le tireur, son équipe)
 */
export function castArena(zone, p, d, max, bodies, skip) {
  const { width: W, height: H, blocked } = zone
  const solid = (x, z) => x < 0 || z < 0 || x >= W || z >= H || (blocked[z * W + x] === 1 && !zone.pit[z * W + x])
  if (zone.top) return castRelief(zone, p, d, max, bodies, skip, solid)
  let t = max, body = null, normal = null, wall = false

  // Le sol et le plafond.
  if (d.y < -1e-9) {
    const u = -p.y / d.y
    if (u >= 0 && u < t) { t = u; normal = [0, 1, 0] }
  } else if (d.y > 1e-9) {
    const u = (ARENA_RULES.ceiling - p.y) / d.y
    if (u >= 0 && u < t) { t = u; normal = [0, -1, 0] }
  }

  // Les tuiles traversées, l'une après l'autre : la première qui est pleine arrête la balle.
  let x = Math.round(p.x), z = Math.round(p.z)
  if (solid(x, z)) return { t: 0, body: null, normal: [-d.x, 0, -d.z], wall: false }
  const sx = Math.sign(d.x), sz = Math.sign(d.z)
  let nextX = sx ? (x + sx * 0.5 - p.x) / d.x : Infinity
  let nextZ = sz ? (z + sz * 0.5 - p.z) / d.z : Infinity
  const stepX = sx ? 1 / Math.abs(d.x) : Infinity, stepZ = sz ? 1 / Math.abs(d.z) : Infinity
  for (let guard = 0; guard < 128; guard++) {
    const u = Math.min(nextX, nextZ)
    if (u >= t) break
    const alongX = nextX < nextZ
    if (alongX) { x += sx; nextX += stepX } else { z += sz; nextZ += stepZ }
    if (solid(x, z)) {
      t = Math.max(0, u)
      normal = alongX ? [-sx, 0, 0] : [0, 0, -sz]
      wall = x < 0 || z < 0 || x >= W || z >= H || zone.room[z * W + x] === ' '
      break
    }
  }

  // Les combattants : un cylindre posé au sol.
  const { r, h } = ARENA_RULES.body
  const flat = d.x * d.x + d.z * d.z
  if (flat > 1e-9) {
    for (const b of bodies) {
      if (skip?.(b.id)) continue
      const ox = p.x - b.x, oz = p.z - b.z
      const half = (ox * d.x + oz * d.z) / flat
      const disc = half * half - (ox * ox + oz * oz - r * r) / flat
      if (disc < 0) continue
      const root = Math.sqrt(disc)
      // Parti de l'intérieur du cylindre : touché d'emblée.
      const u = -half - root < 0 && -half + root >= 0 ? 0 : -half - root
      if (u < 0 || u >= t) continue
      const y = p.y + d.y * u
      if (y < 0 || y > h) continue
      t = u
      body = b.id
      normal = null
      wall = false
    }
  }
  return { t, body, normal, wall }
}

/**
 * castArena sur un plan à deux hauteurs : chaque tuile a son sol (le haut, une rampe qui monte, le
 * sol d'en bas). La balle s'arrête sur le flanc d'une falaise si elle y arrive plus bas que son
 * bord, sur le sol d'une tuile si elle y plonge ; un combattant se tient sur le sol de sa tuile.
 * Tirée d'en bas, elle ne survole pas le haut pour redescendre de l'autre côté : elle s'arrête à
 * son bord (en vue subjective, l'œil est plus haut que le rebord ; aucune vue ne doit voir ni
 * toucher plus loin qu'une autre).
 */
function castRelief(zone, p, d, max, bodies, skip, solid) {
  const { width: W, height: H } = zone
  let t = max, body = null, normal = null, wall = false
  if (d.y > 1e-9) {
    const u = (ARENA_RULES.ceiling - p.y) / d.y
    if (u >= 0 && u < t) { t = u; normal = [0, -1, 0] }
  }
  const at = (u) => ({ x: p.x + d.x * u, z: p.z + d.z * u })
  // Sous le sol de sa propre tuile : arrêtée d'emblée.
  let x = Math.round(p.x), z = Math.round(p.z)
  if (solid(x, z) || p.y < arenaGround(zone, p) - 1e-6) return { t: 0, body: null, normal: solid(x, z) ? [-d.x, 0, -d.z] : [0, 1, 0], wall: false }
  const sx = Math.sign(d.x), sz = Math.sign(d.z)
  let nextX = sx ? (x + sx * 0.5 - p.x) / d.x : Infinity
  let nextZ = sz ? (z + sz * 0.5 - p.z) / d.z : Infinity
  const stepX = sx ? 1 / Math.abs(d.x) : Infinity, stepZ = sz ? 1 / Math.abs(d.z) : Infinity
  let from = 0
  const low = arenaGround(zone, p) < zone.top - 1e-6
  for (let guard = 0; guard < 128; guard++) {
    const u = Math.min(nextX, nextZ, t)
    // Dans la tuile (x, z), de `from` à `u` : la balle y plonge-t-elle sous le sol ? (la différence
    // de hauteur entre elle et le sol est affine le long du trajet, même sur une rampe).
    const g0 = p.y + d.y * from - arenaGround(zone, at(from + 1e-6))
    const g1 = p.y + d.y * u - arenaGround(zone, at(u - 1e-6))
    if (g1 < 0 && g0 >= 0) {
      const hit = from + (u - from) * (g0 / (g0 - g1))
      if (hit < t) { t = hit; normal = [0, 1, 0]; wall = false }
      break
    }
    if (u >= t) break
    const alongX = nextX < nextZ
    const over = low && zone.elev[z * W + x] >= zone.top - 1e-6 && zone.stairs[z * W + x] < 0
    if (alongX) { x += sx; nextX += stepX } else { z += sz; nextZ += stepZ }
    from = u
    const edge = alongX ? [-sx, 0, 0] : [0, 0, -sz]
    // Tirée d'en bas, au bout du haut qu'elle survole (vers un sol plus bas, une rampe, un gouffre) :
    // elle s'arrête sur son rebord.
    if (over && !solid(x, z) && (zone.stairs[z * W + x] >= 0 || arenaGround(zone, at(u + 1e-6)) < zone.top - 1e-6)) {
      t = Math.max(0, u)
      normal = [-edge[0], 0, -edge[2]]
      wall = false
      break
    }
    if (solid(x, z)) {
      t = Math.max(0, u)
      normal = edge
      wall = x < 0 || z < 0 || x >= W || z >= H || zone.room[z * W + x] === ' '
      break
    }
    // Le flanc d'une falaise : la tuile d'à côté a son sol plus haut que la balle.
    if (p.y + d.y * u < arenaGround(zone, at(u + 1e-6)) - 1e-6) {
      t = Math.max(0, u)
      normal = edge
      wall = false
      break
    }
  }
  // Les combattants : un cylindre posé sur le sol de sa tuile.
  const { r, h } = ARENA_RULES.body
  const flat = d.x * d.x + d.z * d.z
  if (flat > 1e-9) {
    for (const b of bodies) {
      if (skip?.(b.id)) continue
      const ox = p.x - b.x, oz = p.z - b.z
      const half = (ox * d.x + oz * d.z) / flat
      const disc = half * half - (ox * ox + oz * oz - r * r) / flat
      if (disc < 0) continue
      const root = Math.sqrt(disc)
      const u = -half - root < 0 && -half + root >= 0 ? 0 : -half - root
      if (u < 0 || u >= t) continue
      const y = p.y + d.y * u, base = arenaGround(zone, b)
      if (y < base || y > base + h) continue
      t = u
      body = b.id
      normal = null
      wall = false
    }
  }
  return { t, body, normal, wall }
}

/**
 * Où revient un combattant de l'équipe `team` : celui de ses points d'apparition qui est le plus
 * loin des adversaires debout, et que personne n'occupe.
 * @param {{ x: number, z: number }[]} foes
 * @param {{ x: number, z: number }[]} mates
 */
export function arenaSpawn(zone, team, foes, mates = []) {
  let best = zone.spawns[team][0], bestScore = -Infinity
  for (const s of zone.spawns[team]) {
    let score = 100
    for (const f of foes) score = Math.min(score, Math.hypot(f.x - s.x, f.z - s.z))
    if (mates.some((m) => Math.hypot(m.x - s.x, m.z - s.z) < 0.8)) score -= 50
    if (score > bestScore) { bestScore = score; best = s }
  }
  return { x: best.x, z: best.z }
}

/** Cap d'un combattant qui vient d'apparaître : vers le milieu de l'arène. */
export function spawnYaw(zone, at) {
  return Math.atan2((zone.width - 1) / 2 - at.x, (zone.height - 1) / 2 - at.z)
}
