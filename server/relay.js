// Relais multijoueur minimal : chaque client annonce sa position, ses messages
// et ses emotes ; le serveur valide, mémorise l'état et le rediffuse aux autres.
// Utilisé par le serveur de dev (plugin Vite) et par server/index.js en production.
//
// Identité : un joueur connecté à elitedangereuse.fr présente un billet signé par le site
// (cf. ticket.js) ; le relais lui impose alors son nom de CMDR et le marque « vérifié ».
// Les autres sont des invités, libres de leur nom, mais sans la marque.
import { WebSocketServer } from 'ws'
import { verifyTicket } from './ticket.js'

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

/**
 * Branche le relais sur un serveur HTTP existant, sur le chemin /ws.
 * @param {{ log?: (m: string) => void, secret?: string }} options
 *   secret : secret partagé avec le site (défaut : variable MINI_INTERIOR_SECRET)
 */
export function attachRelay(httpServer, { log = console.log, secret = process.env.MINI_INTERIOR_SECRET ?? '' } = {}) {
  if (!secret) log('[relais] MINI_INTERIOR_SECRET absent : les comptes Élite Dangereuse ne peuvent pas être vérifiés (tout le monde est invité).')
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 })
  const players = new Map() // ws -> joueur
  let nextId = 1

  httpServer.on('upgrade', (req, socket, head) => {
    if (!req.url?.startsWith('/ws')) return // laisse passer le HMR de Vite
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  })

  const send = (ws, msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg))
  const broadcast = (msg, except) => {
    const data = JSON.stringify(msg)
    for (const ws of players.keys()) if (ws !== except && ws.readyState === 1) ws.send(data)
  }
  const publicState = (p) => ({ id: p.id, name: p.name, verified: p.verified, skin: p.skin, x: p.x, z: p.z, level: p.level, yaw: p.yaw, anim: p.anim })

  /** Nom d'invité : jamais celui d'un CMDR vérifié présent à bord. */
  const guestName = (wanted, self) => {
    const name = clean(wanted, MAX_NAME) || 'CMDR Jameson'
    const taken = [...players.values()].some((p) => p !== self && p.verified && p.name.toLowerCase() === name.toLowerCase())
    return taken ? `${name.slice(0, MAX_NAME - 9)} (invité)` : name
  }

  wss.on('connection', (ws) => {
    if (players.size >= MAX_PLAYERS) return ws.close(1013, 'Vaisseau complet')
    let player = null
    let chatBudget = 5
    const refill = setInterval(() => (chatBudget = Math.min(5, chatBudget + 1)), 1000)

    ws.on('message', (raw) => {
      let m
      try {
        m = JSON.parse(raw)
      } catch {
        return
      }
      if (!player) {
        if (m.t !== 'hello') return
        const account = verifyTicket(m.ticket, secret)
        player = {
          id: nextId++,
          name: '',
          verified: !!account,
          account: account?.key ?? null,
          skin: typeof m.skin === 'string' && m.skin.length <= 40 && LOOK.test(m.skin) ? m.skin : 'human.female.b',
          // Point d'apparition : les quartiers du commandant (cf. SPAWN dans src/levels.ts).
          x: 11.2, z: 7.4, level: 1, yaw: 0, anim: 'idle',
        }
        player.name = account ? `CMDR ${account.name}` : guestName(m.name, player)
        players.set(ws, player)
        send(ws, {
          t: 'welcome',
          id: player.id,
          you: { name: player.name, verified: player.verified },
          players: [...players.values()].filter((p) => p !== player).map(publicState),
        })
        broadcast({ t: 'join', player: publicState(player) }, ws)
        log(`[relais] ${player.name}${player.verified ? ' (CMDR vérifié)' : ''} (#${player.id}) a embarqué — ${players.size} à bord`)
        return
      }
      switch (m.t) {
        case 'state': {
          const x = num(m.x, -5, 40), z = num(m.z, -5, 20), yaw = num(m.yaw, -10, 10)
          if (x === null || z === null || yaw === null || !LEVELS.has(m.level)) return
          Object.assign(player, { x, z, yaw, level: m.level, anim: ANIMS.has(m.anim) ? m.anim : 'idle' })
          broadcast({ t: 'state', id: player.id, x, z, yaw, level: player.level, anim: player.anim }, ws)
          break
        }
        case 'chat': {
          const text = clean(m.text, MAX_TEXT)
          if (!text || chatBudget <= 0) return
          chatBudget--
          broadcast({ t: 'chat', id: player.id, name: player.name, verified: player.verified, text }, ws)
          break
        }
        case 'emote':
          if (EMOTES.has(m.emote)) broadcast({ t: 'emote', id: player.id, emote: m.emote }, ws)
          break
        case 'profile': {
          // Le nom d'un CMDR vérifié vient du site : il ne se change pas en jeu.
          if (!player.verified && clean(m.name, MAX_NAME)) player.name = guestName(m.name, player)
          if (typeof m.skin === 'string' && m.skin.length <= 40 && LOOK.test(m.skin)) player.skin = m.skin
          broadcast({ t: 'profile', id: player.id, name: player.name, verified: player.verified, skin: player.skin })
          break
        }
      }
    })

    ws.on('close', () => {
      clearInterval(refill)
      if (!player) return
      players.delete(ws)
      broadcast({ t: 'leave', id: player.id })
      log(`[relais] ${player.name} (#${player.id}) a débarqué — ${players.size} à bord`)
    })
  })
  return wss
}
