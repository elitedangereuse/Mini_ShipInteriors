import * as THREE from 'three'
import type { ShipMap } from './map'
import type { Eye } from './visibility'

/** Regard vers le haut ou vers le bas, au plus (radians) : presque à la verticale. */
const MAX_PITCH = THREE.MathUtils.degToRad(88)
/** Champ vertical au repos, et ce que la course lui ajoute (degrés). */
const FOV = 75
const SPRINT_FOV = 20
/** Vitesses (au sol) entre lesquelles le champ s'ouvre : au-dessus de la marche, sous la course. */
const SPRINT_FROM = 2.1
const SPRINT_FULL = 3.5
/** Balancement de la marche : distance d'un pas, puis amplitudes (verticale ; la latérale en est la moitié). */
const BOB_STRIDE = 0.55
const BOB_WALK = 0.008
const BOB_SPRINT = 0.018
/** Déplacement en une image au-delà duquel c'est une téléportation, pas une marche. */
const TELEPORT = 0.6
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
/**
 * Vue par-dessus l'épaule : la caméra recule de SHOULDER_DISTANCE le long du regard, décalée de
 * SHOULDER_SIDE vers la droite (ou la gauche, cf. `side`), autour d'un point un peu au-dessus de la tête (les têtes sont
 * grosses : plus bas, elle boucherait la mire). Elle regarde droit devant, comme dans les yeux :
 * la mire reste au centre.
 */
const SHOULDER_DISTANCE = 1.6
const SHOULDER_SIDE = 0.45
const SHOULDER_ABOVE_HEAD = 0.12
/** La caméra ne descend pas plus bas sous la tête (regard vers le haut) : elle resterait dans le sol. */
const SHOULDER_MAX_DROP = 0.55
/** Écart gardé devant un mur, et distance sous laquelle le personnage boucherait la vue. */
const WALL_MARGIN = 0.2
const SHOULDER_HIDE_WITHIN = 0.5
/** Écart minimal entre la caméra et le plafond. */
const CEILING_MARGIN = 0.1
/** En dessous de ce mélange, la caméra est dans la tête : le personnage est masqué. */
const HIDE_BODY_BELOW = 0.35

/** Marge autour du champ de la caméra, pour ce que l'on voit du pont (cf. `eyes`). */
const SIGHT_MARGIN = THREE.MathUtils.degToRad(3)

const smooth = (u: number) => u * u * (3 - 2 * u)
const _eye = new THREE.Vector3()
const _look = new THREE.Vector3()
const _third = new THREE.Vector3()
const _pivot = new THREE.Vector3()
const _gaze = new THREE.Vector3()
const _shoulder = new THREE.Vector3()
const _from = new THREE.Vector3()

const DIR_OF = (dx: number, dz: number) => (dz < 0 ? 0 : dx > 0 ? 1 : dz > 0 ? 2 : 3)
const crosses = (map: ShipMap, x: number, z: number, dx: number, dz: number) => map.edge(x, z, DIR_OF(dx, dz)) !== 'wall'

/**
 * Part du segment a → b (au sol) que l'on parcourt avant de buter sur un mur du pont : 1 si rien
 * ne l'arrête. Les portes laissent passer : celle que l'on vient de franchir est encore ouverte.
 */
