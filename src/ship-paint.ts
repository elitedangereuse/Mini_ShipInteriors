import * as THREE from 'three'
import { BASE } from './assets'
import { patchLightField } from './lighting/field'
import { elitePaint } from '../shared/elite-paints.js'

/*
 * Les peintures des vaisseaux d'Elite Dangerous (cf. ed-ships.ts) : celles de la boutique du jeu,
 * relevées pour nos 32 modèles (public/assets/ships/paints.json : noms, familles, couleurs tirées
 * des vignettes de la boutique), plus la livrée du constructeur.
 *
 * Les modèles n'ont pas de coordonnées de texture : la coque est peinte par son shader, dans le
 * repère du vaisseau. Chaque famille de la boutique (Tactical, Predator, Shock…) a son motif (cf.
 * FAMILIES) : bandes, damiers, camouflages, flammes, écailles, éclats, éclairs lumineux, métal… ; ses
 * coloris n'en changent que les couleurs. Le motif suit le vaisseau à sa taille (les cellules d'un
 * camouflage grandissent avec la coque, sans s'étirer), et une carte de distance au bord de la
 * coque vue de dessus (cf. edgeField) pose les liserés, les bouts d'ailes et les lueurs des arêtes.
 *
 * Le choix d'une peinture est gardé dans ce navigateur, vaisseau par vaisseau (cf. paintOf) ; sans
 * choix, le vaisseau porte la peinture qu'il a dans Elite Dangerous (cf. saveElitePaint).
 */

/** Une peinture : son nom (celui de la boutique), sa famille (le motif), ses couleurs (sRGB). */
export interface ShipPaint {
  id: string
  name: string
  family: string
  /** Fond, deuxième et troisième couleurs, touche. */
  colors: [string, string, string, string]
  /** Couleur des parties lumineuses (peintures qui brillent). */
  glow?: string
}

/** La livrée du constructeur (extras du modèle, cf. scripts/import-ed-ships.mjs). */
export interface Livery {
  hull: string
  belly: string
  dark: string
  trim: string
}

/** Identifiant de la livrée du constructeur, la peinture de départ de chaque vaisseau. */
export const FACTORY = 'factory'

// ---------------------------------------------------------------- motifs (cf. paintAt dans le shader)

/** Motifs du shader. */
const P = { Solid: 0, Belly: 1, Stripes: 2, Bands: 3, Checker: 4, Camo: 5, Splinter: 6, Flames: 7, Splatter: 8, Scales: 9, Tips: 10, Swoosh: 11, Dazzle: 12, Stars: 13, Synthwave: 14, Halftone: 15, Heraldic: 16, Panels: 17, Lines: 18, Chevrons: 19, Gradient: 20, TwoTone: 21, Tiger: 22, Mottle: 23 } as const

/** Lueurs du shader. */
const G = { None: 0, Lightning: 1, Circuit: 2, Edge: 3, Grid: 4, Rings: 5, Contours: 6 } as const

/** Finis : reflet, brillance, part de métal (le reflet prend la couleur, le fond s'assombrit). */
const FINISH = {
  matte: [0.015, 8, 0],
  satin: [0.04, 20, 0],
  gloss: [0.09, 48, 0],
  metal: [0.22, 30, 0.6],
  chrome: [0.38, 60, 0.8],
} as const

type Finish = keyof typeof FINISH

/**
 * Le motif d'une famille. `p` : échelle (cellules par unité de motif) puis quatre réglages (a, b,
 * c, d, propres à chaque motif, cf. le shader). `edge` : liseré le long du bord de la coque vue de
 * dessus (largeur en unités de motif, couleur 0-3). `glow`, `g` : lueur et ses réglages (échelle,
 * largeur, a, b). `belly` : le ventre assombri d'autant.
 */
interface Recipe {
  /** Nom de la famille dans le registre. */
  label: string
  style: number
  p?: [number, number, number, number, number]
  edge?: [number, number]
  glow?: number
  g?: [number, number, number, number]
  finish?: Finish
  belly?: number
}

/**
 * Les familles de la boutique. Les motifs reprennent ce que montrent les vignettes (vues de dessus) :
 * l'essentiel des formes et des couleurs, pas le détail (les lettres, les blasons).
 */
