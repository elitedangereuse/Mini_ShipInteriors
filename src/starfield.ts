import * as THREE from 'three'

const SIZE = 140
const DEPTH = -30

/**
 * Étoiles qui défilent sous le vaisseau (vers l'ouest : le vaisseau file vers l'est).
 * Tout est calculé dans le vertex shader (aucune mise à jour CPU) ; trois couches
 * à des vitesses différentes donnent un effet de parallaxe, même en orthographique.
 * Pendant un saut FSD (cf. warp), elles accélèrent et s'étirent en traînées.
 */
export class Starfield {
  readonly group = new THREE.Group()
  private materials: THREE.ShaderMaterial[] = []
  private time = 0
  /** Distance parcourue (en secondes de défilement normal) : elle s'accélère pendant un saut. */
  private travel = 0
  private speed = 1
  private target = 1
  private streaks: THREE.ShaderMaterial

  constructor() {
    const layers = [
      { count: 1800, size: 2, speed: 1.5, color: '#9aa2d8' },
      { count: 700, size: 2.8, speed: 4, color: '#d4daff' },
      { count: 160, size: 3.6, speed: 9, color: '#ffffff' },
    ]
    const common = `
      uniform float uTravel, uSpeed;
      uniform vec3 uCenter;
      const float SIZE = ${SIZE.toFixed(1)};
      vec3 wrap(vec3 p) {
        // Défilement + enroulement dans une boîte centrée sur le regard de la caméra.
        p.x = mod(p.x - uTravel * uSpeed - uCenter.x, SIZE) + uCenter.x - SIZE * 0.5;
        p.z = mod(p.z - uCenter.z, SIZE) + uCenter.z - SIZE * 0.5;
        return p;
      }`
    // Traînées du saut : un segment par étoile des deux couches proches, qui s'allonge avec la vitesse.
    this.streaks = new THREE.ShaderMaterial({
      uniforms: { uTravel: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uLength: { value: 0 }, uAlpha: { value: 0 } },
      vertexShader: `
        uniform float uTravel, uLength;
        uniform vec3 uCenter;
        attribute float aEnd;
        attribute float aSpeed;
        varying float vFade;
        const float SIZE = ${SIZE.toFixed(1)};
        void main() {
          // Chaque traînée part de son étoile (même défilement, à la vitesse de sa couche)…
          vec3 p = position;
          p.x = mod(p.x - uTravel * aSpeed - uCenter.x, SIZE) + uCenter.x - SIZE * 0.5;
          p.z = mod(p.z - uCenter.z, SIZE) + uCenter.z - SIZE * 0.5;
          // … et s'étire derrière elle ; les étoiles proches, plus rapides, en laissent de plus longues.
          p.x += aEnd * uLength * aSpeed / 9.0;
          vFade = 1.0 - aEnd;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        uniform float uAlpha;
        varying float vFade;
        void main() {
          gl_FragColor = vec4(vec3(0.82, 0.9, 1.0), uAlpha * (0.25 + 0.75 * vFade));
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const segments: number[] = [], ends: number[] = [], kinds: number[] = []
    for (const l of layers) {
      const pos = new Float32Array(l.count * 3)
      const tw = new Float32Array(l.count)
      for (let i = 0; i < l.count; i++) {
        pos[i * 3] = Math.random() * SIZE
        pos[i * 3 + 1] = DEPTH - Math.random() * 20
        pos[i * 3 + 2] = Math.random() * SIZE
        tw[i] = Math.random() * Math.PI * 2
        if (l.speed > 2) {
          for (const end of [0, 1]) {
            segments.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])
            ends.push(end)
            kinds.push(l.speed)
          }
        }
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      geo.setAttribute('aPhase', new THREE.BufferAttribute(tw, 1))
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uTravel: { value: 0 },
          uSpeed: { value: l.speed },
          uCenter: { value: new THREE.Vector3() },
          uSize: { value: l.size * Math.min(devicePixelRatio, 2) },
          uColor: { value: new THREE.Color(l.color) },
        },
        vertexShader: `
          ${common}
          uniform float uTime, uSize;
          attribute float aPhase;
          varying float vTwinkle;
          void main() {
            vec3 p = wrap(position);
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
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(segments, 3))
    geo.setAttribute('aEnd', new THREE.Float32BufferAttribute(ends, 1))
    geo.setAttribute('aSpeed', new THREE.Float32BufferAttribute(kinds, 1))
    const lines = new THREE.LineSegments(geo, this.streaks)
    lines.frustumCulled = false
    lines.renderOrder = -1
    this.group.add(lines)
    this.materials.push(this.streaks)
  }

  /** Vitesse du défilement : 1 en croisière, bien plus pendant un saut FSD. */
  warp(factor: number) {
    this.target = factor
  }

  /**
   * @param toCamera direction horizontale de la cible vers la caméra
   * @param elevation inclinaison de la caméra (radians)
   */
  update(dt: number, target: THREE.Vector3, toCamera: THREE.Vector3, elevation: number) {
    this.time += dt
    // On accélère franchement, on freine plus en douceur.
    this.speed = THREE.MathUtils.damp(this.speed, this.target, this.target > this.speed ? 1.6 : 1.1, dt)
    this.travel += dt * this.speed
    // Point où le regard de la caméra traverse la couche d'étoiles.
    const run = (target.y - (DEPTH - 10)) / Math.tan(elevation)
    const cx = target.x - toCamera.x * run
    const cz = target.z - toCamera.z * run
    for (const m of this.materials) {
      if (m.uniforms.uTime) m.uniforms.uTime.value = this.time
      m.uniforms.uTravel.value = this.travel
      m.uniforms.uCenter.value.set(cx, 0, cz)
    }
    const boost = Math.max(0, this.speed - 1)
    this.streaks.uniforms.uLength.value = Math.min(30, boost * 0.5)
    this.streaks.uniforms.uAlpha.value = Math.min(0.9, boost / 12)
  }
}
