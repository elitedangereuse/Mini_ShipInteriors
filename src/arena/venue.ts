import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { beamMaterial, box, compact, cylinder, drawnTexture, ED_ORANGE, glass, glow, holoTime, instanced, lit, part, rng, setInstance } from '../furniture/kit'
import { logoTexture } from '../furniture/arena'
import { tr } from '../i18n'
import type { ArenaZone } from '../../shared/arena.js'

/*
 * Le stade de CMDR Arena : ce qui entoure le terrain (cf. deck.ts), au milieu d'une grande baie du
 * vaisseau. Le long des deux grands côtés, des tribunes pleines d'un public qui se lève quand
 * quelqu'un tombe et fait la ola au coup d'envoi ; derrière chaque base, le mur de son camp et un
 * écran géant, entre deux tours d'éclairage ; sur la face intérieure du pourtour, des bandeaux
 * lumineux qui défilent ; tout autour, le sol de la baie.
 *
 * En vue subjective seulement (vus de dessus, ils cacheraient le terrain) : le toit de la baie, ses
 * poutres et ses lampes, ses murs et leurs bannières, les faisceaux des projecteurs, et l'écran
 * suspendu au-dessus du rond central, qui donne le score et le temps.
 *
 * Ce qui dépend de qui regarde : la couleur des deux camps (la sienne en bleu, celle d'en face en
 * rouge, comme les bases), et le bout du terrain qui est du côté de la caméra : vu de dessus, son
 * décor cacherait sa propre base, il ne paraît qu'en vue subjective.
 */

/** Le haut des murs du kit (cf. ZONE_WALL_TOP, deck.ts) et leur demi-épaisseur. */
const WALL_TOP = 1.06
const HALF = 0.15
/** Les gradins : rangées, profondeur et hauteur d'une marche, hauteur de la première, passage au pied. */
const ROWS = 6
const ROW_D = 0.56
const ROW_H = 0.3
const FIRST = 0.62
const AISLE = 0.14
/** Écart entre deux sièges, et les escaliers qui coupent les gradins (part de leur longueur). */
const PITCH = 0.42
const STAIRS = [0.25, 0.5, 0.75]
/** Le haut du mur du fond des tribunes. */
const BACK_TOP = FIRST + ROWS * ROW_H + 0.75
/** Le mur du camp, derrière chaque base, et son écran. */
const TEAM_WALL = 1.95
/** Le toit de la baie, et ce qui reste de sol autour du terrain (tuiles). */
const ROOF = 5.6
const MARGIN = { x: 6.5, z: 5.5 }
/** Hauteur des épaules d'un spectateur assis : ses bras s'y replient quand il est calme. */
const SHOULDER = 0.34

/** Une place des tribunes : où (le dessus de sa marche), son cap, sa rangée (0 : au bord du terrain). */
interface Seat { x: number; y: number; z: number; yaw: number; row: number }

/** Ce qui entoure le terrain. */
export interface Venue {
  group: THREE.Group
  /** Ce qu'on entend quand il s'enflamme : la clameur d'un public, ou le chant d'une ruche. */
  voice: 'crowd' | 'hive'
  /** Couleur de chaque camp (0, 1), et le camp dont la base est du côté de la caméra. */
  paint(colors: [string, string], near: number): void
  /** Vue subjective, ou de dessus. */
  view(fps: boolean): void
  update(dt: number): void
  /** Le public se lève (0 à 1). */
  cheer(amount: number): void
  /** La ola, d'un bout à l'autre des tribunes. */
  ola(): void
  /** Ce qu'affiche l'écran suspendu : le score de chacun, sa couleur, le temps qui reste, la manche. */
  board(mine: number, theirs: number, colors: [string, string], left: number, round: number): void
}

// ------------------------------------------------------------------ le public

const crowd = { uTime: holoTime, uHype: { value: 0 }, uOla: { value: 0 }, uOlaX: { value: -100 } }

/**
 * Matériau des spectateurs : chacun se balance un peu, à son rythme (`aPhase`) ; quand le public
 * s'enflamme (`uHype`), les plus ardents (`aZeal`) sautent sur place, et la ola passe là où est
 * `uOlaX`. Les bras (`aPart` 2), repliés aux épaules au calme, se lèvent pour applaudir (et
 * quelques-uns s'agitent toujours) ; la tête (`aPart` 1) a sa couleur (`aSkin`), le reste celle du
 * maillot (la couleur de l'instance).
 */
