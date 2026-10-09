import { tr } from '../i18n'
import { deckLabel, deckName, deckNumber, planOf, QUARTERS_LEVEL, roomInfo, roomName, SHEET, SIGN_FONT, ZONE_ORDER, ZONES } from './data'
import { shipStack } from './stack'

/*
 * L'affiche du plan du vaisseau, dessinée au canvas : les trois ponts empilés à gauche, le nom de
 * chacun et ses pièces à voir à droite, la légende des zones, et le repère « Vous êtes ici » de
 * l'endroit où elle est accrochée. On la lit de près en vue subjective ; de loin, sa feuille claire
 * et sa pile de ponts la font reconnaître. Le plan détaillé s'ouvre en la consultant (cf. panel.ts).
 */

export const POSTER = { w: 1024, h: 640 }

type Ctx = CanvasRenderingContext2D

/** Hachures d'une pièce que le plan ne nomme pas. */
function hatch(g: Ctx): CanvasPattern {
  const c = document.createElement('canvas')
  c.width = c.height = 8
  const p = c.getContext('2d')!
  p.fillStyle = '#dde3e8'
  p.fillRect(0, 0, 8, 8)
  p.strokeStyle = SHEET.hatch
  p.lineWidth = 1.6
  p.beginPath()
  for (const o of [-8, 0, 8]) {
    p.moveTo(o, 8)
    p.lineTo(o + 8, 0)
  }
  p.stroke()
  return g.createPattern(c, 'repeat')!
}

function dot(g: Ctx, x: number, y: number, r: number, fill: string, ring?: string) {
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.fillStyle = fill
  g.fill()
  if (ring) {
    g.lineWidth = r * 0.42
    g.strokeStyle = ring
    g.stroke()
  }
}

/**
 * @param here où l'affiche est accrochée (pont, position du jeu) : son repère « Vous êtes ici »
 */
