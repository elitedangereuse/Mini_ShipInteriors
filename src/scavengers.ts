import type * as THREE from 'three'
import { Avatar } from './avatar'
import type { Deck } from './deck'
import { lookRig, parseLook } from './looks'
import { dampAngle } from './player'

/*
 * Kael, le héros de Scavengers (https://scavengers.elitedangereuse.fr), dans la planque de la cale
 * (cf. levels.ts) : un Mini Character sous l'apparence « Kael » du Holo-Me (sa tête, sa combinaison
 * ardoise, son équipement de récupérateur : cf. looks.ts et looks-scavengers.ts), posé sur son
 * emplacement du plan (`scav-kael`, cf. src/furniture/scavengers.ts), qui porte ses répliques et
 * son volume de clic. Il surveille l'écran d'ARIA, et se tourne vers qui s'approche. Il n'existe
 * que dans l'affichage : chaque client a le sien.
 */

/** Son apparence : celle que les joueurs gagnent en lançant le jeu, telle quelle. */
const KAEL_LOOK = 'suit.male.d.kael'

/** À cette distance, il se tourne vers le joueur. */
const NOTICE = 2.2

export class Kael {
  private yaw = Math.PI
  private time = 0
  private fidgetIn = 6

  private constructor(private readonly avatar: Avatar) {}

  /** Charge Kael et le pose sur son emplacement du pont (la cale) ; null si le plan n'en a pas. */
  static async load(deck: Deck): Promise<Kael | null> {
    const spot = deck.def.props.find((p) => p.model === 'scav-kael')
    if (!spot) return null
    const kael = new Kael(new Avatar(await lookRig(parseLook(KAEL_LOOK))))
    kael.avatar.root.position.set(spot.x, spot.y ?? 0, spot.z)
    kael.avatar.root.rotation.y = kael.yaw
    deck.group.add(kael.avatar.root)
    return kael
  }

  /** @param visitor le joueur, s'il est sur ce pont */
  update(dt: number, visitor: THREE.Vector3 | null) {
    this.time += dt
    const p = this.avatar.root.position
    const near = visitor && Math.hypot(visitor.x - p.x, visitor.z - p.z) < NOTICE
    // Face à l'écran d'ARIA (au nord-ouest de lui), qu'il ne quitte pas longtemps des yeux.
    const goal = near ? Math.atan2(visitor.x - p.x, visitor.z - p.z) : Math.PI + 0.75 + Math.sin(this.time * 0.3) * 0.15
    this.yaw = dampAngle(this.yaw, goal, 4, dt)
    this.avatar.root.rotation.y = this.yaw
    // Seul, il pianote de temps en temps sur une console qu'on ne voit pas.
    if ((this.fidgetIn -= dt) <= 0) {
      this.fidgetIn = 7 + Math.random() * 9
      if (!near) this.avatar.playEmote('interact')
    }
    this.avatar.update(dt)
  }

  dispose() {
    this.avatar.root.removeFromParent()
  }
}
