// Récupération de cargaison en zone thargoïde (SOC-06) : règles communes au relais, qui arbitre
// la partie (ennemis, colis, casiers, fusées, captures), et au client, qui la dessine.
//
// La baie infestée a un plan fixe (BAY) ; la graine que le relais tire au lancement y dispose les
// colis, les fusées, les ennemis et le décor, et chacun en construit exactement la même
// (générateur pseudo-aléatoire, entiers seulement). Une lettre par tuile, comme les ponts (cf.
// ship-map.js) : 'z' la baie, 'x' le sas d'extraction ; les conteneurs bloquent des tuiles
// entières (`blocked`), la vue comme le passage.

import { DIRS, ShipMap } from './ship-map.js'
import { lineOfSight } from './sight.js'

/** « Pont » de la baie infestée : sous la cale, hors du vaisseau (cf. LEVEL_HEIGHT côté client). */
export const ZONE_LEVEL = -2
/** Le lobby : le sas de la cale, pièce 'h' du pont -1 (cf. shared/ship-layouts.js). */
export const LOBBY = { level: -1, room: 'h' }
/** Où l'on revient dans le lobby (fin de partie, capture, abandon) : devant la porte blindée. */
export const LOBBY_RETURN = { x: 24.2, z: 2.7 }

/**
 * Chiffres de la partie (tuiles et secondes). Le mode léger n'y change rien : même vue, même bruit.
 * - vitesses du joueur (celles de src/player.ts) et ralentissement du porteur ;
 * - vue : rayon autour du joueur (il ne grandit pas avec le zoom), réduit dans un casier ;
 * - endurance : dépense en courant (plus en portant), récupération en marchant ou à l'arrêt,
 *   seuil à retrouver après l'épuisement ;
 * - bruit : portée d'écoute des ennemis (en chemin dans le labyrinthe) ;
 * - casiers, fusées d'appel, ennemis (vitesses, vue, cône, portée de capture, mémoire).
 */
export const RULES = {
  team: 4,
  parcels: { min: 1, max: 6 },
  enemies: { min: 1, max: 6 },
  walk: 1.7,
  sprint: 3.4,
  carry: 0.62,
  vision: 5.2,
  /** Caché : on voit dehors par les fentes du casier, un peu moins loin. */
  hiddenVision: 4.2,
  stamina: { drain: 0.13, carryDrain: 0.2, walkRegen: 0.15, idleRegen: 0.3, recover: 0.25 },
  noise: { sprint: 6, carrySprint: 7, locker: 3, drop: 5, eject: 4.5 },
  locker: { max: 30, cooldown: 4, enter: 0.55 },
  flare: { carry: 2, burn: 15, radius: 12, range: 6.5 },
  monster: {
    patrol: 0.8, investigate: 1.2, chase: 2.0, lured: 1.6,
    sight: 4.2, fov: 0.5, sense: 1.1, touch: 0.45, memory: 2.5, attack: 1.6, search: 2.2, look: 3,
  },
  /** Portée pour ramasser un colis ou une fusée, se cacher dans un casier. */
  reach: 1.15,
  /** Au départ, personne n'est capturé tout de suite (le temps d'arriver et de se repérer). */
  grace: 8,
  /** Au-delà, la mission est annulée (partie oubliée, équipe coincée). */
  maxDuration: 1800,
  /** Une équipe se lance quelques secondes après que tous ses membres sont prêts. */
  countdown: 3,
  /** Après une déconnexion, la place d'un joueur en course l'attend ce temps-là (s). */
  reconnect: 60,
}

/** Récompense par membre d'une équipe victorieuse (cf. `salvage` dans economy.json, relu par le site). */
export function salvageReward(economy, parcels, enemies) {
  const e = economy ?? { parcel: 1500, enemyBonus: 0.5 }
  return Math.round((e.parcel * parcels * (1 + e.enemyBonus * (enemies - 1))) / 100) * 100
}

/** Générateur pseudo-aléatoire (mulberry32) : même graine, même suite, dans Node comme dans le navigateur. */
export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const int = (random, lo, hi) => lo + Math.floor(random() * (hi - lo + 1))
function shuffle(list, random) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

/**
 * Plan de la baie, le même à chaque mission : trois bandes de halls séparées par des cloisons
 * percées de passages de deux tuiles ; au milieu, un grand hall dégagé semé d'îlots de
 * conteneurs ; le sas d'extraction au milieu du bord sud. Une lettre par tuile (colonne = x,
 * ligne = z) :
 *   '.'  sol de la baie        'x'  sas d'extraction
 *   '#'  cloison (plein : ni sol, ni passage, ni vue)
 *   'L'  sol, avec un casier contre la paroi ou le conteneur voisin
 *   '='  conteneur couché (par paires, de gauche à droite)
 *   'H'  conteneur debout (par paires, de haut en bas)
 *   'c'  pile de caisses (une tuile)
 */
