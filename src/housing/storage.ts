import { HOME_FORMAT, sanitizeHome, type HomeLayout } from '../../shared/housing-home.js'

/*
 * Enregistrement de la parcelle (housing v2) : en attendant que le site garde l'aménagement au
 * format 2 (cf. docs/housing-v2.md, G1), il reste dans ce navigateur, un par CMDR (ou un pour les
 * invités du site). Même forme que ce que vérifieront le site et le relais (sanitizeHome).
 */

const PREFIX = 'mini-interior:home:'

export class HomeStore {
  private readonly key: string

  /** @param owner nom du CMDR connecté, ou null pour un invité */
  constructor(owner: string | null) {
    this.key = PREFIX + (owner ?? '~guest')
  }

  /** La parcelle gardée ici, ou une parcelle vide. */
  load(): HomeLayout {
    try {
      const raw = localStorage.getItem(this.key)
      return (raw && sanitizeHome(JSON.parse(raw))) || { v: HOME_FORMAT }
    } catch {
      return { v: HOME_FORMAT }
    }
  }

  save(home: HomeLayout) {
    try {
      localStorage.setItem(this.key, JSON.stringify(sanitizeHome(home) ?? { v: HOME_FORMAT }))
    } catch {}
  }
}
