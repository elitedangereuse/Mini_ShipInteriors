import * as THREE from 'three'
import { station, type StationModel } from '../assets'
import type { Box2, Deck, Interactable } from '../deck'
import { buildFurniture, disposeFurniture, isCustomModel, keepShared, type CustomModel, type Emitter } from '../furniture'
import type { Rot } from '../levels'
import { DIRS } from '../map'
import { fadeBuffer, StaticMerge, updateOccluders, type FadeFocus, type Occluder } from '../merge'
import { builderLabel, entryOf, interactText, isSolid, type CatalogEntry } from './catalog'
import type { CabinItem, Rect } from './layout'

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
  /** Orientation des objets accrochés : face à la pièce. */
  rot: Rot
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

export const seedOf = (item: CabinItem) => item.s ?? hashString(item.m)

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
  /** Tuiles de la cabine. */
  readonly tiles: { x: number; z: number }[] = []
  /** Murs où l'on peut accrocher des objets. */
  readonly walls: WallLine[] = []
  /** Poteaux qui débordent dans la cabine : les meubles ne s'y posent pas. */
  readonly posts: Box2[] = []
  /** Aménagement affiché. */
  items: CabinItem[] = []
  /** Holo-Me de la cabine (interaction : cf. onHoloMe). */
  holoMe: Interactable | null = null
  /** Interaction avec le Holo-Me (ouvrir la garde-robe, cf. main.ts). */
  onHoloMe?: () => void
  /** Les lumières de la cabine ont changé : le pont affiché doit réaffecter sa réserve. */
  onLights?: () => void

  private built: Built[] = []
  /** Boîtes locales par modèle et variante (vérifications du mode aménagement). */
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
    this.findWalls()
  }

  /** Centre de la cabine (caméra du mode aménagement). */
  get center(): THREE.Vector3 {
    const b = this.bounds
    return new THREE.Vector3((b.minX + b.maxX) / 2, this.deck.y, (b.minZ + b.maxZ) / 2)
  }

  /** La position (coordonnées du pont) est-elle dans la cabine ? */
  contains(x: number, z: number): boolean {
    return this.deck.map.room(Math.round(x), Math.round(z)) === this.def.room
  }

  /** Murs de la cabine qui acceptent un objet accroché, et poteaux qui débordent à l'intérieur. */
  private findWalls() {
    const { deck } = this
    const lines = new Map<string, { dir: number; edge: number; segments: { at: number; free: boolean }[] }>()
    for (const t of this.tiles) {
      for (let dir = 0; dir < 4; dir++) {
        if (deck.map.edge(t.x, t.z, dir) === 'open') continue
        const d = DIRS[dir]
        const cx = t.x + d.dx * 0.5, cz = t.z + d.dz * 0.5
        const seg = deck.walls.find((w) => Math.abs(w.x - cx) < 1e-6 && Math.abs(w.z - cz) < 1e-6)
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
      // Intervalles des pans libres qui se suivent.
      const spans: [number, number][] = []
      for (const s of line.segments) {
        if (!s.free) continue
        const last = spans[spans.length - 1]
        if (last && Math.abs(last[1] - (s.at - 0.5)) < 1e-6) last[1] = s.at + 0.5
        else spans.push([s.at - 0.5, s.at + 0.5])
      }
      // Les poteaux posés sur ce mur coupent les intervalles.
      const cuts = deck.posts.filter((p) => Math.abs((alongX ? p.z : p.x) - line.edge) < 1e-6).map((p) => (alongX ? p.x : p.z))
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
      this.walls.push({ dir: line.dir, edge: line.edge, face, spans: parts, rot: ((4 - line.dir) % 4) as Rot })
    }
    // Poteaux au bord de la cabine : ils débordent un peu de la face des murs.
    const b = this.bounds
    for (const p of deck.posts) {
      const onX = p.x >= b.minX - WALL_HALF - 1e-6 && p.x <= b.maxX + WALL_HALF + 1e-6
      const onZ = p.z >= b.minZ - WALL_HALF - 1e-6 && p.z <= b.maxZ + WALL_HALF + 1e-6
      if (onX && onZ) this.posts.push({ minX: p.x - POST_HALF, maxX: p.x + POST_HALF, minZ: p.z - POST_HALF, maxZ: p.z + POST_HALF })
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

  // ---------------------------------------------------------------- construction

  private keyOf(item: CabinItem): string {
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
    const custom = isCustomModel(entry.model)
    if (custom) {
      const f = buildFurniture(entry.model as CustomModel, builderLabel(entry, item.v), seedOf(item))
      if (f.solid) holder.add((solid = f.solid))
      if (f.live) holder.add(f.live)
      update = f.update
      emitter = f.emitter
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
    const boxKey = `${item.m}|${item.v ?? ''}`
    if (!this.boxes.has(boxKey)) this.boxes.set(boxKey, local.clone())
    this.group.add(holder)
    return { key: this.keyOf(item), entry, holder, solid, update, emitter, local, pick, custom }
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

  /** Boîte locale d'un modèle et d'une variante (construit un exemplaire au besoin). */
  localBox(m: string, v: string | undefined): THREE.Box3 | null {
    const key = `${m}|${v ?? ''}`
    let box = this.boxes.get(key)
    if (!box) {
      const b = this.build({ m, v, x: 0, z: 0, r: 0 })
      if (!b) return null
      box = b.local.clone()
      this.dispose(b)
    }
    return box
  }

  /** Boîte (coordonnées du pont) de l'objet `item`. */
  boxOf(item: CabinItem, out = new THREE.Box3()): THREE.Box3 | null {
    const local = this.localBox(item.m, item.v)
    return local ? placedBox(local, item.r, item.x, item.y ?? 0, item.z, out) : null
  }

  /** Affiche un nouvel aménagement ; les objets inchangés (modèle, variante, graine) sont réutilisés. */
  setLayout(items: CabinItem[]) {
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
    return { colliders: this.deck.colliders.slice(0, this.baseColliders), tiles: new Set([...this.deck.blockedTiles].filter((k) => !own.has(k))) }
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
      if (b.entry.fixed || text) {
        const it: Interactable = { object: b.pick, position: center.clone().setY(0), label: b.entry.action ?? 'Examiner', text }
        if (b.entry.fixed) {
          it.label = b.entry.name
          it.onInteract = () => this.onHoloMe?.()
          this.holoMe = it
        }
        this.interactables.push(it)
        deck.interactables.push(it)
      }
      const l = b.entry.light
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
    deck.colliders.push(...colliders)
    for (const k of this.blocked) deck.blockedTiles.delete(k)
    this.blocked = [...tiles]
    for (const k of this.blocked) deck.blockedTiles.add(k)
    deck.pathfinder.invalidate()

    deck.lights.length = this.baseLights
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

  update(t: number, dt: number, view: FadeFocus) {
    for (const b of this.built) b.update?.(t)
    if (updateOccluders(this.occluders, this.fades, view, dt)) this.fades.texture.needsUpdate = true
  }
}
