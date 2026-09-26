import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyBoardMove, boardState, draughtsMoves, newBoardGame } from './boards.js'

const player = (id, color) => ({ id, name: `CMDR ${id}`, color })

const draughts = (pieces) => {
  const game = newBoardGame('draughts', 'draughts')
  game.players = [player(1, 'red'), player(2, 'blue')]
  game.status = 'playing'
  game.board = Array.from({ length: 8 }, () => Array(8).fill(null))
  for (const [x, y, piece] of pieces) game.board[y][x] = piece
  return game
}

test('dames : les destinations proposées sont acceptées, dans les deux camps', () => {
  const game = newBoardGame('draughts', 'draughts')
  game.players = [player(1, 'red'), player(2, 'blue')]
  game.status = 'playing'
  for (let turn = 0; turn < 20 && game.status === 'playing'; turn++) {
    const moves = boardState(game).legalMoves
    assert.ok(moves.length)
    for (const move of moves) {
      const copy = structuredClone(game)
      assert.equal(applyBoardMove(copy, copy.players.find(p => p.color === copy.turn), move), true)
    }
    assert.equal(applyBoardMove(game, game.players.find(p => p.color === game.turn), moves[0]), true)
  }
})

test('dames : une prise obligatoire exclut les déplacements simples et impose toute la rafle', () => {
  const game = draughts([[0, 5, 'r'], [6, 5, 'r'], [1, 4, 'b'], [3, 2, 'b'], [7, 0, 'b']])
  assert.deepEqual(draughtsMoves(game), [{ from: [0, 5], to: [2, 3] }])
  const original = structuredClone(game)
  assert.equal(applyBoardMove(game, game.players[0], { from: [6, 5], to: [5, 4] }), false)
  assert.deepEqual(game, original, 'un coup refusé ne modifie pas la partie')
  assert.equal(applyBoardMove(game, game.players[0], { from: [0, 5], to: [2, 3] }), true)
  assert.deepEqual(game.continueAt, [2, 3])
  assert.equal(game.turn, 'red')
  assert.deepEqual(boardState(game).legalMoves, [{ from: [2, 3], to: [4, 1] }])
  assert.equal(applyBoardMove(game, game.players[0], { from: [6, 5], to: [5, 4] }), false)
  assert.equal(applyBoardMove(game, game.players[1], { from: [7, 0], to: [6, 1] }), false)
  assert.equal(applyBoardMove(game, game.players[0], { from: [2, 3], to: [4, 1] }), true)
  assert.equal(game.board[4][1], null)
  assert.equal(game.board[2][3], null)
  assert.equal(game.continueAt, null)
  assert.equal(game.turn, 'blue')
})

test('dames : promotion et déplacement arrière des dames, sans déplacement arrière des pions', () => {
  const game = draughts([[1, 2, 'r'], [2, 1, 'b'], [7, 0, 'b']])
  assert.equal(applyBoardMove(game, game.players[0], { from: [1, 2], to: [3, 0] }), true)
  assert.equal(game.board[0][3], 'R')
  assert.equal(applyBoardMove(game, game.players[1], { from: [7, 0], to: [6, 1] }), true)
  assert.equal(applyBoardMove(game, game.players[0], { from: [3, 0], to: [2, 1] }), true)
  const pawn = draughts([[2, 5, 'r'], [7, 0, 'b']])
  assert.equal(applyBoardMove(pawn, pawn.players[0], { from: [2, 5], to: [3, 6] }), false)
})

test('dames : un adversaire bloqué perd au lieu de rester sur un tour impossible', () => {
  const game = draughts([[6, 5, 'r'], [0, 7, 'b']])
  assert.equal(applyBoardMove(game, game.players[0], { from: [6, 5], to: [7, 4] }), true)
  assert.equal(game.status, 'ended')
  assert.equal(game.winner, 'red')
  assert.deepEqual(boardState(game).legalMoves, [])
})

test('les trois jeux attendent le second joueur avant de permettre un coup', () => {
  for (const [name, color, move] of [
    ['draughts', 'red', { from: [0, 5], to: [1, 4] }],
    ['guardian-connect', 'red', { column: 0 }],
    ['imperial-chess', 'white', { from: [4, 6], to: [4, 4] }],
  ]) {
    const game = newBoardGame(name, name)
    game.players = [player(1, color)]
    assert.equal(applyBoardMove(game, game.players[0], move), false)
    assert.equal(game.status, 'waiting')
  }
})

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
