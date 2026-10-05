import * as THREE from 'three'
import { animatedScreen, barX, box, cylinder, drawnTexture, glass, glow, lit, mesh, part, sphere, type Builder } from './kit'
import { tr } from '../i18n'

/*
 * L'infirmerie agrandie (pont principal) : le domaine de Betty. Rideaux de box entre les lits,
 * pieds à perfusion, poste de soins, réfrigérateur à vaccins, négatoscope, échelle d'acuité
 * visuelle, toise, fauteuil roulant, défibrillateur et lavabo chirurgical. Les lits, le scanner
 * corporel et l'armoire à pharmacie sont dans leisure.ts.
 */

const C = {
  white: '#e8edf1',
  whiteDark: '#aeb8c2',
  teal: '#3fa89c',
  tealLight: '#cfe9e6',
  medGreen: '#39d98a',
  red: '#e0263a',
  pink: '#ff8fb8',
  chrome: '#b9c1cc',
  rubber: '#23262c',
  screen: '#04110c',
}

/** Croix rouge sur fond clair (plaque), face à +z. */
function cross(size: number, m: THREE.Material, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group()
  g.add(box(size, size / 3, 0.008, m, x, y, z), box(size / 3, size, 0.008, m, x, y, z))
  return g
}

// ---------------------------------------------------------------- box des lits

/**
 * Rideau de box : rail au plafond sur toute la longueur d'un lit (le long de z), et le rideau
 * tiré contre le mur, en plis. On passe dessous : il ne bloque rien (solid: false dans levels.ts).
 */
const medCurtain: Builder = () => {
  const g = new THREE.Group()
  const rail = lit(C.chrome, 'metal')
  g.add(box(0.025, 0.02, 1.25, rail, 0, 0.95, 0.27), box(0.02, 0.1, 0.02, rail, 0, 0.99, -0.33), box(0.02, 0.1, 0.02, rail, 0, 0.99, 0.88))
  // Plis du rideau, repoussé vers le mur (-z).
  const fabric = [lit('#bfe4df'), lit('#a9d8d1')]
  for (let i = 0; i < 5; i++) {
    const fold = box(0.05, 0.72, 0.06, fabric[i % 2], (i % 2 ? 1 : -1) * 0.012, 0.57, -0.3 + i * 0.055, 0.015)
    g.add(fold)
  }
  g.add(box(0.07, 0.015, 0.3, lit(C.teal), 0, 0.215, -0.19))
  return { solid: g }
}

/** Pied à perfusion : poche de soluté, tubulure, pompe à l'écran vert. */
const ivStand: Builder = () => {
  const g = new THREE.Group()
  const chrome = lit(C.chrome, 'metal')
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const leg = box(0.12, 0.012, 0.018, lit(C.whiteDark), Math.cos(a) * 0.05, 0.012, Math.sin(a) * 0.05)
    leg.rotation.y = -a
    g.add(leg)
  }
  g.add(cylinder(0.008, 0.008, 0.86, chrome, 0, 0.44, 0, 6), barX(0.006, 0.16, chrome, 0, 0.86, 0, 6))
  // Pompe.
  g.add(box(0.08, 0.1, 0.05, lit(C.white), 0, 0.5, 0.03, 0.01), box(0.05, 0.03, 0.004, glow('#39ff8a'), 0, 0.52, 0.057))
  // Tubulure qui descend vers le lit.
  const tube = cylinder(0.003, 0.003, 0.3, glass('#dff6ff', 0.6), 0.05, 0.66, 0.02, 4)
  g.add(tube)
  const live = new THREE.Group()
  live.add(part(new RoundedBag(), glass('#cdeeff', 0.55), 0.06, 0.78, 0), part(new THREE.BoxGeometry(0.05, 0.05, 0.02), glass('#8fd6ff', 0.7), 0.06, 0.76, 0))
  return { solid: g, live }
}

/** Poche de perfusion : un coussin aplati. */
class RoundedBag extends THREE.SphereGeometry {
  constructor() {
    super(0.04, 10, 8)
    this.scale(1, 1.5, 0.45)
  }
}

