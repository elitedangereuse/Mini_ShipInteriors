import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { renderQuality } from './quality'
import { floorFinishes, station, themes, type StationModel, type Theme, type ThemeMaterials } from './assets'
import { CabinView } from './cabin/view'
import { DoorHints } from './door-hints'
import { makeFadeable } from './fade'
import { beamMaterial, buildFurniture, isCustomModel, tickFurniture, type Emitter, type FurnitureControl } from './furniture'
import { tr } from './i18n'
import { LEVEL_HEIGHT, LIFT, type Flicker, type LevelDef } from './levels'
import { DIRS, ShipMap } from './map'
import { Hull } from './hull'
import { fadeBuffer, StaticMerge, updateOccluders, type FadeBuffer, type Occluder } from './merge'
import { Pathfinder } from './pathfinding'
import type { Doorway } from './physics'
import { DOOR_GAP } from '../shared/sight.js'
import { shipMapOptions } from '../shared/ship-layouts.js'
import { placeSeats, seatAction, seatsOf, type SeatSpot } from './seats'
import { ForceShield, type ShieldPane } from './shield'
import { emptyPlan, HomeView } from './housing/home'

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
  /**
   * Installé ici, c'est ce meuble-là qui ne s'estompe pas (son centre) : le Krait, pour son
   * escabeau, puisqu'on s'assoit dans le cockpit. Par défaut, le meuble lui-même.
   */
  keep?: THREE.Vector3
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

/** Porte automatique : son panneau glisse quand quelqu'un approche (sauf si elle est verrouillée). */
export interface DoorState {
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
  /** Porte double (sur deux tuiles) : le second battant (`panel` est le premier), chacun s'écarte de son côté. */
  pair?: THREE.Object3D
  /** Invite de la porte tant qu'elle est verrouillée (cf. Deck.update). */
  examine?: Interactable
  /**
   * Collision qui bouche l'ouverture tant que la porte est verrouillée (au clavier, on passerait
   * entre les montants), et le rectangle qu'elle prend alors ; déverrouillée, elle est rangée au loin.
   */
  bar?: { box: Box2; gap: Box2 }
  /**
   * Porte qui ne glisse pas (battante, de saloon, rideau de perles… cf. cabin/partitions.ts) :
   * place ses battants selon l'ouverture (0 fermée, 1 ouverte), à la place du glissement.
   */
  animate?: (open: number) => void
  /** Porte sans chuintement pneumatique (bois, perles…). */
  quiet?: boolean
}

/** Où se range la collision d'une porte ouverte : hors de portée de tout. */
const NOWHERE: Box2 = { minX: -1e6, maxX: -1e6, minZ: -1e6, maxZ: -1e6 }

export const WALL_T = 0.3
/**
 * Poteau d'angle : un peu plus large et plus haut que les murs, pour recouvrir
 * entièrement la zone où deux murs se chevauchent (sinon leurs dessus, au même
 * niveau, se battent pour le même pixel : z-fighting en dents de scie).
 */
export const POST_W = WALL_T + 0.05
export const POST_H = 1.03
export const FLOOR_Y = -0.3
/**
 * Plafond (vue subjective seulement), bien au-dessus des têtes (0,72 pour le plus grand CMDR) :
 * les yeux sont à 0,59, un plafond bas écrase la vue. Les murs montent jusqu'à lui (cf.
 * upperWalls), et les lampes du pont (1,4) l'éclairent par en dessous.
 */
export const CEILING_Y = 2.2
/**
 * Portes grandies en vue subjective : leur ouverture (0,7) passait sous les yeux (0,74), on
 * traversait le linteau. Cadre, battants et voyant montent d'autant ; l'ouverture atteint 1.
 */
export const TALL_DOOR = 1.43
/** Dessus des murs de la baie infestée (cf. salvage/kit.ts) ; ceux du vaisseau font 1. */
const ZONE_WALL_TOP = 1.06
const DOOR_RANGE = 1.3

const PICK_MATERIAL = new THREE.MeshBasicMaterial()
/** Bandeau lumineux au pied des verrières. */
const CANOPY_TRIM = new THREE.MeshBasicMaterial({ color: '#ff8a1c' })
/** Verre des verrières, bleuté, à peine visible : on regarde l'espace à travers. */
const CANOPY_GLASS = new THREE.MeshLambertMaterial({ color: '#9fd8ff', transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide })

/** Serres (cf. `greenhouse` dans levels.ts) : verre à peine vert, montants blancs, allège de brique. */
const GREENHOUSE_GLASS = new THREE.MeshLambertMaterial({ color: '#d4f5dc', transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide })
const GREENHOUSE_FRAME = new THREE.MeshLambertMaterial({ color: '#f3f1ea' })
const GREENHOUSE_BRICK = new THREE.MeshLambertMaterial({ color: '#a4553a' })
/** Vitrage d'une serre : du haut de l'allège au rail du haut. */
const GREENHOUSE_SILL = 0.22
const GREENHOUSE_TOP = POST_H - 0.05

/**
 * Vue subjective : le verre, qui remplit alors toute la fenêtre, n'est plus qu'un reflet. Teinté
 * et éclairé comme vu de haut, il posait un voile gris sur l'espace.
 */
export function firstPersonGlass(on: boolean) {
  CANOPY_GLASS.opacity = on ? 0.05 : 0.2
  GREENHOUSE_GLASS.opacity = on ? 0.08 : 0.24
}

/**
 * Tous les pans de verre d'un pont, en un maillage (un appel de dessin) : entre l'allège et le
 * linteau, ou (vue subjective) du linteau au plafond.
 */
function canopyGlass(panes: { x: number; z: number; alongX: boolean }[], bottom = 0.27, top = POST_H - 0.1, material: THREE.Material = CANOPY_GLASS): THREE.Mesh {
  const geos = panes.map((p) => {
    const g = new THREE.PlaneGeometry(1, top - bottom)
    if (!p.alongX) g.rotateY(Math.PI / 2)
    g.translate(p.x, (bottom + top) / 2, p.z)
    return g
  })
  const mesh = new THREE.Mesh(mergeGeometries(geos), material)
  for (const g of geos) g.dispose()
  mesh.renderOrder = 2
  return mesh
}

/** Teinte du plafond selon l'ambiance du pont (cf. assets.ts), et dans la baie infestée. */
const CEILING_COLORS: Record<Theme | 'zone', string> = { station: '#5b6475', raw: '#4a4239', cozy: '#d8c6a6', zone: '#1d2322' }

