import * as THREE from 'three'
import { ARENA_RULES, arenaGround, castArena, type ArenaZone, type CharacterWeapon } from '../../shared/arena.js'
import { HEAL } from './palette'

/*
 * Le cône de visée de l'arène, peint au sol devant le joueur, à la façon de Brawl Stars : il montre
 * le tir que le relais fera partir, pas une approximation (cf. ArenaGun.sightCone) :
 * - il part d'où part le tir (la main du tireur, ou ses pieds s'il colle à un obstacle, cf.
 *   shotOrigin), dans la direction exacte du curseur ou du stick, recul compris ;
 * - un couloir étroit pour une arme précise ; il s'évase de la dispersion du moment (la rafale qui
 *   s'ouvre de la mitraillette, la marche) ;
 * - il s'arrête sur les cloisons et les conteneurs, rayon par rayon, comme les balles, et au bout
 *   de la portée de l'arme : ce qui est peint est ce qu'on peut toucher. Les combattants ne
 *   l'arrêtent pas ;
 * - au bout, pour le lance-tomates de Marcel, le disque de son explosion ;
 * - pour un objet lancé (la graine de Capucine, le cocktail de Jacques), qui passe par-dessus les
 *   obstacles : sa cloche en pointillés, de la main au point de chute, et au sol le disque de ce
 *   qu'il y couvrira (les mâchoires d'une fleur, l'éclat et la flaque d'un cocktail), une croix au
 *   point exact. En vue subjective aussi, où le reste du cône s'efface derrière la mire.
 * Blanc quand le coup peut partir, gris sinon (chargeur vide ou en cours de changement, avant le
 * coup d'envoi) ; vert d'eau quand la seringue de Betty soignera le coéquipier qu'elle vise.
 */

/** Rayons du cône, d'un bord à l'autre. */
const RAYS = 12
/** Demi-largeur du couloir au départ (tuiles). */
const LANE = 0.13
/** Hauteur de la peinture au-dessus du sol : par-dessus le damier et les bases, sous les anneaux. */
const Y = 0.034
/** Points de la cloche d'un objet lancé. */
const ARC = 22
const COLORS = { ready: new THREE.Color('#ffffff'), blocked: new THREE.Color('#9aa3b0'), heal: new THREE.Color(HEAL) }
const OPACITY = { ready: 1, blocked: 0.55, heal: 1 }
const NOBODY: never[] = []

export type SightState = keyof typeof COLORS

/** Ce que le cône montre, à chaque image. */
export interface Aim {
  /** D'où part le tir (repère de l'arène) ; `y` : la hauteur de son sol. */
  from: { x: number; y: number; z: number }
  /** Où il vise, au sol (longueur 1), recul compris. */
  dir: { x: number; z: number }
  /** Demi-angle de dispersion du moment (radians). */
  spread: number
  /** La pente du tir, sur un sol à plusieurs hauteurs (cf. RangeGame.pitch). */
  rise: number
  state: SightState
  /**
   * Un objet lancé : de la main (`hand`) au point de chute (`to`), en cloche de hauteur `peak` ;
   * `barren` : il y retombe dans la base adverse, où ni fleur ni flaque ne prend (son disque est gris).
   */
  lob?: { hand: THREE.Vector3; to: { x: number; z: number }; peak: number; barren?: boolean }
  /** Vue subjective : seule la cloche d'un objet lancé se montre. */
  fps?: boolean
}

const flat = (opacity: number) => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -5, toneMapped: false })
const stroke = (opacity: number) => new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity, depthWrite: false, toneMapped: false })

/** Un point rond, pour la cloche (dessiné une fois). */
function dotTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 32
  const g = c.getContext('2d')!
  g.fillStyle = '#05070b'
  g.beginPath()
  g.arc(16, 16, 15, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.arc(16, 16, 10, 0, Math.PI * 2)
  g.fill()
  return new THREE.CanvasTexture(c)
}

