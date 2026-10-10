import { tr } from '../i18n'
import { icon } from '../icons'
import type { ArenaEnd, ArenaLobby, ArenaRoom, ArenaStats } from '../net'
import { WEAPONS, weaponById, type WeaponId } from '../range-weapons'
import { button, el, Modal } from '../salvage/ui'
import { ARENA_RULES, ARENA_TEAMS, arenaGoal } from '../../shared/arena.js'

/*
 * Interface de l'arène : le terminal du lobby (les salons, les deux camps, l'arme, les réglages,
 * « prêt »), puis en partie le score des deux équipes et le chrono, les points de vie, le fil des
 * éliminations, l'écran d'attente de celui qui vient d'être éliminé (il y change d'arme), et le
 * tableau de fin.
 */

export const TEAM_NAMES = [tr('Orange', 'Orange'), tr('Bleue', 'Blue')]
const SKILLS = [tr('Recrues', 'Rookies'), tr('Pilotes', 'Pilots'), tr('Élite', 'Elite')]
const format = (size: number) => tr(`${size} contre ${size}`, `${size} vs ${size}`)

export interface ArenaPanelActions {
  create(): void
  join(room: number, team?: number): void
  leave(): void
  side(team: number): void
  settings(s: { size?: number; bots?: boolean; skill?: number }): void
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

/** Le terminal de l'arène : ouvrir un salon ou en rejoindre un, choisir son camp et son arme, se déclarer prêt. */
export class ArenaPanel extends Modal {
  private lobby: ArenaLobby = { rooms: [] }
  private self = -1
  private online = false
  private status = ''
  weapon: WeaponId = 'pistol'

  constructor(private actions: ArenaPanelActions) {
    super(tr('ARÈNE · LOBBY DE LA CALE', 'ARENA · HOLD LOBBY'), tr('Duel par équipes', 'Team duel'))
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
    this.body.append(el('p', 'salvage-intro', tr(
      `Deux équipes, jusqu'à ${ARENA_RULES.team} contre ${ARENA_RULES.team}, dans une baie de stockage tous projecteurs allumés. Chacun vient avec l'arme de son choix ; les bots complètent les équipes. La première au score l'emporte.`,
      `Two teams, up to ${ARENA_RULES.team} vs ${ARENA_RULES.team}, in a storage bay with every floodlight on. Bring the weapon of your choice; bots fill the teams. First to the score wins.`,
    )))
    if (!this.online) {
      this.body.append(el('p', 'salvage-warn', tr('Relais injoignable : l\'arène se joue en ligne. Réessayez dans un instant.', 'Relay unreachable: the arena is played online. Try again in a moment.')))
      return
    }
    const room = this.room
    if (room) this.body.append(this.roomCard(room))
    const others = this.lobby.rooms.filter((r) => r !== room)
    if (others.length) {
      const list = el('div', 'salvage-teams')
      for (const r of others) list.append(this.listCard(r, !!room))
      this.body.append(list)
    } else if (!room) this.body.append(el('p', 'salvage-empty', tr('Aucun salon ouvert. Ouvrez le vôtre : seul contre les bots, ou en attendant du monde.', 'No room open. Open yours: solo against the bots, or while waiting for company.')))
    if (!room) {
      this.body.append(el('span', 'salvage-label', tr('Votre arme', 'Your weapon')), weaponPicker(this.weapon, (id) => this.pick(id)))
      const create = button(tr('Ouvrir un salon', 'Open a room'), () => this.actions.create(), 'salvage-primary', 'plus')
      create.dataset.key = 'create'
      const row = el('div', 'salvage-actions')
      row.append(create)
      this.body.append(row)
    }
    this.body.append(el('p', 'salvage-note', tr('Pour l\'honneur : l\'arène ne rapporte pas de crédits.', 'For honour only: the arena pays no credits.')))
    if (this.status) this.body.append(el('p', 'salvage-status', this.status))
    if (focused) this.body.querySelector<HTMLElement>(`[data-key="${focused}"]`)?.focus()
  }

  private pick(id: WeaponId) {
    this.weapon = id
    this.actions.weapon(id)
    this.render()
  }

