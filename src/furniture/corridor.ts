import * as THREE from 'three'
import { box, decal, drawnTexture, ED_ORANGE, glow, instanced, lit, part, setInstance, type Builder } from './kit'
import { tr } from '../i18n'

/*
 * La coursive du pont principal : un sol de tôles claires dessiné d'un seul tenant, de mur à mur
 * (le même que celui de la Promenade, cf. promenade.ts), son allée bordée de deux filets orange où
 * courent des feux de guidage vers la proue ; devant chaque porte, le nom de la pièce peint au sol
 * dans sa couleur, son seuil lumineux et son enseigne au mur ; des pilastres lumineux et un filet
 * de lumière au pied des cloisons. Rien n'y arrête le pas : tout est au sol ou contre les murs.
 */

/** Longueur de la coursive (le long de x), sa largeur de mur à mur (axes des cloisons), et la distance des filets de l'allée à l'axe. */
const LENGTH = 17, WIDTH = 2
export const EDGE = 0.6
/** Du milieu de la coursive à la face de ses cloisons. */
const WALL = 0.85
/** Vitesse des feux de guidage, en tuiles par seconde, et écart entre deux feux. */
export const GUIDE_SPEED = 2.9, GUIDE_GAP = 2.85

const dark = lit('#22262e', 'metal')

/**
 * Les portes de la coursive : leur place le long du chemin (par rapport à son milieu), leur côté
 * (-1 au nord, 1 au sud), le nom de la pièce et sa couleur.
 */
const DOORS: { x: number; side: -1 | 1; name: () => string; color: string }[] = [
  { x: -4, side: -1, name: () => tr('Infirmerie', 'Medical bay'), color: '#5ff2d8' },
  { x: 1, side: -1, name: () => tr('Salle de sport', 'Gym'), color: '#ff7a5a' },
  { x: 6, side: -1, name: () => tr('Labo L.J.P.C.', 'L.J.P.C. lab'), color: '#7dffa8' },
  { x: -4, side: 1, name: () => 'Mess', color: '#ffc27a' },
  { x: 1, side: 1, name: () => 'Arcade', color: '#ff5fd8' },
  { x: 6, side: 1, name: () => 'Arcade', color: '#5fdcff' },
]

/** Les aciers du sol : la tôle, l'allée un peu plus claire, les rives au pied des cloisons, les joints. */
export const STEEL = { plate: '#c3c8d6', lane: '#cfd4e0', rim: '#9299ad', seam: 'rgba(40, 46, 66, 0.4)', shine: 'rgba(255, 255, 255, 0.3)', ink: '#343a4d', paint: 'rgba(232, 112, 16, 0.85)' }

/** Le brossé d'une tôle, dans le sens de x : des filets clairs et sombres, à peine visibles. */
export function brushed(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  for (let k = 0; k < h; k += 3) {
    g.fillStyle = `rgba(${k % 2 ? '255, 255, 255' : '70, 80, 110'}, ${0.035 + ((k * 37) % 5) * 0.011})`
    g.fillRect(x, y + k, w, 1)
  }
}

/** Un joint entre deux tôles (de a à b) : un trait sombre, et son reflet. */
export function seam(g: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number) {
  const vertical = ax === bx
  g.fillStyle = STEEL.seam
  g.fillRect(ax, ay, vertical ? 2 : bx - ax, vertical ? by - ay : 2)
  g.fillStyle = STEEL.shine
  g.fillRect(ax + (vertical ? 2 : 0), ay + (vertical ? 0 : 2), vertical ? 1 : bx - ax, vertical ? by - ay : 1)
}

/** Un rivet. */
export function rivet(g: CanvasRenderingContext2D, x: number, y: number, r = 3) {
  g.fillStyle = STEEL.seam
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = STEEL.shine
  g.beginPath()
  g.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, Math.PI * 2)
  g.fill()
}

