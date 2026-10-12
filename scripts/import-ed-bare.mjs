#!/usr/bin/env node
/**
 * Les pièces que la boutique d'Elite Dangerous ne peint jamais (fuselage, moteurs, prises d'air…),
 * vaisseau par vaisseau : scripts/ed-ships-bare.json, que lit scripts/import-ed-ships.mjs pour les
 * laisser en graphite (cf. src/ship-paint.ts).
 *
 * Le relevé : les vignettes de la boutique (catégorie Paint Jobs, filtrée par modèle) d'un même
 * cadrage sont superposées ; un pixel qui garde son aspect habituel dans la plupart des peintures
 * n'est pas peint (quelques-unes, Tactical ou Shock, recouvrent tout). Ces vignettes sont des vues
 * de dessus : on y recale la silhouette de notre modèle vu de dessus (rotation, échelle, décalage,
 * miroir : au mieux du recouvrement), puis on reporte le masque dans le repère du modèle (une grille
 * de 96 cases sur sa plus grande dimension). Seules les grandes pièces restent : à l'échelle du jeu,
 * les petites (grilles, trappes) ne seraient que des taches.
 *
 * Vaisseaux sans vue de dessus dans la boutique (cf. NO_TOP) : un autre vaisseau de même allure prête
 * son masque, sinon rien n'est relevé (seule la poupe reste en graphite, cf. le shader).
 *
 * Usage : node scripts/import-ed-bare.mjs [--glb <dossier des GLB>] [--debug <dossier>] [id…]
 *   --glb   : les modèles à recaler (par défaut public/assets/ships, ceux du jeu)
 *   --debug : une image de contrôle par vaisseau (la vignette médiane, la silhouette du modèle
 *             recalée en bleu, les pièces non peintes en rouge)
 *   id…     : ne relit que ces vaisseaux (les autres restent ceux du fichier)
 * Puis réimporter les vaisseaux (scripts/import-ed-ships.mjs) pour que le masque passe dans les GLB.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SHIPS, listing, loadAny, pool, groups, varMask, encodePng } from './elite-store.mjs'

/** Définition des vignettes lues. */
const RES = 512
/** Définition du recalage. */
const LOW = 128
/** Part des peintures où un pixel garde son aspect habituel, au-delà de laquelle il n'est pas peint. */
const SAME = 0.55
/** Cases du masque sur la plus grande dimension du vaisseau. */
const CELLS = 96
/** Recouvrement (silhouette recalée / vignettes) en dessous duquel le recalage est à vérifier (cf. --debug). */
const DOUBTFUL = 0.6
/** Pièces non peintes plus petites que ça (cases) : repeintes ; trous plus petits que MIN dans une pièce : bouchés. */
const MIN_BARE = 50
const MIN = 5
/**
 * Vaisseaux dont les vignettes ne sont pas des vues de dessus (de trois quarts ou de profil, vérifié à
 * l'œil) : le vaisseau de même allure dont ils empruntent le masque (en coordonnées relatives), ou null.
 */
const NO_TOP = { 'cobra-mk4': 'cobra-mk3', dolphin: null, orca: null }

const args = process.argv.slice(2)
let glbDir = fileURLToPath(new URL('../public/assets/ships/', import.meta.url))
let debug = null
const only = []
while (args.length) {
  const a = args.shift()
  if (a === '--glb') glbDir = args.shift()
  else if (a === '--debug') debug = args.shift()
  else only.push(a)
}
if (debug) mkdirSync(debug, { recursive: true })
const outFile = fileURLToPath(new URL('./ed-ships-bare.json', import.meta.url))

// ---------------------------------------------------------------- le modèle, vu de dessus

