// L'arène (duels par équipes), côté relais : plan, tirs, salons, bots, dégâts, retours à la base, fin.
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createArena } from './arena.js'
import { ARENA_LEVEL, ARENA_MAP, ARENA_RULES as R, arenaHidden, arenaSight, arenaZone, blastDamage, castArena, inBush } from '../shared/arena.js'
import { mulberry32 } from '../shared/salvage.js'
import { WEAPON_STATS } from '../shared/weapons.js'

/** Relais simulé : joueurs, horloge, messages envoyés. */
function harness(options = {}) {
  let t = 1_000_000
  const players = new Map()
  const sent = []
  const broadcasts = []
  const arena = createArena({
    playerById: (id) => players.get(id),
    emit: (id, event, data) => sent.push({ id, event, data }),
    broadcast: (event, data) => broadcasts.push({ event, data }),
    now: () => t,
    random: mulberry32(11),
    debug: true,
    ...options,
  })
  const add = (id) => {
    const p = { id, name: `CMDR ${id}`, verified: true, level: -1, x: 24, z: 8, yaw: 0, anim: 'idle' }
    players.set(id, p)
    return p
  }
  const advance = (seconds) => {
    for (let i = 0; i < Math.round(seconds * 20); i++) {
      t += 50
      arena.tick(0.05)
    }
  }
  const last = (id, event, match = () => true) => [...sent].reverse().find((m) => m.id === id && m.event === event && match(m.data))?.data
  const events = (id, kind) => sent.filter((m) => m.id === id && m.event === 'arena:event' && m.data.kind === kind).map((m) => m.data)
  const lobby = () => broadcasts[broadcasts.length - 1].data
  /** Le joueur arrive dans l'arène, à sa base. */
  const arrive = (p) => {
    const start = last(p.id, 'arena:start')
    Object.assign(p, { level: ARENA_LEVEL, x: start.spawn.x, z: start.spawn.z })
    assert.ok(arena.accepts(p, p.x, p.z))
    arena.moved(p)
  }
  /** Pose un joueur quelque part (essais : sa position n'est pas contrôlée). */
  const put = (p, x, z) => {
    const f = arena.gameOf(p).fighters.get(p.id)
    Object.assign(p, { x, z })
    Object.assign(f, { x, z, at: t })
  }
  /** Une partie lancée : le salon de `a`, rejoint par `others`, tous prêts. */
  const start = (a, others = [], settings = {}) => {
    arena.handle(a, 'arena:join', { room: 1 })
    arena.handle(a, 'arena:settings', settings)
    for (const o of others) arena.handle(o, 'arena:join', { room: 1 })
    for (const p of [a, ...others]) arena.handle(p, 'arena:ready', { ready: true })
    advance(R.countdown + 0.1)
    for (const p of [a, ...others]) arrive(p)
    return arena.gameOf(a)
  }
  return { arena, add, advance, last, events, lobby, arrive, put, start, sent, clock: () => t }
}

test('arène : le plan est d\'un seul tenant, équitable, trois points d\'apparition par équipe', () => {
  const zone = arenaZone()
  const H = ARENA_MAP.length, W = ARENA_MAP[0].length
  for (const row of ARENA_MAP) assert.equal(row.length, W)
  // Obstacles et buissons se répondent d'un bout à l'autre : aucune équipe n'a l'avantage du terrain.
  const kind = (c) => ('#=Hcp'.includes(c) ? 'plein' : c === 'g' ? 'buisson' : c === 'A' || c === 'B' ? 'base' : 'sol')
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) assert.equal(kind(ARENA_MAP[z][x]), kind(ARENA_MAP[H - 1 - z][W - 1 - x]), `(${x}, ${z})`)
  assert.equal(zone.spawns[0].length, R.team)
  assert.equal(zone.spawns[1].length, R.team)
  const start = zone.spawns[0][0]
  const seen = new Set([start.z * W + start.x])
  const queue = [...seen]
  while (queue.length) {
    const i = queue.pop()
    for (let dir = 0; dir < 4; dir++) {
      const j = zone.adj[i * 4 + dir]
      if (j >= 0 && !seen.has(j)) { seen.add(j); queue.push(j) }
    }
  }
  assert.equal(seen.size, [...zone.blocked].filter((b) => !b).length)
  // D'une base, on ne voit pas l'autre.
  for (const a of zone.spawns[0]) for (const b of zone.spawns[1]) assert.ok(!arenaSight(zone, a, b))
})

