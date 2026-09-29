import * as THREE from 'three'
import { box, cylinder, glass, glow, lit, mesh, sphere, type Builder } from './kit'

/*
 * Armurerie des quartiers, pour la décoration seulement (le règlement de bord est formel) :
 * sabres laser croisés, épées et bouclier, katanas sur leur présentoir, armes d'Odyssey au
 * râtelier mural, pistolets sous cloche, armure de chevalier. Un objet accroché est construit
 * dos au mur (origine sur la face du mur, au sol, contenu vers +z), les autres face à +z.
 */

const C = {
  steel: '#b9c1cc',
  steelDark: '#5b626e',
  gunmetal: '#3a3f47',
  black: '#1a1b1f',
  wood: '#7a4e32',
  woodDark: '#4e3121',
  leather: '#5a3322',
  gold: '#d6ac4a',
  plaque: '#2b2320',
  orange: '#ff8a1c',
}

/** Plaque murale de présentation (bois sombre, liseré doré), centrée en (0, y). */
function plaque(g: THREE.Group, w: number, h: number, y: number) {
  g.add(box(w, h, 0.025, lit(C.plaque), 0, y, 0.0125, 0.01), box(w - 0.04, h - 0.04, 0.004, lit('#3a302b'), 0, y, 0.026))
  g.add(box(w - 0.02, 0.008, 0.006, lit(C.gold), 0, y + h / 2 - 0.012, 0.027), box(w - 0.02, 0.008, 0.006, lit(C.gold), 0, y - h / 2 + 0.012, 0.027))
}

/** Pièce tournée d'un angle `a` autour de z, puis posée en (x, y, z). */
function tilted(o: THREE.Object3D, a: number, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  g.rotation.z = a
  g.add(o)
  return g
}

// ---------------------------------------------------------------- sabres laser

/** Couleur de lame des sabres ; `duel` : une bleue, une rouge. */
export const SABER_COLORS: Record<string, [string, string]> = {
  blue: ['#4fb4ff', '#4fb4ff'],
  green: ['#5dff7a', '#5dff7a'],
  red: ['#ff3b3b', '#ff3b3b'],
  purple: ['#c47dff', '#c47dff'],
  duel: ['#4fb4ff', '#ff3b3b'],
}

/** Sabre laser couché le long de x : poignée en -x, lame lumineuse vers +x (longueur totale ~0,55). */
function saber(color: string): THREE.Group {
  const g = new THREE.Group()
  const hilt = cylinder(0.017, 0.017, 0.13, lit(C.steel), -0.2, 0, 0, 10)
  hilt.rotation.z = Math.PI / 2
  g.add(hilt)
  for (const x of [-0.24, -0.22, -0.2, -0.18]) {
    const ring = cylinder(0.019, 0.019, 0.008, lit(C.black), x, 0, 0, 10)
    ring.rotation.z = Math.PI / 2
    g.add(ring)
  }
  const emitter = cylinder(0.02, 0.017, 0.025, lit(C.steelDark), -0.125, 0, 0, 10)
  emitter.rotation.z = Math.PI / 2
  g.add(emitter, box(0.012, 0.01, 0.008, glow('#ff3b2f'), -0.19, 0.018, 0))
  const blade = cylinder(0.009, 0.011, 0.42, glow('#ffffff'), 0.1, 0, 0, 8)
  blade.rotation.z = Math.PI / 2
  const halo = cylinder(0.016, 0.018, 0.42, glow(color), 0.1, 0, -0.003, 8)
  halo.rotation.z = Math.PI / 2
  g.add(blade, halo)
  return g
}

/** Deux sabres laser croisés sur une plaque. Lames : `label` (cf. SABER_COLORS). */
const saberDisplay: Builder = ({ label }) => {
  const [a, b] = SABER_COLORS[label ?? ''] ?? SABER_COLORS.blue
  const g = new THREE.Group()
  plaque(g, 0.6, 0.34, 0.6)
  g.add(tilted(saber(a), 0.42, 0, 0.6, 0.05), tilted(saber(b), Math.PI - 0.42, 0, 0.6, 0.07))
  // Crochets de laiton.
  for (const [x, y] of [[-0.14, 0.53], [0.14, 0.53], [-0.14, 0.67], [0.14, 0.67]]) g.add(cylinder(0.007, 0.007, 0.06, lit(C.gold), x, y, 0.05, 6).rotateX(Math.PI / 2))
  return { solid: g }
}

