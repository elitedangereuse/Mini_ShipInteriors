import * as THREE from 'three'
import {
  animatedScreen, barX, barZ, beamMaterial, box, cylinder, decal, drawnTexture, ED_ORANGE, glass, glow, hazardTexture, lineMaterial, lit, mesh, part,
  sphere, type Builder,
} from './kit'
import { tr } from '../i18n'

/*
 * Le hangar de la cale, au bout du lobby de la zone thargoïde : un Krait Mk II de Faulcon DeLacy
 * posé sur son pad, face au bouclier qui ferme le hangar sur l'espace (cf. `shield` dans
 * levels.ts). Autour : l'escabeau d'embarquement (on monte au cockpit), la station de
 * ravitaillement, le pupitre de contrôle du hangar, le chariot à outils et les étagères de pièces
 * de Nico, le mécano (cf. src/mechanic.ts), les cales du train et un propulseur de rechange sur
 * son support. Blanc cassé, gris anthracite, orange d'Elite et jaune de chantier.
 */

const C = {
  hull: '#e6e4de',
  hullShade: '#d2d0ca',
  panel: '#34373d',
  ridge: '#4a4e56',
  belly: '#4a4f57',
  edge: '#80868f',
  dark: '#23262b',
  hazard: '#e9a917',
  black: '#17181b',
  red: '#b3322a',
  chrome: '#9aa3ad',
  rubber: '#1d1e21',
  glass: '#8fd8ff',
  thruster: '#8fd0ff',
}

// ---------------------------------------------------------------- Krait Mk II

/** Section du fuselage à une abscisse `z` : demi-profil [x, dessus, dessous], du centre vers le bord. */
interface Section {
  z: number
  pts: [number, number, number][]
}

type Face = 'top' | 'bottom' | 'edge' | 'cap'

/**
 * Coque en facettes, symétrique (miroir en x autour de `cx`), tendue entre des sections
 * successives : dessus, dessous, bord extérieur et deux fonds. `paint` donne la couleur de chaque
 * bande (j : de la bande centrale vers le bord). Chaque face est tournée vers l'extérieur.
 */
function loft(sections: Section[], paint: (face: Face, j: number) => string, cx = 0): THREE.Mesh[] {
  const buckets = new Map<string, number[]>()
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3()
  const tri = (color: string, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, want: THREE.Vector3) => {
    n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a))
    if (n.lengthSq() < 1e-12) return
    if (n.dot(want) < 0) [b, c] = [c, b]
    const list = buckets.get(color) ?? []
    list.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
    buckets.set(color, list)
  }
  const quad = (color: string, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, want: THREE.Vector3) => {
    tri(color, a, b, c, want)
    tri(color, a, c, d, want)
  }
  const up = new THREE.Vector3(0, 1, 0), down = new THREE.Vector3(0, -1, 0)
  const front = new THREE.Vector3(0, 0, 1), back = new THREE.Vector3(0, 0, -1)
  const last = sections.length - 1
  for (const s of [1, -1]) {
    const side = new THREE.Vector3(s, 0, 0)
    const P = (i: number, j: number, top: boolean) => {
      const [x, t, b] = sections[i].pts[j]
      return new THREE.Vector3(cx + s * x, top ? t : b, sections[i].z)
    }
    const m = sections[0].pts.length - 1
    for (let i = 0; i < last; i++) {
      for (let j = 0; j < m; j++) {
        quad(paint('top', j), P(i, j, true), P(i, j + 1, true), P(i + 1, j + 1, true), P(i + 1, j, true), up)
        quad(paint('bottom', j), P(i, j, false), P(i, j + 1, false), P(i + 1, j + 1, false), P(i + 1, j, false), down)
      }
      quad(paint('edge', m), P(i, m, true), P(i + 1, m, true), P(i + 1, m, false), P(i, m, false), side)
    }
    for (let j = 0; j < m; j++) {
      quad(paint('cap', j), P(last, j, true), P(last, j + 1, true), P(last, j + 1, false), P(last, j, false), front)
      quad(paint('cap', j), P(0, j, true), P(0, j + 1, true), P(0, j + 1, false), P(0, j, false), back)
    }
    // Les fonds se referment aussi sur le bord extérieur.
    quad(paint('cap', m), P(last, m, true), P(last, m, false), P(last, m - 1, false), P(last, m - 1, true), front)
  }
  return [...buckets].map(([color, pos]) => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.computeVertexNormals()
    return mesh(g, lit(color))
  })
}

/** Hauteur du ventre du Krait au-dessus du pont : celle de son train d'atterrissage. */
export const KRAIT_GEAR = 0.34

/**
 * Le cockpit : où s'assoit le pilote (repère du Krait, nez vers +z), et la hauteur de l'assise
 * au-dessus du pont (cf. l'escabeau, `krait-ladder`, qui y fait monter).
 */
export const KRAIT_PILOT = { z: 2.05, y: KRAIT_GEAR + 0.3 }

/** L'escabeau se tient à cette distance devant le siège du pilote (cf. levels.ts et SEATS). */
export const KRAIT_LADDER_REACH = 1.7

/**
 * Chemin du cockpit, dans le repère de l'escabeau ([x, hauteur, z], le Krait vers +z) : le pied des
 * marches, les cinq marches (le dessus de chacune, cf. kraitLadder), la plateforme, puis le nez du
 * Krait, qui remonte vers la verrière (le dessus de la coque, cf. BODY). Le siège est au bout.
 */
