import { EN, tr } from '../i18n'
import { icon, type IconName } from '../icons'
import { $, nameTag } from '../ui'
import type { Letter } from './site'

/*
 * Combiné de bord : l'annuaire des joueurs, dans un téléphone qui flotte à gauche de l'écran et
 * se réduit à une languette. On y voit qui est à bord (et où), qui ne l'est pas, quels quartiers
 * sont ouverts ; on y chuchote, on y sonne chez les autres, on y invite chez soi, et on y laisse
 * un message à un absent. Tout ce qui touche aux quartiers des autres passe par lui.
 *
 * L'onglet « Messages » liste les conversations, une par joueur. Entre CMDR, les chuchotements
 * sont gardés par le site (`letters`) : on écrit à un joueur qu'il soit à bord ou non, et l'on
 * retrouve la conversation d'une session à l'autre. Avec un invité (ou sans compte), ils passent
 * par le relais, à bord seulement, et ne durent que le temps de la session.
 *
 * Le combiné n'affiche que ce qu'on lui donne (cf. update) et rend la main par ses `on…` : c'est
 * main.ts qui connaît le relais, le site et les visites.
 */

/** Ponts du vaisseau, de haut en bas, pour la jauge d'un joueur à bord (cf. levels.ts). */
const DECKS = [2, 1, 0, -1]

/** Un joueur de l'annuaire, à bord ou non. */
export interface Contact {
  /** Clé stable : son nom, sans « CMDR », en minuscules. */
  key: string
  name: string
  verified: boolean
  /** À bord : son id sur le relais. */
  id?: number
  /** Connu du site : son identifiant dans l'annuaire (messages, visite en son absence). */
  stored?: string
  /** À bord : le pont où il est (absent : hors du vaisseau), et le lieu en toutes lettres. */
  deck?: number
  where?: string
  /** Ses quartiers sont ouverts. */
  open: boolean
  /** Absent : dernière fois qu'on l'a vu (timestamp Unix). */
  seen?: number
  /** Il est dans nos quartiers · nous sommes dans les siens. */
  guest?: boolean
  host?: boolean
  /** Invitation en cours : la nôtre chez nous · la sienne chez lui. */
  invited?: boolean
  inviting?: boolean
  /** On vient de sonner chez lui. */
  rung?: boolean
}

/** Le joueur local, en tête de l'annuaire. */
export interface PhoneSelf {
  name: string
  verified: boolean
  /** Compte du site lié : on peut laisser des messages. */
  linked: boolean
  /** Liaison avec le relais. */
  online: boolean
  where: string
  deck?: number
  /** Nos quartiers sont ouverts (absent : invité, pas de bascule). */
  open?: boolean
  /** On peut recevoir chez soi (CMDR vérifié, en ligne). */
  canHost: boolean
  /** En visite : chez qui. */
  visiting?: string
  loginUrl: string
}

export interface PhoneData {
  self: PhoneSelf
  contacts: Contact[]
  /** Chuchotements gardés par le site, reçus et envoyés (null : invité, ou site injoignable). */
  letters: Letter[] | null
}

interface Entry {
  mine: boolean
  text: string
  at: number
  /** Gardé par le site : son identifiant (pour l'effacer), et si son destinataire l'a lu. */
  letterId?: number
  read?: boolean
  state?: 'sending' | 'failed'
  note?: string
}

/** Clé d'un CMDR dans l'annuaire : son nom sans « CMDR », en minuscules (le même, à bord ou non). */
export const contactKey = (name: string) => name.replace(/^cmdr\s+/i, '').trim().toLowerCase()

