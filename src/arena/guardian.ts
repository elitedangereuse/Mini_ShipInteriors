import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { decal, drawnTexture, holoTime, part, rng } from '../furniture/kit'
import { tr } from '../i18n'
import type { LevelDef, LightDef, Prop } from '../levels'
import type { ZoneKit } from '../salvage/kit'
import { ARENA_LEVEL, arenaGround, type ArenaZone } from '../../shared/arena.js'
import { composeExtras, type ArenaExtras, type BushLook } from './deck'
import type { Venue } from './venue'

/*
 * Le site gardien (cf. ARENA_MAPS) : des ruines gardiennes, de nuit, sur une planète morte, et un
 * terrain à deux hauteurs. Au milieu, le promontoire de la relique : un socle de blocs de pierre
 * sombre, gravés, qu'un liseré cyan borde ; on y monte par des rampes de dalles, comme celle qui
 * mène à la relique des sites gardiens. La relique flotte au-dessus de son socle, au milieu du
 * promontoire : une sphère de plaques sombres qui s'écartent sur un cœur de lumière. Des obélisques
 * aux fentes lumineuses (aux coins du promontoire, et au sol), des pans de ruines aux arêtes vives,
 * des nappes de brume bleutée (les buissons). Au sol, de la poussière et des dalles gravées de
 * motifs gardiens, dont les rainures luisent ; le réseau s'illumine depuis la relique.
 *
 * Autour : le sol de la planète, des rochers, deux pylônes à la couleur de chaque camp derrière sa
 * base. En vue subjective seulement : le ciel étoilé et sa traînée de poussière, les montagnes, les
 * faisceaux des obélisques et de la relique qui montent vers les étoiles. Quand quelqu'un tombe, la
 * relique s'embrase ; au coup d'envoi, une onde de lumière part d'elle.
 */

/** Le cyan des gardiens, et le blanc bleuté du cœur de leurs lumières. */
const CYAN = '#5ff2ff'
const CORE = '#d9fdff'
/** Hauteur d'un obélisque (de son sol), d'un pan de ruine. */
const OBELISK_H = 1.18
const RUIN_H = 0.96

/** Les géométries d'un même matériau sont fusionnées par le pont : toutes non indexées. */
const flat = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g)
const merged = (parts: THREE.BufferGeometry[], m: THREE.Material) => {
  const g = mergeGeometries(parts.map(flat))!
  for (const p of parts) p.dispose()
  const mesh = new THREE.Mesh(g, m)
  mesh.castShadow = mesh.receiveShadow = true
  return mesh
}

// ------------------------------------------------------------------ textures et matériaux

/** Une face de bloc gardien : pierre sombre, un cadre gravé, des entailles en biais, une fente qui luit. */
function blockTexture(seed: number, glyph = true): THREE.CanvasTexture {
  const random = rng(seed)
  return drawnTexture(128, 128, (c) => {
    c.fillStyle = '#2c2f35'
    c.fillRect(0, 0, 128, 128)
    for (let i = 0; i < 120; i++) {
      c.fillStyle = `rgba(${random() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + random() * 0.05})`
      c.fillRect(random() * 128, random() * 128, 2 + random() * 6, 2 + random() * 6)
    }
    c.strokeStyle = '#17191d'
    c.lineWidth = 4
    c.strokeRect(8, 8, 112, 112)
    c.strokeStyle = '#3d424a'
    c.lineWidth = 2
    c.strokeRect(14, 14, 100, 100)
    c.beginPath()
    c.moveTo(14, 40)
    c.lineTo(40, 14)
    c.moveTo(114, 88)
    c.lineTo(88, 114)
    c.stroke()
    if (!glyph) return
    c.fillStyle = CYAN
    c.globalAlpha = 0.85
    c.fillRect(60, 30, 6, 46)
    c.fillRect(48, 76, 30, 5)
    c.globalAlpha = 1
  })
}

let materials: ReturnType<typeof makeMaterials> | null = null

function makeMaterials() {
  const stone = (seed: number, glyph = true) => {
    const map = blockTexture(seed, glyph)
    return new THREE.MeshLambertMaterial({ map, emissive: '#3fe7ff', emissiveMap: map, emissiveIntensity: 0.06 })
  }
  return {
    /** Les flancs du promontoire, les obélisques, les ruines. */
    cliff: stone(11),
    ruin: stone(23),
    obelisk: stone(37, false),
    /** Ce qui luit : le cyan, et les arêtes sombres. */
    glow: new THREE.MeshBasicMaterial({ color: CYAN }),
    trim: new THREE.MeshLambertMaterial({ color: '#191b20' }),
    ramp: new THREE.MeshLambertMaterial({ map: rampTexture() }),
  }
}

const mats = () => (materials ??= makeMaterials())

