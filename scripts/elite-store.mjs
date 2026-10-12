/**
 * La boutique d'Elite Dangerous et ses vignettes, pour les scripts d'import des vaisseaux
 * (import-ed-paints.mjs : les peintures ; import-ed-bare.mjs : les pièces jamais peintes) :
 * la liste des peintures de chaque vaisseau (catégorie Paint Jobs, filtrée par modèle), les
 * vignettes (PNG décodé à la main), leur regroupement par cadrage.
 */
import { inflateSync, deflateSync } from 'node:zlib'

/** Nos vaisseaux, et leur modèle dans le filtre de la boutique. */
export const SHIPS = { sidewinder: 25, eagle: 20, 'imperial-eagle': 197, 'viper-mk3': 24, 'viper-mk4': 196, 'cobra-mk3': 21, 'cobra-mk4': 189, adder: 138, 'diamondback-scout': 172, 'diamondback-explorer': 171, 'imperial-courier': 177, vulture: 133, 'asp-explorer': 19, keelback: 190, 'type-6': 134, dolphin: 192, 'fer-de-lance': 140, mamba: 276, 'krait-mk2': 270, 'krait-phantom': 277, 'alliance-chieftain': 266, 'alliance-crusader': 275, 'federal-dropship': 27, 'federal-assault-ship': 199, 'type-7': 135, python: 26, orca: 137, 'imperial-clipper': 139, 'type-9': 136, 'type-10': 260, 'federal-corvette': 194, 'imperial-cutter': 193 }

/** Les familles de peintures, reconnues à leur nom. */
export const FAM = [
  ['vibrant', /Vibrant Paint Pack/], ['marquess', /Marquess Paint Pack/], ['ruby', /Ruby Anniversary/], ['pulse', /\bPulse\b/], ['stygian', /Stygian/], ['squadron', /Squadron/], ['midnight', /Midnight Black/], ['tactical', /Tactical/], ['pirate', /Pirate Faction/], ['ignition', /Ignition/], ['camo', /\bCamo\b/], ['sonoran', /Sonoran/], ['mojave', /Mojave/], ['colorado', /Colorado/], ['crossfire', /Crossfire/], ['speedway', /Speedway/], ['mohawk', /Mohawk/], ['empire', /\bEmpire\b/], ['osiris', /Osiris/], ['predator', /Predator/], ['slipstream', /Slipstream/], ['snakewrap', /Snake Wrap/], ['razor', /Razor/], ['galvanized', /Galvanized/], ['blackjack', /Blackjack/], ['synth', /Synth/], ['sidestripe', /Sidestripe/], ['independent', /Independent/], ['salvage', /Salvage/], ['overdrive', /Overdrive/], ['polarity', /Polarity/], ['apollo', /Apollo/], ['fusion', /Fusion/], ['medusa', /Medusa/], ['onionhead', /Onionhead/], ['serpent', /Serpent/], ['rattler', /Rattler/], ['militarystripe', /Military Stripe/], ['mechanist', /Mechanist/], ['pharaoh', /Pharaoh/], ['operator', /Operator/], ['militarygreen', /Military Dark Green/], ['militaryblue', /Military Marine Blue/], ['asemic', /Asemic/], ['messenger', /Messenger/], ['icarus', /Icarus/], ['crypsis', /Crypsis/], ['flash', /Vulture Flash/], ['shock', /\bShock\b/], ['lakon', /Lakon Metallic/], ['turbulence', /Turbulence/], ['arrowhead', /Arrowhead/], ['expressway', /Expressway/], ['sheerline', /Sheer Line/], ['aquatic', /Aquatic/], ['taxi', /Taxi/], ['ember', /\bEmber\b/], ['excursion', /Excursion/], ['odyssey', /Odyssey/], ['wayfarer', /Wayfarer/], ['acceleration', /Acceleration/], ['shatter', /Shatter/], ['precision', /Precision/], ['allied', /\bAllied\b/], ['federation', /\bFederation\b/], ['dazzle', /Dazzle/], ['pathfinder', /Pathfinder/], ['emissary', /Emissary/], ['sabotage', /Sabotage/], ['vanguard', /Vanguard/],
]

