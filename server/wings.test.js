// Extensions des quartiers (SHIP-02) : formes de plan, orientation dans chaque espace, portes.
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyWings, WING_PATTERNS, WING_ROOMS, WING_SIZE, WING_SLOTS, wingPlan } from '../shared/cabin-wings.js'
import { SHIP_LAYOUTS, shipMapOptions } from '../shared/ship-layouts.js'
import { DIRS, ShipMap } from '../shared/ship-map.js'
import { lineOfSight } from '../shared/sight.js'

const upper = () => new ShipMap(SHIP_LAYOUTS['1'], shipMapOptions(1))

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

test('dix formes, chacune avec son entrée au milieu du bord de la porte', () => {
  assert.equal(Object.keys(WING_PATTERNS).length, 10)
  for (const [id, p] of Object.entries(WING_PATTERNS)) {
    assert.equal(p.rows.length, WING_SIZE, id)
    for (const row of p.rows) assert.equal(row.length, WING_SIZE, id)
    assert.equal(p.rows[0][2], 'a', `${id} : l'entrée est dans la première pièce`)
  }
})

test('dans chaque espace, la pièce reste dans son carré et commence derrière la porte', () => {
  for (const slot of WING_SLOTS) {
    const behind = { x: slot.door.x + DIRS[slot.door.dir].dx, z: slot.door.z + DIRS[slot.door.dir].dz }
    assert.deepEqual(slot.entry, behind, slot.id)
    for (const id of Object.keys(WING_PATTERNS)) {
      const plan = wingPlan(slot, id)
      assert.equal(plan.tiles.length, WING_PATTERNS[id].rows.join('').replace(/ /g, '').length, `${slot.id}/${id}`)
      for (const t of plan.tiles) {
        assert.ok(t.x >= slot.x0 && t.x < slot.x0 + WING_SIZE && t.z >= slot.z0 && t.z < slot.z0 + WING_SIZE, `${slot.id}/${id} (${t.x}, ${t.z})`)
        assert.ok(WING_ROOMS[slot.id].includes(t.room))
      }
      assert.ok(plan.tiles.some((t) => t.x === slot.entry.x && t.z === slot.entry.z), `${slot.id}/${id} : entrée`)
    }
  }
})

test('les espaces ne touchent aucune pièce du pont', () => {
  const map = upper()
  for (const slot of WING_SLOTS) {
    for (let z = slot.z0; z < slot.z0 + WING_SIZE; z++) for (let x = slot.x0; x < slot.x0 + WING_SIZE; x++) assert.equal(map.room(x, z), null, `${slot.id} (${x}, ${z})`)
  }
})

test('sans extension, les trois portes sont verrouillées ; une pièce posée s\'ouvre et se parcourt en entier', () => {
  const map = upper()
  for (const s of WING_SLOTS) assert.equal(map.edge(s.door.x, s.door.z, s.door.dir), 'wall')
  const before = reach(map, 11, 8).size
  applyWings(map, { left: { shape: 'u' }, middle: { shape: 'deux-pieces' }, right: { shape: 'suite' } })
  for (const s of WING_SLOTS) assert.equal(map.edge(s.door.x, s.door.z, s.door.dir), 'door', s.id)
  const tiles = ['u', 'deux-pieces', 'suite'].reduce((n, id) => n + wingPlan(WING_SLOTS[0], id).tiles.length, 0)
  assert.equal(reach(map, 11, 8).size, before + tiles, 'toutes les tuiles, pièces du fond comprises, sont atteintes')
  // Les murs de la pièce arrêtent la vue : des quartiers, on ne voit pas le fond d'une pièce en L.
  assert.ok(lineOfSight(map, { x: 11, z: 9.6 }, { x: 11, z: 11.5 }))
})

test('changer de forme ou retirer la pièce vide l\'espace et reverrouille sa porte', () => {
  const map = upper()
  applyWings(map, { middle: { shape: 'deux-pieces' } })
  assert.equal(map.room(11, 15), 'D')
  applyWings(map, { middle: { shape: 'rectangle' } })
  assert.equal(map.room(11, 15), null)
  assert.equal(map.room(11, 13), 'C')
  // L'ancienne porte intérieure a disparu avec sa forme.
  assert.equal(map.edge(11, 12, 2), 'open')
  applyWings(map, {})
  assert.equal(map.room(11, 11), null)
  const s = WING_SLOTS[1]
  assert.equal(map.edge(s.door.x, s.door.z, s.door.dir), 'wall')
  assert.ok(map.isLocked(s.door.x, s.door.z, s.door.dir))
})
