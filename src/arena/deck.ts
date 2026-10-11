import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { box, cylinder, decal, drawnTexture, glow, holoTime, lit, part, rng } from '../furniture/kit'
import { tr } from '../i18n'
import type { LevelDef, LightDef, Prop, Rot } from '../levels'
import type { ZoneKit } from '../salvage/kit'
import { ARENA_LEVEL, ARENA_MAP, type ArenaZone } from '../../shared/arena.js'
import { buildVenue, type Venue } from './venue'

/*
 * L'arène en pont du jeu (cf. LevelDef, Deck) : un terrain au milieu d'un petit stade (cf.
 * venue.ts), bâti avec le kit de la baie de la zone thargoïde (murs, dalles, conteneurs, cf.
 * src/salvage/kit.ts), tous projecteurs allumés. Le terrain est peint comme un terrain de jeu : un
 * damier de sable, le rond central et son éclair, le liseré jaune au pied de chaque obstacle. Les
 * cloisons ont un couvercle, les conteneurs un marquage au pochoir ; les caisses d'armes et les
 * piliers sont faits main, et un peu de fatras traîne le long des murs. Pas de plafond : en vue
 * subjective, on voit le public par-dessus les murs du pourtour.
 *
 * Ce qui bouge, ou dépend de qui regarde, est à part (cf. arenaExtras) :
 * - les bases, peintes à la couleur de chaque camp tel que le joueur le voit (la sienne en bleu,
 *   celle d'en face en rouge), avec une pastille à chaque point d'apparition ;
 * - les buissons, qui ondulent, et qu'on froisse en les traversant (si l'on est vu) ;
 * - l'étage des obstacles : en vue subjective, conteneurs, cloisons, caisses et piliers sont doublés
 *   en hauteur. Vus de dessus, ils restent bas (on voit derrière) ; les yeux au sol, ce sont des
 *   murs : aucune vue ne voit plus que l'autre par-dessus un obstacle ;
 * - le stade (cf. venue.ts).
 */

/** Hauteur d'un conteneur du kit, d'une caisse, d'un pilier, d'une cloison (ses murs). */
const CONTAINER_H = 0.88
const CRATE_H = 1.04
const PILLAR_H = 1.06
const BULKHEAD_H = 1.06
/** Tuiles peintes de chaque base, depuis son bord. */
const BASE_DEPTH = 3

let crateMaterials: THREE.Material[] | null = null

/** Caisse d'armes blindée : une tuile, haute comme une cloison, cerclée de jaune. */
function weaponCrate(variant: number): THREE.Object3D {
  crateMaterials ??= ['#4a6fa8', '#a8623a', '#3f8f6b'].map((color) => new THREE.MeshLambertMaterial({
    map: drawnTexture(128, 128, (g) => {
      g.fillStyle = color
      g.fillRect(0, 0, 128, 128)
      g.strokeStyle = '#0005'
      g.lineWidth = 6
      g.strokeRect(9, 9, 110, 110)
      g.beginPath()
      g.moveTo(9, 9)
      g.lineTo(119, 119)
      g.moveTo(119, 9)
      g.lineTo(9, 119)
      g.stroke()
      g.fillStyle = '#ffd23f'
      g.fillRect(0, 54, 128, 20)
      g.fillStyle = '#17181b'
      for (let x = -20; x < 128; x += 26) {
        g.beginPath()
        g.moveTo(x, 74)
        g.lineTo(x + 13, 74)
        g.lineTo(x + 33, 54)
        g.lineTo(x + 20, 54)
        g.fill()
      }
    }),
  }))
  const g = new THREE.Group()
  g.add(box(0.9, CRATE_H, 0.9, crateMaterials[variant % crateMaterials.length], 0, CRATE_H / 2, 0, 0.02))
  g.add(box(0.94, 0.05, 0.94, lit('#23272c', 'metal'), 0, 0.025, 0))
  g.add(box(0.94, 0.05, 0.94, lit('#23272c', 'metal'), 0, CRATE_H + 0.005, 0))
  return g
}