// ---------------------------------------------------------------- poste de soins

/**
 * Poste de soins de Betty, un comptoir face à la salle (+z) : écran des constantes des lits,
 * dossier sur presse-papiers, bocal de sucettes, vase de roses, sonnette, tasse marquée de
 * rouge à lèvres, et la plaquette « NURSE BETTY ».
 */
const nurseStation: Builder = () => {
  const g = new THREE.Group()
  const white = lit(C.white)
  // Comptoir : caisson, plateau, bandeau teal et croix lumineuse en façade (+z).
  g.add(box(1.1, 0.42, 0.44, white, 0, 0.21, 0, 0.02), box(1.16, 0.03, 0.5, lit(C.whiteDark), 0, 0.435, 0, 0.01))
  g.add(box(1.1, 0.05, 0.01, lit(C.teal), 0, 0.33, 0.222))
  g.add(cross(0.12, glow(C.red), -0.36, 0.21, 0.225))
  // Plaquette nominative.
  const plate = drawnTexture(256, 64, (c) => {
    c.fillStyle = '#fff4f7'
    c.fillRect(0, 0, 256, 64)
    c.strokeStyle = '#e0263a'
    c.lineWidth = 6
    c.strokeRect(3, 3, 250, 58)
    c.fillStyle = '#b3122a'
    c.font = 'bold 34px Georgia, serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText('NURSE BETTY', 128, 34)
  })
  g.add(part(new THREE.PlaneGeometry(0.34, 0.085), new THREE.MeshLambertMaterial({ map: plate }), 0.2, 0.21, 0.226))

  // Écran des constantes (tourné vers l'infirmière, -z), sur pied.
  g.add(box(0.03, 0.12, 0.03, lit(C.rubber), -0.28, 0.51, -0.08), box(0.34, 0.22, 0.03, lit(C.rubber), -0.28, 0.66, -0.08, 0.01))
  const vitals = animatedScreen(96, 64, 8, (c, t) => {
    c.fillStyle = C.screen
    c.fillRect(0, 0, 96, 64)
    c.font = '8px monospace'
    for (let i = 0; i < 3; i++) {
      const y = 6 + i * 20
      const bpm = 68 + Math.round(6 * Math.sin(t * 0.7 + i * 2))
      c.fillStyle = '#39ff8a'
      c.fillText(`LIT ${i + 1}`, 3, y + 6)
      c.fillText(`${bpm}`, 78, y + 6)
      c.strokeStyle = '#39ff8a'
      c.beginPath()
      for (let x = 0; x < 40; x++) {
        const p = (x / 40 + t * 0.9 + i * 0.3) % 1
        const v = p > 0.4 && p < 0.44 ? -8 : p >= 0.44 && p < 0.48 ? 5 : 0
        if (x) c.lineTo(34 + x, y + 10 + v)
        else c.moveTo(34 + x, y + 10 + v)
      }
      c.stroke()
    }
  })
  const screen = part(new THREE.PlaneGeometry(0.3, 0.18), new THREE.MeshBasicMaterial({ map: vitals.texture }), -0.28, 0.66, -0.096)
  screen.rotation.y = Math.PI
  // Presse-papiers et dossier.
  const clip = box(0.13, 0.008, 0.18, lit('#8a5a34'), 0.02, 0.455, -0.06)
  clip.rotation.y = 0.2
  const sheet = box(0.11, 0.004, 0.15, lit('#f7f5ef'), 0.02, 0.461, -0.058)
  sheet.rotation.y = 0.2
  g.add(clip, sheet, box(0.05, 0.012, 0.015, lit(C.chrome, 'metal'), 0.005, 0.466, -0.13))
  // Sonnette de comptoir.
  g.add(cylinder(0.025, 0.03, 0.012, lit(C.rubber), 0.38, 0.456, 0.12, 10), sphere(0.024, lit('#d9b24a'), 0.38, 0.465, 0.12, 10))
  // Tasse de café, marquée de rouge à lèvres.
  g.add(cylinder(0.025, 0.022, 0.05, lit('#fff4f7'), 0.22, 0.475, -0.12, 10), box(0.012, 0.015, 0.004, lit(C.red), 0.22, 0.495, -0.095))
  // Vase de roses.
  g.add(cylinder(0.02, 0.03, 0.09, glass('#bfe8ff', 0.45), 0.44, 0.495, -0.12, 10))
  for (const [dx, dz, h] of [[0, 0, 0.13], [0.02, 0.012, 0.11], [-0.018, 0.01, 0.12]] as const) {
    g.add(cylinder(0.003, 0.003, h, lit('#3f8a4a'), 0.44 + dx, 0.45 + h / 2 + 0.03, -0.12 + dz, 4), sphere(0.018, lit('#e0264f'), 0.44 + dx, 0.48 + h, -0.12 + dz, 8))
  }

  // Bocal de sucettes, « pour les courageux » : couvercle, bonbons de couleur.
  const live = new THREE.Group()
  live.add(part(new THREE.CylinderGeometry(0.05, 0.05, 0.11, 14, 1, true), glass('#e6f6ff', 0.35), -0.02, 0.505, 0.1))
  g.add(cylinder(0.052, 0.052, 0.015, lit(C.red), -0.02, 0.566, 0.1, 14))
  const candy = ['#ff4f8b', '#ffd23f', '#59d8ff', '#7dffa8', '#c77dff']
  for (let i = 0; i < 7; i++) {
    const a = i * 2.1
    const s = sphere(0.018, lit(candy[i % candy.length]), -0.02 + Math.cos(a) * 0.025, 0.47 + (i % 3) * 0.022, 0.1 + Math.sin(a) * 0.025, 8)
    g.add(s)
  }
  live.add(screen)
  return { solid: g, live, update: (t) => vitals.tick(t) }
}

