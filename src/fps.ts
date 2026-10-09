import * as THREE from 'three'

/** Regard vers le haut ou vers le bas, au plus (radians) : presque à la verticale. */
const MAX_PITCH = THREE.MathUtils.degToRad(88)
/**
 * Hauteur des yeux sous Avatar.head (0,28 au-dessus du crâne) : un peu au-dessus du crâne. Le
 * mobilier du kit est taillé pour des têtes de chibi (table 0,40, chaise 0,55) : des yeux à
 * hauteur réelle (0,59) donnaient l'impression d'être un enfant. Les portes s'ouvrent jusqu'au
 * haut du mur (1) : rien à heurter.
 */
const EYE_BELOW_HEAD = 0.21
/** Point visé derrière le personnage (sa poitrine), sous Avatar.head. */
const PIVOT_BELOW_HEAD = 0.46
/** Vue à la troisième personne : distance au personnage et inclinaison de repos. */
const THIRD_DISTANCE = 1.7
const THIRD_ELEVATION = THREE.MathUtils.degToRad(22)
const THIRD_MIN_ELEVATION = THREE.MathUtils.degToRad(-10)
const THIRD_MAX_ELEVATION = THREE.MathUtils.degToRad(70)
/** Écart minimal entre la caméra et le plafond. */
const CEILING_MARGIN = 0.1
/** En dessous de ce mélange, la caméra est dans la tête : le personnage est masqué. */
const HIDE_BODY_BELOW = 0.35

const smooth = (u: number) => u * u * (3 - 2 * u)
const _eye = new THREE.Vector3()
const _look = new THREE.Vector3()
const _third = new THREE.Vector3()
const _pivot = new THREE.Vector3()

/**
 * Vue subjective : caméra en perspective, dans les yeux du personnage. Quand il est occupé
 * (assis, en emote, au travail), elle recule en douceur derrière lui, à la troisième personne,
 * et revient dans ses yeux ensuite. L'azimut suit la convention d'IsoCamera : la caméra est du
 * côté (sin yaw, cos yaw) du personnage, et regarde dans l'autre sens.
 */
export class FirstPersonCamera {
  readonly camera: THREE.PerspectiveCamera
  /** Azimut du regard (cf. IsoCamera.angle). */
  yaw = 0
  /** Regard au-dessus (positif) ou au-dessous de l'horizon. */
  pitch = 0
  /** Voulue à la troisième personne (le personnage est occupé). */
  thirdPerson = false
  /** 0 : dans les yeux, 1 : derrière le personnage. */
  private blend = 0
  private readonly position = new THREE.Vector3()

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(72, aspect, 0.03, 200)
  }

  resize(aspect: number) {
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
  }

  /** Reprend l'orientation d'une autre vue (azimut en radians), regard à l'horizontale. */
  align(yaw: number) {
    this.yaw = yaw
    this.pitch = 0
  }

  /** Place la caméra d'un coup (entrée dans la vue, changement de pont). */
  snap() {
    this.blend = this.thirdPerson ? 1 : 0
  }

  /** Tourne le regard (radians). */
  look(dYaw: number, dPitch: number) {
    this.yaw += dYaw
    this.pitch = THREE.MathUtils.clamp(this.pitch + dPitch, -MAX_PITCH, MAX_PITCH)
  }

  /** La caméra est-elle assez loin de la tête pour montrer le personnage ? */
  get showsBody(): boolean {
    return this.blend > HIDE_BODY_BELOW
  }

  get angle(): number {
    return this.yaw
  }

  /** Point de la caméra, pour l'écoute. */
  get listener(): THREE.Vector3 {
    return this.position
  }

  /** Direction horizontale (normalisée) du personnage vers la caméra. */
  toCamera(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw))
  }

  /** Convertit une direction « écran » (x droite, y devant) en direction au sol. */
  screenToGround(sx: number, sy: number, out = new THREE.Vector3()): THREE.Vector3 {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw)
    return out.set(sx * c - sy * s, 0, -sx * s - sy * c)
  }

  /**
   * @param head dessus de la tête du personnage (Avatar.head)
   * @param ceiling hauteur (monde) du plafond : la caméra reste dessous, même derrière le personnage
   */
  update(dt: number, head: THREE.Vector3, ceiling = Infinity) {
    this.blend = THREE.MathUtils.damp(this.blend, this.thirdPerson ? 1 : 0, 5, dt)
    if (Math.abs(this.blend - (this.thirdPerson ? 1 : 0)) < 1e-3) this.blend = this.thirdPerson ? 1 : 0
    const k = smooth(this.blend)
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw)
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch)

    // Dans les yeux : on regarde devant soi, vers (-sin yaw, -cos yaw), relevé de `pitch`.
    const top = ceiling - CEILING_MARGIN
    _eye.set(head.x, Math.min(head.y - EYE_BELOW_HEAD, top), head.z)
    const eyeLook = _look.set(_eye.x - s * cp, _eye.y + sp, _eye.z - c * cp)

    // Derrière le personnage : en orbite autour de sa poitrine, le regard vers lui.
    _pivot.set(head.x, head.y - PIVOT_BELOW_HEAD, head.z)
    const elevation = THREE.MathUtils.clamp(THIRD_ELEVATION - this.pitch, THIRD_MIN_ELEVATION, THIRD_MAX_ELEVATION)
    const h = Math.cos(elevation) * THIRD_DISTANCE
    _third.set(_pivot.x + s * h, Math.min(_pivot.y + Math.sin(elevation) * THIRD_DISTANCE, top), _pivot.z + c * h)

    this.position.lerpVectors(_eye, _third, k)
    this.camera.position.copy(this.position)
    this.camera.lookAt(eyeLook.lerp(_pivot, k))
  }
}
