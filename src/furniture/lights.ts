import * as THREE from 'three'
import {
  barX, barZ, box, cylinder, drawnTexture, ED_ORANGE, glass, glow, holoMaterial, instanced, keepShared, lit, mesh, part, setInstance, sphere,
  type Builder,
} from './kit'

/*
 * Luminaires des quartiers (mode aménagement) : guirlande, bandeau LED et néons en forme aux
 * murs ; lampadaire arc, lanterne de papier et suspension au sol ; lampe de bureau et boule
 * plasma à poser sur un meuble. Ils éclairent surtout par leurs matériaux lumineux : la réserve
 * de vraies lumières du jeu est petite (cf. `light` dans cabin/catalog.ts).
 *
 * Un objet accroché est construit dos au mur (origine sur la face du mur, au niveau du sol,
 * contenu vers +z) ; une suspension pend à la verticale de son origine, tout entière au-dessus
 * de y = 0,7 : elle passe au-dessus d'une table ou d'un lit.
 */

const C = {
  wire: '#1d1f25',
  hook: '#dfe3e8',
  black: '#17181b',
  steelDark: '#2a2e36',
  graphite: '#30343c',
  chrome: '#b9c1cc',
  alu: '#a3abb6',
  steel: '#8a93a0',
  brass: '#c9a24a',
  woodDark: '#6b4630',
  marble: '#ece8e0',
  vein: '#cdc6bb',
  rattan: '#a8743c',
  paperHot: '#fff3dc',
  rib: '#c98f52',
  lamp: '#ffdca6',
  bulb: '#fff3d6',
}

// ---------------------------------------------------------------- textures communes

const textures = new Map<string, THREE.Texture>()

/** Texture dessinée une fois pour tous les exemplaires (jamais libérée). */
function sharedTexture(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, setup?: (t: THREE.Texture) => void) {
  let t = textures.get(key)
  if (!t) {
    t = keepShared(drawnTexture(w, h, draw))
    setup?.(t)
    textures.set(key, t)
  }
  return t
}

/**
 * Tache de lumière ronde, blanche, qui s'estompe vers le bord (lueur sur le mur).
 * @param stops opacité selon la distance au centre (0 au centre, 1 au bord)
 */
const spotTexture = (key: string, stops: [number, number][]) =>
  sharedTexture(`spot:${key}`, 64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    for (const [at, a] of stops) grad.addColorStop(at, `rgba(255, 255, 255, ${a})`)
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 64)
  })

/** Arc-en-ciel qui se répète le long du bandeau `rainbow` (il défile en décalant la texture). */
const rainbowTexture = () =>
  sharedTexture('rainbow', 128, 4, (g) => {
    for (let x = 0; x < 128; x++) {
      g.fillStyle = `hsl(${(x / 128) * 360}, 100%, 60%)`
      g.fillRect(x, 0, 1, 4)
    }
  }, (t) => (t.wrapS = THREE.RepeatWrapping))

/** Lueur d'un bandeau sur le mur, de haut en bas : [hauteur, opacité]. Elle déborde un peu au-dessus. */
const WASH: [number, number][] = [[0.8, 0.3], [0.772, 1], [0.745, 0.82], [0.71, 0.6], [0.66, 0.4], [0.59, 0.22], [0.51, 0.09], [0.42, 0]]

/**
 * Lueur d'un bandeau sur le mur : un plan de largeur w dont l'opacité, portée par les sommets,
 * suit WASH et s'estompe aux deux bouts. Les coordonnées u suivent x sur `span` (texture qui
 * défile avec la diode).
 */
function washGeometry(w: number, span: number): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(w, 1, 16, WASH.length - 1)
  const p = geo.attributes.position, uv = geo.attributes.uv
  const colors = new Float32Array(p.count * 4)
  for (let i = 0; i < p.count; i++) {
    const [y, a] = WASH[Math.floor(i / 17)]
    const x = p.getX(i)
    p.setY(i, y)
    colors.set([1, 1, 1, a * (1 - THREE.MathUtils.smoothstep(Math.abs(x) / (w / 2), 0.55, 1))], i * 4)
    uv.setX(i, x / span + 0.5)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 4))
  return geo
}