function crowdMaterial(): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial()
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, crowd)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aPart;
        attribute float aPhase;
        attribute float aZeal;
        attribute vec3 aSkin;
        uniform float uTime;
        uniform float uHype;
        uniform float uOla;
        uniform float uOlaX;`)
      .replace('#include <color_vertex>', `#include <color_vertex>
        if (aPart > 0.5 && aPart < 1.5) vColor.xyz = aSkin;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float ola = uOla * exp(-pow((instanceMatrix[3].x - uOlaX) * 0.75, 2.0));
        float cheer = clamp(uHype * aZeal, 0.0, 1.0);
        if (aPart > 1.5) {
          float wave = step(0.9, fract(aPhase * 7.31)) * smoothstep(0.2, 1.0, sin(uTime * 2.2 + aPhase * 17.0));
          float up = clamp(max(max(cheer * 1.6, ola * 1.5), wave), 0.0, 1.0);
          transformed.y = ${SHOULDER.toFixed(2)} + (transformed.y - ${SHOULDER.toFixed(2)}) * up;
        }
        transformed.y += sin(uTime * 1.7 + aPhase * 6.2832) * 0.007
          + cheer * max(0.0, sin(uTime * 9.0 + aPhase * 31.0)) * 0.1 + ola * 0.15;`)
  }
  m.customProgramCacheKey = () => 'arena-crowd'
  return m
}

/** Un spectateur assis, de face (+z) : le corps (jambes comprises), la tête, les bras levés (`aPart` : 0, 1, 2) ; son siège. */
function fanGeometries() {
  const merge = (parts: [THREE.BufferGeometry, number][]) => {
    const out = new THREE.BufferGeometry()
    const all = parts.map(([p]) => p.toNonIndexed())
    const count = all.reduce((n, p) => n + p.attributes.position.count, 0)
    for (const name of ['position', 'normal'] as const) {
      const data = new Float32Array(count * 3)
      let at = 0
      for (const p of all) {
        data.set(p.attributes[name].array as Float32Array, at)
        at += p.attributes[name].array.length
      }
      out.setAttribute(name, new THREE.BufferAttribute(data, 3))
    }
    const kind = new Float32Array(count)
    let at = 0
    all.forEach((p, i) => {
      kind.fill(parts[i][1], at, at + p.attributes.position.count)
      at += p.attributes.position.count
    })
    out.setAttribute('aPart', new THREE.BufferAttribute(kind, 1))
    return out
  }
  const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z)
  const fan = merge([
    [at(new THREE.BoxGeometry(0.21, 0.24, 0.14), 0, 0.25, -0.04), 0],
    [at(new THREE.BoxGeometry(0.19, 0.07, 0.18), 0, 0.165, 0.07), 0],
    [at(new THREE.BoxGeometry(0.17, 0.14, 0.06), 0, 0.07, 0.15), 0],
    [at(new THREE.BoxGeometry(0.17, 0.16, 0.16), 0, 0.46, -0.04), 1],
    ...[-1, 1].map((k) => [at(new THREE.BoxGeometry(0.055, 0.21, 0.06), k * 0.135, SHOULDER + 0.105, -0.04), 2] as [THREE.BufferGeometry, number]),
  ])
  const seat = merge([
    [at(new THREE.BoxGeometry(0.3, 0.05, 0.26), 0, 0.1, 0), 0],
    [at(new THREE.BoxGeometry(0.3, 0.26, 0.04), 0, 0.24, -0.13), 0],
    [at(new THREE.BoxGeometry(0.08, 0.08, 0.08), 0, 0.04, 0), 0],
  ])
  return { fan, seat }
}

const SHIRTS = [ED_ORANGE, ED_ORANGE, '#e9e9ec', '#2b2f38', '#3fc8ff', '#c43c3c', '#ffd23f', '#5a6b7d', '#7b4bb0', '#2e8b57', '#f2f2f2', '#d9741f', '#1f6fb2']
const SKINS = ['#f1c7a3', '#e0ac84', '#c68a5f', '#8d5a3b', '#5c3a24', '#f5d6bd', '#f1c7a3', '#e0ac84']
/** Casques de pilote, ici et là. */
const HELMETS = ['#e9e9ee', ED_ORANGE, '#2b2f38']

/** Les sièges, et sur la plupart un spectateur. */
function audience(seats: Seat[]): THREE.Group {
  const random = rng(77)
  const g = new THREE.Group()
  const geo = fanGeometries()
  const seatColors = seats.map((s) => (s.row === ROWS - 1 ? '#a55a1c' : s.row % 2 ? '#353d4b' : '#3d4657'))
  const chairs = instanced(geo.seat, seatColors, lit('#ffffff'))
  seats.forEach((s, i) => setInstance(chairs, i, s.x, s.y, s.z, 1, s.yaw))
  g.add(chairs)
  // Les premiers rangs sont pleins, le haut un peu moins.
  const fans = seats.filter((s) => random() < (s.row < 2 ? 0.92 : 0.76))
  const phase = new Float32Array(fans.length), zeal = new Float32Array(fans.length), skin = new Float32Array(fans.length * 3)
  const shirts: string[] = []
  const tone = new THREE.Color()
  fans.forEach((_, i) => {
    phase[i] = random()
    zeal[i] = 0.45 + random() * 0.55
    shirts.push(SHIRTS[Math.floor(random() * SHIRTS.length)])
    tone.set(random() < 0.1 ? HELMETS[Math.floor(random() * HELMETS.length)] : SKINS[Math.floor(random() * SKINS.length)]).toArray(skin, i * 3)
  })
  geo.fan.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1))
  geo.fan.setAttribute('aZeal', new THREE.InstancedBufferAttribute(zeal, 1))
  geo.fan.setAttribute('aSkin', new THREE.InstancedBufferAttribute(skin, 3))
  const im = instanced(geo.fan, shirts, crowdMaterial())
  fans.forEach((s, i) => setInstance(im, i, s.x, s.y + 0.005, s.z, 1, s.yaw))
  g.add(im)
  return g
}

// ------------------------------------------------------------------ bandeaux lumineux

const LED_H = 96

/**
 * Le texte des bandeaux : les noms de la maison, séparés d'étoiles, sur fond noir, en points
 * lumineux. La texture se répète le long du bandeau, et défile (cf. update).
 */
function ledTexture(): THREE.CanvasTexture {
  const items: [string, string][] = [
    ['CMDR ARENA', ED_ORANGE],
    ['ÉLITE DANGEREUSE', '#f4f4f6'],
    ['o7', '#ffd23f'],
    [tr('VOLEZ PRUDEMMENT, CMDR', 'FLY SAFE, CMDR'), '#3fc8ff'],
    ['MINI-CQC', ED_ORANGE],
    ['GALACTIC CLASH', '#f4f4f6'],
    ['LJPC', '#7dffa8'],
    ['SCAVENGERS', '#ffd23f'],
    [tr('LE COMPTOIR DES CARTES DANGEREUSES', 'CARTES DANGEREUSES COUNTER'), '#f4f4f6'],
  ]
  const font = 'bold 60px system-ui, sans-serif'
  const probe = document.createElement('canvas').getContext('2d')!
  probe.font = font
  const gap = 90
  const widths = items.map(([text]) => Math.ceil(probe.measureText(text).width) + gap)
  const W = widths.reduce((a, b) => a + b, 0)
  const texture = drawnTexture(W, LED_H, (c) => {
    c.fillStyle = '#050607'
    c.fillRect(0, 0, W, LED_H)
    c.font = font
    c.textBaseline = 'middle'
    let x = 0
    items.forEach(([text, color], i) => {
      c.fillStyle = color
      c.fillText(text, x + gap / 2, LED_H / 2 + 3)
      // L'étoile entre deux messages.
      c.fillStyle = '#ffd23f'
      c.beginPath()
      for (let k = 0; k < 10; k++) {
        const r = k % 2 ? 7 : 17, a = -Math.PI / 2 + (k * Math.PI) / 5
        c.lineTo(x + widths[i] + Math.cos(a) * r, LED_H / 2 + Math.sin(a) * r)
      }
      c.fill()
      x += widths[i]
    })
    // La trame des diodes.
    c.fillStyle = '#000000aa'
    for (let y = 0; y < LED_H; y += 6) c.fillRect(0, y, W, 2)
    for (let i = 0; i < W; i += 6) c.fillRect(i, 0, 2, LED_H)
  })
  texture.wrapS = THREE.RepeatWrapping
  return texture
}

/** Un bandeau de `len` × `h`, face à +z, qui montre la texture répétée à sa hauteur. */
function ledBoard(material: THREE.MeshBasicMaterial, len: number, h: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(len, h)
  const per = (h * (material.map!.image as HTMLCanvasElement).width) / LED_H
  const uv = geo.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * len) / per)
  return part(geo, material)
}

/** Des pièces d'un même matériau, posées chacune à sa place, fondues en un seul maillage (un appel de dessin). */
function fuse(parts: THREE.Mesh[]): THREE.Mesh {
  const geos = parts.map((p) => {
    p.updateMatrix()
    return p.geometry.clone().applyMatrix4(p.matrix)
  })
  const out = new THREE.Mesh(mergeGeometries(geos)!, parts[0].material)
  for (const g of geos) g.dispose()
  for (const p of parts) p.geometry.dispose()
  return out
}

// ------------------------------------------------------------------ écrans

/** L'écran suspendu : le score de chacun (sa couleur), le temps, la manche. */
function scoreTexture() {
  const W = 512, H = 256
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const c = canvas.getContext('2d')!
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  let shown = ''
  const draw = (mine: number, theirs: number, colors: [string, string], left: number, round: number) => {
    const clock = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`
    const key = `${mine}|${theirs}|${colors}|${clock}|${round}`
    if (key === shown) return
    shown = key
    c.fillStyle = '#05070b'
    c.fillRect(0, 0, W, H)
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillStyle = ED_ORANGE
    c.font = 'bold 30px system-ui, sans-serif'
    c.fillText('CMDR ARENA', W / 2, 30)
    c.font = 'bold 136px system-ui, sans-serif'
    c.fillStyle = colors[0]
    c.fillText(String(mine), W * 0.2, 146)
    c.fillStyle = colors[1]
    c.fillText(String(theirs), W * 0.8, 146)
    c.fillStyle = '#f4f4f6'
    c.font = 'bold 54px system-ui, sans-serif'
    c.fillText(clock, W / 2, 130)
    c.font = 'bold 24px system-ui, sans-serif'
    c.fillStyle = '#9aa3b2'
    c.fillText(tr(`MANCHE ${round}`, `ROUND ${round}`), W / 2, 182)
    c.fillStyle = '#000000aa'
    for (let y = 0; y < H; y += 4) c.fillRect(0, y, W, 1)
    texture.needsUpdate = true
  }
  draw(0, 0, ['#35a7ff', '#ff4d4d'], 0, 1)
  return { texture, draw }
}

