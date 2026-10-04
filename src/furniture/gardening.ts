import * as THREE from 'three'
import { LEAVES } from './cozy'
import { barX, box, cylinder, lit, mesh, sphere, type Builder } from './kit'

/*
 * Le jardinage dans les quartiers : la tuile de terre cultivable, le cabanon du jardinier, et le
 * mobilier de jardin (brouette, épouvantail, nain, clôture, ruche). Ce qui pousse sur une tuile
 * (la terre préparée, les plants, les mauvaises herbes) est dessiné à part, selon l'état du jardin
 * (cf. src/gardening/view.ts), avec les pièces exportées plus bas.
 */

const C = {
  wood: '#9a6a45',
  woodDark: '#6b4630',
  woodLight: '#c49a6c',
  soil: '#5a4330',
  tilled: '#3f2d20',
  wet: '#2a1d15',
  steel: '#9aa3ad',
  straw: '#e8c872',
  roof: '#4f6a52',
}

/** Côté d'une tuile de terre, et hauteur de sa terre. */
export const SOIL_SIZE = 0.96
export const SOIL_TOP = 0.05

/**
 * Tuile de terre cultivable, à plat (on marche dessus) : un cadre de planches et de la terre
 * tassée. Préparée, semée, arrosée : cf. src/gardening/view.ts.
 */
const soilTile: Builder = () => {
  const g = new THREE.Group()
  const s = SOIL_SIZE, plank = lit(C.wood)
  for (const z of [-1, 1]) g.add(box(s, SOIL_TOP + 0.012, 0.045, plank, 0, (SOIL_TOP + 0.012) / 2, (z * (s - 0.045)) / 2))
  for (const x of [-1, 1]) g.add(box(0.045, SOIL_TOP + 0.012, s - 0.09, plank, (x * (s - 0.045)) / 2, (SOIL_TOP + 0.012) / 2, 0))
  g.add(box(s - 0.09, SOIL_TOP, s - 0.09, lit(C.soil), 0, SOIL_TOP / 2, 0))
  return { solid: g }
}

/**
 * Cabanon de jardinage : une cabane de planches à toit en pente, la porte face à +z, une bêche et
 * un râteau contre le mur, des pots sur le rebord de la fenêtre. Capucine ne vend rien à qui n'en
 * a pas. Taille : 1,3 × 1.
 */
