import * as THREE from 'three'
import { OUTDOOR_PACK } from '../assets'
import { fabric, LEAVES } from './cozy'
import { barX, barZ, box, cylinder, glass, glow, lit, mesh, part, sphere, type Builder } from './kit'
import { kitModel, type KitLook } from './nature'

/*
 * L'extérieur des quartiers : de quoi faire un jardin sur sa parcelle. Les arbres, haies, clôtures,
 * rochers, bancs, réverbères, fontaines et décors de saison viennent de plusieurs kits de Kenney
 * (CC0), rangés dans un seul fichier (cf. scripts/import-kenney-outdoor.mjs) ; le reste est fait
 * main : massifs de fleurs, topiaires, arbustes en fleurs, saule, balançoire, pergola, puits…
 * Le gazon, lui, est un revêtement de sol (cf. cabin/finishes.ts).
 */

const C = {
  wood: '#9a6a45',
  woodDark: '#6b4630',
  woodLight: '#c49a6c',
  soil: '#4a3526',
  stone: '#9a9a92',
  stoneDark: '#77776f',
  pot: '#b8653f',
  white: '#f1efe8',
  iron: '#3a3e46',
  rope: '#c9b48a',
  water: '#7fd0ee',
}

// ---------------------------------------------------------------- les modèles des kits

const kit = (file: string, s = 1, x = 0, z = 0, turn = 0, y = 0, look?: KitLook) => kitModel(file, s, x, z, turn, y, { pack: OUTDOOR_PACK, ...look })

/** Un modèle : son fichier, son échelle, son orientation (radians). */
type Pick = [file: string, scale: number, turn?: number]

const pick = <T,>(table: Record<string, T>, label: string | undefined): T => table[label ?? ''] ?? Object.values(table)[0]

/** Volume d'un tronc : ce qui arrête le passage sous un arbre (sa couronne, on passe dessous). */
const trunk = (r: number) => new THREE.Box3(new THREE.Vector3(-r, 0, -r), new THREE.Vector3(r, 1.3, r))

/**
 * Meuble fait d'un seul modèle, choisi par `label` dans la table. `spin` : tourné au hasard (un
 * rocher, un arbre) ; `trunk` : rayon de ce qui arrête le passage.
 */
function single(table: Record<string, Pick>, o: { spin?: boolean; trunk?: number; look?: KitLook } = {}): Builder {
  return ({ label, random }) => {
    const [file, s, turn = 0] = pick(table, label)
    const solid = new THREE.Group().add(kit(file, s, 0, 0, o.spin ? random() * Math.PI * 2 : turn, 0, o.look))
    return o.trunk ? { solid, extent: trunk(o.trunk) } : { solid }
  }
}

const HALF = Math.PI / 2

// Arbres : une essence par meuble, `label` : la saison ou la forme.
const treeOak = single({ summer: ['tree_oak', 1.4], autumn: ['tree_oak_fall', 1.4] }, { spin: true, trunk: 0.16 })
const treeLinden = single({ summer: ['tree_default', 1.1], autumn: ['tree_default_fall', 1.1] }, { spin: true, trunk: 0.16 })
const treeMaple = single({ summer: ['tree_detailed', 1.35], autumn: ['tree_detailed_fall', 1.35] }, { spin: true, trunk: 0.16 })
const treeChestnut = single({ summer: ['tree_fat', 1.5], autumn: ['tree_fat_fall', 1.5] }, { spin: true, trunk: 0.18 })
const treeBirch = single({ summer: ['tree_thin', 1.2], autumn: ['tree_thin_fall', 1.2] }, { spin: true, trunk: 0.14 })
const treeFormal = single({ cone: ['tree_cone', 1.15], cube: ['tree_blocks', 1.35], plateau: ['tree_plateau', 1.35], column: ['tree_tall', 1.05], stem: ['tree_simple', 0.95] }, { trunk: 0.14 })
const treePine = single(
  { classic: ['tree_pineDefaultA', 1.15], tall: ['tree_pineTallA_detailed', 1.2], round: ['tree_pineRoundC', 1.3], small: ['tree_pineSmallA', 1.2], bushy: ['tree_pineGroundA', 1.3], snowy: ['holiday-tree-snow-a', 0.85] },
  { spin: true, trunk: 0.18 },
)
const treePalm = single({ tall: ['tree_palmTall', 1.4], fan: ['tree_palmDetailedTall', 1.4] }, { spin: true, trunk: 0.14 })
const treeCypress = single({ round: ['town-tree-high-round', 0.68], crooked: ['town-tree-high-crooked', 0.62], fir: ['town-tree', 0.7] }, { trunk: 0.14 })
const treeDecorated = single({ classic: ['holiday-tree-decorated', 0.75], snowy: ['holiday-tree-decorated-snow', 0.75] }, { trunk: 0.3 })

/**
 * Arbre fruitier : la boule du Platformer Kit. `label` : apple (pommier), cherry (cerisier en
 * fleurs : la version enneigée du kit, repeinte en rose), snowy (sous la neige).
 */
const treeOrchard: Builder = ({ label, random }) => {
  const g = new THREE.Group()
  const cherry = label === 'cherry'
  const tree = kit(label === 'snowy' || cherry ? 'toy-tree-snow' : 'toy-tree', 0.82, 0, 0, random() * 6)
  if (cherry) {
    // Les blancs de la neige deviennent les roses des fleurs, du plus clair au plus soutenu.
    tree.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const c = (m.material as THREE.MeshLambertMaterial).color.getHSL({ h: 0, s: 0, l: 0 })
      if (c.s < 0.25 && c.l > 0.45) m.material = lit(c.l > 0.85 ? '#ffd3e6' : c.l > 0.7 ? '#ffb3d1' : '#f58fb8')
    })
  }
  g.add(tree)
  if (label === 'apple' || !label) {
    for (let i = 0; i < 7; i++) {
      const a = random() * Math.PI * 2, y = 0.85 + random() * 0.5
      g.add(sphere(0.045, lit(i % 3 ? '#e0453a' : '#ffd23c'), Math.cos(a) * 0.36, y, Math.sin(a) * 0.36, 7))
    }
  }
  return { solid: g, extent: trunk(0.18) }
}

