import * as THREE from 'three'

/*
 * Toilettes à dépression utilisées pendant un saut FSD (cf. playJump dans main.ts) : la cuvette
 * aspire son occupant, qui tourne sur lui-même en rétrécissant dans un tourbillon d'eau, puis
 * retombe dans la cale, juste en dessous. Chaque joueur joue l'aspiration de ceux qu'il voit
 * assis sur des toilettes au moment du saut : pas de message de plus sur le réseau.
 */

/** Durée de l'aspiration (secondes). */
export const FLUSH_TIME = 1.7
/** Chute dans la cale : hauteur de départ au-dessus du pont, et pesanteur. */
const DROP_HEIGHT = 1.3
const GRAVITY = 9.8
/** Au-delà, un personnage aspiré reprend sa taille, arrivé ou non (joueur distant sans cette version). */
const HOLD_MAX = 6

const WATER = new THREE.MeshBasicMaterial({ color: '#6fd3ff', transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending })
const RING_GEO = new THREE.TorusGeometry(1, 0.08, 6, 32)
const DROP_GEO = new THREE.SphereGeometry(0.018, 6, 4)
const RINGS = 3

interface Flush {
  /** Modèle du personnage (Avatar.root), qu'on fait tourner, enfoncer et rétrécir. */
  model: THREE.Object3D
  swirl: THREE.Group
  t: number
  done?: () => void
  /** Le personnage est arrivé dans la cale : il reprend sa taille. */
  landed: () => boolean
}

interface Drop {
  body: THREE.Object3D
  model: THREE.Object3D
  floor: number
  t: number
  done: () => void
}

export class ToiletFlushes {
  private flushes: Flush[] = []
  private drops: Drop[] = []

  constructor(private scene: THREE.Object3D) {}

  /**
   * Aspire le personnage dont `model` est le modèle, assis au-dessus de la cuvette `bowl`
   * (monde) ; `done` à la fin de l'aspiration. Il reste rétréci jusqu'à ce que `landed` le dise
   * arrivé (ou `reset`).
   */
  start(model: THREE.Object3D, bowl: THREE.Vector3, landed: () => boolean, done?: () => void) {
    this.reset(model)
    const swirl = new THREE.Group()
    swirl.position.copy(bowl)
    for (let i = 0; i < RINGS; i++) {
      const ring = new THREE.Mesh(RING_GEO, WATER)
      ring.rotation.x = Math.PI / 2
      swirl.add(ring)
    }
    for (let i = 0; i < 10; i++) swirl.add(new THREE.Mesh(DROP_GEO, WATER))
    this.scene.add(swirl)
    this.flushes.push({ model, swirl, t: 0, done, landed })
  }

  /** Rend au personnage sa taille et son aplomb. */
  reset(model: THREE.Object3D) {
    const i = this.flushes.findIndex((f) => f.model === model)
    if (i >= 0) {
      this.scene.remove(this.flushes[i].swirl)
      this.flushes.splice(i, 1)
    }
    model.position.set(0, 0, 0)
    model.rotation.set(0, 0, 0)
    model.scale.setScalar(1)
  }

  /** Fait tomber `body` (le joueur) du plafond jusqu'au sol `floor`, en tournoyant ; `done` à l'atterrissage. */
  drop(body: THREE.Object3D, model: THREE.Object3D, floor: number, done: () => void) {
    body.position.y = floor + DROP_HEIGHT
    this.drops.push({ body, model, floor, t: 0, done })
  }

  update(dt: number) {
    for (const f of [...this.flushes]) {
      f.t += dt
      const u = Math.min(1, f.t / FLUSH_TIME)
      // Le tourbillon prend de la vitesse ; le personnage tourne, s'enfonce et rapetisse.
      f.model.rotation.y += dt * (2 + u * u * 26)
      f.model.position.y = -0.45 * u * u
      f.model.scale.setScalar(Math.max(0.01, 1 - u * u * 0.99))
      f.swirl.visible = u < 1
      f.swirl.children.forEach((c, i) => {
        if (i < RINGS) {
          c.scale.setScalar(0.07 + 0.2 * ((i + 1) / RINGS) * (1 - u * 0.6))
          c.position.y = 0.02 + i * 0.03 * (1 - u)
          c.rotation.z = f.t * (6 + i * 5)
        } else {
          // Gouttes qui spiralent vers le centre en descendant.
          const a = f.t * (8 + u * 12) + i * 1.9
          const r = 0.3 * (1 - ((f.t * 0.9 + i * 0.1) % 1))
          c.position.set(Math.cos(a) * r, 0.05 + r * 0.8, Math.sin(a) * r)
        }
      })
      if (u < 1) continue
      const done = f.done
      f.done = undefined
      done?.()
      if (f.landed() || f.t > HOLD_MAX) this.reset(f.model)
    }
    for (const d of [...this.drops]) {
      d.t += dt
      const y = d.floor + DROP_HEIGHT - 0.5 * GRAVITY * d.t * d.t
      d.model.rotation.y += dt * 9
      if (y > d.floor) {
        d.body.position.y = y
        continue
      }
      d.body.position.y = d.floor
      d.model.rotation.y = 0
      this.drops.splice(this.drops.indexOf(d), 1)
      d.done()
    }
  }
}
