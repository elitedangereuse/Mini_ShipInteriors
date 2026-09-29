// Récupération de cargaison en zone thargoïde (SOC-06) : règles communes au relais, qui arbitre
// la partie (ennemis, colis, casiers, fusées, captures), et au client, qui la dessine.
//
// La baie infestée est un labyrinthe tiré d'une graine : le relais la choisit au lancement, et
// chacun en construit exactement le même (générateur pseudo-aléatoire, entiers seulement). Une
// lettre par tuile, comme les ponts (cf. ship-map.js) : 'z' la baie, 'x' le sas d'extraction ;
// les murs du labyrinthe séparent des tuiles d'une même pièce (`walls`), les conteneurs bloquent
// des tuiles entières (`blocked`), la vue comme le passage.

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
  vision: 3.6,
  hiddenVision: 1.5,
  stamina: { drain: 0.19, carryDrain: 0.3, walkRegen: 0.1, idleRegen: 0.24, recover: 0.3 },
  noise: { sprint: 7, carrySprint: 8.5, locker: 3.5, drop: 5, eject: 4.5 },
  locker: { max: 20, cooldown: 6, enter: 0.55 },
  flare: { carry: 2, burn: 12, radius: 12, range: 5.5 },
  monster: {
    patrol: 1.0, investigate: 1.55, chase: 2.45, lured: 1.8,
    sight: 4.6, fov: 0.45, sense: 1.35, touch: 0.5, memory: 4, attack: 1.6, search: 2.2, look: 3,
  },
  /** Portée pour ramasser un colis ou une fusée, se cacher dans un casier. */
  reach: 1.15,
  /** Au départ, personne n'est capturé tout de suite (le temps d'arriver et de se repérer). */
  grace: 4,
  /** Au-delà, la mission est annulée (partie oubliée, équipe coincée). */
  maxDuration: 1800,
  /** Une équipe se lance quelques secondes après que tous ses membres sont prêts. */
  countdown: 3,
}

/** Récompense par membre d'une équipe victorieuse (cf. `salvage` dans economy.json, relu par le site). */
export function salvageReward(economy, parcels, enemies) {
  const e = economy ?? { parcel: 1500, enemyBonus: 0.5 }
  return Math.round((e.parcel * parcels * (1 + e.enemyBonus * (enemies - 1))) / 100) * 100
}

