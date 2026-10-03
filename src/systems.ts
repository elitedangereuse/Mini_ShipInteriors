import * as THREE from 'three'
import { renderQuality } from './quality'
import { tr } from './i18n'
import { ZOOM_MAX } from './camera'
import { HOME_SYSTEM, SYSTEM_IDS, type SystemId } from '../shared/systems.js'

/*
 * Le système où se trouve le vaisseau : étoiles, planètes, lunes, anneaux, stations, trou noir ou
 * nébuleuse. C'est un ciel : chaque astre a sa direction autour du vaisseau (un azimut, une hauteur
 * sous l'horizon), fixe tant qu'on reste dans le système. Ce qu'on voit dépend donc de là où
 * regarde la caméra : en tournant d'un quart de tour, on découvre d'autres astres ; en marchant le
 * long de la coque, ils ne bougent pas (ils sont loin), c'est la coque qui les cache ou les révèle.
 *
 * La vue isométrique est orthographique : rien n'y a de direction. Le décor y est donc posé comme
 * le verrait un objectif qui regarderait dans l'axe de la caméra (cf. SystemView.update), loin sous
 * le pont, entre la coque et le champ d'étoiles. En vue subjective, les astres sont vraiment dans
 * leur direction, autour des yeux. L'étoile principale éclaire tous les autres : selon l'angle, une
 * planète est pleine, en quartier ou en croissant. Le saut FSD (cf. main.ts) change de système.
 */

/** Vue isométrique : un astre à 45° de l'axe du regard est à cette distance (tuiles) du centre du cadre. */
const FOCAL = 12
/** Vue isométrique : profondeur du centre des astres sous le pont, entre la coque et les étoiles (cf. starfield.ts). */
const DEPTH = 17
/** Vue subjective : distance des astres aux yeux, en deçà du plan lointain de la caméra (200). */
const EYE_DISTANCE = 150
/**
 * Vue subjective : les hauteurs sous l'horizon sont resserrées, pour que le ciel que la vue
 * isométrique voit d'en haut passe dans le cadre des verrières.
 */
const EYE_SQUEEZE = 0.25

type PlanetKind = 'rocky' | 'earth' | 'gas' | 'ice' | 'lava'
const KINDS: PlanetKind[] = ['rocky', 'earth', 'gas', 'ice', 'lava']

/**
 * Place d'un astre dans le ciel, en degrés : `az`, l'azimut (0 : au nord, par le travers bâbord ;
 * 90 : à l'est, droit devant la proue), et `el`, la hauteur sous l'horizon. La vue isométrique
 * regarde à 35° sous l'horizon, vers le nord-ouest (315), le nord-est, le sud-est ou le sud-ouest :
 * la coque occupe le centre du cadre, les astres se voient mieux à 20-40° de ces axes.
 * `size` : rayon apparent, en degrés.
 */
interface Spot {
  az: number
  el: number
  size: number
}

interface PlanetDef extends Spot {
  kind: PlanetKind
  /** Deux couleurs de la surface (bandes, continents…) et celle de l'atmosphère. */
  colors: [string, string]
  atmosphere?: string
  /** Anneaux : rayons en rayons de la planète, inclinaison (radians). */
  ring?: { inner: number; outer: number; color: string; tilt: number }
}

interface SystemDef {
  name: string
  /** Texte à l'arrivée. */
  arrival: string
  /** La première éclaire le système ; `glow` : taille du halo, en rayons de l'étoile. */
  stars: (Spot & { color: string; glow: number })[]
  planets: PlanetDef[]
  /** Station : Coriolis (le cube à facettes d'Elite) ou Orbis (un anneau). */
  station?: Spot & { kind: 'coriolis' | 'orbis' }
  blackHole?: Spot
  nebula?: (Spot & { color: string })[]
}

const MOON: Pick<PlanetDef, 'kind' | 'colors'> = { kind: 'rocky', colors: ['#5d5d61', '#a9a9ad'] }

