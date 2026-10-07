import * as THREE from 'three'
import { BLASTER_PACK, packModel } from './assets'
import { fetchBoard, localBest, saveLocalBest, submitScore } from './arcade/scores'
import { RANGE_ID } from './arcade/game'
import { formatCredits } from './economy/data'
import type { Wallet } from './economy/wallet'
import { tr } from './i18n'
import type { Dialog } from './ui'
import { SHOOTING_RANGE } from '../shared/ship-layouts.js'

/*
 * Stand de tir de la cale : on prend une arme au râtelier, et des cibles sortent du sol entre le
 * comptoir et le mur du fond. On reste libre de ses mouvements, derrière le comptoir. Pas de
 * visée automatique : la balle part là où l'on vise.
 *
 * - Vue subjective : la souris tourne le regard, la mire est au centre, la balle part des yeux.
 *   L'arme est à l'écran ; elle recule, le regard se cabre, la vue tremble.
 * - Vue de dessus (la vue isométrique, relevée, tournée vers les cibles) : façon « twin-stick », le
 *   personnage se tourne vers le curseur, un laser montre la ligne de tir. Laser, balles et cibles
 *   sont alors à la même hauteur (AIM_Y) : ce que le curseur recouvre est ce qu'on touche.
 *
 * Les balles sont de vrais projectiles, très rapides, qui laissent une fine traînée ; une cible
 * touchée éclate. Le chrono part au premier tir ; chaque palier de score rend du temps, et les
 * cibles deviennent plus petites, plus mobiles, plus brèves.
 *
 * Tout se joue chez le joueur : les autres le voient bouger et se tourner, pas ses tirs.
 */

const R = SHOOTING_RANGE
/** Hauteur du plafond des pièces (cf. CEILING_Y dans deck.ts). */
const CEILING = 2.2
/** Hauteur de la ligne de tir en vue de dessus : celle des mains, et alors celle des cibles. */
const AIM_Y = 0.4
/** Rangées de cibles (cf. les fentes du sol dans furniture/range.ts), de la plus loin à la plus proche. */
const ROWS = [R.minZ + 0.2, R.minZ + 1.0, R.minZ + 1.8]
const LANE_MIN = R.minX + 0.4, LANE_MAX = R.maxX - 0.4

const START_TIME = 40
const BONUS_TIME = 6
/** Score du palier `n` (1, 2, 3…) : 1 000, 3 000, 6 000, 10 000… ; de plus en plus loin l'un de l'autre. */
export const rangeTier = (n: number) => 500 * n * (n + 1)
/**
 * Points d'une cible : 100 (150 pour une petite), 50 de plus en plein centre, et 10 par cible
 * touchée d'affilée, jusqu'à 100. Au plus 300 : le site en tient compte (cf. scores.php).
 */
export function rangePoints(small: boolean, bullseye: boolean, streak: number): number {
  return (small ? 150 : 100) + (bullseye ? 50 : 0) + Math.min(streak, 10) * 10
}
/** Le stand au palier atteint : cibles à la fois, délai entre deux, durée de vie, part de petites et de mobiles, leur vitesse. */
export function rangeLevel(level: number) {
  return {
    alive: Math.min(6, 3 + Math.floor(level / 2)),
    // Jamais plus de 2,5 cibles par seconde : c'est ce qui borne le score (cf. scores.php).
    every: Math.max(0.4, 0.85 - 0.06 * level),
    life: Math.max(1.7, 4.6 - 0.3 * level),
    small: Math.min(0.6, 0.15 + 0.06 * level),
    moving: level < 1 ? 0 : Math.min(0.7, 0.2 + 0.08 * level),
    speed: Math.min(2, 0.5 + 0.15 * level),
  }
}

interface Weapon {
  id: string
  name: string
  model: string
  /** Tire tant que la détente est tenue. */
  auto: boolean
  /** Délai entre deux tirs, taille du chargeur, durée du rechargement (secondes). */
  interval: number
  mag: number
  reload: number
  /** Vitesse de la balle (tuiles par seconde). */
  speed: number
  /** Recul : le regard se cabre de cet angle (radians) ; `shake` : secousse de la vue. */
  kick: number
  shake: number
  /** Dispersion (radians). */
  spread: number
  /** La balle traverse les cibles. */
  pierce: boolean
  heavy: boolean
  /** Hauteur du son. */
  pitch: number
  /** Poignée, dans le repère du modèle (canon vers +z) : c'est elle qu'on tient. */
  grip: [number, number]
}

const WEAPONS: Weapon[] = [
  { id: 'pistol', name: tr('Pistolet', 'Pistol'), model: 'blaster-b', auto: false, interval: 0.13, mag: 12, reload: 1, speed: 30, kick: 0.017, shake: 0.5, spread: 0, pierce: false, heavy: false, pitch: 1, grip: [-0.08, -0.12] },
  { id: 'smg', name: tr('Mitraillette', 'SMG'), model: 'blaster-a', auto: true, interval: 0.085, mag: 30, reload: 1.5, speed: 30, kick: 0.007, shake: 0.32, spread: THREE.MathUtils.degToRad(1.3), pierce: false, heavy: false, pitch: 1.3, grip: [-0.1, -0.14] },
  { id: 'rifle', name: tr('Fusil', 'Rifle'), model: 'blaster-e', auto: false, interval: 0.75, mag: 5, reload: 1.8, speed: 70, kick: 0.05, shake: 1.3, spread: 0, pierce: true, heavy: true, pitch: 1, grip: [-0.1, 0.3] },
]

/** Viseur : ses motifs (tracés dans un carré de -16 à 16) et ses couleurs. */
const RETICLES: Record<string, string> = {
  cross: '<path d="M0-11V-4M0 4V11M-11 0H-4M4 0H11"/>',
  dot: '<circle r="2.2" class="fill"/>',
  circle: '<circle r="8"/><circle r="1.3" class="fill"/>',
  tee: '<path d="M0 4V11M-11 0H-4M4 0H11"/><circle r="1.3" class="fill"/>',
  chevron: '<path d="M-8 9L0 0L8 9"/>',
  corners: '<path d="M-9-4V-9H-4M4-9H9V-4M9 4V9H4M-4 9H-9V4"/><circle r="1.3" class="fill"/>',
}
const RETICLE_IDS = Object.keys(RETICLES)
const RETICLE_NAMES: Record<string, string> = {
  cross: tr('Croix', 'Cross'), dot: tr('Point', 'Dot'), circle: tr('Cercle', 'Circle'), tee: tr('Té', 'Tee'), chevron: tr('Chevron', 'Chevron'), corners: tr('Cadre', 'Frame'),
}
const RETICLE_COLORS = ['#ffffff', '#3dff7a', '#38e8ff', '#ffe14a', '#ff8a1c', '#ff4fd8', '#ff4a3d']
const RETICLE_KEY = 'mini-shipinteriors-reticle'

