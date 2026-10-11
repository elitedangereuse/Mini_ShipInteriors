import * as THREE from 'three'
import type { ArenaTrap } from '../net'
import { ARENA_CHARACTERS, ARENA_RULES } from '../../shared/arena.js'

/*
 * Ce que les personnages laissent sur le terrain (cf. server/arena.js, qui les fait vivre), dans
 * l'arène :
 * - les fleurs carnivores de Capucine : elles sortent de terre, se balancent, claquent des
 *   mâchoires quand elles mordent, et fanent ;
 * - les flaques de Jacques : une nappe verte qui brûle, des flammèches qui dansent dessus, et qui
 *   s'éteint.
 * Un cercle peint au sol, à la couleur du camp (pour le joueur : bleu les siens, rouge ceux d'en
 * face), montre jusqu'où elles portent (jusqu'au corps de celui qui s'y tient, comme le compte le
 * relais) : c'est ce qu'il faut éviter, ou tenir. Leurs formes sont partagées : une fleur, une
 * flaque de plus ne coûtent que des objets, pas de géométrie neuve.
 */

const FLOWER = ARENA_CHARACTERS.capucine.weapon.flower!
const FIRE = ARENA_CHARACTERS.jacques.weapon.fire!

const ring = new THREE.RingGeometry(0.94, 1, 40).rotateX(-Math.PI / 2)
const disc = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2)
const flame = new THREE.ConeGeometry(0.06, 0.2, 6).translate(0, 0.1, 0)

const lambert = (color: string) => new THREE.MeshLambertMaterial({ color })
const STEM = lambert('#3c7a34'), LEAF = lambert('#5fae45'), JAW = lambert('#c8321e'), INSIDE = lambert('#ffb0a0'), TOOTH = lambert('#f6f1e4')
const LEAF_GEO = new THREE.SphereGeometry(0.09, 8, 6)
const STEM_GEO = new THREE.CylinderGeometry(0.018, 0.026, 0.3, 6).translate(0, 0.15, 0)
const SHELL_GEO = [true, false].map((up) => new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, up ? 0 : Math.PI / 2, Math.PI / 2))
const LINING_GEO = [true, false].map((up) => new THREE.CircleGeometry(0.1, 12).rotateX(up ? Math.PI / 2 : -Math.PI / 2))
const TOOTH_GEO = new THREE.ConeGeometry(0.012, 0.035, 4)

interface Shown {
  kind: ArenaTrap['kind']
  root: THREE.Group
  /** Le cercle de sa portée, au sol, et sa matière (à la couleur du camp). */
  mark: THREE.Mesh
  /** La fleur : sa tige et ses deux mâchoires ; la flaque : sa nappe et ses flammèches. */
  head?: THREE.Group
  jaws?: [THREE.Object3D, THREE.Object3D]
  pool?: THREE.Mesh
  flames?: THREE.Mesh[]
  age: number
  left: number
  /** Depuis quand elle a mordu (s). */
  bite: number
  /** Elle n'est plus dans ce que dit le relais : elle fane, ou s'éteint. */
  gone: number
  phase: number
}

/** Une fleur carnivore : feuilles au sol, tige, et une tête à deux mâchoires dentées, ouvertes. */
function flowerModel(): { root: THREE.Group; head: THREE.Group; jaws: [THREE.Object3D, THREE.Object3D] } {
  const root = new THREE.Group()
  for (let i = 0; i < 4; i++) {
    const leaf = new THREE.Mesh(LEAF_GEO, LEAF)
    leaf.scale.set(1, 0.18, 0.45)
    const a = (i / 4) * Math.PI * 2 + 0.4
    leaf.position.set(Math.cos(a) * 0.08, 0.02, Math.sin(a) * 0.08)
    leaf.rotation.y = -a
    root.add(leaf)
  }
  const stem = new THREE.Mesh(STEM_GEO, STEM)
  root.add(stem)
  const head = new THREE.Group()
  head.position.y = 0.3
  root.add(head)
  const jaw = (up: boolean) => {
    const pivot = new THREE.Group()
    const shell = new THREE.Mesh(SHELL_GEO[up ? 0 : 1], JAW)
    shell.scale.set(1, 0.7, 1)
    shell.position.z = 0.09
    const lining = new THREE.Mesh(LINING_GEO[up ? 0 : 1], INSIDE)
    lining.position.set(0, up ? 0.001 : -0.001, 0.09)
    pivot.add(shell, lining)
    for (let i = 0; i < 7; i++) {
      const a = (i / 6) * Math.PI - Math.PI
      const tooth = new THREE.Mesh(TOOTH_GEO, TOOTH)
      tooth.position.set(Math.cos(a) * 0.1, up ? -0.012 : 0.012, 0.09 - Math.sin(a) * 0.1)
      if (up) tooth.rotation.x = Math.PI
      pivot.add(tooth)
    }
    head.add(pivot)
    return pivot
  }
  return { root, head, jaws: [jaw(true), jaw(false)] }
}

