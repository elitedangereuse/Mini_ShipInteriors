import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { rig } from './assets'
import type { FaceControl } from './avatar'
import { tr } from './i18n'
import { recolored } from './recolor'
import { NO_STYLE, type LookStyle } from '../shared/look-style.js'

/*
 * Style du Holo-Me sur les Mini Characters (humains, combinaisons, aliens) : coiffure, couleur des
 * cheveux, expression du visage, couleurs de la combinaison. Les identifiants admis sont dans
 * shared/look-style.js (le relais les vérifie) ; ici, leurs noms, leurs couleurs et leur rendu.
 *
 * Tout passe par la palette des Mini Characters (colormap 512×512, cases de 32 px, 16×16) :
 * - une coupe, c'est la tête (« head-mesh ») d'un autre modèle, recalée sur l'os de la tête et
 *   repeinte aux couleurs du porteur : sa peau, et ses cheveux tant qu'on n'en choisit pas d'autres ;
 * - une couleur de cheveux renvoie les UV des cheveux vers des cases libres de la palette (la
 *   rangée du haut, toute noire), peintes de quatre nuances de la couleur ;
 * - une expression cache les traits du modèle (leurs UV passent sur la peau du visage) et en
 *   dessine d'autres par-dessus, dans le repère du maillage de la tête (comme Betty, cf. nurse.ts).
 */

// --------------------------------------------------------------- catalogue

export interface StyleChoice {
  id: string
  label: string
  swatch?: string
}

/** Coupes proposées (id '' : celle du modèle). */
export const HAIR_CHOICES: StyleChoice[] = [
  { id: '', label: tr('Celle du modèle', 'Model\'s own') },
  { id: 'fb', label: tr('Couettes', 'Space buns') },
  { id: 'fc', label: tr('Petit chignon', 'Small bun') },
  { id: 'fd', label: tr('Nœud haut', 'Top knot') },
  { id: 'fe', label: tr('Longs et lisses', 'Long and straight') },
  { id: 'ff', label: tr('Longs et ondulés', 'Long and wavy') },
  { id: 'ma', label: tr('Courts, lunettes', 'Short, glasses') },
  { id: 'mb', label: tr('Chauve et barbu', 'Bald and bearded') },
  { id: 'mc', label: tr('Casquette de police', 'Police cap') },
  { id: 'md', label: tr('En pointes', 'Spiky') },
  { id: 'me', label: tr('Banane, lunettes', 'Quiff, glasses') },
  { id: 'mf', label: tr('Frange', 'Fringe') },
  { id: 'sh', label: tr('Crâne rasé', 'Buzz cut') },
  { id: 'mo', label: tr('Crête', 'Mohawk') },
  { id: 'bu', label: tr('Gros chignon', 'Big bun') },
  { id: 'po', label: tr('Queue de cheval', 'Ponytail') },
]

/** Couleurs de cheveux : quatre nuances, du reflet à l'ombre (rangées 12 à 15 de la palette). */
const HAIR_SHADES: Record<string, string[]> = {
  bk: ['#48444f', '#2e2b33', '#201e24', '#141216'],
  br: ['#8a5634', '#6a3e24', '#502d1a', '#382010'],
  rx: ['#ec8440', '#d0622a', '#aa461c', '#823214'],
  bd: ['#f8da86', '#e8bc5c', '#cf9c40', '#ad7e2e'],
  pl: ['#fffaea', '#f8ecc0', '#e8d69c', '#cdb97c'],
  gy: ['#e2e4e8', '#bfc2c9', '#9a9ea7', '#7a7e87'],
  bl: ['#7ccaff', '#4596e6', '#2c70c4', '#1e5098'],
  pk: ['#ffa6d4', '#f478b6', '#d85598', '#ae3a78'],
  // Hors catalogue : les cheveux de Kael (cf. PERSONAS).
  kael: ['#4a3426', '#33241a', '#271b13', '#1c130d'],
}

export const HAIR_COLOR_CHOICES: StyleChoice[] = [
  { id: '', label: tr('Celle du modèle', 'Model\'s own') },
  { id: 'bk', label: tr('Noirs', 'Black'), swatch: HAIR_SHADES.bk[1] },
  { id: 'br', label: tr('Bruns', 'Brown'), swatch: HAIR_SHADES.br[1] },
  { id: 'rx', label: tr('Roux', 'Red'), swatch: HAIR_SHADES.rx[1] },
  { id: 'bd', label: tr('Blonds', 'Blond'), swatch: HAIR_SHADES.bd[1] },
  { id: 'pl', label: tr('Platine', 'Platinum'), swatch: HAIR_SHADES.pl[1] },
  { id: 'gy', label: tr('Gris', 'Grey'), swatch: HAIR_SHADES.gy[1] },
  { id: 'bl', label: tr('Bleus', 'Blue'), swatch: HAIR_SHADES.bl[1] },
  { id: 'pk', label: tr('Roses', 'Pink'), swatch: HAIR_SHADES.pk[1] },
]

