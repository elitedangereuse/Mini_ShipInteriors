import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { compact, cylinder, instanced, keepShared, lit, part, rng, setInstance, sphere } from './kit'

/*
 * La vie de l'étang du jardin exotique (cf. fishing.ts) : son eau, qui ondule, scintille et
 * projette des caustiques sur le fond, avec les rides que laissent ceux qui la touchent ; les
 * grenouilles qui sautent de nénuphar en nénuphar (et plongent, puis nagent les yeux hors de
 * l'eau), les libellules qui volent en saccades et trempent le bout de la queue, les gerris qui
 * patinent, des feuilles et des pétales qui dérivent.
 *
 * Tout se passe dans le repère de l'étang (son centre, au sol). Les bêtes suivent des emplois du
 * temps tirés au sort une fois (aléatoire à graine) et lus à l'instant `t` : rien ne dépend de la
 * cadence d'affichage, et un pont qu'on quitte puis retrouve reprend où il en est.
 */

/** Une ride : centre (x, z), instant de départ, force (0 à 1 ; la durée de vie en dépend). */
const RIPPLES = 24

/** Emprise de l'eau : demi-largeur, demi-profondeur, rayon des coins (négatif : une ellipse). */
export interface PondShape {
  hw: number
  hd: number
  r: number
}

// ---------------------------------------------------------------- eau

const WATER_VERTEX = `
  varying vec2 vP;
  varying vec3 vW;
  void main() {
    vP = position.xz;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`

const WATER_FRAGMENT = `
  uniform float uTime;
  uniform vec4 uRipples[${RIPPLES}];
  uniform vec3 uBox;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uSky;
  varying vec2 vP;
  varying vec3 vW;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  // Distance signée au bord de l'eau (rectangle aux coins arrondis, ou ellipse) : négative dedans.
  float shore(vec2 p) {
    if (uBox.z < 0.0) return (length(p / uBox.xy) - 1.0) * min(uBox.x, uBox.y);
    vec2 q = abs(p) - uBox.xy + uBox.z;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uBox.z;
  }
  // Houle douce : quelques trains d'ondes croisés et un bruit qui dérive.
  float swell(vec2 p, float t) {
    float h = sin(dot(p, vec2(1.0, 0.6)) * 9.0 + t * 1.3) * 0.5;
    h += sin(dot(p, vec2(-0.7, 1.0)) * 13.0 + t * 1.7) * 0.32;
    h += sin(dot(p, vec2(0.3, -1.0)) * 23.0 - t * 2.4) * 0.16;
    h += (noise(p * 11.0 + vec2(t * 0.35, -t * 0.25)) - 0.5) * 0.7;
    return h;
  }
  // Caustiques : le filet de lumière qui danse sur le fond (lignes claires, 0 à 1).
  float caustic(vec2 p, float t) {
    vec2 q = p * 4.2;
    vec2 i = q;
    float c = 0.0;
    for (int n = 0; n < 3; n++) {
      float tt = t * 0.55 * (1.0 - 3.5 / float(n + 1));
      i = q + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
      c += 1.0 / length(vec2(q.x / (sin(i.x + tt) / 0.006), q.y / (cos(i.y + tt) / 0.006)));
    }
    c = 1.17 - pow(c / 3.0, 1.4);
    return clamp(pow(abs(c), 8.0), 0.0, 1.0);
  }

  void main() {
    vec2 p = vP;
    float t = uTime;
    float edge = -shore(p);
    // Pente de la houle (différences finies), puis celle des rides, calculée directement.
    float e = 0.012;
    float h0 = swell(p, t);
    vec2 slope = vec2(swell(p + vec2(e, 0.0), t) - h0, swell(p + vec2(0.0, e), t) - h0) / e * 0.012;
    float rings = 0.0;
    for (int k = 0; k < ${RIPPLES}; k++) {
      vec4 r = uRipples[k];
      float age = t - r.z;
      float life = 0.7 + r.w * 1.6;
      if (r.w <= 0.0 || age < 0.0 || age > life) continue;
      vec2 dp = p - r.xy;
      float d = length(dp) + 1e-4;
      float front = 0.05 + age * (0.18 + r.w * 0.14);
      float x = d - front;
      float env = exp(-x * x / (0.0016 + age * 0.004)) * (1.0 - age / life) * r.w;
      // Deux ou trois crêtes derrière le front, qui s'amortissent.
      float k2 = 80.0 - r.w * 30.0;
      slope += dp / d * cos(x * k2) * env * 0.9;
      rings += max(0.0, sin(x * k2)) * env;
    }
    vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));

    // Couleur : claire près du bord (peu profond), profonde au milieu ; le fond s'éclaire de caustiques.
    float depth = smoothstep(0.0, 0.55, edge);
    vec3 col = mix(uShallow, uDeep, depth);
    float c = caustic(p + n.xz * 0.6, t);
    col += vec3(0.55, 0.85, 0.8) * c * 0.32 * (1.0 - depth * 0.55);
    // Les pentes tournées vers la lumière s'éclaircissent, les autres foncent : l'eau bouge.
    float facing = dot(n.xz, normalize(vec2(-0.55, -0.8)));
    col *= 0.95 + facing * 2.5;
    // Reflet du ciel de la serre, plus fort sur les pentes rasantes.
    vec3 v = normalize(cameraPosition - vW);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    col = mix(col, uSky, clamp(0.12 + fres * 0.6, 0.0, 0.5));
    // Crêtes des rides, et scintillements qui s'allument et s'éteignent au gré des vaguelettes.
    col += vec3(0.85, 0.97, 1.0) * clamp(rings * 1.4, 0.0, 0.8);
    float tw = noise(p * 34.0 + vec2(t * 0.8, -t * 0.6)) * noise(p * 27.0 - vec2(t * 0.5, t * 0.9));
    float glint = smoothstep(0.66, 0.8, tw) * smoothstep(0.0, 0.05, facing);
    col += vec3(1.0) * glint * 0.9;
    // Liseré d'écume contre la margelle.
    float foam = smoothstep(0.07, 0.0, edge + 0.018 * sin(p.x * 23.0 + p.y * 17.0 + t * 1.8));
    col = mix(col, vec3(0.9, 0.98, 1.0), foam * 0.55);
    float alpha = mix(0.5, 0.8, 1.0 - depth) + glint * 0.3 + rings * 0.3 + foam * 0.2;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.95));
    #include <colorspace_fragment>
  }`

