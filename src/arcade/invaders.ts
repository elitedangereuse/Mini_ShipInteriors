import { tr } from '../i18n'
import { emptyPad, padScore, pixelText, random, type ArcadeGame, type Pad, type Sfx } from './game'

/*
 * THARGOID INVADERS : une vague de Thargoïdes descend en marche vers les stations Coriolis qui
 * protègent le vaisseau. Interceptors en haut (30 points), Scouts au milieu (20), essaims de
 * Thargons en bas (10) ; la formation accélère à mesure qu'elle se vide, comme en 1978. Les
 * stations s'effritent sous les tirs, des deux côtés. Un Interceptor géant traverse parfois le
 * haut de l'écran : ce qu'il rapporte dépend du nombre de tirs déjà faits (les habitués savent
 * lequel vaut 300). Une vie de plus à 1 500 points, puis tous les 10 000 ; si la formation touche le sol, c'est
 * l'invasion.
 */

export const W = 320
export const H = 240
export const COLS = 11
export const ROWS = 5
const GAP_X = 20, GAP_Y = 16
/** Haut du vaisseau du joueur, et le sol. */
export const PLAYER_Y = 212
const GROUND = 224
export const MOTHER_Y = 27
const STATION_Y = 180
export const SHOT_SPEED = 260
const PLAYER_SPEED = 110
const MOTHER_SPEED = 55
/** Une vie de plus à 1 500 points, puis tous les 10 000. */
const EXTRA_LIFE = 1500, EXTRA_EVERY = 10000
/** Ce que rapporte l'Interceptor géant, selon le nombre de tirs faits (le 15e, puis tous les 15 : 300). */
const MOTHER_POINTS = [100, 50, 50, 100, 150, 100, 100, 50, 150, 100, 100, 50, 150, 100, 300]

// ---------------------------------------------------------------- sprites

/** Sprite en pixels : `#` la couleur principale, `o` la couleur d'accent. */
interface Sprite {
  w: number
  h: number
  main: number[]
  accent: number[]
}

function sprite(rows: string[]): Sprite {
  const s: Sprite = { w: Math.max(...rows.map((r) => r.length)), h: rows.length, main: [], accent: [] }
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '#') s.main.push(x, y)
      else if (row[x] === 'o') s.accent.push(x, y)
    }
  })
  return s
}

function blit(g: CanvasRenderingContext2D, s: Sprite, x: number, y: number, color: string, accent = color) {
  x = Math.round(x)
  y = Math.round(y)
  g.fillStyle = color
  for (let i = 0; i < s.main.length; i += 2) g.fillRect(x + s.main[i], y + s.main[i + 1], 1, 1)
  g.fillStyle = accent
  for (let i = 0; i < s.accent.length; i += 2) g.fillRect(x + s.accent[i], y + s.accent[i + 1], 1, 1)
}

export type Kind = 'interceptor' | 'scout' | 'thargon'

/** Les trois Thargoïdes de la formation : points, couleur, deux images de marche. */
export const KINDS: Record<Kind, { points: number; color: string; accent: string; frames: [Sprite, Sprite] }> = {
  interceptor: {
    points: 30, color: '#ff4fd8', accent: '#ffffff',
    frames: [
      sprite([
        '...#....#...',
        '.#..####..#.',
        '..########..',
        '.###.oo.###.',
        '############',
        '.###.##.###.',
        '..########..',
        '.#..####..#.',
      ]),
      sprite([
        '.#...##...#.',
        '..#.####.#..',
        '..########..',
        '####.oo.####',
        '.##########.',
        '####.##.####',
        '..########..',
        '..#.####.#..',
      ]),
    ],
  },
  scout: {
    points: 20, color: '#6dff7a', accent: '#d6ffb0',
    frames: [
      sprite([
        '....####....',
        '..########..',
        '.##.oooo.##.',
        '############',
        '..#.#..#.#..',
        '.#..#..#..#.',
        '#..........#',
        '............',
      ]),
      sprite([
        '....####....',
        '..########..',
        '.##.oooo.##.',
        '############',
        '..#.#..#.#..',
        '..#.#..#.#..',
        '...#....#...',
        '............',
      ]),
    ],
  },
  thargon: {
    points: 10, color: '#39e0ff', accent: '#ffffff',
    frames: [
      sprite([
        '....####....',
        '..##....##..',
        '.#..####..#.',
        '.#.##oo##.#.',
        '.#..####..#.',
        '..##....##..',
        '....#..#....',
        '...#....#...',
      ]),
      sprite([
        '....####....',
        '..##....##..',
        '.#..####..#.',
        '.#.##oo##.#.',
        '.#..####..#.',
        '..##....##..',
        '...#....#...',
        '....#..#....',
      ]),
    ],
  },
}

