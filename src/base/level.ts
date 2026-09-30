import * as THREE from 'three'
import { tr } from '../i18n'
import type { LevelDef, LightDef, Prop, Rot } from '../levels'
import { ShipMap } from '../map'
import { BASE_KRAIT, BASE_LADDER, BASE_LAYOUT, BASE_LEVEL } from '../../shared/ground-base.js'
import type { BaseKit, SpaceModel } from './kit'

/*
 * L'avant-poste Bradbury, en pont du jeu (cf. LevelDef, Deck) : un plateau de roche rouge à ciel
 * ouvert, bordé de falaises. À l'est, l'aire d'atterrissage et le Krait (on y remonte par
 * l'escabeau pour repartir) ; au nord, la tour de contrôle, le garage des rovers et la serre ; à
 * l'ouest, les quartiers de la base et la fusée de ravitaillement ; au sud, les machines, la foreuse
 * et le gisement de cristaux. Des pistes relient le tout. Les trajets de la cheffe de base
 * (cf. CHIEF_POSTS dans shared/ground-base.js) passent entre les bâtiments : à revoir si l'un
 * d'eux bouge.
 */

/** Les bâtiments du kit sont des jouets : on les grandit pour y faire tenir un CMDR. */
const S = 1.6

/** Pistes : segments de tuiles [x, z] → [x, z] (en ligne droite). */
const ROADS: [[number, number], [number, number]][] = [
  // La grande piste, de la place à l'aire d'atterrissage.
  [[8, 11], [23, 11]],
  // Le long des bâtiments du nord, de la serre à la tour.
  [[9, 8], [21, 8]],
  // Du nord au sud, par la place.
  [[12, 8], [12, 16]],
  // De la tour vers le sud.
  [[21, 8], [21, 14]],
  // Devant la fusée.
  [[8, 14], [21, 14]],
  // Du garage à la piste du nord.
  [[16, 6], [16, 8]],
]

function roadTiles(): Set<string> {
  const tiles = new Set<string>()
  for (const [[ax, az], [bx, bz]] of ROADS) {
    const n = Math.max(Math.abs(bx - ax), Math.abs(bz - az))
    for (let i = 0; i <= n; i++) tiles.add(`${ax + Math.sign(bx - ax) * i},${az + Math.sign(bz - az) * i}`)
  }
  return tiles
}

