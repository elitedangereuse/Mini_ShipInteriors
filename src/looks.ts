import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { rig, type Rig } from './assets'
import type { FaceControl } from './avatar'
import { holoTime } from './furniture/kit'
import { applyStyle, paintSuit, styleFor } from './holo-style'
import { tr } from './i18n'
import type { IconName } from './icons'
import { recolored } from './recolor'
import { isStyleSegment, parseStyle, styleSegment, type LookStyle } from '../shared/look-style.js'

/**
 * Catalogue des apparences proposées par la garde-robe.
 * Une apparence s'écrit sous forme de chaîne (« human.female.b », « suit.male.c.artemis »,
 * « alien.male.c.blue », « robot.g », « holo.female.d.echo »…) : c'est ce qui est sauvegardé et envoyé aux autres joueurs.
 * Le style du Holo-Me (coiffure, expression, couleurs : cf. holo-style.ts) s'y ajoute en dernier
 * segment, s'il y en a un : « human.female.b.mo-pk-sm-- ».
 */

export type RaceId = 'human' | 'suit' | 'alien' | 'robot' | 'creature' | 'guardian' | 'holo'
export type Sex = 'female' | 'male'

export interface Look {
  race: RaceId
  sex: Sex
  variant: string
  tint: string
  /** Coiffure, expression, couleurs (Mini Characters seulement) ; absent : tout comme le modèle. */
  style?: LookStyle
}

interface Choice {
  id: string
  label: string
  /** Modèle propre à un sexe (les Mini Characters diffèrent d'un sexe à l'autre). */
  sex?: Sex
}

/** Combinaison spatiale : couleurs du corps et du casque. */
export interface SuitStyle {
  /**
   * Dégradé appliqué au corps selon la luminosité d'origine : [position 0…1, couleur].
   * Les parties blanches des vêtements d'origine deviennent les liserés de la combinaison.
   */
  ramp: [number, string][]
  /** Gants (là où le modèle montre de la peau : mains, bras nus). */
  glove: string
  /** none : col seul · visor : casque fermé à visière · glass : bulle transparente. */
  helmet: 'none' | 'visor' | 'glass'
  shell: string
  visor: string
  /** Voyants (sac dorsal, lampe du casque). */
  light: string
}

interface GuardianStyle {
  ramp: [number, string][]
  light: string
  core: string
  accent: string
  dark: string
  motif: 'sentinel' | 'watcher' | 'exile' | 'archivist'
}

interface Tint extends Choice {
  swatch: string
  /** Alien : rotation de teinte de toute la texture. */
  hue?: number
  suit?: SuitStyle
  /** Combinaison : où commencent les liserés dans son dégradé (pour la repeindre). */
  trimAt?: number
}

export interface Race {
  id: RaceId
  label: string
  icon: IconName
  /** Le choix du sexe a-t-il un sens pour cette race ? */
  sexed: boolean
  variants: Choice[]
  /** Intitulé de la ligne des teintes dans la garde-robe. */
  tintLabel?: string
  tints?: Tint[]
}

/** Mini Characters proposés, par sexe. La femme « a » (avec des béquilles) est retirée du catalogue. */
const MINI: Record<Sex, string[]> = { female: ['b', 'c', 'd', 'e', 'f'], male: ['a', 'b', 'c', 'd', 'e', 'f'] }
const miniVariants = (): Choice[] =>
  (['female', 'male'] as const).flatMap((sex) => MINI[sex].map((id, i) => ({ id, label: tr(`Modèle ${i + 1}`, `Model ${i + 1}`), sex })))

