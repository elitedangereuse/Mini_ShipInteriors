import { tr } from '../i18n'

/*
 * Variantes partagées par plusieurs parties du catalogue (catalog.ts et ses compléments) : tissus,
 * essences de bois, couleurs d'électroménager. Chaque identifiant est le `label` que reçoit le
 * constructeur du meuble.
 */

export interface Variant {
  id: string
  label: string
  /** Pastille de couleur dans le sélecteur. */
  swatch?: string
}

/** Tissus du mobilier des quartiers (cf. FABRIC dans furniture/cozy.ts). */
export const FABRICS: Variant[] = [
  { id: 'teal', label: tr('Bleu canard', 'Teal'), swatch: '#3f8f8c' },
  { id: 'terracotta', label: tr('Terre cuite', 'Terracotta'), swatch: '#c0643f' },
  { id: 'mustard', label: tr('Moutarde', 'Mustard'), swatch: '#d9a441' },
  { id: 'navy', label: tr('Marine', 'Navy'), swatch: '#34507a' },
  { id: 'sage', label: tr('Sauge', 'Sage'), swatch: '#8fae7e' },
  { id: 'rose', label: tr('Vieux rose', 'Dusty pink'), swatch: '#d98b8b' },
  { id: 'plum', label: tr('Prune', 'Plum'), swatch: '#7a4f7a' },
  { id: 'purple', label: tr('Violet', 'Purple'), swatch: '#5a3a8a' },
  { id: 'cream', label: tr('Crème', 'Cream'), swatch: '#e9dcc4' },
]

/** Les tissus, `first` en tête (la variante par défaut). */
export const fabrics = (first: string): Variant[] => [FABRICS.find((f) => f.id === first)!, ...FABRICS.filter((f) => f.id !== first)]

/** Essences et laques du mobilier du Furniture Kit (cf. WOODS dans furniture/kenney.ts). */
export const WOOD_FINISHES: Variant[] = [
  { id: 'oak', label: tr('Chêne clair', 'Light oak'), swatch: '#f0c9a4' },
  { id: 'honey', label: tr('Miel', 'Honey'), swatch: '#c98f4e' },
  { id: 'walnut', label: tr('Noyer', 'Walnut'), swatch: '#7a4e32' },
  { id: 'white', label: tr('Laque blanche', 'White lacquer'), swatch: '#eeeae2' },
  { id: 'graphite', label: tr('Graphite', 'Graphite'), swatch: '#4a4f58' },
  { id: 'sage', label: tr('Vert sauge', 'Sage green'), swatch: '#9ab39a' },
]

/** Couleurs de l'électroménager du Furniture Kit (cf. APPLIANCES dans furniture/kenney.ts). */
export const APPLIANCE_COLORS: Variant[] = [
  { id: 'steel', label: tr('Inox', 'Stainless steel'), swatch: '#c8d6da' },
  { id: 'white', label: tr('Blanc', 'White'), swatch: '#f2f1ec' },
  { id: 'cream', label: tr('Crème rétro', 'Retro cream'), swatch: '#f1e3c2' },
  { id: 'mint', label: tr('Menthe rétro', 'Retro mint'), swatch: '#a8e0cc' },
  { id: 'red', label: tr('Rouge rétro', 'Retro red'), swatch: '#d8453b' },
  { id: 'black', label: tr('Noir', 'Black'), swatch: '#2b2d31' },
]
