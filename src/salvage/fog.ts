import * as THREE from 'three'
import { RULES, sightOrigin, zoneSight, type Zone } from '../../shared/salvage.js'

/**
 * Ce que le brouillard couvre : la baie infestée (cf. setZone), ou les conduits de ventilation
 * (cf. src/vents.ts). Une grille de tuiles, ce qu'on y voit d'un point, et ses tuiles éclairées.
 */
export interface FogField {
  width: number
  height: number
  /** Point d'où l'on regarde : au ras d'un meuble, pas depuis l'intérieur de sa tuile. */
  origin(p: { x: number; z: number }): { x: number; z: number }
  /** Rien ne sépare `from` de `to` ; `high` : vu d'en haut, par-dessus les obstacles bas. */
  sight(from: { x: number; z: number }, to: { x: number; z: number }, high?: boolean): boolean
  /** Tuile de sol ? */
  floor(x: number, z: number): boolean
  /** Tuile d'une zone éclairée ? */
  lit(x: number, z: number): boolean
  /** Portée du regard sur une zone éclairée. */
  litVision: number
}

/** La baie infestée, vue par le brouillard. */
const zoneField = (zone: Zone): FogField => {
  const inside = (x: number, z: number) => x >= 0 && z >= 0 && x < zone.width && z < zone.height
  return {
    width: zone.width,
    height: zone.height,
    origin: (p) => sightOrigin(zone, p),
    sight: (from, to, high) => zoneSight(zone, from, to, high),
    floor: (x, z) => inside(x, z) && zone.room[z * zone.width + x] !== ' ',
    lit: (x, z) => inside(x, z) && zone.lit[z * zone.width + x] === 1,
    litVision: RULES.litVision,
  }
}

