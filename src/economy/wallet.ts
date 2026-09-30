import { ECONOMY, type JobKind } from './data'
import { clock } from './schedule'
import type { WingId } from '../../shared/cabin-wings.js'

/*
 * Crédits du CMDR connecté, tenus par le site (outils/mini-shipinteriors-credits.php, repo
 * elitedangereuselight) : son solde, ce qu'il a acheté, les tâches qu'il a réglées. Le jeu
 * demande (un battement du revenu passif, une tâche réglée, un achat), le site vérifie, écrit et
 * répond le nouveau solde. Un invité n'a pas de compte : il voit les tâches, mais n'est pas payé.
 *
 * Chaque réponse du site donne son heure : elle cale l'horloge des tâches (cf. schedule.ts).
 * Surcharge possible au build : VITE_ED_CREDITS_URL=… npm run build
 */

const CREDITS_URL = import.meta.env.VITE_ED_CREDITS_URL || '/outils/mini-shipinteriors-credits.php'

/**
 * loading : réponse attendue · guest : invité (pas de compte) · ready : compte chargé ·
 * offline : site injoignable ou crédits pas encore installés (nouvel essai plus tard).
 */
export type WalletState = 'loading' | 'guest' | 'ready' | 'offline'

/** Pourquoi une demande n'a pas abouti. */
export type Refusal = 'funds' | 'max' | 'owned' | 'claimed' | 'expired' | 'inactive' | 'early' | 'guest' | 'offline'

export type Outcome = { ok: true; earned: number } | { ok: false; reason: Refusal }

/** D'où viennent des crédits gagnés. */
export type GainKind = 'passive' | 'task' | 'job' | 'arcade' | 'site'

interface Reply {
  status?: string
  error?: string
  now?: number
  balance?: number
  earned?: number
  owned?: number
  wallet?: { balance?: unknown; items?: unknown; skins?: unknown; wings?: unknown; tasks?: unknown } | null
}

/** Délais des nouveaux essais quand le site ne répond pas (en secondes), puis le dernier en boucle. */
const RETRY = [15, 30, 60, 120, 300]

/** Attend l'heure `t` (ms, horloge de l'appareil) si elle n'est pas encore passée. */
async function waitUntil(t: number): Promise<void> {
  const wait = t - Date.now()
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
}

export class Wallet {
  state: WalletState = 'loading'
  balance = 0
  /** Objets débloqués dans les quartiers (le mobilier d'origine est offert en plus). */
  readonly items = new Map<string, number>()
  /** Apparences achetées (clés de skins.ts). */
  readonly skins = new Set<string>()
  /** Espaces d'extension des quartiers débloqués (cf. shared/cabin-wings.js). */
  readonly wings = new Set<WingId>()
  /** Dernière apparition réglée de chaque emplacement de tâche (cf. schedule.ts). */
  readonly tasks = new Map<string, number>()
  /** Des crédits viennent d'être gagnés (le solde est déjà à jour). */
  onGain?: (amount: number, kind: GainKind) => void
  /** Le revenu passif du jour est entièrement versé (cf. `passive.daily`) : prévenu une fois. */
  onPassiveCap?: () => void
  private passiveCapped = false
  /** Heure (ms) de la dernière tâche payée : le site veut `taskRules.minGap` secondes entre deux. */
  private lastTask = 0
  /** Heure (ms) de la commande en cours, et de la dernière paie, de chaque travail (cf. finishJob). */
  private readonly jobStarted = new Map<JobKind, number>()
  private readonly jobPaid = new Map<JobKind, number>()
  private listeners = new Set<() => void>()
  private loading: Promise<void> | null = null
  private retries = 0
  private retryTimer = 0

  /** Prévient `cb` à chaque changement (solde, inventaire, état) ; rend de quoi se désabonner. */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private changed() {
    for (const cb of this.listeners) cb()
  }

  get ready(): boolean {
    return this.state === 'ready'
  }

  /** Demande le compte au site (au chargement, puis quand le relais reconnaît le CMDR). */
  load(): Promise<void> {
    this.loading ??= this.fetchWallet().finally(() => (this.loading = null))
    return this.loading
  }

