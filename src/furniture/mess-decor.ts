import * as THREE from 'three'
import { glowBand, halo } from './arcade-decor'
import { animatedScreen, barX, box, cylinder, drawnTexture, glow, lit, mesh, part, sphere, type Builder } from './kit'
import { tr } from '../i18n'

/*
 * Habillage du mess (pont principal), autour du mobilier de kitchen.ts : une cantine chaude côté
 * salle, une cuisine blanche et froide côté fourneaux. Le sol dessiné d'un seul tenant (damier
 * crème, tomettes sous les tables, couloir du self, carrelage de la cuisine), une suspension
 * au-dessus de chaque place, les enseignes des postes du self, le soubassement émaillé des murs,
 * la fresque, le néon, le mur d'aromates, l'horloge et le tableau de liège ; en cuisine, la
 * batterie de cuivres et le tour de plonge. Rien ici ne bloque le passage : les trajets de Marcel
 * (cf. shared/chef.js) et les places des tables (cf. seats.ts) ne changent pas.
 *
 * Un objet accroché est construit dos au mur (origine sur la face du mur, au niveau du sol,
 * contenu vers +z).
 */

const C = {
  cream: '#f1e7d3',
  sand: '#e4d4b8',
  grout: '#d2c1a2',
  rust: '#8a5646',
  rustDark: '#734437',
  enamel: '#2e4c54',
  enamelDark: '#22393f',
  orange: '#e0701e',
  amber: '#ffb45e',
  warm: '#ffe2b0',
  ice: '#9fe8ff',
  tile: '#e3e9ea',
  tileJoint: '#c2cdd0',
  lane: '#3a3f4a',
  steel: '#c6ccd4',
  steelDark: '#565e69',
  black: '#1b1d22',
  copper: '#c9773c',
  wood: '#8a5a34',
  cork: '#b98a56',
}

const pick = <T,>(random: () => number, list: readonly T[]): T => list[Math.floor(random() * list.length)]

// ---------------------------------------------------------------- sol

/** Pixels par mètre du sol. */
const PX = 128
/**
 * Ce que le sol contourne, en coordonnées du pont (cf. levels.ts) : les deux tables, la porte, le
 * comptoir du self et les postes de la cuisine devant lesquels on travaille debout.
 */
const PLAN = { tables: [10.2, 13.8], tableZ: 7.45, door: 13, counter: { x0: 8.65, x1: 13.85, z0: 9.7, z1: 10.3 }, posts: [10.35, 11.8, 13.15] }

/** Fourchette et couteau, debout, de hauteur `s`, autour de (x, y). */
function cutlery(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.lineCap = 'round'
  g.lineWidth = s * 0.075
  // La fourchette : le manche, trois dents et leur traverse.
  const fx = x - s * 0.2
  g.beginPath()
  g.moveTo(fx, y - s * 0.16)
  g.lineTo(fx, y + s * 0.5)
  for (const d of [-0.11, 0, 0.11]) {
    g.moveTo(fx + s * d, y - s * 0.5)
    g.lineTo(fx + s * d, y - s * 0.2)
  }
  g.moveTo(fx - s * 0.11, y - s * 0.2)
  g.quadraticCurveTo(fx, y - s * 0.08, fx + s * 0.11, y - s * 0.2)
  g.stroke()
  // Le couteau : le manche, et la lame, bombée vers l'extérieur.
  const kx = x + s * 0.2
  g.beginPath()
  g.moveTo(kx, y + s * 0.02)
  g.lineTo(kx, y + s * 0.5)
  g.stroke()
  g.beginPath()
  g.moveTo(kx - s * 0.035, y + s * 0.04)
  g.lineTo(kx - s * 0.035, y - s * 0.5)
  g.quadraticCurveTo(kx + s * 0.16, y - s * 0.3, kx + s * 0.07, y + s * 0.04)
  g.closePath()
  g.fill()
}

/**
 * Sol du mess (`label` : « largeur x profondeur | x du centre | z du centre », pour dessiner en
 * coordonnées du pont). Côté salle, un damier crème, un tapis de tomettes sous chaque table,
 * l'emblème de l'allée, le paillasson de la porte et le couloir du self, sombre, fléché vers les
 * boissons. Le passage vers la cuisine a son seuil jaune et noir ; derrière, le carrelage blanc,
 * sa rigole et les tapis de caoutchouc des postes.
 */
