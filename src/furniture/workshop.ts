import * as THREE from 'three'
import {
  barX, barZ, box, cylinder, decal, drawnTexture, ED_ORANGE, glow, holoMaterial, instanced, lit, mat, mesh, panelTexture,
  part, setInstance, sphere, type Builder,
} from './kit'
import { tr } from '../i18n'

/*
 * La cale : minage, bricolage, réparation. Du métal usé, de la rouille, du jaune de
 * chantier, des étincelles et de la vapeur.
 */

const C = {
  rust: '#7a4528',
  rustDark: '#4a2c1c',
  steel: '#5a5e66',
  steelDark: '#2d2f33',
  worn: '#6b6358',
  hazard: '#e9a917',
  black: '#17181b',
  red: '#a8322a',
  blue: '#3f5873',
  olive: '#5a5f3a',
  chrome: '#9aa3ad',
  rubber: '#1d1e21',
  wood: '#7a5a3a',
}

const LEGS: [number, number][] = [[-0.55, -0.25], [0.55, -0.25], [-0.55, 0.25], [0.55, 0.25]]

/** Trépied (projecteur, laser) : trois pieds qui convergent vers `height`. */
function tripod(g: THREE.Group, height: number) {
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3
    const leg = box(0.03, height, 0.03, lit(C.steelDark), Math.cos(a) * 0.12, height / 2, Math.sin(a) * 0.12)
    leg.rotation.set(-Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3)
    g.add(leg)
  }
}

/** Étincelles de soudure : des éclats qui jaillissent d'un point, retombent et rebondissent au sol. */
function sparkBurst(count: number, random: () => number) {
  const mesh = instanced(new THREE.BoxGeometry(0.014, 0.014, 0.014), Array.from({ length: count }, (_, i) => (i % 3 ? '#ffd27a' : '#fff6d8')))
  const seeds = Array.from({ length: count }, () => ({
    a: random() * Math.PI * 2,
    v: 0.3 + random() * 0.7,
    up: 0.5 + random() * 0.9,
    life: 0.35 + random() * 0.4,
    phase: random(),
  }))
  return {
    mesh,
    /** @param from point d'émission (repère du meuble), ou null : pas d'étincelles */
    update(t: number, from: THREE.Vector3 | null) {
      seeds.forEach((s, i) => {
        if (!from) return setInstance(mesh, i, 0, -10, 0, 0.001)
        const k = (t / s.life + s.phase) % 1
        const tt = k * s.life
        const y = from.y + s.up * tt - 4.5 * tt * tt
        setInstance(mesh, i, from.x + Math.cos(s.a) * s.v * tt, Math.max(0.01, y), from.z + Math.sin(s.a) * s.v * tt, 1 - k * 0.7)
      })
      mesh.instanceMatrix.needsUpdate = true
    },
  }
}

/** Bouffées de vapeur ou de fumée qui montent, gonflent et disparaissent. */
function puffs(count: number, color: string, opacity: number) {
  const mesh = instanced(
    new THREE.IcosahedronGeometry(1, 1),
    Array(count).fill(color),
    new THREE.MeshLambertMaterial({ transparent: true, opacity, depthWrite: false }),
  )
  return {
    mesh,
    update(t: number, x: number, y: number, z: number, rise = 0.9, speed = 0.35) {
      for (let i = 0; i < count; i++) {
        const k = (t * speed + i / count) % 1
        const s = (0.04 + k * 0.14) * (k < 0.75 ? 1 : (1 - k) / 0.25)
        setInstance(mesh, i, x + Math.sin(i * 2.1 + t) * k * 0.08, y + k * rise, z + Math.cos(i * 1.3 + t) * k * 0.08, s)
      }
      mesh.instanceMatrix.needsUpdate = true
    },
  }
}

// ---------------------------------------------------------------- atelier