export const SYSTEMS: Record<SystemId, SystemDef> = {
  shinrarta: {
    name: 'Shinrarta Dezhra',
    arrival: tr('Jameson Memorial en vue. Les pilotes Elite vous saluent.', 'Jameson Memorial in sight. The Elite pilots salute you.'),
    stars: [{ az: 200, el: 18, size: 4, color: '#ffd9a0', glow: 9 }],
    planets: [
      { kind: 'rocky', az: 350, el: 22, size: 27, colors: ['#6e4f3a', '#b98d68'], atmosphere: '#ffb98a' },
      { ...MOON, az: 280, el: 56, size: 7 },
      { kind: 'gas', az: 112, el: 54, size: 13, colors: ['#7d6a52', '#cdb893'], ring: { inner: 1.35, outer: 2.1, color: '#cbb89a', tilt: 0.45 } },
      { kind: 'ice', az: 160, el: 24, size: 5, colors: ['#8fa9bd', '#dfeaf2'], atmosphere: '#bfe4ff' },
      { kind: 'lava', az: 250, el: 30, size: 3, colors: ['#3a2a26', '#ff7a2a'] },
    ],
    station: { kind: 'orbis', az: 22, el: 20, size: 9 },
  },
  sol: {
    name: 'Sol',
    arrival: tr('La Terre, bleue et lointaine. Pas de permis : demi-tour poli.', 'Earth, blue and distant. No permit: polite U-turn.'),
    stars: [{ az: 165, el: 20, size: 4.5, color: '#fff2c4', glow: 9 }],
    planets: [
      { kind: 'earth', az: 345, el: 22, size: 28, colors: ['#123f7a', '#3f6b34'], atmosphere: '#7fbfff' },
      { ...MOON, az: 22, el: 26, size: 8 },
      { kind: 'rocky', az: 255, el: 54, size: 5, colors: ['#8a4a30', '#c47a52'], atmosphere: '#e8a070' },
      { kind: 'gas', az: 78, el: 55, size: 10, colors: ['#9a7a5a', '#e0cdb0'] },
      { kind: 'gas', az: 205, el: 20, size: 6, colors: ['#a89468', '#e6d8b0'], ring: { inner: 1.4, outer: 2.3, color: '#d8c8a0', tilt: 0.5 } },
    ],
  },
  colonia: {
    name: 'Colonia',
    arrival: tr('22 000 al plus tard, les Colons vous offrent un café.', '22,000 ly later, the Colonists offer you a coffee.'),
    stars: [{ az: 100, el: 22, size: 4.5, color: '#fff7e8', glow: 10 }],
    planets: [
      { kind: 'ice', az: 340, el: 24, size: 24, colors: ['#7f9fb8', '#e3eef5'], atmosphere: '#bfe4ff' },
      { kind: 'earth', az: 195, el: 22, size: 12, colors: ['#1d5a6a', '#6b7a3a'], atmosphere: '#9fe0d0' },
      { ...MOON, az: 282, el: 55, size: 6 },
    ],
    station: { kind: 'orbis', az: 18, el: 22, size: 10 },
    nebula: [
      { color: '#b04fd0', az: 240, el: 40, size: 60 },
      { color: '#ff6fa8', az: 60, el: 45, size: 50 },
    ],
  },
  'alpha-centauri': {
    name: 'Alpha Centauri',
    arrival: tr('Hutton Orbital est à 0,22 al. Courage.', 'Hutton Orbital is 0.22 ly away. Chin up.'),
    stars: [
      { az: 170, el: 20, size: 4.5, color: '#fff0c0', glow: 9 },
      { az: 192, el: 26, size: 3.2, color: '#ffc98a', glow: 8 },
      { az: 40, el: 18, size: 1, color: '#ff6a4a', glow: 10 },
    ],
    planets: [
      { kind: 'rocky', az: 345, el: 24, size: 20, colors: ['#4f4840', '#8f8474'] },
      { kind: 'lava', az: 108, el: 54, size: 8, colors: ['#33241f', '#ff6a1f'] },
      { kind: 'rocky', az: 262, el: 52, size: 6, colors: ['#6a5a4a', '#a89880'] },
    ],
    station: { kind: 'coriolis', az: 15, el: 22, size: 6 },
  },
  lave: {
    name: 'Lave',
    arrival: tr('Lave Station, comme en 1984. Le Brandy de Lave est hors de prix.', 'Lave Station, just like in 1984. Lavian Brandy is outrageously priced.'),
    stars: [{ az: 215, el: 20, size: 4, color: '#ffe3b0', glow: 9 }],
    planets: [
      { kind: 'earth', az: 348, el: 22, size: 27, colors: ['#17504d', '#6f6f30'], atmosphere: '#a8f0d0' },
      { ...MOON, az: 290, el: 54, size: 5 },
      { kind: 'gas', az: 150, el: 22, size: 11, colors: ['#5a6a8a', '#b0bcd0'] },
      { kind: 'rocky', az: 80, el: 56, size: 6, colors: ['#7a5a40', '#b08a68'] },
    ],
    station: { kind: 'coriolis', az: 20, el: 20, size: 8 },
  },
  sagittarius: {
    name: 'Sagittarius A*',
    arrival: tr('Le trou noir au cœur de la galaxie. Ne regardez pas trop longtemps.', 'The black hole at the heart of the galaxy. Don\'t stare too long.'),
    stars: [
      { az: 160, el: 20, size: 1.6, color: '#cfe0ff', glow: 9 },
      { az: 205, el: 30, size: 1.2, color: '#ffd0a0', glow: 9 },
      { az: 100, el: 52, size: 1, color: '#ff9a7a', glow: 9 },
      { az: 262, el: 55, size: 1.3, color: '#fff0d0', glow: 9 },
    ],
    planets: [],
    blackHole: { az: 348, el: 24, size: 13 },
    nebula: [
      { color: '#ffb36a', az: 0, el: 35, size: 70 },
      { color: '#ff8a5a', az: 180, el: 40, size: 60 },
    ],
  },
  maia: {
    name: 'Maia',
    arrival: tr('Nébuleuse des Pléiades. Rien à signaler… presque rien.', 'Pleiades Nebula. Nothing to report… almost nothing.'),
    stars: [
      { az: 195, el: 20, size: 5, color: '#cfe0ff', glow: 10 },
      { az: 105, el: 52, size: 2, color: '#bcd4ff', glow: 9 },
      { az: 30, el: 16, size: 1.4, color: '#dfe8ff', glow: 9 },
    ],
    planets: [
      { kind: 'gas', az: 345, el: 24, size: 19, colors: ['#3a5a8a', '#8fb0d8'], ring: { inner: 1.3, outer: 2, color: '#c8d8f0', tilt: 0.5 } },
      { kind: 'ice', az: 280, el: 55, size: 7, colors: ['#8fa9c8', '#e6eef8'] },
    ],
    nebula: [
      { color: '#4f8dff', az: 320, el: 40, size: 70 },
      { color: '#7fd4ff', az: 140, el: 40, size: 55 },
    ],
  },
  'beagle-point': {
    name: 'Beagle Point',
    arrival: tr('Au bout de la galaxie. Il y a encore des étoiles.', 'The far end of the galaxy. There are still more stars.'),
    stars: [{ az: 160, el: 22, size: 2.6, color: '#ff9a6a', glow: 10 }],
    planets: [
      { kind: 'gas', az: 350, el: 24, size: 21, colors: ['#6f4630', '#c9a47a'], ring: { inner: 1.35, outer: 2.05, color: '#d9c3a0', tilt: 0.4 } },
      { kind: 'rocky', az: 260, el: 54, size: 6, colors: ['#5a4a40', '#94806c'] },
    ],
  },
}

