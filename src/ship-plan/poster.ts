import { tr } from '../i18n'
import { deckLabel, deckName, deckNumber, HOLO, planOf, QUARTERS_LEVEL, roomInfo, roomName, SIGN_FONT, ZONE_ORDER, ZONES } from './data'
import { shipStack } from './stack'

/*
 * L'affiche du plan du vaisseau, dessinée au canvas : un écran holographique. Sur le noir de
 * l'écran, les trois ponts empilés à gauche, en traits de lumière, traversés par le faisceau de
 * l'ascenseur ; à droite, le nom de chaque pont et ses pièces à voir, puis la légende des zones ;
 * et la balise « Vous êtes ici » de l'endroit où elle est accrochée. On la lit de près en vue
 * subjective ; de loin, sa pile de ponts lumineuse la fait reconnaître. Le plan détaillé s'ouvre
 * en la consultant (cf. panel.ts).
 */

export const POSTER = { w: 1024, h: 640 }

type Ctx = CanvasRenderingContext2D

/** Halo des traits et des textes : ce qui est dessiné ensuite luit de cette couleur. */
function glow(g: Ctx, color: string | null, blur = 12) {
  g.shadowColor = color ?? 'transparent'
  g.shadowBlur = color ? blur : 0
}

/** Capitales espacées, comme sur les tableaux de bord (l'espacement, là où le navigateur le permet). */
function caps(g: Ctx, spacing: number) {
  ;(g as Ctx & { letterSpacing: string }).letterSpacing = `${spacing}px`
}

function dot(g: Ctx, x: number, y: number, r: number, fill: string) {
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.fillStyle = fill
  g.fill()
}

/** Équerre d'un coin de l'écran : `sx`, `sy` disent vers où elle s'ouvre. */
function bracket(g: Ctx, x: number, y: number, sx: number, sy: number, size = 26) {
  g.beginPath()
  g.moveTo(x + sx * size, y)
  g.lineTo(x, y)
  g.lineTo(x, y + sy * size)
  g.stroke()
}

/**
 * @param here où l'affiche est accrochée (pont, position du jeu) : sa balise « Vous êtes ici »
 */