/** Établi : plateau d'acier, panneau à outils, étau, caisse à outils, lampe articulée. */
const workbench: Builder = ({ random }) => {
  const g = new THREE.Group()
  for (const [x, z] of LEGS) g.add(box(0.06, 0.36, 0.06, lit(C.steelDark), x, 0.18, z))
  g.add(box(1.2, 0.06, 0.6, lit('#57514a'), 0, 0.39, 0))
  g.add(box(1.1, 0.03, 0.5, lit(C.steelDark), 0, 0.1, 0))
  g.add(box(0.3, 0.1, 0.25, lit(C.blue), -0.3, 0.165, 0), box(0.25, 0.08, 0.25, lit(C.red), 0.25, 0.155, 0.05))
  // Panneau à outils : clés, marteau, scie.
  g.add(box(1.2, 0.42, 0.03, lit('#3d3a35'), 0, 0.64, -0.285))
  for (let i = 0; i < 4; i++) g.add(box(0.025, 0.14 + i * 0.03, 0.01, lit(C.chrome), -0.5 + i * 0.07, 0.66, -0.265))
  g.add(box(0.1, 0.035, 0.03, lit(C.steelDark), 0.02, 0.76, -0.262), box(0.025, 0.18, 0.02, lit(C.wood), 0.02, 0.67, -0.262))
  g.add(box(0.22, 0.09, 0.008, lit(C.chrome), 0.3, 0.7, -0.265), box(0.05, 0.06, 0.012, lit(C.red), 0.17, 0.7, -0.263))
  // Étau.
  g.add(box(0.14, 0.06, 0.12, lit(C.blue), 0.42, 0.45, 0.2))
  for (const z of [0.16, 0.24]) g.add(box(0.12, 0.07, 0.03, lit(C.steel), 0.42, 0.51, z))
  // Caisse à outils rouge.
  g.add(box(0.28, 0.12, 0.14, lit(C.red), -0.36, 0.48, -0.08, 0.01), box(0.2, 0.02, 0.02, lit(C.black), -0.36, 0.555, -0.08))
  // Un drone collecteur démonté, des boulons, un engrenage.
  g.add(cylinder(0.075, 0.085, 0.05, mat.steelLight, 0.0, 0.445, 0.08, 8), box(0.05, 0.02, 0.05, mat.lampCyan, 0.1, 0.43, 0.14))
  for (let i = 0; i < 5; i++) g.add(cylinder(0.012, 0.012, 0.03, lit(C.chrome), -0.18 + random() * 0.4, 0.435, 0.12 + random() * 0.14, 6))
  const gear = mesh(new THREE.TorusGeometry(0.045, 0.015, 4, 10), lit(C.worn), 0.2, 0.43, -0.02)
  gear.rotation.x = Math.PI / 2
  g.add(gear)
  // Lampe articulée.
  const arm = cylinder(0.01, 0.01, 0.32, lit(C.steelDark), -0.5, 0.56, -0.18, 6)
  arm.rotation.x = 0.5
  g.add(arm, cylinder(0.03, 0.06, 0.06, lit(C.hazard), -0.5, 0.7, -0.05, 10), sphere(0.024, glow('#ffe2a0'), -0.5, 0.67, -0.05, 8))
  return { solid: g }
}

/** Panneau à outils sur pieds, avec une étagère de pots de peinture. */
const toolRack: Builder = () => {
  const g = new THREE.Group()
  for (const x of [-0.46, 0.46]) g.add(box(0.05, 0.9, 0.05, lit(C.steelDark), x, 0.45, 0), box(0.06, 0.03, 0.3, lit(C.steelDark), x, 0.015, 0))
  g.add(box(0.9, 0.58, 0.03, lit('#4a4640'), 0, 0.6, 0))
  for (let i = 0; i < 5; i++) g.add(box(0.025, 0.14 + i * 0.025, 0.012, lit(C.chrome), -0.38 + i * 0.06, 0.72, 0.022))
  ;[C.red, C.hazard, C.blue, C.olive].forEach((col, i) => {
    g.add(cylinder(0.006, 0.006, 0.1, lit(C.chrome), -0.02 + i * 0.05, 0.76, 0.022, 5), cylinder(0.014, 0.014, 0.06, lit(col), -0.02 + i * 0.05, 0.84, 0.022, 6))
  })
  g.add(mesh(new THREE.TorusGeometry(0.08, 0.022, 5, 14), lit(C.hazard), 0.3, 0.72, 0.03))
  g.add(box(0.14, 0.035, 0.03, lit(C.steelDark), 0.3, 0.5, 0.025), box(0.025, 0.14, 0.02, lit(C.wood), 0.3, 0.42, 0.025))
  g.add(box(0.9, 0.025, 0.22, lit(C.steelDark), 0, 0.22, 0.1))
  ;[C.red, C.blue, C.hazard, '#dfe3e8'].forEach((col, i) => g.add(cylinder(0.05, 0.05, 0.09, lit(col), -0.3 + i * 0.18, 0.28, 0.1, 10)))
  g.add(box(0.26, 0.12, 0.2, lit(C.red), 0.1, 0.075, 0.1, 0.01))
  return { solid: g }
}

