import { tr } from '../i18n'
import { emptyPad, pixelText } from './game'
import { FightSimulation, MOVES, type Fighter } from '../../shared/fight.js'
import { FIGHT_ROSTER, fighterProfile, type FighterId } from '../../shared/fight-roster.js'
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
function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, size = 1, align: 'left' | 'center' | 'right' = 'left') {
  g.fillStyle = '#030811'; pixelText(g, text, x + size, y + size, size, align)
  g.fillStyle = color; pixelText(g, text, x, y, size, align)
}
function limb(g: CanvasRenderingContext2D, color: string, x: number, y: number, tx: number, ty: number, width: number) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(tx - x), Math.abs(ty - y)) / 2))
  for (const [paint, thickness] of [['#080d1b', width + 4], [color, width]] as const) {
    for (let n = 0; n <= steps; n++) rect(g, paint, x + (tx - x) * n / steps - thickness / 2, y + (ty - y) * n / steps - thickness / 2, thickness, thickness)
  }
}

/** Hangar détaillé, ciel en parallaxe, planète en bandes et passerelle d'observation. */
export function drawFightStage(g: CanvasRenderingContext2D, t: number) {
  rect(g, '#080e20', 0, 0, 480, 300)
  for (let i = 0; i < 75; i++) {
    const x = ((i * 73 - Math.floor(t / 2)) % 480 + 480) % 480
    rect(g, i % 3 ? '#667a9e' : '#b9dbe0', x, 46 + (i * 37) % 156, 2, 2)
  }
  disc(g, '#314874', 329, 130, 80)
  for (let y = -70; y < 76; y += 6) {
    const extent = Math.sqrt(Math.max(0, 80 ** 2 - y ** 2))
    rect(g, y % 12 ? '#3a5482' : '#283d66', 329 - extent, 130 + y, extent * 2, 4)
  }
  disc(g, '#080e2066', 354, 126, 60, 78)
  // Anneau interrompu en blocs ; la planète reste entièrement pixellisée.
  for (let i = 0; i < 120; i++) {
    const a = i / 120 * Math.PI * 2, x = Math.cos(a) * 109, y = Math.sin(a) * 18
    if (i > 55 && i < 115) continue
    rect(g, '#a1b4cd', 329 + x, 132 + y - x * 0.24, 4, 2)
  }
  // Transporteur au loin, navette et tuyères.
  const ship = 18 + (t * 4) % 95
  rect(g, '#7186a3', ship, 92, 47, 6); rect(g, '#344566', ship + 10, 86, 26, 14)
  rect(g, '#a0dbeb', ship + 33, 88, 7, 3); rect(g, '#6495cb', ship - 6, 94, 8, 2)
  rect(g, '#162036', 0, 193, 480, 35)
  for (let x = 0; x < 480; x += 24) {
    rect(g, '#2a3b54', x, 198, 17, 14)
    rect(g, '#fdcc6a', x + 3, 201, 3, 2)
    rect(g, '#556880', x, 215, 21, 3)
  }
  for (const x of [0, 82, 390, 470]) {
    rect(g, '#0a1225', x - 4, 36, 18, 198)
    rect(g, '#243c52', x, 38, 10, 198)
    rect(g, '#506f86', x, 38, 2, 194)
    for (let y = 58; y < 200; y += 32) rect(g, '#0c1728', x + 2, y, 6, 6)
    rect(g, '#8fdbe3', x + 4, 47, 2, 23)
  }
  rect(g, '#263c50', 0, 40, 480, 10); rect(g, '#647b85', 0, 40, 480, 2)
  for (let x = 12; x < 480; x += 48) { rect(g, '#0c1728', x, 43, 32, 3); rect(g, '#efbc62', x + 8, 46, 16, 2) }
  // Caisses, conduites et balises au bord de l'arène.
  for (const [x, y, color] of [[24, 218, '#535d66'], [53, 221, '#776238'], [413, 218, '#535d66']] as const) {
    rect(g, '#080e19', x - 2, y - 2, 26, FLOOR - y + 2)
    rect(g, color, x, y, 22, FLOOR - y)
    rect(g, '#bbc3b2', x, y, 22, 2); rect(g, '#1b2934', x + 6, y + 5, 10, 6)
    rect(g, '#ffce70', x + 2, y + 11, 4, 3)
  }
  label(g, 'DOCK 07', 116, 62, '#597389')
  label(g, 'ORBITAL / 3312', 375, 177, '#78909d', 1, 'right')
  rect(g, '#172b40', 0, FLOOR, 480, 62)
  rect(g, '#8eeae2', 0, FLOOR, 480, 2); rect(g, '#425a70', 0, FLOOR + 4, 480, 2)
  for (let y = FLOOR + 8; y < 300; y += 2) {
    const perspective = (y - FLOOR + 15) / 77
    for (let x = -480; x < 960; x += 64) rect(g, '#3b566d', 240 + (x - 240) * perspective, y, 2, 2)
  }
  for (const y of [251, 270, 297]) rect(g, '#456478', 0, y, 480, 2)
  for (let x = 0; x < 480; x += 24) { rect(g, '#dfad54', x, 288, 12, 4); rect(g, '#070f1e', x + 12, 288, 12, 4) }
  for (const x of [7, 467]) { rect(g, '#06111d', x, 224, 8, 14); rect(g, Math.sin(t * 3) > 0 ? '#fa7482' : '#783d55', x + 2, 226, 4, 6) }
}

