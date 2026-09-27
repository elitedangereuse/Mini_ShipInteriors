// Plans des trois ponts (cf. ShipMap) : partagés par le client, qui les construit, et par le
// relais, qui vérifie qu'un joueur voit et atteint ce qu'il utilise (cf. sight.js).
// Une lettre par tuile (colonne = x, ligne = z), une lettre par pièce, '+' pour une porte.

export const SHIP_LAYOUTS = {
  // Cale
  '-1': [
    '                     ',
    '            rrrrr    ',
    '    aaaa    rrrrrgg  ',
    '    aaaa    rrrrr+g  ',
    '    aaaa jjj+rr+rgg  ',
    '    aaaa+jjjmmmmmgg  ',
    '    aaaa jjj+mmmm+g  ',
    '    aaaa    mmmmmgg  ',
    '            mmmmm    ',
    '                     ',
  ],
  // Pont principal
  '0': [
    '  eeeeee   qqqqqrrrrr       ',
    ' eeeeeeee  qqqqqrrrrr       ',
    'eeeeeeeee  qqqqqrrrrr   bb  ',
    'eeeeeeeee  qq+qqrr+rr  bbbb ',
    'eeeeeeee+cccccccccccc+bbbbbb',
    'eeeeeeeeecccccccccccccbbbbbb',
    'eeeeeeeee  mm+mmss+ss  bbbb ',
    'eeeeeeeee  mmmmmsssss   bb  ',
    ' eeeeeeee  mmmmmsssss       ',
    '  eeeeee   mmmmmsssss       ',
  ],
  // Pont supérieur : les quartiers
  '1': [
    '                     ',
    '        kkkkdddd     ',
    '        kkkkdddd oo  ',
    '     gggk+kkdd+doooo ',
    '     ggg+ccccccc+ooo ',
    '     gggccccccccoooo ',
    '     gggppp+ppppoooo ',
    '        pppppppp oo  ',
    '        pppppppp     ',
    '        pppppppp     ',
    '        pppppppp     ',
  ],
}

/** Tables de jeux de plateau (pont principal), par jeu : une table par jeu. */
export const BOARD_TABLES = {
  draughts: { level: 0, x: 17.75, z: 6.75 },
  'guardian-connect': { level: 0, x: 19, z: 7.45 },
  'imperial-chess': { level: 0, x: 17.75, z: 8.4 },
}
