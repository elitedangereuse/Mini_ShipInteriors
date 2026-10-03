import * as THREE from 'three'
import { renderQuality } from '../quality'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/*
 * Boîte à outils commune du mobilier fait main : matériaux partagés, primitives,
 * fusion des pièces, instanciation, hologrammes, écrans animés.
 */

/**
 * Ce que fabrique un constructeur de meuble. Chaque meuble est construit face à +z,
 * posé au sol et centré sur l'origine.
 * - `solid` : partie immobile (fusionnée avec le reste du pont, tramée, sert aux collisions) ;
 * - `live` : hologrammes et pièces mobiles, qui restent des objets à part ;
 * - `update(t)` : animation de `live` (appelée seulement quand le pont est affiché) ;
 * - `emitter` : son d'ambiance joué près du meuble (cf. main.ts).
 */
export interface Furniture {
  solid?: THREE.Object3D
  live?: THREE.Object3D
  update?: (t: number) => void
  emitter?: Emitter
  /** Commande d'un meuble qu'on manipule (cf. main.ts) : la pince à peluches, le sac de frappe. */
  control?: FurnitureControl
  /**
   * Volume de collision et de clic (repère du meuble), quand la partie fixe ne le couvre pas :
   * un personnage animé, dont presque tout est dans `live`.
   */
  extent?: THREE.Box3
}

/** Issue d'une partie de pince : peluche gagnée, lâchée en remontant, ou rien attrapé. */
export type ClawResult = 'win' | 'slip' | 'miss'

/** Pince à peluches pilotée par le joueur (cf. arcade.ts) : on la déplace, puis on la lâche. */
export interface ClawControl {
  kind: 'claw'
  /** Le joueur prend la main (la démonstration s'interrompt), ou la rend. */
  take(on: boolean): void
  /** Déplacement voulu de la pince (de -1 à 1 sur chaque axe, repère du meuble) pendant `dt`. */
  steer(x: number, z: number, dt: number): void
  /** Lâche la pince (false si elle est déjà partie) ; `done` quand elle est revenue. */
  drop(done: (result: ClawResult) => void): boolean
  /** La pince descend, remonte ou revient. */
  readonly busy: boolean
}

/** Sac de frappe (cf. leisure.ts) : il encaisse un coup. */
export interface BagControl {
  kind: 'bag'
  hit(): void
}

/** Cabine de toilettes (cf. cozy.ts) : sa porte se referme sur son occupant (cf. main.ts). */
export interface StallControl {
  kind: 'stall'
  shut: boolean
}

export type FurnitureControl = ClawControl | BagControl | StallControl

/** Bips d'arcade, crépitements de soudure, grondement de machine. */
export type Emitter = 'arcade' | 'sparks' | 'hum'

/** Pièce d'un meuble : faces intérieures de ses murs, en coordonnées du pont. */
export interface Room {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface BuildOptions {
  /** Texte libre du meuble (titre d'un panneau, jeu d'une borne, couleur d'un tissu…). */
  label?: string
  /** Aléatoire déterministe, qui dépend de la position du meuble : tout le monde voit le même vaisseau. */
  random: () => number
  /** Pièce où le meuble est posé, si on la connaît (les reflets d'une boule à facettes s'y arrêtent). */
  room?: Room
}

export type Builder = (o: BuildOptions) => Furniture

/** Orange des interfaces d'Elite Dangerous. */
export const ED_ORANGE = '#ff8a1c'

// ---------------------------------------------------------------- matériaux

const shared = new Map<string, THREE.Material>()
/** Matériaux et textures communs à plusieurs meubles : on ne les libère jamais (cf. disposeFurniture). */
const keep = new WeakSet<object>()

function sharedMaterial<M extends THREE.Material>(key: string, make: () => M): M {
  let m = shared.get(key)
  if (!m) {
    shared.set(key, (m = make()))
    keep.add(m)
  }
  return m as M
}

/** Marque un matériau ou une texture comme partagé : disposeFurniture ne le libère pas. */
export function keepShared<T extends object>(o: T): T {
  keep.add(o)
  return o
}

/**
 * Libère la mémoire GPU d'un meuble retiré (géométries, matériaux et textures qui lui sont
 * propres) ; les matériaux partagés restent.
 */
export function disposeFurniture(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.geometry) return
    m.geometry.dispose()
    for (const material of Array.isArray(m.material) ? m.material : [m.material]) {
      if (!material || keep.has(material)) continue
      for (const value of Object.values(material)) {
        if ((value as THREE.Texture)?.isTexture && !keep.has(value)) (value as THREE.Texture).dispose()
      }
      const uniforms = (material as THREE.ShaderMaterial).uniforms
      if (uniforms) {
        for (const u of Object.values(uniforms)) if ((u.value as THREE.Texture)?.isTexture && !keep.has(u.value)) u.value.dispose()
      }
      material.dispose()
    }
  })
}

