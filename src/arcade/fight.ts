import { tr } from '../i18n'
import { drawFighterSprite, fightSpritesReady } from './fight-sprites'
import { emptyPad, pixelText } from './game'
import { FightSimulation, type Fighter } from '../../shared/fight.js'
import { FIGHT_TITLE, FIGHT_ROSTER, fighterProfile, type FighterId } from '../../shared/fight-roster.js'
export type { FightMode } from '../../shared/fight.js'
const FLOOR = 238
const snap = (v: number) => Math.round(v / 2) * 2

/** Toutes les formes sont faites de blocs : aucun lissage sur les sprites ou le décor. */
function rect(g: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number) {
  if (w <= 0 || h <= 0) return
  g.fillStyle = color
  g.fillRect(snap(x), snap(y), Math.max(2, snap(w)), Math.max(2, snap(h)))
}
function disc(g: CanvasRenderingContext2D, color: string, cx: number, cy: number, rx: number, ry = rx) {
  for (let y = -ry; y <= ry; y += 2) {
    const w = Math.sqrt(Math.max(0, 1 - (y / ry) ** 2)) * rx
    rect(g, color, cx - w, cy + y, w * 2, 2)
  }
}
function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, color: string | CanvasGradient, size = 1, align: 'left' | 'center' | 'right' = 'left') {
  g.fillStyle = '#030811'; pixelText(g, text, x + size, y + size, size, align)
  g.fillStyle = color; pixelText(g, text, x, y, size, align)
}
/** Rue commerçante au crépuscule : façades, enseignes, public et pavés en pixels. */
export function drawFightStage(g: CanvasRenderingContext2D, t: number) {
  rect(g, '#251c39', 0, 0, 480, 300)
  const sky = ['#251c39', '#3d2949', '#63344e', '#95504e', '#c87357', '#e79c69']
  sky.forEach((color, i) => rect(g, color, 0, 38 + i * 21, 480, 24))
  // Toits en profondeur et fenêtres allumées.
  for (let i = 0; i < 13; i++) {
    const x = i * 41 - 9, y = 76 + (i * 29) % 43
    rect(g, '#352c43', x, y, 36, 110)
    rect(g, '#29263b', x + 7, y - 8, 19, 8)
    for (let yy = y + 10; yy < 164; yy += 12) for (let xx = x + 5; xx < x + 33; xx += 10)
      rect(g, (xx + yy) % 3 ? '#725358' : '#ecb878', xx, yy, 4, 6)
  }
  // Trois boutiques, avec briques, corniches, volets et portes.
  for (const [x, w, color, shade] of [[0, 143, '#865953', '#533d43'], [157, 165, '#b08a6b', '#70504e'], [336, 144, '#67647a', '#414152']] as const) {
    rect(g, shade, x, 102, w, 137)
    rect(g, color, x + 3, 107, w - 6, 119)
    for (let y = 111; y < 225; y += 10) {
      rect(g, shade, x + 3, y, w - 6, 2)
      for (let xx = x + (y % 20 ? 14 : 4); xx < x + w - 5; xx += 24) rect(g, shade, xx, y + 2, 2, 8)
    }
    rect(g, '#382f39', x, 101, w, 6); rect(g, '#d8aa87', x + 1, 107, w - 2, 2)
    for (let xx = x + 14; xx < x + w - 18; xx += 40) {
      rect(g, '#392c3a', xx - 2, 115, 28, 30); rect(g, '#182c40', xx, 118, 24, 25)
      rect(g, '#d6a976', xx + 3, 120, 8, 20); rect(g, '#704c50', xx + 12, 118, 2, 25)
      rect(g, '#5e777c', xx + 14, 120, 8, 9); rect(g, '#cbab91', xx - 3, 145, 30, 3)
    }
    rect(g, '#292635', x + 10, 172, w - 20, 55)
    rect(g, '#42354a', x + 14, 178, w - 28, 49)
    for (let y = 180; y < 225; y += 5) rect(g, '#605267', x + 14, y, w - 28, 2)
    rect(g, '#171f32', x + w - 35, 173, 22, 54)
    rect(g, '#748b8e', x + w - 31, 179, 14, 27); rect(g, '#e3b67b', x + w - 20, 211, 2, 3)
    rect(g, '#b59786', x + 6, 226, w - 12, 7)
  }
  // Enseignes et store rayé du snack. Un néon fait mine de fatiguer.
  rect(g, '#291b31', 7, 151, 125, 20); rect(g, '#e7a45f', 9, 153, 121, 2)
  label(g, 'CHEZ KO', 69, 158, '#ffdd8c', 1, 'center')
  for (let x = 10; x < 120; x += 10) { rect(g, x % 20 ? '#d16865' : '#ffe3ac', x, 173, 10, 8); rect(g, x % 20 ? '#9b414f' : '#ccac8a', x, 181, 10, 5) }
  rect(g, '#373142', 170, 151, 140, 19); rect(g, '#e89f68', 171, 152, 138, 2)
  label(g, 'DOJO DU COIN', 240, 158, '#ffcf84', 1, 'center')
  rect(g, '#241f37', 347, 151, 123, 20)
  label(g, 'INSERT COIN', 408, 158, Math.sin(t * 2) > -0.94 ? '#79dad7' : '#407b84', 1, 'center')
  // Éclairage suspendu et banderoles d'un tournoi parfaitement improvisé.
  for (let x = 0; x < 480; x += 4) rect(g, '#252538', x, 78 + Math.sin(x / 480 * Math.PI) * 18, 4, 2)
  for (let i = 0; i < 15; i++) {
    const x = i * 34 + 4, y = 80 + Math.sin(x / 480 * Math.PI) * 18
    const colors = ['#edbd70', '#cd5d69', '#70b8b0']
    for (let h = 0; h < 10; h += 2) rect(g, colors[i % 3], x + h / 2 + Math.sin(t * 2 + i), y + h, 12 - h, 2)
  }
  // Spectateurs de quartier (petites silhouettes décoratives).
  for (const [x, color, skin] of [[31, '#ad6871', '#d7a17d'], [104, '#66879a', '#f0bb8b'], [372, '#ad9257', '#c48b66'], [443, '#775d96', '#ebba95']] as const) {
    const bob = Math.sin(t * 3 + x) > 0.5 ? -2 : 0
    rect(g, '#252637', x - 5, 222, 4, 12); rect(g, '#252637', x + 2, 222, 4, 12)
    rect(g, color, x - 6, 210 + bob, 13, 16); rect(g, skin, x - 4, 202 + bob, 9, 9)
    rect(g, '#332b39', x - 5, 201 + bob, 10, 3)
    rect(g, skin, x - 10, 212 + bob, 4, 8); rect(g, skin, x + 7, 209 + bob, 4, 10)
  }
  // Affiches, caisse de bouteilles, poubelles et vapeur d'une bouche d'égout.
  rect(g, '#edd9ad', 141, 165, 14, 26); label(g, 'VS', 148, 170, '#a34458', 1, 'center')
  rect(g, '#9f5e54', 324, 170, 10, 36); rect(g, '#392e3c', 325, 172, 8, 8)
  for (const x of [10, 463]) { rect(g, '#252f3b', x - 3, 219, 15, 15); rect(g, '#647274', x - 4, 217, 17, 3); rect(g, '#819592', x, 222, 2, 9) }
  rect(g, '#665661', 0, 234, 480, 4); rect(g, '#d3b69b', 0, FLOOR, 480, 3)
  rect(g, '#3c3b4b', 0, FLOOR + 3, 480, 59)
  for (let y = FLOOR + 8; y < 300; y += 10) {
    rect(g, '#565061', 0, y, 480, 2)
    for (let x = y % 20 ? 0 : 20; x < 480; x += 40) rect(g, '#565061', x, y + 2, 2, 8)
  }
  for (const [x, color] of [[42, '#df977a'], [238, '#caa56d'], [400, '#69a1a9']] as const)
    for (let y = 245; y < 291; y += 6) rect(g, color + '22', x - (y - 238) / 2, y, y - 224, 2)
  rect(g, '#242b38', 324, 254, 36, 6)
  for (let x = 328; x < 357; x += 6) rect(g, '#78818c', x, 254, 2, 6)
  for (let i = 0; i < 6; i++) {
    const age = (t * 14 + i * 7) % 42
    rect(g, '#ddbdab22', 337 + Math.sin(t + i) * 5 - age / 6, 249 - age, 4 + age / 3, 2)
  }
}

