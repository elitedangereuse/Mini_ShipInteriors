import { MOVES } from './fight.js'
import { fighterProfile } from './fight-roster.js'

// La pose est déduite du même état en solo et en ligne. Les coups suivent le temps
// de la simulation, et non l'horloge d'un GIF, afin de montrer l'impact au bon moment.
export function fightAnimation(f, counts, time, koTime = 0, contacts = {}) {
  let clip = 'idle', frame = 0
  if (f.hp <= 0) {
    clip = 'death'; frame = Math.floor(Math.max(0, koTime) * 12)
  } else if (f.stun > 0 && !f.guard) {
    clip = 'hit'; frame = Math.floor((0.22 - f.stun) / 0.22 * counts.hit)
  } else if (f.attack) {
    const p = fighterProfile(f.character), move = MOVES[f.attack.move]
    clip = f.attack.move === 'punch' ? 'light' : f.attack.move === 'kick' ? 'heavy' : counts.special ? 'special' : 'heavy'
    const count = counts[clip], contact = contacts[clip] ?? Math.max(1, Math.floor(count * 0.55))
    const windup = move.windup * p.tempo, duration = move.duration * p.tempo
    if (!contact && f.attack.time < windup) return { clip: 'idle', frame: 0 }
    frame = f.attack.time < windup
      ? Math.floor(f.attack.time / windup * contact)
      : contact + Math.floor((f.attack.time - windup) / (duration - windup) * (count - contact))
  } else if (f.y > 0 || f.vy > 0) {
    clip = f.vy > 0 ? 'jump' : 'fall'; frame = Math.min(counts[clip] - 1, Math.floor(Math.abs(f.vy) / 150))
  } else if (f.crouch && counts.crouch) {
    clip = 'crouch'
  } else if (f.guard && counts.guard) {
    clip = 'guard'; frame = Math.floor(time * 8) % counts.guard
  } else if (f.moving && !f.crouch && !f.guard) {
    clip = 'run'; frame = Math.floor(f.walk * 1.8) % counts.run
  } else {
    frame = Math.floor(time * 8) % counts.idle
  }
  return { clip, frame: Math.max(0, Math.min(counts[clip] - 1, frame)) }
}
