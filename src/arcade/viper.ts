import { tr } from '../i18n'
import { emptyPad, padScore, pixelText, random, type ArcadeGame, type Pad, type Sfx } from './game'

/*
 * VIPER : un Viper ramasse des conteneurs flottants et les remorque derrière lui, au bout de
 * son rayon tracteur ; le train s'allonge et le vaisseau accélère. Le champ de force de la zone
 * de chargement et son propre chargement lui sont fatals. Un conteneur doré (du Brandy de Lave)
 * passe de temps en temps ; à partir du niveau 3, des mines dérivent dans la zone.
 */

export const COLS = 30
export const ROWS = 20
const CELL = 10
const OX = 10, OY = 30
/** Conteneurs ramassés par niveau. */
const PER_LEVEL = 5

type Dir = { x: number; y: number }
const DIRS: Record<'left' | 'right' | 'up' | 'down', Dir> = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } }

export class Viper implements ArcadeGame {
  readonly id = 'viper'
  readonly width = 320
  readonly height = 240
  readonly sounds: Sfx[] = []
  score = 0
  level = 1
  over = false
  /** Anneaux du train, la tête en premier (cases). */
  readonly body: { x: number; y: number }[] = []
  dir: Dir = DIRS.right
  /** Virages demandés, joués un par case (deux d'avance : on peut faire demi-tour en deux temps). */
  private turns: Dir[] = []
  food = { x: 0, y: 0 }
  /** Conteneur doré, et jusqu'à quand il flotte là. */
  gold: { x: number; y: number; until: number } | null = null
  readonly mines: { x: number; y: number }[] = []
  private eaten = 0
  /** Cases parcourues depuis le début : le pilote automatique joue une fois par case. */
  moves = 0
  private grow = 0
  private tick = 0
  private time = 0
  private overTime = 0
  private sparks: { x: number; y: number; vx: number; vy: number; t: number }[] = []
  private rand: () => number
  best = 0

  constructor(seed = Math.floor(Math.random() * 2 ** 31)) {
    this.rand = random(seed)
    for (let i = 0; i < 4; i++) this.body.push({ x: 8 - i, y: 10 })
    this.food = this.freeCell()
  }

  /** Cases par seconde : de 7 à 15, un peu plus vite à chaque conteneur. */
  private get speed(): number {
    return Math.min(15, 7 + this.eaten * 0.18)
  }

  private occupied(x: number, y: number): boolean {
    return this.body.some((b) => b.x === x && b.y === y) || this.mines.some((m) => m.x === x && m.y === y)
  }

  /** Case libre, loin de la tête. */
  private freeCell(): { x: number; y: number } {
    const head = this.body[0]
    for (let i = 0; i < 400; i++) {
      const x = 1 + Math.floor(this.rand() * (COLS - 2)), y = 1 + Math.floor(this.rand() * (ROWS - 2))
      if (this.occupied(x, y) || (this.food && this.food.x === x && this.food.y === y)) continue
      if (Math.abs(x - head.x) + Math.abs(y - head.y) < 4) continue
      return { x, y }
    }
    return { x: 1, y: 1 }
  }

  step(dt: number, pad: Pad) {
    this.time += dt
    for (const s of this.sparks) {
      s.t += dt
      s.x += s.vx * dt
      s.y += s.vy * dt
    }
    this.sparks = this.sparks.filter((s) => s.t < 0.9)
    if (this.over) {
      this.overTime += dt
      return
    }
    for (const name of ['left', 'right', 'up', 'down'] as const) {
      if (!pad.pressed.has(name)) continue
      const d = DIRS[name], last = this.turns[this.turns.length - 1] ?? this.dir
      // Pas de demi-tour sur place, ni deux fois la même direction.
      if ((d.x === -last.x && d.y === -last.y) || (d.x === last.x && d.y === last.y) || this.turns.length >= 2) continue
      this.turns.push(d)
    }
    if (this.gold && this.time > this.gold.until) this.gold = null
    this.tick += dt * this.speed
    while (this.tick >= 1 && !this.over) {
      this.tick -= 1
      this.advance()
    }
  }

