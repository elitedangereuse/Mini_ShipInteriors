import type * as THREE from 'three'
import { Avatar } from './avatar'
import type { Deck } from './deck'
import { suitRig, type SuitStyle } from './looks'
import { dampAngle } from './player'

/*
 * Kael, le héros de Scavengers (https://scavengers.elitedangereuse.fr), dans la planque de la cale
 * (cf. levels.ts) : un Mini Character dans la combinaison grise de son portrait, posé sur son
 * emplacement du plan (`scav-kael`, cf. src/furniture/scavengers.ts), qui porte ses répliques et
 * son volume de clic. Il surveille l'écran d'ARIA, et se tourne vers qui s'approche. Il n'existe
 * que dans l'affichage : chaque client a le sien.
 */

/** La combinaison de son portrait : gris ardoise, col sombre, un liseré vert phosphore. */
const KAEL_SUIT: SuitStyle = {
  ramp: [[0, '#161b24'], [0.35, '#2d3748'], [0.6, '#4a5568'], [0.85, '#636f80'], [1, '#3ddc6a']],
  glove: '#2d3748',
  helmet: 'none',
  shell: '#2d3748',
  visor: '#000000',
  light: '#00ff41',
}

/** Les cheveux bruns en bataille et l'air fermé de son portrait. */
const KAEL_STYLE = { hair: '', hairColor: 'br', face: 'se', paint: '', trim: '' }

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
    const kael = new Kael(new Avatar(await suitRig('male', 'd', KAEL_SUIT, KAEL_STYLE)))
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
