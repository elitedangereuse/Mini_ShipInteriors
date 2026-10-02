import * as THREE from 'three'
import { FLOOR_Y, WALL_T, type Box2, type Deck } from '../deck'
import { hullBody, hullMaterial } from '../hull'
import { DIRS } from '../map'
import { fadeBuffer, StaticMerge, type FadeBuffer } from '../merge'
import { ForceShield, shieldPylon, type ShieldPane } from '../shield'
import { applyPlot, straightRuns, type PlotEdge, type PlotPlan } from '../../shared/housing-plot.js'

/*
 * La bulle d'un joueur sur le pont des quartiers (housing v2, cf. shared/housing-plot.js) : sa
 * parcelle, posée sur le plan du pont, ses dalles, et le corps de vaisseau arrondi sur lequel
 * elle repose avec le palier de l'ascenseur, dans les tôles de la coque des autres ponts (PlotShell, reconstruit quand la parcelle change de taille) ; et le champ
 * de force tendu sur son pourtour, là où aucun mur ne le remplace (ForceField, celui du hangar,
 * cf. shield.ts), avec un pylône à chaque bout. En vue subjective, une verrière la couvre, comme
 * les serres, sauf au-dessus des pièces fermées, qui ont un plafond (cf. HomeView, home.ts).
 */

/** Lumières de la parcelle : une tous les LIGHT_STEP tuiles, chaudes et douces. */
const LIGHT_STEP = 5
const LIGHT_COLOR = new THREE.Color('#ffd9b0')

/**
 * Corps sous la parcelle : il déborde de BODY_MARGIN tuiles, et ses angles sont rognés de
 * BODY_CUT tuiles au plus le long de chaque côté (l'arrondi reste hors des tuiles).
 */
const BODY_MARGIN = 2
const BODY_CUT = 3

export class PlotShell {
  readonly group = new THREE.Group()
  readonly plan: PlotPlan
  /** Lumières ajoutées à celles du pont (coordonnées monde). */
  readonly lights: Deck['lights'] = []
  private readonly fades: FadeBuffer
  /** Ce qui appartient à la parcelle seule (géométrie fusionnée, corps) : libéré avec elle. */
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

    // Le corps du vaisseau, sous tout le pont : la parcelle, le palier, l'ascenseur.
    const cells = new Set<string>()
    for (let z = 0; z < deck.map.height; z++) {
      for (let x = 0; x < deck.map.width; x++) if (deck.map.isFloor(x, z)) cells.add(`${x},${z}`)
    }
    const body = new THREE.Mesh(hullBody(cells, BODY_MARGIN, BODY_CUT).geometry, hullMaterial())
    body.receiveShadow = true
    this.group.add(body)
    this.owned.push(body.geometry)

    for (let z = rect.minZ + 2; z <= rect.maxZ; z += LIGHT_STEP) {
      for (let x = rect.minX + 2; x <= rect.maxX; x += LIGHT_STEP) {
        this.lights.push({ position: new THREE.Vector3(x, deck.y + 1.4, z), color: LIGHT_COLOR, intensity: 1.4 })
      }
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
