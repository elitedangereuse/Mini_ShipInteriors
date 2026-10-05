import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  barX, barZ, box, cylinder, drawnTexture, ED_ORANGE, glow, holoMaterial, instanced, keepShared, lit, mesh, part, setInstance,
  sphere, type Builder,
} from './kit'
import { LEAVES } from './cozy'
import { tr } from '../i18n'

/*
 * Souvenirs des aventures d'Élite Dangereuse (elitedangereuse.fr/aventures), pour les quartiers :
 * l'hologramme de Jacob Scarlett, le coffre de La Buse, la capsule de l'Odysseus, le Guide de
 * survie, la maquette du FNS Damocles, le portrait de la duchesse d'Adenates, le sapin de la Quête
 * de Noël, la bannière de la Voie, la boîte noire du Thetis et l'enseigne de TAXI Corp.
 * Mêmes conventions que decor.ts : face à +z, posé au sol ; accroché, dos au mur.
 */

const C = {
  wood: '#8a5a36',
  woodDark: '#5a3a24',
  brass: '#c9a24a',
  gold: '#e8b33a',
  cream: '#f1e6cf',
  steel: '#4f5866',
  steelDark: '#2a2e36',
  black: '#17181b',
  white: '#e8ecf0',
}

const printed = new Map<string, THREE.Material>()

/** Image dessinée une fois et partagée par tous les exemplaires ; `bright` : insensible à l'éclairage (enseigne). */
function print(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, bright = false): THREE.Material {
  let m = printed.get(key)
  if (!m) {
    const map = keepShared(drawnTexture(w, h, draw))
    m = keepShared(bright ? new THREE.MeshBasicMaterial({ map }) : new THREE.MeshLambertMaterial({ map }))
    printed.set(key, m)
  }
  return m
}

/** Hexagone régulier (pointe en haut) centré en (x, y). */
function hexagon(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
  }
  g.closePath()
}

/** Pièces fusionnées dont les « uv » suivent la hauteur : lignes de balayage horizontales (cf. leisure.ts). */
function holoBody(pieces: THREE.BufferGeometry[], height: number): THREE.BufferGeometry {
  const body = mergeGeometries(pieces.map((p) => (p.index ? p.toNonIndexed() : p)))!
  const pos = body.attributes.position
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) uv.set([pos.getX(i) + 0.5, pos.getY(i) / height], i * 2)
  body.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return body
}

// ---------------------------------------------------------------- La Disparition de Jacob Scarlett

/**
 * Hologramme commémoratif de l'officier Jacob Scarlett, sur son socle : un personnage aux
 * proportions de l'équipage, casquette de la sécurité de Ross 154, qui tourne lentement et
 * se brouille par moments.
 */
