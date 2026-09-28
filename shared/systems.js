// Systèmes où mène le saut FSD lancé depuis le siège du pilote (cf. src/systems.ts, qui les
// dessine hors du vaisseau). Le relais tient le système en cours, le même pour tout le bord : il
// choisit la destination d'un saut et l'annonce à tous.

/** Identifiants des destinations, dans l'ordre de la liste des sauts. */
export const SYSTEM_IDS = ['shinrarta', 'sol', 'colonia', 'alpha-centauri', 'lave', 'sagittarius', 'maia', 'beagle-point']

/** Système où se trouve le vaisseau au démarrage du relais. */
export const HOME_SYSTEM = 'shinrarta'

/** Siège du pilote (pont principal) : on ne lance un saut qu'installé dessus. */
export const PILOT_SEAT = { level: 0, x: 36.75, z: 4.5 }

/** Durée d'un saut : charge du réacteur, puis traversée (secondes), comme dans le client. */
export const JUMP_CHARGE = 4
export const JUMP_TRAVEL = 3.5

/** Destination d'un saut depuis `from` : une autre, au hasard (`random` dans [0, 1[). */
export function nextSystem(from, random = Math.random) {
  const others = SYSTEM_IDS.filter((id) => id !== from)
  return others[Math.floor(random() * others.length)]
}
