import * as THREE from 'three'
import type { Wallet } from '../economy/wallet'
import { tr } from '../i18n'
import { RangeGame, type Bullet, type Gun, type Hit, type RangeFrame, type Session, type Shot } from '../range'
import type { RangeMusic } from '../range-music'
import type { RangeSfx } from '../range-sfx'
import { dampAngle } from '../player'
import { weaponById, WEAPONS, type Weapon, type WeaponId } from '../range-weapons'
import type { Dialog } from '../ui'
import { arenaSight, castArena, type ArenaZone } from '../../shared/arena.js'
import { AimSight } from './sight'

/*
 * Le moteur du stand de tir (cf. src/range.ts), dans l'arène : même arme en main, même visée, même
 * recul, mêmes balles et mêmes hologrammes. Ce qui change :
 * - une balle s'arrête sur les cloisons et les conteneurs de l'arène, ou sur un combattant d'en
 *   face (cf. castArena, le même calcul que le relais) ; elle traverse ses coéquipiers ;
 * - c'est le relais qui compte les dégâts : ici, la balle n'est qu'un trait de lumière. Chaque tir
 *   lui est envoyé (d'où il part, une direction par balle), et il renvoie ceux des autres, qu'on
 *   dessine de la même façon ;
 * - pas de cibles, de score ni de chrono : la partie dure tant que le relais ne l'a pas finie ;
 * - vue par-dessus l'épaule, la balle part du personnage vers ce que la mire recouvre (cf. sightline) ;
 * - un chargeur vide se change tout seul (au stand, il faut le demander) : ici, on se bat ;
 * - les autres combattants tiennent leur arme : un modèle par combattant, posé dans ses mains ;
 * - une balle ne vole pas plus loin que la portée de son arme (`range`, cf. shared/weapons.js : le
 *   relais compte de même), et vu de dessus, un cône peint au sol la montre (cf. sight.ts), à la
 *   place du laser du stand ;
 * - au stick tactile, comme dans Brawl Stars : on le glisse, le cône paraît, on le lâche, le coup
 *   part (une rafale, pour une arme automatique) ; un simple toucher tire sur l'adversaire le plus
 *   proche ; et tant qu'on ne vise pas, le personnage regarde où il court.
 */

/** Combattant debout, dans le repère de l'arène : ce qu'une balle peut toucher. */
export interface ArenaBody { id: number; team: number; x: number; z: number }

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
  /** Un tir part : au relais. */
  fire(origin: [number, number, number], dirs: [number, number, number][]): void
  /** Les adversaires debout que le joueur voit (pas ceux qu'un buisson cache) : ceux que vise le tir rapide. */
  foes(): { x: number; z: number }[]
  /** Échap : quitter la partie ? */
  quit(): void
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

export class ArenaGun extends RangeGame {
  host: ArenaGunHost | null = null
  /** L'arme des autres combattants, par combattant. */
  private readonly carried = new Map<number, { gun: Gun; weapon: WeaponId }>()
  private fpsView = false
  /** Depuis quand le chargeur est vide (secondes) : il se change de lui-même après un instant. */
  private emptyFor = 0
  /** Balle de match : une équipe est à un point de la limite (la musique s'emballe). */
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

  /** @param group le pont de l'arène : armes et balles y vivent, dans son repère */
  constructor(group: THREE.Object3D, dialog: Dialog, wallet: Wallet, sfx: RangeSfx, music: RangeMusic) {
    // Le décor du stand ne lit rien d'ici : l'arène a son propre état.
    super(group, dialog, wallet, sfx, music, { idle: false, state: { live: false, weapon: null, flash: 0, tier: 0, alarm: 0, beat: 0 } })
    this.debrisMinZ = -Infinity
    this.live.add(this.cone.root)
  }

  /** La partie commence, ou l'on revient à sa base : cette arme en main, tous les chargeurs pleins. */
  begin(id: WeaponId) {
    const index = Math.max(0, WEAPONS.findIndex((w) => w.id === id))
    if (!this.session) {
      this.start(index)
      const s = this.session!
      // Ni cibles ni score : le relais tient le chrono (cf. sync) et décide de la fin.
      s.timeLeft = s.second = Infinity
      s.hud.root.classList.add('arena')
    } else this.equip(index)
    this.session!.ammo = WEAPONS.map((w) => w.mag)
    this.session!.hud.root.classList.remove('down')
    this.holstered = false
  }

