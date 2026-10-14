import { ECONOMY, formatCredits } from '../economy/data'
import { EN, tr } from '../i18n'
import { icon } from '../icons'
import type { MessCrew, MessEnd, MessLobby, MessReward, MessTeam } from '../net'
import { button, el, Modal } from '../salvage/ui'
import { DIFFICULTIES, INGREDIENTS, PROCESSES, RECIPES, SERVICE_RECIPES, type Text } from '../../shared/mess-rush-catalog.js'
import { RULES, currentMedal, medalOf, recipeValue, type Medal, type ServiceState } from '../../shared/mess-rush.js'
import { stateLabel } from './props'

/*
 * L'interface de MESS RUSH, sur le modèle de CMDR Arena : le salon au rail des bons (les quatre
 * salons à gauche, le sien à droite, son équipe, « prêt »), le bandeau du service en cuisine (le
 * temps, le score, le combo, la médaille, et les bons des commandes) et l'écran de fin (le
 * verdict, le score, la médaille, les commandes, la récompense).
 */

const text = (t: Text) => (EN ? t.en : t.fr)

export const MEDAL_NAMES: Record<Medal, string> = {
  none: tr('Pas de médaille', 'No medal'),
  bronze: tr('Bronze', 'Bronze'),
  silver: tr('Argent', 'Silver'),
  gold: tr('Or', 'Gold'),
}

