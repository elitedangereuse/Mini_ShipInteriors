// Plans des trois ponts (cf. ShipMap) : partagés par le client, qui les construit, et par le
// relais, qui vérifie qu'un joueur voit et atteint ce qu'il utilise (cf. sight.js).
// Une lettre par tuile (colonne = x, ligne = z), une lettre par pièce, '+' pour une porte.

import { wingDoors } from './cabin-wings.js'
import { PLOT_DOOR } from './housing-plot.js'
import { mezzanineRails, parseMezzanine } from './mezzanine.js'
import { ShipMap } from './ship-map.js'

export const SHIP_LAYOUTS = {
  // Cale : entraînement et opérations. À la poupe, la salle des machines, derrière l'atelier, et
  // cachée derrière elle, le sanctuaire de la Voie. Au milieu, le hall de la cale ('p'), où arrive
  // le téléporteur (cf. TELEPORTERS) : une seule grande pièce depuis que la cloison de l'ancienne
  // soute est tombée (ses caisses sont rangées dans le coin sud-est), qui file jusqu'au hangar du
  // Krait, collé à lui et ouvert sur l'espace à la proue. Chez Jacques, le bar clandestin, ne
  // s'ouvre que depuis le fond du hall, et aux seuls habitués (cf. BAR_ROOM) ; une porte de service
  // donne sur la salle des machines (cf. REFINERY_DOOR). Le hall dessert deux lobbys, côte à côte
  // au nord, chacun derrière sa porte double : celui de la zone thargoïde (SOC-06, 'h', cf.
  // THARGOID_DOORS), une pièce fermée d'où partent les missions : la salle de briefing, l'alcôve de
  // la porte blindée et, derrière ses vitres, le poste de sécurité de la zone ('t', verrouillé) ; à
  // côté, à l'ouest, au même niveau, celui de l'arène ('y', 3 × 4, cf. ARENA_DOORS), derrière une
  // cloison vitrée. Le hall s'étend jusqu'à la raffinerie, d'un seul tenant : la porte du bar
  // s'ouvre dans son mur sud, au bord est (cf. BAR_DOORS), et le plan du vaisseau est au mur ouest.
  // Le bar a une seconde porte, au sud, sur le hall d'entraînement. Au-dessus de la salle des
  // machines, au bout d'un couloir de service qui part du palier, le Zorb, la boîte de nuit des
  // aliens ('n', cf. CLUB_ROOM). Au nord du palier, à la place de l'ancienne baie de réparation, le
  // stand de tir ('r', cf. SHOOTING_RANGE). Entre l'atelier et la descente de ce couloir, au-dessus
  // du palier, le placard à balais ('c', 2 × 2), dont la porte donne sur le couloir (cf. CLOSET_DOOR).
  // Au sud du hall, par une porte de service (cf. SCAVENGERS_DOOR), une gaine technique d'une
  // tuile de large ('w') file vers l'est jusqu'au local du ventilateur ; de là, on entre dans la
  // planque des Scavengers ('s'), où l'on joue au jeu du même nom. Passé le ventilateur, la gaine
  // continue de deux tuiles jusqu'au poste d'exploration ('i'), sous le hangar : la pièce
  // d'It's Dangerous Out There, l'autre jeu qu'on lance depuis la cale. La planque et le poste ont
  // repris les recoins vides qui les séparaient de leurs voisins ; le palier du monte-charge aussi,
  // devenu le quai de fret de la cale, et le Vestiaire des Légendes, qui gagne une rangée au nord.
  // Du coin sud-ouest du hall, une allée de deux tuiles descend, par une porte double, au complexe
  // d'entraînement : le hall d'entraînement ('z'), qui longe le bar, et derrière ses cloisons
  // vitrées, le terrain de foot ('f'), celui de basket ('o', cf. SPORT_COURTS) et la salle de sport
  // ('x', cf. GYM_ROOM). Entre la Voie et le bar, le Vestiaire des Légendes ('l'), qui s'ouvre par
  // une porte double sur le hall d'entraînement.
  '-1': [
    'nnnnuuu     rrrrryyyttthhhkkkkkkkkkkkk  ',
    'nnn+uuuuuuu rrrrryyyttthhhkkkkkkkkkkkk  ',
    'nnnnaaaaccu rrrrryyyhhhhhhkkkkkkkkkkkk  ',
    'eeeeaaaacc+ rrrrryyyhhhhhhkkkkkkkkkkkk  ',
    'eeeeaaaajjjj+rr+rppppppppp+kkkkkkkkkkk  ',
    'eee+aaaa+jjjmmmmmppppppppp+kkkkkkkkkkk  ',
    'eeeeaaaajjjj+mmmmpppppppppkkkkkkkkkkkk  ',
    'eeeeaaaajjjjmmmmmpppppppppkkkkkkkkkkkk  ',
    'vv+vvlllljjjmmmmmpppppppppkkkkkkkkkkkk  ',
    'vvvvvllllbbbbbbbbbbpppppppkkkkkkkkkkkk  ',
    'vvvvvllllbbbbbbbbbbpppppppkkkkkkkkkkkk  ',
    'vvvvvllllbbbbbbbbbbppwwwwwwwwwww+iiiii  ',
    'vvvvvllllbbbbbbbbbbppssssssswwiiiiiiii  ',
    '     llllbbbbbbbbbbppssssss+wwiiiiiiii  ',
    '  zzzz++zzzzzzzzzzz+zssssssswwiiiiiiii  ',
    '  zzz+zzzzzz+zzzzz+zzssssssswwiiiiiiii  ',
    '  fffffffoooooooxxxxx                   ',
    '  fffffffoooooooxxxxx                   ',
    '  fffffffoooooooxxxxx                   ',
    '  fffffffoooooooxxxxx                   ',
    '  fffffffooooooo                        ',
    '  fffffffooooooo                        ',
  ],
  // Pont principal : le cœur communautaire. À la poupe, la salle commune, le hall d'accueil du
  // vaisseau, où arrive le téléporteur (cf. TELEPORTERS), avec sa mezzanine (cf. MEZZANINES) et,
  // au nord, côte à côte, deux boutiques carrées (3 × 3) à vitrine : celle du Weekly ('w') et celle
  // de la Chasse galactique ('h'), chacune derrière sa porte (cf. OFFICE_DOORS). La coursive file vers le poste de pilotage et ses verrières, à la proue, et s'ouvre
  // juste avant sur la Promenade, un atrium vitré autour de la maquette du Cobra. Au nord, le labo
  // du LJPC et les toilettes ('d', cf. TOILET_ROOM dans vents.js) ; au sud, la grande salle
  // d'arcade (deux portes) et le mess, un self dont la cuisine occupe le fond. Au nord, contre la
  // salle commune, l'infirmerie de Betty. Sous la Promenade (au sud, par une porte de service dans
  // sa verrière), le poste de surveillance du sergent ('v', cf. SURVEILLANCE_ROOM) : fermé tant
  // que sa quête n'est pas terminée (cf. quests.js). Dans le coin sud-ouest de la salle d'arcade, à
  // côté du tableau des scores, une porte (cf. PIXEL_WAR_DOORS) donne sur un couloir de deux tuiles
  // ('x') qui descend vers la salle de la Pixel War ('p', 5 × 3), entre la cuisine du mess et le
  // poste de surveillance.
  '0': [
    '  ewwwhhhqqqqqqqdddddlllll ccc          ',
    ' eewwwhhhqqqqqqqdddddlllllccccc bbb     ',
    'eeewwwhhhqqqqqqqdddddlllllccccc bbbbb   ',
    'eeeeeeeeeqqqq+qqdd+ddll+llccccc bbbbbbb ',
    'eeeeeeee+cccccccccccccccccccccc+bbbbbbb ',
    'eeeeeeee+cccccccccccccccccccccc+bbbbbbb ',
    'eeeeeeeeemmmm+mmss+ssss+ssccccc bbbbbbb ',
    'eeeeeeeeemmmmmmmssssssssssccccc bbbbb   ',
    'eeeeeeeeemmmmmmmssssssssssccccc bbb     ',
    'eeeeeeeeemmmmmmmssssssssss ccc          ',
    'eeeeeeeeemmmmmmmx          +            ',
    'eeeeeeeeemmmmmmmx       vvvvvvv         ',
    'eeeeeeeeemmmmmmmppppp   vvvvvvv         ',
    'eeeeeeeee       ppppp   vvvvvvv         ',
    ' eeeeeee        ppppp   vvvvvvv         ',
  ],
  // Pont supérieur : culture et détente. À l'ouest, la grande serre de Capucine, sous verrière, aux
  // coins cassés : au nord, la serre hydroponique, face à la coursive ; au sud, sans mur entre les
  // deux, le jardin exotique et son étang (cf. GARDEN_SOUTH dans gardener.js), le long du
  // planétarium. Au nord de la coursive, la salle de classe, puis le studio de Radio Dangereuse,
  // derrière la vitre du salon d'écoute ('o', 5 × 5). Au sud de la coursive, à la place des
  // anciens quartiers, le planétarium de Bugenhagen ('p', 6 × 8, cf. PLANETARIUM_ROOM). La coursive
  // longe son flanc est et devient la galerie, où arrive le téléporteur (cf. TELEPORTERS) : le
  // salon d'écoute et le foyer du cinéma ('h', porte double vers la galerie, cf. FOYER_DOORS) y
  // donnent au nord, la grande bibliothèque du lore ('l', 14 × 6, cf. LIBRARY_ROOM) au sud, par
  // une porte double, et, au bout, une autre porte double ouvre sur le Comptoir des Cartes
  // Dangereuses ('x', 8 × 10, cf. CARD_ROOM) : la boutique de boosters, les tables de collection
  // et celles de Galactic Clash, devant une baie vitrée.
  '1': [
    '                                       ',
    '  ggggggkkkkkkkkssss   nnnnnnn         ',
    ' gggggggkkkkkkkkssss   nnnnnnn         ',
    'ggggggggk+kkkkkksss+ hhnnnnnnn         ',
    'ggggggggcccccccc+ooooh+nnnnnnn         ',
    'gggggggg+cccccccoooo+h+nnnnnnn xxxxxxxx',
    'ggggggggppp+ppccooooohhnnnnnnn xxxxxxxx',
    'ggggggggppppppccooooohhnnnnnnn xxxxxxxx',
    'ggggggggppppppccoo+oohhnnnnnnn xxxxxxxx',
    'ggggggggppppppcccccccccccccccc+xxxxxxxx',
    'ggggggggppppppcccccccccccccccc+xxxxxxxx',
    'ggggggggpppppp  llllll++llllll xxxxxxxx',
    'ggggggggpppppp  llllllllllllll xxxxxxxx',
    ' gggggggpppppp  llllllllllllll xxxxxxxx',
    '  gggggg        llllllllllllll xxxxxxxx',
    '                llllllllllllll         ',
    '                llllllllllllll         ',
  ],
  // Pont des quartiers (housing v2) : l'antichambre, où arrive le téléporteur, seule. La parcelle
  // de chacun s'y accole à l'est, derrière la porte de l'antichambre, et se construit à la volée
  // (cf. housing-plot.js) : la porte et la parcelle ne bougent pas, les maisons enregistrées non
  // plus, et l'antichambre ne touche la parcelle que sur les cinq tuiles de l'ancien palier.
  '2': [
    '            ',
    '            ',
    '       aaaa ',
    '      aaaaaa',
    '      aaaaaa',
    '      aaaaaa',
    '      aaaaaa',
    '      aaaaaa',
    '       aaaa ',
    '            ',
  ],
}