/** L'écran d'un bout du terrain : le logo, sur fond sombre, des chevrons de part et d'autre. */
function logoScreen(w: number, h: number): THREE.CanvasTexture {
  const TW = 1024, TH = Math.round((TW * h) / w)
  return logoTexture(TW, TH, (c, logo) => {
    const sky = c.createLinearGradient(0, 0, 0, TH)
    sky.addColorStop(0, '#0d1220')
    sky.addColorStop(1, '#05070b')
    c.fillStyle = sky
    c.fillRect(0, 0, TW, TH)
    c.strokeStyle = '#ffffff22'
    c.lineWidth = 10
    for (let i = 0; i < 4; i++) {
      for (const dir of [-1, 1]) {
        const x = TW / 2 + dir * (TW * 0.3 + i * 52)
        c.beginPath()
        c.moveTo(x, TH * 0.25)
        c.lineTo(x + dir * 40, TH / 2)
        c.lineTo(x, TH * 0.75)
        c.stroke()
      }
    }
    if (logo) c.drawImage(logo, TW / 2 - TH * 0.48, TH * 0.02, TH * 0.96, TH * 0.96)
    c.fillStyle = '#00000066'
    for (let y = 0; y < TH; y += 5) c.fillRect(0, y, TW, 1)
  })
}