/** mm:ss */
export const clock = (s: number) => {
  const t = Math.max(0, Math.ceil(s))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

/** Un ingrédient dans l'état où la recette l'attend : « Lapin cuit », « Café ». */
export function component(ing: string, state: string): string {
  const s = stateLabel(ing, state === 'infusé' ? 'brut' : state)
  return s ? `${text(INGREDIENTS[ing].short)} ${s}` : text(INGREDIENTS[ing].short)
}

/** La semaine du joueur, telle que le site la tient (cf. docs/mess-rush-site.md, `?week=1`). */
export interface MessWeek { booster: 'available' | 'won'; reset?: string; paidToday?: number; daily?: number }

export interface MessPanelActions {
  join(team: number): void
  leave(): void
  ready(on: boolean): void
}

/** Le terminal du rail des bons : à gauche, les quatre salons ; à droite, celui où l'on s'est placé. */
export class MessPanel extends Modal {
  private lobby: MessLobby = { teams: [] }
  private self = -1
  private online = false
  private status = ''
  private weekInfo: MessWeek | null = null

  constructor(private actions: MessPanelActions) {
    super(tr('MESS RUSH · LE SERVICE', 'MESS RUSH · SERVICE'), tr('Cuisine en équipe', 'Team cooking'))
    this.root.classList.add('arena-panel', 'mess-panel')
  }

  open() {
    this.status = ''
    this.render()
    this.show()
  }

  update(lobby: MessLobby, self: number, online: boolean) {
    this.lobby = lobby
    this.self = self
    this.online = online
    if (this.isOpen) this.render()
  }

  message(line: string) {
    this.status = line
    if (this.isOpen) this.render()
  }

  /** La semaine du joueur, ou null (invité, ou le site ne répond pas : on n'annonce rien). */
  week(w: MessWeek | null) {
    this.weekInfo = w
    if (this.isOpen) this.render()
  }

  /** Ce que rapporte une victoire, quand le site le confirme : le booster de la semaine, puis les crédits. */
  private rewards(): HTMLElement | null {
    const w = this.weekInfo
    if (!w) return null
    const box = el('div', 'mess-rewards')
    box.append(el('span', 'arena-heading', tr('Vos récompenses', 'Your rewards')))
    const reset = w.reset ? new Date(w.reset) : null
    const when = reset && !Number.isNaN(reset.getTime()) ? reset.toLocaleString(EN ? 'en-GB' : 'fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' }) : ''
    box.append(el('p', '', w.booster === 'available'
      ? tr('Première victoire de la semaine : un booster de Cartes Dangereuses.', 'First win of the week: a Cartes Dangereuses booster.')
      : tr(`Booster de la semaine déjà gagné${when ? ` ; le prochain se gagne à partir de ${when}` : ''}.`, `This week's booster already won${when ? `; the next one can be won from ${when}` : ''}.`)))
    const e = ECONOMY.messRush
    if (e) {
      const paid = w.paidToday !== undefined ? tr(` (${w.paidToday}/${w.daily ?? e.daily} aujourd'hui)`, ` (${w.paidToday}/${w.daily ?? e.daily} today)`) : ''
      box.append(el('p', '', tr(
        `Les victoires suivantes : ${formatCredits(e.credits.bronze)} en bronze, ${formatCredits(e.credits.silver)} en argent, ${formatCredits(e.credits.gold)} en or ; ${e.daily} victoires payées par jour${paid}.`,
        `Further wins: ${formatCredits(e.credits.bronze)} for bronze, ${formatCredits(e.credits.silver)} for silver, ${formatCredits(e.credits.gold)} for gold; ${e.daily} paid wins a day${paid}.`,
      )))
    }
    return box
  }

  get team(): MessTeam | null {
    return this.lobby.teams.find((t) => t.members.some((m) => m.id === this.self)) ?? null
  }

  private render() {
    const focused = document.activeElement instanceof HTMLElement && this.root.contains(document.activeElement) ? document.activeElement.dataset.key : undefined
    this.body.replaceChildren()
    if (!this.online) {
      this.body.append(el('p', 'salvage-warn', tr('Relais injoignable : MESS RUSH se joue en ligne. Réessayez dans un instant.', 'Relay unreachable: MESS RUSH is played online. Try again in a moment.')))
      return
    }
    const team = this.team
    const layout = el('div', 'arena-layout')
    const rail = el('nav', 'arena-rail')
    rail.setAttribute('aria-label', tr('Salons', 'Lobbies'))
    rail.append(el('span', 'arena-heading', tr('Salons', 'Lobbies')))
    for (const t of this.lobby.teams) rail.append(this.tile(t, team))
    const stage = el('div', 'arena-stage')
    if (team) this.fillTeam(stage, team)
    else this.fillWelcome(stage)
    if (this.status) stage.append(el('p', 'salvage-status', this.status))
    layout.append(rail, stage)
    this.body.append(layout)
    if (focused) this.body.querySelector<HTMLElement>(`[data-key="${focused}"]`)?.focus()
  }

  /** Un salon : son état, une pastille par place, et l'on s'y place d'un clic. */
  private tile(t: MessTeam, mine: MessTeam | null): HTMLElement {
    const own = t === mine
    const playing = t.status === 'playing'
    const full = !own && t.members.length >= RULES.team
    const b = button('', () => { if (!own && !playing) this.actions.join(t.id) }, `arena-tile${own ? ' own' : ''}${playing ? ' playing' : ''}`)
    b.dataset.key = `join-${t.id}`
    b.disabled = !own && (playing || full)
    if (own) b.setAttribute('aria-current', 'true')
    const state = playing ? tr('En service', 'Cooking')
      : t.status === 'countdown' ? tr('Départ', 'Starting')
        : full ? tr('Complet', 'Full')
          : !t.members.length ? tr('Libre', 'Empty')
            : tr('Ouvert', 'Open')
    const head = el('span', 'arena-tile-head')
    head.append(el('strong', '', tr(`Salon ${t.id}`, `Lobby ${t.id}`)), el('span', `arena-badge${playing ? ' live' : !t.members.length ? ' idle' : ''}`, state))
    b.append(head)
    if (playing) b.append(el('span', 'arena-tile-score', tr(`${t.score ?? 0} points · ${clock(t.endsIn ?? 0)} restantes`, `${t.score ?? 0} points · ${clock(t.endsIn ?? 0)} left`)))
    else {
      const pips = el('span', 'arena-pips')
      const row = el('span', 'mess-pips')
      for (let i = 0; i < RULES.team; i++) row.append(el('i', i < t.members.length ? 'on' : ''))
      pips.append(row)
      b.append(pips)
    }
    const names = t.members.map((m) => (m.id === this.self ? tr('vous', 'you') : m.name)).join(', ')
    b.append(el('span', 'arena-tile-detail', t.members.length ? tr(`${t.members.length} en cuisine · service de ${RULES.service / 60} min`, `${t.members.length} cooking · ${RULES.service / 60}-min service`) : tr('Seul ou jusqu\'à quatre', 'Solo or up to four')))
    if (names) b.append(el('span', 'arena-tile-names', names))
    if (own) b.append(el('span', 'arena-tile-own', tr('Votre salon', 'Your lobby')))
    return b
  }

  /** Pas encore placé : ce qu'est MESS RUSH, et ce qu'il y a au menu. */
  private fillWelcome(stage: HTMLElement) {
    const hero = el('div', 'arena-hero')
    hero.append(
      el('strong', '', tr('Placez-vous dans un salon', 'Pick a lobby')),
      el('p', '', tr(
        `Le coup de feu au mess : de un à quatre, vous tenez la cuisine pendant ${RULES.service / 60} minutes. Les bons arrivent au rail ; on prend les ingrédients au frigo et au garde-manger, on rince, on coupe, on fait cuire, on dresse, et l'on pose l'assiette à la passe avant la fin du délai. Le score est celui de toute l'équipe.`,
        `Rush hour in the mess: one to four of you run the kitchen for ${RULES.service / 60} minutes. Tickets come in at the rail; grab ingredients from the fridge and pantry, rinse, chop, cook, plate up, and put the dish on the pass before the timer runs out. The score belongs to the whole team.`,
      )),
    )
    stage.append(hero, ...[this.rewards()].filter((b): b is HTMLElement => !!b), this.menu(), this.controls())
  }

  /** La carte du service, par difficulté : les plats et ce qu'ils valent ; les complexes arrivent en cours de service. */
  private menu(): HTMLElement {
    const box = el('div', 'mess-menu')
    box.append(el('span', 'arena-heading', tr('À la carte', 'On the menu')))
    for (const level of Object.keys(DIFFICULTIES) as (keyof typeof DIFFICULTIES)[]) {
      const ids = SERVICE_RECIPES.filter((id) => RECIPES[id].difficulty === level)
      if (!ids.length) continue
      const head = el('p', 'mess-menu-level')
      head.append(el('strong', '', text(DIFFICULTIES[level].name)))
      if (level === 'complexe') head.append(el('small', '', tr(` · après ${RULES.complexAfter / 60} minutes de service`, ` · after ${RULES.complexAfter / 60} minutes of service`)))
      const list = el('ul')
      for (const id of ids) {
        const li = el('li')
        li.append(el('span', 'mess-menu-dish', text(RECIPES[id].name)), el('span', '', `${recipeValue(id).points} pts`))
        list.append(li)
      }
      box.append(head, list)
    }
    return box
  }

  /** Les deux touches de la cuisine. */
  private controls(): HTMLElement {
    const box = el('p', 'salvage-note')
    box.textContent = tr(
      'E (A / ×) : prendre ou poser. Espace (X / □) : rincer, couper, lancer une cuisson ; au frigo et au garde-manger, changer d\'ingrédient.',
      'E (A / ×): pick up or put down. Space (X / □): rinse, chop, start cooking; at the fridge and pantry, switch ingredient.',
    )
    return box
  }

  /** Son salon : l'équipe, les médailles à viser, « prêt ». */
  private fillTeam(stage: HTMLElement, t: MessTeam) {
    const me = t.members.find((m) => m.id === this.self)!
    const title = el('div', 'arena-title')
    title.append(el('strong', '', tr(`Salon ${t.id}`, `Lobby ${t.id}`)), el('span', '', tr(`Service de ${RULES.service / 60} minutes · score d'équipe`, `${RULES.service / 60}-minute service · team score`)))
    stage.append(title)
    const crew = el('ul', 'arena-slots mess-crew')
    for (const m of t.members) {
      const li = el('li', `arena-slot${m.id === this.self ? ' me' : ''}${m.ready ? ' ready' : ''}`)
      const name = el('span', 'arena-slot-name')
      if (m.id === t.leader) name.append(icon('crown'))
      name.append(icon('chef-hat'), m.name + (m.id === this.self ? tr(' (vous)', ' (you)') : ''))
      li.append(name, el('span', 'arena-slot-state', m.ready ? tr('prêt', 'ready') : tr('en attente', 'waiting')))
      crew.append(li)
    }
    for (let i = t.members.length; i < RULES.team; i++) {
      const li = el('li', 'arena-slot free')
      li.append(el('span', 'arena-slot-name', tr('Place libre', 'Open slot')))
      crew.append(li)
    }
    // Les médailles, pour le nombre de cuisiniers du salon.
    const medals = el('div', 'mess-medals')
    medals.append(el('span', 'arena-heading', tr(`Médailles à ${t.members.length}`, `Medals for ${t.members.length}`)))
    const row = el('div', 'mess-medal-row')
    const [bronze, silver, gold] = RULES.medals[Math.min(4, Math.max(1, t.members.length)) as 1 | 2 | 3 | 4]
    for (const [medal, score] of [['bronze', bronze], ['silver', silver], ['gold', gold]] as const) {
      const m = el('span', `mess-medal ${medal}`)
      m.append(icon('trophy'), `${MEDAL_NAMES[medal]} · ${score}`)
      row.append(m)
    }
    medals.append(row, el('small', '', tr('La médaille de bronze, c\'est la victoire.', 'Bronze means victory.')))
    stage.append(crew, medals, ...[this.rewards()].filter((b): b is HTMLElement => !!b), this.menu(), this.controls())

    const ready = t.members.filter((m) => m.ready).length
    const footer = el('div', 'arena-footer')
    const go = button(
      t.status === 'countdown' ? tr('Départ imminent…', 'Starting…') : me.ready ? tr('Prêt · annuler', 'Ready · cancel') : tr('Je suis prêt', 'I\'m ready'),
      () => this.actions.ready(!me.ready), `arena-ready${me.ready ? ' on' : ''}`, me.ready ? 'check' : 'chef-hat',
    )
    go.dataset.key = 'ready'
    const leave = button(tr('Quitter le salon', 'Leave the lobby'), () => this.actions.leave(), 'arena-leave', 'sign-out')
    leave.dataset.key = 'leave'
    footer.append(go, el('span', 'arena-count-ready', tr(`${ready}/${t.members.length} prêt${ready > 1 ? 's' : ''}`, `${ready}/${t.members.length} ready`)), leave)
    stage.append(footer)
  }
}