const scarlettHolo: Builder = () => {
  const g = new THREE.Group()
  g.add(cylinder(0.19, 0.22, 0.07, lit(C.steelDark, 'metal'), 0, 0.035, 0, 20), cylinder(0.17, 0.17, 0.012, lit(C.steel, 'metal'), 0, 0.076, 0, 20))
  const ring = mesh(new THREE.TorusGeometry(0.2, 0.008, 4, 32), glow('#6fd8ff'), 0, 0.055, 0)
  ring.rotation.x = Math.PI / 2
  g.add(ring)
  // Plaque : le nom, et la mention du GalNet.
  const plaque = print('scarlett-plaque', 192, 48, (c) => {
    c.fillStyle = '#1b2230'
    c.fillRect(0, 0, 192, 48)
    c.fillStyle = '#9fe6ff'
    c.textAlign = 'center'
    c.font = '800 17px system-ui, sans-serif'
    c.fillText('JACOB SCARLETT', 96, 22)
    c.fillStyle = '#6f8aa6'
    c.font = '600 11px system-ui, sans-serif'
    c.fillText(tr('SÉCURITÉ · ROSS 154', 'SECURITY · ROSS 154'), 96, 39)
  })
  const front = mesh(new THREE.PlaneGeometry(0.16, 0.04), plaque, 0, 0.037, 0.207)
  front.rotation.x = -0.14
  g.add(front)
  const body = holoBody(
    [
      // Bottes, jambes, ceinturon, veste, épaulettes, bras.
      new THREE.BoxGeometry(0.07, 0.05, 0.1).translate(-0.045, 0.025, 0.01),
      new THREE.BoxGeometry(0.07, 0.05, 0.1).translate(0.045, 0.025, 0.01),
      new THREE.BoxGeometry(0.064, 0.16, 0.075).translate(-0.045, 0.13, 0),
      new THREE.BoxGeometry(0.064, 0.16, 0.075).translate(0.045, 0.13, 0),
      new THREE.BoxGeometry(0.2, 0.03, 0.12).translate(0, 0.225, 0),
      new THREE.BoxGeometry(0.19, 0.19, 0.11).translate(0, 0.33, 0),
      new THREE.BoxGeometry(0.06, 0.02, 0.1).translate(-0.12, 0.42, 0),
      new THREE.BoxGeometry(0.06, 0.02, 0.1).translate(0.12, 0.42, 0),
      new THREE.BoxGeometry(0.055, 0.19, 0.065).rotateZ(-0.08).translate(-0.125, 0.32, 0),
      new THREE.BoxGeometry(0.055, 0.19, 0.065).rotateZ(0.08).translate(0.125, 0.32, 0),
      // Tête, casquette et sa visière.
      new THREE.BoxGeometry(0.04, 0.03, 0.04).translate(0, 0.44, 0),
      new THREE.BoxGeometry(0.19, 0.18, 0.16).translate(0, 0.54, 0),
      new THREE.BoxGeometry(0.205, 0.055, 0.18).translate(0, 0.655, -0.005),
      new THREE.BoxGeometry(0.19, 0.012, 0.07).rotateX(0.18).translate(0, 0.63, 0.105),
    ],
    0.69,
  )
  const live = new THREE.Group()
  const figure = new THREE.Group()
  figure.position.y = 0.085
  figure.add(part(body, holoMaterial(null, '#6fd8ff', 0.55), 0, 0, 0))
  // Insigne de la sécurité et regard, plus vifs que le reste.
  figure.add(part(new THREE.CircleGeometry(0.016, 6), glow('#d8f6ff'), 0, 0.66, 0.086))
  for (const x of [-0.04, 0.04]) figure.add(part(new THREE.PlaneGeometry(0.018, 0.026), glow('#d8f6ff'), x, 0.55, 0.081))
  live.add(figure)
  const beam = part(new THREE.CylinderGeometry(0.15, 0.17, 0.72, 20, 1, true), holoMaterial(null, '#6fd8ff', 0.12, 1, true), 0, 0.44, 0)
  live.add(beam)
  return {
    solid: g,
    live,
    update: (t) => {
      figure.rotation.y = Math.sin(t * 0.35) * 0.9
      // Un parasite toutes les quelques secondes : la silhouette se décale et s'étire.
      const glitch = Math.sin(t * 0.9) > 0.985 || Math.sin(t * 2.3 + 1) > 0.995
      figure.scale.set(glitch ? 1.12 : 1, glitch ? 0.96 : 1, 1)
      figure.position.x = glitch ? 0.012 : 0
    },
  }
}

// ---------------------------------------------------------------- Le Trésor de La Buse