/**
 * Pilier : un fût d'acier à pans coupés sur son socle, ceinturé d'un anneau lumineux, une balise
 * au sommet. Il remplit sa tuile, comme ce qu'il arrête.
 */
function pillar(height = PILLAR_H, top = true): THREE.Object3D {
  const g = new THREE.Group()
  const shaft = new THREE.CylinderGeometry(0.45, 0.45, height, 8)
  shaft.rotateY(Math.PI / 8)
  g.add(part(shaft, lit('#5a626e', 'metal'), 0, height / 2, 0))
  const ring = new THREE.CylinderGeometry(0.47, 0.47, 0.07, 8)
  ring.rotateY(Math.PI / 8)
  g.add(part(ring, glow('#ffd23f'), 0, height * 0.62, 0))
  if (top) {
    g.add(box(0.94, 0.08, 0.94, lit('#2a2d33', 'metal'), 0, 0.04, 0))
    g.add(cylinder(0.3, 0.36, 0.05, lit('#2a2d33', 'metal'), 0, height + 0.025, 0, 8))
    g.add(cylinder(0.08, 0.1, 0.07, glow('#ff8a1c'), 0, height + 0.085, 0, 8))
  }
  return g
}

/** Le dessus d'une cloison : une plaque d'acier boulonnée, bordée de bandes de danger. */
function bulkheadLid(w: number, d: number): THREE.Object3D {
  const T = 96
  const texture = drawnTexture(Math.round(w * T), Math.round(d * T), (c) => {
    const W = c.canvas.width, H = c.canvas.height
    c.fillStyle = '#e9a917'
    c.fillRect(0, 0, W, H)
    c.fillStyle = '#17181b'
    for (let x = -H; x < W + H; x += 24) {
      c.beginPath()
      c.moveTo(x, 0)
      c.lineTo(x + 12, 0)
      c.lineTo(x + 12 + H, H)
      c.lineTo(x + H, H)
      c.fill()
    }
    const m = 11
    c.fillStyle = '#353b45'
    c.fillRect(m, m, W - 2 * m, H - 2 * m)
    c.strokeStyle = '#4b525e'
    c.lineWidth = 3
    c.strokeRect(m + 6, m + 6, W - 2 * m - 12, H - 2 * m - 12)
    c.fillStyle = '#5d6572'
    for (const [x, y] of [[m + 14, m + 14], [W - m - 14, m + 14], [m + 14, H - m - 14], [W - m - 14, H - m - 14]]) {
      c.beginPath()
      c.arc(x, y, 4, 0, Math.PI * 2)
      c.fill()
    }
  })
  const g = new THREE.Group()
  g.add(box(w, 0.04, d, lit('#2c3139', 'metal'), 0, BULKHEAD_H - 0.01, 0))
  g.add(decal(texture, w, d, BULKHEAD_H + 0.011))
  return g
}

/** Le marquage au pochoir sur le toit d'un conteneur (long de 1,9 le long de z) : son numéro. */
function containerStencil(n: number): THREE.Mesh {
  const texture = drawnTexture(128, 272, (c) => {
    c.clearRect(0, 0, 128, 272)
    c.fillStyle = '#ffffffb0'
    c.save()
    c.translate(64, 136)
    c.rotate(-Math.PI / 2)
    c.font = 'bold 46px system-ui, sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(`CMDR-${String(n).padStart(2, '0')}`, 0, 2)
    c.restore()
    // Les coins : des équerres de danger.
    c.fillStyle = '#ffd23fc0'
    for (const [x, y, sx, sy] of [[6, 6, 1, 1], [122, 6, -1, 1], [6, 266, 1, -1], [122, 266, -1, -1]]) {
      c.beginPath()
      c.moveTo(x, y)
      c.lineTo(x + sx * 26, y)
      c.lineTo(x, y + sy * 26)
      c.fill()
    }
  })
  return decal(texture, 0.78, 1.66, CONTAINER_H + 0.004)
}

