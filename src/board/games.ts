import type { BoardGameId, BoardState, ServerMessage } from '../net'
import { tr } from '../i18n'

interface BoardHost {
  playerId: () => number
  sendJoin: (game: BoardGameId, table: string) => void
  sendMove: (game: BoardGameId, table: string, move: object) => void
  sendLeave: () => void
}

const TITLES: Record<BoardGameId, string> = {
  draughts: tr('DAMES HOLOGRAPHIQUES', 'HOLO DRAUGHTS'),
  'guardian-connect': tr('PUISSANCE 4 GUARDIAN', 'GUARDIAN CONNECT FOUR'),
  'imperial-chess': tr('ÉCHEC IMPÉRIAL', 'IMPERIAL CHESS'),
}

const COLORS: Record<string, string> = {
  red: tr('Rouges', 'Red'),
  blue: tr('Bleus', 'Blue'),
  yellow: tr('Jaunes', 'Yellow'),
  white: tr('Blancs', 'White'),
  black: tr('Noirs', 'Black'),
}

const CHESS: Record<string, string> = {
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
}

const ownPiece = (game: BoardGameId, piece: string | null, color: string | undefined) => {
  if (!piece || !color) return false
  if (game === 'imperial-chess') return color === 'white' ? piece === piece.toUpperCase() : piece === piece.toLowerCase()
  return piece.toLowerCase() === (color === 'red' ? 'r' : 'b')
}

export class BoardGames {
  private readonly root: HTMLDivElement
  private state: BoardState | null = null
  private current: { game: BoardGameId; table: string } | null = null
  private selected: [number, number] | null = null
  private notice = ''
  onClose?: () => void

