import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  animatedScreen, barX, barZ, box, compact, cylinder, drawnTexture, glow, holoMaterial, lit, mesh, part, type BagControl, type Builder,
} from './kit'
import { tr } from '../i18n'

/*
 * Pont principal : infirmerie, salle de sport, distributeur du mess et enseigne du salon d'arcade (les
 * bornes sont dans arcade.ts).
 */

const C = {
  white: '#e8edf1',
  whiteDark: '#aeb8c2',
  teal: '#3fa89c',
  tealLight: '#cfe9e6',
  medGreen: '#39d98a',
  rubber: '#23262c',
  black: '#15161a',
  chrome: '#b9c1cc',
  gymRed: '#c8373a',
  padding: '#1d1f24',
}

// ---------------------------------------------------------------- infirmerie

/** Tracé d'électrocardiogramme (onde P, complexe QRS, onde T) ; `p` dans [0, 1[. */
function heartbeat(p: number): number {
  if (p > 0.1 && p < 0.14) return 0.2 * Math.sin(((p - 0.1) / 0.04) * Math.PI)
  if (p > 0.2 && p < 0.22) return -0.2
  if (p >= 0.22 && p < 0.25) return 1
  if (p >= 0.25 && p < 0.27) return -0.35
  if (p > 0.4 && p < 0.5) return 0.3 * Math.sin(((p - 0.4) / 0.1) * Math.PI)
  return 0
}

/** Lit médical : arche de scanner, moniteur cardiaque animé (à droite, ou à gauche si `label` = left). */
const medBed: Builder = ({ label }) => {
  const side = label === 'left' ? -0.33 : 0.33
  const g = new THREE.Group()
  g.add(box(0.55, 0.2, 1.1, lit(C.white), 0, 0.12, 0, 0.03), box(0.45, 0.04, 1.0, lit(C.whiteDark), 0, 0.02, 0))
  g.add(box(0.5, 0.07, 1.0, lit(C.tealLight), 0, 0.255, 0, 0.03), box(0.36, 0.06, 0.18, lit('#ffffff'), 0, 0.31, -0.38, 0.03))
  g.add(box(0.52, 0.03, 0.5, lit(C.teal), 0, 0.3, 0.2, 0.01))
  // Arche du scanner.
  const arch = mesh(new THREE.TorusGeometry(0.34, 0.035, 6, 20, Math.PI), lit(C.white), 0, 0.12, -0.05)
  const halo = mesh(new THREE.TorusGeometry(0.34, 0.012, 4, 20, Math.PI), glow('#5ff2d8'), 0, 0.12, -0.02)
  g.add(arch, halo)
  // Moniteur sur pied.
  g.add(cylinder(0.012, 0.012, 0.62, lit(C.whiteDark), side, 0.31, -0.45, 6), box(0.26, 0.17, 0.04, lit(C.white), side, 0.66, -0.45, 0.015))
  const ecg = animatedScreen(64, 40, 15, (c, t) => {
    c.fillStyle = '#04110c'
    c.fillRect(0, 0, 64, 40)
    c.strokeStyle = '#39ff8a'
    c.lineWidth = 1.5
    c.beginPath()
    for (let x = 0; x < 64; x++) {
      const p = ((((x / 64) * 2 - t * 1.2) % 1) + 1) % 1
      const y = 24 - heartbeat(p) * 15
      if (x) c.lineTo(x, y)
      else c.moveTo(x, y)
    }
    c.stroke()
    c.fillStyle = '#39ff8a'
    c.font = '9px monospace'
    c.fillText('72', 48, 10)
  })
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(0.22, 0.13), new THREE.MeshBasicMaterial({ map: ecg.texture }), side, 0.66, -0.428))
  return { solid: g, live, update: (t) => ecg.tick(t) }
}

