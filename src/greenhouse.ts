import * as THREE from 'three'
import type { Deck, Interactable } from './deck'
import { markerMaterial, type WorkSound } from './economy/tasks'
import { GARDENER, type Gardener } from './gardener'
import { tr } from './i18n'
import type { IconName } from './icons'
import type { Player } from './player'
import { GARDEN_HELP, GARDEN_ROOM } from '../shared/gardener.js'

/*
 * La serre hydroponique du pont supérieur, côté joueur : une fiche de culture avec Capucine.
 *
 * À la grainothèque, on prend une fiche ; Capucine vient se poster sur les pas japonais (pour tout
 * le bord, cf. shared/gardener.js) et explique le travail. Chaque étape a son poste (grainothèque,
 * établi, récupérateur d'eau, bacs potagers, arbre, étang du jardin exotique, compost, cuve, caisses de récolte…),
 * marqué d'un hexagone vert : on y va, on s'y met quelques secondes (la même jauge que les tâches
 * de bord), Capucine commente, et l'étape suivante s'allume. Finie, la fiche est payée par le site
 * (prime et plafonds : `garden` dans economy.json, cf. Wallet.finishJob). Leur nombre est gardé
 * dans ce navigateur.
 */

type Station = 'seeds' | 'bench' | 'barrel' | 'tomato' | 'herbs' | 'lettuce' | 'flowers' | 'tree' | 'crate' | 'tank' | 'racks' | 'compost' | 'pond' | 'wall'

/** Meuble de chaque poste (cf. levels.ts), et sa variante s'il y en a plusieurs du même modèle. */
const STATION_MODEL: Record<Station, { model: string; label?: string }> = {
  seeds: { model: 'seed-cabinet' },
  bench: { model: 'potting-bench' },
  barrel: { model: 'water-barrel' },
  tomato: { model: 'garden-bed', label: 'tomato' },
  herbs: { model: 'garden-bed', label: 'herbs' },
  lettuce: { model: 'garden-bed', label: 'lettuce' },
  flowers: { model: 'garden-bed', label: 'flowers' },
  tree: { model: 'fruit-tree' },
  crate: { model: 'harvest-crate' },
  tank: { model: 'nutrient-tank' },
  racks: { model: 'hydro-rack' },
  compost: { model: 'compost-bin' },
  pond: { model: 'fishing-pond' },
  wall: { model: 'vine-trellis' },
}

/** Où est le poste, dans la bouche de Capucine. */
const WHERE: Record<Station, string> = {
  seeds: tr('à la grainothèque', 'at the seed library'),
  bench: tr('à l\'établi de rempotage', 'at the potting bench'),
  barrel: tr('au récupérateur d\'eau, contre la verrière', 'at the water butt, against the glass'),
  tomato: tr('au bac à tomates', 'at the tomato bed'),
  herbs: tr('au bac d\'herbes aromatiques', 'at the herb bed'),
  lettuce: tr('au bac de salades', 'at the lettuce bed'),
  flowers: tr('au massif de fleurs', 'at the flower bed'),
  tree: tr('au pommier de Lave', 'at the Lave apple tree'),
  crate: tr('aux caisses de récolte', 'at the harvest crates'),
  tank: tr('à la cuve de nutriments', 'at the nutrient tank'),
  racks: tr('aux bacs hydroponiques', 'at the hydroponic racks'),
  compost: tr('au compost', 'at the compost bin'),
  pond: tr('à l\'étang des carpes, au jardin exotique', 'at the koi pond, in the exotic garden'),
  wall: tr('à la vigne, contre la verrière', 'at the vine, against the glass'),
}

interface Step {
  at: Station
  verb: string
  doing: string
  /** Durée du geste (s). */
  secs: number
  sound: WorkSound
  icon: IconName
  /** Ce que dit Capucine, l'étape faite. */
  said?: string
}