  private async fetchWallet() {
    clearTimeout(this.retryTimer)
    const reply = await this.request('GET')
    if (!reply || reply.status !== 'success') {
      // Site injoignable, table absente : on garde ce qu'on savait, et on réessaie plus tard.
      if (this.state !== 'ready') this.state = 'offline'
      this.changed()
      const wait = RETRY[Math.min(this.retries++, RETRY.length - 1)]
      this.retryTimer = window.setTimeout(() => void this.load(), wait * 1000)
      return
    }
    this.retries = 0
    const w = reply.wallet
    if (!w) {
      this.state = 'guest'
      this.changed()
      return
    }
    this.balance = Number(w.balance) || 0
    this.items.clear()
    // Les anciennes sauvegardes comptent des exemplaires : un achat, quel que soit ce nombre,
    // devient le déblocage permanent de l'objet.
    for (const [id, n] of Object.entries((w.items as Record<string, unknown>) ?? {})) if (Number(n) > 0) this.items.set(id, 1)
    this.skins.clear()
    for (const s of Array.isArray(w.skins) ? w.skins : []) if (typeof s === 'string') this.skins.add(s)
    this.wings.clear()
    for (const id of Array.isArray(w.wings) ? w.wings : []) if (id === 'left' || id === 'middle' || id === 'right') this.wings.add(id)
    for (const [spot, cycle] of Object.entries((w.tasks as Record<string, unknown>) ?? {})) {
      // Une tâche réglée pendant la réponse (un autre onglet) : on garde la plus récente.
      if (Number.isInteger(cycle)) this.tasks.set(spot, Math.max(this.tasks.get(spot) ?? -1, cycle as number))
    }
    this.state = 'ready'
    this.changed()
  }

  /** Battement du revenu passif (une fois par minute, cf. main.ts). */
  async passive(): Promise<void> {
    if (!this.ready) return
    const reply = await this.request('POST', { action: 'passive' })
    if (reply?.status === 'success') {
      // Un nouveau jour : le plafond est reparti.
      this.passiveCapped = false
      this.credit(reply, 'passive')
    } else if (reply?.error === 'max' && !this.passiveCapped) {
      this.passiveCapped = true
      this.onPassiveCap?.()
    }
  }

  /** Tâche réglée : le site vérifie qu'elle était là, et la paie une fois. */
  async claimTask(spot: string, cycle: number): Promise<Outcome> {
    if (this.state === 'guest') return { ok: false, reason: 'guest' }
    if (!this.ready) return { ok: false, reason: 'offline' }
    // Réglée ici, tout de suite : elle ne réapparaît pas pendant la réponse.
    const before = this.tasks.get(spot)
    this.tasks.set(spot, Math.max(before ?? -1, cycle))
    // Deux tâches voisines, réglées coup sur coup : la seconde attend son tour plutôt qu'un refus.
    // Le créneau est réservé tout de suite : une troisième tâche prend le suivant.
    const slot = Math.max(Date.now(), this.lastTask + (ECONOMY.taskRules.minGap + 0.5) * 1000)
    this.lastTask = slot
    await waitUntil(slot)
    const reply = await this.request('POST', { action: 'task', spot, cycle })
    if (reply?.status === 'success') {
      this.credit(reply, 'task')
      return { ok: true, earned: Number(reply.earned) || 0 }
    }
    const reason = this.refusal(reply)
    // Pas payée (site injoignable, tâche finie entre-temps) : on peut réessayer tant qu'elle est là.
    // Plafond du jour atteint : elle reste réglée, sans paie (la réessayer n'y changerait rien).
    if (reason !== 'claimed' && reason !== 'max' && this.tasks.get(spot) === cycle) {
      if (before === undefined) this.tasks.delete(spot)
      else this.tasks.set(spot, before)
    }
    return { ok: false, reason }
  }

  /**
   * Commande prise au rail de Marcel, révision demandée à Nico : le site note l'heure. Il ne paiera
   * le travail qu'après `minTime` secondes (cf. finishJob) ; un invité n'est pas suivi.
   */
  startJob(job: JobKind) {
    if (!this.ready) return
    this.jobStarted.set(job, Date.now())
    void this.request('POST', { action: 'job', job, phase: 'start' })
  }

  /**
   * Plat envoyé, révision finie : le site vérifie la commande et ses délais, puis paie. Le jeu
   * attend lui-même la fin des délais (`minTime` depuis la commande, `minGap` depuis la paie
   * précédente) : un joueur rapide est payé quelques secondes plus tard, jamais refusé.
   */
  async finishJob(job: JobKind): Promise<Outcome> {
    if (this.state === 'guest') return { ok: false, reason: 'guest' }
    if (!this.ready) return { ok: false, reason: 'offline' }
    const started = this.jobStarted.get(job)
    if (started === undefined) return { ok: false, reason: 'inactive' }
    this.jobStarted.delete(job)
    const rules = ECONOMY[job]
    // Une seconde de marge : l'heure du site n'est connue qu'à la seconde près.
    await waitUntil(Math.max(started + (rules.minTime + 1) * 1000, (this.jobPaid.get(job) ?? 0) + (rules.minGap + 1) * 1000))
    const reply = await this.request('POST', { action: 'job', job, phase: 'done' })
    if (reply?.status === 'success') {
      this.jobPaid.set(job, Date.now())
      this.credit(reply, 'job')
      return { ok: true, earned: Number(reply.earned) || 0 }
    }
    return { ok: false, reason: this.refusal(reply) }
  }