/** Surface de l'étang et ses rides. `spawn` en ajoute une (la plus vieille cède sa place). */
export class PondWater {
  readonly material: THREE.ShaderMaterial
  private readonly ripples: THREE.Vector4[]
  private next = 0

  constructor(shape: PondShape) {
    this.ripples = Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, -99, 0))
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uRipples: { value: this.ripples },
        uBox: { value: new THREE.Vector3(shape.hw, shape.hd, shape.r) },
        uDeep: { value: new THREE.Color('#13565f') },
        uShallow: { value: new THREE.Color('#3fa6a2') },
        uSky: { value: new THREE.Color('#cdeff2') },
      },
      vertexShader: WATER_VERTEX,
      fragmentShader: WATER_FRAGMENT,
      transparent: true,
      depthWrite: false,
    })
  }

  set time(t: number) {
    this.material.uniforms.uTime.value = t
  }

  spawn(x: number, z: number, t: number, strength: number) {
    this.ripples[this.next].set(x, z, t, strength)
    this.next = (this.next + 1) % RIPPLES
  }
}

/**
 * Eau qui tombe (la cascade, le filet de la grenouille de pierre) : des filets clairs qui
 * descendent le long de la nappe (coordonnées de texture : v vers le haut), plus pâles au bord.
 */
export function fallingWater(time: { value: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: time },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        float s = noise(vec2(vUv.x * 14.0, vUv.y * 4.0 + uTime * 3.2)) * 0.6 + noise(vec2(vUv.x * 31.0, vUv.y * 9.0 + uTime * 5.0)) * 0.4;
        float side = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
        vec3 col = mix(vec3(0.55, 0.85, 0.9), vec3(1.0), smoothstep(0.45, 0.8, s));
        float foot = smoothstep(0.2, 0.0, vUv.y);
        gl_FragColor = vec4(mix(col, vec3(1.0), foot * 0.6), (0.35 + s * 0.45 + foot * 0.3) * side);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
}