export const RACES: Race[] = [
  { id: 'human', label: tr('Humain', 'Human'), icon: 'user', sexed: true, variants: miniVariants() },
  {
    id: 'suit',
    label: tr('Combinaison', 'Suit'),
    icon: 'rocket-launch',
    sexed: true,
    variants: miniVariants(),
    tintLabel: tr('Combinaison', 'Suit'),
    // D'après les combinaisons d'Elite Dangerous: Odyssey.
    tints: [
      {
        id: 'flight',
        label: tr('Vol', 'Flight'),
        swatch: '#e07b2c',
        trimAt: 0.86,
        suit: {
          ramp: [[0, '#101216'], [0.45, '#262a33'], [0.8, '#474d59'], [0.87, '#d9742a'], [1, '#ff9f55']],
          glove: '#2a2e37',
          helmet: 'none',
          shell: '#2d313b',
          visor: '#000000',
          light: '#ff8a2a',
        },
      },
      {
        id: 'maverick',
        label: 'Maverick',
        swatch: '#f0a23a',
        trimAt: 0.9,
        suit: {
          ramp: [[0, '#1c1a17'], [0.3, '#3a3630'], [0.5, '#b8741f'], [0.8, '#e89a32'], [1, '#ffd27a']],
          glove: '#3a3630',
          helmet: 'visor',
          shell: '#3a3e46',
          visor: '#ffb640',
          light: '#ffd27a',
        },
      },
      {
        id: 'dominator',
        label: 'Dominator',
        swatch: '#c8302c',
        trimAt: 0.86,
        suit: {
          ramp: [[0, '#0a0b0e'], [0.45, '#1c1f25'], [0.8, '#383d47'], [0.87, '#b3221f'], [1, '#ff4a3a']],
          glove: '#1c1f25',
          helmet: 'visor',
          shell: '#2a2e36',
          visor: '#ff3b2f',
          light: '#ff5a3c',
        },
      },
      {
        id: 'artemis',
        label: 'Artemis',
        swatch: '#dfe8f2',
        trimAt: 0.89,
        suit: {
          ramp: [[0, '#2e3945'], [0.3, '#76869a'], [0.55, '#cfd8e2'], [0.87, '#f2f6fa'], [0.9, '#3fb8e8'], [1, '#8fdcff']],
          glove: '#aab6c4',
          helmet: 'glass',
          shell: '#eef3f8',
          visor: '#a8ecff',
          light: '#5cd6ff',
        },
      },
    ],
  },
  {
    id: 'alien',
    label: 'Alien',
    icon: 'alien',
    sexed: true,
    variants: miniVariants(),
    tintLabel: tr('Teinte', 'Colour'),
    // Rotation de teinte appliquée à toute la texture (peau, cheveux et habits changent ensemble).
    tints: [
      { id: 'green', label: tr('Zorblien', 'Zorblian'), hue: 95, swatch: '#6fdc6f' },
      { id: 'blue', label: tr('Cryonien', 'Cryonian'), hue: 175, swatch: '#5cc8ff' },
      { id: 'violet', label: tr('Nébulien', 'Nebulian'), hue: 245, swatch: '#b27cff' },
    ],
  },
  {
    id: 'robot',
    label: 'Robot',
    icon: 'robot',
    sexed: false,
    variants: [
      { id: 'g', label: tr('Unité R-7', 'Unit R-7') },
      { id: 'h', label: tr('Unité V-3', 'Unit V-3') },
      { id: 'd', label: 'Mannequin T-0' },
    ],
  },
  {
    id: 'creature',
    label: tr('Créature', 'Creature'),
    icon: 'ghost',
    sexed: false,
    variants: [
      { id: 'orc', label: tr('Orque de Kepler', 'Kepler orc') },
      { id: 'o', label: tr('Troll des soutes', 'Cargo hold troll') },
      { id: 'l', label: tr('Zombie en costume', 'Zombie in a suit') },
    ],
  },
  {
    id: 'guardian',
    label: tr('Gardien', 'Guardian'),
    icon: 'seal-check',
    sexed: false,
    variants: [
      { id: 'a', label: tr('Sentinelle antique', 'Ancient sentinel') },
      { id: 'b', label: tr('Veilleur synuefe', 'Synuefe watcher') },
      { id: 'c', label: tr('Exilé d\'obélisque', 'Obelisk exile') },
      { id: 's', label: tr('Archiviste lumineux', 'Luminous archivist') },
    ],
  },
  {
    // Une projection du Holo-Me : la silhouette d'un Mini Character, sans personne dedans. Elle ne
    // s'achète pas : la quête « L'essayage » l'offre (cf. shared/quests.js).
    id: 'holo',
    label: tr('Hologramme', 'Hologram'),
    icon: 'user-focus',
    sexed: true,
    variants: miniVariants(),
    tintLabel: tr('Projection', 'Projection'),
    tints: [{ id: 'echo', label: tr('Écho', 'Echo'), swatch: '#6fe8ff' }],
  },
]

export const DEFAULT_LOOK: Look = { race: 'suit', sex: 'female', variant: 'b', tint: 'flight' }

export function raceOf(look: Look): Race {
  return RACES.find((r) => r.id === look.race) ?? RACES[0]
}

/** Modèles proposés pour une race et un sexe. */
export function variantsOf(race: Race, sex: Sex): Choice[] {
  return race.variants.filter((v) => !v.sex || v.sex === sex)
}

export function lookId(l: Look): string {
  const race = raceOf(l)
  const parts: string[] = [race.id]
  if (race.sexed) parts.push(l.sex)
  parts.push(l.variant)
  if (race.tints) parts.push(l.tint)
  const style = styleSegment(styleFor(race.id, l.style))
  if (style) parts.push(style)
  return parts.join('.')
}