  /** Un salon où l'on n'est pas : son format, qui s'y trouve, et le bouton pour le rejoindre. */
  private listCard(r: ArenaRoom, elsewhere: boolean): HTMLElement {
    const playing = r.status === 'playing'
    const card = el('div', `salvage-lobby-card${playing ? ' playing' : ''}`)
    const head = el('div', 'salvage-lobby-head')
    head.append(el('strong', '', tr(`Salon ${r.id}`, `Room ${r.id}`)))
    head.append(el('span', 'salvage-lobby-state', playing ? `${r.score?.[0] ?? 0} – ${r.score?.[1] ?? 0}` : r.status === 'countdown' ? tr('Départ imminent', 'Starting') : format(r.size)))
    card.append(head)
    const seats = el('ul', 'salvage-seats')
    for (const m of r.members) {
      const li = el('li', `team${m.team}`)
      li.append(icon(m.id === r.leader ? 'crown' : 'user-solo', m.id === r.leader ? 'salvage-crown' : 'salvage-seat-icon'), el('span', 'salvage-name', m.name))
      seats.append(li)
    }
    card.append(seats, el('span', 'salvage-lobby-detail', r.bots ? tr(`Bots : ${SKILLS[r.skill]}`, `Bots: ${SKILLS[r.skill]}`) : tr('Sans bots', 'No bots')))
    if (!playing) {
      const full = r.members.length >= r.size * 2
      const join = button(full ? tr('Complet', 'Full') : elsewhere ? tr('Changer pour ce salon', 'Switch to this room') : tr('Rejoindre', 'Join'), () => this.actions.join(r.id), elsewhere || full ? '' : 'salvage-primary', 'user-plus')
      join.dataset.key = `join-${r.id}`
      join.disabled = full
      card.append(join)
    }
    return card
  }