/** Le bandeau du service : le temps, le score, le combo, la médaille ; dessous, les bons. */
export class MessHud {
  private readonly root = el('section', 'mess-hud')
  private readonly time = el('strong', 'mess-time')
  private readonly score = el('strong', 'mess-score')
  private readonly combo = el('span', 'mess-combo')
  private readonly medal = el('span', 'mess-medal')
  private readonly crew = el('div', 'mess-crew-row')
  private crewKey = ''
  private readonly tickets = el('div', 'mess-tickets')
  private readonly toasts = el('div', 'mess-toasts')
  private readonly quit: HTMLButtonElement
  private armed = 0
  private shown = ''

  constructor(onQuit: () => void) {
    this.root.hidden = true
    const bar = el('div', 'mess-bar')
    const t = el('span', 'mess-cell')
    t.append(icon('bowl-steam'), this.time)
    const s = el('span', 'mess-cell')
    s.append(el('small', '', tr('Score', 'Score')), this.score)
    bar.append(t, s, this.combo, this.medal)
    // Quitter : deux clics (le premier arme, le second confirme), comme dans la zone thargoïde.
    this.quit = button(tr('Quitter le service', 'Leave service'), () => {
      if (performance.now() < this.armed) {
        this.armed = 0
        onQuit()
      } else {
        this.armed = performance.now() + 3000
        this.quit.lastChild!.textContent = tr('Confirmer ?', 'Confirm?')
      }
    }, 'mess-quit', 'sign-out')
    this.root.append(bar, this.crew, this.tickets, this.toasts, this.quit)
    document.body.append(this.root)
  }

