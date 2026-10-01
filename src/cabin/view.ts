import * as THREE from 'three'
import { renderQuality } from '../quality'
import { station, type StationModel } from '../assets'
import type { Box2, Deck, Interactable, WallSegment } from '../deck'
import { buildFurniture, disposeFurniture, isCustomModel, keepShared, type CustomModel, type Emitter, type FurnitureControl } from '../furniture'
import { tr } from '../i18n'
import type { Rot } from '../levels'
import { DIRS } from '../map'
import { fadeBuffer, StaticMerge, updateOccluders, type FadeBuffer, type FadeFocus, type Occluder } from '../merge'
import { placeSeats, seatAction, seatsOf } from '../seats'
import { builderLabel, entryOf, interactText, isSolid, type CatalogEntry } from './catalog'
import { FinishTexture } from './finishes'
import { partitionsKey, sameItems, wingShapes, type CabinItem, type CabinLayout, type CabinWings, type Finish, type Partition, type Rect } from './layout'
import { panelGeometry, PANEL_SPANS, partitionCenter, PartitionShell } from './partitions'
import { WingShell } from './wings'
import { applyWings, WING_ROOMS, WING_SLOTS, type WingId, type WingPlan } from '../../shared/cabin-wings.js'
import { applyPartitions, clearPartitions } from '../../shared/cabin-partitions.js'

/*
 * La cabine telle qu'on la voit : les objets d'un aménagement, construits et fusionnés dans
 * le pont (un appel de dessin par matériau, comme le reste du vaisseau), avec leurs collisions,
 * leurs interactions, leurs lumières et leurs sons. Un nouvel aménagement réutilise les objets
 * déjà construits : déplacer un meuble ne reconstruit que la géométrie fusionnée.
 */

export interface CabinDef {
  /** Lettre de la pièce dans le plan du pont. */
  room: string
  /** Tuile intérieure devant la porte : toujours libre, et reliée au Holo-Me. */
  door: { x: number; z: number }
}

/** Demi-épaisseur d'un mur : sa face intérieure est à 0,15 de l'arête. */
export const WALL_HALF = 0.15
/** Demi-côté d'un poteau d'angle (cf. POST_W dans deck.ts). */
const POST_HALF = 0.175
/** Occulteurs de la cabine au plus : texture de fondu de taille fixe, jamais réallouée. */
const MAX_OCCLUDERS = 96

const PICK_MATERIAL = keepShared(new THREE.MeshBasicMaterial())

/** Revêtement du sol, juste au-dessus des dalles (les tapis, plus hauts, restent dessus). */
const FLOORING_Y = 0.002

/** Mur de la cabine auquel on peut accrocher des objets. */
export interface WallLine {
  /** Direction du mur vu depuis la cabine (0 nord, 1 est, 2 sud, 3 ouest). */
  dir: number
  /** Coordonnée de l'arête (z pour un mur nord ou sud, x pour un mur est ou ouest). */
  edge: number
  /** Coordonnée de la face intérieure. */
  face: number
  /** Intervalles libres le long du mur (sans porte, hublot ni pilier, poteaux écartés). */
  spans: [number, number][]
  /** Intervalles couverts par le mur, portes et hublots compris (on ne vise pas le mur ailleurs). */
  cover: [number, number][]
  /** Orientation des objets accrochés : face à la pièce. */
  rot: Rot
}

/** Papier peint de murs : un maillage, tramé pan par pan avec ses murs. */
interface Wallpaper {
  mesh: THREE.Mesh
  texture: FinishTexture
  occluders: Occluder[]
  /** Panneaux posés sur une cloison : ils s'estompent avec elle en mode aménagement. */
  inner: Occluder[]
  fades: FadeBuffer
}

/** Revêtement d'un sol. */
interface Flooring {
  mesh: THREE.Mesh
  texture: FinishTexture
}

/** Pièce d'extension affichée : sa coque, ses tuiles, ses revêtements. */
interface Wing {
  plan: WingPlan
  shell: WingShell
  wallpaper: Wallpaper
  flooring: Flooring
  /** Lumière douce au milieu de la pièce. */
  light: Deck['lights'][number]
}

/** Un objet construit, prêt à être placé. */
interface Built {
  key: string
  entry: CatalogEntry
  /** Position et orientation ; porte `solid` (masqué une fois fusionné), `live` et le volume de sélection. */
  holder: THREE.Group
  solid?: THREE.Object3D
  update?: (t: number) => void
  emitter?: Emitter
  control?: FurnitureControl
  /** Boîte de l'objet dans son propre repère (orientation 0). */
  local: THREE.Box3
  pick: THREE.Mesh
  custom: boolean
}

/** Petit hash de texte (graine des objets qui n'en ont pas). */
function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

export const seedOf = (item: Pick<CabinItem, 'm' | 's'>) => item.s ?? hashString(item.m)

/**
 * Boîte d'un objet tourné de `r` quarts de tour et posé en (x, y, z).
 * Une rotation de θ autour de y envoie (x, z) sur (x cos θ + z sin θ, −x sin θ + z cos θ).
 */
export function placedBox(local: THREE.Box3, r: Rot, x: number, y: number, z: number, out = new THREE.Box3()): THREE.Box3 {
  const { min, max } = local
  let x0: number, x1: number, z0: number, z1: number
  switch (r) {
    case 1: [x0, x1, z0, z1] = [min.z, max.z, -max.x, -min.x]; break
    case 2: [x0, x1, z0, z1] = [-max.x, -min.x, -max.z, -min.z]; break
    case 3: [x0, x1, z0, z1] = [-max.z, -min.z, min.x, max.x]; break
    default: [x0, x1, z0, z1] = [min.x, max.x, min.z, max.z]
  }
  out.min.set(x + x0, y + min.y, z + z0)
  out.max.set(x + x1, y + max.y, z + z1)
  return out
}