export const KRAIT_CLIMB: [number, number, number][] = [
  [0, 0, -0.6],
  ...[0, 1, 2, 3, 4].map((i) => [0, 0.155 + i * 0.085, -0.42 + i * 0.12] as [number, number, number]),
  [0, 0.57, 0.22],
  [0, 0.62, 0.6],
  [0, 0.74, 1.15],
]

/**
 * Puissance des propulseurs du Krait (0 : au repos ; 0,3 : quelqu'un est aux commandes, les
 * tuyères s'éveillent ; 1 : réacteurs en route, pleine poussée ; cf.
 * src/hangar.ts, qui la règle).
 */
export const kraitPower = { value: 0 }
/**
 * Le Krait de la base au sol (variante « base », cf. src/base/) : ses tuyères ont leur propre
 * consigne (cf. src/base/client.ts), celle du hangar ne le réveille pas.
 */
export const baseKraitPower = { value: 0 }

/**
 * Corps : un delta très plat, aussi large que long, le nez en pointe et les bouts d'ailes loin
 * à l'arrière. Au milieu, une tranchée sombre ; plus loin, les ailes blanches, bord d'attaque
 * sombre (le bord d'attaque va du nez, z = 3,2, au bout d'aile, x = 3, z = -2).
 */
const BODY: Section[] = [
  { z: -2.6, pts: [[0, 0.6, 0.2], [0.34, 0.6, 0.2], [1.0, 0.5, 0.18], [1.8, 0.34, 0.2], [2.75, 0.24, 0.21]] },
  { z: -2.0, pts: [[0, 0.64, 0.12], [0.34, 0.64, 0.12], [1.0, 0.52, 0.1], [1.9, 0.36, 0.14], [3.0, 0.24, 0.21]] },
  { z: -0.6, pts: [[0, 0.64, 0.08], [0.34, 0.64, 0.08], [1.0, 0.52, 0.07], [1.7, 0.38, 0.12], [2.19, 0.25, 0.19]] },
  { z: 1.0, pts: [[0, 0.58, 0.1], [0.3, 0.58, 0.1], [0.8, 0.47, 0.1], [1.1, 0.35, 0.14], [1.27, 0.25, 0.19]] },
  { z: 2.4, pts: [[0, 0.44, 0.16], [0.12, 0.44, 0.16], [0.3, 0.37, 0.17], [0.4, 0.31, 0.19], [0.46, 0.25, 0.21]] },
  { z: 3.2, pts: [[0, 0.26, 0.22], [0.01, 0.26, 0.22], [0.02, 0.25, 0.22], [0.03, 0.24, 0.22], [0.04, 0.23, 0.22]] },
]

/**
 * Les deux arêtes dorsales, de part et d'autre de la tranchée : elles partent des blocs moteurs
 * et plongent vers le nez, où elles encadrent la verrière (centrées sur x = ±0,62).
 */
const RIDGE: Section[] = [
  { z: -2.6, pts: [[0, 0.98, 0.5], [0.27, 0.9, 0.5]] },
  { z: -0.4, pts: [[0, 0.9, 0.5], [0.25, 0.83, 0.5]] },
  { z: 1.2, pts: [[0, 0.74, 0.46], [0.19, 0.68, 0.46]] },
  { z: 1.95, pts: [[0, 0.56, 0.42], [0.08, 0.53, 0.42]] },
]

/** Jambe de train : fût, vérin, patin au sol (repère du Krait posé sur son train). */
function gearLeg(g: THREE.Group, x: number, z: number, big: boolean) {
  const h = KRAIT_GEAR + 0.12
  const r = big ? 0.05 : 0.04
  g.add(box(big ? 0.34 : 0.26, 0.04, big ? 0.24 : 0.2, lit(C.dark), x, 0.02, z, 0.01))
  g.add(cylinder(r, r, h, lit(C.chrome, 'metal'), x, h / 2 + 0.02, z, 10))
  g.add(cylinder(r * 1.6, r * 1.6, h * 0.4, lit(C.dark), x, h * 0.72, z, 10))
  const brace = box(0.03, h * 0.9, 0.03, lit(C.hazard), x, h * 0.5, z - 0.1)
  brace.rotation.x = 0.35
  g.add(brace)
  // Trappe ouverte du logement du train.
  const door = box(0.02, 0.18, big ? 0.34 : 0.26, lit(C.belly), x + (x >= 0 ? 0.16 : -0.16), KRAIT_GEAR + 0.05, z)
  door.rotation.z = x >= 0 ? 0.25 : -0.25
  g.add(door)
}

/** Tuyères : sur l'arrière des deux blocs moteurs, et deux plus petites sous les ailes (x, y, rayon). */
const NOZZLES = [[0.62, 0.74, 0.2], [-0.62, 0.74, 0.2], [1.55, 0.3, 0.12], [-1.55, 0.3, 0.12]] as const
/** Arrière des blocs moteurs (et des tuyères). */
const STERN = -2.98

/**
 * Krait Mk II de Faulcon DeLacy (nez vers +z), sur son train : delta blanc très plat, deux
 * arêtes dorsales sombres qui mènent aux deux gros blocs moteurs, bouts d'ailes sombres et
 * leurs antennes, verrière du cockpit entre les arêtes, à l'avant. Feux de navigation (rouge à
 * bâbord, vert à tribord), gyrophare dorsal. Au repos, les tuyères couvent ; quelqu'un aux
 * commandes (cf. `kraitPower`), elles s'allument.
 */
