// Récupération de cargaison en zone thargoïde (SOC-06), côté relais : il fait autorité sur la
// partie.
//
// Lobby : dans le sas de la cale (pièce 'h' du pont -1), on forme une équipe de un à quatre
// joueurs ; son chef choisit le nombre de colis et d'ennemis, chacun se déclare prêt, et la
// mission part quelques secondes après le dernier. Sortir du lobby, c'est quitter l'équipe.
//
// Partie : une instance par équipe (sa graine, ses colis, ses ennemis, ses casiers, sa fusée).
// Le relais tire la baie (cf. shared/salvage.js), place les joueurs loin des ennemis, puis fait
// vivre les ennemis dix fois par seconde : patrouille, bruit entendu, poursuite de qui ils voient,
// fouille d'un casier, attirance d'une fusée. Il arbitre les ramassages, les dépôts au sas, les
// captures, et la fin : victoire quand tous les colis sont rapportés, défaite quand plus personne
// n'est actif. Les clients n'envoient que leur position (l'événement « state » du relais) et
// leurs actions.
//
// La ruche s'agite : à chaque colis livré, le monte-charge du sas fait du bruit, et les ennemis
// patrouillent plus vite, rôdent plus souvent du côté des joueurs et entendent de plus loin
// (RULES.hive, au complet au dernier colis). Un joueur dans une zone éclairée se voit de loin ; un
// pas sur du verre brisé s'entend, même en marchant.
//
// Fin : chacun reçoit la note de la mission (S à D, cf. salvageGrade) et ses chiffres (captures,
// repérages, fusées, casiers, colis de chacun).
//
// Gains : une victoire paie chaque membre CMDR, y compris ceux qui ont été capturés ; le relais
// transmet le résultat au site (cf. `reward`), qui ne paie qu'une fois par partie et par CMDR, et
// qu'un nombre de missions par jour (`salvage.daily` dans economy.json). Une victoire plus rapide que
// possible (`minDuration`, cf. salvageMinDuration) n'est pas transmise : le relais la note au journal.
//
// Reconnexion : au départ, chaque membre reçoit un ticket. Déconnecté en pleine course, il lâche
// son colis et sa place l'attend une minute (RULES.reconnect) ; avec son ticket, il revient au sas
// d'extraction. Un capturé revient suivre son équipe tant que la partie dure. Une partie finie
// entre-temps : on lui en donne le résultat (gardé dix minutes).

import { randomBytes } from 'node:crypto'
import { DIRS, ShipMap } from '../shared/ship-map.js'
import { SHIP_LAYOUTS, shipMapOptions } from '../shared/ship-layouts.js'
import {
  distances, findPath, floorFx, FX, generateZone, inAirlock, isLit, LOBBY, lockerFront, lockerSpot, mulberry32, pickSpawns, RULES, salvageGrade,
  salvagePar, smoothPath, tileOf, walkable, ZONE_LEVEL, zoneSight,
} from '../shared/salvage.js'

const HOLD = new ShipMap(SHIP_LAYOUTS[String(LOBBY.level)], shipMapOptions(LOBBY.level))
const M = RULES.monster
/** Un ennemi qui passe devant un casier occupé (sans avoir vu qui s'y cachait) le fouille parfois. */
const SEARCH_CHANCE = 0.22
/** Délai avant qu'un même casier soit de nouveau tenté par le même ennemi (s). */
const SEARCH_AGAIN = 15
/** Intervalle des bruits de course (s). */
const STEP_NOISE = 0.45
/** Une position plus lointaine que la vitesse ne le permet est ignorée (marge en tuiles). */
const SLACK = 0.9
/** Délai pour entrer dans la baie après le départ (ou le retour) : au-delà, c'est un abandon (ms). */
const ARRIVAL = 30000
/** Résultat d'une partie finie, gardé pour ceux qui reviennent après (ms). */
const KEEP_RESULT = 600000

/** Événements du lobby ; les autres (ramasser, se cacher, lancer une fusée, abandonner) sont ceux d'une partie. */
export const LOBBY_ACTIONS = new Set(['salvage:create', 'salvage:join', 'salvage:leave', 'salvage:settings', 'salvage:ready', 'salvage:resume'])
export const GAME_ACTIONS = new Set(['salvage:pickup', 'salvage:hide', 'salvage:unhide', 'salvage:flare', 'salvage:quit'])

const clampInt = (v, lo, hi) => (Number.isInteger(v) ? Math.min(hi, Math.max(lo, v)) : null)
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

/** Joueur dans le lobby (le sas de la cale) ? */
export function inLobby(p) {
  return p.level === LOBBY.level && HOLD.room(Math.round(p.x), Math.round(p.z)) === LOBBY.room
}

/**
 * @param {object} o
 * @param {(id: number) => any} o.playerById joueur du relais (id, name, verified, level, x, z, anim, cookie)
 * @param {(id: number, event: string, data: object) => void} o.emit envoie à un joueur
 * @param {(event: string, data: object) => void} o.broadcast envoie à tout le bord
 * @param {(member: object, result: object) => Promise<{ earned: number, balance?: number, capped?: boolean, boosters?: number, badge?: boolean } | null>} [o.reward]
 *   paie un membre ; `capped` : le site a déjà payé ses missions du jour
 * @param {(parcels: number, team: number) => number} [o.minDuration] durée (s) en deçà de laquelle
 *   une victoire n'est pas payée
 */