export const BAY = [
  '...L....L.#..L..L..#..L....L..',
  '..........#........#..........',
  '......c.......H...............',
  '...==.........H.........==...L',
  'L.........#....c...#..c.......',
  '..........#........#..........',
  '.......L..#.L....L.#.L........',
  '####..########..########..####',
  '..L...............L...........',
  '............H.................',
  'L....==L....Hc.........LH.....',
  '.....c............c.....Hc....',
  '.................==L.........L',
  '..............................',
  '...........L...............L..',
  '####..########..########..####',
  '......L...#L......L#...L......',
  '..........#........#..........',
  '............c....c............',
  'L..==...................==...L',
  '......c...#........#..c.......',
  '..........#........#..........',
  '..........#...xxx..#..........',
  '...L....L.#L..xxx.L#..L....L..',
]
/** Le sas : adossé au bord sud (2), ouvert vers le nord (0) par deux portes, la plateforme au fond. */
const BAY_AIRLOCK = { side: 2, inward: 0, pad: { x: 15, z: 23 }, doors: [{ x: 14, z: 22, dir: 0 }, { x: 16, z: 22, dir: 0 }] }

/**
 * La baie d'une mission : le plan fixe (BAY), et ce que la graine y dispose (colis, fusées,
 * ennemis, décor), différent à chaque partie.
 * @param {number} seed graine choisie par le relais
 * @param {{ team: number, parcels: number, enemies: number }} settings
 */
