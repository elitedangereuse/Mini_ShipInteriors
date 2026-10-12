import * as THREE from 'three'
import type { Box2, Deck, Interactable } from './deck'
import { ED_SHIPS, edShip, shipInfo, type EdShipId, type EdShipInfo } from './ed-ships'
import { beamMaterial, ED_ORANGE, glow, lit } from './furniture/kit'
import { tr } from './i18n'
import type { SeatSpot } from './seats'

/*
 * L'aire du hangar de la cale (et celle de la base au sol) : le vaisseau que le joueur a choisi
 * parmi ceux d'Elite Dangerous (cf. ed-ships.ts, et le registre du hangar), posé sur son train,
 * avec son escabeau devant le nez, son cockpit et ses réacteurs. Chacun voit le sien : le choix est
 * gardé dans ce navigateur, et un autre CMDR installé dans un autre vaisseau que le nôtre est dans
 * le sien, qu'on ne voit pas (cf. main.ts).
 *
 * Échelle : celle du Krait d'origine du hangar (73 m pour 6,6 tuiles, ~11 m par tuile), la même
 * pour tous ; les plus gros (Python, Type-9, Corvette, Cutter…) sont réduits pour tenir dans
 * l'emprise que Nico contourne (cf. MECH_OBSTACLES). Le nez est toujours au même endroit, face à
 * l'escabeau : les arrivées de vol, les postes de Nico et la ronde d'Ada ne bougent pas.
 *
 * Ce qui arrête le joueur vient du plan au sol du modèle (cf. scripts/import-ed-ships.mjs) : la
 * coque plus basse que la tête ; sous une aile haute, on passe.
 */

/** Tuiles par mètre : l'échelle du Krait d'origine du hangar (73,25 m pour 6,57 tuiles). */
export const BAY_SCALE = 6.57 / 73.25
/** Emprise du vaisseau dans le repère de l'aire (nez vers +z, bâbord vers +x) : celle du Krait d'origine. */
const NOSE_Z = 3.2
const LENGTH_MAX = 6.6
const HALF_WIDTH_MAX = 3.25
/** La coque plus basse que ça arrête le joueur ; plus haute, on passe dessous. */
const HEAD = 0.8
/** L'escabeau, devant le nez : sa plateforme, le bas des marches, et où l'on se tient pour y monter. */
const PLATFORM_FROM = NOSE_Z + 0.16
const PLATFORM_TO = NOSE_Z + 0.4
const STEPS_END = NOSE_Z + 1.06
const FOOT_Z = NOSE_Z + 1.3
const LADDER_HALF = 0.25

/** Le vaisseau choisi, gardé dans ce navigateur (le stockage peut manquer). */
const KEY = 'mini-shipinteriors-ship'
export const DEFAULT_SHIP: EdShipId = 'krait-mk2'

export function chosenShip(): EdShipId {
  try {
    const id = localStorage.getItem(KEY)
    return ED_SHIPS.includes(id as EdShipId) ? (id as EdShipId) : DEFAULT_SHIP
  } catch {
    return DEFAULT_SHIP
  }
}

export function saveShip(id: EdShipId) {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // Stockage indisponible (navigation privée) : le choix vaut pour cette visite.
  }
}

/** L'aire : centre du vaisseau d'origine (le Krait) et orientation de son nez (quarts de tour, cf. levels.ts). */
export interface PadFrame {
  x: number
  z: number
  rot: number
}

/** Le vaisseau posé : sa géométrie à l'échelle de l'aire, dans le repère de l'aire (tuiles). */
interface Layout {
  info: EdShipInfo
  /** Tuiles par mètre. */
  s: number
  /** Hauteur du train (le ventre au-dessus du pont). */
  gear: number
  length: number
  height: number
  /** Centre du vaisseau sur l'axe z de l'aire. */
  zc: number
}

