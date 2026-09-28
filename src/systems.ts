import * as THREE from 'three'
import { renderQuality } from './quality'
import { tr } from './i18n'
import { HOME_SYSTEM, SYSTEM_IDS, type SystemId } from '../shared/systems.js'

/*
 * Le système où se trouve le vaisseau, vu par les verrières du poste de pilotage : étoiles,
 * planètes, anneaux, stations, trou noir ou nébuleuse, dessinés loin sous le pont (ils passent
 * derrière le vaisseau), entre lui et le champ d'étoiles. C'est un arrière-plan : accroché au
 * regard de la caméra, décalé vers le bas à droite de l'écran, et tourné avec elle, il garde la
 * même place et la même disposition sous tous les angles (accroché à un point du vaisseau, il
 * tournerait autour de lui et passerait dessous, puis devant). Le saut FSD (cf. main.ts) le
 * remplace par celui de la destination.
 */

/** Azimut de la vue isométrique par défaut (cf. camera.ts) : le décor y est disposé tel que défini. */
const ISO_AZIMUTH = Math.PI / 4

/** Où le système apparaît à l'écran, par rapport au point que regarde la caméra (en tuiles) : à droite, un peu plus bas. */
const OFFSET = { right: 8, down: 0.5 }
/** Profondeur du décor sous le pont affiché. */
const DEPTH = 16

interface PlanetDef {
  kind: 'rocky' | 'earth' | 'gas' | 'ice' | 'lava'
  radius: number
  x: number
  z: number
  /** Deux couleurs de la surface (bandes, continents…) et celle de l'atmosphère. */
  colors: [string, string]
  atmosphere?: string
  ring?: { inner: number; outer: number; color: string; tilt: number }
  /** Lune : un petit rocher gris à côté. */
  moon?: { radius: number; x: number; z: number }
}

interface SystemDef {
  name: string
  /** Texte à l'arrivée. */
  arrival: string
  stars: { x: number; z: number; radius: number; color: string; glow: number }[]
  planets: PlanetDef[]
  /** Station : Coriolis (le cube à facettes d'Elite) ou Orbis (un anneau). */
  station?: { kind: 'coriolis' | 'orbis'; x: number; z: number; size: number }
  blackHole?: { x: number; z: number; radius: number }
  nebula?: { color: string; x: number; z: number; size: number }[]
}