export class AimSight {
  readonly root = new THREE.Group()
  private readonly points = new Float32Array((RAYS + 1) * 2 * 3)
  private readonly outline = new Float32Array((RAYS + 1) * 2 * 3)
  private readonly fill: THREE.Mesh
  private readonly edge: THREE.LineLoop
  /** L'explosion d'une tomate, au bout du couloir, ou là où retombe un objet lancé : un disque, son bord, une croix. */
  private readonly blast = new THREE.Group()
  private readonly cross: THREE.LineSegments
  /** La cloche d'un objet lancé, en pointillés. */
  private readonly arc: THREE.Points
  private readonly arcPoints = new Float32Array(ARC * 3)
  private readonly materials: { m: THREE.MeshBasicMaterial | THREE.LineBasicMaterial | THREE.PointsMaterial; base: number }[]
  private readonly p = { x: 0, y: ARENA_RULES.aim, z: 0 }
  private readonly d = { x: 0, y: 0, z: 0 }
  /** Où s'arrête la ligne du milieu (repère de l'arène) : là où l'on touchera, sans compter les combattants. */
  readonly end = new THREE.Vector3()

  constructor() {
    const cone = new THREE.BufferGeometry()
    cone.setAttribute('position', new THREE.BufferAttribute(this.points, 3))
    const index: number[] = []
    // Deux sommets par rayon (départ, bout) ; un quadrilatère entre deux rayons voisins.
    for (let i = 0; i < RAYS; i++) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
    cone.setIndex(index)
    const line = new THREE.BufferGeometry()
    line.setAttribute('position', new THREE.BufferAttribute(this.outline, 3))
    const fill = flat(0.38), edge = stroke(1), disc = flat(0.3), rim = stroke(1), mark = stroke(1)
    this.fill = new THREE.Mesh(cone, fill)
    this.edge = new THREE.LineLoop(line, edge)
    const circle = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2)
    const ring = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 40 }, (_, i) => new THREE.Vector3(Math.cos((i / 40) * Math.PI * 2), 0, Math.sin((i / 40) * Math.PI * 2))))
    this.cross = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.12, 0, 0), new THREE.Vector3(0.12, 0, 0), new THREE.Vector3(0, 0, -0.12), new THREE.Vector3(0, 0, 0.12),
    ]), mark)
    this.blast.add(new THREE.Mesh(circle, disc), new THREE.LineLoop(ring, rim))
    const arcGeometry = new THREE.BufferGeometry()
    arcGeometry.setAttribute('position', new THREE.BufferAttribute(this.arcPoints, 3))
    const dots = new THREE.PointsMaterial({ map: dotTexture(), size: 9, sizeAttenuation: false, transparent: true, depthWrite: false, alphaTest: 0.1, toneMapped: false })
    this.arc = new THREE.Points(arcGeometry, dots)
    this.materials = [{ m: fill, base: 0.38 }, { m: edge, base: 1 }, { m: disc, base: 0.3 }, { m: rim, base: 1 }, { m: mark, base: 1 }, { m: dots, base: 1 }]
    this.root.add(this.fill, this.edge, this.blast, this.cross, this.arc)
    for (const o of [this.fill, this.edge, this.cross, this.arc, ...this.blast.children]) {
      // Sa forme change à chaque image : pas de tri par boîte englobante.
      o.frustumCulled = false
      o.renderOrder = 3
    }
    this.root.visible = false
  }

  /** Peint le cône de l'arme `w`, tel que le décrit `a`. */
  place(zone: ArenaZone, w: CharacterWeapon, a: Aim) {
    const lob = !!w.lob && !!a.lob
    // Un objet lancé : sa cloche, son point de chute ; ni couloir ni bord.
    this.fill.visible = this.edge.visible = !lob && !a.fps
    this.arc.visible = lob
    this.cross.visible = lob
    let centre = 0
    if (!lob) {
      if (!a.fps) centre = this.lane(zone, w, a)
    } else {
      const { hand, to, peak } = a.lob!
      const ground = arenaGround(zone, to)
      // La même cloche que l'objet suivra (cf. ArenaGun.throwLob).
      for (let i = 0; i < ARC; i++) {
        const u = (i + 1) / (ARC + 1)
        this.arcPoints[i * 3] = hand.x + (to.x - hand.x) * u
        this.arcPoints[i * 3 + 1] = hand.y + (ground + 0.06 - hand.y) * u + peak * 4 * u * (1 - u)
        this.arcPoints[i * 3 + 2] = hand.z + (to.z - hand.z) * u
      }
      this.arc.geometry.attributes.position.needsUpdate = true
      this.end.set(to.x, ground, to.z)
      this.cross.position.set(to.x, ground + Y + 0.004, to.z)
    }
    // Qui se tient dans ce disque prend le souffle (cf. blastDamage), la morsure ou la brûlure.
    const area = Math.max(w.blast, w.flower?.radius ?? 0, w.fire?.radius ?? 0)
    this.blast.visible = area > 0 && (lob || !a.fps)
    if (this.blast.visible) {
      if (!lob) this.end.set(a.from.x + a.dir.x * centre, a.from.y, a.from.z + a.dir.z * centre)
      this.blast.position.set(this.end.x, (lob ? this.end.y : a.from.y) + Y + 0.002, this.end.z)
      this.blast.scale.setScalar(area + ARENA_RULES.body.r)
    }
    const color = COLORS[a.state], opacity = OPACITY[a.state]
    for (const { m, base } of this.materials) {
      m.color.copy(color)
      m.opacity = base * opacity
    }
    if (lob && a.lob!.barren) {
      // La fleur, la flaque ne prendraient pas là : le disque grisé (l'éclat du cocktail, lui, porte encore).
      for (const { m, base } of this.materials.slice(2, 4)) {
        m.color.copy(COLORS.blocked)
        m.opacity = base * OPACITY.blocked
      }
    }
  }

  /** Le couloir d'une balle, rayon par rayon ; renvoie où s'arrête celui du milieu (tuiles, au sol). */
  private lane(zone: ArenaZone, w: CharacterWeapon, a: Aim): number {
    const { p, d } = this
    const reach = w.range
    // Peint sur son sol ; les rayons montent ou descendent comme le tir.
    const y = a.from.y + Y, slope = Math.hypot(1, a.rise)
    p.y = a.from.y + ARENA_RULES.aim
    d.y = a.rise / slope
    let centre = reach
    for (let i = 0; i <= RAYS; i++) {
      const k = (i / RAYS) * 2 - 1
      const an = k * a.spread, cos = Math.cos(an), sin = Math.sin(an)
      d.x = (a.dir.x * cos + a.dir.z * sin) / slope
      d.z = (a.dir.z * cos - a.dir.x * sin) / slope
      // Le couloir : chaque rayon part d'un peu à côté du départ du tir.
      p.x = a.from.x + a.dir.z * k * LANE
      p.z = a.from.z - a.dir.x * k * LANE
      let t = castArena(zone, p, d, reach, NOBODY).t
      // Parti d'un obstacle (le tireur le frôle) : le rayon repart du départ du tir.
      if (t <= 0) {
        p.x = a.from.x
        p.z = a.from.z
        t = castArena(zone, p, d, reach, NOBODY).t
      }
      const n = i * 6
      this.points[n] = p.x
      this.points[n + 1] = y
      this.points[n + 2] = p.z
      this.points[n + 3] = p.x + d.x * t
      this.points[n + 4] = y
      this.points[n + 5] = p.z + d.z * t
      // Au sol, la distance parcourue (la pente l'allonge un peu).
      if (i === RAYS / 2) centre = t / slope
    }
    // Le contour : les départs dans un sens, les bouts dans l'autre.
    for (let i = 0; i <= RAYS; i++) {
      const n = i * 6, a0 = i * 3, b = (2 * RAYS + 1 - i) * 3
      for (let c = 0; c < 3; c++) {
        this.outline[a0 + c] = this.points[n + c]
        this.outline[b + c] = this.points[n + 3 + c]
      }
    }
    this.fill.geometry.attributes.position.needsUpdate = true
    this.edge.geometry.attributes.position.needsUpdate = true
    this.end.set(a.from.x + a.dir.x * centre, a.from.y, a.from.z + a.dir.z * centre)
    return centre
  }
}