/** Les poses manquantes dans les packs de plateforme sont indiquées par la garde. */
export function drawCombatant(g: CanvasRenderingContext2D, f: Fighter, t: number, alternate = false, koTime = 0) {
  drawFighterSprite(g, f, t, FLOOR, koTime)
  if (f.guard) {
    g.save(); g.translate(snap(f.x), snap(FLOOR - f.y)); g.scale(f.face, 1)
    for (let y = -57; y < -10; y += 4) rect(g, '#9ddcffaa', 25 + Math.sqrt(Math.max(0, 24 ** 2 - (y + 34) ** 2)) / 3, y, 2, 3)
    g.restore()
  }
  // En miroir, un repère J2 évite de confondre deux costumes identiques.
  if (alternate) label(g, '2P', f.x, FLOOR - f.y - 87, '#ffb68b', 1, 'center')
}
function portrait(g: CanvasRenderingContext2D, id: FighterId, x: number, y: number, scale: number, face: number, t: number) {
  const f: Fighter = { character: id, x: 0, y: 0, vy: 0, face, hp: 100, energy: 40, wins: 0, stun: 0, cooldown: 0, guard: false, crouch: false, attack: null, walk: 0, moving: false }
  g.save(); g.translate(snap(x), snap(y)); g.scale(scale, scale); g.translate(0, -FLOOR)
  drawCombatant(g, f, t); g.restore()
}