/** Sprites articulés : les six silhouettes partagent les poses, pas leur costume. */
export function drawCombatant(g: CanvasRenderingContext2D, f: Fighter, t: number, alternate = false) {
  const p = fighterProfile(f.character), heavy = p.style === 'heavy', sentinel = p.style === 'sentinel'
  const body = f.stun > 0 ? '#e8f7ff' : alternate ? p.accent : p.color
  const wide = heavy ? 16 : sentinel ? 13 : 10
  const attack = f.attack, timing = attack ? MOVES[attack.move] : null
  const active = attack && attack.time >= timing!.windup * p.tempo && attack.time < timing!.windup * p.tempo + 0.13
  const walk = !attack && !f.guard && !f.crouch && !f.y ? Math.sin(f.walk) * 5 : 0
  g.save(); g.translate(snap(f.x), snap(FLOOR - f.y)); g.scale(f.face, 1)
  if (p.style === 'ninja' || sentinel) {
    // Écharpe ou cape, dont les contours restent en marches d'escalier.
    for (let y = -51; y < (sentinel ? -10 : -42); y += 2) rect(g, sentinel ? p.dark : p.accent, -wide - 8 - Math.sin(t * 8 + y) * 2, y, sentinel ? 13 : 17, 2)
  }
  const low = f.crouch ? 20 : 0, bob = !f.y && !f.crouch ? Math.sin(t * 5) * 1.5 : 0
  g.translate(0, snap(low + bob))
  const backFoot = -9 - walk, frontFoot = 9 + walk
  limb(g, p.dark, -7, -27, backFoot, -5 - low, heavy ? 12 : 8)
  limb(g, p.dark, 7, -27, frontFoot, -5 - low, heavy ? 12 : 8)
  rect(g, p.light, backFoot - 7, -6 - low, 13, 5); rect(g, '#080f1d', backFoot - 8, -2 - low, 15, 3)
  rect(g, p.light, frontFoot - 4, -6 - low, 15, 5); rect(g, '#080f1d', frontFoot - 5, -2 - low, 17, 3)
  rect(g, body, -11, -22, 7, 6); rect(g, body, 5, -22, 7, 6)
  // Bras arrière, panneau dorsal, torse avec contour et deux niveaux d'ombre.
  limb(g, p.dark, -wide, -44, -wide - 6, -30 + walk, 8)
  rect(g, '#080e1d', -wide - 5, -47, wide * 2 + 10, 25)
  rect(g, p.dark, -wide - 2, -46, wide * 2 + 4, 22)
  rect(g, body, -wide, -47, wide * 2, 19)
  rect(g, p.light, -wide + 2, -46, 3, 14)
  rect(g, p.dark, -wide, -31, wide * 2, 5)
  rect(g, '#c9d7d7', -wide - 2, -27, wide * 2 + 4, 3)
  rect(g, p.accent, -4, -29, 7, 6)
  if (p.style === 'alien') {
    for (const x of [-5, 3]) { rect(g, p.light, x, -43, 3, 12); rect(g, p.accent, x, -40, 3, 4) }
  } else {
    rect(g, p.dark, -6, -43, 13, 8); rect(g, p.accent, -4, -42, 9, 3)
    rect(g, p.light, -wide - 4, -46, heavy ? 11 : 7, 8)
    if (sentinel) { rect(g, '#253447', -5, -39, 12, 5); rect(g, p.accent, 4, -38, 3, 2) }
  }
  // Tête : casque de pilote, crête cyborg, capuche, masque alien ou blindage de robot.
  rect(g, '#060d1b', -12, -68, 25, 20)
  rect(g, p.dark, -11, -66, 23, 18)
  if (p.style === 'pilot') {
    rect(g, p.light, -9, -66, 18, 4); rect(g, '#b7cbd8', -10, -63, 21, 12)
    rect(g, '#15243c', -3, -63, 17, 10); rect(g, '#efbb66', 1, -62, 12, 3)
    rect(g, '#4e7f9b', 2, -58, 9, 2); rect(g, '#edeeee', -10, -51, 20, 4)
    rect(g, p.dark, -13, -61, 5, 9)
  } else if (p.style === 'acrobat') {
    rect(g, body, -7, -69, 14, 5); rect(g, p.accent, -3, -71, 5, 4)
    rect(g, '#efd1b8', -7, -61, 18, 10); rect(g, '#262541', -8, -58, 22, 4)
    rect(g, p.light, 4, -58, 8, 2); rect(g, p.dark, -11, -64, 6, 15)
    rect(g, '#c9e8ed', -5, -52, 17, 4)
  } else if (p.style === 'ninja') {
    rect(g, body, -9, -66, 17, 5); rect(g, p.dark, -6, -62, 18, 13)
    rect(g, '#edd0b1', -3, -59, 15, 5); rect(g, '#0a1027', 2, -58, 10, 2)
    rect(g, p.accent, -10, -54, 23, 6); rect(g, p.light, -7, -65, 4, 2)
  } else if (p.style === 'alien') {
    rect(g, body, -6, -70, 12, 24); rect(g, p.light, -10, -63, 21, 10)
    rect(g, '#172f34', -5, -62, 6, 7); rect(g, '#172f34', 6, -62, 6, 7)
    rect(g, p.accent, -3, -61, 2, 4); rect(g, p.accent, 8, -61, 2, 4)
    rect(g, p.dark, -2, -51, 8, 3); rect(g, p.accent, -2, -75, 4, 6)
  } else {
    rect(g, body, -12, -66, 23, 16); rect(g, p.light, -12, -66, 23, 3)
    rect(g, '#1d263b', -6, -61, 20, 7); rect(g, p.accent, -3, -60, 15, 3)
    rect(g, p.dark, -7, -52, 20, 5)
    for (const x of [-4, 2, 8]) rect(g, '#869da2', x, -51, 2, 3)
    if (heavy) { rect(g, '#8099a1', -16, -63, 5, 12); rect(g, p.accent, -14, -69, 3, 7) }
  }
  if (heavy || sentinel) { rect(g, '#091323', wide - 2, -48, 13, 12); rect(g, body, wide, -47, 10, 9); rect(g, p.light, wide, -46, 10, 2) }
  // Avant-bras : anticipation, extension, puis récupération. Pied projeté lors du kick.
  const windup = attack && !active ? -6 : 0
  const handX = active ? (attack!.move === 'punch' ? MOVES.punch.range * p.reach - 8 : 29) : f.guard ? 18 : 19 + walk
  const handY = active ? -40 : f.guard ? -57 : -40 + windup
  limb(g, body, wide, -42, handX, handY, heavy ? 11 : 8)
  rect(g, p.dark, handX - 6, handY - 6, heavy ? 16 : 12, 12)
  rect(g, p.light, handX - 4, handY - 5, heavy ? 12 : 9, 8)
  rect(g, body, handX - 4, handY + 2, 10, 3)
  if (active && attack!.move === 'kick') {
    const reach = MOVES.kick.range * p.reach - 10
    limb(g, body, 5, -27, reach, -22, heavy ? 12 : 9)
    rect(g, p.light, reach - 5, -27, 13, 11); rect(g, '#0b1326', reach + 6, -27, 4, 13)
  }
  if (active && attack!.move !== 'plasma') {
    const reach = attack!.move === 'kick' ? MOVES.kick.range * p.reach : handX
    for (let k = 0; k < 4; k++) rect(g, `${p.light}99`, reach - 13 - k * 6, (attack!.move === 'kick' ? -20 : -38) + k * 2, 8, 2)
  }
  if (f.guard) for (let y = -57; y < -10; y += 4) rect(g, '#9ddcffaa', 25 + Math.sqrt(Math.max(0, 24 ** 2 - (y + 34) ** 2)) / 3, y, 2, 3)
  if (attack?.move === 'plasma' && !active) { disc(g, `${p.color}88`, handX + 7, handY, 6); rect(g, '#fff3c8', handX + 5, handY - 2, 4, 4) }
  g.restore()
}
function portrait(g: CanvasRenderingContext2D, id: FighterId, x: number, y: number, scale: number, face: number, t: number) {
  const f: Fighter = { character: id, x: 0, y: 0, vy: 0, face, hp: 100, energy: 40, wins: 0, stun: 0, cooldown: 0, guard: false, crouch: false, attack: null, walk: 0 }
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
  label(g, 'ORBITAL', 3, 3, '#8a274b', 5, 'center')
  label(g, 'ORBITAL', 0, 0, '#ffe18d', 5, 'center')
  label(g, 'CLASH', 3, 48, '#8a274b', 6, 'center')
  label(g, 'CLASH', 0, 45, '#ff985f', 6, 'center')
  g.restore()
  if (elapsed > 1.1) {
    const radius = Math.min(60, (elapsed - 1.1) * 90)
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; rect(g, i % 2 ? '#ffc772' : '#79edff', 240 + Math.cos(a) * radius, 199 + Math.sin(a) * radius * 0.6, 6, 3) }
    label(g, 'VS', 240, 185, '#ffe5b4', 4, 'center')
  }
  label(g, tr('SIX COMBATTANTS. UNE ARÈNE.', 'SIX FIGHTERS. ONE ARENA.'), 240, 266, '#e4eaf7', 1, 'center')
  label(g, tr('ESPACE / A : PASSER', 'SPACE / A: SKIP'), 240, 284, '#8eb5ca', 1, 'center')
}

