import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { animatedScreen, barX, box, cylinder, decal, drawnTexture, glass, glow, hazardTexture, holoMaterial, keepShared, lit, mesh, part, pointCloud, sphere, type Builder } from './kit'
import { tr } from '../i18n'
import { BAY, BAY_AREAS, BAY_LIT } from '../../shared/salvage.js'

/*
 * Récupération de cargaison en zone thargoïde (SOC-06) : le lobby du sas de la cale (terminal de
 * mission, mur des caméras de surveillance, porte blindée de la zone, tableau des victoires,
 * vestiaire, caisse de fusées) et ce qu'on trouve dans la baie infestée (casiers, colis, fusées,
 * plateforme d'extraction, lampes de secours). Acier noirci, jaune de chantier, vert caustique
 * des Thargoïdes.
 */

const C = {
  steel: '#3a3f47',
  steelDark: '#1f2328',
  steelLight: '#6d747e',
  hazard: '#e9a917',
  caustic: '#6dff9a',
  causticDeep: '#0d2a18',
  red: '#ff3b2f',
  screen: '#0b1a12',
  night: '#7dffa8',
  canister: '#c8ccd2',
  band: '#ff8a1c',
}

/** Coins coupés, à la façon des interfaces d'Elite. */
function chamfer(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cut: number) {
  c.beginPath()
  c.moveTo(x + cut, y)
  c.lineTo(x + w, y)
  c.lineTo(x + w, y + h - cut)
  c.lineTo(x + w - cut, y + h)
  c.lineTo(x, y + h)
  c.lineTo(x, y + cut)
  c.closePath()
}

/** Symbole de contamination thargoïde : un hexagone et ses six pétales, au vert caustique. */
function causticMark(c: CanvasRenderingContext2D, x: number, y: number, r: number, color = C.caustic) {
  c.save()
  c.translate(x, y)
  c.strokeStyle = color
  c.fillStyle = color
  c.lineWidth = r * 0.12
  c.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6
    c.lineTo(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42)
  }
  c.closePath()
  c.stroke()
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    c.beginPath()
    c.ellipse(Math.cos(a) * r * 0.75, Math.sin(a) * r * 0.75, r * 0.2, r * 0.1, a, 0, Math.PI * 2)
    c.fill()
  }
  c.restore()
}

// ---------------------------------------------------------------- lobby

/** Plan de la baie qui se dessine au fil des passes (le labyrinthe du terminal et des écrans). */
function mazeSketch(seed: number, cols: number, rows: number) {
  let s = seed
  const random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
  // Arbre couvrant simple : chaque cellule s'ouvre vers le nord ou l'ouest.
  const cells: { n: boolean; w: boolean }[] = []
  for (let z = 0; z < rows; z++) for (let x = 0; x < cols; x++) {
    const n = z > 0 && (x === 0 || random() < 0.5)
    cells.push({ n, w: x > 0 && !n })
  }
  return cells
}

/**
 * Terminal de mission, au milieu du lobby : un pupitre incliné (« RÉCUPÉRATION DE CARGAISON »)
 * et, au-dessus, le plan holographique de la baie où clignotent les colis.
 */
const terminal: Builder = () => {
  const g = new THREE.Group()
  const dark = lit(C.steelDark, 'metal'), steel = lit(C.steel, 'metal'), accent = glow(C.hazard)
  g.add(box(0.62, 0.05, 0.5, dark, 0, 0.025, 0, 0.01))
  g.add(box(0.36, 0.5, 0.3, steel, 0, 0.3, -0.02, 0.02))
  g.add(box(0.37, 0.02, 0.31, accent, 0, 0.1, -0.02))
  // Pupitre incliné vers les joueurs, son écran.
  const desk = new THREE.Group()
  desk.position.set(0, 0.58, 0.05)
  desk.rotation.x = -0.55
  desk.add(box(0.58, 0.04, 0.36, dark, 0, 0, 0, 0.012))
  const screen = animatedScreen(512, 320, 4, (c, t) => {
    c.fillStyle = '#0a0f14'
    c.fillRect(0, 0, 512, 320)
    c.strokeStyle = C.hazard
    c.lineWidth = 4
    chamfer(c, 8, 8, 496, 304, 22)
    c.stroke()
    c.fillStyle = C.hazard
    chamfer(c, 22, 22, 468, 46, 14)
    c.fill()
    c.fillStyle = '#0a0f14'
    c.font = 'bold 26px sans-serif'
    c.textBaseline = 'middle'
    c.fillText(tr('RÉCUPÉRATION DE CARGAISON', 'CARGO RECOVERY'), 38, 46)
    c.fillStyle = '#dfe7ee'
    c.font = '22px sans-serif'
    c.fillText(tr('Zone thargoïde · baie de stockage 7', 'Thargoid zone · storage bay 7'), 36, 98)
    const lines = [
      tr('Équipe : 1 à 4 CMDR', 'Crew: 1 to 4 CMDRs'),
      tr('Colis à récupérer : au choix', 'Cargo to recover: your call'),
      tr('Menace : élevée', 'Threat: high'),
    ]
    lines.forEach((l, i) => {
      c.fillStyle = i === 2 ? '#ff6a5c' : '#9fb6c8'
      c.fillText(l, 36, 140 + i * 34)
    })
    // Invite qui clignote.
    if (Math.floor(t * 2) % 2) {
      c.fillStyle = C.caustic
      c.font = 'bold 24px sans-serif'
      c.fillText(tr('▶ FORMER UNE ÉQUIPE', '▶ FORM A CREW'), 36, 268)
    }
    causticMark(c, 432, 220, 44)
  })
  screen.texture.magFilter = THREE.LinearFilter
  const live = new THREE.Group()
  const face = part(new THREE.PlaneGeometry(0.54, 0.32), new THREE.MeshBasicMaterial({ map: screen.texture }), 0, 0.022, 0)
  face.rotation.x = -Math.PI / 2
  desk.add(face)
  g.add(desk)
  // Projecteur et plan holographique de la baie.
  g.add(cylinder(0.12, 0.14, 0.04, dark, 0, 0.84, -0.12, 20), cylinder(0.05, 0.05, 0.01, glow(C.caustic), 0, 0.865, -0.12, 16))
  const cells = mazeSketch(1907, 7, 7)
  const map = drawnTexture(256, 256, (c) => {
    c.clearRect(0, 0, 256, 256)
    c.strokeStyle = '#ffffff'
    c.lineWidth = 7
    c.strokeRect(12, 12, 232, 232)
    const k = 232 / 7
    cells.forEach((cell, i) => {
      const x = 12 + (i % 7) * k, z = 12 + Math.floor(i / 7) * k
      if (!cell.n) {
        c.beginPath(); c.moveTo(x, z); c.lineTo(x + k, z); c.stroke()
      }
      if (!cell.w) {
        c.beginPath(); c.moveTo(x, z); c.lineTo(x, z + k); c.stroke()
      }
    })
  })
  const holo = new THREE.Group()
  holo.position.set(0, 0.92, -0.12)
  const plan = part(new THREE.PlaneGeometry(0.4, 0.4), holoMaterial(map, C.caustic, 0.7, 0, true), 0, 0, 0)
  plan.rotation.x = -Math.PI / 2
  holo.add(plan)
  const blips = [0, 1, 2].map((i) => {
    const b = part(new THREE.OctahedronGeometry(0.018), glow(i ? C.band : C.red), 0, 0.03, 0)
    holo.add(b)
    return b
  })
  const cone = part(new THREE.CylinderGeometry(0.2, 0.05, 0.06, 20, 1, true), holoMaterial(null, C.caustic, 0.12, 1, true), 0, -0.03, 0)
  holo.add(cone)
  live.add(holo)
  return {
    solid: g,
    live,
    update: (t) => {
      screen.tick(t)
      holo.rotation.y = t * 0.25
      blips.forEach((b, i) => {
        const a = t * (0.3 + i * 0.17) + i * 2.1
        b.position.set(Math.cos(a) * (0.08 + i * 0.04), 0.03 + Math.sin(t * 3 + i) * 0.01, Math.sin(a * 1.3) * (0.1 + i * 0.02))
        b.visible = i === 0 || Math.floor(t * 3 + i) % 3 !== 0
      })
    },
  }
}

