import { tr } from '../i18n'
import { emptyPad, pixelText } from './game'
import { FightSimulation, MOVES, type Fighter } from '../../shared/fight.js'
export type { FightMode } from '../../shared/fight.js'
const FLOOR = 238
export class Fight extends FightSimulation {
  draw(g: CanvasRenderingContext2D, t: number) {
    g.fillStyle = '#080f22'; g.fillRect(0, 0, 480, 300)
    // Baie vitrée, planète et portiques du hangar orbital.
    g.fillStyle = '#c5d6ee'
    for (let i = 0; i < 48; i++) g.fillRect((i * 73) % 480, 60 + (i * 37) % 145, 1, 1)
    g.fillStyle = '#243d67'; g.beginPath(); g.arc(315, 143, 69, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#365780'; g.beginPath(); g.ellipse(299, 125, 46, 8, -0.3, 0, Math.PI * 2); g.fill()
    g.strokeStyle = '#687a9e'; g.lineWidth = 2; g.beginPath(); g.ellipse(315, 143, 97, 15, -0.3, 0, Math.PI * 2); g.stroke()
    for (const x of [0, 95, 390, 473]) {
      g.fillStyle = '#19283b'; g.fillRect(x, 53, 7, 183)
      g.fillStyle = '#477180'; g.fillRect(x + 2, 55, 2, 180)
    }
    g.fillStyle = '#263448'; g.fillRect(0, FLOOR, 480, 62)
    g.fillStyle = '#73e8de'; g.fillRect(0, FLOOR, 480, 2)
    g.strokeStyle = '#3d5067'; g.lineWidth = 1
    for (let x = -240; x < 720; x += 60) { g.beginPath(); g.moveTo(240 + (x - 240) * 0.6, FLOOR + 2); g.lineTo(x, 300); g.stroke() }
    for (const y of [252, 277, 298]) { g.beginPath(); g.moveTo(0, y); g.lineTo(480, y); g.stroke() }
    g.fillStyle = '#d5a44c'
    for (let x = 0; x < 480; x += 24) g.fillRect(x, 288, 12, 4)
    this.fighters.forEach((f, i) => this.drawFighter(g, f, i, t))
    for (const p of this.projectiles) {
      g.fillStyle = p.owner ? '#ff75ad' : '#76eeff'; g.fillRect(p.x - 9, FLOOR - p.y - 5, 18, 10)
      g.fillStyle = '#fff'; g.fillRect(p.x - 4, FLOOR - p.y - 2, 8, 4)
    }
    for (const s of this.sparks) {
      g.strokeStyle = s.blocked ? '#8dcbff' : '#fff1a0'; g.lineWidth = 3
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3, r = (0.18 - s.life) * 100; g.beginPath(); g.moveTo(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r); g.lineTo(s.x + Math.cos(a) * (r + 8), s.y + Math.sin(a) * (r + 8)); g.stroke() }
    }
    g.fillStyle = '#090c16'; g.fillRect(0, 0, 480, 53)
    this.fighters.forEach((f, i) => {
      const x = i ? 278 : 20, color = i ? '#ff75ad' : '#76eeff'
      g.fillStyle = color; pixelText(g, i ? (this.mode === 'solo' ? 'CPU / VESPER' : tr('J2 / VESPER', 'P2 / VESPER')) : tr('J1 / NOVA', 'P1 / NOVA'), x, 6)
      g.fillStyle = '#47273e'; g.fillRect(x, 18, 182, 10)
      g.fillStyle = f.hp < 25 ? '#ff505c' : color; g.fillRect(i ? x + 182 * (1 - f.hp / 100) : x, 18, 182 * f.hp / 100, 10)
      g.fillStyle = '#c5d6ee'; pixelText(g, String(Math.ceil(f.hp)), x, 32)
      g.fillStyle = '#18364a'; g.fillRect(x + 32, 34, 105, 4)
      g.fillStyle = '#c6a6ff'; g.fillRect(x + 32, 34, 105 * f.energy / 100, 4)
      for (let n = 0; n < 2; n++) { g.fillStyle = f.wins > n ? '#ffe19a' : '#354154'; g.fillRect(x + 151 + n * 16, 33, 9, 7) }
    })
    g.fillStyle = '#ffe19a'; pixelText(g, String(Math.ceil(this.remaining)).padStart(2, '0'), 240, 13, 3, 'center')
    g.fillStyle = '#9bacc6'; pixelText(g, tr(`MANCHE ${this.level}`, `ROUND ${this.level}`), 240, 44, 1, 'center')
    if (this.phase !== 'fight') {
      let text = tr('COMBAT !', 'FIGHT!')
      if (this.phase === 'ready' && this.phaseTime > 0.6) text = tr(`MANCHE ${this.level}`, `ROUND ${this.level}`)
      if (this.phase === 'round') text = this.roundWinner === null ? tr('ÉGALITÉ', 'DRAW') : `${this.roundWinner === 0 ? 'NOVA' : 'VESPER'} ${tr('GAGNE', 'WINS')}`
      if (this.over) text = `${this.winner === 0 ? 'NOVA' : 'VESPER'} ${tr('VICTOIRE !', 'VICTORY!')}`
      g.fillStyle = '#080f22dd'; g.fillRect(0, 94, 480, 40)
      g.fillStyle = '#ffe19a'; pixelText(g, text, 240, 105, 2, 'center')
    }
  }

