import * as THREE from 'three'
import { NATURE_PACK, packModel } from '../assets'
import { box, cylinder, lit, type Builder } from './kit'

/*
 * Les plantes du Nature Kit de Kenney (CC0), pour la serre : buissons, fougères, herbes, fleurs
 * sauvages, palmiers en pot, bambous, cactus, citrouilles, champignons, paniers suspendus. Les
 * modèles sont rangés dans un seul fichier (cf. scripts/import-kenney-nature.mjs), colorés par
 * matériau. Chaque constructeur en clone un ou plusieurs, les met à l'échelle du vaisseau, les
 * pose au sol et les assemble (un palmier dans son pot, une touffe de fleurs). Le vert vif du kit
 * est un peu adouci, pour aller avec les feuillages faits main de la serre (cf. garden.ts).
 */

/** Les verts du kit, adoucis ; les autres matériaux gardent leur couleur. */
const TINTS: Record<string, string> = {
  grass: '#6aa84f',
  leafsGreen: '#4f9a4a',
  leafsDark: '#3c7a44',
  woodBark: '#6b4a32',
  // Les citrouilles : le « feuillage d'automne » du kit, en orange franc.
  leafsFall: '#e8842c',
}

/**
 * Un modèle du kit, à l'échelle `s`, tourné de `turn` (radians), le pied à y = 0, centré sur
 * l'origine, puis posé en (x, y, z).
 */
function model(file: string, s: number, x = 0, z = 0, turn = 0, y = 0): THREE.Group {
  const inner = new THREE.Group()
  inner.add(packModel(file, NATURE_PACK).clone(true))
  inner.scale.setScalar(s)
  inner.rotation.y = turn
  const root = new THREE.Group().add(inner)
  root.updateMatrixWorld(true)
  const b = new THREE.Box3().setFromObject(root)
  inner.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2)
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const tint = TINTS[(m.material as THREE.Material).name]
    if (tint) m.material = lit(tint)
  })
  root.position.set(x, y, z)
  return root
}

/** Choix d'une variante par `label` (sinon la première). */
const variant = <T,>(table: Record<string, T>, label: string | undefined): T => table[label ?? ''] ?? Object.values(table)[0]

/** Buisson. Forme : `label` (round, detailed, large, triangle, small). */
const BUSHES: Record<string, [string, number]> = {
  detailed: ['plant_bushDetailed', 1.4],
  round: ['plant_bush', 1.7],
  large: ['plant_bushLarge', 2],
  triangle: ['plant_bushTriangle', 1.7],
  small: ['plant_bushSmall', 1.5],
}
const bush: Builder = ({ label, random }) => {
  const [file, s] = variant(BUSHES, label)
  return { solid: new THREE.Group().add(model(file, s, 0, 0, random() * Math.PI * 2)) }
}

/** Fougère : une grande touffe de frondes, et une plus petite à côté. */
const fern: Builder = ({ random }) => {
  const g = new THREE.Group()
  g.add(model('plant_flatTall', 1.9, 0, 0, random() * 6))
  g.add(model('plant_flatShort', 1.4, 0.2, 0.14, random() * 6))
  return { solid: g }
}

/** Touffe d'herbes hautes (sans collision). Forme : `label` (tall, wide, leafs). */
const GRASSES: Record<string, [string, number]> = {
  tall: ['grass_large', 1.3],
  wide: ['grass_leafsLarge', 1.2],
  leafs: ['grass_leafs', 1.5],
}
const grassTuft: Builder = ({ label, random }) => {
  const [file, s] = variant(GRASSES, label)
  return { solid: new THREE.Group().add(model(file, s, 0, 0, random() * 6)) }
}

/** Touffe de fleurs sauvages : une dizaine de tiges du kit mêlées. Couleurs : `label` (mixed, purple, red, yellow). */
const WILDFLOWERS: Record<string, string[]> = {
  mixed: ['flower_purpleA', 'flower_redA', 'flower_yellowA', 'flower_purpleB', 'flower_yellowC', 'flower_redB', 'flower_purpleC', 'flower_redC'],
  purple: ['flower_purpleA', 'flower_purpleB', 'flower_purpleC'],
  red: ['flower_redA', 'flower_redB', 'flower_redC'],
  yellow: ['flower_yellowA', 'flower_yellowB', 'flower_yellowC'],
}
const wildflowers: Builder = ({ label, random }) => {
  const files = variant(WILDFLOWERS, label)
  const g = new THREE.Group()
  for (let i = 0; i < 9; i++) {
    const a = random() * Math.PI * 2, r = Math.sqrt(random()) * 0.28
    g.add(model(files[i % files.length], 1.2 + random() * 0.4, Math.cos(a) * r, Math.sin(a) * r, random() * 6))
  }
  return { solid: g }
}

