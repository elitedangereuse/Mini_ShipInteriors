/**
 * Fusion de modèles d'un kit de Kenney (GLB, colorés par matériau, sans texture) en un seul
 * fichier : un nœud racine par modèle, au nom du fichier d'origine, matériaux dédoublonnés. Cf.
 * import-kenney-furniture.mjs (Furniture Kit) et import-kenney-nature.mjs (Nature Kit).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Lit un GLB : son JSON et son tampon binaire. */
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

const pad4 = (n) => (n + 3) & ~3

export function mergePack(dir, models, generator) {
  const out = { asset: { version: '2.0', generator }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [] }
  const bins = []
  let binLength = 0
  const materialIndex = new Map()
  for (const name of models) {
    const { json, bin } = readGlb(join(dir, `${name}.glb`))
    if (json.images?.length || json.textures?.length) throw new Error(`${name} : textures non prises en charge`)
    // Tampon : copié tel quel, aligné sur 4 octets.
    const base = binLength
    bins.push(bin)
    binLength += bin.length
    const padding = pad4(binLength) - binLength
    if (padding) bins.push(Buffer.alloc(padding)), (binLength += padding)
    const views = json.bufferViews.map((v) => {
      out.bufferViews.push({ ...v, buffer: 0, byteOffset: (v.byteOffset ?? 0) + base })
      return out.bufferViews.length - 1
    })
    const accessors = json.accessors.map((a) => {
      const copy = { ...a }
      if (a.bufferView !== undefined) copy.bufferView = views[a.bufferView]
      out.accessors.push(copy)
      return out.accessors.length - 1
    })
    const materials = (json.materials ?? []).map((m) => {
      const key = JSON.stringify(m)
      if (!materialIndex.has(key)) {
        out.materials.push(m)
        materialIndex.set(key, out.materials.length - 1)
      }
      return materialIndex.get(key)
    })
    const meshes = json.meshes.map((m) => {
      out.meshes.push({
        ...m,
        primitives: m.primitives.map((p) => {
          const q = { ...p, attributes: Object.fromEntries(Object.entries(p.attributes).map(([k, v]) => [k, accessors[v]])) }
          if (p.indices !== undefined) q.indices = accessors[p.indices]
          if (p.material !== undefined) q.material = materials[p.material]
          return q
        }),
      })
      return out.meshes.length - 1
    })
    const nodeBase = out.nodes.length
    for (const n of json.nodes) {
      const copy = { ...n }
      if (n.mesh !== undefined) copy.mesh = meshes[n.mesh]
      if (n.children) copy.children = n.children.map((c) => c + nodeBase)
      out.nodes.push(copy)
    }
    // Un nœud racine au nom du modèle, qui porte les racines de sa scène.
    const roots = json.scenes[json.scene ?? 0].nodes.map((i) => i + nodeBase)
    out.nodes.push({ name, children: roots })
    out.scenes[0].nodes.push(out.nodes.length - 1)
  }
  out.buffers.push({ byteLength: binLength })
  const jsonBuf = Buffer.from(JSON.stringify(out), 'utf8')
  const jsonPad = Buffer.concat([jsonBuf, Buffer.alloc(pad4(jsonBuf.length) - jsonBuf.length, 0x20)])
  const binBuf = Buffer.concat(bins)
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
  return Buffer.concat([header, chunk(0x4e4f534a, jsonPad), chunk(0x004e4942, binBuf)])
}

