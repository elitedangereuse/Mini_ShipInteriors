// Mezzanine de la salle commune (shared/mezzanine.js) : la hauteur du sol, les garde-corps, et ce
// qu'ils arrêtent sur le plan du pont (le pas, la vue) ; les escaliers, eux, laissent passer.
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mezzanineHeight, mezzanineRails, parseMezzanine } from '../shared/mezzanine.js'
import { mezzanineOf, SHIP_LAYOUTS, shipMapOptions } from '../shared/ship-layouts.js'
import { DIRS, ShipMap } from '../shared/ship-map.js'
import { lineOfSight } from '../shared/sight.js'

const mezz = mezzanineOf(0)
const main = new ShipMap(SHIP_LAYOUTS['0'], shipMapOptions(0))

test('le sol monte le long des escaliers, sans marche entre le pied, les marches et le plancher', () => {
  assert.equal(mezzanineHeight(mezz, 5, 5), 0)
  assert.equal(mezzanineHeight(mezz, 1, 5), mezz.height)
  // Volée nord : de (3, 3,5), au pied, à (3, 1,5), au palier.
  let prev = mezzanineHeight(mezz, 3, 3.5)
  assert.equal(prev, 0)
  for (let z = 3.5; z >= 1.5; z -= 0.05) {
    const h = mezzanineHeight(mezz, 3, z)
    assert.ok(h >= prev - 1e-9 && h - prev < 0.05, `saut en z = ${z.toFixed(2)}`)
    prev = h
  }
  assert.ok(Math.abs(prev - mezz.height) < 1e-9)
})

test('on monte par les escaliers, pas par-dessus le garde-corps', () => {
  // Pied de la volée nord → première marche ; haut de la volée → palier.
  assert.equal(main.edge(3, 4, 0), 'open')
  assert.equal(main.edge(3, 2, 0), 'open')
  // Du hall au plancher, et du flanc d'une marche au hall : garde-corps.
  assert.equal(main.edge(3, 5, 3), 'wall')
  assert.equal(main.edge(3, 2, 1), 'wall')
  assert.equal(main.edge(3, 2, 3), 'wall')
  // Sur le plancher, on circule librement.
  assert.equal(main.edge(1, 4, 2), 'open')
})

test('le garde-corps arrête la vue : on n\'utilise pas, d\'en bas, ce qui est à l\'étage', () => {
  const jukebox = { x: -0.17, z: 4.5 }
  assert.ok(lineOfSight(main, { x: 1.5, z: 4.5 }, jukebox))
  assert.equal(lineOfSight(main, { x: 3.2, z: 4.5 }, jukebox), false)
  // Le tableau d'honneur, sur la façade : on le lit du hall, pas du plancher au-dessus.
  const board = { x: 2.57, z: 4.5 }
  assert.ok(lineOfSight(main, { x: 3.4, z: 4.5 }, board))
  assert.equal(lineOfSight(main, { x: 2.2, z: 4.5 }, board), false)
})

test('tout le plancher se rejoint depuis les portes du hall', () => {
  const seen = new Set(['8,4'])
  const queue = [[8, 4]]
  while (queue.length) {
    const [x, z] = queue.shift()
    for (let dir = 0; dir < 4; dir++) {
      const nx = x + DIRS[dir].dx, nz = z + DIRS[dir].dz
      if (main.room(nx, nz) !== mezz.room || main.edge(x, z, dir) === 'wall' || seen.has(`${nx},${nz}`)) continue
      seen.add(`${nx},${nz}`)
      queue.push([nx, nz])
    }
  }
  for (const t of mezz.tiles.values()) assert.ok(seen.has(`${t.x},${t.z}`), `(${t.x}, ${t.z}) injoignable`)
})

test('un escalier qui ne mène nulle part est refusé', () => {
  assert.throws(() => parseMezzanine({ height: 1, plan: [' ^', '  '] }), /palier/)
  assert.throws(() => parseMezzanine({ height: 1, plan: ['M?'] }), /inconnue/)
  // Une volée seule, à plat contre une autre pièce : ses flancs sont des garde-corps.
  const lone = parseMezzanine({ height: 1, plan: ['MM', ' ^', '  '] })
  const rails = mezzanineRails(lone, (x, z) => x >= 0 && x < 2 && z >= 0 && z < 3)
  assert.deepEqual(rails.map((r) => `${r.x},${r.z},${r.dir}`).sort(), ['0,0,2', '1,1,3'])
})