/**
 * Mur des caméras de surveillance (1,9 de large, adossé au mur, dos à -z) : six moniteurs à la
 * vision nocturne verte (numéro de caméra, point « REC », grain), dont une silhouette traverse
 * parfois un écran ; en dessous, la console de l'opérateur. En partie, ce sont les caméras
 * alliées (cf. src/salvage/).
 */
const surveillance: Builder = () => {
  const g = new THREE.Group()
  const dark = lit(C.steelDark, 'metal'), steel = lit(C.steel, 'metal')
  g.add(box(1.9, 0.72, 0.06, dark, 0, 0.68, -0.2, 0.01))
  g.add(box(1.9, 0.03, 0.09, glow(C.hazard), 0, 1.05, -0.19))
  // Console : un plan de travail, deux claviers, un micro.
  g.add(box(1.7, 0.36, 0.3, steel, 0, 0.18, -0.06, 0.015))
  g.add(box(1.76, 0.03, 0.36, lit('#2b3038'), 0, 0.375, -0.05, 0.01))
  for (const x of [-0.45, 0.35]) g.add(box(0.36, 0.02, 0.12, lit('#15181c'), x, 0.4, 0.03, 0.006))
  g.add(cylinder(0.006, 0.006, 0.14, dark, 0.72, 0.46, -0.08, 6), sphere(0.02, lit('#15181c'), 0.72, 0.54, -0.06, 8))
  const live = new THREE.Group()
  const screens: ReturnType<typeof animatedScreen>[] = []
  for (let i = 0; i < 6; i++) {
    const col = i % 3, row = Math.floor(i / 3)
    const x = -0.6 + col * 0.6, y = 0.86 - row * 0.3
    g.add(box(0.56, 0.27, 0.05, lit('#101215'), x, y, -0.15, 0.01))
    let s = 4200 + i * 97
    const random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
    const walls = Array.from({ length: 5 }, () => ({ x: random() * 256, w: 20 + random() * 60, h: 40 + random() * 70 }))
    const phase = random() * 20
    const screen = animatedScreen(256, 128, 8, (c, t) => {
      c.fillStyle = '#04120a'
      c.fillRect(0, 0, 256, 128)
      // Couloir en perspective, murs et conteneurs.
      c.fillStyle = '#0d2f1a'
      for (const w of walls) c.fillRect(w.x, 128 - w.h, w.w, w.h)
      c.strokeStyle = '#1e5a33'
      c.lineWidth = 2
      c.beginPath(); c.moveTo(0, 128); c.lineTo(100, 60); c.lineTo(156, 60); c.lineTo(256, 128); c.stroke()
      // Une silhouette traverse parfois le champ.
      const k = ((t + phase) % 14) / 14
      if (k < 0.3) {
        const sx = -30 + (k / 0.3) * 316
        c.fillStyle = '#021006'
        c.fillRect(sx, 58, 16, 40)
        c.beginPath(); c.arc(sx + 8, 52, 8, 0, Math.PI * 2); c.fill()
        c.fillRect(sx + 12, 66, 18, 5)
      }
      // Grain et lignes de balayage.
      for (let n = 0; n < 60; n++) {
        c.fillStyle = `rgba(125, 255, 168, ${0.05 + ((n * 37 + Math.floor(t * 8) * 13) % 10) / 60})`
        c.fillRect((n * 97 + Math.floor(t * 8) * 31) % 256, (n * 53 + Math.floor(t * 8) * 17) % 128, 2, 1)
      }
      c.fillStyle = 'rgba(0, 0, 0, 0.25)'
      for (let y2 = 0; y2 < 128; y2 += 4) c.fillRect(0, y2, 256, 1)
      c.fillStyle = C.night
      c.font = 'bold 16px monospace'
      c.fillText(`CAM ${String(i + 1).padStart(2, '0')}`, 8, 18)
      if (Math.floor(t * 1.5) % 2) {
        c.fillStyle = C.red
        c.beginPath(); c.arc(234, 12, 5, 0, Math.PI * 2); c.fill()
      }
    })
    screen.texture.magFilter = THREE.LinearFilter
    screens.push(screen)
    live.add(part(new THREE.PlaneGeometry(0.52, 0.24), new THREE.MeshBasicMaterial({ map: screen.texture }), x, y, -0.122))
  }
  return { solid: g, live, update: (t) => { for (const s of screens) s.tick(t) } }
}

/**
 * Porte blindée de la zone (1,6 de large, dans l'épaisseur du mur, face à +z) : deux vantaux
 * boulonnés, cadre à bandes de danger, gyrophare rouge au-dessus et panneau « ZONE THARGOÏDE ».
 */
const blastDoor: Builder = () => {
  const g = new THREE.Group()
  const dark = lit(C.steelDark, 'metal'), steel = lit('#4b5059')
  const stripes = hazardTexture(512, 64, 24)
  const frameMat = new THREE.MeshLambertMaterial({ map: stripes })
  // Cadre : deux montants et un linteau rayés.
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.14, 1.02, 0.3), frameMat, s * 0.77, 0.51, 0))
  g.add(mesh(new THREE.BoxGeometry(1.68, 0.14, 0.3), frameMat, 0, 0.95, 0))
  // Vantaux : plaques, renforts en X, boulons.
  for (const s of [-1, 1]) {
    g.add(box(0.7, 0.86, 0.12, steel, s * 0.355, 0.44, 0.02, 0.01))
    const brace = barX(0.02, 0.9, dark, s * 0.355, 0.44, 0.09, 6)
    brace.rotation.z = s * 0.95
    g.add(brace)
    for (let k = 0; k < 4; k++) g.add(cylinder(0.016, 0.016, 0.02, lit('#8a9099'), s * (0.08 + (k % 2) * 0.5), 0.12 + Math.floor(k / 2) * 0.64, 0.085, 8).rotateX(Math.PI / 2))
  }
  g.add(box(0.03, 0.86, 0.13, dark, 0, 0.44, 0.02))
  // Volant de verrouillage au milieu.
  const wheel = mesh(new THREE.TorusGeometry(0.1, 0.014, 6, 20), lit('#b1302a'), 0, 0.5, 0.1)
  g.add(wheel)
  for (let k = 0; k < 3; k++) {
    const spoke = box(0.2, 0.012, 0.012, lit('#b1302a'), 0, 0.5, 0.1)
    spoke.rotation.z = (k / 3) * Math.PI
    g.add(spoke)
  }
  // Panneau au-dessus.
  const sign = drawnTexture(512, 96, (c) => {
    c.fillStyle = '#17181b'
    c.fillRect(0, 0, 512, 96)
    c.fillStyle = C.hazard
    c.fillRect(0, 0, 512, 6)
    c.fillRect(0, 90, 512, 6)
    causticMark(c, 52, 48, 34)
    c.fillStyle = '#f2f2ee'
    c.font = 'bold 40px sans-serif'
    c.textBaseline = 'middle'
    c.fillText(tr('ZONE THARGOÏDE', 'THARGOID ZONE'), 104, 42)
    c.font = '18px sans-serif'
    c.fillStyle = '#ff8f86'
    c.fillText(tr('Contamination caustique · accès en équipe', 'Caustic contamination · crews only'), 106, 76)
  })
  g.add(mesh(new THREE.PlaneGeometry(1.3, 0.24), new THREE.MeshBasicMaterial({ map: sign }), 0, 1.16, 0.16))
  g.add(box(1.34, 0.28, 0.04, dark, 0, 1.16, 0.13, 0.01))
  // Gyrophare : un dôme rouge, un faisceau qui tourne.
  const live = new THREE.Group()
  g.add(cylinder(0.07, 0.08, 0.04, dark, 0.66, 1.06, 0.12, 12))
  live.add(part(new THREE.SphereGeometry(0.06, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), glow(C.red), 0.66, 1.08, 0.12))
  const beam = part(new THREE.ConeGeometry(0.2, 0.9, 16, 1, true), holoMaterial(null, C.red, 0.18, 1, true), 0, 0, 0)
  beam.rotation.z = Math.PI / 2
  beam.position.x = 0.45
  const pivot = new THREE.Group()
  pivot.position.set(0.66, 1.1, 0.12)
  pivot.add(beam)
  live.add(pivot)
  return { solid: g, live, update: (t) => (pivot.rotation.y = t * 3.2) }
}

/**
 * Tableau des victoires (1 × 0,6, au mur, face à +z) : son écran invite à ouvrir le classement du
 * site (il n'affiche aucun nom : le vrai classement est dans le panneau).
 */
