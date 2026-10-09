import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { FaceControl } from './avatar'
import { holoTime } from './furniture/kit'

/*
 * Les deux apparences offertes par Scavengers (https://scavengers.elitedangereuse.fr), d'après les
 * portraits du jeu (cf. src/furniture/scavengers.ts) et ses couleurs :
 *
 * - Kael, le récupérateur : sa tête vient de holo-style.ts (cheveux en bataille, peau hâlée,
 *   cicatrice, barbe de trois jours) ; ici, ce qu'il porte sur sa combinaison ardoise. Le plastron
 *   clair et le col sombre de son portrait, liserés de vert phosphore, un harnais, un terminal au poignet (il pilote ses
 *   drones en ligne de commande), un sac de fouille avec son antenne, et à la ceinture les trois
 *   ressources du jeu : ferraille ambre, carburant bleu, module violet.
 * - ARIA, l'IA de l'Erebus : un corps de lumière sans vêtements, parcouru de circuits, et à la
 *   place de la tête la plaque à pans coupés de son portrait, son visage en pixels, ses circuits
 *   qui flottent autour.
 *
 * Tout est accroché aux os des Mini Characters, dont les repères sont alignés sur le modèle au
 * repos (bras en croix) : le torse va de y = 0 à 0,17 (devant : z = 0,11), un bras de x = 0 à
 * ±0,28, une jambe de y = 0 à -0,18, la tête de y = 0 à 0,38.
 */

const lit = (color: string) => new THREE.MeshLambertMaterial({ color })
const glow = (color: string) => new THREE.MeshBasicMaterial({ color })
const rbox = (w: number, h: number, d: number, m: THREE.Material, r = 0.01) => new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2, h / 2, d / 2) * 0.999), m)
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => {
  o.position.set(x, y, z)
  return o
}

// ---------------------------------------------------------------- Kael

/** Couleurs de Kael (cf. Colors.ts et PixelPortraits.ts de Scavengers). */
const K = {
  suitLight: '#6f7b8c',
  suitDark: '#252d3b',
  strap: '#161a22',
  canvas: '#5d5a44',
  leather: '#4f3a28',
  steel: '#8b949e',
  phosphor: '#00ff41',
  piping: '#2fbf5c',
  scrap: '#ffb000',
  fuel: '#00aaff',
  upgrade: '#cc44ff',
}

let kaelMaterials: Record<keyof typeof K | 'screen', THREE.Material> | null = null
function kaelMats() {
  if (kaelMaterials) return kaelMaterials
  // L'écran du terminal : une invite et quelques lignes de journal, en vert phosphore.
  const c = document.createElement('canvas')
  c.width = c.height = 32
  const g = c.getContext('2d')!
  g.fillStyle = '#03120a'
  g.fillRect(0, 0, 32, 32)
  for (const [x, y, w, color] of [[3, 4, 14, '#00ff41'], [3, 9, 22, '#0a8a2c'], [3, 14, 17, '#00ff41'], [3, 19, 24, '#0a8a2c'], [3, 24, 5, '#00ff41'], [10, 24, 3, '#b4ffc8']] as const) {
    g.fillStyle = color
    g.fillRect(x, y, w, 2)
  }
  const screen = new THREE.CanvasTexture(c)
  screen.colorSpace = THREE.SRGBColorSpace
  screen.magFilter = THREE.NearestFilter
  return (kaelMaterials = {
    suitLight: lit(K.suitLight),
    suitDark: lit(K.suitDark),
    strap: lit(K.strap),
    canvas: lit(K.canvas),
    leather: lit(K.leather),
    steel: lit(K.steel),
    phosphor: glow(K.phosphor),
    piping: lit(K.piping),
    scrap: glow(K.scrap),
    fuel: glow(K.fuel),
    upgrade: glow(K.upgrade),
    screen: new THREE.MeshBasicMaterial({ map: screen }),
  })
}