/**
 * Panneaux de plafond d'une tuile : quatre plaques à joints fins et peu contrastés. Le plafond est
 * tout près des yeux (une tuile fait tout l'écran quand on lève la tête) : des joints marqués y
 * deviendraient des poutres.
 */
function ceilingPanel(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#c4c4c4'
  g.fillRect(0, 0, 128, 128)
  for (const [x, y] of [[0, 0], [64, 0], [0, 64], [64, 64]]) {
    g.fillStyle = '#f4f4f4'
    g.fillRect(x + 1.5, y + 1.5, 61, 61)
    g.fillStyle = '#ebebeb'
    g.fillRect(x + 9, y + 9, 46, 46)
    g.fillStyle = '#cfcfcf'
    for (const [rx, ry] of [[5, 5], [59, 5], [5, 59], [59, 59]]) g.fillRect(x + rx - 1, y + ry - 1, 2, 2)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}
let panelTexture: THREE.CanvasTexture | null = null

/**
 * Matériau du plafond d'une ambiance. Les lampes du pont sont au-dessus de lui (cf. Deck.lights)
 * et n'éclairent pas sa face du dessous : il s'éclaire donc un peu lui-même.
 */
const ceilingMaterials = new Map<string, THREE.MeshLambertMaterial>()
export function ceilingMaterial(look: Theme | 'zone'): THREE.MeshLambertMaterial {
  let m = ceilingMaterials.get(look)
  if (!m) {
    panelTexture ??= ceilingPanel()
    const color = new THREE.Color(CEILING_COLORS[look])
    m = new THREE.MeshLambertMaterial({ color, map: panelTexture, emissive: color, emissiveMap: panelTexture, emissiveIntensity: 0.55 })
    ceilingMaterials.set(look, m)
  }
  return m
}

/** Dalle de plafond d'une tuile, face tournée vers le bas (invisible d'au-dessus), à hauteur `y`. */
const CEILING_GEO = new THREE.PlaneGeometry(1, 1).rotateX(Math.PI / 2)
export function ceilingTile(x: number, z: number, y: number, material: THREE.Material): THREE.Mesh {
  const tile = new THREE.Mesh(CEILING_GEO, material)
  tile.position.set(x, y, z)
  tile.updateMatrixWorld(true)
  return tile
}

/**
 * Haut des murs, entre le dessus des murs et le plafond (vue subjective) : un pavé par pan de mur
 * et par poteau d'angle, qui s'estompe avec eux quand ils cachent le joueur.
 * @param wallTop dessus des murs, et `postTop` celui des poteaux (un peu plus hauts)
 */
export function upperWalls(merge: StaticMerge, walls: WallSegment[], posts: { x: number; z: number; green?: boolean }[], wallTop: number, postTop: number, top: number, material: THREE.Material, tallDoors = true): Occluder[] {
  const occluders: Occluder[] = []
  // Un rien plus mince que le mur : pas de faces confondues là où il déborde (linteaux des verrières).
  const t = WALL_T - 0.004
  for (const w of walls) {
    // Au-dessus d'une porte, le mur part du haut de son cadre grandi (cf. TALL_DOOR).
    const from = w.model === 'door' && tallDoors ? TALL_DOOR : wallTop
    const m = solidBox(w.alongX ? 1 : t, top - from, w.alongX ? t : 1, material)
    m.position.set(w.x, (from + top) / 2, w.z)
    occluders.push(merge.addFading(m, new THREE.Vector3(w.x, 0.5, w.z)))
  }
  for (const p of posts) {
    // Le poteau d'une serre continue en montant blanc et fin jusqu'à sa verrière.
    const w = p.green ? 0.06 : POST_W
    const m = solidBox(w, top - postTop, w, p.green ? GREENHOUSE_FRAME : material)
    m.position.set(p.x, (postTop + top) / 2, p.z)
    occluders.push(merge.addFading(m, new THREE.Vector3(p.x, 0.5, p.z)))
  }
  return occluders
}

/** Plafonnier sous une lampe du pont : un disque qui brille de sa couleur. */
const LAMP_GEO = new THREE.CylinderGeometry(0.15, 0.17, 0.025, 24)
const lampMaterials = new Map<string, THREE.MeshBasicMaterial>()
export function ceilingLamp(x: number, z: number, color: THREE.ColorRepresentation, y: number): THREE.Mesh {
  const c = new THREE.Color(color)
  const key = c.getHexString()
  let m = lampMaterials.get(key)
  if (!m) lampMaterials.set(key, (m = new THREE.MeshBasicMaterial({ color: c.lerp(new THREE.Color('#ffffff'), 0.55) })))
  const lamp = new THREE.Mesh(LAMP_GEO, m)
  lamp.position.set(x, y - 0.012, z)
  lamp.updateMatrixWorld(true)
  return lamp
}

/** Voyant d'une porte verrouillée : une barrette rouge qui dépasse des deux faces du linteau. */
const LOCK_LAMP_GEO = new THREE.BoxGeometry(0.16, 0.035, 0.33)
const LOCK_LAMP_MAT = new THREE.MeshBasicMaterial({ color: '#ff3b2f' })

/** Petit hash déterministe pour varier les murs sans aléatoire. */
export function hash(x: number, z: number): number {
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
  readonly lights: { position: THREE.Vector3; color: THREE.Color; intensity: number; flicker?: Flicker; distance?: number }[] = []
  /** Sources sonores (coordonnées monde). */
  readonly engineEmitters: THREE.Vector3[] = []
  /** Sons d'ambiance par type (bips, arcade, soudure, machines), en coordonnées monde. */
  readonly emitters = new Map<EmitterKind, THREE.Vector3[]>()
  /** Pans de mur et portes, en coordonnées du pont. */
  readonly walls: WallSegment[] = []
  /** Poteaux d'angle (centre, en coordonnées du pont ; côté POST_WIDTH). */
  /** Poteaux d'angle (centre) ; `green` : ceux d'une serre, blancs. */
  readonly posts: { x: number; z: number; green?: boolean }[] = []
  /** Pans de verrière (milieu de l'arête). */
  /** Pans de verre des verrières et des cloisons vitrées ; `green` : ceux d'une serre. */
  private readonly glass: { x: number; z: number; alongX: boolean; green?: boolean }[] = []
  /** Boucliers des hangars ouverts sur l'espace (cf. `shield` dans levels.ts). */
  private readonly shields: ForceShield[] = []

  /** Appelé quand une porte s'ouvre ou se ferme (position monde). */
  onDoor?: (position: THREE.Vector3, open: boolean) => void
  /** Repères des portes cachées par un mur ou un meuble (cf. door-hints.ts) ; faux en mode photo. */
  doorHints = true

  private occluders: Occluder[] = []
  private doors: DoorState[] = []
  private hints = new DoorHints()
  private merge = new StaticMerge()
  private fades!: FadeBuffer
  private time = 0
  private core?: THREE.Mesh
  private coreMat?: THREE.MeshStandardMaterial
  private plumes: THREE.Mesh[] = []
  /** Jets des tuyères. */
  private glowMat: THREE.ShaderMaterial
  private liftBeam?: THREE.Mesh
  private liftHalo?: THREE.Mesh
  private liftRings: THREE.Mesh[] = []
  private liftSign?: THREE.Sprite
  private liftItem?: Interactable
  private liftBoost = 0
  /** Animations du mobilier (hologrammes, drones…). */
  private animated: { update: (t: number) => void; interactive: boolean }[] = []
  private decorationFrame = -1
  /** Peinture de la coque et du mobilier du kit sur ce pont. */
  readonly theme: ThemeMaterials
  /** Cabine personnalisable du pont (les quartiers du commandant), dont chaque joueur a son exemplaire. */
  readonly cabin?: CabinView
  /** Parcelle affichée sur le pont des quartiers (cf. `bubble` dans levels.ts) : sa taille, ses murs. */
  readonly home?: HomeView
  private readonly hull = new Hull()
  /** Plafond, affiché en vue subjective seulement (cf. main.ts) ; les pièces d'extension y ajoutent le leur. */
  readonly ceiling = new THREE.Group()
  /** Hauteur du plafond au-dessus du sol du pont, et son matériau. */
  readonly ceilingY = CEILING_Y
  readonly ceilingMaterial: THREE.MeshLambertMaterial
  /** Haut des murs (vue subjective) : il s'estompe avec eux. */
  private ceilingOccluders: Occluder[] = []
  private ceilingFades!: FadeBuffer
  private ljpcCover?: THREE.Group
  private voieCover?: THREE.Group

  constructor(readonly def: LevelDef) {
    this.theme = themes[def.theme ?? 'station']
    this.map = new ShipMap(def.layout, def.zone?.map ?? def.mapOptions ?? (def.ground ? {} : shipMapOptions(def.id)))
    if (def.id === 0) for (const d of this.map.doors) {
      if (this.doorRoom(d.x, d.z, d.dir, 'l')) this.map.lock(d.x, d.z, d.dir)
    }
    if (def.id === -1) for (const d of this.map.doors) {
      if (this.doorRoom(d.x, d.z, d.dir, 'v')) this.map.lock(d.x, d.z, d.dir)
    }
    this.y = def.id * LEVEL_HEIGHT
    this.group.position.y = this.y
    this.ceilingMaterial = ceilingMaterial(def.zone ? 'zone' : def.theme ?? 'station')
    this.glowMat = beamMaterial()

    // Hors du vaisseau (la baie infestée, la base au sol) : ni coque, ni ascenseur, ni tuyères. Le
    // pont des quartiers a son ascenseur, mais ses parcelles flottent sur leur propre socle.
    const aboard = !def.zone && !def.ground
    const hulled = aboard && !def.bubble
    this.buildFloors()
    // La coque sous le pont : le corps du vaisseau, le même sous chaque pont (cf. hull.ts). La
    // baie infestée n'en a pas : elle flotte dans le noir. La base au sol repose sur ses falaises.
    if (hulled) this.group.add(this.hull.group)
    if (def.ground) this.addStatic(def.ground.skirt, false)
    this.buildWalls()
    this.buildProps()
    if (def.id === 0) this.ljpcCover = this.buildRoomCover('l', '#101722', '#263344')
    if (def.id === -1) this.voieCover = this.buildRoomCover('v', '#030303', '#080808')
    if (aboard) this.buildLift()
    if (def.engine) this.buildCore(def.engine.x, def.engine.z)
    if (hulled) this.buildNozzles(!!def.engine)
    this.flushStatic()
    this.buildCeiling()

    for (const [x, z, color, intensity, flicker, distance] of def.lights) {
      this.lights.push({ position: new THREE.Vector3(x, this.y + 1.4, z), color: new THREE.Color(color), intensity, flicker, distance })
    }
    this.pathfinder = new Pathfinder(this.map, this.blockedTiles, this.colliders)
    if (def.bubble) this.home = new HomeView(this)
    // Ses meubles viennent de l'aménagement du joueur (cf. main.ts) : ils s'ajoutent au reste du pont.
    if (def.cabin) this.cabin = new CabinView(this, def.cabin)
    // La parcelle se pose après la cabine : celle-ci reprend alors ses tuiles, ses murs et ses collisions.
    this.home?.set(0, emptyPlan())
  }

  roomName(x: number, z: number): string {
    const tx = Math.round(x), tz = Math.round(z)
    const area = this.def.areas?.find((a) => tx >= a.minX && tx <= a.maxX && tz >= a.minZ && tz <= a.maxZ && this.map.room(tx, tz))
    if (area) return area.name
    const r = this.map.room(Math.round(x), Math.round(z))
    return r ? this.def.rooms[r] ?? '' : ''
  }

  /** L'accès au labo est individuel : la porte et le plafond restent fermés sans badge. */
  setLjpcAccess(member: boolean) {
    if (this.def.id !== 0) return
    for (const d of this.map.doors) if (this.doorRoom(d.x, d.z, d.dir, 'l')) this.map.lock(d.x, d.z, d.dir, !member)
    this.syncLocks()
    this.pathfinder.invalidate()
    if (this.ljpcCover) this.ljpcCover.visible = !member
  }

  /** L'épreuve de la Voie ouvre le sanctuaire uniquement à son adepte. */
  setVoieAccess(adept: boolean) {
    if (this.def.id !== -1) return
    for (const d of this.map.doors) if (this.doorRoom(d.x, d.z, d.dir, 'v')) this.map.lock(d.x, d.z, d.dir, !adept)
    this.syncLocks()
    this.pathfinder.invalidate()
    if (this.voieCover) this.voieCover.visible = !adept
  }

  private doorRoom(x: number, z: number, dir: number, room: string) {
    const d = DIRS[dir]
    return this.map.room(x, z) === room || this.map.room(x + d.dx, z + d.dz) === room
  }

  private buildRoomCover(room: string, slabColor: string, rimColor: string): THREE.Group | undefined {
    const tiles: { x: number; z: number }[] = []
    for (let z = 0; z < this.map.height; z++) for (let x = 0; x < this.map.width; x++) {
      if (this.map.room(x, z) === room) tiles.push({ x, z })
    }
    if (!tiles.length) return undefined
    const x0 = Math.min(...tiles.map((t) => t.x)), x1 = Math.max(...tiles.map((t) => t.x))
    const z0 = Math.min(...tiles.map((t) => t.z)), z1 = Math.max(...tiles.map((t) => t.z))
    const w = x1 - x0 + 1.18, h = z1 - z0 + 1.18
    const cover = new THREE.Group()
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, h), new THREE.MeshBasicMaterial({ color: slabColor }))
    slab.position.set((x0 + x1) / 2, 1.13, (z0 + z1) / 2)
    cover.add(slab)
    const rim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.025, h + 0.04), new THREE.MeshBasicMaterial({ color: rimColor }))
    rim.position.copy(slab.position).y += 0.08
    cover.add(rim)
    this.group.add(cover)
    return cover
  }

  // ------------------------------------------------------------------ build

  /** Modèle du kit, repeint avec `material` (la coque ou le mobilier du thème du pont). */
  placeModel(name: StationModel, x: number, y: number, z: number, rotY = 0, material: THREE.Material = this.theme.shell): THREE.Object3D {
    return this.place(name, x, y, z, rotY, material)
  }

  /** Cadres, battants et voyants des portes du kit, grandis en vue subjective (cf. TALL_DOOR). */
  private tallParts = new Set<THREE.Object3D>()
  private tall = false

  /** À grandir avec les portes (la hauteur et l'échelle d'origine sont retenues). */
  registerTall(parts: THREE.Object3D[]) {
    for (const o of parts) {
      o.userData.baseY = o.position.y
      o.userData.baseScaleY = o.scale.y
      this.tallParts.add(o)
      if (this.tall) this.stretch(o, true)
    }
  }

  unregisterTall(parts: THREE.Object3D[]) {
    for (const o of parts) this.tallParts.delete(o)
  }

  /** Vue subjective : les portes à la taille du regard. */
  set tallDoors(on: boolean) {
    if (on === this.tall) return
    this.tall = on
    for (const o of this.tallParts) this.stretch(o, on)
  }

  private stretch(o: THREE.Object3D, on: boolean) {
    const k = on ? TALL_DOOR : 1
    o.scale.y = o.userData.baseScaleY * k
    o.position.y = o.userData.baseY * k
  }

  /** Porte construite après coup (pièces des extensions de quartiers) : elle s'ouvre comme les autres. */
  registerDoor(door: DoorState) {
    this.doors.push(door)
  }

  /** Invite d'une porte verrouillée à la construction (pour lui donner une action, cf. main.ts). */
  doorExamine(x: number, z: number, dir: number): Interactable | undefined {
    const key = this.map.edgeKey(x, z, dir)
    return this.doors.find((d) => this.map.edgeKey(d.x, d.z, d.dir) === key)?.examine
  }

  /** Ouvertures des portes où l'on passe (cf. funnelDoorway). */
  doorways(): Doorway[] {
    const out: Doorway[] = []
    for (const d of this.doors) {
      if (this.map.isLocked(d.x, d.z, d.dir)) continue
      out.push({ x: d.center.x, z: d.center.z, alongX: d.axis.x !== 0, half: d.pair ? 0.8 : DOOR_GAP / 2 })
    }
    return out
  }

  unregisterDoor(door: DoorState) {
    const i = this.doors.indexOf(door)
    if (i >= 0) this.doors.splice(i, 1)
    this.hints.remove(door)
  }

  /**
   * Portes verrouillées ou déverrouillées sur le plan (extensions des quartiers) : leur ouverture
   * se bouche ou se libère. À appeler avant de revalider les passages (cf. Pathfinder.invalidate).
   */
  syncLocks() {
    for (const d of this.doors) if (d.bar) Object.assign(d.bar.box, this.map.isLocked(d.x, d.z, d.dir) ? d.bar.gap : NOWHERE)
  }

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
    for (let z = 0; z < this.map.height; z++) {
      for (let x = 0; x < this.map.width; x++) {
        const room = this.map.room(x, z)
        if (!room) continue
        if (this.def.zone) {
          this.addStatic(this.def.zone.kit.floor(x, z, hash(x, z), this.def.zone.glow?.(x, z)), false)
          continue
        }
        if (this.def.ground) {
          this.addStatic(this.def.ground.floor(x, z), false)
          continue
        }
        let model: StationModel = this.def.floors?.[room] ?? 'floor'
        // Quelques dalles à picots pour varier, sauf dans les quartiers (les tapis y sont posés à plat).
        if (model === 'floor' && this.def.theme !== 'cozy' && hash(x, z) % 9 === 0) model = 'floor-detail'
        const finish = this.def.floorFinish?.[room]
        this.addStatic(this.place(model, x, FLOOR_Y, z, 0, finish ? floorFinishes[finish] : this.theme.shell), false)
      }
    }
  }

  /**
   * Plafond de toutes les pièces, en un maillage par matériau, avec un plafonnier sous chaque
   * lampe. L'ascenseur tient dessous (tube de 1,7, panneau à 1,55) : pas de trou vers le ciel.
   */
  private buildCeiling() {
    const merge = new StaticMerge()
    // À ciel ouvert : le ciel de la planète, pas de plafond.
    if (this.def.ground) {
      this.ceilingFades = fadeBuffer(0)
      this.ceiling.visible = false
      this.group.add(this.ceiling)
      return
    }
    // Une serre a pour plafond une verrière : du verre, des chevrons blancs, les étoiles au-dessus.
    const greenhouse = (x: number, z: number) => !!this.def.greenhouse?.includes(this.map.room(x, z) ?? '')
    const roof: { x: number; z: number }[] = []
    for (let z = 0; z < this.map.height; z++) {
      for (let x = 0; x < this.map.width; x++) {
        if (!this.map.room(x, z)) continue
        if (greenhouse(x, z)) roof.push({ x, z })
        else merge.add(ceilingTile(x, z, this.ceilingY, this.ceilingMaterial), false)
      }
    }
    for (const [x, z, color] of this.def.lights) {
      if (this.map.room(Math.round(x), Math.round(z)) && !greenhouse(Math.round(x), Math.round(z))) merge.add(ceilingLamp(x, z, color, this.ceilingY), false)
    }
    if (roof.length) this.ceiling.add(...greenhouseRoof(roof, this.ceilingY))
    const zone = this.def.zone
    const postTop = zone ? new THREE.Box3().setFromObject(zone.kit.post(0, 0)).max.y : POST_H
    const material = zone ? new THREE.MeshLambertMaterial({ color: '#1b2120' }) : this.theme.shell
    // Au-dessus des verrières et des cloisons vitrées, du verre jusqu'au plafond.
    const glazed = new Set(this.glass.map((g) => `${g.x},${g.z}`))
    const solid = this.walls.filter((w) => !glazed.has(`${w.x},${w.z}`))
    this.ceilingOccluders = upperWalls(merge, solid, this.posts, zone ? ZONE_WALL_TOP : 1, postTop, this.ceilingY, material, !zone)
    const [clear, greens] = [this.glass.filter((g) => !g.green), this.glass.filter((g) => g.green)]
    if (clear.length) this.ceiling.add(canopyGlass(clear, POST_H - 0.02, this.ceilingY))
    if (greens.length) this.ceiling.add(canopyGlass(greens, POST_H - 0.02, this.ceilingY, GREENHOUSE_GLASS))
    this.ceilingFades = fadeBuffer(merge.fadingCount)
    // Pas d'ombres : le soleil éclaire les pièces comme en vue isométrique.
    for (const m of merge.flush(this.ceiling, this.ceilingFades.texture)) m.castShadow = false
    this.ceiling.visible = false
    this.group.add(this.ceiling)
  }

  private buildWalls() {
    const built = new Set<string>()
    /** Pans des boucliers, par pièce et par côté. */
    const shieldPanes = new Map<string, ShieldPane[]>()
    // Nombre de murs touchant chaque sommet de la grille, par axe.
    const vertex = new Map<string, { h: number; v: number }>()
    /** Sommets touchés par un vitrage de serre : leurs poteaux sont blancs. */
    const greenVertex = new Set<string>()
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
          // Au bord du plateau de la base au sol, pas de mur : ses falaises (cf. GroundDef.skirt),
          // et une collision qui retient au bord.
          if (this.def.ground) {
            this.colliders.push(alongX
              ? { minX: cx - 0.5, maxX: cx + 0.5, minZ: cz - WALL_T / 2, maxZ: cz + WALL_T / 2 }
              : { minX: cx - WALL_T / 2, maxX: cx + WALL_T / 2, minZ: cz - 0.5, maxZ: cz + 0.5 })
            continue
          }
          const other = this.map.room(x + d.dx, z + d.dz)
          const exterior = !other
          const hsh = hash(Math.round(cx * 2), Math.round(cz * 2))
          const windowRate = this.def.windows?.[room] ?? 1 / 3

          let model: 'wall' | 'wall-window' | 'wall-pillar' = 'wall'
          if (exterior && (hsh % 1000) / 1000 < windowRate && !this.doorPocket(x, z, dir)) model = 'wall-window'
          else if (!exterior && hsh % 5 === 0) model = 'wall-pillar'
          const glazed = !!other && this.def.glazed?.some((pair) => pair.includes(room) && pair.includes(other))
          // Une serre : tous ses murs extérieurs sont vitrés, et ses cloisons vitrées ont le même cadre.
          const green = !!this.def.greenhouse?.includes(room) || (!!other && !!this.def.greenhouse?.includes(other))
          if (exterior && this.def.shield?.[room]?.includes(dir)) {
            // Hangar ouvert sur l'espace : pas de mur, le champ de force (sa collision reste celle d'un mur).
            const key = `${room}:${dir}`
            shieldPanes.set(key, [...(shieldPanes.get(key) ?? []), { x: cx, z: cz, alongX }])
          } else if (green && (exterior || glazed)) {
            // Vitrage de serre : allège de brique, montants et traverses blancs, verre à peine vert.
            this.addFading(greenhouseFrame(cx, cz, alongX), new THREE.Vector3(cx, 0.5, cz))
            this.glass.push({ x: cx, z: cz, alongX, green: true })
            this.walls.push({ x: cx, z: cz, alongX, model: 'wall-window' })
            for (const s of [-0.5, 0.5]) greenVertex.add(alongX ? `${cx + s},${cz}` : `${cx},${cz + s}`)
          } else if ((exterior && this.def.canopy?.[room]?.includes(dir)) || glazed) {
            // Verrière, ou cloison vitrée : une allège, un bandeau, et du verre entre les deux.
            this.addFading(this.canopyFrame(cx, cz, alongX), new THREE.Vector3(cx, 0.5, cz))
            this.glass.push({ x: cx, z: cz, alongX })
            this.walls.push({ x: cx, z: cz, alongX, model: 'wall-window' })
          } else {
            const wall = this.def.zone ? this.def.zone.kit.wall(cx, cz, alongX) : this.place(model, cx, 0, cz, alongX ? 0 : Math.PI / 2)
            this.addFading(wall, new THREE.Vector3(cx, 0.5, cz), this.cabinOutward(cx, cz))
            this.walls.push({ x: cx, z: cz, alongX, model })
          }

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
    const whitePost = makePostMesh(GREENHOUSE_FRAME)
    for (const [k, c] of vertex) {
      const straight = (c.h === 2 && c.v === 0) || (c.v === 2 && c.h === 0)
      if (straight) continue
      const [vx, vz] = k.split(',').map(Number)
      const m = this.def.zone ? this.def.zone.kit.post(vx, vz) : greenVertex.has(k) ? whitePost.clone() : post.clone()
      if (!this.def.zone) m.position.set(vx, POST_H / 2, vz)
      this.addFading(m, new THREE.Vector3(vx, 0.5, vz), this.cabinOutward(vx, vz))
      this.posts.push(greenVertex.has(k) ? { x: vx, z: vz, green: true } : { x: vx, z: vz })
      const hs = POST_W / 2
      this.colliders.push({ minX: vx - hs, maxX: vx + hs, minZ: vz - hs, maxZ: vz + hs })
    }
    const [clear, greens] = [this.glass.filter((g) => !g.green), this.glass.filter((g) => g.green)]
    if (clear.length) this.group.add(canopyGlass(clear))
    if (greens.length) this.group.add(canopyGlass(greens, GREENHOUSE_SILL, GREENHOUSE_TOP, GREENHOUSE_GLASS))
    for (const [key, panes] of shieldPanes) {
      const d = DIRS[Number(key.split(':')[1])]
      const shield = new ForceShield(panes, (d.dx + d.dz) as 1 | -1)
      this.shields.push(shield)
      this.group.add(shield.group)
    }
  }

  /** Cadre d'un pan de verrière (arête de milieu cx, cz) : allège, bandeau orange, linteau. */
  private canopyFrame(cx: number, cz: number, alongX: boolean): THREE.Object3D {
    const g = new THREE.Group()
    const w = 1, t = WALL_T
    const add = (h: number, y: number, material: THREE.Material, depth = t) => {
      const m = solidBox(alongX ? w : depth, h, alongX ? depth : w, material)
      m.position.set(cx, y, cz)
      g.add(m)
    }
    add(0.24, 0.12, this.theme.shell)
    add(0.03, 0.255, CANOPY_TRIM, t + 0.02)
    add(0.1, POST_H - 0.05 - 0.02, this.theme.shell)
    g.updateMatrixWorld(true)
    return g
  }

  /** Mur où rentre un battant de porte double (cf. `doubleDoors`) : plein, sans fenêtre où on le verrait. */
  private doorPocket(x: number, z: number, dir: number): boolean {
    const key = this.map.edgeKey(x, z, dir)
    return this.def.doubleDoors?.some((e) => {
      const a = e.dir % 2 === 0 ? { dx: 1, dz: 0 } : { dx: 0, dz: 1 }
      return this.map.edgeKey(e.x - a.dx, e.z - a.dz, e.dir) === key || this.map.edgeKey(e.x + 2 * a.dx, e.z + 2 * a.dz, e.dir) === key
    }) ?? false
  }

  private buildDoor(x: number, z: number, dir: number, touch: (vx: number, vz: number, a: 'h' | 'v') => void) {
    const d = DIRS[dir]
    const cx = x + d.dx * 0.5
    const cz = z + d.dz * 0.5
    const alongX = d.dz !== 0
    const rot = alongX ? 0 : Math.PI / 2
    const key = this.map.edgeKey(x, z, dir)
    const t = WALL_T / 2
    // Porte double (cf. `doubleDoors`) : deux arêtes voisines le long du mur, chacune avec le côté
    // d'un encadrement large du kit (montant en -x du modèle, tourné vers l'extérieur). La première
    // porte les deux battants ; la seconde, seulement son montant.
    const along = alongX ? { dx: 1, dz: 0 } : { dx: 0, dz: 1 }
    const first = this.def.doubleDoors?.some((e) => this.map.edgeKey(e.x, e.z, e.dir) === key) ?? false
    const second = !first && (this.def.doubleDoors?.some((e) => this.map.edgeKey(e.x + along.dx, e.z + along.dz, e.dir) === key) ?? false)
    if (second) {
      const frame = this.place('wall-door-edge', cx, 0, cz, alongX ? Math.PI : Math.PI / 2)
      this.addOccluder([frame], new THREE.Vector3(cx, 0.5, cz), this.cabinOutward(cx, cz))
      this.registerTall([frame])
      this.walls.push({ x: cx, z: cz, alongX, model: 'door' })
      // Le montant, au bout de l'ouverture (qui fait 1,6 sur les deux tuiles).
      if (alongX) this.colliders.push({ minX: cx + 0.3, maxX: cx + 0.5, minZ: cz - t, maxZ: cz + t })
      else this.colliders.push({ minX: cx - t, maxX: cx + t, minZ: cz + 0.3, maxZ: cz + 0.5 })
      touch(cx - along.dx * 0.5, cz - along.dz * 0.5, alongX ? 'h' : 'v')
      touch(cx + along.dx * 0.5, cz + along.dz * 0.5, alongX ? 'h' : 'v')
      return
    }
    if (this.def.zone) return this.buildGate(x, z, dir, cx, cz, alongX, touch)
    const frame = this.place(first ? 'wall-door-edge' : 'wall-door', cx, 0, cz, first && !alongX ? -Math.PI / 2 : rot)
    // Milieu de la porte : celui de l'arête, ou la jonction des deux tuiles d'une porte double.
    const mx = first ? cx + along.dx * 0.5 : cx
    const mz = first ? cz + along.dz * 0.5 : cz
    // Panneau légèrement aminci : pas de faces confondues avec l'encadrement. Porte double : les
    // battants du kit (0,6), élargis à 0,8 pour fermer chacun sa moitié.
    const panel = this.place(first ? 'door-double' : 'door-single', mx, 0, mz, rot)
    panel.scale.set(first ? 1.3 : 0.98, 0.99, 0.9)
    const pair = first ? this.place('door-double', mx, 0, mz, rot) : undefined
    pair?.scale.set(1.3, 0.99, 0.9)
    // Voyant rouge au-dessus de l'ouverture, des deux côtés : la porte est verrouillée.
    const lamp = new THREE.Mesh(LOCK_LAMP_GEO, LOCK_LAMP_MAT)
    lamp.position.set(mx, 0.84, mz)
    lamp.rotation.y = rot
    lamp.visible = this.map.isLocked(x, z, dir)
    // Tramé avec la porte : il s'efface avec elle devant le joueur.
    this.addOccluder(pair ? [frame, panel, pair, lamp] : [frame, panel, lamp], new THREE.Vector3(cx, 0.5, cz), this.cabinOutward(cx, cz))
    this.registerTall(pair ? [frame, panel, pair, lamp] : [frame, panel, lamp])
    this.walls.push({ x: cx, z: cz, alongX, model: 'door' })
    this.doors.push({
      panel,
      center: new THREE.Vector3(mx, 0, mz),
      axis: alongX ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1),
      open: 0,
      wanted: false,
      x,
      z,
      dir,
      lamp,
      pair,
    })
    // Porte verrouillée : on l'examine (pièce en travaux, extension de quartiers à débloquer). Une
    // porte d'extension se déverrouille en cours de partie : l'invite disparaît alors (cf. update).
    if (this.map.isLocked(x, z, dir)) {
      const state = this.doors[this.doors.length - 1]
      state.examine = {
        object: panel,
        position: new THREE.Vector3(mx, 0, mz),
        label: tr('Examiner', 'Examine'),
        text: () => this.closedText(x, z, dir) ?? tr('Porte verrouillée.', 'Locked door.'),
      }
      this.interactables.push(state.examine)
    }

    // Ouverture, de part et d'autre du milieu : 0,6, ou 1,6 pour une porte double (son second
    // montant est posé avec la seconde arête).
    const g = (first ? 1.6 : DOOR_GAP) / 2
    if (alongX) {
      this.colliders.push({ minX: cx - 0.5, maxX: mx - g, minZ: cz - t, maxZ: cz + t })
      if (!first) this.colliders.push({ minX: cx + g, maxX: cx + 0.5, minZ: cz - t, maxZ: cz + t })
      touch(cx - 0.5, cz, 'h')
      touch(cx + 0.5, cz, 'h')
    } else {
      this.colliders.push({ minX: cx - t, maxX: cx + t, minZ: cz - 0.5, maxZ: mz - g })
      if (!first) this.colliders.push({ minX: cx - t, maxX: cx + t, minZ: cz + g, maxZ: cz + 0.5 })
      touch(cx, cz - 0.5, 'v')
      touch(cx, cz + 0.5, 'v')
    }
    // Verrouillée, une porte double se bouche sur toute sa largeur (ses deux arêtes le sont ensemble).
    const gap = alongX ? { minX: mx - g, maxX: mx + g, minZ: cz - t, maxZ: cz + t } : { minX: cx - t, maxX: cx + t, minZ: mz - g, maxZ: mz + g }
    const box = { ...(this.map.isLocked(x, z, dir) ? gap : NOWHERE) }
    this.colliders.push(box)
    this.doors[this.doors.length - 1].bar = { box, gap }
  }

  /**
   * Porte du sas de la baie infestée (kit modulaire) : un encadrement épais et un vantail qui
   * coulisse dans le mur, comme les portes du vaisseau.
   */
  private buildGate(x: number, z: number, dir: number, cx: number, cz: number, alongX: boolean, touch: (vx: number, vz: number, a: 'h' | 'v') => void) {
    const { frame, door } = this.def.zone!.kit.gate(cx, cz, alongX)
    const lamp = new THREE.Mesh(LOCK_LAMP_GEO, LOCK_LAMP_MAT)
    lamp.position.set(cx, 0.84, cz)
    lamp.rotation.y = alongX ? 0 : Math.PI / 2
    lamp.visible = false
    this.addOccluder([frame, door, lamp], new THREE.Vector3(cx, 0.5, cz))
    this.walls.push({ x: cx, z: cz, alongX, model: 'door' })
    this.doors.push({
      panel: door, center: new THREE.Vector3(cx, 0, cz), axis: alongX ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1),
      open: 0, wanted: false, x, z, dir, lamp,
    })
    const g = DOOR_GAP / 2, t = WALL_T / 2
    if (alongX) {
      this.colliders.push({ minX: cx - 0.5, maxX: cx - g, minZ: cz - t, maxZ: cz + t }, { minX: cx + g, maxX: cx + 0.5, minZ: cz - t, maxZ: cz + t })
      touch(cx - 0.5, cz, 'h')
      touch(cx + 0.5, cz, 'h')
    } else {
      this.colliders.push({ minX: cx - t, maxX: cx + t, minZ: cz - 0.5, maxZ: cz - g }, { minX: cx - t, maxX: cx + t, minZ: cz + g, maxZ: cz + 0.5 })
      touch(cx, cz - 0.5, 'v')
      touch(cx, cz + 0.5, 'v')
    }
  }

  /** Texte d'une porte verrouillée : celui de la pièce en travaux qu'elle ferme. */
  private closedText(x: number, z: number, dir: number): string | string[] | undefined {
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
      let extent: THREE.Box3 | undefined
      if (p.model === 'prebuilt') {
        if (!p.object) continue
        o = p.object
        o.position.set(p.x, p.y ?? 0, p.z)
        o.rotation.y = rotY
        o.updateMatrixWorld(true)
      } else if (isCustomModel(p.model)) {
        // Graine tirée de la position : chaque meuble varie, mais pareil chez tous les joueurs.
        const f = buildFurniture(p.model, p.label, hash(Math.round(p.x * 10), Math.round(p.z * 10)))
        control = f.control
        extent = f.extent
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
      if (extent) box.copy(extent).applyMatrix4(o.matrixWorld)
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
        const position = p.reach ? new THREE.Vector3(p.reach.x, 0, p.reach.z) : center.clone().setY(0)
        const it: Interactable = { object: this.pickVolume(box), position, label, text: p.interact, control, furniture: { model: p.model, label: p.label } }
        if (seats) it.seats = (toward) => placeSeats(seats, p.x, p.z, rotY, toward).map((s) => ({ ...s, y: s.y + (p.y ?? 0), ...(s.via ? { via: s.via.map((v) => ({ ...v, y: v.y + (p.y ?? 0) })) } : {}) }))
        this.interactables.push(it)
      }
      // Les consoles du poste de pilotage bipent.
      if (this.def.id === 0 && this.map.room(Math.round(p.x), Math.round(p.z)) === 'b' && (p.model.startsWith('computer') || p.model.endsWith('console'))) {
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

  /** Faisceau et anneaux de l'ascenseur : cachés le temps d'un trajet, pour qu'on voie le personnage dans le tube. */
  showLiftBeam(on: boolean) {
    if (this.liftBeam) this.liftBeam.visible = on
    for (const r of this.liftRings) r.visible = on
  }

  /** L'ascenseur (absent de la baie infestée). */
  get liftInteractable(): Interactable | undefined {
    return this.liftItem
  }

  /** Cœur du réacteur, au centre de la salle des machines (cf. `engine` dans levels.ts). */
  private buildCore(cx: number, cz: number) {
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
    // Tuiles dont le centre est sous le socle.
    for (let tz = Math.ceil(cz - 0.8); tz <= Math.floor(cz + 0.8); tz++) {
      for (let tx = Math.ceil(cx - 0.8); tx <= Math.floor(cx + 0.8); tx++) this.blockedTiles.add(`${tx},${tz}`)
    }
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
  }

  /**
   * Tuyères : elles sortent de la coque côté ouest (poupe), à mi-hauteur, sous chaque pont ;
   * on ne les entend que depuis celui de la salle des machines (`sound`).
   */
  private buildNozzles(sound: boolean) {
    const nozzleMat = new THREE.MeshStandardMaterial({ color: '#3b3f5e', metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide })
    const stern = Hull.stern
    for (const z of [3, 6]) {
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.42, 0.8, 20, 1, true), nozzleMat)
      nozzle.rotation.z = Math.PI / 2
      nozzle.position.set(stern - 0.3, -0.75, z)
      this.addStatic(nozzle, false)
      const plume = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.6, 20, 1, true), this.glowMat)
      plume.rotation.z = Math.PI / 2
      plume.position.set(stern - 1.9, -0.75, z)
      this.group.add(plume)
      this.plumes.push(plume)
      if (sound) this.engineEmitters.push(new THREE.Vector3(stern - 1.1, this.y - 0.75, z))
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
      if (d.examine) {
        const i = this.interactables.indexOf(d.examine)
        if (locked && i < 0) this.interactables.push(d.examine)
        else if (!locked && i >= 0) this.interactables.splice(i, 1)
      }
      const wanted = !locked && actors.some((a) => Math.hypot(a.x - d.center.x, a.z - d.center.z) < DOOR_RANGE)
      if (wanted !== d.wanted) {
        d.wanted = wanted
        if (!d.quiet) this.onDoor?.(new THREE.Vector3(d.center.x, this.y + 0.5, d.center.z), wanted)
      }
      d.open = THREE.MathUtils.damp(d.open, wanted ? 1 : 0, 10, dt)
      if (d.animate) d.animate(d.open)
      else if (d.pair) {
        // Chaque battant (0,8 de large) part de son côté et rentre dans le mur.
        d.panel.position.copy(d.center).addScaledVector(d.axis, -0.4 - d.open * 0.78)
        d.pair.position.copy(d.center).addScaledVector(d.axis, 0.4 + d.open * 0.78)
      } else d.panel.position.copy(d.center).addScaledVector(d.axis, d.open * 0.42)
    }

    this.hints.update(this.doors, (d) => this.map.isLocked(d.x, d.z, d.dir), actors, focus, toCamera, this.doorHints, this.time, fade)

    if (!focus) return

    // Murs et gros meubles entre la caméra et le joueur : tramés.
    if (updateOccluders(this.occluders, this.fades, { focus, toCamera, cabin: editing, keep }, fade)) this.fades.texture.needsUpdate = true
    if (this.ceiling.visible && updateOccluders(this.ceilingOccluders, this.ceilingFades, { focus, toCamera, cabin: editing, keep }, fade)) this.ceilingFades.texture.needsUpdate = true

    this.glowMat.uniforms.uTime.value = this.time
    for (const s of this.shields) s.update(dt, toCamera, this.ceiling.visible ? this.ceilingY : null)
    this.home?.update(dt, fade, { focus, toCamera, cabin: editing, keep }, toCamera, this.ceiling.visible ? this.ceilingY : null)
    if (this.liftBeam && this.liftHalo && this.liftSign) {
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
    }

    tickFurniture(this.time)
    this.hull.update(this.time)
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

