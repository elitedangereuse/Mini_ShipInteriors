import * as THREE from 'three'
import { animatedScreen, barX, box, compact, cylinder, drawnTexture, glass, glow, holoMaterial, lit, mesh, part, sphere, type Builder } from './kit'
import { tr } from '../i18n'

/*
 * Le labo du L.J.P.C. (Laboratoire des Jeunes Prodiges Cosmiques), au nord de la coursive du pont
 * principal, d'après l'aventure « Connais ton ennemi » : le tableau d'enquête des trois sites
 * thargoïdes, la paillasse, l'échantillon sous cloche, l'hologramme d'un intercepteur, la photo
 * d'Amadioha, et James et Julia, les deux jeunes prodiges. Moustache, leur chatte noire, est un
 * animal du bord (cf. main.ts). Sarcelle et blanc, comme le comptoir LJPC de la salle des machines.
 * Un objet accroché est construit dos au mur (origine sur la face du mur, contenu vers +z).
 */

const C = {
  teal: '#57e6c1',
  tealDark: '#2f9c86',
  deep: '#0a1f24',
  white: '#eef3f4',
  bench: '#dfe8ea',
  steel: '#8a949c',
  steelDark: '#2d3439',
  thargoid: '#3a4a3f',
  thargoidGlow: '#6aff9a',
  paper: '#fbf7ea',
  marker: '#1d2b3a',
  red: '#d8323c',
}

/** Écriture « feutre » d'enfant : un peu penchée. */
function scrawl(c: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, tilt = -0.04) {
  c.save()
  c.translate(x, y)
  c.rotate(tilt)
  c.fillStyle = color
  c.font = `700 ${size}px "Comic Sans MS", "Chalkboard SE", "Marker Felt", sans-serif`
  c.fillText(text, 0, 0)
  c.restore()
}

/** Silhouettes thargoïdes des photos : scout (coin), intercepteur (fleur à quatre pétales), base (dôme). */
function drawThargoid(c: CanvasRenderingContext2D, kind: 'scout' | 'interceptor' | 'base', x: number, y: number, s: number) {
  c.save()
  c.translate(x, y)
  c.fillStyle = '#2f3b33'
  c.strokeStyle = C.thargoidGlow
  c.lineWidth = 2
  if (kind === 'scout') {
    c.beginPath()
    c.moveTo(-s, s * 0.35)
    c.lineTo(0, -s * 0.5)
    c.lineTo(s, s * 0.35)
    c.lineTo(0, s * 0.1)
    c.closePath()
    c.fill()
    c.stroke()
  } else if (kind === 'interceptor') {
    for (let i = 0; i < 4; i++) {
      c.save()
      c.rotate((i * Math.PI) / 2 + Math.PI / 4)
      c.beginPath()
      c.ellipse(0, -s * 0.5, s * 0.22, s * 0.5, 0, 0, Math.PI * 2)
      c.fill()
      c.stroke()
      c.restore()
    }
    c.fillStyle = C.thargoidGlow
    c.beginPath()
    c.arc(0, 0, s * 0.16, 0, Math.PI * 2)
    c.fill()
  } else {
    c.beginPath()
    c.ellipse(0, s * 0.2, s * 1.1, s * 0.55, 0, Math.PI, 0)
    c.closePath()
    c.fill()
    c.stroke()
    c.fillStyle = C.thargoidGlow
    for (let i = -2; i <= 2; i++) c.fillRect(i * s * 0.35 - 2, s * 0.02, 4, 4)
  }
  c.restore()
}

/**
 * Tableau d'enquête, accroché au mur : un tableau blanc cadré de sarcelle, les photos des trois
 * sites de l'aventure reliées par des fils rouges, le QR code et son message en morse, les
 * gribouillis de Julia. Largeur : 1,7.
 */
