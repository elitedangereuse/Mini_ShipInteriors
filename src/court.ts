import * as THREE from 'three'
import { fetchBoard, localBest, saveLocalBest, submitScore } from './arcade/scores'
import type { CourtId } from './arcade/game'
import { formatCredits } from './economy/data'
import type { Wallet } from './economy/wallet'
import { BALL_RADIUS, GOAL, HOOP, sportBall, TARGET_TRAVEL } from './furniture/sport'
import type { TargetControl } from './furniture/kit'
import { tr } from './i18n'
import type { Dialog } from './ui'
import { SPORT_COURTS } from '../shared/ship-layouts.js'

/*
 * Mini-jeux de la zone sportive : tirs au panier et tirs au but. Le joueur reste sur sa marque,
 * vu de dos ; il vise à la souris (ou au doigt, aux flèches, au stick), garde le tir appuyé pour
 * doser sa force (la jauge monte) et relâche pour tirer. Chaque panier, chaque but rapporte des
 * points ; à chaque palier de score, le compte à rebours regagne du temps, et la cible (le panier,
 * ou le gardien en carton) se met à glisser le long de son mur, de plus en plus vite.
 *
 * Tout se joue chez le joueur : les autres le voient sur sa marque, pas ses ballons.
 */

const TITLES: Record<CourtId, string> = { 'gym-basket': tr('Tirs au panier', 'Hoop shots'), 'gym-foot': tr('Tirs au but', 'Penalty shots') }

/** Durée d'une partie au départ, et ce que rend chaque palier (secondes). */
const START_TIME = 45
const BONUS_TIME = 10
/** Score du palier `n` (1, 2, 3…) : 500, 1 200, 2 100, 3 200… ; de plus en plus loin l'un de l'autre. */
export const courtTier = (n: number) => 100 * n * (n + 4)
/** Vitesse de la cible (tuiles par seconde) au palier atteint : immobile, puis lente, puis de plus en plus vive. */
export const targetSpeed = (level: number) => (level < 1 ? 0 : Math.min(2.4, 0.45 + 0.4 * (level - 1)))
const POINTS = 100
/** Tir parfait : panier sans toucher le cercle ni la planche, but en pleine lucarne. */
const PERFECT = 150
/** Temps pour remplir la jauge (secondes), et délai avant le ballon suivant. */
const CHARGE_TIME = 1.7
const RELOAD = 0.45
/** On ne vise pas plus loin que cela du milieu de la cible, le long du mur. */
const AIM_RANGE = 2.3
const GRAVITY = { 'gym-basket': 6, 'gym-foot': 7 }
/** Hauteur du plafond des pièces (cf. CEILING_Y dans deck.ts) et demi-largeur des terrains entre leurs murs. */
const CEILING = 2.2
const HALF_WIDTH = 2.85
const DEPTH = 6.7

/** Vitesse et angle du tir selon la jauge (0 à 1). */
export function launch(game: CourtId, power: number): { speed: number; elevation: number } {
  if (game === 'gym-basket') return { speed: 4.3 + 2.2 * power, elevation: THREE.MathUtils.degToRad(48) }
  return { speed: 3 + 10 * power, elevation: THREE.MathUtils.degToRad(6 + 18 * power) }
}

interface Ball {
  mesh: THREE.Mesh
  v: THREE.Vector3
  age: number
  /** A touché le cercle, la planche, un poteau ou le sol avant d'entrer : plus de tir parfait. */
  touched: boolean
  /** A déjà marqué, ou a été arrêté : ne compte plus. */
  done: boolean
}

export type CourtSound = 'shoot' | 'bounce' | 'score' | 'perfect' | 'save' | 'tier' | 'end'

interface Hud {
  root: HTMLElement
  score: HTMLElement
  time: HTMLElement
  best: HTMLElement
  tier: HTMLElement
  gauge: HTMLElement
  flash: HTMLElement
}

const _p = new THREE.Vector3()
const _n = new THREE.Vector3()
const _ray = new THREE.Raycaster()
const _ndc = new THREE.Vector2()
const _plane = new THREE.Plane()
const _hit = new THREE.Vector3()

/**
 * Trajectoire d'un ballon et ce qu'il rencontre, sans affichage : c'est ce que le jeu fait tourner,
 * et ce qu'on peut rejouer hors du navigateur pour régler la jauge.
 */