export function generateZone(seed, settings) {
  const random = mulberry32(seed)
  const team = clampInt(settings.team, 1, RULES.team)
  const parcels = clampInt(settings.parcels, RULES.parcels.min, RULES.parcels.max)
  const enemies = clampInt(settings.enemies, RULES.enemies.min, RULES.enemies.max)
  const H = BAY.length, W = BAY[0].length
  const N = W * H
  const idx = (x, z) => z * W + x
  const inside = (x, z) => x >= 0 && z >= 0 && x < W && z < H
  const cell = (x, z) => (inside(x, z) ? BAY[z][x] : '#')
  const room = new Array(N)
  const blocked = new Uint8Array(N)
  const hall = new Int16Array(N)
  const open = new Uint8Array(N * 4)
  const airlock = []
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const c = cell(x, z)
      room[idx(x, z)] = c === 'x' ? 'x' : c === '#' ? ' ' : 'z'
      if (c === 'x') airlock.push({ x, z })
      if (c === '=' || c === 'H' || c === 'c' || c === '#') blocked[idx(x, z)] = 1
    }
  }
  // Sol d'un seul tenant dans une même pièce ; le sas ne s'ouvre que par ses portes.
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      for (let dir = 0; dir < 4; dir++) {
        const nx = x + DIRS[dir].dx, nz = z + DIRS[dir].dz
        if (inside(nx, nz) && room[idx(x, z)] !== ' ' && room[idx(x, z)] === room[idx(nx, nz)]) open[idx(x, z) * 4 + dir] = 1
      }
    }
  }
  const doors = BAY_AIRLOCK.doors.map((d) => ({ ...d }))
  for (const d of doors) {
    open[idx(d.x, d.z) * 4 + d.dir] = 1
    open[idx(d.x + DIRS[d.dir].dx, d.z + DIRS[d.dir].dz) * 4 + ((d.dir + 2) % 4)] = 1
  }
  const isOpen = (x, z, dir) => open[idx(x, z) * 4 + dir] === 1

  // Conteneurs : les paires de '=' (couchés) et de 'H' (debout), les piles de caisses. Couleurs
  // tirées de la position : la baie a toujours la même allure.
  const containers = []
  const done = new Uint8Array(N)
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const c = cell(x, z)
      if (done[idx(x, z)] || (c !== '=' && c !== 'H' && c !== 'c')) continue
      const w = c === '=' ? 2 : 1, d = c === 'H' ? 2 : 1
      for (let tz = z; tz < z + d; tz++) for (let tx = x; tx < x + w; tx++) done[idx(tx, tz)] = 1
      const tint = (x * 7 + z * 13) % 3
      containers.push({ x, z, w, d, kind: c === 'c' ? 'crates' : 'container', color: tint, flip: (x + z) % 2 === 1 })
    }
  }

  const layout = BAY.map((line) => line.replace(/#/g, ' ').replace(/[^x ]/g, 'z'))
  const zone = {
    seed, width: W, height: H, team, parcels, enemies,
    layout, walls: [], doors,
    airlock: { side: BAY_AIRLOCK.side, tiles: airlock, pad: { ...BAY_AIRLOCK.pad }, inward: BAY_AIRLOCK.inward },
    halls: [], containers, blocked, open, room, hall,
    lockers: [], flares: [], cargo: [], monsters: [], decor: [],
  }
  buildGraph(zone)

  // Casiers : ceux du plan, adossés de préférence à la paroi de la baie, sinon au conteneur voisin.
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      if (cell(x, z) !== 'L') continue
      const against = [0, 1, 2, 3].filter((dir) => !inside(x + DIRS[dir].dx, z + DIRS[dir].dz) || !isOpen(x, z, dir))
      const behind = against.length ? against : [0, 1, 2, 3].filter((dir) => blocked[idx(x + DIRS[dir].dx, z + DIRS[dir].dz)])
      zone.lockers.push({ id: zone.lockers.length, x, z, dir: behind[0] })
    }
  }

  const fromAirlock = distances(zone, zone.doors.map((d) => ({ x: d.x + DIRS[d.dir].dx, z: d.z + DIRS[d.dir].dz })))
  const dist = (t) => fromAirlock[idx(t.x, t.z)]
  const taken = new Set(zone.lockers.map((l) => `${l.x},${l.z}`))
  const key = (t) => `${t.x},${t.z}`
  const nearDoor = (t) => zone.doors.some((d) => Math.abs(t.x - d.x - DIRS[d.dir].dx) + Math.abs(t.z - d.z - DIRS[d.dir].dz) <= 1)
  const free = (t) => room[idx(t.x, t.z)] === 'z' && !blocked[idx(t.x, t.z)] && !taken.has(key(t)) && !nearDoor(t)
  const tiles = (keep) => {
    const out = []
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (free({ x, z }) && keep({ x, z })) out.push({ x, z })
    return out
  }
  // Un coin à l'abri : au moins deux côtés fermés (paroi, conteneur), pas au milieu d'un passage.
  const sheltered = (t) => [0, 1, 2, 3].filter((dir) => !walkable(zone, t.x + DIRS[dir].dx, t.z + DIRS[dir].dz)).length >= 2

  // Colis : loin du sas (le retour est le plus risqué), à l'abri contre une paroi, écartés.
  const far = Math.max(...Array.from(fromAirlock).filter((d) => d >= 0))
  let cargoSpots = tiles((t) => dist(t) >= far * 0.45 && sheltered(t))
  if (cargoSpots.length < parcels) cargoSpots = tiles((t) => dist(t) >= 4)
  for (const t of spread(cargoSpots, parcels, [BAY_AIRLOCK.pad], random)) {
    zone.cargo.push({ id: zone.cargo.length, x: t.x, z: t.z })
    taken.add(key(t))
  }

  // Fusées d'appel : réparties dans toute la baie.
  for (const t of spread(tiles(() => true), 3 + team + Math.floor(parcels / 2), [BAY_AIRLOCK.pad, ...zone.cargo], random)) {
    zone.flares.push({ id: zone.flares.length, x: t.x, z: t.z })
    taken.add(key(t))
  }

  // Ennemis : loin du sas, répartis.
  for (const t of spread(tiles((t) => dist(t) >= 9), enemies, [BAY_AIRLOCK.pad], random)) zone.monsters.push({ id: zone.monsters.length, x: t.x, z: t.z })

  // Décor : câbles, ossements, cristaux thargoïdes, fûts renversés, flaques ; jamais sur un passage.
  const kinds = ['cables', 'bones', 'crystals', 'barrel', 'goo', 'debris']
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      if (room[idx(x, z)] !== 'z' || blocked[idx(x, z)] || taken.has(key({ x, z })) || nearDoor({ x, z }) || random() > 0.14) continue
      const walled = [0, 1, 2, 3].filter((dir) => !walkable(zone, x + DIRS[dir].dx, z + DIRS[dir].dz))
      const kind = kinds[Math.floor(random() * kinds.length)]
      // Contre une paroi ou un conteneur quand il y en a un : on passe au milieu.
      const dir = walled.length ? walled[Math.floor(random() * walled.length)] : -1
      const lateral = (random() - 0.5) * 0.4
      const px = dir < 0 ? x + (random() - 0.5) * 0.3 : x + DIRS[dir].dx * 0.26 + (DIRS[dir].dz ? lateral : 0)
      const pz = dir < 0 ? z + (random() - 0.5) * 0.3 : z + DIRS[dir].dz * 0.26 + (DIRS[dir].dx ? lateral : 0)
      zone.decor.push({ kind, x: round3(px), z: round3(pz), rot: int(random, 0, 3), wall: dir })
    }
  }
  return zone
}

