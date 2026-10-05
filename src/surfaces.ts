import * as THREE from 'three'
import { renderQuality } from './quality'

/*
 * Matières : le grain des surfaces (tissu, bois, métal brossé, cuir, verre, tôles de la coque),
 * ajouté dans les shaders des matériaux existants plutôt que par des textures plaquées. Les
 * modèles du vaisseau n'ont pas de coordonnées de texture utilisables (le kit de Kenney pointe
 * dans une palette, le mobilier fait main est fusionné en couleurs par sommet) : chaque matière se
 * projette donc sur les trois plans (triplanaire), dans le repère de l'objet. La géométrie fusionnée
 * d'un pont est dans le repère du pont, si bien que le motif court d'un meuble ou d'une tuile à
 * l'autre sans couture, et ne glisse pas sur une pièce qui bouge.
 *
 * Les motifs sont calculés une fois au démarrage dans deux petites textures qui se raccordent de
 * tous côtés (aucun fichier à charger) ; une matière ne fait que moduler la couleur d'origine, qui
 * reste celle du thème, de la variante ou de la teinte choisie.
 *
 * Le mobilier fusionné porte sa matière par sommet (attribut `aSurf`, cf. compact() dans
 * furniture/kit.ts) : un meuble de bois et de tissu reste un seul appel de dessin.
 */

/** Matières disponibles ; `hull`, `rust` et `cozy` distinguent le sol (faces tournées vers le haut) des murs. */
export type Surface =
  | 'grain' // peinture, plastique : un grain fin
  | 'metal' // métal brossé
  | 'wood' // veinage du bois
  | 'cloth' // tissage et chiné d'un tissu
  | 'leather' // cuir grenu
  | 'glass' // reflets en biais et poussières (verre transparent)
  | 'hull' // coque : tôles brossées aux murs, sol rayé, un peu de crasse
  | 'rust' // la cale : la coque, plus sale, avec des coulures de rouille
  | 'cozy' // quartiers : murs enduits, parquet au sol
  | 'tile' // tomettes : terre cuite nuancée

const KIND: Record<Surface, number> = { grain: 1, metal: 2, wood: 3, cloth: 4, leather: 5, glass: 6, hull: 7, rust: 8, cozy: 9, tile: 10 }

/** Numéro d'une matière pour l'attribut `aSurf` (0 : aucune). */
export const surfaceKind = (s: Surface | undefined): number => (s ? KIND[s] : 0)

// ---------------------------------------------------------------- motifs

/** Côté des textures de motifs, en pixels. */
const N = 256

/** Aléatoire déterministe (mulberry32) : le même vaisseau chez tout le monde. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Bruit de valeurs qui se raccorde sur le carré : `cx` × `cy` cellules sur le côté, lissées.
 * Rend une fonction de (x, y) en pixels, à valeurs dans [0, 1].
 */
function tiledNoise(cx: number, cy: number, seed: number): (x: number, y: number) => number {
  const random = rng(seed)
  const grid = Float32Array.from({ length: cx * cy }, random)
  const at = (i: number, j: number) => grid[(((j % cy) + cy) % cy) * cx + (((i % cx) + cx) % cx)]
  const smooth = (t: number) => t * t * (3 - 2 * t)
  return (x, y) => {
    const u = (x / N) * cx, v = (y / N) * cy
    const i = Math.floor(u), j = Math.floor(v)
    const fu = smooth(u - i), fv = smooth(v - j)
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * fu
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fu
    return a + (b - a) * fv
  }
}

/** Somme d'octaves de bruit (cellules carrées), normalisée dans [0, 1]. */
function fbm(cells: number[], seed: number): (x: number, y: number) => number {
  const layers = cells.map((c, k) => ({ f: tiledNoise(c, c, seed + k * 101), w: 1 / (k + 1) }))
  const total = layers.reduce((s, l) => s + l.w, 0)
  return (x, y) => layers.reduce((s, l) => s + l.f(x, y) * l.w, 0) / total
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** Remplit un canal (0 à 3) d'une texture RGBA avec `f(x, y)` dans [0, 1]. */
function fill(data: Uint8Array, channel: number, f: (x: number, y: number) => number) {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) data[(y * N + x) * 4 + channel] = Math.round(clamp01(f(x, y)) * 255)
}

