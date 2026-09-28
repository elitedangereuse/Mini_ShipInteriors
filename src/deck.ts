import * as THREE from 'three'
import { renderQuality } from './quality'
import { station, themes, type StationModel, type ThemeMaterials } from './assets'
import { CabinView } from './cabin/view'
import { makeFadeable } from './fade'
import { beamMaterial, buildFurniture, isCustomModel, tickFurniture, type Emitter, type FurnitureControl } from './furniture'
import { tr } from './i18n'
import { LEVEL_HEIGHT, LIFT, type Flicker, type LevelDef } from './levels'
import { DIRS, ShipMap } from './map'
import { fadeBuffer, StaticMerge, updateOccluders, type FadeBuffer, type Occluder } from './merge'
import { Pathfinder } from './pathfinding'
import { DOOR_GAP } from '../shared/sight.js'
import { shipMapOptions } from '../shared/ship-layouts.js'
import { placeSeats, seatAction, seatsOf, type SeatSpot } from './seats'

/** Rectangle de collision dans le plan XZ. */
export interface Box2 {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface Interactable {
  object: THREE.Object3D
  /** Position au sol (coordonnées du pont ; peut être une référence vivante, ex. le chat). */
  position: THREE.Vector3
  label: string
  /** Texte affiché ; avec une liste, une phrase au hasard à chaque fois ; une fonction est relue à chaque interaction. */
  text?: string | string[] | (() => string | string[])
  onInteract?: () => void
  /** Places où s'installer (s'asseoir, s'allonger, jouer…), dans le repère du pont, cf. seats.ts. */
  seats?: (toward: { x: number; z: number }) => SeatSpot[]
  /** Commande du meuble (la pince à peluches, le sac de frappe). */
  control?: FurnitureControl
  /** Meuble et variante (le jeu d'une borne, par exemple). */
  furniture?: { model: string; label?: string }
}

/** Sons d'ambiance d'un pont : ceux des meubles, plus les bips des consoles du cockpit. */
export type EmitterKind = Emitter | 'beep'

/** Pan de mur posé sur l'arête entre deux tuiles (les affiches s'y accrochent, cf. cabin/). */
export interface WallSegment {
  /** Milieu de l'arête. */
  x: number
  z: number
  /** Le mur court le long de x (arête nord ou sud d'une tuile), sinon le long de z. */
  alongX: boolean
  model: 'wall' | 'wall-window' | 'wall-pillar' | 'door'
}

interface DoorState {
  panel: THREE.Object3D
  center: THREE.Vector3
  /** Axe de glissement du panneau (le long du mur). */
  axis: THREE.Vector3
  open: number
  wanted: boolean
  /** Tuile et bord de la porte (cf. ShipMap.isLocked). */
  x: number
  z: number
  dir: number
  /** Voyants rouges de la porte verrouillée, de part et d'autre. */
  lamp: THREE.Object3D
}

const WALL_T = 0.3
/**
 * Poteau d'angle : un peu plus large et plus haut que les murs, pour recouvrir
 * entièrement la zone où deux murs se chevauchent (sinon leurs dessus, au même
 * niveau, se battent pour le même pixel : z-fighting en dents de scie).
 */
const POST_W = WALL_T + 0.05
const POST_H = 1.03
const FLOOR_Y = -0.3
const DOOR_RANGE = 1.3

const PICK_MATERIAL = new THREE.MeshBasicMaterial()
/** Voyant d'une porte verrouillée : une barrette rouge qui dépasse des deux faces du linteau. */
const LOCK_LAMP_GEO = new THREE.BoxGeometry(0.16, 0.035, 0.33)
const LOCK_LAMP_MAT = new THREE.MeshBasicMaterial({ color: '#ff3b2f' })

/** Petit hash déterministe pour varier les murs sans aléatoire. */
function hash(x: number, z: number): number {
  let h = (x * 374761393 + z * 668265263) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  return (h ^ (h >>> 16)) >>> 0
}

export class Deck {
  readonly group = new THREE.Group()
  readonly map: ShipMap
  readonly pathfinder: Pathfinder
  readonly colliders: Box2[] = []
  readonly interactables: Interactable[] = []
  /** Tuiles occupées par un meuble : « x,z ». */
  readonly blockedTiles = new Set<string>()
  /** Altitude du sol de ce pont. */
  readonly y: number
  /** Lumières du pont, en coordonnées monde. */
  readonly lights: { position: THREE.Vector3; color: THREE.Color; intensity: number; flicker?: Flicker }[] = []
  /** Sources sonores (coordonnées monde). */
  readonly engineEmitters: THREE.Vector3[] = []
  /** Sons d'ambiance par type (bips, arcade, soudure, machines), en coordonnées monde. */
  readonly emitters = new Map<EmitterKind, THREE.Vector3[]>()
  /** Pans de mur et portes, en coordonnées du pont. */
  readonly walls: WallSegment[] = []
  /** Poteaux d'angle (centre, en coordonnées du pont ; côté POST_WIDTH). */
  readonly posts: { x: number; z: number }[] = []

