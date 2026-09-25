import { tr } from '../i18n'
import { emptyPad, padScore, pixelText, random, type ArcadeGame, type Pad, type Sfx } from './game'

/*
 * ASTÉROÏDES : un champ de roches à pulvériser en vecteurs lumineux, comme en 1979. Les grosses
 * roches se brisent en moyennes, puis en petites ; un Thargoïde traverse parfois l'écran en
 * tirant (le petit vise juste). Le saut FSD d'urgence envoie le vaisseau n'importe où (et rate
 * une fois sur douze). Une vie de plus tous les 10 000 points ; le battement de cœur s'accélère
 * à mesure que le champ se vide.
 */

const W = 640, H = 480
const TAU = Math.PI * 2
const ROCK = { 3: { r: 38, speed: [28, 60], points: 20 }, 2: { r: 20, speed: [50, 95], points: 50 }, 1: { r: 10, speed: [70, 125], points: 100 } } as const
const SHIP_R = 10
const EXTRA_LIFE = 10000

interface Rock {
  x: number
  y: number
  vx: number
  vy: number
  size: 1 | 2 | 3
  a: number
  spin: number
  /** Rayon de chaque sommet, en proportion du rayon de la roche. */
  shape: number[]
}

interface Shot {
  x: number
  y: number
  vx: number
  vy: number
  t: number
  /** Tir d'un Thargoïde. */
  alien?: boolean
}

const wrap = (v: number, max: number) => ((v % max) + max) % max
/** Écart le plus court entre deux positions d'un monde qui boucle. */
const delta = (a: number, b: number, max: number) => {
  const d = wrap(b - a, max)
  return d > max / 2 ? d - max : d
}

export class Asteroids implements ArcadeGame {
  readonly id = 'asteroids'
  readonly width = W
  readonly height = H
  readonly smooth = true
  readonly sounds: Sfx[] = []
  score = 0
  /** Vague en cours. */
  level = 0
  lives = 3
  over = false
  ship = { x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, alive: true, thrust: false, inv: 2 }
  rocks: Rock[] = []
  shots: Shot[] = []
  saucer: { x: number; y: number; vx: number; vy: number; small: boolean; fire: number; turn: number; siren: number } | null = null
  private debris: { x: number; y: number; vx: number; vy: number; a: number; spin: number; len: number; t: number; life: number; color: string }[] = []
  private cooldown = 0
  private warpCooldown = 0
  private respawn = 0
  private nextWave = 0
  private nextSaucer = 18
  private beat = 0
  private beatHigh = false
  private waveSize = 1
  private extra = EXTRA_LIFE
  private overTime = 0
  private thrustSound = 0
  private rand: () => number
  best = 0

  constructor(seed = Math.floor(Math.random() * 2 ** 31)) {
    this.rand = random(seed)
    this.startWave()
  }

  private startWave() {
    this.level++
    const n = Math.min(11, 3 + this.level)
    this.waveSize = n * 7
    for (let i = 0; i < n; i++) {
      // Sur les bords, loin du vaisseau.
      let x = 0, y = 0
      do {
        x = this.rand() * W
        y = this.rand() * H
      } while (Math.hypot(delta(x, this.ship.x, W), delta(y, this.ship.y, H)) < 170)
      this.rocks.push(this.rock(x, y, 3))
    }
  }

  private rock(x: number, y: number, size: 1 | 2 | 3): Rock {
    const def = ROCK[size], a = this.rand() * TAU, v = def.speed[0] + this.rand() * (def.speed[1] - def.speed[0]) + this.level * 3
    return {
      x, y, size, vx: Math.cos(a) * v, vy: Math.sin(a) * v, a: this.rand() * TAU, spin: (this.rand() - 0.5) * 1.6,
      shape: Array.from({ length: 11 }, () => 0.72 + this.rand() * 0.34),
    }
  }

