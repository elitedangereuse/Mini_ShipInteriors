import * as THREE from 'three'
import { box, cylinder, drawnTexture, glow, keepShared, lit, mesh, part, sphere, type Builder } from './kit'
import { tr } from '../i18n'

/*
 * Le placard à balais de la cale, entre l'atelier et le couloir du Zorb : deux tuiles sur deux,
 * une ampoule nue, et tout ce qu'il faut pour tenir un vaisseau propre. Râtelier à balais, seau
 * à roulettes, étagère de produits, robot laveur sur sa base, panneau « sol glissant ».
 *
 * Un objet accroché est construit dos au mur (origine sur la face du mur, au niveau du sol,
 * contenu vers +z).
 */

const C = {
  steel: '#5a5e66',
  steelDark: '#2d2f33',
  black: '#17181b',
  wood: '#a07a4a',
  yellow: '#f2c21a',
  chrome: '#9aa3ad',
  straw: '#d9b56a',
  mop: '#d8d4c8',
  blue: '#3a7bd5',
  green: '#39b56a',
  pink: '#ff7aa8',
  white: '#e8edf1',
}

/** Manche de bois, debout, de `y0` à `y1`, penché de `lean` vers +x. */
function handle(x: number, y0: number, y1: number, z: number, lean = 0): THREE.Mesh {
  const h = cylinder(0.011, 0.011, y1 - y0, lit(C.wood, 'wood'), x + (lean * (y1 - y0)) / 2, (y0 + y1) / 2, z, 6)
  h.rotation.z = -lean
  return h
}

/** Râtelier mural : un balai de paille, un balai-brosse, un plumeau, une pelle et sa balayette, pendus à leurs crochets. */
const broomRack: Builder = () => {
  const g = new THREE.Group()
  g.add(box(1.1, 0.06, 0.02, lit(C.steelDark, 'metal'), 0, 0.92, 0.01))
  for (const x of [-0.42, -0.14, 0.14, 0.42]) g.add(box(0.03, 0.02, 0.05, lit(C.chrome, 'metal'), x, 0.92, 0.04))
  // Balai de paille : le manche, et la paille serrée par deux liens.
  g.add(handle(-0.42, 0.3, 0.98, 0.05), mesh(new THREE.CylinderGeometry(0.035, 0.1, 0.26, 8), lit(C.straw), -0.42, 0.17, 0.05), box(0.09, 0.012, 0.09, lit('#a8322a'), -0.42, 0.24, 0.05))
  // Balai-brosse.
  g.add(handle(-0.14, 0.1, 0.98, 0.05), box(0.26, 0.04, 0.06, lit(C.wood, 'wood'), -0.14, 0.09, 0.05), box(0.25, 0.06, 0.05, lit(C.black), -0.14, 0.04, 0.05))
  // Plumeau.
  g.add(handle(0.14, 0.6, 0.98, 0.05))
  const feathers = sphere(0.07, lit(C.pink), 0.14, 0.52, 0.05, 8)
  feathers.scale.set(1, 1.5, 1)
  g.add(feathers)
  // Pelle et balayette.
  g.add(box(0.2, 0.22, 0.02, lit(C.blue), 0.42, 0.7, 0.04), box(0.03, 0.14, 0.02, lit(C.blue), 0.42, 0.87, 0.04), box(0.14, 0.05, 0.03, lit(C.black), 0.42, 0.56, 0.07), box(0.025, 0.14, 0.02, lit(C.blue), 0.42, 0.48, 0.07))
  return { solid: g }
}