// ---------------------------------------------------------------- équipements

/** Réfrigérateur à vaccins : porte vitrée, flacons éclairés, afficheur de température. */
const medFridge: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.5, 0.62, 0.42, lit(C.white), 0, 0.31, 0, 0.02), box(0.42, 0.5, 0.01, lit('#dff4ff'), 0, 0.34, 0.211))
  // Étagères et flacons (derrière la vitre).
  const colors = ['#ffd23f', '#59d8ff', '#ff6b8b', '#7dffa8']
  for (let row = 0; row < 3; row++) {
    const y = 0.16 + row * 0.15
    g.add(box(0.4, 0.008, 0.3, lit(C.whiteDark), 0, y, 0.03))
    for (let i = 0; i < 6; i++) g.add(cylinder(0.014, 0.014, 0.06, lit(colors[(i + row) % colors.length]), -0.16 + i * 0.064, y + 0.034, 0.1, 6))
  }
  g.add(box(0.1, 0.035, 0.01, lit(C.screen), 0.12, 0.575, 0.216), box(0.02, 0.2, 0.02, lit(C.chrome, 'metal'), 0.18, 0.34, 0.225))
  const live = new THREE.Group()
  const temp = drawnTexture(64, 24, (c) => {
    c.fillStyle = C.screen
    c.fillRect(0, 0, 64, 24)
    c.fillStyle = '#59d8ff'
    c.font = 'bold 16px monospace'
    c.fillText('+4°C', 8, 18)
  })
  live.add(part(new THREE.PlaneGeometry(0.09, 0.03), new THREE.MeshBasicMaterial({ map: temp }), 0.12, 0.575, 0.222))
  live.add(part(new THREE.PlaneGeometry(0.4, 0.46), glass('#cfefff', 0.28), 0, 0.34, 0.218))
  return { solid: g, live }
}

/**
 * Négatoscope mural : radiographies rétroéclairées (un thorax, et un crâne avec… un limpet dans
 * l'estomac d'à côté). Adossé au mur (dos à -z), il ne gêne pas le passage.
 */