/**
 * Lueur ajoutée à ce qui est derrière (sur le mur, dans l'air). Elle échappe au tone mapping,
 * comme les hologrammes (cf. holoMaterial) : sinon elle virerait au blanc sale.
 */
function haloMaterial(color: string, opacity: number, map: THREE.Texture | null = null, vertexColors = false) {
  return new THREE.MeshBasicMaterial({ color, map, opacity, vertexColors, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
}

/** Cône de lumière sous un abat-jour : l'opacité, portée par les sommets, s'efface vers le bas. */
function beamGeometry(rTop: number, rBottom: number, h: number): THREE.CylinderGeometry {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, h, 16, 4, true)
  const p = geo.attributes.position
  const colors = new Float32Array(p.count * 4)
  for (let i = 0; i < p.count; i++) {
    const k = 0.5 + p.getY(i) / h
    colors.set([1, 1, 1, k * k], i * 4)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 4))
  return geo
}

/** Tige droite entre deux points (bras articulés, pieds). */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material, seg = 6): THREE.Mesh {
  const d = new THREE.Vector3().subVectors(b, a)
  const c = cylinder(r, r, d.length(), m, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, seg)
  c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())
  return c
}

// ---------------------------------------------------------------- aux murs

/** Guirlandes : couleurs des ampoules (elles alternent) et de leur lueur sur le mur. */
const GARLANDS: Record<string, { bulbs: string[]; glows: string[] }> = {
  warm: { bulbs: ['#ffe3b0'], glows: ['#ffb35c'] },
  multi: { bulbs: ['#ff6a5a', '#ffd23c', '#6aff8a', '#6ab8ff', '#ff6ad5'], glows: ['#ff3b2f', '#ffb81c', '#2fff5a', '#3a8cff', '#ff3bd0'] },
  blue: { bulbs: ['#d6f2ff'], glows: ['#5ab8ff'] },
}

/** Guirlande lumineuse : un fil sombre en deux festons entre trois crochets, seize ampoules qui scintillent. */
const stringLights: Builder = ({ label, random }) => {
  const c = GARLANDS[label ?? ''] ?? GARLANDS.warm
  const g = new THREE.Group()
  const wire = lit(C.wire), top = 0.86, z = 0.016
  const hooks = [-0.45, 0, 0.45]
  // Chaînette entre deux crochets (u de -1 à 1) : 10 cm de creux au milieu.
  const sag = (u: number) => (0.1 * (Math.cosh(1.2) - Math.cosh(1.2 * u))) / (Math.cosh(1.2) - 1)
  const spots: [number, number][] = []
  for (let f = 0; f < 2; f++) {
    const x0 = hooks[f], x1 = hooks[f + 1]
    const at = (u: number) => new THREE.Vector3(x0 + ((u + 1) / 2) * (x1 - x0), top - sag(u), z)
    const curve = new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, i) => at(-1 + i / 4)))
    g.add(mesh(new THREE.TubeGeometry(curve, 24, 0.003, 4, false), wire))
    for (let i = 0; i < 8; i++) {
      const p = at(-0.8 + (i * 1.6) / 7)
      spots.push([p.x, p.y])
    }
  }
  for (const x of hooks) g.add(box(0.014, 0.02, 0.005, lit(C.hook), x, top + 0.008, 0.0025), barZ(0.003, 0.018, lit(C.hook), x, top + 0.002, 0.011, 6))
  // Le bout du fil pend du dernier crochet jusqu'au boîtier à piles.
  g.add(cylinder(0.003, 0.003, 0.06, wire, 0.45, top - 0.03, z, 4))
  g.add(box(0.024, 0.04, 0.012, lit(C.black), 0.45, top - 0.078, 0.01, 0.004), box(0.007, 0.007, 0.003, glow('#7dffa8'), 0.45, top - 0.07, 0.017))
  for (const [x, y] of spots) g.add(cylinder(0.005, 0.006, 0.012, wire, x, y - 0.008, z, 6))

  const tints = spots.map((_, i) => new THREE.Color(c.bulbs[i % c.bulbs.length]))
  const halos = spots.map((_, i) => new THREE.Color(c.glows[i % c.glows.length]))
  const bulbs = instanced(new THREE.SphereGeometry(0.011, 8, 6).scale(1, 1.3, 1), spots.map((_, i) => c.bulbs[i % c.bulbs.length]))
  const glows = instanced(
    new THREE.PlaneGeometry(0.11, 0.11),
    spots.map((_, i) => c.glows[i % c.glows.length]),
    haloMaterial('#ffffff', 0.8, spotTexture('bulb', [[0, 1], [0.25, 0.7], [0.6, 0.2], [1, 0]])),
  )
  spots.forEach(([x, y], i) => {
    setInstance(bulbs, i, x, y - 0.026, z + 0.002)
    setInstance(glows, i, x, y - 0.03, 0.002)
  })
  const twinkle = spots.map(() => ({ speed: 0.8 + random() * 1.6, phase: random() * Math.PI * 2 }))
  const tint = new THREE.Color()
  const live = new THREE.Group()
  live.add(glows, bulbs)
  return {
    solid: g,
    live,
    update: (t) => {
      for (let i = 0; i < twinkle.length; i++) {
        const k = 0.72 + 0.28 * Math.sin(t * twinkle[i].speed + twinkle[i].phase)
        bulbs.setColorAt(i, tint.copy(tints[i]).multiplyScalar(0.6 + 0.4 * k))
        glows.setColorAt(i, tint.copy(halos[i]).multiplyScalar(k))
      }
      bulbs.instanceColor!.needsUpdate = true
      glows.instanceColor!.needsUpdate = true
    },
  }
}