// ---------------------------------------------------------------- épées et bouclier

/** Épée longue le long de +y (garde en 0, lame vers le haut). */
function sword(len = 0.5, curved = false): THREE.Group {
  const g = new THREE.Group()
  const steel = lit(C.steel)
  if (curved) {
    // Sabre d'abordage : une lame courbe, extrudée.
    const s = new THREE.Shape()
    s.moveTo(-0.018, 0)
    s.quadraticCurveTo(-0.02, len * 0.6, 0.03, len)
    s.quadraticCurveTo(0.02, len * 0.55, 0.018, 0)
    s.closePath()
    const blade = mesh(new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: false }), steel, 0, 0.02, -0.003)
    g.add(blade, box(0.07, 0.012, 0.02, lit(C.gold), 0, 0.012, 0))
    const bow = mesh(new THREE.TorusGeometry(0.035, 0.005, 5, 12, Math.PI), lit(C.gold), 0, -0.02, 0)
    bow.rotation.z = Math.PI / 2
    g.add(bow)
  } else {
    g.add(box(0.034, len, 0.008, steel, 0, 0.02 + len / 2, 0), box(0.008, len - 0.04, 0.009, lit(C.steelDark), 0, 0.02 + len / 2 - 0.02, 0))
    const tip = mesh(new THREE.ConeGeometry(0.024, 0.06, 4), steel, 0, 0.02 + len + 0.03, 0)
    tip.scale.z = 0.3
    tip.rotation.y = Math.PI / 4
    g.add(tip, box(0.13, 0.02, 0.025, lit(C.gold), 0, 0.012, 0, 0.004))
  }
  g.add(cylinder(0.013, 0.013, 0.1, lit(C.leather), 0, -0.05, 0, 8), sphere(0.02, lit(C.gold), 0, -0.105, 0, 8))
  return g
}

/** Hache viking le long de +y : manche, fer en demi-lune en haut. */
function axe(): THREE.Group {
  const g = new THREE.Group()
  g.add(cylinder(0.012, 0.014, 0.5, lit(C.wood), 0, 0.25, 0, 8))
  const s = new THREE.Shape()
  s.moveTo(0, 0)
  s.lineTo(0.05, 0.02)
  s.quadraticCurveTo(0.12, -0.02, 0.1, -0.1)
  s.quadraticCurveTo(0.08, -0.05, 0.03, -0.06)
  s.lineTo(0, -0.04)
  s.closePath()
  g.add(mesh(new THREE.ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: false }), lit(C.steel), 0.005, 0.48, -0.005))
  return g
}

/** Écu de chevalier (pointe en bas), aux couleurs `field` et `cross`. */
function heater(field: string, cross: string): THREE.Group {
  const g = new THREE.Group()
  const s = new THREE.Shape()
  s.moveTo(-0.12, 0.12)
  s.lineTo(0.12, 0.12)
  s.lineTo(0.12, 0)
  s.quadraticCurveTo(0.11, -0.12, 0, -0.18)
  s.quadraticCurveTo(-0.11, -0.12, -0.12, 0)
  s.closePath()
  g.add(mesh(new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.006, bevelSegments: 1 }), lit(field)))
  g.add(box(0.045, 0.26, 0.006, lit(cross), 0, -0.02, 0.029), box(0.2, 0.045, 0.006, lit(cross), 0, 0.04, 0.029))
  return g
}

/** Bouclier rond à ombon (viking). */
function roundShield(): THREE.Group {
  const g = new THREE.Group()
  const disc = cylinder(0.17, 0.17, 0.02, lit('#9b3a2a'), 0, 0, 0.01, 24)
  disc.rotation.x = Math.PI / 2
  const rim = mesh(new THREE.TorusGeometry(0.17, 0.01, 6, 28), lit(C.steelDark), 0, 0, 0.012)
  g.add(disc, rim, sphere(0.045, lit(C.steel), 0, 0, 0.022, 12))
  for (let i = 0; i < 4; i++) g.add(box(0.012, 0.32, 0.004, lit('#d9c7a0'), 0, 0, 0.021).rotateZ((i * Math.PI) / 4))
  return g
}