const xrayBoard: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.62, 0.36, 0.04, lit(C.white), 0, 0.66, 0.02, 0.01))
  const film = drawnTexture(256, 144, (c) => {
    c.fillStyle = '#e8f6ff'
    c.fillRect(0, 0, 256, 144)
    for (const [ox, kind] of [[8, 'chest'], [132, 'belly']] as const) {
      c.fillStyle = '#0a1622'
      c.fillRect(ox, 8, 116, 128)
      c.strokeStyle = '#d7ecff'
      c.fillStyle = '#d7ecff'
      c.lineWidth = 3
      const cx = ox + 58
      if (kind === 'chest') {
        // Colonne, côtes, clavicules.
        c.fillRect(cx - 3, 20, 6, 108)
        for (let i = 0; i < 6; i++) {
          c.beginPath()
          c.ellipse(cx, 44 + i * 13, 40 - i * 2, 9, 0, Math.PI * 0.05, Math.PI * 0.95)
          c.stroke()
        }
        c.beginPath()
        c.moveTo(cx - 40, 30)
        c.lineTo(cx - 6, 36)
        c.moveTo(cx + 40, 30)
        c.lineTo(cx + 6, 36)
        c.stroke()
      } else {
        // Bassin, colonne… et un limpet avalé.
        c.fillRect(cx - 3, 12, 6, 70)
        c.beginPath()
        c.ellipse(cx, 100, 38, 22, 0, Math.PI, 0)
        c.stroke()
        c.save()
        c.translate(cx + 14, 54)
        c.fillStyle = '#ffd58b'
        c.fillRect(-9, -6, 18, 12)
        c.fillRect(-14, -2, 28, 4)
        c.restore()
        c.fillStyle = '#ffd58b'
        c.font = 'bold 12px sans-serif'
        c.fillText('?!', cx + 26, 44)
      }
    }
  })
  g.add(box(0.03, 0.03, 0.02, lit(C.chrome, 'metal'), -0.26, 0.86, 0.045), box(0.03, 0.03, 0.02, lit(C.chrome, 'metal'), 0.26, 0.86, 0.045))
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(0.56, 0.3), new THREE.MeshBasicMaterial({ map: film }), 0, 0.66, 0.042))
  return { live, solid: g }
}

/** Échelle d'acuité visuelle, façon Elite : les lettres qui rapetissent finissent en « o7 ». */
const eyeChart: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.3, 0.44, 0.015, lit('#f7f5ef'), 0, 0.64, 0.008))
  const chart = drawnTexture(128, 192, (c) => {
    c.fillStyle = '#f7f5ef'
    c.fillRect(0, 0, 128, 192)
    c.fillStyle = '#15161a'
    c.textAlign = 'center'
    const rows = ['E', 'F D', 'T O Z', 'L P E D', 'P E C F D', 'E D F C Z P', 'F E L O P Z D', 'o 7   o 7']
    rows.forEach((row, i) => {
      c.font = `bold ${Math.round(40 - i * 4.4)}px monospace`
      c.fillText(row, 64, 38 + i * 20 - Math.max(0, 3 - i) * 2)
    })
    c.fillStyle = '#e0263a'
    c.fillRect(8, 176, 112, 2)
  })
  g.add(part(new THREE.PlaneGeometry(0.28, 0.42), new THREE.MeshLambertMaterial({ map: chart }), 0, 0.64, 0.017))
  return { solid: g }
}

