// Plans des trois ponts (cf. ShipMap) : partagés par le client, qui les construit, et par le
// relais, qui vérifie qu'un joueur voit et atteint ce qu'il utilise (cf. sight.js).
// Une lettre par tuile (colonne = x, ligne = z), une lettre par pièce, '+' pour une porte.

import { wingDoors } from './cabin-wings.js'
import { PLOT_DOOR } from './housing-plot.js'

export const SHIP_LAYOUTS = {
  // Cale ; à la poupe, la salle des machines, derrière l'atelier, et cachée derrière elle, le
  // sanctuaire de la Voie. Chez Jacques, le bar clandestin, ne s'ouvre que depuis le fond de la soute. À
  // l'est de la soute, le lobby de la zone thargoïde (SOC-06), d'où partent les missions : au nord,
  // l'alcôve de la porte blindée et, derrière ses vitres, le poste de sécurité de la zone ('t',
  // verrouillé) ; au sud, le vestiaire et la table de briefing. Collé à lui, le hangar du Krait,
  // ouvert sur l'espace à la proue. Au-dessus de la salle des machines, au bout d'un couloir de
  // service qui part du palier, le Zorb, la boîte de nuit des aliens ('n', cf. CLUB_ROOM).
  '-1': [
    'nnnnuuu             ttthhhkkkkkkkkkkkk  ',
    'nnn+uuuuuuu rrrrr   ttthhhkkkkkkkkkkkk  ',
    'nnnnaaaa  u rrrrrgg hhhhhhkkkkkkkkkkkk  ',
    'eeeeaaaa  + rrrrr+g hhhhhhkkkkkkkkkkkk  ',
    'eeeeaaaa jjj+rr+rgg hhhhhh+kkkkkkkkkkk  ',
    'eee+aaaa+jjjmmmmmgg+hhhhhh+kkkkkkkkkkk  ',
    'eeeeaaaa jjj+mmmm+g hhhhhhkkkkkkkkkkkk  ',
    'eeeeaaaa    mmmmmgg hhhhhhkkkkkkkkkkkk  ',
    'vv+vv       mmmmm+  hhhhhhkkkkkkkkkkkk  ',
    'vvvvv    bbbbbbbbbb hhhhhhkkkkkkkkkkkk  ',
    'vvvvv    bbbbbbbbbb hhhhhhkkkkkkkkkkkk  ',
    'vvvvv    bbbbbbbbbb                     ',
    'vvvvv    bbbbbbbbbb                     ',
    '         bbbbbbbbbb                     ',
    '                                        ',
  ],
  // Pont principal. À la poupe, la salle commune ; la coursive file vers le poste de pilotage et ses
  // verrières, à la proue, et s'ouvre juste avant sur la Promenade, un atrium vitré autour de la
  // maquette du Cobra. Au nord, le labo du LJPC ; au sud, la grande salle d'arcade (deux portes) et
  // le mess, un self dont la cuisine occupe le fond. Au nord, contre la salle commune, l'infirmerie
  // de Betty.
  '0': [
    '  eeeeee qqqqqqqrrrrrlllll ccc          ',
    ' eeeeeeeeqqqqqqqrrrrrlllllccccc bbb     ',
    'eeeeeeeeeqqqqqqqrrrrrlllllccccc bbbbb   ',
    'eeeeeeeeeqqqq+qqrr+rrll+llccccc bbbbbbb ',
    'eeeeeeee+cccccccccccccccccccccc+bbbbbbb ',
    'eeeeeeee+cccccccccccccccccccccc+bbbbbbb ',
    'eeeeeeeeemmmm+mmss+ssss+ssccccc bbbbbbb ',
    'eeeeeeeeemmmmmmmssssssssssccccc bbbbb   ',
    ' eeeeeeeemmmmmmmssssssssssccccc bbb     ',
    '  eeeeee mmmmmmmssssssssss ccc          ',
    '         mmmmmmm                        ',
    '         mmmmmmm                        ',
    '         mmmmmmm                        ',
  ],
  // Pont supérieur : les quartiers ; derrière le salon d'écoute, le cinéma. Au nord du salon,
  // derrière une vitre, le studio de Radio Dangereuse (porte à l'est). À l'ouest, la grande serre
  // hydroponique de Capucine, sous verrière, aux coins cassés, centrée sur la coursive.
  // Entre les cabines d'équipage et le studio, les toilettes ('d') : trois cabines contre le mur nord.
  '1': [
    '                             ',
    '  ggggggkkkkkdddssss nnnnnnn ',
    ' gggggggkkkkkdddssss nnnnnnn ',
    'ggggggggk+kkkd+dsss+ nnnnnnn ',
    'ggggggggcccccccc+ooo nnnnnnn ',
    'gggggggg+cccccccoooo+nnnnnnn ',
    'ggggggggppp+ppppoooo nnnnnnn ',
    ' gggggggpppppppp oo  nnnnnnn ',
    '  ggggggpppppppp     nnnnnnn ',
    '        pppppppp             ',
    '        pppppppp             ',
  ],
  // Pont des quartiers (housing v2) : le palier de l'ascenseur, seul. La parcelle de chacun s'y
  // accole à l'est, derrière la porte du palier, et se construit à la volée (cf. housing-plot.js).
  '2': [
    '            ',
    '            ',
    '            ',
    '        aaaa',
    '        aaaa',
    '        aaaa',
    '        aaaa',
    '        aaaa',
  ],
}

