#!/usr/bin/env node
/**
 * Importe le mobilier d'extérieur des quartiers (arbres, haies, clôtures, fontaine, bancs,
 * réverbères, feu de camp…) depuis plusieurs kits de Kenney (CC0), en un seul fichier :
 * public/assets/furniture/kenney-outdoor.glb. Un nœud par modèle, nommé « <préfixe du kit>-<fichier> »
 * (le Nature Kit garde ses noms : « tree_oak », « rock_largeA »…). Cf. src/furniture/outdoor.ts.
 *
 * Le Nature Kit colore par matériau ; les autres kits par une image (colormap.png) dont chaque
 * triangle vise une case unie. Ici tout finit coloré par matériau : les triangles d'un modèle sont
 * rangés par couleur, un matériau « c-rrggbb » par couleur, sans texture. Les transformations des
 * nœuds sont appliquées aux sommets : chaque modèle n'a plus qu'un maillage.
 *
 * Usage : node scripts/import-kenney-outdoor.mjs [dossier « 3D assets » de la collection]
 *         (par défaut : assets/3D assets)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'

/** Kits : dossier, préfixe des nœuds, modèles. */
export const KITS = [
  {
    dir: 'Nature Kit/Models/GLTF format', prefix: '',
    models: [
      'tree_oak', 'tree_oak_fall', 'tree_default', 'tree_default_fall', 'tree_detailed', 'tree_detailed_fall', 'tree_fat', 'tree_fat_fall',
      'tree_tall', 'tree_thin', 'tree_thin_fall', 'tree_plateau', 'tree_cone', 'tree_blocks', 'tree_simple', 'tree_pineDefaultA', 'tree_pineRoundC',
      'tree_pineTallA_detailed', 'tree_pineSmallA', 'tree_pineGroundA', 'tree_palmTall', 'tree_palmDetailedTall', 'rock_largeC', 'rock_largeE',
      'rock_tallA', 'rock_tallD', 'stone_largeD', 'stone_tallB', 'stump_roundDetailed', 'stump_old', 'stump_oldTall', 'log_large', 'log_stack',
      'log_stackLarge', 'mushroom_red', 'mushroom_redTall', 'mushroom_tan', 'mushroom_tanTall', 'fence_simple', 'fence_planks', 'fence_gate',
      'fence_corner', 'path_stone', 'path_stoneCircle', 'path_wood', 'bridge_wood', 'bridge_woodRound', 'bridge_stone', 'bridge_stoneRound',
      'campfire_stones', 'campfire_logs', 'campfire_bricks', 'tent_detailedOpen', 'tent_smallOpen', 'canoe_paddle', 'statue_block', 'statue_column',
      'statue_columnDamaged', 'statue_head', 'statue_obelisk', 'statue_ring', 'crops_wheatStageB', 'crops_cornStageD',
    ],
  },
  {
    dir: 'Fantasy Town Kit/Models/GLB format', prefix: 'town-',
    models: [
      'fountain-round-detail', 'fountain-square-detail', 'hedge', 'hedge-curved', 'hedge-gate', 'hedge-large', 'hedge-large-curved',
      'hedge-large-gate', 'lantern', 'cart', 'cart-high', 'stall-green', 'stall-red', 'tree', 'tree-high-crooked', 'tree-high-round',
    ],
  },
  {
    dir: 'Graveyard Kit/Models/GLB format', prefix: 'yard-',
    models: [
      'bench', 'iron-fence', 'iron-fence-border', 'iron-fence-border-gate', 'iron-fence-curve', 'lightpost-single', 'lightpost-double',
      'lightpost-all', 'lantern-glass', 'lantern-candle', 'hay-bale', 'hay-bale-bundled', 'pumpkin', 'pumpkin-carved', 'pumpkin-tall',
      'pumpkin-tall-carved', 'urn-round', 'urn-square', 'stone-wall', 'stone-wall-column', 'stone-wall-curve', 'brick-wall', 'trunk',
      'pillar-obelisk',
    ],
  },
  {
    dir: 'Holiday Kit/Models/GLB format', prefix: 'holiday-',
    models: [
      'bench', 'snowman', 'snowman-hat', 'sled', 'tree-decorated', 'tree-decorated-snow', 'tree-snow-a', 'reindeer', 'lantern', 'present-a-cube',
      'present-b-round', 'present-a-rectangle', 'snow-pile',
    ],
  },
  {
    dir: 'City Kit - Suburban/Models/GLB format', prefix: 'suburb-',
    models: [
      'planter',
    ],
  },
  {
    dir: 'Survival Kit/Models/GLB format', prefix: 'camp-',
    models: [
      'tent', 'tent-canvas', 'signpost',
    ],
  },
  {
    dir: 'Platformer Kit/Models/GLB format', prefix: 'toy-',
    models: [
      'flowers', 'flowers-tall', 'hedge', 'hedge-corner', 'mushrooms', 'tree', 'tree-snow', 'sign', 'fence-rope', 'rocks', 'stones',
    ],
  },
]

