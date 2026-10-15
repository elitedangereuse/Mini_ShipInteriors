// MESS RUSH côté relais : les salons du mess (server/lobby.js), et chaque partie, dans son instance
// (MESS_LEVEL), dont le relais fait autorité (cf. docs/mess-rush.md).
//
// Salon : au vrai mess du pont principal, on prend le service au rail des bons ; on garde sa place
// tant qu'on reste dans le mess. Quand tous sont prêts, un compte à rebours, puis l'équipe part
// dans la cuisine (un joueur qui n'y est pas arrivé à temps est retiré).
//
// Partie : les règles sont dans shared/mess-rush.js. Le relais tient l'état, arbitre chaque action
// une à une (E : `mess:use`, Espace : `mess:work`), vérifie que le joueur est au poste (sa dernière
// position acceptée), fait avancer les gestes, les cuissons et les commandes dix fois par seconde,
// et envoie l'état à l'équipe quand il change. La cuisine est ouverte : chacun va où il veut.
//
// Fin : à la fin du service, chacun reçoit le résultat ; chaque membre CMDR encore là (ou parti
// depuis moins d'une minute) est présenté au site (`reward`), qui décide de la récompense (cf.
// docs/mess-rush-site.md). Un service abandonné (plus personne en cuisine) n'a pas de résultat.
//
// Reconnexion : au départ, chaque membre reçoit un ticket. Déconnecté, il pose ce qu'il tenait et
// sa place l'attend une minute ; avec son ticket, il revient dans l'allée de la cuisine. Une partie
// finie entre-temps : on lui en donne le résultat (gardé dix minutes).

import { randomBytes } from 'node:crypto'
import { ShipMap } from '../shared/ship-map.js'
import { SHIP_LAYOUTS, shipMapOptions } from '../shared/ship-layouts.js'
import {
  MESS_LEVEL, MESS_LOBBY, MESS_SPAWNS, RULES, STATION_BY_ID, createService, dropHeld, onMessFloor, serviceResult, serviceView,
  stepService, stopWork, useStation, workStation,
} from '../shared/mess-rush.js'
import { RECIPES } from '../shared/mess-rush-catalog.js'
import { createLobby } from './lobby.js'

const DECK = new ShipMap(SHIP_LAYOUTS[String(MESS_LOBBY.level)], shipMapOptions(MESS_LOBBY.level))
/**
 * Une position plus lointaine que la vitesse ne le permet est ignorée : la course permise est une
 * réserve (marge de départ en mètres) qui se recharge au rythme de la course, deux secondes au
 * plus, et que chaque position use ; une rafale de positions ne la cumule donc pas.
 */
const SLACK = 0.9
/**
 * La course (cf. src/player.ts), avec de la marge pour le retard du réseau. Le Night Conda de
 * Jacques ne compte pas : les effets des cocktails s'arrêtent quand une partie commence (cf.
 * src/bar.ts).
 */
const SPRINT = 3.4 * 1.25
/**
 * Le site ne répond pas (ou est en erreur) : on lui représente la même victoire après ces délais (s).
 * Sans risque : il ne paie qu'une fois par partie et par CMDR, et rend la réponse déjà donnée.
 */
export const REWARD_RETRIES = [5, 30, 120]

/** Évènements des salons et de la partie. */
export const MESS_ACTIONS = new Set(['mess:join', 'mess:leave', 'mess:ready', 'mess:resume', 'mess:use', 'mess:work', 'mess:stop', 'mess:quit'])