const salvageBoard: Builder = () => {
  const g = new THREE.Group()
  g.add(box(1.04, 0.66, 0.05, lit(C.steelDark, 'metal'), 0, 0.72, 0, 0.01))
  g.add(box(1.04, 0.02, 0.06, glow(C.caustic), 0, 1.05, 0.005))
  const screen = animatedScreen(512, 320, 2, (c, t) => {
    c.fillStyle = '#081109'
    c.fillRect(0, 0, 512, 320)
    c.strokeStyle = C.caustic
    c.lineWidth = 3
    chamfer(c, 6, 6, 500, 308, 20)
    c.stroke()
    c.fillStyle = C.caustic
    c.font = 'bold 28px sans-serif'
    c.textBaseline = 'middle'
    c.fillText(tr('MISSIONS RÉUSSIES', 'SUCCESSFUL MISSIONS'), 24, 36)
    c.fillStyle = '#9fd8b0'
    c.font = '18px sans-serif'
    c.fillText(tr('Classement des CMDR', 'CMDR leaderboard'), 24, 70)
    // Podium stylisé : trois marches qui s'allument l'une après l'autre.
    const lit3 = Math.floor(t) % 3
    const steps: [number, number, string][] = [[196, 150, '1'], [88, 110, '2'], [304, 80, '3']]
    steps.forEach(([x, h, n], i) => {
      c.fillStyle = i === lit3 ? 'rgba(109, 255, 154, 0.35)' : 'rgba(109, 255, 154, 0.12)'
      c.fillRect(x, 270 - h, 112, h)
      c.fillStyle = i === 0 ? '#ffd166' : '#dfe7ee'
      c.font = 'bold 34px sans-serif'
      c.textAlign = 'center'
      c.fillText(n, x + 56, 270 - h / 2)
      c.textAlign = 'left'
    })
    if (Math.floor(t * 2) % 2) {
      c.fillStyle = C.caustic
      c.font = 'bold 18px sans-serif'
      c.fillText(tr('▶ E : VOIR LE CLASSEMENT', '▶ E: SEE THE LEADERBOARD'), 24, 296)
    }
  })
  screen.texture.magFilter = THREE.LinearFilter
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(0.96, 0.6), new THREE.MeshBasicMaterial({ map: screen.texture }), 0, 0.72, 0.028))
  return { solid: g, live, update: (t) => screen.tick(t) }
}

/**
 * Casier métallique (0,42 × 0,26, 0,98 de haut, dos à -z) : aérations, poignée, numéro. `door`
 * rend la porte à part, pour l'ouvrir (on s'y cache, un ennemi le fouille).
 */
export function lockerParts(number = 0, rusty = false): { body: THREE.Group; door: THREE.Group } {
  const body = new THREE.Group()
  const shell = lit(rusty ? '#4a4038' : '#3d4a57'), dark = lit('#15181c')
  const W = 0.42, D = 0.26, H = 0.98
  body.add(box(W, H, 0.02, shell, 0, H / 2, -D / 2 + 0.01))
  for (const s of [-1, 1]) body.add(box(0.02, H, D, shell, s * (W / 2 - 0.01), H / 2, 0))
  body.add(box(W, 0.02, D, shell, 0, H - 0.01, 0), box(W, 0.06, D, dark, 0, 0.03, 0))
  body.add(box(W - 0.04, H - 0.1, 0.01, dark, 0, H / 2 + 0.02, -D / 2 + 0.025))
  // La porte pivote sur son bord gauche (x = -W/2), face à +z.
  const door = new THREE.Group()
  door.position.set(-W / 2 + 0.01, 0, D / 2 - 0.012)
  const doorMat = lit(rusty ? '#57493d' : '#4a5a69')
  door.add(box(W - 0.02, H - 0.08, 0.02, doorMat, (W - 0.02) / 2, H / 2 + 0.02, 0))
  for (let k = 0; k < 4; k++) door.add(box(0.2, 0.012, 0.012, dark, (W - 0.02) / 2, H - 0.14 - k * 0.035, 0.012))
  door.add(box(0.02, 0.1, 0.02, lit('#9aa1aa'), W - 0.08, H / 2, 0.018))
  const plate = drawnTexture(64, 32, (c) => {
    c.fillStyle = '#e9e4d8'
    c.fillRect(0, 0, 64, 32)
    c.fillStyle = '#17181b'
    c.font = 'bold 22px monospace'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(String(number).padStart(2, '0'), 32, 17)
  })
  door.add(mesh(new THREE.PlaneGeometry(0.07, 0.035), new THREE.MeshBasicMaterial({ map: plate }), (W - 0.02) / 2, H - 0.3, 0.012))
  return { body, door }
}

/** Trois casiers du vestiaire du lobby (1,3 × 0,26). */
const lockerRow: Builder = () => {
  const g = new THREE.Group()
  for (let i = 0; i < 3; i++) {
    const { body, door } = lockerParts(i + 1)
    body.add(door)
    body.position.x = -0.44 + i * 0.44
    g.add(body)
  }
  g.add(box(1.3, 0.04, 0.3, lit('#2b3038'), 0, 0.02, 0.02))
  return { solid: g }
}

/** Fusée d'appel : un bâton rouge à capuchon noir (0,16 de long), posé à plat. */
export function flareStick(lit_ = false): THREE.Group {
  const g = new THREE.Group()
  const stick = cylinder(0.018, 0.018, 0.14, lit_ ? glow('#ff4a3a') : lit('#c7271c'), 0, 0, 0, 10)
  stick.rotation.z = Math.PI / 2
  const cap = cylinder(0.021, 0.021, 0.035, lit('#1b1b1b'), -0.08, 0, 0, 10)
  cap.rotation.z = Math.PI / 2
  const band = cylinder(0.0195, 0.0195, 0.012, lit('#f2f2ee'), 0.03, 0, 0, 10)
  band.rotation.z = Math.PI / 2
  g.add(stick, cap, band)
  return g
}

/** Caisse de fusées d'appel du lobby (0,5 × 0,34), couvercle entrouvert. */
const flareCrate: Builder = () => {
  const g = new THREE.Group()
  const wood = lit('#5b4a3a')
  g.add(box(0.5, 0.22, 0.34, wood, 0, 0.11, 0, 0.01))
  g.add(box(0.46, 0.02, 0.3, lit('#2a211a'), 0, 0.215, 0))
  for (let i = 0; i < 7; i++) {
    const f = flareStick()
    f.position.set(-0.14 + (i % 4) * 0.09, 0.24 + Math.floor(i / 4) * 0.035, -0.08 + (i % 3) * 0.08)
    f.rotation.y = (i * 0.7) % 1.2
    g.add(f)
  }
  const lid = box(0.5, 0.025, 0.34, wood, 0, 0.3, -0.2)
  lid.rotation.x = -1.1
  g.add(lid)
  const print = drawnTexture(256, 96, (c) => {
    c.fillStyle = '#5b4a3a'
    c.fillRect(0, 0, 256, 96)
    c.fillStyle = '#e9e4d8'
    c.font = 'bold 30px sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(tr('FUSÉES D\'APPEL', 'DECOY FLARES'), 128, 34)
    c.font = '20px sans-serif'
    c.fillText(tr('2 par CMDR · à la main', '2 per CMDR · hand-thrown'), 128, 70)
  })
  g.add(mesh(new THREE.PlaneGeometry(0.44, 0.17), new THREE.MeshLambertMaterial({ map: print }), 0, 0.11, 0.172))
  return { solid: g }
}

/** Panneau mural « DANGER — CONTAMINATION » (0,6 × 0,4, au mur, face à +z). */
const bioSign: Builder = () => {
  const g = new THREE.Group()
  const face = drawnTexture(384, 256, (c) => {
    c.fillStyle = C.hazard
    c.fillRect(0, 0, 384, 256)
    c.fillStyle = '#17181b'
    c.fillRect(12, 12, 360, 232)
    causticMark(c, 192, 96, 62, C.hazard)
    c.fillStyle = C.hazard
    c.font = 'bold 40px sans-serif'
    c.textAlign = 'center'
    c.fillText(tr('DANGER', 'DANGER'), 192, 196)
    c.font = '20px sans-serif'
    c.fillStyle = '#f2f2ee'
    c.fillText(tr('Ne rien ramener sans scan', 'Bring nothing back unscanned'), 192, 228)
  })
  g.add(box(0.6, 0.4, 0.02, lit(C.steelDark, 'metal'), 0, 0.75, 0))
  g.add(mesh(new THREE.PlaneGeometry(0.58, 0.38), new THREE.MeshLambertMaterial({ map: face, emissive: '#ffffff', emissiveMap: face, emissiveIntensity: 0.35 }), 0, 0.75, 0.011))
  return { solid: g }
}

