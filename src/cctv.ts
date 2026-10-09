import * as THREE from 'three'
import type { IsoCamera } from './camera'
import { tr } from './i18n'
import { icon } from './icons'

/*
 * Les caméras de surveillance du bord : depuis le pupitre du poste de surveillance (pont principal,
 * sous la Promenade, cf. SURVEILLANCE_ROOM), on regarde les pièces communes des trois ponts, et
 * ceux qui s'y trouvent, à travers un moniteur cathodique. On passe d'une caméra à l'autre ; le
 * personnage, lui, reste assis au pupitre.
 *
 * Ce module ne connaît ni les ponts ni les joueurs : main.ts lui dit comment montrer un pont
 * (`showView`), et lit `target` pour y poser la caméra du jeu, y faire fondre les murs et y
 * montrer les joueurs. Les quartiers de chacun ne sont pas filmés, les toilettes non plus.
 */

export interface ShipCamera {
  /** Ce qu'elle filme, à l'écran. */
  name: string
  /** Pont (cf. levels.ts). */
  level: number
  x: number
  z: number
  /** Demi-hauteur du cadre, en tuiles (cf. IsoCamera.zoomTo). */
  zoom?: number
  /** Quarts de tour depuis la vue par défaut : chaque caméra a son coin de plafond. */
  turn?: number
  /** Pas d'image : ce que dit l'écran, sur sa neige. */
  dead?: string
}

/** Dans l'ordre où le pupitre les fait défiler : le pont principal, le pont supérieur, la cale. */
export const SHIP_CAMERAS: ShipCamera[] = [
  { name: 'Mess', level: 0, x: 12, z: 8.2, zoom: 4.2 },
  { name: tr('Salon d\'arcade', 'Arcade lounge'), level: 0, x: 20.5, z: 7.5, zoom: 4.2, turn: 1 },
  { name: tr('Salle commune', 'Common room'), level: 0, x: 4.5, z: 4.5, zoom: 5 },
  { name: tr('Infirmerie', 'Medical bay'), level: 0, x: 12, z: 1.6, zoom: 3.6, turn: 1 },
  { name: tr('Coursive', 'Corridor'), level: 0, x: 18, z: 4.5, zoom: 4.6 },
  { name: 'Promenade', level: 0, x: 28, z: 4.5, zoom: 4.6, turn: 3 },
  { name: tr('Poste de pilotage', 'Cockpit'), level: 0, x: 35, z: 4.5, zoom: 4.2, turn: 2 },
  { name: tr('Serre', 'Hydroponics bay'), level: 1, x: 4, z: 5.5, zoom: 4.8 },
  { name: tr('Étang', 'Pond'), level: 1, x: 3.6, z: 11, zoom: 3.8, turn: 1 },
  { name: tr('Coursive des cabines', 'Cabin corridor'), level: 1, x: 11.5, z: 4.5, zoom: 4.2 },
  { name: tr('Salon d\'écoute', 'Listening lounge'), level: 1, x: 17.6, z: 5.4, zoom: 3.4, turn: 3 },
  { name: 'Foyer', level: 1, x: 21.6, z: 6.4, zoom: 4, turn: 1 },
  { name: tr('Comptoir des Cartes', 'Card counter'), level: 1, x: 34.5, z: 9.5, zoom: 5.4 },
  { name: tr('Toilettes', 'Restrooms'), level: 1, x: 14, z: 2, dead: tr('SIGNAL COUPÉ · décision du comité de bord', 'FEED CUT · by decision of the ship\'s committee') },
  { name: tr('Palier de la cale', 'Hold landing'), level: -1, x: 10, z: 5, zoom: 3.6 },
  { name: tr('Atelier', 'Workshop'), level: -1, x: 5.6, z: 5, zoom: 4.2, turn: 1 },
  { name: tr('Raffinerie', 'Refinery'), level: -1, x: 14.2, z: 6.4, zoom: 4.2 },
  { name: tr('Lobby de la zone thargoïde', 'Thargoid zone lobby'), level: -1, x: 22.6, z: 5.4, zoom: 4.8, turn: 3 },
  { name: 'Hangar', level: -1, x: 31, z: 5, zoom: 5 },
  { name: 'Chez Jacques', level: -1, x: 13, z: 11, dead: tr('OBJECTIF MASQUÉ · on dirait un béret', 'LENS COVERED · looks like a beret') },
]

export interface CctvHost {
  renderer: THREE.WebGLRenderer
  iso: IsoCamera
  /** Montre le pont `level` ; null : rend la vue au pont du joueur. */
  showView(level: number | null): void
  /** Altitude du pont `level` (y de son sol). */
  floor(level: number): number
  /** Nom du pont `level`, pour l'incrustation. */
  deckName(level: number): string
  /** Sortie son de l'interface (les parasites d'un changement de caméra) ; null si le son est coupé. */
  voice(): AudioNode | null
}

