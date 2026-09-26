import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fightAnimation } from '../shared/fight-animation.js'
import { FightSimulation, MOVES } from '../shared/fight.js'
import { FIGHT_ROSTER } from '../shared/fight-roster.js'

const counts = { idle: 4, run: 8, jump: 2, fall: 2, light: 4, heavy: 4, hit: 4, death: 4 }
const fighter = overrides => ({ ...new FightSimulation().fighters[0], ...overrides })
const manifest = JSON.parse(readFileSync(new URL('../src/arcade/assets/fighters/manifest.ts', import.meta.url), 'utf8').split('export default ')[1])

test('la pose suit les déplacements réels, le saut, les impacts et la garde', () => {
  assert.equal(fightAnimation(fighter(), counts, 1).clip, 'idle')
  assert.equal(fightAnimation(fighter({ moving: true, walk: 3 }), counts, 1).clip, 'run')
  assert.equal(fightAnimation(fighter({ moving: true, guard: true }), counts, 1).clip, 'idle')
  assert.equal(fightAnimation(fighter({ moving: true, crouch: true }), counts, 1).clip, 'idle')
  assert.equal(fightAnimation(fighter({ y: 20, vy: 100 }), counts, 1).clip, 'jump')
  assert.equal(fightAnimation(fighter({ y: 20, vy: -100 }), counts, 1).clip, 'fall')
  assert.deepEqual(fightAnimation(fighter({ stun: .22, attack: { move: 'kick', time: .2 } }), counts, 1), { clip: 'hit', frame: 0 })
})
test('le contact visuel de chaque personnage correspond au moment des dégâts', () => {
  for (const profile of FIGHT_ROSTER) for (const [move, clip] of [['punch', 'light'], ['kick', 'heavy'], ['plasma', 'heavy']]) {
    const sheet = manifest[profile.asset]
    const f = fighter({ character: profile.id, attack: { move, time: MOVES[move].windup * profile.tempo, hit: false } })
    assert.deepEqual(fightAnimation(f, counts, 42, 0, sheet.contacts), { clip, frame: sheet.contacts[clip] }, `${profile.name}/${move}`)
    f.attack.time = MOVES[move].duration * profile.tempo
    assert.equal(fightAnimation(f, counts, 42, 0, sheet.contacts).frame, counts[clip] - 1)
  }
})
test('un coup dont la première frame est active attend la fin de l’anticipation', () => {
  const f = fighter({ attack: { move: 'kick', time: .1 } })
  assert.equal(fightAnimation(f, counts, 1, 0, { heavy: 0 }).clip, 'idle')
  f.attack.time = MOVES.kick.windup
  assert.deepEqual(fightAnimation(f, counts, 1, 0, { heavy: 0 }), { clip: 'heavy', frame: 0 })
})
test('un KO joue l’animation une seule fois puis reste au sol', () => {
  const f = fighter({ hp: 0, moving: true, stun: .2 })
  assert.deepEqual(fightAnimation(f, counts, 0, 0), { clip: 'death', frame: 0 })
  assert.deepEqual(fightAnimation(f, counts, 300, 2.2), { clip: 'death', frame: 3 })
})
test('le relais expose la marche puis l’arrêt, sans faire courir les sprites sur place', () => {
  const g = new FightSimulation('versus'); g.phase = 'fight'
  g.step(1 / 60, { held: new Set(['right']), pressed: new Set() })
  assert.equal(g.snapshot().fighters[0].moving, true)
  g.step(1 / 60, { held: new Set(), pressed: new Set() })
  assert.equal(g.snapshot().fighters[0].moving, false)
  assert.equal(fightAnimation(g.fighters[0], counts, 2).clip, 'idle')
})
test('les six atlas contiennent 32 frames valides et leur provenance CC0', () => {
  assert.equal(new Set(FIGHT_ROSTER.map(p => p.asset)).size, 6)
  for (const profile of FIGHT_ROSTER) {
    const sheet = manifest[profile.asset]
    assert.equal(sheet.license, 'CC0-1.0')
    assert.match(sheet.source, /luizmelo\.itch\.io\/fantasy-martial-characters-2$/)
    const png = readFileSync(new URL(`../src/arcade/assets/fighters/${profile.asset}.png`, import.meta.url))
    assert.equal(png.subarray(1, 4).toString(), 'PNG')
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20)
    const frames = Object.values(sheet.animations).flat()
    assert.equal(frames.length, 32)
    for (const f of frames) {
      assert.ok(f.x >= 0 && f.y >= 0 && f.w > 0 && f.h > 0 && f.x + f.w <= width && f.y + f.h <= height)
      assert.ok(Number.isFinite(f.ox) && Number.isFinite(f.oy))
    }
  }
})
