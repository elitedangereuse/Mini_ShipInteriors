// Plans des trois ponts (cf. ShipMap) : partagés par le client, qui les construit, et par le
// relais, qui vérifie qu'un joueur voit et atteint ce qu'il utilise (cf. sight.js).
// Une lettre par tuile (colonne = x, ligne = z), une lettre par pièce, '+' pour une porte.

import { wingDoors } from './cabin-wings.js'

export const SHIP_LAYOUTS = {
  // Cale ; à la poupe, la salle des machines, derrière l'atelier, et cachée derrière elle, la salle de
  // La Voie, en travaux. Chez Jacques, le bar clandestin, ne s'ouvre que depuis le fond de la soute. À
  // l'est de la soute, le lobby de la baie infestée (SOC-06), en travaux.
  '-1': [
    '                            ',
    '            rrrrr           ',
    '    aaaa    rrrrrgg hhhhhh  ',
    'eeeeaaaa    rrrrr+g hhhhhh  ',
    'eeeeaaaa jjj+rr+rgg hhhhhh  ',
    'eee+aaaa+jjjmmmmmgg+hhhhhh  ',
    'eeeeaaaa jjj+mmmm+g hhhhhh  ',
    'eeeeaaaa    mmmmmgg hhhhhh  ',
    'vv+vv       mmmmm+  hhhhhh  ',
    'vvvvv    bbbbbbbbbb         ',
    'vvvvv    bbbbbbbbbb         ',
    'vvvvv    bbbbbbbbbb         ',
    '         bbbbbbbbbb         ',
    '         bbbbbbbbbb         ',
    '                            ',
  ],
  // Pont principal. À la poupe, la salle commune ; la coursive file vers le poste de pilotage et ses
  // verrières, à la proue, et s'ouvre juste avant sur la Promenade, un atrium vitré autour de la
  // maquette du Cobra. Au nord, le labo du LJPC ; au sud, la grande salle d'arcade (deux portes).
  '0': [
    '  eeeeee   qqqqqrrrrrlllll ccc          ',
    ' eeeeeeee  qqqqqrrrrrlllllccccc bbb     ',
    'eeeeeeeee  qqqqqrrrrrlllllccccc bbbbb   ',
    'eeeeeeeee  qq+qqrr+rrll+llccccc bbbbbbb ',
    'eeeeeeee+cccccccccccccccccccccc+bbbbbbb ',
    'eeeeeeee+cccccccccccccccccccccc+bbbbbbb ',
    'eeeeeeeee  mm+mmss+ssss+ssccccc bbbbbbb ',
    'eeeeeeeee  mmmmmssssssssssccccc bbbbb   ',
    ' eeeeeeee  mmmmmssssssssssccccc bbb     ',
    '  eeeeee   mmmmmssssssssss ccc          ',
  ],
  // Pont supérieur : les quartiers ; derrière le salon d'écoute, le cinéma.
  '1': [
    '                             ',
    '        kkkkddddoooo nnnnnnn ',
    '        kkkkddddoooo nnnnnnn ',
    '     gggk+kkdd+doooo nnnnnnn ',
    '     ggg+ccccccc+ooo nnnnnnn ',
    '     gggccccccccoooo+nnnnnnn ',
    '     gggppp+ppppoooo nnnnnnn ',
    '        pppppppp oo  nnnnnnn ',
    '        pppppppp     nnnnnnn ',
    '        pppppppp             ',
    '        pppppppp             ',
  ],
}

/**
 * Pièces en travaux de chaque pont : on les voit, meublées de caisses et d'échafaudages, mais
 * leurs portes restent verrouillées (cf. ShipMap).
 */
export const CLOSED_ROOMS = {
  '-1': 'hv',
}

/**
 * Plan d'un pont : portes des pièces en travaux verrouillées ; au pont supérieur, les portes des
 * trois espaces d'extension des quartiers (verrouillées tant qu'aucune pièce n'y est posée, cf.
 * applyWings).
 */
export function shipMapOptions(level) {
  return { closed: CLOSED_ROOMS[level] ?? '', doors: String(level) === '1' ? wingDoors().map((d) => ({ ...d, locked: true })) : [] }
}

/** Tables de jeux de plateau (pont principal), par jeu : une table par jeu. */
export const BOARD_TABLES = {
  draughts: { level: 0, x: 21.9, z: 7.6 },
  'guardian-connect': { level: 0, x: 23.3, z: 7.6 },
  'imperial-chess': { level: 0, x: 24.7, z: 7.6 },
}
