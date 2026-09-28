import * as THREE from 'three'
import { barX, barZ, box, cylinder, decal, drawnTexture, hazardTexture, lit, mesh, type Builder } from './kit'
import { tr } from '../i18n'

/*
 * Les pièces en travaux (cf. CLOSED_ROOMS) : échafaudages, panneaux « Bientôt », cônes,
 * bâches et rubalise. Le jaune de chantier de la cale, en plus propre.
 */

const C = {
  hazard: '#e9a917',
  steel: '#8a9099',
  steelDark: '#2d2f33',
  plank: '#8a6a44',
  tarp: '#2f5d8a',
  tarpDark: '#244a6e',
  cone: '#ff6a1c',
  white: '#f2f2ee',
}

/** Échafaudage roulant (1 × 0,5, 1,1 de haut) : tubes jaunes, deux planchers, une bâche. */
const scaffold: Builder = () => {
  const g = new THREE.Group()
  const W = 1, D = 0.5, H = 1.1
  const tube = lit(C.hazard)
  for (const x of [-W / 2, W / 2]) {
    for (const z of [-D / 2, D / 2]) {
      g.add(cylinder(0.022, 0.022, H, tube, x, H / 2 + 0.05, z, 8))
      g.add(cylinder(0.035, 0.035, 0.04, lit(C.steelDark), x, 0.03, z, 10))
    }
  }
  for (const y of [0.1, 0.55, 1.1]) {
    for (const z of [-D / 2, D / 2]) g.add(barX(0.016, W, tube, 0, y, z, 6))
    for (const x of [-W / 2, W / 2]) g.add(barZ(0.016, D, tube, x, y, 0, 6))
  }
  // Croisillons sur la face arrière.
  const brace = barX(0.012, Math.hypot(W, 0.45), lit(C.steel), 0, 0.33, -D / 2, 6)
  brace.rotation.z = Math.PI / 2 + Math.atan2(0.45, W)
  g.add(brace)
  // Planchers en bois, un seau et une caisse à outils dessus.
  for (const y of [0.57, 1.12]) g.add(box(W - 0.04, 0.03, D - 0.06, lit(C.plank), 0, y, 0))
  g.add(cylinder(0.06, 0.05, 0.1, lit('#c8ccd2'), 0.3, 0.64, 0.05, 10))
  g.add(box(0.2, 0.08, 0.1, lit('#b1302a'), -0.25, 0.63, -0.05, 0.01))
  // Bâche bleue tendue sur le côté gauche.
  const tarp = mesh(new THREE.PlaneGeometry(D, 0.9), new THREE.MeshLambertMaterial({ color: C.tarp, side: THREE.DoubleSide }), -W / 2 - 0.01, 0.6, 0)
  tarp.rotation.y = Math.PI / 2
  g.add(tarp)
  return { solid: g }
}

/**
 * Panneau de chantier sur pied, en chevalet : bordure de bandes de danger, et le texte
 * « TITRE|sous-titre » (par défaut « Bientôt »).
 */