/** Le coffre de La Buse, ouvert sur ses doublons, ses rubis et ses émeraudes (qui scintillent). */
const treasureChest: Builder = ({ random }) => {
  const g = new THREE.Group()
  const wood = lit(C.wood, 'wood'), brass = lit(C.brass, 'metal'), gold = lit(C.gold, 'metal')
  const W = 0.42, D = 0.26, H = 0.2
  g.add(box(W, H, D, wood, 0, H / 2, 0, 0.01))
  for (const x of [-0.14, 0.14]) g.add(box(0.03, H + 0.004, D + 0.006, brass, x, H / 2, 0))
  g.add(box(W + 0.006, 0.02, D + 0.006, lit(C.woodDark, 'wood'), 0, 0.012, 0))
  // Serrure et tête de mort.
  g.add(box(0.07, 0.08, 0.012, brass, 0, 0.14, D / 2 + 0.006, 0.006))
  g.add(sphere(0.02, lit('#f4efe2'), 0, 0.15, D / 2 + 0.014, 10), box(0.018, 0.012, 0.01, lit('#f4efe2'), 0, 0.128, D / 2 + 0.014))
  for (const x of [-0.008, 0.008]) g.add(sphere(0.005, lit(C.black), x, 0.153, D / 2 + 0.031, 6))
  // Couvercle bombé, ouvert vers l'arrière autour de sa charnière.
  const lid = new THREE.Group()
  lid.position.set(0, H, -D / 2)
  const dome = mesh(new THREE.CylinderGeometry(D / 2, D / 2, W, 16, 1, false, 0, Math.PI), wood, 0, 0, D / 2)
  dome.rotation.z = Math.PI / 2
  lid.add(dome)
  for (const x of [-0.14, 0.14]) {
    const band = mesh(new THREE.CylinderGeometry(D / 2 + 0.004, D / 2 + 0.004, 0.03, 16, 1, true, 0, Math.PI), brass, x, 0, D / 2)
    band.rotation.z = Math.PI / 2
    lid.add(band)
  }
  lid.add(box(W, 0.004, D, lit('#6b1f2a'), 0, 0.002, D / 2))
  lid.rotation.x = -1.95
  g.add(lid)
  // Le trésor : un tas de pièces qui déborde, quelques pièces tombées au sol.
  const heap = mesh(new THREE.SphereGeometry(0.17, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), gold, 0, H - 0.05, 0)
  heap.scale.set(1.15, 0.45, 0.72)
  g.add(heap)
  const coin = new THREE.CylinderGeometry(0.018, 0.018, 0.005, 10)
  for (let i = 0; i < 16; i++) {
    const a = random() * Math.PI * 2, r = random() * 0.14
    const c = mesh(coin, gold, Math.cos(a) * r, H + 0.02 + random() * 0.03, Math.sin(a) * r * 0.55)
    c.rotation.set(random() - 0.5, 0, random() - 0.5)
    g.add(c)
  }
  for (const [x, z] of [[0.26, 0.1], [0.3, 0.02], [0.24, 0.2], [-0.25, 0.17]]) g.add(mesh(coin, gold, x, 0.003, z))
  const live = new THREE.Group()
  const gems: [string, number, number, number][] = [['#ff3355', -0.08, H + 0.06, 0.03], ['#3dff9a', 0.09, H + 0.05, -0.02], ['#5ab4ff', 0.02, H + 0.075, 0.05]]
  const jewels = gems.map(([color, x, y, z]) => part(new THREE.OctahedronGeometry(0.022), glow(color), x, y, z))
  live.add(...jewels)
  // Éclats de lumière sur l'or.
  const sparkle = new THREE.PlaneGeometry(0.035, 0.035)
  const glints = instanced(sparkle, ['#fff6c8', '#fff6c8', '#fff6c8', '#fff6c8'], new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }))
  const spots = [[-0.1, 0.24, 0.05], [0.06, 0.26, -0.03], [0.13, 0.23, 0.04], [-0.02, 0.27, 0.0]].map(([x, y, z]) => ({ x, y, z, phase: random() * 6 }))
  live.add(glints)
  return {
    solid: g,
    live,
    update: (t) => {
      spots.forEach((s, i) => setInstance(glints, i, s.x, s.y, s.z, Math.max(0, Math.sin(t * 2.2 + s.phase)) ** 6, t + i))
      glints.instanceMatrix.needsUpdate = true
      jewels.forEach((j, i) => (j.rotation.y = t * 0.8 + i * 2))
    },
  }
}

// ---------------------------------------------------------------- Le Sauvetage de l'Odysseus