/** Poste de soudure : bouteilles de gaz sur leur chariot, pièce chauffée à blanc, étincelles par rafales. */
const welder: Builder = ({ random }) => {
  const g = new THREE.Group()
  g.add(box(0.36, 0.04, 0.28, lit(C.steelDark), -0.12, 0.12, 0))
  for (const [x, z] of [[-0.27, -0.12], [0.03, -0.12], [-0.27, 0.12], [0.03, 0.12]]) g.add(barZ(0.04, 0.03, lit(C.rubber), x, 0.04, z, 8))
  g.add(box(0.02, 0.5, 0.02, lit(C.steelDark), -0.3, 0.37, 0))
  for (const [x, col] of [[-0.2, C.red], [-0.05, '#4d6b58']] as const) {
    g.add(cylinder(0.07, 0.07, 0.48, lit(col), x, 0.38, 0, 12), sphere(0.07, lit(col), x, 0.62, 0, 10))
    g.add(cylinder(0.02, 0.02, 0.06, lit(C.chrome), x, 0.7, 0, 6), cylinder(0.022, 0.022, 0.012, lit('#e8ecf0'), x + 0.03, 0.72, 0.04, 8))
  }
  // Petite table de soudure et pièce en cours.
  g.add(box(0.36, 0.04, 0.32, lit(C.steel), 0.24, 0.34, 0.02))
  for (const [x, z] of [[0.1, -0.1], [0.38, -0.1], [0.1, 0.14], [0.38, 0.14]]) g.add(box(0.03, 0.32, 0.03, lit(C.steelDark), x, 0.16, z))
  g.add(box(0.22, 0.03, 0.14, lit(C.worn), 0.24, 0.375, 0.02), box(0.05, 0.012, 0.1, glow('#ff9a3a'), 0.24, 0.392, 0.02))
  const hose = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.12, 0.62, 0.05), new THREE.Vector3(-0.05, 0.3, 0.18), new THREE.Vector3(0.12, 0.2, 0.2), new THREE.Vector3(0.22, 0.4, 0.12),
  ])
  g.add(mesh(new THREE.TubeGeometry(hose, 20, 0.012, 5, false), lit(C.black)), barX(0.014, 0.12, lit(C.chrome), 0.28, 0.41, 0.12, 6))
  // Masque de soudeur posé sur le chariot.
  g.add(box(0.12, 0.1, 0.06, lit(C.black), -0.12, 0.19, 0.06, 0.02), box(0.07, 0.03, 0.005, lit('#2a4a3a'), -0.12, 0.2, 0.092))

  const live = new THREE.Group()
  const hot = part(new THREE.SphereGeometry(0.03, 8, 6), glow('#fff2c0'), 0.24, 0.4, 0.02)
  const sparks = sparkBurst(22, random)
  live.add(hot, sparks.mesh)
  const from = new THREE.Vector3(0.24, 0.41, 0.02)
  return {
    solid: g,
    live,
    emitter: 'sparks',
    update: (t) => {
      // Par rafales : 2,5 s de soudure, 1,5 s de pause.
      const on = t % 4 < 2.5
      hot.visible = on
      hot.scale.setScalar(0.8 + Math.random() * 0.5)
      sparks.update(t, on ? from : null)
    },
  }
}

/**
 * Établi d'ingénieur (les Ingénieurs d'Elite) : un module en cours de modification,
 * dont le cœur luit en violet, et un panneau holographique. Texte : « Titre|ligne|ligne ».
 */