const krait: Builder = ({ label }) => {
  const source = label === 'base' ? baseKraitPower : kraitPower
  const g = new THREE.Group()
  const ship = new THREE.Group()
  ship.position.y = KRAIT_GEAR
  g.add(ship)
  ship.add(...loft(BODY, (face, j) => {
    if (face === 'top') return j === 0 ? C.panel : j === 2 ? C.hullShade : C.hull
    return face === 'bottom' ? C.belly : face === 'edge' ? C.dark : C.panel
  }))
  for (const s of [1, -1]) ship.add(...loft(RIDGE, (face) => (face === 'top' ? C.ridge : C.dark), s * 0.62))

  // Blocs moteurs au bout des arêtes : un gros caisson, sa marche, et la tuyère derrière.
  for (const s of [1, -1]) {
    ship.add(box(0.6, 0.62, 0.8, lit(C.dark), s * 0.62, 0.72, -2.58, 0.03))
    ship.add(box(0.5, 0.06, 0.6, lit(C.ridge), s * 0.62, 1.05, -2.62, 0.02))
    const cowl = box(0.56, 0.3, 0.3, lit(C.dark), s * 0.62, 0.86, -2.12)
    cowl.rotation.x = -0.6
    ship.add(cowl)
  }
  for (const [x, y, r] of NOZZLES) {
    const housing = cylinder(r * 1.2, r * 1.3, 0.2, lit(C.black), x, y, STERN + 0.06, 16)
    housing.rotation.x = Math.PI / 2
    ship.add(housing, mesh(new THREE.TorusGeometry(r * 1.12, 0.022, 6, 20), lit(C.chrome, 'metal'), x, y, STERN - 0.04))
  }
  // Dans la tranchée : des caissons et des conduits, sombres.
  for (let i = 0; i < 5; i++) ship.add(box(0.36, 0.05, 0.28, lit(i % 2 ? C.dark : C.edge), 0, 0.66, -2.2 + i * 0.62, 0.01))
  for (const s of [1, -1]) ship.add(barZ(0.025, 3.4, lit(C.black), s * 0.2, 0.68, -0.8, 6))
  // Bouts d'ailes : caissons sombres, feu bleu, et une antenne double qui part du bout de l'aile
  // droit vers l'avant, parallèle à l'axe du vaisseau (et à celle de l'autre aile).
  for (const s of [1, -1]) {
    const tip = box(0.55, 0.14, 0.95, lit(C.dark), s * 2.62, 0.25, -2.12, 0.02)
    tip.rotation.y = s * -0.52
    ship.add(tip, sphere(0.035, glow('#7fd8ff'), s * 2.45, 0.33, -1.8, 8))
    const antenna = new THREE.Group()
    antenna.position.set(s * 2.93, 0.27, -2.08)
    antenna.add(box(0.1, 0.06, 0.14, lit(C.dark), 0, 0, 0.02))
    for (const o of [-0.03, 0.03]) antenna.add(barZ(0.012, 0.9, lit(C.chrome, 'metal'), o, 0.01, 0.5, 5))
    for (const z of [0.35, 0.7]) antenna.add(box(0.07, 0.012, 0.012, lit(C.chrome, 'metal'), 0, 0.01, z))
    antenna.add(sphere(0.018, glow('#7fd8ff'), 0, 0.01, 0.96, 6))
    ship.add(antenna)
    // Capteurs ronds sur le bord d'attaque, et quelques panneaux sombres sur l'aile.
    ship.add(sphere(0.045, glow('#7fd8ff'), s * 1.35, 0.3, 0.3, 8))
    for (const [x, z, w, d] of [[1.45, -1.6, 0.5, 0.3], [2.1, -2.2, 0.35, 0.25], [1.2, -0.3, 0.3, 0.4]] as const) {
      const y = 0.52 - (x - 1) * 0.2 + 0.012
      ship.add(box(w, 0.012, d, lit(C.edge), s * x, y, z))
    }
  }
  // Canons sous les ailes.
  for (const [x, z] of [[1.0, 1.0], [-1.0, 1.0], [2.0, -0.9], [-2.0, -0.9]] as const) {
    ship.add(box(0.16, 0.1, 0.36, lit(C.dark), x, 0.06, z - 0.1, 0.02), barZ(0.03, 0.4, lit(C.chrome, 'metal'), x, 0.06, z + 0.25, 8))
  }
  // Cockpit, entre les arêtes : siège, tableau de bord, manches (la verrière est dans `live`).
  ship.add(box(0.34, 0.08, 0.3, lit(C.dark), 0, 0.26, KRAIT_PILOT.z - 0.02))
  ship.add(box(0.34, 0.34, 0.08, lit(C.dark), 0, 0.42, KRAIT_PILOT.z - 0.19))
  ship.add(box(0.5, 0.08, 0.16, lit(C.dark), 0, 0.46, 2.55), box(0.36, 0.012, 0.08, glow(ED_ORANGE), 0, 0.505, 2.53))
  // Train d'atterrissage : une jambe sous le nez, deux sous les ailes ; phares sous le ventre.
  const legs = new THREE.Group()
  legs.position.y = -KRAIT_GEAR
  gearLeg(legs, 0, 2.2, false)
  gearLeg(legs, 1.5, -1.3, true)
  gearLeg(legs, -1.5, -1.3, true)
  ship.add(legs)
  for (const [x, z] of [[0.25, 2.6], [-0.25, 2.6], [1.6, -0.2], [-1.6, -0.2]] as const) ship.add(cylinder(0.05, 0.05, 0.02, glow('#fff4d8'), x, 0.08, z, 10))

  // Le pont place `live` lui-même (cf. buildProps) : ses pièces montent dans un groupe à la hauteur du train.
  const live = new THREE.Group()
  const lifted = new THREE.Group()
  lifted.position.y = KRAIT_GEAR
  live.add(lifted)
  // Verrière du cockpit, basse et allongée, et ses arceaux.
  const bubble = { x: 0.4, y: 0.44, z: 0.66, at: 2.15, base: 0.4 }
  const canopy = part(new THREE.SphereGeometry(1, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass(C.glass, 0.28), 0, bubble.base, bubble.at)
  canopy.scale.set(bubble.x, bubble.y, bubble.z)
  lifted.add(canopy)
  const spineRib = mesh(new THREE.TorusGeometry(1, 0.03, 5, 24, Math.PI), lit(C.dark), 0, bubble.base, bubble.at)
  spineRib.rotation.y = Math.PI / 2
  spineRib.scale.set(bubble.x, bubble.y, bubble.z)
  lifted.add(spineRib)
  for (const k of [0.5, -0.45]) {
    const w = Math.sqrt(1 - k * k)
    const hoop = mesh(new THREE.TorusGeometry(1, 0.03, 5, 24, Math.PI), lit(C.dark), 0, bubble.base, bubble.at + k * bubble.z)
    hoop.scale.set(bubble.x * w, bubble.y * w, 1)
    lifted.add(hoop)
  }
  // Tuyères : un disque qui couve, et un jet qui s'allume quand quelqu'un est aux commandes.
  const cores: THREE.MeshBasicMaterial[] = []
  const jets: THREE.ShaderMaterial[] = []
  const flames: THREE.Mesh[] = []
  for (const [x, y, r] of NOZZLES) {
    const coreMat = new THREE.MeshBasicMaterial({ color: '#23405a' })
    cores.push(coreMat)
    const core = part(new THREE.CircleGeometry(r * 1.05, 20), coreMat, x, y, STERN - 0.02)
    core.rotation.y = Math.PI
    const jetMat = beamMaterial()
    jetMat.uniforms.uColor.value.set(C.thruster)
    jets.push(jetMat)
    const flame = part(new THREE.ConeGeometry(r * 1.05, 1.4, 16, 1, true), jetMat, x, y, STERN - 0.72)
    flame.rotation.x = -Math.PI / 2
    flames.push(flame)
    lifted.add(core, flame)
  }
  // Feux de navigation (rouge à bâbord, +x ; vert à tribord), blanc à la poupe, gyrophare dorsal.
  const nav = [
    part(new THREE.SphereGeometry(0.05, 8, 6), glow('#ff3b2f'), 3.0, 0.26, -2.0),
    part(new THREE.SphereGeometry(0.05, 8, 6), glow('#4dff8a'), -3.0, 0.26, -2.0),
    part(new THREE.SphereGeometry(0.045, 8, 6), glow('#ffffff'), 0, 0.64, -2.64),
  ]
  const beacon = part(new THREE.SphereGeometry(0.05, 10, 6), glow(ED_ORANGE), 0.62, 1.1, -2.62)
  lifted.add(...nav, beacon)
  const dim = new THREE.Color('#23405a'), hot = new THREE.Color('#d8f2ff')
  let power = 0
  return {
    solid: g,
    live,
    // Le delta et ses tuyères : les antennes, qui dépassent, n'arrêtent personne.
    extent: new THREE.Box3(new THREE.Vector3(-3.02, 0, STERN - 0.05), new THREE.Vector3(3.02, 1.12, 3.2)),
    update: (t) => {
      // La puissance suit la consigne : les jets montent en un instant, et retombent aussi vite à l'arrêt.
      power += (source.value - power) * (source.value > power ? 0.08 : 0.15)
      const idle = 0.12 + 0.05 * Math.sin(t * 1.3)
      const k = Math.max(idle, power)
      for (const m of cores) m.color.copy(dim).lerp(hot, k)
      // Les jets ne sortent qu'au-delà de l'éveil des tuyères (quelqu'un aux commandes, 0,3) :
      // réacteurs en route seulement, et ils s'éteignent avec eux.
      const thrust = Math.max(0, (power - 0.3) / 0.7)
      for (const m of jets) {
        m.uniforms.uTime.value = t
        m.uniforms.uIntensity.value = thrust * 0.95
      }
      for (const f of flames) {
        f.visible = thrust > 0.03
        f.scale.set(1 + thrust * 0.25, 0.4 + thrust * 1.3 + Math.random() * 0.12 * thrust, 1 + thrust * 0.25)
      }
      nav[0].visible = nav[1].visible = t % 2 < 1.6
      nav[2].visible = t % 1.4 < 0.12 || thrust > 0.3
      beacon.visible = (t + 0.7) % 1.2 < 0.25
    },
  }
}

/**
 * Escabeau d'embarquement, roulant, face au nez du Krait (+z) : sa plateforme touche la nacelle
 * du cockpit. On y grimpe pour prendre les commandes (cf. SEATS dans seats.ts).
 */
const kraitLadder: Builder = () => {
  const g = new THREE.Group()
  const yellow = lit(C.hazard), dark = lit(C.dark)
  g.add(box(0.5, 0.06, 0.95, dark, 0, 0.08, -0.05))
  for (const [x, z] of [[-0.2, -0.45], [0.2, -0.45], [-0.2, 0.35], [0.2, 0.35]] as const) g.add(barX(0.04, 0.04, lit(C.rubber), x, 0.04, z, 10))
  // Marches, de l'arrière (-z) jusqu'à la plateforme (+z).
  for (let i = 0; i < 5; i++) g.add(box(0.42, 0.03, 0.12, lit(C.chrome, 'metal'), 0, 0.14 + i * 0.085, -0.42 + i * 0.12))
  g.add(box(0.46, 0.04, 0.3, lit(C.chrome, 'metal'), 0, 0.55, 0.22))
  for (const s of [1, -1]) {
    const stringer = box(0.04, 0.05, 0.8, yellow, s * 0.23, 0.33, -0.18)
    stringer.rotation.x = -0.62
    g.add(stringer, box(0.04, 0.5, 0.04, yellow, s * 0.23, 0.3, 0.33))
    // Rambarde : montants et main courante.
    g.add(box(0.025, 0.36, 0.025, yellow, s * 0.24, 0.75, 0.1), box(0.025, 0.36, 0.025, yellow, s * 0.24, 0.52, -0.45))
    const rail = box(0.025, 0.025, 0.72, yellow, s * 0.24, 0.8, -0.2)
    rail.rotation.x = -0.45
    g.add(rail)
  }
  g.add(box(0.46, 0.02, 0.05, lit(C.black), 0, 0.575, 0.36))
  return { solid: g }
}

/** Pad d'appontage peint au sol, sous le Krait : cercle, équerres, numéro, flèche vers le bouclier. */
const hangarPad: Builder = ({ label = '7' }) => {
  const size = Number(label) || 7
  const texture = drawnTexture(1024, 1024, (c) => {
    c.clearRect(0, 0, 1024, 1024)
    const mid = 512
    c.strokeStyle = 'rgba(233,169,23,0.85)'
    c.lineWidth = 14
    c.beginPath()
    c.arc(mid, mid, 420, 0, Math.PI * 2)
    c.stroke()
    c.lineWidth = 5
    c.setLineDash([36, 22])
    c.beginPath()
    c.arc(mid, mid, 380, 0, Math.PI * 2)
    c.stroke()
    c.setLineDash([])
    // Équerres aux quatre coins.
    c.strokeStyle = 'rgba(240,244,248,0.8)'
    c.lineWidth = 12
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      c.beginPath()
      c.moveTo(mid + sx * 490, mid + sy * 380)
      c.lineTo(mid + sx * 490, mid + sy * 490)
      c.lineTo(mid + sx * 380, mid + sy * 490)
      c.stroke()
    }
    // Numéro du pad, et la flèche vers la sortie (le bas de l'image est l'avant du pad, +z).
    c.fillStyle = 'rgba(240,244,248,0.55)'
    c.font = '900 150px system-ui, sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText('01', mid, 250)
    c.fillStyle = 'rgba(255,138,28,0.8)'
    c.beginPath()
    c.moveTo(mid - 70, 760)
    c.lineTo(mid + 70, 760)
    c.lineTo(mid + 70, 830)
    c.lineTo(mid + 130, 830)
    c.lineTo(mid, 950)
    c.lineTo(mid - 130, 830)
    c.lineTo(mid - 70, 830)
    c.closePath()
    c.fill()
    c.font = '700 44px system-ui, sans-serif'
    c.fillText(tr('SORTIE', 'LAUNCH'), mid, 720)
  })
  const g = new THREE.Group()
  g.add(decal(texture, size, size, 0.004))
  // Bandes de danger le long des deux côtés du pad.
  const stripes = hazardTexture(512, 32, 16)
  for (const s of [1, -1]) {
    const band = decal(stripes, size, 0.16, 0.005)
    band.position.x = s * (size / 2 + 0.05)
    band.rotation.z = Math.PI / 2
    g.add(band)
  }
  return { solid: g }
}

