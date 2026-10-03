import * as THREE from 'three'
import { FISH, type FishSpecies } from '../../shared/fishing.js'
import { fishModel } from './models'

/*
 * Portraits des poissons : chaque espèce rendue seule, de trois quarts, le nez à droite, sur fond
 * transparent (pour le livre des prises, la fiche d'une prise et le tableau des quartiers). Tous
 * sont rendus d'un coup, à la première demande, dans un petit rendu hors écran aussitôt libéré.
 */

const SIZE = 256
let portraits: Map<string, string> | null = null

function renderAll(): Map<string, string> {
  const out = new Map<string, string>()
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  try {
    renderer.setPixelRatio(1)
    renderer.setSize(SIZE, SIZE, false)
    renderer.setClearColor(0x000000, 0)
    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight('#ffffff', '#5a6a80', 1.9))
    const sun = new THREE.DirectionalLight('#fff6e6', 2.2)
    sun.position.set(-3, 6, 2)
    scene.add(sun)
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50)
    const corner = new THREE.Vector3()
    for (const fish of FISH) {
      const model = fishModel(fish)
      scene.add(model)
      model.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(model)
      const center = box.getCenter(new THREE.Vector3())
      // Vu du flanc gauche, un peu de haut et de l'avant : le nez (+z) est à droite.
      camera.position.copy(center).add(new THREE.Vector3(-1, 0.42, 0.3).normalize().multiplyScalar(10))
      camera.lookAt(center)
      camera.updateMatrixWorld(true)
      let half = 0.05
      for (let i = 0; i < 8; i++) {
        corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(camera.matrixWorldInverse)
        half = Math.max(half, Math.abs(corner.x), Math.abs(corner.y))
      }
      half *= 1.06
      camera.left = -half
      camera.right = half
      camera.top = half
      camera.bottom = -half
      camera.updateProjectionMatrix()
      renderer.render(scene, camera)
      out.set(fish.id, renderer.domElement.toDataURL('image/png'))
      scene.remove(model)
    }
  } finally {
    renderer.dispose()
    renderer.forceContextLoss()
  }
  return out
}

/** Portrait d'une espèce (image PNG en data URL ; vide si le rendu a échoué). */
export function fishPortrait(fish: FishSpecies): string {
  try {
    portraits ??= renderAll()
  } catch {
    portraits = new Map()
  }
  return portraits.get(fish.id) ?? ''
}
