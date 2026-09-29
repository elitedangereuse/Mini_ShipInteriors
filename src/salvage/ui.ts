import { ECONOMY, formatCredits } from '../economy/data'
import { EN, tr } from '../i18n'
import { icon, type IconName } from '../icons'
import type { SalvageEnd, SalvageLobby, SalvageStatus, SalvageTeam } from '../net'
import { RULES, salvageReward } from '../../shared/salvage.js'

/*
 * Interface de la zone thargoïde : le terminal de mission du lobby (équipes, réglages, « prêt »),
 * le classement des victoires, puis en mission la barre de l'équipe, l'endurance et le compte à
 * rebours du casier au-dessus du personnage, la caméra alliée des capturés et l'écran de fin.
 */

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (className) e.className = className
  if (text) e.textContent = text
  return e
}

const button = (label: string, onClick: () => void, className = '', iconName?: IconName): HTMLButtonElement => {
  const b = el('button', className)
  b.type = 'button'
  if (iconName) b.append(icon(iconName))
  b.append(label)
  b.onclick = onClick
  return b
}

/** Récompense d'une mission, par CMDR de l'équipe gagnante. */
export const rewardOf = (parcels: number, enemies: number) => salvageReward(ECONOMY.salvage, parcels, enemies)

/** Niveau de menace lisible : ennemis par membre de l'équipe. */
function threat(team: number, enemies: number): { label: string; level: number } {
  const ratio = enemies / Math.max(1, team)
  if (ratio <= 0.5) return { label: tr('Faible', 'Low'), level: 0 }
  if (ratio <= 1) return { label: tr('Sérieuse', 'Serious'), level: 1 }
  if (ratio <= 2) return { label: tr('Élevée', 'High'), level: 2 }
  return { label: tr('Suicidaire', 'Suicidal'), level: 3 }
}

export interface LobbyActions {
  create(): void
  join(team: number): void
  leave(): void
  settings(parcels: number, enemies: number): void
  ready(on: boolean): void
  leaderboard(): void
}

/** Fenêtre modale commune (le terminal, le classement). */
abstract class Modal {
  protected readonly root = el('section', 'salvage-panel')
  protected readonly body = el('div', 'salvage-body')
  private previousFocus: HTMLElement | null = null
  onClose?: () => void

  constructor(kicker: string, title: string) {
    this.root.hidden = true
    this.root.setAttribute('role', 'dialog')
    this.root.setAttribute('aria-modal', 'true')
    const head = el('header', 'salvage-head')
    const h = el('h2', '', title)
    h.id = `salvage-${Math.random().toString(36).slice(2, 8)}`
    this.root.setAttribute('aria-labelledby', h.id)
    head.append(el('span', 'salvage-kicker', kicker), h)
    const close = button('×', () => this.close(), 'salvage-close')
    close.setAttribute('aria-label', tr('Fermer', 'Close'))
    this.root.append(close, head, this.body)
    document.body.append(this.root)
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close()
      e.stopPropagation()
    })
  }

  get isOpen() {
    return !this.root.hidden
  }

  contains(target: EventTarget | null) {
    return target instanceof Node && this.root.contains(target)
  }

  protected show() {
    if (this.isOpen) return
    this.previousFocus = document.activeElement as HTMLElement
    this.root.hidden = false
    this.root.querySelector<HTMLButtonElement>('.salvage-body button, .salvage-close')?.focus()
  }

  close() {
    if (!this.isOpen) return
    this.root.hidden = true
    this.previousFocus?.focus?.()
    this.onClose?.()
  }
}

/** Le terminal de mission : former une équipe, régler la mission, se déclarer prêt. */
export class LobbyPanel extends Modal {
  private lobby: SalvageLobby = { teams: [] }
  private self = -1
  private online = false
  private guest = true
  private status = ''

  constructor(private actions: LobbyActions) {
    super(tr('ZONE THARGOÏDE · SAS DE LA CALE', 'THARGOID ZONE · HOLD AIRLOCK'), tr('Récupération de cargaison', 'Cargo recovery'))
    this.root.classList.add('salvage-lobby')
  }

  open() {
    this.status = ''
    this.render()
    this.show()
  }