const messFloor: Builder = ({ label = '7x7|12|9' }) => {
  const [size, cx, cz] = label.split('|')
  const [w, d] = size.split('x').map(Number)
  const x0 = Number(cx) - w / 2, z0 = Number(cz) - d / 2
  const { counter } = PLAN
  const map = drawnTexture(w * PX, d * PX, (g) => {
    // Tout se dessine en mètres, dans le repère du pont.
    g.scale(PX, PX)
    g.translate(-x0, -z0)
    // --- La salle : le damier.
    g.fillStyle = C.cream
    g.fillRect(x0, z0, w, counter.z1 - z0)
    g.fillStyle = C.sand
    for (let z = z0, j = 0; z < counter.z0; z += 0.5, j++) {
      for (let x = x0, i = 0; x < x0 + w; x += 0.5, i++) if ((i + j) % 2) g.fillRect(x, z, 0.5, 0.5)
    }
    g.fillStyle = C.grout
    for (let x = x0; x <= x0 + w; x += 0.5) g.fillRect(x - 0.005, z0, 0.01, counter.z0 - z0)
    for (let z = z0; z <= counter.z0; z += 0.5) g.fillRect(x0, z - 0.005, w, 0.01)
    // Sous chaque table, un tapis de tomettes, liseré de crème.
    for (const x of PLAN.tables) {
      const tw = 2.6, td = 2.2, tx = x - tw / 2, tz = PLAN.tableZ - td / 2
      g.fillStyle = C.rust
      g.fillRect(tx, tz, tw, td)
      g.fillStyle = C.rustDark
      for (let k = 0.2; k < tw; k += 0.2) g.fillRect(tx + k - 0.006, tz, 0.012, td)
      for (let k = 0.2; k < td; k += 0.2) g.fillRect(tx, tz + k - 0.006, tw, 0.012)
      g.strokeStyle = C.cream
      g.lineWidth = 0.03
      g.strokeRect(tx + 0.08, tz + 0.08, tw - 0.16, td - 0.16)
      g.strokeStyle = C.rustDark
      g.lineWidth = 0.04
      g.strokeRect(tx, tz, tw, td)
    }
    // L'emblème de l'allée, entre les deux tables : les couverts, dans leur disque.
    const ex = (PLAN.tables[0] + PLAN.tables[1]) / 2, ez = PLAN.tableZ
    g.fillStyle = C.lane
    g.beginPath()
    g.arc(ex, ez, 0.44, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = C.orange
    g.lineWidth = 0.045
    g.beginPath()
    g.arc(ex, ez, 0.36, 0, Math.PI * 2)
    g.stroke()
    g.strokeStyle = g.fillStyle = C.cream
    cutlery(g, ex, ez, 0.42)
    // Le paillasson de la porte, et son chevron qui invite à entrer.
    g.fillStyle = C.lane
    g.fillRect(PLAN.door - 0.5, z0 + 0.12, 1, 0.42)
    g.strokeStyle = C.orange
    g.lineWidth = 0.035
    g.lineCap = g.lineJoin = 'round'
    for (const dz of [0, 0.1]) {
      g.beginPath()
      g.moveTo(PLAN.door - 0.16, z0 + 0.24 + dz)
      g.lineTo(PLAN.door, z0 + 0.34 + dz)
      g.lineTo(PLAN.door + 0.16, z0 + 0.24 + dz)
      g.stroke()
    }
    // --- Le couloir du self, le long du comptoir : on le suit vers l'est, des plateaux aux boissons.
    const l0 = 9.02, l1 = counter.z0
    g.fillStyle = C.lane
    g.fillRect(x0, l0, counter.x1 - x0 + 0.1, l1 - l0)
    g.fillRect(x0, counter.z0, counter.x1 - x0, counter.z1 - counter.z0)
    g.fillStyle = C.orange
    g.fillRect(x0, l0, counter.x1 - x0 + 0.1, 0.04)
    g.font = '800 0.2px system-ui, sans-serif'
    g.textBaseline = 'middle'
    g.textAlign = 'left'
    g.fillText('SELF', 8.82, (l0 + l1) / 2 + 0.03)
    g.strokeStyle = C.amber
    g.lineWidth = 0.035
    for (let x = 9.75; x < counter.x1 - 0.1; x += 0.62) {
      g.beginPath()
      g.moveTo(x, (l0 + l1) / 2 - 0.1)
      g.lineTo(x + 0.11, (l0 + l1) / 2 + 0.02)
      g.lineTo(x, (l0 + l1) / 2 + 0.14)
      g.stroke()
    }
    // --- La cuisine : carrelage blanc, jusque dans le passage à l'est du comptoir.
    g.fillStyle = C.tile
    g.fillRect(x0, counter.z1, w, z0 + d - counter.z1)
    g.fillRect(counter.x1, counter.z0, x0 + w - counter.x1, counter.z1 - counter.z0)
    g.fillStyle = C.tileJoint
    for (let x = x0; x <= x0 + w; x += 0.25) g.fillRect(x - 0.005, x > counter.x1 ? counter.z0 : counter.z1, 0.01, d)
    for (let z = counter.z0; z <= z0 + d; z += 0.25) g.fillRect(z < counter.z1 ? counter.x1 : x0, z - 0.005, w, 0.01)
    // Le seuil du passage : une bande jaune et noire.
    for (let x = counter.x1, i = 0; x < x0 + w; x += 0.11, i++) {
      g.fillStyle = i % 2 ? '#17181b' : '#ffd23c'
      g.beginPath()
      g.moveTo(x, counter.z0 + 0.12)
      g.lineTo(x + 0.11, counter.z0 + 0.12)
      g.lineTo(x + 0.17, counter.z0)
      g.lineTo(x + 0.06, counter.z0)
      g.fill()
    }
    // La rigole, au milieu de l'allée, et ses fentes.
    g.fillStyle = '#8f98a3'
    g.fillRect(x0 + 0.4, 10.98, w - 0.8, 0.08)
    g.fillStyle = '#3d444e'
    for (let x = x0 + 0.44; x < x0 + w - 0.44; x += 0.07) g.fillRect(x, 10.995, 0.035, 0.05)
    // Devant chaque poste, un tapis de caoutchouc alvéolé.
    for (const x of PLAN.posts) {
      g.fillStyle = '#23262d'
      g.fillRect(x - 0.48, 11.4, 0.96, 0.36)
      g.fillStyle = '#3a3f49'
      for (let j = 0; j < 4; j++) for (let i = 0; i < 12 - (j % 2); i++) {
        g.beginPath()
        g.arc(x - 0.44 + i * 0.08 + (j % 2) * 0.04, 11.445 + j * 0.09, 0.022, 0, Math.PI * 2)
        g.fill()
      }
    }
  })
  map.anisotropy = 8
  const floor = part(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map, polygonOffset: true, polygonOffsetFactor: -2 }), 0, 0.006, 0)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  const g = new THREE.Group()
  g.add(floor)
  return { solid: g }
}

// ---------------------------------------------------------------- suspensions

/** Cône de lumière sous un abat-jour : il s'efface vers le bas. */
function beam(rTop: number, rBottom: number, h: number): THREE.CylinderGeometry {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, h, 16, 3, true)
  const p = geo.attributes.position
  const colors = new Float32Array(p.count * 4)
  for (let i = 0; i < p.count; i++) {
    const k = 0.5 + p.getY(i) / h
    colors.set([1, 1, 1, k * k], i * 4)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 4))
  return geo
}

