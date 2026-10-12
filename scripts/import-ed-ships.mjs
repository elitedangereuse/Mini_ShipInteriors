#!/usr/bin/env node
/**
 * Importe les vaisseaux d'Elite Dangerous (trafic spatial, hangar) d'après les modèles 3D
 * imprimables de Kahnindustries (« … 2 Part (Elite Dangerous) », Thingiverse, CC BY 3.0) :
 * un GLB allégé par vaisseau dans public/assets/ships/, nez vers +z, dessus vers +y, en mètres
 * (les modèles d'origine sont à l'échelle 1, en mètres).
 *
 * Pour chaque vaisseau : le STL entier est lu dans son archive, ses sommets soudés, puis le
 * maillage est allégé (simplificateur de meshoptimizer, fourni avec three.js), orienté, centré,
 * et chaque face reçoit une peinture (coque, panneaux, liseré, verrière, réacteurs) d'après des
 * zones propres au vaisseau (cf. PAINT). Les infos utiles au jeu (dimensions, verrière, tuyères)
 * vont dans les « extras » du nœud, que GLTFLoader range dans userData. Cf. src/ships/.
 *
 * Usage : node scripts/import-ed-ships.mjs <dossier des archives .zip> [--raw <dossier>] [id…]
 *   --raw : écrit les maillages allégés tels quels (axes d'origine, sans peinture), pour régler
 *           l'orientation.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { MeshoptSimplifier } from 'three/examples/jsm/libs/meshopt_simplifier.module.js'

/** Les vaisseaux : archive, fichier du modèle entier, page d'origine et licence. */
export const SHIPS = [
  { id: 'sidewinder', name: 'Sidewinder Mk I', maker: 'Faulcon DeLacy', zip: 'Sidewinder_2_Part_Elite_Dangerous.zip', file: 'files/Sidewinder_New.stl', thing: 3381354 },
  { id: 'eagle', name: 'Eagle Mk II', maker: 'Core Dynamics', zip: 'Eagle_2_Part_Elite_Dangerous.zip', file: 'files/Eagle.stl', thing: 3125546 },
  { id: 'imperial-eagle', name: 'Imperial Eagle', maker: 'Gutamaya', zip: 'Imperial_Eagle_2_Part_Elite_Dangerous.zip', file: 'files/Imperial_Eagle.stl', thing: 3381403 },
  { id: 'viper-mk3', name: 'Viper Mk III', maker: 'Faulcon DeLacy', zip: 'Viper_Mk3_2_Part_(Elite_Dangerous).zip', file: 'files/Viper_MK_III.stl', license: 'CC' },
  { id: 'viper-mk4', name: 'Viper Mk IV', maker: 'Faulcon DeLacy', zip: 'Viper_Mk4_2_Part_Elite_Dangerous.zip', file: 'files/Viper_4.stl', thing: 3182123 },
  { id: 'cobra-mk3', name: 'Cobra Mk III', maker: 'Faulcon DeLacy', zip: 'Cobra_MKIII_2_Part_Elite_Dangerous.zip', file: 'files/Cobra_MKIII.stl', thing: 3382983 },
  { id: 'cobra-mk4', name: 'Cobra Mk IV', maker: 'Faulcon DeLacy', zip: 'Cobra_MKIV_2_Part_(Elite_Dangerous).zip', file: 'files/Cobra_MKIV.stl', license: 'CC' },
  { id: 'adder', name: 'Adder', maker: 'Zorgon Peterson', zip: 'Adder_2_Part_Elite_Dangerous.zip', file: 'files/Adder_V2.stl', thing: 3134574 },
  { id: 'diamondback-scout', name: 'Diamondback Scout', maker: 'Lakon Spaceways', zip: 'Diamondback_Scout_2_Part_Elite_Dangerous.zip', file: 'files/Diamondback_Scout.stl', thing: 3358052 },
  { id: 'diamondback-explorer', name: 'Diamondback Explorer', maker: 'Lakon Spaceways', zip: 'Diamondback_Explorer_2_Part_Elite_Dangerous.zip', file: 'files/Diamondback_Explorer.stl', thing: 3572407 },
  { id: 'imperial-courier', name: 'Imperial Courier', maker: 'Gutamaya', zip: 'Imperial_Courier_2_Part_Elite_Dangerous.zip', file: 'files/Imperial_Courier.stl', thing: 3663105 },
  { id: 'vulture', name: 'Vulture', maker: 'Core Dynamics', zip: 'Vulture_2_Part_Elite_Dangerous.zip', file: 'files/Vulture.stl', thing: 3505015 },
  { id: 'asp-explorer', name: 'Asp Explorer', maker: 'Lakon Spaceways', zip: 'ASP_Explorer_2_Part_Elite_Dangerous.zip', file: 'files/ASP_Explorer.stl', thing: 3687930 },
  { id: 'keelback', name: 'Keelback', maker: 'Lakon Spaceways', zip: 'Keelback_2_Part_Elite_Dangerous.zip', file: 'files/Keelback.stl', thing: 3493591 },
  { id: 'type-6', name: 'Type-6 Transporter', maker: 'Lakon Spaceways', zip: 'Type-6_2_Part_Elite_Dangerous.zip', file: 'files/Type-6.stl', thing: 3365219 },
  { id: 'dolphin', name: 'Dolphin', maker: 'Saud Kruger', zip: 'Dolphin_2_Part_Elite_Dangerous.zip', file: 'files/Dolphin.stl', thing: 3376313 },
  { id: 'fer-de-lance', name: 'Fer-de-Lance', maker: 'Zorgon Peterson', zip: 'Fer_De_Lance_2_Part_Elite_Dangerous.zip', file: 'files/Fer_De_Lance.stl', thing: 3424789 },
  { id: 'mamba', name: 'Mamba', maker: 'Zorgon Peterson', zip: 'Mamba_2_Part_Elite_Dangerous.zip', file: 'files/Mamba_Fat.stl', thing: 3632426 },
  { id: 'krait-mk2', name: 'Krait Mk II', maker: 'Faulcon DeLacy', zip: 'Krait_MKII_2_Part_(Elite_Dangerous).zip', file: 'files/Krait_MK2.stl', license: 'CC BY-SA' },
  { id: 'krait-phantom', name: 'Krait Phantom', maker: 'Faulcon DeLacy', zip: 'Krait Phantom 2 Part (Elite Dangerous) - 3823396.zip', file: 'files/Krait_Phantom.stl', thing: 3823396 },
  { id: 'alliance-chieftain', name: 'Alliance Chieftain', maker: 'Lakon Spaceways', zip: 'Alliance_Chieftain_2_Part_Elite_Dangerous.zip', file: 'files/Alliance_Chieftain.stl', thing: 3519242 },
  { id: 'alliance-crusader', name: 'Alliance Crusader', maker: 'Lakon Spaceways', zip: 'Alliance+Crusader+2+Part+(Elite+Dangerous).zip', file: 'files/Alliance_Crusader.stl', license: 'CC' },
  { id: 'federal-dropship', name: 'Federal Dropship', maker: 'Core Dynamics', zip: 'Federal_Dropship_2_Part_(Elite_Dangerous).zip', file: 'files/Federal_Dropship.stl', license: 'CC' },
  { id: 'federal-assault-ship', name: 'Federal Assault Ship', maker: 'Core Dynamics', zip: 'Federal_Assault_Ship_2_Part_Elite_Dangerous.zip', file: 'files/Federal_Assault_Ship.stl', thing: 3587778 },
  { id: 'type-7', name: 'Type-7 Transporter', maker: 'Lakon Spaceways', zip: 'Type-7_Transporter_2_Part_Elite_Dangerous.zip', file: 'files/Type-7_Transporter.stl', thing: 3655113 },
  { id: 'python', name: 'Python', maker: 'Faulcon DeLacy', zip: 'Python_2_Part_Elite_Dangerous.zip', file: 'files/Python.stl', thing: 3413730 },
  { id: 'orca', name: 'Orca', maker: 'Saud Kruger', zip: 'Orca_2_Part_Elite_Dangerous.zip', file: 'files/Orca.stl', thing: 3524233 },
  { id: 'imperial-clipper', name: 'Imperial Clipper', maker: 'Gutamaya', zip: 'Imperial_Clipper_2_Part_Elite_Dangerous.zip', file: 'files/Imperial_Clipper.stl', thing: 3673356 },
  { id: 'type-9', name: 'Type-9 Heavy', maker: 'Lakon Spaceways', zip: 'Type-9_Heavy_2_Part_Elite_Dangerous.zip', file: 'files/Type-9_Heavy_Fat.stl', thing: 3618927 },
  { id: 'type-10', name: 'Type-10 Defender', maker: 'Lakon Spaceways', zip: 'type_10_defender.zip', file: 'Type-10_Defender.stl', license: 'CC' },
  { id: 'federal-corvette', name: 'Federal Corvette', maker: 'Core Dynamics', zip: 'Federal_Corvette_2_Part_Elite_Dangerous.zip', file: 'files/Federal_Corvette.stl', thing: 3485024 },
  { id: 'imperial-cutter', name: 'Imperial Cutter', maker: 'Gutamaya', zip: 'Imperial_Cutter_2_Part_Elite_Dangerous.zip', file: 'files/Imperial_Cutter.stl', thing: 3548302 },
]

