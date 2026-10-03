import type { Deck, Interactable } from './deck'
import { clearPath, overlapsAny } from './physics'
import type { Player } from './player'
import type { RemotePlayer } from './remote'
import type { PoseId, SeatSpot } from './seats'

/*
 * S'installer sur un meuble (cf. seats.ts) : on choisit une place libre, on marche jusqu'à
 * son abord, on s'y installe en douceur (le personnage recule sur l'assise, monte sur le lit),
 * et on se relève vers le même abord. Les autres joueurs voient la pose et sa hauteur.
 */

/** Rayon d'un personnage, un peu élargi : l'abord d'une place ne doit toucher aucun meuble. */
const CLEARANCE = 0.19
/** Pas sur un chemin d'accès (unités par seconde) : on monte des marches, on ne court pas. */
const CLIMB_SPEED = 0.9

export interface Seated {
  item: Interactable
  spot: SeatSpot
  /** Où l'on s'est tenu pour s'installer : on s'y relève. */
  exit: { x: number; z: number }
}

export interface SeatingHost {
  player: Player
  deck: () => Deck
  /** Joueurs distants visibles (même pont, même instance des quartiers). */
  visible: () => Iterable<RemotePlayer>
  /** Numéro du joueur local au relais (le premier arrivé à bord a le plus petit). */
  self: () => number
  /** Marche jusqu'au point (chemin, repère de destination), puis rappelle ; false : aucun chemin. */
  walk: (to: { x: number; z: number }, arrived: () => void) => boolean
  /** Installé (la pose tient, le trajet est fini). */
  settled: (seat: Seated) => void
  /** La place visée a été prise en chemin. */
  taken: () => void
  /** Pose prise ou quittée : à dire aux autres tout de suite. */
  changed: () => void
}

export class Seating {
  /** Place occupée (y compris pendant qu'on s'y installe), ou null. */
  current: Seated | null = null
  private pending = 0
  /**
   * En chemin vers sa place par un chemin d'accès (cf. Seat.via) : l'indice du prochain point, ou
   * -1 une fois arrivé (la pose n'est prise qu'au bout).
   */
  private climb = -1

  constructor(private host: SeatingHost) {}

  get pose(): PoseId | null {
    return this.climb >= 0 ? null : this.current?.spot.pose ?? null
  }

  /** Hauteur de la place au-dessus du pont. */
  get height(): number {
    return this.climb >= 0 ? 0 : this.current?.spot.y ?? 0
  }

  /** Installé, pose tenue, trajet fini. */
  get settled(): boolean {
    return this.current !== null && !this.host.player.gliding
  }

  /**
   * Le joueur distant tient-il la place ? Il annonce sa place dès qu'il commence à s'y
   * installer (cf. sendState dans main.ts).
   */
  private holds(r: RemotePlayer, spot: SeatSpot): boolean {
    return !!r.pose && Math.hypot(r.target.x - spot.x, r.target.z - spot.z) < 0.25 && Math.abs(r.target.y - (this.floor(spot) + spot.y)) < 0.2
  }

  /** Hauteur du sol sous un point du pont (le plancher de la mezzanine, cf. Deck.ground). */
  private floor(p: { x: number; z: number }): number {
    const deck = this.host.deck()
    return deck.y + deck.ground(p.x, p.z)
  }

  /** Une place est-elle déjà prise par un autre joueur ? */
  occupied(spot: SeatSpot): boolean {
    for (const r of this.host.visible()) if (this.holds(r, spot)) return true
    return false
  }

  /**
   * Deux joueurs installés à la même place, chacun l'ayant crue libre (arrivés ensemble, à la
   * latence près) : le dernier arrivé à bord se relève. À appeler à chaque image.
   */
  arbitrate() {
    const seat = this.current
    if (!seat || !this.settled) return
    const me = this.host.self()
    for (const r of this.host.visible()) {
      if (r.id < me && this.holds(r, seat.spot)) {
        this.stand()
        return this.host.taken()
      }
    }
  }

  /**
   * Va s'installer sur le meuble, à la place libre la plus proche de `near` (là où l'on a
   * cliqué), ou du joueur. `full` : toutes les places sont prises ; `blocked` : aucune n'est
   * accessible (un meuble devant).
   */
  take(item: Interactable, near?: { x: number; z: number }): 'ok' | 'full' | 'blocked' {
    if (!item.seats) return 'blocked'
    if (this.current) {
      // Déjà installé ailleurs : on se relève d'abord.
      this.stand(() => this.take(item, near))
      return 'ok'
    }
    const player = this.host.player
    const ref = near ?? player.position
    const spots = item.seats(player.position)
      .filter((s) => !this.occupied(s))
      .sort((a, b) => Math.hypot(a.x - ref.x, a.z - ref.z) - Math.hypot(b.x - ref.x, b.z - ref.z))
    if (!spots.length) return 'full'
    for (const spot of spots) {
      const exit = this.approach(spot)
      if (!exit) continue
      const ticket = ++this.pending
      if (this.host.walk(exit, () => ticket === this.pending && this.settle({ item, spot, exit }))) return 'ok'
    }
    return 'blocked'
  }

  /**
   * L'aménagement des quartiers a changé sous nos pieds : on retrouve sa place parmi les
   * nouveaux meubles (même position), sinon on se relève sur-le-champ. Un meuble resté en
   * place (le siège du pilote, un pont plus bas) garde son occupant.
   */
  relink() {
    const seat = this.current
    if (!seat) return
    const item = this.find(seat)
    if (item) seat.item = item
    else this.leave()
  }