export const FACE_CHOICES: StyleChoice[] = [
  { id: '', label: tr('Neutre', 'Neutral') },
  { id: 'sm', label: tr('Souriant', 'Smiling') },
  { id: 'se', label: tr('Sérieux', 'Serious') },
  { id: 'su', label: tr('Surpris', 'Surprised') },
  { id: 'ma', label: tr('Malicieux', 'Mischievous') },
]

/** Couleurs de combinaison : ombre, ton, lumière. */
const PAINTS: Record<string, [string, string, string]> = {
  bk: ['#0b0c0f', '#1a1c21', '#2e3138'],
  gp: ['#23262d', '#40454f', '#6a707c'],
  wh: ['#8e98a4', '#d3dae2', '#f7f9fb'],
  rd: ['#3a0a0c', '#8e1a1d', '#d0342f'],
  or: ['#4a2008', '#b4561a', '#f08a3a'],
  yl: ['#4a3a08', '#c79a1c', '#f5d04a'],
  gn: ['#0c2a18', '#1f6b3a', '#45b86a'],
  kk: ['#2a2c18', '#58603a', '#8c946a'],
  bl: ['#0c2240', '#1f5aa8', '#4a9ae8'],
  nv: ['#070d1c', '#14234a', '#2c4278'],
  vi: ['#1e0c38', '#52289a', '#8c5ae0'],
  pk: ['#3e0c26', '#b03a78', '#f07ab8'],
}

export const PAINT_CHOICES: StyleChoice[] = [
  { id: '', label: tr('D\'origine', 'Original') },
  { id: 'bk', label: tr('Noir', 'Black'), swatch: PAINTS.bk[1] },
  { id: 'gp', label: tr('Graphite', 'Graphite'), swatch: PAINTS.gp[1] },
  { id: 'wh', label: tr('Blanc', 'White'), swatch: PAINTS.wh[1] },
  { id: 'rd', label: tr('Rouge', 'Red'), swatch: PAINTS.rd[1] },
  { id: 'or', label: tr('Orange', 'Orange'), swatch: PAINTS.or[1] },
  { id: 'yl', label: tr('Jaune', 'Yellow'), swatch: PAINTS.yl[1] },
  { id: 'gn', label: tr('Vert', 'Green'), swatch: PAINTS.gn[1] },
  { id: 'kk', label: tr('Kaki', 'Khaki'), swatch: PAINTS.kk[1] },
  { id: 'bl', label: tr('Bleu', 'Blue'), swatch: PAINTS.bl[1] },
  { id: 'nv', label: tr('Marine', 'Navy'), swatch: PAINTS.nv[1] },
  { id: 'vi', label: tr('Violet', 'Purple'), swatch: PAINTS.vi[1] },
  { id: 'pk', label: tr('Rose', 'Pink'), swatch: PAINTS.pk[1] },
]

/** Liserés : ton, lumière (les voyants du sac et du casque prennent la lumière). */
const TRIMS: Record<string, [string, string]> = {
  or: ['#d9742a', '#ff9f55'],
  rd: ['#b3221f', '#ff4a3a'],
  cy: ['#3fb8e8', '#8fdcff'],
  gn: ['#2fb35a', '#7cf0a0'],
  yl: ['#d8b02a', '#ffe27a'],
  wh: ['#d8dde4', '#ffffff'],
}

export const TRIM_CHOICES: StyleChoice[] = [
  { id: '', label: tr('D\'origine', 'Original') },
  { id: 'or', label: tr('Orange', 'Orange'), swatch: TRIMS.or[0] },
  { id: 'rd', label: tr('Rouge', 'Red'), swatch: TRIMS.rd[0] },
  { id: 'cy', label: tr('Cyan', 'Cyan'), swatch: TRIMS.cy[0] },
  { id: 'gn', label: tr('Vert', 'Green'), swatch: TRIMS.gn[0] },
  { id: 'yl', label: tr('Or', 'Gold'), swatch: TRIMS.yl[0] },
  { id: 'wh', label: tr('Blanc', 'White'), swatch: TRIMS.wh[0] },
]

/**
 * Tête imposée par une apparence, quel que soit le modèle choisi : sa coupe, ses cheveux, sa peau,
 * son expression de tous les jours et ses marques (cf. drawMarks). Ni la coupe ni la couleur des
 * cheveux ne se choisissent alors au Holo-Me ; l'expression, si.
 */
export type Persona = 'kael'

const PERSONAS: Record<Persona, { hair: string; hairColor: string; skin: string; face: Expression }> = {
  // Kael, le héros de Scavengers, d'après son portrait : cheveux bruns en bataille, peau hâlée.
  kael: { hair: 'md', hairColor: 'kael', skin: 'kael', face: 'ka' },
}

/** Peaux des têtes imposées : quatre nuances, de la lumière à l'ombre (rangées 12 à 15 de la palette). */
const SKIN_SHADES: Record<string, string[]> = {
  kael: ['#d4a574', '#cb9b6b', '#c19162', '#b8895c'],
}

