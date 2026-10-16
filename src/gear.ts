import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/*
 * Accessoires cuits : ce qu'on accroche aux os d'un personnage (casque, plastron, toque, sacoches)
 * est fait de dizaines de petits maillages, un appel de dessin chacun. Une fois posés, la plupart
 * ne bougent plus par rapport à leur os : on les fond en un seul maillage à squelette, lié au
 * squelette du corps, chaque sommet pesant tout entier sur l'os qui portait sa pièce. La couleur de
 * chaque pièce passe dans ses sommets : un appel par sorte de matériau (mat, lumineux, texturé…)
 * pour tout le personnage, au lieu d'un par pièce.
 *
 * Restent à part, tels quels : ce qui est caché à la pose (on le montrera plus tard), transparent,
 * à shader maison ou dessiné à chaque image (onBeforeRender), et ce qu'on marque `userData.live`
 * (une pièce qu'on bouge, qu'on cache ou qu'on recolore ensuite).
 */

/** Matériaux qu'on sait cuire : leur couleur passe dans les sommets. */
const PLAIN = new Set(['MeshLambertMaterial', 'MeshBasicMaterial', 'MeshPhongMaterial', 'MeshStandardMaterial'])

/** Matériaux des pièces cuites, partagés d'un personnage à l'autre (même rendu = même matériau). */
const bakedMaterials = new Map<string, THREE.Material>()

type Colored = THREE.Material & { color: THREE.Color; map?: THREE.Texture | null }

function bakeable(mesh: THREE.Mesh): boolean {
  if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return false
  if (Array.isArray(mesh.material) || Object.keys(mesh.geometry.morphAttributes).length) return false
  if (Object.hasOwn(mesh, 'onBeforeRender') || Object.hasOwn(mesh, 'onAfterRender')) return false
  const m = mesh.material as Colored
  return PLAIN.has(m.type) && !m.transparent && !Object.hasOwn(m, 'onBeforeCompile') && !!m.color
}

/** Tout ce qui, à part la couleur, fait le rendu d'une pièce : deux pièces de même signature se fondent. */
function signature(mesh: THREE.Mesh): string {
  const m = mesh.material as THREE.MeshPhongMaterial & THREE.MeshStandardMaterial
  return [
    m.type, m.map?.uuid, m.side, m.alphaTest, m.depthWrite, m.depthTest, m.blending, m.toneMapped, m.fog, m.flatShading, m.wireframe,
    m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits, m.colorWrite, m.emissive?.getHex(), m.emissiveIntensity, m.emissiveMap?.uuid,
    m.shininess, m.specular?.getHex(), m.roughness, m.metalness, m.vertexColors, mesh.castShadow, mesh.receiveShadow, mesh.renderOrder,
  ].join('|')
}

const _bone = new THREE.Matrix4()
const _color = new THREE.Color()

/** La matrice qui pose une pièce dans le repère de liaison du corps : le squelette, dans sa pose du moment, l'y remet exactement à sa place. */
function boneSpace(mesh: THREE.Mesh, body: THREE.SkinnedMesh, bone: number): THREE.Matrix4 {
  const skeleton = body.skeleton
  return _bone.multiplyMatrices(skeleton.bones[bone].matrixWorld, skeleton.boneInverses[bone]).multiply(body.bindMatrix).invert().multiply(mesh.matrixWorld)
}

/**
 * Géométrie d'une pièce, posée par `matrix`, sa couleur dans ses sommets ; avec `bone`, chacun de
 * ses sommets pèse tout entier sur cet os.
 */
function prepare(mesh: THREE.Mesh, matrix: THREE.Matrix4, textured: boolean, bone?: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry().copy(mesh.geometry)
  g.morphAttributes = {}
  g.clearGroups()
  if (!g.getAttribute('normal')) g.computeVertexNormals()
  g.applyMatrix4(matrix)
  const count = g.attributes.position.count
  if (!g.index) g.setIndex(Array.from({ length: count }, (_, i) => i))
  // Une pièce en miroir (échelle négative) : on retourne ses triangles, comme le ferait son rendu.
  if (matrix.determinant() < 0) {
    const index = g.index!
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i + 1)
      index.setX(i + 1, index.getX(i + 2))
      index.setX(i + 2, a)
    }
  }
  const material = mesh.material as Colored
  _color.copy(material.color)
  const colors = new Float32Array(count * 3)
  const own = material.vertexColors ? g.getAttribute('color') : undefined
  for (let i = 0; i < count; i++) {
    colors[i * 3] = _color.r * (own ? own.getX(i) : 1)
    colors[i * 3 + 1] = _color.g * (own ? own.getY(i) : 1)
    colors[i * 3 + 2] = _color.b * (own ? own.getZ(i) : 1)
  }
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && !(textured && name === 'uv')) g.deleteAttribute(name)
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  if (bone === undefined) return g
  const skinIndex = new Uint16Array(count * 4)
  const skinWeight = new Float32Array(count * 4)
  for (let i = 0; i < count; i++) {
    skinIndex[i * 4] = bone
    skinWeight[i * 4] = 1
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4))
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4))
  return g
}

function bakedMaterial(key: string, src: Colored): THREE.Material {
  let m = bakedMaterials.get(key)
  if (!m) {
    const c = src.clone() as Colored
    c.color.set(0xffffff)
    c.vertexColors = true
    bakedMaterials.set(key, (m = c))
  }
  return m
}

