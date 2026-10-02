// Migration des anciens quartiers vers la parcelle (housing v2) : murs, portes, revêtements, objets.
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyWalls, cellAt, packHome, sanitizeHome } from '../shared/housing-home.js'
import { migrateCabin, migrationOffset, stageFromWings } from '../shared/housing-migrate.js'
import { applyPlot, HOUSING_LEVEL, inPlot, plotRect } from '../shared/housing-plot.js'
import { SHIP_LAYOUTS, shipMapOptions } from '../shared/ship-layouts.js'
import { DIRS, ShipMap } from '../shared/ship-map.js'

const LIFT = { x: 10, z: 5 }
const PAINT = { style: 'damask', color: '#7a1f2b' }
const PLANKS = { style: 'planks', color: '#b07a45' }
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

test('extensions achetées : une offre le premier agrandissement, deux ou trois les deux', () => {
  assert.deepEqual([0, 1, 2, 3].map(stageFromWings), [0, 1, 2, 2])
})

test('les quartiers seuls : une pièce de 8 × 5 dans la parcelle de départ, porte au nord, tout accessible', () => {
  const plan = migrateCabin(CABIN)
  assert.equal(plan.stage, undefined)
  const { map, walls } = placed(plan)
  assert.equal(walls.length, plan.walls.length, 'tous les murs tiennent dans la parcelle')
  // 8 + 8 + 5 + 5 arêtes de pourtour, dont une porte.
  assert.equal(plan.walls.length, 26)
  assert.deepEqual(plan.walls.filter((w) => w.k).map((w) => w.k), ['sliding'])
  const { dx, dz } = migrationOffset(false)
  const door = plan.walls.find((w) => w.k)
  assert.deepEqual(door, { x: 11 + dx, z: 6 + dz - 1, e: 'h', k: 'sliding', b: PAINT })
  // Papier peint sur chaque face intérieure, rien dehors ; parquet sur les 40 cases.
  assert.ok(plan.walls.every((w) => (w.a ? 1 : 0) + (w.b ? 1 : 0) === 1))
  const cells = plan.floor.map((f, i) => (f ? cellAt(i) : null)).filter(Boolean)
  assert.equal(cells.length, 40)
  assert.ok(cells.every((c) => inPlot(0, c.x, c.z)))
  // Les objets suivent ; tout se rejoint depuis l'ascenseur, l'intérieur de la pièce compris.
  assert.deepEqual(plan.items[0], { m: 'holo-me', x: 11.6 + dx, z: 8.4 + dz, r: 0 })
  const seen = reach(map, LIFT.x, LIFT.z)
  assert.ok(seen.has(`${Math.round(plan.items[0].x)},${Math.round(plan.items[0].z)}`))
  assert.ok(cells.every((c) => seen.has(`${c.x},${c.z}`)))
})

test('avec des extensions et des cloisons : un agrandissement offert, tout tient, les battants restent', () => {
  const layout = {
    ...CABIN,
    wings: { left: { shape: 'carre', floor: PLANKS }, right: { shape: 'deux-pieces', wall: PAINT } },
    partitions: [{ x: 12, z: 8, e: 'v', k: 'saloon' }, { x: 12, z: 9, e: 'v' }, { x: 12, z: 10, e: 'v', k: 'window' }],
  }
  const plan = migrateCabin(layout)
  assert.equal(plan.stage, 2)
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
