import * as THREE from 'three'
import { NATURE_PACK, packModel } from '../assets'
import { renderQuality } from '../quality'
import { fishModel } from '../fishing/models'
import { box, cylinder, drawnTexture, keepShared, lit, mesh, part, sphere, type Builder } from './kit'
import { fallingWater, pondLife } from './pond-life'
import { fishById, FISH, FISHING_POND } from '../../shared/fishing.js'

/*
 * Le jardin exotique, au sud de la serre du pont supérieur : le grand étang où l'on pêche (cf.
 * src/fishing/game.ts), son ponton, le livre des prises sur son lutrin, et la plage de sable qui
 * les entoure. Et, pour les quartiers, le trophée de pêche : un poisson de sa collection, monté
 * sur un panneau.
 */

const C = {
  stone: '#9a9a92',
  stoneDark: '#6f706a',
  sand: '#e2c98f',
  sandDark: '#cdb27a',
  wood: '#9a6a45',
  woodDark: '#6b4630',
  woodLight: '#c49a6c',
}

/** Rectangle aux coins arrondis, centré (demi-largeur, demi-profondeur, rayon des coins). */
function roundedRect(hw: number, hd: number, r: number): THREE.Shape {
  const s = new THREE.Shape()
  s.moveTo(-hw + r, -hd)
  s.lineTo(hw - r, -hd)
  s.absarc(hw - r, -hd + r, r, -Math.PI / 2, 0, false)
  s.lineTo(hw, hd - r)
  s.absarc(hw - r, hd - r, r, 0, Math.PI / 2, false)
  s.lineTo(-hw + r, hd)
  s.absarc(-hw + r, hd - r, r, Math.PI / 2, Math.PI, false)
  s.lineTo(-hw, -hd + r)
  s.absarc(-hw + r, -hd + r, r, Math.PI, Math.PI * 1.5, false)
  return s
}

/** La forme, à plat sur le sol (y = 0). */
const flat = (shape: THREE.Shape) => new THREE.ShapeGeometry(shape, 10).rotateX(-Math.PI / 2)

/**
 * Verts du Nature Kit, teints d'un turquoise qui ne va pas à l'étang : feuilles et mousses y
 * prennent un vert de feuille (le reste, la fleur rouge du nénuphar, ne change pas).
 */
const GREENS: Record<string, string> = { leafsGreen: '#5c9e48', leafsDark: '#3f7a36', grass: '#6a9a3e' }

/** Un modèle du Nature Kit, à l'échelle `s`, le pied à `y`, posé en (x, z), ses verts repeints. */
function nature(file: string, s: number, x: number, y: number, z: number, turn: number): THREE.Object3D {
  const o = packModel(file, NATURE_PACK).clone(true)
  o.traverse((c) => {
    const m = c as THREE.Mesh
    const green = m.isMesh && GREENS[(m.material as THREE.Material).name]
    if (green) m.material = lit(green)
  })
  o.scale.setScalar(s)
  o.rotation.y = turn
  o.position.set(x, y, z)
  return o
}

/**
 * Le grand étang du jardin exotique (taille : FISHING_POND) : une margelle de pierres, des
 * rochers, des roseaux et des nénuphars, la grenouille de pierre et son filet d'eau ; dans l'eau,
 * les trois carpes de Capucine et les ombres des poissons qu'on pêche. L'eau, ses rides, les
 * grenouilles, les libellules et les gerris vivent dans pond-life.ts. Rien n'y dépasse 0,6 de
 * haut : au-delà, le pont trame un meuble qui cache le joueur (cf. Deck), et l'étang entier
 * s'estompait dès qu'on montait sur le ponton.
 */
