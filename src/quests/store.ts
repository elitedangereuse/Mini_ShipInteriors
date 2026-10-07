import { knownQuests, questAdvance, questById, questFlag, questStarted, stepComplete, type QuestReward, type QuestState } from '../../shared/quests.js'

/*
 * Le journal de quêtes du joueur : pour chaque quête commencée, où il en est (cf.
 * shared/quests.js). Celui d'un CMDR est gardé par le site (outils/mini-shipinteriors-quests.php,
 * repo elitedangereuselight) : le jeu avance tout de suite, le dit au site, et se recale sur lui
 * s'il refuse. Celui d'un invité reste dans son navigateur, comme celui d'un CMDR tant que le site
 * ne répond pas : les pièces s'ouvrent quand même, mais ce qu'une quête offre (un objet, une
 * apparence, des crédits) n'est versé qu'aux CMDR, par le site.
 *
 * Surcharge possible au build : VITE_ED_QUESTS_URL=… npm run build
 */

const QUESTS_URL = import.meta.env.VITE_ED_QUESTS_URL || '/outils/mini-shipinteriors-quests.php'
const LOCAL_KEY = 'mini-shipinteriors-quests'
/** Nouvel essai quand le site n'a pas répondu à un CMDR (secondes). */
const RETRY = 60

/** loading : réponse du site attendue · site : journal gardé par le site · local : gardé dans ce navigateur. */
export type QuestMode = 'loading' | 'site' | 'local'

interface Reply {
  status?: string
  error?: string
  quests?: Record<string, { step?: unknown; flags?: unknown; done?: unknown }> | null
  reward?: QuestReward
  balance?: number
}

type Request = { action: 'start' | 'abandon'; quest: string } | { action: 'advance'; quest: string; step: number } | { action: 'flag'; quest: string; step: number; flag: number }

export class QuestStore {
  mode: QuestMode = 'loading'
  /** Quêtes commencées (terminées comprises), par identifiant. */
  readonly states = new Map<string, QuestState>()
  /** Le site vient de verser la récompense d'une quête : le compte du CMDR est à relire. */
  onReward?: (quest: string, reward: QuestReward) => void
  /** Le journal est écrit là où il est gardé (le site a répondu à toutes les demandes, ou c'est ce navigateur) : le relais peut le relire. */
  onSaved?: () => void
  private listeners = new Set<() => void>()
  /** CMDR dont on tient le journal (null : un invité). */
  private account: string | null = null
  /** Demandes au site, l'une après l'autre ; et celles qui attendent encore leur réponse. */
  private queue: Promise<void> = Promise.resolve()
  private pending = 0
  private retryTimer = 0
  /** Numéro du chargement : la réponse d'un chargement dépassé est ignorée. */
  private ticket = 0

  /** Prévient `cb` à chaque changement du journal ; rend de quoi se désabonner. */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private changed() {
    for (const cb of this.listeners) cb()
  }

  get ready(): boolean {
    return this.mode !== 'loading'
  }

  /** CMDR dont on tient le journal (null : un invité). */
  get owner(): string | null {
    return this.account
  }

  state(id: string): QuestState | undefined {
    return this.states.get(id)
  }

  /** Quêtes terminées. */
  done(): string[] {
    return [...this.states].filter(([, s]) => s.done).map(([id]) => id)
  }

  isDone(id: string): boolean {
    return this.states.get(id)?.done === true
  }

  /**
   * Charge le journal de `account` (null : un invité) : celui du site s'il répond, sinon celui de
   * ce navigateur. À rappeler quand le relais reconnaît le CMDR.
   */
  async load(account: string | null): Promise<void> {
    clearTimeout(this.retryTimer)
    const ticket = ++this.ticket
    this.account = account
    const reply = account ? await this.request('GET') : null
    if (ticket !== this.ticket) return
    if (reply?.status === 'success' && reply.quests) {
      this.mode = 'site'
      this.adopt(reply.quests)
      return
    }
    // Invité, ou site muet : le journal de ce navigateur. Pour un CMDR, on redemandera au site.
    if (this.mode !== 'site') {
      this.mode = 'local'
      this.adopt(this.readLocal())
    }
    if (account && reply?.status !== 'success') this.retryTimer = window.setTimeout(() => void this.load(account), RETRY * 1000)
  }

