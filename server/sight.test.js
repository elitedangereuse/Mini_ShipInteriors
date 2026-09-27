// Ligne de vue sur le plan des ponts (UX-07) : murs, portes, objets adossés, bords du vide.
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SHIP_LAYOUTS } from '../shared/ship-layouts.js'
import { ShipMap } from '../shared/ship-map.js'
import { canReach, lineOfSight } from '../shared/sight.js'

const main = new ShipMap(SHIP_LAYOUTS['0'])
const upper = new ShipMap(SHIP_LAYOUTS['1'])

test('dans une même pièce, on voit', () => {
  assert.ok(lineOfSight(main, { x: 12, z: 7 }, { x: 14.6, z: 8.4 }))
})

test('un mur coupe la vue, même à portée de main', () => {
  // Coursive (z = 5) et mess (z = 6), de part et d'autre du mur, hors de la porte (x = 13).
  assert.equal(lineOfSight(main, { x: 11, z: 5 }, { x: 11.3, z: 6.32 }), false)
  assert.equal(canReach(main, { x: 11, z: 5 }, { x: 11.3, z: 6.32 }, 1.45), false)
})

test('une porte laisse passer la vue dans son ouverture, pas à travers ses montants', () => {
  // Porte du mess : tuile (13, 6), arête nord vers la coursive.
  assert.ok(lineOfSight(main, { x: 13, z: 5 }, { x: 13, z: 7 }))
  assert.ok(lineOfSight(main, { x: 12.9, z: 5 }, { x: 13.1, z: 7 }))
  assert.equal(lineOfSight(main, { x: 12, z: 5 }, { x: 13.4, z: 6.8 }), false, 'la vue passe sur le montant')
})

test('un objet adossé se voit de sa face, pas de derrière la cloison', () => {
  // Objet accroché au mur nord du mess (arête z = 5,5), à quelques centimètres dans le mess.
  const poster = { x: 11.5, z: 5.66 }
  assert.ok(canReach(main, { x: 11.5, z: 6.6 }, poster, 1.45), 'depuis le mess')
  assert.equal(canReach(main, { x: 11.5, z: 5 }, poster, 1.45), false, 'depuis la coursive')
})

test('un coin de mur ne laisse pas passer la vue', () => {
  // Coursive (z = 4) vers la cabine d'équipage (8, 3), en diagonale par l'angle du mur.
  assert.equal(lineOfSight(upper, { x: 9, z: 4 }, { x: 8, z: 3 }), false)
})

test('un objet au ras d\'un mur extérieur reste visible depuis sa pièce', () => {
  // Tuile (0, 5) de la salle des machines : l'objet déborde un peu sur le vide, à l'ouest.
  assert.ok(lineOfSight(main, { x: 1, z: 5 }, { x: -0.45, z: 5 }))
})