/**
 * Suspension d'une place de table : un abat-jour d'émail orange au bout de son fil, l'ampoule
 * qu'on devine dessous, et son cône de lumière chaude sur le plateau. Origine : au sol, sous la lampe.
 */
const messPendant: Builder = () => {
  const g = new THREE.Group()
  const y = 1.12
  g.add(cylinder(0.004, 0.004, 0.56, lit(C.black), 0, y + 0.4, 0, 5), cylinder(0.018, 0.03, 0.03, lit(C.steelDark, 'metal'), 0, y + 0.115, 0, 8))
  g.add(cylinder(0.03, 0.125, 0.1, lit(C.orange), 0, y + 0.05, 0, 18), cylinder(0.118, 0.118, 0.006, glow('#fff0cf'), 0, y + 0.003, 0, 18))
  g.add(sphere(0.028, glow('#fffaf0'), 0, y - 0.008, 0, 8))
  const live = new THREE.Group()
  live.add(part(beam(0.1, 0.26, 0.68), halo('#ffc98a', 0.06), 0, y - 0.34, 0))
  return { solid: g, live }
}

// ---------------------------------------------------------------- enseignes du self

/** Pictogrammes des postes du self, dessinés dans un carré de 44 autour de (x, y). */
const PICTOS: Record<string, (g: CanvasRenderingContext2D, x: number, y: number) => void> = {
  tray(g, x, y) {
    g.strokeRect(x - 19, y - 11, 38, 22)
    g.beginPath()
    g.arc(x - 6, y, 6, 0, Math.PI * 2)
    g.moveTo(x + 8, y - 6)
    g.lineTo(x + 8, y + 6)
    g.stroke()
  },
  hot(g, x, y) {
    g.beginPath()
    g.arc(x, y + 2, 15, 0, Math.PI)
    g.closePath()
    g.stroke()
    for (const dx of [-8, 0, 8]) {
      g.beginPath()
      g.moveTo(x + dx, y - 3)
      g.quadraticCurveTo(x + dx + 5, y - 9, x + dx, y - 14)
      g.stroke()
    }
  },
  pass(g, x, y) {
    g.beginPath()
    g.arc(x, y + 8, 16, Math.PI, 0)
    g.closePath()
    g.moveTo(x - 20, y + 12)
    g.lineTo(x + 20, y + 12)
    g.moveTo(x, y - 8)
    g.lineTo(x, y - 12)
    g.stroke()
  },
  cold(g, x, y) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI
      g.beginPath()
      g.moveTo(x - Math.cos(a) * 16, y - Math.sin(a) * 16)
      g.lineTo(x + Math.cos(a) * 16, y + Math.sin(a) * 16)
      g.stroke()
    }
  },
  drink(g, x, y) {
    g.beginPath()
    g.moveTo(x - 11, y - 14)
    g.lineTo(x - 7, y + 15)
    g.lineTo(x + 7, y + 15)
    g.lineTo(x + 11, y - 14)
    g.closePath()
    g.moveTo(x + 3, y - 14)
    g.lineTo(x + 9, y - 22)
    g.stroke()
  },
}

/**
 * Les postes du self, d'ouest en est le long de la file, dans le repère du comptoir (cf.
 * selfCounter dans kitchen.ts, face à +z) : leur place, leur nom, leur pictogramme et leur couleur.
 */
const STATIONS: { x: number; name: () => string; picto: keyof typeof PICTOS; color: string }[] = [
  { x: 2.2, name: () => tr('PLATEAUX', 'TRAYS'), picto: 'tray', color: C.steel },
  { x: 1.05, name: () => tr('PLATS CHAUDS', 'HOT DISHES'), picto: 'hot', color: C.amber },
  { x: -0.25, name: () => tr('LA PASSE', 'THE PASS'), picto: 'pass', color: '#ff8a1c' },
  { x: -1.3, name: () => tr('FRAIS', 'CHILLED'), picto: 'cold', color: C.ice },
  { x: -2.2, name: () => tr('BOISSONS', 'DRINKS'), picto: 'drink', color: '#d9a8ff' },
]

/**
 * Enseignes des postes du self, pendues au-dessus du comptoir (à poser comme lui, même place et
 * même sens) : une tringle, et sous elle un petit caisson lumineux par poste, lisible de la salle
 * comme de la cuisine.
 */
const messSigns: Builder = () => {
  const g = new THREE.Group()
  const steel = lit(C.steel, 'metal')
  const railY = 1.27, y = 1.15, z = 0.2, W = 0.66, H = 0.17
  g.add(barX(0.008, 5.1, steel, 0, railY, z, 6))
  for (const x of [-2.45, -0.78, 0.4, 1.63, 2.45]) g.add(cylinder(0.004, 0.004, 0.36, steel, x, railY + 0.18, z, 5))
  for (const s of STATIONS) {
    const face = drawnTexture(264, 68, (c) => {
      c.fillStyle = '#10131a'
      c.fillRect(0, 0, 264, 68)
      c.fillStyle = s.color
      c.fillRect(0, 0, 264, 5)
      c.strokeStyle = s.color
      c.lineWidth = 3
      c.lineCap = c.lineJoin = 'round'
      PICTOS[s.picto](c, 34, 38)
      c.font = '800 25px system-ui, sans-serif'
      c.textBaseline = 'middle'
      c.fillStyle = '#f2ece0'
      c.fillText(s.name(), 66, 39, 190)
    })
    const lightbox = new THREE.MeshBasicMaterial({ map: face })
    g.add(box(W + 0.02, H + 0.02, 0.03, lit(C.black), s.x, y, z))
    g.add(mesh(new THREE.PlaneGeometry(W, H), lightbox, s.x, y, z + 0.0155))
    const back = mesh(new THREE.PlaneGeometry(W, H), lightbox, s.x, y, z - 0.0155)
    back.rotation.y = Math.PI
    g.add(back)
    for (const dx of [-W / 2 + 0.05, W / 2 - 0.05]) g.add(cylinder(0.004, 0.004, railY - y - H / 2, steel, s.x + dx, (railY + y + H / 2) / 2, z, 5))
    // Sous le caisson, le filet de lumière qui tombe sur le poste.
    g.add(box(W - 0.06, 0.006, 0.014, glow(s.color), s.x, y - H / 2 - 0.012, z))
  }
  return { solid: g }
}

