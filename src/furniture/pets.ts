import * as THREE from 'three'
import { FABRIC, LEAVES } from './cozy'
import { barX, barZ, box, cylinder, glass, lit, mesh, part, sphere, type Builder } from './kit'
import { coatOf, speciesOf, SPECIES, type Home } from '../pets'

/*
 * Les compagnons des quartiers (cf. src/pets.ts) : le panier de chaque espèce, et les objets
 * pour animaux (gamelles, arbre à chat, niche, jouets, griffoir, bocal à poisson).
 * Mêmes conventions que decor.ts : face à +z, posé au sol, centré sur l'origine.
 */

const C = {
  wood: '#9a6a45',
  woodDark: '#6b4630',
  woodLight: '#c49a6c',
  rope: '#d8c49a',
  carpet: '#8a7a9a',
  straw: '#e3c46a',
  strawDark: '#c9a24a',
  ice: '#dff3ff',
  iceDeep: '#a9d8f0',
  sand: '#e8d3a0',
  steel: '#b9c1cc',
  honey: '#e8a93a',
  bamboo: '#8fbf4a',
}

const CUSHIONS = [FABRIC.teal, FABRIC.terracotta, FABRIC.mustard, FABRIC.navy, FABRIC.sage, FABRIC.rose, FABRIC.plum]

/** Coussin rond sur un cadre de bois, bordé d'un boudin ; l'écuelle au nom de la robe. */
function cushion(g: THREE.Group, fabric: string, accent: string) {
  g.add(cylinder(0.22, 0.2, 0.06, lit(C.woodLight), 0, 0.03, 0, 16), cylinder(0.16, 0.16, 0.03, lit(fabric), 0, 0.07, 0, 16))
  const rim = mesh(new THREE.TorusGeometry(0.18, 0.045, 6, 18), lit(fabric), 0, 0.085, 0)
  rim.rotation.x = Math.PI / 2
  g.add(rim)
  // Médaille à la couleur de la robe, accrochée au bord.
  g.add(barZ(0.022, 0.008, lit(accent), 0, 0.08, 0.225, 12))
}