/** Ce que le style change pour chaque race (le reste est ignoré, et n'est pas enregistré). */
export function styleFields(race: string): (keyof LookStyle)[] {
  if (race === 'human') return ['hair', 'hairColor', 'face']
  if (race === 'suit') return ['hair', 'hairColor', 'face', 'paint', 'trim']
  // Aliens : la teinte de l'espèce colore aussi les cheveux.
  if (race === 'alien') return ['hair', 'face']
  return []
}

/** Le style réduit à ce qui compte pour la race. */
export function styleFor(race: string, style: Partial<LookStyle> | undefined): LookStyle {
  const out = { ...NO_STYLE }
  for (const k of styleFields(race)) out[k] = style?.[k] ?? ''
  return out
}

// --------------------------------------------------------------- combinaison

/** Dégradé de combinaison (cf. SuitStyle dans looks.ts). */
export interface SuitPaint {
  ramp: [number, string][]
  shell: string
  light: string
}

const color = (c: string) => new THREE.Color(c)
const lightness = (c: string) => color(c).getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace).l
const lerp3 = (stops: string[], t: number) => {
  const k = THREE.MathUtils.clamp(t, 0, 1) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(k))
  return '#' + color(stops[i]).lerp(color(stops[i + 1]), k - i).getHexString()
}

/**
 * Repeint une combinaison : les étapes du dégradé sous `trimAt` sont le corps, au-dessus les
 * liserés. Chaque étape garde son rang de luminosité dans son groupe (l'ombrage du modèle reste),
 * mais prend la couleur choisie. La coque (casque, sac) suit le corps, les voyants le liseré.
 */
export function paintSuit<T extends SuitPaint>(s: T, trimAt: number, paint: string, trim: string): T {
  const body = PAINTS[paint], edge = TRIMS[trim]
  if (!body && !edge) return s
  const bodyL = s.ramp.filter(([at]) => at < trimAt).map(([, c]) => lightness(c))
  const edgeL = s.ramp.filter(([at]) => at >= trimAt).map(([, c]) => lightness(c))
  const rank = (l: number, all: number[]) => {
    const lo = Math.min(...all), hi = Math.max(...all)
    return hi - lo < 0.01 ? 0.5 : (l - lo) / (hi - lo)
  }
  const ramp = s.ramp.map(([at, c]): [number, string] => {
    if (at < trimAt) return [at, body ? lerp3(body, rank(lightness(c), bodyL)) : c]
    return [at, edge ? lerp3(edge, edgeL.length > 1 ? rank(lightness(c), edgeL) : 0.5) : c]
  })
  return {
    ...s,
    ramp,
    shell: body ? lerp3(body, rank(lightness(s.shell), bodyL) * 0.85) : s.shell,
    light: edge ? edge[1] : s.light,
  }
}

// --------------------------------------------------------------- têtes

/**
 * Colonnes de la palette de chaque tête : la peau, et les cheveux (la première est la couleur
 * principale), et s'il porte des lunettes. Mesuré sur les modèles : les cheveux et la peau
 * occupent les rangées 12 à 15.
 */
const HEADS: Record<string, { skin: number; hair: number[]; glasses?: boolean }> = {
  'female-a': { skin: 13, hair: [1] },
  'female-b': { skin: 15, hair: [11] },
  'female-c': { skin: 11, hair: [3] },
  'female-d': { skin: 15, hair: [11] },
  'female-e': { skin: 15, hair: [1] },
  'female-f': { skin: 15, hair: [13, 11] },
  'male-a': { skin: 13, hair: [1], glasses: true },
  'male-b': { skin: 15, hair: [11, 13] },
  'male-c': { skin: 15, hair: [11] },
  'male-d': { skin: 15, hair: [11] },
  'male-e': { skin: 15, hair: [13], glasses: true },
  'male-f': { skin: 11, hair: [1] },
}

const HEAD_OF: Record<string, string> = {
  fb: 'female-b', fc: 'female-c', fd: 'female-d', fe: 'female-e', ff: 'female-f',
  ma: 'male-a', mb: 'male-b', mc: 'male-c', md: 'male-d', me: 'male-e', mf: 'male-f',
}

/**
 * Coupes faites main : la tête de départ, ce qu'on lui retire (ses cheveux, l'oreillette du
 * chauve, les lunettes), et si le haut du crâne passe à la couleur des cheveux (coupe à ras).
 */
const CRAFTED: Record<string, { base: string; drop: Part[]; buzz?: boolean }> = {
  sh: { base: 'male-b', drop: ['hair', 'gear'], buzz: true },
  mo: { base: 'male-b', drop: ['hair', 'gear'] },
  bu: { base: 'male-a', drop: ['glasses'] },
  po: { base: 'male-a', drop: ['glasses'] },
}

