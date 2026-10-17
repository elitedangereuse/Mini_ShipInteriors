import { tr } from '../i18n'
import { icon, type IconName } from '../icons'
import { button, el } from '../salvage/ui'
import { CHARACTER_IDS, type CharacterId } from '../../shared/arena.js'
import { CHARACTERS, characterById, gauges, type Character } from './characters'
import { AttackDemo } from './demo'
import { loadPortraits, portrait } from './portraits'
import { DIFFICULTY } from './roster'

/*
 * Le choix du personnage, au terminal de l'arène. D'abord une rangée de six cartes : son visage, son
 * nom, son rôle et sa difficulté ; celle qu'on a choisie ressort (bordure et fond à sa couleur, une
 * coche). Dessous, sa fiche : son jeu en une phrase, deux forces, deux faiblesses, ce qu'il est seul à
 * faire, et la démonstration de son attaque (cf. demo.ts). Les chiffres sont dans une fiche
 * secondaire, qu'on déplie (« Fiche détaillée ») : ses six jauges, son chargeur, son rechargement ;
 * on y compare deux personnages d'un geste (les jauges de l'autre sous les siennes, à sa couleur).
 * Ce qu'on a déplié et avec qui l'on compare se retrouve à la prochaine ouverture du terminal, le
 * personnage choisi aussi (cf. ArenaClient.choose).
 * Le composant vit autant que le terminal : le panneau le replace à chaque rendu sans le refaire,
 * et la démonstration ne repart pas du début à chaque nouvelle du lobby.
 */

const SHEET_KEY = 'mini-shipinteriors-arena-sheet'

/**
 * Les personnages ouverts au joueur : chacun s'ouvre par sa quête (cf. `character` dans
 * shared/quests.js). Un personnage fermé se regarde (sa fiche, sa démonstration), mais ne se prend pas.
 */
export interface CharacterLocks {
  open(id: CharacterId): boolean
  /** Le titre de la quête qui l'ouvre. */
  quest(id: CharacterId): string | null
}

/** Un nombre, à la française (virgule) ou à l'anglaise. */
const num = (n: number) => tr(String(n).replace('.', ','), String(n))
const pct = (u: number) => `${Math.round(Math.max(0.04, Math.min(1, u)) * 100)}%`

/** Son visage (cf. portraits.ts) ; tant qu'il n'est pas prêt, sa pastille à sa couleur. */
export function faceOf(c: Character, className = 'arena-face'): HTMLElement {
  const box = el('span', className)
  box.style.setProperty('--char', c.color)
  const src = portrait(c.id)
  if (src) {
    const img = el('img')
    img.src = src
    img.alt = ''
    img.draggable = false
    box.append(img)
  } else box.append(icon(c.icon))
  return box
}

/** Sa difficulté : trois crans, autant de pleins que de difficulté, et son nom. */
function difficulty(c: Character): HTMLElement {
  const box = el('span', `arena-diff d${c.difficulty}`)
  const pips = el('span', 'arena-diff-pips')
  pips.setAttribute('aria-hidden', 'true')
  for (let i = 1; i <= 3; i++) pips.append(el('i', i <= c.difficulty ? 'on' : ''))
  box.append(pips, el('span', '', DIFFICULTY[c.difficulty]))
  return box
}

function trait(kind: 'pro' | 'con' | 'special', iconName: IconName, text: string, label: string): HTMLElement {
  const li = el('li', `arena-trait ${kind}`)
  const mark = icon(iconName)
  mark.setAttribute('aria-label', label)
  mark.setAttribute('role', 'img')
  li.append(mark, el('span', '', text))
  return li
}

export class CharacterPicker {
  readonly root = el('section', 'arena-picker')
  private readonly cards = new Map<CharacterId, HTMLButtonElement>()
  private readonly sheet = el('article', 'arena-pick')
  private readonly demo = new AttackDemo()
  private current: CharacterId
  /** Le personnage dont on lit la fiche : celui qu'on a pris, ou un fermé qu'on regarde. */
  private shown: CharacterId
  /** La fiche détaillée est dépliée ; on y compare avec ce personnage (null : personne). */
  private details = false
  private compare: CharacterId | null = null
  /** Les visages sont prêts : le panneau refait ce qui en montre (les équipes). */
  onFaces?: () => void
  private facing = false

