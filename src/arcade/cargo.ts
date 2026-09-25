import { tr } from '../i18n'
import { emptyPad, padScore, pixelText, random, type ArcadeGame, type Pad, type Sfx } from './game'

/*
 * CARGAISON : des conteneurs de fret tombent dans la soute ; une rangée pleine part à la
 * livraison. Les règles d'un Tetris moderne : sept formes tirées par sacs de sept, rotation
 * SRS (et ses décalages contre les parois), réserve, trois conteneurs d'avance, conteneur
 * fantôme, verrouillage différé, niveau tous les dix lignes, chute qui s'accélère.
 */

export const COLS = 10
export const ROWS = 20
/** Rangées cachées au-dessus de la soute, où les conteneurs apparaissent. */
export const HIDDEN = 2
const H = ROWS + HIDDEN

/** Formes, dans leur orientation d'arrivée : cases (x, y) dans leur boîte, y vers le bas. */
const SPAWN: [number, number][][] = [
  [[0, 1], [1, 1], [2, 1], [3, 1]], // I
  [[1, 0], [2, 0], [1, 1], [2, 1]], // O
  [[1, 0], [0, 1], [1, 1], [2, 1]], // T
  [[1, 0], [2, 0], [0, 1], [1, 1]], // S
  [[0, 0], [1, 0], [1, 1], [2, 1]], // Z
  [[0, 0], [0, 1], [1, 1], [2, 1]], // J
  [[2, 0], [0, 1], [1, 1], [2, 1]], // L
]

/** Les quatre orientations de chaque forme (quart de tour horaire : (x, y) → (n − 1 − y, x)). */
const SHAPES: [number, number][][][] = SPAWN.map((cells, kind) => {
  if (kind === 1) return [cells, cells, cells, cells]
  const n = kind === 0 ? 4 : 3
  const out = [cells]
  for (let r = 1; r < 4; r++) out.push(out[r - 1].map(([x, y]) => [n - 1 - y, x] as [number, number]))
  return out
})

/**
 * Décalages essayés à chaque rotation (SRS), de l'orientation `from` vers `to` : ceux des
 * tables officielles, y retourné (ici, y descend).
 */
const KICKS: Record<string, [number, number][]> = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]], '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]], '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]], '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]], '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
}
const KICKS_I: Record<string, [number, number][]> = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]], '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]], '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]], '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]], '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
}
// Les tables sont écrites y vers le haut : on retourne y.
for (const table of [KICKS, KICKS_I]) for (const k of Object.keys(table)) table[k] = table[k].map(([x, y]) => [x, -y])

/** Couleurs du fret (I, O, T, S, Z, J, L), et le gris d'une soute pleine. */
export const FREIGHT = ['#3fa8d8', '#e9a917', '#9a5ad8', '#6aa83a', '#c8373a', '#3a62c8', '#e0701e', '#6a6f78']
export const FREIGHT_DARK = ['#1f5a78', '#8a6208', '#4e2a78', '#3a5c1c', '#6e1a1c', '#1c3070', '#8a3f0e', '#3a3e46']

const LINE_POINTS = [0, 100, 300, 500, 800]
const DAS = 0.16, ARR = 0.045, LOCK = 0.5, LOCK_RESETS = 15
const CLEAR_TIME = 0.36

interface Piece {
  /** Numéro du conteneur depuis le début de la partie. */
  id: number
  kind: number
  rot: number
  x: number
  y: number
}

export class Cargo implements ArcadeGame {
  readonly id = 'cargo'
  readonly width = 320
  readonly height = 240
  readonly sounds: Sfx[] = []
  score = 0
  level = 1
  lines = 0
  over = false
  /** Soute : 0 vide, 1 à 7 un conteneur (sa forme + 1), 8 gris (soute pleine). */
  readonly board = new Uint8Array(COLS * H)
  piece: Piece | null = null
  hold = -1
  readonly queue: number[] = []
  private holdUsed = false
  private count = 0
  private bag: number[] = []
  private fall = 0
  private lockTime = 0
  private lockResets = 0
  private dasDir = 0
  private dasTime = 0
  /** Rangées pleines qui clignotent avant de partir. */
  clearing: { rows: number[]; t: number } | null = null
  private popups: { text: string; t: number }[] = []
  private overTime = 0
  private rand: () => number
  /** Record à battre, affiché dans le coin. */
  best = 0

