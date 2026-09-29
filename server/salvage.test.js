// Récupération de cargaison en zone thargoïde (SOC-06), côté relais : lobby, instances, ennemis,
// casiers, fusées, captures, dépôts, fin de partie et gains.
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSalvage, inLobby } from './salvage.js'
import { distances, findPath, inAirlock, lockerFront, lockerSpot, mulberry32, RULES, ZONE_LEVEL } from '../shared/salvage.js'

/** Relais simulé : joueurs, horloge, messages envoyés et gains demandés au site. */
function harness() {
  let t = 1_000_000
  const players = new Map()
  const sent = []
  const broadcasts = []
  const rewards = []
  const salvage = createSalvage({
    playerById: (id) => players.get(id),
    emit: (id, event, data) => sent.push({ id, event, data }),
    broadcast: (event, data) => broadcasts.push({ event, data }),
    reward: async (member, result) => {
      rewards.push({ member: member.id, result })
      return { earned: 1500, balance: 31500 }
    },
    now: () => t,
    random: mulberry32(7),
  })
  const add = (id, verified = true) => {
    const p = { id, name: `CMDR ${id}`, verified, level: -1, x: 22, z: 5, anim: 'idle', cookie: verified ? `ED_LOGGED_CMDR_ID=jeton-${id}` : null }
    players.set(id, p)
    return p
  }
  const advance = (seconds) => {
    for (let i = 0; i < Math.round(seconds * 10); i++) {
      t += 100
      salvage.tick(0.1)
    }
  }
  const last = (id, event, match = () => true) => [...sent].reverse().find((m) => m.id === id && m.event === event && match(m.data))?.data
  /** Le joueur arrive dans la baie, à son point d'apparition. */
  const arrive = (p) => {
    const start = last(p.id, 'salvage:start')
    Object.assign(p, { level: ZONE_LEVEL, x: start.spawn.x, z: start.spawn.z })
    assert.ok(salvage.accepts(p, p.x, p.z))
    salvage.moved(p)
  }
  /** Marche tuile par tuile (à 2 tuiles par seconde) jusqu'à `to`. */
  const walk = (p, to, { tick = false } = {}) => {
    const game = salvage.gameOf(p)
    const path = findPath(game.zone, p, to)
    assert.ok(path, 'chemin')
    for (const step of path.slice(1)) {
      // Colis livré au sas : la partie est finie.
      if (salvage.gameOf(p) !== game) return
      if (tick) advance(0.5)
      else t += 500
      assert.ok(salvage.accepts(p, step.x, step.z), `position (${step.x}, ${step.z})`)
      Object.assign(p, step)
      salvage.moved(p)
    }
  }
  const team = (...ids) => {
    const members = ids.map((id) => add(id, id !== 99))
    salvage.handle(members[0], 'salvage:create', {})
    const id = broadcasts.at(-1).data.teams.find((tm) => tm.leader === members[0].id).id
    for (const p of members.slice(1)) salvage.handle(p, 'salvage:join', { team: id })
    return { members, id }
  }
  const launch = (members, settings = { parcels: 1, enemies: 1 }) => {
    salvage.handle(members[0], 'salvage:settings', settings)
    for (const p of members) salvage.handle(p, 'salvage:ready', { ready: true })
    advance(RULES.countdown + 0.2)
    return salvage.gameOf(members[0])
  }
  return { salvage, players, sent, broadcasts, rewards, add, advance, last, arrive, walk, team, launch, now: () => t }
}

test('le lobby est le sas de la cale', () => {
  assert.ok(inLobby({ level: -1, x: 22, z: 5 }))
  assert.equal(inLobby({ level: -1, x: 15, z: 5 }), false)
  assert.equal(inLobby({ level: 0, x: 22, z: 5 }), false)
})

