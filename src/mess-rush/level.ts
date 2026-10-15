import { tr } from '../i18n'
import type { LevelDef, Prop } from '../levels'
import { INGREDIENTS } from '../../shared/mess-rush-catalog.js'
import { MESS_BOUNDS, MESS_LAYOUT, MESS_LEVEL, NORTH_ROW, SERVICE_COUNTER, STATION_BY_ID, STATIONS } from '../../shared/mess-rush.js'

/*
 * La cuisine de MESS RUSH : la cuisine du mess, seule, instanciée pour chaque service (cf.
 * shared/mess-rush.js), à l'échelle de ses cuisiniers : des meubles bas, rien qui leur arrive à la
 * tête (cf. furniture/mess-rush.ts). Comme dans Overcooked, une seule pièce ouverte, des comptoirs
 * tout autour et le milieu libre : au mur ouest, les caisses d'ingrédients ; au fond, les planches,
 * les fourneaux (l'extincteur entre eux, son panneau au mur) et la plonge ; au mur est, les assiettes propres ; au nord, des plans de travail puis
 * le comptoir de service (la passe, le retour de vaisselle), et derrière lui l'allée où les clients
 * font la queue. Une poubelle dans deux coins.
 *
 * Les meubles des postes n'ont rien à examiner : ce sont les postes eux-mêmes (cf. client.ts) qu'on
 * vise, avec leur invite.
 */

const at = (id: string) => STATION_BY_ID[id]
const WALL_Z = 12.075
const EAST_X = 17.075
const NORTH_Z = (SERVICE_COUNTER.minZ + SERVICE_COUNTER.maxZ) / 2
const mid = (a: string, b: string) => (at(a).x + at(b).x) / 2
/** Un comptoir bas de `x0` à `x1`, au fond (`wall`, face au nord) ou au nord (`wall` face au sud, ou `service`). */
const counter = (x0: number, x1: number, z: number, kind: 'wall' | 'service', rot: Prop['rot'] = kind === 'wall' ? 2 : 0): Prop => ({ model: 'rush-counter', x: (x0 + x1) / 2, z, rot, label: `${(x1 - x0).toFixed(2)}|${kind}` })

const PROPS: Prop[] = [
  // --- Le mur ouest : les caisses, une par ingrédient, sa couleur en façade (l'ingrédient, en grand, posé dessus).
  ...STATIONS.filter((s) => s.kind === 'crate').map((s): Prop => ({ model: 'rush-crate', x: s.x, z: s.z, rot: 1, label: INGREDIENTS[s.ing!].color })),
  // --- Le nord : des plans de travail à l'ouest, puis le comptoir de service, les clients derrière.
  counter(8.35, NORTH_ROW.maxX, NORTH_Z, 'wall', 0),
  counter(SERVICE_COUNTER.minX, MESS_BOUNDS.maxX, NORTH_Z, 'service'),
  // --- Le mur du fond : un comptoir et les trois planches, les deux fourneaux, un comptoir, la plonge.
  counter(MESS_BOUNDS.minX, 10.925, WALL_Z, 'wall'),
  { model: 'rush-stove', x: mid('marmite-1', 'marmite-2'), z: WALL_Z, rot: 2 },
  counter(12.44, 13.26, WALL_Z, 'wall'),
  { model: 'rush-stove', x: mid('poele-1', 'poele-2'), z: WALL_Z, rot: 2 },
  // Le panneau de l'extincteur, au mur entre les deux fourneaux, au-dessus de son crochet.
  { model: 'rush-fire-sign', x: at('extincteur').x, z: MESS_BOUNDS.maxZ - 0.01, rot: 2, solid: false },
  counter(14.64, 15.35, WALL_Z, 'wall'),
  { model: 'rush-sink', x: at('plonge').x, z: WALL_Z, rot: 2 },
  // --- Le mur est : les assiettes propres et deux comptoirs.
  { model: 'rush-counter', x: EAST_X, z: 10.1, rot: 3, label: '3.3|wall' },
  // --- Une poubelle dans deux coins.
  ...STATIONS.filter((s) => s.kind === 'trash').map((s): Prop => ({ model: 'k-trashcan', x: s.x, z: s.z, rot: s.z > 10 ? 2 : 0 })),
  // --- Le sol d'un seul tenant (et le logo), le tableau des tâches, le néon.
  { model: 'rush-floor', x: (MESS_BOUNDS.minX + MESS_BOUNDS.maxX) / 2, z: (MESS_BOUNDS.minZ + MESS_BOUNDS.maxZ) / 2, solid: false },
  { model: 'mess-neon', x: MESS_BOUNDS.maxX, z: 10.3, rot: 3, solid: false },
]

/** Le « pont » de la cuisine : une seule pièce, hors des ponts du vaisseau. */
export const MESS_RUSH_DECK: LevelDef = {
  id: MESS_LEVEL,
  name: tr('Cuisine de MESS RUSH', 'MESS RUSH kitchen'),
  instance: true,
  layout: MESS_LAYOUT,
  mapOptions: {},
  rooms: { m: 'MESS RUSH' },
  windows: { m: 0 },
  // La cuisine blanche ; l'allée des clients, plus chaude.
  lighting: { m: { level: 1.1, color: '#f2f8ff' } },
  areas: [{ name: tr('File des clients', 'Customer queue'), minX: 8, maxX: 17, minZ: 7, maxZ: 7, lighting: { level: 0.8, color: '#ffe0bd' } }],
  props: PROPS,
  lights: [
    // La lampe chauffante de la passe, et la lumière blanche de la cuisine, une par colonne.
    [at('passe').x, 8.1, '#ff9a4a', 1.4],
    [9.6, 10.3, '#eef5ff', 2.4],
    [12.5, 10.3, '#eef5ff', 2.4],
    [15.4, 10.3, '#eef5ff', 2.4],
  ],
}