const gardenShed: Builder = () => {
  const g = new THREE.Group()
  const w = 1.3, d = 1, h = 1.05
  const plank = lit(C.wood), dark = lit(C.woodDark), light = lit(C.woodLight)
  g.add(box(w, h, d, plank, 0, h / 2, 0))
  // Les joints des planches, sur les quatre faces.
  for (let i = 1; i < 7; i++) {
    const x = -w / 2 + (i * w) / 7
    for (const z of [-1, 1]) g.add(box(0.012, h, 0.012, dark, x, h / 2, (z * d) / 2))
  }
  for (let i = 1; i < 5; i++) for (const x of [-1, 1]) g.add(box(0.012, h, 0.012, dark, (x * w) / 2, h / 2, -d / 2 + (i * d) / 5))
  for (const x of [-1, 1]) for (const z of [-1, 1]) g.add(box(0.06, h + 0.02, 0.06, dark, (x * w) / 2, h / 2, (z * d) / 2))
  // Le toit : deux pans, le faîte le long de x, et les pignons qui montent dessous.
  const rise = 0.34, half = d / 2 + 0.12, slope = Math.hypot(half, rise)
  for (const s of [-1, 1]) {
    const pan = box(w + 0.2, 0.05, slope, lit(C.roof), 0, h + rise / 2, (s * half) / 2)
    pan.rotation.x = s * Math.atan2(rise, half)
    g.add(pan)
  }
  g.add(box(w + 0.22, 0.05, 0.07, lit('#3c5140'), 0, h + rise + 0.01, 0))
  for (const x of [-1, 1]) for (let i = 0; i < 4; i++) {
    const span = d * (1 - (i + 0.5) / 4)
    g.add(box(0.03, rise / 4, span, plank, (x * (w - 0.03)) / 2, h + (i + 0.5) * (rise / 4), 0))
  }
  // La porte, sa poignée, et la fenêtre à côté.
  g.add(box(0.44, 0.82, 0.03, light, -0.26, 0.41, d / 2 + 0.01), box(0.48, 0.03, 0.04, dark, -0.26, 0.835, d / 2 + 0.012))
  for (const y of [0.2, 0.62]) g.add(box(0.44, 0.03, 0.012, dark, -0.26, y, d / 2 + 0.028))
  g.add(sphere(0.022, lit('#d9a441'), -0.1, 0.42, d / 2 + 0.04, 8))
  g.add(box(0.34, 0.3, 0.02, lit('#bfe6f2'), 0.32, 0.66, d / 2 + 0.008), box(0.38, 0.03, 0.05, light, 0.32, 0.5, d / 2 + 0.02))
  g.add(box(0.02, 0.3, 0.03, light, 0.32, 0.66, d / 2 + 0.012), box(0.34, 0.02, 0.03, light, 0.32, 0.66, d / 2 + 0.012))
  for (const [x, color] of [[0.22, '#ff6ad5'], [0.32, '#ffd23c'], [0.42, '#ff8a5a']] as const) {
    g.add(cylinder(0.03, 0.022, 0.05, lit('#b8653f'), x, 0.54, d / 2 + 0.05, 8), sphere(0.03, lit(LEAVES[0]), x, 0.585, d / 2 + 0.05, 6), sphere(0.014, lit(color), x, 0.615, d / 2 + 0.05, 5))
  }
  // Contre le mur de droite : une bêche et un râteau.
  const spade = new THREE.Group()
  spade.add(cylinder(0.012, 0.012, 0.7, light, 0, 0.45, 0, 6), box(0.1, 0.16, 0.012, lit(C.steel), 0, 0.08, 0), box(0.08, 0.02, 0.02, dark, 0, 0.8, 0))
  spade.position.set(w / 2 + 0.05, 0, 0.18)
  spade.rotation.z = -0.12
  const rake = new THREE.Group()
  rake.add(cylinder(0.011, 0.011, 0.86, light, 0, 0.43, 0, 6), box(0.02, 0.02, 0.2, lit(C.steel), 0, 0.86, 0))
  for (let i = 0; i < 5; i++) rake.add(box(0.012, 0.05, 0.012, lit(C.steel), 0.02, 0.85, -0.08 + i * 0.04))
  rake.position.set(w / 2 + 0.05, 0, -0.16)
  rake.rotation.z = -0.1
  g.add(spade, rake)
  return { solid: g }
}

/** Brouette pleine de terreau, une pelle plantée dedans. */
const wheelbarrow: Builder = () => {
  const g = new THREE.Group()
  const green = lit('#3f8f5c'), dark = lit('#2a2e36')
  const tray = box(0.5, 0.16, 0.36, green, 0, 0.3, 0)
  g.add(tray, box(0.44, 0.04, 0.3, lit(C.tilled), 0, 0.38, 0))
  for (const z of [-0.13, 0.13]) {
    const handle = barX(0.012, 0.86, lit(C.woodLight), 0.12, 0.27, z, 6)
    handle.rotation.y = 0
    g.add(handle, box(0.02, 0.2, 0.02, dark, 0.2, 0.1, z))
  }
  const wheel = cylinder(0.11, 0.11, 0.05, dark, -0.33, 0.11, 0, 14)
  wheel.rotation.x = Math.PI / 2
  const hub = cylinder(0.035, 0.035, 0.06, lit('#d9a441'), -0.33, 0.11, 0, 8)
  hub.rotation.x = Math.PI / 2
  g.add(wheel, hub)
  const shovel = new THREE.Group()
  shovel.add(cylinder(0.01, 0.01, 0.42, lit(C.woodLight), 0, 0.21, 0, 6), box(0.07, 0.1, 0.01, lit(C.steel), 0, 0, 0))
  shovel.position.set(0.08, 0.4, 0.04)
  shovel.rotation.z = 0.35
  g.add(shovel)
  return { solid: g }
}