  show() {
    this.root.hidden = false
    document.body.classList.add('mess-on')
  }

  hide() {
    this.root.hidden = true
    this.tickets.replaceChildren()
    this.crew.replaceChildren()
    this.shown = this.crewKey = ''
    document.body.classList.remove('mess-on')
  }

  /**
   * L'équipe, à plusieurs : qui est en cuisine, ce que chacun tient, qui a perdu la liaison (seul,
   * la rangée ne s'affiche pas).
   */
  team(members: { name: string; me: boolean; holding: string; away: boolean }[]) {
    const key = JSON.stringify(members)
    if (key === this.crewKey) return
    this.crewKey = key
    this.crew.hidden = members.length < 2
    this.crew.replaceChildren(...members.map((m) => {
      const chip = el('span', `mess-mate${m.me ? ' me' : ''}${m.away ? ' away' : ''}`)
      chip.append(icon('chef-hat'), el('strong', '', m.name))
      if (m.away) chip.append(el('small', '', tr('liaison perdue', 'link lost')))
      else if (m.holding) chip.append(el('small', '', m.holding))
      return chip
    }))
  }

  /** À chaque image : les chiffres, et les bons (refaits quand les commandes changent). */
  update(state: ServiceState, now: number) {
    this.time.textContent = clock((state.endsAt - now) / 1000)
    this.time.classList.toggle('late', state.endsAt - now < 30000)
    this.score.textContent = String(state.score)
    this.combo.textContent = state.combo > 1 ? `×${state.combo}` : ''
    this.combo.hidden = state.combo < 2
    const medal = currentMedal(state)
    this.medal.className = `mess-medal ${medal}`
    this.medal.replaceChildren(icon('trophy'), MEDAL_NAMES[medal])
    if (this.armed && performance.now() > this.armed) {
      this.armed = 0
      this.quit.lastChild!.textContent = tr('Quitter le service', 'Leave service')
    }
    const pending = state.orders.filter((o) => o.status === 'pending').sort((a, b) => a.at - b.at)
    const key = pending.map((o) => o.id).join(',')
    if (key !== this.shown) {
      this.shown = key
      this.tickets.replaceChildren(...pending.map((o) => this.ticket(o.id, o.recipe)))
    }
    // Le délai de chaque bon : une barre qui se vide, du vert au rouge.
    for (const o of pending) {
      const bar = this.tickets.querySelector<HTMLElement>(`[data-order="${o.id}"] .mess-ticket-time`)
      if (!bar) continue
      const left = Math.max(0, Math.min(1, (o.until - now) / (o.until - o.at)))
      bar.style.setProperty('--left', String(left))
      bar.dataset.level = left > 0.5 ? 'ok' : left > 0.25 ? 'warn' : 'late'
    }
  }