/**
 * Une travée du sol de la coursive (1 de long, 2 de large, d'axe de cloison à axe de cloison) : les
 * rives, deux tôles de côté, l'allée au milieu et son chevron vers la proue.
 */
function floorTexture(): THREE.CanvasTexture {
  const U = 256, lane = [(1 - EDGE) * U, (1 + EDGE) * U]
  const t = drawnTexture(U, 2 * U, (g) => {
    g.fillStyle = STEEL.plate
    g.fillRect(0, 0, U, 2 * U)
    g.fillStyle = STEEL.lane
    g.fillRect(0, lane[0], U, lane[1] - lane[0])
    brushed(g, 0, 0, U, 2 * U)
    // Les rives : une bande d'acier plus soutenue au pied de chaque cloison.
    g.fillStyle = STEEL.rim
    g.fillRect(0, 0, U, 0.24 * U)
    g.fillRect(0, 1.76 * U, U, 0.24 * U)
    seam(g, 0, 0.24 * U, U, 0.24 * U)
    seam(g, 0, 1.76 * U - 2, U, 1.76 * U - 2)
    // Un joint en travers par travée, et ses rivets.
    seam(g, 0, 0.24 * U, 0, 1.76 * U)
    for (const y of [0.3, 0.38, 0.62, 0.72, 1.28, 1.38, 1.62, 1.7]) rivet(g, 13, y * U)
    g.strokeStyle = STEEL.paint
    g.lineWidth = 7
    g.beginPath()
    g.moveTo(112, U - 24)
    g.lineTo(140, U)
    g.lineTo(112, U + 24)
    g.stroke()
  })
  t.wrapS = THREE.RepeatWrapping
  t.repeat.set(LENGTH, 1)
  return t
}

/** Le nom d'une pièce, en capitales, et une flèche vers sa porte (texte blanc : la couleur vient du matériau). */
function nameTexture(name: string, arrow: boolean): THREE.CanvasTexture {
  return drawnTexture(512, 128, (g) => {
    g.fillStyle = g.strokeStyle = '#fff'
    g.textBaseline = 'middle'
    g.textAlign = 'center'
    g.font = '800 58px system-ui, "Segoe UI", sans-serif'
    const text = name.toUpperCase()
    const w = Math.min(g.measureText(text).width, arrow ? 400 : 480)
    const x = arrow ? 256 + 36 : 256
    g.fillText(text, x, 68, w)
    if (!arrow) return
    g.beginPath()
    g.moveTo(x - w / 2 - 64, 92)
    g.lineTo(x - w / 2 - 36, 36)
    g.lineTo(x - w / 2 - 8, 92)
    g.fill()
  })
}

/**
 * Peinture lumineuse d'un texte : découpée (et non translucide), pour passer avant le chemin de
 * roulement, translucide, sur lequel elle est posée.
 */
const paintMaterial = (map: THREE.Texture, color: string) => new THREE.MeshBasicMaterial({ map, color, alphaTest: 0.45, polygonOffset: true, polygonOffsetFactor: -4 })

/**
 * Le sol de la coursive (17 × 2, le long de x, posé au milieu) : ses tôles, de mur à mur, les deux
 * filets de l'allée, les feux de guidage qui filent vers la proue (+x), et devant chaque porte son nom, son
 * seuil et le trait qui y mène.
 */