/** Cases libres de la palette (rangée du haut) : les quatre nuances de la couleur des cheveux. */
const HAIR_CELL_X = 4
/** Et les quatre suivantes : les nuances de la peau d'une tête imposée. */
const SKIN_CELL_X = 8
const HAIR_ROWS = [12, 13, 14, 15]
const uOf = (cx: number) => (cx + 0.5) / 16
const vOf = (cy: number) => (cy + 0.5) / 16

/** Traits du visage mesurés sur la tête (repère du maillage, à sa pose de liaison). */
export interface FaceSpot {
  eyes: [THREE.Vector3, THREE.Vector3]
  mouth: THREE.Vector3
  /** Où dessiner (z) : devant le visage, ou devant les verres des lunettes. */
  front: number
}

interface StyledHead {
  /** Tête coiffée, traits d'origine. */
  geometry: THREE.BufferGeometry
  /** La même, sans les traits (pour dessiner une expression). */
  blank: THREE.BufferGeometry
  face: FaceSpot | null
}

/** Soupe de triangles (non indexée) aux attributs d'un maillage animé des Mini Characters. */
class Soup {
  pos: number[] = []
  normal: number[] = []
  uv: number[] = []
  add(p: THREE.Vector3, n: THREE.Vector3, u: number, v: number) {
    this.pos.push(p.x, p.y, p.z)
    this.normal.push(n.x, n.y, n.z)
    this.uv.push(u, v)
  }
  build(bone: number): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry()
    const n = this.pos.length / 3
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normal, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    // Toute la tête suit l'os de la tête (c'est déjà le cas sur les modèles).
    const index = new Uint16Array(n * 4), weight = new Float32Array(n * 4)
    for (let i = 0; i < n; i++) { index[i * 4] = bone; weight[i * 4] = 1 }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(index, 4))
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weight, 4))
    g.computeBoundingBox()
    g.computeBoundingSphere()
    return g
  }
}

/** Passe du repère d'un maillage de tête à l'os de la tête (pose de liaison). */
function toHeadBone(mesh: THREE.SkinnedMesh): THREE.Matrix4 {
  const i = mesh.skeleton.bones.findIndex((b) => b.name === 'head')
  return new THREE.Matrix4().multiplyMatrices(mesh.skeleton.boneInverses[i], mesh.bindMatrix)
}

/** Maillage de tête d'un modèle (chargé une fois ; ses données sont partagées, on n'y écrit pas). */
const donors = new Map<string, Promise<THREE.SkinnedMesh>>()
function donorHead(key: string): Promise<THREE.SkinnedMesh> {
  let p = donors.get(key)
  if (!p) {
    p = rig(`characters/character-${key}.glb`).then((r) => r.root.getObjectByName('head-mesh') as THREE.SkinnedMesh)
    donors.set(key, p)
  }
  return p
}

/** Ce qu'est un triangle de la tête. */
type Part = 'feature' | 'glasses' | 'hair' | 'skin' | 'gear'

/**
 * Nature d'un triangle d'après sa place et sa case de palette. Les traits (yeux, bouche, sourcils)
 * sont de petites faces posées sur le devant du visage, dans la colonne sombre (z ≈ 0,16) ; les
 * lunettes, un peu devant (z ≈ 0,165), dans les colonnes grises.
 */
function partOf(p: THREE.Vector3[], cells: [number, number][], head: (typeof HEADS)[string]): Part {
  const onFace = p.every((v) => Math.abs(v.x) < 0.14 && v.y > 0.37 && v.y < 0.545 && v.z > 0.155 && v.z < 0.17)
  const cols = cells.map(([cx, cy]) => (cy >= 12 ? cx : -1))
  if (onFace && cols.every((c) => c === 1 || c === 7 || c === 9)) {
    const raised = p.some((v) => v.z > 0.162)
    if (head.glasses && (raised || cols.some((c) => c !== 1))) return 'glasses'
    if (cols.every((c) => c === 1)) return 'feature'
  }
  // Les branches des lunettes, sur les côtés.
  if (head.glasses && cols.every((c) => c === 7 || c === 9)) return 'glasses'
  if (cols.every((c) => head.hair.includes(c))) return 'hair'
  if (cols.every((c) => c === head.skin)) return 'skin'
  return cols.every((c) => c >= 0) ? 'gear' : 'skin'
}

const heads = new Map<string, Promise<StyledHead>>()

/**
 * La tête coiffée d'un porteur (`own` : « female-b »…) : la coupe `hair`, les cheveux de couleur
 * `hairColor` (ou ceux du porteur), sa peau (ou la peau `skin` d'une tête imposée). Calculée une
 * fois par combinaison.
 */
function styledHead(own: string, ownMesh: THREE.SkinnedMesh, hair: string, hairColor: string, skin = ''): Promise<StyledHead> {
  const key = `${own}|${hair}|${hairColor}|${skin}`
  let p = heads.get(key)
  if (!p) {
    p = buildHead(own, ownMesh, hair, hairColor, skin)
    heads.set(key, p)
  }
  return p
}