/** Point de la texture du kit où se trouve la couleur du dessus des murs (cf. solidBox). */
let wallTexel: [number, number] | null = null

/**
 * Pavé uni de la couleur exacte des murs du pont : toutes ses coordonnées de texture pointent
 * sur le texel du dessus du mur (poteaux d'angle, cadres des verrières).
 */
export function solidBox(w: number, h: number, d: number, material: THREE.Material): THREE.Mesh {
  if (!wallTexel) {
    let src: THREE.Mesh | undefined
    station('wall').traverse((o) => {
      if (!src && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh
    })
    const g = src!.geometry
    const pos = g.getAttribute('position')
    const uv = g.getAttribute('uv')
    let best = 0
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) > pos.getY(best)) best = i
    wallTexel = [uv.getX(best), uv.getY(best)]
  }
  const geo = new THREE.BoxGeometry(w, h, d)
  const uvs = geo.getAttribute('uv')
  for (let i = 0; i < uvs.count; i++) uvs.setXY(i, wallTexel[0], wallTexel[1])
  const m = new THREE.Mesh(geo, material)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/**
 * Pan de vitrage de serre (arête de milieu cx, cz) : allège de brique et son chaperon blanc, trois
 * carreaux séparés par deux montants, une traverse aux deux tiers, le rail du haut. Le verre est
 * posé à part (cf. canopyGlass).
 */
