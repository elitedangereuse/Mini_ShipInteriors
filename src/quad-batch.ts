import * as THREE from 'three'

/*
 * Des quadrilatères de même matière (une texture, un mélange), redessinés à chaque image en un seul
 * maillage : un appel de dessin pour toutes les traînées des balles en vol, un autre pour leurs
 * halos, au lieu d'un par balle (cf. range.ts). Chacun a sa couleur et son opacité (couleurs de
 * sommet, alpha compris). Coordonnées : celles du groupe qui porte le maillage.
 */

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _c = new THREE.Vector3()
const _d = new THREE.Vector3()
const _right = new THREE.Vector3()
const _up = new THREE.Vector3()

export class QuadBatch {
  readonly mesh: THREE.Mesh
  private readonly geometry = new THREE.BufferGeometry()
  private positions = new Float32Array(0)
  private colors = new Float32Array(0)
  private capacity = 0
  private count = 0

  constructor(material: THREE.MeshBasicMaterialParameters, renderOrder = 0) {
    this.mesh = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({ ...material, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }))
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = renderOrder
    this.mesh.matrixAutoUpdate = false
    this.grow(16)
  }

  get material(): THREE.MeshBasicMaterial {
    return this.mesh.material as THREE.MeshBasicMaterial
  }

  /** On recommence la liste (au début de chaque image). */
  begin() {
    this.count = 0
  }

  /**
   * Un quadrilatère : `a` et `b` à un bout (u = 0 et 1, v = 1), `c` et `d` à l'autre (v = 0) ;
   * `color` et `alpha` pour ses quatre sommets.
   */
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: THREE.Color, alpha: number) {
    if (this.count === this.capacity) this.grow(this.capacity * 2)
    const p = this.count * 12, k = this.count * 16
    for (const [i, v] of [a, b, c, d].entries()) {
      this.positions[p + i * 3] = v.x
      this.positions[p + i * 3 + 1] = v.y
      this.positions[p + i * 3 + 2] = v.z
      this.colors[k + i * 4] = color.r
      this.colors[k + i * 4 + 1] = color.g
      this.colors[k + i * 4 + 2] = color.b
      this.colors[k + i * 4 + 3] = alpha
    }
    this.count++
  }

  /**
   * Un ruban de `from` à `to`, large de `width`, tourné vers la caméra (`eye` : sa position dans le
   * repère du groupe ; `look`, pour une caméra orthographique, la direction de son regard).
   */
  ribbon(from: THREE.Vector3, to: THREE.Vector3, width: number, eye: THREE.Vector3, look: THREE.Vector3 | null, color: THREE.Color, alpha: number) {
    const along = _c.subVectors(to, from)
    const len = along.length()
    if (len < 1e-4) return
    along.divideScalar(len)
    // Vers la caméra : depuis le milieu du ruban ; pour une caméra orthographique, à contre-sens de son regard.
    const toward = look ? _d.copy(look).negate() : _d.copy(eye).sub(from).addScaledVector(along, -len / 2)
    const side = _right.crossVectors(along, toward)
    if (side.lengthSq() < 1e-8) side.crossVectors(along, THREE.Object3D.DEFAULT_UP)
    side.normalize().multiplyScalar(width / 2)
    this.quad(_a.copy(from).sub(side), _b.copy(from).add(side), _c.copy(to).sub(side), _d.copy(to).add(side), color, alpha)
  }

  /** Un carré face à la caméra (comme un sprite), centré en `at`, de côté `size`. */
  billboard(at: THREE.Vector3, size: number, camera: THREE.Camera, color: THREE.Color, alpha: number) {
    const e = camera.matrixWorld.elements
    _right.set(e[0], e[1], e[2]).normalize().multiplyScalar(size / 2)
    _up.set(e[4], e[5], e[6]).normalize().multiplyScalar(size / 2)
    this.quad(
      _a.copy(at).sub(_right).add(_up), _b.copy(at).add(_right).add(_up),
      _c.copy(at).sub(_right).sub(_up), _d.copy(at).add(_right).sub(_up),
      color, alpha,
    )
  }

  /** Fin de la liste : seuls ses quadrilatères se dessinent. */
  end() {
    const position = this.geometry.getAttribute('position') as THREE.BufferAttribute
    const color = this.geometry.getAttribute('color') as THREE.BufferAttribute
    position.clearUpdateRanges()
    color.clearUpdateRanges()
    position.addUpdateRange(0, this.count * 12)
    color.addUpdateRange(0, this.count * 16)
    position.needsUpdate = color.needsUpdate = true
    this.geometry.setDrawRange(0, this.count * 6)
    this.mesh.visible = this.count > 0
  }

  dispose() {
    this.geometry.dispose()
    this.material.dispose()
  }

  private grow(capacity: number) {
    const positions = new Float32Array(capacity * 12)
    const colors = new Float32Array(capacity * 16)
    positions.set(this.positions)
    colors.set(this.colors)
    const uvs = new Float32Array(capacity * 8)
    const index = new Uint32Array(capacity * 6)
    for (let q = 0; q < capacity; q++) {
      uvs.set([0, 1, 1, 1, 0, 0, 1, 0], q * 8)
      index.set([q * 4, q * 4 + 2, q * 4 + 1, q * 4 + 2, q * 4 + 3, q * 4 + 1], q * 6)
    }
    this.positions = positions
    this.colors = colors
    this.capacity = capacity
    this.geometry.dispose()
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4).setUsage(THREE.DynamicDrawUsage))
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    this.geometry.setIndex(new THREE.BufferAttribute(index, 1))
  }
}
