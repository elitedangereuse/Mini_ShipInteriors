import { tr } from '../i18n'
import { icon } from '../icons'
import type { ArenaEnd, ArenaLobby, ArenaRoom, ArenaStats } from '../net'
import { WEAPONS, weaponById, type WeaponId } from '../range-weapons'
import { button, el, Modal } from '../salvage/ui'
import { ARENA_RULES, ARENA_TEAMS } from '../../shared/arena.js'

/*
 * Interface de l'arène : le terminal (à gauche, les quatre lobbys où l'on se place ; à droite, les
 * deux camps face à face, l'arme et ses jauges, les réglages, « prêt »), puis en partie le score des deux équipes et le chrono, les points de vie, le fil des
 * éliminations, l'écran d'attente de celui qui vient d'être éliminé (il y change d'arme), et le
 * tableau de fin.
 */

export const TEAM_NAMES = [tr('Orange', 'Orange'), tr('Bleue', 'Blue')]
const SKILLS = [tr('Recrues', 'Rookies'), tr('Pilotes', 'Pilots'), tr('Élite', 'Elite')]
const format = (size: number) => tr(`${size} contre ${size}`, `${size} vs ${size}`)

export interface ArenaPanelActions {
  join(room: number, team?: number): void
  leave(): void
  side(team: number): void
  settings(s: { size?: number; bots?: boolean; skill?: number; goal?: number }): void
  weapon(id: WeaponId): void
  ready(on: boolean): void
}

/** Les cinq armes, à choisir : au terminal, puis à chaque élimination. */
function weaponPicker(current: WeaponId, pick: (id: WeaponId) => void, keys = false): HTMLElement {
  const row = el('div', 'arena-weapons')
  row.setAttribute('role', 'radiogroup')
  row.setAttribute('aria-label', tr('Arme', 'Weapon'))
  WEAPONS.forEach((w, i) => {
    const b = button('', () => pick(w.id), w.id === current ? 'on' : '')
    b.setAttribute('role', 'radio')
    b.setAttribute('aria-checked', String(w.id === current))
    b.dataset.key = `weapon-${w.id}`
    b.style.setProperty('--weapon', w.color)
    if (keys) b.append(el('kbd', '', String(i + 1)))
    b.append(el('strong', '', w.name), el('span', '', w.trait))
    row.append(b)
  })
  return row
}

/** Ce qu'une arme vaut dans l'arène, de 0 à 1 : la force d'un tir, la cadence, la portée utile. */
function gauges(w: (typeof WEAPONS)[number]): [string, number][] {
  return [
    [tr('Force', 'Power'), Math.min(1, (w.damage * w.pellets) / ARENA_RULES.hp)],
    [tr('Cadence', 'Rate'), Math.min(1, Math.sqrt(0.08 / w.interval))],
    [tr('Portée', 'Range'), Math.min(1, w.reach / 10)],
  ]
}

/** Le choix de l'arme, au terminal : une fiche par arme, avec ses jauges et son chargeur. */
function loadout(current: WeaponId, pick: (id: WeaponId) => void): HTMLElement {
  const row = el('div', 'arena-loadout')
  row.setAttribute('role', 'radiogroup')
  row.setAttribute('aria-label', tr('Arme', 'Weapon'))
  for (const w of WEAPONS) {
    const b = button('', () => pick(w.id), `arena-gun${w.id === current ? ' on' : ''}`)
    b.setAttribute('role', 'radio')
    b.setAttribute('aria-checked', String(w.id === current))
    b.dataset.key = `weapon-${w.id}`
    b.style.setProperty('--weapon', w.color)
    const bars = el('span', 'arena-gauges')
    for (const [label, value] of gauges(w)) {
      const bar = el('i')
      bar.style.setProperty('--fill', `${Math.round(value * 100)}%`)
      bar.title = label
      bars.append(el('em', '', label), bar)
    }
    b.append(el('strong', '', w.name), el('span', 'arena-gun-trait', w.trait), bars, el('span', 'arena-gun-mag', tr(`Chargeur ${w.mag}`, `Mag ${w.mag}`)))
    row.append(b)
  }
  return row
}

