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
  MESS_LEVEL, MESS_RETURN, STATION_BY_ID, STATION_NAMES, STATIONS, dispenserChoices, ingredientState, resolveAction, type Item, type ServiceState,
} from '../../shared/mess-rush.js'
import { KitchenProps, stateLabel } from './props'
import { MessEndScreen, MessHud, MessPanel } from './ui'

/*
 * MESS RUSH côté joueur (cf. docs/mess-rush.md) : le salon au rail des bons du mess, l'entrée dans
 * la cuisine instanciée, les postes (E : prendre ou poser ; Espace : le geste ou la cuisson du
 * poste), le bandeau du service, l'écran de fin, et la reprise après une coupure (le ticket du
 * service est gardé dans ce navigateur).
 *
 * Le relais fait autorité : on ne fait qu'envoyer ce qu'on veut faire, et l'on dessine l'état qu'il
 * renvoie. Les invites, elles, se calculent ici, avec la même fonction que l'arbitre
 * (`resolveAction`) : ce qu'elles annoncent est ce qui se passera.
 */

const text = (t: Text) => (EN ? t.en : t.fr)

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
  /** Les crédits confirmés par le site arrivent au portefeuille. */
  credited: (earned: number, balance: number) => void
  /**
   * La vue de la cuisine (true) : depuis le nord-est, les postes du mur sud face à la caméra ; puis
   * (false) la vue d'avant.
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
        this.askResume()
        break
      case 'mess:lobby':
        this.lobby = { teams: m.teams }
        this.panel.update(this.lobby, this.host.net.id ?? -1, this.host.net.online)
        break
      case 'mess:error':
        if (m.code === 'resume' || m.code === 'elsewhere') saveTicket(null)
        if (m.code !== 'resume') this.panel.message(ERRORS[m.code] ?? tr('Action impossible.', 'Not possible.'))
        break
      case 'mess:start':
        saveTicket({ game: m.game, ticket: m.ticket })
        this.game = { id: m.game, you: m.you, state: m.state, members: m.members, offset: m.now - Date.now() }
        void this.enter(m.spawn)
        break
      case 'mess:state':
        if (m.game !== this.game?.id) return
        this.game.state = m.state
        this.game.members = m.members
        this.game.offset = m.now - Date.now()
        this.props?.sync(m.state)
        break
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
        saveTicket(null)
        this.end.show(m, this.host.verified(), () => {})
        if (m.game === this.game?.id || m.late) void this.leave()
        break
      case 'mess:reward':
        this.end.rewarded(m)
        if (m.reward === 'credits' && m.earned !== undefined && m.balance !== undefined) this.host.credited(m.earned, m.balance)
        break
    }
  }

  /** Revenu à bord avec le ticket d'un service : on demande à le reprendre. */
  private askResume() {
    const t = loadTicket()
    if (t) this.host.net.sendMess('resume', t)
  }

  /** Ce qui se passe en cuisine : un mot au-dessus des bons, et un son. */
  private event(e: { kind: string; by?: string; recipe?: string; points?: number; combo?: number; penalty?: number; station?: string; process?: string; wait?: number }) {
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
        if (me) this.host.served()
        break
      case 'expired':
        this.hud.toast(tr(`Commande expirée : ${text(RECIPES[e.recipe!].name)} (−${e.penalty})`, `Order expired: ${text(RECIPES[e.recipe!].name)} (−${e.penalty})`), 'bad')
        break
      case 'order':
        this.hud.toast(tr(`Nouveau bon : ${text(RECIPES[e.recipe!].name)}`, `New ticket: ${text(RECIPES[e.recipe!].name)}`), 'info')
        break
      case 'prepared':
        if (me) this.working = null
        break
      case 'cooked':
        this.host.sound.work('sizzle', at(e.station))
        break
      case 'wasted':
        if (me) this.hud.toast(tr('Au recyclage.', 'Recycled.'), 'info')
        break
      case 'away':
        this.hud.toast(tr(`${who(e.by)} a perdu la liaison : sa place l'attend une minute.`, `${who(e.by)} lost the link: their place waits a minute.`), 'info')
        break
      case 'back':
        this.hud.toast(tr(`${who(e.by)} est revenu en cuisine.`, `${who(e.by)} is back in the kitchen.`), 'info')
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
    this.ready ??= loadPack(FOOD_PACK).then(() => {
      const kitchen = this.host.kitchenDeck()
      this.bindStations(kitchen)
      this.props = new KitchenProps(kitchen.group)
      return this.props
    })
    return this.ready
  }

  /** Entrée dans la cuisine, puis le fondu ; abandonnée si le service a changé entre-temps. */
  private async enter(spawn: { x: number; z: number }) {
    const id = this.game?.id
    this.phase = 'loading'
    this.panel.close()
    this.end.close()
    const props = await this.prepare()
    if (!this.game || this.game.id !== id) return
    props.sync(this.game.state)
    const kitchen = this.host.kitchenDeck()
    await this.host.moveTo(kitchen, spawn)
    if (!this.game || this.game.id !== id) {
      if (this.host.deck() === kitchen) await this.host.moveTo(this.host.messDeck, MESS_RETURN)
      return
    }
    this.phase = 'kitchen'
    this.host.view(true)
    this.hud.show()
  }

  /** Les postes de la cuisine : un objet à viser par poste (E, et l'invite). */
  private bindStations(kitchen: Deck) {
    for (const s of STATIONS) {
      const object = new THREE.Object3D()
      object.position.set(s.x, 0.5, s.z)
      kitchen.group.add(object)
      const it: Interactable = { object, position: new THREE.Vector3(s.x, 0, s.z), label: text(STATION_NAMES[s.kind]), onInteract: () => this.use(s.id) }
      kitchen.interactables.push(it)
      this.stationItems.set(it, s.id)
    }
  }

  /** Retour au vrai mess (fin du service, abandon, coupure). */
  private async leave() {
    const wasIn = this.phase !== 'ship'
    this.phase = 'ship'
    this.working = null
    this.hud.hide()
    this.props?.release((pid) => this.avatar(pid))
    this.game = null
    if (wasIn) this.host.view(false)
    if (wasIn && this.host.deck() === this.host.kitchenDeck()) await this.host.moveTo(this.host.messDeck, MESS_RETURN)
  }

  /** Liaison perdue : on rentre au mess (le ticket permettra de revenir). */
  disconnected() {
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

  /** Le poste le plus proche, à portée de main (le même que vise E). */
  private nearestStation(): string | null {
    const p = this.host.player.position
    let best: string | null = null
    let bestD = 1.45
    for (const s of STATIONS) {
      const d = Math.hypot(p.x - s.x, p.z - s.z)
      if (d < bestD) {
        best = s.id
        bestD = d
      }
    }
    return best
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
    this.host.net.sendMess('work', { station })
    return true
  }

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
