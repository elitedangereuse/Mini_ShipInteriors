import type { Partition } from './cabin-partitions.js'

/** Plan tout fait : identifiant, emprise (largeur, hauteur, en tuiles), murs à partir de la tuile (0, 0). */
export interface HomeTemplate {
  id: string
  size: [number, number]
  walls: Partition[]
}

export declare const HOME_TEMPLATES: HomeTemplate[]
export declare function templateOf(id: string): HomeTemplate | undefined
export declare function placeTemplate(template: HomeTemplate, at: { x: number; z: number }, turns?: number): Partition[]
export declare function templateSize(template: HomeTemplate, turns?: number): [number, number]