const ROW_KIND: Kind[] = ['interceptor', 'scout', 'scout', 'thargon', 'thargon']

const MOTHER = sprite([
  '......####......',
  '...##########...',
  '.##############.',
  '###.##.oo.##.###',
  '################',
  '..###..##..###..',
  '...#........#...',
])

const SHIP = sprite([
  '......#......',
  '.....###.....',
  '.....#o#.....',
  '..#########..',
  '.###########.',
  '#############',
  '##..#...#..##',
])

const BURST = sprite([
  '....#..#....',
  '.#..#..#..#.',
  '..#......#..',
  '...#....#...',
  '##........##',
  '...#....#...',
  '..#......#..',
  '.#..#..#..#.',
])

/** Station Coriolis : la fente d'amarrage au milieu, une arche dessous. */
const STATION = [
  '.....############.....',
  '...################...',
  '..##################..',
  '.####################.',
  '######################',
  '######################',
  '#######........#######',
  '#######........#######',
  '######################',
  '######################',
  '######################',
  '######################',
  '#######........#######',
  '######..........######',
  '#####............#####',
  '####..............####',
]
const STATION_W = STATION[0].length, STATION_H = STATION.length

// ---------------------------------------------------------------- jeu

export interface Alien {
  col: number
  row: number
  kind: Kind
  alive: boolean
}

export interface Bomb {
  x: number
  y: number
  /** Caustique : lent, en zigzag ; éclair : rapide, droit. */
  kind: 'caustic' | 'bolt'
}

interface Station {
  x: number
  mask: Uint8Array
}

interface Blast {
  x: number
  y: number
  t: number
  life: number
  color: string
  text?: string
}

export class Invaders implements ArcadeGame {
  readonly id = 'invaders'
  readonly width = W
  readonly height = H
  readonly sounds: Sfx[] = []
  score = 0
  /** Vague en cours. */
  level = 0
  lives = 3
  over = false
  best = 0
  readonly player = { x: W / 2, alive: true }
  /** Tir du joueur : un seul à la fois. */
  shot: { x: number; y: number } | null = null
  readonly aliens: Alien[] = []
  readonly bombs: Bomb[] = []
  readonly stations: Station[] = []
  mother: { x: number; dir: 1 | -1 } | null = null
  /** Coin haut gauche de la formation, et son sens de marche. */
  fx = 0
  fy = 0
  dir: 1 | -1 = 1
  private frame = 0
  private note = 0
  private lastNote = 0
  private marchTimer = 0
  private dropNext = false
  private fireTimer = 1.5
  private motherTimer = 20
  private motherSiren = 0
  private shotsFired = 0
  private respawn = 0
  private nextWave = 0
  private extra = EXTRA_LIFE
  private time = 0
  private overTime = 0
  /** Invasion : la formation a touché le sol. */
  private invaded = false
  private wantFire = false
  private blasts: Blast[] = []
  private sparks: { x: number; y: number; vx: number; vy: number; t: number; color: string }[] = []
  private rand: () => number

  constructor(seed = Math.floor(Math.random() * 2 ** 31)) {
    this.rand = random(seed)
    this.startWave()
  }

