import * as THREE from 'three'
import {
  beamMaterial, box, compact, cylinder, drawnTexture, ED_ORANGE, ellipseSegments, glass, glow, holoMaterial, instanced, lineMaterial, lit, mat, mesh,
  panelTexture, part, pointCloud, setInstance, type Builder,
} from './kit'
import { cobraGeometry } from './cobra'
import { tr } from '../i18n'

/*
 * Mobilier inspiré d'Elite Dangerous : poste de pilotage, cartes holographiques,
 * réacteur FSD, SRV Scarab, drones collecteurs, conteneurs, cuve d'exobiologie, et la grande
 * maquette de Cobra Mk III de la Promenade.
 */

/** Panneau holographique flottant (0,70 × 0,44), légèrement incliné vers l'arrière. Texte : « Titre|ligne|ligne ». */
const holoPanel: Builder = ({ label = tr('Systèmes|Nominal', 'Systems|Nominal') }) => {
  const live = new THREE.Group()
  const panel = part(new THREE.PlaneGeometry(0.7, 0.44), holoMaterial(panelTexture(label), ED_ORANGE, 0.9), 0, 0.86, 0)
  panel.rotation.x = -0.22
  live.add(panel, part(new THREE.BoxGeometry(0.5, 0.015, 0.03), mat.lamp, 0, 0.6, 0.05))
  return {
    live,
    update: (t) => {
      panel.position.y = 0.86 + Math.sin(t * 1.3) * 0.008
    },
  }
}

/** Siège du pilote, avec manche (à droite) et manette des gaz (à gauche) : le HOTAS. */
const pilotSeat: Builder = () => {
  const g = new THREE.Group()
  g.add(cylinder(0.13, 0.17, 0.18, mat.steelDark, 0, 0.09, 0, 12))
  g.add(box(0.52, 0.12, 0.5, mat.seat, 0, 0.24, 0.02, 0.04))
  const back = box(0.52, 0.64, 0.12, mat.seat, 0, 0.58, -0.22, 0.05)
  back.rotation.x = -0.16
  g.add(back)
  g.add(box(0.3, 0.14, 0.1, mat.seat, 0, 0.95, -0.29, 0.04))
  // Liserés orange du dossier.
  for (const x of [-0.2, 0.2]) {
    const strip = box(0.035, 0.5, 0.02, mat.trim, x, 0.57, -0.155)
    strip.rotation.x = -0.16
    g.add(strip)
  }
  // Accoudoirs, HOTAS.
  for (const x of [-0.3, 0.3]) g.add(box(0.09, 0.07, 0.42, mat.steel, x, 0.36, 0, 0.02))
  g.add(cylinder(0.018, 0.022, 0.15, mat.steelDark, 0.3, 0.46, 0.14, 8))
  g.add(box(0.05, 0.05, 0.05, mat.seat, 0.3, 0.55, 0.14, 0.015))
  g.add(box(0.02, 0.02, 0.02, mat.lampRed, 0.3, 0.58, 0.15))
  g.add(box(0.06, 0.1, 0.07, mat.seat, -0.3, 0.44, 0.12, 0.015))
  g.add(box(0.02, 0.02, 0.02, mat.lamp, -0.3, 0.5, 0.15))
  return { solid: g }
}

