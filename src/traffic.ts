import * as THREE from 'three'
import { cobraGeometry, wedgeGeometry } from './furniture/cobra'
import { renderQuality } from './quality'
import type { HullSides } from './systems'

/*
 * Le trafic autour du vaisseau : des vaisseaux d'Elite qui croisent le long de la coque, de chaque
 * bord, à hauteur du pont. La vue isométrique reste serrée (cf. ZOOM_MAX dans camera.ts) : loin
 * sous la coque, on ne les verrait pas ; ils passent donc tout près, mais toujours au large, jamais
 * au-dessus des pièces. Le vaisseau file vers l'est (cf. starfield.ts), eux aussi : les plus rapides
 * le doublent, il rattrape les plus lents.
 */

/** Demi-longueur du couloir, de part et d'autre du point que regarde la caméra : au-delà du cadre le plus large. */
const SPAN = 30

interface Model {
  geometry: THREE.BufferGeometry
  color: string
  /** Envergure en tuiles (la géométrie fait deux unités de large). */
  size: number
  /** Tuyères : position (x, y, z) et largeur, dans le repère de la géométrie (nez à +z). */
  engines: [number, number, number, number][]
  /** Verrière : position (x, y, z), largeur et longueur. */
  cockpit: [number, number, number, number, number]
  /** Les gros passent plus au large, et plus rarement. */
  heavy?: boolean
}

function models(): Model[] {
  return [
    // Cobra Mk III : l'hexagone plat de 1984.
    { geometry: cobraGeometry(), color: '#6f7a8c', size: 1.25, engines: [[-0.2, 0.02, -0.45, 0.22], [0.2, 0.02, -0.45, 0.22]], cockpit: [0, 0.1, 0.32, 0.2, 0.3] },
    // Sidewinder : un coin trapu.
    {
      geometry: wedgeGeometry([[-0.35, 0, 0.6], [0.35, 0, 0.6], [1, 0, -0.45], [-1, 0, -0.45]], [0, 0.26, -0.2], [0, -0.12, -0.1]),
      color: '#9c8f76', size: 0.85, engines: [[0, 0.03, -0.46, 0.5]], cockpit: [0, 0.13, 0.22, 0.26, 0.3],
    },
    // Viper : une flèche de chasse.
    {
      geometry: wedgeGeometry([[-0.14, 0, 1.2], [0.14, 0, 1.2], [1, -0.02, -0.5], [0.34, 0, -0.62], [-0.34, 0, -0.62], [-1, -0.02, -0.5]], [0, 0.2, -0.25], [0, -0.12, -0.1]),
      color: '#5f7396', size: 1, engines: [[-0.17, 0.02, -0.63, 0.2], [0.17, 0.02, -0.63, 0.2]], cockpit: [0, 0.1, 0.5, 0.12, 0.34],
    },
    // Anaconda : la longue dague des grands convois.
    {
      geometry: wedgeGeometry([[-0.1, 0, 2.9], [0.1, 0, 2.9], [0.62, 0, -0.5], [1, 0.02, -1.5], [0.5, 0, -1.9], [-0.5, 0, -1.9], [-1, 0.02, -1.5], [-0.62, 0, -0.5]], [0, 0.46, -1.1], [0, -0.36, -0.7]),
      color: '#8c877c', size: 1.6, engines: [[-0.28, 0.03, -1.92, 0.3], [0.28, 0.03, -1.92, 0.3], [0, 0.12, -1.92, 0.2]], cockpit: [0, 0.22, 0.9, 0.16, 0.5], heavy: true,
    },
  ]
}

interface Ship {
  root: THREE.Group
  /** Vitesse par rapport au vaisseau (tuiles/s) : positive, il nous double ; négative, on le rattrape. */
  speed: number
  /** Écart au bord de coque (tuiles), et côté (-1 : bâbord, au nord ; 1 : tribord, au sud). */
  off: number
  side: 1 | -1
  /** Hauteur par rapport au pont, et phase du roulis. */
  height: number
  phase: number
}

export class Traffic {
  readonly group = new THREE.Group()
  private readonly models = models()
  private readonly hulls: THREE.MeshLambertMaterial[]
  private readonly flame = new THREE.MeshBasicMaterial({ color: '#9fdcff' })
  private readonly glass = new THREE.MeshBasicMaterial({ color: '#16283d' })
  private readonly glassGeometry = new THREE.BoxGeometry(1, 0.08, 1)
  private readonly wake: THREE.MeshBasicMaterial
  private readonly wakeGeometry: THREE.BufferGeometry
  private readonly flameGeometry = new THREE.BoxGeometry(1, 0.07, 0.06)
  private ships: Ship[] = []
  private next = 0
  private hidden = false
  private time = 0
  private filled = false