/**
 * Orientation (si le nez n'est pas vers -y dans le fichier d'origine), livrée et zones de chaque
 * vaisseau (cf. paint) : verrière (glass), tuyères (engine), liserés (trim), panneaux sombres (dark).
 */
export const PAINT = {
  sidewinder: {
    livery: 'faulcon',
    zones: {
      glass: [{ u: [-0.16, 0.16], v: [0.6, 1], w: [0.2, 0.64] }],
      engine: [{ u: [0.32, 0.62], v: [0.28, 0.6], w: [0, 0.06], mirror: true }],
    },
  },
  eagle: {
    livery: 'core',
    zones: {
      glass: [{ u: [-0.13, 0.13], v: [0.7, 1], w: [0.48, 0.8] }],
    },
    nozzles: [{ u: 0.465, v: 0.605, du: 0.07, dv: 0.09, shape: 'oct', mirror: true }],
  },
  'imperial-eagle': {
    livery: 'gutamaya',
    zones: {
      glass: [{ u: [-0.13, 0.13], v: [0.7, 1], w: [0.48, 0.8] }],
      engine: [{ u: [0.86, 1], v: [0.2, 0.62], w: [0, 0.35], mirror: true }],
      trim: [{ u: [0.86, 1], w: [0.44, 0.56], mirror: true }],
    },
  },
  'viper-mk3': {
    livery: 'faulcon',
    zones: {
      glass: [{ u: [-0.2, 0.2], v: [0.8, 1], w: [0.28, 0.5] }],
    },
    nozzles: [{ u: 0.79, v: 0.52, du: 0.09, dv: 0.1, shape: 'rect', mirror: true }],
  },
  'viper-mk4': {
    livery: 'faulcon',
    nose: '+y',
    zones: { glass: [{ u: [-0.14, 0.14], v: [0.82, 1], w: [0.26, 0.48] }] },
    nozzles: [{ u: 0.8, v: 0.49, du: 0.075, dv: 0.075, shape: 'rect', mirror: true }],
  },
  'cobra-mk3': {
    livery: 'faulcon',
    zones: { glass: [{ u: [-0.16, 0.16], v: [0.5, 0.95], w: [0.68, 0.86] }] },
    nozzles: [{ u: 0.27, v: 0.62, du: 0.19, dv: 0.25, shape: 'rect', mirror: true }],
  },
  'cobra-mk4': {
    livery: 'faulcon',
    zones: { glass: [{ u: [-0.15, 0.15], v: [0.55, 1], w: [0.7, 0.88] }] },
    nozzles: [{ u: 0.22, v: 0.4, du: 0.14, dv: 0.12, shape: 'rect', mirror: true }],
  },
  adder: {
    livery: 'faulcon',
    zones: { glass: [{ u: [-0.22, 0.22], v: [0.45, 0.75], w: [0.62, 0.86] }] },
    nozzles: [{ u: 0.31, v: 0.35, du: 0.11, dv: 0.14, shape: 'oct', mirror: true }],
  },
  'diamondback-scout': {
    livery: 'diamondback',
    nose: '+y',
    zones: { glass: [{ u: [-0.13, 0.13], v: [0.7, 1], w: [0.55, 0.78] }] },
    nozzles: [{ u: 0.454, v: 0.38, du: 0.108, dv: 0.106, mirror: true }, { u: 0, v: 0.5, du: 0.094, dv: 0.093 }],
  },
  'diamondback-explorer': {
    livery: 'diamondback',
    zones: { glass: [{ u: [-0.13, 0.13], v: [0.68, 1], w: [0.55, 0.78] }] },
    nozzles: [{ u: 0.52, v: 0.38, du: 0.1, dv: 0.107, mirror: true }, { u: 0, v: 0.486, du: 0.12, dv: 0.127 }],
  },
  'imperial-courier': {
    livery: 'gutamaya',
    zones: {
      glass: [{ u: [-0.14, 0.14], v: [0.8, 1], w: [0.58, 0.8] }],
      trim: [{ u: [0.82, 1], w: [0.4, 0.5], mirror: true }],
    },
    nozzles: [{ u: 0.23, v: 0.48, du: 0.09, dv: 0.14, shape: 'oct', mirror: true }, { u: 0.9, v: 0.25, du: 0.06, dv: 0.12, shape: 'oct', mirror: true }],
  },
  vulture: {
    livery: 'core',
    zones: { glass: [{ u: [-0.14, 0.14], v: [0.38, 0.72], w: [0.84, 1] }] },
    nozzles: [{ u: 0.47, v: 0.44, du: 0.16, dv: 0.13, shape: 'rect', mirror: true }],
  },
  'asp-explorer': {
    livery: 'lakon',
    zones: { glass: [{ u: [-0.22, 0.22], v: [0.3, 0.75], w: [0.82, 1] }] },
    nozzles: [{ u: 0.4, v: 0.62, du: 0.067, dv: 0.086, mirror: true }, { u: 0.4, v: 0.45, du: 0.067, dv: 0.086, mirror: true }],
  },
  keelback: {
    livery: 'lakon',
    zones: { glass: [{ u: [-0.13, 0.13], v: [0.5, 0.85], w: [0.9, 1] }] },
    nozzles: [{ u: 0.507, v: 0.5, du: 0.081, dv: 0.109, mirror: true }, { u: 0.346, v: 0.5, du: 0.081, dv: 0.109, mirror: true }],
  },
  'type-6': {
    livery: 'lakon',
    nose: '+y',
    zones: { glass: [{ u: [-0.18, 0.18], v: [0.45, 0.8], w: [0.9, 1] }] },
    nozzles: [{ u: 0.49, v: 0.64, du: 0.15, dv: 0.17, shape: 'rect', mirror: true }],
  },
  dolphin: {
    livery: 'saud',
    nose: '-x',
    zones: {
      glass: [{ u: [-0.45, 0.45], v: [0.45, 0.95], w: [0.86, 1] }, { u: [0.8, 1], v: [0.56, 0.68], w: [0.3, 0.76], mirror: true, any: true }],
    },
    nozzles: [{ u: 0.28, v: 0.52, du: 0.054, dv: 0.064, mirror: true }],
  },
  'fer-de-lance': {
    livery: 'zorgon',
    zones: { glass: [{ u: [-0.1, 0.1], v: [0.6, 1], w: [0.48, 0.72] }] },
    nozzles: [{ u: 0.49, v: 0.37, du: 0.07, dv: 0.12, shape: 'oct', mirror: true }],
  },
  mamba: {
    livery: 'zorgon',
    zones: { glass: [{ u: [-0.13, 0.13], v: [0.5, 1], w: [0.66, 0.82] }] },
    nozzles: [{ u: 0.333, v: 0.62, du: 0.08, dv: 0.18, mirror: true }, { u: 0.494, v: 0.41, du: 0.06, dv: 0.13, mirror: true }],
  },
  'krait-mk2': {
    livery: 'faulcon',
    zones: { glass: [{ u: [-0.09, 0.09], v: [0.6, 1], w: [0.7, 0.86] }] },
    nozzles: [0.292, 0.211, 0.13].flatMap((u) => [0.78, 0.5].map((v) => ({ u, v, du: 0.035, dv: 0.094, mirror: true }))),
  },
  'krait-phantom': {
    livery: 'faulcon',
    zones: { glass: [{ u: [-0.09, 0.09], v: [0.6, 1], w: [0.72, 0.88] }] },
    nozzles: [0.246, 0.176, 0.106, 0.036].map((u) => ({ u, v: 0.66, du: 0.03, dv: 0.073, mirror: true })),
  },
  'alliance-chieftain': {
    livery: 'alliance',
    zones: { glass: [{ u: [-0.12, 0.12], v: [0.55, 0.95], w: [0.78, 0.92] }] },
    nozzles: [{ u: 0.735, v: 0.43, du: 0.06, dv: 0.11, mirror: true }, { u: 0.91, v: 0.25, du: 0.06, dv: 0.11, mirror: true }],
  },
  'alliance-crusader': {
    livery: 'alliance',
    zones: { glass: [{ u: [-0.12, 0.12], v: [0.55, 0.95], w: [0.78, 0.92] }] },
    nozzles: [{ u: 0.735, v: 0.43, du: 0.06, dv: 0.11, mirror: true }, { u: 0.91, v: 0.25, du: 0.06, dv: 0.11, mirror: true }],
  },
  'federal-dropship': {
    livery: 'core',
    zones: { glass: [{ u: [-0.13, 0.13], v: [0.65, 1], w: [0.68, 0.84] }] },
    nozzles: [{ u: 0.213, v: 0.52, du: 0.1, dv: 0.17, shape: 'rect', mirror: true }],
  },
  'federal-assault-ship': {
    livery: 'core',
    zones: { glass: [{ u: [-0.13, 0.13], v: [0.65, 1], w: [0.68, 0.84] }] },
    nozzles: [{ u: 0.3, v: 0.55, du: 0.165, dv: 0.13, shape: 'rect', mirror: true }],
  },
  'type-7': {
    livery: 'lakon',
    zones: { glass: [{ u: [-0.2, 0.2], v: [0.55, 0.95], w: [0.9, 1] }] },
    nozzles: [{ u: 0.44, v: 0.74, du: 0.075, dv: 0.084, mirror: true }, { u: 0.44, v: 0.61, du: 0.054, dv: 0.06, mirror: true }],
  },
  python: {
    livery: 'faulcon',
    zones: { glass: [{ u: [-0.1, 0.1], v: [0.7, 1], w: [0.66, 0.84] }] },
    nozzles: [{ u: 0.386, v: 0.37, du: 0.054, dv: 0.088, shape: 'oct', mirror: true }, { u: 0.265, v: 0.37, du: 0.054, dv: 0.088, shape: 'oct', mirror: true }],
  },
  orca: {
    livery: 'saud',
    zones: {
      glass: [{ u: [-0.4, 0.4], v: [0.6, 1], w: [0.86, 0.97] }, { u: [0.8, 1], v: [0.5, 0.75], w: [0.2, 0.86], mirror: true, any: true }],
    },
    nozzles: [{ u: 0.386, v: 0.38, du: 0.067, dv: 0.075, mirror: true }, { u: 0.238, v: 0.38, du: 0.067, dv: 0.075, mirror: true }],
  },
  'imperial-clipper': {
    livery: 'gutamaya',
    zones: {
      glass: [{ u: [-0.13, 0.13], v: [0.5, 0.95], w: [0.82, 0.95] }],
      trim: [{ u: [0.88, 1], w: [0.15, 0.25], mirror: true }],
    },
    nozzles: [{ u: 0.195, v: 0.59, du: 0.06, dv: 0.126, shape: 'oct', mirror: true }, { u: 0.9, v: 0.33, du: 0.04, dv: 0.086, shape: 'oct', mirror: true }, { u: 0.9, v: 0.155, du: 0.04, dv: 0.086, shape: 'oct', mirror: true }],
  },
  'type-9': {
    livery: 'lakon',
    zones: { glass: [{ u: [-0.12, 0.12], v: [0.05, 0.5], w: [0.94, 1] }] },
    nozzles: [{ u: 0.373, v: 0.63, du: 0.1, dv: 0.18, mirror: true }],
  },
  'type-10': {
    livery: 'lakon',
    colors: { hull: '#a9ab9f', belly: '#7f8177' },
    zones: { glass: [{ u: [-0.12, 0.12], v: [0.1, 0.5], w: [0.94, 1] }] },
    nozzles: [0.642, 0.521, 0.386, 0.265].map((u) => ({ u, v: 0.52, du: 0.054, dv: 0.093, shape: 'rect', mirror: true })),
  },
  'federal-corvette': {
    livery: 'core',
    zones: { glass: [{ u: [-0.08, 0.08], v: [0.6, 1], w: [0.8, 0.92] }] },
    nozzles: [{ u: 0.41, v: 0.38, du: 0.19, dv: 0.2, shape: 'rect', mirror: true }],
  },
  'imperial-cutter': {
    livery: 'gutamaya',
    zones: {
      glass: [{ u: [-0.1, 0.1], v: [0.55, 1], w: [0.78, 0.92] }],
      trim: [{ u: [0.88, 1], w: [0.28, 0.36], mirror: true }],
    },
    nozzles: [
      { u: 0, v: 0.23, du: 0.1, dv: 0.17, shape: 'oct' },
      { u: 0.32, v: 0.48, du: 0.054, dv: 0.09, shape: 'oct', mirror: true },
      { u: 0, v: 0.57, du: 0.04, dv: 0.067, shape: 'oct' },
      { u: 0.91, v: 0.48, du: 0.054, dv: 0.09, shape: 'oct', mirror: true },
    ],
  },
}

