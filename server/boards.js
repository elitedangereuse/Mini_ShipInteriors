/* Parties de plateau du salon : dames holographiques, Puissance 4 Guardian et Échec Impérial.
 * Le relais garde l'état et valide chaque coup ; le navigateur ne fait qu'afficher le plateau. */

export const BOARD_GAMES = new Set(['draughts', 'guardian-connect', 'imperial-chess'])

const COLORS = {
  draughts: ['red', 'blue'],
  'guardian-connect': ['red', 'yellow'],
  'imperial-chess': ['white', 'black'],
}

const other = (color) => (color === 'white' ? 'black' : color === 'black' ? 'white' : color === 'red' ? 'blue' : 'yellow')
const opponent = (game, color) => game === 'draughts' ? (color === 'red' ? 'blue' : 'red') : game === 'guardian-connect' ? (color === 'red' ? 'yellow' : 'red') : other(color)
const inside = (x, y, w, h) => x >= 0 && y >= 0 && x < w && y < h
const copyBoard = (board) => board.map((row) => (Array.isArray(row) ? row.slice() : row))

function draughtsBoard() {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null))
  for (let y = 0; y < 3; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) board[y][x] = 'b'
  for (let y = 5; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) board[y][x] = 'r'
  return board
}

function connectBoard() {
  return Array.from({ length: 6 }, () => Array(7).fill(null))
}

function chessBoard() {
  return [
    ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
    Array(8).fill('p'),
    Array(8).fill(null),
    Array(8).fill(null),
    Array(8).fill(null),
    Array(8).fill(null),
    Array(8).fill('P'),
    ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'],
  ]
}

export function newBoardGame(game, table) {
  if (!BOARD_GAMES.has(game)) return null
  const board = game === 'draughts' ? draughtsBoard() : game === 'guardian-connect' ? connectBoard() : chessBoard()
  return {
    game,
    table,
    players: [],
    board,
    turn: COLORS[game][0],
    status: 'waiting',
    winner: null,
    message: '',
    continueAt: null,
    castling: 'KQkq',
    enPassant: null,
  }
}

function pieceColor(piece) {
  if (!piece) return null
  return piece === piece.toUpperCase() ? 'white' : 'black'
}

function colorPiece(color) {
  return color === 'white' ? 'P' : 'p'
}

function playerOf(state, id) {
  return state.players.find((p) => p.id === id)
}

function wonConnect(board, row, col) {
  const color = board[row][col]
  const directions = [[1, 0], [0, 1], [1, 1], [1, -1]]
  return directions.some(([dx, dy]) => {
    let n = 1
    for (const sign of [-1, 1]) {
      let x = col + dx * sign, y = row + dy * sign
      while (inside(x, y, 7, 6) && board[y][x] === color) {
        n++
        x += dx * sign
        y += dy * sign
      }
    }
    return n >= 4
  })
}

function allFull(board) {
  return board[0].every(Boolean)
}

function draughtsDirections(piece) {
  const king = piece === piece.toUpperCase()
  if (king) return [[-1, -1], [1, -1], [-1, 1], [1, 1]]
  return piece === 'r' ? [[-1, -1], [1, -1]] : [[-1, 1], [1, 1]]
}

function draughtsCaptures(board, color, only = null) {
  const wanted = color === 'red' ? 'r' : 'b'
  const out = []
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    if (only && (only[0] !== x || only[1] !== y)) continue
    if (board[y][x]?.toLowerCase() !== wanted) continue
    for (const [dx, dy] of draughtsDirections(board[y][x])) {
      const mx = x + dx, my = y + dy, tx = x + dx * 2, ty = y + dy * 2
      if (inside(tx, ty, 8, 8) && board[my]?.[mx] && board[my][mx].toLowerCase() !== wanted && !board[ty][tx]) out.push({ from: [x, y], to: [tx, ty] })
    }
  }
  return out
}

