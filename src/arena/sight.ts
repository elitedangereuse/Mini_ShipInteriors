import * as THREE from 'three'
import type { Weapon } from '../range-weapons'
import { ARENA_RULES, castArena, type ArenaZone } from '../../shared/arena.js'

/*
 * Le cône de visée de l'arène, peint au sol devant le joueur, à la façon de Brawl Stars : il montre
 * jusqu'où porte l'arme (cf. `range` dans shared/weapons.js) et ce qu'elle couvre.
 * - Un couloir étroit pour une arme précise ; il s'évase de la dispersion de l'arme (la gerbe du
 *   fusil à pompe, la rafale qui s'ouvre de la mitraillette, la marche).
 * - Il s'arrête sur les cloisons et les conteneurs, rayon par rayon, comme les balles : ce qui est
 *   peint est ce qu'on peut toucher. Les combattants ne l'arrêtent pas.
 * - Au bout, pour le lance-plasma, le disque de son explosion.
 * Blanc quand le coup peut partir, rouge sinon (chargeur vide ou en cours de changement, avant le
 * coup d'envoi).
 */

/** Rayons du cône, d'un bord à l'autre. */
const RAYS = 12
/** Demi-largeur du couloir au départ (tuiles), et distance du joueur où il commence. */
const LANE = 0.13
const START = 0.3
/** Hauteur de la peinture au-dessus du sol : par-dessus le damier et les bases, sous les anneaux. */
const Y = 0.034
const READY = new THREE.Color('#ffffff')
const BLOCKED = new THREE.Color('#ff5a4a')
const NOBODY: never[] = []

const flat = (opacity: number) => new THREE.MeshBasicMaterial({ color: READY, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -5 })
const stroke = (opacity: number) => new THREE.LineBasicMaterial({ color: READY, transparent: true, opacity, depthWrite: false })

export class AimSight {
  readonly root = new THREE.Group()
  private readonly points = new Float32Array((RAYS + 1) * 2 * 3)
  private readonly outline = new Float32Array((RAYS + 1) * 2 * 3)
  private readonly fill: THREE.Mesh
  private readonly edge: THREE.LineLoop
  /** L'explosion du lance-plasma, au bout du couloir : un disque et son bord. */
  private readonly blast = new THREE.Group()
  private readonly materials: (THREE.MeshBasicMaterial | THREE.LineBasicMaterial)[]
  private readonly p = { x: 0, y: ARENA_RULES.aim, z: 0 }
  private readonly d = { x: 0, y: 0, z: 0 }

  constructor() {
    const cone = new THREE.BufferGeometry()
    cone.setAttribute('position', new THREE.BufferAttribute(this.points, 3))
    const index: number[] = []
    // Deux sommets par rayon (départ, bout) ; un quadrilatère entre deux rayons voisins.
    for (let i = 0; i < RAYS; i++) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
    cone.setIndex(index)
    const line = new THREE.BufferGeometry()
    line.setAttribute('position', new THREE.BufferAttribute(this.outline, 3))
    const fill = flat(0.4), edge = stroke(1), disc = flat(0.32), rim = stroke(1)
    this.materials = [fill, edge, disc, rim]
    this.fill = new THREE.Mesh(cone, fill)
    this.edge = new THREE.LineLoop(line, edge)
    const circle = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2)
    const ring = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 40 }, (_, i) => new THREE.Vector3(Math.cos((i / 40) * Math.PI * 2), 0, Math.sin((i / 40) * Math.PI * 2))))
    this.blast.add(new THREE.Mesh(circle, disc), new THREE.LineLoop(ring, rim))
    this.root.add(this.fill, this.edge, this.blast)
    for (const o of [this.fill, this.edge, ...this.blast.children]) {
      // Sa forme change à chaque image : pas de tri par boîte englobante.
      o.frustumCulled = false
      o.renderOrder = 3
    }
    this.root.visible = false
  }

  /**
   * Peint le cône de l'arme `w`.
   * @param from les pieds du tireur (repère de l'arène)
   * @param dir où il vise, au sol (longueur 1)
   * @param spread demi-angle de dispersion du moment (radians)
   * @param ready le coup peut partir
   */
  place(zone: ArenaZone, w: Weapon, from: { x: number; z: number }, dir: { x: number; z: number }, spread: number, ready: boolean) {
    // Une balle part d'un peu devant le tireur (cf. RangeGame.update), et vole sa portée.
    const reach = START + w.range
    const { p, d } = this
    let centre = reach
    for (let i = 0; i <= RAYS; i++) {
      const k = (i / RAYS) * 2 - 1
      const a = k * spread, cos = Math.cos(a), sin = Math.sin(a)
      d.x = dir.x * cos + dir.z * sin
      d.z = dir.z * cos - dir.x * sin
      // Le couloir : chaque rayon part d'un peu à côté du tireur.
      p.x = from.x + dir.z * k * LANE
      p.z = from.z - dir.x * k * LANE
      let t = castArena(zone, p, d, reach, NOBODY).t
      // Parti d'un obstacle (le tireur le frôle) : le rayon repart de ses pieds.
      if (t <= 0) {
        p.x = from.x
        p.z = from.z
        t = castArena(zone, p, d, reach, NOBODY).t
      }
      const near = Math.min(START, t), n = i * 6
      this.points[n] = p.x + d.x * near
      this.points[n + 1] = Y
      this.points[n + 2] = p.z + d.z * near
      this.points[n + 3] = p.x + d.x * t
      this.points[n + 4] = Y
      this.points[n + 5] = p.z + d.z * t
      if (i === RAYS / 2) centre = t
    }
    // Le contour : les départs dans un sens, les bouts dans l'autre.
    for (let i = 0; i <= RAYS; i++) {
      const n = i * 6, a = i * 3, b = (2 * RAYS + 1 - i) * 3
      for (let c = 0; c < 3; c++) {
        this.outline[a + c] = this.points[n + c]
        this.outline[b + c] = this.points[n + 3 + c]
      }
    }
    this.fill.geometry.attributes.position.needsUpdate = true
    this.edge.geometry.attributes.position.needsUpdate = true
    this.blast.visible = w.blast > 0
    if (w.blast) {
      // Qui se tient dans ce disque prend le souffle (cf. blastDamage).
      this.blast.position.set(from.x + dir.x * centre, Y + 0.002, from.z + dir.z * centre)
      this.blast.scale.setScalar(w.blast + ARENA_RULES.body.r)
    }
    const color = ready ? READY : BLOCKED
    for (const m of this.materials) m.color.copy(color)
  }
}
