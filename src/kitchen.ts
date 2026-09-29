import * as THREE from 'three'
import { CHEF, type Chef } from './chef'
import type { Deck, Interactable } from './deck'
import { markerMaterial, type WorkSound } from './economy/tasks'
import { tr } from './i18n'
import type { IconName } from './icons'
import { menuOf, type Menu } from './menu'
import type { Player } from './player'
import type { SeatSpot } from './seats'
import { CHEF_COOK, CHEF_ROOM } from '../shared/chef.js'

/*
 * Le self du mess, côté joueur : cuisiner avec Marcel, et manger.
 *
 * Commandes : au rail de la passe, on prend un bon ; Marcel vient au bout du self (pour tout le bord,
 * cf. shared/chef.js) et annonce la recette. Chaque étape a son poste (frigo, garde-manger, plan
 * de travail, fourneau, plonge, passe), marqué d'un hexagone cyan : on y va, on s'y met quelques
 * secondes (la même jauge que les tâches de bord), Marcel commente, et l'étape suivante
 * s'allume. Dressée à la passe, l'assiette part en salle. Les commandes ne rapportent pas encore
 * de crédits : seul le nombre de plats envoyés est gardé, dans ce navigateur.
 *
 * Plateaux : au début du self, on prend un plateau garni du menu du jour ; on le porte à deux mains jusqu'à une
 * table de cantine, il se pose devant soi, on mange ; on le rapporte au retour plateaux.
 */

type Station = 'fridge' | 'pantry' | 'prep' | 'range' | 'sink' | 'passe'

/** Meuble de chaque poste (cf. levels.ts) : ses invites deviennent celles de l'étape. */
const STATION_MODEL: Record<Station, string> = {
  fridge: 'kitchen-fridge',
  pantry: 'kitchen-pantry',
  prep: 'kitchen-prep',
  range: 'kitchen-range',
  sink: 'kitchen-sink',
  passe: 'order-rail',
}

/** Où est le poste, dans la bouche de Marcel. */
const WHERE: Record<Station, string> = {
  fridge: tr('au frigo', 'at the fridge'),
  pantry: tr('au garde-manger', 'at the pantry'),
  prep: tr('sur le plan de travail', 'at the prep counter'),
  range: tr('au fourneau', 'at the range'),
  sink: tr('à la plonge', 'at the sink'),
  passe: tr('à la passe', 'at the pass'),
}

interface Step {
  at: Station
  verb: string
  doing: string
  /** Durée du geste (s). */
  secs: number
  sound: WorkSound
  icon: IconName
  /** Ce que dit Marcel, l'étape faite. */
  said?: string
}

interface Recipe {
  dish: string
  /** Ce que dit Marcel en lisant le bon (`{table}` : le numéro de la table). */
  intro: string
  steps: Step[]
  /** Couleur de l'assiette qui part en salle. */
  color: string
}

const take = (at: 'fridge' | 'pantry', verb: string, said?: string): Step =>
  ({ at, verb, doing: at === 'fridge' ? tr('Au frigo…', 'In the fridge…') : tr('Au garde-manger…', 'In the pantry…'), secs: 1.6, sound: 'wrench', icon: at === 'fridge' ? 'snowflake' : 'package', said })
const prep = (verb: string, doing: string, said?: string, sound: WorkSound = 'chop'): Step =>
  ({ at: 'prep', verb, doing, secs: 2.8, sound, icon: 'knife', said })
const cook = (verb: string, doing: string, said?: string, sound: WorkSound = 'sizzle'): Step =>
  ({ at: 'range', verb, doing, secs: 3.4, sound, icon: 'flame', said })
const rinse = (verb: string, said?: string): Step =>
  ({ at: 'sink', verb, doing: tr('À la plonge…', 'At the sink…'), secs: 2.2, sound: 'water', icon: 'drop', said })
