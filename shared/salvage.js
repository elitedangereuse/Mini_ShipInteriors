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
  /** betray : un poursuivant plus près que ça quand on s'y glisse le fouille ; plus loin, il perd sa trace. */
  locker: { max: 30, cooldown: 4, enter: 0.55, betray: 2 },
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
 * Plan de la baie, le même à chaque mission : trois bandes séparées par des cloisons percées de
 * passages de deux tuiles. Au nord, le hall de fret (conteneurs), deux petites pièces (salle de
 * pause, local radio) et le nid (cristaux, flaques caustiques) ; au milieu, un grand hall dégagé
 * semé d'îlots, avec le guichet de sécurité où s'est barricadé le technicien ; au sud, la salle
 * des machines et son atelier, le sas d'extraction, la zone effondrée et l'infirmerie de fortune.
 * Une lettre par tuile (colonne = x, ligne = z) :
 *   '.'  sol de la baie        'x'  sas d'extraction
 *   '#'  cloison (plein : ni sol, ni passage, ni vue)
 *   'L'  sol, avec un casier contre la paroi ou le conteneur voisin
 *   '='  conteneur couché (par paires, de gauche à droite)
 *   'H'  conteneur debout (par paires, de haut en bas)
 *   'c'  pile de fûts ou de caisses (une tuile)   'm'  générateur (une tuile)
 *   'g'  guichet de sécurité : on y voit par la vitre, on n'y entre pas
 */
export const BAY = [
  'L...L.....#L......L#..L.....L.',
  '..==..==..#........#..........',
  '.........................H....',
  '........c................H...L',
  '.H..==....#........#.c........',
  '.H........#....c...#..........',
  '......L...#.L....L.#..L.....c.',
  '####..########..########..####',
  '..L.......ggg.....L...........',
  '..........ggg.................',
  'L....==L........c......LH.....',
  '.....c............c.....Hc....',
  '.................==L.........L',
  '..............................',
  '...........L...............L..',
  '####..########..########..####',
  'L.....L...#L......L#...L......',
  '..........#........#..........',
  '............c....c...c.....c..',
  '.....mm.................==....',
  '.m.....m..#........#..c.......',
  '..........#........#..........',
  '..........#...xxx..#..........',
  '...L....L.#L..xxx.L#..L.....L.',
]
/** Le sas : adossé au bord sud (2), ouvert vers le nord (0) par deux portes, la plateforme au fond. */
const BAY_AIRLOCK = { side: 2, inward: 0, pad: { x: 15, z: 23 }, doors: [{ x: 14, z: 22, dir: 0 }, { x: 16, z: 22, dir: 0 }] }

/**
 * Le guichet de sécurité : ses tuiles ('g'), la vitre (côté `window`, 2 : sud), où se tient le
 * technicien derrière, et où l'on se met pour lui parler, devant le comptoir.
 */
export const BAY_BOOTH = { x: 10, z: 8, w: 3, d: 2, window: 2, technician: { x: 11, z: 8.85 }, counter: { x: 11, z: 10 } }

/**
 * Petites pièces à l'éclairage de fortune : un rectangle de tuiles entouré de cloisons fines
 * (sauf aux portes : l'arête `dir` de la tuile x, z), une seule lampe qui vacille, et leurs
 * meubles (modèles du jeu, cf. src/furniture/) ; un meuble `block` occupe sa tuile, ou les tuiles
 * listées (ni colis, ni fusée, ni passage).
 */
export const BAY_ROOMS = [
  {
    id: 'pause', x: 11, z: 0, w: 4, d: 3, doors: [{ x: 12, z: 2, dir: 2 }, { x: 13, z: 2, dir: 2 }],
    light: { x: 13, z: 1, color: '#ffc875', intensity: 1.1, flicker: 'neon' },
    furniture: [
      { model: 'canteen-table', x: 13, z: 1, rot: 1, block: [[12, 1], [13, 1], [14, 1]] },
      { model: 'water-fountain', x: 14, z: 0.2, rot: 0, block: true },
      { model: 'mug', x: 13.1, z: 0.95, y: 0.37 },
    ],
  },
  {
    id: 'radio', x: 15, z: 0, w: 4, d: 3, doors: [{ x: 16, z: 2, dir: 2 }, { x: 17, z: 2, dir: 2 }],
    light: { x: 16.5, z: 0.6, color: '#5fb4ff', intensity: 0.9, flicker: 'neon' },
    furniture: [
      { model: 'computer-system', x: 16, z: 0.25, rot: 0, block: true },
      { model: 'side-console', x: 17, z: 0.25, rot: 0, block: true },
      { model: 'chair', x: 16.5, z: 1.1, rot: 2 },
      { model: 'headphone-stand', x: 15.3, z: 0.3, rot: 0 },
    ],
  },
  {
    id: 'workshop', x: 0, z: 16, w: 4, d: 3, doors: [{ x: 3, z: 17, dir: 1 }],
    light: { x: 1.8, z: 16.6, color: '#ff9a3c', intensity: 1.2, flicker: 'fire' },
    furniture: [
      { model: 'workbench', x: 2, z: 16.25, rot: 0, block: true },
      { model: 'tool-rack', x: 0.25, z: 17.2, rot: 1, block: true },
      { model: 'work-lamp', x: 2.8, z: 18.3, rot: 3 },
      { model: 'crate', x: 2, z: 18.3, rot: 0, block: true },
    ],
  },
  {
    id: 'infirmary', x: 26, z: 20, w: 4, d: 4, doors: [{ x: 26, z: 21, dir: 3 }],
    light: { x: 28, z: 21.5, color: '#cfe8ff', intensity: 0.9, flicker: 'neon' },
    furniture: [
      { model: 'bunk-bed', x: 28.5, z: 20.35, rot: 0, block: [[28, 20], [29, 20]] },
      { model: 'wheelchair', x: 27.2, z: 22.4, rot: 1 },
      { model: 'stain', x: 28, z: 21.8, rot: 0 },
      { model: 'footlocker', x: 29.25, z: 22.3, rot: 3, block: true },
    ],
  },
]

