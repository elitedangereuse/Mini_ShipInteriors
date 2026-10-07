import { tr } from '../i18n'
import { icon, type IconName } from '../icons'
import { questById } from '../../shared/quests.js'
import { QUEST_CONTENT, type QuestContent } from './content'
import type { QuestStore } from './store'

/*
 * Le journal de quêtes, sous le chat : deux onglets de plus, « Quêtes » (celles en cours, avec ce
 * qu'on en sait à cette étape) et « Terminées », dans le même habit que les messages. Une quête se
 * déplie d'un clic : son histoire, ce qu'on a déjà appris, ce qu'elle rapporte, et de quoi
 * l'abandonner (deux clics). J ouvre et referme le journal.
 */

type Tab = 'chat' | 'active' | 'done'

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (className) e.className = className
  if (text) e.textContent = text
  return e
}

export class QuestJournal {
  private tab: Tab = 'chat'
  private readonly panel = document.getElementById('chat')!
  private readonly log = el('div', 'quest-log')
  private readonly tabs = el('div', 'chat-tabs')
  private readonly buttons = new Map<Tab, HTMLButtonElement>()
  private readonly mobile = el('button')
  /** Quêtes dépliées. */
  private readonly open = new Set<string>()
  /** Quête dont l'abandon attend son second clic, et jusqu'à quand. */
  private armed: { id: string; timer: number } | null = null
  /** Des messages sont arrivés au chat pendant qu'on lisait le journal. */
  private unread = false
  /** Quête à mettre en avant (elle vient de bouger). */
  private fresh: string | null = null
  /** Abandon confirmé. */
  onAbandon?: (quest: QuestContent) => void

  constructor(private readonly store: QuestStore) {
    this.log.hidden = true
    this.tabs.setAttribute('role', 'tablist')
    const tab = (id: Tab, glyph: IconName, label: string, title: string) => {
      const b = el('button', 'chat-tab')
      b.type = 'button'
      b.title = title
      b.setAttribute('role', 'tab')
      b.append(icon(glyph), el('span', 'chat-tab-label', label), el('span', 'chat-tab-count'))
      b.onclick = () => this.show(this.tab === id && id !== 'chat' ? 'chat' : id)
      this.buttons.set(id, b)
      this.tabs.append(b)
    }
    tab('chat', 'chat-circle-dots', tr('Chat', 'Chat'), tr('Discussion (Entrée)', 'Chat (Enter)'))
    tab('active', 'scroll', tr('Quêtes', 'Quests'), tr('Quêtes en cours (J)', 'Quests in progress (J)'))
    tab('done', 'check', tr('Terminées', 'Completed'), tr('Quêtes terminées', 'Completed quests'))
    // Fermer le journal, sur un écran tactile (où il s'ouvre par-dessus le jeu, cf. mobile.css).
    const close = el('button', 'chat-tab chat-tab-close')
    close.type = 'button'
    close.title = tr('Fermer', 'Close')
    close.setAttribute('aria-label', close.title)
    close.append(icon('x'))
    close.onclick = () => this.show('chat')
    this.tabs.append(close)
    const form = document.getElementById('chat-form')!
    form.before(this.log)
    form.after(this.tabs)
    // Sur un écran tactile, le chat est replié en un bouton (cf. mobile.ts) : le journal a le sien, à côté.
    this.mobile.id = 'mobile-quest-toggle'
    this.mobile.type = 'button'
    this.mobile.title = tr('Journal de quêtes', 'Quest journal')
    this.mobile.setAttribute('aria-label', this.mobile.title)
    this.mobile.append(icon('scroll'), el('span', 'chat-tab-count'))
    this.mobile.onclick = () => this.show('active')
    this.panel.append(this.mobile)
    // Écrire un message ramène au chat.
    document.getElementById('chat-input')!.addEventListener('focus', () => this.show('chat'))
    this.log.addEventListener('click', (e) => this.click(e))
    // Un message arrive pendant qu'on lit le journal : l'onglet du chat le signale.
    new MutationObserver(() => {
      if (this.tab === 'chat') return
      this.unread = true
      this.paintTabs()
    }).observe(document.getElementById('chat-log')!, { childList: true })
    store.subscribe(() => this.render())
    this.render()
  }

  /** Le journal est-il affiché (à la place des messages) ? */
  get isOpen(): boolean {
    return this.tab !== 'chat'
  }

  /** J : le journal, ou retour au chat. */
  toggle() {
    this.show(this.tab === 'chat' ? 'active' : 'chat')
  }

  /** Une quête vient de bouger : on la retrouvera dépliée, en tête du journal. */
  highlight(id: string) {
    this.fresh = id
    this.open.add(id)
    this.render()
  }

  show(tab: Tab) {
    if (tab === 'chat') this.unread = false
    this.tab = tab
    this.disarm()
    this.render()
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

  private paintTabs() {
    const active = QUEST_CONTENT.filter((q) => this.store.state(q.id) && !this.store.isDone(q.id)).length
    const done = this.store.done().length
    this.mobile.querySelector('.chat-tab-count')!.textContent = active ? String(active) : ''
    for (const [id, b] of this.buttons) {
      b.classList.toggle('selected', this.tab === id)
      b.setAttribute('aria-selected', String(this.tab === id))
      const count = id === 'active' ? active : id === 'done' ? done : 0
      b.querySelector('.chat-tab-count')!.textContent = count ? String(count) : ''
      if (id === 'chat') b.classList.toggle('unread', this.unread)
      // Rien de terminé : l'onglet attendra la première quête bouclée.
      if (id === 'done') b.hidden = done === 0 && this.tab !== 'done'
    }
  }

  private render() {
    this.panel.classList.toggle('journal', this.tab !== 'chat')
    document.getElementById('chat-log')!.hidden = this.tab !== 'chat'
    this.log.hidden = this.tab === 'chat'
    this.paintTabs()
    if (this.tab === 'chat') return
    const cards: HTMLElement[] = []
    const quests = QUEST_CONTENT.filter((q) => {
      const state = this.store.state(q.id)
      return !!state && state.done === (this.tab === 'done')
    })
    // Celle qui vient de bouger d'abord.
    quests.sort((a, b) => Number(b.id === this.fresh) - Number(a.id === this.fresh))
    for (const quest of quests) cards.push(this.tab === 'done' ? this.doneCard(quest) : this.activeCard(quest))
    if (!cards.length) {
      cards.push(el('div', 'quest quest-empty', this.tab === 'done'
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
  kind: 'start' | 'step' | 'done'
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
    const kicker = { start: tr('Nouvelle quête', 'New quest'), step: tr('Journal mis à jour', 'Journal updated'), done: tr('Quête terminée', 'Quest complete') }[toast.kind]
    const head = el('div', 'quest-toast-kicker')
    head.append(icon(toast.kind === 'done' ? 'check' : 'scroll'), kicker)
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
    }, toast.kind === 'done' ? 6500 : 3400)
  }
}
