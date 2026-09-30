import * as THREE from 'three'
import { makePostMesh, POST_H, POST_W, upperWalls, WALL_T, type Box2, type Deck, type DoorState, type WallSegment } from '../deck'
import { makeFadeable } from '../fade'
import { box, compact, cylinder, glass, glow, lit, sphere } from '../furniture/kit'
import { tr } from '../i18n'
import { fadeBuffer, StaticMerge, updateOccluders, type FadeBuffer, type FadeFocus, type Occluder } from '../merge'
import { DOOR_GAP } from '../../shared/sight.js'
import { isDoor, partitionEdge, type Partition } from '../../shared/cabin-partitions.js'

/*
 * Cloisons des quartiers : les murs et les portes que le CMDR pose sur les arêtes du quadrillage
 * (cf. shared/cabin-partitions.js pour le plan, cabin/view.ts pour le papier peint, qui s'y pose
 * comme sur les autres murs de la pièce, et editor.ts pour l'onglet « Cloisons »). Les murs sont
 * ceux du vaisseau (pan plein ou à hublot) ; les portes, un encadrement du vaisseau et un battant
 * au choix, qui s'ouvre quand quelqu'un approche (cf. Deck.update). Comme une pièce d'extension,
 * tout est fusionné (un appel de dessin par matériau) et s'estompe devant le joueur ; en mode
 * aménagement, les cloisons s'estompent toutes, pour qu'on voie ce qu'il y a derrière.
 */

export interface PartitionKind {
  id: string
  name: string
  door: boolean
}

/** Modèles de cloisons, dans l'ordre de l'onglet « Cloisons ». */
export const PARTITION_KINDS: PartitionKind[] = [
  { id: 'wall', name: tr('Mur', 'Wall'), door: false },
  { id: 'window', name: tr('Mur à hublot', 'Porthole wall'), door: false },
  { id: 'sliding', name: tr('Porte coulissante', 'Sliding door'), door: true },
  { id: 'wood', name: tr('Porte en bois', 'Wooden door'), door: true },
  { id: 'saloon', name: tr('Portes de saloon', 'Saloon doors'), door: true },
  { id: 'airlock', name: tr('Porte de sas', 'Airlock door'), door: true },
  { id: 'shoji', name: tr('Porte japonaise', 'Shoji door'), door: true },
  { id: 'glass', name: tr('Porte vitrée', 'Glass door'), door: true },
  { id: 'beads', name: tr('Rideau de perles', 'Bead curtain'), door: true },
  { id: 'arch', name: tr('Arche', 'Archway'), door: true },
]

export const kindOf = (p: Partition) => p.k ?? 'wall'

/** Milieu de l'arête d'une cloison, et son sens. */
export function partitionCenter(p: Partition): { cx: number; cz: number; alongX: boolean } {
  const { x, z, dir } = partitionEdge(p)
  return dir === 1 ? { cx: x + 0.5, cz: z, alongX: false } : { cx: x, cz: z + 0.5, alongX: true }
}

// ---------------------------------------------------------------- battants

const C = {
  wood: '#8a5a3a',
  woodDark: '#5e3a24',
  brass: '#c9a24a',
  steel: '#5b626e',
  hazard: '#e9a917',
  paper: '#f3ead2',
  alu: '#b9c1cc',
}

/** Hauteur et demi-largeur de l'ouverture d'une porte du vaisseau. */
const OPEN_H = 0.68
const OPEN_W = 0.29

interface Leaves {
  /** Pièces mobiles (repère de la porte : x le long du mur, z en travers, origine au sol). */
  parts: THREE.Object3D[]
  /** Décor fixe ajouté à l'encadrement (chambranles de bois, arche…). */
  trim?: THREE.Object3D
  animate?: (open: number) => void
  quiet?: boolean
  /** Battant du kit du vaisseau : sa géométrie est partagée, on ne la libère pas. */
  kit?: boolean
}