// Haies, clôtures, murets : un tronçon d'une tuile, `label` : sa forme.
const hedge = single({ straight: ['town-hedge-large', 1, HALF], corner: ['town-hedge-large-curved', 1], gate: ['town-hedge-large-gate', 1, HALF] })
const hedgeLow = single({ straight: ['town-hedge', 1, HALF], corner: ['town-hedge-curved', 1], gate: ['town-hedge-gate', 1, HALF], boxwood: ['toy-hedge', 1], angle: ['toy-hedge-corner', 1] })
const railFence = single({ rails: ['fence_simple', 1], planks: ['fence_planks', 1], gate: ['fence_gate', 1], corner: ['fence_corner', 1], rope: ['toy-fence-rope', 1.05] })
const ironFence = single({ plain: ['yard-iron-fence', 1], base: ['yard-iron-fence-border', 1], curve: ['yard-iron-fence-curve', 1.1], gate: ['yard-iron-fence-border-gate', 1] })
const stoneWall = single({ plain: ['yard-stone-wall', 1], column: ['yard-stone-wall-column', 1], curve: ['yard-stone-wall-curve', 1], brick: ['yard-brick-wall', 1] })

// Rochers, souches, bûches, pierres d'allée.
const gardenRock = single(
  { 'moss-a': ['rock_largeC', 0.9], 'moss-b': ['rock_largeE', 0.9], 'tall-a': ['rock_tallA', 0.9], 'tall-b': ['rock_tallD', 1.1], 'stone-a': ['stone_largeD', 0.8], 'stone-b': ['stone_tallB', 0.9], pebbles: ['toy-rocks', 1] },
  { spin: true },
)
const treeStump = single({ round: ['stump_roundDetailed', 1.5], old: ['stump_old', 1.5], tall: ['stump_oldTall', 1.3], big: ['yard-trunk', 1] }, { spin: true })
const logPile = single({ stack: ['log_stack', 1.2], large: ['log_stackLarge', 1.2], hollow: ['log_large', 0.9], single: ['log', 1.2] })
const pavingStones = single({ line: ['path_stone', 1], circle: ['path_stoneCircle', 1], scattered: ['toy-stones', 1.1] })
const boardwalk = single({ planks: ['path_wood', 1] })

// Mobilier de jardin, décors.
const parkBench = single({ wood: ['yard-bench', 1.25], slats: ['holiday-bench', 0.95] })
const campTent = single({ ridge: ['tent_detailedOpen', 1.5], small: ['tent_smallOpen', 1.5], canvas: ['camp-tent-canvas', 2] })
const gardenBridge = single({ wood: ['bridge_wood', 1], 'wood-round': ['bridge_woodRound', 1], stone: ['bridge_stone', 1], 'stone-round': ['bridge_stoneRound', 1] })
const gardenStatue = single({ column: ['statue_column', 1], ruin: ['statue_columnDamaged', 1], head: ['statue_head', 0.9], obelisk: ['statue_obelisk', 1.1], ring: ['statue_ring', 1], block: ['statue_block', 1], spire: ['yard-pillar-obelisk', 1] })
const gardenUrn = single({ round: ['yard-urn-round', 1.5], square: ['yard-urn-square', 1.5] })
const woodSign = single({ arrow: ['toy-sign', 1], plain: ['sign', 1.4], post: ['camp-signpost', 1.7] })
const hayBale = single({ plain: ['yard-hay-bale', 1.2], bundled: ['yard-hay-bale-bundled', 1.2] })
const marketStall = single({ red: ['town-stall-red', 1], green: ['town-stall-green', 1] })
const handCart = single({ flat: ['town-cart', 0.8], covered: ['town-cart-high', 0.8] })
const planterBox = single({ box: ['suburb-planter', 2.2] })
const meadowFlowers = single({ blue: ['toy-flowers', 1], red: ['toy-flowers-tall', 1.1] }, { spin: true })
const snowman = single({ plain: ['holiday-snowman', 0.7], hat: ['holiday-snowman-hat', 0.7] })
const sled = single({ sled: ['holiday-sled', 0.8] })
const snowPile = single({ pile: ['holiday-snow-pile', 0.9] }, { spin: true })
const reindeer = single({ reindeer: ['holiday-reindeer', 0.75] })
const giftBox = single({ cube: ['holiday-present-a-cube', 0.55], round: ['holiday-present-b-round', 0.55], long: ['holiday-present-a-rectangle', 0.55] })

// Lumières : les vitres des lanternes sont lumineuses.
const LAMP: KitLook = { lamp: true }
const streetLamp = single({ single: ['yard-lightpost-single', 1], double: ['yard-lightpost-double', 1], four: ['yard-lightpost-all', 1], town: ['town-lantern', 0.85], park: ['holiday-lantern', 0.75] }, { look: LAMP })
const gardenLantern = single({ glass: ['yard-lantern-glass', 1], candle: ['yard-lantern-candle', 1] }, { look: LAMP })
const pumpkin = single({ plain: ['yard-pumpkin', 1], carved: ['yard-pumpkin-carved', 1], tall: ['yard-pumpkin-tall', 1], 'tall-carved': ['yard-pumpkin-tall-carved', 1] }, { look: LAMP })

/** Champignons (sans collision). Sorte : `label` (red, tan, toy : ceux du Platformer Kit). */
const toadstools: Builder = ({ label, random }) => {
  const g = new THREE.Group()
  if (label === 'toy') return { solid: g.add(kit('toy-mushrooms', 1, 0, 0, random() * 6)) }
  const kind = label === 'tan' ? 'tan' : 'red'
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + random(), r = 0.1 + random() * 0.18
    g.add(kit(i % 2 ? `mushroom_${kind}Tall` : `mushroom_${kind}`, 0.9 + random() * 0.6, Math.cos(a) * r, Math.sin(a) * r, random() * 6))
  }
  return { solid: g }
}

