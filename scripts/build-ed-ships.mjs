#!/usr/bin/env node
/**
 * Fabrique les vaisseaux d'Elite Dangerous du jeu (trafic spatial, hangar) : un GLB par vaisseau
 * dans public/assets/ships/, nez vers +z, dessus vers +y, en mètres, centré sur sa boîte.
 *
 * Les vaisseaux sont modelés à la main, à la façon des éléments du jeu (les vaisseaux du Space Kit
 * de Kenney) : quelques blocs aux angles arrondis assemblés, des pans plats, des aplats de couleur
 * (coque, graphite, liseré du constructeur, verrière), des réacteurs en creux sombres. Chacun est
 * décrit dans scripts/ed-ships-models.mjs avec les quatre outils d'ici : un profilé aux coins
 * arrondis le long du vaisseau (loft), une plaque biseautée (plate) pour les ailes et les panneaux,
 * une dérive (fin) et une tuyère (nozzle), plus des hublots éclairés (windows). Ce qui est décrit à
 * bâbord (x > 0) est recopié à tribord. Chaque vaisseau reçoit d'office ses feux : rouge au bout de
 * l'aile bâbord, vert à tribord, et un feu à éclats sur le dos et sous le ventre (cf. beacons).
 * Leurs cotes sont relevées sur les modèles imprimables de Kahnindustries (cf. import-ed-ships.mjs,
 * dont viennent aussi l'écriture du GLB, le plan au sol et les livrées).
 *
 * Les infos utiles au jeu (dimensions, verrière, tuyères, plan au sol, livrée) vont dans les
 * « extras » du nœud, que GLTFLoader range dans userData. Cf. src/ed-ships.ts.
 *
 * Usage : node scripts/build-ed-ships.mjs [--out <dossier>] [id…]
 *   --out : écrit ailleurs que dans public/assets/ships/ (essais) ; le catalogue et les crédits ne
 *           sont refaits que pour une fabrication complète au bon endroit.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SHIPS, PAINT, LIVERIES, GLASS, ENGINE, srgb, writeGlb, groundPlan, silhouette } from './import-ed-ships.mjs'
import { MODELS } from './ed-ships-models.mjs'

/** Les lumières : hublots éclairés, feux de navigation, feu à éclats (le jeu les fait vivre, cf. src/ed-ships.ts). */
const LIGHTS = { light: '#ffd89a', port: '#ff3b2f', starboard: '#4dff8a', beacon: '#ffffff' }

/** Segments par coin arrondi d'un profilé. */
const ROUND = 2

/**
 * Section d'un profilé : un rectangle aux quatre coins arrondis (rayon c, `round` segments par
 * coin), centré en x. Rend ses points et, pour chaque côté, sa nature : 'top', 'bottom', 'flank'
 * ou 'corner'.
 */
function section({ x = 0, z, w, y0, y1, c }, round) {
  const k = Math.max(0.01, Math.min(c, w * 0.8, (y1 - y0) * 0.45))
  const pts = [], parts = []
  // Coins : dessus tribord, dessous tribord, dessous bâbord, dessus bâbord ; puis le côté droit qui suit.
  const corners = [[x - w + k, y1 - k, 90, 'flank'], [x - w + k, y0 + k, 180, 'bottom'], [x + w - k, y0 + k, 270, 'flank'], [x + w - k, y1 - k, 0, 'top']]
  for (const [cx, cy, from, next] of corners) {
    for (let s = 0; s <= round; s++) {
      const a = ((from + (90 * s) / round) * Math.PI) / 180
      pts.push([cx + Math.cos(a) * k, cy + Math.sin(a) * k, z])
      parts.push(s < round ? 'corner' : next)
    }
  }
  return { pts, parts }
}

