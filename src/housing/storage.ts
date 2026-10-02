import { HOME_FORMAT, unpackHome, type HomePlan } from '../../shared/housing-home.js'

/*
 * Parcelles des essais de housing v2 : avant que le site ne les garde (champ `home` des quartiers,
 * cf. cabin/storage.ts), elles restaient dans ce navigateur, une par CMDR. On ne fait plus que
 * les relire, pour les confier au site la première fois ; rien ne s'y écrit plus.
 */

const PREFIX = 'mini-interior:home:'

export class HomeStore {
  private readonly key: string

  /** @param owner nom du CMDR connecté */
  constructor(owner: string) {
    this.key = PREFIX + owner
  }

  /** Une parcelle des essais est-elle gardée ici ? */
  has(): boolean {
    try {
      return localStorage.getItem(this.key) !== null
    } catch {
      return false
    }
  }

  /** Son plan, ou celui d'une parcelle vide. */
  load(): HomePlan {
    try {
      const raw = localStorage.getItem(this.key)
      return unpackHome(raw ? JSON.parse(raw) : { v: HOME_FORMAT })
    } catch {
      return unpackHome({ v: HOME_FORMAT })
    }
  }
}