export function drawFightIntro(g: CanvasRenderingContext2D, elapsed: number) {
  drawFightStage(g, elapsed)
  rect(g, '#081026aa', 0, 0, 480, 300)
  const arrival = Math.min(1, elapsed / 0.7), slide = (1 - arrival) ** 3 * 210
  portrait(g, 'nova', 96 - slide, 253, 2, 1, elapsed)
  portrait(g, 'rook', 390 + slide, 253, 2, -1, elapsed)
  for (let i = 0; i < 20; i++) rect(g, '#4a76a699', (elapsed * 80 + i * 67) % 480, 162 + i * 3, 24 + i % 4 * 9, 2)
  const reveal = Math.max(0, Math.min(1, (elapsed - 0.5) / 0.7))
  g.save(); g.translate(240, 28); g.transform(1, 0, -0.12, 1, 0, 0)
  g.globalAlpha = reveal
  label(g, 'RUELLE', 3, 3, '#8a274b', 5, 'center')
  const gold = g.createLinearGradient(0, 0, 0, 84)
  gold.addColorStop(0, '#fff2a2'); gold.addColorStop(0.5, '#ffce65'); gold.addColorStop(1, '#ff704a')
  label(g, 'RUELLE', 0, 0, gold, 5, 'center')
  label(g, 'FIGHTER II', 3, 48, '#8a274b', 4, 'center')
  label(g, 'FIGHTER II', 0, 45, gold, 4, 'center')
  g.restore()
  if (elapsed > 1.1) {
    const radius = Math.min(60, (elapsed - 1.1) * 90)
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; rect(g, i % 2 ? '#ffc772' : '#79edff', 240 + Math.cos(a) * radius, 199 + Math.sin(a) * radius * 0.6, 6, 3) }
    label(g, 'VS', 240, 185, '#ffe5b4', 4, 'center')
  }
  label(g, tr('CHAMPIONNAT DU COIN', 'NEIGHBORHOOD CHAMPIONSHIP'), 240, 266, '#e4eaf7', 1, 'center')
  label(g, tr('ESPACE / A : PASSER', 'SPACE / A: SKIP'), 240, 284, '#8eb5ca', 1, 'center')
}

