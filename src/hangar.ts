import * as THREE from 'three'
import type { Deck, Interactable } from './deck'
import { markerMaterial, type WorkSound } from './economy/tasks'
import { kraitPower } from './furniture/hangar'
import { tr } from './i18n'
import type { IconName } from './icons'
import { MECHANIC, type Mechanic } from './mechanic'
import type { Player } from './player'
import { MECH_HELP, MECH_ROOM } from '../shared/mechanic.js'

/*
 * Le hangar de la cale, côté joueur : réviser le Krait avec Nico, et monter au cockpit.
 *
 * Révisions : au pupitre du hangar, on demande une révision ; Nico vient se poster devant le nez
 * du Krait (pour tout le bord, cf. shared/mechanic.js) et donne la fiche de travail. Chaque étape
 * a son poste (étagère à pièces, chariot à outils, propulseur de rechange, soudure, ravitaillement,
 * cales du train, coque du Krait, pupitre), marqué d'un hexagone cyan : on y va, on s'y met
 * quelques secondes (la même jauge que les tâches de bord), Nico commente, et l'étape suivante
 * s'allume. Finie, la révision est payée par le site (prime et plafonds : `hangar` dans
 * economy.json, cf. Wallet.finishJob). Leur nombre est gardé dans ce navigateur.
 *
 * Cockpit : installé aux commandes (l'escabeau, cf. seats.ts), le Krait ne s'estompe pas autour de
 * soi, ses tuyères s'éveillent, et Nico proteste s'il est dans le coin. Espace met les réacteurs
 * en route (quelques secondes au plus, cf. KRAIT_BURN) : ils rugissent, la cale tremble, et Nico
 * panique, pour tout le bord ; se lever les coupe. Espace encore, réacteurs allumés : on décolle
 * vers la base au sol (cf. base/client.ts).
 */

type Station = 'parts' | 'thruster' | 'welder' | 'console' | 'cart' | 'fuel' | 'chock-port' | 'chock-starboard' | 'krait'

/** Meuble de chaque poste (cf. levels.ts), et sa variante s'il y en a deux du même modèle. */
const STATION_MODEL: Record<Station, { model: string; label?: string }> = {
  parts: { model: 'parts-rack' },
  thruster: { model: 'thruster-stand' },
  welder: { model: 'welder' },
  console: { model: 'hangar-console' },
  cart: { model: 'tool-cart' },
  fuel: { model: 'fuel-station' },
  'chock-port': { model: 'gear-chock', label: 'port' },
  'chock-starboard': { model: 'gear-chock', label: 'starboard' },
  krait: { model: 'krait-mk2' },
}

/** Où est le poste, dans la bouche de Nico. */
const WHERE: Record<Station, string> = {
  parts: tr('à l\'étagère à pièces', 'at the parts rack'),
  thruster: tr('au propulseur de rechange', 'at the spare thruster'),
  welder: tr('au poste de soudure', 'at the welding station'),
  console: tr('au pupitre du hangar', 'at the hangar console'),
  cart: tr('au chariot à outils', 'at the tool cart'),
  fuel: tr('à la station de ravitaillement', 'at the fuel station'),
  'chock-port': tr('aux cales bâbord (côté nord)', 'at the port chocks (north side)'),
  'chock-starboard': tr('aux cales tribord (côté sud)', 'at the starboard chocks (south side)'),
  krait: tr('sous l\'aile tribord du Krait', 'under the Krait\'s starboard wing'),
}

interface Step {
  at: Station
  verb: string
  doing: string
  /** Durée du geste (s). */
  secs: number
  sound: WorkSound
  icon: IconName
  /** Ce que dit Nico, l'étape faite. */
  said?: string
}

interface Job {
  name: string
  /** Ce que dit Nico en donnant la fiche. */
  intro: string
  steps: Step[]
}

const step = (at: Station, verb: string, doing: string, secs: number, sound: WorkSound, icon: IconName, said?: string): Step => ({ at, verb, doing, secs, sound, icon, said })