/**
 * Le téléporteur de chaque pont (tuile) : il dépose au cœur du pont, sur un palier au même dessin.
 * Ce n'est pas un puits : d'un pont à l'autre, l'arrivée n'est pas à la même place. Celle des
 * quartiers reste à l'ouest de la parcelle, dont les maisons sont enregistrées en coordonnées absolues.
 */
export const TELEPORTERS = {
  '-1': { x: 22, z: 7 },
  '0': { x: 4, z: 10 },
  '1': { x: 16, z: 10 },
  '2': { x: 8, z: 5 },
}

/** Le téléporteur du pont `level` ; celui du pont principal à défaut. */
export const teleporterOf = (level) => TELEPORTERS[String(level)] ?? TELEPORTERS['0']

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
 * Au pont principal, celle de la salle commune : à la poupe, sous les grandes baies vitrées, trois
 * tuiles de profondeur, de la boutique du Weekly, au nord, jusqu'à trois tuiles du bout de la
 * salle : dessous, le coin de l'aquarium. Sa façade file droite tout du long ; en son milieu, dans l'axe de l'îlot du hall, un palier
 * s'enfonce dans la mezzanine, et deux volées symétriques en partent, l'une vers le nord, l'autre
 * vers le sud, encastrées derrière le garde-corps.
 */