/** Lit une apparence ; tolère les anciennes valeurs (« female-b »), les modèles retirés et les valeurs invalides. */
export function parseLook(id: string | null | undefined): Look {
  if (!id) return { ...DEFAULT_LOOK }
  const legacy = /^(female|male)-([a-f])$/.exec(id)
  const parts = legacy ? ['human', legacy[1], legacy[2]] : id.split('.')
  // Le style, s'il y en a un, est le dernier segment (un style inconnu est ignoré).
  const style = isStyleSegment(parts[parts.length - 1]) ? parseStyle(parts.pop()!) : null
  const race = RACES.find((r) => r.id === parts[0])
  if (!race) return { ...DEFAULT_LOOK }
  const look: Look = { ...DEFAULT_LOOK, race: race.id, tint: race.tints?.[0].id ?? DEFAULT_LOOK.tint }
  let i = 1
  if (race.sexed) {
    if (parts[i] === 'female' || parts[i] === 'male') look.sex = parts[i] as Sex
    i++
  }
  const variants = variantsOf(race, look.sex)
  look.variant = variants.some((v) => v.id === parts[i]) ? parts[i] : variants[0].id
  i++
  if (race.tints?.some((t) => t.id === parts[i])) look.tint = parts[i]
  if (style && styleSegment(styleFor(race.id, style))) look.style = styleFor(race.id, style)
  return look
}

/** Apparence d'un nouveau joueur : une combinaison spatiale au hasard. */
export function randomLook(): Look {
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]
  const race = RACES.find((r) => r.id === 'suit')!
  const sex: Sex = Math.random() < 0.5 ? 'female' : 'male'
  return { race: race.id, sex, variant: pick(variantsOf(race, sex)).id, tint: pick(race.tints!).id }
}

// --------------------------------------------------------------- modèles

interface ModelSpec {
  path: string
  /** Hauteur visée (les packs n'ont pas la même échelle). */
  height: number
  hue?: number
  antennae?: boolean
  suit?: SuitStyle
  guardian?: GuardianStyle
  /** Projection holographique : le modèle tel quel, rendu en lumière (cf. hologram). */
  holo?: boolean
  /** Mini Character coiffé au Holo-Me : son modèle (« female-b ») et son style. */
  mini?: string
  style?: LookStyle
}

const GUARDIAN_MODELS: Record<string, string> = { a: 'g', b: 'h', c: 'd', s: 'o' }

const GUARDIAN_STYLES: Record<string, GuardianStyle> = {
  // Silhouette compacte et froide : le Gardien qui monte la garde devant l'obélisque.
  a: {
    ramp: [[0, '#061018'], [0.3, '#102b3c'], [0.58, '#356878'], [0.82, '#a8d2cf'], [1, '#e5f5e8']],
    light: '#5cf4ff',
    core: '#9bffe0',
    accent: '#86d7d4',
    dark: '#09202d',
    motif: 'sentinel',
  },
  // Palette minérale violette, avec une couronne de veilleur plus aérienne.
  b: {
    ramp: [[0, '#0c0b1a'], [0.3, '#211d42'], [0.58, '#514d82'], [0.82, '#b8b9e3'], [1, '#f1eaff']],
    light: '#b68cff',
    core: '#f2b8ff',
    accent: '#9f88df',
    dark: '#17132f',
    motif: 'watcher',
  },
  // Teintes rouillées et or : un Gardien abîmé, reconstruit autour d'un fragment d'obélisque.
  c: {
    ramp: [[0, '#160d0b'], [0.3, '#3a211d'], [0.58, '#765146'], [0.82, '#d2a37a'], [1, '#fff0c8']],
    light: '#ffb957',
    core: '#ffe49a',
    accent: '#d18a52',
    dark: '#2b1717',
    motif: 'exile',
  },
  // Blanc stellaire et or pâle : le plus rare, presque holographique.
  s: {
    ramp: [[0, '#080d16'], [0.3, '#1b3248'], [0.58, '#58819a'], [0.82, '#c6e1e3'], [1, '#fff8dc']],
    light: '#a9f6ff',
    core: '#fff2b0',
    accent: '#76b8d0',
    dark: '#102033',
    motif: 'archivist',
  },
}

/** Combinaisons repeintes au Holo-Me (une par teinte et couleurs : les matériaux se partagent). */
const paintedSuits = new Map<string, SuitStyle>()
function suitOf(tint: Tint, style: LookStyle): SuitStyle {
  const key = `${tint.id}|${style.paint}|${style.trim}`
  let s = paintedSuits.get(key)
  if (!s) paintedSuits.set(key, (s = paintSuit(tint.suit!, tint.trimAt ?? 0.87, style.paint, style.trim)))
  return s
}

