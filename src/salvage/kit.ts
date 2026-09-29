import * as THREE from 'three'
import { rig } from '../assets'
import { recolored } from '../recolor'

/*
 * Modèles de la baie infestée (Kenney, CC0) : les murs, piliers, sols et portes du Modular Space
 * Kit, à l'échelle 1/4 (une pièce de 4 m y fait une tuile, ses murs 1,06 de haut et 0,3 d'épais
 * entre deux tuiles, comme ceux du vaisseau) ; les conteneurs des wagons du Train Kit, sans
 * leurs roues ; le décor du Space Kit (fûts, ossements, cristaux, générateurs). Le lilas et
 * l'orange du kit modulaire sont repeints en acier noirci et en ambre terni.
 */

const MODULAR = ['template-wall', 'template-detail', 'template-floor', 'template-floor-detail', 'template-floor-detail-a', 'gate', 'gate-door', 'cables'] as const
const TRAIN = ['train-carriage-container-red', 'train-carriage-container-blue', 'train-carriage-container-green', 'train-carriage-tank'] as const
const SPACE = ['barrel', 'barrels', 'machine_barrel', 'machine_generator', 'bones', 'rock_crystals', 'rock_crystalsLargeA', 'supports_low', 'pipe_straight'] as const

export interface ZoneKit {
  /** Pan de mur d'une arête (milieu cx, cz), décoré des deux côtés, 0,3 d'épais. */
  wall(cx: number, cz: number, alongX: boolean): THREE.Object3D
  /** Pilier à la jonction de murs (sommet vx, vz). */
  post(vx: number, vz: number): THREE.Object3D
  /** Dalle d'une tuile (quelques variantes). */
  floor(x: number, z: number, variant: number): THREE.Object3D
  /** Porte du sas : son encadrement, et le vantail qui s'ouvre (à part, il bouge). */
  gate(cx: number, cz: number, alongX: boolean): { frame: THREE.Object3D; door: THREE.Object3D }
  /** Conteneur de fret couché, 0,9 × 1,9 (le long de z), centré. */
  container(color: number): THREE.Object3D
  /** Pile encombrante d'une tuile (fûts, générateur), centrée. */
  crates(variant: number): THREE.Object3D
  /** Petit décor (non bloquant), centré au sol. */
  decor(kind: 'cables' | 'bones' | 'crystals' | 'barrel' | 'goo' | 'debris', variant: number): THREE.Object3D
}

const deg = (d: number) => d / 360
const set = (c: THREE.Color, h: number, s: number, l: number) => c.setHSL(deg(h), s, THREE.MathUtils.clamp(l, 0, 1), THREE.SRGBColorSpace)

/** Acier noirci, bandes d'ambre terni, sols bleu nuit : la baie n'a plus rien de neuf. */
function grim(hsl: { h: number; s: number; l: number }, c: THREE.Color) {
  const h = hsl.h * 360
  if (h >= 240 && h <= 320 && hsl.l > 0.45) set(c, 212, 0.07, 0.1 + (hsl.l - 0.45) * 0.55)
  else if (h >= 10 && h <= 50 && hsl.s > 0.5) set(c, 34, 0.55, hsl.l * 0.55)
  else if (h >= 200 && h <= 260 && hsl.s < 0.5) set(c, 215, 0.12, hsl.l * 0.62)
}

/** Conteneurs du Train Kit : leur couleur, passée à la rouille et à la crasse. */
function weathered(hsl: { h: number; s: number; l: number }, c: THREE.Color) {
  set(c, hsl.h * 360, hsl.s * 0.55, hsl.l * 0.62)
}

let loading: Promise<ZoneKit> | null = null

/** Charge le kit (une fois) : au premier départ en mission. */
export function loadZoneKit(): Promise<ZoneKit> {
  return (loading ??= build())
}

/**
 * Maillages d'un modèle, repeints. Les modèles texturés d'un même kit partagent leur atlas de
 * couleurs : un seul matériau repeint pour tous (`key`), donc une seule fusion, un seul appel de dessin.
 */
const painted = new Map<string, THREE.Material>()
function prepare(root: THREE.Object3D, paint: (hsl: { h: number; s: number; l: number }, c: THREE.Color) => void, key: string): THREE.Object3D {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const src = mesh.material as THREE.MeshLambertMaterial
    const id = src.map ? key : `${key}:${src.uuid}`
    let m = painted.get(id)
    if (!m) {
      const copy = src.clone()
      if (src.map) copy.map = recolored(src.map, key, paint)
      else if (src.color) {
        const hsl = { h: 0, s: 0, l: 0 }
        copy.color.getHSL(hsl, THREE.SRGBColorSpace)
        paint(hsl, copy.color)
      }
      painted.set(id, (m = copy))
    }
    mesh.material = m
  })
  return root
}

/** Centre un modèle sur l'origine, posé au sol, et l'amène à `size` (x, y, z ; null : proportionnel). */
function fit(o: THREE.Object3D, size: [number | null, number | null, number | null]): THREE.Group {
  o.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(o)
  const dim = box.getSize(new THREE.Vector3())
  const dims = [dim.x, dim.y, dim.z]
  const i = size.findIndex((v, n) => v !== null && dims[n] > 0)
  const k = i >= 0 ? size[i]! / dims[i] : 1
  const sx = size[0] !== null ? size[0] / dim.x : k, sy = size[1] !== null ? size[1] / dim.y : k, sz = size[2] !== null ? size[2] / dim.z : k
  const center = box.getCenter(new THREE.Vector3())
  o.position.set(-center.x, -box.min.y, -center.z)
  const g = new THREE.Group()
  g.add(o)
  g.scale.set(sx, sy, sz)
  return g
}