  /** Un bon : le plat, ce qu'il faut dans l'assiette (ou la tasse), et son délai. */
  private ticket(id: string, recipeId: string): HTMLElement {
    const r = RECIPES[recipeId]
    const card = el('article', `mess-ticket ${r.difficulty}`)
    card.dataset.order = id
    card.append(el('strong', '', text(r.name)))
    const list = el('ul')
    for (const [ing, state] of r.dish.contents) {
      const how = INGREDIENTS[ing].cook[0] ? text(PROCESSES[INGREDIENTS[ing].cook[0]].verb) : ''
      const li = el('li', '', component(ing, state))
      if (how && state === 'infusé') li.textContent = `${text(INGREDIENTS[ing].short)} · ${tr('fontaine', 'fountain')}`
      list.append(li)
    }
    list.append(el('li', 'mess-ticket-dish', r.dish.container === 'cup' ? tr('en tasse', 'in a cup') : tr('en assiette', 'on a plate')))
    card.append(list, el('i', 'mess-ticket-time'))
    return card
  }

  /** Une ligne qui monte au-dessus des bons (livraison, expiration, refus), quelques secondes. */
  toast(line: string, kind: 'good' | 'bad' | 'info' = 'info') {
    const t = el('p', `mess-toast ${kind}`, line)
    this.toasts.append(t)
    setTimeout(() => t.remove(), 2600)
    while (this.toasts.childElementCount > 4) this.toasts.firstElementChild?.remove()
  }
}

