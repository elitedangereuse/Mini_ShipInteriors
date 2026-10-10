// L'arène (duels par équipes, cf. shared/arena.js), côté relais : il fait autorité sur la partie.
//
// Lobby : au terminal de l'arène (dans le lobby de la zone thargoïde, pièce 'h' de la cale), on
// ouvre un salon ou l'on en rejoint un. Chacun y choisit son camp et son arme ; le chef du salon
// règle le format (un, deux ou trois par équipe), les bots (ils complètent les deux équipes) et
// leur niveau. La partie part quelques secondes après que tout le monde s'est déclaré prêt.
// Sortir du lobby, c'est quitter le salon.
//
// Partie : une instance par salon. Les clients n'envoient que leur position (l'événement « state »
// du relais) et leurs tirs (d'où part la balle, vers où) ; le relais fait voler les balles, compte
// les points de vie, les éliminations et le score, fait revenir chacun à sa base, et fait jouer
// les bots dix fois par seconde et plus : ils cherchent l'adversaire, s'en approchent à la portée
// de leur arme, tournent autour, tirent avec un temps de réaction et un écart de visée qui
// dépendent de leur niveau. Fin : au score à atteindre, ou au bout du temps (l'équipe en tête).
//
// Un joueur ne tire pas plus vite que son arme : chaque tir lui coûte un jeton d'un chargeur qui
// se regarnit au rythme de l'arme, rechargement compris. Sa position est celle qu'il a envoyée,
// si elle est plausible (sur le sol, pas plus loin que ne le permet sa vitesse).
//
// Qui quitte la partie (abandon, déconnexion) est remplacé par un bot si le salon en a ; sinon son
// équipe continue sans lui, et perd par forfait quand elle est vide.

import { randomBytes } from 'node:crypto'
import {
  ARENA_BOTS, ARENA_LEVEL, ARENA_RULES as R, ARENA_SKILLS, arenaGoal, arenaSight, arenaSpawn, arenaZone, blastDamage, castArena, spawnYaw,
} from '../shared/arena.js'
import { findPath, smoothPath, straightWalk, walkable } from '../shared/salvage.js'
import { WEAPON_IDS, WEAPON_STATS } from '../shared/weapons.js'
import { inLobby } from './salvage.js'

/** Événements du lobby ; les autres sont ceux d'une partie (l'arme se change dans les deux). */
export const ARENA_LOBBY_ACTIONS = new Set(['arena:create', 'arena:join', 'arena:leave', 'arena:side', 'arena:settings', 'arena:weapon', 'arena:ready'])
export const ARENA_GAME_ACTIONS = new Set(['arena:fire', 'arena:quit'])

const RAD = Math.PI / 180
/** Une position plus lointaine que la vitesse ne le permet est ignorée (marge en tuiles). */
const SLACK = 0.9
/** Délai pour entrer dans l'arène après le départ : au-delà, c'est un abandon (ms). */
const ARRIVAL = 20000
/** Une balle qui n'a rien touché s'éteint (s). */
const BULLET_LIFE = 3
/** Un bot ne voit pas plus loin (tuiles). */
const BOT_SIGHT = 16

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const finite = (v) => typeof v === 'number' && Number.isFinite(v)
const round2 = (v) => Math.round(v * 100) / 100

/**
 * @param {object} o
 * @param {(id: number) => any} o.playerById joueur du relais (id, name, verified, level, x, z, yaw, anim)
 * @param {(id: number, event: string, data: object) => void} o.emit envoie à un joueur
 * @param {(event: string, data: object) => void} o.broadcast envoie à tout le bord
 */
