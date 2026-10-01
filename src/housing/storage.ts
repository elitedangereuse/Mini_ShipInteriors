import { HOME_FORMAT, packHome, sanitizeHome, unpackHome, type HomePlan } from '../../shared/housing-home.js'

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

  /** Le plan de la parcelle gardée ici, ou celui d'une parcelle vide. */
  load(): HomePlan {
    try {
      const raw = localStorage.getItem(this.key)
      return unpackHome(raw ? JSON.parse(raw) : { v: HOME_FORMAT })
    } catch {
      return unpackHome({ v: HOME_FORMAT })
    }
  }

  save(plan: HomePlan) {
    try {
      localStorage.setItem(this.key, JSON.stringify(sanitizeHome(packHome(plan))))
    } catch {}
  }
}