/** Le scanner elliptique d'Elite : anneaux, contacts sur leurs tiges, balayage. */
const radar: Builder = () => {
  const live = new THREE.Group()
  const rx = 0.34, rz = 0.2, y = 0.44
  const disc = part(new THREE.CircleGeometry(1, 40), holoMaterial(null, ED_ORANGE, 0.22), 0, y, 0)
  disc.rotation.x = -Math.PI / 2
  disc.scale.set(rx, rz, 1)
  // Anneaux et croix : un seul tracé.
  const grid = [0.33, 0.66, 1].flatMap((f) => ellipseSegments(rx * f, rz * f, y))
  grid.push(new THREE.Vector3(-rx, y, 0), new THREE.Vector3(rx, y, 0), new THREE.Vector3(0, y, -rz), new THREE.Vector3(0, y, rz))
  const rings = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(grid), lineMaterial)
  const sweep = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, y, 0), new THREE.Vector3(1, y, 0)]), lineMaterial)
  // Contacts : une tige verticale jusqu'au plan, un petit cube au bout.
  const contacts = [
    { r: 0.8, a: 0.4, h: 0.1, s: 0.15, color: ED_ORANGE },
    { r: 0.5, a: 2.1, h: -0.05, s: -0.1, color: ED_ORANGE },
    { r: 0.9, a: 3.6, h: 0.06, s: 0.08, color: '#ff3b2f' },
    { r: 0.35, a: 5, h: 0.12, s: 0.12, color: '#8ff0ff' },
    { r: 0.7, a: 4.4, h: -0.08, s: -0.06, color: ED_ORANGE },
  ]
  const stemPos = new Float32Array(contacts.length * 6)
  const stems = new THREE.LineSegments(new THREE.BufferGeometry(), lineMaterial)
  stems.geometry.setAttribute('position', new THREE.BufferAttribute(stemPos, 3))
  stems.frustumCulled = false
  const blips = instanced(new THREE.BoxGeometry(0.03, 0.03, 0.03), contacts.map((c) => c.color))
  const ship = part(new THREE.ConeGeometry(0.025, 0.06, 3), mat.lampCyan, 0, y, 0)
  ship.rotation.x = Math.PI / 2
  live.add(disc, rings, sweep, stems, blips, ship)
  return {
    live,
    update: (t) => {
      contacts.forEach((c, i) => {
        const a = c.a + t * c.s
        const x = Math.cos(a) * rx * c.r, z = Math.sin(a) * rz * c.r
        const h = y + c.h + Math.sin(t * 0.7 + i) * 0.015
        setInstance(blips, i, x, h, z)
        stemPos.set([x, y, z, x, h, z], i * 6)
      })
      blips.instanceMatrix.needsUpdate = true
      stems.geometry.attributes.position.needsUpdate = true
      // Balayage : le trait tourne et s'arrête au bord de l'ellipse.
      const a = t * 1.6
      sweep.rotation.y = -a
      sweep.scale.x = 1 / Math.hypot(Math.cos(a) / rx, Math.sin(a) / rz)
    },
  }
}

/** Socle de projecteur holographique, avec anneau lumineux et faisceau. */
function projector(g: THREE.Group, live: THREE.Group, height: number) {
  g.add(cylinder(0.3, 0.36, 0.3, mat.steelDark, 0, 0.15, 0, 16))
  g.add(cylinder(0.26, 0.3, 0.04, mat.steel, 0, 0.32, 0, 16))
  const ring = mesh(new THREE.TorusGeometry(0.27, 0.018, 6, 32), mat.lamp, 0, 0.335, 0)
  ring.rotation.x = Math.PI / 2
  g.add(ring)
  live.add(part(new THREE.CylinderGeometry(0.46, 0.24, height, 24, 1, true), holoMaterial(null, ED_ORANGE, 0.22, 1), 0, 0.34 + height / 2, 0))
}

/** Carte galactique : spirale de 2 000 étoiles, et le marqueur de la position du vaisseau. */
const galaxyMap: Builder = () => {
  const solid = new THREE.Group()
  const live = new THREE.Group()
  projector(solid, live, 0.42)
  const N = 2000
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N)
  const core = new THREE.Color('#ffd79a'), warm = new THREE.Color('#ff8424'), cold = new THREE.Color('#7fa4ff'), c = new THREE.Color()
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5
  for (let i = 0; i < N; i++) {
    let x: number, y: number, z: number
    if (i < N * 0.22) {
      // Bulbe central, un peu allongé (barre).
      x = gauss() * 0.12
      z = gauss() * 0.06
      y = gauss() * 0.03
      c.copy(core)
    } else {
      const arm = i % 2
      const r = 0.06 + Math.pow(Math.random(), 0.8) * 0.4
      const a = arm * Math.PI + r * 9 + gauss() * (0.45 - r * 0.5)
      x = Math.cos(a) * r
      z = Math.sin(a) * r
      y = gauss() * 0.012
      c.copy(Math.random() < 0.6 ? warm : cold).lerp(core, Math.random() * 0.25)
    }
    pos.set([x, y, z], i * 3)
    col.set([c.r, c.g, c.b], i * 3)
    size[i] = 0.01 + Math.random() * 0.016
  }
  const galaxy = new THREE.Group()
  galaxy.position.y = 0.78
  galaxy.rotation.x = 0.35
  galaxy.add(pointCloud(pos, col, size))
  // Marqueur « vous êtes ici » sur un bras.
  const here = part(new THREE.OctahedronGeometry(0.025), mat.lampCyan, Math.cos(0.26 * 9 + 0.3) * 0.26, 0.02, Math.sin(0.26 * 9 + 0.3) * 0.26)
  galaxy.add(here)
  live.add(galaxy)
  return {
    solid,
    live,
    update: (t) => {
      galaxy.rotation.y = t * 0.1
      here.rotation.y = t * 2
      here.scale.setScalar(1 + Math.sin(t * 4) * 0.25)
    },
  }
}