// ---------------------------------------------------------------- outils

const ease = (k: number) => k * k * (3 - 2 * k)
const clamp01 = (k: number) => Math.min(1, Math.max(0, k))

/** Le point (x, z) est-il dans l'eau, à `margin` au moins du bord ? */
function inWater(s: PondShape, x: number, z: number, margin: number): boolean {
  const qx = Math.abs(x) - s.hw + s.r + margin, qz = Math.abs(z) - s.hd + s.r + margin
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - s.r < 0
}

/** Un point de l'eau au hasard, à `margin` du bord. */
function waterPoint(s: PondShape, random: () => number, margin: number): { x: number; z: number } {
  for (let i = 0; i < 30; i++) {
    const x = (random() * 2 - 1) * (s.hw - margin), z = (random() * 2 - 1) * (s.hd - margin)
    if (inWater(s, x, z, margin)) return { x, z }
  }
  return { x: 0, z: 0 }
}

/** Écart d'angle le plus court, de `a` vers `b`. */
const turn = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a))

// ---------------------------------------------------------------- grenouilles

/** Grenouille assise, face à +z, posée sur y = 0 ; le sac vocal est à part (il gonfle). */
function frogModel(skin: string, belly: string): { body: THREE.Group; sac: THREE.Mesh } {
  const g = new THREE.Group()
  const green = lit(skin), dark = lit(new THREE.Color(skin).multiplyScalar(0.62).getStyle()), pale = lit(belly)
  const body = sphere(0.045, green, 0, 0.032, -0.005, 10)
  body.scale.set(1, 0.62, 1.15)
  const under = sphere(0.04, pale, 0, 0.024, 0.004, 8)
  under.scale.set(0.9, 0.5, 1)
  const head = sphere(0.034, green, 0, 0.05, 0.04, 10)
  head.scale.set(1.18, 0.66, 1)
  g.add(body, under, head)
  // Les yeux : gros, sur le dessus de la tête, la pupille noire.
  for (const s of [-1, 1]) {
    g.add(sphere(0.013, green, s * 0.022, 0.068, 0.044, 8), sphere(0.0085, lit('#f2d24a'), s * 0.026, 0.072, 0.05, 6), sphere(0.0055, lit('#141414'), s * 0.028, 0.073, 0.055, 5))
    // Pattes arrière repliées, pied palmé à plat ; pattes avant, droites.
    const thigh = sphere(0.028, green, s * 0.045, 0.022, -0.025, 8)
    thigh.scale.set(0.62, 0.48, 1.35)
    const foot = sphere(0.02, dark, s * 0.055, 0.004, 0.015, 6)
    foot.scale.set(1, 0.2, 1.4)
    const arm = cylinder(0.006, 0.006, 0.035, green, s * 0.028, 0.016, 0.052, 5)
    arm.rotation.x = 0.35
    g.add(thigh, foot, arm, sphere(0.008, dark, s * 0.03, 0.002, 0.064, 5))
  }
  // Quelques taches sur le dos.
  for (const [x, z, r] of [[-0.016, -0.01, 0.008], [0.018, 0.004, 0.007], [0.002, -0.032, 0.006]] as const) g.add(sphere(r, dark, x, 0.058 - Math.abs(z) * 0.3, z, 5))
  const sac = part(new THREE.SphereGeometry(0.016, 8, 6), keepShared(new THREE.MeshLambertMaterial({ color: belly })), 0, 0.026, 0.066)
  return { body: compact(g), sac }
}

/** Où une grenouille peut se poser : un nénuphar, une pierre de la margelle, ou l'eau (elle y nage). */
interface Perch {
  x: number
  z: number
  y: number
  water?: boolean
}

interface FrogLeg {
  from: Perch
  to: Perch
  start: number
  /** Fin de l'attente sur `from`, début du saut ; fin du saut. */
  leap: number
  end: number
  /** Cap à l'arrivée sur `from`, et celui du saut (elle se tourne juste avant de sauter). */
  arrive: number
  face: number
}