export const FAMILIES: Record<string, Recipe> = {
  [FACTORY]: { label: 'Livrée du constructeur', style: P.Belly, finish: 'satin' },
  vibrant: { label: 'Vibrant', style: P.Mottle, p: [0.5, 0.35, 0.15, 0, 0], finish: 'gloss' },
  marquess: { label: 'Marquess', style: P.Heraldic, p: [1.6, 0.15, 0, 0, 0], finish: 'satin' },
  ruby: { label: 'Ruby Anniversary', style: P.Gradient, p: [1, 1, 0.3, 1, 0.5], glow: G.Edge, g: [0, 0.25, 0.8, 0], finish: 'gloss' },
  pulse: { label: 'Pulse', style: P.Mottle, p: [0.6, 0.4, 0, 0, 0], glow: G.Contours, g: [1.5, 0.06, 2, 0.42], finish: 'satin' },
  stygian: { label: 'Stygian', style: P.Mottle, p: [0.35, 0.55, 0.45, 0, 0], finish: 'metal' },
  squadron: { label: 'Squadron', style: P.Stripes, p: [1, 0.55, 0.06, 0.03, 0], edge: [0.18, 1], finish: 'satin' },
  midnight: { label: 'Midnight Black', style: P.Mottle, p: [0.4, 0.3, 0, 0, 0], finish: 'gloss', belly: 0.1 },
  tactical: { label: 'Tactical', style: P.Panels, p: [1.1, 0.18, 0.08, 0.3, 0], finish: 'matte' },
  pirate: { label: 'Pirate Faction', style: P.Camo, p: [0.45, 0.58, 0.7, 0.78, 0], finish: 'satin' },
  ignition: { label: 'Ignition', style: P.Flames, p: [1, -1, 0.75, 0.9, 0], finish: 'gloss' },
  camo: { label: 'Camo', style: P.Camo, p: [0.5, 0.5, 0.56, 0.62, 0], finish: 'matte' },
  sonoran: { label: 'Sonoran', style: P.Stripes, p: [1, 0.5, 0.07, 0.035, 0], finish: 'satin' },
  mojave: { label: 'Mojave', style: P.TwoTone, p: [1, 1, -0.3, 0.025, 0], finish: 'satin' },
  colorado: { label: 'Colorado', style: P.Solid, edge: [0.3, 1], finish: 'satin' },
  crossfire: { label: 'Crossfire', style: P.Camo, p: [0.55, 0.5, 0.55, 0.64, 2.5], finish: 'matte' },
  speedway: { label: 'Speedway', style: P.Stripes, p: [1, 0.7, 0.35, 0.1, 0.12], edge: [0.25, 2], finish: 'gloss' },
  mohawk: { label: 'Mohawk', style: P.TwoTone, p: [1, 2, 0.42, 0.02, 0], finish: 'gloss' },
  empire: { label: 'Empire', style: P.Swoosh, p: [1, 0.35, 0.18, 0.07, 2.4], edge: [0.22, 2], finish: 'gloss' },
  osiris: { label: 'Osiris', style: P.Lines, p: [0.8, 0.5, 0.05, 0.4, 0], edge: [0.4, 1], finish: 'satin' },
  predator: { label: 'Predator', style: P.Flames, p: [1, 1, 0.75, 0.9, 0], finish: 'gloss' },
  slipstream: { label: 'Slipstream', style: P.Swoosh, p: [1, 0.3, 0.25, 0.1, 3.2], finish: 'gloss' },
  snakewrap: { label: 'Snake Wrap', style: P.Scales, p: [1.3, 0.12, 0, 0, 0], finish: 'gloss' },
  razor: { label: 'Razor', style: P.Splinter, p: [0.55, 0.28, 0.12, 0, 0.7], finish: 'metal' },
  galvanized: { label: 'Galvanized', style: P.Mottle, p: [0.3, 0.5, 0.35, 0, 0], finish: 'chrome' },
  blackjack: { label: 'Blackjack', style: P.Stripes, p: [1, 0, 0.32, 0, 0], edge: [0.4, 1], finish: 'gloss' },
  synth: { label: 'Synth', style: P.Halftone, p: [1.5, 1, 0, 0, 0], finish: 'satin' },
  sidestripe: { label: 'Sidestripe', style: P.Bands, p: [1, 0.9, 4.5, 0.1, 0], finish: 'satin' },
  independent: { label: 'Independent', style: P.Tiger, p: [1, 4.2, 1.4, 0.45, 0], finish: 'satin' },
  salvage: { label: 'Salvage', style: P.Stripes, p: [1, 0.85, 0.07, 0.05, 0], edge: [0.18, 1], finish: 'matte' },
  overdrive: { label: 'Overdrive', style: P.Synthwave, p: [1, 0.1, 0.32, 0, 0], glow: G.Grid, g: [0.9, 0.06, 0, 0], finish: 'gloss' },
  polarity: { label: 'Polarity', style: P.Tips, p: [1, 0.9, -0.2, 0.55, 0], finish: 'metal' },
  apollo: { label: 'Apollo', style: P.Bands, p: [1, 0.7, 3.2, 0.12, 0], finish: 'satin' },
  fusion: { label: 'Fusion', style: P.Mottle, p: [0.5, 0.45, 0, 0, 0], glow: G.Circuit, g: [0.6, 0.06, 0.6, 0], finish: 'satin' },
  medusa: { label: 'Medusa', style: P.Camo, p: [0.6, 0.52, 2, 2, 0], finish: 'satin' },
  onionhead: { label: 'Onionhead', style: P.Mottle, p: [0.5, 0.3, 0, 0, 0], glow: G.Rings, g: [0.55, 0.045, 0.35, 0], finish: 'satin' },
  serpent: { label: 'Serpent', style: P.TwoTone, p: [1, 3, 0.1, 0.03, 0], finish: 'gloss' },
  rattler: { label: 'Rattler', style: P.Stripes, p: [1, 0.45, 0.1, 0.05, 0.06], finish: 'gloss' },
  militarystripe: { label: 'Military Stripe', style: P.Stripes, p: [1, 0.35, 0.05, 0.03, 0], finish: 'matte' },
  mechanist: { label: 'Mechanist', style: P.Checker, p: [1.4, 1, 0, 0, 0], finish: 'satin' },
  pharaoh: { label: 'Pharaoh', style: P.TwoTone, p: [1, 5, 0.3, 0.02, 0], edge: [0.25, 1], finish: 'satin' },
  operator: { label: 'Operator', style: P.Mottle, p: [0.4, 0.3, 0, 0, 0], glow: G.Edge, g: [0, 0.14, 0, 0], finish: 'satin' },
  militarygreen: { label: 'Military', style: P.Mottle, p: [0.5, 0.35, 0, 0, 0], finish: 'matte' },
  militaryblue: { label: 'Military', style: P.Mottle, p: [0.5, 0.35, 0, 0, 0], finish: 'matte' },
  asemic: { label: 'Asemic', style: P.Lines, p: [0.9, 0.9, 0.08, 0.55, 1], finish: 'gloss' },
  messenger: { label: 'Messenger', style: P.Swoosh, p: [1, 0.55, 0.15, 0.06, 2], finish: 'gloss' },
  icarus: { label: 'Icarus', style: P.Splinter, p: [0.65, 0.22, 0.14, 0.06, 1.2], finish: 'satin' },
  crypsis: { label: 'Crypsis', style: P.Lines, p: [1.1, 0.5, 0.07, 0.6, 0], finish: 'matte' },
  flash: { label: 'Flash', style: P.Bands, p: [1, -0.7, 3, 0.25, 0], edge: [0.35, 2], finish: 'gloss' },
  shock: { label: 'Shock', style: P.Mottle, p: [0.5, 0.3, 0.1, 0, 0], glow: G.Lightning, g: [0.45, 0.045, 0.6, 0], finish: 'satin' },
  lakon: { label: 'Lakon Metallic', style: P.Mottle, p: [0.3, 0.45, 0.3, 0, 0], finish: 'metal' },
  turbulence: { label: 'Turbulence', style: P.Bands, p: [1, 0.75, 1.5, 0.5, 0], finish: 'satin' },
  arrowhead: { label: 'Arrowhead', style: P.Chevrons, p: [1, 0.8, 3.6, 0.25, 0], finish: 'satin' },
  expressway: { label: 'Expressway', style: P.Swoosh, p: [1, 0.45, 0.2, 0.08, 2.2], finish: 'gloss' },
  sheerline: { label: 'Sheer Line', style: P.TwoTone, p: [1, 4, -0.15, 0.03, 0], edge: [0.2, 2], finish: 'gloss' },
  aquatic: { label: 'Aquatic', style: P.Bands, p: [1, 1.57, 2.2, 0.45, 0], finish: 'gloss' },
  taxi: { label: 'Taxi', style: P.Checker, p: [2.2, 5, 0, 0, 0], finish: 'gloss' },
  ember: { label: 'Ember', style: P.Gradient, p: [1, -1, -0.2, 0.9, 0], finish: 'gloss' },
  excursion: { label: 'Excursion', style: P.Swoosh, p: [1, 0.5, 0.25, 0.1, 2.6], finish: 'gloss' },
  odyssey: { label: 'Odyssey', style: P.Swoosh, p: [1, 0.6, 0.12, 0.05, 1.8], finish: 'gloss' },
  wayfarer: { label: 'Wayfarer', style: P.TwoTone, p: [1, 4, -0.1, 0.03, 0], finish: 'gloss' },
  acceleration: { label: 'Acceleration', style: P.Stars, p: [1, 1.2, 0, 0, 0], finish: 'gloss' },
  shatter: { label: 'Shatter', style: P.Splatter, p: [1.2, 1, 0.6, 0, 0], finish: 'gloss' },
  precision: { label: 'Precision', style: P.Lines, p: [0.8, 0, 0.05, 0.3, 0], edge: [0.3, 1], finish: 'satin' },
  allied: { label: 'Allied', style: P.Splinter, p: [0.35, 0.35, 0.2, 0.1, 0.4], finish: 'satin' },
  federation: { label: 'Federation', style: P.Stripes, p: [1, 0.3, 0.2, 0.06, 0], edge: [0.3, 2], finish: 'gloss' },
  dazzle: { label: 'Dazzle', style: P.Dazzle, p: [1, 1.4, 1.6, 0, 0], finish: 'satin' },
  pathfinder: { label: 'Pathfinder', style: P.Stripes, p: [1, 0.45, 0.18, 0.08, 0], finish: 'gloss' },
  emissary: { label: 'Emissary', style: P.Swoosh, p: [1, 0.4, 0.2, 0.08, 2.2], finish: 'gloss' },
  sabotage: { label: 'Sabotage', style: P.Splinter, p: [0.8, 0.25, 0.25, 0.22, 0.9], finish: 'matte' },
  vanguard: { label: 'Vanguard', style: P.Lines, p: [0.9, 0.7, 0.06, 0.5, 0], finish: 'metal' },
}