  update(lobby: SalvageLobby, self: number, online: boolean, guest: boolean) {
    this.lobby = lobby
    this.self = self
    this.online = online
    this.guest = guest
    if (this.isOpen) this.render()
  }

  message(text: string) {
    this.status = text
    if (this.isOpen) this.render()
  }

  get team(): SalvageTeam | null {
    return this.lobby.teams.find((t) => t.members.some((m) => m.id === this.self)) ?? null
  }

  private render() {
    const focused = document.activeElement instanceof HTMLElement && this.root.contains(document.activeElement) ? document.activeElement.dataset.key : undefined
    this.body.replaceChildren()
    const intro = el('p', 'salvage-intro')
    intro.textContent = tr(
      'Une baie de stockage infestée, plongée dans le noir. Trouvez les colis et rapportez-les au sas d\'extraction, sans vous faire attraper. En solo ou jusqu\'à quatre.',
      'An infested storage bay, pitch dark. Find the crates and bring them back to the extraction airlock without getting caught. Solo or up to four.',
    )
    this.body.append(intro)
    if (!this.online) {
      this.body.append(el('p', 'salvage-warn', tr('Relais injoignable : la zone thargoïde se joue en ligne. Réessayez dans un instant.', 'Relay unreachable: the Thargoid zone is played online. Try again in a moment.')))
      return
    }
    const team = this.team
    if (team) this.body.append(this.teamCard(team))
    else {
      const list = el('div', 'salvage-teams')
      const others = this.lobby.teams
      if (!others.length) list.append(el('p', 'salvage-empty', tr('Aucune équipe pour l\'instant. Créez la vôtre, pour y aller seul ou pour attendre du renfort.', 'No crew yet. Create yours, to go alone or to wait for backup.')))
      for (const t of others) list.append(this.teamRow(t))
      this.body.append(list)
      const create = button(tr('Créer une équipe', 'Create a crew'), () => this.actions.create(), 'salvage-primary', 'users-three')
      create.dataset.key = 'create'
      this.body.append(create)
    }
    const footer = el('div', 'salvage-footer')
    const board = button(tr('Classement des victoires', 'Victory leaderboard'), () => this.actions.leaderboard(), 'salvage-link', 'trophy')
    footer.append(board)
    if (this.guest) footer.append(el('span', 'salvage-note', tr('Invité : vous jouez, mais seuls les CMDR connectés au site gagnent des crédits.', 'Guest: you can play, but only CMDRs logged in to the site earn credits.')))
    this.body.append(footer)
    if (this.status) this.body.append(el('p', 'salvage-status', this.status))
    if (focused) this.body.querySelector<HTMLElement>(`[data-key="${focused}"]`)?.focus()
  }

  private teamRow(t: SalvageTeam): HTMLElement {
    const row = el('div', 'salvage-team-row')
    const leader = t.members.find((m) => m.id === t.leader)
    const info = el('div', 'salvage-team-info')
    info.append(el('strong', '', tr(`Équipe de ${leader?.name ?? '?'}`, `${leader?.name ?? '?'}'s crew`)))
    const detail = t.status === 'playing'
      ? tr(`En mission · ${t.delivered ?? 0}/${t.parcels} colis · ${t.alive ?? 0} encore debout`, `On a mission · ${t.delivered ?? 0}/${t.parcels} crates · ${t.alive ?? 0} still standing`)
      : tr(`${t.members.length}/${RULES.team} CMDR · ${t.parcels} colis · ${t.enemies} ennemi${t.enemies > 1 ? 's' : ''}`, `${t.members.length}/${RULES.team} CMDRs · ${t.parcels} crate${t.parcels > 1 ? 's' : ''} · ${t.enemies} ${t.enemies > 1 ? 'enemies' : 'enemy'}`)
    info.append(el('span', '', detail))
    row.append(info)
    if (t.status !== 'playing') {
      const join = button(tr('Rejoindre', 'Join'), () => this.actions.join(t.id), '', 'user-plus')
      join.dataset.key = `join-${t.id}`
      join.disabled = t.members.length >= RULES.team
      row.append(join)
    }
    return row
  }