/**
 * Gyrophare rouge, aux coins du pad : un socle, un dôme rouge, et dedans une lampe dont les deux
 * faisceaux tournent et balaient le sol du hangar.
 */
const hangarBeacon: Builder = () => {
  const g = new THREE.Group()
  g.add(cylinder(0.08, 0.09, 0.06, lit(C.dark), 0, 0.03, 0, 12), cylinder(0.085, 0.085, 0.02, lit(C.hazard), 0, 0.07, 0, 12))
  g.add(cylinder(0.06, 0.07, 0.05, lit(C.dark), 0, 0.105, 0, 12))
  const live = new THREE.Group()
  const dome = part(new THREE.SphereGeometry(0.07, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass('#ff2a1a', 0.45), 0, 0.13, 0)
  dome.scale.y = 1.4
  const core = new THREE.MeshBasicMaterial({ color: '#ff3b2f' })
  const spinner = new THREE.Group()
  spinner.position.y = 0.17
  spinner.add(part(new THREE.BoxGeometry(0.05, 0.05, 0.03), core))
  // Deux faisceaux opposés : vifs à la lampe, qui s'estompent en s'éloignant (cf. beamMaterial).
  // Mélange normal : en additif, le rouge blanchirait sur le sol argenté.
  const beam = beamMaterial(false)
  beam.uniforms.uColor.value.set('#ff2a1a')
  for (const s of [1, -1]) {
    const geo = new THREE.CylinderGeometry(0.28, 0.025, 1.1, 14, 1, true).translate(0, 0.55, 0).rotateZ(-s * Math.PI / 2)
    const b = part(geo, beam)
    b.rotation.z = s * 0.12
    spinner.add(b)
  }
  live.add(dome, spinner)
  const dim = new THREE.Color('#7a1008'), hot = new THREE.Color('#ff5a3c')
  return {
    solid: g,
    live,
    update: (t) => {
      spinner.rotation.y = t * 4.2
      beam.uniforms.uTime.value = t
      beam.uniforms.uIntensity.value = 0.75
      core.color.copy(dim).lerp(hot, 0.6 + 0.4 * Math.sin(t * 8.4))
    },
  }
}

// ---------------------------------------------------------------- l'atelier de Nico

/** Chariot à outils roulant : tiroirs rouges, clés sur le dessus, poignée. */
const toolCart: Builder = ({ random }) => {
  const g = new THREE.Group()
  const red = lit(C.red)
  g.add(box(0.56, 0.4, 0.34, red, 0, 0.26, 0, 0.02))
  for (let i = 0; i < 4; i++) g.add(box(0.5, 0.012, 0.02, lit(C.black), 0, 0.14 + i * 0.085, 0.172), box(0.14, 0.015, 0.02, lit(C.chrome, 'metal'), 0, 0.17 + i * 0.085, 0.176))
  for (const [x, z] of [[-0.22, -0.12], [0.22, -0.12], [-0.22, 0.12], [0.22, 0.12]] as const) g.add(barX(0.035, 0.03, lit(C.rubber), x, 0.035, z, 8))
  g.add(box(0.58, 0.03, 0.36, lit(C.dark), 0, 0.475, 0))
  for (const s of [1, -1]) g.add(box(0.02, 0.12, 0.02, lit(C.chrome, 'metal'), s * 0.3, 0.52, 0.12), box(0.02, 0.12, 0.02, lit(C.chrome, 'metal'), s * 0.3, 0.52, -0.12))
  g.add(barZ(0.012, 0.3, lit(C.chrome, 'metal'), 0.31, 0.58, 0, 6))
  for (let i = 0; i < 5; i++) {
    const w = box(0.03, 0.012, 0.16 + random() * 0.08, lit(C.chrome, 'metal'), -0.2 + i * 0.07, 0.5, random() * 0.06)
    w.rotation.y = (random() - 0.5) * 0.5
    g.add(w)
  }
  g.add(box(0.1, 0.05, 0.08, lit(C.hazard), 0.16, 0.515, -0.08, 0.01), cylinder(0.025, 0.025, 0.06, lit(C.black), 0.05, 0.52, 0.1, 8))
  return { solid: g }
}

/**
 * Étagère à pièces détachées : joints de tuyère, bobines de câble, caisses de rivets, un
 * limpet démonté et une tuyère de rechange sur le rayon du bas.
 */
const partsRack: Builder = ({ random }) => {
  const g = new THREE.Group()
  const frame = lit(C.dark)
  for (const [x, z] of [[-0.55, -0.16], [0.55, -0.16], [-0.55, 0.16], [0.55, 0.16]] as const) g.add(box(0.04, 1, 0.04, frame, x, 0.5, z))
  for (const y of [0.08, 0.42, 0.76]) g.add(box(1.14, 0.03, 0.36, lit('#4a4f57'), 0, y, 0), box(1.14, 0.03, 0.02, lit(C.hazard), 0, y, 0.18))
  // Rayon du bas : une tuyère de rechange couchée.
  const nozzle = cylinder(0.13, 0.17, 0.32, lit(C.panel), -0.25, 0.25, 0, 14)
  nozzle.rotation.z = Math.PI / 2
  g.add(nozzle, mesh(new THREE.TorusGeometry(0.15, 0.02, 6, 16), lit(C.chrome, 'metal'), -0.09, 0.25, 0))
  g.add(box(0.3, 0.2, 0.26, lit('#6b5a3a'), 0.3, 0.195, 0, 0.01))
  // Rayon du milieu : joints, bobines, caisses.
  for (let i = 0; i < 3; i++) {
    const ring = mesh(new THREE.TorusGeometry(0.08, 0.025, 6, 14), lit(i % 2 ? C.black : ED_ORANGE), -0.4 + i * 0.16, 0.54, 0)
    ring.rotation.x = Math.PI / 2 - 0.3
    g.add(ring)
  }
  g.add(cylinder(0.08, 0.08, 0.14, lit(C.hazard), 0.12, 0.51, 0, 12), cylinder(0.045, 0.045, 0.15, lit(C.black), 0.12, 0.51, 0, 10))
  g.add(box(0.2, 0.12, 0.2, lit(C.red), 0.4, 0.5, 0, 0.01))
  // Rayon du haut : petites boîtes de toutes les couleurs.
  for (let i = 0; i < 6; i++) {
    const col = [C.red, C.hazard, '#3f5873', C.chrome, '#5a5f3a', C.edge][i]
    g.add(box(0.14, 0.08 + random() * 0.06, 0.18, lit(col), -0.45 + i * 0.18, 0.83, 0, 0.01))
  }
  return { solid: g }
}

/**
 * Station de ravitaillement : colonne à cadran, enrouleur, et le tuyau qui court au sol jusqu'à
 * la trappe de l'aile du Krait (vers +z, puis `label` : « x,z » du bout du tuyau, repère du meuble).
 */
const fuelStation: Builder = ({ label = '1.1,3.2' }) => {
  const [ex, ez] = label.split(',').map(Number)
  const g = new THREE.Group()
  g.add(box(0.42, 0.06, 0.34, lit(C.dark), 0, 0.03, 0))
  g.add(box(0.34, 0.78, 0.26, lit('#c9ccd1'), 0, 0.45, 0, 0.03))
  g.add(box(0.36, 0.08, 0.28, lit(C.hazard), 0, 0.12, 0))
  g.add(box(0.24, 0.14, 0.01, lit(C.black), 0, 0.66, 0.132), box(0.2, 0.1, 0.005, glow('#7dffa8'), 0, 0.66, 0.138))
  g.add(box(0.3, 0.05, 0.01, lit(ED_ORANGE), 0, 0.5, 0.132))
  // Enrouleur sur le côté.
  const reel = cylinder(0.12, 0.12, 0.06, lit(C.red), 0.2, 0.42, 0, 16)
  reel.rotation.z = Math.PI / 2
  g.add(reel, barX(0.05, 0.08, lit(C.black), 0.2, 0.42, 0, 12))
  // Le tuyau : il sort de l'enrouleur, rampe au sol et remonte jusqu'à l'aile.
  const hose = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.24, 0.36, 0.08),
    new THREE.Vector3(0.3, 0.03, 0.4),
    new THREE.Vector3(ex * 0.4, 0.025, ez * 0.45),
    new THREE.Vector3(ex * 0.85, 0.03, ez * 0.85),
    new THREE.Vector3(ex, 0.3, ez - 0.05),
    new THREE.Vector3(ex, KRAIT_GEAR + 0.26, ez),
  ])
  g.add(mesh(new THREE.TubeGeometry(hose, 48, 0.028, 6, false), lit(C.black)))
  g.add(cylinder(0.045, 0.045, 0.1, lit(ED_ORANGE), ex, KRAIT_GEAR + 0.22, ez, 10))
  return {
    solid: g,
    // La colonne seule : le tuyau, au sol, n'arrête personne.
    extent: new THREE.Box3(new THREE.Vector3(-0.24, 0, -0.18), new THREE.Vector3(0.32, 0.85, 0.2)),
    emitter: 'hum',
  }
}