test('équipe : création, arrivée, réglages du chef, départ quand tous sont prêts', () => {
  const h = harness()
  const { members: [a, b], id } = h.team(1, 2)
  let lobby = h.broadcasts.at(-1).data.teams.find((t) => t.id === id)
  assert.deepEqual(lobby.members.map((m) => m.id), [1, 2])
  assert.equal(lobby.leader, 1)
  // Seul le chef règle la mission.
  h.salvage.handle(b, 'salvage:settings', { parcels: 4, enemies: 3 })
  assert.equal(h.last(2, 'salvage:error').code, 'leader')
  h.salvage.handle(a, 'salvage:ready', { ready: true })
  h.salvage.handle(a, 'salvage:settings', { parcels: 3, enemies: 2 })
  lobby = h.broadcasts.at(-1).data.teams.find((t) => t.id === id)
  assert.equal(lobby.parcels, 3)
  assert.ok(lobby.members.every((m) => !m.ready), 'un changement de réglages remet tout le monde en attente')
  h.salvage.handle(a, 'salvage:ready', { ready: true })
  h.salvage.handle(b, 'salvage:ready', { ready: true })
  assert.equal(h.broadcasts.at(-1).data.teams.find((t) => t.id === id).status, 'countdown')
  h.advance(RULES.countdown + 0.2)
  const start = h.last(1, 'salvage:start')
  assert.ok(start && h.last(2, 'salvage:start'))
  assert.equal(start.seed, h.last(2, 'salvage:start').seed)
  assert.equal(start.parcels, 3)
  assert.equal(start.enemies, 2)
  assert.deepEqual(start.members.map((m) => m.id), [1, 2])
  assert.notDeepEqual(start.spawn, h.last(2, 'salvage:start').spawn)
})

test('équipe : quatre au plus, on la quitte en sortant du lobby, et une équipe en mission est fermée', () => {
  const h = harness()
  const { members, id } = h.team(1, 2, 3, 4)
  const fifth = h.add(5)
  h.salvage.handle(fifth, 'salvage:join', { team: id })
  assert.equal(h.last(5, 'salvage:error').code, 'full')
  // Sortie du lobby (dans la soute) : plus membre.
  Object.assign(members[3], { x: 15, z: 5 })
  h.salvage.moved(members[3])
  assert.deepEqual(h.broadcasts.at(-1).data.teams.find((t) => t.id === id).members.map((m) => m.id), [1, 2, 3])
  // Hors du lobby, on ne crée pas d'équipe.
  h.salvage.handle(members[3], 'salvage:create', {})
  assert.equal(h.last(4, 'salvage:error').code, 'lobby')
  h.launch(members.slice(0, 3))
  h.salvage.handle(fifth, 'salvage:join', { team: id })
  assert.equal(h.last(5, 'salvage:error').code, 'playing')
})

test('position dans la baie : sur le sol, et pas plus vite qu\'on ne court', () => {
  const h = harness()
  const { members: [a] } = h.team(1)
  const game = h.launch([a])
  const start = h.last(1, 'salvage:start')
  assert.equal(h.salvage.accepts(a, start.spawn.x + 5, start.spawn.z), false, 'loin du point d\'apparition')
  h.arrive(a)
  assert.equal(game.members.get(1).status, 'alive')
  const far = game.zone.cargo[0]
  assert.equal(h.salvage.accepts(a, far.x, far.z), false, 'téléportation')
})

test('solo : ramasser le colis, le rapporter au sas, gagner et être payé une fois', async () => {
  const h = harness()
  const { members: [a] } = h.team(1)
  const game = h.launch([a], { parcels: 1, enemies: 1 })
  game.monsters.length = 0
  h.arrive(a)
  const cargo = game.zone.cargo[0]
  h.walk(a, cargo)
  h.salvage.handle(a, 'salvage:pickup', { kind: 'cargo', id: cargo.id })
  assert.equal(game.members.get(1).carrying, cargo.id)
  // Porteur : plus lent (une position trop lointaine est refusée).
  h.walk(a, game.zone.airlock.pad)
  assert.ok(inAirlock(game.zone, a))
  const end = h.last(1, 'salvage:end')
  assert.ok(end?.won)
  assert.equal(end.delivered, 1)
  await new Promise((r) => setImmediate(r))
  assert.equal(h.rewards.length, 1)
  assert.equal(h.rewards[0].result.game, end.game)
  assert.equal(h.last(1, 'salvage:reward').earned, 1500)
  // L'équipe revient au lobby, prête pour une autre mission.
  assert.equal(h.broadcasts.at(-1).data.teams[0].status, 'forming')
})