export function baseLevel(kit: BaseKit): LevelDef {
  const props: Prop[] = []
  const lights: LightDef[] = []
  /** Un modèle du kit posé sur le plateau (solide par défaut). */
  const put = (name: SpaceModel, x: number, z: number, o: { rot?: Rot; scale?: number; y?: number; solid?: boolean; interact?: string | string[]; action?: string } = {}) => {
    props.push({ model: 'prebuilt', object: kit.model(name, o.scale ?? 1), x, z, rot: o.rot ?? 0, y: o.y, solid: o.solid, interact: o.interact, action: o.action })
  }
  /** Plusieurs modèles empilés ou assemblés, en un seul objet (repère local, puis l'échelle). */
  const assembly = (parts: [SpaceModel, number, number, number, number?][], scale: number): THREE.Object3D => {
    const g = new THREE.Group()
    for (const [name, x, y, z, rot] of parts) {
      const o = kit.model(name)
      o.position.set(x, y, z)
      o.rotation.y = ((rot ?? 0) * Math.PI) / 2
      g.add(o)
    }
    g.scale.setScalar(scale)
    const root = new THREE.Group()
    root.add(g)
    return root
  }

  // --- L'aire d'atterrissage, à l'est : un carré de dalles, un gyrophare à chaque coin, le Krait.
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) put('platform_large', 25 + i * 2, 8 + j * 2, { y: -0.08, solid: false })
  }
  for (const [x, z] of [[24.2, 7.2], [31.8, 7.2], [24.2, 14.8], [31.8, 14.8]]) {
    props.push({ model: 'hangar-beacon', x, z, solid: false })
    lights.push([x, z, '#ff6a3c', 0.7])
  }
  props.push({
    model: 'krait-mk2', x: BASE_KRAIT.x, z: BASE_KRAIT.z, rot: 3, label: 'base', reach: { x: BASE_KRAIT.x, z: BASE_KRAIT.z + 3.6 },
    interact: [
      tr(
        'Le Krait, posé sur l\'aire de l\'avant-poste. De la poussière rouge s\'est déjà glissée dans le train. Nico va adorer.',
        'The Krait, parked on the outpost\'s pad. Red dust has already crept into the landing gear. Nico is going to love that.',
      ),
      tr(
        'La coque craque en refroidissant. Pour rentrer au vaisseau : l\'escabeau, le cockpit, et Espace pour les réacteurs.',
        'The hull creaks as it cools. To fly back to the ship: the ladder, the cockpit, and Space for the thrusters.',
      ),
    ],
  })
  props.push({ model: 'krait-ladder', x: BASE_LADDER.x, z: BASE_LADDER.z, rot: 1 })
  lights.push([BASE_KRAIT.x - 3.2, BASE_KRAIT.z, '#fff1dd', 1.1])

  // --- La tour de contrôle, au coin de l'aire : un bloc fermé, une cage, l'antenne sur le toit.
  props.push({
    model: 'prebuilt',
    object: assembly([['structure_closed', 0, 0, 0], ['structure_detailed', 0, 1, 0], ['platform_center', 0, 1.95, 0]], S),
    x: 21, z: 5,
    action: tr('Examiner', 'Examine'),
    interact: [
      tr('La tour de contrôle de l\'avant-poste. Au sommet, l\'antenne tourne sans fin et cherche les vaisseaux dans le ciel rouge.', 'The outpost\'s control tower. On top, the dish turns endlessly, searching the red sky for ships.'),
      tr('Sur la porte : « Contrôle Bradbury. Si personne ne répond, c\'est qu\'Ada fait sa ronde. »', 'On the door: “Bradbury Control. If nobody answers, Ada is doing her rounds.”'),
    ],
  })
  lights.push([21, 6, '#ff3b2f', 0.9, 'neon'])

  // --- Le garage des rovers : un grand hangar, portes au sud, et un rover garé devant.
  put('hangar_largeA', 16, 3.4, {
    scale: S,
    interact: tr('Le garage des rovers. Dedans, un établi, trois roues de rechange et une odeur de poussière chaude.', 'The rover garage. Inside: a workbench, three spare wheels and a smell of hot dust.'),
  })
  put('rover', 18.6, 6.4, {
    scale: 2.4, rot: 3,
    interact: tr('Un rover de surface, clé sur le contact. Un post-it : « Pas avant d\'avoir fini le tuto. Ada. »', 'A surface rover, key in the ignition. A sticky note: “Not before you\'ve finished the tutorial. Ada.”'),
  })
  put('barrels', 13.6, 6.2, { scale: S })
  put('barrel', 14.3, 6.8, { scale: S })

  // --- La serre hydroponique, sous son dôme vitré.
  put('hangar_roundGlass', 9, 4, {
    scale: S,
    interact: [
      tr('La serre hydroponique. Sous le verre, des rangs de salades pâles et une tomate, une seule, dont toute la base est très fière.', 'The hydroponic greenhouse. Under the glass, rows of pale lettuce and one tomato, just one, which the whole base is very proud of.'),
      tr('La buée sur le dôme dessine des gouttes qui ne tomberont jamais : dehors, il ne pleut pas depuis quatre milliards d\'années.', 'The fog on the dome makes drops that will never fall: outside, it has not rained for four billion years.'),
    ],
  })
  lights.push([9, 6.6, '#9dffb0', 0.9])

  // --- Les quartiers de la base, à l'ouest.
  put('hangar_roundA', 4.2, 10.2, {
    scale: S, rot: 1,
    interact: tr('Les quartiers de l\'avant-poste : six couchettes, une douche qui marche le mardi, et une affiche du Krait scotchée au-dessus du lit d\'Ada.', 'The outpost quarters: six bunks, a shower that works on Tuesdays, and a Krait poster taped above Ada\'s bed.'),
  })
  lights.push([6.9, 10.2, '#ffc27a', 0.9])
  put('satelliteDish_detailed', 2.2, 14, {
    scale: S, rot: 2,
    interact: tr('Une antenne relais, tournée vers le ciel. Elle capte surtout la radio du Jameson Memorial, et parfois des chansons de marins.', 'A relay dish, pointed at the sky. It mostly picks up Jameson Memorial radio, and sometimes sea shanties.'),
  })

  // --- La fusée de ravitaillement, sur son pas de tir.
  props.push({
    model: 'prebuilt',
    object: assembly([['rocket_baseA', 0, 0, 0], ['rocket_sidesA', 0, 1.6, 0], ['rocket_topA', 0, 2.6, 0]], S),
    x: 5, z: 16.6,
    interact: [
      tr('La fusée de ravitaillement : elle monte le minerai en orbite une fois par semaine. Les autres jours, elle sert de point de repère.', 'The supply rocket: it lifts ore to orbit once a week. The rest of the time, it is a landmark.'),
      tr('Peint sur le flanc : « BRADBURY 1 ». Quelqu\'un a ajouté au feutre : « (et dernière) ».', 'Painted on the side: “BRADBURY 1”. Someone added in marker: “(and last)”.'),
    ],
  })
  lights.push([7.2, 16.6, '#ffb347', 0.8])
  put('machine_barrelLarge', 8.4, 18.4, { scale: S })

  // --- Les machines, au sud de la place : générateurs, émetteur, fûts.
  put('machine_generatorLarge', 15, 18.8, {
    scale: S,
    interact: tr('Le générateur principal. Il ronronne comme Comète, en plus fort et en moins affectueux.', 'The main generator. It purrs like Comète, only louder and less affectionate.'),
  })
  put('machine_generator', 17.8, 18.6, { scale: S })
  put('machine_wireless', 12.6, 19, {
    scale: S,
    interact: tr('Un émetteur longue portée. Son écran affiche : « 0 message. Même pas de spam. »', 'A long-range transmitter. Its screen reads: “0 messages. Not even spam.”'),
  })
  put('barrels_rail', 19.6, 18.2, { scale: S })
  lights.push([15.5, 17.4, '#59d8ff', 0.8])

  // --- La foreuse minière, et le gisement de cristaux au sud-est.
  put('craft_miner', 26, 19.5, {
    scale: S, rot: 1,
    interact: tr('Une foreuse minière au repos. Sa mèche est encore couverte de poussière de cristal, qui brille faiblement.', 'A mining drill at rest. Its bit is still coated in crystal dust, faintly glowing.'),
  })
  const crystals: [SpaceModel, number, number, Rot][] = [
    ['rock_crystalsLargeA', 31.6, 16.8, 0], ['rock_crystalsLargeB', 33.4, 18.2, 1], ['rock_crystals', 30.6, 19, 2],
    ['rock_crystalsLargeA', 34.6, 15.8, 3], ['rock_crystals', 32.4, 20.2, 1],
  ]
  for (const [name, x, z, rot] of crystals) {
    put(name, x, z, {
      scale: 1.8, rot,
      interact: tr('Des cristaux verts qui luisent dans la roche rouge. Ada dit qu\'il ne faut pas les lécher. Elle a dû le préciser pour une raison.', 'Green crystals glowing in the red rock. Ada says not to lick them. She must have had a reason to say so.'),
    })
  }
  lights.push([32.4, 17.6, '#3dffa0', 1.3], [32.4, 19.6, '#3dffa0', 0.9])
  put('craterLarge', 29, 20.6, { scale: 2.4, solid: false })

  // --- La navette cargo, garée au nord-est.
  put('craft_cargoA', 32.6, 3.6, {
    scale: S, rot: 3,
    interact: tr('Une navette cargo de la base. Sur la soute : « Livraisons de la semaine : 12 caisses de pâtes, 1 tomate (en graines). »', 'One of the base\'s cargo shuttles. On the hold: “This week\'s deliveries: 12 crates of pasta, 1 tomato (as seeds).”'),
  })
  put('turret_double', 35.2, 9.6, {
    scale: S, rot: 1,
    interact: tr('Une tourelle de défense, canons pointés vers le ciel. Elle n\'a jamais tiré. Elle attend son heure.', 'A defence turret, barrels pointed at the sky. It has never fired. It is waiting for its moment.'),
  })

  // --- La porte de la base, sur la grande piste, et quelques rochers, cratères et cailloux.
  put('gate_complex', 19, 11, {
    scale: S, rot: 1, solid: false,
    action: tr('Lire', 'Read'),
    interact: tr('« AVANT-POSTE BRADBURY · Population : 1 (plus les visiteurs) · Vitesse limitée à 30 km/h · Pas de Thargoïdes ». ', '“BRADBURY OUTPOST · Population: 1 (plus visitors) · Speed limit 30 km/h · No Thargoids”.'),
  })
  const rocks: [SpaceModel, number, number, number, Rot][] = [
    ['rock_largeA', 1.6, 5.8, 2, 0], ['rock_largeB', 35.4, 13.2, 2, 1], ['meteor', 26.4, 1.8, 1.6, 2], ['rock_largeB', 11.4, 21.2, 1.8, 3],
    ['meteor_half', 36, 6.6, 1.6, 0], ['rock_largeA', 20.6, 21, 1.6, 2], ['meteor_detailed', 3, 19.6, 1.4, 1],
  ]
  for (const [name, x, z, scale, rot] of rocks) put(name, x, z, { scale, rot })
  const pebbles: [SpaceModel, number, number, Rot][] = [
    ['rocks_smallA', 6.5, 8.6, 0], ['rocks_smallB', 18, 13.2, 1], ['rocks_smallA', 23.4, 5.4, 2], ['rocks_smallB', 9.6, 12.6, 3],
    ['rocks_smallA', 27.2, 17, 1], ['rocks_smallB', 3.4, 4.2, 0], ['rocks_smallA', 14.4, 21, 2], ['rocks_smallB', 34, 11.4, 3],
    ['crater', 14.6, 12.8, 0], ['crater', 7, 20.6, 1], ['craterLarge', 23.6, 16.4, 0], ['crater', 29.2, 5.2, 2], ['crater', 2.6, 12.4, 3],
  ]
  for (const [name, x, z, rot] of pebbles) put(name, x, z, { scale: 1.8, rot, solid: false })

  const map = new ShipMap(BASE_LAYOUT)
  return {
    id: BASE_LEVEL,
    name: tr('Avant-poste Bradbury', 'Bradbury Outpost'),
    theme: 'station',
    // Le jour rouge d'une planète désertique : un ciel de poussière, un soleil bas et chaud.
    ambience: { sky: '#ffd2b3', ground: '#6b2f1f', hemi: 1.25, sun: '#ffe4c4', sunIntensity: 2.5 },
    // Du sable sous les pieds.
    footsteps: 'soft',
    layout: BASE_LAYOUT,
    rooms: { s: tr('Avant-poste Bradbury', 'Bradbury Outpost') },
    areas: [
      { name: tr('Aire d\'atterrissage', 'Landing pad'), minX: 23, maxX: 33, minZ: 6, maxZ: 16 },
      { name: tr('Place de l\'avant-poste', 'Outpost square'), minX: 9, maxX: 22, minZ: 7, maxZ: 15 },
      { name: tr('Gisement de cristaux', 'Crystal field'), minX: 28, maxX: 37, minZ: 15, maxZ: 22 },
    ],
    props,
    lights,
    ground: kit.ground(map, roadTiles(), { x: 19, z: 11 }),
  }
}
