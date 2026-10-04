#!/usr/bin/env node
/**
 * Importe une sélection du « Cute Fish Pack » de Quaternius (CC0, https://quaternius.com/packs/cutefish.html)
 * en un seul fichier : public/assets/fish/quaternius-cute-fish.glb. Même forme que le premier pack
 * (cf. import-quaternius-fish.mjs) : un nœud racine par modèle, centré sur l'origine, long de 1 le
 * long de z, le nez vers +z ; un matériau par partie du modèle, au nom de cette partie (« Main »,
 * « Fins », « Light », « Dark », « Teeth », « Eyes »…), à la couleur du pack, avivée (le pack est
 * fait pour un éclairage plus fort que celui du jeu) : une espèce du jeu garde ces couleurs ou en
 * repeint certaines (cf. shared/fishing.js et src/fishing/models.ts).
 *
 * On part des GLB (un par poisson, « Anglerfish.glb »… : ceux de https://poly.pizza/u/Quaternius,
 * ou les FBX du pack convertis). Ils sont animés par un squelette : on fige la pose de repos, les
 * poissons du jeu frétillent sans l'animation du pack. Pas de normales dans le fichier : le jeu
 * rend les poissons à facettes.
 *
 * Usage : node scripts/import-quaternius-cute-fish.mjs <dossier des GLB>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

/** Fichier du pack → nom du nœud. */
export const MODELS = {
  Anglerfish: 'angler', ArmoredCatfish: 'catfish', Betta: 'betta', BlackLionFish: 'lionfish-black', Blobfish: 'blobfish',
  BlueTang: 'tang', ButterflyFish: 'butterfly', Cowfish: 'cowfish', Flatfish: 'flatfish', FlowerHorn: 'flowerhorn',
  GoblinShark: 'goblin', Goldfish: 'goldfish', Humphead: 'humphead', Koi: 'koi', Lionfish: 'lionfish',
  MandarinFish: 'mandarin', MoorishIdol: 'idol', ParrotFish: 'parrot', Piranha: 'piranha', Puffer: 'puffer',
  RoyalGramma: 'gramma', Sunfish: 'sunfish', Swordfish: 'swordfish', Tetra: 'tetra', Tuna: 'tuna',
}

const dir = process.argv[2]
if (!dir) {
  console.error('Usage : node scripts/import-quaternius-cute-fish.mjs <dossier des GLB du Cute Fish Pack>')
  process.exit(1)
}

/**
 * Nom d'une partie : celui du matériau sans le nom du poisson (« Koi_Fins » → « Fins »). La lampe
 * de la baudroie (« Light », à côté de « Anglerfish_Light ») devient « Lamp ».
 */
function partName(material) {
  if (material === 'Light') return 'Lamp'
  const name = material.includes('_') ? material.slice(material.indexOf('_') + 1) : material
  return /^[A-Za-z]+\d?$/.test(name) ? name : 'Extra'
}

/** Couleur d'un matériau du pack, plus claire et plus vive (linéaire) ; les noirs restent noirs. */
function vivid(color) {
  const hsl = color.getHSL({})
  return new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 1.2), Math.min(0.9, hsl.l * 1.3)).toArray()
}

/** Triangles d'un fichier, par partie, dans la pose de repos : positions à plat et couleur. */
async function readModel(path) {
  const data = readFileSync(path)
  const gltf = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '')
  gltf.scene.updateMatrixWorld(true)
  const parts = new Map()
  const v = new THREE.Vector3()
  gltf.scene.traverse((mesh) => {
    if (!mesh.isMesh) return
    mesh.skeleton?.update()
    const position = mesh.geometry.getAttribute('position'), index = mesh.geometry.getIndex()
    const part = partName(mesh.material.name)
    if (!parts.has(part)) parts.set(part, { positions: [], color: vivid(mesh.material.color) })
    const { positions } = parts.get(part)
    for (let i = 0; i < (index ?? position).count; i++) {
      mesh.getVertexPosition(index ? index.getX(i) : i, v).applyMatrix4(mesh.matrixWorld)
      positions.push(v.x, v.y, v.z)
    }
  })
  return parts
}

const pad4 = (n) => (n + 3) & ~3
const out = { asset: { version: '2.0', generator: 'mini-interior import-quaternius-cute-fish' }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [] }
const bins = []
let binLength = 0

