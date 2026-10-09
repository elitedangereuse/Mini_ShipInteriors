import * as THREE from 'three'
import { halo } from './arcade-decor'
import { barZ, box, cylinder, drawnTexture, glow, lit, mesh, part, rng, sphere, type Builder } from './kit'

/*
 * Habillage de la cale, autour du mobilier de workshop.ts et du cœur du réacteur (cf. Deck) :
 * - salle des machines : la cage de confinement du réacteur, ses anneaux d'énergie et ses arcs,
 *   les conduits lumineux du plancher ;
 * - atelier : le palan et sa tuyère suspendue, l'étagère de pièces, les marquages au sol, les
 *   lampes grillagées ;
 * - raffinerie : la rigole de métal en fusion, les lingots qui refroidissent, le grappin à minerai ;
 * - le gyrophare, pour les deux salles de machines.
 * Presque tout se pose sans bloquer le passage (`solid: false` dans levels.ts).
 */

const C = {
  steel: '#5a5e66',
  steelDark: '#2d2f33',
  black: '#17181b',
  rust: '#7a4528',
  hazard: '#e9a917',
  chrome: '#9aa3ad',
  olive: '#5a5f3a',
  blue: '#3f5873',
  red: '#a8322a',
  energy: '#7fe6ff',
  energyCore: '#d6f8ff',
}

/** Lueur ajoutée, d'une seule teinte (cf. halo, qui prend la sienne aux sommets). */
function aura(color: string, opacity: number): THREE.MeshBasicMaterial {
  const m = halo(color, opacity)
  m.vertexColors = false
  m.side = THREE.DoubleSide
  return m
}

/** Décalque de sol dessiné en coordonnées du pont : `label` = « largeur x profondeur | x du centre | z du centre ». */
function floorDecal(label: string, px: number, draw: (g: CanvasRenderingContext2D, x0: number, z0: number, w: number, d: number) => void, glowing = 0): THREE.Group {
  const [size, cx, cz] = label.split('|')
  const [w, d] = size.split('x').map(Number)
  const x0 = Number(cx) - w / 2, z0 = Number(cz) - d / 2
  const map = drawnTexture(w * px, d * px, (g) => {
    g.scale(px, px)
    g.translate(-x0, -z0)
    g.lineCap = g.lineJoin = 'round'
    draw(g, x0, z0, w, d)
  })
  map.anisotropy = 8
  const material = new THREE.MeshLambertMaterial({ map, transparent: true, alphaTest: 0.4, polygonOffset: true, polygonOffsetFactor: -2 })
  if (glowing) Object.assign(material, { emissive: new THREE.Color('#ffffff'), emissiveMap: map, emissiveIntensity: glowing })
  const floor = part(new THREE.PlaneGeometry(w, d), material, 0, 0.007, 0)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  const g = new THREE.Group()
  g.add(floor)
  return g
}