/**
 * Une grenouille et son emploi du temps : elle attend, coasse (le sac gonfle deux fois), saute
 * vers un autre perchoir ; dans l'eau, elle nage lentement, les yeux dehors, puis remonte.
 */
class Frog {
  readonly root = new THREE.Group()
  private readonly sac: THREE.Mesh
  private leg: FrogLeg
  private readonly random: () => number

  constructor(
    skin: string,
    belly: string,
    seed: number,
    private readonly perches: Perch[],
    private readonly busy: Set<Perch>,
    private readonly shape: PondShape,
    private readonly water: number,
    start: Perch,
    private readonly splash: (x: number, z: number, t: number, s: number) => void,
  ) {
    const model = frogModel(skin, belly)
    this.sac = model.sac
    this.root.add(model.body, model.sac)
    this.random = rng(seed)
    busy.add(start)
    const face = this.random() * Math.PI * 2
    const leap = 2 + this.random() * 6
    this.leg = { from: start, to: start, start: 0, leap, end: leap, arrive: face, face }
  }

  /** Le saut suivant, depuis là où elle vient d'arriver. */
  private plan(at: number) {
    const from = this.leg.to
    let to: Perch
    if (!from.water && this.random() < 0.28) {
      // Un plongeon : un point de l'eau pas trop loin.
      const p = waterPoint(this.shape, this.random, 0.4)
      to = { x: (p.x + from.x) / 2, z: (p.z + from.z) / 2, y: this.water - 0.034, water: true }
    } else {
      const free = this.perches.filter((p) => !this.busy.has(p) && Math.hypot(p.x - from.x, p.z - from.z) < 1.6)
      to = free.length ? free[Math.floor(this.random() * free.length)] : from
    }
    this.busy.delete(from)
    this.busy.add(to)
    // Dans l'eau, elle nage un moment ; ailleurs, elle reste assise de 3 à 9 secondes.
    const wait = from.water ? 2.5 + this.random() * 3 : 3 + this.random() * 6
    const dist = Math.hypot(to.x - from.x, to.z - from.z)
    const leap = at + wait
    const face = dist > 0.01 ? Math.atan2(to.x - from.x, to.z - from.z) : this.leg.face
    this.leg = { from, to, start: at, leap, end: leap + (from.water ? 0.45 : 0.32 + dist * 0.18), arrive: this.leg.face, face }
  }

  update(t: number) {
    // Rattrape les sauts manqués (pont quitté puis retrouvé), sans boucler sans fin.
    for (let i = 0; i < 20 && t >= this.leg.end; i++) {
      const { to, end } = this.leg
      if (to !== this.leg.from) this.splash(to.x, to.z, end, to.water ? 0.9 : this.onPad(to) ? 0.45 : 0)
      this.plan(end)
    }
    const { from, to, start, leap, end, arrive, face } = this.leg
    const r = this.root
    if (t < leap) {
      // L'attente : assise (ou en train de nager vers son point de départ, dans l'eau).
      r.position.set(from.x, from.y, from.z)
      if (from.water) {
        const k = (t - start) / (leap - start)
        r.position.x += Math.sin(t * 0.8 + start) * 0.08 * k
        r.position.z += Math.cos(t * 0.6 + start) * 0.06 * k
        r.position.y = from.y + Math.sin(t * 2.2) * 0.003
      }
      r.rotation.y = arrive + turn(arrive, face) * ease(clamp01((t - leap + 0.9) / 0.6))
      r.scale.set(1, 1, 1)
      // Coasse : le sac gonfle deux fois, de temps en temps.
      const croak = from.water ? 0 : (t - start) % 5.3
      const puff = croak < 1.1 ? Math.max(0, Math.sin((croak / 1.1) * Math.PI * 2)) : 0
      this.sac.scale.setScalar(0.6 + puff * 1.5)
      this.sac.visible = !from.water
      return
    }
    // Le saut : une parabole ; la grenouille s'étire en vol.
    const k = clamp01((t - leap) / (end - leap))
    const dist = Math.hypot(to.x - from.x, to.z - from.z)
    r.position.set(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k + Math.sin(k * Math.PI) * (0.07 + dist * 0.12), from.z + (to.z - from.z) * k)
    r.rotation.y = face
    const stretch = Math.sin(k * Math.PI)
    r.scale.set(1 - stretch * 0.15, 1 - stretch * 0.2, 1 + stretch * 0.45)
    this.sac.visible = false
    if (k < 0.06 && from.water) r.position.y = Math.max(r.position.y, this.water - 0.02)
  }