const corridorFloor: Builder = () => {
  const g = new THREE.Group()
  g.add(decal(floorTexture(), LENGTH, WIDTH))
  for (const s of [-1, 1]) g.add(box(LENGTH, 0.004, 0.022, glow(ED_ORANGE), 0, 0.009, s * EDGE))
  for (const d of DOORS) {
    const paint = glow(d.color)
    // Le seuil, au pied de la porte, et le trait qui le relie au filet.
    g.add(box(0.8, 0.004, 0.03, paint, d.x, 0.009, d.side * (WALL - 0.03)), box(0.03, 0.004, WALL - EDGE - 0.03, paint, d.x, 0.009, (d.side * (WALL + EDGE - 0.03)) / 2))
    // Le nom, lisible par qui regarde la porte : sa couleur, foncée pour trancher sur la tôle claire.
    const label = part(new THREE.PlaneGeometry(0.92, 0.23), paintMaterial(nameTexture(d.name(), true), `#${new THREE.Color(d.color).multiplyScalar(0.5).getHexString()}`), d.x, 0.011, d.side * (EDGE - 0.17))
    label.rotation.set(-Math.PI / 2, 0, d.side > 0 ? Math.PI : 0)
    g.add(label)
  }
  // Les feux de guidage : des traits bleus qui courent sur les deux filets.
  const n = Math.ceil(LENGTH / GUIDE_GAP) + 1
  const lights = instanced(new THREE.BoxGeometry(0.32, 0.006, 0.05), Array.from({ length: n * 2 }, () => '#35c4ff'))
  const scale = new THREE.Vector3()
  return {
    solid: g,
    live: lights,
    update(t) {
      for (let i = 0; i < n; i++) {
        // Chaque feu naît à la poupe, grandit, file, et s'éteint à la proue.
        const x = ((((t * GUIDE_SPEED + i * GUIDE_GAP) % (n * GUIDE_GAP)) + n * GUIDE_GAP) % (n * GUIDE_GAP)) - LENGTH / 2
        const k = x > LENGTH / 2 ? 0 : Math.min(1, (x + LENGTH / 2) / 1.2, (LENGTH / 2 - x) / 1.2)
        scale.set(Math.max(k, 0.001), 1, 1)
        for (const s of [0, 1]) setInstance(lights, i * 2 + s, Math.min(x, LENGTH / 2), 0.012, (s ? 1 : -1) * EDGE, scale)
      }
      lights.instanceMatrix.needsUpdate = true
    },
  }
}

/**
 * Enseigne d'une porte (0,62 de large, contre le mur, face à +z) : une plaque sombre, le nom de la
 * pièce en lettres lumineuses, un filet de sa couleur. `label` : « nom|couleur ».
 */
const corridorSign: Builder = ({ label = 'Coursive|#ff8a1c' }) => {
  const [name, color = ED_ORANGE] = label.split('|')
  const g = new THREE.Group()
  g.add(box(0.62, 0.2, 0.025, dark, 0, 0.78, 0.012, 0.008), box(0.56, 0.012, 0.008, glow(color), 0, 0.695, 0.028))
  g.add(part(new THREE.PlaneGeometry(0.56, 0.14), paintMaterial(nameTexture(name, false), color), 0, 0.79, 0.03))
  return { solid: g }
}

/**
 * Pilastre lumineux (contre le mur, face à +z) : un montant sombre du sol au haut de la cloison,
 * une lame de lumière froide, deux bagues orange.
 */
const corridorPilaster: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.16, 1, 0.05, dark, 0, 0.5, 0.025, 0.01), box(0.045, 0.78, 0.012, glow('#cfe8ff'), 0, 0.5, 0.054))
  for (const y of [0.07, 0.93]) g.add(box(0.17, 0.02, 0.058, glow(ED_ORANGE), 0, y, 0.027))
  return { solid: g }
}

/** Filet de lumière au pied d'une cloison (le long de x, face à +z). `label` : sa longueur. */
const corridorSkirt: Builder = ({ label = '1' }) => {
  const g = new THREE.Group()
  const length = Number(label) || 1
  g.add(box(length, 0.05, 0.02, dark, 0, 0.035, 0.01), box(length - 0.04, 0.012, 0.01, glow('#a8d4ff'), 0, 0.045, 0.022))
  return { solid: g }
}

export const CORRIDOR = {
  'corridor-floor': corridorFloor,
  'corridor-sign': corridorSign,
  'corridor-pilaster': corridorPilaster,
  'corridor-skirt': corridorSkirt,
} satisfies Record<string, Builder>
