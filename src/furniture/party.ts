import * as THREE from 'three'
import {
  animatedScreen, beamMaterial, box, cylinder, drawnTexture, glass, glow, instanced, keepShared, lit, mesh, part, rng, setInstance, sphere, type Builder,
} from './kit'
import { beatAt, beatPhase } from '../tempo'

/*
 * Soirée dans les quartiers : piste de danse, boule à facettes, platines, jukebox, enceinte,
 * laser et lyre. Tout bat au même tempo (cf. tempo.ts), celui des lumières « disco » de main.ts,
 * et celui du morceau que joue le jukebox.
 */

export { beatAt, beatPulse } from '../tempo'

const mod = (a: number, n: number) => ((a % n) + n) % n

/**
 * Faisceaux, reflets : ils débordent largement du meuble, mais ne comptent pas dans sa boîte
 * (règles de pose, collisions, sélection) ni dans le cadrage des vignettes.
 */
function outOfBounds<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    const m = c as THREE.Mesh
    if (!m.geometry) return
    m.geometry.boundingBox = new THREE.Box3()
    m.frustumCulled = false
  })
  return o
}

const C = {
  black: '#15151b',
  panel: '#24242d',
  steel: '#3a3d48',
  chrome: '#c9cdd4',
  wood: '#8a5a3a',
  woodDark: '#5e3b26',
  cream: '#efe3cf',
}

// ---------------------------------------------------------------- piste de danse

const FLOOR_PALETTES: Record<string, string[]> = {
  disco: ['#ff3b6b', '#ffb13b', '#ffe94f', '#3bff8a', '#3bc8ff', '#b43bff'],
  neon: ['#ff4fd8', '#39e0ff', '#7a3bff', '#ff2f8a'],
  gold: ['#ffd27a', '#ff9f3b', '#fff1c4', '#ffb86b'],
  ice: ['#bff3ff', '#59d8ff', '#ffffff', '#6a8cff'],
}

/**
 * Piste de danse lumineuse : des dalles de 25 cm qui s'allument au tempo, en motifs qui
 * changent toutes les deux mesures (vagues, damier, anneaux, étincelles).
 * Palette et taille : `label` (« disco:1.5x1.5 » ; palettes disco, neon, gold, ice).
 */
const danceFloor: Builder = ({ label = 'disco' }) => {
  const [name, size] = label.split(':')
  const [w, d] = (size ?? '1.5x1.5').split('x').map(Number)
  const palette = (FLOOR_PALETTES[name] ?? FLOOR_PALETTES.disco).map((c) => new THREE.Color(c))
  const tile = 0.25
  const nx = Math.max(2, Math.round(w / tile)), nz = Math.max(2, Math.round(d / tile))
  const W = nx * tile, D = nz * tile
  const g = new THREE.Group()
  g.add(box(W + 0.04, 0.012, D + 0.04, lit(C.black), 0, 0.006, 0))
  for (const s of [-1, 1]) {
    g.add(box(W + 0.06, 0.02, 0.025, lit(C.chrome, 'metal'), 0, 0.01, s * (D / 2 + 0.02)))
    g.add(box(0.025, 0.02, D + 0.06, lit(C.chrome, 'metal'), s * (W / 2 + 0.02), 0.01, 0))
  }
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(tile - 0.022, 0.006, tile - 0.022), new THREE.MeshBasicMaterial(), nx * nz)
  tiles.frustumCulled = false
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) setInstance(tiles, i * nz + j, (i - (nx - 1) / 2) * tile, 0.015, (j - (nz - 1) / 2) * tile)
  const live = new THREE.Group()
  live.add(tiles)
  const off = new THREE.Color('#1c1a26'), c = new THREE.Color()
  const cx = (nx - 1) / 2, cz = (nz - 1) / 2
  const update = (t: number) => {
    const b = beatAt(t), beat = Math.floor(b), pulse = Math.exp(-(b - beat) * 4)
    const pattern = Math.floor(beat / 8) % 4
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        let on: boolean, k: number
        if (pattern === 0) {
          // Vagues de couleur en diagonale : toute la piste allumée (et toute la palette).
          on = true
          k = i + j + beat
        } else if (pattern === 1) {
          // Damier qui s'inverse à chaque temps, couleur nouvelle tous les deux temps.
          on = (i + j + beat) % 2 === 0
          k = beat >> 1
        } else if (pattern === 2) {
          // Anneaux qui partent du centre.
          const ring = Math.floor(Math.hypot(i - cx, j - cz) * 1.3 - b * 1.5)
          on = mod(ring, 3) === 0
          k = ring
        } else {
          // Étincelles : un tiers des dalles, au hasard, à chaque temps.
          const h = Math.imul(i * 73856093 ^ j * 19349663 ^ beat * 83492791, 2654435761) >>> 0
          on = h % 3 === 0
          k = h >>> 8
        }
        if (on) c.copy(palette[mod(k, palette.length)]).multiplyScalar(0.5 + 0.5 * pulse)
        else c.copy(off)
        tiles.setColorAt(i * nz + j, c)
      }
    }
    tiles.instanceColor!.needsUpdate = true
  }
  update(0)
  return { solid: g, live, update }
}

