import * as THREE from 'three'
import { arenaFx } from './settings'

/*
 * Les effets de combat de l'arène, en plus de ceux du moteur du stand (éclats, étincelles, marques
 * sur les murs, cf. range.ts) : ce qui dit, d'un coup d'œil, ce qui vient de se passer.
 * - `puff` : un nuage de poussière (une balle dans le sol, un pas lourd) ;
 * - `star` : une étoile qui claque (un combattant touché), `cross` : la croix verte d'un soin,
 *   `hitmark` : la croix de touche que voit le tireur ;
 * - `wave` : une onde au sol qui s'élargit (un retour en jeu, une élimination, un point de chute) ;
 * - `link` : un trait lumineux qui relie un instant deux points (Betty et celui qu'elle soigne) ;
 * - `drops` : des gouttes qui tombent (le jus d'une tomate, le cocktail qui coule) ;
 * - `rays` : un faisceau qui monte du sol (on revient en jeu).
 * Tout vit dans le repère de l'arène (cf. ArenaGun.attach) ; les formes et les textures sont
 * partagées, et le mode « effets réduits » (cf. settings.ts) en tire moins.
 */

/** Texture dessinée une fois, sur un canevas carré de `size` pixels. */
function drawn(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  draw(c.getContext('2d')!, size)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const SOFT = drawn(64, (g, s) => {
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  grad.addColorStop(0, 'rgba(255,255,255,0.9)')
  grad.addColorStop(0.5, 'rgba(255,255,255,0.45)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, s, s)
})

/** Une étoile à quatre branches, cerclée de sombre : on la voit sur le sable comme dans la ruche. */
const STAR = drawn(64, (g, s) => {
  const c = s / 2
  const path = () => {
    g.beginPath()
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2
      const r = i % 2 ? s * 0.13 : s * 0.46
      g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r)
    }
    g.closePath()
  }
  path()
  g.lineWidth = 6
  g.strokeStyle = 'rgba(5,7,11,0.85)'
  g.stroke()
  path()
  g.fillStyle = '#ffffff'
  g.fill()
})

/** La croix d'un soin, ronde aux bouts, cerclée de sombre. */
const CROSS = drawn(64, (g, s) => {
  const c = s / 2, w = s * 0.2, l = s * 0.36
  const draw = (pad: number) => {
    g.beginPath()
    g.roundRect(c - w / 2 - pad, c - l - pad, w + pad * 2, l * 2 + pad * 2, w / 2)
    g.roundRect(c - l - pad, c - w / 2 - pad, l * 2 + pad * 2, w + pad * 2, w / 2)
  }
  g.fillStyle = 'rgba(5,7,11,0.85)'
  draw(4)
  g.fill()
  g.fillStyle = '#ffffff'
  draw(0)
  g.fill()
})

/** La croix de touche (un X aux branches écartées du centre, comme la mire du stand). */
const HITMARK = drawn(64, (g, s) => {
  const c = s / 2
  g.lineCap = 'round'
  for (const [width, color] of [[11, 'rgba(5,7,11,0.9)'], [6, '#ffffff']] as const) {
    g.lineWidth = width
    g.strokeStyle = color
    g.beginPath()
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.moveTo(c + dx * s * 0.14, c + dy * s * 0.14)
      g.lineTo(c + dx * s * 0.38, c + dy * s * 0.38)
    }
    g.stroke()
  }
})

const drops = new Map<string, THREE.MeshBasicMaterial>()
/** La matière des gouttes d'une couleur (partagée). */
function dropMaterial(color: THREE.ColorRepresentation): THREE.MeshBasicMaterial {
  const key = new THREE.Color(color).getHexString()
  let m = drops.get(key)
  if (!m) drops.set(key, (m = new THREE.MeshBasicMaterial({ color, toneMapped: false })))
  return m
}

const RING = new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2)
const BEAM = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true).translate(0, 0.5, 0)
const DROP = new THREE.SphereGeometry(0.018, 6, 4)
/** Un ruban d'un mètre le long de +z (le lien d'un soin). */
const RIBBON = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5)

interface Sprite { sprite: THREE.Sprite; age: number; life: number; size: number; grow: number; rise: number; fade: 'out' | 'pop' }
interface Wave { mesh: THREE.Mesh; age: number; life: number; from: number; to: number }
interface Drop { mesh: THREE.Mesh; v: THREE.Vector3; age: number; life: number; floor: number }
interface Link { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; age: number; life: number }
interface Rays { mesh: THREE.Mesh; age: number; life: number }

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _y = new THREE.Vector3()
const _x = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)

export class CombatFx {
  readonly group = new THREE.Group()
  private sprites: Sprite[] = []
  private waves: Wave[] = []
  private drops: Drop[] = []
  private links: Link[] = []
  private rays: Rays[] = []
  private camera: THREE.Camera | null = null