/** Les outils d'un vaisseau, et les faces qu'ils posent. */
function kit() {
  /** Les faces du modèle : un polygone, sa peinture, et un point de l'intérieur de sa pièce (pour l'orienter). */
  const faces = []
  const face = (verts, mat, inside) => faces.push({ verts, mat, inside })
  /** Les tuyères, pour le jeu (extras : [x, y, z, rx, ry]). */
  const engines = []
  /** Les feux, pour le jeu (extras : le feu bâbord, les feux à éclats, leur taille). */
  const lamps = { port: null, beacons: [], size: 0 }

  /**
   * Profilé aux coins arrondis le long du vaisseau, du nez vers la poupe : une section par station
   * ({ z, w: demi-largeur, y0, y1, c: rayon des coins, x: centre }), des pans entre deux stations.
   * `paint(z, côté)` donne la peinture d'un pan d'après le milieu de son tronçon et sa nature (cf.
   * section ; défaut : coque), `caps` celle des deux bouts (null : bout ouvert, noyé dans une autre
   * pièce), `mirror` le recopie à tribord.
   */
  function loft(stations, { paint = () => 'hull', caps = ['hull', 'hull'], mirror = false, round = ROUND } = {}) {
    for (const side of mirror ? [1, -1] : [1]) {
      const st = stations.map((s) => ({ ...s, x: (s.x ?? 0) * side }))
      const rings = st.map((s) => section(s, round))
      const mid = (s) => [s.x, (s.y0 + s.y1) / 2, s.z]
      const n = rings[0].pts.length
      for (let i = 0; i + 1 < rings.length; i++) {
        const inside = mid(st[i]).map((v, k) => (v + mid(st[i + 1])[k]) / 2)
        for (let k = 0; k < n; k++) {
          const name = paint((st[i].z + st[i + 1].z) / 2, rings[i].parts[k])
          face([rings[i].pts[k], rings[i].pts[(k + 1) % n], rings[i + 1].pts[(k + 1) % n], rings[i + 1].pts[k]], name, inside)
        }
      }
      const last = rings.length - 1
      if (caps[0]) face(rings[0].pts, caps[0], mid(st[1]))
      if (caps[1]) face(rings[last].pts, caps[1], mid(st[last - 1]))
    }
  }

  /**
   * Plaque (aile, mât, panneau) : ses coins vus de dessus (un contour convexe), chacun
   * [x, z, dessus, dessous] ; ses bords sont biseautés (bevel, en mètres ; 0 : bords francs).
   * Recopiée à tribord, sauf `mirror` à false (une plaque à cheval sur l'axe).
   */
  function plate(corners, mat = 'hull', bevel = 0, mirror = true) {
    const n = corners.length
    const cx = corners.reduce((s, c) => s + c[0], 0) / n, cz = corners.reduce((s, c) => s + c[1], 0) / n
    // Le contour rentré de `bevel` : chaque coin glisse le long de la bissectrice de ses deux bords.
    const inset = corners.map((c, i) => {
      if (!bevel) return c
      const normal = (a, b) => {
        let nx = -(b[1] - a[1]), nz = b[0] - a[0]
        const len = Math.hypot(nx, nz)
        nx /= len, nz /= len
        return (cx - a[0]) * nx + (cz - a[1]) * nz < 0 ? [-nx, -nz] : [nx, nz]
      }
      const n1 = normal(corners[(i + n - 1) % n], c), n2 = normal(c, corners[(i + 1) % n])
      const k = bevel / (1 + n1[0] * n2[0] + n1[1] * n2[1])
      return [c[0] + (n1[0] + n2[0]) * k, c[1] + (n1[1] + n2[1]) * k, c[2], c[3]]
    })
    for (const side of mirror ? [1, -1] : [1]) {
      const drop = (c) => Math.min(bevel * 0.7, (c[2] - c[3]) * 0.35)
      const top = inset.map((c) => [c[0] * side, c[2], c[1]]), bottom = inset.map((c) => [c[0] * side, c[3], c[1]])
      const high = corners.map((c) => [c[0] * side, c[2] - drop(c), c[1]]), low = corners.map((c) => [c[0] * side, c[3] + drop(c), c[1]])
      const inside = [0, 1, 2].map((k) => [...top, ...bottom].reduce((s, p) => s + p[k], 0) / (2 * n))
      face(top, mat, inside)
      face(bottom, mat, inside)
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        if (bevel) {
          face([top[i], top[j], high[j], high[i]], mat, inside)
          face([low[i], low[j], bottom[j], bottom[i]], mat, inside)
        }
        face([high[i], high[j], low[j], low[i]], mat, inside)
      }
    }
  }

  /**
   * Dérive : son profil vu de côté ([z, y] par coin, un contour convexe), d'épaisseur t, plantée en
   * x et penchée vers l'extérieur (lean : mètres d'écart par mètre de hauteur) ; recopiée à
   * tribord, sauf en x = 0 (une dérive dans l'axe).
   */
  function fin(profile, { x = 0, t, lean = 0 }, mat = 'hull') {
    const base = Math.min(...profile.map((p) => p[1]))
    for (const side of x ? [1, -1] : [1]) {
      const at = ([z, y], d) => [(x + lean * (y - base) + d) * side, y, z]
      const outer = profile.map((p) => at(p, t / 2)), inner = profile.map((p) => at(p, -t / 2))
      const inside = [0, 1, 2].map((k) => [...outer, ...inner].reduce((s, p) => s + p[k], 0) / (2 * profile.length))
      face(outer, mat, inside)
      face(inner, mat, inside)
      for (let i = 0; i < profile.length; i++) {
        const j = (i + 1) % profile.length
        face([outer[i], outer[j], inner[j], inner[i]], mat, inside)
      }
    }
  }

  /**
   * Tuyère : un col sombre qui dépasse de la poupe, et au fond une plage lumineuse tournée vers
   * l'arrière, ronde (r) ou en rectangle arrondi (r de large, ry de haut) ; recopiée à tribord, sauf
   * en x = 0 (une tuyère dans l'axe).
   */
  function nozzle(x, y, z, r, ry = r) {
    const back = z - Math.min(1.5, ry * 0.75)
    const corner = Math.min(r, ry) * 0.6
    loft([
      { x, z: z + 0.6, w: r * 1.12, y0: y - ry * 1.12, y1: y + ry * 1.12, c: corner * 1.1 },
      { x, z: back, w: r * 1.02, y0: y - ry * 1.02, y1: y + ry * 1.02, c: corner },
    ], { paint: () => 'dark', caps: [null, 'dark'], mirror: !!x })
    for (const side of x ? [1, -1] : [1]) {
      const ring = section({ x: x * side, z: back - 0.08, w: r * 0.8, y0: y - ry * 0.8, y1: y + ry * 0.8, c: corner * 0.8 }, 3).pts
      face(ring, 'engine', [x * side, y, back + 1])
      engines.push([x * side, y, back - 0.08, r * 0.8, ry * 0.8])
    }
  }

  /**
   * Hublots éclairés : une rangée de n petites vitres sur le flanc, du point (z0, x0) au point
   * (z1, x1) vus de dessus, à la hauteur y, hautes de h ; recopiée à tribord.
   */
  function windows(z0, x0, z1, x1, n, y, h = 1.2) {
    const step = (z1 - z0) / n
    for (let i = 0; i < n; i++) {
      const za = z0 + step * (i + 0.2), zb = z0 + step * (i + 0.8)
      const xa = x0 + ((x1 - x0) * (i + 0.2)) / n, xb = x0 + ((x1 - x0) * (i + 0.8)) / n
      for (const side of [1, -1]) {
        const out = [[xa + 0.12, y, za], [xb + 0.12, y, zb], [xb + 0.12, y + h, zb], [xa + 0.12, y + h, za]].map(([x, yy, z]) => [x * side, yy, z])
        const back = out.map(([x, yy, z]) => [x - 1.5 * side, yy, z])
        const inside = [(xa - 1) * side, y + h / 2, (za + zb) / 2]
        face(out, 'light', inside)
        for (let k = 0; k < 4; k++) face([out[k], out[(k + 1) % 4], back[(k + 1) % 4], back[k]], 'light', inside)
      }
    }
  }

  /** Un feu : un petit cube lumineux de côté r, dans la peinture `mat`. */
  function lamp(x, y, z, r, mat) {
    const h = r / 2
    const c = [[-h, -h, -h], [h, -h, -h], [h, h, -h], [-h, h, -h], [-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]].map(([a, b, d]) => [x + a, y + b, z + d])
    for (const q of [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 3, 7, 4]]) face(q.map((i) => c[i]), mat, [x, y, z])
  }

  /**
   * Les feux du vaisseau, posés d'après sa forme : rouge au point le plus à bâbord, vert à tribord
   * ('port', 'starboard'), et un feu à éclats ('beacon') au plus haut du dos et au plus bas du ventre
   * (un de chaque bord s'ils ne sont pas dans l'axe).
   */
  function beacons() {
    const pts = faces.filter((f) => f.mat !== 'engine').flatMap((f) => f.verts).filter((p) => p[0] >= 0)
    const zs = pts.map((p) => p[2])
    const r = Math.min(1, Math.max(0.22, (Math.max(...zs) - Math.min(...zs)) * 0.012))
    /** Milieu des points les plus loin le long de l'axe k (dans le sens s). */
    const extreme = (k, s) => {
      const far = Math.max(...pts.map((p) => p[k] * s))
      const near = pts.filter((p) => p[k] * s > far - 0.25)
      return [0, 1, 2].map((a) => near.reduce((t, p) => t + p[a], 0) / near.length)
    }
    const tip = extreme(0, 1)
    lamps.size = r
    lamps.port = [tip[0] + r * 0.4, tip[1], tip[2]]
    lamp(tip[0] + r * 0.4, tip[1], tip[2], r, 'port')
    lamp(-tip[0] - r * 0.4, tip[1], tip[2], r, 'starboard')
    for (const s of [1, -1]) {
      const [x, y, z] = extreme(1, s)
      for (const side of x > 0.6 ? [1, -1] : [1]) {
        lamps.beacons.push([x > 0.6 ? x * side : 0, y + s * r * 0.4, z])
        lamp(x > 0.6 ? x * side : 0, y + s * r * 0.4, z, r, 'beacon')
      }
    }
  }

  return { faces, engines, lamps, beacons, tools: { loft, plate, fin, nozzle, windows } }
}

