import { planetariumShow } from './furniture/planetarium'
import { EN, tr } from './i18n'
import { nearestAdventure, siteHref, type NearestAdventure } from './site'

/*
 * La séance du planétarium, comme chez Bugenhagen à Cosmo Canyon (Final Fantasy VII, PS1) : on
 * observe au projecteur, ou on s'assoit sur un coussin, et la nuit tombe. Les lumières s'éteignent,
 * le système se soulève, le temps s'emballe, la coupole et les étoiles se mettent à tourner, des
 * étoiles filantes passent (cf. planetariumShow dans src/furniture/planetarium.ts). Bugenhagen
 * s'élève et parle, dans une fenêtre de dialogue à la manière du jeu d'origine. Entre deux
 * phrases, il consulte le site : il dit au CMDR quelle aventure l'attend le plus près de sa
 * position dans Elite, allume son étoile sur la coupole et donne le lien de sa page ; à celui qui
 * les a toutes terminées, il le dit aussi (cf. nearestAdventure dans src/site.ts).
 * La séance est à soi : les autres joueurs de la pièce ne la voient pas.
 * Debout, elle dure le temps de ce que dit Bugenhagen, et un pas l'arrête ; assis, le ciel
 * continue de tourner tant qu'on reste sur son coussin.
 */

interface Line {
  text: string
  /** Lien proposé sous la phrase (la page de l'aventure). */
  link?: { href: string; label: string }
  /** Bugenhagen désigne une étoile : elle s'allume sur la coupole. */
  star?: boolean
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

const WAIT = tr('Laisse-moi consulter le ciel… Où donc te caches-tu, dans tout ça ?', 'Let me consult the sky… Now where are you hiding in all this?')

/** Ce que Bugenhagen lit dans le ciel : l'aventure la plus proche du CMDR, ou qu'il n'en reste aucune. */
function oracle(found: NearestAdventure | 'auth' | null): Line {
  if (found === 'auth') {
    return { text: tr('Je ne lis pas ton nom dans les étoiles… Connecte-toi au site, et je te dirai où t\'attend ta prochaine aventure.', 'I can\'t read your name in the stars… Sign in to the site, and I\'ll tell you where your next adventure awaits.') }
  }
  if (!found) {
    return { text: tr('Les étoiles se taisent, ce soir. Reviens me voir plus tard : je te dirai où t\'attend ta prochaine aventure.', 'The stars are silent tonight. Come back later: I\'ll tell you where your next adventure awaits.') }
  }
  if (found.state === 'done' || !found.title || !found.url) {
    return {
      text: tr(
        'Hou hou houuu ! J\'ai beau chercher, il ne reste pas une étoile où tu ne sois allé : tu as terminé toutes les aventures. Ce soir, on regarde le ciel pour le seul plaisir… en attendant que de nouvelles étoiles s\'allument.',
        'Ho ho hooo! Search as I might, there isn\'t a star left you haven\'t visited: you have finished every adventure. Tonight we watch the sky for the sheer pleasure of it… until new stars light up.',
      ),
    }
  }
  const title = EN ? found.title.en : found.title.fr
  const far = (found.distance ?? 0).toLocaleString(EN ? 'en' : 'fr')
  const link = { href: siteHref(found.url), label: tr('Ouvrir l\'aventure', 'Open the adventure') }
  // Où elle commence : son système, quand l'aventure le dit, et à quelle distance.
  const where = found.system
    ? tr(`${found.system}, à ${far} années-lumière`, `${found.system}, ${far} light years away`)
    : tr(`à ${far} années-lumière`, `${far} light years away`)
  if (!found.located) {
    return {
      star: true, link,
      text: tr(
        `Je ne te trouve pas dans le ciel… Frontier garde ta position pour lui, ce soir. Depuis Sol, alors, regarde cette étoile : ${where}. L'aventure « ${title} » t'y attend.`,
        `I can't find you in the sky… Frontier is keeping your position to itself tonight. From Sol, then, look at that star: ${where}. The adventure “${title}” awaits you there.`,
      ),
    }
  }
  if ((found.distance ?? 0) < 1) {
    return {
      star: true, link,
      text: tr(
        `Te voilà : ${found.from}. Hou hou houuu ! Ne cherche pas plus loin : l'aventure « ${title} » commence ici même, sous tes pieds. C'est la plus proche de toi.`,
        `There you are: ${found.from}. Ho ho hooo! Look no further: the adventure “${title}” begins right here, under your feet. It is the closest to you.`,
      ),
    }
  }
  return {
    star: true, link,
    text: tr(
      `Te voilà : ${found.from}. Hou hou ! Regarde cette étoile, là-haut : ${where}. L'aventure « ${title} » t'y attend. C'est la plus proche de toi.`,
      `There you are: ${found.from}. Ho ho! Look at that star, up there: ${where}. The adventure “${title}” awaits you there. It is the closest to you.`,
    ),
  }
}

/** Rapproche `value` de `goal`, d'au plus `step`. */
const approach = (value: number, goal: number, step: number) => (value < goal ? Math.min(goal, value + step) : Math.max(goal, value - step))

export class PlanetariumShow {
  /** La séance est en cours (la nuit est tombée, ou tombe). */
  active = false
  /** Secondes écoulées depuis le début de la séance. */
  age = 0
  private seated = false
  /** Phrases à venir, et celle qui s'affiche. */
  private queue: Line[] = []
  private line: Line | null = null
  /** Le site n'a pas encore répondu ; `waiting` : Bugenhagen en est à l'attendre. */
  private loading = false
  private waiting = false
  /** Numéro de la séance : la réponse d'une séance arrêtée est ignorée. */
  private ticket = 0
  private star = false
  private typed = 0
  /** Temps avant la phrase suivante : avant la première, puis une fois la phrase lue. */
  private hold = 0
  private el = document.createElement('div')
  private box = document.createElement('div')
  private text = document.createElement('p')
  private link = document.createElement('a')
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
    this.link.className = 'planetarium-link'
    this.link.target = '_blank'
    this.link.rel = 'noopener'
    this.link.hidden = true
    // Ouvrir la page ne fait pas passer la phrase.
    this.link.onclick = (e) => e.stopPropagation()
    this.box.append(name, this.text, this.link, this.more)
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
    this.queue = [{ text: pick(INTROS) }, { text: pick(SKIES) }]
    this.line = null
    this.waiting = false
    // Le temps que la nuit tombe.
    this.hold = 1.6
    this.el.classList.add('on')
    this.host.enter()
    void this.consult(++this.ticket)
  }

