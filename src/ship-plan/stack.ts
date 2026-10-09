import { LIFT } from '../levels'
import type { ShipMap } from '../map'
import { PLAN_LEVELS, planOf, roomInfo, SHEET, ZONES } from './data'
import { isoPoint, pathOf, roomOpen, type Point } from './geometry'

/*
 * La pile des ponts : les trois ponts du plan vus en perspective, l'un au-dessus de l'autre, comme
 * dans le jeu, et traversés par l'ascenseur. C'est le dessin de l'affiche (au canvas, cf.
 * poster.ts) et celui du sélecteur de pont de la fenêtre (en SVG, cf. panel.ts) : les deux lisent
 * les mêmes chemins.
 */

/** Les ponts font au plus 40 × 17 tuiles : la pile est calée sur cette boîte, pour qu'ils s'alignent. */
const SPAN = { w: 40, h: 17 }

export interface StackDeck {
  level: number
  /** Tranche du pont (son épaisseur), dessous, puis sa coque. */
  slab: string
  hull: string
  rooms: { id: string; d: string; fill: string; hidden: boolean }[]
  /** L'ascenseur sur ce pont, et la pointe de sa proue. */
  lift: Point
  bow: Point
}

export interface Stack {
  width: number
  height: number
  decks: StackDeck[]
  /** Un point du pont `level` (position du jeu) dans le dessin. */
  at(level: number, x: number, z: number): Point | null
}

/**
 * @param unit largeur d'une tuile dans le dessin
 * @param gap écart vertical entre deux ponts
 * @param mapOf plan vivant d'un pont (portes ouvertes au joueur) ; par défaut, le plan de départ
 */
export function shipStack(unit: number, gap: number, mapOf?: (level: number) => ShipMap | undefined): Stack {
  const thickness = unit * 0.9
  const left = SPAN.h * 0.866 * unit
  const origin = (i: number): Point => [left, i * gap]
  const project = (i: number) => (p: Point): Point => {
    const [x, y] = isoPoint(p, unit)
    const [ox, oy] = origin(i)
    return [x + ox, y + oy]
  }
  const decks = PLAN_LEVELS.map((level, i): StackDeck => {
    const plan = planOf(level, mapOf?.(level))
    const to = project(i)
    const maxX = Math.max(...plan.rooms.flatMap((r) => r.tiles.map(([x]) => x))) + 1
    const bowZ = plan.rooms.flatMap((r) => r.tiles).filter(([x]) => x + 1 === maxX).map(([, z]) => z + 0.5)
    return {
      level,
      slab: pathOf(plan.hull, (p) => { const [x, y] = to(p); return [x, y + thickness] }),
      hull: pathOf(plan.hull, to),
      rooms: plan.rooms.map((r) => {
        const info = roomInfo(level, r.id)
        const hidden = !!info.secret && !roomOpen(plan, r.id)
        return { id: r.id, d: pathOf(r.loops, to), fill: hidden ? SHEET.rule : ZONES[info.zone].fill, hidden }
      }),
      lift: to([LIFT.x + 0.5, LIFT.z + 0.5]),
      bow: to([maxX, bowZ.reduce((a, b) => a + b, 0) / bowZ.length]),
    }
  })
  return {
    width: (SPAN.w + SPAN.h) * 0.866 * unit,
    height: (SPAN.w + SPAN.h) * 0.5 * unit + thickness + gap * (PLAN_LEVELS.length - 1),
    decks,
    at(level, x, z) {
      const i = PLAN_LEVELS.indexOf(level)
      return i < 0 ? null : project(i)([x + 0.5, z + 0.5])
    },
  }
}