/** Direction (dans le repère du pont) d'un vecteur local tourné de `r` quarts de tour. */
export function rotateLocal(r: Rot, x: number, z: number): { x: number; z: number } {
  switch (r) {
    case 1: return { x: z, z: -x }
    case 2: return { x: -x, z: -z }
    case 3: return { x: -z, z: x }
    default: return { x, z }
  }
}

export class CabinView {
  /** Objets de la cabine (enfant du groupe du pont). */
  readonly group = new THREE.Group()
  /** Rectangle intérieur de la cabine (faces intérieures des murs). */
  readonly bounds: Rect
  /** Tuiles des quartiers (hors extensions). */
  readonly tiles: { x: number; z: number }[] = []
  /** Murs où l'on peut accrocher des objets, extensions comprises. */
  readonly walls: WallLine[] = []
  /** Poteaux qui débordent dans la cabine (extensions comprises) : les meubles ne s'y posent pas. */
  readonly posts: Box2[] = []
  /** Pièces d'extension affichées, par espace (cf. setWings). */
  private readonly wings = new Map<WingId, Wing>()
  /** Formes affichées (cf. wingShapes). */
  private wingKey = wingShapes(undefined)
  /** Lettres des pièces de la cabine sur le plan : les quartiers, et les pièces d'extension. */
  private letters = new Set<string>()
  /** Aménagement affiché. */
  items: CabinItem[] = []
  /** Revêtements affichés (absents : murs et sol d'origine). */
  wall?: Finish
  floor?: Finish
  /** Holo-Me de la cabine (interaction : cf. onHoloMe). */
  holoMe: Interactable | null = null
  /** Interaction avec le Holo-Me (ouvrir la garde-robe, cf. main.ts). */
  onHoloMe?: () => void
  /** Les lumières de la cabine ont changé : le pont affiché doit réaffecter sa réserve. */
  onLights?: () => void
  /** Interaction avec un objet qui fait jouer une emote (danser sur la piste), cf. main.ts. */
  onEmote?: (emote: string, text: Interactable['text']) => void
  /** Interaction avec un objet qui joue de la musique (jukebox, platines), à sa position (pont). */
  onMusic?: (position: THREE.Vector3, text: Interactable['text'], model: string) => void

  private built: Built[] = []
  private decorationFrame = -1
  /** Boîtes locales par modèle, variante et graine (vérifications du mode aménagement). */
  private boxes = new Map<string, THREE.Box3>()
  private merge = new StaticMerge()
  private meshes: THREE.Mesh[] = []
  private occluders: Occluder[] = []
  private fades = fadeBuffer(MAX_OCCLUDERS)
  private readonly baseColliders: number
  private readonly baseLights: number
  private blocked: string[] = []
  private interactables: Interactable[] = []
  private emitters: { kind: Emitter; position: THREE.Vector3 }[] = []
  /** Objets montrés à part, hors de la géométrie fusionnée (déplacés en mode aménagement). */
  private detached = new Set<number>()
  private readonly frame = new THREE.Matrix4()
  /** Papier peint des murs de la cabine : un maillage, tramé pan par pan avec ses murs. */
  private wallpaper: Wallpaper
  /** Revêtement du sol. */
  private readonly flooring: Flooring
  /**
   * Mode aménagement, onglet « Cloisons » : les cloisons restent pleines (ailleurs dans le mode
   * aménagement, elles s'estompent pour qu'on voie ce qu'il y a derrière).
   */
  solidPartitions = false
  /** Cloisons affichées (murs et portes posés par le CMDR), leur clé, et celles posées sur le plan. */
  private partitionShell: PartitionShell | null = null
  private partitionKey = ''
  private placed: Partition[] = []

  constructor(
    readonly deck: Deck,
    readonly def: CabinDef,
  ) {
    deck.group.add(this.group)
    this.baseColliders = deck.colliders.length
    this.baseLights = deck.lights.length

    const map = deck.map
    for (let z = 0; z < map.height; z++) for (let x = 0; x < map.width; x++) if (map.room(x, z) === def.room) this.tiles.push({ x, z })
    const xs = this.tiles.map((t) => t.x), zs = this.tiles.map((t) => t.z)
    this.bounds = {
      minX: Math.min(...xs) - 0.5 + WALL_HALF,
      maxX: Math.max(...xs) + 0.5 - WALL_HALF,
      minZ: Math.min(...zs) - 0.5 + WALL_HALF,
      maxZ: Math.max(...zs) + 0.5 - WALL_HALF,
    }
    this.letters.add(def.room)
    this.findWalls()
    this.wallpaper = this.buildWallpaper(this.tiles)
    this.flooring = this.buildFlooring(this.tiles)
  }

  /** Cloisons affichées. */
  get partitions(): Partition[] {
    return this.placed
  }

  /** Passage d'une porte posée sur l'arête de la cloison `p` (qu'elle y soit déjà ou non). */
  partitionDoorwayOf(p: Partition): Box2 {
    const { cx, cz, alongX } = partitionCenter(p)
    return alongX ? { minX: cx - 0.3, maxX: cx + 0.3, minZ: cz - 0.6, maxZ: cz + 0.6 } : { minX: cx - 0.6, maxX: cx + 0.6, minZ: cz - 0.3, maxZ: cz + 0.3 }
  }

