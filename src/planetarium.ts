import { planetariumShow } from './furniture/planetarium'
import { tr } from './i18n'

/*
 * La séance du planétarium, comme chez Bugenhagen à Cosmo Canyon (Final Fantasy VII, PS1) : on
 * observe au projecteur, ou on s'assoit sur un coussin, et la nuit tombe. Les lumières s'éteignent,
 * le système se soulève, le temps s'emballe, la coupole et les étoiles se mettent à tourner, des
 * étoiles filantes passent (cf. planetariumShow dans src/furniture/planetarium.ts). Bugenhagen
 * s'élève et parle, dans une fenêtre de dialogue à la manière du jeu d'origine.
 * La séance est à soi : les autres joueurs de la pièce ne la voient pas.
 * Debout, elle dure le temps de ce que dit Bugenhagen, et un pas l'arrête ; assis, le ciel
 * continue de tourner tant qu'on reste sur son coussin.
 */

interface Line {
  text: string
}

const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)]

const INTROS = [
  tr('Hou hou houuu ! Éteignons les lumières… Regarde bien : voici le ciel, tel que je le garde en mémoire.', 'Ho ho hooo! Lights out… Look closely: here is the sky, just as I keep it in memory.'),
  tr('Approche… La machine s\'éveille. Ne touche à rien, et lève les yeux. Hou hou !', 'Come closer… The machine is waking. Touch nothing, and look up. Ho ho!'),
  tr('Ah ! Tu veux voir tourner les mondes ? Alors plus un mot : la nuit tombe, les étoiles se lèvent.', 'Ah! You want to watch the worlds turn? Then not a word: night falls, the stars rise.'),
]
const SKIES = [
  tr('Chaque orbite est une promesse tenue. Les planètes reviennent toujours… Les pilotes, moins souvent. Hou hou hou !', 'Every orbit is a promise kept. Planets always come back… Pilots, less often. Ho ho ho!'),
  tr('Vois comme ils filent, quand on presse le temps. Un an en un souffle… Et nous, à peine une étincelle.', 'See how they race when you hurry time along. A year in a breath… And us, barely a spark.'),
  tr('Un soleil, sept orbites, huit mondes. Ce système existe, je te l\'assure. Où ? Hou hou… Cherche.', 'One sun, seven orbits, eight worlds. This system exists, I promise you. Where? Ho ho… Go and look.'),
]
const OUTRO_SEATED = tr('Reste assis tant que tu veux. Le ciel, lui, ne se lasse jamais d\'être regardé.', 'Stay seated as long as you like. The sky never tires of being looked at.')
const OUTRO_STANDING = tr('Voilà… Rallumons. Assieds-toi sur un coussin, si tu veux les regarder plus longtemps.', 'There… Lights back on. Sit on a cushion if you want to watch them longer.')

/** Rapproche `value` de `goal`, d'au plus `step`. */
const approach = (value: number, goal: number, step: number) => (value < goal ? Math.min(goal, value + step) : Math.max(goal, value - step))

export class PlanetariumShow {
  /** La séance est en cours (la nuit est tombée, ou tombe). */
  active = false
  /** Secondes écoulées depuis le début de la séance. */
  age = 0
  private seated = false
  private lines: Line[] = []
  private index = -1
  private typed = 0
  /** Temps avant la phrase suivante : avant la première, puis une fois la phrase lue. */
  private hold = 0
  private el = document.createElement('div')
  private box = document.createElement('div')
  private text = document.createElement('p')
  private more = document.createElement('span')

  /** `enter` et `leave` : la séance commence, finit (la caméra recule sur la pièce, puis revient). */
  constructor(private host: { enter: () => void; leave: () => void }) {
    this.el.className = 'planetarium-show'
    this.box.className = 'planetarium-box'
    this.box.hidden = true
    this.box.setAttribute('role', 'status')
    this.box.setAttribute('aria-live', 'polite')
    const name = document.createElement('strong')
    name.className = 'planetarium-name'
    name.textContent = 'Bugenhagen'
    this.text.className = 'planetarium-text'
    this.more.className = 'planetarium-more'
    this.more.textContent = '▼'
    this.box.append(name, this.text, this.more)
    this.box.onclick = () => this.next()
    this.el.append(this.box)
    document.body.append(this.el)
  }

  /** Niveau de la séance, de 0 (repos) à 1 (nuit tombée) : le fondu des lumières le suit. */
  get level(): number {
    return planetariumShow.level
  }

  /** Bugenhagen parle : E, Espace ou un clic sur sa fenêtre passent à la suite. */
  get talking(): boolean {
    return !this.box.hidden
  }

  /** Lance la séance ; `seated` : depuis un coussin (elle dure tant qu'on y reste). */
  start(seated: boolean) {
    if (this.active) this.stop()
    this.active = true
    this.seated = seated
    this.age = 0
    this.lines = [{ text: pick(INTROS) }, { text: pick(SKIES) }, { text: seated ? OUTRO_SEATED : OUTRO_STANDING }]
    this.index = -1
    // Le temps que la nuit tombe.
    this.hold = 1.6
    this.el.classList.add('on')
    this.host.enter()
  }

  /** Rallume : la séance s'arrête, le ciel retrouve son calme. */
  stop() {
    if (!this.active) return
    this.active = false
    this.box.hidden = true
    this.el.classList.remove('on')
    this.host.leave()
  }

  /** Phrase suivante (ou la phrase en cours d'un coup, si elle s'écrit encore). */
  next() {
    if (!this.active) return
    const line = this.lines[this.index]
    if (line && this.typed < line.text.length) {
      this.typed = line.text.length
      return this.write(line)
    }
    this.index++
    const following = this.lines[this.index]
    if (following) {
      this.typed = 0
      this.box.hidden = false
      return this.write(following)
    }
    // Il a tout dit : assis, on regarde encore ; debout, la lumière revient.
    this.box.hidden = true
    if (!this.seated) this.stop()
  }

  private write(line: Line) {
    const done = this.typed >= line.text.length
    this.text.textContent = line.text.slice(0, Math.floor(this.typed))
    this.more.hidden = !done
    if (done) this.hold = 3.5 + line.text.length * 0.05
  }

  update(dt: number) {
    planetariumShow.level = approach(planetariumShow.level, this.active ? 1 : 0, dt / (this.active ? 1.8 : 1.2))
    if (!this.active) return
    this.age += dt
    const line = this.lines[this.index]
    if (line && this.typed < line.text.length) {
      this.typed = Math.min(line.text.length, this.typed + dt * 42)
      return this.write(line)
    }
    // Personne n'est tenu d'appuyer : la suite vient toute seule.
    if (this.index < this.lines.length && (this.hold -= dt) <= 0) this.next()
  }
}
