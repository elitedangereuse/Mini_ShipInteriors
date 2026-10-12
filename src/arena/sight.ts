import * as THREE from 'three'
import { ARENA_RULES, arenaGround, castArena, type ArenaZone, type CharacterWeapon } from '../../shared/arena.js'

/*
 * Le cône de visée de l'arène, peint au sol devant le joueur, à la façon de Brawl Stars : il montre
 * jusqu'où porte l'arme de son personnage (cf. `range` dans ARENA_CHARACTERS) et ce qu'elle couvre.
 * - Un couloir étroit pour une arme précise ; il s'évase de la dispersion de l'arme (la gerbe du
 *   fusil à pompe, la rafale qui s'ouvre de la mitraillette, la marche).
 * - Il s'arrête sur les cloisons et les conteneurs, rayon par rayon, comme les balles : ce qui est
 *   peint est ce qu'on peut toucher. Les combattants ne l'arrêtent pas.
 * - Au bout, pour le lance-tomates de Marcel, le disque de son explosion.
 * - Pour un objet lancé (la graine de Capucine, le cocktail de Jacques), qui passe par-dessus les
 *   obstacles : un couloir droit jusqu'au point visé, et le disque de ce qu'il y couvrira (la
 *   portée des mâchoires d'une fleur, l'éclat et la flaque d'un cocktail).
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
  /** L'explosion d'une tomate, au bout du couloir, ou là où retombe un objet lancé : un disque et son bord. */
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
   * @param from les pieds du tireur (repère de l'arène ; `y` : la hauteur de son sol)
   * @param dir où il vise, au sol (longueur 1)
   * @param spread demi-angle de dispersion du moment (radians)
   * @param ready le coup peut partir
   * @param rise la pente du tir, sur un sol à plusieurs hauteurs (cf. RangeGame.pitch)
   */
  place(zone: ArenaZone, w: CharacterWeapon, from: { x: number; y: number; z: number }, dir: { x: number; z: number }, spread: number, ready: boolean, throwTo = 0, rise = 0) {
    // Une balle part d'un peu devant le tireur (cf. RangeGame.update), et vole sa portée ; un objet
    // lancé va jusqu'au point visé, par-dessus tout.
    const reach = w.lob ? Math.max(START, throwTo) : START + w.range
    if (w.lob) rise = 0
    const { p, d } = this
    // Peint sur son sol ; les rayons montent ou descendent comme le tir.
    const y = from.y + Y, slope = Math.hypot(1, rise)
    p.y = from.y + ARENA_RULES.aim
    d.y = rise / slope
    let centre = reach
    for (let i = 0; i <= RAYS; i++) {
      const k = (i / RAYS) * 2 - 1
      const a = k * spread, cos = Math.cos(a), sin = Math.sin(a)
      d.x = (dir.x * cos + dir.z * sin) / slope
      d.z = (dir.z * cos - dir.x * sin) / slope
      // Le couloir : chaque rayon part d'un peu à côté du tireur.
      p.x = from.x + dir.z * k * LANE
      p.z = from.z - dir.x * k * LANE
      let t = w.lob ? reach : castArena(zone, p, d, reach, NOBODY).t
      // Parti d'un obstacle (le tireur le frôle) : le rayon repart de ses pieds.
      if (t <= 0) {
        p.x = from.x
        p.z = from.z
        t = castArena(zone, p, d, reach, NOBODY).t
      }
      const near = Math.min(START, t), n = i * 6
      this.points[n] = p.x + d.x * near
      this.points[n + 1] = y
      this.points[n + 2] = p.z + d.z * near
      this.points[n + 3] = p.x + d.x * t
      this.points[n + 4] = y
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
    // Qui se tient dans ce disque prend le souffle (cf. blastDamage), la morsure ou la brûlure ; un
    // objet lancé retombe sur le sol du point visé (le haut d'un plan à deux hauteurs, peut-être).
    const area = Math.max(w.blast, w.flower?.radius ?? 0, w.fire?.radius ?? 0)
    this.blast.visible = area > 0
    if (area) {
      const end = { x: from.x + (dir.x * centre) / slope, z: from.z + (dir.z * centre) / slope }
      this.blast.position.set(end.x, (w.lob ? arenaGround(zone, end) + Y : y) + 0.002, end.z)
      this.blast.scale.setScalar(area + ARENA_RULES.body.r)
    }
    const color = ready ? READY : BLOCKED
    for (const m of this.materials) m.color.copy(color)
  }
}