// ---------------------------------------------------------------- lecture

function readGlb(path) {
  const b = readFileSync(path)
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path} : pas un GLB`)
  let offset = 12, json, bin
  while (offset < b.length) {
    const len = b.readUInt32LE(offset), type = b.readUInt32LE(offset + 4)
    const chunk = b.subarray(offset + 8, offset + 8 + len)
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'))
    else if (type === 0x004e4942) bin = chunk
    offset += 8 + len
  }
  return { json, bin }
}

/** Image PNG (8 bits, RVB, RVBA ou palette, non entrelacée) : ses pixels en RVB. */
function readPng(path) {
  const b = readFileSync(path)
  let o = 8, width = 0, height = 0, type = 0, palette = null
  const idat = []
  while (o < b.length) {
    const len = b.readUInt32BE(o), kind = b.toString('latin1', o + 4, o + 8), data = b.subarray(o + 8, o + 8 + len)
    if (kind === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      type = data[9]
      if (data[8] !== 8 || data[12] !== 0 || ![2, 3, 6].includes(type)) throw new Error(`${path} : format PNG non pris en charge`)
    } else if (kind === 'PLTE') palette = data
    else if (kind === 'IDAT') idat.push(data)
    o += 12 + len
  }
  const bpp = type === 2 ? 3 : type === 6 ? 4 : 1, stride = width * bpp
  const raw = inflateSync(Buffer.concat(idat)), px = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = y * (stride + 1) + 1
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, up = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0
      const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c)
      const predicted = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? up : filter === 3 ? (a + up) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? up : c
      px[y * stride + x] = (raw[line + x] + predicted) & 255
    }
  }
  return {
    /** Couleur au point (u, v) de la texture (origine en haut à gauche, comme glTF). */
    at(u, v) {
      const x = Math.min(width - 1, Math.floor((u - Math.floor(u)) * width)), y = Math.min(height - 1, Math.floor((v - Math.floor(v)) * height))
      const i = y * stride + x * bpp
      return type === 3 ? [palette[px[i] * 3], palette[px[i] * 3 + 1], palette[px[i] * 3 + 2]] : [px[i], px[i + 1], px[i + 2]]
    },
  }
}

const SIZES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }
const READERS = { 5120: ['readInt8', 1], 5121: ['readUInt8', 1], 5122: ['readInt16LE', 2], 5123: ['readUInt16LE', 2], 5125: ['readUInt32LE', 4], 5126: ['readFloatLE', 4] }

/** Valeurs d'un accesseur, à plat. */
function accessor(json, bin, index) {
  const a = json.accessors[index], view = json.bufferViews[a.bufferView]
  const n = SIZES[a.type], [read, bytes] = READERS[a.componentType]
  const stride = view.byteStride || n * bytes, base = (view.byteOffset ?? 0) + (a.byteOffset ?? 0)
  const out = new Array(a.count * n)
  for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) out[i * n + k] = bin[read](base + i * stride + k * bytes)
  return out
}

// ---------------------------------------------------------------- matrices (colonnes d'abord, comme glTF)

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

function multiply(a, b) {
  const out = new Array(16)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]
  return out
}

function localMatrix(node) {
  if (node.matrix) return node.matrix
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = node.scale ?? [1, 1, 1], [tx, ty, tz] = node.translation ?? [0, 0, 0]
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ]
}

// ---------------------------------------------------------------- fusion

const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/**
 * Triangles d'un modèle, rangés par matériau : `groups` associe à une clé de matériau ses sommets
 * (position et normale, déjà placés) et le matériau glTF à écrire.
 */
function collect(dir, name) {
  const { json, bin } = readGlb(join(dir, `${name}.glb`))
  const image = json.images?.[0]?.uri ? readPng(join(dir, json.images[0].uri)) : null
  const groups = new Map()
  const visit = (index, parent) => {
    const node = json.nodes[index], m = multiply(parent, localMatrix(node))
    for (const child of node.children ?? []) visit(child, m)
    if (node.mesh === undefined) return
    for (const p of json.meshes[node.mesh].primitives) {
      const pos = accessor(json, bin, p.attributes.POSITION), nor = accessor(json, bin, p.attributes.NORMAL)
      const uv = p.attributes.TEXCOORD_0 !== undefined ? accessor(json, bin, p.attributes.TEXCOORD_0) : null
      const idx = p.indices !== undefined ? accessor(json, bin, p.indices) : pos.map((_, i) => i).slice(0, pos.length / 3)
      const material = json.materials[p.material], pbr = material.pbrMetallicRoughness ?? {}
      const textured = pbr.baseColorTexture && image && uv
      for (let t = 0; t < idx.length; t += 3) {
        const tri = [idx[t], idx[t + 1], idx[t + 2]]
        let key, out
        if (textured) {
          // Les cases de l'image sont en léger dégradé : arrondies, pour ne pas faire un matériau par triangle.
          const [r, g, b] = image.at((uv[tri[0] * 2] + uv[tri[1] * 2] + uv[tri[2] * 2]) / 3, (uv[tri[0] * 2 + 1] + uv[tri[1] * 2 + 1] + uv[tri[2] * 2 + 1]) / 3).map((v) => Math.min(255, Math.round(v / 16) * 16))
          key = `c-${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
          out = { name: key, pbrMetallicRoughness: { baseColorFactor: [linear(r / 255), linear(g / 255), linear(b / 255), 1], metallicFactor: 0, roughnessFactor: 1 } }
        } else {
          key = `m-${JSON.stringify(material)}`
          out = material
        }
        let group = groups.get(key)
        if (!group) groups.set(key, (group = { material: out, positions: [], normals: [], indices: [], seen: new Map() }))
        for (const v of tri) {
          const id = `${node.mesh}:${json.meshes[node.mesh].primitives.indexOf(p)}:${index}:${v}`
          let at = group.seen.get(id)
          if (at === undefined) {
            at = group.positions.length / 3
            group.seen.set(id, at)
            const [x, y, z] = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]], [nx, ny, nz] = [nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]]
            group.positions.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14])
            // Les kits n'ont que des échelles uniformes : la matrice suffit à tourner la normale.
            const n = [m[0] * nx + m[4] * ny + m[8] * nz, m[1] * nx + m[5] * ny + m[9] * nz, m[2] * nx + m[6] * ny + m[10] * nz], len = Math.hypot(...n) || 1
            group.normals.push(n[0] / len, n[1] / len, n[2] / len)
          }
          group.indices.push(at)
        }
      }
    }
  }
  for (const root of json.scenes[json.scene ?? 0].nodes) visit(root, IDENTITY)
  return [...groups.values()]
}