export function createArena({ playerById, emit, broadcast, now = Date.now, random = Math.random, log = () => {}, debug = false }) {
  const rooms = new Map() // id -> salon
  const roomOf = new Map() // id du joueur -> salon
  let nextRoom = 1

  // ------------------------------------------------------------------ lobby

  const roomState = (r) => ({
    id: r.id, leader: r.leader, size: r.size, bots: r.bots, skill: r.skill, status: r.status,
    startsIn: r.status === 'countdown' ? Math.max(0, (r.startAt - now()) / 1000) : undefined,
    members: [...r.members].map(([id, m]) => {
      const p = playerById(id)
      return { id, name: p?.name ?? m.name, verified: !!p?.verified, team: m.team, weapon: m.weapon, ready: m.ready }
    }),
    ...(r.game ? { score: [...r.game.score] } : {}),
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
      if (!r.game) rooms.delete(r.id)
      return
    }
    if (r.leader === p.id) r.leader = r.members.keys().next().value
  }

  function lobbyAction(p, action, data) {
    const r = roomOf.get(p.id)
    if (r?.status === 'playing') return error(p, 'playing')
    if (action !== 'arena:leave' && !inLobby(p)) return error(p, 'lobby')
    const weapon = WEAPON_IDS.includes(data.weapon) ? data.weapon : null
    switch (action) {
      case 'arena:create': {
        if (r) { leaveRoom(p); unready(r) }
        const room = { id: nextRoom++, leader: p.id, size: 3, bots: true, skill: 1, status: 'forming', startAt: 0, members: new Map(), game: null }
        rooms.set(room.id, room)
        room.members.set(p.id, { name: p.name, team: 0, weapon: weapon ?? 'pistol', ready: false })
        roomOf.set(p.id, room)
        break
      }
      case 'arena:join': {
        const room = rooms.get(data.room)
        if (!room || room === r) return error(p, 'gone')
        if (room.status === 'playing') return error(p, 'playing')
        // Le camp demandé s'il a de la place, sinon le moins garni.
        const wanted = data.team === 0 || data.team === 1 ? data.team : count(room, 0) <= count(room, 1) ? 0 : 1
        const team = count(room, wanted) < room.size ? wanted : 1 - wanted
        if (count(room, team) >= room.size) return error(p, 'full')
        if (r) { leaveRoom(p); unready(r) }
        room.members.set(p.id, { name: p.name, team, weapon: weapon ?? 'pistol', ready: false })
        roomOf.set(p.id, room)
        unready(room)
        break
      }
      case 'arena:leave':
        if (!r) return
        leaveRoom(p)
        unready(r)
        break
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
        if (size === r.size && bots === r.bots && skill === r.skill) return
        if (count(r, 0) > size || count(r, 1) > size) return error(p, 'crowded')
        Object.assign(r, { size, bots, skill })
        unready(r)
        break
      }
      case 'arena:weapon': {
        const m = r?.members.get(p.id)
        if (!m || !weapon || weapon === m.weapon) return
        m.weapon = weapon
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

  const publicFighter = (f) => ({ id: f.id, name: f.name, team: f.team, bot: f.bot, weapon: f.weapon })
  const toGame = (game, event, data, except) => {
    for (const f of game.fighters.values()) if (!f.bot && f.id !== except) emit(f.id, event, data)
  }
  const tell = (game, data, except) => toGame(game, 'arena:event', data, except)
  const standing = (game, team) => [...game.fighters.values()].filter((f) => f.alive && (team === undefined || f.team === team))

  function makeFighter(game, base) {
    const w = WEAPON_STATS[base.weapon]
    const f = {
      verified: false, bot: false, ...base, next: base.weapon, hp: R.hp, alive: true, x: 0, z: 0, yaw: 0, at: now(), warp: true, arrived: false,
      respawnAt: 0, shieldUntil: game.liveAt + R.shield * 1000, hurtAt: 0, kills: 0, deaths: 0, damage: 0, anim: 'idle',
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
    const at = arenaSpawn(game.zone, f.team, standing(game, 1 - f.team), standing(game, f.team).filter((m) => m !== f))
    Object.assign(f, { x: at.x, z: at.z, yaw: spawnYaw(game.zone, at), at: now(), warp: true, path: [] })
  }

  function addBot(game, team) {
    const used = new Set([...game.fighters.values()].map((f) => f.name))
    const names = ARENA_BOTS.filter((n) => !used.has(n))
    return makeFighter(game, {
      id: game.nextBot--, bot: true, team, name: names[Math.floor(random() * names.length)] ?? `Drone ${-game.nextBot}`,
      weapon: WEAPON_IDS[Math.floor(random() * WEAPON_IDS.length)],
    })
  }

  function startGame(r) {
    const t = now()
    const game = {
      id: randomBytes(8).toString('hex'), room: r, zone: arenaZone(), size: r.size, startedAt: t, liveAt: t + R.warmup * 1000,
      endsAt: t + (R.warmup + R.duration) * 1000, goal: arenaGoal(r.size), score: [0, 0], skill: ARENA_SKILLS[r.skill], fighters: new Map(), bullets: [],
      ended: false, frozen: false, nextBot: -1,
    }
    for (const [id, m] of r.members) {
      const p = playerById(id)
      makeFighter(game, { id, name: p?.name ?? m.name, verified: !!p?.verified, team: m.team, weapon: m.weapon })
      m.ready = false
    }
    if (r.bots) for (const team of [0, 1]) while (standing(game, team).length < r.size) addBot(game, team)
    r.status = 'playing'
    r.game = game
    for (const f of game.fighters.values()) if (!f.bot) emit(f.id, 'arena:start', startMessage(game, f))
    log(`[arène] partie ${game.id} : ${[...game.fighters.values()].map((f) => `${f.name} (${f.team ? 'B' : 'A'})`).join(', ')}`)
    announce()
  }

  function startMessage(game, f) {
    return {
      game: game.id, team: f.team, size: game.size, goal: game.goal, duration: R.duration, warmup: Math.max(0, (game.liveAt - now()) / 1000),
      fighters: [...game.fighters.values()].map(publicFighter), spawn: { x: f.x, z: f.z, yaw: round2(f.yaw) },
    }
  }

  const gameOf = (p) => roomOf.get(p.id)?.game ?? null

  function hurt(game, target, by, amount, weapon, at) {
    const t = now()
    if (!target.alive || t < target.shieldUntil || amount <= 0 || game.ended) return
    target.hp -= amount
    target.hurtAt = t
    const attacker = game.fighters.get(by)
    if (attacker && attacker !== target) attacker.damage += Math.min(amount, amount + target.hp)
    tell(game, { kind: 'hit', id: target.id, by, hp: Math.max(0, Math.round(target.hp)), dmg: amount, x: round2(at.x), y: round2(at.y), z: round2(at.z) })
    if (target.hp > 0) return
    target.alive = false
    target.deaths++
    target.respawnAt = t + R.respawn * 1000
    target.path = []
    // Éliminé par sa propre explosion : le point va à l'équipe d'en face.
    const own = !attacker || attacker.team === target.team
    if (!own) attacker.kills++
    game.score[own ? 1 - target.team : attacker.team]++
    tell(game, { kind: 'kill', id: target.id, by, weapon, score: [...game.score], wait: R.respawn })
    if (Math.max(...game.score) >= game.goal) endGame(game, game.score[0] > game.score[1] ? 0 : 1, 'score')
  }

  function respawn(game, f) {
    const w = WEAPON_STATS[f.next]
    place(game, f)
    Object.assign(f, {
      weapon: f.next, hp: R.hp, alive: true, respawnAt: 0, shieldUntil: now() + R.shield * 1000, tokens: w.mag, tokensAt: now(), ammo: w.mag,
      reloadUntil: 0, lastSeen: null, seen: 0,
    })
    tell(game, { kind: 'spawn', id: f.id, x: f.x, z: f.z, yaw: round2(f.yaw), weapon: f.weapon })
  }

  /** Un tir part : ses balles volent dès le prochain pas ; les autres joueurs de la partie le voient. */
  function shoot(game, f, origin, dirs) {
    const w = WEAPON_STATS[f.weapon]
    // Tirer fait tomber la protection du retour à la base.
    f.shieldUntil = 0
    for (const d of dirs) game.bullets.push({ by: f.id, team: f.team, weapon: f.weapon, p: { ...origin }, d, speed: w.speed, age: 0, hit: new Set() })
    tell(game, { kind: 'shot', id: f.id, weapon: f.weapon, o: [round2(origin.x), round2(origin.y), round2(origin.z)], d: dirs.map((d) => [d.x, d.y, d.z].map((v) => Math.round(v * 1000) / 1000)) }, f.id)
  }

  /** Tir d'un joueur : d'où part la balle (près de lui), et la direction de chaque balle de la gerbe. */
  function fire(p, game, data) {
    const f = game.fighters.get(p.id)
    const t = now()
    if (!f || !f.alive || game.ended || t < game.liveAt) return
    const w = WEAPON_STATS[f.weapon]
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
    const origin = { x: o[0], y: Math.min(1, Math.max(0.05, o[1])), z: o[2] }
    // La balle part de sa main : pas de plus loin, ni de derrière un conteneur.
    if (dist(origin, f) > 1.2 || !walkable(game.zone, Math.round(origin.x), Math.round(origin.z)) || !arenaSight(game.zone, f, origin)) {
      origin.x = f.x
      origin.z = f.z
    }
    f.tokens--
    f.firedAt = t
    shoot(game, f, origin, dirs)
  }

  function explode(game, b, at) {
    // Le souffle ne traverse pas un conteneur : il part d'un peu en deçà de l'impact.
    const from = { x: at.x - b.d.x * 0.05, z: at.z - b.d.z * 0.05 }
    for (const f of standing(game)) {
      if (f.team === b.team && f.id !== b.by) continue
      const amount = blastDamage(b.weapon, dist(f, at))
      if (!amount || !arenaSight(game.zone, walkable(game.zone, Math.round(from.x), Math.round(from.z)) ? from : f, f)) continue
      hurt(game, f, b.by, f.id === b.by ? Math.round(amount * R.self) : amount, b.weapon, { x: f.x, y: R.body.h * 0.6, z: f.z })
      if (game.ended) return
    }
  }

  function stepBullets(game, dt) {
    const keep = []
    for (const b of game.bullets) {
      const w = WEAPON_STATS[b.weapon]
      let left = b.speed * dt
      let flying = (b.age += dt) < BULLET_LIFE
      for (let i = 0; i < 4 && left > 0 && flying; i++) {
        // Ni le tireur, ni son équipe, ni celui qu'elle a déjà traversé.
        const hit = castArena(game.zone, b.p, b.d, left, standing(game), (id) => b.hit.has(id) || game.fighters.get(id)?.team === b.team)
        b.p.x += b.d.x * hit.t
        b.p.y += b.d.y * hit.t
        b.p.z += b.d.z * hit.t
        left -= hit.t
        if (hit.body === null && !hit.normal) break
        if (hit.body !== null) {
          if (w.blast) explode(game, b, b.p)
          else hurt(game, game.fighters.get(hit.body), b.by, w.damage, b.weapon, b.p)
          if (game.ended) return
          if (w.pierce) {
            b.hit.add(hit.body)
            continue
          }
        } else if (w.blast) {
          explode(game, b, b.p)
          if (game.ended) return
        }
        flying = false
      }
      if (flying) keep.push(b)
    }
    game.bullets = keep
  }

  // ------------------------------------------------------------------ bots

  function routeTo(game, b, goal) {
    const tiles = findPath(game.zone, b, goal)
    if (!tiles) {
      b.path = []
      return
    }
    b.path = smoothPath(game.zone, b, tiles.slice(1))
    if (b.path.length && walkable(game.zone, Math.round(goal.x), Math.round(goal.z))) b.path[b.path.length - 1] = { x: goal.x, z: goal.z }
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
    if (walkable(game.zone, Math.round(goal.x), Math.round(goal.z)) && straightWalk(game.zone, b, goal)) b.path = [goal]
  }

  function stepBot(game, b, dt) {
    const t = now()
    const zone = game.zone
    const w = WEAPON_STATS[b.weapon]
    const skill = game.skill
    if (b.reloadUntil && t >= b.reloadUntil) {
      b.ammo = w.mag
      b.reloadUntil = 0
    }
    // Vue : l'adversaire debout le plus proche, sans rien entre eux.
    let target = null, near = BOT_SIGHT
    for (const f of standing(game, 1 - b.team)) {
      const d = dist(b, f)
      if (d < near && arenaSight(zone, b, f)) {
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
      if (near > w.reach + 1.5) {
        // Trop loin pour son arme : il s'approche.
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
    const moved = walk(b, R.bot * w.weight, dt)
    b.anim = moved ? 'sprint' : 'idle'
    if (!target) return
    const yaw = Math.atan2(target.x - b.x, target.z - b.z)
    b.yaw = yaw
    if (b.seen < skill.reaction || b.reloadUntil || t < b.nextFire) return
    if (b.ammo <= 0) {
      b.reloadUntil = t + w.reload * 1000
      return
    }
    // Le lance-plasma, pas à bout portant : il se blesserait.
    if (w.blast && near < w.blast + 1) return
    // Écart de visée : au hasard autour de la cible, plus large sur une cible qui court.
    const aim = yaw + (random() + random() - 1) * skill.error * (target.anim === 'sprint' ? 1.5 : 1) * RAD
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
    shoot(game, b, origin, dirs)
  }

  // ------------------------------------------------------------------ fin, départs

  function endGame(game, winner, reason) {
    if (game.ended) return
    game.ended = true
    const r = game.room
    r.game = null
    r.status = 'forming'
    unready(r)
    const duration = Math.round((now() - game.liveAt) / 1000)
    toGame(game, 'arena:end', {
      game: game.id, winner, reason, score: [...game.score], goal: game.goal, duration: Math.max(0, duration),
      stats: [...game.fighters.values()].map((f) => ({ ...publicFighter(f), kills: f.kills, deaths: f.deaths, damage: Math.round(f.damage) })),
    })
    if (!r.members.size) rooms.delete(r.id)
    log(`[arène] partie ${game.id} : ${winner < 0 ? 'égalité' : `équipe ${winner ? 'B' : 'A'}`} (${game.score.join(' à ')}, ${reason})`)
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
    tell(game, { kind: 'left', id: p.id })
    const humans = [...game.fighters.values()].some((x) => !x.bot)
    if (!humans) {
      // Plus personne : la partie s'arrête là, sans résultat.
      game.ended = true
      r.game = null
      r.status = 'forming'
      if (!r.members.size) rooms.delete(r.id)
    } else if (r.bots) {
      // Un bot prend sa place, à la base de son équipe.
      const bot = addBot(game, f.team)
      tell(game, { kind: 'join', fighter: publicFighter(bot), x: bot.x, z: bot.z, yaw: round2(bot.yaw) })
    } else if (![...game.fighters.values()].some((x) => x.team === f.team)) endGame(game, 1 - f.team, 'forfeit')
    announce()
  }

  function gameAction(p, game, action, data) {
    if (action === 'arena:fire') return fire(p, game, data)
    if (action === 'arena:quit') return quit(p)
    if (action === 'arena:weapon') {
      // En partie : l'arme du prochain retour à la base.
      const f = game.fighters.get(p.id)
      const m = game.room.members.get(p.id)
      if (!f || !WEAPON_IDS.includes(data.weapon)) return
      f.next = data.weapon
      if (m) m.weapon = data.weapon
    }
  }

  function handle(p, action, raw) {
    const data = raw && typeof raw === 'object' ? raw : {}
    const game = gameOf(p)
    // Serveur de dev seulement (essais dans le navigateur) : figer les bots, régler le score.
    if (action === 'arena:debug') {
      if (!debug || !game) return
      if (typeof data.freeze === 'boolean') game.frozen = data.freeze
      if (Array.isArray(data.score) && data.score.length === 2 && data.score.every(Number.isInteger)) game.score = data.score
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
    const f = gameOf(p)?.fighters.get(p.id)
    if (!f || !f.alive) return false
    if (!walkable(arenaZone(), Math.round(x), Math.round(z))) return false
    const far = Math.hypot(x - f.x, z - f.z)
    if (f.warp) return far <= 1.6
    return far <= R.sprint * 1.25 * Math.min(2, (now() - f.at) / 1000) + SLACK
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
    const r = roomOf.get(p.id)
    if (!r) return
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
        else if (f.alive && f.hp < R.hp && t - f.hurtAt > R.regenAfter * 1000) f.hp = Math.min(R.hp, f.hp + R.regen * dt)
      }
      if (!game.frozen) for (const f of game.fighters.values()) if (f.bot && f.alive) stepBot(game, f, dt)
      stepBullets(game, dt)
      if (game.ended) return
      if (t >= game.endsAt) return endGame(game, game.score[0] === game.score[1] ? -1 : game.score[0] > game.score[1] ? 0 : 1, 'time')
    }
    toGame(game, 'arena:state', {
      game: game.id,
      warmup: Math.max(0, round2((game.liveAt - t) / 1000)),
      left: Math.max(0, Math.round((game.endsAt - Math.max(t, game.liveAt)) / 100) / 10),
      score: game.score,
      fighters: [...game.fighters.values()].map((f) => ({
        id: f.id, x: round2(f.x), z: round2(f.z), yaw: round2(f.yaw), anim: f.anim, hp: Math.max(0, Math.round(f.hp)), alive: f.alive, weapon: f.weapon,
        shield: t < f.shieldUntil, kills: f.kills, deaths: f.deaths, wait: f.alive ? 0 : Math.max(0, round2((f.respawnAt - t) / 1000)),
      })),
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
