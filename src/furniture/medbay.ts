import * as THREE from 'three'
import { glowBand, halo } from './arcade-decor'
import { animatedScreen, barX, box, cylinder, drawnTexture, glow, holoMaterial, lit, part, sphere, type Builder } from './kit'

/*
 * Habillage de l'infirmerie (pont principal), autour du mobilier de medical.ts et de leisure.ts :
 * un sol de clinique à lignes de couleur, la potence de chaque lit (liseuse, constantes en
 * hologramme, lueur sous le sommier), la croix de pharmacie à diodes, le scialytique du scanner,
 * les chaises de la salle d'attente et les filets lumineux des murs. Hors ces chaises, posées là
 * où étaient celles du kit, rien ici ne bloque le passage : les trajets de Betty (cf.
 * shared/nurse.js) ne changent pas.
 *
 * Un objet accroché est construit dos au mur (origine sur la face du mur, au niveau du sol,
 * contenu vers +z).
 */

const C = {
  floor: '#eef3f5',
  joint: '#dfe7ea',
  aisle: '#e3ecef',
  teal: '#3fa89c',
  tealSoft: '#cfeae6',
  holo: '#5ff2d8',
  chrome: '#b9c1cc',
  white: '#e8edf1',
  dark: '#1b1d24',
  red: '#e0263a',
  blue: '#3690ea',
  green: '#39d98a',
}

// ---------------------------------------------------------------- sol

/** Pixels par mètre du sol. */
const PX = 128
/** Les trois lits (x), le scanner, la quarantaine, la porte : en coordonnées du pont (cf. levels.ts). */
const PLAN = { beds: [9.2, 10.5, 11.8], bedZ: 0.3, scan: [13.2, 0.4], tank: [15.05, 1.35], door: 13, emblem: [11.4, 1.62] }

/**
 * Sol de l'infirmerie (`label` : « largeur x profondeur | x du centre | z du centre », pour
 * dessiner en coordonnées du pont) : grandes dalles claires, un box teinté sous chaque lit et son
 * numéro, la lueur des sommiers, la croix de l'allée, trois lignes de couleur qui partent de la
 * porte (rouge : les lits, bleue : le scanner, verte : la quarantaine), et les anneaux du scanner
 * et de la quarantaine.
 */