async function buildHead(own: string, ownMesh: THREE.SkinnedMesh, hair: string, hairColor: string, skin: string): Promise<StyledHead> {
  const crafted = CRAFTED[hair]
  const donorKey = crafted?.base ?? HEAD_OF[hair] ?? own
  const donor = donorKey === own ? ownMesh : await donorHead(donorKey)
  const mine = HEADS[own], theirs = HEADS[donorKey]
  // Du repère de la tête donneuse à celui du porteur, par l'os de la tête.
  const move = toHeadBone(ownMesh).invert().multiply(toHeadBone(donor))
  const turn = new THREE.Matrix3().getNormalMatrix(move)
  const g = donor.geometry
  const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv
  const count = g.index ? g.index.count : pos.count
  const at = (t: number) => (g.index ? g.index.getX(t) : t)

  // Les cheveux d'une couleur choisie vont dans les cases libres ; sinon, ceux du porteur.
  const hairTo = (row: number): [number, number] => (hairColor ? [HAIR_CELL_X + HAIR_ROWS.indexOf(row), 0] : [mine.hair[0], row])
  const soup = new Soup()
  const blank = new Soup()
  const features: THREE.Vector3[] = []
  let glasses = -Infinity
  const tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  const norms = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  const cells: [number, number][] = [[0, 0], [0, 0], [0, 0]]
  const uvs: [number, number][] = [[0, 0], [0, 0], [0, 0]]
  for (let t = 0; t < count; t += 3) {
    for (let k = 0; k < 3; k++) {
      const i = at(t + k)
      tri[k].fromBufferAttribute(pos, i)
      norms[k].fromBufferAttribute(nrm, i)
      uvs[k] = [uv.getX(i), uv.getY(i)]
      cells[k] = [Math.floor(uvs[k][0] * 16), Math.floor(uvs[k][1] * 16)]
    }
    const part = partOf(tri, cells, theirs)
    if (crafted?.drop.includes(part)) continue
    // Coupe à ras : le dessus, les côtés et l'arrière du crâne (pas le front) prennent les cheveux.
    const buzz = crafted?.buzz && part === 'skin' && tri.every((v) => v.y > 0.505) && !tri.every((v) => v.z > 0.155)
    for (let k = 0; k < 3; k++) {
      const [cx, cy] = cells[k]
      let [u, v] = uvs[k]
      if (buzz || part === 'hair') {
        const [hx, hy] = hairTo(cy)
        u += (hx - cx) / 16
        v += (hy - cy) / 16
      } else if (part === 'skin' && cx === theirs.skin && cy >= 12) {
        if (skin) {
          // Peau imposée : une case libre par nuance.
          u += (SKIN_CELL_X + cy - 12 - cx) / 16
          v += -cy / 16
        }
        // Même case, dans la colonne du porteur : l'ombrage de la palette est gardé.
        else u += (mine.skin - cx) / 16
      }
      const p = tri[k].clone().applyMatrix4(move)
      const n = norms[k].clone().applyMatrix3(turn).normalize()
      soup.add(p, n, u, v)
      // Sans les traits : leur face prend la peau du visage.
      if (part === 'feature') {
        blank.add(p, n, uOf(skin ? SKIN_CELL_X : mine.skin), vOf(skin ? 0 : 12))
        features.push(p)
      } else blank.add(p, n, u, v)
      if (part === 'glasses') glasses = Math.max(glasses, p.z)
    }
  }
  if (crafted) {
    const hairUv: [number, number] = hairColor ? [uOf(HAIR_CELL_X + 1), vOf(0)] : [uOf(mine.hair[0]), vOf(13)]
    for (const piece of craftedHair(hair, soup)) addPiece(piece, hairUv, soup, blank)
  }
  const bone = ownMesh.skeleton.bones.findIndex((b) => b.name === 'head')
  const face = measureFace(features)
  if (face && glasses > face.front) face.front = glasses
  return { geometry: soup.build(bone), blank: blank.build(bone), face }
}

/** Ajoute une pièce (boîte arrondie…) à la tête, toute d'une couleur de la palette. */
function addPiece(piece: THREE.BufferGeometry, [u, v]: [number, number], ...soups: Soup[]) {
  const g = piece.index ? piece.toNonIndexed() : piece
  const pos = g.attributes.position, nrm = g.attributes.normal
  const p = new THREE.Vector3(), n = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i)
    n.fromBufferAttribute(nrm, i)
    for (const s of soups) s.add(p, n, u, v)
  }
}

/** Boîte arrondie posée en `at`, tournée de `rx` autour de x. */
function lump(w: number, h: number, d: number, at: [number, number, number], rx = 0, r = 0.02): THREE.BufferGeometry {
  const g = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2) * 0.999)
  if (rx) g.rotateX(rx)
  g.translate(...at)
  return g
}

