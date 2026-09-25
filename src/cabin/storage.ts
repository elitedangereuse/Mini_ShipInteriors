import { serializeLayout, type CabinItem } from './layout'

/*
 * Enregistrement de l'aménagement des quartiers d'un CMDR sur le site
 * (outils/mini-shipinteriors-cabin.php, repo elitedangereuselight). Le jeu est servi sur le
 * domaine du site : le cookie du CMDR accompagne la requête, et l'en-tête Origin du navigateur
 * prouve au site qu'elle vient bien de lui.
 *
 * Si le site ne répond pas au chargement (jeu servi ailleurs, serveur de dev sans le site,
 * table pas encore créée), l'aménagement est gardé dans le navigateur : rien n'est perdu.
 * Surcharge possible au build : VITE_ED_CABIN_URL=… npm run build
 */

const CABIN_URL = import.meta.env.VITE_ED_CABIN_URL || '/outils/mini-shipinteriors-cabin.php'
/** Délai d'enregistrement après le dernier changement (les petits pas au clavier s'y regroupent). */
const DELAY = 1200

export type SaveState = 'saving' | 'saved' | 'error' | 'local'

/**
 * Demande au site les quartiers du CMDR connecté (le cookie l'identifie) : { cabin } s'il répond
 * (cabin null : jamais aménagés), null sinon (invité, site injoignable). Lancée dès le
 * chargement du jeu, en même temps que la demande de compte.
 */
export async function requestCabin(timeoutMs = 10000): Promise<{ cabin: unknown } | null> {
  try {
    const res = await fetch(CABIN_URL, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null
    const data = (await res.json()) as { cabin?: unknown }
    return { cabin: data.cabin ?? null }
  } catch {
    return null
  }
}

export class CabinStore {
  onState?: (state: SaveState) => void
  private pending: CabinItem[] | null = null
  private timer = 0
  private saving: Promise<void> | null = null
  private readonly localKey: string

  /**
   * @param account nom du CMDR (clé de la copie locale)
   * @param remote le site a répondu : on y enregistre ; sinon, dans ce navigateur
   */
  constructor(
    account: string,
    private readonly remote: boolean,
  ) {
    this.localKey = `cabin:${account.toLowerCase()}`
    addEventListener('pagehide', () => void this.flush(true))
  }

  /** État à afficher quand rien n'attend : enregistré sur le site, ou dans ce navigateur. */
  get idleState(): SaveState {
    return this.remote ? 'saved' : 'local'
  }

  /**
   * Aménagement enregistré (tel que reçu, à normaliser), ou null s'il n'y en a pas encore.
   * @param fromSite réponse du site (requestCabin), si le site a répondu
   */
  saved(fromSite: { cabin: unknown } | null): unknown {
    return this.remote ? (fromSite?.cabin ?? null) : this.readLocal()
  }

  /** Enregistre l'aménagement un peu plus tard (un seul envoi pour une rafale de changements). */
  save(items: CabinItem[]) {
    this.pending = items
    clearTimeout(this.timer)
    if (!this.remote) {
      this.writeLocal(items)
      this.pending = null
      return this.onState?.('local')
    }
    this.onState?.('saving')
    this.timer = window.setTimeout(() => void this.flush(), DELAY)
  }

  /** Envoie tout de suite ce qui attend (fin du mode aménagement, page quittée). */
  async flush(leaving = false): Promise<void> {
    clearTimeout(this.timer)
    const items = this.pending
    if (!items || !this.remote) return
    this.pending = null
    await this.saving
    const body = JSON.stringify({ cabin: serializeLayout(items) })
    this.saving = fetch(CABIN_URL, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
      // La page se ferme : la requête doit partir quand même.
      keepalive: leaving,
    })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status))
        if (!this.pending) this.onState?.('saved')
      })
      .catch(() => {
        // Réessai au prochain changement ; en attendant, l'aménagement reste dans la cabine.
        this.pending ??= items
        this.onState?.('error')
      })
      .finally(() => (this.saving = null))
    return this.saving
  }

  private readLocal(): unknown {
    try {
      const raw = localStorage.getItem(this.localKey)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  private writeLocal(items: CabinItem[]) {
    try {
      localStorage.setItem(this.localKey, JSON.stringify(serializeLayout(items)))
    } catch {}
  }
}
