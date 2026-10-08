import * as THREE from 'three'
import { barX, barZ, box, cylinder, decal, drawnTexture, glass, glow, lit, mesh, part, sphere, type Builder } from './kit'

/*
 * Les objets des quêtes « qui se méritent » (cf. src/quests/content-more.ts) : ce qu'elles posent
 * dans le vaisseau, et ce qu'elles offrent pour les quartiers (le poste pirate, le bar de poche,
 * le projecteur à bobine). Mêmes conventions que quests.ts : face à +z, posé au sol, centré sur
 * l'origine ; ce qui s'accroche a le dos à -z.
 */

const C = {
  steel: '#b9c1cc',
  steelDark: '#5d6470',
  iron: '#2b2e35',
  bakelite: '#3a2a22',
  cream: '#e9dfc6',
  amber: '#ffb03a',
  red: '#e0392b',
  green: '#7dffa8',
  cyan: '#59d8ff',
  wood: '#8a5a34',
  woodDark: '#5c3a22',
  brass: '#c9a04a',
  film: '#1a1612',
  phosphor: '#00ff41',
}

/** Une petite antenne télescopique, penchée. */
function antenna(x: number, y: number, z: number, length: number, lean = 0.35): THREE.Mesh {
  const a = cylinder(0.004, 0.006, length, lit(C.steel, 'metal'), x, y + (length / 2) * Math.cos(lean), z, 6)
  a.rotation.z = -lean
  a.position.x += (length / 2) * Math.sin(lean)
  return a
}

// ---------------------------------------------------------------- Fréquence fantôme

/**
 * Un casque d'écoute tombé de son support, qui grésille tout seul : ses coques battent d'une
 * lueur ambrée, au rythme d'une voix qu'on n'entend pas d'ici.
 */
const headset: Builder = () => {
  const g = new THREE.Group()
  const live = new THREE.Group()
  const band = mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 16, Math.PI), lit(C.iron), 0, 0.1, 0)
  g.add(band)
  for (const s of [-1, 1]) g.add(barX(0.055, 0.05, lit(C.iron), s * 0.1, 0.08, 0, 14), barX(0.045, 0.02, lit('#6a4a3a'), s * 0.07, 0.08, 0, 14))
  // Le cordon, lové au sol.
  const cord = mesh(new THREE.TorusGeometry(0.07, 0.006, 5, 14, Math.PI * 1.6), lit(C.iron), 0.16, 0.008, 0.06)
  cord.rotation.x = Math.PI / 2
  g.add(cord)
  const pulses = [-1, 1].map((s) => part(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 12), glow(C.amber), s * 0.128, 0.08, 0))
  for (const p of pulses) p.rotation.z = Math.PI / 2
  live.add(...pulses)
  return {
    solid: g, live,
    update: (t) => {
      // Une voix : des syllabes, des silences.
      const on = Math.sin(t * 9) * Math.sin(t * 2.3) > 0.1
      for (const p of pulses) p.visible = on
    },
  }
}

/** Le journal d'antenne du studio : un classeur à levier ouvert, une page cornée, un crayon. */
const logbook: Builder = () => {
  const page = drawnTexture(128, 160, (c) => {
    c.fillStyle = '#f3ecd8'
    c.fillRect(0, 0, 128, 160)
    c.strokeStyle = '#b9c7d6'
    for (let y = 22; y < 160; y += 12) { c.beginPath(); c.moveTo(8, y); c.lineTo(120, y); c.stroke() }
    c.fillStyle = '#26303c'
    c.font = '9px monospace'
    for (const [i, text] of ['02:58  ---', '03:04  ---', '03:12  88.8 ??', '03:13  PAS NOUS', '03:31  88.8 ??', '03:40  ---'].entries()) c.fillText(text, 12, 31 + i * 12)
    c.strokeStyle = C.red
    c.lineWidth = 2
    c.strokeRect(8, 46, 96, 26)
  })
  const g = new THREE.Group()
  g.add(box(0.36, 0.03, 0.26, lit('#243b55'), 0, 0.015, 0, 0.008))
  for (const s of [-1, 1]) {
    const sheet = part(new THREE.PlaneGeometry(0.16, 0.22), new THREE.MeshLambertMaterial({ map: page }), s * 0.085, 0.034, 0)
    sheet.rotation.x = -Math.PI / 2
    g.add(sheet)
  }
  g.add(barZ(0.012, 0.2, lit(C.steel, 'metal'), 0, 0.04, 0, 8), barX(0.006, 0.14, lit('#e6b422'), 0.1, 0.042, 0.09, 6))
  return { solid: g }
}

