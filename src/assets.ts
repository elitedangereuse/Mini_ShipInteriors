import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import { recolored } from './recolor'

export const BASE = import.meta.env.BASE_URL + 'assets/'

const loader = new GLTFLoader()
const cache = new Map<string, GLTF>()
const pending = new Map<string, Promise<GLTF>>()

/** Modèles du Space Station Kit (Kenney, CC0) utilisés par les ponts. */
export const STATION_MODELS = [
  'floor', 'floor-detail', 'floor-panel', 'floor-panel-straight',
  'wall', 'wall-detail', 'wall-window', 'wall-switch', 'wall-pillar', 'wall-door', 'wall-door-edge', 'wall-corner',
  'door-single', 'door-double',
  'bed-single', 'bed-double', 'chair', 'chair-cushion', 'chair-armrest-headrest',
  'computer', 'computer-screen', 'computer-system', 'computer-wide',
  'container', 'container-tall', 'container-wide', 'container-flat',
  'table', 'table-large', 'table-display', 'table-display-planet', 'table-display-small', 'table-inset',
  'display-wall', 'display-wall-wide',
  'pipe', 'pipe-bend', 'pipe-ring-colored', 'pipe-end-colored',
  'structure', 'structure-barrier', 'structure-panel',
  'skip', 'skip-rocks', 'rocks',
] as const

export type StationModel = (typeof STATION_MODELS)[number]

export const CAT_MODEL = 'pets/animal-cat.glb'

/**
 * Sélection du Furniture Kit (Kenney, CC0), en un seul fichier : un nœud racine par modèle (cf.
 * scripts/import-kenney-furniture.mjs et src/furniture/kenney.ts).
 */
export const FURNITURE_PACK = 'furniture/kenney-furniture.glb'

/** Tous les modèles du kit utilisent la même texture : un seul matériau partagé. */
export let stationMaterial: THREE.MeshLambertMaterial

/**
 * Chaque pont a son ambiance : la même palette du kit, repeinte différemment pour la coque
 * (sols, murs, portes) et pour le mobilier.
 * - station : la coque d'origine, le mobilier aux couleurs d'Elite (acier sombre, écrans orange) ;
 * - raw : la cale, acier noirci et rouillé, jaune de chantier, écrans ambrés ;
 * - cozy : les quartiers, crème et bois miel, tissus terre cuite et bleu canard.
 * Les teintes rares (voyants verts et rouges, roches) ne changent pas.
 */
export type Theme = 'station' | 'raw' | 'cozy'

export interface ThemeMaterials {
  /** Sols, murs, portes, poteaux. */
  shell: THREE.MeshLambertMaterial
  /** Mobilier du kit. */
  furniture: THREE.MeshLambertMaterial
}

export const themes = {} as Record<Theme, ThemeMaterials>

/**
 * Sols repeints d'une pièce, quel que soit le thème du pont (cf. `floorFinish` dans levels.ts) :
 * l'acier brossé argenté du hangar, qui accroche la lumière des projecteurs.
 */
export type FloorFinish = 'silver'
export const floorFinishes = {} as Record<FloorFinish, THREE.Material>

type Paint = (hsl: { h: number; s: number; l: number }, c: THREE.Color) => void

const deg = (d: number) => d / 360
const set = (c: THREE.Color, h: number, s: number, l: number) => c.setHSL(deg(h), s, THREE.MathUtils.clamp(l, 0, 1), THREE.SRGBColorSpace)

/** Classe une couleur de la palette : acier (gris bleutés, blancs), accent chaud (jaunes, oranges vifs), écran (bleus). */
function kind(hsl: { h: number; s: number }): 'steel' | 'accent' | 'screen' | null {
  const h = hsl.h * 360
  if (hsl.s < 0.08 || (hsl.s < 0.5 && h > 200 && h < 260)) return 'steel'
  if (hsl.s > 0.85 && h > 10 && h < 55) return 'accent'
  if (hsl.s >= 0.5 && h > 195 && h < 230) return 'screen'
  return null
}

/** Repeint selon la classe de la couleur ; chaque fonction reçoit la luminosité d'origine. */
const paint = (rules: Partial<Record<'steel' | 'accent' | 'screen', (l: number, c: THREE.Color) => void>>): Paint => (hsl, c) => {
  const k = kind(hsl)
  if (k) rules[k]?.(hsl.l, c)
}