const engineerBench: Builder = ({
  label = tr('Farseer Inc.|FSD · grade 5|Portée augmentée|Effet : charge profonde', 'Farseer Inc.|FSD · grade 5|Increased range|Effect: Deep Charge'),
}) => {
  const g = new THREE.Group()
  for (const [x, z] of LEGS) g.add(box(0.06, 0.36, 0.06, lit(C.steelDark), x, 0.18, z))
  g.add(box(1.2, 0.06, 0.6, lit('#4b4f57'), 0, 0.39, 0), box(1.2, 0.025, 0.02, lit(C.hazard), 0, 0.41, 0.3))
  g.add(box(0.36, 0.2, 0.26, lit(C.steel), -0.05, 0.52, -0.05, 0.02))
  for (let i = 0; i < 5; i++) g.add(box(0.012, 0.16, 0.28, lit(C.steelDark), -0.19 + i * 0.07, 0.53, -0.05))
  g.add(box(0.2, 0.12, 0.14, lit(C.steelDark), 0.42, 0.48, 0.05, 0.01), box(0.14, 0.06, 0.005, glow('#b07aff'), 0.42, 0.5, 0.123))
  const cable = new THREE.CatmullRomCurve3([new THREE.Vector3(0.13, 0.5, 0.05), new THREE.Vector3(0.22, 0.44, 0.16), new THREE.Vector3(0.33, 0.45, 0.08)])
  g.add(mesh(new THREE.TubeGeometry(cable, 12, 0.01, 5, false), lit(C.black)))
  g.add(box(0.12, 0.02, 0.05, lit(C.chrome), -0.42, 0.43, 0.15), box(0.03, 0.08, 0.03, lit(C.hazard), -0.36, 0.46, -0.2))

  const live = new THREE.Group()
  const coreMat = new THREE.MeshBasicMaterial({ color: '#b07aff' })
  const core = part(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 12), coreMat, -0.05, 0.53, 0.13)
  core.rotation.x = Math.PI / 2
  const panel = part(new THREE.PlaneGeometry(0.6, 0.38), holoMaterial(panelTexture(label), ED_ORANGE, 0.9), 0.05, 0.95, -0.18)
  panel.rotation.x = -0.2
  live.add(core, panel)
  const dim = new THREE.Color('#5a2fb0'), bright = new THREE.Color('#e6c8ff')
  return {
    solid: g,
    live,
    update: (t) => {
      coreMat.color.copy(dim).lerp(bright, 0.5 + 0.5 * Math.sin(t * 2.4))
      panel.position.y = 0.95 + Math.sin(t * 1.3) * 0.008
    },
  }
}

/** Tas de ferraille : plaques, tuyaux, un pneu, une caisse, empilés au hasard. */
const scrapPile: Builder = ({ random }) => {
  const g = new THREE.Group()
  const cols = [C.rust, C.rustDark, C.steel, C.steelDark, C.worn, C.blue, C.hazard]
  const pick = () => lit(cols[Math.floor(random() * cols.length)])
  for (let i = 0; i < 14; i++) {
    const r = random()
    const x = (random() - 0.5) * 0.7, z = (random() - 0.5) * 0.7
    let m: THREE.Mesh
    if (r < 0.45) m = box(0.1 + random() * 0.3, 0.02 + random() * 0.04, 0.08 + random() * 0.25, pick(), x, 0, z)
    else if (r < 0.75) m = barX(0.02 + random() * 0.035, 0.2 + random() * 0.4, pick(), x, 0, z, 8)
    else if (r < 0.88) m = mesh(new THREE.TorusGeometry(0.09, 0.035, 5, 12), lit(C.rubber), x, 0, z)
    else m = box(0.13, 0.12, 0.13, pick(), x, 0, z)
    // Plus haut au centre : un tas, pas un tapis.
    m.position.y = 0.03 + (i / 14) * 0.3 * Math.max(0, 1 - Math.hypot(x, z) * 1.6)
    m.rotation.x += (random() - 0.5) * 0.9
    m.rotation.y += random() * Math.PI
    m.rotation.z += (random() - 0.5) * 0.6
    g.add(m)
  }
  return { solid: g }
}

/** Trois fûts cabossés, dont un couché. */
const drums: Builder = ({ random }) => {
  const g = new THREE.Group()
  const barrel = (col: string, x: number, z: number, lying = false) => {
    const b = new THREE.Group()
    b.add(cylinder(0.14, 0.14, 0.42, lit(col), 0, 0.21, 0, 14))
    for (const y of [0.1, 0.32]) b.add(cylinder(0.146, 0.146, 0.025, lit(C.rustDark), 0, y, 0, 14))
    b.add(cylinder(0.02, 0.02, 0.02, lit(C.steelDark), 0.07, 0.425, 0.03, 6))
    b.rotation.y = random() * Math.PI
    if (lying) {
      b.rotation.z = Math.PI / 2
      b.position.set(x + 0.21, 0.14, z)
    } else b.position.set(x, 0, z)
    g.add(b)
  }
  barrel(C.rust, -0.17, -0.15)
  barrel(C.blue, 0.17, -0.12)
  barrel(C.hazard, -0.15, 0.22, true)
  return { solid: g }
}