const pad4 = (n) => (n + 3) & ~3

export function buildPack(root) {
  const out = { asset: { version: '2.0', generator: 'mini-interior import-kenney-outdoor' }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [] }
  const chunks = []
  let length = 0
  const materialIndex = new Map()
  const push = (buffer, target) => {
    out.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: buffer.length, target })
    chunks.push(buffer)
    length += buffer.length
    const padding = pad4(length) - length
    if (padding) chunks.push(Buffer.alloc(padding)), (length += padding)
    return out.bufferViews.length - 1
  }
  let count = 0
  for (const kit of KITS) {
    for (const name of kit.models) {
      const primitives = collect(join(root, kit.dir), name).map((g) => {
        const key = JSON.stringify(g.material)
        if (!materialIndex.has(key)) {
          out.materials.push(g.material)
          materialIndex.set(key, out.materials.length - 1)
        }
        const n = g.positions.length / 3
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
        for (let i = 0; i < g.positions.length; i++) {
          min[i % 3] = Math.min(min[i % 3], g.positions[i])
          max[i % 3] = Math.max(max[i % 3], g.positions[i])
        }
        // Float32 arrondit : les bornes de l'accesseur doivent être celles des valeurs écrites.
        const positions = new Float32Array(g.positions)
        for (let i = 0; i < positions.length; i++) {
          min[i % 3] = Math.min(min[i % 3], positions[i])
          max[i % 3] = Math.max(max[i % 3], positions[i])
        }
        const wide = n > 65535
        out.accessors.push({ bufferView: push(Buffer.from(positions.buffer), 34962), componentType: 5126, count: n, type: 'VEC3', min, max })
        out.accessors.push({ bufferView: push(Buffer.from(new Float32Array(g.normals).buffer), 34962), componentType: 5126, count: n, type: 'VEC3' })
        out.accessors.push({ bufferView: push(Buffer.from((wide ? new Uint32Array(g.indices) : new Uint16Array(g.indices)).buffer), 34963), componentType: wide ? 5125 : 5123, count: g.indices.length, type: 'SCALAR' })
        const a = out.accessors.length
        return { attributes: { POSITION: a - 3, NORMAL: a - 2 }, indices: a - 1, material: materialIndex.get(key) }
      })
      out.meshes.push({ name: kit.prefix + name, primitives })
      out.nodes.push({ name: kit.prefix + name, mesh: out.meshes.length - 1 })
      out.scenes[0].nodes.push(out.nodes.length - 1)
      count++
    }
  }
  out.buffers.push({ byteLength: length })
  const jsonBuf = Buffer.from(JSON.stringify(out), 'utf8')
  const jsonPad = Buffer.concat([jsonBuf, Buffer.alloc(pad4(jsonBuf.length) - jsonBuf.length, 0x20)])
  const binBuf = Buffer.concat(chunks)
  const header = Buffer.alloc(12)
  header.writeUInt32LE(0x46546c67, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(12 + 8 + jsonPad.length + 8 + binBuf.length, 8)
  const chunk = (type, data) => {
    const h = Buffer.alloc(8)
    h.writeUInt32LE(data.length, 0)
    h.writeUInt32LE(type, 4)
    return Buffer.concat([h, data])
  }
  return { glb: Buffer.concat([header, chunk(0x4e4f534a, jsonPad), chunk(0x004e4942, binBuf)]), count, materials: out.materials.length }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ?? fileURLToPath(new URL('../assets/3D assets', import.meta.url))
  const { glb, count, materials } = buildPack(root)
  const dest = new URL('../public/assets/furniture/', import.meta.url)
  writeFileSync(new URL('kenney-outdoor.glb', dest), glb)
  const kits = KITS.map((k) => k.dir.split('/')[0])
  writeFileSync(new URL('License-outdoor.txt', dest), `kenney-outdoor.glb : modèles tirés des kits de Kenney (www.kenney.nl) :\n${kits.map((k) => `  - ${k}`).join('\n')}\n\nLicense: (Creative Commons Zero, CC0)\nhttp://creativecommons.org/publicdomain/zero/1.0/\n\nThis content is free to use in personal, educational and commercial projects.\nSupport us by crediting Kenney or www.kenney.nl (this is not mandatory)\n`)
  console.log(`${count} modèles, ${materials} matériaux, ${(glb.length / 1024).toFixed(0)} Ko`)
}
