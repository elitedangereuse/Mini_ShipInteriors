import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { drawnTexture, keepShared, part } from './kit'

/*
 * Le monument du hall : le blason d'Elite Dangerous en métal, les deux ailes, le vaisseau entre
 * elles, le bandeau et sa pointe ; « MINI » en lettres chromées à la place d'« ELITE », et
 * « SHIP INTERIORS » sur la lueur orange à la place de « DANGEROUS ». Il se lit des deux côtés.
 *
 * Tracé sur le logo (1 581 × 1 436 px) : les points sont en pixels du logo, y vers le bas ; les
 * pièces symétriques ne donnent que leur moitié gauche. Le repère du monument a son origine sous
 * la pointe (la boule du bas), y vers le haut, la face lisible vers +z.
 */

/** Pixels du logo par unité du monde : le blason fait 1,22 × 1,10. */
const S = 1300
/** Axe de symétrie, et bas de la boule. */
const CX = 790
const BOTTOM = 1430

type Pts = [number, number][]

const v2 = ([x, y]: [number, number]) => new THREE.Vector2((x - CX) / S, (BOTTOM - y) / S)
const v3 = ([x, y]: [number, number], z: number) => new THREE.Vector3((x - CX) / S, (BOTTOM - y) / S, z / S)
/** Image miroir (aile droite, moitié droite). */
const mirror = (pts: Pts): Pts => pts.map(([x, y]) => [2 * CX - x, y])
/** Contour complet d'une pièce symétrique dont on donne la moitié gauche, du haut au bas de l'axe. */
const symmetric = (half: Pts): Pts => [...half, ...mirror(half).reverse()]

/** Arc d'ellipse (centre, rayons, angles en degrés, 0° à droite, sens trigonométrique à l'écran). */
function arc(cx: number, cy: number, rx: number, ry: number, from: number, to: number, n = 8): Pts {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = THREE.MathUtils.degToRad(from + ((to - from) * i) / n)
    return [cx + Math.cos(a) * rx, cy - Math.sin(a) * ry] as [number, number]
  })
}

// ---------------------------------------------------------------- le tracé

/**
 * Aile gauche : la grande lame, en haut à gauche ; dessous, deux plumes en escalier, séparées par
 * des fentes en V ; à droite, l'échancrure arrondie contre le vaisseau, puis le rebord du bandeau.
 */
const WING: Pts = [
  [0, 12], [18, 0], [645, 552], [652, 566], [652, 600],
  [636, 626], [610, 655], [597, 685], [598, 715], [612, 738], [636, 750],
  [712, 751], [736, 770], [742, 808], [385, 808],
  [240, 612], [234, 522], [304, 576], [130, 386], [128, 278], [214, 330], [0, 116],
]

/** Les deux filets chromés en S de l'aile gauche, en relief sur sa face. */
const WING_RIDGES: Pts[] = [
  [[347, 296], [349, 397], [380, 450], [453, 523], [500, 563], [513, 603], [503, 643], [480, 672], [459, 703], [458, 737], [474, 770], [507, 795]],
  [[387, 480], [393, 550], [413, 590], [450, 640], [482, 668]],
]

/**
 * Le bandeau : trois dents à gauche (deux fentes), puis le bord qui file en biais jusqu'à la
 * pointe.
 */
const BAR = symmetric([
  [790, 808], [245, 808], [220, 832], [380, 832], [380, 850], [262, 850], [250, 872], [384, 872], [384, 888], [300, 888],
  [350, 936], [732, 1168], [790, 1168],
])

/** La pointe sous le bandeau : un fer de lance, puis une tige jusqu'à la boule. */
const DAGGER = symmetric([[790, 1160], [728, 1166], [710, 1202], [768, 1252], [777, 1376], [790, 1378]])