const ljpcBoard: Builder = () => {
  const g = new THREE.Group()
  const Wd = 1.7, Hd = 0.8, Y = 0.6
  g.add(box(Wd + 0.06, Hd + 0.06, 0.03, lit(C.tealDark), 0, Y, 0.015, 0.01))
  g.add(box(Wd - 0.2, 0.02, 0.05, lit(C.steel), 0, Y - Hd / 2 - 0.01, 0.04))
  // Feutres posés sur la rigole.
  for (const [x, col] of [[-0.3, C.red], [-0.22, C.marker], [-0.14, C.tealDark]] as const) g.add(barX(0.008, 0.07, lit(col), x, Y - Hd / 2 + 0.01, 0.05, 6))
  const map = drawnTexture(768, 360, (c) => {
    c.fillStyle = '#f4f8f8'
    c.fillRect(0, 0, 768, 360)
    scrawl(c, tr('CONNAIS TON ENNEMI', 'KNOW YOUR ENEMY'), 200, 44, 34, C.marker, -0.02)
    c.fillStyle = C.red
    c.fillRect(200, 52, 330, 4)
    // Les trois photos, punaisées, légendées.
    const photos = [
      { x: 30, y: 80, kind: 'scout' as const, cap: 'HIP 17125 · A 3 A', sub: tr('scout', 'scout') },
      { x: 30, y: 215, kind: 'interceptor' as const, cap: 'HIP 17862 · 6 C A', sub: tr('intercepteur', 'interceptor') },
      { x: 560, y: 90, kind: 'base' as const, cap: tr('BASE ??', 'BASE ??'), sub: tr('comme un Titan !', 'like a Titan!') },
    ]
    const pins: [number, number][] = []
    for (const p of photos) {
      c.fillStyle = '#ffffff'
      c.fillRect(p.x, p.y, 170, 120)
      c.fillStyle = '#0d1418'
      c.fillRect(p.x + 8, p.y + 8, 154, 82)
      c.fillStyle = 'rgba(255,255,255,0.6)'
      for (let i = 0; i < 12; i++) c.fillRect(p.x + 12 + ((i * 37) % 146), p.y + 12 + ((i * 23) % 70), 1.5, 1.5)
      drawThargoid(c, p.kind, p.x + 85, p.y + 52, 26)
      c.fillStyle = C.marker
      c.font = '600 13px system-ui, sans-serif'
      c.fillText(p.cap, p.x + 10, p.y + 106)
      c.fillStyle = C.red
      c.beginPath()
      c.arc(p.x + 85, p.y + 4, 6, 0, Math.PI * 2)
      c.fill()
      pins.push([p.x + 85, p.y + 4])
      scrawl(c, p.sub, p.x + 100, p.y + 140, 17, C.tealDark)
    }
    // Les fils rouges : les trois sites, et la question au milieu.
    c.strokeStyle = C.red
    c.lineWidth = 2
    c.beginPath()
    c.moveTo(...pins[0])
    c.lineTo(...pins[2])
    c.moveTo(...pins[1])
    c.lineTo(...pins[2])
    c.moveTo(...pins[0])
    c.lineTo(...pins[1])
    c.stroke()
    // La menace qui menace (barrée), corrigée par James.
    scrawl(c, tr('la menace qui menace', 'the menacing menace'), 250, 120, 20, C.marker, 0)
    c.fillStyle = C.red
    c.fillRect(248, 112, 196, 3)
    scrawl(c, tr('→ le FLÉAU !', '→ the SCOURGE!'), 290, 150, 22, C.red, -0.06)
    scrawl(c, tr('Pour la science !', 'For science!'), 250, 200, 18, C.tealDark)
    scrawl(c, tr('Pour le progrès !', 'For progress!'), 270, 228, 18, C.tealDark)
    scrawl(c, tr('Pour l\'humanité !', 'For humanity!'), 290, 256, 18, C.tealDark)
    // Le QR code et son message en morse.
    const qx = 590, qy = 250
    c.fillStyle = '#ffe98a'
    c.fillRect(qx - 12, qy - 12, 104, 104)
    c.fillStyle = '#111'
    for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) if ((i * 7 + j * 13 + i * j) % 3 === 0) c.fillRect(qx + i * 9, qy + j * 9, 9, 9)
    for (const [ox, oy] of [[0, 0], [54, 0], [0, 54]]) {
      c.fillRect(qx + ox, qy + oy, 27, 27)
      c.fillStyle = '#ffe98a'
      c.fillRect(qx + ox + 5, qy + oy + 5, 17, 17)
      c.fillStyle = '#111'
      c.fillRect(qx + ox + 9, qy + oy + 9, 9, 9)
    }
    c.fillStyle = C.marker
    c.font = '700 16px monospace'
    c.fillText('·− −− ·− −··', 440, 300)
    scrawl(c, tr('= notre adresse !', '= our address!'), 440, 326, 16, C.tealDark)
    // Les gribouillis de Julia : Moustache, un cœur, sa signature.
    c.strokeStyle = '#6a3fb0'
    c.lineWidth = 3
    c.beginPath()
    c.arc(250, 312, 18, 0, Math.PI * 2)
    c.moveTo(236, 300)
    c.lineTo(240, 286)
    c.lineTo(246, 296)
    c.moveTo(254, 296)
    c.lineTo(260, 286)
    c.lineTo(264, 300)
    c.stroke()
    c.fillStyle = '#6a3fb0'
    c.fillRect(242, 308, 3, 3)
    c.fillRect(255, 308, 3, 3)
    scrawl(c, 'MOUSTACHE ♥', 276, 318, 18, '#6a3fb0', 0.04)
    scrawl(c, tr('Julia était là', 'Julia was here'), 276, 342, 14, '#6a3fb0', 0.03)
  })
  g.add(part(new THREE.PlaneGeometry(Wd, Hd), new THREE.MeshBasicMaterial({ map }), 0, Y, 0.032))
  return { solid: g }
}

