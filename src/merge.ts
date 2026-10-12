import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { makeIndexedFadeable } from './fade'

/**
 * Objet qui peut masquer le joueur ; rendu « tramé » quand il est devant lui.
 * Soit fusionné avec les autres (`index` dans la texture de fondu), soit autonome
 * (`uniform` : portes, qui bougent, et consoles, qu'on doit pouvoir cliquer).
 */
export interface Occluder {
  center: THREE.Vector3
  value: number
  index?: number
  uniform?: { value: number }
  /**
   * Mur de la cabine (ou objet accroché dessus) : direction de l'extérieur de la cabine.
   * En mode aménagement, seuls les murs tournés vers la caméra s'estompent.
   */
  outward?: { x: number; z: number }
  /** Effacé tout à fait : un grand meuble sous le couvercle d'une pièce fermée, qui dépasserait des murs. */
  off?: boolean
}

/** Fondu de chaque occulteur fusionné (1 = opaque), lu par les shaders dans une texture. */
export interface FadeBuffer {
  data: Float32Array
  texture: THREE.DataTexture
}

export function fadeBuffer(size: number): FadeBuffer {
  const data = new Float32Array(Math.max(1, size)).fill(1)
  const texture = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat, THREE.FloatType)
  texture.needsUpdate = true
  return { data, texture }
}

/**
 * Tranche d'un maillage fusionné : la géométrie d'une cellule du pont (cf. visibility.ts), d'un
 * seul tenant dans l'index (ou dans les sommets, sans index).
 */
export interface CellRange {
  cell: number
  start: number
  count: number
}

const _extent = new THREE.Box3()

/**
 * Image à plat (affiche, écran, décalque au sol) : un seul plan texturé, plaqué contre un mur ou
 * posé au sol. Son ombre tomberait sur ce qui la porte, à moins d'un centimètre : elle ne se voit
 * pas, mais coûtait un appel de dessin par image dans la passe d'ombre.
 */
function flatPicture(g: THREE.BufferGeometry, material: THREE.Material): boolean {
  if (!(material as THREE.MeshBasicMaterial).map) return false
  g.computeBoundingBox()
  const b = g.boundingBox!
  return Math.min(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) < 0.012
}

/**
 * Géométrie immobile fusionnée : un maillage (un appel de dessin) par matériau.
 * Un objet « tramable » garde son propre fondu : ses sommets portent son index (`aOcc`).
 */
export class StaticMerge {
  private parts = new Map<string, { material: THREE.Material; geos: THREE.BufferGeometry[]; cells: number[]; cast: boolean; fading: boolean }>()
  private fading = 0
  private readonly local = new THREE.Matrix4()

  /**
   * @param cellOf cellule d'un objet, d'après son encombrement : la géométrie de chaque maillage est
   *   alors rangée par cellule (`userData.cells`), pour n'en dessiner qu'une partie (cf. Deck.cull)
   * @param cellRank rang d'une cellule dans ce rangement : des pièces voisines y sont voisines, et les
   *   pièces que montre la caméra forment le plus souvent une seule tranche (un appel de dessin)
   */
  constructor(private readonly cellOf?: (extent: THREE.Box3) => number, private readonly cellRank?: (cell: number) => number) {}

  /** Nombre d'occulteurs fusionnés (taille de la texture de fondu). */
  get fadingCount(): number {
    return this.fading
  }

