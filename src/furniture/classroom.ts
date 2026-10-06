import * as THREE from 'three'
import { tr } from '../i18n'
import { barX, box, cylinder, decal, drawnTexture, ED_ORANGE, holoMaterial, keepShared, lit, mesh, part, sphere, type Builder } from './kit'

/*
 * La salle de classe du pont supérieur, façon lycée japonais : le parquet et son estrade, le soleil
 * qui tombe des fenêtres, les rideaux, le tableau vert et ses craies, le haut-parleur de
 * l'établissement, le pupitre de la professeure, les tables d'élève à piètement d'acier et leurs
 * cartables, l'armoire à balais, le panneau d'affichage, le globe de la galaxie. La professeure et les élèves sont des personnages du Holo-Me, posés sur leurs
 * emplacements par src/classroom.ts ; le quiz se joue dans src/quiz/.
 * Un objet accroché est construit dos au mur (origine sur la face du mur, contenu vers +z).
 */

const C = {
  wood: '#c79a62',
  woodDark: '#8a5f35',
  steel: '#9aa1ab',
  steelDark: '#4a505a',
  board: '#1f4d3c',
  chalk: '#f4f1e6',
  red: '#d5202a',
  paper: '#f2efe4',
  ink: '#17181b',
}

/** Place d'un élève sur sa chaise (repère de la table, cf. SEATS) : la hauteur de l'assise, et son recul. */
export const DESK_SEAT = { y: 0.25, z: -0.16 }

// ---------------------------------------------------------------- tableau

const BOARD_W = 1024, BOARD_H = 300