/** Toise et pèse-personne à cadran. */
const medScale: Builder = () => {
  const g = new THREE.Group()
  const white = lit(C.white)
  g.add(box(0.3, 0.05, 0.3, white, 0, 0.025, 0.05, 0.015), box(0.26, 0.008, 0.24, lit('#3a3f48'), 0, 0.054, 0.06))
  g.add(box(0.04, 0.82, 0.03, white, 0, 0.41, -0.1), box(0.18, 0.02, 0.05, lit(C.chrome, 'metal'), 0, 0.72, -0.07))
  // Graduations de la toise.
  for (let i = 0; i < 9; i++) g.add(box(i % 2 ? 0.012 : 0.022, 0.004, 0.004, lit(C.rubber), 0.022, 0.12 + i * 0.075, -0.083))
  // Cadran.
  const dial = drawnTexture(64, 64, (c) => {
    c.fillStyle = '#fffdf6'
    c.beginPath()
    c.arc(32, 32, 30, 0, Math.PI * 2)
    c.fill()
    c.strokeStyle = '#15161a'
    c.lineWidth = 2
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      c.beginPath()
      c.moveTo(32 + Math.cos(a) * 24, 32 + Math.sin(a) * 24)
      c.lineTo(32 + Math.cos(a) * 29, 32 + Math.sin(a) * 29)
      c.stroke()
    }
    c.strokeStyle = '#e0263a'
    c.beginPath()
    c.moveTo(32, 32)
    c.lineTo(50, 18)
    c.stroke()
  })
  g.add(cylinder(0.055, 0.055, 0.02, white, 0, 0.45, -0.075, 14))
  const face = part(new THREE.CircleGeometry(0.048, 16), new THREE.MeshLambertMaterial({ map: dial }), 0, 0.45, -0.064)
  g.add(face)
  return { solid: g }
}

/** Fauteuil roulant, face à +z. */
const wheelchair: Builder = () => {
  const g = new THREE.Group()
  const frame = lit(C.chrome, 'metal'), seat = lit('#2d5a8a'), tyre = lit(C.rubber)
  for (const s of [-1, 1]) {
    // Grandes roues et main courante.
    const wheel = mesh(new THREE.TorusGeometry(0.15, 0.018, 6, 20), tyre, s * 0.2, 0.16, -0.04)
    const rim = mesh(new THREE.TorusGeometry(0.13, 0.006, 4, 20), frame, s * 0.22, 0.16, -0.04)
    wheel.rotation.y = rim.rotation.y = Math.PI / 2
    g.add(wheel, rim)
    // Roulettes avant, accoudoirs, poignées.
    g.add(sphere(0.03, tyre, s * 0.14, 0.03, 0.2, 8))
    g.add(box(0.02, 0.02, 0.28, frame, s * 0.17, 0.36, 0.02), box(0.03, 0.03, 0.2, lit(C.rubber), s * 0.17, 0.375, 0.04))
    g.add(box(0.02, 0.36, 0.02, frame, s * 0.16, 0.44, -0.16), box(0.025, 0.025, 0.08, lit(C.rubber), s * 0.16, 0.62, -0.2))
    g.add(box(0.015, 0.2, 0.015, frame, s * 0.13, 0.13, 0.19))
  }
  g.add(box(0.32, 0.03, 0.3, seat, 0, 0.26, 0.02, 0.01), box(0.32, 0.26, 0.03, seat, 0, 0.42, -0.15, 0.01))
  g.add(box(0.26, 0.015, 0.08, lit(C.rubber), 0, 0.05, 0.25))
  return { solid: g }
}

/** Défibrillateur mural (DAE) : boîtier vert, éclair, voyant qui clignote. Dos au mur (-z). */
const defibrillator: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.24, 0.26, 0.08, lit('#1f9d55'), 0, 0.62, 0.04, 0.015), box(0.18, 0.14, 0.01, lit('#f7f5ef'), 0, 0.6, 0.082))
  const bolt = drawnTexture(64, 48, (c) => {
    c.fillStyle = '#f7f5ef'
    c.fillRect(0, 0, 64, 48)
    c.fillStyle = '#e0263a'
    c.beginPath()
    c.moveTo(20, 4)
    c.lineTo(30, 4)
    c.lineTo(26, 20)
    c.lineTo(38, 20)
    c.lineTo(18, 44)
    c.lineTo(24, 26)
    c.lineTo(14, 26)
    c.closePath()
    c.fill()
    c.fillStyle = '#1f9d55'
    c.font = 'bold 13px sans-serif'
    c.fillText('DAE', 38, 30)
  })
  g.add(part(new THREE.PlaneGeometry(0.17, 0.13), new THREE.MeshLambertMaterial({ map: bolt }), 0, 0.6, 0.088))
  const led = new THREE.MeshBasicMaterial({ color: '#39ff8a' })
  const live = new THREE.Group()
  live.add(part(new THREE.SphereGeometry(0.01, 6, 4), led, 0.08, 0.72, 0.085))
  return { solid: g, live, update: (t) => led.color.set(t % 2 < 0.15 ? '#39ff8a' : '#0d3d22') }
}

