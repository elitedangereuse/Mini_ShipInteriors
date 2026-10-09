import * as THREE from 'three'

/*
 * Transparence « tramée » : au lieu d'un vrai alpha (tri des objets, bascules
 * opaque/transparent, recompilations de shaders → clignotements), on jette une
 * partie des pixels selon une matrice de Bayer 4×4. L'objet reste dans la passe
 * opaque, écrit la profondeur et ne clignote jamais.
 */

export const BAYER = `
  float bayer4(vec2 p) {
    ivec2 i = ivec2(mod(p, 4.0));
    int k = i.x + i.y * 4;
    float m[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
    return (m[k] + 0.5) / 16.0;
  }`

const DISCARD = `#include <clipping_planes_fragment>
  if (vFade < 0.999 && vFade < bayer4(gl_FragCoord.xy)) discard;`

/*
 * Les deux variantes reprennent le shader modifié du matériau d'origine (la matière de ses
 * surfaces, cf. surfaces.ts), que material.clone() ne copie pas.
 */

/** Un seul niveau de fondu pour tout l'objet (`fade.value`, 1 = opaque). */
export function makeFadeable(material: THREE.Material, fade: { value: number }): THREE.Material {
  const m = material.clone()
  m.onBeforeCompile = (shader, renderer) => {
    material.onBeforeCompile(shader, renderer)
    shader.uniforms.uFade = fade
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `uniform float uFade;\n${BAYER}\nvoid main() {\n  float vFade = uFade;`)
      .replace('#include <clipping_planes_fragment>', DISCARD)
  }
  m.customProgramCacheKey = () => `fade-uniform|${material.customProgramCacheKey()}`
  return m
}

/**
 * Variante pour une géométrie fusionnée : chaque sommet porte l'index (`aOcc`)
 * de l'objet d'origine, dont le fondu est lu dans une texture de données.
 * Des centaines de murs tiennent ainsi en un seul appel de dessin.
 */
export function makeIndexedFadeable(material: THREE.Material, fades: THREE.DataTexture): THREE.Material {
  const m = material.clone()
  m.onBeforeCompile = (shader, renderer) => {
    material.onBeforeCompile(shader, renderer)
    shader.uniforms.uFades = { value: fades }
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform sampler2D uFades;\nattribute float aOcc;\nvarying float vFade;\nvoid main() {\n  vFade = texelFetch(uFades, ivec2(int(aOcc + 0.5), 0), 0).r;')
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `varying float vFade;\n${BAYER}\nvoid main() {`)
      .replace('#include <clipping_planes_fragment>', DISCARD)
  }
  m.customProgramCacheKey = () => `fade-indexed|${material.customProgramCacheKey()}`
  return m
}