function spec(l: Look): ModelSpec {
  const race = raceOf(l)
  const tint = race.tints?.find((t) => t.id === l.tint)
  const mini = { path: `characters/character-${l.sex}-${l.variant}.glb`, height: 0.67, mini: `${l.sex}-${l.variant}`, style: styleFor(race.id, l.style) }
  switch (race.id) {
    case 'human':
      return mini
    case 'suit':
      return { ...mini, suit: suitOf(tint ?? race.tints![0], mini.style) }
    case 'alien':
      return { ...mini, hue: tint?.hue ?? 95, antennae: true }
    case 'robot':
      return { path: `blocky/character-${l.variant}.glb`, height: 0.72 }
    case 'creature':
      return l.variant === 'orc' ? { path: 'creatures/character-orc.glb', height: 0.74 } : { path: `blocky/character-${l.variant}.glb`, height: 0.72 }
    case 'guardian':
      return { path: `blocky/character-${GUARDIAN_MODELS[l.variant] ?? 'g'}.glb`, height: 0.78, guardian: GUARDIAN_STYLES[l.variant] ?? GUARDIAN_STYLES.a }
    case 'holo':
      // Ni coiffure ni expression du Holo-Me : une projection montre le modèle, rien de plus.
      return { path: mini.path, height: mini.height, holo: true }
  }
}

export function lookPath(l: Look): string {
  return spec(l).path
}

export interface LookRig extends Rig {
  /** Hauteur du personnage (pour placer les bulles au-dessus de la tête). */
  height: number
  /** Visage des Mini Characters : les emotes y jouent une expression. */
  face?: FaceControl
}

/** Rotation de teinte (aliens) : les gris (yeux, dents, métal) restent neutres, le reste pivote et gagne un peu en saturation. */
function tinted(src: THREE.Texture, hue: number): THREE.Texture {
  return recolored(src, `hue:${hue}`, (hsl, c) => {
    if (hsl.s < 0.08) return
    c.setHSL((hsl.h + hue / 360) % 1, Math.min(1, hsl.s * 1.15), hsl.l, THREE.SRGBColorSpace)
  })
}

/**
 * Tons chair de la palette des Mini Characters (colormap 512×512) : les deux premières
 * colonnes de la rangée du milieu et les six dernières de la rangée du bas.
 */
function isSkin(x: number, y: number, size: number): boolean {
  const u = x / size, v = y / size
  return (v >= 0.75 && u >= 0.625) || (v >= 0.5 && v < 0.75 && u < 0.125)
}

/**
 * « Carte de dégradé » : la luminosité d'origine choisit une couleur du dégradé.
 * Les vêtements deviennent une combinaison qui garde les découpes du modèle (et son ombrage) ;
 * la peau devient des gants.
 */
function suitTexture(src: THREE.Texture, s: SuitStyle): THREE.Texture {
  const stops = s.ramp.map(([at, color]) => ({ at, color: new THREE.Color(color) }))
  const glove = new THREE.Color(s.glove)
  const size = (src.image as { width: number }).width
  return recolored(src, `suit:${JSON.stringify(s.ramp)}:${s.glove}`, (hsl, c, x, y) => {
    if (isSkin(x, y, size)) {
      c.copy(glove).multiplyScalar(0.75 + 0.35 * hsl.l)
      return
    }
    const l = THREE.MathUtils.clamp(hsl.l, 0, 1)
    let i = 0
    while (i < stops.length - 2 && l > stops[i + 1].at) i++
    const a = stops[i], b = stops[i + 1]
    c.copy(a.color).lerp(b.color, THREE.MathUtils.clamp((l - a.at) / (b.at - a.at), 0, 1))
  })
}

/** Repeint un Gardien en conservant le relief de la texture, avec un accent propre à sa variante. */
function guardianTexture(src: THREE.Texture, s: GuardianStyle): THREE.Texture {
  const stops = s.ramp.map(([at, color]) => ({ at, color: new THREE.Color(color) }))
  const glow = new THREE.Color(s.light)
  const accent = new THREE.Color(s.accent)
  return recolored(src, `guardian:${JSON.stringify(s.ramp)}:${s.accent}`, (hsl, c) => {
    const l = THREE.MathUtils.clamp(hsl.l, 0, 1)
    let i = 0
    while (i < stops.length - 2 && l > stops[i + 1].at) i++
    const a = stops[i], b = stops[i + 1]
    c.copy(a.color).lerp(b.color, THREE.MathUtils.clamp((l - a.at) / (b.at - a.at), 0, 1))
    // Les motifs colorés de la texture deviennent des veines minérales, tandis que les
    // aplats très clairs prennent une légère dominante de l'accent de la variante.
    if (hsl.s > 0.35 && hsl.l > 0.3) c.lerp(accent, 0.32)
    if (hsl.l > 0.78 && hsl.s > 0.18) c.lerp(glow, 0.14)
  })
}

/** Remplace (par une copie) le matériau d'un maillage, en le partageant entre maillages identiques. */
function retexture(mesh: THREE.Mesh, cache: Map<THREE.Material, THREE.Material>, map: (src: THREE.Texture) => THREE.Texture) {
  const src = mesh.material as THREE.MeshLambertMaterial
  let dst = cache.get(src)
  if (!dst) {
    const c = src.clone()
    if (src.map) c.map = map(src.map)
    cache.set(src, (dst = c))
  }
  mesh.material = dst
}