/** Zone de dépôt peinte au sol devant la porte blindée (1,6 × 1). */
const dropZone: Builder = () => {
  const texture = drawnTexture(320, 200, (c) => {
    const stripes = hazardTexture(320, 200, 20).image as HTMLCanvasElement
    c.drawImage(stripes, 0, 0)
    c.clearRect(16, 16, 288, 168)
    c.fillStyle = 'rgba(233, 169, 23, 0.9)'
    c.font = 'bold 30px sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(tr('SAS · ZONE', 'AIRLOCK · ZONE'), 160, 100)
  })
  return { live: decal(texture, 1.6, 1) }
}

/**
 * Bureau du poste de sécurité (1,3 × 0,34, face à +z, la contrôleuse derrière, côté -z) : une
 * console basse, son bandeau ambré, deux petits écrans tournés vers elle, le micro sur col de cygne,
 * la tasse et le registre.
 */
const securityDesk: Builder = () => {
  const g = new THREE.Group()
  const dark = lit(C.steelDark, 'metal'), steel = lit(C.steel, 'metal')
  g.add(box(1.3, 0.4, 0.34, steel, 0, 0.2, 0, 0.01))
  g.add(box(1.34, 0.03, 0.4, dark, 0, 0.415, -0.02))
  g.add(box(1.3, 0.025, 0.012, glow(C.hazard), 0, 0.35, 0.172))
  for (const x of [-0.38, 0.38]) {
    const screen = new THREE.Group()
    screen.position.set(x, 0.43, -0.06)
    screen.rotation.x = -0.25
    screen.add(box(0.3, 0.19, 0.025, lit('#101215'), 0, 0.1, 0, 0.006))
    screen.add(part(new THREE.PlaneGeometry(0.26, 0.15), glow(x < 0 ? '#2e8f5a' : '#2b6f9e'), 0, 0.1, -0.014).rotateY(Math.PI))
    g.add(screen)
  }
  g.add(box(0.36, 0.015, 0.12, lit('#15181c'), 0, 0.438, -0.08, 0.004))
  // Micro sur col de cygne, tourné vers la vitre.
  g.add(cylinder(0.025, 0.03, 0.02, dark, 0.12, 0.44, 0.06, 10))
  const neck = cylinder(0.006, 0.006, 0.2, dark, 0.12, 0.54, 0.09, 6)
  neck.rotation.x = 0.35
  g.add(neck, sphere(0.018, lit('#15181c'), 0.12, 0.63, 0.13, 8), sphere(0.006, glow(C.red), 0.12, 0.45, 0.075, 6))
  // La tasse et le registre.
  g.add(cylinder(0.025, 0.022, 0.05, lit('#d9d4c8'), -0.56, 0.455, 0.05, 10))
  g.add(box(0.16, 0.02, 0.12, lit('#6b3a2a'), 0.5, 0.44, 0.04))
  return { solid: g }
}

/**
 * Portique de décontamination (2,6 de large, face à +z) : deux montants rayés, la traverse et ses
 * émetteurs verts, et la nappe de lumière qui balaie qui passe dessous.
 */
const deconArch: Builder = () => {
  const g = new THREE.Group()
  const dark = lit(C.steelDark, 'metal')
  const stripes = new THREE.MeshLambertMaterial({ map: hazardTexture(64, 512, 16) })
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.BoxGeometry(0.12, 1.12, 0.16), stripes, s * 1.28, 0.56, 0))
    g.add(box(0.2, 0.04, 0.24, dark, s * 1.28, 0.02, 0))
    for (let k = 0; k < 4; k++) g.add(box(0.02, 0.06, 0.1, glow(C.caustic), s * 1.215, 0.25 + k * 0.22, 0))
  }
  g.add(box(2.7, 0.12, 0.2, dark, 0, 1.15, 0, 0.01))
  g.add(box(2.4, 0.02, 0.05, glow(C.caustic), 0, 1.085, 0.06))
  const sign = drawnTexture(512, 64, (c) => {
    c.fillStyle = '#0c1a12'
    c.fillRect(0, 0, 512, 64)
    c.fillStyle = C.caustic
    c.font = 'bold 30px sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(tr('DÉCONTAMINATION', 'DECONTAMINATION'), 256, 34)
  })
  g.add(mesh(new THREE.PlaneGeometry(1.1, 0.1), new THREE.MeshBasicMaterial({ map: sign }), 0, 1.15, 0.101))
  const live = new THREE.Group()
  const sheet = part(new THREE.PlaneGeometry(2.44, 0.05), holoMaterial(null, C.caustic, 0.55, 0, true), 0, 0.5, 0)
  sheet.rotation.x = -Math.PI / 2
  const curtain = part(new THREE.PlaneGeometry(2.44, 1.05), holoMaterial(null, C.caustic, 0.07, 0, true), 0, 0.55, 0)
  live.add(sheet, curtain)
  return { solid: g, live, update: (t) => (sheet.position.y = 0.08 + (0.5 + 0.5 * Math.sin(t * 1.7)) * 0.95) }
}

/** Interphone du poste de sécurité (sur pied, face à +z) : une grille, un bouton d'appel vert. */
const intercom: Builder = () => {
  const g = new THREE.Group()
  const dark = lit(C.steelDark, 'metal')
  g.add(box(0.14, 0.03, 0.14, dark, 0, 0.015, 0))
  g.add(cylinder(0.02, 0.02, 0.62, lit(C.steel, 'metal'), 0, 0.33, 0, 8))
  g.add(box(0.16, 0.22, 0.05, dark, 0, 0.72, 0, 0.01))
  for (let k = 0; k < 5; k++) g.add(box(0.1, 0.008, 0.01, lit('#5a616b'), 0, 0.76 + (k - 2) * 0.018, 0.026))
  g.add(cylinder(0.022, 0.022, 0.012, glow(C.caustic), 0, 0.66, 0.028, 12).rotateX(Math.PI / 2))
  const label = drawnTexture(128, 32, (c) => {
    c.fillStyle = C.hazard
    c.fillRect(0, 0, 128, 32)
    c.fillStyle = '#17181b'
    c.font = 'bold 20px sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(tr('APPEL', 'CALL'), 64, 17)
  })
  g.add(mesh(new THREE.PlaneGeometry(0.12, 0.03), new THREE.MeshBasicMaterial({ map: label }), 0, 0.855, 0.026))
  return { solid: g }
}

/**
 * Table de briefing (1,5 × 0,9, face à +z) : au-dessus, le plan holographique de la baie, le vrai
 * (cf. BAY) : cloisons, conteneurs, zones éclairées, le nid, la passerelle, le sas qui clignote,
 * une ligne de balayage et un écho rouge qui rôde.
 */