// ---------------------------------------------------------------- Lecture

/** Un fichier d'une archive zip (méthodes « stocké » et « deflate »). */
function unzip(path, name) {
  const b = readFileSync(path)
  let eocd = b.length - 22
  while (eocd >= 0 && b.readUInt32LE(eocd) !== 0x06054b50) eocd--
  if (eocd < 0) throw new Error(`${path} : pas une archive zip`)
  const count = b.readUInt16LE(eocd + 10)
  let p = b.readUInt32LE(eocd + 16)
  for (let i = 0; i < count; i++) {
    if (b.readUInt32LE(p) !== 0x02014b50) throw new Error(`${path} : répertoire central illisible`)
    const method = b.readUInt16LE(p + 10), size = b.readUInt32LE(p + 20)
    const nameLen = b.readUInt16LE(p + 28), extraLen = b.readUInt16LE(p + 30), commentLen = b.readUInt16LE(p + 32)
    const local = b.readUInt32LE(p + 42)
    const entry = b.toString('utf8', p + 46, p + 46 + nameLen)
    if (entry === name) {
      const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28)
      const data = b.subarray(start, start + size)
      if (method === 0) return Buffer.from(data)
      if (method === 8) return inflateRawSync(data)
      throw new Error(`${path} : ${name} compressé en méthode ${method}`)
    }
    p += 46 + nameLen + extraLen + commentLen
  }
  throw new Error(`${path} : ${name} introuvable`)
}

