import * as THREE from 'three'
import { animatedScreen, barX, barZ, box, cylinder, drawnTexture, glass, glow, instanced, lit, mesh, part, setInstance, sphere, type Builder } from './kit'
import { tr } from '../i18n'

/*
 * La gaine technique et la planque des Scavengers, au sud du lobby de la zone thargoïde (cale).
 *
 * La gaine : de la tuyauterie de chaufferie, rivetée, rouillée, qui fuit ; des manomètres de
 * laiton, des vannes, une chaudière, un double ventilateur. Rien de propre.
 *
 * La planque : le poste d'où l'on pilote les drones de Scavengers (https://scavengers.elitedangereuse.fr),
 * le jeu de fouille d'épaves du site. Son héros, Kael, y a traîné son caisson cryogénique ; ARIA,
 * l'IA de l'Erebus, occupe le mur. Les couleurs sont celles du jeu : vert phosphore du terminal,
 * cyan d'ARIA, ambre de la ferraille, bleu du carburant, violet des modules. Les portraits de
 * Kael et d'ARIA reprennent, pixel pour pixel, ceux du jeu (32 × 32).
 * Le personnage de Kael, lui, est un Mini Character posé par src/scavengers.ts.
 */

const C = {
  iron: '#3a3e45',
  ironDark: '#1d1f23',
  rust: '#6e3f24',
  rustDark: '#43271a',
  copper: '#a85c30',
  brass: '#b08433',
  verdigris: '#4d8a78',
  rubber: '#151618',
  red: '#9c2c22',
  hazard: '#e9a917',
  sodium: '#ff9a3c',
  ember: '#ff6a1c',
  // Les couleurs du jeu (cf. Colors.ts de Scavengers).
  phosphor: '#00ff41',
  phosphorDim: '#0a6624',
  screen: '#03120a',
  aria: '#00e5ff',
  scrap: '#ffb000',
  fuel: '#00aaff',
  upgrade: '#cc44ff',
  threat: '#ff6020',
  suit: '#4a5568',
  suitLight: '#636f80',
  suitDark: '#2d3748',
}

type G = CanvasRenderingContext2D
const rect = (g: G, x: number, y: number, w: number, h: number, color: string) => {
  g.fillStyle = color
  g.fillRect(x, y, w, h)
}

/** Lignes de balayage d'un tube cathodique, par-dessus l'image. */
function scanlines(g: G, w: number, h: number, step = 3) {
  g.fillStyle = 'rgba(0, 0, 0, 0.28)'
  for (let y = 0; y < h; y += step) g.fillRect(0, y, w, 1)
}

/**
 * Bouffées de vapeur qui partent d'un point dans une direction, gonflent et s'effacent.
 * `update(t, power)` : `power` de 0 (rien) à 1 (plein jet).
 */
function steam(count: number, color: string, opacity: number, from: THREE.Vector3, dir: THREE.Vector3, reach: number, speed = 0.5) {
  const cloud = instanced(
    new THREE.IcosahedronGeometry(1, 1),
    Array(count).fill(color),
    new THREE.MeshLambertMaterial({ transparent: true, opacity, depthWrite: false }),
  )
  return {
    mesh: cloud,
    update(t: number, power = 1) {
      for (let i = 0; i < count; i++) {
        const k = (t * speed + i / count) % 1
        const s = power <= 0 ? 0.0001 : (0.025 + k * 0.11) * (k < 0.7 ? 1 : (1 - k) / 0.3) * power
        const w = k * 0.07
        setInstance(
          cloud, i,
          from.x + dir.x * k * reach + Math.sin(i * 2.1 + t * 1.3) * w,
          from.y + dir.y * k * reach + k * k * 0.12 + Math.cos(i * 1.7 + t) * w,
          from.z + dir.z * k * reach + Math.cos(i * 1.3 + t * 1.1) * w,
          s,
        )
      }
      cloud.instanceMatrix.needsUpdate = true
    },
  }
}

/** Manomètre de laiton, face à +z : son cadran, et son aiguille (à animer, dans `live`). */
function gauge(g: THREE.Group, live: THREE.Group, x: number, y: number, z: number, r = 0.055) {
  g.add(barZ(r, 0.03, lit(C.brass, 'metal'), x, y, z, 14))
  const face = part(new THREE.CircleGeometry(r * 0.82, 14), glow('#e6d9b8'), x, y, z + 0.016)
  g.add(face)
  // Zone rouge du cadran.
  const danger = part(new THREE.RingGeometry(r * 0.55, r * 0.78, 8, 1, -0.3, 1.0), glow('#b3261a'), x, y, z + 0.017)
  g.add(danger)
  const needle = new THREE.Group()
  needle.position.set(x, y, z + 0.019)
  needle.add(part(new THREE.BoxGeometry(0.006, r * 0.7, 0.002), glow('#1a1a1a'), 0, r * 0.3, 0))
  live.add(needle)
  return needle
}

// ---------------------------------------------------------------- la gaine

/**
 * Tuyauterie de chaufferie le long d'un mur (adossée, face à +z) : un gros collecteur rouillé
 * sous le plafond, une conduite de cuivre, deux tubes fins ; des brides, des colliers, et au
 * hasard une vanne, un manomètre, une descente. `label` : sa longueur en tuiles (1 par défaut).
 */
const ductPipes: Builder = ({ label, random }) => {
  const L = Math.max(1, Number(label) || 1)
  const g = new THREE.Group(), live = new THREE.Group()
  const rust = lit(C.rust), dark = lit(C.ironDark, 'metal'), copper = lit(C.copper, 'metal')
  g.add(barX(0.075, L, rust, 0, 0.82, 0.1, 12))
  g.add(barX(0.034, L, copper, 0, 0.58, 0.055, 10))
  g.add(barX(0.018, L, lit(C.iron, 'metal'), 0, 0.37, 0.04, 8), barX(0.018, L, lit(C.verdigris), 0, 0.31, 0.04, 8))
  const needles: { n: THREE.Group; base: number; phase: number }[] = []
  for (let i = 0; i < L; i++) {
    const x = -L / 2 + 0.5 + i
    // Collier et patte de fixation, tous les mètres ; bride boulonnée entre deux.
    g.add(box(0.045, 0.66, 0.025, dark, x - 0.5 + 0.06, 0.58, 0.02))
    g.add(barX(0.094, 0.05, lit(C.rustDark), x + 0.44, 0.82, 0.1, 10))
    g.add(barX(0.045, 0.03, lit(C.brass, 'metal'), x - 0.2, 0.58, 0.055, 8))
    const pick = random()
    if (pick < 0.3) {
      // Manomètre piqué sur le cuivre.
      g.add(cylinder(0.008, 0.008, 0.08, lit(C.brass, 'metal'), x + 0.1, 0.64, 0.055, 6))
      needles.push({ n: gauge(g, live, x + 0.1, 0.7, 0.07), base: -0.9 + random() * 1.2, phase: random() * 10 })
    } else if (pick < 0.55) {
      // Vanne à volant sur le collecteur.
      const wheel = mesh(new THREE.TorusGeometry(0.07, 0.012, 5, 14), lit(C.red), x + 0.05, 0.82, 0.215)
      g.add(barZ(0.012, 0.06, dark, x + 0.05, 0.82, 0.19, 6), wheel)
      for (const a of [0, Math.PI / 2]) {
        const spoke = box(0.13, 0.01, 0.01, lit(C.red), x + 0.05, 0.82, 0.215)
        spoke.rotation.z = a + Math.PI / 4
        g.add(spoke)
      }
    } else if (pick < 0.75) {
      // Descente de cuivre jusqu'au sol.
      g.add(cylinder(0.03, 0.03, 0.58, copper, x + 0.22, 0.29, 0.055, 8), sphere(0.04, copper, x + 0.22, 0.58, 0.055, 8))
      g.add(cylinder(0.05, 0.05, 0.02, dark, x + 0.22, 0.01, 0.055, 8))
    } else if (pick < 0.88) {
      // Rustine : un manchon de tôle serré par deux colliers.
      g.add(barX(0.084, 0.2, lit('#57595e', 'metal'), x, 0.82, 0.1, 10))
      for (const s of [-1, 1]) g.add(barX(0.09, 0.02, lit(C.brass, 'metal'), x + s * 0.08, 0.82, 0.1, 10))
    }
  }
  return {
    solid: g,
    live,
    // Les aiguilles tremblent, et tapent dans le rouge de temps en temps.
    update: (t) => {
      for (const { n, base, phase } of needles) n.rotation.z = -(base + Math.sin(t * 9 + phase) * 0.05 + Math.max(0, Math.sin(t * 0.37 + phase)) ** 6 * 0.9)
    },
  }
}

