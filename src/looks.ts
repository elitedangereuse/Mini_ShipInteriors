import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { rig, type Rig } from './assets'
import { tr } from './i18n'
import type { IconName } from './icons'
import { recolored } from './recolor'

/**
 * Catalogue des apparences proposées par la garde-robe.
 * Une apparence s'écrit sous forme de chaîne (« human.female.b », « suit.male.c.artemis »,
 * « alien.male.c.blue », « robot.g »…) : c'est ce qui est sauvegardé et envoyé aux autres joueurs.
 */

export type RaceId = 'human' | 'suit' | 'alien' | 'robot' | 'creature' | 'guardian'
export type Sex = 'female' | 'male'

export interface Look {
  race: RaceId
  sex: Sex
  variant: string
  tint: string
}

interface Choice {
  id: string
  label: string
  /** Modèle propre à un sexe (les Mini Characters diffèrent d'un sexe à l'autre). */
  sex?: Sex
}

/** Combinaison spatiale : couleurs du corps et du casque. */
interface SuitStyle {
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
}

interface Tint extends Choice {
  swatch: string
  /** Alien : rotation de teinte de toute la texture. */
  hue?: number
  suit?: SuitStyle
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
  return parts.join('.')
}

/** Lit une apparence ; tolère les anciennes valeurs (« female-b »), les modèles retirés et les valeurs invalides. */
export function parseLook(id: string | null | undefined): Look {
  if (!id) return { ...DEFAULT_LOOK }
  const legacy = /^(female|male)-([a-f])$/.exec(id)
  const parts = legacy ? ['human', legacy[1], legacy[2]] : id.split('.')
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
}

const GUARDIAN_MODELS: Record<string, string> = { a: 'g', b: 'h', c: 'd', s: 'o' }

const GUARDIAN_STYLE: GuardianStyle = {
  ramp: [
    [0, '#071018'],
    [0.32, '#163044'],
    [0.58, '#466f7a'],
    [0.82, '#b7cfc7'],
    [1, '#ecf3dc'],
  ],
  light: '#54f5ff',
  core: '#8cffd4',
}

function spec(l: Look): ModelSpec {
  const race = raceOf(l)
  const tint = race.tints?.find((t) => t.id === l.tint)
  switch (race.id) {
    case 'human':
      return { path: `characters/character-${l.sex}-${l.variant}.glb`, height: 0.67 }
    case 'suit':
      return { path: `characters/character-${l.sex}-${l.variant}.glb`, height: 0.67, suit: (tint ?? race.tints![0]).suit }
    case 'alien':
      return { path: `characters/character-${l.sex}-${l.variant}.glb`, height: 0.67, hue: tint?.hue ?? 95, antennae: true }
    case 'robot':
      return { path: `blocky/character-${l.variant}.glb`, height: 0.72 }
    case 'creature':
      return l.variant === 'orc' ? { path: 'creatures/character-orc.glb', height: 0.74 } : { path: `blocky/character-${l.variant}.glb`, height: 0.72 }
    case 'guardian':
      return { path: `blocky/character-${GUARDIAN_MODELS[l.variant] ?? 'g'}.glb`, height: 0.78, guardian: GUARDIAN_STYLE }
  }
}

export function lookPath(l: Look): string {
  return spec(l).path
}

export interface LookRig extends Rig {
  /** Hauteur du personnage (pour placer les bulles au-dessus de la tête). */
  height: number
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

/** Teinte froide de Gardien : pierre claire, joints bleus et zones lumineuses cyan. */
function guardianTexture(src: THREE.Texture, s: GuardianStyle): THREE.Texture {
  const stops = s.ramp.map(([at, color]) => ({ at, color: new THREE.Color(color) }))
  const glow = new THREE.Color(s.light)
  return recolored(src, `guardian:${JSON.stringify(s.ramp)}`, (hsl, c) => {
    const l = THREE.MathUtils.clamp(hsl.l, 0, 1)
    let i = 0
    while (i < stops.length - 2 && l > stops[i + 1].at) i++
    const a = stops[i], b = stops[i + 1]
    c.copy(a.color).lerp(b.color, THREE.MathUtils.clamp((l - a.at) / (b.at - a.at), 0, 1))
    if (hsl.s > 0.45 && hsl.l > 0.45) c.lerp(glow, 0.35)
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
function boxInBone(mesh: THREE.Mesh, bone: THREE.Object3D): THREE.Box3 {
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

/** Ornements de Gardien : couronne et noyau lumineux, attachés aux os si le modèle en expose. */
function addGuardianGear(root: THREE.Object3D, s: GuardianStyle) {
  const stone = new THREE.MeshLambertMaterial({ color: '#d8e2d6' })
  const dark = new THREE.MeshLambertMaterial({ color: '#123044' })
  const light = new THREE.MeshBasicMaterial({ color: s.light })
  const coreMat = new THREE.MeshBasicMaterial({ color: s.core })
  const head = root.getObjectByName('head') ?? root
  const torso = root.getObjectByName('torso') ?? root

  const crown = new THREE.Group()
  for (let i = 0; i < 5; i++) {
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.035, i === 2 ? 0.2 : 0.15, 4), i === 2 ? light : stone)
    tooth.position.set((i - 2) * 0.055, 0.05 - Math.abs(i - 2) * 0.015, -0.02)
    tooth.rotation.z = (i - 2) * -0.18
    crown.add(tooth)
  }
  crown.position.set(0, 0.37, 0.01)
  head.add(crown)

  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), coreMat)
  core.position.set(0, 0.02, 0.18)
  torso.add(core)
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 4, 18), light)
  band.position.copy(core.position)
  band.rotation.x = Math.PI / 2
  torso.add(band)

  for (const side of [-1, 1]) {
    const vane = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.18, 0.025), dark)
    vane.position.set(side * 0.18, 0.08, 0.12)
    vane.rotation.z = side * -0.35
    torso.add(vane)
  }
}

/** Instancie le modèle animé d'une apparence (mis à l'échelle, teinté, accessoirisé). */
export async function lookRig(l: Look): Promise<LookRig> {
  const s = spec(l)
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
  if (s.antennae) addAntennae(r.root)
  if (s.suit) addSuitGear(r.root, s.suit)
  if (s.guardian) addGuardianGear(r.root, s.guardian)
  return { ...r, height: s.height + (s.suit && s.suit.helmet !== 'none' ? 0.05 : 0) + (s.guardian ? 0.08 : 0) }
}