export class CourtPhysics {
  /** Face du mur visé, et la cible : milieu le long du mur, décalage courant. */
  readonly wall: number
  readonly center: number
  shift = 0
  /** Ce que le pas a produit : rebond, panier ou but (parfait ou non), arrêt du gardien. */
  events: ('bounce' | 'score' | 'perfect' | 'save')[] = []

  constructor(readonly game: CourtId) {
    this.wall = SPORT_COURTS[game].wall + 0.01
    this.center = SPORT_COURTS[game].center
  }

  step(pos: THREE.Vector3, ball: Pick<Ball, 'v' | 'touched' | 'done'>, dt: number) {
    const r = BALL_RADIUS[this.game], v = ball.v
    const before = _p.copy(pos)
    v.y -= GRAVITY[this.game] * dt
    pos.addScaledVector(v, dt)
    if (this.game === 'gym-basket') this.hoop(pos, before, ball, r)
    else this.goal(pos, before, ball, r)
    // Le sol, le plafond et les murs de la pièce.
    if (pos.y < r) {
      pos.y = r
      // Un vrai rebond, ou le ballon roule : le sol le freine peu à peu.
      const hard = v.y < -0.6
      if (hard) this.events.push('bounce')
      v.y = hard ? -v.y * 0.55 : 0
      const grip = hard ? 0.88 : Math.exp(-1.2 * dt)
      v.x *= grip
      v.z *= grip
      ball.touched = true
    }
    if (pos.y > CEILING - r) { pos.y = CEILING - r; v.y = -Math.abs(v.y) * 0.5; ball.touched = true }
    if (pos.x < this.wall + r) { pos.x = this.wall + r; v.x = Math.abs(v.x) * 0.45; ball.touched = true; this.events.push('bounce') }
    if (pos.x > this.wall + DEPTH - r) { pos.x = this.wall + DEPTH - r; v.x = -Math.abs(v.x) * 0.45 }
    for (const side of [-1, 1]) {
      if ((pos.z - this.center) * side > HALF_WIDTH - r) { pos.z = this.center + side * (HALF_WIDTH - r); v.z = -side * Math.abs(v.z) * 0.5; ball.touched = true }
    }
  }

  /** Rebond sur un point dur (le cercle, un poteau) de rayon `thick`. */
  private bump(pos: THREE.Vector3, ball: Pick<Ball, 'v' | 'touched'>, qx: number, qy: number, qz: number, reach: number, bounce: number): boolean {
    _n.set(pos.x - qx, pos.y - qy, pos.z - qz)
    const d = _n.length()
    if (d >= reach || d < 1e-6) return false
    _n.divideScalar(d)
    pos.addScaledVector(_n, reach - d)
    const along = ball.v.dot(_n)
    if (along < 0) ball.v.addScaledVector(_n, -(1 + bounce) * along)
    ball.touched = true
    this.events.push('bounce')
    return true
  }

  private hoop(pos: THREE.Vector3, before: THREE.Vector3, ball: Pick<Ball, 'v' | 'touched' | 'done'>, r: number) {
    const z = this.center + this.shift
    // La planche.
    const face = this.wall + HOOP.boardZ
    if (ball.v.x < 0 && before.x - r >= face && pos.x - r < face && Math.abs(pos.z - z) < HOOP.boardW / 2 + r * 0.5 && pos.y > HOOP.boardBottom - r * 0.5 && pos.y < HOOP.boardTop + r * 0.5) {
      pos.x = face + r
      ball.v.x = -ball.v.x * 0.55
      ball.v.z *= 0.8
      ball.touched = true
      this.events.push('bounce')
    }
    // Le cercle : le point de l'anneau le plus proche du ballon.
    const cx = this.wall + HOOP.rimZ, dx = pos.x - cx, dz = pos.z - z, flat = Math.hypot(dx, dz)
    if (flat > 1e-6) this.bump(pos, ball, cx + (dx / flat) * HOOP.rimR, HOOP.rimY, z + (dz / flat) * HOOP.rimR, r + 0.014, 0.5)
    // Panier : le ballon descend à travers l'anneau.
    if (!ball.done && before.y >= HOOP.rimY && pos.y < HOOP.rimY && Math.hypot(pos.x - cx, pos.z - z) < HOOP.rimR) {
      ball.done = true
      this.events.push(ball.touched ? 'score' : 'perfect')
      // Le filet le freine.
      ball.v.x *= 0.25
      ball.v.z *= 0.25
      ball.v.y *= 0.7
    }
  }