const STORE = 'https://www.elitedangerous.com'
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36', 'Accept-Language': 'en-GB,en;q=0.9' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(url, tries = 3) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { headers: UA })
      if (r.ok) return r
      if (r.status === 404 || i >= tries) throw new Error(`HTTP ${r.status} ${url}`)
    } catch (e) {
      if (i >= tries || /HTTP 404/.test(e.message)) throw e
    }
    await sleep(800 * (i + 1))
  }
}

// ---------------------------------------------------------------- charge utile Nuxt (devalue)
function unflatten(values) {
  const hydrated = new Array(values.length)
  function hydrate(index) {
    if (index === -1) return undefined
    if (index === -3) return NaN
    if (index === -4) return Infinity
    if (index === -5) return -Infinity
    if (index === -6) return -0
    if (index in hydrated) return hydrated[index]
    const value = values[index]
    if (!value || typeof value !== 'object') hydrated[index] = value
    else if (Array.isArray(value)) {
      if (typeof value[0] === 'string') {
        switch (value[0]) {
          case 'Date': hydrated[index] = new Date(value[1]); break
          case 'Set': { const s = new Set(); hydrated[index] = s; for (let i = 1; i < value.length; i++) s.add(hydrate(value[i])); break }
          case 'Map': { const m = new Map(); hydrated[index] = m; for (let i = 1; i < value.length; i += 2) m.set(hydrate(value[i]), hydrate(value[i + 1])); break }
          case 'Reactive': case 'ShallowReactive': case 'Ref': case 'ShallowRef': case 'EmptyRef': case 'EmptyShallowRef': case 'NuxtError': case 'Island':
            hydrated[index] = hydrate(value[1]); break
          case 'null': { const o = Object.create(null); hydrated[index] = o; for (let i = 1; i < value.length; i += 2) o[value[i]] = hydrate(value[i + 1]); break }
          default: { const a = new Array(value.length); hydrated[index] = a; for (let i = 0; i < value.length; i++) a[i] = typeof value[i] === 'number' ? hydrate(value[i]) : value[i] }
        }
      } else {
        const a = new Array(value.length)
        hydrated[index] = a
        for (let i = 0; i < value.length; i++) if (value[i] !== -2) a[i] = hydrate(value[i])
      }
    } else {
      const o = {}
      hydrated[index] = o
      for (const k in value) o[k] = hydrate(value[k])
    }
    return hydrated[index]
  }
  return hydrate(0)
}

async function nuxt(path) {
  const html = await (await get(STORE + path)).text()
  const m = html.match(/<script type="application\/json"[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!m) throw new Error('pas de données Nuxt : ' + path)
  return unflatten(JSON.parse(m[1])).data
}

export async function listing(model) {
  const out = []
  for (let page = 1; ; page++) {
    const data = await nuxt(`/store/ships/category/180?page_size=90&page=${page}&ship_model=${model}`)
    const list = Object.values(data).find((v) => v && v.products && v.page_size === 90)
    out.push(...list.products)
    if (page >= list.pages) return out
  }
}

export const product = async (slug) => Object.values(await nuxt(`/store/product/${slug}`)).find((v) => v && v.sku && v.title && 'short_description' in v)

// ---------------------------------------------------------------- images (PNG décodé à la main)
const imgUrl = (key, w) => 'https://image-service.zaonce.net/' + Buffer.from(JSON.stringify({ bucket: 'frontier-store-media-sync-production', key: key.replace(/^\//, ''), edits: { toFormat: 'png', resize: { width: w, fit: 'contain' } } })).toString('base64')

export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('pas un PNG')
  let p = 8, w = 0, h = 0, depth = 0, type = 0, palette = null, trns = null
  const idat = []
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), kind = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len)
    if (kind === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; if (data[12]) throw new Error('PNG entrelacé') }
    else if (kind === 'PLTE') palette = data
    else if (kind === 'tRNS') trns = data
    else if (kind === 'IDAT') idat.push(data)
    else if (kind === 'IEND') break
    p += 12 + len
  }
  if (depth !== 8) throw new Error('profondeur ' + depth)
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type]
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * ch, out = new Uint8ClampedArray(w * h * 4), cur = new Uint8Array(stride), prev = new Uint8Array(stride)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0
      let v = row[x]
      if (f === 1) v += a
      else if (f === 2) v += b
      else if (f === 3) v += (a + b) >> 1
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
      cur[x] = v & 255
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4
      if (type === 3) { const i = cur[x]; out[o] = palette[i * 3]; out[o + 1] = palette[i * 3 + 1]; out[o + 2] = palette[i * 3 + 2]; out[o + 3] = trns && i < trns.length ? trns[i] : 255 }
      else if (type === 0 || type === 4) { out[o] = out[o + 1] = out[o + 2] = cur[x * ch]; out[o + 3] = type === 4 ? cur[x * ch + 1] : 255 }
      else { out[o] = cur[x * ch]; out[o + 1] = cur[x * ch + 1]; out[o + 2] = cur[x * ch + 2]; out[o + 3] = ch === 4 ? cur[x * ch + 3] : 255 }
    }
    prev.set(cur)
  }
  return { width: w, height: h, data: out }
}