/** Épouvantail : une croix de bois, une vieille combinaison de vol rembourrée de paille, un chapeau. */
const scarecrow: Builder = ({ random }) => {
  const g = new THREE.Group()
  const straw = lit(C.straw)
  g.add(cylinder(0.022, 0.026, 1.1, lit(C.woodDark), 0, 0.55, 0, 6))
  g.add(barX(0.018, 0.86, lit(C.woodDark), 0, 0.82, 0, 6))
  g.add(box(0.3, 0.36, 0.14, lit('#d9741f'), 0, 0.72, 0, 0.03), box(0.31, 0.05, 0.145, lit('#2a2e36'), 0, 0.58, 0))
  for (const s of [-1, 1]) {
    g.add(box(0.26, 0.09, 0.09, lit('#d9741f'), s * 0.27, 0.82, 0, 0.02))
    for (let i = 0; i < 4; i++) g.add(cylinder(0.004, 0.004, 0.09, straw, s * (0.41 + random() * 0.03), 0.8 + random() * 0.04, (random() - 0.5) * 0.06, 4))
  }
  g.add(sphere(0.11, lit('#e6cf9a'), 0, 1.02, 0, 10))
  for (const s of [-1, 1]) g.add(sphere(0.015, lit('#2a2e36'), s * 0.04, 1.04, 0.1, 5))
  g.add(box(0.07, 0.012, 0.01, lit('#6b4630'), 0, 0.99, 0.105))
  g.add(cylinder(0.2, 0.21, 0.02, straw, 0, 1.11, 0, 14), cylinder(0.09, 0.11, 0.1, straw, 0, 1.17, 0, 12))
  for (let i = 0; i < 6; i++) g.add(cylinder(0.005, 0.005, 0.1, straw, (random() - 0.5) * 0.24, 0.5, (random() - 0.5) * 0.1, 4))
  return { solid: g }
}

/** Nain de jardin en combinaison de CMDR, le pouce levé. Couleur du bonnet : `label`. */
const gardenGnome: Builder = ({ label = '#d9453a' }) => {
  const g = new THREE.Group()
  g.add(cylinder(0.07, 0.085, 0.14, lit('#3c5a8a'), 0, 0.07, 0, 10))
  g.add(sphere(0.065, lit('#f0c8a0'), 0, 0.2, 0, 10))
  const beard = mesh(new THREE.ConeGeometry(0.06, 0.11, 8), lit('#f4f1ea'), 0, 0.15, 0.04)
  beard.rotation.x = Math.PI
  g.add(beard)
  g.add(mesh(new THREE.ConeGeometry(0.07, 0.19, 10), lit(label), 0, 0.33, 0))
  g.add(sphere(0.018, lit('#e8a488'), 0, 0.2, 0.065, 6))
  g.add(box(0.03, 0.05, 0.03, lit('#f0c8a0'), 0.09, 0.14, 0.02), box(0.02, 0.035, 0.02, lit('#f0c8a0'), 0.09, 0.18, 0.02))
  return { solid: g }
}

/** Clôture de piquets blancs, le long de x. Longueur : `label` (1 par défaut). */
const gardenFence: Builder = ({ label }) => {
  const length = Number(label) || 1
  const g = new THREE.Group()
  const white = lit('#f1efe8')
  for (const y of [0.14, 0.32]) g.add(box(length, 0.03, 0.02, white, 0, y, 0))
  const n = Math.max(3, Math.round(length / 0.125))
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + (i + 0.5) * (length / n)
    g.add(box(0.07, 0.4, 0.016, white, x, 0.2, 0.016))
    const tip = mesh(new THREE.ConeGeometry(0.05, 0.06, 4), white, x, 0.43, 0.016)
    tip.rotation.y = Math.PI / 4
    tip.scale.z = 0.32
    g.add(tip)
  }
  return { solid: g }
}