const fishingPond: Builder = ({ random }) => {
  const { w, d, corner, rim, water } = FISHING_POND
  const hw = w / 2, hd = d / 2
  const g = new THREE.Group()
  // Le fond, et la margelle : des pierres plates le long du bord.
  const inner = roundedRect(hw - rim, hd - rim, corner - rim)
  const bottom = mesh(flat(inner), lit('#1d4a4a'), 0, 0.02, 0)
  bottom.castShadow = false
  g.add(bottom)
  const edge = roundedRect(hw - rim / 2, hd - rim / 2, corner - rim / 2).getSpacedPoints(54)
  // Quelques pierres de la margelle, où les grenouilles viennent s'asseoir (loin du ponton, au nord).
  const stones = edge.filter((p, i) => i % 9 === 4 && -p.y > -hd + 0.3).map((p) => ({ x: p.x, z: -p.y, y: 0.115 }))
  edge.forEach((p, i) => {
    const next = edge[(i + 1) % edge.length]
    const stone = mesh(new THREE.DodecahedronGeometry(0.13 + random() * 0.04, 0), lit(i % 3 ? C.stone : C.stoneDark), p.x, 0.055, -p.y)
    stone.scale.set(1.25, 0.5, 0.95)
    stone.rotation.y = Math.atan2(next.y - p.y, next.x - p.x) + (random() - 0.5) * 0.3
    g.add(stone)
  })
  // Rochers moussus au sud-est, d'où coule le filet d'eau.
  const rockX = hw - 0.75, rockZ = hd - 0.6
  for (const [x, z, r, h] of [[0, 0, 0.3, 0.9], [-0.32, 0.12, 0.22, 0.7], [0.18, -0.26, 0.2, 0.6], [-0.1, -0.3, 0.15, 0.5]] as const) {
    const rock = mesh(new THREE.DodecahedronGeometry(r, 0), lit(C.stoneDark), rockX + x, r * h * 0.6, rockZ + z)
    rock.scale.y = h
    rock.rotation.y = random() * 6
    g.add(rock)
  }
  g.add(sphere(0.07, lit(C.stone), rockX - 0.02, 0.36, rockZ - 0.04, 8), sphere(0.024, lit(C.stone), rockX - 0.06, 0.42, rockZ - 0.08, 5), sphere(0.024, lit(C.stone), rockX - 0.07, 0.42, rockZ, 5))
  g.add(nature('plant_flatShort', 0.8, rockX + 0.2, 0.1, rockZ + 0.1, random() * 6), nature('hanging_moss', 0.5, rockX - 0.3, 0.1, rockZ + 0.2, random() * 6))
  // Roseaux, par touffes, au bord de l'eau.
  for (const [x, z] of [[-hw + 0.55, -hd + 0.75], [-hw + 0.45, hd - 0.9], [hw - 0.5, -hd + 0.8], [-0.9, hd - 0.42], [1.2, hd - 0.4]] as const) {
    for (let i = 0; i < 6; i++) {
      const h = 0.25 + random() * 0.22
      const reed = mesh(new THREE.CylinderGeometry(0.006, 0.01, h, 4), lit(i % 2 ? '#5f9a4a' : '#7ab05a'), x + (random() - 0.5) * 0.26, water + h / 2 - 0.02, z + (random() - 0.5) * 0.26)
      reed.rotation.set((random() - 0.5) * 0.25, 0, (random() - 0.5) * 0.25)
      g.add(reed)
      if (i % 3 === 0) g.add(cylinder(0.018, 0.018, 0.09, lit('#6b4630'), reed.position.x, water + h - 0.04, reed.position.z, 6))
    }
  }
  // Deux flamants roses, les pattes dans l'eau, parmi les roseaux du nord-ouest.
  for (const [x, z, turn, s] of [[-hw + 0.7, -hd + 0.55, 0.6, 1], [-hw + 0.98, -hd + 0.42, -1.9, 0.85]] as const) {
    const bird = new THREE.Group()
    const pink = lit('#ff8fb0'), pale = lit('#ffc2d4')
    bird.add(cylinder(0.006, 0.006, 0.24, lit('#e86a8a'), -0.015, 0.12, 0, 4), cylinder(0.006, 0.006, 0.24, lit('#e86a8a'), 0.02, 0.12, 0.01, 4))
    const body = sphere(0.07, pink, 0, 0.29, 0, 8)
    body.scale.set(0.8, 0.75, 1.25)
    const tail = mesh(new THREE.ConeGeometry(0.035, 0.09, 5), pale, 0, 0.3, -0.1)
    tail.rotation.x = -1.9
    // Le cou en S : trois tronçons, puis la tête et le bec noir au bout.
    const neck1 = cylinder(0.014, 0.018, 0.12, pink, 0, 0.35, 0.08, 5)
    neck1.rotation.x = 0.7
    const neck2 = cylinder(0.012, 0.014, 0.1, pink, 0, 0.42, 0.1, 5)
    neck2.rotation.x = -0.35
    bird.add(body, tail, neck1, neck2, sphere(0.024, pink, 0, 0.475, 0.1, 6), box(0.014, 0.014, 0.04, lit('#f4f1e8'), 0, 0.468, 0.13), box(0.012, 0.012, 0.022, lit('#1f1f24'), 0, 0.462, 0.156))
    bird.scale.setScalar(s)
    bird.rotation.y = turn
    bird.position.set(x, water - 0.02, z)
    g.add(bird)
  }
  // Nénuphars, et deux lotus.
  const lilies = [[-1.3, 0.75, 1.5, 1], [-0.7, 1.05, 1.2, 0], [0.9, 0.9, 1.4, 1], [1.55, -0.55, 1.3, 1], [-1.6, -0.6, 1.2, 0], [0.25, -1.05, 1.1, 0], [-0.4, -0.85, 1.4, 1]] as const
  // Le modèle du kit a son pivot 5 cm sous la feuille : remontée à fleur d'eau, sinon l'eau la voile.
  // Le modèle du kit est épais, son pivot 5 cm sous la feuille (qui passait sous l'eau) : aplati, et
  // posé à fleur d'eau.
  const FLAT = 0.3
  for (const [x, z, s, big] of lilies) {
    const pad = nature(big ? 'lily_large' : 'lily_small', s, x, water + 0.05 * s * FLAT - 0.003, z, random() * 6)
    pad.scale.y *= FLAT
    g.add(pad)
  }
  // Les lotus fleurissent sur deux nénuphars : les grenouilles se posent sur les autres.
  const lotus = [[-1.3, 0.75], [0.9, 0.9]] as const
  for (const [lx, lz] of lotus) {
    const x = lx + 0.02, z = lz + (lx < 0 ? 0.03 : -0.02)
    for (let p = 0; p < 6; p++) {
      const a = (p / 6) * Math.PI * 2
      const petal = mesh(new THREE.ConeGeometry(0.03, 0.085, 4), lit(p % 2 ? '#ffc2e0' : '#ff8ac8'), x + Math.cos(a) * 0.036, water + 0.05, z + Math.sin(a) * 0.036)
      petal.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6)
      g.add(petal)
    }
    g.add(sphere(0.02, lit('#ffd23c'), x, water + 0.045, z, 6))
  }

  const live = new THREE.Group()
  // L'eau et ce qui y vit ; les grenouilles se posent sur les grands nénuphars (pas sur les lotus).
  const shape = { hw: hw - rim - 0.02, hd: hd - rim - 0.02, r: corner - rim }
  const pads = lilies.filter(([x, z]) => !lotus.some(([lx, lz]) => lx === x && lz === z)).map(([x, z]) => ({ x, z }))
  const life = pondLife({ shape, water, pads, stones, random })
  const surface = part(flat(roundedRect(shape.hw, shape.hd, shape.r)), life.surface.material, 0, water, 0)
  surface.renderOrder = 1
  live.add(life.group)
  const flowing = { value: 0 }
  const jet = part(new THREE.CylinderGeometry(0.008, 0.014, 0.42, 5), fallingWater(flowing), rockX - 0.22, 0.26, rockZ - 0.2)
  jet.rotation.set(-0.55, 0, 0.75)
  // La cascade : une nappe d'eau qui glisse du grand rocher, et l'écume à son pied.
  const fall = part(new THREE.PlaneGeometry(0.3, 0.42, 1, 6), fallingWater(flowing), rockX - 0.06, 0.25, rockZ - 0.34)
  fall.rotation.set(0.5, 0.25, 0)
  const sheet = fall.geometry.getAttribute('position') as THREE.BufferAttribute
  const rest = Float32Array.from(sheet.array as Float32Array)
  const foam = [0, 1, 2].map((i) => {
    const ring = part(new THREE.RingGeometry(0.75, 1, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false }), rockX - 0.1, water + 0.006 + i * 0.001, rockZ - 0.52)
    live.add(ring)
    return ring
  })
  live.add(surface, jet, fall)
  // Les carpes de Capucine (Faulcon, DeLacy, Gutamaya), et les ombres de ce qui nage plus bas.
  const swimmer = (color: string, tailColor: string, size: number) => {
    const fish = new THREE.Group()
    const body = part(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshLambertMaterial({ color }))
    body.scale.set(0.6, 0.45, 1.6)
    const tail = part(new THREE.ConeGeometry(0.025, 0.05, 4), new THREE.MeshLambertMaterial({ color: tailColor }), 0, 0, -0.07)
    tail.rotation.x = -Math.PI / 2
    tail.scale.set(1, 1, 0.3)
    fish.add(body, tail)
    fish.scale.setScalar(size)
    live.add(fish)
    return { fish, tail }
  }
  const koi = [['#ff7a2a', '#ff7a2a'], ['#f4f4f0', '#ff7a2a'], ['#2a2a2e', '#2a2a2e']].map(([color, tail], i) => ({
    ...swimmer(color, tail, 1.5), speed: 0.3 + i * 0.07, phase: i * 2.1, rx: 0.5 + i * 0.16, rz: 0.75 - i * 0.12, y: 0.055,
    // Prochaine fois qu'elle vient gober à la surface (une ride).
    gulp: 2 + i * 1.7,
  }))
  const shadows = [1.6, 2.1, 1.3, 2.6, 1.8].map((size, i) => ({
    ...swimmer('#143436', '#143436', size), speed: -(0.14 + i * 0.045), phase: i * 1.37, rx: 0.3 + ((i * 37) % 60) / 100, rz: 0.35 + ((i * 53) % 55) / 100, y: 0.035,
  }))
  const all = [...koi, ...shadows]
  const reachX = hw - rim - 0.35, reachZ = hd - rim - 0.3
  // La cascade tombe en continu : une ride à son pied, régulièrement.
  const fallFoot = { x: rockX - 0.1, z: rockZ - 0.52 }
  let nextDrop = 0
  return {
    solid: g,
    live,
    // L'emprise de l'étang, sans le débord des pierres de la margelle : il fermait aux trajets la
    // rangée de tuiles qui fait le tour de l'étang (cf. FISHING_POND).
    extent: new THREE.Box3(new THREE.Vector3(-hw + 0.06, 0, -hd + 0.06), new THREE.Vector3(hw - 0.06, 0.3, hd - 0.06)),
    update(t) {
      const still = renderQuality.light
      const now = still ? 0 : t
      flowing.value = now
      life.update(now)
      if (!still) {
        if (now > nextDrop + 3) nextDrop = now
        for (; nextDrop <= now; nextDrop += 0.55) life.ripple(fallFoot.x + Math.sin(nextDrop * 7) * 0.05, fallFoot.z + Math.cos(nextDrop * 5) * 0.05, nextDrop, 0.35)
        for (const k of koi) {
          if (now > k.gulp + 10) k.gulp = now
          if (now >= k.gulp) {
            life.ripple(k.fish.position.x, k.fish.position.z, k.gulp, 0.75)
            k.gulp += 4 + ((k.gulp * 7.3) % 5)
          }
        }
      }
      for (const k of all) {
        const a = (still ? 0 : t) * k.speed + k.phase
        // Une boucle qui se déforme lentement : ils ne repassent pas deux fois au même endroit.
        const wob = 1 + 0.18 * Math.sin(a * 0.37 + k.phase)
        const x = Math.cos(a) * reachX * k.rx * wob, z = Math.sin(a) * reachZ * k.rz * wob
        k.fish.position.set(x, k.y, z)
        k.fish.rotation.y = Math.atan2(-Math.sin(a) * reachX * k.rx * Math.sign(k.speed), Math.cos(a) * reachZ * k.rz * Math.sign(k.speed))
        k.tail.rotation.y = still ? 0 : Math.sin(t * 8 + k.phase) * 0.4
      }
      jet.visible = !still
      // La nappe ondule en tombant ; l'écume s'élargit et s'efface, un anneau après l'autre.
      for (let i = 0; i < sheet.count; i++) sheet.setZ(i, rest[i * 3 + 2] + (still ? 0 : Math.sin(t * 9 + rest[i * 3 + 1] * 22 + rest[i * 3] * 8) * 0.012))
      sheet.needsUpdate = true
      foam.forEach((ring, i) => {
        const life = still ? (i + 1) / 4 : (t * 0.7 + i / 3) % 1
        ring.scale.setScalar(0.08 + life * 0.3)
        ;(ring.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - life)
      })
    },
  }
}

