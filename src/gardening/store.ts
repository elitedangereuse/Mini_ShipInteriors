import { clock } from '../economy/schedule'
import type { Wallet } from '../economy/wallet'
import { emptyGarden, type Garden, type Plot } from '../../shared/gardening.js'

/*
 * Le jardin du CMDR connecté, tenu par le site (outils/mini-shipinteriors-gardening.php, dépôt du
 * site) : ce qui pousse sur ses tuiles, son sac, ses outils, sa réserve. Le jeu demande un geste
 * (préparer, semer, arroser…, acheter chez Capucine, vendre à Marcel), le site vérifie, écrit et
 * rend le jardin. Les cultures poussent à l'heure du site, que le joueur soit en jeu ou non.
 * Un invité n'a pas de jardin.
 *
 * Surcharge possible au build : VITE_ED_GARDENING_URL=… npm run build
 */

const GARDENING_URL = import.meta.env.VITE_ED_GARDENING_URL || '/outils/mini-shipinteriors-gardening.php'

/** loading : réponse attendue · guest : invité · ready : jardin chargé · offline : site injoignable, ou jardinage pas encore installé. */
export type GardenState = 'loading' | 'guest' | 'ready' | 'offline'

/** Pourquoi un geste n'a pas abouti (cf. msi_garden_apply, côté site). */
export type GardenRefusal = 'tile' | 'shed' | 'max' | 'busy' | 'empty' | 'tier' | 'unripe' | 'full' | 'none' | 'funds' | 'guest' | 'offline'

export type GardenAction =
  | { action: 'till'; plot: string; soil: string }
  | { action: 'sow'; plot: string; crop: string }
  | { action: 'water' | 'weed' | 'harvest' | 'clear'; plot: string }
  | { action: 'feed'; plot: string; fert: string }
  | { action: 'tidy'; plots: string[] }
  | { action: 'buy'; kind: 'seed' | 'soil' | 'fert'; id: string; count: number }
  | { action: 'buy'; kind: 'tool'; id: string }
  | { action: 'sell'; item: string; count: number }
  | { action: 'sell'; all: true }

interface Reply {
  status?: string
  error?: string
  now?: number
  garden?: Garden | null
  plots?: Record<string, Plot>
  sold?: number
  balance?: number
  earned?: number
  units?: number
  harvest?: { crop: string; grade: number; count: number }
}

export type GardenOutcome =
  | { ok: true; earned: number; units: number; harvest?: { crop: string; grade: number; count: number } }
  | { ok: false; reason: GardenRefusal }

const REFUSALS: GardenRefusal[] = ['tile', 'shed', 'max', 'busy', 'empty', 'tier', 'unripe', 'full', 'none', 'funds']

export class GardenStore {
  state: GardenState = 'loading'
  garden: Garden = emptyGarden()
  /** Crédits que Marcel a déjà payés aujourd'hui. */
  sold = 0
  private listeners = new Set<() => void>()
  private loading: Promise<void> | null = null

  constructor(private readonly wallet: Wallet) {}

  get ready(): boolean {
    return this.state === 'ready'
  }

  /** L'heure du site (secondes) : celle qui date la pousse. */
  now(): number {
    return Math.floor(clock.now())
  }

  /** Prévient `cb` à chaque changement du jardin ; rend de quoi se désabonner. */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private changed() {
    for (const cb of this.listeners) cb()
  }

  /** Demande le jardin au site (au chargement, puis quand le relais reconnaît le CMDR). */
  load(): Promise<void> {
    this.loading ??= this.fetchGarden().finally(() => (this.loading = null))
    return this.loading
  }

  private async fetchGarden() {
    const reply = await this.request('GET')
    if (reply?.status !== 'success') {
      if (this.state !== 'ready') this.state = 'offline'
    } else if (!reply.garden) this.state = 'guest'
    else {
      this.take(reply)
      this.state = 'ready'
    }
    this.changed()
  }

  private take(reply: Reply) {
    if (reply.garden) this.garden = reply.garden
    if (typeof reply.sold === 'number') this.sold = reply.sold
  }

  /** Un geste : le site le vérifie, l'écrit et rend le jardin ; les crédits suivent (achat, vente). */
  async act(action: GardenAction): Promise<GardenOutcome> {
    if (this.state === 'guest') return { ok: false, reason: 'guest' }
    if (!this.ready) return { ok: false, reason: 'offline' }
    const reply = await this.request('POST', action)
    if (typeof reply?.balance === 'number') this.wallet.site({ earned: reply.earned ?? 0, balance: reply.balance })
    if (reply?.status !== 'success') {
      if (reply?.error === 'auth') this.state = 'guest'
      this.changed()
      const reason = reply?.error === 'auth' ? 'guest' : REFUSALS.includes(reply?.error as GardenRefusal) ? (reply!.error as GardenRefusal) : 'offline'
      return { ok: false, reason }
    }
    this.take(reply)
    this.changed()
    return { ok: true, earned: reply.earned ?? 0, units: reply.units ?? 0, harvest: reply.harvest }
  }

  /** Les tuiles d'un autre CMDR (son identifiant dans l'annuaire), pour qui visite ses quartiers ; null si le site ne répond pas. */
  async plotsOf(stored: string): Promise<Record<string, Plot> | null> {
    const reply = await this.request('GET', undefined, `?of=${encodeURIComponent(stored)}`)
    return reply?.status === 'success' && reply.plots ? reply.plots : null
  }

  /** Requête au site ; null s'il ne répond pas. L'heure qu'il donne recale celle du jeu, comme pour les crédits. */
  private async request(method: 'GET' | 'POST', body?: object, query = ''): Promise<Reply | null> {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 10000)
    try {
      const res = await fetch(GARDENING_URL + query, {
        method,
        credentials: 'same-origin',
        headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
      const reply = (await res.json().catch(() => null)) as Reply | null
      if (reply && typeof reply.now === 'number') {
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
