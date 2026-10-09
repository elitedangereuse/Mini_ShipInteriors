import type { GameEmbed } from '../game-embed'
import { tr } from '../i18n'
import { LIFT } from '../levels'
import type { ShipMap } from '../map'
import { deckLabel, deckName, deckNumber, liftTo, PLAN_LEVELS, planAreas, planOf, QUARTERS_LEVEL, roomInfo, roomName, SIGN_FONT, ZONE_ORDER, ZONES } from './data'
import { pathOf, roomOpen, type DeckPlan, type PlanRoom } from './geometry'
import { shipStack } from './stack'

/*
 * Le plan détaillé du vaisseau, ouvert en consultant une de ses affiches (cf.
 * src/furniture/wayfinding.ts) : l'écran holographique de l'affiche, en grand. À gauche, les trois ponts,
 * du plus haut au plus bas ; au milieu, le pont choisi à plat, le nom de chaque pièce dans la
 * pièce, ses portes, l'ascenseur et le repère du joueur ; dessous, la fiche de la pièce survolée
 * ou choisie (ce qu'on y fait, comment on y entre, comment on y va) et l'index des pièces du
 * pont, rangées par zone, qui sert aussi de légende.
 *
 * Au clavier : flèches haut et bas (ou page précédente, suivante) pour changer de pont,
 * Tab pour parcourir les pièces, E ou Échap pour fermer.
 */

const SVG = 'http://www.w3.org/2000/svg'

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, ...children: (Node | string)[]): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
  e.append(...children)
  return e
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (className) e.className = className
  if (text !== undefined) e.textContent = text
  return e
}

/** Marge du plan à plat autour du pont, en tuiles. */
const PAD = 0.7
/** Tailles possibles du nom d'une pièce, en tuiles, de la plus grande à la plus petite. */
const LABEL_SIZES = [0.7, 0.58, 0.48, 0.41]

let ruler: CanvasRenderingContext2D | null = null
/** Largeur d'un texte en tuiles, écrit à la taille `size`. */
function textWidth(text: string, size: number): number {
  ruler ??= document.createElement('canvas').getContext('2d')!
  ruler.font = `700 100px ${SIGN_FONT}`
  // Les noms sont espacés (cf. `.plan-label` dans plan.css) : 0,04 de la taille par lettre.
  return (ruler.measureText(text).width / 100 + text.length * 0.04) * size
}

/**
 * Le nom d'une pièce, coupé en lignes pour tenir dans `w` × `h` tuiles : la plus grande taille
 * possible, sur le moins de lignes possible. `null` : il ne tient pas.
 */
function fitLabel(name: string, w: number, h: number): { size: number; lines: string[] } | null {
  const words = name.split(' ')
  for (const size of LABEL_SIZES) {
    const maxLines = Math.min(words.length, Math.floor(h / (size * 1.12)))
    for (let n = 1; n <= maxLines; n++) {
      // On remplit chaque ligne tant qu'elle tient ; il faut finir en `n` lignes.
      const lines: string[] = []
      let line = ''
      for (const word of words) {
        const next = line ? `${line} ${word}` : word
        if (line && textWidth(next, size) > w) {
          lines.push(line)
          line = word
        } else line = next
      }
      lines.push(line)
      if (lines.length <= n && lines.every((l) => textWidth(l, size) <= w)) return { size, lines }
    }
  }
  return null
}

export interface ShipPlanHost {
  /** Le plan vivant d'un pont : ses portes telles qu'elles sont pour le joueur. */
  map(level: number): ShipMap | undefined
  /** Où est le joueur (pont et position du jeu). */
  where(): { level: number; x: number; z: number }
  /** Titre de la quête qui ouvre cette pièce, si elle en attend une. */
  questTitle?(level: number, room: string): string | null
}

export class ShipPlanPanel {
  private body = el('div', 'plan')
  private hereLine = el('p', 'plan-here')
  private rail = el('nav', 'plan-rail')
  private deckTitle = el('h3', 'plan-deck-name')
  private sheet = el('div', 'plan-sheet')
  private card = el('section', 'plan-card')
  private index = el('section', 'plan-index')
  private level = 0
  private selected: string | null = null
  private hot: string | null = null
  private plans = new Map<number, DeckPlan>()
  private here = { level: 0, x: 0, z: 0 }
  /** Le contour épais de la pièce choisie, par-dessus le plan, et les contours des pièces du pont affiché. */
  private outline = svg('path', { class: 'plan-outline' })
  private shapes = new Map<string, string>()