/** Libellé d'une famille (le nom de la boutique ; la livrée d'usine se traduit). */
export const familyLabel = (family: string): string => FAMILIES[family]?.label ?? family

// ---------------------------------------------------------------- shader

const VERTEX = `#include <begin_vertex>
  vPaintPos = transformed;
  vPaintNormal = objectNormal;`

const HEAD = /* glsl */ `
uniform vec3 uPaintSize;
uniform float uPaintUnit;
uniform vec3 uPaintC[4];
uniform vec4 uPaintA;
uniform vec4 uPaintB;
uniform vec4 uPaintG;
uniform vec4 uPaintH;
uniform vec4 uPaintF;
uniform vec4 uPaintEdgeBox;
uniform sampler2D uPaintEdge;
uniform float uPaintEdgeMax;
uniform float uPaintSeed;
varying vec3 vPaintPos;
varying vec3 vPaintNormal;
vec3 paintSpecular = vec3(0.0);
float paintShininess = 30.0;

float ph1(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 ph2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float pnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ph1(i), ph1(i + vec2(1.0, 0.0)), f.x), mix(ph1(i + vec2(0.0, 1.0)), ph1(i + vec2(1.0, 1.0)), f.x), f.y);
}
float pfbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * pnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s / 0.9375;
}
// Voronoï : le hasard de la cellule la plus proche.
float pcell(vec2 x) {
  vec2 n = floor(x), f = fract(x), mg = vec2(0.0);
  float md = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j)), r = g + ph2(n + g) - f;
    float d = dot(r, r);
    if (d < md) { md = d; mg = g; }
  }
  return ph1(n + mg);
}
// Bande de demi-largeur w autour de 0, adoucie sur un pixel.
float pband(float x, float w) { float f = fwidth(x) * 0.75 + 1e-4; return 1.0 - smoothstep(w - f, w + f, abs(x)); }
// Rayures : la part \`duty\` de chaque période.
float pstripe(float t, float duty) { float f = fract(t), w = fwidth(t) * 0.75 + 1e-4; return smoothstep(0.0, w, f) * (1.0 - smoothstep(duty - w, duty + w, f)); }
float pstep(float e, float x) { float w = fwidth(x) * 0.75 + 1e-4; return smoothstep(e - w, e + w, x); }

vec3 paintGlow(vec2 T, vec3 q, vec3 n, float e) {
  int g = int(uPaintG.w + 0.5);
  float k = uPaintH.x, w = uPaintH.y, a = uPaintH.z, m = 0.0;
  if (g == 1) {
    // Éclairs : les crêtes d'un bruit fractal, brisées par un bruit plus fin, par endroits seulement.
    vec2 t = T * k;
    t += vec2(pnoise(t * 3.1), pnoise(t * 3.1 + 5.0)) * 0.35;
    float r = 1.0 - abs(pfbm(t) * 2.0 - 1.0);
    float r2 = 1.0 - abs(pfbm(t * 2.3 + 4.0) * 2.0 - 1.0);
    float zone = smoothstep(1.0 - a - 0.15, 1.0 - a + 0.15, pfbm(T * k * 0.35 + 3.0));
    float core = pstep(1.0 - w * 0.35, r) + 0.6 * pstep(1.0 - w * 0.25, r2) * pstep(0.5, r);
    float halo = pstep(1.0 - w * 1.4, r) + 0.5 * pstep(1.0 - w, r2) * pstep(0.5, r);
    return (uPaintG.rgb * 0.55 * halo + mix(uPaintG.rgb, vec3(1.6), 0.55) * core) * zone;
  } else if (g == 2) {
    // Circuits : un trait par case, le long d'un de ses bords, une case sur deux environ.
    vec2 t = T * k, c = floor(t), f = fract(t);
    float h = ph1(c + 7.0), on = step(1.0 - a, ph1(c + 31.0));
    m = on * (h < 0.5 ? pband(f.y - 0.5, w) : pband(f.x - 0.5, w));
  } else if (g == 3) {
    // Arêtes : le bord de la coque vue de dessus.
    m = 1.0 - smoothstep(0.0, w, e);
    m *= mix(1.0, smoothstep(-0.2, 0.6, abs(q.x) + abs(q.z) * 0.4), a);
  } else if (g == 4) {
    // Quadrillage (rétro) : sur l'arrière de la coque.
    vec2 t = T * k;
    m = max(pband(fract(t.x + 0.5) - 0.5, w), pband(fract(t.y + 0.5) - 0.5, w)) * smoothstep(0.3, -0.5, q.z);
  } else if (g == 5) {
    // Anneaux et pastilles, çà et là.
    vec2 t = T * k, c = floor(t), f = fract(t) - 0.5;
    float h = ph1(c + 3.0), d = length(f);
    m = step(1.0 - a, h) * max(pband(d - 0.32, w), 1.0 - smoothstep(0.08, 0.1, d));
  } else if (g == 6) {
    // Contours : des lignes à distance fixe du bord de la coque (a lignes), interrompues çà et là (part b).
    float t = e * k;
    m = pband(fract(t + 0.5) - 0.5, w) * step(0.5, t) * step(t, a + 0.5) * step(uPaintH.w, pnoise(T * 0.9 + 3.0));
  }
  return uPaintG.rgb * m;
}

vec3 paintAt(out vec3 glow) {
  vec3 p = vPaintPos;
  vec3 n = normalize(vPaintNormal);
  vec3 q = p / (uPaintSize * 0.5);
  vec3 P = p / uPaintUnit;
  float e = texture2D(uPaintEdge, (p.xz - uPaintEdgeBox.xy) * uPaintEdgeBox.zw).r * uPaintEdgeMax;
  int s = int(uPaintA.x + 0.5);
  float k = uPaintA.y, a = uPaintA.z, b = uPaintA.w, c = uPaintB.x, d = uPaintB.y;
  vec2 T = P.xz * k + uPaintSeed;
  vec3 w = vec3(0.0);
  if (s == 1) {
    // Livrée : le ventre de sa couleur.
    w.x = smoothstep(-0.25, -0.55, n.y);
  } else if (s == 2) {
    // Bandes dans la longueur : a écart au centre, b demi-largeur (c1) ; c liseré (c2) ; d bande centrale (c3).
    float x = abs(q.x) - a;
    w.x = pband(x, b);
    if (c > 0.0) w.y = pband(abs(x) - b - c, c * 0.5);
    if (d > 0.0) w.z = pband(q.x, d);
  } else if (s == 3) {
    // Bandes en biais : a angle, b période (unités), c part peinte ; d > 0 : sur l'arrière seulement.
    float t = (P.x * cos(a) + P.z * sin(a)) / b;
    w.x = pstripe(t + uPaintSeed, c);
    if (d > 0.0) w.x *= smoothstep(0.2, -0.1, q.z);
  } else if (s == 4) {
    // Damier : a zone (1 : l'arrière des ailes ; sinon une bande le long des flancs).
    vec2 cell = floor(T);
    float ch = mod(cell.x + cell.y, 2.0);
    float zone = a < 1.5 ? smoothstep(0.38, 0.42, abs(q.x)) * smoothstep(0.35, 0.3, q.z) * smoothstep(-0.95, -0.85, q.z)
      : pband(q.y + 0.05, 0.12) * smoothstep(0.75, 0.65, abs(q.z));
    w.x = ch * zone;
  } else if (s == 5) {
    // Camouflage : trois couches de taches ; d > 0 : pixelisé (taille des pixels).
    vec2 t = T;
    if (d > 0.0) t = floor(t * d) / d;
    if (c > 1.5) {
      // Volutes (tourbillons) : le bruit déformé par lui-même.
      t += vec2(pfbm(t * 0.7), pfbm(t * 0.7 + 5.2)) * 2.5;
    }
    w.x = pstep(a, pfbm(t));
    w.y = pstep(b, pfbm(t * 1.3 + 7.1));
    w.z = c > 1.5 ? 0.0 : pstep(c, pfbm(t * 0.8 + 13.7));
  } else if (s == 6) {
    // Éclats : cellules anguleuses, chacune d'une couleur (parts a, b, c pour c1, c2, c3) ; d biais.
    vec2 t = vec2(T.x + T.y * d, T.y * 1.6 - T.x * d * 0.5);
    float h = pcell(t);
    w.x = step(h, a);
    w.y = step(a, h) * step(h, a + b);
    w.z = step(a + b, h) * step(h, a + b + c);
  } else if (s == 7) {
    // Flammes : a sens (1 depuis la poupe, -1 depuis le nez), b portée (part de la longueur), c langues par unité.
    float u = a > 0.0 ? q.z * 0.5 + 0.5 : 0.5 - q.z * 0.5;
    float x = P.x * c + uPaintSeed;
    float lane = abs(fract(x + 0.35 * pnoise(vec2(x * 0.7, u * 3.0))) - 0.5) * 2.0;
    float reach = b * (0.55 + 0.45 * pnoise(vec2(floor(x) * 1.7, 2.0)));
    float edge = reach * (1.0 - lane * lane);
    w.x = 1.0 - pstep(edge, u);
    w.y = 1.0 - pstep(edge * 0.5, u);
  } else if (s == 8) {
    // Éclaboussures : a sens (1 depuis le nez), b portée.
    float u = a > 0.0 ? q.z * 0.5 + 0.5 : 0.5 - q.z * 0.5;
    float v = pfbm(vec2(T.x * 1.4, T.y * 0.7)) + (u - (1.0 - b)) * 1.3;
    w.x = pstep(0.78, v);
  } else if (s == 9) {
    // Écailles : grille en quinconce, chaque écaille dégradée de c1 à c2, quelques-unes en c3.
    vec2 t = T;
    vec2 r = vec2(1.0, 1.732);
    vec2 h = r * 0.5;
    vec2 ga = mod(t, r) - h, gb = mod(t - h, r) - h;
    vec2 gv = dot(ga, ga) < dot(gb, gb) ? ga : gb;
    vec2 id = t - gv;
    float dd = length(gv * vec2(1.0, 1.15));
    float inside = 1.0 - smoothstep(0.4, 0.46, dd);
    w.x = inside;
    w.y = inside * smoothstep(-0.4, 0.4, gv.y);
    w.z = inside * step(1.0 - a, ph1(floor(id * 3.0)));
  } else if (s == 10) {
    // Bouts d'ailes : sur une largeur a (unités) du bord, entre les longueurs b et c ; d : part du dos aussi.
    float zone = smoothstep(b - 0.05, b + 0.05, q.z) * smoothstep(c + 0.05, c - 0.05, q.z);
    w.x = (1.0 - smoothstep(a * 0.9, a, e)) * zone;
    w.y = (1.0 - smoothstep(a * 0.4, a * 0.5, e)) * zone * d;
  } else if (s == 11) {
    // Courbes le long des flancs : a écart, b amplitude, c demi-largeur, d fréquence.
    float x0 = a + b * sin(q.z * d + uPaintSeed);
    float x = abs(q.x) - x0;
    w.x = pband(x, c);
    w.y = pband(x - c * 2.4, c * 0.3);
    w.z = pband(x + c * 2.4, c * 0.2);
  } else if (s == 12) {
    // Zébrures (dazzle) : a période, b déformation.
    float t = (P.x * 0.8 + P.z * 0.45 + b * pfbm(T * 0.3)) / a;
    float flip = step(0.5, pfbm(T * 0.12 + 4.0));
    t = mix(t, (P.x * -0.6 + P.z * 0.7 + b * pfbm(T * 0.3 + 2.0)) / a, flip);
    w.x = pstripe(t, 0.5);
  } else if (s == 13) {
    // Bandes et étoiles : rayures en biais (c1), un canton à étoiles (c2) à l'avant gauche.
    float canton = step(0.1, q.x) * step(0.15, q.z);
    w.x = pstripe((P.x + P.z) * 0.5 / a, 0.5) * (1.0 - canton);
    vec2 t = T * 0.9, f = fract(t) - 0.5;
    float ang = atan(f.y, f.x), rad = length(f);
    float star = 0.16 + 0.08 * cos(ang * 5.0 + 1.57);
    w.y = canton * (1.0 - smoothstep(star - 0.02, star + 0.02, rad));
  } else if (s == 14) {
    // Rétro : dégradé vers l'arrière (c1), soleil (c2) zébré, à la longueur a.
    w.x = smoothstep(0.4, -0.7, q.z);
    vec2 sc = vec2(q.x, (q.z - a) * uPaintSize.z / uPaintSize.x);
    float r = length(sc);
    w.y = (1.0 - smoothstep(b - 0.01, b + 0.01, r)) * (1.0 - pstripe(sc.y * 14.0, 0.35) * step(sc.y, 0.0));
  } else if (s == 15) {
    // Trame : des rectangles (c1), naissant au milieu de la coque et grossissant vers l'arrière.
    vec2 f = fract(T) - 0.5;
    float grow = smoothstep(0.15, -0.85, q.z) * smoothstep(0.08, 0.3, abs(q.x));
    float sz = 0.42 * grow;
    w.x = step(abs(f.x), sz) * step(abs(f.y), sz * 0.55) * step(0.04, sz);
  } else if (s == 16) {
    // Héraldique : un quartier (c1) à l'arrière droit, un autre (c3, l'or) à l'avant gauche, un damier (c2) entre eux.
    float t = q.x * 0.6 + q.z * 0.8;
    w.x = step(0.0, q.x) * step(q.z, -0.05);
    w.z = step(q.x, 0.0) * step(0.05, q.z);
    vec2 cell = floor(T);
    w.y = pband(t, a) * mod(cell.x + cell.y, 2.0);
  } else if (s == 17) {
    // Panneaux : une case sur une autre en c1 (part a), quelques-unes en c2 (part b), joints en c3 (force c).
    vec2 t = T * vec2(1.0, 0.6);
    vec2 cell = floor(t), f = fract(t);
    if (ph1(cell + 11.0) > 0.5) { cell = floor(t * vec2(2.0, 1.0)); f = fract(t * vec2(2.0, 1.0)); }
    float h = ph1(cell + 5.0);
    w.x = step(h, a) * 0.65;
    w.y = step(a, h) * step(h, a + b) * 0.65;
    w.z = c * max(pband(f.x, 0.035), pband(f.y, 0.035));
  } else if (s == 18) {
    // Traits fins en biais, interrompus (c1) ; a angle, b demi-épaisseur (part d'une période), c part allumée, d > 0 : arabesques.
    vec2 t = T;
    if (d > 0.0) t += vec2(pfbm(t * 0.5), pfbm(t * 0.5 + 3.0)) * 1.6;
    float t1 = t.x * cos(a) + t.y * sin(a), t2 = t.x * cos(-a) + t.y * sin(-a);
    float l1 = pband(fract(t1 + 0.5) - 0.5, b) * step(1.0 - c, ph1(vec2(floor(t1), floor(t2 * 0.5))));
    float l2 = pband(fract(t2 + 0.5) - 0.5, b) * step(1.0 - c, ph1(vec2(floor(t2), floor(t1 * 0.5)) + 9.0));
    w.x = max(l1, l2);
  } else if (s == 19) {
    // Chevrons : bandes en V vers le nez ; a pente, b période, c part peinte.
    float t = (P.z + abs(P.x) * a) / b;
    w.x = pstripe(t, c);
  } else if (s == 20) {
    // Dégradé le long de la coque : a sens (1 vers le nez), de b à c (en q.z) vers c1 ; d : vers les bouts d'ailes (c2).
    w.x = smoothstep(b, c, q.z * a);
    w.y = d * smoothstep(0.55, 0.95, abs(q.x));
  } else if (s == 21) {
    // Deux tons : a mode (1 l'arrière, 2 les ailes, 3 en biais, 4 le dessous, 5 le corps), b seuil, c liseré (c2).
    float t = a < 1.5 ? -q.z + b : a < 2.5 ? abs(q.x) - b : a < 3.5 ? q.x * 0.55 - q.z * 0.85 - b : a < 4.5 ? -n.y + b : b - abs(q.x);
    w.x = pstep(0.0, t);
    if (c > 0.0) w.y = pband(t, c);
  } else if (s == 22) {
    // Rayures de tigre : en travers, effilées vers les bords ; a période, b déformation, c épaisseur.
    float t = (P.z + b * pnoise(vec2(P.x * 0.35, P.z * 0.25) + uPaintSeed) + abs(P.x) * 0.5) / a;
    float duty = c * (1.0 - smoothstep(0.1, 1.05, abs(q.x)));
    w.x = pstripe(t, duty);
    w.y = pstripe(t + 0.5, duty * 0.4) * step(0.3, abs(q.x));
  } else if (s == 23) {
    // Marbrures : le fond nuancé de c1 (force a), de c2 par endroits (force b).
    w.x = smoothstep(0.35, 0.75, pfbm(T)) * a;
    w.y = smoothstep(0.55, 0.8, pfbm(T * 2.3 + 5.0)) * b;
  }
  vec3 col = uPaintC[0];
  col = mix(col, uPaintC[1], clamp(w.x, 0.0, 1.0));
  col = mix(col, uPaintC[2], clamp(w.y, 0.0, 1.0));
  col = mix(col, uPaintC[3], clamp(w.z, 0.0, 1.0));
  if (uPaintB.z > 0.0) col = mix(col, uPaintC[int(uPaintB.w + 0.5)], 1.0 - smoothstep(uPaintB.z * 0.8, uPaintB.z, e));
  // Le ventre, plus sombre.
  col *= 1.0 - uPaintF.w * smoothstep(-0.2, -0.6, n.y);
  glow = uPaintG.w > 0.5 ? paintGlow(T, q, n, e) : vec3(0.0);
  paintSpecular = mix(vec3(uPaintF.x), col * uPaintF.x * 1.8, uPaintF.z);
  paintShininess = uPaintF.y;
  return col * (1.0 - uPaintF.z * 0.35);
}
`