/** Capsule de survie de l'expédition Odysseus : coque blanche cabossée, hublot éclairé, balise qui clignote. */
const escapePod: Builder = () => {
  const g = new THREE.Group()
  const hull = lit('#dfe3e8'), orange = lit('#e0701e'), dark = lit(C.steelDark, 'metal')
  const R = 0.17, L = 0.5
  const shell = mesh(new THREE.CapsuleGeometry(R, L, 6, 18), hull, 0, R + 0.04, 0)
  shell.rotation.z = Math.PI / 2
  g.add(shell)
  for (const x of [-0.13, 0.13]) {
    const band = barX(R + 0.006, 0.05, orange, x, R + 0.04, 0, 20)
    g.add(band)
  }
  // Patins, un peu enfoncés : la capsule s'est posée durement.
  for (const x of [-0.22, 0.22]) g.add(box(0.05, 0.04, 0.3, dark, x, 0.02, 0))
  // Hublot et son cadre, du côté de la face.
  const frame = barZ(0.07, 0.02, dark, 0.02, R + 0.07, R - 0.015, 18)
  frame.rotation.x = Math.PI / 2 - 0.45
  g.add(frame)
  const glassPane = part(new THREE.CircleGeometry(0.055, 18), glow('#8fe8ff'), 0.02, R + 0.075, R - 0.001)
  glassPane.rotation.x = -0.45
  g.add(glassPane)
  // Écoutille et marquage.
  const plate = print('odysseus-plate', 160, 40, (c) => {
    c.fillStyle = '#dfe3e8'
    c.fillRect(0, 0, 160, 40)
    c.fillStyle = '#20242c'
    c.textAlign = 'center'
    c.font = '800 20px system-ui, sans-serif'
    c.fillText('ODYSSEUS', 80, 22)
    c.font = '600 10px system-ui, sans-serif'
    c.fillText(tr('CAPSULE 02 · SOS', 'POD 02 · SOS'), 80, 35)
  })
  const label = mesh(new THREE.PlaneGeometry(0.16, 0.04), plate, -0.2, R + 0.08, R - 0.03)
  label.rotation.set(-0.45, -0.25, 0)
  g.add(label)
  g.add(box(0.006, 0.12, 0.004, dark, -0.1, R + 0.07, R + 0.006), box(0.006, 0.12, 0.004, dark, 0.14, R + 0.07, R + 0.006))
  // Balise de détresse.
  g.add(cylinder(0.018, 0.022, 0.04, dark, 0.12, 2 * R + 0.06, 0, 8))
  const live = new THREE.Group()
  const beacon = part(new THREE.SphereGeometry(0.018, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff3b2f' }), 0.12, 2 * R + 0.09, 0)
  const halo = part(new THREE.SphereGeometry(0.05, 12, 8), holoMaterial(null, '#ff3b2f', 0.25, 0, true), 0.12, 2 * R + 0.09, 0)
  live.add(beacon, halo)
  const off = new THREE.Color('#5a1410'), on = new THREE.Color('#ff3b2f')
  return {
    solid: g,
    live,
    update: (t) => {
      const lit = (t % 1.6) < 0.25
      ;(beacon.material as THREE.MeshBasicMaterial).color.copy(lit ? on : off)
      halo.visible = lit
    },
  }
}

// ---------------------------------------------------------------- Les Pages Perdues du Guide de Survie

/** Le Guide de survie, ouvert, avec deux de ses onze pages retrouvées glissées à côté. */
const survivalGuide: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.21, 0.012, 0.15, lit('#7a1f22'), 0, 0.006, 0, 0.004))
  const pages = print('guide-pages', 256, 176, (c) => {
    c.fillStyle = '#f3ead2'
    c.fillRect(0, 0, 256, 176)
    c.fillStyle = 'rgba(90, 60, 30, 0.18)'
    c.fillRect(124, 0, 8, 176)
    c.fillStyle = '#7a1f22'
    c.font = '800 13px Georgia, serif'
    c.fillText(tr('GUIDE DE SURVIE', 'SURVIVAL GUIDE'), 14, 22)
    c.fillText('Page 7', 196, 22)
    c.fillStyle = '#6b5a45'
    for (let y = 36; y < 166; y += 9) {
      c.fillRect(14, y, 60 + ((y * 37) % 46), 2)
      if (y < 90 || y > 132) c.fillRect(140, y, 70 + ((y * 53) % 36), 2)
    }
    // Un schéma : une planète et la trajectoire d'approche.
    c.strokeStyle = '#7a1f22'
    c.lineWidth = 2
    c.beginPath()
    c.arc(176, 112, 16, 0, Math.PI * 2)
    c.stroke()
    c.setLineDash([4, 3])
    c.beginPath()
    c.moveTo(140, 96)
    c.quadraticCurveTo(170, 86, 196, 104)
    c.stroke()
  })
  for (const side of [-1, 1]) {
    const block = new THREE.Group()
    block.position.set(side * 0.052, 0.022, 0)
    block.rotation.z = side * -0.07
    block.add(box(0.1, 0.018, 0.138, lit(C.cream)))
    const face = mesh(new THREE.PlaneGeometry(0.1, 0.138), pages, 0, 0.0095, 0)
    face.rotation.x = -Math.PI / 2
    // Chaque moitié montre sa page du double.
    const uv = face.geometry.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setX(i, side < 0 ? uv.getX(i) * 0.5 : 0.5 + uv.getX(i) * 0.5)
    block.add(face)
    g.add(block)
  }
  g.add(box(0.008, 0.002, 0.07, lit(ED_ORANGE), 0.01, 0.034, 0.1))
  const loose = print('guide-loose', 96, 128, (c) => {
    c.fillStyle = '#efe4c8'
    c.fillRect(0, 0, 96, 128)
    c.fillStyle = '#6b5a45'
    for (let y = 18; y < 120; y += 8) c.fillRect(8, y, 50 + ((y * 29) % 30), 2)
    c.fillStyle = '#7a1f22'
    c.font = '800 12px Georgia, serif'
    c.fillText('p. 11', 56, 14)
  })
  for (const [x, z, a] of [[0.15, 0.04, 0.5], [0.13, -0.06, -0.3]]) {
    const sheet = mesh(new THREE.PlaneGeometry(0.07, 0.093), loose, x, 0.002 + (a > 0 ? 0.001 : 0), z)
    sheet.rotation.set(-Math.PI / 2, 0, a)
    g.add(sheet)
  }
  return { solid: g }
}