/** Les cloisons d'un seul tenant (tuiles '#' voisines), chacune par son rectangle de tuiles. */
function bulkheads(): { x0: number; z0: number; x1: number; z1: number }[] {
  const H = ARENA_MAP.length, W = ARENA_MAP[0].length
  const seen = new Set<number>()
  const out: { x0: number; z0: number; x1: number; z1: number }[] = []
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      if (ARENA_MAP[z][x] !== '#' || seen.has(z * W + x)) continue
      const r = { x0: x, z0: z, x1: x, z1: z }
      const queue = [[x, z]]
      seen.add(z * W + x)
      while (queue.length) {
        const [qx, qz] = queue.pop()!
        Object.assign(r, { x0: Math.min(r.x0, qx), z0: Math.min(r.z0, qz), x1: Math.max(r.x1, qx), z1: Math.max(r.z1, qz) })
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = qx + dx, nz = qz + dz
          if (nx < 0 || nz < 0 || nx >= W || nz >= H || ARENA_MAP[nz][nx] !== '#' || seen.has(nz * W + nx)) continue
          seen.add(nz * W + nx)
          queue.push([nx, nz])
        }
      }
      out.push(r)
    }
  }
  return out
}

/** La peinture du sol : le damier, le rond central et son éclair, la ligne médiane, le liseré des obstacles, la terre des buissons. */
function paint(zone: ArenaZone): THREE.Object3D {
  const T = 80, W = zone.width * T, H = zone.height * T
  const random = rng(311)
  const texture = drawnTexture(W, H, (c) => {
    c.clearRect(0, 0, W, H)
    const blocked = (x: number, z: number) => x < 0 || z < 0 || x >= zone.width || z >= zone.height || !!zone.blocked[z * zone.width + x]
    const bush = (x: number, z: number) => x >= 0 && z >= 0 && x < zone.width && z < zone.height && !!zone.bush[z * zone.width + x]
    for (let z = 0; z < zone.height; z++) {
      for (let x = 0; x < zone.width; x++) {
        if (blocked(x, z) || ARENA_MAP[z][x] === '#') continue
        // Le damier : deux sables, presque opaques ; chaque dalle a son biseau, et ses éraflures.
        c.fillStyle = (x + z) % 2 ? '#c2954af2' : '#dbb062f2'
        c.fillRect(x * T, z * T, T, T)
        c.fillStyle = '#ffffff30'
        c.fillRect(x * T, z * T, T, 3)
        c.fillRect(x * T, z * T, 3, T)
        c.fillStyle = '#00000024'
        c.fillRect(x * T, (z + 1) * T - 3, T, 3)
        c.fillRect((x + 1) * T - 3, z * T, 3, T)
        for (let k = 0; k < 3; k++) {
          c.fillStyle = `rgba(80,52,20,${0.05 + random() * 0.07})`
          c.beginPath()
          c.ellipse(x * T + 10 + random() * (T - 20), z * T + 10 + random() * (T - 20), 3 + random() * 9, 1 + random() * 3, random() * Math.PI, 0, Math.PI * 2)
          c.fill()
        }
      }
    }
    // La terre des buissons, d'un seul tenant d'une tuile à sa voisine, et ses brins d'herbe.
    c.fillStyle = '#33401f'
    for (let z = 0; z < zone.height; z++) {
      for (let x = 0; x < zone.width; x++) {
        if (!bush(x, z)) continue
        c.beginPath()
        c.roundRect(x * T + 4, z * T + 4, T - 8, T - 8, 18)
        c.fill()
        if (bush(x + 1, z)) c.fillRect(x * T + T / 2, z * T + 4, T, T - 8)
        if (bush(x, z + 1)) c.fillRect(x * T + 4, z * T + T / 2, T - 8, T)
      }
    }
    c.strokeStyle = '#6d9a3a'
    c.lineWidth = 2
    for (let z = 0; z < zone.height; z++) {
      for (let x = 0; x < zone.width; x++) {
        if (!bush(x, z)) continue
        for (let k = 0; k < 26; k++) {
          const px = x * T + 6 + random() * (T - 12), pz = z * T + 6 + random() * (T - 12)
          c.beginPath()
          c.moveTo(px, pz)
          c.lineTo(px + (random() - 0.5) * 6, pz - 4 - random() * 6)
          c.stroke()
        }
      }
    }
    for (let z = 0; z < zone.height; z++) {
      for (let x = 0; x < zone.width; x++) {
        if (blocked(x, z) || ARENA_MAP[z][x] === '#') continue
        // Liseré jaune au pied de chaque obstacle.
        c.fillStyle = '#ffd23fdd'
        if (blocked(x, z - 1)) c.fillRect(x * T, z * T, T, 6)
        if (blocked(x, z + 1)) c.fillRect(x * T, (z + 1) * T - 6, T, 6)
        if (blocked(x - 1, z)) c.fillRect(x * T, z * T, 6, T)
        if (blocked(x + 1, z)) c.fillRect((x + 1) * T - 6, z * T, 6, T)
      }
    }
    // La ligne de touche, tout autour du terrain.
    c.strokeStyle = '#ffffffb0'
    c.lineWidth = 5
    c.strokeRect(9, 9, W - 18, H - 18)
    // La ligne médiane et le rond central (deux cercles).
    c.strokeStyle = '#ffffffcc'
    c.lineWidth = 7
    c.setLineDash([26, 18])
    c.beginPath()
    c.moveTo(W / 2, 0)
    c.lineTo(W / 2, H)
    c.stroke()
    c.setLineDash([])
    c.beginPath()
    c.arc(W / 2, H / 2, T * 1.38, 0, Math.PI * 2)
    c.fillStyle = '#1d2433aa'
    c.fill()
    c.stroke()
    c.lineWidth = 3
    c.beginPath()
    c.arc(W / 2, H / 2, T * 1.18, 0, Math.PI * 2)
    c.stroke()
    // L'éclair du rond central : le même, qu'on le regarde d'un camp ou de l'autre (symétrique par
    // un demi-tour, comme le terrain).
    const bolt = [[-0.15, -0.66], [0.36, -0.66], [0.1, -0.1], [0.34, -0.1], [0.15, 0.66], [-0.36, 0.66], [-0.1, 0.1], [-0.34, 0.1]]
    c.beginPath()
    for (const [bx, bz] of bolt) c.lineTo(W / 2 + bx * T * 1.05, H / 2 + bz * T * 1.05)
    c.closePath()
    c.fillStyle = '#ffd23f'
    c.fill()
    c.strokeStyle = '#7a4a00'
    c.lineWidth = 4
    c.stroke()
  })
  const sheet = decal(texture, zone.width, zone.height, 0.008)
  sheet.position.set((zone.width - 1) / 2, sheet.position.y, (zone.height - 1) / 2)
  // Dans un groupe : c'est lui que le pont pose, la plaque reste à plat.
  return new THREE.Group().add(sheet)
}

