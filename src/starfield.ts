import * as THREE from 'three'

const SIZE = 140
const DEPTH = -30

/**
 * Étoiles qui défilent sous le vaisseau (vers l'ouest : le vaisseau file vers l'est).
 * Tout est calculé dans le vertex shader (aucune mise à jour CPU) ; trois couches
 * à des vitesses différentes donnent un effet de parallaxe, même en orthographique.
 */
export class Starfield {
  readonly group = new THREE.Group()
  private materials: THREE.ShaderMaterial[] = []
  private time = 0

  constructor() {
    const layers = [
      { count: 1800, size: 2, speed: 1.5, color: '#9aa2d8' },
      { count: 700, size: 2.8, speed: 4, color: '#d4daff' },
      { count: 160, size: 3.6, speed: 9, color: '#ffffff' },
    ]
    for (const l of layers) {
      const pos = new Float32Array(l.count * 3)
      const tw = new Float32Array(l.count)
      for (let i = 0; i < l.count; i++) {
        pos[i * 3] = Math.random() * SIZE
        pos[i * 3 + 1] = DEPTH - Math.random() * 20
        pos[i * 3 + 2] = Math.random() * SIZE
        tw[i] = Math.random() * Math.PI * 2
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      geo.setAttribute('aPhase', new THREE.BufferAttribute(tw, 1))
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uSpeed: { value: l.speed },
          uCenter: { value: new THREE.Vector3() },
          uSize: { value: l.size * Math.min(devicePixelRatio, 2) },
          uColor: { value: new THREE.Color(l.color) },
        },
        vertexShader: `
          uniform float uTime, uSpeed, uSize;
          uniform vec3 uCenter;
          attribute float aPhase;
          varying float vTwinkle;
          const float SIZE = ${SIZE.toFixed(1)};
          void main() {
            vec3 p = position;
            // Défilement + enroulement dans une boîte centrée sur le regard de la caméra.
            p.x = mod(p.x - uTime * uSpeed - uCenter.x, SIZE) + uCenter.x - SIZE * 0.5;
            p.z = mod(p.z - uCenter.z, SIZE) + uCenter.z - SIZE * 0.5;
            vTwinkle = 0.75 + 0.25 * sin(uTime * 2.0 + aPhase);
            gl_PointSize = uSize;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: `
          uniform vec3 uColor;
          varying float vTwinkle;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.15, d);
            gl_FragColor = vec4(uColor, a * 0.9 * vTwinkle);
          }`,
        transparent: true,
        depthWrite: false,
      })
      const points = new THREE.Points(geo, mat)
      points.frustumCulled = false
      points.renderOrder = -1
      this.group.add(points)
      this.materials.push(mat)
    }
  }

  /** @param toCamera direction horizontale de la cible vers la caméra */
  update(dt: number, target: THREE.Vector3, toCamera: THREE.Vector3) {
    this.time += dt
    // Point où le regard de la caméra traverse la couche d'étoiles (élévation isométrique : tan = 1/√2).
    const drop = target.y - (DEPTH - 10)
    const cx = target.x - toCamera.x * drop * Math.SQRT2
    const cz = target.z - toCamera.z * drop * Math.SQRT2
    for (const m of this.materials) {
      m.uniforms.uTime.value = this.time
      m.uniforms.uCenter.value.set(cx, 0, cz)
    }
  }
}