/** Hauteur du dessus (`high`) ou du dessous (`low`) de la coque en (x, z) de l'aire, au-dessus du pont ; null : rien. */
function surface(l: Layout, which: 'high' | 'low', x: number, z: number): number | null {
  const p = l.info.plan
  const mx = x / l.s, mz = (z - l.zc) / l.s
  const i = Math.floor((mx + l.info.size[0] / 2) / p.cell), j = Math.floor((mz + l.info.size[2] / 2) / p.cell)
  if (i < 0 || j < 0 || i >= p.cols || j >= p.rows) return null
  const v = p[which][j * p.cols + i]
  return v < 0 ? null : l.gear + v * l.s
}

/** Le dessus de la coque près de l'axe, en z (on s'écarte un peu si l'axe tombe dans un creux, entre les deux pointes d'un nez fourchu). */
function ridge(l: Layout, z: number): { x: number; y: number } | null {
  for (const x of [0, 0.08, -0.08, 0.16, -0.16, 0.26, -0.26, 0.4, -0.4, 0.55, -0.55]) {
    const y = surface(l, 'high', x, z)
    if (y !== null) return { x, y }
  }
  return null
}

/** Tuiles par mètre d'un vaisseau sur l'aire : l'échelle commune, ou moins s'il ne tient pas dans l'emprise. */
export function bayScale(size: readonly number[]): number {
  return Math.min(BAY_SCALE, LENGTH_MAX / size[2], (2 * HALF_WIDTH_MAX) / size[0])
}

function layout(info: EdShipInfo): Layout {
  const [, h, len] = info.size
  const s = bayScale(info.size)
  // Le train : celui du Krait (0,34) pour les grands, plus court pour les petits (un Sidewinder n'est pas sur des échasses).
  const gear = THREE.MathUtils.clamp(0.28 * h * s, 0.12, 0.34)
  return { info, s, gear, length: len * s, height: h * s, zc: NOSE_Z - (len * s) / 2 }
}

/** Rectangles de collision (repère de l'aire) : les cases du plan où la coque descend sous la tête, fusionnées. */
function solids(l: Layout): Box2[] {
  const p = l.info.plan
  const x0 = -l.info.size[0] / 2, z0 = -l.info.size[2] / 2
  const out: Box2[] = []
  let open = new Map<string, Box2>()
  for (let j = 0; j < p.rows; j++) {
    const next = new Map<string, Box2>()
    let i = 0
    while (i < p.cols) {
      const solid = (k: number) => p.low[j * p.cols + k] >= 0 && l.gear + p.low[j * p.cols + k] * l.s < HEAD
      if (!solid(i)) {
        i++
        continue
      }
      const i0 = i
      while (i < p.cols && solid(i)) i++
      const key = `${i0},${i}`
      const zA = l.zc + (z0 + j * p.cell) * l.s, zB = l.zc + (z0 + (j + 1) * p.cell) * l.s
      const prev = open.get(key)
      if (prev) {
        prev.maxZ = zB
        next.set(key, prev)
      } else {
        const b = { minX: (x0 + i0 * p.cell) * l.s, maxX: (x0 + i * p.cell) * l.s, minZ: zA, maxZ: zB }
        out.push(b)
        next.set(key, b)
      }
    }
    open = next
  }
  return out
}

const ENGINE_DIM = new THREE.Color('#23405a')
const ENGINE_HOT = new THREE.Color('#d8f2ff')
const INVISIBLE = new THREE.MeshBasicMaterial({ visible: false })

export interface ShipBayOptions {
  deck: Deck
  pad: PadFrame
  /** Puissance des réacteurs (0 : au repos ; 0,3 : quelqu'un aux commandes ; 1 : en route), cf. hangar.ts. */
  power: { value: number }
}

/** Un vaisseau posé sur l'aire, et de quoi le retirer. */
interface Parked {
  id: EdShipId
  layout: Layout
  root: THREE.Group
  remove: () => void
  update: (t: number) => void
  spot: SeatSpot
}

