import * as THREE from 'three'
import type { Wallet } from '../economy/wallet'
import { tr } from '../i18n'
import { RangeGame, type Bullet, type Gun, type Hit, type RangeFrame, type Session, type Shot, type Streak } from '../range'
import type { RangeTune } from '../range-music'
import type { RangeSfx } from '../range-sfx'
import type { Weapon } from '../range-weapons'
import { dampAngle } from '../player'
import type { Dialog } from '../ui'
import { arenaGround, arenaSight, castArena, lobTarget, lobTime, type ArenaZone, type CharacterId } from '../../shared/arena.js'
import { ARMS, characterById, type ArenaArm } from './characters'
import { AimSight } from './sight'

/*
 * Le moteur du stand de tir (cf. src/range.ts), dans l'arène : chacun y a l'arme de son personnage
 * (cf. characters.ts), avec la visée, le recul, les projectiles et les hologrammes du stand. Ce qui
 * change :
 * - un projectile s'arrête sur les cloisons et les conteneurs de l'arène, ou sur un combattant d'en
 *   face (cf. castArena, le même calcul que le relais) ; il traverse ses coéquipiers, sauf les
 *   seringues de Betty, qui s'arrêtent sur un coéquipier blessé (elles le soignent) ;
 * - la graine de Capucine et le cocktail de Jacques se lancent en cloche, par-dessus tout, jusqu'au
 *   point visé (à la souris, sous le curseur ; au stick, d'autant plus loin qu'il est poussé) : ils
 *   ne touchent rien en vol, et retombent là ;
 * - c'est le relais qui compte les dégâts et les soins : ici, le projectile n'est qu'un effet. Chaque
 *   tir lui est envoyé (d'où il part, une direction par projectile, et jusqu'où pour un objet lancé),
 *   et il renvoie ceux des autres, qu'on dessine de la même façon ;
 * - pas de cibles, de score ni de chrono : la partie dure tant que le relais ne l'a pas finie ;
 * - vue par-dessus l'épaule, la balle part du personnage vers ce que la mire recouvre (cf. sightline) ;
 * - un chargeur vide se change tout seul (au stand, il faut le demander) : ici, on se bat ;
 * - les autres combattants tiennent leur arme : un modèle par combattant, posé dans ses mains ;
 * - un projectile ne vole pas plus loin que la portée de l'arme (`range`, le relais compte de même),
 *   et vu de dessus, un cône peint au sol la montre (cf. sight.ts), à la place du laser du stand ;
 * - au stick tactile, comme dans Brawl Stars : on le glisse, le cône paraît, on le lâche, le coup
 *   part (une rafale, pour la mitraillette de Rourke) ; un simple toucher tire sur l'adversaire le
 *   plus proche ; et tant qu'on ne vise pas, le personnage regarde où il court.
 */

/** Combattant debout, dans le repère de l'arène : ce qu'un projectile peut toucher (`hurt` : blessé, Betty peut le soigner). */
export interface ArenaBody { id: number; team: number; x: number; z: number; hurt?: boolean }

/** Ce que la partie prête à l'arme (cf. src/arena/client.ts). */
export interface ArenaGunHost {
  zone: ArenaZone
  /** Le joueur : son identifiant, son équipe. */
  self(): number
  team(): number
  /** Les combattants debout, joueur compris. */
  bodies(): ArenaBody[]
  /** Le joueur peut tirer : debout, après le coup d'envoi. */
  canFire(): boolean
  /** Un tir part : au relais (`r` : jusqu'où, pour un objet lancé). */
  fire(origin: [number, number, number], dirs: [number, number, number][], r?: number): void
  /** Les adversaires debout que le joueur voit (pas ceux qu'un buisson cache) : ceux que vise le tir rapide. */
  foes(): { x: number; z: number }[]
  /** Échap : quitter la partie ? */
  quit(): void
}

/** Un objet lancé en vol : il suit sa cloche, de sa main au point visé. */
interface Lob {
  mesh: THREE.Object3D
  shadow: THREE.Mesh
  from: THREE.Vector3
  to: THREE.Vector3
  dur: number
  age: number
  peak: number
  arm: ArenaArm
  spin: THREE.Vector3
}