  private startWave() {
    this.level++
    this.aliens.length = 0
    for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) this.aliens.push({ col, row, kind: ROW_KIND[row], alive: true })
    this.fx = Math.round((W - ((COLS - 1) * GAP_X + 12)) / 2)
    // Chaque vague part un peu plus bas (cinq crans au plus).
    this.fy = 40 + Math.min(this.level - 1, 5) * 8
    this.dir = 1
    this.dropNext = false
    this.marchTimer = 0.6
    this.fireTimer = 1.5
    this.motherTimer = 16 + this.rand() * 8
    this.mother = null
    this.bombs.length = 0
    this.stations.length = 0
    for (let i = 0; i < 4; i++) {
      const mask = new Uint8Array(STATION_W * STATION_H)
      STATION.forEach((row, y) => {
        for (let x = 0; x < STATION_W; x++) mask[y * STATION_W + x] = row[x] === '#' ? 1 : 0
      })
      this.stations.push({ x: Math.round((W * (i + 1)) / 5 - STATION_W / 2), mask })
    }
  }

  alienX(a: Alien): number {
    return this.fx + a.col * GAP_X
  }

  alienY(a: Alien): number {
    return this.fy + a.row * GAP_Y
  }

  get alive(): number {
    let n = 0
    for (const a of this.aliens) if (a.alive) n++
    return n
  }

  /** Secondes entre deux pas de la formation : de 0,45 s (pleine) à 0,016 s (le dernier). */
  private get marchInterval(): number {
    return (0.016 + (0.43 * this.alive) / (COLS * ROWS)) / (1 + (this.level - 1) * 0.1)
  }

  private addScore(points: number) {
    this.score += points
    if (this.score >= this.extra) {
      this.extra += EXTRA_EVERY
      this.lives++
      this.sounds.push('life')
    }
  }

  step(dt: number, pad: Pad) {
    this.time += dt
    for (const s of this.sparks) {
      s.t += dt
      s.x += s.vx * dt
      s.y += s.vy * dt
    }
    this.sparks = this.sparks.filter((s) => s.t < 0.9)
    for (const b of this.blasts) b.t += dt
    this.blasts = this.blasts.filter((b) => b.t < b.life)
    if (this.over) {
      this.overTime += dt
      return
    }
    if (pad.pressed.has('a') || pad.pressed.has('up') || pad.held.has('a')) this.wantFire = true
    const move = (pad.held.has('right') ? 1 : 0) - (pad.held.has('left') ? 1 : 0)
    // Pas de 1/120 s : les tirs ne traversent pas un Thargoïde entre deux images.
    const n = Math.max(1, Math.ceil(dt * 120))
    for (let i = 0; i < n && !this.over; i++) this.tick(dt / n, move)
    this.wantFire = false
  }

  private tick(h: number, move: number) {
    const p = this.player
    if (this.nextWave > 0 && (this.nextWave -= h) <= 0) {
      this.nextWave = 0
      this.startWave()
      this.sounds.push('level')
    }
    // Le vaisseau du joueur, son tir.
    if (p.alive) {
      p.x = Math.max(10, Math.min(W - 10, p.x + move * PLAYER_SPEED * h))
      if (this.wantFire && !this.shot) {
        this.shot = { x: Math.round(p.x), y: PLAYER_Y - 4 }
        this.shotsFired++
        this.wantFire = false
        this.sounds.push('shoot')
      }
    } else if (this.respawn > 0 && (this.respawn -= h) <= 0) {
      p.alive = true
      p.x = W / 2
    }
    if (this.shot) {
      this.shot.y -= SHOT_SPEED * h
      if (this.shot.y < 24) {
        this.blasts.push({ x: this.shot.x - 6, y: 22, t: 0, life: 0.2, color: '#ff5a4f' })
        this.shot = null
      }
    }
    // La formation marche et tire (elle se fige le temps que le joueur revienne).
    const fighting = p.alive && this.nextWave === 0 && this.alive > 0
    if (fighting && (this.marchTimer -= h) <= 0) this.march()
    if (fighting && (this.fireTimer -= h) <= 0) this.bomb()
    for (const b of this.bombs) b.y += (b.kind === 'bolt' ? 125 + this.level * 5 : 70 + this.level * 3) * h
    // L'Interceptor géant.
    if (fighting && !this.mother && this.alive >= 8 && (this.motherTimer -= h) <= 0) {
      const dir = this.shotsFired % 2 ? -1 : 1
      this.mother = { x: dir > 0 ? -MOTHER.w : W, dir }
    }
    if (this.mother) {
      const m = this.mother
      m.x += m.dir * MOTHER_SPEED * h
      if ((this.motherSiren -= h) <= 0) {
        this.motherSiren = 0.16
        this.sounds.push('saucer')
      }
      if (m.x < -MOTHER.w - 2 || m.x > W + 2) {
        this.mother = null
        this.motherTimer = 20 + this.rand() * 10
      }
    }
    this.collide()
    if (this.alive === 0 && this.nextWave === 0 && !this.over) {
      this.nextWave = 1.8
      this.bombs.length = 0
      this.mother = null
    }
  }

  /** Un pas de la formation : deux pixels de côté, ou un cran vers le bas au bord. */
  private march() {
    this.marchTimer = this.marchInterval
    this.frame ^= 1
    if (this.dropNext) {
      this.fy += 8
      this.dir = -this.dir as 1 | -1
      this.dropNext = false
    } else this.fx += 2 * this.dir
    let minCol = COLS, maxCol = -1, maxRow = -1
    for (const a of this.aliens) {
      if (!a.alive) continue
      minCol = Math.min(minCol, a.col)
      maxCol = Math.max(maxCol, a.col)
      maxRow = Math.max(maxRow, a.row)
    }
    const left = this.fx + minCol * GAP_X, right = this.fx + maxCol * GAP_X + 12
    if ((this.dir > 0 && right + 2 > W - 4) || (this.dir < 0 && left - 2 < 4)) this.dropNext = true
    // Les quatre notes de la marche, de plus en plus serrées (pas plus d'une toutes les 70 ms).
    if (this.time - this.lastNote >= 0.07) {
      this.lastNote = this.time
      this.sounds.push((['march-1', 'march-2', 'march-3', 'march-4'] as const)[this.note])
      this.note = (this.note + 1) % 4
    }
    // Les Thargoïdes écrasent ce qu'il reste des stations sur leur passage ; au sol, c'est l'invasion.
    for (const a of this.aliens) {
      if (!a.alive) continue
      const ax = this.alienX(a), ay = this.alienY(a)
      if (ay + 8 >= STATION_Y) for (const s of this.stations) this.carve(s, ax, ay, 12, 8)
    }
    if (this.fy + maxRow * GAP_Y + 8 >= PLAYER_Y) {
      this.invaded = true
      this.kill()
    }
  }

  /** Un Thargoïde du bas d'une colonne tire : souvent celle au-dessus du joueur. */
  private bomb() {
    this.fireTimer = Math.max(0.3, 1.1 - this.level * 0.08) * (0.5 + this.rand())
    if (this.bombs.length >= Math.min(2 + Math.ceil(this.level / 2), 5)) return
    const bottom = new Map<number, Alien>()
    for (const a of this.aliens) if (a.alive && (!bottom.has(a.col) || bottom.get(a.col)!.row < a.row)) bottom.set(a.col, a)
    const shooters = [...bottom.values()]
    if (!shooters.length) return
    let shooter = shooters[Math.floor(this.rand() * shooters.length)]
    if (this.rand() < 0.4) {
      for (const a of shooters) if (Math.abs(this.alienX(a) + 6 - this.player.x) < Math.abs(this.alienX(shooter) + 6 - this.player.x)) shooter = a
    }
    this.bombs.push({ x: this.alienX(shooter) + 6, y: this.alienY(shooter) + 8, kind: this.rand() < 0.35 ? 'bolt' : 'caustic' })
  }

  /** Efface les pixels d'une station dans un rectangle (coordonnées de l'écran). */
  private carve(s: Station, x: number, y: number, w: number, h: number): boolean {
    let hit = false
    const x0 = Math.max(0, Math.floor(x - s.x)), x1 = Math.min(STATION_W, Math.ceil(x + w - s.x))
    const y0 = Math.max(0, Math.floor(y - STATION_Y)), y1 = Math.min(STATION_H, Math.ceil(y + h - STATION_Y))
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        if (s.mask[py * STATION_W + px]) hit = true
        s.mask[py * STATION_W + px] = 0
      }
    }
    return hit
  }

  /** Le pixel de station touché par un tir en (x, y..y+len), s'il y en a un. */
  private stationHit(x: number, y: number, len: number): { s: Station; px: number; py: number } | null {
    const px = Math.round(x)
    for (const s of this.stations) {
      const lx = px - s.x
      if (lx < 0 || lx >= STATION_W) continue
      for (let k = 0; k <= len; k++) {
        const ly = Math.floor(y + k - STATION_Y)
        if (ly >= 0 && ly < STATION_H && s.mask[ly * STATION_W + lx]) return { s, px: lx, py: ly }
      }
    }
    return null
  }

  /** Un impact ronge la station autour du point touché (un peu au hasard, comme de la roche). */
  private erode(s: Station, cx: number, cy: number, down: boolean) {
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = cx + dx, y = cy + dy * (down ? 1 : -1)
        if (x < 0 || y < 0 || x >= STATION_W || y >= STATION_H) continue
        const d = Math.abs(dx) + Math.abs(dy) * 0.7
        if (d < 1.5 || this.rand() > d / 3.2) s.mask[y * STATION_W + x] = 0
      }
    }
  }

  private collide() {
    // Tir du joueur : l'Interceptor géant, la formation, les bombes, les stations.
    const s = this.shot
    if (s) {
      const m = this.mother
      if (m && s.x >= m.x && s.x < m.x + MOTHER.w && s.y < MOTHER_Y + MOTHER.h && s.y + 4 > MOTHER_Y) {
        const points = MOTHER_POINTS[(this.shotsFired - 1) % MOTHER_POINTS.length]
        this.addScore(points)
        this.blasts.push({ x: m.x, y: MOTHER_Y, t: 0, life: 1.2, color: '#ff4fd8', text: String(points) })
        this.burst(m.x + MOTHER.w / 2, MOTHER_Y + 3, 18, '#ff4fd8')
        this.sounds.push('bang')
        this.mother = null
        this.motherTimer = 20 + this.rand() * 10
        this.shot = null
        return this.collideBombs()
      }
      for (const a of this.aliens) {
        if (!a.alive) continue
        const ax = this.alienX(a), ay = this.alienY(a)
        if (s.x >= ax && s.x < ax + 12 && s.y < ay + 8 && s.y + 4 > ay) {
          a.alive = false
          this.addScore(KINDS[a.kind].points)
          this.blasts.push({ x: ax, y: ay, t: 0, life: 0.25, color: KINDS[a.kind].color })
          this.sounds.push('zap')
          this.shot = null
          break
        }
      }
    }
    if (this.shot) {
      const hit = this.stationHit(this.shot.x, this.shot.y, 4)
      if (hit) {
        this.erode(hit.s, hit.px, hit.py, false)
        this.shot = null
      }
    }
    this.collideBombs()
  }

  private collideBombs() {
    const p = this.player
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i]
      // Tir contre bombe : les deux s'annulent (un éclair résiste une fois sur deux).
      if (this.shot && Math.abs(this.shot.x - b.x) < 3 && this.shot.y < b.y + 7 && this.shot.y + 4 > b.y) {
        this.blasts.push({ x: b.x - 6, y: b.y, t: 0, life: 0.15, color: '#ffffff' })
        this.shot = null
        if (b.kind === 'caustic' || this.rand() < 0.5) {
          this.bombs.splice(i, 1)
          continue
        }
      }
      const hit = this.stationHit(b.x, b.y, 7)
      if (hit) {
        this.erode(hit.s, hit.px, hit.py, true)
        this.bombs.splice(i, 1)
        continue
      }
      if (p.alive && Math.abs(b.x - p.x) < 6.5 && b.y + 7 >= PLAYER_Y + 1 && b.y < PLAYER_Y + 7) {
        // Le vaisseau explose : kill() vide aussi les bombes restantes.
        this.kill()
        break
      }
      if (b.y + 7 >= GROUND) {
        this.blasts.push({ x: b.x - 6, y: GROUND - 8, t: 0, life: 0.2, color: '#6dff7a' })
        this.bombs.splice(i, 1)
      }
    }
  }

  private burst(x: number, y: number, n: number, color: string) {
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2, v = 20 + this.rand() * 70
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, t: this.rand() * 0.3, color })
    }
  }

  private kill() {
    const p = this.player
    if (!p.alive && !this.invaded) return
    if (p.alive) this.burst(p.x, PLAYER_Y + 3, 26, '#39e0ff')
    p.alive = false
    this.shot = null
    this.bombs.length = 0
    this.sounds.push('bang')
    this.lives = this.invaded ? 0 : this.lives - 1
    this.respawn = 1.6
    if (this.lives <= 0) {
      this.over = true
      this.overTime = 0
      this.sounds.push('over')
    }
  }

  // ---------------------------------------------------------------- affichage

  draw(g: CanvasRenderingContext2D, t: number) {
    g.fillStyle = '#03020a'
    g.fillRect(0, 0, W, H)
    // Étoiles qui scintillent, et une lueur violette au loin (l'espace thargoïde).
    for (let i = 0; i < 70; i++) {
      const x = (i * 137) % W, y = 22 + ((i * 89) % (GROUND - 30))
      g.fillStyle = (i + Math.floor(t * 2)) % 9 ? '#1a1830' : '#5a5680'
      g.fillRect(x, y, 1, 1)
    }
    // Stations Coriolis.
    for (const s of this.stations) {
      for (let y = 0; y < STATION_H; y++) {
        for (let x = 0; x < STATION_W; x++) {
          if (!s.mask[y * STATION_W + x]) continue
          g.fillStyle = y < 2 ? '#c8d4ea' : (x + y) % 7 ? '#8fa6c8' : '#6b7fa0'
          g.fillRect(s.x + x, STATION_Y + y, 1, 1)
        }
      }
      // Lumières de la fente d'amarrage (si elle tient encore).
      if (s.mask[5 * STATION_W + 7] || s.mask[8 * STATION_W + 14]) {
        g.fillStyle = Math.floor(t * 3) % 2 ? '#6dff7a' : '#ff5a4f'
        g.fillRect(s.x + 8, STATION_Y + 6, 1, 2)
        g.fillRect(s.x + 13, STATION_Y + 6, 1, 2)
      }
    }
    // La formation.
    for (const a of this.aliens) {
      if (!a.alive) continue
      const k = KINDS[a.kind]
      blit(g, k.frames[this.frame], this.alienX(a), this.alienY(a), k.color, Math.floor(t * 4 + a.col) % 3 ? k.accent : k.color)
    }
    if (this.mother) blit(g, MOTHER, this.mother.x, MOTHER_Y, '#ff4fd8', Math.floor(t * 8) % 2 ? '#ffffff' : '#ff9af0')
    // Bombes : caustiques en zigzag vert, éclairs blancs et magenta.
    for (const b of this.bombs) {
      const x = Math.round(b.x), y = Math.round(b.y)
      if (b.kind === 'caustic') {
        g.fillStyle = '#6dff7a'
        const w = Math.floor(b.y / 3) % 2 ? 1 : -1
        for (let k = 0; k < 7; k++) g.fillRect(x + (k % 3 === 1 ? w : 0), y + k, 1, 1)
      } else {
        g.fillStyle = Math.floor(t * 20) % 2 ? '#ffffff' : '#ff4fd8'
        g.fillRect(x, y, 1, 7)
        g.fillRect(x - 1, y + 2, 1, 1)
        g.fillRect(x + 1, y + 4, 1, 1)
      }
    }
    if (this.shot) {
      g.fillStyle = '#ffffff'
      g.fillRect(this.shot.x, Math.round(this.shot.y), 1, 4)
    }
    if (this.player.alive) blit(g, SHIP, this.player.x - 6, PLAYER_Y, '#39e0ff', '#ff8a1c')
    for (const b of this.blasts) {
      g.globalAlpha = 1 - b.t / b.life
      if (b.text) {
        g.fillStyle = b.color
        pixelText(g, b.text, b.x + MOTHER.w / 2, b.y, 1, 'center')
      } else blit(g, BURST, b.x, b.y, b.color)
    }
    for (const s of this.sparks) {
      g.globalAlpha = 1 - s.t / 0.9
      g.fillStyle = s.t < 0.3 ? '#ffffff' : s.color
      g.fillRect(s.x, s.y, 2, 2)
    }
    g.globalAlpha = 1
    // Sol, vies.
    g.fillStyle = '#4a1f6a'
    g.fillRect(0, GROUND, W, 1)
    g.fillStyle = '#39e0ff'
    pixelText(g, String(this.lives), 8, GROUND + 5)
    for (let i = 0; i < Math.min(this.lives - 1, 6); i++) blit(g, SHIP, 20 + i * 17, GROUND + 5, '#39e0ff', '#ff8a1c')
    // Bandeau : crédits, record, vague.
    g.fillStyle = '#8a92a6'
    pixelText(g, tr('CRÉDITS', 'CREDITS'), 10, 4)
    pixelText(g, tr('RECORD', 'BEST'), 130, 4)
    pixelText(g, tr('VAGUE', 'WAVE'), 262, 4)
    g.fillStyle = '#ffffff'
    pixelText(g, padScore(this.score), 10, 14)
    g.fillStyle = '#ffe14f'
    pixelText(g, padScore(Math.max(this.best, this.score)), 130, 14)
    g.fillStyle = '#ffffff'
    pixelText(g, String(this.level), 262, 14)
    if (this.nextWave > 0 && this.nextWave < 1.4) {
      g.fillStyle = '#ff4fd8'
      pixelText(g, tr(`VAGUE ${this.level + 1}`, `WAVE ${this.level + 1}`), W / 2, 100, 2, 'center')
    }
    if (this.over && this.overTime > 0.6) {
      g.fillStyle = 'rgba(3, 2, 10, 0.75)'
      g.fillRect(60, 96, 200, 44)
      g.fillStyle = '#ff5a4f'
      pixelText(g, this.invaded ? tr('INVASION !', 'INVASION!') : tr('COQUE : 0 %', 'HULL: 0%'), W / 2, 104, 2, 'center')
      g.fillStyle = '#8a92a6'
      pixelText(g, tr(`TENU ${this.level} VAGUE${this.level > 1 ? 'S' : ''}`, `HELD ${this.level} WAVE${this.level > 1 ? 'S' : ''}`), W / 2, 126, 1, 'center')
    }
  }

  /** En petit, pour l'écran des bornes du vaisseau : un bloc de couleur par Thargoïde. */
  drawSmall(c: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const sx = w / W, sy = h / H
    c.fillStyle = '#03020a'
    c.fillRect(0, 0, w, h)
    for (const s of this.stations) {
      let left = 0
      for (const v of s.mask) left += v
      c.globalAlpha = 0.3 + (0.7 * left) / 260
      c.fillStyle = '#8fa6c8'
      c.fillRect(Math.round(s.x * sx), Math.round(STATION_Y * sy), Math.round(STATION_W * sx), Math.round(STATION_H * sy) - 1)
    }
    c.globalAlpha = 1
    for (const a of this.aliens) {
      if (!a.alive) continue
      c.fillStyle = KINDS[a.kind].color
      const x = Math.round((this.alienX(a) + 3) * sx), y = Math.round(this.alienY(a) * sy)
      c.fillRect(x, y, 3, 2)
      // Les pattes, qui suivent la marche.
      const legs = this.frame ? [-1, 3] : [0, 2]
      for (const l of legs) c.fillRect(x + l, y + 2, 1, 1)
    }
    if (this.mother) {
      c.fillStyle = Math.floor(t * 8) % 2 ? '#ffffff' : '#ff4fd8'
      c.fillRect(Math.round(this.mother.x * sx), Math.round(MOTHER_Y * sy), 5, 2)
    }
    c.fillStyle = '#6dff7a'
    for (const b of this.bombs) c.fillRect(Math.round(b.x * sx), Math.round(b.y * sy), 1, 2)
    c.fillStyle = '#ffffff'
    if (this.shot) c.fillRect(Math.round(this.shot.x * sx), Math.round(this.shot.y * sy), 1, 2)
    if (this.player.alive) {
      c.fillStyle = '#39e0ff'
      const x = Math.round(this.player.x * sx), y = Math.round(PLAYER_Y * sy)
      c.fillRect(x - 2, y + 1, 5, 2)
      c.fillRect(x, y, 1, 1)
    }
    c.fillStyle = '#4a1f6a'
    c.fillRect(0, Math.round(GROUND * sy), w, 1)
    c.fillStyle = '#ffffff'
    pixelText(c, padScore(this.score, 5), w - 1, 2, 1, 'right')
  }
}