  constructor(seed = Math.floor(Math.random() * 2 ** 31)) {
    this.rand = random(seed)
    for (let i = 0; i < 4; i++) this.queue.push(this.draw7())
    this.spawn()
  }

  private draw7(): number {
    if (!this.bag.length) {
      this.bag = [0, 1, 2, 3, 4, 5, 6]
      for (let i = 6; i > 0; i--) {
        const j = Math.floor(this.rand() * (i + 1))
        ;[this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]]
      }
    }
    return this.bag.pop()!
  }

  /** Temps de chute d'une rangée au niveau en cours (courbe des Tetris modernes). */
  private get gravity(): number {
    const l = Math.min(this.level, 15)
    return Math.pow(0.8 - (l - 1) * 0.007, l - 1)
  }

  cellsOf(p: Piece): [number, number][] {
    return SHAPES[p.kind][p.rot].map(([x, y]) => [p.x + x, p.y + y])
  }

  fits(p: Piece): boolean {
    for (const [x, y] of this.cellsOf(p)) {
      if (x < 0 || x >= COLS || y >= H) return false
      if (y >= 0 && this.board[y * COLS + x]) return false
    }
    return true
  }

  private spawn(kind = this.queue.shift()!) {
    if (this.queue.length < 4) this.queue.push(this.draw7())
    const p = { id: ++this.count, kind, rot: 0, x: 3, y: 0 }
    this.fall = 0
    this.lockTime = 0
    this.lockResets = 0
    if (!this.fits(p)) {
      this.piece = null
      return this.gameOver()
    }
    this.piece = p
  }

  private gameOver() {
    this.over = true
    this.overTime = 0
    this.sounds.push('over')
  }

  private tryMove(dx: number, dy: number): boolean {
    const p = this.piece!
    const next = { ...p, x: p.x + dx, y: p.y + dy }
    if (!this.fits(next)) return false
    this.piece = next
    if (this.touching() && this.lockResets < LOCK_RESETS) {
      this.lockTime = 0
      this.lockResets++
    }
    return true
  }

  private rotate(dir: 1 | -1) {
    const p = this.piece!
    if (p.kind === 1) return
    const to = (p.rot + dir + 4) % 4
    const kicks = (p.kind === 0 ? KICKS_I : KICKS)[`${p.rot}>${to}`]
    for (const [kx, ky] of kicks) {
      const next = { ...p, rot: to, x: p.x + kx, y: p.y + ky }
      if (!this.fits(next)) continue
      this.piece = next
      if (this.touching() && this.lockResets < LOCK_RESETS) {
        this.lockTime = 0
        this.lockResets++
      }
      this.sounds.push('rotate')
      return
    }
  }

  private touching(): boolean {
    const p = this.piece!
    return !this.fits({ ...p, y: p.y + 1 })
  }

  /** Rangée où le conteneur se poserait (le fantôme). */
  ghostY(): number {
    const p = this.piece!
    let y = p.y
    while (this.fits({ ...p, y: y + 1 })) y++
    return y
  }

  private lock() {
    const p = this.piece!
    let above = true
    for (const [x, y] of this.cellsOf(p)) {
      if (y >= 0) this.board[y * COLS + x] = p.kind + 1
      if (y >= HIDDEN) above = false
    }
    this.piece = null
    this.holdUsed = false
    // Posé tout entier au-dessus de la soute : elle est pleine.
    if (above) return this.gameOver()
    const rows: number[] = []
    for (let y = 0; y < H; y++) {
      let full = true
      for (let x = 0; x < COLS; x++) if (!this.board[y * COLS + x]) full = false
      if (full) rows.push(y)
    }
    if (rows.length) {
      this.clearing = { rows, t: 0 }
      this.sounds.push(rows.length === 4 ? 'tetra' : 'line')
      const n = rows.length
      this.score += LINE_POINTS[n] * this.level
      if (n > 1) this.popups.push({ text: [tr('DOUBLE', 'DOUBLE'), tr('TRIPLE', 'TRIPLE'), tr('LIVRAISON !', 'DELIVERY!')][n - 2], t: 0 })
    } else {
      this.sounds.push('lock')
      this.spawn()
    }
  }

  private finishClear() {
    const rows = this.clearing!.rows
    this.clearing = null
    for (const r of rows) {
      this.board.copyWithin(COLS, 0, r * COLS)
      this.board.fill(0, 0, COLS)
    }
    const before = this.level
    this.lines += rows.length
    this.level = 1 + Math.floor(this.lines / 10)
    if (this.level > before) {
      this.sounds.push('level')
      this.popups.push({ text: tr(`NIVEAU ${this.level}`, `LEVEL ${this.level}`), t: 0 })
    }
    this.spawn()
  }

  step(dt: number, pad: Pad) {
    for (const p of this.popups) p.t += dt
    this.popups = this.popups.filter((p) => p.t < 1.4)
    if (this.over) {
      this.overTime += dt
      // La soute se remplit de gris, du fond vers le haut.
      const rows = Math.min(H, Math.floor(this.overTime * 30))
      for (let y = H - rows; y < H; y++) for (let x = 0; x < COLS; x++) if (this.board[y * COLS + x]) this.board[y * COLS + x] = 8
      return
    }
    if (this.clearing) {
      this.clearing.t += dt
      if (this.clearing.t >= CLEAR_TIME) this.finishClear()
      return
    }
    if (!this.piece) return

    if (pad.pressed.has('c') && !this.holdUsed) {
      // Réserve : on y range le conteneur, et l'on reprend celui qui y était (ou le suivant).
      const kind = this.piece.kind
      this.sounds.push('hold')
      if (this.hold < 0) this.spawn()
      else this.spawn(this.hold)
      this.hold = kind
      this.holdUsed = true
      if (!this.piece) return
    }
    if (pad.pressed.has('up')) this.rotate(1)
    if (pad.pressed.has('b')) this.rotate(-1)

    // Gauche, droite : un pas, puis la répétition automatique (la dernière direction appuyée gagne).
    let dir = 0
    if (pad.pressed.has('left')) dir = -1
    else if (pad.pressed.has('right')) dir = 1
    else if (this.dasDir && pad.held.has(this.dasDir < 0 ? 'left' : 'right')) dir = this.dasDir
    else if (pad.held.has('left')) dir = -1
    else if (pad.held.has('right')) dir = 1
    if (dir !== this.dasDir || pad.pressed.has('left') || pad.pressed.has('right')) {
      this.dasDir = dir
      this.dasTime = 0
      if (dir && this.tryMove(dir, 0)) this.sounds.push('move')
    } else if (dir) {
      this.dasTime += dt
      while (this.dasTime >= DAS + ARR) {
        this.dasTime -= ARR
        if (!this.tryMove(dir, 0)) break
      }
    }

    if (pad.pressed.has('a')) {
      // Chute directe : 2 crédits par rangée.
      const y = this.ghostY()
      this.score += (y - this.piece.y) * 2
      this.piece = { ...this.piece, y }
      this.sounds.push('drop')
      return this.lock()
    }

    const soft = pad.held.has('down')
    const interval = soft ? Math.min(this.gravity, 0.035) : this.gravity
    this.fall += dt
    while (this.fall >= interval && this.piece) {
      this.fall -= interval
      if (this.tryMove(0, 1)) {
        if (soft) this.score += 1
        this.lockTime = 0
        this.lockResets = 0
      } else break
    }
    if (this.piece && this.touching()) {
      this.lockTime += dt
      if (this.lockTime >= LOCK) this.lock()
    }
  }

  // ---------------------------------------------------------------- affichage

  draw(g: CanvasRenderingContext2D, t: number) {
    const cell = 10, ox = 110, oy = 22
    g.fillStyle = '#07090d'
    g.fillRect(0, 0, this.width, this.height)
    // Étoiles derrière la soute : on est dans l'espace.
    g.fillStyle = '#1a2130'
    for (let i = 0; i < 40; i++) g.fillRect((i * 83) % 320, (i * 47 + Math.floor(t * 3)) % 240, 1, 1)
    // Parois, trappe d'entrée et ses feux, bandes de danger au fond.
    const w = COLS * cell, floor = oy + ROWS * cell
    g.fillStyle = '#10131a'
    g.fillRect(ox, oy, w, ROWS * cell)
    g.fillStyle = '#161a22'
    for (let r = 0; r < ROWS; r++) g.fillRect(ox, oy + r * cell, w, 1)
    g.fillStyle = '#3a3f4a'
    g.fillRect(ox - 4, oy - 8, 4, ROWS * cell + 8)
    g.fillRect(ox + w, oy - 8, 4, ROWS * cell + 8)
    g.fillStyle = '#1f232c'
    g.fillRect(ox, oy - 8, w, 6)
    g.fillStyle = Math.floor(t * 3) % 2 ? '#ff8a1c' : '#5a3008'
    g.fillRect(ox + 8, oy - 7, 4, 3)
    g.fillRect(ox + w - 12, oy - 7, 4, 3)
    for (let x = 0; x < w + 8; x += 6) {
      g.fillStyle = (x / 6) % 2 ? '#17181b' : '#e9a917'
      g.fillRect(ox - 4 + x, floor, 6, 6)
    }
    // Conteneurs posés (les rangées pleines clignotent), fantôme, conteneur qui tombe.
    const flash = this.clearing && Math.floor(this.clearing.t * 16) % 2 === 0
    for (let y = HIDDEN; y < H; y++) {
      for (let x = 0; x < COLS; x++) {
        const v = this.board[y * COLS + x]
        if (!v) continue
        const white = flash && this.clearing!.rows.includes(y)
        container(g, ox + x * cell, oy + (y - HIDDEN) * cell, cell, white ? -1 : v - 1)
      }
    }
    if (this.piece) {
      const gy = this.ghostY()
      g.globalAlpha = 0.28
      for (const [x, y] of this.cellsOf({ ...this.piece, y: gy })) if (y >= HIDDEN) container(g, ox + x * cell, oy + (y - HIDDEN) * cell, cell, this.piece.kind)
      g.globalAlpha = 1
      for (const [x, y] of this.cellsOf(this.piece)) if (y >= HIDDEN) container(g, ox + x * cell, oy + (y - HIDDEN) * cell, cell, this.piece.kind)
    }
    // Tableau de bord : réserve à gauche, conteneurs suivants et crédits à droite.
    g.fillStyle = '#8a92a6'
    pixelText(g, tr('RÉSERVE', 'HOLD'), 56, 24, 1, 'center')
    pixelText(g, tr('SUIVANTS', 'NEXT'), 264, 24, 1, 'center')
    pixelText(g, tr('NIVEAU', 'LEVEL'), 56, 104, 1, 'center')
    pixelText(g, tr('LIGNES', 'LINES'), 56, 150, 1, 'center')
    pixelText(g, tr('CRÉDITS', 'CREDITS'), 264, 150, 1, 'center')
    pixelText(g, tr('RECORD', 'BEST'), 264, 196, 1, 'center')
    panel(g, 16, 36, 80, 50)
    panel(g, 224, 36, 80, 100)
    if (this.hold >= 0) mini(g, this.hold, 56, 61, this.holdUsed ? 0.35 : 1)
    this.queue.slice(0, 3).forEach((k, i) => mini(g, k, 264, 54 + i * 32, 1))
    g.fillStyle = '#ffffff'
    pixelText(g, String(this.level), 56, 116, 2, 'center')
    pixelText(g, String(this.lines), 56, 162, 2, 'center')
    pixelText(g, padScore(this.score), 264, 162, 2, 'center')
    g.fillStyle = '#ffe14f'
    pixelText(g, padScore(Math.max(this.best, this.score)), 264, 208, 1, 'center')
    // Annonces : double, triple, livraison, niveau.
    for (const [i, p] of this.popups.entries()) {
      g.globalAlpha = Math.min(1, (1.4 - p.t) * 3)
      g.fillStyle = '#ffe14f'
      pixelText(g, p.text, ox + w / 2, 100 - p.t * 12 + i * 16, 2, 'center')
    }
    g.globalAlpha = 1
    if (this.over && this.overTime > 0.8) {
      g.fillStyle = 'rgba(7, 9, 13, 0.75)'
      g.fillRect(ox, 92, w, 44)
      g.fillStyle = '#ff5a4f'
      pixelText(g, tr('SOUTE', 'HOLD'), ox + w / 2, 100, 2, 'center')
      pixelText(g, tr('PLEINE', 'FULL'), ox + w / 2, 118, 2, 'center')
    }
  }
}