/** Deux antennes à boule lumineuse, accrochées à l'os de la tête. */
function addAntennae(root: THREE.Object3D) {
  const head = root.getObjectByName('head')
  if (!head) return
  const stem = new THREE.MeshLambertMaterial({ color: '#3a3f5e' })
  const glow = new THREE.MeshBasicMaterial({ color: '#d7ff6a' })
  for (const side of [-1, 1]) {
    const a = new THREE.Group()
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.13, 6), stem)
    s.position.y = 0.065
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), glow)
    b.position.y = 0.14
    a.add(s, b)
    a.position.set(side * 0.08, 0.3, 0)
    a.rotation.z = -side * 0.35
    head.add(a)
  }
}

/** Boîte englobante d'un maillage (pose de repos), exprimée dans le repère d'un os. */
export function boxInBone(mesh: THREE.Mesh, bone: THREE.Object3D): THREE.Box3 {
  mesh.geometry.computeBoundingBox()
  const world = mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld)
  const out = new THREE.Box3()
  const p = new THREE.Vector3()
  for (let i = 0; i < 8; i++) {
    p.set(i & 1 ? world.max.x : world.min.x, i & 2 ? world.max.y : world.min.y, i & 4 ? world.max.z : world.min.z)
    out.expandByPoint(bone.worldToLocal(p))
  }
  return out
}

const suitMaterials = new Map<SuitStyle, Record<'shell' | 'visor' | 'glass' | 'light' | 'dark', THREE.Material>>()

function suitMaterialsOf(s: SuitStyle) {
  let m = suitMaterials.get(s)
  if (!m) {
    m = {
      shell: new THREE.MeshLambertMaterial({ color: s.shell }),
      dark: new THREE.MeshLambertMaterial({ color: s.glove }),
      // Visière : légèrement lumineuse, pour se lire même dans les coins sombres.
      visor: new THREE.MeshLambertMaterial({ color: s.visor, emissive: s.visor, emissiveIntensity: 0.45 }),
      glass: new THREE.MeshLambertMaterial({ color: s.visor, emissive: s.visor, emissiveIntensity: 0.25, transparent: true, opacity: 0.3, depthWrite: false }),
      light: new THREE.MeshBasicMaterial({ color: s.light }),
    }
    suitMaterials.set(s, m)
  }
  return m
}

/** Casque, col et sac dorsal de la combinaison, accrochés aux os (ils suivent les animations). */
function addSuitGear(root: THREE.Object3D, s: SuitStyle) {
  const head = root.getObjectByName('head')
  const torso = root.getObjectByName('torso')
  const headMesh = root.getObjectByName('head-mesh') as THREE.Mesh | undefined
  const bodyMesh = root.getObjectByName('body-mesh') as THREE.Mesh | undefined
  if (!head || !torso || !headMesh || !bodyMesh) return
  root.updateMatrixWorld(true)
  const mat = suitMaterialsOf(s)
  const hb = boxInBone(headMesh, head)
  const size = hb.getSize(new THREE.Vector3())
  const center = hb.getCenter(new THREE.Vector3())

  // Col : anneau à la base de la tête.
  const collar = new THREE.Mesh(new THREE.TorusGeometry(size.x * 0.42, 0.035, 6, 20), mat.shell)
  collar.rotation.x = Math.PI / 2
  collar.position.set(center.x, hb.min.y + 0.02, center.z + size.z * 0.05)
  head.add(collar)

  if (s.helmet !== 'none') {
    // Coque un peu plus grande que la tête (coiffures comprises).
    const w = size.x * 1.1, h = size.y * 1.08, d = size.z * 1.1
    const shell = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.16), s.helmet === 'glass' ? mat.glass : mat.shell)
    shell.position.copy(center).setY(center.y + size.y * 0.03)
    head.add(shell)
    const front = shell.position.z + d / 2
    if (s.helmet === 'visor') {
      const visor = new THREE.Mesh(new RoundedBoxGeometry(w * 0.8, h * 0.46, 0.06, 2, 0.025), mat.visor)
      visor.position.set(center.x, shell.position.y - h * 0.04, front - 0.015)
      head.add(visor)
    } else {
      // Bulle : cerclage opaque en bas, pour qu'on la distingue.
      const rim = new THREE.Mesh(new RoundedBoxGeometry(w * 1.02, h * 0.12, d * 1.02, 1, 0.02), mat.shell)
      rim.position.copy(shell.position).setY(shell.position.y - h * 0.46)
      head.add(rim)
    }
    // Lampe frontale sur le côté du casque.
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.07), mat.light)
    lamp.position.set(center.x + w * 0.5, shell.position.y + h * 0.12, front - d * 0.2)
    head.add(lamp)

    // Sac dorsal (support vital), avec deux voyants.
    const bb = boxInBone(bodyMesh, torso)
    const pack = new THREE.Group()
    const box = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.26, 0.13, 1, 0.03), mat.shell)
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.14), mat.dark)
    band.position.y = -0.06
    pack.add(box, band)
    for (const x of [-0.08, 0.08]) {
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.02), mat.light)
      led.position.set(x, 0.05, -0.07)
      pack.add(led)
    }
    pack.position.set((bb.min.x + bb.max.x) / 2, bb.max.y - 0.14, bb.min.z - 0.03)
    torso.add(pack)
  }
}