export function createSalvage({
  playerById, emit, broadcast, reward = async () => null, minDuration = () => 0, now = Date.now, random = Math.random, log = () => {}, debug = false,
  seed = () => randomBytes(4).readUInt32LE(0),
}) {
  const teams = new Map() // id -> équipe
  const games = new Map() // id -> partie
  const teamOf = new Map() // id du joueur -> équipe
  const finished = new Map() // id de partie -> { result, tickets, until }
  let nextTeam = 1

  // ------------------------------------------------------------------ lobby

  const teamState = (t) => ({
    id: t.id, leader: t.leader, parcels: t.parcels, enemies: t.enemies, status: t.status,
    startsIn: t.status === 'countdown' ? Math.max(0, (t.startAt - now()) / 1000) : undefined,
    members: t.members.map((id) => {
      const p = playerById(id)
      const m = t.game?.members.get(id)
      return { id, name: p?.name ?? m?.name ?? '?', verified: !!(p?.verified ?? m?.verified), ready: t.ready.has(id) }
    }),
    ...(t.game ? { delivered: t.game.delivered, alive: [...t.game.members.values()].filter((m) => m.status === 'alive').length } : {}),
  })
  const snapshot = () => ({ teams: [...teams.values()].map(teamState) })
  const announce = () => broadcast('salvage:lobby', snapshot())

  function joinTeam(p, t) {
    t.members.push(p.id)
    teamOf.set(p.id, t)
  }

  function leaveTeam(p) {
    const t = teamOf.get(p.id)
    if (!t) return
    teamOf.delete(p.id)
    t.members = t.members.filter((id) => id !== p.id)
    t.ready.delete(p.id)
    if (t.status === 'countdown') t.status = 'forming'
    if (!t.members.length) {
      teams.delete(t.id)
      return
    }
    if (t.leader === p.id) t.leader = t.members[0]
  }

  /** Réglages changés, membre parti ou arrivé : chacun redit qu'il est prêt. */
  function unready(t) {
    t.ready.clear()
    if (t.status === 'countdown') t.status = 'forming'
  }

  const error = (p, code) => emit(p.id, 'salvage:error', { code })

  function lobbyAction(p, action, data) {
    const t = teamOf.get(p.id)
    if (t?.status === 'playing') return error(p, 'playing')
    if (action !== 'salvage:leave' && !inLobby(p)) return error(p, 'lobby')
    switch (action) {
      case 'salvage:create': {
        if (t) leaveTeam(p)
        const team = { id: nextTeam++, leader: p.id, members: [], ready: new Set(), parcels: 1, enemies: 1, status: 'forming', startAt: 0, game: null }
        teams.set(team.id, team)
        joinTeam(p, team)
        break
      }
      case 'salvage:join': {
        const team = teams.get(data.team)
        if (!team || team === t) return error(p, 'gone')
        if (team.status === 'playing') return error(p, 'playing')
        if (team.members.length >= RULES.team) return error(p, 'full')
        if (t) leaveTeam(p)
        joinTeam(p, team)
        unready(team)
        break
      }
      case 'salvage:leave':
        if (!t) return
        leaveTeam(p)
        unready(t)
        break
      case 'salvage:settings': {
        if (!t || t.leader !== p.id) return error(p, 'leader')
        const parcels = clampInt(data.parcels, RULES.parcels.min, RULES.parcels.max)
        const enemies = clampInt(data.enemies, RULES.enemies.min, RULES.enemies.max)
        if (parcels === null || enemies === null) return
        if (parcels === t.parcels && enemies === t.enemies) return
        t.parcels = parcels
        t.enemies = enemies
        unready(t)
        break
      }
      case 'salvage:ready': {
        if (!t) return
        if (data.ready === true) t.ready.add(p.id)
        else t.ready.delete(p.id)
        if (t.members.every((id) => t.ready.has(id))) {
          t.status = 'countdown'
          t.startAt = now() + RULES.countdown * 1000
        } else if (t.status === 'countdown') t.status = 'forming'
        break
      }
      default:
        return
    }
    announce()
  }

  // ------------------------------------------------------------------ partie

  function startGame(t) {
    const settings = { team: t.members.length, parcels: t.parcels, enemies: t.enemies }
    const gameSeed = seed()
    const zone = generateZone(gameSeed, settings)
    const rand = mulberry32(gameSeed ^ 0x9e3779b9)
    const spawns = pickSpawns(zone, t.members.length, zone.monsters, rand)
    const game = {
      id: randomBytes(8).toString('hex'), team: t, seed: gameSeed, zone, settings, startedAt: now(), delivered: 0, ended: false,
      members: new Map(),
      cargo: zone.cargo.map((c) => ({ id: c.id, x: c.x, z: c.z, state: 'ground', by: null })),
      flares: new Set(zone.flares.map((f) => f.id)),
      flare: null,
      lockers: new Map(zone.lockers.map((l) => [l.id, null])),
      monsters: zone.monsters.map((m) => ({
        id: m.id, x: m.x, z: m.z, yaw: rand() * Math.PI * 2, mode: 'patrol', path: [], goal: null, timer: 0,
        target: null, memory: 0, lastSeen: null, repath: 0, lured: null, search: null, tried: new Map(),
      })),
      noises: [],
      step: 0,
      captures: 0,
    }
    t.members.forEach((id, i) => {
      const p = playerById(id)
      game.members.set(id, {
        id, name: p?.name ?? '?', verified: !!p?.verified, cookie: p?.cookie ?? null, status: 'arriving',
        spawn: spawns[i], x: spawns[i].x, z: spawns[i].z, at: now(), carrying: null, hidden: null, hiddenAt: 0, seen: false,
        cooldown: 0, flares: 0, noiseAt: 0, sprint: false, glass: null,
        // Chiffres de fin de mission.
        stats: { delivered: 0, spotted: 0, flares: 0, hides: 0, captured: 0 },
        // Reconnexion : le ticket (secret, donné à lui seul), la liaison, la fin du délai d'attente.
        ticket: randomBytes(12).toString('hex'), connected: true, awayUntil: 0, arrivingSince: now(),
      })
    })
    t.status = 'playing'
    t.game = game
    t.ready.clear()
    games.set(game.id, game)
    for (const m of game.members.values()) emit(m.id, 'salvage:start', startMessage(game, m))
    log(`[salvage] mission ${game.id} : ${[...game.members.values()].map((m) => m.name).join(', ')} — ${settings.parcels} colis, ${settings.enemies} ennemi(s)`)
    announce()
  }

  /** Départ (ou retour) d'un membre : la graine, l'équipe, son point d'arrivée et son ticket. */
  function startMessage(game, m) {
    const s = game.settings
    return {
      game: game.id, seed: game.seed, team: s.team, parcels: s.parcels, enemies: s.enemies,
      members: [...game.members.values()].map((o) => ({ id: o.id, name: o.name })),
      spawn: m.spawn, spawns: Object.fromEntries([...game.members.values()].map((o) => [o.id, o.spawn])),
      ticket: m.ticket, status: m.status,
    }
  }

  const gameOf = (p) => teamOf.get(p.id)?.game ?? null
  const memberOf = (p) => gameOf(p)?.members.get(p.id) ?? null
  const toGame = (game, event, data) => {
    for (const m of game.members.values()) if (m.connected) emit(m.id, event, data)
  }
  const tell = (game, data) => toGame(game, 'salvage:event', data)

  /** Bruit dans la baie (course, casier, colis qui tombe) : les ennemis à portée d'oreille viennent voir. */
  function noise(game, at, radius) {
    game.noises.push({ x: at.x, z: at.z, radius })
  }

  /** Le colis porté tombe là où l'on est (sur une tuile où l'on peut le reprendre). */
  function drop(game, m) {
    if (m.carrying === null) return
    const c = game.cargo[m.carrying]
    m.carrying = null
    let t = tileOf(game.zone, m) ?? m.spawn
    if (!walkable(game.zone, t.x, t.z) || inAirlock(game.zone, t)) t = nearestFree(game.zone, m)
    Object.assign(c, { state: 'ground', by: null, x: t.x, z: t.z })
    noise(game, t, RULES.noise.drop)
    tell(game, { kind: 'drop', id: m.id, cargo: c.id, x: c.x, z: c.z })
  }

  function nearestFree(zone, p) {
    let best = null, bestD = Infinity
    for (let z = 0; z < zone.height; z++) {
      for (let x = 0; x < zone.width; x++) {
        if (!walkable(zone, x, z) || zone.room[z * zone.width + x] !== 'z') continue
        const d = Math.hypot(x - p.x, z - p.z)
        if (d < bestD) {
          bestD = d
          best = { x, z }
        }
      }
    }
    return best
  }

  function unhide(game, m, kind = 'unhide') {
    if (m.hidden === null) return
    const locker = game.zone.lockers[m.hidden]
    game.lockers.set(m.hidden, null)
    m.hidden = null
    m.cooldown = now() + RULES.locker.cooldown * 1000
    const front = lockerFront(locker)
    m.x = front.x
    m.z = front.z
    m.at = now()
    noise(game, front, kind === 'eject' ? RULES.noise.eject : RULES.noise.locker)
    tell(game, { kind, id: m.id, locker: locker.id })
  }

  function capture(game, m, monster) {
    if (m.status !== 'alive') return
    if (m.hidden !== null) {
      // Tiré de son casier.
      const locker = game.zone.lockers[m.hidden]
      game.lockers.set(m.hidden, null)
      m.hidden = null
      const front = lockerFront(locker)
      m.x = front.x
      m.z = front.z
    }
    drop(game, m)
    m.status = 'captured'
    m.stats.captured++
    game.captures++
    monster.mode = 'attack'
    monster.timer = M.attack
    monster.path = []
    monster.target = null
    monster.yaw = Math.atan2(m.x - monster.x, m.z - monster.z)
    tell(game, { kind: 'capture', id: m.id, monster: monster.id, x: m.x, z: m.z })
    checkEnd(game)
  }

  function checkEnd(game) {
    if (game.ended) return
    if (game.delivered >= game.settings.parcels) return endGame(game, true)
    // Un joueur déconnecté compte encore, le temps qu'il revienne.
    const active = [...game.members.values()].some((m) => m.status === 'alive' || m.status === 'arriving' || m.status === 'away')
    if (!active) endGame(game, false)
  }

  function endGame(game, won, reason = won ? 'won' : 'lost') {
    game.ended = true
    const duration = Math.round((now() - game.startedAt) / 1000)
    const t = game.team
    games.delete(game.id)
    t.game = null
    t.status = 'forming'
    t.ready.clear()
    const result = {
      game: game.id, won, reason, delivered: game.delivered, parcels: game.settings.parcels, enemies: game.settings.enemies,
      team: game.settings.team, duration,
    }
    // Aux joueurs, la note et les chiffres de la mission ; au site, le résultat seul.
    const report = {
      ...result,
      grade: salvageGrade({ ...result, captures: game.captures }),
      par: salvagePar(game.settings.parcels, game.settings.team),
      captures: game.captures,
      stats: [...game.members.values()].map((m) => ({ id: m.id, name: m.name, ...m.stats })),
    }
    toGame(game, 'salvage:end', report)
    // Membres partis du vaisseau (ou pas encore revenus) : ils quittent l'équipe ; qui revient
    // plus tard apprendra le résultat.
    const absent = new Set([...game.members.values()].filter((m) => !m.connected).map((m) => m.id))
    t.members = t.members.filter((id) => !absent.has(id))
    if (absent.has(t.leader)) t.leader = t.members[0]
    if (!t.members.length) teams.delete(t.id)
    finished.set(game.id, { result: report, tickets: new Set([...game.members.values()].map((m) => m.ticket)), until: now() + KEEP_RESULT })
    log(`[salvage] mission ${game.id} : ${won ? 'réussie' : reason === 'timeout' ? 'annulée' : 'échouée'}, ${game.delivered}/${game.settings.parcels} colis en ${duration} s`)
    announce()
    if (!won) return
    const least = minDuration(game.settings.parcels, game.settings.team)
    if (duration < least) {
      log(`[salvage] mission ${game.id} trop rapide pour être payée (${duration} s, ${least} s au moins) : partie suspecte`)
      for (const m of game.members.values()) if (m.verified && m.cookie) emit(m.id, 'salvage:reward', { game: game.id, earned: 0, refused: 'early' })
      return
    }
    for (const m of game.members.values()) {
      if (!m.verified || !m.cookie) continue
      void reward(m, result).then((r) => {
        if (!r) return
        // Ce que la victoire rapporte sur le site, payée ou non : boosters de la semaine, badge de la zone.
        const site = { boosters: r.boosters || 0, badge: r.badge === true }
        if (r.capped) emit(m.id, 'salvage:reward', { game: game.id, earned: 0, refused: 'max', ...site })
        else emit(m.id, 'salvage:reward', { game: game.id, earned: r.earned, balance: r.balance, ...site })
      }).catch(() => {})
    }
  }

  function gameAction(p, game, action, data) {
    const m = game.members.get(p.id)
    if (!m) return
    const zone = game.zone
    const here = { x: m.x, z: m.z }
    switch (action) {
      case 'salvage:pickup': {
        if (m.status !== 'alive' || m.hidden !== null) return
        if (data.kind === 'cargo') {
          const c = game.cargo[data.id]
          if (!c || c.state !== 'ground' || m.carrying !== null) return error(p, 'cargo')
          if (dist(here, c) > RULES.reach || !zoneSight(zone, here, c)) return error(p, 'far')
          m.carrying = c.id
          c.state = 'carried'
          c.by = m.id
          tell(game, { kind: 'pickup', id: m.id, cargo: c.id })
        } else if (data.kind === 'flare') {
          const f = zone.flares[data.id]
          if (!f || !game.flares.has(f.id)) return error(p, 'flare')
          if (m.flares >= RULES.flare.carry) return error(p, 'full')
          if (dist(here, f) > RULES.reach || !zoneSight(zone, here, f)) return error(p, 'far')
          game.flares.delete(f.id)
          m.flares++
          tell(game, { kind: 'flare-pickup', id: m.id, flare: f.id, count: m.flares })
        }
        return
      }
      case 'salvage:hide': {
        const locker = zone.lockers[data.locker]
        if (m.status !== 'alive' || m.hidden !== null || !locker) return
        if (m.carrying !== null) return error(p, 'carrying')
        if (game.lockers.get(locker.id) !== null) return error(p, 'occupied')
        if (now() < m.cooldown) return error(p, 'cooldown')
        const spot = lockerSpot(locker)
        if (dist(here, spot) > RULES.reach + 0.2 || !zoneSight(zone, here, lockerFront(locker))) return error(p, 'far')
        game.lockers.set(locker.id, m.id)
        m.hidden = locker.id
        m.hiddenAt = now()
        m.stats.hides++
        m.x = spot.x
        m.z = spot.z
        // Le casier protège : seul un poursuivant tout près (il l'a vu s'y glisser sous son nez)
        // viendra le fouiller. Les autres perdent sa trace et vont voir où il était, sans fouiller
        // ce casier-là de sitôt.
        for (const mon of game.monsters) {
          if (mon.mode !== 'chase' || mon.target !== m.id) continue
          if (dist(mon, here) <= RULES.locker.betray && zoneSight(zone, mon, here)) {
            mon.search = locker.id
            mon.mode = 'investigate'
            mon.goal = lockerFront(locker)
            mon.path = []
            mon.target = null
          } else {
            mon.tried.set(locker.id, now() + SEARCH_AGAIN * 1000)
            mon.mode = 'investigate'
            mon.target = null
            routeTo(game, mon, mon.lastSeen ?? here)
          }
        }
        noise(game, spot, RULES.noise.locker)
        tell(game, { kind: 'hide', id: m.id, locker: locker.id })
        return
      }
      case 'salvage:unhide':
        if (m.status === 'alive') unhide(game, m)
        return
      case 'salvage:flare': {
        if (m.status !== 'alive' || m.hidden !== null || m.flares <= 0) return
        if (game.flare && game.flare.until > now()) return error(p, 'burning')
        const x = typeof data.x === 'number' && Number.isFinite(data.x) ? data.x : NaN
        const z = typeof data.z === 'number' && Number.isFinite(data.z) ? data.z : NaN
        const target = { x, z }
        const t = tileOf(zone, target)
        if (!t || !walkable(zone, t.x, t.z) || inAirlock(zone, t)) return error(p, 'far')
        if (dist(here, target) > RULES.flare.range + 0.5 || !zoneSight(zone, here, target)) return error(p, 'far')
        m.flares--
        m.stats.flares++
        game.flare = { x, z, until: now() + RULES.flare.burn * 1000, by: m.id, reach: distances(zone, [t], { monster: true, max: RULES.flare.radius }) }
        tell(game, { kind: 'flare', id: m.id, x, z, burn: RULES.flare.burn, count: m.flares })
        return
      }
      case 'salvage:quit': {
        // Abandon : un joueur actif lâche son colis et quitte la partie ; un joueur capturé
        // arrête de la suivre. Chacun revient au lobby.
        if (m.status === 'alive' || m.status === 'arriving') {
          if (m.hidden !== null) unhide(game, m)
          drop(game, m)
          m.status = 'left'
          tell(game, { kind: 'quit', id: m.id })
          checkEnd(game)
        }
        return
      }
      default:
    }
  }

  function handle(p, action, raw) {
    const data = raw && typeof raw === 'object' ? raw : {}
    if (action === 'salvage:resume') return resume(p, data)
    const game = gameOf(p)
    // Serveur de dev seulement (essais dans le navigateur) : figer les ennemis, en poser un.
    if (action === 'salvage:debug') {
      if (!debug || !game) return
      if (typeof data.freeze === 'boolean') game.frozen = data.freeze
      const mon = game.monsters[data.monster]
      if (mon && Number.isFinite(data.x) && Number.isFinite(data.z) && walkable(game.zone, Math.round(data.x), Math.round(data.z))) {
        Object.assign(mon, { x: data.x, z: data.z, path: [], mode: 'patrol' })
      }
      return
    }
    if (game && action !== 'salvage:create' && action !== 'salvage:join') return gameAction(p, game, action, data)
    if (LOBBY_ACTIONS.has(action)) lobbyAction(p, action, data)
  }

  /**
   * Position reçue d'un joueur dans la baie : acceptée si elle y est plausible (sur le sol, pas
   * plus loin que ne le permet sa vitesse) ; sinon le relais l'ignore.
   */
  function accepts(p, x, z) {
    const game = gameOf(p)
    const m = game?.members.get(p.id)
    if (!m) return false
    if (m.status === 'captured') return true // l'animation de capture, avant le retour au lobby
    if (m.status !== 'alive' && m.status !== 'arriving') return false
    if (m.hidden !== null) return false
    const zone = game.zone
    const t = tileOf(zone, { x, z })
    if (!t || !walkable(zone, t.x, t.z)) return false
    const elapsed = Math.min(2, (now() - m.at) / 1000)
    const speed = RULES.sprint * (m.carrying !== null ? RULES.carry : 1) * 1.25
    if (m.status === 'alive' && Math.hypot(x - m.x, z - m.z) > speed * elapsed + SLACK) return false
    if (m.status === 'arriving' && Math.hypot(x - m.spawn.x, z - m.spawn.z) > 1.5) return false
    return true
  }

  /** Après chaque position acceptée (ou changement de pont) d'un joueur. */
  function moved(p) {
    const t = teamOf.get(p.id)
    if (!t) return
    if (t.status !== 'playing') {
      // Sortir du lobby, c'est quitter l'équipe.
      if (!inLobby(p)) {
        leaveTeam(p)
        unready(t)
        announce()
      }
      return
    }
    const game = t.game
    const m = game.members.get(p.id)
    if (!m) return
    if (p.level !== ZONE_LEVEL) {
      // Revenu au vaisseau en pleine partie sans l'avoir quittée : c'est un abandon.
      if (m.status === 'alive' || (m.status === 'arriving' && now() - m.arrivingSince > ARRIVAL)) gameAction(p, game, 'salvage:quit', {})
      return
    }
    if (m.status === 'arriving') {
      m.status = 'alive'
      tell(game, { kind: 'arrive', id: m.id })
    }
    if (m.status !== 'alive' || m.hidden !== null) return
    m.x = p.x
    m.z = p.z
    m.at = now()
    m.sprint = p.anim === 'sprint'
    // Du verre brisé crisse sous le pied qui s'y pose, même en marchant.
    const step = tileOf(game.zone, m)
    const tile = step ? step.z * game.zone.width + step.x : null
    if (tile !== m.glass) {
      m.glass = tile
      if (floorFx(game.zone, m) === FX.glass) noise(game, m, RULES.noise.glass)
    }
    // Au sas avec un colis : il est livré.
    if (m.carrying !== null && inAirlock(game.zone, m)) {
      const c = game.cargo[m.carrying]
      m.carrying = null
      c.state = 'delivered'
      c.by = null
      game.delivered++
      m.stats.delivered++
      tell(game, { kind: 'deposit', id: m.id, cargo: c.id, delivered: game.delivered })
      checkEnd(game)
      if (!game.ended) {
        // Le monte-charge remonte le colis : ça s'entend devant le sas, et la ruche s'agite.
        for (const d of game.zone.doors) noise(game, { x: d.x + DIRS[d.dir].dx, z: d.z + DIRS[d.dir].dz }, RULES.noise.lift)
        tell(game, { kind: 'hive', level: agitation(game) })
      }
    }
  }

  /**
   * Départ du vaisseau (déconnexion). En pleine course : le colis tombe, et la place attend son
   * joueur une minute (il revient avec son ticket, cf. resume) ; capturé : il pourra revenir
   * suivre son équipe.
   */
  function leave(p) {
    const t = teamOf.get(p.id)
    if (!t) return
    teamOf.delete(p.id)
    const game = t.game
    const m = game?.members.get(p.id)
    if (!m) {
      teamOf.set(p.id, t)
      leaveTeam(p)
      unready(t)
      return announce()
    }
    m.connected = false
    if (m.hidden !== null) {
      game.lockers.set(m.hidden, null)
      m.hidden = null
    }
    if (m.status === 'alive' || m.status === 'arriving') {
      drop(game, m)
      m.status = 'away'
      m.awayUntil = now() + RULES.reconnect * 1000
      tell(game, { kind: 'away', id: m.id, wait: RULES.reconnect })
    } else if (m.status === 'left') m.status = 'gone'
    checkEnd(game)
    announce()
  }

  /**
   * Retour d'un membre après une déconnexion (nouvel id de joueur, même ticket) : il retrouve sa
   * place ; en course, il repart du sas d'extraction.
   */
  function resume(p, data) {
    const ticket = typeof data.ticket === 'string' ? data.ticket : ''
    const game = games.get(data.game)
    if (!game) {
      const done = finished.get(data.game)
      if (done && done.tickets.has(ticket)) emit(p.id, 'salvage:end', { ...done.result, late: true })
      else emit(p.id, 'salvage:error', { code: 'resume' })
      return
    }
    const m = ticket ? [...game.members.values()].find((x) => x.ticket === ticket) : null
    // Encore joué depuis un autre onglet : on ne lui prend pas sa place (et l'on garde le ticket).
    if (m?.connected) return error(p, 'elsewhere')
    if (!m || m.status === 'gone' || m.status === 'left' || gameOf(p)) return error(p, 'resume')
    // La place d'un CMDR ne revient qu'à lui (un autre compte sur le même navigateur, par exemple).
    if (m.verified && (!p.verified || p.name !== m.name)) return error(p, 'resume')
    if (p.cookie) m.cookie = p.cookie
    if (teamOf.has(p.id)) {
      const t = teamOf.get(p.id)
      leaveTeam(p)
      unready(t)
    }
    const old = m.id
    game.members.delete(old)
    m.id = p.id
    m.connected = true
    game.members.set(p.id, m)
    const t = game.team
    t.members = t.members.map((id) => (id === old ? p.id : id))
    if (t.leader === old) t.leader = p.id
    teamOf.set(p.id, t)
    for (const mon of game.monsters) if (mon.target === old) mon.target = null
    if (m.status === 'away') {
      const pad = game.zone.airlock.pad
      Object.assign(m, { status: 'arriving', spawn: { x: pad.x, z: pad.z }, x: pad.x, z: pad.z, at: now(), arrivingSince: now() })
    }
    emit(p.id, 'salvage:start', { ...startMessage(game, m), resumed: true })
    tell(game, { kind: 'back', id: p.id, old })
    log(`[salvage] mission ${game.id} : ${m.name} est revenu (${m.status})`)
    announce()
  }

  /** Membres de la même partie en cours (pour limiter la vue, le chat et les emotes à l'équipe). */
  function teammates(p) {
    const game = gameOf(p)
    if (!game) return new Set()
    return new Set([...game.members.values()].filter((m) => m.status !== 'gone').map((m) => m.id))
  }

  // ------------------------------------------------------------------ ennemis

  /** La ruche s'agite : 0 au départ, 1 quand il ne reste qu'un colis à livrer (et après). */
  function agitation(game) {
    return Math.min(1, game.delivered / Math.max(1, game.settings.parcels - 1))
  }

  function visible(game, mon, m) {
    if (m.status !== 'alive' || m.hidden !== null || inAirlock(game.zone, m)) return false
    const d = dist(mon, m)
    // Dans une zone éclairée, on se voit de loin.
    if (d > (isLit(game.zone, m) ? M.litSight : M.sight)) return false
    if (d > M.sense) {
      const fx = Math.sin(mon.yaw), fz = Math.cos(mon.yaw)
      if (((m.x - mon.x) * fx + (m.z - mon.z) * fz) / d < M.fov) return false
    }
    return zoneSight(game.zone, mon, m)
  }

  function randomGoal(game, mon) {
    const zone = game.zone
    const alive = [...game.members.values()].filter((m) => m.status === 'alive' && m.hidden === null)
    // Une fois sur trois, les ennemis rôdent du côté des joueurs (sans savoir où ils sont
    // exactement) ; plus souvent quand la ruche s'agite.
    const near = alive.length && random() < 0.33 + RULES.hive.roam * agitation(game) ? alive[Math.floor(random() * alive.length)] : null
    for (let i = 0; i < 40; i++) {
      const x = near ? Math.round(near.x + (random() - 0.5) * 12) : Math.floor(random() * zone.width)
      const z = near ? Math.round(near.z + (random() - 0.5) * 12) : Math.floor(random() * zone.height)
      if (!walkable(zone, x, z) || zone.room[z * zone.width + x] !== 'z') continue
      if (Math.abs(x - mon.x) + Math.abs(z - mon.z) < 4) continue
      return { x, z }
    }
    return nearestFree(zone, mon)
  }

  function routeTo(game, mon, goal) {
    const tiles = findPath(game.zone, mon, goal, { monster: true })
    mon.goal = goal
    if (!tiles) {
      mon.path = []
      return false
    }
    mon.path = smoothPath(game.zone, mon, tiles.slice(1))
    // Dernier point : la cible exacte (le joueur n'est pas au centre de sa tuile).
    if (mon.path.length && walkable(game.zone, Math.round(goal.x), Math.round(goal.z))) mon.path[mon.path.length - 1] = { x: goal.x, z: goal.z }
    return true
  }

  function walk(mon, speed, dt) {
    let budget = speed * dt
    while (budget > 0 && mon.path.length) {
      const next = mon.path[0]
      const dx = next.x - mon.x, dz = next.z - mon.z
      const d = Math.hypot(dx, dz)
      if (d > 1e-4) mon.yaw = Math.atan2(dx, dz)
      if (d <= budget) {
        mon.x = next.x
        mon.z = next.z
        budget -= d
        mon.path.shift()
      } else {
        mon.x += (dx / d) * budget
        mon.z += (dz / d) * budget
        budget = 0
      }
    }
    return mon.path.length === 0
  }

  function stepMonster(game, mon, dt) {
    const zone = game.zone
    const t = now()
    if (mon.mode === 'attack') {
      if ((mon.timer -= dt) <= 0) {
        mon.mode = 'patrol'
        mon.path = []
      }
      return
    }
    if (mon.mode === 'search') {
      if ((mon.timer -= dt) > 0) return
      const lockerId = mon.search
      mon.search = null
      const occupant = game.lockers.get(lockerId)
      const m = occupant !== null && occupant !== undefined ? game.members.get(occupant) : null
      tell(game, { kind: 'searched', monster: mon.id, locker: lockerId, found: !!m })
      if (m) return capture(game, m, mon)
      mon.mode = 'look'
      mon.timer = M.look * 0.5
      return
    }

    // Fusée d'appel : les ennemis à portée y vont, et ignorent les joueurs le temps qu'elle brûle.
    const flare = game.flare && game.flare.until > t ? game.flare : null
    const mt = tileOf(zone, mon)
    if (flare && mon.mode !== 'lured' && mt && flare.reach[mt.z * zone.width + mt.x] >= 0) {
      mon.mode = 'lured'
      mon.lured = flare
      mon.target = null
      mon.search = null
      routeTo(game, mon, flare)
    }
    if (mon.mode === 'lured') {
      if (!flare || mon.lured !== flare) {
        // La fusée s'est éteinte : il fouille un peu autour, puis repart.
        mon.mode = 'look'
        mon.timer = M.look
        mon.lured = null
      } else {
        if (walk(mon, M.lured, dt)) mon.yaw += dt * 1.5
        return
      }
    }

    // Vue : le plus proche des joueurs qu'il voit.
    let seen = null
    for (const m of game.members.values()) {
      if (t - game.startedAt < RULES.grace * 1000) break
      if (visible(game, mon, m) && (!seen || dist(mon, m) < dist(mon, seen))) seen = m
    }
    if (seen) {
      if (mon.mode !== 'chase') {
        seen.stats.spotted++
        tell(game, { kind: 'spotted', monster: mon.id, id: seen.id })
      }
      mon.mode = 'chase'
      mon.target = seen.id
      mon.memory = M.memory
      mon.lastSeen = { x: seen.x, z: seen.z }
      mon.search = null
    } else if (mon.mode === 'chase') {
      mon.memory -= dt
      if (mon.memory <= 0) {
        mon.mode = 'investigate'
        mon.target = null
        routeTo(game, mon, mon.lastSeen ?? mon)
      }
    }

    // Ouïe : un bruit à portée (en chemin dans le labyrinthe), s'il ne poursuit personne.
    if (mon.mode !== 'chase' && game.noises.length && mt) {
      let heard = null
      const ears = 1 + RULES.hive.hearing * agitation(game)
      for (const n of game.noises) {
        const radius = n.radius * ears
        const d = n.reach ?? (n.reach = distances(zone, [n], { hear: true, max: Math.ceil(radius) }))
        const k = d[mt.z * zone.width + mt.x]
        if (k >= 0 && k <= radius && (!heard || k < heard.k)) heard = { n, k }
      }
      if (heard && mon.search === null) {
        if (mon.mode !== 'investigate') tell(game, { kind: 'heard', monster: mon.id })
        mon.mode = 'investigate'
        routeTo(game, mon, heard.n)
      }
    }

    // Un casier occupé tout près, qu'il n'a pas vu : parfois, il le fouille.
    if ((mon.mode === 'patrol' || mon.mode === 'investigate') && mon.search === null) {
      for (const [lockerId, occupant] of game.lockers) {
        if (occupant === null) continue
        const front = lockerFront(zone.lockers[lockerId])
        if (dist(mon, front) > 1.2) continue
        if ((mon.tried.get(lockerId) ?? 0) > t) continue
        mon.tried.set(lockerId, t + SEARCH_AGAIN * 1000)
        if (random() < SEARCH_CHANCE) {
          mon.search = lockerId
          mon.mode = 'investigate'
          routeTo(game, mon, front)
        }
        break
      }
    }

    switch (mon.mode) {
      case 'chase': {
        const m = game.members.get(mon.target)
        const goal = m && m.status === 'alive' && m.hidden === null ? m : mon.lastSeen
        if ((mon.repath -= dt) <= 0 || !mon.path.length) {
          mon.repath = 0.35
          if (goal) routeTo(game, mon, goal)
        }
        walk(mon, M.chase, dt)
        break
      }
      case 'investigate':
        if (walk(mon, mon.search !== null ? M.chase * 0.8 : M.investigate * (1 + RULES.hive.speed * agitation(game)), dt)) {
          if (mon.search !== null) {
            const locker = zone.lockers[mon.search]
            mon.yaw = Math.atan2(DIRS[locker.dir].dx, DIRS[locker.dir].dz)
            mon.mode = 'search'
            mon.timer = M.search
            tell(game, { kind: 'search', monster: mon.id, locker: mon.search })
          } else {
            mon.mode = 'look'
            mon.timer = M.look
          }
        }
        break
      case 'look':
        mon.yaw += dt * 1.2 * Math.sin(t / 700)
        if ((mon.timer -= dt) <= 0) {
          mon.mode = 'patrol'
          mon.path = []
        }
        break
      default: // patrouille
        if (!mon.path.length) routeTo(game, mon, randomGoal(game, mon))
        walk(mon, M.patrol * (1 + RULES.hive.speed * agitation(game)), dt)
    }

    // Capture : au contact d'un joueur actif, visible, hors du sas.
    if (t - game.startedAt >= RULES.grace * 1000) {
      for (const m of game.members.values()) {
        if (m.status !== 'alive' || m.hidden !== null || inAirlock(zone, m)) continue
        if (dist(mon, m) <= M.touch) return capture(game, m, mon)
      }
    }
  }

  function stepGame(game, dt) {
    const t = now()
    const zone = game.zone
    // Déconnectés trop longtemps : ils ne reviendront plus dans cette partie.
    for (const m of game.members.values()) {
      if (m.status !== 'away' || t < m.awayUntil) continue
      m.status = 'gone'
      tell(game, { kind: 'gone', id: m.id })
      checkEnd(game)
      if (game.ended) return
    }
    // Bruits de course : un pas sonore de temps en temps, plus fort avec un colis.
    for (const m of game.members.values()) {
      if (m.status !== 'alive' || m.hidden !== null || !m.sprint) continue
      if (t - m.at > 400) m.sprint = false
      if (t < m.noiseAt) continue
      m.noiseAt = t + STEP_NOISE * 1000
      noise(game, m, m.carrying !== null ? RULES.noise.carrySprint : RULES.noise.sprint)
    }
    // Casiers : on n'y reste pas plus que la durée maximale.
    for (const m of game.members.values()) {
      if (m.hidden !== null && t - m.hiddenAt > RULES.locker.max * 1000) unhide(game, m, 'eject')
    }
    if (game.flare && game.flare.until <= t) {
      tell(game, { kind: 'flare-out' })
      game.flare = null
    }
    for (const mon of game.frozen ? [] : game.monsters) {
      stepMonster(game, mon, dt)
      if (game.ended) return
    }
    game.noises.length = 0
    if (t - game.startedAt > RULES.maxDuration * 1000) return endGame(game, false, 'timeout')
    // L'état de la partie, pour chaque membre (les capturés la suivent par les caméras).
    const hidden = new Map([...game.lockers].filter(([, id]) => id !== null).map(([l, id]) => [id, l]))
    toGame(game, 'salvage:state', {
      game: game.id,
      monsters: game.monsters.map((mon) => ({ id: mon.id, x: round2(mon.x), z: round2(mon.z), yaw: round2(mon.yaw), mode: mon.mode })),
      members: [...game.members.values()].map((m) => ({
        id: m.id, status: m.status, carrying: m.carrying, hidden: hidden.get(m.id) ?? null,
        left: m.hidden !== null ? Math.max(0, RULES.locker.max - (t - m.hiddenAt) / 1000) : undefined, flares: m.flares,
      })),
      cargo: game.cargo.map((c) => ({ id: c.id, state: c.state, x: c.x, z: c.z })),
      flares: [...game.flares],
      flare: game.flare ? { x: game.flare.x, z: game.flare.z, left: Math.max(0, (game.flare.until - t) / 1000) } : null,
      lockers: [...game.lockers].filter(([, id]) => id !== null).map(([l]) => l),
      searching: game.monsters.filter((mon) => mon.mode === 'search').map((mon) => mon.search),
      delivered: game.delivered,
      hive: Math.round(agitation(game) * 100) / 100,
      elapsed: Math.round((t - game.startedAt) / 100) / 10,
    })
  }

  /** Un pas de simulation (dt en secondes) : départs des équipes prêtes, puis chaque partie. */
  function tick(dt) {
    const t = now()
    for (const [id, done] of finished) if (done.until < t) finished.delete(id)
    for (const team of [...teams.values()]) {
      if (team.status === 'countdown' && team.startAt <= t) startGame(team)
    }
    for (const game of [...games.values()]) stepGame(game, dt)
  }

  return { snapshot, handle, accepts, moved, leave, teammates, tick, gameOf, inZone: (p) => p.level === ZONE_LEVEL && !!memberOf(p) }
}

const round2 = (v) => Math.round(v * 100) / 100
