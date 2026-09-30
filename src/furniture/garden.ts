import * as THREE from 'three'
import { renderQuality } from '../quality'
import { LEAVES } from './cozy'
import { barX, barZ, box, cylinder, glass, glow, instanced, lit, mesh, part, sphere, type Builder } from './kit'

/*
 * La serre hydroponique du pont supérieur, agrandie : bacs potagers surélevés, arbre fruitier,
 * bassin aux carpes, compost, grainothèque, récupérateur d'eau, caisses de récolte, arche fleurie,
 * pelouse et pas japonais, papillons, treille de vigne contre la verrière. Ce sont aussi les postes du mini-jeu de
 * Capucine, la jardinière (cf. src/greenhouse.ts).
 */

const C = {
  wood: '#9a6a45',
  woodDark: '#6b4630',
  woodLight: '#c49a6c',
  soil: '#3a2a1e',
  terracotta: '#b8653f',
  stone: '#9a9a92',
  stoneDark: '#6f706a',
  steel: '#dfe3e8',
  dark: '#2a2e36',
}

const FLOWERS = ['#ff6ad5', '#ffd23c', '#ffffff', '#ff8a5a', '#b27cff', '#ff4f6a']

/** Feuillage : un icosaèdre aplati. */
function leaf(r: number, color: string, x: number, y: number, z: number, squash = 0.7) {
  const m = mesh(new THREE.IcosahedronGeometry(r, 0), lit(color), x, y, z)
  m.scale.y = squash
  return m
}

/**
 * Bac potager surélevé, en planches, plein de terre. Culture : `label` (tomato : pieds de tomates
 * tuteurés ; lettuce : salades et fanes de carottes ; flowers : fleurs ; herbs : herbes
 * aromatiques). Taille : 1,5 × 0,7.
 */
