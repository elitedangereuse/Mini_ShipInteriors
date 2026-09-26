import { clock } from './schedule'

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
export type GainKind = 'passive' | 'task' | 'arcade'

interface Reply {
  status?: string
  error?: string
  now?: number
  balance?: number
  earned?: number
  owned?: number
  wallet?: { balance?: unknown; items?: unknown; skins?: unknown; tasks?: unknown } | null
}

/** Délais des nouveaux essais quand le site ne répond pas (en secondes), puis le dernier en boucle. */
const RETRY = [15, 30, 60, 120, 300]

export class Wallet {
  state: WalletState = 'loading'
  balance = 0
  /** Objets débloqués dans les quartiers (le mobilier d'origine est offert en plus). */
  readonly items = new Map<string, number>()
  /** Apparences achetées (clés de skins.ts). */
  readonly skins = new Set<string>()
  /** Dernière apparition réglée de chaque emplacement de tâche (cf. schedule.ts). */
  readonly tasks = new Map<string, number>()
  /** Des crédits viennent d'être gagnés (le solde est déjà à jour). */
  onGain?: (amount: number, kind: GainKind) => void
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
    if (reply?.status === 'success') this.credit(reply, 'passive')
  }

  /** Tâche réglée : le site vérifie qu'elle était là, et la paie une fois. */
  async claimTask(spot: string, cycle: number): Promise<Outcome> {
    if (this.state === 'guest') return { ok: false, reason: 'guest' }
    if (!this.ready) return { ok: false, reason: 'offline' }
    // Réglée ici, tout de suite : elle ne réapparaît pas pendant la réponse.
    const before = this.tasks.get(spot)
    this.tasks.set(spot, Math.max(before ?? -1, cycle))
    const reply = await this.request('POST', { action: 'task', spot, cycle })
    if (reply?.status === 'success') {
      this.credit(reply, 'task')
      return { ok: true, earned: Number(reply.earned) || 0 }
    }
    const reason = this.refusal(reply)
    // Pas payée (site injoignable, tâche finie entre-temps) : on peut réessayer tant qu'elle est là.
    if (reason !== 'claimed' && this.tasks.get(spot) === cycle) {
      if (before === undefined) this.tasks.delete(spot)
      else this.tasks.set(spot, before)
    }
    return { ok: false, reason }
  }

  /** Débloque un objet des quartiers ; il pourra ensuite être posé plusieurs fois. */
  buyItem(id: string): Promise<Outcome> {
    return this.buy({ item: id }, () => this.items.set(id, 1))
  }

  /** Achète une apparence (clé de skins.ts). */
  buySkin(product: string): Promise<Outcome> {
    return this.buy({ skin: product }, () => this.skins.add(product))
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
    try {
      const res = await fetch(CREDITS_URL, {
        method,
        credentials: 'same-origin',
        headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000),
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
    }
  }
}