  /** Passage des portes des cloisons, à laisser libre de meubles. */
  get partitionDoorways(): Box2[] {
    return this.partitionShell?.doorways ?? []
  }

  /**
   * Le plan avec ces cloisons à la place de celles affichées, le temps de `fn` (règles de pose :
   * chaque partie de la cabine reste-t-elle accessible ?). Les murs construits ne changent pas.
   */
  withPartitions<T>(partitions: Partition[], fn: () => T): T {
    const map = this.deck.map
    clearPartitions(map, this.placed)
    const trial = applyPartitions(map, partitions, (room) => this.letters.has(room))
    this.deck.pathfinder.invalidate()
    try {
      return fn()
    } finally {
      clearPartitions(map, trial)
      applyPartitions(map, this.placed, (room) => this.letters.has(room))
      this.deck.pathfinder.invalidate()
    }
  }

  /** Toutes les tuiles de la cabine sont-elles atteintes à pied depuis la porte (meubles ignorés) ? */
  reachableAll(): boolean {
    const map = this.deck.map
    const tiles = this.allTiles()
    const own = new Set(tiles.map((t) => `${t.x},${t.z}`))
    const start = this.def.door
    const seen = new Set([`${start.x},${start.z}`])
    const todo = [start]
    while (todo.length) {
      const t = todo.pop()!
      for (let dir = 0; dir < 4; dir++) {
        const n = { x: t.x + DIRS[dir].dx, z: t.z + DIRS[dir].dz }
        const k = `${n.x},${n.z}`
        if (seen.has(k) || !own.has(k) || map.edge(t.x, t.z, dir) === 'wall') continue
        seen.add(k)
        todo.push(n)
      }
    }
    return tiles.every((t) => seen.has(`${t.x},${t.z}`))
  }

  /** Rectangle qui englobe la cabine et ses pièces d'extension (faces intérieures des murs). */
  get extent(): Rect {
    const b = { ...this.bounds }
    for (const w of this.wings.values()) {
      for (const t of w.plan.tiles) {
        b.minX = Math.min(b.minX, t.x - 0.5 + WALL_HALF)
        b.maxX = Math.max(b.maxX, t.x + 0.5 - WALL_HALF)
        b.minZ = Math.min(b.minZ, t.z - 0.5 + WALL_HALF)
        b.maxZ = Math.max(b.maxZ, t.z + 0.5 - WALL_HALF)
      }
    }
    return b
  }

  /** Espaces dont une pièce est affichée. */
  get wingIds(): WingId[] {
    return [...this.wings.keys()]
  }

  /** Pièce de la position : 'main' (les quartiers), un espace d'extension, ou null (hors cabine). */
  roomAt(x: number, z: number): 'main' | WingId | null {
    const r = this.deck.map.room(Math.round(x), Math.round(z))
    if (r === this.def.room) return 'main'
    return r ? ((Object.keys(WING_ROOMS) as WingId[]).find((id) => this.wings.has(id) && WING_ROOMS[id].includes(r)) ?? null) : null
  }

  /**
   * La boîte (coordonnées du pont) tient-elle dans une seule pièce de la cabine, contre la face
   * intérieure de ses murs ? Elle ne chevauche ni un mur, ni une porte, ni le vide.
   */
  fits(box: { min: { x: number; z: number }; max: { x: number; z: number } }): boolean {
    const map = this.deck.map
    const e = 0.004
    const room = map.room(Math.round((box.min.x + box.max.x) / 2), Math.round((box.min.z + box.max.z) / 2))
    if (!room || !this.letters.has(room)) return false
    for (let tz = Math.round(box.min.z + e); tz <= Math.round(box.max.z - e); tz++) {
      for (let tx = Math.round(box.min.x + e); tx <= Math.round(box.max.x - e); tx++) {
        if (map.room(tx, tz) !== room) return false
        // Un mur (du vaisseau, ou une cloison) ou une porte sur un bord de la tuile : on reste de ce côté.
        if (map.edge(tx, tz, 1) !== 'open' && box.max.x > tx + 0.5 - WALL_HALF + e) return false
        if (map.edge(tx, tz, 3) !== 'open' && box.min.x < tx - 0.5 + WALL_HALF - e) return false
        if (map.edge(tx, tz, 2) !== 'open' && box.max.z > tz + 0.5 - WALL_HALF + e) return false
        if (map.edge(tx, tz, 0) !== 'open' && box.min.z < tz - 0.5 + WALL_HALF - e) return false
      }
    }
    return true
  }

  /**
   * Rectangle englobant la pièce de la position (faces intérieures des murs) : les quartiers,
   * ou une des pièces d'une extension ; à défaut, toute la cabine.
   */
  roomRect(x: number, z: number): Rect {
    const room = this.deck.map.room(Math.round(x), Math.round(z))
    if (room === this.def.room) return this.bounds
    const tiles = [...this.wings.values()].flatMap((w) => w.plan.tiles).filter((t) => t.room === room)
    if (!tiles.length) return this.extent
    return {
      minX: Math.min(...tiles.map((t) => t.x)) - 0.5 + WALL_HALF,
      maxX: Math.max(...tiles.map((t) => t.x)) + 0.5 - WALL_HALF,
      minZ: Math.min(...tiles.map((t) => t.z)) - 0.5 + WALL_HALF,
      maxZ: Math.max(...tiles.map((t) => t.z)) + 0.5 - WALL_HALF,
    }
  }

  /** Tuiles de la cabine, extensions comprises (quadrillage du mode aménagement). */
  get floorTiles(): { x: number; z: number }[] {
    return this.allTiles()
  }