export const load = async (key, w = 256) => decodePng(Buffer.from(await (await get(imgUrl(key, w))).arrayBuffer()))
export async function loadAny(p, w = 256) {
  for (const key of [p.thumbnail, p.image, ...(p.gallery ?? []).map((g) => g.image)].filter(Boolean)) {
    try { return { im: await load(key, w), key } } catch { /* suivante */ }
  }
  return null
}

export async function pool(tasks, n = 6) {
  const out = new Array(tasks.length)
  let i = 0
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < tasks.length) {
      const k = i++
      try { out[k] = await tasks[k]() } catch { out[k] = null }
    }
  }))
  return out
}

// ---------------------------------------------------------------- vignettes de même cadrage
const lumAt = (d, i) => 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]
function small(im) {
  const S = 64, out = new Float32Array(S * S), sx = im.width / S, sy = im.height / S
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) out[y * S + x] = lumAt(im.data, Math.floor((y + 0.5) * sy) * im.width + Math.floor((x + 0.5) * sx))
  return out
}
function medDiff(a, b) {
  const d = new Float32Array(a.length)
  for (let i = 0; i < a.length; i++) d[i] = Math.abs(a[i] - b[i])
  d.sort()
  return d[d.length >> 1]
}
/** Les images de même cadrage : celles dont la moitié des pixels au moins sont identiques. */
export function groups(items) {
  const same = (a, b) => a.im.width === b.im.width && a.im.height === b.im.height
  const sm = items.map((x) => small(x.im))
  const parent = items.map((_, i) => i)
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) if (same(items[i], items[j]) && medDiff(sm[i], sm[j]) < 2.5) parent[find(i)] = find(j)
  const g = new Map()
  items.forEach((x, i) => { const r = find(i); if (!g.has(r)) g.set(r, []); g.get(r).push(x) })
  return [...g.values()].sort((a, b) => b.length - a.length)
}
/** Ce qui change d'une peinture à l'autre, dans un groupe de même cadrage. */
export function varMask(group, T = 22) {
  const W = group[0].im.width, H = group[0].im.height, N = W * H, n = group.length, mask = new Uint8Array(N)
  for (let i = 0; i < N; i++) {
    let v = 0
    for (let c = 0; c < 3; c++) {
      let s = 0, s2 = 0
      for (const x of group) { const t = x.im.data[i * 4 + c]; s += t; s2 += t * t }
      v += s2 / n - (s / n) ** 2
    }
    mask[i] = Math.sqrt(v / 3) > T ? 1 : 0
  }
  const out = new Uint8Array(N)
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x
    if (!mask[i]) continue
    let c = 0
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) c += mask[i + dy * W + dx]
    out[i] = c >= 5 ? 1 : 0
  }
  return out
}

// ---------------------------------------------------------------- PNG (images de contrôle)
const CRC = Int32Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})
const crc32 = (buf) => {
  let c = -1
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
/** Une image RVBA (largeur × hauteur × 4 octets) en PNG. */
export function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1)
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
