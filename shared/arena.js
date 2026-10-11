// L'arène : duels par équipes, à trois contre trois au plus, entre personnages jouables (des membres
// de l'équipage du vaisseau, cf. ARENA_CHARACTERS), chacun avec son arme et sa façon de jouer.
// Règles communes au relais, qui arbitre la partie (points de vie, tirs, bots, score), et au
// client, qui la dessine et y fait jouer le moteur du stand (cf. src/range.ts, src/arena/).
//
// Le terminal de l'arène est dans son propre lobby (la pièce 'y' de la cale, cf. ARENA_LOBBY), pris
// sur le coin sud-est de celui de la zone thargoïde. L'arène elle-même est une petite baie de stockage, tous projecteurs
// allumés, au plan fixe (ARENA_MAP), une base par équipe à chaque bout. Tout obstacle y occupe sa
// tuile entière, du sol au plafond : il arrête les pas, la vue et les balles, pour le relais comme
// pour le client, quelle que soit la vue. Seuls les buissons laissent tout passer : on s'y cache.
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
 * Le lobby de l'arène : la pièce 'y' de la cale (cf. shared/ship-layouts.js), au coin sud-est du
 * hall de la cale ('p'), d'où l'on vient. On garde sa place dans un lobby du terminal tant qu'on
 * reste dans l'une ou l'autre.
 */
export const ARENA_LOBBY = { level: -1, room: 'y', rooms: 'yp' }
/** Où l'on revient (fin de partie, abandon) : devant le terminal. */
export const ARENA_RETURN = { x: 23.8, z: 7 }
/** Le terminal, contre la cloison ouest, près de la porte (cf. src/levels.ts). */
export const ARENA_TERMINAL = { x: 22.92, z: 7 }
/**
 * Le guichet de l'arbitre, adossé à la cloison ouest, tourné vers l'est (`yaw`) : où elle se tient
 * derrière sa vitre, et où l'on se met pour lui parler, devant le comptoir.
 */
export const ARENA_BOOTH = { x: 22.97, z: 9.3, yaw: Math.PI / 2, referee: { x: 23.05, z: 9.3 }, counter: { x: 24.25, z: 9.3 } }

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
 * - `lob` : durée de vol d'un objet lancé (graine, cocktail), au plus court (s).
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
 *     de terre (`grow`) et pendant `life` secondes ; `most` fleurs à la fois, la plus vieille fane ;
 *   - `fire` : Jacques : là où éclate son cocktail, une flaque brûle `life` secondes, et chaque
 *     adversaire qui s'y tient (à moins de `radius`) perd `damage` toutes les `every` secondes.
 */