/**
 * Ornements de Gardien : chaque variante reçoit une silhouette reconnaissable, un noyau
 * lumineux et des plaques d'armure. Tout est attaché aux os du modèle pour suivre les poses.
 */
function addGuardianGear(root: THREE.Object3D, s: GuardianStyle) {
  const stone = new THREE.MeshLambertMaterial({ color: s.ramp[s.ramp.length - 2][1] })
  const dark = new THREE.MeshLambertMaterial({ color: s.dark })
  const accent = new THREE.MeshLambertMaterial({ color: s.accent })
  const light = new THREE.MeshBasicMaterial({ color: s.light })
  const coreMat = new THREE.MeshBasicMaterial({ color: s.core })
  const head = root.getObjectByName('head') ?? root
  const torso = root.getObjectByName('torso') ?? root
  root.updateMatrixWorld(true)
  const bounds = (part: THREE.Object3D) => {
    const mesh = part as THREE.Mesh
    return mesh.isMesh ? boxInBone(mesh, part) : new THREE.Box3(new THREE.Vector3(-0.4, 0, -0.2), new THREE.Vector3(0.4, 1, 0.2))
  }
  const headBox = bounds(head)
  const headSize = headBox.getSize(new THREE.Vector3())
  const headCenter = headBox.getCenter(new THREE.Vector3())
  const torsoBox = bounds(torso)
  const torsoSize = torsoBox.getSize(new THREE.Vector3())
  const torsoCenter = torsoBox.getCenter(new THREE.Vector3())
  const front = (box: THREE.Box3) => box.max.z + box.getSize(new THREE.Vector3()).z * 0.025

  // Une couronne intégrée au contour du crâne, dimensionnée en coordonnées locales du modèle.
  const crown = new THREE.Group()
  const crownY = headBox.max.y + headSize.y * 0.035
  const crownZ = headCenter.z
  const crownWidth = headSize.x * 0.76
  if (s.motif === 'watcher') {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(crownWidth * 0.42, headSize.x * 0.035, 5, 10), light)
    halo.position.set(0, crownY + headSize.y * 0.11, crownZ - headSize.z * 0.15)
    crown.add(halo)
    for (const side of [-1, 1]) {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(headSize.x * 0.13, 0), accent)
      shard.position.set(side * crownWidth * 0.55, crownY, crownZ)
      crown.add(shard)
    }
  } else if (s.motif === 'exile') {
    const obelisk = new THREE.Mesh(new THREE.ConeGeometry(headSize.x * 0.16, headSize.y * 0.34, 4), light)
    obelisk.position.set(0, crownY + headSize.y * 0.13, crownZ + headSize.z * 0.08)
    obelisk.rotation.z = -0.08
    crown.add(obelisk)
    for (const side of [-1, 1]) {
      const shard = new THREE.Mesh(new THREE.ConeGeometry(headSize.x * 0.09, headSize.y * 0.2, 4), accent)
      shard.position.set(side * crownWidth * 0.38, crownY + headSize.y * 0.03, crownZ)
      shard.rotation.z = side * 0.3
      crown.add(shard)
    }
  } else if (s.motif === 'archivist') {
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(crownWidth * (0.3 + i * 0.1), headSize.x * 0.025, 4, 16), i === 1 ? light : accent)
      ring.position.set(0, crownY + headSize.y * (0.07 + i * 0.035), crownZ - headSize.z * 0.12)
      ring.rotation.y = (i - 1) * 0.24
      crown.add(ring)
    }
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(headSize.x * 0.15, 0), coreMat)
    crystal.position.set(0, crownY + headSize.y * 0.28, crownZ)
    crown.add(crystal)
  } else {
    for (let i = 0; i < 5; i++) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(headSize.x * 0.1, headSize.y * (i === 2 ? 0.32 : 0.23), 4), i === 2 ? light : stone)
      tooth.position.set((i - 2) * crownWidth * 0.23, crownY + headSize.y * 0.1 - Math.abs(i - 2) * headSize.y * 0.015, crownZ)
      tooth.rotation.z = (i - 2) * -0.15
      crown.add(tooth)
    }
  }
  head.add(crown)

  // Cuirasse en trois plaques, bord lumineux et cristal central.
  const plateW = torsoSize.x * 0.72
  const plateH = torsoSize.y * 0.43
  const plateY = torsoCenter.y + torsoSize.y * 0.04
  const plateZ = front(torsoBox)
  const backing = new THREE.Mesh(new RoundedBoxGeometry(plateW * 1.08, plateH * 1.08, torsoSize.z * 0.1, 2, Math.min(plateW, plateH) * 0.12), dark)
  backing.position.set(torsoCenter.x, plateY, plateZ)
  torso.add(backing)
  const chest = new THREE.Mesh(new RoundedBoxGeometry(plateW, plateH, torsoSize.z * 0.08, 2, Math.min(plateW, plateH) * 0.13), accent)
  chest.position.set(torsoCenter.x, plateY, plateZ + torsoSize.z * 0.06)
  torso.add(chest)
  const inset = new THREE.Mesh(new RoundedBoxGeometry(plateW * 0.72, plateH * 0.66, torsoSize.z * 0.055, 2, Math.min(plateW, plateH) * 0.1), stone)
  inset.position.set(torsoCenter.x, plateY, plateZ + torsoSize.z * 0.12)
  torso.add(inset)
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(Math.min(plateW, plateH) * 0.19, 0), coreMat)
  core.position.set(torsoCenter.x, plateY, plateZ + torsoSize.z * 0.2)
  torso.add(core)
  const band = new THREE.Mesh(new THREE.TorusGeometry(Math.min(plateW, plateH) * 0.27, torsoSize.x * 0.018, 5, 20), light)
  band.position.copy(core.position)
  torso.add(band)

  // Épaulettes et brassards suivent leurs membres, avec genouillères et grèves assorties.
  for (const side of [-1, 1]) {
    const arm = root.getObjectByName(side < 0 ? 'arm-right' : 'arm-left')
    if (arm) {
      const b = bounds(arm), size = b.getSize(new THREE.Vector3()), center = b.getCenter(new THREE.Vector3())
      const shoulder = new THREE.Mesh(new RoundedBoxGeometry(size.x * 0.92, size.y * 0.3, size.z * 0.92, 1, Math.min(size.x, size.z) * 0.18), stone)
      shoulder.position.set(center.x, b.max.y - size.y * 0.12, center.z)
      arm.add(shoulder)
      const bracerDepth = size.z * 0.22
      const bracer = new THREE.Mesh(new RoundedBoxGeometry(size.x * 0.82, size.y * 0.32, bracerDepth, 1, Math.min(size.x, bracerDepth) * 0.15), accent)
      bracer.position.set(center.x, b.min.y + size.y * 0.28, front(b) + bracerDepth * 0.48)
      arm.add(bracer)
      const stud = new THREE.Mesh(new THREE.OctahedronGeometry(Math.min(size.x, size.z) * 0.16, 0), light)
      stud.position.set(center.x, bracer.position.y, bracer.position.z + bracerDepth * 0.55)
      arm.add(stud)
    }
    const leg = root.getObjectByName(side < 0 ? 'leg-right' : 'leg-left')
    if (leg) {
      const b = bounds(leg), size = b.getSize(new THREE.Vector3()), center = b.getCenter(new THREE.Vector3())
      const plateDepth = size.z * 0.22
      const knee = new THREE.Mesh(new RoundedBoxGeometry(size.x * 0.82, size.y * 0.2, plateDepth, 1, Math.min(size.x, plateDepth) * 0.16), accent)
      knee.position.set(center.x, b.min.y + size.y * 0.7, front(b) + plateDepth * 0.48)
      leg.add(knee)
      const shinDepth = size.z * 0.18
      const shin = new THREE.Mesh(new RoundedBoxGeometry(size.x * 0.74, size.y * 0.3, shinDepth, 1, Math.min(size.x, shinDepth) * 0.14), dark)
      shin.position.set(center.x, b.min.y + size.y * 0.3, front(b) + shinDepth * 0.48)
      leg.add(shin)
      const rune = new THREE.Mesh(new THREE.BoxGeometry(size.x * 0.12, size.y * 0.18, size.z * 0.06), light)
      rune.position.set(center.x, shin.position.y, shin.position.z + shinDepth * 0.52)
      leg.add(rune)
    }
  }
}