  constructor() {
    this.group.name = 'arena-fx'
  }

  private sprite(map: THREE.Texture, color: THREE.ColorRepresentation, at: THREE.Vector3, size: number, life: number, options: { grow?: number; rise?: number; fade?: 'out' | 'pop'; additive?: boolean; depth?: boolean } = {}) {
    const material = new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, depthTest: options.depth ?? true, toneMapped: false, blending: options.additive ? THREE.AdditiveBlending : THREE.NormalBlending })
    const sprite = new THREE.Sprite(material)
    sprite.position.copy(at)
    sprite.scale.setScalar(size)
    sprite.renderOrder = 6
    this.group.add(sprite)
    this.sprites.push({ sprite, age: 0, life, size, grow: options.grow ?? 1, rise: options.rise ?? 0, fade: options.fade ?? 'out' })
  }

  /** Un nuage de poussière, couleur `color`, qui monte un peu et se dissipe. */
  puff(at: THREE.Vector3, color: THREE.ColorRepresentation, size = 0.22, n = 4) {
    for (let i = 0; i < arenaFx.count(n); i++) {
      _a.set(at.x + (Math.random() - 0.5) * size * 0.8, at.y + 0.02 + Math.random() * 0.04, at.z + (Math.random() - 0.5) * size * 0.8)
      this.sprite(SOFT, color, _a, size * (0.6 + Math.random() * 0.5), 0.45 + Math.random() * 0.25, { grow: 2.2, rise: 0.25 + Math.random() * 0.2 })
    }
  }

  /** Une étoile qui claque, là où un combattant est touché. */
  star(at: THREE.Vector3, color: THREE.ColorRepresentation, size = 0.28) {
    this.sprite(STAR, color, at, size, 0.22, { grow: 1.6, fade: 'pop' })
  }

  /** La croix verte d'un soin, qui monte au-dessus du soigné. */
  cross(at: THREE.Vector3, color: THREE.ColorRepresentation, size = 0.22) {
    this.sprite(CROSS, color, at, size, 0.8, { grow: 1.2, rise: 0.45, fade: 'out', depth: false })
  }

  /** La croix de touche : le tireur voit où il a touché (vue de dessus comme dans les yeux). */
  hitmark(at: THREE.Vector3, color: THREE.ColorRepresentation, kill = false) {
    this.sprite(HITMARK, color, at, kill ? 0.42 : 0.3, kill ? 0.45 : 0.28, { grow: kill ? 1.5 : 1.25, fade: 'pop', depth: false })
  }

  /** Une onde au sol qui s'élargit de `from` à `to` (tuiles) et s'éteint. */
  wave(at: THREE.Vector3, color: THREE.ColorRepresentation, from: number, to: number, life = 0.5, opacity = 0.85) {
    const mesh = new THREE.Mesh(RING, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 }))
    mesh.position.copy(at).setY(at.y + 0.045)
    mesh.scale.setScalar(from)
    mesh.renderOrder = 4
    mesh.userData.opacity = opacity
    this.group.add(mesh)
    this.waves.push({ mesh, age: 0, life, from, to })
  }

  /** Des gouttes qui jaillissent de `at` et retombent au sol (`floor`). */
  spill(at: THREE.Vector3, color: THREE.ColorRepresentation, n: number, spread = 1.2, floor = 0) {
    const material = dropMaterial(color)
    for (let i = 0; i < arenaFx.count(n); i++) {
      const mesh = new THREE.Mesh(DROP, material)
      mesh.position.copy(at)
      this.group.add(mesh)
      this.drops.push({ mesh, v: new THREE.Vector3((Math.random() - 0.5) * spread, Math.random() * spread * 0.8, (Math.random() - 0.5) * spread), age: 0, life: 0.6 + Math.random() * 0.3, floor })
    }
  }

  /** Une goutte qui tombe de `at` (la tomate qui coule, le cocktail qui déborde). */
  drip(at: THREE.Vector3, color: THREE.ColorRepresentation, floor = 0) {
    if (arenaFx.reduced) return
    const mesh = new THREE.Mesh(DROP, dropMaterial(color))
    mesh.position.copy(at)
    mesh.scale.setScalar(0.7)
    this.group.add(mesh)
    this.drops.push({ mesh, v: new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3), age: 0, life: 0.5, floor })
  }

  /** Un trait lumineux de `from` à `to`, qui s'éteint en `life` secondes (il suit `to` s'il bouge : passer le même vecteur). */
  link(from: THREE.Vector3, to: THREE.Vector3, color: THREE.ColorRepresentation, life = 0.45) {
    const mesh = new THREE.Mesh(RIBBON, new THREE.MeshBasicMaterial({ map: SOFT, color, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }))
    mesh.matrixAutoUpdate = false
    mesh.frustumCulled = false
    mesh.renderOrder = 5
    this.group.add(mesh)
    this.links.push({ mesh, from, to, age: 0, life })
  }

  /** Un faisceau qui monte du sol, à la couleur de `color` (un retour en jeu). */
  beam(at: THREE.Vector3, color: THREE.ColorRepresentation, radius = 0.32, height = 1.6, life = 0.6) {
    const mesh = new THREE.Mesh(BEAM, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }))
    mesh.position.copy(at)
    mesh.scale.set(radius, height, radius)
    mesh.renderOrder = 5
    this.group.add(mesh)
    this.rays.push({ mesh, age: 0, life })
  }

  update(dt: number, camera: THREE.Camera) {
    this.camera = camera
    this.sprites = this.sprites.filter((s) => {
      s.age += dt
      const k = s.age / s.life
      if (k >= 1) {
        s.sprite.removeFromParent()
        s.sprite.material.dispose()
        return false
      }
      // `pop` : il claque (vite grand), puis s'efface ; `out` : il grandit et se dissipe.
      const grow = s.fade === 'pop' ? 1 + (s.grow - 1) * Math.min(1, k * 4) : 1 + (s.grow - 1) * k
      s.sprite.scale.setScalar(s.size * grow)
      s.sprite.position.y += s.rise * dt
      s.sprite.material.opacity = s.fade === 'pop' ? (k < 0.5 ? 1 : 1 - (k - 0.5) * 2) : (1 - k) * (1 - k)
      return true
    })
    this.waves = this.waves.filter((w) => {
      w.age += dt
      const k = w.age / w.life
      if (k >= 1) {
        w.mesh.removeFromParent()
        ;(w.mesh.material as THREE.Material).dispose()
        return false
      }
      const e = 1 - (1 - k) ** 3
      w.mesh.scale.setScalar(w.from + (w.to - w.from) * e)
      ;(w.mesh.material as THREE.MeshBasicMaterial).opacity = (w.mesh.userData.opacity as number) * (1 - k)
      return true
    })
    this.drops = this.drops.filter((d) => {
      d.age += dt
      if (d.age >= d.life) {
        d.mesh.removeFromParent()
        return false
      }
      d.v.y -= 6 * dt
      d.mesh.position.addScaledVector(d.v, dt)
      if (d.mesh.position.y < d.floor + 0.012) {
        d.mesh.position.y = d.floor + 0.012
        d.v.set(0, 0, 0)
        d.mesh.scale.set(1.6, 0.25, 1.6)
      }
      return true
    })
    this.links = this.links.filter((l) => {
      l.age += dt
      const k = l.age / l.life
      if (k >= 1) {
        l.mesh.removeFromParent()
        ;(l.mesh.material as THREE.Material).dispose()
        return false
      }
      this.lay(l.mesh, l.from, l.to, 0.12 * (1 - k * 0.5))
      ;(l.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - k * k
      return true
    })
    this.rays = this.rays.filter((r) => {
      r.age += dt
      const k = r.age / r.life
      if (k >= 1) {
        r.mesh.removeFromParent()
        ;(r.mesh.material as THREE.Material).dispose()
        return false
      }
      r.mesh.scale.x = r.mesh.scale.z = Math.max(0.02, r.mesh.scale.x * (1 - dt * 1.5))
      ;(r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - k)
      return true
    })
  }

  /** Étire un ruban de `a` à `b`, large de `width`, tourné vers la caméra (repère de l'arène). */
  private lay(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, width: number) {
    const along = _a.subVectors(b, a)
    const len = along.length()
    mesh.visible = len > 1e-4 && !!this.camera
    if (!mesh.visible) return
    along.divideScalar(len)
    const cam = this.camera!
    if ((cam as THREE.OrthographicCamera).isOrthographicCamera) cam.getWorldDirection(_y).negate()
    else cam.getWorldPosition(_y).sub(this.group.getWorldPosition(_b)).sub(a)
    _x.crossVectors(along, _y)
    if (_x.lengthSq() < 1e-8) _x.crossVectors(along, UP)
    _x.normalize()
    _y.crossVectors(_x, along)
    mesh.matrix.makeBasis(_x.multiplyScalar(width), _y, _b.copy(along).multiplyScalar(len)).setPosition(a)
  }

  clear() {
    for (const s of this.sprites) { s.sprite.removeFromParent(); s.sprite.material.dispose() }
    for (const w of this.waves) { w.mesh.removeFromParent(); (w.mesh.material as THREE.Material).dispose() }
    for (const d of this.drops) d.mesh.removeFromParent()
    for (const l of this.links) { l.mesh.removeFromParent(); (l.mesh.material as THREE.Material).dispose() }
    for (const r of this.rays) { r.mesh.removeFromParent(); (r.mesh.material as THREE.Material).dispose() }
    this.sprites = []
    this.waves = []
    this.drops = []
    this.links = []
    this.rays = []
  }
}