/** Canoë tiré au sec, sa pagaie posée dedans. */
const canoe: Builder = () => {
  const g = new THREE.Group()
  g.add(kit('canoe', 1.25, 0, 0, HALF))
  const paddle = kit('canoe_paddle', 1.25, 0.1, 0.02, HALF + 0.12, 0.14)
  g.add(paddle)
  return { solid: g }
}

/** Carré de céréales (sans collision). Culture : `label` (wheat : blé, corn : maïs). */
const cerealPatch: Builder = ({ label, random }) => {
  const g = new THREE.Group()
  g.add(box(0.92, 0.03, 0.92, lit(C.soil), 0, 0.015, 0, 0.012))
  const corn = label === 'corn'
  const n = corn ? 3 : 4
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = -0.34 + (i * 0.68) / (n - 1) + (random() - 0.5) * 0.04, z = -0.34 + (j * 0.68) / (n - 1) + (random() - 0.5) * 0.04
    g.add(kit(corn ? 'crops_cornStageD' : 'crops_wheatStageB', corn ? 0.62 + random() * 0.14 : 0.5 + random() * 0.12, x, z, random() * 6, 0.025))
  }
  return { solid: g }
}

// ---------------------------------------------------------------- l'eau et le feu

/** Flammes d'un feu : des cônes lumineux qui dansent ; rend le groupe et son animation. */
function flames(y: number, spread: number, height: number, random: () => number) {
  const live = new THREE.Group()
  const cones = [0, 1, 2, 3, 4].map((i) => {
    const a = (i / 5) * Math.PI * 2, r = i ? spread : 0
    const h = height * (i ? 0.55 + random() * 0.3 : 1)
    const f = part(new THREE.ConeGeometry(i ? 0.05 : 0.07, h, 6), glow(i % 2 ? '#ffb347' : '#ff7a1c'), Math.cos(a) * r, y + h / 2, Math.sin(a) * r)
    live.add(f)
    return { f, h, phase: random() * 6 }
  })
  const core = part(new THREE.ConeGeometry(0.035, height * 0.5, 5), glow('#ffe9a8'), 0, y + height * 0.25, 0)
  live.add(core)
  return {
    live,
    update(t: number) {
      for (const { f, h, phase } of cones) {
        const k = 0.8 + 0.25 * Math.sin(t * 9 + phase) + 0.12 * Math.sin(t * 23 + phase * 2)
        f.scale.set(1, k, 1)
        f.position.y = y + (h * k) / 2
        f.rotation.z = Math.sin(t * 5 + phase) * 0.12
      }
      core.scale.y = 0.9 + 0.2 * Math.sin(t * 17)
    },
  }
}

/** Feu de camp : un cercle de pierres (ou de briques), des bûches en étoile, et le feu. Foyer : `label` (stones, bricks). */
const campfire: Builder = ({ label, random }) => {
  const g = new THREE.Group()
  g.add(kit(label === 'bricks' ? 'campfire_bricks' : 'campfire_stones', 1.15), kit('campfire_logs', 1.25, 0, 0, random() * 6, 0.02))
  g.add(cylinder(0.2, 0.22, 0.02, lit('#2a2420'), 0, 0.012, 0, 12))
  const fire = flames(0.07, 0.07, 0.36, random)
  return { solid: g, live: fire.live, update: fire.update }
}

/** Barbecue boule sur son trépied : la cuve, la grille, les braises. Couleur : `label` (#rrggbb). */
const barbecue: Builder = ({ label }) => {
  const g = new THREE.Group()
  const enamel = lit(label ?? '#b8322a'), steel = lit('#9aa3ad', 'metal'), dark = lit(C.iron, 'metal')
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5
    const leg = cylinder(0.014, 0.014, 0.56, steel, Math.cos(a) * 0.17, 0.27, Math.sin(a) * 0.17, 6)
    leg.rotation.set(Math.sin(a) * 0.22, 0, -Math.cos(a) * 0.22)
    g.add(leg)
  }
  g.add(mesh(new THREE.SphereGeometry(0.24, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), enamel, 0, 0.66, 0))
  g.add(cylinder(0.24, 0.24, 0.02, dark, 0, 0.66, 0, 16), cylinder(0.215, 0.215, 0.012, steel, 0, 0.675, 0, 16))
  for (let i = -3; i <= 3; i++) g.add(barZ(0.004, Math.sqrt(0.215 ** 2 - (i * 0.06) ** 2) * 2, dark, i * 0.06, 0.683, 0, 4))
  // Deux brochettes, et la tablette sur le côté.
  for (const [x, z] of [[-0.06, 0.03], [0.07, -0.05]] as const) {
    g.add(barX(0.004, 0.24, steel, x, 0.692, z, 4))
    for (let k = -1; k <= 1; k++) g.add(box(0.035, 0.03, 0.035, lit(k ? '#a8482f' : '#e8c24a'), x + k * 0.055, 0.7, z))
  }
  g.add(box(0.2, 0.014, 0.26, lit(C.woodLight, 'wood'), 0.33, 0.6, 0), box(0.014, 0.014, 0.2, steel, 0.24, 0.59, 0))
  const coals = part(new THREE.CircleGeometry(0.19, 14), glow('#ff6a2a'), 0, 0.668, 0)
  coals.rotation.x = -HALF
  return { solid: g, live: new THREE.Group().add(coals), update: (t) => coals.scale.setScalar(0.94 + 0.06 * Math.sin(t * 3)) }
}

/**
 * Fontaine : le bassin du Fantasy Town Kit, un jet au milieu et des gouttes qui retombent.
 * Bassin : `label` (round, square).
 */