const plate = (verb = tr('Dresser l\'assiette', 'Plate it up')): Step =>
  ({ at: 'passe', verb, doing: tr('Dressage…', 'Plating…'), secs: 2, sound: 'scrub', icon: 'bowl-steam' })

const RECIPES: Recipe[] = [
  {
    dish: tr('Ragoût de lapin de Ceti', 'Ceti rabbit stew'),
    intro: tr('Un ragoût de lapin de Ceti pour la table {table} ! Le lapin est au frigo : tu le découpes, tu le fais mijoter, et tu me dresses ça à la passe.', 'One Ceti rabbit stew for table {table}! The rabbit\'s in the fridge: you cut it up, let it simmer, and plate it up at the pass.'),
    color: '#9a4a24',
    steps: [
      take('fridge', tr('Sortir le lapin de Ceti', 'Take out the Ceti rabbit'), tr('Il est beau, hein ? Il sautait encore hier.', 'Lovely, isn\'t it? It was still hopping yesterday.')),
      prep(tr('Découper le lapin', 'Cut up the rabbit'), tr('Découpe…', 'Cutting…'), tr('Des morceaux égaux ! Égaux, j\'ai dit… Bon, ça ira.', 'Even pieces! Even, I said… Fine, that\'ll do.')),
      cook(tr('Faire mijoter le ragoût', 'Simmer the stew'), tr('Ça mijote…', 'Simmering…'), tr('Tu sens ça ? C\'est l\'odeur du caractère.', 'Smell that? That\'s the smell of character.'), 'hiss'),
      plate(),
    ],
  },
  {
    dish: tr('Escargots géants d\'Irukama', 'Giant Irukama snails'),
    intro: tr('Escargots d\'Irukama, table {table} ! Frigo, plonge pour les rincer, poêle au beurre, et à la passe.', 'Irukama snails, table {table}! Fridge, sink to rinse them, pan with butter, and to the pass.'),
    color: '#6b5a3a',
    steps: [
      take('fridge', tr('Sortir les escargots', 'Take out the snails'), tr('Attention, celui-là mord.', 'Careful, that one bites.')),
      rinse(tr('Rincer les escargots', 'Rinse the snails'), tr('Rince bien, ils ont traîné partout.', 'Rinse them well, they\'ve been everywhere.')),
      cook(tr('Les faire revenir au beurre', 'Fry them in butter'), tr('Grésillement…', 'Sizzling…'), tr('Du beurre ! Plus de beurre ! Voilà.', 'Butter! More butter! There.')),
      plate(),
    ],
  },
  {
    dish: tr('Curry aux piments d\'Ochoeng', 'Ochoeng chilli curry'),
    intro: tr('Un curry d\'Ochoeng pour la table {table} ! Piments au garde-manger, tu les éminces, tu fais revenir, tu dresses.', 'An Ochoeng curry for table {table}! Chillies are in the pantry: slice them, fry them off, plate it up.'),
    color: '#d9861e',
    steps: [
      take('pantry', tr('Prendre les piments d\'Ochoeng', 'Get the Ochoeng chillies'), tr('Avec des gants. Je ne plaisante pas.', 'Wear gloves. I\'m not joking.')),
      prep(tr('Émincer les piments', 'Slice the chillies'), tr('Émincé…', 'Slicing…'), tr('Ne te frotte pas les yeux. Surtout pas les yeux.', 'Don\'t rub your eyes. Whatever you do, not your eyes.')),
      cook(tr('Faire revenir le curry', 'Fry off the curry'), tr('Ça pique…', 'It stings…'), tr('Ça pique déjà le nez ? Parfait.', 'Already stinging your nose? Perfect.')),
      plate(),
    ],
  },
  {
    dish: tr('Salade de riz de Jaroua', 'Jaroua rice salad'),
    intro: tr('Salade de riz de Jaroua, table {table} ! Riz au garde-manger, tu le cuis, tu le refroidis à la plonge, tu assaisonnes, tu dresses.', 'Jaroua rice salad, table {table}! Rice from the pantry: cook it, cool it at the sink, season it, plate it.'),
    color: '#f3eddc',
    steps: [
      take('pantry', tr('Prendre le riz de Jaroua', 'Get the Jaroua rice'), tr('Le sac bleu. Non, l\'autre bleu.', 'The blue bag. No, the other blue one.')),
      cook(tr('Cuire le riz', 'Cook the rice'), tr('Ça bout…', 'Boiling…'), tr('Al dente. Enfin, al dente pour du riz de Jaroua.', 'Al dente. Well, al dente for Jaroua rice.'), 'hiss'),
      rinse(tr('Refroidir le riz', 'Cool the rice'), tr('Bien froid. Comme le vide.', 'Nice and cold. Like the void.')),
      prep(tr('Assaisonner la salade', 'Dress the salad'), tr('Assaisonnement…', 'Seasoning…'), tr('Un filet d\'huile, une pincée de sel. Pas la salière entière !', 'A drizzle of oil, a pinch of salt. Not the whole shaker!'), 'scrub'),
      plate(),
    ],
  },
  {
    dish: tr('Omelette à l\'œuf d\'Aepyornis', 'Aepyornis egg omelette'),
    intro: tr('Une omelette d\'Aepyornis pour la table {table} ! L\'œuf est au frigo, tu le casses, tu cuis, tu dresses. Un seul œuf, hein.', 'An Aepyornis omelette for table {table}! The egg is in the fridge: crack it, cook it, plate it. Just the one egg.'),
    color: '#f0d27a',
    steps: [
      take('fridge', tr('Sortir l\'œuf d\'Aepyornis', 'Take out the Aepyornis egg'), tr('À deux mains ! Il pèse trois kilos.', 'Both hands! It weighs three kilos.')),
      prep(tr('Casser l\'œuf', 'Crack the egg'), tr('Il résiste…', 'It\'s resisting…'), tr('Plus fort. PLUS FORT. Voilà.', 'Harder. HARDER. There.')),
      cook(tr('Cuire l\'omelette', 'Cook the omelette'), tr('Cuisson…', 'Cooking…'), tr('On la retourne d\'un coup sec… Magnifique.', 'Flip it in one go… Beautiful.')),
      plate(),
    ],
  },
  {
    dish: tr('Tarte aux baies de Neritus', 'Neritus berry tart'),
    intro: tr('Une tarte aux baies de Neritus, table {table} ! Farine au garde-manger, tu étales, les baies sont au frigo, au four, et tu découpes à la passe.', 'A Neritus berry tart, table {table}! Flour from the pantry, roll it out, berries from the fridge, into the oven, and slice it at the pass.'),
    color: '#7a2a6b',
    steps: [
      take('pantry', tr('Prendre la farine et le sucre', 'Get the flour and sugar'), tr('Le sucre, pas le sel. Tout le monde se trompe une fois.', 'Sugar, not salt. Everyone gets it wrong once.')),
      prep(tr('Étaler la pâte', 'Roll out the pastry'), tr('On étale…', 'Rolling…'), tr('Plus fine. On doit pouvoir lire le journal de bord à travers.', 'Thinner. You should be able to read the ship\'s log through it.'), 'scrub'),
      take('fridge', tr('Prendre les baies de Neritus', 'Get the Neritus berries'), tr('Ne les mange pas toutes. Je les ai comptées.', 'Don\'t eat them all. I counted them.')),
      cook(tr('Enfourner la tarte', 'Put the tart in the oven'), tr('Au four…', 'Baking…'), tr('On n\'ouvre pas le four ! Jamais ! … Bon, elle est cuite.', 'Don\'t open the oven! Ever! … Right, it\'s done.'), 'hiss'),
      plate(tr('Découper la tarte', 'Slice the tart')),
    ],
  },
]