export function arenaLevel(zone: ArenaZone, kit: ZoneKit): LevelDef {
  const props: Prop[] = []
  let number = 0
  for (const c of zone.containers) {
    const cx = c.x + (c.w - 1) / 2, cz = c.z + (c.d - 1) / 2
    if (c.kind === 'container') props.push({ model: 'prebuilt', object: new THREE.Group().add(kit.container(c.color), containerStencil(++number * 3 + 4)), x: cx, z: cz, rot: containerRot(c) })
    else if (c.kind === 'pillar') props.push({ model: 'prebuilt', object: pillar(), x: cx, z: cz })
    else props.push({ model: 'prebuilt', object: weaponCrate(c.x + c.z), x: cx, z: cz, rot: ((c.x + c.z) % 4) as Rot })
  }
  // Le couvercle des cloisons : leurs murs (ceux du kit) en font le tour, on ne voit plus dedans.
  // Dessous, un fond sombre : il paraît quand la cloison s'efface devant le joueur (vue de dessus).
  for (const r of bulkheads()) {
    const x = (r.x0 + r.x1) / 2, z = (r.z0 + r.z1) / 2, w = r.x1 - r.x0 + 0.78, d = r.z1 - r.z0 + 0.78
    props.push({ model: 'prebuilt', object: bulkheadLid(w, d), x, z, solid: false })
    props.push({ model: 'prebuilt', object: box(w, 0.01, d, lit('#171a20', 'metal'), 0, 0.005, 0), x, z, solid: false })
  }
  // Déjà placés : leur position de pièce est l'origine.
  props.push({ model: 'prebuilt', object: paint(zone), x: 0, z: 0, solid: false })

  // Du fatras le long des murs et des obstacles (fûts, câbles, ferraille) : jamais dans une base,
  // un buisson, ni au milieu d'un passage. Il ne gêne ni les pas ni les balles.
  const random = rng(4242)
  const kinds = ['barrel', 'cables', 'debris', 'barrel'] as const
  const solidAt = (x: number, z: number) => x < 0 || z < 0 || x >= zone.width || z >= zone.height || !!zone.blocked[z * zone.width + x]
  let n = 0
  for (let z = 0; z < zone.height; z++) {
    for (let x = BASE_DEPTH; x < zone.width - BASE_DEPTH; x++) {
      const i = z * zone.width + x
      if (zone.blocked[i] || zone.bush[i]) continue
      const side = [[0, -1], [1, 0], [0, 1], [-1, 0]].filter(([dx, dz]) => solidAt(x + dx, z + dz))
      if (!side.length || random() > 0.2) continue
      const [dx, dz] = side[Math.floor(random() * side.length)]
      props.push({ model: 'prebuilt', object: kit.decor(kinds[n % kinds.length], n), x: x + dx * 0.3 + (dz ? (random() - 0.5) * 0.4 : 0), z: z + dz * 0.3 + (dx ? (random() - 0.5) * 0.4 : 0), rot: (n % 4) as Rot, solid: false })
      n++
    }
  }

  // Les projecteurs : une trame serrée, blanche, qui ne laisse aucun coin dans l'ombre.
  const lights: LightDef[] = []
  for (let z = 1; z < zone.height; z += 4) {
    for (let x = 2; x < zone.width; x += 4) lights.push([x, z, '#fff3dd', 2.8, undefined, 9])
  }

  return {
    id: ARENA_LEVEL,
    name: 'CMDR Arena',
    theme: 'raw',
    // Plein jour : rien n'est caché, on se voit de loin.
    ambience: { sky: '#e6eefa', ground: '#6b7482', hemi: 2.6, sun: '#fff1dd', sunIntensity: 1.8 },
    footsteps: 'hard',
    layout: zone.layout,
    rooms: { a: tr('Arène', 'Arena') },
    windows: { a: 0 },
    props,
    lights,
    zone: { kit, map: { walls: [], doors: [] }, plain: true },
    // Ni plafond ni haut des murs : le stade est autour (cf. venue.ts).
    open: true,
  }
}

