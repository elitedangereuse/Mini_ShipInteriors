// Cloisons des quartiers : forme vérifiée par le relais, pose sur le plan du pont.
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyPartitions, CABIN_ROOM, clearPartitions, MAX_PARTITIONS, sanitizePartitions } from '../shared/cabin-partitions.js'
import { applyWings } from '../shared/cabin-wings.js'
import { SHIP_LAYOUTS, shipMapOptions } from '../shared/ship-layouts.js'
import { ShipMap } from '../shared/ship-map.js'
import { lineOfSight } from '../shared/sight.js'
import { sanitizeLayout } from './cabin.js'

const upper = () => new ShipMap(SHIP_LAYOUTS['1'], shipMapOptions(1))

test('la forme des cloisons est vérifiée, une par arête, 48 au plus', () => {
  assert.equal(sanitizePartitions('toutes'), null)
  assert.equal(sanitizePartitions([]), null)
  assert.deepEqual(sanitizePartitions([
    { x: 10, z: 7, e: 'v' },
    { x: 12, z: 8, e: 'h', k: 'wood', extra: 1 },
    { x: 10, z: 7, e: 'v', k: 'glass' },
    { x: 13, z: 8, e: 'h', k: 'wall' },
    { x: 11, z: 7, e: 'd' },
    { x: 11.5, z: 7, e: 'v' },
    { x: -1, z: 7, e: 'v' },
    { x: 11, z: 7, e: 'v', k: 'Porte' },
    'mur',
  ]), [
    { x: 10, z: 7, e: 'v' },
    { x: 12, z: 8, e: 'h', k: 'wood' },
    { x: 13, z: 8, e: 'h' },
    { x: 11, z: 7, e: 'v' },
  ])
  const many = Array.from({ length: 100 }, (_, i) => ({ x: i % 40, z: Math.floor(i / 40), e: 'v' }))
  assert.equal(sanitizePartitions(many).length, MAX_PARTITIONS)
})

test('le relais garde les cloisons d\'un aménagement', () => {
  const out = sanitizeLayout({ items: [], partitions: [{ x: 10, z: 7, e: 'v', k: 'saloon' }, { x: 'a', z: 7, e: 'v' }] })
  assert.deepEqual(out.partitions, [{ x: 10, z: 7, e: 'v', k: 'saloon' }])
  assert.equal(sanitizeLayout({ items: [], partitions: 7 }).partitions, undefined)
})

test('un mur coupe le passage et la vue, une porte laisse passer ; tout se retire', () => {
  const map = upper()
  assert.equal(map.room(10, 8), CABIN_ROOM)
  assert.equal(map.edge(10, 8, 1), 'open')
  const placed = applyPartitions(map, [{ x: 10, z: 8, e: 'v' }, { x: 10, z: 9, e: 'v', k: 'wood' }, { x: 10, z: 7, e: 'v', k: 'window' }])
  assert.equal(placed.length, 3)
  assert.equal(map.edge(10, 8, 1), 'wall')
  assert.equal(map.edge(11, 8, 3), 'wall', 'vue de l\'autre tuile aussi')
  assert.equal(map.edge(10, 9, 1), 'door')
  assert.equal(map.edge(10, 7, 1), 'wall', 'un mur à hublot reste un mur')
  assert.equal(lineOfSight(map, { x: 10, z: 8 }, { x: 11, z: 8 }), false)
  clearPartitions(map, placed)
  for (const z of [7, 8, 9]) assert.equal(map.edge(10, z, 1), 'open')
  assert.ok(!map.doors.some((d) => d.x === 10 && d.z === 9))
})

test('une cloison ne se pose qu\'entre deux tuiles d\'une même pièce des quartiers', () => {
  const map = upper()
  // Hors des quartiers (la coursive), sur un mur existant, dans le vide : rien.
  const corridor = [...Array(map.width).keys()].flatMap((x) => [...Array(map.height).keys()].map((z) => ({ x, z })))
    .find(({ x, z }) => map.room(x, z) && map.room(x, z) !== CABIN_ROOM && map.room(x + 1, z) === map.room(x, z) && !/[A-F]/.test(map.room(x, z)))
  const walled = [...Array(map.width).keys()].flatMap((x) => [...Array(map.height).keys()].map((z) => ({ x, z })))
    .find(({ x, z }) => map.room(x, z) === CABIN_ROOM && map.edge(x, z, 1) === 'wall')
  assert.ok(corridor && walled)
  assert.deepEqual(applyPartitions(map, [{ ...corridor, e: 'v' }, { ...walled, e: 'v' }, { x: 0, z: 0, e: 'h' }]), [])
  // Dans une pièce d'extension, oui.
  applyWings(map, { middle: { shape: 'carre' } })
  assert.equal(applyPartitions(map, [{ x: 11, z: 12, e: 'v' }]).length, 1)
  assert.equal(map.edge(11, 12, 1), 'wall')
})