/** Bandeaux LED : couleur de la diode et de sa lueur (`rainbow` : les couleurs défilent). */
const LEDS: Record<string, { diode: string; wash: string }> = {
  cyan: { diode: '#b0f6ff', wash: '#39d5ff' },
  magenta: { diode: '#ffb8f2', wash: '#ff3bd0' },
  amber: { diode: '#ffe2a8', wash: '#ffa630' },
}

/** Bandeau LED sous le bandeau haut du mur, qui baigne le mur d'une lueur douce. Couleur : `label`. */
const ledStrip: Builder = ({ label }) => {
  const rainbow = label === 'rainbow'
  const c = LEDS[label ?? ''] ?? LEDS.cyan
  const g = new THREE.Group()
  const y = 0.78, len = 0.9
  // Profilé d'aluminium, embouts, et le câble qui file dans le bandeau du mur.
  g.add(box(len, 0.02, 0.014, lit(C.alu, 'metal'), 0, y + 0.002, 0.007))
  for (const x of [-len / 2, len / 2]) g.add(box(0.01, 0.024, 0.016, lit(C.steelDark, 'metal'), x, y + 0.002, 0.008))
  g.add(box(0.005, 0.05, 0.005, lit(C.wire), -0.42, y + 0.037, 0.004), box(0.045, 0.024, 0.01, lit(C.steelDark, 'metal'), -0.42, y + 0.074, 0.005, 0.003))
  const live = new THREE.Group()
  const map = rainbow ? rainbowTexture() : null
  live.add(part(washGeometry(len, len - 0.02), haloMaterial(map ? '#ffffff' : c.wash, 0.7, map, true), 0, 0, 0.002))
  if (map) live.add(part(new THREE.PlaneGeometry(len - 0.02, 0.012), new THREE.MeshBasicMaterial({ map }), 0, y - 0.002, 0.0142))
  else g.add(box(len - 0.02, 0.012, 0.003, glow(c.diode), 0, y - 0.002, 0.0142))
  return { solid: g, live, update: map ? (t) => (map.offset.x = (t * 0.12) % 1) : undefined }
}