export const MEZZANINES = {
  '0': {
    room: 'e',
    height: 0.8,
    plan: [
      '  M',
      ' MM',
      'MMM',
      'MMM',
      'MMM',
      'MM^',
      'MM^',
      'MM ',
      'MMv',
      'MMv',
      'MMM',
      'MMM',
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
 * sécurité ; au pont des quartiers, la porte de l'antichambre vers la parcelle (cf. applyPlot) ;
 * au pont principal, les garde-corps de la mezzanine et les portes du couloir de la Pixel War ; au
 * pont supérieur, la porte double du foyer du cinéma vers la galerie.
 */
export function shipMapOptions(level) {
  const id = String(level)
  const doors = id === '-1' ? [SECURITY_DOOR, SCAVENGERS_DOOR, CLOSET_DOOR, REFINERY_DOOR, ...BAR_DOORS, TRAINING_DOOR, ...THARGOID_DOORS, ...ARENA_DOORS] : id === '0' ? [...PIXEL_WAR_DOORS, ...OFFICE_DOORS] : id === '1' ? FOYER_DOORS : id === '2' ? [PLOT_DOOR] : []
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
 * La porte de service du hall de la cale, dans son mur sud : elle donne sur la gaine technique qui
 * mène à la planque des Scavengers. Posée sur le bord nord de la première tuile de la gaine.
 */
export const SCAVENGERS_DOOR = { x: 22, z: 11, dir: 0 }

/**
 * La porte double du lobby de la zone thargoïde (cale), dans son mur sud : elle donne sur le hall,
 * juste en face de celle du lobby de l'arène.
 */
export const THARGOID_DOORS = [{ x: 23, z: 4, dir: 0 }, { x: 24, z: 4, dir: 0 }]

/**
 * La porte double du lobby de l'arène (cale), dans sa cloison vitrée, au sud : elle donne sur le
 * hall de la cale, à côté de celle du lobby de la zone thargoïde. Posée sur le bord nord des tuiles du hall.
 */
export const ARENA_DOORS = [{ x: 18, z: 4, dir: 0 }, { x: 19, z: 4, dir: 0 }]

/**
 * Les deux portes de Chez Jacques (cale) : celle du hall, au bord est de son mur sud (posée sur le
 * bord sud de la tuile du hall), et celle du fond du bar, sur le hall d'entraînement (posée sur le
 * bord sud de la tuile du bar ; pas en x 18, où coulisse un battant de la porte double de l'allée).
 */
export const BAR_DOORS = [{ x: 18, z: 8, dir: 2 }, { x: 17, z: 13, dir: 2 }]

/**
 * Le battant est de la porte double de l'allée du complexe d'entraînement (cale), sur le bord nord
 * de sa tuile : posé à la main, la planque des Scavengers étant sa voisine à l'est.
 */
export const TRAINING_DOOR = { x: 20, z: 14, dir: 0 }

/** La porte de la raffinerie (cale) sur le hall, dans le mur ouest de son aile : posée sur le bord ouest de la tuile du hall. */
export const REFINERY_DOOR = { x: 17, z: 7, dir: 3 }

/** La porte du placard à balais de la cale, dans son mur est : elle donne sur le couloir de service du Zorb. */
export const CLOSET_DOOR = { x: 9, z: 2, dir: 1 }

/**
 * Les deux portes du couloir de la Pixel War (pont principal), chacune sur le bord nord de sa
 * tuile : celle du salon d'arcade, dans son mur sud, et celle de la salle, au bout du couloir.
 */
export const PIXEL_WAR_DOORS = [{ x: 16, z: 10, dir: 0 }, { x: 16, z: 12, dir: 0 }]

/**
 * Les portes des deux boutiques vitrées du hall d'accueil (pont principal), au fond de la salle
 * commune : chacune au milieu de sa vitrine, sur le bord sud de sa tuile.
 */
export const OFFICE_DOORS = [{ x: 4, z: 2, dir: 2 }, { x: 7, z: 2, dir: 2 }]

/** La porte double du foyer du cinéma (pont supérieur), dans son mur sud : elle donne sur la galerie. */
export const FOYER_DOORS = [{ x: 21, z: 8, dir: 2 }, { x: 22, z: 8, dir: 2 }]

/**
 * Terrains du complexe d'entraînement (cale), par jeu : la pièce, la marque d'où l'on tire, le mur
 * visé (à l'ouest : x de sa face) et le milieu de la cible le long de ce mur (cf. src/court.ts).
 */
export const SPORT_COURTS = {
  'gym-basket': { level: -1, room: 'o', spot: { x: 13.4, z: 18.5 }, wall: 8.65, center: 18.5 },
  'gym-foot': { level: -1, room: 'f', spot: { x: 6.6, z: 18.5 }, wall: 1.65, center: 18.5 },
}

/** La salle de sport du complexe d'entraînement (cale) : boxe, course, vélo et musculation (cf. src/gym.ts). */
export const GYM_ROOM = { level: -1, room: 'x' }

/**
 * La grande bibliothèque du lore (pont supérieur), au sud de la galerie : la lettre de sa pièce et
 * les faces intérieures de ses murs. Ses livres ouvrent les pages du Lore Explorer.
 */
export const LIBRARY_ROOM = { level: 1, room: 'l', minX: 15.65, maxX: 29.35, minZ: 10.65, maxZ: 16.35 }

/**
 * Le Comptoir des Cartes Dangereuses (pont supérieur), au bout de la galerie : la
 * lettre de sa pièce, les faces intérieures de ses murs, et son comptoir, où l'on achète et ouvre
 * ses boosters (cf. src/cards/).
 */
export const CARD_ROOM = { level: 1, room: 'x', minX: 30.65, maxX: 38.35, minZ: 4.65, maxZ: 14.35, counter: { x: 34.5, z: 5.6 } }

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
