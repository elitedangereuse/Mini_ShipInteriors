// L'arène (duels par équipes, cf. shared/arena.js), côté relais : il fait autorité sur la partie.
//
// Lobby : au terminal de l'arène (dans son lobby, pièce 'y' de la cale, cf. ARENA_LOBBY), quatre
// lobbys (ARENA_RULES.lobbies, les « salons » du code) attendent chacun une partie : on se place
// dans celui de son choix, pour jouer avec qui l'on veut, et l'on en change librement. Chacun y
// choisit son camp et son personnage (cf. ARENA_CHARACTERS : il le garde toute la partie) ; le premier arrivé en est le chef : il règle le format (un, deux ou
// trois par équipe), la limite de points, les bots (ils complètent les deux équipes) et leur niveau. La partie part
// quelques secondes après que tout le monde s'est déclaré prêt. Sortir des lobbys de la cale, c'est quitter son
// lobby ; un lobby vidé retrouve ses réglages de départ.
//
// Partie : une instance par salon. Les clients n'envoient que leur position (l'événement « state »
// du relais) et leurs tirs (d'où part la balle, vers où, et jusqu'où pour un objet lancé) ; le relais
// fait voler les projectiles (jusqu'au bout de la portée de l'arme, pas plus loin), lance en cloche
// les graines de Capucine et les cocktails de Jacques, fait pousser les fleurs carnivores et brûler
// les flaques, compte les points de vie, les soins de Betty, les éliminations et le score, fait
// revenir chacun à sa base (éliminé, on y attend en fantôme quelques secondes, hors d'atteinte), et fait jouer
// les bots dix fois par seconde et plus : ils cherchent l'adversaire, s'en approchent à la portée
// de leur personnage, tournent autour, tirent dès qu'il est à portée (Betty soigne aussi les siens),
// avec un temps de réaction et un écart de visée qui
// dépendent de leur niveau. Une manche se gagne à la limite de points, ou au bout du temps (l'équipe
// en tête) ; la partie, en deux manches gagnantes (ARENA_RULES.wins), trois au plus.
//
// Un joueur ne tire pas plus vite que son arme : chaque tir lui coûte un jeton d'un chargeur qui
// se regarnit au rythme de l'arme, rechargement compris. Sa position est celle qu'il a envoyée,
// si elle est plausible (sur le sol, pas plus loin que ne le permet la vitesse de son personnage).
//
// Classement : à la fin d'une partie, le relais déclare au site la partie de chaque CMDR qui l'a
// finie (gagnée, perdue ou nulle, ses éliminations, ses chutes) : cf. `report`. Une partie contre
// des bots compte comme une autre. Chaque joueur apprend ensuite si la sienne a été notée
// (« arena:ranked » : oui, ou pourquoi pas). Rien n'est payé.
//
// Spectateurs : du terminal, on peut regarder une partie en cours (« arena:watch »). Le relais
// envoie alors au spectateur ce qu'il envoie aux joueurs (l'état, les tirs, la fin) ; lui reste au
// lobby, et n'agit sur rien.
//
// Qui quitte la partie (abandon, déconnexion) est remplacé par un bot si le salon en a ; sinon son
// équipe continue sans lui, et perd par forfait quand elle est vide.

import { randomBytes } from 'node:crypto'
import {
  ARENA_BOTS, ARENA_CHARACTERS, ARENA_LEVEL, ARENA_LOBBY, ARENA_RULES as R, ARENA_SKILLS, CHARACTER_IDS, DEFAULT_CHARACTER,
  arenaHidden, arenaSight, arenaSpawn, arenaZone, blastDamage, bushSight, castArena, lobTarget, lobTime, spawnYaw,
} from '../shared/arena.js'
import { findPath, smoothPath, straightWalk, walkable } from '../shared/salvage.js'
import { ShipMap } from '../shared/ship-map.js'
import { SHIP_LAYOUTS, shipMapOptions } from '../shared/ship-layouts.js'

/** Événements du lobby ; les autres sont ceux d'une partie. */
export const ARENA_LOBBY_ACTIONS = new Set(['arena:join', 'arena:leave', 'arena:side', 'arena:settings', 'arena:character', 'arena:ready', 'arena:watch', 'arena:unwatch'])
export const ARENA_GAME_ACTIONS = new Set(['arena:fire', 'arena:quit'])

const RAD = Math.PI / 180
const HOLD = new ShipMap(SHIP_LAYOUTS[String(ARENA_LOBBY.level)], shipMapOptions(ARENA_LOBBY.level))

/** Joueur au lobby de l'arène, ou dans celui de la zone thargoïde, d'où l'on y entre ? */
export function inLobby(p) {
  return p.level === ARENA_LOBBY.level && ARENA_LOBBY.rooms.includes(HOLD.room(Math.round(p.x), Math.round(p.z)) ?? ' ')
}
/** Une position plus lointaine que la vitesse ne le permet est ignorée (marge en tuiles). */
const SLACK = 0.9
/** Délai pour entrer dans l'arène après le départ : au-delà, c'est un abandon (ms). */
const ARRIVAL = 20000
/** Garde-fou : une balle encore en vol après ce délai s'éteint (s). C'est sa portée qui l'arrête, bien avant. */
const BULLET_LIFE = 3
/** Un bot ne voit pas plus loin (tuiles). */
const BOT_SIGHT = 16

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const statsOf = (character) => ARENA_CHARACTERS[character] ?? ARENA_CHARACTERS[DEFAULT_CHARACTER]
/** Blessé, pour les soins de Betty : comme le voient les clients, qui reçoivent des points de vie arrondis. */
const wounded = (f) => Math.round(f.hp) < f.max
const weaponOf = (character) => statsOf(character).weapon
const finite = (v) => typeof v === 'number' && Number.isFinite(v)
const round2 = (v) => Math.round(v * 100) / 100
const baseEdge = (zone, team) => team === 0 ? R.baseDepth - 0.5 : zone.width - R.baseDepth - 0.5
const inBase = (zone, team, p) => team === 0 ? p.x < baseEdge(zone, team) : p.x > baseEdge(zone, team)
const outsideEnemyBase = (zone, team, p) => !inBase(zone, 1 - team, p)