  constructor() {
    this.hulls = this.models.map((m) => new THREE.MeshLambertMaterial({ color: m.color, flatShading: true, emissive: m.color, emissiveIntensity: 0.08 }))
    // Sillage des tuyères : un ruban qui s'éteint vers l'arrière.
    const wake = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5)
    const fade = new Float32Array([0, 0, 0, 0, 0, 0, 0.2, 0.42, 0.6, 0.2, 0.42, 0.6])
    wake.setAttribute('color', new THREE.BufferAttribute(fade, 3))
    this.wakeGeometry = wake
    this.wake = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
  }

  /** Le trafic disparaît pendant la traversée d'un saut FSD : à l'arrivée, d'autres vaisseaux. */
  hide(on: boolean) {
    this.hidden = on
    if (on) this.clear()
  }

  private clear() {
    for (const s of this.ships) s.root.removeFromParent()
    this.ships = []
    this.filled = false
  }

  private spawn(centerX: number, anywhere: boolean) {
    const heavy = Math.random() < 0.15
    const pool = this.models.filter((m) => !!m.heavy === heavy)
    const model = pool[Math.floor(Math.random() * pool.length)]
    const root = new THREE.Group()
    const hull = new THREE.Mesh(model.geometry, this.hulls[this.models.indexOf(model)])
    const [cx, cy, cz, cw, cl] = model.cockpit
    const cockpit = new THREE.Mesh(this.glassGeometry, this.glass)
    cockpit.position.set(cx, cy, cz)
    cockpit.scale.set(cw, 1, cl)
    root.add(hull, cockpit)
    for (const [x, y, z, w] of model.engines) {
      const flame = new THREE.Mesh(this.flameGeometry, this.flame)
      flame.position.set(x, y, z)
      flame.scale.x = w
      const wake = new THREE.Mesh(this.wakeGeometry, this.wake)
      wake.position.set(x, y, z)
      wake.scale.set(w * 0.8, 1, heavy ? 1.3 : 0.8)
      root.add(flame, wake)
    }
    root.scale.setScalar(model.size)
    // Nez (+z de la géométrie) vers l'est, comme le vaisseau.
    root.rotation.y = Math.PI / 2
    const slow = Math.random() < 0.35
    const speed = (slow ? -1 : 1) * (heavy ? 0.9 + Math.random() * 0.8 : 1.6 + Math.random() * 2.6)
    const ship: Ship = {
      root,
      speed,
      off: heavy ? 4.5 + Math.random() * 2.5 : 1.8 + Math.random() * 3.2,
      side: Math.random() < 0.5 ? -1 : 1,
      height: -0.3 - Math.random() * 1.2,
      phase: Math.random() * Math.PI * 2,
    }
    root.position.x = anywhere ? centerX + (Math.random() * 2 - 1) * SPAN * 0.8 : centerX - Math.sign(speed) * SPAN
    this.group.add(root)
    this.ships.push(ship)
  }

  /**
   * @param deckY altitude du pont affiché
   * @param sides bords de la coque sous ce pont
   * @param target point que regarde la caméra
   */
  update(dt: number, deckY: number, sides: HullSides, target: THREE.Vector3) {
    this.group.visible = !this.hidden
    if (this.hidden) return
    this.time += dt
    const wanted = renderQuality.light ? 1 : 3
    if (!this.filled) {
      this.filled = true
      for (let i = 0; i < wanted - 1; i++) this.spawn(target.x, true)
    }
    if (this.ships.length < wanted && (this.next -= dt) <= 0) {
      this.next = 2 + Math.random() * 5
      this.spawn(target.x, false)
    }
    for (const s of this.ships) {
      const p = s.root.position
      p.x += s.speed * dt
      p.y = deckY + s.height + Math.sin(this.time * 0.7 + s.phase) * 0.08
      p.z = s.side < 0 ? sides.north - s.off : sides.south + s.off
      s.root.rotation.z = Math.sin(this.time * 0.5 + s.phase) * 0.12
    }
    const gone = this.ships.filter((s) => Math.abs(s.root.position.x - target.x) > SPAN + 4)
    for (const s of gone) s.root.removeFromParent()
    if (gone.length) this.ships = this.ships.filter((s) => !gone.includes(s))
  }
}