const _v = new THREE.Vector3()
const _chest = new THREE.Vector3()
const _from = new THREE.Vector3()
/** Hauteur d'où part la balle, vue par-dessus l'épaule : la poitrine du personnage. */
const CHEST = 0.42
/** Délai entre le dernier tir d'un chargeur et son rechargement automatique (secondes). */
const AUTO_RELOAD = 0.18
const RAD = Math.PI / 180
/** Au doigt : délai après un tir avant que le personnage ne se retourne vers où il court (secondes). */
const FACE_AFTER = 0.45
/** Tir rapide : un adversaire un peu au-delà de la portée est visé quand même (il approche). */
const QUICK_MARGIN = 1
/** Au stick, un objet lancé part au moins à cette part de sa portée (stick à peine poussé). */
const THROW_MIN = 0.2
/** Vue de dessus, la balle part d'un peu devant le tireur (cf. RangeGame.update) : un objet lancé aussi. */
const MUZZLE_AHEAD = 0.3
const SHADOW = new THREE.CircleGeometry(0.06, 14).rotateX(-Math.PI / 2)
const BALL = new THREE.SphereGeometry(0.04, 8, 6)
const SHADOW_MAT = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.35, depthWrite: false })
const PULP = new THREE.Color('#ff3a1e'), DIRT = new THREE.Color('#7a5230'), GLASS = new THREE.Color('#dff4ff'), HEAL = new THREE.Color('#7dffb0')
const rand = (a: number) => (Math.random() * 2 - 1) * a

export class ArenaGun extends RangeGame {
  host: ArenaGunHost | null = null
  /** L'arme des autres combattants, par combattant. */
  private readonly carried = new Map<number, { gun: Gun; character: CharacterId }>()
  private fpsView = false
  /** Depuis quand le chargeur est vide (secondes) : il se change de lui-même après un instant. */
  private emptyFor = 0
  /** Balle de match : une équipe est à un point de la limite (cf. rushing ; le morceau enregistré n'en fait rien, cf. music.ts). */
  matchPoint = false
  /** Spectateur : pas d'arme, on regarde (à régler avant `begin`). */
  watching = false
  /** Le cône de visée, au sol (vue de dessus). */
  private readonly cone = new AimSight()
  /** Écran tactile : le cône ne paraît que le temps de viser, et le personnage regarde où il court. */
  private readonly touch = matchMedia('(pointer: coarse)').matches
  /** Balles qu'il reste à la rafale en cours (arme automatique, stick lâché). */
  private salvo = 0
  /** Depuis quand on n'a pas tiré (secondes), et où l'on marchait à la dernière image. */
  private calm = 0
  private readonly stride = new THREE.Vector3()
  /** Au stick, jusqu'où lancer (part de la portée), et où retombera l'objet visé (repère de l'arène). */
  private throwK = 0.7
  private readonly landing = new THREE.Vector3()
  /** Les objets lancés en vol, et les tomates qui suivent leur projectile. */
  private lobs: Lob[] = []
  private readonly balls = new Map<Bullet, THREE.Object3D>()
  /** L'arme de chaque projectile en vol (pour l'éclat d'une tomate). */
  private readonly armOfBullet = new WeakMap<Bullet, ArenaArm>()

  /** @param group le pont de l'arène : armes et balles y vivent, dans son repère */
  constructor(group: THREE.Object3D, dialog: Dialog, wallet: Wallet, sfx: RangeSfx, music: RangeTune) {
    // Le décor du stand ne lit rien d'ici : l'arène a son propre état.
    super(group, dialog, wallet, sfx, music, { idle: false, state: { live: false, weapon: null, flash: 0, tier: 0, alarm: 0, beat: 0 }, arsenal: ARMS })
    this.debrisMinZ = -Infinity
    this.live.add(this.cone.root)
  }

  protected override groundAt(x: number, z: number): number {
    return this.host ? arenaGround(this.host.zone, { x, z }) : 0
  }

  protected override reach(): number {
    return this.arm?.range ?? super.reach()
  }

  /** Une partie sur un autre plan : armes et balles passent dans son pont, et l'on y vise (`zone`). */
  attach(group: THREE.Object3D, zone: ArenaZone) {
    this.group = group
    group.add(this.live, this.idle)
    if (this.host) this.host.zone = zone
  }

  /** L'arme du personnage qu'on joue. */
  private get arm(): ArenaArm | null {
    return this.session ? ARMS[this.session.weapon] : null
  }

