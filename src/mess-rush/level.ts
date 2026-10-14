import { tr } from '../i18n'
import type { LevelDef, Prop } from '../levels'
import { MESS_LAYOUT, MESS_LEVEL, STATION_BY_ID } from '../../shared/mess-rush.js'

/*
 * La cuisine de MESS RUSH : le mess du pont principal, agrandi (10 × 8 tuiles au lieu de 7 × 7) et
 * instancié pour chaque service (cf. shared/mess-rush.js). On le reconnaît : la salle chaude au
 * nord, ses deux tables de cantine et leurs suspensions, le comptoir du self qui traverse la pièce,
 * la cuisine blanche au sud. Elle gagne une allée de deux tuiles, un passage à chaque bout du
 * comptoir, un second plan de travail et un second fourneau, et un bac de recyclage.
 *
 * Les meubles des postes n'ont rien à examiner : ce sont les postes eux-mêmes (cf. client.ts) qu'on
 * vise, avec leur invite.
 */

const at = (id: string) => STATION_BY_ID[id]

const PROPS: Prop[] = [
  // --- La salle : les deux tables de cantine, une suspension au-dessus de chaque place.
  { model: 'canteen-table', x: 10.3, z: 6.45, label: '1' },
  { model: 'canteen-table', x: 14.7, z: 6.45, label: '2' },
  ...[10.3, 14.7].flatMap((x) => [-0.62, 0, 0.62].map((dx): Prop => ({ model: 'mess-pendant', x: x + dx, z: 6.45, solid: false }))),
  { model: 'water-fountain', x: at('fontaine').x, z: 4.8 },
  {
    model: 'vending-machine', x: 12.5, z: 4.65,
    interact: tr('Le distributeur : en plein service, Marcel l\'a débranché. « On cuisine, ici. »', 'The vending machine: mid-service, Marcel has unplugged it. “We cook here.”'),
  },
  // Le retour plateaux sert de bac de recyclage côté salle (le poste `retour-plateaux`).
  { model: 'tray-return', x: at('retour-plateaux').x, z: 4.84 },
  { model: 'menu-board', x: 7.66, z: 6.45, rot: 1, solid: false, interact: tr('Le menu du service : ce que disent les bons.', 'The service menu: whatever the tickets say.') },
  // --- Le comptoir du self, la pile d'assiettes, le rail des bons et la passe.
  { model: 'self-counter', x: 12.5, z: 9.3, rot: 2, label: '7' },
  { model: 'tray-stack', x: at('assiettes').x, z: 9.3, y: 0.46, rot: 2, solid: false },
  { model: 'order-rail', x: 12.5, z: 9.3, y: 0.46, rot: 2, solid: false },
  { model: 'mess-signs', x: 12.5, z: 9.3, rot: 2, solid: false },
  // --- La cuisine, le long du mur sud.
  { model: 'kitchen-fridge', x: at('frigo').x, z: 12.075, rot: 2 },
  { model: 'kitchen-pantry', x: at('garde-manger').x, z: 12.14, rot: 2 },
  { model: 'kitchen-prep', x: at('plan-1').x, z: 12.075, rot: 2 },
  { model: 'kitchen-range', x: 11.95, z: 12.075, rot: 2 },
  { model: 'kitchen-range', x: 13.4, z: 12.075, rot: 2 },
  { model: 'kitchen-prep', x: at('plan-2').x, z: 12.075, rot: 2 },
  { model: 'kitchen-sink', x: at('plonge').x, z: 12.075, rot: 2 },
  { model: 'k-trashcan', x: at('recyclage').x, z: 12.0, rot: 2 },
  { model: 'pot-rack', x: at('plan-1').x, z: 12, solid: false },
  { model: 'pot-rack', x: at('plan-2').x, z: 12, solid: false },
  // --- L'habillage : le sol d'un seul tenant, les enseignes, le soubassement émaillé de la salle, la
  // fresque, le néon et les aromates, le tableau de liège et l'horloge, le tour de plonge.
  { model: 'mess-floor', x: 12.5, z: 8.5, label: '10x8|12.5|8.5|rush', solid: false },
  { model: 'mess-dado', x: 10.325, z: 4.65, label: '3.35', solid: false },
  { model: 'mess-dado', x: 14.65, z: 4.65, label: '3.3', solid: false },
  { model: 'mess-dado', x: 7.65, z: 6.675, rot: 1, label: '4.05', solid: false },
  { model: 'mess-dado', x: 17.35, z: 6.675, rot: 3, label: '4.05', solid: false },
  { model: 'mess-mural', x: 17.35, z: 6.75, rot: 3, solid: false },
  { model: 'mess-neon', x: 7.65, z: 5.2, rot: 1, solid: false },
  { model: 'mess-herbs', x: 7.65, z: 7.8, rot: 1, solid: false },
  { model: 'mess-board', x: 10.2, z: 4.65, solid: false },
  { model: 'mess-clock', x: 14.2, z: 4.65, solid: false },
  { model: 'kitchen-rota', x: 7.65, z: 10.6, rot: 1, solid: false },
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
  // Comme le mess : la salle chaude, la cuisine blanche et crue.
  lighting: { m: { level: 0.75, color: '#ffe0bd' } },
  areas: [{ name: tr('Cuisine de MESS RUSH', 'MESS RUSH kitchen'), minX: 8, maxX: 17, minZ: 10, maxZ: 12, lighting: { level: 1.15, color: '#f2f8ff' } }],
  props: PROPS,
  lights: [
    // Une tache chaude sous les suspensions de chaque table, les lampes chauffantes de la passe, et
    // la lumière blanche de la cuisine.
    [10.3, 6.45, '#ffb869', 2, undefined, 4.5],
    [14.7, 6.45, '#ffb869', 2, undefined, 4.5],
    [at('passe').x, 9.2, '#ff9a4a', 1.4],
    [11, 11.1, '#eef5ff', 2.8],
    [14.4, 11.1, '#eef5ff', 2.8],
  ],
}