/** Anneau jaune et noir, au sol. */
function hazardRing(g: CanvasRenderingContext2D, x: number, z: number, r: number, width: number, n = 28) {
  g.lineCap = 'butt'
  g.lineWidth = width
  for (let i = 0; i < n; i++) {
    g.strokeStyle = i % 2 ? '#17181b' : '#e9a917'
    g.beginPath()
    g.arc(x, z, r, (i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2 + 0.01)
    g.stroke()
  }
  g.lineCap = 'round'
}

// ---------------------------------------------------------------- salle des machines

/** Le réacteur (cf. `engine` dans levels.ts) et ce qu'il alimente : en coordonnées du pont. */
const POWER = {
  core: [1.5, 5],
  // Du socle du réacteur vers le FSD, les deux pupitres, le réservoir et la porte de l'atelier.
  runs: [
    [[1.5, 4.05], [1.5, 3.75]],
    [[0.62, 4.65], [0.45, 4.2]],
    [[0.62, 5.35], [0.45, 5.8]],
    [[0.85, 5.75], [0.5, 6.45]],
    [[2.45, 5], [3.3, 5]],
  ],
}

/**
 * Plancher de la salle des machines (`label` : cf. floorDecal) : l'anneau de sécurité du réacteur,
 * ses graduations, et les conduits d'énergie qui en partent, où courent des impulsions.
 */
const powerFloor: Builder = ({ label = '4x5|1.5|5' }) => {
  const [cx, cz] = POWER.core
  const g = floorDecal(label, 128, (c) => {
    hazardRing(c, cx, cz, 1.08, 0.09)
    c.strokeStyle = '#17181b'
    c.lineWidth = 0.02
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2, r = i % 4 ? 1.22 : 1.3
      c.beginPath()
      c.moveTo(cx + Math.cos(a) * 1.16, cz + Math.sin(a) * 1.16)
      c.lineTo(cx + Math.cos(a) * r, cz + Math.sin(a) * r)
      c.stroke()
    }
    for (const [[ax, az], [bx, bz]] of POWER.runs) {
      for (const [color, width] of [['#101216', 0.17], ['#2b6f86', 0.09], [C.energy, 0.04]] as const) {
        c.strokeStyle = color
        c.lineWidth = width
        c.beginPath()
        c.moveTo(ax, az)
        c.lineTo(bx, bz)
        c.stroke()
      }
    }
  }, 0.6)
  // Les impulsions : une par conduit, du réacteur vers ce qu'il alimente.
  const live = new THREE.Group()
  const [ox, oz] = label.split('|').slice(1).map(Number)
  const pulses = POWER.runs.map((run) => {
    const p = part(new THREE.BoxGeometry(0.09, 0.012, 0.09), glow(C.energyCore), 0, 0.016, 0)
    live.add(p)
    return { p, run }
  })
  return {
    solid: g,
    live,
    update: (t) => {
      pulses.forEach(({ p, run: [[ax, az], [bx, bz]] }, i) => {
        const k = (t * 0.9 + i * 0.37) % 1
        p.position.set(ax + (bx - ax) * k - ox, 0.016, az + (bz - az) * k - oz)
        p.visible = k < 0.92
      })
    },
  }
}

/**
 * Cage de confinement du réacteur, posée sur son socle : quatre pylônes et leur couronne, deux
 * anneaux d'énergie qui tournent autour du cœur, et des arcs qui claquent entre le cœur et eux.
 */
const reactorRig: Builder = ({ random }) => {
  const g = new THREE.Group()
  const dark = lit(C.steelDark, 'metal'), steel = lit(C.steel, 'metal')
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    const pylon = new THREE.Group()
    pylon.position.set(Math.cos(a) * 0.74, 0, Math.sin(a) * 0.74)
    pylon.rotation.y = -a
    pylon.add(box(0.16, 1.32, 0.1, dark, 0, 0.8, 0, 0.012), box(0.2, 0.12, 0.16, steel, 0, 0.2, 0), box(0.165, 0.05, 0.105, lit(C.hazard), 0, 1.2, 0), box(0.02, 0.9, 0.012, glow(C.energy), -0.081, 0.78, 0))
    // Le bras qui tient l'anneau du cœur.
    pylon.add(box(0.24, 0.035, 0.05, steel, -0.16, 0.8, 0))
    g.add(pylon)
  }
  const crown = mesh(new THREE.TorusGeometry(0.74, 0.045, 6, 32), dark, 0, 1.46, 0)
  crown.rotation.x = Math.PI / 2
  const base = mesh(new THREE.TorusGeometry(0.9, 0.02, 5, 40), glow(C.energy), 0, 0.165, 0)
  base.rotation.x = Math.PI / 2
  g.add(crown, base, cylinder(0.5, 0.5, 0.05, dark, 0, 1.47, 0, 20))

  const live = new THREE.Group()
  const rings = [0, 1].map((i) => {
    const ring = part(new THREE.TorusGeometry(0.56, 0.014, 5, 40), glow(i ? '#ffb45e' : C.energyCore), 0, 0.8, 0)
    live.add(ring)
    return ring
  })
  // Les arcs : des éclats blancs, du cœur (rayon 0,38) vers les anneaux.
  const arcMat = new THREE.MeshBasicMaterial({ color: '#f2fdff', transparent: true, opacity: 0.9 })
  const arcs = Array.from({ length: 5 }, () => {
    const pivot = new THREE.Group()
    pivot.add(part(new THREE.BoxGeometry(0.2, 0.012, 0.012), arcMat, 0.48, 0, 0))
    live.add(pivot)
    return pivot
  })
  live.add(part(new THREE.CylinderGeometry(0.62, 0.62, 1.2, 24, 1, true), aura(C.energy, 0.05), 0, 0.8, 0))
  const seed = Math.floor(random() * 1000)
  return {
    solid: g,
    live,
    update: (t) => {
      rings[0].rotation.set(t * 1.3, t * 0.7, 0)
      rings[1].rotation.set(-t * 0.9, 0, t * 1.1 + 1)
      // Douze fois par seconde, les arcs changent de place ; un sur deux est éteint.
      const flash = rng(seed + Math.floor(t * 12))
      for (const arc of arcs) {
        arc.visible = flash() < 0.45
        arc.position.y = 0.3 + flash() * 1.0
        arc.rotation.set(0, flash() * Math.PI * 2, (flash() - 0.5) * 0.9)
      }
    },
  }
}