/** Carte du système : une étoile et ses planètes en orbite. */
const orrery: Builder = () => {
  const solid = new THREE.Group()
  const live = new THREE.Group()
  projector(solid, live, 0.36)
  const system = new THREE.Group()
  system.position.y = 0.74
  system.rotation.x = 0.3
  const star = part(new THREE.IcosahedronGeometry(0.06, 1), new THREE.MeshBasicMaterial({ color: '#ffe2a0' }))
  const planets = [
    { r: 0.13, s: 0.024, speed: 1.1, color: '#c9a27a' },
    { r: 0.21, s: 0.034, speed: 0.7, color: '#6fb6ff' },
    { r: 0.3, s: 0.026, speed: 0.45, color: '#ff7a4a' },
    { r: 0.4, s: 0.05, speed: 0.28, color: '#e8c890' },
  ].map((p, i) => ({ ...p, phase: i * 1.7 }))
  const orbits = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(planets.flatMap((p) => ellipseSegments(p.r, p.r))), lineMaterial)
  const bodies = instanced(new THREE.IcosahedronGeometry(1, 1), planets.map((p) => p.color))
  system.add(star, orbits, bodies)
  live.add(system)
  return {
    solid,
    live,
    update: (t) => {
      planets.forEach((p, i) => setInstance(bodies, i, Math.cos(p.phase + t * p.speed) * p.r, 0, Math.sin(p.phase + t * p.speed) * p.r, p.s))
      bodies.instanceMatrix.needsUpdate = true
      star.rotation.y = t * 0.5
    },
  }
}

/** Réacteur FSD (Frame Shift Drive), couché le long de x ; ses anneaux se chargent et flashent. */
const fsd: Builder = () => {
  const g = new THREE.Group()
  const body = cylinder(0.24, 0.24, 1.7, mat.steel, 0, 0.45, 0, 20)
  body.rotation.z = Math.PI / 2
  g.add(body)
  for (const x of [-0.85, 0.85]) {
    const cap = cylinder(0.3, 0.3, 0.14, mat.steelDark, x, 0.45, 0, 20)
    cap.rotation.z = Math.PI / 2
    g.add(cap)
    g.add(box(0.2, 0.26, 0.64, mat.steelDark, x * 0.65, 0.13, 0, 0.03))
  }
  const conduit = cylinder(0.04, 0.04, 1.3, mat.trim, 0, 0.66, -0.16, 8)
  conduit.rotation.z = Math.PI / 2
  g.add(conduit)
  // Bandes d'avertissement sur les flasques.
  for (const x of [-0.93, 0.93]) g.add(box(0.02, 0.1, 0.5, mat.trim, x, 0.45, 0))

  const ringX = [-0.5, -0.17, 0.17, 0.5]
  const rings = instanced(new THREE.TorusGeometry(0.255, 0.035, 8, 28).rotateY(Math.PI / 2), ringX.map(() => '#1b4f8a'))
  ringX.forEach((x, i) => setInstance(rings, i, x, 0.45, 0))
  const idle = new THREE.Color('#1b4f8a'), hot = new THREE.Color('#bfeaff'), flash = new THREE.Color('#ffffff'), c = new THREE.Color()
  return {
    solid: g,
    live: rings,
    update: (t) => {
      // Cycle de 9 s : veille (une onde parcourt les anneaux), charge, saut.
      const k = (t % 9) / 9
      const charge = THREE.MathUtils.smoothstep(k, 0.6, 0.93)
      ringX.forEach((_, i) => {
        const wave = 0.5 + 0.5 * Math.sin(t * 3 - i * 1.3)
        c.copy(idle).lerp(hot, Math.max(charge, wave * 0.35))
        if (k > 0.93) c.lerp(flash, 1 - (k - 0.93) / 0.07)
        rings.setColorAt(i, c)
      })
      rings.instanceColor!.needsUpdate = true
    },
  }
}