// --------------------------------------------------------------- hologramme

/** Bleu d'une projection du Holo-Me, du plus sombre (les creux du modèle) au plus clair. */
const HOLO_RAMP: [number, THREE.Color][] = [[0, new THREE.Color('#0d4f78')], [0.45, new THREE.Color('#2aa9d8')], [0.8, new THREE.Color('#7fe9ff')], [1, new THREE.Color('#e9fdff')]]

/** La texture du modèle, réduite à sa lumière : ses couleurs deviennent des nuances de bleu. */
function holoTexture(src: THREE.Texture): THREE.Texture {
  return recolored(src, 'holo', (hsl, c) => {
    const l = THREE.MathUtils.clamp(hsl.l, 0, 1)
    let i = 0
    while (i < HOLO_RAMP.length - 2 && l > HOLO_RAMP[i + 1][0]) i++
    const [a0, a] = HOLO_RAMP[i], [b0, b] = HOLO_RAMP[i + 1]
    c.copy(a).lerp(b, THREE.MathUtils.clamp((l - a0) / (b0 - a0), 0, 1))
  })
}

/** Matériaux de projection, un par texture d'origine : toutes les projections les partagent. */
const holoMaterials = new Map<THREE.Texture | null, THREE.Material>()

/**
 * Matériau d'une projection : insensible à l'éclairage, translucide, strié de lignes de balayage
 * qui montent, traversé de temps en temps par une bande plus claire, et qui grésille un peu.
 * Les lignes sont celles de l'écran : elles ne suivent pas les gestes, comme sur un vrai projecteur.
 */