  /** Appelé quand une porte s'ouvre ou se ferme (position monde). */
  onDoor?: (position: THREE.Vector3, open: boolean) => void

  private occluders: Occluder[] = []
  private doors: DoorState[] = []
  private merge = new StaticMerge()
  private fades!: FadeBuffer
  private time = 0
  private core?: THREE.Mesh
  private coreMat?: THREE.MeshStandardMaterial
  private plumes: THREE.Mesh[] = []
  /** Jets des tuyères. */
  private glowMat: THREE.ShaderMaterial
  private liftBeam!: THREE.Mesh
  private liftHalo!: THREE.Mesh
  private liftRings: THREE.Mesh[] = []
  private liftSign!: THREE.Sprite
  private liftItem!: Interactable
  private liftBoost = 0
  /** Animations du mobilier (hologrammes, drones…). */
  private animated: { update: (t: number) => void; interactive: boolean }[] = []
  private decorationFrame = -1
  /** Peinture de la coque et du mobilier du kit sur ce pont. */
  readonly theme: ThemeMaterials
  /** Cabine personnalisable du pont (les quartiers du commandant), dont chaque joueur a son exemplaire. */
  readonly cabin?: CabinView

  constructor(readonly def: LevelDef) {
    this.theme = themes[def.theme ?? 'station']
    this.map = new ShipMap(def.layout, shipMapOptions(def.id))
    this.y = def.id * LEVEL_HEIGHT
    this.group.position.y = this.y
    this.glowMat = beamMaterial()

    this.buildFloors()
    this.buildWalls()
    this.buildProps()
    this.buildLift()
    if (def.engine) this.buildEngine()
    this.flushStatic()

    for (const [x, z, color, intensity, flicker] of def.lights) {
      this.lights.push({ position: new THREE.Vector3(x, this.y + 1.4, z), color: new THREE.Color(color), intensity, flicker })
    }
    this.pathfinder = new Pathfinder(this.map, this.blockedTiles, this.colliders)
    // Ses meubles viennent de l'aménagement du joueur (cf. main.ts) : ils s'ajoutent au reste du pont.
    if (def.cabin) this.cabin = new CabinView(this, def.cabin)
  }

  roomName(x: number, z: number): string {
    const r = this.map.room(Math.round(x), Math.round(z))
    return r ? this.def.rooms[r] ?? '' : ''
  }

  // ------------------------------------------------------------------ build