  /** La partie commence, ou l'on revient à sa base : l'arme de ce personnage en main, chargeur plein. */
  begin(id: CharacterId) {
    const index = Math.max(0, ARMS.findIndex((w) => w.id === id))
    if (!this.session) {
      this.start(index)
      const s = this.session!
      // Ni cibles ni score : le relais tient le chrono (cf. sync) et décide de la fin.
      s.timeLeft = s.second = Infinity
      s.hud.root.classList.add('arena')
    } else if (this.session.weapon !== index) this.equip(index)
    // Le mode d'emploi est celui de son arme (on tire, ou l'on lance).
    this.session!.hud.hint.textContent = this.hintText(this.touch)
    this.session!.ammo = ARMS.map((w) => w.mag)
    this.session!.reload = 0
    this.session!.hud.root.classList.remove('down')
    this.holstered = false
  }

  /**
   * Ce que le relais dit de la partie : le temps qu'il reste (le moteur annonce les dix dernières
   * secondes), si le coup d'envoi est donné, et l'ardeur du moment (0 à 3), donnée à la musique.
   */
  sync(left: number, live: boolean, heat: number) {
    const s = this.session
    if (!s) return
    s.started = live
    // Jamais à zéro : c'est le relais qui siffle la fin.
    s.timeLeft = live ? Math.max(0.6, left) : Infinity
    if (!live) s.second = Infinity
    s.level = heat
  }

  /** Ce qu'il reste dans le chargeur de l'arme en main, de 0 à 1 (il se regarnit pendant le rechargement). */
  get loaded(): number {
    const s = this.session, w = this.arm
    if (!s || !w) return 0
    return s.reload > 0 ? 1 - s.reload / w.reload : s.ammo[s.weapon] / w.mag
  }

  /** Éliminé : l'arme disparaît jusqu'au retour à la base. */
  down() {
    this.holstered = true
    this.salvo = 0
    this.trigger(false)
    this.session?.hud.root.classList.add('down')
  }

  /** Fin de la partie : tout est rangé, sans résumé (l'écran de fin est celui de l'arène). */
  end() {
    for (const id of [...this.carried.keys()]) this.disarm(id)
    for (const l of this.lobs) l.mesh.removeFromParent(), l.shadow.removeFromParent()
    this.lobs = []
    for (const mesh of this.balls.values()) mesh.removeFromParent()
    this.balls.clear()
    this.finish(null)
  }

  /** Échap ne rend pas l'arme : il propose de quitter la partie. */
  override stop() {
    this.host?.quit()
  }

  /** Les armes ne se décrochent pas d'un mur, ici. */
  override take() {}

  override update(dt: number, f: RangeFrame) {
    this.fpsView = f.fps
    this.calm += dt
    this.stride.copy(f.move).setY(0)
    // Une rafale s'arrête avec son chargeur, ou si l'on ne peut plus tirer.
    if (this.salvo > 0 && (this.empty || this.reloading || !this.ready())) {
      this.salvo = 0
      this.held = false
    }
    // Au doigt, tant qu'on ne vise pas : le personnage regarde où il court, comme dans Brawl Stars.
    if (this.touch && !f.fps && !this.sighting && this.salvo <= 0 && this.calm > FACE_AFTER && this.stride.lengthSq() > 0.04) {
      this.pointer = null
      const yaw = dampAngle(Math.atan2(this.aim.x, this.aim.z), Math.atan2(this.stride.x, this.stride.z), 14, dt)
      this.aim.set(Math.sin(yaw), 0, Math.cos(yaw))
    }
    super.update(dt, f)
    // Chargeur vide : le temps que le dernier tir parte, et l'on recharge sans attendre l'ordre.
    this.emptyFor = this.empty && !this.holstered ? this.emptyFor + dt : 0
    if (this.emptyFor > AUTO_RELOAD) this.reload()
    this.updateLobs(dt)
    this.updateBalls(dt)
    this.sightCone(f)
  }

  /** Jusqu'où l'on lancerait maintenant, de là où part l'objet (repère de l'arène) : sous le curseur, ou selon le stick. */
  private throwDistance(f: RangeFrame, from: { x: number; z: number }, w: ArenaArm): number {
    const d = this.pointer && !f.fps ? Math.hypot(this.aimPoint.x - from.x, this.aimPoint.z - from.z) : this.throwK * w.range
    return THREE.MathUtils.clamp(d, 0.5, w.range)
  }