const gardenBed: Builder = ({ label = 'tomato', random }) => {
  const g = new THREE.Group()
  const w = 1.5, d = 0.7, h = 0.3
  const plank = lit(C.wood), dark = lit(C.woodDark)
  // Planches, poteaux d'angle, liseré du haut.
  for (const z of [-d / 2, d / 2]) g.add(box(w, h, 0.05, plank, 0, h / 2, z))
  for (const x of [-w / 2, w / 2]) g.add(box(0.05, h, d, plank, x, h / 2, 0))
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) g.add(box(0.07, h + 0.04, 0.07, dark, x, (h + 0.04) / 2, z))
  for (const z of [-d / 2, d / 2]) g.add(box(w + 0.04, 0.02, 0.08, lit(C.woodLight), 0, h + 0.01, z))
  g.add(box(w - 0.06, 0.03, d - 0.06, lit(C.soil), 0, h - 0.03, 0))
  const top = h - 0.015
  if (label === 'tomato') {
    // Deux rangées de pieds tuteurés, grappes de tomates rouges et quelques vertes.
    for (let i = 0; i < 5; i++) for (const z of [-0.16, 0.16]) {
      const x = -0.6 + i * 0.3
      g.add(cylinder(0.008, 0.008, 0.62, lit('#c9a86a'), x, top + 0.31, z, 5))
      for (let k = 0; k < 4; k++) g.add(leaf(0.06 + random() * 0.02, LEAVES[(i + k) % 4], x + (random() - 0.5) * 0.08, top + 0.12 + k * 0.13, z + (random() - 0.5) * 0.08))
      for (let k = 0; k < 3; k++) g.add(sphere(0.028, lit(random() < 0.8 ? '#e0453a' : '#8ac44a'), x + (random() - 0.5) * 0.1, top + 0.15 + random() * 0.35, z + (random() < 0.5 ? -0.05 : 0.05), 8))
    }
  } else if (label === 'lettuce') {
    for (let i = 0; i < 6; i++) for (const [k, z] of [-0.2, 0, 0.2].entries()) {
      const x = -0.6 + i * 0.24
      if (k === 1) {
        // Fanes de carottes, un bout orange qui dépasse.
        for (let f = 0; f < 3; f++) {
          const frond = mesh(new THREE.ConeGeometry(0.012, 0.14, 4), lit(LEAVES[2]), x + (f - 1) * 0.02, top + 0.08, z)
          frond.rotation.z = (f - 1) * 0.35
          g.add(frond)
        }
        g.add(cylinder(0.02, 0.012, 0.03, lit('#f08a2a'), x, top + 0.01, z, 6))
      } else {
        const lettuce = mesh(new THREE.IcosahedronGeometry(0.075, 1), lit(LEAVES[(i + k) % 2 ? 2 : 0]), x, top + 0.05, z)
        lettuce.scale.y = 0.6
        g.add(lettuce)
      }
    }
  } else if (label === 'flowers') {
    for (let i = 0; i < 16; i++) {
      const x = -0.62 + (i % 8) * 0.177 + (random() - 0.5) * 0.05, z = (i < 8 ? -0.14 : 0.14) + (random() - 0.5) * 0.08
      const stem = 0.12 + random() * 0.2
      g.add(cylinder(0.006, 0.006, stem, lit(LEAVES[1]), x, top + stem / 2, z, 4), leaf(0.035, LEAVES[i % 4], x + 0.03, top + stem * 0.4, z))
      const color = FLOWERS[Math.floor(random() * FLOWERS.length)]
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2
        g.add(sphere(0.02, lit(color), x + Math.cos(a) * 0.025, top + stem, z + Math.sin(a) * 0.025, 5))
      }
      g.add(sphere(0.014, lit('#ffd23c'), x, top + stem + 0.01, z, 5))
    }
  } else {
    // Herbes : buissons de basilic, touffes de ciboulette, un romarin.
    for (let i = 0; i < 5; i++) for (const z of [-0.15, 0.15]) {
      const x = -0.56 + i * 0.28
      if ((i + (z > 0 ? 1 : 0)) % 2) {
        for (let k = 0; k < 6; k++) g.add(leaf(0.035, LEAVES[k % 4], x + (random() - 0.5) * 0.12, top + 0.05 + random() * 0.08, z + (random() - 0.5) * 0.12, 0.6))
      } else {
        for (let k = 0; k < 7; k++) {
          const blade = mesh(new THREE.ConeGeometry(0.007, 0.16 + random() * 0.06, 3), lit(LEAVES[1]), x + (random() - 0.5) * 0.08, top + 0.09, z + (random() - 0.5) * 0.08)
          blade.rotation.z = (random() - 0.5) * 0.4
          g.add(blade)
        }
        g.add(sphere(0.018, lit('#c48ae8'), x, top + 0.19, z, 6))
      }
    }
  }
  // La pancarte de la culture, piquée dans un coin.
  g.add(box(0.012, 0.16, 0.012, dark, w / 2 - 0.1, top + 0.08, d / 2 - 0.08), box(0.1, 0.06, 0.01, lit('#f4ecd8'), w / 2 - 0.1, top + 0.17, d / 2 - 0.075))
  return { solid: g }
}

/**
 * Arbre fruitier nain dans un grand bac rond : tronc noueux, frondaison ronde, fruits orange de
 * Lave qui luisent doucement. Environ 1,7 de haut.
 */
