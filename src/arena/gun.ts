import * as THREE from 'three'
import type { Wallet } from '../economy/wallet'
import { tr } from '../i18n'
import { RangeGame, type Bullet, type Gun, type Hit, type RangeFrame, type Session, type Shot } from '../range'
import type { RangeTune } from '../range-music'
import type { RangeSfx } from '../range-sfx'
import type { Weapon } from '../range-weapons'
import { dampAngle } from '../player'
import type { Dialog } from '../ui'
import { RELEASE, type CombatAct } from '../avatar'
import { ARENA_RULES, arenaGround, arenaSight, assistAim, castArena, inArenaBase, lobTarget, lobTime, shotOrigin, type ArenaZone, type CharacterId } from '../../shared/arena.js'
import { ARMS, characterById, type ArenaArm } from './characters'
import { CombatFx } from './fx'
import { color as paint, HEAL as HEAL_TINT } from './palette'
import { arenaFx } from './settings'
import { AimSight, type SightState } from './sight'

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

/**
 * Combattant debout, dans le repère de l'arène : ce qu'un projectile peut toucher (`hurt` : blessé,
 * Betty peut le soigner ; `shield` : protégé, il revient tout juste en jeu, rien ne l'atteint).
 */
export interface ArenaBody { id: number; team: number; x: number; z: number; hurt?: boolean; shield?: boolean }

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
  /**
   * Un tir part : au relais (`r` : jusqu'où, pour un objet lancé ; `assisted` : un tir rapide, qui
   * visait tout seul l'adversaire le plus proche, cf. ARENA_RULES.assist : les statistiques le comptent à part).
   */
  fire(origin: [number, number, number], dirs: [number, number, number][], r?: number, assisted?: boolean): void
  /** Les adversaires debout que le joueur voit (pas ceux qu'un buisson cache) : ceux que vise le tir rapide. */
  foes(): { x: number; z: number }[]
  /** Échap : quitter la partie ? */
  quit(): void
  /** La couleur d'un combattant pour le joueur (lui, les siens, ceux d'en face ; cf. palette.ts). */
  tint(id: number): string
  /** Le personnage du joueur fait un geste : le recul d'un tir, un lancer, un rechargement (de `len` secondes). */
  gesture(kind: CombatAct, len?: number, strength?: number): void
  /** Le joueur change de chargeur : les autres le voient faire. */
  reloading(): void
}

/**
 * Un objet lancé en vol : il suit sa cloche, de sa main au point visé. Au sol, là où il retombera,
 * un cercle à la couleur du lanceur (pour le joueur) se remplit à mesure qu'il approche : chacun voit
 * où il tombe, et quand.
 */
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
  /** Le cercle du point de chute, et son disque qui se remplit. */
  mark: THREE.Group
  fill: THREE.Object3D
  /** Le cocktail : le liquide qui clapote, et ce qui en déborde. */
  brew: THREE.Object3D | null
  drip: number
  /**
   * L'objet ne quitte la main qu'au milieu du geste du lanceur (cf. RELEASE) : il part alors de là où
   * est sa main (`start`), et vole le temps qui reste, pour retomber à l'instant que dit le relais.
   */
  delay: number
  start: (() => THREE.Vector3) | null
}

const _v = new THREE.Vector3()
const _chest = new THREE.Vector3()
const _from = new THREE.Vector3()
const _axis = new THREE.Vector3()
const _hand = new THREE.Vector3()
const _landed = new THREE.Vector3()
const _z = new THREE.Vector3(0, 0, 1)
/** Hauteur d'où part la balle, vue par-dessus l'épaule : la poitrine du personnage. */
const CHEST = 0.42
/** Délai entre le dernier tir d'un chargeur et son rechargement automatique (secondes). */
const AUTO_RELOAD = 0.18
const RAD = Math.PI / 180
/** Au doigt : délai après un tir avant que le personnage ne se retourne vers où il court (secondes). */
const FACE_AFTER = 0.45
/** Tir rapide : un adversaire un peu au-delà de la portée est visé quand même (il approche). */
const QUICK_MARGIN = 1
/**
 * Au stick, jusqu'où l'on lance : en proportion de l'inclinaison, de THROW_NEAR (le stick passe tout
 * juste STICK_SLACK, le seuil où l'on vise) à la portée de l'arme (poussé au bord).
 */
const THROW_NEAR = 0.6
const STICK_SLACK = 0.3
/** La hauteur de la cloche d'un objet lancé qui va à `far` tuiles (le cône dessine la même). */
export const lobPeak = (far: number) => 0.45 + far * 0.14
const SHADOW = new THREE.CircleGeometry(0.06, 14).rotateX(-Math.PI / 2)
const BALL = new THREE.SphereGeometry(0.04, 8, 6)
const SHADOW_MAT = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.35, depthWrite: false })
const PULP = new THREE.Color('#ff3a1e'), DIRT = new THREE.Color('#7a5230'), GLASS = new THREE.Color('#dff4ff'), HEAL = new THREE.Color(HEAL_TINT)
/** La poussière d'une balle dans le sol, les éclats d'un obstacle, le blanc d'un cœur vif. */
const DUST = new THREE.Color('#cdb88e'), CHIP = new THREE.Color('#8a919c'), WHITE = new THREE.Color('#ffffff')
const _c = new THREE.Color()
const rand = (a: number) => (Math.random() * 2 - 1) * a
/**
 * Largeur de la traînée de chaque arme, vue de dessus (tuiles) : la mitraillette, un trait fin ; le
 * laser de Nico, un trait long et vif ; la tomate, une traînée de jus. Dans les yeux, LOOK_THIN de moins.
 */