interface Job {
  name: string
  /** Ce que dit Capucine en donnant la fiche. */
  intro: string
  steps: Step[]
}

const step = (at: Station, verb: string, doing: string, secs: number, sound: WorkSound, icon: IconName, said?: string): Step => ({ at, verb, doing, secs, sound, icon, said })

const JOBS: Job[] = [
  {
    name: tr('Semis de tomates', 'Sowing tomatoes'),
    intro: tr('On sème ! Des graines de tomate à la grainothèque, tu les sèmes en godets à l\'établi, tu remplis l\'arrosoir au récupérateur, et tu repiques les plus beaux plants dans le bac.', 'Sowing time! Tomato seeds from the seed library, sow them in pots at the bench, fill the watering can at the water butt, and plant out the best seedlings in the bed.'),
    steps: [
      step('seeds', tr('Prendre des graines de tomate', 'Get tomato seeds'), tr('Dans les tiroirs…', 'Searching the drawers…'), 1.6, 'scrub', 'potted-plant', tr('Le tiroir rouge. Pas celui fermé à clé. Surtout pas celui-là.', 'The red drawer. Not the locked one. Definitely not that one.')),
      step('bench', tr('Semer en godets', 'Sow in pots'), tr('Semis…', 'Sowing…'), 3, 'scrub', 'plant', tr('Un doigt de profondeur, pas plus. Elles ont peur du noir.', 'One finger deep, no more. They\'re afraid of the dark.')),
      step('barrel', tr('Remplir l\'arrosoir', 'Fill the watering can'), tr('Remplissage…', 'Filling…'), 2, 'water', 'drop', tr('De l\'eau de coque, filtrée trois fois. Le luxe.', 'Hull water, filtered three times. Luxury.')),
      step('tomato', tr('Repiquer les plants', 'Plant out the seedlings'), tr('Repiquage…', 'Planting out…'), 3.2, 'scrub', 'plant'),
    ],
  },
  {
    name: tr('Récolte pour le mess', 'Harvest for the mess'),
    intro: tr('Marcel attend sa livraison. Tu cueilles les tomates mûres, tu coupes du basilic, tu cueilles trois pommes de Lave, et tu remplis les caisses.', 'Marcel is waiting for his delivery. Pick the ripe tomatoes, cut some basil, pick three Lave apples, and fill the crates.'),
    steps: [
      step('tomato', tr('Cueillir les tomates mûres', 'Pick the ripe tomatoes'), tr('Cueillette…', 'Picking…'), 2.8, 'chop', 'plant', tr('Les rouges seulement ! Les vertes, c\'est pour les chutneys de Marcel.', 'Only the red ones! The green ones are for Marcel\'s chutneys.')),
      step('herbs', tr('Couper du basilic', 'Cut some basil'), tr('Coupe…', 'Cutting…'), 2.2, 'chop', 'knife', tr('Au-dessus d\'un nœud, qu\'il repousse. Merci pour lui.', 'Above a node, so it grows back. Thank you on its behalf.')),
      step('tree', tr('Cueillir des pommes de Lave', 'Pick some Lave apples'), tr('Cueillette…', 'Picking…'), 2.6, 'chop', 'plant', tr('Elles luisent encore un peu. C\'est normal. Je crois.', 'They still glow a little. That\'s normal. I think.')),
      step('crate', tr('Remplir les caisses pour Marcel', 'Fill the crates for Marcel'), tr('Emballage…', 'Packing…'), 2.4, 'wrench', 'package'),
    ],
  },
  {
    name: tr('Soin des cultures', 'Crop care'),
    intro: tr('Les salades ont soif et les bacs ont faim. Tu doses la solution à la cuve, tu nourris les bacs hydroponiques, tu désherbes les salades, et les mauvaises herbes vont au compost.', 'The lettuces are thirsty and the racks are hungry. Dose the solution at the tank, feed the hydroponic racks, weed the lettuces, and the weeds go on the compost.'),
    steps: [
      step('tank', tr('Doser la solution nutritive', 'Dose the nutrient solution'), tr('Dosage…', 'Dosing…'), 2.2, 'hiss', 'drop', tr('Une pincée de poussière d\'astéroïde. Pas deux. Deux, ça les rend arrogantes.', 'A pinch of asteroid dust. Not two. Two makes them arrogant.')),
      step('racks', tr('Nourrir les bacs hydroponiques', 'Feed the hydroponic racks'), tr('Arrosage…', 'Watering…'), 2.8, 'water', 'drop'),
      step('lettuce', tr('Désherber les salades', 'Weed the lettuces'), tr('Désherbage…', 'Weeding…'), 3, 'scrub', 'plant', tr('Celle-là, c\'est une carotte ! … Non, tu as raison, c\'est une mauvaise herbe.', 'That one\'s a carrot! … No, you\'re right, it\'s a weed.')),
      step('compost', tr('Vider les mauvaises herbes au compost', 'Put the weeds on the compost'), tr('Au compost…', 'Composting…'), 1.8, 'scrub', 'trash'),
    ],
  },
  {
    name: tr('Tournée des fleurs', 'Flower round'),
    intro: tr('Journée douceur : tu remplis l\'arrosoir, tu arroses le massif, tu nourris les carpes, et tu tailles un peu la vigne. Pas trop. Elle est susceptible.', 'A gentle day: fill the watering can, water the flower bed, feed the koi, and trim the vine a little. Not too much. It\'s touchy.'),
    steps: [
      step('barrel', tr('Remplir l\'arrosoir', 'Fill the watering can'), tr('Remplissage…', 'Filling…'), 2, 'water', 'drop'),
      step('flowers', tr('Arroser le massif', 'Water the flower bed'), tr('Arrosage…', 'Watering…'), 2.8, 'water', 'drop', tr('Au pied, pas sur les pétales. Elles se maquillent pour la verrière.', 'At the roots, not on the petals. They\'re dressed up for the glass roof.')),
      step('pond', tr('Nourrir les carpes', 'Feed the koi'), tr('Distribution…', 'Feeding…'), 2, 'munch', 'paw-print', tr('Gutamaya d\'abord. Sinon elle boude toute la journée.', 'Gutamaya first. Otherwise she sulks all day.')),
      step('wall', tr('Tailler la vigne', 'Prune the vine'), tr('Taille…', 'Pruning…'), 3, 'chop', 'knife'),
    ],
  },
]