export function wallReach(map: ShipMap, ax: number, az: number, bx: number, bz: number): number {
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.05))
  let tx = Math.round(ax), tz = Math.round(az)
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const nx = Math.round(ax + (bx - ax) * t), nz = Math.round(az + (bz - az) * t)
    const dx = nx - tx, dz = nz - tz
    if (!dx && !dz) continue
    const free = dx && dz
      ? (crosses(map, tx, tz, dx, 0) && crosses(map, nx, tz, 0, dz)) || (crosses(map, tx, tz, 0, dz) && crosses(map, tx, nz, dx, 0))
      : crosses(map, tx, tz, dx, dz)
    if (!free) return (i - 1) / steps
    tx = nx
    tz = nz
  }
  return 1
}

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
  /** Voulue par-dessus l'épaule plutôt que dans les yeux. */
  shoulder = false
  /** Épaule par-dessus laquelle on regarde : 1 à droite, -1 à gauche. */
  side = 1
  /** Où en est la caméra d'un côté à l'autre (elle glisse, sans sauter). */
  private lean = 1
  /** 0 : dans les yeux, 1 : derrière le personnage. */
  private blend = 0
  /** 0 : dans les yeux, 1 : par-dessus l'épaule. */
  private over = 0
  /** Part du recul de l'épaule que les murs laissent à la caméra. */
  private room = 1
  /** Distance de la caméra d'épaule au personnage, murs compris. */
  private back = 0
  private readonly position = new THREE.Vector3()
  /**
   * Sensations de marche (balancement léger, champ qui s'ouvre en courant). À couper quand autre
   * chose règle le champ de la caméra (le stand de tir, cf. Range.jolt).
   */
  motion = true
  /** Pas de balancement pour qui a demandé moins d'animations. */
  private readonly still = matchMedia('(prefers-reduced-motion: reduce)').matches
  private readonly last = new THREE.Vector3(NaN, 0, 0)
  private speed = 0
  private stride = 0
  private bob = 0
  private kick = 0
  /** Les yeux de `eyes` : la caméra, et la tête du personnage ; dans sa tête, le premier suffit. */
  private readonly sight: [Eye, Eye] = [{ x: 0, z: 0, toward: 0, half: 0 }, { x: 0, z: 0, toward: 0, half: Math.PI }]
  private readonly inHead = [this.sight[0]]

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(FOV, aspect, 0.03, 200)
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
    this.over = this.shoulder ? 1 : 0
    this.lean = this.side
    this.room = 1
  }

  /** Tourne le regard (radians). */
  look(dYaw: number, dPitch: number) {
    this.yaw += dYaw
    this.pitch = THREE.MathUtils.clamp(this.pitch + dPitch, -MAX_PITCH, MAX_PITCH)
  }

  /** La caméra est-elle assez loin de la tête pour montrer le personnage ? */
  get showsBody(): boolean {
    return this.blend > HIDE_BODY_BELOW || (this.over > HIDE_BODY_BELOW && this.back > SHOULDER_HIDE_WITHIN)
  }

  get angle(): number {
    return this.yaw
  }

  /** Point de la caméra, pour l'écoute. */
  get listener(): THREE.Vector3 {
    return this.position
  }

  /**
   * D'où l'on regarde le pont, pour ne dessiner que les pièces que l'on voit (cf. visibility.ts) :
   * la caméra, avec son champ rapporté au sol (plus on lève ou baisse les yeux, plus il s'ouvre),
   * et, quand elle a quitté la tête du personnage, la tête aussi, qui voit tout autour d'elle.
   */
  eyes(head: THREE.Vector3): Eye[] {
    const camera = this.camera
    const gaze = camera.getWorldDirection(_gaze)
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
    // Les coins du champ, à plat : ils passent derrière soi quand on regarde presque à la verticale.
    const ahead = Math.hypot(gaze.x, gaze.z) - tanV * Math.abs(gaze.y)
    const half = ahead > 0.05 ? Math.atan2(tanV * camera.aspect, ahead) + SIGHT_MARGIN : Math.PI
    const [eye, around] = this.sight
    eye.x = this.position.x
    eye.z = this.position.z
    eye.toward = Math.atan2(gaze.x, gaze.z)
    eye.half = half
    around.x = head.x
    around.z = head.z
    return this.blend > 0 || this.over > 0 ? this.sight : this.inHead
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
   * @param map le pont : par-dessus l'épaule, la caméra s'arrête devant ses murs
   */
  update(dt: number, head: THREE.Vector3, ceiling = Infinity, map: ShipMap | null = null) {
    this.blend = THREE.MathUtils.damp(this.blend, this.thirdPerson ? 1 : 0, 5, dt)
    if (Math.abs(this.blend - (this.thirdPerson ? 1 : 0)) < 1e-3) this.blend = this.thirdPerson ? 1 : 0
    this.over = THREE.MathUtils.damp(this.over, this.shoulder ? 1 : 0, 6, dt)
    this.lean = THREE.MathUtils.damp(this.lean, this.side, 8, dt)
    if (Math.abs(this.over - (this.shoulder ? 1 : 0)) < 1e-3) this.over = this.shoulder ? 1 : 0
    const k = smooth(this.blend)
    const ks = smooth(this.over)
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw)
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch)

    // Dans les yeux : on regarde devant soi, vers (-sin yaw, -cos yaw), relevé de `pitch`.
    const top = ceiling - CEILING_MARGIN
    this.feel(dt, head, (1 - k) * (1 - ks))
    // Le balancement déplace l'œil sans le tourner : la mire reste sur ce qu'elle vise.
    const sway = Math.sin(this.stride) * this.bob * 0.5
    _eye.set(head.x + c * sway, Math.min(head.y - EYE_BELOW_HEAD - Math.abs(Math.sin(this.stride)) * this.bob, top), head.z - s * sway)
    if (ks > 0) {
      // Par-dessus l'épaule : en recul le long du regard, depuis l'axe du personnage, sans traverser de mur.
      _from.set(head.x, head.y + SHOULDER_ABOVE_HEAD, head.z)
      _shoulder.set(
        _from.x + c * SHOULDER_SIDE * this.lean + s * cp * SHOULDER_DISTANCE,
        THREE.MathUtils.clamp(_from.y - sp * SHOULDER_DISTANCE, head.y - SHOULDER_MAX_DROP, top),
        _from.z - s * SHOULDER_SIDE * this.lean + c * cp * SHOULDER_DISTANCE,
      )
      const reach = Math.hypot(_shoulder.x - _from.x, _shoulder.z - _from.z)
      const free = map && reach > 1e-3 ? THREE.MathUtils.clamp((wallReach(map, _from.x, _from.z, _shoulder.x, _shoulder.z) * reach - WALL_MARGIN) / reach, 0, 1) : 1
      // Devant un mur, la caméra avance d'un coup ; elle reprend son recul en douceur.
      this.room = free < this.room ? free : THREE.MathUtils.damp(this.room, free, 6, dt)
      _shoulder.lerpVectors(_from, _shoulder, this.room)
      this.back = _shoulder.distanceTo(_from)
      _eye.lerp(_shoulder, ks)
    } else this.back = 0
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

  /**
   * Vitesse au sol du personnage, lue sur sa tête, et ce qu'elle fait à la vue : un balancement
   * au rythme des pas, et le champ qui s'ouvre en courant. `eyes` : 1 dans les yeux, 0 derrière.
   */
  private feel(dt: number, head: THREE.Vector3, eyes: number) {
    const moved = Number.isNaN(this.last.x) ? 0 : Math.hypot(head.x - this.last.x, head.z - this.last.z)
    this.last.copy(head)
    const walked = moved < TELEPORT && dt > 0 ? moved : 0
    this.speed = THREE.MathUtils.damp(this.speed, dt > 0 ? walked / dt : 0, 12, dt)
    const run = THREE.MathUtils.smoothstep(this.speed, SPRINT_FROM, SPRINT_FULL)
    const on = this.motion && !this.still ? eyes : 0
    this.stride += (walked / BOB_STRIDE) * Math.PI
    this.bob = THREE.MathUtils.damp(this.bob, on * Math.min(1, this.speed / 1.2) * THREE.MathUtils.lerp(BOB_WALK, BOB_SPRINT, run), 10, dt)
    if (!this.motion) {
      // Le champ est rendu tel quel à qui le règle, une fois.
      if (this.kick) this.setFov(FOV)
      this.kick = 0
      return
    }
    this.kick = THREE.MathUtils.damp(this.kick, run * SPRINT_FOV, run * SPRINT_FOV > this.kick ? 7 : 4, dt)
    if (this.kick < 1e-3) this.kick = 0
    this.setFov(FOV + this.kick)
  }

  private setFov(fov: number) {
    if (Math.abs(this.camera.fov - fov) < 1e-3) return
    this.camera.fov = fov
    this.camera.updateProjectionMatrix()
  }
}