function holoMaterial(src: THREE.MeshLambertMaterial): THREE.Material {
  const key = src.map ?? null
  let m = holoMaterials.get(key)
  if (m) return m
  const basic = new THREE.MeshBasicMaterial({ map: src.map ? holoTexture(src.map) : null, color: src.map ? '#ffffff' : '#7fe9ff', transparent: true, opacity: 0.92, side: src.side })
  basic.toneMapped = false
  basic.onBeforeCompile = (shader) => {
    shader.uniforms.uHoloTime = holoTime
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uHoloTime;')
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        float holoScan = 0.5 + 0.5 * sin(gl_FragCoord.y * 1.7 - uHoloTime * 6.0);
        float holoSweep = smoothstep(0.985, 1.0, sin(gl_FragCoord.y * 0.011 - uHoloTime * 1.3));
        float holoFlicker = 0.93 + 0.07 * sin(uHoloTime * 43.0) * sin(uHoloTime * 17.3);
        gl_FragColor.rgb = gl_FragColor.rgb * 1.15 + vec3(0.35, 0.55, 0.6) * holoSweep;
        gl_FragColor.a *= (0.6 + 0.4 * holoScan) * holoFlicker;`,
      )
  }
  holoMaterials.set(key, (m = basic))
  return m
}

/** Halo au sol d'une projection : l'anneau du projecteur, qui la suit. */
const holoRing = new THREE.MeshBasicMaterial({ color: '#6fe8ff', transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false })

/**
 * Fait d'un personnage une projection du Holo-Me : chaque matériau devient de la lumière, plus
 * d'ombre portée (la lumière n'en fait pas), et un anneau lumineux sous ses pieds. `scale` :
 * l'échelle du modèle, pour que l'anneau garde sa taille.
 */
function hologram(root: THREE.Object3D, scale: number) {
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    m.material = holoMaterial(m.material as THREE.MeshLambertMaterial)
    m.castShadow = false
  })
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.23, 28), holoRing)
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.012 / scale
  ring.scale.setScalar(1 / scale)
  ring.renderOrder = 1
  root.add(ring)
}

/** Instancie le modèle animé d'une apparence (mis à l'échelle, teinté, accessoirisé). */
export function lookRig(l: Look): Promise<LookRig> {
  return buildRig(spec(l))
}

/**
 * Personnage en combinaison d'un style hors garde-robe (les PNJ de l'équipage, cf. patrol.ts),
 * sur un Mini Character ; `style` : sa coiffure et son expression, façon Holo-Me (Kael, cf. scavengers.ts).
 */
export function suitRig(sex: Sex, variant: string, suit: SuitStyle, style?: LookStyle): Promise<LookRig> {
  return buildRig({ path: `characters/character-${sex}-${variant}.glb`, height: 0.67, suit, ...(style ? { mini: `${sex}-${variant}`, style } : {}) })
}

async function buildRig(s: ModelSpec): Promise<LookRig> {
  const r = await rig(s.path)
  // Mise à l'échelle commune : chaque pack a sa propre unité.
  r.root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(r.root)
  const h = box.max.y - box.min.y
  if (h > 0 && Math.abs(h - s.height) > 0.02) r.root.scale.multiplyScalar(s.height / h)
  const cache = new Map<THREE.Material, THREE.Material>()
  r.root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    if (s.hue !== undefined) retexture(m, cache, (t) => tinted(t, s.hue!))
    // Combinaison : seul le corps change, le visage reste celui du modèle.
    else if (s.suit && m.name === 'body-mesh') retexture(m, cache, (t) => suitTexture(t, s.suit!))
    else if (s.guardian && (m.material as THREE.MeshLambertMaterial).map) retexture(m, cache, (t) => guardianTexture(t, s.guardian!))
  })
  // Coiffure et visage d'abord : le casque se taille sur la tête coiffée.
  const face = s.mini && s.style ? await applyStyle(r.root, s.mini, s.style, s.suit?.helmet === 'visor') : undefined
  if (s.antennae) addAntennae(r.root)
  if (s.suit) addSuitGear(r.root, s.suit)
  if (s.guardian) addGuardianGear(r.root, s.guardian)
  if (s.holo) hologram(r.root, r.root.scale.x)
  return { ...r, face, height: s.height + (s.suit && s.suit.helmet !== 'none' ? 0.05 : 0) + (s.guardian ? 0.08 : 0) }
}