/** Tuyauterie apparente (2 m le long de x) : colliers, supports, vanne rouge, manomètre. */
const pipeRun: Builder = () => {
  const g = new THREE.Group()
  g.add(barX(0.05, 2, lit(C.worn), 0, 0.78, 0, 12), barX(0.035, 2, lit(C.rust), 0, 0.56, 0.02, 10))
  for (const x of [-0.8, 0, 0.8]) g.add(box(0.05, 0.8, 0.05, lit(C.steelDark), x, 0.4, -0.07), barX(0.058, 0.04, lit(C.steelDark), x, 0.78, 0, 10))
  for (const x of [-0.45, 0.45]) g.add(barX(0.064, 0.06, lit(C.steelDark), x, 0.78, 0, 10))
  const valve = mesh(new THREE.TorusGeometry(0.06, 0.012, 5, 14), lit(C.red), 0.3, 0.9, 0)
  valve.rotation.x = Math.PI / 2
  g.add(cylinder(0.012, 0.012, 0.1, lit(C.steelDark), 0.3, 0.84, 0, 6), valve)
  g.add(barZ(0.04, 0.02, lit('#dfe3e8'), -0.3, 0.56, 0.06, 12), box(0.004, 0.03, 0.004, glow('#ff3b2f'), -0.3, 0.57, 0.072))
  g.add(cylinder(0.035, 0.035, 0.58, lit(C.rust), 1.0, 0.27, 0.02, 10))
  return { solid: g }
}

/** Grille d'évacuation qui crache de la vapeur. */
const steamVent: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.5, 0.03, 0.5, lit(C.steelDark), 0, 0.015, 0))
  for (let i = 0; i < 5; i++) g.add(box(0.42, 0.01, 0.035, lit(C.black), 0, 0.034, -0.16 + i * 0.08))
  const steam = puffs(10, '#d4d8dc', 0.26)
  const live = new THREE.Group()
  live.add(steam.mesh)
  return { solid: g, live, update: (t) => steam.update(t, 0, 0.05, 0) }
}

/** Câbles qui traînent au sol. */
const cables: Builder = ({ random }) => {
  const g = new THREE.Group()
  for (const [col, off] of [[C.black, -0.07], [C.hazard, 0.05], [C.rubber, 0]] as const) {
    const pts = Array.from({ length: 6 }, (_, i) => new THREE.Vector3(-0.7 + i * 0.28, 0.017, off + (random() - 0.5) * 0.22))
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.016, 5, false), lit(col)))
  }
  return { solid: g }
}

/** Cadre de bandes jaunes et noires au sol (autour d'une zone dangereuse). */
const hazardFloor: Builder = () => {
  const texture = drawnTexture(256, 256, (g) => {
    g.fillStyle = '#17181b'
    g.fillRect(0, 0, 256, 256)
    g.fillStyle = '#e9a917'
    for (let x = -256; x < 512; x += 44) {
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x + 22, 0)
      g.lineTo(x + 278, 256)
      g.lineTo(x + 256, 256)
      g.closePath()
      g.fill()
    }
    g.clearRect(30, 30, 196, 196)
  })
  const live = new THREE.Group()
  live.add(decal(texture, 1.5, 1.5))
  return { live }
}

/** Tache d'huile. */
const stain: Builder = ({ random }) => {
  const shape = new THREE.Shape()
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * Math.PI * 2, r = 0.14 + random() * 0.13
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  const g = new THREE.Group()
  g.add(mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), lit('#2a241d'), 0, 0.004, 0))
  return { solid: g }
}

/** Projecteur de chantier sur trépied. */
const workLamp: Builder = () => {
  const g = new THREE.Group()
  tripod(g, 0.45)
  g.add(cylinder(0.014, 0.014, 0.5, lit(C.steelDark), 0, 0.68, 0, 6))
  const head = new THREE.Group()
  head.position.y = 0.93
  head.rotation.x = 0.55
  head.add(box(0.22, 0.16, 0.1, lit(C.hazard), 0, 0, 0, 0.02), box(0.18, 0.12, 0.01, glow('#fff1c8'), 0, 0, 0.052))
  g.add(head)
  return { solid: g }
}

// ---------------------------------------------------------------- baie de réparation