/*
 * Brouillard de guerre de la baie infestée : on ne voit que ce qui est autour de soi, et en vue
 * (ni à travers un mur, ni derrière un conteneur) ; le reste est noir, quel que soit le zoom.
 *
 * 1. Une grille de visibilité couvre la baie (RES points par tuile) : chaque point à portée est
 *    visible si la ligne de vue y passe (cf. shared/salvage.js), avec un bord adouci ; une zone
 *    éclairée se voit de plus loin (RULES.litVision), toujours en ligne de vue. Les valeurs
 *    suivent en douceur (on voit apparaître le couloir en tournant le coin).
 * 2. La scène est rendue dans une cible avec sa profondeur ; une passe plein écran retrouve, pour
 *    chaque pixel, le point du monde qu'il montre, et l'assombrit selon la grille. Murs, sols,
 *    ennemis, colis, lueurs : tout y passe, sans toucher aux matériaux.
 * 3. Derrière les caméras (un capturé suit son équipe), la même passe devient un vieux moniteur
 *    de surveillance (`crt`) : écran bombé, lignes de balayage, couleurs qui bavent, grain,
 *    phosphore vert, bande qui défile, et des parasites quand on change de caméra (`static`).
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
  private field: FogField | null = null
  private readonly invViewProj = new THREE.Matrix4()
  /** Dernier point de vue (pour ne recalculer que ce qui a pu changer) : rayon, portée tracée, vue d'en haut. */
  private last = { x: Infinity, z: Infinity, r: 0, reach: 0, high: false as boolean | undefined }

  constructor(private renderer: THREE.WebGLRenderer) {
    this.target = this.makeTarget(1, 1, 4)
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        tVis: { value: this.vis },
        uInvViewProj: { value: this.invViewProj },
        uRect: { value: new THREE.Vector4(0, 0, 1, 1) },
        uCrt: { value: 0 },
        uStatic: { value: 0 },
        uTime: { value: 0 },
        uRes: { value: new THREE.Vector2(1, 1) },
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
        uniform float uCrt;
        uniform float uStatic;
        uniform float uTime;
        uniform vec2 uRes;
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          vec2 uv = vUv;
          if (uCrt > 0.5) {
            // Écran bombé : les bords se courbent, les coins s'arrondissent dans le noir.
            vec2 c = uv - 0.5;
            uv = 0.5 + c * (1.0 + 0.16 * dot(c, c));
            // Parasites : les lignes se décalent.
            uv.x += (hash(vec2(floor(uv.y * 90.0), floor(uTime * 30.0))) - 0.5) * 0.04 * uStatic;
            if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
              gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
              return;
            }
          }
          float depth = texture2D(tDepth, uv).x;
          vec4 color = texture2D(tColor, uv);
          float v = 0.0;
          if (depth < 0.9999) {
            vec4 world = uInvViewProj * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
            world /= world.w;
            vec2 p = (world.xz - uRect.xy) / uRect.zw;
            v = (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) ? 0.0 : texture2D(tVis, p).r;
          }
          vec3 rgb = color.rgb * v;
          if (uCrt > 0.5) {
            // Les couleurs bavent (rouge et bleu décalés), le phosphore verdit tout.
            vec2 shift = (uv - 0.5) * 0.006 + vec2(0.0015, 0.0);
            rgb.r = mix(rgb.r, texture2D(tColor, uv + shift).r * v, 0.7);
            rgb.b = mix(rgb.b, texture2D(tColor, uv - shift).b * v, 0.7);
            float lum = dot(rgb, vec3(0.299, 0.587, 0.114));
            rgb = mix(rgb, vec3(lum * 0.72, lum * 1.12, lum * 0.8), 0.55) * 1.35 + vec3(0.004, 0.012, 0.006);
            // Lignes de balayage, bande claire qui défile, papillotement, grain.
            float line = 0.78 + 0.22 * sin(uv.y * uRes.y * 1.4);
            float band = exp(-pow((fract(uv.y * 0.7 - uTime * 0.09) - 0.5) * 14.0, 2.0)) * 0.08;
            float grain = hash(uv * uRes + fract(uTime * 7.0) * 100.0);
            rgb = rgb * line * (0.97 + 0.03 * sin(uTime * 55.0)) + band + (grain - 0.5) * 0.05;
            rgb = mix(rgb, vec3(grain * 0.35), clamp(uStatic, 0.0, 1.0) * 0.85);
            // Vignette de tube cathodique.
            float vig = pow(max(0.0, 16.0 * uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y)), 0.28);
            rgb *= vig;
          }
          gl_FragColor = vec4(max(rgb, vec3(0.0)), 1.0);
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
    this.setField(zone && zoneField(zone))
  }

  /** Ce que le brouillard couvre (null : plus de brouillard). */
  setField(field: FogField | null) {
    this.field = field
    this.last.x = Infinity
    if (!field) return
    this.width = (field.width + MARGIN * 2) * RES
    this.height = (field.height + MARGIN * 2) * RES
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

  /** Point d'une zone éclairée (ou la paroi qui la borde) ? */
  private litAt(px: number, pz: number): boolean {
    const field = this.field!
    const x = Math.round(px), z = Math.round(pz)
    if (field.lit(x, z)) return true
    return !field.floor(x, z) && (field.lit(x + 1, z) || field.lit(x - 1, z) || field.lit(x, z + 1) || field.lit(x, z - 1))
  }

  /**
   * Recalcule ce que voit `viewer` (rayon en tuiles), puis fait suivre les valeurs affichées.
   * `instant` : sans fondu (arrivée dans la baie, changement de caméra) ; `high` : vue d'une
   * caméra montée haut, par-dessus les conteneurs (sinon, selon la hauteur du point de vue).
   */
  update(viewer: { x: number; z: number }, radius: number, dt: number, instant = false, high?: boolean) {
    const field = this.field
    if (!field) return
    // Au ras d'un meuble, on ne regarde pas depuis l'intérieur de sa tuile.
    viewer = field.origin(viewer)
    const moved = Math.hypot(viewer.x - this.last.x, viewer.z - this.last.z) > 0.03 || radius !== this.last.r || high !== this.last.high
    if (moved) {
      const old = this.last
      // Efface l'ancien disque, puis trace le nouveau (le reste de la grille est déjà à zéro).
      this.fill(old.x, old.z, old.reach, () => 0)
      const far = Math.max(radius, field.litVision)
      this.last = { x: viewer.x, z: viewer.z, r: radius, reach: far, high }
      const edge = Math.min(1, radius * 0.35)
      this.fill(viewer.x, viewer.z, far, (px, pz, d) => {
        const near = d <= radius
        const lit = d <= far && this.litAt(px, pz)
        if (!near && !lit) return 0
        if (!field.sight(viewer, { x: px, z: pz }, high)) return 0
        const t = THREE.MathUtils.clamp((radius - d) / edge, 0, 1)
        const k = lit ? THREE.MathUtils.clamp((far - d) / 1.2, 0, 1) : 0
        return Math.max(t * t * (3 - 2 * t), k * k * (3 - 2 * k))
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

  /** Moniteur de surveillance : effet cathodique (caméras des capturés). */
  crt = false
  /** Parasites (0 à 1) : ils retombent d'eux-mêmes (changement de caméra, signal qui revient). */
  noise = 0
  private clock = 0

  /** Rend la scène à travers le brouillard. */
  render(scene: THREE.Scene, camera: THREE.Camera, dt = 0) {
    this.clock += dt
    this.noise = Math.max(0, this.noise - dt * 1.6)
    const u = this.material.uniforms
    u.uCrt.value = this.crt ? 1 : 0
    u.uStatic.value = this.crt ? this.noise : 0
    u.uTime.value = this.clock
    u.uRes.value.set(this.target.width, this.target.height)
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