const fountain: Builder = ({ label, random }) => {
  const g = new THREE.Group()
  const s = 0.72
  g.add(kit(label === 'square' ? 'town-fountain-square-detail' : 'town-fountain-round-detail', s))
  const live = new THREE.Group()
  const top = 0.48 * s
  const jet = part(new THREE.CylinderGeometry(0.018, 0.03, 0.34, 8), glass('#bfeeff', 0.6), 0, top + 0.17, 0)
  const crown = part(new THREE.SphereGeometry(0.06, 8, 6), glass('#dff6ff', 0.7), 0, top + 0.34, 0)
  live.add(jet, crown)
  const drops = Array.from({ length: 10 }, (_, i) => {
    const d = part(new THREE.SphereGeometry(0.022, 6, 4), glass('#dff6ff', 0.75))
    live.add(d)
    return { d, a: (i / 10) * Math.PI * 2 + random() * 0.4, phase: i / 10 + random() * 0.05 }
  })
  return {
    solid: g,
    live,
    update(t) {
      crown.scale.setScalar(0.9 + 0.15 * Math.sin(t * 7))
      for (const { d, a, phase } of drops) {
        // Une goutte : elle part du haut du jet, s'écarte et retombe dans la vasque, en boucle.
        const k = (t * 0.9 + phase) % 1
        const r = k * 0.3 * s * 1.6
        d.position.set(Math.cos(a) * r, top + 0.34 + 0.22 * k - 0.5 * k * k, Math.sin(a) * r)
      }
    },
  }
}

/** Bain d'oiseaux : une vasque de pierre sur son pied, de l'eau, et un moineau qui s'y penche. */
const birdBath: Builder = ({ random }) => {
  const g = new THREE.Group()
  const stone = lit(C.stone), dark = lit(C.stoneDark)
  g.add(cylinder(0.16, 0.19, 0.05, dark, 0, 0.025, 0, 12), cylinder(0.05, 0.08, 0.42, stone, 0, 0.26, 0, 10), cylinder(0.08, 0.05, 0.05, stone, 0, 0.49, 0, 10))
  g.add(cylinder(0.27, 0.12, 0.09, stone, 0, 0.555, 0, 16), cylinder(0.285, 0.27, 0.025, dark, 0, 0.607, 0, 16), cylinder(0.24, 0.24, 0.012, lit(C.water), 0, 0.605, 0, 16))
  const a = random() * Math.PI * 2
  const bird = new THREE.Group()
  bird.add(sphere(0.04, lit('#8a6a4a'), 0, 0.04, 0, 8), sphere(0.027, lit('#6b4a32'), 0, 0.075, 0.03, 8))
  const beak = mesh(new THREE.ConeGeometry(0.008, 0.025, 4), lit('#e8a23c'), 0, 0.073, 0.062)
  beak.rotation.x = HALF
  const tail = box(0.02, 0.008, 0.05, lit('#5a3d28'), 0, 0.05, -0.05)
  tail.rotation.x = -0.4
  bird.add(beak, tail)
  bird.position.set(Math.cos(a) * 0.26, 0.618, Math.sin(a) * 0.26)
  bird.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a))
  return { solid: g, live: new THREE.Group().add(bird), update: (t) => (bird.rotation.x = Math.max(0, Math.sin(t * 1.3 + a)) ** 6 * 0.7) }
}

/**
 * Puits : une margelle de pierre, deux montants, un toit de bardeaux, le treuil et son seau.
 */
const gardenWell: Builder = () => {
  const g = new THREE.Group()
  const stone = lit(C.stone), dark = lit(C.stoneDark), wood = lit(C.wood, 'wood'), roof = lit('#8a4a32')
  g.add(cylinder(0.4, 0.42, 0.42, stone, 0, 0.21, 0, 14), cylinder(0.43, 0.43, 0.05, dark, 0, 0.44, 0, 14), cylinder(0.32, 0.32, 0.012, lit('#1f3a48'), 0, 0.468, 0, 14))
  // Les pierres de la margelle : des joints sombres.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    g.add(box(0.012, 0.4, 0.012, dark, Math.cos(a) * 0.412, 0.21, Math.sin(a) * 0.412))
  }
  for (const y of [0.14, 0.28]) g.add(cylinder(0.416, 0.416, 0.012, dark, 0, y, 0, 14))
  for (const x of [-0.36, 0.36]) g.add(box(0.06, 0.95, 0.06, wood, x, 0.9, 0))
  g.add(barX(0.03, 0.78, lit(C.woodDark, 'wood'), 0, 1.06, 0, 8), barX(0.008, 0.16, lit(C.iron, 'metal'), 0.47, 1.06, 0, 4), box(0.012, 0.1, 0.012, lit(C.iron, 'metal'), 0.55, 1.01, 0))
  for (const s of [-1, 1]) {
    const pan = box(0.98, 0.03, 0.46, roof, 0, 1.5, s * 0.17)
    pan.rotation.x = s * 0.62
    g.add(pan)
  }
  g.add(box(1, 0.035, 0.05, lit('#6b3a28'), 0, 1.63, 0))
  for (const x of [-0.36, 0.36]) g.add(box(0.05, 0.05, 0.52, wood, x, 1.36, 0))
  g.add(cylinder(0.006, 0.006, 0.36, lit(C.rope), 0, 0.87, 0, 4), cylinder(0.075, 0.06, 0.12, lit(C.woodLight, 'wood'), 0, 0.64, 0, 10), cylinder(0.078, 0.078, 0.015, lit(C.iron, 'metal'), 0, 0.67, 0, 10))
  return { solid: g }
}

// ---------------------------------------------------------------- fleurs, arbustes, arbres faits main

const STEM = '#4f8a3e'

interface Bloom {
  /** Couleurs des fleurs, tirées au hasard. */
  colors: string[]
  /** Forme : cup (tulipe), disc (marguerite), spike (lavande), ball (rose, pompon). */
  head: 'cup' | 'disc' | 'spike' | 'ball'
  /** Hauteur des tiges, et nombre de fleurs. */
  height: number
  count: number
  heart?: string
}