/** Un conteneur : tôle ondulée, arête sombre, reflet ; `kind` -1 : blanc (rangée qui part). */
export function container(g: CanvasRenderingContext2D, x: number, y: number, s: number, kind: number) {
  if (kind < 0) {
    g.fillStyle = '#ffffff'
    g.fillRect(x, y, s, s)
    return
  }
  g.fillStyle = FREIGHT[kind]
  g.fillRect(x, y, s, s)
  g.fillStyle = FREIGHT_DARK[kind]
  for (let i = 2; i < s - 1; i += 3) g.fillRect(x + i, y + 1, 1, s - 2)
  g.fillRect(x, y + s - 1, s, 1)
  g.fillRect(x + s - 1, y, 1, s)
  g.fillStyle = 'rgba(255, 255, 255, 0.35)'
  g.fillRect(x, y, s - 1, 1)
}

function panel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  g.fillStyle = '#10131a'
  g.fillRect(x, y, w, h)
  g.fillStyle = '#2a303c'
  g.fillRect(x, y, w, 1)
  g.fillRect(x, y + h - 1, w, 1)
  g.fillRect(x, y, 1, h)
  g.fillRect(x + w - 1, y, 1, h)
}

/** Petit conteneur centré en (cx, cy) : la réserve, les suivants. */
function mini(g: CanvasRenderingContext2D, kind: number, cx: number, cy: number, alpha: number) {
  const cells = SHAPES[kind][0], s = 8
  const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1])
  const w = (Math.max(...xs) - Math.min(...xs) + 1) * s, h = (Math.max(...ys) - Math.min(...ys) + 1) * s
  g.globalAlpha = alpha
  for (const [x, y] of cells) container(g, cx - w / 2 + (x - Math.min(...xs)) * s, cy - h / 2 + (y - Math.min(...ys)) * s, s, kind)
  g.globalAlpha = 1
}