// ---------------------------------------------------------------- boule à facettes

/** Hauteur du centre de la boule : au-dessus des têtes, sous le plafond. */
const BALL_Y = 0.82
const BALL_R = 0.085

let mirrors: THREE.Texture | null = null

/** Petits miroirs carrés, du gris au blanc éclatant (partagés par toutes les boules). */
function mirrorTexture(): THREE.Texture {
  mirrors ??= keepShared(
    drawnTexture(128, 64, (g) => {
      const random = rng(11)
      g.fillStyle = '#23252c'
      g.fillRect(0, 0, 128, 64)
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 32; x++) {
          g.fillStyle = random() < 0.1 ? '#ffffff' : `hsl(215, 14%, ${40 + random() * 48}%)`
          g.fillRect(x * 4 + 0.5, y * 4 + 0.5, 3, 3)
        }
      }
    }),
  )
  return mirrors
}

const SPECKS = 96

/**
 * Boule à facettes suspendue au plafond : elle tourne, scintille, et ses reflets balaient le
 * sol et les murs de la pièce (sans en sortir). On la pose au-dessus de la piste de danse.
 */
const discoBall: Builder = ({ random, room }) => {
  const g = new THREE.Group()
  g.add(cylinder(0.035, 0.035, 0.012, lit(C.steel, 'metal'), 0, 1.0, 0, 12), box(0.045, 0.035, 0.045, lit(C.steel, 'metal'), 0, 0.975, 0))
  g.add(cylinder(0.003, 0.003, 0.05, lit(C.chrome, 'metal'), 0, 0.93, 0, 4))
  const live = new THREE.Group()
  const ball = part(new THREE.SphereGeometry(BALL_R, 24, 16), new THREE.MeshBasicMaterial({ map: mirrorTexture() }), 0, BALL_Y, 0)
  live.add(ball)
  // Reflets : des taches de lumière projetées là où les rayons de la boule touchent la pièce.
  const dirs = Array.from({ length: SPECKS }, () => ({ az: random() * Math.PI * 2, el: -0.08 - random() * 1.25, phase: random() * 6, hue: random() }))
  const positions = new Float32Array(SPECKS * 3)
  const colors = new Float32Array(SPECKS * 4)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 4))
  const specks = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      // Taches de couleurs vives (le blanc ne se verrait pas sur un sol clair), cœur plus lumineux.
      vertexShader: `
        attribute vec4 aColor;
        uniform float uScale;
        varying vec4 vColor;
        void main() {
          vColor = aColor;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = max(2.0, 0.08 * uScale * projectionMatrix[1][1]);
        }`,
      fragmentShader: `
        varying vec4 vColor;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float d = dot(p, p);
          float a = smoothstep(0.25, 0.06, d) * vColor.a;
          gl_FragColor = vec4(mix(vColor.rgb, vec3(1.0), smoothstep(0.04, 0.0, d) * 0.6), a);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
    }),
  )
  const size = new THREE.Vector2()
  specks.onBeforeRender = (renderer) => {
    ;(specks.material as THREE.ShaderMaterial).uniforms.uScale.value = renderer.getDrawingBufferSize(size).y * 0.5
  }
  live.add(outOfBounds(specks))
  const sparkles = instanced(new THREE.OctahedronGeometry(1, 0), ['#ffffff', '#ffffff', '#fff3c4', '#ffffff'])
  live.add(sparkles)
  const glints = [0, 1, 2, 3].map(() => ({ a: random() * 6, b: random() * 3 - 1.5, phase: random() * 6 }))
  const tint = new THREE.Color()
  const hit = new THREE.Vector3()
  const update = (t: number) => {
    const spin = t * 0.45
    ball.rotation.y = spin
    const holder = live.parent
    const pulse = 0.75 + 0.25 * Math.exp(-beatPhase(t) * 4)
    // Centre de la boule dans le repère du parent (le pont, pour une cabine).
    const px = holder?.position.x ?? 0, pz = holder?.position.z ?? 0, py = (holder?.position.y ?? 0) + BALL_Y, rot = holder?.rotation.y ?? 0
    // Du repère du pont à celui du meuble (tourné de `rot` autour de y).
    const cos = Math.cos(rot), sin = Math.sin(rot)
    dirs.forEach((s, i) => {
      const az = s.az + spin, dx = Math.cos(s.el) * Math.cos(az), dy = Math.sin(s.el), dz = Math.cos(s.el) * Math.sin(az)
      // Premier obstacle : le sol, ou un mur de la pièce.
      let tMin = -py / dy
      if (room) {
        if (dx < 0) tMin = Math.min(tMin, (room.minX - px) / dx)
        if (dx > 0) tMin = Math.min(tMin, (room.maxX - px) / dx)
        if (dz < 0) tMin = Math.min(tMin, (room.minZ - pz) / dz)
        if (dz > 0) tMin = Math.min(tMin, (room.maxZ - pz) / dz)
      }
      hit.set(px + dx * tMin, py + dy * tMin, pz + dz * tMin)
      const visible = hit.y > -0.01 && hit.y < 0.98 && (room || Math.hypot(hit.x - px, hit.z - pz) < 1.6)
      // Dans le repère du meuble, un peu décollé de la surface touchée.
      const lx = hit.x - px - dx * 0.01, lz = hit.z - pz - dz * 0.01
      positions[i * 3] = lx * cos - lz * sin
      // Au sol, juste au-dessus d'une piste de danse (2 cm) : on y danse sous les reflets.
      positions[i * 3 + 1] = Math.max(0.03, hit.y - (holder?.position.y ?? 0))
      positions[i * 3 + 2] = lx * sin + lz * cos
      const k = visible ? pulse * (0.6 + 0.4 * Math.sin(t * 5 + s.phase)) : 0
      tint.setHSL(mod(s.hue + t * 0.05, 1), 0.85, 0.66)
      colors.set([tint.r, tint.g, tint.b, k], i * 4)
    })
    geo.attributes.position.needsUpdate = true
    geo.attributes.aColor.needsUpdate = true
    // Éclats sur la boule elle-même.
    glints.forEach((s, i) => {
      const a = s.a + spin, k = Math.max(0, Math.sin(t * 3 + s.phase))
      setInstance(sparkles, i, Math.cos(a) * BALL_R * 1.02, BALL_Y + s.b * 0.05, Math.sin(a) * BALL_R * 1.02, 0.018 * k * k)
    })
    sparkles.instanceMatrix.needsUpdate = true
  }
  update(0)
  return { solid: g, live, update }
}

// ---------------------------------------------------------------- platines

/** Vinyle : noir, sillons, étiquette de couleur (partagé par couleur). */
const vinyls = new Map<string, THREE.MeshLambertMaterial>()
function vinylMaterial(color: string): THREE.MeshLambertMaterial {
  let m = vinyls.get(color)
  if (!m) {
    const map = keepShared(
      drawnTexture(128, 128, (g) => {
        g.fillStyle = '#111114'
        g.fillRect(0, 0, 128, 128)
        g.strokeStyle = '#26262c'
        for (let r = 20; r < 62; r += 3) {
          g.beginPath()
          g.arc(64, 64, r, 0, Math.PI * 2)
          g.stroke()
        }
        g.fillStyle = color
        g.beginPath()
        g.arc(64, 64, 18, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = '#fff'
        g.fillRect(58, 60, 12, 3)
      }),
    )
    vinyls.set(color, (m = keepShared(new THREE.MeshLambertMaterial({ map }))))
  }
  return m
}

/**
 * Platines de DJ : deux tourne-disques qui tournent, une table de mixage aux vumètres qui
 * dansent au tempo, et une façade qui affiche l'égaliseur.
 */
const djBooth: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.92, 0.42, 0.38, lit(C.black), 0, 0.21, 0, 0.01), box(0.96, 0.025, 0.42, lit(C.panel), 0, 0.432, 0))
  const decks: THREE.Group[] = []
  for (const [x, color] of [[-0.29, '#ff4fd8'], [0.29, '#39e0ff']] as const) {
    g.add(box(0.3, 0.035, 0.3, lit(C.steel, 'metal'), x, 0.462, 0, 0.006))
    // Bras de lecture.
    const arm = box(0.012, 0.012, 0.13, lit(C.chrome, 'metal'), x + 0.11, 0.49, 0.02)
    arm.rotation.y = 0.35
    g.add(arm, cylinder(0.014, 0.014, 0.02, lit(C.chrome, 'metal'), x + 0.12, 0.49, -0.05, 8))
    const platter = new THREE.Group()
    platter.position.set(x - 0.02, 0.482, 0)
    platter.add(part(new THREE.CylinderGeometry(0.115, 0.115, 0.006, 32), vinylMaterial(color)))
    decks.push(platter)
  }
  // Table de mixage : curseurs et boutons.
  g.add(box(0.2, 0.045, 0.28, lit('#1c1c24'), 0, 0.466, 0))
  for (let i = 0; i < 3; i++) g.add(box(0.01, 0.006, 0.07, lit('#0c0c10'), -0.05 + i * 0.05, 0.491, 0.07), box(0.022, 0.012, 0.014, lit(C.chrome, 'metal'), -0.05 + i * 0.05, 0.495, 0.07 - i * 0.02))
  for (let i = 0; i < 4; i++) g.add(cylinder(0.011, 0.011, 0.012, lit(C.chrome, 'metal'), -0.06 + i * 0.04, 0.494, -0.02, 10))
  // Casque posé sur le bord.
  const band = mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 16, Math.PI), lit('#2a2a33'), 0.4, 0.46, 0.12)
  band.rotation.set(-Math.PI / 2, 0, 0.4)
  g.add(band)

  const live = new THREE.Group()
  live.add(...decks)
  // Vumètres : deux colonnes de six diodes.
  const leds = instanced(new THREE.BoxGeometry(0.014, 0.006, 0.01), Array.from({ length: 12 }, () => '#000'))
  for (let i = 0; i < 12; i++) setInstance(leds, i, i < 6 ? 0.07 : 0.09, 0.492, -0.1 + (i % 6) * 0.018)
  live.add(leds)
  // Façade : l'égaliseur en néon.
  const screen = animatedScreen(96, 28, 15, (c, t) => {
    c.fillStyle = '#07060c'
    c.fillRect(0, 0, 96, 28)
    const pulse = Math.exp(-beatPhase(t) * 4)
    for (let i = 0; i < 16; i++) {
      const h = 3 + (0.5 + 0.5 * Math.sin(t * 7 + i * 1.3)) * 14 * (0.55 + 0.45 * pulse) + (i % 4 === 0 ? pulse * 6 : 0)
      const grad = c.createLinearGradient(0, 28, 0, 28 - h)
      grad.addColorStop(0, '#39e0ff')
      grad.addColorStop(1, '#ff4fd8')
      c.fillStyle = grad
      c.fillRect(3 + i * 5.7, 26 - h, 4, h)
    }
  })
  live.add(part(new THREE.PlaneGeometry(0.84, 0.24), new THREE.MeshBasicMaterial({ map: screen.texture }), 0, 0.22, 0.191))
  const on = new THREE.Color(), off = new THREE.Color('#111')
  const LED = ['#3bff8a', '#3bff8a', '#3bff8a', '#ffe94f', '#ffe94f', '#ff3b3b'].map((c) => new THREE.Color(c))
  const update = (t: number) => {
    for (const [i, p] of decks.entries()) p.rotation.y = -t * (3.5 + i * 0.1)
    const pulse = Math.exp(-beatPhase(t) * 4)
    for (let i = 0; i < 12; i++) {
      const level = (i < 6 ? 0.35 : 0.3) + pulse * 0.55 + 0.1 * Math.sin(t * 9 + (i < 6 ? 0 : 2))
      leds.setColorAt(i, (i % 6) / 6 < level ? on.copy(LED[i % 6]) : off)
    }
    leds.instanceColor!.needsUpdate = true
    screen.tick(t)
  }
  update(0)
  return { solid: g, live, update }
}

// ---------------------------------------------------------------- jukebox

/**
 * Arche du jukebox : deux montants verticaux (x = ±r, de y0 à y1) reliés par un demi-cercle
 * de centre (0, y1), parcourus de bas à gauche à bas à droite, à vitesse constante.
 */
class ArchCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private r: number, private y0: number, private y1: number, private z: number) {
    super()
  }
  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const { r, y0, y1, z } = this
    const leg = y1 - y0, arc = Math.PI * r
    const s = t * (2 * leg + arc)
    if (s < leg) return target.set(-r, y0 + s, z)
    if (s < leg + arc) {
      const a = Math.PI - (s - leg) / r
      return target.set(Math.cos(a) * r, y1 + Math.sin(a) * r, z)
    }
    return target.set(r, y1 - (s - leg - arc), z)
  }
}

/** Contour en arche (montants de y0 à y1, demi-cercle de rayon r au-dessus), pour les extrusions. */
function archShape(r: number, y0: number, y1: number, into: THREE.Path = new THREE.Shape()): THREE.Path {
  into.moveTo(-r, y0)
  into.lineTo(r, y0)
  into.lineTo(r, y1)
  into.absarc(0, y1, r, 0, Math.PI, false)
  into.lineTo(-r, y0)
  return into
}

let jukeboxTextures: { grille: THREE.Material; cards: THREE.Material; backlight: THREE.Material } | null = null

/** Textures du jukebox (partagées) : grille rétroéclairée, cartes des titres, fond de la vitrine. */
function jukeboxMaterials() {
  jukeboxTextures ??= {
    // Grille du haut-parleur : plastique ambré éclairé par derrière, barreaux chromés.
    grille: keepShared(
      new THREE.MeshBasicMaterial({
        map: keepShared(
          drawnTexture(128, 96, (g) => {
            const bg = g.createLinearGradient(0, 0, 0, 96)
            bg.addColorStop(0, '#ff9a3c')
            bg.addColorStop(0.55, '#ff5f7e')
            bg.addColorStop(1, '#b8327a')
            g.fillStyle = bg
            g.fillRect(0, 0, 128, 96)
            const halo = g.createRadialGradient(64, 48, 4, 64, 48, 60)
            halo.addColorStop(0, '#ffe7b0cc')
            halo.addColorStop(1, '#ffe7b000')
            g.fillStyle = halo
            g.fillRect(0, 0, 128, 96)
            for (let x = 6; x < 128; x += 10) {
              g.fillStyle = '#3a1a2a'
              g.fillRect(x - 1, 0, 6, 96)
              g.fillStyle = '#e8ebf0'
              g.fillRect(x, 0, 3, 96)
            }
          }),
        ),
      }),
    ),
    // Cartes des titres : deux rangées, bandeau rouge et deux lignes de texte chacune.
    cards: keepShared(
      new THREE.MeshLambertMaterial({
        map: keepShared(
          drawnTexture(256, 72, (g) => {
            g.fillStyle = '#2a1c18'
            g.fillRect(0, 0, 256, 72)
            for (let row = 0; row < 2; row++) {
              for (let col = 0; col < 5; col++) {
                const x = 4 + col * 50.4, y = 4 + row * 34
                g.fillStyle = '#f4ead6'
                g.fillRect(x, y, 46, 30)
                g.fillStyle = col % 2 ? '#2f6fc0' : '#c8323c'
                g.fillRect(x, y + 13, 46, 4)
                g.fillStyle = '#6b5a4a'
                g.fillRect(x + 5, y + 5, 30 - ((row + col) % 3) * 6, 3)
                g.fillRect(x + 5, y + 22, 34 - ((row * 2 + col) % 3) * 7, 3)
              }
            }
          }),
        ),
      }),
    ),
    // Fond de la vitrine : lueur chaude autour du disque.
    backlight: keepShared(
      new THREE.MeshBasicMaterial({
        map: keepShared(
          drawnTexture(64, 64, (g) => {
            const halo = g.createRadialGradient(32, 38, 2, 32, 38, 40)
            halo.addColorStop(0, '#ffd9a0')
            halo.addColorStop(0.45, '#c2447e')
            halo.addColorStop(1, '#241030')
            g.fillStyle = halo
            g.fillRect(0, 0, 64, 64)
          }),
        ),
      }),
    ),
  }
  return jukeboxTextures
}

/**
 * Jukebox des années 1950, façon Wurlitzer : meuble en arche au bois verni, tubes lumineux
 * aux couleurs qui défilent tout le long de l'arche, bulles qui montent dans les montants,
 * vitrine bombée cerclée de chrome où tourne le disque, cartes des titres, touches de sélection
 * et grille ambrée du haut-parleur.
 */
const jukebox: Builder = ({ random }) => {
  const g = new THREE.Group()
  const wood = lit(C.wood, 'wood'), dark = lit(C.woodDark, 'wood'), chrome = lit(C.chrome, 'metal')
  const { grille, cards, backlight } = jukeboxMaterials()
  const FRONT = 0.15
  // Socle et meuble : une arche extrudée aux arêtes arrondies (0,52 × 0,30, 0,88 de haut).
  g.add(box(0.54, 0.05, 0.32, dark, 0, 0.025, 0, 0.01), box(0.545, 0.012, 0.325, chrome, 0, 0.052, 0))
  const cabinet = mesh(
    new THREE.ExtrudeGeometry(archShape(0.25, 0.058, 0.62) as THREE.Shape, { depth: 0.28, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2, curveSegments: 24 }),
    wood, 0, 0, -0.14,
  )
  g.add(cabinet)
  // Flancs : bandeau de bois sombre en bas, jonc chromé au-dessus.
  for (const side of [-1, 1]) g.add(box(0.006, 0.26, 0.26, dark, side * 0.259, 0.2, 0), box(0.008, 0.012, 0.26, chrome, side * 0.259, 0.336, 0))
  // Filet chromé sur le bord de l'arche, et cimier.
  g.add(mesh(new THREE.TubeGeometry(new ArchCurve(0.252, 0.06, 0.62, FRONT), 64, 0.007, 6), chrome))
  g.add(box(0.07, 0.03, 0.05, chrome, 0, 0.875, 0.1, 0.012), sphere(0.018, lit('#ffd35a'), 0, 0.9, 0.11, 12))

  // Vitrine : fond éclairé, disque sur sa platine, piles de disques de part et d'autre, bras de lecture.
  const win = archShape(0.15, 0.52, 0.64) as THREE.Shape
  g.add(part(new THREE.ShapeGeometry(win, 20), backlight, 0, 0, FRONT + 0.001))
  const bezel = archShape(0.168, 0.505, 0.64) as THREE.Shape
  bezel.holes.push(archShape(0.15, 0.52, 0.64, new THREE.Path()))
  g.add(mesh(new THREE.ExtrudeGeometry(bezel, { depth: 0.035, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 1, curveSegments: 20 }), chrome, 0, 0, FRONT))
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const d = mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.004, 16), lit(i % 2 ? '#15151a' : '#23232b'), side * (0.075 + i * 0.009), 0.6, FRONT - 0.004)
      d.rotation.z = Math.PI / 2
      g.add(d)
    }
  }
  g.add(box(0.14, 0.01, 0.04, chrome, 0, 0.535, FRONT + 0.012))
  const arm = box(0.124, 0.008, 0.008, chrome, 0.07, 0.688, FRONT + 0.03)
  arm.rotation.z = 0.87
  g.add(arm, sphere(0.012, chrome, 0.11, 0.735, FRONT + 0.03, 8))

  // Cartes des titres, inclinées, sous leur cadre chromé ; touches de sélection en dessous.
  const strip = new THREE.Group()
  strip.position.set(0, 0.45, FRONT + 0.02)
  strip.rotation.x = -0.45
  strip.add(box(0.34, 0.085, 0.04, chrome, 0, 0, -0.02))
  strip.add(part(new THREE.PlaneGeometry(0.32, 0.07), cards, 0, 0, 0.0005))
  g.add(strip)
  g.add(box(0.34, 0.03, 0.04, chrome, 0, 0.385, FRONT + 0.012, 0.008))
  for (let i = 0; i < 10; i++) g.add(box(0.022, 0.016, 0.014, lit(i === 4 || i === 5 ? '#d8363f' : C.cream), -0.135 + i * 0.03, 0.387, FRONT + 0.034, 0.004))

  // Grille du haut-parleur dans son cadre, médaillon doré au centre.
  g.add(box(0.33, 0.25, 0.02, chrome, 0, 0.22, FRONT, 0.01))
  g.add(part(new THREE.PlaneGeometry(0.3, 0.22), grille, 0, 0.22, FRONT + 0.011))
  const medal = mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.012, 24), lit('#ffd35a'), 0, 0.22, FRONT + 0.016)
  medal.rotation.x = Math.PI / 2
  const star = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.006, 5), lit('#b8327a'), 0, 0.22, FRONT + 0.023)
  star.rotation.x = Math.PI / 2
  g.add(medal, star)

  const live = new THREE.Group()
  // Le disque qui tourne, étiquette rouge, et la vitre bombée devant.
  const record = new THREE.Group()
  record.position.set(0, 0.6, FRONT + 0.022)
  const vinyl = part(new THREE.CylinderGeometry(0.06, 0.06, 0.004, 28), lit('#111116'))
  const label = part(new THREE.CylinderGeometry(0.022, 0.022, 0.005, 16), lit('#d8363f'))
  const mark = part(new THREE.BoxGeometry(0.018, 0.0055, 0.004), lit(C.cream), 0.008, 0, 0)
  for (const p of [vinyl, label, mark]) p.rotation.x = Math.PI / 2
  record.add(vinyl, label, mark)
  live.add(record)
  live.add(part(new THREE.ShapeGeometry(win, 20), glass('#dff4ff', 0.16), 0, 0, FRONT + 0.036))

  // Tubes lumineux le long de l'arche : leurs couleurs défilent (couleurs aux sommets).
  const TUBE = 96, RADIAL = 8
  const tubeGeo = new THREE.TubeGeometry(new ArchCurve(0.21, 0.08, 0.62, FRONT + 0.006), TUBE, 0.019, RADIAL)
  const tubeColors = new Float32Array(tubeGeo.attributes.position.count * 3)
  tubeGeo.setAttribute('color', new THREE.BufferAttribute(tubeColors, 3))
  live.add(part(tubeGeo, new THREE.MeshBasicMaterial({ vertexColors: true })))
  // Bulles qui montent dans les montants.
  const BUBBLES = 10
  const bubbles = instanced(new THREE.SphereGeometry(1, 8, 6), Array.from({ length: BUBBLES }, () => '#ffffff'))
  const seeds = Array.from({ length: BUBBLES }, (_, i) => ({ side: i % 2 ? 1 : -1, phase: random(), speed: 0.18 + random() * 0.16 }))
  live.add(bubbles)

  const c = new THREE.Color()
  const update = (t: number) => {
    const pulse = Math.exp(-beatPhase(t) * 4)
    for (let i = 0; i <= TUBE; i++) {
      const u = i / TUBE
      // Bagues plus sombres tous les quelques centimètres, comme les tubes gravés d'origine.
      c.setHSL(mod(u * 0.9 - t * 0.1, 1), 0.95, 0.52 + 0.08 * pulse - (i % 4 === 0 ? 0.12 : 0))
      for (let j = 0; j <= RADIAL; j++) c.toArray(tubeColors, (i * (RADIAL + 1) + j) * 3)
    }
    tubeGeo.attributes.color.needsUpdate = true
    record.rotation.z = -t * 3.5
    for (const [i, s] of seeds.entries()) {
      const y = mod(s.phase + t * s.speed, 1)
      setInstance(bubbles, i, s.side * 0.21, 0.09 + y * 0.5, FRONT + 0.027, 0.005 + 0.002 * Math.sin(i * 1.7 + t * 3))
    }
    bubbles.instanceMatrix.needsUpdate = true
  }
  update(0)
  return { solid: g, live, update }
}

// ---------------------------------------------------------------- enceinte

const SPEAKERS: Record<string, { body: string; ring: string }> = {
  black: { body: '#1b1b21', ring: '#39e0ff' },
  wood: { body: '#7a4e32', ring: '#ffb13b' },
  white: { body: '#e8eaee', ring: '#ff4fd8' },
}

/** Enceinte colonne : la membrane du boomer bat au tempo, sa couronne de diodes aussi. Finition : `label`. */
const speaker: Builder = ({ label = 'black' }) => {
  const s = SPEAKERS[label] ?? SPEAKERS.black
  const g = new THREE.Group()
  g.add(box(0.26, 0.58, 0.24, lit(s.body), 0, 0.29, 0, 0.012))
  const front = new THREE.Group()
  front.position.z = 0.121
  for (const [y, r] of [[0.2, 0.092], [0.44, 0.04]] as const) {
    const rim = mesh(new THREE.CylinderGeometry(r + 0.012, r + 0.012, 0.01, 24), lit('#2a2a32'), 0, y, 0)
    rim.rotation.x = Math.PI / 2
    front.add(rim)
  }
  g.add(front)
  const live = new THREE.Group()
  live.position.z = 0.127
  const cone = part(new THREE.CylinderGeometry(0.05, 0.088, 0.03, 24, 1, true), lit('#101014'), 0, 0.2, 0)
  cone.rotation.x = -Math.PI / 2
  const dust = part(new THREE.SphereGeometry(0.028, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), lit('#1c1c22'), 0, 0.2, -0.012)
  dust.rotation.x = Math.PI / 2
  const tweeter = part(new THREE.SphereGeometry(0.026, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), lit(C.chrome, 'metal'), 0, 0.44, -0.004)
  tweeter.rotation.x = Math.PI / 2
  const ringMat = new THREE.MeshBasicMaterial({ color: s.ring })
  const ring = part(new THREE.TorusGeometry(0.102, 0.004, 6, 32), ringMat, 0, 0.2, 0)
  const woofer = new THREE.Group()
  woofer.add(cone, dust)
  live.add(woofer, tweeter, ring)
  const base = new THREE.Color(s.ring)
  const update = (t: number) => {
    const pulse = Math.exp(-beatPhase(t) * 5)
    woofer.position.z = pulse * 0.012
    woofer.scale.setScalar(1 + pulse * 0.04)
    ringMat.color.copy(base).multiplyScalar(0.35 + 0.65 * pulse)
  }
  update(0)
  return { solid: g, live, update }
}

// ---------------------------------------------------------------- laser et lyre

const LASERS: Record<string, string> = { green: '#39ff6a', red: '#ff3b3b', blue: '#3b8cff', rgb: '#ffffff' }

/** Faisceau fin, lumineux à la source, qui s'éteint au bout (le long de +z). */
function beam(length: number, radius: number, spread: number): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(spread, radius, length, 12, 1, true)
  geo.translate(0, length / 2, 0)
  geo.rotateX(Math.PI / 2)
  const m = part(geo, beamMaterial(true))
  return m
}

/**
 * Projecteur laser à poser sur un meuble : un éventail de rayons qui balaie la pièce et
 * clignote au tempo. Couleur : `label` (green, red, blue, rgb : les couleurs tournent).
 */
const laser: Builder = ({ label = 'green' }) => {
  const color = LASERS[label] ?? LASERS.green
  const g = new THREE.Group()
  g.add(box(0.12, 0.07, 0.13, lit(C.black), 0, 0.035, 0, 0.008))
  for (const x of [-0.035, 0.035]) g.add(box(0.01, 0.03, 0.06, lit(C.steel, 'metal'), x, 0.075, -0.02))
  const lens = cylinder(0.014, 0.014, 0.01, glow(color), 0, 0.04, 0.066, 12)
  lens.rotation.x = Math.PI / 2
  g.add(lens)
  const live = new THREE.Group()
  const fan = new THREE.Group()
  fan.position.set(0, 0.04, 0.07)
  const beams = Array.from({ length: 7 }, (_, i) => {
    const b = beam(0.95, 0.004, 0.012)
    b.rotation.y = (i - 3) * 0.16
    fan.add(b)
    return b
  })
  live.add(outOfBounds(fan))
  const c = new THREE.Color(color)
  const update = (t: number) => {
    fan.rotation.set(-0.35 - 0.2 * Math.sin(t * 0.9), Math.sin(t * 0.6) * 0.5, 0)
    const b = beatAt(t), pulse = Math.exp(-(b - Math.floor(b)) * 3)
    beams.forEach((m, i) => {
      const u = (m.material as THREE.ShaderMaterial).uniforms
      if (label === 'rgb') c.setHSL(mod(t * 0.15 + i * 0.12, 1), 1, 0.55)
      u.uColor.value.copy(c)
      u.uTime.value = t
      // Un rayon sur deux s'éteint un temps sur deux.
      u.uIntensity.value = (Math.floor(b) + i) % 2 === 0 || i === 3 ? 0.7 + 0.3 * pulse : 0.12
    })
  }
  update(0)
  return { solid: g, live, update }
}

/**
 * Lyre (projecteur de scène motorisé) sur trépied : la tête pivote, s'incline et balaie la
 * pièce d'un faisceau dont la couleur change à chaque mesure.
 */
const stageLight: Builder = ({ random }) => {
  const g = new THREE.Group()
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    // Pieds écartés en bas, réunis sous le mât.
    const leg = cylinder(0.008, 0.008, 0.36, lit(C.steel, 'metal'), Math.cos(a) * 0.1, 0.17, Math.sin(a) * 0.1, 6)
    leg.rotation.set(-Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5)
    g.add(leg)
  }
  g.add(cylinder(0.012, 0.012, 0.22, lit(C.steel, 'metal'), 0, 0.42, 0, 8), box(0.14, 0.05, 0.12, lit(C.black), 0, 0.555, 0, 0.01))
  const live = new THREE.Group()
  const yoke = new THREE.Group()
  yoke.position.y = 0.58
  for (const x of [-0.065, 0.065]) yoke.add(part(new THREE.BoxGeometry(0.014, 0.12, 0.04), lit('#1e1e25'), x, 0.06, 0))
  const head = new THREE.Group()
  head.position.y = 0.09
  const shell = part(new THREE.CylinderGeometry(0.045, 0.055, 0.12, 16), lit('#26262e'))
  shell.rotation.x = Math.PI / 2
  const lens = part(new THREE.CircleGeometry(0.04, 16), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 0, 0, 0.061)
  const ray = beam(0.9, 0.035, 0.2)
  ray.position.z = 0.062
  head.add(shell, lens, outOfBounds(ray))
  yoke.add(head)
  live.add(yoke)
  const phase = random() * 6
  const c = new THREE.Color()
  const lensMat = lens.material as THREE.MeshBasicMaterial
  const u = (ray.material as THREE.ShaderMaterial).uniforms
  const update = (t: number) => {
    yoke.rotation.y = Math.sin(t * 0.5 + phase) * 1.2
    head.rotation.x = 0.35 + 0.35 * Math.sin(t * 0.8 + phase * 2)
    const bar = Math.floor(beatAt(t) / 4)
    c.setHSL(mod(bar * 0.17 + phase, 1), 0.95, 0.6)
    lensMat.color.copy(c)
    u.uColor.value.copy(c)
    u.uTime.value = t
    u.uIntensity.value = 0.35 + 0.25 * Math.exp(-beatPhase(t) * 3)
  }
  update(0)
  return { solid: g, live, update }
}

export const PARTY = {
  'dance-floor': danceFloor,
  'disco-ball': discoBall,
  'dj-booth': djBooth,
  jukebox,
  speaker,
  laser,
  'stage-light': stageLight,
} satisfies Record<string, Builder>

