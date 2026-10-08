import { EN, tr } from '../i18n'
import { icon, type IconName } from '../icons'
import { questById } from '../../shared/quests.js'
import { QUEST_CONTENT, type QuestContent } from './content'
import type { QuestStore } from './store'

/*
 * Le journal de quêtes : un second combiné, frère de l'annuaire (cf. crew/phone.ts), qui flotte au
 * même endroit et se réduit à sa propre languette, sous celle de l'équipage. Même habit (cf.
 * crew/phone.css), en jaune des quêtes et chanfreins inversés, pour qu'on ne les confonde pas.
 * Deux onglets : « En cours » (ce qu'on sait à cette étape) et « Terminées ». Une quête se déplie
 * d'un clic : son histoire, ce qu'on a déjà appris, ce qu'elle rapporte, et de quoi l'abandonner
 * (deux clics). J ouvre et referme le journal.
 */

type Tab = 'active' | 'done'

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (className) e.className = className
  if (text) e.textContent = text
  return e
}

export class QuestJournal {
  private pane: Tab = 'active'
  private readonly root = document.getElementById('quest-phone')!
  private readonly tab = el('button', 'ph-tab qp-tab')
  private readonly tabCount = el('b')
  private readonly tabBadge = el('span', 'ph-badge')
  private readonly body = el('section', 'ph-body')
  private readonly kept = el('span', 'ph-link')
  private readonly summary = el('p', 'ph-summary')
  private readonly segs = new Map<Tab, HTMLButtonElement>()
  private readonly log = el('div', 'ph-list quest-log')
  /** Quêtes dépliées. */
  private readonly open = new Set<string>()
  /** Quête dont l'abandon attend son second clic, et jusqu'à quand. */
  private armed: { id: string; timer: number } | null = null
  /** Quête à mettre en avant (elle vient de bouger). */
  private fresh: string | null = null
  /** Une quête a bougé depuis que le journal est réduit : la languette le signale. */
  private news = false
  /** Abandon confirmé. */
  onAbandon?: (quest: QuestContent) => void
  /** Ouvert ou réduit. */
  onToggle?: (open: boolean) => void