  /** Débris en traits : une roche, un vaisseau, un Thargoïde qui explose. */
  private burst(x: number, y: number, n: number, speed: number, color: string, len = 0) {
    for (let i = 0; i < n; i++) {
      const a = this.rand() * TAU, v = speed * (0.3 + this.rand())
      this.debris.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, a: this.rand() * TAU, spin: (this.rand() - 0.5) * 6, len: len || 1.5, t: 0, life: 0.5 + this.rand() * 0.8, color })
    }
  }

  private addScore(points: number) {
    this.score += points
    if (this.score >= this.extra) {
      this.extra += EXTRA_LIFE
      this.lives++
      this.sounds.push('life')
    }
  }

  private split(i: number) {
    const r = this.rocks[i]
    this.rocks.splice(i, 1)
    this.addScore(ROCK[r.size].points)
    this.sounds.push(r.size === 1 ? 'bang-small' : 'bang')
    this.burst(r.x, r.y, 6 + r.size * 3, 60 + r.size * 20, '#d8dde4')
    if (r.size > 1) for (let k = 0; k < 2; k++) this.rocks.push(this.rock(r.x, r.y, (r.size - 1) as 1 | 2))
  }

  private kill() {
    const s = this.ship
    s.alive = false
    s.thrust = false
    this.sounds.push('bang')
    this.burst(s.x, s.y, 6, 70, '#ffffff', 9)
    this.burst(s.x, s.y, 10, 90, '#ff8a1c')
    this.lives--
    this.respawn = 2
    if (this.lives <= 0) {
      this.over = true
      this.overTime = 0
      this.sounds.push('over')
    }
  }

  step(dt: number, pad: Pad) {
    const s = this.ship
    for (const d of this.debris) {
      d.t += dt
      d.x += d.vx * dt
      d.y += d.vy * dt
      d.a += d.spin * dt
    }
    this.debris = this.debris.filter((d) => d.t < d.life)
    for (const r of this.rocks) {
      r.x = wrap(r.x + r.vx * dt, W)
      r.y = wrap(r.y + r.vy * dt, H)
      r.a += r.spin * dt
    }
    if (this.over) {
      this.overTime += dt
      return
    }

    // Le vaisseau : rotation, poussée (avec inertie), tir, saut d'urgence.
    this.cooldown -= dt
    this.warpCooldown -= dt
    s.inv = Math.max(0, s.inv - dt)
    if (s.alive) {
      if (pad.held.has('left')) s.a -= 4.3 * dt
      if (pad.held.has('right')) s.a += 4.3 * dt
      s.thrust = pad.held.has('up')
      if (s.thrust) {
        s.vx += Math.cos(s.a) * 300 * dt
        s.vy += Math.sin(s.a) * 300 * dt
        const v = Math.hypot(s.vx, s.vy)
        if (v > 360) {
          s.vx *= 360 / v
          s.vy *= 360 / v
        }
        this.thrustSound -= dt
        if (this.thrustSound <= 0) {
          this.thrustSound = 0.12
          this.sounds.push('thrust')
        }
      }
      const drag = Math.exp(-0.45 * dt)
      s.vx *= drag
      s.vy *= drag
      s.x = wrap(s.x + s.vx * dt, W)
      s.y = wrap(s.y + s.vy * dt, H)
      if (pad.pressed.has('a') && this.cooldown <= 0 && this.shots.filter((b) => !b.alien).length < 4) {
        this.cooldown = 0.15
        this.shots.push({ x: s.x + Math.cos(s.a) * 12, y: s.y + Math.sin(s.a) * 12, vx: s.vx + Math.cos(s.a) * 540, vy: s.vy + Math.sin(s.a) * 540, t: 0 })
        this.sounds.push('shoot')
      }
      if ((pad.pressed.has('down') || pad.pressed.has('c')) && this.warpCooldown <= 0) {
        this.warpCooldown = 1
        this.sounds.push('warp')
        s.x = this.rand() * W
        s.y = this.rand() * H
        s.vx = s.vy = 0
        if (this.rand() < 1 / 12) return this.kill()
      }
    } else if (!this.over) {
      // On réapparaît au centre, quand la voie est libre.
      this.respawn -= dt
      if (this.respawn <= 0 && this.rocks.every((r) => Math.hypot(delta(r.x, W / 2, W), delta(r.y, H / 2, H)) > 90 + ROCK[r.size].r)) {
        Object.assign(s, { x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, alive: true, inv: 2 })
      }
    }

    // Tirs.
    for (const b of this.shots) {
      b.t += dt
      b.x = wrap(b.x + b.vx * dt, W)
      b.y = wrap(b.y + b.vy * dt, H)
    }
    this.shots = this.shots.filter((b) => b.t < (b.alien ? 1.1 : 0.85))
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const b = this.shots[i]
      const hit = this.rocks.findIndex((r) => Math.hypot(delta(r.x, b.x, W), delta(r.y, b.y, H)) < ROCK[r.size].r)
      if (hit >= 0) {
        this.shots.splice(i, 1)
        // Les tirs thargoïdes brisent les roches, mais ne rapportent rien.
        if (b.alien) {
          const r = this.rocks[hit]
          this.rocks.splice(hit, 1)
          if (r.size > 1) for (let k = 0; k < 2; k++) this.rocks.push(this.rock(r.x, r.y, (r.size - 1) as 1 | 2))
          this.burst(r.x, r.y, 6, 70, '#d8dde4')
        } else this.split(hit)
        continue
      }
      const u = this.saucer
      if (u && !b.alien && Math.hypot(delta(u.x, b.x, W), delta(u.y, b.y, H)) < (u.small ? 11 : 18)) {
        this.shots.splice(i, 1)
        this.addScore(u.small ? 1000 : 200)
        this.sounds.push('bang')
        this.burst(u.x, u.y, 14, 110, '#6dff7a')
        this.saucer = null
        continue
      }
      if (b.alien && s.alive && !s.inv && Math.hypot(delta(s.x, b.x, W), delta(s.y, b.y, H)) < SHIP_R) {
        this.shots.splice(i, 1)
        this.kill()
      }
    }
    // Collisions du vaisseau (roches, Thargoïde).
    if (s.alive && !s.inv) {
      const hit = this.rocks.findIndex((r) => Math.hypot(delta(r.x, s.x, W), delta(r.y, s.y, H)) < ROCK[r.size].r + SHIP_R * 0.8)
      if (hit >= 0) {
        this.split(hit)
        this.kill()
      } else if (this.saucer && Math.hypot(delta(this.saucer.x, s.x, W), delta(this.saucer.y, s.y, H)) < (this.saucer.small ? 11 : 18) + SHIP_R) {
        this.burst(this.saucer.x, this.saucer.y, 14, 110, '#6dff7a')
        this.saucer = null
        this.kill()
      }
    }

    this.updateSaucer(dt)

    // Vague suivante, deux secondes après la dernière roche.
    if (!this.rocks.length) {
      this.nextWave += dt
      if (this.nextWave > 2) {
        this.nextWave = 0
        this.startWave()
      }
    }
    // Battement de cœur : de plus en plus rapide à mesure que le champ se vide.
    const left = this.rocks.reduce((n, r) => n + r.size * 2 - 1 + (r.size === 3 ? 2 : 0), 0)
    const interval = 0.28 + 0.72 * Math.min(1, left / this.waveSize)
    this.beat -= dt
    if (this.beat <= 0 && this.rocks.length) {
      this.beat = interval
      this.beatHigh = !this.beatHigh
      this.sounds.push(this.beatHigh ? 'beat-hi' : 'beat-lo')
    }
  }

  private updateSaucer(dt: number) {
    const s = this.ship
    if (!this.saucer) {
      this.nextSaucer -= dt
      if (this.nextSaucer > 0 || !s.alive) return
      this.nextSaucer = 16 + this.rand() * 12
      const small = this.score > 10000 ? this.rand() < 0.6 : this.level >= 3 && this.rand() < 0.25
      const fromLeft = this.rand() < 0.5
      const speed = small ? 140 : 90
      this.saucer = { x: fromLeft ? 0 : W, y: 60 + this.rand() * (H - 120), vx: fromLeft ? speed : -speed, vy: 0, small, fire: 1, turn: 1, siren: 0 }
      return
    }
    const u = this.saucer
    u.turn -= dt
    if (u.turn <= 0) {
      u.turn = 0.8 + this.rand() * 1.2
      u.vy = [-60, 0, 60][Math.floor(this.rand() * 3)]
    }
    u.x += u.vx * dt
    u.y = wrap(u.y + u.vy * dt, H)
    u.siren -= dt
    if (u.siren <= 0) {
      u.siren = u.small ? 0.22 : 0.32
      this.sounds.push('saucer')
    }
    // Il quitte l'écran par le bord opposé.
    if (u.x < -30 || u.x > W + 30) {
      this.saucer = null
      return
    }
    u.fire -= dt
    if (u.fire <= 0 && s.alive) {
      u.fire = u.small ? 0.9 : 1.3
      // Le grand tire au hasard ; le petit vise le vaisseau, de mieux en mieux.
      const aim = Math.atan2(delta(u.y, s.y, H), delta(u.x, s.x, W))
      const a = u.small ? aim + (this.rand() - 0.5) * Math.max(0.1, 0.6 - this.level * 0.05) : this.rand() * TAU
      this.shots.push({ x: u.x, y: u.y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, t: 0, alien: true })
    }
  }

  // ---------------------------------------------------------------- affichage

  draw(g: CanvasRenderingContext2D, t: number) {
    g.fillStyle = '#020306'
    g.fillRect(0, 0, W, H)
    g.lineJoin = 'round'
    g.lineCap = 'round'
    g.lineWidth = 1.6
    const glow = (color: string, blur = 8) => {
      g.strokeStyle = g.fillStyle = g.shadowColor = color
      g.shadowBlur = blur
    }
    glow('#e8edf2')
    for (const r of this.rocks) this.pathRock(g, r, 1)
    const s = this.ship
    if (s.alive && (!s.inv || Math.floor(t * 10) % 2)) {
      glow('#ffffff')
      shipPath(g, s.x, s.y, s.a, 1)
      g.stroke()
      if (s.thrust && Math.floor(t * 30) % 2) {
        glow('#ff8a1c')
        g.beginPath()
        const c = Math.cos(s.a), sn = Math.sin(s.a)
        g.moveTo(s.x - c * 7 - sn * 4, s.y - sn * 7 + c * 4)
        g.lineTo(s.x - c * (15 + Math.random() * 5), s.y - sn * (15 + Math.random() * 5))
        g.lineTo(s.x - c * 7 + sn * 4, s.y - sn * 7 - c * 4)
        g.stroke()
      }
    }
    if (this.saucer) {
      glow('#6dff7a', 10)
      thargoid(g, this.saucer.x, this.saucer.y, this.saucer.small ? 11 : 18, t)
    }
    for (const b of this.shots) {
      glow(b.alien ? '#6dff7a' : '#ffffff', 6)
      g.fillRect(b.x - 1.5, b.y - 1.5, 3, 3)
    }
    for (const d of this.debris) {
      g.globalAlpha = 1 - d.t / d.life
      glow(d.color, 4)
      g.beginPath()
      g.moveTo(d.x - Math.cos(d.a) * d.len, d.y - Math.sin(d.a) * d.len)
      g.lineTo(d.x + Math.cos(d.a) * d.len, d.y + Math.sin(d.a) * d.len)
      g.stroke()
    }
    g.globalAlpha = 1
    g.shadowBlur = 0
    // Score, record, vies (des petits vaisseaux), vague.
    g.fillStyle = '#ffffff'
    pixelText(g, padScore(this.score), 24, 18, 3)
    g.fillStyle = '#ffe14f'
    pixelText(g, padScore(Math.max(this.best, this.score)), W / 2, 18, 2, 'center')
    g.fillStyle = '#8a92a6'
    pixelText(g, tr(`VAGUE ${this.level}`, `WAVE ${this.level}`), W - 24, 18, 2, 'right')
    g.strokeStyle = '#ffffff'
    for (let i = 0; i < Math.min(this.lives, 8); i++) {
      shipPath(g, 32 + i * 18, 58, -Math.PI / 2, 0.8)
      g.stroke()
    }
    if (this.over && this.overTime > 0.8) {
      g.fillStyle = '#ffffff'
      pixelText(g, 'GAME OVER', W / 2, H / 2 - 14, 4, 'center')
    }
  }

  private pathRock(g: CanvasRenderingContext2D, r: Rock, scale: number) {
    const R = ROCK[r.size].r * scale
    g.beginPath()
    r.shape.forEach((k, i) => {
      const a = r.a + (i / r.shape.length) * TAU
      const x = r.x * scale + Math.cos(a) * R * k, y = r.y * scale + Math.sin(a) * R * k
      if (i) g.lineTo(x, y)
      else g.moveTo(x, y)
    })
    g.closePath()
    g.stroke()
  }

  /** Version réduite, sans halo, pour les petits écrans des bornes du vaisseau. */
  drawSmall(g: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const k = Math.min(w / W, h / H)
    g.fillStyle = '#000'
    g.fillRect(0, 0, w, h)
    g.lineWidth = 1
    g.strokeStyle = '#f2f2f2'
    for (const r of this.rocks) this.pathRock(g, r, k)
    const s = this.ship
    if (s.alive && (!s.inv || Math.floor(t * 8) % 2)) {
      shipPath(g, s.x * k, s.y * k, s.a, k * 1.6)
      g.stroke()
    }
    if (this.saucer) {
      g.strokeStyle = '#6dff7a'
      thargoid(g, this.saucer.x * k, this.saucer.y * k, (this.saucer.small ? 11 : 18) * k * 1.4, t)
    }
    g.fillStyle = '#fff'
    for (const b of this.shots) g.fillRect(b.x * k, b.y * k, 1, 1)
    g.fillStyle = '#ffffff'
    pixelText(g, padScore(this.score, 5), 2, 2)
  }
}

