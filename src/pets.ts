import * as THREE from 'three'
import { rig, type Rig } from './assets'
import { tr } from './i18n'
import { recolored, type HSL } from './recolor'

/*
 * Compagnons des quartiers (Cube Pets de Kenney, comme Comète) : chaque animal adopté a son
 * panier, un objet du catalogue (« pet-chien »…) dont la variante est la robe. Le panier est un
 * meuble ; l'animal, lui, vit à côté (cf. main.ts) et se promène dans les quartiers.
 */

/** Cri d'un animal, synthétisé (cf. Sound.critter). */
export type Voice = 'meow' | 'bark' | 'yip' | 'squeak' | 'chirp' | 'grunt' | 'honk' | 'roar' | 'buzz' | 'moo' | 'trumpet' | 'click'

/** Le panier : un coussin, ou ce qui convient mieux à l'espèce. */
export type Home = 'cushion' | 'perch' | 'hive' | 'leaf' | 'straw' | 'ice' | 'sand' | 'lodge' | 'bamboo'

export interface Species {
  id: string
  /** Modèle du pack (public/assets/pets/animal-<model>.glb). */
  model: string
  label: string
  /** Nom de l'animal, un clin d'œil à Elite ; le même dans les deux langues. */
  name: string
  scale: number
  voice: Voice
  /** Ce qu'il dit, au hasard ; le dernier quand on le caresse. */
  says: string[]
  home: Home
}

