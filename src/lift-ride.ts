import * as THREE from 'three'
import { $ } from './ui'
import { icon } from './icons'

/*
 * Trajet d'ascenseur : un tube de verre lumineux sort du sol autour du personnage, le reste du
 * pont s'assombrit, des anneaux défilent le long du tube (vers le bas quand on monte), et le
 * pont change pendant que tout est noir. Puis le tube se replie et la lumière revient.
 * Deux cylindres et un voile CSS : rien à charger, presque rien à dessiner.
 */

const RADIUS = 0.44
const HEIGHT = 1.5
/** Temps forts du trajet (secondes). */
const OPEN = 0.22
const SWAP = 0.32
const CLOSE = 0.6
const END = 0.88

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
    float edge = smoothstep(0.0, 0.07, y - uLow) * smoothstep(0.0, 0.07, uHigh - y);
    // Anneaux qui défilent.
    float s = fract(y * 4.0 + uScroll);
    float band = pow(max(0.0, 1.0 - abs(s - 0.5) * 2.0), 16.0);
    // Traînées de vitesse, sur une partie des génératrices.
    float lane = floor(vUv.x * 40.0);
    float r = fract(sin(lane * 91.7) * 43758.5453);
    float t = fract(y * 1.3 + uScroll * (0.7 + r) + r);
    float streak = smoothstep(0.8, 1.0, t) * step(0.5, r) * pow(1.0 - abs(fract(vUv.x * 40.0) - 0.5) * 2.0, 3.0);
  #ifdef BACK
    // Paroi du fond, opaque ou presque : elle cache le pont derrière le personnage.
    // Plus clair derrière le personnage (en bas, au milieu) : sa silhouette se détache.
    float halo = (1.0 - vRim) * (1.0 - smoothstep(0.0, 0.7, y));
    vec3 col = vec3(0.03, 0.07, 0.13) + uColor * (0.1 + halo * 0.4 + band * 0.3 + streak * 0.3 + vRim * 0.2) + uFlash * 0.4;
    gl_FragColor = vec4(col, 0.92 * edge);
  #else
    // Paroi avant : du verre, lumineux sur les bords, presque invisible devant le personnage.
    float clear = mix(0.3, 1.0, vRim);
    vec3 col = uColor * (0.03 + vRim * vRim * 0.9 + (band * 0.5 + streak * 0.5) * clear) + uFlash * 0.35;
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
  private veil = $('lift-ride')
  private label = this.veil.querySelector<HTMLElement>('.lift-ride-label')!
  private t = -1
  private dir = 1
  private swapped = false
  private arrive?: () => number
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
    // Bords du tube : un anneau vif là où il sort du sol (ou du plafond).
    const ringGeo = new THREE.TorusGeometry(RADIUS, 0.018, 6, 48)
    ringGeo.rotateX(Math.PI / 2)
    this.rings = [0, 1].map(() => {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#bff3ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
      m.renderOrder = 3
      return m
    })
    this.group.add(back, front, ...this.rings)
    this.group.visible = false
  }

  get active(): boolean {
    return this.t >= 0
  }

  /**
   * Lance le trajet depuis ce point du pont ; `arrive` change de pont en plein noir et rend
   * l'altitude du nouveau pont. Résolue quand le tube s'est replié.
   */
  run(x: number, y: number, z: number, up: boolean, deckName: string, arrive: () => number): Promise<void> {
    this.group.position.set(x, y, z)
    this.dir = up ? 1 : -1
    this.t = 0
    this.swapped = false
    this.arrive = arrive
    this.uniforms.uFlash.value = 0
    this.label.replaceChildren(icon(up ? 'arrow-up' : 'arrow-down'), document.createTextNode(deckName))
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
    // Tube : il sort du sol en montant, descend du plafond en descendant ; il se replie dans le sens du trajet.
    const grow = easeOut(Math.min(1, t / OPEN))
    const fold = t > CLOSE ? easeIn(Math.min(1, (t - CLOSE) / (END - CLOSE))) : 0
    if (this.dir > 0) {
      u.uLow.value = fold
      u.uHigh.value = grow
    } else {
      u.uLow.value = 1 - grow
      u.uHigh.value = 1 - fold
    }
    // Défilement : les anneaux filent en sens inverse du trajet, vite au milieu.
    const speed = (reducedMotion.matches ? 0.6 : 3.2) * Math.sqrt(Math.sin(Math.PI * Math.min(1, t / END))) + 0.3
    u.uScroll.value += dt * speed * this.dir
    u.uFlash.value = Math.max(0, u.uFlash.value - dt * 5)
    for (const [i, ring] of this.rings.entries()) {
      ring.position.y = (i === 0 ? u.uLow.value : u.uHigh.value) * HEIGHT
      const m = ring.material as THREE.MeshBasicMaterial
      m.opacity = u.uHigh.value - u.uLow.value > 0.02 ? 0.9 : 0
    }

    if (!this.swapped && t >= SWAP) {
      this.swapped = true
      this.group.position.y = this.arrive?.() ?? this.group.position.y
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