test('un invité gagne avec son équipe, mais le site ne paie que les CMDR', async () => {
  const h = harness()
  const { members } = h.team(1, 99)
  const game = h.launch(members)
  game.monsters.length = 0
  for (const p of members) h.arrive(p)
  const [a] = members
  h.walk(a, game.zone.cargo[0])
  h.salvage.handle(a, 'salvage:pickup', { kind: 'cargo', id: 0 })
  h.walk(a, game.zone.airlock.pad)
  assert.ok(h.last(99, 'salvage:end').won)
  await new Promise((r) => setImmediate(r))
  assert.deepEqual(h.rewards.map((r) => r.member), [1])
})

test('capture : l\'ennemi au contact attrape le joueur, qui lâche son colis ; le dernier capturé perd la partie', async () => {
  const h = harness()
  const { members } = h.team(1, 2)
  const game = h.launch(members)
  for (const p of members) h.arrive(p)
  const [a, b] = members
  h.walk(a, game.zone.cargo[0])
  h.salvage.handle(a, 'salvage:pickup', { kind: 'cargo', id: 0 })
  h.advance(RULES.grace)
  const mon = game.monsters[0]
  Object.assign(mon, { x: a.x + 0.3, z: a.z, mode: 'patrol', path: [] })
  h.advance(0.1)
  const caught = h.last(2, 'salvage:event', (e) => e.kind === 'capture')
  assert.equal(caught?.id, 1)
  assert.equal(game.members.get(1).status, 'captured')
  assert.equal(game.cargo[0].state, 'ground', 'le colis est tombé, un survivant peut le reprendre')
  assert.equal(mon.mode, 'attack')
  // L'équipe continue : le second est encore actif.
  assert.equal(h.last(2, 'salvage:end'), undefined)
  h.advance(M_ATTACK)
  Object.assign(mon, { x: b.x + 0.2, z: b.z, mode: 'patrol', path: [] })
  h.advance(0.1)
  const end = h.last(1, 'salvage:end')
  assert.equal(end?.won, false)
  await new Promise((r) => setImmediate(r))
  assert.equal(h.rewards.length, 0)
})
const M_ATTACK = RULES.monster.attack + 0.2

test('le sas est une zone sûre', () => {
  const h = harness()
  const { members: [a] } = h.team(1)
  const game = h.launch([a])
  h.arrive(a)
  h.walk(a, game.zone.airlock.pad)
  h.advance(RULES.grace)
  const mon = game.monsters[0]
  Object.assign(mon, { x: a.x, z: a.z + 0.2, path: [] })
  h.advance(0.3)
  assert.equal(game.members.get(1).status, 'alive')
})

test('un ennemi qui voit un joueur le poursuit, et celui qui entend courir vient voir', () => {
  const h = harness()
  const { members: [a] } = h.team(1)
  const game = h.launch([a])
  h.arrive(a)
  h.advance(RULES.grace)
  const mon = game.monsters[0]
  // Dans la même tuile qu'un joueur, tourné vers lui, mais pas au contact.
  Object.assign(mon, { x: a.x - 0.8, z: a.z, yaw: Math.PI / 2, mode: 'patrol', path: [] })
  if (game.zone.map.edge(a.x - 1, a.z, 1) === 'open') {
    h.advance(0.1)
    assert.ok(['chase', 'attack'].includes(mon.mode))
  }
  // Loin et hors de vue, mais à portée d'oreille : la course s'entend.
  const h2 = harness()
  const { members: [c] } = h2.team(1)
  const g2 = h2.launch([c])
  h2.arrive(c)
  h2.advance(RULES.grace)
  const m2 = g2.monsters[0]
  m2.mode = 'look'
  m2.timer = 100
  const d = distances(g2.zone, [m2], { monster: true })
  const i = d.findIndex((k) => k === 4)
  g2.noises.push({ x: i % g2.zone.width, z: Math.floor(i / g2.zone.width), radius: RULES.noise.sprint })
  h2.advance(0.1)
  assert.equal(m2.mode, 'investigate')
  assert.deepEqual(m2.goal, g2.noises[0] ?? m2.goal)
})

