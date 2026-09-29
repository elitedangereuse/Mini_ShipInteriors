import { EN } from '../i18n'
import raw from './economy.json'

/*
 * Économie du jeu : les crédits (CR), comme dans Elite Dangerous. Tous les chiffres vivent dans
 * economy.json, que le site relit pour tenir les comptes (phputils/mini_shipinteriors/credits.php,
 * repo elitedangereuselight) : le prix affiché ici est celui que le site débite.
 * - start : prime de bienvenue d'un nouveau compte ;
 * - passive : revenu passif, payé à chaque battement (une fois par minute) ;
 * - items, skins : prix de déblocage des objets des quartiers et des apparences (cf. skins.ts) ;
 * - wings : prix des espaces d'extension des quartiers, du premier débloqué au dernier ;
 * - salvage : récompense d'une mission réussie en zone thargoïde, par membre (par colis, et bonus
 *   par ennemi au-delà du premier, cf. salvageReward dans shared/salvage.js) ;
 * - kitchen : prime d'un plat envoyé avec Marcel (cf. kitchen.ts), au plus un toutes les `minGap`
 *   secondes et `daily` par jour (heure de Paris) ;
 * - tasks, spots : les tâches de bord et leurs emplacements (cf. schedule.ts et tasks.ts) ;
 * - arcade : paliers de score des bornes, et prime du record du vaisseau.
 */

/** Les tâches de bord (cf. src/furniture/tasks.ts pour leur décor). */
export type TaskKind = 'trash' | 'spill' | 'plant' | 'fur' | 'dishes' | 'crates' | 'limpets' | 'console' | 'filter' | 'breach' | 'broken' | 'steam'

export interface TaskDef {
  /** Crédits gagnés, toujours les mêmes. */
  reward: number
  /** Durée du geste, en secondes. */
  duration: number
  /** Une apparition dure `period` secondes ; chaque apparition a une chance sur 1/`chance` d'avoir une tâche. */
  period: number
  chance: number
}

/**
 * Emplacement d'une tâche. Au sol : (x, z) est sa position, `rot` son orientation, `y` sa hauteur
 * (sur une table). Au mur : (x, z) est la tuile devant le mur, `wall` la direction du mur vu de
 * cette tuile (0 nord, 1 est, 2 sud, 3 ouest).
 */
export interface Spot {
  id: string
  task: TaskKind
  deck: number
  x: number
  z: number
  wall?: 0 | 1 | 2 | 3
  rot?: 0 | 1 | 2 | 3
  y?: number
  /** Variante du décor (ordures de la cale, flaque d'huile…). */
  variant?: string
}

interface Economy {
  start: number
  passive: { perMinute: number; beat: number; minGap: number; maxGap: number }
  items: Record<string, number>
  skins: Record<string, number>
  wings: number[]
  salvage: { parcel: number; enemyBonus: number }
  kitchen: { reward: number; minGap: number; daily: number }
  drinks: Record<string, number>
  tasks: Record<TaskKind, TaskDef>
  spots: Spot[]
  arcade: { record: number; tiers: Record<string, [number, number][]> }
}

export const ECONOMY = raw as unknown as Economy

/** Prix du prochain espace d'extension des quartiers, `owned` étant déjà débloqués ; null : plus rien à débloquer. */
export const wingPrice = (owned: number): number | null => ECONOMY.wings?.[owned] ?? null

/** Prix de déblocage d'un objet du catalogue des quartiers, ou null s'il n'est pas à vendre. */
export const itemPrice = (id: string): number | null => ECONOMY.items[id] ?? null

/** Prix d'une apparence (clé de skins.ts : « suit.artemis »…), ou null si elle est gratuite. */
export const skinPrice = (product: string): number | null => ECONOMY.skins[product] ?? null

/** Prix d'un cocktail, débité à chaque verre. */
export const drinkPrice = (id: string): number | null => ECONOMY.drinks[id] ?? null

/** Paliers de score d'un jeu d'arcade : [score, crédits gagnés]. */
export const arcadeTiers = (game: string): [number, number][] => ECONOMY.arcade.tiers[game] ?? []

const number = new Intl.NumberFormat(EN ? 'en-US' : 'fr-FR')

/** « 12 450 CR » (« 12,450 CR » en anglais). */
export const formatCredits = (n: number): string => `${number.format(Math.round(n))} CR`