/** Les sommets (accesseur 0) et les triangles (toutes les primitives) d'un GLB du jeu, et ses dimensions. */
function readGlb(file) {
  const b = readFileSync(file)
  const jl = b.readUInt32LE(12)
  const j = JSON.parse(b.toString('utf8', 20, 20 + jl))
  const binStart = 20 + jl + 8
  const slice = (view, len) => b.buffer.slice(b.byteOffset + binStart + (view.byteOffset ?? 0), b.byteOffset + binStart + (view.byteOffset ?? 0) + len)
  const pa = j.accessors[0]
  const pos = new Float32Array(slice(j.bufferViews[pa.bufferView], pa.count * 12))
  const idx = []
  for (const prim of j.meshes[0].primitives) {
    const ia = j.accessors[prim.indices], iv = j.bufferViews[ia.bufferView]
    const Arr = ia.componentType === 5125 ? Uint32Array : Uint16Array
    for (const v of new Arr(slice(iv, ia.count * Arr.BYTES_PER_ELEMENT))) idx.push(v)
  }
  return { pos, idx, size: j.nodes[0].extras.size }
}

/** La silhouette vue de dessus : une grille sur la boîte du vaisseau (x de tribord à bâbord, z de la poupe au nez). */
function silhouette(model, cells = 200) {
  const [sx, , sz] = model.size
  const cell = Math.max(sx, sz) / cells
  const cols = Math.ceil(sx / cell) + 2, rows = Math.ceil(sz / cell) + 2
  const x0 = -sx / 2 - cell, z0 = -sz / 2 - cell
  const full = new Uint8Array(cols * rows)
  const { pos, idx } = model
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3
    const ax = pos[a], az = pos[a + 2], bx = pos[b], bz = pos[b + 2], cx = pos[c], cz = pos[c + 2]
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz)
    if (Math.abs(d) < 1e-9) continue
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / cell)), i1 = Math.min(cols - 1, Math.floor((Math.max(ax, bx, cx) - x0) / cell))
    const j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - z0) / cell)), j1 = Math.min(rows - 1, Math.floor((Math.max(az, bz, cz) - z0) / cell))
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = x0 + (i + 0.5) * cell, z = z0 + (j + 0.5) * cell
      const l0 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l1 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d
      if (l0 >= -1e-6 && l1 >= -1e-6 && l0 + l1 <= 1 + 1e-6) full[j * cols + i] = 1
    }
  }
  return { cell, cols, rows, x0, z0, full, at: (x, z) => { const i = Math.floor((x - x0) / cell), j = Math.floor((z - z0) / cell); return i >= 0 && j >= 0 && i < cols && j < rows ? full[j * cols + i] : 0 } }
}

// ---------------------------------------------------------------- recalage