/**
 * Le terminal de l'arène : à gauche, les quatre lobbys ; à droite, celui où l'on s'est placé, ses
 * deux camps face à face, son arme, les réglages du chef, et « prêt ».
 */
export class ArenaPanel extends Modal {
  private lobby: ArenaLobby = { rooms: [] }
  private self = -1
  private online = false
  private status = ''
  weapon: WeaponId = 'pistol'

  constructor(private actions: ArenaPanelActions) {
    super(tr('ARÈNE · INSCRIPTIONS', 'ARENA · SIGN-UP'), tr('Duel par équipes', 'Team duel'))
    this.root.classList.add('arena-panel')
  }

  open() {
    this.status = ''
    this.render()
    this.show()
  }

  update(lobby: ArenaLobby, self: number, online: boolean) {
    this.lobby = lobby
    this.self = self
    this.online = online
    if (this.isOpen) this.render()
  }

  message(text: string) {
    this.status = text
    if (this.isOpen) this.render()
  }

  get room(): ArenaRoom | null {
    return this.lobby.rooms.find((r) => r.members.some((m) => m.id === this.self)) ?? null
  }

  private render() {
    const focused = document.activeElement instanceof HTMLElement && this.root.contains(document.activeElement) ? document.activeElement.dataset.key : undefined
    this.body.replaceChildren()
    if (!this.online) {
      this.body.append(el('p', 'salvage-warn', tr('Relais injoignable : l\'arène se joue en ligne. Réessayez dans un instant.', 'Relay unreachable: the arena is played online. Try again in a moment.')))
      return
    }
    const room = this.room
    const layout = el('div', 'arena-layout')
    // Les lobbys, toujours visibles : on voit qui joue avec qui, et l'on en change d'un clic.
    const rail = el('nav', 'arena-rail')
    rail.setAttribute('aria-label', tr('Lobbys', 'Lobbies'))
    rail.append(el('span', 'arena-heading', tr('Lobbys', 'Lobbies')))
    for (const r of this.lobby.rooms) rail.append(this.tile(r, room))
    const stage = el('div', 'arena-stage')
    if (room) this.fillRoom(stage, room)
    else this.fillWelcome(stage)
    if (this.status) stage.append(el('p', 'salvage-status', this.status))
    layout.append(rail, stage)
    this.body.append(layout)
    if (focused) this.body.querySelector<HTMLElement>(`[data-key="${focused}"]`)?.focus()
  }

  private pick(id: WeaponId) {
    this.weapon = id
    this.actions.weapon(id)
    this.render()
  }

  /** Un lobby, dans la colonne de gauche : son état, qui s'y trouve (une pastille par place), et l'on s'y place d'un clic. */
  private tile(r: ArenaRoom, mine: ArenaRoom | null): HTMLElement {
    const own = r === mine
    const playing = r.status === 'playing'
    const full = !own && r.members.length >= r.size * 2
    const b = button('', () => { if (!own) this.actions.join(r.id) }, `arena-tile${own ? ' own' : ''}${playing ? ' playing' : ''}`)
    b.dataset.key = `join-${r.id}`
    b.disabled = !own && (playing || full)
    if (own) b.setAttribute('aria-current', 'true')
    const state = playing ? tr('En partie', 'Playing')
      : r.status === 'countdown' ? tr('Départ', 'Starting')
        : full ? tr('Complet', 'Full')
          : !r.members.length ? tr('Libre', 'Empty')
            : tr('Ouvert', 'Open')
    const head = el('span', 'arena-tile-head')
    head.append(el('strong', '', `Lobby ${r.id}`), el('span', `arena-badge${playing ? ' live' : !r.members.length ? ' idle' : ''}`, state))
    b.append(head)
    if (playing) {
      const score = el('span', 'arena-tile-score')
      score.append(el('b', 'team0', String(r.score?.[0] ?? 0)), ' – ', el('b', 'team1', String(r.score?.[1] ?? 0)))
      b.append(score)
    } else {
      // Une rangée de places par camp : pleine (un joueur), creuse (libre, ou un bot).
      const pips = el('span', 'arena-pips')
      for (const team of ARENA_TEAMS) {
        const row = el('span', `team${team.id}`)
        const taken = r.members.filter((m) => m.team === team.id).length
        for (let i = 0; i < r.size; i++) row.append(el('i', i < taken ? 'on' : ''))
        pips.append(row)
      }
      b.append(pips)
    }
    const names = r.members.map((m) => (m.id === this.self ? tr('vous', 'you') : m.name)).join(', ')
    const bots = r.bots ? tr(`bots ${SKILLS[r.skill].toLowerCase()}`, `${SKILLS[r.skill].toLowerCase()} bots`) : tr('sans bots', 'no bots')
    b.append(el('span', 'arena-tile-detail', r.members.length ? `${format(r.size)} · ${r.goal} pts · ${bots}` : tr('Le premier arrivé règle la partie', 'First in sets the match')))
    if (names) b.append(el('span', 'arena-tile-names', names))
    if (own) b.append(el('span', 'arena-tile-own', tr('Votre lobby', 'Your lobby')))
    return b
  }

