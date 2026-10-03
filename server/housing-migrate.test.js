// Migration des anciens quartiers vers la parcelle (housing v2) : murs, portes, revêtements, objets.
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyWalls, cellAt, packHome, sanitizeHome } from '../shared/housing-home.js'
import { WING_PATTERNS } from '../shared/cabin-wings.js'
import { migrateCabin, migrationPlace, stageFromWings } from '../shared/housing-migrate.js'
import { applyPlot, HOUSING_LEVEL, inPlot, plotRect } from '../shared/housing-plot.js'
import { LEGACY_UPPER_LAYOUT, SHIP_LAYOUTS, legacyUpperMapOptions, shipMapOptions } from '../shared/ship-layouts.js'
import { DIRS, ShipMap } from '../shared/ship-map.js'

const LIFT = { x: 10, z: 5 }
const PAINT = { style: 'damask', color: '#7a1f2b' }
const PLANKS = { style: 'planks', color: '#b07a45' }
/** Au millimètre, comme les objets migrés. */
const mm = (v) => Math.round(v * 1000) / 1000
const CABIN = { items: [{ m: 'holo-me', x: 11.6, z: 8.4, r: 0 }, { m: 'sofa', x: 14.25, z: 9.97, r: 2, v: 'teal' }, { m: 'poster-alien', x: 9, z: 6.35, r: 0 }], wall: PAINT, floor: PLANKS }

/** La parcelle migrée, posée sur le plan du pont des quartiers. */
function placed(plan) {
  const map = new ShipMap(SHIP_LAYOUTS[String(HOUSING_LEVEL)], shipMapOptions(HOUSING_LEVEL))
  applyPlot(map, plan.stage ?? 0)
  const walls = applyWalls(map, plan.walls, plan.stage ?? 0)
  return { map, walls }
}

/** Tuiles atteintes à pied depuis (x, z). */
function reach(map, x, z) {
  const seen = new Set([`${x},${z}`])
  const todo = [[x, z]]
  while (todo.length) {
    const [cx, cz] = todo.pop()
    for (let dir = 0; dir < 4; dir++) {
      const nx = cx + DIRS[dir].dx, nz = cz + DIRS[dir].dz
      if (map.edge(cx, cz, dir) === 'wall' || !map.isFloor(nx, nz) || seen.has(`${nx},${nz}`)) continue
      seen.add(`${nx},${nz}`)
      todo.push([nx, nz])
    }
  }
  return seen
}

test('extensions achetées : la parcelle où elles tiennent, quelle que soit leur forme', () => {
  const table = [[], ['middle'], ['left'], ['right'], ['left', 'middle'], ['middle', 'right'], ['left', 'right'], ['left', 'middle', 'right']]
  assert.deepEqual(table.map(stageFromWings), [0, 1, 2, 2, 2, 2, 3, 3])
  // Les quartiers seuls sont bien là où les compte stageFromWings.
  const map = new ShipMap(LEGACY_UPPER_LAYOUT, legacyUpperMapOptions())
  const tiles = []
  for (let z = 0; z < map.height; z++) for (let x = 0; x < map.width; x++) if (map.room(x, z) === 'p') tiles.push({ x, z })
  assert.deepEqual([Math.min(...tiles.map((t) => t.x)), Math.max(...tiles.map((t) => t.x)), Math.min(...tiles.map((t) => t.z)), Math.max(...tiles.map((t) => t.z))], [8, 15, 6, 10])
  // Toutes les formes, dans chaque jeu d'extensions : la migration tient dans la parcelle offerte.
  for (const ids of table) {
    for (const shape of Object.keys(WING_PATTERNS)) {
      const plan = migrateCabin({ ...CABIN, wings: Object.fromEntries(ids.map((id) => [id, { shape }])) })
      assert.equal(plan.stage ?? 0, stageFromWings(ids), `${ids.join('+')} ${shape}`)
      const { walls } = placed(plan)
      assert.ok(walls.length >= plan.walls.length - 2, `${ids.join('+')} ${shape} : murs posés`)
    }
  }
})

