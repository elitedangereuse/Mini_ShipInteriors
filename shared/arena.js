// L'arène : duels par équipes, à trois contre trois au plus, avec les armes du stand de tir.
// Règles communes au relais, qui arbitre la partie (points de vie, tirs, bots, score), et au
// client, qui la dessine et y fait jouer le moteur du stand (cf. src/range.ts, src/arena/).
//
// Le terminal de l'arène est dans le lobby de la zone thargoïde (la pièce 'h' de la cale, cf.
// LOBBY dans salvage.js), au sud-est. L'arène elle-même est une baie de stockage comme celle de
// la zone, en petit et tous projecteurs allumés : un plan fixe (ARENA_MAP), symétrique, une base
// par équipe à chaque bout. Tout obstacle y occupe sa tuile entière, du sol au plafond : il
// arrête les pas, la vue et les balles, pour le relais comme pour le client.

import { DIRS } from './ship-map.js'
import { lineOfSight } from './sight.js'
import { WEAPON_STATS } from './weapons.js'

/** « Pont » de l'arène : hors du vaisseau, sous les autres (baie infestée -2, conduits -3, simulateur -4). */
export const ARENA_LEVEL = -5
/** Où l'on revient dans le lobby (fin de partie, abandon) : devant le terminal de l'arène. */
export const ARENA_RETURN = { x: 24.4, z: 7.7 }
/** Le terminal, dans le coin sud-est du lobby, contre le mur du hangar (cf. src/levels.ts). */
export const ARENA_TERMINAL = { x: 25.1, z: 7.7 }

/**
 * Chiffres de la partie (tuiles et secondes).
 * - `team` : joueurs par équipe, au plus ; `goal` : éliminations à atteindre, par joueur d'une équipe ;
 * - `duration` : au bout du temps, l'équipe en tête gagne ; `warmup` : avant le coup d'envoi, on
 *   se place, personne ne tire ;
 * - `respawn` : délai avant de revenir à sa base ; `shield` : invulnérable ensuite, tant qu'on ne tire pas ;
 * - `regenAfter`, `regen` : sans dégât depuis ce délai, les points de vie remontent (par seconde) ;
 * - `body` : ce qu'une balle touche d'un combattant (un cylindre posé au sol) ; `aim` : la hauteur
 *   d'où part un tir à plat (vue de dessus, bots) ; `ceiling` : le plafond ;
 * - `sprint` : la vitesse d'un joueur à la course (celle de src/player.ts) ; `bot` : celle d'un bot ;
 * - `self` : part des dégâts de sa propre explosion qu'on encaisse.
 */
export const ARENA_RULES = {
  team: 3,
  hp: 100,
  goal: 10,
  duration: 300,
  countdown: 3,
  warmup: 4,
  respawn: 3,
  shield: 2,
  regenAfter: 5,
  regen: 12,
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
 * La moitié nord du plan (24 × 7) ; la moitié sud est la même, tournée d'un demi-tour : chaque
 * équipe a devant elle exactement ce que l'autre a devant elle. Une lettre par tuile :
 *   '.'  sol          '#'  cloison (plein)
 *   '='  conteneur couché (par paires, de gauche à droite)
 *   'H'  conteneur debout (par paires, de haut en bas)
 *   'c'  caisse d'armes blindée (une tuile)
 *   'A'  point d'apparition de la première équipe (ceux de la seconde, 'B', viennent du demi-tour)
 * Au milieu, les quatre conteneurs debout et les deux cloisons ferment une cour ; on la contourne
 * par l'allée nord ou l'allée sud.
 */
const HALF = [
  '....H.......==......#...',
  '.A..H...==.........H#...',
  '.A.........H.......H....',
  '......==...H...c........',
  '.A.c.......#......==....',
  '........H..#...H........',
  '..==....H......H....c...',
]
const turned = (row) => [...row].reverse().join('').replace(/A/g, 'B')
export const ARENA_MAP = [...HALF, ...HALF.map(turned).reverse()]

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
  const room = new Array(N)
  const spawns = [[], []]
  const containers = []
  const done = new Uint8Array(N)
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const c = ARENA_MAP[z][x]
      const i = idx(x, z)
      room[i] = c === '#' ? ' ' : 'a'
      if ('#=Hc'.includes(c)) blocked[i] = 1
      if (c === 'A') spawns[0].push({ x, z })
      if (c === 'B') spawns[1].push({ x, z })
      if (done[i] || !'=Hc'.includes(c)) continue
      const w = c === '=' ? 2 : 1, d = c === 'H' ? 2 : 1
      if (!inside(x + w - 1, z + d - 1) || ARENA_MAP[z + d - 1][x + w - 1] !== c) throw new Error(`Conteneur sans sa moitié en (${x}, ${z})`)
      for (let tz = z; tz < z + d; tz++) for (let tx = x; tx < x + w; tx++) done[idx(tx, tz)] = 1
      containers.push({ x, z, w, d, kind: c === 'c' ? 'crates' : 'container', color: (x * 7 + z * 13) % 3, flip: (x + z) % 2 === 1 })
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
    width: W, height: H, blocked, room, open, adj, spawns, containers,
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

/** Éliminations à atteindre pour gagner, selon la taille des équipes. */
export function arenaGoal(size) {
  return ARENA_RULES.goal * Math.max(1, size)
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