/** Chambranle de bois autour de l'ouverture, sur les deux faces. */
function casing(color = C.woodDark): THREE.Group {
  const g = new THREE.Group()
  const m = lit(color)
  for (const z of [-0.155, 0.155]) {
    g.add(box(0.05, OPEN_H + 0.04, 0.02, m, -OPEN_W - 0.02, (OPEN_H + 0.04) / 2, z), box(0.05, OPEN_H + 0.04, 0.02, m, OPEN_W + 0.02, (OPEN_H + 0.04) / 2, z))
    g.add(box(OPEN_W * 2 + 0.1, 0.05, 0.02, m, 0, OPEN_H + 0.02, z))
  }
  return g
}

/** Battant pivotant autour d'une charnière en (x, 0, 0) : le battant part vers +x (vers -x si `flip`). */
function hinged(leaf: THREE.Object3D, x: number, flip = false): THREE.Group {
  const pivot = new THREE.Group()
  pivot.position.x = x
  if (flip) leaf.scale.x = -1
  pivot.add(leaf)
  return pivot
}

function woodLeaf(): THREE.Object3D {
  const g = new THREE.Group()
  const w = OPEN_W * 2 - 0.02
  g.add(box(w, OPEN_H - 0.01, 0.035, lit(C.wood), w / 2, (OPEN_H - 0.01) / 2, 0))
  // Quatre panneaux moulurés, sur les deux faces.
  for (const z of [-0.02, 0.02]) {
    for (const [x, y, h] of [[0.15, 0.49, 0.26], [0.41, 0.49, 0.26], [0.15, 0.17, 0.22], [0.41, 0.17, 0.22]]) g.add(box(0.2, h, 0.008, lit(C.woodDark), x * (w / 0.56), y, z))
    g.add(sphere(0.018, lit(C.brass), w - 0.05, 0.33, z * 1.6, 8))
  }
  return compact(g)
}

function saloonLeaf(): THREE.Object3D {
  const g = new THREE.Group()
  const w = OPEN_W - 0.01
  g.add(box(w, 0.04, 0.03, lit(C.wood), w / 2, 0.53, 0), box(w, 0.04, 0.03, lit(C.wood), w / 2, 0.22, 0))
  g.add(box(0.03, 0.35, 0.03, lit(C.wood), 0.015, 0.375, 0), box(0.03, 0.35, 0.03, lit(C.wood), w - 0.015, 0.375, 0))
  for (let i = 1; i < 5; i++) g.add(box(0.035, 0.28, 0.018, lit(C.woodDark), (i * w) / 5, 0.375, 0))
  return compact(g)
}

/** Demi-porte de sas : acier, bandes jaunes et noires en chevrons, hublot sur la moitié haute. */
function airlockHalf(top: boolean): THREE.Object3D {
  const g = new THREE.Group()
  const h = OPEN_H / 2
  g.add(box(OPEN_W * 2, h, 0.06, lit(C.steel), 0, 0, 0))
  for (const z of [-0.032, 0.032]) {
    for (let i = -3; i <= 3; i++) {
      const stripe = box(0.05, 0.14, 0.006, lit(i % 2 ? '#1c1d21' : C.hazard), i * 0.08, top ? -h / 2 + 0.05 : h / 2 - 0.05, z)
      stripe.rotation.z = top ? 0.7 : -0.7
      g.add(stripe)
    }
    if (top) g.add(cylinder(0.06, 0.06, 0.01, lit('#2a2e36'), 0, 0.05, z, 16).rotateX(Math.PI / 2), cylinder(0.045, 0.045, 0.012, glow('#6fd8ff'), 0, 0.05, z, 16).rotateX(Math.PI / 2))
  }
  return compact(g)
}