/**
 * Un relais pirate (ventousé à ce qu'il a trouvé) : un boîtier gros comme une boîte à chaussures,
 * une antenne, une diode qui bat, et du ruban adhésif partout.
 */
const relay: Builder = ({ random }) => {
  const g = new THREE.Group()
  const live = new THREE.Group()
  g.add(box(0.22, 0.12, 0.14, lit(C.bakelite), 0, 0.06, 0, 0.012))
  g.add(box(0.23, 0.025, 0.145, lit('#b8bcc2'), 0, 0.06, 0), box(0.06, 0.03, 0.01, lit(C.cream), -0.05, 0.085, 0.072))
  g.add(antenna(0.08, 0.12, 0, 0.34))
  const led = part(new THREE.SphereGeometry(0.012, 8, 6), glow(C.red), 0.06, 0.09, 0.072)
  live.add(led)
  const phase = random() * 6
  return { solid: g, live, update: (t) => (led.visible = Math.sin(t * 6 + phase) > 0.2) }
}

/**
 * L'émetteur : un montage de récupération posé sur une caisse, une platine à cassette, une
 * antenne en fil de fer tordu, un micro de casque scotché à un manche. Quelqu'un de petit l'a bâti.
 */
const transmitter: Builder = () => {
  const g = new THREE.Group()
  const live = new THREE.Group()
  g.add(box(0.5, 0.3, 0.38, lit(C.wood, 'wood'), 0, 0.15, 0), box(0.52, 0.02, 0.4, lit(C.woodDark, 'wood'), 0, 0.31, 0))
  g.add(box(0.3, 0.1, 0.2, lit(C.iron, 'metal'), -0.06, 0.37, 0, 0.01), box(0.14, 0.05, 0.005, lit('#0c0e12'), -0.06, 0.38, 0.101))
  g.add(box(0.12, 0.14, 0.12, lit(C.bakelite), 0.17, 0.39, -0.08, 0.01))
  // L'antenne : un cintre déplié.
  g.add(antenna(0.17, 0.46, -0.08, 0.5, 0.2), antenna(0.17, 0.46, -0.08, 0.36, -0.5))
  // Le micro, à hauteur de drone.
  g.add(cylinder(0.006, 0.006, 0.16, lit(C.steel, 'metal'), -0.18, 0.4, 0.14, 6), sphere(0.022, lit('#15181c'), -0.18, 0.49, 0.14, 8))
  const reels = [-1, 1].map((s) => part(new THREE.BoxGeometry(0.03, 0.008, 0.004), glow(C.cream), -0.06 + s * 0.035, 0.38, 0.105))
  const air = part(new THREE.BoxGeometry(0.07, 0.02, 0.006), glow(C.red), 0.17, 0.42, -0.018)
  live.add(...reels, air)
  return {
    solid: g, live,
    update: (t) => {
      for (const r of reels) r.rotation.z = t * 2
      air.visible = Math.floor(t * 0.8) % 2 === 0
    },
  }
}

/**
 * Le poste pirate (récompense, à poser sur un meuble) : un transistor en bakélite au cadran
 * ambré, calé pour de bon sur 88.8, un autocollant de drone sur le flanc.
 */
const pirateRadio: Builder = () => {
  const dial = drawnTexture(128, 48, (c) => {
    c.fillStyle = '#ffcf7a'
    c.fillRect(0, 0, 128, 48)
    c.fillStyle = '#5a3410'
    c.font = 'bold 11px monospace'
    for (let i = 0; i < 9; i++) c.fillRect(10 + i * 13.5, 30, 1.5, i % 2 ? 6 : 11)
    c.fillText('84   88.8   92', 12, 18)
    c.fillStyle = '#c0281f'
    c.fillRect(63, 4, 2.5, 40)
  })
  const g = new THREE.Group()
  const live = new THREE.Group()
  g.add(box(0.3, 0.19, 0.11, lit(C.bakelite), 0, 0.095, 0, 0.02), box(0.31, 0.012, 0.115, lit(C.brass, 'metal'), 0, 0.185, 0))
  // La grille du haut-parleur, les deux boutons.
  for (let i = 0; i < 5; i++) g.add(box(0.11, 0.008, 0.004, lit(C.cream), -0.075, 0.05 + i * 0.022, 0.056))
  for (const x of [0.04, 0.1]) g.add(cylinder(0.016, 0.016, 0.014, lit(C.cream), x, 0.045, 0.06, 10))
  g.children.slice(-2).forEach((k) => (k.rotation.x = Math.PI / 2))
  g.add(antenna(0.12, 0.19, -0.02, 0.3, 0.3))
  const face = part(new THREE.PlaneGeometry(0.13, 0.05), new THREE.MeshBasicMaterial({ map: dial }), 0.07, 0.12, 0.057)
  live.add(face)
  return { solid: g, live }
}

