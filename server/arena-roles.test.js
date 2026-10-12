import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ARENA_CHARACTERS } from '../shared/arena.js'

/*
 * Les fiches des personnages, au terminal (src/arena/roster.ts : leurs forces, leurs faiblesses, ce
 * qu'ils sont seuls à faire), disent des choses vraies des chiffres des règles : un réglage
 * d'équilibrage ne doit pas les rendre fausses, ni effacer ce qui distingue chacun.
 */

const C = ARENA_CHARACTERS
const ids = Object.keys(C)
const most = (f) => ids.reduce((a, b) => (f(C[b]) > f(C[a]) ? b : a))
const least = (f) => ids.reduce((a, b) => (f(C[b]) < f(C[a]) ? b : a))
const only = (f) => ids.filter((id) => f(C[id]))

test('chaque personnage garde ce que sa fiche dit de lui', () => {
  assert.equal(most((c) => c.hp), 'marcel', 'Marcel a le plus de points de vie')
  assert.equal(least((c) => c.speed), 'marcel', 'Marcel est le plus lent')
  assert.equal(least((c) => c.weapon.range), 'marcel', 'Marcel a la plus courte portée')
  assert.equal(most((c) => c.weapon.range), 'nico', 'Nico porte le plus loin')
  assert.equal(most((c) => c.speed), 'nico', 'Nico est le plus rapide')
  assert.equal(least((c) => c.hp), 'nico', 'Nico est le plus fragile')
  assert.equal(most((c) => c.weapon.mag), 'rourke', 'Rourke a le plus grand chargeur')
  assert.deepEqual(only((c) => c.weapon.auto), ['rourke'], 'Rourke est le seul automatique')
  assert.deepEqual(only((c) => c.weapon.heal), ['betty'], 'Betty est la seule à soigner')
  assert.deepEqual(only((c) => c.weapon.pierce), ['nico'], 'seul le laser de Nico traverse')
  assert.deepEqual(only((c) => c.weapon.lob).sort(), ['capucine', 'jacques'], 'Capucine et Jacques lancent par-dessus les obstacles')
  assert.deepEqual(only((c) => c.scan), ['nico'], 'Boulon, le drone de Nico, voit dans les buissons')
  // Jacques : solide et lent, sans l'être autant que Marcel.
  assert.ok(C.jacques.hp > C.rourke.hp && C.jacques.hp < C.marcel.hp, 'Jacques est solide')
  assert.ok(C.jacques.speed < 1 && C.jacques.speed > C.marcel.speed, 'Jacques est lent')
  assert.ok(C.capucine.hp < C.rourke.hp, 'Capucine est fragile')
})