test('arène : une balle s\'arrête sur un conteneur, une cloison, le sol, ou un combattant debout', () => {
  const zone = arenaZone()
  const east = { x: 1, y: 0, z: 0 }
  // De (1, 2) vers l'est : le conteneur debout de la tuile (7, 2), dont le flanc est en x = 6,5.
  let hit = castArena(zone, { x: 1, y: 0.24, z: 2 }, east, 30, [])
  assert.ok(Math.abs(hit.t - 5.5) < 1e-9)
  assert.deepEqual(hit.normal, [-1, 0, 0])
  assert.equal(hit.wall, false)
  // Vers l'ouest : le bord de l'arène.
  hit = castArena(zone, { x: 1, y: 0.24, z: 2 }, { x: -1, y: 0, z: 0 }, 30, [])
  assert.ok(Math.abs(hit.t - 1.5) < 1e-9)
  assert.equal(hit.wall, true)
  // Un combattant sur le trajet : touché au bord de son cylindre ; au-dessus de sa tête, non.
  const body = [{ id: 7, x: 3, z: 2 }]
  hit = castArena(zone, { x: 1, y: 0.24, z: 2 }, east, 30, body)
  assert.equal(hit.body, 7)
  assert.ok(Math.abs(hit.t - (2 - R.body.r)) < 1e-9)
  assert.equal(castArena(zone, { x: 1, y: R.body.h + 0.1, z: 2 }, east, 30, body).body, null)
  assert.equal(castArena(zone, { x: 1, y: 0.24, z: 2 }, east, 30, body, (id) => id === 7).body, null)
  // Vers le sol.
  hit = castArena(zone, { x: 1, y: 0.5, z: 2 }, { x: Math.SQRT1_2, y: -Math.SQRT1_2, z: 0 }, 30, [])
  assert.deepEqual(hit.normal, [0, 1, 0])
  // Hors de portée : rien.
  hit = castArena(zone, { x: 1, y: 0.24, z: 2 }, east, 1, [])
  assert.equal(hit.t, 1)
  assert.equal(hit.normal, null)
})

test('arène : l\'explosion blesse moins loin de son centre, pas au-delà de son rayon', () => {
  assert.equal(blastDamage('launcher', 0), WEAPON_STATS.launcher.damage)
  assert.ok(blastDamage('launcher', 0.8) < blastDamage('launcher', 0.2))
  assert.equal(blastDamage('launcher', WEAPON_STATS.launcher.blast + R.body.r + 0.01), 0)
})