/** Le dessus d'une rampe : des dalles en travers, deux bandes lumineuses le long des bords. */
function rampTexture(): THREE.CanvasTexture {
  return drawnTexture(128, 128, (c) => {
    c.fillStyle = '#34373e'
    c.fillRect(0, 0, 128, 128)
    for (let y = 0; y < 128; y += 21) {
      c.fillStyle = '#23262b'
      c.fillRect(0, y, 128, 4)
      c.fillStyle = '#44484f'
      c.fillRect(0, y + 4, 128, 2)
    }
    c.fillStyle = '#1b1d21'
    c.fillRect(0, 0, 12, 128)
    c.fillRect(116, 0, 12, 128)
    c.fillStyle = CYAN
    c.fillRect(4, 0, 3, 128)
    c.fillRect(121, 0, 3, 128)
  })
}

// ------------------------------------------------------------------ le relief

/** Une tuile du haut (le promontoire, ce qui s'y dresse) ? */
const isHigh = (zone: ArenaZone, x: number, z: number) =>
  x >= 0 && z >= 0 && x < zone.width && z < zone.height && zone.elev[z * zone.width + x] >= zone.top - 1e-6 && zone.stairs[z * zone.width + x] < 0

/**
 * Une rampe d'une tuile, qui monte vers l'est (+x) de 0 à `top` : son dessus en pente, son dos, ses
 * deux flancs (le dessous repose au sol). Tournée ensuite vers son sens (`up`, cf. DIRS).
 */
function wedge(top: number, up: number): THREE.BufferGeometry {
  const a = [-0.5, 0, -0.5], b = [-0.5, 0, 0.5], c = [0.5, top, -0.5], d = [0.5, top, 0.5], e = [0.5, 0, -0.5], f = [0.5, 0, 0.5]
  const tri = (...p: number[][]) => p.flat()
  const position = [
    ...tri(a, b, d), ...tri(a, d, c), // le dessus
    ...tri(e, c, d), ...tri(e, d, f), // le dos
    ...tri(a, c, e), ...tri(b, f, d), // les flancs
  ]
  // Les dalles du dessus courent en travers de la pente (u : la largeur, v : la montée).
  const uv = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, ...Array(24).fill(0)]
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  // Le sens de la montée : est (1), nord (0), sud (2), ouest (3).
  g.rotateY([Math.PI / 2, 0, -Math.PI / 2, Math.PI][up])
  return g
}

/**
 * Le promontoire : ses blocs (du sol au haut, une tuile chacun), son dessus (cf. topTexture), le
 * liseré lumineux de ses falaises et de ses rampes, quelques fentes gravées dans ses flancs.
 */
function plateau(zone: ArenaZone): THREE.Group {
  const top = zone.top
  const random = rng(64)
  const m = mats()
  const blocks: THREE.BufferGeometry[] = [], lights: THREE.BufferGeometry[] = [], trims: THREE.BufferGeometry[] = [], ramps: THREE.BufferGeometry[] = []
  for (let z = 0; z < zone.height; z++) {
    for (let x = 0; x < zone.width; x++) {
      const i = z * zone.width + x
      if (zone.stairs[i] >= 0) {
        ramps.push(wedge(top, zone.stairs[i]).translate(x, 0, z))
        continue
      }
      if (!isHigh(zone, x, z)) continue
      blocks.push(new THREE.BoxGeometry(1, top, 1).translate(x, top / 2, z))
      // Au bord : le liseré, sur l'arête ; parfois une fente qui luit sur le flanc.
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz
        if (isHigh(zone, nx, nz)) continue
        const n = nz * zone.width + nx
        const ramp = nx >= 0 && nz >= 0 && nx < zone.width && nz < zone.height ? zone.stairs[n] : -1
        // Le haut d'une rampe qui y monte : pas d'arête, la rampe s'y raccorde.
        if (ramp >= 0 && [[0, -1], [1, 0], [0, 1], [-1, 0]][ramp].every((v, k) => v === -[dx, dz][k])) continue
        const along = dz !== 0
        const ex = x + dx * 0.5, ez = z + dz * 0.5
        lights.push(new THREE.BoxGeometry(along ? 1 : 0.035, 0.03, along ? 0.035 : 1).translate(ex + dx * 0.012, top - 0.035, ez + dz * 0.012))
        trims.push(new THREE.BoxGeometry(along ? 1.02 : 0.08, 0.05, along ? 0.08 : 1.02).translate(ex - dx * 0.02, top + 0.012, ez - dz * 0.02))
        if (random() < 0.4) lights.push(new THREE.BoxGeometry(along ? 0.035 : 0.02, top * 0.55, along ? 0.02 : 0.035).translate(ex + dx * 0.012 + (along ? (random() - 0.5) * 0.6 : 0), top * 0.4, ez + dz * 0.012 + (along ? 0 : (random() - 0.5) * 0.6)))
      }
    }
  }
  const g = new THREE.Group()
  g.add(merged(blocks, m.cliff), merged(trims, m.trim), merged(ramps, m.ramp))
  const glowing = merged(lights, m.glow)
  glowing.castShadow = false
  g.add(glowing)
  return g
}

