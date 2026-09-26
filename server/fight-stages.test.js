import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FIGHT_STAGES, chooseFightStage, fightStage } from '../shared/fight-stages.js'
import { FightSimulation } from '../shared/fight.js'
const pad = { held: new Set(), pressed: new Set() }
const advance = (game, seconds) => { for (let i = 0; i < seconds * 120; i++) game.step(1 / 120, pad) }

test('chaque stage est accessible au tirage et possède son nom bilingue et sa musique', () => {
  FIGHT_STAGES.forEach((stage, i) => {
    assert.equal(chooseFightStage((i + .5) / FIGHT_STAGES.length), stage.id)
    assert.equal(fightStage(stage.id).music, stage.id)
    assert.equal(stage.name.length, 2)
    stage.name.forEach(name => assert.ok(name.length > 0))
  })
  assert.equal(chooseFightStage(0), 'street')
  assert.equal(chooseFightStage(1), 'temple')
  assert.equal(fightStage('unknown').id, 'street')
})

test('un tirage reproductible est inclus dans les snapshots et reste fixe entre les manches', () => {
  const game = new FightSimulation('versus', 7284)
  assert.equal(game.stage, new FightSimulation('solo', 7284).stage)
  const stage = game.snapshot().stage
  advance(game, 4.8)
  game.fighters[1].hp = 0
  advance(game, 4.5)
  assert.equal(game.level, 2)
  assert.equal(game.stage, stage)
  assert.equal(game.snapshot().stage, stage)
})

test('des graines différentes donnent les quatre stages, sans changer les règles du combat', () => {
  const counts = new Map(FIGHT_STAGES.map(stage => [stage.id, 0]))
  for (let seed = 0; seed < 200; seed++) {
    const game = new FightSimulation('versus', seed)
    counts.set(game.stage, counts.get(game.stage) + 1)
    assert.equal(game.remaining, 60)
    assert.deepEqual(game.fighters.map(f => f.hp), [100, 100])
  }
  for (const count of counts.values()) assert.ok(count > 25 && count < 80)
})