/** Pont élévateur à SRV : plateau cerclé de bandes de danger, pupitre de commande. */
const repairLift: Builder = () => {
  const g = new THREE.Group()
  const W = 1.5, D = 1.1, seg = 0.1
  g.add(box(W, 0.1, D, lit('#2a2c30'), 0, 0.05, 0), box(W - 0.12, 0.03, D - 0.12, lit('#4a4d52'), 0, 0.115, 0))
  const edge = (len: number, at: (s: number) => [number, number], alongX: boolean) => {
    const n = Math.round(len / seg)
    for (let i = 0; i < n; i++) {
      const [x, z] = at(-len / 2 + (i + 0.5) * seg)
      g.add(box(alongX ? seg : 0.06, 0.03, alongX ? 0.06 : seg, lit(i % 2 ? C.black : C.hazard), x, 0.115, z))
    }
  }
  edge(W, (s) => [s, -D / 2 + 0.03], true)
  edge(W, (s) => [s, D / 2 - 0.03], true)
  edge(D - 0.12, (s) => [-W / 2 + 0.03, s], false)
  edge(D - 0.12, (s) => [W / 2 - 0.03, s], false)
  g.add(box(0.12, 0.5, 0.1, lit(C.steelDark), W / 2 + 0.1, 0.25, D / 2 - 0.1))
  g.add(box(0.1, 0.06, 0.01, glow('#39d98a'), W / 2 + 0.1, 0.45, D / 2 - 0.045), box(0.03, 0.03, 0.01, glow('#ff3b2f'), W / 2 + 0.1, 0.38, D / 2 - 0.045))
  return { solid: g }
}

/** Bras robotisé de maintenance : il se déplace, puis soude (étincelles au bout de la torche). */
const robotArm: Builder = ({ random }) => {
  const g = new THREE.Group()
  g.add(cylinder(0.2, 0.22, 0.1, lit(C.steelDark), 0, 0.05, 0, 16), cylinder(0.215, 0.215, 0.025, lit(C.hazard), 0, 0.1, 0, 16))
  const yellow = lit('#e5a21a'), dark = lit(C.steelDark)
  const live = new THREE.Group()
  const turret = new THREE.Group()
  turret.position.y = 0.12
  turret.add(mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.12, 14), yellow, 0, 0.06, 0))
  const shoulder = new THREE.Group()
  shoulder.position.y = 0.17
  shoulder.add(barX(0.07, 0.2, dark, 0, 0, 0, 12), box(0.1, 0.52, 0.1, yellow, 0, 0.26, 0, 0.02))
  const elbow = new THREE.Group()
  elbow.position.y = 0.52
  elbow.add(barX(0.055, 0.16, dark, 0, 0, 0, 10), box(0.08, 0.42, 0.08, yellow, 0, 0.21, 0, 0.02))
  const wrist = new THREE.Group()
  wrist.position.y = 0.42
  wrist.add(cylinder(0.04, 0.05, 0.08, dark, 0, 0.04, 0, 8), cylinder(0.012, 0.02, 0.12, lit(C.chrome), 0, 0.14, 0, 6))
  const tip = part(new THREE.SphereGeometry(0.022, 8, 6), glow('#e8f4ff'), 0, 0.21, 0)
  wrist.add(tip)
  elbow.add(wrist)
  shoulder.add(elbow)
  turret.add(shoulder)
  const sparks = sparkBurst(16, random)
  live.add(turret, sparks.mesh)
  const v = new THREE.Vector3()
  return {
    solid: g,
    live,
    emitter: 'sparks',
    update: (t) => {
      turret.rotation.y = Math.sin(t * 0.35) * 0.5
      shoulder.rotation.x = 0.55 + Math.sin(t * 0.5) * 0.15
      elbow.rotation.x = 1.25 + Math.sin(t * 0.7 + 1) * 0.2
      wrist.rotation.x = 0.6 + Math.sin(t * 0.9) * 0.2
      const welding = Math.sin(t * 0.8) > 0.2
      tip.visible = welding
      tip.updateWorldMatrix(true, false)
      sparks.update(t, welding ? live.worldToLocal(tip.getWorldPosition(v)) : null)
    },
  }
}

/** AFMU (unité de maintenance automatique) : écran d'état, bande jaune, bras replié. */
const afmu: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.6, 0.04, 0.48, lit(C.steelDark), 0, 0.02, 0), box(0.56, 0.62, 0.44, lit(C.steel), 0, 0.35, 0, 0.03))
  g.add(box(0.3, 0.16, 0.01, glow('#39d98a'), -0.08, 0.47, 0.225), box(0.56, 0.05, 0.01, lit(C.hazard), 0, 0.15, 0.222))
  g.add(barZ(0.03, 0.01, glow(ED_ORANGE), 0.18, 0.47, 0.226, 10))
  for (let i = 0; i < 4; i++) g.add(box(0.4, 0.015, 0.03, lit(C.black), 0, 0.665, -0.12 + i * 0.08))
  const arm = cylinder(0.02, 0.02, 0.3, lit(C.chrome), 0.31, 0.45, 0.05, 6)
  arm.rotation.x = 0.4
  g.add(arm, box(0.05, 0.05, 0.05, lit(C.steelDark), 0.31, 0.58, 0.1))
  return { solid: g }
}