export function drawFightSelection(g: CanvasRenderingContext2D, selected: FighterId, online: boolean, waiting: boolean, t: number) {
  const p = fighterProfile(selected)
  drawFightStage(g, t)
  rect(g, '#071126ee', 0, 0, 480, 300)
  label(g, FIGHT_TITLE, 240, 12, '#ffe09b', 2, 'center')
  label(g, tr('CHOISISSEZ VOTRE COMBATTANT', 'CHOOSE YOUR FIGHTER'), 240, 43, '#a7b7d8', 1, 'center')
  portrait(g, selected, 83, 186, 1.5, 1, t)
  label(g, p.name, 180, 66, p.color, 3)
  label(g, tr(...p.role), 180, 92, '#dce5f3')
  const names = [tr('VITESSE', 'SPEED'), tr('FRAPPE', 'STRIKE'), tr('DÉFENSE', 'DEFENSE')]
  names.forEach((name, i) => {
    label(g, name, 180, 111 + i * 13, '#849fb7')
    for (let n = 0; n < 5; n++) rect(g, n < p.stats[i] ? p.color : '#27344b', 252 + n * 15, 111 + i * 13, 11, 6)
  })
  label(g, `+ ${tr(...p.strength)}`, 180, 155, '#9aefb1')
  label(g, `- ${tr(...p.weakness)}`, 180, 170, '#ffa697')
  label(g, online ? tr('DUEL EN LIGNE', 'ONLINE DUEL') : tr('SOLO CONTRE CPU', 'SOLO VS CPU'), 180, 187, '#ffe09b')
  FIGHT_ROSTER.forEach((f, i) => {
    const x = 8 + i * 78, chosen = f.id === selected
    rect(g, chosen ? f.color : '#34435b', x, 211, 74, 65)
    rect(g, '#101b30', x + 2, 213, 70, 61)
    portrait(g, f.id, x + 36, 254, 0.5, 1, t)
    label(g, f.name, x + 37, 263, chosen ? f.color : '#a0b4cb', 1, 'center')
  })
  label(g, !fightSpritesReady() ? tr('CHARGEMENT DES COMBATTANTS…', 'LOADING FIGHTERS…') : waiting ? tr('EN ATTENTE D’UN ADVERSAIRE…', 'WAITING FOR AN OPPONENT…') : tr('GAUCHE / DROITE : CHOISIR · A : COMBAT', 'LEFT / RIGHT: CHOOSE · A: FIGHT'), 240, 286, waiting ? '#ffe09b' : '#bacfe3', 1, 'center')
}