const homes: Record<Home, (g: THREE.Group, fabric: string, accent: string) => void> = {
  cushion,
  bamboo: (g, fabric, accent) => {
    cushion(g, fabric, accent)
    for (const [x, z, h] of [[-0.2, -0.17, 0.42], [-0.15, -0.21, 0.32], [-0.24, -0.1, 0.26]]) {
      for (let y = 0; y < h; y += 0.1) g.add(cylinder(0.014, 0.014, 0.095, lit(C.bamboo), x, y + 0.05, z, 6), cylinder(0.017, 0.017, 0.008, lit('#6f9a36'), x, y + 0.1, z, 6))
      const leaf = mesh(new THREE.ConeGeometry(0.02, 0.09, 3), lit(LEAVES[1] ?? '#3f7a3a'), x + 0.03, h, z)
      leaf.rotation.z = -1
      g.add(leaf)
    }
  },
  perch: (g, _fabric, accent) => {
    g.add(cylinder(0.17, 0.19, 0.04, lit(C.woodDark), 0, 0.02, 0, 16), cylinder(0.15, 0.15, 0.005, lit(C.sand), 0, 0.043, 0, 16))
    g.add(cylinder(0.018, 0.02, 0.5, lit(C.wood), 0, 0.29, 0, 8), barX(0.014, 0.34, lit(C.wood), 0, 0.53, 0, 8))
    g.add(cylinder(0.035, 0.028, 0.03, lit(accent), 0.14, 0.53, 0, 10))
    const swing = mesh(new THREE.TorusGeometry(0.06, 0.006, 5, 16), lit(C.steel), -0.1, 0.45, 0)
    g.add(swing)
  },
  hive: (g, _fabric, accent) => {
    g.add(box(0.26, 0.05, 0.26, lit(C.woodDark), 0, 0.025, 0))
    for (let i = 0; i < 4; i++) g.add(cylinder(0.12 - i * 0.012, 0.125 - i * 0.012, 0.055, lit(i % 2 ? C.honey : '#d99a30'), 0, 0.08 + i * 0.055, 0, 16))
    g.add(sphere(0.07, lit('#d99a30'), 0, 0.28, 0, 12))
    g.add(box(0.05, 0.03, 0.02, lit('#3a2a1e'), 0, 0.075, 0.12), sphere(0.012, lit(accent), 0, 0.33, 0, 6))
  },
  leaf: (g, _fabric, accent) => {
    const leaf = mesh(new THREE.CircleGeometry(0.22, 18), lit(LEAVES[0] ?? '#4f8f3a'), 0, 0.012, 0)
    leaf.rotation.x = -Math.PI / 2
    leaf.scale.set(1, 0.62, 1)
    g.add(leaf, box(0.4, 0.006, 0.012, lit('#3c6f2c'), 0, 0.016, 0))
    for (const x of [-0.1, 0, 0.1]) {
      const vein = box(0.005, 0.005, 0.18, lit('#3c6f2c'), x, 0.016, 0)
      vein.rotation.y = 0.7
      g.add(vein)
    }
    g.add(sphere(0.02, lit(accent), 0.18, 0.02, 0.05, 6))
  },
  straw: (g, _fabric, accent) => {
    const heap = mesh(new THREE.SphereGeometry(0.22, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), lit(C.straw), 0, 0, 0)
    heap.scale.set(1, 0.3, 0.8)
    g.add(heap)
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2
      const s = box(0.12, 0.006, 0.008, lit(i % 2 ? C.strawDark : C.straw), Math.cos(a) * 0.16, 0.03 + (i % 3) * 0.008, Math.sin(a) * 0.13)
      s.rotation.y = a + 0.9
      g.add(s)
    }
    g.add(barZ(0.02, 0.008, lit(accent), 0.2, 0.02, 0.1, 10))
  },
  ice: (g, _fabric, accent) => {
    const floe = mesh(new THREE.CylinderGeometry(0.21, 0.23, 0.05, 7), lit(C.ice), 0, 0.025, 0)
    floe.rotation.y = 0.3
    g.add(floe)
    g.add(mesh(new THREE.DodecahedronGeometry(0.06), lit(C.iceDeep), -0.12, 0.08, -0.1), mesh(new THREE.DodecahedronGeometry(0.035), lit(C.ice), -0.04, 0.07, -0.15))
    g.add(sphere(0.018, lit(accent), 0.15, 0.06, 0.08, 6))
  },
  sand: (g, _fabric, accent) => {
    g.add(box(0.42, 0.05, 0.32, lit(C.wood), 0, 0.025, 0), box(0.38, 0.012, 0.28, lit(C.sand), 0, 0.052, 0))
    for (const [x, z, color] of [[-0.12, 0.06, '#f4d6c8'], [0.1, -0.06, '#ffffff'], [0.05, 0.08, accent]] as [number, number, string][]) {
      const shell = mesh(new THREE.SphereGeometry(0.022, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), lit(color), x, 0.058, z)
      shell.scale.set(1, 0.5, 1.2)
      g.add(shell)
    }
    g.add(cylinder(0.006, 0.006, 0.12, lit('#6b4630'), 0.15, 0.1, -0.1, 4), box(0.05, 0.035, 0.004, lit('#d6263a'), 0.172, 0.14, -0.1))
  },
  lodge: (g, _fabric, accent) => {
    const heap = mesh(new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), lit('#6b4a30'), 0, 0, -0.03)
    heap.scale.set(1.1, 0.6, 0.9)
    g.add(heap)
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI - Math.PI * 0.1
      const log = barX(0.018, 0.26, lit(i % 2 ? C.wood : C.woodDark), Math.cos(a) * 0.08, 0.05 + (i % 3) * 0.035, Math.sin(a) * 0.08 - 0.03, 6)
      log.rotation.y = a
      g.add(log)
    }
    g.add(box(0.08, 0.06, 0.01, lit('#2a1d14'), 0, 0.04, 0.15), sphere(0.015, lit(accent), 0.12, 0.03, 0.14, 6))
  },
}

/** Panier d'un compagnon ; `label` : « espèce|robe ». */
const petBed: Builder = ({ label }) => {
  const [id, coat] = (label ?? '').split('|')
  const species = speciesOf(id) ?? SPECIES[0]
  const g = new THREE.Group()
  homes[species.home](g, CUSHIONS[SPECIES.indexOf(species) % CUSHIONS.length], coatOf(coat).swatch)
  return { solid: g }
}