  /**
   * Ce que le relais dit de la partie : le temps qu'il reste (le moteur annonce les dix dernières
   * secondes), si le coup d'envoi est donné, et l'ardeur du moment (0 à 3), que suit la musique.
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
    const s = this.session
    if (!s) return 0
    const w = WEAPONS[s.weapon]
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
    this.sightCone(f)
  }

  /**
   * Vue de dessus : le cône de visée remplace le laser et le couloir du stand. À la souris, il est
   * toujours là ; au doigt, seulement stick de tir poussé.
   */
  private sightCone(f: RangeFrame) {
    const s = this.session, host = this.host
    this.laser.visible = this.laserDot.visible = this.lane.visible = false
    const shown = !!s && !!host && !f.fps && !this.holstered && (this.sighting || !this.touch)
    this.cone.root.visible = shown
    if (!shown) return
    const w = WEAPONS[s.weapon]
    const origin = this.group.getWorldPosition(_v)
    _from.set(f.player.x - origin.x, 0, f.player.z - origin.z)
    this.cone.place(host.zone, w, _from, this.aim, w.spread * RAD + this.bloom + this.moving, s.reload <= 0 && s.ammo[s.weapon] > 0 && this.ready())
  }

  /** Dans l'arène, une arme automatique ne tire pas stick poussé : on vise, puis on lâche. */
  override get sprays(): boolean {
    return false
  }

  /** Stick lâché : le coup part ; pour une arme automatique, toute une rafale, là où l'on visait. */
  override loose(_quick = false) {
    const s = this.session
    if (!s) return
    const w = WEAPONS[s.weapon]
    if (!w.auto) return this.tap()
    this.salvo = w.burst ?? 6
    this.held = true
  }

  /** Un doigt relevé ailleurs (le stick de marche) ne coupe pas la rafale en cours. */
  override trigger(on: boolean) {
    if (!on && this.salvo > 0) return
    super.trigger(on)
  }

