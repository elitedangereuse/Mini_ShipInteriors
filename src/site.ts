import { CATALOG } from './cabin/catalog'
import { tr } from './i18n'
import { formatCredits } from './economy/data'
import type { Wallet } from './economy/wallet'

export const SITE_URL = '/outils/mini-shipinteriors-site.php'
export const artUrl = (id: string) => `${SITE_URL}?image=${encodeURIComponent(id)}`
export const SITE_MODELS: Record<string, string> = { 'site-card': 'card', 'site-badge': 'badge', 'adventure-poster': 'adv' }
interface Artwork { id: string; kind: string; label: string }
interface Reward { reward: string; label: string; amount: number }
interface Ranking { id: string; label: string; unit: string; rows: { rank: number; name: string; url: string; score: number }[] }
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
  private open(title: string, rankings = false) {
    this.el.classList.toggle('site-rankings', rankings)
    this.subtitle.textContent = rankings
      ? tr('Les meilleurs commandants de la communauté.', 'The community’s leading commanders.')
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
  async rankings() {
    const token = this.open(tr('Employés du mois', 'Employees of the month'), true)
    const reply = await siteRequest('?rankings=1')
    if (token !== this.revision) return
    if (reply?.status !== 'success') return this.error(reply)
    this.content.replaceChildren()
    const tabs = document.createElement('nav')
    tabs.setAttribute('aria-label', tr('Classements', 'Rankings'))
    const table = document.createElement('table')
    const caption = document.createElement('caption')
    const head = document.createElement('thead')
    const row = document.createElement('tr')
    for (const title of [tr('Rang', 'Rank'), 'CMDR', tr('Score', 'Score')]) {
      const th = document.createElement('th'); th.scope = 'col'; th.textContent = title; row.append(th)
    }
    head.append(row)
    const body = document.createElement('tbody')
    table.append(caption, head, body)
    const show = (board: Ranking) => {
      caption.textContent = `${board.label} · Top 10`
      body.replaceChildren()
      for (const cmdr of board.rows) {
        const row = document.createElement('tr')
        const rank = document.createElement('td')
        const badge = document.createElement('span'); badge.className = 'site-rank'; badge.textContent = String(cmdr.rank)
        if (cmdr.rank <= 3) badge.dataset.podium = String(cmdr.rank)
        rank.append(badge)
        const name = document.createElement('td'); const link = document.createElement('a')
        link.textContent = cmdr.name; link.href = import.meta.env.DEV ? new URL(cmdr.url, import.meta.env.VITE_ED_SITE_ORIGIN || 'http://localhost:8080').href : cmdr.url; link.target = '_blank'; link.rel = 'noopener'
        name.append(link)
        const score = document.createElement('td')
        const value = document.createElement('strong'); value.textContent = cmdr.score.toLocaleString()
        const unit = document.createElement('span'); unit.className = 'site-unit'; unit.textContent = board.unit
        score.append(value, unit)
        row.append(rank, name, score); body.append(row)
      }
      for (const button of this.buttons) button.setAttribute('aria-pressed', String(button.dataset.board === board.id))
      if (!board.rows.length) {
        const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 3; cell.className = 'site-empty'
        cell.textContent = tr('Aucun résultat pour cette période.', 'No results for this period.'); row.append(cell); body.append(row)
      }
    }
    this.buttons = (reply.rankings ?? []).map((board) => {
      const b = document.createElement('button'); b.textContent = board.label; b.dataset.board = board.id
      b.onclick = () => show(board); tabs.append(b); return b
    })
    this.content.append(tabs, table)
    if (reply.rankings?.[0]) show(reply.rankings[0])
    this.buttons[0]?.focus()
  }
}