function view(data, target) {
  out.bufferViews.push({ buffer: 0, byteOffset: binLength, byteLength: data.length, target })
  bins.push(data, Buffer.alloc(pad4(data.length) - data.length))
  binLength += pad4(data.length)
  return out.bufferViews.length - 1
}

for (const [file, name] of Object.entries(MODELS)) {
  const parts = await readModel(join(dir, `${file}.glb`))
  // Centré, long de 1 le long de z.
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (const { positions } of parts.values()) {
    for (let i = 0; i < positions.length; i++) {
      min[i % 3] = Math.min(min[i % 3], positions[i])
      max[i % 3] = Math.max(max[i % 3], positions[i])
    }
  }
  const scale = 1 / (max[2] - min[2])
  // Le nez vers +z : les yeux sont à l'avant.
  const eyes = parts.get('Eyes')?.positions ?? []
  let eyeZ = 0
  for (let i = 2; i < eyes.length; i += 3) eyeZ += eyes[i] - (min[2] + max[2]) / 2
  const turn = eyeZ < 0 ? -1 : 1
  // Sommets partagés par tout le modèle (soudés au millième de sa longueur), un index par partie.
  const vertices = [], ids = new Map(), primitives = []
  for (const [part, { positions, color }] of parts) {
    const indices = []
    for (let i = 0; i < positions.length; i += 3) {
      // Demi-tour autour de y : x et z changent de signe, les faces gardent leur sens.
      const p = [0, 1, 2].map((a) => Math.round((positions[i + a] - (min[a] + max[a]) / 2) * scale * (a === 1 ? 1 : turn) * 1000) / 1000)
      const key = p.join(',')
      if (!ids.has(key)) {
        ids.set(key, vertices.length / 3)
        vertices.push(...p)
      }
      indices.push(ids.get(key))
    }
    // Les triangles écrasés par la soudure n'ont plus de surface.
    const kept = []
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = indices.slice(i, i + 3)
      if (a !== b && b !== c && a !== c) kept.push(a, b, c)
    }
    out.accessors.push({ bufferView: view(Buffer.from(new Uint16Array(kept).buffer), 34963), componentType: 5123, count: kept.length, type: 'SCALAR' })
    out.materials.push({ name: part, pbrMetallicRoughness: { baseColorFactor: [...color, 1], metallicFactor: 0, roughnessFactor: 1 } })
    primitives.push({ attributes: { POSITION: -1 }, indices: out.accessors.length - 1, material: out.materials.length - 1 })
  }
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < vertices.length; i++) {
    lo[i % 3] = Math.min(lo[i % 3], vertices[i])
    hi[i % 3] = Math.max(hi[i % 3], vertices[i])
  }
  out.accessors.push({ bufferView: view(Buffer.from(new Float32Array(vertices).buffer), 34962), componentType: 5126, count: vertices.length / 3, type: 'VEC3', min: lo, max: hi })
  for (const p of primitives) p.attributes.POSITION = out.accessors.length - 1
  out.meshes.push({ name, primitives })
  out.nodes.push({ name, mesh: out.meshes.length - 1 })
  out.scenes[0].nodes.push(out.nodes.length - 1)
  console.log(`${name} : ${[...parts.keys()].join(', ')} ; ${vertices.length / 3} sommets ; ${(hi[0] - lo[0]).toFixed(2)} × ${(hi[1] - lo[1]).toFixed(2)} × ${(hi[2] - lo[2]).toFixed(2)}${turn < 0 ? ' (retourné)' : ''}`)
}

out.buffers.push({ byteLength: binLength })
const json = Buffer.from(JSON.stringify(out))
const jsonChunk = Buffer.concat([json, Buffer.alloc(pad4(json.length) - json.length, 0x20)])
const binChunk = Buffer.concat(bins)
const header = Buffer.alloc(12)
header.writeUInt32LE(0x46546c67, 0)
header.writeUInt32LE(2, 4)
header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8)
const chunk = (type, data) => {
  const h = Buffer.alloc(8)
  h.writeUInt32LE(data.length, 0)
  h.writeUInt32LE(type, 4)
  return Buffer.concat([h, data])
}
const glb = Buffer.concat([header, chunk(0x4e4f534a, jsonChunk), chunk(0x004e4942, binChunk)])

const dest = new URL('../public/assets/fish/', import.meta.url)
mkdirSync(dest, { recursive: true })
writeFileSync(new URL('quaternius-cute-fish.glb', dest), glb)
console.log(`${Object.keys(MODELS).length} modèles, ${(glb.length / 1024).toFixed(0)} Ko`)