/** Palmier en pot, sur une soucoupe. Espèce : `label` (bend : penché, short : trapu, fan : en éventail). */
const PALMS: Record<string, [string, number]> = {
  bend: ['tree_palmBend', 1.0],
  short: ['tree_palmShort', 1.15],
  fan: ['tree_palmDetailedShort', 0.95],
}
const pottedPalm: Builder = ({ label, random }) => {
  const [file, s] = variant(PALMS, label)
  const g = new THREE.Group()
  g.add(cylinder(0.3, 0.3, 0.03, lit('#8a4a32'), 0, 0.015, 0, 18))
  g.add(model('pot_large', 1, 0, 0, random() * 6, 0.03))
  g.add(cylinder(0.24, 0.24, 0.02, lit('#3a2a1e'), 0, 0.2, 0, 16))
  g.add(model(file, s, 0, 0, random() * 6, 0.18))
  return { solid: g }
}

/**
 * Palmier en pleine terre, au jardin exotique : plus haut qu'en pot, des galets et des herbes au
 * pied. Espèce : `label` (comme les palmiers en pot). Seul son tronc arrête le passage (`extent`) :
 * avec sa couronne, il fermait toute une allée.
 */
const junglePalm: Builder = ({ label, random }) => {
  const [file, s] = variant(PALMS, label)
  const g = new THREE.Group()
  g.add(model(file, s * 1.55, 0, 0, random() * 6))
  for (let i = 0; i < 3; i++) {
    const a = random() * Math.PI * 2
    g.add(model(i % 2 ? 'stone_smallFlatA' : 'stone_smallFlatB', 0.3 + random() * 0.15, Math.cos(a) * 0.2, Math.sin(a) * 0.2, random() * 6))
  }
  g.add(model('grass_leafs', 0.9, 0.14, -0.12, random() * 6), model('plant_flatShort', 0.9, -0.15, 0.1, random() * 6))
  return { solid: g, extent: new THREE.Box3(new THREE.Vector3(-0.2, 0, -0.2), new THREE.Vector3(0.2, 1.5, 0.2)) }
}

/** Petit pot du kit, planté. Plante : `label` (fern, cactus, flowers, bush, mushrooms). */
const POTTED: Record<string, [string, number][]> = {
  fern: [['plant_flatTall', 1.4]],
  cactus: [['cactus_short', 0.8]],
  flowers: [['flower_redA', 1.3], ['flower_yellowA', 1.3], ['flower_purpleA', 1.3]],
  bush: [['plant_bushSmall', 1.1]],
  mushrooms: [['mushroom_redGroup', 1.1]],
}
const naturePot: Builder = ({ label, random }) => {
  const plants = variant(POTTED, label)
  const g = new THREE.Group()
  g.add(model('pot_small', 1, 0, 0, random() * 6))
  plants.forEach(([file, s], i) => {
    const a = (i / plants.length) * Math.PI * 2
    const r = plants.length > 1 ? 0.05 : 0
    g.add(model(file, s, Math.cos(a) * r, Math.sin(a) * r, random() * 6, 0.24))
  })
  return { solid: g }
}

/** Bosquet de bambous dans un bac de bois, galets au pied. */
const bamboo: Builder = ({ random }) => {
  const g = new THREE.Group()
  const wood = lit('#6b4630')
  g.add(box(0.62, 0.18, 0.42, wood, 0, 0.09, 0, 0.02), box(0.56, 0.02, 0.36, lit('#3a2a1e'), 0, 0.175, 0))
  for (let i = 0; i < 5; i++) {
    const x = -0.2 + i * 0.1 + (random() - 0.5) * 0.04, z = (i % 2 ? 0.08 : -0.07) + (random() - 0.5) * 0.04
    g.add(model('crops_bambooStageB', 1.15 + random() * 0.35, x, z, random() * 6, 0.17))
  }
  for (let i = 0; i < 4; i++) g.add(model('stone_smallFlatA', 0.18, -0.2 + i * 0.13, 0.13, random() * 6, 0.18))
  return { solid: g }
}

