import * as THREE from 'three'
import { FOOD_PACK, loadPack } from '../assets'
import type { Sound } from '../audio'
import type { Avatar } from '../avatar'
import type { Deck, Interactable } from '../deck'
import { EN, tr } from '../i18n'
import type { MessCrew, MessLobby, Net, ServerMessage } from '../net'
import type { Player } from '../player'
import { GUESTS, INGREDIENTS, RECIPES, type Text } from '../../shared/mess-rush-catalog.js'
import {
  MESS_BOUNDS, MESS_LEVEL, MESS_RETURN, RULES, STATION_BY_ID, STATION_NAMES, STATIONS, ingredientState, resolveAction,
  type Action, type Item, type ServiceState, type UtensilState,
} from '../../shared/mess-rush.js'
import { KitchenProps, stateLabel } from './props'
import { MessQueue } from './queue'
import { MessEndScreen, MessHud, MessPanel, type MessWeek } from './ui'

/*
 * MESS RUSH côté joueur (cf. docs/mess-rush.md) : le salon au rail des bons du mess, l'entrée dans
 * la cuisine instanciée, les postes (une seule touche, E ou Espace, comme dans Overcooked : elle fait
 * ce qu'il y a à faire au poste qu'on regarde, selon ce qu'on tient), la file des clients, les sons
 * de la cuisine, le bandeau du service (les bons et leur recette : c'est aux joueurs de s'organiser,
 * rien ne leur dit quoi faire), l'écran de fin, et la reprise après une coupure (le ticket du service
 * est gardé dans ce navigateur).
 *
 * Le relais fait autorité : on ne fait qu'envoyer ce qu'on veut faire, et l'on dessine l'état qu'il
 * renvoie. Les invites, elles, se calculent ici, avec la même fonction que l'arbitre
 * (`resolveAction`) : ce qu'elles annoncent est ce qui se passera.
 */

const text = (t: Text) => (EN ? t.en : t.fr)

/** Le milieu de la pièce, file des clients comprise : la vue du dessus s'y tient, fixe (cf. `focus`). */
const KITCHEN_CENTER = { x: (MESS_BOUNDS.minX + MESS_BOUNDS.maxX) / 2, z: (MESS_BOUNDS.minZ + MESS_BOUNDS.maxZ) / 2 }