export function drawPoster(g: Ctx, here?: { level: number; x: number; z: number }) {
  const { w, h } = POSTER
  g.fillStyle = SHEET.paper
  g.fillRect(0, 0, w, h)

  // L'en-tête : un bandeau d'encre, qu'on reconnaît de loin, le titre, et le pont où l'on se trouve.
  g.fillStyle = SHEET.ink
  g.fillRect(0, 0, w, 100)
  g.textBaseline = 'alphabetic'
  g.textAlign = 'left'
  g.fillStyle = '#ffffff'
  g.font = `700 58px ${SIGN_FONT}`
  g.fillText(tr('Plan du vaisseau', 'Ship map'), 44, 71)
  if (here) {
    const where = deckLabel(here.level)
    g.font = `700 27px ${SIGN_FONT}`
    const text = tr(`Vous êtes ici : ${where}`, `You are here: ${where}`)
    const width = g.measureText(text).width + 62
    g.fillStyle = SHEET.here
    g.beginPath()
    g.roundRect(w - 40 - width, 28, width, 46, 23)
    g.fill()
    dot(g, w - 40 - width + 25, 51, 8, '#ffffff')
    g.fillStyle = '#ffffff'
    g.fillText(text, w - 40 - width + 44, 60)
  }

  // La pile des ponts.
  const unit = 7.2, gap = 133
  const stack = shipStack(unit, gap)
  const ox = 40, oy = 136
  g.save()
  g.translate(ox, oy)
  for (const deck of stack.decks) {
    g.fillStyle = '#9aa6b4'
    g.fill(new Path2D(deck.slab))
    g.fillStyle = '#f7f9fa'
    g.fill(new Path2D(deck.hull))
    for (const room of deck.rooms) {
      const path = new Path2D(room.d)
      g.fillStyle = room.hidden ? hatch(g) : room.fill
      g.fill(path, 'evenodd')
      g.lineWidth = 1.2
      g.strokeStyle = 'rgba(23, 35, 56, 0.55)'
      g.stroke(path)
    }
    g.lineWidth = 2.6
    g.lineJoin = 'round'
    g.strokeStyle = SHEET.ink
    g.stroke(new Path2D(deck.hull))
  }
  // L'ascenseur, d'un pont à l'autre.
  const top = stack.decks[0].lift, bottom = stack.decks[stack.decks.length - 1].lift
  g.setLineDash([7, 6])
  g.lineWidth = 3
  g.strokeStyle = SHEET.ink
  g.beginPath()
  g.moveTo(top[0], -14)
  g.lineTo(bottom[0], bottom[1])
  g.stroke()
  g.setLineDash([])
  for (const deck of stack.decks) dot(g, deck.lift[0], deck.lift[1], 5.5, '#ffffff', SHEET.ink)
  g.font = `700 20px ${SIGN_FONT}`
  g.textAlign = 'left'
  g.fillStyle = SHEET.ink
  g.fillText(tr('Ascenseur', 'Lift'), top[0] + 10, -4)
  g.restore()

  // À droite, à la hauteur de chaque pont : son étage, son nom, et ses pièces à voir.
  const colX = 486, blockH = gap
  stack.decks.forEach((deck, i) => {
    const y = 124 + i * blockH
    const plan = planOf(deck.level)
    g.textAlign = 'left'
    g.fillStyle = SHEET.ink
    g.font = `700 50px ${SIGN_FONT}`
    const number = deckNumber(deck.level)
    g.fillText(number, colX, y + 50)
    const nx = colX + g.measureText(number).width + 16
    g.font = `700 36px ${SIGN_FONT}`
    g.fillText(deckName(deck.level), nx, y + 48)

    // Ses pièces à voir, chacune avec la pastille de sa zone : les plus longs noms d'abord, chaque
    // nom sur la première ligne où il tient, pour en remplir le moins possible.
    g.font = `600 22px ${SIGN_FONT}`
    const stars = plan.rooms.filter((r) => roomInfo(deck.level, r.id).star)
      .map((r) => ({ name: roomName(deck.level, r.id), ink: ZONES[roomInfo(deck.level, r.id).zone].ink }))
      .map((r) => ({ ...r, width: 24 + g.measureText(r.name).width }))
      .sort((a, b) => b.width - a.width)
    const rows: number[] = []
    for (const r of stars) {
      let row = rows.findIndex((used) => used + r.width <= w - 44 - colX)
      if (row < 0) row = rows.push(0) - 1
      const x = colX + rows[row], ry = y + 80 + row * 27
      dot(g, x + 8, ry - 7, 7, r.ink)
      g.fillStyle = SHEET.ink
      g.fillText(r.name, x + 24, ry)
      rows[row] += r.width + 22
    }
  })

  // La légende des zones, et les quartiers, qui ne sont pas sur le plan.
  const ly = 124 + 3 * blockH + 44
  g.fillStyle = SHEET.rule
  g.fillRect(colX, ly - 30, w - 44 - colX, 2)
  g.font = `600 19px ${SIGN_FONT}`
  ZONE_ORDER.forEach((id, k) => {
    const x = colX + (k % 3) * 168, y = ly + Math.floor(k / 3) * 28
    g.fillStyle = ZONES[id].fill
    g.fillRect(x, y - 15, 20, 17)
    g.lineWidth = 1.5
    g.strokeStyle = ZONES[id].ink
    g.strokeRect(x, y - 15, 20, 17)
    g.fillStyle = SHEET.soft
    g.fillText(ZONES[id].name, x + 28, y, 136)
  })
  g.fillStyle = SHEET.soft
  g.font = `600 19px ${SIGN_FONT}`
  g.textAlign = 'left'
  g.fillText(tr(`${deckLabel(QUARTERS_LEVEL)} : chez vous, par l'ascenseur.`, `${deckLabel(QUARTERS_LEVEL)}: your home, by the lift.`), 44, h - 22)

  // Le repère de l'affiche, par-dessus tout.
  const at = here && stack.at(here.level, here.x, here.z)
  if (at) {
    const x = ox + at[0], y = oy + at[1]
    dot(g, x, y, 17, 'rgba(229, 64, 28, 0.25)')
    dot(g, x, y, 9, SHEET.here, '#ffffff')
  }
}