/**
 * Cuit ce que `build` accroche aux os du personnage `root` (cf. plus haut). Les pièces cuites
 * rejoignent celles des appels précédents sur le même personnage (un seul maillage par sorte de
 * matériau). Avec `apart`, elles forment un groupe à elles, rendu à l'appelant : une pièce qu'on
 * montre ou cache d'un coup (le fusil du sergent).
 * Sans corps à squelette (robots du kit, créatures), rien n'est cuit.
 */
export function bakeGear(root: THREE.Object3D, build: () => void): void
export function bakeGear(root: THREE.Object3D, build: () => void, apart: true): THREE.Group | null
export function bakeGear(root: THREE.Object3D, build: () => void, apart = false): THREE.Group | null {
  const before = new Set<THREE.Object3D>()
  root.traverse((o) => { before.add(o) })
  build()
  let body = root.getObjectByName('body-mesh') as THREE.SkinnedMesh | undefined
  if (!body?.isSkinnedMesh) root.traverse((o) => { if (!body?.isSkinnedMesh && (o as THREE.SkinnedMesh).isSkinnedMesh) body = o as THREE.SkinnedMesh })
  if (!body?.isSkinnedMesh || body.bindMode !== THREE.AttachedBindMode || !body.parent) return null
  const skeleton = body.skeleton
  root.updateMatrixWorld(true)

  // Les pièces nouvelles, visibles et simples, chacune avec l'os qui la porte.
  const parts = new Map<string, { material: Colored; meshes: THREE.Mesh[]; bones: number[] }>()
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (before.has(mesh) || !bakeable(mesh)) return
    let bone = -1
    for (let p: THREE.Object3D | null = mesh; p; p = p.parent) {
      if (!p.visible || p.userData.live) return
      bone = skeleton.bones.indexOf(p as THREE.Bone)
      if (bone >= 0) break
    }
    if (bone < 0) return
    const key = signature(mesh)
    let part = parts.get(key)
    if (!part) parts.set(key, (part = { material: mesh.material as Colored, meshes: [], bones: [] }))
    part.meshes.push(mesh)
    part.bones.push(bone)
  })
  if (!parts.size) return null

  const group = apart ? new THREE.Group() : null
  if (group) {
    group.name = 'gear'
    body.parent.add(group)
  }
  const holder = group ?? body.parent
  const baked: Map<string, THREE.SkinnedMesh> = apart ? new Map() : (root.userData.bakedGear ??= new Map())
  for (const [key, part] of parts) {
    const textured = !!part.material.map
    const geos = part.meshes.map((mesh, i) => prepare(mesh, boneSpace(mesh, body!, part.bones[i]), textured, part.bones[i]))
    const existing = baked.get(key)
    const merged = mergeGeometries(existing ? [existing.geometry, ...geos] : geos, false)
    for (const g of geos) g.dispose()
    if (!merged) continue
    if (existing) {
      existing.geometry.dispose()
      existing.geometry = merged
      existing.computeBoundingBox()
      existing.computeBoundingSphere()
    } else {
      const first = part.meshes[0]
      const mesh = new THREE.SkinnedMesh(merged, bakedMaterial(key, part.material))
      mesh.name = 'gear-baked'
      mesh.castShadow = first.castShadow
      mesh.receiveShadow = first.receiveShadow
      mesh.renderOrder = first.renderOrder
      mesh.frustumCulled = body.frustumCulled
      holder.add(mesh)
      mesh.bind(skeleton, body.bindMatrix)
      baked.set(key, mesh)
    }
    drop(part.meshes, (p) => before.has(p))
  }
  return group
}

/**
 * Retire les pièces d'origine, et avec elles les groupes qu'elles laissent vides (sauf ceux que
 * `keep` désigne).
 */
function drop(meshes: THREE.Mesh[], keep: (o: THREE.Object3D) => boolean) {
  for (const mesh of meshes) {
    let p = mesh.parent
    mesh.removeFromParent()
    while (p && !keep(p) && !p.children.length) {
      const up: THREE.Object3D | null = p.parent
      p.removeFromParent()
      p = up
    }
  }
}

/**
 * Fond les pièces simples d'un groupe immobile (cf. bakeable) en un maillage par sorte de matériau,
 * posés dans le groupe : un trait du visage, une expression qu'on montre ou cache d'un bloc. Le
 * groupe garde sa place, sa visibilité et ce qui n'a pas pu être fondu.
 */
export function fuse<T extends THREE.Object3D>(group: T): T {
  group.updateMatrixWorld(true)
  const inverse = group.matrixWorld.clone().invert()
  const parts = new Map<string, { material: Colored; meshes: THREE.Mesh[] }>()
  group.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!bakeable(mesh)) return
    for (let p: THREE.Object3D | null = mesh; p && p !== group; p = p.parent) if (!p.visible || p.userData.live) return
    const key = signature(mesh)
    let part = parts.get(key)
    if (!part) parts.set(key, (part = { material: mesh.material as Colored, meshes: [] }))
    part.meshes.push(mesh)
  })
  for (const [key, part] of parts) {
    if (part.meshes.length < 2) continue
    const textured = !!part.material.map
    const geos = part.meshes.map((mesh) => prepare(mesh, _bone.multiplyMatrices(inverse, mesh.matrixWorld), textured))
    const merged = mergeGeometries(geos, false)
    for (const g of geos) g.dispose()
    if (!merged) continue
    const first = part.meshes[0]
    const mesh = new THREE.Mesh(merged, bakedMaterial(key, part.material))
    mesh.castShadow = first.castShadow
    mesh.receiveShadow = first.receiveShadow
    mesh.renderOrder = first.renderOrder
    group.add(mesh)
    drop(part.meshes, (p) => p === group)
  }
  return group
}