  /** Modèle du kit, repeint avec `material` (la coque ou le mobilier du thème du pont). */
  private place(name: StationModel, x: number, y: number, z: number, rotY = 0, material: THREE.Material = this.theme.shell): THREE.Object3D {
    const o = station(name)
    o.position.set(x, y, z)
    o.rotation.y = rotY
    o.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).material = material
    })
    o.updateMatrixWorld(true)
    return o
  }

  /**
   * Volume invisible aux dimensions d'un meuble fusionné : il ne coûte aucun appel de dessin,
   * mais le lancer de rayon (clic, survol) le touche quand même.
   */
  private pickVolume(box: THREE.Box3): THREE.Object3D {
    const size = box.getSize(new THREE.Vector3())
    const volume = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), PICK_MATERIAL)
    box.getCenter(volume.position)
    volume.visible = false
    this.group.add(volume)
    return volume
  }

  private addEmitter(kind: EmitterKind, position: THREE.Vector3) {
    const list = this.emitters.get(kind) ?? []
    list.push(position)
    this.emitters.set(kind, list)
  }

  /** Objet qui ne bouge jamais : sa géométrie est fusionnée avec les autres (1 appel de dessin par matériau). */
  private addStatic(o: THREE.Object3D, cast: boolean) {
    this.merge.add(o, cast)
  }

  /** Occulteur immobile : fusionné, tramé via la texture de fondu. */
  private addFading(o: THREE.Object3D, center: THREE.Vector3, outward?: Occluder['outward']) {
    this.occluders.push(this.merge.addFading(o, center, undefined, outward))
  }

  /**
   * Côté extérieur de la cabine pour un mur (milieu d'une arête) ou un poteau (sommet) posé sur
   * son pourtour : somme des directions « tuile de la cabine → point » des tuiles qui le touchent.
   * En mode aménagement, les murs tournés vers la caméra s'estompent pour laisser voir l'intérieur.
   */
  private cabinOutward(x: number, z: number): Occluder['outward'] {
    const room = this.def.cabin?.room
    if (!room) return undefined
    let ox = 0, oz = 0
    for (let tz = Math.ceil(z - 0.5 - 1e-6); tz <= Math.floor(z + 0.5 + 1e-6); tz++) {
      for (let tx = Math.ceil(x - 0.5 - 1e-6); tx <= Math.floor(x + 0.5 + 1e-6); tx++) {
        if (this.map.room(tx, tz) !== room) continue
        ox += x - tx
        oz += z - tz
      }
    }
    return Math.abs(ox) > 1e-6 || Math.abs(oz) > 1e-6 ? { x: Math.sign(Math.round(ox * 10)), z: Math.sign(Math.round(oz * 10)) } : undefined
  }

  private flushStatic() {
    this.fades = fadeBuffer(this.merge.fadingCount)
    this.merge.flush(this.group, this.fades.texture)
  }

  /** Occulteur autonome (reste un objet à part) : il reçoit son propre matériau « tramable ». */
  private addOccluder(objects: THREE.Object3D[], center: THREE.Vector3, outward?: Occluder['outward']) {
    const fade = { value: 1 }
    const cache = new Map<THREE.Material, THREE.Material>()
    for (const o of objects) {
      o.traverse((c) => {
        const m = c as THREE.Mesh
        if (!m.isMesh) return
        const src = m.material as THREE.Material
        let dst = cache.get(src)
        if (!dst) cache.set(src, (dst = makeFadeable(src, fade)))
        m.material = dst
      })
      this.group.add(o)
    }
    this.occluders.push({ center, value: 1, uniform: fade, outward })
  }

  private buildFloors() {
    const hullMat = new THREE.MeshLambertMaterial({ color: '#23263a' })
    const hullGeo = new THREE.BoxGeometry(1, 0.35, 1)
    for (let z = 0; z < this.map.height; z++) {
      for (let x = 0; x < this.map.width; x++) {
        const room = this.map.room(x, z)
        if (!room) continue
        let model: StationModel = this.def.floors?.[room] ?? 'floor'
        // Quelques dalles à picots pour varier, sauf dans les quartiers (les tapis y sont posés à plat).
        if (model === 'floor' && this.def.theme !== 'cozy' && hash(x, z) % 9 === 0) model = 'floor-detail'
        this.addStatic(this.place(model, x, FLOOR_Y, z), false)
        // Coque sombre sous le plancher, pour donner de l'épaisseur au vaisseau.
        const h = new THREE.Mesh(hullGeo, hullMat)
        h.position.set(x, FLOOR_Y - 0.175, z)
        this.addStatic(h, false)
      }
    }
  }

  private buildWalls() {
    const built = new Set<string>()
    // Nombre de murs touchant chaque sommet de la grille, par axe.
    const vertex = new Map<string, { h: number; v: number }>()
    const touch = (vx: number, vz: number, axis: 'h' | 'v') => {
      const k = `${vx},${vz}`
      const c = vertex.get(k) ?? { h: 0, v: 0 }
      c[axis]++
      vertex.set(k, c)
    }

    for (const door of this.map.doors) {
      built.add(this.map.edgeKey(door.x, door.z, door.dir))
      this.buildDoor(door.x, door.z, door.dir, touch)
    }

    for (let z = 0; z < this.map.height; z++) {
      for (let x = 0; x < this.map.width; x++) {
        const room = this.map.room(x, z)
        if (!room) continue
        for (let dir = 0; dir < 4; dir++) {
          if (this.map.edge(x, z, dir) !== 'wall') continue
          const key = this.map.edgeKey(x, z, dir)
          if (built.has(key)) continue
          built.add(key)

          const d = DIRS[dir]
          const cx = x + d.dx * 0.5
          const cz = z + d.dz * 0.5
          const alongX = d.dz !== 0
          const exterior = !this.map.isFloor(x + d.dx, z + d.dz)
          const hsh = hash(Math.round(cx * 2), Math.round(cz * 2))
          const windowRate = this.def.windows?.[room] ?? 1 / 3

          let model: 'wall' | 'wall-window' | 'wall-pillar' = 'wall'
          if (exterior && (hsh % 1000) / 1000 < windowRate) model = 'wall-window'
          else if (!exterior && hsh % 5 === 0) model = 'wall-pillar'
          const wall = this.place(model, cx, 0, cz, alongX ? 0 : Math.PI / 2)
          this.addFading(wall, new THREE.Vector3(cx, 0.5, cz), this.cabinOutward(cx, cz))
          this.walls.push({ x: cx, z: cz, alongX, model })

          if (alongX) {
            this.colliders.push({ minX: cx - 0.5, maxX: cx + 0.5, minZ: cz - WALL_T / 2, maxZ: cz + WALL_T / 2 })
            touch(cx - 0.5, cz, 'h')
            touch(cx + 0.5, cz, 'h')
          } else {
            this.colliders.push({ minX: cx - WALL_T / 2, maxX: cx + WALL_T / 2, minZ: cz - 0.5, maxZ: cz + 0.5 })
            touch(cx, cz - 0.5, 'v')
            touch(cx, cz + 0.5, 'v')
          }
        }
      }
    }

    // Poteaux aux angles, là où deux murs ne sont pas dans le prolongement l'un de l'autre.
    const post = makePostMesh(this.theme.shell)
    for (const [k, c] of vertex) {
      const straight = (c.h === 2 && c.v === 0) || (c.v === 2 && c.h === 0)
      if (straight) continue
      const [vx, vz] = k.split(',').map(Number)
      const m = post.clone()
      m.position.set(vx, POST_H / 2, vz)
      this.addFading(m, new THREE.Vector3(vx, 0.5, vz), this.cabinOutward(vx, vz))
      this.posts.push({ x: vx, z: vz })
      const hs = POST_W / 2
      this.colliders.push({ minX: vx - hs, maxX: vx + hs, minZ: vz - hs, maxZ: vz + hs })
    }
  }

  private buildDoor(x: number, z: number, dir: number, touch: (vx: number, vz: number, a: 'h' | 'v') => void) {
    const d = DIRS[dir]
    const cx = x + d.dx * 0.5
    const cz = z + d.dz * 0.5
    const alongX = d.dz !== 0
    const rot = alongX ? 0 : Math.PI / 2
    const frame = this.place('wall-door', cx, 0, cz, rot)
    // Panneau légèrement aminci : pas de faces confondues avec l'encadrement.
    const panel = this.place('door-single', cx, 0, cz, rot)
    panel.scale.set(0.98, 0.99, 0.9)
    // Voyant rouge au-dessus de l'ouverture, des deux côtés : la porte est verrouillée.
    const lamp = new THREE.Mesh(LOCK_LAMP_GEO, LOCK_LAMP_MAT)
    lamp.position.set(cx, 0.84, cz)
    lamp.rotation.y = rot
    lamp.visible = this.map.isLocked(x, z, dir)
    // Tramé avec la porte : il s'efface avec elle devant le joueur.
    this.addOccluder([frame, panel, lamp], new THREE.Vector3(cx, 0.5, cz), this.cabinOutward(cx, cz))
    this.walls.push({ x: cx, z: cz, alongX, model: 'door' })
    this.doors.push({
      panel,
      center: new THREE.Vector3(cx, 0, cz),
      axis: alongX ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1),
      open: 0,
      wanted: false,
      x,
      z,
      dir,
      lamp,
    })
    const closed = this.closedText(x, z, dir)
    if (closed) {
      this.interactables.push({
        object: panel,
        position: new THREE.Vector3(cx, 0, cz),
        label: tr('Examiner', 'Examine'),
        text: () => (this.map.isLocked(x, z, dir) ? closed : tr('La porte est ouverte.', 'The door is open.')),
      })
    }

    const g = DOOR_GAP / 2
    const t = WALL_T / 2
    if (alongX) {
      this.colliders.push({ minX: cx - 0.5, maxX: cx - g, minZ: cz - t, maxZ: cz + t })
      this.colliders.push({ minX: cx + g, maxX: cx + 0.5, minZ: cz - t, maxZ: cz + t })
      touch(cx - 0.5, cz, 'h')
      touch(cx + 0.5, cz, 'h')
    } else {
      this.colliders.push({ minX: cx - t, maxX: cx + t, minZ: cz - 0.5, maxZ: cz - g })
      this.colliders.push({ minX: cx - t, maxX: cx + t, minZ: cz + g, maxZ: cz + 0.5 })
      touch(cx, cz - 0.5, 'v')
      touch(cx, cz + 0.5, 'v')
    }
  }

  /** Texte d'une porte verrouillée : celui de la pièce en travaux qu'elle ferme. */
  private closedText(x: number, z: number, dir: number): string | string[] | undefined {
    if (!this.map.isLocked(x, z, dir)) return undefined
    const d = DIRS[dir]
    for (const r of [this.map.room(x, z), this.map.room(x + d.dx, z + d.dz)]) {
      const text = r ? this.def.closed?.[r] : undefined
      if (text) return text
    }
    return undefined
  }

  private buildProps() {
    const box = new THREE.Box3()
    for (const p of this.def.props) {
      const rotY = ((p.rot ?? 0) * Math.PI) / 2
      let o: THREE.Object3D
      let control: FurnitureControl | undefined
      if (isCustomModel(p.model)) {
        // Graine tirée de la position : chaque meuble varie, mais pareil chez tous les joueurs.
        const f = buildFurniture(p.model, p.label, hash(Math.round(p.x * 10), Math.round(p.z * 10)))
        control = f.control
        if (f.live) {
          f.live.position.set(p.x, p.y ?? 0, p.z)
          f.live.rotation.y = rotY
          this.group.add(f.live)
        }
        if (f.update) this.animated.push({ update: f.update, interactive: !!f.control })
        if (f.emitter) this.addEmitter(f.emitter, new THREE.Vector3(p.x, this.y + 0.6, p.z))
        // Hologramme pur : ni collision, ni interaction.
        if (!f.solid) continue
        o = f.solid
        o.position.set(p.x, p.y ?? 0, p.z)
        o.rotation.y = rotY
        o.updateMatrixWorld(true)
      } else {
        o = this.place(p.model, p.x, p.y ?? 0, p.z, rotY, this.theme.furniture)
      }
      box.setFromObject(o)
      const center = box.getCenter(new THREE.Vector3())
      if (p.solid !== false) {
        const m = 0.04
        const b = { minX: box.min.x + m, maxX: box.max.x - m, minZ: box.min.z + m, maxZ: box.max.z - m }
        this.colliders.push(b)
        for (let tz = Math.floor(b.minZ); tz <= Math.ceil(b.maxZ); tz++) {
          for (let tx = Math.floor(b.minX); tx <= Math.ceil(b.maxX); tx++) {
            // Tuile bloquée si son centre est sous le meuble (avec une petite marge).
            if (tx > b.minX - 0.15 && tx < b.maxX + 0.15 && tz > b.minZ - 0.15 && tz < b.maxZ + 0.15) {
              this.blockedTiles.add(`${tx},${tz}`)
            }
          }
        }
      }

      // Tout le mobilier est fusionné avec le pont (les grands meubles restent tramables un par un) ;
      // un meuble interactif se clique grâce à un volume invisible.
      if (box.max.y > 0.6) this.addFading(o, center)
      else this.addStatic(o, true)

      const seats = seatsOf(p.model, p.label)
      if (p.interact || seats || p.music) {
        const label = p.action ?? (seats ? seatAction(seats) : tr('Examiner', 'Examine'))
        const it: Interactable = { object: this.pickVolume(box), position: center.clone().setY(0), label, text: p.interact, control, furniture: { model: p.model, label: p.label } }
        if (seats) it.seats = (toward) => placeSeats(seats, p.x, p.z, rotY, toward).map((s) => ({ ...s, y: s.y + (p.y ?? 0) }))
        this.interactables.push(it)
      }
      // Les consoles du poste de pilotage bipent.
      if (this.def.id === 0 && this.map.room(Math.round(p.x), Math.round(p.z)) === 'b' && p.model.startsWith('computer')) {
        this.addEmitter('beep', new THREE.Vector3(center.x, this.y + 0.6, center.z))
      }
    }
  }

  /**
   * Ascenseur, identique sur tous les ponts : plateforme, halo au sol qui pulse, faisceau,
   * anneaux qui montent et panneau flottant (qui dépasse des murs : on le repère de loin).
   */
  private buildLift() {
    const { x, z } = LIFT
    const cyan = '#59d8ff'
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.44, 0.47, 0.06, 32),
      new THREE.MeshStandardMaterial({ color: '#3d424e', metalness: 0.7, roughness: 0.35 }),
    )
    base.position.set(x, 0.03, z)
    base.receiveShadow = true
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.03, 8, 48), new THREE.MeshBasicMaterial({ color: cyan }))
    ring.rotation.x = Math.PI / 2
    ring.position.set(x, 0.065, z)
    this.liftHalo = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.62, 48),
      new THREE.MeshBasicMaterial({ color: cyan, transparent: true, opacity: 0.5, depthWrite: false }),
    )
    this.liftHalo.rotation.x = -Math.PI / 2
    this.liftHalo.position.set(x, 0.012, z)
    // Mélange normal (et non additif) : le faisceau reste visible sur les sols clairs.
    this.liftBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.4, 32, 1, true), beamMaterial(false))
    this.liftBeam.position.set(x, 0.75, z)
    ;(this.liftBeam.material as THREE.ShaderMaterial).uniforms.uColor.value.set(cyan)
    this.liftRings = [0, 1, 2].map(() => {
      const r = new THREE.Mesh(
        new THREE.TorusGeometry(0.4, 0.014, 6, 40),
        new THREE.MeshBasicMaterial({ color: '#bff3ff', transparent: true, depthWrite: false }),
      )
      r.rotation.x = Math.PI / 2
      r.position.set(x, 0.1, z)
      return r
    })
    this.liftSign = new THREE.Sprite(new THREE.SpriteMaterial({ map: liftSignTexture(), transparent: true, depthWrite: false }))
    this.liftSign.scale.setScalar(0.46)
    this.liftSign.position.set(x, 1.55, z)
    this.group.add(base, ring, this.liftHalo, this.liftBeam, ...this.liftRings, this.liftSign)
    this.liftItem = { object: base, position: new THREE.Vector3(x, 0, z), label: tr('Ascenseur', 'Lift') }
    this.interactables.push(this.liftItem)
  }

  /** Signale un trajet d'ascenseur (le faisceau s'intensifie). */
  pulseLift() {
    this.liftBoost = 1
  }

  get liftInteractable(): Interactable {
    return this.liftItem
  }

  /** Cœur du réacteur (salle des machines) et tuyères à l'arrière du vaisseau. */
  private buildEngine() {
    const cx = 4.5, cz = 4.5
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.95, 0.15, 24),
      new THREE.MeshStandardMaterial({ color: '#3d424e', metalness: 0.6, roughness: 0.4 }),
    )
    base.position.set(cx, 0.075, cz)
    this.addStatic(base, false)

    this.coreMat = new THREE.MeshStandardMaterial({ color: '#66e0ff', emissive: '#29c8ff', emissiveIntensity: 2.5 })
    this.core = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.3, 24, 1, true), this.coreMat)
    this.core.position.set(cx, 0.8, cz)
    this.group.add(this.core)

    const ringMat = new THREE.MeshStandardMaterial({ color: '#f08a24', metalness: 0.5, roughness: 0.35 })
    for (const y of [0.3, 0.8, 1.3]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.07, 10, 32), ringMat)
      ring.rotation.x = Math.PI / 2
      ring.position.set(cx, y, cz)
      this.addStatic(ring, true)
    }
    this.colliders.push({ minX: cx - 0.8, maxX: cx + 0.8, minZ: cz - 0.8, maxZ: cz + 0.8 })
    for (const [tx, tz] of [[4, 4], [5, 4], [4, 5], [5, 5]]) this.blockedTiles.add(`${tx},${tz}`)
    this.interactables.push({
      object: this.core,
      position: new THREE.Vector3(cx, 0, cz),
      label: tr('Examiner', 'Examine'),
      text: tr(
        'Centrale électrique 5A : 98 % de sa capacité. Un bourdonnement grave fait vibrer le plancher.',
        '5A power plant: running at 98% capacity. A deep hum makes the floor vibrate.',
      ),
    })
    this.engineEmitters.push(new THREE.Vector3(cx, this.y + 0.8, cz))

    // Tuyères : sortent de la coque côté ouest (poupe).
    const nozzleMat = new THREE.MeshStandardMaterial({ color: '#3b3f5e', metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide })
    for (const z of [3, 6]) {
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.42, 0.8, 20, 1, true), nozzleMat)
      nozzle.rotation.z = Math.PI / 2
      nozzle.position.set(-0.8, -0.2, z)
      this.addStatic(nozzle, false)
      const plume = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.6, 20, 1, true), this.glowMat)
      plume.rotation.z = Math.PI / 2
      plume.position.set(-2.4, -0.2, z)
      this.group.add(plume)
      this.plumes.push(plume)
      this.engineEmitters.push(new THREE.Vector3(-1.6, this.y - 0.2, z))
    }
  }

  // ----------------------------------------------------------------- update

  /**
   * @param actors positions (monde) de tous les personnages présents sur ce pont (portes)
   * @param focus position du joueur local si ce pont est affiché (murs tramés), sinon null
   * @param toCamera direction horizontale (normalisée) du joueur vers la caméra
   * @param editing mode aménagement : les murs de la cabine tournés vers la caméra s'estompent
   * @param keep meuble où le joueur est installé : il ne s'estompe pas (cf. FadeFocus)
   * @param fade temps écoulé pour le tramage, qui suit la caméra même quand l'instant est figé (mode photo)
   */
  update(dt: number, actors: THREE.Vector3[], focus: THREE.Vector3 | null, toCamera: THREE.Vector3, editing = false, keep: { x: number; z: number } | null = null, fade = dt) {
    this.time += dt

    // Portes automatiques (sauf celles qui sont verrouillées).
    for (const d of this.doors) {
      const locked = this.map.isLocked(d.x, d.z, d.dir)
      d.lamp.visible = locked
      const wanted = !locked && actors.some((a) => Math.hypot(a.x - d.center.x, a.z - d.center.z) < DOOR_RANGE)
      if (wanted !== d.wanted) {
        d.wanted = wanted
        this.onDoor?.(new THREE.Vector3(d.center.x, this.y + 0.5, d.center.z), wanted)
      }
      d.open = THREE.MathUtils.damp(d.open, wanted ? 1 : 0, 10, dt)
      d.panel.position.copy(d.center).addScaledVector(d.axis, d.open * 0.42)
    }

    if (!focus) return

    // Murs et gros meubles entre la caméra et le joueur : tramés.
    if (updateOccluders(this.occluders, this.fades, { focus, toCamera, cabin: editing, keep }, fade)) this.fades.texture.needsUpdate = true

    this.glowMat.uniforms.uTime.value = this.time
    const beam = this.liftBeam.material as THREE.ShaderMaterial
    this.liftBoost = Math.max(0, this.liftBoost - dt * 0.8)
    beam.uniforms.uTime.value = this.time
    beam.uniforms.uIntensity.value = 0.42 + Math.sin(this.time * 2) * 0.06 + this.liftBoost * 0.8
    for (const [i, r] of this.liftRings.entries()) {
      const k = (this.time * 0.45 + i / this.liftRings.length) % 1
      r.position.y = 0.1 + k * 1.25
      ;(r.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.9
    }
    ;(this.liftHalo.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.25 * Math.sin(this.time * 2.5) + this.liftBoost * 0.4
    this.liftSign.position.y = 1.55 + Math.sin(this.time * 1.6) * 0.04

    tickFurniture(this.time)
    const frame = Math.floor(this.time * 12)
    const decorate = !renderQuality.light || frame !== this.decorationFrame
    this.decorationFrame = frame
    for (const a of this.animated) if (decorate || a.interactive) a.update(this.time)
    this.cabin?.update(this.time, fade, { focus: editing && this.cabin ? this.cabin.center : focus, toCamera, cabin: editing, keep })

    if (this.core && this.coreMat) {
      this.coreMat.emissiveIntensity = 2.2 + Math.sin(this.time * 3) * 0.6
      this.core.rotation.y += dt * 0.8
    }
    for (const [i, p] of this.plumes.entries()) {
      const s = 1 + Math.sin(this.time * 25 + i * 2) * 0.06
      p.scale.set(s, 1 + Math.sin(this.time * 17 + i) * 0.1, s)
    }
  }
}

/** Poteau d'angle qui réutilise le matériau (et la couleur exacte) des murs du pont. */
function makePostMesh(material: THREE.Material): THREE.Mesh {
  let src: THREE.Mesh | undefined
  station('wall').traverse((o) => {
    if (!src && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh
  })
  const geo = new THREE.BoxGeometry(POST_W, POST_H, POST_W)
  // Toutes les UV pointent sur le texel du dessus du mur.
  const g = src!.geometry
  const pos = g.getAttribute('position')
  const uv = g.getAttribute('uv')
  let best = 0
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) > pos.getY(best)) best = i
  const u = uv.getX(best), v = uv.getY(best)
  const uvs = geo.getAttribute('uv')
  for (let i = 0; i < uvs.count; i++) uvs.setXY(i, u, v)
  const m = new THREE.Mesh(geo, material)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** Panneau de l'ascenseur : pastille sombre cerclée de cyan, flèches vers le haut et vers le bas. */
function liftSignTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = 'rgba(10, 22, 36, 0.85)'
  g.strokeStyle = '#59d8ff'
  g.lineWidth = 7
  g.beginPath()
  g.roundRect(8, 8, 112, 112, 26)
  g.fill()
  g.stroke()
  g.fillStyle = '#bff3ff'
  for (const [tip, base] of [[22, 56], [106, 72]]) {
    g.beginPath()
    g.moveTo(64, tip)
    g.lineTo(92, base)
    g.lineTo(36, base)
    g.closePath()
    g.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}