const worksSign: Builder = ({ label = tr('Bientôt', 'Coming soon') }) => {
  const [title, sub = ''] = label.split('|')
  const face = drawnTexture(512, 384, (g) => {
    const stripes = hazardTexture(512, 384, 30).image as HTMLCanvasElement
    g.drawImage(stripes, 0, 0)
    g.fillStyle = C.white
    g.fillRect(34, 34, 444, 316)
    g.fillStyle = '#17181b'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    // Pictogramme : le casque de chantier.
    g.beginPath()
    g.arc(256, 128, 46, Math.PI, 0)
    g.fillStyle = C.hazard
    g.fill()
    g.fillRect(196, 124, 120, 14)
    g.fillStyle = '#17181b'
    let size = 64
    g.font = `800 ${size}px system-ui, "Segoe UI", sans-serif`
    while (g.measureText(title.toUpperCase()).width > 410 && size > 30) g.font = `800 ${(size -= 4)}px system-ui, "Segoe UI", sans-serif`
    g.fillText(title.toUpperCase(), 256, 222)
    if (sub) {
      size = 40
      g.font = `600 ${size}px system-ui, "Segoe UI", sans-serif`
      while (g.measureText(sub).width > 410 && size > 20) g.font = `600 ${(size -= 2)}px system-ui, "Segoe UI", sans-serif`
      g.fillText(sub, 256, 296)
    }
  })
  const g = new THREE.Group()
  // Un peu lumineux : le panneau reste lisible face au soleil comme à contre-jour.
  const board = new THREE.MeshLambertMaterial({ map: face, emissive: '#ffffff', emissiveMap: face, emissiveIntensity: 0.45 })
  // Panneau sur deux pieds lestés, lisible des deux côtés, un peu incliné vers l'arrière.
  const sign = new THREE.Group()
  sign.add(box(0.64, 0.49, 0.03, lit(C.steelDark)))
  for (const side of [1, -1]) {
    const p = mesh(new THREE.PlaneGeometry(0.6, 0.45), board, 0, 0, side * 0.017)
    if (side < 0) p.rotation.y = Math.PI
    sign.add(p)
  }
  sign.position.set(0, 0.5, 0)
  sign.rotation.x = -0.08
  g.add(sign)
  for (const x of [-0.26, 0.26]) {
    g.add(box(0.03, 0.3, 0.03, lit(C.steelDark), x, 0.15, 0))
    g.add(box(0.07, 0.04, 0.3, lit(C.hazard), x, 0.02, 0, 0.01))
  }
  return { solid: g }
}

/** Trois cônes de chantier, dont un couché. */
const cones: Builder = ({ random }) => {
  const g = new THREE.Group()
  const cone = (x: number, z: number, lying = false) => {
    const c = new THREE.Group()
    c.add(box(0.2, 0.02, 0.2, lit('#1d1e21'), 0, 0.01, 0))
    c.add(cylinder(0.02, 0.08, 0.3, lit(C.cone), 0, 0.17, 0, 14))
    c.add(cylinder(0.052, 0.062, 0.05, lit(C.white), 0, 0.18, 0, 14))
    if (lying) {
      c.rotation.z = Math.PI / 2
      c.position.set(x, 0.09, z)
    } else c.position.set(x, 0, z)
    c.rotation.y = random() * Math.PI
    g.add(c)
  }
  cone(-0.2, -0.1)
  cone(0.18, -0.14)
  cone(0.02, 0.2, true)
  return { solid: g }
}

/** Palette bâchée : des caisses sous une toile tendue par des sangles. */
const tarpCrates: Builder = ({ random }) => {
  const g = new THREE.Group()
  g.add(box(0.8, 0.08, 0.6, lit(C.plank), 0, 0.04, 0))
  const h = 0.42 + random() * 0.12
  g.add(box(0.78, h, 0.58, lit(C.tarp), 0, 0.08 + h / 2, 0, 0.05))
  for (const x of [-0.22, 0.22]) g.add(box(0.04, h + 0.01, 0.6, lit(C.hazard), x, 0.08 + h / 2, 0))
  g.add(box(0.5, 0.06, 0.3, lit(C.tarpDark), 0.08, 0.1 + h, -0.05, 0.03))
  return { solid: g }
}

/** Rubalise tendue au sol autour d'un chantier (1,6 × 1,2) : un cadre de bandes rouges et blanches. */
const worksTape: Builder = () => {
  const texture = drawnTexture(256, 192, (g) => {
    for (let x = -192; x < 448; x += 32) {
      g.fillStyle = (x / 32) % 2 ? '#d8262b' : C.white
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x + 32, 0)
      g.lineTo(x + 224, 192)
      g.lineTo(x + 192, 192)
      g.closePath()
      g.fill()
    }
    g.clearRect(14, 14, 228, 164)
  })
  return { live: decal(texture, 1.6, 1.2) }
}

export const WORKS = {
  scaffold,
  'works-sign': worksSign,
  cones,
  'tarp-crates': tarpCrates,
  'works-tape': worksTape,
} satisfies Record<string, Builder>
