import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { box, decal, drawnTexture, glow, holoTime, lit, mesh, part, rng } from '../furniture/kit'
import { tr } from '../i18n'
import type { LevelDef, LightDef, Prop } from '../levels'
import type { ZoneKit } from '../salvage/kit'
import { ARENA_LEVEL, type ArenaZone } from '../../shared/arena.js'
import { composeExtras, type ArenaExtras, type BushLook } from './deck'
import type { Venue } from './venue'

/*
 * La ruche (cf. ARENA_MAPS) : une structure thargoïde, au fond d'une caverne. Le terrain est un
 * octogone ; au milieu, la chambre du cœur, octogone elle aussi, et de chacun de ses sommets une
 * nervure court jusqu'au sommet de l'enceinte. Cette figure est gravée dans le sol et y luit (les
 * veines), même là où la nervure est percée d'un passage ou la chambre ouverte : vue de dessus, on
 * lit la structure entière.
 *
 * Tout est de la chitine thargoïde, noire, d'un reflet vert : les nervures et l'enceinte sont des
 * blocs arrondis qui se fondent l'un dans l'autre (débordant de leur tuile comme un mur du kit, dont
 * ils tiennent lieu), et la figure luit aussi à leur sommet ; le cœur est un socle octogonal que
 * serrent huit griffes, où bat une boule de lumière dans un anneau de particules. Le sol, lui, est
 * de résine à hexagones. Les cosses sont les spires du nid de la zone thargoïde ; les buissons, des
 * massifs de spores aux têtes luisantes.
 *
 * Autour (cf. cavern), le sol de la caverne, des grappes de cristaux, et des spores qui montent
 * partout. En vue subjective seulement : huit bras géants qui partent de l'enceinte et se rejoignent
 * très haut au-dessus du cœur, et la voûte de la caverne. Le public n'est pas là : quand quelqu'un
 * tombe, c'est la ruche qui répond (le cœur s'emballe, les veines s'illuminent).
 */

/** Le vert des veines thargoïdes, et celui du cœur au plus fort de son battement. */
const VEIN = '#39ff88'
const BRIGHT = '#c9ffe0'
/** La ruche dessine la même figure que son plan (cf. ARENA_MAPS) : les sommets de l'enceinte et de la chambre, en tuiles. */
const OUTER: [number, number][] = [[5, 0], [13, 0], [18, 5], [18, 13], [13, 18], [5, 18], [0, 13], [0, 5]]
const INNER: [number, number][] = [[7, 5], [11, 5], [13, 7], [13, 11], [11, 13], [7, 13], [5, 11], [5, 7]]
/**
 * La chitine de la ruche : noire, lisse, un reflet vert. Un matériau à elle : ses pièces (des
 * géométries indexées) ne se fusionnent pas avec celles du mobilier fait main, qui ne le sont plus.
 * Les hexagones, seulement au sol (cf. hiveFloor) : sur les murs, à cette échelle, ils brouilleraient tout.
 */
let hiveChitin: THREE.MeshLambertMaterial | null = null
const chitin = () => (hiveChitin ??= new THREE.MeshLambertMaterial({ color: '#3a4a41', emissive: '#0b2a19', emissiveIntensity: 0.5 }))
/** Les blocs arrondis ne sont pas indexés : toutes les pièces de chitine ne le sont donc pas (le pont les fusionne ensemble). */
const flat = (g: THREE.BufferGeometry) => g.toNonIndexed()

/** Hauteur des nervures et de l'enceinte (celle des murs du kit). */
const RIB_H = 0.96

/** Les buissons de la ruche : des spores, d'un vert d'eau sombre, aux têtes qui luisent. */
const HIVE_BUSHES: BushLook = { hue: 0.4, sat: 0.5, light: 0.08, blooms: ['#7dffa8', '#c8ff6a', VEIN], glow: 0.9 }