export const systemName = (id: SystemId) => SYSTEMS[id].name

// ---------------------------------------------------------------- textures

/**
 * Bruit de valeur lissé en 2D sur une grille de W × H cases, répété dans les deux sens
 * (nuages de nébuleuse sans couture).
 */
function noise2(seed: number, W: number, H: number) {
  const grid = Array.from({ length: W * H }, (_, i) => {
    let h = (i * 374761393 + seed * 668265263) | 0
    h = (h ^ (h >>> 13)) * 1274126177
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
  })
  const at = (x: number, y: number) => grid[(((y % H) + H) % H) * W + (((x % W) + W) % W)]
  const smooth = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
  return (u: number, v: number) => {
    const x = u * W, y = v * H
    const x0 = Math.floor(x), y0 = Math.floor(y)
    const sx = smooth(x - x0), sy = smooth(y - y0)
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx
    return a + (b - a) * sy
  }
}

/** Somme de quatre octaves de bruit (de 6 × 3 à 48 × 24 cases), dans [0, 1]. */
function fbm2(seed: number) {
  const octaves = [0, 1, 2, 3].map((k) => noise2(seed + k * 13, 6 << k, 3 << k))
  return (u: number, v: number) => octaves.reduce((sum, n, k) => sum + n(u, v) / 2 ** (k + 1), 0) / (1 - 1 / 16)
}

/** Halo radial (étoiles, trou noir) : plein au centre, `level` au rayon `soft`, nul au bord. */
function glowTexture(soft: number, level = 0.35): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(soft, `rgba(255,255,255,${level})`)
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

/** Nuage de nébuleuse : des volutes de bruit, en niveaux de gris (la couleur vient du sprite). */
function cloudTexture(seed: number): THREE.CanvasTexture {
  const S = 192
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const img = g.createImageData(S, S)
  const n = fbm2(seed)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x / S - 0.5, dy = y / S - 0.5
      const r = Math.hypot(dx, dy) * 2
      const v = n(x / S, (y / S) * 0.5) * Math.max(0, 1 - r * r)
      const i = (y * S + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
      img.data[i + 3] = Math.min(255, v * v * 420)
    }
  }
  g.putImageData(img, 0, 0)
  return new THREE.CanvasTexture(c)
}


// ---------------------------------------------------------------- matériaux

/**
 * Planète éclairée par l'étoile du système (et non par le soleil de la scène) : sa phase dépend de
 * l'angle sous lequel on la voit. La surface est calculée dans le shader (bruit en 3D sur la
 * sphère, sans texture), avec son relief (les pentes face à l'étoile sont plus claires), le reflet
 * de l'étoile sur les océans, des nuages, un bord assombri et une atmosphère qui rougit au
 * terminateur.
 */