const TRAIL: Record<CharacterId, number> = { rourke: 0.075, marcel: 0.11, nico: 0.1, betty: 0.07, capucine: 0.06, jacques: 0.06 }
const LOOK_THIN = 0.42
/** Après un lancer, la main reste vide ce temps (s), avant de reprendre un objet. */
const THROWN_EMPTY = 0.3
/** En deçà de cette vitesse (tuiles par seconde), un projectile a son ombre au sol : on lit sa hauteur, sa course. */
const SLOW = 30
/** Le cercle du point de chute d'un objet lancé, et son disque qui se remplit. */
const LANDING_RING = new THREE.RingGeometry(0.94, 1, 40).rotateX(-Math.PI / 2)
const LANDING_FILL = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2)
const landing = new Map<string, { ring: THREE.MeshBasicMaterial; fill: THREE.MeshBasicMaterial }>()
function landingPaint(tint: string) {
  let p = landing.get(tint)
  if (!p) {
    const base = { color: tint, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 }
    landing.set(tint, (p = { ring: new THREE.MeshBasicMaterial({ ...base, opacity: 0.9 }), fill: new THREE.MeshBasicMaterial({ ...base, opacity: 0.2 }) }))
  }
  return p
}

export class ArenaGun extends RangeGame {
  host: ArenaGunHost | null = null
  /**
   * L'arme des autres combattants, par combattant : son recul (`kick`, de 1 à 0), son rechargement
   * (`reload` : ce qu'il en reste, sur `reloadLen` secondes), et depuis quand il a lancé son objet
   * (`thrown` : il n'a plus rien en main, le temps d'en prendre un autre).
   */
  private readonly carried = new Map<number, { gun: Gun; character: CharacterId; kick: number; reload: number; reloadLen: number; thrown: number }>()
  /** Depuis quand le joueur a lancé son objet (s) : sa main est vide un instant. */
  private thrownFor = Infinity
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
  /**
   * Jusqu'à quand (ms, horloge de la page) un tir qui part est un tir rapide (un toucher du stick,
   * sans viser : il visait tout seul) : le temps qu'il parte, sa rafale comprise. Une borne plutôt
   * qu'un drapeau : un tir rapide qui ne part pas (chargeur vide) ne déteint pas sur le suivant.
   */
  private assistUntil = 0
  /** Depuis quand on n'a pas tiré (secondes), et où l'on marchait à la dernière image. */
  private calm = 0
  private readonly stride = new THREE.Vector3()
  /** Au stick, jusqu'où lancer (tuiles ; null : aux trois quarts de la portée). */
  private throwAt: number | null = null
  /**
   * Betty : le coéquipier blessé que sa seringue soignera si elle tire maintenant (`healTarget`), et
   * celui, au maximum de sa vie, qu'elle traverserait (`fullTarget`) ; null s'il n'y en a pas.
   */
  healTarget: number | null = null
  fullTarget: number | null = null
  /** Traînées aux couleurs exactes de la palette, sur leur ombre (cf. RangeGame.flatTrails). */
  protected override flatTrails = true
  /** Les objets lancés en vol, et les modèles (tomates, seringues) qui suivent leur projectile, avec leur ombre. */
  private lobs: Lob[] = []
  private readonly balls = new Map<Bullet, { mesh: THREE.Object3D; shadow: THREE.Mesh | null; drip: number }>()
  /** L'arme de chaque projectile en vol (pour l'éclat d'une tomate), et la couleur de son tireur pour le joueur. */
  private readonly armOfBullet = new WeakMap<Bullet, ArenaArm>()
  private readonly tintOf = new WeakMap<Bullet, THREE.Color>()
  /** Les effets de combat (poussière, étoiles, ondes, liens…), dans l'arène. */
  readonly fx = new CombatFx()

  /** @param group le pont de l'arène : armes et balles y vivent, dans son repère */
  constructor(group: THREE.Object3D, dialog: Dialog, wallet: Wallet, sfx: RangeSfx, music: RangeTune) {
    // Le décor du stand ne lit rien d'ici : l'arène a son propre état.
    super(group, dialog, wallet, sfx, music, { idle: false, state: { live: false, weapon: null, flash: 0, tier: 0, alarm: 0, beat: 0 }, arsenal: ARMS })
    this.debrisMinZ = -Infinity
    this.live.add(this.cone.root)
    group.add(this.fx.group)
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
    group.add(this.live, this.idle, this.fx.group)
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
    for (const l of this.lobs) l.mesh.removeFromParent(), l.shadow.removeFromParent(), l.mark.removeFromParent()
    this.lobs = []
    for (const it of this.balls.values()) it.mesh.removeFromParent(), it.shadow?.removeFromParent()
    this.balls.clear()
    this.fx.clear()
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
    // Un clic pendant le rechargement, en fantôme à sa base ou avant le coup d'envoi ne se met pas
    // en attente : rien ne part tout seul une fois l'arme prête.
    if (this.reloading || !this.ready()) this.queued = false
    // Au doigt, tant qu'on ne vise pas : le personnage regarde où il court, comme dans Brawl Stars.
    // Pas quand un coup attend de partir (le stick vient d'être lâché) : il part là où l'on visait.
    if (this.touch && !f.fps && !this.sighting && !this.queued && !this.held && this.salvo <= 0 && this.calm > FACE_AFTER && this.stride.lengthSq() > 0.04) {
      this.pointer = null
      const yaw = dampAngle(Math.atan2(this.aim.x, this.aim.z), Math.atan2(this.stride.x, this.stride.z), 14, dt)
      this.aim.set(Math.sin(yaw), 0, Math.cos(yaw))
    }
    // Les traînées ont leur ombre, sauf effets réduits ; plus légère dans les yeux, où elles partent de tout près.
    this.shaded = !arenaFx.reduced
    this.shadeOpacity = f.fps ? 0.2 : 0.5
    this.trailOpacity = f.fps ? 0.75 : 0.95
    super.update(dt, f)
    // Chargeur vide : le temps que le dernier tir parte, et l'on recharge sans attendre l'ordre.
    this.emptyFor = this.empty && !this.holstered ? this.emptyFor + dt : 0
    if (this.emptyFor > AUTO_RELOAD) this.reload()
    this.updateLobs(dt)
    this.updateBalls(dt)
    this.fx.update(dt, f.camera)
    this.sightCone(f)
    // L'objet qu'on vient de lancer a quitté la main : elle reste vide un instant.
    this.thrownFor += dt
    if (this.arm?.lob && this.thrownFor < THROWN_EMPTY + RELEASE.lob) for (const g of [...this.hand, ...this.view]) g.root.visible = false
    for (const it of this.carried.values()) {
      it.kick = Math.max(0, it.kick - dt * 7)
      it.reload = Math.max(0, it.reload - dt)
      it.thrown += dt
    }
  }