/** Triangles d'un STL (binaire ou texte) : 9 flottants par triangle. */
function readStl(b) {
  const n = b.readUInt32LE(80)
  if (84 + n * 50 === b.length) {
    const pos = new Float32Array(n * 9)
    for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) pos[i * 9 + k] = b.readFloatLE(84 + i * 50 + 12 + k * 4)
    return pos
  }
  const out = []
  const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g
  for (let m; (m = re.exec(b.toString('latin1'))); ) out.push(+m[1], +m[2], +m[3])
  return new Float32Array(out)
}

/** Soude les sommets confondus (à 0,1 mm près) : maillage indexé, triangles dégénérés ôtés. */
function weld(soup) {
  const map = new Map()
  const positions = []
  const indices = []
  const q = (v) => Math.round(v * 1e4)
  const tri = [0, 0, 0]
  for (let t = 0; t < soup.length; t += 9) {
    for (let k = 0; k < 3; k++) {
      const x = soup[t + k * 3], y = soup[t + k * 3 + 1], z = soup[t + k * 3 + 2]
      const key = `${q(x)},${q(y)},${q(z)}`
      let i = map.get(key)
      if (i === undefined) {
        i = positions.length / 3
        positions.push(x, y, z)
        map.set(key, i)
      }
      tri[k] = i
    }
    if (tri[0] !== tri[1] && tri[1] !== tri[2] && tri[0] !== tri[2]) indices.push(tri[0], tri[1], tri[2])
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) }
}

/** Ne garde que les sommets utilisés, dans l'ordre d'apparition. */
function compact(positions, indices) {
  const remap = new Int32Array(positions.length / 3).fill(-1)
  const out = []
  const idx = new Uint32Array(indices.length)
  for (let i = 0; i < indices.length; i++) {
    const v = indices[i]
    if (remap[v] < 0) {
      remap[v] = out.length / 3
      out.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2])
    }
    idx[i] = remap[v]
  }
  return { positions: new Float32Array(out), indices: idx }
}

// ---------------------------------------------------------------- Écriture du GLB

const pad4 = (n) => (n + 3) & ~3

/**
 * GLB d'un vaisseau : un nœud (nom = id, extras = infos du jeu), un maillage, une primitive par
 * peinture, toutes sur les mêmes positions. Pas de normales : facettes (flatShading).
 */