const cloneOf = (proto: THREE.Object3D) => proto.clone(true)

async function build(): Promise<ZoneKit> {
  const load = async (path: string) => (await rig(path)).root
  const [modular, train, space] = await Promise.all([
    Promise.all(MODULAR.map((m) => load(`zone/${m}.glb`))),
    Promise.all(TRAIN.map((m) => load(`train/${m}.glb`))),
    Promise.all(SPACE.map((m) => load(`space/${m}.glb`))),
  ])
  const mod = Object.fromEntries(MODULAR.map((m, i) => [m, prepare(modular[i], grim, 'zone-grim')])) as Record<(typeof MODULAR)[number], THREE.Object3D>
  const sp = Object.fromEntries(SPACE.map((m, i) => [m, space[i]])) as Record<(typeof SPACE)[number], THREE.Object3D>

  // Mur double : deux pans du kit dos à dos (chacun 0,15 d'épais), décorés vers chaque tuile.
  const Q = 0.25
  const wallProto = new THREE.Group()
  for (const side of [0, 1]) {
    const w = mod['template-wall'].clone(true)
    w.scale.setScalar(Q)
    w.rotation.y = side * Math.PI
    wallProto.add(w)
  }
  const postProto = mod['template-detail'].clone(true)
  postProto.scale.setScalar(Q * 0.9)
  const floors = (['template-floor', 'template-floor-detail', 'template-floor-detail-a'] as const).map((name) => {
    const f = mod[name].clone(true)
    f.scale.setScalar(Q)
    return f
  })
  const gateProto = mod.gate.clone(true)
  gateProto.scale.setScalar(Q)
  const doorSrc = mod['gate-door'].getObjectByName('door') ?? mod['gate-door']
  const doorProto = doorSrc.clone(true)
  doorProto.position.set(0, 0, 0)
  doorProto.scale.setScalar(Q)

  // Conteneurs : le chargement des wagons, sans le châssis ni les roues.
  const containers = train.slice(0, 3).map((root, i) => {
    const cargo = root.getObjectByName('cargo') ?? root
    cargo.removeFromParent()
    return fit(prepare(cargo, weathered, `container-${i}`), [0.9, 0.88, 1.9])
  })
  const tank = fit(prepare(train[3], weathered, 'tank'), [0.9, 0.9, 1.9])
  const crates = [
    fit(sp.machine_generator.clone(true), [0.84, null, null]),
    fit(sp.barrels.clone(true), [0.86, null, null]),
    fit(sp.machine_barrel.clone(true), [0.8, null, null]),
  ]
  const crystalPaint = (hsl: { h: number; s: number; l: number }, c: THREE.Color) => set(c, 140, 0.9, 0.3 + hsl.l * 0.35)
  const decor = {
    cables: fit(mod.cables.clone(true), [0.5, null, null]),
    bones: fit(sp.bones.clone(true), [0.42, null, null]),
    crystals: fit(prepare(sp.rock_crystals.clone(true), crystalPaint, 'crystals'), [0.4, null, null]),
    crystalsLarge: fit(prepare(sp.rock_crystalsLargeA.clone(true), crystalPaint, 'crystals-large'), [0.46, null, null]),
    barrel: fit(sp.barrel.clone(true), [0.2, null, null]),
    debris: fit(sp.supports_low.clone(true), [0.44, null, null]),
    pipe: fit(sp.pipe_straight.clone(true), [0.34, null, null]),
  }
  // Flaque caustique : un disque vert translucide, lumineux dans le noir.
  const gooMat = new THREE.MeshBasicMaterial({ color: '#39c46a', transparent: true, opacity: 0.55, depthWrite: false })
  const gooGeo = new THREE.CircleGeometry(0.2, 18)

  return {
    wall(cx, cz, alongX) {
      const w = cloneOf(wallProto)
      w.position.set(cx, 0, cz)
      if (!alongX) w.rotation.y = Math.PI / 2
      w.updateMatrixWorld(true)
      return w
    },
    post(vx, vz) {
      const p = cloneOf(postProto)
      p.position.set(vx, 0, vz)
      p.updateMatrixWorld(true)
      return p
    },
    floor(x, z, variant) {
      const f = cloneOf(floors[variant % 7 === 0 ? 1 : variant % 11 === 0 ? 2 : 0])
      f.position.set(x, 0.001, z)
      f.rotation.y = (variant % 4) * (Math.PI / 2)
      f.updateMatrixWorld(true)
      return f
    },
    gate(cx, cz, alongX) {
      const frame = cloneOf(gateProto)
      const door = cloneOf(doorProto)
      for (const o of [frame, door]) {
        o.position.set(cx, 0, cz)
        if (!alongX) o.rotation.y = Math.PI / 2
        o.updateMatrixWorld(true)
      }
      return { frame, door }
    },
    container(color) {
      return cloneOf(color === 3 ? tank : containers[color % 3])
    },
    crates(variant) {
      return cloneOf(crates[variant % crates.length])
    },
    decor(kind, variant) {
      if (kind === 'goo') {
        const g = new THREE.Group()
        const m = new THREE.Mesh(gooGeo, gooMat)
        m.rotation.x = -Math.PI / 2
        m.position.y = 0.004
        m.scale.set(1 + (variant % 3) * 0.3, 0.7 + (variant % 2) * 0.4, 1)
        g.add(m)
        return g
      }
      if (kind === 'crystals') return cloneOf(variant % 2 ? decor.crystalsLarge : decor.crystals)
      if (kind === 'debris') return cloneOf(variant % 2 ? decor.debris : decor.pipe)
      return cloneOf(decor[kind])
    },
  }
}