  /**
   * Vue de dessus : le cône de visée remplace le laser et le couloir du stand. À la souris, il est
   * toujours là ; au doigt, seulement stick de tir poussé.
   */
  private sightCone(f: RangeFrame) {
    const s = this.session, host = this.host, w = this.arm
    this.laser.visible = this.laserDot.visible = this.lane.visible = false
    const shown = !!s && !!host && !!w && !f.fps && !this.holstered && (this.sighting || !this.touch)
    this.cone.root.visible = shown
    if (!shown) return
    const origin = this.group.getWorldPosition(_v)
    _from.set(f.player.x - origin.x, f.player.y - origin.y, f.player.z - origin.z)
    let reach = 0
    if (w.lob) {
      // Là où l'objet retombera : au point visé, ou en deçà s'il y a un obstacle (il part d'un peu devant le joueur, comme au tir).
      const launch = { x: _from.x + this.aim.x * MUZZLE_AHEAD, z: _from.z + this.aim.z * MUZZLE_AHEAD }
      const to = lobTarget(host.zone, launch, this.aim, this.throwDistance(f, launch, w), w.range)
      this.landing.set(to.x, arenaGround(host.zone, to), to.z)
      reach = Math.hypot(to.x - _from.x, to.z - _from.z)
    }
    this.cone.place(host.zone, w, _from, this.aim, w.lob ? 0 : w.spread * RAD + this.bloom + this.moving, s.reload <= 0 && s.ammo[s.weapon] > 0 && this.ready(), reach, this.pitch)
  }

  /** Dans l'arène, une arme automatique ne tire pas stick poussé : on vise, puis on lâche. */
  override get sprays(): boolean {
    return false
  }

  /** Stick lâché : le coup part ; pour la mitraillette, toute une rafale, là où l'on visait. */
  override loose(_quick = false) {
    const w = this.arm
    if (!w) return
    if (!w.auto) return this.tap()
    this.salvo = w.burst ?? 6
    this.held = true
  }

  /** Un doigt relevé ailleurs (le stick de marche) ne coupe pas la rafale en cours. */
  override trigger(on: boolean) {
    if (!on && this.salvo > 0) return
    super.trigger(on)
  }

  /** Au stick : la direction visée, et, pour un objet lancé, jusqu'où (d'autant plus loin qu'il est poussé). */
  override aimToward(x: number, z: number, rise: number | null = null) {
    const k = Math.hypot(x, z)
    super.aimToward(x, z, rise)
    if (this.session && k >= 0.3) this.throwK = THREE.MathUtils.clamp(k, THROW_MIN, 1)
  }

  /**
   * Tir rapide (toucher le stick de tir) : on se tourne vers l'adversaire visible le plus proche,
   * à portée ou presque, de préférence à découvert ; sans personne, on tire devant soi, là où l'on court.
   * Un objet lancé part alors jusqu'à lui.
   */
  override aimNearest(player: { x: number; z: number }) {
    const s = this.session, host = this.host, w = this.arm
    if (!s || !host || !w) return
    const reach = w.range + QUICK_MARGIN
    let best: { x: number; z: number } | null = null
    let near = Infinity
    for (const foe of host.foes()) {
      const d = Math.hypot(foe.x - player.x, foe.z - player.z)
      if (d > reach) continue
      // Derrière un conteneur, il passe après ceux qu'on peut toucher (un objet lancé passe par-dessus).
      const rank = d + (w.lob || arenaSight(host.zone, player, foe) ? 0 : 100)
      if (rank < near) { near = rank; best = foe }
    }
    if (best) {
      const d = Math.hypot(best.x - player.x, best.z - player.z)
      // Plus haut ou plus bas que soi (le haut du site gardien) : on vise sa poitrine.
      this.aimToward(best.x - player.x, best.z - player.z, (arenaGround(host.zone, best) - arenaGround(host.zone, player)) / Math.max(0.5, d))
      this.throwK = THREE.MathUtils.clamp(d / w.range, THROW_MIN, 1)
    } else if (this.stride.lengthSq() > 0.04) this.aimToward(this.stride.x / this.stride.length(), this.stride.z / this.stride.length())
  }

  /** Tir rapide en vue subjective : la direction (monde) de l'adversaire qui s'écarte le moins de la mire. */
  override nearestInView(camera: THREE.Camera): THREE.Vector3 | null {
    const host = this.host
    if (!this.session || !host) return null
    const eye = camera.getWorldPosition(new THREE.Vector3())
    const gaze = camera.getWorldDirection(new THREE.Vector3())
    const y = this.group.getWorldPosition(_v).y + CHEST
    const to = new THREE.Vector3()
    let best: THREE.Vector3 | null = null
    // Au-delà d'un demi-champ (cos 40°), ce n'est plus « devant soi ».
    let near = 0.77
    for (const foe of host.foes()) {
      const facing = to.set(foe.x, y + arenaGround(host.zone, foe), foe.z).sub(eye).normalize().dot(gaze)
      if (facing > near && arenaSight(host.zone, { x: eye.x, z: eye.z }, foe)) { near = facing; best = to.clone() }
    }
    return best
  }

