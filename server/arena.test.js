// L'arène (duels par équipes), côté relais : plan, personnages, tirs, salons, bots, dégâts, soins,
// fleurs et flaques, retours à la base, fin.
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createArena } from './arena.js'
import {
  ARENA_CHARACTERS as C, ARENA_LEVEL, ARENA_MAPS, ARENA_RULES as R, CHARACTER_IDS, DEFAULT_CHARACTER, arenaGround, arenaHidden, arenaSight, arenaZone, blastDamage, bushSight, castArena, inBush, lobTarget, shotOrigin,
} from '../shared/arena.js'
import { findPath, mulberry32 } from '../shared/salvage.js'

/** Le personnage par défaut, celui des essais qui n'en choisissent pas d'autre. */
const D = C[DEFAULT_CHARACTER]

/** Relais simulé : joueurs, horloge, messages envoyés. */
function harness(options = {}) {
  let t = 1_000_000
  const players = new Map()
  const sent = []
  const broadcasts = []
  const reports = []
  const arena = createArena({
    playerById: (id) => players.get(id),
    emit: (id, event, data) => sent.push({ id, event, data }),
    broadcast: (event, data) => broadcasts.push({ event, data }),
    report: async (fighter, result) => {
      reports.push({ id: fighter.id, cookie: fighter.cookie, ...result })
      return true
    },
    now: () => t,
    random: mulberry32(11),
    pickMap: () => 'bay',
    debug: true,
    ...options,
  })
  const add = (id) => {
    const p = { id, name: `CMDR ${id}`, verified: true, cookie: `ED_LOGGED_CMDR_ID=jeton-${id}`, level: -1, x: 24, z: 8, yaw: 0, anim: 'idle' }
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
  /** Une partie lancée : le salon de `a`, rejoint par `others`, tous prêts ; `picks` : le personnage de chacun (par identifiant). */
  const start = (a, others = [], settings = {}, picks = {}) => {
    arena.handle(a, 'arena:join', { room: 1, character: picks[a.id] })
    arena.handle(a, 'arena:settings', settings)
    for (const o of others) arena.handle(o, 'arena:join', { room: 1, character: picks[o.id] })
    for (const p of [a, ...others]) arena.handle(p, 'arena:ready', { ready: true })
    advance(R.countdown + 0.1)
    for (const p of [a, ...others]) arrive(p)
    return arena.gameOf(a)
  }
  return { arena, add, advance, last, events, lobby, arrive, put, start, sent, reports, clock: () => t }
}

test('arène : chaque plan est d\'un seul tenant, équitable, trois points d\'apparition par équipe', () => {
  for (const map of ARENA_MAPS) {
    const zone = arenaZone(map.id)
    const plan = map.plan
    const H = plan.length, W = plan[0].length
    assert.equal(zone.id, map.id)
    for (const row of plan) assert.equal(row.length, W, map.id)
    // Obstacles et buissons se répondent d'un bout à l'autre : aucune équipe n'a l'avantage du terrain.
    const kind = (c) => (c === ' ' ? 'vide' : c === 'v' ? 'gouffre' : '#=HcpPoX'.includes(c) ? 'plein' : c === 'g' ? 'buisson' : c === 'G' ? 'brume en haut' : c === 'A' || c === 'B' ? 'base' : c === 'u' ? 'haut' : c === 'r' ? 'rampe' : 'sol')
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) assert.equal(kind(plan[z][x]), kind(plan[H - 1 - z][W - 1 - x]), `${map.id} (${x}, ${z})`)
    assert.equal(zone.spawns[0].length, R.team, map.id)
    assert.equal(zone.spawns[1].length, R.team, map.id)
    // Chaque équipe à son bout : l'une à l'ouest, l'autre à l'est (la caméra se tient derrière sa base).
    assert.ok(Math.max(...zone.spawns[0].map((s) => s.x)) < W / 3 && Math.min(...zone.spawns[1].map((s) => s.x)) > (2 * W) / 3, map.id)
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
    assert.equal(seen.size, [...zone.blocked].filter((b) => !b).length, `${map.id} : d'un seul tenant`)
    // D'une base, on ne voit pas l'autre.
    for (const a of zone.spawns[0]) for (const b of zone.spawns[1]) assert.ok(!arenaSight(zone, a, b), `${map.id} : (${a.x}, ${a.z}) voit (${b.x}, ${b.z})`)
  }
})

