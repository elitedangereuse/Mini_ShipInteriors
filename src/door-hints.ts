import * as THREE from 'three'
import type { DoorState } from './deck'

/*
 * Repères des portes qu'on ne voit pas :
 * - masquée par un mur ou un gros meuble : la silhouette holographique de l'embrasure, posée devant
 *   la porte côté caméra et dessinée avec un test de profondeur inversé (GreaterDepth). Elle
 *   n'apparaît que là où quelque chose la cache ; une porte bien en vue n'a rien de plus ;
 * - vue de profil (caméra dans l'axe du mur) : l'embrasure n'est plus qu'un trait, la silhouette
 *   aussi. Un marquage au sol montre alors le passage, de part et d'autre du mur.
 */

/** Hauteur de l'ouverture : celle des battants du kit (0,7). */
const HEIGHT = 0.72
/** Largeur de l'ouverture : un battant simple (0,4), ou les deux d'une porte double (2 × 0,78). */
const WIDTH = { single: 0.44, double: 1.56 }
/**
 * Écart au milieu du mur, côté caméra : au-delà de l'épaisseur du mur (0,3) et des poteaux
 * d'angle (0,35), pour que la porte elle-même et ses montants ne comptent pas comme un obstacle.
 */
const OUTSET = 0.22
/** Autour du joueur, les portes se voient toutes ; au-delà, leur repère s'efface. */
const NEAR = 8
const FAR = 13
/** Quelqu'un à la porte (elle s'ouvre, cf. DOOR_RANGE) : le repère se retire. */
const CLEAR = 1.6
/**
 * Un personnage entre la porte et la caméra la « cache » aussi : la silhouette se peindrait sur
 * lui. Il la couvre jusqu'à ~1/tan(inclinaison) devant elle, 3,1 dans la vue la plus rasante ;
 * de si près, le mur qui la masque est de toute façon tramé (cf. updateOccluders).
 */
const SHADOW = 3.2
/** Pied de la silhouette, un rien au-dessus du sol (qui ne doit pas la « cacher »). */
const BASE = 0.03
/** Marquage au sol : sa longueur, à travers le mur (de part et d'autre). */
const PASSAGE = 1.5
/**
 * Porte vue de profil : |normale du mur · direction de la caméra| sous EDGE_ON, marquage plein ;
 * il s'efface jusqu'à EDGE_OFF. La vue isométrique (0,71) n'en a pas.
 */
const EDGE_ON = 0.3
const EDGE_OFF = 0.5

const textures = new Map<keyof typeof WIDTH, THREE.CanvasTexture>()
const floorTextures = new Map<string, THREE.CanvasTexture>()

/** Embrasure : un cadre lumineux, un voile qui monte du seuil, des lignes de balayage. */
function hintTexture(kind: keyof typeof WIDTH): THREE.CanvasTexture {
  let t = textures.get(kind)
  if (t) return t
  const h = 128
  const w = Math.round((h * WIDTH[kind]) / HEIGHT)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  const veil = g.createLinearGradient(0, h, 0, 0)
  veil.addColorStop(0, 'rgba(89, 216, 255, 0.75)')
  veil.addColorStop(1, 'rgba(89, 216, 255, 0.25)')
  g.fillStyle = veil
  g.fillRect(0, 0, w, h)
  g.fillStyle = 'rgba(191, 243, 255, 0.18)'
  for (let y = 3; y < h; y += 6) g.fillRect(0, y, w, 2)
  g.strokeStyle = '#bff3ff'
  g.lineWidth = 8
  g.strokeRect(4, 4, w - 8, h - 8)
  // Seuil : un trait plus franc au sol, là où l'on passe.
  g.fillStyle = '#e6fbff'
  g.fillRect(0, h - 9, w, 9)
  t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  textures.set(kind, t)
  return t
}

/** Passage vu de dessus : les bords de l'ouverture, et des chevrons qui traversent le mur dans les deux sens. */
function passageTexture(kind: keyof typeof WIDTH): THREE.CanvasTexture {
  const key = `floor-${kind}`
  let t = floorTextures.get(key)
  if (t) return t
  const h = 192
  const w = Math.round((h * WIDTH[kind]) / PASSAGE)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  // Voile plus dense au milieu (sous la porte), qui s'efface aux deux bouts.
  const veil = g.createLinearGradient(0, 0, 0, h)
  veil.addColorStop(0, 'rgba(89, 216, 255, 0)')
  veil.addColorStop(0.5, 'rgba(89, 216, 255, 0.45)')
  veil.addColorStop(1, 'rgba(89, 216, 255, 0)')
  g.fillStyle = veil
  g.fillRect(0, 0, w, h)
  g.fillStyle = '#bff3ff'
  g.fillRect(0, 0, 4, h)
  g.fillRect(w - 4, 0, 4, h)
  g.strokeStyle = '#e6fbff'
  g.lineWidth = 5
  g.lineJoin = 'round'
  const cw = Math.min(w * 0.32, 22)
  for (const [y, up] of [[h * 0.2, true], [h * 0.3, true], [h * 0.7, false], [h * 0.8, false]] as const) {
    g.beginPath()
    g.moveTo(w / 2 - cw, y + (up ? cw * 0.6 : -cw * 0.6))
    g.lineTo(w / 2, y)
    g.lineTo(w / 2 + cw, y + (up ? cw * 0.6 : -cw * 0.6))
    g.stroke()
  }
  t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  floorTextures.set(key, t)
  return t
}
interface Hint {
  mesh: THREE.Mesh
  material: THREE.MeshBasicMaterial
  /** Marquage au sol, pour la porte vue de profil. */
  floor: THREE.Mesh
  floorMaterial: THREE.MeshBasicMaterial
  /** Normale du mur (horizontale) : la silhouette passe du côté de la caméra. */
  normal: THREE.Vector3
  value: number
  floorValue: number
}