  /** Demande au site l'aventure la plus proche : sa phrase vient après les premières, puis l'adieu. */
  private async consult(ticket: number) {
    this.loading = true
    const found = await nearestAdventure()
    if (ticket !== this.ticket || !this.active) return
    this.loading = false
    this.queue.push(oracle(found), { text: this.seated ? OUTRO_SEATED : OUTRO_STANDING })
    if (!this.waiting) return
    this.waiting = false
    if (this.line) this.typed = this.line.text.length
    this.next()
  }

  /** Rallume : la séance s'arrête, le ciel retrouve son calme. */
  stop() {
    if (!this.active) return
    this.active = false
    this.ticket++
    this.star = false
    this.box.hidden = true
    this.el.classList.remove('on')
    this.host.leave()
  }

  /** Phrase suivante (ou la phrase en cours d'un coup, si elle s'écrit encore). */
  next() {
    if (!this.active) return
    if (this.line && this.typed < this.line.text.length) {
      this.typed = this.line.text.length
      return this.write(this.line)
    }
    // Le site n'a pas répondu : Bugenhagen cherche encore, il n'y a rien à passer.
    if (this.waiting) return
    let following = this.queue.shift()
    if (!following && this.loading) {
      this.waiting = true
      following = { text: WAIT }
    }
    if (following) {
      this.line = following
      this.typed = 0
      this.star ||= !!following.star
      this.box.hidden = false
      return this.write(following)
    }
    // Il a tout dit : assis, on regarde encore ; debout, la lumière revient.
    this.line = null
    this.box.hidden = true
    if (!this.seated) this.stop()
  }

  private write(line: Line) {
    const done = this.typed >= line.text.length
    this.text.textContent = line.text.slice(0, Math.floor(this.typed))
    this.link.hidden = !done || !line.link
    if (line.link) {
      this.link.href = line.link.href
      this.link.textContent = `${line.link.label} ↗`
    }
    this.more.hidden = !done || this.waiting
    // Une phrase qui porte un lien reste plus longtemps : le temps de le voir.
    if (done) this.hold = 3.5 + line.text.length * 0.05 + (line.link ? 4 : 0)
  }

  update(dt: number) {
    planetariumShow.level = approach(planetariumShow.level, this.active ? 1 : 0, dt / (this.active ? 1.8 : 1.2))
    planetariumShow.star = approach(planetariumShow.star, this.star ? 1 : 0, dt / 0.8)
    if (!this.active) return
    this.age += dt
    if (this.line && this.typed < this.line.text.length) {
      this.typed = Math.min(this.line.text.length, this.typed + dt * 42)
      return this.write(this.line)
    }
    // Personne n'est tenu d'appuyer : la suite vient toute seule (sauf quand il a tout dit, ou
    // qu'il attend le site).
    const more = this.line !== null || this.queue.length > 0
    if (more && !this.waiting && (this.hold -= dt) <= 0) this.next()
  }
}