const BLOOMS: Record<string, Bloom> = {
  tulips: { colors: ['#e0453a', '#ffd23c', '#ff8ac8', '#f08a2a'], head: 'cup', height: 0.24, count: 16 },
  daisies: { colors: ['#ffffff', '#fff4c8'], head: 'disc', height: 0.2, count: 18, heart: '#ffc93c' },
  lavender: { colors: ['#8a6fd8', '#a48ae8', '#7458c0'], head: 'spike', height: 0.26, count: 22 },
  roses: { colors: ['#d83a5a', '#ff7a9a', '#b8284a'], head: 'ball', height: 0.24, count: 14 },
  poppies: { colors: ['#e8382a', '#ff5a3a'], head: 'disc', height: 0.26, count: 14, heart: '#2a2420' },
  cornflowers: { colors: ['#4a7ae8', '#6f9aff', '#3a5ac8'], head: 'ball', height: 0.24, count: 16 },
  marigolds: { colors: ['#ff9a1c', '#ffc23c', '#f07a1a'], head: 'ball', height: 0.16, count: 18 },
}

/** Une fleur sur sa tige, en (x, z), à partir de la hauteur y. */
function flower(g: THREE.Group, b: Bloom, x: number, y: number, z: number, random: () => number) {
  const h = b.height * (0.75 + random() * 0.4)
  const color = lit(b.colors[Math.floor(random() * b.colors.length)])
  g.add(cylinder(0.009, 0.011, h, lit(STEM), x, y + h / 2, z, 4))
  const top = y + h
  if (b.head === 'cup') g.add(cylinder(0.046, 0.024, 0.08, color, x, top + 0.03, z, 6))
  else if (b.head === 'disc') {
    const disc = cylinder(0.06, 0.06, 0.014, color, x, top, z, 8)
    disc.rotation.set((random() - 0.5) * 0.7, 0, (random() - 0.5) * 0.7)
    g.add(disc, sphere(0.022, lit(b.heart ?? '#ffc93c'), x, top + 0.01, z, 5))
  } else if (b.head === 'spike') g.add(mesh(new THREE.ConeGeometry(0.028, 0.14, 5), color, x, top + 0.04, z))
  else g.add(sphere(0.046, color, x, top + 0.015, z, 6))
  if (random() < 0.6) {
    const leaf = mesh(new THREE.ConeGeometry(0.014, h * 0.6, 3), lit(LEAVES[Math.floor(random() * 4)]), x + (random() - 0.5) * 0.03, y + h * 0.3, z + (random() - 0.5) * 0.03)
    leaf.rotation.z = (random() - 0.5) * 0.6
    g.add(leaf)
  }
}

/**
 * Massif de fleurs (une tuile, sans collision) : de la terre bordée de galets, plantée serré.
 * Fleurs : `label` (tulips, daisies, lavender, roses, poppies, cornflowers, marigolds).
 */
const flowerBed: Builder = ({ label, random }) => {
  const g = new THREE.Group()
  const b = pick(BLOOMS, label)
  g.add(box(0.9, 0.05, 0.9, lit(C.soil), 0, 0.025, 0, 0.02))
  for (let i = 0; i < 16; i++) {
    const k = i / 16, side = Math.floor(k * 4), u = (k * 4 - side - 0.5) * 0.86
    const [x, z] = side === 0 ? [u, -0.45] : side === 1 ? [0.45, u] : side === 2 ? [-u, 0.45] : [-0.45, -u]
    const pebble = sphere(0.045 + random() * 0.015, lit(i % 2 ? C.stone : '#b8b6ac'), x, 0.03, z, 6)
    pebble.scale.y = 0.6
    g.add(pebble)
  }
  // Un tapis de feuilles, puis les fleurs.
  for (let i = 0; i < 12; i++) g.add(foliage(0.1 + random() * 0.04, LEAVES[i % 4], (random() - 0.5) * 0.66, 0.07, (random() - 0.5) * 0.66, 0.45, 0))
  for (let i = 0; i < b.count; i++) flower(g, b, (random() - 0.5) * 0.72, 0.06, (random() - 0.5) * 0.72, random)
  return { solid: g }
}

/** Boule de feuillage facettée. */
function foliage(r: number, color: string, x: number, y: number, z: number, squash = 1, detail = 1) {
  const m = mesh(new THREE.IcosahedronGeometry(r, detail), lit(color), x, y, z)
  m.scale.y = squash
  return m
}

/**
 * Topiaire : un buis taillé dans un pot de terre cuite. Taille : `label` (ball : boule sur tige,
 * cone, spiral : en spirale, tiers : trois boules, cube).
 */
const topiary: Builder = ({ label }) => {
  const g = new THREE.Group()
  const green = LEAVES[1], light = LEAVES[3]
  g.add(cylinder(0.2, 0.15, 0.24, lit(C.pot), 0, 0.12, 0, 14), cylinder(0.215, 0.2, 0.04, lit('#a0552f'), 0, 0.25, 0, 14), cylinder(0.18, 0.18, 0.012, lit(C.soil), 0, 0.262, 0, 14))
  const stem = (h: number) => g.add(cylinder(0.022, 0.03, h, lit('#6b4a32'), 0, 0.26 + h / 2, 0, 6))
  if (label === 'cone') {
    stem(0.12)
    g.add(mesh(new THREE.ConeGeometry(0.24, 0.85, 10), lit(green), 0, 0.78, 0))
  } else if (label === 'spiral') {
    stem(0.95)
    for (let i = 0; i < 9; i++) {
      const k = i / 8, a = k * Math.PI * 3.2, r = 0.2 * (1 - k * 0.72)
      g.add(foliage(r, i % 2 ? green : light, Math.cos(a) * r * 0.55, 0.42 + k * 0.8, Math.sin(a) * r * 0.55, 0.62))
    }
  } else if (label === 'tiers') {
    stem(0.95)
    for (const [y, r] of [[0.52, 0.22], [0.86, 0.17], [1.13, 0.12]] as const) g.add(foliage(r, green, 0, y, 0, 0.9))
  } else if (label === 'cube') {
    stem(0.3)
    g.add(box(0.44, 0.44, 0.44, lit(green), 0, 0.74, 0, 0.04))
  } else {
    stem(0.5)
    g.add(foliage(0.28, green, 0, 0.92, 0))
  }
  return { solid: g }
}

