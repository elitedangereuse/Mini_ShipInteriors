#!/usr/bin/env node
/**
 * Importe l'« Animated Fish Pack » de Quaternius (CC0, https://quaternius.com/packs/animatedfish.html)
 * en un seul fichier : public/assets/fish/quaternius-fish.glb. Un nœud racine par modèle (fish1,
 * fish2, fish3, dolphin, manta, shark, whale), centré sur l'origine, long de 1 le long de z ; un
 * matériau par partie du modèle, au nom de cette partie (« Top », « Bottom », « Fins »…), sans
 * texture : le jeu les repeint pour faire ses espèces (cf. shared/fishing.js et src/fishing/).
 *
 * Le pack est en FBX, OBJ et Blend ; on part des OBJ (les poissons du jeu ne nagent pas avec
 * l'animation du pack : ils frétillent, cf. src/fishing/models.ts).
 *
 * Usage : node scripts/import-quaternius-fish.mjs <dossier du pack décompressé>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

/** Fichier du pack → nom du nœud. */
export const MODELS = { Fish1: 'fish1', Fish2: 'fish2', Fish3: 'fish3', Dolphin: 'dolphin', 'Manta ray': 'manta', Shark: 'shark', Whale: 'whale' }

const dir = process.argv[2]
if (!dir) {
  console.error('Usage : node scripts/import-quaternius-fish.mjs <dossier de l\'Animated Fish Pack>')
  process.exit(1)
}

/** Couleurs des matériaux d'un .mtl (Kd, linéaire). */
function readMtl(path) {
  const colors = {}
  let name = null
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const p = line.trim().split(/\s+/)
    if (p[0] === 'newmtl') name = p[1]
    else if (p[0] === 'Kd' && name) colors[name] = p.slice(1, 4).map(Number)
  }
  return colors
}

/** Triangles d'un .obj, par matériau : positions et normales, à plat (sommets non partagés). */
function readObj(path) {
  const v = [], vn = [], parts = new Map()
  let current = null
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const p = line.trim().split(/\s+/)
    if (p[0] === 'v') v.push(p.slice(1, 4).map(Number))
    else if (p[0] === 'vn') vn.push(p.slice(1, 4).map(Number))
    else if (p[0] === 'usemtl') {
      if (!parts.has(p[1])) parts.set(p[1], { positions: [], normals: [] })
      current = parts.get(p[1])
    } else if (p[0] === 'f') {
      const corners = p.slice(1).map((c) => {
        const [vi, , ni] = c.split('/').map(Number)
        return [v[vi - 1], vn[ni - 1]]
      })
      // Éventail : les faces du pack sont convexes.
      for (let i = 1; i + 1 < corners.length; i++) {
        for (const [pos, normal] of [corners[0], corners[i], corners[i + 1]]) {
          current.positions.push(...pos)
          current.normals.push(...normal)
        }
      }
    }
  }
  return parts
}

const pad4 = (n) => (n + 3) & ~3
const out = { asset: { version: '2.0', generator: 'mini-interior import-quaternius-fish' }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [] }
const bins = []
let binLength = 0

function accessor(values) {
  const data = Buffer.from(new Float32Array(values).buffer)
  out.bufferViews.push({ buffer: 0, byteOffset: binLength, byteLength: data.length, target: 34962 })
  bins.push(data)
  binLength += data.length
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < values.length; i++) {
    min[i % 3] = Math.min(min[i % 3], values[i])
    max[i % 3] = Math.max(max[i % 3], values[i])
  }
  out.accessors.push({ bufferView: out.bufferViews.length - 1, componentType: 5126, count: values.length / 3, type: 'VEC3', min, max })
  return out.accessors.length - 1
}

for (const [file, name] of Object.entries(MODELS)) {
  const colors = readMtl(join(dir, 'OBJ', `${file}.mtl`))
  const parts = readObj(join(dir, 'OBJ', `${file}.obj`))
  // Centré, long de 1 le long de z.
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (const { positions } of parts.values()) {
    for (let i = 0; i < positions.length; i++) {
      min[i % 3] = Math.min(min[i % 3], positions[i])
      max[i % 3] = Math.max(max[i % 3], positions[i])
    }
  }
  const scale = 1 / (max[2] - min[2])
  const primitives = []
  for (const [part, { positions, normals }] of parts) {
    const fitted = positions.map((value, i) => (value - (min[i % 3] + max[i % 3]) / 2) * scale)
    out.materials.push({ name: part, pbrMetallicRoughness: { baseColorFactor: [...colors[part], 1], metallicFactor: 0, roughnessFactor: 1 } })
    primitives.push({ attributes: { POSITION: accessor(fitted), NORMAL: accessor(normals) }, material: out.materials.length - 1 })
  }
  out.meshes.push({ name, primitives })
  out.nodes.push({ name, mesh: out.meshes.length - 1 })
  out.scenes[0].nodes.push(out.nodes.length - 1)
}

out.buffers.push({ byteLength: binLength })
const json = Buffer.from(JSON.stringify(out))
const jsonChunk = Buffer.concat([json, Buffer.alloc(pad4(json.length) - json.length, 0x20)])
const binChunk = Buffer.concat([...bins, Buffer.alloc(pad4(binLength) - binLength)])
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
writeFileSync(new URL('quaternius-fish.glb', dest), glb)
writeFileSync(new URL('License.txt', dest), readFileSync(join(dir, 'License.txt')))
console.log(`${Object.keys(MODELS).length} modèles, ${(glb.length / 1024).toFixed(0)} Ko`)