  /**
   * @param occ index d'occulteur : l'objet pourra être tramé individuellement
   * @param frame inverse de la matrice monde du repère où la géométrie sera posée (défaut : le monde)
   */
  add(o: THREE.Object3D, cast: boolean, occ?: number, frame?: THREE.Matrix4) {
    o.updateMatrixWorld(true)
    const cell = this.cellOf?.(_extent.setFromObject(o)) ?? 0
    o.traverse((c) => {
      const mesh = c as THREE.Mesh
      if (!mesh.isMesh) return
      const matrix = frame ? this.local.multiplyMatrices(frame, mesh.matrixWorld) : mesh.matrixWorld
      // Copie brute (le clone d'une géométrie dérivée en reconstruirait d'abord une par défaut).
      const g = new THREE.BufferGeometry().copy(mesh.geometry).applyMatrix4(matrix)
      const material = mesh.material as THREE.Material
      // Couleurs et matières par sommet : seulement pour les matériaux qui s'en servent (mobilier fait main).
      const keepColor = material.vertexColors
      const keepSurface = !!material.userData.surfaceAttribute
      for (const name of Object.keys(g.attributes)) {
        if (name !== 'position' && name !== 'normal' && name !== 'uv' && !(keepColor && name === 'color') && !(keepSurface && name === 'aSurf')) g.deleteAttribute(name)
      }
      const fading = occ !== undefined
      if (fading) g.setAttribute('aOcc', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(occ), 1))
      const shadow = cast && !flatPicture(g, material)
      const key = `${material.uuid}:${shadow}:${fading}`
      let part = this.parts.get(key)
      if (!part) this.parts.set(key, (part = { material, geos: [], cells: [], cast: shadow, fading }))
      part.geos.push(g)
      part.cells.push(cell)
    })
  }

  /** Occulteur immobile : fusionné, tramé via la texture de fondu. */
  addFading(o: THREE.Object3D, center: THREE.Vector3, frame?: THREE.Matrix4, outward?: Occluder['outward']): Occluder {
    const occluder: Occluder = { center, value: 1, index: this.fading++, outward }
    this.add(o, true, occluder.index, frame)
    return occluder
  }

  /**
   * Fusionne ce qui a été ajouté et place les maillages dans `parent`.
   * @param fades texture de fondu des occulteurs fusionnés (inutile s'il n'y en a pas)
   */
  flush(parent: THREE.Object3D, fades?: THREE.DataTexture): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = []
    for (const part of this.parts.values()) {
      // Rangée par cellule, la géométrie de chacune se suit dans le maillage.
      const order = part.geos.map((_, i) => i)
      const rank = this.cellRank
      if (rank) order.sort((a, b) => rank(part.cells[a]) - rank(part.cells[b]) || part.cells[a] - part.cells[b] || a - b)
      else if (this.cellOf) order.sort((a, b) => part.cells[a] - part.cells[b] || a - b)
      const merged = mergeGeometries(order.map((i) => part.geos[i]), false)
      const ranges: CellRange[] = []
      let at = 0
      for (const i of order) {
        const g = part.geos[i]
        const count = g.index ? g.index.count : g.attributes.position.count
        const last = ranges[ranges.length - 1]
        if (last?.cell === part.cells[i]) last.count += count
        else ranges.push({ cell: part.cells[i], start: at, count })
        at += count
        g.dispose()
      }
      if (!merged) continue
      const material = part.fading ? makeIndexedFadeable(part.material, fades!) : part.material
      const mesh = new THREE.Mesh(merged, material)
      if (this.cellOf) mesh.userData.cells = ranges
      mesh.castShadow = part.cast
      mesh.receiveShadow = true
      // Matériau créé pour ce maillage (à libérer avec lui), et non le matériau partagé d'origine.
      mesh.userData.ownMaterial = part.fading
      parent.add(mesh)
      meshes.push(mesh)
    }
    this.parts.clear()
    this.fading = 0
    return meshes
  }
}

/**
 * Meuble qui s'estompe quand il passe devant le personnage : un grand meuble, qui le cacherait, et
 * ce qui est plaqué contre un mur (affiche, horloge, applique), qui s'estompe avec lui. Une lampe
 * sur pied, une suspension, une plante grêle ne cachent presque rien ; tramées, elles ne montraient
 * plus que leurs entrailles (l'intérieur d'un abat-jour, au travers de la trame). Une enseigne
 * suspendue ne s'estompe que si elle est large.
 * @param box encombrement du meuble ; `floor` : hauteur du sol sous lui
 */
export function hidesCharacter(box: THREE.Box3, floor = 0): boolean {
  if (box.max.y - floor <= 0.6) return false
  const w = box.max.x - box.min.x, d = box.max.z - box.min.z
  const span = Math.max(w, d), depth = Math.min(w, d)
  if (depth < 0.16 && span > 2 * depth) return true
  return span >= (box.min.y - floor > 0.9 ? 0.9 : 0.42)
}

export interface FadeFocus {
  /** Position du joueur (ou centre de la cabine en mode aménagement). */
  focus: THREE.Vector3
  /** Direction horizontale (normalisée) du point visé vers la caméra. */
  toCamera: THREE.Vector3
  /** Mode aménagement : on estompe les murs de la cabine tournés vers la caméra, et eux seuls. */
  cabin: boolean
  /**
   * Meuble où le joueur est installé (position au sol de son centre) : il ne s'estompe pas, même
   * si son centre passe devant le joueur (couché dans un lit, on reste dans le lit).
   */
  keep?: { x: number; z: number } | null
}

const _right = new THREE.Vector3()
const _v = new THREE.Vector3()

/**
 * Murs et gros meubles entre la caméra et le joueur : tramés.
 * @returns vrai si la texture de fondu doit être renvoyée au GPU
 */
export function updateOccluders(list: Occluder[], fades: FadeBuffer | null, view: FadeFocus, dt: number): boolean {
  const { focus, toCamera } = view
  const right = _right.set(toCamera.z, 0, -toCamera.x)
  let dirty = false
  for (const o of list) {
    let hide: boolean
    if (view.cabin) hide = !!o.outward && o.outward.x * toCamera.x + o.outward.z * toCamera.z > 0.2
    else {
      _v.set(o.center.x - focus.x, 0, o.center.z - focus.z)
      const ahead = _v.dot(toCamera)
      hide = ahead > 0.1 && ahead < 3 && Math.abs(_v.dot(right)) < 1.6
      if (hide && view.keep && Math.abs(o.center.x - view.keep.x) < 0.02 && Math.abs(o.center.z - view.keep.z) < 0.02) hide = false
    }
    const before = o.value
    o.value = o.off ? 0 : THREE.MathUtils.damp(o.value, hide ? 0.25 : 1, 8, dt)
    if (o.value > 0.995) o.value = 1
    if (o.value === before) continue
    if (o.uniform) o.uniform.value = o.value
    if (o.index !== undefined && fades) {
      fades.data[o.index] = o.value
      dirty = true
    }
  }
  return dirty
}