/**
 * Un bloc de chitine sur une tuile : arrondi, débordant de 0,15 de chaque côté (comme un mur du kit :
 * les balles s'arrêtent au bord de la tuile, dans son épaisseur) ; deux blocs voisins se fondent en
 * une seule nervure. Sur l'enceinte (`ridge`), quelques épines au sommet.
 */
function rib(random: () => number, height: number, ridge = false): THREE.Group {
  const solid = chitin()
  const g = new THREE.Group()
  g.add(box(1.3, height, 1.3, solid, 0, height / 2, 0, 0.12))
  if (ridge && random() < 0.5) {
    for (let i = 0; i < 2; i++) {
      const h = 0.22 + random() * 0.3
      const spike = mesh(flat(new THREE.CylinderGeometry(0, 0.07 + random() * 0.05, h, 6)), solid, (random() - 0.5) * 0.7, height + h / 2 - 0.02, (random() - 0.5) * 0.7)
      spike.rotation.set((random() - 0.5) * 0.5, 0, (random() - 0.5) * 0.5)
      g.add(spike)
    }
  }
  return g
}

/** Le socle du cœur (3 × 3 tuiles), centré : un octogone de résine que serrent huit griffes veinées de vert, des cristaux aux coins. */
function coreMount(random: () => number): THREE.Group {
  const solid = chitin()
  const g = new THREE.Group()
  g.add(mesh(flat(new THREE.CylinderGeometry(1.5 / Math.cos(Math.PI / 8), 1.58 / Math.cos(Math.PI / 8), 0.5, 8).rotateY(Math.PI / 8)), solid, 0, 0.25, 0))
  g.add(mesh(flat(new THREE.CylinderGeometry(0.62, 0.9, 0.35, 8).rotateY(Math.PI / 8)), solid, 0, 0.66, 0))
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    const at = (r: number, y: number) => new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r)
    const curve = new THREE.CatmullRomCurve3([at(1.45, 0.45), at(1.25, 0.95), at(0.85, 1.35), at(0.45, 1.5)])
    g.add(mesh(flat(new THREE.TubeGeometry(curve, 16, 0.085, 6)), solid))
    g.add(part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curve.getPoints(8).map((p) => p.setY(p.y + 0.07))), 16, 0.016, 5), glow(VEIN)))
  }
  // Les coins de ses trois tuiles : des cristaux, que le socle octogonal laisse à nu.
  const crystal = lit('#25b866')
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    for (let k = 0; k < 3; k++) {
      const h = 0.25 + random() * 0.3
      const c = mesh(new THREE.CylinderGeometry(0, 0.06 + random() * 0.04, h, 6), crystal, sx * (1.22 + random() * 0.12), h / 2 - 0.02, sz * (1.22 + random() * 0.12))
      c.rotation.set((random() - 0.5) * 0.7, random() * Math.PI, (random() - 0.5) * 0.7)
      g.add(c)
    }
  }
  return g
}

/** Les segments de la figure, en tuiles : l'enceinte, la chambre, les huit nervures. */
function figure(): [number, number, number, number][] {
  const ring = (pts: [number, number][]) => pts.map(([x, z], i): [number, number, number, number] => [x, z, pts[(i + 1) % pts.length][0], pts[(i + 1) % pts.length][1]])
  return [...ring(OUTER), ...ring(INNER), ...INNER.map(([x, z], i): [number, number, number, number] => [x, z, OUTER[i][0], OUTER[i][1]])]
}

/**
 * Le sol de la ruche : de la résine sombre en hexagones, chaque tuile un peu différente ; la figure
 * gravée (les veines, qui luisent par-dessus, cf. veins) ; la lueur du cœur ; la mousse des spores ;
 * un liseré vert au pied des obstacles.
 */