/** Scanner corporel : un hologramme d'humain qui tourne, parcouru par un anneau de balayage. */
const bodyScan: Builder = () => {
  const g = new THREE.Group()
  g.add(cylinder(0.28, 0.32, 0.12, lit(C.white), 0, 0.06, 0, 18))
  const ring = mesh(new THREE.TorusGeometry(0.25, 0.016, 5, 28), glow('#5ff2d8'), 0, 0.125, 0)
  ring.rotation.x = Math.PI / 2
  g.add(ring)
  // Silhouette : quelques volumes fusionnés ; les « uv » suivent la hauteur, pour des lignes de balayage horizontales.
  const pieces: THREE.BufferGeometry[] = [
    new THREE.IcosahedronGeometry(0.055, 1).translate(0, 0.5, 0),
    new THREE.BoxGeometry(0.15, 0.18, 0.07).translate(0, 0.36, 0),
    new THREE.BoxGeometry(0.12, 0.06, 0.07).translate(0, 0.245, 0),
    new THREE.BoxGeometry(0.05, 0.22, 0.05).translate(-0.035, 0.11, 0),
    new THREE.BoxGeometry(0.05, 0.22, 0.05).translate(0.035, 0.11, 0),
    new THREE.BoxGeometry(0.035, 0.18, 0.035).rotateZ(0.12).translate(-0.1, 0.33, 0),
    new THREE.BoxGeometry(0.035, 0.18, 0.035).rotateZ(-0.12).translate(0.1, 0.33, 0),
  ].map((p) => (p.index ? p.toNonIndexed() : p))
  const body = mergeGeometries(pieces)!
  const pos = body.attributes.position
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) uv.set([pos.getX(i) + 0.5, pos.getY(i) / 0.56], i * 2)
  body.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  const live = new THREE.Group()
  const figure = part(body, holoMaterial(null, '#5ff2d8', 0.5), 0, 0.14, 0)
  const scan = part(new THREE.TorusGeometry(0.14, 0.006, 4, 32), glow('#aefcf0'), 0, 0.3, 0)
  scan.rotation.x = Math.PI / 2
  live.add(figure, scan)
  return {
    solid: g,
    live,
    update: (t) => {
      figure.rotation.y = t * 0.6
      scan.position.y = 0.16 + (0.5 + 0.5 * Math.sin(t * 1.4)) * 0.52
    },
  }
}

/** Armoire à pharmacie, croix verte lumineuse. */
const medCabinet: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.6, 0.85, 0.3, lit(C.white), 0, 0.425, 0, 0.02))
  for (const x of [-0.145, 0.145]) g.add(box(0.27, 0.66, 0.01, lit('#f6f8fa'), x, 0.46, 0.152), box(0.015, 0.08, 0.015, lit(C.whiteDark), x > 0 ? 0.03 : -0.03, 0.46, 0.162))
  g.add(box(0.2, 0.06, 0.01, glow(C.medGreen), 0, 0.72, 0.16), box(0.06, 0.2, 0.01, glow(C.medGreen), 0, 0.72, 0.16))
  g.add(box(0.6, 0.06, 0.3, lit(C.whiteDark), 0, 0.03, 0))
  return { solid: g }
}

// ---------------------------------------------------------------- salle de sport

/** Tableau de bord d'un appareil : écran au repos (« PRÊT »), compteurs à zéro, touches. */
function machineConsole(w: number, h: number, accent: string, track: boolean): THREE.CanvasTexture {
  return drawnTexture(w, h, (c) => {
    c.fillStyle = '#16181d'
    c.fillRect(0, 0, w, h)
    c.fillStyle = '#071018'
    c.fillRect(w * 0.18, h * 0.12, w * 0.64, h * 0.52)
    c.strokeStyle = accent
    c.lineWidth = 2
    if (track) {
      // La piste ovale du programme, et le petit point du coureur.
      c.beginPath(); c.roundRect(w * 0.24, h * 0.2, w * 0.24, h * 0.36, h * 0.18); c.stroke()
      c.fillStyle = accent
      c.beginPath(); c.arc(w * 0.36, h * 0.2, 2, 0, Math.PI * 2); c.fill()
    }
    c.fillStyle = accent
    c.font = `bold ${Math.round(h * 0.2)}px monospace`
    c.textAlign = track ? 'left' : 'center'
    c.textBaseline = 'middle'
    c.fillText(tr('PRÊT', 'READY'), track ? w * 0.52 : w / 2, h * 0.38)
    // Les touches : vitesse, pente, et le gros bouton d'arrêt.
    for (let i = 0; i < 4; i++) {
      c.fillStyle = i % 2 ? '#3a3f48' : '#4b525d'
      c.fillRect(w * 0.06, h * (0.18 + i * 0.16), w * 0.08, h * 0.1)
      c.fillRect(w * 0.86, h * (0.18 + i * 0.16), w * 0.08, h * 0.1)
    }
    c.fillStyle = '#d8323c'
    c.beginPath(); c.arc(w / 2, h * 0.83, h * 0.1, 0, Math.PI * 2); c.fill()
  })
}