export class Traps {
  readonly group = new THREE.Group()
  private readonly shown = new Map<number, Shown>()
  private readonly fireMat = new THREE.MeshBasicMaterial({ color: '#b6ff3a', transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending })
  private readonly flameMat = new THREE.MeshBasicMaterial({ color: '#ffd23c', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending })

  /** @param tint la couleur d'un camp (0 ou 1), pour le cercle de portée */
  constructor(private tint: (team: number) => string) {}

  /** Ce que le relais dit des pièges sur le terrain : ceux qui arrivent poussent, ceux qui manquent fanent. */
  sync(traps: ArenaTrap[]) {
    const seen = new Set<number>()
    for (const t of traps) {
      seen.add(t.id)
      let s = this.shown.get(t.id)
      if (!s) {
        s = this.make(t)
        this.shown.set(t.id, s)
        this.group.add(s.root)
      }
      s.left = t.left
      ;(s.mark.material as THREE.MeshBasicMaterial).color.set(this.tint(t.team))
    }
    for (const [id, s] of this.shown) if (!seen.has(id) && !s.gone) s.gone = 0.001
  }

  /** La fleur `id` vient de mordre : ses mâchoires claquent. Où elle est (repère de l'arène) ; null si ce n'est pas une fleur. */
  bite(id: number): THREE.Vector3 | null {
    const s = this.shown.get(id)
    if (s?.kind !== 'flower') return null
    s.bite = 0
    return s.root.position
  }

  private make(t: ArenaTrap): Shown {
    const root = new THREE.Group()
    root.position.set(t.x, 0, t.z)
    const radius = t.kind === 'flower' ? FLOWER.radius : FIRE.radius
    const mark = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: this.tint(t.team), transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }))
    mark.scale.setScalar(radius + ARENA_RULES.body.r)
    mark.position.y = 0.03
    mark.renderOrder = 2
    root.add(mark)
    const s: Shown = { kind: t.kind, root, mark, age: 0, left: t.left, bite: Infinity, gone: 0, phase: Math.random() * 10 }
    if (t.kind === 'flower') {
      const f = flowerModel()
      root.add(f.root)
      Object.assign(s, { head: f.head, jaws: f.jaws })
      s.head!.parent!.scale.setScalar(0.01)
    } else {
      const pool = new THREE.Mesh(disc, this.fireMat)
      pool.scale.setScalar(radius * 0.92)
      pool.position.y = 0.025
      pool.renderOrder = 1
      root.add(pool)
      const flames: THREE.Mesh[] = []
      for (let i = 0; i < 9; i++) {
        const m = new THREE.Mesh(flame, this.flameMat)
        const a = (i / 9) * Math.PI * 2 + Math.random(), r = Math.sqrt(Math.random()) * radius * 0.75
        m.position.set(Math.cos(a) * r, 0.02, Math.sin(a) * r)
        m.userData.phase = Math.random() * 10
        root.add(m)
        flames.push(m)
      }
      Object.assign(s, { pool, flames })
    }
    return s
  }

  update(dt: number) {
    for (const [id, s] of this.shown) {
      s.age += dt
      s.bite += dt
      if (s.gone) s.gone += dt
      // Ses dernières secondes : il faiblit ; disparu de ce que dit le relais : il s'éteint en un instant.
      const fade = s.gone ? Math.max(0, 1 - s.gone / 0.35) : Math.min(1, s.left / 0.6 + 0.2)
      if (s.gone && fade <= 0) {
        s.root.removeFromParent()
        ;(s.mark.material as THREE.Material).dispose()
        this.shown.delete(id)
        continue
      }
      ;(s.mark.material as THREE.MeshBasicMaterial).opacity = 0.7 * Math.min(1, fade + 0.2)
      const t = s.age + s.phase
      if (s.kind === 'flower') {
        // Elle sort de terre, se balance, et claque des mâchoires quand elle mord.
        const grow = Math.min(1, s.age / FLOWER.grow)
        const plant = s.head!.parent!
        plant.scale.setScalar(Math.max(0.01, (grow < 1 ? 1 - (1 - grow) ** 3 : 1) * fade))
        s.head!.rotation.set(Math.sin(t * 2.1) * 0.15, Math.sin(t * 0.8) * 0.6, Math.sin(t * 1.6) * 0.12)
        const snap = s.bite < 0.25 ? Math.abs(Math.sin((s.bite / 0.25) * Math.PI)) : 0
        const open = 0.6 + Math.sin(t * 3) * 0.08 - snap * 0.6
        s.jaws![0].rotation.x = -open
        s.jaws![1].rotation.x = open
      } else {
        s.pool!.scale.setScalar(FIRE.radius * 0.92 * Math.min(1, s.age / 0.15, fade) * (0.97 + Math.sin(t * 9) * 0.03))
        for (const m of s.flames!) {
          const p = (m.userData.phase as number) + s.age
          m.scale.set(1, (0.6 + Math.abs(Math.sin(p * 7)) * 0.9) * fade, 1)
          m.rotation.y = p * 3
        }
      }
    }
  }

  clear() {
    for (const s of this.shown.values()) {
      s.root.removeFromParent()
      ;(s.mark.material as THREE.Material).dispose()
    }
    this.shown.clear()
  }
}