function savedReticle(): { motif: string; color: number } {
  try {
    const [motif, color] = (localStorage.getItem(RETICLE_KEY) ?? '').split(':')
    if (RETICLES[motif] && RETICLE_COLORS[Number(color)]) return { motif, color: Number(color) }
  } catch {}
  return { motif: 'cross', color: 0 }
}

interface Target {
  root: THREE.Group
  disc: THREE.Object3D
  pole: THREE.Mesh
  small: boolean
  r: number
  /** Milieu de sa course, rangée, position courante. */
  x0: number
  z: number
  x: number
  y: number
  /** Hauteur en vue subjective (en vue de dessus : AIM_Y). */
  high: number
  amp: number
  speed: number
  phase: number
  life: number
  age: number
  /** Sortie du sol (0 à 1) ; `leaving` : elle y rentre. */
  k: number
  leaving: boolean
}

interface Bullet {
  p: THREE.Vector3
  d: THREE.Vector3
  speed: number
  pierce: boolean
  /** A touché une cible : un tir qui ne touche rien casse la série. */
  scored: boolean
  tracer: Tracer
}

/** Traînée d'une balle : du canon à la balle, puis elle s'efface. */
interface Tracer {
  mesh: THREE.Mesh
  from: THREE.Vector3
  /** Épaisseur : plus fine en vue subjective, où elle part de sous le nez. */
  thick: number
  age: number
  flying: boolean
}

interface Debris {
  mesh: THREE.Object3D
  v: THREE.Vector3
  spin: THREE.Vector3
  age: number
  life: number
  /** Éclat de cible (il rebondit au sol), ou étincelle. */
  heavy: boolean
}

/** Arme tenue : son modèle, poignée à l'origine, canon vers +z ; `muzzle` : la bouche du canon. */
interface Gun {
  root: THREE.Group
  muzzle: THREE.Vector3
}

export type RangeSound = 'shot' | 'heavy' | 'hit' | 'bullseye' | 'wall' | 'reload' | 'loaded' | 'dry' | 'switch' | 'tier' | 'end'

/** Ce que la boucle du jeu donne au stand à chaque image (cf. main.ts). */
export interface RangeFrame {
  /** Vue subjective (sinon : vue de dessus). */
  fps: boolean
  /** Le personnage est à l'image (vue de dessus, ou caméra derrière lui). */
  body: boolean
  camera: THREE.Camera
  /** Pieds du joueur, et le point entre ses mains (monde) s'il a deux bras. */
  player: THREE.Vector3
  hands: THREE.Vector3 | null
  moving: boolean
  /** Tourne le regard de la vue subjective (recul). */
  look: (dYaw: number, dPitch: number) => void
}

interface Hud {
  root: HTMLElement
  score: HTMLElement
  time: HTMLElement
  best: HTMLElement
  tier: HTMLElement
  flash: HTMLElement
  streak: HTMLElement
  ammo: HTMLElement
  reload: HTMLElement
  slots: HTMLElement[]
  reticle: HTMLElement
  motif: HTMLElement
  help: HTMLElement
}

const Z = new THREE.Vector3(0, 0, 1)
const UP = new THREE.Vector3(0, 1, 0)
const _v = new THREE.Vector3()
const _w = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _ray = new THREE.Raycaster()
const _ndc = new THREE.Vector2()
const _plane = new THREE.Plane()
const _box = new THREE.Box3()
const rand = (a: number) => (Math.random() * 2 - 1) * a
const easeOutBack = (u: number) => 1 + 2.7 * (u - 1) ** 3 + 1.7 * (u - 1) ** 2

/** Pavé d'un mètre le long de +z, à étirer d'un point à un autre (traînées, laser). */
const BEAM = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5)
function stretch(mesh: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, thick: number) {
  const len = _v.subVectors(to, from).length()
  mesh.position.copy(from)
  if (len > 1e-5) mesh.quaternion.setFromUnitVectors(Z, _v.divideScalar(len))
  mesh.scale.set(thick, thick, Math.max(len, 1e-4))
}

export class RangeGame {
  private session?: {
    score: number
    level: number
    hits: number
    shots: number
    streak: number
    best: number
    timeLeft: number
    elapsed: number
    /** Le chrono tourne (depuis le premier tir). */
    started: boolean
    weapon: number
    ammo: number[]
    /** Temps restant avant le prochain tir, et du rechargement en cours (0 : aucun). */
    cooldown: number
    reload: number
    spawn: number
    targets: Target[]
    bullets: Bullet[]
    hud: Hud
    flashTime: number
  }
  private revision = 0
  private readonly live = new THREE.Group()
  /** Cibles d'exposition, quand personne ne tire. */
  private readonly idle = new THREE.Group()
  private readonly laser: THREE.Mesh
  private readonly laserDot: THREE.Mesh
  private readonly flash: THREE.Mesh
  /** Armes en main (vue de dessus) et à l'écran (vue subjective), par arme. */
  private hand: Gun[] = []
  private view: Gun[] = []
  private tracers: Tracer[] = []
  private spare: THREE.Mesh[] = []
  private debris: Debris[] = []
  private holes: { mesh: THREE.Mesh; age: number }[] = []
  private readonly spark = new THREE.BoxGeometry(0.018, 0.018, 0.018)
  private readonly sparkGlow = new THREE.MeshBasicMaterial({ color: '#ffd27a' })
  private readonly hole = new THREE.CircleGeometry(0.02, 10)
  private readonly poleGeo = new THREE.CylinderGeometry(0.012, 0.016, 1, 6).translate(0, 0.5, 0)
  private readonly poleMat = new THREE.MeshLambertMaterial({ color: '#2a2d33' })