const FRAGMENT = `#include <color_fragment>
  {
    vec3 paintGlowColor;
    diffuseColor.rgb = paintAt(paintGlowColor);
    totalEmissiveRadiance += paintGlowColor;
  }`

const SPECULAR = `#include <lights_phong_fragment>
  material.specularColor = paintSpecular;
  material.specularShininess = paintShininess;`

// ---------------------------------------------------------------- carte de distance au bord

/** Cases de la carte sur la plus grande dimension du vaisseau. */
const EDGE_CELLS = 128

interface EdgeField {
  texture: THREE.DataTexture
  /** x0, z0, puis l'inverse de la largeur et de la longueur couvertes. */
  box: THREE.Vector4
  /** Distance (m) que vaut le blanc de la texture. */
  max: number
}

const fields = new Map<string, EdgeField>()

/**
 * Distance au bord de la coque vue de dessus (m) : les triangles du modèle (dans le repère de ses
 * géométries, celui du shader) sont tracés sur une grille, puis chaque case pleine reçoit sa
 * distance à la case vide la plus proche (chanfrein).
 */
function edgeField(key: string, model: THREE.Object3D, size: readonly number[]): EdgeField {
  const hit = fields.get(key)
  if (hit) return hit
  const cell = Math.max(size[0], size[2]) / EDGE_CELLS
  const cols = Math.ceil(size[0] / cell) + 2, rows = Math.ceil(size[2] / cell) + 2
  const x0 = -size[0] / 2 - cell, z0 = -size[2] / 2 - cell
  const full = new Uint8Array(cols * rows)
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  model.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry.attributes.position) return
    const pos = mesh.geometry.attributes.position, index = mesh.geometry.index
    const count = index ? index.count : pos.count
    for (let t = 0; t < count; t += 3) {
      const ia = index ? index.getX(t) : t, ib = index ? index.getX(t + 1) : t + 1, ic = index ? index.getX(t + 2) : t + 2
      a.fromBufferAttribute(pos, ia)
      b.fromBufferAttribute(pos, ib)
      c.fromBufferAttribute(pos, ic)
      const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z)
      if (Math.abs(d) < 1e-9) continue
      const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) - x0) / cell)), i1 = Math.min(cols - 1, Math.floor((Math.max(a.x, b.x, c.x) - x0) / cell))
      const j0 = Math.max(0, Math.floor((Math.min(a.z, b.z, c.z) - z0) / cell)), j1 = Math.min(rows - 1, Math.floor((Math.max(a.z, b.z, c.z) - z0) / cell))
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const x = x0 + (i + 0.5) * cell, z = z0 + (j + 0.5) * cell
          const l0 = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / d
          const l1 = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / d
          if (l0 >= 0 && l1 >= 0 && l0 + l1 <= 1) full[j * cols + i] = 1
        }
      }
    }
  })
  // Chanfrein 3-4 en deux passes : la distance (en cases) à la case vide la plus proche.
  const dist = new Float32Array(cols * rows)
  for (let k = 0; k < dist.length; k++) dist[k] = full[k] ? 1e6 : 0
  const relax = (k: number, n: number, w: number) => {
    if (dist[n] + w < dist[k]) dist[k] = dist[n] + w
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const k = j * cols + i
    if (!dist[k]) continue
    if (i > 0) relax(k, k - 1, 1)
    if (j > 0) {
      relax(k, k - cols, 1)
      if (i > 0) relax(k, k - cols - 1, 1.4)
      if (i < cols - 1) relax(k, k - cols + 1, 1.4)
    }
  }
  for (let j = rows - 1; j >= 0; j--) for (let i = cols - 1; i >= 0; i--) {
    const k = j * cols + i
    if (!dist[k]) continue
    if (i < cols - 1) relax(k, k + 1, 1)
    if (j < rows - 1) {
      relax(k, k + cols, 1)
      if (i < cols - 1) relax(k, k + cols + 1, 1.4)
      if (i > 0) relax(k, k + cols - 1, 1.4)
    }
  }
  let far = 1
  for (const v of dist) far = Math.max(far, v)
  const data = new Uint8Array(cols * rows)
  for (let k = 0; k < data.length; k++) data[k] = Math.round((dist[k] / far) * 255)
  const texture = new THREE.DataTexture(data, cols, rows, THREE.RedFormat, THREE.UnsignedByteType)
  texture.magFilter = texture.minFilter = THREE.LinearFilter
  texture.needsUpdate = true
  const field = { texture, box: new THREE.Vector4(x0, z0, 1 / (cols * cell), 1 / (rows * cell)), max: far * cell }
  fields.set(key, field)
  return field
}

