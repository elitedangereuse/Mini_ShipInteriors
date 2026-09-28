// Relais multijoueur minimal (socket.io) : chaque client annonce sa position, ses messages
// et ses emotes ; le serveur valide, mémorise l'état et le rediffuse aux autres.
// Utilisé par le serveur de dev (plugin Vite) et par server/index.js en production.
//
// Identité : le jeu est servi sur le domaine du site, la poignée de main emporte donc le cookie
// ED_LOGGED_CMDR_ID. Le relais le fait reconnaître par le site (cf. cmdr.js), puis impose au
// joueur son nom de CMDR et le marque « vérifié ». Les autres sont des invités, libres de leur
// nom, mais sans la marque.
//
// Jukebox : le morceau choisi (et depuis quand il joue) est gardé pour le pont principal, et pour
// chaque instance des quartiers ; le relais le transmet à ceux qui sont là, et à ceux qui arrivent.
//
// Saut FSD : le vaisseau est dans un système (cf. shared/systems.js), le même pour tout le bord.
// Le pilote, installé dans son siège, demande un saut ; le relais choisit la destination et
// l'annonce à tous, qui le vivent ensemble. Un saut à la fois.
//
// Quartiers : chaque joueur a sa propre instance des quartiers du commandant (`cabin` : l'id du
// joueur chez qui il se trouve, le sien par défaut). Un CMDR vérifié envoie l'aménagement des
// siens (cf. cabin.js), et peut inviter un joueur connecté : celui-ci n'y entre qu'avec une
// invitation, reçoit l'aménagement, puis chacun de ses changements. L'hôte peut raccompagner un
// visiteur ; s'il quitte le vaisseau, ses visiteurs rentrent chez eux.
import { Server } from 'socket.io'
import { fightRelay } from './fights.js'
import { BOARD_GAMES, applyBoardMove, boardColor, boardState, newBoardGame } from './boards.js'
import { sanitizeLayout } from './cabin.js'
import { hasSiteArtwork, siteArtworkAllowed } from './site.js'
import { cleanCmdrName, cmdrFromCookie } from './cmdr.js'
import { createCinema } from './cinema.js'
import { BOARD_TABLES, SHIP_LAYOUTS, shipMapOptions } from '../shared/ship-layouts.js'
import { ShipMap } from '../shared/ship-map.js'
import { applyWings } from '../shared/cabin-wings.js'
import { canReach } from '../shared/sight.js'
import { HOME_SYSTEM, JUMP_CHARGE, JUMP_TRAVEL, PILOT_SEAT, nextSystem } from '../shared/systems.js'

/** Chemin de la socket, partagé avec le client (VITE_WS_PATH) et la conf nginx. */
export const WS_PATH = '/ws/mini-shipinteriors'

const MAX_PLAYERS = 32
const MAX_TEXT = 200
const MAX_NAME = 32
// Identifiant d'apparence (cf. src/looks.ts), ex. « human.female.b », « alien.male.c.blue », « robot.g ».
const LOOK = /^[a-z]+(\.[a-z0-9-]+){1,3}$/
// Emotes (src/avatar.ts), puis réactions (médaillons du site, src/reactions.ts).
const EMOTES = new Set([
  'salut', 'oui', 'non', 'joie', 'danse', 'assis', 'dodo', 'o7', 'interact',
  'site', 'braben', 'raxxla', 'federation', 'empire', 'alliance', 'aegis', 'fuel-rats',
])
const ANIMS = new Set(['idle', 'walk', 'sprint'])
// Poses tenues sur un meuble (cf. src/seats.ts) : assis, couché, aux commandes, à une borne…
const POSES = new Set(['sit', 'lie', 'pilot', 'arcade', 'claw', 'punch', 'run', 'pedal', 'mix'])
const LEVELS = new Set([-1, 0, 1])
/** Une invitation dans des quartiers vaut une minute. */
const INVITE_TTL = 60000
/**
 * Portée d'une action arbitrée par le relais (table de jeu, jukebox) : celle du client (1,45),
 * plus la place assise autour de la table et le retard de la dernière position reçue.
 */