/** Fuite de vapeur sur un raccord (adossée, face à +z, à hauteur du cuivre) : elle siffle par à-coups. */
const ductLeak: Builder = ({ random }) => {
  const g = new THREE.Group()
  g.add(barX(0.05, 0.09, lit(C.brass, 'metal'), 0, 0.58, 0.055, 8))
  g.add(box(0.03, 0.03, 0.03, lit(C.ironDark, 'metal'), 0, 0.58, 0.1))
  const jet = steam(9, '#d9dde0', 0.3, new THREE.Vector3(0, 0.58, 0.11), new THREE.Vector3(0.15, -0.35, 0.9).normalize(), 0.55, 0.9)
  const live = new THREE.Group()
  live.add(jet.mesh)
  const phase = random() * 20
  return { solid: g, live, update: (t) => jet.update(t, THREE.MathUtils.clamp(Math.sin(t * 0.8 + phase) * 2 + 0.6, 0, 1)) }
}

/**
 * Double ventilateur d'extraction, encastré dans un mur (adossé, face à +z, 1,9 de large) :
 * carter riveté, deux hélices qui ne tournent pas à la même vitesse, et derrière, la lueur des
 * étages inférieurs.
 */
const ductFan: Builder = () => {
  const g = new THREE.Group(), live = new THREE.Group()
  const dark = lit(C.ironDark, 'metal'), iron = lit(C.iron, 'metal')
  g.add(box(1.9, 0.94, 0.1, dark, 0, 0.5, 0.05, 0.012))
  g.add(box(1.94, 0.05, 0.14, lit(C.rust), 0, 0.985, 0.07), box(1.94, 0.05, 0.14, lit(C.rust), 0, 0.025, 0.07))
  // Rivets du carter.
  for (let i = 0; i < 9; i++) for (const y of [0.09, 0.91]) g.add(barZ(0.014, 0.012, lit(C.brass, 'metal'), -0.86 + i * 0.215, y, 0.104, 6))
  const rotors: THREE.Group[] = []
  for (const s of [-1, 1]) {
    const cx = s * 0.47
    g.add(part(new THREE.CircleGeometry(0.37, 24), glow('#5a2408'), cx, 0.5, 0.102))
    const ring = mesh(new THREE.TorusGeometry(0.385, 0.03, 8, 24), iron, cx, 0.5, 0.115)
    g.add(ring)
    // Grille de protection : trois barres, et le moyeu.
    for (const a of [0, Math.PI / 3, -Math.PI / 3]) {
      const bar = box(0.78, 0.014, 0.014, iron, cx, 0.5, 0.165)
      bar.rotation.z = a
      g.add(bar)
    }
    g.add(barZ(0.05, 0.05, lit(C.rust), cx, 0.5, 0.15, 10))
    const rotor = new THREE.Group()
    rotor.position.set(cx, 0.5, 0.128)
    for (let k = 0; k < 5; k++) {
      const arm = new THREE.Group()
      const blade = box(0.3, 0.11, 0.012, lit(C.rustDark), 0.19, 0, 0)
      blade.rotation.x = 0.55
      arm.add(blade)
      arm.rotation.z = (k / 5) * Math.PI * 2
      rotor.add(arm)
    }
    rotors.push(rotor)
    live.add(rotor)
  }
  // Plaque du constructeur, entre les deux.
  const plate = drawnTexture(128, 64, (c) => {
    rect(c, 0, 0, 128, 64, '#8a6a2a')
    rect(c, 3, 3, 122, 58, '#1c1a14')
    c.fillStyle = '#c9a24a'
    c.font = 'bold 15px monospace'
    c.textAlign = 'center'
    c.fillText('EXTRACTION', 64, 22)
    c.font = 'bold 22px monospace'
    c.fillText('VT-03', 64, 48)
  })
  g.add(part(new THREE.PlaneGeometry(0.2, 0.1), new THREE.MeshLambertMaterial({ map: plate }), 0, 0.14, 0.104))
  return {
    solid: g,
    live,
    emitter: 'hum',
    update: (t) => {
      rotors[0].rotation.z = t * 5.2
      // Le second cale, repart, cale.
      rotors[1].rotation.z = -(t * 3.1 + Math.sin(t * 0.9) * 1.4)
    },
  }
}

/**
 * Chaudière verticale : virole rivetée, cerclages de laiton, porte de foyer rougeoyante,
 * manomètre, soupape qui crache. Son tuyau part dans le mur derrière elle.
 */
const ductBoiler: Builder = ({ random }) => {
  const g = new THREE.Group(), live = new THREE.Group()
  const dark = lit(C.ironDark, 'metal'), brass = lit(C.brass, 'metal')
  g.add(cylinder(0.33, 0.36, 0.06, dark, 0, 0.03, 0, 16))
  g.add(cylinder(0.29, 0.29, 0.7, lit(C.rust), 0, 0.41, 0, 16))
  const dome = sphere(0.29, lit(C.rustDark), 0, 0.76, 0, 16)
  dome.scale.y = 0.5
  g.add(dome)
  for (const y of [0.14, 0.44, 0.72]) {
    const band = mesh(new THREE.TorusGeometry(0.293, 0.014, 6, 24), brass, 0, y, 0)
    band.rotation.x = Math.PI / 2
    g.add(band)
  }
  // Rivets de la virole.
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2
    g.add(sphere(0.012, dark, Math.cos(a) * 0.292, 0.58, Math.sin(a) * 0.292, 6))
  }
  // Porte du foyer, face à +z.
  g.add(box(0.24, 0.2, 0.05, dark, 0, 0.26, 0.285, 0.01))
  g.add(box(0.03, 0.05, 0.02, brass, 0.09, 0.26, 0.32))
  const fire = new THREE.MeshBasicMaterial({ color: C.ember })
  for (let k = 0; k < 3; k++) live.add(part(new THREE.BoxGeometry(0.16, 0.016, 0.004), fire, -0.015, 0.21 + k * 0.045, 0.312))
  // Tuyau de fumée vers le mur, et conduite de cuivre qui redescend.
  g.add(barZ(0.07, 0.34, lit(C.rustDark), 0, 0.72, -0.34, 10))
  g.add(cylinder(0.022, 0.022, 0.62, lit(C.copper, 'metal'), -0.33, 0.31, 0.05, 8))
  g.add(barX(0.022, 0.1, lit(C.copper, 'metal'), -0.29, 0.62, 0.05, 8))
  const needle = gauge(g, live, 0.13, 0.6, 0.262, 0.05)
  // Soupape de sûreté, au sommet.
  g.add(cylinder(0.03, 0.04, 0.09, brass, 0.1, 0.92, 0.05, 8))
  const vent = steam(8, '#e0e3e6', 0.3, new THREE.Vector3(0.1, 0.97, 0.05), new THREE.Vector3(0.1, 1, 0.1).normalize(), 0.5, 0.7)
  live.add(vent.mesh)
  const phase = random() * 10
  return {
    solid: g,
    live,
    update: (t) => {
      const heat = 0.5 + 0.5 * Math.sin(t * 0.45 + phase)
      fire.color.set(C.ember).multiplyScalar(0.55 + 0.3 * heat + 0.15 * Math.sin(t * 13 + phase))
      needle.rotation.z = -(-0.8 + heat * 1.5 + Math.sin(t * 11) * 0.04)
      // La soupape s'ouvre quand la pression est au plus haut.
      vent.update(t, THREE.MathUtils.clamp((heat - 0.72) * 5, 0, 1))
    },
  }
}