  /**
   * Jusqu'où l'on lancerait maintenant, de là où part l'objet (repère de l'arène) : sous le curseur,
   * selon le stick, ou, dans les yeux, là où la mire touche le sol (ou l'obstacle visé).
   */
  private throwDistance(f: RangeFrame, from: THREE.Vector3, dir: THREE.Vector3, w: ArenaArm): number {
    let d: number
    if (f.fps) d = Math.hypot(dir.x, dir.z) * this.cast(from, dir, 40).t
    else d = this.pointer ? Math.hypot(this.aimPoint.x - from.x, this.aimPoint.z - from.z) : this.throwAt ?? w.range * 0.75
    return THREE.MathUtils.clamp(d, 0.5, w.range)
  }

  /** Vue de dessus, le tir part d'un peu devant le joueur : de ses pieds, s'il colle à un obstacle (comme le juge le relais). */
  protected override aimFrom(eye: THREE.Vector3, foot: THREE.Vector3) {
    if (!this.host) return
    const o = shotOrigin(this.host.zone, foot, eye)
    eye.x = o.x
    eye.z = o.z
  }

  /** La main qui lance (repère de l'arène) : le bout de l'objet tenu, ou d'où part le tir. */
  private handPoint(out: THREE.Vector3): THREE.Vector3 {
    const s = this.session
    const gun = s ? [...this.hand, ...this.view].find((g) => g.root.visible) : undefined
    if (!gun) return out.copy(this.shotFrom)
    gun.root.updateWorldMatrix(true, false)
    return this.group.worldToLocal(gun.root.localToWorld(out.copy(gun.muzzle)))
  }

  /**
   * Le cône de visée, qui remplace le laser et le couloir du stand : il montre le tir qui partira
   * (cf. sight.ts), du même point et dans la même direction, recul compris. Vue de dessus, à la
   * souris, il est toujours là ; au doigt, seulement stick de tir poussé. Dans les yeux, seule la
   * cloche d'un objet lancé se montre (la mire fait le reste).
   */
  private sightCone(f: RangeFrame) {
    const s = this.session, host = this.host, w = this.arm
    this.laser.visible = this.laserDot.visible = this.lane.visible = false
    this.healTarget = this.fullTarget = null
    const shown = !!s && !!host && !!w && !this.holstered && (f.fps ? !!w.lob : this.sighting || !this.touch)
    this.cone.root.visible = shown
    if (!shown) return
    const zone = host.zone
    const from = this.shotFrom, dir = this.shotDir
    // Sur son sol : le tir part à hauteur d'homme au-dessus (vue de dessus) ; dans les yeux, de l'œil.
    const foot = { x: from.x, y: f.fps ? arenaGround(zone, from) : from.y - ARENA_RULES.aim, z: from.z }
    let state: SightState = s.reload <= 0 && s.ammo[s.weapon] > 0 && this.ready() ? 'ready' : 'blocked'
    const flat = _v.set(dir.x, 0, dir.z)
    if (flat.lengthSq() < 1e-8) flat.copy(this.aim).setY(0)
    flat.normalize()
    if (w.lob) {
      const to = lobTarget(zone, from, flat, this.throwDistance(f, from, dir, w), w.range)
      const hand = this.handPoint(_chest)
      const barren = inArenaBase(zone, 1 - host.team(), to)
      this.cone.place(zone, w, { from: foot, dir: flat, spread: 0, rise: 0, state, fps: f.fps, lob: { hand, to, peak: lobPeak(Math.hypot(to.x - hand.x, to.z - hand.z)), barren } })
      return
    }
    if (w.heal && state === 'ready') state = this.healAim(from, dir, w) ?? state
    this.cone.place(zone, w, { from: foot, dir: flat, spread: w.spread * RAD + this.bloom + this.moving, rise: this.pitch, state })
  }

  /**
   * Betty : la seringue, tirée maintenant, soignerait-elle un coéquipier ? (la même règle que celle
   * du relais : elle traverse ses coéquipiers en pleine forme). Retient aussi celui, au maximum de sa
   * vie, qu'elle traverserait : sa plaque le dit.
   */
  private healAim(from: THREE.Vector3, dir: THREE.Vector3, w: ArenaArm): SightState | null {
    const host = this.host!
    const self = host.self(), team = host.team(), bodies = host.bodies()
    const any = castArena(host.zone, from, dir, w.range, bodies, (id) => id === self)
    const crossed = any.body !== null ? bodies.find((b) => b.id === any.body) : undefined
    if (crossed && crossed.team === team && !crossed.hurt) this.fullTarget = crossed.id
    this.healTarget = this.predictHeal(from, dir, w, self, team)
    return this.healTarget === null ? null : 'heal'
  }

  /**
   * La seringue que `by` (de l'équipe `team`) tire de `from` vers `dir` soignera-t-elle ? Le premier
   * combattant qu'elle rencontrerait, à la règle du relais (elle traverse les coéquipiers en pleine
   * forme) : un coéquipier blessé (son identifiant), ou personne à soigner (null).
   */
  private predictHeal(from: THREE.Vector3, dir: THREE.Vector3, w: ArenaArm, by: number, team: number): number | null {
    const host = this.host
    if (!host || !w.heal) return null
    const bodies = host.bodies()
    const mate = (id: number) => bodies.find((b) => b.id === id)
    const first = castArena(host.zone, from, dir, w.range, bodies, (id) => id === by || (mate(id)?.team === team && !mate(id)?.hurt))
    const target = first.body !== null ? mate(first.body) : undefined
    return target && target.team === team ? target.id : null
  }