const REACH = 2.5
/** Plans des ponts : on n'agit pas à travers un mur (cf. shared/sight.js). */
const MAPS = new Map(Object.entries(SHIP_LAYOUTS).map(([id, layout]) => [Number(id), new ShipMap(layout, shipMapOptions(id))]))
/** Plan du pont des quartiers avec les pièces d'extension d'un aménagement (gardé avec lui). */
const cabinMaps = new WeakMap()
function cabinMap(layout) {
  if (!layout?.wings) return MAPS.get(1)
  let map = cabinMaps.get(layout)
  if (!map) {
    map = new ShipMap(SHIP_LAYOUTS['1'], shipMapOptions(1))
    applyWings(map, layout.wings)
    cabinMaps.set(layout, map)
  }
  return map
}
/** `host` : dans des quartiers, leur hôte (ses pièces d'extension comptent). */
const reaches = (player, level, at, host) => player.level === level && canReach(host && level === 1 ? cabinMap(host.layout) : MAPS.get(level), player, at, REACH)
/** Pont de chaque jukebox : la salle commune (pont principal), le bar (la cale), les quartiers. */
const JUKEBOX_LEVEL = new Map([['deck', 0], ['hold', -1], ['cabin', 1]])
/** Jukebox d'une instance commune (cf. `music` plus bas) ; les autres sont des quartiers. */
const JUKEBOX_WHERE = new Map([[0, 'deck'], [-1, 'hold']])
/** Morceaux du jukebox (cf. src/music.ts) : un identifiant court. */
const TRACK = /^[a-z0-9-]{1,24}$/
/** Après un saut, le réacteur refroidit un peu avant le suivant (ms). */
const FSD_COOLDOWN = 2000

const clean = (s, max) =>
  String(s ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max)
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null)
const obj = (v) => (v && typeof v === 'object' ? v : {})
const validLook = (s) => typeof s === 'string' && s.length <= 40 && LOOK.test(s)

/**
 * Même origine uniquement. Le cookie du site n'est pas SameSite : sans ce contrôle, une page
 * d'un autre site pourrait ouvrir une socket avec le cookie d'un visiteur et parler en son nom.
 * Un client hors navigateur n'envoie pas d'Origin, mais il n'a pas non plus le cookie d'autrui.
 */
function sameOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

/**
 * Branche le relais sur un serveur HTTP existant.
 * @param {import('node:http').Server} httpServer
 * @param {{ log?: (m: string) => void, error?: (m: string) => void, cmdrUrl?: string, path?: string, devCmdr?: boolean }} options
 *   log     : arrivées et départs ; error : ce qui empêche de reconnaître les CMDR
 *   cmdrUrl : endpoint du site qui reconnaît le cookie (défaut : variable ED_CMDR_URL)
 *   path    : chemin de la socket (défaut : WS_PATH, ou la variable WS_PATH)
 *   devCmdr : serveur de dev uniquement, accepte le nom de CMDR envoyé par le client (?cmdr=Nom)
 */