const bayHolo: Builder = () => {
  const g = new THREE.Group()
  const dark = lit(C.steelDark, 'metal')
  g.add(box(1.2, 0.5, 0.6, lit(C.steel, 'metal'), 0, 0.25, 0, 0.02))
  g.add(box(1.56, 0.06, 0.96, dark, 0, 0.53, 0, 0.02))
  for (const s of [-1, 1]) g.add(box(1.5, 0.018, 0.02, glow('#5fd4ff'), 0, 0.515, s * 0.47))
  g.add(box(1.44, 0.01, 0.86, lit('#0c1418'), 0, 0.565, 0))
  const H = BAY.length, W = BAY[0].length, k = 12
  const map = drawnTexture(W * k, H * k, (c) => {
    c.clearRect(0, 0, W * k, H * k)
    const areaTint: Record<string, string> = { nest: 'rgba(57, 255, 136, 0.35)', collapse: 'rgba(255, 170, 85, 0.18)' }
    for (let z = 0; z < H; z++) {
      for (let x = 0; x < W; x++) {
        const ch = BAY[z][x]
        const px = x * k, pz = z * k
        const lit_ = BAY_LIT.find((l) => x >= l.x && z >= l.z && x < l.x + l.w && z < l.z + l.d)
        const area = BAY_AREAS.find((a) => x >= a.x && z >= a.z && x < a.x + a.w && z < a.z + a.d)
        if (ch === '#') {
          c.fillStyle = 'rgba(140, 230, 255, 0.95)'
          c.fillRect(px, pz, k, k)
          continue
        }
        c.fillStyle = lit_ ? (lit_.id === 'greenhouse' ? 'rgba(224, 140, 255, 0.4)' : 'rgba(255, 220, 140, 0.35)') : (area && areaTint[area.id]) ?? 'rgba(80, 180, 230, 0.16)'
        c.fillRect(px + 0.5, pz + 0.5, k - 1, k - 1)
        if ('=Hcmpo'.includes(ch)) {
          c.fillStyle = ch === 'o' ? 'rgba(57, 255, 136, 0.9)' : ch === 'p' ? 'rgba(224, 140, 255, 0.7)' : 'rgba(140, 230, 255, 0.6)'
          c.fillRect(px + 2, pz + 2, k - 4, k - 4)
        } else if (ch === 'u' || ch === 'r') {
          c.strokeStyle = 'rgba(255, 170, 60, 0.9)'
          c.lineWidth = 2
          c.beginPath(); c.moveTo(px, pz + k); c.lineTo(px + k, pz); c.stroke()
        } else if (ch === 'x') {
          c.fillStyle = 'rgba(109, 255, 154, 0.95)'
          c.fillRect(px + 1, pz + 1, k - 2, k - 2)
        } else if (ch === 'g') {
          c.fillStyle = 'rgba(255, 180, 70, 0.9)'
          c.fillRect(px + 1, pz + 1, k - 2, k - 2)
        }
      }
    }
    c.strokeStyle = 'rgba(140, 230, 255, 0.95)'
    c.lineWidth = 3
    c.strokeRect(1.5, 1.5, W * k - 3, H * k - 3)
  })
  const plan = new THREE.MeshBasicMaterial({ map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  const live = new THREE.Group()
  const holo = new THREE.Group()
  holo.position.set(0, 0.68, 0)
  const sheet = part(new THREE.PlaneGeometry(1.38, (1.38 * H) / W), plan, 0, 0, 0)
  sheet.rotation.x = -Math.PI / 2
  holo.add(sheet)
  const scan = part(new THREE.PlaneGeometry(0.02, (1.38 * H) / W), holoMaterial(null, '#5fd4ff', 0.7, 0, true), 0, 0.01, 0)
  scan.rotation.x = -Math.PI / 2
  holo.add(scan)
  // Le sas qui clignote, un écho qui rôde.
  const toPlan = (x: number, z: number) => new THREE.Vector3(((x + 0.5) / W - 0.5) * 1.38, 0.02, ((z + 0.5) / H - 0.5) * ((1.38 * H) / W))
  const airlock = part(new THREE.OctahedronGeometry(0.025), glow(C.caustic), 0, 0, 0)
  airlock.position.copy(toPlan(17, 24.5))
  const blip = part(new THREE.SphereGeometry(0.018, 8, 6), glow(C.red), 0, 0, 0)
  holo.add(airlock, blip)
  const cone = part(new THREE.CylinderGeometry(0.75, 0.62, 0.12, 24, 1, true), holoMaterial(null, '#5fd4ff', 0.1, 1, true), 0, 0.62, 0)
  cone.scale.z = 0.62
  live.add(holo, cone)
  return {
    solid: g,
    live,
    update: (t) => {
      scan.position.x = (((t * 0.12) % 1) - 0.5) * 1.36
      airlock.visible = Math.floor(t * 2) % 2 === 0
      airlock.rotation.y = t * 2
      const a = t * 0.13
      blip.position.copy(toPlan(29 + Math.cos(a) * 4, 15 + Math.sin(a * 1.7) * 2))
      blip.visible = Math.floor(t * 3) % 4 !== 0
    },
  }
}

// ---------------------------------------------------------------- le nid thargoïde

/**
 * Résine thargoïde : un noir verdâtre, parcouru d'un fin réseau d'hexagones qui luit à peine
 * (la même texture sert de couleur et de lueur : le fond reste sombre, les arêtes brillent).
 */
let resinMats: { solid: THREE.MeshLambertMaterial; double: THREE.MeshLambertMaterial } | null = null
function resin() {
  if (resinMats) return resinMats
  const hex = drawnTexture(256, 256, (c) => {
    c.fillStyle = '#2a2f2c'
    c.fillRect(0, 0, 256, 256)
    const r = 22, h = r * Math.sqrt(3)
    c.strokeStyle = '#e8fff0'
    c.lineWidth = 2.2
    for (let row = -1; row < 256 / h + 1; row++) {
      for (let col = -1; col < 256 / (r * 1.5) + 1; col++) {
        const cx = col * r * 1.5, cy = row * h + (col % 2 ? h / 2 : 0)
        c.beginPath()
        for (let k = 0; k <= 6; k++) {
          const a = (k / 6) * Math.PI * 2
          c.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92)
        }
        c.stroke()
      }
    }
  })
  hex.wrapS = hex.wrapT = THREE.RepeatWrapping
  hex.repeat.set(3, 1)
  const solid = keepShared(new THREE.MeshLambertMaterial({ color: '#1a231e', map: hex, emissive: '#22ff7a', emissiveMap: hex, emissiveIntensity: 0.14 }))
  const double = keepShared(solid.clone())
  double.side = THREE.DoubleSide
  resinMats = { solid, double }
  return resinMats
}

/** Tube de `r` le long des points donnés (racines, brins, veines). */
const tube = (points: THREE.Vector3[], r: number, m: THREE.Material, seg = 12) =>
  mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), seg, r, 6), m)

/** Cristal thargoïde : un prisme hexagonal pointu, vert (fusionné avec la spire : couleur pleine). */
const crystalMat = () => keepShared(new THREE.MeshLambertMaterial({ color: '#25b866' }))
let crystalShared: THREE.MeshLambertMaterial | null = null

/**
 * Spire de la ruche (une tuile, une excroissance du nid) : des racines qui s'étalent sur le sol,
 * trois brins de résine torsadés en tronc, veinés de vert, des cristaux à leur pied, et en haut un
 * bouton aux pétales entrouverts sur un cœur lumineux, qui respire et bat (plus fort par moments).
 * La même fleur que la tête des Thargoïdes de la baie.
 */