/**
 * Tapis de course, console à l'avant (+z) : le bâti et ses repose-pieds, la bande et ses rouleaux,
 * le capot du moteur, les deux montants, les mains courantes, et le tableau de bord avec son écran
 * au repos, son porte-gobelet et sa clé de sécurité.
 */
const treadmill: Builder = () => {
  const g = new THREE.Group()
  const frame = lit('#2b2e35'), chrome = lit(C.chrome, 'metal'), grey = lit('#8a929d', 'metal')
  g.add(box(0.5, 0.06, 1.16, frame, 0, 0.04, -0.02, 0.02))
  for (const x of [-0.215, 0.215]) g.add(box(0.07, 0.025, 0.98, grey, x, 0.083, -0.06, 0.008))
  g.add(box(0.36, 0.018, 1.0, lit(C.black), 0, 0.1, -0.06))
  // Les rouleaux, au bout de la bande ; les petites roues pour le déplacer, à l'arrière.
  for (const z of [-0.56, 0.44]) g.add(barX(0.022, 0.38, lit('#4b525d', 'metal'), 0, 0.08, z, 10))
  for (const x of [-0.22, 0.22]) g.add(barX(0.03, 0.03, lit(C.black), x, 0.03, -0.58, 10))
  // Le capot du moteur, à l'avant.
  g.add(box(0.5, 0.1, 0.18, lit(C.gymRed), 0, 0.09, 0.5, 0.03), box(0.38, 0.012, 0.16, lit(C.black), 0, 0.142, 0.5))
  // Les montants, un peu penchés vers le coureur, et les mains courantes.
  for (const x of [-0.23, 0.23]) {
    const post = box(0.045, 0.56, 0.06, frame, x, 0.4, 0.5)
    post.rotation.x = -0.16
    g.add(post, box(0.032, 0.032, 0.36, chrome, x, 0.56, 0.3, 0.01), box(0.034, 0.05, 0.05, lit(C.black), x, 0.555, 0.15))
  }
  // Le tableau de bord, incliné vers le coureur ; la tablette, le porte-gobelet, la clé rouge.
  const panel = new THREE.Group()
  panel.position.set(0, 0.69, 0.52)
  panel.rotation.x = -0.75
  panel.add(box(0.5, 0.2, 0.04, frame, 0, 0, 0, 0.02))
  panel.add(part(new THREE.PlaneGeometry(0.36, 0.15), new THREE.MeshBasicMaterial({ map: machineConsole(128, 56, '#39e0ff', true) }), 0, 0.005, 0.022))
  g.add(panel)
  g.add(box(0.48, 0.02, 0.09, frame, 0, 0.6, 0.42, 0.008))
  for (const x of [-0.19, 0.19]) g.add(cylinder(0.03, 0.025, 0.045, lit(C.black), x, 0.62, 0.42, 10))
  g.add(cylinder(0.022, 0.022, 0.08, lit('#39b6ff'), 0.19, 0.66, 0.42, 10))
  g.add(box(0.02, 0.025, 0.02, lit('#ffcf33'), -0.06, 0.62, 0.38), box(0.006, 0.06, 0.006, lit('#d8323c'), -0.06, 0.58, 0.37))
  return { solid: g }
}

/**
 * Vélo de biking, guidon à l'avant (+z) : le pied et ses patins, le cadre rouge, le volant
 * d'inertie sous son carter, le pédalier, la selle, le guidon à cornes, la petite console et le
 * bidon dans son porte-bidon.
 */