  /**
   * Tir rapide (toucher le stick de tir) : on se tourne vers l'adversaire visible le plus proche,
   * à portée ou presque, de préférence à découvert ; sans personne, on tire devant soi, là où l'on court.
   */
  override aimNearest(player: { x: number; z: number }) {
    const s = this.session, host = this.host
    if (!s || !host) return
    const reach = WEAPONS[s.weapon].range + QUICK_MARGIN
    let best: { x: number; z: number } | null = null
    let near = Infinity
    for (const foe of host.foes()) {
      const d = Math.hypot(foe.x - player.x, foe.z - player.z)
      if (d > reach) continue
      // Derrière un conteneur, il passe après ceux qu'on peut toucher.
      const rank = d + (arenaSight(host.zone, player, foe) ? 0 : 100)
      if (rank < near) { near = rank; best = foe }
    }
    if (best) this.aimToward(best.x - player.x, best.z - player.z)
    else if (this.stride.lengthSq() > 0.04) this.aimToward(this.stride.x / this.stride.length(), this.stride.z / this.stride.length())
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
      const facing = to.set(foe.x, y, foe.z).sub(eye).normalize().dot(gaze)
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

  /**
   * Vue par-dessus l'épaule (le personnage est à l'image) : la caméra est derrière lui, décalée. La
   * balle ne part pas d'elle : on cherche ce que la mire recouvre, au-delà du personnage, et l'on
   * tire de sa poitrine vers ce point. Dans les yeux, rien à corriger.
   */
  protected override sightline(eye: THREE.Vector3, dir: THREE.Vector3, f: RangeFrame, origin: THREE.Vector3) {
    if (!f.body) return
    const chest = _chest.subVectors(f.player, origin).setY(CHEST)
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
    return coarse
      ? tr('Glisser le stick rouge pour viser, lâcher pour tirer · le toucher : tir sur le plus proche', 'Drag the red stick to aim, release to fire · tap it: shoot the nearest')
      : tr('Clic : tirer · le cône montre la portée · le chargeur se recharge seul (R : avant) · V : vue · Échap : quitter', 'Click: fire · the cone shows your range · the mag reloads itself (R: sooner) · V: view · Esc: leave')
  }

  protected override fired(eye: THREE.Vector3, dirs: THREE.Vector3[], w: Weapon) {
    const host = this.host
    if (!host) return
    this.calm = 0
    if (this.salvo > 0 && --this.salvo <= 0) this.held = false
    // Ses propres balles : elles ne le touchent pas, traversent son équipe, et s'éteignent au bout de la portée de l'arme.
    for (const b of this.session!.bullets.slice(-dirs.length)) {
      b.by = host.self()
      b.team = host.team()
      b.reach = w.range
    }
    host.fire([eye.x, eye.y, eye.z], dirs.map((d) => [d.x, d.y, d.z]))
  }

  protected override cast(p: THREE.Vector3, d: THREE.Vector3, max: number, b?: Bullet): Hit {
    const host = this.host
    if (!host) return { t: max, off: 0 }
    const team = b?.team ?? host.team()
    const bodies = host.bodies()
    const hit = castArena(host.zone, p, d, max, bodies, (id) => !!b?.through?.has(id) || bodies.find((o) => o.id === id)?.team === team)
    if (hit.body !== null) return { t: hit.t, off: 0, body: hit.body }
    if (!hit.normal) return { t: hit.t, off: 0 }
    const normal = new THREE.Vector3(...hit.normal)
    // Le parement d'une cloison est en retrait de 0,15 dans la tuile : l'impact se voit dessus.
    const facing = Math.abs(d.dot(normal))
    const t = hit.wall && facing > 0.05 ? Math.max(0, hit.t - 0.15 / facing) : hit.t
    return { t, off: 0, normal }
  }

  /** Un combattant touché : un éclat de lumière, rien de plus (le relais dira ce qu'il lui en coûte). */
  protected override struck(b: Bullet, body: number) {
    ;(b.through ??= new Set()).add(body)
    this.burst(b.p, b.color, 0.3)
  }

  // ------------------------------------------------------------------ les autres

  /** Le tir d'un autre combattant (annoncé par le relais) : ses balles, son bruit. */
  remoteShot(by: number, team: number, weapon: WeaponId, origin: [number, number, number], dirs: [number, number, number][]) {
    const s = this.session
    const w = weaponById(weapon)
    if (!s || !w) return
    const from = new THREE.Vector3(...origin)
    const color = new THREE.Color(w.color)
    const shot: Shot = { left: dirs.length, scored: true }
    const width = (this.fpsView ? 0.018 : 0.03) * (w.pellets > 1 ? 0.6 : w.blast ? 2.6 : 1)
    for (const d of dirs) {
      s.bullets.push({ p: from.clone(), d: new THREE.Vector3(...d).normalize(), speed: w.speed, pierce: w.pierce, blast: w.blast, shot, color, streak: this.streak(from, color, width), by, team, reach: w.range })
    }
    this.sfx.shot(w.id, this.world(from), 0.94 + Math.random() * 0.12)
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
  carry(id: number, weapon: WeaponId, at: THREE.Vector3 | null, yaw: number) {
    let it = this.carried.get(id)
    if (it && it.weapon !== weapon) {
      this.disarm(id)
      it = undefined
    }
    if (!it) {
      const w = weaponById(weapon)
      if (!w) return
      this.carried.set(id, (it = { gun: this.makeGun(w, 0.4), weapon }))
    }
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

  /** Bouche du canon d'un autre combattant (repère de l'arène), s'il tient son arme. */
  muzzleOf(id: number, out = _v): THREE.Vector3 | null {
    const it = this.carried.get(id)
    if (!it?.gun.root.visible) return null
    it.gun.root.updateWorldMatrix(true, false)
    return this.group.worldToLocal(it.gun.root.localToWorld(out.copy(it.gun.muzzle)))
  }
}