test('la parcelle grandit tant que la construction n\'y tient pas avec son couloir', () => {
  // Les quartiers seuls (8 × 5) : 8 × 8 ne laisse pas de couloir, mais ils y tiennent tournés.
  assert.deepEqual(migrationPlace({ minX: 8, maxX: 15, minZ: 6, maxZ: 10 }, 0), { dx: 4, dz: -6, stage: 0, half: true })
  // Avec l'extension du milieu (8 × 10) : 12 × 12 suffit.
  assert.equal(migrationPlace({ minX: 8, maxX: 15, minZ: 6, maxZ: 15 }, 1).stage, 1)
  // Avec celle de gauche (13 × 6) : 15 × 15.
  assert.equal(migrationPlace({ minX: 3, maxX: 15, minZ: 6, maxZ: 11 }, 1).stage, 2)
  // Déjà assez grande : on ne réduit pas.
  assert.equal(migrationPlace({ minX: 8, maxX: 15, minZ: 6, maxZ: 10 }, 3).stage, 3)
  // Une colonne libre contre le palier, une rangée libre au nord.
  for (let stage = 0; stage < 4; stage++) {
    const box = { minX: 3, maxX: 20, minZ: 6, maxZ: 15 }
    const { dx, dz, stage: s } = migrationPlace(box, stage)
    const r = plotRect(s)
    assert.ok(box.minX + dx > r.minX && box.minZ + dz > r.minZ && box.maxX + dx <= r.maxX && box.maxZ + dz <= r.maxZ, `${stage}`)
  }
})

test('les quartiers seuls : tournés d\'un demi-tour dans la parcelle de départ, porte au sud, tout accessible', () => {
  const plan = migrateCabin(CABIN)
  assert.equal(plan.stage, undefined)
  const { map, walls } = placed(plan)
  // 8 + 8 + 5 + 5 arêtes de pourtour, dont une porte ; à l'ouest, deux bordent le palier : son mur
  // tient lieu du leur, gardé pour le jour où on les déplace.
  assert.equal(plan.walls.length, 26)
  assert.equal(walls.length, 24)
  assert.deepEqual(plan.walls.filter((w) => w.k).map((w) => w.k), ['sliding'])
  const { dx, dz, half } = migrationPlace({ minX: 8, maxX: 15, minZ: 6, maxZ: 10 }, 0)
  assert.ok(half)
  // Demi-tour autour du centre (11,5 ; 8) : la porte nord de la tuile (11, 6) passe au sud de (12, 10).
  const door = plan.walls.find((w) => w.k)
  assert.deepEqual(door, { x: 12 + dx, z: 10 + dz, e: 'h', k: 'sliding', a: PAINT })
  // Papier peint sur chaque face intérieure, rien dehors ; parquet sur les 40 cases.
  assert.ok(plan.walls.every((w) => (w.a ? 1 : 0) + (w.b ? 1 : 0) === 1))
  const cells = plan.floor.map((f, i) => (f ? cellAt(i) : null)).filter(Boolean)
  assert.equal(cells.length, 40)
  assert.ok(cells.every((c) => inPlot(0, c.x, c.z)))
  // Les objets suivent, tournés eux aussi ; tout se rejoint depuis l'ascenseur, l'intérieur de la pièce compris.
  assert.deepEqual(plan.items[0], { m: 'holo-me', x: mm(23 - 11.6 + dx), z: mm(16 - 8.4 + dz), r: 2 })
  assert.deepEqual(plan.items[1], { m: 'sofa', x: mm(23 - 14.25 + dx), z: mm(16 - 9.97 + dz), r: 0, v: 'teal' })
  const seen = reach(map, LIFT.x, LIFT.z)
  assert.ok(seen.has(`${Math.round(plan.items[0].x)},${Math.round(plan.items[0].z)}`))
  assert.ok(cells.every((c) => seen.has(`${c.x},${c.z}`)))
})