const fruitTree: Builder = ({ random }) => {
  const g = new THREE.Group()
  g.add(cylinder(0.4, 0.34, 0.34, lit(C.terracotta), 0, 0.17, 0, 20), cylinder(0.42, 0.42, 0.04, lit('#a0552f'), 0, 0.34, 0, 20))
  g.add(cylinder(0.37, 0.37, 0.02, lit(C.soil), 0, 0.33, 0, 20))
  // Mousse et petites fleurs au pied.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    g.add(leaf(0.05, LEAVES[i % 4], Math.cos(a) * 0.25, 0.36, Math.sin(a) * 0.25, 0.5))
    if (i % 2) g.add(sphere(0.018, lit(FLOWERS[i % FLOWERS.length]), Math.cos(a) * 0.28, 0.39, Math.sin(a) * 0.28, 5))
  }
  const bark = lit('#6b4a32')
  const trunk = cylinder(0.05, 0.08, 0.75, bark, 0, 0.7, 0, 8)
  trunk.rotation.z = 0.08
  g.add(trunk)
  for (const [a, tilt] of [[0.4, 0.7], [2.5, 0.6], [4.3, 0.8]]) {
    const branch = cylinder(0.025, 0.035, 0.4, bark, Math.cos(a) * 0.12, 1.08, Math.sin(a) * 0.12, 6)
    branch.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt)
    g.add(branch)
  }
  // La frondaison : des boules de feuillage empilées.
  const crown: [number, number, number, number][] = [[0, 1.35, 0, 0.36], [0.28, 1.22, 0.1, 0.26], [-0.26, 1.25, -0.08, 0.27], [0.05, 1.22, 0.3, 0.24], [-0.05, 1.28, -0.3, 0.25], [0.1, 1.58, -0.05, 0.24]]
  crown.forEach(([x, y, z, r], i) => g.add(leaf(r, LEAVES[i % 4], x, y, z, 0.85)))
  for (let i = 0; i < 12; i++) {
    const a = random() * Math.PI * 2, y = 1.12 + random() * 0.45, r = 0.3 + random() * 0.08
    g.add(sphere(0.04, glow(i % 3 ? '#ffae3c' : '#ff7a2a'), Math.cos(a) * r, y, Math.sin(a) * r, 8))
  }
  return { solid: g }
}

/**
 * Bassin aux carpes : margelle de pierres, eau claire, nénuphars, une fleur de lotus, et trois
 * carpes koï qui tournent en rond (en mode léger, elles se reposent). Environ 1,3 × 1.
 */
const gardenPond: Builder = ({ random }) => {
  const g = new THREE.Group()
  const rx = 0.62, rz = 0.46
  // Margelle : pierres plates en ellipse.
  const N = 16
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2
    const stone = mesh(new THREE.DodecahedronGeometry(0.1 + random() * 0.03, 0), lit(i % 3 ? C.stone : C.stoneDark), Math.cos(a) * rx, 0.05, Math.sin(a) * rz)
    stone.scale.set(1.2, 0.5, 1)
    stone.rotation.y = -a
    g.add(stone)
  }
  const bottom = cylinder(1, 1, 0.02, lit('#1d4a4a'), 0, 0.02, 0, 24)
  bottom.scale.set(rx, 1, rz)
  g.add(bottom)
  // Nénuphars (disques échancrés) et le lotus.
  for (const [x, z, r] of [[-0.25, 0.12, 0.09], [0.2, -0.15, 0.08], [0.3, 0.16, 0.07], [-0.1, -0.2, 0.06]]) {
    const pad = mesh(new THREE.CircleGeometry(r, 12, 0.4, Math.PI * 2 - 0.4), lit('#4f9a4a'), x, 0.085, z)
    pad.rotation.x = -Math.PI / 2
    g.add(pad)
  }
  for (let p = 0; p < 6; p++) {
    const a = (p / 6) * Math.PI * 2
    const petal = mesh(new THREE.ConeGeometry(0.025, 0.07, 4), lit(p % 2 ? '#ffc2e0' : '#ff8ac8'), -0.25 + Math.cos(a) * 0.03, 0.12, 0.12 + Math.sin(a) * 0.03)
    petal.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6)
    g.add(petal)
  }
  g.add(sphere(0.018, lit('#ffd23c'), -0.25, 0.115, 0.12, 6))
  // Une grenouille de pierre qui crache un filet d'eau.
  g.add(sphere(0.06, lit(C.stoneDark), rx - 0.05, 0.13, -0.05, 8), sphere(0.02, lit(C.stoneDark), rx - 0.08, 0.18, -0.08, 5), sphere(0.02, lit(C.stoneDark), rx - 0.08, 0.18, -0.02, 5))
  const live = new THREE.Group()
  const water = part(new THREE.CylinderGeometry(1, 1, 0.01, 24), glass('#6fd6e8', 0.55), 0, 0.075, 0)
  water.scale.set(rx - 0.04, 1, rz - 0.04)
  const jet = part(new THREE.CylinderGeometry(0.006, 0.01, 0.2, 5), glass('#bff6ff', 0.6), rx - 0.2, 0.12, -0.05)
  jet.rotation.z = 1.2
  live.add(water, jet)
  // Les carpes : corps allongé, queue ; blanc et orange, une noire.
  const koi = ['#ff7a2a', '#f4f4f0', '#2a2a2e'].map((color, i) => {
    const fish = new THREE.Group()
    const body = part(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshLambertMaterial({ color }), 0, 0, 0)
    body.scale.set(0.6, 0.45, 1.6)
    const tail = part(new THREE.ConeGeometry(0.025, 0.05, 4), new THREE.MeshLambertMaterial({ color: i === 1 ? '#ff7a2a' : color }), 0, 0, -0.07)
    tail.rotation.x = -Math.PI / 2
    tail.scale.set(1, 1, 0.3)
    fish.add(body, tail)
    live.add(fish)
    return { fish, tail, speed: 0.5 + i * 0.13, phase: i * 2.1, r: 0.55 + i * 0.12 }
  })
  return {
    solid: g,
    live,
    update(t) {
      const still = renderQuality.light
      for (const k of koi) {
        const a = (still ? 0 : t) * k.speed + k.phase
        const x = Math.cos(a) * (rx - 0.18) * k.r, z = Math.sin(a) * (rz - 0.14) * k.r
        k.fish.position.set(x, 0.06, z)
        k.fish.rotation.y = Math.atan2(-Math.sin(a) * (rx - 0.18), Math.cos(a) * (rz - 0.14)) + Math.PI
        k.tail.rotation.y = still ? 0 : Math.sin(t * 8 + k.phase) * 0.4
      }
      jet.visible = !still
    },
  }
}