/** Arbuste en fleurs : un hortensia rond, couvert de pompons. Couleur des fleurs : `label` (#rrggbb). */
const floweringShrub: Builder = ({ label, random }) => {
  const g = new THREE.Group()
  const bloom = new THREE.Color(label ?? '#ff8ac8')
  const lumps: [number, number, number, number][] = [[0, 0.24, 0, 0.3], [0.2, 0.2, 0.08, 0.22], [-0.18, 0.2, -0.1, 0.23], [0.02, 0.2, -0.2, 0.2], [-0.05, 0.2, 0.2, 0.21]]
  lumps.forEach(([x, y, z, r], i) => g.add(foliage(r, LEAVES[i % 4], x, y, z, 0.85)))
  for (let i = 0; i < 22; i++) {
    const [cx, cy, cz, r] = lumps[i % lumps.length]
    const a = random() * Math.PI * 2, up = 0.2 + random() * 1.1
    const c = bloom.clone().offsetHSL(0, 0, (random() - 0.5) * 0.14)
    g.add(sphere(0.05 + random() * 0.02, lit(`#${c.getHexString()}`), cx + Math.cos(a) * Math.cos(up) * r * 0.95, cy + Math.sin(up) * r * 0.82, cz + Math.sin(a) * Math.cos(up) * r * 0.95, 6))
  }
  return { solid: g }
}

/** Saule pleureur : un tronc penché, une couronne, et de longues branches qui retombent jusqu'au sol. */
const treeWillow: Builder = ({ random }) => {
  const g = new THREE.Group()
  const bark = lit('#6b5a42')
  const bole = cylinder(0.07, 0.13, 0.95, bark, 0.03, 0.47, 0, 8)
  bole.rotation.z = -0.07
  g.add(bole)
  for (const [a, tilt] of [[0.4, 0.7], [2.5, 0.6], [4.4, 0.75]] as const) {
    const branch = cylinder(0.03, 0.055, 0.5, bark, Math.cos(a) * 0.16, 1.08, Math.sin(a) * 0.16, 6)
    branch.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt)
    g.add(branch)
  }
  const greens = ['#8ab85a', '#7aa84e', '#9cc86a', '#6f9a48']
  g.add(foliage(0.5, greens[1], 0, 1.42, 0, 0.55), foliage(0.36, greens[0], 0.05, 1.6, 0.03, 0.6))
  // Les rameaux : des rubans fins, en couronne, plus longs sur le pourtour.
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + random() * 0.2, r = 0.3 + random() * 0.38
    const len = 0.55 + (r - 0.3) * 1.6 + random() * 0.25
    const top = 1.5 - (r - 0.3) * 0.35
    const strand = box(0.045, len, 0.02, lit(greens[i % 4]), Math.cos(a) * r, top - len / 2, Math.sin(a) * r)
    strand.rotation.y = -a
    g.add(strand)
  }
  return { solid: g, extent: trunk(0.18) }
}

// ---------------------------------------------------------------- mobilier de jardin fait main

/**
 * Balançoire : un portique de bois en A, deux cordes et une planche qui se balance doucement.
 * On s'y assoit (cf. seats.ts) : l'assise est au repos à 0,3 du sol.
 */
const gardenSwing: Builder = ({ random }) => {
  const g = new THREE.Group()
  const wood = lit(C.wood, 'wood'), dark = lit(C.woodDark, 'wood')
  const H = 1.5, W = 0.62
  for (const x of [-W, W]) {
    for (const s of [-1, 1]) {
      const leg = box(0.06, H + 0.08, 0.06, wood, x, H / 2, s * 0.26)
      leg.rotation.x = -s * 0.34
      g.add(leg)
    }
    g.add(box(0.045, 0.045, 0.5, dark, x, 0.5, 0))
  }
  g.add(barX(0.04, W * 2 + 0.2, dark, 0, H, 0, 8))
  const seat = new THREE.Group()
  seat.position.y = H
  for (const x of [-0.2, 0.2]) seat.add(part(new THREE.CylinderGeometry(0.008, 0.008, H - 0.3, 4), lit(C.rope), x, -(H - 0.3) / 2, 0))
  seat.add(part(new THREE.BoxGeometry(0.5, 0.035, 0.2), lit(C.woodLight, 'wood'), 0, -(H - 0.3), 0))
  const phase = random() * 6
  return { solid: g, live: new THREE.Group().add(seat), update: (t) => (seat.rotation.x = Math.sin(t * 1.6 + phase) * 0.09), extent: new THREE.Box3(new THREE.Vector3(-W - 0.05, 0, -0.5), new THREE.Vector3(W + 0.05, H + 0.05, 0.5)) }
}

/** Table ronde de jardin sous son parasol. Toile : `label` (tissus des quartiers, cf. FABRIC). */
const parasolTable: Builder = ({ label }) => {
  const g = new THREE.Group()
  const white = lit(C.white), cloth = fabric(label, 'terracotta')
  g.add(cylinder(0.2, 0.24, 0.03, white, 0, 0.015, 0, 16), cylinder(0.025, 0.025, 0.4, white, 0, 0.22, 0, 8), cylinder(0.46, 0.46, 0.03, white, 0, 0.42, 0, 20))
  g.add(cylinder(0.014, 0.014, 1.2, lit('#c9c4b8', 'metal'), 0, 1.03, 0, 6))
  const canopy = mesh(new THREE.ConeGeometry(0.85, 0.3, 8), cloth, 0, 1.56, 0)
  g.add(canopy, sphere(0.025, white, 0, 1.73, 0, 6))
  // Les baleines, et le volant blanc au bord de la toile.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    const flap = box(0.62, 0.07, 0.012, white, Math.cos(a) * 0.785, 1.39, Math.sin(a) * 0.785)
    flap.rotation.y = -a + HALF
    g.add(flap)
  }
  return { solid: g }
}