export function attachRelay(
  httpServer,
  { log = console.log, error = console.error, cmdrUrl = process.env.ED_CMDR_URL ?? '', path = process.env.WS_PATH || WS_PATH, devCmdr = false } = {},
) {
  if (!cmdrUrl) error('[relais] ED_CMDR_URL absent : les comptes Élite Dangereuse ne peuvent pas être reconnus (tout le monde est invité).')
  const io = new Server(httpServer, {
    path,
    serveClient: false,
    // Un aménagement de quartiers plein (160 objets, extensions comprises) fait ~13 Ko.
    maxHttpBufferSize: 32768,
    allowRequest: (req, callback) => callback(null, sameOrigin(req)),
  })
  const players = new Map() // socket.id -> joueur
  const sockets = new Map() // id du joueur -> socket
  const cinema = createCinema({ cmdrUrl, players: () => [...players.values()], emit: (event, state) => io.emit(event, state), error })
  httpServer.on('close', () => cinema.dispose())
  const boards = new Map() // table -> partie de plateau
  let nextId = 1
  /**
   * Jukebox qui jouent : 0 pour le pont principal (la salle commune), -1 pour la cale (le bar), sinon
   * l'id de l'hôte des quartiers.
   */
  const music = new Map() // instance -> { track, since, x, z, song, loop, shuffle, seed }
  /** Système où se trouve le vaisseau, et fin du saut en cours (aucun autre avant). */
  let system = HOME_SYSTEM
  let jumpEnds = 0
  /** Ce que joue le jukebox d'une instance, pour un joueur qui y arrive (track null : il se tait). */
  const musicOf = (instance) => {
    const m = music.get(instance)
    return {
      where: JUKEBOX_WHERE.get(instance) ?? 'cabin', track: m?.track ?? null,
      at: m ? (Date.now() - m.since) / 1000 : 0, x: m?.x ?? 0, z: m?.z ?? 0,
      ...(m?.song ? { song: m.song } : {}),
      ...(m?.loop ? { loop: true } : {}),
      ...(m?.shuffle ? { shuffle: true, seed: m.seed } : {}),
    }
  }

  /** Position et animation d'un joueur, avec sa pose s'il est installé sur un meuble. */
  const motion = (p) => ({ x: p.x, z: p.z, yaw: p.yaw, level: p.level, anim: p.anim, ...(p.pose ? { pose: p.pose, py: p.py } : {}) })
  const publicState = (p) => ({ id: p.id, name: p.name, verified: p.verified, skin: p.skin, ...motion(p), cabin: p.cabin })
  const playerById = (id) => {
    const socket = sockets.get(id)
    return socket ? players.get(socket.id) : undefined
  }
  const fights = fightRelay(playerById, id => sockets.get(id))
  const boardKey = (game, table) => (BOARD_GAMES.has(game) && table === game ? table : null)
  const emitBoard = (state) => {
    const msg = boardState(state)
    for (const p of state.players) sockets.get(p.id)?.emit('board:state', msg)
  }
  const leaveBoard = (p) => {
    const key = p.boardKey
    if (!key) return
    const state = boards.get(key)
    p.boardKey = null
    if (!state) return
    state.players = state.players.filter((x) => x.id !== p.id)
    if (!state.players.length) boards.delete(key)
    else {
      // Une partie qui perd un joueur repart proprement à zéro ; aucune victoire n'est attribuée
      // automatiquement, ce qui évite de récompenser une déconnexion ou de conserver un vieux
      // plateau terminé pour le prochain adversaire.
      const fresh = newBoardGame(state.game, state.table)
      fresh.players = state.players
      boards.set(key, fresh)
      for (const boardPlayer of fresh.players) sockets.get(boardPlayer.id)?.emit('board:state', boardState(fresh))
    }
  }
  /** Le joueur passe dans l'instance des quartiers de `cabin` (la sienne s'il rentre chez lui). */
  const moveTo = (p, cabin, by) => {
    if (p.cabin === cabin) return
    fights.leave(p)
    p.cabin = cabin
    io.emit('visit', by ? { id: p.id, cabin, by } : { id: p.id, cabin })
    // La musique de ces quartiers-là (ou le silence).
    sockets.get(p.id)?.emit('music', { id: 0, ...musicOf(cabin) })
  }

  /** Nom d'invité : jamais celui d'un CMDR vérifié présent à bord. */
  const guestName = (wanted, self) => {
    const name = clean(wanted, MAX_NAME) || 'CMDR Jameson'
    const taken = [...players.values()].some((p) => p !== self && p.verified && p.name.toLowerCase() === name.toLowerCase())
    return taken ? `${name.slice(0, MAX_NAME - 9)} (invité)` : name
  }

  // Avant d'embarquer : place à bord, puis identité (le site est interrogé une fois par connexion).
  io.use(async (socket, next) => {
    if (players.size >= MAX_PLAYERS) return next(new Error('Vaisseau complet'))
    const auth = obj(socket.handshake.auth)
    socket.data.cmdr = devCmdr && auth.cmdr ? cleanCmdrName(auth.cmdr) : await cmdrFromCookie(socket.handshake.headers.cookie, { url: cmdrUrl, error })
    next()
  })

  io.on('connection', (socket) => {
    const auth = obj(socket.handshake.auth)
    const cmdr = socket.data.cmdr
    const player = {
      id: nextId++,
      name: '',
      verified: !!cmdr,
      skin: validLook(auth.skin) ? auth.skin : 'human.female.b',
      // Point d'apparition : les quartiers du commandant (cf. SPAWN dans src/levels.ts).
      x: 11.2, z: 7.4, level: 1, yaw: 0, anim: 'idle', pose: '', py: 0,
      // Instance des quartiers : les siens (id du joueur qui reçoit), son aménagement, ses invitations.
      cabin: 0,
      layout: null,
      invited: new Map(), // id de l'invité -> fin de validité
      boardKey: null,
    }
    player.cabin = player.id
    player.name = cmdr ? `CMDR ${cmdr}` : guestName(auth.name, player)
    players.set(socket.id, player)
    sockets.set(player.id, socket)
    socket.emit('welcome', {
      id: player.id,
      you: { name: player.name, verified: player.verified },
      players: [...players.values()].filter((p) => p !== player).map(publicState),
      // Les jukebox du pont principal et de la cale, silence compris : après une reconnexion, on se recale.
      music: musicOf(0),
      hold: musicOf(-1),
      system,
    })
    socket.emit('cinema:state', cinema.snapshot())
    void cinema.refresh().then(() => socket.connected && socket.emit('cinema:state', cinema.snapshot()))
    socket.broadcast.emit('join', { player: publicState(player) })
    log(`[relais] ${player.name}${player.verified ? ' (CMDR vérifié)' : ''} (#${player.id}) a embarqué — ${players.size} à bord`)

    fights.connect(socket, player)

    let chatBudget = 5
    let inviteBudget = 3
    let cabinBudget = 10
    let musicBudget = 3
    let cinemaBudget = 3
    let boardBudget = 30
    const refill = setInterval(() => {
      chatBudget = Math.min(5, chatBudget + 1)
      inviteBudget = Math.min(3, inviteBudget + 0.25)
      cabinBudget = Math.min(10, cabinBudget + 5)
      musicBudget = Math.min(3, musicBudget + 0.5)
      cinemaBudget = Math.min(3, cinemaBudget + 0.5)
      boardBudget = Math.min(30, boardBudget + 10)
    }, 1000)

    socket.on('state', (raw) => {
      const m = obj(raw)
      const x = num(m.x, -5, 50), z = num(m.z, -5, 20), yaw = num(m.yaw, -10, 10)
      if (x === null || z === null || yaw === null || !LEVELS.has(m.level)) return
      // Une pose inconnue n'en est pas une ; sa hauteur reste à portée d'une couchette du haut.
      const pose = POSES.has(m.pose) ? m.pose : ''
      if (player.level !== m.level) fights.leave(player)
      Object.assign(player, { x, z, yaw, level: m.level, anim: ANIMS.has(m.anim) ? m.anim : 'idle', pose, py: pose ? (num(m.py, 0, 1.2) ?? 0) : 0 })
      socket.broadcast.emit('state', { id: player.id, ...motion(player) })
      cinema.operatorChanged()
    })

    socket.on('cinema:choose', async (raw) => {
      if (cinemaBudget < 1) return socket.emit('cinema:error', { reason: 'busy' })
      cinemaBudget--
      const id = obj(raw).id
      const reason = await cinema.choose(player, id)
      if (reason) socket.emit('cinema:error', { reason })
    })

    socket.on('cinema:duration', (raw) => {
      if (player.level !== 1) return
      const { id, since, duration } = obj(raw)
      cinema.reportDuration(id, since, duration)
    })

    socket.on('chat', (raw) => {
      const text = clean(obj(raw).text, MAX_TEXT)
      if (!text || chatBudget <= 0) return
      chatBudget--
      socket.broadcast.emit('chat', { id: player.id, name: player.name, verified: player.verified, text })
    })

    socket.on('emote', (raw) => {
      const emote = obj(raw).emote
      if (EMOTES.has(emote)) socket.broadcast.emit('emote', { id: player.id, emote })
    })

    socket.on('profile', (raw) => {
      const m = obj(raw)
      // Le nom d'un CMDR vérifié vient du site : il ne se change pas en jeu.
      if (!player.verified && clean(m.name, MAX_NAME)) player.name = guestName(m.name, player)
      if (validLook(m.skin)) player.skin = m.skin
      io.emit('profile', { id: player.id, name: player.name, verified: player.verified, skin: player.skin })
      if (player.boardKey) {
        const state = boards.get(player.boardKey)
        const boardPlayer = state?.players.find((p) => p.id === player.id)
        if (boardPlayer) {
          boardPlayer.name = player.name
          emitBoard(state)
        }
      }
    })

    // Jeux de plateau : deux places maximum, un seul état validé par le relais pour chaque table.
    socket.on('board:join', (raw) => {
      if (boardBudget-- <= 0) return socket.emit('board:error', { game: '', table: '', code: 'busy' })
      const m = obj(raw)
      const game = typeof m.game === 'string' ? m.game : ''
      const table = typeof m.table === 'string' ? m.table : ''
      const key = boardKey(game, table)
      if (!key || player.level !== 0) return socket.emit('board:error', { game, table, code: 'unavailable' })
      if (!reaches(player, BOARD_TABLES[game].level, BOARD_TABLES[game])) return socket.emit('board:error', { game, table, code: 'far' })
      if (player.boardKey && player.boardKey !== key) leaveBoard(player)
      let state = boards.get(key)
      if (!state) boards.set(key, (state = newBoardGame(game, table)))
      const already = state.players.find((p) => p.id === player.id)
      if (!already && state.players.length >= 2) return socket.emit('board:error', { game, table, code: 'full' })
      if (!already) {
        const color = [boardColor(game, 0), boardColor(game, 1)].find((c) => !state.players.some((p) => p.color === c))
        state.players.push({ id: player.id, name: player.name, color })
        player.boardKey = key
      }
      if (state.players.length >= 2 && state.status === 'waiting') state.status = 'playing'
      emitBoard(state)
    })

    socket.on('board:move', (raw) => {
      if (boardBudget-- <= 0) return socket.emit('board:error', { game: '', table: '', code: 'busy' })
      const m = obj(raw)
      const key = boardKey(m.game, m.table)
      const state = key ? boards.get(key) : null
      if (!state || player.boardKey !== key || !applyBoardMove(state, player, m.move)) return socket.emit('board:error', { game: m.game, table: m.table, code: 'invalid' })
      emitBoard(state)
    })

    socket.on('board:leave', () => leaveBoard(player))

    // Jukebox : un morceau (ou le silence) au pont principal, à la cale, ou dans les quartiers où l'on est,
    // depuis son début ou `at` secondes plus loin (un hôte reconnecté rend la sienne au relais).
    // Trop de choix d'un coup : le demandeur, qui joue déjà le sien, retrouve celui de tous.
    socket.on('music', (raw) => {
      const m = obj(raw)
      if (!JUKEBOX_LEVEL.has(m.where)) return
      const instance = m.where === 'cabin' ? player.cabin : m.where === 'deck' ? 0 : -1
      if (musicBudget < 1) return socket.emit('music', { id: 0, ...musicOf(instance), busy: true })
      const track = m.track === null ? null : TRACK.test(String(m.track)) ? String(m.track) : undefined
      const x = num(m.x, -5, 50), z = num(m.z, -5, 20)
      if (track === undefined || x === null || z === null) return
      const song = Number.isInteger(m.song) && m.song >= 0 && m.song <= 3 ? m.song : 0
      const loop = m.loop === true
      const shuffle = m.shuffle === true
      const seed = Number.isInteger(m.seed) && m.seed >= 0 && m.seed <= 0xffffffff ? m.seed : 0
      // Au jukebox, et de ce côté du mur ; sauf l'hôte reconnecté qui rend sa musique (`at`).
      const restore = m.where === 'cabin' && m.at !== undefined
      const host = m.where === 'cabin' ? playerById(player.cabin) : undefined
      if (!restore && !reaches(player, JUKEBOX_LEVEL.get(m.where), { x, z }, host)) return socket.emit('music', { id: 0, ...musicOf(instance), far: true })
      musicBudget--
      if (track) music.set(instance, { track, since: Date.now() - (num(m.at, 0, 86400) ?? 0) * 1000, x, z, song, loop, shuffle, seed })
      else music.delete(instance)
      const msg = { id: player.id, ...musicOf(instance) }
      for (const p of players.values()) {
        // Les ponts communs s'entendent de tous (chacun n'écoute que celui de son pont) ; des quartiers, seulement de qui s'y trouve.
        if (p !== player && (instance <= 0 || p.cabin === instance)) sockets.get(p.id)?.emit('music', msg)
      }
    })

    // Saut FSD : installé dans le siège du pilote, et pas pendant un autre saut. Tout le bord le vit.
    socket.on('jump', () => {
      const now = Date.now()
      if (now < jumpEnds || player.level !== PILOT_SEAT.level || player.pose !== 'pilot') return
      if (Math.hypot(player.x - PILOT_SEAT.x, player.z - PILOT_SEAT.z) > 1) return
      system = nextSystem(system)
      jumpEnds = now + (JUMP_CHARGE + JUMP_TRAVEL) * 1000 + FSD_COOLDOWN
      io.emit('jump', { id: player.id, name: player.name, system })
    })

    // Aménagement de ses quartiers (CMDR vérifiés seulement), transmis à ceux qui s'y trouvent.
    let cabinRevision = 0
    socket.on('cabin', async (raw) => {
      if (!player.verified || cabinBudget < 1) return
      const layout = sanitizeLayout(obj(raw).layout)
      if (!layout) return
      cabinBudget--
      const revision = ++cabinRevision
      if (hasSiteArtwork(layout) && !await siteArtworkAllowed(layout, socket.handshake.headers.cookie, cmdrUrl)) return
      if (revision !== cabinRevision || !players.has(socket.id)) return
      player.layout = layout
      for (const p of players.values()) {
        if (p !== player && p.cabin === player.id) sockets.get(p.id)?.emit('cabin', { id: player.id, layout })
      }
    })

    // Invitation dans ses quartiers (CMDR vérifiés seulement), valable une minute. L'hôte apprend
    // si elle est partie, ou pourquoi (guest : il n'est pas CMDR, gone : l'invité n'est plus à
    // bord, here : déjà chez lui, busy : trop d'invitations d'un coup).
    socket.on('invite', (raw, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {}
      const to = playerById(obj(raw).to)
      if (!player.verified) return reply({ ok: false, reason: 'guest' })
      if (!to || to === player) return reply({ ok: false, reason: 'gone' })
      if (to.cabin === player.id) return reply({ ok: false, reason: 'here' })
      if (inviteBudget < 1) return reply({ ok: false, reason: 'busy' })
      inviteBudget--
      player.invited.set(to.id, Date.now() + INVITE_TTL)
      sockets.get(to.id)?.emit('invite', { id: player.id, name: player.name, verified: player.verified })
      reply({ ok: true })
    })

    socket.on('decline', (raw) => {
      const host = playerById(obj(raw).to)
      if (!host?.invited.delete(player.id)) return
      sockets.get(host.id)?.emit('decline', { id: player.id, name: player.name })
    })

    // Entrer dans les quartiers d'un hôte (sur invitation), ou rentrer chez soi (host absent).
    socket.on('visit', (raw) => {
      const hostId = obj(raw).host
      if (hostId === null || hostId === undefined || hostId === player.id) return moveTo(player, player.id)
      const host = playerById(hostId)
      const until = host?.invited.get(player.id) ?? 0
      if (!host || until < Date.now()) {
        // Invitation expirée ou inconnue : le client apprend qu'il reste où il est.
        return socket.emit('visit', { id: player.id, cabin: player.cabin, expired: true })
      }
      host.invited.delete(player.id)
      // L'aménagement d'abord : le visiteur entre dans des quartiers déjà meublés.
      socket.emit('cabin', { id: host.id, layout: host.layout })
      moveTo(player, host.id)
    })

    // L'hôte raccompagne un visiteur : celui-ci rentre chez lui.
    socket.on('kick', (raw) => {
      const guest = playerById(obj(raw).id)
      if (guest && guest !== player && guest.cabin === player.id) moveTo(guest, guest.id, player.id)
    })

    socket.on('disconnect', () => {
      clearInterval(refill)
      leaveBoard(player)
      players.delete(socket.id)
      sockets.delete(player.id)
      cinema.operatorChanged()
      music.delete(player.id)
      // Plus personne à bord : les jukebox de la salle commune et du bar se taisent.
      if (!players.size) music.clear()
      socket.broadcast.emit('leave', { id: player.id })
      // Ses visiteurs rentrent chez eux.
      for (const p of players.values()) if (p.cabin === player.id) moveTo(p, p.id)
      log(`[relais] ${player.name} (#${player.id}) a débarqué — ${players.size} à bord`)
    })
  })
  return io
}