/** Hublot de cloison grillagé (adossé, face à +z) : une ampoule au sodium qui faiblit par moments. */
const ductLamp: Builder = ({ random }) => {
  const g = new THREE.Group(), live = new THREE.Group()
  const dark = lit(C.ironDark, 'metal')
  g.add(box(0.16, 0.22, 0.03, dark, 0, 0.84, 0.015, 0.008))
  const bulb = new THREE.MeshBasicMaterial({ color: C.sodium })
  live.add(part(new THREE.CapsuleGeometry(0.04, 0.07, 3, 8), bulb, 0, 0.84, 0.07))
  for (const x of [-0.045, 0, 0.045]) g.add(box(0.008, 0.19, 0.008, dark, x, 0.84, 0.115))
  for (const y of [0.76, 0.84, 0.92]) g.add(box(0.13, 0.008, 0.09, dark, 0, y, 0.075))
  const phase = random() * 30
  return {
    solid: g,
    live,
    update: (t) => {
      const u = (t + phase) % 11
      bulb.color.set(C.sodium).multiplyScalar(u > 10.3 && Math.sin(u * 70) > 0 ? 0.3 : 0.9 + Math.sin(t * 2.3 + phase) * 0.1)
    },
  }
}

/** Caillebotis au sol (0,9 de côté) : des lames d'acier, et dessous, une lueur de braise. */
const ductGrate: Builder = ({ random }) => {
  const g = new THREE.Group(), live = new THREE.Group()
  const steel = lit(C.iron, 'metal'), dark = lit(C.ironDark, 'metal')
  for (const s of [-1, 1]) g.add(box(0.9, 0.03, 0.05, steel, 0, 0.018, s * 0.425), box(0.05, 0.03, 0.9, steel, s * 0.425, 0.018, 0))
  for (let k = 0; k < 8; k++) g.add(box(0.8, 0.018, 0.045, dark, 0, 0.016, -0.35 + k * 0.1))
  const below = new THREE.MeshBasicMaterial({ color: C.ember })
  const plane = part(new THREE.PlaneGeometry(0.8, 0.8), below, 0, 0.005, 0)
  plane.rotation.x = -Math.PI / 2
  live.add(plane)
  const phase = random() * 10
  return { solid: g, live, update: (t) => below.color.set(C.ember).multiplyScalar(0.22 + 0.1 * Math.sin(t * 1.7 + phase) + 0.04 * Math.sin(t * 9.1 + phase)) }
}

/**
 * Plaque émaillée vissée au mur (adossée, face à +z) : bord rayé, texte au pochoir, crasse.
 * `label` : « TEXTE » ou « TEXTE|> » (flèche vers la droite) ou « TEXTE|< ».
 */
const ductSign: Builder = ({ label, random }) => {
  const [text, arrow] = (label ?? 'DANGER').split('|')
  const W = 320, H = 96
  const texture = drawnTexture(W, H, (c) => {
    rect(c, 0, 0, W, H, '#191a1c')
    // Liseré de danger, en biais.
    c.save()
    c.beginPath()
    c.rect(0, 0, W, 10)
    c.rect(0, H - 10, W, 10)
    c.clip()
    c.fillStyle = C.hazard
    for (let x = -H; x < W + H; x += 28) {
      c.beginPath()
      c.moveTo(x, 0); c.lineTo(x + 14, 0); c.lineTo(x + 14 + H, H); c.lineTo(x + H, H)
      c.closePath()
      c.fill()
    }
    c.restore()
    c.fillStyle = '#d8d2bf'
    c.font = 'bold 34px monospace'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    const body = arrow === '>' ? `${text} ▶` : arrow === '<' ? `◀ ${text}` : text
    c.fillText(body, W / 2, H / 2 + 2, W - 30)
    // Crasse et coulures.
    for (let k = 0; k < 26; k++) {
      c.fillStyle = `rgba(20, 12, 6, ${0.12 + random() * 0.3})`
      const x = random() * W
      c.fillRect(x, random() * H, 2 + random() * 26, 1 + random() * 3)
      if (random() < 0.3) c.fillRect(x, 10, 2, 20 + random() * 60)
    }
  })
  const g = new THREE.Group()
  g.add(box(0.84, 0.27, 0.014, lit(C.ironDark, 'metal'), 0, 0.52, 0.008))
  g.add(part(new THREE.PlaneGeometry(0.8, 0.24), new THREE.MeshLambertMaterial({ map: texture }), 0, 0.52, 0.017))
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) g.add(barZ(0.01, 0.008, lit(C.brass, 'metal'), sx * 0.38, 0.52 + sy * 0.1, 0.018, 6))
  return { solid: g }
}

/** Grosse vanne d'arrêt sur un coude (adossée, face à +z) : un volant rouge, cadenassé. */
const ductValve: Builder = () => {
  const g = new THREE.Group()
  const rust = lit(C.rust), dark = lit(C.ironDark, 'metal')
  g.add(cylinder(0.07, 0.07, 0.62, rust, 0, 0.31, 0.09, 10), sphere(0.085, rust, 0, 0.62, 0.09, 10))
  g.add(barZ(0.07, 0.1, rust, 0, 0.62, 0.04, 10))
  g.add(cylinder(0.09, 0.09, 0.03, dark, 0, 0.012, 0.09, 10), cylinder(0.088, 0.088, 0.04, lit(C.rustDark), 0, 0.3, 0.09, 10))
  g.add(barZ(0.016, 0.1, dark, 0, 0.62, 0.2, 6))
  const wheel = mesh(new THREE.TorusGeometry(0.12, 0.016, 6, 18), lit(C.red), 0, 0.62, 0.25)
  g.add(wheel)
  for (const a of [0, Math.PI / 3, -Math.PI / 3]) {
    const spoke = box(0.23, 0.014, 0.012, lit(C.red), 0, 0.62, 0.25)
    spoke.rotation.z = a
    g.add(spoke)
  }
  // La chaîne et son cadenas.
  g.add(box(0.012, 0.16, 0.012, lit(C.iron, 'metal'), 0.1, 0.52, 0.25), box(0.04, 0.05, 0.02, lit(C.brass, 'metal'), 0.1, 0.42, 0.25))
  return { solid: g }
}

// ---------------------------------------------------------------- les portraits du jeu