const PAINTS: Record<Theme, { shell?: Paint; furniture: Paint }> = {
  station: {
    furniture: paint({
      steel: (l, c) => set(c, 215, 0.09, 0.1 + l * 0.42),
      accent: (l, c) => set(c, 25, 1, l * 0.92),
      screen: (l, c) => set(c, 28, 1, 0.36 + (l - 0.55) * 0.9),
    }),
  },
  raw: {
    shell: paint({
      steel: (l, c) => set(c, 30, 0.1, 0.07 + l * 0.36),
      accent: (l, c) => set(c, 44, 0.88, l * 0.82),
      screen: (l, c) => set(c, 205, 0.25, 0.12 + l * 0.25),
    }),
    furniture: paint({
      steel: (l, c) => set(c, 28, 0.08, 0.08 + l * 0.4),
      accent: (l, c) => set(c, 40, 0.9, l * 0.85),
      screen: (l, c) => set(c, 32, 1, 0.34 + (l - 0.55) * 0.85),
    }),
  },
  cozy: {
    shell: paint({
      steel: (l, c) => set(c, 33, 0.3, 0.2 + l * 0.64),
      accent: (l, c) => set(c, 27, 0.5, l * 0.62),
    }),
    furniture: paint({
      steel: (l, c) => set(c, 30, 0.2, 0.22 + l * 0.6),
      accent: (l, c) => set(c, 18, 0.58, l * 0.78),
      screen: (l, c) => set(c, 186, 0.4, 0.3 + l * 0.35),
    }),
  },
}

function painted(name: string, p: Paint): THREE.MeshLambertMaterial {
  const m = stationMaterial.clone()
  if (stationMaterial.map) m.map = recolored(stationMaterial.map, name, p)
  return m
}

/**
 * Les packs Kenney exportent des matériaux PBR entièrement mats (metalness 0, roughness 1) :
 * un matériau Lambert donne le même rendu pour bien moins de calcul par pixel.
 */
function toLambert(m: THREE.Material): THREE.Material {
  const s = m as THREE.MeshStandardMaterial
  if (!s.isMeshStandardMaterial || s.metalness > 0.05 || s.roughness < 0.9) return m
  const l = new THREE.MeshLambertMaterial({ map: s.map, color: s.color, name: s.name, transparent: s.transparent, alphaTest: s.alphaTest, side: s.side })
  if (s.emissiveMap || s.emissive.getHex()) {
    l.emissive.copy(s.emissive)
    l.emissiveMap = s.emissiveMap
  }
  return l
}

function load(path: string): Promise<GLTF> {
  const hit = cache.get(path)
  if (hit) return Promise.resolve(hit)
  let p = pending.get(path)
  if (!p) {
    p = loader.loadAsync(BASE + path).then((gltf) => {
      const converted = new Map<THREE.Material, THREE.Material>()
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.castShadow = true
        mesh.receiveShadow = true
        if (path.startsWith('station/')) {
          stationMaterial ??= toLambert(mesh.material as THREE.Material) as THREE.MeshLambertMaterial
          mesh.material = stationMaterial
        } else {
          const src = mesh.material as THREE.Material
          let dst = converted.get(src)
          if (!dst) converted.set(src, (dst = toLambert(src)))
          mesh.material = dst
        }
      })
      cache.set(path, gltf)
      return gltf
    })
    pending.set(path, p)
  }
  return p
}

/** @param extra modèles supplémentaires à charger d'emblée (personnage du joueur…) */
export async function preload(extra: string[], onProgress: (ratio: number) => void): Promise<void> {
  const paths = [...STATION_MODELS.map((m) => `station/${m}.glb`), ...extra, CAT_MODEL, FURNITURE_PACK]
  let done = 0
  await Promise.all(
    paths.map(async (p) => {
      await load(p)
      onProgress(++done / paths.length)
    }),
  )
  for (const [theme, p] of Object.entries(PAINTS) as [Theme, (typeof PAINTS)[Theme]][]) {
    themes[theme] = {
      shell: p.shell ? painted(`${theme}-shell`, p.shell) : stationMaterial,
      furniture: painted(`${theme}-furniture`, p.furniture),
    }
  }
  // Argent : les aciers clairs et bleutés, le jaune de chantier gardé, des reflets (Phong).
  const silver = paint({
    steel: (l, c) => set(c, 212, 0.07, 0.34 + l * 0.52),
    accent: (l, c) => set(c, 44, 0.88, l * 0.82),
    screen: (l, c) => set(c, 205, 0.2, 0.3 + l * 0.3),
  })
  floorFinishes.silver = new THREE.MeshPhongMaterial({
    map: stationMaterial.map ? recolored(stationMaterial.map, 'silver-floor', silver) : null,
    specular: '#8e9aab',
    shininess: 60,
  })
}

/** Instance d'un modèle statique (partage géométrie et matériau). */
export function station(name: StationModel): THREE.Object3D {
  const gltf = cache.get(`station/${name}.glb`)
  if (!gltf) throw new Error(`Modèle non préchargé : ${name}`)
  return gltf.scene.clone(true)
}

/** Modèle du Furniture Kit (nœud du fichier commun, à cloner ; ses géométries sont partagées). */
export function packModel(name: string): THREE.Object3D {
  const o = cache.get(FURNITURE_PACK)?.scene.children.find((c) => c.name === name)
  if (!o) throw new Error(`Modèle du Furniture Kit non préchargé : ${name}`)
  return o
}

export interface Rig {
  root: THREE.Object3D
  clips: THREE.AnimationClip[]
}

/** Instance d'un modèle animé (squelette cloné) ; charge le modèle au besoin. */
export async function rig(path: string): Promise<Rig> {
  const gltf = await load(path)
  return { root: cloneSkinned(gltf.scene), clips: gltf.animations }
}