/** Panneau coulissant japonais : cadre de bois, croisillons, papier de riz. */
function shojiLeaf(): THREE.Object3D {
  const g = new THREE.Group()
  const w = OPEN_W * 2 - 0.02
  g.add(box(w - 0.04, OPEN_H - 0.05, 0.01, lit(C.paper), 0, OPEN_H / 2, 0))
  const wood = lit('#b98a52')
  for (const x of [-w / 2 + 0.02, w / 2 - 0.02]) g.add(box(0.035, OPEN_H - 0.01, 0.03, wood, x, OPEN_H / 2, 0))
  for (const y of [0.02, OPEN_H - 0.02]) g.add(box(w, 0.035, 0.03, wood, 0, y, 0))
  for (let i = 1; i < 3; i++) g.add(box(0.012, OPEN_H - 0.05, 0.022, wood, -w / 2 + (i * w) / 3, OPEN_H / 2, 0))
  for (let i = 1; i < 5; i++) g.add(box(w - 0.04, 0.012, 0.022, wood, 0, (i * OPEN_H) / 5, 0))
  return compact(g)
}

/** Porte vitrée : cadre d'aluminium, grande vitre, poignée. */
function glassLeaf(): THREE.Object3D {
  const g = new THREE.Group()
  const w = OPEN_W * 2 - 0.02
  const alu = lit(C.alu)
  for (const x of [-w / 2 + 0.015, w / 2 - 0.015]) g.add(box(0.03, OPEN_H - 0.01, 0.035, alu, x, OPEN_H / 2, 0))
  for (const y of [0.02, OPEN_H - 0.02]) g.add(box(w, 0.035, 0.035, alu, 0, y, 0))
  g.add(box(0.015, 0.16, 0.06, alu, w / 2 - 0.06, 0.34, 0))
  const out = compact(g)
  out.add(box(w - 0.05, OPEN_H - 0.06, 0.01, glass('#bfe6f2', 0.3), 0, OPEN_H / 2, 0))
  return out
}

/** Un fil de perles, pendu à 0 (en haut), perles vers le bas. */
function strand(random: () => number): THREE.Object3D {
  const g = new THREE.Group()
  const colors = ['#ff6a5a', '#ffd23c', '#6ad8ff', '#ff6ad5', '#8aff7a', '#b88aff']
  g.add(cylinder(0.002, 0.002, OPEN_H - 0.02, lit('#3a3e46'), 0, -(OPEN_H - 0.02) / 2, 0, 4))
  for (let i = 0; i < 11; i++) g.add(sphere(0.013, lit(colors[Math.floor(random() * colors.length)]), 0, -0.04 - i * 0.058, 0, 6))
  return compact(g)
}