/** Champ de valeurs où l'on trace des traits (rayures, éraflures), raccordé sur les bords. */
class Strokes {
  readonly v = new Float32Array(N * N).fill(0.5)
  /** Trait de (x, y), long de `len`, d'angle `a`, qui pousse la valeur vers `to` de `k` (largeur ~1 px). */
  line(x: number, y: number, len: number, a: number, to: number, k: number, bend = 0) {
    for (let s = 0; s <= len; s += 0.5) {
      const t = s / Math.max(1, len)
      const ang = a + bend * (t - 0.5)
      const px = x + Math.cos(ang) * s, py = y + Math.sin(ang) * s
      // Plus marqué au milieu du trait qu'à ses bouts.
      const w = k * Math.sin(Math.PI * t) ** 0.5
      const i = ((Math.round(py) % N) + N) % N * N + ((Math.round(px) % N) + N) % N
      this.v[i] += (to - this.v[i]) * w
    }
  }
  at = (x: number, y: number) => this.v[y * N + x]
}

/**
 * Première texture : R tissage (fils de 16 px, chinés), G veinage du bois (le long de x), B métal
 * brossé (le long de x, avec quelques rayures), A grain fin (peinture, enduit, poussières).
 */
function patternsA(): Uint8Array {
  const data = new Uint8Array(N * N * 4)
  // Tissage toile : un fil sur deux passe dessus, en damier ; chaque fil a sa nuance (le chiné).
  const T = 16, threads = N / T
  const tone = rng(11)
  const warp = Float32Array.from({ length: threads }, () => tone())
  const weft = Float32Array.from({ length: threads }, () => tone())
  const slub = fbm([8, 16], 12)
  fill(data, 0, (x, y) => {
    const i = Math.floor(x / T), j = Math.floor(y / T)
    const fx = (x % T) / T, fy = (y % T) / T
    // Le fil de chaîne (vertical) est dessus quand (i + j) est pair, celui de trame sinon.
    const up = (i + j) % 2 === 0
    const across = up ? fx : fy
    const along = up ? fy : fx
    const round = Math.sin(Math.PI * across) ** 0.7 * (0.82 + 0.18 * Math.sin(Math.PI * along))
    const shade = (up ? warp[i] : weft[j]) - 0.5
    return 0.18 + 0.62 * round + 0.14 * shade + 0.25 * (slub(x, y) - 0.5)
  })
  // Bois : des cernes le long de x, ondulés par un bruit, et de fines fibres.
  const ripple = fbm([4, 8], 21)
  const fibers = tiledNoise(6, 160, 22)
  const RINGS = 9
  fill(data, 1, (x, y) => {
    const t = (y / N) * RINGS + (ripple(x, y) - 0.5) * 2.2
    const r = t - Math.floor(t)
    // Bois de printemps clair, puis bois d'été plus sombre qui se termine net.
    const ring = smoothstep(0.0, 0.08, r) * (1 - smoothstep(0.55, 0.98, r)) * 0.7 + smoothstep(0.55, 0.98, r) * 0.15
    return 0.3 + 0.45 * ring + 0.3 * (fibers(x, y) - 0.5)
  })
  // Métal brossé : des stries le long de x, quelques rayures plus nettes.
  const brushFine = tiledNoise(4, 256, 31)
  const brushWide = tiledNoise(2, 48, 32)
  const scratches = new Strokes()
  const sr = rng(33)
  for (let i = 0; i < 28; i++) scratches.line(sr() * N, sr() * N, 20 + sr() * 70, (sr() - 0.5) * 0.6, sr() < 0.6 ? 1 : 0, 0.35)
  fill(data, 2, (x, y) => 0.5 + 0.45 * (brushFine(x, y) - 0.5) + 0.3 * (brushWide(x, y) - 0.5) + (scratches.at(x, y) - 0.5) * 0.9)
  // Grain : plusieurs octaves, un peu de piqué.
  const grain = fbm([16, 32, 64, 128], 41)
  fill(data, 3, (x, y) => 0.5 + (grain(x, y) - 0.5) * 1.8)
  return data
}

/**
 * Seconde texture : R cuir grenu (cellules), G éraflures et traces d'usure (sols), B reflets en
 * biais (verre), A taches de crasse, en grandes plaques (0 propre, 1 sale).
 */