/** Ce que la professeure a écrit à la craie : le titre du cours, un croquis de station, et des restes d'anciens cours. */
function paintBoard(g: CanvasRenderingContext2D) {
  const W = BOARD_W, H = BOARD_H
  g.fillStyle = C.board
  g.fillRect(0, 0, W, H)
  // Traces d'éponge.
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(255,255,255,${0.012 + (i % 5) * 0.006})`
    g.beginPath()
    g.ellipse(((i * 197) % W), ((i * 83) % H), 90 + (i % 4) * 40, 26 + (i % 3) * 14, (i % 7) * 0.4, 0, Math.PI * 2)
    g.fill()
  }
  g.strokeStyle = g.fillStyle = C.chalk
  g.lineCap = g.lineJoin = 'round'
  g.textBaseline = 'middle'
  // Le titre, souligné deux fois.
  g.font = 'italic 900 58px "Arial Black", Arial, sans-serif'
  g.textAlign = 'left'
  g.fillText(tr('LEÇON DU JOUR', 'TODAY\'S LESSON'), 40, 62)
  g.lineWidth = 5
  for (const y of [102, 114]) {
    g.beginPath()
    g.moveTo(38, y)
    g.lineTo(y === 102 ? 560 : 430, y + 3)
    g.stroke()
  }
  g.font = '600 30px "Comic Sans MS", "Segoe Print", cursive'
  g.fillText(tr('1. La Bulle   2. Les Thargoïdes', '1. The Bubble   2. The Thargoids'), 44, 160)
  g.fillText(tr('3. Ne JAMAIS aller à Hutton Orbital', '3. NEVER fly to Hutton Orbital'), 44, 204)
  g.fillStyle = '#ffd866'
  g.fillText(tr('Interro surprise : aujourd\'hui !', 'Pop quiz: today!'), 44, 256)
  // Le croquis : une station Coriolis, sa fente, et la flèche du sens de rotation.
  g.strokeStyle = g.fillStyle = C.chalk
  g.lineWidth = 4
  const cx = 760, cy = 136, r = 92
  g.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6
    g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r)
  }
  g.closePath()
  g.stroke()
  g.beginPath()
  g.rect(cx - r * 0.5, cy - r * 0.5, r, r)
  g.stroke()
  g.fillRect(cx - 26, cy - 7, 52, 14)
  g.beginPath()
  g.arc(cx, cy, r + 22, -0.5, 0.9)
  g.stroke()
  g.beginPath()
  g.moveTo(cx + 78, cy + 96)
  g.lineTo(cx + 62, cy + 76)
  g.lineTo(cx + 92, cy + 78)
  g.closePath()
  g.fill()
  g.font = '600 24px "Comic Sans MS", "Segoe Print", cursive'
  g.textAlign = 'center'
  g.fillText(tr('← la fente !', '← mail slot!'), cx + 168, cy - 8)
  g.font = 'italic 900 44px "Arial Black", Arial, sans-serif'
  g.fillStyle = '#ff9d8a'
  g.fillText('o7', 968, 258)
}

let boardMaterial: THREE.Material | undefined

/** Tableau vert, encadré de bois, avec sa gouttière : craies blanches et de couleur, brosse. */
const classBoard: Builder = () => {
  boardMaterial ??= keepShared(new THREE.MeshLambertMaterial({ map: keepShared(drawnTexture(BOARD_W, BOARD_H, paintBoard)) }))
  const g = new THREE.Group()
  const wood = lit(C.woodDark, 'wood')
  g.add(box(2.12, 0.68, 0.03, wood, 0, 0.68, 0.015, 0.008))
  g.add(mesh(new THREE.PlaneGeometry(2.04, 0.6), boardMaterial, 0, 0.68, 0.0315))
  g.add(box(2.12, 0.02, 0.07, wood, 0, 0.345, 0.045, 0.005))
  for (const [x, color] of [[-0.6, C.chalk], [-0.52, '#ffd866'], [0.3, C.chalk], [0.37, '#ff9d8a']] as const) {
    g.add(barX(0.008, 0.06, lit(color), x, 0.363, 0.05, 6))
  }
  g.add(box(0.13, 0.03, 0.045, lit('#3b4454', 'cloth'), 0.72, 0.37, 0.047, 0.006), box(0.13, 0.012, 0.045, wood, 0.72, 0.39, 0.047))
  return { solid: g }
}

// ---------------------------------------------------------------- sol, rideaux, murs

/**
 * Le parquet de la salle (`label` : largeur × profondeur) : lames de bois clair posées en long,
 * l'estrade plus sombre devant le tableau (à l'ouest, bord gauche), et le soleil de l'après-midi
 * qui tombe des fenêtres du mur nord (bord haut), en biais, coupé par leurs croisées.
 */
const classFloor: Builder = ({ label = '4.7x2.7', random }) => {
  const [w, d] = label.split('x').map(Number)
  const W = Math.round(w * 100), H = Math.round(d * 100)
  const floor = decal(drawnTexture(W, H, (c) => {
    const tones = ['#c99b63', '#c4955c', '#cfa26b', '#bd8e56', '#c79860']
    const plank = 14
    for (let row = 0; row * plank < H; row++) {
      let x = -Math.floor(random() * 90)
      while (x < W) {
        const len = 90 + Math.floor(random() * 70)
        c.fillStyle = tones[Math.floor(random() * tones.length)]
        c.fillRect(x, row * plank, len, plank)
        c.fillStyle = 'rgba(60,35,15,0.28)'
        c.fillRect(x + len - 1, row * plank, 1, plank)
        x += len
      }
      c.fillStyle = 'rgba(60,35,15,0.22)'
      c.fillRect(0, row * plank + plank - 1, W, 1)
    }
    // L'estrade : un mètre de bois foncé devant le tableau, et son nez de marche.
    const stage = Math.round(W * 0.215)
    c.fillStyle = 'rgba(92,56,26,0.5)'
    c.fillRect(0, 0, stage, H)
    c.fillStyle = 'rgba(40,22,8,0.55)'
    c.fillRect(stage, 0, 3, H)
    c.fillStyle = 'rgba(255,236,200,0.5)'
    c.fillRect(stage - 2, 0, 2, H)
    // Le soleil : une tache par fenêtre (une par tuile), couchée vers le sud-ouest.
    const tile = W / Math.round(w + 0.3)
    for (let x = tile / 2 - 15; x < W; x += tile) {
      for (const [from, to] of [[0, 0.46], [0.54, 1]]) {
        const a = x - 30 + from * 60, b = x - 30 + to * 60, slant = 70, len = Math.min(H * 0.62, 170)
        const light = c.createLinearGradient(0, 4, 0, len)
        light.addColorStop(0, 'rgba(255,240,190,0.5)')
        light.addColorStop(1, 'rgba(255,226,160,0.16)')
        c.fillStyle = light
        c.beginPath()
        c.moveTo(a, 4)
        c.lineTo(b, 4)
        c.lineTo(b - slant, len)
        c.lineTo(a - slant, len)
        c.closePath()
        c.fill()
      }
    }
  }), w, d, 0.012)
  const material = floor.material as THREE.MeshLambertMaterial
  material.polygonOffset = false
  material.transparent = false
  const g = new THREE.Group()
  g.add(floor)
  return { solid: g }
}

/** Rideau crème, retenu par une embrasse rouge, sous un mètre de tringle : un par trumeau, entre deux fenêtres. */
const classCurtain: Builder = () => {
  const g = new THREE.Group()
  const cloth = lit('#f1e6cf', 'cloth'), shade = lit('#dccfb2', 'cloth')
  g.add(barX(0.008, 1, lit(C.steelDark, 'metal'), 0, 1.03, 0.05, 6))
  for (const [x, m] of [[-0.05, cloth], [0, shade], [0.05, cloth]] as const) g.add(box(0.055, 0.44, 0.04, m, x, 0.8, 0.05, 0.016))
  g.add(box(0.11, 0.03, 0.05, lit(C.red, 'cloth'), 0, 0.565, 0.05, 0.008))
  for (const [x, m] of [[-0.035, shade], [0.035, cloth]] as const) g.add(box(0.06, 0.25, 0.036, m, x, 0.425, 0.05, 0.014))
  return { solid: g }
}

/** Haut-parleur de l'établissement, en haut du mur : la sonnerie, et les annonces de la passerelle. */
const classSpeaker: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.26, 0.17, 0.07, lit('#e9e4d6'), 0, 1.22, 0.035, 0.012), box(0.2, 0.11, 0.01, lit(C.steelDark), 0, 1.22, 0.073))
  for (let i = 0; i < 4; i++) g.add(box(0.18, 0.008, 0.004, lit(C.steel, 'metal'), 0, 1.185 + i * 0.024, 0.08))
  return { solid: g }
}

/** Panneau d'affichage en liège : l'emploi du temps, des avis punaisés, une affiche rouge. */
const classNotice: Builder = ({ random }) => {
  const g = new THREE.Group()
  g.add(box(0.96, 0.52, 0.02, lit(C.woodDark, 'wood'), 0, 0.7, 0.01, 0.006), box(0.9, 0.46, 0.006, lit('#b98a55'), 0, 0.7, 0.022))
  // L'emploi du temps : une grille, à gauche.
  g.add(box(0.3, 0.36, 0.004, lit(C.paper), -0.27, 0.7, 0.027))
  for (let i = 1; i < 5; i++) g.add(box(0.28, 0.004, 0.002, lit(C.steelDark), -0.27, 0.54 + i * 0.07, 0.03))
  for (let i = 1; i < 4; i++) g.add(box(0.004, 0.34, 0.002, lit(C.steelDark), -0.42 + i * 0.075, 0.7, 0.03))
  g.add(box(0.2, 0.28, 0.004, lit(C.red), 0.02, 0.72, 0.027), box(0.14, 0.03, 0.002, lit(C.paper), 0.02, 0.8, 0.03), box(0.1, 0.1, 0.002, lit(C.ink), 0.02, 0.69, 0.03))
  for (const [x, y, color] of [[0.24, 0.8, '#ffe58a'], [0.36, 0.76, C.paper], [0.26, 0.6, '#bfe3ff'], [0.37, 0.59, '#ffd0c4']] as const) {
    const note = box(0.1, 0.12, 0.004, lit(color), x, y, 0.027)
    note.rotation.z = (random() - 0.5) * 0.3
    g.add(note, sphere(0.008, lit(C.red), x, y + 0.05, 0.031, 6))
  }
  return { solid: g }
}

/** Armoire à balais, en tôle grise : ses ouïes, sa poignée, et le seau qui n'y rentre jamais. */
const classLocker: Builder = () => {
  const g = new THREE.Group()
  const steel = lit('#8f98a3', 'metal'), dark = lit(C.steelDark, 'metal')
  g.add(box(0.36, 0.9, 0.3, steel, 0, 0.45, 0, 0.008), box(0.002, 0.84, 0.004, dark, 0, 0.45, 0.151))
  for (const x of [-0.09, 0.09]) {
    for (let i = 0; i < 3; i++) g.add(box(0.1, 0.008, 0.004, dark, x, 0.74 + i * 0.03, 0.151))
    g.add(box(0.012, 0.07, 0.014, lit('#d6dae0', 'metal'), x * 0.35, 0.46, 0.156))
  }
  g.add(cylinder(0.07, 0.055, 0.11, lit('#3f7fb5'), 0.27, 0.055, 0.05, 12), cylinder(0.006, 0.006, 0.62, lit(C.wood, 'wood'), 0.27, 0.36, 0.03, 6))
  return { solid: g }
}

// ---------------------------------------------------------------- pupitre

/** Pupitre de la professeure, sur une petite estrade : le cahier d'appel, une boîte de craies, une pomme. */
const classPodium: Builder = () => {
  const g = new THREE.Group()
  const wood = lit(C.wood, 'wood'), dark = lit(C.woodDark, 'wood')
  g.add(box(0.86, 0.035, 0.5, dark, 0, 0.0175, 0, 0.006))
  g.add(box(0.66, 0.36, 0.03, wood, 0, 0.215, 0.14), box(0.03, 0.36, 0.3, wood, -0.315, 0.215, 0), box(0.03, 0.36, 0.3, wood, 0.315, 0.215, 0))
  g.add(box(0.6, 0.02, 0.26, dark, 0, 0.22, -0.01))
  g.add(box(0.72, 0.03, 0.36, dark, 0, 0.41, 0, 0.008))
  // Le liseré rouge de la façade, côté élèves.
  g.add(box(0.66, 0.03, 0.006, lit(C.red), 0, 0.33, 0.158))
  g.add(box(0.2, 0.012, 0.15, lit('#23262d'), -0.14, 0.431, -0.02), box(0.18, 0.004, 0.13, lit(C.paper), -0.14, 0.439, -0.02))
  g.add(box(0.09, 0.03, 0.06, lit(C.paper), 0.14, 0.44, -0.06, 0.004))
  g.add(sphere(0.026, lit(C.red), 0.22, 0.45, 0.07, 10), cylinder(0.003, 0.003, 0.02, lit('#3d2a18'), 0.22, 0.478, 0.07, 5))
  return { solid: g }
}

// ---------------------------------------------------------------- table d'élève

/**
 * Table d'élève et sa chaise, d'un seul tenant : plateau de bois clair, piètement de tube d'acier,
 * casier sous le plateau. L'élève regarde vers +z (le tableau) ; la chaise est derrière, côté -z.
 * Sur le plateau, au hasard : un cahier, une tablette, un crayon, ou rien.
 */
const classDesk: Builder = ({ random }) => {
  const g = new THREE.Group()
  const wood = lit(C.wood, 'wood'), steel = lit(C.steel, 'metal')
  // La table.
  g.add(box(0.44, 0.025, 0.3, wood, 0, 0.3725, 0.12, 0.006), box(0.4, 0.012, 0.24, lit(C.steelDark, 'metal'), 0, 0.3, 0.12))
  for (const x of [-0.2, 0.2]) {
    g.add(cylinder(0.011, 0.011, 0.36, steel, x, 0.18, 0.24, 6), cylinder(0.011, 0.011, 0.36, steel, x, 0.18, 0, 6))
    g.add(box(0.02, 0.012, 0.3, steel, x, 0.01, 0.12))
  }
  // La chaise.
  g.add(box(0.3, 0.02, 0.26, wood, 0, DESK_SEAT.y - 0.01, DESK_SEAT.z - 0.02, 0.006))
  for (const x of [-0.14, 0.14]) {
    g.add(cylinder(0.01, 0.01, 0.24, steel, x, 0.12, -0.07, 6), cylinder(0.01, 0.01, 0.5, steel, x, 0.25, -0.31, 6))
  }
  g.add(box(0.3, 0.1, 0.018, wood, 0, 0.44, -0.31, 0.006))
  // Une fois sur deux, un cartable pend à son crochet, sur le côté de la table.
  if (random() < 0.5) {
    const bag = lit(['#2f3b58', '#5a2d2d', '#2f4a3a'][Math.floor(random() * 3)], 'cloth')
    g.add(box(0.04, 0.15, 0.2, bag, 0.245, 0.22, 0.12, 0.012), box(0.012, 0.07, 0.02, lit(C.steelDark, 'metal'), 0.228, 0.32, 0.12), box(0.045, 0.05, 0.1, lit('#c9a24a', 'metal'), 0.25, 0.2, 0.12, 0.006))
  }
  const pick = random()
  if (pick < 0.3) g.add(box(0.14, 0.008, 0.19, lit(C.paper), -0.06, 0.389, 0.12), box(0.012, 0.01, 0.12, lit(ED_ORANGE), 0.09, 0.39, 0.12))
  else if (pick < 0.55) g.add(box(0.2, 0.008, 0.14, lit('#23262d'), 0.02, 0.389, 0.13, 0.003), box(0.18, 0.002, 0.12, lit('#5aa9d6'), 0.02, 0.394, 0.13))
  else if (pick < 0.75) g.add(box(0.15, 0.022, 0.2, lit(C.red), 0.05, 0.396, 0.12, 0.004), box(0.14, 0.004, 0.19, lit(C.paper), 0.05, 0.409, 0.12))
  return { solid: g }
}

// ---------------------------------------------------------------- globe

/** Globe de la galaxie sur son pied : les bras spiraux en hologramme, qui tournent lentement. */
const classGlobe: Builder = () => {
  const g = new THREE.Group()
  const brass = lit('#c9a24a', 'metal')
  g.add(cylinder(0.11, 0.13, 0.02, lit(C.woodDark, 'wood'), 0, 0.01, 0, 18), cylinder(0.012, 0.016, 0.42, brass, 0, 0.23, 0, 8))
  const ring = mesh(new THREE.TorusGeometry(0.15, 0.007, 6, 28, Math.PI * 1.2), brass, 0, 0.6, 0)
  ring.rotation.z = -Math.PI * 0.6 - 0.4
  g.add(ring)
  const texture = drawnTexture(256, 128, (c) => {
    c.clearRect(0, 0, 256, 128)
    // Deux bras spiraux, déroulés sur la sphère, et le bulbe au milieu.
    for (let i = 0; i < 900; i++) {
      const arm = i % 2, t = (i / 900) * 5
      const u = ((t * 34 + arm * 128 + Math.sin(i * 12.9898) * 9) % 256 + 256) % 256
      const v = 64 + Math.sin(t * 1.3 + arm * Math.PI) * 30 + Math.sin(i * 78.233) * 8
      c.fillStyle = i % 9 ? 'rgba(255,255,255,0.75)' : 'rgba(255,190,120,0.95)'
      c.fillRect(u, v, i % 13 ? 1.5 : 3, i % 13 ? 1.5 : 3)
    }
    const glowAt = c.createRadialGradient(128, 64, 2, 128, 64, 40)
    glowAt.addColorStop(0, 'rgba(255,240,210,0.95)')
    glowAt.addColorStop(1, 'rgba(255,240,210,0)')
    c.fillStyle = glowAt
    c.fillRect(88, 24, 80, 80)
  })
  const live = new THREE.Group()
  const globe = part(new THREE.SphereGeometry(0.13, 24, 14), holoMaterial(texture, '#8fd0ff', 0.95), 0, 0.6, 0)
  globe.rotation.z = 0.4
  live.add(globe)
  return {
    solid: g,
    live,
    update(t) { globe.rotation.y = t * 0.25 },
  }
}

// ---------------------------------------------------------------- personnages

/**
 * Emplacement d'un personnage de la classe : son volume de clic et de collision. Le personnage
 * lui-même est un Mini Character du Holo-Me, posé dessus par src/classroom.ts (`label` : son
 * apparence). Debout, son ombre au sol ; assis, le coussin de sa chaise.
 */
const spot = (radius: number, height: number, cushion: boolean): Builder => () => {
  const g = new THREE.Group()
  g.add(cushion ? cylinder(radius, radius, 0.012, lit(C.red, 'cloth'), 0, 0.006, 0, 14) : cylinder(radius, radius, 0.004, lit('#101014'), 0, 0.002, 0, 14))
  return { solid: g, extent: new THREE.Box3(new THREE.Vector3(-radius, 0, -radius), new THREE.Vector3(radius, height, radius)) }
}

export const CLASSROOM = {
  'class-floor': classFloor,
  'class-curtain': classCurtain,
  'class-speaker': classSpeaker,
  'class-notice': classNotice,
  'class-locker': classLocker,
  'class-board': classBoard,
  'class-podium': classPodium,
  'class-desk': classDesk,
  'class-globe': classGlobe,
  'class-teacher': spot(0.14, 0.78, false),
  'class-student': spot(0.12, 0.5, true),
} satisfies Record<string, Builder>