  /** Son salon : les deux camps face à face, son arme, les réglages du chef, « prêt ». */
  private roomCard(r: ArenaRoom): HTMLElement {
    const card = el('div', 'salvage-team')
    const leader = r.leader === this.self
    const me = r.members.find((m) => m.id === this.self)!
    card.append(el('strong', 'salvage-team-title', tr(`Salon ${r.id} · ${format(r.size)} · ${arenaGoal(r.size)} éliminations`, `Room ${r.id} · ${format(r.size)} · ${arenaGoal(r.size)} kills`)))

    const sides = el('div', 'arena-sides')
    for (const team of ARENA_TEAMS) {
      const mates = r.members.filter((m) => m.team === team.id)
      const side = el('div', `arena-side team${team.id}${me.team === team.id ? ' own' : ''}`)
      side.append(el('strong', 'arena-side-name', tr(`Équipe ${TEAM_NAMES[team.id]}`, `${TEAM_NAMES[team.id]} team`)))
      const seats = el('ul', 'salvage-seats')
      for (const m of mates) {
        const li = el('li', m.ready ? 'ready' : '')
        li.append(icon(m.id === r.leader ? 'crown' : 'user-solo', m.id === r.leader ? 'salvage-crown' : 'salvage-seat-icon'))
        li.append(el('span', 'salvage-name', m.name + (m.id === this.self ? tr(' (vous)', ' (you)') : '')))
        li.append(el('span', 'arena-seat-weapon', weaponById(m.weapon)?.name ?? ''))
        if (m.ready) li.append(icon('check', 'salvage-seat-ready'))
        seats.append(li)
      }
      for (let i = mates.length; i < r.size; i++) {
        const li = el('li', 'free')
        if (r.bots) li.append(icon('robot', 'salvage-seat-icon'), tr('Bot', 'Bot'))
        else li.append(tr('Place libre', 'Open slot'))
        seats.append(li)
      }
      side.append(seats)
      if (me.team !== team.id) {
        const swap = button(tr('Passer dans ce camp', 'Switch to this side'), () => this.actions.side(team.id), '', 'arrows-left-right')
        swap.dataset.key = `side-${team.id}`
        swap.disabled = mates.length >= r.size
        side.append(swap)
      }
      sides.append(side)
    }
    card.append(sides)

    card.append(el('span', 'salvage-label', tr('Votre arme', 'Your weapon')), weaponPicker(me.weapon, (id) => this.pick(id)))

    // Réglages : le chef choisit ; les autres les voient.
    const settings = el('div', 'salvage-settings')
    const stepper = (label: string, text: string, value: number, lo: number, hi: number, set: (v: number) => void, key: string) => {
      const box = el('div', 'salvage-stepper')
      box.append(el('span', 'salvage-label', label))
      const minus = button('', () => set(value - 1), '', 'minus')
      minus.setAttribute('aria-label', tr(`${label} : moins`, `${label}: less`))
      minus.dataset.key = `${key}-minus`
      minus.disabled = !leader || value <= lo
      const plus = button('', () => set(value + 1), '', 'plus')
      plus.setAttribute('aria-label', tr(`${label} : plus`, `${label}: more`))
      plus.dataset.key = `${key}-plus`
      plus.disabled = !leader || value >= hi
      box.append(minus, el('strong', 'salvage-value arena-value', text), plus)
      return box
    }
    const crowd = Math.max(1, ...ARENA_TEAMS.map((t) => r.members.filter((m) => m.team === t.id).length))
    settings.append(
      stepper(tr('Format', 'Format'), format(r.size), r.size, crowd, ARENA_RULES.team, (v) => this.actions.settings({ size: v }), 'size'),
      stepper(tr('Bots', 'Bots'), r.bots ? SKILLS[r.skill] : tr('Aucun', 'None'), r.bots ? r.skill : -1, -1, SKILLS.length - 1, (v) => this.actions.settings(v < 0 ? { bots: false } : { bots: true, skill: v }), 'bots'),
    )
    card.append(settings)
    if (!leader) card.append(el('p', 'salvage-note', tr('Le chef du salon règle la partie ; un changement remet tout le monde en attente.', 'The room leader sets the match; any change puts everyone back on standby.')))

    const actions = el('div', 'salvage-actions')
    if (r.status === 'countdown') actions.append(el('strong', 'salvage-countdown', tr(`Départ dans ${Math.ceil(r.startsIn ?? 0)} s…`, `Starting in ${Math.ceil(r.startsIn ?? 0)} s…`)))
    const ready = button(me.ready ? tr('Finalement, pas prêt', 'Not ready after all') : tr('Je suis prêt', 'I\'m ready'), () => this.actions.ready(!me.ready), me.ready ? '' : 'salvage-primary', me.ready ? 'x' : 'check')
    ready.dataset.key = 'ready'
    const leave = button(tr('Quitter le salon', 'Leave the room'), () => this.actions.leave(), 'salvage-quiet', 'sign-out')
    leave.dataset.key = 'leave'
    actions.append(ready, leave)
    card.append(actions)
    return card
  }
}

/** Ce que le HUD montre d'un combattant dans le fil des éliminations. */
export interface FeedName { name: string; team: number }

/** En partie : le score et le chrono, les points de vie, le fil des éliminations, l'attente, la fin. */
export class ArenaHud {
  private readonly root = el('div', 'arena-hud')
  private readonly scores = [el('strong', 'arena-score team0'), el('strong', 'arena-score team1')]
  private readonly clock = el('span', 'arena-clock')
  private readonly goal = el('span', 'arena-goal')
  private readonly health = el('div', 'arena-health')
  private readonly healthFill = el('i')
  private readonly healthValue = el('strong')
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
    this.health.append(icon('heart'), el('div', 'arena-health-bar'), this.healthValue)
    this.health.querySelector('.arena-health-bar')!.append(this.healthFill)
    this.quit = button(tr('Quitter', 'Leave'), () => this.onQuit?.(), 'arena-quit', 'sign-out')
    this.wait.hidden = true
    this.wait.append(this.waitTitle, this.waitClock, el('span', 'arena-wait-label', tr('Arme au retour', 'Weapon on return')), this.waitPick)
    this.count.setAttribute('aria-live', 'assertive')
    this.feed.setAttribute('aria-live', 'polite')
    this.root.append(board, this.health, this.feed, this.quit, this.count, this.wait)
    this.end.hidden = true
    this.end.setAttribute('role', 'dialog')
    this.end.setAttribute('aria-modal', 'true')
    document.body.append(this.root, this.vignette, this.end)
  }