/** Le dessus du promontoire : de grandes dalles à motifs de triangles, une rosace autour de la relique. */
function topTexture(zone: ArenaZone): THREE.CanvasTexture {
  const T = 64, W = zone.width * T, H = zone.height * T
  return drawnTexture(W, H, (c) => {
    c.fillStyle = '#3a3d44'
    c.fillRect(0, 0, W, H)
    const random = rng(5)
    for (let z = 0; z < zone.height; z++) {
      for (let x = 0; x < zone.width; x++) {
        c.fillStyle = `hsl(220, 6%, ${20 + random() * 5}%)`
        c.fillRect(x * T + 2, z * T + 2, T - 4, T - 4)
        c.strokeStyle = '#4a4f58'
        c.lineWidth = 2
        c.beginPath()
        if ((x + z) % 2) {
          c.moveTo(x * T + 2, z * T + 2)
          c.lineTo((x + 1) * T - 2, (z + 1) * T - 2)
        } else {
          c.moveTo((x + 1) * T - 2, z * T + 2)
          c.lineTo(x * T + 2, (z + 1) * T - 2)
        }
        c.stroke()
      }
    }
    // La rosace : deux carrés tournés, autour de la relique.
    const cx = ((zone.width - 1) / 2 + 0.5) * T, cz = ((zone.height - 1) / 2 + 0.5) * T
    c.strokeStyle = '#555b66'
    c.lineWidth = 4
    for (const turn of [0, Math.PI / 4]) {
      c.save()
      c.translate(cx, cz)
      c.rotate(turn)
      c.strokeRect(-T * 1.2, -T * 1.2, T * 2.4, T * 2.4)
      c.restore()
    }
  })
}

/** Le dessus : une dalle par tuile du haut, la texture du promontoire étalée sur le plan. */
function plateauTop(zone: ArenaZone): THREE.Mesh {
  const quads: THREE.BufferGeometry[] = []
  for (let z = 0; z < zone.height; z++) {
    for (let x = 0; x < zone.width; x++) {
      if (!isHigh(zone, x, z)) continue
      const q = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(x, zone.top + 0.002, z)
      const uv = q.attributes.uv as THREE.BufferAttribute, pos = q.attributes.position as THREE.BufferAttribute
      for (let k = 0; k < uv.count; k++) uv.setXY(k, (pos.getX(k) + 0.5) / zone.width, 1 - (pos.getZ(k) + 0.5) / zone.height)
      quads.push(q)
    }
  }
  const mesh = merged(quads, new THREE.MeshLambertMaterial({ map: topTexture(zone) }))
  mesh.castShadow = false
  return mesh
}

// ------------------------------------------------------------------ ce qui se dresse

/** Un obélisque gardien, posé sur son sol : un socle, un fût qui s'affine, une fente qui luit, deux bandes au sommet. */
function obelisk(height = OBELISK_H, cap = true): THREE.Group {
  const m = mats()
  const g = new THREE.Group()
  const stone: THREE.BufferGeometry[] = [], light: THREE.BufferGeometry[] = []
  if (cap) stone.push(new THREE.BoxGeometry(0.86, 0.12, 0.86).translate(0, 0.06, 0))
  const shaft = height - (cap ? 0.32 : 0)
  const y0 = cap ? 0.12 : 0
  stone.push(new THREE.CylinderGeometry(0.24, 0.31, shaft, 4).rotateY(Math.PI / 4).translate(0, y0 + shaft / 2, 0))
  // La fente, sur deux faces opposées.
  for (const s of [-1, 1]) light.push(new THREE.BoxGeometry(0.05, shaft * 0.72, 0.03).translate(0, y0 + shaft * 0.45, s * 0.275))
  if (cap) {
    stone.push(new THREE.CylinderGeometry(0, 0.25, 0.2, 4).rotateY(Math.PI / 4).translate(0, y0 + shaft + 0.1, 0))
    for (const y of [0.06, 0.14]) light.push(new THREE.BoxGeometry(0.4, 0.035, 0.4).translate(0, y0 + shaft - y, 0))
  }
  g.add(merged(stone, m.obelisk))
  const glowing = merged(light, m.glow)
  glowing.castShadow = false
  g.add(glowing)
  return g
}