/** Matériau mat, éclairé, d'une couleur (partagé). */
export const lit = (color: string) => sharedMaterial(`lit:${color}`, () => new THREE.MeshLambertMaterial({ color }))

/** Matériau lumineux, insensible à l'éclairage, d'une couleur (partagé). */
export const glow = (color: string) => sharedMaterial(`glow:${color}`, () => new THREE.MeshBasicMaterial({ color }))

/** Verre ou liquide translucide (jamais fusionné : reste dans `live`). */
export const glass = (color: string, opacity = 0.22) =>
  sharedMaterial(`glass:${color}:${opacity}`, () => new THREE.MeshLambertMaterial({ color, transparent: true, opacity, depthWrite: false }))

/** Couleurs communes aux meubles d'inspiration Elite. */
export const mat = {
  steel: lit('#4a505c'),
  steelDark: lit('#2a2e36'),
  steelLight: lit('#7a8292'),
  seat: lit('#1c1f25'),
  trim: lit('#d9741f'),
  canopy: glow('#e0701e'),
  lamp: glow(ED_ORANGE),
  lampCyan: glow('#8ff0ff'),
  lampGreen: glow('#7dffa8'),
  lampRed: glow('#ff3b2f'),
}

/** Matériaux des meubles fusionnés : la couleur de chaque pièce est portée par ses sommets. */
const litVertex = keepShared(new THREE.MeshLambertMaterial({ vertexColors: true }))
const glowVertex = keepShared(new THREE.MeshBasicMaterial({ vertexColors: true }))

// ---------------------------------------------------------------- primitives

/** Pièce de meuble (projette une ombre). */
export function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(geo, m)
  o.position.set(x, y, z)
  o.castShadow = true
  o.receiveShadow = true
  return o
}

/** Pièce mobile ou translucide (sans ombre : un appel de dessin de moins). */
export function part(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(geo, m)
  o.position.set(x, y, z)
  return o
}

/** Pavé, arrondi si `r` > 0. */
export const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0, r = 0) =>
  mesh(r ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d), m, x, y, z)

export const cylinder = (rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 16) =>
  mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y, z)

export const sphere = (r: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 10) =>
  mesh(new THREE.SphereGeometry(r, seg, Math.max(4, Math.round(seg * 0.7))), m, x, y, z)

/** Cylindre couché le long de x. */
export function barX(r: number, len: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 12): THREE.Mesh {
  const c = cylinder(r, r, len, m, x, y, z, seg)
  c.rotation.z = Math.PI / 2
  return c
}

/** Cylindre couché le long de z. */
export function barZ(r: number, len: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 12): THREE.Mesh {
  const c = cylinder(r, r, len, m, x, y, z, seg)
  c.rotation.x = Math.PI / 2
  return c
}

/** Petit générateur pseudo-aléatoire (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Fusionne toutes les pièces d'un meuble en deux maillages au plus (éclairé, lumineux),
 * la couleur de chaque pièce passant dans ses sommets : un meuble de 30 pièces coûte
 * ainsi 2 appels de dessin, et les meubles non interactifs rejoignent la géométrie du pont.
 * Les pièces texturées (affiches, cadres) restent à part, avec leur matériau : la fusion
 * du pont les regroupe ensuite par texture.
 */
export function compact(group: THREE.Object3D): THREE.Group {
  group.updateMatrixWorld(true)
  const parts: Record<'lit' | 'glow', THREE.BufferGeometry[]> = { lit: [], glow: [] }
  const inverse = group.matrixWorld.clone().invert()
  const local = new THREE.Matrix4()
  const textured: THREE.Mesh[] = []
  group.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const src = m.material as THREE.MeshLambertMaterial | THREE.MeshBasicMaterial
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()
    g.applyMatrix4(local.multiplyMatrices(inverse, m.matrixWorld))
    if (src.map) {
      const t = new THREE.Mesh(g, src)
      t.castShadow = m.castShadow
      t.receiveShadow = m.receiveShadow
      textured.push(t)
      return
    }
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name)
    const n = g.attributes.position.count
    const colors = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) colors.set([src.color.r, src.color.g, src.color.b], i * 3)
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    parts[(src as THREE.MeshBasicMaterial).isMeshBasicMaterial ? 'glow' : 'lit'].push(g)
  })
  const out = new THREE.Group()
  for (const key of ['lit', 'glow'] as const) {
    if (!parts[key].length) continue
    const merged = mergeGeometries(parts[key])!
    for (const g of parts[key]) g.dispose()
    const m = new THREE.Mesh(merged, key === 'lit' ? litVertex : glowVertex)
    m.castShadow = key === 'lit'
    m.receiveShadow = true
    out.add(m)
  }
  if (textured.length) out.add(...textured)
  return out
}