/** Trophées de mur : épées et écu (knight), haches et bouclier rond (viking), sabres et pavillon (pirate). */
const swordDisplay: Builder = ({ label }) => {
  const g = new THREE.Group()
  const y = 0.58
  if (label === 'viking') {
    g.add(tilted(axe(), 0.5, 0.12, y - 0.25, 0.02), tilted(axe(), -0.5, -0.12, y - 0.25, 0.02))
    const shield = roundShield()
    shield.position.set(0, y, 0.03)
    g.add(shield)
  } else if (label === 'pirate') {
    // Pavillon noir à tête de mort, et deux sabres d'abordage croisés devant.
    g.add(box(0.46, 0.3, 0.008, lit(C.black), 0, y + 0.05, 0.006))
    g.add(sphere(0.055, lit('#efe8d8'), 0, y + 0.09, 0.012, 12), box(0.06, 0.035, 0.012, lit('#efe8d8'), 0, y + 0.04, 0.012))
    for (const x of [-0.02, 0.02]) g.add(sphere(0.014, lit(C.black), x, y + 0.095, 0.06, 6))
    for (const a of [0.7, -0.7]) g.add(box(0.2, 0.025, 0.006, lit('#efe8d8'), 0, y - 0.03, 0.014).rotateZ(a))
    g.add(tilted(sword(0.42, true), 0.55, 0.13, y - 0.22, 0.03), tilted(sword(0.42, true).rotateY(Math.PI), -0.55, -0.13, y - 0.22, 0.04))
  } else {
    g.add(tilted(sword(0.44), 0.6, 0.15, y - 0.24, 0.02), tilted(sword(0.44), -0.6, -0.15, y - 0.24, 0.03))
    const shield = heater('#2a4f9a', '#e9e2cf')
    shield.position.set(0, y + 0.02, 0.035)
    g.add(shield)
  }
  return { solid: g }
}

// ---------------------------------------------------------------- katanas

/** Katana couché le long de x : poignée en -x, fourreau laqué `lacquer` vers +x, légèrement courbe. */
function katana(len: number, lacquer: string): THREE.Group {
  const g = new THREE.Group()
  const s = new THREE.Shape()
  s.moveTo(0, -0.011)
  s.quadraticCurveTo(len * 0.5, -0.011 + 0.012, len, 0.004)
  s.lineTo(len, 0.026)
  s.quadraticCurveTo(len * 0.5, 0.013 + 0.012, 0, 0.013)
  s.closePath()
  g.add(mesh(new THREE.ExtrudeGeometry(s, { depth: 0.018, bevelEnabled: false }), lit(lacquer), 0, 0, -0.009))
  const tsuba = cylinder(0.024, 0.024, 0.006, lit(C.gold), -0.004, 0.001, 0, 12)
  tsuba.rotation.z = Math.PI / 2
  const grip = cylinder(0.011, 0.012, len * 0.3, lit('#ece4d2'), -len * 0.15 - 0.008, 0.001, 0, 8)
  grip.rotation.z = Math.PI / 2
  g.add(tsuba, grip)
  // Tressage du manche : losanges sombres.
  for (let i = 0; i < 5; i++) g.add(box(0.012, 0.024, 0.024, lit(C.black), -0.03 - i * len * 0.05, 0.001, 0).rotateX(Math.PI / 4))
  return g
}

/** Présentoir laqué à deux katanas (le long, le court). Laque : `label` (black, red). */
const katanaStand: Builder = ({ label }) => {
  const lacquer = label === 'red' ? '#8e1f1c' : '#15151a'
  const g = new THREE.Group()
  const base = lit(lacquer), gold = lit(C.gold)
  g.add(box(0.36, 0.025, 0.11, base, 0, 0.0125, 0, 0.006), box(0.36, 0.004, 0.11, gold, 0, 0.027, 0))
  for (const x of [-0.12, 0.12]) {
    g.add(box(0.025, 0.2, 0.06, base, x, 0.12, 0, 0.004))
    for (const y of [0.1, 0.19]) g.add(box(0.03, 0.012, 0.03, gold, x, y, 0.025))
  }
  const long = katana(0.4, lacquer === '#15151a' ? '#1d1d24' : '#6e1614')
  long.position.set(-0.16, 0.2, 0.035)
  const short = katana(0.28, lacquer === '#15151a' ? '#1d1d24' : '#6e1614')
  short.position.set(-0.1, 0.11, 0.035)
  g.add(long, short)
  return { solid: g }
}