const round3 = (v) => Math.round(v * 1000) / 1000
function clampInt(v, lo, hi) {
  const n = Number.isInteger(v) ? v : lo
  return Math.min(hi, Math.max(lo, n))
}

/**
 * Choisit `count` tuiles parmi `spots`, aussi loin que possible les unes des autres et des
 * points `away` (tirage du plus éloigné, avec un peu de hasard).
 */
function spread(spots, count, away, random) {
  const chosen = []
  const pool = [...spots]
  while (chosen.length < count && pool.length) {
    let best = -1, bestScore = -Infinity
    for (let i = 0; i < pool.length; i++) {
      const t = pool[i]
      let d = Infinity
      for (const o of [...away, ...chosen]) d = Math.min(d, Math.abs(t.x - o.x) + Math.abs(t.z - o.z))
      const score = (d === Infinity ? 100 : d) + random() * 3
      if (score > bestScore) {
        bestScore = score
        best = i
      }
    }
    chosen.push(pool[best])
    pool.splice(best, 1)
  }
  return chosen
}

/**
 * Graphe de la baie : voisins accessibles de chaque tuile (4 directions ; -1 : mur, bord,
 * conteneur), pour les joueurs et pour les ennemis (qui n'entrent pas dans le sas).
 */
function buildGraph(zone) {
  const { width: W, height: H } = zone
  const N = W * H
  zone.adj = new Int32Array(N * 4).fill(-1)
  zone.monsterAdj = new Int32Array(N * 4).fill(-1)
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const i = z * W + x
      if (zone.blocked[i]) continue
      for (let dir = 0; dir < 4; dir++) {
        if (!zone.open[i * 4 + dir]) continue
        const j = (z + DIRS[dir].dz) * W + x + DIRS[dir].dx
        if (zone.blocked[j]) continue
        zone.adj[i * 4 + dir] = j
        if (zone.room[i] === 'z' && zone.room[j] === 'z') zone.monsterAdj[i * 4 + dir] = j
      }
    }
  }
  zone.map = new ShipMap(zone.layout, { walls: zone.walls, doors: zone.doors })
  // Plan « de vue » : un conteneur arrête le regard comme un mur (il se voit, pas ce qu'il cache).
  // Lu dans les tableaux de la baie (des milliers de rayons à chaque image pour la vue du joueur) ;
  // une porte du sas y est un passage ouvert.
  zone.sightMap = {
    isFloor: (x, z) => x >= 0 && z >= 0 && x < W && z < H && !zone.blocked[z * W + x],
    room: (x, z) => (x >= 0 && z >= 0 && x < W && z < H ? zone.room[z * W + x] : null),
    edge: (x, z, dir) => {
      if (x < 0 || z < 0 || x >= W || z >= H) return 'wall'
      const i = z * W + x
      return zone.adj[i * 4 + dir] >= 0 ? 'open' : 'wall'
    },
  }
}

/** Tuile (x, z) de la baie : null hors du plan. */
export function tileOf(zone, p) {
  const x = Math.round(p.x), z = Math.round(p.z)
  return x >= 0 && z >= 0 && x < zone.width && z < zone.height ? { x, z } : null
}

/** On peut s'y tenir : sol de la baie ou du sas, sans conteneur. */
export function walkable(zone, x, z) {
  return x >= 0 && z >= 0 && x < zone.width && z < zone.height && !zone.blocked[z * zone.width + x]
}

/** Dans le sas d'extraction (la zone sûre) ? */
export function inAirlock(zone, p) {
  const t = tileOf(zone, p)
  return !!t && zone.room[t.z * zone.width + t.x] === 'x'
}

/**
 * Distances (en tuiles de chemin) depuis `sources` ; -1 : inaccessible.
 * @param {{ monster?: boolean, max?: number }} [options] monster : sans entrer dans le sas
 */
export function distances(zone, sources, options = {}) {
  const adj = options.monster ? zone.monsterAdj : zone.adj
  const max = options.max ?? Infinity
  const out = new Int16Array(zone.width * zone.height).fill(-1)
  const queue = []
  for (const s of sources) {
    const t = tileOf(zone, s)
    if (!t) continue
    const i = t.z * zone.width + t.x
    if (out[i] >= 0) continue
    out[i] = 0
    queue.push(i)
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]
    if (out[i] >= max) continue
    for (let dir = 0; dir < 4; dir++) {
      const j = adj[i * 4 + dir]
      if (j < 0 || out[j] >= 0) continue
      out[j] = out[i] + 1
      queue.push(j)
    }
  }
  return out
}

