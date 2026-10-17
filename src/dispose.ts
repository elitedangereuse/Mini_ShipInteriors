import * as THREE from 'three'

/*
 * Libérer la mémoire GPU de ce qu'on retire de la scène pour de bon (un personnage, un meuble),
 * sans toucher à ce qu'il partage avec d'autres. Three.js garde une géométrie déjà dessinée tant
 * qu'on ne la libère pas (dispose), et une texture reste sur la carte graphique. Les caches (modèles
 * chargés, matériaux d'une couleur, têtes coiffées, matériaux cuits…) marquent ce qu'ils prêtent
 * (keepShared) : disposeOwned libère tout le reste. Une ressource partagée libérée par erreur n'est
 * pas perdue : Three.js la renvoie à la carte graphique au dessin suivant (un à-coup, rien de plus).
 */

const keep = new WeakSet<object>()

/** Marque une géométrie, un matériau ou une texture comme partagé : disposeOwned ne le libère pas. */
export function keepShared<T extends object>(o: T): T {
  keep.add(o)
  return o
}

/** Un cache l'oublie : il revient à ceux qui le montrent encore, et part avec eux. */
export function releaseShared(o: object) {
  keep.delete(o)
}

export const isShared = (o: object): boolean => keep.has(o)

/** Les textures propres d'un matériau (ses cartes, et celles de ses uniformes de shader), puis lui. */
function disposeMaterial(material: THREE.Material) {
  for (const value of Object.values(material)) {
    if ((value as THREE.Texture)?.isTexture && !keep.has(value)) (value as THREE.Texture).dispose()
  }
  const uniforms = (material as THREE.ShaderMaterial).uniforms
  if (uniforms) {
    for (const u of Object.values(uniforms)) if ((u?.value as THREE.Texture)?.isTexture && !keep.has(u.value)) u.value.dispose()
  }
  material.dispose()
}

/**
 * Libère la mémoire GPU de ce qui, sous `root`, lui est propre : géométries, matériaux et leurs
 * textures, squelettes (leur texture d'os), tampons d'instances. Ce qui est partagé reste.
 */
export function disposeOwned(root: THREE.Object3D) {
  root.traverse((o) => {
    const skinned = o as THREE.SkinnedMesh
    if (skinned.isSkinnedMesh && skinned.skeleton && !keep.has(skinned.skeleton)) skinned.skeleton.dispose()
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose()
    const m = o as THREE.Mesh
    // La géométrie des sprites est la même pour tous (cf. THREE.Sprite).
    if (m.geometry && !(o as THREE.Sprite).isSprite && !keep.has(m.geometry)) m.geometry.dispose()
    if (!m.material) return
    for (const material of Array.isArray(m.material) ? m.material : [m.material]) {
      if (material && !keep.has(material)) disposeMaterial(material)
    }
  })
}