// ---------------------------------------------------------------- La recette de Jacques

/** Un pot de menthe, étiqueté à la main, qui pousse trop bien pour être honnête. */
const mint: Builder = ({ random }) => {
  const g = new THREE.Group()
  g.add(cylinder(0.1, 0.075, 0.13, lit('#b5633c'), 0, 0.065, 0, 14), cylinder(0.09, 0.09, 0.012, lit('#3a2a1c'), 0, 0.128, 0, 12))
  for (let i = 0; i < 14; i++) {
    const a = random() * Math.PI * 2, r = random() * 0.09, h = 0.16 + random() * 0.16
    const leaf = sphere(0.035, lit(i % 3 ? '#3f9a4a' : '#63c064'), Math.cos(a) * r, h, Math.sin(a) * r, 6)
    leaf.scale.set(1, 0.45, 0.7)
    leaf.rotation.y = a
    g.add(leaf)
  }
  g.add(box(0.07, 0.045, 0.004, lit(C.cream), 0, 0.07, 0.092))
  return { solid: g }
}

/** Un bocal oublié au bord de l'étang : au fond, une algue qui luit doucement. */
const algae: Builder = () => {
  const g = new THREE.Group()
  const live = new THREE.Group()
  g.add(cylinder(0.065, 0.065, 0.15, glass('#bfe9ff', 0.3), 0, 0.075, 0, 14), cylinder(0.07, 0.07, 0.016, lit(C.brass, 'metal'), 0, 0.158, 0, 14))
  const strands = [0, 1, 2].map((i) => {
    const s = part(new THREE.CylinderGeometry(0.008, 0.012, 0.1, 5), glow('#6dffb0'), (i - 1) * 0.022, 0.06, (i % 2) * 0.02 - 0.01)
    live.add(s)
    return s
  })
  return { solid: g, live, update: (t) => strands.forEach((s, i) => (s.rotation.z = Math.sin(t * 1.3 + i * 2) * 0.25)) }
}

/** Une fiole scellée dans sa mallette de quarantaine : jaune de danger, mousse noire, une goutte verte. */
const vial: Builder = () => {
  const g = new THREE.Group()
  const live = new THREE.Group()
  g.add(box(0.3, 0.07, 0.22, lit('#e2b21f'), 0, 0.035, 0, 0.012), box(0.26, 0.012, 0.18, lit('#15181c'), 0, 0.074, 0))
  const lid = box(0.3, 0.03, 0.22, lit('#e2b21f'), 0, 0.17, -0.14, 0.012)
  lid.rotation.x = -1.15
  g.add(lid, cylinder(0.022, 0.022, 0.1, glass('#d8fff0', 0.35), 0, 0.09, 0, 10))
  g.children[g.children.length - 1].rotation.z = Math.PI / 2
  const drop = part(new THREE.SphereGeometry(0.016, 8, 6), glow('#7dff5a'), 0, 0.09, 0)
  live.add(drop)
  return { solid: g, live, update: (t) => drop.scale.setScalar(1 + Math.sin(t * 3) * 0.18) }
}

/**
 * Le bar de poche (récompense, posé au sol) : un globe terrestre monté sur pied, dont le couvercle
 * relevé découvre trois bouteilles, un shaker et deux verres.
 */
