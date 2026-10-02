// Plans tout faits du mode construction (housing v2) : emprise, rotation, pièces accessibles.
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyWalls, wallRefusal } from '../shared/housing-home.js'
import { applyPlot, HOUSING_LEVEL, PLOT_ORIGIN } from '../shared/housing-plot.js'
import { HOME_TEMPLATES, placeTemplate, templateSize } from '../shared/housing-templates.js'
import { SHIP_LAYOUTS, shipMapOptions } from '../shared/ship-layouts.js'
import { DIRS, ShipMap } from '../shared/ship-map.js'

const LIFT = { x: 10, z: 5 }
const quarters = (stage) => {
  const map = new ShipMap(SHIP_LAYOUTS[String(HOUSING_LEVEL)], shipMapOptions(HOUSING_LEVEL))
  applyPlot(map, stage)
  return map
}
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

test('cinq plans, chacun dans son emprise, sans arête en double', () => {
  assert.deepEqual(HOME_TEMPLATES.map((t) => t.id), ['studio', 'deux-pieces', 'suite', 'veranda', 'coin-salon'])
  for (const t of HOME_TEMPLATES) {
    const keys = new Set(t.walls.map((w) => `${w.x},${w.z},${w.e}`))
    assert.equal(keys.size, t.walls.length, t.id)
    const [w, h] = t.size
    for (const e of t.walls) assert.ok(e.x >= -1 && e.x < w && e.z >= -1 && e.z < h, `${t.id} ${JSON.stringify(e)}`)
  }
})

test('posé et tourné dans la parcelle : tout tient, et chaque pièce se rejoint depuis l\'ascenseur', () => {
  const at = { x: PLOT_ORIGIN.x + 3, z: PLOT_ORIGIN.z + 3 }
  for (const t of HOME_TEMPLATES) {
    for (let turns = 0; turns < 4; turns++) {
      const map = quarters(1)
      const walls = placeTemplate(t, at, turns)
      assert.equal(walls.length, t.walls.length)
      assert.ok(walls.every((w) => wallRefusal(map, 1, w) === null), `${t.id} ${turns}`)
      applyWalls(map, walls, 1)
      const seen = reach(map, LIFT.x, LIFT.z)
      const [w, h] = templateSize(t, turns)
      for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) assert.ok(seen.has(`${at.x + x},${at.z + z}`), `${t.id} ${turns} : ${x},${z}`)
    }
  }
})

test('un quart de tour fait pivoter l\'emprise ; quatre la rendent', () => {
  const t = HOME_TEMPLATES.find((p) => p.id === 'deux-pieces')
  const key = (ws) => ws.map((w) => `${w.x},${w.z},${w.e},${w.k ?? ''}`).sort().join('|')
  assert.deepEqual(templateSize(t, 1), [4, 7])
  assert.equal(key(placeTemplate(t, { x: 0, z: 0 }, 4)), key(placeTemplate(t, { x: 0, z: 0 }, 0)))
  // Tourné d'un quart : la cloison verticale devient horizontale.
  const turned = placeTemplate(t, { x: 0, z: 0 }, 1)
  assert.ok(turned.some((w) => w.k === 'wood' && w.e === 'h'))
})
