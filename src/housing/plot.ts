import * as THREE from 'three'
import { FLOOR_Y, WALL_T, type Box2, type Deck } from '../deck'
import { DIRS } from '../map'
import { fadeBuffer, StaticMerge, type FadeBuffer } from '../merge'
import { ForceShield, shieldPylon, type ShieldPane } from '../shield'
import { applyPlot, LANDING_ROOM, straightRuns, type PlotEdge, type PlotPlan, type PlotRect } from '../../shared/housing-plot.js'

/*
 * La bulle d'un joueur sur le pont des quartiers (housing v2, cf. shared/housing-plot.js) : sa
 * parcelle, posée sur le plan du pont, ses dalles, et le socle sur lequel elle flotte avec le
 * palier de l'ascenseur (PlotShell, reconstruit quand la parcelle change de taille) ; et le champ
 * de force tendu sur son pourtour, là où aucun mur ne le remplace (ForceField, celui du hangar,
 * cf. shield.ts), avec un pylône à chaque bout. En vue subjective, une verrière la couvre, comme
 * les serres, sauf au-dessus des pièces fermées, qui ont un plafond (cf. HomeView, home.ts).
 */

/** Lumières de la parcelle : une tous les LIGHT_STEP tuiles, chaudes et douces. */
const LIGHT_STEP = 5
const LIGHT_COLOR = new THREE.Color('#ffd9b0')

const SLAB = new THREE.MeshLambertMaterial({ color: '#3a3f4b' })
const SLAB_UNDER = new THREE.MeshLambertMaterial({ color: '#272b33' })
const SLAB_RIM = new THREE.MeshBasicMaterial({ color: '#59d8ff' })

export class PlotShell {
  readonly group = new THREE.Group()
  readonly plan: PlotPlan
  /** Lumières ajoutées à celles du pont (coordonnées monde). */
  readonly lights: Deck['lights'] = []
  private readonly fades: FadeBuffer
  /** Ce qui appartient à la parcelle seule (géométrie fusionnée, socle) : libéré avec elle. */
  private owned: { dispose(): void }[] = []

  constructor(deck: Deck, stage: number) {
    this.plan = applyPlot(deck.map, stage)
    const { tiles, rect } = this.plan

    const merge = new StaticMerge()
    for (const t of tiles) merge.add(deck.placeModel('floor', t.x, FLOOR_Y, t.z), false)
    this.fades = fadeBuffer(merge.fadingCount)
    for (const m of merge.flush(this.group, this.fades.texture)) {
      this.owned.push(m.geometry)
      if (m.userData.ownMaterial) this.owned.push(m.material as THREE.Material)
    }

    // Le socle : sous la parcelle, et sous le palier de l'ascenseur.
    this.slab(rect)
    this.slab(landingRect(deck))

    for (let z = rect.minZ + 2; z <= rect.maxZ; z += LIGHT_STEP) {
      for (let x = rect.minX + 2; x <= rect.maxX; x += LIGHT_STEP) {
        this.lights.push({ position: new THREE.Vector3(x, deck.y + 1.4, z), color: LIGHT_COLOR, intensity: 1.4 })
      }
    }
  }

  /** Dalle du socle sous un rectangle de tuiles : un plateau qui déborde, un liseré, un dessous en retrait. */
  private slab(r: PlotRect) {
    const w = r.maxX - r.minX + 1, d = r.maxZ - r.minZ + 1
    const cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2
    const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.22, d + 0.6), SLAB)
    top.position.set(cx, FLOOR_Y - 0.12, cz)
    top.receiveShadow = true
    const rim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.64, 0.03, d + 0.64), SLAB_RIM)
    rim.position.set(cx, FLOOR_Y - 0.1, cz)
    const under = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, 0.45, d - 0.4), SLAB_UNDER)
    under.position.set(cx, FLOOR_Y - 0.45, cz)
    for (const m of [top, rim, under]) {
      this.group.add(m)
      this.owned.push(m.geometry)
    }
  }

  /** Retire la parcelle ; les modèles du kit (géométries partagées) restent intacts. */
  dispose() {
    this.group.removeFromParent()
    for (const o of this.owned) o.dispose()
    this.fades.texture.dispose()
  }
}

/**
 * Le champ de force sur les arêtes du pourtour restées libres : un pan par côté droit et continu,
 * un pylône à chaque bout (sauf contre un poteau déjà là : l'angle du palier, ou celui d'un mur).
 */
export class ForceField {
  readonly group = new THREE.Group()
  /** Le champ de force arrête les pas comme un mur ; les pylônes aussi. */
  readonly colliders: Box2[] = []
  private readonly shields: ForceShield[] = []
  private owned: { dispose(): void }[] = []

  /** @param posts poteaux déjà là (centre) */
  constructor(edges: PlotEdge[], posts: { x: number; z: number }[]) {
    const corners = new Map<string, THREE.Vector3>()
    for (const [i, run] of straightRuns(edges).entries()) {
      const d = DIRS[run.dir]
      const alongX = d.dz !== 0
      const panes: ShieldPane[] = run.edges.map((e) => ({ x: e.x + d.dx * 0.5, z: e.z + d.dz * 0.5, alongX }))
      // Le trafic au loin : derrière un seul pan suffit.
      const shield = new ForceShield(panes, (d.dx + d.dz) as 1 | -1, { pylons: false, stars: false, traffic: i === 0 })
      this.shields.push(shield)
      this.group.add(shield.group)
      const w = WALL_T / 2
      for (const p of panes) {
        this.colliders.push(alongX ? { minX: p.x - 0.5, maxX: p.x + 0.5, minZ: p.z - w, maxZ: p.z + w } : { minX: p.x - w, maxX: p.x + w, minZ: p.z - 0.5, maxZ: p.z + 0.5 })
      }
      const first = panes[0], last = panes[panes.length - 1]
      for (const v of alongX ? [[first.x - 0.5, first.z], [last.x + 0.5, last.z]] : [[first.x, first.z - 0.5], [last.x, last.z + 0.5]]) {
        corners.set(`${v[0]},${v[1]}`, new THREE.Vector3(v[0], 0, v[1]))
      }
    }
    for (const v of corners.values()) {
      if (posts.some((p) => Math.abs(p.x - v.x) < 1e-6 && Math.abs(p.z - v.z) < 1e-6)) continue
      const pylon = shieldPylon(v)
      this.group.add(pylon)
      pylon.traverse((c) => {
        const m = c as THREE.Mesh
        if (m.isMesh) this.owned.push(m.geometry, m.material as THREE.Material)
      })
      this.colliders.push({ minX: v.x - 0.13, maxX: v.x + 0.13, minZ: v.z - 0.13, maxZ: v.z + 0.13 })
    }
  }

  /** Le champ s'anime ; il s'efface à moitié du côté de la caméra. */
  update(dt: number, toCamera: THREE.Vector3, ceiling: number | null) {
    for (const s of this.shields) s.update(dt, toCamera, ceiling)
  }

  dispose() {
    for (const s of this.shields) s.dispose()
    this.group.removeFromParent()
    for (const o of this.owned) o.dispose()
  }
}

/** Tuiles du palier de l'ascenseur. */
function landingRect(deck: Deck): PlotRect {
  const r = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity }
  for (let z = 0; z < deck.map.height; z++) {
    for (let x = 0; x < deck.map.width; x++) {
      if (deck.map.room(x, z) !== LANDING_ROOM) continue
      r.minX = Math.min(r.minX, x), r.maxX = Math.max(r.maxX, x)
      r.minZ = Math.min(r.minZ, z), r.maxZ = Math.max(r.maxZ, z)
    }
  }
  return r
}
