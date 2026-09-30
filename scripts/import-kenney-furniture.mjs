#!/usr/bin/env node
/**
 * Importe une sélection du Furniture Kit de Kenney (CC0, https://kenney.nl/assets/furniture-kit)
 * en un seul fichier : public/assets/furniture/kenney-furniture.glb. Un nœud racine par modèle,
 * au nom du fichier d'origine (« toilet », « loungeSofa »…), matériaux dédoublonnés par nom (le
 * kit colore par matériau, sans texture). Cf. src/furniture/kenney.ts, qui les construit.
 *
 * Usage : node scripts/import-kenney-furniture.mjs <dossier « Models/GLTF format » du kit>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { mergePack } from './kenney-pack.mjs'

export const MODELS = [
  // Salle de bain
  'toilet', 'toiletSquare', 'bathtub', 'shower', 'showerRound', 'bathroomSink', 'bathroomSinkSquare', 'bathroomMirror',
  'bathroomCabinet', 'bathroomCabinetDrawer', 'washer', 'dryer', 'washerDryerStacked', 'trashcan', 'rugDoormat',
  // Cuisine
  'kitchenFridge', 'kitchenFridgeLarge', 'kitchenFridgeSmall', 'kitchenStove', 'kitchenStoveElectric', 'kitchenSink',
  'kitchenCabinet', 'kitchenCabinetDrawer', 'kitchenCabinetCornerInner', 'kitchenCabinetUpper', 'kitchenCabinetUpperDouble',
  'kitchenBar', 'kitchenBarEnd', 'kitchenMicrowave', 'kitchenCoffeeMachine', 'toaster', 'kitchenBlender', 'hoodModern',
  'stoolBar', 'stoolBarSquare', 'tableCross', 'tableCrossCloth', 'tableRound', 'tableCloth',
  // Salon
  'loungeSofa', 'loungeSofaLong', 'loungeSofaCorner', 'loungeSofaOttoman', 'loungeChair', 'loungeChairRelax',
  'loungeDesignChair', 'loungeDesignSofa', 'loungeDesignSofaCorner', 'tableCoffeeGlass', 'tableCoffeeSquare', 'tableGlass',
  'chairModernCushion', 'chairModernFrameCushion', 'chairRounded', 'chairDesk', 'benchCushionLow', 'sideTableDrawers',
  'cabinetTelevision', 'cabinetTelevisionDoors', 'televisionModern', 'televisionVintage', 'speaker', 'speakerSmall',
  'lampRoundFloor', 'lampSquareFloor', 'lampRoundTable', 'lampSquareTable', 'lampWall', 'ceilingFan',
  'coatRackStanding', 'coatRack', 'bear', 'pillow', 'pillowBlue', 'pillowLong', 'plantSmall1', 'plantSmall2', 'plantSmall3',
  'pottedPlant', 'laptop', 'computerScreen', 'computerKeyboard', 'desk', 'deskCorner',
  // Rangements, chambre, tapis
  'bookcaseOpen', 'bookcaseOpenLow', 'bookcaseClosedDoors', 'bookcaseClosedWide', 'cardboardBoxClosed', 'cardboardBoxOpen',
  'bedBunk', 'bedDouble', 'bedSingle', 'cabinetBedDrawerTable', 'cabinetBedDrawer',
  'rugRectangle', 'rugRounded', 'rugSquare', 'rugRound',
]

const dir = process.argv[2]
if (!dir) {
  console.error('Usage : node scripts/import-kenney-furniture.mjs <dossier « Models/GLTF format » du Furniture Kit>')
  process.exit(1)
}
const dest = new URL('../public/assets/furniture/', import.meta.url)
mkdirSync(dest, { recursive: true })
const glb = mergePack(dir, MODELS, 'mini-interior import-kenney-furniture')
writeFileSync(new URL('kenney-furniture.glb', dest), glb)
writeFileSync(new URL('License.txt', dest), readFileSync(join(dir, '../../License.txt')))
console.log(`${MODELS.length} modèles, ${(glb.length / 1024).toFixed(0)} Ko`)