  private advance() {
    this.moves++
    const turn = this.turns.shift()
    if (turn) {
      this.dir = turn
      this.sounds.push('turn')
    }
    const head = this.body[0]
    const x = head.x + this.dir.x, y = head.y + this.dir.y
    // La queue avance en même temps : on peut entrer dans la case qu'elle quitte.
    const tail = this.body[this.body.length - 1]
    const hitsBody = this.body.some((b, i) => b.x === x && b.y === y && !(i === this.body.length - 1 && !this.grow && b === tail))
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS || hitsBody || this.mines.some((m) => m.x === x && m.y === y)) return this.crash(head)
    this.body.unshift({ x, y })
    if (this.grow) this.grow--
    else this.body.pop()
    if (x === this.food.x && y === this.food.y) {
      this.eaten++
      this.grow++
      this.score += 10 * this.level
      this.sounds.push('eat')
      this.food = this.freeCell()
      if (this.eaten % PER_LEVEL === 0) {
        this.level++
        this.sounds.push('level')
        // Une mine de plus par niveau, à partir du troisième (dix au plus).
        if (this.level >= 3 && this.mines.length < 10) this.mines.push(this.freeCell())
      }
      if (!this.gold && this.eaten % 7 === 3) this.gold = { ...this.freeCell(), until: this.time + 7 }
    } else if (this.gold && x === this.gold.x && y === this.gold.y) {
      this.grow++
      this.score += 50 * this.level
      this.sounds.push('bonus')
      this.gold = null
    }
  }

  private crash(at: { x: number; y: number }) {
    this.over = true
    this.overTime = 0
    this.sounds.push('bang', 'over')
    for (let i = 0; i < 24; i++) {
      const a = this.rand() * Math.PI * 2, v = 20 + this.rand() * 70
      this.sparks.push({ x: OX + at.x * CELL + 5, y: OY + at.y * CELL + 5, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: this.rand() * 0.3 })
    }
  }

  // ---------------------------------------------------------------- affichage

  draw(g: CanvasRenderingContext2D, t: number) {
    g.fillStyle = '#04060c'
    g.fillRect(0, 0, this.width, this.height)
    // Ciel étoilé qui défile lentement, zone de chargement et son champ de force.
    g.fillStyle = '#1c2436'
    for (let i = 0; i < 60; i++) g.fillRect((i * 97 + Math.floor(t * 4)) % 320, (i * 61) % 240, 1, 1)
    // Repères de la zone de chargement : un point à chaque croisement.
    g.fillStyle = 'rgba(89, 216, 255, 0.14)'
    for (let y = 1; y < ROWS; y++) for (let x = 1; x < COLS; x++) g.fillRect(OX + x * CELL, OY + y * CELL, 1, 1)
    const pulse = 0.55 + 0.25 * Math.sin(t * 4)
    g.fillStyle = `rgba(89, 216, 255, ${pulse})`
    g.fillRect(OX - 2, OY - 2, COLS * CELL + 4, 1)
    g.fillRect(OX - 2, OY + ROWS * CELL + 1, COLS * CELL + 4, 1)
    g.fillRect(OX - 2, OY - 2, 1, ROWS * CELL + 4)
    g.fillRect(OX + COLS * CELL + 1, OY - 2, 1, ROWS * CELL + 4)
    // Mines : des étoiles rouges qui clignotent.
    for (const m of this.mines) {
      const x = OX + m.x * CELL, y = OY + m.y * CELL
      g.fillStyle = '#3a0c0c'
      g.fillRect(x + 2, y + 2, 6, 6)
      g.fillStyle = Math.floor(t * 4 + m.x) % 2 ? '#ff3b3b' : '#8a1a1a'
      g.fillRect(x + 4, y, 2, 10)
      g.fillRect(x, y + 4, 10, 2)
      g.fillRect(x + 3, y + 3, 4, 4)
    }
    // Conteneurs à ramasser (le doré ne reste pas longtemps : il clignote à la fin).
    canister(g, OX + this.food.x * CELL, OY + this.food.y * CELL, '#d8dde4', '#e0701e', t)
    if (this.gold && (this.gold.until - this.time > 2 || Math.floor(t * 8) % 2)) {
      canister(g, OX + this.gold.x * CELL, OY + this.gold.y * CELL, '#ffd23c', '#ff8a1c', t)
    }
    // Rayon tracteur entre les conteneurs remorqués, puis les conteneurs, puis le Viper.
    const pts = this.body.map((b) => ({ x: OX + b.x * CELL + 5, y: OY + b.y * CELL + 5 }))
    g.fillStyle = `rgba(89, 216, 255, ${0.35 + 0.15 * Math.sin(t * 10)})`
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i]
      g.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x) || 1, Math.abs(a.y - b.y) || 1)
    }
    if (!this.over || this.overTime < 0.15) {
      for (let i = this.body.length - 1; i > 0; i--) canister(g, OX + this.body[i].x * CELL, OY + this.body[i].y * CELL, i % 4 === 0 ? '#e0701e' : '#aab2bf', '#59d8ff', t, true)
      ship(g, OX + this.body[0].x * CELL + 5, OY + this.body[0].y * CELL + 5, this.dir, t)
    }
    for (const s of this.sparks) {
      g.globalAlpha = 1 - s.t / 0.9
      g.fillStyle = s.t < 0.3 ? '#ffffff' : '#ff8a1c'
      g.fillRect(s.x, s.y, 2, 2)
    }
    g.globalAlpha = 1
    // Bandeau : crédits, record, conteneurs remorqués, niveau.
    g.fillStyle = '#8a92a6'
    pixelText(g, tr('CRÉDITS', 'CREDITS'), 10, 6)
    pixelText(g, tr('RECORD', 'BEST'), 110, 6)
    pixelText(g, tr('FRET', 'CARGO'), 210, 6)
    pixelText(g, tr('NIV.', 'LVL'), 266, 6)
    g.fillStyle = '#ffffff'
    pixelText(g, padScore(this.score), 10, 16)
    g.fillStyle = '#ffe14f'
    pixelText(g, padScore(Math.max(this.best, this.score)), 110, 16)
    g.fillStyle = '#ffffff'
    pixelText(g, String(this.body.length - 1), 210, 16)
    pixelText(g, String(this.level), 266, 16)
    if (this.over && this.overTime > 0.6) {
      g.fillStyle = 'rgba(4, 6, 12, 0.7)'
      g.fillRect(70, 100, 180, 40)
      g.fillStyle = '#ff5a4f'
      pixelText(g, tr('COQUE : 0 %', 'HULL: 0%'), 160, 108, 2, 'center')
      g.fillStyle = '#8a92a6'
      pixelText(g, tr(`${this.body.length - 1} CONTENEURS PERDUS`, `${this.body.length - 1} CANISTERS LOST`), 160, 128, 1, 'center')
    }
  }
}

