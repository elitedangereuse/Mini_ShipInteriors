import * as THREE from 'three'
import { DIRS } from '../../shared/ship-map.js'
import type { DecorKind } from '../../shared/salvage.js'
import { rig } from '../assets'
import { drawnTexture, hazardTexture, rng } from '../furniture/kit'
import { recolored } from '../recolor'

/*
 * Modèles de la baie infestée (Kenney, CC0) : les murs, piliers, sols et portes du Modular Space
 * Kit, à l'échelle 1/4 (une pièce de 4 m y fait une tuile, ses murs 1,06 de haut et 0,3 d'épais
 * entre deux tuiles, comme ceux du vaisseau) ; les conteneurs des wagons du Train Kit, sans
 * leurs roues ; le décor du Space Kit (fûts, ossements, cristaux, générateurs). Le lilas et
 * l'orange du kit modulaire sont repeints en acier noirci et en ambre terni.
 *
 * Et, faits main : la passerelle du hall de fret (caillebotis sur poteaux, escaliers, garde-corps
 * ambrés), les bacs de culture de la serre, les excroissances du nid, le verre brisé, les papiers,
 * le terreau renversé et les flaques caustiques ; le sol des zones éclairées, qui prend la couleur
 * de ses projecteurs.
 */

const MODULAR = ['template-wall', 'template-detail', 'template-floor', 'template-floor-detail', 'template-floor-detail-a', 'gate', 'gate-door', 'cables'] as const
const TRAIN = ['train-carriage-container-red', 'train-carriage-container-blue', 'train-carriage-container-green', 'train-carriage-tank'] as const
const SPACE = ['barrel', 'barrels', 'machine_barrel', 'machine_generator', 'bones', 'rock_crystals', 'rock_crystalsLargeA', 'rock_crystalsLargeB', 'supports_low', 'pipe_straight'] as const

export interface ZoneKit {
  /** Pan de mur d'une arête (milieu cx, cz), décoré des deux côtés, 0,3 d'épais. */
  wall(cx: number, cz: number, alongX: boolean): THREE.Object3D
  /** Pilier à la jonction de murs (sommet vx, vz). */
  post(vx: number, vz: number): THREE.Object3D
  /** Dalle d'une tuile (quelques variantes) ; `glow` : sous les projecteurs d'une zone éclairée, de leur couleur. */
  floor(x: number, z: number, variant: number, glow?: string | null): THREE.Object3D
  /** Porte du sas : son encadrement, et le vantail qui s'ouvre (à part, il bouge). */
  gate(cx: number, cz: number, alongX: boolean): { frame: THREE.Object3D; door: THREE.Object3D }
  /** Conteneur de fret couché, 0,9 × 1,9 (le long de z), centré. */
  container(color: number): THREE.Object3D
  /** Pile encombrante d'une tuile (fûts, générateur), centrée. */
  crates(variant: number): THREE.Object3D
  /** Petit décor (non bloquant), centré au sol. */
  decor(kind: DecorKind, variant: number): THREE.Object3D
  /** Bac de culture de la serre (une tuile), centré : bas, on voit par-dessus. */
  planter(variant: number): THREE.Object3D
  /** Excroissance thargoïde (une tuile), centrée : une colonne de résine noire veinée de vert. */
  growth(variant: number): THREE.Object3D
  /** Dalle de caillebotis de la passerelle, à `height`, sur son poteau (tuile x, z). */
  deck(x: number, z: number, height: number): THREE.Object3D
  /** Escalier de la tuile x, z, qui monte de 0 à `height` vers la direction `up` (0 à 3). */
  stairs(x: number, z: number, up: number, height: number): THREE.Object3D
  /** Garde-corps de `a` à `b` (au sol de hauteur h en chaque bout) ; poteaux aux bouts demandés. */
  rail(a: { x: number; z: number; h: number }, b: { x: number; z: number; h: number }, posts: [boolean, boolean]): THREE.Object3D
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

/** Caillebotis de la passerelle : un acier sombre percé d'une grille, bordé de rivets. */
function gratingTexture(): THREE.CanvasTexture {
  const t = drawnTexture(128, 128, (g) => {
    g.fillStyle = '#4d545c'
    g.fillRect(0, 0, 128, 128)
    g.fillStyle = '#12161a'
    for (let y = 6; y < 128; y += 12) for (let x = 6; x < 128; x += 12) g.fillRect(x, y, 8, 8)
    g.strokeStyle = '#6b737c'
    g.lineWidth = 4
    g.strokeRect(2, 2, 124, 124)
    g.fillStyle = '#8a929b'
    for (const [x, y] of [[6, 6], [122, 6], [6, 122], [122, 122]]) g.fillRect(x - 2, y - 2, 4, 4)
  })
  t.magFilter = THREE.NearestFilter
  return t
}

/** Pavé de `a` à `b` (points du pont) : `w` de large, `h` d'épais, incliné s'ils ne sont pas à la même hauteur. */
function beam(a: THREE.Vector3, b: THREE.Vector3, w: number, h: number, material: THREE.Material): THREE.Mesh {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
  const flat = Math.hypot(dx, dz)
  const m = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(flat, dy), h, w), material)
  m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
  m.rotation.set(0, Math.atan2(-dz, dx), Math.atan2(dy, flat), 'YZX')
  return m
}