/** Maillage instancié, une couleur par instance (les pièces mobiles répétées : 1 appel de dessin). */
export function instanced(geo: THREE.BufferGeometry, colors: string[], material?: THREE.Material): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(geo, material ?? new THREE.MeshBasicMaterial(), colors.length)
  const c = new THREE.Color()
  colors.forEach((col, i) => im.setColorAt(i, c.set(col)))
  im.frustumCulled = false
  return im
}

const _o = new THREE.Object3D()

/** Place l'instance `i` (position, échelle uniforme ou par axe, rotation Y). */
export function setInstance(im: THREE.InstancedMesh, i: number, x: number, y: number, z: number, s: number | THREE.Vector3 = 1, rotY = 0) {
  _o.position.set(x, y, z)
  if (typeof s === 'number') _o.scale.setScalar(s)
  else _o.scale.copy(s)
  _o.rotation.set(0, rotY, 0)
  _o.updateMatrix()
  im.setMatrixAt(i, _o.matrix)
}

// ---------------------------------------------------------------- hologrammes

/** Horloge commune de tous les hologrammes. */
export const holoTime = { value: 0 }

export function tickFurniture(t: number) {
  holoTime.value = t
}

/**
 * Hologramme avec lignes de balayage et léger scintillement.
 * Le texte reste lisible des deux côtés (la texture est retournée sur la face arrière).
 * @param fade 0 : uniforme · 1 : s'estompe vers le haut (faisceaux, flammes)
 * @param additive lumière ajoutée (liquides, flammes) ; sinon mélange normal, qui reste lisible sur les sols clairs
 */