function leaves(kind: string, deck: Deck, random: () => number): Leaves {
  switch (kind) {
    case 'wood': {
      const pivot = hinged(woodLeaf(), -OPEN_W + 0.01)
      return { parts: [pivot], trim: casing(), quiet: true, animate: (o) => (pivot.rotation.y = -o * 1.45) }
    }
    case 'saloon': {
      const left = hinged(saloonLeaf(), -OPEN_W)
      const right = hinged(saloonLeaf(), OPEN_W, true)
      return {
        parts: [left, right], trim: casing(), quiet: true,
        animate: (o) => {
          left.rotation.y = -o * 1.3
          right.rotation.y = o * 1.3
        },
      }
    }
    case 'airlock': {
      const top = airlockHalf(true), bottom = airlockHalf(false)
      const trim = new THREE.Group()
      for (const z of [-0.155, 0.155]) for (const x of [-OPEN_W - 0.03, OPEN_W + 0.03]) trim.add(box(0.03, OPEN_H, 0.02, lit(C.hazard), x, OPEN_H / 2, z))
      return {
        parts: [top, bottom], trim,
        animate: (o) => {
          top.position.y = OPEN_H * 0.75 + o * 0.3
          bottom.position.y = OPEN_H * 0.25 - o * 0.36
        },
      }
    }
    case 'shoji': {
      const leaf = shojiLeaf()
      return { parts: [leaf], trim: casing('#8a6a42'), quiet: true, animate: (o) => (leaf.position.x = o * 0.5) }
    }
    case 'glass': {
      const leaf = glassLeaf()
      return { parts: [leaf], animate: (o) => (leaf.position.x = o * 0.5) }
    }
    case 'beads': {
      const strands: THREE.Group[] = []
      for (let i = 0; i < 7; i++) {
        const pivot = new THREE.Group()
        pivot.position.set(-OPEN_W + 0.04 + (i * (OPEN_W * 2 - 0.08)) / 6, OPEN_H - 0.01, 0)
        pivot.add(strand(random))
        strands.push(pivot)
      }
      return {
        parts: strands, trim: casing('#3a2418'), quiet: true,
        animate: (o) => strands.forEach((s) => {
          const side = s.position.x / OPEN_W
          s.rotation.z = o * (side >= 0 ? 1 : -1) * (0.15 + 0.3 * (1 - Math.abs(side)))
          s.rotation.x = o * 0.35
        }),
      }
    }
    case 'arch': {
      // Pas de battant : une arche de bois dans l'encadrement.
      const trim = new THREE.Group()
      for (const z of [-0.14, 0.14]) {
        const arc = new THREE.Mesh(new THREE.TorusGeometry(OPEN_W - 0.02, 0.03, 6, 16, Math.PI), lit(C.woodDark))
        arc.position.set(0, OPEN_H - OPEN_W + 0.01, z)
        trim.add(arc)
        for (const x of [-OPEN_W + 0.02, OPEN_W - 0.02]) trim.add(box(0.05, OPEN_H - OPEN_W, 0.04, lit(C.woodDark), x, (OPEN_H - OPEN_W) / 2, z))
      }
      return { parts: [], trim }
    }
    default: {
      // La porte du vaisseau : un panneau qui glisse dans le mur.
      const panel = deck.placeModel('door-single', 0, 0, 0)
      panel.scale.set(0.98, 0.99, 0.9)
      return { parts: [panel], kit: true, animate: (o) => (panel.position.x = o * 0.42) }
    }
  }
}

// ---------------------------------------------------------------- les cloisons d'une cabine

export class PartitionShell {
  readonly group = new THREE.Group()
  private readonly ceiling = new THREE.Group()
  private ceilingOccluders: Occluder[] = []
  private ceilingFades: FadeBuffer
  /** Murs, montants des portes, poteaux. */
  readonly colliders: Box2[] = []
  /** Pans de mur et portes posés (le papier peint et les objets accrochés s'y fient). */
  readonly walls: WallSegment[] = []
  /** Poteaux ajoutés (centre). */
  readonly posts: { x: number; z: number }[] = []
  /** Passage de chaque porte, à laisser libre de meubles. */
  readonly doorways: Box2[] = []
  private occluders: Occluder[] = []
  private fades: FadeBuffer
  private doors: DoorState[] = []
  /** Ses portes, grandies avec celles du pont en vue subjective. */
  private tallParts: THREE.Object3D[] = []
  private doorOccluders: Occluder[] = []
  private owned: { dispose(): void }[] = []

