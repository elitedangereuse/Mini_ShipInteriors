import * as THREE from 'three'
import { cobraGeometry } from './furniture/cobra'
import { renderQuality } from './quality'

/*
 * Bouclier de confinement d'un hangar ouvert sur l'espace (cf. `shield` dans levels.ts), à la
 * façon des hangars des grands croiseurs : à la place du mur extérieur, un champ de force bleu,
 * tendu entre deux pylônes et un seuil lumineux. Les vaisseaux le traversent, pas l'air (ni les
 * commandants : le mur garde sa collision). Derrière, des étoiles, et de temps en temps un
 * vaisseau qui passe.
 *
 * Vu de l'extérieur (la caméra de l'autre côté du champ), il s'efface à moitié pour laisser voir
 * le hangar ; en vue subjective, il monte jusqu'au plafond.
 */

/** Pan de mur remplacé par le champ : milieu de l'arête, et son orientation. */
export interface ShieldPane {
  x: number
  z: number
  alongX: boolean
}

/** Ce qui accompagne le champ (tout, par défaut) : pylônes aux deux bouts, étoiles derrière, trafic au loin. */
export interface ShieldOptions {
  pylons?: boolean
  stars?: boolean
  traffic?: boolean
}

/** Hauteur du champ en vue isométrique (les murs y font 1) ; en vue subjective, celle du plafond. */
const ISO_HEIGHT = 1.25