/** Composteur en lattes de bois : épluchures, marc de café, et un panneau « Nourrir le compost ». */
const compostBin: Builder = ({ random }) => {
  const g = new THREE.Group()
  const slat = lit(C.woodLight), post = lit(C.woodDark)
  for (const x of [-0.3, 0.3]) for (const z of [-0.25, 0.25]) g.add(box(0.05, 0.5, 0.05, post, x, 0.25, z))
  for (let i = 0; i < 4; i++) {
    const y = 0.08 + i * 0.12
    for (const z of [-0.25, 0.25]) g.add(box(0.62, 0.07, 0.025, slat, 0, y, z))
    for (const x of [-0.3, 0.3]) g.add(box(0.025, 0.07, 0.52, slat, x, y, 0))
  }
  g.add(box(0.56, 0.3, 0.46, lit('#4a3524'), 0, 0.3, 0))
  const scraps = ['#e0453a', '#f08a2a', '#86c46a', '#f4ecd8', '#ffd23c', '#5a3a24']
  for (let i = 0; i < 12; i++) g.add(box(0.05, 0.02, 0.04, lit(scraps[i % scraps.length]), (random() - 0.5) * 0.44, 0.46, (random() - 0.5) * 0.36))
  // Le panneau, et une fourche plantée.
  g.add(box(0.28, 0.12, 0.012, lit('#f4ecd8'), 0, 0.42, 0.27), box(0.2, 0.012, 0.004, lit('#3c7a44'), 0, 0.44, 0.278), box(0.14, 0.012, 0.004, lit('#3c7a44'), 0, 0.41, 0.278))
  const fork = cylinder(0.01, 0.01, 0.55, lit(C.wood), 0.18, 0.62, -0.08, 6)
  fork.rotation.z = -0.25
  g.add(fork)
  for (let i = 0; i < 3; i++) g.add(box(0.008, 0.1, 0.008, lit(C.steel), 0.1 + i * 0.025, 0.36, -0.08))
  return { solid: g }
}

/**
 * Grainothèque : un meuble à tiroirs étiquetés de toutes les couleurs, bocaux de graines dessus,
 * plaque « Semences · Colonia – Sol », lampe verte. Contre un mur, face à +z.
 */
