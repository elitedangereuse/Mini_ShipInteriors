// Les conduits de ventilation : où tombent ceux que les toilettes à dépression du pont supérieur
// aspirent pendant un saut FSD (cf. src/toilet-flush.ts). Un petit labyrinthe dans le noir, des
// toiles d'araignée, des rats, et au bout, une grille qui donne sur Chez Jacques, le bar
// clandestin de la cale : c'est le seul chemin pour y entrer la première fois, et celui qui fait
// d'un joueur un habitué (cf. BAR_ROOM dans ship-layouts.js).
//
// Partagé par le client, qui construit le pont, et par le relais, qui n'accepte dans les conduits
// que ceux qui sortent des toilettes, et ne fait un habitué que de celui qui a atteint la grille.

/** « Pont » des conduits : hors des ponts desservis par l'ascenseur. */
export const VENT_LEVEL = -3

/** Plan des conduits (cf. ShipMap) : une seule pièce, des gaines d'une tuile de large. */
export const VENT_LAYOUT = [
  'ccccccc ccccc',
  'c   c   c    ',
  'c ccccccc ccc',
  '    c     c c',
  'ccccccccccc c',
  'c   c        ',
  'ccc ccccccccc',
]

/** Où l'on tombe, au sortir de la cuvette. */
export const VENT_DROP = { x: 0, z: 0 }

/** La grille qui donne sur le bar, au fond d'une gaine. */
export const VENT_GRATE = { x: 12, z: 4 }

/** Portée de la grille : il faut être dessus, ou juste à côté, pour la soulever. */
export const VENT_GRATE_REACH = 1.6

/** Où l'on atterrit Chez Jacques (pont de la cale), entre le comptoir et les tables. */
export const BAR_DROP = { level: -1, x: 14.6, z: 11.2 }

/** Pièce des toilettes du pont supérieur : on n'entre dans les conduits que de là. */
export const TOILET_ROOM = { level: 1, room: 'd' }

/** Devant la grille (à portée) ? */
export function atVentGrate(p) {
  return Math.hypot(p.x - VENT_GRATE.x, p.z - VENT_GRATE.z) <= VENT_GRATE_REACH
}