/** Néons en forme : chaque tracé a sa couleur de tube et de cœur (dessin sur 256 × 256, y vers le bas). */
const NEON_SHAPES: Record<string, { tube: string; core: string; path: (g: CanvasRenderingContext2D) => void }[]> = {
  planet: [
    {
      tube: '#39d5ff', core: '#e2fbff',
      path: (g) => {
        g.arc(128, 128, 58, 0, Math.PI * 2)
        // Un reflet sur le haut de la planète.
        const a = Math.PI * 1.12
        g.moveTo(128 + Math.cos(a) * 40, 128 + Math.sin(a) * 40)
        g.arc(128, 128, 40, a, Math.PI * 1.38)
      },
    },
    {
      // L'anneau passe devant la planète, et s'interrompt derrière elle.
      tube: '#ff4fd8', core: '#ffe2f7',
      path: (g) => g.ellipse(128, 128, 106, 28, -0.32, -0.95, Math.PI + 0.95),
    },
  ],
  star: [
    {
      tube: '#ffd23c', core: '#fff7d6',
      path: (g) => {
        for (let i = 0; i <= 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 44 : 104
          g.lineTo(128 + Math.cos(a) * r, 140 + Math.sin(a) * r)
        }
        g.closePath()
      },
    },
  ],
  bolt: [
    {
      tube: ED_ORANGE, core: '#ffe6c8',
      path: (g) => {
        for (const [x, y] of [[118, 26], [180, 26], [142, 106], [178, 106], [90, 232], [112, 138], [78, 138]]) g.lineTo(x, y)
        g.closePath()
      },
    },
  ],
  cat: [
    {
      tube: '#ff6ad5', core: '#ffe2f6',
      path: (g) => {
        // Comète assise, de face : oreilles, tête, corps en poire, et la queue qui s'enroule.
        g.moveTo(90, 122)
        g.bezierCurveTo(70, 108, 68, 80, 78, 62)
        g.lineTo(82, 30)
        g.lineTo(106, 50)
        g.quadraticCurveTo(118, 46, 130, 50)
        g.lineTo(154, 30)
        g.lineTo(158, 62)
        g.bezierCurveTo(168, 80, 166, 108, 146, 122)
        g.bezierCurveTo(174, 150, 182, 204, 166, 228)
        g.lineTo(70, 228)
        g.bezierCurveTo(54, 204, 62, 150, 90, 122)
        g.moveTo(166, 226)
        g.bezierCurveTo(212, 220, 226, 174, 204, 148)
      },
    },
    {
      tube: '#7dffa8', core: '#e8fff0',
      path: (g) => {
        g.moveTo(98, 86)
        g.lineTo(104, 86)
        g.moveTo(132, 86)
        g.lineTo(138, 86)
      },
    },
  ],
  heart: [
    {
      tube: '#ff2e63', core: '#ffdbe4',
      path: (g) => {
        g.moveTo(128, 228)
        g.bezierCurveTo(60, 176, 18, 130, 34, 84)
        g.bezierCurveTo(50, 40, 110, 36, 128, 82)
        g.bezierCurveTo(146, 36, 206, 40, 222, 84)
        g.bezierCurveTo(238, 130, 196, 176, 128, 228)
      },
    },
  ],
}

/** Dessin d'un néon : halo, tube coloré, cœur presque blanc (texture partagée par variante). */
const neonTexture = (id: string) =>
  sharedTexture(`neon:${id}`, 256, 256, (g) => {
    g.lineCap = g.lineJoin = 'round'
    for (const pass of [0, 1, 2]) {
      for (const s of NEON_SHAPES[id]) {
        g.beginPath()
        s.path(g)
        g.shadowColor = s.tube
        g.shadowBlur = [26, 8, 0][pass]
        g.strokeStyle = pass < 2 ? s.tube : s.core
        g.lineWidth = [12, 9, 3.5][pass]
        g.globalAlpha = pass ? 1 : 0.85
        g.stroke()
      }
    }
  })

/** Néon en forme (planète à anneaux, étoile, éclair, Comète, cœur) sur sa plaque ronde ; il grésille parfois. */
const neonShape: Builder = ({ label, random }) => {
  const id = NEON_SHAPES[label ?? ''] ? label! : 'planet'
  const material = new THREE.MeshBasicMaterial({ map: neonTexture(id), transparent: true, depthWrite: false })
  // Lueur colorée sur le mur, autour de la plaque.
  const halo = haloMaterial(NEON_SHAPES[id][0].tube, 0.45, spotTexture('neon', [[0, 0.9], [0.68, 0.55], [1, 0]]))
  const g = new THREE.Group()
  g.add(barZ(0.19, 0.01, lit('#1b1d24'), 0, 0.6, 0.005, 32))
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(0.56, 0.56), halo, 0, 0.6, 0.002), part(new THREE.PlaneGeometry(0.38, 0.38), material, 0, 0.6, 0.0115))
  // Chaque néon a ses crises, pas tous en même temps.
  const phase = random() * 60
  return {
    solid: g,
    live,
    update: (t) => {
      const u = t + phase
      const crisis = Math.sin(u * 0.6) + Math.sin(u * 2.7) * 0.5 > 1.3
      const on = !crisis || Math.sin(u * 70) <= 0
      material.opacity = on ? 1 : 0.35
      halo.opacity = on ? 0.45 : 0.12
    },
  }
}