/** Cale de train : deux coins jaunes reliés par une corde, et une clé posée à côté. */
const gearChock: Builder = () => {
  const g = new THREE.Group()
  for (const x of [-0.14, 0.14]) {
    const wedge = box(0.12, 0.08, 0.16, lit(C.hazard), x, 0.04, 0, 0.01)
    g.add(wedge, box(0.122, 0.02, 0.05, lit(C.black), x, 0.06, 0))
  }
  g.add(barX(0.008, 0.18, lit(C.red), 0, 0.05, 0.02, 5))
  const wrench = box(0.03, 0.012, 0.2, lit(C.chrome, 'metal'), 0.05, 0.008, 0.18)
  wrench.rotation.y = 0.6
  g.add(wrench)
  return { solid: g }
}

/** Support de propulseur : une tuyère de rechange sur un berceau à roulettes, prête à monter. */
const thrusterStand: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.7, 0.06, 0.5, lit(C.dark), 0, 0.09, 0))
  for (const [x, z] of [[-0.3, -0.2], [0.3, -0.2], [-0.3, 0.2], [0.3, 0.2]] as const) g.add(barX(0.04, 0.04, lit(C.rubber), x, 0.04, z, 8))
  for (const x of [-0.22, 0.22]) g.add(box(0.06, 0.2, 0.3, lit(C.hazard), x, 0.22, 0))
  const body = cylinder(0.17, 0.22, 0.55, lit(C.panel), 0, 0.42, 0, 16)
  body.rotation.x = Math.PI / 2
  g.add(body, mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 18), lit(C.chrome, 'metal'), 0, 0.42, -0.28))
  g.add(mesh(new THREE.TorusGeometry(0.16, 0.02, 6, 18), lit(ED_ORANGE), 0, 0.42, 0.26))
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    g.add(box(0.02, 0.02, 0.5, lit(C.chrome, 'metal'), Math.cos(a) * 0.2, 0.42 + Math.sin(a) * 0.2, 0))
  }
  return { solid: g }
}