// ---------------------------------------------------------------- soubassement

/**
 * Soubassement d'un mur de la salle (`label` : longueur) : des panneaux d'émail pétrole, leurs
 * joints, une plinthe noire et une cimaise d'inox.
 */
const messDado: Builder = ({ label = '2' }) => {
  const len = Number(label) || 2
  const g = new THREE.Group()
  g.add(box(len, 0.3, 0.012, lit(C.enamel), 0, 0.2, 0.006), box(len, 0.05, 0.016, lit(C.black), 0, 0.025, 0.008))
  g.add(box(len, 0.022, 0.024, lit(C.steel, 'metal'), 0, 0.36, 0.012))
  const n = Math.max(1, Math.round(len / 0.55))
  for (let i = 1; i < n; i++) g.add(box(0.008, 0.29, 0.004, lit(C.enamelDark), -len / 2 + (i * len) / n, 0.2, 0.013))
  return { solid: g }
}

// ---------------------------------------------------------------- fresque

const MURAL = { w: 3.5, h: 0.6, px: 1160, py: 200 }

/**
 * La fresque de la salle, sur son mur : un soir de récolte sur un monde agricole (les terrasses,
 * les dômes, la géante à anneaux), un cargo qui remonte vers l'orbite, et la devise de
 * l'intendance. Rétroéclairée, sous sa rampe.
 */