// ---------------------------------------------------------------- armes d'Odyssey

/** Fusil couché le long de x, canon vers +x, crosse vers -x (longueur ~0,5) ; `kind` : son modèle. */
function rifle(kind: string): THREE.Group {
  const g = new THREE.Group()
  const dark = lit(C.gunmetal), black = lit(C.black)
  if (kind === 'karma-l6') {
    // Karma L-6 : un lance-roquettes, gros tube cerclé d'orange.
    const tube = cylinder(0.042, 0.042, 0.52, lit('#4b5058'), 0, 0.02, 0, 14)
    tube.rotation.z = Math.PI / 2
    g.add(tube)
    for (const x of [-0.22, 0.2]) g.add(cylinder(0.046, 0.046, 0.03, lit(C.orange), x, 0.02, 0, 14).rotateZ(Math.PI / 2))
    g.add(box(0.03, 0.07, 0.025, black, -0.05, -0.04, 0), box(0.1, 0.03, 0.03, dark, 0.02, 0.07, 0), box(0.02, 0.015, 0.01, glow('#ff3b2f'), 0.07, 0.086, 0))
  } else if (kind === 'manticore-executioner') {
    // Manticore Executioner : fusil de précision à plasma, long et sombre, bobines violettes.
    g.add(box(0.36, 0.05, 0.035, lit('#2c2436'), -0.02, 0.02, 0, 0.01), box(0.12, 0.06, 0.03, lit('#2c2436'), -0.26, 0.0, 0, 0.012))
    const barrel = cylinder(0.012, 0.012, 0.28, dark, 0.26, 0.03, 0, 8)
    barrel.rotation.z = Math.PI / 2
    g.add(barrel)
    for (const x of [0.2, 0.26, 0.32]) g.add(mesh(new THREE.TorusGeometry(0.02, 0.006, 6, 12), glow('#c47dff'), x, 0.03, 0).rotateY(Math.PI / 2))
    const scope = cylinder(0.016, 0.016, 0.14, black, 0.0, 0.075, 0, 10)
    scope.rotation.z = Math.PI / 2
    g.add(scope, box(0.03, 0.08, 0.025, black, -0.08, -0.04, 0))
  } else if (kind === 'tk-aphelion') {
    // Takada Aphelion : fusil laser, blanc et lisse, filets lumineux bleus.
    const white = lit('#eef1f4')
    g.add(box(0.42, 0.06, 0.04, white, 0, 0.02, 0, 0.025), box(0.14, 0.05, 0.03, white, -0.26, 0.005, 0, 0.02))
    g.add(box(0.36, 0.008, 0.042, glow('#59d8ff'), 0.02, 0.03, 0), box(0.02, 0.02, 0.02, glow('#59d8ff'), 0.22, 0.02, 0))
    g.add(box(0.03, 0.07, 0.025, lit('#8a93a0'), -0.06, -0.035, 0, 0.008))
  } else {
    // Karma AR-50 : fusil d'assaut cinétique, gris acier et orange, chargeur et lunette.
    g.add(box(0.3, 0.06, 0.035, dark, 0, 0.02, 0, 0.008), box(0.14, 0.05, 0.03, dark, -0.23, 0.005, 0, 0.01))
    const barrel = cylinder(0.011, 0.011, 0.18, black, 0.23, 0.03, 0, 8)
    barrel.rotation.z = Math.PI / 2
    g.add(barrel, box(0.04, 0.09, 0.028, lit(C.orange), 0.04, -0.05, 0), box(0.03, 0.07, 0.025, black, -0.08, -0.035, 0))
    const scope = cylinder(0.013, 0.013, 0.1, black, 0, 0.068, 0, 10)
    scope.rotation.z = Math.PI / 2
    g.add(scope, box(0.3, 0.006, 0.037, lit(C.orange), 0, 0.045, 0))
  }
  return g
}