/** Sens d'un conteneur du kit (long de 1,9 le long de z) : couché le long de x, ou debout. */
const containerRot = (c: { w: number; flip: boolean }): Rot => (c.w > 1 ? (c.flip ? 1 : 3) : c.flip ? 2 : 0)

/**
 * Les buissons, d'un seul bloc : de gros feuillages ronds, serrés, sombres dessous et clairs
 * dessus, quelques fleurs. Ils ondulent sans cesse ; un buisson qu'on traverse se froisse
 * (`rustle` : son ardeur, de 0 à 1, une par tuile de buisson, dans l'ordre de `tiles`).
 */
function bushes(zone: ArenaZone) {
  const random = rng(1907)
  const parts: THREE.BufferGeometry[] = []
  const color = new THREE.Color()
  const tiles: number[] = []
  const blob = (x: number, z: number, r: number, y: number, h: number, s: number, l: number, tile: number, detail = 1) => {
    const g = new THREE.IcosahedronGeometry(r, detail)
    g.scale(1, 0.85 + random() * 0.35, 1)
    g.translate(x, y, z)
    color.setHSL(h, s, l)
    const n = g.attributes.position.count
    const tint = new Float32Array(n * 3)
    for (let k = 0; k < tint.length; k += 3) color.toArray(tint, k)
    g.setAttribute('color', new THREE.BufferAttribute(tint, 3))
    g.setAttribute('aTile', new THREE.BufferAttribute(new Float32Array(n).fill(tile), 1))
    g.deleteAttribute('uv')
    parts.push(g)
  }
  for (let z = 0; z < zone.height; z++) {
    for (let x = 0; x < zone.width; x++) {
      if (!zone.bush[z * zone.width + x]) continue
      const t = tiles.length
      tiles.push(z * zone.width + x)
      const at = () => [x + (random() - 0.5) * 0.66, z + (random() - 0.5) * 0.66]
      for (let i = 0; i < 4; i++) {
        const [px, pz] = at()
        blob(px, pz, 0.22 + random() * 0.07, 0.15 + random() * 0.08, 0.3 + random() * 0.05, 0.62, 0.14 + random() * 0.05, t)
      }
      for (let i = 0; i < 4; i++) {
        const [px, pz] = at()
        blob(px, pz, 0.18 + random() * 0.07, 0.3 + random() * 0.1, 0.29 + random() * 0.06, 0.7, 0.23 + random() * 0.07, t)
      }
      for (let i = 0; i < 2; i++) {
        const [px, pz] = at()
        blob(px * 0.9 + x * 0.1, pz * 0.9 + z * 0.1, 0.12 + random() * 0.05, 0.44 + random() * 0.06, 0.26 + random() * 0.04, 0.72, 0.36, t)
      }
      // Des fleurs, posées sur le feuillage.
      for (let i = 0; i < 3; i++) {
        const [px, pz] = at()
        const hue = [0.13, 0.95, 0.0][Math.floor(random() * 3)]
        blob(px, pz, 0.035, 0.42 + random() * 0.1, hue, hue === 0 ? 0 : 0.85, hue === 0 ? 0.95 : 0.62, t, 0)
      }
    }
  }
  const rustle = new Float32Array(Math.max(1, tiles.length))
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = holoTime
    shader.uniforms.uRustle = { value: rustle }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aTile;
        uniform float uTime;
        uniform float uRustle[${rustle.length}];`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float lift = clamp(position.y / 0.55, 0.0, 1.0);
        float shake = uRustle[int(aTile + 0.5)];
        float sway = sin(uTime * 1.3 + position.x * 0.9 + position.z * 0.7) * 0.016;
        float jolt = sin(uTime * 27.0 + position.x * 13.0 + position.z * 7.0) * 0.045 * shake;
        transformed.x += (sway + jolt) * lift;
        transformed.z += (sway * 0.6 + jolt * cos(uTime * 21.0)) * lift;`)
  }
  material.customProgramCacheKey = () => `arena-bushes-${rustle.length}`
  const mesh = new THREE.Mesh(mergeGeometries(parts), material)
  for (const p of parts) p.dispose()
  mesh.receiveShadow = true
  return { mesh, tiles, rustle }
}

