import { chooseFightStage } from './fight-stages.js'
import { fighterProfile } from './fight-roster.js'
// Simulation commune au navigateur et au relais ; le serveur décide des contacts et du résultat.
const emptyPad = () => ({
  held: new Set(),
  pressed: new Set(),
})
function random(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const FLOOR = 238
export const MOVES = {
  punch: {
    windup: 0.09,
    duration: 0.28,
    range: 45,
    damage: 8,
  },
  kick: {
    windup: 0.18,
    duration: 0.48,
    range: 65,
    damage: 14,
  },
  plasma: {
    windup: 0.22,
    duration: 0.6,
    range: 0,
    damage: 12,
  },
}
const fighter = (x, face, wins = 0, character = 'nova') => ({
  character: fighterProfile(character).id,
  walk: 0,
  moving: false,
  x,
  y: 0,
  vy: 0,
  face,
  hp: 100,
  energy: 40,
  wins,
  stun: 0,
  cooldown: 0,
  guard: false,
  crouch: false,
  attack: null,
})
export class FightSimulation {
  mode
  id = 'fight'
  width = 480
  height = 300
  sounds = []
  best = 0
  score = 0
  level = 1
  over = false
  fighters = [fighter(130, 1), fighter(350, -1)]
  phase = 'intro'
  phaseTime = 2.8
  remaining = 60
  winner = null
  roundWinner = null
  projectiles = []
  sparks = []
  accumulator = 0
  pending = [emptyPad(), emptyPad()]
  rng
  stage
  aiTime = [0, 0]
  aiPads = [emptyPad(), emptyPad()]
  constructor(mode = 'solo', seed = 3312, characters = ['nova', 'vesper']) {
    this.mode = mode
    this.rng = random(seed)
    this.stage = chooseFightStage(random(seed ^ 0x57a9e)())
    this.fighters = [fighter(130, 1, 0, characters[0]), fighter(350, -1, 0, characters[1])]
  }
  step(dt, pad) {
    if (this.over) return
    const inputs = [pad, pad.second ?? emptyPad()]
    inputs.forEach((input, i) => {
      this.pending[i].held = new Set(input.held)
      for (const b of input.pressed) this.pending[i].pressed.add(b)
    })
    this.accumulator += Math.max(0, Math.min(dt, 0.25))
    while (this.accumulator >= 1 / 120) {
      this.tick(1 / 120)
      this.pending.forEach((p) => p.pressed.clear())
      this.accumulator -= 1 / 120
    }
  }
  ai(i, dt) {
    this.aiTime[i] -= dt
    const p = this.aiPads[i]
    p.pressed.clear()
    if (this.aiTime[i] > 0) return p
    this.aiTime[i] = 0.15 + this.rng() * 0.18
    p.held.clear()
    const me = this.fighters[i],
      other = this.fighters[1 - i],
      distance = Math.abs(me.x - other.x)
    const profile = fighterProfile(me.character)
    const toward = other.x > me.x ? 'right' : 'left',
      away = toward === 'right' ? 'left' : 'right'
    if (
      (other.attack || this.projectiles.some((b) => b.owner !== i && Math.abs(b.x - me.x) < 120)) &&
      this.rng() < 0.65
    ) {
      p.held.add(away)
      if (this.rng() < 0.3) p.pressed.add('up')
    } else if (distance > MOVES.kick.range * profile.reach * 0.85) {
      p.held.add(toward)
      if (distance > 140 && me.energy >= profile.plasmaCost && this.rng() < 0.45) p.pressed.add('c')
    } else {
      p.pressed.add(distance < MOVES.punch.range * profile.reach && this.rng() < 0.55 ? 'a' : 'b')
      if (this.rng() < 0.2) p.pressed.add('up')
      if (this.rng() < 0.2) p.held.add('down')
    }
    return p
  }
  tick(dt) {
    for (const s of this.sparks) s.life -= dt
    this.sparks = this.sparks.filter((s) => s.life > 0)
    if (this.phase !== 'fight') {
      this.phaseTime -= dt
      if (this.phaseTime <= 0) {
        if (this.phase === 'intro') {
          this.phase = 'ready'; this.phaseTime = 1.8; this.sounds.push('bonus')
        } else if (this.phase === 'ready') {
          this.phase = 'fight'
          this.sounds.push('level')
        } else if (this.phase === 'round') {
          if (this.fighters.some((f) => f.wins >= 2)) {
            this.winner = this.fighters[0].wins >= 2 ? 0 : 1
            this.phase = 'over'
            this.over = true
            this.sounds.push('over')
          } else {
            this.level++
            this.fighters = [fighter(130, 1, this.fighters[0].wins, this.fighters[0].character), fighter(350, -1, this.fighters[1].wins, this.fighters[1].character)]
            this.remaining = 60
            this.phase = 'ready'
            this.phaseTime = 1.8
          }
        }
      }
      return
    }
    this.remaining = Math.max(0, this.remaining - dt)
    const pads = this.fighters.map((_, i) =>
      this.mode === 'demo' || (i === 1 && this.mode === 'solo') ? this.ai(i, dt) : this.pending[i],
    )
    this.fighters.forEach((f, i) => {
      const other = this.fighters[1 - i],
        p = pads[i]
      const profile = fighterProfile(f.character)
      f.face = other.x >= f.x ? 1 : -1
      f.stun = Math.max(0, f.stun - dt)
      f.cooldown = Math.max(0, f.cooldown - dt)
      f.energy = Math.min(100, f.energy + dt * profile.regen)
      f.y += f.vy * dt
      f.vy -= 850 * dt
      if (f.y <= 0) {
        f.y = 0
        f.vy = 0
      }
      const movement = Number(p.held.has('right')) - Number(p.held.has('left'))
      f.crouch = f.y === 0 && p.held.has('down')
      f.guard = !f.attack && f.stun === 0 && f.y === 0 && movement === -f.face
      f.moving = movement !== 0 && !f.stun && !f.attack && !f.crouch
      if (!f.stun && !f.attack) {
        if (p.pressed.has('up') && f.y === 0) {
          f.vy = profile.jump
          f.crouch = false
          f.guard = false
          this.sounds.push('thrust')
        }
        f.x += movement * dt * profile.speed * (f.crouch ? 0.3 : f.guard ? 0.54 : 1)
        f.walk += Math.abs(movement) * dt * profile.speed / 12
        if (!f.cooldown) {
          const move =
            p.pressed.has('c') && f.energy >= profile.plasmaCost
              ? 'plasma'
              : p.pressed.has('b')
                ? 'kick'
                : p.pressed.has('a')
                  ? 'punch'
                  : null
          if (move) {
            f.attack = {
              move,
              time: 0,
              hit: false,
            }
            f.guard = false
            f.cooldown = MOVES[move].duration * profile.tempo + 0.08
            if (move === 'plasma') f.energy -= profile.plasmaCost
          }
        }
      }
      f.x = Math.max(24, Math.min(456, f.x))
      if (f.attack) f.attack.time += dt
    })
    const [a, b] = this.fighters
    if (Math.abs(a.y - b.y) < 52 && Math.abs(a.x - b.x) < 30) {
      const dir = a.x <= b.x ? 1 : -1,
        overlap = (30 - Math.abs(a.x - b.x)) / 2
      a.x = Math.max(24, Math.min(456, a.x - dir * overlap))
      b.x = Math.max(24, Math.min(456, b.x + dir * overlap))
    }
    const hits = []
    this.fighters.forEach((f, i) => {
      const attack = f.attack
      if (!attack) return
      const profile = fighterProfile(f.character)
      const base = MOVES[attack.move]
      const move = { ...base, windup: base.windup * profile.tempo, duration: base.duration * profile.tempo, range: base.range * profile.reach },
        other = this.fighters[1 - i]
      if (!attack.hit && attack.time >= move.windup && attack.time < move.windup + 0.1) {
        if (attack.move === 'plasma') {
          this.projectiles.push({
            x: f.x + f.face * 25,
            y: f.y + 32,
            dir: f.face,
            owner: i,
            speed: profile.plasmaSpeed, damage: Math.round(12 * profile.plasmaPower),
          })
          attack.hit = true
          this.sounds.push('shoot')
        } else if (
          (other.x - f.x) * f.face > 0 &&
          Math.abs(f.x - other.x) < move.range &&
          Math.abs(f.y - other.y) < 42 &&
          !(other.crouch && attack.move === 'punch' && !f.crouch)
        ) {
          hits.push({
            owner: i,
            damage: Math.round(move.damage * profile.power),
            low: f.crouch,
            x: other.x,
            y: FLOOR - other.y - 32,
          })
          attack.hit = true
        }
      }
      if (attack.time >= move.duration) f.attack = null
    })
    this.projectiles = this.projectiles.filter((p) => {
      p.x += p.dir * p.speed * dt
      const other = this.fighters[1 - p.owner]
      if (Math.abs(p.x - other.x) < 18 && p.y > other.y + 8 && p.y < other.y + (other.crouch ? 35 : 66)) {
        hits.push({
          owner: p.owner,
          damage: p.damage,
          low: false,
          x: p.x,
          y: FLOOR - p.y,
        })
        return false
      }
      return p.x > -10 && p.x < 490
    })
    const guards = this.fighters.map((f) => ({
      guard: f.guard,
      crouch: f.crouch,
    }))
    for (const h of hits) {
      const f = this.fighters[1 - h.owner],
        blocked = guards[1 - h.owner].guard && (!h.low || guards[1 - h.owner].crouch)
      f.hp = Math.max(0, f.hp - (blocked ? 1 : Math.max(1, Math.round(h.damage * fighterProfile(f.character).armor))))
      f.stun = blocked ? 0.08 : 0.22
      f.attack = null
      f.x = Math.max(24, Math.min(456, f.x + this.fighters[h.owner].face * (blocked ? 4 : 10)))
      this.fighters[h.owner].energy = Math.min(100, this.fighters[h.owner].energy + (blocked ? 2 : 8))
      this.sparks.push({
        x: h.x,
        y: h.y,
        life: 0.18,
        blocked,
      })
      this.sounds.push(blocked ? 'lock' : 'bang-small')
    }
    if (!a.hp || !b.hp || !this.remaining) {
      this.roundWinner = a.hp === b.hp ? null : a.hp > b.hp ? 0 : 1
      if (this.roundWinner !== null) this.fighters[this.roundWinner].wins++
      this.phase = 'round'
      this.phaseTime = 2.2
      this.projectiles.length = 0
      this.sounds.push('bonus')
    }
  }
  snapshot() {
    return structuredClone({
      stage: this.stage,
      fighters: this.fighters,
      phase: this.phase,
      phaseTime: this.phaseTime,
      remaining: this.remaining,
      winner: this.winner,
      roundWinner: this.roundWinner,
      level: this.level,
      over: this.over,
      projectiles: this.projectiles,
      sparks: this.sparks,
      sounds: this.sounds,
    })
  }
}
