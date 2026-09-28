import test from 'node:test'
import assert from 'node:assert/strict'
import { musicOrder, musicCue } from '../shared/music-playlist.js'

test('un album démarre au titre choisi puis poursuit la liste dans l’ordre', () => {
  const durations = [10, 20, 30, 40, 50]
  const order = musicOrder(durations.length, 2)
  assert.deepEqual(order, [2, 3, 4, 0, 1])
  assert.deepEqual(musicCue(durations, order, 0), { index: 2, orderIndex: 0, position: 0, cycle: 150 })
  assert.equal(musicCue(durations, order, 30)?.index, 3)
  assert.equal(musicCue(durations, order, 121)?.index, 0)
  assert.equal(musicCue(durations, order, 151)?.position, 1)
})

test('la boucle répète le titre choisi ; le mélange garde le même ordre pour tous', () => {
  const durations = [10, 20, 30, 40, 50]
  const shuffled = musicOrder(5, 2, true, 12345)
  assert.deepEqual(shuffled, musicOrder(5, 2, true, 12345))
  assert.equal(new Set(shuffled).size, 5)
  assert.equal(shuffled[0], 2)
  assert.deepEqual(musicCue(durations, shuffled, 67, true), { index: 2, orderIndex: 0, position: 7, cycle: 30 })
  const following = shuffled[1]
  assert.equal(musicOrder(5, following, true, 12345)[1], shuffled[2])
})
