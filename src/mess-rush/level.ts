import { tr } from '../i18n'
import type { LevelDef, Prop } from '../levels'
import { ISLAND, MESS_BOUNDS, MESS_LAYOUT, MESS_LEVEL, SERVICE_COUNTER, STATION_BY_ID } from '../../shared/mess-rush.js'

/*
 * La cuisine de MESS RUSH : la cuisine du mess, seule (sans la salle du self), instanciée pour
 * chaque service (cf. shared/mess-rush.js). Le long du mur du fond, à l'ouest le frigo, la plonge et
 * le fourneau des poêles, à l'est celui des marmites et le garde-manger ; au milieu, l'îlot, ses
 * plans de travail et ses piles d'assiettes ; au nord, le comptoir de service, ses deux passes, la
 * machine à café et le four, et derrière lui l'allée où les clients font la queue. Une poubelle dans
 * chaque coin.
 *
 * Les meubles des postes n'ont rien à examiner : ce sont les postes eux-mêmes (cf. client.ts) qu'on
 * vise, avec leur invite.
 */

const at = (id: string) => STATION_BY_ID[id]
const WALL_Z = 12.075
const mid = (a: string, b: string) => (at(a).x + at(b).x) / 2

const PROPS: Prop[] = [
  // --- Le mur du fond.
  { model: 'kitchen-fridge', x: at('frigo').x, z: WALL_Z, rot: 2 },
  { model: 'kitchen-sink', x: at('plonge').x, z: WALL_Z, rot: 2 },
  { model: 'kitchen-range', x: mid('poele-1', 'poele-2'), z: WALL_Z, rot: 2 },
  { model: 'kitchen-range', x: mid('marmite-1', 'marmite-2'), z: WALL_Z, rot: 2 },
  { model: 'kitchen-pantry', x: at('garde-manger').x, z: 12.14, rot: 2 },
  { model: 'rush-counter', x: at('comptoir-6').x, z: WALL_Z, rot: 2, label: '1.1|wall' },
  // --- L'îlot, et le comptoir de service d'un mur à l'autre (les clients derrière).
  { model: 'rush-counter', x: (ISLAND.minX + ISLAND.maxX) / 2, z: (ISLAND.minZ + ISLAND.maxZ) / 2, label: `${ISLAND.maxX - ISLAND.minX}|island` },
  { model: 'rush-counter', x: (MESS_BOUNDS.minX + MESS_BOUNDS.maxX) / 2, z: (SERVICE_COUNTER.minZ + SERVICE_COUNTER.maxZ) / 2, label: `${MESS_BOUNDS.maxX - MESS_BOUNDS.minX}|service` },
  { model: 'k-coffee-machine', x: at('fontaine').x, z: at('fontaine').z, y: 0.46, solid: false },
  { model: 'rush-oven', x: at('four').x, z: at('four').z, y: 0.46, solid: false },
  // --- Une poubelle dans chaque coin.
  ...['poubelle-so', 'poubelle-se', 'poubelle-no', 'poubelle-ne'].map((id): Prop => ({ model: 'k-trashcan', x: at(id).x, z: at(id).z, rot: at(id).z > 10 ? 2 : 0 })),
  // --- L'habillage : le sol d'un seul tenant, l'enseigne au-dessus du fond, les cuivres, le tableau des tâches.
  { model: 'rush-floor', x: (MESS_BOUNDS.minX + MESS_BOUNDS.maxX) / 2, z: (MESS_BOUNDS.minZ + MESS_BOUNDS.maxZ) / 2, solid: false },
  { model: 'rush-sign', x: 12.675, z: MESS_BOUNDS.maxZ, rot: 2, label: '0.95', solid: false },
  { model: 'pot-rack', x: at('plonge').x, z: 12, solid: false },
  { model: 'pot-rack', x: at('garde-manger').x - 0.9, z: 12, solid: false },
  { model: 'kitchen-rota', x: MESS_BOUNDS.minX, z: 10.9, rot: 1, solid: false },
  { model: 'mess-neon', x: MESS_BOUNDS.maxX, z: 10.9, rot: 3, solid: false },
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
    // Les lampes chauffantes des passes, et la lumière blanche de la cuisine.
    [at('passe-1').x, 8.1, '#ff9a4a', 1.4],
    [at('passe-2').x, 8.1, '#ff9a4a', 1.4],
    [10.6, 10.9, '#eef5ff', 2.6],
    [14.6, 10.9, '#eef5ff', 2.6],
    [12.5, 9.1, '#eef5ff', 2],
  ],
}