// ---------------------------------------------------------------- Le Détournement du FNS Damocles

/** Maquette du croiseur fédéral FNS Damocles (classe Farragut) sur son socle, réacteurs allumés. */
const damoclesModel: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.14, 0.022, 0.08, lit(C.woodDark, 'wood'), 0, 0.011, 0, 0.006), box(0.07, 0.014, 0.003, lit(C.brass, 'metal'), 0, 0.012, 0.041))
  g.add(cylinder(0.004, 0.004, 0.08, lit('#b9c1cc'), 0, 0.06, 0, 6))
  const ship = new THREE.Group()
  ship.position.set(0, 0.11, 0)
  ship.rotation.set(0, 0.35, 0.05)
  const navy = lit('#2c3f63'), pale = lit('#c9d2de'), dark = lit(C.steelDark, 'metal')
  // Coque : longue et étroite, proue en biseau, pont supérieur clair.
  ship.add(box(0.28, 0.036, 0.07, navy, -0.02, 0, 0))
  // Proue en coin : un tronc de pyramide aplati, pointé vers +x.
  const bow = mesh(new THREE.CylinderGeometry(0.014, 0.05, 0.09, 4, 1).rotateY(Math.PI / 4), navy, 0.165, 0, 0)
  bow.rotation.z = -Math.PI / 2
  bow.scale.set(0.72, 1, 0.72)
  ship.add(bow)
  ship.add(box(0.22, 0.012, 0.05, pale, -0.03, 0.023, 0), box(0.24, 0.01, 0.084, dark, -0.03, -0.018, 0))
  // Château de commandement et dérive, à l'arrière.
  ship.add(box(0.05, 0.04, 0.03, pale, -0.09, 0.045, 0), box(0.07, 0.008, 0.05, navy, -0.09, 0.068, 0))
  const fin = box(0.06, 0.05, 0.006, navy, -0.13, 0.05, 0)
  fin.rotation.z = 0.35
  ship.add(fin)
  for (const z of [-0.042, 0.042]) ship.add(box(0.12, 0.02, 0.018, dark, -0.07, -0.004, z))
  // Réacteurs.
  for (const z of [-0.022, 0, 0.022]) ship.add(barX(0.011, 0.012, glow('#7fc8ff'), -0.166, 0, z, 10))
  ship.add(box(0.03, 0.006, 0.004, glow('#ff4a3a'), 0.05, 0.008, 0.036))
  g.add(ship)
  return { solid: g }
}

// ---------------------------------------------------------------- Une duchesse d'Adenates en détresse