  /** Pas encore placé : ce qu'est l'arène, et l'arme qu'on y apportera. */
  private fillWelcome(stage: HTMLElement) {
    const hero = el('div', 'arena-hero')
    hero.append(
      el('strong', '', tr('Placez-vous dans un lobby', 'Pick a lobby')),
      el('p', '', tr(
        `Deux équipes, jusqu'à ${ARENA_RULES.team} contre ${ARENA_RULES.team}, dans une baie de stockage tous projecteurs allumés. Seul contre les bots, ou avec ceux qui jouent avec vous : ils complètent les équipes. La première au score l'emporte.`,
        `Two teams, up to ${ARENA_RULES.team} vs ${ARENA_RULES.team}, in a storage bay with every floodlight on. Solo against the bots, or with whoever plays with you: they fill the teams. First to the score wins.`,
      )),
    )
    stage.append(hero, el('span', 'arena-heading', tr('Votre arme', 'Your weapon')), loadout(this.weapon, (id) => this.pick(id)))
    stage.append(el('p', 'salvage-note', tr('Pour l\'honneur : l\'arène ne rapporte pas de crédits.', 'For honour only: the arena pays no credits.')))
  }

  /** Son lobby : les deux camps face à face, son arme, les réglages du chef, « prêt ». */
  private fillRoom(stage: HTMLElement, r: ArenaRoom) {
    const leader = r.leader === this.self
    const me = r.members.find((m) => m.id === this.self)!
    const title = el('div', 'arena-title')
    title.append(el('strong', '', `Lobby ${r.id}`), el('span', '', `${format(r.size)} · ${tr(`la première équipe à ${r.goal} points gagne`, `first team to ${r.goal} points wins`)}`))
    stage.append(title)

    const versus = el('div', 'arena-versus')
    ARENA_TEAMS.forEach((team, index) => {
      const mates = r.members.filter((m) => m.team === team.id)
      const side = el('section', `arena-team team${team.id}${me.team === team.id ? ' own' : ''}`)
      const head = el('header')
      head.append(el('strong', '', tr(`Équipe ${TEAM_NAMES[team.id]}`, `${TEAM_NAMES[team.id]} team`)), el('span', '', `${mates.length}/${r.size}`))
      side.append(head)
      const slots = el('ul', 'arena-slots')
      for (const m of mates) {
        const li = el('li', `arena-slot${m.id === this.self ? ' me' : ''}${m.ready ? ' ready' : ''}`)
        const w = weaponById(m.weapon)
        const chip = el('span', 'arena-chip', w?.name ?? '')
        if (w) chip.style.setProperty('--weapon', w.color)
        li.append(icon(m.id === r.leader ? 'crown' : 'user-solo'), el('span', 'arena-slot-name', m.name + (m.id === this.self ? tr(' (vous)', ' (you)') : '')), chip)
        li.append(el('span', 'arena-slot-state', m.ready ? tr('Prêt', 'Ready') : tr('En attente', 'Waiting')))
        slots.append(li)
      }
      for (let i = mates.length; i < r.size; i++) {
        const li = el('li', `arena-slot free${r.bots ? ' bot' : ''}`)
        if (r.bots) li.append(icon('robot'), el('span', 'arena-slot-name', tr(`Bot · ${SKILLS[r.skill]}`, `Bot · ${SKILLS[r.skill]}`)))
        else li.append(el('span', 'arena-slot-name', tr('Place libre', 'Open slot')))
        slots.append(li)
      }
      side.append(slots)
      if (me.team !== team.id) {
        const swap = button(tr('Passer dans ce camp', 'Switch to this side'), () => this.actions.side(team.id), 'arena-swap', 'arrows-left-right')
        swap.dataset.key = `side-${team.id}`
        swap.disabled = mates.length >= r.size
        side.append(swap)
      }
      versus.append(side)
      if (!index) versus.append(el('span', 'arena-vs', 'VS'))
    })
    stage.append(versus)

    stage.append(el('span', 'arena-heading', tr('Votre arme', 'Your weapon')), loadout(me.weapon, (id) => this.pick(id)))

    // Réglages : le chef choisit ; les autres les voient.
    const settings = el('div', 'arena-settings')
    const choice = (label: string, options: [string, () => void, boolean][], key: string) => {
      const box = el('div', 'arena-choice')
      box.append(el('span', 'arena-heading', label))
      const row = el('div', 'arena-segments')
      row.setAttribute('role', 'radiogroup')
      row.setAttribute('aria-label', label)
      options.forEach(([text, set, on], i) => {
        const b = button(text, set, on ? 'on' : '')
        b.setAttribute('role', 'radio')
        b.setAttribute('aria-checked', String(on))
        b.dataset.key = `${key}-${i}`
        b.disabled = !leader && !on
        if (!leader) b.tabIndex = -1
        row.append(b)
      })
      box.append(row)
      return box
    }
    const crowd = Math.max(1, ...ARENA_TEAMS.map((t) => r.members.filter((m) => m.team === t.id).length))
    const sizes = Array.from({ length: ARENA_RULES.team }, (_, i) => i + 1).filter((n) => n >= crowd || n === r.size)
    settings.append(
      choice(tr('Format', 'Format'), sizes.map((n) => [`${n} v ${n}`, () => this.actions.settings({ size: n }), n === r.size]), 'size'),
      choice(tr('Limite de points', 'Point limit'), ARENA_RULES.goals.map((n) => [String(n), () => this.actions.settings({ goal: n }), n === r.goal]), 'goal'),
      choice(tr('Bots', 'Bots'), [
        [tr('Aucun', 'None'), () => this.actions.settings({ bots: false }), !r.bots],
        ...SKILLS.map((name, i): [string, () => void, boolean] => [name, () => this.actions.settings({ bots: true, skill: i }), r.bots && r.skill === i]),
      ], 'bots'),
    )
    stage.append(settings)
    if (!leader) stage.append(el('p', 'salvage-note', tr('Le chef du lobby (le premier arrivé, à la couronne) règle la partie ; un changement remet tout le monde en attente.', 'The lobby leader (first in, with the crown) sets the match; any change puts everyone back on standby.')))

    const ready = r.members.filter((m) => m.ready).length
    const footer = el('div', 'arena-footer')
    const go = button(
      r.status === 'countdown' ? tr('Départ imminent…', 'Starting…') : me.ready ? tr('Prêt · annuler', 'Ready · cancel') : tr('Je suis prêt', 'I\'m ready'),
      () => this.actions.ready(!me.ready), `arena-ready${me.ready ? ' on' : ''}`, me.ready ? 'check' : 'crosshair',
    )
    go.dataset.key = 'ready'
    const leave = button(tr('Quitter le lobby', 'Leave the lobby'), () => this.actions.leave(), 'arena-leave', 'sign-out')
    leave.dataset.key = 'leave'
    footer.append(go, el('span', 'arena-count-ready', tr(`${ready}/${r.members.length} prêt${ready > 1 ? 's' : ''}`, `${ready}/${r.members.length} ready`)), leave)
    stage.append(footer)
  }
}