/** L'équipement de Kael, par-dessus sa combinaison. */
export function addKaelGear(root: THREE.Object3D) {
  const m = kaelMats()
  const torso = root.getObjectByName('torso')
  if (torso) {
    // Le plastron clair de son portrait, et le col sombre, en pointe.
    torso.add(at(rbox(0.19, 0.075, 0.03, m.suitLight, 0.012), 0, 0.118, 0.108))
    torso.add(at(rbox(0.15, 0.012, 0.032, m.piping, 0.004), 0, 0.078, 0.108))
    const notch = at(rbox(0.05, 0.05, 0.02, m.suitDark, 0.004), 0, 0.158, 0.116)
    notch.rotation.z = Math.PI / 4
    torso.add(notch)
    // Sur le plastron : trois voyants (l'état de ses drones) et sa plaque.
    for (const [i, lamp] of [m.phosphor, m.phosphor, m.scrap].entries()) torso.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, 0.006), lamp), -0.068 + i * 0.021, 0.128, 0.125))
    torso.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.016, 0.006), m.steel), 0.058, 0.128, 0.125))
    // Le harnais : deux sangles par-dessus les épaules, jusqu'au sac.
    for (const s of [-1, 1]) {
      torso.add(at(rbox(0.026, 0.165, 0.012, m.strap, 0.004), s * 0.108, 0.085, 0.128))
      torso.add(at(rbox(0.026, 0.012, 0.27, m.strap, 0.004), s * 0.108, 0.172, 0))
      torso.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.014, 0.008), m.steel), s * 0.108, 0.1, 0.135))
    }
    // La ceinture : boucle, deux sacoches, et les trois ressources du jeu à la hanche.
    torso.add(at(rbox(0.3, 0.034, 0.27, m.strap, 0.008), 0, 0.012, 0))
    torso.add(at(rbox(0.05, 0.042, 0.012, m.steel, 0.005), 0, 0.012, 0.137))
    torso.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.012, 0.004), m.phosphor), 0, 0.012, 0.144))
    for (const s of [-1, 1]) torso.add(at(rbox(0.058, 0.06, 0.04, m.leather, 0.01), s * 0.095, -0.012, 0.135))
    for (const [i, lamp] of [m.scrap, m.fuel, m.upgrade].entries()) {
      const z = -0.045 + i * 0.04
      torso.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.05, 8), lamp), -0.162, -0.022, z))
      torso.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.012, 8), m.steel), -0.162, 0.008, z))
    }
    // Le sac de fouille : son rabat, une couverture roulée dessus, un bidon de carburant, un
    // rouleau de câble, et l'antenne qui le relie à ARIA.
    const pack = new THREE.Group()
    pack.add(rbox(0.21, 0.16, 0.09, m.suitDark, 0.02))
    pack.add(at(rbox(0.22, 0.05, 0.1, m.canvas, 0.015), 0, 0.062, 0))
    pack.add(at(rbox(0.1, 0.07, 0.03, m.canvas, 0.008), 0, -0.03, -0.05))
    pack.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.01, 0.006), m.phosphor), 0, 0.02, -0.046))
    const roll = at(new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.24, 10), m.leather), 0, 0.118, -0.012)
    roll.rotation.z = Math.PI / 2
    pack.add(roll)
    for (const s of [-1, 1]) pack.add(at(rbox(0.018, 0.074, 0.074, m.strap, 0.004), s * 0.07, 0.118, -0.012))
    pack.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.1, 10), m.fuel), 0.128, -0.012, 0))
    for (const y of [-0.066, 0.042]) pack.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.016, 10), m.steel), 0.128, y, 0))
    const coil = at(new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.01, 6, 14), m.scrap), -0.118, -0.01, 0)
    coil.rotation.y = Math.PI / 2
    pack.add(coil)
    pack.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.34, 5), m.strap), -0.085, 0.23, -0.035))
    pack.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 6), m.phosphor), -0.085, 0.405, -0.035))
    torso.add(at(pack, 0, 0.075, -0.168))
  }
  // Bras gauche : le terminal de poignet, écran vers le haut quand il lève le bras.
  const left = root.getObjectByName('arm-left')
  if (left) {
    left.add(at(rbox(0.082, 0.026, 0.1, m.suitDark, 0.008), 0.185, 0.07, 0.02))
    const screen = at(new THREE.Mesh(new THREE.PlaneGeometry(0.062, 0.076), m.screen), 0.185, 0.084, 0.02)
    screen.rotation.set(-Math.PI / 2, 0, Math.PI / 2)
    left.add(screen)
    left.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.006, 0.01), m.scrap), 0.22, 0.084, -0.017))
  }
  // Bras droit : une épaulière de tôle, rayée d'ambre.
  const right = root.getObjectByName('arm-right')
  if (right) {
    right.add(at(rbox(0.11, 0.035, 0.155, m.suitLight, 0.014), -0.058, 0.07, 0))
    right.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.037, 0.157), m.scrap), -0.085, 0.07, 0))
  }
  // Genouillères, et une sacoche de cuisse à droite.
  for (const side of ['leg-left', 'leg-right']) {
    const leg = root.getObjectByName(side)
    if (!leg) continue
    leg.add(at(rbox(0.11, 0.05, 0.026, m.suitLight, 0.01), 0, -0.088, 0.096))
    leg.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.008, 0.006), m.piping), 0, -0.088, 0.111))
    if (side === 'leg-right') leg.add(at(rbox(0.03, 0.07, 0.07, m.leather, 0.008), -0.082, -0.05, 0.005))
  }
  // L'oreillette qui le relie à ARIA, et son micro.
  const head = root.getObjectByName('head')
  if (head) {
    head.add(at(rbox(0.022, 0.07, 0.06, m.suitDark, 0.008), -0.236, 0.125, 0.015))
    head.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.016, 0.016), m.phosphor), -0.249, 0.135, 0.015))
    const boom = at(new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.17), m.strap), -0.222, 0.082, 0.095)
    boom.rotation.set(0.25, 0.28, 0)
    head.add(boom)
    head.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.016, 0.016), m.strap), -0.197, 0.062, 0.178))
  }
}