/** Cadence de l'anneau qui s'échappe des pastilles des bases (par seconde). */
const PULSE = 0.6

/**
 * L'anneau des pastilles : chacun s'élargit autour du centre de la sienne (`aCenter`), en mesure
 * avec l'horloge des hologrammes ; son éclat (opacity) s'éteint en même temps (cf. update).
 */
function pulseMaterial(): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6 })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = holoTime
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aCenter;
        uniform float uTime;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.xz = aCenter + (transformed.xz - aCenter) * (1.0 + 0.5 * fract(uTime * ${PULSE.toFixed(2)}));`)
  }
  m.customProgramCacheKey = () => 'arena-pulse'
  return m
}

/** Ce qui change avec le joueur ou le temps : les bases, les buissons, l'étage des obstacles, le stade. */
export interface ArenaExtras {
  group: THREE.Group
  /**
   * La base de chaque équipe (0, 1) : à peindre de la couleur du camp, tel que le joueur le voit ;
   * `near` : le camp dont la base est du côté de la caméra (cf. Venue.paint).
   */
  paintBases(colors: [string, string], near: number): void
  /** Vue subjective (les obstacles doublés en hauteur, la baie au-dessus du stade), ou de dessus. */
  view(fps: boolean): void
  update(dt: number): void
  /** Un combattant qu'on voit, là où il est : s'il avance dans un buisson, le buisson se froisse. */
  stir(id: number, x: number, z: number): void
  venue: Venue
}

export function arenaExtras(zone: ArenaZone, kit: ZoneKit): ArenaExtras {
  const group = new THREE.Group()
  // Les bases : une nappe de couleur sur leurs trois colonnes, des chevrons tournés vers le camp
  // d'en face, un bandeau lumineux à leur limite, une pastille à chaque point d'apparition.
  const chevrons = drawnTexture(BASE_DEPTH * 64, zone.height * 64, (c) => {
    const W = c.canvas.width, H = c.canvas.height
    c.fillStyle = '#ffffff55'
    c.fillRect(0, 0, W, H)
    c.strokeStyle = '#ffffffaa'
    c.lineWidth = 9
    c.lineJoin = 'miter'
    for (let z = 0; z < zone.height; z += 2) {
      for (const x of [0.75, 1.75]) {
        const px = x * 64, pz = (z + 0.5) * 64
        c.beginPath()
        c.moveTo(px - 12, pz - 22)
        c.lineTo(px + 12, pz)
        c.lineTo(px - 12, pz + 22)
        c.stroke()
      }
    }
  })
  const pulses: THREE.MeshBasicMaterial[] = []
  const plates: THREE.BufferGeometry[] = []
  const bases = [0, 1].map((team) => {
    const wash = new THREE.MeshBasicMaterial({ map: chevrons, transparent: true, opacity: 0.62, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })
    const line = new THREE.MeshBasicMaterial()
    const ring = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6 })
    const x = team ? zone.width - 1 - (BASE_DEPTH - 1) / 2 : (BASE_DEPTH - 1) / 2
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(BASE_DEPTH, zone.height), wash)
    plane.rotation.set(-Math.PI / 2, 0, team ? Math.PI : 0)
    plane.position.set(x, 0.02, (zone.height - 1) / 2)
    plane.renderOrder = 1
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, zone.height), line)
    edge.position.set(team ? zone.width - 0.5 - BASE_DEPTH : BASE_DEPTH - 0.5, 0.03, (zone.height - 1) / 2)
    group.add(plane, edge)
    // Les pastilles : un socle d'acier, l'hexagone à la couleur du camp, et un anneau qui s'en échappe.
    const hexes: THREE.BufferGeometry[] = [], rims: THREE.BufferGeometry[] = []
    for (const s of zone.spawns[team]) {
      plates.push(new THREE.CylinderGeometry(0.4, 0.43, 0.03, 6).translate(s.x, 0.015, s.z))
      hexes.push(new THREE.RingGeometry(0.29, 0.37, 6).rotateX(-Math.PI / 2).translate(s.x, 0.033, s.z))
      const rim = new THREE.RingGeometry(0.37, 0.41, 6).rotateX(-Math.PI / 2)
      rim.setAttribute('aCenter', new THREE.BufferAttribute(new Float32Array(rim.attributes.position.count * 2).map((_, k) => (k % 2 ? s.z : s.x)), 2))
      rims.push(rim.translate(s.x, 0.034, s.z))
    }
    const hex = part(mergeGeometries(hexes)!, ring)
    const pulse = part(mergeGeometries(rims)!, pulseMaterial())
    hex.renderOrder = pulse.renderOrder = 2
    pulses.push(pulse.material as THREE.MeshBasicMaterial)
    group.add(hex, pulse)
    return { wash, line, ring, pulse: pulses[team], team }
  })

  group.add(part(mergeGeometries(plates)!, lit('#1d2129', 'metal')))

  const bush = bushes(zone)
  group.add(bush.mesh)

  // L'étage : un second conteneur sur chaque conteneur, une seconde caisse, le haut des piliers et des cloisons.
  const upper = new THREE.Group()
  for (const c of zone.containers) {
    const cx = c.x + (c.w - 1) / 2, cz = c.z + (c.d - 1) / 2
    let o: THREE.Object3D
    if (c.kind === 'container') {
      o = kit.container((c.color + 1) % 3)
      o.position.set(cx, CONTAINER_H, cz)
      o.rotation.y = (containerRot(c) * Math.PI) / 2
    } else if (c.kind === 'pillar') {
      o = pillar(PILLAR_H, false)
      o.position.set(cx, PILLAR_H, cz)
    } else {
      o = weaponCrate(c.x + c.z + 1)
      o.position.set(cx, CRATE_H, cz)
    }
    upper.add(o)
  }
  for (const r of bulkheads()) {
    const w = r.x1 - r.x0 + 1.2, d = r.z1 - r.z0 + 1.2, h = 0.95
    const o = new THREE.Group()
    o.add(box(w, h, d, lit('#3a4049', 'metal'), 0, h / 2, 0))
    o.add(box(w + 0.02, 0.08, d + 0.02, glow('#ffd23f'), 0, h * 0.55, 0))
    o.position.set((r.x0 + r.x1) / 2, BULKHEAD_H + 0.03, (r.z0 + r.z1) / 2)
    upper.add(o)
  }
  upper.visible = false
  group.add(upper)

  const venue = buildVenue(zone)
  group.add(venue.group)

  /** Où l'on a vu chaque combattant, la dernière fois : on ne froisse un buisson qu'en y bougeant. */
  const last = new Map<number, { x: number; z: number }>()
  return {
    group,
    venue,
    paintBases(colors, near) {
      for (const b of bases) {
        b.wash.color.set(colors[b.team])
        b.line.color.set(colors[b.team])
        b.ring.color.set(colors[b.team])
        b.pulse.color.set(colors[b.team])
      }
      venue.paint(colors, near)
    },
    view(fps) {
      upper.visible = fps
      venue.view(fps)
    },
    update(dt) {
      for (let i = 0; i < bush.rustle.length; i++) bush.rustle[i] = Math.max(0, bush.rustle[i] - dt * 2.2)
      // Les pastilles des bases : un anneau qui s'élargit et s'éteint (cf. pulseMaterial).
      for (const p of pulses) p.opacity = 0.8 * (1 - ((holoTime.value * PULSE) % 1))
      venue.update(dt)
    },
    stir(id, x, z) {
      const before = last.get(id)
      last.set(id, { x, z })
      if (!before || Math.hypot(x - before.x, z - before.z) < 0.004) return
      const tile = Math.round(z) * zone.width + Math.round(x)
      const i = bush.tiles.indexOf(tile)
      if (i >= 0) bush.rustle[i] = 1
    },
  }
}
