#!/usr/bin/env node
/**
 * Les peintures de la boutique d'Elite Dangerous pour nos vaisseaux (public/assets/ships/paints.json,
 * lu par src/ship-paint.ts) : leurs noms, leurs familles (le motif, que dessine le shader du jeu) et
 * leurs couleurs, relevées sur les vignettes de la boutique.
 *
 * Le relevé : pour chaque vaisseau, la liste des peintures de la boutique (catégorie Paint Jobs,
 * filtrée par modèle, https://www.elitedangerous.com/store/ships/category/180), puis la vignette de
 * chacune (une vue de dessus du vaisseau peint, servie par le service d'images de Frontier). Les
 * vignettes d'un même vaisseau et d'un même cadrage se superposent : ce qui change de l'une à l'autre
 * est la peinture (le fond et les pièces mécaniques ne bougent pas) ; ses couleurs dominantes sont
 * prises là, par k-moyennes en OKLab. Les packs : Vibrant (six teintes unies, fixées ici) et Marquess
 * (ses six images, dans la galerie du pack).
 *
 * Les couleurs : un coloris (« Tactical Ice ») a la même teinte sur tous les vaisseaux qui l'ont, et
 * les vignettes de tous ceux-là votent (cf. consensus). Puis la famille dit quelle couleur va où dans
 * son motif (cf. roles) : le fond, le motif, la touche, la lueur.
 *
 * À relancer à la main quand Frontier ajoute des peintures (six requêtes à la fois au plus) :
 *   node scripts/import-ed-paints.mjs [--cache <relevé.json>] [--offline] [id…]
 *   --cache   : garde le relevé (noms, couleurs des vignettes) dans ce fichier, et le complète
 *   --offline : repart de ce relevé sans relire la boutique (pour régler les couleurs et les rôles)
 *   id…       : ne relit que ces vaisseaux (avec --cache, les autres restent ceux du relevé)
 * Une nouvelle famille de peintures : l'ajouter à FAM (ici) et à FAMILIES (src/ship-paint.ts).
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

/** Nos vaisseaux, et leur modèle dans le filtre de la boutique. */
const SHIPS = { sidewinder: 25, eagle: 20, 'imperial-eagle': 197, 'viper-mk3': 24, 'viper-mk4': 196, 'cobra-mk3': 21, 'cobra-mk4': 189, adder: 138, 'diamondback-scout': 172, 'diamondback-explorer': 171, 'imperial-courier': 177, vulture: 133, 'asp-explorer': 19, keelback: 190, 'type-6': 134, dolphin: 192, 'fer-de-lance': 140, mamba: 276, 'krait-mk2': 270, 'krait-phantom': 277, 'alliance-chieftain': 266, 'alliance-crusader': 275, 'federal-dropship': 27, 'federal-assault-ship': 199, 'type-7': 135, python: 26, orca: 137, 'imperial-clipper': 139, 'type-9': 136, 'type-10': 260, 'federal-corvette': 194, 'imperial-cutter': 193 }