export const ODYSSEY_GUNS = ['karma-ar50', 'karma-l6', 'manticore-executioner', 'tk-aphelion'] as const

/** Arme d'Odyssey sur son râtelier mural. Modèle : `label` (cf. ODYSSEY_GUNS). */
const odysseyRack: Builder = ({ label }) => {
  const g = new THREE.Group()
  const plate = lit('#2e333b')
  g.add(box(0.64, 0.22, 0.02, plate, 0, 0.6, 0.01, 0.01), box(0.6, 0.012, 0.004, lit(C.orange), 0, 0.51, 0.021))
  for (const x of [-0.18, 0.18]) g.add(box(0.03, 0.03, 0.07, lit(C.black), x, 0.555, 0.045))
  const gun = rifle(label ?? 'karma-ar50')
  gun.position.set(0, 0.6, 0.06)
  g.add(gun)
  return { solid: g }
}

/** Râtelier au sol : trois fusils debout, une caisse de munitions au pied. */
const weaponRack: Builder = () => {
  const g = new THREE.Group()
  const frame = lit(C.gunmetal)
  g.add(box(0.7, 0.05, 0.26, frame, 0, 0.025, 0, 0.01), box(0.7, 0.04, 0.05, frame, 0, 0.62, -0.08, 0.01))
  for (const x of [-0.33, 0.33]) g.add(box(0.04, 0.62, 0.05, frame, x, 0.33, -0.08))
  ODYSSEY_GUNS.filter((k) => k !== 'karma-l6').forEach((kind, i) => {
    const gun = rifle(kind)
    gun.rotation.z = Math.PI / 2
    gun.position.set(-0.2 + i * 0.2, 0.33, -0.03)
    g.add(gun)
  })
  g.add(box(0.2, 0.1, 0.12, lit('#3d4a2e'), 0.18, 0.1, 0.06, 0.01), box(0.2, 0.012, 0.02, lit(C.orange), 0.18, 0.12, 0.121))
  return { solid: g }
}

// ---------------------------------------------------------------- pistolets

/** Pistolet couché le long de x, canon vers +x : blaster, Manticore Tormentor ou Takada Zenith. */
function pistol(kind: string): THREE.Group {
  const g = new THREE.Group()
  const black = lit(C.black)
  if (kind === 'tormentor') {
    g.add(box(0.14, 0.035, 0.022, lit('#2c2436'), 0, 0.02, 0, 0.008), box(0.03, 0.06, 0.02, black, -0.04, -0.02, 0, 0.006))
    g.add(mesh(new THREE.TorusGeometry(0.014, 0.004, 6, 12), glow('#c47dff'), 0.05, 0.02, 0).rotateY(Math.PI / 2))
  } else if (kind === 'zenith') {
    g.add(box(0.14, 0.04, 0.024, lit('#eef1f4'), 0, 0.02, 0, 0.014), box(0.12, 0.006, 0.026, glow('#59d8ff'), 0.005, 0.03, 0))
    g.add(box(0.03, 0.06, 0.02, lit('#8a93a0'), -0.04, -0.02, 0, 0.006))
  } else {
    // Blaster de contrebandier : canon cannelé, lunette, cache-flamme.
    const barrel = cylinder(0.012, 0.012, 0.15, lit(C.gunmetal), 0.03, 0.025, 0, 10)
    barrel.rotation.z = Math.PI / 2
    g.add(barrel, box(0.07, 0.035, 0.024, black, -0.02, 0.02, 0, 0.006), box(0.03, 0.065, 0.02, lit(C.leather), -0.045, -0.02, 0, 0.006))
    const scope = cylinder(0.007, 0.007, 0.06, black, -0.01, 0.055, 0, 8)
    scope.rotation.z = Math.PI / 2
    g.add(scope, cylinder(0.016, 0.014, 0.02, lit(C.steelDark), 0.1, 0.025, 0, 8).rotateZ(Math.PI / 2))
  }
  return g
}

