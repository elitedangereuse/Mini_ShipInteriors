import * as THREE from 'three'
import { FLOOR_Y, hash, makePostMesh, POST_H, POST_W, WALL_T, type Box2, type Deck, type DoorState, type WallSegment } from '../deck'
import { makeFadeable } from '../fade'
import { DIRS } from '../map'
import { fadeBuffer, StaticMerge, updateOccluders, type FadeBuffer, type FadeFocus, type Occluder } from '../merge'
import { DOOR_GAP } from '../../shared/sight.js'
import type { WingPlan } from '../../shared/cabin-wings.js'

/*
 * La coque d'une pièce d'extension des quartiers (SHIP-02) : ses sols, ses murs (des hublots sur
 * l'extérieur), ses portes intérieures, ses poteaux d'angle, construits quand l'aménagement
 * affiché en a une, et retirés quand il change. Le plan du pont porte déjà ses tuiles (cf.
 * applyWings) ; les murs qui la séparent des pièces du vaisseau existent déjà, eux : on ne pose
 * que ceux qui la bordent côté vide, et ceux qui séparent ses deux pièces. Comme le reste du
 * pont, tout est fusionné (un appel de dessin par matériau) et les murs s'estompent devant le
 * joueur.
 */

/** Proportion des murs extérieurs percés d'un hublot. */
const WINDOWS = 0.35

export class WingShell {
  readonly group = new THREE.Group()
  readonly colliders: Box2[] = []
  /** Pans de mur et portes posés par la pièce (le papier peint et les objets accrochés s'y fient). */
  readonly walls: WallSegment[] = []
  /** Poteaux d'angle ajoutés (centre). */
  readonly posts: { x: number; z: number }[] = []
  private occluders: Occluder[] = []
  private fades: FadeBuffer
  private doors: DoorState[] = []
  private doorOccluders: Occluder[] = []
  /** Ce qui appartient à la pièce seule (géométrie fusionnée, matériaux tramables) : libéré avec elle. */
  private owned: { dispose(): void }[] = []

  constructor(
    private deck: Deck,
    plan: WingPlan,
  ) {
    const merge = new StaticMerge()
    const map = deck.map
    const own = new Set(plan.tiles.map((t) => `${t.x},${t.z}`))
    const inner = new Set(plan.doors.map((d) => map.edgeKey(d.x, d.z, d.dir)))

    for (const t of plan.tiles) merge.add(deck.placeModel('floor', t.x, FLOOR_Y, t.z), false)

    // Murs posés ici et par le pont, sommet par sommet (poteaux d'angle).
    const vertex = new Map<string, { h: number; v: number }>()
    const touch = (vx: number, vz: number, axis: 'h' | 'v') => {
      const k = `${vx},${vz}`
      const c = vertex.get(k) ?? { h: 0, v: 0 }
      c[axis]++
      vertex.set(k, c)
    }
    const built = new Set<string>()
    for (const t of plan.tiles) {
      for (let dir = 0; dir < 4; dir++) {
        const d = DIRS[dir]
        const nx = t.x + d.dx, nz = t.z + d.dz
        const key = map.edgeKey(t.x, t.z, dir)
        if (built.has(key) || map.edge(t.x, t.z, dir) === 'open') continue
        // Pièce du vaisseau de l'autre côté : son mur (ou la porte de l'espace) est déjà là.
        if (map.isFloor(nx, nz) && !own.has(`${nx},${nz}`)) continue
        built.add(key)
        const cx = t.x + d.dx * 0.5, cz = t.z + d.dz * 0.5
        const alongX = d.dz !== 0
        if (inner.has(key)) {
          this.buildDoor(t.x, t.z, dir, cx, cz, alongX)
          if (alongX) touch(cx - 0.5, cz, 'h'), touch(cx + 0.5, cz, 'h')
          else touch(cx, cz - 0.5, 'v'), touch(cx, cz + 0.5, 'v')
          continue
        }
        const exterior = !map.isFloor(nx, nz)
        const h = hash(Math.round(cx * 2), Math.round(cz * 2))
        const model: WallSegment['model'] = exterior && (h % 1000) / 1000 < WINDOWS ? 'wall-window' : !exterior && h % 5 === 0 ? 'wall-pillar' : 'wall'
        const wall = deck.placeModel(model, cx, 0, cz, alongX ? 0 : Math.PI / 2)
        this.occluders.push(merge.addFading(wall, new THREE.Vector3(cx, 0.5, cz), undefined, { x: d.dx, z: d.dz }))
        this.walls.push({ x: cx, z: cz, alongX, model })
        const w = WALL_T / 2
        if (alongX) {
          this.colliders.push({ minX: cx - 0.5, maxX: cx + 0.5, minZ: cz - w, maxZ: cz + w })
          touch(cx - 0.5, cz, 'h')
          touch(cx + 0.5, cz, 'h')
        } else {
          this.colliders.push({ minX: cx - w, maxX: cx + w, minZ: cz - 0.5, maxZ: cz + 0.5 })
          touch(cx, cz - 0.5, 'v')
          touch(cx, cz + 0.5, 'v')
        }
      }
    }

    // Poteaux : là où nos murs tournent, ou rejoignent ceux du pont, sauf s'il y en a déjà un.
    const post = makePostMesh(deck.theme.shell)
    for (const [k, c] of vertex) {
      const [vx, vz] = k.split(',').map(Number)
      for (const w of deck.walls) {
        if (w.alongX && Math.abs(w.z - vz) < 1e-6 && Math.abs(Math.abs(w.x - vx) - 0.5) < 1e-6) c.h++
        if (!w.alongX && Math.abs(w.x - vx) < 1e-6 && Math.abs(Math.abs(w.z - vz) - 0.5) < 1e-6) c.v++
      }
      const straight = (c.h === 2 && c.v === 0) || (c.v === 2 && c.h === 0)
      if (straight || deck.posts.some((p) => Math.abs(p.x - vx) < 1e-6 && Math.abs(p.z - vz) < 1e-6)) continue
      const m = post.clone()
      m.position.set(vx, POST_H / 2, vz)
      m.updateMatrixWorld(true)
      this.occluders.push(merge.addFading(m, new THREE.Vector3(vx, 0.5, vz)))
      this.posts.push({ x: vx, z: vz })
      const hs = POST_W / 2
      this.colliders.push({ minX: vx - hs, maxX: vx + hs, minZ: vz - hs, maxZ: vz + hs })
    }

    this.fades = fadeBuffer(merge.fadingCount)
    for (const m of merge.flush(this.group, this.fades.texture)) {
      this.owned.push(m.geometry)
      if (m.userData.ownMaterial) this.owned.push(m.material as THREE.Material)
    }
    post.geometry.dispose()
  }