/** Portrait officiel de la duchesse d'Adenates, dans un cadre doré à la mode de la cour impériale. */
const duchessPortrait: Builder = () => {
  const g = new THREE.Group()
  const gilt = lit('#c8a042')
  g.add(box(0.44, 0.56, 0.03, gilt, 0, 0.68, 0.015, 0.008), box(0.4, 0.52, 0.006, lit('#7a5a1c'), 0, 0.68, 0.031))
  for (const [x, y] of [[-0.2, 0.94], [0.2, 0.94], [-0.2, 0.42], [0.2, 0.42]]) g.add(sphere(0.022, gilt, x, y, 0.028, 8))
  const art = print('duchess', 192, 256, (c) => {
    const bg = c.createRadialGradient(96, 100, 20, 96, 128, 170)
    bg.addColorStop(0, '#5a4a6e')
    bg.addColorStop(1, '#1d1626')
    c.fillStyle = bg
    c.fillRect(0, 0, 192, 256)
    // Draperie impériale.
    c.fillStyle = '#4a1f55'
    c.beginPath()
    c.moveTo(0, 0)
    c.quadraticCurveTo(50, 60, 22, 256)
    c.lineTo(0, 256)
    c.fill()
    // Robe blanche, écharpe pourpre, épaules.
    c.fillStyle = '#f2eee6'
    c.beginPath()
    c.moveTo(28, 256)
    c.quadraticCurveTo(40, 176, 96, 170)
    c.quadraticCurveTo(152, 176, 164, 256)
    c.fill()
    c.fillStyle = '#6b2a86'
    c.beginPath()
    c.moveTo(60, 182)
    c.lineTo(80, 180)
    c.lineTo(150, 256)
    c.lineTo(122, 256)
    c.fill()
    c.fillStyle = '#e0b84a'
    c.beginPath()
    c.arc(90, 200, 6, 0, Math.PI * 2)
    c.fill()
    // Cou, visage, coiffure relevée.
    c.fillStyle = '#e9c4a4'
    c.fillRect(86, 140, 20, 34)
    c.beginPath()
    c.ellipse(96, 118, 28, 36, 0, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = '#2b1a14'
    c.beginPath()
    c.ellipse(96, 88, 34, 24, 0, Math.PI, Math.PI * 2)
    c.fill()
    c.beginPath()
    c.arc(96, 64, 16, 0, Math.PI * 2)
    c.fill()
    c.fillRect(62, 86, 10, 34)
    c.fillRect(120, 86, 10, 34)
    // Diadème et son joyau.
    c.fillStyle = '#e0b84a'
    c.beginPath()
    c.moveTo(72, 86)
    c.lineTo(84, 74)
    c.lineTo(96, 82)
    c.lineTo(108, 74)
    c.lineTo(120, 86)
    c.closePath()
    c.fill()
    c.fillStyle = '#4ad0ff'
    c.beginPath()
    c.arc(96, 80, 3.5, 0, Math.PI * 2)
    c.fill()
    // Regard inquiet, lèvres pincées.
    c.fillStyle = '#2b1a14'
    c.fillRect(82, 116, 9, 3)
    c.fillRect(102, 116, 9, 3)
    c.fillStyle = '#a4545a'
    c.fillRect(90, 136, 13, 3)
    // Cartouche.
    c.fillStyle = 'rgba(0,0,0,0.45)'
    c.fillRect(40, 232, 112, 18)
    c.fillStyle = '#e0b84a'
    c.textAlign = 'center'
    c.font = '700 11px Georgia, serif'
    c.fillText(tr('DUCHESSE D’ADENATES', 'DUCHESS OF ADENATES'), 96, 245)
  })
  g.add(mesh(new THREE.PlaneGeometry(0.36, 0.48), art, 0, 0.68, 0.0345))
  return { solid: g }
}

// ---------------------------------------------------------------- La Quête de Noël

const ORNAMENTS = ['#d6263a', '#e8b33a', '#3a7bd5', '#e8ecf0', '#d6263a', '#e8b33a']

/** Le sapin de la Quête de Noël : boules, guirlande qui clignote, étoile, et les jouets de Sandra Corrs au pied. */
const christmasTree: Builder = ({ random }) => {
  const g = new THREE.Group()
  g.add(cylinder(0.09, 0.075, 0.1, lit('#a0282e'), 0, 0.05, 0, 12), cylinder(0.03, 0.03, 0.1, lit(C.woodDark, 'wood'), 0, 0.14, 0, 8))
  const tiers: [number, number, number][] = [[0.25, 0.3, 0.3], [0.2, 0.26, 0.5], [0.14, 0.22, 0.68]]
  const green = [lit(LEAVES[1] ?? '#2f6b3a'), lit('#2a5e34'), lit('#34743f')]
  tiers.forEach(([r, h, y], i) => g.add(mesh(new THREE.ConeGeometry(r, h, 10), green[i], 0, y, 0)))
  // Boules, posées sur la surface des cônes.
  const at = (tier: number, a: number, k: number) => {
    const [r, h, y] = tiers[tier]
    const f = 0.15 + k * 0.55
    return [Math.cos(a) * r * f * 1.02, y + h / 2 - h * f, Math.sin(a) * r * f * 1.02] as const
  }
  for (let i = 0; i < 16; i++) {
    const [x, y, z] = at(i % 3, random() * Math.PI * 2, 0.35 + random() * 0.6)
    g.add(sphere(0.022, lit(ORNAMENTS[i % ORNAMENTS.length]), x, y - 0.012, z, 8))
  }
  // Étoile.
  const star = new THREE.Shape()
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.026 : 0.06
    if (i) star.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    else star.moveTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  g.add(mesh(new THREE.ExtrudeGeometry(star, { depth: 0.014, bevelEnabled: false }), glow('#ffd35a'), 0, 0.84, -0.007))
  // Cadeaux.
  const gifts: [number, number, number, number, string, string][] = [
    [0.2, 0.1, 0.12, 0.12, '#3a7bd5', '#e8ecf0'], [-0.2, 0.08, 0.14, 0.1, '#2e8b57', '#d6263a'], [0.02, 0.07, 0.1, 0.24, '#d6263a', '#e8b33a'],
  ]
  for (const [x, z, s, h, paper, ribbon] of gifts) {
    g.add(box(s, h, s, lit(paper), x, h / 2, z), box(s + 0.002, h + 0.002, 0.018, lit(ribbon), x, h / 2, z), box(0.018, h + 0.002, s + 0.002, lit(ribbon), x, h / 2, z))
    g.add(sphere(0.018, lit(ribbon), x, h + 0.01, z, 6))
  }
  // Guirlande : deux séries d'ampoules qui s'allument l'une après l'autre.
  const live = new THREE.Group()
  const bulb = new THREE.SphereGeometry(0.011, 6, 4)
  const series = [instanced(bulb, Array(12).fill('#ffcf6a')), instanced(bulb, Array(12).fill('#ff6a8a'))]
  let n = 0
  for (let tier = 0; tier < 3; tier++) {
    for (let i = 0; i < 8; i++) {
      const [x, y, z] = at(tier, (i / 8) * Math.PI * 2 + tier, 0.75 - (i / 8) * 0.25)
      setInstance(series[n % 2], Math.floor(n / 2), x * 1.03, y, z * 1.03)
      n++
    }
  }
  live.add(...series)
  return {
    solid: g,
    live,
    update: (t) => {
      const on = Math.floor(t * 1.5) % 2
      series[0].visible = on === 0
      series[1].visible = on === 1
    },
  }
}

// ---------------------------------------------------------------- La Voie (Épreuve, Cérémonie, Reliques)

/** Bannière de la Voie : le symbole de Raxxla, noir sur vert, au bout d'une hampe dorée. */
const pathBanner: Builder = () => {
  const g = new THREE.Group()
  // Tout reste sous 1 m, la hauteur des murs des cabines (cf. rules.ts).
  g.add(barX(0.01, 0.44, lit(C.brass, 'metal'), 0, 0.96, 0.03, 8))
  for (const x of [-0.22, 0.22]) g.add(sphere(0.018, lit(C.brass, 'metal'), x, 0.96, 0.03, 8), box(0.012, 0.03, 0.03, lit(C.brass, 'metal'), x * 0.8, 0.96, 0.015))
  // Étoffe à pointe, tracée en forme : ses uv suivent la position.
  const shape = new THREE.Shape()
  shape.moveTo(-0.18, 0)
  shape.lineTo(0.18, 0)
  shape.lineTo(0.18, -0.6)
  shape.lineTo(0, -0.7)
  shape.lineTo(-0.18, -0.6)
  shape.closePath()
  const cloth = new THREE.ShapeGeometry(shape)
  const pos = cloth.attributes.position, uv = cloth.attributes.uv
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + 0.18) / 0.36, 1 + pos.getY(i) / 0.7)
  const art = print('path-banner', 180, 350, (c) => {
    const bg = c.createLinearGradient(0, 0, 0, 350)
    bg.addColorStop(0, '#1f8a6a')
    bg.addColorStop(1, '#0f4d3b')
    c.fillStyle = bg
    c.fillRect(0, 0, 180, 350)
    c.fillStyle = 'rgba(255,255,255,0.05)'
    for (let x = 0; x < 180; x += 12) c.fillRect(x, 0, 4, 350)
    c.strokeStyle = '#e0b84a'
    c.lineWidth = 4
    c.strokeRect(10, 10, 160, 280)
    // Le symbole : six pétales autour d'un hexagone en pointillés, cercles au centre.
    const x = 90, y = 140
    c.fillStyle = '#0b1210'
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6
      c.save()
      c.translate(x + Math.cos(a) * 52, y + Math.sin(a) * 52)
      c.rotate(a + Math.PI / 2)
      c.beginPath()
      c.moveTo(-20, -12)
      c.lineTo(20, -12)
      c.lineTo(13, 14)
      c.lineTo(-13, 14)
      c.closePath()
      c.fill()
      c.restore()
    }
    c.strokeStyle = '#0b1210'
    c.lineWidth = 3
    c.setLineDash([6, 4])
    hexagon(c, x, y, 36)
    c.stroke()
    c.setLineDash([])
    c.beginPath()
    c.arc(x, y, 16, 0, Math.PI * 2)
    c.stroke()
    c.fillStyle = '#0b1210'
    c.beginPath()
    c.arc(x, y, 7, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = '#e0b84a'
    c.textAlign = 'center'
    c.font = '700 14px Georgia, serif'
    c.fillText(tr('LA VOIE', 'THE PATH'), 90, 250)
    c.font = 'italic 11px Georgia, serif'
    c.fillText(tr('Que la lumière te guide', 'May the light guide you'), 90, 270)
  })
  g.add(mesh(cloth, art, 0, 0.95, 0.03))
  return { solid: g }
}