/** Ce que dit Capucine quand la fiche est finie. */
const DONE = [
  tr('Capucine ôte son chapeau : « Magnifique. Les plantes te remercient, et moi aussi. » Fiche terminée !', 'Capucine takes off her hat: “Beautiful. The plants thank you, and so do I.” Sheet done!'),
  tr('Un drone pollinisateur fait un tour d\'honneur au-dessus de toi. Capucine : « Il ne fait ça pour personne. » Fiche terminée !', 'A pollinator drone does a lap of honour over your head. Capucine: “He doesn\'t do that for anyone.” Sheet done!'),
  tr('« Tu as la main verte ! Enfin, le gant vert. » Fiche terminée !', '“You\'ve got green fingers! Well, green gloves.” Sheet done!'),
]

/** Sans un geste pendant ce temps, la fiche est abandonnée (Capucine ne l'attend pas plus, cf. GARDEN_HELP). */
const IDLE = GARDEN_HELP - 3
/** Hors de la serre plus longtemps que ça, la fiche est abandonnée. */
const AWAY = 4

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]

/** Fiches faites avec Capucine, gardées dans ce navigateur (le stockage peut manquer). */
const DONE_KEY = 'mini-shipinteriors-cultures'
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

export interface GreenhouseHost {
  /** Le pont supérieur (la serre). */
  deck: Deck
  gardener: Gardener
  player: Player
  /** Pont où se trouve le joueur. */
  here: () => Deck
  /** Texte dans la boîte de dialogue. */
  show: (text: string) => void
  /** On aide la jardinière (à chaque étape), ou on a fini : le relais et la jardinière le savent. */
  help: (on: boolean) => void
  /** Prime d'une fiche, écrite sur la fiche (« +700 CR »). */
  reward: string
  /** Fiche prise, puis finie : le site note l'heure, puis paie la fiche. */
  requested: () => void
  finished: () => void
  /** Se met à l'ouvrage (cf. startWork dans main.ts) ; false si le joueur est occupé ailleurs. */
  work: (job: { at: THREE.Vector3; duration: number; label: string; sound: WorkSound; alive: () => boolean; finish: () => void }) => boolean
}