/**
 * Pupitre de contrôle du hangar : écran incliné (état du Krait, du bouclier et du pad) et, au-
 * dessus, le Krait en fil de fer qui tourne, à la façon de la Cobra de 1984.
 */
const hangarConsole: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.7, 0.08, 0.44, lit(C.dark), 0, 0.04, 0))
  g.add(box(0.56, 0.52, 0.3, lit('#3a3f47'), 0, 0.34, -0.03, 0.02))
  const desk = box(0.7, 0.05, 0.4, lit('#4a4f57'), 0, 0.62, 0.02)
  desk.rotation.x = 0.35
  g.add(desk, box(0.72, 0.03, 0.02, lit(ED_ORANGE), 0, 0.56, 0.22))
  g.add(cylinder(0.02, 0.02, 0.3, lit(C.dark), 0, 0.8, -0.14, 6), cylinder(0.14, 0.16, 0.03, lit(C.dark), 0, 0.95, -0.14, 16))
  const screen = animatedScreen(256, 160, 4, (c, t) => {
    c.fillStyle = '#081018'
    c.fillRect(0, 0, 256, 160)
    c.strokeStyle = ED_ORANGE
    c.lineWidth = 3
    c.strokeRect(4, 4, 248, 152)
    c.fillStyle = ED_ORANGE
    c.font = '700 20px monospace'
    c.fillText('HANGAR 01', 14, 30)
    c.font = '14px monospace'
    const lines = [
      ['KRAIT MK II', ''],
      [tr('CARBURANT', 'FUEL'), '100%'],
      [tr('BOUCLIER', 'SHIELD'), tr('ACTIF', 'ACTIVE')],
      [tr('PAD', 'PAD'), tr('VERROUILLÉ', 'LOCKED')],
    ]
    lines.forEach(([k, v], i) => {
      c.fillStyle = i ? '#cfe6ff' : '#8ff0ff'
      c.fillText(k, 14, 58 + i * 22)
      c.fillStyle = i === 2 ? '#8ff0ff' : '#7dffa8'
      c.fillText(v, 150, 58 + i * 22)
    })
    // Barre de charge du bouclier, qui ondule.
    c.fillStyle = '#12304a'
    c.fillRect(14, 140, 228, 8)
    c.fillStyle = '#40b4ff'
    c.fillRect(14, 140, 228 * (0.9 + 0.1 * Math.sin(t * 2)), 8)
  })
  const panel = part(new THREE.PlaneGeometry(0.5, 0.3), new THREE.MeshBasicMaterial({ map: screen.texture }), 0, 0.655, 0.03)
  panel.rotation.x = -Math.PI / 2 + 0.35
  // Le Krait en fil de fer, au-dessus du pupitre.
  const wire = new THREE.Group()
  wire.position.set(0, 1.12, -0.14)
  const outline = [...BODY.map((s) => [s.pts[s.pts.length - 1][0], s.z] as const)]
  const pts: THREE.Vector3[] = []
  const k = 0.07
  const plan: [number, number][] = [...outline.slice().reverse().map(([x, z]) => [x, z] as [number, number]), [0, -2.6]]
  for (let i = 0; i < plan.length - 1; i++) {
    for (const s of [1, -1]) pts.push(new THREE.Vector3(s * plan[i][0] * k, 0, plan[i][1] * k), new THREE.Vector3(s * plan[i + 1][0] * k, 0, plan[i + 1][1] * k))
  }
  // Les deux arêtes dorsales, qui donnent le relief.
  for (const s of [1, -1]) pts.push(new THREE.Vector3(s * 0.62 * k, 0.05, 1.95 * k), new THREE.Vector3(s * 0.62 * k, 0.07, -2.9 * k))
  wire.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMaterial))
  const live = new THREE.Group()
  live.add(panel, wire)
  return {
    solid: g,
    live,
    update: (t) => {
      screen.tick(t)
      wire.rotation.y = t * 0.6
      wire.position.y = 1.12 + Math.sin(t * 1.5) * 0.02
    },
  }
}

