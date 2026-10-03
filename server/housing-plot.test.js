// Parcelle des quartiers (housing v2) : palier, tailles, champ de force, ligne de vue.
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyPlot, HOUSING_LEVEL, inPlot, LANDING_ROOM, PLOT_DOOR, PLOT_ROOM, PLOT_SIZES, plotRect, plotStage, straightRuns } from '../shared/housing-plot.js'
import { SHIP_LAYOUTS, shipMapOptions } from '../shared/ship-layouts.js'
import { DIRS, ShipMap } from '../shared/ship-map.js'
import { lineOfSight } from '../shared/sight.js'

const LIFT = { x: 10, z: 5 }
const quarters = () => new ShipMap(SHIP_LAYOUTS[String(HOUSING_LEVEL)], shipMapOptions(HOUSING_LEVEL))

/** Tuiles atteintes à pied depuis (x, z), en passant par les ouvertures et les portes. */
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

test('le palier porte l\'ascenseur et donne sur la parcelle par sa porte', () => {
  const map = quarters()
  assert.equal(map.room(LIFT.x, LIFT.z), LANDING_ROOM)
  assert.equal(map.room(PLOT_DOOR.x, PLOT_DOOR.z), LANDING_ROOM)
  const behind = { x: PLOT_DOOR.x + DIRS[PLOT_DOOR.dir].dx, z: PLOT_DOOR.z + DIRS[PLOT_DOOR.dir].dz }
  // Sans parcelle, la porte donne sur le vide.
  assert.equal(map.isFloor(behind.x, behind.z), false)
  applyPlot(map, 0)
  assert.equal(map.room(behind.x, behind.z), PLOT_ROOM)
  assert.equal(map.edge(PLOT_DOOR.x, PLOT_DOOR.z, PLOT_DOOR.dir), 'door')
})

test('quatre tailles, de 8, 12, 15 puis 20 tuiles de côté, qui grandissent sans rien déplacer', () => {
  assert.deepEqual(PLOT_SIZES, [8, 12, 15, 20])
  const corner = plotRect(0)
  for (const [stage, size] of PLOT_SIZES.entries()) {
    const r = plotRect(stage)
    assert.deepEqual([r.minX, r.minZ], [corner.minX, corner.minZ], 'le coin nord-ouest reste en place')
    assert.equal(r.maxX - r.minX + 1, size)
    assert.equal(r.maxZ - r.minZ + 1, size)
    assert.ok(inPlot(stage, r.maxX, r.maxZ) && !inPlot(stage, r.maxX + 1, r.maxZ))
  }
  assert.equal(plotStage(7), 3)
  assert.equal(plotStage(-1), 0)
  assert.equal(plotStage('1'), 0)
})

test('toute la parcelle est accessible depuis l\'ascenseur, et rien d\'autre', () => {
  for (const stage of PLOT_SIZES.keys()) {
    const map = quarters()
    const plan = applyPlot(map, stage)
    const seen = reach(map, LIFT.x, LIFT.z)
    for (const t of plan.tiles) assert.ok(seen.has(`${t.x},${t.z}`), `${stage} : ${t.x},${t.z}`)
    const landing = SHIP_LAYOUTS['2'].join('').split('').filter((c) => c === LANDING_ROOM).length
    assert.equal(seen.size, plan.tiles.length + landing)
  }
})

test('agrandir puis réduire : la parcelle retrouve sa taille, le palier ne bouge pas', () => {
  const map = quarters()
  applyPlot(map, 3)
  const plan = applyPlot(map, 0)
  assert.equal(plan.tiles.length, 64)
  const r = plotRect(3)
  let left = 0
  for (let z = r.minZ; z <= r.maxZ; z++) for (let x = r.minX; x <= r.maxX; x++) if (map.room(x, z) === PLOT_ROOM) left++
  assert.equal(left, 64)
  assert.equal(map.room(LIFT.x, LIFT.z), LANDING_ROOM)
})

test('le champ de force fait le tour de la parcelle, sauf contre le palier', () => {
  for (const stage of PLOT_SIZES.keys()) {
    const map = quarters()
    const plan = applyPlot(map, stage)
    const size = PLOT_SIZES[stage]
    const landing = SHIP_LAYOUTS['2'].filter((row) => row.includes(LANDING_ROOM)).length
    assert.equal(plan.field.length, 4 * size - landing, `${stage}`)
    for (const e of plan.field) {
      const d = DIRS[e.dir]
      assert.equal(map.isFloor(e.x + d.dx, e.z + d.dz), false)
      assert.equal(map.edge(e.x, e.z, e.dir), 'wall')
    }
    // Quatre côtés droits ; à l'ouest, le palier en prend le bas (8 × 8), puis le coupe en deux pans.
    const runs = straightRuns(plan.field)
    assert.equal(runs.length, size > 8 ? 5 : 4)
    assert.equal(runs.reduce((n, r) => n + r.edges.length, 0), plan.field.length)
  }
})

test('pans droits : une arête manquante coupe le pan', () => {
  const edges = [0, 1, 2, 4, 5].map((x) => ({ x, z: 3, dir: 0 }))
  const runs = straightRuns([...edges, { x: 9, z: 0, dir: 1 }, { x: 9, z: 1, dir: 1 }])
  assert.deepEqual(runs.map((r) => r.edges.length).sort(), [2, 2, 3])
})

test('on voit d\'un bout à l\'autre de la parcelle, pas au travers du champ de force', () => {
  const map = quarters()
  const r = applyPlot(map, 1).rect
  assert.ok(lineOfSight(map, { x: r.minX, z: r.minZ }, { x: r.maxX, z: r.maxZ }))
  assert.ok(!lineOfSight(map, { x: r.maxX, z: r.minZ }, { x: r.maxX + 3, z: r.minZ }))
})
