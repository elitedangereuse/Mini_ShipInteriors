import { CATALOG } from './cabin/catalog'
import { tr } from './i18n'
import { formatCredits } from './economy/data'
import type { Wallet } from './economy/wallet'

export const SITE_URL = '/outils/mini-shipinteriors-site.php'
export const artUrl = (id: string) => `${SITE_URL}?image=${encodeURIComponent(id)}`
export const SITE_MODELS: Record<string, string> = { 'site-card': 'card', 'site-badge': 'badge', 'adventure-poster': 'adv' }
interface Artwork { id: string; kind: string; label: string }
interface Reward { reward: string; label: string; amount: number }
interface RankingRow { rank: number; name: string; url: string; avatar?: string; score: number }
interface Ranking { id: string; label: string; unit: string; rows: RankingRow[] }
/** Familles de classements du site (cf. msi_site_rankings) : équipage, bornes d'arcade, salle de sport. */
export type RankingKind = 'crew' | 'arcade' | 'gym'
const RANKING_PANELS: Record<RankingKind, { title: string; subtitle: string }> = {
  crew: { title: tr('Tableau d’honneur', 'Hall of honour'), subtitle: tr('Les meilleurs commandants de la communauté.', 'The community’s leading commanders.') },
  arcade: { title: tr('High scores', 'High scores'), subtitle: tr('Les dix meilleurs scores de chaque borne du vaisseau.', 'The ten best scores on each of the ship’s cabinets.') },
  gym: { title: tr('Records de la salle de sport', 'Gym records'), subtitle: tr('Les dix meilleures séances sur chaque appareil.', 'The ten best sessions on each machine.') },
}
/** Noms des classements et de leurs unités ; le site les envoie en français. */
const RANKING_LABELS: Record<string, string> = {
  month: tr('Employés du mois', 'Employees of the month'), general: tr('Classement général', 'Overall ranking'),
  days30: tr('30 derniers jours', 'Last 30 days'), cards: tr('Collectionneurs', 'Collectors'), podiums: tr('Podiums d’aventures', 'Adventure podiums'),
  cargo: tr('Cargaison', 'Cargo'), asteroids: tr('Astéroïdes', 'Asteroids'),
  'gym-run': tr('Tapis de course', 'Treadmill'), 'gym-bike': tr('Vélo', 'Bike'), 'gym-punch': tr('Sac de frappe', 'Punching bag'),
}
const RANKING_UNITS: Record<string, string> = { 'tâches': tr('tâches', 'tasks'), cartes: tr('cartes', 'cards') }
const RANKING_NOTES: Record<string, string> = {
  month: tr('Tâches de bord réglées ce mois-ci à bord du vaisseau.', 'Ship chores completed aboard this month.'),
  days30: tr('Points gagnés sur le site ces 30 derniers jours.', 'Points earned on the site over the last 30 days.'),
}
/** En développement, le site (profils, images) est servi ailleurs que le jeu. */
const siteHref = (path: string) => import.meta.env.DEV ? new URL(path, import.meta.env.VITE_ED_SITE_ORIGIN || 'http://localhost:8080').href : path
interface Reply {
  status: string; error?: string; art?: Artwork[]; pending?: Record<string, Reward[]>;
  rankings?: Ranking[]; earned?: number; balance?: number; count?: number
}
export async function siteRequest(query = '', body?: object): Promise<Reply | null> {
  try {
    const res = await fetch(SITE_URL + query, { method: body ? 'POST' : 'GET', credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) })
    return await res.json()
  } catch { return null }
}

/** Only owned artwork is offered, but visiting cabins can render any valid artwork ID. */
export async function loadSiteArt(): Promise<void> {
  const reply = await siteRequest()
  if (reply?.status !== 'success' || !Array.isArray(reply.art)) return
  for (const entry of CATALOG) {
    const kind = SITE_MODELS[entry.id]
    if (kind) entry.variants = reply.art.filter((art) => art.kind === kind).map(({ id, label }) => ({ id, label }))
  }
}