// ---------------------------------------------------------------- au sol

/** Lampadaire arc : socle de marbre, arc d'acier, dôme au bout, lumineux par en dessous. */
const arcLamp: Builder = () => {
  const g = new THREE.Group()
  const bz = -0.3
  g.add(box(0.24, 0.08, 0.24, lit(C.marble), 0, 0.04, bz, 0.012))
  for (const [x, z, a, l] of [[-0.03, -0.04, 0.5, 0.16], [0.05, 0.035, -0.35, 0.11], [-0.07, 0.07, 1.2, 0.06]]) {
    const vein = box(l, 0.002, 0.003, lit(C.vein), x, 0.0805, bz + z)
    vein.rotation.y = a
    g.add(vein)
  }
  g.add(cylinder(0.022, 0.026, 0.03, lit(C.steelDark, 'metal'), 0, 0.094, bz, 10))
  const arc = new THREE.CubicBezierCurve3(
    new THREE.Vector3(0, 0.09, bz), new THREE.Vector3(0, 1.26, bz - 0.02), new THREE.Vector3(0, 1.2, 0.28), new THREE.Vector3(0, 1.0, 0.3),
  )
  g.add(mesh(new THREE.TubeGeometry(arc, 40, 0.011, 6, false), lit(C.chrome, 'metal')))
  // Dôme : un liseré lumineux au bord, l'ampoule qui dépasse, le dessous qui luit.
  const shade = mesh(new THREE.SphereGeometry(0.13, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), lit(C.steel, 'metal'), 0, 0.9, 0.3)
  shade.scale.y = 0.8
  g.add(shade, sphere(0.016, lit(C.chrome, 'metal'), 0, 1.0, 0.3, 8))
  const rim = mesh(new THREE.TorusGeometry(0.13, 0.008, 4, 24), glow(C.bulb), 0, 0.9, 0.3)
  rim.rotation.x = Math.PI / 2
  g.add(rim, mesh(new THREE.CircleGeometry(0.126, 16), glow(C.lamp), 0, 0.898, 0.3).rotateX(Math.PI / 2))
  g.add(sphere(0.036, glow(C.bulb), 0, 0.88, 0.3, 10))
  const beam = haloMaterial(C.lamp, 0.22, null, true)
  beam.side = THREE.DoubleSide
  const live = new THREE.Group()
  live.add(part(beamGeometry(0.12, 0.18, 0.45), beam, 0, 0.675, 0.3))
  return { solid: g, live }
}

/** Papier de riz éclairé de l'intérieur, du bord au plus près de l'ampoule. */
const PAPER = ['#f0b468', '#ffd494', '#ffe6bd', '#fff4dc']