const QUARTER = Math.PI / 2
const pad = (n: number) => String(n).padStart(2, '0')

function button(className: string, glyph: Parameters<typeof icon>[0], label: string, onClick: () => void, text = ''): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = className
  b.title = label
  b.setAttribute('aria-label', label)
  b.append(icon(glyph))
  if (text) b.append(text)
  b.onclick = onClick
  return b
}

export class ShipCameras {
  private index = 0
  private on = false
  /** Ce que la caméra du jeu regarde : le point filmé, au sol de son pont. */
  private readonly focus = new THREE.Vector3()
  /** La vue du joueur avant de s'asseoir au pupitre : on la lui rend. */
  private saved = { heading: 0, zoom: 4.5 }
  /** Parasites (0 à 1) : au changement de caméra, puis ils retombent. */
  private noise = 0
  private clock = 0

  private readonly root = document.createElement('div')
  private readonly number = document.createElement('strong')
  private readonly where = document.createElement('span')
  private readonly deck = document.createElement('span')
  private readonly stamp = document.createElement('time')
  private readonly dead = document.createElement('p')

  private target: THREE.WebGLRenderTarget
  private readonly material: THREE.ShaderMaterial
  private readonly quadScene = new THREE.Scene()
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  /** Ouvert ou refermé. */
  onToggle?: (open: boolean) => void