function hiveFloor(zone: ArenaZone): THREE.Object3D {
  const T = 64, W = zone.width * T, H = zone.height * T
  const random = rng(808)
  const texture = drawnTexture(W, H, (c) => {
    c.clearRect(0, 0, W, H)
    const ground = (x: number, z: number) => x >= 0 && z >= 0 && x < zone.width && z < zone.height && zone.room[z * zone.width + x] !== ' '
    const solid = (x: number, z: number) => !ground(x, z) || !!zone.blocked[z * zone.width + x]
    for (let z = 0; z < zone.height; z++) {
      for (let x = 0; x < zone.width; x++) {
        if (!ground(x, z)) continue
        const l = 6.5 + random() * 2.5
        c.fillStyle = `hsl(150, 18%, ${l}%)`
        c.fillRect(x * T, z * T, T, T)
      }
    }
    // Les hexagones de la résine, sur tout le sol.
    c.save()
    c.globalCompositeOperation = 'source-atop'
    c.strokeStyle = '#2a3b31'
    c.lineWidth = 2
    const r = 22, h = r * Math.sqrt(3)
    for (let row = -1; row < H / h + 1; row++) {
      for (let col = -1; col < W / (r * 1.5) + 1; col++) {
        const cx = col * r * 1.5, cy = row * h + (col % 2 ? h / 2 : 0)
        c.beginPath()
        for (let k = 0; k <= 6; k++) c.lineTo(cx + Math.cos((k / 6) * Math.PI * 2) * r * 0.94, cy + Math.sin((k / 6) * Math.PI * 2) * r * 0.94)
        c.stroke()
      }
    }
    // La lueur du cœur, sur la chambre.
    const glowing = c.createRadialGradient(W / 2, H / 2, T * 1.2, W / 2, H / 2, T * 5.5)
    glowing.addColorStop(0, '#39ff8840')
    glowing.addColorStop(1, '#39ff8800')
    c.fillStyle = glowing
    c.fillRect(0, 0, W, H)
    // La figure, gravée : un sillon sombre que les veines éclairent.
    c.strokeStyle = '#071009'
    c.lineWidth = 12
    c.lineCap = 'round'
    for (const [x0, z0, x1, z1] of figure()) {
      c.beginPath()
      c.moveTo((x0 + 0.5) * T, (z0 + 0.5) * T)
      c.lineTo((x1 + 0.5) * T, (z1 + 0.5) * T)
      c.stroke()
    }
    c.restore()
    // La mousse des spores.
    for (let z = 0; z < zone.height; z++) {
      for (let x = 0; x < zone.width; x++) {
        if (!zone.bush[z * zone.width + x]) continue
        c.fillStyle = '#10251a'
        c.beginPath()
        c.roundRect(x * T + 3, z * T + 3, T - 6, T - 6, 16)
        c.fill()
        c.fillStyle = '#2f8a55'
        for (let k = 0; k < 14; k++) {
          c.beginPath()
          c.arc(x * T + 8 + random() * (T - 16), z * T + 8 + random() * (T - 16), 1.5 + random() * 2, 0, Math.PI * 2)
          c.fill()
        }
      }
    }
    // Liseré vert au pied de chaque obstacle.
    c.fillStyle = '#2fa86699'
    for (let z = 0; z < zone.height; z++) {
      for (let x = 0; x < zone.width; x++) {
        if (solid(x, z)) continue
        if (solid(x, z - 1)) c.fillRect(x * T, z * T, T, 4)
        if (solid(x, z + 1)) c.fillRect(x * T, (z + 1) * T - 4, T, 4)
        if (solid(x - 1, z)) c.fillRect(x * T, z * T, 4, T)
        if (solid(x + 1, z)) c.fillRect((x + 1) * T - 4, z * T, 4, T)
      }
    }
  })
  const sheet = decal(texture, zone.width, zone.height, 0.008)
  sheet.position.set((zone.width - 1) / 2, sheet.position.y, (zone.height - 1) / 2)
  return new THREE.Group().add(sheet)
}