/**
 * Le maillage d'un vaisseau : chaque face a ses propres sommets et une seule normale (pans plats),
 * tournée vers l'extérieur ; une primitive par peinture. Centré sur sa boîte.
 */
function mesh(ship, { faces, engines, lamps }) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (const f of faces) for (const p of f.verts) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], p[k])
    max[k] = Math.max(max[k], p[k])
  }
  const center = min.map((v, k) => (v + max[k]) / 2)
  const size = max.map((v, k) => +(v - min[k]).toFixed(2))
  const positions = [], normals = [], byMat = {}
  const glass = []
  for (const f of faces) {
    const v = f.verts.map((p) => p.map((c, k) => c - center[k]))
    // Normale de Newell (les pans entre deux sections ne sont pas tout à fait plans).
    const n = [0, 0, 0], c = [0, 0, 0]
    v.forEach((p, i) => {
      const q = v[(i + 1) % v.length]
      n[0] += (p[1] - q[1]) * (p[2] + q[2])
      n[1] += (p[2] - q[2]) * (p[0] + q[0])
      n[2] += (p[0] - q[0]) * (p[1] + q[1])
      for (let k = 0; k < 3; k++) c[k] += p[k] / v.length
    })
    const len = Math.hypot(...n)
    if (len < 1e-6) continue
    const outward = n.reduce((s, x, k) => s + x * (c[k] - (f.inside[k] - center[k])), 0) > 0
    const nn = n.map((x) => (outward ? x : -x) / len)
    if (!outward) v.reverse()
    const base = positions.length / 3
    for (const p of v) positions.push(...p), normals.push(...nn)
    const idx = (byMat[f.mat] ??= [])
    for (let i = 1; i + 1 < v.length; i++) idx.push(base, base + i, base + i + 1)
    if (f.mat === 'glass') glass.push([...c, len / 2])
  }
  const livery = LIVERIES[PAINT[ship.id]?.livery ?? 'faulcon']
  const colors = { hull: livery.hull, dark: livery.dark, trim: livery.trim, glass: GLASS, engine: ENGINE, ...LIGHTS }
  const unknown = Object.keys(byMat).filter((name) => !colors[name])
  if (unknown.length) throw new Error(`${ship.id} : peinture inconnue (${unknown.join(', ')})`)
  const groups = Object.keys(colors).filter((name) => byMat[name]).map((name) => ({
    name,
    indices: byMat[name],
    color: srgb(colors[name]),
    emissive: name === 'engine' ? srgb(ENGINE) : name === 'glass' ? srgb('#173a5c') : LIGHTS[name] ? srgb(LIGHTS[name]) : null,
  }))
  const pos = new Float32Array(positions)
  const all = groups.flatMap((g) => g.indices)
  const area = glass.reduce((s, g) => s + g[3], 0)
  const extras = {
    name: ship.name,
    maker: ship.maker,
    size,
    engines: engines.map(([x, y, z, rx, ry]) => [x - center[0], y - center[1], z - center[2], rx, ry].map((v) => +v.toFixed(2))),
    ...(area ? { canopy: [0, 1, 2].map((k) => +(glass.reduce((s, g) => s + g[k] * g[3], 0) / area).toFixed(2)) } : {}),
    lamps: {
      size: +lamps.size.toFixed(2),
      port: lamps.port.map((v, k) => +(v - center[k]).toFixed(2)),
      beacons: lamps.beacons.map((b) => b.map((v, k) => +(v - center[k]).toFixed(2))),
    },
    plan: groundPlan(pos, all, size),
    livery: { hull: livery.hull, belly: livery.belly, dark: livery.dark, trim: livery.trim },
    credit: credit(ship),
  }
  extras.silhouette = silhouette(extras.plan, size)
  // Aucun pan laissé en graphite par le shader (attribut _BARE à zéro) : les pièces sombres sont des pièces à part.
  return { glb: writeGlb(ship.id, pos, new Float32Array(normals), groups, extras, new Uint8Array(pos.length / 3)), extras, triangles: all.length / 3, panels: faces.length }
}