function writeGlb(id, positions, groups, extras) {
  const chunks = []
  let length = 0
  const push = (buf) => {
    const offset = length
    chunks.push(buf)
    length += buf.length
    const pad = pad4(length) - length
    if (pad) chunks.push(Buffer.alloc(pad)), (length += pad)
    return offset
  }
  const gltf = {
    asset: { version: '2.0', generator: 'mini-interior import-ed-ships' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: id, mesh: 0, extras }],
    meshes: [{ name: id, primitives: [] }],
    materials: [],
    accessors: [],
    bufferViews: [],
    buffers: [],
  }
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], positions[i + k])
    max[k] = Math.max(max[k], positions[i + k])
  }
  const posBuf = Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength)
  gltf.bufferViews.push({ buffer: 0, byteOffset: push(posBuf), byteLength: posBuf.length, target: 34962 })
  gltf.accessors.push({ bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', min, max })
  const big = positions.length / 3 > 65535
  for (const g of groups) {
    if (!g.indices.length) continue
    const arr = big ? new Uint32Array(g.indices) : new Uint16Array(g.indices)
    const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength)
    gltf.bufferViews.push({ buffer: 0, byteOffset: push(buf), byteLength: buf.length, target: 34963 })
    gltf.accessors.push({ bufferView: gltf.bufferViews.length - 1, componentType: big ? 5125 : 5123, count: arr.length, type: 'SCALAR' })
    gltf.materials.push({
      name: g.name,
      pbrMetallicRoughness: { baseColorFactor: [...g.color, 1], metallicFactor: 0, roughnessFactor: 1 },
      ...(g.emissive ? { emissiveFactor: g.emissive } : {}),
    })
    gltf.meshes[0].primitives.push({ attributes: { POSITION: 0 }, indices: gltf.accessors.length - 1, material: gltf.materials.length - 1 })
  }
  gltf.buffers.push({ byteLength: length })
  const json = Buffer.from(JSON.stringify(gltf), 'utf8')
  const jsonPad = Buffer.concat([json, Buffer.alloc(pad4(json.length) - json.length, 0x20)])
  const bin = Buffer.concat(chunks)
  const chunk = (type, data) => {
    const h = Buffer.alloc(8)
    h.writeUInt32LE(data.length, 0)
    h.writeUInt32LE(type, 4)
    return Buffer.concat([h, data])
  }
  const header = Buffer.alloc(12)
  header.writeUInt32LE(0x46546c67, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(12 + 8 + jsonPad.length + 8 + bin.length, 8)
  return Buffer.concat([header, chunk(0x4e4f534a, jsonPad), chunk(0x004e4942, bin)])
}

// ---------------------------------------------------------------- Allègement

/** Triangles visés : assez pour garder la silhouette et les grands pans, sans plus. */
const TARGET_TRIS = 6000
/** Écart toléré, relatif à la taille du vaisseau. */
const TARGET_ERROR = 0.004

function simplify(mesh, target = TARGET_TRIS, error = TARGET_ERROR) {
  const [indices, err] = MeshoptSimplifier.simplify(mesh.indices, mesh.positions, 3, Math.min(mesh.indices.length, target * 3), error, [])
  return { ...compact(mesh.positions, indices), error: err }
}

/**
 * Allège chaque zone de peinture à part, bords figés : les limites entre peintures (verrière,
 * tuyères…) restent celles, nettes, du modèle détaillé. Le budget se partage au prorata.
 */
function simplifyGroups(positions, groups, target = TARGET_TRIS, error = TARGET_ERROR) {
  const total = groups.reduce((s, g) => s + g.indices.length, 0) / 3
  let worst = 0
  const out = groups.map((g) => {
    if (!g.indices.length) return { ...g, indices: [] }
    const idx = new Uint32Array(g.indices)
    const want = Math.max(16, Math.round((target * idx.length) / 3 / total)) * 3
    const [s, e] = MeshoptSimplifier.simplify(idx, positions, 3, Math.min(idx.length, want), error, ['LockBorder'])
    worst = Math.max(worst, e)
    return { ...g, indices: s }
  })
  // Sommets utilisés, renumérotés pour toutes les zones.
  const remap = new Int32Array(positions.length / 3).fill(-1)
  const pos = []
  for (const g of out) {
    g.indices = Array.from(g.indices, (v) => {
      if (remap[v] < 0) {
        remap[v] = pos.length / 3
        pos.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2])
      }
      return remap[v]
    })
  }
  return { positions: new Float32Array(pos), groups: out, error: worst }
}

// ---------------------------------------------------------------- Orientation

const AXES = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+y': [0, 1, 0], '-y': [0, -1, 0], '+z': [0, 0, 1], '-z': [0, 0, -1] }

/**
 * Remet le vaisseau dans le repère du jeu : nez vers +z, dessus vers +y, centré sur sa boîte.
 * Dans les fichiers d'origine, le nez est presque toujours vers -y et le dessus vers +z.
 */
function orient(positions, nose = '-y', up = '+z') {
  const n = AXES[nose], u = AXES[up]
  const s = [u[1] * n[2] - u[2] * n[1], u[2] * n[0] - u[0] * n[2], u[0] * n[1] - u[1] * n[0]]
  const out = new Float32Array(positions.length)
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2]
    out[i] = x * s[0] + y * s[1] + z * s[2]
    out[i + 1] = x * u[0] + y * u[1] + z * u[2]
    out[i + 2] = x * n[0] + y * n[1] + z * n[2]
  }
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < out.length; i += 3) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], out[i + k])
    max[k] = Math.max(max[k], out[i + k])
  }
  const c = min.map((v, k) => (v + max[k]) / 2)
  for (let i = 0; i < out.length; i += 3) for (let k = 0; k < 3; k++) out[i + k] -= c[k]
  return { positions: out, size: max.map((v, k) => v - min[k]) }
}

// ---------------------------------------------------------------- Peinture