/** Qui est un combattant pour le joueur : lui-même, un coéquipier, un adversaire. */
export type Relation = 'self' | 'ally' | 'enemy'
/** Ce que le HUD montre d'un combattant dans le fil des éliminations. */
export interface FeedName { name: string; rel: Relation }
/** La plaque d'un combattant, au-dessus de sa tête : son nom, ses points de vie. */
export interface PlateInfo { name: string; hp: number; rel: Relation; shield: boolean; bot: boolean; /** Le joueur : son chargeur, de 0 à 1. */ ammo?: number }

/**
 * En partie, à la façon de Brawl Stars : le score des deux camps (le sien en bleu, à gauche, celui
 * d'en face en rouge) et le chrono, une plaque au-dessus de chaque combattant (son nom, sa barre de
 * vie ; sous la sienne, son chargeur), le fil des éliminations, l'attente de celui qui vient de
 * tomber, et le tableau de fin.
 */
export class ArenaHud {
  private readonly root = el('div', 'arena-hud')
  private readonly scores = [el('strong', 'arena-score ally'), el('strong', 'arena-score enemy')]
  private readonly clock = el('span', 'arena-clock')
  private readonly goal = el('span', 'arena-goal')
  private readonly plates = el('div', 'arena-plates')
  private readonly plateOf = new Map<number, { root: HTMLElement; name: HTMLElement; fill: HTMLElement; value: HTMLElement; ammo: HTMLElement; shown: boolean }>()
  private readonly feed = el('ul', 'arena-feed')
  private readonly wait = el('div', 'arena-wait')
  private readonly waitTitle = el('strong')
  private readonly waitClock = el('span')
  private readonly waitPick = el('div')
  private readonly count = el('div', 'arena-count')
  private readonly vignette = el('div', 'arena-vignette')
  private readonly end = el('section', 'salvage-panel salvage-end arena-end')
  private readonly quit: HTMLButtonElement
  private shownCount = ''
  private picked: WeaponId | null = null
  onQuit?: () => void
  onWeapon?: (id: WeaponId) => void