/**
 * @param {object} o
 * @param {(id: number) => any} o.playerById joueur du relais (id, name, verified, level, x, z, yaw, anim)
 * @param {(id: number, event: string, data: object) => void} o.emit envoie à un joueur
 * @param {(event: string, data: object) => void} o.broadcast envoie à tout le bord
 * @param {(fighter: object, result: object) => Promise<boolean>} [o.report] déclare au site la partie
 *   d'un CMDR, pour le classement (cf. postArenaResult dans site.js)
 */
export function createArena({ playerById, emit, broadcast, report = async () => false, now = Date.now, random = Math.random, log = () => {}, debug = false }) {
  // Les salons, fixes : id -> salon (vide tant que personne ne s'y est placé).
  const rooms = new Map(Array.from({ length: R.lobbies }, (_, i) => [i + 1, { id: i + 1, members: new Map(), game: null }]))
  const reset = (r) => Object.assign(r, { leader: null, size: 3, bots: true, skill: 1, goal: R.goal, status: 'forming', startAt: 0 })
  for (const r of rooms.values()) reset(r)
  const roomOf = new Map() // id du joueur -> salon

  // ------------------------------------------------------------------ lobby

  const roomState = (r) => ({
    id: r.id, leader: r.leader, size: r.size, bots: r.bots, skill: r.skill, goal: r.goal, status: r.status,
    startsIn: r.status === 'countdown' ? Math.max(0, (r.startAt - now()) / 1000) : undefined,
    members: [...r.members].map(([id, m]) => {
      const p = playerById(id)
      return { id, name: p?.name ?? m.name, verified: !!p?.verified, team: m.team, character: m.character, ready: m.ready }
    }),
    ...(r.game ? { score: [...r.game.score], rounds: [...r.game.rounds], watchers: r.game.watchers.size } : {}),
  })
  const snapshot = () => ({ rooms: [...rooms.values()].map(roomState) })
  const announce = () => broadcast('arena:lobby', snapshot())
  const error = (p, code) => emit(p.id, 'arena:error', { code })
  const count = (r, team) => [...r.members.values()].filter((m) => m.team === team).length

  /** Réglages changés, membre parti ou arrivé : chacun redit qu'il est prêt. */
  function unready(r) {
    for (const m of r.members.values()) m.ready = false
    if (r.status === 'countdown') r.status = 'forming'
  }

  function leaveRoom(p) {
    const r = roomOf.get(p.id)
    if (!r) return
    roomOf.delete(p.id)
    r.members.delete(p.id)
    if (!r.members.size) {
      if (!r.game) reset(r)
      return
    }
    if (r.leader === p.id) r.leader = r.members.keys().next().value
  }

  /** Le joueur ne regarde plus aucune partie. */
  function unwatch(p) {
    let was = false
    for (const r of rooms.values()) if (r.game?.watchers.delete(p.id)) was = true
    return was
  }

  function lobbyAction(p, action, data) {
    const r = roomOf.get(p.id)
    if (r?.status === 'playing') return error(p, 'playing')
    if (action === 'arena:unwatch') {
      if (unwatch(p)) announce()
      return
    }
    if (action !== 'arena:leave' && !inLobby(p)) return error(p, 'lobby')
    const character = CHARACTER_IDS.includes(data.character) ? data.character : null
    switch (action) {
      case 'arena:join': {
        const room = rooms.get(data.room)
        if (!room) return error(p, 'gone')
        if (room === r) return
        if (room.status === 'playing') return error(p, 'playing')
        // Le camp demandé s'il a de la place, sinon le moins garni.
        const wanted = data.team === 0 || data.team === 1 ? data.team : count(room, 0) <= count(room, 1) ? 0 : 1
        const team = count(room, wanted) < room.size ? wanted : 1 - wanted
        if (count(room, team) >= room.size) return error(p, 'full')
        if (r) { leaveRoom(p); unready(r) }
        if (!room.members.size) room.leader = p.id
        room.members.set(p.id, { name: p.name, team, character: character ?? DEFAULT_CHARACTER, ready: false })
        roomOf.set(p.id, room)
        unready(room)
        break
      }
      case 'arena:leave':
        if (!r) return
        leaveRoom(p)
        unready(r)
        break
      case 'arena:watch': {
        // Spectateur d'une partie en cours : il la reçoit comme un joueur, sans y être.
        const game = rooms.get(data.room)?.game
        if (!game || game.ended) return error(p, 'gone')
        unwatch(p)
        game.watchers.add(p.id)
        emit(p.id, 'arena:start', startMessage(game, null))
        break
      }
      case 'arena:side': {
        const m = r?.members.get(p.id)
        if (!m || (data.team !== 0 && data.team !== 1) || data.team === m.team) return
        if (count(r, data.team) >= r.size) return error(p, 'full')
        m.team = data.team
        unready(r)
        break
      }
      case 'arena:settings': {
        if (!r || r.leader !== p.id) return error(p, 'leader')
        const size = Number.isInteger(data.size) ? Math.min(R.team, Math.max(1, data.size)) : r.size
        const bots = typeof data.bots === 'boolean' ? data.bots : r.bots
        const skill = Number.isInteger(data.skill) ? Math.min(ARENA_SKILLS.length - 1, Math.max(0, data.skill)) : r.skill
        const goal = R.goals.includes(data.goal) ? data.goal : r.goal
        if (size === r.size && bots === r.bots && skill === r.skill && goal === r.goal) return
        if (count(r, 0) > size || count(r, 1) > size) return error(p, 'crowded')
        Object.assign(r, { size, bots, skill, goal })
        unready(r)
        break
      }
      case 'arena:character': {
        const m = r?.members.get(p.id)
        if (!m || !character || character === m.character) return
        m.character = character
        break
      }
      case 'arena:ready': {
        const m = r?.members.get(p.id)
        if (!m) return
        m.ready = data.ready === true
        const all = [...r.members.values()].every((x) => x.ready)
        // Sans bots, il faut quelqu'un en face.
        if (all && !r.bots && (!count(r, 0) || !count(r, 1))) {
          m.ready = false
          error(p, 'alone')
        } else if (all) {
          r.status = 'countdown'
          r.startAt = now() + R.countdown * 1000
        } else if (r.status === 'countdown') r.status = 'forming'
        break
      }
      default:
        return
    }
    announce()
  }

  // ------------------------------------------------------------------ partie

  const publicFighter = (f) => ({ id: f.id, name: f.name, team: f.team, bot: f.bot, character: f.character })
  const toGame = (game, event, data, except) => {
    for (const f of game.fighters.values()) if (!f.bot && f.id !== except) emit(f.id, event, data)
    for (const id of game.watchers) emit(id, event, data)
  }
  const tell = (game, data, except) => toGame(game, 'arena:event', data, except)
  const standing = (game, team) => [...game.fighters.values()].filter((f) => f.alive && (team === undefined || f.team === team))

  function makeFighter(game, base) {
    const c = statsOf(base.character)
    const w = c.weapon
    const f = {
      verified: false, bot: false, ...base, hp: c.hp, max: c.hp, alive: true, x: 0, z: 0, yaw: 0, at: now(), warp: true, arrived: false,
      respawnAt: 0, shieldUntil: game.liveAt + R.shield * 1000, hurtAt: 0, revealUntil: 0, kills: 0, deaths: 0, damage: 0, healed: 0, anim: 'idle',
      // Joueur : le chargeur de jetons qui borne sa cadence.
      tokens: w.mag, tokensAt: now(), firedAt: 0,
      // Bot : son chemin, qui il voit et depuis quand, son chargeur.
      path: [], lastSeen: null, seen: 0, calm: 0, think: 0, repath: 0, ammo: w.mag, reloadUntil: 0, nextFire: 0,
    }
    place(game, f)
    game.fighters.set(f.id, f)
    return f
  }

  /** Pose un combattant à sa base, loin des adversaires. */
  function place(game, f) {
    // Ses coéquipiers debout, et ceux qui attendent déjà à la base de revenir en jeu.
    const mates = [...game.fighters.values()].filter((m) => m !== f && m.team === f.team && (m.alive || m.waiting))
    const at = arenaSpawn(game.zone, f.team, standing(game, 1 - f.team), mates)
    Object.assign(f, { x: at.x, z: at.z, yaw: spawnYaw(game.zone, at), at: now(), warp: true, path: [] })
  }

  /** Un bot de l'équipe `team` : un personnage que son équipe n'a pas encore, si possible. */
  function addBot(game, team) {
    const used = new Set([...game.fighters.values()].map((f) => f.name))
    const names = ARENA_BOTS.filter((n) => !used.has(n))
    const taken = new Set([...game.fighters.values()].filter((f) => f.team === team).map((f) => f.character))
    const fresh = CHARACTER_IDS.filter((c) => !taken.has(c))
    const pool = fresh.length ? fresh : CHARACTER_IDS
    return makeFighter(game, {
      id: game.nextBot--, bot: true, team, name: names[Math.floor(random() * names.length)] ?? `Drone ${-game.nextBot}`,
      character: pool[Math.floor(random() * pool.length)],
    })
  }

  function startGame(r) {
    const t = now()
    const game = {
      id: randomBytes(8).toString('hex'), room: r, zone: arenaZone(), size: r.size, startedAt: t, liveAt: t + R.warmup * 1000,
      endsAt: t + (R.warmup + R.duration) * 1000, goal: r.goal, score: [0, 0], round: 1, rounds: [0, 0], skill: ARENA_SKILLS[r.skill], fighters: new Map(), bullets: [],
      // Les fleurs de Capucine et les flaques de Jacques, sur le terrain.
      traps: [], nextTrap: 1,
      ended: false, frozen: false, nextBot: -1, watchers: new Set(),
    }
    for (const [id, m] of r.members) {
      const p = playerById(id)
      makeFighter(game, { id, name: p?.name ?? m.name, verified: !!p?.verified, cookie: p?.cookie ?? null, team: m.team, character: m.character })
      m.ready = false
      // Qui regardait une autre partie joue maintenant la sienne.
      if (p) unwatch(p)
    }
    if (r.bots) for (const team of [0, 1]) while (standing(game, team).length < r.size) addBot(game, team)
    r.status = 'playing'
    r.game = game
    for (const f of game.fighters.values()) if (!f.bot) emit(f.id, 'arena:start', startMessage(game, f))
    log(`[arène] partie ${game.id} : ${[...game.fighters.values()].map((f) => `${f.name} (${f.team ? 'B' : 'A'}, ${f.character})`).join(', ')}`)
    announce()
  }

  /** @param f le combattant à qui l'on écrit ; null : un spectateur (il regarde du côté de l'équipe 0, depuis le milieu de l'arène) */
  function startMessage(game, f) {
    const at = f ?? { team: 0, x: (game.zone.width - 1) / 2, z: (game.zone.height - 1) / 2, yaw: 0 }
    return {
      game: game.id, team: at.team, size: game.size, goal: game.goal, wins: R.wins, duration: R.duration, warmup: Math.max(0, (game.liveAt - now()) / 1000),
      fighters: [...game.fighters.values()].map(publicFighter), spawn: { x: at.x, z: at.z, yaw: round2(at.yaw) },
      ...(f ? {} : { watch: true }),
    }
  }

  const gameOf = (p) => roomOf.get(p.id)?.game ?? null
  /** La partie est finie, ou entre deux manches : plus une balle ne vole, plus un coup ne porte. */
  const over = (game) => game.ended || now() < game.liveAt

  /**
   * `target` perd `amount` points de vie, du fait de `by` (son personnage, `character`, pour le fil
   * des éliminations) ; `trap` : la fleur ou la flaque qui a mordu ou brûlé.
   */
  function hurt(game, target, by, amount, character, at, trap) {
    const t = now()
    if (!target.alive || t < target.shieldUntil || amount <= 0 || over(game)) return
    target.hp -= amount
    target.hurtAt = t
    // Touché, on ne se cache plus dans un buisson pendant un instant.
    target.revealUntil = t + R.bush.reveal * 1000
    const attacker = game.fighters.get(by)
    if (attacker && attacker !== target) attacker.damage += Math.min(amount, amount + target.hp)
    tell(game, { kind: 'hit', id: target.id, by, hp: Math.max(0, Math.round(target.hp)), dmg: amount, x: round2(at.x), y: round2(at.y), z: round2(at.z), ...(trap ? { trap } : {}) })
    if (target.hp > 0) return
    target.alive = false
    target.deaths++
    target.respawnAt = t + R.respawn * 1000
    // Il attend à sa base, en fantôme, le temps de revenir en jeu : ni cible, ni tireur.
    const fell = { x: round2(target.x), z: round2(target.z) }
    place(game, target)
    target.waiting = true
    // Sans adversaire pour l'avoir eu (il est parti) : le point va à l'équipe d'en face.
    const own = !attacker || attacker.team === target.team
    if (!own) attacker.kills++
    game.score[own ? 1 - target.team : attacker.team]++
    tell(game, { kind: 'kill', id: target.id, by, character, score: [...game.score], wait: R.respawn, from: fell, x: target.x, z: target.z, yaw: round2(target.yaw) })
    if (Math.max(...game.score) >= game.goal) endRound(game, game.score[0] > game.score[1] ? 0 : 1, 'score')
  }

  /** Betty soigne `target` (un coéquipier) de `amount`, sans dépasser ses points de vie de départ. */
  function heal(game, target, by, amount, at) {
    if (!target.alive || !wounded(target) || over(game)) return
    const gain = Math.min(amount, target.max - target.hp)
    target.hp += gain
    const healer = game.fighters.get(by)
    if (healer) healer.healed += gain
    tell(game, { kind: 'heal', id: target.id, by, hp: Math.round(target.hp), amount: Math.round(gain), x: round2(at.x), y: round2(at.y), z: round2(at.z) })
  }

  function respawn(game, f) {
    const w = weaponOf(f.character)
    // Éliminé, il attendait déjà à sa base (cf. hurt) : il y reste.
    if (!f.waiting) place(game, f)
    Object.assign(f, {
      hp: f.max, alive: true, waiting: false, at: now(), respawnAt: 0, shieldUntil: now() + R.shield * 1000, tokens: w.mag, tokensAt: now(), ammo: w.mag,
      reloadUntil: 0, lastSeen: null, seen: 0,
    })
    tell(game, { kind: 'spawn', id: f.id, x: f.x, z: f.z, yaw: round2(f.yaw) })
  }

  /**
   * Un tir part : ses projectiles volent dès le prochain pas ; les autres joueurs de la partie le
   * voient. `throwTo` : pour un objet lancé, jusqu'où (tuiles).
   */
  function shoot(game, f, origin, dirs, throwTo = 0) {
    const w = weaponOf(f.character)
    // Tirer fait tomber la protection du retour à la base, et trahit qui se cachait dans un buisson.
    f.shieldUntil = 0
    f.revealUntil = now() + R.bush.reveal * 1000
    const base = { by: f.id, team: f.team, character: f.character, w, age: 0, hit: new Set() }
    const shot = { kind: 'shot', id: f.id, character: f.character, o: [round2(origin.x), round2(origin.y), round2(origin.z)], d: dirs.map((d) => [d.x, d.y, d.z].map((v) => Math.round(v * 1000) / 1000)) }
    if (w.lob) {
      // En cloche, par-dessus les obstacles : il retombe là où l'on a visé.
      const flat = Math.hypot(dirs[0].x, dirs[0].z) || 1
      const dir = { x: dirs[0].x / flat, z: dirs[0].z / flat }
      const to = lobTarget(game.zone, origin, dir, throwTo, w.range)
      const dur = lobTime(w, dist(origin, to))
      game.bullets.push({ ...base, lob: true, p: { ...origin }, to, dur })
      tell(game, { ...shot, to: [round2(to.x), round2(to.z)], dur: round2(dur) }, f.id)
      return
    }
    for (const d of dirs) game.bullets.push({ ...base, p: { ...origin }, d, speed: w.speed, left: w.range })
    tell(game, shot, f.id)
  }

  /**
   * Tir d'un joueur : d'où part le projectile (près de lui), la direction de chaque projectile de la
   * gerbe, et pour un objet lancé, jusqu'où (`r`, en tuiles).
   */
  function fire(p, game, data) {
    const f = game.fighters.get(p.id)
    const t = now()
    if (!f || !f.alive || game.ended || t < game.liveAt) return
    const w = weaponOf(f.character)
    // La cadence : jamais deux tirs plus rapprochés que l'arme, et pas plus que son chargeur ne débite.
    f.tokens = Math.min(w.mag, f.tokens + ((t - f.tokensAt) / 1000) * (w.mag / (w.mag * w.interval + w.reload)))
    f.tokensAt = t
    if (f.tokens < 1 || t - f.firedAt < w.interval * 800) return
    const o = Array.isArray(data.o) ? data.o : []
    const list = Array.isArray(data.d) ? data.d.slice(0, w.pellets) : []
    if (o.length !== 3 || !o.every(finite) || !list.length) return
    const dirs = []
    for (const v of list) {
      if (!Array.isArray(v) || v.length !== 3 || !v.every(finite)) return
      const len = Math.hypot(v[0], v[1], v[2])
      if (len < 0.5 || len > 2) return
      dirs.push({ x: v[0] / len, y: v[1] / len, z: v[2] / len })
    }
    if (w.lob && (!finite(data.r) || Math.hypot(dirs[0].x, dirs[0].z) < 0.2)) return
    const origin = { x: o[0], y: Math.min(1, Math.max(0.05, o[1])), z: o[2] }
    // Le projectile part de sa main : pas de plus loin, ni de derrière un conteneur.
    if (dist(origin, f) > 1.2 || !walkable(game.zone, Math.round(origin.x), Math.round(origin.z)) || !arenaSight(game.zone, f, origin)) {
      origin.x = f.x
      origin.z = f.z
    }
    f.tokens--
    f.firedAt = t
    shoot(game, f, origin, dirs, w.lob ? data.r : 0)
  }

  /** Le souffle d'une explosion en `at` (tomate, cocktail) : les adversaires dans son rayon, que rien n'abrite. */
  function explode(game, b, at) {
    // Le souffle ne traverse pas un conteneur : il part d'un peu en deçà de l'impact.
    const from = b.d ? { x: at.x - b.d.x * 0.05, z: at.z - b.d.z * 0.05 } : at
    for (const f of standing(game, 1 - b.team)) {
      const amount = blastDamage(b.w, dist(f, at))
      if (!amount || !arenaSight(game.zone, walkable(game.zone, Math.round(from.x), Math.round(from.z)) ? from : f, f)) continue
      hurt(game, f, b.by, amount, b.character, { x: f.x, y: R.body.h * 0.6, z: f.z })
      if (over(game)) return
    }
  }

  /**
   * Un objet lancé retombe : le cocktail éclate (son souffle, puis sa flaque qui brûle), la graine
   * fait pousser une fleur carnivore. Ni fleur ni flaque dans la base adverse.
   */
  function land(game, b) {
    const w = b.w
    const at = { x: b.to.x, y: 0.1, z: b.to.z }
    if (w.blast) {
      explode(game, b, at)
      if (over(game)) return
    }
    if (!outsideEnemyBase(game.zone, b.team, at)) return
    const t = now()
    const kind = w.flower ? 'flower' : w.fire ? 'fire' : null
    if (!kind) return
    const spec = w.flower ?? w.fire
    if (w.flower) {
      // Pas plus de `most` fleurs à la fois : la plus vieille fane.
      const mine = game.traps.filter((x) => x.kind === 'flower' && x.by === b.by)
      for (const old of mine.slice(0, Math.max(0, mine.length - w.flower.most + 1))) game.traps.splice(game.traps.indexOf(old), 1)
    }
    const trap = {
      id: game.nextTrap++, kind, by: b.by, team: b.team, character: b.character, w, x: round2(at.x), z: round2(at.z),
      until: t + spec.life * 1000, next: t + (w.flower ? w.flower.grow : w.fire.every) * 1000,
    }
    game.traps.push(trap)
  }

  /** Les fleurs mordent, les flaques brûlent ; celles qui ont fait leur temps disparaissent. */
  function stepTraps(game) {
    const t = now()
    game.traps = game.traps.filter((x) => t < x.until)
    for (const trap of [...game.traps]) {
      if (t < trap.next) continue
      const foes = standing(game, 1 - trap.team)
      if (trap.kind === 'flower') {
        // L'adversaire le plus proche, à portée de mâchoire, que rien n'abrite.
        const spec = trap.w.flower
        let prey = null, near = spec.radius + R.body.r
        for (const f of foes) {
          const d = dist(f, trap)
          if (d <= near && t >= f.shieldUntil && arenaSight(game.zone, trap, f)) { near = d; prey = f }
        }
        if (!prey) continue
        trap.next = t + spec.every * 1000
        hurt(game, prey, trap.by, trap.w.damage, trap.character, { x: prey.x, y: R.body.h * 0.5, z: prey.z }, trap.id)
      } else {
        const spec = trap.w.fire
        trap.next = t + spec.every * 1000
        for (const f of foes) {
          if (dist(f, trap) > spec.radius + R.body.r) continue
          hurt(game, f, trap.by, spec.damage, trap.character, { x: f.x, y: 0.2, z: f.z }, trap.id)
          if (over(game)) return
        }
      }
      if (over(game)) return
    }
  }

  function stepBullets(game, dt) {
    const keep = []
    for (const b of game.bullets) {
      const w = b.w
      b.age += dt
      if (b.lob) {
        // En vol, il ne touche rien ; il retombe au bout de sa course.
        if (b.age < b.dur) keep.push(b)
        else {
          land(game, b)
          if (over(game)) return
        }
        continue
      }
      // Pas plus loin que la portée de l'arme.
      let left = Math.min(b.speed * dt, b.left)
      let flying = b.age < BULLET_LIFE
      for (let i = 0; i < 4 && left > 0 && flying; i++) {
        // Ni le tireur, ni celui qu'elle a déjà traversé ; ses coéquipiers non plus, sauf, pour les
        // soins de Betty, un coéquipier blessé.
        const hit = castArena(game.zone, b.p, b.d, left, standing(game), (id) => {
          if (b.hit.has(id) || id === b.by) return true
          const o = game.fighters.get(id)
          return o?.team === b.team && !(w.heal && wounded(o))
        })
        b.p.x += b.d.x * hit.t
        b.p.y += b.d.y * hit.t
        b.p.z += b.d.z * hit.t
        left -= hit.t
        b.left -= hit.t
        if (hit.body === null && !hit.normal) break
        if (hit.body !== null) {
          const target = game.fighters.get(hit.body)
          if (target.team === b.team) heal(game, target, b.by, w.heal, b.p)
          else if (w.blast) explode(game, b, b.p)
          else hurt(game, target, b.by, w.damage, b.character, b.p)
          if (over(game)) return
          if (w.pierce) {
            b.hit.add(hit.body)
            continue
          }
        } else if (w.blast) {
          explode(game, b, b.p)
          if (over(game)) return
        }
        flying = false
      }
      // Au bout de sa portée, elle s'éteint ; la tomate, elle, éclate là.
      if (flying && b.left <= 1e-6) {
        flying = false
        if (w.blast) {
          explode(game, b, b.p)
          if (over(game)) return
        }
      }
      if (flying) keep.push(b)
    }
    game.bullets = keep
  }

  // ------------------------------------------------------------------ bots

  function routeTo(game, b, goal) {
    const edge = baseEdge(game.zone, 1 - b.team)
    const safe = { ...goal, x: b.team === 0 ? Math.min(goal.x, edge - 0.01) : Math.max(goal.x, edge + 0.01) }
    const tiles = findPath(game.zone, b, safe)
    if (!tiles) {
      b.path = []
      return
    }
    b.path = smoothPath(game.zone, b, tiles.slice(1))
    if (b.path.length && walkable(game.zone, Math.round(safe.x), Math.round(safe.z))) b.path[b.path.length - 1] = safe
  }

  /** Avance le long de son chemin ; true tant qu'il marche. */
  function walk(b, speed, dt) {
    let budget = speed * dt
    const moved = b.path.length > 0
    while (budget > 0 && b.path.length) {
      const next = b.path[0]
      const dx = next.x - b.x, dz = next.z - b.z
      const d = Math.hypot(dx, dz)
      if (d > 1e-4) b.yaw = Math.atan2(dx, dz)
      if (d <= budget) {
        b.x = next.x
        b.z = next.z
        budget -= d
        b.path.shift()
      } else {
        b.x += (dx / d) * budget
        b.z += (dz / d) * budget
        budget = 0
      }
    }
    return moved
  }

  /** Une tuile libre au hasard, plutôt du côté adverse : là où un bot va voir quand il ne voit personne. */
  function roamGoal(game, b) {
    const zone = game.zone
    for (let i = 0; i < 30; i++) {
      const x = Math.floor(random() * zone.width), z = Math.floor(random() * zone.height)
      if (!walkable(zone, x, z) || Math.abs(x - b.x) + Math.abs(z - b.z) < 5) continue
      // Deux fois sur trois, pas dans sa propre moitié.
      const own = b.team === 0 ? x < zone.width / 2 : x >= zone.width / 2
      if (own && random() < 0.66) continue
      return { x, z }
    }
    return zone.spawns[1 - b.team][0]
  }

  /** Un pas de côté (ou en arrière) autour de la cible, s'il est praticable. */
  function sidestep(game, b, target, back) {
    const dx = target.x - b.x, dz = target.z - b.z
    const d = Math.hypot(dx, dz) || 1
    const side = random() < 0.5 ? 1 : -1
    const reach = 0.9 + random() * 0.9
    const goal = back
      ? { x: b.x - (dx / d) * reach + (-dz / d) * side * 0.5, z: b.z - (dz / d) * reach + (dx / d) * side * 0.5 }
      : { x: b.x + (-dz / d) * side * reach, z: b.z + (dx / d) * side * reach }
    if (outsideEnemyBase(game.zone, b.team, goal) && walkable(game.zone, Math.round(goal.x), Math.round(goal.z)) && straightWalk(game.zone, b, goal)) b.path = [goal]
  }

  function stepBot(game, b, dt) {
    const t = now()
    const zone = game.zone
    const c = statsOf(b.character)
    const w = c.weapon
    const skill = game.skill
    if (b.reloadUntil && t >= b.reloadUntil) {
      b.ammo = w.mag
      b.reloadUntil = 0
    }
    // Vue : l'adversaire debout le plus proche, sans rien entre eux, et qui ne se cache pas dans un
    // buisson (Nico, que Boulon renseigne, en voit de plus loin).
    let target = null, near = BOT_SIGHT
    for (const f of standing(game, 1 - b.team)) {
      const d = dist(b, f)
      if (d < near && arenaSight(zone, b, f) && !arenaHidden(zone, f, b, t < f.revealUntil, bushSight(b.character))) {
        near = d
        target = f
      }
    }
    b.think -= dt
    b.repath -= dt
    if (target) {
      b.seen += dt
      b.calm = 0
      b.lastSeen = { x: target.x, z: target.z }
      if (near > w.reach) {
        // Plus loin qu'il n'aime pour son arme : il s'approche (à portée, il tire déjà en marchant).
        if (b.repath <= 0 || !b.path.length) {
          b.repath = 0.4
          routeTo(game, b, target)
        }
      } else if (b.think <= 0) {
        // À portée : il tourne autour, recule s'il est trop près.
        b.think = 0.5 + random() * 0.8
        sidestep(game, b, target, near < w.reach * 0.45)
      }
    } else {
      b.seen = 0
      b.calm += dt
      if (!b.path.length) {
        // Plus personne en vue : là où il l'a vu en dernier, puis au hasard dans l'arène.
        const goal = b.lastSeen ?? roamGoal(game, b)
        b.lastSeen = null
        routeTo(game, b, goal)
      }
      // Au calme depuis un moment : il recharge.
      if (b.calm > 1 && b.ammo < w.mag && !b.reloadUntil) b.reloadUntil = t + w.reload * 1000
    }
    const moved = walk(b, R.bot * c.speed, dt)
    // Dernier garde-fou : même un chemin lissé ne franchit jamais la frontière adverse.
    const enemyEdge = baseEdge(zone, 1 - b.team)
    if (b.team === 0 && b.x >= enemyEdge) { b.x = enemyEdge - 0.01; b.path = [] }
    if (b.team === 1 && b.x <= enemyEdge) { b.x = enemyEdge + 0.01; b.path = [] }
    b.anim = moved ? 'sprint' : 'idle'
    // Betty : sans adversaire à portée, elle soigne le plus blessé des siens qu'elle voit.
    let aimed = target && near <= w.range + R.body.r ? target : null
    if (w.heal && !aimed) {
      let worst = 0.75
      for (const m of standing(game, b.team)) {
        const d = dist(b, m)
        if (m === b || d > w.range || m.hp / m.max >= worst || !arenaSight(zone, b, m)) continue
        worst = m.hp / m.max
        aimed = m
      }
    }
    if (target) b.yaw = Math.atan2(target.x - b.x, target.z - b.z)
    if (!aimed) return
    const range = dist(b, aimed)
    const yaw = Math.atan2(aimed.x - b.x, aimed.z - b.z)
    b.yaw = yaw
    if ((aimed === target && b.seen < skill.reaction) || b.reloadUntil || t < b.nextFire) return
    if (b.ammo <= 0) {
      b.reloadUntil = t + w.reload * 1000
      return
    }
    // Écart de visée : au hasard autour de la cible, plus large sur une cible qui court.
    const aim = yaw + (random() + random() - 1) * skill.error * (aimed.anim === 'sprint' ? 1.5 : 1) * RAD
    const dirs = []
    for (let i = 0; i < w.pellets; i++) {
      const a = aim + (random() * 2 - 1) * w.spread * RAD
      dirs.push({ x: Math.sin(a), y: 0, z: Math.cos(a) })
    }
    const origin = { x: b.x + Math.sin(yaw) * 0.3, y: R.aim, z: b.z + Math.cos(yaw) * 0.3 }
    if (!walkable(zone, Math.round(origin.x), Math.round(origin.z))) Object.assign(origin, { x: b.x, z: b.z })
    b.ammo--
    // Une arme au coup par coup : un bot ne presse pas la détente plus de trois fois par seconde.
    b.nextFire = t + (Math.max(w.interval, w.auto ? 0 : 0.3) / skill.pace) * 1000
    // Un objet lancé : là où se tient la cible, à l'écart de visée près.
    shoot(game, b, origin, dirs, w.lob ? range * (1 + (random() + random() - 1) * skill.error * 0.02) : 0)
  }

  // ------------------------------------------------------------------ fin, départs

  /**
   * Une manche se termine (`winner` : -1 à égalité, au bout du temps) : l'équipe qui la gagne la
   * marque. La partie est jouée quand une équipe a ses manches gagnantes, ou après la dernière
   * manche (celle qui en a le plus l'emporte) ; sinon, la suivante part après une pause, chacun
   * revenu à sa base, points de vie et chargeurs pleins, le score de la manche à zéro.
   */
  function endRound(game, winner, reason) {
    if (game.ended) return
    if (winner >= 0) game.rounds[winner]++
    const [a, b] = game.rounds
    if (Math.max(a, b) >= R.wins || game.round >= R.rounds) return endGame(game, a === b ? -1 : a > b ? 0 : 1, reason)
    const t = now()
    tell(game, { kind: 'round', round: game.round, winner, reason, score: [...game.score], rounds: [...game.rounds], wait: R.intermission })
    game.round++
    game.score = [0, 0]
    game.bullets = []
    game.traps = []
    game.liveAt = t + R.intermission * 1000
    game.endsAt = game.liveAt + R.duration * 1000
    for (const f of game.fighters.values()) {
      f.waiting = false
      respawn(game, f)
      Object.assign(f, { shieldUntil: game.liveAt + R.shield * 1000, hurtAt: 0, revealUntil: 0, firedAt: 0, nextFire: 0, calm: 0 })
    }
    log(`[arène] partie ${game.id} : manche ${game.round - 1} ${winner < 0 ? 'nulle' : `à l'équipe ${winner ? 'B' : 'A'}`} (${a} à ${b})`)
    announce()
  }

  function endGame(game, winner, reason) {
    if (game.ended) return
    game.ended = true
    const r = game.room
    r.game = null
    r.status = 'forming'
    unready(r)
    const duration = Math.round((now() - game.startedAt) / 1000)
    toGame(game, 'arena:end', {
      game: game.id, winner, reason, score: [...game.score], rounds: [...game.rounds], goal: game.goal, duration: Math.max(0, duration),
      stats: [...game.fighters.values()].map((f) => ({ ...publicFighter(f), kills: f.kills, deaths: f.deaths, damage: Math.round(f.damage), heal: Math.round(f.healed) })),
    })
    if (!r.members.size) reset(r)
    // Le classement : la partie de chaque CMDR qui l'a finie, déclarée au site ; chacun apprend si
    // la sienne a été notée (un invité n'a pas de compte ; `site` : le site ne l'a pas prise).
    for (const f of game.fighters.values()) {
      if (f.bot) continue
      const told = (ok, reason) => emit(f.id, 'arena:ranked', { game: game.id, ok, ...(ok ? {} : { reason }) })
      if (!f.verified || !f.cookie) {
        told(false, 'guest')
        continue
      }
      const result = { game: game.id, result: winner < 0 ? 'draw' : winner === f.team ? 'won' : 'lost', kills: f.kills, deaths: f.deaths, size: game.size }
      void Promise.resolve().then(() => report(f, result)).catch(() => false).then((ok) => told(!!ok, 'site'))
    }
    log(`[arène] partie ${game.id} : ${winner < 0 ? 'égalité' : `équipe ${winner ? 'B' : 'A'}`} (${game.rounds.join(' manches à ')}, ${reason})`)
    announce()
  }

  /** Un joueur quitte la partie en cours (abandon, retour au vaisseau, déconnexion). */
  function quit(p) {
    const r = roomOf.get(p.id)
    const game = r?.game
    if (!game) return
    const f = game.fighters.get(p.id)
    leaveRoom(p)
    if (!f) return announce()
    game.fighters.delete(p.id)
    game.bullets = game.bullets.filter((b) => b.by !== p.id)
    game.traps = game.traps.filter((x) => x.by !== p.id)
    tell(game, { kind: 'left', id: p.id })
    const humans = [...game.fighters.values()].some((x) => !x.bot)
    if (!humans) {
      // Plus personne : la partie s'arrête là, sans résultat ; qui la regardait rentre au lobby.
      for (const id of game.watchers) emit(id, 'arena:error', { code: 'over' })
      game.watchers.clear()
      game.ended = true
      r.game = null
      r.status = 'forming'
      if (!r.members.size) reset(r)
    } else if (r.bots) {
      // Un bot prend sa place, à la base de son équipe.
      const bot = addBot(game, f.team)
      tell(game, { kind: 'join', fighter: publicFighter(bot), x: bot.x, z: bot.z, yaw: round2(bot.yaw) })
    } else if (![...game.fighters.values()].some((x) => x.team === f.team)) endGame(game, 1 - f.team, 'forfeit')
    announce()
  }

  /** En partie, on tire ou l'on s'en va ; le personnage, lui, ne change pas. */
  function gameAction(p, game, action, data) {
    if (action === 'arena:fire') return fire(p, game, data)
    if (action === 'arena:quit') return quit(p)
  }

  function handle(p, action, raw) {
    const data = raw && typeof raw === 'object' ? raw : {}
    const game = gameOf(p)
    // Serveur de dev seulement (essais dans le navigateur) : figer les bots, régler le score.
    if (action === 'arena:debug') {
      if (!debug || !game) return
      if (typeof data.freeze === 'boolean') game.frozen = data.freeze
      if (Array.isArray(data.score) && data.score.length === 2 && data.score.every(Number.isInteger)) game.score = data.score
      if (Array.isArray(data.rounds) && data.rounds.length === 2 && data.rounds.every(Number.isInteger)) game.rounds = data.rounds
      return
    }
    if (game) return gameAction(p, game, action, data)
    if (ARENA_LOBBY_ACTIONS.has(action)) lobbyAction(p, action, data)
  }

  /**
   * Position reçue d'un joueur dans l'arène : acceptée s'il y est debout, sur le sol, pas plus loin
   * que ne le permet sa vitesse ; à son retour à la base, seulement près de sa base.
   */
  function accepts(p, x, z) {
    const game = gameOf(p)
    const f = game?.fighters.get(p.id)
    if (!f || !f.alive) return false
    if (!walkable(arenaZone(), Math.round(x), Math.round(z))) return false
    const at = { x, z }
    // Avant le signal, chacun reste dans sa base ; pendant la manche, la base adverse reste interdite.
    if (!outsideEnemyBase(game.zone, f.team, at) || (now() < game.liveAt && !inBase(game.zone, f.team, at))) return false
    const far = Math.hypot(x - f.x, z - f.z)
    if (f.warp) return far <= 1.6
    return far <= R.sprint * statsOf(f.character).speed * 1.25 * Math.min(2, (now() - f.at) / 1000) + SLACK
  }

  /** Après chaque position acceptée (ou changement de pont) d'un joueur. */
  function moved(p) {
    const r = roomOf.get(p.id)
    if (!r) return
    const game = r.game
    if (!game) {
      // Sortir du lobby, c'est quitter le salon.
      if (!inLobby(p)) {
        leaveRoom(p)
        unready(r)
        announce()
      }
      return
    }
    const f = game.fighters.get(p.id)
    if (!f) return
    if (p.level !== ARENA_LEVEL) {
      // Reparti au vaisseau en pleine partie, ou jamais arrivé : c'est un abandon.
      if (f.arrived || now() - game.startedAt > ARRIVAL) quit(p)
      return
    }
    f.arrived = true
    if (!f.alive) return
    Object.assign(f, { x: p.x, z: p.z, yaw: p.yaw, anim: p.anim, at: now(), warp: false })
  }

  /** Départ du vaisseau (déconnexion). */
  function leave(p) {
    const watched = unwatch(p)
    const r = roomOf.get(p.id)
    if (!r) return watched ? announce() : undefined
    if (r.game) return quit(p)
    leaveRoom(p)
    unready(r)
    announce()
  }

  /** Joueurs de la même partie en cours, les deux équipes (pour limiter la vue, le chat et les emotes à l'arène). */
  function mates(p) {
    const game = gameOf(p)
    if (!game) return new Set()
    return new Set([...game.fighters.values()].filter((f) => !f.bot).map((f) => f.id))
  }

  function stepGame(game, dt) {
    const t = now()
    if (t >= game.liveAt) {
      for (const f of game.fighters.values()) {
        if (!f.alive && f.respawnAt && t >= f.respawnAt) respawn(game, f)
        // Sans dégât depuis un moment, les points de vie remontent.
        else if (f.alive && f.hp < f.max && t - f.hurtAt > R.regenAfter * 1000) f.hp = Math.min(f.max, f.hp + R.regen * f.max * dt)
      }
      if (!game.frozen) for (const f of game.fighters.values()) if (f.bot && f.alive) stepBot(game, f, dt)
      stepBullets(game, dt)
      if (game.ended) return
      if (!over(game)) stepTraps(game)
      if (game.ended) return
      if (t >= game.endsAt) return endRound(game, game.score[0] === game.score[1] ? -1 : game.score[0] > game.score[1] ? 0 : 1, 'time')
    }
    toGame(game, 'arena:state', {
      game: game.id,
      warmup: Math.max(0, round2((game.liveAt - t) / 1000)),
      left: Math.max(0, Math.round((game.endsAt - Math.max(t, game.liveAt)) / 100) / 10),
      score: game.score,
      round: game.round,
      rounds: game.rounds,
      fighters: [...game.fighters.values()].map((f) => ({
        id: f.id, x: round2(f.x), z: round2(f.z), yaw: round2(f.yaw), anim: f.anim, hp: Math.max(0, Math.round(f.hp)), alive: f.alive,
        shield: t < f.shieldUntil, kills: f.kills, deaths: f.deaths, wait: f.alive ? 0 : Math.max(0, round2((f.respawnAt - t) / 1000)),
      })),
      // Les fleurs et les flaques : où, de quel camp, combien de temps encore (s).
      traps: game.traps.map((x) => ({ id: x.id, kind: x.kind, team: x.team, x: x.x, z: x.z, left: Math.max(0, round2((x.until - t) / 1000)) })),
    })
  }

  /** Un pas de simulation (dt en secondes) : départs des salons prêts, puis chaque partie. */
  function tick(dt) {
    const t = now()
    for (const r of [...rooms.values()]) {
      if (r.status === 'countdown' && r.startAt <= t) startGame(r)
      if (r.game && !r.game.ended) stepGame(r.game, dt)
    }
  }

  return { snapshot, handle, accepts, moved, leave, mates, tick, gameOf }
}