export function hiveLevel(zone: ArenaZone, kit: ZoneKit): LevelDef {
  const random = rng(2025)
  const props: Prop[] = []
  const ground = (x: number, z: number) => x >= 0 && z >= 0 && x < zone.width && z < zone.height && zone.room[z * zone.width + x] !== ' '
  // Les nervures et la chambre : une tuile à la fois (chacune s'estompe devant le joueur, comme un mur).
  for (let z = 0; z < zone.height; z++) {
    for (let x = 0; x < zone.width; x++) {
      if (zone.plan[z][x] === '#') props.push({ model: 'prebuilt', object: rib(random, RIB_H), x, z, solid: false })
    }
  }
  // L'enceinte : le vide qui borde le terrain (pas les nervures, qui n'ont pas de sol non plus), jusqu'au-delà de ses bords.
  const inside = (x: number, z: number) => (zone.plan[z]?.[x] ?? ' ') !== ' '
  for (let z = -1; z <= zone.height; z++) {
    for (let x = -1; x <= zone.width; x++) {
      if (inside(x, z)) continue
      let edge = false
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (inside(x + dx, z + dz)) edge = true
      if (edge) props.push({ model: 'prebuilt', object: rib(random, RIB_H + 0.08, true), x, z, solid: false })
    }
  }
  for (const c of zone.containers) {
    if (c.kind === 'core') props.push({ model: 'prebuilt', object: coreMount(random), x: c.x + (c.w - 1) / 2, z: c.z + (c.d - 1) / 2 })
    // Les cosses : les spires du nid de la zone thargoïde (cf. src/furniture/salvage.ts).
    else if (c.kind === 'pod') props.push({ model: 'thargoid-spire', x: c.x, z: c.z })
  }
  props.push({ model: 'prebuilt', object: hiveFloor(zone), x: 0, z: 0, solid: false })

  // Des cristaux et des ossements au pied des nervures, jamais dans une base ni un buisson.
  const kinds = ['crystals', 'bones', 'crystals'] as const
  let n = 0
  for (let z = 0; z < zone.height; z++) {
    for (let x = 3; x < zone.width - 3; x++) {
      const i = z * zone.width + x
      if (!ground(x, z) || zone.blocked[i] || zone.bush[i]) continue
      const side = [[0, -1], [1, 0], [0, 1], [-1, 0]].filter(([dx, dz]) => zone.plan[z + dz]?.[x + dx] === '#')
      if (!side.length || random() > 0.3) continue
      const [dx, dz] = side[Math.floor(random() * side.length)]
      props.push({ model: 'prebuilt', object: kit.decor(kinds[n % kinds.length], n), x: x + dx * 0.32, z: z + dz * 0.32, rot: (n % 4) as 0 | 1 | 2 | 3, solid: false })
      n++
    }
  }

  // Une lumière pâle, verte, et celle du cœur, qui respire.
  const lights: LightDef[] = []
  for (let z = 2; z < zone.height; z += 5) {
    for (let x = 2; x < zone.width; x += 5) lights.push([x, z, '#d6ffe4', 2.3, undefined, 8])
  }
  lights.push([(zone.width - 1) / 2, (zone.height - 1) / 2, '#5dff9a', 3.2, 'breath', 7])

  return {
    id: ARENA_LEVEL,
    name: 'CMDR Arena',
    theme: 'raw',
    // La pénombre verte d'une ruche : assez de jour pour se voir, le vert pour le reste.
    ambience: { sky: '#8fd2a8', ground: '#0d1a12', hemi: 1.7, sun: '#c4ffd8', sunIntensity: 1.0 },
    footsteps: 'hard',
    layout: zone.layout,
    rooms: { a: tr('La ruche', 'The hive') },
    windows: { a: 0 },
    props,
    lights,
    // Les murs du kit ne se voient pas : les colonnes en tiennent lieu (leurs collisions restent).
    zone: { kit: { ...kit, wall: () => new THREE.Group(), post: () => new THREE.Group() }, map: { walls: [], doors: [] }, plain: true },
    open: true,
  }
}

// ------------------------------------------------------------------ ce qui bouge