const messMural: Builder = ({ random }) => {
  const { w, h, px: W, py: H } = MURAL
  const art = drawnTexture(W, H, (g) => {
    const sky = g.createLinearGradient(0, 0, 0, H * 0.74)
    for (const [at, c] of [[0, '#211848'], [0.42, '#7a2f5c'], [0.8, '#e2622a'], [1, '#ffc068']] as const) sky.addColorStop(at, c)
    g.fillStyle = sky
    g.fillRect(0, 0, W, H)
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(255, 240, 220, ${0.25 + random() * 0.6})`
      g.fillRect(random() * W, random() * random() * H * 0.5, 1.6, 1.6)
    }
    // Le soleil, bas sur l'horizon.
    const sx = 690, sy = 142
    const sun = g.createRadialGradient(sx, sy, 6, sx, sy, 150)
    for (const [at, c] of [[0, 'rgba(255, 244, 214, 1)'], [0.2, 'rgba(255, 214, 140, 0.85)'], [1, 'rgba(255, 170, 90, 0)']] as const) sun.addColorStop(at, c)
    g.fillStyle = sun
    g.fillRect(sx - 160, sy - 160, 320, 320)
    // La géante et ses anneaux : l'arrière de l'anneau, la planète, puis l'avant.
    const px = 985, py = 58, pr = 36
    const ring = (from: number, to: number) => {
      g.strokeStyle = 'rgba(255, 228, 196, 0.8)'
      g.lineWidth = 5
      g.beginPath()
      g.ellipse(px, py, pr * 1.9, pr * 0.42, -0.32, from, to)
      g.stroke()
    }
    ring(Math.PI, Math.PI * 2)
    const giant = g.createLinearGradient(px - pr, py - pr, px + pr, py + pr)
    giant.addColorStop(0, '#f4d2a6')
    giant.addColorStop(1, '#9c4a45')
    g.fillStyle = giant
    g.beginPath()
    g.arc(px, py, pr, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = 'rgba(120, 50, 60, 0.35)'
    g.lineWidth = 3
    for (const dy of [-12, 2, 15]) {
      g.beginPath()
      g.ellipse(px, py + dy, Math.sqrt(pr * pr - dy * dy) - 1, 3, -0.32, 0, Math.PI)
      g.stroke()
    }
    ring(0, Math.PI)
    // Trois plans de collines, du plus loin au plus proche.
    const hills = (base: number, amp: number, period: number, phase: number, color: string) => {
      g.fillStyle = color
      g.beginPath()
      g.moveTo(0, H)
      for (let x = 0; x <= W; x += 8) g.lineTo(x, base - amp * Math.sin(x / period + phase) - amp * 0.4 * Math.sin(x / (period * 0.37) + phase * 2))
      g.lineTo(W, H)
      g.fill()
    }
    hills(140, 12, 120, 0.6, '#a8443c')
    // Les dômes de la colonie, fenêtres allumées, et son mât.
    for (const [x, r] of [[372, 26], [420, 16], [334, 12]]) {
      g.fillStyle = '#5c2540'
      g.beginPath()
      g.arc(x, 150, r, Math.PI, 0)
      g.fill()
      g.fillStyle = '#ffd08a'
      for (let k = -1; k <= 1; k++) g.fillRect(x + k * r * 0.45 - 2, 150 - r * 0.45, 4, 4)
    }
    g.fillStyle = '#5c2540'
    g.fillRect(451, 112, 2, 40)
    g.fillStyle = '#ff5a4a'
    g.fillRect(450, 109, 4, 4)
    hills(158, 9, 90, 2.1, '#5c2540')
    hills(178, 6, 150, 4, '#2c1630')
    // Les rangs des cultures, qui filent vers le soleil.
    g.strokeStyle = 'rgba(255, 176, 96, 0.3)'
    g.lineWidth = 1.5
    for (let x = -200; x <= W + 200; x += 44) {
      g.beginPath()
      g.moveTo(sx + (x - sx) * 0.22, 172)
      g.lineTo(x, H)
      g.stroke()
    }
    // Le cargo, ventru, et ses deux traînées.
    const cx = 565, cy = 66
    const trail = g.createLinearGradient(cx - 190, 0, cx - 20, 0)
    trail.addColorStop(0, 'rgba(255, 236, 200, 0)')
    trail.addColorStop(1, 'rgba(255, 236, 200, 0.75)')
    g.fillStyle = trail
    for (const dy of [-5, 4]) g.fillRect(cx - 190, cy + dy + 22, 170, 2.5)
    g.fillStyle = '#1f1430'
    g.beginPath()
    for (const [dx, dy] of [[-28, 12], [-18, 2], [14, -4], [44, 6], [50, 16], [40, 26], [-22, 30], [-30, 24]]) g.lineTo(cx + dx, cy + dy)
    g.fill()
    g.fillStyle = '#ffd08a'
    g.fillRect(cx + 30, cy + 9, 9, 3)
    // La devise, sur un fond qui s'assombrit vers la gauche.
    const shade = g.createLinearGradient(0, 0, 330, 0)
    shade.addColorStop(0, 'rgba(24, 14, 40, 0.82)')
    shade.addColorStop(1, 'rgba(24, 14, 40, 0)')
    g.fillStyle = shade
    g.fillRect(0, 0, 330, H)
    g.textBaseline = 'alphabetic'
    g.fillStyle = '#ffe9c9'
    g.font = '800 46px system-ui, sans-serif'
    g.fillText(tr('BIEN MANGER', 'EATING WELL'), 30, 78, 270)
    g.fillStyle = C.amber
    g.font = '800 27px system-ui, sans-serif'
    g.fillText(tr('C\'EST DÉJÀ BIEN VOLER', 'IS HALF THE FLIGHT'), 31, 112, 270)
    g.fillStyle = 'rgba(255, 233, 201, 0.75)'
    g.font = '700 12px system-ui, sans-serif'
    g.fillText(tr('INTENDANCE DU BORD · RÉCOLTES DE LA SERRE', 'SHIP\'S STORES · GREENHOUSE HARVESTS'), 32, 140, 270)
    g.strokeStyle = 'rgba(255, 233, 201, 0.55)'
    g.lineWidth = 2
    g.strokeRect(7, 7, W - 14, H - 14)
  })
  art.anisotropy = 8
  const g = new THREE.Group()
  const y = 0.69
  g.add(box(w + 0.06, h + 0.06, 0.03, lit(C.black), 0, y, 0.015, 0.008))
  g.add(mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: art, emissive: '#ffffff', emissiveMap: art, emissiveIntensity: 0.45 }), 0, y, 0.031))
  // La rampe, au-dessus du cadre.
  g.add(box(w - 0.3, 0.025, 0.06, lit(C.steelDark, 'metal'), 0, y + h / 2 + 0.05, 0.05), box(w - 0.34, 0.006, 0.04, glow(C.warm), 0, y + h / 2 + 0.036, 0.05))
  const live = new THREE.Group()
  live.add(part(glowBand(w + 0.5, 0.5, 0.75), halo(C.amber, 0.2), 0, 0.22, 0.004))
  return { solid: g, live }
}

// ---------------------------------------------------------------- néon

/**
 * Le néon du mess, sur son mur : un bol qui fume, « MESS » en tubes orange, et « ouvert 24/7 »
 * dessous. La fumée grésille de temps en temps.
 */
const messNeon: Builder = ({ random }) => {
  const W = 512, H = 320
  const tube = (g: CanvasRenderingContext2D, color: string, width: number, path: () => void) => {
    for (const [stroke, lineWidth, blur] of [[color, width, 24], ['#fff6e6', width * 0.34, 5]] as const) {
      g.shadowColor = color
      g.shadowBlur = blur
      g.strokeStyle = stroke
      g.lineWidth = lineWidth
      g.beginPath()
      path()
      g.stroke()
    }
  }
  const draw = (steam: boolean) => drawnTexture(W, H, (g) => {
    g.lineCap = g.lineJoin = 'round'
    const cx = 112, cy = 176
    tube(g, C.amber, 9, () => {
      g.moveTo(cx - 78, cy)
      g.lineTo(cx + 78, cy)
      g.arc(cx, cy, 66, 0, Math.PI)
      g.moveTo(cx - 30, cy + 78)
      g.lineTo(cx + 30, cy + 78)
    })
    if (steam) {
      for (const dx of [-34, 0, 34]) {
        tube(g, C.ice, 6, () => {
          g.moveTo(cx + dx, cy - 22)
          g.bezierCurveTo(cx + dx + 22, cy - 46, cx + dx - 22, cy - 74, cx + dx, cy - 100)
        })
      }
    }
    g.font = '800 104px system-ui, sans-serif'
    g.textBaseline = 'alphabetic'
    for (const [stroke, lineWidth, blur] of [[C.amber, 8, 24], ['#fff6e6', 2.6, 5]] as const) {
      g.shadowColor = C.amber
      g.shadowBlur = blur
      g.strokeStyle = stroke
      g.lineWidth = lineWidth
      g.strokeText('MESS', 214, 208, 280)
    }
    g.font = '700 30px system-ui, sans-serif'
    g.shadowColor = C.ice
    g.shadowBlur = 14
    g.fillStyle = '#e8fbff'
    g.fillText(tr('OUVERT 24/7', 'OPEN 24/7'), 220, 262, 270)
  })
  const sign = new THREE.MeshBasicMaterial({ map: draw(true), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
  const faint = new THREE.MeshBasicMaterial({ map: draw(false), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
  const w = 0.98, h = (w * H) / W, y = 0.68
  const g = new THREE.Group()
  // La plaque sombre qui porte les tubes, et ses entretoises.
  g.add(box(w + 0.04, h + 0.02, 0.012, lit('#20232b'), 0, y, 0.006, 0.006))
  for (const [x, dy] of [[-w / 2 + 0.05, h / 2 - 0.04], [w / 2 - 0.05, h / 2 - 0.04], [-w / 2 + 0.05, -h / 2 + 0.04], [w / 2 - 0.05, -h / 2 + 0.04]]) g.add(cylinder(0.008, 0.008, 0.02, lit(C.steel, 'metal'), x, y + dy, 0.02, 6).rotateX(Math.PI / 2))
  const live = new THREE.Group()
  const lit0 = part(new THREE.PlaneGeometry(w, h), sign, 0, y, 0.03)
  const lit1 = part(new THREE.PlaneGeometry(w, h), faint, 0, y, 0.03)
  lit1.visible = false
  live.add(lit0, lit1, part(glowBand(w + 0.5, h + 0.5), halo(C.amber, 0.22), 0, y, 0.014))
  const phase = random() * 30
  return {
    solid: g,
    live,
    update(t) {
      // Toutes les treize secondes, la fumée clignote trois fois.
      const k = (t + phase) % 13
      const out = k < 0.5 && Math.floor(k * 12) % 2 === 0
      lit0.visible = !out
      lit1.visible = out
    },
  }
}

// ---------------------------------------------------------------- mur d'aromates

const LEAVES = ['#4f9a3d', '#6fb04a', '#3f7f35', '#8cc05a', '#2f6b3a']

/**
 * Mur d'aromates : trois gouttières hydroponiques garnies (basilic, persil, ciboulette, et un
 * basilic pourpre de la serre de Capucine), leur rampe de culture rosée, l'étiquette de la serre.
 */
const messHerbs: Builder = ({ random }) => {
  const w = 1.2
  const g = new THREE.Group()
  g.add(box(w + 0.08, 0.66, 0.012, lit('#2a2e36'), 0, 0.66, 0.006, 0.006))
  for (const [row, y] of [0.44, 0.63, 0.82].entries()) {
    g.add(box(w, 0.055, 0.09, lit('#f4f6f8'), 0, y, 0.058, 0.012), box(w - 0.04, 0.008, 0.07, lit('#3b2a1c'), 0, y + 0.026, 0.058))
    for (let x = -w / 2 + 0.08; x < w / 2 - 0.05; x += 0.105) {
      const purple = row === 1 && random() < 0.3
      const kind = random()
      if (kind < 0.3) {
        // La ciboulette : des brins droits.
        for (let k = 0; k < 4; k++) g.add(cylinder(0.003, 0.004, 0.09 + random() * 0.04, lit('#5aa844'), x + (random() - 0.5) * 0.04, y + 0.075, 0.058 + (random() - 0.5) * 0.03, 4))
      } else {
        const leaf = lit(purple ? '#6b3a7a' : pick(random, LEAVES))
        for (let k = 0; k < 3; k++) g.add(sphere(0.022 + random() * 0.014, leaf, x + (random() - 0.5) * 0.045, y + 0.05 + random() * 0.035, 0.058 + (random() - 0.5) * 0.035, 6))
      }
    }
  }
  // La rampe de culture, en haut, et l'étiquette, en bas.
  g.add(box(w, 0.025, 0.07, lit(C.steelDark, 'metal'), 0, 0.975, 0.05), box(w - 0.06, 0.006, 0.05, glow('#ffc6f0'), 0, 0.961, 0.05))
  const card = drawnTexture(256, 48, (c) => {
    c.fillStyle = '#f4f0e4'
    c.fillRect(0, 0, 256, 48)
    c.fillStyle = '#3f7f35'
    c.fillRect(0, 0, 8, 48)
    c.font = '800 19px system-ui, sans-serif'
    c.textBaseline = 'middle'
    c.fillStyle = '#2a2e36'
    c.fillText(tr('AROMATES DU BORD', 'SHIP\'S HERBS'), 18, 17, 230)
    c.font = '600 13px system-ui, sans-serif'
    c.fillStyle = '#6a6f78'
    c.fillText(tr('Serre de Capucine · servez-vous', 'Capucine\'s greenhouse · help yourself'), 18, 36, 230)
  })
  g.add(mesh(new THREE.PlaneGeometry(0.48, 0.09), new THREE.MeshLambertMaterial({ map: card }), 0, 0.375, 0.014))
  const live = new THREE.Group()
  live.add(part(glowBand(w + 0.2, 0.6, 0.9), halo('#ff9ad8', 0.16), 0, 0.66, 0.016))
  return { solid: g, live }
}

// ---------------------------------------------------------------- horloge

/** Horloge de la salle : cadran sombre, heures orange, à l'heure de celui qui la regarde (le menu change à minuit). */
const messClock: Builder = () => {
  const S = 128
  const face = animatedScreen(S, S, 1, (c) => {
    const now = new Date()
    const sec = now.getSeconds(), min = now.getMinutes() + sec / 60, hour = (now.getHours() % 12) + min / 60
    c.clearRect(0, 0, S, S)
    c.fillStyle = '#12151c'
    c.beginPath()
    c.arc(64, 64, 62, 0, Math.PI * 2)
    c.fill()
    c.lineCap = 'round'
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      c.strokeStyle = i % 3 ? '#8b93a3' : C.amber
      c.lineWidth = i % 3 ? 2 : 4
      c.beginPath()
      c.moveTo(64 + Math.sin(a) * 50, 64 - Math.cos(a) * 50)
      c.lineTo(64 + Math.sin(a) * 57, 64 - Math.cos(a) * 57)
      c.stroke()
    }
    const hand = (turn: number, length: number, width: number, color: string) => {
      const a = turn * Math.PI * 2
      c.strokeStyle = color
      c.lineWidth = width
      c.beginPath()
      c.moveTo(64 - Math.sin(a) * 6, 64 + Math.cos(a) * 6)
      c.lineTo(64 + Math.sin(a) * length, 64 - Math.cos(a) * length)
      c.stroke()
    }
    hand(hour / 12, 30, 6, '#f2ece0')
    hand(min / 60, 44, 4, '#f2ece0')
    hand(sec / 60, 48, 1.6, '#ff8a1c')
    c.fillStyle = '#ff8a1c'
    c.beginPath()
    c.arc(64, 64, 4, 0, Math.PI * 2)
    c.fill()
  })
  face.texture.magFilter = THREE.LinearFilter
  const y = 0.78, r = 0.15
  const g = new THREE.Group()
  g.add(cylinder(r + 0.015, r + 0.015, 0.03, lit(C.steel, 'metal'), 0, y, 0.015, 24).rotateX(Math.PI / 2))
  const live = new THREE.Group()
  live.add(part(new THREE.CircleGeometry(r, 28), new THREE.MeshBasicMaterial({ map: face.texture }), 0, y, 0.031))
  return { solid: g, live, update: (t) => face.tick(t) }
}

// ---------------------------------------------------------------- tableau de liège

const PAPERS = ['#fff7c9', '#f4f0e4', '#ffd9c2', '#d6ecff', '#dff5d0']

/** Tableau de liège de la vie du bord : des mots punaisés, un polaroïd du Cobra, le planning des repas. */
const messBoard: Builder = ({ random }) => {
  const W = 512, H = 256
  const cork = drawnTexture(W, H, (g) => {
    g.fillStyle = C.cork
    g.fillRect(0, 0, W, H)
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${random() < 0.5 ? '90, 60, 30' : '230, 190, 140'}, ${0.12 + random() * 0.2})`
      g.fillRect(random() * W, random() * H, 2 + random() * 3, 2 + random() * 2)
    }
    g.fillStyle = '#1b1d22'
    g.fillRect(0, 0, W, 34)
    g.font = '800 20px system-ui, sans-serif'
    g.textBaseline = 'middle'
    g.fillStyle = C.amber
    g.fillText(tr('VIE DU BORD', 'SHIP LIFE'), 14, 18)
    const pin = (x: number, y: number) => {
      g.fillStyle = pick(random, ['#d8323c', '#2f7de0', '#ffd23c', '#39a85a'])
      g.beginPath()
      g.arc(x, y, 5, 0, Math.PI * 2)
      g.fill()
    }
    const note = (x: number, y: number, w: number, h: number, title: string, lines: number) => {
      g.save()
      g.translate(x + w / 2, y + h / 2)
      g.rotate((random() - 0.5) * 0.16)
      g.fillStyle = 'rgba(0, 0, 0, 0.2)'
      g.fillRect(-w / 2 + 3, -h / 2 + 4, w, h)
      g.fillStyle = pick(random, PAPERS)
      g.fillRect(-w / 2, -h / 2, w, h)
      g.fillStyle = '#c8321e'
      g.font = '800 13px system-ui, sans-serif'
      g.textBaseline = 'top'
      g.fillText(title, -w / 2 + 8, -h / 2 + 12, w - 16)
      g.fillStyle = 'rgba(40, 44, 54, 0.55)'
      for (let i = 0; i < lines; i++) g.fillRect(-w / 2 + 8, -h / 2 + 34 + i * 11, (w - 16) * (0.55 + random() * 0.45), 3)
      pin(0, -h / 2 + 6)
      g.restore()
    }
    note(18, 50, 130, 92, tr('PERDU : SPATULE', 'LOST: SPATULA'), 4)
    note(160, 46, 120, 110, tr('REPAS DE LA SEMAINE', 'MEALS THIS WEEK'), 6)
    note(24, 156, 150, 80, tr('RATION DU SERGENT ?', 'SERGEANT\'S RATION?'), 3)
    note(190, 168, 110, 70, tr('TOURNOI ARCADE', 'ARCADE CUP'), 3)
    note(406, 150, 92, 86, tr('PLONGE', 'DISH DUTY'), 4)
    // Le polaroïd : un Cobra devant une géante.
    g.save()
    g.translate(350, 100)
    g.rotate(0.07)
    g.fillStyle = 'rgba(0, 0, 0, 0.2)'
    g.fillRect(-57, -60, 120, 136)
    g.fillStyle = '#f7f4ec'
    g.fillRect(-60, -64, 120, 136)
    const sky = g.createLinearGradient(0, -56, 0, 40)
    sky.addColorStop(0, '#14183a')
    sky.addColorStop(1, '#6b2f5a')
    g.fillStyle = sky
    g.fillRect(-52, -56, 104, 96)
    g.fillStyle = '#e8a35e'
    g.beginPath()
    g.arc(26, 36, 44, Math.PI, 0)
    g.fill()
    g.fillStyle = '#d9dde6'
    g.beginPath()
    for (const [dx, dy] of [[-34, -6], [-6, -22], [22, -6], [8, 0], [-20, 0]]) g.lineTo(dx, dy)
    g.fill()
    g.fillStyle = '#3a3f4a'
    g.font = 'italic 600 11px system-ui, sans-serif'
    g.textBaseline = 'middle'
    g.textAlign = 'center'
    g.fillText(tr('Sortie d\'équipage, 3312', 'Crew outing, 3312'), 0, 56, 104)
    pin(0, -58)
    g.restore()
  })
  const w = 0.96, h = 0.48, y = 0.68
  const g = new THREE.Group()
  g.add(box(w + 0.05, h + 0.05, 0.02, lit(C.wood, 'wood'), 0, y, 0.01, 0.006))
  g.add(mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: cork }), 0, y, 0.021))
  return { solid: g }
}