  private goal(pos: THREE.Vector3, before: THREE.Vector3, ball: Pick<Ball, 'v' | 'touched' | 'done'>, r: number) {
    const { half, height, post } = GOAL
    const line = this.wall + GOAL.lineZ, keeper = this.wall + GOAL.keeperZ
    // Le gardien : un carton en T, jambes et torse étroits, bras écartés à hauteur d'épaules.
    if (!ball.done && ball.v.x < 0 && before.x - r >= keeper && pos.x - r < keeper) {
      const off = Math.abs(pos.z - (this.center + this.shift))
      const body = off < 0.16 + r * 0.7 && pos.y < GOAL.keeperH + r * 0.5
      const arms = off < GOAL.keeperW / 2 + r * 0.6 && pos.y > 0.52 - r * 0.6 && pos.y < GOAL.keeperH + r * 0.5
      if (body || arms) {
        pos.x = keeper + r
        ball.v.x = -ball.v.x * 0.45
        ball.v.z += (pos.z - (this.center + this.shift)) * 3
        ball.done = true
        ball.touched = true
        this.events.push('save')
      }
    }
    // Les poteaux et la barre.
    for (const side of [-1, 1]) this.bump(pos, ball, line, Math.min(pos.y, height), this.center + side * (half + post), r + post, 0.5)
    this.bump(pos, ball, line, height + post, THREE.MathUtils.clamp(pos.z, this.center - half, this.center + half), r + post, 0.5)
    // But : le ballon passe la ligne, entre les poteaux et sous la barre.
    if (!ball.done && before.x >= line && pos.x < line && Math.abs(pos.z - this.center) < half && pos.y < height) {
      ball.done = true
      const corner = pos.y > height - 0.4 && Math.abs(pos.z - this.center) > half - 0.5
      this.events.push(corner ? 'perfect' : 'score')
      // Les filets l'arrêtent.
      ball.v.multiplyScalar(0.2)
    }
  }
}

export class CourtGame {
  private session?: {
    id: CourtId
    physics: CourtPhysics
    target: TargetControl
    score: number
    level: number
    made: number
    shots: number
    best: number
    timeLeft: number
    elapsed: number
    /** Avancement de la cible sur sa course (radians). */
    phase: number
    /** Le tir est tenu appuyé (souris, doigt, touche, bouton). */
    holding: boolean
    charging: boolean
    power: number
    reload: number
    /** Point visé le long du mur (écart au milieu de la cible). */
    aim: number
    balls: Ball[]
    hud: Hud
    flashTime: number
  }
  private revision = 0
  /** Trait de visée au sol, de la marque jusqu'au pied de la cible, et sa pointe. */
  private readonly arrow = new THREE.Group()
  private readonly shaft: THREE.Mesh
  private readonly tip: THREE.Mesh
  private readonly held = new Set<string>()
  /** Bruitages (cf. main.ts) : `at`, là où cela se passe, dans le repère du pont. */
  onSound?: (sound: CourtSound, at: THREE.Vector3) => void
  /** Le joueur tire : geste du personnage. */
  onShoot?: () => void