test('arène : on se place dans un lobby, dans le camp le moins garni, on change de camp', () => {
  const h = harness()
  const a = h.add(1), b = h.add(2), c = h.add(3)
  const id = 1
  h.arena.handle(a, 'arena:join', { room: id, weapon: 'rifle' })
  h.arena.handle(b, 'arena:join', { room: id })
  h.arena.handle(c, 'arena:join', { room: id, team: 1 })
  let room = h.lobby().rooms[0]
  assert.deepEqual(room.members.map((m) => [m.id, m.team, m.weapon]), [[1, 0, 'rifle'], [2, 1, 'pistol'], [3, 1, 'pistol']])
  h.arena.handle(c, 'arena:side', { team: 0 })
  h.arena.handle(c, 'arena:weapon', { weapon: 'smg' })
  h.arena.handle(c, 'arena:weapon', { weapon: 'canon' })
  room = h.lobby().rooms[0]
  assert.deepEqual(room.members[2], { id: 3, name: 'CMDR 3', verified: true, team: 0, weapon: 'smg', ready: false })
  // À un contre un, le salon est trop plein pour ce format.
  h.arena.handle(a, 'arena:settings', { size: 1 })
  assert.equal(h.last(1, 'arena:error').code, 'crowded')
  h.arena.handle(b, 'arena:settings', { size: 2 })
  assert.equal(h.last(2, 'arena:error').code, 'leader')
  // Sortir du lobby, c'est quitter le salon ; le chef parti, le suivant le devient.
  Object.assign(a, { x: 10, z: 5 })
  h.arena.moved(a)
  room = h.lobby().rooms[0]
  assert.equal(room.leader, 2)
  assert.deepEqual(room.members.map((m) => m.id), [2, 3])
})

test('arène : quatre lobbys fixes ; on s\'y place, on en change, et chacun joue sa partie', () => {
  const h = harness()
  const room = (id) => h.lobby().rooms.find((r) => r.id === id)
  assert.deepEqual(h.arena.snapshot().rooms.map((r) => [r.id, r.leader, r.members.length]), [[1, null, 0], [2, null, 0], [3, null, 0], [4, null, 0]])
  const a = h.add(1), b = h.add(2), c = h.add(3)
  h.arena.handle(a, 'arena:join', { room: 2 })
  h.arena.handle(b, 'arena:join', { room: 2 })
  h.arena.handle(c, 'arena:join', { room: 4 })
  h.arena.handle(a, 'arena:settings', { size: 1, skill: 2 })
  assert.equal(room(2).leader, 1)
  assert.equal(room(4).leader, 3)
  assert.equal(room(4).size, 3)
  h.arena.handle(c, 'arena:join', { room: 5 })
  assert.equal(h.last(3, 'arena:error').code, 'gone')
  // Le chef change de lobby : le suivant prend la main, et ceux qu'il quitte ne sont plus prêts.
  h.arena.handle(a, 'arena:ready', { ready: true })
  h.arena.handle(b, 'arena:ready', { ready: true })
  assert.equal(room(2).status, 'countdown')
  h.arena.handle(a, 'arena:join', { room: 4 })
  assert.equal(room(2).status, 'forming')
  assert.equal(room(2).leader, 2)
  assert.ok(room(2).members.every((m) => !m.ready))
  assert.deepEqual(room(4).members.map((m) => [m.id, m.team]), [[3, 0], [1, 1]])
  // Le dernier parti : le lobby reste, vide, avec ses réglages de départ.
  h.arena.handle(b, 'arena:leave', {})
  assert.deepEqual(room(2), { id: 2, leader: null, size: 3, bots: true, skill: 1, goal: R.goal, status: 'forming', startsIn: undefined, members: [] })
  // Deux lobbys jouent chacun de son côté.
  h.arena.handle(b, 'arena:join', { room: 1 })
  for (const p of [a, b, c]) h.arena.handle(p, 'arena:ready', { ready: true })
  h.advance(R.countdown + 0.1)
  assert.notEqual(h.arena.gameOf(a), h.arena.gameOf(b))
  assert.equal(h.arena.gameOf(a), h.arena.gameOf(c))
})

test('arène : sans bots, il faut quelqu\'un en face ; hors du sas, pas de lobby', () => {
  const h = harness()
  const a = h.add(1), far = h.add(2)
  Object.assign(far, { x: 5, z: 5 })
  h.arena.handle(far, 'arena:join', { room: 1 })
  assert.equal(h.last(2, 'arena:error').code, 'lobby')
  h.arena.handle(a, 'arena:join', { room: 1 })
  h.arena.handle(a, 'arena:settings', { bots: false })
  h.arena.handle(a, 'arena:ready', { ready: true })
  assert.equal(h.last(1, 'arena:error').code, 'alone')
  assert.equal(h.lobby().rooms[0].status, 'forming')
})