/** L'écran de fin, façon CMDR Arena : le verdict, le score et la médaille, les commandes, la récompense. */
export class MessEndScreen {
  private readonly root = el('section', 'arena-end mess-end')
  private reward = el('p', 'mess-end-reward')
  private game = ''
  private waiting = 0

  constructor() {
    this.root.hidden = true
    document.body.append(this.root)
  }

  get isOpen() {
    return !this.root.hidden
  }

  contains(target: EventTarget | null) {
    return target instanceof Node && this.root.contains(target)
  }

  /** @param verified le joueur est un CMDR (un invité ne gagne rien) */
  show(r: MessEnd, verified: boolean, onBack: () => void) {
    this.game = r.game
    this.root.replaceChildren()
    const won = r.reason === 'end' && !!r.won
    const verdict = r.reason === 'abandoned' ? 'draw' : won ? 'won' : 'lost'
    const head = el('header', `arena-end-head ${verdict}`)
    const medal: Medal = r.medal ?? medalOf(r.score, r.players)
    const score = el('p', 'arena-end-score')
    score.append(el('strong', 'self', String(r.score)), el('i', '', tr('points', 'points')))
    const badge = el('span', `mess-medal big ${medal}`)
    badge.append(icon('trophy'), MEDAL_NAMES[medal])
    head.append(
      el('h2', '', r.reason === 'abandoned' ? tr('Service abandonné', 'Service abandoned') : won ? tr('Victoire !', 'Victory!') : tr('Service raté', 'Service missed')),
      score,
      badge,
      el('p', 'arena-end-note', tr(
        `${r.served} commande${r.served > 1 ? 's' : ''} servie${r.served > 1 ? 's' : ''} · ${r.expired} expirée${r.expired > 1 ? 's' : ''} · meilleur combo ×${Math.max(1, r.bestCombo)}`,
        `${r.served} order${r.served > 1 ? 's' : ''} served · ${r.expired} expired · best combo ×${Math.max(1, r.bestCombo)}`,
      )),
    )
    const card = el('div', 'mess-end-card')
    card.append(el('span', 'arena-heading', tr('La brigade', 'The crew')), el('p', 'mess-end-crew', r.members.map((m: MessCrew) => m.name).join(', ')))
    // Les commandes du service : servies (et leurs points), expirées.
    const done = r.orders.filter((o) => o.status !== 'pending')
    if (done.length) {
      const table = el('table', 'mess-end-orders')
      for (const o of done) {
        const tr_ = el('tr', o.status)
        tr_.append(el('td', '', text(RECIPES[o.recipe].name)), el('td', '', o.status === 'served' ? tr('servie', 'served') : tr('expirée', 'expired')), el('td', '', o.status === 'served' ? `+${o.points}` : ''))
        table.append(tr_)
      }
      card.append(el('span', 'arena-heading', tr('Les commandes', 'The orders')), table)
    }
    if (r.wasted) card.append(el('p', 'salvage-note', tr(`Gaspillage : ${r.wasted} (sans pénalité pour l'instant).`, `Waste: ${r.wasted} (no penalty for now).`)))
    // La récompense : seulement ce que le site a confirmé (cf. reward).
    this.reward = el('p', 'mess-end-reward')
    if (r.reason === 'abandoned') this.reward.textContent = tr('Un service abandonné ne compte pas.', 'An abandoned service does not count.')
    else if (!won) this.reward.textContent = tr('Il faut au moins la médaille de bronze pour gagner.', 'You need at least the bronze medal to win.')
    else if (!verified) this.reward.textContent = tr('Connectez-vous sur le site pour gagner des récompenses.', 'Log in to the site to earn rewards.')
    else {
      // Le relais présente la victoire au site : sa réponse suit (cf. rewarded).
      this.reward.classList.add('pending')
      this.reward.textContent = tr('Envoi du résultat au site…', 'Sending the result to the site…')
    }
    card.append(this.reward)
    const back = button(tr('Retour au mess', 'Back to the mess'), () => {
      this.close()
      onBack()
    }, 'arena-back', 'door-open')
    this.root.append(head, card, back)
    this.root.className = `arena-end mess-end ${verdict}`
    this.root.hidden = false
    document.body.classList.add('mess-end-on')
    back.focus()
  }

