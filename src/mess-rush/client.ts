import * as THREE from 'three'
import { FOOD_PACK, loadPack } from '../assets'
import type { Sound } from '../audio'
import type { Avatar } from '../avatar'
import type { Deck, Interactable } from '../deck'
import { EN, tr } from '../i18n'
import type { MessCrew, MessLobby, Net, ServerMessage } from '../net'
import type { Player } from '../player'
import { INGREDIENTS, PROCESSES, RECIPES, type Text } from '../../shared/mess-rush-catalog.js'
import {
  MESS_BOUNDS, MESS_LEVEL, MESS_RETURN, RULES, STATION_BY_ID, STATION_NAMES, STATIONS, canReach, dispenserChoices, guide, ingredientState, resolveAction,
  type Guide, type Item, type ServiceState,
} from '../../shared/mess-rush.js'
import { KitchenProps, stateLabel, type PlaceOnDeck } from './props'
import { MessEndScreen, MessHud, MessPanel, type MessWeek } from './ui'

/*
 * MESS RUSH côté joueur (cf. docs/mess-rush.md) : le salon au rail des bons du mess, l'entrée dans
 * la cuisine instanciée, les postes (E : prendre ou poser ; Espace : le geste ou la cuisson du
 * poste, ou vider l'ustensile), les postes de sa zone seulement quand la cuisine est cloisonnée,
 * les flèches et la consigne du guidage, les sons de la cuisine, le bandeau du service, l'écran de
 * fin, et la reprise après une coupure (le ticket du service est gardé dans ce navigateur).
 *
 * Le relais fait autorité : on ne fait qu'envoyer ce qu'on veut faire, et l'on dessine l'état qu'il
 * renvoie. Les invites, elles, se calculent ici, avec la même fonction que l'arbitre
 * (`resolveAction`) : ce qu'elles annoncent est ce qui se passera.
 */

const text = (t: Text) => (EN ? t.en : t.fr)

/** Le milieu de la cuisine : la vue du dessus le garde au centre (cf. `focus`). */
const KITCHEN_CENTER = { x: (MESS_BOUNDS.minX + MESS_BOUNDS.maxX) / 2, z: (MESS_BOUNDS.minZ + MESS_BOUNDS.maxZ) / 2 }

/** La consigne du bandeau, d'après le guidage (cf. `guide` dans shared/mess-rush.js). */
function hintText(g: Guide | null): string {
  if (!g) return ''
  const ing = g.ing ? text(INGREDIENTS[g.ing].short) : ''
  const verb = g.process ? text(PROCESSES[g.process].verb) : ''
  switch (g.step) {
    case 'fetch': return tr(`Allez chercher : ${ing}`, `Go and get: ${ing}`)
    case 'prep':
    case 'work': return tr(`${verb} : ${ing}`, `${verb}: ${ing}`)
    case 'cook': return tr(`À cuire : ${ing}`, `To cook: ${ing}`)
    case 'start': return tr('Lancez la cuisson (Espace)', 'Start cooking (Space)')
    case 'plate': return tr(`Dans l'assiette : ${ing}`, `Onto the plate: ${ing}`)
    case 'put': return tr('Posez-le sur le comptoir', 'Put it down on the counter')
    case 'take-plate': return tr('C\'est prêt : prenez une assiette', 'It\'s ready: grab a plate')
    case 'need-plate': return tr('C\'est prêt : il faut une assiette, l\'équipe vous la passe', 'It\'s ready: you need a plate, the team will pass you one')
    case 'fill-plate': return tr('Garnissez l\'assiette', 'Fill the plate')
    case 'complete': return tr('Complétez l\'assiette', 'Finish the plate')
    case 'hold': return tr('Gardez l\'assiette : on vous la remplira bientôt', 'Keep the plate: it will be filled soon')
    case 'wait': return tr('Posez l\'assiette en attendant la suite', 'Put the plate down until the rest is ready')
    case 'deliver': return tr('À la passe !', 'To the pass!')
    case 'take-dish': return tr('Un plat est prêt : prenez-le', 'A dish is ready: pick it up')
    case 'take': return tr(`Pour vous : ${ing}`, `For you: ${ing}`)
    case 'tidy': return tr('Débarrassez le passe-plat : cette assiette vide ne sert à rien', 'Clear the pass-through: that empty plate isn\'t needed')
    case 'trash': return tr('Ce plat ne correspond à aucun bon : au recyclage', 'This dish matches no ticket: recycle it')
    case 'handoff': return tr(`Passez-le à l'équipe par le passe-plat${ing ? ` : ${ing}` : ''}`, `Hand it to the team over the pass-through${ing ? `: ${ing}` : ''}`)
  }
  return ''
}