/** Livrées par défaut, d'après les vaisseaux du jeu (couleurs sRGB). */
const LIVERIES = {
  // Faulcon DeLacy : blanc cassé, panneaux gris acier.
  faulcon: { hull: '#d8dad6', belly: '#a9adb0', dark: '#4d5359', trim: '#7e8790' },
  // Core Dynamics : gris militaire bleuté.
  core: { hull: '#b8bec4', belly: '#8d949b', dark: '#3b4249', trim: '#6c7f94' },
  // Gutamaya : ivoire, noir laqué, filets d'or.
  gutamaya: { hull: '#efece4', belly: '#c9c4b8', dark: '#26282c', trim: '#c9a24c' },
  // Lakon : gris sable, gris foncé, jaune de chantier.
  lakon: { hull: '#cbc6b9', belly: '#9d988c', dark: '#4e4b45', trim: '#e0ad38' },
  // Diamondback : acier canon.
  diamondback: { hull: '#8a9098', belly: '#646a72', dark: '#2e3338', trim: '#c4cad0' },
  // Alliance : gris vert, liserés bleus.
  alliance: { hull: '#b3b9ad', belly: '#8a9086', dark: '#3c433d', trim: '#6f97bd' },
  // Zorgon Peterson : graphite et argent.
  zorgon: { hull: '#7d828a', belly: '#5d6168', dark: '#2a2d32', trim: '#c7ccd2' },
  // Saud Kruger : blanc nacré, gris bleu, or.
  saud: { hull: '#f2f1ec', belly: '#cfd3d8', dark: '#7d8a9a', trim: '#c9a55a' },
}
const GLASS = '#14273b'
const ENGINE = '#8fd0ff'

const srgb = (hex) => [1, 3, 5].map((i) => {
  const c = parseInt(hex.slice(i, i + 2), 16) / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
})

/**
 * Zones d'un vaisseau, en coordonnées réduites : u de -1 (tribord) à 1 (bâbord) (x / demi-
 * largeur), v de 0 (ventre) à 1 (dos), w de 0 (poupe) à 1 (nez). Chaque zone : { u, v, w }
 * (intervalles, absents = tout), `mirror` pour la recopier de l'autre bord, et pour les zones
 * de verrière et de réacteurs une orientation des faces (vers le haut/l'avant, vers l'arrière).
 */
const inside = (r, u, v, w) => (!r.u || (u >= r.u[0] && u <= r.u[1]) || (r.mirror && -u >= r.u[0] && -u <= r.u[1])) && (!r.v || (v >= r.v[0] && v <= r.v[1])) && (!r.w || (w >= r.w[0] && w <= r.w[1]))

/** Les zones d'un vaisseau, celles en miroir dédoublées : boîtes en mètres ({ min, max } par axe). */
function boxes(zones, size) {
  const h = size.map((s) => s / 2)
  const out = []
  for (const [kind, list] of Object.entries(zones ?? {})) {
    for (const r of list) {
      const box = (u) => ({
        kind,
        min: [u ? u[0] * h[0] : -Infinity, r.v ? -h[1] + r.v[0] * size[1] : -Infinity, r.w ? -h[2] + r.w[0] * size[2] : -Infinity],
        max: [u ? u[1] * h[0] : Infinity, r.v ? -h[1] + r.v[1] * size[1] : Infinity, r.w ? -h[2] + r.w[1] * size[2] : Infinity],
      })
      out.push(box(r.u))
      if (r.mirror && r.u) out.push(box([-r.u[1], -r.u[0]]))
    }
  }
  return out
}

/**
 * Coupe les triangles le long des faces des zones : chaque morceau est alors tout entier dedans
 * ou dehors, et les peintures ont des bords nets. Les sommets créés sur une arête sont partagés
 * par les deux triangles qui la bordent (le maillage reste soudé).
 */
function cut(positions, indices, zoneBoxes) {
  const pos = Array.from(positions)
  let tris = Array.from(indices)
  const made = new Map()
  const vertexOn = (i, j, k, d) => {
    const [a, b] = i < j ? [i, j] : [j, i]
    const key = `${a},${b},${k},${d}`
    let v = made.get(key)
    if (v === undefined) {
      const t = (d - pos[a * 3 + k]) / (pos[b * 3 + k] - pos[a * 3 + k])
      v = pos.length / 3
      for (let c = 0; c < 3; c++) pos.push(pos[a * 3 + c] + (pos[b * 3 + c] - pos[a * 3 + c]) * t)
      pos[v * 3 + k] = d
      made.set(key, v)
    }
    return v
  }
  const eps = 1e-5
  for (const box of zoneBoxes) {
    for (let k = 0; k < 3; k++) {
      for (const d of [box.min[k], box.max[k]]) {
        if (!Number.isFinite(d)) continue
        const next = []
        for (let t = 0; t < tris.length; t += 3) {
          const tri = [tris[t], tris[t + 1], tris[t + 2]]
          const s = tri.map((v) => pos[v * 3 + k] - d)
          // Seuls les triangles qui chevauchent la boîte sur les deux autres axes sont coupés.
          let near = s.some((x) => x < -eps) && s.some((x) => x > eps)
          for (let o = 0; near && o < 3; o++) {
            if (o === k) continue
            const lo = Math.min(...tri.map((v) => pos[v * 3 + o])), hi = Math.max(...tri.map((v) => pos[v * 3 + o]))
            if (hi < box.min[o] || lo > box.max[o]) near = false
          }
          if (!near) {
            next.push(...tri)
            continue
          }
          // Sutherland-Hodgman : un polygone de chaque côté du plan, puis en éventail.
          const sides = [[], []]
          for (let e = 0; e < 3; e++) {
            const p = tri[e], q = tri[(e + 1) % 3], sp = s[e], sq = s[(e + 1) % 3]
            if (sp >= 0) sides[0].push(p)
            if (sp <= 0) sides[1].push(p)
            if ((sp > 0 && sq < 0) || (sp < 0 && sq > 0)) {
              const m = vertexOn(p, q, k, d)
              sides[0].push(m)
              sides[1].push(m)
            }
          }
          for (const poly of sides) for (let f = 1; f + 1 < poly.length; f++) next.push(poly[0], poly[f], poly[f + 1])
        }
        tris = next
      }
    }
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(tris) }
}

/** Cases du plan au sol, sur la plus grande dimension du vaisseau. */
const PLAN_CELLS = 48

/**
 * Plan au sol (vu de dessus) : une grille sur la boîte du vaisseau, et dans chaque case la hauteur
 * du dessous et du dessus de la coque (m, depuis le bas du vaisseau ; -1 : rien). Le jeu en tire
 * les collisions (ce qui descend plus bas que la tête), le train et la place de l'escabeau.
 * Rangée par rangée, de la poupe au nez (z croissant), chaque rangée de tribord à bâbord (x croissant).
 */