/** Fiche en cours : le travail, l'étape, et depuis quand rien n'a bougé. */
interface Sheet {
  job: Job
  step: number
  idle: number
  away: number
}

export class Greenhouse {
  /** Fiches faites avec Capucine (dans ce navigateur). */
  done = loadDone()
  private sheet: Sheet | null = null
  /** Invites d'origine des meubles des postes, rendues à la fin de chaque étape. */
  private stations = new Map<Station, { item: Interactable; label: string; onInteract?: () => void }>()
  private readonly marker = new THREE.Sprite()
  private readonly card = document.getElementById('job-card')

  constructor(private readonly host: GreenhouseHost) {
    const { deck } = host
    // Les postes sont ceux de la serre : les quartiers des CMDR peuvent avoir leurs propres bacs.
    const inGreenhouse = (it: Interactable) => deck.map.room(Math.round(it.position.x), Math.round(it.position.z)) === GARDEN_ROOM
    for (const [station, { model, label }] of Object.entries(STATION_MODEL) as [Station, { model: string; label?: string }][]) {
      const item = deck.interactables.find((it) => it.furniture?.model === model && (label === undefined || it.furniture.label === label) && inGreenhouse(it))
      if (item) this.stations.set(station, { item, label: item.label, onInteract: item.onInteract })
    }
    this.marker.scale.setScalar(0.34)
    this.marker.renderOrder = 4
    this.marker.visible = false
    deck.group.add(this.marker)

    // La grainothèque : prendre une fiche de culture (ou se faire rappeler la sienne).
    if (this.stations.get('seeds')) this.restoreStations()
  }

  /** Une fiche est en cours. */
  get busy(): boolean {
    return this.sheet !== null
  }

  /** Le meuble de l'étape en cours, s'il y en a une : la touche E le préfère à ses voisins (cf. main.ts). */
  get target(): Interactable | null {
    const s = this.sheet
    return s ? this.stations.get(s.job.steps[s.step].at)?.item ?? null : null
  }

  /** Ce que Capucine répond si on lui parle pendant une fiche (null : elle bavarde comme d'habitude). */
  reminder(): string | null {
    const s = this.sheet
    if (!s) return null
    const st = s.job.steps[s.step]
    return pick([
      tr(`${st.verb}, ${WHERE[st.at]}. Les plantes n'attendent pas !`, `${st.verb}, ${WHERE[st.at]}. Plants don't wait!`),
      tr(`On bavarde ou on jardine ? ${WHERE[st.at][0].toUpperCase()}${WHERE[st.at].slice(1)} !`, `Are we chatting or gardening? ${WHERE[st.at][0].toUpperCase()}${WHERE[st.at].slice(1)}!`),
    ])
  }

  // ------------------------------------------------------------ fiches