/** Un pan de ruine sur une tuile : un bloc gravé, débordant de 0,15 (un mur du kit), au sommet brisé. */
function ruin(random: () => number): THREE.Object3D {
  const m = mats()
  const stone: THREE.BufferGeometry[] = [new THREE.BoxGeometry(1.3, RUIN_H * 0.82, 1.3).translate(0, RUIN_H * 0.41, 0)]
  for (let i = 0; i < 3; i++) {
    const w = 0.4 + random() * 0.5, d = 0.4 + random() * 0.5, h = 0.12 + random() * 0.28
    stone.push(new THREE.BoxGeometry(w, h, d).rotateY((random() - 0.5) * 0.3).translate((random() - 0.5) * (1.3 - w), RUIN_H * 0.82 + h / 2, (random() - 0.5) * (1.3 - d)))
  }
  return new THREE.Group().add(merged(stone, m.ruin))
}

/** Le socle de la relique : une marche octogonale, un anneau lumineux, quatre ailerons en biais. */
function relicMount(): THREE.Object3D {
  const m = mats()
  const stone: THREE.BufferGeometry[] = [
    new THREE.CylinderGeometry(0.62, 0.66, 0.1, 8).rotateY(Math.PI / 8).translate(0, 0.05, 0),
    new THREE.CylinderGeometry(0.42, 0.5, 0.16, 8).rotateY(Math.PI / 8).translate(0, 0.18, 0),
  ]
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4
    stone.push(new THREE.BoxGeometry(0.1, 0.5, 0.3).translate(0, 0.25, 0).rotateZ(-0.35).translate(0.52, 0, 0).rotateY(a))
  }
  const ring = new THREE.TorusGeometry(0.44, 0.022, 6, 40).rotateX(Math.PI / 2).translate(0, 0.265, 0)
  const g = new THREE.Group()
  g.add(merged(stone, m.obelisk))
  const glowing = merged([ring], m.glow)
  glowing.castShadow = false
  g.add(glowing)
  return g
}

// ------------------------------------------------------------------ le sol

/** Les rainures du réseau gardien, en tuiles : autour des obélisques, au pied des rampes, vers les bases, sur le promontoire. */
function circuit(zone: ArenaZone): { low: number[][]; high: number[][] } {
  const low: number[][] = [], high: number[][] = []
  const cx = (zone.width - 1) / 2, cz = (zone.height - 1) / 2
  const square = (out: number[][], x: number, z: number, r: number) => {
    out.push([x - r, z - r, x + r, z - r], [x + r, z - r, x + r, z + r], [x + r, z + r, x - r, z + r], [x - r, z + r, x - r, z - r])
  }
  for (let z = 0; z < zone.height; z++) {
    for (let x = 0; x < zone.width; x++) {
      const c = zone.plan[z][x]
      if (c === 'p') {
        square(low, x, z, 0.62)
        low.push([x - 0.62, z, x - 1.1, z], [x + 0.62, z, x + 1.1, z])
      }
      if (c === 'P' || c === 'X') square(high, x, z, c === 'X' ? 0.75 : 0.55)
      // Au pied d'une rampe : la rainure part vers le large.
      const up = zone.stairs[z * zone.width + x]
      if (up >= 0) {
        const [dx, dz] = [[0, -1], [1, 0], [0, 1], [-1, 0]][up]
        low.push([x - dx * 0.5, z - dz * 0.5, x - dx * 1.6, z - dz * 1.6])
      }
    }
  }
  // Le promontoire : des rainures de la relique vers ses coins et ses rampes.
  for (const [x, z] of [[cx - 2, cz - 3], [cx + 2, cz - 3], [cx - 2, cz + 3], [cx + 2, cz + 3]]) high.push([cx, cz, x, z])
  high.push([cx - 2.4, cz, cx + 2.4, cz], [cx, cz - 3.4, cx, cz + 3.4])
  // Vers les bases : une ligne au milieu de chaque allée de côté.
  for (const s of [-1, 1]) low.push([cx + s * 4.6, cz, cx + s * 7.6, cz])
  return { low, high }
}