export const SPECIES: Species[] = [
  { id: 'chat', model: 'cat', label: tr('Chat', 'Cat'), name: 'Nova', scale: 0.26, voice: 'meow', home: 'cushion', says: [tr('Miaou ?', 'Meow?'), tr('Mrrrou…', 'Purrr…')] },
  { id: 'chien', model: 'dog', label: tr('Chien', 'Dog'), name: 'Jameson', scale: 0.27, voice: 'bark', home: 'cushion', says: [tr('Wouf !', 'Woof!'), tr('Wouf wouf !', 'Woof woof!')] },
  { id: 'renard', model: 'fox', label: tr('Renard', 'Fox'), name: 'Farseer', scale: 0.26, voice: 'yip', home: 'cushion', says: [tr('Yip ?', 'Yip?'), tr('Yip yip !', 'Yip yip!')] },
  { id: 'lapin', model: 'bunny', label: tr('Lapin', 'Bunny'), name: 'Lave', scale: 0.24, voice: 'squeak', home: 'straw', says: [tr('*renifle*', '*sniff*'), tr('*remue le nez*', '*twitches nose*')] },
  { id: 'panda', model: 'panda', label: 'Panda', name: 'Bambou', scale: 0.28, voice: 'grunt', home: 'bamboo', says: [tr('Mmmh…', 'Mmmh…'), tr('*mâchouille*', '*munch*')] },
  { id: 'manchot', model: 'penguin', label: tr('Manchot', 'Penguin'), name: 'Hutton', scale: 0.25, voice: 'honk', home: 'ice', says: [tr('Couac !', 'Honk!'), tr('Couac couac !', 'Honk honk!')] },
  { id: 'koala', model: 'koala', label: 'Koala', name: 'Colonia', scale: 0.26, voice: 'grunt', home: 'cushion', says: [tr('Grrmf…', 'Grrmf…'), tr('*bâille*', '*yawns*')] },
  { id: 'singe', model: 'monkey', label: tr('Singe', 'Monkey'), name: 'Achenar', scale: 0.26, voice: 'chirp', home: 'cushion', says: [tr('Hou hou !', 'Ooh ooh!'), tr('Hi hi hi !', 'Eee eee!')] },
  { id: 'perroquet', model: 'parrot', label: tr('Perroquet', 'Parrot'), name: 'Felicity', scale: 0.24, voice: 'chirp', home: 'perch', says: [tr('o7 ! o7 !', 'o7! o7!'), tr('Coco veut du café !', 'Polly wants a coffee!')] },
  { id: 'poussin', model: 'chick', label: tr('Poussin', 'Chick'), name: 'Sirius', scale: 0.2, voice: 'chirp', home: 'straw', says: [tr('Piou !', 'Peep!'), tr('Piou piou !', 'Peep peep!')] },
  { id: 'cochon', model: 'pig', label: tr('Cochon', 'Pig'), name: 'Leesti', scale: 0.27, voice: 'grunt', home: 'straw', says: [tr('Groin !', 'Oink!'), tr('Groin groin !', 'Oink oink!')] },
  { id: 'ours', model: 'polar', label: tr('Ours polaire', 'Polar bear'), name: 'Maia', scale: 0.3, voice: 'roar', home: 'ice', says: [tr('Grrr…', 'Grrr…'), tr('*câlin*', '*hug*')] },
  { id: 'tigre', model: 'tiger', label: tr('Tigre', 'Tiger'), name: 'Duval', scale: 0.29, voice: 'roar', home: 'cushion', says: [tr('Rrraou !', 'Rrrawr!'), tr('Mrrrou…', 'Purrr…')] },
  { id: 'lion', model: 'lion', label: 'Lion', name: 'Arissa', scale: 0.29, voice: 'roar', home: 'cushion', says: [tr('Roaaar !', 'Roaaar!'), tr('Mrrrou…', 'Purrr…')] },
  { id: 'castor', model: 'beaver', label: tr('Castor', 'Beaver'), name: 'Jaques', scale: 0.26, voice: 'click', home: 'lodge', says: [tr('Tchk tchk !', 'Chk chk!'), tr('*ronge*', '*gnaws*')] },
  { id: 'abeille', model: 'bee', label: tr('Abeille', 'Bee'), name: 'Mérope', scale: 0.2, voice: 'buzz', home: 'hive', says: [tr('Bzzz…', 'Bzzz…'), tr('Bzz bzz !', 'Bzz bzz!')] },
  { id: 'chenille', model: 'caterpillar', label: tr('Chenille', 'Caterpillar'), name: 'Anaconda', scale: 0.22, voice: 'squeak', home: 'leaf', says: [tr('…', '…'), tr('*se tortille*', '*wiggles*')] },
  { id: 'vache', model: 'cow', label: tr('Vache', 'Cow'), name: 'Beluga', scale: 0.3, voice: 'moo', home: 'straw', says: [tr('Meuh !', 'Moo!'), tr('Meuuuh…', 'Mooo…')] },
  { id: 'crabe', model: 'crab', label: tr('Crabe', 'Crab'), name: 'Scarab', scale: 0.22, voice: 'click', home: 'sand', says: [tr('Clic clac !', 'Click clack!'), tr('*pince doucement*', '*gentle pinch*')] },
  { id: 'cerf', model: 'deer', label: tr('Cerf', 'Deer'), name: 'Diamondback', scale: 0.28, voice: 'honk', home: 'straw', says: [tr('Brâââme !', 'Bellow!'), tr('*frotte ses bois*', '*rubs antlers*')] },
  { id: 'elephant', model: 'elephant', label: tr('Éléphant', 'Elephant'), name: 'Cutter', scale: 0.32, voice: 'trumpet', home: 'straw', says: [tr('Pouuu !', 'Toot!'), tr('*barrit doucement*', '*soft trumpet*')] },
  { id: 'girafe', model: 'giraffe', label: tr('Girafe', 'Giraffe'), name: 'Dolphin', scale: 0.3, voice: 'grunt', home: 'straw', says: [tr('Mmm ?', 'Mmm?'), tr('*mâchonne*', '*chews*')] },
  { id: 'sanglier', model: 'hog', label: tr('Sanglier', 'Boar'), name: 'Mamba', scale: 0.27, voice: 'grunt', home: 'straw', says: [tr('Grouik !', 'Snort!'), tr('*fouille le sol*', '*roots around*')] },
]

const BY_ID = new Map(SPECIES.map((s) => [s.id, s]))

export const speciesOf = (id: string | undefined): Species | undefined => (id ? BY_ID.get(id) : undefined)

