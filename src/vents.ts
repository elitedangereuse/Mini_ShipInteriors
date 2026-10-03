import * as THREE from 'three'
import { Deck } from './deck'
import { tr } from './i18n'
import type { LevelDef } from './levels'
import { FogOfWar } from './salvage/fog'
import { DIRS } from './map'
import { lineOfSight } from '../shared/sight.js'
import { VENT_GRATE, VENT_LAYOUT, VENT_LEVEL } from '../shared/vents.js'

/*
 * Les conduits de ventilation (cf. shared/vents.js) : où tombent ceux que les toilettes à
 * dépression du pont supérieur aspirent pendant un saut FSD. Un petit labyrinthe de gaines dans le
 * noir : on n'y voit qu'autour de soi (le brouillard de la zone thargoïde, cf. salvage/fog.ts), à
 * la lueur d'une lampe. Des toiles d'araignée, des rats qui détalent, et au bout, la lumière du
 * bar qui monte d'une grille.
 */

/** Ce qu'on voit autour de soi (tuiles) ; la grille du bar, éclairée, se voit de plus loin. */
const VISION = 2.9
const LIT_VISION = 7

export const VENTS_DECK: LevelDef = {
  id: VENT_LEVEL,
  name: tr('Conduits de ventilation', 'Ventilation ducts'),
  theme: 'raw',
  vents: true,
  mapOptions: {},
  ambience: { sky: '#46505f', ground: '#0c0907', hemi: 0.3, sun: '#8090a8', sunIntensity: 0.05 },
  layout: VENT_LAYOUT,
  rooms: { c: tr('Quelque part sous les toilettes', 'Somewhere below the restrooms') },
  floors: { c: 'floor-panel' },
  windows: { c: 0 },
  props: [
    // Là où l'on tombe : un mot de ceux qui sont passés avant.
    { model: 'vent-scrawl', x: 1, z: 0, label: tr('SUIS LA|LUMIÈRE', 'FOLLOW|THE LIGHT'), solid: false },
    { model: 'cobweb', x: 0, z: 0, solid: false },
    // Les culs-de-sac : deux ventilateurs, et des mots grattés dans la tôle.
    { model: 'vent-fan', x: 6, z: 0, rot: 3, solid: false },
    { model: 'vent-fan', x: 2, z: 2, rot: 1, solid: false },
    { model: 'vent-scrawl', x: 0, z: 2, rot: 2, label: tr('PAS PAR LÀ', 'NOT THIS WAY'), solid: false },
    { model: 'vent-scrawl', x: 12, z: 0, rot: 3, label: tr('JACQUES|EST EN BAS', 'JACQUES|IS BELOW'), solid: false },
    { model: 'vent-scrawl', x: 2, z: 6, rot: 3, label: tr('RATS : 1|MOI : 0', 'RATS: 1|ME: 0'), solid: false },
    { model: 'vent-scrawl', x: 12, z: 6, label: tr('TU BRÛLES', 'SO CLOSE'), solid: false },
    // Des toiles dans les coins, et quelques-unes en travers des gaines (on passe dessous).
    { model: 'cobweb', x: 8, z: 0, solid: false },
    { model: 'cobweb', x: 0, z: 4, solid: false },
    { model: 'cobweb', x: 10, z: 2, solid: false },
    { model: 'cobweb', x: 12, z: 2, rot: 3, solid: false },
    { model: 'cobweb', x: 0, z: 6, rot: 1, solid: false },
    { model: 'cobweb', x: 4, z: 6, rot: 1, solid: false },
    { model: 'cobweb', x: 10, z: 4, rot: 2, solid: false },
    { model: 'cobweb', x: 4, z: 1, label: 'span', solid: false },
    { model: 'cobweb', x: 7, z: 4, rot: 1, label: 'span', solid: false },
    { model: 'cobweb', x: 9, z: 6, rot: 1, label: 'span', solid: false },
    { model: 'cobweb', x: 12, z: 3, label: 'span', solid: false },
    { model: 'stain', x: 3, z: 0, solid: false },
    { model: 'stain', x: 6, z: 2, solid: false },
    { model: 'stain', x: 2, z: 4, solid: false },
    { model: 'stain', x: 7, z: 6, solid: false },
    // La grille du bar, au fond de la dernière gaine.
    {
      model: 'vent-grate', x: VENT_GRATE.x, z: VENT_GRATE.z, solid: false, action: tr('Soulever la grille', 'Lift the grate'),
      interact: tr('Une grille. En dessous : de la lumière, de la musique, et une odeur de Brandy de Lave.', 'A grate. Below: light, music, and a smell of Lavian Brandy.'),
    },
  ],
  lights: [
    [VENT_GRATE.x, VENT_GRATE.z, '#ffb060', 2.4, 'fire', 5],
    [6, 0, '#3f7f9a', 0.7, 'neon', 3],
    [2, 2, '#3f7f9a', 0.7, 'neon', 3],
  ],
}

