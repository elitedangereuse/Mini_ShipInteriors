import * as THREE from 'three'
import { BLASTER_PACK, packModel } from './assets'
import { fetchBoard, localBest, saveLocalBest, submitScore } from './arcade/scores'
import { RANGE_ID } from './arcade/game'
import { formatCredits } from './economy/data'
import type { Wallet } from './economy/wallet'
import { tr } from './i18n'
import type { RangeMusic } from './range-music'
import type { RangeSfx } from './range-sfx'
import { rangeState, WEAPONS, type Weapon, type WeaponId } from './range-weapons'
import type { Dialog } from './ui'
import { SHOOTING_RANGE } from '../shared/ship-layouts.js'

/*
 * Stand de tir de la cale : on décroche une arme du mur, et des cibles sortent du sol entre le
 * comptoir et le mur du fond. On reste libre de ses mouvements, derrière le comptoir ; on change
 * d'arme en en prenant une autre au mur, on rend la sienne en la raccrochant. Pas de visée
 * automatique : la balle part là où l'on vise, à la dispersion de l'arme près.
 *
 * - Vue subjective : la souris tourne le regard, la mire est au centre, la balle part des yeux.
 *   L'arme est à l'écran ; à chaque tir elle recule sur son ressort et le regard se cabre, puis
 *   revient de lui-même.
 * - Vue de dessus (la vue isométrique, relevée, tournée vers les cibles) : façon « twin-stick », le
 *   personnage se tourne vers le curseur, un laser montre la ligne de tir, que le recul fait
 *   dévier. Laser, balles et cibles sont alors à la même hauteur (AIM_Y) : ce que le curseur
 *   recouvre est ce qu'on touche.
 *
 * Les balles sont de vrais projectiles, très rapides : un trait lumineux, et derrière lui une fine
 * traînée qui s'efface. Ce sont des rubans tournés vers la caméra, pas des volumes : vus de face,
 * en vue subjective, ils restent des traits. Une cible touchée éclate. Le chrono part au premier
 * tir ; chaque palier de score rend du temps, et les cibles deviennent plus petites, plus mobiles,
 * plus brèves. On recharge avec R : un chargeur vide ne se remplit pas tout seul.
 *
 * Tout se joue chez le joueur : les autres le voient bouger et se tourner, pas ses tirs.
 */

const R = SHOOTING_RANGE
const RAD = Math.PI / 180
/** Hauteur du plafond des pièces (cf. CEILING_Y dans deck.ts). */
const CEILING = 2.2
/** Hauteur de la ligne de tir en vue de dessus : celle des mains (bras tendus vers le bas), et alors celle des cibles. */
const AIM_Y = 0.24
/** Rangées de cibles (cf. les fentes du sol dans furniture/range.ts), de la plus loin à la plus proche. */
const ROWS = [R.minZ + 0.2, R.minZ + 1.0, R.minZ + 1.8]
const LANE_MIN = R.minX + 0.45, LANE_MAX = R.maxX - 0.45

const START_TIME = 40
const BONUS_TIME = 6
/** Ce que rend une cible dorée (secondes). */
const GOLD_TIME = 2
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
  /** Cible dorée : petite, brève, et qui rend du temps. */
  gold: boolean
  /** Halo au sol, sous la cible. */
  ring: THREE.Sprite
}

interface Bullet {
  p: THREE.Vector3
  d: THREE.Vector3
  speed: number
  pierce: boolean
  /** Rayon de l'explosion à l'impact (0 : aucune). */
  blast: number
  /** Le tir dont elle fait partie (le fusil à pompe en tire huit à la fois). */
  shot: Shot
  color: THREE.Color
  streak: Streak
}

/** Un appui sur la détente : ses balles encore en vol, et s'il a touché une cible (sinon, il casse la série). */
interface Shot {
  left: number
  scored: boolean
}

/**
 * Ce qu'on voit d'une balle : le trait lumineux qui file (`bolt`, et son halo `glow`), et la
 * traînée qu'il laisse du canon jusqu'à lui (`trail`), qui s'efface en une demi-seconde.
 */
interface Streak {
  trail: THREE.Mesh
  bolt: THREE.Mesh
  glow: THREE.Sprite
  from: THREE.Vector3
  head: THREE.Vector3
  /** Largeur de la traînée : plus fine en vue subjective, où elle part de tout près. */
  width: number
  age: number
  flying: boolean
}

interface Debris {
  mesh: THREE.Object3D
  v: THREE.Vector3
  spin: THREE.Vector3
  age: number
  life: number
  /** Éclat de cible ou chargeur (il rebondit au sol), ou étincelle. */
  heavy: boolean
}

/** Arme tenue : son modèle, poignée à l'origine, canon vers +z ; `muzzle` : la bouche du canon. */
interface Gun {
  root: THREE.Group
  muzzle: THREE.Vector3
}

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
  /** Direction de marche voulue (monde, longueur 0 à 1). */
  move: THREE.Vector3
}

interface Hud {
  root: HTMLElement
  score: HTMLElement
  time: HTMLElement
  clock: HTMLElement
  streak: HTMLElement
  tier: HTMLElement
  tierFill: HTMLElement
  banner: HTMLElement
  /** Hologramme des munitions, près du joueur ; `alert` : l'ordre de recharger. */
  ammo: HTMLElement
  weapon: HTMLElement
  mag: HTMLElement
  pips: HTMLElement[]
  count: HTMLElement
  alert: HTMLElement
  hint: HTMLElement
  dot: HTMLElement
  pops: HTMLElement
}

const Z = new THREE.Vector3(0, 0, 1)
const UP = new THREE.Vector3(0, 1, 0)
const _v = new THREE.Vector3()
const _w = new THREE.Vector3()
const _x = new THREE.Vector3()
const _y = new THREE.Vector3()
const _z = new THREE.Vector3()
const _l = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _ray = new THREE.Raycaster()
const _ndc = new THREE.Vector2()
const _plane = new THREE.Plane()
const _box = new THREE.Box3()
const SOOT = new THREE.Color('#0b0b0d')
const ALARM = new THREE.Color('#ff3b2f')
const MINT = new THREE.Color('#8dffd0')
const GOLD = new THREE.MeshLambertMaterial({ color: '#ffc93a', emissive: '#8a5a00' })
const rand = (a: number) => (Math.random() * 2 - 1) * a
const easeOutBack = (u: number) => 1 + 2.7 * (u - 1) ** 3 + 1.7 * (u - 1) ** 2

/** Pavé d'un mètre le long de +z, à étirer d'un point à un autre (le laser). */
const BEAM = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5)
/** Ruban d'un mètre le long de +z, large d'un mètre le long de x : `v` vaut 1 à son départ, 0 à sa pointe. */
const RIBBON = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5)