const exerciseBike: Builder = () => {
  const g = new THREE.Group()
  const red = lit(C.gymRed), dark = lit(C.rubber), chrome = lit(C.chrome, 'metal')
  // Le pied : deux traverses et leurs patins.
  for (const z of [-0.3, 0.28]) g.add(box(0.36, 0.035, 0.07, dark, 0, 0.02, z, 0.01), box(0.4, 0.02, 0.05, lit(C.black), 0, 0.01, z))
  // Le cadre : la poutre, le tube de selle et le tube du guidon.
  const beam = box(0.06, 0.06, 0.58, red, 0, 0.13, 0)
  beam.rotation.x = -0.12
  const seatTube = box(0.055, 0.36, 0.055, red, 0, 0.3, -0.16)
  seatTube.rotation.x = -0.28
  const headTube = box(0.055, 0.42, 0.055, red, 0, 0.34, 0.24)
  headTube.rotation.x = 0.22
  g.add(beam, seatTube, headTube)
  // Le volant d'inertie, sous son carter, et le pédalier.
  g.add(barX(0.15, 0.05, lit('#2a2c31'), 0, 0.2, 0.2, 20), barX(0.152, 0.015, chrome, 0, 0.2, 0.2, 20), barX(0.04, 0.07, lit('#4b525d', 'metal'), 0, 0.2, 0.2, 10))
  g.add(barX(0.045, 0.12, dark, 0, 0.17, -0.02, 12))
  for (const side of [-1, 1]) {
    const crank = box(0.015, 0.12, 0.025, chrome, side * 0.07, 0.17, -0.02 + side * 0.03)
    crank.rotation.x = side * 0.9
    g.add(crank, box(0.07, 0.015, 0.04, lit(C.black), side * 0.1, 0.17 - side * 0.045, -0.02 + side * 0.07))
  }
  // La selle sur sa tige, le guidon à cornes.
  g.add(box(0.03, 0.12, 0.03, chrome, 0, 0.47, -0.2))
  g.add(box(0.13, 0.04, 0.2, lit(C.padding, 'leather'), 0, 0.53, -0.18, 0.02), box(0.08, 0.035, 0.08, lit(C.padding, 'leather'), 0, 0.53, -0.04, 0.015))
  g.add(box(0.03, 0.1, 0.03, chrome, 0, 0.56, 0.28))
  g.add(barX(0.014, 0.32, lit(C.black), 0, 0.61, 0.3, 8))
  for (const x of [-0.14, 0.14]) g.add(barZ(0.014, 0.12, lit(C.black), x, 0.62, 0.36, 8))
  // La console (au repos) et le bidon.
  g.add(box(0.12, 0.08, 0.03, lit(C.rubber), 0, 0.67, 0.31, 0.01))
  g.add(part(new THREE.PlaneGeometry(0.1, 0.06), new THREE.MeshBasicMaterial({ map: machineConsole(64, 40, '#39e0ff', false) }), 0, 0.67, 0.326))
  g.add(cylinder(0.025, 0.025, 0.1, lit('#39b6ff'), 0, 0.33, 0.12, 10), cylinder(0.012, 0.016, 0.02, lit(C.white), 0, 0.39, 0.12, 8))
  return { solid: g }
}

/** Banc de développé couché, barre et disques sur le rack. */
const weightBench: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.28, 0.08, 0.9, lit(C.padding, 'cloth'), 0, 0.3, 0.1, 0.03), box(0.2, 0.26, 0.06, lit(C.chrome, 'metal'), 0, 0.13, 0.45), box(0.2, 0.26, 0.06, lit(C.chrome, 'metal'), 0, 0.13, -0.25))
  for (const x of [-0.22, 0.22]) g.add(box(0.05, 0.78, 0.05, lit(C.chrome, 'metal'), x, 0.39, -0.42), box(0.07, 0.04, 0.08, lit(C.gymRed), x, 0.7, -0.4))
  g.add(barX(0.015, 1.1, lit(C.chrome, 'metal'), 0, 0.73, -0.4, 8))
  for (const x of [-0.45, -0.39, 0.39, 0.45]) g.add(barX(Math.abs(x) > 0.42 ? 0.1 : 0.13, 0.04, lit(Math.abs(x) > 0.42 ? C.gymRed : C.black), x, 0.73, -0.4, 16))
  return { solid: g }
}

/** Râtelier d'haltères (0,9 m le long de x). */
const dumbbellRack: Builder = () => {
  const g = new THREE.Group()
  for (const x of [-0.42, 0.42]) g.add(box(0.04, 0.42, 0.3, lit(C.rubber), x, 0.21, 0))
  for (const [y, z] of [[0.2, 0.06], [0.38, -0.06]] as const) {
    const shelf = box(0.84, 0.03, 0.16, lit(C.rubber), 0, y, z)
    shelf.rotation.x = 0.25
    g.add(shelf)
    for (let i = 0; i < 4; i++) {
      const x = -0.3 + i * 0.2, r = 0.035 + i * 0.006
      g.add(barX(0.01, 0.16, lit(C.chrome, 'metal'), x, y + 0.05, z, 6))
      for (const dx of [-0.07, 0.07]) g.add(barX(r, 0.04, lit(i % 2 ? C.black : C.gymRed), x + dx, y + 0.05, z, 8))
    }
  }
  return { solid: g }
}

