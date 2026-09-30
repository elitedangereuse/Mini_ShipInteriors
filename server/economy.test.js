// Économie du jeu (src/economy/economy.json, relu par le site) : barèmes, plafonds anti-triche,
// et rythme de progression d'un joueur moyen (cf. docs/economie-v1.html).
//   npm test
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { salvageMinDuration, salvageReward } from '../shared/salvage.js'

const E = JSON.parse(readFileSync(new URL('../src/economy/economy.json', import.meta.url), 'utf8'))
const isCount = (n) => Number.isInteger(n) && n > 0

/** Crédits par heure des tâches de bord, si on les réglait toutes. */
function tasksPerHour() {
  let total = 0
  for (const spot of E.spots) {
    const t = E.tasks[spot.task]
    total += (3600 / t.period) * t.chance * t.reward
  }
  return total
}

test('zone thargoïde : barème par membre, plafond du jour et durée minimale', () => {
  assert.equal(salvageReward(E.salvage, 1, 1), 1000)
  assert.equal(salvageReward(E.salvage, 3, 2), 3900)
  assert.equal(salvageReward(E.salvage, 6, 6), 15000)
  assert.ok(isCount(E.salvage.daily))
  assert.ok(E.salvage.minPerParcel > 0)
  assert.equal(salvageMinDuration(E.salvage, 6, 4), 2 * E.salvage.minPerParcel)
})

test('plats de Marcel et révisions de Nico : prime, délais cohérents, plafond du jour', () => {
  for (const job of ['kitchen', 'hangar']) {
    const r = E[job]
    assert.ok(r.reward > 0, job)
    assert.ok(isCount(r.daily), job)
    assert.ok(r.minTime > 0 && r.minTime < r.minGap, `${job} : payé après minTime, au plus un toutes les minGap`)
  }
  // Un jour de PNJ rapporte moins qu'une heure de tâches : un bonus, pas un raccourci.
  const npcDay = E.kitchen.reward * E.kitchen.daily + E.hangar.reward * E.hangar.daily
  assert.ok(npcDay < tasksPerHour() / 2, `${npcDay} CR par jour`)
})

test('plafonds du revenu passif, des tâches et des records', () => {
  assert.ok(isCount(E.passive.daily) && E.passive.daily < 24 * 60, 'minutes payées par jour')
  assert.ok(isCount(E.taskRules.daily))
  // Le délai entre deux tâches reste plus court que le plus court des gestes plus un pas.
  const shortest = Math.min(...Object.values(E.tasks).map((t) => t.duration))
  assert.ok(E.taskRules.minGap > 0 && E.taskRules.minGap <= shortest + 2)
  assert.ok(isCount(E.arcade.recordDaily))
})

test('paliers d\'arcade et de sport : scores et primes croissants', () => {
  for (const [game, tiers] of Object.entries(E.arcade.tiers)) {
    for (let i = 1; i < tiers.length; i++) {
      assert.ok(tiers[i][0] > tiers[i - 1][0], `${game} : scores`)
      assert.ok(tiers[i][1] > tiers[i - 1][1], `${game} : primes`)
    }
  }
  for (const sport of ['gym-run', 'gym-bike', 'gym-punch']) assert.equal(E.arcade.tiers[sport].reduce((n, [, cr]) => n + cr, 0), 3700)
})

test('progression : un équipage moyen se paie une extension en une semaine, les trois en deux mois', () => {
  // Joueur « Équipage » : revenu passif, et la moitié des tâches qui apparaissent.
  const perHour = E.passive.perMinute * 60 + tasksPerHour() / 2
  const hours = (cost) => (cost - E.start) / perHour
  const [first, second, third] = E.wings
  assert.ok(hours(first) >= 2 && hours(first) <= 7, `première extension : ${hours(first).toFixed(1)} h`)
  const all = hours(first + second + third)
  assert.ok(all >= 20 && all <= 60, `trois extensions : ${all.toFixed(1)} h`)
  // Et la prime de départ paie un animal tout de suite.
  assert.ok(E.start >= E.items['pet-chien'])
})