  /** Le meuble d'une place parmi ceux du pont : lui-même, ou celui qui l'a remplacé au même endroit. */
  private find(seat: Seated): Interactable | null {
    const list = this.host.deck().interactables
    if (list.includes(seat.item)) return seat.item
    const s = seat.spot
    for (const it of list) {
      if (it.seats?.(seat.exit).some((o) => o.pose === s.pose && Math.hypot(o.x - s.x, o.z - s.z) < 0.02 && Math.abs(o.y - s.y) < 0.02)) return it
    }
    return null
  }

  /**
   * Abord d'une place, dans sa pièce : devant elle d'abord, puis sur les côtés, puis derrière,
   * et un peu plus loin seulement si aucun côté n'est libre (le moniteur d'un lit médical
   * dépasse sur le côté). Une chaise poussée contre une table s'aborde par le côté, un lit
   * contre un mur par l'autre bord.
   */
  private approach(spot: SeatSpot): { x: number; z: number } | null {
    const deck = this.host.deck()
    const room = deck.map.room(Math.round(spot.x), Math.round(spot.z))
    const dx = spot.from.x - spot.x, dz = spot.from.z - spot.z
    const r = Math.max(0.12, Math.hypot(dx, dz))
    const a0 = Math.atan2(dx, dz)
    for (const far of [0, 0.15, 0.3]) {
      for (const da of [0, Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4, Math.PI]) {
        // Un abord proche (debout devant une borne) ne tourne pas autour du meuble.
        if (da && r < 0.3) break
        const p = { x: spot.x + Math.sin(a0 + da) * (r + far), z: spot.z + Math.cos(a0 + da) * (r + far) }
        // Passé un mur, c'est une autre pièce : l'abord serait de l'autre côté.
        if (room && deck.map.room(Math.round(p.x), Math.round(p.z)) === room && !overlapsAny(p, CLEARANCE, deck.colliders)) return p
      }
    }
    return null
  }

  private settle(target: Seated) {
    // Le meuble a pu disparaître pendant qu'on marchait (retiré par l'hôte, visite finie)...
    const item = this.find(target)
    if (!item) return
    // ... ou quelqu'un s'y installer.
    const { spot, exit } = target
    if (this.occupied(spot)) return this.host.taken()
    const player = this.host.player
    const seat: Seated = { item, spot, exit }
    this.current = seat
    const sitDown = () => {
      this.climb = -1
      player.avatar.setPose(spot.pose)
      const d = Math.hypot(spot.x - player.position.x, spot.z - player.position.z)
      player.glideTo({ x: spot.x, y: this.floor(spot) + spot.y, z: spot.z, yaw: spot.yaw }, 0.35 + d * 0.4, false, () => {
        if (this.current === seat) this.host.settled(seat)
      })
      this.host.changed()
    }
    if (!spot.via?.length) return sitDown()
    // Un chemin d'accès : on le parcourt à pied, point par point (une marche à la fois), puis on s'installe.
    const climb = (i: number) => {
      if (this.current !== seat) return
      if (i >= spot.via!.length) return sitDown()
      this.climb = i
      this.walkLeg(spot.via![i], () => climb(i + 1))
    }
    climb(0)
    this.host.changed()
  }

  /** Un pas du chemin d'accès, à pied, vers le point `to` (repère du pont, y : hauteur au-dessus). */
  private walkLeg(to: { x: number; y: number; z: number }, done: () => void) {
    const player = this.host.player
    const p = player.position
    const y = this.floor(to) + to.y
    const d = Math.hypot(to.x - p.x, y - p.y, to.z - p.z)
    const yaw = d > 1e-3 ? Math.atan2(to.x - p.x, to.z - p.z) : player.heading
    player.glideTo({ x: to.x, y, z: to.z, yaw }, Math.max(0.12, d / CLIMB_SPEED), true, done)
  }

  /** Se relève en douceur, vers l'abord de la place, puis `then`. */
  stand(then?: () => void) {
    this.pending++
    const seat = this.current
    if (!seat) return then?.()
    this.current = null
    const player = this.host.player
    player.avatar.setPose(null)
    const via = seat.spot.via ?? []
    if (!via.length) {
      player.glideTo({ x: seat.exit.x, y: this.floor(seat.exit), z: seat.exit.z, yaw: player.heading }, 0.3, false, () => then?.())
      return this.host.changed()
    }
    // Par le même chemin, à l'envers : depuis le siège (ou depuis la marche où l'on en était), jusqu'à l'abord.
    const reached = this.climb >= 0 ? this.climb - 1 : via.length - 1
    this.climb = -1
    const back = [...via.slice(0, reached + 1).reverse(), { x: seat.exit.x, y: 0, z: seat.exit.z }]
    const ticket = this.pending
    const down = (i: number) => {
      if (ticket !== this.pending) return
      if (i >= back.length) return then?.()
      this.walkLeg(back[i], () => down(i + 1))
    }
    down(0)
    this.host.changed()
  }

  /** Quitte la place sur-le-champ (téléportation, changement de pont, meuble retiré). */
  leave() {
    this.pending++
    if (!this.current) return
    const { exit } = this.current
    this.current = null
    this.climb = -1
    const player = this.host.player
    player.stopGlide()
    player.avatar.setPose(null)
    player.position.set(exit.x, this.floor(exit), exit.z)
    this.host.changed()
  }

  /** Aller en ligne droite jusqu'à l'abord, sans rien heurter ? */
  static straight(from: { x: number; z: number }, to: { x: number; z: number }, deck: Deck): boolean {
    return clearPath(from, to, CLEARANCE - 0.02, deck.colliders)
  }
}