/**
 * Les coupes faites main, dans le repère de la tête (le crâne va de y ≈ 0,34 au cou à ≈ 0,67 au
 * sommet, de x = -0,23 à 0,23, de z ≈ -0,17 derrière à 0,16 au visage).
 */
function craftedHair(id: string, soup: Soup): THREE.BufferGeometry[] {
  // Sommet et arrière de la tête de départ.
  let top = -Infinity, back = Infinity
  for (let i = 0; i < soup.pos.length; i += 3) {
    top = Math.max(top, soup.pos[i + 1])
    back = Math.min(back, soup.pos[i + 2])
  }
  switch (id) {
    case 'mo': {
      // Crête : des mèches dressées du front à la nuque, les plus hautes au milieu.
      const tufts = [[0.12, 0.07], [0.06, 0.1], [0, 0.12], [-0.06, 0.12], [-0.12, 0.1]]
      const parts = tufts.map(([z, h]) => lump(0.07, h + 0.02, 0.075, [0, top + h / 2 - 0.01, z], 0.3, 0.018))
      // Et la bande rase qui la porte, jusqu'à la nuque.
      parts.push(lump(0.08, 0.02, 0.3, [0, top + 0.002, 0], 0, 0.008), lump(0.08, 0.2, 0.02, [0, top - 0.1, back - 0.003], 0, 0.008))
      return parts
    }
    case 'bu':
      // Gros chignon rond sur le sommet, un peu en arrière.
      return [lump(0.2, 0.15, 0.18, [0, top + 0.045, -0.05], 0, 0.05)]
    case 'po':
      // Queue de cheval : attachée haut derrière la tête, elle tombe dans le dos.
      return [
        lump(0.13, 0.1, 0.08, [0, top - 0.06, back - 0.03], 0, 0.035),
        lump(0.11, 0.16, 0.08, [0, top - 0.17, back - 0.07], -0.3, 0.035),
        lump(0.09, 0.14, 0.07, [0, top - 0.3, back - 0.1], -0.1, 0.03),
      ]
  }
  return []
}

/** Yeux et bouche d'après les traits du modèle ; null s'il n'en a pas (chauve de dos…). */
function measureFace(points: THREE.Vector3[]): FaceSpot | null {
  if (points.length < 6) return null
  const mid = (list: THREE.Vector3[]) => list.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(Math.max(1, list.length))
  // Les yeux, sous les sourcils des modèles qui en ont.
  const eyes = points.filter((p) => p.y > 0.455 && p.y < 0.515)
  const mouth = points.filter((p) => p.y <= 0.455)
  if (!eyes.length) return null
  const front = Math.max(...points.map((p) => p.z))
  const left = mid(eyes.filter((p) => p.x > 0)), right = mid(eyes.filter((p) => p.x < 0))
  // Les yeux des modèles sont symétriques : on centre la bouche entre eux.
  const m = mouth.length ? mid(mouth) : new THREE.Vector3(0, left.y - 0.07, front)
  m.x = (left.x + right.x) / 2
  return { eyes: [left, right], mouth: m, front }
}

/**
 * Texture de la tête avec, dans les cases libres, les quatre nuances d'une couleur de cheveux et
 * celles d'une peau imposée (`skin`, '' : aucune).
 */
function hairTexture(src: THREE.Texture, id: string, skin: string): THREE.Texture {
  const shades = [...(HAIR_SHADES[id] ?? []), ...Array(4).fill('#000000')].slice(0, 4).concat(SKIN_SHADES[skin] ?? []).map(color)
  const size = (src.image as { width: number }).width
  return recolored(src, `hair:${id}:${skin}`, (_hsl, c, x, y) => {
    const cx = Math.floor((x * 16) / size), cy = Math.floor((y * 16) / size)
    if (cy === 0 && cx >= HAIR_CELL_X && cx < HAIR_CELL_X + shades.length) c.copy(shades[cx - HAIR_CELL_X])
  })
}

const hairMaterials = new Map<string, THREE.Material>()
function hairMaterial(src: THREE.MeshLambertMaterial, id: string, skin: string): THREE.Material {
  const key = `${src.uuid}:${id}:${skin}`
  let m = hairMaterials.get(key)
  if (!m) {
    const c = src.clone()
    if (src.map) c.map = hairTexture(src.map, id, skin)
    hairMaterials.set(key, (m = c))
  }
  return m
}

// --------------------------------------------------------------- expressions

/** Expressions dessinables : les permanentes (FACE_CHOICES), et celles que jouent les emotes. */
type Expression = 'sm' | 'se' | 'su' | 'ma' | 'gr' | 'wi' | 'zz' | 'fr' | 'ka'

const INK = new THREE.MeshBasicMaterial({ color: '#1b1820' })
const SHINE = new THREE.MeshBasicMaterial({ color: '#ffffff' })
const MOUTH = new THREE.MeshBasicMaterial({ color: '#5c1d2a' })
const IRIS = new THREE.MeshBasicMaterial({ color: '#4a7c59' })
const SCAR = new THREE.MeshBasicMaterial({ color: '#9c5f47' })
const STUBBLE = new THREE.MeshBasicMaterial({ color: '#6b4a30', transparent: true, opacity: 0.3, depthWrite: false })
const BRISTLE = new THREE.MeshBasicMaterial({ color: '#7a5638' })