test('arène : le site gardien se joue sur deux hauteurs, au-dessus du gouffre', () => {
  const zone = arenaZone('guardian')
  const top = zone.top
  const free = (x, z) => !zone.blocked[z * zone.width + x]
  assert.ok(top > R.aim && top + R.aim < R.body.h, 'd\'en bas, un tir à plat bute sur le flanc du haut ; d\'en haut, il touche qui est en bas')
  // Le sanctuaire en hauteur, à bras de cinq tuiles ; les ponts et les esplanades au sol ; une rampe qui monte vers l'est.
  for (let z = 6; z <= 10; z++) assert.equal(arenaGround(zone, { x: 9, z }), top)
  for (let x = 9; x <= 13; x++) assert.equal(arenaGround(zone, { x, z: 5 }), top)
  assert.equal(arenaGround(zone, { x: 8, z: 1 }), 0)
  assert.ok(Math.abs(arenaGround(zone, { x: 6, z: 8 }) - top / 2) < 1e-6)
  assert.ok(arenaGround(zone, { x: 6.4, z: 8 }) > arenaGround(zone, { x: 5.7, z: 8 }))
  // De la brume en haut des rampes : on s'y cache, sur le haut.
  assert.ok(inBush(zone, { x: 7, z: 6 }) && arenaGround(zone, { x: 7, z: 6 }) === top)
  assert.ok(arenaHidden(zone, { x: 7, z: 6 }, { x: 11, z: 8 }, false))
  // Les rampes, de toute la largeur des bras : cinq de front.
  for (let z = 6; z <= 10; z++) assert.equal(zone.stairs[z * zone.width + 6], 1)
  for (let x = 9; x <= 13; x++) assert.equal(zone.stairs[4 * zone.width + x], 2)
  // On ne marche pas dans un gouffre ; on ne gagne le haut que par ses rampes.
  assert.ok(!free(6, 4) && zone.pit[4 * zone.width + 6])
  const adj = (x, z, dir) => zone.adj[(z * zone.width + x) * 4 + dir]
  assert.ok(adj(4, 8, 1) >= 0 && adj(5, 8, 1) >= 0 && adj(6, 8, 1) >= 0, 'l\'esplanade, le palier, la rampe ouest, le haut')
  assert.ok(adj(6, 7, 2) >= 0, 'deux rampes jumelles se rejoignent')
  assert.ok(adj(10, 2, 2) >= 0 && adj(10, 3, 2) >= 0 && adj(10, 4, 2) >= 0, 'du pont nord au bras nord du sanctuaire')
  const path = findPath(zone, zone.spawns[0][0], { x: 11, z: 6 })
  assert.ok(path && path.some((t) => zone.stairs[t.z * zone.width + t.x] >= 0), 'on monte par une rampe')
  assert.ok(path.every((t) => !zone.pit[t.z * zone.width + t.x]))
  const north = { x: 0, y: 0, z: -1 }, south = { x: 0, y: 0, z: 1 }, east = { x: 1, y: 0, z: 0 }
  // Par-dessus le gouffre, on se tire dessus : de l'esplanade au pont nord.
  const across = { x: 4, y: R.aim, z: 5 }, to = { x: 8, z: 2 }
  const len = Math.hypot(to.x - across.x, to.z - across.z)
  let hit = castArena(zone, across, { x: (to.x - across.x) / len, y: 0, z: (to.z - across.z) / len }, 20, [{ id: 2, ...to }])
  assert.equal(hit.body, 2)
  assert.ok(arenaSight(zone, across, to))
  // Un tir à plat, du pont : il bute sur le flanc du sanctuaire, de l'autre côté du gouffre.
  hit = castArena(zone, { x: 8, y: R.aim, z: 2 }, south, 20, [])
  assert.ok(Math.abs(hit.t - 3.5) < 1e-6)
  assert.deepEqual(hit.normal, [0, 0, -1])
  // Du sanctuaire, par-dessus le gouffre : il touche qui est sur le pont.
  hit = castArena(zone, { x: 8, y: top + R.aim, z: 6 }, north, 20, [{ id: 3, x: 8, z: 2 }])
  assert.equal(hit.body, 3)
  // D'en bas, vers la poitrine de qui est en haut : touché près du bord, couvert plus loin.
  const aimAt = (from, at) => {
    const dx = at.x - from.x, dy = top + R.aim - from.y, dz = at.z - from.z, l = Math.hypot(dx, dy, dz)
    return { x: dx / l, y: dy / l, z: dz / l }
  }
  const bridge = { x: 8, y: R.aim, z: 1 }
  assert.equal(castArena(zone, bridge, aimAt(bridge, { x: 8, z: 6.2 }), 20, [{ id: 4, x: 8, z: 6.2 }]).body, 4)
  // Sur le palier de la rampe ouest : qui s'écarte du bord, la crête de la rampe le couvre.
  const landing = { x: 5.4, y: R.aim, z: 8 }
  assert.equal(castArena(zone, landing, aimAt(landing, { x: 7, z: 8 }), 20, [{ id: 4, x: 7, z: 8 }]).body, 4)
  assert.equal(castArena(zone, landing, aimAt(landing, { x: 9, z: 8 }), 20, [{ id: 4, x: 9, z: 8 }]).body, null)
  assert.ok(!arenaSight(zone, landing, { x: 9, z: 8 }))
  // Tirée d'en bas, même de plus haut que le rebord (l'œil, en vue subjective), elle ne redescend pas
  // de l'autre côté du sanctuaire : elle s'arrête au bout du haut qu'elle survole (en haut de la rampe sud).
  hit = castArena(zone, { x: 10, y: 0.66, z: 2 }, south, 20, [{ id: 5, x: 10, z: 15 }])
  assert.equal(hit.body, null)
  assert.ok(Math.abs(hit.t - 9.5) < 1e-6)
  // D'une esplanade à l'autre, le sanctuaire arrête le regard et les balles.
  assert.ok(!arenaSight(zone, { x: 4, z: 8 }, { x: 18, z: 8 }))
  assert.ok(!castArena(zone, { x: 2, y: R.aim, z: 7 }, east, 30, [{ id: 6, x: 20, z: 7 }]).body)
})

test('arène : on ne prend que les personnages que ses quêtes ont ouverts', () => {
  const open = new Map([[1, []], [2, ['marcel', 'betty']]])
  const h = harness({ unlocked: (p) => open.get(p.id) ?? [] })
  const a = h.add(1), b = h.add(2)
  // Aucun personnage : pas de lobby.
  h.arena.handle(a, 'arena:join', { room: 1, character: 'rourke' })
  assert.equal(h.last(1, 'arena:error').code, 'locked')
  assert.equal(h.arena.snapshot().rooms[0].members.length, 0)
  // Un personnage fermé demandé : le premier ouvert à la place.
  h.arena.handle(b, 'arena:join', { room: 1, character: 'nico' })
  assert.equal(h.lobby().rooms[0].members[0].character, 'marcel')
  h.arena.handle(b, 'arena:character', { character: 'jacques' })
  assert.equal(h.last(2, 'arena:error').code, 'locked')
  h.arena.handle(b, 'arena:character', { character: 'betty' })
  assert.equal(h.lobby().rooms[0].members[0].character, 'betty')
  // Sa quête terminée, le personnage s'ouvre.
  open.set(1, ['rourke'])
  h.arena.handle(a, 'arena:join', { room: 1 })
  assert.equal(h.lobby().rooms[0].members.find((m) => m.id === 1).character, 'rourke')
})

test('arène : le plan est tiré au hasard au lancement ; la partie s\'y joue, et le relais n\'accepte que son sol', () => {
  // Le tirage tombe sur le dernier plan, la ruche.
  const h = harness({ pickMap: undefined, random: () => 0.99 })
  const a = h.add(1), b = h.add(2)
  h.arena.handle(a, 'arena:join', { room: 1 })
  assert.equal(h.lobby().rooms[0].map, null)
  h.arena.handle(a, 'arena:settings', { size: 1, bots: false, map: 'bay' })
  // Le plan ne se choisit pas.
  assert.equal(h.lobby().rooms[0].map, null)
  h.arena.handle(b, 'arena:join', { room: 1 })
  for (const p of [a, b]) h.arena.handle(p, 'arena:ready', { ready: true })
  h.advance(R.countdown + 0.1)
  assert.equal(h.last(1, 'arena:start').map, 'hive')
  assert.equal(h.lobby().rooms[0].map, 'hive')
  for (const p of [a, b]) h.arrive(p)
  const game = h.arena.gameOf(a)
  assert.equal(game.zone.id, 'hive')
  // Après le coup d'envoi (avant, chacun reste dans sa base) : le coin de la chrysalide est hors du
  // terrain ; le cœur de la ruche, un obstacle.
  h.advance(R.warmup + 0.1)
  h.put(a, 1, 3)
  assert.ok(h.arena.accepts(a, 1.4, 3.4))
  assert.ok(!h.arena.accepts(a, 0.4, 3))
  h.put(a, 9, 7)
  assert.ok(h.arena.accepts(a, 9.4, 7))
  assert.ok(!h.arena.accepts(a, 9.6, 7))
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
  const tomato = C.marcel.weapon
  assert.equal(blastDamage(tomato, 0), tomato.damage)
  assert.ok(blastDamage(tomato, 0.8) < blastDamage(tomato, 0.2))
  assert.equal(blastDamage(tomato, tomato.blast + R.body.r + 0.01), 0)
})

