import { Avatar } from './avatar'
import type { Deck } from './deck'
import { lookRig, parseLook } from './looks'

/*
 * La salle de classe du pont supérieur (cf. levels.ts) : ses personnages.
 *
 * La professeure Kepler et les élèves sont des personnages du Holo-Me (les mêmes que ceux des
 * joueurs) : chacun est posé sur son emplacement du plan (cf. src/furniture/classroom.ts), qui
 * porte son apparence, son texte et son volume de clic. Les élèves sont assis à leur table ; la
 * professeure, debout derrière son pupitre, montre le tableau de temps en temps, et approuve ou
 * désapprouve les réponses du quiz (cf. src/quiz/).
 */

/** Secondes entre deux gestes de la professeure vers le tableau. */
const GESTURE_EVERY = 9

export class ClassCrowd {
  private teacher: Avatar | null = null
  private readonly students: Avatar[] = []
  private idle = GESTURE_EVERY / 2

  /** Charge les personnages de la classe et les pose sur leurs emplacements du pont. */
  static async load(deck: Deck): Promise<ClassCrowd> {
    const crowd = new ClassCrowd()
    const spots = deck.def.props.filter((p) => p.model === 'class-teacher' || p.model === 'class-student')
    const rigs = await Promise.all(spots.map((p) => lookRig(parseLook(p.label))))
    for (const [i, p] of spots.entries()) {
      const avatar = new Avatar(rigs[i])
      avatar.root.position.set(p.x, p.y ?? 0, p.z)
      avatar.root.rotation.y = ((p.rot ?? 0) * Math.PI) / 2
      deck.group.add(avatar.root)
      if (p.model === 'class-teacher') crowd.teacher = avatar
      else {
        avatar.setPose('sit')
        crowd.students.push(avatar)
      }
    }
    return crowd
  }

  /** La professeure réagit à une réponse du quiz : elle hoche la tête, ou la secoue. */
  react(right: boolean) {
    this.teacher?.playEmote(right ? 'oui' : 'non')
    this.idle = GESTURE_EVERY
  }

  update(dt: number) {
    this.idle -= dt
    if (this.idle <= 0) {
      this.idle = GESTURE_EVERY
      this.teacher?.playEmote('interact')
    }
    this.teacher?.update(dt)
    for (const a of this.students) a.update(dt)
  }
}