/** Enseigne murale « HANGAR 01 » : lettres au pochoir, bande de danger (collée au mur, face +z). */
const hangarSign: Builder = ({ label = 'HANGAR 01' }) => {
  const texture = drawnTexture(512, 160, (c) => {
    c.fillStyle = '#2a2e36'
    c.fillRect(0, 0, 512, 160)
    c.fillStyle = ED_ORANGE
    c.font = '900 76px system-ui, sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(label, 256, 70)
    c.fillStyle = '#e9a917'
    for (let x = -40; x < 560; x += 40) {
      c.beginPath()
      c.moveTo(x, 132)
      c.lineTo(x + 20, 132)
      c.lineTo(x + 40, 156)
      c.lineTo(x + 20, 156)
      c.closePath()
      c.fill()
    }
  })
  const g = new THREE.Group()
  g.add(box(1.46, 0.46, 0.03, lit(C.dark), 0, 0.72, 0.015))
  g.add(part(new THREE.PlaneGeometry(1.4, 0.44), new THREE.MeshLambertMaterial({ map: texture }), 0, 0.72, 0.032))
  return { solid: g }
}

/** Balise du bouclier : un piquet à feu clignotant, posé au sol devant le champ de force. */
const shieldBeacon: Builder = () => {
  const g = new THREE.Group()
  g.add(cylinder(0.07, 0.09, 0.05, lit(C.dark), 0, 0.025, 0, 10), cylinder(0.02, 0.02, 0.18, lit(C.hazard), 0, 0.14, 0, 8))
  const live = new THREE.Group()
  const lampMat = new THREE.MeshBasicMaterial({ color: '#40b4ff' })
  live.add(part(new THREE.SphereGeometry(0.04, 10, 8), lampMat, 0, 0.25, 0))
  const on = new THREE.Color('#8fe3ff')
  return {
    solid: g,
    live,
    update: (t) => {
      lampMat.color.setScalar(0).lerp(on, 0.35 + 0.65 * Math.max(0, Math.sin(t * 3)))
    },
  }
}

export const HANGAR = {
  'krait-mk2': krait,
  'krait-ladder': kraitLadder,
  'hangar-pad': hangarPad,
  'hangar-beacon': hangarBeacon,
  'tool-cart': toolCart,
  'parts-rack': partsRack,
  'fuel-station': fuelStation,
  'gear-chock': gearChock,
  'thruster-stand': thrusterStand,
  'hangar-console': hangarConsole,
  'hangar-sign': hangarSign,
  'shield-beacon': shieldBeacon,
} satisfies Record<string, Builder>