const seedCabinet: Builder = ({ random }) => {
  const g = new THREE.Group()
  const wood = lit(C.wood), dark = lit(C.woodDark)
  g.add(box(0.9, 0.96, 0.34, wood, 0, 0.48, 0, 0.015), box(0.94, 0.04, 0.38, dark, 0, 0.98, 0))
  const tags = ['#d9a441', '#86c46a', '#e0453a', '#b27cff', '#6fa8ff', '#ff8ac8']
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const x = -0.34 + c * 0.17, y = 0.13 + r * 0.17
    g.add(box(0.15, 0.14, 0.02, lit(C.woodLight), x, y, 0.17, 0.01))
    g.add(box(0.06, 0.03, 0.006, lit(tags[(r * 5 + c) % tags.length]), x, y + 0.03, 0.182), box(0.04, 0.012, 0.012, dark, x, y - 0.03, 0.185))
  }
  // Bocaux de graines et petit pot de semis, la lampe verte.
  const seeds = ['#d9a441', '#8a5a3a', '#e9dcc4', '#5aa35a', '#c0643f']
  seeds.forEach((col, i) => {
    const x = -0.36 + i * 0.12
    g.add(cylinder(0.04, 0.04, 0.1 + random() * 0.04, lit(col), x, 1.06, 0.02, 8), cylinder(0.042, 0.042, 0.015, lit(C.steel), x, 1.13, 0.02, 8))
  })
  g.add(cylinder(0.012, 0.012, 0.22, lit(C.dark), 0.38, 1.11, -0.08, 6), cylinder(0.05, 0.08, 0.06, glow('#9dff9a'), 0.38, 1.23, -0.04, 10))
  g.add(box(0.5, 0.07, 0.01, lit('#2f3a2a'), 0, 0.93, 0.182), box(0.44, 0.015, 0.004, glow('#9dff9a'), 0, 0.935, 0.188))
  return { solid: g }
}

/**
 * Récupérateur d'eau : un tonneau bleu à robinet, relié à la condensation de la coque, deux
 * arrosoirs au pied et un tuyau enroulé.
 */
const waterBarrel: Builder = () => {
  const g = new THREE.Group()
  const blue = lit('#3f7fb8'), steel = lit(C.steel)
  g.add(cylinder(0.23, 0.21, 0.7, blue, 0, 0.35, 0, 16), cylinder(0.235, 0.235, 0.04, lit('#2f6090'), 0, 0.72, 0, 16))
  for (const y of [0.18, 0.52]) g.add(cylinder(0.235, 0.235, 0.025, lit('#2f6090'), 0, y, 0, 16))
  // Le tuyau qui descend de la coque, la jauge, le robinet.
  g.add(cylinder(0.025, 0.025, 0.6, steel, -0.12, 1.02, -0.12, 8), barX(0.025, 0.14, steel, -0.06, 0.74, -0.12, 8))
  g.add(box(0.03, 0.4, 0.01, lit('#1d2f40'), 0.12, 0.38, 0.2), box(0.02, 0.26, 0.012, glow('#6fd6e8'), 0.12, 0.33, 0.203))
  g.add(barZ(0.018, 0.1, steel, 0, 0.14, 0.24, 8), box(0.05, 0.015, 0.015, lit('#d9453a'), 0, 0.165, 0.27))
  // Arrosoirs, vert et orange.
  for (const [x, z, col] of [[0.34, 0.1, '#3f8f8c'], [0.3, -0.18, '#f08a2a']] as const) {
    g.add(cylinder(0.07, 0.075, 0.15, lit(col), x, 0.075, z, 12))
    const spout = cylinder(0.01, 0.016, 0.16, lit(col), x - 0.1, 0.12, z, 6)
    spout.rotation.z = 0.9
    const handle = mesh(new THREE.TorusGeometry(0.05, 0.01, 5, 10, Math.PI), lit(col), x, 0.15, z)
    handle.rotation.y = Math.PI / 2
    g.add(spout, handle)
  }
  // Le tuyau d'arrosage enroulé.
  for (let i = 0; i < 3; i++) {
    const coil = mesh(new THREE.TorusGeometry(0.1 - i * 0.012, 0.014, 5, 16), lit('#4f9a4a'), -0.3, 0.02 + i * 0.025, 0.15)
    coil.rotation.x = Math.PI / 2
    g.add(coil)
  }
  return { solid: g }
}