/** Lampe de papier de riz sur un pied de bois fin : trois boules empilées (`round`) ou une colonne (`tall`). */
const paperLantern: Builder = ({ label }) => {
  const g = new THREE.Group()
  const rib = glow(C.rib), wood = lit(C.woodDark, 'wood')
  const ring = (r: number, y: number, tube: number, m: THREE.Material) => {
    const o = mesh(new THREE.TorusGeometry(r, tube, 3, 16), m, 0, y, 0)
    o.rotation.x = Math.PI / 2
    g.add(o)
  }
  // Le papier est posé par bandes entre les nervures, plus claires là où la lumière le traverse.
  if (label === 'tall') {
    const y0 = 0.14, h = 0.58, r = 0.14, n = 14
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2
      g.add(rod(new THREE.Vector3(Math.cos(a) * 0.13, 0.003, Math.sin(a) * 0.13), new THREE.Vector3(Math.cos(a) * 0.1, y0 + 0.01, Math.sin(a) * 0.1), 0.007, wood))
    }
    for (let k = 0; k < n; k++) {
      // L'ampoule est un peu au-dessus du milieu de la colonne.
      const near = 1 - Math.abs((k + 0.5) / n - 0.55) * 2
      const shade = PAPER[THREE.MathUtils.clamp(Math.round(near * 3.4), 0, 3)]
      g.add(mesh(new THREE.CylinderGeometry(r, r, h / n, 16, 1, true), glow(shade), 0, y0 + ((k + 0.5) * h) / n, 0))
      if (k) ring(r + 0.001, y0 + (k * h) / n, 0.0022, rib)
    }
    g.add(mesh(new THREE.CircleGeometry(r, 16), glow(C.paperHot), 0, y0 + h - 0.006, 0).rotateX(-Math.PI / 2))
    for (const y of [y0, y0 + h]) ring(r + 0.002, y, 0.006, wood)
  } else {
    g.add(cylinder(0.09, 0.1, 0.02, wood, 0, 0.01, 0, 16), cylinder(0.008, 0.008, 0.1, wood, 0, 0.07, 0, 6))
    const ks = [-1, -0.62, -0.31, 0, 0.31, 0.62, 1]
    for (const [r, y] of [[0.15, 0.23], [0.125, 0.475], [0.1, 0.67]]) {
      for (let i = 0; i < 6; i++) {
        const top = Math.acos(ks[i + 1]), bottom = Math.acos(ks[i])
        g.add(mesh(new THREE.SphereGeometry(r, 16, 2, 0, Math.PI * 2, top, bottom - top), glow(PAPER[1 + Math.min(i, 5 - i)]), 0, y, 0))
        if (i) ring(Math.sqrt(1 - ks[i] * ks[i]) * r + 0.001, y + ks[i] * r, 0.0022, rib)
      }
    }
    g.add(cylinder(0.012, 0.016, 0.016, wood, 0, 0.775, 0, 8))
  }
  return { solid: g }
}

/** Axes des six grands cercles d'une boule de rotin tressée (ceux de l'icosaèdre). */
const PHI = (1 + Math.sqrt(5)) / 2
const WEAVE = [[0, 1, PHI], [0, 1, -PHI], [1, PHI, 0], [1, -PHI, 0], [PHI, 0, 1], [-PHI, 0, 1]].map(([x, y, z]) => new THREE.Vector3(x, y, z).normalize())

/**
 * Suspension, qui pend du plafond (y = 1) : dôme de métal (`dome`), globe de verre (`globe`)
 * ou boule de rotin tressée (`rattan`). L'origine est au sol, à la verticale de la lampe.
 */
const pendantLamp: Builder = ({ label }) => {
  const g = new THREE.Group()
  const live = new THREE.Group()
  g.add(cylinder(0.04, 0.045, 0.012, lit(C.steelDark, 'metal'), 0, 0.994, 0, 14))
  const cable = (bottom: number) => g.add(cylinder(0.003, 0.003, 0.988 - bottom, lit(C.wire), 0, (0.988 + bottom) / 2, 0, 4))
  if (label === 'globe') {
    cable(0.9)
    g.add(cylinder(0.02, 0.028, 0.03, lit(C.brass, 'metal'), 0, 0.89, 0, 12), sphere(0.074, glow(C.paperHot), 0, 0.8, 0, 14))
    live.add(part(new THREE.SphereGeometry(0.09, 18, 12), glass('#fff3dc', 0.22), 0, 0.8, 0))
  } else if (label === 'rattan') {
    const y = 0.826
    cable(y + 0.126)
    const cane = lit(C.rattan, 'wood')
    for (const axis of WEAVE) {
      const strip = mesh(new THREE.TorusGeometry(0.12, 0.0045, 4, 24), cane, 0, y, 0)
      strip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis)
      g.add(strip)
    }
    g.add(cylinder(0.012, 0.012, 0.012, cane, 0, y + 0.122, 0, 8), sphere(0.04, glow(C.bulb), 0, y, 0, 10))
    live.add(part(new THREE.SphereGeometry(0.105, 16, 12), holoMaterial(null, '#ff9a3c', 0.3, 0, true), 0, y, 0))
  } else {
    cable(0.84)
    g.add(cylinder(0.016, 0.02, 0.03, lit(C.brass, 'metal'), 0, 0.826, 0, 10))
    const shade = mesh(new THREE.SphereGeometry(0.12, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), lit(C.graphite), 0, 0.73, 0)
    shade.scale.y = 0.72
    const rim = mesh(new THREE.TorusGeometry(0.12, 0.008, 4, 24), glow(C.bulb), 0, 0.73, 0)
    rim.rotation.x = Math.PI / 2
    g.add(shade, rim, mesh(new THREE.CircleGeometry(0.116, 16), glow(C.lamp), 0, 0.728, 0).rotateX(Math.PI / 2))
    g.add(sphere(0.028, glow(C.bulb), 0, 0.729, 0, 10))
  }
  return { solid: g, live: live.children.length ? live : undefined }
}

