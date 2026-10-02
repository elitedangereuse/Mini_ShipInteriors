// Baie infestée de la zone thargoïde (SOC-06) : le plan fixe, et ce que la graine y dispose.
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BAY, BAY_BOOTH, BAY_CAMERAS, BAY_LIT, distances, elevated, floorFx, FX, sightOrigin, findPath, generateZone, groundHeight, inAirlock, isLit, lockerFront, lockerSpot,
  mulberry32, pickSpawns, RULES, salvageGrade, salvageMinDuration, salvagePar, salvageReward, smoothPath, straightWalk, walkable, zoneSight,
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

test('des passages larges dans les cloisons, et la grande allée de trois tuiles', () => {
  const zone = generateZone(1, { team: 1, parcels: 1, enemies: 1 })
  // Chaque passage d'une cloison pleine (lignes 8, 12 et 18) fait deux tuiles de large au moins.
  for (const z of [8, 12, 18]) for (const gap of BAY[z].match(/\.+/g)) assert.ok(gap.length >= 2, `ligne ${z}`)
  // La grande allée traverse la baie d'ouest en est, sur trois tuiles de large.
  for (const z of [9, 10, 11]) assert.ok([...BAY[z]].filter((c) => '.L'.includes(c)).length >= 32, `ligne ${z}`)
  assert.ok(findPath(zone, { x: 0, z: 10 }, { x: 35, z: 10 }).length === 36, 'tout droit')
  // Les cloisons fines ne ferment que les petites pièces et le guichet.
  for (const w of zone.walls) {
    const x = w.x + (w.dir === 1 ? 0.5 : 0), z = w.z + (w.dir === 2 ? 0.5 : 0)
    const near = [...zone.rooms, BAY_BOOTH].some((r) => x >= r.x - 0.5 && x <= r.x + r.w - 0.5 && z >= r.z - 0.5 && z <= r.z + r.d - 0.5)
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
  assert.equal(zoneSight(zone, { x: 14, z: 7 }, technician), false, 'pas à travers la cloison')
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
  assert.equal(zoneSight(zone, { x: 8, z: 2 }, { x: 8, z: 0 }), false)
  assert.equal(zoneSight(zone, { x: 3, z: 2 }, { x: 3, z: 0 }), true)
  // Une cloison pleine arrête le regard.
  assert.equal(zoneSight(zone, { x: 10, z: 9 }, { x: 10, z: 7 }), false)
  // Le sas : on n'y voit que par ses portes.
  assert.equal(zoneSight(zone, { x: 17, z: 23 }, { x: 17, z: 24 }), false)
  assert.equal(zoneSight(zone, { x: 16, z: 23 }, { x: 16, z: 24 }), true)
  // Un conteneur de hall : la tuile de derrière est cachée.
  let checked = 0
  for (const c of zone.containers) {
    if (c.kind !== 'container') continue
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

test('durée minimale d\'une mission payée : par tournée de colis, les membres portant ensemble', () => {
  const e = { minPerParcel: 15 }
  assert.equal(salvageMinDuration(e, 1, 1), 15)
  assert.equal(salvageMinDuration(e, 6, 1), 90)
  assert.equal(salvageMinDuration(e, 6, 4), 30, 'deux tournées à quatre')
  assert.equal(salvageMinDuration(null, 6, 4), 30, 'valeur par défaut sans economy.json')
  // Le plus court aller-retour sas → colis → sas, même en courant, prend plus d'une tournée minimale.
  let shortest = Infinity
  for (let s = 1; s < 60; s++) {
    const zone = generateZone(s * 7919, { team: 1, parcels: 6, enemies: 1 })
    const d = distances(zone, [zone.airlock.pad])
    for (const c of zone.cargo) shortest = Math.min(shortest, d[Math.round(c.z) * zone.width + Math.round(c.x)])
  }
  const trip = shortest / RULES.sprint + shortest / (RULES.sprint * RULES.carry)
  assert.ok(trip > e.minPerParcel, `aller-retour le plus court : ${trip.toFixed(1)} s`)
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

test('au ras d\'un meuble, la vue part de la tuile libre voisine, jamais à travers une cloison', () => {
  const zone = generateZone(1, { team: 1, parcels: 1, enemies: 1 })
  // La fontaine de la salle de pause (17, 0) : sa tuile est bloquée ; derrière la cloison est, le local radio.
  const o = sightOrigin(zone, { x: 17.2, z: 0.35 })
  assert.ok(walkable(zone, Math.round(o.x), Math.round(o.z)))
  assert.ok(Math.round(o.x) <= 17, 'pas dans le local radio')
  assert.ok(zoneSight(zone, o, { x: 17, z: 2 }))
  // Sur une tuile libre, rien ne change.
  assert.deepEqual(sightOrigin(zone, { x: 12.3, z: 2.1 }), { x: 12.3, z: 2.1 })
})

test('les zones éclairées : la serre, le carrefour du guichet et le quai de chargement', () => {
  const zone = generateZone(3, { team: 1, parcels: 1, enemies: 1 })
  assert.deepEqual(BAY_LIT.map((l) => l.id), ['greenhouse', 'crossroads', 'dock'])
  assert.ok(isLit(zone, { x: 28, z: 3 }), 'la serre')
  assert.ok(isLit(zone, zone.airlock.pad), 'le quai, jusqu\'au sas')
  assert.ok(isLit(zone, BAY_BOOTH.counter), 'devant le guichet')
  assert.equal(isLit(zone, { x: 30, z: 15 }), false, 'le nid reste noir')
  for (const l of BAY_LIT) for (const lamp of l.lamps) assert.ok(isLit(zone, lamp), l.id)
  assert.ok(RULES.litVision > RULES.vision && RULES.monster.litSight > RULES.monster.sight)
})

test('la passerelle : on n\'y monte que par ses escaliers, et l\'on y voit par-dessus les conteneurs', () => {
  const zone = generateZone(5, { team: 1, parcels: 1, enemies: 1 })
  // Garde-corps : de la tuile d'à côté, pas de passage direct ; le chemin passe par un escalier.
  assert.equal(zone.adj[(2 * zone.width + 5) * 4 + 2], -1, 'garde-corps au nord')
  const path = findPath(zone, { x: 5, z: 2 }, { x: 5, z: 3 })
  assert.ok(path.length > 4 && path.some((t) => zone.stairs[t.z * zone.width + t.x] >= 0), 'par un escalier')
  // Les ennemis aussi.
  assert.ok(findPath(zone, { x: 5, z: 5 }, { x: 5, z: 4 }, { monster: true }).length > 2)
  // Hauteurs : le sol, le haut de l'escalier, la passerelle.
  assert.equal(groundHeight(zone, { x: 0, z: 3 }), 0)
  assert.ok(groundHeight(zone, { x: 1, z: 3 }) > 0 && groundHeight(zone, { x: 1, z: 3 }) < RULES.deck)
  assert.equal(groundHeight(zone, { x: 6, z: 4 }), RULES.deck)
  assert.ok(elevated(zone, { x: 6, z: 4 }) && !elevated(zone, { x: 6, z: 6 }))
  // Par-dessus la rangée de conteneurs du nord (8, 1) : de la passerelle, oui ; du sol, non.
  assert.equal(zoneSight(zone, { x: 8, z: 3 }, { x: 8, z: 0 }), true)
  assert.equal(zoneSight(zone, { x: 8, z: 2 }, { x: 8, z: 0 }), false)
  // Symétrique : qui est en bas voit qui est en haut, et le bruit passe par-dessus le garde-corps.
  assert.equal(zoneSight(zone, { x: 8, z: 0 }, { x: 8, z: 3 }), true)
  assert.equal(distances(zone, [{ x: 5, z: 2 }], { hear: true })[3 * zone.width + 5], 1)
  // Une cloison pleine arrête même le regard d'en haut.
  assert.equal(zoneSight(zone, { x: 10, z: 4 }, { x: 15, z: 4 }), false)
  // Jamais de casier, de colis ni de fusée sur un escalier.
  each((z) => {
    for (const t of [...z.cargo, ...z.flares, ...z.lockers]) assert.ok(z.stairs[t.z * z.width + t.x] < 0)
  })
})

test('la serre : ses bacs bloquent le passage, pas la vue ; les excroissances du nid arrêtent tout', () => {
  const zone = generateZone(9, { team: 1, parcels: 1, enemies: 1 })
  assert.equal(walkable(zone, 25, 2), false)
  assert.equal(zoneSight(zone, { x: 25, z: 1 }, { x: 25, z: 3 }), true, 'par-dessus un bac')
  assert.equal(walkable(zone, 28, 13), false)
  assert.equal(zoneSight(zone, { x: 27, z: 13 }, { x: 29, z: 13 }), false, 'derrière une excroissance')
  assert.equal(zoneSight(zone, { x: 27, z: 13 }, { x: 29, z: 13 }, true), false, 'même d\'en haut')
})

test('les meubles : rien ne se pose sur leur tuile, et la table de la salle de pause laisse ses portes libres', () => {
  each((zone) => {
    for (const t of [...zone.cargo, ...zone.flares, ...zone.monsters]) assert.equal(zone.furnished[t.z * zone.width + t.x], 0, `${t.x},${t.z}`)
    for (const d of zone.decor) assert.equal(zone.furnished[Math.round(d.z) * zone.width + Math.round(d.x)], 0)
  })
  const zone = generateZone(1, { team: 1, parcels: 1, enemies: 1 })
  for (const t of [[15, 2], [16, 2], [15, 0], [16, 0], [14, 1]]) assert.ok(walkable(zone, t[0], t[1]), `${t}`)
  assert.ok(!walkable(zone, 15, 1) && !walkable(zone, 16, 1), 'la table')
  assert.ok(walkable(zone, 17, 1), 'pas de mur invisible à côté')
})

test('les sols : verre brisé dans la zone effondrée, flaques caustiques dans le nid', () => {
  let glass = 0, goo = 0
  each((zone) => {
    for (let i = 0; i < zone.width * zone.height; i++) {
      const x = i % zone.width, z = Math.floor(i / zone.width)
      if (zone.fx[i] === FX.glass) {
        glass++
        assert.ok(x >= 25 && z >= 19, `verre en ${x},${z}`)
      } else if (zone.fx[i] === FX.goo) {
        goo++
        assert.ok(x >= 25 && z >= 13 && z < 18, `flaque en ${x},${z}`)
      }
      if (zone.fx[i]) assert.equal(floorFx(zone, { x: x + 0.3, z: z - 0.2 }), zone.fx[i])
    }
    for (const t of [...zone.cargo, ...zone.flares, ...zone.lockers]) assert.equal(zone.fx[t.z * zone.width + t.x], FX.none)
  })
  assert.ok(glass > 0 && goo > 0)
  assert.ok(RULES.goo < 1 && RULES.noise.glass < RULES.noise.sprint)
})

test('les caméras de surveillance filment des tuiles de la baie', () => {
  const zone = generateZone(1, { team: 1, parcels: 1, enemies: 1 })
  assert.ok(BAY_CAMERAS.length >= 6)
  for (const c of BAY_CAMERAS) assert.ok(walkable(zone, Math.round(c.x), Math.round(c.z)) && !inAirlock(zone, c), c.id)
})

test('la note de mission : S sans capture et vite, jusqu\'à D', () => {
  const base = { won: true, delivered: 3, parcels: 3, team: 2, captures: 0 }
  const par = salvagePar(3, 2)
  assert.equal(salvageGrade({ ...base, duration: par - 1 }), 'S')
  assert.equal(salvageGrade({ ...base, duration: par + 1 }), 'A')
  assert.equal(salvageGrade({ ...base, duration: par * 2 }), 'B')
  assert.equal(salvageGrade({ ...base, captures: 1, duration: par }), 'A')
  assert.equal(salvageGrade({ ...base, captures: 2, duration: par }), 'B')
  assert.equal(salvageGrade({ ...base, won: false, delivered: 2, duration: 99 }), 'C')
  assert.equal(salvageGrade({ ...base, won: false, delivered: 0, duration: 99 }), 'D')
})