/** Taille de la baie : elle grandit avec l'équipe et le nombre de colis. */
export function zoneSize(team, parcels) {
  return { width: Math.min(26, 15 + 2 * team + parcels), height: Math.min(22, 13 + 2 * team + parcels) }
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
 * Tire la baie infestée.
 * @param {number} seed graine choisie par le relais
 * @param {{ team: number, parcels: number, enemies: number }} settings
 */
export function generateZone(seed, settings) {
  const random = mulberry32(seed)
  const team = clampInt(settings.team, 1, RULES.team)
  const parcels = clampInt(settings.parcels, RULES.parcels.min, RULES.parcels.max)
  const enemies = clampInt(settings.enemies, RULES.enemies.min, RULES.enemies.max)
  const { width: W, height: H } = zoneSize(team, parcels)
  const N = W * H
  const idx = (x, z) => z * W + x
  const inside = (x, z) => x >= 0 && z >= 0 && x < W && z < H
  /** 'z' la baie, 'x' le sas ; tuiles de hall (numéro + 1) ; ouvertures par arête (4 par tuile). */
  const room = new Array(N).fill('z')
  const hall = new Int16Array(N)
  const open = new Uint8Array(N * 4)
  const setOpen = (x, z, dir, on = 1) => {
    const d = DIRS[dir]
    open[idx(x, z) * 4 + dir] = on
    open[idx(x + d.dx, z + d.dz) * 4 + ((dir + 2) % 4)] = on
  }
  const isOpen = (x, z, dir) => open[idx(x, z) * 4 + dir] === 1

  // --- Le sas d'extraction : 3 tuiles le long d'un bord, 2 de profondeur, deux portes vers la baie.
  const side = int(random, 0, 3) // bord où il s'adosse : 0 nord, 1 est, 2 sud, 3 ouest
  const alongX = side === 0 || side === 2
  const span = alongX ? W : H
  const c = int(random, 3, span - 4)
  const airlock = []
  for (let a = -1; a <= 1; a++) {
    for (let depth = 0; depth < 2; depth++) {
      const x = alongX ? c + a : side === 1 ? W - 1 - depth : depth
      const z = alongX ? (side === 2 ? H - 1 - depth : depth) : c + a
      room[idx(x, z)] = 'x'
      airlock.push({ x, z })
    }
  }
  for (const t of airlock) {
    for (let dir = 0; dir < 4; dir++) {
      const d = DIRS[dir]
      if (inside(t.x + d.dx, t.z + d.dz) && room[idx(t.x + d.dx, t.z + d.dz)] === 'x') setOpen(t.x, t.z, dir)
    }
  }
  // Direction de la baie vue du sas, et les deux portes (aux extrémités du côté intérieur).
  const inward = (side + 2) % 4
  const doorTiles = [-1, 1].map((a) => {
    const x = alongX ? c + a : side === 1 ? W - 2 : 1
    const z = alongX ? (side === 2 ? H - 2 : 1) : c + a
    return { x, z, dir: inward }
  })
  const pad = alongX ? { x: c, z: side === 2 ? H - 1 : 0 } : { x: side === 1 ? W - 1 : 0, z: c }

  // --- Halls de stockage : de grands espaces ouverts, encombrés de conteneurs.
  const halls = []
  const hallCount = Math.max(2, Math.round(N / 110))
  for (let attempt = 0; attempt < 80 && halls.length < hallCount; attempt++) {
    const w = int(random, 3, 5), d = int(random, 3, 4)
    const x = int(random, 1, W - w - 1), z = int(random, 1, H - d - 1)
    let free = true
    for (let tz = z - 1; tz <= z + d && free; tz++) {
      for (let tx = x - 1; tx <= x + w && free; tx++) {
        if (!inside(tx, tz)) continue
        if (hall[idx(tx, tz)] || room[idx(tx, tz)] === 'x') free = false
        // Pas collé au sas : ses portes gardent un couloir devant elles.
        for (const t of doorTiles) if (Math.abs(tx - t.x) + Math.abs(tz - t.z) <= 2) free = false
      }
    }
    if (!free) continue
    halls.push({ x, z, w, d })
    for (let tz = z; tz < z + d; tz++) for (let tx = x; tx < x + w; tx++) hall[idx(tx, tz)] = halls.length
  }

  // --- Labyrinthe (« arbre qui pousse » : surtout le plus récent, des couloirs longs et sinueux).
  const visited = new Uint8Array(N)
  const start = doorTiles[0]
  const first = { x: start.x + DIRS[inward].dx, z: start.z + DIRS[inward].dz }
  const cells = [first]
  visited[idx(first.x, first.z)] = 1
  while (cells.length) {
    const pick = random() < 0.75 ? cells.length - 1 : Math.floor(random() * cells.length)
    const cur = cells[pick]
    const dirs = shuffle([0, 1, 2, 3], random).filter((dir) => {
      const nx = cur.x + DIRS[dir].dx, nz = cur.z + DIRS[dir].dz
      return inside(nx, nz) && room[idx(nx, nz)] === 'z' && !visited[idx(nx, nz)]
    })
    if (!dirs.length) {
      cells.splice(pick, 1)
      continue
    }
    const dir = dirs[0]
    const next = { x: cur.x + DIRS[dir].dx, z: cur.z + DIRS[dir].dz }
    setOpen(cur.x, cur.z, dir)
    visited[idx(next.x, next.z)] = 1
    cells.push(next)
  }
  // Les halls s'ouvrent entièrement : les chemins qui les traversaient s'y rejoignent (des boucles).
  for (const h of halls) {
    for (let tz = h.z; tz < h.z + h.d; tz++) {
      for (let tx = h.x; tx < h.x + h.w; tx++) {
        if (tx + 1 < h.x + h.w) setOpen(tx, tz, 1)
        if (tz + 1 < h.z + h.d) setOpen(tx, tz, 2)
      }
    }
  }
  const openCount = (x, z) => (isOpen(x, z, 0) + isOpen(x, z, 1) + isOpen(x, z, 2) + isOpen(x, z, 3))
  const bayNeighbor = (x, z, dir) => {
    const nx = x + DIRS[dir].dx, nz = z + DIRS[dir].dz
    return inside(nx, nz) && room[idx(nx, nz)] === 'z'
  }
  // Moins de culs-de-sac : on en rouvre une bonne part, pour qu'on puisse semer un poursuivant.
  const deadEnds = () => {
    const out = []
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      if (room[idx(x, z)] === 'z' && !hall[idx(x, z)] && openCount(x, z) === 1) out.push({ x, z })
    }
    return out
  }
  for (const t of shuffle(deadEnds(), random)) {
    if (openCount(t.x, t.z) !== 1 || random() > 0.5) continue
    const walls = [0, 1, 2, 3].filter((dir) => !isOpen(t.x, t.z, dir) && bayNeighbor(t.x, t.z, dir))
    if (!walls.length) continue
    // D'abord vers un autre cul-de-sac : on en supprime deux d'un coup.
    walls.sort((a, b) => {
      const da = openCount(t.x + DIRS[a].dx, t.z + DIRS[a].dz) === 1 ? 0 : 1
      const db = openCount(t.x + DIRS[b].dx, t.z + DIRS[b].dz) === 1 ? 0 : 1
      return da - db
    })
    setOpen(t.x, t.z, walls[0])
  }
  // Les portes du sas.
  for (const t of doorTiles) setOpen(t.x, t.z, t.dir)

  // --- Conteneurs et piles de caisses dans les halls ; tout doit rester accessible.
  const blocked = new Uint8Array(N)
  const containers = []
  // D'un seul tenant sans passer par le sas : les ennemis, qui n'y entrent pas, vont partout.
  const connected = () => {
    const seen = new Uint8Array(N)
    const queue = [idx(first.x, first.z)]
    seen[queue[0]] = 1
    let count = 1
    while (queue.length) {
      const i = queue.pop()
      const x = i % W, z = (i - x) / W
      for (let dir = 0; dir < 4; dir++) {
        if (!open[i * 4 + dir]) continue
        const j = idx(x + DIRS[dir].dx, z + DIRS[dir].dz)
        if (seen[j] || blocked[j] || room[j] !== 'z') continue
        seen[j] = 1
        count++
        queue.push(j)
      }
    }
    let free = 0
    for (let i = 0; i < N; i++) if (!blocked[i] && room[i] === 'z') free++
    return count === free
  }
  for (const h of halls) {
    const tries = 2 + Math.floor((h.w * h.d) / 5)
    for (let t = 0; t < tries; t++) {
      const long = random() < 0.7
      const alongZ = random() < 0.5
      const w = long && !alongZ ? 2 : 1, d = long && alongZ ? 2 : 1
      if (w > h.w - 1 || d > h.d - 1) continue
      const x = int(random, h.x, h.x + h.w - w), z = int(random, h.z, h.z + h.d - d)
      const tiles = []
      for (let tz = z; tz < z + d; tz++) for (let tx = x; tx < x + w; tx++) tiles.push(idx(tx, tz))
      if (tiles.some((i) => blocked[i])) continue
      for (const i of tiles) blocked[i] = 1
      if (!connected()) {
        for (const i of tiles) blocked[i] = 0
        continue
      }
      containers.push({ x, z, w, d, kind: long ? 'container' : 'crates', color: int(random, 0, 2), flip: random() < 0.5 })
    }
  }

  // --- Plan, distances depuis le sas, puis ce qu'on pose dans la baie.
  const walls = []
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      for (const dir of [1, 2]) {
        const nx = x + DIRS[dir].dx, nz = z + DIRS[dir].dz
        if (!inside(nx, nz) || isOpen(x, z, dir)) continue
        // Entre deux tuiles de la même pièce : un mur du labyrinthe (entre deux pièces, le plan le pose seul).
        if (room[idx(x, z)] === room[idx(nx, nz)]) walls.push({ x, z, dir })
      }
    }
  }
  const layout = []
  for (let z = 0; z < H; z++) {
    let line = ''
    for (let x = 0; x < W; x++) line += room[idx(x, z)]
    layout.push(line)
  }
  const zone = {
    seed, width: W, height: H, team, parcels, enemies,
    layout, walls, doors: doorTiles.map(({ x, z, dir }) => ({ x, z, dir })),
    airlock: { side, tiles: airlock, pad, inward },
    halls, containers, blocked, open, room, hall,
    lockers: [], flares: [], cargo: [], monsters: [], decor: [],
  }
  buildGraph(zone)
  const fromAirlock = distances(zone, zone.doors.map((d) => ({ x: d.x + DIRS[d.dir].dx, z: d.z + DIRS[d.dir].dz })))
  const dist = (t) => fromAirlock[idx(t.x, t.z)]
  const taken = new Set()
  const key = (t) => `${t.x},${t.z}`
  const nearDoor = (t) => zone.doors.some((d) => Math.abs(t.x - d.x - DIRS[d.dir].dx) + Math.abs(t.z - d.z - DIRS[d.dir].dz) <= 1)
  const free = (t) => room[idx(t.x, t.z)] === 'z' && !blocked[idx(t.x, t.z)] && !taken.has(key(t)) && !nearDoor(t)

  // Casiers : au fond des culs-de-sac, puis contre les murs des halls.
  const lockerSpots = []
  for (const t of shuffle(deadEnds(), random)) {
    const openDir = [0, 1, 2, 3].find((dir) => isOpen(t.x, t.z, dir))
    lockerSpots.push({ x: t.x, z: t.z, dir: (openDir + 2) % 4 })
  }
  for (const h of shuffle([...halls], random)) {
    for (let tz = h.z; tz < h.z + h.d; tz++) {
      for (let tx = h.x; tx < h.x + h.w; tx++) {
        if (blocked[idx(tx, tz)]) continue
        for (let dir = 0; dir < 4; dir++) {
          // Un pan de mur du hall (pas une ouverture vers un couloir), sans conteneur devant.
          if (isOpen(tx, tz, dir)) continue
          if ([0, 1, 2, 3].filter((o) => isOpen(tx, tz, o)).length < 2) continue
          if (random() < 0.8) continue
          lockerSpots.push({ x: tx, z: tz, dir })
        }
      }
    }
  }
  const lockerCount = Math.min(lockerSpots.length, 3 + 2 * team)
  for (const spot of spread(lockerSpots.filter(free), lockerCount, [], random)) {
    // Deux murs d'une même tuile peuvent être candidats : un seul casier par tuile.
    if (taken.has(key(spot))) continue
    zone.lockers.push({ id: zone.lockers.length, ...spot })
    taken.add(key(spot))
  }

  // Colis : loin du sas (le retour est le plus risqué), et loin les uns des autres.
  const far = Math.max(...Array.from(fromAirlock).filter((d) => d >= 0))
  const cargoSpots = []
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const t = { x, z }
    if (free(t) && (hall[idx(x, z)] || openCount(x, z) === 1) && dist(t) >= far * 0.4) cargoSpots.push(t)
  }
  if (cargoSpots.length < parcels) {
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (free({ x, z }) && dist({ x, z }) >= 3) cargoSpots.push({ x, z })
  }
  for (const t of spread(cargoSpots, parcels, [pad], random)) {
    zone.cargo.push({ id: zone.cargo.length, x: t.x, z: t.z })
    taken.add(key(t))
  }

  // Fusées d'appel : dans les couloirs, réparties.
  const flareSpots = []
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (free({ x, z }) && !hall[idx(x, z)]) flareSpots.push({ x, z })
  for (const t of spread(flareSpots, 2 + team + Math.floor(parcels / 2), [pad, ...zone.cargo], random)) {
    zone.flares.push({ id: zone.flares.length, x: t.x, z: t.z })
    taken.add(key(t))
  }

  // Ennemis : loin du sas, répartis.
  const lairs = []
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (free({ x, z }) && dist({ x, z }) >= 6) lairs.push({ x, z })
  for (const t of spread(lairs, enemies, [pad], random)) zone.monsters.push({ id: zone.monsters.length, x: t.x, z: t.z })

  // Décor : câbles, ossements, cristaux thargoïdes, fûts renversés, flaques ; jamais sur un passage.
  const kinds = ['cables', 'bones', 'crystals', 'barrel', 'goo', 'debris']
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      if (room[idx(x, z)] !== 'z' || blocked[idx(x, z)] || taken.has(key({ x, z })) || random() > 0.2) continue
      const walled = [0, 1, 2, 3].filter((dir) => !isOpen(x, z, dir))
      const kind = kinds[Math.floor(random() * kinds.length)]
      // Contre un mur quand il y en a un : on passe au milieu.
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