// ---------------------------------------------------------------- L'Écho du Thetis

/** Boîte noire du Thetis (orange, comme toutes les « boîtes noires ») : son écho s'échappe encore en ondes. */
const thetisBlackbox: Builder = () => {
  const g = new THREE.Group()
  const orange = lit('#e0701e'), dark = lit(C.black)
  g.add(box(0.16, 0.1, 0.11, orange, 0, 0.05, 0, 0.012))
  for (const x of [-0.05, 0.05]) g.add(box(0.012, 0.102, 0.112, dark, x, 0.05, 0))
  const stencil = print('thetis', 128, 64, (c) => {
    c.fillStyle = '#e0701e'
    c.fillRect(0, 0, 128, 64)
    c.fillStyle = '#17181b'
    c.textAlign = 'center'
    c.font = '800 20px system-ui, sans-serif'
    c.fillText('THETIS', 64, 28)
    c.font = '700 9px system-ui, sans-serif'
    c.fillText(tr('ENREGISTREUR DE VOL', 'FLIGHT RECORDER'), 64, 44)
    c.fillText(tr('NE PAS OUVRIR', 'DO NOT OPEN'), 64, 56)
  })
  g.add(mesh(new THREE.PlaneGeometry(0.076, 0.07), stencil, 0, 0.05, 0.0561))
  const handle = mesh(new THREE.TorusGeometry(0.03, 0.006, 5, 12, Math.PI), lit(C.steel, 'metal'), 0, 0.1, 0)
  g.add(handle, box(0.02, 0.012, 0.012, lit(C.steel, 'metal'), -0.065, 0.02, 0.056))
  const live = new THREE.Group()
  const led = part(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff3b2f' }), 0.062, 0.088, 0.057)
  live.add(led)
  const waves = [0, 1, 2].map(() => {
    const m = holoMaterial(null, '#8ff0ff', 0.6, 0, true)
    const ring = part(new THREE.TorusGeometry(0.05, 0.003, 4, 32), m, 0, 0.13, 0)
    ring.rotation.x = Math.PI / 2
    live.add(ring)
    return { ring, m }
  })
  return {
    solid: g,
    live,
    update: (t) => {
      led.visible = t % 1.2 < 0.15
      waves.forEach(({ ring, m }, i) => {
        const k = (t * 0.45 + i / 3) % 1
        ring.scale.setScalar(0.6 + k * 2.2)
        ring.position.y = 0.12 + k * 0.05
        m.uniforms.uOpacity.value = (1 - k) * 0.7
      })
    },
  }
}

// ---------------------------------------------------------------- Taxi Driver

/** Enseigne lumineuse de TAXI Corp., jaune et damier, comme sur le toit des taxis. */
const taxiSign: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.56, 0.2, 0.08, lit(C.steelDark, 'metal'), 0, 0.8, 0.04, 0.02))
  for (const x of [-0.2, 0.2]) g.add(box(0.03, 0.05, 0.03, lit(C.steel, 'metal'), x, 0.68, 0.02))
  const face = print('taxi', 256, 80, (c) => {
    c.fillStyle = '#ffd23a'
    c.fillRect(0, 0, 256, 80)
    c.fillStyle = '#17181b'
    for (let i = 0; i < 32; i++) c.fillRect(i * 8, i % 2 ? 70 : 62, 8, 8)
    c.textAlign = 'center'
    c.font = '900 44px system-ui, sans-serif'
    c.fillText('TAXI', 118, 48)
    c.font = '800 13px system-ui, sans-serif'
    c.fillText('CORP.', 204, 46)
  }, true)
  g.add(mesh(new THREE.PlaneGeometry(0.52, 0.163), face, 0, 0.8, 0.0805))
  return { solid: g }
}

export const ADVENTURES = {
  'scarlett-holo': scarlettHolo,
  'treasure-chest': treasureChest,
  'escape-pod': escapePod,
  'survival-guide': survivalGuide,
  'damocles-model': damoclesModel,
  'duchess-portrait': duchessPortrait,
  'christmas-tree': christmasTree,
  'path-banner': pathBanner,
  'thetis-blackbox': thetisBlackbox,
  'taxi-sign': taxiSign,
} satisfies Record<string, Builder>