/** Enseigne du labo, accrochée au mur : l'atome et l'étoile, « L.J.P.C. » et son nom en entier. */
const ljpcBanner: Builder = () => {
  const g = new THREE.Group()
  const map = drawnTexture(384, 160, (c) => {
    c.fillStyle = C.deep
    c.fillRect(0, 0, 384, 160)
    c.strokeStyle = C.teal
    c.lineWidth = 4
    c.strokeRect(6, 6, 372, 148)
    c.lineWidth = 3
    for (const a of [0, Math.PI / 3, -Math.PI / 3]) {
      c.beginPath()
      c.ellipse(70, 80, 46, 16, a, 0, Math.PI * 2)
      c.stroke()
    }
    c.fillStyle = '#ffd35a'
    c.beginPath()
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 6 : 14
      c.lineTo(70 + Math.cos(a) * r, 80 + Math.sin(a) * r)
    }
    c.fill()
    c.fillStyle = C.teal
    c.font = '800 44px system-ui, sans-serif'
    c.fillText('L.J.P.C.', 136, 78)
    c.fillStyle = '#cfeee6'
    c.font = '500 15px system-ui, sans-serif'
    c.fillText(tr('Laboratoire des Jeunes', 'Laboratory of Young'), 138, 106)
    c.fillText(tr('Prodiges Cosmiques', 'Cosmic Prodigies'), 138, 126)
  })
  g.add(box(0.62, 0.28, 0.025, lit(C.steelDark), 0, 0.78, 0.0125, 0.008))
  g.add(part(new THREE.PlaneGeometry(0.58, 0.24), new THREE.MeshBasicMaterial({ map }), 0, 0.78, 0.027))
  return { solid: g }
}

/** Photo encadrée de l'installation scientifique Amadioha et de sa naine blanche : « Chez nous ». */
const amadiohaPhoto: Builder = () => {
  const g = new THREE.Group()
  const map = drawnTexture(256, 200, (c) => {
    c.fillStyle = '#060a14'
    c.fillRect(0, 0, 256, 200)
    const dwarf = c.createRadialGradient(70, 60, 2, 70, 60, 70)
    dwarf.addColorStop(0, '#ffffff')
    dwarf.addColorStop(0.2, '#e4f0ff')
    dwarf.addColorStop(1, 'rgba(140, 180, 255, 0)')
    c.fillStyle = dwarf
    c.fillRect(0, 0, 160, 140)
    // Les jets de la naine blanche.
    c.strokeStyle = 'rgba(200, 225, 255, 0.5)'
    c.lineWidth = 4
    c.beginPath()
    c.moveTo(40, 10)
    c.lineTo(100, 110)
    c.stroke()
    // L'installation : anneau, moyeu, panneaux, et deux petites silhouettes au hublot.
    c.fillStyle = '#b9c1cc'
    c.fillRect(120, 110, 110, 14)
    c.fillRect(165, 80, 20, 70)
    c.strokeStyle = '#b9c1cc'
    c.lineWidth = 6
    c.beginPath()
    c.ellipse(175, 117, 60, 18, 0, 0, Math.PI * 2)
    c.stroke()
    c.fillStyle = '#ffd35a'
    c.fillRect(169, 92, 12, 10)
    c.fillStyle = '#222'
    c.fillRect(171, 96, 3, 6)
    c.fillRect(176, 97, 3, 5)
    c.fillStyle = C.paper
    c.fillRect(0, 164, 256, 36)
    scrawl(c, tr('Chez nous ♥', 'Home ♥'), 70, 190, 22, C.marker, 0)
  })
  g.add(box(0.4, 0.33, 0.025, lit('#c9a24a'), 0, 0.62, 0.0125, 0.008))
  g.add(part(new THREE.PlaneGeometry(0.36, 0.29), new THREE.MeshBasicMaterial({ map }), 0, 0.62, 0.027))
  return { solid: g }
}

// ---------------------------------------------------------------- le labo

/**
 * Paillasse adossée au mur : plan de travail blanc, microscope, portoir d'éprouvettes, bécher qui
 * bouillonne, boîtes de Petri où luit un échantillon, et l'écran d'analyse biomécanique. 1,1 × 0,5.
 */