test('arène : six personnages, chacun ses forces et ses faiblesses', () => {
  assert.deepEqual(CHARACTER_IDS, ['rourke', 'marcel', 'nico', 'betty', 'capucine', 'jacques'])
  const stats = CHARACTER_IDS.map((id) => ({ id, ...C[id] }))
  // Chacun a ce qu'il faut : points de vie, vitesse, et une arme complète.
  for (const c of stats) {
    assert.ok(c.hp > 0 && c.speed > 0, c.id)
    for (const key of ['interval', 'mag', 'reload', 'speed', 'pellets', 'damage', 'range', 'reach']) assert.ok(c.weapon[key] > 0, `${c.id}.${key}`)
    assert.ok(c.weapon.reach < c.weapon.range, `${c.id} : un bot tire en deçà de sa portée`)
  }
  // Les tanks sont lents et solides, Nico rapide et fragile, Rourke au milieu de tout.
  const most = (key) => stats.reduce((a, b) => (b[key] > a[key] ? b : a)).id
  const least = (key) => stats.reduce((a, b) => (b[key] < a[key] ? b : a)).id
  assert.equal(most('hp'), 'marcel')
  assert.equal(least('speed'), 'marcel')
  assert.equal(most('speed'), 'nico')
  assert.equal(least('hp'), 'nico')
  assert.ok(C.jacques.hp > C.rourke.hp && C.jacques.speed < C.rourke.speed)
  assert.equal(stats.reduce((a, b) => (b.weapon.range > a.weapon.range ? b : a)).id, 'nico')
  assert.equal(stats.reduce((a, b) => (b.weapon.damage > a.weapon.damage ? b : a)).id, 'nico')
  // Aucun n'est le meilleur partout : le plus solide n'est ni le plus rapide, ni celui qui porte le plus loin.
  for (const c of stats) assert.ok(!(c.id === most('hp') && c.id === most('speed')), c.id)
  // Ce qui n'appartient qu'à un seul : les soins de Betty, les fleurs de Capucine, la flaque de Jacques, le scan de Boulon.
  assert.deepEqual(stats.filter((c) => c.weapon.heal).map((c) => c.id), ['betty'])
  assert.deepEqual(stats.filter((c) => c.weapon.flower).map((c) => c.id), ['capucine'])
  assert.deepEqual(stats.filter((c) => c.weapon.fire).map((c) => c.id), ['jacques'])
  assert.deepEqual(stats.filter((c) => c.weapon.lob).map((c) => c.id), ['capucine', 'jacques'])
  assert.deepEqual(stats.filter((c) => c.weapon.blast).map((c) => c.id), ['marcel', 'jacques'])
  assert.deepEqual(stats.filter((c) => c.scan).map((c) => c.id), ['nico'])
})