const JOBS: Job[] = [
  {
    name: tr('Révision des propulseurs', 'Thruster service'),
    intro: tr('La tuyère de rechange a besoin d\'un joint neuf. Tu le prends à l\'étagère, tu le montes, tu soudes le carter, et on teste au pupitre.', 'The spare thruster needs a new seal. Grab it from the rack, fit it, weld the casing, and we test it at the console.'),
    steps: [
      step('parts', tr('Prendre un joint de tuyère', 'Get a thruster seal'), tr('Dans l\'étagère…', 'Rummaging…'), 1.6, 'wrench', 'package', tr('Le joint orange. Non, l\'autre orange.', 'The orange seal. No, the other orange one.')),
      step('thruster', tr('Monter le joint sur le propulseur', 'Fit the seal on the thruster'), tr('Serrage…', 'Tightening…'), 3, 'wrench', 'wrench', tr('Au couple ! Pas au feeling !', 'To torque spec! Not by feel!')),
      step('welder', tr('Souder le carter', 'Weld the casing'), tr('Soudure…', 'Welding…'), 3.2, 'sparks', 'flame', tr('Belle soudure. Boulon approuve. Enfin, il n\'a rien dit.', 'Nice weld. Bolt approves. Well, he didn\'t say anything.')),
      step('console', tr('Lancer le test moteur', 'Run the engine test'), tr('Test en cours…', 'Testing…'), 2.4, 'scrub', 'cpu'),
    ],
  },
  {
    name: tr('Plein avant vol', 'Pre-flight refuel'),
    intro: tr('On prépare la Princesse. Manomètre au chariot, tu fais le plein, tu retires les cales des deux côtés, et tu signes le bon de sortie au pupitre.', 'Let\'s get the Princess ready. Pressure gauge from the cart, refuel her, pull the chocks on both sides, and sign the release at the console.'),
    steps: [
      step('cart', tr('Prendre le manomètre', 'Get the pressure gauge'), tr('Au chariot…', 'At the cart…'), 1.6, 'wrench', 'toolbox', tr('Le manomètre, c\'est le truc rond avec une aiguille.', 'The gauge is the round thing with a needle.')),
      step('fuel', tr('Faire le plein du Krait', 'Refuel the Krait'), tr('Remplissage…', 'Filling…'), 3.4, 'hiss', 'drop', tr('Doucement… elle a le réservoir sensible.', 'Easy… she has a sensitive tank.')),
      step('chock-port', tr('Retirer les cales bâbord', 'Pull the port chocks'), tr('Les cales…', 'The chocks…'), 2, 'wrench', 'wrench', tr('Bâbord, c\'est à gauche. À SA gauche.', 'Port is left. HER left.')),
      step('chock-starboard', tr('Retirer les cales tribord', 'Pull the starboard chocks'), tr('Les cales…', 'The chocks…'), 2, 'wrench', 'wrench'),
      step('console', tr('Signer le bon de sortie', 'Sign the release form'), tr('Signature…', 'Signing…'), 2, 'scrub', 'cpu'),
    ],
  },
  {
    name: tr('Inspection de coque', 'Hull inspection'),
    intro: tr('Boulon a repéré une micro-fissure. Tu lances son scan au pupitre, tu inspectes l\'aile, pâte à joint au chariot, et tu rebouches au poste de soudure.', 'Bolt spotted a hairline crack. Start his scan at the console, inspect the wing, sealant from the cart, and patch it at the welding station.'),
    steps: [
      step('console', tr('Lancer le scan de Boulon', 'Start Bolt\'s scan'), tr('Scan…', 'Scanning…'), 1.8, 'scrub', 'drone', tr('Boulon, scan complet ! … Il boude. Relance. Voilà.', 'Bolt, full scan! … He\'s sulking. Again. There.')),
      step('krait', tr('Inspecter le bord de l\'aile', 'Inspect the wing edge'), tr('Inspection…', 'Inspecting…'), 3, 'scrub', 'eye', tr('Tu vois cette rayure ? Quelqu\'un va avoir des ennuis.', 'See that scratch? Somebody is in trouble.')),
      step('cart', tr('Prendre la pâte à joint', 'Get the sealant'), tr('Au chariot…', 'At the cart…'), 1.6, 'wrench', 'toolbox'),
      step('welder', tr('Reboucher la micro-fissure', 'Patch the hairline crack'), tr('Soudure…', 'Welding…'), 3, 'sparks', 'flame'),
    ],
  },
]

/** Ce que dit Nico quand la révision est finie. */
const DONE = [
  tr('Nico tapote la coque du Krait. « Et voilà, ma belle, comme neuve. » Révision terminée !', 'Nico pats the Krait\'s hull. “There you go, girl, good as new.” Service done!'),
  tr('Boulon fait un petit looping de joie. Nico : « Il ne fait ça qu\'avec les gens qu\'il aime bien. » Révision terminée !', 'Bolt does a little happy loop. Nico: “He only does that for people he likes.” Service done!'),
  tr('« Beau boulot ! Si le capitaine demande, c\'est moi qui ai tout fait. » Révision terminée !', '“Nice work! If the captain asks, I did it all.” Service done!'),
]