/** SRV Scarab : six roues, cabine vitrée orange, tourelle. */
const srv: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.62, 0.2, 1.0, mat.steel, 0, 0.27, 0, 0.05))
  g.add(box(0.52, 0.22, 0.5, mat.steelDark, 0, 0.47, -0.06, 0.06))
  g.add(box(0.46, 0.13, 0.05, mat.canopy, 0, 0.5, 0.19, 0.02))
  for (const x of [-0.262, 0.262]) g.add(box(0.02, 0.1, 0.3, mat.canopy, x, 0.5, -0.06))
  for (const x of [-0.34, 0.34]) {
    for (const z of [-0.34, 0, 0.34]) {
      const wheel = cylinder(0.14, 0.14, 0.11, mat.seat, x, 0.14, z, 12)
      wheel.rotation.z = Math.PI / 2
      const hub = cylinder(0.06, 0.06, 0.115, mat.trim, x, 0.14, z, 8)
      hub.rotation.z = Math.PI / 2
      g.add(wheel, hub)
    }
  }
  g.add(box(0.16, 0.08, 0.2, mat.steel, 0, 0.62, -0.2, 0.02))
  const barrel = cylinder(0.022, 0.022, 0.28, mat.steelDark, 0, 0.63, 0.0, 8)
  barrel.rotation.x = Math.PI / 2
  g.add(barrel)
  for (const x of [-0.2, 0.2]) {
    g.add(box(0.09, 0.04, 0.02, mat.lamp, x, 0.31, 0.505))
    g.add(box(0.07, 0.04, 0.02, mat.lampRed, x, 0.31, -0.505))
  }
  g.add(box(0.22, 0.02, 0.04, mat.lamp, 0, 0.585, 0.1))
  return { solid: g }
}

/** Trois drones collecteurs qui tournent au-dessus de leur centre. */
const limpets: Builder = () => {
  const model = new THREE.Group()
  model.add(cylinder(0.075, 0.085, 0.05, mat.steelLight, 0, 0, 0, 8))
  model.add(mesh(new THREE.SphereGeometry(0.05, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat.steel, 0, 0.025, 0))
  const ring = mesh(new THREE.TorusGeometry(0.084, 0.018, 4, 16), mat.lampCyan)
  ring.rotation.x = Math.PI / 2
  model.add(ring)
  model.add(mesh(new THREE.CircleGeometry(0.04, 10), mat.lampCyan, 0, -0.027, 0).rotateX(Math.PI / 2))
  const drone = compact(model)
  const live = new THREE.Group()
  const drones = [0, 1, 2].map((i) => {
    const d = drone.clone()
    d.scale.setScalar(1.7)
    live.add(d)
    return { d, phase: (i * Math.PI * 2) / 3, r: 0.6 + i * 0.1, h: 0.85 + i * 0.08, speed: i === 1 ? -0.5 : 0.45 }
  })
  return {
    live,
    update: (t) => {
      for (const l of drones) {
        const a = l.phase + t * l.speed
        l.d.position.set(Math.cos(a) * l.r, l.h + Math.sin(t * 2.2 + l.phase) * 0.04, Math.sin(a) * l.r)
        l.d.rotation.y = -a
        l.d.rotation.z = Math.sin(t * 1.7 + l.phase) * 0.15
      }
    },
  }
}

/** Palette de quatre conteneurs de cargaison, cerclés d'orange. */
const cargo: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.84, 0.06, 0.84, mat.steelDark, 0, 0.03, 0))
  for (const [x, z] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) {
    g.add(cylinder(0.16, 0.16, 0.5, mat.steelLight, x, 0.31, z, 12))
    g.add(cylinder(0.166, 0.166, 0.07, mat.trim, x, 0.44, z, 12))
    g.add(cylinder(0.09, 0.1, 0.04, mat.steelDark, x, 0.58, z, 10))
    g.add(box(0.03, 0.03, 0.02, mat.lampGreen, x, 0.44, z + 0.17))
  }
  return { solid: g }
}

