// Extensions des quartiers du commandant (SHIP-02) : trois espaces accolés aux quartiers, sur le
// pont supérieur, chacun derrière sa porte. Un espace débloqué reçoit une pièce, choisie parmi des
// formes de plan communes (cf. WING_PATTERNS) ; un espace fermé garde sa porte verrouillée.

/** Côté d'un espace, en tuiles : un carré. */
export const WING_SIZE = 5

/**
 * Espaces, par identifiant : coin nord-ouest (x0, z0) du carré, et porte depuis les quartiers
 * (tuile des quartiers et bord, cf. ShipMap.addDoor). Gauche : à l'ouest ; milieu : au sud ;
 * droite : à l'est.
 */
export const WING_SLOTS = [
  { id: 'left', x0: 3, z0: 7, door: { x: 8, z: 9, dir: 3 } },
  { id: 'middle', x0: 9, z0: 11, door: { x: 11, z: 10, dir: 2 } },
  { id: 'right', x0: 16, z0: 8, door: { x: 15, z: 10, dir: 1 } },
]