/**
 * Transat : deux cadres de bois en chevalet, une toile tendue de l'un à l'autre, le dossier côté
 * -z. Toile : `label` (tissus des quartiers).
 */
const deckChair: Builder = ({ label }) => {
  const g = new THREE.Group()
  const wood = lit(C.woodLight, 'wood'), cloth = fabric(label, 'mustard')
  // Une barre du point (y0, z0) au point (y1, z1), de chaque côté.
  const rail = (y0: number, z0: number, y1: number, z1: number) => {
    for (const x of [-0.25, 0.25]) {
      const r = box(0.035, 0.035, Math.hypot(y1 - y0, z1 - z0), wood, x, (y0 + y1) / 2, (z0 + z1) / 2)
      r.rotation.x = -Math.atan2(y1 - y0, z1 - z0)
      g.add(r)
    }
  }
  rail(0.02, 0.5, 0.78, -0.42) // du sol, devant, au haut du dossier
  rail(0.02, -0.42, 0.34, 0.42) // du sol, derrière, au bord de l'assise
  for (const [y, z] of [[0.78, -0.42], [0.34, 0.42], [0.02, 0.5], [0.02, -0.42]] as const) g.add(barX(0.016, 0.54, wood, 0, y, z, 6))
  const sling = (y0: number, z0: number, y1: number, z1: number) => {
    const c = box(0.44, 0.012, Math.hypot(y1 - y0, z1 - z0), cloth, 0, (y0 + y1) / 2, (z0 + z1) / 2)
    c.rotation.x = -Math.atan2(y1 - y0, z1 - z0)
    g.add(c)
  }
  sling(0.76, -0.41, 0.22, 0.02)
  sling(0.22, 0.02, 0.33, 0.41)
  return { solid: g }
}

/** Hamac tendu entre deux poteaux, le long de z (la tête côté -z). Toile : `label` (tissus des quartiers). */
const hammock: Builder = ({ label }) => {
  const g = new THREE.Group()
  const wood = lit(C.wood, 'wood'), cloth = fabric(label, 'teal')
  const L = 0.95
  for (const s of [-1, 1]) {
    const post = box(0.07, 1.0, 0.07, wood, 0, 0.48, s * (L + 0.05))
    post.rotation.x = s * 0.16
    g.add(post, box(0.5, 0.05, 0.07, wood, 0, 0.025, s * (L - 0.04)))
  }
  // La toile : des lés qui suivent la courbe, plus creux au milieu.
  const N = 12
  for (let i = 0; i < N; i++) {
    const k0 = i / N, k1 = (i + 1) / N
    const z0 = (k0 - 0.5) * 2 * (L - 0.22), z1 = (k1 - 0.5) * 2 * (L - 0.22)
    const sag = (k: number) => 0.3 + 0.42 * (2 * k - 1) ** 2
    const y0 = sag(k0), y1 = sag(k1)
    const strip = box(0.52 * (0.55 + 0.45 * Math.sin(Math.PI * (k0 + k1) / 2)), 0.014, Math.hypot(z1 - z0, y1 - y0) + 0.004, cloth, 0, (y0 + y1) / 2, (z0 + z1) / 2)
    strip.rotation.x = -Math.atan2(y1 - y0, z1 - z0)
    g.add(strip)
  }
  for (const s of [-1, 1]) {
    const rope = cylinder(0.008, 0.008, 0.3, lit(C.rope), 0, 0.8, s * (L - 0.09), 4)
    rope.rotation.x = s * 1.0
    g.add(rope)
  }
  return { solid: g }
}

/** Nappe de pique-nique à carreaux (à plat, on marche dessus), un panier dans un coin. Couleur : `label` (#rrggbb). */
const picnicBlanket: Builder = ({ label }) => {
  const g = new THREE.Group()
  const color = lit(label ?? '#d9453a'), white = lit('#f6f1e6')
  g.add(box(1.2, 0.012, 0.9, white, 0, 0.006, 0))
  for (let i = 0; i < 8; i++) for (let j = 0; j < 6; j++) if ((i + j) % 2 === 0) g.add(box(0.15, 0.004, 0.15, color, -0.525 + i * 0.15, 0.014, -0.375 + j * 0.15))
  // Le panier d'osier, sa anse, une miche et deux pommes.
  const wicker = lit('#b88a4a')
  g.add(box(0.26, 0.12, 0.18, wicker, 0.38, 0.075, -0.26, 0.02), box(0.28, 0.02, 0.2, lit('#a07a3e'), 0.38, 0.14, -0.26, 0.008))
  const handle = mesh(new THREE.TorusGeometry(0.1, 0.01, 5, 10, Math.PI), wicker, 0.38, 0.14, -0.26)
  g.add(handle, sphere(0.035, lit('#e0453a'), 0.16, 0.045, -0.3, 7), sphere(0.035, lit('#b6d84a'), 0.2, 0.045, -0.22, 7))
  const loaf = sphere(0.06, lit('#c8904a'), -0.3, 0.04, 0.2, 8)
  loaf.scale.set(1.5, 0.6, 0.9)
  g.add(loaf, cylinder(0.07, 0.07, 0.008, white, -0.05, 0.02, 0.24, 12), cylinder(0.07, 0.07, 0.008, white, 0.14, 0.02, 0.1, 12))
  return { solid: g }
}

