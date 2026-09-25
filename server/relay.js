// Relais multijoueur minimal (socket.io) : chaque client annonce sa position, ses messages
// et ses emotes ; le serveur valide, mémorise l'état et le rediffuse aux autres.
// Utilisé par le serveur de dev (plugin Vite) et par server/index.js en production.
//
// Identité : le jeu est servi sur le domaine du site, la poignée de main emporte donc le cookie
// ED_LOGGED_CMDR_ID. Le relais le fait reconnaître par le site (cf. cmdr.js), puis impose au
// joueur son nom de CMDR et le marque « vérifié ». Les autres sont des invités, libres de leur
// nom, mais sans la marque.
//
// Quartiers : chaque joueur a sa propre instance des quartiers du commandant (`cabin` : l'id du
// joueur chez qui il se trouve, le sien par défaut). Un CMDR vérifié envoie l'aménagement des
// siens (cf. cabin.js), et peut inviter un joueur connecté : celui-ci n'y entre qu'avec une
// invitation, reçoit l'aménagement, puis chacun de ses changements. L'hôte peut raccompagner un
// visiteur ; s'il quitte le vaisseau, ses visiteurs rentrent chez eux.
import { Server } from 'socket.io'
import { sanitizeLayout } from './cabin.js'
import { cleanCmdrName, cmdrFromCookie } from './cmdr.js'

/** Chemin de la socket, partagé avec le client (VITE_WS_PATH) et la conf nginx. */
export const WS_PATH = '/ws/mini-shipinteriors'

const MAX_PLAYERS = 32
const MAX_TEXT = 200
const MAX_NAME = 32
// Identifiant d'apparence (cf. src/looks.ts), ex. « human.female.b », « alien.male.c.blue », « robot.g ».
const LOOK = /^[a-z]+(\.[a-z0-9-]+){1,3}$/
const EMOTES = new Set(['salut', 'oui', 'non', 'joie', 'danse', 'assis', 'dodo', 'interact'])
const ANIMS = new Set(['idle', 'walk', 'sprint'])
const LEVELS = new Set([-1, 0, 1])
/** Une invitation dans des quartiers vaut une minute. */
const INVITE_TTL = 60000

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
    // Un aménagement de quartiers plein fait ~5 Ko.
    maxHttpBufferSize: 16384,
    allowRequest: (req, callback) => callback(null, sameOrigin(req)),
  })
  const players = new Map() // socket.id -> joueur
  const sockets = new Map() // id du joueur -> socket
  let nextId = 1

  const publicState = (p) => ({ id: p.id, name: p.name, verified: p.verified, skin: p.skin, x: p.x, z: p.z, level: p.level, yaw: p.yaw, anim: p.anim, cabin: p.cabin })
  const playerById = (id) => {
    const socket = sockets.get(id)
    return socket ? players.get(socket.id) : undefined
  }
  /** Le joueur passe dans l'instance des quartiers de `cabin` (la sienne s'il rentre chez lui). */
  const moveTo = (p, cabin, by) => {
    if (p.cabin === cabin) return
    p.cabin = cabin
    io.emit('visit', by ? { id: p.id, cabin, by } : { id: p.id, cabin })
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
      x: 11.2, z: 7.4, level: 1, yaw: 0, anim: 'idle',
      // Instance des quartiers : les siens (id du joueur qui reçoit), son aménagement, ses invitations.
      cabin: 0,
      layout: null,
      invited: new Map(), // id de l'invité -> fin de validité
    }
    player.cabin = player.id
    player.name = cmdr ? `CMDR ${cmdr}` : guestName(auth.name, player)
    players.set(socket.id, player)
    sockets.set(player.id, socket)
    socket.emit('welcome', {
      id: player.id,
      you: { name: player.name, verified: player.verified },
      players: [...players.values()].filter((p) => p !== player).map(publicState),
    })
    socket.broadcast.emit('join', { player: publicState(player) })
    log(`[relais] ${player.name}${player.verified ? ' (CMDR vérifié)' : ''} (#${player.id}) a embarqué — ${players.size} à bord`)

    let chatBudget = 5
    let inviteBudget = 3
    let cabinBudget = 10
    const refill = setInterval(() => {
      chatBudget = Math.min(5, chatBudget + 1)
      inviteBudget = Math.min(3, inviteBudget + 0.25)
      cabinBudget = Math.min(10, cabinBudget + 5)
    }, 1000)

    socket.on('state', (raw) => {
      const m = obj(raw)
      const x = num(m.x, -5, 40), z = num(m.z, -5, 20), yaw = num(m.yaw, -10, 10)
      if (x === null || z === null || yaw === null || !LEVELS.has(m.level)) return
      Object.assign(player, { x, z, yaw, level: m.level, anim: ANIMS.has(m.anim) ? m.anim : 'idle' })
      socket.broadcast.emit('state', { id: player.id, x, z, yaw, level: player.level, anim: player.anim })
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
    })

    // Aménagement de ses quartiers (CMDR vérifiés seulement), transmis à ceux qui s'y trouvent.
    socket.on('cabin', (raw) => {
      if (!player.verified || cabinBudget < 1) return
      const layout = sanitizeLayout(obj(raw).layout)
      if (!layout) return
      cabinBudget--
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
      players.delete(socket.id)
      sockets.delete(player.id)
      socket.broadcast.emit('leave', { id: player.id })
      // Ses visiteurs rentrent chez eux.
      for (const p of players.values()) if (p.cabin === player.id) moveTo(p, p.id)
      log(`[relais] ${player.name} (#${player.id}) a débarqué — ${players.size} à bord`)
    })
  })
  return io
}
