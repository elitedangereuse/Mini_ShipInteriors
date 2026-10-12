import * as THREE from 'three'

/*
 * Le fond de la scène : l'espace, le ciel de la planète (base au sol), la nuit bleutée du
 * simulateur d'accueil. Il était peint en CSS derrière un canvas transparent ; une lueur additive
 * (halo d'une lampe, jet d'une tuyère, couronne d'une étoile, atmosphère d'une planète) écrivait
 * pourtant une opacité pleine là où elle passait devant le vide, et le fond CSS disparaissait
 * derrière un carré noir. Le canvas est désormais opaque, et ce fond est dessiné par WebGL, aux
 * couleurs des anciens dégradés CSS (celui de l'espace reste le fond de la page, cf. body dans
 * style.css, pendant le chargement) : les lueurs s'y ajoutent comme partout ailleurs. Le navigateur n'a plus à mélanger le canvas avec la
 * page à chaque image, ce qui allège aussi la composition.
 *
 * Un seul triangle plein écran, posé au fond de la profondeur et dessiné après tous les objets
 * opaques : il ne remplit que les pixels où rien d'autre n'a été dessiné (le test de profondeur
 * écarte les autres avant le calcul du pixel), et le verre et les étoiles se mêlent à lui ensuite.
 */

export type BackdropKind = 'space' | 'planet' | 'sim'

/** Côté du dégradé dessiné (pixels) : il est étiré à la taille de l'écran, comme les % du CSS. */
const SIZE = 256

/** Ellipse de dégradé radial, en fractions de la boîte (comme `radial-gradient(ellipse rx ry at cx cy, …)`). */
function radial(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, stops: [number, string][]) {
  g.save()
  g.translate(cx * SIZE, cy * SIZE)
  g.scale(1, ry / rx)
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, rx * SIZE)
  for (const [at, color] of stops) grad.addColorStop(at, color)
  g.fillStyle = grad
  // Toute la boîte, dans le repère de l'ellipse.
  g.fillRect(-cx * SIZE, (-cy * SIZE * rx) / ry, SIZE, (SIZE * rx) / ry)
  g.restore()
}

/** Dégradé vertical, de haut en bas (`linear-gradient(180deg, …)`). */
function vertical(g: CanvasRenderingContext2D, stops: [number, string][]) {
  const grad = g.createLinearGradient(0, 0, 0, SIZE)
  for (const [at, color] of stops) grad.addColorStop(at, color)
  g.fillStyle = grad
  g.fillRect(0, 0, SIZE, SIZE)
}

/**
 * Les fonds de style.css, peints dans un carré. Les « transparent » du CSS se mélangent en couleurs
 * prémultipliées : leur couleur est reprise ici avec une opacité nulle.
 */
const PAINT: Record<BackdropKind, (g: CanvasRenderingContext2D) => void> = {
  // body : radial-gradient(ellipse at 30% 20%, …), l'ellipse qui passe par le coin le plus éloigné.
  space: (g) => radial(g, 0.3, 0.2, Math.SQRT2 * 0.7, Math.SQRT2 * 0.8, [[0, '#2a1f4d'], [0.55, '#0e1024'], [1, '#05060f']]),
  planet: (g) => {
    vertical(g, [[0, '#3b1a2a'], [0.38, '#7a3530'], [0.7, '#b5593c'], [1, '#d98a5c']])
    radial(g, 0.78, 0.12, 0.6, 0.45, [[0, 'rgba(255, 196, 140, 0.55)'], [0.45, 'rgba(255, 150, 96, 0.18)'], [0.75, 'rgba(255, 150, 96, 0)']])
  },
  sim: (g) => {
    vertical(g, [[0, '#03060d'], [0.55, '#060d1c'], [1, '#04070f']])
    radial(g, 0.5, 0.38, 0.7, 0.5, [[0, 'rgba(57, 208, 255, 0.13)'], [0.7, 'rgba(57, 208, 255, 0)']])
  },
}

export class Backdrop {
  readonly mesh: THREE.Mesh
  private readonly canvas = document.createElement('canvas')
  private readonly texture: THREE.CanvasTexture
  private kind: BackdropKind | null = null

  constructor() {
    this.canvas.width = this.canvas.height = SIZE
    this.texture = new THREE.CanvasTexture(this.canvas)
    // Les couleurs du CSS telles quelles : ni conversion d'espace de couleur, ni tone mapping.
    this.texture.colorSpace = THREE.NoColorSpace
    this.texture.generateMipmaps = false
    this.texture.minFilter = THREE.LinearFilter
    this.texture.magFilter = THREE.LinearFilter
    // Un triangle qui couvre tout l'écran (ses coins débordent), au fond de la profondeur.
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))
    const material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: this.texture } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = position.xy * 0.5 + 0.5;
          gl_Position = vec4(position.xy, 1.0, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D uMap;
        varying vec2 vUv;
        void main() {
          // Un grain d'un demi-niveau de couleur : pas de paliers dans un dégradé si sombre.
          float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          gl_FragColor = vec4(texture2D(uMap, vUv).rgb + (n - 0.5) / 255.0, 1.0);
        }`,
      depthWrite: false,
      toneMapped: false,
    })
    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.frustumCulled = false
    // Après tous les objets opaques : seuls les pixels encore vides le dessinent.
    this.mesh.renderOrder = 1e9
    this.mesh.name = 'backdrop'
    this.show('space')
  }

  /** Fond à montrer (celui du pont affiché). */
  show(kind: BackdropKind) {
    if (kind === this.kind) return
    this.kind = kind
    const g = this.canvas.getContext('2d')!
    g.clearRect(0, 0, SIZE, SIZE)
    PAINT[kind](g)
    this.texture.needsUpdate = true
  }
}