const labBench: Builder = ({ random }) => {
  const g = new THREE.Group()
  const white = lit(C.bench), steel = lit(C.steel), dark = lit(C.steelDark)
  g.add(box(1.1, 0.04, 0.5, lit(C.white), 0, 0.42, 0, 0.01), box(1.06, 0.36, 0.46, white, 0, 0.2, -0.01, 0.01))
  g.add(box(1.1, 0.012, 0.012, glow(C.teal), 0, 0.395, 0.25))
  for (let i = 0; i < 3; i++) g.add(box(0.33, 0.3, 0.005, lit('#cdd9dc'), -0.36 + i * 0.36, 0.2, 0.222), box(0.06, 0.012, 0.012, steel, -0.36 + i * 0.36, 0.3, 0.228))
  // Microscope.
  g.add(box(0.12, 0.02, 0.14, dark, -0.36, 0.45, 0.04), cylinder(0.015, 0.015, 0.16, dark, -0.36, 0.53, -0.02, 8))
  const tube = cylinder(0.022, 0.018, 0.12, lit(C.white), -0.36, 0.6, 0.02, 10)
  tube.rotation.x = 0.5
  g.add(tube, box(0.08, 0.012, 0.08, steel, -0.36, 0.5, 0.05), sphere(0.02, glow(C.thargoidGlow), -0.36, 0.515, 0.05, 8))
  // Portoir et éprouvettes de couleurs.
  g.add(box(0.2, 0.015, 0.06, steel, -0.08, 0.5, 0.0), box(0.2, 0.015, 0.06, steel, -0.08, 0.46, 0.0))
  const liquids = ['#6aff9a', '#57e6c1', '#ff8a5a', '#b28aff', '#6aff9a']
  liquids.forEach((col, i) => {
    g.add(cylinder(0.011, 0.011, 0.05, glow(col), -0.16 + i * 0.04, 0.475, 0, 8))
  })
  // Boîtes de Petri.
  for (const [x, z] of [[0.12, 0.12], [0.2, 0.05], [0.12, -0.02]]) g.add(cylinder(0.035, 0.035, 0.012, glow(random() < 0.5 ? '#9dffc0' : C.thargoidGlow), x, 0.446, z, 14))
  // Écran d'analyse, au fond.
  g.add(box(0.36, 0.24, 0.02, dark, 0.3, 0.6, -0.2, 0.008), box(0.03, 0.14, 0.03, dark, 0.3, 0.5, -0.2))
  const screen = animatedScreen(192, 128, 8, (c, t) => {
    c.fillStyle = C.deep
    c.fillRect(0, 0, 192, 128)
    c.fillStyle = C.teal
    c.font = '600 11px system-ui, sans-serif'
    c.fillText(tr('ANALYSE BIOMÉCANIQUE', 'BIOMECHANICAL SCAN'), 8, 16)
    // Double hélice qui tourne.
    for (let i = 0; i < 22; i++) {
      const y = 28 + i * 4, a = t * 2 + i * 0.5
      c.fillStyle = C.thargoidGlow
      c.fillRect(50 + Math.sin(a) * 26, y, 3, 3)
      c.fillStyle = C.teal
      c.fillRect(50 - Math.sin(a) * 26, y, 3, 3)
    }
    c.fillStyle = '#cfeee6'
    c.font = '10px monospace'
    c.fillText(tr('ÉTAT : EXCELLENT', 'STATE: EXCELLENT'), 96, 44)
    c.fillText(tr('ÂGE : ~6 ANS', 'AGE: ~6 YRS'), 96, 60)
    c.fillStyle = C.teal
    c.fillRect(96, 74, 80, 6)
    c.fillStyle = C.thargoidGlow
    c.fillRect(96, 74, ((t * 12) % 80), 6)
  })
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(0.33, 0.21), new THREE.MeshBasicMaterial({ map: screen.texture }), 0.3, 0.6, -0.189))
  // Le bécher qui bouillonne sur sa plaque.
  g.add(box(0.1, 0.02, 0.1, dark, 0.44, 0.45, 0.12), box(0.06, 0.005, 0.06, glow('#ff6a3a'), 0.44, 0.461, 0.12))
  live.add(part(new THREE.CylinderGeometry(0.035, 0.035, 0.09, 12, 1, true), glass('#dff6ff', 0.3), 0.44, 0.51, 0.12))
  g.add(cylinder(0.032, 0.032, 0.05, glow('#8dffb8'), 0.44, 0.49, 0.12, 12))
  const bubbles = Array.from({ length: 5 }, (_, i) => {
    const b = sphere(0.007, glow('#e4fff0'), 0.44 + (i - 2) * 0.01, 0.5, 0.12, 6)
    live.add(b)
    return b
  })
  return {
    solid: g,
    live,
    update(t) {
      screen.tick(t)
      bubbles.forEach((b, i) => (b.position.y = 0.47 + ((t * 0.12 + i * 0.2) % 1) * 0.07))
    },
  }
}

/**
 * Échantillon sous cloche : un socle à bandes de danger, un cylindre de verre, et dedans un éclat
 * biomécanique thargoïde qui flotte, tourne et pulse en vert.
 */