export function holoMaterial(map: THREE.Texture | null, color = ED_ORANGE, opacity = 1, fade = 0, additive = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: holoTime,
      uMap: { value: map },
      uHasMap: { value: map ? 1 : 0 },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uFade: { value: fade },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform sampler2D uMap;
      uniform float uHasMap;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uFade;
      varying vec2 vUv;
      void main() {
        vec2 uv = gl_FrontFacing ? vUv : vec2(1.0 - vUv.x, vUv.y);
        float a = uHasMap > 0.5 ? texture2D(uMap, uv).a : 1.0;
        float scan = 0.8 + 0.2 * sin(uv.y * 150.0 - uTime * 5.0);
        float flicker = 0.93 + 0.07 * sin(uTime * 21.0 + uv.y * 4.0);
        a *= uOpacity * scan * flicker * mix(1.0, 1.0 - uv.y, uFade);
        gl_FragColor = ${additive ? 'vec4(uColor * a, a)' : 'vec4(uColor, a)'};
        #include <colorspace_fragment>
      }`,
    transparent: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
}

export const lineMaterial = keepShared(new THREE.LineBasicMaterial({ color: ED_ORANGE, transparent: true, opacity: 0.85, depthWrite: false }))

/**
 * Halo en dégradé (jets des tuyères, faisceaux de l'ascenseur et du Holo-Me).
 * @param additive lumière ajoutée ; sinon mélange normal, qui reste visible sur les sols clairs
 */
export function beamMaterial(additive = true): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#40b4ff') },
      uIntensity: { value: 0.9 },
    },
    vertexShader: `
      varying float vH;
      void main() {
        vH = 1.0 - uv.y; // 1 à la base, 0 à l'extrémité
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uIntensity;
      varying float vH;
      void main() {
        float flicker = 0.85 + 0.15 * sin(uTime * 40.0 + vH * 20.0);
        vec3 col = mix(uColor, vec3(0.92, 0.97, 1.0), vH * vH);
        gl_FragColor = vec4(col * flicker, pow(vH, 1.6) * uIntensity);
      }`,
    transparent: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
}

/** Points d'une ellipse horizontale, par paires de segments (pour LineSegments). */
export function ellipseSegments(rx: number, rz: number, y = 0, seg = 48): THREE.Vector3[] {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i < seg; i++) {
    for (const k of [i, i + 1]) {
      const a = (k / seg) * Math.PI * 2
      pts.push(new THREE.Vector3(Math.cos(a) * rx, y, Math.sin(a) * rz))
    }
  }
  return pts
}

/**
 * Écran façon interface d'Elite : cadre à coins coupés, bandeau de titre, lignes de texte.
 * @param label « TITRE|ligne 1|ligne 2… »
 */
export function panelTexture(label: string): THREE.CanvasTexture {
  const [title, ...rows] = label.split('|')
  const W = 512, H = 320, cut = 26
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = g.strokeStyle = '#fff'
  g.beginPath()
  g.moveTo(cut, 4)
  g.lineTo(W - 4, 4)
  g.lineTo(W - 4, H - cut)
  g.lineTo(W - cut, H - 4)
  g.lineTo(4, H - 4)
  g.lineTo(4, cut)
  g.closePath()
  g.globalAlpha = 0.28
  g.fill()
  g.globalAlpha = 0.95
  g.lineWidth = 5
  g.stroke()
  // Bandeau de titre, texte découpé dedans.
  g.fillRect(22, 22, W - 44, 56)
  g.globalCompositeOperation = 'destination-out'
  g.font = '700 38px system-ui, "Segoe UI", sans-serif'
  g.textBaseline = 'middle'
  g.fillText(title.toUpperCase(), 38, 51)
  g.globalCompositeOperation = 'source-over'
  // Lignes : texte, puis une jauge.
  g.font = '500 30px system-ui, "Segoe UI", sans-serif'
  rows.forEach((row, i) => {
    const y = 118 + i * 50
    g.globalAlpha = 0.9
    g.fillText(row, 38, y)
    g.globalAlpha = 0.35
    g.fillRect(38, y + 20, W - 76, 3)
  })
  // Petits repères dans le coin.
  g.globalAlpha = 0.8
  for (let i = 0; i < 4; i++) g.fillRect(W - 60 + i * 11, H - 30, 6, 12)
  const t = new THREE.CanvasTexture(c)
  t.anisotropy = 4
  return t
}

/**
 * Nuage de points dont la taille est donnée en unités du monde (et suit donc le zoom).
 * Mélange normal : en additif, les points se cumulent jusqu'au blanc sur les sols clairs.
 */
export function pointCloud(positions: Float32Array, colors: Float32Array, sizes: Float32Array): THREE.Points {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  const material = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 }, uTime: holoTime },
    vertexShader: `
      attribute vec3 aColor;
      attribute float aSize;
      uniform float uScale;
      uniform float uTime;
      varying vec3 vColor;
      void main() {
        vColor = aColor * (0.85 + 0.15 * sin(uTime * 2.0 + position.x * 40.0));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        // Orthographique : projectionMatrix[1][1] = 2 / hauteur visible.
        gl_PointSize = max(1.5, aSize * uScale * projectionMatrix[1][1]);
      }`,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float a = smoothstep(0.25, 0.05, dot(p, p));
        gl_FragColor = vec4(vColor, a * 0.9);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  })
  const points = new THREE.Points(geo, material)
  const size = new THREE.Vector2()
  points.onBeforeRender = (renderer) => {
    geo.setDrawRange(0, renderQuality.light ? Math.ceil(positions.length / 12) : positions.length / 3)
    material.uniforms.uScale.value = renderer.getDrawingBufferSize(size).y * 0.5
  }
  points.frustumCulled = false
  return points
}

// ---------------------------------------------------------------- textures dessinées

/** Texture dessinée une fois dans un canvas (enseignes, décalcomanies). */
export function drawnTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/**
 * Écran animé : un canvas redessiné à cadence réduite (bornes d'arcade, moniteurs).
 * `tick(t)` ne redessine (et ne renvoie la texture au GPU) qu'à chaque nouvelle image.
 */
export function animatedScreen(w: number, h: number, fps: number, draw: (g: CanvasRenderingContext2D, t: number) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  draw(g, 0)
  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.NearestFilter
  let frame = -1
  return {
    texture,
    tick(t: number) {
      const f = Math.floor(t * fps)
      if (f === frame) return
      frame = f
      draw(g, t)
      texture.needsUpdate = true
    },
  }
}

/** Plaque posée au sol (bandes de danger, tapis imprimés), légèrement décollée pour ne pas scintiller. */
export function decal(texture: THREE.Texture, w: number, d: number, y = 0.006): THREE.Mesh {
  const m = new THREE.MeshLambertMaterial({ map: texture, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 })
  const p = part(new THREE.PlaneGeometry(w, d), m, 0, y, 0)
  p.rotation.x = -Math.PI / 2
  p.receiveShadow = true
  return p
}

/** Bandes jaunes et noires. */
export function hazardTexture(w = 256, h = 256, stripe = 32): THREE.CanvasTexture {
  return drawnTexture(w, h, (g) => {
    g.fillStyle = '#17181b'
    g.fillRect(0, 0, w, h)
    g.fillStyle = '#e9a917'
    for (let x = -h; x < w + h; x += stripe * 2) {
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x + stripe, 0)
      g.lineTo(x + stripe + h, h)
      g.lineTo(x + h, h)
      g.closePath()
      g.fill()
    }
  })
}
