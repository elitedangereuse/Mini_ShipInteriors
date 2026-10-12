import * as THREE from 'three'

/*
 * La bulle de protection : qui revient en jeu est protégé un instant (ARENA_RULES.shield, tant qu'il
 * ne tire pas), et on le voit. Une sphère de lumière autour de lui, à sa couleur pour le joueur,
 * transparente au milieu et vive sur ses bords (un effet de Fresnel), parcourue de lignes qui montent ;
 * elle bat doucement, et crève quand la protection tombe. En effets réduits, elle ne se montre pas :
 * l'anneau qui bat et la plaque qui brille disent la même chose.
 */

const GEOMETRY = new THREE.SphereGeometry(0.36, 28, 18)

const VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
varying float vHeight;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(-mv.xyz);
  vHeight = position.y;
  gl_Position = projectionMatrix * mv;
}
`

const FRAGMENT = /* glsl */ `
uniform vec3 color;
uniform float opacity;
uniform float time;
varying vec3 vNormal;
varying vec3 vView;
varying float vHeight;
void main() {
  float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.2);
  float lines = smoothstep(0.82, 1.0, sin(vHeight * 70.0 - time * 5.0) * 0.5 + 0.5) * 0.35;
  float a = min(1.0, 0.06 + rim * 0.8 + lines * (0.3 + rim)) * opacity;
  gl_FragColor = vec4(mix(color, vec3(1.0), lines * 0.6 + pow(rim, 3.0) * 0.25), a);
}
`

export class ShieldBubble {
  readonly mesh: THREE.Mesh
  private readonly material: THREE.ShaderMaterial
  /** Comment elle se montre (0 à 1), et depuis quand elle crève (s ; -1 : elle tient). */
  private shown = 0
  private popping = -1
  private time = Math.random() * 10

  constructor(color: string) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: 0 }, time: { value: 0 } },
      transparent: true,
      depthWrite: false,
      // Pas de mélange additif : sur le sable clair, il blanchirait le rouge comme le bleu.
      side: THREE.DoubleSide,
    })
    this.mesh = new THREE.Mesh(GEOMETRY, this.material)
    this.mesh.scale.set(0.95, 1.15, 0.95)
    this.mesh.renderOrder = 6
    this.mesh.visible = false
    this.mesh.frustumCulled = false
  }

  /**
   * @param at ses pieds (repère de l'arène)
   * @param on il est protégé, et on le voit
   * @returns true l'image où elle crève (la protection vient de tomber)
   */
  update(dt: number, at: THREE.Vector3 | null, on: boolean): boolean {
    this.time += dt
    let popped = false
    if (!on && this.shown > 0.5 && this.popping < 0) {
      this.popping = 0
      popped = true
    }
    if (on) this.popping = -1
    if (this.popping >= 0) {
      // Elle crève : elle s'élargit d'un coup et s'efface.
      this.popping += dt
      const k = Math.min(1, this.popping / 0.22)
      this.shown = 0
      this.mesh.visible = !!at && k < 1
      if (at) this.mesh.position.set(at.x, at.y + 0.34, at.z)
      this.mesh.scale.set(0.95, 1.15, 0.95).multiplyScalar(1 + k * 0.45)
      this.material.uniforms.opacity.value = 1 - k
      return popped
    }
    this.shown = THREE.MathUtils.damp(this.shown, on && at ? 1 : 0, 10, dt)
    this.mesh.visible = !!at && this.shown > 0.01
    if (!this.mesh.visible) return popped
    this.mesh.position.set(at!.x, at!.y + 0.34, at!.z)
    const beat = 1 + Math.sin(this.time * 6) * 0.03
    this.mesh.scale.set(0.95 * beat, 1.15 * beat, 0.95 * beat)
    this.material.uniforms.opacity.value = this.shown * (0.85 + Math.sin(this.time * 6) * 0.15)
    this.material.uniforms.time.value = this.time
    return popped
  }

  /** Sa couleur : celle du combattant pour le joueur. */
  set color(css: string) {
    ;(this.material.uniforms.color.value as THREE.Color).set(css)
  }

  dispose() {
    this.mesh.removeFromParent()
    this.material.dispose()
  }
}