// ---------------------------------------------------------------- ARIA

/** Couleurs d'ARIA (cf. PixelPortraits.ts de Scavengers). */
const A = { face: '#00e5ff', dark: '#0091a1', glow: '#80f0ff', circuit: '#00bcd4', dim: '#006070', eye: '#ffffff' }

/** Ce qu'un matériau d'ARIA ajoute à la lumière de la projection. */
interface AriaFx {
  /** Circuits en pointillés sur le corps, qu'une impulsion remonte, et pieds qui s'effacent. */
  body?: boolean
  /** Les circuits qui flottent autour de la tête : une impulsion les remonte. */
  pulse?: boolean
  /** La tête flotte : elle monte et descend à peine. */
  bob?: boolean
  /** Le visage cligne des yeux. */
  blink?: boolean
}

/**
 * Fait d'un matériau un morceau de la projection d'ARIA : les lignes de balayage qui montent, la
 * bande claire qui passe et le grésillement des projections du Holo-Me (cf. holoShader dans
 * looks.ts), plus ce qui lui est propre. Les lignes sont celles de l'écran, les circuits ceux du
 * modèle (ils suivent ses gestes).
 */
function ariaShader<T extends THREE.Material>(material: T, fx: AriaFx): T {
  material.toneMapped = false
  material.customProgramCacheKey = () => `aria:${JSON.stringify(fx)}`
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHoloTime = holoTime
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uHoloTime;\nvarying vec3 vAriaPos;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvAriaPos = position;${fx.bob ? '\ntransformed.y += sin(uHoloTime * 1.9) * 0.008;' : ''}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uHoloTime;\nvarying vec3 vAriaPos;')
      .replace(
        '#include <map_fragment>',
        fx.blink
          ? `#ifdef USE_MAP
          // Clignement : les rangées des yeux prennent la couleur de la joue, sauf celle du milieu.
          vec2 ariaUv = vMapUv;
          if (mod(uHoloTime + 2.0, 5.3) < 0.14 && ariaUv.y > 0.5 && ariaUv.y < 0.7222 && (ariaUv.y < 0.5556 || ariaUv.y > 0.6111)) ariaUv.y = 0.4167;
          diffuseColor *= texture2D(map, ariaUv);
        #endif`
          : '#include <map_fragment>',
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        ${fx.body
          ? `vec3 ariaCell = vAriaPos * 30.0;
        float ariaRow = floor(ariaCell.y);
        float ariaOn = step(0.45, fract(sin(ariaRow * 12.9898 + floor((ariaCell.x + ariaCell.z) * 0.45) * 78.233) * 43758.5453));
        float ariaTrace = step(0.7, fract(ariaCell.y)) * ariaOn;
        float ariaPulse = smoothstep(0.05, 0.0, abs(vAriaPos.y - fract(uHoloTime * 0.35) * 0.55));
        gl_FragColor.rgb += vec3(0.0, 0.55, 0.62) * ariaTrace * (0.5 + 1.6 * ariaPulse) + vec3(0.25, 0.5, 0.52) * ariaPulse;
        gl_FragColor.a *= mix(0.12, 1.0, smoothstep(0.0, 0.2, vAriaPos.y));`
          : ''}
        ${fx.pulse ? 'gl_FragColor.rgb *= 0.6 + 0.9 * smoothstep(0.6, 1.0, sin(vAriaPos.y * 26.0 - uHoloTime * 4.0));' : ''}
        float ariaScan = 0.5 + 0.5 * sin(gl_FragCoord.y * 1.7 - uHoloTime * 6.0);
        float ariaSweep = smoothstep(0.985, 1.0, sin(gl_FragCoord.y * 0.011 - uHoloTime * 1.3));
        float ariaFlicker = 0.94 + 0.06 * sin(uHoloTime * 43.0) * sin(uHoloTime * 17.3);
        gl_FragColor.rgb = gl_FragColor.rgb * 1.08 + vec3(0.3, 0.55, 0.6) * ariaSweep;
        gl_FragColor.a *= (0.8 + 0.2 * ariaScan) * ariaFlicker;`,
      )
  }
  return material
}

/**
 * La lumière d'ARIA : sombre de face, claire sur les bords (une « matcap », lue d'après
 * l'orientation de chaque facette par rapport à la caméra). Le modèle y perd ses vêtements : il
 * ne reste que sa silhouette.
 */
function ariaMatcap(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 58, 4, 64, 64, 64)
  for (const [stop, color] of [[0, '#04485a'], [0.5, '#087f93'], [0.78, '#00c8e0'], [0.93, '#7ff1ff'], [1, '#e2fdff']] as const) grad.addColorStop(stop, color)
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

type Mood = 'neutral' | 'happy' | 'joy' | 'wink' | 'surprised' | 'worried' | 'asleep'

/** L'humeur d'ARIA pour chaque expression que jouent les emotes (cf. EMOTE_FACES dans avatar.ts). */
const MOODS: Record<string, Mood> = { sm: 'happy', gr: 'joy', wi: 'wink', su: 'surprised', fr: 'worried', zz: 'asleep' }

/** Sa plaque fait 16 pixels sur 18 : les colonnes 8 à 23 et les rangées 6 à 23 de son portrait. */
const FACE_W = 16, FACE_H = 18

/** Le visage d'ARIA, pixel pour pixel d'après son portrait, dans une humeur. */
function drawAriaFace(g: CanvasRenderingContext2D, mood: Mood) {
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    g.fillStyle = color
    g.fillRect(x - 8, y - 6, w, h)
  }
  rect(8, 6, 16, 18, A.dark)
  rect(8, 8, 16, 14, A.face)
  rect(9, 7, 14, 1, A.face)
  rect(9, 22, 14, 1, A.face)
  rect(15, 9, 2, 1, A.glow)
  rect(15, 21, 2, 1, A.glow)
  for (const x of [11, 18]) {
    if (mood === 'asleep' || (mood === 'wink' && x === 18)) rect(x, 13, 4, 1, A.eye)
    else if (mood === 'joy') {
      // Les yeux rieurs : deux accents circonflexes.
      rect(x + 1, 12, 2, 1, A.eye)
      rect(x, 13, 1, 1, A.eye)
      rect(x + 3, 13, 1, 1, A.eye)
    } else if (mood === 'surprised') {
      rect(x, 11, 4, 4, A.eye)
      rect(x + 1, 12, 2, 2, A.dark)
    } else if (mood === 'worried') {
      // Les yeux tombants : le coin extérieur s'affaisse.
      rect(x, 12, 4, 3, A.eye)
      rect(x === 11 ? x : x + 2, 12, 2, 1, A.face)
      rect(x === 11 ? x + 3 : x, 14, 1, 1, A.face)
    } else {
      // Ses yeux en losange.
      rect(x, 12, 4, 3, A.eye)
      for (const [dx, dy] of [[0, 0], [3, 0], [0, 2], [3, 2]]) rect(x + dx, 12 + dy, 1, 1, A.face)
    }
  }
  if (mood === 'happy' || mood === 'joy' || mood === 'wink') {
    rect(12, 18, 8, 1, mood === 'joy' ? A.eye : A.glow)
    rect(11, 17, 1, 1, A.circuit)
    rect(20, 17, 1, 1, A.circuit)
    if (mood === 'joy') rect(13, 19, 6, 1, A.glow)
  } else if (mood === 'surprised') rect(14, 17, 4, 3, A.dim)
  else if (mood === 'worried') {
    rect(13, 18, 6, 1, A.dim)
    rect(12, 19, 1, 1, A.dim)
    rect(19, 19, 1, 1, A.dim)
  } else if (mood === 'asleep') rect(14, 18, 4, 1, A.dim)
  else rect(12, 18, 8, 1, A.dark)
}

/** Le dos de sa plaque : un cœur de lumière, et les pistes qui en partent vers ses circuits. */
function drawAriaBack(g: CanvasRenderingContext2D) {
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    g.fillStyle = color
    g.fillRect(x, y, w, h)
  }
  rect(0, 0, FACE_W, FACE_H, A.dim)
  rect(1, 1, FACE_W - 2, FACE_H - 2, A.dark)
  for (const y of [2, 5, 8, 11, 14]) {
    rect(1, y, 4, 1, A.circuit)
    rect(11, y, 4, 1, A.circuit)
  }
  rect(4, 2, 1, 13, A.circuit)
  rect(11, 2, 1, 13, A.circuit)
  rect(5, 8, 6, 1, A.circuit)
  rect(6, 6, 4, 5, A.face)
  rect(7, 7, 2, 3, A.eye)
  for (const x of [3, 5, 7, 9, 11]) rect(x, 16, 1, 1, A.glow)
}

/** Une face de sa plaque, en gros pixels. */
function pixels(draw: (g: CanvasRenderingContext2D) => void): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = FACE_W
  c.height = FACE_H
  draw(c.getContext('2d')!)
  const map = new THREE.CanvasTexture(c)
  map.colorSpace = THREE.SRGBColorSpace
  map.magFilter = THREE.NearestFilter
  map.minFilter = THREE.LinearFilter
  map.generateMipmaps = false
  return map
}

interface AriaKit {
  body: THREE.Material
  shell: THREE.Material
  bright: THREE.Material
  dim: THREE.Material
  ring: THREE.Material
  beam: THREE.Material
  back: THREE.Material
  plate: THREE.BufferGeometry
  front: THREE.BufferGeometry
  rear: THREE.BufferGeometry
  /** Les circuits qui flottent autour de la plaque : les clairs, les sombres. */
  nodes: [THREE.BufferGeometry, THREE.BufferGeometry]
  faces: Map<Mood, THREE.Material>
}

/** Taille d'un pixel de son portrait sur le modèle. */
const PX = 0.024

let ariaKit: AriaKit | null = null
/** Matériaux et formes d'ARIA, partagés par toutes ses projections. */
function aria(): AriaKit {
  if (ariaKit) return ariaKit
  const matcap = ariaMatcap()
  const light = (fx: AriaFx, opacity: number) => ariaShader(new THREE.MeshMatcapMaterial({ matcap, transparent: true, opacity }), fx)
  // La plaque à pans coupés de son portrait, centrée.
  const w = (FACE_W / 2) * PX, h = (FACE_H / 2) * PX, cut = 2 * PX
  const outline = new THREE.Shape()
  outline.moveTo(-w + cut, -h)
  for (const [x, y] of [[w - cut, -h], [w, -h + cut], [w, h - cut], [w - cut, h], [-w + cut, h], [-w, h - cut], [-w, -h + cut]]) outline.lineTo(x, y)
  outline.closePath()
  const depth = 4 * PX
  const plate = new THREE.ExtrudeGeometry(outline, { depth, bevelEnabled: false })
  plate.translate(0, 0, -depth / 2)
  // Le visage, devant : sa texture couvre toute la plaque.
  const front = new THREE.ShapeGeometry(outline)
  const pos = front.attributes.position, uv = front.attributes.uv
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / (2 * w) + 0.5, pos.getY(i) / (2 * h) + 0.5)
  // Le dos : la même forme, retournée.
  const rear = front.clone().rotateY(Math.PI).translate(0, 0, -depth / 2 - 0.003)
  front.translate(0, 0, depth / 2 + 0.003)
  // Ses circuits : deux colonnes de points de chaque côté, une rangée dessus, une dessous.
  const dot = (x: number, y: number) => new THREE.BoxGeometry(PX * 0.8, PX * 0.8, PX * 0.8).translate((x + 0.5 - 16) * PX, (15 - y - 0.5) * PX, 0)
  const bright: THREE.BufferGeometry[] = [], dim: THREE.BufferGeometry[] = []
  for (let y = 8; y < 22; y += 3) {
    bright.push(dot(6.6, y), dot(24.4, y))
    dim.push(dot(5.2, y), dot(25.8, y))
  }
  for (let x = 11; x < 21; x += 2) dim.push(dot(x + 0.5, 4.6), dot(x + 0.5, 24.4))
  // Le faisceau du projecteur : un cône de lumière qui s'éteint en montant.
  const fade = document.createElement('canvas')
  fade.width = 4
  fade.height = 64
  const g = fade.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 0, 64)
  grad.addColorStop(0, 'rgba(0, 229, 255, 0)')
  grad.addColorStop(1, 'rgba(0, 229, 255, 1)')
  g.fillStyle = grad
  g.fillRect(0, 0, 4, 64)
  const beam = new THREE.CanvasTexture(fade)
  beam.colorSpace = THREE.SRGBColorSpace
  return (ariaKit = {
    body: light({ body: true }, 1),
    shell: light({ bob: true }, 0.92),
    bright: ariaShader(new THREE.MeshBasicMaterial({ color: A.glow, transparent: true, opacity: 0.95 }), { bob: true, pulse: true }),
    dim: ariaShader(new THREE.MeshBasicMaterial({ color: A.circuit, transparent: true, opacity: 0.8 }), { bob: true, pulse: true }),
    ring: new THREE.MeshBasicMaterial({ color: A.face, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false }),
    beam: new THREE.MeshBasicMaterial({ map: beam, transparent: true, opacity: 0.2, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    back: ariaShader(new THREE.MeshBasicMaterial({ map: pixels((g) => drawAriaBack(g)), transparent: true, opacity: 0.95 }), { bob: true }),
    plate,
    front,
    rear,
    nodes: [mergeGeometries(bright), mergeGeometries(dim)],
    faces: new Map(),
  })
}

function ariaFace(mood: Mood): THREE.Material {
  const kit = aria()
  let m = kit.faces.get(mood)
  if (!m) kit.faces.set(mood, (m = ariaShader(new THREE.MeshBasicMaterial({ map: pixels((g) => drawAriaFace(g, mood)), transparent: true, opacity: 0.97 }), { bob: true, blink: true })))
  return m
}

/** De combien la tête d'ARIA dépasse celle du modèle (pour les bulles, cf. LookRig.height). */
export const ARIA_RISE = 0.1

/**
 * Fait d'un Mini Character la projection d'ARIA : son corps devient de la lumière (plus d'ombre
 * portée, la lumière n'en fait pas), sa tête laisse place à la plaque de son portrait, et le
 * projecteur la suit au sol (un anneau, un faisceau). `scale` : l'échelle du modèle, pour que
 * l'anneau garde sa taille. Rend son visage : les emotes y jouent une humeur.
 */
export function ariaProjection(root: THREE.Object3D, scale: number): FaceControl | undefined {
  const kit = aria()
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    m.material = kit.body
    m.castShadow = false
  })
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.23, 28), kit.ring)
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.012 / scale
  ring.scale.setScalar(1 / scale)
  ring.renderOrder = 1
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.19, 0.34, 28, 1, true), kit.beam)
  beam.position.y = 0.17 / scale
  beam.scale.setScalar(1 / scale)
  beam.renderOrder = 1
  root.add(ring, beam)
  const head = root.getObjectByName('head')
  const headMesh = root.getObjectByName('head-mesh')
  if (!head || !headMesh) return
  headMesh.visible = false
  const block = new THREE.Group()
  // Au-dessus des épaules, sans les toucher : elle n'a pas de cou.
  block.position.set(0, (FACE_H / 2 + 2.2) * PX, 0.01)
  const face = new THREE.Mesh(kit.front, ariaFace('neutral'))
  block.add(new THREE.Mesh(kit.plate, kit.shell), face, new THREE.Mesh(kit.rear, kit.back), new THREE.Mesh(kit.nodes[0], kit.bright), new THREE.Mesh(kit.nodes[1], kit.dim))
  head.add(block)
  return { show: (expression) => { face.material = ariaFace(MOODS[expression ?? ''] ?? 'neutral') } }
}