const thargoidSpire: Builder = ({ random }) => {
  const g = new THREE.Group()
  const { solid: res, double } = resin()
  const vein = glow('#39ff88')
  // Racines : elles partent du pied et s'étalent jusqu'au bord de la tuile.
  const roots = 5 + Math.floor(random() * 3)
  for (let i = 0; i < roots; i++) {
    const a = (i / roots) * Math.PI * 2 + random() * 0.6
    const r1 = 0.34 + random() * 0.12
    const bend = (random() - 0.5) * 0.5
    const at = (rr: number, y: number, b = 0) => new THREE.Vector3(Math.cos(a + b) * rr, y, Math.sin(a + b) * rr)
    const path = [at(0.06, 0.34), at(0.17, 0.2, bend * 0.3), at(r1 * 0.75, 0.06, bend * 0.7), at(r1, 0.012, bend)]
    g.add(tube(path, 0.045 - (i % 3) * 0.008, res, 10))
    if (i % 2 === 0) g.add(tube(path.map((p) => p.clone().setY(p.y + 0.035)), 0.009, vein, 10))
  }
  // Tronc : trois brins qui s'enroulent en se resserrant, autour d'une âme sombre.
  const strands = 3
  for (let k = 0; k < strands; k++) {
    const pts: THREE.Vector3[] = []
    const veinPts: THREE.Vector3[] = []
    for (let s = 0; s <= 12; s++) {
      const t = s / 12
      const y = 0.08 + t * 0.86
      const rr = 0.15 * (1 - t) + 0.05
      const ang = (k / strands) * Math.PI * 2 + t * Math.PI * 1.7
      pts.push(new THREE.Vector3(Math.cos(ang) * rr, y, Math.sin(ang) * rr))
      veinPts.push(new THREE.Vector3(Math.cos(ang) * (rr + 0.045), y, Math.sin(ang) * (rr + 0.045)))
    }
    g.add(tube(pts, 0.052 - k * 0.006, res, 24))
    if (k === 0) g.add(tube(veinPts, 0.01, vein, 24))
  }
  g.add(cylinder(0.05, 0.11, 0.86, res, 0, 0.5, 0, 7))
  // Cristaux au pied.
  crystalShared ??= crystalMat()
  const crystals = 3 + Math.floor(random() * 3)
  for (let i = 0; i < crystals; i++) {
    const a = random() * Math.PI * 2, rr = 0.2 + random() * 0.18, h = 0.12 + random() * 0.16
    const c = mesh(new THREE.CylinderGeometry(0, 0.035 + random() * 0.02, h, 6), crystalShared, Math.cos(a) * rr, h / 2 - 0.01, Math.sin(a) * rr)
    c.rotation.set((random() - 0.5) * 0.8, random() * Math.PI, (random() - 0.5) * 0.8)
    g.add(c)
  }
  // Le bouton : une corolle de six pétales (une seule géométrie) qui s'évase vers le haut, leur
  // doublure qui luit, et au fond le cœur.
  const live = new THREE.Group()
  const bud = new THREE.Group()
  bud.position.y = 0.92
  bud.rotation.y = random() * Math.PI
  const petal = (inset: number) => Array.from({ length: 6 }, (_, i) => {
    const width = ((Math.PI * 2) / 6) * 0.72
    const geo = new THREE.CylinderGeometry(0.2 - inset, 0.05 - inset * 0.5, 0.26, 4, 3, true, (i / 6) * Math.PI * 2 - width / 2, width)
    // Le bout des pétales se recourbe vers l'extérieur.
    const pos = geo.attributes.position as THREE.BufferAttribute
    for (let v = 0; v < pos.count; v++) {
      const y = pos.getY(v) + 0.13
      const k = 1 + Math.max(0, y - 0.12) * 1.6
      pos.setXYZ(v, pos.getX(v) * k, pos.getY(v) + 0.13 - Math.max(0, y - 0.18) * 0.4, pos.getZ(v) * k)
    }
    geo.computeVertexNormals()
    return geo
  })
  const petals = part(mergeGeometries(petal(0))!, double, 0, 0, 0)
  const liningMat = new THREE.MeshBasicMaterial({ color: '#2fd873', transparent: true, opacity: 0.45, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
  const glowLining = part(mergeGeometries(petal(0.015))!, liningMat, 0, 0, 0)
  const coreMat = new THREE.MeshBasicMaterial({ color: '#8dffbf' })
  const core = part(new THREE.SphereGeometry(0.06, 14, 10), coreMat, 0, 0.07, 0)
  const haloMat = new THREE.MeshBasicMaterial({ color: '#39ff88', transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false })
  const halo = part(new THREE.SphereGeometry(0.1, 14, 10), haloMat, 0, 0.08, 0)
  // Les étamines : de fins filaments lumineux qui sortent du cœur.
  const stamens = new THREE.Group()
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + random()
    stamens.add(tube([new THREE.Vector3(0, 0.07, 0), new THREE.Vector3(Math.cos(a) * 0.05, 0.15, Math.sin(a) * 0.05), new THREE.Vector3(Math.cos(a) * 0.09, 0.2 + random() * 0.04, Math.sin(a) * 0.09)], 0.006, vein, 6))
  }
  bud.add(petals, glowLining, core, halo, stamens)
  live.add(bud)
  const phase = random() * 10
  const deep = new THREE.Color('#1f9a55'), bright = new THREE.Color('#c9ffe0')
  return {
    solid: g,
    live,
    update: (t) => {
      const k = t + phase
      // Les pétales s'ouvrent et se referment lentement ; le cœur bat, deux coups, puis repos.
      const open = 1 + 0.14 * Math.sin(k * 0.7)
      petals.scale.set(open, 1 - (open - 1) * 0.5, open)
      glowLining.scale.copy(petals.scale)
      const beat = Math.max(0, Math.sin(k * 3.1)) ** 6 + 0.6 * Math.max(0, Math.sin(k * 3.1 - 0.9)) ** 6
      coreMat.color.lerpColors(deep, bright, 0.3 + 0.7 * beat)
      liningMat.opacity = 0.3 + 0.3 * beat
      haloMat.opacity = 0.1 + 0.25 * beat
      halo.scale.setScalar(1 + 0.35 * beat)
    },
  }
}

/** Contour irrégulier (flaque) : un cercle de rayon `r` qui ondule de `wobble`, couché au sol. */
function puddle(r: number, wobble: number, random: () => number, seg = 16): THREE.ShapeGeometry {
  const shape = new THREE.Shape()
  const k = Array.from({ length: 3 }, () => random() * Math.PI * 2)
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2
    const rr = r * (1 + wobble * (Math.sin(a * 2 + k[0]) * 0.5 + Math.sin(a * 3 + k[1]) * 0.35 + Math.sin(a * 5 + k[2]) * 0.15))
    if (i === 0) shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
    else shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
  }
  const geo = new THREE.ShapeGeometry(shape)
  geo.rotateX(-Math.PI / 2)
  return geo
}

/** Reflets caustiques : des cellules claires aux bords flous (la surface de la flaque). */
let causticTex: THREE.CanvasTexture | null = null
let mistTex: THREE.CanvasTexture | null = null
let poolMats: { crust: THREE.Material; liquid: THREE.Material } | null = null

/**
 * Flaque caustique (une tuile, elle colle aux semelles) : une croûte sombre, le liquide vert
 * translucide, des reflets qui tournent lentement, deux bulles qui montent et crèvent, et une
 * brume verte qui respire au-dessus.
 */