  /** Rechargement en cours (pour la plaque du joueur). */
  get reloading(): boolean {
    return (this.session?.reload ?? 0) > 0
  }

  protected override opened() {}
  protected override updateTargets() {}
  protected override blasted() {}
  protected override report() {}

  /** Dans la grande baie, les projectiles doivent rester lisibles dans les deux vues. */
  protected override streak(from: THREE.Vector3, color: THREE.Color, width: number): Streak {
    return super.streak(from, color, width * (this.fpsView ? 1.8 : 2.2))
  }

  /**
   * Vue par-dessus l'épaule (le personnage est à l'image) : la caméra est derrière lui, décalée. La
   * balle ne part pas d'elle : on cherche ce que la mire recouvre, au-delà du personnage, et l'on
   * tire de sa poitrine vers ce point. Dans les yeux, rien à corriger.
   */
  protected override sightline(eye: THREE.Vector3, dir: THREE.Vector3, f: RangeFrame, origin: THREE.Vector3) {
    if (!f.body) return
    const chest = _chest.subVectors(f.player, origin).setY(f.player.y - origin.y + CHEST)
    const ahead = Math.max(0, _v.subVectors(chest, eye).dot(dir))
    const from = _from.copy(eye).addScaledVector(dir, ahead)
    const aimed = from.addScaledVector(dir, this.cast(from, dir, 40).t)
    eye.copy(chest)
    if (aimed.distanceToSquared(chest) > 0.04) dir.subVectors(aimed, chest).normalize()
  }

  protected override rushing(s: Session): boolean {
    return s.started && (this.matchPoint || s.timeLeft <= 20)
  }

  protected override ready(): boolean {
    return !this.holstered && !!this.host?.canFire()
  }

  protected override hintText(coarse: boolean): string {
    if (this.watching) return coarse
      ? tr('Spectateur : les flèches changent de combattant', 'Spectating: the arrows switch fighter')
      : tr('Spectateur · ← → : changer de combattant · Échap : quitter', 'Spectating · ← →: switch fighter · Esc: leave')
    const lob = this.arm?.lob
    return coarse
      ? lob
        ? tr('Glisser le stick rouge pour viser (plus loin, plus fort), lâcher pour lancer · le toucher : sur le plus proche', 'Drag the red stick to aim (further, further), release to throw · tap it: at the nearest')
        : tr('Glisser le stick rouge pour viser, lâcher pour tirer · le toucher : tir sur le plus proche', 'Drag the red stick to aim, release to fire · tap it: shoot the nearest')
      : lob
        ? tr('Clic : lancer là où est le curseur, par-dessus les obstacles · V : vue · Échap : quitter', 'Click: throw where the cursor is, over obstacles · V: view · Esc: leave')
        : tr('Clic : tirer · le cône montre la portée · le chargeur se recharge seul (R : avant) · V : vue · Échap : quitter', 'Click: fire · the cone shows your range · the mag reloads itself (R: sooner) · V: view · Esc: leave')
  }