test('arène : les bots complètent les deux équipes, chacun part de sa base', () => {
  const h = harness()
  const a = h.add(1)
  const game = h.start(a, [], { size: 3 })
  const start = h.last(1, 'arena:start')
  assert.equal(start.fighters.length, 6)
  assert.equal(start.fighters.filter((f) => f.bot).length, 5)
  assert.equal(start.goal, R.goal)
  for (const team of [0, 1]) {
    const mine = [...game.fighters.values()].filter((f) => f.team === team)
    assert.equal(mine.length, 3)
    const spots = new Set(mine.map((f) => `${f.x},${f.z}`))
    assert.equal(spots.size, 3)
    for (const f of mine) assert.ok(game.zone.spawns[team].some((s) => s.x === f.x && s.z === f.z))
  }
  assert.equal(h.lobby().rooms[0].status, 'playing')
})

test('arène : une position n\'est acceptée que debout, sur le sol, à portée de course', () => {
  const h = harness()
  const a = h.add(1)
  h.start(a, [], { size: 1 })
  assert.ok(h.arena.accepts(a, a.x + 0.4, a.z))
  assert.ok(!h.arena.accepts(a, a.x + 12, a.z), 'trop loin')
  assert.ok(!h.arena.accepts(a, 3, 1), 'dans une caisse')
  assert.ok(!h.arena.accepts(h.add(9), 1, 1), 'pas dans une partie')
})

/** Tir à plat de `p` vers `to`. */
function fireAt(h, p, to, pellets = 1) {
  const len = Math.hypot(to.x - p.x, to.z - p.z)
  const d = [(to.x - p.x) / len, 0, (to.z - p.z) / len]
  h.arena.handle(p, 'arena:fire', { o: [p.x, R.aim, p.z], d: Array.from({ length: pellets }, () => d) })
}

test('arène : pas de tir avant le coup d\'envoi ; ensuite, les balles blessent, puis éliminent', () => {
  const h = harness()
  const a = h.add(1), b = h.add(2)
  const game = h.start(a, [b], { size: 1, bots: false })
  assert.equal(game.fighters.get(2).team, 1)
  // Face à face dans l'allée nord, rien entre eux.
  h.put(a, 1, 0)
  h.put(b, 4, 0)
  fireAt(h, a, b)
  h.advance(0.5)
  assert.equal(h.events(2, 'hit').length, 0, 'tir pendant la mise en place')
  h.advance(R.warmup + R.shield)
  let shots = 0
  while (game.fighters.get(2).alive && shots < 20) {
    fireAt(h, a, b)
    h.advance(0.25)
    shots++
  }
  // Le pistolet : cinq balles.
  assert.equal(shots, Math.ceil(R.hp / WEAPON_STATS.pistol.damage))
  assert.equal(h.events(2, 'shot').length, shots, 'l\'autre joueur voit chaque tir')
  assert.equal(h.events(1, 'shot').length, 0, 'le tireur ne reçoit pas ses propres tirs')
  const kill = h.events(1, 'kill')[0]
  assert.deepEqual([kill.id, kill.by, kill.score], [2, 1, [1, 0]])
  // Éliminé : sa position n'est plus acceptée ; il revient à sa base, protégé, points de vie pleins.
  assert.ok(!h.arena.accepts(b, 9, 2))
  h.advance(R.respawn + 0.1)
  const spawn = h.events(2, 'spawn').pop()
  assert.equal(spawn.id, 2)
  const f = game.fighters.get(2)
  assert.ok(f.alive && f.hp === R.hp)
  assert.ok(game.zone.spawns[1].some((s) => s.x === f.x && s.z === f.z))
  assert.ok(!h.arena.accepts(b, 9, 2), 'loin de sa base')
  assert.ok(h.arena.accepts(b, f.x, f.z))
})