test('arène : on se place dans un lobby, dans le camp le moins garni, on change de camp', () => {
  const h = harness()
  const a = h.add(1), b = h.add(2), c = h.add(3)
  const id = 1
  h.arena.handle(a, 'arena:join', { room: id, character: 'nico' })
  h.arena.handle(b, 'arena:join', { room: id })
  h.arena.handle(c, 'arena:join', { room: id, team: 1 })
  let room = h.lobby().rooms[0]
  assert.deepEqual(room.members.map((m) => [m.id, m.team, m.character]), [[1, 0, 'nico'], [2, 1, 'rourke'], [3, 1, 'rourke']])
  h.arena.handle(c, 'arena:side', { team: 0 })
  h.arena.handle(c, 'arena:character', { character: 'betty' })
  h.arena.handle(c, 'arena:character', { character: 'tessa' })
  room = h.lobby().rooms[0]
  assert.deepEqual(room.members[2], { id: 3, name: 'CMDR 3', verified: true, team: 0, character: 'betty', ready: false })
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
  assert.deepEqual(room(2), { id: 2, leader: null, map: null, size: 3, bots: true, skill: 1, goal: R.goal, status: 'forming', startsIn: undefined, members: [] })
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
  // Même en poursuivant un adversaire jusque chez lui, un bot s'arrête à la frontière de sa base.
  h.advance(R.warmup + 8)
  const nearEdge = R.baseDepth - 0.5
  const farEdge = game.zone.width - R.baseDepth - 0.5
  for (const f of game.fighters.values()) {
    if (!f.bot) continue
    assert.ok(f.team === 0 ? f.x < farEdge : f.x > nearEdge, `bot ${f.id} hors de la base adverse`)
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

test('arène : chaque camp reste à sa base avant le départ et ne peut jamais entrer dans la base adverse', () => {
  const h = harness()
  const a = h.add(1)
  h.start(a, [], { size: 1 })
  h.put(a, R.baseDepth - 0.6, 2)
  assert.equal(h.arena.accepts(a, R.baseDepth - 0.4, 2), false, 'sortie avant le coup d’envoi')
  h.advance(R.warmup + 0.1)
  assert.equal(h.arena.accepts(a, R.baseDepth - 0.4, 2), true, 'sortie autorisée après le coup d’envoi')
  const enemyEdge = arenaZone().width - R.baseDepth - 0.5
  h.put(a, enemyEdge - 0.1, 2)
  assert.equal(h.arena.accepts(a, enemyEdge + 0.1, 2), false, 'base adverse interdite')
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
  // La mitraillette de Rourke contre Rourke : treize balles.
  assert.equal(shots, Math.ceil(D.hp / D.weapon.damage))
  assert.equal(h.events(2, 'shot').length, shots, 'l\'autre joueur voit chaque tir')
  assert.equal(h.events(1, 'shot').length, 0, 'le tireur ne reçoit pas ses propres tirs')
  const kill = h.events(1, 'kill')[0]
  assert.deepEqual([kill.id, kill.by, kill.score], [2, 1, [1, 0]])
  // Il attend déjà à sa base, en fantôme : l'annonce dit où il est tombé, et où il reparaît.
  assert.deepEqual(kill.from, { x: 4, z: 0 })
  assert.ok(game.zone.spawns[1].some((s) => s.x === kill.x && s.z === kill.z))
  assert.deepEqual([game.fighters.get(2).x, game.fighters.get(2).z], [kill.x, kill.z])
  // Éliminé : sa position n'est plus acceptée ; il revient à sa base, protégé, points de vie pleins.
  assert.ok(!h.arena.accepts(b, 9, 2))
  h.advance(R.respawn + 0.1)
  const spawn = h.events(2, 'spawn').pop()
  assert.equal(spawn.id, 2)
  const f = game.fighters.get(2)
  assert.ok(f.alive && f.hp === D.hp)
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
  const w = D.weapon
  const most = w.mag + Math.ceil(10 * (w.mag / (w.mag * w.interval + w.reload))) + 1
  assert.ok(h.events(2, 'shot').length <= most, `${h.events(2, 'shot').length} tirs`)
})

test('arène : une balle s\'éteint au bout de la portée de son arme ; la tomate y éclate', () => {
  const h = harness()
  const a = h.add(1), b = h.add(2)
  const game = h.start(a, [b], { size: 1, bots: false })
  h.advance(R.warmup + R.shield)
  // La cour centrale est libre de (5, 5) à (11, 5). À la mitraillette : touché en deçà de la portée, pas au-delà.
  const reach = D.weapon.range
  assert.ok(reach > 3 && reach < 5.6)
  h.put(a, 5, 5)
  h.put(b, 5 + reach - 0.5, 5)
  fireAt(h, a, b)
  h.advance(0.5)
  assert.equal(h.events(1, 'hit').length, 1)
  h.put(b, 5 + reach + R.body.r + 0.3, 5)
  h.advance(0.5)
  fireAt(h, a, b)
  h.advance(0.5)
  assert.equal(h.events(1, 'hit').length, 1, 'hors de portée')
  assert.equal(game.bullets.length, 0, 'la balle s\'est éteinte')
  // La tomate de Marcel éclate au bout de sa course, même sans rien toucher : qui s'y tient est éclaboussé.
  const fa = game.fighters.get(1)
  Object.assign(fa, { character: 'marcel', tokens: 3 })
  game.fighters.get(2).hp = D.hp
  h.put(a, 5, 5)
  h.put(b, 5 + C.marcel.weapon.range, 5.6)
  h.advance(1.5)
  fireAt(h, a, { x: 8, z: 5 })
  h.advance(1)
  const blast = h.events(1, 'hit').slice(1)
  assert.deepEqual(blast.map((e) => e.id), [2])
  assert.ok(blast[0].dmg > 0 && blast[0].dmg < C.marcel.weapon.damage)
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

test('arène : le laser de Nico traverse, la tomate de Marcel éclabousse, et un tir ne part qu\'avec ses projectiles', () => {
  const h = harness()
  const a = h.add(1), b = h.add(2), c = h.add(3)
  h.arena.handle(a, 'arena:join', { room: 1, character: 'nico' })
  h.arena.handle(a, 'arena:settings', { size: 2, bots: false })
  const room = h.lobby().rooms[0].id
  h.arena.handle(b, 'arena:join', { room, team: 1 })
  h.arena.handle(c, 'arena:join', { room, team: 1 })
  for (const p of [a, b, c]) h.arena.handle(p, 'arena:ready', { ready: true })
  h.advance(R.countdown + 0.1)
  for (const p of [a, b, c]) h.arrive(p)
  const game = h.arena.gameOf(a)
  h.advance(R.warmup + R.shield)
  // Deux adversaires en enfilade : le laser les touche tous les deux, et fort.
  h.put(a, 1, 0)
  h.put(b, 3, 0)
  h.put(c, 4, 0)
  fireAt(h, a, b)
  h.advance(0.3)
  assert.deepEqual(h.events(1, 'hit').map((e) => [e.id, e.dmg]), [[2, C.nico.weapon.damage], [3, C.nico.weapon.damage]])
  // Marcel : une tomate entre les deux, qui les éclabousse l'un et l'autre, sans jamais le blesser lui.
  const fa = game.fighters.get(1)
  Object.assign(fa, { character: 'marcel', tokens: 3 })
  for (const f of game.fighters.values()) f.hp = f.max
  h.put(b, 9.9, 1.5)
  h.put(c, 9.9, 0.5)
  h.put(a, 6, 1)
  h.advance(1.5)
  const before = h.events(1, 'hit').length
  fireAt(h, a, { x: 10, z: 1 })
  h.advance(1)
  const blast = h.events(1, 'hit').slice(before)
  assert.deepEqual(blast.map((e) => e.id).sort(), [2, 3])
  assert.ok(blast.every((e) => e.dmg > 0 && e.dmg < C.marcel.weapon.damage))
  // Un tir ne part qu'avec les projectiles de l'arme, quoi qu'envoie le client.
  h.advance(1.5)
  h.put(b, 14, 10)
  h.put(c, 15, 10)
  fireAt(h, a, { x: 7, z: 1 }, 30)
  assert.equal(h.events(2, 'shot').pop().d.length, C.marcel.weapon.pellets)
})

test('arène : on garde son personnage toute la partie ; ses points de vie et sa vitesse sont les siens', () => {
  const h = harness()
  const a = h.add(1), b = h.add(2)
  const game = h.start(a, [b], { size: 1, bots: false }, { 1: 'marcel', 2: 'nico' })
  const start = h.last(1, 'arena:start')
  assert.deepEqual(start.fighters.map((f) => [f.id, f.character]), [[1, 'marcel'], [2, 'nico']])
  assert.deepEqual([game.fighters.get(1).hp, game.fighters.get(2).hp], [C.marcel.hp, C.nico.hp])
  // En partie, on ne change pas de personnage.
  h.arena.handle(a, 'arena:character', { character: 'betty' })
  assert.equal(game.fighters.get(1).character, 'marcel')
  assert.equal(h.lobby().rooms[0].members[0].character, 'marcel')
  // Nico court plus vite que Marcel : en deux secondes, il va plus loin.
  h.advance(R.warmup + R.shield)
  h.put(a, 3, 5)
  h.put(b, 3, 5)
  h.advance(2)
  assert.ok(h.arena.accepts(b, 11, 5), 'Nico')
  assert.ok(!h.arena.accepts(a, 11, 5), 'Marcel')
  // Hors de combat, chacun remonte à ses propres points de vie.
  game.fighters.get(1).hp = 10
  h.advance(R.regenAfter + 12)
  assert.equal(game.fighters.get(1).hp, C.marcel.hp)
  // Éliminé, il revient le même, points de vie pleins.
  Object.assign(game.fighters.get(2), { hp: 1, shieldUntil: 0 })
  h.put(a, 1, 0)
  h.put(b, 3, 0)
  h.advance(1.5)
  fireAt(h, a, b)
  h.advance(1)
  assert.equal(h.events(1, 'kill').length, 1)
  h.advance(R.respawn + 0.2)
  const f = game.fighters.get(2)
  assert.deepEqual([f.alive, f.character, f.hp], [true, 'nico', C.nico.hp])
})

test('arène : Betty soigne les siens et blesse ceux d\'en face ; ses seringues traversent qui est en pleine forme', () => {
  const h = harness()
  const a = h.add(1), b = h.add(2), c = h.add(3)
  const game = h.start(a, [b, c], { size: 2, bots: false }, { 1: 'betty', 3: 'marcel' })
  assert.equal(game.fighters.get(3).team, 0)
  h.advance(R.warmup + R.shield)
  const mate = game.fighters.get(3)
  // Un coéquipier en pleine forme dans la ligne de tir : la seringue passe, et blesse l'adversaire derrière lui.
  h.put(a, 1, 0)
  h.put(c, 2, 0)
  h.put(b, 4, 0)
  fireAt(h, a, b)
  h.advance(0.5)
  assert.deepEqual(h.events(1, 'hit').map((e) => [e.id, e.dmg]), [[2, C.betty.weapon.damage]])
  assert.equal(h.events(1, 'heal').length, 0)
  // Blessé, il est soigné, sans dépasser ses points de vie de départ ; l'adversaire derrière est épargné.
  mate.hp = mate.max - 30
  mate.hurtAt = h.clock()
  fireAt(h, a, b)
  h.advance(0.5)
  const heal = h.events(1, 'heal')
  assert.deepEqual(heal.map((e) => [e.id, e.by, e.amount]), [[3, 1, C.betty.weapon.heal]])
  assert.equal(mate.hp, mate.max - 30 + C.betty.weapon.heal)
  assert.equal(h.events(1, 'hit').length, 1)
  fireAt(h, a, b)
  h.advance(0.5)
  assert.equal(mate.hp, mate.max)
  assert.equal(h.events(1, 'heal').pop().amount, 30 - C.betty.weapon.heal)
  // Elle ne se soigne pas elle-même : ses seringues partent de sa main, elle n'est pas sur le trajet.
  const end = (() => {
    h.arena.handle(b, 'arena:quit', {})
    return h.last(1, 'arena:end')
  })()
  assert.equal(end.stats.find((x) => x.id === 1).heal, 30)
})

test('arène : la graine de Capucine passe par-dessus un conteneur, et la fleur qui pousse mord qui s\'approche', () => {
  const h = harness()
  const a = h.add(1), b = h.add(2)
  const game = h.start(a, [b], { size: 1, bots: false }, { 1: 'capucine' })
  h.advance(R.warmup + R.shield)
  const seed = C.capucine.weapon
  // Le conteneur debout de (7, 2) entre elle et sa cible : la graine passe par-dessus.
  h.put(a, 5, 2)
  h.put(b, 9, 2)
  h.arena.handle(a, 'arena:fire', { o: [5, R.aim, 2], d: [[1, 0, 0]], r: 4 })
  const shot = h.events(2, 'shot').pop()
  assert.deepEqual(shot.to, [9, 2])
  h.advance(shot.dur + 0.1)
  assert.deepEqual(game.traps.map((x) => [x.kind, x.team, x.x, x.z]), [['flower', 0, 9, 2]])
  // Elle sort de terre, s'arme (on voit sur qui, et dans combien de temps elle mord), puis mord, une fois par intervalle.
  h.advance(seed.flower.grow + 0.1)
  const armed = h.last(2, 'arena:state').traps[0]
  assert.equal(armed.kind, 'flower')
  assert.equal(armed.aim, 2)
  assert.ok(armed.strike > 0 && armed.strike <= seed.flower.windup)
  assert.equal(h.events(2, 'hit').filter((e) => e.trap).length, 0, 'pas encore')
  h.advance(seed.flower.windup + seed.flower.every * 2 + 0.05 - 0.1)
  const bites = h.events(2, 'hit').filter((e) => e.trap)
  assert.equal(bites.length, 3)
  assert.ok(bites.every((e) => e.id === 2 && e.by === 1 && e.dmg === seed.damage))
  // Hors de portée de ses mâchoires, plus rien.
  h.put(b, 9, 5)
  const was = h.events(2, 'hit').length
  h.advance(1.5)
  assert.equal(h.events(2, 'hit').length, was)
  // Pas plus de deux fleurs à la fois : la plus vieille fane.
  for (const r of [2, 3]) {
    h.advance(seed.interval + 1.5)
    h.put(a, 5, 5)
    h.arena.handle(a, 'arena:fire', { o: [5, R.aim, 5], d: [[1, 0, 0]], r })
    h.advance(1)
  }
  assert.deepEqual(game.traps.map((x) => [x.x, x.z]), [[7, 5], [8, 5]])
  // Elles fanent au bout de leur temps.
  h.advance(seed.flower.life + 0.1)
  assert.equal(game.traps.length, 0)
})

test('arène : la fleur de Capucine s\'arme avant de mordre ; qui sort à temps de sa portée y échappe', () => {
  const h = harness()
  const a = h.add(1), b = h.add(2)
  const game = h.start(a, [b], { size: 1, bots: false }, { 1: 'capucine' })
  h.advance(R.warmup + R.shield)
  const seed = C.capucine.weapon
  h.put(a, 5, 5)
  h.put(b, 12, 5)
  h.arena.handle(a, 'arena:fire', { o: [5, R.aim, 5], d: [[1, 0, 0]], r: 4 })
  h.advance(1)
  assert.equal(game.traps.length, 1)
  const flower = game.traps[0]
  // Il approche : elle s'arme sur lui…
  h.put(b, flower.x + 1, flower.z)
  h.advance(0.1)
  assert.equal(h.last(2, 'arena:state').traps[0].aim, 2)
  // … et il recule hors de portée avant qu'elle ne morde : rien.
  h.put(b, flower.x + seed.flower.radius + 1, flower.z)
  h.advance(seed.flower.windup + 0.1)
  assert.equal(h.events(2, 'hit').filter((e) => e.trap).length, 0)
  assert.equal(h.last(2, 'arena:state').traps[0].aim, undefined, 'elle se repose, et s\'armera de nouveau')
  // Il revient et reste : elle s'arme, et mord.
  h.put(b, flower.x + 1, flower.z)
  h.advance(seed.flower.every + seed.flower.windup + 0.1)
  assert.ok(h.events(2, 'hit').filter((e) => e.trap).length >= 1)
})

test('arène : le cocktail de Jacques éclate là où il retombe, et sa flaque brûle ceux d\'en face', () => {
  const h = harness()
  const a = h.add(1), b = h.add(2), c = h.add(3)
  const game = h.start(a, [b, c], { size: 2, bots: false }, { 1: 'jacques' })
  assert.equal(game.fighters.get(3).team, 0)
  h.advance(R.warmup + R.shield)
  const cocktail = C.jacques.weapon
  // Lancé par-dessus le conteneur de (7, 2), il retombe sur l'adversaire ; le coéquipier à côté n'a rien.
  h.put(a, 5, 2)
  h.put(b, 9, 2)
  h.put(c, 9, 1.4)
  h.arena.handle(a, 'arena:fire', { o: [5, R.aim, 2], d: [[1, 0, 0]], r: 4 })
  const shot = h.events(2, 'shot').pop()
  h.advance(shot.dur + 0.05)
  const splash = h.events(1, 'hit')
  assert.deepEqual(splash.map((e) => [e.id, e.dmg]), [[2, cocktail.damage]])
  assert.deepEqual(game.traps.map((x) => [x.kind, x.x, x.z]), [['fire', 9, 2]])
  // La flaque brûle tant qu'on s'y tient, puis s'éteint.
  h.advance(cocktail.fire.life + 0.1)
  const burns = h.events(1, 'hit').filter((e) => e.trap)
  assert.ok(burns.length >= Math.floor(cocktail.fire.life / cocktail.fire.every) - 1, `${burns.length} brûlures`)
  assert.ok(burns.every((e) => e.id === 2 && e.dmg === cocktail.fire.damage))
  assert.equal(game.traps.length, 0)
  // Visé sur un obstacle, il retombe à la dernière tuile libre en deçà.
  const zone = arenaZone()
  assert.deepEqual(lobTarget(zone, { x: 5, z: 2 }, { x: 1, z: 0 }, 2, cocktail.range), { x: 6.4, z: 2 })
  assert.deepEqual(lobTarget(zone, { x: 5, z: 2 }, { x: 1, z: 0 }, 20, cocktail.range), { x: 11, z: 2 })
})

test('arène : le cône de visée prévoit le tir du relais, d\'où il part jusqu\'où il retombe, même contre un obstacle', () => {
  const zone = arenaZone()
  // En terrain libre, le tir part de la main ; si elle passe dans un conteneur, ou trop loin, des pieds.
  assert.deepEqual(shotOrigin(zone, { x: 5, z: 2 }, { x: 5.3, z: 2 }), { x: 5.3, z: 2 })
  assert.deepEqual(shotOrigin(zone, { x: 6.4, z: 2 }, { x: 6.7, z: 2 }), { x: 6.4, z: 2 })
  assert.deepEqual(shotOrigin(zone, { x: 5, z: 2 }, { x: 6.3, z: 2 }), { x: 5, z: 2 })
  const h = harness()
  const a = h.add(1), b = h.add(2)
  h.start(a, [b], { size: 1, bots: false }, { 1: 'capucine' })
  h.advance(R.warmup + R.shield)
  h.put(b, 12, 9)
  const seed = C.capucine.weapon
  const diagonal = { x: Math.SQRT1_2, z: Math.SQRT1_2 }
  // Les pieds, la main, la direction, la distance voulue : ce que le cône calcule (cf. ArenaGun.sightCone),
  // et ce que le relais fait retomber.
  const cases = [
    [{ x: 5, z: 2 }, { x: 5.3, z: 2 }, { x: 1, z: 0 }, 4],
    [{ x: 6.4, z: 2 }, { x: 6.7, z: 2 }, { x: 1, z: 0 }, 3],
    [{ x: 5, z: 5 }, { x: 5 + 0.3 * diagonal.x, z: 5 + 0.3 * diagonal.z }, diagonal, 20],
    [{ x: 8, z: 4.4 }, { x: 8.3, z: 4.4 }, { x: 1, z: 0 }, 1.2],
  ]
  for (const [foot, hand, dir, r] of cases) {
    h.put(a, foot.x, foot.z)
    const expected = lobTarget(zone, shotOrigin(zone, foot, hand), dir, r, seed.range)
    h.arena.handle(a, 'arena:fire', { o: [hand.x, R.aim, hand.z], d: [[dir.x, 0, dir.z]], r })
    const shot = h.events(2, 'shot').pop()
    assert.deepEqual(shot.to, [expected.x, expected.z], `de (${foot.x}, ${foot.z}) vers (${dir.x.toFixed(2)}, ${dir.z.toFixed(2)})`)
    h.advance(seed.interval + seed.reload)
  }
  // Une balle : elle s'arrête là où s'arrête la ligne du milieu du cône (le premier obstacle, ou la portée).
  const rifle = C.nico.weapon
  const from = { x: 5.3, y: R.aim, z: 2 }
  assert.ok(Math.abs(castArena(zone, from, { x: 1, y: 0, z: 0 }, rifle.range, []).t - 1.2) < 1e-6, 'le conteneur de (7, 2)')
  assert.equal(castArena(zone, { x: 5, y: R.aim, z: 7 }, { x: 0, y: 0, z: -1 }, rifle.range, []).t, 7.5, 'le bord nord de l\'arène, en deçà de la portée')
  assert.equal(castArena(zone, { x: 5, y: R.aim, z: 7 }, { x: 0, y: 0, z: -1 }, 6, []).t, 6, 'la portée, sans rien en deçà')
})

test('arène : les bots se cherchent, se tirent dessus, et la partie se joue en manches', () => {
  const h = harness()
  const a = h.add(1)
  const game = h.start(a, [], { size: 2, skill: 2, goal: 5 })
  // Le joueur reste à sa base ; les trois bots font la partie.
  let ended = null
  for (let i = 0; i < 1000 && !ended; i++) {
    h.advance(1)
    ended = h.last(1, 'arena:end')
  }
  assert.ok(ended, 'la partie se termine')
  assert.ok(['score', 'time'].includes(ended.reason))
  assert.ok(h.events(1, 'shot').length > 10, 'des tirs')
  assert.ok(h.events(1, 'kill').length > 0, 'des éliminations')
  // Deux manches gagnantes, trois manches au plus.
  const rounds = h.events(1, 'round').length + 1
  assert.ok(rounds >= R.wins && rounds <= R.rounds, `${rounds} manches`)
  assert.ok(Math.max(...ended.rounds) === R.wins || rounds === R.rounds)
  assert.equal(ended.stats.length, 4)
  // Les bots restent sur le sol de l'arène.
  for (const f of game.fighters.values()) assert.ok(!game.zone.blocked[Math.round(f.z) * game.zone.width + Math.round(f.x)], f.name)
  assert.equal(h.lobby().rooms[0].status, 'forming')
})

test('arène : au bout du temps, l\'équipe en tête gagne la manche ; à égalité, personne', () => {
  const h = harness()
  const a = h.add(1), b = h.add(2)
  const game = h.start(a, [b], { size: 1, bots: false })
  h.arena.handle(a, 'arena:debug', { score: [3, 2] })
  h.advance(R.warmup + R.duration + 0.2)
  // La première manche à l'équipe en tête : la partie continue.
  assert.equal(h.last(2, 'arena:end'), undefined)
  let round = h.events(2, 'round').pop()
  assert.deepEqual([round.round, round.winner, round.reason, round.score, round.rounds], [1, 0, 'time', [3, 2], [1, 0]])
  assert.deepEqual([game.round, game.score], [2, [0, 0]])
  // Une manche nulle ne rapporte rien à personne ; après la troisième, l'équipe qui en a le plus l'emporte.
  h.advance(R.intermission + R.duration + 0.2)
  round = h.events(2, 'round').pop()
  assert.deepEqual([round.round, round.winner, round.rounds], [2, -1, [1, 0]])
  h.advance(R.intermission + R.duration + 0.2)
  const end = h.last(2, 'arena:end')
  assert.deepEqual([end.winner, end.reason, end.rounds], [0, 'time', [1, 0]])
  assert.equal(game.ended, true)
  // Le lobby reste ouvert : une autre partie, trois manches nulles, et personne ne gagne.
  for (const p of [a, b]) Object.assign(p, { level: -1, x: 24, z: 8 })
  for (const p of [a, b]) h.arena.handle(p, 'arena:ready', { ready: true })
  h.advance(R.countdown + 0.1)
  for (const p of [a, b]) h.arrive(p)
  h.advance(R.warmup + R.duration + 0.2 + 2 * (R.intermission + R.duration + 0.2))
  assert.deepEqual([h.last(1, 'arena:end').winner, h.last(1, 'arena:end').rounds], [-1, [0, 0]])
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
  assert.deepEqual(h.lobby().rooms[0], { id: 1, leader: null, map: null, size: 3, bots: true, skill: 1, goal: R.goal, status: 'forming', startsIn: undefined, members: [] })

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
  // Rourke, qui porte à plus de quatre tuiles : c'est le buisson qu'on essaie, pas la portée.
  bot.character = 'rourke'
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
  // Nico, que Boulon renseigne, voit dans un buisson de plus loin que les autres.
  assert.ok(bushSight('nico') > bushSight('rourke'))
  assert.ok(arenaHidden(zone, { x: 5, z: 0 }, { x: 2.5, z: 0 }, false, bushSight('rourke')))
  assert.ok(!arenaHidden(zone, { x: 5, z: 0 }, { x: 2.5, z: 0 }, false, bushSight('nico')))
})

test('arène : le chef règle la limite de points ; deux manches gagnantes font la partie', () => {
  const h = harness()
  const a = h.add(1), b = h.add(2)
  assert.equal(R.goal, 15)
  assert.equal(Math.max(...R.goals), 15)
  h.arena.handle(a, 'arena:join', { room: 1 })
  h.arena.handle(a, 'arena:settings', { size: 1, bots: false, goal: 5 })
  h.arena.handle(a, 'arena:settings', { goal: 20 })
  assert.equal(h.lobby().rooms[0].goal, 5)
  h.arena.handle(b, 'arena:join', { room: 1 })
  for (const p of [a, b]) h.arena.handle(p, 'arena:ready', { ready: true })
  h.advance(R.countdown + 0.1)
  for (const p of [a, b]) h.arrive(p)
  assert.deepEqual([h.last(1, 'arena:start').goal, h.last(1, 'arena:start').wins], [5, 2])
  const game = h.arena.gameOf(a)
  /** Le joueur 1 élimine le joueur 2, face à face dans l'allée nord. */
  const kill = () => {
    const before = h.events(1, 'kill').length
    h.put(a, 1, 0)
    h.put(b, 4, 0)
    for (let i = 0; i < 20 && h.events(1, 'kill').length === before; i++) {
      fireAt(h, a, b)
      h.advance(0.25)
    }
    assert.equal(h.events(1, 'kill').length, before + 1)
  }
  // Première manche : le cinquième point la donne. Chacun revient à sa base, et le score repart de zéro.
  h.arena.handle(a, 'arena:debug', { score: [4, 0] })
  h.advance(R.warmup + R.shield)
  kill()
  const round = h.events(2, 'round')[0]
  assert.deepEqual([round.winner, round.reason, round.score, round.rounds], [0, 'score', [5, 0], [1, 0]])
  assert.equal(h.last(1, 'arena:end'), undefined)
  for (const f of game.fighters.values()) {
    assert.ok(f.alive && f.hp === f.max)
    assert.ok(game.zone.spawns[f.team].some((s) => s.x === f.x && s.z === f.z))
  }
  assert.deepEqual(h.last(1, 'arena:state').score, [0, 0])
  // Entre deux manches, personne ne tire.
  h.put(a, 1, 0)
  h.put(b, 4, 0)
  fireAt(h, a, b)
  h.advance(0.5)
  assert.equal(h.events(1, 'hit').filter((e) => e.id === 2).length, Math.ceil(D.hp / D.weapon.damage))
  // Seconde manche : gagnée aussi, la partie est jouée.
  h.advance(R.intermission + R.shield)
  h.arena.handle(a, 'arena:debug', { score: [4, 3] })
  kill()
  const end = h.last(2, 'arena:end')
  assert.deepEqual([end.winner, end.reason, end.score, end.rounds], [0, 'score', [5, 3], [2, 0]])
})

test('arène : chaque partie finie est déclarée au site pour le classement, et le joueur apprend si elle a compté', async () => {
  // Contre des bots seulement : elle compte comme une autre.
  const solo = harness()
  const a = solo.add(1)
  solo.start(a, [], { size: 1, goal: 5 })
  solo.arena.handle(a, 'arena:debug', { rounds: [1, 0], score: [4, 0] })
  const bot = [...solo.arena.gameOf(a).fighters.values()].find((f) => f.bot)
  solo.arena.handle(a, 'arena:debug', { freeze: true })
  solo.advance(R.warmup + R.shield)
  solo.put(a, 1, 0)
  Object.assign(bot, { x: 4, z: 0 })
  for (let i = 0; i < 40 && !solo.last(1, 'arena:end'); i++) {
    fireAt(solo, a, bot)
    solo.advance(0.25)
  }
  assert.equal(solo.last(1, 'arena:end').winner, 0)
  await new Promise((done) => setTimeout(done, 0))
  assert.deepEqual(solo.reports.map((r) => [r.id, r.result, r.size]), [[1, 'won', 1]])
  assert.deepEqual(solo.last(1, 'arena:ranked'), { game: solo.reports[0].game, ok: true })

  // Un joueur dans chaque camp (les bots complètent) : chacun a sa ligne, le gagnant et le perdant.
  const h = harness()
  const c = h.add(1), d = h.add(2), guest = h.add(3)
  Object.assign(guest, { verified: false, cookie: null })
  h.arena.handle(c, 'arena:join', { room: 1 })
  h.arena.handle(c, 'arena:settings', { size: 2, goal: 5 })
  h.arena.handle(d, 'arena:join', { room: 1, team: 1 })
  h.arena.handle(guest, 'arena:join', { room: 1, team: 1 })
  for (const p of [c, d, guest]) h.arena.handle(p, 'arena:ready', { ready: true })
  h.advance(R.countdown + 0.1)
  for (const p of [c, d, guest]) h.arrive(p)
  const game = h.arena.gameOf(c)
  h.arena.handle(c, 'arena:debug', { freeze: true, rounds: [1, 0], score: [4, 0] })
  h.advance(R.warmup + R.shield)
  h.put(c, 1, 0)
  h.put(d, 4, 0)
  for (let i = 0; i < 20 && !h.last(1, 'arena:end'); i++) {
    fireAt(h, c, d)
    h.advance(0.25)
  }
  const end = h.last(1, 'arena:end')
  assert.equal(end.winner, 0)
  await new Promise((done) => setTimeout(done, 0))
  // L'invité n'a pas de compte : pas de ligne pour lui. Avec le résultat, la durée de la partie et ce qui l'a finie.
  assert.deepEqual(h.reports, [
    { id: 1, cookie: 'ED_LOGGED_CMDR_ID=jeton-1', game: game.id, result: 'won', kills: 1, deaths: 0, size: 2, duration: end.duration, reason: end.reason },
    { id: 2, cookie: 'ED_LOGGED_CMDR_ID=jeton-2', game: game.id, result: 'lost', kills: 0, deaths: 1, size: 2, duration: end.duration, reason: end.reason },
  ])
  assert.deepEqual(h.last(1, 'arena:ranked'), { game: game.id, ok: true })
  assert.deepEqual(h.last(3, 'arena:ranked'), { game: game.id, ok: false, reason: 'guest' })

  // Le site ne répond pas : la partie n'est pas notée, et le joueur le sait.
  const down = harness({ report: async () => { throw new Error('site injoignable') } })
  const f = down.add(2), g = down.add(3)
  const lost = down.start(f, [g], { size: 1, bots: false })
  down.advance(61)
  down.arena.handle(g, 'arena:quit', {})
  await new Promise((done) => setTimeout(done, 0))
  assert.deepEqual(down.last(2, 'arena:ranked'), { game: lost.id, ok: false, reason: 'site' })
})

test('arène : un forfait au coup d\'envoi n\'est pas classé ; plus tard, si', async () => {
  // Un CMDR et un second onglet, invité dans l'équipe d'en face, sans bots : l'invité abandonne aussitôt.
  const h = harness()
  const a = h.add(1), alt = h.add(2)
  Object.assign(alt, { verified: false, cookie: null })
  h.start(a, [alt], { size: 1, bots: false })
  h.advance(R.warmup + 5)
  h.arena.handle(alt, 'arena:quit', {})
  assert.deepEqual([h.last(1, 'arena:end').winner, h.last(1, 'arena:end').reason], [0, 'forfeit'])
  await new Promise((done) => setTimeout(done, 0))
  assert.deepEqual(h.reports, [], 'rien n\'est déclaré au site')
  assert.equal(h.last(1, 'arena:ranked'), undefined)

  // Une vraie partie, abandonnée au bout d'une minute et plus : la victoire compte.
  const h2 = harness()
  const c = h2.add(1), d = h2.add(2)
  const game = h2.start(c, [d], { size: 1, bots: false })
  h2.advance(61)
  h2.arena.handle(d, 'arena:quit', {})
  await new Promise((done) => setTimeout(done, 0))
  // Le partant n'est plus de la partie : seul le gagnant est déclaré.
  assert.deepEqual(h2.reports.map((r) => [r.id, r.game, r.result, r.reason]), [[1, game.id, 'won', 'forfeit']])
  assert.ok(h2.reports[0].duration >= 61)
  assert.deepEqual(h2.last(1, 'arena:ranked'), { game: game.id, ok: true })
})

test('arène : un spectateur reçoit la partie en cours sans y être, jusqu\'à ce qu\'il s\'en aille', () => {
  const h = harness()
  const a = h.add(1), b = h.add(2), c = h.add(3)
  const game = h.start(a, [b], { size: 1, bots: false })
  // Personne ne joue dans le lobby 2 : rien à regarder.
  h.arena.handle(c, 'arena:watch', { room: 2 })
  assert.equal(h.last(3, 'arena:error').code, 'gone')
  h.arena.handle(c, 'arena:watch', { room: 1 })
  const start = h.last(3, 'arena:start')
  assert.deepEqual([start.game, start.watch, start.team, start.fighters.length], [game.id, true, 0, 2])
  assert.equal(h.lobby().rooms[0].watchers, 1)
  // Il n'est pas un combattant : ni cible, ni tireur, et sa position dans l'arène n'est pas acceptée.
  assert.equal(game.fighters.has(3), false)
  assert.equal(h.arena.accepts(c, 8, 5), false)
  assert.equal(h.arena.mates(a).has(3), false)
  h.advance(R.warmup + R.shield)
  assert.ok(h.last(3, 'arena:state').fighters.length === 2)
  h.put(a, 1, 0)
  h.put(b, 4, 0)
  fireAt(h, a, b)
  h.advance(0.5)
  assert.equal(h.events(3, 'hit').length, 1)
  // Il s'en va : plus rien ne lui arrive ; la fin de partie va aux joueurs et à qui regarde encore.
  const d = h.add(4)
  h.arena.handle(d, 'arena:watch', { room: 1 })
  h.arena.handle(c, 'arena:unwatch', {})
  const seen = h.sent.filter((m) => m.id === 3).length
  h.advance(0.5)
  assert.equal(h.sent.filter((m) => m.id === 3).length, seen)
  h.arena.handle(b, 'arena:quit', {})
  assert.equal(h.last(4, 'arena:end').reason, 'forfeit')
  assert.equal(h.last(3, 'arena:end'), undefined)
})

test('arène : les gestes suivent le relais ; le rechargement se dit aux autres, une fois, et ne change rien aux règles', () => {
  const h = harness()
  const a = h.add(1), b = h.add(2)
  const game = h.start(a, [b], { size: 1, bots: false })
  h.advance(R.warmup + R.shield)
  // A change de chargeur : B le voit faire (son arme bascule) ; A, non (il le fait déjà).
  h.arena.handle(a, 'arena:reload')
  assert.deepEqual(h.events(2, 'reload').map((e) => e.id), [1])
  assert.equal(h.events(1, 'reload').length, 0)
  // Le même geste répété aussitôt ne se redit pas (le temps d'un rechargement).
  h.arena.handle(a, 'arena:reload')
  h.advance(0.5)
  h.arena.handle(a, 'arena:reload')
  assert.equal(h.events(2, 'reload').length, 1)
  h.advance(D.weapon.reload)
  h.arena.handle(a, 'arena:reload')
  assert.equal(h.events(2, 'reload').length, 2)
  // Le geste n'est qu'une image : le chargeur de jetons du relais n'en sait rien.
  const tokens = game.fighters.get(1).tokens
  h.arena.handle(a, 'arena:reload')
  assert.equal(game.fighters.get(1).tokens, tokens)
  // Un tir rapide (au doigt) blesse comme un autre : seules les statistiques le comptent à part.
  h.put(a, 5, 5)
  h.put(b, 8, 5)
  game.fighters.get(2).shieldUntil = 0
  h.arena.handle(a, 'arena:fire', { o: [5, R.aim, 5], d: [[1, 0, 0]], c: 't', a: 1 })
  h.advance(0.3)
  const hit = h.events(2, 'hit').pop()
  assert.equal(hit.dmg, D.weapon.damage)
  assert.equal(game.fighters.get(1).controls.assist.hits, 1)
  // Éliminé, on ne recharge plus aux yeux des autres.
  game.fighters.get(1).alive = false
  h.advance(D.weapon.reload + 0.1)
  h.arena.handle(a, 'arena:reload')
  assert.equal(h.events(2, 'reload').length, 2)
})