/** Le vaisseau : une flèche échancrée, pointe vers `a`. */
function shipPath(g: CanvasRenderingContext2D, x: number, y: number, a: number, k: number) {
  const c = Math.cos(a), s = Math.sin(a)
  const p = (f: number, side: number) => [x + (c * f - s * side) * k, y + (s * f + c * side) * k] as const
  g.beginPath()
  g.moveTo(...p(13, 0))
  g.lineTo(...p(-9, -8))
  g.lineTo(...p(-5, 0))
  g.lineTo(...p(-9, 8))
  g.closePath()
}

/** Un Thargoïde : un octogone, une corolle de pétales, un cœur qui palpite. */
function thargoid(g: CanvasRenderingContext2D, x: number, y: number, r: number, t: number) {
  g.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.55)
  }
  g.closePath()
  g.stroke()
  g.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + t * 1.5
    g.moveTo(x + Math.cos(a) * r * 0.35, y + Math.sin(a) * r * 0.2)
    g.lineTo(x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.47)
  }
  g.stroke()
  const k = 0.18 + 0.06 * Math.sin(t * 8)
  g.beginPath()
  g.ellipse(x, y, r * k, r * k * 0.6, 0, 0, TAU)
  g.stroke()
}

// ---------------------------------------------------------------- pilote automatique