  constructor(current: CharacterId, private onPick: (id: CharacterId) => void, private locks: CharacterLocks) {
    this.current = this.shown = current
    try {
      const saved = JSON.parse(localStorage.getItem(SHEET_KEY) ?? '{}') as { details?: unknown; compare?: unknown }
      this.details = saved.details === true
      this.compare = CHARACTER_IDS.includes(saved.compare as CharacterId) ? (saved.compare as CharacterId) : null
    } catch {}
    const grid = el('div', 'arena-chars')
    grid.setAttribute('role', 'radiogroup')
    grid.setAttribute('aria-label', tr('Personnage', 'Character'))
    CHARACTERS.forEach((c, i) => {
      const b = button('', () => this.pick(c.id), 'arena-char')
      b.setAttribute('role', 'radio')
      b.dataset.key = `char-${c.id}`
      b.style.setProperty('--char', c.color)
      const check = el('span', 'arena-char-check')
      check.append(icon('check'))
      check.setAttribute('aria-hidden', 'true')
      // Au clavier, les chiffres choisissent (cf. ArenaPanel) : on le rappelle dans un coin.
      const key = el('kbd', 'arena-char-key', String(i + 1))
      key.setAttribute('aria-hidden', 'true')
      const lock = el('span', 'arena-char-lock')
      lock.append(icon('lock-simple'))
      lock.setAttribute('aria-hidden', 'true')
      b.append(faceOf(c), el('strong', '', c.name), el('span', 'arena-char-role', c.role), difficulty(c), check, lock, key)
      this.cards.set(c.id, b)
      grid.append(b)
    })
    this.root.append(grid, this.sheet)
    this.render()
  }

  /** Les visages : rendus à la première ouverture du terminal (pas au démarrage du jeu), puis posés. */
  private faces() {
    if (this.facing) return
    this.facing = true
    void loadPortraits().then(() => {
      for (const c of CHARACTERS) this.cards.get(c.id)!.querySelector('.arena-face')?.replaceWith(faceOf(c))
      this.render()
      this.onFaces?.()
    })
  }

  get selected(): CharacterId {
    return this.current
  }

  /** Le personnage choisi a changé (le relais, ou ce panneau) : la carte et la fiche suivent. */
  set(id: CharacterId) {
    if (id === this.current) return
    this.current = this.shown = id
    this.render()
  }

  /** Un personnage vient de s'ouvrir (une quête terminée) : les cadenas suivent. */
  refresh() {
    this.render()
  }

  /** Le personnage d'avant ou d'après (LB, RB à la manette). */
  cycle(step: number) {
    const i = CHARACTER_IDS.indexOf(this.shown)
    const next = CHARACTER_IDS[(i + step + CHARACTER_IDS.length) % CHARACTER_IDS.length] as CharacterId
    this.pick(next)
    this.cards.get(next)?.focus({ preventScroll: true })
  }

  /** Choisit le personnage numéro `n` (de 1 à 6), comme sa carte. */
  pickNth(n: number) {
    const id = CHARACTER_IDS[n - 1] as CharacterId | undefined
    if (!id) return
    this.pick(id)
    this.cards.get(id)?.focus({ preventScroll: true })
  }

  /** Déplie ou replie la fiche détaillée ; rend vrai si elle l'était (Échap la replie d'abord). */
  toggleDetails(on = !this.details): boolean {
    const was = this.details
    this.details = on
    this.save()
    this.render()
    return was
  }

  get detailed(): boolean {
    return this.details
  }

  /** La fiche est de nouveau affichée : la démonstration reprend ; la première fois, les visages se rendent. */
  resume() {
    this.faces()
    this.demo.run()
  }