const pocketBar: Builder = () => {
  const g = new THREE.Group()
  const wood = lit(C.wood, 'wood'), brass = lit(C.brass, 'metal')
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5
    const leg = cylinder(0.014, 0.018, 0.46, wood, Math.cos(a) * 0.15, 0.22, Math.sin(a) * 0.15, 6)
    leg.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3)
    g.add(leg)
  }
  g.add(cylinder(0.2, 0.2, 0.015, wood, 0, 0.14, 0, 20), mesh(new THREE.TorusGeometry(0.27, 0.012, 6, 28), brass, 0, 0.48, 0))
  g.children[g.children.length - 1].rotation.x = Math.PI / 2
  // La demi-sphère du bas (le plateau), celle du haut relevée derrière.
  const bowl = mesh(new THREE.SphereGeometry(0.26, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), lit('#2f5d7a'), 0, 0.48, 0)
  const lid = mesh(new THREE.SphereGeometry(0.26, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), lit('#2f5d7a'), 0, 0.5, -0.24)
  lid.rotation.x = -1.25
  g.add(bowl, lid, cylinder(0.25, 0.25, 0.012, lit(C.woodDark, 'wood'), 0, 0.47, 0, 20))
  // Les continents, en trois taches.
  for (const [x, y, z] of [[0.19, 0.36, 0.13], [-0.2, 0.33, 0.1], [0.02, 0.27, 0.2]]) g.add(sphere(0.05, lit('#7fb069'), x, y, z, 6))
  // Bouteilles, shaker, verres.
  for (const [x, z, color, h] of [[-0.11, -0.06, '#2e7d4f', 0.2], [0, -0.1, '#b3541e', 0.24], [0.11, -0.05, '#6a3fb0', 0.18]] as const) {
    g.add(cylinder(0.03, 0.032, h, glass(color, 0.75), x, 0.476 + h / 2, z, 10), cylinder(0.012, 0.012, 0.06, glass(color, 0.75), x, 0.5 + h, z, 8))
  }
  g.add(cylinder(0.028, 0.036, 0.13, lit(C.steel, 'metal'), 0.09, 0.545, 0.1, 12), cylinder(0.02, 0.028, 0.035, lit(C.steel, 'metal'), 0.09, 0.625, 0.1, 12))
  for (const x of [-0.1, -0.02]) g.add(cylinder(0.026, 0.02, 0.06, glass('#e8f6ff', 0.3), x, 0.51, 0.11, 10))
  return { solid: g }
}

// ---------------------------------------------------------------- Le poisson qui n'existe pas

/** Une écaille grande comme la paume, posée sur la margelle : elle luit, et sa lueur respire. */
const scale: Builder = () => {
  const g = new THREE.Group()
  const light = new THREE.MeshBasicMaterial({ color: '#b98cff', transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false })
  const halo = new THREE.MeshBasicMaterial({ color: '#6a4bd8', transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false })
  const flake = part(new THREE.CircleGeometry(0.06, 5), light, 0, 0.03, 0)
  flake.rotation.x = -1.2
  const ring = part(new THREE.RingGeometry(0.09, 0.12, 20), halo, 0, 0.012, 0)
  ring.rotation.x = -Math.PI / 2
  g.add(flake, ring)
  return {
    live: g,
    update: (t) => {
      light.opacity = 0.65 + Math.sin(t * 2.2) * 0.25
      ring.scale.setScalar(1 + Math.sin(t * 2.2) * 0.12)
    },
  }
}

// ---------------------------------------------------------------- Séance de minuit

/** Une boîte de bobine en fer-blanc, sans étiquette : à peine un cercle au feutre, là où elle aurait dû être. */
const filmCan: Builder = () => {
  const top = drawnTexture(128, 128, (c) => {
    c.fillStyle = '#9aa1ab'
    c.fillRect(0, 0, 128, 128)
    c.strokeStyle = '#6f7682'
    c.lineWidth = 3
    for (const r of [20, 36, 56]) { c.beginPath(); c.arc(64, 64, r, 0, Math.PI * 2); c.stroke() }
    // Six pétales autour d'un hexagone, à peine visibles : la marque de la Voie.
    c.strokeStyle = 'rgba(40, 30, 60, 0.55)'
    c.lineWidth = 1.5
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      c.beginPath(); c.ellipse(64 + Math.cos(a) * 14, 64 + Math.sin(a) * 14, 7, 3.5, a, 0, Math.PI * 2); c.stroke()
    }
  })
  const g = new THREE.Group()
  g.add(cylinder(0.17, 0.17, 0.045, lit('#8b929c', 'metal'), 0, 0.023, 0, 24))
  const cap = part(new THREE.CircleGeometry(0.168, 24), new THREE.MeshLambertMaterial({ map: top }), 0, 0.047, 0)
  cap.rotation.x = -Math.PI / 2
  // Un bout d'amorce qui dépasse.
  const leader = box(0.2, 0.004, 0.03, lit(C.film), 0.2, 0.02, 0.05)
  leader.rotation.y = 0.5
  g.add(cap, leader)
  return { solid: g }
}