/** Les familles de peintures, reconnues à leur nom. */
const FAM = [
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

async function listing(model) {
  const out = []
  for (let page = 1; ; page++) {
    const data = await nuxt(`/store/ships/category/180?page_size=90&page=${page}&ship_model=${model}`)
    const list = Object.values(data).find((v) => v && v.products && v.page_size === 90)
    out.push(...list.products)
    if (page >= list.pages) return out
  }
}

const product = async (slug) => Object.values(await nuxt(`/store/product/${slug}`)).find((v) => v && v.sku && v.title && 'short_description' in v)

// ---------------------------------------------------------------- images (PNG décodé à la main)
const imgUrl = (key, w) => 'https://image-service.zaonce.net/' + Buffer.from(JSON.stringify({ bucket: 'frontier-store-media-sync-production', key: key.replace(/^\//, ''), edits: { toFormat: 'png', resize: { width: w, fit: 'contain' } } })).toString('base64')

function decodePng(buf) {
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

const load = async (key, w = 256) => decodePng(Buffer.from(await (await get(imgUrl(key, w))).arrayBuffer()))
async function loadAny(p, w = 256) {
  for (const key of [p.thumbnail, p.image, ...(p.gallery ?? []).map((g) => g.image)].filter(Boolean)) {
    try { return { im: await load(key, w), key } } catch { /* suivante */ }
  }
  return null
}

async function pool(tasks, n = 6) {
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

// ---------------------------------------------------------------- couleur (OKLab)
const s2l = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const l2s = (c) => { c = Math.max(0, Math.min(1, c)); return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)) }
const LUT = Float32Array.from({ length: 256 }, (_, i) => s2l(i))
const toLab = (r, g, b) => {
  const R = LUT[r], G = LUT[g], B = LUT[b]
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B), m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B), s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
const fromLab = ([L, a, b]) => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(l2s)
}
const hex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('')

function kmeans(px, k = 8, iters = 16) {
  const n = px.length
  if (!n) return []
  const cent = [px[Math.floor(n / 2)]]
  let seed = 12345
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  while (cent.length < k) {
    let best = -1, bi = 0
    for (let t = 0; t < 40; t++) {
      const i = Math.floor(rnd() * n), q = px[i]
      let d = Infinity
      for (const c of cent) d = Math.min(d, (q[0] - c[0]) ** 2 + (q[1] - c[1]) ** 2 + (q[2] - c[2]) ** 2)
      if (d > best) { best = d; bi = i }
    }
    cent.push(px[bi])
  }
  const asg = new Int32Array(n)
  for (let it = 0; it < iters; it++) {
    const sum = cent.map(() => [0, 0, 0, 0])
    for (let i = 0; i < n; i++) {
      const q = px[i]
      let bd = Infinity, bj = 0
      for (let j = 0; j < cent.length; j++) { const c = cent[j], d = (q[0] - c[0]) ** 2 + (q[1] - c[1]) ** 2 + (q[2] - c[2]) ** 2; if (d < bd) { bd = d; bj = j } }
      asg[i] = bj
      const s = sum[bj]; s[0] += q[0]; s[1] += q[1]; s[2] += q[2]; s[3]++
    }
    for (let j = 0; j < cent.length; j++) if (sum[j][3]) cent[j] = [sum[j][0] / sum[j][3], sum[j][1] / sum[j][3], sum[j][2] / sum[j][3]]
  }
  const w = new Array(cent.length).fill(0)
  for (let i = 0; i < n; i++) w[asg[i]]++
  const cl = cent.map((c, j) => ({ lab: c, w: w[j] / n })).filter((c) => c.w > 0)
  for (let merged = true; merged;) {
    merged = false
    cl.sort((a, b) => b.w - a.w)
    outer: for (let i = 0; i < cl.length; i++) for (let j = i + 1; j < cl.length; j++) {
      const a = cl[i], b = cl[j]
      if (Math.hypot(a.lab[0] - b.lab[0], a.lab[1] - b.lab[1], a.lab[2] - b.lab[2]) < 0.075) {
        const W = a.w + b.w
        a.lab = a.lab.map((v, t) => (v * a.w + b.lab[t] * b.w) / W)
        a.w = W
        cl.splice(j, 1)
        merged = true
        break outer
      }
    }
  }
  return cl.sort((a, b) => b.w - a.w)
}

function pixels(im, mask, max = 4000) {
  const d = im.data, n = im.width * im.height
  let cnt = 0
  for (let i = 0; i < n; i++) if (mask[i]) cnt++
  const step = Math.max(1, Math.floor(cnt / max)), out = []
  let c = 0
  for (let i = 0; i < n; i++) if (mask[i] && c++ % step === 0) out.push(toLab(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]))
  return out
}

function palette(im, mask) {
  const cl = kmeans(pixels(im, mask), 8, 16)
  const chroma = (c) => Math.hypot(c.lab[1], c.lab[2])
  const main = cl.filter((c) => c.w >= 0.02).slice(0, 5)
  const acc = cl.filter((c) => !main.includes(c) && c.w >= 0.004 && chroma(c) > 0.08).sort((a, b) => chroma(b) - chroma(a))[0]
  return [...main, ...(acc ? [acc] : [])].map((c) => ({ hex: hex(fromLab(c.lab)), w: +c.w.toFixed(3), L: +c.lab[0].toFixed(3), C: +chroma(c).toFixed(3) }))
}

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
function groups(items) {
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
function varMask(group, T = 22) {
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
/** Ce qui se détache du fond (les couleurs du bord de l'image). */
function soloMask(im) {
  const W = im.width, H = im.height, N = W * H, d = im.data, border = []
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x < 6 || y < 6 || x >= W - 6 || y >= H - 6) && (x + y) % 3 === 0) border.push(toLab(d[(y * W + x) * 4], d[(y * W + x) * 4 + 1], d[(y * W + x) * 4 + 2]))
  const bg = kmeans(border, 4, 8).map((c) => c.lab)
  let L = 0
  for (const b of bg) L = Math.max(L, b[0])
  const mask = new Uint8Array(N)
  for (let i = 0; i < N; i++) {
    const q = toLab(d[i * 4], d[i * 4 + 1], d[i * 4 + 2])
    let m = Infinity
    for (const b of bg) m = Math.min(m, Math.hypot(q[0] - b[0], (q[1] - b[1]) * 1.5, (q[2] - b[2]) * 1.5))
    mask[i] = m > 0.09 && (q[0] > L + 0.06 || Math.hypot(q[1], q[2]) > 0.05) ? 1 : 0
  }
  return mask
}
const union = (a, b) => a.map((v, i) => v | b[i])

// ---------------------------------------------------------------- couleurs des peintures
const lab = (hex) => {
  const [R, G, B] = [1, 3, 5].map((i) => s2l(parseInt(hex.slice(i, i + 2), 16)))
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B), m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B), s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
const hexOf = ([L, a, b]) => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return '#' + [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map((v) => l2s(v).toString(16).padStart(2, '0')).join('')
}
const dE = (a, b) => Math.hypot((a[0] - b[0]) * 0.8, a[1] - b[1], a[2] - b[2])
const C = (c) => Math.hypot(c[1], c[2])
/** Les vignettes sont des rendus éclairés : la clarté telle quelle, la saturation un peu remontée (l'éclairage du jeu la mange). */
const lift = (c) => {
  const g = C(c) > 0.02 ? 1.1 : 1
  return [Math.min(0.95, c[0]), c[1] * g, c[2] * g]
}
const shade = (c, dL, dC = 1) => [Math.max(0.03, Math.min(0.97, c[0] + dL)), c[1] * dC, c[2] * dC]
const glowOf = (c) => { const k = Math.max(C(c), 0.001), g = Math.min(1.5, 0.18 / k + 1); return [Math.min(0.85, Math.max(0.66, c[0])), c[1] * g, c[2] * g] }

const NAMED = {
  black: '#161616', white: '#e6e3df', red: '#b3231d', blue: '#2a56a8', green: '#2f7a35', yellow: '#e0bf22', orange: '#d8701a', purple: '#6d36a2', pink: '#d0408f', grey: '#8a8786', gray: '#8a8786',
  gold: '#c79a2e', silver: '#c2c1c4', teal: '#2f9a96', aqua: '#2aa7a8', crimson: '#9c1c3a', lime: '#9bd040', rose: '#c84a7c', cobalt: '#2b3f8a', olive: '#55553a', graphite: '#403d3c', ice: '#d4dade',
  brass: '#b59a52', copper: '#c07a52', bronze: '#94704a', tungsten: '#77785e', palladium: '#d0c8d6', malachite: '#c3d0c2', sandstone: '#b08a52', charcoal: '#2e2b2a', ash: '#6a6564', rust: '#8b3e0b', brown: '#6b4f37',
  shadow: '#4a4242',
}
const named = (word) => NAMED[word?.toLowerCase()] ? lab(NAMED[word.toLowerCase()]) : null

// ---------------------------------------------------------------- noms
const PREFIX = { 'krait-mk2': 'Krait Mk II', 'krait-phantom': 'Krait Phantom', 'imperial-eagle': 'Imperial Eagle', 'viper-mk3': 'Viper Mk III', 'viper-mk4': 'Viper Mk IV', 'cobra-mk3': 'Cobra Mk III', 'cobra-mk4': 'Cobra Mk IV', 'diamondback-scout': 'Diamondback Scout', 'diamondback-explorer': 'Diamondback Explorer', 'imperial-courier': 'Imperial Courier', 'asp-explorer': 'Asp Explorer', 'type-6': 'Type-6', 'fer-de-lance': 'Fer-de-Lance', 'alliance-chieftain': 'Alliance Chieftain', 'alliance-crusader': 'Alliance Crusader', 'federal-dropship': 'Federal Dropship', 'federal-assault-ship': 'Federal Assault Ship', 'type-7': 'Type-7', 'imperial-clipper': 'Imperial Clipper', 'type-9': 'Type-9', 'type-10': 'Type-10', 'federal-corvette': 'Federal Corvette', 'imperial-cutter': 'Imperial Cutter' }
function variantName(ship, title, family) {
  let t = title.trim().replace(/\s+/g, ' ')
  const prefixes = [PREFIX[ship], ship.replace(/-/g, ' '), 'Type-9 Heavy', 'Type-10 Defender', 'Asp', 'Eagle', 'Fer-De-Lance', 'Viper MK III', 'Viper Mk IV -'].filter(Boolean)
  for (const p of prefixes.sort((a, b) => b.length - a.length)) if (t.toLowerCase().startsWith(p.toLowerCase() + ' ')) { t = t.slice(p.length + 1); break }
  t = t.replace(/^- /, '')
  // « Gold Pharaoh » et « Pharaoh Gold » sont la même peinture : la famille d'abord.
  const m = t.match(/^(\w+) (Pharaoh|Apollo)$/)
  if (m) t = `${m[2]} ${m[1]}`
  if (family === 'marquess') t = MARQUESS[+t.split(' ')[1]].name
  return t
}
const slug = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// ---------------------------------------------------------------- teintes fixées à la main
const MARQUESS = {
  1: { name: 'Marquess Black & Gold', colors: ['#29241f', '#3b3128', '#c4a032', '#c9a335'] },
  2: { name: 'Marquess Black & Green', colors: ['#2b2621', '#3d6224', '#c4a032', '#c9a335'] },
  3: { name: 'Marquess Green & Gold', colors: ['#3d6224', '#2f2b25', '#c4a032', '#c9a335'] },
  4: { name: 'Marquess White & Green', colors: ['#e2ddd9', '#3d6224', '#c4a032', '#c9a335'] },
  5: { name: 'Marquess White & Gold', colors: ['#e2ddd9', '#cfc5b3', '#c4a032', '#c9a335'] },
  6: { name: 'Marquess White & Black', colors: ['#e2ddd9', '#2b2621', '#2b2621', '#c9a335'] },
}
const VIBRANT = { Blue: '#2443b4', Green: '#4f7417', Orange: '#c4580f', Purple: '#7330a8', Red: '#bd1716', Yellow: '#cf9b1f' }
const MANUAL = {
  'midnight-black': ['#0d0d10', '#17171b', '#09090b', '#2a2a30'],
  'ruby-anniversary': ['#3a0508', '#5c0a12', '#7a0f1c', '#e0143c'],
  'vanguard-bronze': ['#9a7350', '#3a2c24', '#c9a35e', '#1d2a3c'],
  blackjack: ['#a30f0c', '#0e0d0d', '#2c2a2a', '#e3ddd9'],
  'yellow-taxi': ['#e0b522', '#121212', '#2a2620', '#e8e2d8'],
  'black-taxi': ['#121212', '#e0b522', '#2a2620', '#e8e2d8'],
  'acceleration-blue': ['#56607e', '#c4513c', '#e6e2de', '#2c2e38'],
  arrowhead: ['#b4aca9', '#a5560f', '#615e64', '#e0d9d6'],
  'grey-sidestripe': ['#5d5752', '#d0681a', '#3a3530', '#857f7a'],
}

// ---------------------------------------------------------------- consensus d'un coloris
function consensus(entries) {
  // Chaque vignette compte selon la fiabilité de son masque (groupe de même cadrage).
  const pts = []
  for (const e of entries) {
    const rel = e.g >= 4 ? 1 : e.g >= 2 ? 0.6 : 0.35
    for (const c of e.pal) pts.push({ c: lab(c.hex), w: c.w * rel })
  }
  if (!pts.length) return []
  // k-moyennes pondérées sur les couleurs des vignettes.
  const k = Math.min(6, pts.length)
  const sorted = [...pts].sort((a, b) => b.w - a.w)
  let cent = []
  for (const p of sorted) if (cent.length < k && cent.every((c) => dE(c, p.c) > 0.06)) cent.push(p.c)
  for (let it = 0; it < 12; it++) {
    const sum = cent.map(() => [0, 0, 0, 0])
    for (const p of pts) {
      let bj = 0, bd = Infinity
      cent.forEach((c, j) => { const d = dE(c, p.c); if (d < bd) { bd = d; bj = j } })
      const s = sum[bj]; s[0] += p.c[0] * p.w; s[1] += p.c[1] * p.w; s[2] += p.c[2] * p.w; s[3] += p.w
    }
    cent = cent.map((c, j) => (sum[j][3] ? [sum[j][0] / sum[j][3], sum[j][1] / sum[j][3], sum[j][2] / sum[j][3]] : c))
    if (it === 11) {
      const tot = sum.reduce((s, v) => s + v[3], 0)
      return cent.map((c, j) => ({ c, w: sum[j][3] / tot })).filter((x) => x.w > 0.015).sort((a, b) => b.w - a.w)
    }
  }
}

// ---------------------------------------------------------------- rôles des couleurs selon la famille
function roles(family, name, pal) {
  const words = name.replace(/&/g, ' ').split(/\s+/).map((w) => w.toLowerCase())
  const colorWords = words.filter((w) => NAMED[w])
  const used = new Set()
  const take = (p) => { if (p) used.add(p); return p }
  const free = () => pal.filter((p) => !used.has(p))
  const byW = () => free()[0] ?? null
  const distinct = () => free().find((p) => [...used].every((u) => dE(u.c, p.c) > 0.07)) ?? byW()
  const closest = (ref, max = 0.3) => {
    let best = null, bd = max
    for (const p of free()) { const d = Math.hypot((p.c[0] - ref[0]) * 0.5, p.c[1] - ref[1], p.c[2] - ref[2]); if (d < bd) { bd = d; best = p } }
    return best
  }
  const chroma = () => [...free()].sort((a, b) => C(b.c) - C(a.c))[0] ?? null
  const darkest = () => [...free()].sort((a, b) => a.c[0] - b.c[0])[0] ?? null
  const brightest = () => [...free()].sort((a, b) => b.c[0] - a.c[0])[0] ?? null
  /** La couleur nommée : celle de la vignette qui en approche, sinon la couleur de référence. */
  const word = (w, mix = 0) => {
    const ref = named(w)
    if (!ref) return null
    const p = closest(ref)
    if (!p) return ref
    used.add(p)
    return mix ? p.c.map((v, i) => v * (1 - mix) + ref[i] * mix) : p.c
  }
  const col = (x) => (x ? (Array.isArray(x) ? x : x.c) : null)
  const L = (x) => (x ? lift(col(x)) : null)
  const fill = (cs) => {
    const base = cs[0] ?? lab('#808080')
    return cs.map((c, i) => c ?? shade(base, [0, -0.12, 0.1, -0.22][i]))
  }
  let cs, glow = null
  switch (family) {
    case 'ruby': {
      const d = darkest(); take(d)
      cs = [d?.c, L(take(byW())), L(take(byW())), null]
      const g = chroma() ?? pal.find((p) => C(p.c) > 0.15)
      cs[3] = g ? lift(g.c) : lab('#c70e32')
      glow = glowOf(cs[3])
      cs[0] = shade(cs[0], 0.03)
      break
    }
    case 'pulse':
    case 'fusion':
    case 'shock': {
      const base = family === 'pulse' ? lab('#3d3e42') : L(take(byW()))
      const c1 = family === 'pulse' ? shade(base, -0.06) : L(take(distinct()))
      const tint = colorWords.length ? word(colorWords[0]) : null
      const g = tint ?? chroma()?.c ?? brightest()?.c ?? lab('#ffffff')
      glow = glowOf(lift(g))
      cs = [base, c1, L(take(distinct())), glow]
      break
    }
    case 'stygian':
    case 'galvanized':
    case 'lakon': {
      const top = free().slice(0, 4)
      const mid = colorWords.length ? word(colorWords[0]) : take(byW())?.c
      const sortedL = top.filter((p) => p.c !== mid).sort((a, b) => a.c[0] - b.c[0])
      cs = [L(mid), L(sortedL[0]?.c), L(sortedL[sortedL.length - 1]?.c), L(sortedL[1]?.c)]
      break
    }
    case 'squadron': {
      const base = take(byW())
      const acc = words.includes('shadow') ? lab('#7a3a39') : word(colorWords[0], 0.35)
      cs = [L(base), acc ? lift(acc) : null, base ? shade(lift(base.c), -0.14) : null, acc ? lift(acc) : null]
      break
    }
    case 'osiris':
    case 'turbulence': {
      const c0 = word(colorWords[0], 0.25), c1 = word(colorWords[1], 0.25)
      cs = [L(c0), L(c1), L(take(distinct())), L(take(distinct()))]
      break
    }
    case 'pirate':
    case 'salvage':
    case 'ember': {
      const c0 = colorWords.length ? word(colorWords[0]) : take(byW())
      cs = [L(c0), L(take(family === 'pirate' ? darkest() : chroma())), L(take(distinct())), L(take(brightest()))]
      break
    }
    case 'speedway':
    case 'excursion':
    case 'messenger':
    case 'pathfinder': {
      const white = take(brightest())
      const c1 = word(colorWords[0] === 'black' ? 'black' : colorWords[0], 0.2) ?? take(chroma())?.c
      cs = [L(white), L(c1), L(take(chroma())), L(take(darkest()))]
      break
    }
    case 'slipstream':
    case 'wayfarer':
    case 'synth':
    case 'sonoran':
    case 'mojave':
    case 'militarystripe':
    case 'operator':
    case 'icarus':
    case 'polarity':
    case 'snakewrap':
    case 'serpent': {
      // La couleur du nom porte le motif ; le fond est la teinte dominante (sauf pour ceux dont le nom est le fond).
      const nameIsBase = ['slipstream', 'wayfarer', 'serpent'].includes(family) && colorWords.length
      let base, acc
      if (nameIsBase) { acc = null; base = word(colorWords[0], 0.2) }
      else { base = take(byW())?.c; acc = colorWords.length ? word(colorWords[0], 0.3) : take(chroma())?.c }
      if (family === 'polarity') base = lab('#66656a')
      if (family === 'snakewrap' && words.includes('black')) { base = lab('#0e0d0c'); acc = take(chroma())?.c }
      cs = [L(base), L(acc ?? take(distinct())?.c), L(take(distinct())), L(take(chroma()))]
      if (family === 'operator') { glow = glowOf(lift(acc ?? lab('#30a0a0'))); cs[3] = glow; cs[1] = shade(cs[0], -0.05); cs[2] = shade(cs[0], 0.04) }
      if (family === 'synth') cs[1] = glowOf(lift(acc ?? cs[1]))
      if (family === 'snakewrap') cs[0] = shade(cs[0], 0, 1) // les écailles laissent voir le fond
      break
    }
    case 'overdrive': {
      const d = darkest(); take(d)
      const neon = word(colorWords[0]) ?? take(chroma())?.c
      const sun = closest(lab('#fcb712'), 0.25)
      take(sun)
      cs = [d?.c, lift(neon), sun ? lift(sun.c) : lab('#f2a81c'), null]
      glow = glowOf(lift(neon))
      cs[3] = glow
      break
    }
    case 'onionhead': {
      cs = [L(take(byW())?.c), L(take(distinct())?.c), null, null]
      glow = glowOf(lab('#8ad41f'))
      cs[3] = glow
      break
    }
    case 'razor': {
      const metal = named(colorWords[0]) ?? lab('#c2c1c4')
      const p = closest(metal, 0.35)
      take(p)
      cs = [p ? lift(p.c).map((v, i) => (v + metal[i]) / 2) : metal, lab('#0d0d0d'), lab('#3a3a3c'), shade(metal, -0.2)]
      break
    }
    case 'taxi':
    case 'aquatic':
    case 'flash':
    case 'mohawk':
    case 'colorado':
    case 'apollo':
    case 'independent':
    case 'pharaoh':
    case 'crypsis':
    case 'tactical':
    case 'precision':
    case 'predator':
    case 'ignition':
    case 'camo':
    case 'crossfire':
    case 'medusa':
    case 'militarygreen':
    case 'militaryblue':
    case 'shatter':
    case 'empire':
    case 'expressway':
    case 'sheerline':
    case 'odyssey':
    case 'allied':
    case 'federation':
    case 'dazzle':
    case 'emissary':
    case 'sabotage':
    case 'rattler':
    default: {
      const c0 = take(byW())
      let c1, c2
      if (family === 'mechanist') {
        // Les damiers clairs, puis la touche (les filets dorés).
        c1 = take(brightest()); c2 = take(chroma())
      } else if (family === 'apollo' || family === 'pharaoh' || family === 'sheerline' || family === 'asemic') {
        // La couleur la plus éloignée du fond porte le motif.
        c1 = take([...free()].filter((p) => p.w > 0.03).sort((a, b) => dE(b.c, c0.c) - dE(a.c, c0.c))[0]); c2 = take(distinct())
      } else if (family === 'predator' || family === 'ignition') {
        // Les langues, puis la touche la plus vive qui reste (le rouge des flammes).
        c1 = take(distinct())
        const v = chroma()
        c2 = take(v && C(v.c) > 0.06 ? v : distinct())
      } else {
        c1 = take(distinct()); c2 = take(distinct())
      }
      cs = [L(c0), L(c1), L(c2), L(take(distinct()))]
      if (family === 'shatter') cs[1] = lab('#0b0a0b')
      if (family === 'dazzle') { const hi = [...pal].sort((a, b) => b.c[0] - a.c[0])[0]; const lo = [...pal].sort((a, b) => a.c[0] - b.c[0])[0]; cs[0] = lift(lo.c); cs[1] = lift(hi.c) }
      if (family === 'empire' || family === 'emissary') { const g = closest(lab('#c79a2e'), 0.3); if (g) cs[2] = lift(g.c) }
      break
    }
  }
  return { colors: fill(cs).map(hexOf), glow: glow ? hexOf(glow) : null }
}

// ---------------------------------------------------------------- programme
const args = process.argv.slice(2)
let cache = null
let offline = false
const only = []
while (args.length) {
  const a = args.shift()
  if (a === '--cache') cache = args.shift()
  else if (a === '--offline') offline = true
  else only.push(a)
}
if (offline && !(cache && existsSync(cache))) {
  console.error('--offline : il faut un relevé (--cache <relevé.json>)')
  process.exit(1)
}
if (only.length && !cache) {
  console.error('Relire quelques vaisseaux seulement : il faut le relevé des autres (--cache <relevé.json>)')
  process.exit(1)
}
/** Le relevé : par vaisseau, ses peintures (titre de la boutique, famille, palette de la vignette, cadrage). */
const raw = cache && existsSync(cache) ? JSON.parse(readFileSync(cache, 'utf8')) : {}
if (!offline) {
  for (const [ship, model] of Object.entries(SHIPS)) {
    if (only.length && !only.includes(ship)) continue
    const t0 = Date.now()
    const list = await listing(model)
    for (const p of list) p.family = FAM.find(([, re]) => re.test(p.title))?.[0] ?? null
    const res = []
    const unknown = list.filter((p) => !p.family).map((p) => p.title)
    const singles = list.filter((p) => p.family && !p.child_skus?.length)
    const loaded = await pool(singles.map((p) => () => loadAny(p)))
    const items = loaded.map((l, i) => l && { p: singles[i], im: l.im, key: l.key }).filter(Boolean)
    const failed = singles.filter((_, i) => !loaded[i]).map((p) => p.title)
    const gs = groups(items)
    for (const g of gs) {
      const mask = g.length >= 4 ? varMask(g) : null
      for (const x of g) res.push({ title: x.p.title.trim(), family: x.p.family, key: x.key, g: g.length, pal: palette(x.im, mask ?? soloMask(x.im)) })
    }
    for (const p of list.filter((q) => q.family && q.child_skus?.length)) {
      if (p.family === 'vibrant') {
        for (const n of Object.keys(VIBRANT)) res.push({ title: `Vibrant ${n}`, family: 'vibrant', g: 0, pal: [] })
      } else if (p.family === 'marquess') {
        const d = await product(p.slug)
        const keys = d.gallery.map((g) => g.image).filter((k) => /heraldry2_0\d/.test(k)).sort((a, b) => a.match(/heraldry2_0(\d)/)[1] - b.match(/heraldry2_0(\d)/)[1])
        const ims = (await pool(keys.map((k) => () => load(k, 256)))).map((im, i) => im && { im, n: +keys[i].match(/heraldry2_0(\d)/)[1], key: keys[i] }).filter(Boolean)
        const mask = ims.length >= 4 ? varMask(ims) : null
        for (const x of ims) res.push({ title: `Marquess ${x.n}`, family: 'marquess', key: x.key, g: ims.length, pal: palette(x.im, mask ? union(mask, soloMask(x.im)) : soloMask(x.im)) })
      } else failed.push(`pack inconnu : ${p.title}`)
    }
    raw[ship] = res
    if (cache) writeFileSync(cache, JSON.stringify(raw))
    const notes = [failed.length && `vignettes illisibles : ${failed.join(' | ')}`, unknown.length && `familles inconnues (cf. FAM) : ${unknown.join(' | ')}`].filter(Boolean)
    console.log(`${ship.padEnd(22)} ${String(res.length).padStart(3)} peintures, cadrages ${JSON.stringify(gs.map((g) => g.length))}${notes.length ? `, ${notes.join(' ; ')}` : ''} (${((Date.now() - t0) / 1000).toFixed(0)} s)`)
  }
}

const variants = new Map()
const ships = {}
for (const [ship, list] of Object.entries(raw)) {
  const ids = []
  for (const e of list) {
    const name = variantName(ship, e.title, e.family)
    const id = e.family === 'vibrant' || e.family === 'marquess' ? slug(name) : slug(name)
    if (!variants.has(id)) variants.set(id, { name, family: e.family, entries: [] })
    variants.get(id).entries.push(e)
    if (!ids.includes(id)) ids.push(id)
  }
  ships[ship] = ids
}
const paints = {}
for (const [id, v] of variants) {
  let out
  if (v.family === 'vibrant') {
    const c = lab(VIBRANT[v.name.split(' ')[1]])
    out = { colors: [c, shade(c, -0.09), shade(c, 0.06), lab('#2b2b2e')].map(hexOf), glow: null }
  } else if (v.family === 'marquess') {
    out = { colors: Object.values(MARQUESS).find((m) => m.name === v.name).colors, glow: null }
  } else if (MANUAL[id]) {
    out = { colors: MANUAL[id], glow: id === 'ruby-anniversary' ? '#ff1f4a' : null }
  } else {
    out = roles(v.family, v.name, consensus(v.entries))
  }
  paints[id] = [v.name, v.family, ...out.colors, out.glow]
}
// Ordre d'affichage : les familles dans l'ordre où la boutique les montre pour le vaisseau.
for (const [ship, ids] of Object.entries(ships)) {
  const famOrder = []
  for (const id of ids) if (!famOrder.includes(paints[id][1])) famOrder.push(paints[id][1])
  ships[ship] = [...ids].sort((a, b) => famOrder.indexOf(paints[a][1]) - famOrder.indexOf(paints[b][1]))
}
const outFile = fileURLToPath(new URL('../public/assets/ships/paints.json', import.meta.url))
writeFileSync(outFile, JSON.stringify({ paints, ships }))
console.log(`${Object.keys(paints).length} peintures, ${Object.values(ships).reduce((s, l) => s + l.length, 0)} sur ${Object.keys(ships).length} vaisseaux, ${readFileSync(outFile).length} octets`)