const causticPool: Builder = ({ random }) => {
  poolMats ??= {
    // Opaques, et un peu au-dessus du sol : ils passent devant la biomasse du nid (transparente,
    // dessinée après eux). Dans `live` : la fusion des meubles (cf. compact) les aplatirait.
    crust: keepShared(new THREE.MeshBasicMaterial({ color: '#0b2615' })),
    liquid: keepShared(new THREE.MeshBasicMaterial({ color: '#23a35a' })),
  }
  causticTex ??= keepShared(drawnTexture(256, 256, (c) => {
    c.clearRect(0, 0, 256, 256)
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    for (let i = 0; i < 46; i++) {
      const x = rnd() * 256, y = rnd() * 256, r = 10 + rnd() * 26
      const grad = c.createRadialGradient(x, y, r * 0.55, x, y, r)
      grad.addColorStop(0, 'rgba(0, 0, 0, 0)')
      grad.addColorStop(0.8, 'rgba(180, 255, 210, 0.75)')
      grad.addColorStop(1, 'rgba(180, 255, 210, 0)')
      c.fillStyle = grad
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill()
    }
  }))
  mistTex ??= keepShared(drawnTexture(128, 128, (c) => {
    const grad = c.createRadialGradient(64, 64, 4, 64, 64, 64)
    grad.addColorStop(0, 'rgba(120, 255, 170, 0.9)')
    grad.addColorStop(1, 'rgba(120, 255, 170, 0)')
    c.fillStyle = grad
    c.fillRect(0, 0, 128, 128)
  }))
  const live = new THREE.Group()
  live.add(part(puddle(0.43, 0.2, random), poolMats.crust, 0, 0.012, 0), part(puddle(0.37, 0.22, random), poolMats.liquid, 0, 0.018, 0))
  const surface = part(puddle(0.32, 0.2, random), new THREE.MeshBasicMaterial({ map: causticTex, color: '#a8ffcc', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0.022, 0)
  const mistMat = new THREE.MeshBasicMaterial({ map: mistTex, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false })
  const mist = part(new THREE.PlaneGeometry(1, 1), mistMat, 0, 0.06, 0)
  mist.rotation.x = -Math.PI / 2
  const bubbleMat = glow('#b5ffd0')
  const bubbles = [0, 1].map(() => part(new THREE.SphereGeometry(0.022, 8, 6), bubbleMat, 0, 0, 0))
  live.add(surface, mist, ...bubbles)
  const phase = random() * 10
  const spots = Array.from({ length: 8 }, () => ({ x: (random() - 0.5) * 0.4, z: (random() - 0.5) * 0.4 }))
  return {
    live,
    update: (t) => {
      const k = t + phase
      surface.rotation.y = k * 0.12
      surface.scale.setScalar(1 + 0.04 * Math.sin(k * 1.3))
      mistMat.opacity = 0.14 + 0.08 * Math.sin(k * 0.8)
      bubbles.forEach((b, i) => {
        const cycle = k * 0.55 + i * 0.5
        const p = cycle % 1
        const spot = spots[Math.floor(cycle) % spots.length]
        b.position.set(spot.x, 0.024 + p * 0.03, spot.z)
        b.scale.setScalar(p < 0.85 ? 0.3 + p : (1 - p) * 7)
      })
    },
  }
}

/**
 * Spores du nid (`label` : « largeur,profondeur » de la zone, en tuiles) : des points verts qui
 * flottent, montent lentement et ondulent dans le noir.
 */
const causticMotes: Builder = ({ label, random }) => {
  const [w, d] = (label ?? '4,4').split(',').map(Number)
  const n = Math.round(w * d * 1.6)
  const base = new Float32Array(n * 3)
  const positions = new Float32Array(n * 3)
  const colors = new Float32Array(n * 3)
  const sizes = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    base[i * 3] = (random() - 0.5) * w
    base[i * 3 + 1] = random()
    base[i * 3 + 2] = (random() - 0.5) * d
    const c = new THREE.Color().setHSL(0.38 + random() * 0.05, 1, 0.55 + random() * 0.2)
    colors.set([c.r, c.g, c.b], i * 3)
    sizes[i] = 0.012 + random() * 0.018
  }
  positions.set(base)
  const points = pointCloud(positions, colors, sizes)
  const attr = points.geometry.getAttribute('position') as THREE.BufferAttribute
  return {
    live: points,
    update: (t) => {
      for (let i = 0; i < n; i++) {
        const y = (base[i * 3 + 1] + t * 0.03 * (0.5 + (i % 5) * 0.2)) % 1
        positions[i * 3] = base[i * 3] + Math.sin(t * 0.4 + i) * 0.08
        positions[i * 3 + 1] = 0.08 + y * 0.95
        positions[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.33 + i * 1.7) * 0.08
      }
      attr.needsUpdate = true
    },
  }
}

// ---------------------------------------------------------------- baie infestée

/**
 * Colis de la cargaison (conteneur de fret d'Elite, 0,34 de haut) : cylindre à facettes, bandes
 * orange et une lueur verte, contaminé. Construit à part (on le ramasse, on le porte).
 */
export function cargoCanister(scale = 1): THREE.Group {
  const g = new THREE.Group()
  const body = cylinder(0.12 * scale, 0.12 * scale, 0.3 * scale, lit(C.canister), 0, 0.17 * scale, 0, 8)
  g.add(body)
  for (const y of [0.07, 0.27]) g.add(cylinder(0.126 * scale, 0.126 * scale, 0.035 * scale, lit(C.band), 0, y * scale, 0, 8))
  g.add(cylinder(0.08 * scale, 0.08 * scale, 0.02 * scale, lit('#2b3038'), 0, 0.33 * scale, 0, 8))
  g.add(box(0.05 * scale, 0.1 * scale, 0.01 * scale, glow(C.caustic), 0, 0.17 * scale, 0.121 * scale))
  return g
}

/**
 * Plateforme d'extraction du sas (1,2 × 1,2) : un monte-charge cerclé de vert, ses bornes, et un
 * faisceau qui s'éveille quand un colis y est déposé (cf. src/salvage/).
 */
const extractionPad: Builder = () => {
  const g = new THREE.Group()
  const dark = lit(C.steelDark, 'metal')
  g.add(cylinder(0.55, 0.58, 0.05, dark, 0, 0.025, 0, 32))
  const grid = drawnTexture(256, 256, (c) => {
    c.fillStyle = '#1b2a22'
    c.fillRect(0, 0, 256, 256)
    c.strokeStyle = '#2f4a3b'
    c.lineWidth = 4
    for (let k = 16; k < 256; k += 32) {
      c.beginPath(); c.moveTo(k, 0); c.lineTo(k, 256); c.stroke()
      c.beginPath(); c.moveTo(0, k); c.lineTo(256, k); c.stroke()
    }
    causticMark(c, 128, 128, 60, '#3dd17a')
  })
  const top = mesh(new THREE.CircleGeometry(0.5, 32), new THREE.MeshLambertMaterial({ map: grid }), 0, 0.052, 0)
  top.rotation.x = -Math.PI / 2
  g.add(top)
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4
    g.add(box(0.08, 0.34, 0.08, lit(C.steel, 'metal'), Math.cos(a) * 0.58, 0.17, Math.sin(a) * 0.58, 0.01))
    g.add(box(0.084, 0.03, 0.084, glow(C.caustic), Math.cos(a) * 0.58, 0.3, Math.sin(a) * 0.58))
  }
  const live = new THREE.Group()
  const ring = part(new THREE.TorusGeometry(0.5, 0.018, 6, 40), glow(C.caustic), 0, 0.06, 0)
  ring.rotation.x = Math.PI / 2
  live.add(ring)
  const beam = part(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 24, 1, true), holoMaterial(null, C.caustic, 0.12, 1, true), 0, 0.6, 0)
  live.add(beam)
  return {
    solid: g,
    live,
    update: (t) => {
      ring.scale.setScalar(1 + Math.sin(t * 2) * 0.02)
      beam.scale.set(1, 0.9 + Math.sin(t * 1.3) * 0.1, 1)
    },
  }
}

/** Lampe de secours au mur (face à +z) : une grille, un tube rouge qui grésille. */
const emergencyLamp: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.22, 0.08, 0.06, lit(C.steelDark, 'metal'), 0, 0.86, 0, 0.01))
  g.add(box(0.18, 0.04, 0.04, glow('#ff4433'), 0, 0.86, 0.02))
  for (let k = 0; k < 3; k++) g.add(box(0.012, 0.07, 0.07, lit('#101215'), -0.06 + k * 0.06, 0.86, 0.02))
  return { solid: g }
}

/** Panneau « SORTIE / SAS D'EXTRACTION » au-dessus d'une porte du sas (face à +z). */
const exitSign: Builder = () => {
  const g = new THREE.Group()
  const face = drawnTexture(256, 96, (c) => {
    c.fillStyle = '#0c3b1f'
    c.fillRect(0, 0, 256, 96)
    c.fillStyle = C.caustic
    c.font = 'bold 34px sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(tr('▲ EXTRACTION', '▲ EXTRACTION'), 128, 48)
  })
  g.add(box(0.46, 0.18, 0.03, lit(C.steelDark, 'metal'), 0, 0.98, 0))
  g.add(mesh(new THREE.PlaneGeometry(0.42, 0.15), new THREE.MeshBasicMaterial({ map: face }), 0, 0.98, 0.016))
  return { solid: g }
}

/**
 * Guichet de sécurité de la baie (3 × 2 tuiles, centré, la vitre face à +z) : un comptoir à
 * bandes de chantier, une vitre blindée dans son cadre, l'hygiaphone, l'enseigne, et derrière,
 * la console du technicien et un gyrophare orange qui tourne. Les cloisons des trois autres
 * côtés sont celles du plan (cf. BAY_BOOTH dans shared/salvage.js).
 */