export const ARENA_CHARACTERS = {
  rourke: {
    hp: 100, speed: 1,
    weapon: { auto: true, burst: 8, interval: 0.09, mag: 18, reload: 1.6, speed: 46, pierce: false, pellets: 1, spread: 2.4, damage: 8, range: 5.5, reach: 4, blast: 0 },
  },
  marcel: {
    hp: 170, speed: 0.78,
    weapon: { auto: false, interval: 0.55, mag: 3, reload: 1.6, speed: 11, pierce: false, pellets: 1, spread: 1, damage: 45, range: 4.5, reach: 3.2, blast: 0.85 },
  },
  nico: {
    hp: 65, speed: 1.15, scan: 3,
    weapon: { auto: false, interval: 0.85, mag: 3, reload: 1.9, speed: 80, pierce: true, pellets: 1, spread: 0, damage: 60, range: 8, reach: 6.5, blast: 0 },
  },
  betty: {
    hp: 95, speed: 1,
    weapon: { auto: false, interval: 0.38, mag: 5, reload: 1.4, speed: 26, pierce: false, pellets: 1, spread: 0.6, damage: 22, heal: 22, range: 6, reach: 4.5, blast: 0 },
  },
  capucine: {
    hp: 85, speed: 1,
    weapon: {
      auto: false, interval: 0.8, mag: 3, reload: 2.2, speed: 9, lob: true, pierce: false, pellets: 1, spread: 0, damage: 20, range: 6.5, reach: 4.5, blast: 0,
      flower: { life: 6, radius: 1.6, every: 0.6, grow: 0.3, most: 2 },
    },
  },
  jacques: {
    hp: 150, speed: 0.85,
    weapon: {
      auto: false, interval: 0.9, mag: 3, reload: 2.2, speed: 9, lob: true, pierce: false, pellets: 1, spread: 0, damage: 32, range: 6, reach: 4.8, blast: 0.9,
      fire: { life: 2.5, radius: 1, every: 0.4, damage: 12 },
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
 * Le plan (17 × 11), une lettre par tuile :
 *   '.'  sol          '#'  cloison (plein)
 *   '='  conteneurs couchés (par paires, de gauche à droite)
 *   'H'  conteneurs debout (par paires, de haut en bas)
 *   'c'  caisses d'armes blindées (une tuile)      'p'  pilier (une tuile)
 *   'g'  buisson : on y passe, les balles aussi, et l'on s'y cache
 *   'A', 'B'  points d'apparition de chaque équipe
 * Les obstacles et les buissons se répondent d'un bout à l'autre (un demi-tour autour du centre) :
 * aucune équipe n'a l'avantage du terrain. Trois allées : au nord, au milieu par la cour centrale
 * et ses deux buissons, au sud.
 */
export const ARENA_MAP = [
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
]

let cached = null

/**
 * L'arène, prête à l'emploi (construite une fois). Elle a la forme de la baie de la zone thargoïde
 * (cf. generateZone dans salvage.js) : `blocked`, `adj`, `walkMap`… si bien que ses fonctions de
 * chemin (findPath, smoothPath, walkable, tileOf) s'y appliquent telles quelles.
 */
export function arenaZone() {
  if (cached) return cached
  const H = ARENA_MAP.length, W = ARENA_MAP[0].length
  const N = W * H
  const idx = (x, z) => z * W + x
  const inside = (x, z) => x >= 0 && z >= 0 && x < W && z < H
  const blocked = new Uint8Array(N)
  const bush = new Uint8Array(N)
  const room = new Array(N)
  const spawns = [[], []]
  const containers = []
  const done = new Uint8Array(N)
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const c = ARENA_MAP[z][x]
      const i = idx(x, z)
      room[i] = c === '#' ? ' ' : 'a'
      if ('#=Hcp'.includes(c)) blocked[i] = 1
      if (c === 'g') bush[i] = 1
      if (c === 'A') spawns[0].push({ x, z })
      if (c === 'B') spawns[1].push({ x, z })
      if (done[i] || !'=Hcp'.includes(c)) continue
      const w = c === '=' ? 2 : 1, d = c === 'H' ? 2 : 1
      if (!inside(x + w - 1, z + d - 1) || ARENA_MAP[z + d - 1][x + w - 1] !== c) throw new Error(`Conteneur sans sa moitié en (${x}, ${z})`)
      for (let tz = z; tz < z + d; tz++) for (let tx = x; tx < x + w; tx++) done[idx(tx, tz)] = 1
      containers.push({ x, z, w, d, kind: c === 'c' ? 'crates' : c === 'p' ? 'pillar' : 'container', color: (x * 7 + z * 13) % 3, flip: (x + z) % 2 === 1 })
    }
  }
  // Graphe des tuiles libres (4 directions ; -1 : cloison, bord, obstacle).
  const adj = new Int32Array(N * 4).fill(-1)
  const open = new Uint8Array(N * 4)
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const i = idx(x, z)
      for (let dir = 0; dir < 4; dir++) {
        const nx = x + DIRS[dir].dx, nz = z + DIRS[dir].dz
        if (!inside(nx, nz) || room[i] === ' ' || room[idx(nx, nz)] === ' ') continue
        open[i * 4 + dir] = 1
        if (!blocked[i] && !blocked[idx(nx, nz)]) adj[i * 4 + dir] = idx(nx, nz)
      }
    }
  }
  const free = (x, z) => inside(x, z) && !blocked[idx(x, z)]
  // Plan de vue, de marche et de tir : le même, tout obstacle y arrête tout.
  const map = {
    isFloor: free,
    room: (x, z) => (inside(x, z) ? room[idx(x, z)] : null),
    edge: (x, z, dir) => (free(x, z) && free(x + DIRS[dir].dx, z + DIRS[dir].dz) ? 'open' : 'wall'),
  }
  cached = {
    width: W, height: H, blocked, bush, room, open, adj, spawns, containers,
    layout: ARENA_MAP.map((line) => line.replace(/#/g, ' ').replace(/[^ ]/g, 'a')),
    stairs: new Int8Array(N).fill(-1), elev: new Float32Array(N),
    walkMap: map, sightMap: map,
  }
  return cached
}

/** Rien ne sépare `from` de `to` dans l'arène (ni cloison, ni conteneur). */
export function arenaSight(zone, from, to) {
  return lineOfSight(zone.sightMap, from, to)
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
  const solid = (x, z) => x < 0 || z < 0 || x >= W || z >= H || blocked[z * W + x] === 1
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