// ---------------------------------------------------------------- pilote automatique

/**
 * Joueur de démonstration (écrans du vaisseau, écran titre de la borne) : pour chaque
 * conteneur, il choisit la place qui laisse la soute la plus basse, la plus plate, sans trous,
 * puis y va, un geste par image.
 */
export class CargoPilot {
  private target: { rot: number; x: number } | null = null
  private forPiece = 0
  private readonly pad = emptyPad()
  private wait = 0
  /** Rotations demandées sans effet (le conteneur est coincé) : au-delà de trois, on n'insiste plus. */
  private stuck = 0

  constructor(private readonly game: Cargo, private readonly rand = Math.random) {}

  next(dt: number): Pad {
    const g = this.game, pad = this.pad
    pad.pressed.clear()
    pad.held.clear()
    const p = g.piece
    if (!p || g.over || g.clearing) return pad
    if (p.id !== this.forPiece) {
      this.forPiece = p.id
      this.target = this.plan()
      this.wait = 0.15 + this.rand() * 0.25
      this.stuck = 0
    }
    this.wait -= dt
    if (this.wait > 0 || !this.target) return pad
    this.wait = 0.06 + this.rand() * 0.08
    if (p.rot !== this.target.rot && this.stuck++ < 3) pad.pressed.add('up')
    else if (p.x < this.target.x) pad.pressed.add('right')
    else if (p.x > this.target.x) pad.pressed.add('left')
    else pad.pressed.add('a')
    return pad
  }