  get endOpen() {
    return !this.end.hidden
  }

  show(on: boolean, team = 0) {
    this.root.hidden = !on
    this.root.dataset.team = String(team)
    this.quit.hidden = false
    if (!on) {
      this.wait.hidden = true
      this.feed.replaceChildren()
      this.count.textContent = this.shownCount = ''
    }
  }

  /** @param left secondes restantes ; `warmup` : secondes avant le coup d'envoi (0 : c'est parti) */
  board(score: [number, number], goal: number, left: number, warmup: number) {
    this.scores.forEach((node, i) => (node.textContent = String(score[i])))
    const seconds = Math.ceil(left)
    this.clock.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
    this.clock.classList.toggle('low', warmup <= 0 && left <= 30)
    this.goal.textContent = tr(`Objectif ${goal}`, `First to ${goal}`)
    // Le décompte du coup d'envoi, puis « Feu ! » un instant.
    const text = warmup > 0 ? String(Math.ceil(warmup)) : this.shownCount && this.shownCount !== 'go' ? 'go' : this.shownCount
    if (text === this.shownCount) return
    this.shownCount = text
    this.count.textContent = text === 'go' ? tr('Feu !', 'Fire!') : text
    this.count.classList.remove('pop')
    void this.count.offsetWidth
    this.count.classList.add('pop')
    if (text === 'go') window.setTimeout(() => { if (this.shownCount === 'go') this.count.textContent = this.shownCount = '' }, 900)
  }

  /** Points de vie du joueur ; `shield` : protégé, à son retour à la base. */
  life(hp: number, shield: boolean) {
    const k = Math.max(0, Math.min(1, hp / ARENA_RULES.hp))
    this.healthFill.style.width = `${(k * 100).toFixed(0)}%`
    this.healthValue.textContent = String(Math.max(0, Math.round(hp)))
    this.health.classList.toggle('low', k > 0 && k <= 0.35)
    this.health.classList.toggle('shield', shield)
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
    if (by) li.append(el('span', `team${by.team}`, by.name))
    li.append(icon('crosshair'), el('em', '', weaponById(weapon)?.name ?? ''), el('span', `team${victim.team}`, victim.name))
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

  /** Le tableau de fin : qui gagne, le score, et les chiffres de chacun, camp par camp. */
  showEnd(r: ArenaEnd, team: number, self: number, onBack: () => void) {
    this.end.replaceChildren()
    this.quit.hidden = true
    const won = r.winner === team
    const head = el('header', 'salvage-head')
    head.append(
      el('span', 'salvage-kicker', tr('FIN DE LA PARTIE', 'MATCH OVER')),
      el('h2', '', r.winner < 0 ? tr('Égalité', 'Draw') : won ? tr('Victoire', 'Victory') : tr('Défaite', 'Defeat')),
    )
    const body = el('div', 'salvage-body')
    const score = el('p', 'arena-end-score')
    score.append(el('strong', 'team0', String(r.score[0])), ' – ', el('strong', 'team1', String(r.score[1])))
    body.append(score)
    body.append(el('p', 'salvage-intro', r.reason === 'forfeit'
      ? tr('L\'équipe d\'en face a quitté l\'arène.', 'The other team left the arena.')
      : r.reason === 'time'
        ? tr('Le temps est écoulé.', 'Time is up.')
        : tr(`Objectif atteint : ${r.goal} éliminations.`, `Goal reached: ${r.goal} kills.`)))
    const table = el('table', 'salvage-table arena-table')
    const header = el('tr')
    for (const label of [tr('Combattant', 'Fighter'), tr('Élim.', 'Kills'), tr('Morts', 'Deaths'), tr('Dégâts', 'Damage')]) header.append(el('th', '', label))
    table.append(header)
    const order = (a: ArenaStats, b: ArenaStats) => a.team - b.team || b.kills - a.kills || b.damage - a.damage
    for (const s of [...r.stats].sort(order)) {
      const row = el('tr', `team${s.team}${s.id === self ? ' self' : ''}`)
      const name = el('td')
      if (s.bot) name.append(icon('robot'))
      name.append(s.name)
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