  private onPad(p: Perch): boolean {
    return p.y < this.water + 0.05
  }
}

// ---------------------------------------------------------------- libellules

/** Libellule, face à +z : abdomen fin et coloré, gros yeux, deux paires d'ailes (gauche, droite). */
function dragonflyModel(color: string): { root: THREE.Group; left: THREE.Group; right: THREE.Group } {
  const g = new THREE.Group()
  const body = lit(color), dark = lit(new THREE.Color(color).multiplyScalar(0.55).getStyle())
  const tail = cylinder(0.0045, 0.0028, 0.085, body, 0, 0, -0.05, 5)
  tail.rotation.x = Math.PI / 2
  const thorax = sphere(0.0105, dark, 0, 0, 0.004, 6)
  thorax.scale.set(1, 1, 1.4)
  g.add(tail, thorax, sphere(0.0085, dark, 0, 0.001, 0.024, 6))
  for (const s of [-1, 1]) g.add(sphere(0.0072, lit('#2f6f8a'), s * 0.0065, 0.003, 0.028, 6))
  for (let i = 0; i < 4; i++) g.add(sphere(0.0034, dark, 0, 0.0035, -0.022 - i * 0.017, 4))
  const wingMat = keepShared(new THREE.MeshBasicMaterial({ color: '#e6f7ff', transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide }))
  const wing = new THREE.PlaneGeometry(0.07, 0.015).rotateX(-Math.PI / 2)
  const sides = [-1, 1].map((s) => {
    const side = new THREE.Group()
    side.position.set(0, 0.006, 0.006)
    for (const [z, a] of [[0.008, 0.18], [-0.008, -0.12]] as const) {
      const w = part(wing, wingMat, s * 0.036, 0, z)
      w.rotation.y = -s * a
      side.add(w)
    }
    return side
  })
  const root = new THREE.Group().add(compact(g), ...sides)
  return { root, left: sides[0], right: sides[1] }
}

interface Flight {
  from: THREE.Vector3
  to: THREE.Vector3
  start: number
  /** Fin du vol plané (sur place), début de la saccade ; fin de la saccade. */
  dart: number
  end: number
  dip: boolean
}

/**
 * Une libellule : elle se tient en vol stationnaire, puis file d'un coup ailleurs au-dessus de
 * l'étang ; de temps en temps, elle pique jusqu'à l'eau et y trempe la queue (une ride).
 */
class Dragonfly {
  readonly root: THREE.Group
  private readonly left: THREE.Group
  private readonly right: THREE.Group
  private readonly random: () => number
  private flight: Flight
  private heading = 0

  constructor(
    color: string,
    seed: number,
    private readonly shape: PondShape,
    private readonly water: number,
    private readonly splash: (x: number, z: number, t: number, s: number) => void,
  ) {
    const m = dragonflyModel(color)
    this.root = m.root
    this.left = m.left
    this.right = m.right
    this.root.scale.setScalar(1.35)
    this.random = rng(seed)
    const p = this.point()
    this.flight = { from: p, to: p.clone(), start: 0, dart: this.random() * 2, end: 0, dip: false }
    this.flight.end = this.flight.dart
  }

  private point(): THREE.Vector3 {
    const p = waterPoint(this.shape, this.random, 0.3)
    return new THREE.Vector3(p.x, 0.22 + this.random() * 0.26, p.z)
  }

  private plan(at: number) {
    // Après un piqué, elle est remontée à sa hauteur de départ.
    const prev = this.flight
    const from = prev.dip ? new THREE.Vector3(prev.to.x, prev.from.y, prev.to.z) : prev.to
    let to = this.point()
    // Une saccade reste courte : de 0,3 à 1,2 m.
    const d = Math.hypot(to.x - from.x, to.z - from.z)
    if (d > 1.2) to = new THREE.Vector3(from.x + ((to.x - from.x) * 1.2) / d, to.y, from.z + ((to.z - from.z) * 1.2) / d)
    const dip = this.random() < 0.2
    if (dip) to.y = this.water + 0.012
    const dart = at + 0.6 + this.random() * 2.2
    this.flight = { from, to, start: at, dart, end: dart + 0.35 + this.random() * 0.4, dip }
  }