/** Kael, tel que le dessine le jeu (32 × 32 ; fond transparent). */
function drawKael(c: G) {
  const K = { skin: '#d4a574', shade: '#b8895c', hair: '#3d2b1f', hairLight: '#5a4030', eye: '#4a7c59', mouth: '#8b5e3c', scar: '#c49070' }
  rect(c, 13, 24, 6, 4, K.skin)
  rect(c, 6, 26, 20, 6, C.suit)
  rect(c, 8, 27, 16, 5, C.suitLight)
  rect(c, 14, 26, 4, 2, C.suitDark)
  rect(c, 11, 8, 10, 16, K.skin)
  rect(c, 10, 10, 12, 12, K.skin)
  rect(c, 12, 7, 8, 2, K.skin)
  rect(c, 10, 18, 12, 4, K.shade)
  rect(c, 10, 6, 12, 5, K.hair)
  rect(c, 9, 7, 2, 6, K.hair)
  rect(c, 22, 8, 1, 5, K.hair)
  rect(c, 11, 5, 10, 2, K.hairLight)
  rect(c, 10, 5, 1, 1, K.hair)
  rect(c, 21, 6, 1, 1, K.hair)
  rect(c, 9, 9, 1, 1, K.hairLight)
  rect(c, 12, 13, 3, 2, '#ffffff')
  rect(c, 18, 13, 3, 2, '#ffffff')
  rect(c, 13, 13, 1, 1, K.eye)
  rect(c, 19, 13, 1, 1, K.eye)
  rect(c, 15, 15, 2, 1, K.shade)
  rect(c, 15, 16, 1, 1, K.shade)
  rect(c, 13, 19, 5, 1, K.mouth)
  rect(c, 20, 15, 1, 2, K.scar)
  rect(c, 21, 16, 1, 1, K.scar)
  for (const [x, y] of [[12, 20], [14, 21], [17, 21], [19, 20], [11, 18]]) rect(c, x, y, 1, 1, K.shade)
}

/**
 * ARIA, telle que la dessine le jeu (32 × 32), animée : elle cligne des yeux, ses circuits
 * battent, et sa bouche devient une onde quand elle parle.
 */
export function drawAria(c: G, t: number, bare = false) {
  const A = { face: '#00e5ff', dark: '#0091a1', glow: '#80f0ff', circuit: '#00bcd4', dim: '#006070', bg: '#0a1628', bgGlow: '#0d2840' }
  // `bare` : le visage seul, sans le fond de son écran (la tête de sa projection, cf. looks.ts).
  if (!bare) {
    rect(c, 0, 0, 32, 32, A.bg)
    rect(c, 4, 4, 24, 24, A.bgGlow)
  }
  rect(c, 10, 6, 12, 18, A.dark)
  rect(c, 8, 8, 16, 14, A.face)
  rect(c, 9, 7, 14, 1, A.face)
  rect(c, 9, 22, 14, 1, A.face)
  // Circuits des côtés : une impulsion les remonte.
  const pulse = Math.floor(t * 4) % 6
  for (let y = 8, k = 0; y < 22; y += 3, k++) {
    const on = k === pulse
    rect(c, 7, y, 1, 1, on ? A.glow : A.circuit)
    rect(c, 6, y, 1, 1, on ? A.circuit : A.dim)
    rect(c, 24, y, 1, 1, on ? A.glow : A.circuit)
    rect(c, 25, y, 1, 1, on ? A.circuit : A.dim)
  }
  for (let x = 11; x < 21; x += 2) {
    rect(c, x, 5, 1, 1, A.dim)
    rect(c, x, 24, 1, 1, A.dim)
  }
  // Yeux : un clignement toutes les cinq secondes et quelques.
  const blink = t % 5.3 < 0.14
  if (blink) {
    rect(c, 11, 13, 4, 1, '#ffffff')
    rect(c, 18, 13, 4, 1, '#ffffff')
  } else {
    // Le regard glisse, de temps en temps.
    const look = t % 13 > 10.5 ? (t % 13 > 11.7 ? 1 : -1) : 0
    for (const x of [11, 18]) {
      rect(c, x + look, 12, 4, 3, '#ffffff')
      for (const [dx, dy] of [[0, 0], [3, 0], [0, 2], [3, 2]]) rect(c, x + look + dx, 12 + dy, 1, 1, A.face)
    }
  }
  // Bouche : une ligne, ou une onde quand elle parle (quatre secondes sur dix).
  if (t % 10 < 4) {
    for (let x = 12; x < 20; x++) {
      const h = 1 + Math.round(Math.abs(Math.sin(x * 1.9 + Math.floor(t * 9) * 1.3)) * 2)
      rect(c, x, 19 - h, 1, h, x % 3 ? A.dim : A.circuit)
    }
  } else rect(c, 12, 18, 8, 1, A.circuit)
  rect(c, 15, 9, 2, 1, A.glow)
  rect(c, 15, 21, 2, 1, A.glow)
  if (!bare) for (const [x, y] of [[3, 3], [28, 3], [3, 28], [28, 28]]) rect(c, x, y, 1, 1, A.circuit)
}

// ---------------------------------------------------------------- la planque

/** Plan d'épave du jeu (vue de mission) : salles reliées, portes, deux drones, une menace. */
const WRECK = {
  rooms: [
    { id: 'r1', x: 14, y: 30, w: 44, h: 30 },
    { id: 'r2', x: 70, y: 22, w: 54, h: 38 },
    { id: 'r3', x: 136, y: 30, w: 40, h: 30 },
    { id: 'r4', x: 70, y: 76, w: 34, h: 34 },
    { id: 'r5', x: 116, y: 76, w: 60, h: 34 },
    { id: 'r6', x: 188, y: 46, w: 52, h: 64 },
  ],
  doors: [[58, 45], [124, 45], [86, 60], [104, 93], [176, 93], [176, 50]] as [number, number][],
}

function drawMission(c: G, t: number) {
  rect(c, 0, 0, 256, 192, '#050a06')
  c.lineWidth = 2
  c.font = 'bold 10px monospace'
  c.textAlign = 'left'
  const seen = Math.min(WRECK.rooms.length, 2 + Math.floor((t % 18) / 3))
  WRECK.rooms.forEach((r, i) => {
    const known = i < seen
    rect(c, r.x, r.y, r.w, r.h, known ? '#0a1a0a' : '#0c0d0c')
    c.strokeStyle = known ? C.phosphor : '#1f2a21'
    c.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2)
    c.fillStyle = known ? C.phosphorDim : '#1f2a21'
    c.fillText(r.id.toUpperCase(), r.x + 4, r.y + 12)
  })
  for (const [x, y] of WRECK.doors) rect(c, x - 3, y - 3, 6, 6, C.phosphor)
  // Les drones vont de salle en salle.
  const at = (i: number, k: number) => {
    const a = WRECK.rooms[i % seen], b = WRECK.rooms[(i + 1) % seen]
    return [a.x + a.w / 2 + (b.x + b.w / 2 - a.x - a.w / 2) * k, a.y + a.h / 2 + (b.y + b.h / 2 - a.y - a.h / 2) * k]
  }
  const step = t / 3
  const [x1, y1] = at(Math.floor(step), THREE.MathUtils.smoothstep(step % 1, 0.2, 0.8))
  const [x2, y2] = at(Math.floor(step * 0.6) + 1, THREE.MathUtils.smoothstep((step * 0.6) % 1, 0.3, 0.9))
  for (const [x, y, name, color] of [[x1, y1, 'D1', C.phosphor], [x2, y2, 'D2', C.scrap]] as const) {
    c.fillStyle = color
    c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fill()
    c.fillText(name, x + 6, y - 4)
  }
  // Un écho non identifié, dans la dernière salle.
  if (Math.floor(t * 2) % 2) {
    c.fillStyle = C.threat
    c.beginPath(); c.arc(216, 86, 5, 0, Math.PI * 2); c.fill()
  }
  c.strokeStyle = 'rgba(255, 96, 32, 0.5)'
  c.beginPath(); c.arc(216, 86, 6 + ((t * 10) % 14), 0, Math.PI * 2); c.stroke()
  // La ligne de commande.
  rect(c, 0, 132, 256, 1, C.phosphorDim)
  c.font = 'bold 12px monospace'
  const lines = [tr('> naviguer 1 r4', '> navigate 1 r4'), tr('> ouvrir d3', '> open d3'), tr('> ramasser 1', '> gather 1'), tr('> amarrer', '> dock')]
  const cmd = lines[Math.floor(t / 4.5) % lines.length]
  const typed = cmd.slice(0, Math.floor(((t % 4.5) / 4.5) * (cmd.length + 14)))
  c.fillStyle = C.phosphor
  c.fillText(typed + (Math.floor(t * 3) % 2 ? '_' : ''), 10, 152)
  c.fillStyle = C.phosphorDim
  c.fillText(tr('SIGNAL : 2 ÉCHOS · AIR : 61 %', 'SIGNAL: 2 ECHOES · AIR: 61%'), 10, 174)
}