export function drawFightSelection(g: CanvasRenderingContext2D, selected: FighterId, online: boolean, waiting: boolean, t: number) {
  const p = fighterProfile(selected)
  drawFightStage(g, t)
  rect(g, '#071126ee', 0, 0, 480, 300)
  label(g, 'ORBITAL CLASH', 240, 12, '#ffe09b', 3, 'center')
  label(g, tr('CHOISISSEZ VOTRE COMBATTANT', 'CHOOSE YOUR FIGHTER'), 240, 43, '#a7b7d8', 1, 'center')
  portrait(g, selected, 83, 186, 1.5, 1, t)
  label(g, p.name, 180, 66, p.color, 3)
  label(g, tr(...p.role), 180, 92, '#dce5f3')
  const names = [tr('VITESSE', 'SPEED'), tr('FRAPPE', 'STRIKE'), tr('BLINDAGE', 'ARMOR')]
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
  label(g, waiting ? tr('EN ATTENTE D’UN ADVERSAIRE…', 'WAITING FOR AN OPPONENT…') : tr('GAUCHE / DROITE : CHOISIR · A : COMBAT', 'LEFT / RIGHT: CHOOSE · A: FIGHT'), 240, 286, waiting ? '#ffe09b' : '#bacfe3', 1, 'center')
}

