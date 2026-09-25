import { serializeLayout, type CabinLayout } from './layout'

/*
 * Enregistrement de l'aménagement des quartiers d'un CMDR sur le site
 * (outils/mini-shipinteriors-cabin.php, repo elitedangereuselight). Le jeu est servi sur le
 * domaine du site : le cookie du CMDR accompagne la requête, et l'en-tête Origin du navigateur
 * prouve au site qu'elle vient bien de lui.
 *
 * Si le site ne répond pas (jeu servi ailleurs, serveur de dev sans le site, table pas encore
 * créée, panne), l'aménagement est gardé dans le navigateur, avec sa date : à la prochaine
 * réponse du site, cette copie l'emporte si elle est plus récente, et part au site.
 *
 * Chaque page du jeu numérote ses envois (session, seq) : le site ignore un envoi plus ancien
 * arrivé après un plus récent (page fermée en plein enregistrement, cf. leave()).
 * Surcharge possible au build : VITE_ED_CABIN_URL=… npm run build
 */

const CABIN_URL = import.meta.env.VITE_ED_CABIN_URL || '/outils/mini-shipinteriors-cabin.php'
/** Délai d'enregistrement après le dernier changement (les petits pas au clavier s'y regroupent). */
const DELAY = 1200
/** Nouvel essai après un échec, même sans nouveau changement. */
const RETRY = 15000

export type SaveState = 'saving' | 'saved' | 'error' | 'local'

/**
 * Réponse du site : l'aménagement enregistré (null : jamais aménagé), sa date (timestamp Unix),
 * la page qui l'a envoyé et le numéro de cet envoi.
 */
export interface SiteCabin {
  cabin: unknown
  updated: number | null
  session?: string
  seq?: number
}

/** Copie gardée dans ce navigateur : l'aménagement, sa date (ms), la page et le numéro de l'envoi. */
interface LocalCopy {
  layout: unknown
  t: number
  session: string
  seq: number
}

/**
 * Demande au site les quartiers du CMDR connecté (le cookie l'identifie), ou null s'il ne répond
 * pas (invité, site injoignable). Lancée dès le chargement du jeu, en même temps que la demande
 * de compte.
 */
