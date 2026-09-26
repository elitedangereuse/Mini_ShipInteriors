import { FightSimulation } from '../shared/fight.js'

const BUTTONS = new Set(['left', 'right', 'up', 'down', 'a', 'b', 'c'])
const pad = () => ({ held: new Set(), pressed: new Set() })
const room = p => p.level === 0 ? 'deck' : p.level === 1 ? `cabin:${p.cabin}` : null

/** Matchmaking par pont/cabine. Le serveur simule, les clients n'envoient que leurs commandes. */
export function fightRelay(playerById, socketById) {
  const matches = new Map()
  let serial = 0
  const emit = match => {
    const state = {
      session: match.session, players: match.players.map(p => ({ id: p.id, name: playerById(p.id)?.name ?? p.name })),
      status: match.game ? match.game.over ? 'ended' : 'playing' : 'waiting',
      rematch: [...match.rematch], snapshot: match.game?.snapshot() ?? null,
    }
    for (const p of match.players) socketById(p.id)?.emit('fight:state', state)
    if (match.game) match.game.sounds.length = 0
  }
  const stop = match => { clearInterval(match.timer); match.timer = null }
  const leave = player => {
    const match = matches.get(player.fightRoom)
    player.fightRoom = null
    if (!match) return
    stop(match)
    match.players = match.players.filter(p => p.id !== player.id)
    match.game = null; match.rematch.clear(); match.session = ++serial
    match.players.forEach(p => { p.pad = pad() })
    if (!match.players.length) matches.delete(match.room)
    else emit(match)
  }
  const start = match => {
    stop(match)
    match.game = new FightSimulation('versus')
    match.session = ++serial; match.rematch.clear()
    match.players.forEach(p => { p.pad = pad(); p.at = Date.now() })
    let previous = performance.now(), frames = 0
    match.timer = setInterval(() => {
      for (const p of [...match.players]) {
        const player = playerById(p.id)
        if (!player || room(player) !== match.room) { if (player) leave(player); return }
        if (Date.now() - p.at > 350) p.pad.held.clear()
      }
      const now = performance.now(), dt = Math.min(0.25, (now - previous) / 1000)
      previous = now
      const [a, b] = match.players
      if (!a || !b) return
      match.game.step(dt, { ...a.pad, second: b.pad })
      match.players.forEach(p => p.pad.pressed.clear())
      if (++frames % 2 === 0 || match.game.over) emit(match)
      if (match.game.over) stop(match)
    }, 1000 / 60)
    match.timer.unref?.()
    emit(match)
  }
  const connect = (socket, player) => {
    let lastJoin = 0, inputWindow = 0, inputCount = 0
    socket.on('fight:join', () => {
      const key = room(player)
      if (!key) return socket.emit('fight:error', { code: 'unavailable' })
      const existing = matches.get(player.fightRoom)
      if (existing && existing.room === key) return emit(existing)
      if (Date.now() - lastJoin < 500) return socket.emit('fight:error', { code: 'busy' })
      lastJoin = Date.now()
      const target = matches.get(key)
      if (target?.players.length >= 2) return socket.emit('fight:error', { code: 'full' })
      leave(player)
      const match = target ?? { room: key, session: ++serial, players: [], game: null, timer: null, rematch: new Set() }
      matches.set(key, match)
      match.players.push({ id: player.id, name: player.name, pad: pad(), at: Date.now() })
      player.fightRoom = key
      if (match.players.length === 2) start(match)
      else emit(match)
    })
    socket.on('fight:input', raw => {
      const match = matches.get(player.fightRoom)
      const participant = match?.players.find(p => p.id === player.id)
      if (!participant || !match.game || match.game.over || raw?.session !== match.session) return
      const now = Date.now()
      if (now - inputWindow >= 1000) { inputWindow = now; inputCount = 0 }
      if (++inputCount > 90) return
      if (!Array.isArray(raw.held) || !Array.isArray(raw.pressed) || raw.held.length > 7 || raw.pressed.length > 7) return
      participant.pad.held = new Set(raw.held.filter(b => BUTTONS.has(b)))
      for (const b of raw.pressed) if (BUTTONS.has(b)) participant.pad.pressed.add(b)
      participant.at = now
    })
    socket.on('fight:rematch', () => {
      const match = matches.get(player.fightRoom)
      if (!match?.game?.over || match.players.length !== 2) return
      if (match.rematch.has(player.id)) return
      match.rematch.add(player.id)
      if (match.rematch.size === 2) start(match)
      else emit(match)
    })
    socket.on('fight:leave', () => leave(player))
    socket.on('disconnect', () => leave(player))
  }
  return { connect, leave }
}
