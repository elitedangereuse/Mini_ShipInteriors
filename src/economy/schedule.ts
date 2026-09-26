import { ECONOMY, type Spot, type TaskDef } from './data'

/*
 * Calendrier des tâches de bord : où et quand elles apparaissent. Il ne dépend que de l'heure,
 * sans rien demander à personne : tous les joueurs voient les mêmes tâches aux mêmes endroits, et
 * le site, qui fait le même calcul (msi_task_cycle et msi_task_active dans
 * phputils/mini_shipinteriors/credits.php), sait si une tâche qu'on lui dit réglée était bien là.
 *
 * Le temps de chaque emplacement est découpé en apparitions de `period` secondes, décalées d'un
 * emplacement à l'autre (les tâches ne changent pas toutes en même temps). Chaque apparition a une
 * tâche avec la probabilité `chance`, tirée d'un hachage de l'emplacement et du numéro
 * d'apparition. Régler une tâche ne la retire que pour soi : les autres peuvent la régler aussi.
 */

/**
 * Hachage 32 bits d'un texte ASCII : FNV-1a, puis le brassage final de MurmurHash3. Le même que
 * msi_hash32() côté site : ils doivent rester identiques (cf. les tests des deux côtés).
 */
export function hash32(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/**
 * Heure du site, en secondes : celle de l'appareil, corrigée de l'écart mesuré à chaque réponse
 * du site (cf. wallet.ts). Une horloge d'appareil qui dérive ne décale pas les tâches.
 */
export const clock = {
  offset: 0,
  now(): number {
    return Date.now() / 1000 + this.offset
  },
}

export const taskOf = (spot: Spot): TaskDef => ECONOMY.tasks[spot.task]

/** Numéro de l'apparition en cours de l'emplacement, à l'instant `t` (secondes). */
export function cycleAt(spot: Spot, t: number): number {
  const { period } = taskOf(spot)
  return Math.floor((t + (hash32(spot.id) % period)) / period)
}

/** Fin de l'apparition `cycle` de l'emplacement (secondes). */
export function cycleEnd(spot: Spot, cycle: number): number {
  const { period } = taskOf(spot)
  return (cycle + 1) * period - (hash32(spot.id) % period)
}

/** L'apparition `cycle` de l'emplacement a-t-elle une tâche ? */
export function isActive(spot: Spot, cycle: number): boolean {
  return hash32(`${spot.id}#${cycle}`) < taskOf(spot).chance * 4294967296
}

/** Tâches présentes à l'instant `t` : chaque emplacement actif, avec son apparition. */
export function activeTasks(t: number): { spot: Spot; cycle: number }[] {
  const out: { spot: Spot; cycle: number }[] = []
  for (const spot of ECONOMY.spots) {
    const cycle = cycleAt(spot, t)
    if (isActive(spot, cycle)) out.push({ spot, cycle })
  }
  return out
}