/** Nico, quand quelqu'un s'installe aux commandes du Krait. */
const ABOARD = [
  tr('Hé ! Touche à rien là-haut !', 'Hey! Don\'t touch anything up there!'),
  tr('Si tu démarres, tu repeins le hangar !', 'If you start her up, you\'re repainting the hangar!'),
  tr('Les pieds pas sur la console !', 'Feet off the console!'),
]

/** Ce qu'on lit en mettant les réacteurs en route. */
const IGNITION = [
  tr('Tu appuies sur le gros bouton rouge. Les réacteurs du Krait s\'éveillent dans un sifflement, puis rugissent. Espace pour décoller.', 'You press the big red button. The Krait\'s thrusters wake with a whine, then roar. Space to take off.'),
  tr('Contact ! Le Krait vibre de la verrière au train, et le hangar avec lui. Quelque part, Nico hurle. Espace pour décoller.', 'Ignition! The Krait shakes from canopy to landing gear, and the hangar with it. Somewhere, Nico screams. Space to take off.'),
]

/** Sans un geste pendant ce temps, la révision est abandonnée (Nico ne l'attend pas plus, cf. MECH_HELP). */
const IDLE = MECH_HELP - 3
/** Hors du hangar plus longtemps que ça, la révision est abandonnée. */
const AWAY = 4

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]

/** Révisions faites avec Nico, gardées dans ce navigateur (le stockage peut manquer). */
const DONE_KEY = 'mini-shipinteriors-revisions'
function loadDone(): number {
  try {
    return Math.max(0, Number(localStorage.getItem(DONE_KEY)) || 0)
  } catch {
    return 0
  }
}
function saveDone(n: number) {
  try {
    localStorage.setItem(DONE_KEY, String(n))
  } catch {
    // Stockage indisponible (navigation privée) : on compte pour cette visite seulement.
  }
}

export interface HangarHost {
  /** Le pont de la cale (le hangar). */
  deck: Deck
  mechanic: Mechanic
  player: Player
  /** Pont où se trouve le joueur. */
  here: () => Deck
  /** Place où le joueur est installé, s'il l'est. */
  seat: () => { item: Interactable } | null
  /** Joueurs distants installés aux commandes du Krait. */
  pilots: () => number
  /** Texte dans la boîte de dialogue. */
  show: (text: string) => void
  /** On aide le mécano (à chaque étape), ou on a fini : le relais et le mécano le savent. */
  help: (on: boolean) => void
  /** Prime d'une révision, écrite sur la fiche (« +800 CR »). */
  reward: string
  /** Révision demandée, puis finie : le site note l'heure, puis paie la révision. */
  requested: () => void
  finished: () => void
  /** On met les réacteurs du Krait en route, ou on les coupe : le relais et le mécano le savent. */
  engines: (on: boolean) => void
  /** Se met à l'ouvrage (cf. startWork dans main.ts) ; false si le joueur est occupé ailleurs. */
  work: (job: { at: THREE.Vector3; duration: number; label: string; sound: WorkSound; alive: () => boolean; finish: () => void }) => boolean
}

/** Révision en cours : la fiche, l'étape, et depuis quand rien n'a bougé. */
interface Service {
  job: Job
  step: number
  idle: number
  away: number
}

export class Hangar {
  /** Révisions faites avec Nico (dans ce navigateur). */
  done = loadDone()
  private service: Service | null = null
  /** Invites d'origine des meubles des postes, rendues à la fin de chaque étape. */
  private stations = new Map<Station, { item: Interactable; label: string; onInteract?: () => void }>()
  private readonly marker = new THREE.Sprite()
  private readonly card = document.getElementById('job-card')
  private ladder?: Interactable
  /** Le joueur local était aux commandes à l'image précédente. */
  private aboard = false
  /** C'est le joueur local qui a mis les réacteurs en route (il les coupe en se levant). */
  private started = false