export class ShipBay {
  /** L'escabeau : on y prend les commandes (sa place est le siège du cockpit, au bout des marches et du nez). */
  readonly cockpit: Interactable
  /** Le vaisseau lui-même : on l'examine (et Nico y fait inspecter le bord de l'aile, cf. hangar.ts). */
  readonly hull: Interactable
  /** Centre du vaisseau (repère du pont) : installé aux commandes, il ne s'estompe pas (cf. Interactable.keep). */
  private readonly center = new THREE.Vector3()
  private parked: Parked | null = null
  private wanted: EdShipId | null = null
  private power = 0
  /** Prévenu à chaque vaisseau posé (le pupitre du hangar, l'écran de vol). */
  onChange?: (bay: ShipBay) => void

  constructor(private readonly o: ShipBayOptions) {
    const { deck } = o
    const at = this.world(0, NOSE_Z + 0.7)
    this.cockpit = {
      object: new THREE.Object3D(),
      position: new THREE.Vector3(at.x, 0, at.z),
      label: tr('Prendre les commandes', 'Take the controls'),
      seats: () => (this.parked ? [this.parked.spot] : []),
      furniture: { model: 'ship-ladder' },
      keep: this.center,
    }
    this.hull = {
      object: new THREE.Object3D(),
      position: new THREE.Vector3(o.pad.x, 0, o.pad.z),
      label: tr('Examiner', 'Examine'),
      text: () => this.describe(),
      furniture: { model: 'ed-ship' },
    }
    deck.interactables.push(this.cockpit, this.hull)
  }

  /** Le vaisseau posé (ou en route vers l'aire). */
  get id(): EdShipId | null {
    return this.parked?.id ?? null
  }

  get info(): EdShipInfo | null {
    return this.parked?.layout.info ?? null
  }

  /** La place du pilote (repère du pont), si un vaisseau est posé. */
  get seat(): SeatSpot | null {
    return this.parked?.spot ?? null
  }

  /** Le point (repère du pont) est-il sur l'aire : sous l'emprise d'un vaisseau, ou sur son escabeau ? */
  covers(x: number, z: number): boolean {
    const b = this.worldBox({ minX: -HALF_WIDTH_MAX - 0.2, maxX: HALF_WIDTH_MAX + 0.2, minZ: NOSE_Z - LENGTH_MAX - 0.2, maxZ: FOOT_Z })
    return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ
  }