/** Gamelles, croquettes et eau, sur leur petit tapis. */
const petBowl: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.3, 0.006, 0.16, lit('#c0643f'), 0, 0.003, 0, 0.003))
  for (const [x, color] of [[-0.07, '#d6263a'], [0.07, '#3a7bd5']] as [number, string][]) {
    g.add(cylinder(0.06, 0.045, 0.04, lit(color), x, 0.026, 0, 14), cylinder(0.048, 0.048, 0.004, lit(x < 0 ? '#8a5a2e' : '#8fd4ff'), x, 0.044, 0, 14))
  }
  for (let i = 0; i < 5; i++) g.add(sphere(0.009, lit('#a0703e'), -0.07 + Math.cos(i * 1.3) * 0.02, 0.05, Math.sin(i * 1.3) * 0.02, 5))
  return { solid: g }
}

/** Arbre à chat : poteaux gainés de corde, plateformes moquettées, une niche et une balle. */
const catTree: Builder = () => {
  const g = new THREE.Group()
  const carpet = lit(C.carpet), rope = lit(C.rope)
  g.add(box(0.46, 0.05, 0.42, carpet, 0, 0.025, 0, 0.01))
  g.add(cylinder(0.035, 0.035, 0.5, rope, -0.13, 0.3, -0.1, 10), cylinder(0.035, 0.035, 0.75, rope, 0.13, 0.42, 0.05, 10))
  for (let y = 0.1; y < 0.78; y += 0.05) g.add(cylinder(0.037, 0.037, 0.008, lit('#c4ae80'), 0.13, y, 0.05, 10))
  g.add(box(0.3, 0.035, 0.26, carpet, -0.08, 0.56, -0.06, 0.01), box(0.26, 0.035, 0.24, carpet, 0.1, 0.8, 0.05, 0.01))
  // La niche, sur le bas, avec son trou rond.
  g.add(box(0.22, 0.18, 0.2, carpet, -0.08, 0.14, 0.08, 0.02), barZ(0.05, 0.004, lit('#3a3040'), -0.08, 0.14, 0.181, 14))
  g.add(cylinder(0.003, 0.003, 0.12, lit('#e8ecf0'), 0.05, 0.48, -0.08, 4), sphere(0.025, lit('#d6263a'), 0.05, 0.41, -0.08, 8))
  return { solid: g }
}

/** Niche en bois, toit à deux pans, entrée en arc. */
const dogHouse: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.46, 0.34, 0.44, lit('#b0764a'), 0, 0.17, 0, 0.01))
  for (const side of [-1, 1]) {
    const roof = box(0.3, 0.025, 0.5, lit('#a0282e'), side * 0.12, 0.42, 0)
    roof.rotation.z = side * -0.62
    g.add(roof)
  }
  g.add(box(0.46, 0.012, 0.012, lit('#7a1f22'), 0, 0.5, 0.25))
  // Pignon, sous le toit.
  const gable = new THREE.Shape()
  gable.moveTo(-0.23, 0)
  gable.lineTo(0.23, 0)
  gable.lineTo(0, 0.16)
  gable.closePath()
  for (const z of [0.221, -0.221]) g.add(mesh(new THREE.ShapeGeometry(gable), lit('#b0764a'), 0, 0.34, z).rotateY(z < 0 ? Math.PI : 0))
  g.add(box(0.16, 0.2, 0.01, lit('#2a1d14'), 0, 0.1, 0.221), barZ(0.08, 0.01, lit('#2a1d14'), 0, 0.2, 0.221, 16))
  g.add(box(0.14, 0.04, 0.01, lit('#f1e6cf'), 0, 0.3, 0.228))
  return { solid: g }
}