  constructor(private embed: GameEmbed, private host: ShipPlanHost) {
    const head = el('header', 'plan-head')
    const close = el('button', 'plan-close', '×')
    close.type = 'button'
    close.setAttribute('aria-label', tr('Fermer le plan', 'Close the map'))
    close.onclick = () => this.embed.close()
    head.append(el('h2', '', tr('Plan du vaisseau', 'Ship map')), this.hereLine, close)
    this.rail.setAttribute('aria-label', tr('Ponts', 'Decks'))
    const main = el('div', 'plan-main')
    const deckHead = el('div', 'plan-deck-head')
    deckHead.append(this.deckTitle, el('span', 'plan-axis', tr('Poupe à gauche, proue à droite', 'Stern on the left, bow on the right')))
    this.card.setAttribute('aria-live', 'polite')
    const below = el('div', 'plan-below')
    below.append(this.card, this.index)
    main.append(deckHead, this.sheet, below)
    const layout = el('div', 'plan-body')
    layout.append(this.rail, main)
    this.body.append(head, layout)
    this.body.addEventListener('keydown', (e) => this.onKey(e))
  }

  open() {
    this.here = this.host.where()
    this.plans.clear()
    for (const level of PLAN_LEVELS) this.plans.set(level, planOf(level, this.host.map(level)))
    // Le pont où l'on est ; depuis les quartiers, le pont principal, d'où tout part.
    this.level = PLAN_LEVELS.includes(this.here.level) ? this.here.level : 0
    this.selected = this.roomAt(this.here)
    this.hot = null
    const room = this.selected ? this.shownName(this.here.level, this.selected) : ''
    const deck = deckLabel(this.here.level)
    this.hereLine.replaceChildren(el('i', 'plan-pin'), room ? tr(`Vous êtes ici : ${deck}, ${room}.`, `You are here: ${deck}, ${room}.`) : tr(`Vous êtes ici : ${deck}.`, `You are here: ${deck}.`))
    this.renderRail()
    this.renderDeck()
    this.embed.openPanel({ kicker: '', title: tr('Plan du vaisseau', 'Ship map'), hint: '', body: this.body, bare: true, skin: 'plan-window' })
  }

  /** La pièce du plan où se tient le joueur, s'il est sur un des ponts du plan. */
  private roomAt(p: { level: number; x: number; z: number }): string | null {
    return this.plans.has(p.level) ? this.host.map(p.level)?.room(Math.round(p.x), Math.round(p.z)) ?? null : null
  }

  /** Une pièce cachée, tant qu'elle est fermée au joueur : le plan ne la nomme pas. */
  private hidden(level: number, room: string): boolean {
    return !!roomInfo(level, room).secret && !roomOpen(this.plans.get(level)!, room)
  }

  private shownName(level: number, room: string): string {
    return this.hidden(level, room) ? tr('Zone non répertoriée', 'Uncharted area') : roomName(level, room)
  }

  private onKey(e: KeyboardEvent) {
    if (e.repeat) return
    const step = e.code === 'ArrowUp' || e.code === 'PageUp' ? -1 : e.code === 'ArrowDown' || e.code === 'PageDown' ? 1 : 0
    if (step) {
      e.preventDefault()
      const next = PLAN_LEVELS[PLAN_LEVELS.indexOf(this.level) + step]
      if (next !== undefined) this.showDeck(next, true)
    } else if (e.code === 'KeyE') {
      e.preventDefault()
      this.embed.close()
    }
  }

  private showDeck(level: number, focus = false) {
    if (level === this.level) return
    this.level = level
    this.selected = level === this.here.level ? this.roomAt(this.here) : null
    this.hot = null
    this.renderRail()
    this.renderDeck()
    if (focus) this.rail.querySelector<HTMLElement>('[aria-current]')?.focus()
  }

  // ---------------------------------------------------------------- les ponts, à gauche