test('casier : on s\'y cache sans colis, on en est éjecté au bout de la durée maximale', () => {
  const h = harness()
  const { members: [a] } = h.team(1)
  const game = h.launch([a])
  game.monsters.length = 0
  h.arrive(a)
  const locker = game.zone.lockers[0]
  h.walk(a, locker)
  h.salvage.handle(a, 'salvage:hide', { locker: locker.id })
  const m = game.members.get(1)
  assert.equal(m.hidden, locker.id)
  assert.deepEqual({ x: m.x, z: m.z }, lockerSpot(locker))
  // Caché : la position envoyée n'est plus prise en compte.
  assert.equal(h.salvage.accepts(a, a.x, a.z), false)
  h.advance(RULES.locker.max + 0.5)
  assert.equal(m.hidden, null)
  assert.ok(h.last(1, 'salvage:event', (e) => e.kind === 'eject'))
  // Pas tout de suite de retour dans un casier.
  Object.assign(a, lockerFront(locker))
  h.salvage.handle(a, 'salvage:hide', { locker: locker.id })
  assert.equal(h.last(1, 'salvage:error').code, 'cooldown')
})

test('casier : un ennemi qui a vu le joueur s\'y glisser le fouille et l\'en tire', () => {
  const h = harness()
  const { members: [a] } = h.team(1)
  const game = h.launch([a])
  h.arrive(a)
  const locker = game.zone.lockers[0]
  h.walk(a, locker)
  h.advance(RULES.grace)
  const mon = game.monsters[0]
  const front = lockerFront(locker)
  Object.assign(mon, { x: front.x - (locker.dir === 1 ? 0.9 : locker.dir === 3 ? -0.9 : 0), z: front.z - (locker.dir === 2 ? 0.9 : locker.dir === 0 ? -0.9 : 0),
    mode: 'chase', target: 1, memory: 4, path: [] })
  h.salvage.handle(a, 'salvage:hide', { locker: locker.id })
  assert.equal(mon.search, locker.id)
  h.advance(6)
  const searched = h.last(1, 'salvage:event', (e) => e.kind === 'searched')
  assert.equal(searched?.found, true)
  assert.equal(game.members.get(1)?.status ?? 'captured', 'captured')
})

test('fusée : les ennemis à portée y courent et ignorent les joueurs le temps qu\'elle brûle', () => {
  const h = harness()
  const { members: [a] } = h.team(1)
  const game = h.launch([a])
  h.arrive(a)
  const f = game.zone.flares[0]
  const mon = game.monsters[0]
  const saved = { ...mon }
  mon.mode = 'look'
  mon.timer = 1000
  h.walk(a, f)
  Object.assign(mon, { x: saved.x, z: saved.z })
  h.salvage.handle(a, 'salvage:pickup', { kind: 'flare', id: f.id })
  assert.equal(game.members.get(1).flares, 1)
  // Lancée à ses pieds (en vue) : l'ennemi, s'il est à portée, y est attiré.
  h.salvage.handle(a, 'salvage:flare', { x: a.x, z: a.z })
  assert.ok(game.flare)
  assert.equal(game.members.get(1).flares, 0)
  h.advance(0.1)
  const reach = game.flare.reach[Math.round(mon.z) * game.zone.width + Math.round(mon.x)]
  if (reach >= 0) assert.equal(mon.mode, 'lured')
  // Une seule à la fois.
  h.salvage.handle(a, 'salvage:flare', { x: a.x, z: a.z })
  h.advance(RULES.flare.burn + 0.5)
  assert.equal(game.flare, null)
  assert.notEqual(mon.mode, 'lured')
})

test('déconnexion : le colis tombe, et la partie s\'arrête quand plus personne n\'est actif', () => {
  const h = harness()
  const { members } = h.team(1, 2)
  const game = h.launch(members)
  game.monsters.length = 0
  for (const p of members) h.arrive(p)
  h.walk(members[0], game.zone.cargo[0])
  h.salvage.handle(members[0], 'salvage:pickup', { kind: 'cargo', id: 0 })
  h.salvage.leave(members[0])
  assert.equal(game.cargo[0].state, 'ground')
  assert.equal(h.last(2, 'salvage:end'), undefined)
  // Le second abandonne : il revient au lobby, la mission est perdue.
  h.salvage.handle(members[1], 'salvage:quit', {})
  assert.equal(h.last(2, 'salvage:end')?.won, false)
  // Le partant a quitté l'équipe ; l'autre y reste.
  assert.deepEqual(h.broadcasts.at(-1).data.teams[0].members.map((m) => m.id), [2])
})