export class DoorHints {
  private hints = new Map<DoorState, Hint>()
  private static geometry = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0)
  private static floorGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)

  /**
   * @param focus position du joueur (le pont est affiché), sinon null : tout est caché
   * @param show faux en mode photo : la scène sans rien par-dessus
   */
  update(doors: DoorState[], locked: (d: DoorState) => boolean, actors: THREE.Vector3[], focus: THREE.Vector3 | null, toCamera: THREE.Vector3, show: boolean, time: number, dt: number) {
    const pulse = 0.85 + Math.sin(time * 2.4) * 0.15
    for (const d of doors) {
      const h = this.hints.get(d) ?? this.create(d)
      // Seules les portes où l'on passe : une porte verrouillée garde son secret (et son voyant rouge).
      const near = focus && show && !locked(d) ? 1 - THREE.MathUtils.smoothstep(Math.hypot(focus.x - d.center.x, focus.z - d.center.z), NEAR, FAR) : 0
      const facing = Math.abs(h.normal.dot(toCamera))
      const goal = near && !actors.some((a) => this.covers(a, d, h, toCamera)) ? near : 0
      // Le marquage est sous les pieds : les personnages passent dessus, il n'a pas à s'effacer pour eux.
      const floorGoal = near * (1 - THREE.MathUtils.smoothstep(facing, EDGE_ON, EDGE_OFF))
      h.floorValue = THREE.MathUtils.damp(h.floorValue, floorGoal, 8, dt)
      if (h.floorValue < 0.01) h.floorValue = 0
      h.floor.visible = h.floorValue > 0
      h.floorMaterial.opacity = h.floorValue * pulse
      h.value = THREE.MathUtils.damp(h.value, goal, 8, dt)
      if (h.value < 0.01) h.value = 0
      h.mesh.visible = h.value > 0
      if (!h.mesh.visible) continue
      h.material.opacity = h.value * pulse
      const side = h.normal.dot(toCamera) >= 0 ? 1 : -1
      h.mesh.position.copy(d.center).addScaledVector(h.normal, side * OUTSET).setY(BASE)
    }
  }

  /** Ce personnage est à la porte, ou entre elle et la caméra. */
  private covers(a: THREE.Vector3, d: DoorState, h: Hint, toCamera: THREE.Vector3): boolean {
    const dx = a.x - d.center.x, dz = a.z - d.center.z
    if (Math.hypot(dx, dz) < CLEAR) return true
    const ahead = dx * toCamera.x + dz * toCamera.z
    const aside = Math.abs(dx * toCamera.z - dz * toCamera.x)
    return ahead > 0 && ahead < SHADOW && aside < h.mesh.scale.x / 2 + 0.45
  }

  private create(d: DoorState): Hint {
    const kind = d.pair ? 'double' : 'single'
    const material = new THREE.MeshBasicMaterial({
      map: hintTexture(kind),
      transparent: true,
      depthWrite: false,
      depthFunc: THREE.GreaterDepth,
      toneMapped: false,
      side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(DoorHints.geometry, material)
    mesh.scale.set(WIDTH[kind], HEIGHT, 1)
    mesh.rotation.y = d.axis.x ? 0 : Math.PI / 2
    // Après tout le reste : la profondeur des murs et des meubles est déjà là.
    mesh.renderOrder = 10
    mesh.visible = false
    mesh.raycast = () => {}
    const floorMaterial = new THREE.MeshBasicMaterial({
      map: passageTexture(kind),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
    const floor = new THREE.Mesh(DoorHints.floorGeometry, floorMaterial)
    floor.scale.set(WIDTH[kind], 1, PASSAGE)
    floor.rotation.y = mesh.rotation.y
    floor.position.set(d.center.x, 0.012, d.center.z)
    floor.renderOrder = 3
    floor.visible = false
    floor.raycast = () => {}
    d.panel.parent?.add(mesh, floor)
    const normal = d.axis.x ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0)
    const h: Hint = { mesh, material, floor, floorMaterial, normal, value: 0, floorValue: 0 }
    this.hints.set(d, h)
    return h
  }

  /** Porte retirée (pièce d'extension des quartiers démontée). */
  remove(d: DoorState) {
    const h = this.hints.get(d)
    if (!h) return
    h.mesh.removeFromParent()
    h.floor.removeFromParent()
    h.material.dispose()
    h.floorMaterial.dispose()
    this.hints.delete(d)
  }
}