/** Sac de frappe sur potence ; il se balance doucement. */
const punchingBag: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.5, 0.03, 0.5, lit(C.rubber), 0, 0.015, -0.2), box(0.06, 1.05, 0.06, lit(C.chrome, 'metal'), 0, 0.525, -0.38), box(0.05, 0.05, 0.42, lit(C.chrome, 'metal'), 0, 1.02, -0.18))
  const live = new THREE.Group()
  const pivot = new THREE.Group()
  pivot.position.set(0, 1.0, 0)
  // Le crochet et son émerillon, puis les quatre chaînes qui s'écartent jusqu'au haut du sac.
  pivot.add(part(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 4), lit(C.chrome, 'metal'), 0, -0.04, 0))
  pivot.add(part(new THREE.SphereGeometry(0.014, 8, 6), lit(C.chrome, 'metal'), 0, -0.08, 0))
  for (const a of [0.4, 2, 3.6, 5.2]) {
    const chain = part(new THREE.CylinderGeometry(0.004, 0.004, 0.146, 4), lit(C.chrome, 'metal'), Math.sin(a) * 0.045, -0.1375, Math.cos(a) * 0.045)
    chain.rotation.set(-Math.cos(a) * 0.66, 0, Math.sin(a) * 0.66)
    pivot.add(chain)
  }
  const model = new THREE.Group()
  model.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.45, 16), lit(C.gymRed, 'leather')))
  model.add(mesh(new THREE.CylinderGeometry(0.12, 0.143, 0.03, 16), lit(C.black, 'leather'), 0, 0.235, 0), mesh(new THREE.CylinderGeometry(0.143, 0.13, 0.03, 16), lit(C.black, 'leather'), 0, -0.235, 0))
  for (const y of [-0.16, 0.16]) model.add(mesh(new THREE.CylinderGeometry(0.143, 0.143, 0.035, 16), lit(C.black, 'leather'), 0, y, 0))
  model.add(mesh(new THREE.CylinderGeometry(0.1415, 0.1415, 0.07, 16), lit('#f2f2f0', 'leather'), 0, 0.07, 0))
  // Le Thargoïde au feutre, sur la face qu'on frappe : un corps en fleur, cinq pétales.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const petal = box(0.012, 0.035, 0.004, lit('#1c1d21'), Math.sin(a) * 0.022, -0.06 + Math.cos(a) * 0.022, 0.141)
    petal.rotation.z = -a
    model.add(petal)
  }
  model.add(box(0.02, 0.02, 0.004, lit('#5fd47a'), 0, -0.06, 0.142))
  const bag = compact(model)
  bag.position.y = -0.42
  pivot.add(bag)
  live.add(pivot)
  // Un coup de poing (cf. main.ts) le fait partir vers l'arrière (-z), puis il revient en oscillant.
  let now = 0, hitAt = -Infinity, swing = 0
  const control: BagControl = {
    kind: 'bag',
    hit() {
      const u = now - hitAt
      swing = Math.min(0.5, 0.28 + swing * Math.exp(-u * 2.2) * 0.5)
      hitAt = now
    },
  }
  return {
    solid: g,
    live,
    control,
    update: (t) => {
      now = t
      const u = t - hitAt
      // rotation.x > 0 envoie le sac (sous le pivot) vers -z.
      const kick = u < 6 ? swing * Math.sin(u * 7) * Math.exp(-u * 2.2) : 0
      pivot.rotation.x = Math.sin(t * 1.9) * 0.06 + kick
      pivot.rotation.z = Math.sin(t * 1.3 + 1) * 0.04
    },
  }
}

// ---------------------------------------------------------------- salon d'arcade (bornes : cf. arcade.ts)

/** Enseigne au néon (texte : `label`), qui grésille de temps en temps. */
const neonSign: Builder = ({ label = 'ARCADE' }) => {
  const texture = drawnTexture(512, 160, (c) => {
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.font = '800 92px system-ui, sans-serif'
    c.shadowColor = '#ff4fd8'
    c.shadowBlur = 26
    c.fillStyle = '#ffd6f6'
    c.fillText(label, 256, 84)
    c.fillText(label, 256, 84)
    c.shadowColor = '#39e0ff'
    c.shadowBlur = 16
    c.strokeStyle = '#8ff4ff'
    c.lineWidth = 7
    c.beginPath()
    c.roundRect(14, 14, 484, 132, 30)
    c.stroke()
  })
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(0.9, 0.28), material, 0, 0.95, 0))
  return {
    live,
    update: (t) => {
      const crisis = Math.sin(t * 0.7) + Math.sin(t * 2.9) * 0.5 > 1.25
      material.opacity = crisis && Math.sin(t * 70) > 0 ? 0.35 : 1
    },
  }
}

