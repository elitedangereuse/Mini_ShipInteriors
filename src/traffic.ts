import * as THREE from 'three'
import { rig } from './assets'
import { renderQuality } from './quality'

/*
 * Le trafic autour du vaisseau : des appareils (les « craft » du Space Kit de Kenney) qui croisent
 * le long de la coque, de chaque bord, à hauteur du pont. La vue isométrique reste serrée (cf.
 * ZOOM_MAX dans camera.ts) : loin sous la coque, on ne les verrait pas ; ils passent donc tout
 * près, mais toujours au large, jamais au-dessus des pièces.
 *
 * Chacun avance, nez devant : ceux qui vont vers l'est (comme le vaisseau, cf. starfield.ts) le
 * doublent, les autres le croisent. Aucun ne recule à l'écran. Les deux sens ont leurs couloirs,
 * les uns au ras de la coque, les autres plus au large : ils ne se rentrent pas dedans.
 */

/** Bords de la coque sous le pont affiché (z du bord bâbord, au nord, et du bord tribord, au sud). */
export interface HullSides {
  north: number
  south: number
}

/** Demi-longueur du couloir, de part et d'autre du point que regarde la caméra : au-delà du cadre le plus large. */
const SPAN = 30

/** Appareils du Space Kit (environ deux tuiles) et leur échelle ; les cargos sont plus gros et plus lents. */
const MODELS: { name: string; scale: number; heavy?: boolean }[] = [
  { name: 'craft_speederA', scale: 0.8 },
  { name: 'craft_speederB', scale: 0.8 },
  { name: 'craft_speederC', scale: 0.75 },
  { name: 'craft_speederD', scale: 0.75 },
  { name: 'craft_racer', scale: 0.85 },
  { name: 'craft_miner', scale: 1.05 },
  { name: 'craft_cargoA', scale: 1.3, heavy: true },
  { name: 'craft_cargoB', scale: 1.3, heavy: true },
]

interface Proto {
  root: THREE.Object3D
  scale: number
  heavy: boolean
  /** Arrière de l'appareil (z de la poupe), demi-largeur et mi-hauteur : là où luisent les réacteurs. */
  tail: number
  width: number
  mid: number
}

interface Ship {
  root: THREE.Group
  /** Sens de marche le long de la coque (1 : vers l'est, -1 : vers l'ouest), et vitesse (tuiles/s, toujours positive). */
  dir: 1 | -1
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
  private protos: Proto[] = []
  private readonly flare: THREE.SpriteMaterial
  private ships: Ship[] = []
  private next = 0
  private hidden = false
  private time = 0
  private filled = false

  constructor() {
    // Lueur des réacteurs, à la poupe : un halo bleuté.
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')!
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.3, 'rgba(255,255,255,0.45)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 64)
    this.flare = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), color: '#7fc8ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    void this.load()
  }

  /** Les modèles arrivent après le reste du bord : le trafic commence quand ils sont là. */
  private async load() {
    this.protos = await Promise.all(MODELS.map(async (m) => {
      const model = (await rig(`space/${m.name}.glb`)).root
      model.traverse((o) => (o.castShadow = o.receiveShadow = false))
      // Dans son fichier, chaque appareil est posé à l'écart de l'origine : on le recentre.
      model.getObjectByName(m.name)?.position.set(0, 0, 0)
      // Les modèles de Kenney ont le nez à -z : on les retourne, nez à +z.
      model.rotation.y = Math.PI
      const root = new THREE.Group()
      root.add(model)
      const box = new THREE.Box3().setFromObject(root)
      return { root, scale: m.scale, heavy: !!m.heavy, tail: box.min.z, width: (box.max.x - box.min.x) / 2, mid: (box.min.y + box.max.y) / 2 }
    }))
  }

  /** Le trafic disparaît pendant la traversée d'un saut FSD : à l'arrivée, d'autres appareils. */
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
    const proto = this.protos[Math.floor(Math.random() * this.protos.length)]
    const root = new THREE.Group()
    const flare = new THREE.Sprite(this.flare)
    flare.position.set(0, proto.mid, proto.tail)
    flare.scale.setScalar(proto.width * 1.3)
    root.add(proto.root.clone(true), flare)
    root.scale.setScalar(proto.scale)
    // La plupart vont vers l'est, comme le vaisseau, et le doublent ; les autres le croisent, plus vite.
    const dir = Math.random() < 0.7 ? 1 : -1
    // Nez (+z) dans le sens de la marche.
    root.rotation.y = (dir * Math.PI) / 2
    const ship: Ship = {
      root,
      dir,
      speed: (proto.heavy ? 1.2 + Math.random() * 0.8 : 2 + Math.random() * 2.5) * (dir > 0 ? 1 : 1.6),
      // Ceux qui croisent passent plus au large que ceux qui doublent.
      off: dir > 0 ? 2 + Math.random() * 1.8 : 5 + Math.random() * 1.8,
      side: Math.random() < 0.5 ? -1 : 1,
      height: -0.6 - Math.random() * 1.2,
      phase: Math.random() * Math.PI * 2,
    }
    root.position.x = anywhere ? centerX + (Math.random() * 2 - 1) * SPAN * 0.8 : centerX - dir * SPAN
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
    if (this.hidden || !this.protos.length) return
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
      p.x += s.dir * s.speed * dt
      p.y = deckY + s.height + Math.sin(this.time * 0.7 + s.phase) * 0.08
      p.z = s.side < 0 ? sides.north - s.off : sides.south + s.off
      s.root.rotation.z = Math.sin(this.time * 0.5 + s.phase) * 0.1
    }
    const gone = this.ships.filter((s) => Math.abs(s.root.position.x - target.x) > SPAN + 4)
    for (const s of gone) s.root.removeFromParent()
    if (gone.length) this.ships = this.ships.filter((s) => !gone.includes(s))
  }
}
