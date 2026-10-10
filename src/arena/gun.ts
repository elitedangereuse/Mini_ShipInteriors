import * as THREE from 'three'
import type { Wallet } from '../economy/wallet'
import { tr } from '../i18n'
import { RangeGame, type Bullet, type Gun, type Hit, type RangeFrame, type Shot } from '../range'
import type { RangeMusic } from '../range-music'
import type { RangeSfx } from '../range-sfx'
import { weaponById, WEAPONS, type Weapon, type WeaponId } from '../range-weapons'
import type { Dialog } from '../ui'
import { castArena, type ArenaZone } from '../../shared/arena.js'

/*
 * Le moteur du stand de tir (cf. src/range.ts), dans l'arène : même arme en main, même visée, même
 * recul, mêmes balles et mêmes hologrammes. Ce qui change :
 * - une balle s'arrête sur les cloisons et les conteneurs de l'arène, ou sur un combattant d'en
 *   face (cf. castArena, le même calcul que le relais) ; elle traverse ses coéquipiers ;
 * - c'est le relais qui compte les dégâts : ici, la balle n'est qu'un trait de lumière. Chaque tir
 *   lui est envoyé (d'où il part, une direction par balle), et il renvoie ceux des autres, qu'on
 *   dessine de la même façon ;
 * - pas de cibles, de score ni de chrono : la partie dure tant que le relais ne l'a pas finie ;
 * - les autres combattants tiennent leur arme : un modèle par combattant, posé dans ses mains.
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
  /** Échap : quitter la partie ? */
  quit(): void
}

const _v = new THREE.Vector3()

export class ArenaGun extends RangeGame {
  host: ArenaGunHost | null = null
  /** L'arme des autres combattants, par combattant. */
  private readonly carried = new Map<number, { gun: Gun; weapon: WeaponId }>()
  private fpsView = false

  /** @param group le pont de l'arène : armes et balles y vivent, dans son repère */
  constructor(group: THREE.Object3D, dialog: Dialog, wallet: Wallet, sfx: RangeSfx, music: RangeMusic) {
    // Le décor du stand ne lit rien d'ici : l'arène a son propre état.
    super(group, dialog, wallet, sfx, music, { idle: false, state: { live: false, weapon: null, flash: 0, tier: 0, alarm: 0, beat: 0 } })
    this.debrisMinZ = -Infinity
  }

  /** La partie commence, ou l'on revient à sa base : cette arme en main, tous les chargeurs pleins. */
  begin(id: WeaponId) {
    const index = Math.max(0, WEAPONS.findIndex((w) => w.id === id))
    if (!this.session) {
      this.start(index)
      const s = this.session!
      // Ni chrono ni cibles : le relais décide de la fin.
      s.timeLeft = s.second = Infinity
      s.hud.root.classList.add('arena')
    } else this.equip(index)
    this.session!.ammo = WEAPONS.map((w) => w.mag)
    this.session!.hud.root.classList.remove('down')
    this.holstered = false
  }

  /** Éliminé : l'arme disparaît jusqu'au retour à la base. */
  down() {
    this.holstered = true
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
    super.update(dt, f)
  }

  protected override opened() {}
  protected override updateTargets() {}
  protected override blasted() {}
  protected override report() {}

  protected override ready(): boolean {
    return !this.holstered && !!this.host?.canFire()
  }

  protected override hintText(coarse: boolean): string {
    return coarse
      ? tr('Glisser le stick pour viser, lâcher pour tirer · le toucher : tir rapide', 'Drag the stick to aim, release to fire · tap it: quick shot')
      : tr('Clic : tirer · R : recharger · V : vue · Échap : quitter la partie', 'Click: fire · R: reload · V: view · Esc: leave the match')
  }

  protected override fired(eye: THREE.Vector3, dirs: THREE.Vector3[], _w: Weapon) {
    const host = this.host
    if (!host) return
    // Ses propres balles : elles ne le touchent pas, et traversent son équipe.
    for (const b of this.session!.bullets.slice(-dirs.length)) {
      b.by = host.self()
      b.team = host.team()
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
      s.bullets.push({ p: from.clone(), d: new THREE.Vector3(...d).normalize(), speed: w.speed, pierce: w.pierce, blast: w.blast, shot, color, streak: this.streak(from, color, width), by, team })
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