test('avec l\'extension du milieu : tels quels sur 12 × 12, porte au nord', () => {
  const plan = migrateCabin({ ...CABIN, wings: { middle: { shape: 'carre' } } })
  assert.equal(plan.stage, 1)
  const { dx, dz, half } = migrationPlace({ minX: 8, maxX: 15, minZ: 6, maxZ: 15 }, 1)
  assert.ok(!half)
  assert.deepEqual(plan.walls.find((w) => w.x === 11 + dx && w.z === 5 + dz && w.e === 'h'), { x: 11 + dx, z: 5 + dz, e: 'h', k: 'sliding', b: PAINT })
  assert.deepEqual(plan.items[0], { m: 'holo-me', x: mm(11.6 + dx), z: mm(8.4 + dz), r: 0 })
  const { map } = placed(plan)
  const seen = reach(map, LIFT.x, LIFT.z)
  assert.ok(plan.floor.every((f, i) => !f || seen.has(`${cellAt(i).x},${cellAt(i).z}`)))
})

test('avec des extensions et des cloisons : un agrandissement par extension, un de plus pour tout faire tenir, les battants restent', () => {
  const layout = {
    ...CABIN,
    wings: { left: { shape: 'carre', floor: PLANKS }, right: { shape: 'deux-pieces', wall: PAINT } },
    partitions: [{ x: 12, z: 8, e: 'v', k: 'saloon' }, { x: 12, z: 9, e: 'v' }, { x: 12, z: 10, e: 'v', k: 'window' }],
  }
  const plan = migrateCabin(layout)
  // Deux extensions, mais 18 tuiles d'ouest en est : 20 × 20.
  assert.equal(plan.stage, 3)
  const { map, walls } = placed(plan)
  assert.equal(walls.length, plan.walls.length)
  const r = plotRect(plan.stage)
  assert.ok(plan.items.every((i) => i.x > r.minX - 0.5 && i.x < r.maxX + 0.5 && i.z > r.minZ - 0.5 && i.z < r.maxZ + 0.5))
  const kinds = plan.walls.map((w) => w.k ?? 'wall')
  assert.ok(kinds.includes('saloon') && kinds.includes('window'))
  // Porte des quartiers, deux portes d'extension, et la porte intérieure de « deux pièces ».
  assert.equal(kinds.filter((k) => k === 'sliding').length, 4)
  const seen = reach(map, LIFT.x, LIFT.z)
  const cells = plan.floor.map((f, i) => (f ? cellAt(i) : null)).filter(Boolean)
  assert.equal(cells.length, 40 + 25, 'les quartiers et l\'extension de gauche ont un sol')
  assert.ok(cells.every((c) => seen.has(`${c.x},${c.z}`)))
  // Ce que la migration produit se garde tel quel au format 2.
  assert.deepEqual(sanitizeHome(packHome(plan)), packHome(plan))
})

test('les quartiers seuls, éloignés du palier d\'un bloc : leurs pans de mur ouest reviennent', async () => {
  const { blockOf, moveBlock } = await import('../shared/housing-home.js')
  const plan = { ...migrateCabin(CABIN), stage: 1 }
  const r = plotRect(1)
  const all = []
  for (let z = r.minZ; z <= r.maxZ; z++) for (let x = r.minX; x <= r.maxX; x++) all.push({ x, z })
  const block = blockOf(plan, all)
  assert.equal(block.walls.size, 26)
  const moved = { ...moveBlock(plan, block, 2, 3), stage: 1 }
  const { map, walls } = placed(moved)
  assert.equal(walls.length, 26)
  // Une pièce fermée : sa porte est le seul passage.
  const inside = reach(map, LIFT.x, LIFT.z)
  assert.ok(moved.floor.every((f, i) => !f || inside.has(`${cellAt(i).x},${cellAt(i).z}`)))
})