  /** Pan de mur (ou porte) posé sur l'arête de milieu (cx, cz) : par une pièce d'extension, ou par le pont. */
  private segmentAt(cx: number, cz: number): WallSegment | undefined {
    const at = (w: WallSegment) => Math.abs(w.x - cx) < 1e-6 && Math.abs(w.z - cz) < 1e-6
    const inner = this.partitionShell?.walls.find(at)
    if (inner) return inner
    for (const wing of this.wings.values()) {
      const seg = wing.shell.walls.find(at)
      if (seg) return seg
    }
    return this.deck.walls.find(at)
  }

  /** Tuiles de la cabine, extensions comprises. */
  private allTiles(): { x: number; z: number }[] {
    return [...this.tiles, ...[...this.wings.values()].flatMap((w) => w.plan.tiles)]
  }

  // ---------------------------------------------------------------- extensions

  /**
   * Pièces d'extension de l'aménagement affiché : posées sur le plan du pont (cf. applyWings),
   * construites (sols, murs, portes), avec leurs revêtements. Une forme inchangée ne reconstruit
   * rien ; un revêtement se repeint sur place.
   */
  private setWings(wings: CabinWings | undefined) {
    const key = wingShapes(wings)
    if (key !== this.wingKey) {
      this.wingKey = key
      for (const w of this.wings.values()) {
        w.shell.dispose()
        for (const part of [w.wallpaper, w.flooring]) {
          part.mesh.removeFromParent()
          part.mesh.geometry.dispose()
          ;(part.mesh.material as THREE.Material).dispose()
          part.texture.dispose()
        }
        w.wallpaper.fades.texture.dispose()
      }
      this.wings.clear()
      const placed = applyWings(this.deck.map, wings)
      this.deck.syncLocks()
      this.letters = new Set([this.def.room])
      for (const slot of WING_SLOTS) {
        const plan = placed[slot.id]
        if (!plan) continue
        const shell = new WingShell(this.deck, plan)
        this.group.add(shell.group)
        const wing: Wing = { plan, shell, wallpaper: undefined!, flooring: this.buildFlooring(plan.tiles), light: undefined! }
        this.wings.set(slot.id, wing)
        for (const t of plan.tiles) this.letters.add(t.room)
        const cx = plan.tiles.reduce((s, t) => s + t.x, 0) / plan.tiles.length
        const cz = plan.tiles.reduce((s, t) => s + t.z, 0) / plan.tiles.length
        wing.light = { position: new THREE.Vector3(cx, this.deck.y + 1.4, cz), color: new THREE.Color('#ffd9a8'), intensity: 2 }
      }
      // Le papier peint se pose une fois tous les murs connus (ceux de chaque pièce, et du pont).
      for (const w of this.wings.values()) w.wallpaper = this.buildWallpaper(w.plan.tiles)
      this.findWalls()
      this.deck.pathfinder.invalidate()
    }
  }

  /** Revêtements des pièces d'extension (repeints sur place). */
  private setWingFinishes(wings: CabinWings | undefined) {
    for (const [id, w] of this.wings) {
      const f = wings?.[id]
      w.wallpaper.mesh.visible = !!f?.wall
      if (f?.wall) w.wallpaper.texture.set('wall', f.wall)
      w.flooring.mesh.visible = !!f?.floor
      if (f?.floor) w.flooring.texture.set('floor', f.floor)
    }
  }

  /** Centre de la cabine, extensions comprises (caméra du mode aménagement). */
  get center(): THREE.Vector3 {
    const b = this.extent
    return new THREE.Vector3((b.minX + b.maxX) / 2, this.deck.y, (b.minZ + b.maxZ) / 2)
  }

  /** La position (coordonnées du pont) est-elle dans la cabine ? */
  contains(x: number, z: number): boolean {
    const r = this.deck.map.room(Math.round(x), Math.round(z))
    return !!r && this.letters.has(r)
  }