/** Tuiles des gaines, et leurs voisines : le terrain des rats. */
const TILES: { x: number; z: number }[] = []
for (const [z, row] of VENT_LAYOUT.entries()) for (let x = 0; x < row.length; x++) if (row[x] !== ' ') TILES.push({ x, z })
const isTile = (x: number, z: number) => VENT_LAYOUT[z]?.[x] !== undefined && VENT_LAYOUT[z][x] !== ' '
const neighbours = (t: { x: number; z: number }) => DIRS.map((d) => ({ x: t.x + d.dx, z: t.z + d.dz })).filter((n) => isTile(n.x, n.z))

const RAT_WALK = 0.9
const RAT_FLEE = 3.1
/** En deçà, un rat nous a vus : il détale. */
const RAT_FEAR = 1.7

/** Un rat : il trottine de tuile en tuile, s'arrête pour renifler, et file dès qu'on approche. */
class Rat {
  readonly root = new THREE.Group()
  private readonly tail: THREE.Object3D
  private from: { x: number; z: number }
  private to: { x: number; z: number }
  /** Avancement de `from` à `to` (0 à 1). */
  private t = 0
  private pause = 0
  private fleeing = false
  private readonly side: number
  private readonly phase = Math.random() * 6

  constructor(start: { x: number; z: number }) {
    this.from = start
    this.to = start
    // Chacun longe son côté de la gaine.
    this.side = (Math.random() - 0.5) * 0.5
    const fur = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(0.07, 0.12, 0.16 + Math.random() * 0.1) })
    const skin = new THREE.MeshLambertMaterial({ color: '#8a5f58' })
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), fur)
    body.scale.set(0.8, 0.75, 1.5)
    body.position.y = 0.045
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.07, 8), fur)
    head.rotation.x = Math.PI / 2
    head.position.set(0, 0.045, 0.095)
    this.root.add(body, head)
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 5), skin)
      ear.position.set(s * 0.022, 0.07, 0.07)
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.005, 5, 4), new THREE.MeshBasicMaterial({ color: '#ff5a3c' }))
      eye.position.set(s * 0.014, 0.055, 0.105)
      this.root.add(ear, eye)
    }
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.008, 0.13, 5), skin)
    tail.rotation.x = Math.PI / 2
    tail.position.z = -0.065
    this.tail = new THREE.Group()
    this.tail.position.set(0, 0.035, -0.07)
    this.tail.add(tail)
    this.root.add(this.tail)
    this.place()
  }

  /** @returns vrai s'il vient de prendre peur (un couinement) */
  update(dt: number, clock: number, threat: { x: number; z: number } | null): boolean {
    const near = !!threat && Math.hypot(threat.x - this.root.position.x, threat.z - this.root.position.z) < RAT_FEAR
    const scared = near && !this.fleeing
    this.fleeing = near
    if (near) this.pause = 0
    this.tail.rotation.y = Math.sin(clock * (this.fleeing ? 22 : 5) + this.phase) * 0.5
    if (this.pause > 0) {
      this.pause -= dt
      // À l'arrêt, il renifle.
      this.root.rotation.z = Math.sin(clock * 16 + this.phase) * 0.04
      return scared
    }
    this.root.rotation.z = 0
    this.t += (dt * (this.fleeing ? RAT_FLEE : RAT_WALK))
    while (this.t >= 1) {
      this.t -= 1
      this.next(threat)
      if (this.pause > 0) {
        this.t = 0
        break
      }
    }
    this.place()
    return scared
  }

  /** Arrivé sur `to` : tuile suivante (loin de la menace s'il fuit, sinon devant lui), ou une pause. */
  private next(threat: { x: number; z: number } | null) {
    const here = this.to
    const options = neighbours(here)
    let pick: { x: number; z: number }
    if (this.fleeing && threat) {
      pick = options.reduce((best, n) => (Math.hypot(n.x - threat.x, n.z - threat.z) > Math.hypot(best.x - threat.x, best.z - threat.z) ? n : best))
      // Acculé au fond d'une gaine : il se retourne et passe entre nos jambes.
      if (Math.hypot(pick.x - threat.x, pick.z - threat.z) < Math.hypot(here.x - threat.x, here.z - threat.z)) pick = options[Math.floor(Math.random() * options.length)]
    } else {
      const ahead = options.filter((n) => n.x !== this.from.x || n.z !== this.from.z)
      pick = (ahead.length ? ahead : options)[Math.floor(Math.random() * (ahead.length || options.length))]
      if (Math.random() < 0.3) this.pause = 0.6 + Math.random() * 2.4
    }
    this.from = here
    this.to = pick
  }

  private place() {
    const dx = this.to.x - this.from.x, dz = this.to.z - this.from.z
    // Décalé vers son côté de la gaine, perpendiculairement à sa course.
    this.root.position.set(this.from.x + dx * this.t + dz * this.side, 0, this.from.z + dz * this.t - dx * this.side)
    if (dx || dz) this.root.rotation.y = Math.atan2(dx, dz)
  }
}