function planetMaterial(p: Pick<PlanetDef, 'kind' | 'colors' | 'atmosphere'>, light: THREE.Vector3, seed: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uKind: { value: KINDS.indexOf(p.kind) },
      uA: { value: new THREE.Color(p.colors[0]) },
      uB: { value: new THREE.Color(p.colors[1]) },
      uSeed: { value: (seed * 7.31) % 50 },
      uTime: { value: 0 },
      uOctaves: { value: 5 },
      uLight: { value: light },
      uAtmo: { value: new THREE.Color(p.atmosphere ?? '#000000') },
      uAtmoOn: { value: p.atmosphere ? 1 : 0 },
    },
    vertexShader: `
      uniform vec3 uLight;
      varying vec3 vLocal;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vSun;
      void main() {
        vLocal = normalize(position);
        vNormal = normalize(mat3(modelMatrix) * normal);
        // L'étoile, vue de la surface qui tourne.
        vSun = normalize(uLight * mat3(modelMatrix));
        vec4 world = modelMatrix * vec4(position, 1.0);
        // Vers l'œil : le même partout en orthographique, celui de chaque point en vue subjective.
        vView = projectionMatrix[3][3] == 1.0 ? normalize((inverse(viewMatrix) * vec4(0.0, 0.0, 1.0, 0.0)).xyz) : normalize(cameraPosition - world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform int uKind, uOctaves;
      uniform vec3 uA, uB, uLight, uAtmo;
      uniform float uSeed, uTime, uAtmoOn;
      varying vec3 vLocal;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vSun;

      float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float noise(vec3 x) {
        vec3 i = floor(x), f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
          mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
          f.z);
      }
      float fbm(vec3 p) {
        float sum = 0.0, amp = 0.5, total = 0.0;
        for (int i = 0; i < uOctaves; i++) {
          sum += amp * noise(p);
          total += amp;
          p = p * 2.03 + 11.7;
          amp *= 0.5;
        }
        return sum / total;
      }
      // Relief : un second relevé du terrain, un pas plus loin vers l'étoile. Les pentes qui lui font
      // face s'éclaircissent, les autres s'assombrissent (sans dérivées d'écran : elles pixellisent).
      float slope(vec3 p, float h, float scale) {
        vec3 toSun = vSun - dot(vSun, vLocal) * vLocal;
        return clamp(1.0 + (fbm((p + toSun * 0.025) * scale) - h) * 16.0, 0.45, 1.6);
      }

      void main() {
        vec3 n = normalize(vNormal);
        vec3 L = normalize(uLight);
        vec3 V = normalize(vView);
        vec3 p = vLocal + uSeed;
        float cap = abs(vLocal.y);
        vec3 ice = vec3(0.9, 0.94, 0.97);
        vec3 col;
        vec3 glow = vec3(0.0);
        float shade = 1.0;
        float gloss = 0.0;
        if (uKind == 1) {
          // Tellurique : océans (plus clairs sur les hauts-fonds), continents (plaines, reliefs, déserts),
          // calottes, deux couches de nuages, villes sur la face nocturne.
          float h = fbm(p * 1.7);
          float land = smoothstep(0.5, 0.515, h);
          vec3 sea = mix(uA * 0.45, uA * 1.25 + vec3(0.0, 0.05, 0.04), smoothstep(0.36, 0.5, h));
          float dry = fbm(p * 4.0 + 3.0);
          vec3 ground = mix(uB, vec3(0.62, 0.52, 0.34), smoothstep(0.45, 0.7, dry) * (1.0 - cap));
          ground = mix(ground, uB * 0.45, smoothstep(0.56, 0.72, h));
          col = mix(sea, ground, land);
          float frost = smoothstep(0.74, 0.88, cap + (h - 0.5) * 0.5);
          col = mix(col, ice, frost);
          float clouds = smoothstep(0.5, 0.74, fbm(p * 2.4 + vec3(uTime * 0.008, 0.0, 7.0))) * (0.55 + 0.45 * fbm(p * 9.0 + 1.0));
          gloss = (1.0 - land) * (1.0 - frost) * (1.0 - clouds);
          glow = vec3(1.0, 0.72, 0.36) * land * (1.0 - frost) * smoothstep(0.7, 0.78, noise(p * 30.0)) * smoothstep(0.45, 0.6, fbm(p * 6.0 + 2.0)) * (1.0 - clouds);
          col = mix(col, vec3(0.96), clouds);
          shade = mix(slope(p, h, 1.7), 1.0, max(1.0 - land, clouds));
        } else if (uKind == 2) {
          // Géante gazeuse : des bandes que la turbulence froisse, des ovales de tempête.
          vec3 q = p + 0.12 * vec3(fbm(p * 3.0), 0.0, fbm(p * 3.0 + 5.0));
          float swirl = fbm(q * vec3(1.4, 6.0, 1.4));
          float bands = 0.5 + 0.5 * sin(vLocal.y * 13.0 + swirl * 5.0 + sin(vLocal.y * 31.0) * 0.6);
          col = mix(uA, uB, smoothstep(0.15, 0.85, bands));
          col = mix(col, mix(uA, vec3(0.75, 0.42, 0.3), 0.5), smoothstep(0.7, 0.82, fbm(q * vec3(2.2, 7.0, 2.2) + 4.0)) * 0.7);
          col *= 0.8 + 0.4 * fbm(q * vec3(4.0, 30.0, 4.0));
          col = mix(col, (uA + uB) * 0.35, smoothstep(0.75, 0.98, cap));
        } else if (uKind == 3) {
          // Glace : une banquise parcourue de failles sombres.
          float h = fbm(p * 2.2);
          col = mix(uA, uB, smoothstep(0.3, 0.7, h));
          float crack = 1.0 - smoothstep(0.0, 0.03, abs(fbm(p * 3.4 + 9.0) - 0.5));
          crack = max(crack, (1.0 - smoothstep(0.0, 0.02, abs(fbm(p * 7.0 + 4.0) - 0.5))) * 0.6);
          col = mix(col, uA * 0.45, crack * 0.75);
          col = mix(col, ice, smoothstep(0.7, 0.9, cap));
          shade = slope(p, h, 2.2);
          gloss = 0.35;
        } else if (uKind == 4) {
          // Lave : une croûte sombre, des coulées qui luisent de jour comme de nuit.
          float h = fbm(p * 2.4);
          col = mix(uA * 0.35, uA, h);
          float flow = 1.0 - smoothstep(0.0, 0.07, abs(fbm(p * 3.0 + 5.0) - 0.5));
          glow = mix(uB, vec3(1.0, 0.9, 0.6), flow * flow) * flow * 1.3;
          shade = slope(p, h, 2.4);
        } else {
          // Rocheuse : mers sombres et hauts plateaux clairs, grain fin, cratères en creux.
          float h = fbm(p * 2.3);
          float fine = fbm(p * 11.0);
          col = mix(uA * 0.75, uB, smoothstep(0.34, 0.66, h));
          col *= 0.75 + 0.5 * fine;
          float c1 = smoothstep(0.7, 0.9, noise(p * 9.0 + 2.0));
          float c2 = smoothstep(0.72, 0.92, noise(p * 21.0 + 6.0));
          col *= 1.0 - 0.22 * c1 - 0.15 * c2;
          col = mix(col, ice, uAtmoOn * smoothstep(0.86, 0.95, cap + (h - 0.5) * 0.3));
          shade = slope(p, h, 2.3) * (0.85 + 0.3 * fine);
        }
        // Terminateur : net sans atmosphère, étalé avec.
        float facing = dot(n, L);
        float day = smoothstep(-0.02 - 0.16 * uAtmoOn, 0.1 + 0.22 * uAtmoOn, facing);
        float diffuse = clamp(facing + 0.08, 0.0, 1.0) * shade;
        float view = max(dot(n, V), 0.0);
        // Bord assombri : la lumière y traverse plus d'atmosphère (géantes), ou rase le sol.
        float limb = uKind == 2 ? 0.35 + 0.65 * pow(view, 0.6) : 0.75 + 0.25 * pow(view, 0.4);
        vec3 lit = col * diffuse * day * limb * 1.15;
        lit += vec3(1.0, 0.95, 0.85) * gloss * pow(max(dot(reflect(-L, n), V), 0.0), 140.0) * day * 0.7;
        lit += col * 0.012 + glow * (uKind == 4 ? 1.0 : 1.0 - day);
        // Atmosphère : un voile sur le bord, bleu (ou de sa couleur) de jour, rouge au terminateur.
        float rim = pow(1.0 - view, 3.0);
        vec3 haze = mix(vec3(1.0, 0.42, 0.18), uAtmo, smoothstep(0.0, 0.35, facing));
        lit = mix(lit, haze * (0.15 + 0.85 * day), uAtmoOn * rim * 0.8 * smoothstep(-0.25, 0.1, facing));
        gl_FragColor = vec4(lit, 1.0);
        #include <colorspace_fragment>
      }`,
  })
}