/** Le sol d'en bas : poussière rousse et cailloux, dalles gravées autour des obélisques et des rampes, la brume au sol. */
function groundTexture(zone: ArenaZone, lines: number[][]): THREE.CanvasTexture {
  const T = 64, W = zone.width * T, H = zone.height * T
  const random = rng(77)
  return drawnTexture(W, H, (c) => {
    c.fillStyle = '#332d29'
    c.fillRect(0, 0, W, H)
    for (let i = 0; i < 2600; i++) {
      c.fillStyle = `hsla(${20 + random() * 20}, ${10 + random() * 15}%, ${12 + random() * 16}%, 0.55)`
      c.beginPath()
      c.arc(random() * W, random() * H, 1 + random() * 5, 0, Math.PI * 2)
      c.fill()
    }
    // Les dalles gravées : sous le réseau, une bande de pierre sombre de part et d'autre de chaque rainure.
    c.strokeStyle = '#25272c'
    c.lineCap = 'square'
    c.lineWidth = 26
    for (const [x0, z0, x1, z1] of lines) {
      c.beginPath()
      c.moveTo((x0 + 0.5) * T, (z0 + 0.5) * T)
      c.lineTo((x1 + 0.5) * T, (z1 + 0.5) * T)
      c.stroke()
    }
    c.strokeStyle = '#0f1013'
    c.lineWidth = 7
    for (const [x0, z0, x1, z1] of lines) {
      c.beginPath()
      c.moveTo((x0 + 0.5) * T, (z0 + 0.5) * T)
      c.lineTo((x1 + 0.5) * T, (z1 + 0.5) * T)
      c.stroke()
    }
    // La brume au sol : une ombre bleutée sous chaque nappe.
    for (let z = 0; z < zone.height; z++) {
      for (let x = 0; x < zone.width; x++) {
        if (!zone.bush[z * zone.width + x]) continue
        const fog = c.createRadialGradient((x + 0.5) * T, (z + 0.5) * T, 4, (x + 0.5) * T, (z + 0.5) * T, T * 0.75)
        fog.addColorStop(0, '#5d7fa088')
        fog.addColorStop(1, '#5d7fa000')
        c.fillStyle = fog
        c.fillRect((x - 0.5) * T, (z - 0.5) * T, T * 2, T * 2)
      }
    }
  })
}

export function guardianLevel(zone: ArenaZone, kit: ZoneKit): LevelDef {
  const random = rng(2026)
  const props: Prop[] = []
  const lights: LightDef[] = []
  props.push({ model: 'prebuilt', object: plateau(zone), x: 0, z: 0, solid: false })
  props.push({ model: 'prebuilt', object: plateauTop(zone), x: 0, z: 0, solid: false })
  for (let z = 0; z < zone.height; z++) {
    for (let x = 0; x < zone.width; x++) {
      // Sur le haut, le pont les y pose de lui-même (cf. relief).
      const c = zone.plan[z][x]
      if (c === '#') props.push({ model: 'prebuilt', object: ruin(random), x, z, solid: false })
      if (c === 'p' || c === 'P') {
        props.push({ model: 'prebuilt', object: obelisk(), x, z, solid: false })
        lights.push([x, z, '#7ff6ff', 1.5, undefined, 3.5])
      }
      if (c === 'X') props.push({ model: 'prebuilt', object: relicMount(), x, z, solid: false })
    }
  }
  const { low } = circuit(zone)
  const ground = decal(groundTexture(zone, low), zone.width, zone.height, 0.008)
  ground.position.set((zone.width - 1) / 2, ground.position.y, (zone.height - 1) / 2)
  props.push({ model: 'prebuilt', object: new THREE.Group().add(ground), x: 0, z: 0, solid: false })

  // La lumière froide de la nuit, assez pour se voir ; la relique, qui respire.
  for (let z = 1; z < zone.height; z += 5) {
    for (let x = 2; x < zone.width; x += 5) lights.push([x, z, '#cfdcff', 2.0, undefined, 8])
  }
  lights.push([(zone.width - 1) / 2, (zone.height - 1) / 2, '#7ff6ff', 3.4, 'breath', 7])

  return {
    id: ARENA_LEVEL,
    name: 'CMDR Arena',
    theme: 'raw',
    ambience: { sky: '#6b7fa8', ground: '#1d1813', hemi: 1.8, sun: '#c8d8ff', sunIntensity: 1.1 },
    footsteps: 'hard',
    layout: zone.layout,
    rooms: { a: tr('Le site gardien', 'The Guardian site') },
    windows: { a: 0 },
    props,
    lights,
    // Ni murs ni poteaux du kit : les ruines et le promontoire en tiennent lieu. Les garde-corps
    // (falaises, flancs des rampes) sont des murs du plan : ils arrêtent les pas, et les chemins.
    zone: { kit: { ...kit, wall: () => new THREE.Group(), post: () => new THREE.Group() }, map: { walls: zone.rails, doors: [] }, plain: true },
    open: true,
    relief: { height: (x, z) => arenaGround(zone, { x, z }), levels: [zone.top] },
  }
}

// ------------------------------------------------------------------ ce qui bouge

const glowUniforms = { uTime: holoTime, uWave: { value: -10 }, uHype: { value: 0 } }

/**
 * Le réseau qui luit : les rainures (`lines`), sur un plan à hauteur `y`. Une lueur s'en écoule
 * depuis la relique ; quand la relique s'embrase (`uHype`), tout luit plus fort, et une onde
 * (`uWave`, son rayon en tuiles) part d'elle.
 */