// ---------------------------------------------------------------- gyrophare

/** Gyrophare orange, haut sur le mur (origine : la face du mur) : deux faisceaux qui tournent. */
const beacon: Builder = ({ random }) => {
  const g = new THREE.Group()
  g.add(box(0.12, 0.05, 0.12, lit(C.steelDark, 'metal'), 0, 0.93, 0.06), cylinder(0.05, 0.055, 0.03, lit(C.black), 0, 0.905, 0.07, 10))
  const live = new THREE.Group()
  live.add(part(new THREE.SphereGeometry(0.048, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffa630' }), 0, 0.89, 0.07))
  const spin = new THREE.Group()
  spin.position.set(0, 0.86, 0.07)
  const fan = new THREE.BufferGeometry()
  fan.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0.85, 0.07, 0.16, 0.85, -0.07, -0.16, 0, 0, 0, -0.85, 0.07, -0.16, -0.85, -0.07, 0.16]), 3))
  fan.setAttribute('color', new THREE.BufferAttribute(new Float32Array([1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0]), 4))
  const beam = halo('#ffa630', 0.5)
  beam.side = THREE.DoubleSide
  spin.add(new THREE.Mesh(fan, beam))
  live.add(spin)
  const phase = random() * 6
  return { solid: g, live, update: (t) => (spin.rotation.y = t * 3.2 + phase) }
}

// ---------------------------------------------------------------- atelier

/**
 * Marquages de l'atelier (`label` : cf. floorDecal) : la zone de soudure hachurée, l'aire de
 * levage sous le palan, les équerres du poste de l'ingénieur, peints au pochoir et déjà écaillés.
 */