/** Ce que dit Marcel quand le plat part (`{table}` : le numéro de la table). */
const SENT = [
  tr('Marcel goûte, fronce les sourcils… « Pas mal. Pour un pilote. » Envoyé !', 'Marcel tastes it and frowns… “Not bad. For a pilot.” Sent!'),
  tr('« Ça, c\'est une assiette ! Envoyez ! » Marcel frappe la cloche de la passe.', '“Now that\'s a plate! Send it!” Marcel rings the bell at the pass.'),
  tr('Marcel essuie le bord de l\'assiette avec son torchon. « Pas de traces de doigts chez moi. » Envoyé !', 'Marcel wipes the rim of the plate with his towel. “No fingerprints in my kitchen.” Sent!'),
  tr('« Si la table {table} n\'aime pas, qu\'elle vienne me le dire en face. » Envoyé !', '“If table {table} doesn\'t like it, they can tell me to my face.” Sent!'),
]

/** Sans un geste pendant ce temps, la commande est abandonnée (la passe ne l'attend pas plus, cf. CHEF_COOK). */
const IDLE = CHEF_COOK - 3
/** Hors du mess plus longtemps que ça, la commande est abandonnée. */
const AWAY = 4
/** Le plateau repose sur les mains : un peu au-dessus de leur bout, et à peine en avant. */
const HAND_LIFT = new THREE.Vector3(0, 0.012, 0.03)
/** Temps d'un repas à table (s). */
const MEAL = 18

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]

