#!/usr/bin/env node
/**
 * Importe une sélection du Nature Kit de Kenney (CC0, https://kenney.nl/assets/nature-kit) en un
 * seul fichier : public/assets/furniture/kenney-nature.glb. Un nœud racine par modèle, au nom du
 * fichier d'origine (« plant_bushLarge », « tree_palmBend »…), matériaux dédoublonnés (le kit
 * colore par matériau, sans texture). Cf. src/furniture/nature.ts, qui en fait les plantes de la
 * serre.
 *
 * Usage : node scripts/import-kenney-nature.mjs <dossier « Models/GLTF format » du kit>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { mergePack } from './kenney-pack.mjs'

export const MODELS = [
  // Buissons, fougères, herbes
  'plant_bush', 'plant_bushDetailed', 'plant_bushLarge', 'plant_bushLargeTriangle', 'plant_bushSmall', 'plant_bushTriangle',
  'plant_flatShort', 'plant_flatTall', 'grass', 'grass_large', 'grass_leafs', 'grass_leafsLarge', 'hanging_moss',
  // Fleurs
  'flower_purpleA', 'flower_purpleB', 'flower_purpleC', 'flower_redA', 'flower_redB', 'flower_redC',
  'flower_yellowA', 'flower_yellowB', 'flower_yellowC',
  // Arbres, palmiers, cactus, champignons
  'tree_palmBend', 'tree_palmDetailedShort', 'tree_palmShort', 'tree_small', 'cactus_short', 'cactus_tall',
  'mushroom_redGroup', 'mushroom_tanGroup',
  // Potager
  'crop_pumpkin', 'crop_melon', 'crops_cornStageC', 'crops_bambooStageB', 'crops_leafsStageB',
  // Pots, nénuphars, pierres
  'pot_large', 'pot_small', 'lily_large', 'lily_small', 'stone_smallFlatA', 'stone_smallFlatB',
]

const dir = process.argv[2]
if (!dir) {
  console.error('Usage : node scripts/import-kenney-nature.mjs <dossier « Models/GLTF format » du Nature Kit>')
  process.exit(1)
}
const dest = new URL('../public/assets/furniture/', import.meta.url)
mkdirSync(dest, { recursive: true })
const glb = mergePack(dir, MODELS, 'mini-interior import-kenney-nature')
writeFileSync(new URL('kenney-nature.glb', dest), glb)
writeFileSync(new URL('License-nature.txt', dest), readFileSync(join(dir, '../../License.txt')))
console.log(`${MODELS.length} modèles, ${(glb.length / 1024).toFixed(0)} Ko`)