  update(t: number) {
    for (let i = 0; i < 30 && t >= this.flight.end; i++) {
      const f = this.flight
      if (f.dip) this.splash(f.to.x, f.to.z, (f.dart + f.end) / 2, 0.3)
      this.plan(this.flight.end)
    }
    const { from, to, start, dart, end, dip } = this.flight
    const r = this.root
    if (t < dart) {
      // Vol stationnaire : elle flotte, oscille, se tourne un peu.
      const k = t - start
      r.position.set(from.x + Math.sin(k * 1.7 + start) * 0.012, from.y + Math.sin(k * 3.1 + start * 2) * 0.008, from.z + Math.cos(k * 1.3 + start) * 0.012)
      r.rotation.y = this.heading + Math.sin(k * 0.9 + start) * 0.25
      r.rotation.x = 0
    } else {
      const k = ease(clamp01((t - dart) / (end - dart)))
      r.position.lerpVectors(from, to, k)
      // Un piqué remonte aussitôt qu'il a touché l'eau.
      if (dip) r.position.y = from.y + (to.y - from.y) * Math.sin(k * Math.PI)
      this.heading = Math.atan2(to.x - from.x, to.z - from.z)
      r.rotation.y = this.heading
      r.rotation.x = dip ? 0.5 * Math.cos(k * Math.PI) : 0.15 * Math.sin(k * Math.PI)
    }
    // Les ailes battent très vite (un frémissement à l'écran), les deux paires en opposition.
    const flap = Math.sin(t * 95) * 0.45
    this.left.rotation.z = flap
    this.right.rotation.z = -flap
  }
}

// ---------------------------------------------------------------- gerris

/**
 * Gerris : un corps fin, deux courtes pattes avant, quatre longues pattes écartées en arrière, qui
 * glissent par à-coups (un dessin instancié, face à +z).
 */
function striders(shape: PondShape, water: number, seed: number, count: number, splash: (x: number, z: number, t: number, s: number) => void) {
  const parts: THREE.BufferGeometry[] = [new THREE.SphereGeometry(0.008, 6, 4).scale(0.55, 0.4, 1.8).translate(0, 0.006, 0)]
  // Chaque patte part du corps dans la direction φ (depuis +z), longue de `len`.
  for (const [phi, len] of [[0.45, 0.028], [1.85, 0.075], [2.55, 0.068]] as const) {
    for (const s of [-1, 1]) {
      const a = s * phi
      parts.push(new THREE.BoxGeometry(len, 0.0025, 0.0025).rotateY(a - Math.PI / 2).translate((Math.sin(a) * len) / 2, 0.003, (Math.cos(a) * len) / 2))
    }
  }
  const geo = mergeGeometries(parts)!
  for (const p of parts) p.dispose()
  const mesh = instanced(geo, Array(count).fill('#2b2620'), keepShared(new THREE.MeshLambertMaterial()))
  const random = rng(seed)
  const bugs = Array.from({ length: count }, () => {
    const p = waterPoint(shape, random, 0.4)
    return { from: p, to: p, start: 0, push: random() * 1.5, end: 0, face: random() * 6 }
  })
  for (const b of bugs) b.end = b.push
  const plan = (b: (typeof bugs)[number], at: number) => {
    const from = b.to
    let to = from
    for (let i = 0; i < 8; i++) {
      const a = random() * Math.PI * 2, d = 0.12 + random() * 0.3
      const c = { x: from.x + Math.cos(a) * d, z: from.z + Math.sin(a) * d }
      if (inWater(shape, c.x, c.z, 0.35)) {
        to = c
        break
      }
    }
    const push = at + 0.4 + random() * 1.4
    Object.assign(b, { from, to, start: at, push, end: push + 0.5, face: Math.atan2(to.x - from.x, to.z - from.z) })
  }
  return {
    mesh,
    update(t: number) {
      bugs.forEach((b, i) => {
        for (let n = 0; n < 30 && t >= b.end; n++) plan(b, b.end)
        const k = t < b.push ? 0 : 1 - (1 - clamp01((t - b.push) / (b.end - b.push))) ** 3
        setInstance(mesh, i, b.from.x + (b.to.x - b.from.x) * k, water + 0.002, b.from.z + (b.to.z - b.from.z) * k, 1, b.face)
      })
      mesh.instanceMatrix.needsUpdate = true
    },
    /** Les rides de leurs poussées, déclenchées à coup sûr (l'image peut sauter l'instant exact). */
    pushes(t0: number, t1: number) {
      for (const b of bugs) if (b.push > t0 && b.push <= t1) splash(b.from.x, b.from.z, b.push, 0.12)
    },
  }
}

