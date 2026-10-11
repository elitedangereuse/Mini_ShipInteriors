// L'arène : duels par équipes, à trois contre trois au plus, avec les armes du stand de tir.
// Règles communes au relais, qui arbitre la partie (points de vie, tirs, bots, score), et au
// client, qui la dessine et y fait jouer le moteur du stand (cf. src/range.ts, src/arena/).
//
// Le terminal de l'arène est dans son propre lobby (la pièce 'y' de la cale, cf. ARENA_LOBBY). Le
// chef du lobby choisit le plan de la partie (ARENA_MAPS : la baie, un stade tous projecteurs
// allumés ; la ruche, une structure thargoïde), une base par équipe à chaque bout. Tout obstacle y
// occupe sa tuile entière, du sol au plafond : il arrête les pas, la vue et les balles, pour le
// relais comme pour le client, quelle que soit la vue. Seuls les buissons laissent tout passer : on s'y cache.
//
// La partie s'inspire de Brawl Stars : on voit tout ce que la caméra montre (pas de brouillard), sauf
// qui se tient dans un buisson ; les points de vie remontent vite quand on ne prend plus de balles ;
// la première équipe à la limite de points gagne la manche, et la partie se joue en deux manches gagnantes.

import { DIRS } from './ship-map.js'
import { lineOfSight } from './sight.js'
import { WEAPON_STATS } from './weapons.js'

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
 * - `regenAfter`, `regen` : sans dégât depuis ce délai, les points de vie remontent (par seconde) ;
 * - `bush` : dans un buisson, un adversaire ne nous voit que de tout près (`near`), ou pendant
 *   `reveal` secondes après qu'on a tiré ou pris une balle ;
 * - `body` : ce qu'une balle touche d'un combattant (un cylindre posé au sol) ; `aim` : la hauteur
 *   d'où part un tir à plat (vue de dessus, bots) ; `ceiling` : le plafond ;
 * - `sprint` : la vitesse d'un joueur à la course (celle de src/player.ts) ; `bot` : celle d'un bot ;
 * - `self` : part des dégâts de sa propre explosion qu'on encaisse.
 */
export const ARENA_RULES = {
  /** Lobbys du terminal : autant de parties qui peuvent se préparer (et se jouer) en même temps. */
  lobbies: 4,
  team: 3,
  hp: 100,
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
  regen: 18,
  bush: { near: 1.6, reveal: 1.2 },
  body: { r: 0.24, h: 0.75 },
  aim: 0.24,
  ceiling: 2.2,
  sprint: 3.4,
  bot: 2.5,
  self: 0.5,
}

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
 * Les plans, une lettre par tuile :
 *   ' '  hors du terrain (le vide)   '.'  sol   '#'  cloison (plein)
 *   '='  conteneurs couchés (par paires, de gauche à droite)
 *   'H'  conteneurs debout (par paires, de haut en bas)
 *   'c'  caisses d'armes blindées (une tuile)      'p'  pilier (une tuile)
 *   'o'  cosse thargoïde (une tuile)               'X'  le cœur de la ruche (un rectangle de tuiles)
 *   'g'  buisson : on y passe, les balles aussi, et l'on s'y cache
 *   'A', 'B'  points d'apparition de chaque équipe (la première à l'ouest, l'autre à l'est)
 * Sur chaque plan, obstacles et buissons se répondent d'un bout à l'autre (un demi-tour autour du
 * centre) : aucune équipe n'a l'avantage du terrain. `name` : en français, en anglais.
 *
 * - La baie (17 × 11) : le stade de CMDR Arena (cf. src/arena/venue.ts). Trois allées : au nord, au
 *   milieu par la cour centrale et ses deux buissons, au sud.
 * - La ruche (19 × 19) : une structure thargoïde, en octogone. Au milieu, la chambre du cœur, octogone
 *   elle aussi, ouverte sur ses quatre côtés droits ; de chacun de ses sommets, une nervure court
 *   jusqu'au sommet de l'enceinte, percée d'un passage, et découpe l'anneau en huit secteurs. Les
 *   bases sont les secteurs ouest et est ; des massifs de spores (buissons) et des cosses couvrent
 *   les autres (cf. src/arena/hive.ts).
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
    id: 'hive',
    name: ['La ruche', 'The hive'],
    plan: [
      '     #.......#     ',
      '    .##.....##.    ',
      '   .....ggg.....   ',
      '  ....#.....#....  ',
      ' ..gg.##.o.##.gg.. ',
      '##.....#...#.....##',
      '.#.##.##...##.##.#.',
      '.A..###g...g###..B.',
      '........XXX........',
      '.A.o....XXX....o.B.',
      '........XXX........',
      '.A..###g...g###..B.',
      '.#.##.##...##.##.#.',
      '##.....#...#.....##',
      ' ..gg.##.o.##.gg.. ',
      '  ....#.....#....  ',
      '   .....ggg.....   ',
      '    .##.....##.    ',
      '     #.......#     ',
    ],
  },
]

/** Le plan d'une partie, s'il existe (sinon le premier). */
export function arenaMap(id) {
  return ARENA_MAPS.find((m) => m.id === id) ?? ARENA_MAPS[0]
}

/** Ce qui arrête les pas, la vue et les balles ; ce qui est un obstacle posé (le reste : le vide, les cloisons). */
const SOLID = ' #=Hcpo X'
const PROPS = { '=': 'container', H: 'container', c: 'crates', p: 'pillar', o: 'pod', X: 'core' }

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
  const H = plan.length, W = plan[0].length
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
      const c = plan[z][x]
      const i = idx(x, z)
      room[i] = c === '#' || c === ' ' ? ' ' : 'a'
      if (SOLID.includes(c)) blocked[i] = 1
      if (c === 'g') bush[i] = 1
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
  const sight = {
    isFloor: free,
    room: (x, z) => (inside(x, z) ? room[idx(x, z)] : null),
    edge: (x, z, dir) => (free(x, z) && free(x + DIRS[dir].dx, z + DIRS[dir].dz) ? 'open' : 'wall'),
  }
  const zone = {
    id: map.id, plan,
    width: W, height: H, blocked, bush, room, open, adj, spawns, containers,
    layout: plan.map((line) => line.replace(/#/g, ' ').replace(/[^ ]/g, 'a')),
    stairs: new Int8Array(N).fill(-1), elev: new Float32Array(N),
    walkMap: sight, sightMap: sight,
  }
  cached.set(map.id, zone)
  return zone
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
 */
export function arenaHidden(zone, p, viewer, revealed) {
  return !revealed && inBush(zone, p) && Math.hypot(p.x - viewer.x, p.z - viewer.z) > ARENA_RULES.bush.near
}

/**
 * Dégâts d'une explosion à la distance `d` de son centre : pleins au centre, un tiers au bord du
 * rayon (plus le corps), rien au-delà.
 */
export function blastDamage(weapon, d) {
  const w = WEAPON_STATS[weapon]
  const reach = w.blast + ARENA_RULES.body.r
  return d > reach ? 0 : Math.round(w.damage * (1 - (2 / 3) * (d / reach)))
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