  constructor() {
    this.root.hidden = true
    this.root.setAttribute('role', 'group')
    this.root.setAttribute('aria-label', tr('Arène', 'Arena'))
    const board = el('div', 'arena-board')
    const middle = el('div', 'arena-middle')
    middle.append(this.clock, this.goal)
    board.append(this.scores[0], middle, this.scores[1])
    this.plates.setAttribute('aria-hidden', 'true')
    this.quit = button(tr('Quitter', 'Leave'), () => this.onQuit?.(), 'arena-quit', 'sign-out')
    this.wait.hidden = true
    this.wait.append(this.waitTitle, this.waitClock, el('span', 'arena-wait-label', tr('Arme au retour', 'Weapon on return')), this.waitPick)
    this.count.setAttribute('aria-live', 'assertive')
    this.feed.setAttribute('aria-live', 'polite')
    this.root.append(this.plates, board, this.feed, this.quit, this.count, this.wait)
    this.end.hidden = true
    this.end.setAttribute('role', 'dialog')
    this.end.setAttribute('aria-modal', 'true')
    document.body.append(this.root, this.vignette, this.end)
  }

  get endOpen() {
    return !this.end.hidden
  }

  show(on: boolean) {
    this.root.hidden = !on
    this.quit.hidden = false
    // Les noms du bord laissent la place aux plaques de l'arène.
    document.body.classList.toggle('arena-on', on)
    if (!on) {
      this.wait.hidden = true
      this.feed.replaceChildren()
      this.count.textContent = this.shownCount = ''
      this.plates.replaceChildren()
      this.plateOf.clear()
    }
  }

