import * as THREE from 'three'
import { $ } from './ui'
import { icon } from './icons'

/*
 * Téléportation d'un pont à l'autre : une colonne de lumière se forme autour du personnage, le
 * reste du pont s'assombrit, des étincelles montent le long de la colonne, puis un éclair : le
 * pont change en plein blanc, et l'on réapparaît sur le téléporteur du pont d'arrivée (qui n'est
 * pas au même endroit, cf. TELEPORTERS). La colonne se dissipe et la lumière revient.
 * Deux cylindres, un nuage de points et un voile CSS : rien à charger, presque rien à dessiner.
 */

const RADIUS = 0.44
const HEIGHT = 1.5
/** Temps forts du trajet (secondes). */
const OPEN = 0.22
const SWAP = 0.36
const CLOSE = 0.62
const END = 0.9
/** Étincelles qui montent dans la colonne. */
const MOTES = 70

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

const VERTEX = `
  varying vec2 vUv;
  varying float vRim;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vec3 v = projectionMatrix[3][3] == 1.0 ? vec3(0.0, 0.0, 1.0) : normalize(-mv.xyz);
    vRim = 1.0 - abs(dot(n, v));
    gl_Position = projectionMatrix * mv;
  }`

const FRAGMENT = `
  uniform vec3 uColor;
  uniform float uScroll;
  uniform float uLow;
  uniform float uHigh;
  uniform float uFlash;
  varying vec2 vUv;
  varying float vRim;
  void main() {
    float y = vUv.y;
    if (y < uLow || y > uHigh) discard;
    float edge = smoothstep(0.0, 0.1, y - uLow) * smoothstep(0.0, 0.1, uHigh - y);
    // Des rais de lumière verticaux, qui ondulent un peu : la colonne n'est pas un tube de verre.
    float lane = vUv.x * 18.0;
    float r = fract(sin(floor(lane) * 91.7) * 43758.5453);
    float shaft = pow(1.0 - abs(fract(lane) - 0.5) * 2.0, 6.0) * (0.35 + 0.65 * r) * (0.6 + 0.4 * sin(uScroll * 3.0 + r * 6.28));
    // Des étincelles qui montent, une par rai, chacune à son pas.
    float t = fract(y * 1.6 - uScroll * (0.5 + r));
    float spark = smoothstep(0.92, 1.0, t) * smoothstep(0.35, 0.0, abs(fract(lane) - 0.5)) * step(0.35, r);
    // Plus vive en bas, là où l'on se dématérialise, et vers les bords.
    float base = 1.0 - smoothstep(0.0, 0.85, y);
  #ifdef BACK
    // Paroi du fond, presque opaque : elle cache le pont derrière le personnage.
    float halo = (1.0 - vRim) * (0.5 + base * 0.5);
    vec3 col = vec3(0.02, 0.06, 0.12) + uColor * (0.15 + halo * 0.45 + shaft * 0.35 + spark * 0.6) + uFlash * 0.6;
    gl_FragColor = vec4(col, 0.9 * edge);
  #else
    // Paroi avant : une lumière qui s'additionne, discrète devant le personnage, vive sur les bords.
    float clear = mix(0.25, 1.0, vRim);
    vec3 col = uColor * (0.05 + vRim * vRim * 0.8 + base * 0.15 + (shaft * 0.4 + spark * 0.9) * clear) + uFlash * 0.5;
    gl_FragColor = vec4(col, edge);
  #endif
  }`

export class LiftRide {
  readonly group = new THREE.Group()
  private uniforms = {
    uColor: { value: new THREE.Color('#59d8ff') },
    uScroll: { value: 0 },
    uLow: { value: 0 },
    uHigh: { value: 0 },
    uFlash: { value: 0 },
  }
  private rings: THREE.Mesh[]
  private motes: THREE.Points
  private moteSeeds = Array.from({ length: MOTES }, () => ({ a: Math.random() * Math.PI * 2, r: 0.12 + Math.random() * 0.3, speed: 0.5 + Math.random() * 0.9, phase: Math.random() }))
  private veil = $('lift-ride')
  private label = this.veil.querySelector<HTMLElement>('.lift-ride-label')!
  private t = -1
  private swapped = false
  private arrive?: () => { x: number; y: number; z: number }
  private done?: () => void