function greenhouseFrame(cx: number, cz: number, alongX: boolean): THREE.Object3D {
  const g = new THREE.Group()
  const t = WALL_T
  const add = (w: number, h: number, depth: number, y: number, along: number, material: THREE.Material) => {
    const m = solidBox(alongX ? w : depth, h, alongX ? depth : w, material)
    m.position.set(cx + (alongX ? along : 0), y, cz + (alongX ? 0 : along))
    g.add(m)
  }
  add(1, GREENHOUSE_SILL - 0.02, t, (GREENHOUSE_SILL - 0.02) / 2, 0, GREENHOUSE_BRICK)
  add(1, 0.03, t + 0.03, GREENHOUSE_SILL - 0.005, 0, GREENHOUSE_FRAME)
  add(1, 0.04, t * 0.6, 0.72, 0, GREENHOUSE_FRAME)
  add(1, POST_H - GREENHOUSE_TOP + 0.01, t * 0.8, (GREENHOUSE_TOP + POST_H) / 2, 0, GREENHOUSE_FRAME)
  for (const along of [-1 / 6, 1 / 6]) add(0.025, GREENHOUSE_TOP - GREENHOUSE_SILL, t * 0.5, (GREENHOUSE_SILL + GREENHOUSE_TOP) / 2, along, GREENHOUSE_FRAME)
  g.updateMatrixWorld(true)
  return g
}