const securityBooth: Builder = () => {
  const g = new THREE.Group()
  const steel = lit(C.steel, 'metal'), dark = lit(C.steelDark, 'metal')
  const W = 3, front = 1
  // Comptoir, côté baie : on s'y accoude pour parler au technicien.
  g.add(box(W - 0.1, 0.4, 0.26, steel, 0, 0.2, front + 0.08, 0.01))
  g.add(box(W - 0.1, 0.03, 0.3, dark, 0, 0.415, front + 0.07))
  const stripes = hazardTexture(512, 32, 16)
  g.add(mesh(new THREE.PlaneGeometry(W - 0.12, 0.06), new THREE.MeshLambertMaterial({ map: stripes }), 0, 0.33, front + 0.212))
  // La vitre, ses montants et la traverse haute.
  const pane = mesh(new THREE.PlaneGeometry(W - 0.12, 0.6), glass('#9fd8ff', 0.16), 0, 0.73, front)
  g.add(pane)
  for (const x of [-1.47, -0.5, 0.5, 1.47]) g.add(box(0.05, 0.62, 0.06, dark, x, 0.73, front))
  g.add(box(W, 0.08, 0.1, dark, 0, 1.04, front))
  // L'hygiaphone : une grille ronde au milieu de la vitre, et la fente sous la vitre.
  g.add(cylinder(0.07, 0.07, 0.012, lit('#5a616b'), 0, 0.62, front + 0.004, 16).rotateX(Math.PI / 2))
  for (let k = -2; k <= 2; k++) g.add(box(0.1, 0.006, 0.014, dark, 0, 0.62 + k * 0.022, front + 0.012))
  g.add(box(0.5, 0.03, 0.2, lit('#101215'), 0, 0.44, front + 0.02))
  // L'enseigne, au-dessus de la vitre.
  const sign = drawnTexture(512, 64, (c) => {
    c.fillStyle = '#1a1406'
    c.fillRect(0, 0, 512, 64)
    c.fillStyle = C.hazard
    c.font = 'bold 34px sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(tr('GUICHET · SÉCURITÉ', 'SECURITY · DESK'), 256, 34)
  })
  g.add(mesh(new THREE.PlaneGeometry(1.2, 0.15), new THREE.MeshLambertMaterial({ map: sign, emissive: '#ffffff', emissiveMap: sign, emissiveIntensity: 0.6 }), 0, 1.04, front + 0.052))
  // Derrière la vitre : la console et ses écrans, des classeurs, un fauteuil.
  g.add(box(W - 0.2, 0.36, 0.3, dark, 0, 0.18, front - 0.2))
  for (const x of [-0.9, 0.9]) {
    g.add(box(0.32, 0.22, 0.03, lit('#15181c'), x, 0.5, front - 0.28))
    g.add(box(0.28, 0.18, 0.005, glow(x < 0 ? '#3dd17a' : '#ff5a36'), x, 0.5, front - 0.262))
  }
  g.add(box(0.26, 0.16, 0.2, lit('#6d4a1e'), -1.25, 0.44, -0.8))
  g.add(box(0.5, 0.7, 0.3, steel, 1.2, 0.35, -0.82))
  // Gyrophare au plafond du guichet.
  const live = new THREE.Group()
  live.add(cylinder(0.06, 0.07, 0.05, dark, 1.3, 0.99, -0.8, 12))
  const beacon = new THREE.Group()
  beacon.position.set(1.3, 1.04, -0.8)
  beacon.add(cylinder(0.05, 0.05, 0.07, glow('#ff8a1c'), 0, 0, 0, 12))
  const beam = part(new THREE.ConeGeometry(0.22, 0.6, 12, 1, true).rotateZ(Math.PI / 2).translate(0.3, 0, 0), holoMaterial(null, '#ff8a1c', 0.18, 1, true), 0, 0, 0)
  beacon.add(beam)
  live.add(beacon)
  return {
    solid: g,
    live,
    update: (t) => {
      beacon.rotation.y = t * 3.2
    },
  }
}

/**
 * Projecteur de chantier sur pied (face à +z) : une platine lestée, un mât, une tête inclinée vers
 * le sol, sa vitre qui brille et le cône de lumière dans la poussière. `label` : la couleur de la
 * lumière (les zones éclairées de la baie, cf. BAY_LIT).
 */
const floodlight: Builder = ({ label }) => {
  const color = label && /^#[0-9a-f]{6}$/i.test(label) ? label : '#fff0d6'
  const g = new THREE.Group()
  const dark = lit(C.steelDark, 'metal'), steel = lit(C.steel, 'metal')
  g.add(box(0.36, 0.05, 0.36, dark, 0, 0.025, -0.06, 0.01))
  for (const s of [-1, 1]) g.add(box(0.06, 0.04, 0.06, glow(C.hazard), s * 0.13, 0.06, 0.06))
  g.add(cylinder(0.03, 0.035, 1.24, steel, 0, 0.66, -0.06, 8))
  const head = new THREE.Group()
  head.position.set(0, 1.28, -0.02)
  head.rotation.x = 0.8
  head.add(box(0.46, 0.28, 0.14, dark, 0, 0, 0, 0.02))
  for (let k = -3; k <= 3; k++) head.add(box(0.012, 0.24, 0.06, lit('#101215'), k * 0.06, 0, -0.09))
  head.add(part(new THREE.PlaneGeometry(0.4, 0.22), glow(color), 0, 0, 0.071))
  head.add(box(0.48, 0.03, 0.18, dark, 0, 0.15, 0.02))
  g.add(head)
  g.add(box(0.26, 0.04, 0.04, steel, 0, 1.28, -0.07))
  // Le cône de lumière dans la poussière : vif à la lampe, qui s'éteint au sol.
  const live = new THREE.Group()
  const beam = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) } },
    vertexShader: 'varying float vK; void main() { vK = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uColor; varying float vK; void main() { float a = pow(vK, 1.4) * 0.26; gl_FragColor = vec4(uColor * a, a); }',
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  })
  const cone = part(new THREE.ConeGeometry(0.85, 1.55, 24, 1, true), beam, 0, 0, 0)
  cone.position.set(0, 0.66, 0.74)
  cone.rotation.x = -0.8
  live.add(cone)
  return { solid: g, live }
}

/**
 * Marquage d'une aire de chargement peint au sol (`label` : « largeur,profondeur », 2,4 × 1,4 par
 * défaut) : un cadre jaune, des hachures aux coins.
 */
const dockMarking: Builder = ({ label }) => {
  const [w, d] = (label ?? '2.4,1.4').split(',').map(Number)
  const px = 96
  const texture = drawnTexture(Math.round(w * px), Math.round(d * px), (c) => {
    const W = c.canvas.width, H = c.canvas.height
    c.clearRect(0, 0, W, H)
    c.strokeStyle = 'rgba(233, 169, 23, 0.85)'
    c.lineWidth = 10
    c.strokeRect(8, 8, W - 16, H - 16)
    c.fillStyle = 'rgba(233, 169, 23, 0.7)'
    for (const [cx, cy] of [[0, 0], [W, 0], [0, H], [W, H]]) {
      for (let k = 0; k < 4; k++) {
        c.beginPath()
        const o = 18 + k * 16
        c.moveTo(cx === 0 ? o : W - o, cy === 0 ? 8 : H - 8)
        c.lineTo(cx === 0 ? o + 8 : W - o - 8, cy === 0 ? 8 : H - 8)
        c.lineTo(cx === 0 ? 8 : W - 8, cy === 0 ? o + 8 : H - o - 8)
        c.lineTo(cx === 0 ? 8 : W - 8, cy === 0 ? o : H - o)
        c.closePath()
        c.fill()
      }
    }
  })
  return { live: decal(texture, w, d, 0.005) }
}

/**
 * Flèche peinte au sol (0,8 × 0,8, vers +z) : « EXTRACTION », pour retrouver le sas dans le noir.
 */
const floorArrow: Builder = () => {
  const texture = drawnTexture(256, 256, (c) => {
    c.clearRect(0, 0, 256, 256)
    c.fillStyle = 'rgba(233, 169, 23, 0.85)'
    c.beginPath()
    c.moveTo(128, 236)
    c.lineTo(222, 130)
    c.lineTo(162, 130)
    c.lineTo(162, 60)
    c.lineTo(94, 60)
    c.lineTo(94, 130)
    c.lineTo(34, 130)
    c.closePath()
    c.fill()
    c.font = 'bold 30px sans-serif'
    c.textAlign = 'center'
    c.fillText(tr('EXTRACTION', 'EXTRACTION'), 128, 40)
  })
  // Le texte se lit en venant du nord : la flèche pointe vers +z, le haut du dessin vers -z.
  const d = decal(texture, 0.8, 0.8)
  d.rotation.z = Math.PI
  return { live: d }
}

export const SALVAGE = {
  floodlight,
  'thargoid-spire': thargoidSpire,
  'caustic-pool': causticPool,
  'caustic-motes': causticMotes,
  'security-desk': securityDesk,
  'decon-arch': deconArch,
  intercom,
  'bay-holo': bayHolo,
  'dock-marking': dockMarking,
  'floor-arrow': floorArrow,
  'security-booth': securityBooth,
  'salvage-terminal': terminal,
  'surveillance-wall': surveillance,
  'blast-door': blastDoor,
  'salvage-board': salvageBoard,
  'locker-row': lockerRow,
  'flare-crate': flareCrate,
  'bio-sign': bioSign,
  'drop-zone': dropZone,
  'extraction-pad': extractionPad,
  'emergency-lamp': emergencyLamp,
  'exit-sign': exitSign,
} satisfies Record<string, Builder>