/** Pose : image = t + s · R(θ) · (m·x, z) ; et l'inverse. */
const toModel = (p, u, v) => {
  const du = (u - p.tu) / p.s, dv = (v - p.tv) / p.s, c = Math.cos(p.th), sn = Math.sin(p.th)
  return [(c * du + sn * dv) * p.m, -sn * du + c * dv]
}
const toImage = (p, x, z) => {
  const c = Math.cos(p.th), sn = Math.sin(p.th), mx = x * p.m
  return [p.tu + p.s * (c * mx - sn * z), p.tv + p.s * (sn * mx + c * z)]
}
/** Recouvrement (intersection / union) de ce qui change dans les vignettes et de la silhouette posée. */
function iou(P, sil, p) {
  let inter = 0, uni = 0
  for (let v = 0; v < LOW; v++) for (let u = 0; u < LOW; u++) {
    const a = P[v * LOW + u]
    const [x, z] = toModel(p, u + 0.5, v + 0.5)
    const b = sil.at(x, z)
    if (a && b) inter++
    if (a || b) uni++
  }
  return uni ? inter / uni : 0
}
/** Centre, axe principal et étalement d'un nuage de points. */
function moments(points) {
  let n = 0, mx = 0, my = 0
  for (const [x, y] of points) { n++; mx += x; my += y }
  mx /= n; my /= n
  let sxx = 0, syy = 0, sxy = 0
  for (const [x, y] of points) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my) }
  sxx /= n; syy /= n; sxy /= n
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  const l1 = (sxx + syy) / 2 + Math.sqrt(((sxx - syy) / 2) ** 2 + sxy ** 2)
  return { cx: mx, cy: my, ang, l1 }
}
/** La pose : d'abord par les moments (quatre candidates : axe dans un sens ou l'autre, miroir ou non), puis affinée. */
function register(P, sil) {
  const pi = []
  for (let v = 0; v < LOW; v++) for (let u = 0; u < LOW; u++) if (P[v * LOW + u]) pi.push([u + 0.5, v + 0.5])
  const mp = moments(pi)
  let best = null
  for (const m of [1, -1]) {
    const ps = []
    for (let j = 0; j < sil.rows; j++) for (let i = 0; i < sil.cols; i++) if (sil.full[j * sil.cols + i]) ps.push([m * (sil.x0 + (i + 0.5) * sil.cell), sil.z0 + (j + 0.5) * sil.cell])
    const ms = moments(ps)
    const s0 = Math.sqrt(mp.l1 / ms.l1)
    for (const flip of [0, Math.PI]) {
      const th = mp.ang - ms.ang + flip
      const c = Math.cos(th), sn = Math.sin(th)
      let p = { m, th, s: s0, tu: mp.cx - s0 * (c * ms.cx - sn * ms.cy), tv: mp.cy - s0 * (sn * ms.cx + c * ms.cy) }
      let score = iou(P, sil, p)
      // Recherche locale : chaque paramètre à son tour, pas réduits de moitié quand rien ne s'améliore.
      const steps = { th: 0.08, s: 0.06, tu: 3, tv: 3 }
      for (let round = 0; round < 60; round++) {
        let improved = false
        for (const k of ['th', 's', 'tu', 'tv']) {
          for (const dir of [1, -1]) {
            const q = { ...p, [k]: k === 's' ? p.s * (1 + dir * steps.s) : p[k] + dir * steps[k] }
            const sc = iou(P, sil, q)
            if (sc > score) { p = q; score = sc; improved = true }
          }
        }
        if (!improved) {
          for (const k in steps) steps[k] /= 2
          if (steps.tu < 0.2) break
        }
      }
      if (!best || score > best.score) best = { p, score }
    }
  }
  return best
}

/** Fermeture morphologique (dilatation puis érosion, disque de rayon r) d'un masque LOW × LOW. */
function close(M, r) {
  const disk = []
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) disk.push([dx, dy])
  const pass = (src, keep) => {
    const out = new Uint8Array(LOW * LOW)
    for (let v = 0; v < LOW; v++) for (let u = 0; u < LOW; u++) {
      let hit = !keep
      for (const [dx, dy] of disk) {
        const x = u + dx, y = v + dy
        const val = x >= 0 && y >= 0 && x < LOW && y < LOW ? src[y * LOW + x] : 0
        if (keep ? val : !val) { hit = keep; break }
      }
      out[v * LOW + u] = hit ? 1 : 0
    }
    return out
  }
  return pass(pass(M, true), false)
}

// ---------------------------------------------------------------- nettoyage du masque

/** Les composantes (4-connexes) de valeur v plus petites que min prennent l'autre valeur. */
function prune(mask, cols, rows, v, min) {
  const seen = new Uint8Array(mask.length)
  for (let s = 0; s < mask.length; s++) {
    if (seen[s] || !!mask[s] !== v) continue
    const comp = [s]
    seen[s] = 1
    for (let k = 0; k < comp.length; k++) {
      const c = comp[k], i = c % cols, j = (c / cols) | 0
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = i + di, y = j + dj
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue
        const n = y * cols + x
        if (!seen[n] && !!mask[n] === v) { seen[n] = 1; comp.push(n) }
      }
    }
    if (comp.length < min) for (const c of comp) mask[c] = v ? 0 : 1
  }
}

/** Chaque case prend la valeur de la majorité de ses 9 voisines (elle comprise) : des bords nets. */
function majority(mask, cols, rows) {
  const out = new Uint8Array(mask.length)
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    let n = 0, t = 0
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const x = i + di, y = j + dj
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue
      t++
      n += mask[y * cols + x]
    }
    out[j * cols + i] = n * 2 > t ? 1 : 0
  }
  return out
}