/** Ruche de bord : trois hausses, un toit de tôle, et les abeilles de Capucine sur la planche d'envol. */
const beehive: Builder = ({ random }) => {
  const g = new THREE.Group()
  for (const x of [-1, 1]) for (const z of [-1, 1]) g.add(box(0.04, 0.16, 0.04, lit(C.woodDark), x * 0.17, 0.08, z * 0.17))
  const colors = ['#f1efe8', '#ffd23c', '#f1efe8']
  colors.forEach((color, i) => g.add(box(0.42, 0.16, 0.42, lit(color), 0, 0.24 + i * 0.165, 0), box(0.43, 0.012, 0.43, lit(C.woodDark), 0, 0.325 + i * 0.165, 0)))
  g.add(box(0.5, 0.05, 0.5, lit(C.steel), 0, 0.68, 0, 0.015), box(0.3, 0.012, 0.1, lit(C.woodLight), 0, 0.165, 0.25), box(0.16, 0.02, 0.012, lit('#2a2e36'), 0, 0.185, 0.212))
  for (let i = 0; i < 5; i++) g.add(sphere(0.012, lit(i % 2 ? '#ffd23c' : '#2a2e36'), (random() - 0.5) * 0.24, 0.18 + random() * 0.02, 0.24 + random() * 0.06, 5))
  return { solid: g }
}

export const GARDENING = {
  'soil-tile': soilTile,
  'garden-shed': gardenShed,
  wheelbarrow,
  scarecrow,
  'garden-gnome': gardenGnome,
  'garden-fence': gardenFence,
  beehive,
} satisfies Record<string, Builder>

// ---------------------------------------------------------------- ce qui pousse sur une tuile

/**
 * Port d'une culture : racine (des fanes, le légume affleure quand il est mûr), feuilles (une
 * rosette), tuteurée (un pied et ses fruits), fleur (une tige, une tête), buisson (bas, des
 * baies), courge (des feuilles au sol, un gros fruit).
 */
export type CropLook = 'root' | 'leafy' | 'staked' | 'flower' | 'bush' | 'gourd'

/** Feuille : un icosaèdre aplati. */
function leaf(r: number, color: string, x: number, y: number, z: number, squash = 0.6) {
  const m = mesh(new THREE.IcosahedronGeometry(r, 0), lit(color), x, y, z)
  m.scale.y = squash
  return m
}

/** La terre préparée d'une tuile : retournée, en sillons ; plus sombre arrosée. */
export function tilledSoil(wet: boolean): THREE.Group {
  const g = new THREE.Group()
  const soil = lit(wet ? C.wet : C.tilled)
  const side = SOIL_SIZE - 0.1
  g.add(box(side, 0.012, side, soil, 0, SOIL_TOP + 0.004, 0))
  for (let i = 0; i < 4; i++) {
    const ridge = barX(0.045, side - 0.02, soil, 0, SOIL_TOP + 0.002, -side / 2 + (i + 0.5) * (side / 4), 6)
    ridge.scale.x = 0.55
    g.add(ridge)
  }
  return g
}

/** Les mauvaises herbes qui ont levé sur une tuile. */
export function weedTufts(random: () => number): THREE.Group {
  const g = new THREE.Group()
  for (let i = 0; i < 9; i++) {
    const x = (random() - 0.5) * 0.78, z = (random() - 0.5) * 0.78
    for (let k = 0; k < 3; k++) {
      const blade = mesh(new THREE.ConeGeometry(0.014, 0.12 + random() * 0.1, 3), lit(k % 2 ? '#a8c84a' : '#7fa83a'), x + (random() - 0.5) * 0.04, SOIL_TOP + 0.07, z + (random() - 0.5) * 0.04)
      blade.rotation.set((random() - 0.5) * 0.7, random() * 3, (random() - 0.5) * 0.7)
      g.add(blade)
    }
  }
  return g
}