// ---------------------------------------------------------------- matériau

/** Hachage d'une chaîne (le décalage du motif d'une famille : le même chez tout le monde). */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return ((h >>> 0) % 1000) / 10
}

/**
 * La coque peinte d'un vaisseau : son matériau, et de quoi changer de peinture sans le recompiler
 * (les copies tramables du matériau, cf. fade.ts, partagent ses uniformes).
 */
export class PaintedHull {
  readonly material: THREE.MeshPhongMaterial
  /** La peinture posée (la livrée du constructeur : FACTORY). */
  paint: ShipPaint
  private readonly u = {
    uPaintSize: { value: new THREE.Vector3() },
    uPaintUnit: { value: 1 },
    uPaintC: { value: [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()] },
    uPaintA: { value: new THREE.Vector4() },
    uPaintB: { value: new THREE.Vector4() },
    uPaintG: { value: new THREE.Vector4() },
    uPaintH: { value: new THREE.Vector4() },
    uPaintF: { value: new THREE.Vector4() },
    uPaintEdgeBox: { value: new THREE.Vector4() },
    uPaintEdge: { value: null as THREE.Texture | null },
    uPaintEdgeMax: { value: 1 },
    uPaintSeed: { value: 0 },
  }

  /**
   * @param key le vaisseau (sa carte de distance au bord est gardée)
   * @param model le modèle, en mètres (cf. edShip)
   * @param size ses dimensions (m)
   * @param livery la livrée du constructeur
   */
  constructor(key: string, model: THREE.Object3D, size: readonly number[], readonly livery: Livery) {
    const u = this.u
    u.uPaintSize.value.set(size[0], size[1], size[2])
    // L'unité de motif : un seizième de la longueur, et pas moins d'un mètre et demi.
    u.uPaintUnit.value = Math.max(1.5, size[2] / 16)
    const field = edgeField(key, model, size)
    u.uPaintEdge.value = field.texture
    u.uPaintEdgeBox.value.copy(field.box)
    u.uPaintEdgeMax.value = field.max / u.uPaintUnit.value
    this.material = new THREE.MeshPhongMaterial({ name: 'hull', color: '#ffffff', specular: '#000000' })
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u)
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'varying vec3 vPaintPos;\nvarying vec3 vPaintNormal;\nvoid main() {')
        .replace('#include <begin_vertex>', VERTEX)
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', `${HEAD}\nvoid main() {`)
        .replace('#include <color_fragment>', FRAGMENT)
        .replace('#include <lights_phong_fragment>', SPECULAR)
      patchLightField(shader)
    }
    this.material.customProgramCacheKey = () => 'ship-paint'
    this.paint = factoryPaint(livery)
    this.set(this.paint)
  }

  /** Pose une peinture (celle du constructeur si null). */
  set(paint: ShipPaint | null) {
    paint ??= factoryPaint(this.livery)
    this.paint = paint
    const r = FAMILIES[paint.family] ?? FAMILIES[FACTORY]
    const u = this.u
    paint.colors.forEach((c, i) => u.uPaintC.value[i].set(c))
    const [k, a, b, c, d] = r.p ?? [1, 0, 0, 0, 0]
    u.uPaintA.value.set(r.style, k, a, b)
    u.uPaintB.value.set(c, d, r.edge?.[0] ?? 0, r.edge?.[1] ?? 1)
    const glow = new THREE.Color(paint.glow ?? paint.colors[3]).multiplyScalar(1.6)
    u.uPaintG.value.set(glow.r, glow.g, glow.b, r.glow ?? G.None)
    u.uPaintH.value.set(...(r.g ?? [1, 0.05, 0.5, 0]))
    const [spec, shine, metal] = FINISH[r.finish ?? 'satin']
    u.uPaintF.value.set(spec, shine, metal, r.belly ?? 0.22)
    u.uPaintSeed.value = hash(paint.family)
  }
}