function groundPlan(positions, indices, size) {
  const cell = Math.max(size[0], size[2]) / PLAN_CELLS
  const cols = Math.ceil(size[0] / cell), rows = Math.ceil(size[2] / cell)
  const x0 = -size[0] / 2, z0 = -size[2] / 2, y0 = -size[1] / 2
  const low = new Float32Array(cols * rows).fill(Infinity), high = new Float32Array(cols * rows).fill(-Infinity)
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3
    const ax = positions[a], az = positions[a + 2], bx = positions[b], bz = positions[b + 2], cx = positions[c], cz = positions[c + 2]
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz)
    if (Math.abs(d) < 1e-9) continue
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / cell)), i1 = Math.min(cols - 1, Math.floor((Math.max(ax, bx, cx) - x0) / cell))
    const j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - z0) / cell)), j1 = Math.min(rows - 1, Math.floor((Math.max(az, bz, cz) - z0) / cell))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        // Centre de la case, puis ses quatre quarts : les pièces fines (ailes, antennes) comptent aussi.
        for (const [fx, fz] of [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
          const x = x0 + (i + fx) * cell, z = z0 + (j + fz) * cell
          const l0 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d
          const l1 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d
          const l2 = 1 - l0 - l1
          if (l0 < 0 || l1 < 0 || l2 < 0) continue
          const y = l0 * positions[a + 1] + l1 * positions[b + 1] + l2 * positions[c + 1] - y0
          const k = j * cols + i
          if (y < low[k]) low[k] = y
          if (y > high[k]) high[k] = y
        }
      }
    }
  }
  const round = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : -1)
  return { cell: +cell.toFixed(4), cols, rows, low: Array.from(low, round), high: Array.from(high, round) }
}

/** Point le plus en arrière du modèle en (x, y), vu de la poupe ; null s'il n'y a rien. */
function rearmost(positions, indices, x, y) {
  let best = Infinity
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3
    const x0 = positions[a], y0 = positions[a + 1], x1 = positions[b], y1 = positions[b + 1], x2 = positions[c], y2 = positions[c + 1]
    if ((x < x0 && x < x1 && x < x2) || (x > x0 && x > x1 && x > x2) || (y < y0 && y < y1 && y < y2) || (y > y0 && y > y1 && y > y2)) continue
    const d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
    if (Math.abs(d) < 1e-12) continue
    const l0 = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) / d
    const l1 = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) / d
    const l2 = 1 - l0 - l1
    if (l0 < 0 || l1 < 0 || l2 < 0) continue
    best = Math.min(best, l0 * positions[a + 2] + l1 * positions[b + 2] + l2 * positions[c + 2])
  }
  return Number.isFinite(best) ? best : null
}

/**
 * Tuyères : un disque lumineux (rond, octogone ou rectangle arrondi) posé au fond de chacune,
 * tourné vers l'arrière. Chaque tuyère : centre { u, v } et demi-tailles { du, dv } (repère réduit
 * vu de la poupe, cf. zones), `mirror` pour l'autre bord. Le fond est cherché sur le modèle
 * détaillé : la surface la plus en arrière sous le disque.
 */
function nozzleDiscs(positions, indices, size, specs) {
  const [hx, hy] = [size[0] / 2, size[1] / 2]
  const pos = [], idx = [], list = []
  const all = (specs ?? []).flatMap((n) => (n.mirror ? [n, { ...n, u: -n.u }] : [n]))
  for (const n of all) {
    const cx = n.u * hx, cy = -hy + n.v * size[1], rx = n.du * hx, ry = n.dv * size[1]
    // Le fond : le point le plus en arrière sous tout le disque (une grille de 5 × 5 points).
    let z = Infinity
    for (let sx = -0.9; sx <= 0.91; sx += 0.45) {
      for (let sy = -0.9; sy <= 0.91; sy += 0.45) {
        const hit = rearmost(positions, indices, cx + sx * rx, cy + sy * ry)
        if (hit !== null) z = Math.min(z, hit)
      }
    }
    if (!Number.isFinite(z)) z = -size[2] / 2
    z -= 0.03
    const sides = n.shape === 'oct' ? 8 : 24
    const base = pos.length / 3
    pos.push(cx, cy, z)
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2 + (n.shape === 'oct' ? Math.PI / 8 : 0)
      const c = Math.cos(a), s = Math.sin(a)
      // Rectangle arrondi : superellipse ; sinon l'ellipse (ou l'octogone) elle-même.
      const e = n.shape === 'rect' ? 0.3 : 1
      pos.push(cx + rx * Math.sign(c) * Math.abs(c) ** e, cy + ry * Math.sign(s) * Math.abs(s) ** e, z)
    }
    for (let k = 0; k < sides; k++) idx.push(base, base + 1 + ((k + 1) % sides), base + 1 + k)
    list.push([cx, cy, z, rx, ry].map((v) => +v.toFixed(2)))
  }
  return { positions: pos, indices: idx, list }
}

/** Centre, aire et normale de chaque triangle. */
function* faces(positions, indices) {
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3
    const e1 = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]]
    const e2 = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]]
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
    const len = Math.hypot(...n) || 1
    yield {
      t,
      c: [(positions[a] + positions[b] + positions[c]) / 3, (positions[a + 1] + positions[b + 1] + positions[c + 1]) / 3, (positions[a + 2] + positions[b + 2] + positions[c + 2]) / 3],
      area: len / 2,
      n: [n[0] / len, n[1] / len, n[2] / len],
    }
  }
}

/**
 * Zones peintes, sur le modèle détaillé : verrière, tuyères, liserés, panneaux sombres ; le reste
 * est la coque (« base »), partagée ensuite entre dos et ventre (cf. shade).
 */
function zone(positions, indices, size, spec) {
  const zones = spec.zones ?? {}
  const groups = { base: [], dark: [], trim: [], glass: [], engine: [] }
  const glassFaces = []
  const [hx, hy, hz] = size.map((s) => s / 2)
  for (const f of faces(positions, indices)) {
    const [cx, cy, cz] = f.c, n = f.n
    const u = cx / hx, v = (cy + hy) / (2 * hy), w = (cz + hz) / (2 * hz)
    let g = 'base'
    if ((zones.engine ?? []).some((r) => inside(r, u, v, w)) && n[2] < -(spec.engineFacing ?? 0.8)) g = 'engine'
    else if ((zones.glass ?? []).some((r) => inside(r, u, v, w) && (r.any || n[1] + Math.max(0, n[2]) > (spec.glassFacing ?? 0.25)))) g = 'glass'
    else if ((zones.trim ?? []).some((r) => inside(r, u, v, w))) g = 'trim'
    else if ((zones.dark ?? []).some((r) => inside(r, u, v, w))) g = 'dark'
    groups[g].push(indices[f.t], indices[f.t + 1], indices[f.t + 2])
    if (g === 'glass') glassFaces.push([cx, cy, cz, f.area])
  }
  return { groups: Object.entries(groups).map(([name, idx]) => ({ name, indices: idx })), canopy: glassFaces.length ? centroid(glassFaces) : null }
}

