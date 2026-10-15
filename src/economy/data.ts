import { EN } from '../i18n'
import raw from './economy.json'
import type { GardenRules } from '../../shared/gardening.js'

/*
 * Économie du jeu : les crédits (CR), comme dans Elite Dangerous. Tous les chiffres vivent dans
 * economy.json, que le site relit pour tenir les comptes (phputils/mini_shipinteriors/credits.php,
 * repo elitedangereuselight) : le prix affiché ici est celui que le site débite.
 * - start : prime de bienvenue d'un nouveau compte ;
 * - passive : revenu passif, payé à chaque battement (une fois par minute), `daily` minutes par jour ;
 * - items, skins : prix de déblocage des objets des quartiers et des apparences (cf. skins.ts) ;
 * - plot : prix des trois agrandissements de la parcelle du pont des quartiers, dans l'ordre ;
 * - boosters : au Comptoir des Cartes Dangereuses, le prix de chaque booster de la semaine, dans
 *   l'ordre d'achat (autant de prix, autant de boosters par semaine, au plus ; cf. src/cards/) ;
 * - salvage : récompense d'une mission réussie en zone thargoïde, par membre (par colis, et bonus
 *   par ennemi au-delà du premier, cf. salvageReward dans shared/salvage.js) ; `daily` missions
 *   payées par jour, et aucune bouclée en moins de `minPerParcel` secondes par colis ;
 * - messRush : les récompenses de MESS RUSH (crédits selon la médaille, victoires payées par jour,
 *   booster de la semaine, bascule du jeudi), que le site applique (cf. MessRushRules) ;
 * - hangar, garden : prime d'une révision faite avec Nico (cf. hangar.ts), d'une fiche de culture
 *   avec Capucine (cf. greenhouse.ts) : payée `minTime` secondes au moins après la commande, au plus une
 *   toutes les `minGap` secondes et `daily` par jour. `kitchen`, la prime des plats de l'ancienne
 *   cuisine solo, n'est plus demandée (MESS RUSH l'a remplacée, cf. src/mess-rush/) : elle reste
 *   tant que le site la relit (cf. docs/mess-rush-site.md) ;
 * - tasks, spots : les tâches de bord et leurs emplacements (cf. schedule.ts et tasks.ts) ;
 *   taskRules : au plus `daily` tâches payées par jour, espacées d'au moins `minGap` secondes ;
 * - gardening : le jardinage dans les quartiers (cf. shared/gardening.js) : cultures, outils,
 *   terreaux et engrais vendus par Capucine, et ce que Marcel paie par jour pour les récoltes ;
 * - arcade : paliers de score des bornes, et prime du record du vaisseau (`recordDaily` par jeu et
 *   par jour).
 * Les jours sont ceux de Paris. Les plafonds, c'est le site qui les tient ; le jeu les respecte (il
 * espace ses demandes, cf. wallet.ts) et dit au joueur quand l'un est atteint.
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

/** Travail payé aux côtés d'un membre d'équipage : les plats de Marcel, les révisions de Nico, les fiches de culture de Capucine. */
export type JobKind = 'hangar' | 'garden'

/**
 * MESS RUSH (cf. docs/mess-rush-site.md, que le site applique) : durée du service, crédits d'une
 * victoire selon la médaille, victoires payées par jour, boosters de la première victoire de la
 * semaine (et si elle paie aussi des crédits), jour de la bascule de la semaine ; l'heure et le
 * fuseau, à `null` tant qu'ils ne sont pas décidés, sont ceux de la boutique de boosters.
 */
export interface MessRushRules {
  service: number
  credits: { bronze: number; silver: number; gold: number }
  daily: number
  boosters: number
  firstWinCredits: boolean
  reset: { day: string; hour: number | null; tz: string | null }
}

/** Prime d'un travail, et ses délais (s) : de la commande à la paie, entre deux paies ; payés par jour. */
export interface JobRules {
  reward: number
  minTime: number
  minGap: number
  daily: number
}

interface Economy {
  start: number
  passive: { perMinute: number; beat: number; minGap: number; maxGap: number; daily: number }
  items: Record<string, number>
  skins: Record<string, number>
  /** Les tenues de sport du Vestiaire des Légendes : le jeu et le score qui les gagnent (le site les verse). */
  sportSkins?: Record<string, { game: string; score: number }>
  plot?: number[]
  boosters?: { prices: number[] }
  salvage: { parcel: number; enemyBonus: number; daily: number; minPerParcel: number }
  messRush?: MessRushRules
  kitchen: JobRules
  hangar: JobRules
  garden: JobRules
  drinks: Record<string, number>
  gardening: GardenRules
  tasks: Record<TaskKind, TaskDef>
  taskRules: { daily: number; minGap: number }
  spots: Spot[]
  arcade: { record: number; recordDaily: number; tiers: Record<string, [number, number][]> }
}

export const ECONOMY = raw as unknown as Economy

/** Prix du prochain espace d'extension des quartiers, `owned` étant déjà débloqués ; null : plus rien à débloquer. */

/** Prix de l'agrandissement de la parcelle qui mène au palier `stage` (1 ou 2), ou null. */
export const plotPrice = (stage: number): number | null => ECONOMY.plot?.[stage - 1] ?? null

/** Prix de déblocage d'un objet du catalogue des quartiers, ou null s'il n'est pas à vendre. */
export const itemPrice = (id: string): number | null => ECONOMY.items[id] ?? null

/** Prix d'une apparence (clé de skins.ts : « suit.artemis »…), ou null si elle est gratuite. */
export const skinPrice = (product: string): number | null => ECONOMY.skins[product] ?? null

/** Les tenues de sport (clé de skins.ts) et le record qui les gagne ; elles ne s'achètent pas. */
export const sportSkins = (): Record<string, { game: string; score: number }> => ECONOMY.sportSkins ?? {}

/** Prix d'un cocktail, débité à chaque verre. */
export const drinkPrice = (id: string): number | null => ECONOMY.drinks[id] ?? null

/** Paliers de score d'un jeu d'arcade : [score, crédits gagnés]. */
export const arcadeTiers = (game: string): [number, number][] => ECONOMY.arcade.tiers[game] ?? []

const number = new Intl.NumberFormat(EN ? 'en-US' : 'fr-FR')

/** « 12 450 CR » (« 12,450 CR » en anglais). */
export const formatCredits = (n: number): string => `${number.format(Math.round(n))} CR`