/** Lavabo chirurgical : cuve, robinet à coude, distributeur de gel, boîte de gants. Dos au mur (-z). */
const medSink: Builder = () => {
  const g = new THREE.Group()
  const white = lit(C.white), chrome = lit(C.chrome, 'metal')
  g.add(box(0.5, 0.36, 0.34, white, 0, 0.18, 0.17, 0.02), box(0.52, 0.03, 0.36, lit(C.whiteDark), 0, 0.375, 0.17, 0.01))
  g.add(box(0.3, 0.02, 0.2, lit('#cfd8e0'), 0, 0.385, 0.19))
  g.add(cylinder(0.01, 0.01, 0.14, chrome, 0, 0.45, 0.05, 6), box(0.02, 0.02, 0.1, chrome, 0, 0.52, 0.09))
  const lever = box(0.12, 0.01, 0.015, chrome, 0.05, 0.47, 0.06)
  lever.rotation.z = 0.3
  g.add(lever)
  // Distributeur de gel et boîte de gants, au mur.
  g.add(box(0.08, 0.14, 0.06, white, 0.19, 0.58, 0.03, 0.01), box(0.05, 0.02, 0.01, lit(C.teal), 0.19, 0.52, 0.062))
  g.add(box(0.14, 0.07, 0.07, lit('#8fd6ff'), -0.16, 0.62, 0.035, 0.008), box(0.06, 0.02, 0.005, lit('#f7f5ef'), -0.16, 0.64, 0.072))
  // Miroir.
  g.add(box(0.26, 0.2, 0.01, lit(C.chrome, 'metal'), 0, 0.72, 0.005))
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(0.24, 0.18), glass('#e8f6ff', 0.55), 0, 0.72, 0.012))
  return { solid: g, live }
}

/** Petite affiche murale de prévention, à l'humour de bord. Dos au mur (-z). */
const medPoster: Builder = ({ label }) => {
  const g = new THREE.Group()
  const [title, ...lines] = (label ?? tr('LAVEZ-VOUS LES MAINS|Même avec des gants|de combinaison.', 'WASH YOUR HANDS|Even with suit|gloves on.')).split('|')
  const tex = drawnTexture(160, 220, (c) => {
    c.fillStyle = '#fff4f7'
    c.fillRect(0, 0, 160, 220)
    c.fillStyle = '#e0263a'
    c.fillRect(0, 0, 160, 16)
    c.fillRect(64, 36, 32, 80)
    c.fillRect(40, 60, 80, 32)
    c.fillStyle = '#15161a'
    c.textAlign = 'center'
    c.font = 'bold 15px sans-serif'
    c.fillText(title, 80, 146)
    c.font = '13px sans-serif'
    lines.forEach((l, i) => c.fillText(l, 80, 168 + i * 17))
  })
  g.add(box(0.26, 0.34, 0.01, lit('#f7f5ef'), 0, 0.62, 0.005))
  g.add(part(new THREE.PlaneGeometry(0.24, 0.32), new THREE.MeshLambertMaterial({ map: tex }), 0, 0.62, 0.011))
  return { solid: g }
}

export const MEDICAL = {
  'med-curtain': medCurtain,
  'iv-stand': ivStand,
  'nurse-station': nurseStation,
  'med-fridge': medFridge,
  'xray-board': xrayBoard,
  'eye-chart': eyeChart,
  'med-scale': medScale,
  wheelchair,
  defibrillator,
  'med-sink': medSink,
  'med-poster': medPoster,
} satisfies Record<string, Builder>