/** Contour irrégulier (flaque, terreau) : un cercle de rayon `r` qui ondule de `wobble`. */
function blob(r: number, wobble: number, random: () => number, seg = 14): THREE.ShapeGeometry {
  const shape = new THREE.Shape()
  const k = Array.from({ length: 4 }, () => random() * Math.PI * 2)
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2
    const rr = r * (1 + wobble * (Math.sin(a * 2 + k[0]) * 0.5 + Math.sin(a * 3 + k[1]) * 0.35 + Math.sin(a * 5 + k[2]) * 0.15))
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  const g = new THREE.ShapeGeometry(shape)
  g.rotateX(-Math.PI / 2)
  return g
}

/** Sol sous les projecteurs : la dalle repeinte, qui renvoie un peu de leur couleur. */
const litFloors = new Map<string, THREE.Material>()
function litFloor(src: THREE.Material, color: string): THREE.Material {
  const key = `${src.uuid}:${color}`
  let m = litFloors.get(key)
  if (!m) {
    const copy = (src as THREE.MeshLambertMaterial).clone()
    copy.emissive = new THREE.Color(color).multiplyScalar(0.42)
    copy.emissiveMap = copy.map
    copy.color.lerp(new THREE.Color('#ffffff'), 0.35)
    litFloors.set(key, (m = copy))
  }
  return m
}

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
  const growthCrystals = fit(prepare(sp.rock_crystalsLargeB.clone(true), crystalPaint, 'crystals-growth'), [0.5, null, null])
  const decor = {
    cables: fit(mod.cables.clone(true), [0.5, null, null]),
    bones: fit(sp.bones.clone(true), [0.42, null, null]),
    crystals: fit(prepare(sp.rock_crystals.clone(true), crystalPaint, 'crystals'), [0.4, null, null]),
    crystalsLarge: fit(prepare(sp.rock_crystalsLargeA.clone(true), crystalPaint, 'crystals-large'), [0.46, null, null]),
    barrel: fit(sp.barrel.clone(true), [0.2, null, null]),
    debris: fit(sp.supports_low.clone(true), [0.44, null, null]),
    pipe: fit(sp.pipe_straight.clone(true), [0.34, null, null]),
  }
  // Flaque caustique : une nappe verte translucide qui couvre sa tuile, lumineuse dans le noir.
  const gooMat = new THREE.MeshBasicMaterial({ color: '#2f9a55', transparent: true, opacity: 0.72, depthWrite: false })
  const gooCore = new THREE.MeshBasicMaterial({ color: '#5dff9a', transparent: true, opacity: 0.5, depthWrite: false })
  // Verre brisé : des éclats bleutés qui accrochent la lumière.
  const shardMat = new THREE.MeshLambertMaterial({ color: '#cfeeff', emissive: '#3a6a80', transparent: true, opacity: 0.8, side: THREE.DoubleSide })
  const shard = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0.05), new THREE.Vector2(0.03, -0.03), new THREE.Vector2(-0.025, -0.02)]))
  shard.rotateX(-Math.PI / 2)
  const frameMat = new THREE.MeshLambertMaterial({ color: '#23272c' })
  const paperMats = ['#e9e6dc', '#f2eed2', '#d9dde0'].map((color) => new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }))
  const paperGeo = new THREE.PlaneGeometry(0.11, 0.15).rotateX(-Math.PI / 2)
  const soilMat = new THREE.MeshLambertMaterial({ color: '#2e2016' })
  const leafMats = ['#3f8f3a', '#6b8a2a', '#7a5a2a'].map((color) => new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }))
  const leafGeo = new THREE.PlaneGeometry(0.05, 0.09).rotateX(-Math.PI / 2)
  // Passerelle : caillebotis, acier noirci, garde-corps ambré, nez de marche jaune.
  const grating = new THREE.MeshLambertMaterial({ map: gratingTexture() })
  const dark = new THREE.MeshLambertMaterial({ color: '#23282e' })
  const railMat = new THREE.MeshLambertMaterial({ color: '#b8791c' })
  const kickMat = new THREE.MeshLambertMaterial({ map: hazardTexture(256, 32, 12) })
  const nosing = new THREE.MeshLambertMaterial({ color: '#c9951e' })
  // Bacs de culture : métal, terreau, plantes (quelques-unes fanées), rampe violette.
  const troughMat = new THREE.MeshLambertMaterial({ color: '#2d3238' })
  const rimMat = new THREE.MeshLambertMaterial({ color: '#434a53' })
  const growLed = new THREE.MeshBasicMaterial({ color: '#e27bff' })
  const plantMats = ['#3f8f3a', '#5aa84a', '#2f6b33', '#4f9d5c', '#8a8a3a', '#6b4f2a'].map((color) => new THREE.MeshLambertMaterial({ color }))
  // Excroissances : résine noire, veines vertes.
  const resin = new THREE.MeshLambertMaterial({ color: '#0f1a15', emissive: '#06301a', emissiveIntensity: 0.6 })
  const vein = new THREE.MeshBasicMaterial({ color: '#39ff88' })

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
    floor(x, z, variant, glow) {
      const f = cloneOf(floors[variant % 7 === 0 ? 1 : variant % 11 === 0 ? 2 : 0])
      f.position.set(x, 0.001, z)
      f.rotation.y = (variant % 4) * (Math.PI / 2)
      if (glow) {
        f.traverse((o) => {
          const mesh = o as THREE.Mesh
          if (mesh.isMesh) mesh.material = litFloor(mesh.material as THREE.Material, glow)
        })
      }
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
      const random = rng(variant * 7919 + 17)
      if (kind === 'goo') {
        const g = new THREE.Group()
        const m = new THREE.Mesh(blob(0.36, 0.22, random), gooMat)
        m.position.y = 0.004
        const core = new THREE.Mesh(blob(0.16, 0.3, random), gooCore)
        core.position.set((random() - 0.5) * 0.2, 0.006, (random() - 0.5) * 0.2)
        g.add(m, core)
        return g
      }
      if (kind === 'glass') {
        const g = new THREE.Group()
        for (let i = 0; i < 14; i++) {
          const m = new THREE.Mesh(shard, shardMat)
          const r = Math.sqrt(random()) * 0.4, a = random() * Math.PI * 2
          m.position.set(Math.cos(a) * r, 0.004 + i * 0.0004, Math.sin(a) * r)
          m.rotation.y = random() * Math.PI * 2
          m.scale.setScalar(0.6 + random() * 1.4)
          g.add(m)
        }
        // Un morceau de cadre de hublot tordu.
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.025, 0.03), frameMat)
        bar.position.set((random() - 0.5) * 0.3, 0.013, (random() - 0.5) * 0.3)
        bar.rotation.set(0, random() * Math.PI, 0.12)
        g.add(bar)
        return g
      }
      if (kind === 'papers') {
        const g = new THREE.Group()
        const n = 3 + Math.floor(random() * 4)
        for (let i = 0; i < n; i++) {
          const m = new THREE.Mesh(paperGeo, paperMats[i % paperMats.length])
          m.position.set((random() - 0.5) * 0.3, 0.003 + i * 0.001, (random() - 0.5) * 0.3)
          m.rotation.y = random() * Math.PI * 2
          g.add(m)
        }
        return g
      }
      if (kind === 'soil') {
        const g = new THREE.Group()
        const m = new THREE.Mesh(blob(0.17, 0.3, random), soilMat)
        m.position.y = 0.004
        g.add(m)
        for (let i = 0; i < 4; i++) {
          const leaf = new THREE.Mesh(leafGeo, leafMats[i % leafMats.length])
          leaf.position.set((random() - 0.5) * 0.36, 0.007 + i * 0.001, (random() - 0.5) * 0.36)
          leaf.rotation.y = random() * Math.PI * 2
          g.add(leaf)
        }
        // Le pot renversé.
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.08, 10), troughMat)
        pot.rotation.z = Math.PI / 2
        pot.position.set(0.12, 0.04, -0.05)
        g.add(pot)
        return g
      }
      if (kind === 'crystals') return cloneOf(variant % 2 ? decor.crystalsLarge : decor.crystals)
      if (kind === 'debris') return cloneOf(variant % 2 ? decor.debris : decor.pipe)
      return cloneOf(decor[kind])
    },
    planter(variant) {
      const random = rng(variant * 104729 + 3)
      const g = new THREE.Group()
      const trough = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.26, 0.88), troughMat)
      trough.position.y = 0.13
      const rim = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.03, 0.92), rimMat)
      rim.position.y = 0.275
      const soil = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.02, 0.82), soilMat)
      soil.position.y = 0.28
      g.add(trough, rim, soil)
      for (const s of [-1, 1]) {
        const led = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.018, 0.018), growLed)
        led.position.set(0, 0.24, s * 0.452)
        g.add(led)
      }
      const n = 6 + Math.floor(random() * 4)
      for (let i = 0; i < n; i++) {
        const h = 0.14 + random() * 0.24
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.06 + random() * 0.05, h, 6), plantMats[Math.floor(random() * plantMats.length)])
        cone.position.set((random() - 0.5) * 0.66, 0.29 + h / 2, (random() - 0.5) * 0.66)
        cone.rotation.set((random() - 0.5) * 0.5, random() * Math.PI, (random() - 0.5) * 0.5)
        g.add(cone)
      }
      return g
    },
    growth(variant) {
      const random = rng(variant * 15485863 + 11)
      const g = new THREE.Group()
      const geo = new THREE.CylinderGeometry(0.1, 0.36, 1.3, 8, 6)
      const pos = geo.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i)
        const k = 1 + (Math.sin(y * 7 + variant) * 0.12 + (random() - 0.5) * 0.18)
        pos.setXYZ(i, pos.getX(i) * k + Math.sin(y * 3 + variant) * 0.05, y, pos.getZ(i) * k)
      }
      geo.computeVertexNormals()
      const column = new THREE.Mesh(geo, resin)
      column.position.y = 0.65
      column.rotation.y = random() * Math.PI
      g.add(column)
      // Veines lumineuses qui montent en spirale.
      for (let i = 0; i < 3; i++) {
        const a0 = random() * Math.PI * 2
        for (let k = 0; k < 5; k++) {
          const y0 = 0.1 + k * 0.22, r0 = 0.33 - k * 0.05
          const a = a0 + k * 0.5
          const p0 = new THREE.Vector3(Math.cos(a) * r0, y0, Math.sin(a) * r0)
          const p1 = new THREE.Vector3(Math.cos(a + 0.5) * (r0 - 0.05), y0 + 0.22, Math.sin(a + 0.5) * (r0 - 0.05))
          g.add(beam(p0, p1, 0.018, 0.018, vein))
        }
      }
      const crystals = cloneOf(growthCrystals)
      crystals.position.set((random() - 0.5) * 0.2, 0, (random() - 0.5) * 0.2)
      crystals.rotation.y = random() * Math.PI * 2
      g.add(crystals)
      return g
    },
    deck(x, z, height) {
      const g = new THREE.Group()
      const plate = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 1), grating)
      plate.position.set(x, height - 0.03, z)
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, height - 0.06, 0.1), dark)
      post.position.set(x, (height - 0.06) / 2, z)
      const beamX = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.05, 0.06), dark)
      beamX.position.set(x, height - 0.085, z)
      const beamZ = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.96), dark)
      beamZ.position.set(x, height - 0.085, z)
      g.add(plate, post, beamX, beamZ)
      g.updateMatrixWorld(true)
      return g
    },
    stairs(x, z, up, height) {
      // Construit vers +x, puis tourné vers `up`.
      const g = new THREE.Group()
      const steps = 5
      for (let k = 0; k < steps; k++) {
        const h = ((k + 1) * height) / steps
        const s = -0.5 + (k + 0.5) / steps
        const riser = new THREE.Mesh(new THREE.BoxGeometry(1 / steps, h - 0.02, 0.9), dark)
        riser.position.set(s, (h - 0.02) / 2, 0)
        const tread = new THREE.Mesh(new THREE.BoxGeometry(1 / steps, 0.02, 0.9), grating)
        tread.position.set(s, h - 0.01, 0)
        const nose = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.022, 0.9), nosing)
        nose.position.set(s - 0.5 / steps + 0.0125, h - 0.009, 0)
        g.add(riser, tread, nose)
      }
      for (const side of [-1, 1]) g.add(beam(new THREE.Vector3(-0.5, 0.03, side * 0.47), new THREE.Vector3(0.5, height + 0.01, side * 0.47), 0.05, 0.08, dark))
      g.position.set(x, 0, z)
      g.rotation.y = Math.atan2(-DIRS[up].dz, DIRS[up].dx)
      // Dans un groupe à l'origine : le pont place l'objet (cf. Deck.buildProps), pas ses pièces.
      const placed = new THREE.Group()
      placed.add(g)
      placed.updateMatrixWorld(true)
      return placed
    },
    rail(a, b, posts) {
      const g = new THREE.Group()
      const at = (p: { x: number; z: number; h: number }, y: number) => new THREE.Vector3(p.x, p.h + y, p.z)
      g.add(beam(at(a, 0.53), at(b, 0.53), 0.04, 0.035, railMat))
      g.add(beam(at(a, 0.29), at(b, 0.29), 0.025, 0.025, railMat))
      g.add(beam(at(a, 0.04), at(b, 0.04), 0.02, 0.07, kickMat))
      posts.forEach((on, i) => {
        if (!on) return
        const p = i ? b : a
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.56, 0.045), dark)
        post.position.set(p.x, p.h + 0.28, p.z)
        g.add(post)
      })
      g.updateMatrixWorld(true)
      return g
    },
  }
}