// ---------------------------------------------------------------- à poser

/** Teintes des lampes de bureau : bras et tête, articulations. */
const DESK_LAMPS: Record<string, [string, string]> = {
  black: ['#23262d', '#b9c1cc'],
  white: ['#e9ecef', '#7a8292'],
  orange: [ED_ORANGE, '#2a2e36'],
  teal: ['#2f9a96', '#d9dde2'],
}

/** Lampe de bureau articulée : socle rond, deux bras à ressort, tête conique inclinée. Teinte : `label`. */
const deskLamp: Builder = ({ label }) => {
  const [paint, joint] = DESK_LAMPS[label ?? ''] ?? DESK_LAMPS.black
  const body = lit(paint), metal = lit(joint)
  // Le socle recule un peu : la tête avance, la lampe reste centrée sur son origine.
  const lamp = new THREE.Group()
  lamp.position.z = -0.024
  const shoulder = new THREE.Vector3(0, 0.035, -0.02), elbow = new THREE.Vector3(0, 0.165, -0.06), wrist = new THREE.Vector3(0, 0.235, 0.045)
  lamp.add(cylinder(0.05, 0.055, 0.016, body, 0, 0.008, 0, 16), cylinder(0.014, 0.018, 0.024, body, 0, 0.028, -0.02, 8))
  for (const x of [-0.007, 0.007]) {
    lamp.add(rod(shoulder.clone().setX(x), elbow.clone().setX(x), 0.0032, body), rod(elbow.clone().setX(x), wrist.clone().setX(x), 0.0032, body))
  }
  for (const p of [shoulder, elbow, wrist]) lamp.add(barX(0.007, 0.024, metal, p.x, p.y, p.z, 8))
  lamp.add(rod(new THREE.Vector3(0.012, 0.05, -0.028), new THREE.Vector3(0.012, 0.14, -0.056), 0.0022, metal, 4))
  // Tête : un cône ouvert vers l'avant et le bas, l'ampoule au fond.
  const head = new THREE.Group()
  head.position.copy(wrist)
  head.rotation.x = -0.9
  head.add(mesh(new THREE.CylinderGeometry(0.014, 0.038, 0.06, 14, 1, true), body, 0, -0.03, 0), cylinder(0.016, 0.016, 0.016, body, 0, 0.004, 0, 10))
  head.add(mesh(new THREE.CircleGeometry(0.035, 14), glow(C.bulb), 0, -0.057, 0).rotateX(Math.PI / 2), sphere(0.017, glow(C.bulb), 0, -0.052, 0, 8))
  lamp.add(head)
  const g = new THREE.Group()
  g.add(lamp)
  return { solid: g }
}

/** Filaments des boules plasma (lumière ajoutée, couleurs par sommet) : un matériau pour toutes. */
let filamentMaterial: THREE.LineBasicMaterial | null = null