/**
 * Un bout de pellicule qui dépasse de derrière une affiche (accroché, dos à -z) : trois images,
 * des perforations, et une lueur violette qui passe d'une image à l'autre.
 */
const filmStrip: Builder = () => {
  const strip = drawnTexture(48, 160, (c) => {
    c.fillStyle = C.film
    c.fillRect(0, 0, 48, 160)
    c.fillStyle = '#d9d2c4'
    for (let y = 4; y < 160; y += 12) { c.fillRect(3, y, 5, 6); c.fillRect(40, y, 5, 6) }
    for (let i = 0; i < 3; i++) {
      c.fillStyle = '#2a2140'
      c.fillRect(12, 8 + i * 50, 24, 42)
      c.strokeStyle = '#b98cff'
      c.beginPath(); c.arc(24, 29 + i * 50, 7 + i * 2, 0, Math.PI * 2); c.stroke()
    }
  })
  const g = new THREE.Group()
  const live = new THREE.Group()
  const film = part(new THREE.PlaneGeometry(0.09, 0.3), new THREE.MeshLambertMaterial({ map: strip, side: THREE.DoubleSide }), 0, 0.42, -0.07)
  film.rotation.z = 0.12
  g.add(film)
  const shine = part(new THREE.PlaneGeometry(0.05, 0.07), new THREE.MeshBasicMaterial({ color: '#b98cff', transparent: true, opacity: 0.6, depthWrite: false }), 0, 0.42, -0.066)
  live.add(shine)
  return { solid: g, live, update: (t) => (shine.position.y = 0.33 + (Math.floor(t * 1.5) % 3) * 0.094) }
}

/**
 * Le projecteur à bobine (récompense, posé au sol) : un 16 mm sur son trépied, deux bobines qui
 * tournent, et un faisceau qui tremble comme une vieille séance.
 */