function applyDraughts(state, player, move) {
  const p = playerOf(state, player.id)
  if (!p || state.status === 'ended' || state.turn !== p.color) return false
  const from = Array.isArray(move?.from) ? move.from : [], to = Array.isArray(move?.to) ? move.to : []
  const [x, y] = from, [tx, ty] = to
  if (![x, y, tx, ty].every(Number.isInteger) || !inside(x, y, 8, 8) || !inside(tx, ty, 8, 8)) return false
  if (state.continueAt && (state.continueAt[0] !== x || state.continueAt[1] !== y)) return false
  const piece = state.board[y][x], wanted = p.color === 'red' ? 'r' : 'b'
  if (!piece || piece.toLowerCase() !== wanted || state.board[ty][tx]) return false
  const dx = tx - x, dy = ty - y
  const distance = Math.abs(dx)
  if (distance !== Math.abs(dy) || (distance !== 1 && distance !== 2)) return false
  const capture = distance === 2
  if (capture) {
    const mx = (x + tx) / 2, my = (y + ty) / 2
    if (!state.board[my][mx] || state.board[my][mx].toLowerCase() === wanted) return false
  } else if (draughtsCaptures(state.board, p.color, state.continueAt).length) return false
  if (piece === piece.toLowerCase() && dy !== (wanted === 'r' ? -1 : 1) * distance) return false

  const board = copyBoard(state.board)
  board[y][x] = null
  if (capture) board[(y + ty) / 2][(x + tx) / 2] = null
  board[ty][tx] = piece
  if (wanted === 'r' && ty === 0) board[ty][tx] = 'R'
  if (wanted === 'b' && ty === 7) board[ty][tx] = 'B'
  state.board = board
  if (capture && draughtsCaptures(board, p.color, [tx, ty]).length) state.continueAt = [tx, ty]
  else {
    state.continueAt = null
    state.turn = opponent('draughts', p.color)
  }
  const enemyPiece = opponent('draughts', p.color) === 'red' ? 'r' : 'b'
  if (!board.some((row) => row.some((cell) => cell?.toLowerCase() === enemyPiece))) {
    state.status = 'ended'
    state.winner = p.color
  } else state.status = 'playing'
  return true
}

function applyConnect(state, player, move) {
  const p = playerOf(state, player.id)
  if (!p || state.status === 'ended' || state.turn !== p.color) return false
  const col = move?.column
  if (!Number.isInteger(col) || col < 0 || col >= 7) return false
  let row = -1
  for (let y = 5; y >= 0; y--) if (!state.board[y][col]) { row = y; break }
  if (row < 0) return false
  state.board[row][col] = p.color
  if (wonConnect(state.board, row, col)) {
    state.status = 'ended'
    state.winner = p.color
  } else if (allFull(state.board)) {
    state.status = 'ended'
    state.winner = 'draw'
  } else {
    state.turn = opponent('guardian-connect', p.color)
    state.status = 'playing'
  }
  return true
}

function squareAttacked(board, x, y, by) {
  const pawn = by === 'white' ? 'P' : 'p'
  const py = by === 'white' ? y + 1 : y - 1
  for (const px of [x - 1, x + 1]) if (inside(px, py, 8, 8) && board[py][px] === pawn) return true
  const knight = by === 'white' ? 'N' : 'n'
  for (const [dx, dy] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) if (inside(x + dx, y + dy, 8, 8) && board[y + dy][x + dx] === knight) return true
  const king = by === 'white' ? 'K' : 'k'
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if ((dx || dy) && inside(x + dx, y + dy, 8, 8) && board[y + dy][x + dx] === king) return true
  const rays = (pieces, dirs) => dirs.some(([dx, dy]) => {
    let cx = x + dx, cy = y + dy
    while (inside(cx, cy, 8, 8)) {
      const piece = board[cy][cx]
      if (piece) return pieces.includes(piece)
      cx += dx
      cy += dy
    }
    return false
  })
  if (rays(by === 'white' ? ['B', 'Q'] : ['b', 'q'], [[1, 1], [1, -1], [-1, 1], [-1, -1]])) return true
  return rays(by === 'white' ? ['R', 'Q'] : ['r', 'q'], [[1, 0], [-1, 0], [0, 1], [0, -1]])
}

function inCheck(board, color) {
  const king = color === 'white' ? 'K' : 'k'
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (board[y][x] === king) return squareAttacked(board, x, y, other(color))
  return true
}