/** Le vaisseau : la verrière en dôme, le cou, le corps et son collier, posé sur le bandeau. */
const SHIP = symmetric([
  ...arc(790, 632, 45, 48, 90, 180, 6),
  [746, 640], [752, 656], [770, 672], [766, 698], [756, 712], [758, 740], [742, 744], [742, 812], [790, 812],
])
/** Ses deux antennes, ses moustaches et ses ailerons (côté gauche). */
const ANTENNA: Pts = [[763, 604], [764, 506], [770, 480], [776, 506], [777, 604]]
const WHISKER: Pts = [[750, 659], [716, 660], [711, 665], [716, 670], [750, 671]]
const FIN: Pts = [[752, 693], [712, 697], [692, 711], [752, 711]]
/** La verrière, au milieu du dôme. */
const CANOPY: Pts = symmetric([[790, 616], [778, 622], [776, 662], [790, 666]])

/** « MINI » : capitales à empattements de 143 px de haut, comme « ELITE », centrées sur l'axe. */
const LETTER_TOP = 815
const LETTER_BOTTOM = 958
function letterI(x: number): Pts {
  const [t, b] = [LETTER_TOP, LETTER_BOTTOM]
  return [[x, t], [x + 66, t], [x + 66, t + 22], [x + 53, t + 22], [x + 53, b - 22], [x + 66, b - 22], [x + 66, b], [x, b], [x, b - 22], [x + 13, b - 22], [x + 13, t + 22], [x, t + 22]]
}
function letterM(x: number): Pts {
  const [t, b] = [LETTER_TOP, LETTER_BOTTOM]
  return [[x, b], [x, t], [x + 46, t], [x + 96, t + 70], [x + 146, t], [x + 192, t], [x + 192, b], [x + 150, b], [x + 150, t + 64], [x + 104, b - 16], [x + 88, b - 16], [x + 42, t + 64], [x + 42, b]]
}
function letterN(x: number): Pts {
  const [t, b] = [LETTER_TOP, LETTER_BOTTOM]
  return [[x, b], [x, t], [x + 46, t], [x + 122, t + 92], [x + 122, t], [x + 164, t], [x + 164, b], [x + 118, b], [x + 42, b - 92], [x + 42, b]]
}
const LETTER_GAP = 34
const MINI: Pts[] = (() => {
  const widths = [192, 66, 164, 66]
  let x = CX - (widths.reduce((a, w) => a + w, 0) + LETTER_GAP * 3) / 2
  return [letterM, letterI, letterN, letterI].map((letter, i) => {
    const pts = letter(x)
    x += widths[i] + LETTER_GAP
    return pts
  })
})()

// ---------------------------------------------------------------- matériaux

/**
 * Matcap de chrome : ciel blanc bleuté en haut, horizon sombre, sol brun en bas, et un reflet. Le
 * chrome brille ainsi à toutes les lumières, et miroite quand la caméra tourne.
 */
function chromeMatcap(): THREE.CanvasTexture {
  return drawnTexture(256, 256, (g) => {
    const sky = g.createLinearGradient(0, 0, 0, 256)
    sky.addColorStop(0, '#ffffff')
    sky.addColorStop(0.3, '#c8d2de')
    sky.addColorStop(0.47, '#59606b')
    sky.addColorStop(0.53, '#1e2127')
    sky.addColorStop(0.68, '#8b7c6a')
    sky.addColorStop(1, '#2c2723')
    g.fillStyle = sky
    g.fillRect(0, 0, 256, 256)
    const shine = g.createRadialGradient(92, 78, 0, 92, 78, 70)
    shine.addColorStop(0, 'rgba(255, 255, 255, 0.95)')
    shine.addColorStop(1, 'rgba(255, 255, 255, 0)')
    g.fillStyle = shine
    g.fillRect(0, 0, 256, 256)
    // Le bord de la sphère, assombri : les arêtes de profil se détachent.
    const rim = g.createRadialGradient(128, 128, 96, 128, 128, 128)
    rim.addColorStop(0, 'rgba(0, 0, 0, 0)')
    rim.addColorStop(1, 'rgba(0, 0, 0, 0.55)')
    g.fillStyle = rim
    g.fillRect(0, 0, 256, 256)
  })
}

let materials: { iron: THREE.Material; silver: THREE.Material; chrome: THREE.Material; band: THREE.Material } | null = null