/**
 * Coins de la baie, chacun son décor au sol (tiré par la graine) et ses lueurs : fret en vrac au
 * nord-ouest, nid thargoïde au nord-est, machines au sud-ouest, plafond effondré au sud-est.
 */
export const BAY_AREAS = [
  { id: 'freight', x: 0, z: 0, w: 10, d: 7, density: 0.14, decor: ['cables', 'barrel', 'barrel', 'debris'], lights: [] },
  { id: 'nest', x: 20, z: 0, w: 10, d: 7, density: 0.34, decor: ['crystals', 'crystals', 'crystals', 'goo', 'goo', 'bones'], lights: [{ x: 25.4, z: 1.4, color: '#39ff88', intensity: 0.9, flicker: 'neon' }, { x: 21.5, z: 5, color: '#2fd873', intensity: 0.7 }] },
  { id: 'machines', x: 0, z: 16, w: 10, d: 8, density: 0.16, decor: ['cables', 'cables', 'barrel', 'goo'], lights: [{ x: 6, z: 19.6, color: '#ff5a36', intensity: 0.8, flicker: 'fire' }] },
  { id: 'collapse', x: 20, z: 16, w: 10, d: 8, density: 0.26, decor: ['debris', 'debris', 'debris', 'bones', 'cables'], lights: [{ x: 22.4, z: 18.2, color: '#ffaa55', intensity: 0.8, flicker: 'neon' }] },
]
const DECOR = ['cables', 'bones', 'crystals', 'barrel', 'goo', 'debris']
const areaOf = (x, z) => BAY_AREAS.find((a) => x >= a.x && z >= a.z && x < a.x + a.w && z < a.z + a.d) ?? null

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
  const booth = new Uint8Array(N)
  const hall = new Int16Array(N)
  const open = new Uint8Array(N * 4)
  const airlock = []
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const c = cell(x, z)
      room[idx(x, z)] = c === 'x' ? 'x' : c === '#' ? ' ' : 'z'
      if (c === 'x') airlock.push({ x, z })
      if ('=Hcm#g'.includes(c)) blocked[idx(x, z)] = 1
      if (c === 'g') booth[idx(x, z)] = 1
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
  const walls = []
  const wallUp = (x, z, dir) => {
    const nx = x + DIRS[dir].dx, nz = z + DIRS[dir].dz
    if (!inside(nx, nz) || !isOpen(x, z, dir)) return
    open[idx(x, z) * 4 + dir] = 0
    open[idx(nx, nz) * 4 + ((dir + 2) % 4)] = 0
    walls.push(dir === 1 || dir === 2 ? { x, z, dir } : { x: nx, z: nz, dir: (dir + 2) % 4 })
  }
  // Petites pièces : cloisons fines tout autour, sauf aux portes ; leurs meubles occupent leur tuile.
  for (const r of BAY_ROOMS) {
    const within = (x, z) => x >= r.x && z >= r.z && x < r.x + r.w && z < r.z + r.d
    for (let z = r.z; z < r.z + r.d; z++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        for (let dir = 0; dir < 4; dir++) {
          if (within(x + DIRS[dir].dx, z + DIRS[dir].dz)) continue
          if (r.doors.some((d) => d.x === x && d.z === z && d.dir === dir)) continue
          wallUp(x, z, dir)
        }
      }
    }
    for (const f of r.furniture) {
      if (!f.block) continue
      for (const [x, z] of f.block === true ? [[Math.round(f.x), Math.round(f.z)]] : f.block) blocked[idx(x, z)] = 1
    }
  }
  // Le guichet : cloisonné, sauf la vitre (le passage reste fermé : ses tuiles sont bloquées).
  for (let z = BAY_BOOTH.z; z < BAY_BOOTH.z + BAY_BOOTH.d; z++) {
    for (let x = BAY_BOOTH.x; x < BAY_BOOTH.x + BAY_BOOTH.w; x++) {
      for (let dir = 0; dir < 4; dir++) {
        const nx = x + DIRS[dir].dx, nz = z + DIRS[dir].dz
        if (inside(nx, nz) && booth[idx(nx, nz)]) continue
        if (dir !== BAY_BOOTH.window) wallUp(x, z, dir)
      }
    }
  }

  // Conteneurs : les paires de '=' (couchés) et de 'H' (debout), les piles de caisses. Couleurs
  // tirées de la position : la baie a toujours la même allure.
  const containers = []
  const done = new Uint8Array(N)
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const c = cell(x, z)
      if (done[idx(x, z)] || !'=Hcm'.includes(c)) continue
      const w = c === '=' ? 2 : 1, d = c === 'H' ? 2 : 1
      for (let tz = z; tz < z + d; tz++) for (let tx = x; tx < x + w; tx++) done[idx(tx, tz)] = 1
      // Un générateur est la pile de variante 0 (cf. src/salvage/kit.ts).
      const tint = c === 'm' ? 0 : (x * 7 + z * 13) % 3
      containers.push({ x, z, w, d, kind: c === '=' || c === 'H' ? 'container' : 'crates', color: tint, flip: c !== 'm' && (x + z) % 2 === 1 })
    }
  }

  const layout = BAY.map((line) => line.replace(/#/g, ' ').replace(/[^x ]/g, 'z'))
  const zone = {
    seed, width: W, height: H, team, parcels, enemies,
    layout, walls, doors, booth, rooms: BAY_ROOMS, areas: BAY_AREAS,
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
  // Devant les portes du sas et devant le comptoir du guichet, on ne pose rien.
  const nearDoor = (t) => zone.doors.some((d) => Math.abs(t.x - d.x - DIRS[d.dir].dx) + Math.abs(t.z - d.z - DIRS[d.dir].dz) <= 1)
    || (t.z === BAY_BOOTH.z + BAY_BOOTH.d && t.x >= BAY_BOOTH.x - 1 && t.x <= BAY_BOOTH.x + BAY_BOOTH.w)
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

  // Décor : câbles, ossements, cristaux thargoïdes, fûts renversés, flaques ; celui de chaque coin
  // (cf. BAY_AREAS), jamais sur un passage ni dans les petites pièces (elles ont leurs meubles).
  const inRoom = (x, z) => BAY_ROOMS.some((r) => x >= r.x && z >= r.z && x < r.x + r.w && z < r.z + r.d)
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const area = areaOf(x, z)
      if (room[idx(x, z)] !== 'z' || blocked[idx(x, z)] || taken.has(key({ x, z })) || nearDoor({ x, z }) || inRoom(x, z) || random() > (area?.density ?? 0.1)) continue
      const walled = [0, 1, 2, 3].filter((dir) => !walkable(zone, x + DIRS[dir].dx, z + DIRS[dir].dz))
      const kinds = area?.decor ?? DECOR
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
    isFloor: (x, z) => x >= 0 && z >= 0 && x < W && z < H && (!zone.blocked[z * W + x] || !!zone.booth?.[z * W + x]),
    room: (x, z) => (x >= 0 && z >= 0 && x < W && z < H ? zone.room[z * W + x] : null),
    edge: (x, z, dir) => {
      if (x < 0 || z < 0 || x >= W || z >= H) return 'wall'
      const i = z * W + x
      if (zone.adj[i * 4 + dir] >= 0) return 'open'
      // Le guichet se voit à travers sa vitre, et d'un bout à l'autre.
      const nx = x + DIRS[dir].dx, nz = z + DIRS[dir].dz
      const j = nz * W + nx
      const glass = nx >= 0 && nz >= 0 && nx < W && nz < H && (zone.booth?.[i] || zone.booth?.[j]) && zone.open[i * 4 + dir] && !(zone.blocked[i] && !zone.booth[i]) && !(zone.blocked[j] && !zone.booth[j])
      return glass ? 'open' : 'wall'
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

/**
 * D'où l'on regarde : `p`, ou, s'il déborde sur une tuile bloquée (au ras d'un meuble plus petit
 * que sa tuile), le point le plus proche d'une tuile libre voisine ; sans quoi la ligne de vue
 * partirait de l'intérieur de l'obstacle, et l'on ne verrait plus rien.
 */
export function sightOrigin(zone, p) {
  const x = Math.round(p.x), z = Math.round(p.z)
  if (walkable(zone, x, z)) return p
  if (x < 0 || z < 0 || x >= zone.width || z >= zone.height) return p
  // Une voisine du même côté des cloisons (arête ouverte), jamais à travers une cloison.
  let best = null, bestD = Infinity
  for (let dir = 0; dir < 4; dir++) {
    const tx = x + DIRS[dir].dx, tz = z + DIRS[dir].dz
    if (!zone.open[(z * zone.width + x) * 4 + dir] || !walkable(zone, tx, tz)) continue
    const q = { x: Math.min(tx + 0.45, Math.max(tx - 0.45, p.x)), z: Math.min(tz + 0.45, Math.max(tz - 0.45, p.z)) }
    const d = Math.hypot(q.x - p.x, q.z - p.z)
    if (d < bestD) {
      bestD = d
      best = q
    }
  }
  return best ?? p
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