function chessMove(state, color, move, finish = true) {
  const from = Array.isArray(move?.from) ? move.from : [], to = Array.isArray(move?.to) ? move.to : []
  const [x, y] = from, [tx, ty] = to
  if (![x, y, tx, ty].every(Number.isInteger) || !inside(x, y, 8, 8) || !inside(tx, ty, 8, 8)) return null
  const piece = state.board[y][x], target = state.board[ty][tx]
  if (!piece || pieceColor(piece) !== color || (target && pieceColor(target) === color)) return null
  const dx = tx - x, dy = ty - y, ax = Math.abs(dx), ay = Math.abs(dy), kind = piece.toLowerCase()
  const clear = (sx, sy) => {
    let cx = x + sx, cy = y + sy
    while (cx !== tx || cy !== ty) {
      if (state.board[cy][cx]) return false
      cx += sx
      cy += sy
    }
    return true
  }
  let castle = false, enPassant = false
  if (kind === 'p') {
    const dir = color === 'white' ? -1 : 1, start = color === 'white' ? 6 : 1
    const single = dx === 0 && dy === dir && !target
    const double = dx === 0 && y === start && dy === dir * 2 && !target && !state.board[y + dir][x]
    const capture = ax === 1 && dy === dir && target && pieceColor(target) !== color
    enPassant = ax === 1 && dy === dir && !target && state.enPassant?.[0] === tx && state.enPassant?.[1] === ty
    if (!single && !double && !capture && !enPassant) return null
  } else if (kind === 'n') {
    if (!((ax === 1 && ay === 2) || (ax === 2 && ay === 1))) return null
  } else if (kind === 'b') {
    if (ax !== ay || !clear(Math.sign(dx), Math.sign(dy))) return null
  } else if (kind === 'r') {
    if (!(dx === 0 || dy === 0) || !clear(Math.sign(dx), Math.sign(dy))) return null
  } else if (kind === 'q') {
    if (!((ax === ay || dx === 0 || dy === 0) && clear(Math.sign(dx), Math.sign(dy)))) return null
  } else if (kind === 'k') {
    castle = y === (color === 'white' ? 7 : 0) && x === 4 && dy === 0 && ax === 2
    if (castle) {
      const side = tx > x ? 'K' : 'Q', right = color === 'white' ? side : side.toLowerCase(), rookX = tx > x ? 7 : 0
      if (!state.castling.includes(right) || state.board[y][rookX]?.toLowerCase() !== 'r' || !clear(tx > x ? 1 : -1, 0)) return null
      if (inCheck(state.board, color) || squareAttacked(state.board, x + (tx > x ? 1 : -1), y, other(color)) || squareAttacked(state.board, tx, ty, other(color))) return null
    } else if (!(Math.max(ax, ay) === 1)) return null
  }
  const next = { ...state, board: copyBoard(state.board), castling: state.castling, enPassant: null, continueAt: null }
  next.board[y][x] = null
  next.board[ty][tx] = piece
  if (enPassant) next.board[ty + (color === 'white' ? 1 : -1)][tx] = null
  if (castle) {
    const rookX = tx > x ? 7 : 0, rookTo = tx > x ? 5 : 3
    next.board[y][rookTo] = next.board[y][rookX]
    next.board[y][rookX] = null
  }
  if (kind === 'p' && (ty === 0 || ty === 7)) {
    const promotion = ['q', 'r', 'b', 'n'].includes(String(move.promote).toLowerCase()) ? String(move.promote).toLowerCase() : 'q'
    next.board[ty][tx] = color === 'white' ? promotion.toUpperCase() : promotion
  }
  if (kind === 'p' && ay === 2) next.enPassant = [tx, y + (color === 'white' ? -1 : 1)]
  let rights = next.castling
  if (kind === 'k') rights = rights.replace(color === 'white' ? /K|Q/g : /k|q/g, '')
  if (kind === 'r' || target?.toLowerCase() === 'r') {
    for (const [right, rx, ry] of [['Q', 0, 7], ['K', 7, 7], ['q', 0, 0], ['k', 7, 0]]) if ((x === rx && y === ry) || (tx === rx && ty === ry)) rights = rights.replace(right, '')
  }
  next.castling = rights
  if (inCheck(next.board, color)) return null
  if (finish) {
    next.turn = other(color)
    const hasMove = chessHasMove(next, next.turn)
    if (!hasMove) {
      next.status = 'ended'
      next.winner = inCheck(next.board, next.turn) ? color : 'draw'
    } else next.status = 'playing'
  }
  return next
}

function chessHasMove(state, color) {
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    if (pieceColor(state.board[y][x]) !== color) continue
    for (let ty = 0; ty < 8; ty++) for (let tx = 0; tx < 8; tx++) if (chessMove(state, color, { from: [x, y], to: [tx, ty] }, false)) return true
  }
  return false
}

function applyChess(state, player, move) {
  const p = playerOf(state, player.id)
  if (!p || state.status === 'ended' || state.turn !== p.color) return false
  const next = chessMove(state, p.color, move)
  if (!next) return false
  Object.assign(state, next)
  return true
}

export function applyBoardMove(state, player, move) {
  if (state.game === 'draughts') return applyDraughts(state, player, move)
  if (state.game === 'guardian-connect') return applyConnect(state, player, move)
  return applyChess(state, player, move)
}

export function boardState(state) {
  return {
    game: state.game,
    table: state.table,
    players: state.players.map(({ id, name, color }) => ({ id, name, color })),
    board: state.board,
    turn: state.turn,
    status: state.status,
    winner: state.winner,
    message: state.message,
    continueAt: state.continueAt,
  }
}

export function boardColor(game, index) {
  return COLORS[game]?.[index] ?? null
}