  /** Débloque un objet des quartiers ; il pourra ensuite être posé plusieurs fois. */
  buyItem(id: string): Promise<Outcome> {
    return this.buy({ item: id }, () => this.items.set(id, 1))
  }

  /** Achète une apparence (clé de skins.ts). */
  buySkin(product: string): Promise<Outcome> {
    return this.buy({ skin: product }, () => this.skins.add(product))
  }

  /** Débloque un espace d'extension des quartiers (son prix dépend du nombre déjà débloqué). */
  buyWing(id: WingId): Promise<Outcome> {
    return this.buy({ wing: id }, () => this.wings.add(id))
  }

  /** Cocktail consommable : le site débite le verre, sans l'ajouter aux objets possédés. */
  async buyDrink(drink: string): Promise<Outcome> {
    if (this.state === 'guest') return { ok: false, reason: 'guest' }
    if (!this.ready) return { ok: false, reason: 'offline' }
    const reply = await this.request('POST', { action: 'drink', drink })
    if (typeof reply?.balance === 'number') this.balance = reply.balance
    this.changed()
    return reply?.status === 'success' ? { ok: true, earned: 0 } : { ok: false, reason: this.refusal(reply) }
  }

  private async buy(body: object, own: (owned: number) => void): Promise<Outcome> {
    if (this.state === 'guest') return { ok: false, reason: 'guest' }
    if (!this.ready) return { ok: false, reason: 'offline' }
    const reply = await this.request('POST', { action: 'buy', ...body })
    if (typeof reply?.balance === 'number') this.balance = reply.balance
    if (reply?.status !== 'success') {
      this.changed()
      return { ok: false, reason: this.refusal(reply) }
    }
    own(Number(reply.owned) || 1)
    this.changed()
    return { ok: true, earned: 0 }
  }

  /** Crédits d'un record à une borne d'arcade, dans la réponse du site aux scores (cf. arcade/scores.ts). */
  arcade(credits: { earned: number; balance: number }) {
    if (!this.ready) return
    this.credit(credits, 'arcade')
  }

  site(credits: { earned: number; balance?: number }) {
    this.credit(credits, 'site')
  }

  private credit(reply: { earned?: number; balance?: number }, kind: GainKind) {
    if (typeof reply.balance === 'number') this.balance = reply.balance
    this.changed()
    const earned = Number(reply.earned) || 0
    if (earned > 0) this.onGain?.(earned, kind)
  }

  private refusal(reply: Reply | null): Refusal {
    if (!reply) return 'offline'
    const known: Refusal[] = ['funds', 'max', 'owned', 'claimed', 'expired', 'inactive', 'early']
    if (reply.error === 'auth') {
      this.state = 'guest'
      this.changed()
      return 'guest'
    }
    return known.includes(reply.error as Refusal) ? (reply.error as Refusal) : 'offline'
  }

  /** Requête au site ; null s'il ne répond pas. L'heure qu'il donne recale celle des tâches. */
  private async request(method: 'GET' | 'POST', body?: object): Promise<Reply | null> {
    // `AbortSignal.timeout()` est encore absent de certains navigateurs. Dans ce cas, son appel
    // levait une exception avant même le fetch et le Holo-Me croyait la boutique hors ligne alors
    // que l'endpoint répondait correctement.
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 10000)
    try {
      const res = await fetch(CREDITS_URL, {
        method,
        credentials: 'same-origin',
        headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
      const reply = (await res.json().catch(() => null)) as Reply | null
      if (reply && typeof reply.now === 'number') {
        // Écart d'une seconde près (l'heure du site est entière) : on ne recale que s'il bouge vraiment.
        const offset = reply.now - Date.now() / 1000
        if (Math.abs(offset - clock.offset) > 2) clock.offset = offset
      }
      return reply
    } catch {
      return null
    } finally {
      clearTimeout(timeout)
    }
  }
}