/** Seau à roulettes et son essoreuse, le balai à franges planté dedans, et une flaque au pied. */
const mopBucket: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.34, 0.24, 0.26, lit(C.yellow), 0, 0.17, 0, 0.02), box(0.3, 0.01, 0.22, lit('#5d8fb0'), 0, 0.27, 0), box(0.16, 0.12, 0.24, lit('#d9a30f'), 0.08, 0.33, 0, 0.01))
  for (const x of [-0.13, 0.13]) for (const z of [-0.09, 0.09]) g.add(sphere(0.025, lit(C.black), x, 0.025, z, 6))
  // Le levier de l'essoreuse, et le balai à franges.
  g.add(handle(0.17, 0.36, 0.62, 0, 0.5), handle(-0.06, 0.26, 1.05, 0.02, -0.12))
  const mop = sphere(0.07, lit(C.mop, 'cloth'), -0.05, 0.27, 0.02, 8)
  mop.scale.set(1.2, 0.6, 1.2)
  g.add(mop)
  const puddle = mesh(new THREE.CircleGeometry(0.2, 14), lit('#3c4a55'), 0.12, 0.004, 0.24)
  puddle.rotation.x = -Math.PI / 2
  puddle.scale.set(1.3, 0.8, 1)
  g.add(puddle)
  return { solid: g }
}

/** Étagère de produits, adossée au mur : bidons, pulvérisateurs, rouleaux de papier, éponges, chiffons, une caisse de gants. */
const cleaningShelf: Builder = ({ random }) => {
  const g = new THREE.Group()
  const w = 1.1, d = 0.28
  for (const x of [-w / 2 + 0.015, w / 2 - 0.015]) g.add(box(0.03, 1.1, d, lit(C.steel, 'metal'), x, 0.55, d / 2))
  const levels = [0.06, 0.4, 0.74, 1.08]
  for (const y of levels) g.add(box(w, 0.02, d, lit(C.steelDark, 'metal'), 0, y, d / 2))
  const bottles = [C.blue, C.green, C.pink, C.yellow, C.white, '#b06bff']
  levels.slice(0, 3).forEach((y, row) => {
    let x = -w / 2 + 0.1
    while (x < w / 2 - 0.08) {
      const top = y + 0.01, kind = (row + Math.floor(random() * 3)) % 4
      const color = lit(bottles[Math.floor(random() * bottles.length)])
      if (kind === 0) {
        // Bidon à poignée.
        g.add(box(0.12, 0.19, 0.1, color, x, top + 0.095, d / 2, 0.015), cylinder(0.02, 0.02, 0.03, lit(C.white), x - 0.03, top + 0.2, d / 2, 8))
        x += 0.17
      } else if (kind === 1) {
        // Pulvérisateur.
        g.add(cylinder(0.035, 0.04, 0.14, color, x, top + 0.07, d / 2, 10), box(0.03, 0.04, 0.07, lit(C.white), x, top + 0.16, d / 2 + 0.015))
        x += 0.12
      } else if (kind === 2) {
        // Rouleaux de papier, empilés.
        for (let k = 0; k < 2; k++) g.add(cylinder(0.05, 0.05, 0.09, lit(C.white), x, top + 0.045 + k * 0.092, d / 2, 12))
        x += 0.14
      } else {
        // Éponges et chiffons.
        g.add(box(0.1, 0.035, 0.07, lit(C.yellow), x, top + 0.018, d / 2 - 0.03), box(0.1, 0.012, 0.07, lit(C.green), x, top + 0.041, d / 2 - 0.03), box(0.12, 0.05, 0.1, lit(C.pink, 'cloth'), x, top + 0.025, d / 2 + 0.06, 0.012))
        x += 0.17
      }
    }
  })
  g.add(box(0.3, 0.12, 0.2, lit('#c9a070'), -0.3, 1.15, d / 2), box(0.2, 0.1, 0.18, lit(C.blue), 0.25, 1.14, d / 2))
  return { solid: g }
}

/**
 * Robot laveur sur sa base de recharge : un palet gris, son œil de diode qui respire, et de temps
 * en temps un soubresaut, comme s'il rêvait de la coursive.
 */