function network(zone: ArenaZone, lines: number[][], y: number): THREE.Mesh {
  const T = 40, W = zone.width * T, H = zone.height * T
  const map = drawnTexture(W, H, (c) => {
    c.fillStyle = '#000000'
    c.fillRect(0, 0, W, H)
    c.strokeStyle = '#ffffff'
    c.shadowColor = '#ffffff'
    c.lineCap = 'round'
    for (const [width, blur] of [[5, 10], [2, 0]]) {
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
    uniforms: { ...glowUniforms, uMap: { value: map }, uSize: { value: new THREE.Vector2(zone.width, zone.height) }, uColor: { value: new THREE.Color(CYAN) } },
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
        float d = length((vUv - 0.5) * uSize);
        float flow = 0.5 + 0.5 * sin(d * 1.3 - uTime * 1.8);
        float wave = exp(-pow((d - uWave) * 0.8, 2.0));
        float k = line * (0.32 + 0.3 * flow + 0.6 * uHype + 1.3 * wave);
        gl_FragColor = vec4(mix(uColor, vec3(0.9, 1.0, 1.0), wave * 0.6) * k, 1.0);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
  })
  const plane = part(new THREE.PlaneGeometry(zone.width, zone.height).rotateX(-Math.PI / 2), material, (zone.width - 1) / 2, y, (zone.height - 1) / 2)
  plane.renderOrder = 1
  return plane
}

/** Des particules lumineuses qui flottent (positions, taille en tuiles) : elles montent et redescendent doucement. */
function motes(points: number[][], size: () => number, color: string): THREE.Points {
  const random = rng(points.length + 3)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points.flat()), 3))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(points.map(() => random())), 1))
  geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(points.map(size)), 1))
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: holoTime, uScale: { value: 380 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: `
      attribute float aSeed;
      attribute float aSize;
      uniform float uTime;
      uniform float uScale;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        p.y += sin(uTime * (0.4 + aSeed * 0.5) + aSeed * 30.0) * 0.18;
        p.x += sin(uTime * 0.3 + aSeed * 17.0) * 0.12;
        vAlpha = 0.45 + 0.55 * sin(uTime * 2.1 + aSeed * 40.0);
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
  const p = new THREE.Points(geo, material)
  p.frustumCulled = false
  return p
}

/** La relique : une sphère de plaques sombres qui s'écartent sur un cœur de lumière, deux anneaux qui tournent autour. */
function relic() {
  const group = new THREE.Group()
  const shell = new THREE.MeshLambertMaterial({ color: '#2a2f38', emissive: '#103a44', emissiveIntensity: 0.6, side: THREE.DoubleSide })
  const plates = new THREE.Group()
  for (let k = 0; k < 6; k++) {
    const plate = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8, (k / 6) * Math.PI * 2 + 0.08, (Math.PI * 2) / 6 - 0.16, 0.35, Math.PI - 0.7), shell)
    plate.userData.k = k
    plates.add(plate)
  }
  const coreMat = new THREE.MeshBasicMaterial({ color: CORE })
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 2), coreMat)
  const haloMat = new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), haloMat)
  const rings = [0.42, 0.5].map((r, i) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 6, 48), new THREE.MeshBasicMaterial({ color: CYAN }))
    ring.rotation.x = Math.PI / 2 + (i ? 0.5 : -0.4)
    return ring
  })
  group.add(plates, core, halo, ...rings)
  return { group, plates, coreMat, halo, haloMat, rings }
}

/** Le ciel de la nuit gardienne : des étoiles fines, la voie lactée en biais, un horizon roux et poussiéreux. */
function skyTexture(): THREE.CanvasTexture {
  const W = 2048, H = 1024
  const random = rng(9)
  return drawnTexture(W, H, (c) => {
    const sky = c.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#03050a')
    sky.addColorStop(0.4, '#090c16')
    sky.addColorStop(0.49, '#2c2019')
    sky.addColorStop(0.52, '#1a1310')
    sky.addColorStop(1, '#0d0a08')
    c.fillStyle = sky
    c.fillRect(0, 0, W, H)
    // La voie lactée : une bande de poussière lumineuse, faite de mille petits points pâles.
    for (let i = 0; i < 9000; i++) {
      const t = random(), x = t * W, spread = (random() + random() + random() - 1.5) * 70
      const y = H * (0.1 + 0.28 * t) + spread
      c.fillStyle = `rgba(${215 + random() * 40},${190 + random() * 50},${165 + random() * 50},${0.03 + random() * 0.06})`
      c.beginPath()
      c.arc(x, y, 0.6 + random() * 2.2, 0, Math.PI * 2)
      c.fill()
    }
    for (let i = 0; i < 2600; i++) {
      const big = random() < 0.05
      c.fillStyle = `rgba(255,${235 + random() * 20},${220 + random() * 35},${0.35 + random() * 0.65})`
      c.fillRect(random() * W, random() * H * 0.48, big ? 2 : 1, big ? 2 : 1)
    }
  })
}

/**
 * Ce qui entoure le site : le sol de la planète, des rochers, le réseau qui luit (en bas, en haut),
 * la relique, les particules, les pylônes des deux camps. En vue subjective seulement : le ciel,
 * les montagnes, les faisceaux des obélisques et de la relique.
 */
function site(zone: ArenaZone): Venue {
  const random = rng(31)
  const group = new THREE.Group()
  const high = new THREE.Group()
  const cx = (zone.width - 1) / 2, cz = (zone.height - 1) / 2
  const reach = Math.max(zone.width, zone.height) / 2

  // Le sol de la planète.
  const floorMap = drawnTexture(1024, 1024, (c) => {
    c.fillStyle = '#2b2622'
    c.fillRect(0, 0, 1024, 1024)
    for (let i = 0; i < 1600; i++) {
      c.fillStyle = `hsla(${18 + random() * 20}, ${10 + random() * 14}%, ${8 + random() * 14}%, 0.5)`
      c.beginPath()
      c.arc(random() * 1024, random() * 1024, 2 + random() * 16, 0, Math.PI * 2)
      c.fill()
    }
    const shade = c.createRadialGradient(512, 512, 180, 512, 512, 512)
    shade.addColorStop(0, '#00000000')
    shade.addColorStop(1, '#000000e8')
    c.fillStyle = shade
    c.fillRect(0, 0, 1024, 1024)
  })
  const floor = part(new THREE.CircleGeometry(reach * 3.2, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: floorMap }), cx, -0.004, cz)
  floor.receiveShadow = true
  group.add(floor)

  // Des rochers bas autour du terrain (ils ne cachent rien vu de dessus).
  const rocks: THREE.BufferGeometry[] = []
  for (let i = 0; i < 46; i++) {
    const a = random() * Math.PI * 2, r = reach + 1.5 + random() * 7
    const x = cx + Math.cos(a) * r * (zone.width / zone.height > 1 ? 1.25 : 1), z = cz + Math.sin(a) * r * 0.85
    if (x > -1.5 && x < zone.width + 0.5 && z > -1.5 && z < zone.height + 0.5) continue
    const s = 0.15 + random() * 0.35
    rocks.push(new THREE.DodecahedronGeometry(s, 0).scale(1, 0.55 + random() * 0.4, 1).rotateY(random() * 3).translate(x, s * 0.3, z))
  }
  group.add(merged(rocks, new THREE.MeshLambertMaterial({ color: '#3a332e', flatShading: true })))

  // Le réseau qui luit, en bas et sur le promontoire.
  const { low, high: upLines } = circuit(zone)
  group.add(network(zone, low, 0.012), network(zone, upLines, zone.top + 0.014))

  // La relique, qui flotte au-dessus de son socle.
  const core = zone.containers.find((c) => c.kind === 'core')
  const r = relic()
  const relicY = (core ? zone.top : 0) + 0.95
  r.group.position.set(core ? core.x : cx, relicY, core ? core.z : cz)
  group.add(r.group)

  // Des particules : autour de la relique, des obélisques, au-dessus de la brume.
  const dust: number[][] = []
  for (let z = 0; z < zone.height; z++) {
    for (let x = 0; x < zone.width; x++) {
      const c = zone.plan[z][x], base = isHigh(zone, x, z) ? zone.top : 0
      const n = c === 'X' ? 26 : c === 'p' || c === 'P' ? 8 : c === 'g' ? 5 : 0
      for (let i = 0; i < n; i++) dust.push([x + (random() - 0.5) * 1.6, base + 0.2 + random() * (c === 'X' ? 1.6 : 1), z + (random() - 0.5) * 1.6])
    }
  }
  group.add(motes(dust, () => 0.025 + random() * 0.035, '#9ff8ff'))

  // Derrière chaque base, deux pylônes à la couleur du camp.
  const teamGlow = [0, 1].map(() => new THREE.MeshBasicMaterial({ color: '#ffffff' }))
  const ends = [0, 1].map((team) => {
    const end = new THREE.Group()
    const stone: THREE.BufferGeometry[] = [], light: THREE.BufferGeometry[] = []
    const x = team ? zone.width - 0.1 : -0.9
    for (const dz of [-2.6, 2.6]) {
      stone.push(new THREE.CylinderGeometry(0.14, 0.2, 0.9, 4).rotateY(Math.PI / 4).translate(x, 0.45, cz + dz))
      light.push(new THREE.BoxGeometry(0.04, 0.6, 0.04).translate(x + (team ? -0.16 : 0.16), 0.45, cz + dz))
    }
    end.add(merged(stone, mats().obelisk))
    const glowing = merged(light, teamGlow[team])
    glowing.castShadow = false
    end.add(glowing)
    return end
  })
  group.add(...ends)

  // En vue subjective : le ciel, les montagnes, les faisceaux.
  const sky = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, depthWrite: false }))
  sky.position.set(cx, 0, cz)
  high.add(sky)
  const ridge: THREE.BufferGeometry[] = []
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 + random() * 0.1, r = 34 + random() * 6
    const h = 3 + random() * 7, w = 6 + random() * 8
    ridge.push(new THREE.ConeGeometry(w, h, 5).rotateY(random() * 3).translate(cx + Math.cos(a) * r, h / 2 - 0.5, cz + Math.sin(a) * r))
  }
  high.add(merged(ridge, new THREE.MeshLambertMaterial({ color: '#17120f', flatShading: true })))
  const beams: THREE.BufferGeometry[] = []
  for (let z = 0; z < zone.height; z++) {
    for (let x = 0; x < zone.width; x++) {
      const c = zone.plan[z][x]
      if (c !== 'p' && c !== 'P' && c !== 'X') continue
      const base = (isHigh(zone, x, z) ? zone.top : 0) + (c === 'X' ? relicY - zone.top + 0.2 : OBELISK_H)
      const h = 30
      beams.push(new THREE.CylinderGeometry(c === 'X' ? 0.1 : 0.05, c === 'X' ? 0.16 : 0.07, h, 8, 1, true).translate(x, base + h / 2, z))
    }
  }
  const beamMat = new THREE.MeshBasicMaterial({ color: '#7ff6ff', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })
  high.add(new THREE.Mesh(mergeGeometries(beams)!, beamMat))
  high.visible = false
  group.add(high)
  group.traverse((o) => {
    o.castShadow = false
  })

  let hype = 0
  let wave = -1
  let near = 0
  let fps = false
  const deep = new THREE.Color(CYAN), bright = new THREE.Color(CORE)
  return {
    group,
    voice: 'guardian',
    paint(colors, side) {
      near = side
      teamGlow.forEach((m, team) => m.color.set(colors[team]))
      this.view(fps)
    },
    view(on) {
      fps = on
      high.visible = on
      // Vu de dessus, les pylônes du côté de la caméra cacheraient sa base.
      ends.forEach((e, team) => (e.visible = on || team !== near))
    },
    update(dt) {
      hype = Math.max(0, hype - dt * 0.45)
      glowUniforms.uHype.value = Math.min(1, hype)
      if (wave >= 0) {
        wave += dt * 8
        glowUniforms.uWave.value = wave
        if (wave > reach + 6) wave = -1
      } else glowUniforms.uWave.value = -10
      const t = holoTime.value
      // La relique flotte, tourne ; ses plaques s'écartent quand elle s'embrase.
      r.group.position.y = relicY + Math.sin(t * 1.1) * 0.05
      r.plates.rotation.y = t * 0.4
      const open = 1 + 0.08 * Math.sin(t * 1.7) + 0.35 * Math.min(1, hype)
      for (const p of r.plates.children) {
        const a = (p.userData.k / 6) * Math.PI * 2 + Math.PI / 6
        p.position.set(Math.cos(a) * (open - 1) * 0.3, 0, -Math.sin(a) * (open - 1) * 0.3)
      }
      r.rings[0].rotation.z = t * 0.7
      r.rings[1].rotation.z = -t * 0.5
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.2)
      r.coreMat.color.lerpColors(deep, bright, Math.min(1, 0.5 + 0.5 * pulse + hype))
      r.halo.scale.setScalar(1 + 0.15 * pulse + 0.5 * hype)
      r.haloMat.opacity = 0.22 + 0.12 * pulse + 0.3 * Math.min(1, hype)
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

/** La brume du site : des nappes pâles et bleutées, à demi transparentes, qu'on traverse. */
const MIST: BushLook = { hue: 0.58, sat: 0.22, light: 0.55, blooms: ['#9ff8ff'], glow: 1.2, haze: 0.42 }

/** Le site gardien : l'étage de ses obstacles en vue subjective, sa brume, ce qui l'entoure. */
export function guardianExtras(zone: ArenaZone, _kit: ZoneKit): ArenaExtras {
  const random = rng(404)
  const upper = new THREE.Group()
  for (let z = 0; z < zone.height; z++) {
    for (let x = 0; x < zone.width; x++) {
      const c = zone.plan[z][x], base = isHigh(zone, x, z) ? zone.top : 0
      if (c === '#') {
        const o = ruin(random)
        o.position.set(x, RUIN_H * 0.82, z)
        upper.add(o)
      }
      if (c === 'p' || c === 'P') {
        const o = obelisk(0.9, false)
        o.position.set(x, base + OBELISK_H - 0.02, z)
        upper.add(o)
      }
    }
  }
  return composeExtras(zone, MIST, upper, site(zone))
}