  /** Un objet lancé (la graine, le cocktail) : il part en cloche ; le reste tire comme au stand. */
  protected override fire(eye: THREE.Vector3, dir: THREE.Vector3, f: RangeFrame, shown: Gun | null) {
    const w = this.arm, host = this.host
    if (!w?.lob || !host) return super.fire(eye, dir, f, shown)
    const s = this.session!
    s.ammo[s.weapon]--
    s.cooldown = w.interval
    s.shots++
    s.started = true
    this.calm = 0
    const flat = new THREE.Vector3(dir.x, 0, dir.z)
    if (flat.lengthSq() < 1e-6) flat.copy(this.aim).setY(0)
    flat.normalize()
    // Il part de `eye` (le relais aussi) : la distance se compte de là.
    let dist: number
    if (f.fps) {
      // Dans les yeux : là où la mire touche le sol (ou l'obstacle visé).
      const at = eye.clone().addScaledVector(dir, this.cast(eye, dir, 40).t)
      dist = THREE.MathUtils.clamp(Math.hypot(at.x - eye.x, at.z - eye.z), 0.5, w.range)
    } else dist = this.throwDistance(f, eye, w)
    shown?.root.updateWorldMatrix(true, false)
    const hand = shown ? this.group.worldToLocal(shown.root.localToWorld(shown.muzzle.clone())) : eye.clone()
    const to = lobTarget(host.zone, eye, flat, dist, w.range)
    this.throwLob(w, hand, new THREE.Vector3(to.x, arenaGround(host.zone, to) + 0.06, to.z), lobTime(w, Math.hypot(to.x - eye.x, to.z - eye.z)))
    this.sfx.shot(w.sound ?? w.id, f.fps ? null : this.world(hand), 0.94 + Math.random() * 0.12)
    this.gunVel += 8 * w.punch
    this.flashTime = 0.04
    this.tint.set(w.color)
    host.fire([eye.x, eye.y, eye.z], [[flat.x, 0, flat.z]], dist)
  }

  protected override fired(eye: THREE.Vector3, dirs: THREE.Vector3[], w: Weapon) {
    const host = this.host
    if (!host) return
    const arm = w as ArenaArm
    this.calm = 0
    if (this.salvo > 0 && --this.salvo <= 0) this.held = false
    // Ses propres projectiles : ils ne le touchent pas, traversent son équipe (sauf, pour Betty, un
    // coéquipier blessé), et s'éteignent au bout de la portée de l'arme.
    for (const b of this.session!.bullets.slice(-dirs.length)) {
      b.by = host.self()
      b.team = host.team()
      b.reach = arm.range
      b.heal = !!arm.heal
      this.tag(b, arm)
    }
    host.fire([eye.x, eye.y, eye.z], dirs.map((d) => [d.x, d.y, d.z]))
  }

  /** Retient l'arme d'un projectile en vol, et lui donne son modèle (la tomate) s'il en a un. */
  private tag(b: Bullet, arm: ArenaArm) {
    this.armOfBullet.set(b, arm)
    if (!arm.ammo) return
    const mesh = arm.ammo()
    mesh.position.copy(b.p)
    this.live.add(mesh)
    this.balls.set(b, mesh)
  }

  protected override cast(p: THREE.Vector3, d: THREE.Vector3, max: number, b?: Bullet): Hit {
    const host = this.host
    if (!host) return { t: max, off: 0 }
    const team = b?.team ?? host.team()
    const self = b?.by ?? host.self()
    const bodies = host.bodies()
    const hit = castArena(host.zone, p, d, max, bodies, (id) => {
      if (b?.through?.has(id) || id === self) return true
      const o = bodies.find((x) => x.id === id)
      return o?.team === team && !(b?.heal && o.hurt)
    })
    if (hit.body !== null) return { t: hit.t, off: 0, body: hit.body }
    if (!hit.normal) return { t: hit.t, off: 0 }
    const normal = new THREE.Vector3(...hit.normal)
    // Le parement d'une cloison est en retrait de 0,15 dans la tuile : l'impact se voit dessus.
    const facing = Math.abs(d.dot(normal))
    const t = hit.wall && facing > 0.05 ? Math.max(0, hit.t - 0.15 / facing) : hit.t
    return { t, off: 0, normal }
  }

  /** Un combattant touché : un éclat de lumière, rien de plus (le relais dira ce qu'il lui en coûte, ou ce qu'il y gagne). */
  protected override struck(b: Bullet, body: number) {
    ;(b.through ??= new Set()).add(body)
    const mate = b.heal && this.host?.bodies().find((o) => o.id === body)?.team === b.team
    this.burst(b.p, mate ? HEAL : b.color, mate ? 0.45 : 0.3)
  }

  /** La tomate de Marcel s'écrase : de la pulpe partout, et un « splotch ». */
  protected override explode(b: Bullet) {
    const arm = this.armOfBullet.get(b)
    if (arm?.id !== 'marcel') return super.explode(b)
    this.splash(b.p, PULP, b.blast, 16)
    this.burst(b.p, new THREE.Color('#ffd2b0'), b.blast * 1.2)
    if (b.by === this.host?.self()) this.shake = Math.max(this.shake, 0.8)
    this.sfx.splat(this.world(b.p))
  }