/** Couleurs du modèle allégé : la coque se partage entre dos et ventre selon l'orientation des faces. */
function shade(positions, groups, spec) {
  const livery = { ...LIVERIES[spec.livery ?? 'faulcon'], ...(spec.colors ?? {}) }
  const colors = { ...livery, glass: spec.glass ?? GLASS, engine: spec.engine ?? ENGINE }
  const out = []
  for (const g of groups) {
    if (g.name !== 'base') {
      out.push(g)
      continue
    }
    const hull = [], belly = []
    for (const f of faces(positions, g.indices)) (f.n[1] < -0.45 ? belly : hull).push(g.indices[f.t], g.indices[f.t + 1], g.indices[f.t + 2])
    out.push({ name: 'hull', indices: hull }, { name: 'belly', indices: belly })
  }
  const engineFaces = []
  for (const f of faces(positions, out.find((g) => g.name === 'engine')?.indices ?? [])) engineFaces.push([...f.c, f.area])
  return {
    groups: out.map((g) => ({
      ...g,
      color: srgb(colors[g.name]),
      emissive: g.name === 'engine' ? srgb(colors.engine) : g.name === 'glass' ? srgb('#173a5c') : null,
    })),
    engines: nozzles(engineFaces),
  }
}

function centroid(faces) {
  let x = 0, y = 0, z = 0, a = 0
  for (const f of faces) x += f[0] * f[3], y += f[1] * f[3], z += f[2] * f[3], a += f[3]
  return [x / a, y / a, z / a].map((n) => +n.toFixed(2))
}

/** Tuyères peintes (zones) : faces regroupées par proximité ; [x, y, z, rx, ry] comme les disques. */
function nozzles(faces) {
  const out = []
  const left = [...faces]
  while (left.length) {
    const cluster = [left.pop()]
    for (let grown = true; grown; ) {
      grown = false
      for (let i = left.length - 1; i >= 0; i--) {
        if (cluster.some((f) => Math.hypot(f[0] - left[i][0], f[1] - left[i][1]) < 1.6 && Math.abs(f[2] - left[i][2]) < 3)) {
          cluster.push(...left.splice(i, 1))
          grown = true
        }
      }
    }
    const area = cluster.reduce((s, f) => s + f[3], 0)
    if (area < 0.5) continue
    const c = centroid(cluster)
    const r = +Math.sqrt(area / Math.PI).toFixed(2)
    out.push([...c, r, r])
  }
  return out.sort((a, b) => a[0] - b[0])
}

// ---------------------------------------------------------------- Programme

const args = process.argv.slice(2)
const dir = args.shift()
if (!dir) {
  console.error('Usage : node scripts/import-ed-ships.mjs <dossier des archives .zip> [--raw <dossier>] [id…]')
  process.exit(1)
}
let raw = null
const only = []
while (args.length) {
  const a = args.shift()
  if (a === '--raw') raw = args.shift()
  else only.push(a)
}
await MeshoptSimplifier.ready
const dest = raw ?? fileURLToPath(new URL('../public/assets/ships/', import.meta.url))
mkdirSync(dest, { recursive: true })
const credits = []
const credit = (s) => s.thing
  ? `Kahnindustries, https://www.thingiverse.com/thing:${s.thing}, CC BY 3.0`
  : `Kahnindustries (David Williams), « ${s.zip.replace(/\.zip$/, '')} », licence ${s.license}`
for (const ship of SHIPS) {
  if (only.length && !only.includes(ship.id)) continue
  const t0 = Date.now()
  const soup = readStl(unzip(join(dir, ship.zip), ship.file))
  const welded = weld(soup)
  let tris, error
  if (raw) {
    const light = simplify(welded)
    ;[tris, error] = [light.indices.length / 3, light.error]
    writeFileSync(join(dest, `${ship.id}.glb`), writeGlb(ship.id, light.positions, [{ name: 'hull', color: [0.8, 0.8, 0.8], indices: light.indices }], { name: ship.name }))
  } else {
    const spec = PAINT[ship.id] ?? {}
    const oriented = orient(welded.positions, spec.nose, spec.up)
    const size = oriented.size
    const { positions, indices } = cut(oriented.positions, welded.indices, boxes(spec.zones, size))
    const zoned = zone(positions, indices, size, spec)
    const light = simplifyGroups(positions, zoned.groups)
    const discs = nozzleDiscs(positions, indices, size, spec.nozzles)
    if (discs.list.length) {
      // Les disques s'ajoutent au modèle allégé, dans la peinture des tuyères.
      const base = light.positions.length / 3
      light.positions = Float32Array.from([...light.positions, ...discs.positions])
      light.groups.find((g) => g.name === 'engine').indices.push(...discs.indices.map((i) => i + base))
    }
    const painted = shade(light.positions, light.groups, spec)
    if (discs.list.length) painted.engines = discs.list
    ;[tris, error] = [painted.groups.reduce((s, g) => s + g.indices.length / 3, 0), light.error]
    const extras = {
      name: ship.name,
      maker: ship.maker,
      size: size.map((v) => +v.toFixed(2)),
      engines: painted.engines,
      ...(zoned.canopy ? { canopy: zoned.canopy } : {}),
      plan: groundPlan(positions, indices, size),
      credit: credit(ship),
    }
    writeFileSync(join(dest, `${ship.id}.glb`), writeGlb(ship.id, light.positions, painted.groups, extras))
    credits.push(`${ship.name} : ${extras.credit}`)
  }
  console.log(`${ship.id.padEnd(22)} ${String(soup.length / 9).padStart(7)} → ${String(tris).padStart(5)} triangles (écart ${error.toFixed(4)}), ${Date.now() - t0} ms`)
}
if (!raw && !only.length) {
  writeFileSync(join(dest, 'CREDITS.txt'), [
    "Vaisseaux d'Elite Dangerous (Frontier Developments), allégés et peints pour Mini Interior par",
    'scripts/import-ed-ships.mjs, d\'après les modèles imprimables « 2 Part (Elite Dangerous) » de',
    'Kahnindustries (David Williams). Licences des modèles d\'origine :',
    '',
    ...credits,
    '',
  ].join('\n'))
}