const workshopFloor: Builder = ({ label = '4x6|5.5|4.5', random }) => {
  const g = floorDecal(label, 96, (c) => {
    // Zone de soudure : un cadre jaune et noir.
    const frame = (x: number, z: number, w: number, d: number) => {
      c.lineCap = 'butt'
      c.lineWidth = 0.07
      c.setLineDash([0.16, 0.16])
      c.strokeStyle = '#17181b'
      c.strokeRect(x, z, w, d)
      c.lineDashOffset = 0.16
      c.strokeStyle = '#e9a917'
      c.strokeRect(x, z, w, d)
      c.setLineDash([])
      c.lineDashOffset = 0
    }
    frame(3.8, 5.55, 0.95, 1.1)
    // Aire de levage : un carré jaune barré d'une croix.
    c.strokeStyle = '#e9a917'
    c.lineWidth = 0.045
    c.strokeRect(6.15, 2.85, 0.9, 0.9)
    c.beginPath()
    c.moveTo(6.15, 2.85)
    c.lineTo(7.05, 3.75)
    c.moveTo(7.05, 2.85)
    c.lineTo(6.15, 3.75)
    c.stroke()
    // Équerres aux quatre coins du poste de l'ingénieur.
    const [bx, bz, bw, bd] = [5.0, 3.85, 1.5, 1.0]
    for (const [x, z, sx, sz] of [[bx, bz, 1, 1], [bx + bw, bz, -1, 1], [bx, bz + bd, 1, -1], [bx + bw, bz + bd, -1, -1]]) {
      c.beginPath()
      c.moveTo(x + sx * 0.22, z)
      c.lineTo(x, z)
      c.lineTo(x, z + sz * 0.22)
      c.stroke()
    }
    // La peinture s'écaille.
    c.globalCompositeOperation = 'destination-out'
    for (let i = 0; i < 260; i++) c.fillRect(3.6 + random() * 3.8, 1.6 + random() * 5.8, 0.02 + random() * 0.05, 0.02 + random() * 0.04)
    c.globalCompositeOperation = 'source-over'
  })
  return { solid: g }
}

/**
 * Palan : un rail au plafond (le long de x), son chariot, la chaîne, et au bout une tuyère de
 * propulseur en révision, qui se balance à peine. On passe dessous.
 */
const chainHoist: Builder = () => {
  const g = new THREE.Group()
  const dark = lit(C.steelDark, 'metal')
  g.add(box(1.7, 0.09, 0.07, lit(C.hazard), 0, 1.44, 0), box(1.7, 0.012, 0.13, dark, 0, 1.392, 0), box(0.2, 0.09, 0.16, dark, 0, 1.33, 0, 0.01))
  for (const x of [-0.07, 0.07]) g.add(barZ(0.03, 0.17, lit(C.chrome, 'metal'), x, 1.4, 0, 8))
  const live = new THREE.Group()
  const swing = new THREE.Group()
  swing.position.y = 1.3
  // Chaîne, crochet, élingues.
  swing.add(part(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 5), lit(C.black), 0, -0.15, 0), part(new THREE.TorusGeometry(0.035, 0.012, 5, 10, Math.PI * 1.4), lit(C.hazard), 0, -0.33, 0))
  for (const x of [-0.17, 0.17]) {
    const sling = part(new THREE.CylinderGeometry(0.006, 0.006, 0.24, 4), lit(C.black), x / 2, -0.44, 0)
    sling.rotation.z = x > 0 ? 0.75 : -0.75
    swing.add(sling)
  }
  // La tuyère : carter d'acier, bande orange, col noirci, et un reste de lueur au fond.
  const nozzle = new THREE.Group()
  nozzle.position.y = -0.66
  nozzle.rotation.z = Math.PI / 2
  nozzle.add(part(new THREE.CylinderGeometry(0.13, 0.13, 0.34, 14), lit(C.steel, 'metal'), 0, 0.05, 0), part(new THREE.CylinderGeometry(0.135, 0.135, 0.05, 14), lit('#d9741f'), 0, 0.12, 0))
  nozzle.add(part(new THREE.CylinderGeometry(0.13, 0.19, 0.22, 14, 1, true), lit(C.steelDark, 'metal'), 0, -0.23, 0), part(new THREE.CylinderGeometry(0.1, 0.1, 0.01, 12), glow('#ff8a3c'), 0, -0.13, 0))
  nozzle.add(part(new THREE.CylinderGeometry(0.06, 0.09, 0.1, 10), lit(C.steelDark, 'metal'), 0, 0.27, 0))
  for (const z of [-0.134, 0.134]) nozzle.add(part(new THREE.BoxGeometry(0.03, 0.3, 0.012), lit(C.black), 0, 0.05, z))
  swing.add(nozzle)
  live.add(swing)
  return { solid: g, live, update: (t) => swing.rotation.set(Math.sin(t * 0.9) * 0.03, 0, Math.sin(t * 0.7 + 1) * 0.045) }
}