/** L'invite de la touche, d'après ce qu'elle fera (cf. resolveAction). */
function actionLabel(a: Action, held: string, slot: string): string {
  switch (a.kind) {
    case 'take-ingredient': return tr(`Prendre : ${text(INGREDIENTS[a.ing!].short)}`, `Take: ${text(INGREDIENTS[a.ing!].short)}`)
    case 'work': return a.busy ? tr('Occupé', 'Busy') : tr('Couper', 'Chop')
    case 'wash': return a.busy ? tr('Occupé', 'Busy') : tr('Laver', 'Wash')
    case 'clean': return a.busy ? tr('Occupé', 'Busy') : tr('Nettoyer', 'Clean')
    case 'shoo': return tr('Chasser Moustache', 'Shoo Moustache')
    case 'extinguish': return a.busy ? tr('Occupé', 'Busy') : tr('Éteindre le feu', 'Put out the fire')
    case 'take': return tr(`Prendre : ${slot}`, `Take: ${slot}`)
    case 'put': return tr(`Poser : ${held}`, `Put down: ${held}`)
    case 'plate-pick':
    case 'plate-add': return tr('Dans l\'assiette', 'Onto the plate')
    case 'merge': return tr('Réunir les assiettes', 'Merge the plates')
    case 'stack': return tr('Empiler', 'Stack')
    case 'fill': return tr(`Mettre au feu : ${held}`, `Put on the heat: ${held}`)
    case 'serve': return tr('Servir dans l\'assiette', 'Serve onto the plate')
    case 'empty': return tr('Vider (brûlé)', 'Empty (burnt)')
    case 'take-plate': return tr('Prendre une assiette', 'Take a plate')
    case 'take-dirty': return tr('Prendre la vaisselle sale', 'Take the dirty plates')
    case 'put-dirty': return tr('Mettre à la plonge', 'Put in the sink')
    case 'deliver': return a.order ? tr('Servir !', 'Serve!') : tr('Aucun bon pour ce plat', 'No ticket for this dish')
    case 'trash': return tr(`Jeter : ${held}`, `Throw away: ${held}`)
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
  busy: tr('Quelqu\'un y travaille déjà.', 'Someone is already working there.'),
  nomatch: tr('Aucune commande n\'attend ce plat.', 'No order is waiting for this dish.'),
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
  /** Prépare les shaders de la cuisine (au salon, pendant qu'on attend), cf. renderer.compileAsync. */
  warm: () => void
  /** Les crédits confirmés par le site arrivent au portefeuille. */
  credited: (earned: number, balance: number) => void
  /**
   * La vue de la cuisine (true) : du dessus, toute la pièce à l'écran, les postes du mur sud face à
   * la caméra, sans rotation ni zoom ; puis (false) la vue d'avant.
   */
  view: (kitchen: boolean) => void
  /** La musique du service (cf. music.ts) : de l'arrivée en cuisine à la fin du service. */
  music: (on: boolean) => void
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
  /** Les clients, dans la file derrière le comptoir de service. */
  private queue: MessQueue | null = null
  /** Les postes de la cuisine, en objets qu'on vise (cf. main.ts, nearestInteractable). */
  private readonly stationItems = new Map<Interactable, string>()
  /** Le poste où l'on fait un geste actif (on l'arrête en s'éloignant). */
  private working: string | null = null
  /** Ce qu'on tenait au dernier état reçu (un son quand on prend ou pose). */
  private holding: string | null = null
  /** Le centre de la vue. */
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
        // Seuls les refus qui apprennent quelque chose (le reste se lit dans l'invite) : pas de bruit pour rien.
        if (m.game === this.game?.id && (m.code === 'nomatch' || m.code === 'over')) this.hud.toast(REFUSED[m.code], 'info')
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

  /** Ce qui se passe en cuisine : un son, et un mot discret dans le coin pour l'essentiel (servi, raté, mangé, l'équipe). */
  private event(e: { kind: string; by?: string; recipe?: string; points?: number; combo?: number; penalty?: number; station?: string; process?: string; wait?: number; count?: number; event?: string; guest?: string; ing?: string }) {
    // Le plat d'un bon, à sa couleur.
    const dish = e.recipe ? RECIPES[e.recipe] : null
    const me = e.by === this.game?.you
    const who = (id?: string) => this.game?.members.find((m) => m.id === id)?.name ?? '?'
    const at = (station?: string) => {
      const s = station ? STATION_BY_ID[station] : null
      return s ? new THREE.Vector3(s.x, this.host.kitchenDeck().y + 0.5, s.z) : this.host.player.position
    }
    switch (e.kind) {
      case 'served':
        this.hud.toast(`+${e.points} · ${e.guest ? tr(`servi : ${GUESTS[e.guest].name}`, `served: ${GUESTS[e.guest].name}`) : text(dish!.name)}${(e.combo ?? 0) > 1 ? ` · ×${e.combo}` : ''}`, 'good', dish!.color)
        this.host.sound.play('ding', this.host.player.position, { volume: 0.5 })
        this.host.sound.credits((e.combo ?? 0) > 2)
        if (me) this.host.served()
        break
      case 'expired':
        this.hud.toast(`−${e.penalty} · ${text(dish!.name)}`, 'bad', dish!.color)
        this.host.sound.kitchen('expired', null)
        break
      case 'order':
        // Un visiteur de marque : on l'annonce (son bon, à part, en dit plus).
        if (e.guest) this.hud.toast(tr(`${GUESTS[e.guest].name} vient manger au mess !`, `${GUESTS[e.guest].name} is coming to eat!`), 'info', GUESTS[e.guest].color)
        this.host.sound.kitchen(e.guest ? 'bell' : 'order', null)
        break
      case 'prepared':
        if (me) {
          this.working = null
          this.host.sound.kitchen('ready', at(e.station))
        }
        break
      case 'cooking':
        this.host.sound.work('sizzle', at(e.station))
        break
      case 'cooked':
        // La sonnette : c'est prêt.
        this.host.sound.kitchen('bell', at(e.station))
        break
      case 'burnt':
        this.host.sound.kitchen('expired', at(e.station))
        this.host.sound.work('hiss', at(e.station))
        break
      case 'washed':
        if (me) this.host.sound.work('water', at(e.station))
        break
      case 'dirty':
        this.host.sound.kitchen('trash', at(e.station))
        break
      case 'wasted':
        if (me) this.host.sound.kitchen('trash', this.host.player.position)
        break
      case 'merged':
        // Deux assiettes réunies : le petit bruit d'une assiette posée.
        this.host.sound.kitchen('ready', at(e.station))
        break
      case 'emptied':
        this.host.sound.kitchen('trash', at(e.station))
        break
      case 'event':
        // Un imprévu : son titre, un instant, sous le bandeau, qui le garde ensuite (cf. MessHud) ; et son bruit.
        if (e.event) this.hud.announce(e.event)
        if (e.event === 'cat') this.host.sound.meow(this.host.player.position)
        else if (e.event === 'overheat') this.host.sound.work('hiss', this.host.player.position)
        else if (e.event === 'spill') this.host.sound.kitchen('trash', at(e.station ?? 'passe'))
        else if (e.event === 'hyperspace') this.host.sound.fsd(1.5, RULES.events.hyperspace.time - 1.5)
        else if (e.event === 'fire') {
          this.host.sound.work('sizzle', at(e.station))
          this.host.sound.kitchen('expired', at(e.station))
        } else this.host.sound.kitchen('order', null)
        break
      case 'perch':
        // Moustache a fini sa promenade : elle saute sur une préparation.
        this.host.sound.meow(at(e.station))
        break
      case 'event-end':
        if (e.event === 'spill' || e.event === 'fire') {
          if (me) this.working = null
          this.host.sound.kitchen('ready', this.host.player.position)
        }
        break
      case 'shooed':
        this.host.sound.meow(at(e.station))
        break
      case 'eaten':
        this.hud.toast(tr(`Moustache a mangé : ${text(INGREDIENTS[e.ing!].short)}`, `Moustache ate: ${text(INGREDIENTS[e.ing!].short)}`), 'bad')
        this.host.sound.work('munch', at(e.station))
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
      this.props = new KitchenProps(kitchen.group)
      this.queue = new MessQueue(kitchen.group)
      // Les shaders de la cuisine se préparent maintenant, au salon : pas d'à-coup en plein service.
      this.host.warm()
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
    props.show()
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
    this.host.music(true)
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

  /** Le service commence : tous les postes deviennent des objets qu'on vise (une fois). */
  private arrange() {
    if (this.armed) return
    this.armed = true
    this.host.kitchenDeck().interactables.push(...this.stationItems.keys())
  }
  private armed = false

  /** La vue du dessus, fixe : le milieu de la cuisine (null : hors de la cuisine). */
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
    document.body.classList.remove('mess-hyperspace')
    this.host.music(false)
    this.queue?.clear()
    this.props?.release((pid) => this.avatar(pid))
    this.game = null
    this.holding = null
    // Plus de poste à viser au mess d'à côté : la cuisine attend le prochain service.
    if (this.armed) {
      const list = this.host.kitchenDeck().interactables
      for (let i = list.length - 1; i >= 0; i--) if (this.stationItems.has(list[i])) list.splice(i, 1)
      this.armed = false
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

  /**
   * La touche à un poste (E, Espace, A, × : il n'y en a qu'une) : ce que dit l'invite (cf.
   * resolveAction), que le relais arbitre. Un geste (couper, laver, nettoyer) continue tant qu'on
   * reste au poste : on le note, pour l'arrêter si l'on s'éloigne, et il fait son bruit.
   */
  use(stationId: string) {
    if (!this.inKitchen || !this.game) return
    const action = resolveAction(this.game.state, this.game.you, stationId)
    if (action?.busy) {
      this.hud.toast(REFUSED.busy, 'info')
      return
    }
    this.working = null
    if (action && ['work', 'wash', 'clean', 'extinguish'].includes(action.kind)) {
      this.working = stationId
      const p = this.host.player.position
      this.host.sound.work(action.kind === 'work' ? 'chop' : action.kind === 'wash' ? 'water' : action.kind === 'extinguish' ? 'hiss' : 'scrub', p)
    }
    this.host.net.sendMess('use', { station: stationId })
  }

  /**
   * Le poste visé, à portée de main : celui qu'on regarde, comme dans Overcooked. Sans cela, devant
   * une poêle, on visait le comptoir voisin, plus près.
   * Un poste de côté compte jusqu'à deux fois sa distance, un poste dans le dos trois fois ; un poste
   * où la touche ne ferait rien compte un mètre de plus (une seule touche : elle va à ce qui sert).
   */
  private nearestStation(): string | null {
    const p = this.host.player.position
    const yaw = this.host.player.heading
    const fx = Math.sin(yaw), fz = Math.cos(yaw)
    let best: string | null = null
    let bestScore = Infinity
    for (const s of STATIONS) {
      if (!this.game) continue
      const dx = s.x - p.x, dz = s.z - p.z
      const d = Math.hypot(dx, dz)
      if (d > 1.45) continue
      const facing = d > 1e-3 ? (dx * fx + dz * fz) / d : 1
      const score = d * (2 - facing) + (resolveAction(this.game.state, this.game.you, s.id) ? 0 : 1)
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

  /** Espace en cuisine : la même touche que E, au poste qu'on regarde. */
  work(): boolean {
    if (!this.inKitchen || !this.game) return false
    const station = this.nearestStation()
    if (station) this.use(station)
    return true
  }

  /** Clavier : Espace en cuisine. */
  keyDown(e: KeyboardEvent): boolean {
    if (!this.inKitchen || e.code !== 'Space') return false
    e.preventDefault()
    if (!e.repeat) this.work()
    return true
  }

  /**
   * L'invite d'un poste visé : ce que fera la touche (null : ce n'est pas un poste). Rien à y faire :
   * le nom du poste, et ce qui manque (une assiette devant ce qui est cuit, les mains pleines devant une caisse).
   */
  prompt(it: Interactable): { main: string; space?: string } | null {
    const station = this.stationItems.get(it)
    if (!station || !this.inKitchen || !this.game) return null
    const state = this.game.state
    const action = resolveAction(state, this.game.you, station)
    const kind = STATION_BY_ID[station].kind
    const st = state.stations[station] as (Partial<UtensilState> & { item?: string | null }) | undefined
    const held = state.hands[this.game.you] ? state.items[state.hands[this.game.you]!] : null
    const slot = st?.item ? state.items[st.item] : null
    if (action) return { main: actionLabel(action, held ? itemName(held) : '', slot ? itemName(slot) : '') }
    const name = kind === 'crate' ? text(INGREDIENTS[STATION_BY_ID[station].ing!].short) : text(STATION_NAMES[kind])
    if ((kind === 'pot' || kind === 'pan') && state.event?.kind === 'fire' && state.event.station === station) return { main: tr(`${name} en feu : l'extincteur !`, `${name} on fire: get the extinguisher!`) }
    if ((kind === 'pot' || kind === 'pan') && st?.done && !held) return { main: tr(`${name} : il faut une assiette`, `${name}: you need a plate`) }
    if ((kind === 'pot' || kind === 'pan') && st?.cook && !st.done) return { main: tr(`${name} : ça cuit…`, `${name}: cooking…`) }
    return { main: name }
  }

  // ------------------------------------------------------------------ à chaque image

  update() {
    if (!this.game || this.phase !== 'kitchen') return
    const now = this.serverNow()
    const { state } = this.game
    // Le saut en hyperespace : l'écran (cf. style.css, .mess-warp) en plus de la scène (cf. props.ts).
    document.body.classList.toggle('mess-hyperspace', state.event?.kind === 'hyperspace')
    this.props?.update(state, now, (pid) => this.avatar(pid), this.host.camera())
    this.queue?.update(state, now, this.clock())
    this.hud.update(state, now)
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

  /** Le temps écoulé depuis l'image précédente (s), pour la file des clients. */
  private last = 0
  private clock(): number {
    const t = performance.now()
    const dt = this.last ? Math.min(0.1, (t - this.last) / 1000) : 0
    this.last = t
    return dt
  }

  /** Un joueur de la partie, vu d'ici (coéquipier en cuisine). */
  sees(id: number): boolean {
    return this.phase === 'kitchen' && !!this.game?.members.some((m) => m.id === String(id) && (m.status === 'in' || m.status === 'arriving'))
  }

  /** Le pont de la cuisine (pour situer les autres joueurs). */
  static readonly LEVEL = MESS_LEVEL
}

/** Le nom d'un objet de la partie : « Lapin coupé », « Assiette (Riz cuit, Crevettes saisies) », « Assiettes sales (2) ». */
export function itemName(item: Item): string {
  if (item.kind === 'dirty') return tr(`Assiettes sales (${item.count})`, `Dirty plates (${item.count})`)
  if (item.kind === 'extinguisher') return tr('Extincteur', 'Fire extinguisher')
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