/**
 * Le ponton de pêche, sur la rive de l'étang (devant, +z) : un plancher de bois sur lequel on
 * monte, deux pieux, des cannes dans leur râtelier, la boîte à appâts et le seau. Bas, lui aussi
 * (cf. l'étang) : on se tient dessus, il ne doit pas se tramer.
 */
const fishingDock: Builder = () => {
  const g = new THREE.Group()
  const plank = lit(C.woodLight, 'wood'), dark = lit(C.woodDark, 'wood')
  for (let i = 0; i < 6; i++) g.add(box(0.19, 0.03, 0.82, i % 2 ? plank : lit(C.wood, 'wood'), -0.5 + i * 0.2, 0.035, 0, 0.006))
  for (const z of [-0.36, 0.36]) g.add(box(1.24, 0.03, 0.06, dark, 0, 0.018, z))
  for (const x of [-0.58, 0.58]) g.add(cylinder(0.035, 0.04, 0.32, dark, x, 0.16, 0.38, 8), cylinder(0.042, 0.042, 0.02, lit('#d8d4c8'), x, 0.325, 0.38, 8))
  // Le râtelier et ses deux cannes.
  g.add(box(0.05, 0.42, 0.05, dark, -0.52, 0.26, -0.3), box(0.3, 0.04, 0.05, dark, -0.4, 0.4, -0.3))
  for (const [x, lean] of [[-0.44, 0.1], [-0.33, -0.06]] as const) {
    const rod = cylinder(0.006, 0.012, 0.5, lit('#3a2e28'), x, 0.3, -0.28, 5)
    rod.rotation.z = lean
    g.add(rod, cylinder(0.02, 0.02, 0.03, lit('#c8ccd2'), x + lean * 0.12, 0.17, -0.265, 8))
  }
  // La boîte à appâts, ouverte, et le seau.
  g.add(box(0.2, 0.08, 0.13, lit('#3f6f8a'), 0.42, 0.09, -0.28, 0.01), box(0.2, 0.012, 0.13, lit('#2f556c'), 0.42, 0.19, -0.345))
  for (const [x, color] of [[0.37, '#ff5a4a'], [0.42, '#ffd23c'], [0.47, '#f4f4f0']] as const) g.add(sphere(0.014, lit(color), x, 0.135, -0.28, 6))
  g.add(cylinder(0.075, 0.06, 0.13, lit('#c8ccd2'), 0.16, 0.115, -0.3, 12), cylinder(0.068, 0.068, 0.01, lit('#4fa8c8'), 0.16, 0.165, -0.3, 12))
  return { solid: g }
}

