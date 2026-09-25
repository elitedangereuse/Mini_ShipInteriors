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

  constructor(private host: SeatingHost) {}

  get pose(): PoseId | null {
    return this.current?.spot.pose ?? null
  }

  /** Hauteur de la place au-dessus du pont. */
  get height(): number {
    return this.current?.spot.y ?? 0
  }

  /** Installé, pose tenue, trajet fini. */
  get settled(): boolean {
    return this.current !== null && !this.host.player.gliding
  }

  /** Une place est-elle déjà prise par un autre joueur ? */
  occupied(spot: SeatSpot): boolean {
    const y = this.host.deck().y + spot.y
    for (const r of this.host.visible()) {
      if (!r.pose) continue
      if (Math.hypot(r.target.x - spot.x, r.target.z - spot.z) < 0.25 && Math.abs(r.target.y - y) < 0.2) return true
    }
    return false
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
      if (this.host.walk(exit, () => ticket === this.pending && this.settle(item, spot, exit))) return 'ok'
    }
    return 'blocked'
  }

  /**
   * L'aménagement des quartiers a changé sous nos pieds : on retrouve sa place parmi les
   * nouveaux meubles (même position), sinon on se relève sur-le-champ.
   */
  relink(interactables: Interactable[]) {
    const seat = this.current
    if (!seat || interactables.includes(seat.item)) return
    const s = seat.spot
    for (const it of interactables) {
      if (!it.seats) continue
      if (it.seats(seat.exit).some((o) => o.pose === s.pose && Math.hypot(o.x - s.x, o.z - s.z) < 0.02 && Math.abs(o.y - s.y) < 0.02)) {
        seat.item = it
        return
      }
    }
    this.leave()
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

  private settle(item: Interactable, spot: SeatSpot, exit: { x: number; z: number }) {
    // Quelqu'un a pu s'y installer pendant qu'on marchait.
    if (this.occupied(spot)) return this.host.taken()
    const player = this.host.player
    const seat: Seated = { item, spot, exit }
    this.current = seat
    player.avatar.setPose(spot.pose)
    const d = Math.hypot(spot.x - player.position.x, spot.z - player.position.z)
    player.glideTo({ x: spot.x, y: this.host.deck().y + spot.y, z: spot.z, yaw: spot.yaw }, 0.35 + d * 0.4, false, () => {
      if (this.current === seat) this.host.settled(seat)
    })
    this.host.changed()
  }

  /** Se relève en douceur, vers l'abord de la place, puis `then`. */
  stand(then?: () => void) {
    this.pending++
    const seat = this.current
    if (!seat) return then?.()
    this.current = null
    const player = this.host.player
    player.avatar.setPose(null)
    player.glideTo({ x: seat.exit.x, y: this.host.deck().y, z: seat.exit.z, yaw: player.heading }, 0.3, false, () => then?.())
    this.host.changed()
  }

  /** Quitte la place sur-le-champ (téléportation, changement de pont, meuble retiré). */
  leave() {
    this.pending++
    if (!this.current) return
    const { exit } = this.current
    this.current = null
    const player = this.host.player
    player.stopGlide()
    player.avatar.setPose(null)
    player.position.set(exit.x, this.host.deck().y, exit.z)
    this.host.changed()
  }

  /** Aller en ligne droite jusqu'à l'abord, sans rien heurter ? */
  static straight(from: { x: number; z: number }, to: { x: number; z: number }, deck: Deck): boolean {
    return clearPath(from, to, CLEARANCE - 0.02, deck.colliders)
  }
}