/** Halo d'atmosphère : une coquille autour de la planète, qui luit au-delà du bord, du côté du jour (rouge au terminateur). */
function atmosphereMaterial(color: string, light: THREE.Vector3): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uLight: { value: light } },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vNormal = normalize(mat3(modelMatrix) * normal);
        vec4 world = modelMatrix * vec4(position, 1.0);
        vView = projectionMatrix[3][3] == 1.0 ? normalize((inverse(viewMatrix) * vec4(0.0, 0.0, 1.0, 0.0)).xyz) : normalize(cameraPosition - world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform vec3 uColor, uLight;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec3 n = normalize(vNormal);
        // Face arrière de la coquille : nul au bord extérieur, le plus fort au ras de la planète.
        float edge = pow(clamp(-dot(n, normalize(vView)) * 3.4, 0.0, 1.0), 2.5);
        float facing = dot(n, normalize(uLight));
        vec3 tint = mix(vec3(1.0, 0.4, 0.15), uColor, smoothstep(-0.05, 0.3, facing));
        gl_FragColor = vec4(tint * edge * smoothstep(-0.3, 0.2, facing) * 0.7, 1.0);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  })
}

/**
 * Anneaux : des bandes concentriques translucides, avec leurs divisions, éteintes dans l'ombre que
 * la planète (au centre du repère de l'anneau, de rayon 1) projette à l'opposé de l'étoile.
 */