/** Pile de roues de SRV. */
const tireStack: Builder = ({ random }) => {
  const g = new THREE.Group()
  for (let i = 0; i < 3; i++) {
    const x = (random() - 0.5) * 0.04, z = (random() - 0.5) * 0.04, y = 0.056 + i * 0.112
    g.add(cylinder(0.14, 0.14, 0.11, lit(C.rubber), x, y, z, 14), cylinder(0.065, 0.065, 0.114, mat.trim, x, y, z, 10))
  }
  return { solid: g }
}

// ---------------------------------------------------------------- raffinerie

/** Raffinerie : trémie pleine de minerai, fenêtre de fusion qui rougeoie, cheminée qui fume. */
const refinery: Builder = ({ random }) => {
  const g = new THREE.Group()
  const body = lit('#565a60'), dark = lit(C.steelDark)
  g.add(box(1.8, 0.1, 1.0, dark, 0, 0.05, 0), box(1.2, 0.62, 0.8, body, -0.15, 0.41, 0, 0.03))
  g.add(box(0.3, 0.2, 0.01, lit(C.rust), -0.52, 0.28, 0.405), box(0.18, 0.12, 0.01, lit(C.rustDark), 0.25, 0.58, 0.405))
  for (let i = 0; i < 12; i++) g.add(box(0.1, 0.05, 0.012, lit(i % 2 ? C.black : C.hazard), -0.7 + i * 0.1, 0.68, 0.405))
  // Grille devant la fenêtre de fusion.
  for (let i = 0; i < 4; i++) g.add(box(0.012, 0.22, 0.012, dark, -0.3 + i * 0.1, 0.4, 0.42))
  // Trémie (entonnoir carré) et minerai.
  const hopper = mesh(new THREE.CylinderGeometry(0.46, 0.22, 0.32, 4), lit(C.worn), -0.15, 0.88, 0)
  hopper.rotation.y = Math.PI / 4
  g.add(hopper)
  for (let i = 0; i < 6; i++) {
    const rock = mesh(new THREE.DodecahedronGeometry(0.07 + random() * 0.04, 0), lit(['#6e5a4a', '#5a5048', '#7d6b57'][i % 3]), -0.15 + (random() - 0.5) * 0.4, 1.06, (random() - 0.5) * 0.4)
    rock.rotation.set(random() * 3, random() * 3, 0)
    g.add(rock)
  }
  // Goulotte de sortie, tuyaux, cheminée, pupitre.
  const chute = box(0.36, 0.05, 0.3, lit(C.worn), 0.62, 0.42, 0.12)
  chute.rotation.z = -0.5
  g.add(chute)
  g.add(cylinder(0.05, 0.05, 1.1, dark, -0.66, 0.55, -0.32, 10), cylinder(0.07, 0.07, 0.4, dark, 0.3, 0.92, -0.25, 10))
  g.add(box(0.26, 0.4, 0.2, dark, 0.66, 0.2, -0.28), box(0.2, 0.1, 0.01, glow(ED_ORANGE), 0.66, 0.34, -0.175))

  const live = new THREE.Group()
  const moltenMat = new THREE.MeshBasicMaterial({ color: '#ff8a1c' })
  const smoke = puffs(8, '#8a8680', 0.3)
  live.add(part(new THREE.PlaneGeometry(0.42, 0.2), moltenMat, -0.15, 0.4, 0.412), smoke.mesh)
  const cool = new THREE.Color('#ff4a10'), hot = new THREE.Color('#ffd060')
  return {
    solid: g,
    live,
    emitter: 'hum',
    update: (t) => {
      moltenMat.color.copy(cool).lerp(hot, 0.5 + 0.3 * Math.sin(t * 3.1) + 0.2 * Math.sin(t * 7.7))
      smoke.update(t, 0.3, 1.12, -0.25, 0.8, 0.25)
    },
  }
}