/** La livrée du constructeur, comme une peinture : le dos, le ventre. */
export function factoryPaint(livery: Livery): ShipPaint {
  return { id: FACTORY, name: 'Livrée du constructeur', family: FACTORY, colors: [livery.hull, livery.belly, livery.dark, livery.trim] }
}

// ---------------------------------------------------------------- catalogue des peintures

/** paints.json : chaque peinture une fois ([nom, famille, 4 couleurs, lueur]), et la liste de chaque vaisseau. */
interface PaintFile {
  paints: Record<string, [string, string, string, string, string, string, string | null]>
  ships: Record<string, string[]>
}

let file: Promise<PaintFile> | null = null

function paintFile(): Promise<PaintFile> {
  return (file ??= fetch(`${BASE}ships/paints.json?v=${import.meta.env.VITE_MODELS_STAMP}`).then((r) => {
    if (!r.ok) throw new Error(`peintures des vaisseaux : ${r.status}`)
    return r.json() as Promise<PaintFile>
  }).catch((e) => {
    file = null
    throw e
  }))
}

function toPaint(id: string, row: PaintFile['paints'][string]): ShipPaint {
  const [name, family, c0, c1, c2, c3, glow] = row
  return { id, name, family, colors: [c0, c1, c2, c3], ...(glow ? { glow } : {}) }
}

