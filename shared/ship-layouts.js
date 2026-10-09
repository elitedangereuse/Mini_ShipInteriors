// Plans des trois ponts (cf. ShipMap) : partagés par le client, qui les construit, et par le
// relais, qui vérifie qu'un joueur voit et atteint ce qu'il utilise (cf. sight.js).
// Une lettre par tuile (colonne = x, ligne = z), une lettre par pièce, '+' pour une porte.

import { wingDoors } from './cabin-wings.js'
import { PLOT_DOOR } from './housing-plot.js'
import { mezzanineRails, parseMezzanine } from './mezzanine.js'
import { ShipMap } from './ship-map.js'

export const SHIP_LAYOUTS = {
  // Cale ; à la poupe, la salle des machines, derrière l'atelier, et cachée derrière elle, le
  // sanctuaire de la Voie. Chez Jacques, le bar clandestin, ne s'ouvre que depuis le fond de la soute, et
  // aux seuls habitués (cf. BAR_ROOM). À
  // l'est de la soute, le lobby de la zone thargoïde (SOC-06), d'où partent les missions : au nord,
  // l'alcôve de la porte blindée et, derrière ses vitres, le poste de sécurité de la zone ('t',
  // verrouillé) ; au sud, le vestiaire et la table de briefing. Collé à lui, le hangar du Krait,
  // ouvert sur l'espace à la proue. Au-dessus de la salle des machines, au bout d'un couloir de
  // service qui part du palier, le Zorb, la boîte de nuit des aliens ('n', cf. CLUB_ROOM). Au nord
  // du palier, à la place de l'ancienne baie de réparation, le stand de tir ('r', cf. SHOOTING_RANGE).
  // Au sud du lobby, par une porte de service (cf. SCAVENGERS_DOOR), une gaine technique d'une
  // tuile de large ('w') file vers l'est jusqu'au local du ventilateur ; de là, on entre dans la
  // planque des Scavengers ('s'), où l'on joue au jeu du même nom. Passé le ventilateur, la gaine
  // continue de deux tuiles jusqu'au poste d'exploration ('i'), sous le hangar : la pièce
  // d'It's Dangerous Out There, l'autre jeu qu'on lance depuis la cale.
  '-1': [
    'nnnnuuu     rrrrr   ttthhhkkkkkkkkkkkk  ',
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
    'vvvvv    bbbbbbbbbb  wwwwwwwwwww+iiiii  ',
    'vvvvv    bbbbbbbbbb   ssssssww  iiiiii  ',
    '         bbbbbbbbbb   sssss+ww  iiiiii  ',
    '                      ssssssww  iiiiii  ',
    '                      ssssssww  iiiiii  ',
  ],
  // Pont principal. À la poupe, la salle commune, le hall du vaisseau, avec sa mezzanine (cf.
  // MEZZANINES) ; la coursive file vers le poste de pilotage et ses
  // verrières, à la proue, et s'ouvre juste avant sur la Promenade, un atrium vitré autour de la
  // maquette du Cobra. Au nord, le labo du LJPC ; au sud, la grande salle d'arcade (deux portes) et
  // le mess, un self dont la cuisine occupe le fond. Au nord, contre la salle commune, l'infirmerie
  // de Betty. Sous la Promenade (au sud, par une porte de service dans sa verrière), le poste de
  // surveillance du sergent ('v', cf. SURVEILLANCE_ROOM) : fermé tant que sa quête n'est pas
  // terminée (cf. quests.js). Dans le coin sud-ouest de la salle d'arcade, à côté du tableau des
  // scores, une porte (cf. PIXEL_WAR_DOORS) donne sur un couloir de deux tuiles ('x') qui descend
  // vers la salle de la Pixel War ('p', 5 × 3), entre la cuisine du mess et le poste de surveillance.
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
    '         mmmmmmmx          +            ',
    '         mmmmmmmx       vvvvvvv         ',
    '         mmmmmmmppppp   vvvvvvv         ',
    '                ppppp   vvvvvvv         ',
    '                ppppp   vvvvvvv         ',
  ],
  // Pont supérieur : les quartiers ; derrière le salon d'écoute, le cinéma. Au nord du salon,
  // derrière une vitre, le studio de Radio Dangereuse (porte à l'est). À l'ouest, la grande serre
  // de Capucine, sous verrière, aux coins cassés : au nord, la serre hydroponique, face à la
  // coursive ; au sud, sans mur entre les deux, le jardin exotique et son étang (cf. GARDEN_SOUTH
  // dans gardener.js), le long du planétarium.
  // Entre les cabines d'équipage et le studio, les toilettes ('d') : trois cabines contre le mur nord.
  // Au sud de la coursive, à la place des anciens quartiers, le planétarium de Bugenhagen ('p',
  // 8 × 8, cf. PLANETARIUM_ROOM). Après le salon d'écoute, le foyer ('h') : un couloir qui donne à
  // l'est sur le cinéma, par une porte double, et file au sud jusqu'au hall de la zone sportive,
  // d'où l'on entre sur le terrain de basket ('b') et sur celui de foot ('f'), cf. SPORT_COURTS.
  '1': [
    '                               ',
    '  ggggggkkkkkdddssss   nnnnnnn ',
    ' gggggggkkkkkdddssss   nnnnnnn ',
    'ggggggggk+kkkd+dsss+ hhnnnnnnn ',
    'ggggggggcccccccc+ooo h+nnnnnnn ',
    'gggggggg+cccccccoooo+h+nnnnnnn ',
    'ggggggggppp+ppppoooo hhnnnnnnn ',
    'ggggggggpppppppp oo  hhnnnnnnn ',
    'ggggggggpppppppp     hhnnnnnnn ',
    'ggggggggpppppppp  hhhhhhhhhh   ',
    'ggggggggppppppppbbb+bbbfff+fff ',
    'ggggggggppppppppbbbbbbbfffffff ',
    'ggggggggppppppppbbbbbbbfffffff ',
    ' gggggggppppppppbbbbbbbfffffff ',
    '  gggggg        bbbbbbbfffffff ',
    '                bbbbbbbfffffff ',
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
 * qu'un ancien plan se migre toujours de la même façon : le pont, lui, a changé depuis (la serre
 * déborde sur l'espace de l'extension de gauche, et file au sud le long du planétarium).
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
  // Le sanctuaire de la Voie, le Zorb et Chez Jacques ne sont pas en travaux : leur porte ne
  // s'ouvre qu'à certains.
  '-1': 'vnb',
}