/** Le bandeau lumineux : la lueur rouge-orange, et « SHIP INTERIORS » en noir par-dessus. */
function bandTexture(): THREE.CanvasTexture {
  return drawnTexture(1024, 128, (g) => {
    const glow = g.createRadialGradient(512, 64, 0, 512, 64, 512)
    glow.addColorStop(0, 'rgba(255, 236, 170, 1)')
    glow.addColorStop(0.12, 'rgba(255, 170, 60, 1)')
    glow.addColorStop(0.45, 'rgba(240, 70, 20, 0.95)')
    glow.addColorStop(0.75, 'rgba(200, 30, 20, 0.5)')
    glow.addColorStop(1, 'rgba(170, 20, 20, 0)')
    g.save()
    g.translate(512, 64)
    g.scale(1, 0.13)
    g.translate(-512, -64)
    g.fillStyle = glow
    g.fillRect(0, -512, 1024, 1152)
    g.restore()
    const text = 'SHIP INTERIORS'
    g.font = '900 74px "Arial Black", "Helvetica Neue", Arial, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const spacing = 10
    const width = g.measureText(text).width + spacing * (text.length - 1)
    const scale = Math.min(1, 800 / width)
    g.translate(512, 66)
    g.scale(scale, 1)
    let x = -width / 2
    for (const ch of text) {
      const w = g.measureText(ch).width
      g.lineWidth = 5
      g.strokeStyle = '#6b6f78'
      g.strokeText(ch, x + w / 2, 0)
      g.fillStyle = '#0b0c0f'
      g.fillText(ch, x + w / 2, 0)
      x += w + spacing
    }
  })
}

function monumentMaterials() {
  materials ??= {
    iron: keepShared(new THREE.MeshPhongMaterial({ color: '#474c56', specular: '#6a707a', shininess: 24 })),
    silver: keepShared(new THREE.MeshPhongMaterial({ color: '#d4d9e0', specular: '#ffffff', shininess: 60, emissive: '#3c4048' })),
    chrome: keepShared(new THREE.MeshMatcapMaterial({ matcap: keepShared(chromeMatcap()) })),
    band: keepShared(new THREE.MeshBasicMaterial({ map: keepShared(bandTexture()), transparent: true, depthWrite: false, toneMapped: false })),
  }
  return materials
}

// ---------------------------------------------------------------- géométrie

/**
 * Plaque extrudée de `depth` px, centrée sur z = `z` px, à bords biseautés de `bevel` px (pris dans
 * le contour : la silhouette reste celle du logo). Renvoie ses faces et ses chants à part.
 */
function plate(pts: Pts, depth: number, bevel: number, z = 0): { faces: THREE.BufferGeometry; edges: THREE.BufferGeometry } {
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(v2)), {
    depth: depth / S, bevelEnabled: true, bevelThickness: bevel / S, bevelSize: bevel / S, bevelOffset: -bevel / S, bevelSegments: 2, curveSegments: 4,
  })
  geo.translate(0, 0, (z - depth / 2) / S)
  // ExtrudeGeometry : groupe 0, les deux faces ; groupe 1, les chants et les biseaux.
  const split = (index: number) => {
    const out = new THREE.BufferGeometry()
    const groups = geo.groups.filter((g) => g.materialIndex === index)
    for (const name of ['position', 'normal', 'uv']) {
      const a = geo.getAttribute(name) as THREE.BufferAttribute
      const parts = groups.map((g) => (a.array as Float32Array).slice(g.start * a.itemSize, (g.start + g.count) * a.itemSize))
      const array = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
      let o = 0
      for (const p of parts) { array.set(p, o); o += p.length }
      out.setAttribute(name, new THREE.BufferAttribute(array, a.itemSize))
    }
    return out
  }
  const result = { faces: split(0), edges: split(1) }
  geo.dispose()
  return result
}

/** Pièce entière, sans groupes (lettres, antennes : tout en chrome). */
function solidPlate(pts: Pts, depth: number, bevel: number, z = 0): THREE.BufferGeometry {
  const { faces, edges } = plate(pts, depth, bevel, z)
  const geo = mergeGeometries([faces, edges])
  faces.dispose()
  edges.dispose()
  return geo
}

/** Filet chromé (un tube) le long d'un tracé, posé à z px. */
function ridge(pts: Pts, z: number, radius: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => v3(p, z)))
  const tube = new THREE.TubeGeometry(curve, pts.length * 6, radius / S, 5, false)
  const flat = tube.toNonIndexed()
  tube.dispose()
  return flat
}