// ---------------------------------------------------------------- l'étang

export interface PondLifeOptions {
  shape: PondShape
  /** Hauteur de l'eau. */
  water: number
  /** Nénuphars (centre) : les grenouilles s'y posent. */
  pads: { x: number; z: number }[]
  /** Pierres de la margelle où une grenouille peut s'asseoir (et sa hauteur). */
  stones: { x: number; z: number; y: number }[]
  random: () => number
}

/** Toute la vie de l'étang : la surface, les bêtes ; `update(t)` à chaque image, `ripple` pour les autres (carpes, cascade). */
export function pondLife(o: PondLifeOptions) {
  const { shape, water } = o
  const group = new THREE.Group()
  const surface = new PondWater(shape)
  const splash = (x: number, z: number, t: number, s: number) => {
    if (s > 0) surface.spawn(x, z, t, s)
  }
  // Grenouilles : sur les nénuphars et les pierres.
  const perches: Perch[] = [...o.pads.map((p) => ({ x: p.x, z: p.z, y: water + 0.02 })), ...o.stones]
  const busy = new Set<Perch>()
  const frogs = ([['#5aa83a', '#e2edb0'], ['#7cc24a', '#f1f2c8'], ['#3f8a4a', '#d8e6a8']] as const).map(
    ([skin, belly], i) => new Frog(skin, belly, Math.floor(o.random() * 1e9), perches, busy, shape, water, perches[(i * 3 + 1) % perches.length], splash),
  )
  for (const f of frogs) group.add(f.root)
  // Libellules : une bleue, une rouge, une verte.
  const flies = ['#2a9df4', '#e8442f', '#3fcf8e'].map((c) => new Dragonfly(c, Math.floor(o.random() * 1e9), shape, water, splash))
  for (const f of flies) group.add(f.root)
  // Gerris.
  const skaters = striders(shape, water, Math.floor(o.random() * 1e9), 5, splash)
  group.add(skaters.mesh)
  // Feuilles et pétales qui dérivent lentement en rond.
  const drift = instanced(new THREE.CircleGeometry(0.03, 7).rotateX(-Math.PI / 2).scale(1, 1, 0.6), ['#ffb7d5', '#ff8ac8', '#9ccc65', '#c5a35a', '#ffc2e0', '#7fb35a'], keepShared(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide })))
  const leaves = Array.from({ length: 6 }, () => ({ ...waterPoint(shape, o.random, 0.45), phase: o.random() * 6, r: 0.12 + o.random() * 0.25, speed: 0.04 + o.random() * 0.05 }))
  group.add(drift)
  let last = 0
  return {
    group,
    surface,
    ripple: (x: number, z: number, t: number, s: number) => surface.spawn(x, z, t, s),
    update(t: number) {
      surface.time = t
      for (const f of frogs) f.update(t)
      for (const f of flies) f.update(t)
      if (t > last) skaters.pushes(last, t)
      skaters.update(t)
      last = t
      leaves.forEach((l, i) => {
        const a = t * l.speed + l.phase
        setInstance(drift, i, l.x + Math.cos(a) * l.r, water + 0.003 + Math.sin(t * 1.3 + l.phase) * 0.002, l.z + Math.sin(a) * l.r * 0.7, 1, a * 0.6 + l.phase)
      })
      drift.instanceMatrix.needsUpdate = true
    },
  }
}
