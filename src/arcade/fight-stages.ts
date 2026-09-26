import { tr } from '../i18n'
import { pixelText } from './game'
import type { FightStageId } from '../../shared/fight-stages.js'
const FLOOR = 238
const block = (g: CanvasRenderingContext2D, c: string, x: number, y: number, w: number, h: number) => {
  g.fillStyle = c; g.fillRect(Math.round(x / 2) * 2, Math.round(y / 2) * 2, Math.max(2, Math.round(w / 2) * 2), Math.max(2, Math.round(h / 2) * 2))
}
function sky(g: CanvasRenderingContext2D, colors: string[]) {
  colors.forEach((c, i) => block(g, c, 0, i * 240 / colors.length, 480, 240 / colors.length + 2))
}
function floor(g: CanvasRenderingContext2D, color: string, edge: string, lines: string) {
  block(g, edge, 0, FLOOR, 480, 4); block(g, color, 0, FLOOR + 4, 480, 58)
  for (let y = 248; y < 300; y += 12) {
    block(g, lines, 0, y, 480, 2)
    for (let x = (y % 24 ? 0 : 24); x < 480; x += 48) block(g, lines, x, y + 2, 2, 10)
  }
}
function sign(g: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  g.fillStyle = '#10182c'; pixelText(g, text, x + 1, y + 1, 1, 'center')
  g.fillStyle = color; pixelText(g, text, x, y, 1, 'center')
}
function rooftop(g: CanvasRenderingContext2D, t: number) {
  sky(g, ['#11182f', '#182542', '#263c59', '#405b6d'])
  block(g, '#c0d3ce', 354, 49, 30, 22); block(g, '#263b55', 350, 45, 24, 18)
  for (let i = 0; i < 18; i++) {
    const x = i * 29 - 10, top = 80 + i * 23 % 84
    block(g, i % 2 ? '#1c2941' : '#22344d', x, top, 26, 160)
    block(g, '#52657d', x + 10, top - 15, 2, 15)
    for (let y = top + 8; y < 220; y += 12) for (let xx = x + 4; xx < x + 23; xx += 8)
      block(g, (i + y + xx) % 3 ? '#637c86' : '#edc67d', xx, y, 4, 6)
  }
  // Les derniers trains traversent la ville derrière la terrasse.
  const train = (t * 20) % 700 - 180
  block(g, '#5b6c83', 0, 167, 480, 6)
  for (let i = 0; i < 3; i++) {
    block(g, '#b2bbb5', train + i * 55, 154, 51, 12)
    for (let x = 5; x < 48; x += 10) block(g, '#ffd78d', train + i * 55 + x, 156, 6, 4)
  }
  block(g, '#313345', 0, 210, 480, 28); block(g, '#7e8891', 0, 208, 480, 4)
  for (let x = 8; x < 480; x += 34) block(g, '#555b6c', x, 212, 2, 26)
  for (const x of [18, 408]) {
    block(g, '#404e60', x, 182, 56, 54); block(g, '#9cacb4', x - 2, 181, 60, 4)
    for (let y = 193; y < 224; y += 6) block(g, '#182e40', x + 7, y, 42, 2)
  }
  block(g, '#211d39', 162, 181, 155, 21)
  sign(g, tr('CLUB MINUIT', 'MIDNIGHT CLUB'), 240, 188, '#fa86c0')
  floor(g, '#273549', '#a3bec4', '#405268')
  for (let y = 246; y < 300; y += 8) block(g, '#ec83b12c', 194 - (y - 240) / 2, y, 88 + y - 240, 2)
  // Pluie régulière, dessinée derrière les combattants ; aucune variation du terrain.
  for (let i = 0; i < 85; i++) {
    const y = (i * 37 + t * 115) % 290, x = (i * 67 - t * 28 % 480 + 480) % 480
    block(g, '#b4d8ec44', x, y, 2, 8)
  }
}
function harbor(g: CanvasRenderingContext2D, t: number) {
  sky(g, ['#58394f', '#9f5260', '#de806b', '#f4b279', '#ffe0a1'])
  for (let y = -22; y <= 22; y += 2) {
    const w = Math.sqrt(22 * 22 - y * y)
    block(g, '#ffe8ae', 350 - w, 123 + y, w * 2, 2)
  }
  block(g, '#4b757f', 0, 156, 480, 83)
  for (let i = 0; i < 52; i++) {
    const y = 161 + i * 7 % 68, x = (i * 83 + t * (i % 2 ? 5 : -5) + 480) % 480
    block(g, i % 3 ? '#81a7a2' : '#e5c18d', x, y, 12 + i % 4 * 8, 2)
  }
  // Cargo, mâts et grues à conteneurs, tous dessinés en pixels.
  block(g, '#35354b', 66, 164, 238, 25); block(g, '#dab594', 214, 144, 49, 20)
  block(g, '#4f4355', 232, 130, 12, 14)
  for (let x = 80; x < 210; x += 33) {
    block(g, x % 2 ? '#99815f' : '#af6560', x, 143, 30, 19)
    for (let xx = x + 3; xx < x + 29; xx += 6) block(g, '#714e51', xx, 145, 2, 15)
  }
  for (const x of [28, 417]) {
    block(g, '#443e51', x, 83, 8, 152); block(g, '#443e51', x - 14, 83, 62, 6)
    block(g, '#726166', x + 40, 89, 2, 52); block(g, '#433749', x + 36, 137, 10, 6)
  }
  block(g, '#806854', 0, 214, 480, 24)
  for (let x = 0; x < 480; x += 48) { block(g, '#423e43', x + 4, 205, 8, 32); block(g, '#bfa887', x + 2, 204, 12, 4) }
  for (let x = 0; x < 480; x += 4) block(g, '#c7af8b', x, 210 + Math.sin(x / 48 * Math.PI) * 3, 4, 2)
  for (const x of [5, 437]) {
    block(g, '#ac815d', x, 217, 36, 19); block(g, '#4e4647', x + 16, 217, 3, 19)
    block(g, '#dab58a', x, 217, 36, 3)
  }
  floor(g, '#6c5753', '#e9c59b', '#8d6e60')
  sign(g, tr('PORT DU SOLEIL', 'SUNSET HARBOR'), 240, 218, '#ffe3ae')
  for (let i = 0; i < 4; i++) {
    const x = (i * 137 + t * 13) % 480, y = 76 + i * 11
    block(g, '#594351', x, y, 6, 2); block(g, '#594351', x + 6, y + 2, 6, 2)
  }
}
function temple(g: CanvasRenderingContext2D, t: number) {
  sky(g, ['#27304c', '#4f586e', '#849092', '#b5b8a3'])
  for (const [peak, height, color] of [[90, 100, '#657487'], [380, 125, '#57677e'], [250, 90, '#73838b']] as const) {
    for (let y = 0; y < height; y += 2) {
      const w = y * 1.18
      block(g, color, peak - w, 70 + y, w * 2, 2)
      if (y < 26) block(g, '#d7d7c8', peak - w * 0.7, 70 + y, w * 1.3, 2)
    }
  }
  for (let i = 0; i < 22; i++) {
    const x = i * 24 - 5, y = 140 + i * 17 % 25
    block(g, '#384e52', x, y, 4, 90)
    for (let h = 0; h < 40; h += 6) block(g, '#425e5c', x - h / 2, y + h, h + 6, 5)
  }
  block(g, '#8f7768', 80, 160, 320, 78); block(g, '#564d50', 92, 174, 296, 56)
  // Toiture courbe et colonnes du dojo de montagne.
  for (let y = 0; y < 32; y += 2) block(g, y % 6 ? '#405958' : '#84968a', 58 + y * 2, 128 + y, 364 - y * 4, 2)
  block(g, '#b39774', 74, 160, 332, 6)
  for (const x of [92, 160, 312, 380]) { block(g, '#a35e53', x, 165, 9, 69); block(g, '#dda781', x, 169, 2, 59) }
  for (let x = 176; x < 305; x += 20) {
    block(g, '#d1ba92', x, 176, 18, 53)
    for (let y = 180; y < 228; y += 12) block(g, '#8c806c', x, y, 18, 2)
  }
  for (const x of [42, 429]) {
    block(g, '#7e8b80', x, 213, 12, 25); block(g, '#7e8b80', x - 4, 185, 20, 30)
    block(g, '#ffe0a0', x, 190, 12, 17); block(g, '#596b67', x - 8, 183, 28, 4)
    block(g, '#687b71', x - 2, 178, 16, 5)
  }
  floor(g, '#586662', '#b6bba2', '#758279')
  sign(g, tr('TEMPLE DES CIMES', 'MOUNTAIN TEMPLE'), 240, 164, '#ffdfab')
  // Pétales portés par le vent.
  for (let i = 0; i < 22; i++) {
    const x = (i * 91 + t * 22) % 510 - 15, y = (i * 41 + t * 12) % 225 + 45
    block(g, i % 2 ? '#e6a9b9' : '#f5d0c9', x, y + Math.sin(t * 2 + i) * 5, 4, 2)
  }
}
export function drawAlternateStage(g: CanvasRenderingContext2D, t: number, stage: FightStageId) {
  if (stage === 'rooftop') rooftop(g, t)
  else if (stage === 'harbor') harbor(g, t)
  else temple(g, t)
}