const containmentPod: Builder = () => {
  const g = new THREE.Group()
  const dark = lit(C.steelDark)
  g.add(cylinder(0.22, 0.24, 0.14, dark, 0, 0.07, 0, 18), cylinder(0.225, 0.225, 0.02, lit('#e9a917'), 0, 0.12, 0, 18))
  g.add(cylinder(0.21, 0.21, 0.05, dark, 0, 0.8, 0, 18), cylinder(0.16, 0.16, 0.012, glow(C.thargoidGlow), 0, 0.14, 0, 18))
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    g.add(box(0.02, 0.66, 0.02, lit(C.steel), Math.cos(a) * 0.2, 0.47, Math.sin(a) * 0.2))
  }
  // Étiquette « NE PAS TOUCHER ».
  const label = drawnTexture(128, 48, (c) => {
    c.fillStyle = '#ffe98a'
    c.fillRect(0, 0, 128, 48)
    scrawl(c, tr('NE PAS TOUCHER', 'DO NOT TOUCH'), 6, 22, 14, C.red, 0)
    scrawl(c, tr('(toi aussi Moustache)', '(you too Moustache)'), 6, 40, 11, C.marker, 0)
  })
  g.add(part(new THREE.PlaneGeometry(0.16, 0.06), new THREE.MeshBasicMaterial({ map: label }), 0, 0.07, 0.232))
  const live = new THREE.Group()
  live.add(part(new THREE.CylinderGeometry(0.19, 0.19, 0.64, 20, 1, true), glass('#bfffe0', 0.18), 0, 0.46, 0))
  // L'éclat : des prismes sombres autour d'un cœur vert.
  const shard = new THREE.Group()
  shard.position.y = 0.46
  const core = mesh(new THREE.OctahedronGeometry(0.05, 0), glow(C.thargoidGlow))
  shard.add(core)
  for (let i = 0; i < 5; i++) {
    const p = mesh(new THREE.ConeGeometry(0.03, 0.16, 5), lit(C.thargoid), Math.cos(i * 1.26) * 0.05, (i % 2 ? -1 : 1) * 0.03, Math.sin(i * 1.26) * 0.05)
    p.rotation.set(i * 0.7, 0, (i % 2 ? 1 : -1) * (0.6 + i * 0.2))
    shard.add(p)
  }
  live.add(shard)
  const halo = part(new THREE.SphereGeometry(0.11, 12, 8), holoMaterial(null, C.thargoidGlow, 0.25, 0, true), 0, 0.46, 0)
  live.add(halo)
  return {
    solid: g,
    live,
    update(t) {
      shard.rotation.y = t * 0.6
      shard.position.y = 0.46 + Math.sin(t * 1.3) * 0.025
      halo.position.y = shard.position.y
      halo.scale.setScalar(0.9 + Math.sin(t * 2.2) * 0.12)
    },
  }
}

/**
 * Table holographique ronde, blanche et sarcelle : au-dessus, un intercepteur thargoïde en
 * hologramme vert tourne lentement, un anneau de balayage monte et descend.
 */
const holoThargoid: Builder = () => {
  const g = new THREE.Group()
  g.add(cylinder(0.28, 0.3, 0.05, lit(C.white), 0, 0.36, 0, 24), cylinder(0.08, 0.12, 0.34, lit(C.bench), 0, 0.17, 0, 12))
  g.add(cylinder(0.22, 0.22, 0.01, glow(C.teal), 0, 0.39, 0, 24), cylinder(0.2, 0.24, 0.03, lit(C.steelDark), 0, 0.015, 0, 18))
  const live = new THREE.Group()
  const ship = new THREE.Group()
  ship.position.y = 0.62
  // Mélange normal : en additif, l'hologramme disparaît sur les sols clairs du labo.
  const holo = holoMaterial(null, '#2fd07a', 0.8)
  for (let i = 0; i < 4; i++) {
    const petal = new THREE.Group()
    petal.rotation.y = (i * Math.PI) / 2
    const leaf = part(new THREE.SphereGeometry(0.1, 10, 6), holo, 0.11, 0, 0)
    leaf.scale.set(1, 0.18, 0.45)
    leaf.rotation.z = -0.25
    petal.add(leaf)
    ship.add(petal)
  }
  ship.add(part(new THREE.SphereGeometry(0.045, 10, 8), holo))
  live.add(ship)
  const ring = part(new THREE.TorusGeometry(0.2, 0.005, 4, 32), holoMaterial(null, C.tealDark, 0.9), 0, 0.5, 0)
  ring.rotation.x = Math.PI / 2
  live.add(ring)
  const beam = part(new THREE.CylinderGeometry(0.2, 0.22, 0.3, 20, 1, true), holoMaterial(null, C.tealDark, 0.22, 1), 0, 0.54, 0)
  live.add(beam)
  return {
    solid: g,
    live,
    update(t) {
      ship.rotation.y = t * 0.5
      ship.rotation.z = Math.sin(t * 0.7) * 0.12
      ring.position.y = 0.45 + ((Math.sin(t * 1.4) + 1) / 2) * 0.32
    },
  }
}