/** Texture d'un ruban : doux sur ses bords, et qui naît peu à peu (son départ, près du canon, est transparent). */
function ribbonTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 32
  c.height = 64
  const g = c.getContext('2d')!
  const image = g.createImageData(32, 64)
  for (let y = 0; y < 64; y++) {
    const along = THREE.MathUtils.smoothstep(y / 63, 0, 0.4)
    for (let x = 0; x < 32; x++) {
      const across = Math.exp(-(((x - 15.5) / 5.5) ** 2))
      const i = (y * 32 + x) * 4
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 255
      image.data[i + 3] = Math.round(255 * along * across)
    }
  }
  g.putImageData(image, 0, 0)
  return new THREE.CanvasTexture(c)
}

/** Texture d'un halo : un disque lumineux qui s'éteint vers ses bords. */
function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.25, 'rgba(255,255,255,0.75)')
  grad.addColorStop(0.6, 'rgba(255,255,255,0.18)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
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
    bannerTime: number
    /** Dernière seconde annoncée par le compte à rebours. */
    second: number
  }
  private revision = 0
  private readonly live = new THREE.Group()
  /** Cibles d'exposition, quand personne ne tire. */
  private readonly idle = new THREE.Group()
  private readonly laser: THREE.Mesh
  private readonly laserDot: THREE.Mesh
  private readonly flash: THREE.Sprite
  private readonly ribbon = ribbonTexture()
  private readonly halo = glowTexture()
  /** Armes en main (vue de dessus) et à l'écran (vue subjective), par arme. */
  private hand: Gun[] = []
  private view: Gun[] = []
  private streaks: Streak[] = []
  private spare: Streak[] = []
  private debris: Debris[] = []
  private marks: { mesh: THREE.Mesh; age: number; color: THREE.Color }[] = []
  private bursts: { sprite: THREE.Sprite; age: number; size: number }[] = []
  private readonly spark = new THREE.BoxGeometry(0.016, 0.016, 0.016)
  private readonly mark = new THREE.CircleGeometry(0.022, 12)
  private readonly poleGeo = new THREE.CylinderGeometry(0.012, 0.016, 1, 6).translate(0, 0.5, 0)
  private readonly baseGeo = new THREE.BoxGeometry(0.14, 0.03, 0.07).translate(0, 0.015, 0)
  private readonly poleMat = new THREE.MeshLambertMaterial({ color: '#2a2d33' })

  /** Détente tenue ; `queued` : un appui attend la fin du délai entre deux tirs. */
  private held = false
  private queued = false
  /** Direction de tir (repère du pont), et le curseur qui la donne en vue de dessus (null : le stick). */
  private readonly aim = new THREE.Vector3(0, 0, -1)
  private readonly aimPoint = new THREE.Vector3()
  private pointer: { x: number; y: number } | null = null
  /**
   * Recul et dispersion (radians) : ce que les tirs ont ajouté à la dispersion (`bloom`), ce que
   * marcher y ajoute (`moving`) ; le cabrage de la vue subjective (`recoil` : cap, hauteur), et ce
   * qu'il lui reste à prendre (`debt` : il vient en quelques images, pas d'un coup) ; la déviation
   * de la ligne de tir en vue de dessus (`drift`) ; le rang du tir dans la rafale (`volley`).
   *
   * Le cabrage est une couche posée par-dessus le regard, sur la caméra : il ne touche jamais au
   * cap ni à la hauteur que mène la souris. Détente tenue ou non, elle garde la même sensibilité.
   */
  private bloom = 0
  private moving = 0
  private readonly debt = new THREE.Vector2()
  private readonly recoil = new THREE.Vector2()
  private drift = 0
  private volley = 0
  /** L'arme sur son ressort : son recul (0 au repos) et sa vitesse. */
  private gunKick = 0
  private gunVel = 0
  /** Secousse de la vue, ouverture du champ, éclair du canon, touche, arme baissée, pas, roulis, traîne. */
  private shake = 0
  private punch = 0
  private flashTime = 0
  private hitTime = 0
  private dip = 0
  private bob = 0
  private roll = 0
  private baseFov = 0
  private readonly sway = new THREE.Vector2()
  private readonly lastDir = new THREE.Vector3()
  private camera: THREE.Camera | null = null
  /** Mise en scène : éclat d'une cible touchée, palier franchi (ils s'éteignent), et la couleur du tir. */
  private glow = 0
  private tierGlow = 0
  private readonly tint = new THREE.Color()

  /** La partie commence, s'arrête, ou l'arme change : la vue se cadre, les supports du mur se mettent à jour. */
  onChange?: (on: boolean) => void

  /** @param group la cale : cibles et balles y vivent, dans son repère */
  constructor(private group: THREE.Object3D, private dialog: Dialog, private wallet: Wallet, private sfx: RangeSfx, private music: RangeMusic) {
    group.add(this.live, this.idle)
    this.laser = new THREE.Mesh(BEAM, new THREE.MeshBasicMaterial({ color: '#ff4a38', transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }))
    this.laserDot = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff6a5a' }))
    this.flash = this.sprite()
    this.live.add(this.laser, this.laserDot, this.flash)
    this.live.visible = false
    // Quatre cibles restent sorties tant que personne ne tire.
    ;[[12.5, 2, false, 0.5], [13.6, 0, true, 0.75], [14.7, 1, false, 0.42], [15.7, 0, false, 0.62]].forEach(([x, row, small, y]) => {
      const t = this.makeTarget(small as boolean)
      t.root.position.set(x as number, 0, ROWS[row as number])
      t.disc.position.y = y as number
      t.pole.scale.y = y as number
      t.ring.scale.setScalar(0.34)
      t.ring.material.opacity = 0.3
      this.idle.add(t.root)
    })
  }

  get active() { return !!this.session }

  /** L'arme en main, ou null. */
  get weapon(): WeaponId | null {
    return this.session ? WEAPONS[this.session.weapon].id : null
  }

  /** Cap du personnage (cf. Player.setHeading) : tourné vers ce qu'il vise. */
  get heading(): number {
    return Math.atan2(this.aim.x, this.aim.z)
  }

  /** Le joueur est-il dans le stand ? (repère du pont) */
  contains(p: { x: number; z: number }): boolean {
    return p.x > R.minX - 0.15 && p.x < R.maxX + 0.15 && p.z > R.minZ - 0.15 && p.z < R.maxZ + 0.15
  }

  /**
   * On agit sur une arme du mur : on la prend (la partie commence, ou l'on change d'arme sans
   * arrêter le chrono), ou l'on raccroche la sienne (la partie s'arrête).
   */
  take(id: WeaponId) {
    const index = WEAPONS.findIndex((w) => w.id === id)
    const s = this.session
    if (index < 0) return
    if (!s) return this.start(index)
    if (s.weapon === index) return this.stop()
    s.weapon = index
    s.reload = 0
    s.cooldown = Math.max(s.cooldown, 0.35)
    this.queued = false
    this.dip = 1
    this.bloom = this.drift = 0
    this.sfx.take()
    this.fillMag()
    rangeState.weapon = id
    this.onChange?.(true)
  }

  private start(weapon: number) {
    const revision = ++this.revision
    if (!this.hand.length) {
      this.hand = WEAPONS.map((w) => this.makeGun(w, 0.4))
      this.view = WEAPONS.map((w) => this.makeGun(w, 0.085))
    }
    this.session = {
      score: 0, level: 0, hits: 0, shots: 0, streak: 0, best: localBest(RANGE_ID), timeLeft: START_TIME, elapsed: 0, started: false,
      weapon, ammo: WEAPONS.map((w) => w.mag), cooldown: 0.3, reload: 0, spawn: 0, targets: [], bullets: [], hud: this.buildHud(), bannerTime: 0, second: START_TIME,
    }
    this.held = this.queued = false
    this.bloom = this.moving = this.drift = this.gunKick = this.gunVel = 0
    this.debt.set(0, 0)
    this.recoil.set(0, 0)
    this.shake = this.punch = this.flashTime = this.hitTime = this.roll = 0
    this.dip = 1
    this.glow = this.tierGlow = 0
    this.volley = 0
    this.aim.set(0, 0, -1)
    this.pointer = null
    this.live.visible = true
    this.idle.visible = false
    document.body.classList.add('range-on')
    this.fillMag()
    rangeState.live = true
    rangeState.weapon = WEAPONS[weapon].id
    this.sfx.take()
    this.sfx.lights(true)
    this.music.start()
    this.onChange?.(true)
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

  /** Tir rapide (toucher le stick de tir, au doigt) : vue de dessus, on se tourne vers la cible la plus proche. */
  aimNearest(player: { x: number; z: number }) {
    const s = this.session
    if (!s) return
    const origin = this.group.getWorldPosition(new THREE.Vector3())
    const fx = player.x - origin.x, fz = player.z - origin.z
    let best: Target | null = null
    let near = Infinity
    for (const t of s.targets) {
      const d = Math.hypot(t.x - fx, t.z - fz)
      if (!t.leaving && d < near) { near = d; best = t }
    }
    if (best) this.aimToward(best.x - fx, best.z - fz)
  }

  /** Change le chargeur (R) : l'ancien tombe, le neuf est en place après le délai de l'arme. */
  reload() {
    const s = this.session
    if (!s || s.reload > 0 || s.timeLeft <= 0 || s.ammo[s.weapon] >= WEAPONS[s.weapon].mag) return
    s.reload = WEAPONS[s.weapon].reload
    this.queued = false
    this.sfx.reload()
    // Le chargeur vide tombe de l'arme.
    const gun = [...this.view, ...this.hand].find((g) => g.root.visible)
    if (!gun) return
    const clip = packModel('clip-small', BLASTER_PACK).clone(true)
    gun.root.updateWorldMatrix(true, false)
    clip.position.copy(this.group.worldToLocal(gun.root.localToWorld(_v.set(0, -0.12, 0))))
    clip.scale.setScalar(gun.root.scale.x * 0.9)
    this.live.add(clip)
    this.debris.push({ mesh: clip, v: new THREE.Vector3(rand(0.2), -0.3, rand(0.2)), spin: new THREE.Vector3(rand(6), rand(3), rand(6)), age: 0, life: 1.6, heavy: true })
  }

  /** @returns true si la touche est prise par le stand (les déplacements, la vue, le chat, E restent au jeu) */
  key(e: KeyboardEvent): boolean {
    if (!this.session) return false
    if (e.code === 'Escape') this.stop()
    else if (e.code === 'KeyR') { if (!e.repeat) this.reload() }
    else if (e.code === 'Space') { if (!e.repeat) this.trigger(true) }
    // Les chiffres sont des emotes : pas l'arme à la main.
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
    this.camera = f.camera
    const origin = this.group.getWorldPosition(new THREE.Vector3())
    const foot = new THREE.Vector3().subVectors(f.player, origin)
    const walking = f.move.lengthSq() > 0.01

    // Où l'on vise, et d'où part la balle.
    const eye = new THREE.Vector3()
    const dir = new THREE.Vector3()
    if (f.fps) {
      // Le cabrage du recul, par-dessus le regard : la balle part là où la vue pointe vraiment.
      f.camera.rotateOnWorldAxis(UP, this.recoil.x)
      f.camera.rotateX(this.recoil.y)
      f.camera.updateMatrixWorld()
      f.camera.getWorldDirection(this.aim)
      f.camera.getWorldPosition(eye).sub(origin)
      dir.copy(this.aim)
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
      // Le recul fait dévier la ligne de tir : le laser le montre.
      dir.copy(this.aim).applyAxisAngle(UP, this.drift)
      eye.set(foot.x + dir.x * 0.3, AIM_Y, foot.z + dir.z * 0.3)
      if (!this.pointer) this.aimPoint.copy(eye).addScaledVector(this.aim, 2)
    }

    // L'arme : en main, ou à l'écran (placée plus bas, une fois la vue secouée).
    const shown = f.fps && !f.body ? this.view[s.weapon] : f.body ? this.hand[s.weapon] : null
    for (const gun of [...this.hand, ...this.view]) gun.root.visible = gun === shown
    if (shown && shown === this.hand[s.weapon]) {
      if (f.hands) shown.root.position.subVectors(f.hands, origin)
      else shown.root.position.copy(foot)
      // À la hauteur de la ligne de tir, quelle que soit la carrure du personnage.
      shown.root.position.y = AIM_Y - 0.02
      shown.root.rotation.set(this.dip * 0.9 - this.gunKick * 0.5, Math.atan2(dir.x, dir.z), 0, 'YXZ')
    }

    // Chrono, chargeur.
    if (s.started) {
      s.elapsed += dt
      s.timeLeft = Math.max(0, s.timeLeft - dt)
      // Compte à rebours : une annonce à dix secondes, un top par seconde sous cinq.
      const second = Math.ceil(s.timeLeft)
      if (second < s.second && second === 10) this.banner(tr('10 secondes', '10 seconds'), true)
      if (second < s.second && second >= 1 && second <= 5) this.sfx.tick(second)
      s.second = second
    }
    // Ce que le décor et les lampes en lisent (cf. rangeState, light).
    this.glow = THREE.MathUtils.damp(this.glow, 0, 7, dt)
    this.tierGlow = Math.max(0, this.tierGlow - dt / 1.4)
    rangeState.flash = this.glow
    rangeState.tier = this.tierGlow
    // La musique suit la partie (cf. RangeMusic), et les lumières suivent sa grosse caisse.
    this.music.update({ started: s.started, level: s.level, rush: s.started && s.timeLeft <= 10 })
    rangeState.beat = this.music.pulse
    rangeState.alarm = s.started && s.timeLeft > 0 && s.timeLeft <= 10 ? (s.timeLeft % 1) ** 2 : 0
    s.cooldown = Math.max(0, s.cooldown - dt)
    if (s.reload > 0 && (s.reload -= dt) <= 0) {
      s.reload = 0
      s.ammo[s.weapon] = w.mag
      this.sfx.loaded()
    }
    const want = s.timeLeft > 0 && (w.auto ? this.held || this.queued : this.queued)
    if (want && s.cooldown <= 0 && s.reload <= 0) {
      this.queued = false
      if (s.ammo[s.weapon] > 0) this.fire(eye, dir, f, shown)
      else {
        // Chargeur vide : il faut recharger soi-même.
        s.cooldown = 0.2
        this.sfx.dry()
        s.hud.alert.classList.remove('nudge')
        void s.hud.alert.offsetWidth
        s.hud.alert.classList.add('nudge')
      }
    }

    this.updateTargets(dt, f.fps)
    this.updateBullets(dt)
    this.updateStreaks(dt, f.camera, origin)
    this.updateDebris(dt)

    // Laser de la vue de dessus : du canon au premier obstacle.
    this.laser.visible = this.laserDot.visible = !f.fps
    if (!f.fps) {
      const hit = this.cast(eye, dir, 30)
      const end = _v.copy(eye).addScaledVector(dir, hit.t)
      this.laserDot.position.copy(end)
      this.laser.position.copy(eye)
      this.laser.quaternion.setFromUnitVectors(Z, dir)
      this.laser.scale.set(0.012, 0.012, Math.max(hit.t, 1e-4))
    }

    // Dispersion : elle retombe ; marcher l'ouvre.
    this.bloom *= Math.exp(-w.settle * dt)
    this.moving = THREE.MathUtils.damp(this.moving, walking ? w.move * RAD : 0, 10, dt)
    this.drift *= Math.exp(-12 * dt)
    // Recul : le cabrage vient en quelques images, puis retombe de lui-même (moins vite détente tenue :
    // en rafale, la vue monte, puis plafonne).
    const give = 1 - Math.exp(-30 * dt)
    this.recoil.addScaledVector(this.debt, give).multiplyScalar(Math.exp(-w.recover * (this.held && w.auto ? 0.6 : 1) * dt))
    this.recoil.y = Math.min(this.recoil.y, 0.16)
    this.debt.multiplyScalar(1 - give)
    if (s.cooldown <= 0 && !this.held) this.volley = 0
    // L'arme sur son ressort.
    this.gunVel += (-260 * this.gunKick - 24 * this.gunVel) * dt
    this.gunKick += this.gunVel * dt
    this.shake = THREE.MathUtils.damp(this.shake, 0, 16, dt)
    this.punch = THREE.MathUtils.damp(this.punch, 0, 12, dt)
    this.dip = THREE.MathUtils.damp(this.dip, 0, 9, dt)
    this.flashTime -= dt
    this.hitTime -= dt
    this.jolt(f.camera, f.fps)
    if (shown === this.view[s.weapon] && shown) this.placeView(shown, f, dir, dt)
    this.placeFlash(shown, w, f.fps)
    this.drawHud(dt, f)

    if (s.timeLeft <= 0 && !s.bullets.length) this.finish(tr('Temps écoulé !', 'Time\'s up!'))
  }

  private fire(eye: THREE.Vector3, dir: THREE.Vector3, f: RangeFrame, shown: Gun | null) {
    const s = this.session!, w = WEAPONS[s.weapon]
    s.ammo[s.weapon]--
    s.cooldown = w.interval
    s.shots++
    s.started = true
    // Dispersion : un point au hasard dans le cône de l'arme (à plat, en vue de dessus, où la balle
    // reste dans le plan des cibles). Le fusil à pompe tire toute une gerbe dans ce cône.
    const spread = w.spread * RAD + this.bloom + this.moving
    shown?.root.updateWorldMatrix(true, false)
    const muzzle = shown ? this.group.worldToLocal(shown.root.localToWorld(shown.muzzle.clone())) : eye.clone()
    this.sfx.shot(w.id, f.fps ? null : this.world(muzzle), 0.94 + Math.random() * 0.12)
    const color = new THREE.Color(w.color)
    const shot: Shot = { left: w.pellets, scored: false }
    // Plus fine pour un plomb, large pour la boule de plasma.
    const width = (f.fps ? 0.011 : 0.03) * (w.pellets > 1 ? 0.6 : w.blast ? 2.6 : 1)
    for (let i = 0; i < w.pellets; i++) {
      const d = dir.clone()
      if (spread > 1e-5) {
        if (f.fps) {
          const off = Math.tan(spread * Math.sqrt(Math.random())), turn = Math.random() * Math.PI * 2
          _x.crossVectors(d, UP).normalize()
          _y.crossVectors(_x, d)
          d.addScaledVector(_x, Math.cos(turn) * off).addScaledVector(_y, Math.sin(turn) * off).normalize()
        } else d.applyAxisAngle(UP, rand(spread))
      }
      // En vue subjective, la traînée naît un peu devant le canon : rien ne part de sous le nez.
      const from = f.fps ? muzzle.clone().addScaledVector(d, 0.12) : muzzle
      s.bullets.push({ p: eye.clone(), d, speed: w.speed * (w.pellets > 1 ? 0.85 + Math.random() * 0.3 : 1), pierce: w.pierce, blast: w.blast, shot, color, streak: this.streak(from, color, width) })
    }
    this.bloom = Math.min(w.bloomMax * RAD, this.bloom + w.bloom * RAD)
    // Recul : la vue se cabre et dévie ; vu de dessus, la ligne de tir saute de côté. Une arme
    // automatique ne tremble pas au hasard : sa rafale serpente, d'un tir à l'autre.
    this.volley++
    this.debt.x += w.auto ? Math.sin(this.volley * 0.9) * w.side * RAD * 0.7 : rand(w.side * RAD)
    this.debt.y += w.kick * RAD * (0.9 + Math.random() * 0.2)
    this.drift = THREE.MathUtils.clamp(this.drift + rand((w.side + w.kick * 0.3) * RAD), -0.07, 0.07)
    this.gunVel += 8 * w.punch
    this.shake = Math.max(this.shake, 0.45 * w.punch)
    this.punch = Math.max(this.punch, w.punch)
    this.flashTime = 0.055
    this.tint.copy(color)
  }

  /** Point du repère du pont, dans le monde (pour les sons). */
  private world(p: THREE.Vector3): THREE.Vector3 {
    return this.group.localToWorld(p.clone())
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
        b.streak.head.copy(b.p)
        if (hit.target) {
          this.score(hit.target, hit.off < 0.38, b.d, b.color, b.shot)
          if (b.pierce) { b.p.addScaledVector(b.d, 0.002); continue }
        } else if (hit.normal) this.impact(b.p, hit.normal, b.color, !b.blast)
        else continue
        if (b.blast) this.explode(b)
        b.streak.flying = false
        // Dernière balle du tir, et rien de touché : la série est cassée.
        if (--b.shot.left <= 0 && !b.shot.scored) s.streak = 0
        return false
      }
      return true
    })
  }

  // ------------------------------------------------------------------ balles et effets

  private sprite(): THREE.Sprite {
    return new THREE.Sprite(new THREE.SpriteMaterial({ map: this.halo, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
  }

  private streak(from: THREE.Vector3, color: THREE.Color, width: number): Streak {
    let it = this.spare.pop()
    if (!it) {
      const ribbon = () => {
        const mesh = new THREE.Mesh(RIBBON, new THREE.MeshBasicMaterial({ map: this.ribbon, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }))
        mesh.matrixAutoUpdate = false
        mesh.frustumCulled = false
        return mesh
      }
      it = { trail: ribbon(), bolt: ribbon(), glow: this.sprite(), from: new THREE.Vector3(), head: new THREE.Vector3(), width, age: 0, flying: true }
      this.live.add(it.trail, it.bolt, it.glow)
    }
    it.from.copy(from)
    it.head.copy(from)
    it.width = width
    it.age = 0
    it.flying = true
    for (const o of [it.trail, it.bolt, it.glow]) {
      o.visible = false
      ;(o.material as THREE.MeshBasicMaterial).color.copy(color)
    }
    this.streaks.push(it)
    return it
  }

  /** Étire un ruban de `a` à `b`, large de `width`, tourné vers la caméra. */
  private lay(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, width: number, camera: THREE.Camera, origin: THREE.Vector3) {
    const len = _z.subVectors(b, a).length()
    mesh.visible = len > 1e-4
    if (!mesh.visible) return
    _z.divideScalar(len)
    // Vers la caméra : depuis le milieu du ruban ; pour une caméra orthographique, à contre-sens de son regard.
    if ((camera as THREE.OrthographicCamera).isOrthographicCamera) camera.getWorldDirection(_y).negate()
    else camera.getWorldPosition(_y).sub(origin).sub(a).addScaledVector(_z, -len / 2)
    _x.crossVectors(_z, _y)
    if (_x.lengthSq() < 1e-8) _x.crossVectors(_z, UP)
    _x.normalize()
    _y.crossVectors(_x, _z)
    mesh.matrix.makeBasis(_x.multiplyScalar(width), _y, _l.copy(_z).multiplyScalar(len)).setPosition(a)
  }

  /** Les balles en vol, leurs traînées, les éclats de lumière. */
  private updateStreaks(dt: number, camera: THREE.Camera, origin: THREE.Vector3) {
    const tail = new THREE.Vector3()
    this.streaks = this.streaks.filter((it) => {
      it.age += dt
      const k = 1 - it.age / 0.5
      if (k <= 0 && !it.flying) {
        it.trail.visible = it.bolt.visible = it.glow.visible = false
        this.spare.push(it)
        return false
      }
      this.lay(it.trail, it.from, it.head, it.width, camera, origin)
      ;(it.trail.material as THREE.MeshBasicMaterial).opacity = Math.max(0, k) * 0.55
      // Le trait : court, vif, derrière la pointe de la balle.
      const len = it.from.distanceTo(it.head)
      it.bolt.visible = it.glow.visible = it.flying && len > 1e-4
      if (it.bolt.visible) {
        tail.lerpVectors(it.head, it.from, Math.min(1, 0.55 / len))
        this.lay(it.bolt, tail, it.head, it.width * 2.4, camera, origin)
        it.glow.position.copy(it.head)
        it.glow.scale.setScalar(it.width * 5)
      }
      return true
    })
    this.bursts = this.bursts.filter((b) => {
      b.age += dt
      const k = 1 - b.age / 0.14
      if (k <= 0) {
        this.live.remove(b.sprite)
        b.sprite.material.dispose()
        return false
      }
      b.sprite.scale.setScalar(b.size * (0.5 + k * 0.5))
      b.sprite.material.opacity = k
      return true
    })
  }

  /** Éclat de lumière, là où une balle frappe. */
  private burst(at: THREE.Vector3, color: THREE.Color, size: number) {
    const sprite = this.sprite()
    sprite.material.color.copy(color)
    sprite.position.copy(at)
    sprite.scale.setScalar(size)
    this.live.add(sprite)
    this.bursts.push({ sprite, age: 0, size })
  }

  /** Le plasma explose : un grand éclat, et toutes les cibles prises dans son rayon volent en morceaux. */
  private explode(b: Bullet) {
    const s = this.session!
    this.burst(b.p, b.color, b.blast * 3.2)
    this.burst(b.p, new THREE.Color('#ffffff'), b.blast * 1.4)
    this.shake = Math.max(this.shake, 1.6)
    this.punch = Math.max(this.punch, 1.5)
    this.glow = 1
    for (let i = 0; i < 14; i++) {
      const mesh = new THREE.Mesh(this.spark, new THREE.MeshBasicMaterial({ color: b.color }))
      mesh.position.copy(b.p)
      this.live.add(mesh)
      this.debris.push({ mesh, v: new THREE.Vector3(rand(3), 0.5 + Math.random() * 3, rand(3)), spin: new THREE.Vector3(), age: 0, life: 0.3 + Math.random() * 0.35, heavy: false })
    }
    for (const t of [...s.targets]) {
      if (t.leaving || t.k < 0.5) continue
      const away = _v.set(t.x - b.p.x, t.y - b.p.y, t.z - b.p.z)
      if (away.length() > b.blast + t.r) continue
      this.score(t, false, away.lengthSq() > 1e-6 ? away.clone().normalize() : b.d, b.color, b.shot)
    }
    this.sfx.boom(this.world(b.p))
  }

  /**
   * Une cible éclate : ses morceaux partent dans la direction `d`, ses points s'affichent sur place.
   * @param shot le tir qui l'a touchée (il ne casse pas la série)
   */
  private score(t: Target, bullseye: boolean, d: THREE.Vector3, color: THREE.Color, shot: Shot) {
    const s = this.session!
    const points = rangePoints(t.small, bullseye, s.streak)
    shot.scored = true
    s.streak++
    s.hits++
    s.score = Math.min(999900, s.score + points)
    this.hitTime = bullseye ? 0.24 : 0.15
    this.shake = Math.max(this.shake, 0.2)
    this.glow = Math.max(this.glow, bullseye ? 1 : 0.7)
    this.tint.copy(color)
    // La cible éclate : ses morceaux partent avec la balle.
    const at = new THREE.Vector3(t.x, t.y, t.z)
    for (let i = 0; i < (t.small ? 5 : 8); i++) {
      const mesh = packModel(i % 3 ? 'target-fragment-small' : 'target-fragment-large', BLASTER_PACK).clone(true)
      if (t.gold) mesh.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = GOLD })
      mesh.position.set(t.x + rand(t.r * 0.7), t.y + rand(t.r * 0.7), t.z)
      mesh.rotation.set(rand(3), rand(3), rand(3))
      this.live.add(mesh)
      this.debris.push({ mesh, v: new THREE.Vector3(rand(1.6), 0.8 + Math.random() * 1.8, rand(0.8)).addScaledVector(d, 1.4), spin: new THREE.Vector3(rand(12), rand(12), rand(12)), age: 0, life: 1.4 + Math.random() * 0.6, heavy: true })
    }
    this.burst(at, color, t.r * 4.5)
    this.live.remove(t.root)
    s.targets.splice(s.targets.indexOf(t), 1)
    if (t.gold) {
      // La cible dorée rend du temps.
      s.timeLeft += GOLD_TIME
      this.pop(tr(`+${points} · +${GOLD_TIME} s`, `+${points} · +${GOLD_TIME} s`), at, true)
      this.sfx.bonus(this.world(at))
    } else {
      this.pop(`+${points}`, at, bullseye)
      this.sfx.hit(this.world(at), bullseye, 0.92 + Math.random() * 0.16)
    }
    let tier = false
    while (s.score >= rangeTier(s.level + 1)) {
      s.level++
      s.timeLeft += BONUS_TIME
      tier = true
    }
    if (tier) {
      this.banner(tr(`Palier ${s.level} · +${BONUS_TIME} s`, `Tier ${s.level} · +${BONUS_TIME} s`), false)
      this.tierGlow = 1
      this.sfx.tier()
    }
  }

  /** Annonce en haut de l'écran (`warn` : en rouge). */
  private banner(text: string, warn: boolean) {
    const s = this.session
    if (!s) return
    s.hud.banner.textContent = text
    s.hud.banner.classList.toggle('warn', warn)
    s.hud.banner.classList.add('show')
    s.bannerTime = 1.6
  }

  /** Points gagnés, affichés là où la cible a éclaté. */
  private pop(text: string, at: THREE.Vector3, good: boolean) {
    const s = this.session
    if (!s || !this.camera) return
    _v.copy(at).add(this.group.getWorldPosition(_w)).project(this.camera)
    if (_v.z > 1) return
    const el = document.createElement('span')
    el.className = good ? 'range-pop good' : 'range-pop'
    el.textContent = text
    el.style.left = `${((_v.x + 1) * 0.5 * innerWidth).toFixed(0)}px`
    el.style.top = `${((1 - _v.y) * 0.5 * innerHeight).toFixed(0)}px`
    el.onanimationend = () => el.remove()
    s.hud.pops.append(el)
  }

  /** Une balle perdue : un éclat, des étincelles, et une marque sur le mur, brûlante puis noire. */
  private impact(at: THREE.Vector3, normal: THREE.Vector3, color: THREE.Color, sound = true) {
    const glow = new THREE.MeshBasicMaterial({ color })
    for (let i = 0; i < 5; i++) {
      const mesh = new THREE.Mesh(this.spark, glow)
      mesh.position.copy(at)
      this.live.add(mesh)
      this.debris.push({ mesh, v: new THREE.Vector3(rand(1.4), rand(1.4), rand(1.4)).addScaledVector(normal, 1.2 + Math.random()), spin: new THREE.Vector3(), age: 0, life: 0.18 + Math.random() * 0.2, heavy: false })
    }
    this.burst(_v.copy(at).addScaledVector(normal, 0.02), color, 0.22)
    const mesh = new THREE.Mesh(this.mark, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }))
    mesh.position.copy(at).addScaledVector(normal, 0.006)
    mesh.quaternion.setFromUnitVectors(Z, normal)
    this.live.add(mesh)
    this.marks.push({ mesh, age: 0, color: color.clone() })
    if (this.marks.length > 40) this.dropMark(this.marks.shift()!)
    if (sound) this.sfx.wall(this.world(at), 0.9 + Math.random() * 0.3)
  }

  private dropMark(m: { mesh: THREE.Mesh }) {
    this.live.remove(m.mesh)
    ;(m.mesh.material as THREE.Material).dispose()
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
      // Les derniers instants : il rapetisse et disparaît.
      const left = p.life - p.age
      if (left < 0.3) p.mesh.scale.multiplyScalar(left / (left + dt))
      return true
    })
    this.marks = this.marks.filter((m) => {
      m.age += dt
      const material = m.mesh.material as THREE.MeshBasicMaterial
      material.color.copy(m.color).lerp(SOOT, Math.min(1, m.age / 0.45))
      material.opacity = Math.min(0.85, (6 - m.age) * 0.85)
      if (m.age < 6) return true
      this.dropMark(m)
      return false
    })
  }

  // ------------------------------------------------------------------ cibles

  /** Cible du kit, face au tireur, sur sa tige et son socle. */
  private makeTarget(small: boolean, gold = false): Pick<Target, 'root' | 'disc' | 'pole' | 'ring'> {
    const root = new THREE.Group()
    const disc = packModel(small ? 'target-small' : 'target-large', BLASTER_PACK).clone(true)
    // Le modèle est fin le long de x : un quart de tour le met face au sud.
    disc.rotation.y = Math.PI / 2
    if (gold) disc.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = GOLD })
    const pole = new THREE.Mesh(this.poleGeo, this.poleMat)
    // Un halo au pied de la cible : il jaillit quand elle sort, puis veille.
    const ring = this.sprite()
    ring.material.color.set(gold ? '#ffd24a' : '#5fd8ff')
    ring.position.y = 0.05
    root.add(pole, disc, new THREE.Mesh(this.baseGeo, this.poleMat), ring)
    return { root, disc, pole, ring }
  }

  private spawn() {
    const s = this.session!, rules = rangeLevel(s.level)
    // De temps en temps, à partir du premier palier : une cible dorée, une seule à la fois.
    const gold = s.level >= 1 && s.started && Math.random() < 0.1 && !s.targets.some((t) => t.gold)
    const small = gold || Math.random() < rules.small
    const r = small ? 0.1 : 0.17
    const moving = Math.random() < rules.moving
    const amp = moving ? 0.35 + Math.random() * 0.6 : 0
    for (let tries = 0; tries < 10; tries++) {
      const z = ROWS[Math.floor(Math.random() * ROWS.length)]
      const x0 = LANE_MIN + amp + Math.random() * (LANE_MAX - LANE_MIN - amp * 2)
      // Pas deux cibles l'une sur l'autre dans une rangée.
      if (s.targets.some((t) => t.z === z && Math.abs(t.x0 - x0) < t.amp + amp + t.r + r + 0.08)) continue
      const t: Target = {
        ...this.makeTarget(small, gold), small, r, x0, z, x: x0, y: AIM_Y, high: 0.3 + Math.random() * 0.75, amp, speed: rules.speed * (Math.random() < 0.5 ? -1 : 1),
        phase: Math.random() * Math.PI * 2, life: (rules.life + Math.random() * 0.6) * (gold ? 0.6 : 1), age: 0, k: 0, leaving: false, gold,
      }
      this.live.add(t.root)
      s.targets.push(t)
      return
    }
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
        this.live.remove(t.root)
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
      // Le halo : un éclair large à la sortie, puis une veilleuse qui respire (la dorée scintille).
      const out = t.leaving ? 0 : 1 - t.k
      t.ring.scale.setScalar(0.34 + out * 0.9 + (t.gold ? 0.08 * Math.sin(t.age * 14) : 0))
      t.ring.material.opacity = t.k * (0.35 + out * 0.65) * (t.gold ? 1 : 0.8)
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
      const fov = this.baseFov + this.punch * 0.5
      if (Math.abs(persp.fov - fov) > 1e-3) {
        persp.fov = fov
        persp.updateProjectionMatrix()
      }
    }
    if (this.shake < 0.01) return
    const a = this.shake * (fps ? 0.002 : 0.03)
    camera.position.x += rand(a)
    camera.position.y += rand(a)
    camera.position.z += rand(a)
    if (fps) camera.rotateZ(rand(this.shake * 0.0025))
  }

  /**
   * L'arme à l'écran, en bas à droite : elle recule sur son ressort au tir, traîne quand le regard
   * tourne, penche quand on marche de côté, se balance au pas, bascule pour changer de chargeur.
   */
  private placeView(gun: Gun, f: RangeFrame, dir: THREE.Vector3, dt: number) {
    const s = this.session!
    if (this.lastDir.lengthSq()) {
      const yaw = Math.atan2(dir.x, dir.z) - Math.atan2(this.lastDir.x, this.lastDir.z)
      this.sway.x = THREE.MathUtils.clamp(this.sway.x + Math.atan2(Math.sin(yaw), Math.cos(yaw)) * 0.6, -0.14, 0.14)
      this.sway.y = THREE.MathUtils.clamp(this.sway.y + (dir.y - this.lastDir.y) * 0.6, -0.14, 0.14)
    }
    this.lastDir.copy(dir)
    this.sway.multiplyScalar(Math.exp(-11 * dt))
    const speed = Math.min(1, f.move.length())
    this.bob += dt * (2 + speed * 9)
    const step = 0.2 + speed * 0.8
    // Pas de côté : l'arme penche dans le sens de la marche.
    _x.crossVectors(dir, UP).normalize()
    this.roll = THREE.MathUtils.damp(this.roll, -f.move.dot(_x) * 0.12, 8, dt)
    // Rechargement : l'arme bascule sur le flanc et descend, le temps de changer le chargeur.
    const loading = s.reload > 0 ? Math.sin(Math.min(1, (1 - s.reload / WEAPONS[s.weapon].reload) * 1.15) * Math.PI) : 0
    f.camera.updateMatrixWorld()
    _v.set(
      0.05 + this.sway.x * 0.06 + Math.cos(this.bob) * 0.0018 * step - loading * 0.012,
      -0.043 - this.dip * 0.07 - loading * 0.022 + this.sway.y * 0.05 + Math.abs(Math.sin(this.bob)) * 0.0022 * step,
      -0.1 + this.gunKick * 0.02,
    ).applyMatrix4(f.camera.matrixWorld)
    gun.root.position.copy(this.group.worldToLocal(_v))
    // Canon vers l'avant (le -z de la caméra), relevé par le recul, baissé quand on prend l'arme.
    _q.setFromEuler(_e.set(
      this.dip * 0.9 - this.gunKick * 0.3 - this.sway.y * 0.6 + loading * 0.35,
      Math.PI + this.sway.x * 0.8 + loading * 0.25,
      this.roll - loading * 0.9 + this.gunKick * 0.06,
      'YXZ',
    ))
    gun.root.quaternion.copy(f.camera.quaternion).multiply(_q)
  }

  /** Éclair du canon : un halo de la couleur du tir, le temps de trois images. */
  private placeFlash(gun: Gun | null, w: Weapon, fps: boolean) {
    this.flash.visible = !!gun && this.flashTime > 0
    if (!gun || !this.flash.visible) return
    gun.root.updateWorldMatrix(true, false)
    this.flash.position.copy(this.group.worldToLocal(gun.root.localToWorld(_v.copy(gun.muzzle))))
    this.flash.material.color.set(w.color)
    this.flash.scale.setScalar((fps ? 0.05 : 0.3) * (0.7 + w.punch * 0.3) * (0.8 + Math.random() * 0.4))
  }

  private finish(reason: string | null) {
    const s = this.session
    if (!s) return
    this.session = undefined
    const revision = ++this.revision
    this.held = this.queued = false
    for (const t of s.targets) this.live.remove(t.root)
    for (const it of this.streaks) { it.trail.visible = it.bolt.visible = it.glow.visible = false; this.spare.push(it) }
    this.streaks = []
    for (const p of this.debris) this.live.remove(p.mesh)
    this.debris = []
    for (const m of this.marks) this.dropMark(m)
    this.marks = []
    for (const b of this.bursts) { this.live.remove(b.sprite); b.sprite.material.dispose() }
    this.bursts = []
    for (const gun of [...this.hand, ...this.view]) gun.root.visible = false
    this.live.visible = false
    this.idle.visible = true
    s.hud.root.remove()
    document.body.classList.remove('range-on', 'range-top')
    this.punch = this.shake = 0
    this.lastDir.set(0, 0, 0)
    rangeState.live = false
    rangeState.weapon = null
    rangeState.flash = rangeState.tier = rangeState.alarm = rangeState.beat = 0
    this.glow = this.tierGlow = 0
    this.sfx.lights(false)
    this.music.stop()
    this.onChange?.(false)
    if (reason === null) return
    saveLocalBest(RANGE_ID, s.score)
    if (!s.shots) {
      this.sfx.take(true)
      return this.dialog.show(reason)
    }
    this.sfx.end()
    // Une gerbe ou une explosion peut faire plusieurs cibles d'un tir.
    const accuracy = Math.min(100, Math.round((s.hits / s.shots) * 100))
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

  /**
   * Éclairage du stand (cf. main.ts, lampes `range` de levels.ts) : hors partie, la lampe telle
   * qu'elle est posée. En partie, le pas de tir passe dans la pénombre et le couloir des cibles
   * prend toute la lumière : elle bat avec la musique, claque à la couleur du tir quand une cible éclate, balaie en vert
   * à chaque palier, et bat en rouge à chaque seconde des dix dernières.
   */
  light(def: { position: THREE.Vector3; color: THREE.Color; intensity: number }, out: THREE.PointLight) {
    out.color.copy(def.color)
    out.intensity = def.intensity
    if (!this.session) return
    const strobe = this.tierGlow > 0 ? 0.5 + 0.5 * Math.sin(this.tierGlow * 40) : 0
    if (def.position.z > R.line) {
      out.intensity = def.intensity * (0.3 + this.tierGlow * 0.4 * strobe)
      return
    }
    out.color.lerp(ALARM, rangeState.alarm * 0.85).lerp(MINT, this.tierGlow * strobe).lerp(this.tint, this.glow * 0.7)
    out.intensity = def.intensity * (1.1 + rangeState.beat * 0.22 + this.glow * 0.7 + this.tierGlow * strobe * 0.8 - (rangeState.alarm > 0 ? 0.35 * (1 - rangeState.alarm) : 0))
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
    const cell = (className: string, label: string, value: HTMLElement, ...more: HTMLElement[]) => {
      const node = el('div', `range-cell ${className}`)
      node.append(el('span', 'range-label', label), value, ...more)
      return node
    }
    const root = el('div', 'range-hud')
    root.setAttribute('role', 'group')
    root.setAttribute('aria-label', tr('Stand de tir', 'Shooting range'))

    // En haut : le score et son palier, le chrono, la série.
    const score = el('strong', 'range-value'), time = el('strong', 'range-value'), streak = el('strong', 'range-value')
    const tier = el('span', 'range-tier-text'), bar = el('div', 'range-tier'), tierFill = el('div', 'range-tier-fill')
    bar.append(tierFill)
    const clock = cell('range-clock', tr('Temps', 'Time'), time)
    const top = el('div', 'range-board')
    top.append(cell('range-score', tr('Score', 'Score'), score, bar, tier), clock, cell('range-streak', tr('Série', 'Streak'), streak))
    const banner = el('div', 'range-banner')
    banner.setAttribute('aria-live', 'polite')

    // Près du joueur, en hologramme : l'arme et son chargeur balle par balle ; et, chargeur vide, l'ordre de recharger.
    const ammo = el('div', 'range-holo')
    const weapon = el('span', 'range-holo-name'), mag = el('div', 'range-mag'), count = el('strong', 'range-holo-count')
    const panel = el('div', 'range-holo-panel')
    panel.append(weapon, count, mag)
    ammo.append(panel)
    const alert = el('div', 'range-alert')
    const order = el('div', 'range-holo-panel')
    alert.append(order)

    const coarse = matchMedia('(pointer: coarse)').matches
    if (coarse) order.append(tr('Recharger', 'Reload'))
    else order.append(tr('Recharger ', 'Reload '), el('kbd', '', 'R'))
    const hint = el('div', 'range-hint', coarse
      ? tr('Stick droit : glisser pour viser, lâcher pour tirer · le toucher : tir rapide', 'Right stick: drag to aim, release to fire · tap it: quick shot')
      : tr('Clic : tirer · R : recharger · E devant le mur : changer d\'arme ou la rendre · V : vue · le chrono part au premier tir', 'Click: fire · R: reload · E at the wall: swap or return your weapon · V: view · the clock starts on your first shot'))
    const dot = el('div', 'range-dot')
    dot.setAttribute('aria-hidden', 'true')
    dot.innerHTML = '<i></i><svg viewBox="-16 -16 32 32"><path d="M-11-11L-6-6M11-11L6-6M-11 11L-6 6M11 11L6 6"/></svg>'
    const pops = el('div', 'range-pops')
    pops.setAttribute('aria-hidden', 'true')
    root.append(top, banner, ammo, alert, hint, pops, dot)
    document.body.append(root)
    return { root, score, time, clock, streak, tier, tierFill, banner, ammo, weapon, mag, pips: [], count, alert, hint, dot, pops }
  }

  /** Le chargeur du HUD, balle par balle, pour l'arme en main. */
  private fillMag() {
    const s = this.session
    if (!s) return
    const w = WEAPONS[s.weapon], h = s.hud
    h.weapon.textContent = w.name
    h.mag.className = `range-mag m${w.mag}`
    h.pips = Array.from({ length: w.mag }, () => document.createElement('i'))
    h.mag.replaceChildren(...h.pips)
  }

  private drawHud(dt: number, f: RangeFrame) {
    const s = this.session!, h = s.hud, w = WEAPONS[s.weapon]
    h.score.textContent = s.score.toLocaleString()
    h.time.textContent = String(Math.ceil(s.timeLeft))
    h.clock.classList.toggle('low', s.started && s.timeLeft <= 10)
    h.streak.textContent = `× ${s.streak}`
    const from = rangeTier(s.level), to = rangeTier(s.level + 1)
    h.tier.textContent = `${tr('Palier', 'Tier')} ${s.level} · ${to.toLocaleString()} · ${tr('record', 'best')} ${Math.max(s.best, s.score).toLocaleString()}`
    h.tierFill.style.width = `${(((s.score - from) / (to - from)) * 100).toFixed(1)}%`
    // Le chargeur : les balles tirées s'éteignent ; il se regarnit pendant le rechargement.
    const left = s.reload > 0 ? Math.floor(w.mag * (1 - s.reload / w.reload)) : s.ammo[s.weapon]
    h.pips.forEach((pip, i) => pip.classList.toggle('spent', i >= left))
    h.count.textContent = String(s.reload > 0 ? left : s.ammo[s.weapon]).padStart(2, '0')
    const empty = s.reload <= 0 && s.ammo[s.weapon] === 0
    h.ammo.classList.toggle('loading', s.reload > 0)
    h.ammo.classList.toggle('low', s.reload <= 0 && s.ammo[s.weapon] > 0 && s.ammo[s.weapon] <= Math.ceil(w.mag / 4))
    h.ammo.classList.toggle('empty', empty)
    h.alert.classList.toggle('show', empty && s.timeLeft > 0)
    // Le mode d'emploi s'efface au premier tir.
    h.hint.hidden = s.started
    if (s.bannerTime > 0 && (s.bannerTime -= dt) <= 0) h.banner.classList.remove('show')
    // La mire, un point : au centre en vue subjective, sur le point visé en vue de dessus.
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
    h.dot.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
    h.dot.classList.toggle('hit', this.hitTime > 0)
    // Les hologrammes. Vue de dessus : les munitions flottent à droite du personnage, l'alerte à ses
    // pieds. Vue subjective : les munitions à gauche de la mire, tournées vers elle, l'alerte dessous ;
    // elles traînent un peu quand le regard tourne, comme l'arme.
    let hx: number, hy: number, ax: number, ay: number, turn: number
    if (f.fps) {
      const reach = Math.min(290, innerWidth * 0.5 - 150)
      hx = innerWidth / 2 - reach + this.sway.x * 260
      hy = innerHeight / 2 + 86 - this.sway.y * 200 + Math.sin(this.bob) * 1.5
      ax = innerWidth / 2
      ay = innerHeight / 2 + 74
      turn = 24
    } else {
      _v.copy(f.player).setY(f.player.y + 0.35).project(f.camera)
      const px = (_v.x + 1) * 0.5 * innerWidth, py = (1 - _v.y) * 0.5 * innerHeight
      hx = Math.min(innerWidth - 150, px + 58)
      hy = py - 30
      ax = px
      ay = py + 62
      turn = -16
    }
    h.ammo.style.transform = `translate(${hx.toFixed(1)}px, ${hy.toFixed(1)}px) ${f.fps ? 'translateX(-100%) ' : ''}perspective(520px) rotateY(${turn}deg)`
    h.ammo.classList.toggle('left', f.fps)
    h.alert.style.transform = `translate(${ax.toFixed(1)}px, ${ay.toFixed(1)}px) translateX(-50%)`
  }
}