/** Le modèle d'origine dont les cotes sont relevées. */
const credit = (s) => s.thing
  ? `Kahnindustries, https://www.thingiverse.com/thing:${s.thing}, CC BY 3.0`
  : `Kahnindustries (David Williams), « ${s.zip.replace(/\.zip$/, '')} », licence ${s.license}`

const args = process.argv.slice(2)
let out = null
const only = []
while (args.length) {
  const a = args.shift()
  if (a === '--out') out = args.shift()
  else only.push(a)
}
const dest = out ?? fileURLToPath(new URL('../public/assets/ships/', import.meta.url))
mkdirSync(dest, { recursive: true })
const credits = [], catalog = []
const missing = SHIPS.filter((s) => !MODELS[s.id]).map((s) => s.id)
for (const ship of SHIPS) {
  if ((only.length && !only.includes(ship.id)) || !MODELS[ship.id]) continue
  const k = kit()
  MODELS[ship.id](k.tools)
  k.beacons()
  const { glb, extras, triangles, panels } = mesh(ship, k)
  writeFileSync(join(dest, `${ship.id}.glb`), glb)
  credits.push(`${ship.name} : ${extras.credit}`)
  catalog.push({ id: ship.id, name: ship.name, maker: ship.maker, size: extras.size, silhouette: extras.silhouette })
  console.log(`${ship.id.padEnd(22)} ${String(panels).padStart(5)} pans, ${String(triangles).padStart(5)} triangles, ${extras.size.join(' × ')} m`)
}
if (missing.length) console.warn(`Pas encore modelés : ${missing.join(', ')}`)
if (!out && !only.length && !missing.length) {
  writeFileSync(join(dest, 'catalog.json'), JSON.stringify(catalog))
  writeFileSync(join(dest, 'CREDITS.txt'), [
    "Vaisseaux d'Elite Dangerous (Frontier Developments), remodelés pour Mini Interior à la façon des",
    'éléments du jeu (scripts/build-ed-ships.mjs, scripts/ed-ships-models.mjs). Leurs cotes sont relevées',
    'sur les modèles imprimables « 2 Part (Elite Dangerous) » de Kahnindustries (David Williams).',
    "Licences des modèles d'origine :",
    '',
    ...credits,
    '',
    'Peintures (paints.json) : les noms et les couleurs des peintures de la boutique d\'Elite Dangerous',
    '(Frontier Developments), relevés sur ses vignettes par scripts/import-ed-paints.mjs ; leurs motifs',
    'sont redessinés pour le jeu (src/ship-paint.ts).',
    '',
  ].join('\n'))
}
