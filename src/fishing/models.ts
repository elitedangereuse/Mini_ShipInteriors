import * as THREE from 'three'
import { CUTE_FISH_PACK, FISH_PACK, packModel } from '../assets'
import { keepShared } from '../furniture/kit'
import type { FishSpecies } from '../../shared/fishing.js'

/*
 * Les poissons de l'étang, en volume : un modèle d'un des deux packs de Quaternius (CC0, cf.
 * scripts/import-quaternius-fish.mjs et import-quaternius-cute-fish.mjs), aux couleurs de l'espèce
 * (cf. shared/fishing.js) ; une partie que l'espèce ne repeint pas garde la couleur du pack.
 * Le modèle est long de 1, le nez vers +z, centré sur l'origine.
 */

/** Modèles de l'« Animated Fish Pack » ; les autres sont ceux du « Cute Fish Pack ». */
const FIRST_PACK = new Set(['fish1', 'fish2', 'fish3', 'dolphin', 'manta', 'shark', 'whale'])

const paints = new Map<string, THREE.MeshLambertMaterial>()
/** Matériau d'une partie de poisson : sa couleur, et ce qu'elle émet (partagé, jamais libéré). */
function paint(color: string, glow = 0): THREE.MeshLambertMaterial {
  const key = `${color}:${glow}`
  let m = paints.get(key)
  if (!m) {
    m = keepShared(new THREE.MeshLambertMaterial({ color, flatShading: true }))
    if (glow) m.emissive.set(color).multiplyScalar(glow)
    paints.set(key, m)
  }
  return m
}

/** Un poisson de cette espèce, long de `length`, le nez vers +z, centré sur l'origine. */
export function fishModel(fish: FishSpecies, length = 1): THREE.Group {
  const model = packModel(fish.model, FIRST_PACK.has(fish.model) ? FISH_PACK : CUTE_FISH_PACK).clone(true)
  model.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const own = mesh.material as THREE.MeshLambertMaterial
    const part = own.name
    mesh.material = paint(fish.colors[part] ?? `#${own.color.getHexString()}`, fish.glow?.[part])
    mesh.castShadow = false
  })
  model.scale.setScalar(length)
  return new THREE.Group().add(model)
}