  /** Murs de la cabine qui acceptent un objet accroché, et poteaux qui débordent à l'intérieur. */
  private findWalls() {
    const { deck } = this
    this.walls.length = 0
    this.posts.length = 0
    const tiles = this.allTiles()
    const posts = [...deck.posts, ...[...this.wings.values()].flatMap((w) => w.shell.posts), ...(this.partitionShell?.posts ?? [])]
    const lines = new Map<string, { dir: number; edge: number; segments: { at: number; free: boolean }[] }>()
    for (const t of tiles) {
      for (let dir = 0; dir < 4; dir++) {
        if (deck.map.edge(t.x, t.z, dir) === 'open') continue
        const d = DIRS[dir]
        const cx = t.x + d.dx * 0.5, cz = t.z + d.dz * 0.5
        const seg = this.segmentAt(cx, cz)
        const edge = d.dz !== 0 ? cz : cx
        const key = `${dir}:${edge}`
        let line = lines.get(key)
        if (!line) lines.set(key, (line = { dir, edge, segments: [] }))
        line.segments.push({ at: d.dz !== 0 ? cx : cz, free: seg?.model === 'wall' })
      }
    }
    for (const line of lines.values()) {
      const d = DIRS[line.dir]
      const alongX = d.dz !== 0
      line.segments.sort((a, b) => a.at - b.at)
      // Intervalles des pans libres qui se suivent, et de tous les pans.
      const merged = (list: { at: number }[]) => {
        const out: [number, number][] = []
        for (const s of list) {
          const last = out[out.length - 1]
          if (last && Math.abs(last[1] - (s.at - 0.5)) < 1e-6) last[1] = s.at + 0.5
          else out.push([s.at - 0.5, s.at + 0.5])
        }
        return out
      }
      const spans = merged(line.segments.filter((s) => s.free))
      const cover = merged(line.segments)
      // Les poteaux posés sur ce mur coupent les intervalles.
      const cuts = posts.filter((p) => Math.abs((alongX ? p.z : p.x) - line.edge) < 1e-6).map((p) => (alongX ? p.x : p.z))
      let parts = spans
      for (const c of cuts) {
        parts = parts.flatMap(([a, b]): [number, number][] => {
          if (c + POST_HALF <= a || c - POST_HALF >= b) return [[a, b]]
          return ([[a, c - POST_HALF], [c + POST_HALF, b]] as [number, number][]).filter(([u, v]) => v - u > 0.2)
        })
      }
      // Un peu de jeu contre l'encadrement d'une porte ou d'un hublot voisin.
      parts = parts.map(([a, b]): [number, number] => [a + 0.03, b - 0.03])
      const face = line.edge - (alongX ? d.dz : d.dx) * WALL_HALF
      // Nord → face au sud (0), est → face à l'ouest (3), sud → au nord (2), ouest → à l'est (1).
      this.walls.push({ dir: line.dir, edge: line.edge, face, spans: parts, cover, rot: ((4 - line.dir) % 4) as Rot })
    }
    // Poteaux au bord de la cabine (à un coin d'une de ses tuiles) : ils débordent un peu de la face des murs.
    const own = new Set(tiles.map((t) => `${t.x},${t.z}`))
    for (const p of posts) {
      const touches = [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].some(([dx, dz]) => own.has(`${Math.round(p.x + dx)},${Math.round(p.z + dz)}`))
      if (touches) this.posts.push({ minX: p.x - POST_HALF, maxX: p.x + POST_HALF, minZ: p.z - POST_HALF, maxZ: p.z + POST_HALF })
    }
  }

  /** Mur auquel est accroché un objet : même orientation, face la plus proche. */
  wallOf(item: Pick<CabinItem, 'x' | 'z' | 'r'>): WallLine | null {
    let best: WallLine | null = null
    let bestD = 0.3
    for (const w of this.walls) {
      if (w.rot !== item.r) continue
      const d = Math.abs(w.face - (DIRS[w.dir].dz !== 0 ? item.z : item.x))
      if (d < bestD) {
        best = w
        bestD = d
      }
    }
    return best
  }

  // ---------------------------------------------------------------- revêtements

  /** Panneaux de papier peint des tuiles `tiles`, un par pan de mur, chacun tramé avec son mur. */
  private buildWallpaper(tiles: { x: number; z: number }[]): Wallpaper {
    const texture = new FinishTexture()
    const material = new THREE.MeshLambertMaterial({ map: texture.texture })
    const merge = new StaticMerge()
    const occluders: Occluder[] = []
    const inner: Occluder[] = []
    const partitions = new Set(this.partitionShell?.walls)
    for (const t of tiles) {
      for (let dir = 0; dir < 4; dir++) {
        if (this.deck.map.edge(t.x, t.z, dir) === 'open') continue
        const d = DIRS[dir]
        const cx = t.x + d.dx * 0.5, cz = t.z + d.dz * 0.5
        const seg = this.segmentAt(cx, cz)
        if (!seg) continue
        const geo = panelGeometry(cx, cz, d, PANEL_SPANS[seg.model])
        // Même centre et même côté extérieur que le mur (cf. deck.ts) : même fondu.
        const o = merge.addFading(new THREE.Mesh(geo, material), new THREE.Vector3(cx, 0.5, cz), undefined, { x: d.dx, z: d.dz })
        occluders.push(o)
        if (partitions.has(seg)) inner.push(o)
        geo.dispose()
      }
    }
    const fades = fadeBuffer(merge.fadingCount)
    const [mesh] = merge.flush(this.group, fades.texture) as (THREE.Mesh | undefined)[]
    const out = mesh ?? new THREE.Mesh(new THREE.BufferGeometry(), material)
    out.castShadow = false
    out.visible = false
    if (!mesh) this.group.add(out)
    return { mesh: out, texture, occluders, inner, fades }
  }

  private disposeWallpaper(w: Wallpaper) {
    w.mesh.removeFromParent()
    w.mesh.geometry.dispose()
    ;(w.mesh.material as THREE.Material).dispose()
    w.texture.dispose()
    w.fades.texture.dispose()
  }

  /**
   * Cloisons de l'aménagement : posées sur le plan à chaque aménagement (le plan des pièces
   * d'extension a pu être refait), reconstruites seulement si elles ou les pièces ont changé,
   * avec les murs d'accroche et le papier peint de toutes les pièces.
   * @returns vrai si elles ont été reconstruites
   */
  private setPartitions(partitions: Partition[] | undefined, reshaped: boolean): boolean {
    const map = this.deck.map
    this.placed = applyPartitions(map, partitions, (room) => this.letters.has(room))
    const key = partitionsKey(this.placed)
    if (key === this.partitionKey && !reshaped) return false
    this.partitionKey = key
    this.partitionShell?.dispose()
    this.partitionShell = null
    if (this.placed.length) {
      const existing = {
        walls: [...this.deck.walls, ...[...this.wings.values()].flatMap((w) => w.shell.walls)],
        posts: [...this.deck.posts, ...[...this.wings.values()].flatMap((w) => w.shell.posts)],
      }
      this.partitionShell = new PartitionShell(this.deck, this.placed, existing)
      this.group.add(this.partitionShell.group)
    }
    this.findWalls()
    // Le papier peint se pose sur les cloisons comme sur les autres murs de leur pièce.
    this.disposeWallpaper(this.wallpaper)
    this.wallpaper = this.buildWallpaper(this.tiles)
    for (const w of this.wings.values()) {
      this.disposeWallpaper(w.wallpaper)
      w.wallpaper = this.buildWallpaper(w.plan.tiles)
    }
    this.deck.pathfinder.invalidate()
    return true
  }