/**
 * Le livre des prises, sur son lutrin de bois, face à +z : grand ouvert, un poisson dessiné sur la
 * page de gauche, des lignes sur celle de droite, un signet rouge.
 */
const fishBook: Builder = () => {
  const g = new THREE.Group()
  const wood = lit(C.wood, 'wood'), dark = lit(C.woodDark, 'wood')
  g.add(box(0.34, 0.04, 0.3, dark, 0, 0.02, 0, 0.01), box(0.07, 0.6, 0.07, wood, 0, 0.33, -0.02))
  const top = new THREE.Group()
  top.position.set(0, 0.66, 0.02)
  top.rotation.x = 0.5
  top.add(box(0.5, 0.03, 0.36, wood, 0, 0, 0, 0.008), box(0.5, 0.03, 0.03, dark, 0, 0.03, 0.17))
  top.add(box(0.44, 0.03, 0.3, lit('#2f5f7a'), 0, 0.028, -0.01, 0.006))
  for (const s of [-1, 1]) top.add(box(0.2, 0.012, 0.27, lit('#f6f0de'), s * 0.105, 0.05, -0.01))
  // Page de gauche : un poisson ; page de droite : son nom et sa description.
  const ink = lit('#d9532b')
  const body = sphere(0.045, ink, -0.11, 0.057, -0.01, 8)
  body.scale.set(1.5, 0.08, 0.8)
  const tail = mesh(new THREE.ConeGeometry(0.03, 0.05, 3), ink, -0.185, 0.057, -0.01)
  tail.rotation.set(Math.PI / 2, 0, Math.PI / 2)
  tail.scale.z = 0.1
  top.add(body, tail)
  for (let i = 0; i < 5; i++) top.add(box(i === 0 ? 0.1 : 0.15, 0.002, 0.012, lit(i === 0 ? '#2f5f7a' : '#8a8676'), 0.105 - (i === 0 ? 0.025 : 0), 0.057, -0.1 + i * 0.045))
  top.add(box(0.02, 0.004, 0.36, lit('#c0262d'), 0.01, 0.058, 0.03))
  g.add(top)
  return { solid: g }
}