function drawTitle(c: G, t: number) {
  rect(c, 0, 0, 256, 192, C.screen)
  // Les étoiles de l'écran-titre.
  for (let i = 0; i < 40; i++) {
    const tw = 0.3 + 0.7 * Math.abs(Math.sin(t * 0.8 + i * 1.7))
    c.fillStyle = `rgba(160, 255, 190, ${0.5 * tw})`
    c.fillRect((i * 67) % 256, (i * 41) % 110, 1, 1)
  }
  c.save()
  c.translate(100, 6)
  c.scale(1.75, 1.75)
  drawKael(c)
  c.restore()
  c.fillStyle = C.phosphor
  c.shadowColor = C.phosphor
  c.shadowBlur = 8
  c.font = 'bold 34px monospace'
  c.textAlign = 'center'
  c.fillText('SCAVENGERS', 128, 98, 236)
  c.shadowBlur = 0
  c.font = 'bold 11px monospace'
  c.textAlign = 'left'
  const lines = [
    tr('Vous êtes Kael. Le dernier humain.', 'You are Kael. The last human.'),
    tr('La galaxie est devenue silencieuse.', 'The galaxy has gone silent.'),
    tr('Fouillez les épaves. Trouvez la vérité.', 'Search the wrecks. Find the truth.'),
  ]
  const shown = Math.floor(t * 16)
  let before = 0
  lines.forEach((line, i) => {
    c.fillStyle = C.phosphorDim
    c.fillText(line.slice(0, Math.max(0, shown - before)), 10, 122 + i * 15)
    before += line.length + 8
  })
  if (shown > before) {
    c.fillStyle = C.phosphor
    c.fillText('> new' + (Math.floor(t * 3) % 2 ? '_' : ''), 10, 176)
  }
}

/**
 * Le poste de Scavengers : bureau de tôle, gros moniteur cathodique où tourne le jeu (son
 * écran-titre, puis une mission), petit écran d'état des drones, clavier, unité centrale ouverte.
 * On y lance le jeu (cf. main.ts).
 */
const scavTerminal: Builder = () => {
  const g = new THREE.Group(), live = new THREE.Group()
  const dark = lit(C.ironDark, 'metal'), iron = lit(C.iron, 'metal'), shell = lit('#8f8a78'), shellDark = lit('#5f5b4e')
  // Bureau : plateau, caisson, pieds.
  g.add(box(1.2, 0.04, 0.5, iron, 0, 0.4, 0, 0.008))
  g.add(box(0.34, 0.38, 0.44, dark, -0.4, 0.19, 0, 0.01), box(0.05, 0.38, 0.44, dark, 0.55, 0.19, 0))
  g.add(box(0.3, 0.012, 0.01, lit(C.brass, 'metal'), -0.4, 0.3, 0.222), box(0.3, 0.012, 0.01, lit(C.brass, 'metal'), -0.4, 0.16, 0.222))
  // Le moniteur : coque beige jaunie, cul de tube, pied.
  g.add(box(0.2, 0.03, 0.2, shellDark, -0.08, 0.435, -0.06))
  g.add(box(0.52, 0.42, 0.3, shell, -0.08, 0.66, -0.04, 0.03))
  g.add(box(0.36, 0.3, 0.14, shellDark, -0.08, 0.65, -0.2, 0.03))
  g.add(box(0.46, 0.35, 0.02, lit('#0b0d0b'), -0.08, 0.675, 0.108))
  g.add(box(0.012, 0.012, 0.01, glow(C.phosphor), 0.14, 0.475, 0.112))
  const main = animatedScreen(256, 192, 8, (c, t) => {
    // L'écran-titre, puis une mission, en boucle.
    if (t % 30 < 12) drawTitle(c, t % 30)
    else drawMission(c, t)
    scanlines(c, 256, 192)
  })
  live.add(part(new THREE.PlaneGeometry(0.43, 0.32), new THREE.MeshBasicMaterial({ map: main.texture }), -0.08, 0.677, 0.12))
  // L'écran d'état des drones, sur son bras.
  g.add(cylinder(0.012, 0.012, 0.3, dark, 0.4, 0.57, -0.14, 6))
  const side = new THREE.Group()
  side.position.set(0.4, 0.7, -0.06)
  side.rotation.y = -0.45
  side.add(box(0.28, 0.22, 0.05, dark, 0, 0, 0, 0.01))
  g.add(side)
  const status = animatedScreen(128, 96, 2, (c, t) => {
    rect(c, 0, 0, 128, 96, '#050705')
    c.font = 'bold 11px monospace'
    c.textAlign = 'left'
    const drones = [
      { name: 'D1', hp: 0.9 - 0.1 * Math.abs(Math.sin(t * 0.2)), color: C.phosphor },
      { name: 'D2', hp: 0.45 + 0.08 * Math.sin(t * 0.5), color: C.scrap },
      { name: 'D3', hp: 0, color: '#ff0040' },
    ]
    drones.forEach((d, i) => {
      const y = 8 + i * 29
      c.fillStyle = d.color
      c.fillText(d.name, 6, y + 10)
      c.fillText(d.hp ? `${Math.round(d.hp * 100)}%` : tr('PERDU', 'LOST'), 84, y + 10)
      rect(c, 6, y + 15, 116, 7, '#09110d')
      rect(c, 6, y + 15, 116 * d.hp, 7, d.color)
    })
    scanlines(c, 128, 96, 2)
  })
  const statusPlane = part(new THREE.PlaneGeometry(0.25, 0.19), new THREE.MeshBasicMaterial({ map: status.texture }), 0, 0, 0.027)
  const sideLive = new THREE.Group()
  sideLive.position.copy(side.position)
  sideLive.rotation.copy(side.rotation)
  sideLive.add(statusPlane)
  live.add(sideLive)
  // Clavier mécanique, tasse, unité centrale au capot ouvert.
  g.add(box(0.4, 0.03, 0.14, shellDark, -0.08, 0.435, 0.15, 0.006))
  for (let r = 0; r < 3; r++) g.add(box(0.36, 0.008, 0.028, lit('#2a2a26'), -0.08, 0.454, 0.108 + r * 0.04))
  g.add(cylinder(0.03, 0.026, 0.07, lit('#b9b29c'), 0.3, 0.455, 0.14, 10), cylinder(0.024, 0.024, 0.004, lit('#2a1608'), 0.3, 0.49, 0.14, 10))
  g.add(box(0.2, 0.36, 0.4, shellDark, 0.36, 0.18, 0.02, 0.01))
  g.add(box(0.012, 0.3, 0.34, lit('#101210'), 0.256, 0.18, 0.02))
  const leds = [C.phosphor, C.scrap, C.phosphor].map((color, i) => {
    const m = new THREE.MeshBasicMaterial({ color })
    live.add(part(new THREE.BoxGeometry(0.014, 0.014, 0.006), m, 0.31 + i * 0.03, 0.32, 0.222))
    return m
  })
  // Câbles qui retombent derrière le bureau.
  for (const [x, color] of [[-0.3, C.rubber], [0.12, C.hazard], [0.5, C.rubber]] as const) {
    const cable = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, 0.44, -0.2), new THREE.Vector3(x + 0.05, 0.3, -0.27), new THREE.Vector3(x - 0.04, 0.05, -0.24), new THREE.Vector3(x + 0.1, 0.012, -0.05),
    ]), 12, 0.012, 5), lit(color))
    g.add(cable)
  }
  return {
    solid: g,
    live,
    update: (t) => {
      main.tick(t)
      status.tick(t)
      leds.forEach((m, i) => m.color.set(i === 1 ? C.scrap : C.phosphor).multiplyScalar(Math.sin(t * (7 + i * 3.3) + i) > 0 ? 1 : 0.2))
    },
  }
}

