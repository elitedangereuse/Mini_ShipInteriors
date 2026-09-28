// Plans des trois ponts (cf. ShipMap) : partagés par le client, qui les construit, et par le
// relais, qui vérifie qu'un joueur voit et atteint ce qu'il utilise (cf. sight.js).
// Une lettre par tuile (colonne = x, ligne = z), une lettre par pièce, '+' pour une porte.

export const SHIP_LAYOUTS = {
  // Cale ; Chez Jacques, le bar clandestin, ne s'ouvre que depuis le fond de la soute. À l'est de
  // la soute, le lobby de la baie infestée (SOC-06), en travaux.
  '-1': [
    '                            ',
    '            rrrrr           ',
    '    aaaa    rrrrrgg hhhhhh  ',
    '    aaaa    rrrrr+g hhhhhh  ',
    '    aaaa jjj+rr+rgg hhhhhh  ',
    '    aaaa+jjjmmmmmgg+hhhhhh  ',
    '    aaaa jjj+mmmm+g hhhhhh  ',
    '    aaaa    mmmmmgg hhhhhh  ',
    '            mmmmm+  hhhhhh  ',
    '         bbbbbbbbbb         ',
    '         bbbbbbbbbb         ',
    '         bbbbbbbbbb         ',
    '         bbbbbbbbbb         ',
    '         bbbbbbbbbb         ',
    '                            ',
  ],
  // Pont principal. La coursive file vers le poste de pilotage et ses verrières, à la proue ; au nord, les salles
  // de LJPC et de La Voie, au sud celles du Clash galactique et du mini CQC, en travaux.
  '0': [
    '  eeeeee   qqqqqrrrrrlllllvvvvv         ',
    ' eeeeeeee  qqqqqrrrrrlllllvvvvv bbb     ',
    'eeeeeeeee  qqqqqrrrrrlllllvvvvv bbbbb   ',
    'eeeeeeeee  qq+qqrr+rrll+llvv+vv bbbbbbb ',
    'eeeeeeee+cccccccccccccccccccccc+bbbbbbb ',
    'eeeeeeeeecccccccccccccccccccccccbbbbbbb ',
    'eeeeeeeee  mm+mmss+ssaa+aakk+kk bbbbbbb ',
    'eeeeeeeee  mmmmmsssssaaaaakkkkk bbbbb   ',
    ' eeeeeeee  mmmmmsssssaaaaakkkkk bbb     ',
    '  eeeeee   mmmmmsssssaaaaakkkkk         ',
  ],
  // Pont supérieur : les quartiers ; derrière le salon panoramique, le cinéma, en travaux.
  '1': [
    '                             ',
    '        kkkkdddd     nnnnnnn ',
    '        kkkkdddd oo  nnnnnnn ',
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
  '0': 'lvak',
  '1': 'n',
}

/** Plan d'un pont, portes des pièces en travaux verrouillées. */
export function shipMapOptions(level) {
  return { closed: CLOSED_ROOMS[level] ?? '' }
}

/** Tables de jeux de plateau (pont principal), par jeu : une table par jeu. */
export const BOARD_TABLES = {
  draughts: { level: 0, x: 17.75, z: 6.75 },
  'guardian-connect': { level: 0, x: 19, z: 7.45 },
  'imperial-chess': { level: 0, x: 17.75, z: 8.4 },
}