function ringMaterial(color: string, inner: number, outer: number, seed: number, light: THREE.Vector3): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uInner: { value: inner }, uOuter: { value: outer }, uSeed: { value: seed }, uLight: { value: light } },
    vertexShader: `
      varying vec3 vLocal;
      varying vec3 vAround;
      void main() {
        vLocal = position;
        // Autour de la planète, dans les axes du monde, en rayons de la planète.
        vAround = mat3(modelMatrix) * position / length(modelMatrix[0].xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor, uLight;
      uniform float uInner, uOuter, uSeed;
      varying vec3 vLocal;
      varying vec3 vAround;
      void main() {
        float r = (length(vLocal.xy) - uInner) / (uOuter - uInner);
        float bands = 0.6 + 0.4 * sin(r * 46.0 + uSeed) * sin(r * 17.0 + uSeed * 2.0);
        bands *= 0.75 + 0.25 * sin(r * 140.0 + uSeed * 3.0);
        float gap = smoothstep(0.0, 0.02, abs(r - 0.62)) * smoothstep(0.0, 0.012, abs(r - 0.3));
        float edge = smoothstep(0.0, 0.06, r) * smoothstep(1.0, 0.94, r);
        vec3 L = normalize(uLight);
        float along = dot(vAround, L);
        float shadow = along < 0.0 ? smoothstep(0.92, 1.06, length(vAround - along * L)) : 1.0;
        gl_FragColor = vec4(uColor * (0.08 + 0.92 * shadow), bands * gap * edge * 0.85);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
}

/** Disque d'accrétion : du blanc au rouge vers l'extérieur, qui tourne. */
function diskMaterial(inner: number, outer: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uInner: { value: inner }, uOuter: { value: outer } },
    vertexShader: `
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime, uInner, uOuter;
      varying vec3 vLocal;
      void main() {
        float r = length(vLocal.xy);
        float a = atan(vLocal.y, vLocal.x);
        float t = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
        vec3 col = mix(vec3(1.0, 0.95, 0.85), vec3(0.95, 0.35, 0.08), t);
        float swirl = 0.7 + 0.3 * sin(a * 6.0 - t * 10.0 + uTime * 1.5);
        float alpha = (1.0 - t) * smoothstep(0.0, 0.1, t + 0.02) * swirl;
        gl_FragColor = vec4(col * alpha, alpha);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
}

// ---------------------------------------------------------------- stations

/** Coriolis : le cuboctaèdre d'Elite, avec sa fente d'amarrage lumineuse. */
function coriolis(size: number): THREE.Group {
  const v = [
    [1, 1, 0], [1, -1, 0], [-1, 1, 0], [-1, -1, 0], [1, 0, 1], [1, 0, -1],
    [-1, 0, 1], [-1, 0, -1], [0, 1, 1], [0, 1, -1], [0, -1, 1], [0, -1, -1],
  ].flat()
  // Huit triangles et six carrés (deux triangles chacun).
  const idx = [
    0, 8, 4, 0, 5, 9, 1, 4, 10, 1, 11, 5, 2, 6, 8, 2, 9, 7, 3, 10, 6, 3, 7, 11,
    0, 4, 1, 0, 1, 5, 2, 3, 6, 2, 7, 3, 8, 6, 10, 8, 10, 4, 9, 5, 11, 9, 11, 7,
    0, 9, 2, 0, 2, 8, 1, 10, 3, 1, 3, 11,
  ]
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
  geo.setIndex(idx)
  const flat = geo.toNonIndexed()
  flat.computeVertexNormals()
  const g = new THREE.Group()
  g.add(new THREE.Mesh(flat, new THREE.MeshLambertMaterial({ color: '#9aa1ad', flatShading: true, side: THREE.DoubleSide })))
  const slot = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.18), new THREE.MeshBasicMaterial({ color: '#8ff0ff' }))
  slot.position.set(0, 0, 1.01)
  g.add(slot)
  g.scale.setScalar(size)
  return g
}

/** Orbis : un anneau habité autour d'un moyeu, relié par des rayons. */
function orbis(size: number): THREE.Group {
  const g = new THREE.Group()
  const hull = new THREE.MeshLambertMaterial({ color: '#b3b9c4' })
  g.add(new THREE.Mesh(new THREE.TorusGeometry(1, 0.13, 8, 40), hull))
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.9, 12).rotateX(Math.PI / 2), hull))
  for (let i = 0; i < 3; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1, 0.06), hull)
    spoke.rotation.z = (i * Math.PI * 2) / 3
    spoke.position.set(-Math.sin(spoke.rotation.z) * 0.5, Math.cos(spoke.rotation.z) * 0.5, 0)
    g.add(spoke)
  }
  const lights = new THREE.Mesh(new THREE.TorusGeometry(1, 0.135, 4, 40, Math.PI * 0.6), new THREE.MeshBasicMaterial({ color: '#ffd28a' }))
  lights.scale.set(1.001, 1.001, 0.2)
  g.add(lights)
  g.scale.setScalar(size)
  return g
}


