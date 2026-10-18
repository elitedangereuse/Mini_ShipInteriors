import * as THREE from 'three'
import { cargoCanister } from '../furniture'
import { keepShared } from '../dispose'

/** Hauteur et rayon du colis à l'échelle 1 (cf. cargoCanister). */
const CRATE_H = 0.34
const CRATE_R = 0.126
/** Os des membres : ce qui pend sous le torse sans en faire partie. */
const LIMBS = new Set(['arm-left', 'arm-right', 'head'])

const strapGeo = keepShared(new THREE.BoxGeometry(1, 1, 1))
const strapMat = keepShared(new THREE.MeshLambertMaterial({ color: '#2b3038' }))

/**
 * Le torse tel qu'on le voit, dans le repère de son os : `body`, le buste seul (hauteur, largeur,
 * poitrine) ; `back`, le point le plus en arrière à cette hauteur, ce qu'on porte déjà compris (le
 * sac de Kael). Deux sortes de personnages : à peau (Mini Characters : l'os ne porte aucun
 * maillage, on lit les sommets que cet os mène) et rigides (robots, créatures, Gardiens : le torse
 * est un maillage, ses membres et ornements sont ses enfants).
 */
function measure(root: THREE.Object3D, torso: THREE.Object3D): { body: THREE.Box3; back: number } | null {
  const body = new THREE.Box3()
  const worn: THREE.Vector3[] = []
  const v = new THREE.Vector3()
  const m = new THREE.Matrix4()
  root.traverse((o) => {
    const s = o as THREE.SkinnedMesh
    if (!s.isSkinnedMesh) return
    const bone = s.skeleton.bones.indexOf(torso as THREE.Bone)
    const pos = s.geometry.getAttribute('position')
    const index = s.geometry.getAttribute('skinIndex')
    const weight = s.geometry.getAttribute('skinWeight')
    if (bone < 0 || !index || !weight) return
    // Pose de repos, dans le repère de l'os (cf. le calcul de la peau dans three.js).
    m.multiplyMatrices(s.skeleton.boneInverses[bone], s.bindMatrix)
    const isBody = s.name === 'body-mesh'
    for (let i = 0; i < pos.count; i++) {
      // L'os qui pèse le plus sur ce sommet.
      let best = 0, owner = -1
      for (let j = 0; j < 4; j++) {
        const w = weight.getComponent(i, j)
        if (w > best) [best, owner] = [w, index.getComponent(i, j)]
      }
      if (owner !== bone) continue
      v.fromBufferAttribute(pos, i).applyMatrix4(m)
      if (isBody) body.expandByPoint(v)
      else worn.push(v.clone())
    }
  })
  const mesh = torso as THREE.Mesh
  if (body.isEmpty() && mesh.isMesh) {
    mesh.geometry.computeBoundingBox()
    body.copy(mesh.geometry.boundingBox!)
  }
  if (body.isEmpty()) return null
  // Ce qui est accroché au torse sans être cuit (ornements des Gardiens, matériel de Kael).
  torso.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(torso.matrixWorld).invert()
  const visit = (o: THREE.Object3D) => {
    for (const child of o.children) {
      if (LIMBS.has(child.name)) continue
      const part = child as THREE.Mesh
      if (part.isMesh && part.geometry) {
        part.geometry.computeBoundingBox()
        const box = part.geometry.boundingBox!.clone().applyMatrix4(part.matrixWorld).applyMatrix4(inv)
        worn.push(box.min.clone().setY(THREE.MathUtils.clamp(box.getCenter(v).y, body.min.y, body.max.y)))
      }
      visit(child)
    }
  }
  visit(torso)
  let back = body.min.z
  // Seulement à hauteur du buste : une antenne au-dessus de la tête ne repousse pas le colis.
  for (const p of worn) if (p.y >= body.min.y && p.y <= body.max.y) back = Math.min(back, p.z)
  return { body, back }
}

/**
 * Colis dans le dos d'un porteur de la zone thargoïde, accroché à l'os du torse (il suit les
 * animations) et taillé sur lui : debout entre les omoplates, le haut au ras des épaules, plaqué
 * contre le dos ou contre ce qu'on y porte déjà, tenu par deux sangles. Un buste étroit (robot,
 * Gardien) ou court (Mini Character) le porte un peu plus petit. Null sans torse.
 */
export function backCrate(root: THREE.Object3D): THREE.Object3D | null {
  const torso = root.getObjectByName('torso')
  if (!torso) return null
  root.updateMatrixWorld(true)
  const fit = measure(root, torso) ?? { body: new THREE.Box3(new THREE.Vector3(-0.15, 0, -0.13), new THREE.Vector3(0.15, 0.17, 0.13)), back: -0.13 }
  const { body, back } = fit
  // Unités de l'os -> mètres du jeu.
  const unit = torso.getWorldScale(new THREE.Vector3()).y || 1
  const width = (body.max.x - body.min.x) * unit
  const height = (body.max.y - body.min.y) * unit
  const k = THREE.MathUtils.clamp(Math.min(width / 0.28, (height * 1.5) / CRATE_H), 0.62, 1)
  const size = k / unit
  const holder = new THREE.Group()
  holder.name = 'back-crate'
  const crate = cargoCanister(1)
  crate.scale.setScalar(size)
  const x = (body.min.x + body.max.x) / 2
  const top = body.max.y + 0.02 / unit
  const bottom = top - CRATE_H * size
  // Le flanc du colis touche le dos (un peu enfoncé : il pèse).
  const z = back - CRATE_R * size * 0.85
  crate.position.set(x, bottom, z)
  holder.add(crate)
  // Les sangles : sur l'épaule, du colis à la poitrine, puis le long du buste.
  const t = 0.012 / unit, w = 0.028 / unit
  const front = body.max.z
  for (const side of [-1, 1]) {
    const sx = x + side * (body.max.x - body.min.x) * 0.24
    const over = new THREE.Mesh(strapGeo, strapMat)
    over.scale.set(w, t, front - z)
    over.position.set(sx, body.max.y + t / 2, (front + z) / 2)
    const down = new THREE.Mesh(strapGeo, strapMat)
    const drop = (body.max.y - body.min.y) * 0.7
    down.scale.set(w, drop, t)
    down.position.set(sx, body.max.y - drop / 2, front + t / 2)
    holder.add(over, down)
  }
  torso.add(holder)
  return holder
}