test('arène : la cadence d\'un joueur est celle de son arme', () => {
  const h = harness()
  const a = h.add(1), b = h.add(2)
  h.start(a, [b], { size: 1, bots: false })
  h.advance(R.warmup + R.shield)
  h.put(a, 1, 0)
  h.put(b, 14, 10)
  // Vingt tirs d'un coup : un seul part.
  for (let i = 0; i < 20; i++) fireAt(h, a, { x: 2, z: 0 })
  assert.equal(h.events(2, 'shot').length, 1)
  // Détente écrasée pendant dix secondes : pas plus que le chargeur et ses rechargements.
  for (let i = 0; i < 200; i++) {
    fireAt(h, a, { x: 2, z: 0 })
    h.advance(0.05)
  }
  const w = WEAPON_STATS.pistol
  const most = w.mag + Math.ceil(10 * (w.mag / (w.mag * w.interval + w.reload))) + 1
  assert.ok(h.events(2, 'shot').length <= most, `${h.events(2, 'shot').length} tirs`)
})

test('arène : un conteneur protège, un coéquipier ne prend pas la balle', () => {
  const h = harness()
  const a = h.add(1), b = h.add(2), c = h.add(3)
  const game = h.start(a, [b, c], { size: 2, bots: false })
  // Le troisième a rejoint le camp le moins garni : celui du tireur.
  assert.equal(game.fighters.get(3).team, 0)
  h.advance(R.warmup + R.shield)
  // Le conteneur debout de (7, 2) entre le tireur et sa cible.
  h.put(a, 5, 2)
  h.put(b, 9, 2)
  h.put(c, 2, 9)
  fireAt(h, a, b)
  h.advance(0.5)
  assert.equal(h.events(1, 'hit').length, 0)
  // Le coéquipier dans la ligne de tir : la balle le traverse, et touche l'adversaire derrière lui.
  h.put(a, 1, 0)
  h.put(c, 2, 0)
  h.put(b, 4, 0)
  fireAt(h, a, b)
  h.advance(0.5)
  assert.deepEqual(h.events(1, 'hit').map((e) => e.id), [2])
})

test('arène : le fusil à pompe tire sa gerbe, le fusil traverse, le plasma souffle', () => {
  const h = harness()
  const a = h.add(1), b = h.add(2), c = h.add(3)
  h.arena.handle(a, 'arena:join', { room: 1, weapon: 'rifle' })
  h.arena.handle(a, 'arena:settings', { size: 2, bots: false })
  const room = h.lobby().rooms[0].id
  h.arena.handle(b, 'arena:join', { room, team: 1 })
  h.arena.handle(c, 'arena:join', { room, team: 1 })
  for (const p of [a, b, c]) h.arena.handle(p, 'arena:ready', { ready: true })
  h.advance(R.countdown + 0.1)
  for (const p of [a, b, c]) h.arrive(p)
  const game = h.arena.gameOf(a)
  h.advance(R.warmup + R.shield)
  // Deux adversaires en enfilade : le fusil les touche tous les deux.
  h.put(a, 1, 0)
  h.put(b, 3, 0)
  h.put(c, 4, 0)
  fireAt(h, a, b)
  h.advance(0.3)
  assert.deepEqual(h.events(1, 'hit').map((e) => [e.id, e.dmg]), [[2, WEAPON_STATS.rifle.damage], [3, WEAPON_STATS.rifle.damage]])
  // Le plasma : une explosion entre les deux, qui les blesse l'un et l'autre, et le tireur s'il est trop près.
  const fa = game.fighters.get(1)
  Object.assign(fa, { weapon: 'launcher', tokens: 2 })
  for (const f of game.fighters.values()) f.hp = R.hp
  h.put(b, 11.9, 1.5)
  h.put(c, 11.9, 0.5)
  h.put(a, 6, 1)
  h.advance(1.5)
  const before = h.events(1, 'hit').length
  fireAt(h, a, { x: 12, z: 1 })
  h.advance(1)
  const blast = h.events(1, 'hit').slice(before)
  assert.deepEqual(blast.map((e) => e.id).sort(), [2, 3])
  assert.ok(blast.every((e) => e.dmg > 0 && e.dmg < WEAPON_STATS.launcher.damage))
  // La gerbe : au plus neuf balles par tir, quoi qu'envoie le client.
  h.advance(1.5)
  Object.assign(fa, { weapon: 'shotgun', tokens: 4 })
  h.put(b, 14, 10)
  h.put(c, 15, 10)
  fireAt(h, a, { x: 7, z: 1 }, 30)
  assert.equal(h.events(2, 'shot').pop().d.length, WEAPON_STATS.shotgun.pellets)
})

