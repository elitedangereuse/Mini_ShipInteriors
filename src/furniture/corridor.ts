import * as THREE from 'three'
import { box, decal, drawnTexture, ED_ORANGE, glow, instanced, lit, part, setInstance, type Builder } from './kit'
import { tr } from '../i18n'

/*
 * La coursive du pont principal : un chemin de roulement sombre bordé de deux filets orange, où
 * courent des feux de guidage vers la proue ; devant chaque porte, le nom de la pièce peint au sol
 * dans sa couleur, son seuil lumineux et son enseigne au mur ; des pilastres lumineux et un filet
 * de lumière au pied des cloisons. Rien n'y arrête le pas : tout est au sol ou contre les murs.
 */

/** Longueur du chemin (le long de x), sa largeur, et la distance de ses filets à l'axe. */
const LENGTH = 15, WIDTH = 1.24, EDGE = 0.6
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
  { x: -5, side: -1, name: () => tr('Infirmerie', 'Medical bay'), color: '#5ff2d8' },
  { x: 0, side: -1, name: () => tr('Salle de sport', 'Gym'), color: '#ff7a5a' },
  { x: 5, side: -1, name: () => tr('Labo L.J.P.C.', 'L.J.P.C. lab'), color: '#7dffa8' },
  { x: -5, side: 1, name: () => 'Mess', color: '#ffc27a' },
  { x: 0, side: 1, name: () => tr('Arcade', 'Arcade'), color: '#ff5fd8' },
  { x: 5, side: 1, name: () => tr('Arcade', 'Arcade'), color: '#5fdcff' },
]

/** Une tuile du chemin de roulement : tôle sombre antidérapante, liserés de laiton, un chevron vers la proue. */
function laneTexture(): THREE.CanvasTexture {
  const t = drawnTexture(256, 256, (g) => {
    g.fillStyle = '#1b1e25'
    g.fillRect(0, 0, 256, 256)
    // Les larmes de la tôle, en quinconce.
    g.fillStyle = 'rgba(255, 255, 255, 0.055)'
    for (let j = 0; j < 12; j++) {
      for (let i = 0; i < 8; i++) {
        g.save()
        g.translate(i * 32 + (j % 2 ? 16 : 0) + 8, 30 + j * 17)
        g.rotate(j % 2 ? 0.7 : -0.7)
        g.fillRect(-7, -1.5, 14, 3)
        g.restore()
      }
    }
    // Les bords : une bande plus sombre et un filet de laiton.
    g.fillStyle = '#0d0e12'
    g.fillRect(0, 0, 256, 20)
    g.fillRect(0, 236, 256, 20)
    g.fillStyle = '#8a7238'
    g.fillRect(0, 20, 256, 2)
    g.fillRect(0, 234, 256, 2)
    // Un joint entre deux tôles, et le chevron.
    g.fillStyle = 'rgba(0, 0, 0, 0.5)'
    g.fillRect(0, 22, 2, 212)
    g.strokeStyle = 'rgba(255, 138, 28, 0.5)'
    g.lineWidth = 7
    g.beginPath()
    g.moveTo(112, 104)
    g.lineTo(140, 128)
    g.lineTo(112, 152)
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
 * Le sol de la coursive (15 × 1,7, le long de x, posé au milieu) : le chemin de roulement, ses deux
 * filets, les feux de guidage qui filent vers la proue (+x), et devant chaque porte son nom, son
 * seuil et le trait qui y mène.
 */
const corridorFloor: Builder = () => {
  const g = new THREE.Group()
  g.add(decal(laneTexture(), LENGTH, WIDTH))
  for (const s of [-1, 1]) g.add(box(LENGTH, 0.004, 0.022, glow(ED_ORANGE), 0, 0.009, s * EDGE))
  for (const d of DOORS) {
    const paint = glow(d.color)
    // Le seuil, au pied de la porte, et le trait qui le relie au filet.
    g.add(box(0.8, 0.004, 0.03, paint, d.x, 0.009, d.side * (WALL - 0.03)), box(0.03, 0.004, WALL - EDGE - 0.03, paint, d.x, 0.009, (d.side * (WALL + EDGE - 0.03)) / 2))
    // Le nom, lisible par qui regarde la porte.
    const label = part(new THREE.PlaneGeometry(0.92, 0.23), paintMaterial(nameTexture(d.name(), true), d.color), d.x, 0.011, d.side * (EDGE - 0.17))
    label.rotation.set(-Math.PI / 2, 0, d.side > 0 ? Math.PI : 0)
    g.add(label)
  }
  // Les feux de guidage : des traits clairs qui courent sur les deux filets.
  const n = Math.ceil(LENGTH / GUIDE_GAP) + 1
  const lights = instanced(new THREE.BoxGeometry(0.32, 0.006, 0.05), Array.from({ length: n * 2 }, () => '#fff0d0'))
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