/** Étagère de pièces, adossée au mur : caisses, bobines de câble, jerricans, une caisse à outils et une cellule d'énergie qui luit. */
const partsShelf: Builder = ({ random }) => {
  const g = new THREE.Group()
  const w = 1.2, d = 0.3
  const post = lit(C.rust), shelf = lit(C.steelDark, 'metal')
  for (const x of [-w / 2 + 0.02, w / 2 - 0.02]) for (const z of [0.03, d - 0.01]) g.add(box(0.035, 0.98, 0.035, post, x, 0.49, z))
  // Pas de tablette au-dessus : vu d'en haut, on voit ce qu'il y a sur le dernier rayon.
  const levels = [0.08, 0.42, 0.76]
  for (const y of levels) g.add(box(w, 0.025, d, shelf, 0, y, d / 2 + 0.01))
  const colors = [C.olive, C.blue, C.red, C.steel, '#6b6358']
  levels.forEach((y, row) => {
    let x = -w / 2 + 0.12
    // La cellule d'énergie prend le bout du rayon du haut.
    const end = w / 2 - (row === 2 ? 0.3 : 0.12)
    while (x < end) {
      const kind = Math.floor(random() * 4), top = y + 0.0125
      if (kind === 0) {
        const s = 0.16 + random() * 0.06
        g.add(box(s, s * 0.8, 0.2, lit(colors[Math.floor(random() * colors.length)]), x, top + s * 0.4, d / 2), box(s + 0.004, 0.02, 0.204, lit(C.black), x, top + s * 0.55, d / 2))
        x += s + 0.05
      } else if (kind === 1) {
        // Bobine de câble.
        g.add(barZ(0.09, 0.03, lit('#6b4a2a'), x, top + 0.09, d / 2 - 0.07, 12), barZ(0.09, 0.03, lit('#6b4a2a'), x, top + 0.09, d / 2 + 0.07, 12), barZ(0.065, 0.12, lit(random() < 0.5 ? '#d9741f' : C.black), x, top + 0.09, d / 2, 10))
        x += 0.24
      } else if (kind === 2) {
        g.add(box(0.1, 0.2, 0.18, lit(random() < 0.5 ? C.red : C.olive), x, top + 0.1, d / 2, 0.012), box(0.03, 0.03, 0.03, lit(C.black), x - 0.02, top + 0.21, d / 2 - 0.05))
        x += 0.16
      } else {
        g.add(box(0.22, 0.1, 0.14, lit(C.red), x, top + 0.05, d / 2, 0.008), box(0.1, 0.012, 0.02, lit(C.chrome, 'metal'), x, top + 0.115, d / 2))
        x += 0.28
      }
    }
    // Sur le rayon du haut, la cellule d'énergie.
    if (row === 2) g.add(cylinder(0.045, 0.045, 0.14, glow(C.energy), w / 2 - 0.14, y + 0.0825, d / 2, 10), cylinder(0.05, 0.05, 0.025, lit(C.steelDark, 'metal'), w / 2 - 0.14, y + 0.1625, d / 2, 10))
  })
  return { solid: g }
}

/**
 * Lampe d'atelier pendue au plafond, sous sa grille (`label` = bare : une ampoule nue au bout de
 * son fil) : l'ampoule, et son cône de lumière.
 */