test('coéquipiers : seuls les membres de la même partie', () => {
  const h = harness()
  const { members: [a, b] } = h.team(1, 2)
  const other = h.add(3)
  h.launch([a, b])
  assert.deepEqual([...h.salvage.teammates(a)].sort(), [1, 2])
  assert.equal(h.salvage.teammates(other).size, 0)
})

test('endurance : deux minutes de missions à quatre, six ennemis, sans erreur ni ennemi hors du sol', () => {
  for (const seed of [3, 11]) {
    const h = harness()
    const { members } = h.team(1, 2, 3, 4)
    const rand = mulberry32(seed)
    const targets = new Map()
    let game = null
    let missions = 0
    for (let step = 0; step < 1200; step++) {
      if (!game || h.salvage.gameOf(members[0]) !== game) {
        // Mission finie (ou pas encore partie) : retour au lobby, et on repart.
        for (const p of members) Object.assign(p, { level: -1, x: 22, z: 5, anim: 'idle' })
        for (const p of members) h.salvage.moved(p)
        game = h.launch(members, { parcels: 6, enemies: 6 })
        for (const p of members) h.arrive(p)
        targets.clear()
        missions++
      }
      h.advance(0.1)
      for (const p of members) {
        const m = game.members.get(p.id)
        if (m?.status !== 'alive' || m.hidden !== null) continue
        // Chacun va vers un colis, une fusée, un casier ou le sas, et court une fois sur deux.
        let target = targets.get(p.id)
        if (!target || (Math.round(p.x) === target.x && Math.round(p.z) === target.z)) {
          const pool = [...game.zone.cargo, ...game.zone.flares, ...game.zone.lockers, game.zone.airlock.pad]
          target = pool[Math.floor(rand() * pool.length)]
          targets.set(p.id, target)
        }
        const path = findPath(game.zone, p, target)
        if (path?.[1] && step % 5 === 0) {
          p.anim = rand() < 0.5 ? 'sprint' : 'walk'
          if (h.salvage.accepts(p, path[1].x, path[1].z)) {
            Object.assign(p, path[1])
            h.salvage.moved(p)
          }
        }
        const r = rand()
        if (r < 0.02) h.salvage.handle(p, 'salvage:pickup', { kind: 'cargo', id: Math.floor(rand() * 6) })
        else if (r < 0.04) h.salvage.handle(p, 'salvage:pickup', { kind: 'flare', id: Math.floor(rand() * game.zone.flares.length) })
        else if (r < 0.05) h.salvage.handle(p, 'salvage:hide', { locker: Math.floor(rand() * game.zone.lockers.length) })
        else if (r < 0.06) h.salvage.handle(p, 'salvage:flare', { x: p.x, z: p.z })
      }
      for (const mon of game.monsters) {
        assert.ok(Number.isFinite(mon.x) && Number.isFinite(mon.z))
        assert.ok(game.zone.room[Math.round(mon.z) * game.zone.width + Math.round(mon.x)] === 'z', 'ennemi dans le sas ou hors du plan')
      }
    }
    assert.ok(missions >= 2)
  }
})

test('le crochet de debug (serveur de dev) fige les ennemis ; il est inerte sinon', () => {
  const h = harness()
  const { members: [a] } = h.team(1)
  const game = h.launch([a])
  h.arrive(a)
  h.salvage.handle(a, 'salvage:debug', { freeze: true })
  assert.equal(game.frozen, undefined, 'sans debug, rien')
  const mon = game.monsters[0]
  const before = { x: mon.x, z: mon.z }
  h.advance(1)
  assert.notDeepEqual({ x: mon.x, z: mon.z }, before, 'les ennemis bougent')
})