/** Cuve d'exobiologie : un organisme luminescent flotte dans un liquide vert. */
const sampleTank: Builder = () => {
  const g = new THREE.Group()
  g.add(cylinder(0.2, 0.24, 0.16, mat.steelDark, 0, 0.08, 0, 14))
  g.add(cylinder(0.2, 0.2, 0.07, mat.steel, 0, 0.72, 0, 14))
  g.add(box(0.04, 0.04, 0.02, mat.lampGreen, 0, 0.1, 0.235))
  for (const a of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) g.add(cylinder(0.012, 0.012, 0.52, mat.steel, Math.cos(a) * 0.19, 0.42, Math.sin(a) * 0.19, 6))

  const live = new THREE.Group()
  const organism = part(new THREE.IcosahedronGeometry(0.075, 0), new THREE.MeshBasicMaterial({ color: '#7dffc0' }), 0, 0.42, 0)
  const spores = instanced(new THREE.SphereGeometry(0.014, 6, 4), ['#7dffa8', '#7dffa8', '#7dffa8'])
  live.add(
    part(new THREE.CylinderGeometry(0.17, 0.17, 0.52, 18, 1, true), glass('#b8ffe0'), 0, 0.42, 0),
    part(new THREE.CylinderGeometry(0.16, 0.16, 0.48, 18, 1, true), holoMaterial(null, '#3dffb0', 0.12, 0, true), 0, 0.42, 0),
    organism,
    spores,
  )
  return {
    solid: g,
    live,
    update: (t) => {
      organism.rotation.set(t * 0.4, t * 0.7, 0)
      organism.position.y = 0.42 + Math.sin(t * 1.1) * 0.04
      for (let i = 0; i < 3; i++) {
        const a = t * 0.8 + (i * Math.PI * 2) / 3
        setInstance(spores, i, Math.cos(a) * 0.11, 0.3 + ((t * 0.06 + i / 3) % 1) * 0.26, Math.sin(a) * 0.11)
      }
      spores.instanceMatrix.needsUpdate = true
    },
  }
}

/** Intensité du faisceau du Holo-Me : 1 pendant l'essayage (cf. main.ts). */
export const holoMeGlow = { value: 0 }

/** Holo-Me (comme dans Elite Dangerous) : plateforme, anneaux en rotation, faisceau orange. */
const holoMe: Builder = () => {
  const g = new THREE.Group()
  g.add(cylinder(0.46, 0.5, 0.06, lit('#2a2e36'), 0, 0.03, 0, 32))
  const floorRing = mesh(new THREE.TorusGeometry(0.42, 0.02, 8, 48), glow('#ffa04a'), 0, 0.065, 0)
  floorRing.rotation.x = Math.PI / 2
  g.add(floorRing)
  const live = new THREE.Group()
  const rings = ([[0.35, 0.36], [0.75, 0.3]] as const).map(([y, r]) => {
    const ring = part(new THREE.TorusGeometry(r, 0.012, 6, 48), glow('#ffa04a'), 0, y, 0)
    ring.rotation.x = Math.PI / 2
    live.add(ring)
    return ring
  })
  const beamMat = beamMaterial()
  beamMat.uniforms.uColor.value.set(ED_ORANGE)
  live.add(part(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 32, 1, true), beamMat, 0, 0.6, 0))
  return {
    solid: g,
    live,
    update: (t) => {
      rings[0].position.y = 0.35 + Math.sin(t * 1.3) * 0.2
      rings[1].position.y = 0.8 + Math.sin(t * 1.3 + 2) * 0.2
      for (const r of rings) r.rotation.z = t
      beamMat.uniforms.uTime.value = t
      beamMat.uniforms.uIntensity.value = 0.22 + Math.sin(t * 2.4) * 0.05 + holoMeGlow.value * 0.5
    },
  }
}

/**
 * Monument de la Promenade : une grande maquette de Cobra Mk III (1,5 d'envergure) qui flotte et
 * tourne lentement au-dessus d'un socle octogonal, anneau orange Elite, faisceau et anneaux
 * holographiques, plaque « Cobra Mk III · 3300 ». Propulseurs et verrière allumés. Autour, un
 * médaillon au sol, qu'on traverse : seul le socle arrête (cf. `extent`).
 */
