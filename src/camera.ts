import * as THREE from 'three'

/** Élévation de la vraie projection isométrique : atan(1/√2) ≈ 35,26°. */
const ISO_ELEVATION = Math.atan(1 / Math.SQRT2)
/** Caméra libre : de la vue rasante à la vue presque de dessus. */
const MIN_ELEVATION = THREE.MathUtils.degToRad(18)
const MAX_ELEVATION = THREE.MathUtils.degToRad(80)
/** Azimut des vues isométriques : 45° + un quart de tour entier. */
const ISO_AZIMUTH = Math.PI / 4
const QUARTER = Math.PI / 2
/**
 * Caméra libre : on ne s'éloigne pas du personnage de plus de ce rayon (en tuiles), le reste du pont
 * reste hors champ.
 */
const MAX_PAN = 4
/**
 * Zoom le plus éloigné en jeu : la pièce où l'on est et un bout de ses voisines, jamais le vaisseau
 * entier. Vaut pour un écran large ; plus étroit, on garde la même surface de pont (cf. farthest).
 */
export const ZOOM_MAX = 6
const WIDE_ASPECT = 16 / 9
const DISTANCE = 60

const _v = new THREE.Vector3()

/**
 * Caméra orthographique qui suit une cible, avec zoom. Par défaut, vue isométrique
 * et rotation par quarts de tour ; en caméra libre, on tourne et on incline à volonté,
 * et on peut faire glisser la vue (elle revient sur le personnage dès qu'il bouge).
 */
export class IsoCamera {
  readonly camera: THREE.OrthographicCamera
  readonly target = new THREE.Vector3()
  private azimuth = ISO_AZIMUTH
  private azimuthGoal = ISO_AZIMUTH
  private elevation = ISO_ELEVATION
  private elevationGoal = ISO_ELEVATION
  /** Inclinaison de repos : celle de la vue isométrique, ou la vue plongeante du mode aménagement. */
  private restElevation = ISO_ELEVATION
  private zoom = 5.5
  private zoomGoal = 5.5
  /** Décalage de la vue par rapport au personnage (caméra libre). */
  private offset = new THREE.Vector3()
  /** Délai pendant lequel le décalage tient, même si le personnage bouge (on est en train de le faire glisser). */
  private panHold = 0
  private lastFollow: THREE.Vector3 | null = null
  /** Secousse de la vue (saut FSD), qui s'amortit. */
  private jolt = 0
  private orbitHold = 0
  /**
   * Décalage du cadre à l'écran, en demi-hauteurs de fenêtre : la cible apparaît au centre d'une
   * zone que des panneaux laissent visible, à tous les zooms et sous toutes les inclinaisons.
   */
  private shift = new THREE.Vector2()
  private shiftGoal = new THREE.Vector2()

  /** Inclut le mouvement direct et la fin amortie d'un quart de tour. */
  get rotating(): boolean {
    return this.orbitHold > 0 || Math.abs(this.azimuthGoal - this.azimuth) > 0.001 || Math.abs(this.elevationGoal - this.elevation) > 0.001
  }