// ---------------------------------------------------------------- cuisine

/**
 * Batterie de cuisine, pendue au plafond au-dessus d'un plan de travail : un cadre d'inox sur
 * quatre chaînes, et à ses crochets des poêles et des casseroles de cuivre, une passoire, des louches.
 */
const potRack: Builder = ({ random }) => {
  const steel = lit(C.steel, 'metal'), copper = lit(C.copper, 'metal')
  const W = 1.1, D = 0.26, y = 1.3
  const g = new THREE.Group()
  for (const z of [-D / 2, D / 2]) g.add(barX(0.01, W, steel, 0, y, z, 6))
  for (const x of [-W / 2, W / 2]) {
    g.add(box(0.02, 0.02, D, steel, x, y, 0))
    for (const z of [-D / 2, D / 2]) g.add(cylinder(0.004, 0.004, 0.34, steel, x, y + 0.17, z, 5))
  }
  const hooks = 7
  for (let i = 0; i < hooks; i++) {
    const x = -W / 2 + 0.1 + (i * (W - 0.2)) / (hooks - 1), z = i % 2 ? D / 2 : -D / 2
    g.add(cylinder(0.004, 0.004, 0.05, steel, x, y - 0.03, z, 5))
    const kind = i === 3 ? 'colander' : i % 3 === 2 ? 'ladle' : 'pan'
    if (kind === 'pan') {
      // Une poêle ou une casserole, pendue par le manche, le fond vers le mur.
      const r = 0.06 + random() * 0.035, deep = random() < 0.4 ? 0.07 : 0.025
      g.add(box(0.016, 0.13, 0.008, lit(C.black), x, y - 0.115, z))
      g.add(cylinder(r, r * 0.92, deep, copper, x, y - 0.18 - r, z, 14).rotateX(Math.PI / 2))
    } else if (kind === 'ladle') {
      g.add(cylinder(0.005, 0.005, 0.22, steel, x, y - 0.16, z, 5), sphere(0.03, steel, x, y - 0.28, z, 8))
    } else {
      g.add(box(0.014, 0.08, 0.008, steel, x, y - 0.09, z))
      const bowl = mesh(new THREE.SphereGeometry(0.085, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), steel, x, y - 0.13, z)
      bowl.rotation.x = Math.PI / 2
      g.add(bowl)
    }
  }
  return { solid: g }
}