const pack = (mask) => {
  const out = Buffer.alloc(Math.ceil(mask.length / 8))
  mask.forEach((v, i) => { if (v) out[i >> 3] |= 1 << (i & 7) })
  return out.toString('base64')
}
const unpack = (b64, n) => {
  const b = Buffer.from(b64, 'base64')
  return Uint8Array.from({ length: n }, (_, i) => (b[i >> 3] >> (i & 7)) & 1)
}

// ---------------------------------------------------------------- programme

/** Le masque brut d'un vaisseau (une case par octet, 1 = non peint), son recouvrement, et l'image de contrôle. */
async function survey(ship, model, glb) {
  const list = (await listing(model)).filter((p) => !p.child_skus?.length)
  const loaded = await pool(list.map((p) => () => loadAny(p, RES)))
  const items = loaded.filter((l) => l && l.im.width === RES && l.im.height === RES)
  const g = groups(items)[0]
  if (!g || g.length < 6) return { score: 0, why: `pas de cadrage commun assez fourni (${g?.length ?? 0} vignettes)` }
  // La médiane du groupe : l'aspect le plus courant de chaque pixel.
  const med = new Uint8Array(RES * RES * 4)
  for (let i = 0; i < RES * RES; i++) {
    for (let c = 0; c < 3; c++) {
      const vals = g.map((x) => x.im.data[i * 4 + c]).sort((a, b) => a - b)
      med[i * 4 + c] = vals[vals.length >> 1]
    }
    med[i * 4 + 3] = 255
  }
  const painted = new Uint8Array(RES * RES)
  for (let i = 0; i < RES * RES; i++) {
    let same = 0
    for (const x of g) {
      const d = Math.max(Math.abs(x.im.data[i * 4] - med[i * 4]), Math.abs(x.im.data[i * 4 + 1] - med[i * 4 + 1]), Math.abs(x.im.data[i * 4 + 2] - med[i * 4 + 2]))
      if (d < 20) same++
    }
    painted[i] = same / g.length < SAME ? 1 : 0
  }
  // Le recalage se fait sur tout ce qui change dans au moins quelques peintures (presque tout le vaisseau), en basse définition.
  const varies = varMask(g)
  const P = new Uint8Array(LOW * LOW)
  const k = RES / LOW
  for (let v = 0; v < LOW; v++) for (let u = 0; u < LOW; u++) {
    let n = 0
    for (let y = 0; y < k; y++) for (let x = 0; x < k; x++) n += varies[(v * k + y) * RES + u * k + x]
    P[v * LOW + u] = n > (k * k) / 2 ? 1 : 0
  }
  // La silhouette du vaisseau dans l'image : ce qui change, refermé (les pièces non peintes sont prises entre les peintes).
  const closed = close(P, 7)
  const sil = silhouette(glb)
  const { p, score } = register(P, sil)
  const cell = Math.max(glb.size[0], glb.size[2]) / CELLS
  const cols = Math.ceil(glb.size[0] / cell), rows = Math.ceil(glb.size[2] / cell)
  const mask = new Uint8Array(cols * rows)
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = -glb.size[0] / 2 + (i + 0.5) * cell, z = -glb.size[2] / 2 + (j + 0.5) * cell
    if (!sil.at(x, z)) continue
    const [u, v] = toImage(p, x, z).map((t) => t * k)
    // Hors du vaisseau de l'image (le modèle déborde un peu) : peint, par défaut.
    const cu = Math.floor(u / k), cv = Math.floor(v / k)
    if (cu < 0 || cv < 0 || cu >= LOW || cv >= LOW || !closed[cv * LOW + cu]) continue
    // La case n'est pas peinte si la plupart des pixels autour ne le sont pas.
    let n = 0, tot = 0
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const X = Math.round(u + dx), Y = Math.round(v + dy)
      if (X < 0 || Y < 0 || X >= RES || Y >= RES) continue
      tot++
      n += painted[Y * RES + X]
    }
    mask[j * cols + i] = tot && n / tot < 0.35 ? 1 : 0
  }
  if (debug) {
    for (let Y = 0; Y < RES; Y++) for (let X = 0; X < RES; X++) {
      const [x, z] = toModel(p, (X + 0.5) / k, (Y + 0.5) / k)
      if (!sil.at(x, z)) continue
      const i = Math.floor((x + glb.size[0] / 2) / cell), j = Math.floor((z + glb.size[2] / 2) / cell)
      if (i < 0 || j < 0 || i >= cols || j >= rows) continue
      const o = (Y * RES + X) * 4
      const tint = mask[j * cols + i] ? [255, 60, 40] : [60, 200, 255]
      for (let c = 0; c < 3; c++) med[o + c] = Math.round(med[o + c] * 0.55 + tint[c] * 0.45)
    }
    writeFileSync(join(debug, `${ship}.png`), encodePng(RES, RES, med))
  }
  return { cols, rows, mask, score, thumbs: g.length }
}