/**
 * Plage de sable (sans collision) : du sable ratissé, des galets, quelques coquillages. Taille :
 * `label` (« LxP », 2 × 1,5 par défaut).
 */
const sandPatch: Builder = ({ label, random }) => {
  const [w, d] = (label ?? '2x1.5').split('x').map(Number)
  const g = new THREE.Group()
  const sand = mesh(flat(roundedRect(w / 2, d / 2, Math.min(0.9, w / 4, d / 4))), lit(C.sand), 0, 0.012, 0)
  sand.castShadow = false
  g.add(sand)
  const count = Math.round(w * d * 2.2)
  for (let i = 0; i < count; i++) {
    const x = (random() - 0.5) * (w - 0.5), z = (random() - 0.5) * (d - 0.5), kind = random()
    if (kind < 0.5) {
      const pebble = mesh(new THREE.DodecahedronGeometry(0.03 + random() * 0.03, 0), lit(random() < 0.5 ? C.stone : '#b9b6aa'), x, 0.02, z)
      pebble.scale.y = 0.45
      g.add(pebble)
    } else if (kind < 0.8) {
      const ripple = mesh(new THREE.BoxGeometry(0.3 + random() * 0.4, 0.004, 0.02), lit(C.sandDark), x, 0.015, z)
      ripple.rotation.y = (random() - 0.5) * 0.5
      ripple.castShadow = false
      g.add(ripple)
    } else {
      const shell = mesh(new THREE.ConeGeometry(0.03, 0.02, 7), lit(random() < 0.5 ? '#ffd9c8' : '#f4f1e8'), x, 0.024, z)
      shell.rotation.y = random() * 6
      g.add(shell)
    }
  }
  return { solid: g }
}