test('arène : les bots se cherchent, se tirent dessus, et la partie finit au score', () => {
  const h = harness()
  const a = h.add(1)
  const game = h.start(a, [], { size: 2, skill: 2 })
  // Le joueur reste à sa base ; les trois bots font la partie.
  let ended = null
  for (let i = 0; i < 400 && !ended; i++) {
    h.advance(1)
    ended = h.last(1, 'arena:end')
  }
  assert.ok(ended, 'la partie se termine')
  assert.ok(['score', 'time'].includes(ended.reason))
  assert.ok(ended.score[0] + ended.score[1] > 0, 'des éliminations')
  assert.ok(h.events(1, 'shot').length > 10, 'des tirs')
  assert.equal(ended.stats.length, 4)
  // Les bots restent sur le sol de l'arène.
  for (const f of game.fighters.values()) assert.ok(!game.zone.blocked[Math.round(f.z) * game.zone.width + Math.round(f.x)], f.name)
  assert.equal(h.lobby().rooms[0].status, 'forming')
})

test('arène : au bout du temps, l\'équipe en tête gagne ; à égalité, personne', () => {
  const h = harness()
  const a = h.add(1), b = h.add(2)
  const game = h.start(a, [b], { size: 1, bots: false })
  h.arena.handle(a, 'arena:debug', { score: [3, 2] })
  h.advance(R.warmup + R.duration + 0.2)
  const end = h.last(2, 'arena:end')
  assert.deepEqual([end.winner, end.reason, end.score], [0, 'time', [3, 2]])
  assert.equal(game.ended, true)
  // Le salon reste ouvert : une autre partie, sans un point de part et d'autre.
  for (const p of [a, b]) Object.assign(p, { level: -1, x: 24, z: 8 })
  for (const p of [a, b]) h.arena.handle(p, 'arena:ready', { ready: true })
  h.advance(R.countdown + 0.1)
  for (const p of [a, b]) h.arrive(p)
  h.advance(R.warmup + R.duration + 0.2)
  assert.equal(h.last(1, 'arena:end').winner, -1)
})

test('arène : qui part est remplacé par un bot ; sans bots, une équipe vide perd par forfait', () => {
  const h = harness()
  const a = h.add(1), b = h.add(2)
  const game = h.start(a, [b], { size: 1, bots: true })
  h.arena.leave(b)
  assert.equal(game.fighters.has(2), false)
  const join = h.events(1, 'join')[0]
  assert.ok(join.fighter.bot && join.fighter.team === 1)
  assert.deepEqual(h.events(1, 'left').map((e) => e.id), [2])
  assert.deepEqual(h.lobby().rooms[0].members.map((m) => m.id), [1])
  // Le dernier joueur parti, la partie s'arrête et le lobby se libère, avec ses réglages de départ.
  h.arena.handle(a, 'arena:quit', {})
  assert.deepEqual(h.lobby().rooms[0], { id: 1, leader: null, size: 3, bots: true, skill: 1, goal: R.goal, status: 'forming', startsIn: undefined, members: [] })

  const h2 = harness()
  const c = h2.add(1), d = h2.add(2)
  h2.start(c, [d], { size: 1, bots: false })
  // Reparti au vaisseau en pleine partie : un abandon.
  Object.assign(d, { level: -1, x: 24, z: 8 })
  h2.arena.moved(d)
  const end = h2.last(1, 'arena:end')
  assert.deepEqual([end.winner, end.reason], [0, 'forfeit'])
})

