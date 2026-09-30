import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HAIR_STYLES, MAX_LOOK, parseStyle, styleSegment, validLook } from '../shared/look-style.js'

test('les apparences d\'avant restent valides', () => {
  for (const s of ['human.female.b', 'suit.male.c.artemis', 'alien.male.c.blue', 'robot.g', 'creature.orc', 'guardian.s']) assert.ok(validLook(s), s)
})

test('un style connu est accepté, en dernier segment', () => {
  assert.ok(validLook('human.female.b.mo-pk-sm--'))
  assert.ok(validLook('suit.male.c.flight.--se-nv-yl'))
  assert.ok(validLook('alien.female.d.violet.fb--ma--'))
  assert.ok(validLook('suit.female.b.dominator.po-pl-su-gp-cy'))
})

test('toute valeur inconnue ou mal placée est refusée', () => {
  for (const s of [
    'human.female.b.mo-pk-xx--', // expression inconnue
    'human.female.b.<script>-pk---',
    'human.female.b.mo-pk-sm-', // quatre champs
    'human.female.b.mo-pk-sm---', // six champs
    'human.female.b.----', // style vide
    'human.female.b.mo-pk-sm--.x', // le style n'est pas le dernier segment
    'human.female-b', // tiret hors du style
    'human.female.b.mo-PK-sm--',
    `human.female.b.${'a'.repeat(40)}`,
    42,
    null,
  ]) assert.equal(validLook(s), false, String(s))
})

test('la plus longue apparence tient dans la limite', () => {
  const longest = `suit.female.b.dominator.${styleSegment({ hair: 'fb', hairColor: 'bk', face: 'sm', paint: 'gp', trim: 'or' })}`
  assert.ok(longest.length <= MAX_LOOK && validLook(longest))
})

test('style : lecture et écriture', () => {
  assert.deepEqual(parseStyle('mo-pk-sm--'), { hair: 'mo', hairColor: 'pk', face: 'sm', paint: '', trim: '' })
  assert.equal(parseStyle('mo-pk-sm-'), null)
  assert.equal(styleSegment({ hair: 'mo', hairColor: 'pk', face: 'sm' }), 'mo-pk-sm--')
  assert.equal(styleSegment({ hair: 'nope', face: '' }), '')
  assert.equal(styleSegment(null), '')
  for (const hair of HAIR_STYLES) assert.equal(parseStyle(styleSegment({ hair }))?.hair, hair)
})