  /** Un éclat de couleur et ses morceaux, là où quelque chose s'écrase (repère de l'arène). */
  private splash(at: THREE.Vector3, color: THREE.Color, size: number, pieces: number) {
    this.burst(at, color, size * 3)
    const material = new THREE.MeshBasicMaterial({ color })
    for (let i = 0; i < pieces; i++) {
      const mesh = new THREE.Mesh(this.spark, material)
      mesh.position.copy(at)
      mesh.scale.setScalar(2 + Math.random() * 2)
      this.live.add(mesh)
      this.debris.push({ mesh, v: new THREE.Vector3(rand(2.6), 0.6 + Math.random() * 2.2, rand(2.6)), spin: new THREE.Vector3(), age: 0, life: 0.35 + Math.random() * 0.4, heavy: true })
    }
  }

  // ------------------------------------------------------------------ objets lancés

  /** Un objet part en cloche, de `from` à `to` (repère de l'arène), en `dur` secondes. */
  private throwLob(arm: ArenaArm, from: THREE.Vector3, to: THREE.Vector3, dur: number) {
    const mesh = arm.ammo?.() ?? new THREE.Mesh(BALL, new THREE.MeshBasicMaterial({ color: arm.color }))
    mesh.position.copy(from)
    const shadow = new THREE.Mesh(SHADOW, SHADOW_MAT)
    shadow.position.set(from.x, 0.02, from.z)
    this.live.add(mesh, shadow)
    const far = Math.hypot(to.x - from.x, to.z - from.z)
    this.lobs.push({ mesh, shadow, from: from.clone(), to: to.clone(), dur: Math.max(0.05, dur), age: 0, peak: 0.45 + far * 0.14, arm, spin: new THREE.Vector3(rand(9), rand(4), rand(9)) })
  }

  private updateLobs(dt: number) {
    this.lobs = this.lobs.filter((l) => {
      l.age += dt
      const u = Math.min(1, l.age / l.dur)
      l.mesh.position.lerpVectors(l.from, l.to, u)
      l.mesh.position.y += l.peak * 4 * u * (1 - u)
      l.mesh.rotation.x += l.spin.x * dt
      l.mesh.rotation.y += l.spin.y * dt
      l.mesh.rotation.z += l.spin.z * dt
      l.shadow.position.set(l.mesh.position.x, 0.02, l.mesh.position.z)
      l.shadow.scale.setScalar(0.6 + u * 0.6)
      if (u < 1) return true
      l.mesh.removeFromParent()
      l.shadow.removeFromParent()
      this.landed(l)
      return false
    })
  }

  /** Il retombe : le cocktail éclate (le relais allumera la flaque), la graine s'enfouit (la fleur poussera). */
  private landed(l: Lob) {
    const at = l.to
    if (l.arm.fire) {
      this.splash(at, new THREE.Color(l.arm.color), l.arm.blast, 10)
      this.splash(at, GLASS, 0.3, 8)
      this.burst(at, new THREE.Color('#ffd23c'), l.arm.blast * 2)
      this.sfx.shatter(this.world(at))
    } else {
      this.splash(at, DIRT, 0.25, 8)
      this.sfx.plant(this.world(at))
    }
  }

  /** Les tomates suivent leur projectile, et disparaissent avec lui. */
  private updateBalls(dt: number) {
    const flying = new Set(this.session?.bullets ?? [])
    for (const [b, mesh] of this.balls) {
      if (!flying.has(b)) {
        mesh.removeFromParent()
        this.balls.delete(b)
        continue
      }
      mesh.position.copy(b.p)
      mesh.rotation.x += dt * 12
      mesh.rotation.z += dt * 7
    }
  }

  // ------------------------------------------------------------------ les autres

  /**
   * Le tir d'un autre combattant (annoncé par le relais) : ses projectiles, son bruit. `to`, `dur` :
   * un objet lancé, où il retombe et en combien de temps.
   */
  remoteShot(by: number, team: number, character: CharacterId, origin: [number, number, number], dirs: [number, number, number][], to?: [number, number], dur?: number) {
    const s = this.session
    const w = characterById(character).arm
    if (!s) return
    const from = new THREE.Vector3(...origin)
    this.sfx.shot(w.sound ?? w.id, this.world(from), 0.94 + Math.random() * 0.12)
    if (w.lob) {
      // Il retombe sur le sol du point visé (le haut d'un plan à deux hauteurs, peut-être).
      if (to) this.throwLob(w, from, new THREE.Vector3(to[0], (this.host ? arenaGround(this.host.zone, { x: to[0], z: to[1] }) : 0) + 0.06, to[1]), dur ?? 0.5)
      return
    }
    const color = new THREE.Color(w.color)
    const shot: Shot = { left: dirs.length, scored: true }
    const width = (this.fpsView ? 0.018 : 0.03) * (w.pellets > 1 ? 0.6 : w.blast ? 2.6 : 1)
    for (const d of dirs) {
      const b: Bullet = { p: from.clone(), d: new THREE.Vector3(...d).normalize(), speed: w.speed, pierce: w.pierce, blast: w.blast, shot, color, streak: this.streak(from, color, width), by, team, reach: w.range, heal: !!w.heal }
      s.bullets.push(b)
      this.tag(b, w)
    }
  }