  /**
   * @param partitions cloisons posées sur le plan (cf. applyPartitions)
   * @param existing murs et poteaux déjà là (le pont, les pièces d'extension) : pour les poteaux d'angle
   */
  constructor(
    private deck: Deck,
    partitions: Partition[],
    existing: { walls: WallSegment[]; posts: { x: number; z: number }[] },
  ) {
    const merge = new StaticMerge()
    const random = mulberry(partitions.length * 7919 + 17)
    const vertex = new Map<string, { h: number; v: number }>()
    const touch = (vx: number, vz: number, axis: 'h' | 'v') => {
      const k = `${vx},${vz}`
      const c = vertex.get(k) ?? { h: 0, v: 0 }
      c[axis]++
      vertex.set(k, c)
    }
    const t = WALL_T / 2
    for (const p of partitions) {
      const { cx, cz, alongX } = partitionCenter(p)
      const rot = alongX ? 0 : Math.PI / 2
      if (alongX) touch(cx - 0.5, cz, 'h'), touch(cx + 0.5, cz, 'h')
      else touch(cx, cz - 0.5, 'v'), touch(cx, cz + 0.5, 'v')
      if (isDoor(p)) {
        this.buildDoor(p, cx, cz, alongX, random)
        continue
      }
      const model = p.k === 'window' ? 'wall-window' : 'wall'
      const wall = deck.placeModel(model, cx, 0, cz, rot)
      this.occluders.push(merge.addFading(wall, new THREE.Vector3(cx, 0.5, cz)))
      this.walls.push({ x: cx, z: cz, alongX, model })
      this.colliders.push(alongX ? { minX: cx - 0.5, maxX: cx + 0.5, minZ: cz - t, maxZ: cz + t } : { minX: cx - t, maxX: cx + t, minZ: cz - 0.5, maxZ: cz + 0.5 })
    }

    // Poteaux : là où une cloison tourne, rejoint un mur, ou s'arrête au milieu de la pièce.
    const post = makePostMesh(deck.theme.shell)
    for (const [k, c] of vertex) {
      const [vx, vz] = k.split(',').map(Number)
      for (const w of existing.walls) {
        if (w.alongX && Math.abs(w.z - vz) < 1e-6 && Math.abs(Math.abs(w.x - vx) - 0.5) < 1e-6) c.h++
        if (!w.alongX && Math.abs(w.x - vx) < 1e-6 && Math.abs(Math.abs(w.z - vz) - 0.5) < 1e-6) c.v++
      }
      const straight = (c.h === 2 && c.v === 0) || (c.v === 2 && c.h === 0)
      if (straight || existing.posts.some((p) => Math.abs(p.x - vx) < 1e-6 && Math.abs(p.z - vz) < 1e-6)) continue
      const m = post.clone()
      m.position.set(vx, POST_H / 2, vz)
      m.updateMatrixWorld(true)
      this.occluders.push(merge.addFading(m, new THREE.Vector3(vx, 0.5, vz)))
      this.posts.push({ x: vx, z: vz })
      const hs = POST_W / 2
      this.colliders.push({ minX: vx - hs, maxX: vx + hs, minZ: vz - hs, maxZ: vz + hs })
    }
    post.geometry.dispose()

    this.fades = fadeBuffer(merge.fadingCount)
    for (const m of merge.flush(this.group, this.fades.texture)) {
      this.owned.push(m.geometry)
      if (m.userData.ownMaterial) this.owned.push(m.material as THREE.Material)
    }

    // Haut des murs, jusqu'au plafond (vue subjective).
    const top = new StaticMerge()
    this.ceilingOccluders = upperWalls(top, this.walls, this.posts, 1, POST_H, deck.ceilingY, deck.theme.shell)
    this.ceilingFades = fadeBuffer(top.fadingCount)
    for (const m of top.flush(this.ceiling, this.ceilingFades.texture)) {
      m.castShadow = false
      this.owned.push(m.geometry)
      if (m.userData.ownMaterial) this.owned.push(m.material as THREE.Material)
    }
    deck.ceiling.add(this.ceiling)
  }