  /** @param group le pont supérieur : les ballons y volent, dans son repère */
  constructor(private group: THREE.Object3D, private dialog: Dialog, private wallet: Wallet) {
    // Le trait de visée : il part des pieds du tireur, le long du sol (+z de son repère).
    const paint = new THREE.MeshBasicMaterial({ color: '#ffd24a', transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide })
    this.shaft = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 1).rotateX(Math.PI / 2).translate(0, 0, 0.5), paint)
    const head = new THREE.Shape()
    head.moveTo(-0.16, 0); head.lineTo(0, 0.32); head.lineTo(0.16, 0)
    this.tip = new THREE.Mesh(new THREE.ShapeGeometry(head).rotateX(Math.PI / 2), paint)
    this.shaft.position.z = 0.45
    this.arrow.add(this.shaft, this.tip)
    this.arrow.visible = false
    group.add(this.arrow)
  }

  get active() { return !!this.session }
  get game(): CourtId | null { return this.session?.id ?? null }

  /** Azimut de la vue (cf. FirstPersonCamera) : la caméra derrière le tireur, face au mur visé. */
  readonly viewYaw = Math.PI / 2
  /** Regard un peu plongeant : la caméra monte derrière le tireur, on voit le sol devant lui. */
  readonly viewPitch = THREE.MathUtils.degToRad(-6)

  /** Cap du personnage (cf. Player.setHeading) : tourné vers le point visé. */
  get heading(): number {
    const s = this.session
    if (!s) return -Math.PI / 2
    const spot = SPORT_COURTS[s.id].spot
    return Math.atan2(this.aimX(s.id) - spot.x, s.physics.center + s.aim - spot.z)
  }

  /** Abscisse du plan visé : l'anneau du panier, la ligne de but. */
  private aimX(id: CourtId): number {
    return SPORT_COURTS[id].wall + (id === 'gym-basket' ? HOOP.rimZ : GOAL.lineZ)
  }

  start(id: CourtId, target: TargetControl) {
    if (this.session) this.finish(null)
    const revision = ++this.revision
    const hud = this.buildHud(id)
    this.session = {
      id, physics: new CourtPhysics(id), target, score: 0, level: 0, made: 0, shots: 0, best: localBest(id), timeLeft: START_TIME, elapsed: 0,
      phase: 0, holding: false, charging: false, power: 0, reload: 0.6, aim: 0, balls: [], hud, flashTime: 0,
    }
    this.held.clear()
    this.arrow.visible = true
    void fetchBoard(id).then((board) => {
      if (revision !== this.revision || !this.session) return
      if (board?.me) this.session.best = Math.max(this.session.best, board.me.score)
    })
  }

  stop() { this.finish(tr('Partie interrompue.', 'Game stopped.')) }

  // ------------------------------------------------------------------ commandes

  /** Vise le point du mur sous le curseur (ou le doigt). */
  aimAt(camera: THREE.Camera, clientX: number, clientY: number) {
    const s = this.session
    if (!s) return
    _ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1)
    _ray.setFromCamera(_ndc, camera)
    _plane.set(_n.set(1, 0, 0), -this.aimX(s.id))
    if (!_ray.ray.intersectPlane(_plane, _hit)) return
    s.aim = THREE.MathUtils.clamp(_hit.z - s.physics.center, -AIM_RANGE, AIM_RANGE)
  }

  /** Le tir est appuyé : la jauge monte, dès que le ballon suivant est en main. */
  press() {
    if (this.session) this.session.holding = true
  }

  /** Le tir est relâché : le ballon part. */
  release() {
    const s = this.session
    if (s) s.holding = false
    if (!s?.charging) return
    s.charging = false
    this.shoot(s.power)
    s.power = 0
  }

  /** @returns true si la touche est prise par le jeu */
  key(e: KeyboardEvent): boolean {
    if (!this.session) return false
    if (e.code === 'Tab' || e.code === 'Enter' || e.code === 'NumpadEnter') return false
    e.preventDefault()
    if (e.code === 'Escape') this.stop()
    else if (e.code === 'Space' || e.code === 'KeyE') { if (!e.repeat) this.press() }
    else this.held.add(e.code)
    return true
  }

  keyUp(e: KeyboardEvent) {
    this.held.delete(e.code)
    if (this.session && (e.code === 'Space' || e.code === 'KeyE')) this.release()
  }

  /** Manette : le stick vise, le bouton d'action tient le tir. */
  pad(x: number, fire: boolean, dt: number) {
    const s = this.session
    if (!s) return
    // Face au mur ouest, la droite de l'écran est au nord (-z).
    if (Math.abs(x) > 0.15) s.aim = THREE.MathUtils.clamp(s.aim - x * 2.2 * dt, -AIM_RANGE, AIM_RANGE)
    if (fire && !this.padFire) this.press()
    else if (!fire && this.padFire) this.release()
    this.padFire = fire
  }
  private padFire = false

  // ------------------------------------------------------------------ partie

  private shoot(power: number) {
    const s = this.session!
    const spot = SPORT_COURTS[s.id].spot, r = BALL_RADIUS[s.id]
    const yaw = this.heading, dx = Math.sin(yaw), dz = Math.cos(yaw)
    const { speed, elevation } = launch(s.id, power)
    const mesh = sportBall(s.id)
    const basket = s.id === 'gym-basket'
    mesh.position.set(spot.x + dx * (basket ? 0.18 : 0.3), basket ? 0.62 : r, spot.z + dz * (basket ? 0.18 : 0.3))
    const flat = Math.cos(elevation) * speed
    const ball: Ball = { mesh, v: new THREE.Vector3(dx * flat, Math.sin(elevation) * speed, dz * flat), age: 0, touched: false, done: false }
    this.group.add(mesh)
    s.balls.push(ball)
    s.shots++
    s.reload = RELOAD
    this.onShoot?.()
    this.onSound?.('shoot', mesh.position)
  }

  /** @param dt temps écoulé (secondes) */
  update(dt: number) {
    const s = this.session
    if (!s) return
    // Les flèches (ou A et D) déplacent la visée.
    const turn = (this.held.has('ArrowLeft') || this.held.has('KeyA') ? 1 : 0) - (this.held.has('ArrowRight') || this.held.has('KeyD') ? 1 : 0)
    if (turn) s.aim = THREE.MathUtils.clamp(s.aim + turn * 2.2 * dt, -AIM_RANGE, AIM_RANGE)

    s.elapsed += dt
    s.timeLeft = Math.max(0, s.timeLeft - dt)
    s.reload = Math.max(0, s.reload - dt)
    if (s.holding && !s.charging && s.reload <= 0 && s.timeLeft > 0) {
      s.charging = true
      s.power = 0
    }
    if (s.charging) s.power = Math.min(1, s.power + dt / CHARGE_TIME)
    // Fin du temps : le tir en cours part, les ballons en l'air comptent encore.
    if (s.timeLeft <= 0 && s.charging) this.release()

    // La cible glisse le long de son mur.
    const travel = s.id === 'gym-basket' ? TARGET_TRAVEL : GOAL.half - GOAL.keeperW / 2
    s.phase += (targetSpeed(s.level) / travel) * dt
    s.physics.shift = Math.sin(s.phase) * travel
    // Repère du meuble, tourné d'un quart de tour : son axe x est le -z du pont.
    s.target.slide(-s.physics.shift)

    for (const ball of s.balls) {
      ball.age += dt
      for (let left = dt; left > 1e-5; left -= 1 / 180) {
        s.physics.step(ball.mesh.position, ball, Math.min(left, 1 / 180))
        for (const event of s.physics.events) this.event(event, ball)
        s.physics.events.length = 0
      }
      ball.mesh.rotation.z += ball.v.x * dt * 6
      ball.mesh.rotation.x += ball.v.z * dt * 6
      // Un ballon qui ne sert plus s'efface.
      const fade = ball.age - (ball.done ? 2.2 : 3.6)
      if (fade > 0) ball.mesh.scale.setScalar(Math.max(0.01, 1 - fade / 0.4))
    }
    s.balls = s.balls.filter((ball) => {
      if (ball.age < (ball.done ? 2.6 : 4)) return true
      this.group.remove(ball.mesh)
      ball.mesh.geometry.dispose()
      return false
    })

    // Le trait de visée, jusqu'au pied de la cible : jaune, puis rouge à mesure que la jauge monte.
    const spot = SPORT_COURTS[s.id].spot
    const reach = Math.hypot(this.aimX(s.id) - spot.x, s.physics.center + s.aim - spot.z) - (s.id === 'gym-basket' ? 0.1 : 0.75)
    this.arrow.position.set(spot.x, 0.03, spot.z)
    this.arrow.rotation.y = this.heading
    this.shaft.scale.z = reach - 0.45 - 0.3
    this.tip.position.z = reach - 0.3
    ;(this.shaft.material as THREE.MeshBasicMaterial).color.setHSL(0.13 - s.power * 0.13, 1, 0.6)

    this.drawHud(dt)
    if (s.timeLeft <= 0 && !s.balls.some((b) => !b.done && b.age < 3)) this.finish(tr('Temps écoulé !', 'Time\'s up!'))
  }

  private event(event: CourtPhysics['events'][number], ball: Ball) {
    const s = this.session!
    const at = ball.mesh.position
    if (event === 'bounce') return this.onSound?.('bounce', at)
    if (event === 'save') {
      s.target.hit()
      this.flash(tr('Arrêté !', 'Saved!'), false)
      return this.onSound?.('save', at)
    }
    const perfect = event === 'perfect'
    const basket = s.id === 'gym-basket'
    if (basket) s.target.hit()
    s.made++
    s.score = Math.min(99900, s.score + (perfect ? PERFECT : POINTS))
    let text = perfect
      ? (basket ? tr('Swish ! +150', 'Swish! +150') : tr('Lucarne ! +150', 'Top corner! +150'))
      : (basket ? tr('Panier ! +100', 'Basket! +100') : tr('But ! +100', 'Goal! +100'))
    let tier = false
    while (s.score >= courtTier(s.level + 1)) {
      s.level++
      s.timeLeft += BONUS_TIME
      tier = true
    }
    if (tier) text += tr(` · Palier ${s.level} : +${BONUS_TIME} s`, ` · Tier ${s.level}: +${BONUS_TIME} s`)
    this.flash(text, true)
    this.onSound?.(tier ? 'tier' : perfect ? 'perfect' : 'score', at)
  }

  private finish(reason: string | null) {
    const s = this.session
    if (!s) return
    this.session = undefined
    const revision = ++this.revision
    this.held.clear()
    this.padFire = false
    this.arrow.visible = false
    s.target.slide(0)
    s.hud.root.remove()
    for (const ball of s.balls) { this.group.remove(ball.mesh); ball.mesh.geometry.dispose() }
    if (reason === null) return
    saveLocalBest(s.id, s.score)
    this.onSound?.('end', this.arrow.position)
    const shots = s.id === 'gym-basket' ? tr(`${s.made} paniers en ${s.shots} tirs`, `${s.made} baskets from ${s.shots} shots`) : tr(`${s.made} buts en ${s.shots} tirs`, `${s.made} goals from ${s.shots} shots`)
    const summary = tr(`${reason} ${s.score} points (${shots}).`, `${reason} ${s.score} points (${shots}).`)
    this.dialog.show(summary)
    if (!s.score) return
    void submitScore(s.id, s.score, s.level + 1, Math.max(1, Math.ceil(s.elapsed))).then((result) => {
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

  // ------------------------------------------------------------------ affichage

  private buildHud(id: CourtId): Hud {
    const el = (tag: string, className: string, text = '') => {
      const node = document.createElement(tag)
      node.className = className
      node.textContent = text
      return node
    }
    const root = el('div', 'court-hud')
    root.setAttribute('role', 'group')
    root.setAttribute('aria-label', TITLES[id])
    const top = el('div', 'court-top')
    const score = el('strong', 'court-score'), time = el('strong', 'court-time'), best = el('span', 'court-best'), tier = el('span', 'court-tier')
    const scoreBox = el('div', 'court-box'), timeBox = el('div', 'court-box')
    scoreBox.append(el('span', 'court-label', TITLES[id]), score, tier)
    timeBox.append(el('span', 'court-label', tr('Temps', 'Time')), time, best)
    const quit = el('button', 'court-quit', tr('Arrêter (Échap)', 'Stop (Esc)')) as HTMLButtonElement
    quit.type = 'button'
    quit.onclick = () => this.stop()
    top.append(scoreBox, timeBox, quit)
    const flash = el('div', 'court-flash')
    flash.setAttribute('aria-live', 'polite')
    const bar = el('div', 'court-gauge')
    const gauge = el('div', 'court-gauge-fill')
    bar.append(gauge)
    const power = el('div', 'court-power')
    const coarse = matchMedia('(pointer: coarse)').matches
    power.append(el('span', 'court-label', tr('Force', 'Power')), bar, el('span', 'court-help', coarse
      ? tr('Touchez pour viser, gardez appuyé pour doser, relâchez pour tirer', 'Touch to aim, hold to build power, release to shoot')
      : tr('Visez à la souris · gardez le clic (ou Espace) appuyé pour doser · relâchez pour tirer', 'Aim with the mouse · hold the click (or Space) to build power · release to shoot')))
    root.append(top, flash, power)
    document.body.append(root)
    return { root, score, time, best, tier, gauge, flash }
  }

  private flash(text: string, good: boolean) {
    const s = this.session!
    s.hud.flash.textContent = text
    s.hud.flash.classList.toggle('good', good)
    s.hud.flash.classList.add('show')
    s.flashTime = 1.4
  }

  private drawHud(dt: number) {
    const s = this.session!, h = s.hud
    h.score.textContent = s.score.toLocaleString()
    h.time.textContent = String(Math.ceil(s.timeLeft))
    h.time.classList.toggle('low', s.timeLeft <= 10)
    h.best.textContent = `${tr('Record', 'Best')} ${Math.max(s.best, s.score).toLocaleString()}`
    h.tier.textContent = `${tr('Palier', 'Tier')} ${s.level} · ${tr('suivant à', 'next at')} ${courtTier(s.level + 1).toLocaleString()}`
    h.gauge.style.width = `${s.power * 100}%`
    h.root.classList.toggle('charging', s.charging)
    if (s.flashTime > 0 && (s.flashTime -= dt) <= 0) h.flash.classList.remove('show')
  }
}
