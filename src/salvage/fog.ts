import * as THREE from 'three'
import { zoneSight, type Zone } from '../../shared/salvage.js'

/*
 * Brouillard de guerre de la baie infestée : on ne voit que ce qui est autour de soi, et en vue
 * (ni à travers un mur, ni derrière un conteneur) ; le reste est noir, quel que soit le zoom.
 *
 * 1. Une grille de visibilité couvre la baie (RES points par tuile) : chaque point à portée est
 *    visible si la ligne de vue y passe (cf. shared/salvage.js), avec un bord adouci. Les valeurs
 *    suivent en douceur (on voit apparaître le couloir en tournant le coin).
 * 2. La scène est rendue dans une cible avec sa profondeur ; une passe plein écran retrouve, pour
 *    chaque pixel, le point du monde qu'il montre, et l'assombrit selon la grille. Murs, sols,
 *    ennemis, colis, lueurs : tout y passe, sans toucher aux matériaux.
 */

/** Points de la grille par tuile. */
const RES = 4
/** Marge autour de la baie (tuiles) : les murs extérieurs ont leur face au-delà. */
const MARGIN = 1
/** Vitesse d'apparition et de disparition (par seconde). */
const REVEAL = 7
const HIDE = 4

export class FogOfWar {
  private target: THREE.WebGLRenderTarget
  private readonly quad: THREE.Mesh
  private readonly quadScene = new THREE.Scene()
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly material: THREE.ShaderMaterial
  private vis = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RedFormat)
  private values = new Float32Array(1)
  private goal = new Float32Array(1)
  private width = 1
  private height = 1
  private zone: Zone | null = null
  private readonly invViewProj = new THREE.Matrix4()
  /** Dernier point de vue (pour ne recalculer que ce qui a pu changer). */
  private last = { x: Infinity, z: Infinity, r: 0 }

  constructor(private renderer: THREE.WebGLRenderer) {
    this.target = this.makeTarget(1, 1, 4)
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        tVis: { value: this.vis },
        uInvViewProj: { value: this.invViewProj },
        uRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D tColor;
        uniform sampler2D tDepth;
        uniform sampler2D tVis;
        uniform mat4 uInvViewProj;
        uniform vec4 uRect;
        varying vec2 vUv;
        void main() {
          float depth = texture2D(tDepth, vUv).x;
          vec4 color = texture2D(tColor, vUv);
          if (depth >= 0.9999) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
            return;
          }
          vec4 world = uInvViewProj * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
          world /= world.w;
          vec2 p = (world.xz - uRect.xy) / uRect.zw;
          float v = (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) ? 0.0 : texture2D(tVis, p).r;
          gl_FragColor = vec4(color.rgb * v, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      depthTest: false,
      depthWrite: false,
    })
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
    this.quad.frustumCulled = false
    this.quadScene.add(this.quad)
  }

  private makeTarget(w: number, h: number, samples: number): THREE.WebGLRenderTarget {
    const t = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples })
    t.depthTexture = new THREE.DepthTexture(w, h)
    return t
  }

  /** Taille du rendu (pixels réels) ; `light` : sans anticrénelage (mode léger). */
  resize(light = false) {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2())
    const samples = light ? 0 : 4
    if (this.target.width === size.x && this.target.height === size.y && this.target.samples === samples) return
    this.target.dispose()
    this.target.depthTexture?.dispose()
    this.target = this.makeTarget(size.x, size.y, samples)
  }

  /** La baie à couvrir (null : plus de brouillard). */
  setZone(zone: Zone | null) {
    this.zone = zone
    this.last.x = Infinity
    if (!zone) return
    this.width = (zone.width + MARGIN * 2) * RES
    this.height = (zone.height + MARGIN * 2) * RES
    this.values = new Float32Array(this.width * this.height)
    this.goal = new Float32Array(this.width * this.height)
    const data = new Uint8Array(this.width * this.height)
    this.vis.dispose()
    this.vis = new THREE.DataTexture(data, this.width, this.height, THREE.RedFormat, THREE.UnsignedByteType)
    this.vis.magFilter = THREE.LinearFilter
    this.vis.minFilter = THREE.LinearFilter
    this.vis.needsUpdate = true
    this.material.uniforms.tVis.value = this.vis
    // Un point de la grille (i, j) est au centre de sa case : x = -MARGIN - 0.5 + (i + 0.5) / RES.
    const x0 = -MARGIN - 0.5, z0 = -MARGIN - 0.5
    this.material.uniforms.uRect.value.set(x0, z0, this.width / RES, this.height / RES)
  }

  /** Visibilité (0 à 1) d'un point de la baie, telle qu'on la voit à l'écran. */
  visibleAt(x: number, z: number): number {
    const i = Math.floor((x + MARGIN + 0.5) * RES), j = Math.floor((z + MARGIN + 0.5) * RES)
    if (i < 0 || j < 0 || i >= this.width || j >= this.height) return 0
    return this.values[j * this.width + i]
  }

  /**
   * Recalcule ce que voit `viewer` (rayon en tuiles), puis fait suivre les valeurs affichées.
   * `instant` : sans fondu (arrivée dans la baie, changement de caméra).
   */
  update(viewer: { x: number; z: number }, radius: number, dt: number, instant = false) {
    const zone = this.zone
    if (!zone) return
    const moved = Math.hypot(viewer.x - this.last.x, viewer.z - this.last.z) > 0.03 || radius !== this.last.r
    if (moved) {
      const old = this.last
      // Efface l'ancien disque, puis trace le nouveau (le reste de la grille est déjà à zéro).
      this.fill(old.x, old.z, old.r, () => 0)
      this.last = { x: viewer.x, z: viewer.z, r: radius }
      const edge = Math.min(1, radius * 0.35)
      this.fill(viewer.x, viewer.z, radius, (px, pz, d) => {
        if (d > radius) return 0
        if (!zoneSight(zone, viewer, { x: px, z: pz })) return 0
        const t = THREE.MathUtils.clamp((radius - d) / edge, 0, 1)
        return t * t * (3 - 2 * t)
      })
    }
    const data = this.vis.image.data as Uint8Array
    let dirty = false
    const up = instant ? 1 : 1 - Math.exp(-REVEAL * dt), down = instant ? 1 : 1 - Math.exp(-HIDE * dt)
    for (let k = 0; k < this.values.length; k++) {
      const v = this.values[k], g = this.goal[k]
      if (v === g) continue
      let next = v + (g - v) * (g > v ? up : down)
      if (Math.abs(next - g) < 0.01) next = g
      this.values[k] = next
      const byte = Math.round(next * 255)
      if (data[k] !== byte) {
        data[k] = byte
        dirty = true
      }
    }
    if (dirty) this.vis.needsUpdate = true
  }

  /** Visite les points de la grille dans un disque, et y pose la visibilité visée. */
  private fill(cx: number, cz: number, r: number, value: (x: number, z: number, d: number) => number) {
    if (!Number.isFinite(cx)) return
    const reach = r + 0.5
    const i0 = Math.max(0, Math.floor((cx - reach + MARGIN + 0.5) * RES)), i1 = Math.min(this.width - 1, Math.ceil((cx + reach + MARGIN + 0.5) * RES))
    const j0 = Math.max(0, Math.floor((cz - reach + MARGIN + 0.5) * RES)), j1 = Math.min(this.height - 1, Math.ceil((cz + reach + MARGIN + 0.5) * RES))
    for (let j = j0; j <= j1; j++) {
      const pz = -MARGIN - 0.5 + (j + 0.5) / RES
      for (let i = i0; i <= i1; i++) {
        const px = -MARGIN - 0.5 + (i + 0.5) / RES
        const d = Math.hypot(px - cx, pz - cz)
        this.goal[j * this.width + i] = d > reach ? 0 : value(px, pz, d)
      }
    }
  }

  /** Rend la scène à travers le brouillard. */
  render(scene: THREE.Scene, camera: THREE.Camera) {
    const r = this.renderer
    r.setRenderTarget(this.target)
    r.clear()
    r.render(scene, camera)
    r.setRenderTarget(null)
    // Repère du monde : inverse de la projection et de la vue, et une origine au pont (y compris).
    this.invViewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).invert()
    this.material.uniforms.tColor.value = this.target.texture
    this.material.uniforms.tDepth.value = this.target.depthTexture
    r.render(this.quadScene, this.quadCamera)
  }

  dispose() {
    this.target.dispose()
    this.target.depthTexture?.dispose()
    this.vis.dispose()
    this.material.dispose()
  }
}