  private teamCard(t: SalvageTeam): HTMLElement {
    const card = el('div', 'salvage-team')
    const leader = t.leader === this.self
    const members = el('ul', 'salvage-members')
    for (const m of t.members) {
      const li = el('li', m.ready ? 'ready' : '')
      if (m.id === t.leader) li.append(icon('crown', 'salvage-crown'))
      li.append(el('span', 'salvage-name', m.name + (m.id === this.self ? tr(' (vous)', ' (you)') : '')))
      li.append(el('span', 'salvage-ready', m.ready ? tr('Prêt', 'Ready') : tr('En attente', 'Waiting')))
      members.append(li)
    }
    for (let i = t.members.length; i < RULES.team; i++) members.append(el('li', 'free', tr('Place libre', 'Open slot')))
    card.append(members)

    // Réglages : le chef choisit ; les autres les voient.
    const settings = el('div', 'salvage-settings')
    const stepper = (label: string, value: number, lo: number, hi: number, set: (v: number) => void, key: string) => {
      const box = el('div', 'salvage-stepper')
      box.append(el('span', 'salvage-label', label))
      const minus = button('', () => set(value - 1), '', 'minus')
      minus.setAttribute('aria-label', tr(`${label} : moins`, `${label}: fewer`))
      minus.dataset.key = `${key}-minus`
      minus.disabled = !leader || value <= lo || t.status === 'playing'
      const plus = button('', () => set(value + 1), '', 'plus')
      plus.setAttribute('aria-label', tr(`${label} : plus`, `${label}: more`))
      plus.dataset.key = `${key}-plus`
      plus.disabled = !leader || value >= hi || t.status === 'playing'
      box.append(minus, el('strong', 'salvage-value', String(value)), plus)
      return box
    }
    settings.append(
      stepper(tr('Colis à récupérer', 'Crates to recover'), t.parcels, RULES.parcels.min, RULES.parcels.max, (v) => this.actions.settings(v, t.enemies), 'parcels'),
      stepper(tr('Ennemis', 'Enemies'), t.enemies, RULES.enemies.min, RULES.enemies.max, (v) => this.actions.settings(t.parcels, v), 'enemies'),
    )
    card.append(settings)
    const menace = threat(t.members.length, t.enemies)
    const summary = el('p', 'salvage-summary')
    summary.append(
      el('span', `salvage-threat t${menace.level}`, tr(`Menace : ${menace.label}`, `Threat: ${menace.label}`)),
      el('span', 'salvage-reward', tr(`Récompense : ${formatCredits(rewardOf(t.parcels, t.enemies))} par CMDR`, `Reward: ${formatCredits(rewardOf(t.parcels, t.enemies))} per CMDR`)),
    )
    card.append(summary)
    if (!leader) card.append(el('p', 'salvage-note', tr('Le chef d\'équipe règle la mission ; un changement remet tout le monde en attente.', 'The crew leader sets the mission; any change puts everyone back on standby.')))

    const actions = el('div', 'salvage-actions')
    const me = t.members.find((m) => m.id === this.self)
    if (t.status === 'countdown') actions.append(el('strong', 'salvage-countdown', tr(`Départ dans ${Math.ceil(t.startsIn ?? 0)} s…`, `Leaving in ${Math.ceil(t.startsIn ?? 0)} s…`)))
    const ready = button(me?.ready ? tr('Finalement, pas prêt', 'Not ready after all') : tr('Je suis prêt', 'I\'m ready'), () => this.actions.ready(!me?.ready), me?.ready ? '' : 'salvage-primary', me?.ready ? 'x' : 'check')
    ready.dataset.key = 'ready'
    const leave = button(tr('Quitter l\'équipe', 'Leave the crew'), () => this.actions.leave(), 'salvage-quiet', 'sign-out')
    leave.dataset.key = 'leave'
    actions.append(ready, leave)
    card.append(actions)
    card.append(el('p', 'salvage-rules', tr(
      'E : ramasser, se cacher · Maj : courir (bruyant, épuisant) · F : lancer une fusée · un colis ralentit son porteur · rapportez-le au sas.',
      'E: pick up, hide · Shift: run (noisy, tiring) · F: throw a flare · a crate slows its carrier · bring it to the airlock.',
    )))
    return card
  }
}

interface BoardRow { name: string; url?: string; wins: number; parcels: number; games: number }