  /** Porte intérieure entre les deux pièces d'une forme : elle s'ouvre comme celles du pont. */
  private buildDoor(x: number, z: number, dir: number, cx: number, cz: number, alongX: boolean) {
    const rot = alongX ? 0 : Math.PI / 2
    const frame = this.deck.placeModel('wall-door', cx, 0, cz, rot)
    const panel = this.deck.placeModel('door-single', cx, 0, cz, rot)
    panel.scale.set(0.98, 0.99, 0.9)
    const fade = { value: 1 }
    for (const o of [frame, panel]) {
      o.traverse((c) => {
        const m = c as THREE.Mesh
        if (!m.isMesh) return
        m.material = makeFadeable(m.material as THREE.Material, fade)
        this.owned.push(m.material as THREE.Material)
      })
      this.group.add(o)
    }
    this.doorOccluders.push({ center: new THREE.Vector3(cx, 0.5, cz), value: 1, uniform: fade })
    this.walls.push({ x: cx, z: cz, alongX, model: 'door' })
    const door: DoorState = {
      panel,
      center: new THREE.Vector3(cx, 0, cz),
      axis: alongX ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1),
      open: 0,
      wanted: false,
      x,
      z,
      dir,
      lamp: new THREE.Object3D(),
    }
    this.deck.registerDoor(door)
    this.doors.push(door)
    const g = DOOR_GAP / 2, t = WALL_T / 2
    if (alongX) {
      this.colliders.push({ minX: cx - 0.5, maxX: cx - g, minZ: cz - t, maxZ: cz + t }, { minX: cx + g, maxX: cx + 0.5, minZ: cz - t, maxZ: cz + t })
    } else {
      this.colliders.push({ minX: cx - t, maxX: cx + t, minZ: cz - 0.5, maxZ: cz - g }, { minX: cx - t, maxX: cx + t, minZ: cz + g, maxZ: cz + 0.5 })
    }
  }

  /** Murs et portes qui masquent le joueur : tramés (cf. merge.ts). */
  update(view: FadeFocus, dt: number) {
    if (updateOccluders(this.occluders, this.fades, view, dt)) this.fades.texture.needsUpdate = true
    updateOccluders(this.doorOccluders, this.fades, view, dt)
  }

  /** Retire la pièce ; les modèles du kit (géométries partagées) restent intacts. */
  dispose() {
    for (const d of this.doors) this.deck.unregisterDoor(d)
    this.group.removeFromParent()
    for (const o of this.owned) o.dispose()
    this.fades.texture.dispose()
  }
}