  /** Repère de l'aire → repère du pont (une rotation de θ envoie (x, z) sur (x cos θ + z sin θ, −x sin θ + z cos θ)). */
  private world(x: number, z: number): { x: number; z: number } {
    const a = (this.o.pad.rot * Math.PI) / 2, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a))
    return { x: this.o.pad.x + x * c + z * s, z: this.o.pad.z - x * s + z * c }
  }

  private worldBox(b: Box2, inset = 0): Box2 {
    const p = this.world(b.minX + inset, b.minZ + inset), q = this.world(b.maxX - inset, b.maxZ - inset)
    return { minX: Math.min(p.x, q.x), maxX: Math.max(p.x, q.x), minZ: Math.min(p.z, q.z), maxZ: Math.max(p.z, q.z) }
  }

  /** Pose ce vaisseau sur l'aire (il remplace le précédent dès qu'il est chargé). */
  async set(id: EdShipId): Promise<void> {
    if (this.parked?.id === id && this.wanted === null) return
    this.wanted = id
    const model = await edShip(id)
    // Un autre choix entre-temps : celui-là ne se pose pas.
    if (this.wanted !== id) return
    this.wanted = null
    this.parked?.remove()
    this.parked = this.park(id, model)
    this.onChange?.(this)
  }

  /** Construit le vaisseau, son train, son escabeau, ses jets et ses feux, et le pose sur le pont. */
  private park(id: EdShipId, model: THREE.Object3D): Parked {
    const info = shipInfo(model)
    const l = layout(info)
    const root = new THREE.Group()
    const p = this.o.pad
    root.position.set(p.x, 0, p.z)
    root.rotation.y = (p.rot * Math.PI) / 2

    // La coque : le modèle (en mètres, centré sur sa boîte), à l'échelle, sur son train.
    const ship = new THREE.Group()
    ship.position.set(0, l.gear + l.height / 2, l.zc)
    ship.scale.setScalar(l.s)
    model.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) c.castShadow = c.receiveShadow = true
    })
    ship.add(model)
    root.add(ship)

    // Les jets des tuyères, et la lueur des tuyères (un matériau à lui : ce vaisseau s'allume seul).
    const flames: { mesh: THREE.Mesh; z: number; r: number }[] = []
    const jet = beamMaterial()
    jet.uniforms.uColor.value.set('#8fd0ff')
    const cone = new THREE.ConeGeometry(1, 1, 8, 1, true)
    for (const [x, y, z, rx, ry] of info.engines) {
      const r = Math.max(rx, ry) * 0.85
      const mesh = new THREE.Mesh(cone, jet)
      mesh.rotation.x = -Math.PI / 2
      mesh.position.set(x, y, z)
      mesh.scale.set(r, r, r)
      mesh.visible = false
      mesh.userData.keepMaterial = true
      ship.add(mesh)
      flames.push({ mesh, z, r })
    }

    // Feux de navigation : rouge au bout de l'aile bâbord (+x), vert à tribord, blanc à la poupe.
    const pl = info.plan
    let port = -1, star = -1, stern = -1
    for (let k = 0; k < pl.high.length; k++) {
      if (pl.high[k] < 0) continue
      const i = k % pl.cols
      if (port < 0 || i > port % pl.cols) port = k
      if (star < 0 || i < star % pl.cols) star = k
      if (i === Math.floor(pl.cols / 2) && stern < 0) stern = k
    }
    const navAt = (k: number): THREE.Vector3 => new THREE.Vector3(
      -info.size[0] / 2 + ((k % pl.cols) + 0.5) * pl.cell,
      -info.size[1] / 2 + pl.high[k] + 0.05 / l.s,
      -info.size[2] / 2 + (Math.floor(k / pl.cols) + 0.5) * pl.cell,
    )
    const light = (color: string, at: THREE.Vector3) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.05 / l.s, 8, 6), glow(color))
      m.position.copy(at)
      m.userData.keepMaterial = true
      ship.add(m)
      return m
    }
    const nav = [light('#ff3b2f', navAt(port)), light('#4dff8a', navAt(star)), ...(stern >= 0 ? [light('#ffffff', navAt(stern))] : [])]

    // Le train : une jambe sous le nez, deux sous le ventre, du pont au dessous de la coque.
    const leg = lit('#3a3f47'), pad = lit('#22262c')
    const gearAt = (x: number, z: number) => {
      const top = surface(l, 'low', x, z)
      if (top === null || top < 0.03) return
      const r = 0.025 + 0.012 * (l.length / LENGTH_MAX)
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.2, top, 8), leg)
      strut.position.set(x, top / 2, z)
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(r * 2.6, r * 2.8, 0.03, 12), pad)
      foot.position.set(x, 0.015, z)
      root.add(strut, foot)
    }
    const half = (info.size[0] / 2) * l.s
    gearAt(0, NOSE_Z - l.length * 0.22)
    for (const side of [1, -1]) {
      for (const k of [0.24, 0.2, 0.16, 0.12, 0.08]) {
        const x = side * half * k * 2.2
        if (surface(l, 'low', x, NOSE_Z - l.length * 0.7) !== null) {
          gearAt(x, NOSE_Z - l.length * 0.7)
          break
        }
      }
    }

    // L'escabeau : marches, plateforme à hauteur du nez, rampes.
    const nose = ridge(l, NOSE_Z - 0.3) ?? { x: 0, y: l.gear + l.height * 0.5 }
    const P = THREE.MathUtils.clamp(nose.y - 0.02, 0.15, 2.4)
    const ladder = new THREE.Group()
    const frame = lit('#4a4f57'), tread = lit('#2a2e36'), rail = lit(ED_ORANGE)
    const n = Math.max(1, Math.round(P / 0.1) - 1)
    const run = STEPS_END - PLATFORM_TO
    const steps: { y: number; z: number }[] = []
    for (let i = 0; i < n; i++) {
      // Du bas (au bout des marches) vers le haut (contre la plateforme).
      const y = (P * (i + 1)) / (n + 1)
      const z = STEPS_END - ((i + 0.5) * run) / n
      steps.push({ y, z })
      const t = new THREE.Mesh(new THREE.BoxGeometry(LADDER_HALF * 1.9, 0.045, run / n + 0.03), tread)
      t.position.set(0, y - 0.022, z)
      ladder.add(t)
    }
    const deckTop = new THREE.Mesh(new THREE.BoxGeometry(LADDER_HALF * 2 + 0.05, 0.06, PLATFORM_TO - PLATFORM_FROM), tread)
    deckTop.position.set(0, P - 0.03, (PLATFORM_FROM + PLATFORM_TO) / 2)
    ladder.add(deckTop)
    for (const side of [1, -1]) {
      // Limon de chaque côté (le long des marches), poteaux de la plateforme, garde-corps.
      const a = new THREE.Vector3(side * LADDER_HALF, 0.04, STEPS_END), b = new THREE.Vector3(side * LADDER_HALF, P, PLATFORM_TO)
      const stringer = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, a.distanceTo(b)), frame)
      stringer.position.copy(a).add(b).multiplyScalar(0.5)
      stringer.lookAt(b.clone().add(ladder.position))
      ladder.add(stringer)
      const handrail = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, a.distanceTo(b)), rail)
      handrail.position.copy(stringer.position).setY(stringer.position.y + 0.32)
      handrail.lookAt(b.clone().setY(b.y + 0.32))
      ladder.add(handrail)
      for (const z of [PLATFORM_FROM, PLATFORM_TO, STEPS_END]) {
        const h = z === STEPS_END ? 0.36 : P + 0.36
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.045, h, 0.045), frame)
        post.position.set(side * LADDER_HALF, h / 2, z)
        ladder.add(post)
      }
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 10), tread)
      wheel.rotation.z = Math.PI / 2
      for (const z of [PLATFORM_FROM + 0.05, STEPS_END - 0.05]) {
        const w = wheel.clone()
        w.position.set(side * (LADDER_HALF + 0.02), 0.045, z)
        ladder.add(w)
      }
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(LADDER_HALF * 2 + 0.045, 0.035, 0.035), rail)
    top.position.set(0, P + 0.36, PLATFORM_TO)
    ladder.add(top)
    root.add(ladder)

    // Le cockpit : sous la verrière (le milieu du vaisseau s'il n'en a pas), la tête dépasse un peu.
    const c = info.canopy ?? [0, info.size[1] / 2, info.size[2] * 0.25]
    const seatX = c[0] * l.s, seatZ = l.zc + c[2] * l.s
    const canopyY = l.gear + (c[1] + info.size[1] / 2) * l.s
    const roof = ridge(l, seatZ)?.y ?? canopyY
    const seatY = Math.max(l.gear + 0.05, Math.min(roof - 0.3, canopyY + 0.1))
    // Le chemin : le pied de l'escabeau, les marches, la plateforme, le nez, le dos jusqu'au cockpit.
    const via: { x: number; y: number; z: number }[] = []
    const add = (x: number, y: number, z: number) => via.push({ ...this.world(x, z), y })
    add(0, 0, STEPS_END + 0.06)
    for (const st of steps) add(0, st.y, st.z)
    add(0, P, (PLATFORM_FROM + PLATFORM_TO) / 2)
    add(nose.x, nose.y + 0.02, NOSE_Z - 0.3)
    for (let z = NOSE_Z - 0.7; z > seatZ + 0.2; z -= 0.4) {
      const r = ridge(l, z)
      if (r) add(r.x, r.y + 0.02, z)
    }
    add(seatX, roof + 0.02, seatZ)
    const seat = this.world(seatX, seatZ)
    const yaw = (p.rot * Math.PI) / 2
    const spot: SeatSpot = { pose: 'pilot', x: seat.x, z: seat.z, y: seatY, yaw, from: this.world(0, FOOT_Z), via }

    // Ce qui arrête : la coque sous la tête, et l'escabeau.
    const local = solids(l)
    local.push({ minX: -LADDER_HALF - 0.04, maxX: LADDER_HALF + 0.04, minZ: PLATFORM_FROM, maxZ: STEPS_END })
    const blocks = local.map((b) => this.worldBox(b, 0.02))

    // Volumes invisibles pour le clic : la coque, l'escabeau.
    const hullBox = local.slice(0, -1).reduce(
      (a, b) => ({ minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX), minZ: Math.min(a.minZ, b.minZ), maxZ: Math.max(a.maxZ, b.maxZ) }),
      { minX: -0.3, maxX: 0.3, minZ: NOSE_Z - 0.5, maxZ: NOSE_Z },
    )
    const volume = (b: Box2, h: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(b.maxX - b.minX, h, b.maxZ - b.minZ), INVISIBLE)
      m.position.set((b.minX + b.maxX) / 2, h / 2, (b.minZ + b.maxZ) / 2)
      m.userData.keepMaterial = true
      root.add(m)
      return m
    }
    const hullPick = volume(hullBox, l.gear + l.height)
    const ladderPick = volume({ minX: -LADDER_HALF, maxX: LADDER_HALF, minZ: PLATFORM_FROM, maxZ: STEPS_END }, P + 0.4)

    const mid = this.world(0, l.zc)
    this.center.set(mid.x, 0, mid.z)
    const remove = this.o.deck.addRuntime(root, blocks, this.center)
    // Les interactions : l'escabeau (le cockpit), la coque (examiner ; l'aile tribord pour Nico).
    const foot = this.world(0, (PLATFORM_FROM + STEPS_END) / 2)
    this.cockpit.object = ladderPick
    this.cockpit.position.set(foot.x, 0, foot.z)
    const wing = this.world(hullBox.minX - 0.45, l.zc)
    this.hull.object = hullPick
    this.hull.position.set(wing.x, 0, wing.z)

    // Tuyères : leur matériau tramable est celui du vaisseau posé (cf. Deck.addRuntime).
    const cores: THREE.MeshBasicMaterial[] = []
    model.traverse((m) => {
      const mat = (m as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined
      if (mat?.name === 'engine' && !cores.includes(mat)) cores.push(mat)
    })
    const update = (t: number) => {
      // La puissance suit la consigne : les jets montent en un instant, et retombent aussi vite à l'arrêt.
      const goal = this.o.power.value
      this.power += (goal - this.power) * (goal > this.power ? 0.08 : 0.15)
      const k = Math.max(0.12 + 0.05 * Math.sin(t * 1.3), this.power)
      for (const m of cores) m.color.copy(ENGINE_DIM).lerp(ENGINE_HOT, k)
      // Les jets ne sortent qu'au-delà de l'éveil des tuyères (quelqu'un aux commandes, 0,3).
      const thrust = Math.max(0, (this.power - 0.3) / 0.7)
      jet.uniforms.uTime.value = t
      jet.uniforms.uIntensity.value = thrust * 0.95
      for (const f of flames) {
        f.mesh.visible = thrust > 0.03
        const len = f.r * (2.5 + thrust * 6 + Math.random() * 0.6 * thrust)
        f.mesh.scale.set(f.r * (1 + thrust * 0.25), len, f.r * (1 + thrust * 0.25))
        f.mesh.position.z = f.z - len / 2
      }
      nav[0].visible = nav[1].visible = t % 2 < 1.6
      if (nav[2]) nav[2].visible = t % 1.4 < 0.12 || thrust > 0.3
    }
    return { id, layout: l, root, remove, update, spot }
  }

  /** Ce qu'on lit en examinant le vaisseau. */
  private describe(): string {
    const info = this.info
    if (!info) return tr('L\'aire est vide.', 'The pad is empty.')
    const m = Math.round(info.size[2])
    return tr(
      `${info.name}, de ${info.maker} : ${m} m de la poupe au nez. Le vôtre, choisi au registre du hangar.`,
      `${info.name}, by ${info.maker}: ${m} m from stern to nose. Yours, picked at the hangar registry.`,
    )
  }

  /** À chaque image : les tuyères, les jets, les feux. */
  update(t: number) {
    this.parked?.update(t)
  }

  /** La silhouette du vaisseau vu de dessus, nez vers +x (chemin SVG, cf. EdShipInfo.silhouette). */
  silhouette(): string | null {
    return this.info?.silhouette ?? null
  }

  /**
   * Le vaisseau en fil de fer, pour l'hologramme du pupitre (largeur ~0,46), à la façon de la Cobra
   * de 1984 : quelques traits plutôt que toutes les arêtes (il y en aurait des milliers). Le contour
   * vu de dessus, à mi-hauteur ; l'arête dorsale et deux lignes de flanc, à la hauteur du dessus de
   * la coque ; et des montants qui les relient au contour, de loin en loin.
   */
  wireframe(): THREE.BufferGeometry | null {
    const info = this.info
    if (!info) return null
    const p = info.plan
    const [w, h, len] = info.size
    const k = 0.46 / Math.max(w, len)
    // Le centre d'une case, en mètres (repère du modèle), et la hauteur du dessus (y centré).
    const cx = (i: number) => -w / 2 + (i + 0.5) * p.cell
    const cz = (j: number) => -len / 2 + (j + 0.5) * p.cell
    const top = (i: number, j: number) => p.high[j * p.cols + i] - h / 2
    const left: THREE.Vector3[] = [], right: THREE.Vector3[] = []
    const lines: THREE.Vector3[][] = [[], [], []]
    for (let j = 0; j < p.rows; j++) {
      let a = -1, b = -1
      for (let i = 0; i < p.cols; i++) {
        if (p.high[j * p.cols + i] < 0) continue
        if (a < 0) a = i
        b = i
      }
      if (a < 0) continue
      right.push(new THREE.Vector3(cx(a) - p.cell / 2, 0, cz(j)))
      left.push(new THREE.Vector3(cx(b) + p.cell / 2, 0, cz(j)))
      // L'arête dorsale (au milieu), et une ligne de flanc de chaque côté, à mi-chemin du bord.
      const mid = Math.round((a + b) / 2)
      for (const [n, i] of [[0, mid], [1, Math.round((a + mid) / 2)], [2, Math.round((b + mid) / 2)]] as const) {
        if (p.high[j * p.cols + i] >= 0) lines[n].push(new THREE.Vector3(cx(i), top(i, j), cz(j)))
      }
    }
    const outline = simplify([...right, ...left.reverse(), right[0]], p.cell * 0.9)
    const points: number[] = []
    const strip = (pts: THREE.Vector3[]) => {
      for (let i = 0; i + 1 < pts.length; i++) points.push(pts[i].x * k, pts[i].y * k, pts[i].z * k, pts[i + 1].x * k, pts[i + 1].y * k, pts[i + 1].z * k)
    }
    strip(outline)
    for (const l of lines) {
      const s = simplify(l, p.cell * 0.6)
      strip(s)
      // Des montants, du dessus de la coque au contour (un sur trois points de la ligne).
      for (let i = 0; i < s.length; i += 3) points.push(s[i].x * k, s[i].y * k, s[i].z * k, s[i].x * k, 0, s[i].z * k)
    }
    return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  }
}

/** Ramer-Douglas-Peucker : la ligne, sans les points à moins de `tolerance` de leurs voisins. */
function simplify(pts: THREE.Vector3[], tolerance: number): THREE.Vector3[] {
  if (pts.length < 3) return pts
  const line = new THREE.Line3(), closest = new THREE.Vector3()
  let far = 0, at = -1
  line.set(pts[0], pts[pts.length - 1])
  for (let i = 1; i < pts.length - 1; i++) {
    const d = line.closestPointToPoint(pts[i], true, closest).distanceTo(pts[i])
    if (d > far) {
      far = d
      at = i
    }
  }
  if (far <= tolerance) return [pts[0], pts[pts.length - 1]]
  return [...simplify(pts.slice(0, at + 1), tolerance).slice(0, -1), ...simplify(pts.slice(at), tolerance)]
}