/** Le classement des victoires (le site le garde). */
export class LeaderboardPanel extends Modal {
  private revision = 0

  constructor() {
    super(tr('ZONE THARGOÏDE', 'THARGOID ZONE'), tr('Missions réussies', 'Successful missions'))
    this.root.classList.add('salvage-board')
  }

  async open() {
    const token = ++this.revision
    this.body.replaceChildren(el('p', 'salvage-intro', tr('Chargement…', 'Loading…')))
    this.show()
    let reply: { status?: string; top?: BoardRow[]; me?: { wins: number; rank: number } | null } | null = null
    try {
      const res = await fetch(SALVAGE_URL, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) })
      reply = await res.json()
    } catch {
      reply = null
    }
    if (token !== this.revision) return
    this.body.replaceChildren()
    if (reply?.status !== 'success' || !Array.isArray(reply.top)) {
      this.body.append(el('p', 'salvage-warn', tr('Le site ne répond pas. Fermez puis réessayez.', 'The site is unavailable. Close and try again.')))
      return
    }
    this.body.append(el('p', 'salvage-intro', tr(
      'Victoires de chaque CMDR (chaque membre d\'une équipe gagnante, même capturé). À égalité, le plus de colis rapportés, puis la première victoire.',
      'Wins per CMDR (every member of a winning crew, even if caught). Ties go to the most crates delivered, then the earliest win.',
    )))
    const table = el('table', 'salvage-table')
    const head = el('tr')
    for (const h of ['#', 'CMDR', tr('Victoires', 'Wins'), tr('Colis', 'Crates')]) head.append(el('th', '', h))
    table.append(el('thead'), el('tbody'))
    table.tHead!.append(head)
    if (!reply.top.length) {
      const tr_ = el('tr')
      const td = el('td', 'salvage-empty', tr('Personne n\'est encore revenu de la zone avec toute la cargaison.', 'Nobody has made it back from the zone with the whole cargo yet.'))
      td.colSpan = 4
      tr_.append(td)
      table.tBodies[0].append(tr_)
    }
    reply.top.forEach((r, i) => {
      const row = el('tr')
      row.append(el('td', '', String(i + 1)))
      const name = el('td')
      if (r.url) {
        const a = el('a', '', r.name)
        a.href = r.url
        a.target = '_blank'
        a.rel = 'noopener'
        name.append(a)
      } else name.textContent = r.name
      row.append(name, el('td', '', String(r.wins)), el('td', '', String(r.parcels)))
      table.tBodies[0].append(row)
    })
    this.body.append(table)
    if (reply.me) this.body.append(el('p', 'salvage-note', tr(`Vous : ${reply.me.wins} victoire${reply.me.wins > 1 ? 's' : ''}, ${reply.me.rank}ᵉ.`, `You: ${reply.me.wins} win${reply.me.wins > 1 ? 's' : ''}, rank ${reply.me.rank}.`)))
  }
}

export const SALVAGE_URL = import.meta.env.VITE_ED_SALVAGE_URL || '/outils/mini-shipinteriors-salvage.php'

export interface HudMember { id: number; name: string; status: SalvageStatus; carrying: boolean; hidden: boolean }

const STATUS_ICON: Record<string, IconName> = { alive: 'user-solo', arriving: 'user-solo', captured: 'skull', left: 'sign-out', gone: 'sign-out', away: 'cloud-slash' }

/** En mission : l'équipe, la progression, les fusées, l'endurance et le casier près du personnage. */
export class MissionHud {
  private readonly root = el('div', 'salvage-hud')
  private readonly title = el('div', 'salvage-hud-title')
  private readonly progress = el('div', 'salvage-hud-progress')
  private readonly crew = el('ul', 'salvage-hud-crew')
  private readonly flares = el('div', 'salvage-hud-flares')
  private readonly hint = el('div', 'salvage-hud-hint')
  private readonly quit: HTMLButtonElement
  readonly stamina = el('div', 'salvage-stamina')
  private readonly staminaFill = el('div', 'salvage-stamina-fill')
  readonly locker = el('div', 'salvage-locker')
  private readonly spectator = el('div', 'salvage-spectator')
  private readonly spectatorName = el('strong')
  private readonly vignette = el('div', 'salvage-vignette')
  private readonly end = el('section', 'salvage-panel salvage-end')
  private crewKey = ''
  onQuit?: () => void
  onThrow?: () => void
  onCamera?: (step: 1 | -1) => void
  onCameraClose?: () => void