export const SYSTEMS: Record<SystemId, SystemDef> = {
  shinrarta: {
    name: 'Shinrarta Dezhra',
    arrival: tr('Jameson Memorial en vue. Les pilotes Elite vous saluent.', 'Jameson Memorial in sight. The Elite pilots salute you.'),
    stars: [{ x: 7, z: -6, radius: 1.1, color: '#ffd9a0', glow: 7 }],
    planets: [{ kind: 'rocky', radius: 2.7, x: -2, z: 3, colors: ['#8a6d52', '#c9a27a'], atmosphere: '#ffcf9a' }],
    station: { kind: 'orbis', x: 3.5, z: -2, size: 1.3 },
  },
  sol: {
    name: 'Sol',
    arrival: tr('La Terre, bleue et lointaine. Pas de permis : demi-tour poli.', 'Earth, blue and distant. No permit: polite U-turn.'),
    stars: [{ x: 8, z: -6, radius: 1.2, color: '#fff2c4', glow: 8 }],
    planets: [{ kind: 'earth', radius: 2.8, x: -1.5, z: 2.5, colors: ['#1f5fae', '#4f8a3c'], atmosphere: '#8fd0ff', moon: { radius: 0.8, x: 4.5, z: 3.5 } }],
  },
  colonia: {
    name: 'Colonia',
    arrival: tr('22 000 al plus tard, les Colons vous offrent un café.', '22,000 ly later, the Colonists offer you a coffee.'),
    stars: [{ x: 7, z: -6, radius: 1.3, color: '#fff7e8', glow: 9 }],
    planets: [{ kind: 'ice', radius: 2.3, x: -3, z: 4, colors: ['#a9c4d9', '#e9f2f8'], atmosphere: '#bfe4ff' }],
    station: { kind: 'orbis', x: 2.5, z: -1.5, size: 1.5 },
    nebula: [
      { color: '#b04fd0', x: -6, z: -8, size: 22 },
      { color: '#ff6fa8', x: 4, z: -12, size: 16 },
    ],
  },
  'alpha-centauri': {
    name: 'Alpha Centauri',
    arrival: tr('Hutton Orbital est à 0,22 al. Courage.', 'Hutton Orbital is 0.22 ly away. Chin up.'),
    stars: [
      { x: 5, z: -6, radius: 1.2, color: '#fff0c0', glow: 7 },
      { x: 8, z: -4, radius: 0.9, color: '#ffc98a', glow: 5 },
      { x: -8, z: -11, radius: 0.35, color: '#ff6a4a', glow: 2.5 },
    ],
    planets: [{ kind: 'rocky', radius: 1.6, x: -2, z: 4, colors: ['#6b6258', '#9a8f80'] }],
    station: { kind: 'coriolis', x: -6, z: -9, size: 0.6 },
  },
  lave: {
    name: 'Lave',
    arrival: tr('Lave Station, comme en 1984. Le Brandy de Lave est hors de prix.', 'Lave Station, just like in 1984. Lavian Brandy is outrageously priced.'),
    stars: [{ x: 7, z: -6, radius: 1, color: '#ffe3b0', glow: 6 }],
    planets: [{ kind: 'earth', radius: 2.8, x: -2, z: 3, colors: ['#2d6f6a', '#8a8a3c'], atmosphere: '#a8f0d0' }],
    station: { kind: 'coriolis', x: 3.5, z: -2.5, size: 1 },
  },
  sagittarius: {
    name: 'Sagittarius A*',
    arrival: tr('Le trou noir au cœur de la galaxie. Ne regardez pas trop longtemps.', 'The black hole at the heart of the galaxy. Don\'t stare too long.'),
    stars: [],
    planets: [],
    blackHole: { x: 0, z: 0, radius: 1.6 },
    nebula: [{ color: '#ffb36a', x: 2, z: -10, size: 26 }],
  },
  maia: {
    name: 'Maia',
    arrival: tr('Nébuleuse des Pléiades. Rien à signaler… presque rien.', 'Pleiades Nebula. Nothing to report… almost nothing.'),
    stars: [
      { x: 6, z: -6, radius: 1.3, color: '#cfe0ff', glow: 9 },
      { x: -9, z: -6, radius: 0.6, color: '#bcd4ff', glow: 4 },
    ],
    planets: [{ kind: 'gas', radius: 2.4, x: -3, z: 4, colors: ['#4a6fa8', '#9ab8e0'], ring: { inner: 3.2, outer: 4.4, color: '#c8d8f0', tilt: 0.5 } }],
    nebula: [
      { color: '#4f8dff', x: -4, z: -9, size: 26 },
      { color: '#7fd4ff', x: 7, z: -12, size: 18 },
    ],
  },
  'beagle-point': {
    name: 'Beagle Point',
    arrival: tr('Au bout de la galaxie. Il y a encore des étoiles.', 'The far end of the galaxy. There are still more stars.'),
    stars: [{ x: 7, z: -7, radius: 0.7, color: '#ff9a6a', glow: 4 }],
    planets: [{ kind: 'gas', radius: 2.6, x: -1, z: 3, colors: ['#8a5a3c', '#d8b48a'], ring: { inner: 3.9, outer: 5.6, color: '#d9c3a0', tilt: 0.4 } }],
  },
}

export const systemName = (id: SystemId) => SYSTEMS[id].name

// ---------------------------------------------------------------- textures

