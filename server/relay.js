// Relais multijoueur minimal (socket.io) : chaque client annonce sa position, ses messages
// et ses emotes ; le serveur valide, mémorise l'état et le rediffuse aux autres.
// Utilisé par le serveur de dev (plugin Vite) et par server/index.js en production.
//
// Identité : le jeu est servi sur le domaine du site, la poignée de main emporte donc le cookie
// ED_LOGGED_CMDR_ID. Le relais le fait reconnaître par le site (cf. cmdr.js), puis impose au
// joueur son nom de CMDR et le marque « vérifié ». Les autres sont des invités, libres de leur
// nom, mais sans la marque.
import { Server } from 'socket.io'
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
    maxHttpBufferSize: 4096,
    allowRequest: (req, callback) => callback(null, sameOrigin(req)),
  })
  const players = new Map() // socket.id -> joueur
  let nextId = 1

  const publicState = (p) => ({ id: p.id, name: p.name, verified: p.verified, skin: p.skin, x: p.x, z: p.z, level: p.level, yaw: p.yaw, anim: p.anim })

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
    }
    player.name = cmdr ? `CMDR ${cmdr}` : guestName(auth.name, player)
    players.set(socket.id, player)
    socket.emit('welcome', {
      id: player.id,
      you: { name: player.name, verified: player.verified },
      players: [...players.values()].filter((p) => p !== player).map(publicState),
    })
    socket.broadcast.emit('join', { player: publicState(player) })
    log(`[relais] ${player.name}${player.verified ? ' (CMDR vérifié)' : ''} (#${player.id}) a embarqué — ${players.size} à bord`)

    let chatBudget = 5
    const refill = setInterval(() => (chatBudget = Math.min(5, chatBudget + 1)), 1000)

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

    socket.on('disconnect', () => {
      clearInterval(refill)
      players.delete(socket.id)
      socket.broadcast.emit('leave', { id: player.id })
      log(`[relais] ${player.name} (#${player.id}) a débarqué — ${players.size} à bord`)
    })
  })
  return io
}
