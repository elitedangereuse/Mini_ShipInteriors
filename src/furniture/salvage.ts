import * as THREE from 'three'
import { animatedScreen, barX, box, cylinder, decal, drawnTexture, glass, glow, hazardTexture, holoMaterial, lit, mesh, part, sphere, type Builder } from './kit'
import { tr } from '../i18n'

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
  const dark = lit(C.steelDark), steel = lit(C.steel), accent = glow(C.hazard)
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
  const dark = lit(C.steelDark), steel = lit(C.steel)
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
  const dark = lit(C.steelDark), steel = lit('#4b5059')
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
  g.add(box(1.04, 0.66, 0.05, lit(C.steelDark), 0, 0.72, 0, 0.01))
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
  g.add(box(0.6, 0.4, 0.02, lit(C.steelDark), 0, 0.75, 0))
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
  const dark = lit(C.steelDark)
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
    g.add(box(0.08, 0.34, 0.08, lit(C.steel), Math.cos(a) * 0.58, 0.17, Math.sin(a) * 0.58, 0.01))
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
  g.add(box(0.22, 0.08, 0.06, lit(C.steelDark), 0, 0.86, 0, 0.01))
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
  g.add(box(0.46, 0.18, 0.03, lit(C.steelDark), 0, 0.98, 0))
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
  const steel = lit(C.steel), dark = lit(C.steelDark)
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

export const SALVAGE = {
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
