import * as THREE from 'three'
import { renderQuality } from './quality'
import { tr } from './i18n'
import { HOME_SYSTEM, SYSTEM_IDS, type SystemId } from '../shared/systems.js'

/*
 * Le système où se trouve le vaisseau : étoiles, planètes, anneaux, stations, trou noir ou nébuleuse,
 * dessinés loin sous le pont (ils passent derrière le vaisseau), entre lui et le champ d'étoiles.
 *
 * La vue isométrique reste serrée sur une ou deux pièces (cf. ZOOM_MAX dans camera.ts) : on ne voit
 * l'espace que par-dessus le bord de la coque. Le décor est donc grand, et il se tient au ras des
 * deux bords : une moitié au large de bâbord (au nord), l'autre au large de tribord (au sud), à la
 * hauteur du point que regarde la caméra. Le vaisseau est long et étroit : dès qu'un bord de coque
 * entre dans le cadre, il y a une planète, une étoile ou une station derrière, sous tous les angles
 * (accroché devant la proue, le décor tournait autour d'elle et passait sous le vaisseau). Le saut
 * FSD (cf. main.ts) le remplace par celui de la destination.
 */

/** Profondeur du décor sous le pont affiché : les plus grosses planètes restent au-dessus des étoiles (cf. starfield.ts). */
const DEPTH = 19
/** Largeur de coque retenue pour éclairer les planètes : l'écart entre les deux moitiés du décor. */
const BEAM = 15
/**
 * Vue subjective : chaque moitié du décor se tient au large de son bord, un peu sous les yeux, dans
 * le cadre des verrières. Elle suit les yeux sans tourner avec le regard : on tourne la tête sur
 * place, le système reste où il est.
 */
const EYE_AWAY = 30
const EYE_RISE = -1.5

type PlanetKind = 'rocky' | 'earth' | 'gas' | 'ice' | 'lava'
const KINDS: PlanetKind[] = ['rocky', 'earth', 'gas', 'ice', 'lava']

/**
 * Place d'un astre : `x` le long de la coque, par rapport au point que regarde la caméra ; `z` au
 * large d'un bord, en tuiles : négatif à bâbord (au nord de la coque), positif à tribord (au sud).
 */
interface Spot {
  x: number
  z: number
}

interface PlanetDef extends Spot {
  kind: PlanetKind
  radius: number
  /** Deux couleurs de la surface (bandes, continents…) et celle de l'atmosphère. */
  colors: [string, string]
  atmosphere?: string
  ring?: { inner: number; outer: number; color: string; tilt: number }
  /** Lune : un rocher gris, de son côté. */
  moon?: Spot & { radius: number }
}

interface SystemDef {
  name: string
  /** Texte à l'arrivée. */
  arrival: string
  stars: (Spot & { radius: number; color: string; glow: number })[]
  planets: PlanetDef[]
  /** Station : Coriolis (le cube à facettes d'Elite) ou Orbis (un anneau). */
  station?: Spot & { kind: 'coriolis' | 'orbis'; size: number }
  blackHole?: Spot & { radius: number }
  nebula?: (Spot & { color: string; size: number })[]
}