  /** Le focus sur la carte du personnage choisi (à l'ouverture du terminal : A ne ferme rien par mégarde). */
  focus() {
    this.cards.get(this.current)?.focus({ preventScroll: true })
  }

  private pick(id: CharacterId) {
    this.shown = id
    // Fermé : on lit sa fiche, et ce qui l'ouvre ; on garde celui qu'on avait.
    if (id !== this.current && this.locks.open(id)) {
      // Choisir celui qu'on comparait : on compare alors avec celui qu'on quitte.
      if (this.compare === id) this.compare = this.current
      this.current = id
      this.save()
      this.onPick(id)
    }
    this.render()
  }

  private setCompare(id: CharacterId | null) {
    this.compare = id
    this.save()
    this.render()
  }

  /** « Comparer » : la fiche détaillée s'ouvre, avec le dernier comparé ou le suivant. */
  private startCompare() {
    this.details = true
    if (!this.compare || this.compare === this.shown) {
      const i = CHARACTER_IDS.indexOf(this.shown)
      this.compare = CHARACTER_IDS[(i + 1) % CHARACTER_IDS.length] as CharacterId
    }
    this.save()
    this.render()
    this.sheet.querySelector<HTMLElement>(`[data-key="cmp-${this.compare}"]`)?.focus({ preventScroll: true })
  }

  private save() {
    try {
      localStorage.setItem(SHEET_KEY, JSON.stringify({ details: this.details, compare: this.compare }))
    } catch {}
  }

  private render() {
    // Ce qui avait le focus dans la fiche le retrouve une fois refaite.
    const active = document.activeElement
    const focused = active instanceof HTMLElement && this.sheet.contains(active) ? active.dataset.key : undefined
    const c = characterById(this.shown)
    for (const [id, b] of this.cards) {
      const open = this.locks.open(id)
      const on = id === this.current && open
      b.classList.toggle('on', on)
      b.classList.toggle('locked', !open)
      b.classList.toggle('viewed', id === this.shown && !on)
      b.setAttribute('aria-checked', String(on))
      b.setAttribute('aria-label', open ? `${characterById(id).name}, ${characterById(id).role}` : tr(`${characterById(id).name}, verrouillé`, `${characterById(id).name}, locked`))
    }
    this.sheet.style.setProperty('--char', c.color)
    const text = el('div', 'arena-pick-text')
    const head = el('header')
    head.append(el('strong', '', c.full), el('span', '', `${c.role} · ${c.arm.name}`))
    const traits = el('ul', 'arena-traits')
    for (const s of c.strengths) traits.append(trait('pro', 'plus', s, tr('Force', 'Strength')))
    for (const s of c.weaknesses) traits.append(trait('con', 'minus', s, tr('Faiblesse', 'Weakness')))
    traits.append(trait('special', 'sparkle', c.special, tr('Particularité', 'Special')))
    const tools = el('div', 'arena-pick-tools')
    const more = button(this.details ? tr('Replier la fiche', 'Hide stats') : tr('Fiche détaillée', 'Full stats'), () => this.toggleDetails(), `arena-more${this.details ? ' on' : ''}`, this.details ? 'caret-up' : 'caret-down')
    more.dataset.key = 'details'
    more.setAttribute('aria-expanded', String(this.details))
    const cmp = button(tr('Comparer', 'Compare'), () => this.startCompare(), 'arena-compare-start', 'arrows-left-right')
    cmp.dataset.key = 'compare'
    tools.append(more, cmp)
    text.append(head)
    if (!this.locks.open(c.id)) {
      // Fermé : la quête qui l'ouvre, à la place de « choisir ».
      const quest = this.locks.quest(c.id)
      const lock = el('p', 'arena-pick-lock')
      lock.append(icon('lock-simple'), el('span', '', quest
        ? tr(`Verrouillé : terminez la quête « ${quest} » pour le jouer.`, `Locked: complete the quest “${quest}” to play this character.`)
        : tr('Verrouillé.', 'Locked.')))
      text.append(lock)
    }
    text.append(el('p', 'arena-pick-style', c.style), traits, tools)
    this.demo.show(c.id, c.name)
    const top = el('div', 'arena-pick-top')
    top.append(text, this.demo.root)
    this.sheet.replaceChildren(top)
    if (this.details) this.sheet.append(this.detailSheet(c))
    if (focused) this.sheet.querySelector<HTMLElement>(`[data-key="${focused}"]`)?.focus({ preventScroll: true })
    this.demo.run()
  }