/** Tapis roulant (2 m le long de x) : des blocs de minerai y défilent vers la benne. */
const conveyor: Builder = ({ random }) => {
  const g = new THREE.Group()
  const L = 2
  for (const z of [-0.2, 0.2]) g.add(box(L, 0.07, 0.04, lit('#b8860b'), 0, 0.3, z))
  for (const x of [-0.85, 0, 0.85]) for (const z of [-0.2, 0.2]) g.add(box(0.05, 0.27, 0.05, lit(C.steelDark), x, 0.135, z))
  for (let i = 0; i < 11; i++) g.add(barZ(0.04, 0.38, lit(C.chrome), -0.95 + i * 0.19, 0.29, 0, 8))
  g.add(box(L, 0.02, 0.36, lit(C.rubber), 0, 0.335, 0))
  const N = 7
  const ore = instanced(
    new THREE.DodecahedronGeometry(0.06, 0),
    Array.from({ length: N }, (_, i) => (i === 3 ? '#9a6bff' : ['#6e5a4a', '#5a5048', '#7d6b57'][i % 3])),
    new THREE.MeshLambertMaterial(),
  )
  ore.castShadow = true
  const rocks = Array.from({ length: N }, () => ({ s: 0.7 + random() * 0.6, z: (random() - 0.5) * 0.18, r: random() * 6 }))
  const live = new THREE.Group()
  live.add(ore)
  return {
    solid: g,
    live,
    update: (t) => {
      rocks.forEach((r, i) => setInstance(ore, i, -L / 2 + 0.1 + ((t * 0.12 + i / N) % 1) * (L - 0.2), 0.345 + r.s * 0.04, r.z, r.s, r.r))
      ore.instanceMatrix.needsUpdate = true
    },
  }
}

/** Tas de minerai brut, avec des cristaux qui luisent (diamants basse température, opales du vide, painite). */
const orePile: Builder = ({ random }) => {
  const g = new THREE.Group()
  const rocks = ['#6e5a4a', '#5a5048', '#7d6b57', '#4a423c']
  for (let i = 0; i < 9; i++) {
    const r = 0.1 + random() * 0.14
    const a = random() * Math.PI * 2, d = random() * 0.32
    const m = mesh(new THREE.DodecahedronGeometry(r, 0), lit(rocks[i % 4]), Math.cos(a) * d, r * 0.5, Math.sin(a) * d)
    m.rotation.set(random() * 3, random() * 3, random() * 3)
    m.scale.y = 0.75
    g.add(m)
  }
  const crystals = ['#cfe8ff', '#9a6bff', '#57e0ff', '#ff4a5a']
  for (let i = 0; i < 7; i++) {
    const a = random() * Math.PI * 2, d = 0.12 + random() * 0.3
    const c = mesh(new THREE.OctahedronGeometry(0.05 + random() * 0.03, 0), glow(crystals[i % 4]), Math.cos(a) * d, 0.14 + random() * 0.12, Math.sin(a) * d)
    c.scale.set(0.7, 1.8, 0.7)
    c.rotation.set((random() - 0.5) * 0.8, random() * 3, (random() - 0.5) * 0.8)
    g.add(c)
  }
  return { solid: g }
}

/** Laser minier monté sur trépied. */
const miningLaser: Builder = () => {
  const g = new THREE.Group()
  tripod(g, 0.5)
  g.add(cylinder(0.05, 0.06, 0.06, lit(C.steelDark), 0, 0.52, 0, 10), box(0.06, 0.12, 0.06, lit(C.steel), 0, 0.6, 0))
  g.add(box(0.2, 0.16, 0.42, lit('#3d4148'), 0, 0.72, -0.02, 0.03), barZ(0.05, 0.3, lit(C.steelDark), 0, 0.72, 0.33, 12), barZ(0.07, 0.05, mat.trim, 0, 0.72, 0.2, 12))
  for (let i = 0; i < 3; i++) g.add(box(0.012, 0.05, 0.26, lit(C.steelDark), -0.05 + i * 0.05, 0.82, -0.04))
  g.add(mesh(new THREE.CircleGeometry(0.035, 12), glow(ED_ORANGE), 0, 0.72, 0.482))
  return { solid: g }
}

export const WORKSHOP = {
  workbench,
  'tool-rack': toolRack,
  welder,
  'engineer-bench': engineerBench,
  'scrap-pile': scrapPile,
  drums,
  'pipe-run': pipeRun,
  'steam-vent': steamVent,
  cables,
  'hazard-floor': hazardFloor,
  stain,
  'work-lamp': workLamp,
  'repair-lift': repairLift,
  'robot-arm': robotArm,
  afmu,
  'tire-stack': tireStack,
  refinery,
  conveyor,
  'ore-pile': orePile,
  'mining-laser': miningLaser,
} satisfies Record<string, Builder>
