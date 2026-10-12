import * as THREE from 'three'
import { edShip, paintShip, shipInfo, type EdShipId } from './ed-ships'
import { withoutLightField } from './lighting/field'
import type { Livery, PaintedHull, ShipPaint } from './ship-paint'

/*
 * L'aperçu du registre (cf. ship-picker.ts) : le vaisseau seul, de trois quarts, sur un plateau qui
 * tourne lentement, dans la peinture qu'on regarde, comme à l'écran des livrées d'Elite. On le fait
 * tourner à la main en le glissant. Son propre petit rendu WebGL (un canevas neuf à chaque ouverture :
 * celui d'avant a rendu son contexte au navigateur, cf. release). Sous un éclairage de studio
 * neutre : les couleurs de la boutique.
 */
export class ShipPreview {
  /** La vue, à placer dans la page ; son canevas y est mis à chaque ouverture. */
  readonly element = document.createElement('div')
  private canvas: HTMLCanvasElement | null = null
  private renderer: THREE.WebGLRenderer | null = null
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(28, 16 / 9, 0.1, 5000)
  private readonly turntable = new THREE.Group()
  private ship: THREE.Object3D | null = null
  private hull: PaintedHull | null = null
  private shipId: EdShipId | null = null
  /** Le dernier vaisseau demandé (un autre peut arriver pendant qu'un se charge). */
  private wanted: EdShipId | null = null
  private paint: ShipPaint | null = null
  private raf = 0
  private last = 0
  private drag: { x: number; angle: number } | null = null
  private readonly still = matchMedia('(prefers-reduced-motion: reduce)')
  /** Prévenu quand le modèle est là (la livrée du constructeur, pour sa pastille). */
  onLoad?: (livery: Livery) => void

  constructor() {
    this.element.className = 'ship-paint-view'
    this.element.setAttribute('aria-hidden', 'true')
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#2a3440', 1.5))
    const key = new THREE.DirectionalLight('#ffffff', 2.2)
    key.position.set(-4, 6, 5)
    // Un contre-jour bleuté, celui des baies d'appontage.
    const rim = new THREE.DirectionalLight('#8fd0ff', 1.2)
    rim.position.set(5, 2, -6)
    this.scene.add(key, rim, this.turntable)
    this.turntable.rotation.y = 0.75
    this.element.addEventListener('pointerdown', (e) => {
      this.drag = { x: e.clientX, angle: this.turntable.rotation.y }
      this.element.setPointerCapture(e.pointerId)
    })
    this.element.addEventListener('pointermove', (e) => {
      if (this.drag) this.turntable.rotation.y = this.drag.angle + (e.clientX - this.drag.x) * 0.012
    })
    const drop = () => {
      this.drag = null
    }
    this.element.addEventListener('pointerup', drop)
    this.element.addEventListener('pointercancel', drop)
  }

  /** Montre ce vaisseau dans cette peinture (le modèle se charge s'il le faut). */
  async show(id: EdShipId, paint: ShipPaint | null) {
    this.paint = paint
    this.start()
    if (this.shipId === id) return void this.hull?.set(paint)
    this.wanted = id
    const ship = await edShip(id)
    if (this.wanted !== id) return
    this.clear()
    const info = shipInfo(ship)
    // Le vaisseau centré sur le plateau, sa plus grande dimension ramenée à 10 unités.
    const k = 10 / Math.max(...info.size)
    ship.scale.setScalar(k)
    this.hull = paintShip(ship, this.paint)
    this.turntable.add(ship)
    this.ship = ship
    this.shipId = id
    const r = (Math.hypot(...info.size) / 2) * k
    const d = (r / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 0.72
    this.camera.position.set(0, d * 0.34, d * 0.94)
    this.camera.lookAt(0, -r * 0.05, 0)
    this.onLoad?.(info.livery)
  }

  /** Change la peinture montrée. */
  setPaint(paint: ShipPaint | null) {
    this.paint = paint
    this.hull?.set(paint)
  }

  private start() {
    if (!this.renderer) {
      this.canvas = document.createElement('canvas')
      this.element.replaceChildren(this.canvas)
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true })
      this.renderer.setClearColor(0x000000, 0)
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping
      this.renderer.toneMappingExposure = 1.05
    }
    if (this.raf) return
    this.last = performance.now()
    const frame = (now: number) => {
      this.raf = requestAnimationFrame(frame)
      const dt = Math.min(0.1, (now - this.last) / 1000)
      this.last = now
      if (!this.drag && !this.still.matches) this.turntable.rotation.y += dt * 0.32
      this.draw()
    }
    this.raf = requestAnimationFrame(frame)
  }

  private draw() {
    const r = this.renderer, c = this.canvas
    if (!r || !c) return
    const w = c.clientWidth, h = c.clientHeight
    if (!w || !h) return
    const dpr = Math.min(devicePixelRatio, 2)
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      r.setPixelRatio(dpr)
      r.setSize(w, h, false)
      this.camera.aspect = w / h
      this.camera.updateProjectionMatrix()
    }
    withoutLightField(() => r.render(this.scene, this.camera))
  }

  private clear() {
    if (this.ship) this.turntable.remove(this.ship)
    this.hull?.material.dispose()
    this.ship = this.hull = this.shipId = null
  }

  /** Le registre se ferme : plus d'images, et le contexte WebGL rendu au navigateur. */
  release() {
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.clear()
    this.wanted = null
    this.renderer?.dispose()
    this.renderer?.forceContextLoss()
    this.renderer = null
    this.canvas?.remove()
    this.canvas = null
  }
}