/** Bannière suspendue : le logo, sur une longue toile sombre bordée d'orange. */
function bannerTexture(): THREE.CanvasTexture {
  const TW = 256, TH = 640
  return logoTexture(TW, TH, (c, logo) => {
    c.fillStyle = '#10141c'
    c.fillRect(0, 0, TW, TH)
    c.fillStyle = ED_ORANGE
    c.fillRect(0, 0, TW, 14)
    c.fillRect(0, TH - 70, TW, 8)
    c.beginPath()
    c.moveTo(0, TH - 50)
    c.lineTo(TW / 2, TH)
    c.lineTo(TW, TH - 50)
    c.fill()
    if (logo) c.drawImage(logo, 8, 60, TW - 16, TW - 16)
    c.fillStyle = '#f4f4f6'
    c.font = 'bold 34px system-ui, sans-serif'
    c.textAlign = 'center'
    c.fillText('CMDR', TW / 2, 380)
    c.fillText('ARENA', TW / 2, 424)
  })
}

// ------------------------------------------------------------------ le sol de la baie

/** Le sol autour du terrain : des dalles sombres, un liseré jaune et noir au pied du pourtour. */
function apronTexture(zone: ArenaZone, T: number): THREE.CanvasTexture {
  const w = zone.width + 2 * MARGIN.x, d = zone.height + 2 * MARGIN.z
  const W = w * T, H = d * T
  return drawnTexture(W, H, (c) => {
    c.fillStyle = '#1b1f27'
    c.fillRect(0, 0, W, H)
    const random = rng(5)
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        c.fillStyle = `rgba(255,255,255,${0.015 + random() * 0.03})`
        c.fillRect(x * T + 1, z * T + 1, T - 2, T - 2)
      }
    }
    c.strokeStyle = '#0c0e12'
    c.lineWidth = 2
    for (let x = 0; x <= w; x++) {
      c.beginPath()
      c.moveTo(x * T, 0)
      c.lineTo(x * T, H)
      c.stroke()
    }
    for (let z = 0; z <= d; z++) {
      c.beginPath()
      c.moveTo(0, z * T)
      c.lineTo(W, z * T)
      c.stroke()
    }
    // Le liseré, au pied des murs du pourtour.
    const x0 = (MARGIN.x - HALF) * T, z0 = (MARGIN.z - HALF) * T
    const x1 = (MARGIN.x + zone.width + HALF) * T, z1 = (MARGIN.z + zone.height + HALF) * T
    c.save()
    c.beginPath()
    c.rect(x0 - 0.3 * T, z0 - 0.3 * T, x1 - x0 + 0.6 * T, z1 - z0 + 0.6 * T)
    c.rect(x0, z0, x1 - x0, z1 - z0)
    c.clip('evenodd')
    c.fillStyle = '#e9a917'
    c.fillRect(0, 0, W, H)
    c.fillStyle = '#17181b'
    for (let k = -H; k < W + H; k += 0.3 * T) {
      c.beginPath()
      c.moveTo(k, 0)
      c.lineTo(k + 0.15 * T, 0)
      c.lineTo(k + 0.15 * T + H, H)
      c.lineTo(k + H, H)
      c.fill()
    }
    c.restore()
    // Vers les bords, le sol se perd dans l'ombre de la baie.
    const shade = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.62)
    shade.addColorStop(0, '#00000000')
    shade.addColorStop(1, '#000000d0')
    c.fillStyle = shade
    c.fillRect(0, 0, W, H)
  })
}