/** Plats envoyés par ce joueur, gardés dans ce navigateur (le stockage peut manquer). */
const SERVED_KEY = 'mini-shipinteriors-plats'
function loadServed(): number {
  try {
    return Math.max(0, Number(localStorage.getItem(SERVED_KEY)) || 0)
  } catch {
    return 0
  }
}
function saveServed(n: number) {
  try {
    localStorage.setItem(SERVED_KEY, String(n))
  } catch {
    // Stockage indisponible (navigation privée) : on compte pour cette visite seulement.
  }
}

export interface KitchenHost {
  /** Le pont principal (le mess). */
  deck: Deck
  chef: Chef
  player: Player
  /** Pont où se trouve le joueur. */
  here: () => Deck
  /** Place où le joueur est installé, s'il l'est. */
  seat: () => { item: Interactable; spot: SeatSpot } | null
  /** Texte dans la boîte de dialogue. */
  show: (text: string) => void
  /** Bulle au-dessus du chef. */
  chefSays: (text: string) => void
  /** On cuisine avec le chef (à chaque étape), ou on a fini : le relais et le chef le savent. */
  cook: (on: boolean) => void
  /** Se met à l'ouvrage (cf. startWork dans main.ts) ; false si le joueur est occupé ailleurs. */
  work: (job: { at: THREE.Vector3; duration: number; label: string; sound: WorkSound; alive: () => boolean; finish: () => void }) => boolean
}

/** Commande en cours : la recette, l'étape, la table, et depuis quand rien n'a bougé. */
interface Order {
  recipe: Recipe
  step: number
  table: number
  idle: number
  away: number
}

/** Plateau porté ou posé : le menu, et s'il reste à manger. */
interface Tray {
  menu: Menu
  eaten: boolean
  /** Temps passé à table. */
  meal: number
  mesh: THREE.Group
  food: THREE.Object3D[]
}

export class Kitchen {
  /** Plats envoyés avec le chef (dans ce navigateur). */
  served = loadServed()
  private order: Order | null = null
  private tray: Tray | null = null
  /** Invites d'origine des meubles des postes, rendues à la fin de chaque étape. */
  private stations = new Map<Station, { item: Interactable; label: string; onInteract?: () => void }>()
  private readonly marker = new THREE.Sprite()
  private readonly ticket = document.getElementById('order-ticket')
  /** Assiette qui part de la passe, quelques secondes. */
  private readonly sent = new THREE.Group()
  private sentFor = 0