/** Joueur au vrai mess, là où se tiennent les salons ? */
export function inMessLobby(p) {
  return p.level === MESS_LOBBY.level && DECK.room(Math.round(p.x), Math.round(p.z)) === MESS_LOBBY.room
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

/**
 * @param {object} o
 * @param {(id: number) => object | undefined} o.playerById
 * @param {(id: number, event: string, data: object) => void} o.emit
 * @param {(event: string, data: object) => void} o.broadcast
 * @param {((member: object, result: object) => Promise<object | null>) | null} [o.reward] présente la victoire d'un CMDR au site ;
 *   sans elle, les victoires ne sont présentées à personne (le site n'est pas prêt)
 * @param {() => number} [o.now]
 * @param {() => number} [o.seed]
 * @param {string[]} [o.recipes] les recettes en jeu (toute la carte par défaut)
 * @param {boolean} [o.debug] serveur de dev : `mess:debug` raccourcit le service, choisit les recettes, fixe le score
 * @param {(fn: () => void, ms: number) => void} [o.later] programme une nouvelle tentative auprès du site
 */
export function createMessRush({
  playerById, emit, broadcast, reward = null, now = Date.now, log = () => {}, seed = () => randomBytes(4).readUInt32LE(0), recipes, debug = false,
  later = (fn, ms) => setTimeout(fn, ms).unref?.(),
}) {
  const games = new Map() // id de partie -> partie
  const finished = new Map() // id de partie -> { report, tickets, until }
  const lobby = createLobby({
    name: 'mess', count: RULES.lobbies, size: RULES.team, countdown: RULES.countdown, inLobby: inMessLobby, playerById, emit, broadcast, now,
    extra: (t) => (t.game ? { score: t.game.state.score, endsIn: Math.max(0, Math.round((t.game.state.endsAt - now()) / 1000)) } : {}),
  })
  const error = (p, code) => emit(p.id, 'mess:error', { code })

  const gameOf = (p) => lobby.teamOf(p)?.game ?? null
  // Ceux qui ont quitté le service (ou n'y sont jamais arrivés) n'en entendent plus parler : ils
  // sont peut-être déjà dans un autre.
  const stillIn = (m) => m.connected && m.status !== 'left' && m.status !== 'gone'
  const toGame = (game, event, data) => {
    for (const m of game.members.values()) if (stillIn(m)) emit(m.id, event, data)
  }

  // ------------------------------------------------------------------ départ

  function startGame(t) {
    const id = randomBytes(8).toString('hex')
    const state = createService({ id, seed: seed(), players: t.members.length, now: now(), ...(recipes ? { recipes } : {}) })
    const game = { id, team: t, state, members: new Map(), ended: false, last: now(), dirty: true, tick: 0 }
    t.members.forEach((pid, i) => {
      const p = playerById(pid)
      // Chacun arrive à sa place, au même rang que dans le salon.
      const spawn = MESS_SPAWNS[i % MESS_SPAWNS.length]
      game.members.set(pid, {
        id: pid, name: p?.name ?? '?', verified: !!p?.verified, cookie: p?.cookie ?? null,
        status: 'arriving', spawn, x: spawn.x, z: spawn.z, at: now(), stride: SLACK, arrivingSince: now(),
        ticket: randomBytes(12).toString('hex'), connected: true, awayUntil: 0,
      })
    })
    games.set(id, game)
    lobby.playing(t, game)
    for (const m of game.members.values()) emit(m.id, 'mess:start', startMessage(game, m))
    log(`[mess-rush] service ${id} : ${[...game.members.values()].map((m) => m.name).join(', ')}`)
  }

  /** Départ (ou retour) d'un membre : la partie, son point d'arrivée, son ticket et l'état. */
  function startMessage(game, m) {
    return {
      game: game.id, now: now(), spawn: m.spawn, ticket: m.ticket, you: String(m.id),
      members: [...game.members.values()].map((o) => ({ id: String(o.id), name: o.name, status: o.status })),
      state: serviceView(game.state),
    }
  }

  // ------------------------------------------------------------------ partie

  /** Le membre est-il à portée de ce poste (sa dernière position acceptée) ? */
  function near(game, pid, stationId) {
    const m = game.members.get(Number(pid)) ?? game.members.get(pid)
    const s = STATION_BY_ID[stationId]
    return !!m && !!s && m.status === 'in' && dist(m, s) <= RULES.reach
  }

  /** Ce qui s'est passé : à l'équipe, avec l'état qui a changé. */
  function tell(game, events) {
    if (!events.length) return
    game.dirty = true
    toGame(game, 'mess:event', { game: game.id, events })
  }

  function gameAction(p, game, action, data) {
    const m = game.members.get(p.id)
    if (!m || game.ended) return
    const pid = String(p.id)
    if (action === 'mess:quit') return quit(game, m)
    if (m.status !== 'in') return
    if (action === 'mess:stop') {
      stopWork(game.state, pid)
      game.dirty = true
      return
    }
    const station = typeof data.station === 'string' ? data.station : ''
    if (!STATION_BY_ID[station]) return
    const refuse = (code) => emit(p.id, 'mess:refused', { game: game.id, station, code })
    if (!near(game, pid, station)) return refuse('far')
    const t = now()
    const r = action === 'mess:use'
      ? useStation(game.state, pid, station, typeof data.pick === 'string' ? data.pick : undefined, t)
      : action === 'mess:work' ? workStation(game.state, pid, station, t) : null
    if (!r) return
    if (!r.ok) return refuse(r.code)
    game.dirty = true
    tell(game, r.events)
  }

  /**
   * Un membre abandonne (« Quitter le service ») : il pose ce qu'il tenait, rentre au mess, et peut
   * se placer dans un autre salon ; l'équipe continue sans lui.
   */
  function quit(game, m) {
    if (m.status === 'left' || m.status === 'gone') return
    tell(game, dropHeld(game.state, String(m.id)))
    m.status = 'left'
    lobby.release({ id: m.id })
    emit(m.id, 'mess:left', { game: game.id })
    tell(game, [{ kind: 'left', by: String(m.id) }])
    checkAbandon(game)
  }

  /** Plus personne en cuisine (ni en route, ni attendu) : le service est abandonné, sans résultat. */
  function checkAbandon(game) {
    if (game.ended) return
    const active = [...game.members.values()].some((m) => m.status === 'in' || m.status === 'arriving' || m.status === 'away')
    if (!active) endGame(game, 'abandoned')
  }

  function endGame(game, reason) {
    if (game.ended) return
    game.ended = true
    games.delete(game.id)
    const state = game.state
    const result = reason === 'end' ? serviceResult(state) : null
    const report = {
      game: game.id, reason, ...(result ?? { score: state.score, served: state.served, expired: state.expired, bestCombo: state.bestCombo, wasted: state.wasted, players: state.players }),
      members: [...game.members.values()].map((m) => ({ id: String(m.id), name: m.name, status: m.status })),
      orders: state.orders.map((o) => ({ id: o.id, recipe: o.recipe, status: o.status, points: o.points ?? 0 })),
    }
    // La victoire : chaque membre CMDR encore là, ou parti depuis moins d'une minute, est présenté au
    // site ; le résultat lui dit que sa récompense est en route (`rewarding`), puis vient ce que le
    // site a confirmé. Les autres savent qu'il n'y en aura pas.
    const presented = new Set(result?.won && reward
      ? [...game.members.values()].filter((m) => m.verified && m.cookie && m.status !== 'left' && m.status !== 'gone').map((m) => m.ticket)
      : [])
    for (const m of game.members.values()) if (stillIn(m)) emit(m.id, 'mess:end', { ...report, rewarding: presented.has(m.ticket) })
    // Membres partis (ou pas encore revenus) : ils quittent le salon ; qui revient apprendra le résultat.
    lobby.finish(game.team, new Set([...game.members.values()].filter(stillIn).map((m) => m.id)))
    // `to` : où envoyer la réponse du site à qui est revenu (nouvel id de joueur) avant qu'elle arrive.
    finished.set(game.id, {
      report, tickets: new Set([...game.members.values()].map((m) => m.ticket)), presented, rewards: new Map(), to: new Map(), until: now() + RULES.keepResult * 1000,
    })
    log(`[mess-rush] service ${game.id} : ${reason === 'end' ? `${result.score} points, médaille ${result.medal}, ${result.served} servies, ${result.expired} expirées` : 'abandonné'}`)
    for (const m of game.members.values()) {
      if (!presented.has(m.ticket)) continue
      emit(m.id, 'mess:reward', { game: game.id, status: 'pending' })
      present(game.id, m, result, 0)
    }
  }

  /**
   * Présente la victoire d'un membre au site ; s'il ne répond pas, on réessaie (REWARD_RETRIES),
   * puis on dit au joueur que rien n'est confirmé. La réponse est gardée avec le résultat, pour qui
   * revient après la fin.
   */
  function present(id, m, result, attempt) {
    void Promise.resolve().then(() => reward(m, result)).catch(() => ({ status: 'retry' })).then((r) => {
      if (r?.status === 'retry' && attempt < REWARD_RETRIES.length) return later(() => present(id, m, result, attempt + 1), REWARD_RETRIES[attempt] * 1000)
      const out = { game: id, ...(r && r.status !== 'retry' ? r : { status: 'failed' }) }
      if (out.status === 'failed') log(`[mess-rush] partie ${id} : la victoire de ${m.name} n'a pas pu être présentée au site`)
      const done = finished.get(id)
      done?.rewards.set(m.ticket, out)
      emit(done?.to.get(m.ticket) ?? m.id, 'mess:reward', out)
    })
  }

  function stepGame(game) {
    const t = now()
    const dt = Math.min(0.5, (t - game.last) / 1000)
    game.last = t
    // Déconnectés trop longtemps, ou jamais arrivés : ils ne reviendront plus dans cette partie.
    for (const m of game.members.values()) {
      const late = m.status === 'arriving' && t - m.arrivingSince > RULES.arrival * 1000
      if (!(m.status === 'away' && t >= m.awayUntil) && !late) continue
      if (late) dropHeld(game.state, String(m.id))
      m.status = 'gone'
      if (late) {
        lobby.release({ id: m.id })
        emit(m.id, 'mess:left', { game: game.id })
      }
      tell(game, [{ kind: 'gone', by: String(m.id) }])
      game.dirty = true
    }
    checkAbandon(game)
    if (game.ended) return
    const events = stepService(game.state, t, dt, (pid, sid) => near(game, pid, sid))
    tell(game, events)
    if (game.state.status === 'ended') {
      game.dirty = true
      sendState(game)
      return endGame(game, 'end')
    }
    // L'état : quand il change ; pendant un geste ou un imprévu, cinq fois par seconde (les jauges
    // avancent, la surchauffe presse les cuissons).
    game.tick++
    const live = Object.keys(game.state.work).length > 0 || !!game.state.event
    if (game.dirty || (live && game.tick % 2 === 0)) sendState(game)
  }

  function sendState(game) {
    game.dirty = false
    toGame(game, 'mess:state', {
      game: game.id, now: now(), state: serviceView(game.state),
      members: [...game.members.values()].map((m) => ({ id: String(m.id), name: m.name, status: m.status })),
    })
  }

  // ------------------------------------------------------------------ joueurs

  /**
   * Position reçue d'un joueur dans la cuisine : acceptée si elle y est plausible (sur le sol de la
   * cuisine, pas plus loin que ne le permet la course ; à l'arrivée, près de son point d'arrivée).
   */
  function accepts(p, x, z) {
    const game = gameOf(p)
    const m = game?.members.get(p.id)
    if (!m || (m.status !== 'in' && m.status !== 'arriving')) return false
    if (!onMessFloor(x, z)) return false
    if (m.status === 'arriving') return Math.hypot(x - m.spawn.x, z - m.spawn.z) <= 1.5
    return Math.hypot(x - m.x, z - m.z) <= stride(m)
  }

  /** La course permise d'un membre depuis sa dernière position acceptée (cf. SLACK). */
  function stride(m) {
    return Math.min(SPRINT * 2 + SLACK, m.stride + SPRINT * Math.max(0, now() - m.at) / 1000)
  }

  /** Après chaque position acceptée (ou changement de pont) d'un joueur. */
  function moved(p) {
    const t = lobby.teamOf(p)
    if (!t) return
    if (t.status !== 'playing') return lobby.moved(p)
    const game = t.game
    const m = game.members.get(p.id)
    if (!m) return
    if (p.level !== MESS_LEVEL) {
      // Revenu au vaisseau en plein service sans l'avoir quitté : c'est un abandon.
      if (m.status === 'in') quit(game, m)
      return
    }
    const arrived = m.status === 'arriving'
    if (arrived) {
      m.status = 'in'
      tell(game, [{ kind: 'arrive', by: String(m.id) }])
    }
    if (m.status !== 'in') return
    m.stride = arrived ? SLACK : Math.max(0, stride(m) - Math.hypot(p.x - m.x, p.z - m.z))
    m.x = p.x
    m.z = p.z
    m.at = now()
  }

  /** Départ du vaisseau (déconnexion) : en partie, la place attend une minute (cf. resume). */
  function leave(p) {
    const t = lobby.teamOf(p)
    if (!t) return
    const game = t.game
    const m = game?.members.get(p.id)
    if (!m) return lobby.remove(p)
    m.connected = false
    if (m.status === 'in' || m.status === 'arriving') {
      tell(game, dropHeld(game.state, String(m.id)))
      m.status = 'away'
      m.awayUntil = now() + RULES.reconnect * 1000
      tell(game, [{ kind: 'away', by: String(m.id), wait: RULES.reconnect }])
    }
    checkAbandon(game)
    lobby.announce()
  }

  /**
   * Retour d'un membre après une déconnexion (nouvel id de joueur, même ticket) : il retrouve sa
   * place, dans l'allée de la cuisine.
   */
  function resume(p, data) {
    const ticket = typeof data.ticket === 'string' ? data.ticket : ''
    const game = games.get(data.game)
    if (!game) {
      const done = finished.get(data.game)
      if (done && ticket && done.tickets.has(ticket)) {
        const rewarding = done.presented.has(ticket)
        emit(p.id, 'mess:end', { ...done.report, late: true, rewarding })
        // La réponse du site, ou, si elle n'est pas encore là, l'attente : elle suivra ici.
        if (rewarding) {
          done.to.set(ticket, p.id)
          emit(p.id, 'mess:reward', done.rewards.get(ticket) ?? { game: data.game, status: 'pending' })
        }
      } else error(p, 'resume')
      return
    }
    const m = ticket ? [...game.members.values()].find((x) => x.ticket === ticket) : null
    // Encore joué depuis un autre onglet : on ne lui prend pas sa place.
    if (m?.connected) return error(p, 'elsewhere')
    if (!m || m.status !== 'away' || gameOf(p)) return error(p, 'resume')
    // La place d'un CMDR ne revient qu'à lui.
    if (m.verified && (!p.verified || p.name !== m.name)) return error(p, 'resume')
    if (p.cookie) m.cookie = p.cookie
    if (lobby.teamOf(p)) lobby.leaveTeam(p)
    const old = m.id
    game.members.delete(old)
    m.id = p.id
    m.connected = true
    game.members.set(p.id, m)
    lobby.rename(game.team, old, p.id)
    // Sa main (vide : il a tout posé en partant) suit son nouvel identifiant.
    delete game.state.hands[String(old)]
    Object.assign(m, { status: 'arriving', x: m.spawn.x, z: m.spawn.z, at: now(), arrivingSince: now() })
    emit(p.id, 'mess:start', { ...startMessage(game, m), resumed: true })
    tell(game, [{ kind: 'back', by: String(p.id), old: String(old) }])
    log(`[mess-rush] service ${game.id} : ${m.name} est revenu`)
    lobby.announce()
  }

  function handle(p, action, raw) {
    const data = raw && typeof raw === 'object' ? raw : {}
    if (action === 'mess:resume') return resume(p, data)
    const game = gameOf(p)
    // Serveur de dev seulement (essais dans le navigateur) : finir le service dans `endIn` secondes,
    // ne tirer que certaines recettes, fixer le score.
    if (action === 'mess:debug') {
      if (!debug || !game) return
      const t = now()
      if (Number.isFinite(data.endIn)) game.state.endsAt = t + Math.max(1, data.endIn) * 1000
      if (Array.isArray(data.recipes)) {
        const known = data.recipes.filter((r) => typeof r === 'string' && Object.hasOwn(RECIPES, r))
        if (known.length) game.state.recipes = known
      }
      if (Number.isInteger(data.score) && data.score >= 0) game.state.score = data.score
      game.dirty = true
      return
    }
    if (game) {
      if (action === 'mess:join' || action === 'mess:leave' || action === 'mess:ready') return error(p, 'playing')
      return gameAction(p, game, action, data)
    }
    if (action === 'mess:join' || action === 'mess:leave' || action === 'mess:ready') lobby.action(p, action.slice(5), data)
  }

  /** Membres de la même partie en cours (pour limiter la vue, le chat et les emotes à l'équipe). */
  function mates(p) {
    const game = gameOf(p)
    if (!game) return new Set()
    return new Set([...game.members.values()].filter((m) => m.status !== 'gone' && m.status !== 'left').map((m) => m.id))
  }

  /** Un pas (toutes les 100 ms) : départs des salons prêts, puis chaque partie. */
  function tick() {
    const t = now()
    for (const [id, done] of finished) if (done.until < t) finished.delete(id)
    for (const team of lobby.due()) startGame(team)
    for (const game of [...games.values()]) stepGame(game)
  }

  return { snapshot: lobby.snapshot, handle, accepts, moved, leave, mates, tick, gameOf, inKitchen: (p) => p.level === MESS_LEVEL && !!gameOf(p) }
}