const medFloor: Builder = ({ label = '7x4|12|1.5' }) => {
  const [size, cx, cz] = label.split('|')
  const [w, d] = size.split('x').map(Number)
  const x0 = Number(cx) - w / 2, z0 = Number(cz) - d / 2
  const map = drawnTexture(w * PX, d * PX, (g) => {
    g.fillStyle = C.floor
    g.fillRect(0, 0, w * PX, d * PX)
    // Tout le reste se dessine en mètres, dans le repère du pont.
    g.scale(PX, PX)
    g.translate(-x0, -z0)
    g.fillStyle = C.aisle
    g.fillRect(x0, 1.15, w, 1.15)
    g.fillStyle = C.joint
    for (let x = Math.ceil(x0 * 2) / 2; x < x0 + w; x += 0.5) g.fillRect(x - 0.006, z0, 0.012, d)
    for (let z = Math.ceil(z0 * 2) / 2; z < z0 + d; z += 0.5) g.fillRect(x0, z - 0.006, w, 0.012)
    g.lineCap = g.lineJoin = 'round'
    // Les box : la lueur du sommier, le rectangle teinté, le numéro au pied du lit.
    PLAN.beds.forEach((x, i) => {
      const glowUnder = g.createRadialGradient(x, PLAN.bedZ, 0.1, x, PLAN.bedZ, 0.95)
      glowUnder.addColorStop(0, 'rgba(95, 242, 216, 0.55)')
      glowUnder.addColorStop(1, 'rgba(95, 242, 216, 0)')
      g.fillStyle = glowUnder
      g.fillRect(x - 1, PLAN.bedZ - 1, 2, 2)
      g.strokeStyle = C.teal
      g.lineWidth = 0.03
      g.strokeRect(x - 0.58, -0.3, 1.16, 1.36)
      g.fillStyle = C.teal
      g.font = '800 0.2px system-ui, sans-serif'
      g.textAlign = 'center'
      g.fillText(`0${i + 1}`, x + 0.36, 1.0)
    })
    // Les trois lignes, de la porte à leur destination.
    const line = (color: string, points: number[][]) => {
      g.strokeStyle = color
      g.lineWidth = 0.05
      g.beginPath()
      points.forEach(([x, z]) => g.lineTo(x, z))
      g.stroke()
      const [ex, ez] = points[points.length - 1]
      g.fillStyle = color
      g.beginPath()
      g.arc(ex, ez, 0.07, 0, Math.PI * 2)
      g.fill()
    }
    const door = PLAN.door, south = z0 + d
    line(C.red, [[door - 0.14, south], [door - 0.14, 2.14], [PLAN.beds[0], 2.14], [PLAN.beds[0], 1.2]])
    for (const x of PLAN.beds.slice(1)) line(C.red, [[x, 2.14], [x, 1.2]])
    line(C.blue, [[door, south], [door, 2.0], [PLAN.scan[0], 1.8], [PLAN.scan[0], 1.02]])
    line(C.green, [[door + 0.14, south], [door + 0.14, 2.14], [14.5, 2.14], [14.5, 1.6]])
    // La croix de l'allée, dans son disque.
    const [ex, ez] = PLAN.emblem
    g.fillStyle = C.tealSoft
    g.beginPath()
    g.arc(ex, ez, 0.4, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = C.teal
    g.lineWidth = 0.035
    g.stroke()
    g.fillStyle = C.teal
    g.fillRect(ex - 0.08, ez - 0.25, 0.16, 0.5)
    g.fillRect(ex - 0.25, ez - 0.08, 0.5, 0.16)
    // L'anneau du scanner, en pointillés, et celui de la quarantaine, jaune et noir.
    g.strokeStyle = C.holo
    g.lineWidth = 0.035
    g.setLineDash([0.12, 0.08])
    g.beginPath()
    g.arc(PLAN.scan[0], PLAN.scan[1], 0.5, 0, Math.PI * 2)
    g.stroke()
    g.setLineDash([])
    for (let i = 0; i < 24; i++) {
      g.strokeStyle = i % 2 ? '#17181b' : '#ffd23c'
      g.lineWidth = 0.07
      g.lineCap = 'butt'
      g.beginPath()
      g.arc(PLAN.tank[0], PLAN.tank[1], 0.42, (i / 24) * Math.PI * 2, ((i + 1) / 24) * Math.PI * 2 + 0.01)
      g.stroke()
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

// ---------------------------------------------------------------- potence de lit

/** Constantes d'un patient au repos, par lit : pouls et saturation. */
const VITALS = [[72, 98], [64, 99], [81, 97]]

/** Battement d'un tracé cardiaque, sur une période. */
function beat(p: number): number {
  if (p > 0.2 && p < 0.22) return -0.2
  if (p >= 0.22 && p < 0.25) return 1
  if (p >= 0.25 && p < 0.27) return -0.35
  if (p > 0.4 && p < 0.5) return 0.3 * Math.sin(((p - 0.4) / 0.1) * Math.PI)
  return 0
}

/**
 * Potence d'un lit, pendue au plafond à la tête du lit (`label` : numéro du lit) : la liseuse, un
 * grand panneau holographique des constantes au-dessus d'elle, et la lueur sous le sommier.
 * Origine : la face du mur, dans l'axe du lit.
 */
const medBay: Builder = ({ label = '1' }) => {
  const n = Math.max(1, Math.min(3, Number(label) || 1))
  const [pulse, sat] = VITALS[n - 1]
  const chrome = lit(C.chrome, 'metal')
  const g = new THREE.Group()
  // La tige descend du plafond ; la liseuse éclaire l'oreiller.
  g.add(cylinder(0.012, 0.012, 0.5, chrome, 0, 1.36, 0.14, 6), box(0.62, 0.035, 0.1, lit(C.white), 0, 1.1, 0.16, 0.01), box(0.56, 0.008, 0.07, glow('#fff3de'), 0, 1.079, 0.16))
  for (const x of [-0.31, 0.31]) g.add(box(0.012, 0.045, 0.11, glow(C.holo), x, 1.1, 0.16))
  // La lueur sous le sommier, le long des deux grands côtés du lit (son milieu est à 0,65 du mur).
  for (const x of [-0.24, 0.24]) g.add(box(0.015, 0.012, 0.92, glow(C.holo), x, 0.012, 0.65))
  const vitals = animatedScreen(128, 72, 12, (c, t) => {
    c.clearRect(0, 0, 128, 72)
    c.strokeStyle = c.fillStyle = '#ffffff'
    c.lineWidth = 1.5
    c.strokeRect(1, 1, 126, 70)
    c.font = '700 11px monospace'
    c.textAlign = 'left'
    c.fillText(`LIT 0${n}`, 7, 14)
    c.textAlign = 'right'
    c.fillText(`SpO2 ${sat}`, 121, 14)
    c.lineWidth = 2
    c.beginPath()
    for (let x = 6; x < 84; x++) {
      const p = ((((x / 78) * 2 - t * (pulse / 60)) % 1) + 1) % 1
      c.lineTo(x, 44 - beat(p) * 18)
    }
    c.stroke()
    c.font = '700 24px monospace'
    c.fillText(String(pulse), 122, 52)
    // Le cœur bat au rythme du tracé.
    if ((t * (pulse / 60)) % 1 < 0.3) c.fillRect(90, 58, 6, 6)
    c.font = '700 8px monospace'
    c.fillText('BPM', 122, 64)
  })
  vitals.texture.magFilter = THREE.LinearFilter
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(0.56, 0.315), holoMaterial(vitals.texture, C.holo, 0.95), 0, 1.36, 0.2))
  return { solid: g, live, update: (t) => vitals.tick(t) }
}

// ---------------------------------------------------------------- croix de pharmacie

const CROSS = 24

/** Une diode de la croix : dans l'une des deux barres. */
const inCross = (x: number, y: number) => (x >= 8 && x < 16) || (y >= 8 && y < 16)

/**
 * Croix de pharmacie à diodes vertes, accrochée haut sur le mur : elle enchaîne ses animations
 * (remplissage, ondes, balayage, clignotement), comme celles des rues.
 */
const pharmacyCross: Builder = ({ random }) => {
  const phase = random() * 20
  const screen = animatedScreen(CROSS, CROSS, 10, (c, t) => {
    c.clearRect(0, 0, CROSS, CROSS)
    const u = t + phase, mode = Math.floor(u / 5) % 4, k = (u % 5) / 5
    for (let y = 0; y < CROSS; y++) {
      for (let x = 0; x < CROSS; x++) {
        if (!inCross(x, y)) continue
        const r = Math.max(Math.abs(x - 11.5), Math.abs(y - 11.5))
        const on = mode === 0 ? r < k * 14 : mode === 1 ? Math.floor(r - u * 6) % 4 === 0 : mode === 2 ? (x + y + Math.floor(u * 8)) % 6 < 3 : Math.floor(u * 3) % 2 === 0
        c.fillStyle = on ? '#5dff9a' : '#0b3a22'
        c.fillRect(x, y, 1, 1)
      }
    }
  })
  const g = new THREE.Group()
  const y = 1.22, arm = 0.5, bar = arm / 3
  g.add(box(arm + 0.03, bar + 0.03, 0.05, lit(C.dark), 0, y, 0.025), box(bar + 0.03, arm + 0.03, 0.05, lit(C.dark), 0, y, 0.025))
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(arm, arm), new THREE.MeshBasicMaterial({ map: screen.texture, transparent: true, alphaTest: 0.5 }), 0, y, 0.052))
  live.add(part(glowBand(0.9, 0.9), halo(C.green, 0.22), 0, y, 0.004))
  return { solid: g, live, update: (t) => screen.tick(t) }
}

// ---------------------------------------------------------------- scialytique

/**
 * Scialytique : la lampe d'opération pendue au plafond, sur son bras articulé, sa coupole à sept
 * foyers penchée sur ce qu'elle éclaire, et son faisceau.
 */
const surgicalLamp: Builder = () => {
  const chrome = lit(C.chrome, 'metal'), white = lit(C.white)
  const g = new THREE.Group()
  g.add(cylinder(0.02, 0.02, 0.26, chrome, 0.3, 1.42, -0.1, 8), sphere(0.03, chrome, 0.3, 1.29, -0.1, 8))
  const arm = barX(0.014, 0.3, chrome, 0.15, 1.27, -0.1, 6)
  arm.rotation.set(0, -0.3, Math.PI / 2 - 0.12)
  g.add(arm)
  const head = new THREE.Group()
  head.position.set(0, 1.2, -0.02)
  head.rotation.set(0.22, 0, -0.1)
  head.add(cylinder(0.2, 0.17, 0.05, white, 0, 0, 0, 20), cylinder(0.05, 0.05, 0.03, chrome, 0, 0.04, 0, 10), cylinder(0.19, 0.19, 0.006, lit('#cfd6de', 'metal'), 0, -0.027, 0, 20))
  for (let i = 0; i < 7; i++) {
    const a = (i / 6) * Math.PI * 2, r = i === 6 ? 0 : 0.115
    head.add(cylinder(0.042, 0.042, 0.008, glow('#f4fbff'), Math.cos(a) * r, -0.031, Math.sin(a) * r, 12))
  }
  // La poignée stérile, au milieu.
  head.add(cylinder(0.012, 0.012, 0.07, lit(C.teal), 0, -0.07, 0, 8))
  g.add(head)
  const live = new THREE.Group()
  const beam = part(new THREE.CylinderGeometry(0.16, 0.34, 1.0, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#dff6ff', transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }), 0, 0.66, 0)
  live.add(beam)
  return { solid: g, live }
}

// ---------------------------------------------------------------- salle d'attente

/** Chaise de la salle d'attente : coque turquoise sur un piétement chromé (assise à 0,25, dossier côté -z, comme les chaises du kit). */
const medChair: Builder = () => {
  const chrome = lit(C.chrome, 'metal'), shell = lit(C.teal)
  const g = new THREE.Group()
  for (const x of [-0.15, 0.15]) g.add(box(0.02, 0.02, 0.36, chrome, x, 0.01, 0), cylinder(0.011, 0.011, 0.21, chrome, x, 0.115, 0.1, 6), cylinder(0.011, 0.011, 0.21, chrome, x, 0.115, -0.1, 6))
  g.add(box(0.38, 0.035, 0.36, shell, 0, 0.235, 0.01, 0.014), box(0.38, 0.3, 0.035, shell, 0, 0.44, -0.16, 0.014), box(0.3, 0.03, 0.26, lit(C.tealSoft, 'cloth'), 0, 0.256, 0.02, 0.01))
  for (const x of [-0.15, 0.15]) g.add(cylinder(0.011, 0.011, 0.12, chrome, x, 0.28, -0.165, 6))
  return { solid: g }
}

// ---------------------------------------------------------------- filets lumineux

/** Filet lumineux le long d'un mur, sur son bandeau haut (`label` : longueur) : un trait turquoise, et sa lueur. */
const medStrip: Builder = ({ label = '2' }) => {
  const len = Number(label) || 2
  const g = new THREE.Group()
  g.add(box(len - 0.04, 0.03, 0.02, lit(C.white), 0, 0.9, 0.01), box(len - 0.06, 0.012, 0.012, glow('#b8fff2'), 0, 0.9, 0.024))
  const live = new THREE.Group()
  live.add(part(glowBand(len, 0.5, 0.9), halo(C.holo, 0.35), 0, 0.68, 0.004))
  return { solid: g, live }
}

export const MEDBAY = {
  'med-floor': medFloor,
  'med-bay': medBay,
  'pharmacy-cross': pharmacyCross,
  'surgical-lamp': surgicalLamp,
  'med-chair': medChair,
  'med-strip': medStrip,
} satisfies Record<string, Builder>