export class Fight extends FightSimulation {
  draw(g: CanvasRenderingContext2D, t: number) {
    if (this.phase === 'intro') { this.drawVersus(g, t); return }
    const impact = this.sparks.some(s => !s.blocked && s.life > 0.13)
    g.save()
    if (impact) g.translate(Math.floor(Math.sin(t * 80) * 2), 0)
    drawFightStage(g, t)
    this.fighters.forEach((f, i) => {
      disc(g, '#03091ba0', f.x, FLOOR + 4, 22, 4)
      // Reflet au sol, en transparence et en blocs.
      g.save(); g.globalAlpha = 0.09; g.translate(0, FLOOR * 1.4 + 5); g.scale(1, -0.4)
      drawCombatant(g, f, t, i === 1 && f.character === this.fighters[0].character); g.restore()
      drawCombatant(g, f, t, i === 1 && f.character === this.fighters[0].character)
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
    label(g, 'ORBITAL CLASH', 240, 22, '#ffdd96', 2, 'center')
    label(g, tr('HANGAR 07 · DEUX MANCHES GAGNANTES', 'HANGAR 07 · FIRST TO TWO ROUNDS'), 240, 283, '#d6dceb', 1, 'center')
  }
}
export const fightDemo = () => {
  const pair = Math.floor(Math.random() * FIGHT_ROSTER.length)
  const game = new Fight('demo', 3312, [FIGHT_ROSTER[pair].id, FIGHT_ROSTER[(pair + 3) % 6].id])
  return { game, next: () => emptyPad() }
}