// ---------------------------------------------------------------- vue

const RAD = Math.PI / 180

/** Direction d'un point du ciel (vers lui) ; `squeeze` resserre les hauteurs sous l'horizon. */
function direction(at: Spot, squeeze = 1): THREE.Vector3 {
  const az = at.az * RAD, el = at.el * squeeze * RAD
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), -Math.sin(el), -Math.cos(az) * Math.cos(el))
}

/** Un astre : son objet (à l'échelle de la vue isométrique), et sa direction dans chaque vue. */
interface Body {
  holder: THREE.Group
  iso: THREE.Vector3
  eye: THREE.Vector3
}

/** Un système construit : ses astres, et ses animations. */
interface Built {
  group: THREE.Group
  bodies: Body[]
  /** @param light mode léger : surfaces moins détaillées */
  update: (t: number, light: boolean) => void
  dispose: () => void
}

function build(id: SystemId): Built {
  const def = SYSTEMS[id]
  const group = new THREE.Group()
  const bodies: Body[] = []
  const disposables: { dispose(): void }[] = []
  const keep = <T extends { dispose(): void }>(o: T) => (disposables.push(o), o)
  const spinners: { o: THREE.Object3D; speed: number }[] = []
  const surfaces: THREE.ShaderMaterial[] = []
  const seed = SYSTEM_IDS.indexOf(id) + 1
  /** Rayon (tuiles, en vue isométrique) d'un astre de rayon apparent `size`. */
  const radius = (size: number) => FOCAL * Math.tan(size * RAD)
  /** Nouvel astre dans la direction `at`. */
  const body = (at: Spot) => {
    const holder = new THREE.Group()
    group.add(holder)
    bodies.push({ holder, iso: direction(at), eye: direction(at, EYE_SQUEEZE) })
    return holder
  }

  for (const n of def.nebula ?? []) {
    const sprite = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(cloudTexture(seed * 11 + n.size)), color: n.color, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })))
    sprite.scale.setScalar(radius(n.size / 2) * 2)
    sprite.renderOrder = -2
    body(n).add(sprite)
  }
  const halo = keep(glowTexture(0.25))
  const corona = keep(glowTexture(0.5, 0.8))
  for (const s of def.stars) {
    // Un cœur presque blanc, une couronne vive au ras du disque, et un grand halo.
    const r = radius(s.size)
    const holder = body(s)
    holder.add(new THREE.Mesh(keep(new THREE.SphereGeometry(r, 32, 20)), keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(s.color).lerp(new THREE.Color('#ffffff'), 0.7) }))))
    for (const [map, size] of [[corona, r * 4.4], [halo, r * 2 * s.glow]] as const) {
      const glow = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map, color: s.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })))
      glow.scale.setScalar(size)
      holder.add(glow)
    }
  }
  // Lumière des planètes : vers l'étoile principale ; sans étoile, de biais.
  const light = def.stars[0] ? direction(def.stars[0]) : new THREE.Vector3(1, 0.5, -1).normalize()
  for (const [i, p] of def.planets.entries()) {
    const r = radius(p.size)
    const holder = body(p)
    const surface = keep(planetMaterial(p, light, seed * 5 + i))
    surfaces.push(surface)
    const segments = r > 3 ? 96 : 48
    const mesh = new THREE.Mesh(keep(new THREE.SphereGeometry(r, segments, segments * 0.6)), surface)
    mesh.rotation.z = 0.2 + ((seed + i * 3) % 5) * 0.09
    holder.add(mesh)
    spinners.push({ o: mesh, speed: 0.01 })
    if (p.atmosphere) holder.add(new THREE.Mesh(keep(new THREE.SphereGeometry(r * 1.045, segments, segments * 0.6)), keep(atmosphereMaterial(p.atmosphere, light))))
    if (p.ring) {
      const ring = new THREE.Mesh(keep(new THREE.RingGeometry(p.ring.inner, p.ring.outer, 128, 1)), keep(ringMaterial(p.ring.color, p.ring.inner, p.ring.outer, seed, light)))
      ring.scale.setScalar(r)
      ring.rotation.set(-Math.PI / 2 + p.ring.tilt, 0, 0.3)
      holder.add(ring)
    }
  }
  if (def.station) {
    const s = def.station.kind === 'coriolis' ? coriolis(radius(def.station.size)) : orbis(radius(def.station.size))
    s.rotation.x = -0.6
    body(def.station).add(s)
    s.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) keep(m.geometry), keep(m.material as THREE.Material)
    })
    spinners.push({ o: s, speed: def.station.kind === 'coriolis' ? 0.25 : 0.12 })
  }
  let disk: THREE.ShaderMaterial | undefined
  if (def.blackHole) {
    const r = radius(def.blackHole.size)
    const holder = body(def.blackHole)
    disk = keep(diskMaterial(r * 1.2, r * 3.3))
    const ring = new THREE.Mesh(keep(new THREE.RingGeometry(r * 1.2, r * 3.3, 96, 1)), disk)
    ring.rotation.set(-Math.PI / 2 + 0.35, 0, 0.2)
    const hole = new THREE.Mesh(keep(new THREE.SphereGeometry(r, 48, 32)), keep(new THREE.MeshBasicMaterial({ color: '#000000' })))
    // Anneau de photons : un mince halo tout autour de l'horizon.
    const lens = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: halo, color: '#ffd9a8', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 })))
    lens.scale.setScalar(r * 3.2)
    lens.position.y = -0.5
    holder.add(lens, ring, hole)
  }
  return {
    group,
    bodies,
    update: (t, light) => {
      for (const s of spinners) s.o.rotation.y = t * s.speed
      for (const m of surfaces) {
        m.uniforms.uTime.value = t
        m.uniforms.uOctaves.value = light ? 3 : 5
      }
      if (disk) disk.uniforms.uTime.value = t
    },
    dispose: () => {
      group.removeFromParent()
      for (const d of disposables) d.dispose()
    },
  }
}