function patternsB(): Uint8Array {
  const data = new Uint8Array(N * N * 4)
  // Cuir : des grains (cellules de Voronoï) séparés par de petits plis sombres.
  const G = 22, cell = N / G, pr = rng(51)
  const pts = Float32Array.from({ length: G * G * 2 }, () => 0.15 + pr() * 0.7)
  const crease = fbm([6, 12], 52)
  fill(data, 0, (x, y) => {
    const ci = Math.floor(x / cell), cj = Math.floor(y / cell)
    let f1 = 1e9, f2 = 1e9
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const i = ci + di, j = cj + dj
        const k = ((((j % G) + G) % G) * G + (((i % G) + G) % G)) * 2
        const dx = (i + pts[k]) * cell - x, dy = (j + pts[k + 1]) * cell - y
        const d = Math.hypot(dx, dy)
        if (d < f1) [f1, f2] = [d, f1]
        else if (d < f2) f2 = d
      }
    }
    const edge = smoothstep(0, cell * 0.35, f2 - f1)
    const dome = 1 - smoothstep(0, cell * 0.7, f1)
    return 0.25 + 0.45 * edge + 0.15 * dome + 0.35 * (crease(x, y) - 0.5)
  })
  // Sols : éraflures claires (talons, chariots), traces sombres (semelles), quelques longues rayures.
  const wear = new Strokes()
  const wr = rng(61)
  for (let i = 0; i < 90; i++) wear.line(wr() * N, wr() * N, 6 + wr() * 26, wr() * Math.PI * 2, 0.95, 0.5, (wr() - 0.5) * 1.6)
  for (let i = 0; i < 40; i++) wear.line(wr() * N, wr() * N, 4 + wr() * 14, wr() * Math.PI * 2, 0.08, 0.35, (wr() - 0.5) * 2.5)
  for (let i = 0; i < 10; i++) wear.line(wr() * N, wr() * N, 60 + wr() * 120, wr() * Math.PI, 0.9, 0.3, (wr() - 0.5) * 0.3)
  const scuffs = fbm([8, 16, 32], 62)
  fill(data, 1, (x, y) => wear.at(x, y) + (scuffs(x, y) - 0.5) * 0.35)
  // Verre : des bandes en biais (x + y constant, raccordées à N près), larges et douces ou fines et nettes.
  const bands: [number, number, number][] = [[40, 22, 0.35], [70, 3, 0.9], [128, 9, 0.5], [190, 34, 0.22], [214, 2.5, 0.8]]
  const dust = rng(71)
  const specks = new Strokes()
  for (let i = 0; i < 60; i++) specks.line(dust() * N, dust() * N, dust() < 0.2 ? 4 + dust() * 8 : 1, dust() * Math.PI, 1, 0.6)
  fill(data, 2, (x, y) => {
    let v = 0
    for (const [at, width, k] of bands) {
      let d = Math.abs(((x + y - at) % N + N) % N)
      d = Math.min(d, N - d)
      v += k * Math.exp(-((d / width) ** 2))
    }
    return v + (specks.at(x, y) - 0.5) * 0.8
  })
  // Crasse : de grandes plaques aux bords flous, plus des coulures verticales (le long de y).
  const blotch = fbm([3, 6, 12], 81)
  const drips = tiledNoise(48, 3, 82)
  fill(data, 3, (x, y) => smoothstep(0.5, 0.72, blotch(x, y)) * 0.85 + smoothstep(0.62, 0.9, drips(x, y)) * 0.35)
  return data
}

function patternTexture(data: Uint8Array): THREE.DataTexture {
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.anisotropy = 8
  t.needsUpdate = true
  return t
}

let textures: { a: THREE.DataTexture; b: THREE.DataTexture } | null = null
/** Interrupteur commun : coupé en mode graphique léger (cf. quality.ts), sans recompiler. */
const enabled = {
  get value() {
    return renderQuality.light ? 0 : 1
  },
}

function uniforms() {
  textures ??= { a: patternTexture(patternsA()), b: patternTexture(patternsB()) }
  return { uSurfA: { value: textures.a }, uSurfB: { value: textures.b }, uSurfOn: enabled }
}

// ---------------------------------------------------------------- shader