// ---------------------------------------------------------------- James et Julia

/** Tête d'enfant : grosse, ronde, deux yeux qui clignent. Renvoie la tête et ses yeux. */
function kidHead(skin: THREE.Material): { head: THREE.Group; eyes: THREE.Group; face: THREE.Group } {
  const head = new THREE.Group()
  const face = new THREE.Group()
  face.add(box(0.2, 0.19, 0.18, skin, 0, 0.09, 0, 0.045))
  face.add(box(0.024, 0.024, 0.02, skin, 0, 0.068, 0.095, 0.008))
  face.add(box(0.036, 0.005, 0.006, lit('#b0605a'), 0, 0.038, 0.09))
  for (const x of [-0.105, 0.105]) face.add(sphere(0.022, skin, x, 0.085, 0, 8))
  // Joues roses.
  for (const x of [-0.06, 0.06]) face.add(box(0.03, 0.014, 0.004, lit('#f2a3a0'), x, 0.058, 0.091))
  head.add(face)
  const eyes = new THREE.Group()
  eyes.position.set(0, 0.1, 0.092)
  for (const x of [-0.042, 0.042]) eyes.add(box(0.014, 0.02, 0.005, lit('#17222b'), x, 0, 0))
  head.add(eyes)
  return { head, eyes, face }
}

/** Bras d'enfant (manche, avant-bras, main) accroché à l'épaule. */
function kidArm(side: -1 | 1, sleeve: THREE.Material, skin: THREE.Material, y: number, long = false) {
  const shoulder = new THREE.Group()
  shoulder.position.set(side * 0.105, y, 0)
  shoulder.add(compact(new THREE.Group().add(box(0.06, 0.09, 0.06, sleeve, 0, -0.04, 0, 0.014))))
  const elbow = new THREE.Group()
  elbow.position.y = -0.085
  shoulder.add(elbow)
  const forearm = new THREE.Group()
  // Manches trop longues de la blouse de James : la main dépasse à peine.
  forearm.add(box(0.056, long ? 0.1 : 0.08, 0.056, sleeve, 0, long ? -0.045 : -0.035, 0, 0.012))
  forearm.add(box(0.045, 0.04, 0.045, skin, 0, long ? -0.105 : -0.09, 0, 0.012))
  elbow.add(compact(forearm))
  return { shoulder, elbow, forearm }
}

/**
 * James Hopper, l'aîné, « professeur » du L.J.P.C. : blouse blanche trop grande, lunettes rondes,
 * cheveux en bataille, tablette à la main. Debout, face à +z ; il montre son tableau (à sa gauche,
 * côté +x), regarde les visiteurs, reprend ses notes.
 */