export function drawPoster(g: Ctx, here?: { level: number; x: number; z: number }) {
  const { w, h } = POSTER

  // L'écran : un noir bleuté, une lueur derrière la pile des ponts, un quadrillage à peine visible.
  const back = g.createLinearGradient(0, 0, 0, h)
  back.addColorStop(0, '#081226')
  back.addColorStop(1, HOLO.deep)
  g.fillStyle = back
  g.fillRect(0, 0, w, h)
  const halo = g.createRadialGradient(250, 370, 20, 250, 370, 420)
  halo.addColorStop(0, 'rgba(70, 150, 255, 0.2)')
  halo.addColorStop(1, 'rgba(70, 150, 255, 0)')
  g.fillStyle = halo
  g.fillRect(0, 0, w, h)
  g.fillStyle = 'rgba(130, 180, 255, 0.055)'
  for (let x = 32; x < w; x += 32) g.fillRect(x, 0, 1, h)
  for (let y = 32; y < h; y += 32) g.fillRect(0, y, w, 1)

  // L'en-tête : le titre, en orange des interfaces d'Elite, et le pont où l'on se trouve.
  g.textBaseline = 'alphabetic'
  g.textAlign = 'left'
  caps(g, 5)
  glow(g, HOLO.accent, 16)
  g.fillStyle = HOLO.accent
  g.font = `700 46px ${SIGN_FONT}`
  g.fillText(tr('PLAN DU VAISSEAU', 'SHIP MAP'), 44, 69)
  if (here) {
    caps(g, 1)
    g.font = `700 23px ${SIGN_FONT}`
    const text = tr(`Vous êtes ici : ${deckLabel(here.level)}`, `You are here: ${deckLabel(here.level)}`)
    const width = g.measureText(text).width + 58
    const x = w - 44 - width
    glow(g, HOLO.accent, 10)
    g.strokeStyle = HOLO.accent
    g.lineWidth = 2
    g.fillStyle = 'rgba(255, 138, 28, 0.13)'
    // Une étiquette aux coins coupés.
    g.beginPath()
    g.moveTo(x + 12, 28)
    g.lineTo(x + width, 28)
    g.lineTo(x + width, 62)
    g.lineTo(x + width - 12, 74)
    g.lineTo(x, 74)
    g.lineTo(x, 40)
    g.closePath()
    g.fill()
    g.stroke()
    dot(g, x + 24, 51, 7, '#ffffff')
    g.fillStyle = '#ffd9b0'
    g.fillText(text, x + 42, 60)
  }
  // Sous le titre : un filet orange, qui se prolonge en un trait fin gradué.
  glow(g, HOLO.accent, 8)
  g.fillStyle = HOLO.accent
  g.fillRect(44, 92, 300, 3)
  glow(g, null)
  g.fillStyle = 'rgba(143, 220, 255, 0.45)'
  g.fillRect(344, 93, w - 388, 1)
  for (let x = 360; x < w - 44; x += 24) g.fillRect(x, 93, 1, (x - 360) % 120 ? 4 : 8)
  caps(g, 0)

  // La pile des ponts.
  const unit = 7.2, gap = 133
  const stack = shipStack(unit, gap)
  const ox = 40, oy = 140
  g.save()
  g.translate(ox, oy)
  g.lineJoin = 'round'
  for (const deck of stack.decks) {
    // La tranche du pont, puis son plancher, translucide.
    g.fillStyle = 'rgba(40, 100, 170, 0.35)'
    g.fill(new Path2D(deck.slab))
    g.fillStyle = 'rgba(10, 26, 50, 0.92)'
    g.fill(new Path2D(deck.hull))
    for (const room of deck.rooms) {
      const path = new Path2D(room.d)
      if (room.hidden) {
        // Une pièce que le plan ne nomme pas : un contour en pointillé, rien dedans.
        g.setLineDash([4, 4])
        g.lineWidth = 1.2
        g.strokeStyle = 'rgba(143, 220, 255, 0.5)'
        g.stroke(path)
        g.setLineDash([])
        continue
      }
      // Plus soutenu que dans la fenêtre du plan : l'affiche se regarde de loin.
      g.fillStyle = `${room.ink}5c`
      g.fill(path, 'evenodd')
      g.lineWidth = 1.3
      g.strokeStyle = `${room.ink}e6`
      g.stroke(path)
    }
    glow(g, '#4fb8ff', 14)
    g.lineWidth = 2.4
    g.strokeStyle = HOLO.line
    g.stroke(new Path2D(deck.hull))
    glow(g, null)
  }
  // Le faisceau de l'ascenseur, d'un pont à l'autre.
  const top = stack.decks[0].lift, bottom = stack.decks[stack.decks.length - 1].lift
  glow(g, '#ffffff', 12)
  const beam = g.createLinearGradient(0, -24, 0, bottom[1])
  beam.addColorStop(0, 'rgba(255, 255, 255, 0)')
  beam.addColorStop(0.12, 'rgba(255, 255, 255, 0.95)')
  beam.addColorStop(1, 'rgba(255, 255, 255, 0.95)')
  g.strokeStyle = beam
  g.lineWidth = 2.5
  g.beginPath()
  g.moveTo(top[0], -24)
  g.lineTo(bottom[0], bottom[1])
  g.stroke()
  for (const deck of stack.decks) {
    dot(g, deck.lift[0], deck.lift[1], 6, HOLO.deep)
    g.lineWidth = 2.2
    g.strokeStyle = '#ffffff'
    g.stroke()
  }
  glow(g, null)
  caps(g, 2)
  g.font = `700 18px ${SIGN_FONT}`
  g.textAlign = 'left'
  g.fillStyle = HOLO.text
  g.fillText(tr('ASCENSEUR', 'LIFT'), top[0] + 12, -8)
  caps(g, 0)
  g.restore()

  // À droite, à la hauteur de chaque pont : son étage, son nom, et ses pièces à voir.
  const colX = 486, blockH = gap
  stack.decks.forEach((deck, i) => {
    const y = 124 + i * blockH
    const plan = planOf(deck.level)
    g.textAlign = 'left'
    glow(g, HOLO.accent, 12)
    g.fillStyle = HOLO.accent
    g.font = `700 52px ${SIGN_FONT}`
    const number = deckNumber(deck.level)
    g.fillText(number, colX, y + 50)
    const nx = colX + g.measureText(number).width + 18
    glow(g, '#4fb8ff', 10)
    caps(g, 3)
    g.fillStyle = HOLO.text
    g.font = `700 31px ${SIGN_FONT}`
    g.fillText(deckName(deck.level).toUpperCase(), nx, y + 47)
    caps(g, 0)
    glow(g, null)

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
      glow(g, r.ink, 8)
      dot(g, x + 8, ry - 7, 6, r.ink)
      glow(g, null)
      g.fillStyle = '#c9dbf4'
      g.fillText(r.name, x + 24, ry)
      rows[row] += r.width + 22
    }
  })

  // La légende des zones, et les quartiers, qui ne sont pas sur le plan.
  const ly = 124 + 3 * blockH + 44
  g.fillStyle = HOLO.rule
  g.fillRect(colX, ly - 30, w - 44 - colX, 1)
  g.font = `600 19px ${SIGN_FONT}`
  ZONE_ORDER.forEach((id, k) => {
    const x = colX + (k % 3) * 168, y = ly + Math.floor(k / 3) * 28
    g.fillStyle = ZONES[id].fill
    g.fillRect(x, y - 15, 20, 17)
    g.lineWidth = 1.5
    g.strokeStyle = ZONES[id].ink
    g.strokeRect(x, y - 15, 20, 17)
    g.fillStyle = HOLO.soft
    g.fillText(ZONES[id].name, x + 28, y, 136)
  })
  g.fillStyle = HOLO.soft
  g.fillText(tr(`${deckLabel(QUARTERS_LEVEL)} : chez vous, par l'ascenseur.`, `${deckLabel(QUARTERS_LEVEL)}: your home, by the lift.`), 44, h - 24)

  // La balise de l'affiche, par-dessus tout : un cœur blanc, deux ondes orange.
  const at = here && stack.at(here.level, here.x, here.z)
  if (at) {
    const x = ox + at[0], y = oy + at[1]
    glow(g, HOLO.accent, 14)
    g.strokeStyle = 'rgba(255, 138, 28, 0.55)'
    g.lineWidth = 2
    g.beginPath()
    g.arc(x, y, 22, 0, Math.PI * 2)
    g.stroke()
    g.strokeStyle = HOLO.accent
    g.lineWidth = 3
    g.beginPath()
    g.arc(x, y, 13, 0, Math.PI * 2)
    g.stroke()
    dot(g, x, y, 6.5, '#ffffff')
    glow(g, null)
  }

  // Le cadre de l'écran : une équerre orange à chaque coin, et la trame de ses lignes.
  g.strokeStyle = HOLO.accent
  g.lineWidth = 3
  bracket(g, 14, 14, 1, 1)
  bracket(g, w - 14, 14, -1, 1)
  bracket(g, 14, h - 14, 1, -1)
  bracket(g, w - 14, h - 14, -1, -1)
  g.fillStyle = 'rgba(0, 0, 0, 0.16)'
  for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1)
}