  constructor() {
    this.root.hidden = true
    const top = el('div', 'salvage-hud-top')
    top.append(this.title, this.progress)
    this.quit = button(tr('Abandonner', 'Abort'), () => this.onQuit?.(), 'salvage-hud-quit', 'sign-out')
    this.flares.onclick = () => this.onThrow?.()
    this.flares.setAttribute('role', 'button')
    this.flares.tabIndex = -1
    this.root.append(top, this.crew, this.flares, this.quit, this.hint)
    this.stamina.hidden = true
    this.stamina.append(this.staminaFill)
    this.locker.hidden = true
    this.spectator.hidden = true
    const prev = button('', () => this.onCamera?.(-1), '', 'caret-left')
    prev.setAttribute('aria-label', tr('Caméra précédente', 'Previous camera'))
    const next = button('', () => this.onCamera?.(1), '', 'caret-right')
    next.setAttribute('aria-label', tr('Caméra suivante', 'Next camera'))
    const leave = button(tr('Quitter les caméras', 'Leave the cameras'), () => this.onCameraClose?.(), 'salvage-quiet', 'sign-out')
    const label = el('div', 'salvage-spectator-label')
    label.append(icon('video-camera'), el('span', '', tr('CAMÉRA ALLIÉE', 'ALLY CAMERA')), this.spectatorName)
    this.spectator.append(label, prev, next, leave)
    this.vignette.hidden = true
    this.end.hidden = true
    this.end.setAttribute('role', 'dialog')
    document.body.append(this.vignette, this.root, this.stamina, this.locker, this.spectator, this.end)
  }

  show(on: boolean) {
    this.root.hidden = !on
    if (!on) {
      this.stamina.hidden = true
      this.locker.hidden = true
      this.peek(false)
    }
    document.body.classList.toggle('in-zone', on)
  }

  mission(delivered: number, parcels: number) {
    this.title.replaceChildren(icon('package'), el('span', '', tr('Récupération de cargaison', 'Cargo recovery')))
    this.progress.textContent = tr(`${delivered} / ${parcels} colis rapportés`, `${delivered} / ${parcels} crates delivered`)
  }

  team(members: HudMember[], self: number) {
    const key = JSON.stringify(members)
    if (key === this.crewKey) return
    this.crewKey = key
    this.crew.replaceChildren()
    for (const m of members) {
      const li = el('li', `s-${m.status}${m.id === self ? ' self' : ''}`)
      li.append(icon(m.hidden ? 'eye-closed' : m.carrying ? 'package' : STATUS_ICON[m.status] ?? 'user-solo'), el('span', '', m.name))
      li.title = m.status === 'captured' ? tr('Capturé', 'Caught') : m.status === 'left' || m.status === 'gone' ? tr('Parti', 'Gone')
        : m.status === 'away' ? tr('Liaison perdue : sa place l\'attend', 'Lost contact: place kept') : m.hidden ? tr('Caché', 'Hidden') : m.carrying ? tr('Porte un colis', 'Carrying a crate') : tr('Actif', 'Active')
      this.crew.append(li)
    }
  }

  setFlares(count: number, canThrow: boolean) {
    this.flares.replaceChildren(icon('flame'), el('span', '', tr(`Fusées ${count}/${RULES.flare.carry}`, `Flares ${count}/${RULES.flare.carry}`)), el('kbd', '', 'F'))
    this.flares.classList.toggle('empty', count === 0)
    this.flares.classList.toggle('ready', canThrow && count > 0)
  }

  setHint(text: string) {
    if (this.hint.textContent !== text) this.hint.textContent = text
  }

  canQuit(on: boolean) {
    this.quit.hidden = !on
  }