/**
 * Bruit de valeur lissé en 2D sur une grille de W × H cases, répété dans les deux sens
 * (textures équirectangulaires et nuages sans couture).
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

/** Surface d'une planète (texture équirectangulaire), selon son genre. */
function surfaceTexture(p: PlanetDef, seed: number): THREE.CanvasTexture {
  const W = 384, H = 192
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const img = g.createImageData(W, H)
  const a = new THREE.Color(p.colors[0]), b = new THREE.Color(p.colors[1]), col = new THREE.Color()
  const ice = new THREE.Color('#f4f8fb')
  const fbm = fbm2(seed), clouds = fbm2(seed + 101)
  const smooth = (e0: number, e1: number, x: number) => THREE.MathUtils.smoothstep(x, e0, e1)
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1)
    for (let x = 0; x < W; x++) {
      const u = x / W
      const f = fbm(u, v)
      let t: number
      if (p.kind === 'gas') t = 0.5 + 0.5 * Math.sin(v * 34 + f * 5)
      else if (p.kind === 'earth') t = smooth(0.49, 0.53, f)
      else t = f
      col.copy(a).lerp(b, t)
      // Calottes polaires des planètes à atmosphère, et nuages.
      if (p.kind === 'earth' || p.kind === 'ice') col.lerp(ice, 1 - smooth(0.04, 0.1, v) + smooth(0.9, 0.96, v))
      if (p.kind === 'earth') col.lerp(ice, smooth(0.55, 0.7, clouds(u, v)) * 0.8)
      const i = (y * W + x) * 4
      img.data[i] = col.r * 255
      img.data[i + 1] = col.g * 255
      img.data[i + 2] = col.b * 255
      img.data[i + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = THREE.RepeatWrapping
  return t
}

/** Halo radial (étoiles, nébuleuses). */
function glowTexture(soft: number): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(soft, 'rgba(255,255,255,0.35)')
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
 * doux, et un liseré d'atmosphère sur le bord.
 */
function planetMaterial(map: THREE.Texture, light: THREE.Vector3, atmosphere: string | undefined): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uLight: { value: light },
      uAtmo: { value: new THREE.Color(atmosphere ?? '#000000') },
      uAtmoOn: { value: atmosphere ? 1 : 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vUv = uv;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vec4 world = modelMatrix * vec4(position, 1.0);
        // Caméra orthographique : le regard est le même partout.
        vView = normalize((inverse(viewMatrix) * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform vec3 uLight, uAtmo;
      uniform float uAtmoOn;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec3 n = normalize(vNormal);
        float day = smoothstep(-0.15, 0.35, dot(n, normalize(uLight)));
        vec3 col = texture2D(uMap, vUv).rgb * (0.05 + 0.95 * day);
        float rim = pow(1.0 - max(dot(n, vView), 0.0), 2.5);
        col += uAtmo * rim * uAtmoOn * (0.25 + 0.75 * day);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
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
function diskMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vLocal;
      void main() {
        float r = length(vLocal.xy);
        float a = atan(vLocal.y, vLocal.x);
        float t = clamp((r - 1.9) / 3.2, 0.0, 1.0);
        vec3 col = mix(vec3(1.0, 0.95, 0.85), vec3(0.95, 0.35, 0.08), t);
        float swirl = 0.7 + 0.3 * sin(a * 6.0 - r * 3.0 + uTime * 1.5);
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

/** Un système construit : son groupe, et ses animations. */
interface Built {
  group: THREE.Group
  /** `turn` : rotation du décor avec la caméra (radians), que suit la lumière des planètes. */
  update: (t: number, turn: number) => void
  dispose: () => void
}

const UP = new THREE.Vector3(0, 1, 0)

function build(id: SystemId): Built {
  const def = SYSTEMS[id]
  const group = new THREE.Group()
  const disposables: { dispose(): void }[] = []
  const keep = <T extends { dispose(): void }>(o: T) => (disposables.push(o), o)
  const spinners: { o: THREE.Object3D; speed: number }[] = []
  // Direction de l'étoile de chaque planète dans le repère du décor, et l'uniforme (monde) qui la reçoit.
  const lamps: { local: THREE.Vector3; world: THREE.Vector3 }[] = []
  const lit = (light: THREE.Vector3) => {
    const world = light.clone()
    lamps.push({ local: light, world })
    return world
  }
  const seed = SYSTEM_IDS.indexOf(id) + 1

  for (const n of def.nebula ?? []) {
    const sprite = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(cloudTexture(seed * 11 + n.size)), color: n.color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })))
    sprite.scale.setScalar(n.size)
    sprite.position.set(n.x, -8, n.z)
    sprite.renderOrder = -1
    group.add(sprite)
  }
  const halo = keep(glowTexture(0.25))
  for (const s of def.stars) {
    const core = new THREE.Mesh(keep(new THREE.SphereGeometry(s.radius, 24, 16)), keep(new THREE.MeshBasicMaterial({ color: s.color })))
    core.position.set(s.x, 0, s.z)
    const glow = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: halo, color: s.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })))
    glow.scale.setScalar(s.glow)
    glow.position.copy(core.position)
    group.add(core, glow)
  }
  // Lumière des planètes : l'étoile principale, sinon de biais.
  const main = def.stars[0]
  for (const [i, p] of def.planets.entries()) {
    const light = main ? new THREE.Vector3(main.x - p.x, 2, main.z - p.z).normalize() : new THREE.Vector3(1, 0.5, -1).normalize()
    const planet = new THREE.Mesh(keep(new THREE.SphereGeometry(p.radius, 40, 28)), keep(planetMaterial(keep(surfaceTexture(p, seed * 5 + i)), lit(light), p.atmosphere)))
    planet.position.set(p.x, 0, p.z)
    planet.rotation.z = 0.35
    group.add(planet)
    spinners.push({ o: planet, speed: 0.02 })
    if (p.ring) {
      const ring = new THREE.Mesh(keep(new THREE.RingGeometry(p.ring.inner, p.ring.outer, 72, 1)), keep(ringMaterial(p.ring.color, p.ring.inner, p.ring.outer, seed)))
      ring.position.copy(planet.position)
      ring.rotation.set(-Math.PI / 2 + p.ring.tilt, 0, 0.3)
      group.add(ring)
    }
    if (p.moon) {
      const moon = new THREE.Mesh(
        keep(new THREE.SphereGeometry(p.moon.radius, 24, 16)),
        keep(planetMaterial(keep(surfaceTexture({ kind: 'rocky', radius: p.moon.radius, x: 0, z: 0, colors: ['#7d7d80', '#b9b9bd'] }, seed + 99)), lit(light.clone()), undefined)),
      )
      moon.position.set(p.x + p.moon.x, 0.5, p.z + p.moon.z)
      group.add(moon)
    }
  }
  if (def.station) {
    const s = def.station.kind === 'coriolis' ? coriolis(def.station.size) : orbis(def.station.size)
    s.position.set(def.station.x, 1, def.station.z)
    s.rotation.x = -0.6
    group.add(s)
    s.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) keep(m.geometry), keep(m.material as THREE.Material)
    })
    spinners.push({ o: s, speed: def.station.kind === 'coriolis' ? 0.25 : 0.12 })
  }
  let disk: THREE.ShaderMaterial | undefined
  if (def.blackHole) {
    const { x, z, radius } = def.blackHole
    disk = keep(diskMaterial())
    const ring = new THREE.Mesh(keep(new THREE.RingGeometry(radius * 1.2, radius * 3.3, 96, 1)), disk)
    ring.position.set(x, 0, z)
    ring.rotation.set(-Math.PI / 2 + 0.35, 0, 0.2)
    const hole = new THREE.Mesh(keep(new THREE.SphereGeometry(radius, 32, 20)), keep(new THREE.MeshBasicMaterial({ color: '#000000' })))
    hole.position.set(x, 0, z)
    // Anneau de photons : un mince halo tout autour de l'horizon.
    const lens = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: halo, color: '#ffd9a8', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 })))
    lens.scale.setScalar(radius * 3.2)
    lens.position.set(x, -0.5, z)
    group.add(lens, ring, hole)
  }
  return {
    group,
    update: (t, turn) => {
      for (const s of spinners) s.o.rotation.y = t * s.speed
      for (const l of lamps) l.world.copy(l.local).applyAxisAngle(UP, turn)
      if (disk) disk.uniforms.uTime.value = t
    },
    dispose: () => {
      group.removeFromParent()
      for (const d of disposables) d.dispose()
    },
  }
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
   * @param target point que regarde la caméra
   * @param toCamera direction horizontale de la cible vers la caméra
   * @param elevation inclinaison de la caméra (radians)
   */
  update(dt: number, deckY: number, target: THREE.Vector3, toCamera: THREE.Vector3, elevation: number) {
    this.time += dt
    this.shown = THREE.MathUtils.damp(this.shown, this.wanted, this.wanted > this.shown ? 1.5 : 6, dt)
    // Point du pont décalé à l'écran (droite : (cos a, -sin a) ; bas : vers la caméra), puis là où le
    // regard qui passe par lui traverse la profondeur du décor.
    const ax = target.x + toCamera.z * OFFSET.right + toCamera.x * OFFSET.down
    const az = target.z - toCamera.x * OFFSET.right + toCamera.z * OFFSET.down
    const run = DEPTH / Math.tan(elevation)
    this.group.position.set(ax - toCamera.x * run, deckY - DEPTH, az - toCamera.z * run)
    // Le décor tourne avec la caméra (azimut de la caméra : direction (sin a, cos a) vers elle).
    const turn = Math.atan2(toCamera.x, toCamera.z) - ISO_AZIMUTH
    this.group.rotation.y = turn
    this.group.scale.setScalar(0.4 + 0.6 * this.shown)
    this.group.visible = this.shown > 0.02
    this.current.update(renderQuality.light ? Math.floor(this.time * 4) / 4 : this.time, turn)
  }
}