  constructor(private readonly store: QuestStore) {
    const title = tr('Quêtes', 'Quests')
    this.tab.type = 'button'
    this.tab.title = tr('Journal de quêtes (J)', 'Quest journal (J)')
    this.tab.setAttribute('aria-label', this.tab.title)
    this.tab.setAttribute('aria-controls', 'quest-phone-body')
    this.tab.append(icon('scroll'), this.tabCount, this.tabBadge)
    this.tab.onclick = () => this.toggle()

    this.body.id = 'quest-phone-body'
    this.body.setAttribute('aria-label', tr('Journal de quêtes', 'Quest journal'))
    const status = el('header', 'ph-status')
    const kicker = el('span', 'ph-time')
    kicker.append(icon('scroll'), tr('Journal de bord', 'Ship\'s log'))
    const close = el('button', 'ph-close')
    close.type = 'button'
    close.title = tr('Réduire (J)', 'Collapse (J)')
    close.setAttribute('aria-label', tr('Réduire le journal', 'Collapse the journal'))
    close.append(icon('x'))
    close.onclick = () => this.close()
    status.append(kicker, this.kept, close)

    const head = el('div', 'ph-head')
    head.append(el('h2', '', title), this.summary)
    const seg = el('div', 'ph-segs')
    seg.setAttribute('role', 'tablist')
    const add = (id: Tab, label: string) => {
      const b = el('button', 'ph-seg')
      b.type = 'button'
      b.setAttribute('role', 'tab')
      b.append(label, el('span', 'ph-badge'))
      b.onclick = () => this.show(id)
      this.segs.set(id, b)
      seg.append(b)
    }
    add('active', tr('En cours', 'In progress'))
    add('done', tr('Terminées', 'Completed'))
    const view = el('div', 'ph-view')
    view.append(head, seg, this.log)
    const screen = el('div', 'ph-screen')
    screen.append(view)
    this.body.append(status, screen)
    this.root.append(this.body)
    // La languette vit au bas de la colonne de gauche du HUD, sous celle de l'annuaire.
    document.getElementById('invites')!.parentElement!.append(this.tab)

    this.log.addEventListener('click', (e) => this.click(e))
    // Échap, le focus dans le journal : il se referme.
    this.root.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      this.close()
    })
    store.subscribe(() => this.render())
    this.setOpen(false, false)
  }

  get isOpen(): boolean {
    return this.root.classList.contains('open')
  }

  /** Le clic (ou autre événement) vise-t-il le journal ? */
  contains(target: EventTarget | null): boolean {
    return target instanceof Node && (this.root.contains(target) || this.tab.contains(target))
  }

  /** J : le journal s'ouvre, ou se réduit. */
  toggle() {
    this.setOpen(!this.isOpen)
  }

  /** Rend false s'il n'y avait rien à fermer. */
  close(): boolean {
    if (!this.isOpen) return false
    this.setOpen(false)
    return true
  }

  private setOpen(open: boolean, announce = true) {
    // L'annuaire, s'il est ouvert, cède d'abord la place (cf. main.ts).
    if (announce) this.onToggle?.(open)
    this.root.classList.toggle('open', open)
    // Sur un écran large mais peu haut, la colonne de gauche du HUD se pousse (cf. phone.css).
    document.body.classList.toggle('quest-phone-open', open)
    this.tab.setAttribute('aria-expanded', String(open))
    this.body.inert = !open
    if (open) this.news = false
    else {
      this.disarm()
      if (this.root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur()
    }
    this.render()
  }

  /** Une quête vient de bouger : on la retrouvera dépliée, en tête du journal. */
  highlight(id: string) {
    this.fresh = id
    this.open.add(id)
    this.pane = this.store.isDone(id) ? 'done' : 'active'
    if (!this.isOpen) this.news = true
    this.render()
  }

  /** Ouvre le journal sur un onglet. */
  show(pane: Tab) {
    this.pane = pane
    this.disarm()
    if (this.isOpen) this.render()
    else this.setOpen(true)
  }

  private disarm() {
    if (!this.armed) return
    clearTimeout(this.armed.timer)
    this.armed = null
  }

  private click(e: Event) {
    const target = e.target as HTMLElement
    const abandon = target.closest<HTMLElement>('[data-abandon]')?.dataset.abandon
    if (abandon) {
      // Un premier clic arme, le second confirme.
      if (this.armed?.id !== abandon) {
        this.disarm()
        this.armed = { id: abandon, timer: window.setTimeout(() => { this.armed = null; this.render() }, 4000) }
        return this.render()
      }
      this.disarm()
      const quest = QUEST_CONTENT.find((q) => q.id === abandon)
      if (quest && this.store.abandon(abandon)) this.onAbandon?.(quest)
      return
    }
    const id = target.closest<HTMLElement>('[data-quest]')?.dataset.quest
    if (!id || !target.closest('.quest-head')) return
    if (!this.open.delete(id)) this.open.add(id)
    this.render()
  }

  /** Languette, résumé et onglets : les comptes, et ce qui est nouveau. */
  private paint() {
    const active = QUEST_CONTENT.filter((q) => this.store.state(q.id) && !this.store.isDone(q.id)).length
    const done = QUEST_CONTENT.filter((q) => this.store.isDone(q.id)).length
    this.tabCount.textContent = active ? String(active) : ''
    this.tabBadge.textContent = this.news ? '!' : ''
    this.tab.classList.toggle('alert', this.news)
    this.summary.textContent = EN ? `${active} in progress, ${done} completed` : `${active} en cours, ${done} terminée${done > 1 ? 's' : ''}`
    // Où le journal est gardé : un invité n'a que ce navigateur.
    this.kept.textContent = this.store.mode === 'site' ? tr('Site', 'Site') : this.store.mode === 'local' ? tr('Ce navigateur', 'This browser') : ''
    this.kept.title = this.store.mode === 'site'
      ? tr('Votre journal est gardé par le site : vous le retrouvez partout.', 'Your journal is kept by the site: it follows you everywhere.')
      : this.store.mode === 'local' ? tr('Votre journal n\'est gardé que dans ce navigateur.', 'Your journal is only kept in this browser.') : ''
    this.kept.classList.toggle('on', this.store.mode === 'site')
    for (const [id, b] of this.segs) {
      b.setAttribute('aria-selected', String(this.pane === id))
      const count = id === 'active' ? active : done
      b.querySelector('.ph-badge')!.textContent = count ? String(count) : ''
    }
  }

  private render() {
    this.paint()
    if (!this.isOpen) return
    const cards: HTMLElement[] = []
    const quests = QUEST_CONTENT.filter((q) => {
      const state = this.store.state(q.id)
      return !!state && state.done === (this.pane === 'done')
    })
    // Celle qui vient de bouger d'abord.
    quests.sort((a, b) => Number(b.id === this.fresh) - Number(a.id === this.fresh))
    for (const quest of quests) cards.push(this.pane === 'done' ? this.doneCard(quest) : this.activeCard(quest))
    if (!cards.length) {
      cards.push(el('p', 'ph-empty', this.pane === 'done'
        ? tr('Aucune quête terminée pour l\'instant.', 'No completed quests yet.')
        : !this.store.ready
          ? tr('Lecture du journal…', 'Reading the journal…')
          : tr('Aucune quête en cours. Ouvrez l\'œil : à bord, un « ! » signale ce qui mérite un détour.', 'No quests in progress. Keep your eyes open: aboard, a “!” marks whatever is worth a detour.')))
    }
    this.log.replaceChildren(...cards)
  }

  private head(quest: QuestContent, glyph: IconName, count: string): HTMLElement {
    const head = el('button', 'quest-head')
    head.type = 'button'
    head.setAttribute('aria-expanded', String(this.open.has(quest.id)))
    head.append(icon(glyph), el('span', 'quest-title', quest.title), el('span', 'quest-count', count), icon(this.open.has(quest.id) ? 'caret-up' : 'caret-down', 'quest-caret'))
    return head
  }

  private rewardLine(quest: QuestContent): HTMLElement {
    const line = el('div', 'quest-reward')
    line.append(icon('gift'), quest.reward)
    const reward = questById(quest.id)?.reward
    // Dans ce navigateur seulement : le site ne verse rien (un invité, ou un site qui ne répond pas).
    if (this.store.mode === 'local' && reward && (reward.credits || reward.items?.length || reward.skins?.length)) {
      line.append(el('span', 'quest-guest', tr(' Objets, apparences et crédits ne sont versés qu\'aux CMDR connectés au site.', ' Items, looks and credits are only awarded to CMDRs logged in to the site.')))
    }
    return line
  }

  private activeCard(quest: QuestContent): HTMLElement {
    const state = this.store.state(quest.id)!
    const step = quest.steps[state.step]
    const card = el('div', 'quest')
    card.dataset.quest = quest.id
    card.classList.toggle('fresh', quest.id === this.fresh)
    card.append(this.head(quest, quest.icon, `${state.step + 1}/${quest.steps.length}`), el('div', 'quest-note', step.note))
    if (step.parts?.length) {
      const list = el('ul', 'quest-parts')
      let missing = 0
      step.parts.forEach((part, i) => {
        if (!((state.flags >> i) & 1)) return void missing++
        const li = el('li', 'done')
        li.append(icon('check'), part.found)
        list.append(li)
      })
      if (missing) list.append(el('li', 'todo', missing === step.parts.length
        ? tr(`${missing} choses à trouver.`, `${missing} things to find.`)
        : missing > 1 ? tr(`Il en manque ${missing}.`, `${missing} still missing.`) : tr('Il en manque une.', 'One still missing.')))
      card.append(list)
    }
    if (!this.open.has(quest.id)) return card
    const more = el('div', 'quest-more')
    more.append(el('div', 'quest-pitch', quest.pitch))
    if (state.step > 0) {
      const past = el('ol', 'quest-past')
      for (const s of quest.steps.slice(0, state.step)) past.append(el('li', '', s.note))
      more.append(past)
    }
    more.append(this.rewardLine(quest))
    const abandon = el('button', 'quest-abandon', this.armed?.id === quest.id ? tr('Vraiment ? Encore un clic', 'Sure? Click again') : tr('Abandonner', 'Abandon'))
    abandon.type = 'button'
    abandon.dataset.abandon = quest.id
    abandon.title = tr('Abandonner la quête : elle pourra être reprise du début', 'Abandon the quest: it can be started over')
    more.append(abandon)
    card.append(more)
    return card
  }

  private doneCard(quest: QuestContent): HTMLElement {
    const card = el('div', 'quest quest-done')
    card.dataset.quest = quest.id
    card.append(this.head(quest, 'check', ''), el('div', 'quest-note', quest.epilogue))
    if (!this.open.has(quest.id)) return card
    const more = el('div', 'quest-more')
    more.append(el('div', 'quest-pitch', quest.pitch))
    const past = el('ol', 'quest-past')
    for (const s of quest.steps) past.append(el('li', '', s.note))
    more.append(past, this.rewardLine(quest))
    card.append(more)
    return card
  }
}