/** Massif de cactus : un bac de sable, cactus hauts et bas, deux galets. */
const cactusBed: Builder = ({ random }) => {
  const g = new THREE.Group()
  g.add(box(0.9, 0.16, 0.5, lit('#b8653f'), 0, 0.08, 0, 0.02), box(0.84, 0.02, 0.44, lit('#e2c98f'), 0, 0.155, 0))
  g.add(model('cactus_tall', 0.9, -0.22, -0.05, random() * 6, 0.16))
  g.add(model('cactus_short', 0.75, 0.12, 0.08, random() * 6, 0.16))
  g.add(model('cactus_short', 0.55, 0.3, -0.1, random() * 6, 0.16))
  g.add(model('stone_smallFlatA', 0.3, 0.02, -0.12, random() * 6, 0.16), model('stone_smallFlatB', 0.25, -0.3, 0.14, random() * 6, 0.16))
  g.add(model('flower_yellowC', 1.1, 0.34, 0.14, 0, 0.16))
  return { solid: g }
}

/** Carré de citrouilles et de melons, sur un lit de paille, feuilles et vrilles. */
const pumpkinPatch: Builder = ({ random }) => {
  const g = new THREE.Group()
  g.add(box(1.1, 0.03, 0.7, lit('#d9c07a'), 0, 0.015, 0, 0.01))
  g.add(model('crop_pumpkin', 1.2, -0.3, -0.12, random() * 6), model('crop_pumpkin', 0.9, 0.3, 0.14, random() * 6))
  g.add(model('crop_melon', 1.1, 0.25, -0.16, random() * 6), model('crop_melon', 0.8, -0.28, 0.2, random() * 6))
  g.add(model('crops_leafsStageB', 0.7, 0, 0, random() * 6, 0.02))
  return { solid: g }
}

/** Champignons au pied d'un arbre (sans collision). */
const mushrooms: Builder = ({ random }) => {
  const g = new THREE.Group()
  g.add(model('mushroom_redGroup', 1, 0, 0, random() * 6), model('mushroom_tanGroup', 0.8, 0.16, 0.1, random() * 6))
  return { solid: g }
}

/**
 * Panier suspendu, au mur : une potence de fer blanc accrochée au haut du vitrage, un panier de
 * fibre, des fleurs et de la mousse qui retombe. Dos au mur (z = 0), face à +z.
 */
const hangingBasket: Builder = ({ random }) => {
  const g = new THREE.Group()
  const iron = lit('#f1efe8')
  g.add(box(0.03, 0.14, 0.02, iron, 0, 0.92, 0.01), box(0.02, 0.02, 0.26, iron, 0, 0.98, 0.13))
  for (const dx of [-0.06, 0.06]) g.add(cylinder(0.003, 0.003, 0.2, lit('#3a3e46'), dx, 0.88, 0.24, 4))
  g.add(cylinder(0.11, 0.07, 0.09, lit('#a07a4a'), 0, 0.76, 0.24, 12), cylinder(0.1, 0.1, 0.02, lit('#3a2a1e'), 0, 0.8, 0.24, 12))
  g.add(model('flower_purpleA', 1, -0.04, 0.22, random() * 6, 0.8), model('flower_redB', 1, 0.05, 0.27, random() * 6, 0.8))
  for (const [dx, dz, s] of [[-0.08, 0.2, 0.9], [0.07, 0.3, 0.75], [0.02, 0.16, 0.6]] as const) {
    g.add(model('hanging_moss', s, dx, dz, random() * 6, 0.8 - 0.48 * s))
  }
  return { solid: g }
}

export const NATURE = {
  bush,
  fern,
  'grass-tuft': grassTuft,
  wildflowers,
  'potted-palm': pottedPalm,
  'jungle-palm': junglePalm,
  'nature-pot': naturePot,
  bamboo,
  'cactus-bed': cactusBed,
  'pumpkin-patch': pumpkinPatch,
  mushrooms,
  'hanging-basket': hangingBasket,
} satisfies Record<string, Builder>