  private takeJob() {
    const { host } = this
    if (this.sheet) {
      const st = this.sheet.job.steps[this.sheet.step]
      if (st.at === 'seeds') return this.doStep()
      return host.show(tr(`${GARDENER} : « ${this.reminder()} »`, `${GARDENER}: “${this.reminder()}”`))
    }
    const job = pick(JOBS)
    this.sheet = { job, step: 0, idle: 0, away: 0 }
    host.help(true)
    host.requested()
    const first = this.done ? '' : tr(' Les postes s\'allument au fur et à mesure, suis les hexagones verts.', ' The stations light up one after another, follow the green hexagons.')
    host.show(tr(`${GARDENER} : « ${job.intro}${first} »`, `${GARDENER}: “${job.intro}${first}”`))
    host.gardener.say(tr('Les mains dans la terre !', 'Hands in the soil!'))
    this.showStep()
  }

  /** L'étape en cours s'allume : marqueur au-dessus du poste, invite du meuble, fiche à l'écran. */
  private showStep() {
    this.restoreStations()
    const s = this.sheet
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
      this.marker.material = markerMaterial(st.icon, '#7dffa8')
      this.marker.position.set(station.item.position.x, 1.32, station.item.position.z)
      this.marker.visible = true
    }
    this.renderCard()
  }

  private restoreStations() {
    for (const [station, s] of this.stations) {
      s.item.label = station === 'seeds' ? tr('Prendre une fiche de culture', 'Take a growing sheet') : s.label
      s.item.onInteract = station === 'seeds' ? () => this.takeJob() : s.onInteract
    }
  }

  private doStep() {
    const s = this.sheet
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
      alive: () => this.sheet === s && s.step === index,
      finish: () => this.stepDone(s),
    })
  }

  private stepDone(s: Sheet) {
    if (this.sheet !== s) return
    const st = s.job.steps[s.step]
    s.step++
    s.idle = 0
    if (s.step >= s.job.steps.length) return this.finish(s)
    this.host.help(true)
    if (st.said) this.host.gardener.say(st.said)
    this.showStep()
  }

  /** La fiche est finie : Capucine conclut, le compteur avance, la jardinière reprend sa tournée. */
  private finish(s: Sheet) {
    this.sheet = null
    this.done++
    saveDone(this.done)
    this.host.help(false)
    this.showStep()
    const count = this.done === 1
      ? tr('Première fiche de culture avec Capucine.', 'First growing sheet with Capucine.')
      : tr(`${this.done} fiches de culture avec Capucine.`, `${this.done} growing sheets with Capucine.`)
    this.host.show(`${s.job.name} · ${pick(DONE)} ${count}`)
    this.host.gardener.say(tr('Merci, les plantes t\'adorent !', 'Thank you, the plants adore you!'))
    this.host.finished()
  }

  /** Fiche abandonnée (parti trop loin, ou trop longtemps sans rien faire). */
  private abandon(why: 'away' | 'idle') {
    if (!this.sheet) return
    this.sheet = null
    this.host.help(false)
    this.showStep()
    this.host.gardener.say(why === 'away' ? tr('Plus personne ? Bon. Je finis avec les drones.', 'Nobody left? Fine. I\'ll finish with the drones.') : tr('Une petite sieste dans le massif ? Je termine.', 'A little nap in the flower bed? I\'ll finish up.'))
  }

  /** La fiche de culture, dans le HUD : le travail, les étapes (faites, en cours, à venir). */
  private renderCard() {
    const el = this.card
    const s = this.sheet
    if (!el || !s) return
    el.replaceChildren()
    const head = document.createElement('div')
    head.className = 'ot-head'
    head.textContent = tr(`Serre · fiche de culture · ${this.host.reward}`, `Greenhouse · growing sheet · ${this.host.reward}`)
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
    const s = this.sheet
    if (!s) return
    const p = host.player.position
    const inside = host.here() === host.deck && host.deck.map.room(Math.round(p.x), Math.round(p.z)) === GARDEN_ROOM
    s.away = inside ? 0 : s.away + dt
    s.idle += dt
    if (inside) host.gardener.watch(p)
    if (s.away > AWAY) this.abandon('away')
    else if (s.idle > IDLE) this.abandon('idle')
  }
}