const cageLamp: Builder = ({ label }) => {
  const bare = label === 'bare'
  const g = new THREE.Group()
  g.add(cylinder(0.006, 0.006, 0.3, lit(C.black), 0, 1.35, 0, 4), cylinder(0.022, 0.028, 0.05, lit(C.steelDark, 'metal'), 0, 1.19, 0, 8), sphere(0.035, glow('#ffe2a8'), 0, 1.14, 0, 8))
  if (!bare) {
    g.add(cylinder(0.14, 0.03, 0.07, lit(C.olive), 0, 1.2, 0, 14))
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      g.add(box(0.006, 0.1, 0.006, lit(C.black), Math.cos(a) * 0.05, 1.13, Math.sin(a) * 0.05))
    }
  }
  const live = new THREE.Group()
  const cone = aura('#ffd9a0', bare ? 0.07 : 0.1)
  live.add(part(new THREE.CylinderGeometry(0.06, bare ? 0.5 : 0.42, 1.1, 16, 1, true), cone, 0, 0.58, 0))
  return { solid: g, live }
}

// ---------------------------------------------------------------- raffinerie

/** Couleur du métal, du blanc de coulée au rouge sombre. */
const HEAT = ['#fff1b8', '#ffc24a', '#ff7a1c', '#c8340f', '#6b1c0c'].map((c) => new THREE.Color(c))
function heat(k: number, out: THREE.Color): THREE.Color {
  const u = THREE.MathUtils.clamp(k, 0, 1) * (HEAT.length - 1), i = Math.min(HEAT.length - 2, Math.floor(u))
  return out.copy(HEAT[i]).lerp(HEAT[i + 1], u - i)
}

/**
 * Rigole de coulée dans le plancher (le long de x ; `label` : longueur) : le métal en fusion y
 * file sous une grille, par vagues plus claires.
 */
const moltenChannel: Builder = ({ label = '1.5', random }) => {
  const len = Number(label) || 1.5
  const g = new THREE.Group()
  g.add(box(len, 0.02, 0.24, lit(C.steelDark, 'metal'), 0, 0.01, 0))
  for (let x = -len / 2 + 0.08; x < len / 2; x += 0.14) g.add(box(0.025, 0.014, 0.22, lit(C.black), x, 0.029, 0))
  const live = new THREE.Group()
  const flow = new THREE.MeshBasicMaterial({ color: '#ff7a1c' })
  live.add(part(new THREE.BoxGeometry(len - 0.04, 0.006, 0.13), flow, 0, 0.022, 0), part(new THREE.PlaneGeometry(len + 0.3, 0.7), aura('#ff6a1c', 0.2), 0, 0.012, 0).rotateX(-Math.PI / 2))
  const waves = Array.from({ length: 3 }, () => part(new THREE.BoxGeometry(0.16, 0.007, 0.1), new THREE.MeshBasicMaterial({ color: '#ffe08a' }), 0, 0.0235, 0))
  live.add(...waves)
  const phase = random() * 9
  return {
    solid: g,
    live,
    update: (t) => {
      heat(0.42 + 0.1 * Math.sin(t * 2.3 + phase), flow.color)
      waves.forEach((w, i) => (w.position.x = -len / 2 + 0.12 + (((t * 0.22 + i / 3 + phase) % 1) * (len - 0.24))))
    },
  }
}

/**
 * Table de refroidissement : six lingots sur leur grille, du plus chaud (il sort de la coulée)
 * au plus froid ; chacun pâlit, puis un neuf prend sa place.
 */