/**
 * Le Zorb, la boîte de nuit de la cale : son videur ne laisse entrer que les aliens (l'apparence
 * portée, cf. isAlienLook). Sa porte est verrouillée pour tous les autres.
 */
export const CLUB_ROOM = 'n'

/**
 * Chez Jacques, le bar clandestin de la cale : sa porte ne s'ouvre qu'aux habitués, ceux qui y sont
 * déjà entrés par les conduits de ventilation (cf. vents.js).
 */
export const BAR_ROOM = 'b'

/** Apparence d'alien (identifiant du Holo-Me, ex. « alien.male.c.blue », cf. src/looks.ts). */
export const isAlienLook = (skin) => typeof skin === 'string' && skin.startsWith('alien.')

/**
 * Le poste de surveillance du pont principal, sous la Promenade : la lettre de sa pièce, et le
 * pupitre d'où l'on regarde les caméras du bord (cf. src/cctv.ts).
 */
export const SURVEILLANCE_ROOM = { level: 0, room: 'v', desk: { x: 27, z: 12.3 } }

/** Le planétarium de Bugenhagen, au pont supérieur, à la place des anciens quartiers (lettre de sa pièce). */
export const PLANETARIUM_ROOM = 'p'

/**
 * Mezzanines des ponts (cf. shared/mezzanine.js) : un étage dans une pièce, par pont.
 * Au pont principal, celle de la salle commune : à la poupe, sous les grandes baies vitrées,
 * trois tuiles de profondeur. On y monte par deux volées qui partent du pied de sa façade, dans
 * l'axe des portes du hall, et débouchent chacune sur un palier, au nord et au sud.
 */
export const MEZZANINES = {
  '0': {
    room: 'e',
    height: 0.8,
    plan: [
      '  MM',
      ' MMM',
      'MMM^',
      'MMM^',
      'MMM ',
      'MMM ',
      'MMMv',
      'MMMv',
      ' MMM',
      '  MM',
    ],
  },
}