  private renderRail() {
    const unit = 3.5
    const stack = shipStack(unit, 0, (level) => this.host.map(level))
    const list = el('ol', 'plan-decks')
    for (const deck of stack.decks) {
      const current = deck.level === this.level
      const b = el('button', 'plan-deck')
      b.type = 'button'
      if (current) {
        b.setAttribute('aria-current', 'true')
        b.dataset.autofocus = ''
      }
      b.onclick = () => this.showDeck(deck.level, true)
      const art = svg('svg', { viewBox: `-2 -2 ${stack.width + 4} ${stack.height + 4}`, 'aria-hidden': 'true' })
      art.append(svg('path', { d: deck.slab, class: 'plan-slab' }), svg('path', { d: deck.hull, class: 'plan-plate' }))
      // Une pièce que le plan ne nomme pas : un contour en pointillé, rien dedans.
      for (const room of deck.rooms) {
        art.append(room.hidden
          ? svg('path', { d: room.d, class: 'plan-plate-room is-hidden' })
          : svg('path', { d: room.d, fill: room.fill, stroke: room.ink, 'fill-rule': 'evenodd', class: 'plan-plate-room' }))
      }
      art.append(svg('path', { d: deck.hull, class: 'plan-plate-edge' }))
      art.append(svg('circle', { cx: deck.lift[0], cy: deck.lift[1], r: 2.6, class: 'plan-plate-lift' }))
      const at = this.here.level === deck.level ? stack.at(deck.level, this.here.x, this.here.z) : null
      if (at) art.append(svg('circle', { cx: at[0], cy: at[1], r: 4.2, class: 'plan-plate-here' }))
      const name = el('span', 'plan-deck-label')
      name.append(el('b', '', deckNumber(deck.level)), deckName(deck.level))
      if (this.here.level === deck.level) name.append(el('small', '', tr('Vous êtes ici', 'You are here')))
      b.append(art, name)
      const item = el('li')
      item.append(b)
      list.append(item)
    }
    const quarters = el('p', 'plan-quarters')
    quarters.append(el('b', '', deckNumber(QUARTERS_LEVEL)), tr(`${deckName(QUARTERS_LEVEL)} : chez vous, par l'ascenseur.`, `${deckName(QUARTERS_LEVEL)}: your home, by the lift.`))
    if (this.here.level === QUARTERS_LEVEL) quarters.append(el('small', '', tr('Vous êtes ici', 'You are here')))
    this.rail.replaceChildren(quarters, list)
  }

  // ---------------------------------------------------------------- le pont choisi, à plat