/** Arc de cercle (épaisseur `w`), de `from` sur `span` radians ; 0 : à droite, π/2 : en haut. */
const arc = (r: number, w: number, from: number, span: number) => new THREE.RingGeometry(r - w / 2, r + w / 2, 18, 1, from, span)

/** Dessine une expression devant le visage (repère du maillage de la tête). */
function drawExpression(e: Expression, f: FaceSpot): THREE.Group {
  const g = new THREE.Group()
  const z = f.front + 0.0015
  const u = Math.abs(f.eyes[0].x - f.eyes[1].x) / 10 // ≈ 0,014 : l'écart des yeux fait l'échelle
  const put = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, rot = 0, dz = 0) => {
    const mesh = new THREE.Mesh(geo, m)
    mesh.position.set(x, y, z + dz)
    mesh.rotation.z = rot
    g.add(mesh)
    return mesh
  }
  const [l, r] = f.eyes
  const mx = f.mouth.x, my = f.mouth.y
  const dot = (p: THREE.Vector3, size = 1.35) => {
    put(new THREE.CircleGeometry(size * u, 14), INK, p.x, p.y)
    put(new THREE.CircleGeometry(size * 0.4 * u, 8), SHINE, p.x + size * 0.35 * u, p.y + size * 0.35 * u, 0, 0.0005)
  }
  /** Œil fermé en arc : vers le haut (heureux, ^) ou vers le bas (endormi). */
  const shut = (p: THREE.Vector3, up: boolean) => put(arc(1.5 * u, 0.6 * u, up ? 0.15 * Math.PI : 1.15 * Math.PI, 0.7 * Math.PI), INK, p.x, p.y + (up ? -0.6 : 0.6) * u)
  /** Sourcil au-dessus d'un œil ; `tilt` > 0 : le bout intérieur descend (air sévère). */
  const brow = (p: THREE.Vector3, lift: number, tilt: number) => put(new THREE.PlaneGeometry(3.2 * u, 0.7 * u), INK, p.x, p.y + lift * u, Math.sign(p.x) * tilt)
  const smile = (w: number, lift = 0) => put(arc(w * u, 0.65 * u, 1.18 * Math.PI, 0.64 * Math.PI), INK, mx, my + (w * 0.75 + lift) * u)
  switch (e) {
    case 'sm':
      dot(l); dot(r); smile(2.8)
      break
    case 'se':
      dot(l, 1.2); dot(r, 1.2)
      brow(l, 2.3, 0.32); brow(r, 2.3, 0.32)
      put(new THREE.PlaneGeometry(3.4 * u, 0.65 * u), INK, mx, my)
      break
    case 'su':
      dot(l, 1.8); dot(r, 1.8)
      brow(l, 3.4, -0.12); brow(r, 3.4, -0.12)
      put(arc(1.2 * u, 0.7 * u, 0, Math.PI * 2), INK, mx, my - 0.3 * u)
      break
    case 'ma':
      // Un œil plissé, un sourcil levé, un sourire en coin.
      dot(l)
      put(new THREE.PlaneGeometry(2.6 * u, 0.6 * u), INK, r.x, r.y - 0.2 * u, -0.12)
      brow(l, 2.8, -0.25)
      put(arc(2.4 * u, 0.65 * u, 1.3 * Math.PI, 0.5 * Math.PI), INK, mx + 1.2 * u, my + 1.6 * u)
      break
    case 'gr': {
      // Grand sourire, yeux rieurs.
      shut(l, true); shut(r, true)
      put(new THREE.CircleGeometry(2.7 * u, 18, Math.PI, Math.PI), MOUTH, mx, my + 1.2 * u)
      put(new THREE.PlaneGeometry(5.4 * u, 0.6 * u), INK, mx, my + 1.2 * u, 0, 0.0003)
      break
    }
    case 'wi':
      dot(l); shut(r, true); smile(2.6)
      break
    case 'ka':
      // Kael au repos : le regard vert de son portrait, les sourcils bas, la bouche fermée.
      for (const p of [l, r]) {
        put(new THREE.CircleGeometry(1.5 * u, 16), IRIS, p.x, p.y, 0, -0.0004)
        dot(p, 1.1)
        brow(p, 2.5, 0.1)
      }
      put(new THREE.PlaneGeometry(3 * u, 0.6 * u), INK, mx, my)
      break
    case 'zz':
      shut(l, false); shut(r, false)
      put(new THREE.CircleGeometry(0.8 * u, 12), MOUTH, mx, my)
      break
    case 'fr':
      dot(l, 1.2); dot(r, 1.2)
      brow(l, 2.4, -0.3); brow(r, 2.4, -0.3)
      put(arc(2.4 * u, 0.65 * u, 0.2 * Math.PI, 0.6 * Math.PI), INK, mx, my - 2.2 * u)
      break
  }
  return g
}