const ingotRack: Builder = ({ random }) => {
  const g = new THREE.Group()
  const dark = lit(C.steelDark, 'metal')
  for (const x of [-0.4, 0.4]) for (const z of [-0.16, 0.16]) g.add(box(0.04, 0.4, 0.04, dark, x, 0.2, z))
  g.add(box(0.9, 0.03, 0.42, dark, 0, 0.41, 0), box(0.9, 0.02, 0.42, lit(C.rust), 0, 0.12, 0))
  for (let i = 0; i < 9; i++) g.add(box(0.012, 0.012, 0.4, lit(C.black), -0.4 + i * 0.1, 0.431, 0))
  // Les pinces, et deux lingots froids rangés dessous.
  g.add(box(0.36, 0.012, 0.014, lit(C.chrome, 'metal'), 0.2, 0.445, 0.17), box(0.2, 0.05, 0.1, lit('#8a8f96', 'metal'), -0.2, 0.155, 0), box(0.2, 0.05, 0.1, lit('#8a8f96', 'metal'), 0.08, 0.155, 0.03))
  const live = new THREE.Group()
  const ingots = Array.from({ length: 6 }, (_, i) => {
    const m = new THREE.MeshBasicMaterial()
    live.add(part(new THREE.BoxGeometry(0.2, 0.055, 0.1), m, -0.28 + (i % 3) * 0.28, 0.465, i < 3 ? -0.09 : 0.09))
    return m
  })
  live.add(part(new THREE.PlaneGeometry(1.1, 0.7), aura('#ff7a1c', 0.22), 0, 0.44, 0).rotateX(-Math.PI / 2))
  const phase = random() * 20
  return {
    solid: g,
    live,
    update: (t) => ingots.forEach((m, i) => heat(((t * 0.05 + i / 6 + phase) % 1) * 1.05, m.color)),
  }
}

/**
 * Grappin à minerai, pendu à son câble au-dessus du tas : il descend, remonte un bloc d'opale du
 * vide qui luit, et recommence. Rien au sol : on passe dessous.
 */
const oreClaw: Builder = () => {
  const live = new THREE.Group()
  const dark = lit(C.steelDark, 'metal')
  const cable = part(new THREE.CylinderGeometry(0.008, 0.008, 1, 4), lit(C.black), 0, 0, 0)
  const claw = new THREE.Group()
  claw.add(part(new THREE.CylinderGeometry(0.07, 0.09, 0.08, 8), lit(C.hazard), 0, 0, 0), part(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 6), dark, 0, 0.06, 0))
  for (let i = 0; i < 3; i++) {
    const finger = new THREE.Group()
    finger.rotation.y = (i / 3) * Math.PI * 2
    const upper = part(new THREE.BoxGeometry(0.03, 0.16, 0.04), dark, 0.11, -0.08, 0)
    upper.rotation.z = 0.5
    const tip = part(new THREE.BoxGeometry(0.025, 0.12, 0.035), dark, 0.13, -0.19, 0)
    tip.rotation.z = -0.45
    finger.add(upper, tip)
    claw.add(finger)
  }
  const opal = part(new THREE.DodecahedronGeometry(0.075, 0), new THREE.MeshBasicMaterial({ color: '#9a6bff' }), 0, -0.17, 0)
  const shine = part(new THREE.SphereGeometry(0.2, 10, 8), aura('#9a6bff', 0.16), 0, -0.17, 0)
  claw.add(opal, shine)
  live.add(cable, claw)
  return {
    live,
    update: (t) => {
      // Un aller-retour de neuf secondes : il attend en haut, descend, saisit, remonte.
      const k = (t / 9) % 1
      const down = k < 0.3 ? 0 : k < 0.5 ? (k - 0.3) / 0.2 : k < 0.6 ? 1 : k < 0.85 ? 1 - (k - 0.6) / 0.25 : 0
      const y = 1.25 - 0.5 * down * down * (3 - 2 * down)
      claw.position.y = y
      claw.rotation.y = t * 0.25
      cable.position.y = (1.6 + y + 0.08) / 2
      cable.scale.y = 1.6 - y - 0.08
      opal.visible = k > 0.55 && k < 0.98
      shine.visible = opal.visible
    },
  }
}

export const HOLD_DECOR = {
  'power-floor': powerFloor,
  'reactor-rig': reactorRig,
  beacon,
  'workshop-floor': workshopFloor,
  'chain-hoist': chainHoist,
  'parts-shelf': partsShelf,
  'cage-lamp': cageLamp,
  'molten-channel': moltenChannel,
  'ingot-rack': ingotRack,
  'ore-claw': oreClaw,
} satisfies Record<string, Builder>