/** Fonds du trophée de pêche : leur dessin, sur un panneau de 256 × 172. */
const BACKGROUNDS: Record<string, (g: CanvasRenderingContext2D, w: number, h: number) => void> = {
  white: (g, w, h) => {
    g.fillStyle = '#f4f1e8'
    g.fillRect(0, 0, w, h)
  },
  water: (g, w, h) => {
    const sea = g.createLinearGradient(0, 0, 0, h)
    sea.addColorStop(0, '#7fd8ea')
    sea.addColorStop(1, '#1f6f9a')
    g.fillStyle = sea
    g.fillRect(0, 0, w, h)
    g.strokeStyle = 'rgba(255, 255, 255, 0.35)'
    g.lineWidth = 2
    for (let y = 18; y < h; y += 26) {
      g.beginPath()
      for (let x = -10; x <= w + 10; x += 10) g.lineTo(x, y + Math.sin((x + y * 3) / 18) * 4)
      g.stroke()
    }
    g.fillStyle = 'rgba(255, 255, 255, 0.5)'
    for (const [x, y, r] of [[30, 120, 5], [42, 96, 3], [216, 60, 4], [226, 38, 2.5], [120, 150, 3]]) {
      g.beginPath()
      g.arc(x, y, r, 0, Math.PI * 2)
      g.fill()
    }
  },
  sand: (g, w, h) => {
    g.fillStyle = '#e2c98f'
    g.fillRect(0, 0, w, h)
    g.strokeStyle = '#cdb27a'
    g.lineWidth = 2
    for (let y = 14; y < h; y += 20) {
      g.beginPath()
      for (let x = -10; x <= w + 10; x += 12) g.lineTo(x, y + Math.sin(x / 26 + y) * 3)
      g.stroke()
    }
  },
  night: (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, w, h)
    sky.addColorStop(0, '#0a1030')
    sky.addColorStop(1, '#2a1648')
    g.fillStyle = sky
    g.fillRect(0, 0, w, h)
    g.fillStyle = '#ffffff'
    for (let i = 0; i < 60; i++) {
      const x = (i * 97) % w, y = (i * 57 + (i % 7) * 13) % h
      g.globalAlpha = 0.35 + ((i * 31) % 60) / 100
      g.fillRect(x, y, i % 9 === 0 ? 2.5 : 1.5, i % 9 === 0 ? 2.5 : 1.5)
    }
    g.globalAlpha = 1
  },
  wood: (g, w, h) => {
    g.fillStyle = '#b98a58'
    g.fillRect(0, 0, w, h)
    for (let y = 0; y < h; y += 43) {
      g.fillStyle = (y / 43) % 2 ? '#b08050' : '#c4955f'
      g.fillRect(0, y, w, 41)
      g.fillStyle = '#7a5636'
      g.fillRect(0, y + 41, w, 2)
      g.strokeStyle = 'rgba(90, 60, 30, 0.25)'
      g.lineWidth = 1
      for (let k = 0; k < 3; k++) {
        g.beginPath()
        g.moveTo(0, y + 8 + k * 12)
        g.bezierCurveTo(w * 0.3, y + 4 + k * 12, w * 0.6, y + 14 + k * 12, w, y + 9 + k * 12)
        g.stroke()
      }
    }
  },
}
const backgrounds = new Map<string, THREE.Material>()
function background(id: string): THREE.Material {
  let m = backgrounds.get(id)
  if (!m) {
    m = keepShared(new THREE.MeshBasicMaterial({ map: keepShared(drawnTexture(256, 172, (g) => BACKGROUNDS[id](g, 256, 172))) }))
    backgrounds.set(id, m)
  }
  return m
}