/**
 * Le pont supérieur du temps des anciens quartiers (format 1) : la migration vers la parcelle y
 * pose encore leurs pièces, leurs extensions et leurs cloisons (cf. housing-migrate.js). Figé, pour
 * qu'un ancien plan se migre toujours de la même façon : le pont, lui, a changé depuis (la serre,
 * centrée sur la coursive, déborde sur l'espace de l'extension de gauche).
 */
export const LEGACY_UPPER_LAYOUT = [
  '  gggggg                     ',
  ' gggggggkkkkddddssss nnnnnnn ',
  'ggggggggkkkkddddssss nnnnnnn ',
  'ggggggggk+kkdd+dsss+ nnnnnnn ',
  'gggggggg+ccccccc+ooo nnnnnnn ',
  'ggggggggccccccccoooo+nnnnnnn ',
  ' gggggggppp+ppppoooo nnnnnnn ',
  '        pppppppp oo  nnnnnnn ',
  '        pppppppp     nnnnnnn ',
  '        pppppppp             ',
  '        pppppppp             ',
]

/**
 * Pièces en travaux de chaque pont : on les voit, meublées de caisses et d'échafaudages, mais
 * leurs portes restent verrouillées (cf. ShipMap).
 */
export const CLOSED_ROOMS = {
  // Le sanctuaire de la Voie et le Zorb ne sont pas en travaux : leur porte ne s'ouvre qu'à certains.
  '-1': 'vn',
}

/**
 * Le Zorb, la boîte de nuit de la cale : son videur ne laisse entrer que les aliens (l'apparence
 * portée, cf. isAlienLook). Sa porte est verrouillée pour tous les autres.
 */
export const CLUB_ROOM = 'n'

/** Apparence d'alien (identifiant du Holo-Me, ex. « alien.male.c.blue », cf. src/looks.ts). */
export const isAlienLook = (skin) => typeof skin === 'string' && skin.startsWith('alien.')

/**
 * Plan d'un pont : portes des pièces en travaux verrouillées ; au pont supérieur, les portes des
 * trois espaces d'extension des quartiers (verrouillées tant qu'aucune pièce n'y est posée, cf.
 * applyWings) ; au pont des quartiers, la porte du palier vers la parcelle (cf. applyPlot).
 */
export function shipMapOptions(level) {
  const id = String(level)
  const doors = id === '1' ? wingDoors().map((d) => ({ ...d, locked: true })) : id === '-1' ? [SECURITY_DOOR] : id === '2' ? [PLOT_DOOR] : []
  return { closed: CLOSED_ROOMS[level] ?? '', doors }
}

/** La porte du poste de sécurité du lobby (cale), côté alcôve : toujours verrouillée. */
export const SECURITY_DOOR = { x: 22, z: 0, dir: 1, locked: true }

/** Tables de jeux de plateau (pont principal), par jeu : une table par jeu. */
export const BOARD_TABLES = {
  draughts: { level: 0, x: 21.9, z: 7.6 },
  'guardian-connect': { level: 0, x: 23.3, z: 7.6 },
  'imperial-chess': { level: 0, x: 24.7, z: 7.6 },
}