  constructor(private readonly host: BoardHost) {
    this.root = document.createElement('div')
    this.root.className = 'boardgame'
    this.root.hidden = true
    this.root.addEventListener('click', (event) => this.click(event))
    document.body.append(this.root)
    addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.isOpen) this.close()
    })
  }

  get isOpen(): boolean {
    return !this.root.hidden
  }

  open(game: BoardGameId, table: string) {
    if (this.current?.game === game && this.current.table === table) return
    if (this.isOpen) this.close(false)
    this.current = { game, table }
    this.state = null
    this.selected = null
    this.notice = tr('Connexion à la table…', 'Connecting to the table…')
    this.root.hidden = false
    this.render()
    this.host.sendJoin(game, table)
  }

  close(returnToSeat = true) {
    if (!this.current) return
    this.host.sendLeave()
    this.current = null
    this.state = null
    this.selected = null
    this.root.hidden = true
    if (returnToSeat) this.onClose?.()
  }

  receive(message: ServerMessage) {
    if (message.t === 'board:state') {
      if (!this.current || message.game !== this.current.game || message.table !== this.current.table) return
      this.state = message
      this.notice = ''
      const me = message.players.find((p) => p.id === this.host.playerId())
      this.selected = message.game === 'draughts' && message.turn === me?.color ? message.continueAt : null
      this.render()
    } else if (message.t === 'board:error') {
      if (!this.current || (message.game && message.game !== this.current.game) || (message.table && message.table !== this.current.table)) return
      this.notice = message.code === 'full'
        ? tr('La table est déjà occupée.', 'The table is already occupied.')
        : message.code === 'invalid'
          ? tr('Coup impossible.', 'That move is not allowed.')
          : message.code === 'busy'
            ? tr('Le relais est momentanément occupé.', 'The relay is temporarily busy.')
            : message.code === 'far'
              ? tr('Approchez-vous de la table pour jouer.', 'Move closer to the table to play.')
              : tr('Cette table n’est pas disponible ici.', 'This table is not available here.')
      this.render()
    }
  }

  private click(event: Event) {
    if (!this.current) return
    const target = event.target as HTMLElement
    if (target.closest('.boardgame-close')) return this.close()
    const cell = target.closest<HTMLButtonElement>('[data-x][data-y]')
    if (!cell || !this.state) return
    const x = Number(cell.dataset.x), y = Number(cell.dataset.y)
    const me = this.state.players.find((p) => p.id === this.host.playerId())
    if (!me || this.state.status !== 'playing' || this.state.turn !== me.color) {
      this.notice = tr('Ce n’est pas votre tour.', 'It is not your turn.')
      return this.render()
    }
    if (this.current.game === 'guardian-connect') {
      this.host.sendMove(this.current.game, this.current.table, { column: x })
      return
    }
    const piece = this.state.board[y]?.[x] ?? null
    if (this.current.game === 'draughts') {
      const moves = this.state.legalMoves ?? []
      const playable = moves.some((m) => m.from[0] === x && m.from[1] === y)
      if (ownPiece(this.current.game, piece, me.color) && !playable) {
        this.notice = this.state.continueAt
          ? tr('Continuez la prise avec la même pièce.', 'Continue capturing with the same piece.')
          : tr('Choisissez une pièce encadrée : seules ces pièces peuvent jouer.', 'Choose an outlined piece: only those pieces can move.')
        return this.render()
      }
      if (this.selected && !ownPiece(this.current.game, piece, me.color) && !moves.some((m) => m.from[0] === this.selected![0] && m.from[1] === this.selected![1] && m.to[0] === x && m.to[1] === y)) {
        this.notice = tr('Choisissez une destination marquée sur le damier.', 'Choose a marked destination on the board.')
        return this.render()
      }
    }
    this.notice = ''
    if (!this.selected) {
      if (ownPiece(this.current.game, piece, me.color)) this.selected = [x, y]
      else this.notice = tr('Sélectionnez une de vos pièces.', 'Select one of your pieces.')
      return this.render()
    }
    if (this.selected[0] === x && this.selected[1] === y) {
      this.selected = null
      return this.render()
    }
    if (ownPiece(this.current.game, piece, me.color)) {
      this.selected = [x, y]
      return this.render()
    }
    const from = this.selected
    this.selected = null
    this.host.sendMove(this.current.game, this.current.table, { from, to: [x, y], promote: 'q' })
  }

  private render() {
    const game = this.current?.game
    if (!game) return
    this.root.replaceChildren()
    const panel = document.createElement('div')
    panel.className = `boardgame-panel boardgame-${game}`
    const header = document.createElement('div')
    header.className = 'boardgame-header'
    const title = document.createElement('div')
    title.className = 'boardgame-title'
    title.textContent = TITLES[game]
    const close = document.createElement('button')
    close.className = 'boardgame-close'
    close.type = 'button'
    close.textContent = tr('Quitter', 'Leave')
    header.append(title, close)
    panel.append(header)

    const info = document.createElement('div')
    info.className = 'boardgame-info'
    if (!this.state) info.textContent = this.notice
    else {
      const me = this.state.players.find((p) => p.id === this.host.playerId())
      const players = this.state.players.map((p) => `${p.name} · ${COLORS[p.color] ?? p.color}`).join('  ·  ')
      const stateText = this.state.status === 'waiting'
        ? tr('En attente d’un second joueur…', 'Waiting for a second player…')
        : this.state.status === 'ended'
          ? this.state.winner === 'draw'
            ? tr('Égalité.', 'Draw.')
            : this.state.winner === me?.color
              ? tr('Victoire !', 'Victory!')
              : tr('Partie terminée.', 'Game over.')
          : this.state.turn === me?.color
            ? tr('À vous de jouer.', 'Your turn.')
            : tr('Tour de l’adversaire.', 'Opponent’s turn.')
      info.textContent = `${players}  —  ${this.notice || stateText}`
    }
    panel.append(info)
    if (this.state) panel.append(this.drawBoard(this.state))
    const hint = document.createElement('div')
    hint.className = 'boardgame-hint'
    hint.textContent = game === 'guardian-connect'
      ? tr('Cliquez sur une colonne pour faire tomber votre cristal.', 'Click a column to drop your crystal.')
      : game === 'draughts'
        ? this.state?.continueAt
          ? tr('Rafle : continuez avec la même pièce vers une case marquée.', 'Multiple capture: continue with the same piece to a marked square.')
          : this.state?.legalMoves?.some((m) => Math.abs(m.to[0] - m.from[0]) === 2)
            ? tr('Prise obligatoire : choisissez une pièce encadrée puis une destination marquée.', 'Capture required: choose an outlined piece, then a marked destination.')
            : tr('Pions : une case en diagonale vers le camp adverse. Choisissez une pièce encadrée puis une destination marquée.', 'Men move one square diagonally toward the opposing side. Choose an outlined piece, then a marked destination.')
        : tr('Sélectionnez une pièce puis sa destination.', 'Select a piece, then its destination.')
    panel.append(hint)
    this.root.append(panel)
  }

  private drawBoard(state: BoardState): HTMLElement {
    const board = document.createElement('div')
    board.className = 'boardgame-board'
    const size = state.game === 'guardian-connect' ? [7, 6] : [8, 8]
    const me = state.players.find((p) => p.id === this.host.playerId())
    const moves = state.game === 'draughts' && state.status === 'playing' && state.turn === me?.color ? state.legalMoves ?? [] : []
    for (let y = 0; y < size[1]; y++) for (let x = 0; x < size[0]; x++) {
      const cell = document.createElement('button')
      cell.type = 'button'
      cell.dataset.x = String(x)
      cell.dataset.y = String(y)
      cell.className = `boardgame-cell ${((x + y) & 1) ? 'dark' : 'light'}`
      if (this.selected?.[0] === x && this.selected?.[1] === y) cell.classList.add('selected')
      if (moves.some((m) => m.from[0] === x && m.from[1] === y)) cell.classList.add('movable')
      if (moves.some((m) => m.from[0] === this.selected?.[0] && m.from[1] === this.selected?.[1] && m.to[0] === x && m.to[1] === y)) cell.classList.add('destination')
      const piece = state.board[y]?.[x] ?? null
      if (piece) {
        const token = document.createElement('span')
        if (state.game === 'guardian-connect') {
          token.className = `boardgame-token ${piece}`
          token.textContent = '◆'
        } else if (state.game === 'draughts') {
          token.className = `boardgame-token ${piece.toLowerCase() === 'r' ? 'red' : 'blue'} ${piece === piece.toUpperCase() ? 'king' : ''}`
          token.textContent = piece === piece.toUpperCase() ? '✦' : '●'
        } else {
          token.className = `boardgame-chess-piece ${piece === piece.toUpperCase() ? 'white' : 'black'}`
          token.textContent = CHESS[piece] ?? piece
        }
        cell.append(token)
      }
      board.append(cell)
    }
    return board
  }
}
