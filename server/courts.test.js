import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DIRS, ShipMap } from '../shared/ship-map.js'
import { CARD_ROOM, FOYER_DOORS, GYM_ROOM, LIBRARY_ROOM, SHIP_LAYOUTS, SPORT_COURTS, shipMapOptions } from '../shared/ship-layouts.js'

/** Pièces que relie chaque porte d'un pont (« ab » : de a vers b). */
function linksOf(map) {
  return new Set(map.doors.flatMap((d) => {
    const a = map.room(d.x, d.z), b = map.room(d.x + DIRS[d.dir].dx, d.z + DIRS[d.dir].dz)
    return [a + b, b + a]
  }))
}

const hold = new ShipMap(SHIP_LAYOUTS['-1'], shipMapOptions(-1))
const holdLinks = linksOf(hold)
const upper = new ShipMap(SHIP_LAYOUTS['1'], shipMapOptions(1))
const upperLinks = linksOf(upper)

test('complexe d\'entraînement : du hall de la cale au hall d\'entraînement, puis aux trois salles', () => {
  for (const link of ['pz', 'zf', 'zo', 'zx']) assert.ok(holdLinks.has(link), `porte ${link}`)
  // Les terrains et la salle de sport ne communiquent pas entre eux, ni avec le bar.
  for (const link of ['fo', 'ox', 'fx', 'zb', 'ob']) assert.ok(!holdLinks.has(link), `pas de porte ${link}`)
  // La salle de sport : cinq tuiles sur quatre, sans trou.
  for (let z = 16; z <= 19; z++) for (let x = 16; x <= 20; x++) assert.equal(hold.room(x, z), GYM_ROOM.room, `salle de sport en ${x}, ${z}`)
})

test('complexe d\'entraînement : chaque marque de tir est sur son terrain, face au mur ouest de la pièce', () => {
  for (const [game, court] of Object.entries(SPORT_COURTS)) {
    assert.equal(court.level, -1, game)
    const x = Math.round(court.spot.x), z = Math.round(court.spot.z)
    assert.equal(hold.room(x, z), court.room, game)
    // Du mur visé à la marque, rien que le terrain ; derrière le mur, une autre pièce ou le vide.
    const first = Math.round(court.wall + 0.35)
    for (let tx = first; tx <= x; tx++) assert.equal(hold.room(tx, Math.round(court.center)), court.room, `${game} en x = ${tx}`)
    assert.notEqual(hold.room(first - 1, Math.round(court.center)), court.room, game)
    assert.ok(Math.abs(court.wall - (first - 0.35)) < 1e-9, `${game} : face du mur`)
    // Le gabarit des terrains (cf. src/court.ts) : sept tuiles de profondeur, six de large.
    let depth = 0, width = 0
    while (hold.room(first + depth, Math.round(court.center)) === court.room) depth++
    for (let tz = 0; tz < hold.height; tz++) if (hold.room(first, tz) === court.room) width++
    assert.equal(depth, 7, `${game} : profondeur`)
    assert.equal(width, 6, `${game} : largeur`)
  }
})

test('pont supérieur : la coursive longe le planétarium et devient la galerie, qui dessert tout le pont', () => {
  // Le salon d'écoute, le foyer du cinéma, la bibliothèque et le Comptoir donnent sur la galerie.
  for (const link of ['oc', 'oh', 'hc', 'hn', 'cl', 'cx', 'pc', 'kc', 'gc']) assert.ok(upperLinks.has(link), `porte ${link}`)
  // Le cinéma ne s'ouvre pas sur le salon, ni la bibliothèque sur le planétarium.
  for (const link of ['on', 'lp']) assert.ok(!upperLinks.has(link), `pas de porte ${link}`)
  // Le salon : cinq tuiles sur cinq, sans trou.
  for (let z = 4; z <= 8; z++) for (let x = 16; x <= 20; x++) assert.equal(upper.room(x, z), 'o', `salon en ${x}, ${z}`)
  // La galerie : deux rangées, du planétarium à la porte du Comptoir, et le passage le long du planétarium.
  for (const z of [9, 10]) for (let x = 15; x <= 29; x++) assert.equal(upper.room(x, z), 'c', `galerie en ${x}, ${z}`)
  for (let z = 4; z <= 10; z++) assert.equal(upper.room(15, z), 'c', `passage en 15, ${z}`)
  // Les portes doubles : celle du foyer vers la galerie, celle de la bibliothèque, celle du Comptoir.
  const foyer = upper.doors.filter((d) => upper.room(d.x, d.z) === 'h' && d.dir === 2).map((d) => `${d.x},${d.z}`).sort()
  assert.deepEqual(foyer, FOYER_DOORS.map((d) => `${d.x},${d.z}`).sort())
  const library = upper.doors.filter((d) => upper.room(d.x, d.z) === LIBRARY_ROOM.room).map((d) => `${d.x},${d.z}`).sort()
  assert.deepEqual(library, ['22,11', '23,11'])
})

test('pont supérieur : la bibliothèque et le Comptoir tiennent dans leurs murs, et l\'on n\'y entre que par la galerie', () => {
  for (const { room, minX, maxX, minZ, maxZ } of [LIBRARY_ROOM, CARD_ROOM]) {
    for (let z = Math.ceil(minZ); z <= Math.floor(maxZ); z++) for (let x = Math.ceil(minX); x <= Math.floor(maxX); x++) assert.equal(upper.room(x, z), room, `${room} en ${x}, ${z}`)
    for (const link of [...upperLinks].filter((l) => l.startsWith(room))) assert.equal(link, room + 'c')
  }
  assert.equal(upper.room(Math.round(CARD_ROOM.counter.x), Math.round(CARD_ROOM.counter.z)), CARD_ROOM.room)
})