  constructor(private readonly host: KitchenHost) {
    const { deck } = host
    for (const [station, model] of Object.entries(STATION_MODEL) as [Station, string][]) {
      const item = deck.interactables.find((it) => it.furniture?.model === model)
      if (item) this.stations.set(station, { item, label: item.label, onInteract: item.onInteract })
    }
    this.marker.scale.setScalar(0.34)
    this.marker.renderOrder = 4
    this.marker.visible = false
    deck.group.add(this.marker)

    // Le rail : prendre une commande (ou se faire rappeler la sienne).
    const rail = this.stations.get('passe')
    if (rail) rail.item.onInteract = () => this.takeOrder()
    // Le début du self : prendre un plateau ; le retour : le rendre ; le tableau : le menu du jour.
    for (const it of deck.interactables) {
      if (it.furniture?.model === 'tray-stack') it.onInteract = () => this.takeTray()
      else if (it.furniture?.model === 'tray-return') it.onInteract = () => this.returnTray()
      else if (it.furniture?.model === 'menu-board') it.text = () => menuText(menuOf())
    }

    // L'assiette qui part de la passe : sur l'étagère chauffante, au-dessus du rail.
    const plateMat = new THREE.MeshLambertMaterial({ color: '#f2f0ea' })
    this.sent.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.055, 0.015, 16), plateMat))
    const food = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.03, 12), new THREE.MeshLambertMaterial({ color: '#9a4a24' }))
    food.position.y = 0.02
    food.name = 'food'
    this.sent.add(food)
    this.sent.position.set(11.5, 0.68, 10.02)
    this.sent.visible = false
    deck.group.add(this.sent)
  }

  /** Une commande est en cours. */
  get cooking(): boolean {
    return this.order !== null
  }

  /** Ce que Marcel répond si on lui parle pendant une commande (null : il bavarde comme d'habitude). */
  reminder(): string | null {
    const o = this.order
    if (!o) return null
    const step = o.recipe.steps[o.step]
    return pick([
      tr(`${step.verb}, ${WHERE[step.at]}. Allez, la table ${o.table} attend !`, `${step.verb}, ${WHERE[step.at]}. Come on, table ${o.table} is waiting!`),
      tr(`Tu discutes ou tu cuisines ? ${WHERE[step.at][0].toUpperCase()}${WHERE[step.at].slice(1)} !`, `Are you chatting or cooking? ${WHERE[step.at][0].toUpperCase()}${WHERE[step.at].slice(1)}!`),
    ])
  }

  // ------------------------------------------------------------ commandes

  private takeOrder() {
    const { host } = this
    if (this.order) {
      const step = this.order.recipe.steps[this.order.step]
      if (step.at === 'passe') return this.doStep()
      return host.show(tr(`${CHEF} : « ${this.reminder()} »`, `${CHEF}: “${this.reminder()}”`))
    }
    if (this.tray) return host.show(tr('Posez d\'abord votre plateau : on ne cuisine pas un plateau à la main.', 'Put your tray down first: no cooking with a tray in your hands.'))
    const recipe = pick(RECIPES)
    const table = 1 + Math.floor(Math.random() * 2)
    this.order = { recipe, step: 0, table, idle: 0, away: 0 }
    host.cook(true)
    const intro = recipe.intro.replace('{table}', String(table))
    const first = this.served ? '' : tr(' Passe derrière le comptoir, par le côté.', ' Come round behind the counter, by the side.')
    host.show(tr(`${CHEF} : « ${intro}${first} »`, `${CHEF}: “${intro}${first}”`))
    host.chefSays(tr('Une commande !', 'Order in!'))
    this.showStep()
  }

  /** L'étape en cours s'allume : marqueur au-dessus du poste, invite du meuble, bon à l'écran. */
  private showStep() {
    this.restoreStations()
    const o = this.order
    if (!o) {
      this.marker.visible = false
      if (this.ticket) this.ticket.hidden = true
      return
    }
    const step = o.recipe.steps[o.step]
    const station = this.stations.get(step.at)
    if (station) {
      station.item.label = step.verb
      station.item.onInteract = () => this.doStep()
      this.marker.material = markerMaterial(step.icon, '#39d0ff')
      this.marker.position.set(station.item.position.x, 1.32, station.item.position.z)
      this.marker.visible = true
    }
    this.renderTicket()
  }

  private restoreStations() {
    for (const [station, s] of this.stations) {
      s.item.label = s.label
      s.item.onInteract = station === 'passe' ? () => this.takeOrder() : s.onInteract
    }
  }

  private doStep() {
    const o = this.order
    if (!o) return
    const index = o.step
    const step = o.recipe.steps[index]
    const station = this.stations.get(step.at)
    if (!station) return
    this.host.work({
      at: station.item.position,
      duration: step.secs,
      label: step.doing,
      sound: step.sound,
      alive: () => this.order === o && o.step === index,
      finish: () => this.stepDone(o),
    })
  }

  private stepDone(o: Order) {
    if (this.order !== o) return
    const step = o.recipe.steps[o.step]
    o.step++
    o.idle = 0
    if (o.step >= o.recipe.steps.length) return this.sendDish(o)
    this.host.cook(true)
    if (step.said) this.host.chefSays(step.said)
    this.showStep()
  }

  /** L'assiette part : Marcel conclut, le compteur avance, le chef reprend sa tournée. */
  private sendDish(o: Order) {
    this.order = null
    this.served++
    saveServed(this.served)
    this.host.cook(false)
    this.showStep()
    const food = this.sent.getObjectByName('food') as THREE.Mesh
    ;(food.material as THREE.MeshLambertMaterial).color.set(o.recipe.color)
    this.sent.visible = true
    this.sentFor = 6
    const line = pick(SENT).replace('{table}', String(o.table))
    const count = this.served === 1
      ? tr('Premier plat envoyé avec Marcel.', 'First dish sent out with Marcel.')
      : tr(`${this.served} plats envoyés avec Marcel.`, `${this.served} dishes sent out with Marcel.`)
    this.host.show(`${o.recipe.dish} · ${line} ${count}`)
    this.host.chefSays(tr('Service !', 'Service!'))
  }

  /** Commande abandonnée (parti trop loin, ou trop longtemps sans rien faire). */
  private abandon(why: 'away' | 'idle') {
    if (!this.order) return
    this.order = null
    this.host.cook(false)
    this.showStep()
    this.host.chefSays(why === 'away' ? tr('Il est parti ? Bon. Je finis moi-même.', 'Gone, are they? Fine. I\'ll finish it myself.') : tr('Trop lent ! Je finis moi-même.', 'Too slow! I\'ll finish it myself.'))
  }

  /** Le bon de commande, dans le HUD : le plat, la table, les étapes (faites, en cours, à venir). */
  private renderTicket() {
    const el = this.ticket
    const o = this.order
    if (!el || !o) return
    el.replaceChildren()
    const head = document.createElement('div')
    head.className = 'ot-head'
    head.textContent = tr(`Table ${o.table}`, `Table ${o.table}`)
    const dish = document.createElement('div')
    dish.className = 'ot-dish'
    dish.textContent = o.recipe.dish
    const list = document.createElement('ol')
    list.className = 'ot-steps'
    o.recipe.steps.forEach((s, i) => {
      const li = document.createElement('li')
      li.textContent = s.verb
      li.className = i < o.step ? 'done' : i === o.step ? 'now' : ''
      // Le poste, seulement pour l'étape en cours : c'est là qu'il faut aller.
      if (i === o.step) {
        const where = document.createElement('span')
        where.className = 'ot-where'
        where.textContent = WHERE[s.at]
        li.append(where)
      }
      list.append(li)
    })
    el.append(head, dish, list)
    el.hidden = false
  }

  // ------------------------------------------------------------ plateaux

  private takeTray() {
    const { host } = this
    if (this.tray) return host.show(tr('Vous avez déjà un plateau. Un seul par personne, dit le panneau. Marcel l\'a écrit en rouge.', 'You already have a tray. One per person, says the sign. Marcel wrote it in red.'))
    if (this.order) return host.show(tr(`${CHEF} : « On mange après le service ! »`, `${CHEF}: “You eat after service!”`))
    const menu = menuOf()
    this.tray = { menu, eaten: false, meal: 0, ...trayMesh() }
    host.player.root.add(this.tray.mesh)
    this.holdTray()
    host.player.interact()
    host.show(tr(
      `Vous faites le tour du self : ${menu.starter}, ${menu.main}, ${menu.dessert} et ${menu.drink}. Il n'y a plus qu'à trouver une place.`,
      `You go down the line: ${menu.starter}, ${menu.main}, ${menu.dessert} and ${menu.drink}. Now to find a seat.`,
    ))
    if (Math.hypot(host.chef.position.x - host.player.position.x, host.chef.position.z - host.player.position.z) < 4) {
      host.chefSays(pick([tr('Bon appétit !', 'Enjoy!'), tr('Suivant !', 'Next!'), tr('On ne gaspille pas !', 'No waste!')]))
    }
  }

  private returnTray() {
    const { host } = this
    const t = this.tray
    if (!t) return host.show(tr('Retour plateaux : le tapis emporte tout vers la plonge. Enfin, en théorie.', 'Tray return: the belt carries everything to the dishwashing station. In theory.'))
    t.mesh.removeFromParent()
    host.player.avatar.carrying = false
    this.tray = null
    host.player.interact()
    host.show(t.eaten
      ? pick([
        tr('Plateau rendu. Le tapis l\'emporte avec un couinement satisfait.', 'Tray returned. The belt carries it off with a satisfied squeak.'),
        tr('Plateau rendu, assiette propre. Marcel, de loin, hoche la tête. C\'est rare.', 'Tray returned, clean plate. Marcel nods from afar. That\'s rare.'),
      ])
      : tr('Vous rendez un plateau plein. Marcel l\'a vu. Marcel voit tout.', 'You return a full tray. Marcel saw that. Marcel sees everything.'))
  }

  /** Le plateau dans les mains, devant soi : les bras se tendent pour le tenir (cf. carryTray). */
  private holdTray() {
    const t = this.tray
    if (!t) return
    this.host.player.root.add(t.mesh)
    this.host.player.avatar.carrying = true
    t.mesh.rotation.set(0, 0, 0)
    this.carryTray()
  }

  /** Le plateau porté suit les mains (qui bougent avec la marche) ; faute de mains, devant le buste. */
  private carryTray() {
    const t = this.tray
    const { player } = this.host
    if (!t || t.mesh.parent !== player.root) return
    const at = player.avatar.hands(new THREE.Vector3())
    if (at) t.mesh.position.copy(player.root.worldToLocal(at)).add(HAND_LIFT)
    else t.mesh.position.set(0, 0.3, 0.17)
  }

  /** Assis à une table de cantine : le plateau se pose devant soi, sur la table. */
  private layTray(spot: SeatSpot) {
    const t = this.tray
    if (!t) return
    this.host.deck.group.add(t.mesh)
    this.host.player.avatar.carrying = false
    t.mesh.position.set(spot.x + Math.sin(spot.yaw) * 0.42, 0.42, spot.z + Math.cos(spot.yaw) * 0.42)
    t.mesh.rotation.set(0, spot.yaw, 0)
  }

  // ------------------------------------------------------------ à chaque image

  update(dt: number) {
    const { host } = this
    // L'assiette envoyée disparaît de la passe.
    if (this.sentFor > 0) {
      this.sentFor -= dt
      if (this.sentFor <= 0) this.sent.visible = false
    }
    // Le marqueur de l'étape flotte comme ceux des tâches.
    if (this.marker.visible) this.marker.position.y = 1.32 + Math.sin(performance.now() / 450) * 0.035

    const o = this.order
    if (o) {
      const p = host.player.position
      const inMess = host.here() === host.deck && host.deck.map.room(Math.round(p.x), Math.round(p.z)) === CHEF_ROOM
      o.away = inMess ? 0 : o.away + dt
      o.idle += dt
      if (inMess) host.chef.watch(p)
      if (o.away > AWAY) this.abandon('away')
      else if (o.idle > IDLE) this.abandon('idle')
    }

    // Le plateau : posé devant soi à une table de cantine (on y mange), dans les mains sinon.
    const t = this.tray
    if (!t) return
    const seat = host.seat()
    const atTable = seat?.item.furniture?.model === 'canteen-table' && host.here() === host.deck
    if (atTable && t.mesh.parent !== host.deck.group) this.layTray(seat.spot)
    else if (!atTable && t.mesh.parent !== host.player.root) this.holdTray()
    this.carryTray()
    if (atTable && !t.eaten) {
      t.meal += dt
      if (t.meal >= MEAL) {
        t.eaten = true
        for (const f of t.food) f.visible = false
        host.show(pick([
          tr(`Plateau terminé. ${t.menu.main} : Marcel avait raison, ça a du caractère.`, `Tray finished. ${t.menu.main}: Marcel was right, it has character.`),
          tr(`Plateau terminé. Le ${t.menu.drink} vous réveillerait un Thargoïde.`, `Tray finished. The ${t.menu.drink} could wake a Thargoid.`),
          tr(`Plateau terminé. ${t.menu.dessert}… vous en reprendriez bien. Il n'y en a plus.`, `Tray finished. ${t.menu.dessert}… you\'d have seconds. There are none left.`),
        ]) + tr(' Pensez au retour plateaux.', ' Don\'t forget the tray return.'))
      }
    }
  }
}

