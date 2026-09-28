// Plans des trois ponts (cf. ShipMap) : partagés par le client, qui les construit, et par le
// relais, qui vérifie qu'un joueur voit et atteint ce qu'il utilise (cf. sight.js).
// Une lettre par tuile (colonne = x, ligne = z), une lettre par pièce, '+' pour une porte.

import { wingDoors } from './cabin-wings.js'

export const SHIP_LAYOUTS = {
  // Cale ; à la poupe, la salle des machines, derrière l'atelier. Chez Jacques, le bar clandestin, ne
  // s'ouvre que depuis le fond de la soute. À l'est de la soute, le lobby de la baie infestée (SOC-06),
  // en travaux.
  '-1': [
    '                            ',
    '            rrrrr           ',
    '    aaaa    rrrrrgg hhhhhh  ',
    'eeeeaaaa    rrrrr+g hhhhhh  ',
    'eeeeaaaa jjj+rr+rgg hhhhhh  ',
    'eee+aaaa+jjjmmmmmgg+hhhhhh  ',
    'eeeeaaaa jjj+mmmm+g hhhhhh  ',
    'eeeeaaaa    mmmmmgg hhhhhh  ',
    '            mmmmm+  hhhhhh  ',
    '         bbbbbbbbbb         ',
    '         bbbbbbbbbb         ',
    '         bbbbbbbbbb         ',
    '         bbbbbbbbbb         ',
    '         bbbbbbbbbb         ',
    '                            ',
  ],
  // Pont principal. À la poupe, la salle commune ; la coursive file vers le poste de pilotage et ses verrières, à la proue ; au nord, le labo
  // du LJPC et la salle de La Voie, en travaux ; au sud, la grande salle d'arcade (deux portes) et le mini CQC, en travaux.
  '0': [
    '  eeeeee   qqqqqrrrrrlllllvvvvv         ',
    ' eeeeeeee  qqqqqrrrrrlllllvvvvv bbb     ',
    'eeeeeeeee  qqqqqrrrrrlllllvvvvv bbbbb   ',
    'eeeeeeeee  qq+qqrr+rrll+llvv+vv bbbbbbb ',
    'eeeeeeee+cccccccccccccccccccccc+bbbbbbb ',
    'eeeeeeeeecccccccccccccccccccccccbbbbbbb ',
    'eeeeeeeee  mm+mmss+ssss+sskk+kk bbbbbbb ',
    'eeeeeeeee  mmmmmsssssssssskkkkk bbbbb   ',
    ' eeeeeeee  mmmmmsssssssssskkkkk bbb     ',
    '  eeeeee   mmmmmsssssssssskkkkk         ',
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
  '-1': 'h',
  '0': 'vk',
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