/**
 * ARIA, l'IA de l'Erebus (adossée, face à +z, 1,5 de large) : son visage sur un grand écran à
 * coins coupés, deux colonnes de télémétrie, et la gerbe de câbles qui l'alimente.
 */
const scavAria: Builder = ({ random }) => {
  const g = new THREE.Group(), live = new THREE.Group()
  const dark = lit(C.ironDark, 'metal')
  // Châssis à pans coupés.
  const frame = new THREE.Shape()
  const hw = 0.5, hh = 0.42, cut = 0.12
  frame.moveTo(-hw + cut, -hh); frame.lineTo(hw - cut, -hh); frame.lineTo(hw, -hh + cut); frame.lineTo(hw, hh - cut)
  frame.lineTo(hw - cut, hh); frame.lineTo(-hw + cut, hh); frame.lineTo(-hw, hh - cut); frame.lineTo(-hw, -hh + cut)
  frame.closePath()
  const body = mesh(new THREE.ExtrudeGeometry(frame, { depth: 0.06, bevelEnabled: false }), dark, 0, 0.54, 0)
  g.add(body)
  const face = animatedScreen(128, 128, 10, (c, t) => {
    c.save()
    c.scale(4, 4)
    drawAria(c, t)
    c.restore()
    // Balayage : une bande claire descend l'écran.
    c.fillStyle = 'rgba(128, 240, 255, 0.10)'
    c.fillRect(0, (t * 40) % 160 - 16, 128, 14)
    scanlines(c, 128, 128, 4)
  })
  live.add(part(new THREE.PlaneGeometry(0.72, 0.72), new THREE.MeshBasicMaterial({ map: face.texture }), 0, 0.54, 0.064))
  // Liseré lumineux autour de l'écran.
  const edge = new THREE.MeshBasicMaterial({ color: C.aria })
  for (const s of [-1, 1]) {
    live.add(part(new THREE.BoxGeometry(0.74, 0.012, 0.006), edge, 0, 0.54 + s * 0.372, 0.064))
    live.add(part(new THREE.BoxGeometry(0.012, 0.74, 0.006), edge, s * 0.372, 0.54, 0.064))
  }
  // Colonnes de télémétrie.
  const columns = [-1, 1].map((s) => {
    g.add(box(0.2, 0.7, 0.05, dark, s * 0.63, 0.56, 0.025, 0.01))
    let seed = 1 + Math.floor(random() * 1000)
    const next = () => ((seed = (seed * 16807) % 2147483647) % 1000) / 1000
    const rows = Array.from({ length: 14 }, () => ({ w: 0.2 + next() * 0.8, speed: 0.3 + next() * 1.5, phase: next() * 6 }))
    const screen = animatedScreen(48, 160, 6, (c, t) => {
      rect(c, 0, 0, 48, 160, '#04121c')
      rows.forEach((r, i) => {
        const w = 40 * r.w * (0.6 + 0.4 * Math.sin(t * r.speed + r.phase))
        rect(c, 4, 6 + i * 11, w, 5, i % 5 === 2 ? '#80f0ff' : i % 3 ? '#00bcd4' : '#006070')
      })
      scanlines(c, 48, 160, 3)
    })
    live.add(part(new THREE.PlaneGeometry(0.17, 0.64), new THREE.MeshBasicMaterial({ map: screen.texture }), s * 0.63, 0.56, 0.052))
    return screen
  })
  // Sa plaque : le nom, au pochoir.
  const name = drawnTexture(128, 32, (c) => {
    c.fillStyle = C.aria
    c.font = 'bold 22px monospace'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText('A.R.I.A.', 64, 17)
  })
  g.add(part(new THREE.PlaneGeometry(0.34, 0.085), new THREE.MeshBasicMaterial({ map: name, transparent: true }), 0, 0.075, 0.064))
  g.add(box(0.44, 0.11, 0.06, dark, 0, 0.075, 0.03, 0.01))
  // Câbles : du châssis au sol.
  for (const [x, color, r] of [[-0.42, C.rubber, 0.02], [-0.3, '#0c4a52', 0.014], [0.34, C.rubber, 0.018], [0.44, C.hazard, 0.012]] as const) {
    const cable = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, 0.14, 0.05), new THREE.Vector3(x + 0.03, 0.06, 0.1), new THREE.Vector3(x - 0.02, 0.015, 0.22), new THREE.Vector3(x + 0.06, 0.012, 0.42),
    ]), 12, r, 5), lit(color))
    g.add(cable)
  }
  return {
    solid: g,
    live,
    update: (t) => {
      face.tick(t)
      for (const s of columns) s.tick(t)
      edge.color.set(C.aria).multiplyScalar(0.7 + 0.3 * Math.sin(t * 1.4))
    },
  }
}

/**
 * Le caisson cryogénique de Kael (face à +z) : incliné sur son berceau, capot de verre relevé,
 * givre et vapeur froide. Sur son pupitre, le compteur : deux cent cinquante ans.
 */
const scavCryo: Builder = () => {
  const g = new THREE.Group(), live = new THREE.Group()
  const dark = lit(C.ironDark, 'metal'), shell = lit('#59616d', 'metal'), pad = lit('#28303a', 'cloth')
  g.add(box(0.74, 0.1, 0.62, dark, 0, 0.05, 0, 0.012))
  // La cuve, inclinée : la tête contre le mur, les pieds en avant.
  const tub = new THREE.Group()
  tub.position.set(0, 0.42, -0.02)
  tub.rotation.x = -0.95
  tub.add(box(0.6, 0.86, 0.26, shell, 0, 0, 0, 0.05))
  tub.add(box(0.46, 0.72, 0.05, pad, 0, 0, 0.125, 0.02))
  tub.add(box(0.3, 0.16, 0.05, lit('#343e4b', 'cloth'), 0, 0.3, 0.14, 0.03))
  // Liserés lumineux le long de la cuve.
  for (const s of [-1, 1]) tub.add(box(0.014, 0.74, 0.014, glow('#bfe8ff'), s * 0.27, 0, 0.135))
  g.add(tub)
  // Bras du berceau.
  for (const s of [-1, 1]) g.add(box(0.05, 0.4, 0.05, dark, s * 0.33, 0.25, -0.16))
  // Le capot de verre, relevé sur ses charnières, et couvert de givre.
  const lid = new THREE.Group()
  lid.position.copy(tub.position)
  lid.rotation.x = tub.rotation.x
  const pane = part(new THREE.BoxGeometry(0.5, 0.76, 0.012), glass('#bfe6ff', 0.18), 0.37, 0, 0.36)
  pane.rotation.y = -1.2
  // Ses montants, pour qu'on le lise comme un capot et non comme un reflet.
  for (const y of [-0.38, 0.38]) {
    const rail = part(new THREE.BoxGeometry(0.5, 0.016, 0.016), lit('#59616d', 'metal'), 0.37, y, 0.36)
    rail.rotation.y = pane.rotation.y
    lid.add(rail)
  }
  lid.add(pane)
  live.add(lid)
  // Pupitre : le compteur.
  g.add(box(0.07, 0.5, 0.07, dark, 0.46, 0.25, 0.24), box(0.2, 0.15, 0.04, dark, 0.46, 0.55, 0.25, 0.008))
  const counter = drawnTexture(128, 96, (c) => {
    rect(c, 0, 0, 128, 96, '#06141c')
    c.fillStyle = '#bfe8ff'
    c.font = 'bold 13px monospace'
    c.textAlign = 'center'
    c.fillText('CRYO 07', 64, 20)
    c.font = 'bold 30px monospace'
    c.fillText(tr('250 A', '250 Y'), 64, 56)
    c.fillStyle = C.phosphor
    c.font = 'bold 11px monospace'
    c.fillText(tr('CYCLE TERMINÉ', 'CYCLE COMPLETE'), 64, 82)
    scanlines(c, 128, 96, 3)
  })
  g.add(part(new THREE.PlaneGeometry(0.17, 0.125), new THREE.MeshBasicMaterial({ map: counter }), 0.46, 0.55, 0.272))
  // Vapeur froide qui coule du caisson vers le sol.
  const cold = steam(10, '#e6f4ff', 0.2, new THREE.Vector3(0, 0.22, 0.24), new THREE.Vector3(0, -0.5, 1).normalize(), 0.5, 0.25)
  live.add(cold.mesh)
  return { solid: g, live, update: (t) => cold.update(t, 0.9) }
}

