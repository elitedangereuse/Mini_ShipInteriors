import * as THREE from 'three'

/*
 * Lueurs : ce qui fait qu'une lampe a l'air allumée, en plus d'éclairer. Le halo d'un luminaire
 * sur le plafond (cf. fixtures.ts), et les halos des lampes du mobilier, toujours face à la caméra.
 */

let texture: THREE.CanvasTexture | null = null
/** Tache ronde, blanche, qui s'estompe vers le bord. */
export function glowTexture(): THREE.CanvasTexture {
  if (texture) return texture
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  for (const [at, a] of [[0, 1], [0.25, 0.55], [0.55, 0.16], [1, 0]]) grad.addColorStop(at, `rgba(255, 255, 255, ${a})`)
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return (texture = new THREE.CanvasTexture(c))
}

/** Horloge des halos (ceux des flammes tremblent), avancée par l'éclairage (cf. LightRig.update). */
export const haloTime = { value: 0 }

export interface Halo {
  /** Dans le repère de ce qui portera les halos. */
  position: THREE.Vector3
  color: THREE.Color
  /** Rayon, en mètres. */
  size: number
  /** Flamme : le halo tremble. */
  fire?: boolean
}

const QUAD = new THREE.PlaneGeometry(2, 2)
let material: THREE.ShaderMaterial | null = null
const haloMaterial = () =>
  (material ??= new THREE.ShaderMaterial({
    uniforms: { uTime: haloTime },
    vertexShader: `
      attribute vec3 aCenter;
      attribute vec4 aTint;
      attribute vec2 aShape;
      uniform float uTime;
      varying vec2 vAt;
      varying vec4 vTint;
      void main() {
        vAt = position.xy;
        float tremble = 1.0 - aShape.y * 0.22 * (0.5 + 0.5 * sin(uTime * 9.0 + aCenter.x * 7.0 + aCenter.z * 3.0));
        vTint = vec4(aTint.rgb, aTint.a * tremble);
        vec4 mv = modelViewMatrix * vec4(aCenter, 1.0);
        mv.xy += position.xy * aShape.x;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec2 vAt;
      varying vec4 vTint;
      void main() {
        float d = length(vAt);
        float a = pow(max(0.0, 1.0 - d), 2.4) + 0.35 * pow(max(0.0, 1.0 - d * 3.0), 2.0);
        gl_FragColor = vec4(vTint.rgb * a * vTint.a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }))

/** Halos de lampes, face à la caméra, en un appel de dessin ; null s'il n'y en a aucun. */
export function buildHalos(halos: Halo[], opacity = 0.5): THREE.Mesh | null {
  if (!halos.length) return null
  const geo = new THREE.InstancedBufferGeometry()
  geo.index = QUAD.index
  geo.setAttribute('position', QUAD.attributes.position)
  geo.instanceCount = halos.length
  const center = new Float32Array(halos.length * 3), tint = new Float32Array(halos.length * 4), shape = new Float32Array(halos.length * 2)
  halos.forEach((h, i) => {
    h.position.toArray(center, i * 3)
    tint.set([h.color.r, h.color.g, h.color.b, opacity], i * 4)
    shape.set([h.size, h.fire ? 1 : 0], i * 2)
  })
  geo.setAttribute('aCenter', new THREE.InstancedBufferAttribute(center, 3))
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 4))
  geo.setAttribute('aShape', new THREE.InstancedBufferAttribute(shape, 2))
  const mesh = new THREE.Mesh(geo, haloMaterial())
  mesh.frustumCulled = false
  mesh.renderOrder = 3
  return mesh
}

/** Libère les halos qu'on remplace (leur matériau est commun). */
export function disposeHalos(mesh: THREE.Mesh | null) {
  mesh?.removeFromParent()
  mesh?.geometry.dispose()
}