const out = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : {}
const raw = {}
for (const [ship, model] of Object.entries(SHIPS)) {
  if (only.length && !only.includes(ship) && !only.some((o) => NO_TOP[o] === ship)) continue
  // Sans vue de dessus : rien à relever (le masque est emprunté ensuite, ou laissé vide).
  if (ship in NO_TOP) {
    raw[ship] = { glb: readGlb(join(glbDir, `${ship}.glb`)) }
    continue
  }
  const t0 = Date.now()
  const glb = readGlb(join(glbDir, `${ship}.glb`))
  raw[ship] = { glb, ...(await survey(ship, model, glb)) }
  const r = raw[ship]
  const doubt = r.mask && !(ship in NO_TOP) && r.score < DOUBTFUL ? ' (à vérifier)' : ''
  console.log(`${ship.padEnd(22)} ${r.mask ? `recouvrement ${r.score.toFixed(3)}${doubt}, ${r.thumbs} vignettes` : r.why}, ${((Date.now() - t0) / 1000).toFixed(0)} s`)
}
for (const [ship, r] of Object.entries(raw)) {
  if (only.length && !only.includes(ship)) continue
  const [sx, , sz] = r.glb.size
  const cell = Math.max(sx, sz) / CELLS
  const cols = Math.ceil(sx / cell), rows = Math.ceil(sz / cell)
  let mask = new Uint8Array(cols * rows)
  let how = 'boutique'
  if (r.mask && !(ship in NO_TOP)) mask = r.mask
  else if (NO_TOP[ship] && raw[NO_TOP[ship]]?.mask) {
    // Le masque de l'autre vaisseau, en coordonnées relatives (même allure, autres dimensions).
    const src = raw[NO_TOP[ship]]
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = Math.min(src.cols - 1, Math.floor(((i + 0.5) / cols) * src.cols))
      const y = Math.min(src.rows - 1, Math.floor(((j + 0.5) / rows) * src.rows))
      mask[j * cols + i] = src.mask[y * src.cols + x]
    }
    how = `celui du ${NO_TOP[ship]}`
  } else how = ship in NO_TOP ? 'aucun (pas de vue de dessus)' : 'aucun (pas de vignettes)'
  prune(mask, cols, rows, true, MIN)
  prune(mask, cols, rows, false, MIN)
  for (let pass = 0; pass < 2; pass++) mask = majority(mask, cols, rows)
  prune(mask, cols, rows, true, MIN_BARE)
  prune(mask, cols, rows, false, MIN)
  let n = 0
  for (const v of mask) n += v
  out[ship] = { cols, rows, box: [-sx / 2, -sz / 2, cols * cell, rows * cell].map((v) => +v.toFixed(3)), score: +(r.score ?? 0).toFixed(3), mask: pack(mask) }
  console.log(`${ship.padEnd(22)} masque : ${how}, ${((100 * n) / mask.length).toFixed(1)} % des cases`)
}
writeFileSync(outFile, JSON.stringify(Object.fromEntries(Object.keys(SHIPS).filter((s) => out[s]).map((s) => [s, out[s]]))))
// Relu tel que l'importeur le lira, pour s'en assurer.
for (const [ship, m] of Object.entries(JSON.parse(readFileSync(outFile, 'utf8')))) if (unpack(m.mask, m.cols * m.rows).length !== m.cols * m.rows) throw new Error(ship)
console.log(`${outFile} : ${Object.keys(out).length} vaisseaux`)