  /** Dans l'arène, une arme automatique ne tire pas stick poussé : on vise, puis on lâche. */
  override get sprays(): boolean {
    return false
  }

  /** Stick lâché : le coup part ; pour la mitraillette, toute une rafale, là où l'on visait. */
  override loose(quick = false) {
    const w = this.arm
    if (!w) return
    this.assistUntil = quick ? performance.now() + 400 + (w.auto ? (w.burst ?? 6) * w.interval * 1000 : 0) : 0
    if (!w.auto) return this.tap()
    this.salvo = w.burst ?? 6
    this.held = true
  }

  /** Un doigt relevé ailleurs (le stick de marche) ne coupe pas la rafale en cours. */
  override trigger(on: boolean) {
    if (!on && this.salvo > 0) return
    // La gâchette (souris, manette) : on vise soi-même.
    if (on) this.assistUntil = 0
    super.trigger(on)
  }

  /**
   * Au stick : la direction visée (celle qu'on voit à l'écran), et, pour un objet lancé, jusqu'où :
   * en proportion de son inclinaison, du plus près (le stick passe à peine le seuil où l'on vise) à
   * la portée de l'arme (poussé au bord).
   */
  override aimStick(x: number, y: number, reach: number) {
    super.aimStick(x, y, reach)
    const w = this.arm
    if (!w || reach < STICK_SLACK) return
    const k = THREE.MathUtils.clamp((reach - STICK_SLACK) / (1 - STICK_SLACK), 0, 1)
    this.throwAt = THROW_NEAR + k * (w.range - THROW_NEAR)
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
      // Pas mieux qu'un bon joueur à la souris : le tir rapide s'écarte un peu de sa cible (ARENA_RULES.assist).
      const off = assistAim(Math.atan2(best.x - player.x, best.z - player.z), d)
      // Plus haut ou plus bas que soi (le haut du site gardien) : on vise sa poitrine.
      this.aimToward(Math.sin(off.yaw), Math.cos(off.yaw), (arenaGround(host.zone, best) - arenaGround(host.zone, player)) / Math.max(0.5, d))
      this.throwAt = Math.min(w.range, off.dist)
    } else if (this.stride.lengthSq() > 0.04) {
      this.aimToward(this.stride.x / this.stride.length(), this.stride.z / this.stride.length())
      this.throwAt = null
    }
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
    if (!best) return null
    // Comme vu de dessus, le tir rapide s'écarte un peu de sa cible (ARENA_RULES.assist).
    const off = assistAim(Math.atan2(best.x, best.z), 1)
    const flat = Math.hypot(best.x, best.z)
    return best.set(Math.sin(off.yaw) * flat, best.y, Math.cos(off.yaw) * flat)
  }

  /** Rechargement en cours (pour la plaque du joueur). */
  get reloading(): boolean {
    return (this.session?.reload ?? 0) > 0
  }

  protected override opened() {}
  protected override updateTargets() {}
  protected override blasted() {}
  protected override report() {}

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
        ? tr('Glisser le stick rouge pour viser (plus il est poussé, plus loin on lance), lâcher pour lancer · le toucher : sur le plus proche', 'Drag the red stick to aim (push it further to throw further), release to throw · tap it: at the nearest')
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
    // Il part de `eye` (le relais aussi) : la distance se compte de là, comme pour le cône.
    const dist = this.throwDistance(f, eye, dir, w)
    shown?.root.updateWorldMatrix(true, false)
    const hand = shown ? this.group.worldToLocal(shown.root.localToWorld(shown.muzzle.clone())) : eye.clone()
    const to = lobTarget(host.zone, eye, flat, dist, w.range)
    // Le geste du lanceur : l'objet quitte sa main au milieu, et part de là.
    const kind = w.fire ? 'lob' : 'toss'
    host.gesture(kind)
    this.thrownFor = 0
    this.throwLob(w, hand, new THREE.Vector3(to.x, arenaGround(host.zone, to) + 0.06, to.z), lobTime(w, Math.hypot(to.x - eye.x, to.z - eye.z)), host.tint(host.self()), RELEASE[kind], () => this.handPoint(_hand))
    this.sfx.shot(w.sound ?? w.id, f.fps ? null : this.world(hand), 0.94 + Math.random() * 0.12)
    this.gunVel += 8 * w.punch
    this.flashTime = 0.04
    this.tint.set(w.color)
    host.fire([eye.x, eye.y, eye.z], [[flat.x, 0, flat.z]], dist, performance.now() < this.assistUntil)
    this.assistUntil = 0
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
      this.style(b, arm, host.tint(b.by), this.predictHeal(b.p, b.d, arm, b.by, b.team) !== null)
    }
    host.fire([eye.x, eye.y, eye.z], dirs.map((d) => [d.x, d.y, d.z]), undefined, performance.now() < this.assistUntil)
    // Un tir rapide vaut pour toute sa rafale ; après, on vise de nouveau soi-même.
    if (this.salvo <= 0) this.assistUntil = 0
    // Le recul, dans les bras du personnage : à la mesure de l'arme.
    host.gesture('recoil', undefined, Math.min(1, 0.35 + arm.punch * 0.25))
  }

  /** Le chargeur se change : le personnage le fait (ses bras plongent), et les autres le voient faire. */
  override reload() {
    const s = this.session
    const was = s?.reload ?? 0
    super.reload()
    if (!s || was > 0 || s.reload <= 0) return
    this.host?.gesture('reload', s.reload)
    this.host?.reloading()
  }

  /**
   * Le style d'un projectile qui part. Sa traînée, à la couleur de son tireur pour le joueur (lui,
   * les siens, ceux d'en face ; cf. palette.ts), ou vert d'eau pour une seringue qui soignera : on lit
   * d'où vient le danger. Sa tête et son halo, à la couleur de son arme, et sa forme : un trait fin
   * pour la mitraillette, le long trait vif du laser de Nico, la tomate et sa traînée de jus, la
   * seringue tête en avant.
   */
  private style(b: Bullet, arm: ArenaArm, tint: string, heal: boolean) {
    const st = b.streak
    const trail = paint(heal ? HEAL_TINT : tint)
    // La traînée, en mélange ordinaire sur son ombre (cf. flatTrails) : la couleur exacte de la palette.
    st.trail.copy(trail)
    st.bolt.copy(_c.copy(paint(arm.color)).lerp(WHITE, 0.4))
    st.glow.copy(heal ? trail : paint(arm.color))
    st.width = TRAIL[arm.id] * (this.fpsView ? LOOK_THIN : 1)
    if (arm.pierce) {
      st.life = 0.5
      st.boltLength = 1.5
    }
    this.tintOf.set(b, trail)
    this.tag(b, arm, heal)
  }

  /** Retient l'arme d'un projectile en vol, et lui donne son modèle (la tomate, la seringue) s'il en a un, et son ombre. */
  private tag(b: Bullet, arm: ArenaArm, heal = false) {
    this.armOfBullet.set(b, arm)
    if (!arm.ammo) return
    const mesh = arm.ammo(heal)
    mesh.position.copy(b.p)
    let shadow: THREE.Mesh | null = null
    if (arm.speed < SLOW) {
      shadow = new THREE.Mesh(SHADOW, SHADOW_MAT)
      shadow.scale.setScalar(0.9)
      this.live.add(shadow)
    }
    this.live.add(mesh)
    this.balls.set(b, { mesh, shadow, drip: 0 })
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

  /**
   * Un combattant touché (ce que le client voit ; le relais dira ce qu'il lui en coûte, ou ce qu'il y
   * gagne) : une étoile qui claque, à la couleur du tireur pour le joueur ; pour un soin, une croix
   * vert d'eau.
   */
  protected override struck(b: Bullet, body: number) {
    ;(b.through ??= new Set()).add(body)
    const mate = b.heal && this.host?.bodies().find((o) => o.id === body)?.team === b.team
    if (mate) {
      this.burst(b.p, HEAL, 0.45)
      this.fx.cross(b.p, HEAL, 0.2)
      return
    }
    // Protégé (il revient tout juste en jeu) : la balle sonne sur sa bulle, rien ne passe.
    if (this.host?.bodies().find((o) => o.id === body)?.shield) {
      this.fx.wave(b.p, WHITE, 0.08, 0.32, 0.25, 0.9)
      this.sfx.shield(this.world(b.p))
      return
    }
    const tint = this.tintOf.get(b) ?? b.color
    this.burst(b.p, tint, 0.36)
    this.fx.star(b.p, tint)
  }

  /**
   * Une balle qui frappe le décor. Dans le sol : un nuage de poussière, une marque, un coup mat. Sur
   * un obstacle : les étincelles et la marque du stand, et des éclats de métal qui tombent.
   */
  protected override impact(at: THREE.Vector3, normal: THREE.Vector3, color: THREE.Color, sound = true) {
    if (normal.y > 0.5) {
      super.impact(at, normal, color, false)
      this.fx.puff(at, DUST, 0.2, 3)
      if (sound) this.sfx.ground(this.world(at), 0.9 + Math.random() * 0.25)
      return
    }
    super.impact(at, normal, color, sound)
    const n = arenaFx.count(3)
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(this.spark, new THREE.MeshBasicMaterial({ color: CHIP }))
      mesh.position.copy(at)
      mesh.scale.setScalar(1.6 + Math.random())
      this.live.add(mesh)
      this.debris.push({ mesh, v: new THREE.Vector3(rand(0.8), 0.4 + Math.random() * 0.8, rand(0.8)).addScaledVector(normal, 0.8), spin: new THREE.Vector3(rand(8), rand(8), rand(8)), age: 0, life: 0.6 + Math.random() * 0.3, heavy: true })
    }
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

  /**
   * Un objet part en cloche, de `from` à `to` (repère de l'arène), en `dur` secondes ; `tint` : la
   * couleur du lanceur pour le joueur, celle du cercle de son point de chute.
   */
  private throwLob(arm: ArenaArm, from: THREE.Vector3, to: THREE.Vector3, dur: number, tint: string, delay = 0, start: (() => THREE.Vector3) | null = null) {
    const mesh = arm.ammo?.() ?? new THREE.Mesh(BALL, new THREE.MeshBasicMaterial({ color: arm.color }))
    mesh.position.copy(from)
    // Il ne quitte la main qu'au milieu du geste ; il vole au moins un instant.
    delay = Math.min(delay, Math.max(0, dur - 0.2))
    mesh.visible = delay <= 0
    const shadow = new THREE.Mesh(SHADOW, SHADOW_MAT)
    shadow.position.set(from.x, this.groundAt(from.x, from.z) + 0.02, from.z)
    // Le point de chute : un cercle de la taille de ce qu'il couvrira, qui se remplit jusqu'à l'impact.
    const area = Math.max(arm.blast, arm.flower?.radius ?? 0, arm.fire?.radius ?? 0) + ARENA_RULES.body.r
    const p = landingPaint(tint)
    const mark = new THREE.Group()
    const ring = new THREE.Mesh(LANDING_RING, p.ring)
    const fill = new THREE.Mesh(LANDING_FILL, p.fill)
    ring.renderOrder = fill.renderOrder = 3
    mark.add(ring, fill)
    mark.position.set(to.x, to.y - 0.06 + 0.036, to.z)
    mark.scale.setScalar(area)
    fill.scale.setScalar(0.001)
    this.live.add(mesh, shadow, mark)
    const far = Math.hypot(to.x - from.x, to.z - from.z)
    // Il tourne sur lui-même autour d'un axe couché, en travers de sa course : on le voit basculer, pas trembler.
    const across = new THREE.Vector3(to.z - from.z, 0, from.x - to.x).normalize().multiplyScalar(arm.fire ? 7 : 11)
    const brew = arm.fire ? (mesh.children.find((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).material as THREE.Material).transparent) ?? null) : null
    shadow.visible = mesh.visible
    this.lobs.push({ mesh, shadow, from: from.clone(), to: to.clone(), dur: Math.max(0.05, dur), age: 0, peak: lobPeak(far), arm, spin: across, mark, fill, brew, drip: 0, delay, start })
  }

  private updateLobs(dt: number) {
    this.lobs = this.lobs.filter((l) => {
      l.age += dt
      // Son point de chute se remplit dès le départ ; l'objet, lui, attend de quitter la main.
      l.fill.scale.setScalar(Math.max(0.001, Math.min(1, l.age / l.dur)))
      if (l.age < l.delay) return true
      if (!l.mesh.visible) {
        if (l.start) l.from.copy(l.start())
        l.peak = lobPeak(Math.hypot(l.to.x - l.from.x, l.to.z - l.from.z))
        l.mesh.visible = l.shadow.visible = true
      }
      const u = Math.min(1, (l.age - l.delay) / Math.max(0.05, l.dur - l.delay))
      l.mesh.position.lerpVectors(l.from, l.to, u)
      l.mesh.position.y += l.peak * 4 * u * (1 - u)
      l.mesh.rotateOnWorldAxis(_axis.copy(l.spin).normalize(), l.spin.length() * dt)
      const ground = this.groundAt(l.mesh.position.x, l.mesh.position.z)
      l.shadow.position.set(l.mesh.position.x, ground + 0.02, l.mesh.position.z)
      l.shadow.scale.setScalar(0.6 + u * 0.6)
      // Le cocktail : le liquide clapote, et ce qui déborde tombe en gouttes vertes.
      if (l.brew) l.brew.scale.set(1.4 + Math.sin(l.age * 22) * 0.15, 0.6 + Math.sin(l.age * 31) * 0.12, 1.4 + Math.cos(l.age * 22) * 0.15)
      if (l.arm.fire && (l.drip -= dt) <= 0) {
        l.drip = 0.07
        this.fx.drip(l.mesh.position, l.arm.color, ground)
      }
      // La graine laisse derrière elle un sillage de poussière verte : on suit sa course.
      if (l.arm.flower && !arenaFx.reduced && (l.drip -= dt) <= 0) {
        l.drip = 0.045
        this.fx.puff(l.mesh.position, '#a6ff6a', 0.06, 1)
      }
      if (u < 1) return true
      l.mesh.removeFromParent()
      l.shadow.removeFromParent()
      l.mark.removeFromParent()
      this.landed(l)
      return false
    })
  }

  /**
   * Il retombe : le cocktail éclate (le relais allumera la flaque) dans un souffle de flammes et
   * d'éclats de verre, une onde verte au sol ; la graine s'enfouit dans un nuage de terre (la fleur
   * poussera).
   */
  private landed(l: Lob) {
    const at = l.to
    const ground = at.y - 0.06
    if (l.arm.fire) {
      this.splash(at, new THREE.Color(l.arm.color), l.arm.blast, 10)
      this.splash(at, GLASS, 0.3, 8)
      this.burst(at, new THREE.Color('#ffd23c'), l.arm.blast * 2)
      // La boule de feu : une onde jusqu'au bord de l'éclat, un souffle orange, une fumée qui monte.
      this.fx.wave(_landed.set(at.x, ground, at.z), l.arm.color, 0.2, l.arm.blast + ARENA_RULES.body.r, 0.4)
      this.fx.wave(_landed, '#ffd23c', 0.1, (l.arm.blast + ARENA_RULES.body.r) * 0.8, 0.28, 0.8)
      this.fx.puff(at, '#ffb347', 0.35, 4)
      this.fx.puff(_landed.set(at.x, ground + 0.15, at.z), '#3a3a3a', 0.4, 3)
      this.fx.spill(at, l.arm.color, 10, 1.6, ground)
      this.sfx.shatter(this.world(at))
    } else {
      this.splash(at, DIRT, 0.25, 8)
      this.fx.puff(at, DIRT, 0.25, 4)
      this.sfx.plant(this.world(at))
    }
  }

  /** Les tomates et les seringues suivent leur projectile (la tomate coule), et disparaissent avec lui. */
  private updateBalls(dt: number) {
    const flying = new Set(this.session?.bullets ?? [])
    for (const [b, it] of this.balls) {
      if (!flying.has(b)) {
        it.mesh.removeFromParent()
        it.shadow?.removeFromParent()
        this.balls.delete(b)
        continue
      }
      it.mesh.position.copy(b.p)
      const arm = this.armOfBullet.get(b)
      if (arm?.aligned) it.mesh.quaternion.setFromUnitVectors(_z, b.d)
      else {
        it.mesh.rotation.x += dt * 12
        it.mesh.rotation.z += dt * 7
      }
      const ground = this.groundAt(b.p.x, b.p.z)
      it.shadow?.position.set(b.p.x, ground + 0.02, b.p.z)
      if (arm?.id === 'marcel' && (it.drip -= dt) <= 0) {
        it.drip = 0.05
        this.fx.drip(b.p, PULP, ground)
      }
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
    const tint = this.host?.tint(by) ?? w.color
    this.sfx.shot(w.sound ?? w.id, this.world(from), 0.94 + Math.random() * 0.12)
    if (w.lob) {
      // Il retombe sur le sol du point visé (le haut d'un plan à deux hauteurs, peut-être), après
      // avoir quitté la main du lanceur au milieu de son geste.
      const held = this.carried.get(by)
      if (held) held.thrown = 0
      const start = held ? () => held.gun.root.position.clone() : null
      if (to) {
        const land = new THREE.Vector3(to[0], (this.host ? arenaGround(this.host.zone, { x: to[0], z: to[1] }) : 0) + 0.06, to[1])
        const release = RELEASE[w.fire ? 'lob' : 'toss']
        this.throwLob(w, from, land, dur ?? 0.5, tint, release, start)
        // D'en face : il siffle en retombant, là où il va tomber (sa seconde moitié de course).
        if (this.host && team !== this.host.team()) {
          const fall = Math.max(0.2, ((dur ?? 0.5) - release) / 2)
          window.setTimeout(() => { if (this.session) this.sfx.whistle(this.world(land), fall) }, ((dur ?? 0.5) - fall) * 1000)
        }
      }
      return
    }
    this.kick(by, w)
    const color = new THREE.Color(w.color)
    const shot: Shot = { left: dirs.length, scored: true }
    for (const d of dirs) {
      const b: Bullet = { p: from.clone(), d: new THREE.Vector3(...d).normalize(), speed: w.speed, pierce: w.pierce, blast: w.blast, shot, color, streak: this.streak(from, color, TRAIL[w.id]), by, team, reach: w.range, heal: !!w.heal }
      s.bullets.push(b)
      this.style(b, w, tint, this.predictHeal(b.p, b.d, w, by, team) !== null)
    }
  }

  /**
   * Le relais confirme une touche du joueur : la mire le marque, les dégâts s'affichent sur place.
   * @param at dans le repère de l'arène
   */
  confirm(at: THREE.Vector3, damage: number, kill: boolean) {
    this.hitTime = kill ? 0.3 : 0.16
    this.pop(kill ? `−${damage} ✕` : `−${damage}`, at, kill, 'dmg')
    // La croix de touche, là où l'on a touché (on la voit sans mire, au doigt comme vu de dessus) ;
    // l'élimination a son propre son (cf. slain), la touche le sien.
    this.fx.hitmark(at, kill ? '#ff4733' : WHITE, kill)
    if (!kill) this.sfx.touch(this.world(at), 0.92 + Math.random() * 0.16)
  }

  /** Le joueur élimine celui qui était en `at` (repère de l'arène) : la grande croix, une onde, et le son de l'élimination. */
  slain(at: THREE.Vector3) {
    this.fx.hitmark(at, '#ff4733', true)
    this.fx.wave(_landed.set(at.x, this.groundAt(at.x, at.z), at.z), '#ffffff', 0.2, 0.9, 0.45, 0.8)
    this.sfx.kill()
  }

  /** Betty soigne : ce qu'elle rend s'affiche sur le soigné, et ça tinte (repère de l'arène). */
  healed(at: THREE.Vector3, amount: number) {
    this.pop(`+${amount}`, at, false, 'heal')
    this.burst(at, HEAL, 0.5)
    this.sfx.heal(this.world(at))
  }

  /**
   * Un soin, vu de tous : un trait vert d'eau relie un instant Betty (`from`, sa main) au soigné
   * (`to`, sa poitrine ; le même vecteur s'il bouge), et des croix montent au-dessus de lui.
   */
  mend(from: THREE.Vector3 | null, to: THREE.Vector3) {
    if (from) this.fx.link(from, to, HEAL, 0.5)
    this.fx.wave(_landed.set(to.x, this.groundAt(to.x, to.z), to.z), HEAL, 0.15, 0.55, 0.45, 0.8)
    this.fx.cross(_landed.copy(to).setY(to.y + 0.15), HEAL, 0.24)
    if (!arenaFx.reduced) this.fx.cross(_landed.set(to.x + rand(0.12), to.y + 0.05, to.z + rand(0.12)), HEAL, 0.16)
  }

  /** Le joueur reçoit un soin : trois notes qui montent. */
  soothe() {
    this.sfx.soothe()
  }

  /** Le joueur est touché : un coup sourd (`heavy` : la part de sa vie que le coup emporte). */
  ouch(heavy: number) {
    this.sfx.hurt(THREE.MathUtils.clamp(heavy * 3, 0, 1))
  }

  /** Une fleur carnivore mord (repère de l'arène). */
  chomp(at: THREE.Vector3) {
    this.sfx.chomp(this.world(at))
  }

  /** Les bruits d'un piège : une fleur jaillit, s'arme, fane (repère de l'arène). */
  trapSound(kind: 'sprout' | 'windup' | 'wilt' | 'ignite' | 'crackle', at: THREE.Vector3) {
    if (!this.session) return
    if (kind === 'sprout') this.sfx.sprout(this.world(at))
    else if (kind === 'windup') this.sfx.hiss(this.world(at))
    else if (kind === 'wilt') this.sfx.wilt(this.world(at))
    else if (kind === 'ignite') this.sfx.ignite(this.world(at))
    else this.sfx.burning(this.world(at))
  }

  /**
   * Un combattant est éliminé, là où il se tient (`at`, ses pieds, repère de l'arène) : un éclair
   * blanc, une onde à sa couleur au sol ; il tombe (cf. ArenaClient.fallen), avant de disparaître.
   */
  knockout(at: THREE.Vector3, color: string) {
    if (!this.session) return
    const chest = _landed.copy(at).setY(at.y + 0.35)
    this.burst(chest, WHITE, 1.1)
    this.burst(chest, new THREE.Color(color), 0.8)
    this.fx.wave(at, color, 0.15, 1.1, 0.55, 0.9)
    if (!arenaFx.reduced) this.fx.wave(at, WHITE, 0.1, 0.7, 0.35, 0.6)
  }

  /**
   * Un combattant (re)vient en jeu, là où il se tient (`at`, ses pieds, repère de l'arène) : un
   * faisceau monte du sol à sa couleur, une onde s'en va, et on l'entend arriver.
   */
  spawned(at: THREE.Vector3, color: string) {
    if (!this.session) return
    this.fx.beam(at, color, 0.3, 1.5, 0.55)
    this.fx.wave(at, color, 0.1, 0.75, 0.5, 0.9)
    this.sfx.spawn(this.world(at))
  }

  /** La bulle de protection d'un combattant crève (repère de l'arène). */
  unshielded(at: THREE.Vector3) {
    if (!this.session) return
    this.fx.wave(at, WHITE, 0.25, 0.7, 0.3, 0.7)
  }

  /** Un combattant est éliminé : il disparaît dans un éclat, là où il est tombé (repère de l'arène). */
  poof(at: THREE.Vector3, color: string) {
    if (!this.session) return
    const tint = new THREE.Color(color)
    this.burst(at, tint, 1.5)
    this.burst(at, new THREE.Color('#ffffff'), 0.7)
    for (let i = 0; i < arenaFx.count(12); i++) {
      const mesh = new THREE.Mesh(this.spark, new THREE.MeshBasicMaterial({ color: tint }))
      mesh.position.copy(at)
      mesh.scale.setScalar(2.2)
      this.live.add(mesh)
      this.debris.push({ mesh, v: new THREE.Vector3((Math.random() - 0.5) * 3.4, 1 + Math.random() * 2.6, (Math.random() - 0.5) * 3.4), spin: new THREE.Vector3(), age: 0, life: 0.35 + Math.random() * 0.35, heavy: false })
    }
  }

  /** Le joueur est touché : ce que ça lui coûte s'affiche sur lui (`at`, repère de l'arène). */
  took(at: THREE.Vector3, damage: number) {
    this.pop(`−${damage}`, at, false, 'hurt')
  }

  /** Le joueur est touché : la vue tremble. */
  jar(strength: number) {
    this.shake = Math.max(this.shake, strength)
  }

  /** Bruitages de la partie : touché, éliminé, décompte du coup d'envoi (`left` secondes), coup d'envoi ou victoire. */
  /**
   * Les sons de la partie : coup reçu, chute, décompte (`left` : secondes), coup d'envoi ; une série
   * (`left` : sa longueur) ; une balle de manche ou de match (`left` : 1 pour les siens, 2 de plus
   * pour une balle de match) ; le verdict (`left` : 1 victoire, -1 défaite, 0 égalité).
   */
  cue(kind: 'hurt' | 'down' | 'tick' | 'go' | 'streak' | 'point' | 'verdict', left = 0) {
    if (kind === 'hurt') this.sfx.hurt(0.4)
    else if (kind === 'down') this.sfx.down()
    else if (kind === 'tick') this.sfx.tick(left)
    else if (kind === 'streak') this.sfx.streak(left)
    else if (kind === 'point') this.sfx.alarm((left & 1) === 1, (left & 2) === 2)
    else if (kind === 'verdict') this.sfx.verdict(left > 0 ? 'won' : left < 0 ? 'lost' : 'draw')
    else this.sfx.tier()
  }

  /**
   * Annonce en haut de l'écran : `kind` lui donne son allure (une élimination, une série en or, une
   * balle de manche ou de match qui bat, une manche jouée, le coup d'envoi).
   */
  announce(text: string, warn = false, kind: '' | 'kill' | 'streak' | 'point' | 'match' | 'round' | 'start' = '') {
    this.banner(text, warn)
    const banner = this.session?.hud.banner
    if (!banner) return
    for (const k of ['kill', 'streak', 'point', 'match', 'round', 'start']) banner.classList.toggle(k, k === kind)
    // Elle se relance à chaque annonce (son animation).
    banner.classList.remove('again')
    void banner.offsetWidth
    banner.classList.add('again')
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
    const arm = characterById(character).arm
    if (!it) this.carried.set(id, (it = { gun: this.makeGun(arm, 0.4), character, kick: 0, reload: 0, reloadLen: 1, thrown: Infinity }))
    // Un objet lancé a quitté sa main : elle reste vide un instant.
    it.gun.root.visible = !!at && !(arm.lob && it.thrown < THROWN_EMPTY + RELEASE.lob)
    if (!at) return
    // Le recul le repousse et le relève ; le rechargement le fait basculer sur le flanc, comme le nôtre.
    const k = it.kick * it.kick
    const loading = it.reload > 0 ? Math.sin(Math.min(1, (1 - it.reload / it.reloadLen) * 1.15) * Math.PI) : 0
    it.gun.root.position.set(at.x - Math.sin(yaw) * k * 0.06, at.y + k * 0.015 - loading * 0.04, at.z - Math.cos(yaw) * k * 0.06)
    it.gun.root.rotation.set(-k * 0.45 + loading * 0.75, yaw + loading * 0.45, loading * 1.1, 'YXZ')
  }

  /** Un autre combattant tire : son arme recule, et la bouche de son canon s'illumine. */
  private kick(id: number, arm: ArenaArm) {
    const it = this.carried.get(id)
    if (!it) return
    it.kick = Math.min(1, 0.5 + arm.punch * 0.25)
    if (!it.gun.root.visible) return
    it.gun.root.updateWorldMatrix(true, false)
    this.burst(this.group.worldToLocal(it.gun.root.localToWorld(_hand.copy(it.gun.muzzle))), new THREE.Color(arm.color), 0.22 + arm.punch * 0.06)
  }

  /** Un autre combattant change de chargeur : son arme bascule le temps qu'il lui faut (`len` secondes). */
  reloadOf(id: number, len: number) {
    const it = this.carried.get(id)
    if (!it) return
    it.reload = it.reloadLen = len
  }

  disarm(id: number) {
    const it = this.carried.get(id)
    if (!it) return
    it.gun.root.removeFromParent()
    this.carried.delete(id)
  }
}