  constructor(private readonly host: HangarHost) {
    const { deck } = host
    // Les postes sont ceux du hangar : la cale a d'autres meubles du même modèle (le poste de
    // soudure de l'atelier, près de la salle des machines).
    const inHangar = (it: Interactable) => deck.map.room(Math.round(it.position.x), Math.round(it.position.z)) === MECH_ROOM
    for (const [station, { model, label }] of Object.entries(STATION_MODEL) as [Station, { model: string; label?: string }][]) {
      const item = deck.interactables.find((it) => it.furniture?.model === model && (label === undefined || it.furniture.label === label) && inHangar(it))
      if (item) this.stations.set(station, { item, label: item.label, onInteract: item.onInteract })
    }
    this.marker.scale.setScalar(0.34)
    this.marker.renderOrder = 4
    this.marker.visible = false
    deck.group.add(this.marker)

    // Le pupitre : demander une révision (ou se faire rappeler la sienne).
    const desk = this.stations.get('console')
    if (desk) {
      desk.label = tr('Demander une révision', 'Ask for a service job')
      desk.onInteract = () => this.takeJob()
      this.restoreStations()
    }
    // Aux commandes, c'est le Krait qui reste net (on est dans son cockpit), pas l'escabeau.
    this.ladder = deck.interactables.find((it) => it.furniture?.model === 'krait-ladder')
    const krait = this.stations.get('krait')?.item
    if (this.ladder && krait) this.ladder.keep = krait.object.position
  }

  /** Une révision est en cours. */
  get busy(): boolean {
    return this.service !== null
  }

  /** Le meuble de l'étape en cours, s'il y en a une : la touche E le préfère à ses voisins (cf. main.ts). */
  get target(): Interactable | null {
    const s = this.service
    return s ? this.stations.get(s.job.steps[s.step].at)?.item ?? null : null
  }

  /** Le joueur local est aux commandes du Krait. */
  get aboardKrait(): boolean {
    const seat = this.host.seat()
    return !!seat && seat.item === this.ladder && this.host.here() === this.host.deck
  }

  /** Les réacteurs du Krait tournent (le joueur local ou un autre les a mis en route). */
  get engines(): boolean {
    return this.host.mechanic.panicking
  }

  /** Aux commandes du Krait, Espace : les réacteurs démarrent, ou se coupent. */
  toggleEngines() {
    if (!this.aboardKrait) return
    const on = !this.engines
    // Un autre pilote les a lancés (une place à la fois, mais la latence…) : on ne les coupe pas.
    if (!on && !this.started) return
    this.started = on
    this.host.engines(on)
    if (on) this.host.show(pick(IGNITION))
  }

  /** Ce que Nico répond si on lui parle pendant une révision (null : il bavarde comme d'habitude). */
  reminder(): string | null {
    const s = this.service
    if (!s) return null
    const st = s.job.steps[s.step]
    return pick([
      tr(`${st.verb}, ${WHERE[st.at]}. Allez, la Princesse attend !`, `${st.verb}, ${WHERE[st.at]}. Come on, the Princess is waiting!`),
      tr(`On papote ou on bosse ? ${WHERE[st.at][0].toUpperCase()}${WHERE[st.at].slice(1)} !`, `Are we chatting or working? ${WHERE[st.at][0].toUpperCase()}${WHERE[st.at].slice(1)}!`),
    ])
  }

  // ------------------------------------------------------------ révisions

  private takeJob() {
    const { host } = this
    if (this.service) {
      const st = this.service.job.steps[this.service.step]
      if (st.at === 'console') return this.doStep()
      return host.show(tr(`${MECHANIC} : « ${this.reminder()} »`, `${MECHANIC}: “${this.reminder()}”`))
    }
    const job = pick(JOBS)
    this.service = { job, step: 0, idle: 0, away: 0 }
    host.help(true)
    host.requested()
    const first = this.done ? '' : tr(' Les postes s\'allument au fur et à mesure, suis les hexagones.', ' The stations light up one after another, follow the hexagons.')
    host.show(tr(`${MECHANIC} : « ${job.intro}${first} »`, `${MECHANIC}: “${job.intro}${first}”`))
    host.mechanic.say(tr('Au boulot !', 'Let\'s get to work!'))
    this.showStep()
  }

  /** L'étape en cours s'allume : marqueur au-dessus du poste, invite du meuble, fiche à l'écran. */
  private showStep() {
    this.restoreStations()
    const s = this.service
    if (!s) {
      this.marker.visible = false
      if (this.card) this.card.hidden = true
      return
    }
    const st = s.job.steps[s.step]
    const station = this.stations.get(st.at)
    if (station) {
      station.item.label = st.verb
      station.item.onInteract = () => this.doStep()
      this.marker.material = markerMaterial(st.icon, '#39d0ff')
      this.marker.position.set(station.item.position.x, 1.32, station.item.position.z)
      this.marker.visible = true
    }
    this.renderCard()
  }

  private restoreStations() {
    for (const [station, s] of this.stations) {
      s.item.label = s.label
      s.item.onInteract = station === 'console' ? () => this.takeJob() : s.onInteract
    }
  }