/** Boule plasma : sous le verre, des filaments violets et roses dansent du cœur jusqu'à la paroi. */
const plasmaBall: Builder = ({ random }) => {
  const g = new THREE.Group()
  const cy = 0.145, R = 0.066
  g.add(cylinder(0.045, 0.06, 0.07, lit('#141519'), 0, 0.035, 0, 16), cylinder(0.047, 0.047, 0.01, lit(C.steelDark, 'metal'), 0, 0.075, 0, 16))
  g.add(box(0.012, 0.007, 0.004, glow('#ff5ad2'), 0, 0.03, 0.054), cylinder(0.006, 0.01, cy - 0.08, lit('#2a2233'), 0, (0.08 + cy) / 2, 0, 6))
  g.add(sphere(0.014, glow('#ffd6fb'), 0, cy, 0, 10))
  const live = new THREE.Group()
  live.add(part(new THREE.SphereGeometry(0.03, 12, 8), holoMaterial(null, '#ff6ae6', 0.45, 0, true), 0, cy, 0))
  live.add(part(new THREE.SphereGeometry(0.064, 16, 12), holoMaterial(null, '#8a3dff', 0.2, 0, true), 0, cy, 0))
  live.add(part(new THREE.SphereGeometry(R + 0.004, 18, 12), glass('#dccbff', 0.16), 0, cy, 0))
  // Filaments : 7 lignes brisées de 6 segments, recalculées à chaque image.
  const N = 7, S = 6
  const pos = new Float32Array(N * S * 6), col = new Float32Array(N * S * 6)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  filamentMaterial ??= keepShared(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
  const lines = new THREE.LineSegments(geo, filamentMaterial)
  lines.position.y = cy
  lines.frustumCulled = false
  live.add(lines)
  const hot = new THREE.Color('#ffd8ff'), tones = [new THREE.Color('#a24dff'), new THREE.Color('#ff4fd0')]
  const seeds = Array.from({ length: N }, (_, i) => ({
    theta: 0.45 + random() * 1.4, phi: random() * Math.PI * 2, spin: (0.25 + random() * 0.5) * (random() < 0.5 ? -1 : 1), phase: random() * 6, tone: tones[i % 2],
  }))
  /** Écrit un sommet (position, couleur) à l'indice `o` des deux tableaux. */
  const put = (o: number, x: number, y: number, z: number, r: number, gr: number, b: number) => {
    pos[o] = x
    pos[o + 1] = y
    pos[o + 2] = z
    col[o] = r
    col[o + 1] = gr
    col[o + 2] = b
  }
  return {
    solid: g,
    live,
    update: (t) => {
      for (let i = 0; i < N; i++) {
        const s = seeds[i]
        const th = s.theta + 0.3 * Math.sin(t * 0.7 + s.phase), ph = s.phi + t * s.spin + 0.3 * Math.sin(t * 1.3 + s.phase)
        const ex = Math.sin(th) * Math.cos(ph), ey = Math.cos(th), ez = Math.sin(th) * Math.sin(ph)
        // Deux directions perpendiculaires au filament, pour le faire onduler.
        const al = Math.hypot(ez, ex) || 1
        const ax = -ez / al, az = ex / al
        const bx = ey * az, by = ez * ax - ex * az, bz = -ey * ax
        const bright = 0.45 + 0.55 * Math.abs(Math.sin(t * 9 + s.phase) * Math.sin(t * 3.1 + s.phase * 2))
        // Sommet j (0 au cœur, S contre le verre) : fin du segment j - 1 et début du segment j.
        for (let j = 0; j <= S; j++) {
          const f = j / S, w = Math.sin(Math.PI * f) * 0.011
          const u = Math.sin(j * 1.9 + t * 11 + s.phase) * w, v = Math.cos(j * 2.7 - t * 8 + s.phase) * w
          const x = ex * R * f + ax * u + bx * v, y = ey * R * f + by * v, z = ez * R * f + az * u + bz * v
          const m = bright * (1 - 0.35 * f)
          const r = (hot.r + (s.tone.r - hot.r) * f) * m, gr = (hot.g + (s.tone.g - hot.g) * f) * m, b = (hot.b + (s.tone.b - hot.b) * f) * m
          const o = (i * S + j) * 6
          if (j < S) put(o, x, y, z, r, gr, b)
          if (j > 0) put(o - 3, x, y, z, r, gr, b)
        }
      }
      geo.attributes.position.needsUpdate = true
      geo.attributes.color.needsUpdate = true
    },
  }
}

export const LIGHTS = {
  'string-lights': stringLights,
  'led-strip': ledStrip,
  'neon-shape': neonShape,
  'arc-lamp': arcLamp,
  'paper-lantern': paperLantern,
  'pendant-lamp': pendantLamp,
  'desk-lamp': deskLamp,
  'plasma-ball': plasmaBall,
} satisfies Record<string, Builder>
