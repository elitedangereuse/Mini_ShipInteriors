// Le simulateur d'accueil : où l'on se réveille à sa toute première venue à bord. Une instance
// solo (personne d'autre n'y entre, personne ne nous y voit), trois salles holographiques où
// l'instructrice apprend les gestes de base, puis un téléporteur qui dépose la recrue sur le pont
// principal (cf. src/tutorial.ts).
//
// Partagé par le client, qui construit le simulateur, et par le relais, qui n'accepte de position
// dans le simulateur que sur son sol et ne la rediffuse à personne.

/** « Pont » du simulateur : hors des ponts desservis par l'ascenseur. */
export const TUTORIAL_LEVEL = -4

/**
 * Plan du simulateur (cf. ShipMap) : le sas d'accueil ('a', se déplacer, courir, la caméra), la
 * salle d'essai ('b', examiner, s'asseoir, les emotes, le chat), le téléporteur ('t'). Les portes
 * s'ouvrent au fil des leçons (cf. TUTORIAL_CLOSED).
 */
export const TUTORIAL_LAYOUT = [
  'aaaaaaaabbbbbbb    ',
  'aaaaaaaabbbbbbbtttt',
  'aaaaaaaabbbbbbbtttt',
  'aaaaaaa+bbbbbb+tttt',
  'aaaaaaaabbbbbbbtttt',
  'aaaaaaaabbbbbbb    ',
]

/** Pièces fermées au début : la salle d'essai, puis le téléporteur, s'ouvrent au fil des leçons. */
export const TUTORIAL_CLOSED = 'bt'

/** Où l'on se réveille, face à l'instructrice. */
export const TUTORIAL_SPAWN = { x: 1, z: 3, yaw: Math.PI / 2 }

/** Le téléporteur, au centre de sa salle. */
export const TUTORIAL_TELEPORTER = { x: 16.5, z: 2.5 }

/** À la sortie : sur le pont principal, dans la coursive, à deux pas de l'ascenseur, regard vers la proue. */
export const TUTORIAL_EXIT = { level: 0, x: 12, z: 4.5, yaw: Math.PI / 2 }

/** Une position est-elle sur le sol du simulateur ? */
export function onTutorialFloor(x, z) {
  const row = TUTORIAL_LAYOUT[Math.round(z)]
  const c = row?.[Math.round(x)]
  return c !== undefined && c !== ' '
}