  constructor() {
    const geo = new THREE.CylinderGeometry(RADIUS, RADIUS, HEIGHT, 48, 1, true)
    geo.translate(0, HEIGHT / 2, 0)
    const back = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, defines: { BACK: 1 },
      side: THREE.BackSide, transparent: true, depthWrite: false,
    }))
    const front = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT,
      side: THREE.FrontSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }))
    back.renderOrder = 1
    front.renderOrder = 2
    // Le pied et le haut de la colonne : un anneau vif.
    const ringGeo = new THREE.TorusGeometry(RADIUS, 0.018, 6, 48)
    ringGeo.rotateX(Math.PI / 2)
    this.rings = [0, 1].map(() => {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#bff3ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
      m.renderOrder = 3
      return m
    })
    // Les étincelles : de petits points qui montent en spirale autour du personnage.
    const motes = new THREE.BufferGeometry()
    motes.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOTES * 3), 3))
    this.motes = new THREE.Points(motes, new THREE.PointsMaterial({ color: '#dff8ff', size: 0.045, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
    this.motes.renderOrder = 4
    this.group.add(back, front, ...this.rings, this.motes)
    this.group.visible = false
  }

  get active(): boolean {
    return this.t >= 0
  }

  /**
   * Lance la téléportation depuis ce point du pont ; `arrive` change de pont en plein éclair et
   * rend le téléporteur d'arrivée. Résolue quand la colonne s'est dissipée.
   */
  run(x: number, y: number, z: number, up: boolean, deckName: string, arrive: () => { x: number; y: number; z: number }): Promise<void> {
    this.group.position.set(x, y, z)
    this.t = 0
    this.swapped = false
    this.arrive = arrive
    this.uniforms.uFlash.value = 0
    this.label.replaceChildren(icon('sparkle'), document.createTextNode(deckName))
    this.veil.classList.toggle('down', !up)
    this.veil.classList.add('on')
    this.group.visible = true
    return new Promise((r) => (this.done = r))
  }

  update(dt: number, camera: THREE.Camera) {
    if (this.t < 0) return
    this.t += dt
    const t = this.t
    const u = this.uniforms
    // La colonne se forme du sol vers le haut, puis se dissipe par le bas.
    const grow = easeOut(Math.min(1, t / OPEN))
    const fold = t > CLOSE ? easeIn(Math.min(1, (t - CLOSE) / (END - CLOSE))) : 0
    u.uLow.value = fold
    u.uHigh.value = grow
    // Les rais ondulent et les étincelles montent, vite au milieu.
    const speed = (reducedMotion.matches ? 0.5 : 2.6) * Math.sqrt(Math.sin(Math.PI * Math.min(1, t / END))) + 0.3
    u.uScroll.value += dt * speed
    u.uFlash.value = Math.max(0, u.uFlash.value - dt * 4)
    for (const [i, ring] of this.rings.entries()) {
      ring.position.y = (i === 0 ? u.uLow.value : u.uHigh.value) * HEIGHT
      const m = ring.material as THREE.MeshBasicMaterial
      m.opacity = u.uHigh.value - u.uLow.value > 0.02 ? 0.9 : 0
    }
    const pos = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute
    const visible = u.uHigh.value - u.uLow.value
    for (const [i, m] of this.moteSeeds.entries()) {
      const k = (m.phase + u.uScroll.value * m.speed * 0.5) % 1
      const a = m.a + k * 4
      pos.setXYZ(i, Math.cos(a) * m.r, (u.uLow.value + k * visible) * HEIGHT, Math.sin(a) * m.r)
    }
    pos.needsUpdate = true
    ;(this.motes.material as THREE.PointsMaterial).opacity = Math.min(1, visible * 2)

    if (!this.swapped && t >= SWAP) {
      this.swapped = true
      const p = this.arrive?.()
      if (p) this.group.position.set(p.x, p.y, p.z)
      if (!reducedMotion.matches) u.uFlash.value = 1
    }
    if (t >= CLOSE) this.veil.classList.remove('on')
    this.placeVeil(camera, innerWidth, innerHeight)
    if (t >= END) {
      this.t = -1
      this.group.visible = false
      this.done?.()
    }
  }

  /** Le voile laisse une ellipse claire autour du tube, là où il est à l'écran. */
  private placeVeil(camera: THREE.Camera, width: number, height: number) {
    camera.updateMatrixWorld()
    const p = this.group.position
    const center = project(_a.set(p.x, p.y + HEIGHT / 2, p.z), camera, width, height)
    const style = this.veil.style
    if (!center) {
      style.setProperty('--x', '50%')
      style.setProperty('--y', '50%')
      style.setProperty('--rx', `${width}px`)
      style.setProperty('--ry', `${height}px`)
      style.setProperty('--lt', `${height * 0.85}px`)
      return
    }
    const right = _b.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(RADIUS).add(_c.set(p.x, p.y + HEIGHT / 2, p.z))
    const side = project(right, camera, width, height)
    const top = project(_c.set(p.x, p.y + HEIGHT, p.z), camera, width, height)
    const bottom = project(_c.set(p.x, p.y, p.z), camera, width, height)
    const halfW = side ? Math.hypot(side.x - center.x, side.y - center.y) : width / 4
    const halfH = top && bottom ? Math.abs(bottom.y - top.y) / 2 + halfW * 0.4 : height / 4
    style.setProperty('--x', `${center.x}px`)
    style.setProperty('--y', `${center.y}px`)
    style.setProperty('--rx', `${Math.max(40, halfW * 2.4)}px`)
    style.setProperty('--ry', `${Math.max(60, halfH * 1.45)}px`)
    style.setProperty('--lt', `${Math.min(height - 40, (bottom?.y ?? center.y + halfH) + halfW * 0.5 + 14)}px`)
  }
}

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _c = new THREE.Vector3()
const _p = new THREE.Vector3()

/** Position à l'écran (px), ou null derrière la caméra. */
function project(v: THREE.Vector3, camera: THREE.Camera, width: number, height: number): { x: number; y: number } | null {
  _p.copy(v).project(camera)
  if (_p.z > 1 || _p.z < -1) return null
  return { x: (_p.x * 0.5 + 0.5) * width, y: (-_p.y * 0.5 + 0.5) * height }
}

const easeOut = (k: number) => 1 - (1 - k) ** 3
const easeIn = (k: number) => k ** 2