// ---------------------------------------------------------------- pilote automatique

/**
 * Joueur de démonstration : il s'écarte des bombes qui tombent sur lui, vise l'Interceptor géant
 * quand il passe, sinon le Thargoïde le plus bas et le plus proche ; il vise un peu à côté, de
 * temps en temps.
 */
export class InvadersPilot {
  private readonly pad = emptyPad()
  private aim = 0
  private retarget = 0

  constructor(private readonly game: Invaders, private readonly rand = Math.random) {}

  next(dt: number): Pad {
    const g = this.game, pad = this.pad
    pad.pressed.clear()
    pad.held.clear()
    if (g.over || !g.player.alive) return pad
    const px = g.player.x
    let threat: Bomb | null = null
    for (const b of g.bombs) if (b.y > 120 && b.y < PLAYER_Y + 7 && Math.abs(b.x - px) < 11 && (!threat || b.y > threat.y)) threat = b
    let target = px
    if (threat) {
      const away = threat.x < px ? 1 : -1
      target = px + away * 20
      if (target < 12 || target > W - 12) target = px - away * 20
    } else {
      if ((this.retarget -= dt) <= 0) {
        this.aim = (this.rand() - 0.5) * 14
        this.retarget = 0.5 + this.rand()
      }
      const lead = (PLAYER_Y - MOTHER_Y) / SHOT_SPEED
      const m = g.mother
      if (m && m.x > 0 && m.x < W - 16) target = m.x + 8 + m.dir * MOTHER_SPEED * lead
      else {
        let best = Infinity
        for (const a of g.aliens) {
          if (!a.alive) continue
          const ax = g.alienX(a) + 6, cost = Math.abs(ax - px) - g.alienY(a) * 0.6
          if (cost < best) {
            best = cost
            target = ax
          }
        }
        target += this.aim
      }
    }
    if (target > px + 1.5) pad.held.add('right')
    else if (target < px - 1.5) pad.held.add('left')
    if (!threat && !g.shot && Math.abs(target - px) < 4 && this.rand() < 0.35) pad.pressed.add('a')
    return pad
  }
}