/**
 * Drone de fouille sur sa borne de recharge (face à +z) : chenilles, tourelle à capteur, antenne.
 * `label` : « d1 » (vert, en état), « d2 » (ambre, cabossé : il penche et son voyant bégaie).
 */
const scavDrone: Builder = ({ label, random }) => {
  const damaged = label === 'd2'
  const accent = damaged ? C.scrap : C.phosphor
  const g = new THREE.Group(), live = new THREE.Group()
  const dark = lit(C.ironDark, 'metal')
  // La borne : dalle, plots d'angle, potelet de charge.
  g.add(box(0.56, 0.025, 0.56, dark, 0, 0.0125, 0))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.09, 0.008, 0.09, glow(C.hazard), sx * 0.22, 0.03, sz * 0.22))
  g.add(box(0.05, 0.26, 0.05, lit(C.iron, 'metal'), -0.22, 0.14, -0.22))
  const cable = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.22, 0.24, -0.2), new THREE.Vector3(-0.16, 0.1, -0.12), new THREE.Vector3(-0.1, 0.16, -0.08),
  ]), 8, 0.008, 5), lit(C.rubber))
  g.add(cable)
  // Le drone.
  const drone = new THREE.Group()
  drone.position.set(0.02, 0.025, 0.02)
  if (damaged) drone.rotation.set(0.05, 0.4, -0.09)
  for (const s of [-1, 1]) {
    drone.add(box(0.06, 0.07, 0.3, lit(C.rubber), s * 0.115, 0.04, 0, 0.02))
    for (const z of [-0.1, 0, 0.1]) drone.add(barX(0.022, 0.066, lit(C.iron, 'metal'), s * 0.115, 0.04, z, 8))
  }
  drone.add(box(0.19, 0.08, 0.24, lit(C.suit, 'metal'), 0, 0.105, 0, 0.012))
  drone.add(box(0.15, 0.02, 0.18, lit(C.suitLight, 'metal'), 0, 0.152, -0.01))
  drone.add(box(0.05, 0.03, 0.06, lit(C.suitDark, 'metal'), 0, 0.09, 0.14))
  if (damaged) drone.add(box(0.07, 0.006, 0.09, lit(C.rust), 0.04, 0.164, 0.02))
  drone.add(cylinder(0.004, 0.004, 0.16, dark, -0.06, 0.24, -0.08, 5))
  g.add(drone)
  // Tourelle, œil et voyant d'antenne : animés.
  const turret = new THREE.Group()
  turret.position.set(0, 0.165, 0.03)
  turret.add(part(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 6), dark, 0, 0.025, 0))
  turret.add(part(new THREE.BoxGeometry(0.09, 0.05, 0.07), lit(C.suitDark, 'metal'), 0, 0.07, 0))
  const eye = new THREE.MeshBasicMaterial({ color: accent })
  turret.add(part(new THREE.BoxGeometry(0.05, 0.02, 0.006), eye, 0, 0.072, 0.037))
  const tip = part(new THREE.SphereGeometry(0.01, 6, 5), eye, -0.06, 0.295, -0.11)
  const rig = new THREE.Group()
  rig.position.copy(drone.position)
  rig.rotation.copy(drone.rotation)
  rig.add(turret, tip)
  live.add(rig)
  const charge = new THREE.MeshBasicMaterial({ color: accent })
  live.add(part(new THREE.BoxGeometry(0.03, 0.03, 0.006), charge, -0.22, 0.22, -0.192))
  const phase = random() * 10
  return {
    solid: g,
    live,
    update: (t) => {
      // Le capteur balaie la pièce ; celui du drone cabossé reste coincé, et tressaute.
      turret.rotation.y = damaged ? 0.7 + Math.sin(t * 23 + phase) * 0.03 * (Math.sin(t * 0.7) > 0.6 ? 1 : 0) : Math.sin(t * 0.6 + phase) * 1.1
      const on = damaged ? Math.sin(t * 9 + phase) * Math.sin(t * 1.7) > 0.1 : true
      eye.color.set(accent).multiplyScalar(on ? 1 : 0.15)
      charge.color.set(accent).multiplyScalar(0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + phase)))
    },
  }
}

/**
 * Le butin, sur son étagère de cornière (adossée, face à +z) : ferraille, cellules de carburant,
 * un module, une boîte noire. Les couleurs sont celles des ressources du jeu.
 */
const scavLoot: Builder = ({ random }) => {
  const g = new THREE.Group(), live = new THREE.Group()
  const iron = lit(C.iron, 'metal'), dark = lit(C.ironDark, 'metal')
  for (const sx of [-1, 1]) for (const z of [0.04, 0.3]) g.add(box(0.03, 0.86, 0.03, iron, sx * 0.46, 0.43, z))
  for (const y of [0.1, 0.42, 0.74]) g.add(box(0.95, 0.02, 0.3, dark, 0, y, 0.17))
  // En bas : la ferraille.
  for (let k = 0; k < 9; k++) {
    const s = 0.05 + random() * 0.09
    const bit = box(s * 1.6, s, s * 1.2, lit([C.rust, C.rustDark, '#6d7078', C.brass][k % 4], 'metal'), -0.34 + random() * 0.68, 0.11 + s / 2 + (k % 3) * 0.04, 0.1 + random() * 0.14)
    bit.rotation.set(random() * 0.5, random() * 3, random() * 0.5)
    g.add(bit)
  }
  g.add(box(0.1, 0.03, 0.006, glow(C.scrap), -0.36, 0.085, 0.322))
  // Au milieu : les cellules de carburant.
  const fuel = new THREE.MeshBasicMaterial({ color: C.fuel })
  for (let k = 0; k < 4; k++) {
    const x = -0.33 + k * 0.15
    g.add(cylinder(0.05, 0.05, 0.22, lit('#27323d', 'metal'), x, 0.54, 0.17, 10), cylinder(0.035, 0.035, 0.02, dark, x, 0.66, 0.17, 8))
    live.add(part(new THREE.CylinderGeometry(0.052, 0.052, 0.05, 10), fuel, x, 0.54 + (k === 2 ? -0.05 : 0.02), 0.17))
  }
  // La boîte noire (orange, comme toutes les boîtes noires), son voyant.
  g.add(box(0.2, 0.13, 0.16, lit('#d9591c'), 0.32, 0.495, 0.17, 0.015))
  g.add(box(0.2, 0.02, 0.165, lit('#e8e4d8'), 0.32, 0.5, 0.17))
  const beacon = new THREE.MeshBasicMaterial({ color: C.threat })
  live.add(part(new THREE.SphereGeometry(0.012, 6, 5), beacon, 0.39, 0.57, 0.2))
  // En haut : un module d'amélioration dans son berceau, et un jerrican.
  g.add(box(0.2, 0.03, 0.2, iron, -0.2, 0.765, 0.17))
  const module = new THREE.MeshBasicMaterial({ color: C.upgrade })
  const core = part(new THREE.OctahedronGeometry(0.07), module, -0.2, 0.89, 0.17)
  live.add(core)
  g.add(box(0.16, 0.2, 0.1, lit('#3f5873', 'metal'), 0.24, 0.85, 0.16, 0.015), box(0.05, 0.03, 0.04, dark, 0.2, 0.965, 0.16))
  return {
    solid: g,
    live,
    update: (t) => {
      core.rotation.y = t * 0.8
      core.position.y = 0.89 + Math.sin(t * 1.3) * 0.012
      module.color.set(C.upgrade).multiplyScalar(0.75 + 0.25 * Math.sin(t * 2.1))
      fuel.color.set(C.fuel).multiplyScalar(0.8 + 0.2 * Math.sin(t * 1.1))
      beacon.color.set(C.threat).multiplyScalar(t % 2.4 < 0.25 ? 1 : 0.12)
    },
  }
}

