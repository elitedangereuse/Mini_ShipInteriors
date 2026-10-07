#!/usr/bin/env node
/**
 * Importe les armes et les cibles du stand de tir de la cale depuis le Blaster Kit de Kenney (CC0),
 * en un seul fichier : public/assets/furniture/kenney-blaster.glb. Un nœud par modèle, au nom du
 * fichier d'origine, coloré par matériau (cf. import-kenney-outdoor.mjs, qui fait la conversion).
 * Cf. src/furniture/range.ts et src/range.ts.
 *
 * Usage : node scripts/import-kenney-blaster.mjs [dossier « 3D assets » de la collection]
 *         (par défaut : assets/3D assets)
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildPack } from './import-kenney-outdoor.mjs'

const KITS = [
  {
    dir: 'Blaster Kit/Models/GLB format', prefix: '',
    models: [
      // Les armes du stand (cf. WEAPONS dans src/range.ts), puis celles du râtelier, pour le décor.
      'blaster-b', 'blaster-a', 'blaster-e', 'blaster-c', 'blaster-d', 'blaster-h', 'blaster-l', 'blaster-n',
      'target-large', 'target-small', 'target-fragment-large', 'target-fragment-small',
      'crate-wide', 'crate-medium', 'clip-small', 'clip-large',
    ],
  },
]

const root = process.argv[2] ?? fileURLToPath(new URL('../assets/3D assets', import.meta.url))
const { glb, count, materials } = buildPack(root, KITS)
const dest = new URL('../public/assets/furniture/', import.meta.url)
writeFileSync(new URL('kenney-blaster.glb', dest), glb)
writeFileSync(new URL('License-blaster.txt', dest), 'kenney-blaster.glb : modèles tirés du Blaster Kit de Kenney (www.kenney.nl)\n\nLicense: (Creative Commons Zero, CC0)\nhttp://creativecommons.org/publicdomain/zero/1.0/\n\nThis content is free to use in personal, educational and commercial projects.\nSupport us by crediting Kenney or www.kenney.nl (this is not mandatory)\n')
console.log(`${count} modèles, ${materials} matériaux, ${(glb.length / 1024).toFixed(0)} Ko`)
