#!/usr/bin/env node
/**
 * Importe les ingrédients, la vaisselle et les ustensiles de MESS RUSH depuis le Food Kit de Kenney
 * (CC0), en un seul fichier : public/assets/food/kenney-food.glb. Un nœud par modèle, au nom du
 * fichier d'origine, coloré par matériau (cf. import-kenney-outdoor.mjs, qui fait la conversion).
 * Cf. src/mess-rush/props.ts et `model` dans shared/mess-rush-catalog.js. Le jeu ne le charge qu'en
 * entrant dans la cuisine.
 *
 * Usage : node scripts/import-kenney-food.mjs [dossier « 3D assets » de la collection]
 *         (par défaut : assets/3D assets)
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildPack } from './import-kenney-outdoor.mjs'

const KITS = [
  {
    dir: 'Food Kit/Models/GLB format', prefix: '',
    models: [
      // Les ingrédients (crus, puis coupés ou cuits) : seulement ceux du catalogue (cf. `model`).
      'meat-raw', 'meat-cooked', 'carrot', 'fish', 'rice-ball', 'apple', 'apple-half',
      // La vaisselle et les ustensiles.
      'plate', 'pot', 'frying-pan', 'cutting-board',
    ],
  },
]

const root = process.argv[2] ?? fileURLToPath(new URL('../assets/3D assets', import.meta.url))
const { glb, count, materials } = buildPack(root, KITS)
const dest = new URL('../public/assets/food/', import.meta.url)
mkdirSync(dest, { recursive: true })
writeFileSync(new URL('kenney-food.glb', dest), glb)
writeFileSync(new URL('License-food.txt', dest), 'kenney-food.glb : modèles tirés du Food Kit de Kenney (www.kenney.nl)\n\nLicense: (Creative Commons Zero, CC0)\nhttp://creativecommons.org/publicdomain/zero/1.0/\n\nThis content is free to use in personal, educational and commercial projects.\nSupport us by crediting Kenney or www.kenney.nl (this is not mandatory)\n')
console.log(`${count} modèles, ${materials} matériaux, ${(glb.length / 1024).toFixed(0)} Ko`)