const LAMP_ON = new THREE.Color('#e8f8ff')
const LAMP_OFF = new THREE.Color('#2f9dff')

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`

/**
 * Champ de force : une trame d'hexagones à peine visible, des vagues qui la parcourent, des
 * bandes de balayage qui montent, et un liseré vif en bas et en haut.
 */
const FRAGMENT = /* glsl */ `
  uniform float uTime, uOpacity;
  uniform vec2 uSize;
  uniform vec3 uColor;
  varying vec2 vUv;

  // Distance au bord de la cellule hexagonale la plus proche.
  float hexEdge(vec2 p) {
    const vec2 s = vec2(1.0, 1.7320508);
    vec2 a = mod(p, s) - s * 0.5;
    vec2 b = mod(p - s * 0.5, s) - s * 0.5;
    vec2 h = dot(a, a) < dot(b, b) ? a : b;
    h = abs(h);
    return 0.5 - max(dot(h, s * 0.5), h.x);
  }

  void main() {
    vec2 p = vUv * uSize;
    float edge = hexEdge(p * 5.0);
    float grid = smoothstep(0.06, 0.0, edge);
    // Vagues qui parcourent le champ, et bandes de balayage qui montent.
    float wave = 0.5 + 0.5 * sin(p.x * 3.0 - uTime * 1.6 + sin(p.y * 2.0 + uTime) * 1.5);
    float scan = pow(0.5 + 0.5 * sin(p.y * 9.0 - uTime * 3.0), 12.0);
    // Les hexagones s'allument par endroits, lentement.
    vec2 cell = floor(p * 5.0);
    float spark = pow(0.5 + 0.5 * sin(uTime * 1.3 + cell.x * 12.9898 + cell.y * 78.233), 18.0);
    float rim = smoothstep(0.12, 0.0, vUv.y) + smoothstep(0.9, 1.0, vUv.y) * 0.7;
    float a = 0.1 + grid * (0.18 + 0.2 * wave) + scan * 0.12 + spark * grid * 0.5 + rim * 0.55;
    vec3 col = mix(uColor, vec3(0.85, 0.97, 1.0), grid * 0.35 + rim * 0.5 + spark * 0.4);
    gl_FragColor = vec4(col, a * uOpacity);
  }`

/** Nuage d'étoiles derrière le champ, jusqu'à `depth` : on le voit par le bouclier, surtout en vue subjective. */
function starBox(x0: number, z0: number, z1: number, depth: number, dir: 1 | -1, alongX: boolean): THREE.Points {
  const n = renderQuality.light ? 350 : 900
  const pos = new Float32Array(n * 3)
  const col = new Float32Array(n * 3)
  const c = new THREE.Color()
  for (let i = 0; i < n; i++) {
    const out = x0 + dir * (4 + Math.random() * depth)
    const along = z0 - depth * 0.6 + Math.random() * (z1 - z0 + depth * 1.2)
    const y = -depth * 0.35 + Math.random() * depth * 0.7
    if (alongX) pos.set([along, y, out], i * 3)
    else pos.set([out, y, along], i * 3)
    c.setHSL(0.58 + Math.random() * 0.1, 0.4, 0.7 + Math.random() * 0.3)
    col.set([c.r, c.g, c.b], i * 3)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  const points = new THREE.Points(g, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true }))
  points.frustumCulled = false
  return points
}

export class ForceShield {
  readonly group = new THREE.Group()
  private readonly field: THREE.Mesh
  private readonly material: THREE.ShaderMaterial
  private readonly lamps: THREE.MeshBasicMaterial[] = []
  /** Direction du champ vers l'espace (horizontale). */
  private readonly outward: THREE.Vector3
  private readonly length: number
  /** Vaisseau qui passe au loin, de temps en temps. */
  private readonly traffic: THREE.Group
  private trafficAt = 6 + Math.random() * 10
  /** Sa trajectoire : le long du champ, de `a0` à `a1`, à distance du vaisseau. */
  private readonly trafficLine: { line: number; a0: number; a1: number; alongX: boolean; outward: 1 | -1 }
  private trafficRun: { from: number; to: number; off: number; y: number; t: number; duration: number } | null = null
  private time = 0
  private opacity = 1

  /**
   * @param panes pans du champ, alignés (un côté d'une pièce)
   * @param outward côté de l'espace (1 : +x ou +z, -1 : -x ou -z)
   */
  constructor(panes: ShieldPane[], outward: 1 | -1, options: ShieldOptions = {}) {
    const { pylons = true, stars = true, traffic = true } = options
    const alongX = panes[0].alongX
    const along = panes.map((p) => (alongX ? p.x : p.z))
    const a0 = Math.min(...along) - 0.5, a1 = Math.max(...along) + 0.5
    const line = alongX ? panes[0].z : panes[0].x
    this.length = a1 - a0
    const mid = (a0 + a1) / 2
    this.outward = alongX ? new THREE.Vector3(0, 0, outward) : new THREE.Vector3(outward, 0, 0)
    const rotY = alongX ? 0 : Math.PI / 2
    const at = (a: number, y: number, off = 0) => (alongX ? new THREE.Vector3(a, y, line + off * outward) : new THREE.Vector3(line + off * outward, y, a))

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 1 },
        uSize: { value: new THREE.Vector2(this.length, 1) },
        uColor: { value: new THREE.Color('#2f9dff') },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    // Plan d'une unité de haut, posé au sol : on règle sa hauteur (iso ou subjective) à l'échelle.
    this.field = new THREE.Mesh(new THREE.PlaneGeometry(this.length, 1).translate(0, 0.5, 0), this.material)
    this.field.position.copy(at(mid, 0))
    this.field.rotation.y = rotY
    this.field.renderOrder = 3
    this.group.add(this.field)

    // Seuil : une poutre sombre, un bandeau lumineux, et des plots qui clignotent en cadence.
    const dark = new THREE.MeshLambertMaterial({ color: '#2a2e36' })
    const sill = new THREE.Mesh(new THREE.BoxGeometry(alongX ? this.length : 0.34, 0.08, alongX ? 0.34 : this.length), dark)
    sill.position.copy(at(mid, 0.04))
    sill.receiveShadow = true
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(alongX ? this.length : 0.06, 0.02, alongX ? 0.06 : this.length),
      new THREE.MeshBasicMaterial({ color: '#8fe3ff' }),
    )
    strip.position.copy(at(mid, 0.085, -0.1))
    this.group.add(sill, strip)
    for (let a = a0 + 0.5; a < a1; a += 1) {
      const m = new THREE.MeshBasicMaterial({ color: '#40b4ff' })
      this.lamps.push(m)
      const stud = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.1), m)
      stud.position.copy(at(a, 0.09, 0.08))
      this.group.add(stud)
    }
    // Pylônes émetteurs aux deux bouts : une colonne, trois bagues bleues.
    if (pylons) for (const a of [a0 + 0.12, a1 - 0.12]) this.group.add(shieldPylon(at(a, 0)))

    if (stars) this.group.add(starBox(line, a0, a1, 60, outward, alongX))

    // Un vaisseau au loin (une Cobra, feux allumés), qui file le long du vaisseau.
    this.traffic = new THREE.Group()
    const hull = new THREE.Mesh(cobraGeometry(), new THREE.MeshLambertMaterial({ color: '#8a93a3', flatShading: true }))
    hull.scale.setScalar(0.6)
    const glowMat = new THREE.MeshBasicMaterial({ color: '#8fd0ff' })
    const engine = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.05), glowMat)
    engine.position.set(0, 0.02, -0.28)
    this.traffic.add(hull, engine)
    this.traffic.visible = false
    if (traffic) this.group.add(this.traffic)
    this.trafficLine = { line, a0: a0 - 30, a1: a1 + 30, alongX, outward }
  }

  /**
   * @param toCamera direction horizontale du joueur vers la caméra (le champ s'efface à moitié si la
   *   caméra est dehors)
   * @param ceiling hauteur du plafond si on le voit (vue subjective), sinon null
   */
  update(dt: number, toCamera: THREE.Vector3, ceiling: number | null) {
    this.time += dt
    this.material.uniforms.uTime.value = this.time
    const outside = toCamera.dot(this.outward) > 0.2 && ceiling === null
    this.opacity = THREE.MathUtils.damp(this.opacity, outside ? 0.35 : 1, 4, dt)
    this.material.uniforms.uOpacity.value = this.opacity
    const h = ceiling ?? ISO_HEIGHT
    this.field.scale.y = h
    this.material.uniforms.uSize.value.y = h
    // Les plots s'allument l'un après l'autre, de gauche à droite.
    const n = this.lamps.length
    this.lamps.forEach((m, i) => m.color.copy(Math.floor(this.time * 4) % n === i ? LAMP_ON : LAMP_OFF))

    // Le trafic : un passage de temps en temps, à quelques unités du champ.
    const tl = this.trafficLine
    if (!this.trafficRun) {
      this.trafficAt -= dt
      if (this.trafficAt <= 0 && this.traffic.parent) {
        const forward = Math.random() < 0.5
        this.trafficRun = { from: forward ? tl.a0 : tl.a1, to: forward ? tl.a1 : tl.a0, off: 7 + Math.random() * 8, y: -1 + Math.random() * 3, t: 0, duration: 7 + Math.random() * 4 }
        this.traffic.visible = true
      }
    }
    const run = this.trafficRun
    if (run) {
      run.t += dt
      const k = run.t / run.duration
      const a = run.from + (run.to - run.from) * k
      const out = tl.line + tl.outward * run.off
      if (tl.alongX) this.traffic.position.set(a, run.y, out)
      else this.traffic.position.set(out, run.y, a)
      // Le nez de la Cobra (+z) vers où elle file.
      const dirSign = Math.sign(run.to - run.from)
      this.traffic.rotation.y = tl.alongX ? (dirSign > 0 ? Math.PI / 2 : -Math.PI / 2) : dirSign > 0 ? 0 : Math.PI
      if (k >= 1) {
        this.trafficRun = null
        this.traffic.visible = false
        this.trafficAt = 20 + Math.random() * 25
      }
    }
  }

  /** Retire le champ (une parcelle qui change de taille) : ses géométries et ses matériaux. */
  dispose() {
    this.group.removeFromParent()
    this.group.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.geometry) return
      m.geometry.dispose()
      for (const mat of [m.material].flat()) (mat as THREE.Material).dispose()
    })
  }
}

/** Pylône émetteur, posé au sol en `at` : une colonne sombre, trois bagues bleues. */
export function shieldPylon(at: THREE.Vector3): THREE.Group {
  const g = new THREE.Group()
  g.position.copy(at)
  const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.7, 0.22), new THREE.MeshLambertMaterial({ color: '#2a2e36' }))
  pylon.position.y = 0.85
  pylon.castShadow = true
  g.add(pylon)
  for (const y of [0.35, 0.8, 1.25]) {
    const ring = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.05, 0.25), new THREE.MeshBasicMaterial({ color: '#6fd0ff' }))
    ring.position.y = y
    g.add(ring)
  }
  return g
}