/** Secteurs de la carte du jeu : nœuds par colonne (de la Bordure à Raxxla), reliés de proche en proche. */
const SECTOR_NODES: [number, number][][] = [
  [[20, 62], [24, 104]],
  [[62, 40], [66, 82], [58, 124]],
  [[108, 56], [112, 100]],
  [[152, 34], [158, 78], [150, 122]],
  [[200, 60], [204, 104]],
]
const RAXXLA: [number, number] = [240, 80]

/** La carte des secteurs (adossée, face à +z) : des épaves reliées par des sauts, et au bout, Raxxla. */
const scavMap: Builder = () => {
  const g = new THREE.Group(), live = new THREE.Group()
  const texture = drawnTexture(256, 160, (c) => {
    rect(c, 0, 0, 256, 160, '#050a06')
    c.strokeStyle = C.phosphorDim
    c.lineWidth = 1.5
    for (let col = 0; col < SECTOR_NODES.length; col++) {
      for (const [x, y] of SECTOR_NODES[col]) {
        for (const [nx, ny] of SECTOR_NODES[col + 1] ?? [RAXXLA]) {
          if (Math.abs(ny - y) > 50) continue
          c.beginPath(); c.moveTo(x, y); c.lineTo(nx, ny); c.stroke()
        }
      }
    }
    SECTOR_NODES.flat().forEach(([x, y], i) => {
      c.fillStyle = [C.phosphor, C.scrap, C.phosphor, C.fuel, C.phosphor, C.upgrade][i % 6]
      c.fillRect(x - 4, y - 4, 8, 8)
      rect(c, x - 2, y - 2, 4, 4, '#050a06')
    })
    c.fillStyle = C.upgrade
    c.beginPath(); c.arc(RAXXLA[0], RAXXLA[1], 7, 0, Math.PI * 2); c.fill()
    c.font = 'bold 12px monospace'
    c.textAlign = 'right'
    c.fillText('RAXXLA ?', 252, 62)
    c.fillStyle = C.phosphor
    c.textAlign = 'left'
    c.fillText(tr('CARTE DES SECTEURS', 'SECTOR MAP'), 8, 16)
    c.fillStyle = C.phosphorDim
    c.fillText(tr('CARBURANT : 3 SAUTS', 'FUEL: 3 JUMPS'), 8, 152)
    scanlines(c, 256, 160, 3)
  })
  g.add(box(1.0, 0.64, 0.035, lit(C.ironDark, 'metal'), 0, 0.6, 0.018, 0.008))
  g.add(part(new THREE.PlaneGeometry(0.94, 0.585), new THREE.MeshBasicMaterial({ map: texture }), 0, 0.6, 0.038))
  // « Vous êtes ici » : un repère qui clignote sur la deuxième colonne.
  const here = new THREE.MeshBasicMaterial({ color: '#f6fff9' })
  const [hx, hy] = SECTOR_NODES[1][1]
  const mark = part(new THREE.RingGeometry(0.028, 0.038, 4), here, (hx / 256 - 0.5) * 0.94, 0.6 + (0.5 - hy / 160) * 0.585, 0.04)
  mark.rotation.z = Math.PI / 4
  live.add(mark)
  return { solid: g, live, update: (t) => here.color.set('#f6fff9').multiplyScalar(Math.floor(t * 2) % 2 ? 1 : 0.25) }
}

/**
 * L'enseigne de la planque (adossée, face à +z, 1,5 de large) : le portrait de Kael et le titre
 * du jeu, en vert phosphore sur une tôle ; un tube qui fatigue.
 */
const scavSign: Builder = ({ random }) => {
  const texture = drawnTexture(384, 80, (c) => {
    c.clearRect(0, 0, 384, 80)
    c.imageSmoothingEnabled = false
    c.save()
    c.translate(6, 8)
    c.scale(2, 2)
    drawKael(c)
    c.restore()
    c.fillStyle = C.phosphor
    c.shadowColor = C.phosphor
    c.shadowBlur = 10
    c.font = 'bold 44px monospace'
    c.textBaseline = 'middle'
    c.fillText('SCAVENGERS', 82, 42, 292)
  })
  const g = new THREE.Group(), live = new THREE.Group()
  g.add(box(1.5, 0.3, 0.02, lit('#0c100d'), 0, 0.83, 0.01, 0.008))
  for (const s of [-1, 1]) g.add(box(0.02, 0.34, 0.03, lit(C.rust), s * 0.72, 0.83, 0.015))
  const tube = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
  live.add(part(new THREE.PlaneGeometry(1.44, 0.3), tube, 0, 0.83, 0.024))
  const phase = random() * 20
  return {
    solid: g,
    live,
    update: (t) => {
      const u = (t + phase) % 13
      tube.opacity = u > 12.5 && Math.sin(u * 80) > 0 ? 0.3 : 0.9 + Math.sin(t * 2.6) * 0.08
    },
  }
}

/**
 * Emplacement de Kael : son ombre au sol et son volume de clic. Le personnage lui-même est un
 * Mini Character, posé dessus par src/scavengers.ts.
 */
const scavKael: Builder = () => {
  const g = new THREE.Group()
  g.add(cylinder(0.18, 0.18, 0.004, lit('#101014'), 0, 0.002, 0, 14))
  return { solid: g, extent: new THREE.Box3(new THREE.Vector3(-0.18, 0, -0.18), new THREE.Vector3(0.18, 0.68, 0.18)) }
}

export const SCAVENGERS = {
  'duct-pipes': ductPipes,
  'duct-leak': ductLeak,
  'duct-fan': ductFan,
  'duct-boiler': ductBoiler,
  'duct-lamp': ductLamp,
  'duct-grate': ductGrate,
  'duct-sign': ductSign,
  'duct-valve': ductValve,
  'scav-terminal': scavTerminal,
  'scav-aria': scavAria,
  'scav-cryo': scavCryo,
  'scav-drone': scavDrone,
  'scav-loot': scavLoot,
  'scav-map': scavMap,
  'scav-sign': scavSign,
  'scav-kael': scavKael,
} satisfies Record<string, Builder>