const VERTEX_HEAD = `
varying vec3 vSurfPos;
varying vec3 vSurfNormal;
#ifdef SURF_ATTR
attribute float aSurf;
varying float vSurfKind;
#endif
`

const VERTEX_BODY = `#include <begin_vertex>
  vSurfPos = position;
  vSurfNormal = normal;
  #ifdef USE_INSTANCING
    vSurfPos = (instanceMatrix * vec4(position, 1.0)).xyz;
    vSurfNormal = mat3(instanceMatrix) * normal;
  #endif
  #ifdef SURF_ATTR
    vSurfKind = aSurf;
  #endif
`

const FRAGMENT_HEAD = `
uniform sampler2D uSurfA;
uniform sampler2D uSurfB;
uniform float uSurfOn;
varying vec3 vSurfPos;
varying vec3 vSurfNormal;
#ifdef SURF_ATTR
varying float vSurfKind;
#endif

// Projection sur les trois plans, pondérée par la normale ; s : côté du motif, en mètres.
// Les motifs orientés (veinage, brossage) courent le long de x, ou de z sur les faces tournées vers x.
vec4 surfTri(sampler2D t, vec3 p, vec3 w, float s) {
  return texture2D(t, p.zy / s) * w.x + texture2D(t, p.xz / s) * w.y + texture2D(t, p.xy / s) * w.z;
}

float surfHash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// Parquet (sol des quartiers) : lames de 20 cm le long de x, de longueurs décalées, joints sombres.
float surfParquet(vec3 p) {
  float row = floor(p.z * 5.0);
  float shift = surfHash(vec2(row, 3.1)) * 1.9;
  float u = p.x + shift;
  float plank = floor(u / 1.25);
  float tone = surfHash(vec2(row, plank));
  float grain = texture2D(uSurfA, vec2(u * 0.9 + tone * 7.0, p.z * 1.6 + row * 0.37) / 0.65).g;
  float across = fract(p.z * 5.0);
  float seam = smoothstep(0.0, 0.05, min(across, 1.0 - across));
  float along = fract(u / 1.25) * 1.25;
  seam *= smoothstep(0.0, 0.01, min(along, 1.25 - along));
  return (1.0 + 0.5 * (grain - 0.5) + 0.26 * (tone - 0.5)) * mix(0.6, 1.0, seam);
}
`

/**
 * Le grain, appliqué à diffuseColor après les couleurs (sommet, carte) ; `surfSheen` : reflet du
 * verre, ajouté à la lumière sortante (cf. FRAGMENT_SHEEN).
 */