/** Le tableau du menu, lu de près. */
function menuText(menu: Menu): string {
  return tr(
    `Menu du jour · Entrée : ${menu.starter} · Plat : ${menu.main} · Dessert : ${menu.dessert} · Boisson : ${menu.drink}.`,
    `Today's menu · Starter: ${menu.starter} · Main: ${menu.main} · Dessert: ${menu.dessert} · Drink: ${menu.drink}.`,
  )
}

/** Un plateau garni : assiette du plat, bol d'entrée, coupelle de dessert, gobelet. */
function trayMesh(): { mesh: THREE.Group; food: THREE.Object3D[] } {
  const lit = (color: string) => new THREE.MeshLambertMaterial({ color })
  const g = new THREE.Group()
  const at = (o: THREE.Mesh, x: number, y: number, z: number) => {
    o.position.set(x, y, z)
    g.add(o)
    return o
  }
  const cyl = (rt: number, rb: number, h: number, color: string, seg = 12) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), lit(color))
  at(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.014, 0.22), lit('#3a3f48')), 0, 0.007, 0)
  at(cyl(0.065, 0.055, 0.012, '#f2f0ea'), -0.05, 0.02, 0.02)
  at(cyl(0.035, 0.028, 0.03, '#f2f0ea'), 0.08, 0.029, -0.05)
  at(cyl(0.028, 0.022, 0.03, '#c9dde6'), 0.09, 0.029, 0.05)
  at(new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.004, 0.12), lit('#c6ccd4')), 0.03, 0.016, 0.03)
  const food = [
    at(cyl(0.045, 0.05, 0.025, '#9a4a24'), -0.05, 0.035, 0.02),
    at(cyl(0.03, 0.03, 0.01, '#6fb04a'), 0.08, 0.043, -0.05),
    at(cyl(0.024, 0.024, 0.01, '#7a2a6b'), 0.09, 0.041, 0.05),
  ]
  return { mesh: g, food }
}