/**
 * Trophée de pêche, à accrocher : un poisson de l'étang, en volume, monté sur un panneau encadré
 * de bois, le nez à droite, et sa plaque de laiton. `label` : « espèce » ou « espèce:fond » (white,
 * water, sand, night, wood ; cf. shared/fishing.js et le catalogue). Dos au mur (z = 0), face à +z.
 */
const fishFrame: Builder = ({ label }) => {
  const [id, tint] = (label ?? '').split(':')
  const fish = fishById(id) ?? FISH[0]
  const g = new THREE.Group()
  const wood = lit(C.woodDark, 'wood')
  g.add(box(0.6, 0.42, 0.02, wood, 0, 0.62, 0.01))
  for (const y of [0.42, 0.82]) g.add(box(0.6, 0.025, 0.035, wood, 0, y, 0.0175))
  for (const x of [-0.29, 0.29]) g.add(box(0.025, 0.42, 0.035, wood, x, 0.62, 0.0175))
  g.add(mesh(new THREE.PlaneGeometry(0.555, 0.375), background(BACKGROUNDS[tint] ? tint : 'white'), 0, 0.62, 0.0215))
  g.add(box(0.14, 0.03, 0.006, lit('#c9a24a'), 0, 0.455, 0.035))
  // La raie se montre à plat, vue de dessus ; les autres de profil. Tous le nez à droite.
  const flat = fish.model === 'manta'
  const mount = fishModel(fish, flat ? 0.4 : 0.42)
  if (flat) mount.quaternion.setFromEuler(new THREE.Euler(Math.PI / 2, 0, Math.PI / 2, 'ZXY'))
  else mount.rotation.y = Math.PI / 2
  mount.updateMatrixWorld(true)
  // Posé contre le panneau : son point le plus proche du mur à fleur du fond. Un poisson plus haut
  // que le panneau (le poisson-lune) est réduit pour y tenir.
  const b = new THREE.Box3().setFromObject(mount)
  const tall = b.max.y - b.min.y
  if (tall > 0.33) {
    mount.scale.setScalar(0.33 / tall)
    mount.updateMatrixWorld(true)
    b.setFromObject(mount)
  }
  mount.position.set(-(b.min.x + b.max.x) / 2, 0.64 - (b.min.y + b.max.y) / 2, 0.026 - b.min.z)
  g.add(mount)
  return { solid: g }
}

/**
 * Torche de jardin (sans collision) : une canne de bambou, une coupe de fibre tressée, une flamme
 * qui danse.
 */