  /** Détente tenue ; `queued` : un appui attend la fin du délai entre deux tirs. */
  private held = false
  private queued = false
  /** Direction de tir (repère du pont), et le curseur qui la donne en vue de dessus (null : le stick). */
  private readonly aim = new THREE.Vector3(0, 0, -1)
  private readonly aimPoint = new THREE.Vector3()
  private pointer: { x: number; y: number } | null = null
  /** Sensations : recul de l'arme (0 à 1), cabrage du regard à rendre, secousse, ouverture du champ, éclair. */
  private kick = 0
  private recoil = 0
  private shake = 0
  private punch = 0
  private flashTime = 0
  private hitTime = 0
  private dip = 0
  private bob = 0
  private baseFov = 0
  private readonly sway = new THREE.Vector2()
  private readonly lastDir = new THREE.Vector3()
  private reticle = savedReticle()

  /** Bruitages (cf. main.ts) : `at`, là où cela se passe, dans le repère du pont ; null : à l'oreille. */
  onSound?: (sound: RangeSound, at: THREE.Vector3 | null, pitch: number) => void
  /** La partie commence, ou s'arrête : la vue de dessus se cadre, le personnage lève son arme. */
  onToggle?: (on: boolean) => void

  /** @param group la cale : cibles et balles y vivent, dans son repère */
  constructor(private group: THREE.Object3D, private dialog: Dialog, private wallet: Wallet) {
    group.add(this.live, this.idle)
    this.laser = new THREE.Mesh(BEAM, new THREE.MeshBasicMaterial({ color: '#ff3b2f', transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }))
    this.laserDot = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff6a5a' }))
    // Éclair du canon : deux plans croisés, le long de +z.
    const burst = new THREE.PlaneGeometry(0.16, 0.16)
    const cross = new THREE.BufferGeometry().copy(burst).rotateY(Math.PI / 2)
    const flare = new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    this.flash = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.16, 6).rotateX(Math.PI / 2).translate(0, 0, 0.08), flare)
    this.flash.add(new THREE.Mesh(burst, flare), new THREE.Mesh(cross, flare))
    this.live.add(this.laser, this.laserDot, this.flash)
    this.live.visible = false
    // Quatre cibles restent sorties tant que personne ne tire.
    ;[[12.5, 2, false, 0.5], [13.6, 0, true, 0.75], [14.7, 1, false, 0.42], [15.7, 0, false, 0.62]].forEach(([x, row, small, y]) => {
      const t = this.makeTarget(small as boolean)
      t.root.position.set(x as number, 0, ROWS[row as number])
      t.disc.position.y = y as number
      t.pole.scale.y = y as number
      this.idle.add(t.root)
    })
  }

  get active() { return !!this.session }

  /** Cap du personnage (cf. Player.setHeading) : tourné vers ce qu'il vise. */
  get heading(): number {
    return Math.atan2(this.aim.x, this.aim.z)
  }

  /** Le joueur est-il dans le stand ? (repère du pont) */
  contains(p: { x: number; z: number }): boolean {
    return p.x > R.minX - 0.15 && p.x < R.maxX + 0.15 && p.z > R.minZ - 0.15 && p.z < R.maxZ + 0.15
  }

  start() {
    if (this.session) this.finish(null)
    const revision = ++this.revision
    if (!this.hand.length) {
      this.hand = WEAPONS.map((w) => this.makeGun(w, 0.4))
      this.view = WEAPONS.map((w) => this.makeGun(w, 0.2))
    }
    this.session = {
      score: 0, level: 0, hits: 0, shots: 0, streak: 0, best: localBest(RANGE_ID), timeLeft: START_TIME, elapsed: 0, started: false,
      weapon: 0, ammo: WEAPONS.map((w) => w.mag), cooldown: 0.25, reload: 0, spawn: 0, targets: [], bullets: [], hud: this.buildHud(), flashTime: 0,
    }
    this.held = this.queued = false
    this.kick = this.recoil = this.shake = this.punch = this.flashTime = this.hitTime = 0
    this.dip = 1
    this.aim.set(0, 0, -1)
    this.pointer = null
    this.live.visible = true
    this.idle.visible = false
    document.body.classList.add('range-on')
    this.drawReticle()
    this.onToggle?.(true)
    void fetchBoard(RANGE_ID).then((board) => {
      if (revision !== this.revision || !this.session) return
      if (board?.me) this.session.best = Math.max(this.session.best, board.me.score)
    })
  }

  stop() { this.finish(tr('Arme rendue.', 'Weapon returned.')) }

  // ------------------------------------------------------------------ commandes

  /** Détente appuyée ou relâchée (clic, Espace, bouton). */
  trigger(on: boolean) {
    if (!this.session) return
    if (on && !this.held) this.queued = true
    this.held = on
  }

  /** Un tir, sans tenir la détente (bouton tactile). */
  tap() {
    if (this.session) this.queued = true
  }

  /** Vue de dessus : le curseur (ou le doigt) donne le point visé. */
  aimAt(clientX: number, clientY: number) {
    if (this.session) this.pointer = { x: clientX, y: clientY }
  }

  /** Vue de dessus, au stick : direction visée, au sol (repère du pont). */
  aimToward(x: number, z: number) {
    if (!this.session || Math.hypot(x, z) < 0.3) return
    this.pointer = null
    this.aim.set(x, 0, z).normalize()
  }

  select(index: number) {
    const s = this.session
    if (!s || index === s.weapon || !WEAPONS[index]) return
    s.weapon = index
    s.reload = 0
    s.cooldown = Math.max(s.cooldown, 0.3)
    this.queued = false
    this.dip = 1
    this.onSound?.('switch', null, 1)
    if (!s.ammo[index]) this.reload()
  }

  reload() {
    const s = this.session
    if (!s || s.reload > 0 || s.ammo[s.weapon] >= WEAPONS[s.weapon].mag) return
    s.reload = WEAPONS[s.weapon].reload
    this.queued = false
    this.onSound?.('reload', null, 1)
  }

  /** Motif suivant du viseur, ou couleur suivante. */
  cycleReticle(what: 'motif' | 'color') {
    if (what === 'motif') this.reticle.motif = RETICLE_IDS[(RETICLE_IDS.indexOf(this.reticle.motif) + 1) % RETICLE_IDS.length]
    else this.reticle.color = (this.reticle.color + 1) % RETICLE_COLORS.length
    try {
      localStorage.setItem(RETICLE_KEY, `${this.reticle.motif}:${this.reticle.color}`)
    } catch {}
    this.drawReticle()
  }

  /** @returns true si la touche est prise par le stand (les déplacements, la vue, le chat restent au jeu) */
  key(e: KeyboardEvent): boolean {
    if (!this.session) return false
    const weapon = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code)
    if (weapon >= 0) this.select(weapon)
    else if (e.code === 'Escape') this.stop()
    else if (e.code === 'KeyR') this.reload()
    else if (e.code === 'KeyC') { if (!e.repeat) this.cycleReticle('motif') }
    else if (e.code === 'KeyX') { if (!e.repeat) this.cycleReticle('color') }
    else if (e.code === 'Space') { if (!e.repeat) this.trigger(true) }
    // Les autres chiffres sont des emotes : pas l'arme à la main.
    else if (!/^Digit\d$/.test(e.code)) return false
    e.preventDefault()
    return true
  }

  keyUp(e: KeyboardEvent) {
    if (this.session && e.code === 'Space') this.trigger(false)
  }

  // ------------------------------------------------------------------ partie

  /** @param dt temps écoulé (secondes) */
  update(dt: number, f: RangeFrame) {
    const s = this.session
    if (!s) return
    const w = WEAPONS[s.weapon]
    const origin = this.group.getWorldPosition(_w)
    const foot = new THREE.Vector3().subVectors(f.player, origin)

    // Où l'on vise, et d'où part la balle.
    const eye = new THREE.Vector3()
    if (f.fps) {
      f.camera.getWorldDirection(this.aim)
      f.camera.getWorldPosition(eye).sub(origin)
    } else {
      if (this.pointer) {
        _ndc.set((this.pointer.x / innerWidth) * 2 - 1, -(this.pointer.y / innerHeight) * 2 + 1)
        _ray.setFromCamera(_ndc, f.camera)
        _plane.set(UP, -(origin.y + AIM_Y))
        if (_ray.ray.intersectPlane(_plane, _v)) {
          this.aimPoint.copy(_v).sub(origin)
          _v.set(this.aimPoint.x - foot.x, 0, this.aimPoint.z - foot.z)
          if (_v.length() > 0.2) this.aim.copy(_v).normalize()
        }
      } else this.aim.setY(0).normalize()
      eye.set(foot.x + this.aim.x * 0.3, AIM_Y, foot.z + this.aim.z * 0.3)
      if (!this.pointer) this.aimPoint.copy(eye).addScaledVector(this.aim, 2)
    }

    // L'arme : en main, ou à l'écran (placée plus bas, une fois la vue secouée).
    const shown = f.fps && !f.body ? this.view[s.weapon] : f.body ? this.hand[s.weapon] : null
    for (const gun of [...this.hand, ...this.view]) gun.root.visible = gun === shown
    if (shown && shown === this.hand[s.weapon]) {
      if (f.hands) shown.root.position.subVectors(f.hands, origin)
      else shown.root.position.set(foot.x, AIM_Y, foot.z)
      shown.root.rotation.set(-this.kick * 0.5, this.heading, 0, 'YXZ')
    }

    // Chrono, chargeur.
    if (s.started) {
      s.elapsed += dt
      s.timeLeft = Math.max(0, s.timeLeft - dt)
    }
    s.cooldown = Math.max(0, s.cooldown - dt)
    if (s.reload > 0 && (s.reload -= dt) <= 0) {
      s.reload = 0
      s.ammo[s.weapon] = w.mag
      this.onSound?.('loaded', null, 1)
    }
    const want = s.timeLeft > 0 && (w.auto ? this.held || this.queued : this.queued)
    if (want && s.cooldown <= 0 && s.reload <= 0) {
      this.queued = false
      if (s.ammo[s.weapon] > 0) this.fire(eye, f, shown)
      else {
        this.onSound?.('dry', null, 1)
        this.reload()
      }
    }

    this.updateTargets(dt, f.fps)
    this.updateBullets(dt)
    this.updateDebris(dt)

    // Laser de la vue de dessus : du canon au premier obstacle.
    this.laser.visible = this.laserDot.visible = !f.fps
    if (!f.fps) {
      const hit = this.cast(eye, this.aim, 30)
      const end = _v.copy(eye).addScaledVector(this.aim, hit.t)
      this.laserDot.position.copy(end)
      stretch(this.laser, eye, end, 0.008)
    }

    // Sensations : tout s'amortit ; le regard revient de son cabrage.
    this.kick = THREE.MathUtils.damp(this.kick, 0, 16, dt)
    this.shake = THREE.MathUtils.damp(this.shake, 0, 14, dt)
    this.punch = THREE.MathUtils.damp(this.punch, 0, 12, dt)
    this.dip = THREE.MathUtils.damp(this.dip, s.reload > 0 ? 1 : 0, s.reload > 0 ? 14 : 9, dt)
    this.flashTime -= dt
    this.hitTime -= dt
    if (this.recoil > 1e-5) {
      const back = this.recoil * (1 - Math.exp(-7 * dt))
      this.recoil -= back
      if (f.fps) f.look(0, -back)
    }
    this.jolt(f.camera, f.fps)
    if (shown === this.view[s.weapon] && shown) this.placeView(shown, f, dt)
    this.placeFlash(shown)
    this.drawHud(dt, f)

    if (s.timeLeft <= 0 && !s.bullets.length) this.finish(tr('Temps écoulé !', 'Time\'s up!'))
  }

  private fire(eye: THREE.Vector3, f: RangeFrame, shown: Gun | null) {
    const s = this.session!, w = WEAPONS[s.weapon]
    s.ammo[s.weapon]--
    s.cooldown = w.interval
    s.shots++
    s.started = true
    const d = this.aim.clone()
    if (w.spread) {
      // En vue de dessus, la balle reste dans le plan des cibles.
      if (f.fps) d.applyEuler(_e.set(rand(w.spread), rand(w.spread), 0))
      else d.applyAxisAngle(UP, rand(w.spread))
    }
    shown?.root.updateWorldMatrix(true, false)
    const from = shown ? this.group.worldToLocal(shown.root.localToWorld(shown.muzzle.clone())) : eye.clone()
    const tracer = this.tracer(from, f.fps ? 0.004 : 0.011)
    s.bullets.push({ p: eye.clone(), d, speed: w.speed, pierce: w.pierce, scored: false, tracer })
    this.kick = 1
    this.shake = Math.max(this.shake, w.shake)
    this.punch = Math.max(this.punch, w.shake)
    this.flashTime = 0.05
    this.flash.rotation.z = Math.random() * Math.PI
    this.flash.scale.setScalar((w.heavy ? 1.5 : 1) * (0.8 + Math.random() * 0.4))
    if (f.fps) {
      f.look(rand(w.kick * 0.35), w.kick)
      this.recoil += w.kick
    }
    this.onSound?.(w.heavy ? 'heavy' : 'shot', f.fps ? null : from, w.pitch * (0.95 + Math.random() * 0.1))
    if (!s.ammo[s.weapon]) this.reload()
  }

  /**
   * Premier obstacle sur la demi-droite p + t·d, à moins de `max` : une cible, sinon un mur, le sol
   * ou le plafond du stand (`normal`).
   */
  private cast(p: THREE.Vector3, d: THREE.Vector3, max: number): { t: number; target?: Target; off: number; normal?: THREE.Vector3 } {
    let t = max, target: Target | undefined, off = 0, normal: THREE.Vector3 | undefined
    for (const it of this.session?.targets ?? []) {
      if (it.leaving || it.k < 0.5 || Math.abs(d.z) < 1e-6) continue
      const u = (it.z - p.z) / d.z
      if (u < 0 || u > t) continue
      const dist = Math.hypot(p.x + d.x * u - it.x, p.y + d.y * u - it.y)
      if (dist > it.r) continue
      t = u
      target = it
      off = dist / it.r
    }
    const bounds: [number, number, number, 'x' | 'y' | 'z'][] = [[d.x, R.minX, R.maxX, 'x'], [d.y, 0, CEILING, 'y'], [d.z, R.minZ, R.maxZ, 'z']]
    for (const [v, lo, hi, axis] of bounds) {
      if (Math.abs(v) < 1e-6) continue
      const u = ((v > 0 ? hi : lo) - p[axis]) / v
      if (u < 0 || u >= t) continue
      t = u
      target = undefined
      normal = new THREE.Vector3().setComponent(axis === 'x' ? 0 : axis === 'y' ? 1 : 2, v > 0 ? -1 : 1)
    }
    return { t, target, off, normal }
  }

  private updateBullets(dt: number) {
    const s = this.session!
    s.bullets = s.bullets.filter((b) => {
      let left = b.speed * dt
      for (let i = 0; i < 4 && left > 0; i++) {
        const hit = this.cast(b.p, b.d, left)
        b.p.addScaledVector(b.d, hit.t)
        left -= hit.t
        if (hit.target) {
          this.score(hit.target, hit.off, b)
          if (b.pierce) { b.p.addScaledVector(b.d, 0.002); continue }
        } else if (hit.normal) this.impact(b.p, hit.normal)
        else continue
        stretch(b.tracer.mesh, b.tracer.from, b.p, b.tracer.thick)
        b.tracer.flying = false
        if (!b.scored) s.streak = 0
        return false
      }
      return true
    })
    // Les traînées : du canon à la balle tant qu'elle vole, puis elles s'effacent.
    const flying = new Map(s.bullets.map((b) => [b.tracer, b.p]))
    this.fadeTracers(dt, flying)
  }

  private fadeTracers(dt: number, flying: Map<Tracer, THREE.Vector3>) {
    this.tracers = this.tracers.filter((t) => {
      const head = flying.get(t)
      if (head) stretch(t.mesh, t.from, head, t.thick)
      t.age += dt
      const k = 1 - t.age / 0.55
      ;(t.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, k) * 0.75
      if (k > 0 || t.flying) return true
      t.mesh.visible = false
      this.spare.push(t.mesh)
      return false
    })
  }

  private tracer(from: THREE.Vector3, thick: number): Tracer {
    const mesh = this.spare.pop() ?? new THREE.Mesh(BEAM, new THREE.MeshBasicMaterial({ color: '#ffe0a8', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
    if (!mesh.parent) this.live.add(mesh)
    mesh.visible = true
    mesh.scale.setScalar(1e-4)
    const tracer = { mesh, from: from.clone(), thick, age: 0, flying: true }
    this.tracers.push(tracer)
    return tracer
  }

  private score(t: Target, off: number, b: Bullet) {
    const s = this.session!
    const bullseye = off < 0.38
    const points = rangePoints(t.small, bullseye, s.streak)
    b.scored = true
    s.streak++
    s.hits++
    s.score = Math.min(999900, s.score + points)
    this.hitTime = bullseye ? 0.22 : 0.14
    this.shake = Math.max(this.shake, 0.25)
    // La cible éclate : ses morceaux partent avec la balle.
    const at = new THREE.Vector3(t.x, t.y, t.z)
    for (let i = 0; i < (t.small ? 5 : 8); i++) {
      const mesh = packModel(i % 3 ? 'target-fragment-small' : 'target-fragment-large', BLASTER_PACK).clone(true)
      mesh.position.set(t.x + rand(t.r * 0.7), t.y + rand(t.r * 0.7), t.z)
      mesh.rotation.set(rand(3), rand(3), rand(3))
      this.live.add(mesh)
      this.debris.push({ mesh, v: new THREE.Vector3(rand(1.6), 0.8 + Math.random() * 1.8, rand(0.8)).addScaledVector(b.d, 1.4), spin: new THREE.Vector3(rand(12), rand(12), rand(12)), age: 0, life: 1.4 + Math.random() * 0.6, heavy: true })
    }
    this.remove(t)
    s.targets.splice(s.targets.indexOf(t), 1)
    let text = `+${points}${bullseye ? tr(' · Plein centre !', ' · Bullseye!') : ''}`
    let tier = false
    while (s.score >= rangeTier(s.level + 1)) {
      s.level++
      s.timeLeft += BONUS_TIME
      tier = true
    }
    if (tier) text += tr(` · Palier ${s.level} : +${BONUS_TIME} s`, ` · Tier ${s.level}: +${BONUS_TIME} s`)
    s.hud.flash.textContent = text
    s.hud.flash.classList.toggle('good', bullseye || tier)
    s.hud.flash.classList.add('show')
    s.flashTime = 0.9
    this.onSound?.(tier ? 'tier' : bullseye ? 'bullseye' : 'hit', at, 0.92 + Math.random() * 0.16)
  }

  /** Une balle perdue : étincelles, et une marque sur le mur. */
  private impact(at: THREE.Vector3, normal: THREE.Vector3) {
    for (let i = 0; i < 5; i++) {
      const mesh = new THREE.Mesh(this.spark, this.sparkGlow)
      mesh.position.copy(at)
      this.live.add(mesh)
      this.debris.push({ mesh, v: new THREE.Vector3(rand(1.4), rand(1.4), rand(1.4)).addScaledVector(normal, 1.2 + Math.random()), spin: new THREE.Vector3(), age: 0, life: 0.18 + Math.random() * 0.2, heavy: false })
    }
    const mesh = new THREE.Mesh(this.hole, new THREE.MeshBasicMaterial({ color: '#0b0b0d', transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }))
    mesh.position.copy(at).addScaledVector(normal, 0.006)
    mesh.quaternion.setFromUnitVectors(Z, normal)
    this.live.add(mesh)
    this.holes.push({ mesh, age: 0 })
    if (this.holes.length > 40) this.dropHole(this.holes.shift()!)
    this.onSound?.('wall', at, 0.9 + Math.random() * 0.3)
  }

  private dropHole(h: { mesh: THREE.Mesh }) {
    this.live.remove(h.mesh)
    ;(h.mesh.material as THREE.Material).dispose()
  }

  private updateDebris(dt: number) {
    this.debris = this.debris.filter((p) => {
      p.age += dt
      if (p.age >= p.life) {
        this.live.remove(p.mesh)
        return false
      }
      p.v.y -= (p.heavy ? 7 : 4) * dt
      p.mesh.position.addScaledVector(p.v, dt)
      p.mesh.rotation.x += p.spin.x * dt
      p.mesh.rotation.y += p.spin.y * dt
      p.mesh.rotation.z += p.spin.z * dt
      if (p.heavy && p.mesh.position.y < 0.03) {
        p.mesh.position.y = 0.03
        p.v.y = Math.abs(p.v.y) * 0.35
        p.v.x *= 0.6
        p.v.z *= 0.6
        p.spin.multiplyScalar(0.5)
      }
      p.mesh.position.z = Math.max(p.mesh.position.z, R.minZ + 0.1)
      p.mesh.scale.setScalar(Math.min(1, (p.life - p.age) / 0.3))
      return true
    })
    this.holes = this.holes.filter((h) => {
      h.age += dt
      ;(h.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(0.8, (6 - h.age) * 0.8)
      if (h.age < 6) return true
      this.dropHole(h)
      return false
    })
  }

  // ------------------------------------------------------------------ cibles

  /** Cible du kit, face au tireur, sur sa tige. */
  private makeTarget(small: boolean): Pick<Target, 'root' | 'disc' | 'pole'> {
    const root = new THREE.Group()
    const disc = packModel(small ? 'target-small' : 'target-large', BLASTER_PACK).clone(true)
    // Le modèle est fin le long de x : un quart de tour le met face au sud.
    disc.rotation.y = Math.PI / 2
    const pole = new THREE.Mesh(this.poleGeo, this.poleMat)
    root.add(pole, disc)
    return { root, disc, pole }
  }

  private spawn() {
    const s = this.session!, rules = rangeLevel(s.level)
    const small = Math.random() < rules.small
    const r = small ? 0.1 : 0.17
    const moving = Math.random() < rules.moving
    const amp = moving ? 0.35 + Math.random() * 0.6 : 0
    for (let tries = 0; tries < 10; tries++) {
      const z = ROWS[Math.floor(Math.random() * ROWS.length)]
      const x0 = LANE_MIN + amp + Math.random() * (LANE_MAX - LANE_MIN - amp * 2)
      // Pas deux cibles l'une sur l'autre dans une rangée.
      if (s.targets.some((t) => t.z === z && Math.abs(t.x0 - x0) < t.amp + amp + t.r + r + 0.08)) continue
      const t: Target = {
        ...this.makeTarget(small), small, r, x0, z, x: x0, y: AIM_Y, high: 0.3 + Math.random() * 0.75, amp, speed: rules.speed * (Math.random() < 0.5 ? -1 : 1),
        phase: Math.random() * Math.PI * 2, life: rules.life + Math.random() * 0.6, age: 0, k: 0, leaving: false,
      }
      this.live.add(t.root)
      s.targets.push(t)
      return
    }
  }

  private remove(t: Target) {
    this.live.remove(t.root)
  }

  private updateTargets(dt: number, fps: boolean) {
    const s = this.session!, rules = rangeLevel(s.level)
    s.spawn -= dt
    const up = s.targets.filter((t) => !t.leaving).length
    // Avant le premier tir, le stand se garnit d'un coup ; ensuite, une cible à la fois.
    if (s.timeLeft > 0 && up < rules.alive && (s.spawn <= 0 || !s.started)) {
      this.spawn()
      s.spawn = rules.every
    }
    s.targets = s.targets.filter((t) => {
      // Avant le premier tir, les cibles attendent.
      if (s.started) t.age += dt
      if (t.age > t.life || s.timeLeft <= 0) t.leaving = true
      t.k = THREE.MathUtils.clamp(t.k + (t.leaving ? -dt / 0.18 : dt / 0.22), 0, 1)
      if (t.leaving && t.k <= 0) {
        this.remove(t)
        return false
      }
      if (t.amp) {
        t.phase += (t.speed / t.amp) * dt
        t.x = t.x0 + Math.sin(t.phase) * t.amp
      }
      // Les cibles changent de hauteur avec la vue (cf. AIM_Y).
      const goal = fps ? t.high : AIM_Y
      t.y = t.k < 0.3 && !t.leaving ? goal : THREE.MathUtils.damp(t.y, goal, 8, dt)
      t.root.position.set(t.x, 0, t.z)
      t.disc.position.y = t.y
      t.disc.scale.setScalar(Math.max(0.001, t.leaving ? t.k : easeOutBack(t.k)))
      t.pole.scale.y = Math.max(0.001, t.y * Math.min(1, t.k * 1.6))
      return true
    })
  }

  // ------------------------------------------------------------------ armes

  /** Arme du kit à l'échelle `scale`, poignée à l'origine, canon vers +z. */
  private makeGun(w: Weapon, scale: number): Gun {
    const model = packModel(w.model, BLASTER_PACK).clone(true)
    model.traverse((o) => { o.castShadow = false })
    _box.setFromObject(model)
    model.position.set(-(_box.min.x + _box.max.x) / 2, -w.grip[0], -w.grip[1])
    const root = new THREE.Group().add(model)
    root.scale.setScalar(scale)
    root.visible = false
    this.live.add(root)
    return { root, muzzle: new THREE.Vector3(0, _box.max.y - 0.07 - w.grip[0], _box.max.z - w.grip[1]) }
  }

  /** Secoue la vue, et ouvre un peu le champ de la vue subjective à chaque tir. */
  private jolt(camera: THREE.Camera, fps: boolean) {
    const persp = camera as THREE.PerspectiveCamera
    if (persp.isPerspectiveCamera) {
      if (!this.baseFov) this.baseFov = persp.fov
      const fov = this.baseFov + this.punch * 1.1
      if (Math.abs(persp.fov - fov) > 1e-3) {
        persp.fov = fov
        persp.updateProjectionMatrix()
      }
    }
    if (this.shake < 0.01) return
    const a = this.shake * (fps ? 0.005 : 0.03)
    camera.position.x += rand(a)
    camera.position.y += rand(a)
    camera.position.z += rand(a)
    if (fps) camera.rotateZ(rand(this.shake * 0.006))
  }

  /** L'arme à l'écran : en bas à droite, elle recule au tir, traîne quand le regard tourne, plonge pour recharger. */
  private placeView(gun: Gun, f: RangeFrame, dt: number) {
    const s = this.session!
    // Le regard tourne : l'arme suit avec un temps de retard.
    f.camera.getWorldDirection(_v)
    if (this.lastDir.lengthSq()) {
      const yaw = Math.atan2(_v.x, _v.z) - Math.atan2(this.lastDir.x, this.lastDir.z)
      this.sway.x = THREE.MathUtils.clamp(this.sway.x + Math.atan2(Math.sin(yaw), Math.cos(yaw)) * 0.5, -0.12, 0.12)
      this.sway.y = THREE.MathUtils.clamp(this.sway.y + (_v.y - this.lastDir.y) * 0.5, -0.12, 0.12)
    }
    this.lastDir.copy(_v)
    this.sway.multiplyScalar(Math.exp(-10 * dt))
    this.bob += dt * (f.moving ? 9 : 1.6)
    const step = f.moving ? 1 : 0.25
    const reload = s.reload > 0 ? Math.sin((1 - s.reload / WEAPONS[s.weapon].reload) * Math.PI * 2) * 0.25 : 0
    f.camera.updateMatrixWorld()
    _v.set(
      0.085 + this.sway.x * 0.12 + Math.cos(this.bob) * 0.003 * step,
      -0.075 - this.dip * 0.12 + this.sway.y * 0.1 + Math.abs(Math.sin(this.bob)) * 0.004 * step,
      -0.2 + this.kick * 0.03,
    ).applyMatrix4(f.camera.matrixWorld)
    gun.root.position.copy(this.group.worldToLocal(_v))
    // Canon vers l'avant (le -z de la caméra), relevé par le recul, baissé pour recharger.
    _q.setFromEuler(_e.set(this.dip * 0.9 - this.kick * 0.22 - this.sway.y * 0.6, Math.PI + this.sway.x * 0.8, reload, 'YXZ'))
    gun.root.quaternion.copy(f.camera.quaternion).multiply(_q)
  }

  private placeFlash(gun: Gun | null) {
    this.flash.visible = !!gun && this.flashTime > 0
    if (!gun || !this.flash.visible) return
    gun.root.updateWorldMatrix(true, false)
    this.flash.position.copy(this.group.worldToLocal(gun.root.localToWorld(_v.copy(gun.muzzle))))
    const roll = this.flash.rotation.z
    this.flash.quaternion.copy(gun.root.quaternion)
    this.flash.rotateZ(roll)
  }

  private finish(reason: string | null) {
    const s = this.session
    if (!s) return
    this.session = undefined
    const revision = ++this.revision
    this.held = this.queued = false
    for (const t of s.targets) this.remove(t)
    for (const t of this.tracers) { t.mesh.visible = false; this.spare.push(t.mesh) }
    this.tracers = []
    for (const p of this.debris) this.live.remove(p.mesh)
    this.debris = []
    for (const h of this.holes) this.dropHole(h)
    this.holes = []
    for (const gun of [...this.hand, ...this.view]) gun.root.visible = false
    this.live.visible = false
    this.idle.visible = true
    s.hud.root.remove()
    document.body.classList.remove('range-on', 'range-top')
    this.punch = this.shake = 0
    this.lastDir.set(0, 0, 0)
    this.onToggle?.(false)
    if (reason === null) return
    saveLocalBest(RANGE_ID, s.score)
    this.onSound?.('end', null, 1)
    if (!s.shots) return this.dialog.show(reason)
    const accuracy = Math.round((s.hits / s.shots) * 100)
    const summary = tr(`${reason} ${s.score.toLocaleString()} points (${s.hits} cible${s.hits > 1 ? 's' : ''}, ${accuracy} % de précision).`, `${reason} ${s.score.toLocaleString()} points (${s.hits} target${s.hits > 1 ? 's' : ''}, ${accuracy}% accuracy).`)
    this.dialog.show(summary)
    if (!s.score) return
    void submitScore(RANGE_ID, s.score, s.level + 1, Math.max(1, Math.ceil(s.elapsed))).then((result) => {
      if (result.kind === 'saved' && result.credits) this.wallet.arcade(result.credits)
      if (revision !== this.revision) return
      if (result.kind === 'saved') {
        const saved = result.best ? tr('Nouveau record personnel.', 'New personal best.') : tr('Score enregistré.', 'Score saved.')
        const earned = result.credits?.earned ?? 0
        this.dialog.show(`${summary} ${saved}${earned > 0 ? ` +${formatCredits(earned)}.` : ''}`)
      } else if (result.kind === 'guest') this.dialog.show(`${summary} ${tr('Connectez-vous au site pour entrer au classement et gagner des crédits.', 'Sign in to enter the rankings and earn credits.')}`)
      else this.dialog.show(`${summary} ${tr('Site indisponible : record conservé sur cet appareil.', 'Site unavailable: best saved on this device.')}`)
    })
  }

  /** Remet le champ de la vue subjective comme il était (à appeler une fois la partie finie). */
  restore(camera: THREE.PerspectiveCamera) {
    if (!this.baseFov || this.session || camera.fov === this.baseFov) return
    camera.fov = this.baseFov
    camera.updateProjectionMatrix()
  }

  // ------------------------------------------------------------------ affichage

  private buildHud(): Hud {
    const el = (tag: string, className: string, text = '') => {
      const node = document.createElement(tag)
      node.className = className
      node.textContent = text
      return node
    }
    const button = (className: string, text: string, title: string, click: () => void) => {
      const b = el('button', className, text) as HTMLButtonElement
      b.type = 'button'
      b.title = title
      b.onclick = () => { click(); b.blur() }
      return b
    }
    const root = el('div', 'court-hud range-hud')
    root.setAttribute('role', 'group')
    root.setAttribute('aria-label', tr('Stand de tir', 'Shooting range'))
    const top = el('div', 'court-top')
    const score = el('strong', 'court-score'), time = el('strong', 'court-time'), best = el('span', 'court-best'), tier = el('span', 'court-tier'), streak = el('span', 'range-streak')
    const scoreBox = el('div', 'court-box'), timeBox = el('div', 'court-box')
    scoreBox.append(el('span', 'court-label', tr('Stand de tir', 'Shooting range')), score, streak, tier)
    timeBox.append(el('span', 'court-label', tr('Temps', 'Time')), time, best)
    top.append(scoreBox, timeBox, button('court-quit', tr('Rendre l\'arme (Échap)', 'Return weapon (Esc)'), '', () => this.stop()))
    const flash = el('div', 'court-flash')
    flash.setAttribute('aria-live', 'polite')

    const bar = el('div', 'range-bar')
    const slots = WEAPONS.map((w, i) => button('range-slot', `${i + 1} · ${w.name}`, w.name, () => this.select(i)))
    const weapons = el('div', 'range-slots')
    weapons.append(...slots)
    const ammo = el('strong', 'range-ammo')
    const reload = el('div', 'range-reload')
    reload.append(el('div', 'range-reload-fill'))
    const motif = button('range-pick', '', tr('Motif du viseur (C)', 'Reticle shape (C)'), () => this.cycleReticle('motif'))
    const color = button('range-pick range-color', '', tr('Couleur du viseur (X)', 'Reticle colour (X)'), () => this.cycleReticle('color'))
    const sight = el('div', 'range-sight')
    sight.append(el('span', 'court-label', tr('Viseur', 'Reticle')), motif, color)
    const coarse = matchMedia('(pointer: coarse)').matches
    const help = el('span', 'court-help', coarse
      ? tr('Touchez pour viser et tirer · le chrono part au premier tir', 'Touch to aim and fire · the clock starts on your first shot')
      : tr('Clic : tirer · R : recharger · 1 2 3 : arme · C X : viseur · V : vue · le chrono part au premier tir', 'Click: fire · R: reload · 1 2 3: weapon · C X: reticle · V: view · the clock starts on your first shot'))
    bar.append(weapons, sight, ammo, reload, help)

    const reticle = el('div', 'range-reticle')
    reticle.setAttribute('aria-hidden', 'true')
    root.append(top, flash, bar, reticle)
    document.body.append(root)
    return { root, score, time, best, tier, flash, streak, ammo, reload: reload.firstElementChild as HTMLElement, slots, reticle, motif, help }
  }

  private drawReticle() {
    const h = this.session?.hud
    if (!h) return
    const shapes = RETICLES[this.reticle.motif]
    h.reticle.innerHTML = `<svg viewBox="-16 -16 32 32"><g class="edge">${shapes}</g><g class="ink">${shapes}</g></svg><svg class="range-hit" viewBox="-16 -16 32 32"><path d="M-12-12L-6-6M12-12L6-6M-12 12L-6 6M12 12L6 6"/></svg>`
    h.reticle.style.color = RETICLE_COLORS[this.reticle.color]
    h.root.style.setProperty('--range-reticle', RETICLE_COLORS[this.reticle.color])
    h.motif.textContent = RETICLE_NAMES[this.reticle.motif]
  }

  private drawHud(dt: number, f: RangeFrame) {
    const s = this.session!, h = s.hud, w = WEAPONS[s.weapon]
    h.score.textContent = s.score.toLocaleString()
    h.time.textContent = String(Math.ceil(s.timeLeft))
    h.time.classList.toggle('low', s.started && s.timeLeft <= 10)
    h.best.textContent = `${tr('Record', 'Best')} ${Math.max(s.best, s.score).toLocaleString()}`
    h.tier.textContent = `${tr('Palier', 'Tier')} ${s.level} · ${tr('suivant à', 'next at')} ${rangeTier(s.level + 1).toLocaleString()}`
    h.streak.textContent = s.streak > 1 ? tr(`Série × ${s.streak}`, `Streak × ${s.streak}`) : ''
    h.ammo.textContent = s.reload > 0 ? tr('Rechargement…', 'Reloading…') : `${s.ammo[s.weapon]} / ${w.mag}`
    h.ammo.classList.toggle('low', s.reload <= 0 && s.ammo[s.weapon] <= Math.ceil(w.mag / 4))
    h.reload.style.width = `${s.reload > 0 ? (1 - s.reload / w.reload) * 100 : 0}%`
    h.slots.forEach((slot, i) => slot.classList.toggle('on', i === s.weapon))
    // Le mode d'emploi s'efface au premier tir.
    h.help.hidden = s.started
    if (s.flashTime > 0 && (s.flashTime -= dt) <= 0) h.flash.classList.remove('show')
    // Le viseur : au centre en vue subjective, sur le point visé en vue de dessus ; il s'ouvre au tir.
    document.body.classList.toggle('range-top', !f.fps)
    let x = innerWidth / 2, y = innerHeight / 2
    if (!f.fps) {
      if (this.pointer) ({ x, y } = this.pointer)
      else {
        _v.copy(this.aimPoint).add(this.group.getWorldPosition(_w)).project(f.camera)
        x = (_v.x + 1) * 0.5 * innerWidth
        y = (1 - _v.y) * 0.5 * innerHeight
      }
    }
    h.reticle.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${(1 + this.kick * 0.45).toFixed(3)})`
    h.reticle.classList.toggle('hit', this.hitTime > 0)
  }
}