/** Jouets : une balle, un os, une souris à ressort. */
const petToys: Builder = () => {
  const g = new THREE.Group()
  g.add(sphere(0.035, lit('#d6263a'), -0.06, 0.035, 0.02, 12), box(0.07, 0.006, 0.071, lit('#f4efe2'), -0.06, 0.035, 0.02))
  g.add(barX(0.012, 0.09, lit('#f4efe2'), 0.06, 0.013, -0.02, 8))
  for (const x of [0.015, 0.105]) for (const z of [-0.035, -0.005]) g.add(sphere(0.016, lit('#f4efe2'), x, 0.016, z, 8))
  const mouse = mesh(new THREE.SphereGeometry(0.025, 10, 6), lit('#8a8f99'), 0.04, 0.02, 0.07)
  mouse.scale.set(1.5, 0.8, 1)
  g.add(mouse, sphere(0.01, lit('#e8457c'), 0.005, 0.03, 0.07, 6), cylinder(0.002, 0.002, 0.06, lit('#8a8f99'), 0.1, 0.012, 0.07, 4).rotateZ(Math.PI / 2))
  return { solid: g }
}

/** Griffoir : un poteau de corde sur son socle, et une balle au bout d'un ressort. */
const scratchingPost: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.26, 0.04, 0.26, lit(C.carpet), 0, 0.02, 0, 0.01), cylinder(0.045, 0.045, 0.42, lit(C.rope), 0, 0.25, 0, 12))
  for (let y = 0.06; y < 0.46; y += 0.04) g.add(cylinder(0.047, 0.047, 0.007, lit('#c4ae80'), 0, y, 0, 12))
  g.add(box(0.14, 0.03, 0.14, lit(C.carpet), 0, 0.475, 0, 0.008))
  g.add(cylinder(0.004, 0.004, 0.14, lit(C.steel), 0.05, 0.56, 0, 4), sphere(0.024, lit('#e8b33a'), 0.05, 0.64, 0, 8))
  return { solid: g }
}

/** Bocal à poisson : le poisson-clown du pack, en cubes, fait le tour de son eau. */
const fishBowl: Builder = () => {
  const g = new THREE.Group()
  g.add(cylinder(0.075, 0.085, 0.025, lit('#2a2e36'), 0, 0.0125, 0, 16))
  for (let i = 0; i < 7; i++) g.add(sphere(0.012, lit(['#e8d3a0', '#c9a24a', '#f4efe2'][i % 3]), Math.cos(i) * 0.04, 0.035, Math.sin(i * 1.7) * 0.04, 5))
  g.add(mesh(new THREE.ConeGeometry(0.01, 0.07, 4), lit(LEAVES[2] ?? '#5a9a3a'), -0.035, 0.07, -0.02))
  const live = new THREE.Group()
  live.add(part(new THREE.SphereGeometry(0.1, 18, 12, 0, Math.PI * 2, 0.35, Math.PI - 0.35), glass('#cdeeff', 0.25), 0, 0.115, 0))
  live.add(part(new THREE.SphereGeometry(0.093, 16, 10, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.58), glass('#6fc8ff', 0.3), 0, 0.115, 0))
  const fish = new THREE.Group()
  const body = new THREE.Group()
  body.position.set(0.045, 0, 0)
  body.add(part(new THREE.BoxGeometry(0.035, 0.03, 0.022), lit('#ff7a2a')), part(new THREE.BoxGeometry(0.006, 0.031, 0.023), lit('#ffffff'), 0.005, 0, 0))
  body.add(part(new THREE.BoxGeometry(0.014, 0.024, 0.006), lit('#ff7a2a'), 0, 0, -0.02), part(new THREE.BoxGeometry(0.004, 0.004, 0.004), lit('#17181b'), 0.012, 0.006, 0.012))
  fish.add(body)
  fish.position.y = 0.11
  live.add(fish)
  return {
    solid: g,
    live,
    update: (t) => {
      fish.rotation.y = -t * 0.9
      // Le nez (+x) suit le sens de la ronde.
      body.rotation.y = -Math.PI / 2 + Math.sin(t * 9) * 0.2
      fish.position.y = 0.105 + Math.sin(t * 1.3) * 0.012
    },
  }
}

export const PETS = {
  'pet-bed': petBed,
  'pet-bowl': petBowl,
  'cat-tree': catTree,
  'dog-house': dogHouse,
  'pet-toys': petToys,
  'scratching-post': scratchingPost,
  'fish-bowl': fishBowl,
} satisfies Record<string, Builder>