/** Pistolet de collection sur un socle, sous une cloche de verre. Modèle : `label`. */
const blasterStand: Builder = ({ label }) => {
  const g = new THREE.Group()
  g.add(cylinder(0.1, 0.11, 0.03, lit(C.woodDark), 0, 0.015, 0, 20), cylinder(0.103, 0.103, 0.006, lit(C.gold), 0, 0.033, 0, 20))
  g.add(box(0.02, 0.06, 0.02, lit(C.gold), 0, 0.066, 0))
  const gun = pistol(label ?? 'blaster')
  gun.position.set(0, 0.11, 0)
  gun.rotation.set(0, -0.6, 0.15)
  g.add(gun)
  const live = new THREE.Group()
  live.add(mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.16, 20, 1, true), glass('#dff4ff', 0.18), 0, 0.116, 0), mesh(new THREE.SphereGeometry(0.095, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass('#dff4ff', 0.18), 0, 0.196, 0))
  return { solid: g, live }
}

// ---------------------------------------------------------------- armure

/** Métal de l'armure : acier (défaut), or, noir. */
export const ARMOR_METALS: Record<string, [string, string]> = { steel: ['#c7ced8', '#8f98a6'], gold: ['#e3bb5a', '#a88430'], black: ['#3a3d44', '#23252a'] }

/** Armure de chevalier sur son mannequin, une épée plantée devant elle. Métal : `label`. */
const armorStand: Builder = ({ label }) => {
  const [light, dark] = ARMOR_METALS[label ?? ''] ?? ARMOR_METALS.steel
  const g = new THREE.Group()
  const m = lit(light), d = lit(dark), wood = lit(C.woodDark)
  g.add(cylinder(0.16, 0.18, 0.04, wood, 0, 0.02, 0, 16), cylinder(0.015, 0.015, 0.2, wood, 0, 0.12, 0, 6))
  // Jambes, cuissots, solerets.
  for (const x of [-0.055, 0.055]) {
    g.add(cylinder(0.034, 0.03, 0.22, m, x, 0.17, 0, 10), sphere(0.036, d, x, 0.27, 0.01, 10), cylinder(0.042, 0.036, 0.14, m, x, 0.35, 0, 10))
    g.add(box(0.06, 0.03, 0.1, d, x, 0.055, 0.02, 0.012))
  }
  // Tassettes, plastron, épaulières, bras.
  g.add(cylinder(0.1, 0.11, 0.08, d, 0, 0.44, 0, 12))
  const chest = sphere(0.12, m, 0, 0.56, 0, 14)
  chest.scale.set(1, 1.1, 0.75)
  g.add(chest, box(0.012, 0.16, 0.01, d, 0, 0.56, 0.088))
  for (const s of [-1, 1]) {
    g.add(sphere(0.055, d, s * 0.13, 0.64, 0, 10))
    const arm = cylinder(0.028, 0.024, 0.22, m, s * 0.15, 0.52, 0.02, 8)
    arm.rotation.z = s * 0.12
    g.add(arm, sphere(0.03, d, s * 0.165, 0.4, 0.04, 8))
  }
  // Heaume : un cylindre bombé, sa visière fendue, un plumet.
  g.add(cylinder(0.022, 0.03, 0.04, d, 0, 0.69, 0, 8))
  const helm = sphere(0.07, m, 0, 0.76, 0, 14)
  helm.scale.set(0.9, 1.1, 1)
  g.add(helm, box(0.1, 0.012, 0.03, lit(C.black), 0, 0.765, 0.058), box(0.02, 0.08, 0.02, d, 0, 0.74, 0.066))
  g.add(sphere(0.03, lit('#b8322a'), 0, 0.86, -0.02, 8))
  // L'épée, pointe au sol, mains du mannequin sur le pommeau.
  const sw = new THREE.Group()
  sw.add(box(0.03, 0.34, 0.006, lit('#d6dce4'), 0, 0.17, 0), box(0.11, 0.016, 0.02, d, 0, 0.35, 0), cylinder(0.01, 0.01, 0.07, lit(C.leather), 0, 0.395, 0, 6))
  sw.position.set(0, 0.03, 0.12)
  g.add(sw)
  return { solid: g }
}

export const ARMORY = {
  'saber-display': saberDisplay,
  'sword-display': swordDisplay,
  'katana-stand': katanaStand,
  'odyssey-rack': odysseyRack,
  'weapon-rack': weaponRack,
  'blaster-stand': blasterStand,
  'armor-stand': armorStand,
} satisfies Record<string, Builder>