function james(phase: number) {
  const root = new THREE.Group()
  const skin = lit('#e4b394'), coat = lit('#f6f8f8'), trousers = lit('#34425e'), hair = lit('#6b4428')
  const fixed = new THREE.Group()
  for (const x of [-0.045, 0.045]) fixed.add(box(0.06, 0.15, 0.07, trousers, x, 0.1, 0, 0.01), box(0.07, 0.04, 0.1, lit('#c0463a'), x, 0.02, 0.012, 0.012))
  // Pans de la blouse jusqu'aux genoux.
  fixed.add(box(0.19, 0.1, 0.12, coat, 0, 0.14, 0, 0.015))
  root.add(compact(fixed))
  const torso = new THREE.Group()
  torso.position.y = 0.19
  root.add(torso)
  const body = new THREE.Group()
  body.add(box(0.19, 0.17, 0.12, coat, 0, 0.08, 0, 0.02), box(0.05, 0.13, 0.006, lit('#57e6c1'), 0, 0.09, 0.062))
  body.add(box(0.045, 0.03, 0.008, lit(C.teal), 0.055, 0.12, 0.063), box(0.04, 0.04, 0.05, skin, 0, 0.175, 0))
  // Stylos dans la poche de poitrine.
  body.add(box(0.006, 0.03, 0.006, lit(C.red), -0.05, 0.13, 0.064), box(0.006, 0.03, 0.006, lit('#2f6bd8'), -0.04, 0.132, 0.064))
  torso.add(compact(body))
  const { head, eyes, face } = kidHead(skin)
  head.position.y = 0.18
  torso.add(head)
  // Cheveux en bataille et lunettes rondes.
  face.add(box(0.21, 0.06, 0.18, hair, 0, 0.18, -0.012, 0.025))
  for (let i = 0; i < 5; i++) {
    const tuft = box(0.04, 0.05, 0.04, hair, -0.07 + i * 0.035, 0.215, -0.02 + (i % 2) * 0.03, 0.01)
    tuft.rotation.z = (i - 2) * 0.25
    face.add(tuft)
  }
  for (const x of [-0.042, 0.042]) {
    const ring = mesh(new THREE.TorusGeometry(0.03, 0.005, 5, 14), lit('#2b2b33'), x, 0.1, 0.094)
    face.add(ring)
  }
  face.add(box(0.03, 0.006, 0.006, lit('#2b2b33'), 0, 0.105, 0.094))
  const [left, right] = [kidArm(1, coat, skin, 0.15, true), kidArm(-1, coat, skin, 0.15, true)]
  torso.add(left.shoulder, right.shoulder)
  // La tablette, dans la main droite.
  const tablet = new THREE.Group()
  tablet.position.set(0, -0.11, 0.04)
  tablet.add(box(0.1, 0.07, 0.008, lit(C.steelDark), 0, 0, 0, 0.004), box(0.085, 0.055, 0.004, glow('#8ff0ff'), 0, 0, 0.005))
  tablet.rotation.x = -1
  right.elbow.add(tablet)
  const update = (time: number) => {
    const t = time + phase
    torso.position.y = 0.19 + Math.sin(t * 2) * 0.003
    // Cycle de 9 s : il montre le tableau, regarde les visiteurs, relit ses notes.
    const k = t % 9
    const pointing = k < 3.2 ? Math.sin((k / 3.2) * Math.PI) : 0
    const reading = k > 5.5 ? Math.sin(((k - 5.5) / 3.5) * Math.PI) : 0
    head.rotation.y = pointing * 0.7 + Math.sin(t * 0.8) * 0.08
    head.rotation.x = reading * 0.35
    left.shoulder.rotation.x = -pointing * 1.3
    left.shoulder.rotation.z = pointing * 0.9
    left.elbow.rotation.x = -0.1 - pointing * 0.2
    right.shoulder.rotation.x = -0.35 - reading * 0.35
    right.elbow.rotation.x = -1.1
    eyes.scale.y = t % 4.3 < 0.12 ? 0.12 : 1
  }
  update(0)
  return { root, update }
}

/**
 * Julia, la petite sœur : assise en tailleur par terre, couettes nouées de sarcelle, pull violet à
 * étoile. Elle dessine (un Thargoïde que Moustache fait fuir), lève la tête, balance les couettes.
 * Face à +z ; sa feuille et ses feutres devant elle, sa peluche thargoïde à côté.
 */