/** Joueur de démonstration : il vise la roche la plus proche, tire, et saute quand ça sent le roussi. */
export class AsteroidsPilot {
  private readonly pad = emptyPad()
  private jitter = 0

  constructor(private readonly game: Asteroids, private readonly rand = Math.random) {}

  next(dt: number): Pad {
    const g = this.game, s = g.ship, pad = this.pad
    pad.pressed.clear()
    pad.held.clear()
    if (g.over || !s.alive) return pad
    let target: { x: number; y: number; d: number; vx: number; vy: number } | null = null
    for (const r of g.rocks) {
      const d = Math.hypot(delta(s.x, r.x, W), delta(s.y, r.y, H))
      if (!target || d < target.d) target = { x: r.x, y: r.y, d, vx: r.vx, vy: r.vy }
    }
    if (g.saucer) {
      const d = Math.hypot(delta(s.x, g.saucer.x, W), delta(s.y, g.saucer.y, H))
      if (!target || d < target.d + 60) target = { x: g.saucer.x, y: g.saucer.y, d, vx: g.saucer.vx, vy: g.saucer.vy }
    }
    if (!target) return pad
    // Visée avec un peu d'avance (le temps que le tir arrive), et un peu de maladresse.
    this.jitter = this.jitter * Math.exp(-dt) + (this.rand() - 0.5) * dt * 0.8
    const lead = target.d / 540
    const aim = Math.atan2(delta(s.y, target.y + target.vy * lead, H), delta(s.x, target.x + target.vx * lead, W)) + this.jitter
    const diff = Math.atan2(Math.sin(aim - s.a), Math.cos(aim - s.a))
    if (diff > 0.06) pad.held.add('right')
    else if (diff < -0.06) pad.held.add('left')
    if (Math.abs(diff) < 0.2 && this.rand() < 0.5) pad.pressed.add('a')
    if (target.d > 220 && Math.abs(diff) < 0.4 && this.rand() < 0.3) pad.held.add('up')
    if (target.d < 42 && this.rand() < 0.08) pad.pressed.add('down')
    return pad
  }
}