// ------------------------------------------------------------------ le stade

export function buildVenue(zone: ArenaZone): Venue {
  const group = new THREE.Group()
  /** Vue subjective seulement. */
  const high = new THREE.Group()
  const cx = (zone.width - 1) / 2, cz = (zone.height - 1) / 2
  // Les murs du pourtour : leur ligne médiane, au bord des tuiles.
  const X0 = -0.5, X1 = zone.width - 0.5, Z0 = -0.5, Z1 = zone.height - 0.5
  const hall = { x0: X0 - MARGIN.x, x1: X1 + MARGIN.x, z0: Z0 - MARGIN.z, z1: Z1 + MARGIN.z }

  // Le sol de la baie, sous le terrain.
  const apron = part(new THREE.PlaneGeometry(hall.x1 - hall.x0, hall.z1 - hall.z0).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: apronTexture(zone, 32) }))
  apron.position.set((hall.x0 + hall.x1) / 2, -0.004, (hall.z0 + hall.z1) / 2)
  apron.receiveShadow = true
  group.add(apron)

  // ---------------------------------------------------------------- les tribunes
  const seats: Seat[] = []
  const structure = new THREE.Group()
  const step = lit('#2b3038', 'metal'), nosing = lit('#5b6472', 'metal'), stairs = lit('#77808e', 'metal'), shell = lit('#1d2129', 'metal')
  const led = ledTexture()
  const ledMaterial = new THREE.MeshBasicMaterial({ map: led })
  const boards: THREE.Mesh[] = [], panes: THREE.Mesh[] = []
  for (const side of [-1, 1] as const) {
    const x0 = X0 - HALF, x1 = X1 + HALF, len = x1 - x0, mid = (x0 + x1) / 2
    const front = side < 0 ? Z0 - HALF : Z1 + HALF
    const yaw = side < 0 ? 0 : Math.PI
    const aisles = STAIRS.map((f) => x0 + len * f)
    for (let r = 0; r < ROWS; r++) {
      const top = FIRST + r * ROW_H
      const z = front + side * (AISLE + (r + 0.5) * ROW_D)
      structure.add(box(len, top, ROW_D, step, mid, top / 2, z))
      structure.add(box(len, 0.03, 0.05, nosing, mid, top + 0.012, front + side * (AISLE + r * ROW_D + 0.03)))
      for (const ax of aisles) structure.add(box(0.36, 0.03, ROW_D - 0.06, stairs, ax, top + 0.012, z))
      for (let x = x0 + 0.3; x < x1 - 0.2; x += PITCH) {
        if (aisles.some((ax) => Math.abs(ax - x) < 0.3)) continue
        seats.push({ x, y: top, z: z + side * 0.06, yaw, row: r })
      }
    }
    // Le mur du fond, et son bandeau qui défile ; les flancs.
    const depth = AISLE + ROWS * ROW_D
    const back = front + side * (depth + 0.08)
    structure.add(box(len + 0.32, BACK_TOP, 0.16, shell, mid, BACK_TOP / 2, back))
    for (const x of [x0 - 0.08, x1 + 0.08]) structure.add(box(0.16, BACK_TOP, depth + 0.16, shell, x, BACK_TOP / 2, front + (side * (depth + 0.16)) / 2))
    const ribbon = ledBoard(ledMaterial, len, 0.34)
    ribbon.position.set(mid, BACK_TOP - 0.3, back - side * 0.085)
    ribbon.rotation.y = yaw
    boards.push(ribbon)
    // Une vitre au-dessus du mur du pourtour, et sa main courante.
    panes.push(part(new THREE.BoxGeometry(len, 0.32, 0.02), glass('#bfe6ff', 0.16), mid, WALL_TOP + 0.16, front - side * HALF))
    structure.add(box(len, 0.035, 0.05, nosing, mid, WALL_TOP + 0.335, front - side * HALF))
  }
  group.add(fuse(panes), audience(seats))

  // ---------------------------------------------------------------- le pourtour : ses bandeaux
  const inner = 0.172
  for (const [len, x, z, yaw] of [
    [X1 - X0 - 0.3, cx, Z0 + inner, 0],
    [X1 - X0 - 0.3, cx, Z1 - inner, Math.PI],
    [Z1 - Z0 - 0.3, X0 + inner, cz, Math.PI / 2],
    [Z1 - Z0 - 0.3, X1 - inner, cz, -Math.PI / 2],
  ] as const) {
    const b = ledBoard(ledMaterial, len, 0.2)
    b.position.set(x, 0.79, z)
    b.rotation.y = yaw
    boards.push(b)
  }
  group.add(fuse(boards))

  // ---------------------------------------------------------------- les deux bouts
  const stripes = drawnTexture(512, 128, (c) => {
    c.clearRect(0, 0, 512, 128)
    c.fillStyle = '#ffffff'
    for (let x = -128; x < 512; x += 64) {
      c.beginPath()
      c.moveTo(x, 128)
      c.lineTo(x + 28, 128)
      c.lineTo(x + 28 + 128, 0)
      c.lineTo(x + 128, 0)
      c.fill()
    }
  })
  stripes.wrapS = THREE.RepeatWrapping
  const teamGlow = [0, 1].map(() => new THREE.MeshBasicMaterial({ color: '#ffffff' }))
  const teamWash = [0, 1].map(() => new THREE.MeshBasicMaterial({ color: '#ffffff', map: stripes, transparent: true, opacity: 0.5, depthWrite: false }))
  const screenTexture = logoScreen(3.4, 1.5)
  const ends = [0, 1].map((team) => {
    const end = new THREE.Group()
    const frame = new THREE.Group()
    const span = Z1 - Z0 + 2 * HALF
    // Le mur du camp, face au terrain (+x), bandes à sa couleur.
    frame.add(box(0.16, TEAM_WALL, span, shell, -0.33, TEAM_WALL / 2, 0))
    const wash = part(new THREE.PlaneGeometry(span, TEAM_WALL - 0.3), teamWash[team])
    // Les rayures gardent leur pas, quelle que soit la longueur du mur.
    const uv = wash.geometry.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * span * 0.4)
    wash.rotation.y = Math.PI / 2
    wash.position.set(-0.245, TEAM_WALL / 2 + 0.05, 0)
    end.add(wash)
    // Ce qui luit à la couleur du camp : deux bandes le long du mur, le cadre de l'écran.
    const lights = [TEAM_WALL - 0.08, 0.12].map((y) => part(new THREE.BoxGeometry(0.03, 0.07, span), teamGlow[team], -0.24, y, 0))
    // L'écran géant, sur ses deux pieds, au-dessus du mur.
    const sw = 3.4, sh = 1.5, sy = TEAM_WALL + 0.25 + sh / 2
    frame.add(box(0.2, sh + 0.24, sw + 0.24, shell, -0.42, sy, 0))
    for (const z of [-1.2, 1.2]) frame.add(box(0.14, sy, 0.14, step, -0.45, sy / 2, z))
    const screen = part(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: screenTexture }))
    screen.rotation.y = Math.PI / 2
    screen.position.set(-0.31, sy, 0)
    end.add(screen)
    for (const z of [-(sw / 2 + 0.07), sw / 2 + 0.07]) lights.push(part(new THREE.BoxGeometry(0.04, sh + 0.2, 0.06), teamGlow[team], -0.31, sy, z))
    lights.push(part(new THREE.BoxGeometry(0.04, 0.06, sw + 0.2), teamGlow[team], -0.31, sy - sh / 2 - 0.09, 0))
    end.add(fuse(lights))
    // Les deux tours d'éclairage, aux coins, tournées vers le milieu du terrain.
    for (const zs of [-1, 1]) {
      const mz = zs * (span / 2 + 0.75), mx = -1.0
      frame.add(cylinder(0.07, 0.09, 4.5, step, mx, 2.25, mz, 8))
      frame.add(box(0.5, 0.06, 0.5, step, mx, 0.03, mz))
      const head = new THREE.Group()
      head.add(box(0.12, 0.62, 1.05, shell, 0, 0, 0))
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) head.add(box(0.03, 0.22, 0.26, glow('#fff6dc'), 0.065, -0.14 + j * 0.28, -0.32 + i * 0.32))
      head.position.set(mx, 4.5, mz)
      head.lookAt(new THREE.Vector3(mx + 6, 0, 0))
      head.rotateY(-Math.PI / 2)
      frame.add(head)
    }
    end.add(compact(frame))
    // L'origine : la face extérieure du mur du pourtour, au milieu ; +x vers le terrain.
    end.position.set(team ? X1 + HALF : X0 - HALF, 0, cz)
    end.rotation.y = team ? Math.PI : 0
    return end
  })
  group.add(...ends)

  // ---------------------------------------------------------------- en vue subjective : la baie
  const roofMat = lit('#1f2531'), beam = lit('#4a525e', 'metal'), lamp = glow('#fff1d6')
  const hallParts = new THREE.Group()
  const hw = hall.x1 - hall.x0, hd = hall.z1 - hall.z0, hx = (hall.x0 + hall.x1) / 2, hz = (hall.z0 + hall.z1) / 2
  hallParts.add(box(hw, 0.1, hd, roofMat, hx, ROOF + 0.05, hz))
  for (let z = hall.z0 + 1.5; z < hall.z1; z += 3) hallParts.add(box(hw, 0.22, 0.14, beam, hx, ROOF - 0.11, z))
  for (let x = hall.x0 + 2; x < hall.x1; x += 4) {
    hallParts.add(box(0.14, 0.3, hd, beam, x, ROOF - 0.15, hz))
    for (let z = hall.z0 + 1.5; z < hall.z1; z += 3) hallParts.add(part(new THREE.CircleGeometry(0.22, 12).rotateX(Math.PI / 2), lamp, x, ROOF - 0.31, z))
  }
  // Les murs de la baie : sombres, deux filets orange.
  for (const [w, d, x, z] of [[hw, 0.2, hx, hall.z0], [hw, 0.2, hx, hall.z1], [0.2, hd, hall.x0, hz], [0.2, hd, hall.x1, hz]] as const) {
    hallParts.add(box(w, ROOF, d, shell, x, ROOF / 2, z))
    for (const y of [0.35, 3.6]) hallParts.add(box(w === hw ? w : 0.24, 0.06, d === hd ? d : 0.24, glow(ED_ORANGE), x, y, z))
  }
  high.add(compact(hallParts))
  // Des bannières, aux murs des grands côtés, au-dessus des tribunes.
  const banner = new THREE.MeshLambertMaterial({ map: bannerTexture(), side: THREE.DoubleSide })
  const banners: THREE.Mesh[] = []
  for (const [z, yaw] of [[hall.z0 + 0.12, 0], [hall.z1 - 0.12, Math.PI]] as const) {
    for (let x = hall.x0 + 3.5; x < hall.x1 - 2; x += 4.5) {
      const b = part(new THREE.PlaneGeometry(0.9, 2.25), banner, x, 4.3, z)
      b.rotation.y = yaw
      banners.push(b)
    }
  }
  high.add(fuse(banners))
  // Les faisceaux des projecteurs, des coins vers le terrain.
  const light = beamMaterial(true)
  light.uniforms.uColor.value.set('#fff3d8')
  light.uniforms.uIntensity.value = 0.13
  const cones: THREE.Mesh[] = []
  for (const end of ends) {
    end.updateMatrixWorld(true)
    for (const zs of [-1, 1]) {
      const from = new THREE.Vector3(-1.0, 4.45, zs * ((Z1 - Z0 + 2 * HALF) / 2 + 0.75)).applyMatrix4(end.matrix)
      const to = new THREE.Vector3(cx + (from.x < cx ? -2.5 : 2.5), 0, cz + (from.z < cz ? -1.5 : 1.5))
      const length = from.distanceTo(to)
      const cone = part(new THREE.CylinderGeometry(2.0, 0.3, length, 20, 1, true).translate(0, length / 2, 0), light)
      cone.position.copy(from)
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize())
      cones.push(cone)
    }
  }
  high.add(fuse(cones))
  // L'écran suspendu au-dessus du rond central : le score, sur ses quatre faces.
  const score = scoreTexture()
  const jumbo = new THREE.Group()
  const S = 2.1, SH = 1.1, JY = 3.75
  const jumboFrame = new THREE.Group()
  jumboFrame.add(box(S + 0.1, SH + 0.16, S + 0.1, shell, 0, JY, 0))
  // Un filet lumineux tout autour, en haut et en bas.
  for (const y of [JY + SH / 2 + 0.1, JY - SH / 2 - 0.1]) {
    for (const k of [-1, 1]) {
      jumboFrame.add(box(S + 0.2, 0.05, 0.05, glow(ED_ORANGE), 0, y, k * (S / 2 + 0.08)))
      jumboFrame.add(box(0.05, 0.05, S + 0.2, glow(ED_ORANGE), k * (S / 2 + 0.08), y, 0))
    }
  }
  for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) jumboFrame.add(cylinder(0.02, 0.02, ROOF - JY, beam, x, (ROOF + JY) / 2, z, 6))
  jumbo.add(compact(jumboFrame))
  const face = new THREE.MeshBasicMaterial({ map: score.texture })
  const faces: THREE.Mesh[] = []
  for (let k = 0; k < 4; k++) {
    const p = part(new THREE.PlaneGeometry(S, SH), face)
    const a = (k * Math.PI) / 2
    p.position.set(Math.sin(a) * (S / 2 + 0.056), JY, Math.cos(a) * (S / 2 + 0.056))
    p.rotation.y = a
    faces.push(p)
  }
  jumbo.add(fuse(faces))
  // Dessous, le logo : on le voit en levant les yeux.
  const under = part(new THREE.PlaneGeometry(S - 0.1, S - 0.1).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ map: logoTexture(512, 512, (c, logo) => {
    c.fillStyle = '#0b0e14'
    c.fillRect(0, 0, 512, 512)
    if (logo) c.drawImage(logo, 36, 36, 440, 440)
  }) }), 0, JY - SH / 2 - 0.085, 0)
  jumbo.add(under)
  jumbo.position.set(cx, 0, cz)
  high.add(jumbo)
  high.visible = false
  group.add(high)

  group.traverse((o) => {
    o.castShadow = false
  })

  let near = 0
  let fps = false
  let hype = 0
  let ola = -1
  const olaFrom = X0 - 2, olaTo = X1 + 2
  return {
    group,
    voice: 'crowd',
    paint(colors, side) {
      near = side
      teamGlow.forEach((m, team) => m.color.set(colors[team]))
      teamWash.forEach((m, team) => m.color.set(colors[team]))
      this.view(fps)
    },
    view(on) {
      fps = on
      high.visible = on
      // Vu de dessus, le bout du terrain du côté de la caméra cacherait sa base.
      ends.forEach((e, team) => (e.visible = on || team !== near))
    },
    update(dt) {
      led.offset.x = (led.offset.x + dt * 0.035) % 1
      hype = Math.max(0, hype - dt * 0.45)
      crowd.uHype.value = Math.min(1, hype)
      if (ola >= 0) {
        ola += dt
        const t = ola / 3.2
        crowd.uOla.value = t < 1 ? Math.min(1, 4 * t, 4 * (1 - t)) : 0
        crowd.uOlaX.value = olaFrom + (olaTo - olaFrom) * t
        if (t >= 1) ola = -1
      }
    },
    cheer(amount) {
      hype = Math.max(hype, amount * 1.4)
    },
    ola() {
      ola = 0
    },
    board(mine, theirs, colors, left, round) {
      score.draw(mine, theirs, colors, left, round)
    },
  }
}