  /** Commence une quête. */
  start(id: string): boolean {
    if (!this.ready || !questById(id) || this.states.has(id)) return false
    this.states.set(id, questStarted())
    this.commit({ action: 'start', quest: id })
    return true
  }

  /** Un élément de l'étape en cours réuni ; rend true si l'étape est maintenant complète. */
  flag(id: string, flag: number): boolean {
    const def = questById(id), state = this.states.get(id)
    if (!def || !state) return false
    const next = questFlag(def, state, state.step, flag)
    if (typeof next === 'string') return false
    if (next.flags !== state.flags) {
      this.states.set(id, next)
      this.commit({ action: 'flag', quest: id, step: state.step, flag })
    }
    return stepComplete(def, next)
  }

  /** Passe à l'étape suivante ; rend true si la quête est maintenant terminée. */
  advance(id: string): boolean {
    const def = questById(id), state = this.states.get(id)
    if (!def || !state || state.done) return false
    const next = questAdvance(def, state, state.step + 1)
    if (typeof next === 'string') return false
    this.states.set(id, next)
    this.commit({ action: 'advance', quest: id, step: next.step })
    return next.done
  }

  /** Abandonne une quête en cours : on pourra la reprendre du début. */
  abandon(id: string): boolean {
    const state = this.states.get(id)
    if (!state || state.done) return false
    this.states.delete(id)
    this.commit({ action: 'abandon', quest: id })
    return true
  }

  /** Le journal a changé ici : on prévient, puis on l'écrit (site ou navigateur). */
  private commit(request: Request) {
    this.changed()
    if (this.mode !== 'site') {
      this.writeLocal()
      return void this.onSaved?.()
    }
    this.pending++
    this.queue = this.queue.then(() => this.send(request))
  }

  private async send(request: Request) {
    let reply: Reply | null = null
    // Réseau capricieux : deux nouveaux essais avant de laisser le site en retard d'une étape.
    for (let tries = 0; tries < 3 && !reply; tries++) {
      if (tries) await new Promise((resolve) => setTimeout(resolve, 2000))
      reply = await this.request('POST', request)
    }
    this.pending--
    if (!reply) return
    if (reply.status === 'success' && reply.reward) this.onReward?.(request.quest, reply.reward)
    // Le site fait foi : on se recale sur lui s'il refuse, ou une fois toutes les demandes passées.
    if (reply.quests && (reply.status !== 'success' || this.pending === 0)) this.adopt(reply.quests)
    // Tout est écrit : pas avant, le relais relirait un site en retard d'une demande.
    if (this.pending === 0) this.onSaved?.()
  }

  /** Remplace le journal par celui-ci (du site, ou de ce navigateur), en ne gardant que ce qui est valable. */
  private adopt(quests: Reply['quests']) {
    this.states.clear()
    for (const id of knownQuests(Object.keys(quests ?? {}))) {
      const raw = quests![id], def = questById(id)!
      const step = Number(raw?.step), flags = Number(raw?.flags)
      if (!Number.isInteger(step) || !Number.isInteger(flags) || step < 0 || step > def.steps.length || flags < 0) continue
      const done = raw.done === true || step === def.steps.length
      this.states.set(id, { step: done ? def.steps.length : step, flags: done ? 0 : flags & ((1 << (def.steps[step] ?? 0)) - 1), done })
    }
    this.changed()
  }

  /** Un journal par compte : celui d'un invité n'est pas celui du CMDR qui se connecte ensuite. */
  private get localKey(): string {
    return this.account ? `${LOCAL_KEY}:${this.account}` : LOCAL_KEY
  }

  private readLocal(): Reply['quests'] {
    try {
      const data = JSON.parse(localStorage.getItem(this.localKey) ?? 'null')
      return data && typeof data === 'object' ? data : {}
    } catch {
      return {}
    }
  }

  private writeLocal() {
    try {
      localStorage.setItem(this.localKey, JSON.stringify(Object.fromEntries(this.states)))
    } catch {}
  }

  /** Requête au site ; null s'il ne répond pas. */
  private async request(method: 'GET' | 'POST', body?: object): Promise<Reply | null> {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 10000)
    try {
      const res = await fetch(QUESTS_URL, {
        method,
        credentials: 'same-origin',
        headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
      return (await res.json().catch(() => null)) as Reply | null
    } catch {
      return null
    } finally {
      clearTimeout(timeout)
    }
  }
}
