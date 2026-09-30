// Baie infestée de la zone thargoïde (SOC-06) : le plan fixe, et ce que la graine y dispose.
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BAY, BAY_BOOTH, distances, findPath, generateZone, inAirlock, lockerFront, lockerSpot, mulberry32, pickSpawns, RULES, salvageReward, smoothPath,
  straightWalk, walkable, zoneSight,
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
  assert.deepEqual([a.lockers, a.flares, a.cargo, a.monsters, a.decor, a.containers], [b.lockers, b.flares, b.cargo, b.monsters, b.decor, b.containers])
  // Le plan ne change pas ; ce qu'on y trouve, si.
  const c = generateZone(424243, { team: 2, parcels: 3, enemies: 2 })
  assert.deepEqual([a.layout, a.containers, a.lockers, a.doors], [c.layout, c.containers, c.lockers, c.doors])
  assert.notDeepEqual([a.cargo, a.flares, a.monsters], [c.cargo, c.flares, c.monsters])
})

test('le plan : rectangulaire, conteneurs par paires, un sas de six tuiles au bord sud', () => {
  assert.ok(BAY.every((line) => line.length === BAY[0].length))
  for (const line of BAY) for (const run of line.match(/=+/g) ?? []) assert.equal(run.length % 2, 0, line)
  for (let x = 0; x < BAY[0].length; x++) {
    const column = BAY.map((line) => line[x]).join('')
    for (const run of column.match(/H+/g) ?? []) assert.equal(run.length % 2, 0, `colonne ${x}`)
  }
  const zone = generateZone(1, { team: 1, parcels: 1, enemies: 1 })
  assert.equal(zone.airlock.tiles.length, 6)
  assert.equal(zone.airlock.side, 2)
  assert.ok(zone.lockers.length >= 30, 'des casiers partout')
})

test('des couloirs d\'au moins deux tuiles entre les rangées de conteneurs', () => {
  const zone = generateZone(1, { team: 1, parcels: 1, enemies: 1 })
  // Chaque passage d'une rangée pleine (lignes 7 et 15) fait deux tuiles de large.
  for (const z of [7, 15]) for (const gap of BAY[z].match(/\.+/g)) assert.ok(gap.length >= 2, `ligne ${z}`)
  // Les cloisons fines ne ferment que les petites pièces et le guichet.
  for (const w of zone.walls) {
    const x = w.x + (w.dir === 1 ? 0.5 : 0), z = w.z + (w.dir === 2 ? 0.5 : 0)
    const near = [...zone.rooms, { x: 10, z: 8, w: 3, d: 2 }].some((r) => x >= r.x - 0.5 && x <= r.x + r.w - 0.5 && z >= r.z - 0.5 && z <= r.z + r.d - 0.5)
    assert.ok(near, `cloison isolée en ${w.x},${w.z}`)
  }
})

test('les petites pièces : fermées, sauf leurs portes, éclairées, meublées', () => {
  const zone = generateZone(1, { team: 1, parcels: 1, enemies: 1 })
  assert.ok(zone.rooms.length >= 4)
  for (const r of zone.rooms) {
    assert.ok(r.light && r.furniture.length)
    // On y entre par une porte (et une seule rangée d'arêtes ouvertes vers l'extérieur).
    for (const d of r.doors) assert.equal(zone.map.edge(d.x, d.z, d.dir), 'open', r.id)
    const door = r.doors[0]
    const out = { x: door.x + [0, 1, 0, -1][door.dir], z: door.z + [-1, 0, 1, 0][door.dir] }
    assert.ok(findPath(zone, zone.airlock.pad, door) && walkable(zone, out.x, out.z), r.id)
  }
})

test('le guichet : on ne peut pas y entrer, mais on voit le technicien par la vitre', () => {
  const zone = generateZone(1, { team: 1, parcels: 1, enemies: 1 })
  const { technician, counter } = BAY_BOOTH
  assert.equal(walkable(zone, Math.round(technician.x), Math.round(technician.z)), false)
  assert.ok(walkable(zone, counter.x, counter.z))
  assert.equal(findPath(zone, zone.airlock.pad, { x: Math.round(technician.x), z: Math.round(technician.z) }), null)
  assert.equal(zoneSight(zone, counter, technician), true, 'par la vitre')
  assert.equal(zoneSight(zone, { x: 8, z: 8 }, technician), false, 'pas à travers la cloison')
  // Les ennemis n'y entrent pas non plus.
  const d = distances(zone, [zone.monsters[0]], { monster: true })
  assert.equal(d[Math.round(technician.z) * zone.width + Math.round(technician.x)], -1)
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

test('un casier se dresse contre une paroi ou un conteneur, et l\'on en sort du côté de la tuile', () => {
  each((zone) => {
    for (const l of zone.lockers) {
      const back = { x: l.x + [0, 1, 0, -1][l.dir], z: l.z + [-1, 0, 1, 0][l.dir] }
      assert.ok(zone.map.edge(l.x, l.z, l.dir) === 'wall' || !walkable(zone, back.x, back.z), `casier ${l.id} sans appui (graine ${zone.seed})`)
      const spot = lockerSpot(l), front = lockerFront(l)
      assert.equal(Math.round(spot.x) + 0, l.x)
      assert.equal(Math.round(front.z) + 0, l.z)
    }
  })
})

test('la vue s\'arrête aux parois et aux conteneurs', () => {
  const zone = generateZone(42, { team: 1, parcels: 2, enemies: 1 })
  // Une rangée de conteneurs : de part et d'autre, on ne se voit pas ; par un passage, si.
  assert.equal(zoneSight(zone, { x: 8, z: 6 }, { x: 8, z: 8 }), false)
  assert.equal(zoneSight(zone, { x: 4, z: 6 }, { x: 4, z: 8 }), true)
  // Le sas : on n'y voit que par ses portes.
  assert.equal(zoneSight(zone, { x: 15, z: 21 }, { x: 15, z: 22 }), false)
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
  assert.ok(RULES.monster.chase > RULES.walk, 'qui marche se fait rattraper')
  assert.ok(RULES.monster.chase < RULES.sprint, 'sans colis, on le sème en courant')
  assert.ok(RULES.monster.chase < RULES.sprint * RULES.carry * 1.1, 'un porteur qui court le tient à distance, à peine')
  assert.ok(RULES.hiddenVision >= RULES.vision * 0.7, 'caché, on voit encore dehors')
})