/** Mezzanine du pont `level` (lue une fois), ou null. */
const parsed = new Map()
export function mezzanineOf(level) {
  const id = String(level)
  if (!MEZZANINES[id]) return null
  if (!parsed.has(id)) parsed.set(id, { ...MEZZANINES[id], ...parseMezzanine(MEZZANINES[id]) })
  return parsed.get(id)
}

/** Garde-corps de la mezzanine d'un pont : des murs à l'intérieur de sa pièce (cf. ShipMap). */
function mezzanineWalls(level) {
  const mezz = mezzanineOf(level)
  if (!mezz) return []
  const map = new ShipMap(SHIP_LAYOUTS[String(level)])
  return mezzanineRails(mezz, (x, z) => map.room(x, z) === mezz.room)
}

/**
 * Plan d'un pont : portes des pièces en travaux verrouillées ; dans la cale, celle du poste de
 * sécurité ; au pont des quartiers, la porte du palier vers la parcelle (cf. applyPlot) ; au
 * pont principal, les garde-corps de la mezzanine et les portes du couloir de la Pixel War.
 */
export function shipMapOptions(level) {
  const id = String(level)
  const doors = id === '-1' ? [SECURITY_DOOR, SCAVENGERS_DOOR] : id === '0' ? PIXEL_WAR_DOORS : id === '2' ? [PLOT_DOOR] : []
  return { closed: CLOSED_ROOMS[level] ?? '', doors, walls: mezzanineWalls(id) }
}

/**
 * Plan du pont supérieur du temps des anciens quartiers (cf. LEGACY_UPPER_LAYOUT) : les portes des
 * trois espaces d'extension, verrouillées tant qu'aucune pièce n'y est posée (cf. applyWings).
 */
export function legacyUpperMapOptions() {
  return { closed: '', doors: wingDoors().map((d) => ({ ...d, locked: true })) }
}

/** La porte du poste de sécurité du lobby (cale), côté alcôve : toujours verrouillée. */
export const SECURITY_DOOR = { x: 22, z: 0, dir: 1, locked: true }

/**
 * La porte de service du lobby (cale), dans son mur sud : elle donne sur la gaine technique qui
 * mène à la planque des Scavengers. Posée sur le bord nord de la première tuile de la gaine.
 */
export const SCAVENGERS_DOOR = { x: 22, z: 11, dir: 0 }

/**
 * Les deux portes du couloir de la Pixel War (pont principal), chacune sur le bord nord de sa
 * tuile : celle du salon d'arcade, dans son mur sud, et celle de la salle, au bout du couloir.
 */
export const PIXEL_WAR_DOORS = [{ x: 16, z: 10, dir: 0 }, { x: 16, z: 12, dir: 0 }]

/**
 * Terrains de la zone sportive (pont supérieur), par jeu : la pièce, la marque d'où l'on tire, le
 * mur visé (à l'ouest : x de sa face) et le milieu de la cible le long de ce mur (cf. src/court.ts).
 */
export const SPORT_COURTS = {
  'gym-basket': { level: 1, room: 'b', spot: { x: 20.4, z: 12.5 }, wall: 15.65, center: 12.5 },
  'gym-foot': { level: 1, room: 'f', spot: { x: 27.6, z: 12.5 }, wall: 22.65, center: 12.5 },
}

/**
 * Stand de tir de la cale (cf. src/range.ts) : la pièce, les faces intérieures de ses murs, et le
 * pas de tir, un comptoir qui la traverse d'est en ouest (son axe : `line`). On tire vers le nord ;
 * les cibles sortent entre le comptoir et le mur du fond.
 */
export const SHOOTING_RANGE = { level: -1, room: 'r', minX: 11.65, maxX: 16.35, minZ: -0.35, maxZ: 4.35, line: 2.3 }

/** Tables de jeux de plateau (pont principal), par jeu : une table par jeu. */
export const BOARD_TABLES = {
  draughts: { level: 0, x: 21.9, z: 7.6 },
  'guardian-connect': { level: 0, x: 23.3, z: 7.6 },
  'imperial-chess': { level: 0, x: 24.7, z: 7.6 },
}