const pad = (n: number) => String(n).padStart(2, '0')
const clock = (ms: number) => {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** « il y a 5 min », « hier », « le 12/09 » : depuis quand (timestamp Unix). */
function ago(at: number): string {
  const s = Math.max(0, Date.now() / 1000 - at)
  if (s < 90) return tr('à l\'instant', 'just now')
  if (s < 3600) return tr(`il y a ${Math.round(s / 60)} min`, `${Math.round(s / 60)} min ago`)
  if (s < 86400) return tr(`il y a ${Math.round(s / 3600)} h`, `${Math.round(s / 3600)} h ago`)
  if (s < 172800) return tr('hier', 'yesterday')
  if (s < 30 * 86400) return tr(`il y a ${Math.round(s / 86400)} j`, `${Math.round(s / 86400)} d ago`)
  const d = new Date(at * 1000)
  return EN ? `on ${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear() % 100}` : `le ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear() % 100}`
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (className) e.className = className
  if (text) e.textContent = text
  return e
}

function button(label: string, glyph: IconName, onClick: () => void, className = ''): HTMLButtonElement {
  const b = el('button', className)
  b.type = 'button'
  b.append(icon(glyph), document.createTextNode(label))
  b.onclick = onClick
  return b
}

/** Coupe du vaisseau : quatre ponts, celui du joueur allumé ; hors du vaisseau, aucun. */
function deckGauge(deck: number | undefined, label: string): HTMLElement {
  const g = el('span', 'ph-decks')
  g.title = label
  g.setAttribute('aria-hidden', 'true')
  if (deck === undefined || !DECKS.includes(deck)) g.classList.add('away')
  for (const d of DECKS) g.append(el('i', d === deck ? 'on' : ''))
  return g
}

export class CrewPhone {
  private root = $('phone')
  private tab = el('button', 'ph-tab')
  private tabCount = el('b')
  private tabBadge = el('span', 'ph-badge')
  private body = el('section', 'ph-body')
  private time = el('span', 'ph-time')
  private link = el('span', 'ph-link')
  private screen = el('div', 'ph-screen')
  // Vue « annuaire ».
  private listView = el('div', 'ph-view')
  private summary = el('p', 'ph-summary')
  private tabs = { crew: el('button', 'ph-seg'), letters: el('button', 'ph-seg') }
  private lettersBadge = el('span', 'ph-badge')
  private me = el('div', 'ph-me')
  private search = el('input', 'ph-search')
  private list = el('div', 'ph-list')
  private rows = new Map<string, { el: HTMLElement; json: string }>()
  private box = el('div', 'ph-list ph-letters')
  // Vue « conversation ».
  private threadView = el('div', 'ph-view ph-thread-view')
  private threadHead = el('div', 'ph-thread-head')
  private threadLog = el('div', 'ph-thread')
  private threadNote = el('p', 'ph-thread-note')
  private input = el('input', 'ph-input')
  private send = el('button', 'ph-send')

  private data: PhoneData = { self: { name: '', verified: false, linked: false, online: false, where: '', canHost: false, loginUrl: '/' }, contacts: [], letters: null }
  private byKey = new Map<string, Contact>()
  private expanded: string | null = null
  private filter = ''
  private thread: string | null = null
  private threads = new Map<string, { name: string; entries: Entry[]; stored?: string; npc?: { status: string; note: string } }>()
  private unread = new Map<string, number>()
  private keys = { self: '', letters: '', thread: '' }
  private ticker = 0

  /**
   * Chuchoter à un joueur. `refusal` : pourquoi ce n'est pas parti ; `stored` : le site le garde,
   * il est déjà revenu dans `letters`.
   */
  onSend?: (contact: Contact, text: string) => Promise<{ refusal?: string; stored?: boolean }>
  onVisit?: (contact: Contact) => void
  onRing?: (contact: Contact) => void
  onInvite?: (contact: Contact) => void
  onKick?: (contact: Contact) => void
  onToggleOpen?: () => void
  onGoHome?: () => void
  /** La conversation avec ce CMDR (son identifiant dans l'annuaire) est à l'écran : ses messages sont lus. */
  onRead?: (stored: string) => void
  onDeleteLetter?: (id: number) => void
  /** Ouvert ou réduit (à retenir d'une visite à l'autre ; ouvert : l'annuaire est à rafraîchir). */
  onToggle?: (open: boolean) => void

  constructor(open = false) {
    this.build()
    this.setOpen(open, false)
  }

  get isOpen(): boolean {
    return this.root.classList.contains('open')
  }

  /** Le clic (ou autre événement) vise-t-il le combiné ? */
  contains(target: EventTarget | null): boolean {
    return target instanceof Node && (this.root.contains(target) || this.tab.contains(target))
  }

  toggle() {
    this.setOpen(!this.isOpen)
  }

  close() {
    this.setOpen(false)
  }

  /** Échap, ou retour : la conversation se referme, puis le combiné. Rend false s'il n'y avait rien à fermer. */
  back(): boolean {
    if (!this.isOpen) return false
    if (this.thread) this.showThread(null)
    else this.setOpen(false)
    return true
  }

  private setOpen(open: boolean, announce = true) {
    this.root.classList.toggle('open', open)
    // Sur un écran large mais peu haut, la colonne de gauche du HUD se pousse (cf. phone.css).
    document.body.classList.toggle('phone-open', open)
    this.tab.setAttribute('aria-expanded', String(open))
    this.body.inert = !open
    clearInterval(this.ticker)
    if (open) {
      this.tick()
      this.ticker = window.setInterval(() => this.tick(), 20000)
      if (this.thread) this.read(this.thread)
    } else if (this.root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur()
    this.badges()
    if (announce) this.onToggle?.(open)
  }

  /** L'heure du bord, et les « il y a 5 min » qui vieillissent. */
  private tick() {
    this.time.textContent = clock(Date.now())
    for (const c of this.data.contacts) if (c.id === undefined && c.seen) this.rows.get(c.key)?.el.querySelector('.ph-sub time')?.replaceChildren(ago(c.seen))
  }

  // ------------------------------------------------------------- structure

  private build() {
    const title = tr('Équipage', 'Crew')
    this.tab.type = 'button'
    this.tab.title = tr('Annuaire des joueurs (Tab)', 'Player directory (Tab)')
    this.tab.setAttribute('aria-label', this.tab.title)
    this.tab.setAttribute('aria-controls', 'phone-body')
    this.tab.append(icon('users-three'), this.tabCount, this.tabBadge)
    this.tab.onclick = () => this.toggle()

    this.body.id = 'phone-body'
    this.body.setAttribute('aria-label', tr('Annuaire des joueurs', 'Player directory'))
    const status = el('header', 'ph-status')
    const close = el('button', 'ph-close')
    close.type = 'button'
    close.title = tr('Réduire (Tab)', 'Collapse (Tab)')
    close.setAttribute('aria-label', tr('Réduire l\'annuaire', 'Collapse the directory'))
    close.append(icon('x'))
    close.onclick = () => this.close()
    const signal = el('span', 'ph-signal')
    signal.append(el('i'), el('i'), el('i'), el('i'))
    this.link.append(signal, el('span'))
    status.append(this.time, this.link, close)

    // Annuaire.
    const head = el('div', 'ph-head')
    head.append(el('h2', '', title), this.summary)
    const seg = el('div', 'ph-segs')
    seg.setAttribute('role', 'tablist')
    this.tabs.crew.append(title)
    this.tabs.letters.append(tr('Messages', 'Messages'), this.lettersBadge)
    for (const [id, b] of Object.entries(this.tabs) as ['crew' | 'letters', HTMLButtonElement][]) {
      b.type = 'button'
      b.setAttribute('role', 'tab')
      b.onclick = () => this.showPane(id)
      seg.append(b)
    }
    const find = el('label', 'ph-find')
    this.search.type = 'search'
    this.search.placeholder = tr('Chercher un CMDR', 'Find a CMDR')
    this.search.setAttribute('aria-label', this.search.placeholder)
    this.search.maxLength = 40
    this.search.oninput = () => {
      this.filter = this.search.value.trim().toLowerCase()
      this.renderList()
    }
    find.append(icon('magnifying-glass'), this.search)
    this.list.append(this.me, find)
    this.listView.append(head, seg, this.list, this.box)

    // Conversation.
    const form = el('form', 'ph-compose')
    form.autocomplete = 'off'
    this.input.maxLength = 280
    this.send.type = 'submit'
    this.send.append(icon('paper-plane-right'))
    this.send.setAttribute('aria-label', tr('Envoyer', 'Send'))
    form.append(this.input, this.send)
    form.onsubmit = (e) => {
      e.preventDefault()
      void this.submit()
    }
    this.threadLog.setAttribute('aria-live', 'polite')
    this.threadView.append(this.threadHead, this.threadLog, this.threadNote, form)

    this.screen.append(this.listView, this.threadView)
    this.body.append(status, this.screen)
    this.root.append(this.body)
    // La languette vit au bas de la colonne de gauche du HUD, contre le bord de l'écran : rien ne
    // la recouvre, et elle ne recouvre rien (invitations, barre des quartiers).
    $('invites').after(this.tab)

    // Pendant la frappe, les touches ne font pas marcher le personnage (cf. main.ts).
    for (const type of ['keydown', 'keyup'] as const) {
      this.root.addEventListener(type, (e) => {
        // Échap, le focus dans le combiné : la conversation se referme, puis le combiné.
        if (type === 'keydown' && e.key === 'Escape') {
          e.stopPropagation()
          if (e.target instanceof HTMLElement) e.target.blur()
          return void this.back()
        }
        if (e.target instanceof HTMLInputElement) e.stopPropagation()
      })
    }
    this.showPane('crew')
    this.showThread(null)
  }

  // ------------------------------------------------------------- données

  /** Ce que montre le combiné ; ne redessine que ce qui a changé. */
  update(data: PhoneData) {
    this.data = data
    this.byKey = new Map(data.contacts.map((c) => [c.key, c]))
    const aboard = data.contacts.filter((c) => c.id !== undefined).length + (data.self.online ? 1 : 0)
    this.tabCount.textContent = data.self.online ? String(aboard) : ''
    const away = data.contacts.length + 1 - aboard
    this.summary.textContent = !data.self.online
      ? tr('Hors ligne : seuls vos messages sont à jour.', 'Offline: only your messages are up to date.')
      : EN
        ? `${aboard} aboard${away > 0 ? `, ${away} away` : ''}`
        : `${aboard} à bord${away > 0 ? `, ${away} hors ligne` : ''}`
    this.link.classList.toggle('on', data.self.online)
    this.link.lastElementChild!.textContent = data.self.online ? tr('Relais', 'Relay') : tr('Solo', 'Solo')

    const selfKey = JSON.stringify(data.self)
    if (selfKey !== this.keys.self) {
      this.keys.self = selfKey
      this.renderSelf()
    }
    this.renderList()
    const lettersKey = JSON.stringify(data.letters)
    if (lettersKey !== this.keys.letters) {
      this.keys.letters = lettersKey
      this.syncLetters()
    }
    if (this.thread) this.renderThreadHead()
    this.badges()
  }

  private get unreadLetters(): number {
    return this.data.letters?.filter((l) => !l.mine && !l.read).length ?? 0
  }

  /** Pastilles : chuchotements et messages pas encore lus. */
  private badges() {
    let whispers = 0
    for (const n of this.unread.values()) whispers += n
    const letters = this.unreadLetters
    this.tabBadge.textContent = whispers + letters ? String(whispers + letters) : ''
    this.lettersBadge.textContent = this.tabBadge.textContent
    this.tab.classList.toggle('alert', whispers + letters > 0)
  }

  private showPane(pane: 'crew' | 'letters') {
    for (const [id, b] of Object.entries(this.tabs)) b.setAttribute('aria-selected', String(id === pane))
    this.list.hidden = pane !== 'crew'
    this.box.hidden = pane !== 'letters'
  }

  // ------------------------------------------------------------- soi

  private renderSelf() {
    const s = this.data.self
    const who = el('div', 'ph-who')
    const name = el('strong', 'ph-name')
    name.append(nameTag(s.name, s.verified))
    who.append(name, el('span', 'ph-sub', s.visiting ? tr(`En visite chez ${s.visiting}`, `Visiting ${s.visiting}`) : s.where))
    const top = el('div', 'ph-row-main')
    top.append(deckGauge(s.deck, s.where), who, el('span', 'ph-you', tr('vous', 'you')))
    const actions = el('div', 'ph-actions')
    if (s.visiting) actions.append(button(tr('Rentrer chez moi', 'Go home'), 'sign-out', () => this.onGoHome?.(), 'primary'))
    if (s.open !== undefined) {
      const b = button(
        s.open ? tr('Mes quartiers sont ouverts', 'My quarters are open') : tr('Mes quartiers sont sur invitation', 'My quarters are invite-only'),
        s.open ? 'lock-simple-open' : 'lock-simple',
        () => this.onToggleOpen?.(),
        s.open ? 'ph-switch on' : 'ph-switch',
      )
      b.setAttribute('role', 'switch')
      b.setAttribute('aria-checked', String(s.open))
      b.title = s.open
        ? tr('Chacun peut venir les visiter, même en votre absence. Cliquer pour les réserver aux invités.', 'Anyone can drop by, even while you are away. Click to make them invite-only.')
        : tr('On y entre sur invitation. Cliquer pour les ouvrir à tous, même en votre absence.', 'Entry is by invitation. Click to open them to everyone, even while you are away.')
      actions.append(b)
    } else if (!s.linked) {
      const a = el('a', 'ph-login', tr('Connectez-vous au site pour recevoir chez vous et laisser des messages', 'Log in to the site to host visitors and leave messages'))
      a.href = s.loginUrl
      actions.append(a)
    }
    this.me.replaceChildren(top, actions)
  }

  // ------------------------------------------------------------- annuaire

  private renderList() {
    const shown = this.data.contacts.filter((c) => !this.filter || c.key.includes(this.filter))
    const aboard = shown.filter((c) => c.id !== undefined)
    const away = shown.filter((c) => c.id === undefined)
    const order: HTMLElement[] = []
    const section = (title: string, list: Contact[]) => {
      if (!list.length) return
      order.push(this.sectionTitle(title, list.length))
      for (const c of list) order.push(this.row(c))
    }
    section(tr('À bord', 'Aboard'), aboard)
    section(tr('Hors ligne', 'Away'), away)
    if (!shown.length) {
      order.push(this.note(this.filter
        ? tr('Aucun CMDR à ce nom.', 'No CMDR by that name.')
        : tr('Personne d\'autre pour l\'instant. Les CMDR qui lancent le jeu apparaissent ici.', 'Nobody else yet. CMDRs who start the game show up here.')))
    }
    const live = new Set(shown.map((c) => c.key))
    for (const key of [...this.rows.keys()]) if (!live.has(key)) this.rows.delete(key)
    // Les rangées inchangées restent en place : un clic en cours ne se perd pas.
    const fixed = 2 // la carte du joueur et la recherche
    const current = [...this.list.children].slice(fixed)
    if (current.length !== order.length || current.some((e, i) => e !== order[i])) {
      for (const e of current) if (!order.includes(e as HTMLElement)) e.remove()
      order.forEach((e, i) => {
        if (this.list.children[fixed + i] !== e) this.list.insertBefore(e, this.list.children[fixed + i] ?? null)
      })
    }
  }

  private titles = new Map<string, HTMLElement>()
  private sectionTitle(title: string, count: number): HTMLElement {
    let h = this.titles.get(title)
    if (!h) this.titles.set(title, (h = el('h3', 'ph-section')))
    const text = `${title} · ${count}`
    if (h.textContent !== text) h.textContent = text
    return h
  }

  private notes = new Map<string, HTMLElement>()
  private note(text: string): HTMLElement {
    let n = this.notes.get(text)
    if (!n) this.notes.set(text, (n = el('p', 'ph-empty', text)))
    return n
  }

  private row(c: Contact): HTMLElement {
    const open = this.expanded === c.key
    const self = this.data.self
    const json = JSON.stringify([c, open, this.unreadFrom(c.key), self.canHost, self.linked, self.online])
    const cached = this.rows.get(c.key)
    if (cached?.json === json) return cached.el

    const aboard = c.id !== undefined
    const row = cached?.el ?? el('div')
    row.className = `ph-row${aboard ? '' : ' away'}${open ? ' expanded' : ''}`
    const main = el('button', 'ph-row-main')
    main.type = 'button'
    main.setAttribute('aria-expanded', String(open))
    const who = el('span', 'ph-who')
    const name = el('strong', 'ph-name')
    name.append(nameTag(c.name, c.verified))
    const sub = el('span', 'ph-sub')
    if (aboard) sub.textContent = c.guest ? tr('Dans vos quartiers', 'In your quarters') : c.where ?? ''
    else if (c.seen) {
      sub.append(tr('Vu ', 'Seen '), el('time', '', ago(c.seen)))
    } else sub.textContent = tr('Hors ligne', 'Away')
    who.append(name, sub)
    main.append(aboard ? deckGauge(c.deck, c.where ?? '') : el('span', 'ph-decks off'), who)
    if (c.open) {
      const door = el('span', 'ph-door')
      door.title = tr('Quartiers ouverts', 'Open quarters')
      door.append(icon('door-open'))
      main.append(door)
    }
    const unread = this.unreadFrom(c.key)
    if (unread) main.append(el('span', 'ph-badge', String(unread)))
    main.onclick = () => {
      this.expanded = open ? null : c.key
      this.renderList()
    }
    row.replaceChildren(main)
    if (open) row.append(this.actions(c))
    this.rows.set(c.key, { el: row, json })
    return row
  }

  /** Ce qu'on peut faire avec un joueur : selon qu'il est à bord, que ses quartiers sont ouverts, qu'on est CMDR. */
  private actions(c: Contact): HTMLElement {
    const self = this.data.self
    const box = el('div', 'ph-actions')
    const aboard = c.id !== undefined
    const off = (b: HTMLButtonElement, why = '') => {
      b.disabled = true
      if (why) b.title = why
      return b
    }
    // À bord ou non, on chuchote : un absent lira le message à son retour.
    if (aboard || c.stored) {
      const b = button(tr('Chuchoter', 'Whisper'), 'chat-circle-dots', () => this.openThread(c.key), 'primary')
      box.append(aboard || self.linked ? b : off(b, tr('Écrire à un absent est réservé aux CMDR connectés au site.', 'Writing to someone away is only for CMDRs logged in to the site.')))
    }
    // Aller chez lui.
    if (c.host) box.append(off(button(tr('Vous y êtes', 'You are there'), 'check', () => {})))
    else if (c.open || c.inviting) {
      const b = button(c.inviting && !c.open ? tr('Rejoindre', 'Join') : tr('Visiter', 'Visit'), 'door-open', () => this.onVisit?.(c))
      box.append(self.online ? b : off(b, tr('Hors ligne : pas de visite sans le relais.', 'Offline: no visits without the relay.')))
    } else if (aboard && c.verified) {
      box.append(c.rung ? off(button(tr('Sonné', 'Rang'), 'bell-ringing', () => {})) : button(tr('Sonner', 'Ring'), 'bell-ringing', () => this.onRing?.(c)))
    }
    // Le recevoir chez soi.
    if (aboard && self.canHost) {
      if (c.guest) box.append(button(tr('Raccompagner', 'Show out'), 'sign-out', () => this.onKick?.(c)))
      else box.append(c.invited ? off(button(tr('Invité', 'Invited'), 'check', () => {})) : button(tr('Inviter chez moi', 'Invite over'), 'user-plus', () => this.onInvite?.(c)))
    }
    if (!aboard && !c.open) box.append(el('p', 'ph-hint', tr('Ses quartiers sont fermés : on y sonne quand il est à bord.', 'Their quarters are closed: ring when they are aboard.')))
    return box
  }

  // ------------------------------------------------------------- conversations

  /** Les chuchotements gardés par le site, rangés par conversation (ceux de la session y restent). */
  private syncLetters() {
    for (const t of this.threads.values()) t.entries = t.entries.filter((e) => e.letterId === undefined)
    for (const l of this.data.letters ?? []) {
      const key = contactKey(l.name)
      let t = this.threads.get(key)
      if (!t) this.threads.set(key, (t = { name: `CMDR ${l.name}`, entries: [] }))
      t.stored = l.key
      t.entries.push({ mine: l.mine, text: l.text, at: l.at * 1000, letterId: l.id, read: l.read })
    }
    for (const t of this.threads.values()) t.entries.sort((a, b) => a.at - b.at || (a.letterId ?? 0) - (b.letterId ?? 0))
    this.renderConversations()
    this.renderList()
    if (this.thread) {
      this.renderThread()
      // Arrivé pendant que la conversation est à l'écran : c'est lu.
      if (this.isOpen) this.read(this.thread)
    }
  }

  /** Ce qu'un joueur nous a écrit et qu'on n'a pas lu : sur le site, et de la session. */
  private unreadFrom(key: string): number {
    return (this.unread.get(key) ?? 0) + (this.threads.get(key)?.entries.filter((e) => e.letterId !== undefined && !e.mine && !e.read).length ?? 0)
  }

  /** Onglet « Messages » : une ligne par joueur avec qui l'on a échangé, la plus récente en haut. */
  private renderConversations() {
    const list = [...this.threads].filter(([, t]) => t.entries.length).sort((a, b) => b[1].entries.at(-1)!.at - a[1].entries.at(-1)!.at)
    this.box.replaceChildren()
    if (!list.length) {
      this.box.append(el('p', 'ph-empty', tr(
        'Aucune conversation. Chuchotez à un joueur depuis l\'annuaire, à bord ou non : vos échanges se retrouvent ici.',
        'No conversations. Whisper to a player from the directory, aboard or not: your exchanges show up here.',
      )))
      return
    }
    for (const [key, t] of list) {
      const last = t.entries.at(-1)!
      const c = this.byKey.get(key)
      const unread = this.unreadFrom(key)
      const row = el('button', unread ? 'ph-conv new' : 'ph-conv')
      row.type = 'button'
      const head = el('span', 'ph-conv-head')
      const name = el('strong', 'ph-name')
      // Une conversation gardée par le site est toujours avec un CMDR.
      name.append(nameTag(t.name, c?.verified ?? !key.startsWith('~')))
      head.append(name, el('time', '', ago(last.at / 1000)))
      const text = el('span', 'ph-sub', (last.mine ? tr('Vous : ', 'You: ') : '') + last.text)
      const line = el('span', 'ph-conv-line')
      line.append(text)
      if (unread) line.append(el('span', 'ph-badge', String(unread)))
      row.append(head, line)
      row.onclick = () => this.openThread(key)
      this.box.append(row)
    }
  }

  // ------------------------------------------------------------- conversation

  /** Ouvre la conversation avec un joueur (et le combiné). `name` : s'il n'est pas dans l'annuaire. */
  openThread(key: string, name?: string) {
    if (!this.threads.has(key)) this.threads.set(key, { name: this.byKey.get(key)?.name ?? name ?? key, entries: [] })
    if (!this.isOpen) this.setOpen(true)
    this.showThread(key)
    this.input.focus()
  }

  private showThread(key: string | null) {
    this.thread = key
    this.threadView.hidden = !key
    this.listView.hidden = !!key
    if (!key) return void this.renderList()
    this.read(key)
    this.keys.thread = ''
    this.renderThreadHead()
    this.renderThread()
  }

  private read(key: string) {
    const t = this.threads.get(key)
    const stored = t?.stored
    const letters = t?.entries.filter((e) => e.letterId !== undefined && !e.mine && !e.read) ?? []
    if (!this.unread.delete(key) && !letters.length) return
    // Lus tout de suite ici ; le site l'apprend (cf. onRead), et le confirmera.
    for (const e of letters) e.read = true
    if (letters.length && stored) this.onRead?.(stored)
    this.badges()
    this.renderList()
    this.renderConversations()
  }

  private renderThreadHead() {
    const key = this.thread!
    const c = this.byKey.get(key)
    const t = this.threads.get(key)!
    if (c) t.name = c.name
    if (t.npc) return this.renderNpcHead(t.name, t.npc)
    const self = this.data.self
    const aboard = c?.id !== undefined
    // À qui l'on peut écrire : entre CMDR, le site garde le message (à bord ou non) ; sinon, à bord seulement, par le relais.
    const kept = !!c?.stored && self.linked
    const can = kept || (aboard && self.online)
    const status = aboard
      ? c!.where ?? ''
      : !c
        ? tr('N\'est plus à bord', 'No longer aboard')
        : c.seen ? tr(`Hors ligne, vu ${ago(c.seen)}`, `Away, seen ${ago(c.seen)}`) : tr('Hors ligne', 'Away')
    const note = aboard
      ? kept
        ? tr('Chuchoté : lui seul le lit.', 'Whispered: only they read it.')
        : tr('Chuchoté : lui seul le lit. Avec un invité, la conversation s\'efface en quittant le jeu.', 'Whispered: only they read it. With a guest, the conversation is gone when you leave the game.')
      : can
        ? tr('Hors ligne : il lira vos messages à son retour à bord.', 'Away: they will read your messages when they come back aboard.')
        : c?.stored
          ? tr('Connectez-vous au site pour écrire à un joueur hors ligne.', 'Log in to the site to write to a player who is away.')
          : tr('Ce joueur a quitté le bord : on ne peut plus lui écrire.', 'This player left the ship: you can no longer write to them.')
    const json = JSON.stringify([t.name, c?.verified, aboard, c?.deck, status, note, can])
    if (json === this.keys.thread) return
    this.keys.thread = json
    const back = el('button', 'ph-back')
    back.type = 'button'
    back.setAttribute('aria-label', tr('Retour à l\'annuaire', 'Back to the directory'))
    back.append(icon('caret-left'))
    back.onclick = () => this.showThread(null)
    const who = el('div', 'ph-who')
    const name = el('strong', 'ph-name')
    name.append(nameTag(t.name, c?.verified))
    who.append(name, el('span', 'ph-sub', status))
    this.threadHead.replaceChildren(back, aboard ? deckGauge(c!.deck, status) : el('span', 'ph-decks off'), who)
    this.threadNote.textContent = note
    this.input.disabled = this.send.disabled = !can
    this.input.maxLength = kept ? 280 : 200
    this.input.placeholder = can ? tr('Chuchoter…', 'Whisper…') : ''
  }

  /** En-tête d'une conversation avec un membre d'équipage : il écrit, on ne lui répond pas. */
  private renderNpcHead(name: string, npc: { status: string; note: string }) {
    const json = JSON.stringify([name, npc])
    if (json === this.keys.thread) return
    this.keys.thread = json
    const back = el('button', 'ph-back')
    back.type = 'button'
    back.setAttribute('aria-label', tr('Retour à l\'annuaire', 'Back to the directory'))
    back.append(icon('caret-left'))
    back.onclick = () => this.showThread(null)
    const who = el('div', 'ph-who')
    who.append(el('strong', 'ph-name', name), el('span', 'ph-sub', npc.status))
    this.threadHead.replaceChildren(back, el('span', 'ph-decks off'), who)
    this.threadNote.textContent = npc.note
    this.input.disabled = this.send.disabled = true
    this.input.placeholder = ''
  }

  private renderThread() {
    const t = this.threads.get(this.thread!)!
    this.threadLog.replaceChildren(
      ...t.entries.map((e) => {
        const b = el('div', `ph-bubble${e.mine ? ' mine' : ''}${e.state ? ` ${e.state}` : ''}`)
        b.append(el('p', '', e.text))
        const when = Date.now() - e.at < 43200000 ? clock(e.at) : ago(e.at / 1000)
        const meta = e.state === 'failed' ? e.note ?? '' : e.state === 'sending' ? tr('envoi…', 'sending…') : `${when}${e.mine && e.letterId !== undefined ? (e.read ? tr(' · lu', ' · read') : tr(' · pas encore lu', ' · not read yet')) : ''}`
        const foot = el('small', '', meta)
        // Gardé par le site : il s'efface des deux côtés.
        if (e.letterId !== undefined) {
          const id = e.letterId
          const del = el('button', 'ph-del')
          del.type = 'button'
          del.title = tr('Effacer ce message', 'Delete this message')
          del.setAttribute('aria-label', del.title)
          del.append(icon('trash'))
          del.onclick = () => this.onDeleteLetter?.(id)
          foot.append(del)
        }
        b.append(foot)
        return b
      }),
    )
    if (!t.entries.length) this.threadLog.append(el('p', 'ph-empty', tr('Rien d\'écrit pour l\'instant.', 'Nothing written yet.')))
    this.threadLog.scrollTop = this.threadLog.scrollHeight
  }

  private push(key: string, name: string, entry: Entry): Entry {
    let t = this.threads.get(key)
    if (!t) this.threads.set(key, (t = { name, entries: [] }))
    t.entries.push(entry)
    if (t.entries.length > 80) t.entries.shift()
    if (this.thread === key) this.renderThread()
    this.renderConversations()
    return entry
  }

  private async submit() {
    const key = this.thread
    const c = key ? this.byKey.get(key) : undefined
    const text = this.input.value.trim()
    if (!key || !c || !text) return
    this.input.value = ''
    const entry = this.push(key, c.name, { mine: true, text, at: Date.now(), state: 'sending' })
    const { refusal, stored } = (await this.onSend?.(c, text)) ?? {}
    entry.state = refusal ? 'failed' : undefined
    entry.note = refusal
    // Gardé par le site : il est revenu avec les autres, cette bulle d'attente s'efface.
    const t = this.threads.get(key)
    if (stored && t) t.entries = t.entries.filter((e) => e !== entry)
    if (this.thread === key) this.renderThread()
    this.renderConversations()
  }

  /** Un chuchotement reçu par le relais (d'un invité, ou sans le site) : dans sa conversation, avec une pastille si elle n'est pas à l'écran. */
  receive(key: string, name: string, text: string) {
    this.push(key, name, { mine: false, text, at: Date.now() })
    if (this.isOpen && this.thread === key) return
    this.unread.set(key, (this.unread.get(key) ?? 0) + 1)
    this.badges()
    this.renderList()
    this.renderConversations()
  }

  /**
   * Un message d'un membre d'équipage (Capucine, qui rappelle au jardinier ce qui l'attend, cf.
   * gardening/notices.ts) : dans sa conversation, où l'on ne répond pas. `about` : où il est, et
   * pourquoi il n'attend pas de réponse.
   */
  npc(key: string, name: string, text: string, about: { status: string; note: string }) {
    const t = this.threads.get(key)
    if (t) t.npc = about
    else this.threads.set(key, { name, entries: [], npc: about })
    this.receive(key, name, text)
  }

  /** Un chuchotement parti d'ailleurs (commande du chat) : il rejoint la conversation. */
  sent(key: string, name: string, text: string) {
    this.push(key, name, { mine: true, text, at: Date.now() })
  }
}