/**
 * Distributeur du mess, adossé au mur : caisse orange Elite, vitrine éclairée de cinq rayons (canettes,
 * barres, sachets, tasses de Hutton Orbital), fronton lumineux, monnayeur et bac de retrait. De
 * temps en temps, une spirale tourne et un article tombe.
 */
const vendingMachine: Builder = ({ random }) => {
  const g = new THREE.Group()
  const body = lit('#e0701e'), dark = lit(C.black), chrome = lit(C.chrome, 'metal')
  g.add(box(0.66, 0.96, 0.42, body, 0, 0.48, 0.21, 0.02), box(0.5, 0.74, 0.02, dark, -0.06, 0.55, 0.42))
  // Fronton.
  const sign = drawnTexture(256, 48, (c) => {
    c.fillStyle = '#17181b'
    c.fillRect(0, 0, 256, 48)
    c.fillStyle = '#ffb45e'
    c.font = '800 26px system-ui, sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(tr('SNACKS · CAFÉ', 'SNACKS · COFFEE'), 128, 26)
  })
  g.add(part(new THREE.PlaneGeometry(0.6, 0.11), new THREE.MeshBasicMaterial({ map: sign }), 0, 1.0, 0.425))
  // Vitrine : fond lumineux, rayons, articles de couleur.
  g.add(box(0.46, 0.7, 0.005, glow('#fff3de'), -0.06, 0.56, 0.3))
  const colors = ['#d8323c', '#3a7bd5', '#39d98a', '#ffd35a', '#b28aff', '#ff8a1c', '#eef1f4']
  for (let row = 0; row < 5; row++) {
    const y = 0.3 + row * 0.13
    g.add(box(0.46, 0.008, 0.1, chrome, -0.06, y, 0.36))
    for (let i = 0; i < 5; i++) {
      const col = lit(colors[Math.floor(random() * colors.length)])
      const x = -0.24 + i * 0.09
      if (row === 4) g.add(cylinder(0.02, 0.02, 0.07, col, x, y + 0.04, 0.37, 10))
      else if (row === 0) g.add(cylinder(0.022, 0.018, 0.05, lit('#eef1f4'), x, y + 0.03, 0.37, 10), cylinder(0.023, 0.023, 0.014, lit('#e0701e'), x, y + 0.035, 0.37, 10))
      else g.add(box(0.06, 0.08, 0.03, col, x, y + 0.045, 0.37, 0.005))
    }
  }
  // Panneau de commande : écran, touches, monnayeur ; bac de retrait en bas.
  g.add(box(0.1, 0.06, 0.01, glow('#7dffa8'), 0.25, 0.8, 0.425))
  for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) g.add(box(0.022, 0.022, 0.01, lit('#c9cdd4'), 0.225 + k * 0.026, 0.7 - r * 0.03, 0.425))
  g.add(box(0.03, 0.05, 0.01, dark, 0.25, 0.55, 0.425), box(0.008, 0.03, 0.012, glow('#ffd35a'), 0.25, 0.55, 0.43))
  g.add(box(0.44, 0.1, 0.03, dark, -0.06, 0.1, 0.415, 0.01))
  // La vitre, et l'article qui tombe.
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(0.48, 0.72), new THREE.MeshLambertMaterial({ color: '#dff4ff', transparent: true, opacity: 0.18, depthWrite: false }), -0.06, 0.56, 0.43))
  const falling = box(0.06, 0.08, 0.03, lit('#d8323c'), 0.03, 0.5, 0.37, 0.005)
  falling.visible = false
  live.add(falling)
  return {
    solid: g,
    live,
    update(t) {
      // Toutes les 11 s, un paquet quitte le troisième rayon et tombe dans le bac.
      const k = (t % 11) - 9.6
      falling.visible = k > 0
      if (k > 0) falling.position.y = Math.max(0.12, 0.605 - k * k * 0.9)
    },
  }
}

export const LEISURE = {
  'med-bed': medBed,
  'body-scan': bodyScan,
  'med-cabinet': medCabinet,
  treadmill,
  'exercise-bike': exerciseBike,
  'weight-bench': weightBench,
  'dumbbell-rack': dumbbellRack,
  'punching-bag': punchingBag,
  'neon-sign': neonSign,
  'vending-machine': vendingMachine,
} satisfies Record<string, Builder>
