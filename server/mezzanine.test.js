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
  // Les deux volées partent du même palier, (2, 7), au pied de la façade : l'une monte au nord, de
  // z = 6,5 à 4,5, l'autre au sud, de z = 7,5 à 9,5.
  for (const [from, to] of [[6.5, 4.5], [7.5, 9.5]]) {
    const step = Math.sign(to - from) * 0.05
    let prev = mezzanineHeight(mezz, 2, from)
    assert.equal(prev, 0)
    for (let z = from; Math.abs(z - from) <= Math.abs(to - from) + 1e-9; z += step) {
      const h = mezzanineHeight(mezz, 2, z)
      assert.ok(h >= prev - 1e-9 && h - prev < 0.05, `saut en z = ${z.toFixed(2)}`)
      prev = h
    }
    assert.ok(Math.abs(prev - mezz.height) < 1e-9)
  }
})

test('on monte par les escaliers, pas par-dessus le garde-corps', () => {
  // Du hall au palier ; du palier à chaque volée ; du haut de chaque volée au plancher.
  assert.equal(main.edge(3, 7, 3), 'open')
  assert.equal(main.edge(2, 7, 0), 'open')
  assert.equal(main.edge(2, 7, 2), 'open')
  assert.equal(main.edge(2, 5, 0), 'open')
  assert.equal(main.edge(2, 9, 2), 'open')
  // Du hall au plancher ou à une marche, du palier ou d'une marche au plancher : garde-corps.
  assert.equal(main.edge(3, 4, 3), 'wall')
  assert.equal(main.edge(3, 6, 3), 'wall')
  assert.equal(main.edge(2, 6, 3), 'wall')
  assert.equal(main.edge(2, 7, 3), 'wall')
  // Sur le plancher, on circule librement, jusqu'au bout de la salle.
  assert.equal(main.edge(1, 4, 2), 'open')
  assert.equal(main.edge(1, 12, 2), 'open')
  // Au nord, le plancher s'adosse à la boutique du Weekly : un mur, pas un garde-corps.
  assert.equal(main.edge(2, 1, 1), 'wall')
  assert.equal(main.room(3, 1), 'w')
})

test('le garde-corps arrête la vue : on n\'utilise pas, d\'en bas, ce qui est à l\'étage', () => {
  const jukebox = { x: -0.17, z: 4.5 }
  assert.ok(lineOfSight(main, { x: 1.2, z: 4.5 }, jukebox))
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
