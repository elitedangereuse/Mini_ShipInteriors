import { DIRS } from './ship-map.js'
import { SHIP_WALL_THICKNESS } from './ship-geometry.js'

/**
 * Les affiches ne sont pas posées directement sur la face théorique de la cloison : ses panneaux
 * décoratifs ont du relief. Cinq centimètres les gardent entièrement devant tous les thèmes.
 */
export const SHIP_MAP_WALL_CLEARANCE = 0.05

/**
 * Ancrages des plans du vaisseau. `x` et `z` désignent la tuile intérieure, `dir` son mur, et
 * `along` un éventuel décalage le long de ce mur. Le placement final est toujours calculé depuis
 * la cloison : il ne peut donc plus dériver dans son épaisseur lors d'un changement de plan.
 */
export const SHIP_MAP_PLACEMENTS = {
  // Au mur nord de l'antichambre des quartiers, dans l'axe de son téléporteur.
  quartersLanding: { level: 2, x: 8, z: 2, dir: 0, along: 0.5 },
  // Au mur sud du quai de fret du palier du monte-charge, contre le bar.
  holdLanding: { level: -1, x: 10, z: 8, dir: 2 },
  // Dans le hall de la cale, au mur ouest, à côté de la vitrine de CMDR Arena, face au téléporteur.
  holdHall: { level: -1, x: 17, z: 5, dir: 3 },
  // Au mur nord du hall d'entraînement, contre le bar.
  trainingHall: { level: -1, x: 13, z: 14, dir: 0, along: 0.5 },
  mainLanding: { level: 0, x: 10, z: 4, dir: 0 },
  // Dans le hall d'accueil, face à son téléporteur, contre la cloison du mess.
  mainHall: { level: 0, x: 8, z: 10, dir: 1, along: 0.5 },
  mainPromenade: { level: 0, x: 26, z: 3, dir: 3 },
  upperLanding: { level: 1, x: 11, z: 4, dir: 0 },
  // Au bout de la coursive, là où elle tourne vers la galerie, contre la cloison du planétarium.
  upperGallery: { level: 1, x: 14, z: 7, dir: 3 },
}

/** Position et rotation dans le monde d'une affiche ancrée à sa cloison. */
export function resolveShipMapPlacement(id) {
  const anchor = SHIP_MAP_PLACEMENTS[id]
  if (!anchor) throw new Error(`Emplacement de plan inconnu : ${id}`)
  const d = DIRS[anchor.dir]
  const along = anchor.along ?? 0
  const offset = SHIP_WALL_THICKNESS / 2 + SHIP_MAP_WALL_CLEARANCE
  // Tangente orientée vers la droite quand on regarde la cloison depuis la pièce.
  const tx = -d.dz, tz = d.dx
  return {
    ...anchor,
    worldX: anchor.x + d.dx * 0.5 - d.dx * offset + tx * along,
    worldZ: anchor.z + d.dz * 0.5 - d.dz * offset + tz * along,
    rot: (4 - anchor.dir) % 4,
  }
}