/** Un pied, à sa taille adulte (l'échelle du stade vient ensuite) : `ripe` montre ce qu'on récolte. */
function plant(look: CropLook, color: string, stage: number, random: () => number): THREE.Group {
  const g = new THREE.Group()
  const ripe = stage >= 3, green = () => LEAVES[Math.floor(random() * 4)]
  if (look === 'root') {
    for (let i = 0; i < 5; i++) {
      const frond = mesh(new THREE.ConeGeometry(0.022, 0.2, 4), lit(green()), 0, 0.09, 0)
      frond.rotation.set((random() - 0.5) * 0.9, random() * 6, (random() - 0.5) * 0.9)
      g.add(frond)
    }
    if (ripe) g.add(sphere(0.045, lit(color), 0, 0.012, 0, 8))
  } else if (look === 'leafy') {
    g.add(leaf(0.1, green(), 0, 0.05, 0, 0.55))
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + random()
      g.add(leaf(0.06, i % 2 ? color : green(), Math.cos(a) * 0.07, 0.035, Math.sin(a) * 0.07, 0.4))
    }
    if (ripe) g.add(leaf(0.055, color, 0, 0.1, 0, 0.7))
  } else if (look === 'staked') {
    g.add(cylinder(0.007, 0.007, 0.5, lit('#c9a86a'), 0, 0.25, 0, 5))
    for (let k = 0; k < 4; k++) g.add(leaf(0.06 + random() * 0.02, green(), (random() - 0.5) * 0.08, 0.1 + k * 0.1, (random() - 0.5) * 0.08, 0.7))
    if (stage >= 2) {
      for (let k = 0; k < 4; k++) g.add(sphere(0.026, lit(ripe ? color : '#8ac44a'), (random() - 0.5) * 0.12, 0.12 + random() * 0.28, (random() < 0.5 ? -1 : 1) * 0.055, 7))
    }
  } else if (look === 'flower') {
    g.add(cylinder(0.008, 0.01, 0.42, lit('#4f9a4a'), 0, 0.21, 0, 5))
    for (let k = 0; k < 2; k++) g.add(leaf(0.05, green(), (k ? 1 : -1) * 0.05, 0.14 + k * 0.1, 0, 0.35))
    if (stage >= 2) {
      const head = cylinder(ripe ? 0.075 : 0.035, ripe ? 0.075 : 0.035, 0.02, lit(ripe ? color : '#8ac44a'), 0, 0.43, 0.01, 10)
      head.rotation.x = 1.1
      g.add(head)
      if (ripe) {
        const heart = cylinder(0.035, 0.035, 0.024, lit('#5a3a24'), 0, 0.432, 0.014, 8)
        heart.rotation.x = 1.1
        g.add(heart)
      }
    }
  } else if (look === 'bush') {
    for (let k = 0; k < 5; k++) g.add(leaf(0.07 + random() * 0.02, green(), (random() - 0.5) * 0.12, 0.06 + random() * 0.07, (random() - 0.5) * 0.12, 0.65))
    if (stage >= 2) {
      for (let k = 0; k < 5; k++) g.add(sphere(0.02, lit(ripe ? color : '#d8e8a0'), (random() - 0.5) * 0.2, 0.05 + random() * 0.1, (random() - 0.5) * 0.2, 6))
    }
  } else {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + random()
      g.add(leaf(0.09, green(), Math.cos(a) * 0.2, 0.03, Math.sin(a) * 0.2, 0.25))
    }
    if (stage >= 2) {
      const fruit = sphere(ripe ? 0.17 : 0.08, lit(ripe ? color : '#8ac44a'), 0, ripe ? 0.11 : 0.06, 0, 12)
      fruit.scale.y = 0.72
      g.add(fruit, cylinder(0.012, 0.016, 0.05, lit('#4f7a44'), 0, ripe ? 0.25 : 0.13, 0, 5))
    }
  }
  return g
}

/** Taille des pieds à chaque stade : semis, jeune plant, plant, mûr. */
const STAGE_SCALE = [0.32, 0.62, 0.9, 1]

/** Les pieds d'une tuile, à ce stade (0 à 3) : quatre, ou un seul pour une courge. */
export function cropPlants(look: CropLook, color: string, stage: number, random: () => number): THREE.Group {
  const g = new THREE.Group()
  const spots = look === 'gourd' ? [[0, 0]] : [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]
  for (const [x, z] of spots) {
    const p = plant(look, color, stage, random)
    p.position.set(x + (random() - 0.5) * 0.05, SOIL_TOP + 0.01, z + (random() - 0.5) * 0.05)
    p.rotation.y = random() * Math.PI * 2
    p.scale.setScalar(STAGE_SCALE[stage] ?? 1)
    g.add(p)
  }
  return g
}
