import * as THREE from 'three'
import { box, cylinder, drawnTexture, glow, lit, mesh, type Builder } from './kit'

/*
 * Les conduits de ventilation (cf. src/vents.ts), où tombent ceux que les toilettes aspirent
 * pendant un saut FSD : toiles d'araignée, un ventilateur au fond d'une gaine, des mots grattés
 * dans la tôle, et la grille qui donne sur Chez Jacques.
 */

const C = { steel: '#3b4048', steelDark: '#1e2126', rust: '#5a3a26', web: '#cfd5df', bar: '#d9822b' }

/** Fils d'une toile : rayons depuis le coin haut gauche, et arcs qui pendent entre eux. */
function webTexture(random: () => number): THREE.CanvasTexture {
  return drawnTexture(256, 256, (g) => {
    g.strokeStyle = C.web
    g.lineCap = 'round'
    const rays: number[] = []
    for (let a = 0.04; a < Math.PI / 2; a += 0.16 + random() * 0.14) rays.push(a)
    g.lineWidth = 2
    for (const a of rays) {
      g.globalAlpha = 0.55 + random() * 0.35
      g.beginPath()
      g.moveTo(0, 0)
      g.lineTo(Math.cos(a) * 250, Math.sin(a) * 250)
      g.stroke()
    }
    g.lineWidth = 1.4
    for (let r = 34; r < 250; r += 22 + random() * 16) {
      for (let i = 0; i + 1 < rays.length; i++) {
        // Un fil manque de temps en temps : la toile est vieille.
        if (random() < 0.14) continue
        const a = rays[i], b = rays[i + 1], sag = r * (0.9 - random() * 0.05)
        g.globalAlpha = 0.35 + random() * 0.4
        g.beginPath()
        g.moveTo(Math.cos(a) * r, Math.sin(a) * r)
        g.quadraticCurveTo(Math.cos((a + b) / 2) * sag, Math.sin((a + b) / 2) * sag, Math.cos(b) * r, Math.sin(b) * r)
        g.stroke()
      }
    }
  })
}

const webMaterial = (map: THREE.Texture) =>
  new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, color: '#aab3c2' })

/**
 * Toile d'araignée, dans le coin nord-ouest de sa tuile (rot la tourne vers un autre coin) : tendue
 * en travers de l'angle, sous le plafond. `label: 'span'` : en travers de la gaine, d'un mur à
 * l'autre (on passe dessous), avec son araignée au bout d'un fil.
 */
const cobweb: Builder = ({ label, random }) => {
  const live = new THREE.Group()
  const material = webMaterial(webTexture(random))
  if (label === 'span') {
    // Deux quarts de toile dos à dos, accrochés en haut des deux murs.
    for (const side of [-1, 1]) {
      const half = mesh(new THREE.PlaneGeometry(0.5, 0.5), material, side * 0.25, 0.74, 0)
      // Le sommet de chaque quart est en haut de son mur.
      half.scale.x = -side
      live.add(half)
    }
    const thread = box(0.004, 0.3, 0.004, glow('#8a93a3'), 0.12, 0.6, 0)
    const spider = new THREE.Group()
    spider.add(mesh(new THREE.SphereGeometry(0.022, 8, 6), lit('#17141a'), 0, 0, 0))
    spider.add(mesh(new THREE.SphereGeometry(0.014, 8, 6), lit('#17141a'), 0, 0.026, 0))
    for (let k = 0; k < 4; k++) {
      const leg = box(0.07, 0.003, 0.003, lit('#17141a'), 0, 0.006, 0)
      leg.rotation.y = (k - 1.5) * 0.5
      spider.add(leg)
    }
    spider.position.set(0.12, 0.68, 0)
    live.add(thread, spider)
    const phase = random() * 6
    return {
      live,
      update: (t) => {
        // Elle monte et descend au bout de son fil.
        const drop = 0.08 + 0.07 * Math.sin(t * 0.6 + phase)
        const length = 0.23 + drop
        spider.position.y = 0.98 - length
        spider.rotation.y = t * 0.4 + phase
        thread.scale.y = length / 0.3
        thread.position.y = 0.98 - length / 2
      },
    }
  }
  // Le coin de la tuile : la toile est tendue en biais entre les deux murs, le sommet au plafond.
  const web = mesh(new THREE.PlaneGeometry(0.62, 0.62), material, -0.5 + 0.2, 0.7, -0.5 + 0.2)
  web.rotation.y = Math.PI / 4
  live.add(web)
  return { live }
}

/**
 * La grille du bar, au sol, au fond d'une gaine : la lumière de Chez Jacques monte entre ses
 * lames, et bat doucement (la musique, en dessous).
 */