export class Vents {
  readonly deck = new Deck(VENTS_DECK)
  private readonly fog: FogOfWar
  /** La lampe qu'on tient : elle n'éclaire que quelques pas. */
  private readonly lantern = new THREE.PointLight('#ffe2b8', 0, 5.5, 1.3)
  private readonly rats: Rat[] = []
  private clock = 0
  private lastRender = 0
  private inside = false

  /** @param host.squeak le couinement d'un rat qui détale, là où il est */
  constructor(private readonly host: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; squeak: (at: THREE.Vector3) => void }) {
    this.fog = new FogOfWar(host.renderer)
    const map = this.deck.map
    this.fog.setField({
      width: map.width,
      height: map.height,
      origin: (p) => p,
      sight: (from, to) => lineOfSight(map, from, to),
      floor: (x, z) => map.isFloor(x, z),
      // La grille du bar et la gaine qui y mène : leur lumière se voit de loin.
      lit: (x, z) => x === VENT_GRATE.x && Math.abs(z - VENT_GRATE.z) <= 1 && z <= VENT_GRATE.z,
      litVision: LIT_VISION,
    })
    host.scene.add(this.lantern)
    // Les rats : loin de là où l'on tombe et de la grille, chacun dans son coin.
    const homes = TILES.filter((t) => t.x + t.z > 3 && Math.hypot(t.x - VENT_GRATE.x, t.z - VENT_GRATE.z) > 2)
    for (let i = 0; i < 6; i++) {
      const rat = new Rat(homes[Math.floor(((i + 0.5) / 6) * homes.length)])
      this.rats.push(rat)
      this.deck.group.add(rat.root)
    }
  }

  /** @param at le joueur, s'il est dans les conduits (null sinon) */
  update(dt: number, at: THREE.Vector3 | null) {
    const entered = !!at && !this.inside
    this.inside = !!at
    if (!at) {
      this.lantern.intensity = 0
      return
    }
    this.clock += dt
    this.lantern.position.set(at.x, this.deck.y + 0.95, at.z)
    this.lantern.intensity = 2.8 + Math.sin(this.clock * 9) * 0.08
    this.fog.update(at, VISION, dt, entered)
    for (const rat of this.rats) {
      if (rat.update(dt, this.clock, at)) this.host.squeak(rat.root.getWorldPosition(new THREE.Vector3()))
    }
  }

  /** Rend la scène à travers le brouillard, tant qu'on est dans les conduits ; false sinon. */
  render(scene: THREE.Scene, camera: THREE.Camera, light: boolean): boolean {
    if (!this.inside) return false
    this.fog.resize(light)
    const now = performance.now()
    this.fog.render(scene, camera, Math.min(1, (now - this.lastRender) / 1000))
    this.lastRender = now
    return true
  }
}