const reelProjector: Builder = () => {
  const g = new THREE.Group()
  const live = new THREE.Group()
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    const leg = cylinder(0.012, 0.016, 0.62, lit(C.woodDark, 'wood'), Math.cos(a) * 0.14, 0.29, Math.sin(a) * 0.14, 6)
    leg.rotation.set(Math.sin(a) * 0.42, 0, -Math.cos(a) * 0.42)
    g.add(leg)
  }
  g.add(box(0.14, 0.2, 0.3, lit(C.iron, 'metal'), 0, 0.68, 0, 0.012), cylinder(0.04, 0.045, 0.1, lit(C.steel, 'metal'), 0, 0.66, 0.2, 12))
  g.children[g.children.length - 1].rotation.x = Math.PI / 2
  const reels = [[0.86, -0.1], [0.84, 0.12]].map(([y, z]) => {
    const reel = new THREE.Group()
    reel.position.set(0.08, y, z)
    const disc = part(new THREE.CylinderGeometry(0.11, 0.11, 0.012, 18), lit(C.steelDark, 'metal'))
    disc.rotation.z = Math.PI / 2
    reel.add(disc, part(new THREE.BoxGeometry(0.016, 0.2, 0.03), lit(C.steel, 'metal')), part(new THREE.BoxGeometry(0.016, 0.03, 0.2), lit(C.steel, 'metal')))
    live.add(reel)
    return reel
  })
  const beamMat = new THREE.MeshBasicMaterial({ color: '#fff3d0', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
  const beam = part(new THREE.ConeGeometry(0.34, 1.1, 14, 1, true), beamMat, 0, 0.66, 0.8)
  beam.rotation.x = -Math.PI / 2
  live.add(beam, part(new THREE.CircleGeometry(0.03, 10), glow('#fff3d0'), 0, 0.66, 0.252))
  return {
    solid: g, live,
    update: (t) => {
      reels.forEach((r, i) => (r.rotation.x = t * (i ? 2.2 : 1.7)))
      beamMat.opacity = 0.13 + Math.sin(t * 23) * 0.025 + (Math.sin(t * 3.1) > 0.92 ? -0.07 : 0)
    },
  }
}

// ---------------------------------------------------------------- Le dossier ARIA

/**
 * Un fragment de mémoire : une carte de données fichée dans un lecteur de fortune, dont le
 * phosphore vert écrit et efface la même ligne.
 */
const dataShard: Builder = ({ random }) => {
  const g = new THREE.Group()
  const live = new THREE.Group()
  g.add(box(0.16, 0.05, 0.12, lit(C.iron, 'metal'), 0, 0.025, 0, 0.008))
  const card = box(0.09, 0.13, 0.008, lit('#10161c'), 0, 0.11, 0)
  card.rotation.x = -0.18
  g.add(card)
  const rows = [0, 1, 2, 3].map((i) => {
    const row = part(new THREE.BoxGeometry(0.06, 0.008, 0.002), glow(C.phosphor), 0, 0.15 - i * 0.022, 0.012 + i * 0.004)
    live.add(row)
    return row
  })
  const phase = random() * 6
  return {
    solid: g, live,
    update: (t) => {
      const k = ((t * 0.9 + phase) % 4)
      rows.forEach((row, i) => {
        row.visible = i < k
        row.scale.x = i < Math.floor(k) ? 1 : Math.max(0.05, k % 1)
      })
    },
  }
}

// ---------------------------------------------------------------- Tour de garde

/**
 * Une borne de ronde, sur son pied : le boîtier où le sergent pointe à chaque passage. Un
 * lecteur, une fente, une diode ambre qui attend qu'on badge.
 */
const checkpoint: Builder = () => {
  const face = drawnTexture(64, 96, (c) => {
    c.fillStyle = '#20262f'
    c.fillRect(0, 0, 64, 96)
    c.fillStyle = '#ffb03a'
    c.font = 'bold 9px monospace'
    c.textAlign = 'center'
    c.fillText('RONDE', 32, 16)
    c.strokeStyle = '#59616e'
    c.lineWidth = 2
    c.strokeRect(14, 30, 36, 44)
    c.fillStyle = '#0c0e12'
    c.fillRect(20, 80, 24, 5)
  })
  const g = new THREE.Group()
  const live = new THREE.Group()
  g.add(cylinder(0.11, 0.13, 0.03, lit(C.iron, 'metal'), 0, 0.015, 0, 14), cylinder(0.02, 0.02, 0.5, lit(C.steelDark, 'metal'), 0, 0.27, 0, 8))
  g.add(box(0.2, 0.3, 0.06, lit('#3a414d', 'metal'), 0, 0.62, 0, 0.012))
  g.add(part(new THREE.PlaneGeometry(0.17, 0.26), new THREE.MeshLambertMaterial({ map: face }), 0, 0.62, 0.032))
  const led = part(new THREE.SphereGeometry(0.012, 8, 6), glow(C.amber), 0.065, 0.74, 0.034)
  live.add(led)
  return { solid: g, live, update: (t) => (led.visible = Math.sin(t * 2.6) > -0.5) }
}

/** Ce que le sergent a laissé au sol : une marque de ronde au pochoir, deux semelles et une flèche. */
const beatMark: Builder = () => {
  const texture = drawnTexture(128, 128, (c) => {
    c.clearRect(0, 0, 128, 128)
    c.fillStyle = 'rgba(255, 176, 58, 0.8)'
    for (const x of [44, 84]) { c.beginPath(); c.ellipse(x, 78, 13, 26, 0, 0, Math.PI * 2); c.fill() }
    c.beginPath(); c.moveTo(64, 8); c.lineTo(86, 36); c.lineTo(42, 36); c.closePath(); c.fill()
  })
  return { live: decal(texture, 0.5, 0.5, 0.012) }
}

export const QUEST_REWARDS = {
  'quest-headset': headset,
  'quest-logbook': logbook,
  'quest-relay': relay,
  'quest-transmitter': transmitter,
  'pirate-radio': pirateRadio,
  'quest-mint': mint,
  'quest-algae': algae,
  'quest-vial': vial,
  'pocket-bar': pocketBar,
  'quest-scale': scale,
  'quest-film-can': filmCan,
  'quest-film-strip': filmStrip,
  'reel-projector': reelProjector,
  'quest-data-shard': dataShard,
  'quest-checkpoint': checkpoint,
  'quest-beat-mark': beatMark,
} satisfies Record<string, Builder>