/** Un conteneur de fret flottant : fût gris, bande de couleur, balise qui clignote. */
function canister(g: CanvasRenderingContext2D, x: number, y: number, body: string, band: string, t: number, towed = false) {
  g.fillStyle = body
  g.fillRect(x + 2, y + 1, 6, 8)
  g.fillRect(x + 1, y + 2, 8, 6)
  g.fillStyle = band
  g.fillRect(x + 1, y + 4, 8, 2)
  if (!towed) {
    g.fillStyle = Math.floor(t * 3 + x) % 2 ? '#ffffff' : band
    g.fillRect(x + 4, y, 2, 1)
  } else {
    g.fillStyle = 'rgba(0, 0, 0, 0.25)'
    g.fillRect(x + 7, y + 2, 1, 6)
  }
}

/** Le Viper, vu de dessus : nez pointu dans la direction, verrière orange, réacteurs. */
function ship(g: CanvasRenderingContext2D, cx: number, cy: number, d: { x: number; y: number }, t: number) {
  // Repère du vaisseau : f vers l'avant, s sur le côté.
  const px = (f: number, s: number) => cx + d.x * f - d.y * s
  const py = (f: number, s: number) => cy + d.y * f + d.x * s
  const dot = (f: number, s: number, w = 1) => g.fillRect(Math.round(px(f, s) - w / 2), Math.round(py(f, s) - w / 2), w, w)
  g.fillStyle = '#dfe6f0'
  for (let f = -4; f <= 5; f++) {
    const half = f > 2 ? 0 : f > -1 ? 1 : f > -3 ? 3 : 4
    for (let s = -half; s <= half; s++) dot(f, s)
  }
  g.fillStyle = '#2a58c8'
  for (const s of [-4, -3, 3, 4]) dot(-3, s)
  g.fillStyle = '#ff8a1c'
  dot(1, 0, 2)
  g.fillStyle = Math.floor(t * 20) % 2 ? '#bfe8ff' : '#59d8ff'
  for (const s of [-2, 2]) dot(-6, s, 2)
}

// ---------------------------------------------------------------- pilote automatique

/**
 * Joueur de démonstration : il file vers le conteneur par le plus court chemin (en largeur),
 * et, s'il n'en trouve pas, vers la case la plus dégagée.
 */
export class ViperPilot {
  private readonly pad = emptyPad()
  private moves = -1

  constructor(private readonly game: Viper) {}

  next(): Pad {
    const g = this.game, pad = this.pad
    pad.pressed.clear()
    // Une décision par case : entre deux, le virage demandé n'est pas encore joué.
    if (g.over || g.moves === this.moves) return pad
    this.moves = g.moves
    const head = g.body[0]
    const blocked = new Uint8Array(COLS * ROWS)
    for (const b of g.body.slice(0, -1)) blocked[b.y * COLS + b.x] = 1
    for (const m of g.mines) blocked[m.y * COLS + m.x] = 1
    // Recherche en largeur depuis la tête ; on note la première direction de chaque chemin.
    const first = new Int8Array(COLS * ROWS).fill(-1)
    const names = ['left', 'right', 'up', 'down'] as const
    const queue: number[] = []
    names.forEach((n, i) => {
      const d = DIRS[n]
      if (d.x === -g.dir.x && d.y === -g.dir.y) return
      const x = head.x + d.x, y = head.y + d.y
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS || blocked[y * COLS + x] || first[y * COLS + x] >= 0) return
      first[y * COLS + x] = i
      queue.push(y * COLS + x)
    })
    const goal = g.gold ? [g.gold, g.food] : [g.food]
    let pick = -1
    for (let q = 0; q < queue.length && pick < 0; q++) {
      const c = queue[q], x = c % COLS, y = Math.floor(c / COLS)
      if (goal.some((f) => f.x === x && f.y === y)) pick = first[c]
      for (const d of Object.values(DIRS)) {
        const nx = x + d.x, ny = y + d.y
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || blocked[ny * COLS + nx] || first[ny * COLS + nx] >= 0) continue
        first[ny * COLS + nx] = first[c]
        queue.push(ny * COLS + nx)
      }
    }
    if (pick < 0 && queue.length) pick = first[queue[queue.length - 1]]
    if (pick >= 0) {
      const d = DIRS[names[pick]]
      if (d.x !== g.dir.x || d.y !== g.dir.y) pad.pressed.add(names[pick])
    }
    return pad
  }
}
