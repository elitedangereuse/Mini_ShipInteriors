import * as THREE from 'three'

/** Élévation de la vraie projection isométrique : atan(1/√2) ≈ 35,26°. */
const ELEVATION = Math.atan(1 / Math.SQRT2)
const DISTANCE = 60

/** Caméra orthographique isométrique qui suit une cible, avec zoom et rotation par quarts de tour. */
export class IsoCamera {
  readonly camera: THREE.OrthographicCamera
  readonly target = new THREE.Vector3()
  private azimuth = Math.PI / 4
  private azimuthGoal = Math.PI / 4
  private zoom = 5.5
  private zoomGoal = 5.5

  constructor(private aspect: number) {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200)
    this.applyFrustum()
  }

  resize(aspect: number) {
    this.aspect = aspect
    this.applyFrustum()
  }

  /** Quart de tour : +1 horaire, -1 anti-horaire. */
  rotate(step: 1 | -1) {
    this.azimuthGoal += (step * Math.PI) / 2
  }

  /** Zoom visé (demi-hauteur du cadre, en tuiles). */
  get zoomLevel(): number {
    return this.zoomGoal
  }

  zoomTo(z: number) {
    this.zoomGoal = THREE.MathUtils.clamp(z, 2, 14)
  }

  zoomBy(factor: number) {
    this.zoomGoal = THREE.MathUtils.clamp(this.zoomGoal * factor, 2.5, 14)
  }

  /** Direction horizontale (normalisée) de la scène vers la caméra. */
  toCamera(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(Math.sin(this.azimuth), 0, Math.cos(this.azimuth))
  }

  /** Convertit une direction « écran » (x droite, y haut) en direction au sol. */
  screenToGround(sx: number, sy: number, out = new THREE.Vector3()): THREE.Vector3 {
    const s = Math.sin(this.azimuth), c = Math.cos(this.azimuth)
    // haut de l'écran = s'éloigner de la caméra ; droite = (cos, 0, -sin)
    return out.set(sx * c - sy * s, 0, -sx * s - sy * c)
  }

  /** Changement de pont : la caméra saute directement à la nouvelle altitude. */
  snapTo(follow: THREE.Vector3) {
    this.target.set(follow.x, follow.y + 0.4, follow.z)
  }

  get angle(): number {
    return this.azimuth
  }

  update(dt: number, follow: THREE.Vector3) {
    this.azimuth = THREE.MathUtils.damp(this.azimuth, this.azimuthGoal, 8, dt)
    this.zoom = THREE.MathUtils.damp(this.zoom, this.zoomGoal, 10, dt)
    this.target.x = THREE.MathUtils.damp(this.target.x, follow.x, 6, dt)
    this.target.z = THREE.MathUtils.damp(this.target.z, follow.z, 6, dt)
    this.target.y = THREE.MathUtils.damp(this.target.y, follow.y + 0.4, 10, dt)
    this.applyFrustum()
    const h = Math.cos(ELEVATION) * DISTANCE
    this.camera.position.set(
      this.target.x + Math.sin(this.azimuth) * h,
      this.target.y + Math.sin(ELEVATION) * DISTANCE,
      this.target.z + Math.cos(this.azimuth) * h,
    )
    this.camera.lookAt(this.target)
  }

  private applyFrustum() {
    const z = this.zoom
    this.camera.left = -z * this.aspect
    this.camera.right = z * this.aspect
    this.camera.top = z
    this.camera.bottom = -z
    this.camera.updateProjectionMatrix()
  }
}
