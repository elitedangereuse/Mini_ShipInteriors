import { test } from 'node:test'
import assert from 'node:assert/strict'
import { composeFightMusic } from '../shared/fight-music.js'

test('la composition produit une boucle déterministe audible, finie et sans saturation', () => {
  const samples = composeFightMusic(8000), repeated = composeFightMusic(8000)
  assert.deepEqual(samples, repeated)
  let peak = 0, power = 0
  for (const sample of samples) { assert.ok(Number.isFinite(sample)); peak = Math.max(peak, Math.abs(sample)); power += sample * sample }
  assert.ok(peak < 1); assert.ok(Math.sqrt(power / samples.length) > .03)
  assert.ok(samples.length / 8000 > 13 && samples.length / 8000 < 14)
  assert.ok(Math.abs(samples[0] - samples.at(-1)) < .02, 'les bords de la boucle sont silencieux')
})