  constructor(private aspect: number) {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200)
    this.applyFrustum()
  }

  resize(aspect: number) {
    this.aspect = aspect
    this.zoomGoal = Math.min(this.zoomGoal, this.farthest)
    this.applyFrustum()
  }

  /**
   * Quart de tour : +1 horaire, -1 anti-horaire. Après la caméra libre, on repart
   * de la vue isométrique la plus proche dans ce sens, inclinaison et cadrage compris.
   */
  rotate(step: 1 | -1) {
    const k = (this.azimuthGoal - ISO_AZIMUTH) / QUARTER
    const next = step > 0 ? Math.floor(k + 1e-6) + 1 : Math.ceil(k - 1e-6) - 1
    this.azimuthGoal = ISO_AZIMUTH + next * QUARTER
    this.elevationGoal = this.restElevation
    this.offset.set(0, 0, 0)
  }

  /** Azimut visé (radians) : à retenir pour y revenir (cf. turnTo). */
  get heading(): number {
    return this.azimuthGoal
  }

  /**
   * Tourne la vue vers cet azimut (la caméra est alors du côté (sin a, cos a) de la cible), par le
   * plus court chemin ; `snap` : ramené à la vue isométrique la plus proche.
   */
  turnTo(azimuth: number, snap = true) {
    const a = snap ? ISO_AZIMUTH + Math.round((azimuth - ISO_AZIMUTH) / QUARTER) * QUARTER : azimuth
    const d = THREE.MathUtils.euclideanModulo(a - this.azimuthGoal + Math.PI, Math.PI * 2) - Math.PI
    this.azimuthGoal += d
    this.elevationGoal = this.restElevation
    this.offset.set(0, 0, 0)
  }

  /** Inclinaison de repos (radians) ; null : celle de la vraie vue isométrique. */
  setRestElevation(rad: number | null) {
    this.restElevation = rad ?? ISO_ELEVATION
    this.elevationGoal = this.restElevation
    this.offset.set(0, 0, 0)
  }

  /** Caméra libre : tourne autour de la cible et change l'inclinaison (radians). */
  orbit(dAzimuth: number, dElevation: number) {
    if (dAzimuth || dElevation) this.orbitHold = 0.15
    this.azimuth += dAzimuth
    this.azimuthGoal += dAzimuth
    this.elevation = THREE.MathUtils.clamp(this.elevation + dElevation, MIN_ELEVATION, MAX_ELEVATION)
    this.elevationGoal = this.elevation
  }

  /**
   * Caméra libre : fait glisser la vue, comme si on attrapait le sol (déplacement en pixels).
   * @param viewportHeight hauteur de la fenêtre, en pixels
   */
  pan(dxPx: number, dyPx: number, viewportHeight: number) {
    const unit = (2 * this.zoom) / viewportHeight
    // À l'écran, le sol est vu en biais : un pixel vertical couvre plus de sol qu'un pixel horizontal.
    this.offset.add(this.screenToGround(-dxPx * unit, (dyPx * unit) / Math.sin(this.elevation), _v))
    if (this.offset.length() > MAX_PAN) this.offset.setLength(MAX_PAN)
    this.panHold = 0.3
  }

  /**
   * Place la cible au centre d'une zone de l'écran plutôt qu'au centre de la fenêtre.
   * @param dxPx décalage vers la gauche du centre de la zone, en pixels
   * @param dyPx décalage vers le haut, en pixels
   * @param viewportHeight hauteur de la fenêtre, en pixels
   */
  frameCenter(dxPx: number, dyPx: number, viewportHeight: number) {
    this.shiftGoal.set((2 * dxPx) / viewportHeight, (2 * dyPx) / viewportHeight)
  }

  /** Zoom visé (demi-hauteur du cadre, en tuiles). */
  get zoomLevel(): number {
    return this.zoomGoal
  }

  /**
   * Zoom le plus rapproché à la molette (le mode photo va plus près), et le plus éloigné (le mode
   * aménagement va plus loin, pour cadrer la parcelle).
   */
  zoomMin = 2.5
  zoomMax = ZOOM_MAX

  /**
   * Zoom le plus éloigné sur cet écran : le zoom est une demi-hauteur, un écran en hauteur
   * (téléphone) ne verrait que trois tuiles de large ; il recule jusqu'à voir autant de pont.
   */
  private get farthest(): number {
    return this.zoomMax * Math.max(1, Math.sqrt(WIDE_ASPECT / this.aspect))
  }

  zoomTo(z: number) {
    this.zoomGoal = THREE.MathUtils.clamp(z, Math.min(2, this.zoomMin), this.farthest)
  }

  zoomBy(factor: number) {
    this.zoomGoal = THREE.MathUtils.clamp(this.zoomGoal * factor, this.zoomMin, this.farthest)
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

  /** Secoue la vue (amplitude en tuiles), le temps qu'elle s'amortisse. */
  shake(amount: number) {
    this.jolt = Math.max(this.jolt, amount)
  }

  /** Changement de pont : la caméra saute directement à la nouvelle altitude, sur le personnage. */
  snapTo(follow: THREE.Vector3) {
    this.offset.set(0, 0, 0)
    this.target.set(follow.x, follow.y + 0.4, follow.z)
  }

  get angle(): number {
    return this.azimuth
  }

  /** Inclinaison actuelle (radians au-dessus de l'horizon). */
  get tilt(): number {
    return this.elevation
  }

  update(dt: number, follow: THREE.Vector3) {
    this.orbitHold = Math.max(0, this.orbitHold - dt)
    // Le personnage se remet en route : la vue libre revient doucement sur lui.
    this.panHold = Math.max(0, this.panHold - dt)
    const moved = this.lastFollow ? Math.hypot(follow.x - this.lastFollow.x, follow.z - this.lastFollow.z) : 0
    if (moved > 1e-3 && this.panHold === 0) this.offset.multiplyScalar(Math.exp(-3 * dt))
    ;(this.lastFollow ??= new THREE.Vector3()).copy(follow)

    this.azimuth = THREE.MathUtils.damp(this.azimuth, this.azimuthGoal, 8, dt)
    this.elevation = THREE.MathUtils.damp(this.elevation, this.elevationGoal, 8, dt)
    this.zoom = THREE.MathUtils.damp(this.zoom, this.zoomGoal, 10, dt)
    this.shift.x = THREE.MathUtils.damp(this.shift.x, this.shiftGoal.x, 6, dt)
    this.shift.y = THREE.MathUtils.damp(this.shift.y, this.shiftGoal.y, 6, dt)
    this.target.x = THREE.MathUtils.damp(this.target.x, follow.x + this.offset.x, 6, dt)
    this.target.z = THREE.MathUtils.damp(this.target.z, follow.z + this.offset.z, 6, dt)
    this.target.y = THREE.MathUtils.damp(this.target.y, follow.y + 0.4, 10, dt)
    this.applyFrustum()
    const h = Math.cos(this.elevation) * DISTANCE
    this.camera.position.set(
      this.target.x + Math.sin(this.azimuth) * h,
      this.target.y + Math.sin(this.elevation) * DISTANCE,
      this.target.z + Math.cos(this.azimuth) * h,
    )
    this.camera.lookAt(this.target)
    if (this.jolt > 1e-3) {
      this.jolt *= Math.exp(-2.5 * dt)
      this.camera.translateX((Math.random() - 0.5) * this.jolt)
      this.camera.translateY((Math.random() - 0.5) * this.jolt)
    }
  }

  private applyFrustum() {
    const z = this.zoom
    const sx = this.shift.x * z, sy = this.shift.y * z
    this.camera.left = -z * this.aspect + sx
    this.camera.right = z * this.aspect + sx
    this.camera.top = z - sy
    this.camera.bottom = -z - sy
    this.camera.updateProjectionMatrix()
  }
}