export class Fight extends FightSimulation {
  draw(g: CanvasRenderingContext2D, t: number) {
    if (this.phase === 'intro') { this.drawVersus(g, t); return }
    const impact = this.sparks.some(s => !s.blocked && s.life > 0.13)
    g.save()
    if (impact) g.translate(Math.floor(Math.sin(t * 80) * 2), 0)
    drawFightStage(g, t)
    const koTime = this.phase === 'round' ? 2.2 - this.phaseTime : this.over ? 2.2 : 0
    this.fighters.forEach((f, i) => {
      disc(g, '#03091ba0', f.x, FLOOR + 4, 22, 4)
      // Reflet au sol, en transparence et en blocs.
      g.save(); g.globalAlpha = 0.09; g.translate(0, FLOOR * 1.4 + 5); g.scale(1, -0.4)
      drawCombatant(g, f, t, i === 1 && f.character === this.fighters[0].character, koTime); g.restore()
      drawCombatant(g, f, t, i === 1 && f.character === this.fighters[0].character, koTime)
    })
    for (const p of this.projectiles) {
      const color = fighterProfile(this.fighters[p.owner].character).color
      for (let n = 4; n > 0; n--) rect(g, `${color}66`, p.x - p.dir * n * 7 - 5, FLOOR - p.y - 3, 10, 6)
      disc(g, color, p.x, FLOOR - p.y, 10, 6)
      rect(g, '#fff6ce', p.x - 5, FLOOR - p.y - 2, 10, 4)
    }
    for (const s of this.sparks) {
      const radius = (0.18 - s.life) * 130, color = s.blocked ? '#a1dfff' : '#ffe38d'
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4
        rect(g, color, s.x + Math.cos(a) * radius, s.y + Math.sin(a) * radius, s.blocked ? 4 : 6, 3)
      }
      if (s.life > 0.11) label(g, s.blocked ? tr('GARDE', 'BLOCK') : 'HIT!', s.x, s.y - 21, color, 1, 'center')
    }
    g.restore()
    this.drawHud(g)
    if (this.phase !== 'fight') {
      const win = this.phase === 'round' ? this.roundWinner : this.winner
      let text = this.phase === 'ready' ? this.phaseTime > 0.6 ? tr(`MANCHE ${this.level}`, `ROUND ${this.level}`) : tr('COMBAT !', 'FIGHT!') : win === null ? tr('ÉGALITÉ', 'DRAW') : `${fighterProfile(this.fighters[win].character).name} ${this.over ? tr('VICTOIRE !', 'VICTORY!') : tr('GAGNE', 'WINS')}`
      rect(g, '#060d21de', 0, 88, 480, 40)
      label(g, text, 240, 101, '#ffda8b', 2, 'center')
    }
  }
  private drawHud(g: CanvasRenderingContext2D) {
    rect(g, '#081021', 0, 0, 480, 40)
    this.fighters.forEach((f, i) => {
      const p = fighterProfile(f.character), x = i ? 278 : 18
      label(g, `${i ? this.mode === 'solo' ? 'CPU' : tr('J2', 'P2') : tr('J1', 'P1')} / ${p.name}`, x, 3, p.color)
      rect(g, '#c9b99c', x - 1, 13, 184, 11); rect(g, '#49263a', x, 14, 182, 8)
      rect(g, f.hp < 25 ? '#fc666d' : '#f1d57d', i ? x + 182 * (1 - f.hp / 100) : x, 14, 182 * f.hp / 100, 8)
      if (f.hp > 0) rect(g, '#fff1b2', i ? x + 182 * (1 - f.hp / 100) : x, 14, 182 * f.hp / 100, 2)
      rect(g, '#25394f', x + 31, 29, 104, 4); rect(g, p.color, x + 31, 29, 104 * f.energy / 100, 4)
      label(g, String(Math.ceil(f.hp)), x, 27, '#cedce4')
      for (let n = 0; n < 2; n++) { rect(g, '#48516b', x + 151 + n * 16, 27, 10, 7); if (f.wins > n) rect(g, '#ffe89e', x + 153 + n * 16, 28, 6, 4) }
    })
    label(g, String(Math.ceil(this.remaining)).padStart(2, '0'), 240, 3, '#ffeab1', 3, 'center')
    label(g, `R${this.level}`, 240, 28, '#98acc5', 1, 'center')
  }
  private drawVersus(g: CanvasRenderingContext2D, t: number) {
    const elapsed = 2.8 - this.phaseTime, entry = Math.max(0, 1 - elapsed / 0.65) ** 3 * 250
    drawFightStage(g, t); rect(g, '#090f27cc', 0, 0, 480, 300)
    for (let y = 0; y < 300; y += 4) { rect(g, '#213b56', 0, y, 242 - y * 0.12, 4); rect(g, '#563148', 246 - y * 0.12, y, 480, 4) }
    rect(g, '#efd599', 240, 0, 4, 300)
    portrait(g, this.fighters[0].character, 112 - entry, 222, 2, 1, t)
    portrait(g, this.fighters[1].character, 370 + entry, 222, 2, -1, t)
    label(g, fighterProfile(this.fighters[0].character).name, 112 - entry, 238, '#a4f4ff', 3, 'center')
    label(g, fighterProfile(this.fighters[1].character).name, 370 + entry, 238, '#ffc0d2', 3, 'center')
    if (elapsed > 0.55) label(g, 'VS', 240, 137, '#ffe39c', 4, 'center')
    label(g, FIGHT_TITLE, 240, 22, '#ffdd96', 2, 'center')
    label(g, tr('DOJO DU COIN · DEUX MANCHES GAGNANTES', 'CORNER DOJO · FIRST TO TWO ROUNDS'), 240, 283, '#d6dceb', 1, 'center')
  }
}
export const fightDemo = () => {
  const pair = Math.floor(Math.random() * FIGHT_ROSTER.length)
  const game = new Fight('demo', 3312, [FIGHT_ROSTER[pair].id, FIGHT_ROSTER[(pair + 3) % 6].id])
  return { game, next: () => emptyPad() }
}