function julia(phase: number) {
  const root = new THREE.Group()
  const skin = lit('#f0c3a2'), jumper = lit('#7a4fd0'), leggings = lit('#2e3550'), hair = lit('#e0a24a')
  const fixed = new THREE.Group()
  // Jambes croisées, pieds devant.
  for (const s of [-1, 1]) {
    const leg = box(0.16, 0.05, 0.06, leggings, s * 0.04, 0.03, 0.06, 0.015)
    leg.rotation.y = s * 0.45
    fixed.add(leg, box(0.05, 0.04, 0.07, lit('#ffd35a'), -s * 0.05, 0.025, 0.12, 0.012))
  }
  // La feuille de dessin, les feutres, et la peluche thargoïde.
  const drawing = drawnTexture(128, 96, (c) => {
    c.fillStyle = C.paper
    c.fillRect(0, 0, 128, 96)
    drawThargoid(c, 'interceptor', 44, 44, 26)
    c.strokeStyle = '#222'
    c.lineWidth = 3
    c.beginPath()
    c.arc(98, 62, 12, 0, Math.PI * 2)
    c.stroke()
    c.fillStyle = '#222'
    c.beginPath()
    c.arc(98, 62, 12, 0, Math.PI * 2)
    c.fill()
    c.fillRect(88, 46, 5, 8)
    c.fillRect(103, 46, 5, 8)
    scrawl(c, 'GRR!', 72, 90, 14, C.red, 0)
  })
  const sheet = part(new THREE.PlaneGeometry(0.2, 0.15), new THREE.MeshLambertMaterial({ map: drawing }), 0, 0.006, 0.25)
  sheet.rotation.x = -Math.PI / 2
  fixed.add(sheet)
  for (const [x, col] of [[0.13, C.red], [0.15, '#2f6bd8'], [0.17, '#3fb35a']] as const) {
    const pen = barX(0.007, 0.06, lit(col), x, 0.008, 0.22 + x - 0.13, 6)
    pen.rotation.y = 0.5
    fixed.add(pen)
  }
  const plush = new THREE.Group()
  plush.position.set(-0.17, 0, 0.1)
  for (let i = 0; i < 4; i++) {
    const p = box(0.07, 0.025, 0.035, lit('#3f4a44'), Math.cos(i * 1.57) * 0.035, 0.03, Math.sin(i * 1.57) * 0.035, 0.012)
    p.rotation.y = -i * 1.57
    plush.add(p)
  }
  plush.add(sphere(0.022, lit(C.thargoidGlow), 0, 0.045, 0, 8))
  fixed.add(plush)
  root.add(compact(fixed))
  const torso = new THREE.Group()
  torso.position.y = 0.06
  root.add(torso)
  const body = new THREE.Group()
  body.add(box(0.18, 0.16, 0.12, jumper, 0, 0.08, 0, 0.025), box(0.04, 0.04, 0.05, skin, 0, 0.165, 0))
  const star = box(0.035, 0.035, 0.006, lit('#ffd35a'), 0, 0.09, 0.062)
  star.rotation.z = Math.PI / 4
  body.add(star)
  torso.add(compact(body))
  const { head, eyes, face } = kidHead(skin)
  head.position.y = 0.17
  torso.add(head)
  // Frange, cheveux, couettes nouées de sarcelle.
  face.add(box(0.21, 0.055, 0.18, hair, 0, 0.18, -0.01, 0.025), box(0.2, 0.12, 0.05, hair, 0, 0.12, -0.08, 0.02))
  const tails: THREE.Group[] = []
  for (const s of [-1, 1]) {
    const tail = new THREE.Group()
    tail.position.set(s * 0.115, 0.15, -0.02)
    tail.add(box(0.03, 0.03, 0.03, lit(C.teal), 0, 0, 0, 0.008), box(0.045, 0.1, 0.045, hair, s * 0.012, -0.06, 0, 0.018))
    face.add(tail)
    tails.push(tail)
  }
  const [left, right] = [kidArm(1, jumper, skin, 0.14), kidArm(-1, jumper, skin, 0.14)]
  torso.add(left.shoulder, right.shoulder)
  // Le feutre, dans la main droite.
  right.elbow.add(barX(0.006, 0.05, lit(C.red), 0, -0.1, 0.02, 6))
  const update = (time: number) => {
    const t = time + phase
    // Cycle de 8 s : elle dessine penchée, puis lève la tête vers les visiteurs.
    const k = t % 8
    const looking = k > 5.6 ? Math.sin(((k - 5.6) / 2.4) * Math.PI) : 0
    const drawing = 1 - looking
    torso.rotation.x = 0.25 * drawing
    head.rotation.x = 0.35 * drawing - 0.1 * looking
    head.rotation.z = Math.sin(t * 1.1) * 0.08
    right.shoulder.rotation.x = -0.9 * drawing
    right.elbow.rotation.x = -0.6 + Math.sin(t * 9) * 0.12 * drawing
    right.shoulder.rotation.z = Math.sin(t * 6) * 0.1 * drawing
    left.shoulder.rotation.x = -0.6 * drawing
    left.elbow.rotation.x = -0.5
    for (const [i, tail] of tails.entries()) tail.rotation.z = Math.sin(t * 2.2 + i) * 0.15
    eyes.scale.y = t % 3.7 < 0.12 ? 0.12 : 1
  }
  update(0)
  return { root, update }
}

/**
 * James ou Julia (`label`), les deux jeunes prodiges du L.J.P.C. Un volume fixe et invisible sert
 * aux collisions et au clic ; les enfants, animés, sont à part.
 */
const ljpcKid: Builder = ({ label, random }) => {
  const girl = label === 'julia'
  const kid = girl ? julia(random() * 10) : james(random() * 10)
  // La partie fixe se réduit à une ombre au sol ; le volume couvre l'enfant (cf. `extent`).
  const g = new THREE.Group()
  g.add(cylinder(girl ? 0.16 : 0.1, girl ? 0.16 : 0.1, 0.004, lit('#1c2226'), 0, 0.002, girl ? 0.06 : 0, 16))
  const extent = girl
    ? new THREE.Box3(new THREE.Vector3(-0.2, 0, -0.1), new THREE.Vector3(0.2, 0.42, 0.3))
    : new THREE.Box3(new THREE.Vector3(-0.13, 0, -0.1), new THREE.Vector3(0.13, 0.62, 0.1))
  return { solid: g, live: kid.root, update: kid.update, extent }
}

export const LJPC = {
  'ljpc-board': ljpcBoard,
  'ljpc-banner': ljpcBanner,
  'amadioha-photo': amadiohaPhoto,
  'lab-bench': labBench,
  'containment-pod': containmentPod,
  'holo-thargoid': holoThargoid,
  'ljpc-kid': ljpcKid,
} satisfies Record<string, Builder>