  private plan(): { rot: number; x: number } | null {
    const g = this.game, p = g.piece!
    let best: { rot: number; x: number; score: number } | null = null
    const board = g.board
    const heights = new Int32Array(COLS)
    // Le carré (O) est le même dans les quatre orientations, et ne tourne pas.
    for (let rot = 0; rot < (p.kind === 1 ? 1 : 4); rot++) {
      for (let x = -2; x < COLS; x++) {
        let q = { ...p, rot, x, y: 0 }
        if (!g.fits(q)) continue
        while (g.fits({ ...q, y: q.y + 1 })) q = { ...q, y: q.y + 1 }
        const cells = g.cellsOf(q)
        for (const [cx, cy] of cells) board[cy * COLS + cx] = 9
        // Lignes faites, hauteur totale, trous, relief (heuristique classique).
        let lines = 0
        for (let y = 0; y < H; y++) {
          let full = true
          for (let c = 0; c < COLS; c++) if (!board[y * COLS + c]) full = false
          if (full) lines++
        }
        let holes = 0, total = 0, bumps = 0
        for (let c = 0; c < COLS; c++) {
          let y = 0
          while (y < H && !board[y * COLS + c]) y++
          heights[c] = H - y
          total += heights[c]
          for (let k = y + 1; k < H; k++) if (!board[k * COLS + c]) holes++
          if (c) bumps += Math.abs(heights[c] - heights[c - 1])
        }
        for (const [cx, cy] of cells) board[cy * COLS + cx] = 0
        const score = -0.51 * total + 0.76 * lines - 0.36 * holes - 0.18 * bumps + this.rand() * 0.05
        if (!best || score > best.score) best = { rot, x, score }
      }
    }
    return best
  }
}