const cobraMonument: Builder = () => {
  const g = new THREE.Group()
  // Médaillon : un disque sombre cerclé d'orange, et les huit rayons d'une rose des vents.
  g.add(cylinder(1.45, 1.45, 0.008, lit('#2a2e36'), 0, 0.004, 0, 48))
  for (const r of [1.4, 1.1]) {
    const ring = mesh(new THREE.RingGeometry(r - 0.03, r, 48), glow(ED_ORANGE), 0, 0.01, 0)
    ring.rotation.x = -Math.PI / 2
    g.add(ring)
  }
  for (let i = 0; i < 8; i++) {
    const ray = box(0.025, 0.004, 0.45, glow(i % 2 ? '#8ff0ff' : ED_ORANGE), 0, 0.011, 0)
    ray.position.set(Math.sin((i * Math.PI) / 4) * 0.85, 0.011, Math.cos((i * Math.PI) / 4) * 0.85)
    ray.rotation.y = (i * Math.PI) / 4
    g.add(ray)
  }
  g.add(cylinder(0.55, 0.6, 0.12, mat.steelDark, 0, 0.06, 0, 8), cylinder(0.5, 0.5, 0.02, glow(ED_ORANGE), 0, 0.125, 0, 8))
  g.add(cylinder(0.4, 0.46, 0.22, mat.steel, 0, 0.24, 0, 8), cylinder(0.3, 0.3, 0.015, glow('#8ff0ff'), 0, 0.355, 0, 24))
  const plate = drawnTexture(256, 96, (c) => {
    c.fillStyle = '#17181b'
    c.fillRect(0, 0, 256, 96)
    c.strokeStyle = ED_ORANGE
    c.lineWidth = 4
    c.strokeRect(4, 4, 248, 88)
    c.fillStyle = ED_ORANGE
    c.textAlign = 'center'
    c.font = '800 30px system-ui, sans-serif'
    c.fillText('COBRA MK III', 128, 42)
    c.fillStyle = '#e8e4dc'
    c.font = '500 16px system-ui, sans-serif'
    c.fillText(tr('Faulcon DeLacy · depuis 3300', 'Faulcon DeLacy · since 3300'), 128, 72)
  })
  // Plaque sur la face avant (+z) et sur la face arrière du socle.
  for (const s of [1, -1]) {
    const p = part(new THREE.PlaneGeometry(0.34, 0.13), new THREE.MeshBasicMaterial({ map: plate }), 0, 0.24, s * 0.43)
    p.rotation.y = s > 0 ? 0 : Math.PI
    g.add(p)
  }
  const live = new THREE.Group()
  const ship = new THREE.Group()
  ship.position.y = 1
  const hull = mesh(cobraGeometry(), lit('#d4d8de'))
  hull.scale.setScalar(0.75)
  ship.add(hull)
  // Liseré orange sous le nez, verrière, propulseurs.
  ship.add(part(new THREE.BoxGeometry(0.4, 0.014, 0.04), glow(ED_ORANGE), 0, -0.012, 0.52))
  ship.add(part(new THREE.BoxGeometry(0.16, 0.04, 0.08), glow('#8ff0ff'), 0, 0.08, 0.27))
  for (const x of [-0.19, 0.19]) ship.add(part(new THREE.BoxGeometry(0.14, 0.06, 0.02), glow('#9fd8ff'), x, 0.012, -0.34))
  live.add(ship)
  const beam = part(new THREE.CylinderGeometry(0.28, 0.3, 0.6, 24, 1, true), holoMaterial(null, '#8ff0ff', 0.14, 1), 0, 0.66, 0)
  live.add(beam)
  const rings = [0, 1].map((i) => {
    const r = part(new THREE.TorusGeometry(0.85 + i * 0.1, 0.007, 4, 48), holoMaterial(null, i ? ED_ORANGE : '#8ff0ff', 0.7), 0, 1, 0)
    r.rotation.x = Math.PI / 2
    live.add(r)
    return r
  })
  return {
    solid: g,
    live,
    update(t) {
      ship.rotation.y = t * 0.25
      ship.rotation.z = Math.sin(t * 0.6) * 0.18
      ship.position.y = 1 + Math.sin(t * 0.9) * 0.04
      rings[0].rotation.set(Math.PI / 2 + Math.sin(t * 0.5) * 0.25, 0, t * 0.3)
      rings[1].rotation.set(Math.PI / 2 + Math.cos(t * 0.4) * 0.2, 0, -t * 0.2)
    },
    extent: new THREE.Box3(new THREE.Vector3(-0.6, 0, -0.6), new THREE.Vector3(0.6, 1.2, 0.6)),
  }
}

export const ELITE = {
  'cobra-monument': cobraMonument,
  'holo-me': holoMe,
  'pilot-seat': pilotSeat,
  radar,
  'holo-panel': holoPanel,
  'galaxy-map': galaxyMap,
  orrery,
  fsd,
  srv,
  limpets,
  cargo,
  'sample-tank': sampleTank,
} satisfies Record<string, Builder>