  private doStep() {
    const s = this.service
    if (!s) return
    const index = s.step
    const st = s.job.steps[index]
    const station = this.stations.get(st.at)
    if (!station) return
    this.host.work({
      at: station.item.position,
      duration: st.secs,
      label: st.doing,
      sound: st.sound,
      alive: () => this.service === s && s.step === index,
      finish: () => this.stepDone(s),
    })
  }

  private stepDone(s: Service) {
    if (this.service !== s) return
    const st = s.job.steps[s.step]
    s.step++
    s.idle = 0
    if (s.step >= s.job.steps.length) return this.finish(s)
    this.host.help(true)
    if (st.said) this.host.mechanic.say(st.said)
    this.showStep()
  }

  /** La révision est finie : Nico conclut, le compteur avance, le mécano reprend sa tournée. */
  private finish(s: Service) {
    this.service = null
    this.done++
    saveDone(this.done)
    this.host.help(false)
    this.showStep()
    const count = this.done === 1
      ? tr('Première révision avec Nico.', 'First service with Nico.')
      : tr(`${this.done} révisions avec Nico.`, `${this.done} services with Nico.`)
    this.host.show(`${s.job.name} · ${pick(DONE)} ${count}`)
    this.host.mechanic.say(tr('Merci, l\'ami !', 'Thanks, friend!'))
    this.host.finished()
  }

  /** Révision abandonnée (parti trop loin, ou trop longtemps sans rien faire). */
  private abandon(why: 'away' | 'idle') {
    if (!this.service) return
    this.service = null
    this.host.help(false)
    this.showStep()
    this.host.mechanic.say(why === 'away' ? tr('Il est parti ? Bon. Je finis tout seul. Comme d\'hab.', 'Gone? Fine. I\'ll finish on my own. As usual.') : tr('Tu dors ? Je finis moi-même.', 'Asleep? I\'ll finish it myself.'))
  }

  /** La fiche de travail, dans le HUD : la révision, les étapes (faites, en cours, à venir). */
  private renderCard() {
    const el = this.card
    const s = this.service
    if (!el || !s) return
    el.replaceChildren()
    const head = document.createElement('div')
    head.className = 'ot-head'
    head.textContent = tr(`Krait Mk II · fiche de travail · ${this.host.reward}`, `Krait Mk II · work order · ${this.host.reward}`)
    const name = document.createElement('div')
    name.className = 'ot-dish'
    name.textContent = s.job.name
    const list = document.createElement('ol')
    list.className = 'ot-steps'
    s.job.steps.forEach((st, i) => {
      const li = document.createElement('li')
      li.textContent = st.verb
      li.className = i < s.step ? 'done' : i === s.step ? 'now' : ''
      if (i === s.step) {
        const where = document.createElement('span')
        where.className = 'ot-where'
        where.textContent = WHERE[st.at]
        li.append(where)
      }
      list.append(li)
    })
    el.append(head, name, list)
    el.hidden = false
  }

  // ------------------------------------------------------------ à chaque image

  update(dt: number) {
    const { host } = this
    if (this.marker.visible) this.marker.position.y = 1.32 + Math.sin(performance.now() / 450) * 0.035

    const s = this.service
    if (s) {
      const p = host.player.position
      const inHangar = host.here() === host.deck && host.deck.map.room(Math.round(p.x), Math.round(p.z)) === MECH_ROOM
      s.away = inHangar ? 0 : s.away + dt
      s.idle += dt
      if (inHangar) host.mechanic.watch(p)
      if (s.away > AWAY) this.abandon('away')
      else if (s.idle > IDLE) this.abandon('idle')
    }

    // Quelqu'un aux commandes : les tuyères s'allument ; Nico proteste quand on y monte.
    const aboard = this.aboardKrait
    const m = host.mechanic.position, p = host.player.position
    if (aboard && !this.aboard && Math.hypot(m.x - p.x, m.z - p.z) < 8) host.mechanic.say(pick(ABOARD))
    this.aboard = aboard
    // Descendu du cockpit (ou débarqué de la cale) : ses réacteurs se coupent avec lui.
    if (this.started && (!aboard || !this.engines)) {
      if (this.engines) host.engines(false)
      this.started = false
    }
    // Réacteurs en route : pleine poussée ; quelqu'un aux commandes : les tuyères s'éveillent.
    kraitPower.value = this.engines ? 1 : aboard || host.pilots() > 0 ? 0.3 : 0
  }
}