const cleaningRobot: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.3, 0.02, 0.16, lit(C.steelDark, 'metal'), 0, 0.01, -0.16), box(0.3, 0.12, 0.04, lit(C.black), 0, 0.06, -0.24), box(0.04, 0.02, 0.006, glow('#39d98a'), 0.1, 0.09, -0.218))
  const live = new THREE.Group()
  const bot = new THREE.Group()
  bot.add(part(new THREE.CylinderGeometry(0.17, 0.17, 0.07, 20), lit('#8a9098', 'metal'), 0, 0.045, 0), part(new THREE.CylinderGeometry(0.175, 0.175, 0.02, 20), lit(C.black), 0, 0.02, 0))
  bot.add(part(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 12), lit(C.steelDark, 'metal'), 0, 0.09, 0))
  const eye = new THREE.MeshBasicMaterial({ color: '#7fe6ff' })
  bot.add(part(new THREE.BoxGeometry(0.08, 0.014, 0.006), eye, 0, 0.055, 0.17))
  live.add(bot)
  const dim = new THREE.Color('#1c4a5a'), bright = new THREE.Color('#aef4ff')
  return {
    solid: g,
    live,
    update: (t) => {
      eye.color.copy(dim).lerp(bright, 0.5 + 0.5 * Math.sin(t * 1.6))
      // Toutes les quatorze secondes, il sursaute sur sa base.
      const k = (t % 14) - 13.2
      bot.position.z = k > 0 ? Math.sin(k * 40) * 0.008 : 0
      bot.rotation.y = k > 0 ? Math.sin(k * 26) * 0.06 : 0
    },
  }
}

let wetSign: THREE.Texture | undefined

/** Panneau « sol glissant », en chevalet jaune : le bonhomme qui tombe, et l'avertissement. */
const wetFloorSign: Builder = () => {
  wetSign ??= keepShared(drawnTexture(96, 160, (c) => {
    c.fillStyle = C.yellow
    c.fillRect(0, 0, 96, 160)
    c.fillStyle = C.black
    // Le triangle, et le bonhomme qui glisse.
    c.beginPath()
    c.moveTo(48, 14)
    c.lineTo(84, 76)
    c.lineTo(12, 76)
    c.closePath()
    c.fill()
    c.fillStyle = C.yellow
    c.beginPath()
    c.arc(56, 38, 6, 0, Math.PI * 2)
    c.fill()
    c.lineWidth = 5
    c.strokeStyle = C.yellow
    c.lineCap = 'round'
    c.beginPath()
    c.moveTo(52, 46)
    c.lineTo(42, 58)
    c.lineTo(30, 56)
    c.moveTo(42, 58)
    c.lineTo(56, 68)
    c.moveTo(48, 50)
    c.lineTo(62, 54)
    c.stroke()
    c.fillStyle = C.black
    c.font = '900 17px system-ui, sans-serif'
    c.textAlign = 'center'
    c.fillText(tr('SOL', 'WET'), 48, 108)
    c.fillText(tr('GLISSANT', 'FLOOR'), 48, 130)
  }))
  const g = new THREE.Group()
  const face = new THREE.MeshLambertMaterial({ map: wetSign })
  for (const s of [1, -1]) {
    const panel = new THREE.Group()
    panel.position.set(0, 0.26, s * 0.07)
    panel.rotation.x = s * -0.27
    panel.rotation.y = s > 0 ? 0 : Math.PI
    panel.add(box(0.24, 0.5, 0.012, lit(C.yellow), 0, 0, 0), part(new THREE.PlaneGeometry(0.22, 0.37), face, 0, 0.04, 0.0065))
    g.add(panel)
  }
  g.add(box(0.2, 0.02, 0.03, lit(C.yellow), 0, 0.51, 0))
  return { solid: g }
}

export const CLOSET = {
  'broom-rack': broomRack,
  'mop-bucket': mopBucket,
  'cleaning-shelf': cleaningShelf,
  'cleaning-robot': cleaningRobot,
  'wet-floor-sign': wetFloorSign,
} satisfies Record<string, Builder>
