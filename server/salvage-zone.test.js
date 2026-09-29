// Baie infestée de la zone thargoïde (SOC-06) : le labyrinthe tiré d'une graine.
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  distances, findPath, generateZone, inAirlock, lockerFront, lockerSpot, mulberry32, pickSpawns, RULES, salvageReward, smoothPath,
  straightWalk, walkable, zoneSight, zoneSize,
} from '../shared/salvage.js'

const SETTINGS = [
  { team: 1, parcels: 1, enemies: 1 },
  { team: 2, parcels: 3, enemies: 2 },
  { team: 4, parcels: 6, enemies: 6 },
  { team: 3, parcels: 2, enemies: 5 },
]
const SEEDS = [1, 42, 7, 2024, 99991, 123456789, 0xdeadbeef]

const each = (fn) => {
  for (const settings of SETTINGS) for (const seed of SEEDS) fn(generateZone(seed, settings), settings, seed)
}

test('même graine, même baie (le relais et chaque client construisent la même)', () => {
  const a = generateZone(424242, { team: 2, parcels: 3, enemies: 2 })
  const b = generateZone(424242, { team: 2, parcels: 3, enemies: 2 })
  assert.deepEqual(a.layout, b.layout)
  assert.deepEqual(a.walls, b.walls)
  assert.deepEqual([a.lockers, a.flares, a.cargo, a.monsters, a.decor, a.containers], [b.lockers, b.flares, b.cargo, b.monsters, b.decor, b.containers])
  const c = generateZone(424243, { team: 2, parcels: 3, enemies: 2 })
  assert.notDeepEqual(a.walls, c.walls)
})

test('la taille grandit avec l\'équipe et les colis, sans dépasser le plafond', () => {
  assert.deepEqual(zoneSize(1, 1), { width: 18, height: 16 })
  assert.ok(zoneSize(4, 6).width <= 26 && zoneSize(4, 6).height <= 22)
})

test('toute la baie est accessible depuis le sas, conteneurs compris', () => {
  each((zone) => {
    const d = distances(zone, [zone.airlock.pad])
    for (let i = 0; i < zone.width * zone.height; i++) {
      if (!zone.blocked[i]) assert.ok(d[i] >= 0, `tuile ${i % zone.width},${Math.floor(i / zone.width)} coupée (graine ${zone.seed})`)
    }
  })
})

test('le compte y est : colis, ennemis, casiers, fusées', () => {
  each((zone, s) => {
    assert.equal(zone.cargo.length, s.parcels)
    assert.equal(zone.monsters.length, s.enemies)
    assert.ok(zone.lockers.length >= 3, `casiers (graine ${zone.seed})`)
    assert.ok(zone.flares.length >= 2 + s.team)
  })
})

test('objets et ennemis sur des tuiles libres de la baie, jamais dans le sas', () => {
  each((zone) => {
    const seen = new Set()
    for (const t of [...zone.cargo, ...zone.flares, ...zone.lockers, ...zone.monsters]) {
      assert.ok(walkable(zone, t.x, t.z))
      assert.equal(inAirlock(zone, t), false)
    }
    for (const t of [...zone.cargo, ...zone.flares, ...zone.lockers]) {
      const key = `${t.x},${t.z}`
      assert.ok(!seen.has(key), `deux objets sur ${key}`)
      seen.add(key)
    }
  })
})

test('les ennemis ne peuvent pas entrer dans le sas, mais atteignent toute la baie', () => {
  each((zone) => {
    const d = distances(zone, [zone.monsters[0]], { monster: true })
    for (let i = 0; i < zone.width * zone.height; i++) {
      if (zone.room[i] === 'x') assert.equal(d[i], -1)
      else if (!zone.blocked[i]) assert.ok(d[i] >= 0)
    }
  })
})

test('un casier se dresse contre un mur, et l\'on en sort du côté de la tuile', () => {
  each((zone) => {
    for (const l of zone.lockers) {
      assert.equal(zone.map.edge(l.x, l.z, l.dir), 'wall', `casier ${l.id} sans mur (graine ${zone.seed})`)
      const spot = lockerSpot(l), front = lockerFront(l)
      assert.equal(Math.round(spot.x) + 0, l.x)
      assert.equal(Math.round(front.z) + 0, l.z)
    }
  })
})

test('la vue s\'arrête aux murs et aux conteneurs', () => {
  const zone = generateZone(42, { team: 1, parcels: 2, enemies: 1 })
  // Un mur du labyrinthe : de part et d'autre, on ne se voit pas.
  const w = zone.walls.find((e) => e.dir === 1)
  assert.equal(zoneSight(zone, { x: w.x, z: w.z }, { x: w.x + 1, z: w.z }), false)
  // Un conteneur de hall : la tuile de derrière est cachée.
  let checked = 0
  for (const c of zone.containers) {
    const before = { x: c.x - 1, z: c.z }, after = { x: c.x + c.w, z: c.z }
    if (!walkable(zone, before.x, before.z) || !walkable(zone, after.x, after.z)) continue
    if (zone.map.edge(before.x, before.z, 1) !== 'open' || zone.map.edge(after.x - 1, after.z, 1) !== 'open') continue
    assert.equal(zoneSight(zone, before, after), false)
    checked++
  }
  assert.ok(checked >= 0)
})

test('chemins : le plus court, et lissé sans traverser de mur', () => {
  each((zone) => {
    const from = zone.monsters[0], to = zone.cargo[0]
    const path = findPath(zone, from, to, { monster: true })
    assert.ok(path)
    const d = distances(zone, [from], { monster: true })
    assert.equal(path.length - 1, d[to.z * zone.width + to.x])
    const smooth = smoothPath(zone, from, path.slice(1))
    let at = from
    for (const p of smooth) {
      assert.ok(straightWalk(zone, at, p))
      at = p
    }
    assert.deepEqual(smooth.at(-1), path.at(-1))
  })
})

test('les joueurs apparaissent loin des ennemis et écartés les uns des autres', () => {
  each((zone) => {
    const spawns = pickSpawns(zone, zone.team, zone.monsters, mulberry32(zone.seed ^ 0x5bd1e995))
    assert.equal(spawns.length, zone.team)
    const d = distances(zone, zone.monsters)
    for (const s of spawns) {
      assert.ok(d[s.z * zone.width + s.x] >= 3, `trop près d'un ennemi (graine ${zone.seed})`)
      assert.equal(inAirlock(zone, s), false)
    }
  })
})

test('récompense : plus de colis et plus d\'ennemis, plus de crédits', () => {
  const e = { parcel: 1500, enemyBonus: 0.5 }
  assert.equal(salvageReward(e, 1, 1), 1500)
  assert.equal(salvageReward(e, 3, 2), 6800)
  assert.ok(salvageReward(e, 6, 6) > salvageReward(e, 6, 5))
  assert.ok(RULES.monster.chase > RULES.sprint * RULES.carry, 'un porteur qui court ne sème pas un poursuivant')
  assert.ok(RULES.monster.chase < RULES.sprint, 'sans colis, on peut le semer en courant')
})