const ventGrate: Builder = () => {
  const g = new THREE.Group()
  const steel = lit(C.steel), dark = lit(C.steelDark)
  for (const s of [-1, 1]) {
    g.add(box(0.84, 0.035, 0.05, steel, 0, 0.02, s * 0.395))
    g.add(box(0.05, 0.035, 0.84, steel, s * 0.395, 0.02, 0))
    for (const t of [-1, 1]) g.add(cylinder(0.014, 0.014, 0.012, dark, s * 0.395, 0.04, t * 0.395, 8))
  }
  for (let k = 0; k < 7; k++) g.add(box(0.74, 0.02, 0.05, dark, 0, 0.018, -0.3 + k * 0.1))
  const live = new THREE.Group()
  const lightMat = new THREE.MeshBasicMaterial({ color: C.bar })
  const below = mesh(new THREE.PlaneGeometry(0.74, 0.74), lightMat, 0, 0.004, 0)
  below.rotation.x = -Math.PI / 2
  live.add(below)
  // Les rais de lumière qui montent entre les lames.
  const shaft = new THREE.MeshBasicMaterial({ color: C.bar, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
  for (let k = 0; k < 6; k++) {
    const ray = mesh(new THREE.PlaneGeometry(0.7, 0.9), shaft, 0, 0.47, -0.25 + k * 0.1)
    ray.rotation.x = 0.06 * (k - 2.5)
    live.add(ray)
  }
  return {
    solid: g,
    live,
    update: (t) => {
      const beat = 0.75 + 0.25 * Math.sin(t * 5.2) * Math.sin(t * 1.3)
      lightMat.color.set(C.bar).multiplyScalar(beat)
      shaft.opacity = 0.07 + 0.05 * beat
    },
  }
}

/** Ventilateur, dans le mur du fond d'une gaine (adossé au nord, face à +z) : il tourne, lentement, en grinçant. */
const ventFan: Builder = ({ random }) => {
  const g = new THREE.Group()
  const dark = lit(C.steelDark)
  g.add(box(0.9, 0.9, 0.04, dark, 0, 0.5, -0.46))
  const ring = mesh(new THREE.TorusGeometry(0.36, 0.035, 8, 24), lit(C.steel), 0, 0.5, -0.42)
  g.add(ring)
  // Derrière les pales, une lueur froide : le reste du vaisseau, très loin.
  g.add(mesh(new THREE.CircleGeometry(0.34, 24), glow('#18303a'), 0, 0.5, -0.435))
  for (const a of [0, Math.PI / 2]) {
    const bar = box(0.74, 0.02, 0.02, lit(C.steel), 0, 0.5, -0.38)
    bar.rotation.z = a + Math.PI / 4
    g.add(bar)
  }
  const live = new THREE.Group()
  const blades = new THREE.Group()
  blades.position.set(0, 0.5, -0.41)
  for (let k = 0; k < 5; k++) {
    const blade = box(0.3, 0.1, 0.012, lit(C.rust), 0.17, 0, 0)
    blade.rotation.x = 0.5
    const arm = new THREE.Group()
    arm.add(blade)
    arm.rotation.z = (k / 5) * Math.PI * 2
    blades.add(arm)
  }
  blades.add(cylinder(0.05, 0.05, 0.05, lit(C.steel), 0, 0, 0, 12).rotateX(Math.PI / 2))
  live.add(blades)
  const phase = random() * 6
  return { solid: g, live, emitter: 'hum', update: (t) => (blades.rotation.z = t * 1.3 + phase) }
}

/** Mots grattés dans la tôle (adossés au mur nord, face à +z) : `label`, une ligne par « | ». */
const ventScrawl: Builder = ({ label, random }) => {
  const lines = (label ?? '').split('|')
  const map = drawnTexture(512, 256, (g) => {
    g.fillStyle = '#d9dee6'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const size = lines.length > 1 ? 74 : 92
    g.font = `bold ${size}px "Comic Sans MS", "Chalkboard SE", cursive`
    for (const [i, line] of lines.entries()) {
      g.save()
      g.translate(256, 128 + (i - (lines.length - 1) / 2) * size * 1.05)
      g.rotate((random() - 0.5) * 0.09)
      g.globalAlpha = 0.75
      g.fillText(line, 0, 0, 480)
      g.restore()
    }
  })
  const live = new THREE.Group()
  live.add(mesh(new THREE.PlaneGeometry(0.8, 0.4), new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, color: '#8d96a5' }), 0, 0.62, -0.455))
  return { live }
}

export const VENTS = {
  cobweb,
  'vent-grate': ventGrate,
  'vent-fan': ventFan,
  'vent-scrawl': ventScrawl,
} satisfies Record<string, Builder>