// ---------------------------------------------------------------- bandeau

interface Toast {
  kind: 'start' | 'step' | 'done' | 'rumor'
  title: string
  detail: string
}

/**
 * Bandeau d'une quête qui commence, avance ou se termine, en haut de l'écran : l'un après l'autre
 * s'il y en a plusieurs à la suite.
 */
export class QuestToasts {
  private readonly root = el('div', 'quest-toasts')
  private queue: Toast[] = []
  private showing = false

  constructor() {
    this.root.setAttribute('role', 'status')
    document.getElementById('hud')!.append(this.root)
  }

  push(toast: Toast) {
    this.queue.push(toast)
    if (!this.showing) this.next()
  }

  private next() {
    const toast = this.queue.shift()
    this.showing = !!toast
    if (!toast) return
    const box = el('div', `quest-toast ${toast.kind}`)
    const kicker = { start: tr('Nouvelle quête', 'New quest'), step: tr('Journal mis à jour', 'Journal updated'), done: tr('Quête terminée', 'Quest complete'), rumor: tr('On raconte à bord…', 'Word aboard is…') }[toast.kind]
    const head = el('div', 'quest-toast-kicker')
    head.append(icon(toast.kind === 'done' ? 'check' : toast.kind === 'rumor' ? 'chat-circle-dots' : 'scroll'), kicker)
    box.append(head, el('div', 'quest-toast-title', toast.title))
    if (toast.detail) box.append(el('div', 'quest-toast-detail', toast.detail))
    this.root.replaceChildren(box)
    // Une quête terminée reste plus longtemps : sa récompense se lit.
    window.setTimeout(() => {
      box.classList.add('out')
      window.setTimeout(() => {
        box.remove()
        this.next()
      }, 350)
    }, toast.kind === 'done' || toast.kind === 'rumor' ? 6500 : 3400)
  }
}