/**
 * Marques d'une tête imposée, gardées sous toutes les expressions. Kael : la cicatrice de sa joue
 * gauche et sa barbe de trois jours.
 */
function drawMarks(_persona: Persona, f: FaceSpot): THREE.Group {
  const g = new THREE.Group()
  // Juste devant la peau, derrière les traits des expressions.
  const z = f.front + 0.0006
  const u = Math.abs(f.eyes[0].x - f.eyes[1].x) / 10
  const put = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, rot = 0, dz = 0) => {
    const mesh = new THREE.Mesh(geo, m)
    mesh.position.set(x, y, z + dz)
    mesh.rotation.z = rot
    g.add(mesh)
  }
  const [l] = f.eyes
  const mx = f.mouth.x, my = f.mouth.y
  // La cicatrice : un trait en biais sous l'œil, barré d'un point de suture.
  put(new THREE.PlaneGeometry(0.8 * u, 4.6 * u), SCAR, l.x + 1.6 * u, l.y - 3.8 * u, 0.45)
  put(new THREE.PlaneGeometry(2.2 * u, 0.55 * u), SCAR, l.x + 1.7 * u, l.y - 4 * u, 0.45)
  // La barbe : une ombre sur la mâchoire et autour de la bouche, et quelques poils plus nets.
  put(new THREE.PlaneGeometry(17 * u, 3 * u), STUBBLE, mx, my - 2.1 * u)
  put(new THREE.PlaneGeometry(7 * u, 2.2 * u), STUBBLE, mx, my + 0.5 * u)
  for (const [x, y] of [[-6.5, -1.4], [-4.2, -2.6], [-1.6, -2], [1.4, -2.7], [3.8, -1.7], [6.4, -2.5], [-7.4, 0.3], [7.5, 0.1], [-2.8, 1.1], [2.9, 1]]) {
    put(new THREE.PlaneGeometry(0.55 * u, 0.55 * u), BRISTLE, mx + x * u, my + y * u, 0, 0.0002)
  }
  return g
}

/** Visage d'un personnage : son expression permanente, et celle d'une emote par-dessus. */
class Face implements FaceControl {
  private shown: string | null = null
  private drawn = new Map<string, THREE.Group>()

  constructor(
    private mesh: THREE.SkinnedMesh,
    private head: StyledHead,
    private holder: THREE.Group,
    private base: string,
  ) {
    this.show(null)
  }

  show(expression: string | null) {
    const e = expression ?? this.base
    if (e === this.shown) return
    // Un PNJ qui s'est peint un visage à lui (Betty, cf. nurse.ts) le garde.
    if (this.mesh.geometry !== this.head.geometry && this.mesh.geometry !== this.head.blank) return
    this.shown = e
    for (const [id, g] of this.drawn) g.visible = id === e
    if (!e) {
      this.mesh.geometry = this.head.geometry
      return
    }
    this.mesh.geometry = this.head.blank
    if (!this.drawn.has(e)) {
      const g = drawExpression(e as Expression, this.head.face!)
      this.holder.add(g)
      this.drawn.set(e, g)
    }
  }
}

// --------------------------------------------------------------- pose sur un modèle

/**
 * Coiffe un Mini Character et lui donne un visage (après sa mise à l'échelle et sa teinte).
 * `own` : le modèle (« female-b »), `hideFace` : un casque fermé le cache, `persona` : la tête
 * imposée par l'apparence, s'il y en a une. Renvoie le visage.
 */
export async function applyStyle(root: THREE.Object3D, own: string, style: LookStyle, hideFace: boolean, persona?: Persona): Promise<FaceControl | undefined> {
  const mesh = root.getObjectByName('head-mesh') as THREE.SkinnedMesh | undefined
  const head = root.getObjectByName('head')
  if (!mesh || !head || !HEADS[own]) return
  const who = persona && PERSONAS[persona]
  const hair = who?.hair ?? style.hair, hairColor = who?.hairColor ?? style.hairColor, skin = who?.skin ?? ''
  const styled = await styledHead(own, mesh, hair, hairColor, skin)
  mesh.geometry = styled.geometry
  mesh.computeBoundingBox()
  mesh.computeBoundingSphere()
  if (hairColor || skin) mesh.material = hairMaterial(mesh.material as THREE.MeshLambertMaterial, hairColor, skin)
  if (hideFace || !styled.face) return
  root.updateMatrixWorld(true)
  const holder = new THREE.Group()
  holder.matrixAutoUpdate = false
  holder.matrix.copy(head.matrixWorld).invert().multiply(mesh.matrixWorld)
  head.add(holder)
  if (persona) holder.add(drawMarks(persona, styled.face))
  return new Face(mesh, styled, holder, style.face || (who?.face ?? ''))
}