export const SYSTEMS: Record<SystemId, SystemDef> = {
  shinrarta: {
    name: 'Shinrarta Dezhra',
    arrival: tr('Jameson Memorial en vue. Les pilotes Elite vous saluent.', 'Jameson Memorial in sight. The Elite pilots salute you.'),
    stars: [{ x: 5, z: 8, radius: 2.2, color: '#ffd9a0', glow: 17 }],
    planets: [{ kind: 'rocky', radius: 8, x: -5, z: -7, colors: ['#8a6d52', '#c9a27a'], atmosphere: '#ffcf9a', moon: { radius: 1.7, x: -5, z: 5 } }],
    station: { kind: 'orbis', x: 8, z: -4.5, size: 2.6 },
  },
  sol: {
    name: 'Sol',
    arrival: tr('La Terre, bleue et lointaine. Pas de permis : demi-tour poli.', 'Earth, blue and distant. No permit: polite U-turn.'),
    stars: [{ x: 6, z: 9, radius: 2.3, color: '#fff2c4', glow: 18 }],
    planets: [{ kind: 'earth', radius: 8.5, x: -4, z: -7.5, colors: ['#1f5fae', '#4f8a3c'], atmosphere: '#8fd0ff', moon: { radius: 2.3, x: -5, z: 5.5 } }],
  },
  colonia: {
    name: 'Colonia',
    arrival: tr('22 000 al plus tard, les Colons vous offrent un café.', '22,000 ly later, the Colonists offer you a coffee.'),
    stars: [{ x: 11, z: -11, radius: 2.4, color: '#fff7e8', glow: 19 }],
    planets: [{ kind: 'ice', radius: 7, x: -6, z: -6.5, colors: ['#a9c4d9', '#e9f2f8'], atmosphere: '#bfe4ff' }],
    station: { kind: 'orbis', x: 1, z: 6, size: 3 },
    nebula: [
      { color: '#b04fd0', x: -8, z: 14, size: 46 },
      { color: '#ff6fa8', x: 12, z: -16, size: 38 },
    ],
  },
  'alpha-centauri': {
    name: 'Alpha Centauri',
    arrival: tr('Hutton Orbital est à 0,22 al. Courage.', 'Hutton Orbital is 0.22 ly away. Chin up.'),
    stars: [
      { x: 4, z: 9, radius: 2.3, color: '#fff0c0', glow: 16 },
      { x: -4, z: 6, radius: 1.7, color: '#ffc98a', glow: 11 },
      { x: 14, z: -13, radius: 0.8, color: '#ff6a4a', glow: 6 },
    ],
    planets: [{ kind: 'rocky', radius: 5.5, x: -6, z: -5.5, colors: ['#6b6258', '#9a8f80'] }],
    station: { kind: 'coriolis', x: 6, z: -4.5, size: 1.5 },
  },
  lave: {
    name: 'Lave',
    arrival: tr('Lave Station, comme en 1984. Le Brandy de Lave est hors de prix.', 'Lave Station, just like in 1984. Lavian Brandy is outrageously priced.'),
    stars: [{ x: 11, z: -11, radius: 2, color: '#ffe3b0', glow: 15 }],
    planets: [{ kind: 'earth', radius: 8, x: -5, z: -7, colors: ['#2d6f6a', '#8a8a3c'], atmosphere: '#a8f0d0' }],
    station: { kind: 'coriolis', x: 1, z: 6, size: 2.2 },
  },
  sagittarius: {
    name: 'Sagittarius A*',
    arrival: tr('Le trou noir au cœur de la galaxie. Ne regardez pas trop longtemps.', 'The black hole at the heart of the galaxy. Don\'t stare too long.'),
    stars: [],
    planets: [],
    blackHole: { x: -2, z: -9, radius: 3.6 },
    nebula: [
      { color: '#ffb36a', x: 6, z: -14, size: 50 },
      { color: '#ff8a5a', x: -4, z: 14, size: 44 },
    ],
  },
  maia: {
    name: 'Maia',
    arrival: tr('Nébuleuse des Pléiades. Rien à signaler… presque rien.', 'Pleiades Nebula. Nothing to report… almost nothing.'),
    stars: [
      { x: 5, z: 9, radius: 2.5, color: '#cfe0ff', glow: 19 },
      { x: -5, z: 6, radius: 1.3, color: '#bcd4ff', glow: 9 },
    ],
    planets: [{ kind: 'gas', radius: 6.5, x: -4, z: -9, colors: ['#4a6fa8', '#9ab8e0'], ring: { inner: 8.2, outer: 11.5, color: '#c8d8f0', tilt: 0.5 } }],
    nebula: [
      { color: '#4f8dff', x: -6, z: -14, size: 50 },
      { color: '#7fd4ff', x: 10, z: 15, size: 40 },
    ],
  },
  'beagle-point': {
    name: 'Beagle Point',
    arrival: tr('Au bout de la galaxie. Il y a encore des étoiles.', 'The far end of the galaxy. There are still more stars.'),
    stars: [{ x: 3, z: 8, radius: 1.5, color: '#ff9a6a', glow: 11 }],
    planets: [{ kind: 'gas', radius: 7, x: -3, z: -9.5, colors: ['#8a5a3c', '#d8b48a'], ring: { inner: 9, outer: 13, color: '#d9c3a0', tilt: 0.4 } }],
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
 * Planète éclairée par son étoile (et non par le soleil de la scène) : jour, nuit, terminateur
 * doux, et un liseré d'atmosphère sur le bord. La surface est calculée dans le shader (bruit en 3D
 * sur la sphère, sans texture) : vue de près, sur tout un coin de l'écran, elle reste nette.
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
      varying vec3 vLocal;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vLocal = normalize(position);
        vNormal = normalize(mat3(modelMatrix) * normal);
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

      void main() {
        vec3 n = normalize(vNormal);
        vec3 p = vLocal + uSeed;
        float lit = dot(n, normalize(uLight));
        float day = smoothstep(-0.15, 0.35, lit);
        float cap = abs(vLocal.y);
        vec3 ice = vec3(0.93, 0.96, 0.98);
        vec3 col;
        vec3 glow = vec3(0.0);
        if (uKind == 1) {
          // Tellurique : océans, continents (côtes, reliefs, déserts), calottes, nuages, villes la nuit.
          float h = fbm(p * 1.7);
          float land = smoothstep(0.5, 0.52, h);
          vec3 sea = mix(uA * 0.55, uA * 1.15, smoothstep(0.3, 0.5, h));
          vec3 ground = mix(uB, mix(uB * 0.5, vec3(0.72, 0.62, 0.42), fbm(p * 5.0 + 3.0)), smoothstep(0.52, 0.7, h));
          col = mix(sea, ground, land);
          col = mix(col, ice, smoothstep(0.78, 0.9, cap + (h - 0.5) * 0.4));
          float clouds = smoothstep(0.52, 0.72, fbm(p * 2.6 + vec3(uTime * 0.01, 0.0, 7.0)));
          glow = vec3(1.0, 0.75, 0.4) * land * step(0.74, noise(p * 26.0)) * (1.0 - day) * (1.0 - clouds) * 0.9;
          col = mix(col, vec3(1.0), clouds * 0.85);
        } else if (uKind == 2) {
          // Géante gazeuse : des bandes que la turbulence froisse, et quelques ovales de tempête.
          float swirl = fbm(p * vec3(1.6, 5.0, 1.6));
          float bands = 0.5 + 0.5 * sin(vLocal.y * 15.0 + swirl * 4.5);
          col = mix(uA, uB, bands);
          col = mix(col, uB * 1.15, smoothstep(0.62, 0.8, fbm(p * vec3(2.5, 9.0, 2.5) + 4.0)) * 0.6);
          col *= 0.86 + 0.28 * fbm(p * vec3(3.0, 24.0, 3.0));
        } else if (uKind == 3) {
          // Glace : une banquise parcourue de failles sombres.
          float h = fbm(p * 2.2);
          col = mix(uA, uB, smoothstep(0.3, 0.7, h));
          float crack = 1.0 - smoothstep(0.0, 0.035, abs(fbm(p * 3.4 + 9.0) - 0.5));
          col = mix(col, uA * 0.55, crack * 0.7);
          col = mix(col, ice, smoothstep(0.7, 0.9, cap));
        } else if (uKind == 4) {
          // Lave : une croûte sombre, des coulées qui luisent de jour comme de nuit.
          float h = fbm(p * 2.4);
          col = mix(uA * 0.4, uA, h);
          glow = uB * (1.0 - smoothstep(0.0, 0.06, abs(fbm(p * 3.0 + 5.0) - 0.5)));
        } else {
          // Rocheuse : plaines sombres et hauts plateaux clairs, grain fin, semis de cratères.
          float h = fbm(p * 2.3);
          col = mix(uA * 0.7, uB * 1.05, smoothstep(0.3, 0.7, h));
          col *= 0.72 + 0.56 * fbm(p * 11.0);
          col *= 1.0 - 0.28 * smoothstep(0.78, 0.84, noise(p * 13.0 + 2.0));
        }
        col = col * (0.04 + 0.96 * day) + glow;
        float rim = pow(1.0 - max(dot(n, normalize(vView)), 0.0), 2.5);
        col += uAtmo * rim * uAtmoOn * (0.2 + 0.8 * day);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  })
}