  private drawFighter(g: CanvasRenderingContext2D, f: Fighter, i: number, t: number) {
    g.fillStyle = '#060b1699'; g.beginPath(); g.ellipse(f.x, FLOOR + 4, 24, 5, 0, 0, Math.PI * 2); g.fill()
    g.save(); g.translate(Math.round(f.x), Math.round(FLOOR - f.y)); g.scale(f.face, 1)
    const color = f.stun ? '#fff' : i ? '#e95591' : '#43cbdc', dark = i ? '#672c60' : '#1c5774'
    const crouch = f.crouch ? 22 : 0, bob = f.y ? 0 : Math.sin(t * 6) * 1.5
    g.translate(0, crouch + bob)
    // Bottes, jambes, combinaison blindée, casque et visière.
    g.fillStyle = dark; g.fillRect(-12, -28, 10, 26 - crouch); g.fillRect(5, -28, 10, 26 - crouch)
    g.fillStyle = '#b9ccdc'; g.fillRect(-15, -5 - crouch, 14, 6); g.fillRect(5, -5 - crouch, 17, 6)
    g.fillStyle = dark; g.fillRect(-16, -48, 30, 25)
    g.fillStyle = color; g.fillRect(-12, -47, 24, 19); g.fillRect(-17, -47, 9, 9)
    g.fillStyle = '#e0d5b4'; g.fillRect(-7, -44, 12, 4); g.fillRect(-14, -29, 29, 4)
    g.fillStyle = dark; g.fillRect(-11, -68, 24, 21)
    g.fillStyle = '#d7e4ec'; g.fillRect(-9, -66, 20, 16)
    g.fillStyle = '#081626'; g.fillRect(-3, -62, 17, 8)
    g.fillStyle = '#ffcf75'; g.fillRect(2, -61, 12, 2)
    const active = f.attack && f.attack.time >= MOVES[f.attack.move].windup && f.attack.time < MOVES[f.attack.move].windup + 0.13
    g.fillStyle = color
    if (active && f.attack!.move === 'kick') {
      g.fillRect(5, -29, 44, 9); g.fillStyle = '#d7e4ec'; g.fillRect(46, -32, 12, 12)
    } else if (active) {
      g.fillRect(8, -44, f.attack!.move === 'punch' ? 33 : 25, 10)
      g.fillStyle = '#d7e4ec'; g.fillRect(35, -46, 12, 13)
    } else {
      g.fillRect(9, f.guard ? -59 : -41, 9, 19)
      g.fillStyle = '#d7e4ec'; g.fillRect(12, f.guard ? -62 : -41, 10, 9)
    }
    if (f.guard) { g.strokeStyle = '#8dcbff'; g.lineWidth = 2; g.beginPath(); g.arc(8, -38, 31, -1.1, 1.1); g.stroke() }
    g.restore()
  }
}

/** Démonstration du même jeu, contrôlée par deux IA. */
export const fightDemo = () => {
  const game = new Fight('demo')
  return { game, next: () => emptyPad() }
}
