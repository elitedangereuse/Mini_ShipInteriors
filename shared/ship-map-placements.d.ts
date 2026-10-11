export type ShipMapPlacementId = keyof typeof SHIP_MAP_PLACEMENTS

export interface ShipMapAnchor {
  level: number
  x: number
  z: number
  dir: number
  along?: number
}

export interface ResolvedShipMapPlacement extends ShipMapAnchor {
  worldX: number
  worldZ: number
  rot: number
}

export declare const SHIP_MAP_WALL_CLEARANCE: number
export declare const SHIP_MAP_PLACEMENTS: {
  quartersLanding: ShipMapAnchor
  holdLanding: ShipMapAnchor
  holdCrossroads: ShipMapAnchor
  mainLanding: ShipMapAnchor
  mainPromenade: ShipMapAnchor
  upperLanding: ShipMapAnchor
  upperSportsHall: ShipMapAnchor
}
export declare function resolveShipMapPlacement(id: ShipMapPlacementId): ResolvedShipMapPlacement