  /** La fiche secondaire : les chiffres, et la comparaison. */
  private detailSheet(c: Character): HTMLElement {
    const other = this.compare && this.compare !== c.id ? characterById(this.compare) : null
    const box = el('section', 'arena-detail')
    box.setAttribute('aria-label', tr('Fiche détaillée', 'Full stats'))
    const w = c.stats.weapon
    box.append(el('p', 'arena-detail-facts', tr(
      `${c.arm.name} : chargeur de ${w.mag}, rechargement en ${num(w.reload)} s, ${w.lob ? 'lancé par-dessus les obstacles' : w.pierce ? 'traverse ceux qu\'il touche' : w.blast ? 'éclate à l\'impact' : 'tir direct'}.`,
      `${c.arm.name}: ${w.mag}-round magazine, ${w.reload} s reload, ${w.lob ? 'lobbed over obstacles' : w.pierce ? 'pierces whoever it hits' : w.blast ? 'bursts on impact' : 'direct fire'}.`,
    )))
    if (other) {
      // La légende : ses couleurs à lui, celles de l'autre.
      const legend = el('p', 'arena-detail-legend')
      for (const x of [c, other]) {
        const tag = el('span')
        tag.style.setProperty('--char', x.color)
        tag.append(el('i'), x.name)
        legend.append(tag)
      }
      box.append(legend)
    }
    const bars = el('dl', `arena-gauges${other ? ' versus' : ''}`)
    if (other) bars.style.setProperty('--other', other.color)
    const theirs = other ? gauges(other) : null
    gauges(c).forEach((g, i) => {
      const cell = el('div')
      const bar = el('i')
      bar.style.setProperty('--fill', pct(g.value))
      const o = theirs?.[i]
      // Qui l'emporte sur cette jauge, en clair pour qui ne lit pas les couleurs : ▲ il a plus, ▼ moins.
      const verdict = !o || (g.text === '—' && o.text === '—') ? '' : g.value > o.value + 0.01 ? ' ▲' : g.value < o.value - 0.01 ? ' ▼' : ' ='
      cell.append(el('dt', '', g.label), bar, el('dd', '', `${g.text}${verdict}`))
      if (o) {
        const them = el('i', 'other')
        them.style.setProperty('--fill', pct(o.value))
        cell.append(them, el('dd', 'other', o.text))
      }
      bars.append(cell)
    })
    box.append(bars)
    const row = el('div', 'arena-compare')
    row.append(el('span', 'arena-heading', tr('Comparer avec', 'Compare with')))
    for (const o of CHARACTERS) {
      if (o.id === c.id) continue
      const on = o.id === other?.id
      const b = button('', () => this.setCompare(on ? null : o.id), `arena-compare-pick${on ? ' on' : ''}`)
      b.dataset.key = `cmp-${o.id}`
      b.style.setProperty('--char', o.color)
      b.setAttribute('aria-pressed', String(on))
      b.setAttribute('aria-label', tr(`Comparer avec ${o.name}`, `Compare with ${o.name}`))
      b.title = o.name
      b.append(faceOf(o, 'arena-face small'))
      row.append(b)
    }
    if (other && this.locks.open(other.id)) {
      const take = button(tr(`Choisir ${other.name}`, `Pick ${other.name}`), () => this.pick(other.id), 'arena-take', 'check')
      take.dataset.key = 'take'
      take.style.setProperty('--char', other.color)
      row.append(take)
    }
    box.append(row, el('p', 'arena-sheet-quip', `« ${c.quip} »`))
    return box
  }
}