/** Reprise refusée parce que la place est encore tenue ailleurs : nouvel essai toutes les … s. */
const RESUME_EVERY = 5

/** Le ticket du service en cours, pour revenir après une coupure (le stockage peut manquer). */
const TICKET_KEY = 'mini-shipinteriors-mess-ticket'
function loadTicket(): { game: string; ticket: string } | null {
  try {
    const t = JSON.parse(localStorage.getItem(TICKET_KEY) ?? 'null')
    return t && typeof t.game === 'string' && typeof t.ticket === 'string' ? t : null
  } catch {
    return null
  }
}
function saveTicket(t: { game: string; ticket: string } | null) {
  try {
    if (t) localStorage.setItem(TICKET_KEY, JSON.stringify(t))
    else localStorage.removeItem(TICKET_KEY)
  } catch {
    // Stockage indisponible : pas de reprise après un rechargement, c'est tout.
  }
}

/** L'endpoint de MESS RUSH sur le site (cf. docs/mess-rush-site.md) : on y lit sa semaine. */
export const MESS_URL = import.meta.env.VITE_ED_MESSRUSH_URL || '/outils/mini-shipinteriors-messrush.php'

/** La semaine du joueur (booster gagné ou non, victoires payées du jour) ; null si le site ne la donne pas. */
async function fetchWeek(): Promise<MessWeek | null> {
  try {
    const res = await fetch(`${MESS_URL}?week=1`, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const d = await res.json()
    if (d?.status !== 'success' || (d.booster !== 'available' && d.booster !== 'won')) return null
    return {
      booster: d.booster,
      ...(typeof d.reset === 'string' ? { reset: d.reset } : {}),
      ...(Number.isInteger(d.paidToday) ? { paidToday: d.paidToday } : {}),
      ...(Number.isInteger(d.daily) ? { daily: d.daily } : {}),
    }
  } catch {
    return null
  }
}

/** Ce que disent les refus du relais. */
const REFUSED: Record<string, string> = {
  far: tr('Trop loin du poste.', 'Too far from the station.'),
  busy: tr('Quelqu\'un y travaille déjà.', 'Someone is already working there.'),
  nomatch: tr('Aucune commande n\'attend ce plat.', 'No order is waiting for this dish.'),
  state: tr('Rien à faire ici pour l\'instant.', 'Nothing to do here right now.'),
  over: tr('Le service est terminé.', 'The service is over.'),
}

/** Ce que disent les erreurs du salon. */
const ERRORS: Record<string, string> = {
  lobby: tr('Restez au mess pour tenir votre place dans un salon.', 'Stay in the mess to keep your place in a lobby.'),
  full: tr('Ce salon est complet.', 'This lobby is full.'),
  playing: tr('Ce salon est en plein service.', 'This lobby is mid-service.'),
  gone: tr('Ce salon n\'existe plus.', 'This lobby no longer exists.'),
  resume: tr('Ce service n\'est plus disponible.', 'This service is no longer available.'),
  elsewhere: tr('Ce service se joue déjà dans un autre onglet.', 'This service is already being played in another tab.'),
}

export interface MessRushHost {
  net: Net
  player: Player
  sound: Sound
  /** Le pont où se trouve le joueur. */
  deck: () => Deck
  /** Le vrai mess (pont principal), où se tiennent les salons. */
  messDeck: Deck
  /** La cuisine instanciée, construite à la première entrée. */
  kitchenDeck: () => Deck
  /** Change de pont et y place le joueur (fondu, comme pour la zone thargoïde). */
  moveTo: (next: Deck, at: { x: number; z: number }) => Promise<void>
  verified: () => boolean
  /** L'avatar d'un joueur de la partie (le sien, ou celui d'un coéquipier à bord). */
  avatarOf: (id: number) => Avatar | null
  camera: () => THREE.Camera
  /** Un plat livré par le joueur : Marcel le compte (cf. kitchen.ts). */
  served: () => void
  /** Le plateau du self repart au chariot (vrai s'il y en avait un). */
  stowTray: () => boolean
  /** Le service commence pour ce joueur : les effets des cocktails de Jacques s'arrêtent (cf. src/bar.ts). */
  playing: () => void
  /** Pose un objet sur le pont de la cuisine, avec ses collisions (les cloisons, cf. Deck.addRuntime). */
  place: PlaceOnDeck
  /** Les crédits confirmés par le site arrivent au portefeuille. */
  credited: (earned: number, balance: number) => void
  /**
   * La vue de la cuisine (true) : du dessus, toute la pièce à l'écran, les postes du mur sud face à
   * la caméra, sans rotation ni zoom ; puis (false) la vue d'avant.
   */
  view: (kitchen: boolean) => void
}

interface Game {
  id: string
  you: string
  state: ServiceState
  members: MessCrew[]
  /** Écart entre l'horloge du relais et la nôtre (ms). */
  offset: number
}

export class MessRushClient {
  private phase: 'ship' | 'loading' | 'kitchen' = 'ship'
  private lobby: MessLobby = { teams: [] }
  private game: Game | null = null
  private props: KitchenProps | null = null
  /** Les postes de la cuisine, en objets qu'on vise (cf. main.ts, nearestInteractable). */
  private readonly stationItems = new Map<Interactable, string>()
  /** L'ingrédient choisi à chaque distributeur (Espace en change). */
  private readonly picks = new Map<string, string>()
  /** Le poste où l'on fait un geste actif (on l'arrête en s'éloignant). */
  private working: string | null = null
  /** Ce qu'on tenait au dernier état reçu (un son quand on prend ou pose). */
  private holding: string | null = null
  /** Les postes qu'on atteint (de sa zone), tels qu'on les a donnés à viser ; et le centre de la vue. */
  private reachKey = ''
  private readonly center = new THREE.Vector3()
  private readonly panel: MessPanel
  private readonly hud: MessHud
  private readonly end = new MessEndScreen()

  constructor(private readonly host: MessRushHost) {
    this.panel = new MessPanel({
      join: (team) => host.net.sendMess('join', { team }),
      leave: () => host.net.sendMess('leave'),
      ready: (on) => host.net.sendMess('ready', { ready: on }),
    })
    this.hud = new MessHud(() => host.net.sendMess('quit'))
  }

  get panelOpen() {
    return this.panel.isOpen
  }

  /** En cuisine, en plein service. */
  get inKitchen() {
    return this.phase === 'kitchen' && !!this.game
  }

  contains(target: EventTarget | null) {
    return this.panel.contains(target) || this.end.contains(target)
  }

  closePanel() {
    this.panel.close()
  }

  /** Le rail des bons du mess : le terminal des salons. La cuisine se prépare pendant qu'on s'y place. */
  openTerminal() {
    this.panel.update(this.lobby, this.host.net.id ?? -1, this.host.net.online)
    this.panel.open()
    void this.prepare()
    // Un CMDR : sa semaine, si le site la donne (sinon, on n'annonce aucune récompense).
    if (this.host.verified()) void fetchWeek().then((w) => this.panel.week(w))
  }

  private serverNow() {
    return Date.now() + (this.game?.offset ?? 0)
  }

  // ------------------------------------------------------------------ relais

  onMessage(m: ServerMessage) {
    switch (m.t) {
      case 'welcome':
        this.lobby = m.mess ?? { teams: [] }
        this.panel.update(this.lobby, m.id, true)
        this.resumeTries = 0
        this.askResume()
        break
      case 'mess:lobby':
        this.lobby = { teams: m.teams }
        this.panel.update(this.lobby, this.host.net.id ?? -1, this.host.net.online)
        break
      case 'mess:error':
        // Encore tenue par une autre liaison : l'ancienne, coupée sans que le relais le sache encore
        // (changement de réseau), ou un autre onglet. On réessaie le temps que la place attend.
        if (m.code === 'elsewhere' && this.resumeTries++ < RULES.reconnect / RESUME_EVERY) {
          clearTimeout(this.resumeTimer)
          this.resumeTimer = window.setTimeout(() => this.askResume(), RESUME_EVERY * 1000)
          break
        }
        if (m.code === 'resume') saveTicket(null)
        if (m.code !== 'resume') this.panel.message(ERRORS[m.code] ?? tr('Action impossible.', 'Not possible.'))
        break
      case 'mess:start':
        clearTimeout(this.resumeTimer)
        saveTicket({ game: m.game, ticket: m.ticket })
        this.game = { id: m.game, you: m.you, state: m.state, members: m.members, offset: m.now - Date.now() }
        this.holding = null
        void this.enter(m.spawn)
        break
      case 'mess:state': {
        if (m.game !== this.game?.id) return
        this.game.state = m.state
        this.game.members = m.members
        this.game.offset = m.now - Date.now()
        this.props?.sync(m.state)
        if (this.phase === 'kitchen') this.arrange()
        // Prendre, poser : un petit son, d'après ce que le relais a accepté.
        const hand = m.state.hands[this.game.you] ?? null
        if (hand !== this.holding && this.phase === 'kitchen') this.host.sound.ui(hand ? 'pick' : 'drop')
        this.holding = hand
        break
      }
      case 'mess:event':
        if (m.game === this.game?.id) for (const e of m.events) this.event(e)
        break
      case 'mess:refused':
        if (m.game === this.game?.id) this.hud.toast(REFUSED[m.code] ?? REFUSED.state, 'info')
        break
      case 'mess:left':
        if (m.game === this.game?.id) {
          saveTicket(null)
          void this.leave()
        }
        break
      case 'mess:end':
        // Le résultat de ce service (ou, au retour, celui du ticket) ; pas celui d'un autre.
        if (m.game !== this.game?.id && !m.late) break
        saveTicket(null)
        this.end.show(m, this.host.verified(), () => {})
        void this.leave()
        break
      case 'mess:reward':
        this.end.rewarded(m)
        if (m.status === 'success' && m.reward === 'credits' && !m.already && m.earned !== undefined && m.balance !== undefined) this.host.credited(m.earned, m.balance)
        break
    }
  }

  /** Revenu à bord avec le ticket d'un service : on demande à le reprendre. */
  private resumeTries = 0
  private resumeTimer = 0
  private askResume() {
    const t = loadTicket()
    if (t && this.host.net.online && !this.game) this.host.net.sendMess('resume', t)
  }

  /** Ce qui se passe en cuisine : un mot au-dessus des bons, et un son. */
  private event(e: { kind: string; by?: string; recipe?: string; points?: number; combo?: number; penalty?: number; station?: string; process?: string; wait?: number; count?: number }) {
    const me = e.by === this.game?.you
    const who = (id?: string) => this.game?.members.find((m) => m.id === id)?.name ?? '?'
    const at = (station?: string) => {
      const s = station ? STATION_BY_ID[station] : null
      return s ? new THREE.Vector3(s.x, this.host.kitchenDeck().y + 0.5, s.z) : this.host.player.position
    }
    switch (e.kind) {
      case 'served':
        this.hud.toast(`+${e.points} · ${text(RECIPES[e.recipe!].name)}${me ? '' : ` · ${who(e.by)}`}${(e.combo ?? 0) > 1 ? ` · combo ×${e.combo}` : ''}`, 'good')
        this.host.sound.play('ding', at('passe'), { volume: 0.5 })
        this.host.sound.credits((e.combo ?? 0) > 2)
        if (me) this.host.served()
        break
      case 'expired':
        this.hud.toast(tr(`Commande expirée : ${text(RECIPES[e.recipe!].name)} (−${e.penalty})`, `Order expired: ${text(RECIPES[e.recipe!].name)} (−${e.penalty})`), 'bad')
        this.host.sound.kitchen('expired', null)
        break
      case 'cleared':
        this.hud.toast(tr(`Ce qu'on préparait pour ce bon part au recyclage (${e.count}).`, `What was being made for that ticket goes to recycling (${e.count}).`), 'info')
        break
      case 'order':
        this.hud.toast(tr(`Nouveau bon : ${text(RECIPES[e.recipe!].name)}`, `New ticket: ${text(RECIPES[e.recipe!].name)}`), 'info')
        this.host.sound.kitchen('order', null)
        break
      case 'prepared':
        if (me) {
          this.working = null
          this.host.sound.kitchen('ready', at(e.station))
        }
        break
      case 'cooked':
        // La sonnette : c'est prêt (et le grésillement de la fin de cuisson).
        this.host.sound.work('sizzle', at(e.station))
        this.host.sound.kitchen('bell', at(e.station))
        break
      case 'wasted':
        if (me) {
          this.hud.toast(tr('Au recyclage.', 'Recycled.'), 'info')
          this.host.sound.kitchen('trash', this.host.player.position)
        }
        break
      case 'emptied':
        if (me) this.hud.toast(tr('Vidé : c\'est perdu.', 'Emptied: it\'s lost.'), 'info')
        this.host.sound.kitchen('trash', at(e.station))
        break
      case 'open':
        this.hud.toast(tr('Un cuisinier est parti : les cloisons tombent, toute la cuisine est à vous.', 'A cook has left: the partitions come down, the whole kitchen is yours.'), 'info')
        break
      case 'away':
        this.hud.toast(tr(`${who(e.by)} a perdu la liaison : sa place l'attend une minute.`, `${who(e.by)} lost the link: their place waits a minute.`), 'info')
        break
      case 'back':
        this.hud.toast(tr(`${who(e.by)} est de retour en cuisine.`, `${who(e.by)} is back in the kitchen.`), 'info')
        break
      case 'left':
      case 'gone':
        if (!me) this.hud.toast(tr(`${who(e.by)} a quitté le service.`, `${who(e.by)} left the service.`), 'info')
        break
    }
  }

  // ------------------------------------------------------------------ entrer, sortir

  /**
   * La cuisine, prête à servir : le Food Kit, la pièce et ses postes. Une seule fois ; on s'y prend
   * dès l'ouverture du salon, pour que le départ ne fasse pas attendre (le relais ne garde la place
   * d'un joueur pas encore arrivé que RULES.arrival secondes).
   */
  private ready: Promise<KitchenProps> | null = null
  private prepare(): Promise<KitchenProps> {
    // Raté (réseau), le Food Kit se redemandera à la prochaine occasion.
    this.ready ??= loadPack(FOOD_PACK).then(() => {
      const kitchen = this.host.kitchenDeck()
      this.bindStations(kitchen)
      this.props = new KitchenProps(kitchen.group, this.host.place)
      return this.props
    }, (e) => {
      this.ready = null
      throw e
    })
    return this.ready
  }

  /** Entrée dans la cuisine, puis le fondu ; abandonnée si le service a changé entre-temps. */
  private async enter(spawn: { x: number; z: number }) {
    const id = this.game?.id
    this.phase = 'loading'
    this.panel.close()
    this.end.close()
    const props = await this.prepare().catch(() => null)
    if (!this.game || this.game.id !== id) return
    if (!props) {
      // La cuisine n'a pas pu se charger : on rend sa place à l'équipe plutôt que de la faire attendre.
      this.host.net.sendMess('quit')
      saveTicket(null)
      this.game = null
      this.phase = 'ship'
      this.panel.open()
      this.panel.message(tr('La cuisine n\'a pas pu se charger (réseau). Réessayez dans un instant.', 'The kitchen could not load (network). Try again in a moment.'))
      return
    }
    // Un retour au mess encore en cours (coupure, puis reprise aussitôt) : on le laisse finir.
    if (this.leavingMove) {
      await this.leavingMove
      if (!this.game || this.game.id !== id) return
    }
    props.sync(this.game.state)
    this.reachKey = ''
    this.arrange()
    // En cuisine, on a les mains libres : le plateau du self repart au chariot.
    const stowed = this.host.stowTray()
    this.host.playing()
    const kitchen = this.host.kitchenDeck()
    await this.host.moveTo(kitchen, spawn)
    if (!this.game || this.game.id !== id) {
      // Fini pendant le trajet : leave() ramène au mess s'il nous a trouvés en cuisine ; sinon, c'est
      // ici (sauf si un autre service nous y attend déjà).
      if (!this.game && !this.leavingMove && this.host.deck() === kitchen) await this.host.moveTo(this.host.messDeck, MESS_RETURN)
      return
    }
    this.phase = 'kitchen'
    this.host.view(true)
    this.hud.show()
    if (stowed) this.hud.toast(tr('Marcel reprend votre plateau : en cuisine, on a les mains libres.', 'Marcel takes your tray: in the kitchen, you need your hands free.'), 'info')
  }

  /**
   * Les postes de la cuisine : un objet à viser par poste (E, et l'invite). Ils ne deviennent
   * visables qu'en service, et seulement ceux de sa zone (cf. arrange).
   */
  private bindStations(kitchen: Deck) {
    for (const s of STATIONS) {
      const object = new THREE.Object3D()
      object.position.set(s.x, 0.5, s.z)
      kitchen.group.add(object)
      const it: Interactable = { object, position: new THREE.Vector3(s.x, 0, s.z), label: text(STATION_NAMES[s.kind]), onInteract: () => this.use(s.id) }
      this.stationItems.set(it, s.id)
    }
  }

  /**
   * Le plan de la cuisine a pu changer (début du service, cloisons tombées) : les cloisons et les
   * repères, et les postes qu'on vise, ceux qu'on atteint de sa zone.
   */
  private arrange() {
    if (!this.game) return
    const { state, you } = this.game
    this.props?.layout(state, you)
    const reach = [...this.stationItems].filter(([, id]) => canReach(state, you, id))
    const key = reach.map(([, id]) => id).join(',')
    if (key === this.reachKey) return
    this.reachKey = key
    const list = this.host.kitchenDeck().interactables
    for (let i = list.length - 1; i >= 0; i--) if (this.stationItems.has(list[i])) list.splice(i, 1)
    list.push(...reach.map(([it]) => it))
  }

  /** La vue du dessus garde la cuisine au centre (null : hors de la cuisine). */
  get focus(): THREE.Vector3 | null {
    if (!this.inKitchen) return null
    return this.center.set(KITCHEN_CENTER.x, this.host.kitchenDeck().y, KITCHEN_CENTER.z)
  }

  /** Retour au vrai mess (fin du service, abandon, coupure). */
  private async leave() {
    const wasIn = this.phase !== 'ship'
    this.phase = 'ship'
    this.working = null
    this.hud.hide()
    this.props?.release((pid) => this.avatar(pid))
    this.game = null
    this.holding = null
    // Plus de poste à viser au mess d'à côté : la cuisine attend le prochain service.
    if (this.reachKey) {
      const list = this.host.kitchenDeck().interactables
      for (let i = list.length - 1; i >= 0; i--) if (this.stationItems.has(list[i])) list.splice(i, 1)
      this.reachKey = ''
    }
    if (wasIn) this.host.view(false)
    if (wasIn && this.host.deck() === this.host.kitchenDeck()) {
      this.leavingMove = this.host.moveTo(this.host.messDeck, MESS_RETURN).finally(() => (this.leavingMove = null))
      await this.leavingMove
    }
  }

  /** Le retour au mess de leave(), tant qu'il est en cours. */
  private leavingMove: Promise<void> | null = null

  /** Liaison perdue : on rentre au mess (le ticket permettra de revenir). */
  disconnected() {
    clearTimeout(this.resumeTimer)
    this.panel.update(this.lobby, -1, false)
    if (this.phase !== 'ship') void this.leave()
  }

  private avatar(pid: string): Avatar | null {
    return this.host.avatarOf(Number(pid))
  }

  // ------------------------------------------------------------------ les postes

  /** E à un poste : prendre ou poser (le relais arbitre). */
  use(stationId: string) {
    if (!this.inKitchen) return
    this.working = null
    this.host.net.sendMess('use', { station: stationId, pick: this.picks.get(stationId) })
  }

  /**
   * Le poste visé, à portée de main et de sa zone : celui qu'on regarde, comme dans Overcooked.
   * Sans cela, devant une poêle, on visait le passe-plat ou le bac de la cloison voisine, plus près.
   * Un poste de côté compte jusqu'à deux fois sa distance, un poste dans le dos trois fois.
   */
  private nearestStation(): string | null {
    const p = this.host.player.position
    const yaw = this.host.player.heading
    const fx = Math.sin(yaw), fz = Math.cos(yaw)
    let best: string | null = null
    let bestScore = Infinity
    for (const s of STATIONS) {
      if (!this.game || !canReach(this.game.state, this.game.you, s.id)) continue
      const dx = s.x - p.x, dz = s.z - p.z
      const d = Math.hypot(dx, dz)
      if (d > 1.45) continue
      const facing = d > 1e-3 ? (dx * fx + dz * fz) / d : 1
      const score = d * (2 - facing)
      if (score < bestScore) {
        best = s.id
        bestScore = score
      }
    }
    return best
  }

  /** En cuisine, ce que vise E : le poste qu'on regarde (cf. nearestStation) ; null, aucun. */
  target(): Interactable | null {
    if (!this.inKitchen) return null
    const id = this.nearestStation()
    for (const [it, sid] of this.stationItems) if (sid === id) return it
    return null
  }

  /** Espace en cuisine : le geste ou la cuisson du poste, ou changer d'ingrédient au distributeur. */
  work(): boolean {
    if (!this.inKitchen || !this.game) return false
    const station = this.nearestStation()
    if (!station) return true
    const { work } = resolveAction(this.game.state, this.game.you, station, this.picks.get(station))
    if (!work) return true
    if (work.kind === 'cycle') {
      const choices = dispenserChoices(this.game.state, station)
      const now = choices.indexOf(this.picks.get(station) ?? choices[0])
      this.picks.set(station, choices[(now + 1) % choices.length])
      return true
    }
    if (work.busy) {
      this.hud.toast(REFUSED.busy, 'info')
      return true
    }
    if (work.kind === 'process') {
      this.working = station
      this.host.sound.work(work.process === 'rincer' ? 'water' : 'chop', this.host.player.position)
    }
    // Vider un ustensile en cuisson : un second appui confirme (on ne jette pas une marmite par mégarde).
    if (work.kind === 'empty') {
      if (this.emptyArmed?.station !== station || performance.now() > this.emptyArmed.until) {
        this.emptyArmed = { station, until: performance.now() + 2500 }
        this.hud.toast(tr('Espace encore une fois pour vider (c\'est perdu).', 'Space once more to empty it (it\'s lost).'), 'info')
        return true
      }
      this.emptyArmed = null
    }
    this.host.net.sendMess('work', { station })
    return true
  }

  /** Vider : le poste où l'on a appuyé une première fois, et jusqu'à quand le second appui vaut. */
  private emptyArmed: { station: string; until: number } | null = null

  /** Clavier : Espace en cuisine. */
  keyDown(e: KeyboardEvent): boolean {
    if (!this.inKitchen || e.code !== 'Space') return false
    e.preventDefault()
    if (!e.repeat) this.work()
    return true
  }

  /** L'invite d'un poste visé : ce que font E et Espace (null : ce n'est pas un poste). */
  prompt(it: Interactable): { main: string; space?: string } | null {
    const station = this.stationItems.get(it)
    if (!station || !this.inKitchen || !this.game) return null
    const state = this.game.state
    const pick = this.picks.get(station)
    const { use, work } = resolveAction(state, this.game.you, station, pick)
    const kind = STATION_BY_ID[station].kind
    const slot = state.stations[station] as { item?: string | null } | undefined
    const held = state.hands[this.game.you] ? state.items[state.hands[this.game.you]!] : null
    const name = (item: Item | null | undefined) => (item ? itemName(item) : '')
    let main = text(STATION_NAMES[kind])
    if (use) {
      switch (use.kind) {
        case 'take-ingredient': main = tr(`Prendre : ${text(INGREDIENTS[use.ing!].short)}`, `Take: ${text(INGREDIENTS[use.ing!].short)}`); break
        case 'take-plate': main = tr('Prendre une assiette', 'Take a plate'); break
        case 'take': main = tr(`Prendre : ${name(slot?.item ? state.items[slot.item] : null)}`, `Take: ${name(slot?.item ? state.items[slot.item] : null)}`); break
        case 'take-back': {
          const s = state.stations[station] as { item?: string | null; items?: string[] }
          const last = s.items ? s.items[s.items.length - 1] : s.item
          main = tr(`Reprendre : ${name(last ? state.items[last] : null)}`, `Take back: ${name(last ? state.items[last] : null)}`)
          break
        }
        case 'put': main = tr(`Poser : ${name(held)}`, `Put down: ${name(held)}`); break
        case 'plate-pick': main = tr(`Dresser : ${name(slot?.item ? state.items[slot.item] : null)}`, `Plate: ${name(slot?.item ? state.items[slot.item] : null)}`); break
        case 'plate-add': main = tr('Mettre dans l\'assiette', 'Put on the plate'); break
        case 'fill': main = kind === 'pot' ? tr('Mettre dans la marmite', 'Put in the stockpot') : kind === 'pan' ? tr('Mettre dans la poêle', 'Put in the pan') : tr('Mettre à infuser', 'Put on to brew'); break
        case 'serve-utensil': main = tr('Servir dans l\'assiette', 'Serve onto the plate'); break
        case 'deliver': main = use.order ? tr(`Livrer : ${text(RECIPES[state.orders.find((o) => o.id === use.order)!.recipe].name)}`, `Deliver: ${text(RECIPES[state.orders.find((o) => o.id === use.order)!.recipe].name)}`) : tr('Aucune commande pour ce plat', 'No order for this dish'); break
        case 'trash': main = tr(`Jeter : ${name(held)}`, `Throw away: ${name(held)}`); break
      }
    }
    let space: string | undefined
    if (work) {
      if (work.kind === 'cycle') space = tr('Autre ingrédient', 'Other ingredient')
      else if (work.kind === 'empty') space = tr('Vider', 'Empty')
      else if (work.busy) space = tr('Occupé', 'Busy')
      else space = text(PROCESSES[work.process!].verb)
    }
    return { main, space }
  }

  // ------------------------------------------------------------------ à chaque image

  update() {
    if (!this.game || this.phase !== 'kitchen') return
    const now = this.serverNow()
    const { state, members, you } = this.game
    // Le guidage : les flèches au-dessus des postes utiles, et la consigne du bandeau.
    const next = guide(state, you)
    this.props?.aim(next?.stations ?? [])
    this.hud.hint(hintText(next))
    this.props?.update(state, now, (pid) => this.avatar(pid), this.host.camera())
    this.hud.update(state, now)
    this.hud.team(members.filter((m) => m.status !== 'left' && m.status !== 'gone').map((m) => {
      const id = state.hands[m.id]
      return { name: m.name, me: m.id === you, holding: id && state.items[id] ? itemName(state.items[id]) : '', away: m.status === 'away' }
    }))
    // Un geste actif s'arrête quand on s'éloigne du poste (le relais le constate aussi).
    if (this.working) {
      const s = STATION_BY_ID[this.working]
      const p = this.host.player.position
      if (Math.hypot(p.x - s.x, p.z - s.z) > 1.6) {
        this.working = null
        this.host.net.sendMess('stop')
      }
    }
  }

  /** Un joueur de la partie, vu d'ici (coéquipier en cuisine). */
  sees(id: number): boolean {
    return this.phase === 'kitchen' && !!this.game?.members.some((m) => m.id === String(id) && (m.status === 'in' || m.status === 'arriving'))
  }

  /** Le pont de la cuisine (pour situer les autres joueurs). */
  static readonly LEVEL = MESS_LEVEL
}

/** Le nom d'un objet de la partie : « Lapin coupé », « Assiette (Escargots cuits) », « Tasse de café ». */
export function itemName(item: Item): string {
  if (item.kind === 'cup') return tr(`Tasse de ${text(INGREDIENTS[item.contents![0][0]].short).toLowerCase()}`, `Cup of ${text(INGREDIENTS[item.contents![0][0]].short).toLowerCase()}`)
  if (item.kind === 'plate') {
    const parts = (item.contents ?? []).map(([ing, state]) => {
      const s = stateLabel(ing, state)
      return s ? `${text(INGREDIENTS[ing].short)} ${s}` : text(INGREDIENTS[ing].short)
    })
    return parts.length ? tr(`Assiette (${parts.join(', ')})`, `Plate (${parts.join(', ')})`) : tr('Assiette vide', 'Empty plate')
  }
  const s = stateLabel(item.ing!, ingredientState(item))
  return s ? `${text(INGREDIENTS[item.ing!].short)} ${s}` : text(INGREDIENTS[item.ing!].short)
}