/** Identifiant de l'objet « panier » d'une espèce, dans le catalogue et l'aménagement. */
export const petItemId = (s: Species) => `pet-${s.id}`
export const speciesOfItem = (m: string): Species | undefined => (m.startsWith('pet-') ? BY_ID.get(m.slice(4)) : undefined)

// ---------------------------------------------------------------- robes

/**
 * Robe : on repeint le pelage (la texture de palette partagée par tout le pack), en gardant
 * le noir des yeux, le blanc de leur reflet et le rose des museaux.
 */
interface Coat {
  id: string
  label: string
  swatch: string
  paint?: (hsl: HSL, c: THREE.Color) => void
}

const deg = (d: number) => d / 360

export const COATS: Coat[] = [
  { id: 'nature', label: tr('Nature', 'Natural'), swatch: '#c98a4a' },
  { id: 'nuit', label: tr('Nuit', 'Night'), swatch: '#34323c', paint: (h, c) => c.setHSL(h.h, h.s * 0.35, 0.1 + h.l * 0.28, THREE.SRGBColorSpace) },
  { id: 'neige', label: tr('Neige', 'Snow'), swatch: '#eef0f6', paint: (h, c) => c.setHSL(h.h, h.s * 0.18, 0.66 + h.l * 0.32, THREE.SRGBColorSpace) },
  { id: 'or', label: tr('Or', 'Gold'), swatch: '#e8b33a', paint: (h, c) => c.setHSL(deg(40), Math.max(h.s, 0.62), 0.28 + h.l * 0.5, THREE.SRGBColorSpace) },
  { id: 'cosmique', label: tr('Cosmique', 'Cosmic'), swatch: '#7a5ad8', paint: (h, c) => c.setHSL(deg(262), Math.max(h.s, 0.55), 0.22 + h.l * 0.5, THREE.SRGBColorSpace) },
  { id: 'menthe', label: tr('Menthe', 'Mint'), swatch: '#5fcf9f', paint: (h, c) => c.setHSL(deg(155), Math.max(h.s, 0.45), 0.25 + h.l * 0.5, THREE.SRGBColorSpace) },
]

export const coatOf = (id: string | undefined): Coat => COATS.find((c) => c.id === id) ?? COATS[0]

/** Yeux (noirs), reflets (blancs purs) et museaux roses ne changent pas avec la robe. */
function keeps(h: HSL): boolean {
  if (h.l < 0.12 || (h.l > 0.95 && h.s < 0.2)) return true
  const hue = h.h * 360
  return h.s > 0.5 && h.l > 0.55 && (hue > 300 || hue < 8)
}

const painted = new Map<string, THREE.MeshLambertMaterial>()

/** L'animal d'une espèce, dans sa robe (modèle animé, matériau propre à la robe). */
export async function petRig(species: Species, coat: string | undefined): Promise<Rig> {
  const r = await rig(`pets/animal-${species.model}.glb`)
  const c = coatOf(coat)
  if (c.paint) {
    const paint = c.paint
    r.root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const src = mesh.material as THREE.MeshLambertMaterial
      if (!src.map) return
      const key = `${src.uuid}:${c.id}`
      let m = painted.get(key)
      if (!m) {
        m = src.clone()
        m.map = recolored(src.map, `coat:${c.id}`, (h, col) => {
          if (!keeps(h)) paint(h, col)
        })
        painted.set(key, m)
      }
      mesh.material = m
    })
  }
  return r
}

/** Hauteur où l'animal se tient sur son panier (vignettes du catalogue). */
const PERCH: Partial<Record<Home, number>> = { cushion: 0.07, bamboo: 0.07, perch: 0.545, hive: 0.35, ice: 0.05, sand: 0.058 }

/** L'animal debout sur son panier, pour la vignette d'un panier (`label` : « espèce|robe »). */
export async function petPreview(label: string | undefined): Promise<THREE.Object3D | null> {
  const [id, coat] = (label ?? '').split('|')
  const species = speciesOf(id)
  if (!species) return null
  const r = await petRig(species, coat)
  r.root.scale.setScalar(species.scale)
  r.root.position.y = PERCH[species.home] ?? 0.03
  r.root.rotation.y = 0.35
  return r.root
}