/** Les peintures de la boutique pour ce vaisseau, dans l'ordre de la boutique, regroupées par famille. */
export async function shipPaints(ship: string): Promise<ShipPaint[]> {
  const f = await paintFile()
  return (f.ships[ship] ?? []).filter((id) => f.paints[id]).map((id) => toPaint(id, f.paints[id]))
}

/** Une peinture de ce vaisseau, ou null si elle n'existe pas (plus) pour lui. */
export async function findPaint(ship: string, id: string): Promise<ShipPaint | null> {
  if (id === FACTORY) return null
  const f = await paintFile()
  return f.ships[ship]?.includes(id) && f.paints[id] ? toPaint(id, f.paints[id]) : null
}

/** Une peinture au hasard pour ce vaisseau (le trafic) ; la livrée d'usine une fois sur quatre. */
export async function randomPaint(ship: string): Promise<ShipPaint | null> {
  const list = await shipPaints(ship).catch(() => [])
  if (!list.length || Math.random() < 0.25) return null
  return list[Math.floor(Math.random() * list.length)]
}

// ---------------------------------------------------------------- choix gardés

/** Les peintures choisies, vaisseau par vaisseau, gardées dans ce navigateur (le stockage peut manquer). */
const KEY = 'mini-shipinteriors-paints'
/** Les peintures que ces vaisseaux portent dans Elite, telles que le site les a dites la dernière fois. */
const ELITE_KEY = 'mini-shipinteriors-paints-elite'