  /** Porte : l'encadrement du vaisseau, son décor, ses battants ; elle s'ouvre comme celles du pont. */
  private buildDoor(p: Partition, cx: number, cz: number, alongX: boolean, random: () => number) {
    const { x, z, dir } = partitionEdge(p)
    const holder = new THREE.Group()
    holder.position.set(cx, 0, cz)
    holder.rotation.y = alongX ? 0 : Math.PI / 2
    const frame = this.deck.placeModel('wall-door', 0, 0, 0)
    const l = leaves(p.k ?? 'sliding', this.deck, random)
    holder.add(frame, ...l.parts)
    if (l.trim) holder.add(l.trim)
    l.animate?.(0)
    // Tout se trame ensemble : un matériau tramable par matériau d'origine.
    const fade = { value: 1 }
    const fadeable = new Map<THREE.Material, THREE.Material>()
    holder.traverse((c) => {
      const m = c as THREE.Mesh
      if (!m.isMesh) return
      const src = m.material as THREE.Material
      let dst = fadeable.get(src)
      if (!dst) {
        fadeable.set(src, (dst = makeFadeable(src, fade)))
        this.owned.push(dst)
      }
      m.material = dst
      m.castShadow = true
      m.receiveShadow = true
    })
    // Les géométries du kit du vaisseau (encadrement, porte coulissante) sont partagées ; celles
    // des battants et du décor faits main appartiennent à la porte.
    for (const part of [...(l.kit ? [] : l.parts), ...(l.trim ? [l.trim] : [])]) {
      part.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) this.owned.push((c as THREE.Mesh).geometry)
      })
    }
    this.group.add(holder)
    // Grandie avec les portes du pont en vue subjective (cf. TALL_DOOR).
    this.deck.registerTall([holder])
    this.tallParts.push(holder)
    this.doorOccluders.push({ center: new THREE.Vector3(cx, 0.5, cz), value: 1, uniform: fade })
    this.walls.push({ x: cx, z: cz, alongX, model: 'door' })
    if (l.animate) {
      const door: DoorState = {
        panel: holder,
        center: new THREE.Vector3(cx, 0, cz),
        axis: alongX ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1),
        open: 0,
        wanted: false,
        x,
        z,
        dir,
        lamp: new THREE.Object3D(),
        animate: l.animate,
        quiet: l.quiet,
      }
      this.deck.registerDoor(door)
      this.doors.push(door)
    }
    const g = DOOR_GAP / 2, t = WALL_T / 2
    if (alongX) {
      this.colliders.push({ minX: cx - 0.5, maxX: cx - g, minZ: cz - t, maxZ: cz + t }, { minX: cx + g, maxX: cx + 0.5, minZ: cz - t, maxZ: cz + t })
      this.doorways.push({ minX: cx - 0.3, maxX: cx + 0.3, minZ: cz - 0.6, maxZ: cz + 0.6 })
    } else {
      this.colliders.push({ minX: cx - t, maxX: cx + t, minZ: cz - 0.5, maxZ: cz - g }, { minX: cx - t, maxX: cx + t, minZ: cz + g, maxZ: cz + 0.5 })
      this.doorways.push({ minX: cx - 0.6, maxX: cx + 0.6, minZ: cz - 0.3, maxZ: cz + 0.3 })
    }
  }

  /**
   * Murs et portes qui masquent le joueur ; en mode aménagement, toutes les cloisons, sauf si
   * `solid` (on les pose : il faut les voir).
   */
  update(view: FadeFocus, dt: number, solid = false) {
    const outward = view.cabin && !solid ? { x: view.toCamera.x, z: view.toCamera.z } : undefined
    for (const o of this.occluders) o.outward = outward
    for (const o of this.doorOccluders) o.outward = outward
    if (updateOccluders(this.occluders, this.fades, view, dt)) this.fades.texture.needsUpdate = true
    updateOccluders(this.doorOccluders, this.fades, view, dt)
    if (updateOccluders(this.ceilingOccluders, this.ceilingFades, view, dt)) this.ceilingFades.texture.needsUpdate = true
  }

  dispose() {
    for (const d of this.doors) this.deck.unregisterDoor(d)
    this.deck.unregisterTall(this.tallParts)
    this.group.removeFromParent()
    this.ceiling.removeFromParent()
    for (const o of this.owned) o.dispose()
    this.fades.texture.dispose()
    this.ceilingFades.texture.dispose()
  }
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
