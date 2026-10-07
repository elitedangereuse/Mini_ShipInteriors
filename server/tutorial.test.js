// Le simulateur d'accueil (cf. shared/tutorial.js) : un plan qui se lit, des portes là où les
// leçons les ouvrent, une sortie sur le pont principal.
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ShipMap } from '../shared/ship-map.js'
import { SHIP_LAYOUTS, shipMapOptions } from '../shared/ship-layouts.js'
import { TUTORIAL_CLOSED, TUTORIAL_EXIT, TUTORIAL_LAYOUT, TUTORIAL_SPAWN, TUTORIAL_TELEPORTER, onTutorialFloor } from '../shared/tutorial.js'

test('le simulateur : trois salles, une porte entre chacune, fermées au début', () => {
  const map = new ShipMap(TUTORIAL_LAYOUT, { closed: TUTORIAL_CLOSED })
  const rooms = new Set(map.rooms.flat().filter(Boolean))
  assert.deepEqual([...rooms].sort(), ['a', 'b', 't'])
  assert.equal(map.doors.length, 2)
  const between = map.doors.map((d) => {
    const other = map.room(d.x + [0, 1, 0, -1][d.dir], d.z + [-1, 0, 1, 0][d.dir])
    return [map.room(d.x, d.z), other].sort().join('')
  })
  assert.deepEqual(between.sort(), ['ab', 'bt'])
  for (const d of map.doors) assert.ok(map.isLocked(d.x, d.z, d.dir))
})

test('on se réveille dans le sas, le téléporteur est dans sa salle', () => {
  const map = new ShipMap(TUTORIAL_LAYOUT)
  assert.equal(map.room(TUTORIAL_SPAWN.x, TUTORIAL_SPAWN.z), 'a')
  assert.equal(map.room(Math.round(TUTORIAL_TELEPORTER.x), Math.round(TUTORIAL_TELEPORTER.z)), 't')
  assert.ok(onTutorialFloor(TUTORIAL_SPAWN.x, TUTORIAL_SPAWN.z))
  assert.ok(!onTutorialFloor(18, 0))
  assert.ok(!onTutorialFloor(-1, 2))
})

test('la sortie est dans la coursive du pont principal', () => {
  const main = new ShipMap(SHIP_LAYOUTS[String(TUTORIAL_EXIT.level)], shipMapOptions(TUTORIAL_EXIT.level))
  assert.equal(main.room(Math.round(TUTORIAL_EXIT.x), Math.round(TUTORIAL_EXIT.z)), 'c')
  assert.equal(main.room(Math.round(TUTORIAL_EXIT.x), Math.floor(TUTORIAL_EXIT.z)), 'c')
})