function stored(key: string): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

function store(key: string, all: Record<string, string>) {
  try {
    localStorage.setItem(key, JSON.stringify(all))
  } catch {
    // Stockage indisponible (navigation privée) : le choix vaut pour cette visite.
  }
}

/** La peinture que ce vaisseau porte dans Elite (FACTORY : aucune, ou une qu'on n'a pas). */
export const elitePaintOf = (ship: string): string => stored(ELITE_KEY)[ship] ?? FACTORY

/** La peinture de ce vaisseau : celle choisie au registre, sinon celle d'Elite (FACTORY : celle du constructeur). */
export const paintOf = (ship: string): string => stored(KEY)[ship] ?? elitePaintOf(ship)

/** Garde la peinture choisie pour ce vaisseau ; celle d'Elite n'est pas un choix : il se remet à la suivre. */
export function savePaint(ship: string, id: string) {
  const all = stored(KEY)
  if (id === elitePaintOf(ship)) delete all[ship]
  else all[ship] = id
  store(KEY, all)
}

/**
 * Le site a dit la peinture de ce vaisseau dans Elite (le nom de Frontier, vide sans peinture) : on
 * la garde, de quoi la poser dès le chargement la prochaine fois. Rend notre coloris, ou null : la
 * livrée du constructeur, ou une peinture qu'on n'a pas (cf. shared/elite-paints.js).
 */
export async function saveElitePaint(ship: string, frontier: string): Promise<ShipPaint | null> {
  const f = await paintFile()
  const id = elitePaint(frontier, f.ships[ship] ?? [])
  // À relever pour compléter la table : le nom de Frontier d'une peinture qu'on ne reconnaît pas.
  if (frontier && !id) console.info(`Peinture d'Elite sans coloris ici : ${frontier} (${ship})`)
  const elite = stored(ELITE_KEY)
  if (id) elite[ship] = id
  else delete elite[ship]
  store(ELITE_KEY, elite)
  // Le même que le choix du registre : autant suivre Elite, il changera avec lui.
  savePaint(ship, paintOf(ship))
  return id && f.paints[id] ? toPaint(id, f.paints[id]) : null
}