/**
 * Caisses de récolte empilées : tomates, carottes, salades, fruits de Lave, et un panier d'osier
 * posé dessus. Face à +z.
 */
const harvestCrate: Builder = ({ random }) => {
  const g = new THREE.Group()
  const slat = lit(C.woodLight), dark = lit(C.woodDark)
  const crate = (x: number, y: number, z: number, produce: string, round: boolean) => {
    for (const s of [-1, 1]) g.add(box(0.46, 0.2, 0.02, slat, x, y + 0.1, z + s * 0.16), box(0.02, 0.2, 0.34, slat, x + s * 0.22, y + 0.1, z))
    g.add(box(0.44, 0.02, 0.32, dark, x, y + 0.01, z), box(0.12, 0.04, 0.005, dark, x, y + 0.14, z + 0.172))
    for (let i = 0; i < 10; i++) {
      const px = x + (random() - 0.5) * 0.36, pz = z + (random() - 0.5) * 0.24
      if (round) g.add(sphere(0.045, lit(produce), px, y + 0.18, pz, 8))
      else {
        const carrot = mesh(new THREE.ConeGeometry(0.022, 0.14, 6), lit(produce), px, y + 0.18, pz)
        carrot.rotation.set(Math.PI / 2, 0, random() * Math.PI)
        g.add(carrot)
      }
    }
  }
  crate(-0.25, 0, 0, '#e0453a', true)
  crate(0.25, 0, 0, '#f08a2a', false)
  crate(0, 0.22, 0, '#86c46a', true)
  // Le panier d'osier, avec quelques fruits de Lave.
  g.add(cylinder(0.13, 0.1, 0.1, lit('#c9a26a'), 0.02, 0.5, 0.02, 12))
  const handle = mesh(new THREE.TorusGeometry(0.11, 0.01, 5, 14, Math.PI), lit('#a07a4a'), 0.02, 0.55, 0.02)
  g.add(handle)
  for (let i = 0; i < 4; i++) g.add(sphere(0.035, lit('#ffae3c'), 0.02 + (i - 1.5) * 0.05, 0.56, 0.02 + (i % 2 ? 0.03 : -0.03), 8))
  return { solid: g }
}

/**
 * Arche de treillage couverte de rosiers grimpants, à franchir (posée sans collision). Largeur du
 * passage : `label` (1,2 par défaut) ; le passage court le long de z.
 */
const gardenArch: Builder = ({ label, random }) => {
  const span = Number(label) || 1.2
  const g = new THREE.Group()
  const white = lit('#f4f1ea'), height = 1.25
  for (const x of [-span / 2, span / 2]) {
    for (const z of [-0.12, 0.12]) g.add(box(0.035, height, 0.035, white, x, height / 2, z))
    for (let i = 0; i < 5; i++) g.add(box(0.01, 0.01, 0.24, white, x, 0.2 + i * 0.22, 0))
  }
  // Le cintre : des traverses sur un demi-cercle.
  const N = 11
  for (let i = 0; i < N; i++) {
    const a = (i / (N - 1)) * Math.PI
    const x = -Math.cos(a) * span / 2, y = height + Math.sin(a) * 0.3
    g.add(box(0.035, 0.035, 0.28, white, x, y, 0))
    // Le rosier : feuillage et roses le long de l'arche, jusqu'au sol.
    g.add(leaf(0.07 + random() * 0.03, LEAVES[i % 4], x + (random() - 0.5) * 0.06, y + 0.03, (random() - 0.5) * 0.18))
    if (i % 2 === 0) g.add(sphere(0.03, lit(random() < 0.6 ? '#ff4f6a' : '#ffc2e0'), x, y + 0.07, (random() - 0.5) * 0.2, 7))
  }
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) {
    const y = 0.15 + k * 0.2
    g.add(leaf(0.06, LEAVES[(k + 1) % 4], s * span / 2 + (random() - 0.5) * 0.08, y, (random() - 0.5) * 0.2))
    if (k % 2) g.add(sphere(0.026, lit(random() < 0.6 ? '#ff4f6a' : '#ffffff'), s * (span / 2 + 0.04), y + 0.05, (random() - 0.5) * 0.18, 6))
  }
  return { solid: g }
}