/**
 * Plafond d'une serre (vue subjective) : une verrière au-dessus de ses tuiles, et ses chevrons
 * blancs, un par tuile dans chaque sens.
 */
function greenhouseRoof(tiles: { x: number; z: number }[], y: number): THREE.Object3D[] {
  const glassGeos: THREE.BufferGeometry[] = [], ribGeos: THREE.BufferGeometry[] = []
  for (const { x, z } of tiles) {
    glassGeos.push(new THREE.PlaneGeometry(1, 1).rotateX(Math.PI / 2).translate(x, y + 0.01, z))
    ribGeos.push(new THREE.BoxGeometry(1, 0.05, 0.04).translate(x, y - 0.02, z - 0.5), new THREE.BoxGeometry(0.04, 0.05, 1).translate(x - 0.5, y - 0.02, z))
    ribGeos.push(new THREE.BoxGeometry(1, 0.03, 0.02).translate(x, y - 0.015, z))
  }
  const glass = new THREE.Mesh(mergeGeometries(glassGeos), GREENHOUSE_GLASS)
  glass.renderOrder = 2
  const ribs = new THREE.Mesh(mergeGeometries(ribGeos), GREENHOUSE_FRAME)
  for (const geo of [...glassGeos, ...ribGeos]) geo.dispose()
  return [glass, ribs]
}

/** Poteau d'angle qui réutilise le matériau (et la couleur exacte) des murs du pont. */
export function makePostMesh(material: THREE.Material): THREE.Mesh {
  return solidBox(POST_W, POST_H, POST_W, material)
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