/** Les jours de la semaine et qui est de plonge : Jacques est rayé (un robot, ça rouille). */
const ROTA: [() => string, string, boolean?][] = [
  [() => tr('LUN', 'MON'), 'Rourke'],
  [() => tr('MAR', 'TUE'), 'Betty'],
  [() => tr('MER', 'WED'), 'Nico'],
  [() => tr('JEU', 'THU'), 'Jacques', true],
  [() => tr('VEN', 'FRI'), 'Capucine'],
  [() => tr('SAM', 'SAT'), 'James'],
  [() => tr('DIM', 'SUN'), 'Julia'],
]

/** Tour de plonge, au mur de la cuisine : un tableau blanc, sa grille de la semaine, ses aimants et ses feutres. */
const kitchenRota: Builder = () => {
  const W = 448, H = 256
  const sheet = drawnTexture(W, H, (g) => {
    g.fillStyle = '#f6f8fa'
    g.fillRect(0, 0, W, H)
    g.fillStyle = C.orange
    g.fillRect(0, 0, W, 40)
    g.font = '800 22px system-ui, sans-serif'
    g.textBaseline = 'middle'
    g.fillStyle = '#10131a'
    g.fillText(tr('PLONGE · TOUR DE SERVICE', 'DISH DUTY · ROTA'), 14, 21, W - 28)
    ROTA.forEach(([day, name, struck], i) => {
      const y = 62 + i * 27
      g.fillStyle = '#c9d1d9'
      g.fillRect(14, y + 13, W - 28, 1.5)
      g.font = '800 17px system-ui, sans-serif'
      g.fillStyle = '#6a7380'
      g.fillText(day(), 16, y)
      g.font = 'italic 700 19px system-ui, sans-serif'
      g.fillStyle = struck ? '#9aa3ae' : '#1f4fa8'
      g.fillText(name, 92, y)
      if (struck) {
        g.strokeStyle = '#d8323c'
        g.lineWidth = 2.5
        g.beginPath()
        g.moveTo(88, y + 2)
        g.lineTo(92 + g.measureText(name).width + 6, y - 3)
        g.stroke()
        g.font = 'italic 700 15px system-ui, sans-serif'
        g.fillStyle = '#d8323c'
        g.fillText(tr('il rouille → Marcel', 'he rusts → Marcel'), 190, y)
      }
    })
    for (const [x, y, c] of [[400, 70, '#d8323c'], [418, 124, '#2f7de0'], [396, 178, '#39a85a']] as const) {
      g.fillStyle = c
      g.beginPath()
      g.arc(x, y, 9, 0, Math.PI * 2)
      g.fill()
    }
  })
  const w = 0.84, h = 0.48, y = 0.68
  const g = new THREE.Group()
  g.add(box(w + 0.04, h + 0.04, 0.016, lit(C.steel, 'metal'), 0, y, 0.008, 0.005))
  g.add(mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: sheet }), 0, y, 0.017))
  g.add(box(w * 0.6, 0.012, 0.04, lit(C.steel, 'metal'), 0, y - h / 2 - 0.02, 0.03))
  for (const [x, c] of [[-0.12, '#d8323c'], [-0.04, '#1f4fa8'], [0.04, '#1b1d22']] as const) g.add(barX(0.008, 0.07, lit(c), x, y - h / 2 - 0.006, 0.03, 6))
  return { solid: g }
}

export const MESS_DECOR = {
  'mess-floor': messFloor,
  'mess-pendant': messPendant,
  'mess-signs': messSigns,
  'mess-dado': messDado,
  'mess-mural': messMural,
  'mess-neon': messNeon,
  'mess-herbs': messHerbs,
  'mess-clock': messClock,
  'mess-board': messBoard,
  'pot-rack': potRack,
  'kitchen-rota': kitchenRota,
} satisfies Record<string, Builder>