export class SitePanel {
  private el = document.createElement('section')
  private content = document.createElement('div')
  private title = document.createElement('h2')
  private subtitle = document.createElement('p')
  private revision = 0
  private previousFocus: HTMLElement | null = null
  private buttons: HTMLButtonElement[] = []
  private selected = 0
  constructor(private wallet: Wallet) {
    this.el.className = 'site-panel'
    this.el.hidden = true
    this.el.setAttribute('role', 'dialog')
    this.el.setAttribute('aria-modal', 'true')
    this.title.id = 'site-panel-title'
    this.el.setAttribute('aria-labelledby', this.title.id)
    const close = document.createElement('button')
    close.className = 'site-close'; close.textContent = '×'
    close.setAttribute('aria-label', tr('Fermer', 'Close'))
    close.onclick = () => this.close()
    this.content.setAttribute('aria-live', 'polite')
    const heading = document.createElement('header'); heading.className = 'site-heading'
    const kicker = document.createElement('span'); kicker.className = 'site-kicker'
    kicker.textContent = tr('ÉLITE DANGEREUSE · ÉQUIPAGE', 'ÉLITE DANGEREUSE · CREW')
    this.subtitle.className = 'site-subtitle'
    heading.append(kicker, this.title, this.subtitle)
    this.el.append(close, heading, this.content)
    document.body.append(this.el)
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close()
      if (e.key === 'Tab') {
        const focusable = [...this.el.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], select')]
        const i = focusable.indexOf(document.activeElement as HTMLElement)
        if (e.shiftKey && i <= 0) { e.preventDefault(); focusable.at(-1)?.focus() }
        else if (!e.shiftKey && i === focusable.length - 1) { e.preventDefault(); focusable[0]?.focus() }
      }
      e.stopPropagation()
    })
  }
  get isOpen() { return !this.el.hidden }
  contains(target: EventTarget | null) { return target instanceof Node && this.el.contains(target) }
  close() { this.revision++; this.el.hidden = true; this.previousFocus?.focus() }
  move(step: number) {
    if (!this.buttons.length) return
    this.selected = (this.selected + step + this.buttons.length) % this.buttons.length
    this.buttons[this.selected]?.focus()
  }
  confirm() { this.buttons[this.selected]?.click() }
  private open(title: string, rankings?: RankingKind) {
    this.el.classList.toggle('site-rankings', !!rankings)
    this.subtitle.textContent = rankings
      ? RANKING_PANELS[rankings].subtitle
      : tr('Vos missions accomplies méritent une récompense.', 'Your completed missions deserve a reward.')
    this.revision++
    this.previousFocus = document.activeElement as HTMLElement
    this.title.textContent = title
    this.content.textContent = tr('Chargement…', 'Loading…')
    this.buttons = []; this.selected = 0
    this.el.hidden = false
    this.el.querySelector<HTMLButtonElement>('button')?.focus()
    return this.revision
  }
  private error(reply: Reply | null) {
    this.content.textContent = reply?.error === 'auth'
      ? tr('Connectez-vous au site pour récupérer vos récompenses.', 'Sign in to the site to collect your rewards.')
      : tr('Le site ne répond pas. Fermez puis réessayez.', 'The site is unavailable. Close and try again.')
  }
  async counter(kind: 'weekly' | 'hunt') {
    const token = this.open(kind === 'weekly' ? tr('Comptoir Weekly', 'Weekly counter') : tr('Comptoir Chasse galactique', 'Galactic Hunt counter'))
    const reply = await siteRequest(`?pending=${kind}`)
    if (token !== this.revision) return
    if (reply?.status !== 'success') return this.error(reply)
    const rewards = reply.pending?.[kind] ?? []
    this.content.replaceChildren()
    const text = document.createElement('p')
    const total = rewards.reduce((n, r) => n + r.amount, 0)
    text.textContent = rewards.length
      ? tr(`${rewards.length} récompense${rewards.length > 1 ? 's' : ''} en attente · ${formatCredits(total)}`, `${rewards.length} pending reward(s) · ${formatCredits(total)}`)
      : tr('Aucun crédit en attente. Les nouvelles validations rapportent 10 000 CR chacune.', 'No pending credits. Each new completion earns 10,000 CR.')
    const list = document.createElement('ul')
    for (const reward of rewards) {
      const li = document.createElement('li'); li.textContent = `${reward.label} · ${formatCredits(reward.amount)}`; list.append(li)
    }
    const claim = document.createElement('button')
    claim.textContent = tr('Tout récupérer', 'Collect all'); claim.disabled = !rewards.length
    claim.onclick = async () => {
      claim.disabled = true
      const result = await siteRequest('', { kind })
      // Always reconcile the wallet, even if the panel was closed during the request.
      if (result?.status === 'success' && typeof result.balance === 'number') {
        this.wallet.site({ balance: result.balance, earned: result.earned ?? 0 })
        if (token !== this.revision) return
        list.replaceChildren()
        text.textContent = result.earned ? tr(`${formatCredits(result.earned)} récupérés.`, `${formatCredits(result.earned)} collected.`) : tr('Ces récompenses ont déjà été récupérées.', 'These rewards have already been collected.')
      } else if (token === this.revision) {
        text.textContent = tr('Récupération non confirmée. Réessayez ; une récompense ne sera payée qu’une fois.', 'Collection not confirmed. Retry; rewards are paid only once.')
        claim.disabled = false
      }
    }
    this.content.append(text, list, claim)
    this.buttons = [claim]; this.selected = 0
    if (!claim.disabled) claim.focus()
  }
  async rankings(kind: RankingKind = 'crew') {
    const token = this.open(RANKING_PANELS[kind].title, kind)
    const reply = await siteRequest(`?rankings=${kind}`)
    if (token !== this.revision) return
    if (reply?.status !== 'success') return this.error(reply)
    this.content.replaceChildren()
    const tabs = document.createElement('nav')
    tabs.setAttribute('aria-label', tr('Classements', 'Rankings'))
    const caption = document.createElement('p'); caption.className = 'site-caption'
    const podium = document.createElement('ol'); podium.className = 'site-podium'
    const list = document.createElement('ol'); list.className = 'site-ranks'
    const entry = (cmdr: RankingRow, unit: string) => {
      const li = document.createElement('li'); li.dataset.rank = String(cmdr.rank)
      const rank = document.createElement('span'); rank.className = 'site-rank'; rank.textContent = String(cmdr.rank)
      if (cmdr.rank <= 3) rank.dataset.podium = String(cmdr.rank)
      const avatar = document.createElement('img'); avatar.className = 'site-avatar'; avatar.alt = ''; avatar.loading = 'lazy'
      avatar.onerror = () => { avatar.onerror = null; avatar.src = siteHref('/assets/images/common/CMDR_inconnu.png') }
      avatar.src = siteHref(cmdr.avatar || '/assets/images/common/CMDR_inconnu.png')
      const link = document.createElement('a')
      link.textContent = cmdr.name; link.href = siteHref(cmdr.url); link.target = '_blank'; link.rel = 'noopener'
      const score = document.createElement('span'); score.className = 'site-score'
      const value = document.createElement('strong'); value.textContent = cmdr.score.toLocaleString()
      const label = document.createElement('span'); label.className = 'site-unit'; label.textContent = RANKING_UNITS[unit] ?? unit
      score.append(value, label)
      li.append(rank, avatar, link, score)
      return li
    }
    const show = (board: Ranking) => {
      const note = RANKING_NOTES[board.id]
      caption.textContent = `${RANKING_LABELS[board.id] ?? board.label} · Top 10${note ? ` · ${note}` : ''}`
      // Le podium : les trois premières lignes (à égalité, plusieurs CMDR portent le même rang).
      podium.replaceChildren(...board.rows.slice(0, 3).map((cmdr) => entry(cmdr, board.unit)))
      list.replaceChildren(...board.rows.slice(3).map((cmdr) => entry(cmdr, board.unit)))
      podium.hidden = !board.rows.length
      for (const button of this.buttons) button.setAttribute('aria-pressed', String(button.dataset.board === board.id))
      if (!board.rows.length) {
        const empty = document.createElement('li'); empty.className = 'site-empty'
        empty.textContent = kind === 'crew' ? tr('Aucun résultat pour cette période.', 'No results for this period.') : tr('Aucun score : la première place est à prendre.', 'No scores yet: first place is up for grabs.')
        list.append(empty)
      }
    }
    this.buttons = (reply.rankings ?? []).map((board) => {
      const b = document.createElement('button'); b.textContent = RANKING_LABELS[board.id] ?? board.label; b.dataset.board = board.id
      b.onclick = () => show(board); tabs.append(b); return b
    })
    this.content.append(tabs, caption, podium, list)
    if (reply.rankings?.[0]) show(reply.rankings[0])
    this.buttons[0]?.focus()
  }
}