/** La même pièce vue de derrière : un demi-tour autour de l'axe du blason. */
const back = (geo: THREE.BufferGeometry) => geo.clone().rotateY(Math.PI)

/** Épaisseurs (px) : les ailes, le bandeau, la pointe, le vaisseau qui ressort. */
const WING_D = 34
const BAR_D = 46
const SHIP_D = 76
const BEVEL = 11

/**
 * Le monument (repère : origine sous la boule, face lisible vers +z). Quatre maillages : le métal
 * sombre des faces, l'argent des lettres, le chrome des biseaux et des filets, et le bandeau lumineux.
 */
export function eliteMonument(): THREE.Group {
  const { iron, silver, chrome, band } = monumentMaterials()
  const faces: THREE.BufferGeometry[] = []
  const edges: THREE.BufferGeometry[] = []
  const add = ({ faces: f, edges: e }: { faces: THREE.BufferGeometry; edges: THREE.BufferGeometry }) => {
    faces.push(f)
    edges.push(e)
  }

  // Les plaques : ailes, bandeau, pointe, vaisseau.
  add(plate(WING, WING_D, BEVEL))
  add(plate(mirror(WING), WING_D, BEVEL))
  add(plate(BAR, BAR_D, BEVEL))
  add(plate(DAGGER, BAR_D - 8, 9))
  add(plate(SHIP, SHIP_D, 9))
  for (const pts of [WHISKER, FIN]) {
    add(plate(pts, 26, 4))
    add(plate(mirror(pts), 26, 4))
  }

  // Le chrome en relief, sur une face : on le retourne pour l'autre.
  const front: THREE.BufferGeometry[] = []
  const wingFace = WING_D / 2 + BEVEL + 2
  for (const pts of WING_RIDGES) {
    front.push(ridge(pts, wingFace, 9), ridge(mirror(pts), wingFace, 9))
  }
  // Le fil de la pointe.
  front.push(ridge([[790, 1172], [790, 1250], [790, 1362]], (BAR_D - 8) / 2 + 9 + 2, 7))
  // « MINI », posé sur le bandeau : la face des lettres en argent clair, leurs biseaux en chrome.
  const letterD = 16
  const letters: THREE.BufferGeometry[] = []
  for (const pts of MINI) {
    const { faces: f, edges: e } = plate(pts, letterD, 7, BAR_D / 2 + BEVEL + letterD / 2 + 4)
    letters.push(f)
    front.push(e)
  }
  // La verrière du vaisseau.
  front.push(solidPlate(CANOPY, 10, 3, SHIP_D / 2 + 9 + 6))
  edges.push(...front, ...front.map(back))

  // Antennes et boule : tout en chrome, dans l'épaisseur.
  edges.push(solidPlate(ANTENNA, 20, 5), solidPlate(mirror(ANTENNA), 20, 5))
  const ball = new THREE.SphereGeometry(26 / S, 14, 10).toNonIndexed()
  ball.scale(1, 1.12, 1).translate(0, 29 / S, 0)
  edges.push(ball)

  const g = new THREE.Group()
  const meshes: [THREE.BufferGeometry[], THREE.Material][] = [[faces, iron], [[...letters, ...letters.map(back)], silver], [edges, chrome]]
  for (const [geos, material] of meshes) {
    const merged = new THREE.Mesh(mergeGeometries(geos), material)
    merged.castShadow = true
    for (const geo of geos) geo.dispose()
    g.add(merged)
  }

  // La lueur et « SHIP INTERIORS », devant et derrière le bandeau (chaque plan ne se voit que de
  // son côté). Elle déborde du métal, comme sur le logo.
  const w = 1000 / S, h = 125 / S
  const [, y] = v2([CX, 1032]).toArray()
  for (const side of [1, -1]) {
    const plane = part(new THREE.PlaneGeometry(w, h), band, 0, y, side * (BAR_D / 2 + BEVEL + 3) / S)
    if (side < 0) plane.rotation.y = Math.PI
    plane.renderOrder = 1
    g.add(plane)
  }
  return g
}