export async function requestCabin(timeoutMs = 10000): Promise<SiteCabin | null> {
  try {
    const res = await fetch(CABIN_URL, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null
    const data = (await res.json()) as { cabin?: unknown; updated?: unknown; session?: unknown; seq?: unknown }
    return {
      cabin: data.cabin ?? null,
      updated: typeof data.updated === 'number' ? data.updated : null,
      session: typeof data.session === 'string' ? data.session : '',
      seq: typeof data.seq === 'number' ? data.seq : 0,
    }
  } catch {
    return null
  }
}

export class CabinStore {
  onState?: (state: SaveState) => void
  /** Le site a répondu : on y enregistre ; false : dans ce navigateur ; null : réponse attendue. */
  private remote: boolean | null = null
  /** Dernier aménagement pas encore parti au site. */
  private pending: CabinLayout | null = null
  /**
   * Numéro du dernier aménagement reçu (et de son envoi au site) : la réponse à un envoi plus
   * ancien ne compte plus.
   */
  private version = 0
  /** Cette page du jeu, pour le site (16 chiffres hexadécimaux). */
  private readonly session = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('')
  private timer = 0
  private sending: Promise<void> | null = null
  /** Dernier état annoncé (null : rien d'envoyé encore). */
  private current: SaveState | null = null
  private readonly localKey: string

  /** @param account nom du CMDR (clé de la copie locale) */
  constructor(account: string) {
    this.localKey = `cabin:${account.toLowerCase()}`
    // Page fermée, ou passée en arrière-plan (sur mobile, souvent fermée ensuite sans pagehide).
    addEventListener('pagehide', () => this.leave())
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.leave()
    })
  }

  /** Le site a répondu, ou ne répondra pas : l'aménagement peut changer sans rien écraser. */
  get ready(): boolean {
    return this.remote !== null
  }

  /** Où en est l'enregistrement : à afficher à l'ouverture du mode aménagement. */
  get state(): SaveState {
    return this.current ?? (this.remote ? 'saved' : 'local')
  }

  /** Aménagement gardé dans ce navigateur (à normaliser), à montrer en attendant le site. */
  get localCopy(): unknown {
    return this.readLocal()?.layout ?? null
  }

  /**
   * Réponse du site, ou null s'il ne répond pas (l'aménagement reste alors dans ce navigateur).
   * @returns l'aménagement à afficher (à normaliser, null : celui d'origine) ; `upload` : c'est
   *   la copie de ce navigateur, plus récente que celle du site, à lui envoyer
   */
  connect(site: SiteCabin | null): { layout: unknown; upload: boolean } {
    const local = this.readLocal()
    this.remote = !!site
    if (!site) return { layout: local?.layout ?? null, upload: false }
    // Même page à l'origine des deux : leurs numéros disent laquelle est la plus récente ;
    // sinon, leurs dates (celle du navigateur, celle du site).
    const newer =
      local &&
      (site.cabin === null || (local.session && local.session === site.session ? local.seq > (site.seq ?? 0) : local.t > (site.updated ?? 0) * 1000))
    if (newer) return { layout: local.layout, upload: true }
    this.removeLocal()
    return { layout: site.cabin, upload: false }
  }

  /** Enregistre l'aménagement un peu plus tard (un seul envoi pour une rafale de changements). */
  save(layout: CabinLayout) {
    this.version++
    clearTimeout(this.timer)
    if (!this.remote) {
      this.writeLocal(layout, this.version)
      return this.report('local')
    }
    this.pending = layout
    this.report('saving')
    this.timer = window.setTimeout(() => void this.flush(), DELAY)
  }

  /** Envoie tout de suite ce qui attend (fin du mode aménagement), un envoi après l'autre. */
  flush(): Promise<void> {
    clearTimeout(this.timer)
    if (this.remote && this.pending && !this.sending) this.sending = this.drain().finally(() => (this.sending = null))
    return this.sending ?? Promise.resolve()
  }

  /** Envoie le dernier aménagement, puis celui qui a pu arriver entre-temps. */
  private async drain() {
    while (this.pending) {
      const layout = this.pending
      this.pending = null
      await this.post(layout, this.version, false)
      // Échec, et rien de plus récent : nouvel essai plus tard.
      if (this.pending === layout) return
    }
  }

  /**
   * Page quittée : ce qui attend part aussitôt, sans attendre l'envoi en cours, et reste dans ce
   * navigateur au cas où la requête n'aboutirait pas.
   */
  private leave() {
    clearTimeout(this.timer)
    if (!this.remote || !this.pending) return
    const layout = this.pending
    this.pending = null
    this.writeLocal(layout, this.version)
    void this.post(layout, this.version, true)
  }

  /**
   * Envoie un aménagement au site. En cas d'échec, s'il est toujours le dernier, il reste en
   * attente (et dans ce navigateur) jusqu'au prochain essai.
   */
  private async post(layout: CabinLayout, version: number, keepalive: boolean) {
    try {
      const res = await fetch(CABIN_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ cabin: serializeLayout(layout), session: this.session, seq: version }),
        // La page se ferme : la requête doit partir quand même.
        keepalive,
      })
      if (!res.ok) throw new Error(String(res.status))
      if (version !== this.version) return
      this.removeLocal()
      this.report('saved')
    } catch {
      if (version !== this.version) return
      this.pending = layout
      this.writeLocal(layout, version)
      this.report('error')
      clearTimeout(this.timer)
      this.timer = window.setTimeout(() => void this.flush(), RETRY)
    }
  }

  private report(state: SaveState) {
    this.current = state
    this.onState?.(state)
  }

  private readLocal(): LocalCopy | null {
    try {
      const raw = localStorage.getItem(this.localKey)
      const data = raw ? (JSON.parse(raw) as { t?: unknown; session?: unknown; seq?: unknown } | null) : null
      if (!data || typeof data !== 'object') return null
      return {
        layout: data,
        t: typeof data.t === 'number' ? data.t : 0,
        session: typeof data.session === 'string' ? data.session : '',
        seq: typeof data.seq === 'number' ? data.seq : 0,
      }
    } catch {
      return null
    }
  }

  private writeLocal(layout: CabinLayout, seq: number) {
    try {
      localStorage.setItem(this.localKey, JSON.stringify({ ...serializeLayout(layout), t: Date.now(), session: this.session, seq }))
    } catch {}
  }

  private removeLocal() {
    try {
      localStorage.removeItem(this.localKey)
    } catch {}
  }
}