const tikiTorch: Builder = ({ random }) => {
  const g = new THREE.Group()
  g.add(cylinder(0.014, 0.018, 0.78, lit('#b89a5a'), 0, 0.39, 0, 6))
  for (const y of [0.2, 0.45]) g.add(cylinder(0.02, 0.02, 0.012, lit('#8a7040'), 0, y, 0, 6))
  g.add(cylinder(0.05, 0.022, 0.09, lit('#7a5636'), 0, 0.82, 0, 8), cylinder(0.046, 0.046, 0.012, lit('#2a2018'), 0, 0.862, 0, 8))
  const live = new THREE.Group()
  const flame = part(new THREE.ConeGeometry(0.032, 0.11, 6), new THREE.MeshBasicMaterial({ color: '#ffb02e' }), 0, 0.925, 0)
  const core = part(new THREE.ConeGeometry(0.016, 0.06, 5), new THREE.MeshBasicMaterial({ color: '#fff2b0' }), 0, 0.905, 0)
  live.add(flame, core)
  const phase = random() * 6
  return {
    solid: g,
    live,
    update(t) {
      const f = renderQuality.light ? 1 : 1 + 0.18 * Math.sin(t * 11 + phase) + 0.1 * Math.sin(t * 23 + phase * 2)
      flame.scale.set(1 / Math.sqrt(f), f, 1 / Math.sqrt(f))
      flame.position.y = 0.87 + 0.055 * f
      flame.rotation.z = renderQuality.light ? 0 : Math.sin(t * 5 + phase) * 0.12
    },
  }
}

/**
 * Transat de plage, les pieds vers +z : un cadre de bois, une toile rayée, un dossier relevé. On
 * s'y allonge (cf. SEATS).
 */
const beachLounger: Builder = ({ label }) => {
  const g = new THREE.Group()
  const wood = lit(C.woodLight, 'wood'), [a, b] = label === 'blue' ? ['#3f8fc8', '#f4f1e8'] : ['#ff7a5a', '#f4f1e8']
  for (const x of [-0.24, 0.24]) g.add(box(0.04, 0.04, 1.1, wood, x, 0.2, 0.05))
  for (const [x, z] of [[-0.24, -0.4], [0.24, -0.4], [-0.24, 0.5], [0.24, 0.5]]) g.add(box(0.04, 0.2, 0.04, wood, x, 0.1, z))
  // La toile : des bandes de couleur, à plat, puis le dossier relevé.
  for (let i = 0; i < 6; i++) g.add(box(0.44, 0.02, 0.125, lit(i % 2 ? b : a), 0, 0.225, -0.1 + i * 0.125))
  const back = new THREE.Group()
  back.position.set(0, 0.225, -0.16)
  back.rotation.x = -0.75
  for (let i = 0; i < 4; i++) back.add(box(0.44, 0.02, 0.125, lit(i % 2 ? a : b), 0, 0, -0.0625 - i * 0.125))
  g.add(back, box(0.04, 0.3, 0.04, wood, -0.24, 0.3, -0.42), box(0.04, 0.3, 0.04, wood, 0.24, 0.3, -0.42))
  return { solid: g }
}

/** Parasol de plage (sans collision) : un mât blanc, une toile à huit pans de deux couleurs, un peu penchée. */
const parasol: Builder = ({ label }) => {
  const g = new THREE.Group()
  const [a, b] = label === 'blue' ? ['#3f8fc8', '#f4f1e8'] : ['#ff7a5a', '#f4f1e8']
  g.add(cylinder(0.014, 0.014, 1.25, lit('#f1efe8'), 0, 0.625, 0, 6), cylinder(0.07, 0.09, 0.04, lit('#8a8a84'), 0, 0.02, 0, 10))
  const top = new THREE.Group()
  top.position.set(0, 1.2, 0)
  top.rotation.set(0.12, 0, -0.1)
  for (let i = 0; i < 8; i++) {
    const pane = mesh(new THREE.ConeGeometry(0.62, 0.2, 8, 1, true, (i / 8) * Math.PI * 2, Math.PI / 4), new THREE.MeshLambertMaterial({ color: i % 2 ? b : a, side: THREE.DoubleSide }), 0, 0, 0)
    top.add(pane)
  }
  top.add(sphere(0.022, lit('#f1efe8'), 0, 0.11, 0, 6))
  g.add(top)
  return { solid: g }
}

export const FISHING = {
  'tiki-torch': tikiTorch,
  'beach-lounger': beachLounger,
  parasol,
  'fish-frame': fishFrame,
  'fishing-pond': fishingPond,
  'fishing-dock': fishingDock,
  'fish-book': fishBook,
  'sand-patch': sandPatch,
} satisfies Record<string, Builder>