test('arène : seuls les joueurs de la partie se voient', () => {
  const h = harness()
  const a = h.add(1), b = h.add(2), c = h.add(3)
  h.start(a, [b], { size: 1, bots: false })
  assert.deepEqual([...h.arena.mates(a)].sort(), [1, 2])
  assert.equal(h.arena.mates(c).size, 0)
})

test('arène : dans un buisson, on échappe aux bots, sauf de tout près ou si l\'on tire', () => {
  const zone = arenaZone()
  assert.ok(inBush(zone, { x: 5, z: 0 }) && !inBush(zone, { x: 4, z: 0 }))
  assert.ok(arenaHidden(zone, { x: 5, z: 0 }, { x: 1, z: 0 }, false))
  assert.ok(!arenaHidden(zone, { x: 5, z: 0 }, { x: 4, z: 0 }, false), 'de tout près')
  assert.ok(!arenaHidden(zone, { x: 5, z: 0 }, { x: 1, z: 0 }, true), 'il vient de tirer')
  assert.ok(!arenaHidden(zone, { x: 4, z: 0 }, { x: 1, z: 0 }, false), 'à découvert')

  const h = harness()
  const a = h.add(1)
  const game = h.start(a, [], { size: 1, skill: 2 })
  const bot = [...game.fighters.values()].find((f) => f.bot)
  h.advance(R.warmup + R.shield)
  // Le bot à quatre tuiles, rien entre eux : caché dans le buisson, le joueur n'est pas pris pour cible.
  const hold = () => Object.assign(bot, { x: 1, z: 0, path: [], lastSeen: null })
  h.put(a, 5, 0)
  for (let i = 0; i < 20; i++) { hold(); h.advance(0.1) }
  assert.equal(h.events(1, 'hit').length, 0)
  // Il tire : le voilà trahi.
  fireAt(h, a, { x: 6, z: 0 })
  for (let i = 0; i < 20 && !h.events(1, 'hit').length; i++) { hold(); h.advance(0.1) }
  assert.ok(h.events(1, 'hit').length > 0)
})

test('arène : le chef règle la limite de points, la première équipe à l\'atteindre gagne', () => {
  const h = harness()
  const a = h.add(1), b = h.add(2)
  h.arena.handle(a, 'arena:join', { room: 1 })
  h.arena.handle(a, 'arena:settings', { size: 1, bots: false, goal: 5 })
  h.arena.handle(a, 'arena:settings', { goal: 7 })
  assert.equal(h.lobby().rooms[0].goal, 5)
  h.arena.handle(b, 'arena:join', { room: 1 })
  for (const p of [a, b]) h.arena.handle(p, 'arena:ready', { ready: true })
  h.advance(R.countdown + 0.1)
  for (const p of [a, b]) h.arrive(p)
  assert.equal(h.last(1, 'arena:start').goal, 5)
  h.arena.handle(a, 'arena:debug', { score: [4, 0] })
  h.advance(R.warmup + R.shield)
  h.put(a, 1, 0)
  h.put(b, 4, 0)
  for (let i = 0; i < 12 && !h.last(1, 'arena:end'); i++) {
    fireAt(h, a, b)
    h.advance(0.25)
  }
  const end = h.last(2, 'arena:end')
  assert.deepEqual([end.winner, end.reason, end.score], [0, 'score', [5, 0]])
})