/**
 * Carré de pelouse (sans collision) : gazon, touffes d'herbe, pâquerettes et trèfles. Taille :
 * `label` (« LxP », 2 × 1,5 par défaut).
 */
const lawn: Builder = ({ label, random }) => {
  const [w, d] = (label ?? '2x1.5').split('x').map(Number)
  const g = new THREE.Group()
  g.add(box(w, 0.016, d, lit('#3f7a36'), 0, 0.01, 0, 0.006), box(w - 0.1, 0.018, d - 0.1, lit('#4f8a3e'), 0, 0.011, 0))
  const count = Math.round(w * d * 14)
  for (let i = 0; i < count; i++) {
    const x = (random() - 0.5) * (w - 0.12), z = (random() - 0.5) * (d - 0.12), kind = random()
    if (kind < 0.55) {
      const tuft = mesh(new THREE.ConeGeometry(0.02, 0.05 + random() * 0.04, 3), lit(LEAVES[Math.floor(random() * 4)]), x, 0.04, z)
      tuft.rotation.z = (random() - 0.5) * 0.5
      g.add(tuft)
    } else if (kind < 0.8) {
      g.add(sphere(0.012, lit(random() < 0.7 ? '#ffffff' : '#ffd23c'), x, 0.026, z, 5))
    } else {
      const clover = mesh(new THREE.CircleGeometry(0.025, 6), lit('#3c7a44'), x, 0.022, z)
      clover.rotation.x = -Math.PI / 2
      g.add(clover)
    }
  }
  return { solid: g }
}

/** Pas japonais : des pierres plates en ligne le long de x (sans collision). Longueur : `label` (2 par défaut). */
const steppingStones: Builder = ({ label, random }) => {
  const length = Number(label) || 2
  const g = new THREE.Group()
  const n = Math.max(2, Math.round(length / 0.36))
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + (i + 0.5) * (length / n)
    const stone = mesh(new THREE.CylinderGeometry(0.13 + random() * 0.03, 0.14 + random() * 0.03, 0.025, 7), lit(i % 2 ? C.stone : '#b0afa6'), x, 0.013, (random() - 0.5) * 0.08)
    stone.rotation.y = random() * Math.PI
    stone.scale.z = 0.8
    g.add(stone)
  }
  return { solid: g }
}

/**
 * Treille contre la verrière : un treillage blanc en losanges où grimpe une vigne (sarments,
 * feuilles, grappes de raisin) et quelques liserons. Dos au mur (z = 0), face à +z ; on voit la
 * verrière à travers. Largeur : `label` (1,6 par défaut).
 */
