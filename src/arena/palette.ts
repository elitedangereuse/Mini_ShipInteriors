import * as THREE from 'three'
import { ARENA_PALETTE, ARENA_TEAMS } from '../../shared/arena.js'
import type { Relation } from './ui'

/*
 * Les couleurs de la partie (cf. ARENA_PALETTE dans shared/arena.js) : celles du joueur, pas celles
 * des camps. Lui en jaune, les siens en bleu, ceux d'en face en rouge-orangé, les soins en vert
 * d'eau ; les mêmes partout (anneaux, contours, plaques, projectiles, pièges, score, chiffres), et
 * distinctes aux formes courantes de daltonisme. Le spectateur n'a pas de « siens » : les deux camps
 * gardent leurs couleurs du lobby, l'orange et le bleu, qui se distinguent de même.
 */

export const TINT: Record<Relation, string> = { self: ARENA_PALETTE.self, ally: ARENA_PALETTE.ally, enemy: ARENA_PALETTE.enemy }
export const WATCH_TINT: Record<Relation, string> = { self: ARENA_PALETTE.self, ally: ARENA_TEAMS[0].color, enemy: ARENA_TEAMS[1].color }
/** Les soins de Betty : chiffres, éclats, seringues, le lien qui la relie au soigné. */
export const HEAL = ARENA_PALETTE.heal

/** Les mêmes, en couleurs de Three.js (partagées : ne pas les modifier). */
const colors = new Map<string, THREE.Color>()
export function color(css: string): THREE.Color {
  let c = colors.get(css)
  if (!c) colors.set(css, (c = new THREE.Color(css)))
  return c
}

/** La relation d'un camp, vu par le joueur de l'équipe `team` (spectateur : l'équipe 0 est « alliée »). */
export function relationOf(team: number, own: number, self = false): Relation {
  return self ? 'self' : team === own ? 'ally' : 'enemy'
}