const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3()

/** Le décor du système en cours, et le fondu d'un système à l'autre pendant un saut. */
export class SystemView {
  readonly group = new THREE.Group()
  id: SystemId = HOME_SYSTEM
  private current: Built
  private time = 0
  /** Visibilité (0 : caché pendant la traversée du saut, 1 : là). */
  private shown = 1
  private wanted = 1

  constructor() {
    this.current = build(this.id)
    this.group.add(this.current.group)
  }

  /** Arrive dans le système `id` (sans animation si on y est déjà). */
  set(id: SystemId) {
    if (id === this.id) return
    this.id = id
    this.current.dispose()
    this.current = build(id)
    this.group.add(this.current.group)
  }

  /** Le décor s'efface pendant la traversée d'un saut, et revient à l'arrivée. */
  hide(on: boolean) {
    this.wanted = on ? 0 : 1
  }

  /**
   * @param deckY altitude du pont affiché
   * @param camera caméra de la vue isométrique
   * @param target point qu'elle regarde
   * @param eye position de la caméra en vue subjective (null : vue isométrique)
   */
  update(dt: number, deckY: number, camera: THREE.OrthographicCamera, target: THREE.Vector3, eye: THREE.Vector3 | null = null) {
    this.time += dt
    this.shown = THREE.MathUtils.damp(this.shown, this.wanted, this.wanted > this.shown ? 1.5 : 6, dt)
    const grow = 0.4 + 0.6 * this.shown
    if (eye) {
      // Chaque astre est vraiment dans sa direction, autour des yeux.
      for (const b of this.current.bodies) {
        b.holder.visible = true
        b.holder.position.copy(eye).addScaledVector(b.eye, EYE_DISTANCE)
        b.holder.scale.setScalar((EYE_DISTANCE / FOCAL) * grow)
      }
    } else {
      // Axes de la caméra : la droite, le haut du cadre, et l'arrière (vers elle).
      _x.set(1, 0, 0).applyQuaternion(camera.quaternion)
      _y.set(0, 1, 0).applyQuaternion(camera.quaternion)
      _z.set(0, 0, 1).applyQuaternion(camera.quaternion)
      // Les astres sont loin : en zoomant, ils grossissent moins vite que le pont.
      const lens = Math.sqrt((camera.top - camera.bottom) / 2 / ZOOM_MAX)
      for (const b of this.current.bodies) {
        // Devant l'objectif ? Sa place dans le cadre est celle d'une projection en perspective.
        const ahead = -b.iso.dot(_z)
        b.holder.visible = ahead > 0.3
        if (!b.holder.visible) continue
        const sx = (b.iso.dot(_x) / ahead) * FOCAL * lens
        const sy = (b.iso.dot(_y) / ahead) * FOCAL * lens
        // Sur le rayon de la caméra qui passe par ce point du cadre, à la profondeur du décor.
        const back = (target.y - deckY + DEPTH + sy * _y.y) / _z.y
        b.holder.position.copy(target).addScaledVector(_x, sx).addScaledVector(_y, sy).addScaledVector(_z, -back)
        b.holder.scale.setScalar(lens * grow)
      }
    }
    this.group.visible = this.shown > 0.02
    this.current.update(renderQuality.light ? Math.floor(this.time * 4) / 4 : this.time, renderQuality.light)
  }
}
