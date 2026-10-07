import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DIRS, ShipMap } from '../shared/ship-map.js'
import { SHIP_LAYOUTS, SHOOTING_RANGE, shipMapOptions } from '../shared/ship-layouts.js'

const R = SHOOTING_RANGE
const map = new ShipMap(SHIP_LAYOUTS[String(R.level)], shipMapOptions(R.level))

test('stand de tir : ses cotes sont celles de la pièce, faces intérieures des murs comprises', () => {
  const tiles = []
  for (let z = 0; z < map.height; z++) for (let x = 0; x < map.width; x++) if (map.room(x, z) === R.room) tiles.push([x, z])
  const xs = tiles.map((t) => t[0]), zs = tiles.map((t) => t[1])
  // Un rectangle plein : les murs sont à une demi-tuile du centre des tuiles du bord, épais de 0,15 vers l'intérieur.
  assert.equal(tiles.length, (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...zs) - Math.min(...zs) + 1))
  assert.deepEqual(
    [R.minX, R.maxX, R.minZ, R.maxZ].map((v) => Math.round(v * 100) / 100),
    [Math.min(...xs) - 0.35, Math.max(...xs) + 0.35, Math.min(...zs) - 0.35, Math.max(...zs) + 0.35],
  )
})

test('stand de tir : on y entre par le palier, la raffinerie et la soute, toujours derrière le pas de tir', () => {
  const doors = map.doors.filter((d) => [map.room(d.x, d.z), map.room(d.x + DIRS[d.dir].dx, d.z + DIRS[d.dir].dz)].includes(R.room))
  const others = doors.map((d) => [map.room(d.x, d.z), map.room(d.x + DIRS[d.dir].dx, d.z + DIRS[d.dir].dz)].find((r) => r !== R.room)).sort()
  assert.deepEqual(others, ['g', 'j', 'm'])
  // Personne ne débouche dans le couloir des cibles : chaque porte donne au sud du comptoir.
  for (const d of doors) {
    const z = map.room(d.x, d.z) === R.room ? d.z : d.z + DIRS[d.dir].dz
    assert.ok(z - 0.5 > R.line, `porte en z = ${z}`)
  }
})