  private renderDeck() {
    const level = this.level
    const plan = this.plans.get(level)!
    this.deckTitle.replaceChildren(el('b', '', deckNumber(level)), deckName(level))

    const map = svg('svg', { class: 'plan-map', viewBox: `${-PAD} ${-PAD} ${plan.width + PAD * 2} ${plan.height + PAD * 2}`, role: 'img', 'aria-label': tr(`Plan du pont : ${deckName(level)}`, `Deck map: ${deckName(level)}`) })
    // Les trames : une pièce que le plan ne nomme pas (des traits froids), une pièce fermée au joueur (des traits rouges).
    map.append(svg('defs', {},
      svg('pattern', { id: 'plan-hatch', width: 0.5, height: 0.5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(-45)' },
        svg('rect', { width: 0.5, height: 0.5, fill: 'rgba(143, 220, 255, 0.04)' }), svg('rect', { width: 0.5, height: 0.06, fill: 'rgba(143, 220, 255, 0.3)' })),
      svg('pattern', { id: 'plan-lock', width: 0.42, height: 0.42, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(-45)' },
        svg('rect', { width: 0.42, height: 0.05, fill: 'rgba(255, 90, 74, 0.38)' })),
    ))
    map.append(svg('path', { d: pathOf(plan.hull), class: 'plan-hull' }))

    const rooms = svg('g')
    const marks = svg('g', { class: 'plan-marks' })
    this.shapes.clear()
    for (const room of plan.rooms) {
      const hidden = this.hidden(level, room.id)
      const open = roomOpen(plan, room.id)
      const d = pathOf(room.loops)
      this.shapes.set(room.id, d)
      const zone = ZONES[roomInfo(level, room.id).zone]
      const shape = svg('path', { d, 'fill-rule': 'evenodd', fill: hidden ? 'url(#plan-hatch)' : zone.fill, stroke: hidden ? 'rgba(143, 220, 255, 0.55)' : zone.ink, class: hidden ? 'plan-room is-hidden' : open ? 'plan-room' : 'plan-room is-closed', 'data-room': room.id })
      shape.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') this.heat(room.id) })
      shape.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') this.heat(null) })
      shape.addEventListener('click', () => this.select(room.id))
      rooms.append(shape)
      // Une pièce fermée au joueur : voilée de fines rayures.
      if (!open && !hidden) marks.append(svg('path', { d, 'fill-rule': 'evenodd', fill: 'url(#plan-lock)' }))
      marks.append(this.label(level, room, hidden, open))
    }
    for (const area of planAreas(level)) {
      marks.append(svg('text', { x: (area.minX + area.maxX + 1) / 2, y: (area.minZ + area.maxZ + 1) / 2, 'font-size': 0.44, class: 'plan-area' }, area.name.toUpperCase()))
    }
    map.append(rooms, marks)

    // Les portes : une ouverture dans le mur ; un trait rouge si elle ne s'ouvre pas au joueur.
    const doors = svg('g', { class: 'plan-doors' })
    for (const door of plan.doors) {
      const half = 0.3
      const [x1, y1, x2, y2] = door.alongX ? [door.x - half, door.z, door.x + half, door.z] : [door.x, door.z - half, door.x, door.z + half]
      doors.append(svg('line', { x1, y1, x2, y2, class: door.locked ? 'plan-door is-locked' : 'plan-door' }))
    }
    map.append(this.outline, doors)

    // L'ascenseur, au même endroit sur chaque pont.
    const lx = LIFT.x + 0.5, lz = LIFT.z + 0.5
    map.append(svg('g', { class: 'plan-lift' },
      svg('rect', { x: lx - 0.4, y: lz - 0.4, width: 0.8, height: 0.8, rx: 0.12 }),
      svg('path', { d: `M${lx} ${lz - 0.27}l0.17 0.2h-0.34zM${lx} ${lz + 0.27}l0.17 -0.2h-0.34z` }),
      svg('title', {}, tr('Ascenseur', 'Lift')),
    ))

    if (this.here.level === level) {
      const x = this.here.x + 0.5, z = this.here.z + 0.5
      map.append(svg('g', { class: 'plan-you' },
        svg('circle', { cx: x, cy: z, r: 0.34, class: 'plan-you-ring' }),
        svg('circle', { cx: x, cy: z, r: 0.3, class: 'plan-you-dot' }),
        svg('title', {}, tr('Vous êtes ici', 'You are here')),
      ))
    }
    this.sheet.replaceChildren(map)
    this.renderIndex()
    this.renderCard()
    this.paint()
  }

  /** Le nom d'une pièce, dans la pièce ; un cadenas s'il faut, quand elle est fermée au joueur. */
  private label(level: number, room: PlanRoom, hidden: boolean, open: boolean): SVGElement {
    const { x, z, w, h } = room.label
    const g = svg('g', { class: hidden ? 'plan-label is-hidden' : 'plan-label' })
    const cx = x + w / 2
    let cy = z + h / 2
    if (hidden) {
      g.append(svg('text', { x: cx, y: cy, 'font-size': 0.9 }, '?'))
      return g
    }
    const lock = !open
    const fit = fitLabel(roomName(level, room.id).toUpperCase(), w - 0.36, h - 0.2 - (lock ? 0.5 : 0))
    if (fit) {
      const lineH = fit.size * 1.1
      if (lock) cy += 0.28
      fit.lines.forEach((line, i) => g.append(svg('text', { x: cx, y: cy + (i - (fit.lines.length - 1) / 2) * lineH, 'font-size': fit.size }, line)))
      cy -= (fit.lines.length * lineH) / 2 + 0.3
    }
    if (lock) {
      // Le cadenas : son anse, son corps.
      g.append(svg('g', { class: 'plan-padlock', transform: `translate(${cx} ${cy})` },
        svg('path', { d: 'M-0.13 -0.02v-0.1a0.13 0.13 0 0 1 0.26 0v0.1' }),
        svg('rect', { x: -0.19, y: -0.02, width: 0.38, height: 0.3, rx: 0.05 }),
      ))
    }
    return g
  }

  // ---------------------------------------------------------------- l'index et la fiche

  private renderIndex() {
    const level = this.level
    const plan = this.plans.get(level)!
    const groups = ZONE_ORDER.map((zone) => ({ zone, rooms: plan.rooms.filter((r) => roomInfo(level, r.id).zone === zone && !this.hidden(level, r.id)) })).filter((g) => g.rooms.length)
    this.index.replaceChildren(...groups.map(({ zone, rooms }) => {
      const group = el('div', 'plan-zone')
      const title = el('h4')
      const swatch = el('i')
      swatch.style.background = ZONES[zone].fill
      swatch.style.borderColor = ZONES[zone].ink
      title.append(swatch, ZONES[zone].name)
      const list = el('ul')
      for (const room of rooms.sort((a, b) => roomName(level, a.id).localeCompare(roomName(level, b.id)))) {
        const b = el('button', '', roomName(level, room.id))
        b.type = 'button'
        b.dataset.room = room.id
        b.onclick = () => this.select(room.id)
        b.onpointerenter = (e) => { if (e.pointerType === 'mouse') this.heat(room.id) }
        b.onpointerleave = (e) => { if (e.pointerType === 'mouse') this.heat(null) }
        b.onfocus = () => this.heat(room.id)
        b.onblur = () => this.heat(null)
        const item = el('li')
        item.append(b)
        list.append(item)
      }
      group.append(title, list)
      return group
    }))
  }

  private select(room: string) {
    this.selected = room
    this.renderCard()
    this.paint()
  }

  /** Pièce survolée (à la souris, ou au clavier dans l'index) : sa fiche s'affiche le temps du survol. */
  private heat(room: string | null) {
    if (this.hot === room) return
    this.hot = room
    this.renderCard()
    this.paint()
  }

  /** Reporte la pièce choisie et la pièce survolée sur le plan et dans l'index. */
  private paint() {
    for (const e of this.body.querySelectorAll<HTMLElement | SVGElement>('[data-room]')) {
      e.classList.toggle('is-selected', e.dataset.room === this.selected)
      e.classList.toggle('is-hot', e.dataset.room === this.hot)
    }
    this.outline.setAttribute('d', this.shapes.get(this.hot ?? this.selected ?? '') ?? '')
  }

  private renderCard() {
    const level = this.level
    const room = this.hot ?? this.selected
    if (!room) {
      this.card.replaceChildren(el('p', 'plan-card-empty', tr('Choisissez une pièce, sur le plan ou dans la liste, pour voir ce qu\'on y fait et comment y aller.', 'Pick a room, on the map or in the list, to see what goes on there and how to reach it.')))
      return
    }
    const info = roomInfo(level, room)
    const hidden = this.hidden(level, room)
    const open = roomOpen(this.plans.get(level)!, room)
    const title = el('h4', '', this.shownName(level, room))
    const zone = el('span', 'plan-card-zone')
    if (!hidden) {
      const swatch = el('i')
      swatch.style.background = ZONES[info.zone].fill
      swatch.style.borderColor = ZONES[info.zone].ink
      zone.append(swatch, ZONES[info.zone].name)
    }
    const head = el('div', 'plan-card-head')
    head.append(title, zone)
    const what = el('p', 'plan-card-what', hidden ? tr('Le plan n\'en dit rien, et sa porte ne s\'ouvre pas à tout le monde.', 'The map says nothing about it, and its door does not open to everyone.') : info.what)
    const lines = el('ul', 'plan-card-lines')
    if (!open && !hidden) {
      const quest = this.host.questTitle?.(level, room)
      const why = quest ? tr(`S'ouvre avec la quête « ${quest} » (journal : touche J).`, `Opens with the “${quest}” quest (journal: J key).`) : info.locked ?? ''
      lines.append(el('li', 'plan-card-locked', tr(`Fermée pour vous. ${why}`, `Closed to you. ${why}`).trim()))
    }
    lines.append(el('li', '', this.route(level, room)))
    this.card.replaceChildren(head, what, lines)
  }

  /** Comment aller du joueur à la pièce : il y est, elle est sur son pont, ou il faut l'ascenseur. */
  private route(level: number, room: string): string {
    if (level !== this.here.level) return tr(`Pour y aller : prenez l'ascenseur ${liftTo(level)}.`, `To get there: take the lift ${liftTo(level)}.`)
    if (room === this.roomAt(this.here)) return tr('Vous y êtes.', 'You are in it.')
    return tr('Sur le pont où vous êtes : suivez le plan depuis votre balise.', 'On the deck you are on: follow the map from your beacon.')
  }
}