  /**
   * La récompense, telle que le site l'a confirmée (ou l'attente de sa réponse). On n'annonce
   * jamais ce qui n'a pas été attribué.
   */
  rewarded(r: MessReward) {
    if (r.game !== this.game) return
    clearTimeout(this.waiting)
    this.reward.classList.remove('pending')
    if (r.status === 'unavailable') {
      this.reward.textContent = tr('Les récompenses de MESS RUSH ne sont pas encore en service.', 'MESS RUSH rewards are not live yet.')
      return
    }
    if (r.status === 'refused') {
      this.reward.textContent = tr(`Le site n'a pas pris ce résultat : pas de récompense pour cette partie (code de partie : ${r.game}).`, `The site did not accept this result: no reward for this game (game code: ${r.game}).`)
      return
    }
    if (r.status === 'failed') {
      this.reward.textContent = tr(`Le site n'a pas répondu : la récompense n'est pas confirmée. Signalez le code de partie ${r.game} à l'équipe du site.`, `The site did not answer: the reward is not confirmed. Report game code ${r.game} to the site team.`)
      return
    }
    if (r.status === 'pending') {
      this.reward.classList.add('pending')
      this.reward.textContent = tr('Envoi du résultat au site…', 'Sending the result to the site…')
      this.waiting = window.setTimeout(() => {
        this.reward.textContent = tr(`Le site n'a pas encore confirmé la récompense. Code de partie : ${r.game}.`, `The site hasn't confirmed the reward yet. Game code: ${r.game}.`)
      }, 60000)
      return
    }
    if (r.reward === 'booster') {
      const n = r.boosters ?? 1
      this.reward.textContent = n > 1
        ? tr(`Première victoire de la semaine ! ${n} boosters de cartes attribués : ils vous attendent sur le site.`, `First win of the week! ${n} card boosters awarded: they're waiting for you on the site.`)
        : tr('Première victoire de la semaine ! Booster de cartes attribué : il vous attend sur le site.', 'First win of the week! Card booster awarded: it\'s waiting for you on the site.')
    } else if (r.reward === 'credits') {
      this.reward.textContent = tr(
        `Victoire ! Vous gagnez des crédits Mini Ship Interiors : +${formatCredits(r.earned ?? 0)}.${r.balance !== undefined ? ` Solde : ${formatCredits(r.balance)}.` : ''}`,
        `Victory! You earn Mini Ship Interiors credits: +${formatCredits(r.earned ?? 0)}.${r.balance !== undefined ? ` Balance: ${formatCredits(r.balance)}.` : ''}`,
      )
    } else if (r.reward === 'capped') {
      this.reward.textContent = tr('Plafond du jour atteint : cette victoire ne rapporte pas de crédits.', 'Daily cap reached: this win earns no credits.')
    } else this.reward.textContent = tr('Pas de récompense pour cette partie.', 'No reward for this game.')
  }

  close() {
    clearTimeout(this.waiting)
    this.root.hidden = true
    document.body.classList.remove('mess-end-on')
  }
}
