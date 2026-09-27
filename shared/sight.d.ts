import type { ShipMap } from './ship-map.js'

type Point = { x: number; z: number }
type SightMap = Pick<ShipMap, 'room' | 'isFloor' | 'edge'>

/** Largeur de l'ouverture d'une porte. */
export declare const DOOR_GAP: number

/** Rien ne sépare `from` de `to` (coordonnées du pont) : ni mur, ni montant de porte. */
export declare function lineOfSight(map: SightMap, from: Point, to: Point): boolean

/** À portée de main (`range`, au sol) et en vue. */
export declare function canReach(map: SightMap, from: Point, to: Point, range: number): boolean
