// Extensions des quartiers du commandant (SHIP-02) : trois espaces accolés aux quartiers, sur le
// pont supérieur, chacun derrière sa porte. Un espace débloqué reçoit une pièce, choisie parmi dix
// formes de plan communes aux trois (cf. WING_PATTERNS) ; un espace fermé garde sa porte
// verrouillée. Le client construit la pièce, le relais s'en sert pour la ligne de vue.

import { DIRS } from './ship-map.js'

/** Côté d'un espace, en tuiles : un carré. */
export const WING_SIZE = 5

/**
 * Espaces : coin nord-ouest du carré (x0, z0), porte depuis les quartiers (tuile des quartiers et
 * bord, cf. ShipMap.addDoor), et repère des formes de plan : tuile d'entrée derrière la porte,
 * direction qui s'éloigne de la porte (depth) et direction latérale (lateral). Gauche : à l'ouest
 * des quartiers ; milieu : au sud ; droite : à l'est.
 */
export const WING_SLOTS = [
  { id: 'left', x0: 3, z0: 7, door: { x: 8, z: 9, dir: 3 }, entry: { x: 7, z: 9 }, depth: { dx: -1, dz: 0 }, lateral: { dx: 0, dz: 1 } },
  { id: 'middle', x0: 9, z0: 11, door: { x: 11, z: 10, dir: 2 }, entry: { x: 11, z: 11 }, depth: { dx: 0, dz: 1 }, lateral: { dx: 1, dz: 0 } },
  { id: 'right', x0: 16, z0: 8, door: { x: 15, z: 10, dir: 1 }, entry: { x: 16, z: 10 }, depth: { dx: 1, dz: 0 }, lateral: { dx: 0, dz: -1 } },
]

/** Lettres des pièces de chaque espace sur le plan du pont (une forme en a au plus deux). */
export const WING_ROOMS = { left: 'AB', middle: 'CD', right: 'EF' }

/**
 * Formes de plan, vues depuis la porte : 5 lignes de 5 tuiles, la première touche la porte (sa
 * tuile du milieu est l'entrée). 'a' et 'b' : deux pièces, reliées par les portes intérieures
 * (tuile, et bord : 0 vers la porte d'entrée, 1 à droite, 2 vers le fond, 3 à gauche).
 */
export const WING_PATTERNS = {
  carre: { rows: ['aaaaa', 'aaaaa', 'aaaaa', 'aaaaa', 'aaaaa'] },
  octogone: { rows: [' aaa ', 'aaaaa', 'aaaaa', 'aaaaa', ' aaa '] },
  rectangle: { rows: ['aaaaa', 'aaaaa', 'aaaaa', '     ', '     '] },
  galerie: { rows: [' aaa ', ' aaa ', ' aaa ', ' aaa ', ' aaa '] },
  l: { rows: ['aaaaa', 'aaaaa', 'aa   ', 'aa   ', 'aa   '] },
  t: { rows: [' aaa ', ' aaa ', 'aaaaa', 'aaaaa', 'aaaaa'] },
  u: { rows: ['aaaaa', 'aaaaa', 'aa aa', 'aa aa', 'aa aa'] },
  losange: { rows: ['  a  ', ' aaa ', 'aaaaa', ' aaa ', '  a  '] },
  'deux-pieces': { rows: ['aaaaa', 'aaaaa', 'bbbbb', 'bbbbb', 'bbbbb'], doors: [{ px: 2, pz: 1, dir: 2 }] },
  suite: { rows: ['aaabb', 'aaabb', 'aaabb', 'aaabb', 'aaabb'], doors: [{ px: 2, pz: 3, dir: 1 }] },
}

/** Forme d'une pièce neuve. */
export const DEFAULT_PATTERN = 'carre'

export const slotOf = (id) => WING_SLOTS.find((s) => s.id === id)

/** Direction (0..3, cf. DIRS) d'un vecteur de tuile. */
const dirOf = (dx, dz) => DIRS.findIndex((d) => d.dx === dx && d.dz === dz)

/**
 * Tuiles et portes intérieures d'une pièce de forme `pattern` dans l'espace `slot` : chaque tuile
 * avec la lettre de sa pièce (cf. WING_ROOMS), chaque porte avec sa tuile et son bord.
 */
export function wingPlan(slot, pattern) {
  const shape = WING_PATTERNS[pattern]
  if (!shape) return { tiles: [], doors: [] }
  const letters = WING_ROOMS[slot.id]
  const at = (px, pz) => ({
    x: slot.entry.x + (px - 2) * slot.lateral.dx + pz * slot.depth.dx,
    z: slot.entry.z + (px - 2) * slot.lateral.dz + pz * slot.depth.dz,
  })
  // Directions de la forme (vers l'entrée, droite, fond, gauche) dans le repère du pont.
  const turn = [
    { dx: -slot.depth.dx, dz: -slot.depth.dz },
    { dx: slot.lateral.dx, dz: slot.lateral.dz },
    { dx: slot.depth.dx, dz: slot.depth.dz },
    { dx: -slot.lateral.dx, dz: -slot.lateral.dz },
  ]
  const tiles = []
  shape.rows.forEach((row, pz) => {
    for (let px = 0; px < row.length; px++) {
      const c = row[px]
      if (c === 'a' || c === 'b') tiles.push({ ...at(px, pz), room: letters[c === 'a' ? 0 : 1] })
    }
  })
  const doors = (shape.doors ?? []).map((d) => ({ ...at(d.px, d.pz), dir: dirOf(turn[d.dir].dx, turn[d.dir].dz) }))
  return { tiles, doors }
}

/**
 * Pose les pièces des extensions sur le plan du pont supérieur (qui porte déjà les portes des
 * trois espaces, cf. wingDoors) : `wings` donne, par espace débloqué, la forme de sa pièce ; les
 * autres espaces se vident et leur porte se verrouille. Renvoie les plans posés.
 * @param {import('./ship-map.js').ShipMap} map
 * @param {Partial<Record<string, { shape: string }>>} wings
 */
export function applyWings(map, wings) {
  const placed = {}
  for (const slot of WING_SLOTS) {
    // L'espace est d'abord vidé : ses tuiles, ses portes intérieures.
    for (let z = slot.z0; z < slot.z0 + WING_SIZE; z++) {
      for (let x = slot.x0; x < slot.x0 + WING_SIZE; x++) {
        for (let dir = 0; dir < 4; dir++) map.removeDoor(x, z, dir)
        map.setRoom(x, z, null)
      }
    }
    const shape = wings?.[slot.id]?.shape
    const plan = shape ? wingPlan(slot, shape) : null
    if (plan?.tiles.length) {
      for (const t of plan.tiles) map.setRoom(t.x, t.z, t.room)
      for (const d of plan.doors) map.addDoor(d.x, d.z, d.dir)
      placed[slot.id] = plan
    }
    map.addDoor(slot.door.x, slot.door.z, slot.door.dir)
    map.lock(slot.door.x, slot.door.z, slot.door.dir, !plan?.tiles.length)
  }
  return placed
}

/** Portes des trois espaces, à ajouter au plan du pont supérieur (verrouillées au départ). */
export const wingDoors = () => WING_SLOTS.map((s) => s.door)