  /** Revêtement du sol : une dalle par tuile, coordonnées de texture en mètres. */
  private buildFlooring(tiles: { x: number; z: number }[]): Flooring {
    const texture = new FinishTexture()
    const pos: number[] = [], uv: number[] = [], index: number[] = []
    for (const t of tiles) {
      const i = pos.length / 3
      for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
        pos.push(t.x + dx, FLOORING_Y, t.z + dz)
        uv.push(t.x + dx, -(t.z + dz))
      }
      index.push(i, i + 3, i + 2, i, i + 2, i + 1)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geo.setIndex(index)
    geo.computeVertexNormals()
    const material = new THREE.MeshLambertMaterial({ map: texture.texture, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
    const mesh = new THREE.Mesh(geo, material)
    mesh.receiveShadow = true
    mesh.visible = false
    this.group.add(mesh)
    return { mesh, texture }
  }

  /** Revêtements des murs et du sol (absents : ceux d'origine), redessinés sur place. */
  private setFinish(wall: Finish | undefined, floor: Finish | undefined) {
    this.wall = wall && { ...wall }
    this.floor = floor && { ...floor }
    this.wallpaper.mesh.visible = !!wall
    if (wall) this.wallpaper.texture.set('wall', wall)
    this.flooring.mesh.visible = !!floor
    if (floor) this.flooring.texture.set('floor', floor)
  }

  // ---------------------------------------------------------------- construction

  private keyOf(item: Pick<CabinItem, 'm' | 'v' | 's'>): string {
    return `${item.m}|${item.v ?? ''}|${seedOf(item)}`
  }

  /** Construit un objet (sans le placer). */
  private build(item: CabinItem): Built | null {
    const entry = entryOf(item.m)
    if (!entry) return null
    const holder = new THREE.Group()
    let solid: THREE.Object3D | undefined
    let update: Built['update']
    let emitter: Emitter | undefined
    let control: FurnitureControl | undefined
    const custom = isCustomModel(entry.model)
    if (custom) {
      const f = buildFurniture(entry.model as CustomModel, builderLabel(entry, item.v), seedOf(item), this.roomRect(item.x, item.z))
      if (f.solid) holder.add((solid = f.solid))
      if (f.live) holder.add(f.live)
      // Pièces animées placées avant la mesure : une instance pas encore posée compte à sa
      // taille d'origine (les bulles d'une lampe à lave, les planètes d'une carte du système).
      f.update?.(0)
      update = f.update
      emitter = f.emitter
      control = f.control
    } else {
      solid = station(entry.model as StationModel)
      solid.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).material = this.deck.theme.furniture
      })
      holder.add(solid)
    }
    holder.updateMatrixWorld(true)
    const local = new THREE.Box3().setFromObject(holder)
    if (local.isEmpty()) local.set(new THREE.Vector3(-0.2, 0, -0.2), new THREE.Vector3(0.2, 0.4, 0.2))
    // Volume invisible aux dimensions de l'objet : on le clique, il ne coûte aucun appel de dessin.
    const size = local.getSize(new THREE.Vector3())
    const pick = new THREE.Mesh(new THREE.BoxGeometry(Math.max(size.x, 0.1), Math.max(size.y, 0.05), Math.max(size.z, 0.1)), PICK_MATERIAL)
    local.getCenter(pick.position)
    pick.visible = false
    holder.add(pick)
    const key = this.keyOf(item)
    if (!this.boxes.has(key)) this.boxes.set(key, local.clone())
    this.group.add(holder)
    return { key, entry, holder, solid, update, emitter, control, local, pick, custom }
  }

  private dispose(b: Built) {
    b.holder.removeFromParent()
    if (b.custom) disposeFurniture(b.holder)
    else b.pick.geometry.dispose()
  }

  private place(b: Built, item: CabinItem) {
    b.holder.position.set(item.x, item.y ?? 0, item.z)
    b.holder.rotation.y = (item.r * Math.PI) / 2
  }

  /**
   * Boîte locale d'un objet (construit un exemplaire au besoin). La graine compte : d'une plante
   * à l'autre, le feuillage n'a pas la même taille.
   */
  localBox(item: Pick<CabinItem, 'm' | 'v' | 's'>): THREE.Box3 | null {
    const key = this.keyOf(item)
    let box = this.boxes.get(key)
    if (!box) {
      const b = this.build({ m: item.m, v: item.v, s: item.s, x: 0, z: 0, r: 0 })
      if (!b) return null
      box = b.local.clone()
      this.dispose(b)
    }
    return box
  }

  /** Boîte (coordonnées du pont) de l'objet `item`. */
  boxOf(item: CabinItem, out = new THREE.Box3()): THREE.Box3 | null {
    const local = this.localBox(item)
    return local ? placedBox(local, item.r, item.x, item.y ?? 0, item.z, out) : null
  }

  /**
   * Affiche un nouvel aménagement ; les objets inchangés (modèle, variante, graine) sont
   * réutilisés, et si seuls les revêtements changent, rien n'est refondu.
   */
  setLayout(layout: CabinLayout) {
    const shapes = this.wingKey
    // Les cloisons quittent le plan le temps de refaire les pièces d'extension (elles ne doivent
    // pas passer pour des murs de leurs pièces), puis y reviennent.
    clearPartitions(this.deck.map, this.placed)
    this.setWings(layout.wings)
    const walled = this.setPartitions(layout.partitions, shapes !== this.wingKey)
    this.setWingFinishes(layout.wings)
    this.setFinish(layout.wall, layout.floor)
    const items = layout.items
    // Les pièces ont changé : collisions, lumières et murs d'accroche sont à refaire, objets inchangés ou non.
    if (!this.detached.size && this.built.length && sameItems(items, this.items) && shapes === this.wingKey && !walled) return
    const pool = new Map<string, Built[]>()
    for (const b of this.built) {
      const list = pool.get(b.key) ?? []
      list.push(b)
      pool.set(b.key, list)
    }
    const next: Built[] = []
    const kept: CabinItem[] = []
    for (const item of items) {
      const b = pool.get(this.keyOf(item))?.pop() ?? this.build(item)
      if (!b) continue
      this.place(b, item)
      next.push(b)
      kept.push({ ...item })
    }
    for (const list of pool.values()) for (const b of list) this.dispose(b)
    this.built = next
    this.items = kept
    this.detached.clear()
    this.rebuild()
  }

  // ---------------------------------------------------------------- mode aménagement

  /** Montre ces objets à part (ils suivent la souris sans refusion) ; [] : tout refusionner. */
  detach(indices: number[]) {
    if (indices.length === this.detached.size && indices.every((i) => this.detached.has(i))) return
    this.detached = new Set(indices)
    this.rebuild()
  }

  /** Déplace un objet montré à part (aperçu, sans rien valider). */
  moveDetached(index: number, x: number, y: number, z: number, r: Rot) {
    const b = this.built[index]
    if (!b || !this.detached.has(index)) return
    b.holder.position.set(x, y, z)
    b.holder.rotation.y = (r * Math.PI) / 2
  }

  /** Objet de la cabine sous le rayon (le plus proche), ou -1. */
  pickItem(raycaster: THREE.Raycaster): number {
    const hits = raycaster.intersectObjects(this.built.map((b) => b.pick), false)
    if (!hits.length) return -1
    return this.built.findIndex((b) => b.pick === hits[0].object)
  }

  /** Aperçu d'un objet du catalogue, avant de le poser (à libérer avec disposeGhost). */
  makeGhost(item: CabinItem): THREE.Group | null {
    const b = this.build(item)
    if (!b) return null
    if (b.solid) b.solid.visible = true
    b.holder.userData.built = b
    return b.holder
  }

  disposeGhost(holder: THREE.Group) {
    const b = holder.userData.built as Built | undefined
    if (b) this.dispose(b)
  }

  /** Animation d'un aperçu (objets animés : poissons, flammes…). */
  tickGhost(holder: THREE.Group, t: number) {
    ;(holder.userData.built as Built | undefined)?.update?.(t)
  }

  /** Collisions et tuiles bloquées d'un aménagement (hors objets `skip`), sans rien toucher au pont. */
  blockers(items: CabinItem[], skip?: Set<number>): { colliders: Box2[]; tiles: Set<string> } {
    const colliders: Box2[] = []
    const tiles = new Set<string>()
    const box = new THREE.Box3()
    items.forEach((item, i) => {
      const entry = entryOf(item.m)
      if (!entry || !isSolid(entry) || skip?.has(i) || !this.boxOf(item, box)) return
      const m = 0.04
      const c = { minX: box.min.x + m, maxX: box.max.x - m, minZ: box.min.z + m, maxZ: box.max.z - m }
      colliders.push(c)
      for (let tz = Math.floor(c.minZ); tz <= Math.ceil(c.maxZ); tz++) {
        for (let tx = Math.floor(c.minX); tx <= Math.ceil(c.maxX); tx++) {
          // Tuile bloquée si son centre est sous le meuble (avec une petite marge), comme dans deck.ts.
          if (tx > c.minX - 0.15 && tx < c.maxX + 0.15 && tz > c.minZ - 0.15 && tz < c.maxZ + 0.15) tiles.add(`${tx},${tz}`)
        }
      }
    })
    return { colliders, tiles }
  }

  /** Collisions et tuiles bloquées du reste du pont (tout sauf la cabine). */
  staticBlockers(): { colliders: Box2[]; tiles: Set<string> } {
    const own = new Set(this.blocked)
    return { colliders: [...this.deck.colliders.slice(0, this.baseColliders), ...this.wingColliders()], tiles: new Set([...this.deck.blockedTiles].filter((k) => !own.has(k))) }
  }

  /** Murs, portes et poteaux des pièces d'extension. */
  private wingColliders(): Box2[] {
    return [...this.wings.values()].flatMap((w) => w.shell.colliders)
  }

  // ---------------------------------------------------------------- fusion et câblage

  private rebuild() {
    const { deck } = this
    for (const m of this.meshes) {
      m.removeFromParent()
      m.geometry.dispose()
      if (m.userData.ownMaterial) (m.material as THREE.Material).dispose()
    }
    this.group.updateMatrixWorld(true)
    this.frame.copy(this.group.matrixWorld).invert()
    this.occluders = []
    const { colliders, tiles } = this.blockers(this.items, this.detached)
    const box = new THREE.Box3()
    const center = new THREE.Vector3()
    for (const b of this.interactables) {
      const i = deck.interactables.indexOf(b)
      if (i >= 0) deck.interactables.splice(i, 1)
    }
    this.interactables = []
    this.holoMe = null
    const lights: { priority: number; light: Deck['lights'][number] }[] = []
    for (const e of this.emitters) {
      const list = deck.emitters.get(e.kind)
      const i = list?.indexOf(e.position) ?? -1
      if (i >= 0) list!.splice(i, 1)
    }
    this.emitters = []

    this.built.forEach((b, i) => {
      const item = this.items[i]
      placedBox(b.local, item.r, item.x, item.y ?? 0, item.z, box)
      box.getCenter(center)
      const apart = this.detached.has(i)
      if (b.solid) {
        b.solid.visible = apart
        if (!apart) {
          const occ = this.occlusion(b.entry, item, box)
          if (occ && this.occluders.length < MAX_OCCLUDERS) this.occluders.push(this.merge.addFading(b.solid, occ.center, this.frame, occ.outward))
          else this.merge.add(b.solid, true, undefined, this.frame)
        }
      }
      if (apart) return
      const text = interactText(b.entry, item.v)
      const seats = seatsOf(b.entry.model, builderLabel(b.entry, item.v))
      if (b.entry.fixed || text || b.entry.emote || seats) {
        const label = b.entry.action ?? (seats ? seatAction(seats) : tr('Examiner', 'Examine'))
        const it: Interactable = { object: b.pick, position: center.clone().setY(0), label, text, control: b.control, furniture: { model: b.entry.model, label: builderLabel(b.entry, item.v) } }
        if (seats) {
          const rot = (item.r * Math.PI) / 2, y = item.y ?? 0
          it.seats = (toward) => placeSeats(seats, item.x, item.z, rot, toward).map((s) => ({ ...s, y: s.y + y }))
        }
        const emote = b.entry.emote
        if (b.entry.fixed) {
          it.label = b.entry.name
          it.onInteract = () => this.onHoloMe?.()
          this.holoMe = it
        } else if (emote) it.onInteract = () => this.onEmote?.(emote, text)
        else if (b.entry.music) it.onInteract = () => this.onMusic?.(it.position, text, b.entry.model)
        this.interactables.push(it)
        deck.interactables.push(it)
      }
      const l = typeof b.entry.light === 'function' ? b.entry.light(item.v) : b.entry.light
      if (l) {
        const at = rotateLocal(item.r, l.at[0], l.at[2])
        lights.push({
          priority: l.priority,
          light: { position: new THREE.Vector3(item.x + at.x, deck.y + (item.y ?? 0) + l.at[1], item.z + at.z), color: new THREE.Color(l.color), intensity: l.intensity, flicker: l.flicker },
        })
      }
      if (b.emitter) {
        const e = { kind: b.emitter, position: new THREE.Vector3(center.x, deck.y + 0.6, center.z) }
        const list = deck.emitters.get(e.kind) ?? []
        list.push(e.position)
        deck.emitters.set(e.kind, list)
        this.emitters.push(e)
      }
    })

    this.fades.data.fill(1)
    this.fades.texture.needsUpdate = true
    this.meshes = this.merge.flush(this.group, this.fades.texture)

    deck.colliders.length = this.baseColliders
    deck.colliders.push(...this.wingColliders(), ...(this.partitionShell?.colliders ?? []), ...colliders)
    for (const k of this.blocked) deck.blockedTiles.delete(k)
    this.blocked = [...tiles]
    for (const k of this.blocked) deck.blockedTiles.add(k)
    deck.pathfinder.invalidate()

    deck.lights.length = this.baseLights
    for (const w of this.wings.values()) deck.lights.push(w.light)
    lights.sort((a, b) => a.priority - b.priority)
    for (const l of lights) deck.lights.push(l.light)
    this.onLights?.()
  }

  /** Un grand meuble se trame quand il masque le joueur ; un objet accroché, avec son mur. */
  private occlusion(entry: CatalogEntry, item: CabinItem, box: THREE.Box3): { center: THREE.Vector3; outward?: Occluder['outward'] } | null {
    if (entry.mount === 'wall') {
      const wall = this.wallOf(item)
      if (!wall) return null
      const d = DIRS[wall.dir]
      const along = d.dz !== 0 ? item.x : item.z
      const at = Math.round(along)
      const center = d.dz !== 0 ? new THREE.Vector3(at, 0.5, wall.edge) : new THREE.Vector3(wall.edge, 0.5, at)
      return { center, outward: { x: d.dx, z: d.dz } }
    }
    if (box.max.y <= 0.6) return null
    return { center: box.getCenter(new THREE.Vector3()) }
  }

  /** @param dt temps écoulé pour le tramage des murs et des gros meubles */
  update(t: number, dt: number, view: FadeFocus) {
    const frame = Math.floor(t * 12)
    const decorate = !renderQuality.light || frame !== this.decorationFrame
    this.decorationFrame = frame
    for (const b of this.built) if (decorate || b.control) b.update?.(t)
    if (updateOccluders(this.occluders, this.fades, view, dt)) this.fades.texture.needsUpdate = true
    // Le papier peint d'une cloison s'estompe avec elle (cf. PartitionShell.update).
    const outward = view.cabin && !this.solidPartitions ? { x: view.toCamera.x, z: view.toCamera.z } : undefined
    for (const w of [this.wallpaper, ...[...this.wings.values()].map((wing) => wing.wallpaper)]) {
      for (const o of w.inner) o.outward = outward
      if (w.mesh.visible && updateOccluders(w.occluders, w.fades, view, dt)) w.fades.texture.needsUpdate = true
    }
    for (const wing of this.wings.values()) wing.shell.update(view, dt)
    this.partitionShell?.update(view, dt, this.solidPartitions)
  }
}