const veinUniforms = { uTime: holoTime, uWave: { value: -10 }, uHype: { value: 0 } }

/**
 * Les veines : la figure du sol (ou, `onRibs`, l'épine au sommet des nervures), qui luit, d'un
 * éclat qui s'écoule du cœur vers l'enceinte. Quand
 * la ruche s'agite (`uHype`), elle luit plus fort ; une vague (`uWave`, son rayon en tuiles) la
 * parcourt du cœur vers les bords.
 */
function veins(zone: ArenaZone, onRibs = false): THREE.Mesh {
  const T = 48, W = zone.width * T, H = zone.height * T
  // Au sol, la figure ; au sommet des nervures, leur épine : d'une tuile à sa voisine, par leur milieu.
  const rib = (x: number, z: number) => zone.plan[z]?.[x] === '#'
  const lines: [number, number, number, number][] = []
  if (!onRibs) lines.push(...figure())
  else {
    for (let z = 0; z < zone.height; z++) {
      for (let x = 0; x < zone.width; x++) {
        if (!rib(x, z)) continue
        lines.push([x, z, x, z])
        if (rib(x + 1, z)) lines.push([x, z, x + 1, z])
        if (rib(x, z + 1)) lines.push([x, z, x, z + 1])
      }
    }
  }
  const map = drawnTexture(W, H, (c) => {
    c.fillStyle = '#000000'
    c.fillRect(0, 0, W, H)
    c.strokeStyle = '#ffffff'
    c.lineCap = 'round'
    c.shadowColor = '#ffffff'
    for (const [width, blur] of onRibs ? [[5, 9], [2, 0]] : [[7, 14], [3, 0]]) {
      c.lineWidth = width
      c.shadowBlur = blur
      for (const [x0, z0, x1, z1] of lines) {
        c.beginPath()
        c.moveTo((x0 + 0.5) * T, (z0 + 0.5) * T)
        c.lineTo((x1 + 0.5) * T, (z1 + 0.5) * T)
        c.stroke()
      }
    }
  })
  const material = new THREE.ShaderMaterial({
    uniforms: { ...veinUniforms, uMap: { value: map }, uSize: { value: new THREE.Vector2(zone.width, zone.height) }, uColor: { value: new THREE.Color(VEIN).multiplyScalar(onRibs ? 0.75 : 1) } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform vec2 uSize;
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uWave;
      uniform float uHype;
      varying vec2 vUv;
      void main() {
        float line = texture2D(uMap, vUv).r;
        vec2 p = (vUv - 0.5) * uSize;
        float d = length(p);
        float flow = 0.5 + 0.5 * sin(d * 1.1 - uTime * 2.4);
        float wave = exp(-pow((d - uWave) * 0.9, 2.0));
        float k = line * (0.38 + 0.28 * flow + 0.55 * uHype + 1.2 * wave);
        gl_FragColor = vec4(mix(uColor, vec3(0.85, 1.0, 0.92), wave * 0.6) * k, 1.0);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
  })
  const plane = part(new THREE.PlaneGeometry(zone.width, zone.height).rotateX(-Math.PI / 2), material, (zone.width - 1) / 2, onRibs ? RIB_H + 0.025 : 0.012, (zone.height - 1) / 2)
  plane.renderOrder = 1
  return plane
}

/**
 * Des particules lumineuses : leur matériau. Chacune luit à son rythme (`aSeed`) ; leur taille
 * (`aSize`, en tuiles) reste la même vue de dessus (caméra orthographique) et diminue avec la
 * distance en vue subjective. `rise` : elles montent (et repartent du bas), en dérivant.
 */
function motes(rise: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: holoTime, uScale: { value: 380 }, uHype: veinUniforms.uHype, uColor: { value: new THREE.Color('#a8ffc8') } },
    vertexShader: `
      attribute float aSeed;
      attribute float aSize;
      uniform float uTime;
      uniform float uScale;
      uniform float uHype;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        ${rise > 0 ? `p.y = mod(p.y + uTime * (0.12 + aSeed * 0.2) * (1.0 + uHype), ${rise.toFixed(1)});
        p.x += sin(uTime * 0.6 + aSeed * 40.0) * 0.3;
        p.z += cos(uTime * 0.5 + aSeed * 31.0) * 0.3;
        vAlpha = smoothstep(0.0, 0.8, p.y) * smoothstep(${rise.toFixed(1)}, ${(rise - 1.5).toFixed(1)}, p.y);` : 'vAlpha = 1.0;'}
        vAlpha *= 0.55 + 0.45 * sin(uTime * 2.7 + aSeed * 50.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float far = projectionMatrix[3][3] > 0.5 ? 1.0 : -mv.z;
        gl_PointSize = max(1.0, aSize * uScale * projectionMatrix[1][1] / far);
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float a = smoothstep(0.25, 0.0, dot(q, q)) * vAlpha;
        gl_FragColor = vec4(uColor * a, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
}

/** Des particules (positions, et pour chacune son rythme et sa taille). */
function cloud(points: number[][], sizes: () => number, rise: number): THREE.Points {
  const random = rng(points.length)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points.flat()), 3))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(points.map(() => random())), 1))
  geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(points.map(sizes)), 1))
  const p = new THREE.Points(geo, motes(rise))
  p.frustumCulled = false
  return p
}

/** Le sol de la caverne autour de l'enceinte : de la roche sombre, des veines qui partent de la ruche, et l'ombre au loin. */
function caveFloor(size: number): THREE.Mesh {
  const S = 1024
  const random = rng(31)
  const map = drawnTexture(S, S, (c) => {
    c.fillStyle = '#121915'
    c.fillRect(0, 0, S, S)
    for (let i = 0; i < 900; i++) {
      c.fillStyle = `hsla(150, 12%, ${5 + random() * 12}%, 0.5)`
      c.beginPath()
      c.arc(random() * S, random() * S, 3 + random() * 22, 0, Math.PI * 2)
      c.fill()
    }
    c.strokeStyle = '#1f6b3f'
    c.lineWidth = 2
    for (let i = 0; i < 26; i++) {
      let a = (i / 26) * Math.PI * 2, r = S * 0.2
      c.beginPath()
      c.moveTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r)
      while (r < S * 0.5) {
        r += 14 + random() * 20
        a += (random() - 0.5) * 0.25
        c.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r)
      }
      c.stroke()
    }
    const shade = c.createRadialGradient(S / 2, S / 2, S * 0.18, S / 2, S / 2, S * 0.5)
    shade.addColorStop(0, '#00000000')
    shade.addColorStop(1, '#000000f0')
    c.fillStyle = shade
    c.fillRect(0, 0, S, S)
  })
  const floor = part(new THREE.CircleGeometry(size / 2, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map }))
  floor.receiveShadow = true
  return floor
}

/**
 * Ce qui entoure la ruche : le sol de la caverne, des grappes de cristaux, les spores, le cœur et
 * son anneau de lumière, une grappe de cristaux à la couleur de chaque camp derrière sa base. En
 * vue subjective seulement : les huit bras géants et la voûte.
 */
function cavern(zone: ArenaZone): Venue {
  const random = rng(77)
  const group = new THREE.Group()
  const high = new THREE.Group()
  const cx = (zone.width - 1) / 2, cz = (zone.height - 1) / 2
  const reach = Math.max(zone.width, zone.height) / 2

  const floor = caveFloor(reach * 4.2)
  floor.position.set(cx, -0.004, cz)
  group.add(floor, veins(zone), veins(zone, true))

  // Des grappes de cristaux sur le sol de la caverne, autour de l'enceinte (assez bas pour ne rien cacher).
  const crystals: THREE.BufferGeometry[] = []
  for (let i = 0; i < 22; i++) {
    const a = random() * Math.PI * 2, r = reach + 2 + random() * 5
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r
    for (let k = 0; k < 4; k++) {
      const h = 0.3 + random() * 0.8
      const g = new THREE.CylinderGeometry(0, 0.08 + random() * 0.1, h, 6)
      g.translate(0, h / 2, 0)
      g.rotateX((random() - 0.5) * 0.8)
      g.rotateZ((random() - 0.5) * 0.8)
      crystals.push(g.translate(x + (random() - 0.5) * 0.6, 0, z + (random() - 0.5) * 0.6))
    }
  }
  group.add(part(mergeGeometries(crystals)!, new THREE.MeshLambertMaterial({ color: '#1f8f52', emissive: '#14b85c', emissiveIntensity: 0.55 })))

  // Derrière chaque base, sur l'enceinte : des cristaux à la couleur de son camp.
  const teamGlow = [0, 1].map(() => new THREE.MeshBasicMaterial({ color: '#ffffff' }))
  for (const team of [0, 1]) {
    const parts: THREE.BufferGeometry[] = []
    const x = team ? zone.width : -1
    for (let z = Math.round(cz) - 3; z <= Math.round(cz) + 3; z++) {
      for (let k = 0; k < 3; k++) {
        const h = 0.35 + random() * 0.45
        const g = new THREE.CylinderGeometry(0, 0.07 + random() * 0.05, h, 6)
        g.translate(0, h / 2, 0)
        g.rotateX((random() - 0.5) * 0.9)
        g.rotateZ((team ? 1 : -1) * (0.3 + random() * 0.4))
        parts.push(g.translate(x + (random() - 0.5) * 0.5, 1.35, z + (random() - 0.5) * 0.8))
      }
    }
    group.add(part(mergeGeometries(parts)!, teamGlow[team]))
  }

  // Les spores : partout, du sol à la voûte, qui montent en dérivant.
  const spores: number[][] = []
  for (let i = 0; i < 700; i++) {
    const a = random() * Math.PI * 2, r = Math.sqrt(random()) * (reach + 6)
    spores.push([cx + Math.cos(a) * r, random() * 7, cz + Math.sin(a) * r])
  }
  group.add(cloud(spores, () => 0.03 + random() * 0.05, 7))

  // Le cœur : une boule de lumière qui bat au-dessus de son socle, dans un halo, au milieu d'un
  // anneau de particules qui tourne.
  const heart = new THREE.Group()
  heart.position.set(cx, 1.28, cz)
  const coreMat = new THREE.MeshBasicMaterial({ color: VEIN })
  const core = part(new THREE.IcosahedronGeometry(0.3, 2), coreMat)
  const haloMat = new THREE.MeshBasicMaterial({ color: VEIN, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })
  const halo = part(new THREE.SphereGeometry(0.55, 20, 14), haloMat)
  const ring: number[][] = []
  for (let i = 0; i < 160; i++) {
    const a = (i / 160) * Math.PI * 2 + random() * 0.05, r = 1.35 + (random() - 0.5) * 0.25
    ring.push([Math.cos(a) * r, (random() - 0.5) * 0.18, Math.sin(a) * r])
  }
  const halo2 = cloud(ring, () => 0.035 + random() * 0.04, 0)
  heart.add(core, halo, halo2)
  group.add(heart)

  // En vue subjective : huit bras géants, de l'enceinte jusqu'au-dessus du cœur, et la voûte. Ils
  // sont de la chitine sombre de la ruche, sans ses hexagones (à cette échelle, ils seraient énormes).
  const solid = lit('#141c18')
  const arms: THREE.BufferGeometry[] = [], seams: THREE.BufferGeometry[] = []
  for (const [vx, vz] of OUTER) {
    const dx = vx - cx, dz = vz - cz, len = Math.hypot(dx, dz)
    const ux = dx / len, uz = dz / len
    const at = (r: number, y: number) => new THREE.Vector3(cx + ux * r, y, cz + uz * r)
    const curve = new THREE.CatmullRomCurve3([at(len + 2.5, -0.2), at(len + 3.4, 3.2), at(len * 0.75, 7.2), at(len * 0.25, 9.2), at(0, 9.6)])
    arms.push(new THREE.TubeGeometry(curve, 40, 0.42, 7))
    seams.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curve.getPoints(20).map((p) => p.setY(p.y + 0.38))), 40, 0.05, 5))
  }
  high.add(mesh(mergeGeometries(arms)!, solid), part(mergeGeometries(seams)!, glow(VEIN)))
  // Le cœur, vu d'en bas : sa colonne monte jusqu'à la jonction des bras.
  high.add(mesh(new THREE.CylinderGeometry(0.16, 0.3, 8, 7), solid, cx, 5.5, cz))
  const vault = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), new THREE.MeshBasicMaterial({
    side: THREE.BackSide,
    map: drawnTexture(16, 256, (c) => {
      const sky = c.createLinearGradient(0, 0, 0, 256)
      sky.addColorStop(0, '#010302')
      sky.addColorStop(0.45, '#04100a')
      sky.addColorStop(0.5, '#0b2416')
      sky.addColorStop(1, '#050b08')
      c.fillStyle = sky
      c.fillRect(0, 0, 16, 256)
    }),
  }))
  vault.position.set(cx, 0, cz)
  high.add(vault)
  high.visible = false
  group.add(high)
  group.traverse((o) => {
    o.castShadow = false
  })

  const deep = new THREE.Color('#1f9a55'), bright = new THREE.Color(BRIGHT)
  let hype = 0
  let wave = -1
  return {
    group,
    voice: 'hive',
    paint(colors) {
      teamGlow.forEach((m, team) => m.color.set(colors[team]))
    },
    view(fps) {
      high.visible = fps
    },
    update(dt) {
      hype = Math.max(0, hype - dt * 0.4)
      veinUniforms.uHype.value = Math.min(1, hype)
      if (wave >= 0) {
        wave += dt * 9
        veinUniforms.uWave.value = wave
        if (wave > reach + 4) wave = -1
      } else veinUniforms.uWave.value = -10
      // Le cœur bat, deux coups puis repos, plus vite quand la ruche s'agite.
      const t = holoTime.value * (1 + hype)
      const beat = Math.max(0, Math.sin(t * 3.1)) ** 6 + 0.6 * Math.max(0, Math.sin(t * 3.1 - 0.9)) ** 6
      coreMat.color.lerpColors(deep, bright, Math.min(1, 0.35 + 0.65 * beat + 0.3 * hype))
      halo.scale.setScalar(1 + 0.35 * beat + 0.4 * hype)
      haloMat.opacity = 0.18 + 0.2 * beat + 0.2 * hype
      halo2.rotation.y += dt * (0.35 + hype)
    },
    cheer(amount) {
      hype = Math.max(hype, amount * 1.3)
    },
    ola() {
      wave = 0
    },
    board() {},
  }
}

/** La ruche : l'étage de ses nervures en vue subjective, ses buissons de spores, la caverne. */
export function hiveExtras(zone: ArenaZone, _kit: ZoneKit): ArenaExtras {
  const solid = chitin()
  const upper = new THREE.Group()
  const blocks: THREE.BufferGeometry[] = [], rims: THREE.BufferGeometry[] = []
  for (let z = 0; z < zone.height; z++) {
    for (let x = 0; x < zone.width; x++) {
      if (zone.plan[z][x] !== '#') continue
      blocks.push(new THREE.BoxGeometry(1.2, 0.9, 1.2).translate(x, RIB_H + 0.45, z))
      rims.push(new THREE.BoxGeometry(1.22, 0.06, 1.22).translate(x, RIB_H + 0.5, z))
    }
  }
  upper.add(mesh(mergeGeometries(blocks)!, solid), part(mergeGeometries(rims)!, glow(VEIN)))
  return composeExtras(zone, HIVE_BUSHES, upper, cavern(zone))
}