/**
 * Chemin de tuiles de `from` à `to` (inclus), le plus court ; null s'il n'y en a pas.
 * @param {{ monster?: boolean }} [options]
 */
export function findPath(zone, from, to, options = {}) {
  const a = tileOf(zone, from), b = tileOf(zone, to)
  if (!a || !b) return null
  const W = zone.width
  const adj = options.monster ? zone.monsterAdj : zone.adj
  const start = a.z * W + a.x, goal = b.z * W + b.x
  if (zone.blocked[goal]) return null
  const came = new Int32Array(W * zone.height).fill(-1)
  came[start] = start
  const queue = [start]
  for (let head = 0; head < queue.length && came[goal] < 0; head++) {
    const i = queue[head]
    for (let dir = 0; dir < 4; dir++) {
      const j = adj[i * 4 + dir]
      if (j < 0 || came[j] >= 0) continue
      came[j] = i
      queue.push(j)
    }
  }
  if (came[goal] < 0) return null
  const path = []
  for (let i = goal; ; i = came[i]) {
    path.push({ x: i % W, z: Math.floor(i / W) })
    if (i === start) break
  }
  return path.reverse()
}

/** Rien ne sépare `from` de `to` : ni mur, ni conteneur (un conteneur visé se voit lui-même). */
export function zoneSight(zone, from, to) {
  return lineOfSight(zone.sightMap, from, to)
}

/**
 * Ligne droite praticable (pour lisser un chemin) : la vue passe au centre et de part et d'autre,
 * à la largeur d'un marcheur.
 */
export function straightWalk(zone, from, to, radius = 0.2) {
  const dx = to.x - from.x, dz = to.z - from.z
  const len = Math.hypot(dx, dz)
  if (len < 1e-6) return true
  const ox = (-dz / len) * radius, oz = (dx / len) * radius
  for (const k of [0, 1, -1]) {
    const a = { x: from.x + ox * k, z: from.z + oz * k }, b = { x: to.x + ox * k, z: to.z + oz * k }
    if (!walkable(zone, Math.round(a.x), Math.round(a.z)) || !walkable(zone, Math.round(b.x), Math.round(b.z))) return false
    if (!lineOfSight(zone.sightMap, a, b)) return false
  }
  return true
}

/** Raccourcit un chemin de tuiles : on file tout droit tant que c'est praticable. */
export function smoothPath(zone, from, tiles) {
  const out = []
  let at = from
  let i = 0
  while (i < tiles.length) {
    let j = tiles.length - 1
    while (j > i && !straightWalk(zone, at, tiles[j])) j--
    out.push(tiles[j])
    at = tiles[j]
    i = j + 1
  }
  return out
}

/**
 * Où les joueurs apparaissent : des tuiles au hasard, loin des ennemis (en chemin), hors du sas et
 * écartées les unes des autres.
 */
export function pickSpawns(zone, count, monsters, random) {
  const fromMonsters = distances(zone, monsters)
  const W = zone.width
  const lockerTiles = new Set(zone.lockers.map((l) => `${l.x},${l.z}`))
  let min = 8
  let spots = []
  while (min >= 3) {
    spots = []
    for (let z = 0; z < zone.height; z++) {
      for (let x = 0; x < W; x++) {
        const i = z * W + x
        if (zone.room[i] !== 'z' || zone.blocked[i] || lockerTiles.has(`${x},${z}`)) continue
        if (fromMonsters[i] >= 0 && fromMonsters[i] < min) continue
        spots.push({ x, z })
      }
    }
    if (spots.length >= count) break
    min--
  }
  const chosen = []
  for (const t of shuffle(spots, random)) {
    if (chosen.length >= count) break
    if (chosen.every((o) => Math.abs(o.x - t.x) + Math.abs(o.z - t.z) >= 3)) chosen.push(t)
  }
  while (chosen.length < count && spots.length) chosen.push(spots[chosen.length % spots.length])
  return chosen
}

/** Place d'un casier : au fond de sa tuile, contre son mur ; on s'y cache en son centre. */
export function lockerSpot(locker) {
  return { x: locker.x + DIRS[locker.dir].dx * 0.2, z: locker.z + DIRS[locker.dir].dz * 0.2 }
}

/** Devant le casier, où l'on en sort (et d'où un ennemi le fouille). */
export function lockerFront(locker) {
  return { x: locker.x - DIRS[locker.dir].dx * 0.12, z: locker.z - DIRS[locker.dir].dz * 0.12 }
}
