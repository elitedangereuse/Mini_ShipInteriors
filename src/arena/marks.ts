import * as THREE from 'three'
import type { Relation } from './ui'

/*
 * L'anneau peint au sol sous chaque combattant, à la couleur de ce qu'il est pour le joueur (cf.
 * palette.ts). La forme double la couleur, pour qui la distingue mal : un adversaire a quatre dents
 * tournées vers l'extérieur, comme une mire ; le joueur, une flèche qui montre où il regarde ; un
 * coéquipier, l'anneau seul. Un liseré sombre le détache du sol le plus clair (le sable de la baie),
 * comme du plus sombre. Formes partagées : un combattant de plus ne coûte que des objets.
 */

const RING = new THREE.RingGeometry(0.215, 0.305, 36).rotateX(-Math.PI / 2)
const RIM = new THREE.RingGeometry(0.19, 0.335, 36).rotateX(-Math.PI / 2)

/** Une dent d'adversaire : un triangle qui pointe vers l'extérieur, de l'anneau vers le large. */
function tooth(): THREE.BufferGeometry {
  const s = new THREE.Shape()
  s.moveTo(-0.055, 0.29)
  s.lineTo(0.055, 0.29)
  s.lineTo(0, 0.4)
  s.closePath()
  return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2)
}

/**
 * La flèche du joueur, devant lui (+z : là où il regarde). Couchée au sol comme l'anneau (un quart
 * de tour autour de x envoie le -y de la forme vers +z, sa face vers le haut).
 */
function arrow(): THREE.BufferGeometry {
  const s = new THREE.Shape()
  s.moveTo(-0.1, -0.33)
  s.lineTo(0, -0.45)
  s.lineTo(0.1, -0.33)
  s.lineTo(0, -0.37)
  s.closePath()
  return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2)
}

const TOOTH = tooth()
const ARROW = arrow()
/** Le liseré sombre : plus grand que l'anneau, sous lui, et sous ses dents. */
const TOOTH_RIM = (() => {
  const s = new THREE.Shape()
  s.moveTo(-0.08, 0.27)
  s.lineTo(0.08, 0.27)
  s.lineTo(0, 0.43)
  s.closePath()
  return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2)
})()
const ARROW_RIM = (() => {
  const s = new THREE.Shape()
  s.moveTo(-0.13, -0.31)
  s.lineTo(0, -0.48)
  s.lineTo(0.13, -0.31)
  s.lineTo(0, -0.345)
  s.closePath()
  return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2)
})()

const DARK = new THREE.MeshBasicMaterial({ color: '#05070b', transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, toneMapped: false })

const paints = new Map<string, THREE.MeshBasicMaterial>()
/** La peinture d'une couleur (partagée). */
function paint(color: string): THREE.MeshBasicMaterial {
  let m = paints.get(color)
  if (!m) paints.set(color, (m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, toneMapped: false })))
  return m
}

export class FighterMark {
  readonly root = new THREE.Group()
  private readonly turn = new THREE.Group()

  constructor(readonly rel: Relation, color: string) {
    const dark = new THREE.Mesh(RIM, DARK)
    const ring = new THREE.Mesh(RING, paint(color))
    dark.renderOrder = 1
    ring.renderOrder = 2
    this.root.add(dark, ring, this.turn)
    if (rel === 'enemy') {
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2
        const rim = new THREE.Mesh(TOOTH_RIM, DARK)
        const t = new THREE.Mesh(TOOTH, paint(color))
        rim.rotation.y = t.rotation.y = a
        rim.renderOrder = 1
        t.renderOrder = 2
        this.root.add(rim, t)
      }
    } else if (rel === 'self') {
      const rim = new THREE.Mesh(ARROW_RIM, DARK)
      const head = new THREE.Mesh(ARROW, paint(color))
      rim.renderOrder = 1
      head.renderOrder = 2
      this.turn.add(rim, head)
    }
    for (const o of this.root.children) o.frustumCulled = false
    this.root.visible = false
  }

  /**
   * @param at ses pieds (repère de l'arène), `y` : la hauteur de son sol
   * @param yaw son cap (la flèche du joueur)
   * @param beat son battement (protégé : l'anneau bat), 1 au repos
   */
  place(at: { x: number; y: number; z: number }, yaw: number, beat: number) {
    this.root.position.set(at.x, at.y + 0.04, at.z)
    this.turn.rotation.y = yaw
    this.root.scale.setScalar((this.rel === 'self' ? 1.12 : 1) * beat)
  }

  dispose() {
    this.root.removeFromParent()
  }
}