  /**
   * @param mine, theirs points de son équipe, de celle d'en face
   * @param left secondes restantes ; `warmup` : secondes avant le coup d'envoi (0 : c'est parti)
   */
  board(mine: number, theirs: number, goal: number, left: number, warmup: number) {
    this.scores[0].textContent = String(mine)
    this.scores[1].textContent = String(theirs)
    this.scores[0].classList.toggle('point', mine === goal - 1)
    this.scores[1].classList.toggle('point', theirs === goal - 1)
    const seconds = Math.ceil(left)
    this.clock.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
    this.clock.classList.toggle('low', warmup <= 0 && left <= 30)
    this.goal.textContent = tr(`Premier à ${goal}`, `First to ${goal}`)
    // Le décompte du coup d'envoi, puis le signal, un instant.
    const text = warmup > 0 ? String(Math.ceil(warmup)) : this.shownCount && this.shownCount !== 'go' ? 'go' : this.shownCount
    if (text === this.shownCount) return
    this.shownCount = text
    this.count.textContent = text === 'go' ? tr('Baston !', 'Brawl!') : text
    this.count.classList.remove('pop')
    void this.count.offsetWidth
    this.count.classList.add('pop')
    if (text === 'go') window.setTimeout(() => { if (this.shownCount === 'go') this.count.textContent = this.shownCount = '' }, 900)
  }

  /**
   * La plaque d'un combattant, au-dessus de sa tête (`at`, en pixels ; null : on ne le voit pas).
   * @param near de 0 (loin) à 1 (tout près) : la plaque rapetisse avec la distance, en vue subjective
   */
  plate(id: number, at: { x: number; y: number } | null, info: PlateInfo, near = 1) {
    let p = this.plateOf.get(id)
    if (!p) {
      if (!at) return
      const root = el('div', 'arena-plate')
      const name = el('span', 'arena-plate-name')
      const bar = el('div', 'arena-plate-bar')
      const fill = el('i')
      const value = el('b')
      bar.append(fill, value)
      const ammo = el('div', 'arena-plate-ammo')
      ammo.append(el('i'))
      root.append(name, bar, ammo)
      this.plates.append(root)
      this.plateOf.set(id, (p = { root, name, fill, value, ammo, shown: true }))
    }
    if (p.shown !== !!at) p.root.hidden = !(p.shown = !!at)
    if (!at) return
    p.root.className = `arena-plate ${info.rel}${info.shield ? ' shield' : ''}`
    p.root.style.transform = `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px) translate(-50%, -100%) scale(${(0.6 + 0.4 * near).toFixed(2)})`
    const name = info.bot ? `🤖 ${info.name}` : info.name
    if (p.name.textContent !== name) p.name.textContent = name
    const hp = Math.max(0, Math.round(info.hp))
    p.fill.style.width = `${Math.min(100, (hp / ARENA_RULES.hp) * 100).toFixed(0)}%`
    if (p.value.textContent !== String(hp)) p.value.textContent = String(hp)
    p.ammo.hidden = info.ammo === undefined
    if (info.ammo !== undefined) (p.ammo.firstElementChild as HTMLElement).style.width = `${(info.ammo * 100).toFixed(0)}%`
  }

  dropPlate(id: number) {
    this.plateOf.get(id)?.root.remove()
    this.plateOf.delete(id)
  }

  /** Touché : le bord de l'écran rougit un instant. */
  hurt() {
    this.vignette.classList.remove('flash')
    void this.vignette.offsetWidth
    this.vignette.classList.add('flash')
  }

  /** Une élimination dans le fil : qui, avec quoi, qui. */
  kill(by: FeedName | null, victim: FeedName, weapon: WeaponId, mine: boolean) {
    const li = el('li', mine ? 'mine' : '')
    if (by) li.append(el('span', by.rel, by.name))
    li.append(icon('crosshair'), el('em', '', weaponById(weapon)?.name ?? ''), el('span', victim.rel, victim.name))
    this.feed.append(li)
    while (this.feed.children.length > 5) this.feed.firstElementChild!.remove()
    window.setTimeout(() => li.remove(), 6000)
  }