  /** Barre d'endurance au-dessus du personnage (x, y en pixels) ; masquée pleine. */
  placeStamina(x: number, y: number, value: number, exhausted: boolean, visible: boolean) {
    this.stamina.hidden = !visible
    if (!visible) return
    this.stamina.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`
    this.staminaFill.style.width = `${Math.round(value * 100)}%`
    this.stamina.classList.toggle('exhausted', exhausted)
  }

  /** Compte à rebours du casier, au-dessus du personnage caché. */
  placeLocker(x: number, y: number, left: number | null) {
    this.locker.hidden = left === null
    if (left === null) return
    this.locker.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`
    const s = Math.ceil(left)
    this.locker.textContent = tr(`Caché · ${s} s`, `Hidden · ${s} s`)
    this.locker.classList.toggle('urgent', left < 5)
  }

  /** Caché dans un casier : on regarde dehors entre les fentes de la porte. */
  peek(on: boolean) {
    if (document.body.classList.contains('salvage-hidden') !== on) document.body.classList.toggle('salvage-hidden', on)
  }

  /** Caméra alliée : le nom du coéquipier suivi, ou null pour la fermer. */
  camera(name: string | null) {
    this.spectator.hidden = name === null
    document.body.classList.toggle('salvage-watching', name !== null)
    if (name !== null) this.spectatorName.textContent = name
  }

  /** Voile rouge d'une capture (ou d'un coéquipier capturé, plus léger). */
  flash(strong = true) {
    this.vignette.hidden = false
    this.vignette.classList.remove('flash', 'soft')
    void this.vignette.offsetWidth
    this.vignette.classList.add(strong ? 'flash' : 'soft')
    window.setTimeout(() => (this.vignette.hidden = true), strong ? 1900 : 900)
  }

  /** Écran de fin de mission. */
  showEnd(r: SalvageEnd, guest: boolean, onBack: () => void) {
    this.end.replaceChildren()
    const head = el('header', 'salvage-head')
    head.append(el('span', 'salvage-kicker', tr('FIN DE MISSION', 'MISSION OVER')), el('h2', '', r.won ? tr('Cargaison récupérée', 'Cargo recovered') : r.reason === 'timeout' ? tr('Mission annulée', 'Mission cancelled') : tr('Équipe perdue', 'Crew lost')))
    this.end.append(head)
    const body = el('div', 'salvage-body')
    const minutes = Math.floor(r.duration / 60), seconds = r.duration % 60
    const time = EN ? `${minutes} min ${seconds} s` : `${minutes} min ${seconds} s`
    body.append(el('p', 'salvage-intro', r.won
      ? r.parcels > 1
        ? tr(`Les ${r.parcels} colis sont à bord, en ${time}. Beau travail, CMDR.`, `All ${r.parcels} crates are aboard, in ${time}. Nice work, CMDR.`)
        : tr(`Le colis est à bord, en ${time}. Beau travail, CMDR.`, `The crate is aboard, in ${time}. Nice work, CMDR.`)
      : tr(`Colis rapportés : ${r.delivered} sur ${r.parcels}, en ${time}. La baie garde le reste.`, `Crates delivered: ${r.delivered} of ${r.parcels}, in ${time}. The bay keeps the rest.`)))
    const reward = el('p', 'salvage-end-reward')
    if (r.won) reward.textContent = guest
      ? tr('Invité : pas de crédits, mais l\'honneur est sauf.', 'Guest: no credits, but honour is safe.')
      : tr(`Récompense : ${formatCredits(rewardOf(r.parcels, r.enemies))} (versement par le site…)`, `Reward: ${formatCredits(rewardOf(r.parcels, r.enemies))} (the site is paying…)`)
    body.append(reward)
    const back = button(tr('Retour au lobby', 'Back to the lobby'), () => {
      this.end.hidden = true
      onBack()
    }, 'salvage-primary', 'door-open')
    body.append(back)
    this.end.append(body)
    this.end.hidden = false
    this.end.classList.toggle('won', r.won)
    back.focus()
  }

  /** Les crédits sont arrivés (ou pas). */
  paid(earned: number | null) {
    const reward = this.end.querySelector('.salvage-end-reward')
    if (!reward) return
    reward.textContent = earned
      ? tr(`Récompense versée : ${formatCredits(earned)}.`, `Reward paid: ${formatCredits(earned)}.`)
      : tr('Le site n\'a pas encore versé la récompense.', 'The site hasn\'t paid the reward yet.')
  }

  get endOpen() {
    return !this.end.hidden
  }

  closeEnd() {
    this.end.hidden = true
  }
}
