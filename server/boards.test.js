import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyBoardMove, newBoardGame } from './boards.js'

const player = (id, color) => ({ id, name: `CMDR ${id}`, color })

test('dames : un déplacement simple change le tour', () => {
  const game = newBoardGame('draughts', 'draughts')
  game.players = [player(1, 'red'), player(2, 'blue')]
  game.status = 'playing'
  assert.equal(applyBoardMove(game, game.players[0], { from: [0, 5], to: [1, 4] }), true)
  assert.equal(game.board[5][0], null)
  assert.equal(game.board[4][1], 'r')
  assert.equal(game.turn, 'blue')
})

test('Puissance 4 : quatre cristaux gagnent la partie', () => {
  const game = newBoardGame('guardian-connect', 'guardian-connect')
  game.players = [player(1, 'red'), player(2, 'yellow')]
  game.status = 'playing'
  for (const column of [0, 1, 0, 1, 0, 1, 0]) {
    const p = game.players[game.turn === 'red' ? 0 : 1]
    assert.equal(applyBoardMove(game, p, { column }), true)
  }
  assert.equal(game.status, 'ended')
  assert.equal(game.winner, 'red')
})

test('Échec Impérial : les coups de base et les tours sont validés', () => {
  const game = newBoardGame('imperial-chess', 'imperial-chess')
  game.players = [player(1, 'white'), player(2, 'black')]
  game.status = 'playing'
  assert.equal(applyBoardMove(game, game.players[0], { from: [4, 6], to: [4, 4] }), true)
  assert.equal(applyBoardMove(game, game.players[1], { from: [4, 1], to: [4, 3] }), true)
  assert.equal(applyBoardMove(game, game.players[0], { from: [6, 7], to: [5, 5] }), true)
  assert.equal(game.turn, 'black')
})