  /** Éliminé : par qui, le temps qu'il reste, et l'arme du retour (null : on est debout). */
  waiting(by: string | null, seconds: number, weapon: WeaponId) {
    const on = by !== null
    if (on && (this.wait.hidden || this.picked !== weapon)) {
      this.picked = weapon
      this.waitPick.replaceChildren(weaponPicker(weapon, (id) => this.onWeapon?.(id), !matchMedia('(pointer: coarse)').matches))
    }
    this.wait.hidden = !on
    if (!on) return
    this.waitTitle.textContent = by ? tr(`Éliminé par ${by}`, `Taken out by ${by}`) : tr('Éliminé', 'Taken out')
    this.waitClock.textContent = tr(`Retour à la base dans ${Math.max(1, Math.ceil(seconds))} s`, `Back at base in ${Math.max(1, Math.ceil(seconds))} s`)
  }

  /** Le tableau de fin : qui gagne, le score, le joueur star, et les chiffres de chacun, camp par camp. */
  showEnd(r: ArenaEnd, team: number, self: number, onBack: () => void) {
    this.end.replaceChildren()
    this.quit.hidden = true
    const won = r.winner === team
    const head = el('header', 'salvage-head')
    head.append(
      el('span', 'salvage-kicker', tr('FIN DE LA PARTIE', 'MATCH OVER')),
      el('h2', r.winner < 0 ? 'draw' : won ? 'won' : 'lost', r.winner < 0 ? tr('Égalité', 'Draw') : won ? tr('Victoire !', 'Victory!') : tr('Défaite', 'Defeat')),
    )
    const body = el('div', 'salvage-body')
    const score = el('p', 'arena-end-score')
    score.append(el('strong', 'ally', String(r.score[team])), ' – ', el('strong', 'enemy', String(r.score[1 - team])))
    body.append(score)
    body.append(el('p', 'salvage-intro', r.reason === 'forfeit'
      ? tr('L\'équipe d\'en face a quitté l\'arène.', 'The other team left the arena.')
      : r.reason === 'time'
        ? tr('Le temps est écoulé.', 'Time is up.')
        : tr(`Limite atteinte : ${r.goal} points.`, `Limit reached: ${r.goal} points.`)))
    const table = el('table', 'salvage-table arena-table')
    const header = el('tr')
    for (const label of [tr('Combattant', 'Fighter'), tr('Élim.', 'Kills'), tr('Morts', 'Deaths'), tr('Dégâts', 'Damage')]) header.append(el('th', '', label))
    table.append(header)
    // Les siens d'abord ; le joueur star : celui qui a le plus éliminé (à égalité, le plus blessé).
    const order = (a: ArenaStats, b: ArenaStats) => Number(a.team !== team) - Number(b.team !== team) || b.kills - a.kills || b.damage - a.damage
    const star = [...r.stats].sort((a, b) => b.kills - a.kills || b.damage - a.damage)[0]
    for (const s of [...r.stats].sort(order)) {
      const row = el('tr', `${s.team === team ? 'ally' : 'enemy'}${s.id === self ? ' self' : ''}`)
      const name = el('td')
      if (s.bot) name.append(icon('robot'))
      name.append(s.name)
      if (s === star && star.kills > 0) name.append(el('span', 'arena-star', tr('★ Joueur star', '★ Star player')))
      row.append(name, el('td', '', String(s.kills)), el('td', '', String(s.deaths)), el('td', '', String(s.damage)))
      table.append(row)
    }
    body.append(table)
    const back = button(tr('Retour au lobby', 'Back to the lobby'), () => {
      this.end.hidden = true
      onBack()
    }, 'salvage-primary', 'door-open')
    body.append(back)
    this.end.append(head, body)
    this.end.hidden = false
    this.end.classList.toggle('won', won)
    back.focus()
  }

  closeEnd() {
    this.end.hidden = true
  }
}