  constructor(private readonly host: CctvHost) {
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 0 })
    this.material = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: null }, uStatic: { value: 0 }, uDead: { value: 0 }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }`,
      // Le même tube que le moniteur de la zone thargoïde (cf. salvage/fog.ts), en phosphore
      // bleu-blanc : écran bombé, lignes de balayage, couleurs qui bavent, grain, vignette.
      fragmentShader: `
        uniform sampler2D tColor;
        uniform float uStatic;
        uniform float uDead;
        uniform float uTime;
        uniform vec2 uRes;
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          vec2 c = vUv - 0.5;
          vec2 uv = 0.5 + c * (1.0 + 0.2 * dot(c, c));
          // Parasites : les lignes se décalent, l'image saute d'un cran.
          uv.x += (hash(vec2(floor(uv.y * 110.0), floor(uTime * 30.0))) - 0.5) * 0.05 * uStatic;
          uv.y += step(0.985, hash(vec2(floor(uTime * 9.0), 3.0))) * 0.012;
          if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
            return;
          }
          vec2 shift = (uv - 0.5) * 0.007 + vec2(0.0016, 0.0);
          vec3 rgb = vec3(texture2D(tColor, uv + shift).r, texture2D(tColor, uv).g, texture2D(tColor, uv - shift).b);
          // Une caméra de surveillance : presque du noir et blanc, tiré vers le bleu du phosphore.
          float lum = dot(rgb, vec3(0.299, 0.587, 0.114));
          rgb = mix(rgb, vec3(lum * 0.86, lum * 1.02, lum * 1.16), 0.72) * 1.18 + vec3(0.004, 0.008, 0.014);
          float grain = hash(uv * uRes + fract(uTime * 7.0) * 100.0);
          rgb = mix(rgb, vec3(grain * 0.42), clamp(max(uStatic, uDead), 0.0, 1.0) * 0.9);
          float line = 0.8 + 0.2 * sin(uv.y * uRes.y * 1.25);
          float band = exp(-pow((fract(uv.y * 0.7 - uTime * 0.11) - 0.5) * 14.0, 2.0)) * 0.07;
          rgb = rgb * line * (0.97 + 0.03 * sin(uTime * 55.0)) + band + (grain - 0.5) * 0.06;
          float vig = pow(max(0.0, 16.0 * uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y)), 0.3);
          gl_FragColor = vec4(max(rgb * vig, vec3(0.0)), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      depthTest: false,
      depthWrite: false,
    })
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
    quad.frustumCulled = false
    this.quadScene.add(quad)
    this.build()
  }

  private build() {
    this.root.className = 'cctv'
    this.root.hidden = true
    // L'incrustation de la caméra, aux quatre coins du tube.
    const top = document.createElement('div')
    top.className = 'cctv-top'
    const rec = document.createElement('span')
    rec.className = 'cctv-rec'
    rec.textContent = 'REC'
    const label = document.createElement('div')
    label.className = 'cctv-label'
    label.append(this.number, this.where)
    top.append(label, rec)
    const bottom = document.createElement('div')
    bottom.className = 'cctv-bottom'
    bottom.append(this.deck, this.stamp)
    this.dead.className = 'cctv-dead'
    // Le bandeau de commande, comme celui des caméras de la zone thargoïde.
    const bar = document.createElement('div')
    bar.className = 'cctv-bar'
    bar.append(
      button('cctv-step', 'caret-left', tr('Caméra précédente (←)', 'Previous camera (←)'), () => this.cycle(-1)),
      button('cctv-step', 'caret-right', tr('Caméra suivante (→)', 'Next camera (→)'), () => this.cycle(1)),
      button('cctv-quit', 'sign-out', tr('Quitter les caméras (Échap)', 'Leave the cameras (Esc)'), () => this.close(), tr('Quitter', 'Leave')),
    )
    this.root.append(top, this.dead, bottom, bar)
    document.body.append(this.root)
  }

  get active(): boolean {
    return this.on
  }

  /** Ce que filme la caméra en cours (au sol de son pont) ; null hors des caméras. */
  get target3(): THREE.Vector3 | null {
    return this.on ? this.focus : null
  }

  get current(): ShipCamera {
    return SHIP_CAMERAS[this.index]
  }

  open() {
    if (this.on) return
    this.on = true
    this.saved = { heading: this.host.iso.heading, zoom: this.host.iso.zoomLevel }
    this.root.hidden = false
    document.body.classList.add('cctv-on')
    this.show(this.index, 1)
    this.onToggle?.(true)
  }

  /** `restore` : rend la vue au pont du joueur (false : main.ts s'en charge, le joueur change de pont). */
  close(restore = true) {
    if (!this.on) return
    this.on = false
    this.root.hidden = true
    document.body.classList.remove('cctv-on')
    this.host.iso.turnTo(this.saved.heading, false)
    this.host.iso.zoomTo(this.saved.zoom)
    if (restore) this.host.showView(null)
    this.onToggle?.(false)
  }

  cycle(step: 1 | -1) {
    if (this.on) this.show((this.index + step + SHIP_CAMERAS.length) % SHIP_CAMERAS.length, 0.8)
  }

  private show(index: number, noise: number) {
    this.index = index
    const cam = this.current
    this.host.showView(cam.level)
    this.focus.set(cam.x, this.host.floor(cam.level), cam.z)
    const iso = this.host.iso
    iso.turnTo(this.saved.heading + (cam.turn ?? 0) * QUARTER)
    iso.zoomTo(cam.zoom ?? 4.5)
    iso.snapTo(this.focus)
    this.noise = noise
    this.hiss(noise > 0.9 ? 0.5 : 0.28)
    this.number.textContent = `CAM ${pad(index + 1)}`
    this.where.textContent = cam.name.toUpperCase()
    this.deck.textContent = this.host.deckName(cam.level).toUpperCase()
    this.dead.textContent = cam.dead ?? ''
    this.dead.hidden = !cam.dead
  }

  /** Les parasites d'un changement de caméra : un souffle filtré, qui retombe. */
  private hiss(length: number) {
    const out = this.host.voice()
    if (!out) return
    const ctx = out.context
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * length), ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 1.5
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 2600
    filter.Q.value = 0.5
    const gain = ctx.createGain()
    gain.gain.value = 0.5
    source.connect(filter).connect(gain).connect(out)
    source.start()
  }

  /** Les touches du pupitre ; rend true si la touche est pour lui. */
  keyDown(e: KeyboardEvent): boolean {
    if (!this.on) return false
    if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'KeyQ') this.cycle(-1)
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') this.cycle(1)
    else if (e.code === 'Escape' || e.code === 'KeyE') this.close()
    // Le reste du clavier ne fait rien tant qu'on regarde les écrans (ni marcher, ni ouvrir un panneau).
    return e.code !== 'KeyM' && e.code !== 'Enter'
  }

  /** L'horloge de l'incrustation, à la seconde. */
  private tick() {
    const d = new Date()
    const text = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear() + 1286} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    if (this.stamp.textContent !== text) this.stamp.textContent = text
  }

  /** Rend la scène à travers le tube ; false hors des caméras (main.ts la rend alors comme d'habitude). */
  render(scene: THREE.Scene, camera: THREE.Camera, dt: number): boolean {
    if (!this.on) return false
    this.clock += dt
    this.noise = Math.max(0, this.noise - dt * 1.5)
    this.tick()
    const r = this.host.renderer
    const size = r.getDrawingBufferSize(new THREE.Vector2())
    if (this.target.width !== size.x || this.target.height !== size.y) this.target.setSize(size.x, size.y)
    const u = this.material.uniforms
    u.uStatic.value = this.noise
    u.uDead.value = this.current.dead ? 1 : 0
    u.uTime.value = this.clock
    u.uRes.value.set(size.x, size.y)
    u.tColor.value = this.target.texture
    r.setRenderTarget(this.target)
    r.clear()
    r.render(scene, camera)
    r.setRenderTarget(null)
    r.render(this.quadScene, this.quadCamera)
    return true
  }
}