const vineTrellis: Builder = ({ label, random }) => {
  const width = Number(label) || 1.6
  const g = new THREE.Group()
  const white = lit('#f1efe8'), vine = lit('#6b4a32')
  const height = 0.92
  for (const x of [-width / 2, width / 2]) g.add(box(0.03, height, 0.03, white, x, height / 2, 0.03))
  g.add(box(width, 0.025, 0.03, white, 0, height, 0.03), box(width, 0.025, 0.03, white, 0, 0.1, 0.03))
  // Les lattes en losanges : deux nappes de diagonales.
  const step = 0.3
  for (let x0 = -width / 2 - height; x0 < width / 2; x0 += step) {
    for (const dir of [1, -1]) {
      const a = dir > 0 ? x0 : x0 + height
      const x1 = Math.max(-width / 2, Math.min(width / 2, a)), x2 = Math.max(-width / 2, Math.min(width / 2, a + dir * height))
      const y1 = 0.1 + Math.abs(x1 - a), y2 = 0.1 + Math.abs(x2 - a)
      const len = Math.hypot(x2 - x1, y2 - y1)
      if (len < 0.05) continue
      const slat = box(0.012, len, 0.01, white, (x1 + x2) / 2, (y1 + y2) / 2, 0.02)
      slat.rotation.z = -Math.atan2(x2 - x1, y2 - y1)
      g.add(slat)
    }
  }
  // Les ceps, qui montent en zigzag, et leur feuillage.
  const vines = Math.max(2, Math.round(width / 0.55))
  for (let v = 0; v < vines; v++) {
    let x = -width / 2 + (v + 0.5) * (width / vines), y = 0
    while (y < height - 0.05) {
      const nx = Math.max(-width / 2 + 0.05, Math.min(width / 2 - 0.05, x + (random() - 0.5) * 0.3)), ny = y + 0.18
      const len = Math.hypot(nx - x, ny - y)
      const cane = cylinder(0.012, 0.016, len, vine, (x + nx) / 2, (y + ny) / 2, 0.06, 5)
      cane.rotation.z = -Math.atan2(nx - x, ny - y)
      g.add(cane)
      for (let k = 0; k < 3; k++) g.add(leaf(0.05 + random() * 0.03, LEAVES[Math.floor(random() * 4)], nx + (random() - 0.5) * 0.18, ny + (random() - 0.5) * 0.1, 0.08 + random() * 0.05, 0.5))
      if (y > 0.3 && random() < 0.45) {
        // Une grappe : des grains en cône renversé.
        const gx = nx + (random() - 0.5) * 0.1, gy = ny - 0.06, color = random() < 0.7 ? '#6a3a8a' : '#a8c85a'
        for (let r = 0; r < 4; r++) for (let c = 0; c <= 3 - r; c++) g.add(sphere(0.016, lit(color), gx + (c - (3 - r) / 2) * 0.026, gy - r * 0.024, 0.12, 6))
      }
      if (random() < 0.2) g.add(sphere(0.02, lit(random() < 0.5 ? '#ffffff' : '#b27cff'), nx, ny + 0.04, 0.13, 6))
      x = nx
      y = ny
    }
  }
  return { solid: g }
}

/**
 * Coccinelles et papillons qui volettent au-dessus d'un massif (décor vivant, sans collision) : une
 * nuée légère. Rayon : `label` (0,8 par défaut).
 */
const butterflies: Builder = ({ label, random }) => {
  const reach = Number(label) || 0.8
  const COUNT = 5
  const colors = ['#ffd23c', '#ff8ac8', '#6fa8ff', '#ffffff', '#ff8a5a']
  const wings = instanced(new THREE.PlaneGeometry(0.05, 0.035), colors.slice(0, COUNT), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  const flight = Array.from({ length: COUNT }, () => ({ a: random() * 6.28, speed: 0.4 + random() * 0.5, h: 0.6 + random() * 0.6, r: 0.3 + random() * 0.7 }))
  const live = new THREE.Group()
  live.add(wings)
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler()
  return {
    live,
    update(t) {
      wings.visible = !renderQuality.light
      if (!wings.visible) return
      flight.forEach((f, i) => {
        const a = f.a + t * f.speed
        p.set(Math.cos(a) * f.r * reach, f.h + Math.sin(t * 2.3 + i) * 0.08, Math.sin(a * 1.3) * f.r * reach * 0.7)
        // Les ailes battent : le plan se replie sur lui-même.
        s.set(Math.abs(Math.sin(t * 14 + i * 2)) * 0.9 + 0.1, 1, 1)
        q.setFromEuler(e.set(-Math.PI / 2, 0, a + Math.PI / 2))
        wings.setMatrixAt(i, m.compose(p, q, s))
      })
      wings.instanceMatrix.needsUpdate = true
    },
  }
}

export const GARDEN = {
  'garden-bed': gardenBed,
  'fruit-tree': fruitTree,
  'garden-pond': gardenPond,
  'compost-bin': compostBin,
  'seed-cabinet': seedCabinet,
  'water-barrel': waterBarrel,
  'harvest-crate': harvestCrate,
  'garden-arch': gardenArch,
  lawn,
  'stepping-stones': steppingStones,
  butterflies,
  'vine-trellis': vineTrellis,
} satisfies Record<string, Builder>
