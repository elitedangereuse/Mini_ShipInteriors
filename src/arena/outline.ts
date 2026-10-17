import * as THREE from 'three'
import { keepShared } from '../dispose'

/*
 * Le contour des combattants, à la couleur de ce qu'ils sont pour le joueur (cf. palette.ts) : on
 * lit leur camp à leur silhouette, même de loin, même contre un décor de la même teinte. C'est une
 * « coque inversée » : chaque maillage du personnage est redessiné, faces arrière seulement, gonflé
 * le long de ses normales de quelques millimètres ; ce qui dépasse autour de lui fait le trait.
 *
 * - Les normales sont lissées (moyennées là où plusieurs sommets se superposent) : les Mini
 *   Characters sont taillés à facettes, et des normales franches ouvriraient le trait aux arêtes.
 * - Le gonflement se fait dans le repère de la caméra, après le squelette (les maillages animés
 *   partagent les os de l'original) : le trait a la même épaisseur, quelle que soit l'échelle du
 *   modèle, et suit chaque geste. La coque est aussi repoussée un peu derrière le modèle : elle ne
 *   perce jamais devant lui, là où il se creuse.
 * - Une matière par couleur, partagée ; l'épaisseur, commune à toutes.
 */

/** Épaisseur du trait (tuiles). */
export const OUTLINE = { value: 0.014 }

const smooth = new WeakMap<THREE.BufferGeometry, THREE.BufferAttribute>()

/** Les normales lissées d'un maillage : la moyenne de celles des sommets qui se superposent. */
function smoothNormals(geometry: THREE.BufferGeometry): THREE.BufferAttribute | null {
  const known = smooth.get(geometry)
  if (known) return known
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  if (!position || !normal) return null
  const sums = new Map<string, THREE.Vector3>()
  const key = (i: number) => `${position.getX(i).toFixed(4)},${position.getY(i).toFixed(4)},${position.getZ(i).toFixed(4)}`
  const n = new THREE.Vector3()
  for (let i = 0; i < position.count; i++) {
    const k = key(i)
    let s = sums.get(k)
    if (!s) sums.set(k, (s = new THREE.Vector3()))
    s.add(n.fromBufferAttribute(normal, i))
  }
  const out = new Float32Array(position.count * 3)
  for (let i = 0; i < position.count; i++) {
    const s = sums.get(key(i))!
    n.copy(s)
    if (n.lengthSq() < 1e-10) n.fromBufferAttribute(normal, i)
    n.normalize()
    out[i * 3] = n.x
    out[i * 3 + 1] = n.y
    out[i * 3 + 2] = n.z
  }
  const attribute = new THREE.BufferAttribute(out, 3)
  smooth.set(geometry, attribute)
  return attribute
}

/** La coque de chaque géométrie : une par géométrie d'origine, que se partagent tous ceux qui la portent. */
const hulls = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>()

/**
 * La géométrie de la coque d'un maillage : elle partage les tampons de l'original et y ajoute ses
 * normales lissées ; null s'il n'a pas de normales. Ce n'est pas à disposeOwned de la libérer (elle
 * est marquée partagée) : libérer ses tampons, ce serait libérer ceux de l'original, que d'autres
 * dessinent peut-être encore. Elle part avec l'original : libéré, plus personne ne le dessine.
 */
function hullGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry | null {
  const known = hulls.get(source)
  if (known) return known
  const normals = smoothNormals(source)
  if (!normals) return null
  const geometry = keepShared(new THREE.BufferGeometry())
  for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute)
  geometry.setAttribute('outlineNormal', normals)
  geometry.index = source.index
  geometry.groups = source.groups
  geometry.boundingSphere = source.boundingSphere
  geometry.boundingBox = source.boundingBox
  hulls.set(source, geometry)
  source.addEventListener('dispose', () => geometry.dispose())
  return geometry
}

/** La matière du trait de chaque couleur, partagée par tous les combattants. */
const materials = new Map<string, THREE.MeshBasicMaterial>()

/** La matière du trait d'une couleur (partagée). */
export function outlineMaterial(color: string): THREE.MeshBasicMaterial {
  let m = materials.get(color)
  if (m) return m
  m = keepShared(new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, toneMapped: false }))
  m.onBeforeCompile = (shader) => {
    shader.uniforms.outlineWidth = OUTLINE
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 outlineNormal;\nuniform float outlineWidth;')
      // Le squelette fait tourner la normale lissée comme la normale ordinaire.
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( outlineNormal );')
      .replace('#include <project_vertex>', [
        '#ifndef USE_SKINNING',
        '  vec3 objectNormal = vec3( outlineNormal );',
        '#endif',
        'vec4 mvPosition = vec4( transformed, 1.0 );',
        '#ifdef USE_INSTANCING',
        '  mvPosition = instanceMatrix * mvPosition;',
        '#endif',
        'mvPosition = modelViewMatrix * mvPosition;',
        'mvPosition.xyz += normalize( normalMatrix * objectNormal ) * outlineWidth;',
        // Repoussée derrière l'original : là où le modèle se creuse (l'aisselle, le tablier), la coque
        // gonflée passerait devant lui ; elle ne doit se voir qu'autour de la silhouette.
        // Le long du rayon de la caméra : son contour à l'écran ne bouge pas.
        'if ( isOrthographic ) mvPosition.z -= outlineWidth * 4.0;',
        'else mvPosition.xyz += normalize( mvPosition.xyz ) * outlineWidth * 4.0;',
        'gl_Position = projectionMatrix * mvPosition;',
      ].join('\n'))
  }
  m.customProgramCacheKey = () => 'arena-outline'
  materials.set(color, m)
  return m
}

/**
 * Pose le trait sur un personnage (`root`) : une coque par maillage opaque, enfant de l'original
 * (même repère, mêmes os). Sans effet s'il en a déjà un ; `color` change alors sa couleur.
 */
export function outline(root: THREE.Object3D, color: string) {
  const material = outlineMaterial(color)
  if (root.userData.outlined) {
    for (const hull of root.userData.outlined as THREE.Mesh[]) hull.material = material
    return
  }
  const hulls: THREE.Mesh[] = []
  const meshes: THREE.Mesh[] = []
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || mesh.userData.outline || mesh.userData.noOutline) return
    const m = mesh.material as THREE.Material
    if (Array.isArray(mesh.material) || m.transparent || !mesh.geometry.getAttribute('normal')) return
    meshes.push(mesh)
  })
  for (const mesh of meshes) {
    const geometry = hullGeometry(mesh.geometry)
    if (!geometry) continue
    const skinned = mesh as THREE.SkinnedMesh
    let hull: THREE.Mesh
    if (skinned.isSkinnedMesh) {
      const s = new THREE.SkinnedMesh(geometry, material)
      s.bind(skinned.skeleton, skinned.bindMatrix)
      hull = s
    } else hull = new THREE.Mesh(geometry, material)
    hull.userData.outline = true
    hull.castShadow = hull.receiveShadow = false
    // Le modèle bouge : pas de tri par boîte englobante (celle de l'original, au repos, le couperait).
    hull.frustumCulled = false
    mesh.add(hull)
    hulls.push(hull)
  }
  root.userData.outlined = hulls
}

/** Montre ou cache le trait (un fantôme n'en a pas). */
export function showOutline(root: THREE.Object3D | undefined, on: boolean) {
  for (const hull of (root?.userData.outlined as THREE.Mesh[] | undefined) ?? []) hull.visible = on
}