const FRAGMENT_BODY = `#include <color_fragment>
  float surfSheen = 0.0;
  {
    #ifdef SURF_ATTR
      int sk = int(vSurfKind + 0.5);
    #else
      int sk = SURF_KIND;
    #endif
    if (sk > 0 && uSurfOn > 0.5) {
      vec3 sn = normalize(vSurfNormal);
      vec3 sw = pow(abs(sn), vec3(4.0));
      sw /= sw.x + sw.y + sw.z;
      vec3 sp = vSurfPos;
      bool up = sn.y > 0.6;
      float m = 1.0;
      if (sk == 1) {
        m += 0.22 * (surfTri(uSurfA, sp, sw, 0.7).a - 0.5);
      } else if (sk == 2) {
        vec4 a = surfTri(uSurfA, sp, sw, 0.45);
        m += 0.4 * (a.b - 0.5) + 0.14 * (a.a - 0.5);
      } else if (sk == 3) {
        vec4 a = surfTri(uSurfA, sp, sw, 0.6);
        m += 0.6 * (a.g - 0.5);
      } else if (sk == 4) {
        float weave = surfTri(uSurfA, sp, sw, 0.28).r;
        float mottle = surfTri(uSurfA, sp, sw, 0.6).a;
        m += 0.42 * (weave - 0.5) + 0.3 * (mottle - 0.5);
      } else if (sk == 5) {
        float pebble = surfTri(uSurfB, sp, sw, 0.4).r;
        float wear = surfTri(uSurfA, sp, sw, 0.7).a;
        m += 0.45 * (pebble - 0.5) + 0.26 * (wear - 0.5);
      } else if (sk == 6) {
        #ifndef USE_MAP
          // Reflets presque effacés quand le verre l'est (vue subjective, cf. firstPersonGlass).
          float sheen = surfTri(uSurfB, sp, sw, 1.7).b;
          surfSheen = clamp(sheen, 0.0, 1.0) * smoothstep(0.03, 0.17, opacity);
          diffuseColor.a = min(1.0, diffuseColor.a + surfSheen * 0.45);
        #endif
      } else if (sk >= 7) {
        float dirt = surfTri(uSurfB, sp, sw, 3.2).a;
        if (up && sk == 9) {
          m *= surfParquet(sp);
          m -= 0.1 * dirt;
        } else if (up) {
          vec4 b = surfTri(uSurfB, sp, sw, 2.2);
          float wear = sk == 8 ? 0.6 : 0.45;
          m += wear * (b.g - 0.5) + 0.12 * (surfTri(uSurfA, sp, sw, 0.7).a - 0.5);
          m -= (sk == 8 ? 0.32 : sk == 10 ? 0.08 : 0.18) * dirt;
          if (sk == 10) m += 0.24 * (surfTri(uSurfB, sp, sw, 0.9).a - 0.3);
        } else if (sk >= 9) {
          // Enduit des quartiers, brique ou terre cuite : un grain, sans brossage.
          m += (sk == 10 ? 0.26 : 0.18) * (surfTri(uSurfA, sp, sw, 0.5).a - 0.5) - 0.08 * dirt;
        } else {
          vec4 a = surfTri(uSurfA, sp, sw, 1.0);
          m += 0.3 * (a.b - 0.5) + 0.12 * (a.a - 0.5);
          m -= (sk == 8 ? 0.3 : 0.16) * dirt;
        }
        // La cale : coulures et plaques de rouille, plus chaudes que l'acier.
        if (sk == 8) diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.35, 0.82, 0.52), clamp(dirt * 0.9, 0.0, 1.0));
      }
      diffuseColor.rgb *= max(m, 0.0);
    }
  }
`

const FRAGMENT_SHEEN = `outgoingLight += vec3(surfSheen * 0.9);
#include <opaque_fragment>`

/** Raccroche les morceaux de shader d'une matière (`kind`), ou de celle de chaque sommet (`attr`). */
function patch(shader: THREE.WebGLProgramParametersWithUniforms, kind: number | 'attr') {
  Object.assign(shader.uniforms, uniforms())
  const define = kind === 'attr' ? '#define SURF_ATTR\n' : `#define SURF_KIND ${kind}\n`
  shader.vertexShader = define + VERTEX_HEAD + shader.vertexShader.replace('#include <begin_vertex>', VERTEX_BODY)
  shader.fragmentShader = define + FRAGMENT_HEAD + shader.fragmentShader
    .replace('#include <color_fragment>', FRAGMENT_BODY)
    .replace('#include <opaque_fragment>', FRAGMENT_SHEEN)
}

/**
 * Donne une matière à un matériau (Lambert, Phong, Basic…) ; renvoie le matériau. Ses copies
 * (material.clone()) gardent `userData.surface` mais pas le shader : les reprendre au besoin.
 */
export function withSurface<M extends THREE.Material>(material: M, surface: Surface): M {
  const kind = KIND[surface]
  material.userData.surface = surface
  material.onBeforeCompile = (shader) => patch(shader, kind)
  material.customProgramCacheKey = () => `surface:${kind}`
  material.needsUpdate = true
  return material
}

/** Matériau dont la matière est portée par chaque sommet (attribut `aSurf`, cf. surfaceKind). */
export function withSurfaceAttribute<M extends THREE.Material>(material: M): M {
  material.userData.surfaceAttribute = true
  material.onBeforeCompile = (shader) => patch(shader, 'attr')
  material.customProgramCacheKey = () => 'surface:attr'
  material.needsUpdate = true
  return material
}

/**
 * Matière devinée d'après la couleur, pour le mobilier fait main qui n'en précise pas : les gris
 * (acier, chrome, plastique noir) en métal brossé, le reste avec un grain fin.
 */
export function guessSurface(color: THREE.Color): Surface {
  const hsl = color.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace)
  return hsl.s < 0.14 && hsl.l < 0.8 ? 'metal' : 'grain'
}