/** Halo d'atmosphère : une coquille autour de la planète, qui luit au-delà du bord, du côté du jour. */
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
        float edge = pow(clamp(-dot(n, normalize(vView)) * 2.6, 0.0, 1.0), 2.0);
        float day = smoothstep(-0.5, 0.4, dot(n, normalize(uLight)));
        gl_FragColor = vec4(uColor * edge * (0.1 + 0.9 * day) * 0.75, 1.0);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  })
}

/** Anneaux : bandes concentriques translucides, plus sombres du côté de l'ombre de la planète. */
function ringMaterial(color: string, inner: number, outer: number, seed: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uInner: { value: inner }, uOuter: { value: outer }, uSeed: { value: seed } },
    vertexShader: `
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uInner, uOuter, uSeed;
      varying vec3 vLocal;
      void main() {
        float r = (length(vLocal.xy) - uInner) / (uOuter - uInner);
        float bands = 0.55 + 0.45 * sin(r * 40.0 + uSeed) * sin(r * 13.0 + uSeed * 2.0);
        float edge = smoothstep(0.0, 0.08, r) * smoothstep(1.0, 0.9, r);
        gl_FragColor = vec4(uColor, bands * edge * 0.75);
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

/** Un système construit : ses deux moitiés (bâbord, tribord), et ses animations. */
interface Built {
  port: THREE.Group
  starboard: THREE.Group
  /** @param light mode léger : surfaces moins détaillées */
  update: (t: number, light: boolean) => void
  dispose: () => void
}

function build(id: SystemId): Built {
  const def = SYSTEMS[id]
  const port = new THREE.Group(), starboard = new THREE.Group()
  const disposables: { dispose(): void }[] = []
  const keep = <T extends { dispose(): void }>(o: T) => (disposables.push(o), o)
  const spinners: { o: THREE.Object3D; speed: number }[] = []
  const surfaces: THREE.ShaderMaterial[] = []
  const seed = SYSTEM_IDS.indexOf(id) + 1
  /** Pose un astre de son côté de la coque, à la hauteur `y` au-dessus du plan du décor. */
  const place = (o: THREE.Object3D, at: Spot, y = 0) => {
    o.position.set(at.x, y, at.z)
    ;(at.z < 0 ? port : starboard).add(o)
  }
  /** Position d'un astre dans un repère commun aux deux moitiés, pour orienter la lumière. */
  const across = (at: Spot) => new THREE.Vector3(at.x, 0, at.z < 0 ? at.z : at.z + BEAM)

  for (const n of def.nebula ?? []) {
    const sprite = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(cloudTexture(seed * 11 + n.size)), color: n.color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })))
    sprite.scale.setScalar(n.size)
    sprite.renderOrder = -1
    place(sprite, n, -10)
  }
  const halo = keep(glowTexture(0.25))
  const corona = keep(glowTexture(0.5, 0.8))
  for (const s of def.stars) {
    // Un cœur presque blanc, une couronne vive au ras du disque, et un grand halo.
    const core = new THREE.Mesh(keep(new THREE.SphereGeometry(s.radius, 32, 20)), keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(s.color).lerp(new THREE.Color('#ffffff'), 0.45) })))
    place(core, s)
    for (const [map, size] of [[corona, s.radius * 4.4], [halo, s.glow]] as const) {
      const glow = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map, color: s.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })))
      glow.scale.setScalar(size)
      place(glow, s)
    }
  }
  // Lumière des planètes : l'étoile principale, sinon de biais.
  const main = def.stars[0]
  const planet = (p: Pick<PlanetDef, 'kind' | 'colors' | 'atmosphere' | 'radius'>, at: Spot, light: THREE.Vector3, salt: number) => {
    const surface = keep(planetMaterial(p, light, salt))
    surfaces.push(surface)
    const mesh = new THREE.Mesh(keep(new THREE.SphereGeometry(p.radius, 64, 40)), surface)
    mesh.rotation.z = 0.35
    place(mesh, at)
    spinners.push({ o: mesh, speed: 0.012 })
    if (p.atmosphere) place(new THREE.Mesh(keep(new THREE.SphereGeometry(p.radius * 1.07, 64, 40)), keep(atmosphereMaterial(p.atmosphere, light))), at)
  }
  for (const [i, p] of def.planets.entries()) {
    // D'un bord à l'autre de la coque, l'étoile éclairerait la planète de face : on rabat sa lumière
    // sur le côté, pour garder un terminateur.
    const light = main ? across(main).sub(across(p)).multiply(new THREE.Vector3(1, 0, 0.3)).setY(BEAM * 0.3).normalize() : new THREE.Vector3(1, 0.5, -1).normalize()
    planet(p, p, light, seed * 5 + i)
    if (p.ring) {
      const ring = new THREE.Mesh(keep(new THREE.RingGeometry(p.ring.inner, p.ring.outer, 96, 1)), keep(ringMaterial(p.ring.color, p.ring.inner, p.ring.outer, seed)))
      ring.rotation.set(-Math.PI / 2 + p.ring.tilt, 0, 0.3)
      place(ring, p)
    }
    if (p.moon) planet({ kind: 'rocky', radius: p.moon.radius, colors: ['#7d7d80', '#b9b9bd'] }, p.moon, light, seed + 99)
  }
  if (def.station) {
    const s = def.station.kind === 'coriolis' ? coriolis(def.station.size) : orbis(def.station.size)
    s.rotation.x = -0.6
    // Plus haute que les planètes : elle passe devant leur disque.
    place(s, def.station, DEPTH * 0.55)
    s.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) keep(m.geometry), keep(m.material as THREE.Material)
    })
    spinners.push({ o: s, speed: def.station.kind === 'coriolis' ? 0.25 : 0.12 })
  }
  let disk: THREE.ShaderMaterial | undefined
  if (def.blackHole) {
    const { radius } = def.blackHole
    disk = keep(diskMaterial(radius * 1.2, radius * 3.3))
    const ring = new THREE.Mesh(keep(new THREE.RingGeometry(radius * 1.2, radius * 3.3, 96, 1)), disk)
    ring.rotation.set(-Math.PI / 2 + 0.35, 0, 0.2)
    const hole = new THREE.Mesh(keep(new THREE.SphereGeometry(radius, 48, 32)), keep(new THREE.MeshBasicMaterial({ color: '#000000' })))
    // Anneau de photons : un mince halo tout autour de l'horizon.
    const lens = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: halo, color: '#ffd9a8', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 })))
    lens.scale.setScalar(radius * 3.2)
    place(lens, def.blackHole, -0.5)
    place(ring, def.blackHole)
    place(hole, def.blackHole)
  }
  return {
    port,
    starboard,
    update: (t, light) => {
      for (const s of spinners) s.o.rotation.y = t * s.speed
      for (const m of surfaces) {
        m.uniforms.uTime.value = t
        m.uniforms.uOctaves.value = light ? 3 : 5
      }
      if (disk) disk.uniforms.uTime.value = t
    },
    dispose: () => {
      port.removeFromParent()
      starboard.removeFromParent()
      for (const d of disposables) d.dispose()
    },
  }
}

/** Bords de la coque sous le pont affiché : le décor commence au-delà (z du bord bâbord, au nord, et du bord tribord, au sud). */
export interface HullSides {
  north: number
  south: number
}

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
    this.group.add(this.current.port, this.current.starboard)
  }

  /** Arrive dans le système `id` (sans animation si on y est déjà). */
  set(id: SystemId) {
    if (id === this.id) return
    this.id = id
    this.current.dispose()
    this.current = build(id)
    this.group.add(this.current.port, this.current.starboard)
  }

  /** Le décor s'efface pendant la traversée d'un saut, et revient à l'arrivée. */
  hide(on: boolean) {
    this.wanted = on ? 0 : 1
  }

  /**
   * @param deckY altitude du pont affiché
   * @param sides bords de la coque sous ce pont
   * @param target point que regarde la caméra
   * @param toCamera direction horizontale de la cible vers la caméra
   * @param elevation inclinaison de la caméra (radians)
   * @param eye position de la caméra en vue subjective (null : vue isométrique)
   */
  update(dt: number, deckY: number, sides: HullSides, target: THREE.Vector3, toCamera: THREE.Vector3, elevation: number, eye: THREE.Vector3 | null = null) {
    this.time += dt
    this.shown = THREE.MathUtils.damp(this.shown, this.wanted, this.wanted > this.shown ? 1.5 : 6, dt)
    const { port, starboard } = this.current
    if (eye) {
      port.position.set(eye.x, eye.y + EYE_RISE, eye.z - EYE_AWAY)
      starboard.position.set(eye.x, eye.y + EYE_RISE, eye.z + EYE_AWAY)
    } else {
      // Là où le regard qui passe par ce point du pont traverse la profondeur du décor.
      const run = DEPTH / Math.tan(elevation)
      port.position.set(target.x - toCamera.x * run, deckY - DEPTH, sides.north - toCamera.z * run)
      starboard.position.set(target.x - toCamera.x * run, deckY - DEPTH, sides.south - toCamera.z * run)
    }
    port.scale.setScalar(0.4 + 0.6 * this.shown)
    starboard.scale.setScalar(0.4 + 0.6 * this.shown)
    this.group.visible = this.shown > 0.02
    this.current.update(renderQuality.light ? Math.floor(this.time * 4) / 4 : this.time, renderQuality.light)
  }
}