const CLIMBERS: Record<string, { leaf: string[]; bloom: string[] }> = {
  wisteria: { leaf: ['#5aa35a', '#86c46a'], bloom: ['#a48ae8', '#c2a8ff', '#8a6fd8'] },
  roses: { leaf: ['#3c7a44', '#4f9a4a'], bloom: ['#ff7a9a', '#ffc2e0', '#d83a5a'] },
  vine: { leaf: ['#4f9a4a', '#86c46a'], bloom: ['#5a3a8a', '#7a4aa8'] },
}

/**
 * Pergola : quatre poteaux, des chevrons, et une plante grimpante dont les grappes pendent. On
 * passe dessous (posée sans collision). Plante : `label` (wisteria : glycine, roses, vine : vigne).
 */
const pergola: Builder = ({ label, random }) => {
  const g = new THREE.Group()
  const wood = lit(C.woodLight, 'wood'), dark = lit(C.wood, 'wood')
  const c = pick(CLIMBERS, label)
  const W = 0.9, D = 0.9, H = 1.42
  for (const x of [-W, W]) for (const z of [-D, D]) g.add(box(0.08, H, 0.08, wood, x, H / 2, z), box(0.13, 0.05, 0.13, dark, x, 0.025, z))
  for (const z of [-D, D]) g.add(box(W * 2 + 0.4, 0.07, 0.06, dark, 0, H + 0.035, z))
  for (let i = 0; i < 7; i++) g.add(box(0.045, 0.06, D * 2 + 0.36, wood, -W + (i * W * 2) / 6, H + 0.1, 0))
  // La plante : elle grimpe aux poteaux, court sur les chevrons, et ses grappes pendent.
  for (const x of [-W, W]) for (const z of [-D, D]) for (let k = 0; k < 6; k++) {
    g.add(foliage(0.07 + random() * 0.03, c.leaf[k % 2], x + (random() - 0.5) * 0.08, 0.2 + k * 0.22, z + (random() - 0.5) * 0.08, 0.7, 0))
  }
  for (let i = 0; i < 34; i++) {
    const x = (random() - 0.5) * (W * 2 + 0.2), z = (random() - 0.5) * (D * 2 + 0.2)
    g.add(foliage(0.1 + random() * 0.06, c.leaf[i % 2], x, H + 0.14 + random() * 0.05, z, 0.5, 0))
    if (i % 2) continue
    const drop = 0.12 + random() * 0.2
    const bunch = mesh(new THREE.ConeGeometry(0.045, drop, 5), lit(c.bloom[Math.floor(random() * c.bloom.length)]), x, H - drop / 2 + 0.06, z)
    bunch.rotation.x = Math.PI
    g.add(bunch)
  }
  return { solid: g }
}

/** Nichoir sur son piquet : une maisonnette à toit pentu, son trou d'envol et son perchoir. Couleur : `label` (#rrggbb). */
const birdHouse: Builder = ({ label }) => {
  const g = new THREE.Group()
  const paint = lit(label ?? '#d9453a'), wood = lit(C.wood, 'wood')
  g.add(box(0.05, 1.0, 0.05, wood, 0, 0.5, 0), box(0.24, 0.02, 0.2, wood, 0, 1.0, 0), box(0.2, 0.2, 0.17, paint, 0, 1.11, 0))
  for (const s of [-1, 1]) {
    const pan = box(0.18, 0.02, 0.23, lit('#6b4630', 'wood'), s * 0.06, 1.26, 0)
    pan.rotation.z = -s * 0.75
    g.add(pan)
  }
  const gable = mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.17, 3), paint, 0, 1.245, 0)
  gable.rotation.set(HALF, 0, 0)
  gable.scale.set(1, 1, 0.62)
  const hole = cylinder(0.032, 0.032, 0.012, lit('#1c1612'), 0, 1.13, 0.086, 10)
  hole.rotation.x = HALF
  g.add(gable, hole, barZ(0.008, 0.08, wood, 0, 1.06, 0.11, 5))
  return { solid: g }
}

export const OUTDOOR = {
  'tree-oak': treeOak,
  'tree-linden': treeLinden,
  'tree-maple': treeMaple,
  'tree-chestnut': treeChestnut,
  'tree-birch': treeBirch,
  'tree-formal': treeFormal,
  'tree-pine': treePine,
  'tree-palm': treePalm,
  'tree-cypress': treeCypress,
  'tree-orchard': treeOrchard,
  'tree-willow': treeWillow,
  'tree-decorated': treeDecorated,
  hedge,
  'hedge-low': hedgeLow,
  topiary,
  'flowering-shrub': floweringShrub,
  'flower-bed': flowerBed,
  'meadow-flowers': meadowFlowers,
  'planter-box': planterBox,
  toadstools,
  'cereal-patch': cerealPatch,
  'garden-rock': gardenRock,
  'tree-stump': treeStump,
  'log-pile': logPile,
  'paving-stones': pavingStones,
  boardwalk,
  'rail-fence': railFence,
  'iron-fence': ironFence,
  'stone-wall': stoneWall,
  'park-bench': parkBench,
  'garden-swing': gardenSwing,
  'parasol-table': parasolTable,
  'deck-chair': deckChair,
  hammock,
  'picnic-blanket': picnicBlanket,
  pergola,
  fountain,
  'bird-bath': birdBath,
  'bird-house': birdHouse,
  'garden-well': gardenWell,
  'garden-statue': gardenStatue,
  'garden-urn': gardenUrn,
  'garden-bridge': gardenBridge,
  'street-lamp': streetLamp,
  'garden-lantern': gardenLantern,
  campfire,
  barbecue,
  'camp-tent': campTent,
  canoe,
  'wood-sign': woodSign,
  'hay-bale': hayBale,
  pumpkin,
  'market-stall': marketStall,
  'hand-cart': handCart,
  snowman,
  sled,
  'snow-pile': snowPile,
  reindeer,
  'gift-box': giftBox,
} satisfies Record<string, Builder>
