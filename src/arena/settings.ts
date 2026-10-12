import { renderQuality } from '../quality'

/*
 * Le mode « effets réduits » de CMDR Arena, pour les téléphones peu puissants : moins d'éclats et
 * de débris, pas de secousse de la vue ni de bulle de protection, des corps qui s'effacent au lieu
 * de tomber, des traînées sans ombre. Ce qui renseigne la partie reste tel quel : anneaux,
 * contours, plaques, cône de visée, chiffres des dégâts et des soins, minuteurs des pièges,
 * direction des dégâts reçus, marqueurs de touche. Sans choix du joueur, il suit le mode léger du
 * jeu (cf. quality.ts) ; le terminal le règle à part, et l'appareil s'en souvient.
 */

const KEY = 'mini-shipinteriors-arena-fx'

function read(): boolean | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'reduced' ? true : v === 'full' ? false : null
  } catch {
    return null
  }
}

let choice = read()

export const arenaFx = {
  /** Effets réduits, en ce moment (le choix du joueur, sinon le mode léger). */
  get reduced(): boolean {
    return choice ?? renderQuality.light
  },
  /** Le choix du joueur : true, réduits ; false, complets ; null, comme le mode léger. */
  get choice(): boolean | null {
    return choice
  },
  set(on: boolean | null) {
    choice = on
    try {
      if (on === null) localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, on ? 'reduced' : 'full')
    } catch {}
  },
  /** Combien d'éclats tirer d'un effet qui en voudrait `n` (au moins un). */
  count(n: number): number {
    return this.reduced ? Math.max(1, Math.ceil(n * 0.35)) : n
  },
}