  /**
   * Le relais confirme une touche du joueur : la mire le marque, les dégâts s'affichent sur place.
   * @param at dans le repère de l'arène
   */
  confirm(at: THREE.Vector3, damage: number, kill: boolean) {
    this.hitTime = kill ? 0.3 : 0.16
    this.pop(kill ? `−${damage} ✕` : `−${damage}`, at, kill)
    this.sfx.hit(this.world(at), kill, 0.92 + Math.random() * 0.16)
  }

  /** Betty soigne : ce qu'elle rend s'affiche sur le soigné, et ça tinte (repère de l'arène). */
  healed(at: THREE.Vector3, amount: number) {
    this.pop(`+${amount}`, at, false, 'heal')
    this.burst(at, HEAL, 0.5)
    this.sfx.heal(this.world(at))
  }

  /** Une fleur carnivore mord (repère de l'arène). */
  chomp(at: THREE.Vector3) {
    this.sfx.chomp(this.world(at))
  }

  /** Un combattant est éliminé : il disparaît dans un éclat, là où il est tombé (repère de l'arène). */
  poof(at: THREE.Vector3, color: string) {
    if (!this.session) return
    const tint = new THREE.Color(color)
    this.burst(at, tint, 1.5)
    this.burst(at, new THREE.Color('#ffffff'), 0.7)
    for (let i = 0; i < 12; i++) {
      const mesh = new THREE.Mesh(this.spark, new THREE.MeshBasicMaterial({ color: tint }))
      mesh.position.copy(at)
      mesh.scale.setScalar(2.2)
      this.live.add(mesh)
      this.debris.push({ mesh, v: new THREE.Vector3((Math.random() - 0.5) * 3.4, 1 + Math.random() * 2.6, (Math.random() - 0.5) * 3.4), spin: new THREE.Vector3(), age: 0, life: 0.35 + Math.random() * 0.35, heavy: false })
    }
  }

  /** Le joueur est touché : ce que ça lui coûte s'affiche sur lui (`at`, repère de l'arène). */
  took(at: THREE.Vector3, damage: number) {
    this.pop(`−${damage}`, at, false)
  }

  /** Le joueur est touché : la vue tremble. */
  jar(strength: number) {
    this.shake = Math.max(this.shake, strength)
  }

  /** Bruitages de la partie : touché, éliminé, décompte du coup d'envoi (`left` secondes), coup d'envoi ou victoire. */
  cue(kind: 'hurt' | 'down' | 'tick' | 'go', left = 0) {
    if (kind === 'hurt') this.sfx.wall(null, 0.6)
    else if (kind === 'down') this.sfx.end()
    else if (kind === 'tick') this.sfx.tick(left)
    else this.sfx.tier()
  }

  /** Annonce en haut de l'écran (coup d'envoi, élimination). */
  announce(text: string, warn = false) {
    this.banner(text, warn)
  }

  /**
   * L'arme d'un autre combattant, dans ses mains : à `at` (repère de l'arène), tournée vers `yaw`.
   * `at` null : il ne la tient pas (éliminé, hors de vue).
   */
  carry(id: number, character: CharacterId, at: THREE.Vector3 | null, yaw: number) {
    let it = this.carried.get(id)
    if (it && it.character !== character) {
      this.disarm(id)
      it = undefined
    }
    if (!it) this.carried.set(id, (it = { gun: this.makeGun(characterById(character).arm, 0.4), character }))
    it.gun.root.visible = !!at
    if (!at) return
    it.gun.root.position.copy(at)
    it.gun.root.rotation.set(0, yaw, 0, 'YXZ')
  }

  disarm(id: number) {
    const it = this.carried.get(id)
    if (!it) return
    it.gun.root.removeFromParent()
    this.carried.delete(id)
  }
}
