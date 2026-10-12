import * as THREE from 'three'
import type { Sound } from '../audio'
import type { Avatar } from '../avatar'
import type { IsoCamera } from '../camera'
import { Deck, type Box2 } from '../deck'
import type { Wallet } from '../economy/wallet'
import { tr } from '../i18n'
import type { LookRig } from '../looks'
import type { ArenaEnd, ArenaEvent, ArenaFighter, ArenaLobby, ArenaStart, ArenaState, Net, PlayerState, ServerMessage } from '../net'
import type { Player } from '../player'
import { RangeSfx } from '../range-sfx'
import { RemotePlayer } from '../remote'
import { loadZoneKit, type ZoneKit } from '../salvage/kit'
import { SalvageSfx } from '../salvage/sfx'
import type { Dialog } from '../ui'
import type { LevelDef } from '../levels'
import {
  ARENA_BOOTH, ARENA_LEVEL, ARENA_RETURN, ARENA_RULES, ARENA_TEAMS, CHARACTER_IDS, DEFAULT_CHARACTER, arenaGround, arenaHidden, arenaSight, arenaZone, bushSight, inBush,
  type ArenaMapId, type ArenaZone, type CharacterId,
} from '../../shared/arena.js'
import { characterById, Drone, warmCharacters } from './characters'
import { arenaExtras, arenaLevel, type ArenaExtras } from './deck'
import { ArenaGun, type ArenaBody } from './gun'
import { guardianExtras, guardianLevel } from './guardian'
import { hiveExtras, hiveLevel } from './hive'
import { ArenaMusic, ArenaVictoryMusic } from './music'
import { Podium, type PodiumEntry } from './podium'
import { Referee, REFEREE, refereeRig } from './referee'
import { arenaLive, arenaRanks } from '../furniture/arena'
import { ShieldBubble } from './bubble'
import { FighterMark } from './marks'
import { outline, showOutline } from './outline'
import { TINT, WATCH_TINT } from './palette'
import { arenaFx } from './settings'
import { Traps } from './traps'
import { ArenaHud, ArenaPanel, fetchRanking, RankingPanel, TEAM_NAMES, type PanelControls, type PanelPad, type Ranking, type Relation } from './ui'

/*
 * L'arène, côté client : le terminal du lobby, puis la partie. Le relais fait autorité (cf.
 * server/arena.js) : ici, on construit l'arène (cf. deck.ts), on y envoie le joueur sous les traits
 * du personnage qu'il a choisi (cf. characters.ts : il le garde toute la partie, et retrouve son
 * apparence du bord en sortant), on y fait jouer le moteur du stand de tir avec l'arme de ce
 * personnage (cf. gun.ts), on montre ce que le relais envoie (les autres combattants, leurs tirs, les
 * fleurs et les flaques, les points de vie, le score), et l'on gère ce qui est propre à chacun :
 * l'élimination (on tombe, on attend, on revient à sa base), l'écran de fin.
 *
 * Chaque autre combattant, joueur ou bot, est une doublure à l'allure de son personnage, menée par
 * ce que dit le relais : le personnage du bord d'un autre joueur reste caché le temps de la partie.
 *
 * La partie s'inspire de Brawl Stars. Pas de brouillard : on voit tout ce que la caméra montre,
 * sauf un adversaire caché dans un buisson (il se trahit en tirant, en prenant une balle, ou de tout
 * près). Les couleurs sont celles du joueur, pas des camps : lui en vert, les siens en bleu, ceux
 * d'en face en rouge (plaques, anneaux, bases, score). Aucune vue ne voit plus qu'une autre : en vue
 * subjective, les obstacles sont doublés en hauteur, et l'on ne lit la plaque que de ceux qu'on voit.
 *
 * La vue par défaut est celle de Brawl Stars : de haut et de près, son camp en bas de l'écran, celui
 * d'en face en haut (cf. ArenaHost.view). À la fin, tous les combattants s'alignent sur une scène,
 * les vainqueurs dansent (cf. podium.ts), et l'écran de fin se pose par-dessus.
 *
 * Spectateur : du terminal ou de l'hologramme du lobby, on regarde une partie en cours. Le relais
 * nous l'envoie comme à un joueur ; les camps gardent leurs couleurs du lobby (orange, bleu), la vue
 * suit un combattant (← et → en changent), et l'on n'a ni arme ni corps : pour le bord, on est resté au lobby.
 */

/** Le fantôme : ce que devient un combattant éliminé, à sa base, le temps de revenir en jeu. */
const GHOST = new THREE.MeshBasicMaterial({ color: '#bfeaff', transparent: true, opacity: 0.4, depthWrite: false })

/** Passe un personnage en fantôme (translucide, bleuté, sans contour), ou lui rend ses couleurs. Sans effet s'il l'est déjà. */
function haunt(avatar: Avatar | undefined, on: boolean) {
  if (!avatar || !!avatar.root.userData.ghost === on) return
  avatar.root.userData.ghost = on
  showOutline(avatar.root, !on)
  avatar.root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || mesh.userData.outline) return
    if (on) {
      mesh.userData.solid = mesh.material
      mesh.material = GHOST
    } else if (mesh.userData.solid) {
      mesh.material = mesh.userData.solid
      mesh.userData.solid = undefined
    }
  })
}

/** Écran tactile : le téléphone vibre quand on est touché, quand on élimine, quand on tombe (là où le navigateur le permet). */
const COARSE = matchMedia('(pointer: coarse)').matches
function buzz(pattern: number | number[]) {
  if (!COARSE) return
  try {
    navigator.vibrate?.(pattern)
  } catch {}
}
/**
 * Vue de dessus, ce que le cadre peut montrer au-delà du plan de l'arène (tuiles) : de chaque côté,
 * au fond (sous le score), et derrière sa base, en bas de l'écran (au doigt, davantage : les sticks y sont).
 */
const EDGE = { side: 0.9, far: 1.3, near: COARSE ? 2.5 : 1.3 }
/**
 * Les traits du personnage, au départ : on les attend au plus ce temps avant d'entrer dans l'arène
 * (ms) ; au-delà, on y entre tel quel et on les prend dès qu'ils sont là (le relais n'attend pas).
 */
const DRESS_WAIT = 1000
/** Fin de partie : le temps de voir tomber le dernier, avant le rideau (ms). */
const CURTAIN = 1100
/** La scène de fin : au nord de l'arène, hors du plan (z, repère de l'arène). */
const STAGE_Z = -9

/** Combien de temps l'arc d'un coup reçu reste à l'écran (ms). */
const THREAT_TIME = 1300
/**
 * L'élimination, vue de tous (s) : il tombe là où il a été touché, reste un instant au sol, s'efface
 * (les dernières DEATH_FADE), puis reparaît à sa base en fantôme. Elle ne retarde rien : le relais l'y
 * a déjà mis, et son retour en jeu reste le même.
 */
const DEATH = 0.85
const DEATH_FADE = 0.26
/** Le retour en jeu : il se matérialise dans son faisceau, d'un élan (s). */
const APPEAR = 0.35
const easeOutBack = (u: number) => 1 + 2.4 * (u - 1) ** 3 + 1.4 * (u - 1) ** 2

/** Séries d'éliminations sans tomber : ce qu'on en dit. */
const STREAKS = ['', '', tr('Doublé !', 'Double!'), tr('Triplé !', 'Triple!'), tr('Quadruplé !', 'Quad!'), tr('Inarrêtable !', 'Unstoppable!')]

/** Ce que le jeu prête au mode (cf. main.ts). */
export interface ArenaHost {
  scene: THREE.Scene
  iso: IsoCamera
  player: Player
  sound: Sound
  net: Net
  dialog: Dialog
  wallet: Wallet
  /** Le pont où se trouve le joueur. */
  deck(): Deck
  /** La cale, où est le lobby. */
  hold: Deck
  /** Passe le joueur sur ce pont, à cet endroit, sous un fondu au noir ; `dark` : appelé dans le noir, une fois arrivé. */
  moveTo(deck: Deck, at: { x: number; z: number }, dark?: () => void): Promise<void>
  /** Fondu au noir (`on`), ou retour à l'image. */
  fade(on: boolean): Promise<void>
  /**
   * Cadre la vue de dessus, sans transition (à appeler dans le noir). `match` : de haut et de près,
   * derrière le camp `team`, qui est alors en bas de l'écran ; c'est la vue où l'on entre, quelle
   * que soit celle du bord. `stage` : face à la scène de fin, large de `width` tuiles. null : la
   * vue d'avant la partie.
   */
  view(mode: 'match' | 'stage' | null, options?: { team?: number; width?: number }): void
  /** Vue subjective (sinon : vue de dessus). */
  fps(): boolean
  /** Tourne le joueur (et son regard, en vue subjective) vers ce cap. */
  face(yaw: number): void
  /** Le joueur prend les traits de son personnage (`rig`) ; null : il retrouve son apparence du bord. */
  wear(rig: LookRig | null): void
  /** Redit tout de suite sa position au relais (retour à la base). */
  sync(): void
  /** Position à l'écran (pixels) d'un point du monde, et sa distance à la caméra ; null s'il est derrière elle. */
  project(p: THREE.Vector3): { x: number; y: number; d: number } | null
  /** Où regarde la caméra, au sol (cap, comme celui d'un personnage) : le haut de l'écran, ou devant soi dans les yeux. */
  facing(): number
  /** L'arme de l'arène vient d'être créée : le jeu y branche ses réglages (vitesse, pose, curseur). */
  armed(gun: ArenaGun): void
  /** Ce que le joueur tient en main : clavier et souris, manette, ou le doigt. */
  controls(): PanelControls
}

interface Fighter extends ArenaFighter {
  hp: number
  /** Ses points de vie de départ (ceux de son personnage). */
  max: number
  alive: boolean
  shield: boolean
  /** Qui il est pour le joueur (sa couleur), et quand il a tiré ou pris une balle pour la dernière fois (un buisson ne le cache plus). */
  rel: Relation
  revealAt: number
  /** Éliminé : il attend à sa base, en fantôme, encore `wait` secondes. */
  ghost: boolean
  wait: number
  /** Sa doublure, à l'allure de son personnage (le joueur, lui, a son propre personnage : null). */
  puppet: RemotePlayer | null
  /** Anneau au sol, à sa couleur et à sa forme (cf. marks.ts). */
  mark: FighterMark
  /** Nico : Boulon, à son épaule. */
  drone: Drone | null
  /** Touché : son contour flashe blanc jusqu'à cet instant (ms, cf. react) ; s'il flashe en ce moment. */
  flashUntil: number
  flashing: boolean
  /**
   * Éliminé à l'instant : il tombe là où il a été éliminé (`from`), le temps de DEATH (`left` : ce qu'il
   * en reste, en secondes de jeu, comme l'animation de sa chute), puis s'efface
   * et reparaît à sa base (`base`), en fantôme. Ce n'est qu'une image : pour le relais, il y est déjà,
   * et plus rien ne le touche. `spawn` : son retour en jeu, arrivé avant la fin de sa chute (la manche
   * finissait), joué ensuite.
   */
  dying: { left: number; from: { x: number; z: number }; base: { x: number; z: number; yaw: number }; spawn: { x: number; z: number; yaw: number } | null } | null
  /** Il apparaît (s qui restent) : il se matérialise dans son faisceau, d'un élan. */
  appear: number
  /** Sa bulle de protection (créée la première fois qu'il est protégé). */
  bubble: ShieldBubble | null
}

interface Game {
  id: string
  team: 0 | 1
  goal: number
  /** Manches à gagner. */
  wins: number
  fighters: Map<number, Fighter>
  state: ArenaState | null
  end: ArenaEnd | null
  /** Éliminé : par qui (null : debout). */
  downBy: string | null
  /** Dernière seconde annoncée par le décompte du coup d'envoi. */
  second: number
  /** Éliminations du joueur depuis sa dernière chute, et dernier échange de balles où il était (l'ardeur de la partie, cf. apply). */
  streak: number
  foughtAt: number
  /** Spectateur : on regarde la partie sans y être ; `follow` : le combattant que suit la vue. */
  watching: boolean
  follow: number
  /** Les couleurs de la partie : celles du joueur, ou celles des camps pour un spectateur. */
  tint: Record<Relation, string>
}

type Phase = 'ship' | 'loading' | 'arena'

const CHARACTER_KEY = 'mini-shipinteriors-arena-character'
const ERRORS: Record<string, string> = {
  lobby: tr('Il faut être dans le lobby du sas.', 'You need to be in the airlock lobby.'),
  full: tr('Ce camp est complet.', 'That side is full.'),
  playing: tr('Ce lobby est déjà en partie.', 'That lobby is already playing.'),
  gone: tr('Ce lobby n\'existe pas.', 'That lobby doesn\'t exist.'),
  leader: tr('Seul le chef du lobby règle la partie.', 'Only the lobby leader sets the match.'),
  crowded: tr('Trop de monde dans un camp pour ce format.', 'Too many players on one side for that format.'),
  alone: tr('Sans bots, il faut quelqu\'un dans le camp d\'en face.', 'Without bots, someone has to be on the other side.'),
}
/** Pourquoi une partie n'a pas été notée au classement. */
const UNRANKED: Record<string, string> = {
  guest: tr('Non classée : connectez-vous au site pour entrer au classement.', 'Not ranked: sign in to the site to enter the ranking.'),
  site: tr('Non classée : le site n\'a pas pu enregistrer la partie.', 'Not ranked: the site could not record the match.'),
}

/** Une arène bâtie : son plan, son pont, ce qui y dépend du joueur, sa scène de fin (construite à la première). */
interface Built { zone: ArenaZone; deck: Deck; extras: ArenaExtras; podium: Podium | null }

/** Le décor de chaque plan : le pont, et ce qui y bouge ou dépend du joueur. */
const DECKS: Record<ArenaMapId, { level(zone: ArenaZone, kit: ZoneKit): LevelDef; extras(zone: ArenaZone, kit: ZoneKit): ArenaExtras }> = {
  bay: { level: arenaLevel, extras: arenaExtras },
  guardian: { level: guardianLevel, extras: guardianExtras },
  hive: { level: hiveLevel, extras: hiveExtras },
}

export class ArenaClient {
  private readonly panel: ArenaPanel
  private readonly hud = new ArenaHud()
  private readonly ranking = new RankingPanel()
  /** Le plan de la partie en cours (ou de la dernière). */
  private zone = arenaZone()
  private lobby: ArenaLobby = { rooms: [] }
  private game: Game | null = null
  private phase: Phase = 'ship'
  /** Les arènes déjà bâties, une par plan : construite au premier départ sur ce plan, puis gardée. */
  private readonly built = new Map<ArenaMapId, Built>()
  /** Le pont de l'arène de la partie en cours (ou de la dernière). */
  deck: Deck | null = null
  /** Le moteur de tir, dans l'arène (créé avec elle). */
  gun: ArenaGun | null = null
  /** Le personnage choisi au terminal : celui qu'on joue, toute la partie. */
  private character: CharacterId = DEFAULT_CHARACTER
  /** Le joueur a pris les traits de son personnage (il les rend en sortant). */
  private worn = false
  /** Les fleurs de Capucine et les flaques de Jacques, sur le terrain. */
  private traps: Traps | null = null
  private quitArmed = 0
  private endTimer = 0
  private leaving: Promise<void> | null = null
  /** Tessa, l'arbitre, à son guichet du lobby (chargée à part) ; et ce qu'elle retient de notre dernière partie. */
  referee: Referee | null = null
  private lastEnd: { won: boolean | null; kills: number; deaths: number } | null = null
  /** Ce qui dépend du joueur ou bouge dans le décor : les bases, les buissons, l'étage des obstacles en vue subjective, le stade. */
  private extras: ArenaExtras | null = null
  /** Les bruitages de la partie (ceux du stand, et la clameur des tribunes), et le chant de la ruche. */
  private sfx: RangeSfx | null = null
  private music: ArenaMusic | null = null
  private hiveSfx: SalvageSfx | null = null
  private readonly victoryMusic: ArenaVictoryMusic
  private readonly hands = new THREE.Vector3()
  private readonly local = new THREE.Vector3()
  private readonly focus = new THREE.Vector3()
  /** Ce que le site a répondu pour la dernière partie finie (il peut répondre avant que l'écran de fin ne soit posé). */
  private rankedAs: { game: string; ok: boolean; reason?: string } | null = null
  /** La scène de fin (construite à la première), et si l'on y est. */
  private podium: Podium | null = null
  private staged = false
  /** D'où viennent les coups que le joueur prend (cf. threat) : un arc par tireur, qui s'efface en THREAT_TIME. */
  private threatsFrom: { by: number; src: THREE.Vector3; at: number; heavy: boolean }[] = []
  /** Limites ajoutées aux collisions : la base adverse toujours, la nôtre avant le coup d'envoi. */
  private baseBarriers: Box2[] = []
  private ownBaseLocked: boolean | null = null

  constructor(private host: ArenaHost) {
    this.victoryMusic = new ArenaVictoryMusic(host.sound)
    try {
      const saved = localStorage.getItem(CHARACTER_KEY)
      if (CHARACTER_IDS.includes(saved as CharacterId)) this.character = saved as CharacterId
    } catch {}
    this.panel = new ArenaPanel({
      join: (room, team) => {
        host.net.sendArena('join', { room, team, character: this.character })
        void loadZoneKit()
        warmCharacters()
      },
      leave: () => host.net.sendArena('leave'),
      side: (team) => host.net.sendArena('side', { team }),
      settings: (s) => host.net.sendArena('settings', s),
      character: (id) => this.choose(id),
      watch: (room) => this.watch(room),
      ready: (on) => {
        host.net.sendArena('ready', { ready: on })
        if (on) void loadZoneKit()
      },
    })
    this.panel.character = this.character
    this.hud.onQuit = () => this.quit()
    this.hud.onFollow = (step) => this.cycle(step)
    this.ranking.onLoaded = (r) => this.showRanks(r)
    void this.buildReferee()
    void this.refreshRanks()
  }

  /** Tessa, derrière la vitre de son guichet : on lui parle au comptoir. */
  private async buildReferee() {
    // Dos à la cloison, elle regarde le lobby.
    const referee = new Referee(await refereeRig(), ARENA_BOOTH.referee, ARENA_BOOTH.yaw)
    this.referee = referee
    const hold = this.host.hold
    hold.group.add(referee.root)
    hold.interactables.push({
      object: referee.root,
      position: new THREE.Vector3(ARENA_BOOTH.counter.x, 0, ARENA_BOOTH.counter.z),
      label: tr(`Parler à ${REFEREE}`, `Talk to ${REFEREE}`),
      onInteract: () => this.talkToReferee(),
    })
  }

  private talkToReferee() {
    const referee = this.referee
    if (!referee) return
    this.host.player.interact()
    const room = this.panel.room
    const line = referee.talk({
      lobby: room && { id: room.id, size: room.size, bots: room.bots, players: room.members.length },
      last: this.lastEnd,
      playing: this.lobby.rooms.filter((r) => r.status === 'playing' && r !== room).length,
    })
    this.host.dialog.show(tr(`${REFEREE} : « ${line} »`, `${REFEREE}: “${line}”`))
  }

  // ------------------------------------------------------------------ état

  /** Une partie est en cours, et le joueur est dans l'arène. */
  get inArena(): boolean {
    return !!this.game && !!this.deck && this.host.deck() === this.deck
  }

  /** Le personnage ne bouge pas : en route, éliminé, spectateur, ou devant l'écran de fin. */
  get frozen(): boolean {
    return this.phase === 'loading' || (this.inArena && (this.game!.downBy !== null || this.game!.watching || !!this.game!.end))
  }

  /** On regarde une partie sans y être : ni corps, ni arme, et la vue reste celle de dessus. */
  get watching(): boolean {
    return !!this.game?.watching && this.inArena
  }

  get panelOpen(): boolean {
    return this.panel.isOpen || this.ranking.isOpen || this.hud.endOpen
  }

  /**
   * La manette, tant qu'une fenêtre de l'arène est ouverte (cf. panelOpen) : le terminal s'y
   * parcourt tout entier (cf. ArenaPanel.pad) ; B ferme le classement ; à l'écran de fin, le stick
   * va d'un bouton à l'autre et A l'actionne.
   */
  pad(input: PanelPad, dt: number) {
    if (this.panel.isOpen) {
      this.panel.setControls(this.host.controls())
      this.panel.pad(input, dt)
    } else if (this.ranking.isOpen) {
      if (input.cancel) this.ranking.close()
    } else if (this.hud.endOpen) this.hud.endPad(input, dt)
  }

  contains(target: EventTarget | null): boolean {
    return this.panel.contains(target) || this.ranking.contains(target) || this.hud.contains(target)
  }

  /** Sur la scène de fin : la caméra la cadre de face (cf. main.ts), les vrais personnages sont cachés. */
  get staging(): boolean {
    return this.staged
  }

  /**
   * Ce que la caméra suit pendant la partie, vue de dessus : le joueur, sans que le cadre sorte de
   * l'arène. Comme dans Brawl Stars, au bord la vue s'arrête, et c'est le personnage qui avance à
   * l'écran ; plus large que l'arène, elle reste centrée dessus. null : ailleurs, ou dans les yeux.
   */
  matchFocus(iso: IsoCamera): THREE.Vector3 | null {
    if (!this.inArena || this.staged || this.host.fps()) return null
    const here = this.host.player.position
    const { side, ahead, behind } = iso.span
    // Le haut de l'écran, au sol : dans l'arène, c'est le camp d'en face.
    const up = iso.screenToGround(0, 1, this.local)
    const cx = (this.zone.width - 1) / 2, cz = (this.zone.height - 1) / 2
    const lengthwise = Math.abs(up.x) > Math.abs(up.z)
    const deep = (lengthwise ? this.zone.width : this.zone.height) / 2, wide = (lengthwise ? this.zone.height : this.zone.width) / 2
    const along = (here.x - cx) * up.x + (here.z - cz) * up.z
    const across = (here.z - cz) * up.x - (here.x - cx) * up.z
    const high = deep + EDGE.far - ahead, low = behind - deep - EDGE.near
    const room = wide + EDGE.side - side
    const a = low > high ? (low + high) / 2 : THREE.MathUtils.clamp(along, low, high)
    const b = room <= 0 ? 0 : THREE.MathUtils.clamp(across, -room, room)
    return this.focus.set(cx + up.x * a - up.z * b, here.y, cz + up.z * a + up.x * b)
  }

  /** Ce que la caméra suit pendant la scène de fin (monde) ; null hors de la scène. */
  get stageFocus(): THREE.Vector3 | null {
    return this.staged ? this.podium!.focus : null
  }

  closePanels() {
    this.panel.close()
    this.ranking.close()
  }

  /** Le classement des joueurs, sur le mur du lobby. */
  openRanking() {
    void this.ranking.open()
  }

  /** Relit le classement sur le site, pour le tableau du mur (au démarrage, après chaque partie). */
  private async refreshRanks() {
    const ranking = await fetchRanking()
    if (ranking) this.showRanks(ranking)
  }

  private showRanks(ranking: Ranking) {
    arenaRanks.rows = ranking.top.slice(0, 5).map((r) => ({ name: r.name, wins: r.wins }))
    arenaRanks.stamp++
  }

  /** Jusqu'où le joueur voit dans un buisson : de tout près, ou plus loin s'il joue Nico (Boulon scanne). */
  private get bushNear(): number {
    const g = this.game
    return g && !g.watching ? bushSight(g.fighters.get(this.host.net.id)?.character ?? '') : ARENA_RULES.bush.near
  }

  private visible(f: Fighter, at: THREE.Vector3): boolean {
    // Un spectateur voit tout le monde, buissons compris.
    if (f.rel !== 'enemy' || this.game?.watching) return true
    const revealed = performance.now() - f.revealAt < ARENA_RULES.bush.reveal * 1000
    return !arenaHidden(this.zone, at, this.host.player.position, revealed, this.bushNear)
  }

  // ------------------------------------------------------------------ lobby

  openTerminal() {
    this.refresh()
    this.panel.setControls(this.host.controls())
    this.panel.open()
    void loadZoneKit()
    warmCharacters()
  }

  private refresh() {
    this.panel.update(this.lobby, this.host.net.id, this.host.net.online)
    // Le tableau du mur et l'hologramme du lobby disent les parties en cours.
    const games = this.lobby.rooms.filter((r) => r.status === 'playing').map((r) => ({ lobby: r.id, map: r.map, rounds: r.rounds ?? [0, 0], score: r.score ?? [0, 0] }))
    if (JSON.stringify(games) === JSON.stringify(arenaLive.games)) return
    arenaLive.games = games
    arenaLive.stamp++
  }

  /** Regarder la partie du lobby `room` (du terminal) : le relais répond par son départ, en spectateur. */
  private watch(room: number) {
    if (this.game) return
    this.host.net.sendArena('watch', { room })
    void loadZoneKit()
    warmCharacters()
  }

  /** De l'hologramme du lobby : regarder la partie en cours, s'il y en a une. */
  watchLive() {
    const live = this.lobby.rooms.find((r) => r.status === 'playing')
    if (live) this.watch(live.id)
    else this.host.dialog.show(tr('Aucune partie en cours : l\'hologramme montre l\'arène au repos. Dès qu\'une partie se joue, on la regarde d\'ici.', 'No match in progress: the hologram shows the arena at rest. As soon as one is on, you watch it from here.'))
  }

  /** Le personnage choisi au terminal (on le garde ensuite toute la partie). */
  private choose(id: CharacterId) {
    this.character = this.panel.character = id
    try {
      localStorage.setItem(CHARACTER_KEY, id)
    } catch {}
    this.host.net.sendArena('character', { character: id })
  }

  // ------------------------------------------------------------------ messages

  onMessage(m: ServerMessage) {
    switch (m.t) {
      case 'welcome':
        this.lobby = m.arena ?? { rooms: [] }
        this.refresh()
        break
      case 'arena:lobby':
        this.lobby = { rooms: m.rooms }
        this.refresh()
        break
      case 'arena:error':
        // La partie qu'on regardait s'est arrêtée sans résultat (ses joueurs sont partis).
        if (m.code === 'over' && this.game?.watching) void this.leave(tr('La partie s\'est arrêtée : retour au lobby.', 'The match stopped: back to the lobby.'))
        else if (this.panel.isOpen) this.panel.message(ERRORS[m.code] ?? tr('Action refusée.', 'Action refused.'))
        else if (m.code === 'gone') this.host.dialog.show(tr('Cette partie vient de se terminer.', 'That match just ended.'))
        break
      case 'arena:ranked':
        // Le site a noté la partie (ou non) : l'écran de fin le dit, et le tableau du lobby se relit.
        if (this.game?.end?.game === m.game) this.hud.ranked(m.ok ? tr('Partie comptée au classement', 'Match counted in the ranking') : UNRANKED[m.reason ?? 'site'], m.ok)
        this.rankedAs = { game: m.game, ok: m.ok, reason: m.reason }
        if (m.ok) void this.refreshRanks()
        break
      case 'arena:start':
        void this.start(m)
        break
      case 'arena:state':
        if (this.game?.id === m.game) this.apply(m)
        break
      case 'arena:event':
        if (this.game && !this.game.end) this.event(m)
        break
      case 'arena:end':
        if (this.game?.id === m.game) this.finish(m)
        break
    }
  }

  /** Liaison perdue avec le relais : la partie est finie pour nous, on revient au lobby. */
  disconnected() {
    if (!this.game) return
    void this.leave(tr('Liaison perdue avec le relais : retour au lobby.', 'Lost contact with the relay: back to the lobby.'))
  }

  // ------------------------------------------------------------------ départ, retour

  /** L'arène du plan `id` (bâtie une fois, à la première partie qui s'y joue), et le moteur de tir, qui y passe. */
  private async build(id: ArenaMapId): Promise<Deck> {
    const kit = await loadZoneKit()
    const ready = this.built.get(id)
    if (ready) return this.use(ready)
    const zone = arenaZone(id)
    const look = DECKS[zone.id]
    const deck = new Deck(look.level(zone, kit))
    // Chaque obstacle bloque sa tuile entière, comme pour le relais.
    for (let z = 0; z < zone.height; z++) {
      for (let x = 0; x < zone.width; x++) {
        if (zone.blocked[z * zone.width + x] && zone.room[z * zone.width + x] !== ' ') deck.colliders.push({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5 })
      }
    }
    deck.pathfinder.invalidate()
    deck.group.visible = false
    const extras = look.extras(zone, kit)
    deck.group.add(extras.group)
    // Les pièges prennent la couleur de leur camp, pour le joueur ; ils passent d'une arène à l'autre (cf. use).
    this.traps ??= new Traps((team) => {
      const g = this.game
      if (!g || g.watching) return { color: ARENA_TEAMS[team].color, foe: team === 1 }
      return team === g.team ? { color: g.tint.ally, foe: false } : { color: g.tint.enemy, foe: true }
    }, (x, z) => arenaGround(this.zone, { x, z }), (id) => this.positionOf(id))
    this.host.scene.add(deck.group)
    const built: Built = { zone, deck, extras, podium: null }
    this.built.set(zone.id, built)
    if (this.gun) return this.use(built)
    this.sfx = new RangeSfx(this.host.sound)
    this.music = new ArenaMusic(this.host.sound)
    const gun = new ArenaGun(deck.group, this.host.dialog, this.host.wallet, this.sfx, this.music)
    gun.host = {
      zone,
      self: () => this.host.net.id,
      team: () => this.game?.team ?? 0,
      bodies: () => this.bodies(),
      foes: () => this.foes(),
      canFire: () => !!this.game && !this.game.end && !this.game.watching && this.game.downBy === null && (this.game.state?.warmup ?? 1) <= 0,
      fire: (o, d, r) => this.host.net.sendArena('fire', r === undefined ? { o, d } : { o, d, r }),
      quit: () => this.quit(),
      tint: (id) => {
        const g = this.game, f = g?.fighters.get(id)
        return g && f ? g.tint[f.rel] : TINT.enemy
      },
      gesture: (kind, len, strength) => this.host.player.avatar.act(kind, len, strength),
      reloading: () => this.host.net.sendArena('reload'),
    }
    this.gun = gun
    this.traps.fx = gun.fx
    this.traps.onSound = (kind, at) => { if (this.inArena) gun.trapSound(kind, at) }
    this.host.armed(gun)
    return this.use(built)
  }

  /** La partie se joue dans cette arène : la seule visible, celle où l'on vise. */
  private use(b: Built): Deck {
    for (const other of this.built.values()) if (other !== b) other.deck.group.visible = false
    this.zone = b.zone
    this.deck = b.deck
    this.extras = b.extras
    this.podium = b.podium
    this.gun?.attach(b.deck.group, b.zone)
    if (this.music) this.music.map = b.zone.id
    if (this.traps) b.deck.group.add(this.traps.group)
    return b.deck
  }

  private async start(m: ArenaStart) {
    this.closePanels()
    if (this.game) this.dispose()
    this.phase = 'loading'
    let deck: Deck
    try {
      deck = await this.build(m.map)
    } catch {
      // Le kit de l'arène n'a pas pu se charger : on rend sa place, plutôt que de rester figé au lobby.
      this.phase = 'ship'
      this.host.net.sendArena('quit')
      this.host.dialog.show(tr('CMDR Arena n\'a pas pu se charger : réessayez dans un instant.', 'CMDR Arena failed to load: try again in a moment.'))
      return
    }
    const watching = !!m.watch
    const game: Game = {
      id: m.game, team: m.team, goal: m.goal, wins: m.wins, fighters: new Map(), state: null, end: null, downBy: null, second: Infinity, streak: 0, foughtAt: 0,
      watching, follow: m.fighters[0]?.id ?? 0, tint: watching ? WATCH_TINT : TINT,
    }
    this.game = game
    this.setBaseBarriers(!watching)
    this.rankedAs = null
    this.traps?.clear()
    for (const f of m.fighters) this.addFighter(f, null)
    const mine = game.fighters.get(this.host.net.id)
    if (mine) this.character = this.panel.character = mine.character
    // Ses traits de personnage : il les prend dans le noir s'ils sont déjà là, sinon dès qu'ils arrivent.
    const dressing = mine ? characterById(mine.character).rig().catch(() => null) : Promise.resolve(null)
    const rig = await Promise.race([dressing, new Promise<undefined>((done) => window.setTimeout(done, DRESS_WAIT))])
    if (this.game !== game) return
    if (mine && rig === undefined) void dressing.then((late) => { if (late && this.game === game && !game.end && this.inArena && !this.worn) this.dress(late, mine) })
    this.hud.show(true, watching)
    this.hud.board({ score: 0, rounds: 0 }, { score: 0, rounds: 0 }, m.goal, 1, m.wins, m.duration, m.warmup)
    // Sa base en bleu, celle d'en face en rouge (pour un spectateur : chacune à la couleur de son camp) ;
    // la caméra est derrière la sienne.
    this.extras?.paintBases(m.team === 0 ? [game.tint.ally, game.tint.enemy] : [game.tint.enemy, game.tint.ally], m.team)
    await this.host.moveTo(deck, m.spawn, () => {
      this.host.view('match', { team: m.team })
      if (rig) this.dress(rig, mine!)
    })
    // Reparti entre-temps (liaison perdue pendant le fondu).
    if (this.game !== game) return
    this.phase = 'arena'
    this.host.face(m.spawn.yaw)
    // Au départ, chacun apparaît à sa base, dans son faisceau.
    for (const f of game.fighters.values()) {
      const at = this.positionOf(f.id)
      if (at && f.alive) this.appear(f, at)
    }
    this.gun!.watching = watching
    this.gun!.begin(this.character)
    if (watching) {
      // Ni arme ni mire : le moteur de tir ne sert qu'à montrer les balles des autres.
      this.gun!.down()
      return
    }
    // Au doigt, le bandeau est étroit : le score dit déjà la limite de points.
    const role = mine ? characterById(mine.character) : null
    this.host.dialog.show(COARSE
      ? tr('Vos adversaires sont en rouge ; les buissons cachent qui s\'y tient.', 'Your opponents are in red; bushes hide whoever stands in them.')
      : tr(
        `${role ? `Vous jouez ${role.name}, ${role.role.toLowerCase()}. ` : ''}${m.wins} manches gagnantes : la première équipe à ${m.goal} points gagne la manche. Vos adversaires sont en rouge ; les buissons cachent qui s'y tient.`,
        `${role ? `You're playing ${role.name}, ${role.role.toLowerCase()}. ` : ''}First to ${m.wins} rounds: the first team to ${m.goal} points takes the round. Your opponents are in red; bushes hide whoever stands in them.`,
      ))
  }

  /** Le joueur prend les traits de son personnage ; Nico, avec Boulon à son épaule. */
  private dress(rig: LookRig, mine: Fighter) {
    this.host.wear(rig)
    // Arrivés en pleine partie, ses traits tiennent déjà son arme.
    this.host.player.avatar.carrying = !!this.gun?.active
    this.worn = true
    if (characterById(mine.character).drone) {
      mine.drone = new Drone()
      this.host.player.root.add(mine.drone.root)
    }
  }

  /** Il rend les traits de son personnage : il retrouve son apparence du bord. */
  private undress() {
    if (!this.worn) return
    this.worn = false
    this.host.wear(null)
  }

  /** @param at où poser sa doublure (null : hors de vue, le temps que le relais dise où il est) */
  private addFighter(f: ArenaFighter, at: { x: number; z: number; yaw: number } | null) {
    const g = this.game!
    const rel: Relation = f.id === this.host.net.id ? 'self' : f.team === g.team ? 'ally' : 'enemy'
    const mark = new FighterMark(rel, g.tint[rel])
    this.deck!.group.add(mark.root)
    const character = characterById(f.character)
    let puppet: RemotePlayer | null = null
    let drone: Drone | null = null
    if (rel !== 'self' || g.watching) {
      const deckY = this.deck!.y
      // Hors de vue le temps que le premier état du relais donne sa place ; sur le sol de sa tuile
      // (le haut du site gardien, une rampe).
      const state = { id: f.id, name: f.name, skin: f.character, x: at?.x ?? -10, z: at?.z ?? -10, yaw: at?.yaw ?? 0, level: ARENA_LEVEL, anim: 'idle' } as PlayerState
      const zone = this.zone
      puppet = new RemotePlayer(f.id, state, (_level, x, z) => deckY + arenaGround(zone, { x, z }), () => character.rig())
      puppet.group.visible = false
      this.host.scene.add(puppet.group)
      if (character.drone) puppet.group.add((drone = new Drone()).root)
    }
    const max = character.stats.hp
    g.fighters.set(f.id, { ...f, hp: max, max, alive: true, shield: false, rel, revealAt: 0, ghost: false, wait: 0, puppet, mark, drone, flashUntil: 0, flashing: false, dying: null, appear: 0, bubble: null })
  }

  private removeFighter(id: number) {
    const f = this.game?.fighters.get(id)
    if (!f) return
    // Il tombait : son personnage se relève (le joueur garde le sien en sortant).
    if (f.dying) {
      const avatar = this.avatarOf(f)
      avatar?.stopEmote()
      avatar?.root.scale.setScalar(1)
      f.dying = null
    }
    this.game!.fighters.delete(id)
    f.bubble?.dispose()
    this.gun?.disarm(id)
    this.hud.dropPlate(id)
    f.mark.dispose()
    f.drone?.root.removeFromParent()
    if (f.puppet) f.puppet.group.removeFromParent()
    else haunt(this.host.player.avatar, false)
  }

  /** Pose les frontières des bases dans les collisions du joueur local. */
  private setBaseBarriers(lockOwn: boolean) {
    const deck = this.deck, game = this.game
    if (!deck || !game || game.watching) {
      this.clearBaseBarriers()
      return
    }
    if (this.ownBaseLocked === lockOwn && this.baseBarriers.length) return
    this.clearBaseBarriers()
    const near = ARENA_RULES.baseDepth - 0.5
    const far = this.zone.width - ARENA_RULES.baseDepth - 0.5
    const own = game.team === 0 ? near : far
    const enemy = game.team === 0 ? far : near
    const barrier = (x: number): Box2 => ({ minX: x - 0.025, maxX: x + 0.025, minZ: -0.5, maxZ: this.zone.height - 0.5 })
    this.baseBarriers = lockOwn ? [barrier(own), barrier(enemy)] : [barrier(enemy)]
    this.ownBaseLocked = lockOwn
    deck.colliders.push(...this.baseBarriers)
    deck.pathfinder.invalidate()
  }

  private clearBaseBarriers() {
    if (!this.deck || !this.baseBarriers.length) return
    for (const barrier of this.baseBarriers) {
      const i = this.deck.colliders.indexOf(barrier)
      if (i >= 0) this.deck.colliders.splice(i, 1)
    }
    this.baseBarriers = []
    this.ownBaseLocked = null
    this.deck.pathfinder.invalidate()
  }

  /** Quitte l'arène (fin, abandon, coupure) : retour devant le terminal du lobby. */
  private leave(message?: string): Promise<void> {
    this.leaving ??= this.leaveNow(message).finally(() => (this.leaving = null))
    return this.leaving
  }

  private async leaveNow(message?: string) {
    const g = this.game
    if (!g) return
    this.hud.closeEnd()
    this.hud.show(false)
    this.gun?.end()
    if (this.inArena) await this.host.moveTo(this.host.hold, ARENA_RETURN, () => {
      this.unstage()
      this.removeFighter(this.host.net.id)
      this.undress()
    })
    if (this.game !== g) return
    this.dispose()
    if (message) this.host.dialog.show(message)
  }

  private dispose() {
    const g = this.game
    if (!g) return
    this.host.player.avatar.oneHand = null
    this.gun?.end()
    for (const id of [...g.fighters.keys()]) this.removeFighter(id)
    haunt(this.host.player.avatar, false)
    this.undress()
    this.traps?.clear()
    this.unstage()
    this.hud.closeEnd()
    this.hud.show(false)
    this.clearBaseBarriers()
    this.game = null
    this.phase = 'ship'
    this.endTimer = 0
  }

  /** La scène de fin est démontée, et la vue redevient celle d'avant la partie. */
  private unstage() {
    this.victoryMusic.stop()
    this.podium?.clear()
    this.staged = false
    this.host.view(null)
  }

  /** Abandon (deux fois de suite) : on quitte la partie et l'on rentre au lobby. */
  quit() {
    if (!this.game || this.game.end) return
    // Un spectateur s'en va sans qu'on lui redemande : il ne laisse personne en plan.
    if (this.game.watching) {
      this.host.net.sendArena('unwatch')
      void this.leave()
      return
    }
    const now = performance.now()
    if (now - this.quitArmed > 3000) {
      this.quitArmed = now
      this.host.dialog.show(tr('Quitter la partie ? Encore une fois pour rentrer au lobby.', 'Leave the match? Once more to return to the lobby.'))
      return
    }
    this.quitArmed = 0
    this.host.net.sendArena('quit')
    void this.leave(tr('Partie quittée : retour au lobby.', 'Match left: back to the lobby.'))
  }

  /** Touches du mode ; true si la touche est prise. Spectateur : ← et → passent d'un combattant à l'autre. */
  keyDown(e: KeyboardEvent): boolean {
    const g = this.game
    if (!g?.watching || !this.inArena || g.end) return false
    const turn = e.code === 'ArrowLeft' || e.code === 'KeyA' ? -1 : e.code === 'ArrowRight' || e.code === 'KeyD' ? 1 : 0
    if (!turn) return false
    e.preventDefault()
    if (!e.repeat) this.cycle(turn)
    return true
  }

  /** Spectateur : la vue passe au combattant suivant (`step` 1) ou précédent (-1), les camps l'un après l'autre. */
  private cycle(step: number) {
    const g = this.game
    if (!g?.watching) return
    const ids = [...g.fighters.values()].sort((a, b) => a.team - b.team || a.id - b.id).map((f) => f.id)
    if (!ids.length) return
    g.follow = ids[(Math.max(0, ids.indexOf(g.follow)) + step + ids.length) % ids.length]
  }

  // ------------------------------------------------------------------ état reçu

  /** Les combattants debout, là où on les voit : ce que les balles peuvent toucher. */
  private bodies(): ArenaBody[] {
    const g = this.game
    if (!g) return []
    const out: ArenaBody[] = []
    for (const f of g.fighters.values()) {
      if (!f.alive) continue
      const at = f.puppet ? f.puppet.group.position : f.id === this.host.net.id ? this.host.player.position : null
      if (at) out.push({ id: f.id, team: f.team, x: at.x, z: at.z, hurt: f.hp < f.max, shield: f.shield })
    }
    return out
  }

  /** Où l'on voit un combattant (ses pieds, monde) ; null s'il n'est pas dans l'arène. */
  private positionOf(id: number): THREE.Vector3 | null {
    const f = this.game?.fighters.get(id)
    if (!f) return null
    if (f.puppet) return f.puppet.group.position.x > -5 ? f.puppet.group.position : null
    return id === this.host.net.id ? this.host.player.position : null
  }

  /** Comment un personnage tient son arme : d'une main, prêt à lancer par-dessus l'épaule ou par en dessous, ou à deux mains. */
  private holdOf(character: CharacterId): 'lob' | 'toss' | null {
    const arm = characterById(character).arm
    return arm.lob ? (arm.fire ? 'lob' : 'toss') : null
  }

  /** Le personnage d'un combattant (le joueur : le sien). */
  private avatarOf(f: Fighter): Avatar | undefined {
    return f.puppet ? f.puppet.avatar : f.id === this.host.net.id ? this.host.player.avatar : undefined
  }

  /** La poitrine de qui se tient en `at` (repère de l'arène : celui des effets). */
  private chest(at: THREE.Vector3): THREE.Vector3 {
    return new THREE.Vector3(at.x, arenaGround(this.zone, at) + ARENA_RULES.body.h * 0.55, at.z)
  }

  /** Les mains d'un combattant (repère de l'arène), d'où part un soin ; null s'il n'est pas là. */
  private handsOf(id: number): THREE.Vector3 | null {
    const f = this.game?.fighters.get(id)
    const at = this.positionOf(id)
    if (!f || !at) return null
    const avatar = this.avatarOf(f)
    const hands = avatar?.hands(new THREE.Vector3())
    return hands ? this.deckPoint(hands) : this.chest(at)
  }

  /** Un point du monde, dans le repère de l'arène. */
  private deckPoint(p: THREE.Vector3): THREE.Vector3 {
    return p.clone().sub(this.deck!.group.position)
  }

  /**
   * Un combattant encaisse un coup (`damage`), vu de tous : il recule, du côté d'où vient le coup
   * (`from`, si on le sait), et son contour flashe blanc un instant.
   */
  private react(f: Fighter, damage: number, from: THREE.Vector3 | null) {
    const at = this.positionOf(f.id)
    let side = 0
    if (at && from) {
      // De quel côté de lui vient le coup : à sa gauche, à sa droite, ou de face.
      const yaw = f.puppet ? f.puppet.group.rotation.y : this.host.player.root.rotation.y
      const bearing = Math.atan2(from.x - at.x, from.z - at.z) - yaw
      side = Math.max(-1, Math.min(1, -Math.sin(bearing) * 1.4))
    }
    this.avatarOf(f)?.flinch(Math.min(1, 0.35 + (damage / f.max) * 2.5), side)
    f.flashUntil = performance.now() + 130
  }

  /** Le joueur vient d'être touché depuis `src` (monde) : un arc dira d'où, le temps qu'il s'efface. */
  private threat(src: THREE.Vector3, heavy: boolean, by: number) {
    const at = performance.now()
    const known = this.threatsFrom.find((t) => t.by === by)
    if (!known) return void this.threatsFrom.push({ by, src: src.clone(), at, heavy })
    known.src.copy(src)
    known.heavy = heavy || (known.heavy && at - known.at < 400)
    known.at = at
  }

  /** Les adversaires debout que le joueur voit (un buisson peut les cacher) : ceux que vise le tir rapide. */
  private foes(): { x: number; z: number }[] {
    const out: { x: number; z: number }[] = []
    for (const f of this.game?.fighters.values() ?? []) {
      if (!f.alive || f.rel !== 'enemy') continue
      const at = f.puppet?.group.position
      if (at && this.visible(f, at)) out.push({ x: at.x, z: at.z })
    }
    return out
  }

  private apply(s: ArenaState) {
    const g = this.game!
    g.state = s
    this.setBaseBarriers(!g.watching && s.warmup > 0)
    for (const st of s.fighters) {
      const f = g.fighters.get(st.id)
      if (!f) continue
      // Il finit de tomber : son image reste là où il est tombé, sans vie ni anneau (le relais l'a déjà mis à sa base).
      if (f.dying) {
        f.wait = st.wait
        continue
      }
      Object.assign(f, { hp: st.hp, alive: st.alive, shield: st.shield, wait: st.wait })
      f.puppet?.apply({ x: st.x, z: st.z, yaw: st.yaw, level: ARENA_LEVEL, anim: st.anim })
    }
    this.traps?.sync(s.traps ?? [])
    const side = (team: number) => ({ score: s.score[team], rounds: s.rounds[team] })
    this.hud.board(side(g.team), side(1 - g.team), g.goal, s.round, g.wins, s.left, s.warmup)
    this.extras?.venue.board(s.score[g.team], s.score[1 - g.team], [g.tint.ally, g.tint.enemy], s.left, s.round)
    // L'ardeur de la partie : le score qui monte, et les balles qu'on vient d'échanger (le moteur la
    // donne à sa musique ; le morceau enregistré de CMDR Arena ne la suit pas, cf. music.ts).
    const lead = Math.max(...s.score)
    const heat = Math.min(3, Math.floor((3 * lead) / g.goal) + (performance.now() - g.foughtAt < 4000 ? 1 : 0))
    if (this.gun) this.gun.matchPoint = lead >= g.goal - 1
    this.gun?.sync(s.left, s.warmup <= 0, heat)
    // Le décompte du coup d'envoi : un top par seconde, puis le signal.
    const second = Math.ceil(s.warmup)
    if (second < g.second) {
      if (second > 0) this.gun?.cue('tick', second)
      else if (g.second !== Infinity) {
        this.gun?.cue('go')
        // Le coup d'envoi : la ola fait le tour des tribunes (dans la ruche, une vague de lumière).
        this.extras?.venue.ola()
        this.voice(0.5)
      }
    }
    g.second = second
  }

  private event(e: ArenaEvent) {
    const g = this.game!
    const gun = this.gun!
    const self = this.host.net.id
    switch (e.kind) {
      case 'shot': {
        const f = g.fighters.get(e.id)
        if (f) f.revealAt = performance.now()
        if (!f || e.id === self || !this.inArena) break
        gun.remoteShot(e.id, f.team, e.character, e.o, e.d, e.to, e.dur)
        // Son geste : le recul de son arme, ou son lancer (par-dessus l'épaule, par en dessous).
        const arm = characterById(e.character).arm
        this.avatarOf(f)?.act(arm.lob ? (arm.fire ? 'lob' : 'toss') : 'recoil', undefined, arm.lob ? 1 : Math.min(1, 0.35 + arm.punch * 0.25))
        break
      }
      case 'reload': {
        // Il change de chargeur : son arme bascule, ses bras plongent, le temps qu'il lui faut.
        const f = g.fighters.get(e.id)
        if (!f || e.id === self || !this.inArena) break
        const len = characterById(f.character).stats.weapon.reload
        gun.reloadOf(e.id, len)
        this.avatarOf(f)?.act('reload', len)
        break
      }
      case 'heal': {
        const f = g.fighters.get(e.id)
        if (f) f.hp = e.hp
        if (!this.inArena) break
        // Vu de tous : Betty tend le bras, un trait la relie au soigné, des croix montent au-dessus de lui, son contour flashe.
        const betty = g.fighters.get(e.by)
        if (betty) this.avatarOf(betty)?.act('heal')
        const healer = this.handsOf(e.by)
        const target = this.positionOf(e.id)
        if (target && f) {
          gun.mend(healer, this.chest(target))
          f.flashUntil = performance.now() + 160
        }
        if (e.id === self || e.by === self) gun.healed(new THREE.Vector3(e.x, e.y + 0.3, e.z), e.amount)
        if (e.id === self) {
          this.hud.hurt(true)
          gun.soothe()
        }
        break
      }
      case 'hit': {
        const f = g.fighters.get(e.id)
        if (f) Object.assign(f, { hp: e.hp, revealAt: performance.now() })
        if (e.id === self || e.by === self) g.foughtAt = performance.now()
        // Une fleur qui mord : ses mâchoires claquent.
        const flower = e.trap !== undefined ? this.traps?.bite(e.trap, this.positionOf(e.id)) : null
        if (flower && this.inArena) gun.chomp(flower)
        // D'où vient le coup (repère de l'arène) : le tireur, ou la fleur, la flaque qui l'a mordu ou brûlé.
        const shooter = this.positionOf(e.by)
        const src = e.trap !== undefined ? this.traps?.at(e.trap) ?? null : shooter && this.deckPoint(shooter)
        // Le touché encaisse, vu de tous.
        if (f && this.inArena) this.react(f, e.dmg, src)
        if (e.id === self) {
          this.hud.hurt()
          buzz(25)
          gun.jar(0.9)
          gun.ouch(e.dmg / (f?.max ?? 100))
          if (this.inArena) gun.took(new THREE.Vector3(e.x, e.y + 0.3, e.z), e.dmg)
          if (src && this.inArena) this.threat(src, e.dmg >= 30, e.trap !== undefined ? -1000 - e.trap : e.by)
        } else if (e.by === self && this.inArena) gun.confirm(new THREE.Vector3(e.x, e.y, e.z), e.dmg, e.hp <= 0)
        break
      }
      case 'kill': {
        const victim = g.fighters.get(e.id)
        const by = g.fighters.get(e.by)
        if (!victim) break
        Object.assign(victim, { alive: false, hp: 0, ghost: true, wait: e.wait })
        // Il tombe là où il a été éliminé (un éclair, une onde à sa couleur), y reste un instant, puis
        // s'efface et reparaît à sa base, en fantôme (cf. fallen). Rien ne le touche plus.
        if (victim.dying) this.fallen(victim)
        victim.dying = { left: DEATH, from: { ...e.from }, base: { x: e.x, z: e.z, yaw: e.yaw }, spawn: null }
        if (this.inArena) gun.knockout(new THREE.Vector3(e.from.x, arenaGround(this.zone, e.from), e.from.z), g.tint[victim.rel])
        const body = victim.puppet
        if (body) body.apply({ x: e.from.x, z: e.from.z, yaw: body.group.rotation.y, level: ARENA_LEVEL, anim: 'idle' })
        this.avatarOf(victim)?.playEmote('ko')
        this.hud.kill(by && by !== victim ? by : null, victim, e.character, e.by === self || e.id === self)
        if (e.by === self && e.id !== self && this.inArena) gun.slain(new THREE.Vector3(e.from.x, arenaGround(this.zone, e.from) + ARENA_RULES.body.h * 0.6, e.from.z))
        // Le public se lève : plus fort pour une balle de match.
        this.roar(Math.max(...e.score) >= g.goal - 1 ? 1 : 0.6)
        if (g.state) g.state.score = e.score
        if (e.id === self) {
          g.streak = 0
          this.down(by && by !== victim ? by.name : '')
        } else {
          if (e.by === self) {
            buzz(45)
            // Une série sans tomber : ça se dit.
            const text = STREAKS[Math.min(++g.streak, STREAKS.length - 1)]
            gun.announce(text || tr(`${victim.name} éliminé`, `${victim.name} taken out`))
            if (text) gun.cue('go')
          } else if (Math.max(...e.score) === g.goal - 1) gun.announce(tr('Balle de match !', 'Match point!'), e.score[g.team] < g.goal - 1)
        }
        break
      }
      case 'spawn': {
        const f = g.fighters.get(e.id)
        if (!f) break
        // Il tombait encore (la manche finissait) : il reviendra une fois tombé.
        if (f.dying) f.dying.spawn = { x: e.x, z: e.z, yaw: e.yaw }
        else this.respawned(f, e)
        break
      }
      case 'left': {
        const f = g.fighters.get(e.id)
        if (f && e.id !== self) this.host.dialog.show(tr(`${f.name} a quitté la partie.`, `${f.name} left the match.`))
        this.removeFighter(e.id)
        break
      }
      case 'join':
        this.addFighter(e.fighter, e)
        break
      case 'round': {
        // La manche est jouée : chacun revient à sa base (le relais l'annonce à part), la suivante part après la pause.
        const mine = e.rounds[g.team], theirs = e.rounds[1 - g.team]
        const tally = tr(`${mine} manche${mine > 1 ? 's' : ''} à ${theirs}`, `${mine}–${theirs} in rounds`)
        if (e.winner < 0) gun.announce(tr(`Manche nulle · ${tally}`, `Round drawn · ${tally}`))
        else if (g.watching) gun.announce(tr(`Manche à l'équipe ${TEAM_NAMES[e.winner]} · ${tally}`, `Round to the ${TEAM_NAMES[e.winner]} team · ${tally}`))
        else gun.announce(e.winner === g.team ? tr(`Manche gagnée ! ${tally}`, `Round won! ${tally}`) : tr(`Manche perdue · ${tally}`, `Round lost · ${tally}`), e.winner !== g.team)
        gun.cue(e.winner === g.team ? 'go' : 'down')
        this.roar(1)
        g.second = Infinity
        break
      }
    }
  }

  /**
   * Éliminé : on tombe là où l'on a été touché (cf. fallen : on reparaît ensuite à sa base, en
   * fantôme, sans arme, le temps de revenir en jeu).
   */
  private down(by: string) {
    const g = this.game!
    g.downBy = by
    this.host.player.cancelPath()
    this.host.iso.shake(0.3)
    this.gun!.down()
    this.gun!.cue('down')
    buzz([70, 40, 130])
  }

  /**
   * Il a fini de tomber : son image s'efface dans un éclat, là où il est tombé, et reparaît à sa
   * base, en fantôme (le joueur : la vue l'y suit). S'il revenait déjà en jeu, il y revient.
   */
  private fallen(f: Fighter) {
    const d = f.dying
    if (!d) return
    f.dying = null
    const avatar = this.avatarOf(f)
    avatar?.stopEmote()
    if (avatar) avatar.root.scale.setScalar(1)
    const g = this.game!
    if (this.inArena) this.gun?.poof(new THREE.Vector3(d.from.x, arenaGround(this.zone, d.from) + 0.35, d.from.z), g.tint[f.rel])
    if (f.puppet) {
      f.puppet.apply({ x: d.base.x, z: d.base.z, yaw: d.base.yaw, level: ARENA_LEVEL, anim: 'idle' })
      f.puppet.group.position.copy(f.puppet.target)
    } else if (f.id === this.host.net.id && this.inArena) {
      const player = this.host.player
      player.position.set(d.base.x, this.deck!.y, d.base.z)
      this.host.iso.snapTo(this.matchFocus(this.host.iso) ?? player.position)
      this.host.face(d.base.yaw)
    }
    if (d.spawn) this.respawned(f, d.spawn)
  }

  /** Il revient en jeu, à sa base, protégé un instant : il apparaît dans un faisceau. */
  private respawned(f: Fighter, e: { x: number; z: number; yaw: number }) {
    Object.assign(f, { alive: true, hp: f.max, shield: true, ghost: false, wait: 0 })
    if (f.id === this.host.net.id) this.back(e)
    else if (f.puppet) {
      f.puppet.apply({ x: e.x, z: e.z, yaw: e.yaw, level: ARENA_LEVEL, anim: 'idle' })
      f.puppet.group.position.copy(f.puppet.target)
    }
    this.appear(f, e)
  }

  /** Il apparaît en `at` : un faisceau à sa couleur, une onde, et il se matérialise d'un élan. */
  private appear(f: Fighter, at: { x: number; z: number }) {
    if (!this.inArena || !this.game) return
    f.appear = APPEAR
    this.gun?.spawned(new THREE.Vector3(at.x, arenaGround(this.zone, at), at.z), this.game.tint[f.rel])
  }

  /** De retour en jeu : à sa base, protégé un instant, l'arme de son personnage en main. */
  private back(e: { x: number; z: number; yaw: number }) {
    const g = this.game!
    g.downBy = null
    const player = this.host.player
    if (!this.inArena) return
    player.position.set(e.x, this.deck!.y, e.z)
    this.host.iso.snapTo(this.matchFocus(this.host.iso) ?? player.position)
    this.host.face(e.yaw)
    this.host.sync()
    this.gun!.begin(this.character)
  }

  /** Le public des tribunes se lève (la ruche s'agite), et on l'entend (`amount` : de 0 à 1). */
  private roar(amount: number) {
    this.extras?.venue.cheer(amount)
    this.voice(amount)
  }

  /**
   * La clameur du public ; dans la ruche, son chant métallique, aux grands moments seulement ; au
   * site gardien, le carillon de la relique.
   */
  private voice(amount: number) {
    if (!this.inArena) return
    const voice = this.extras?.venue.voice
    if (voice === 'guardian') this.sfx?.chime(amount)
    else if (voice !== 'hive') this.sfx?.crowd(amount)
    else if (amount >= 1) (this.hiveSfx ??= new SalvageSfx(this.host.sound)).hive()
  }

  private finish(r: ArenaEnd) {
    const g = this.game!
    g.end = r
    g.downBy = null
    const mine = r.stats.find((s) => s.id === this.host.net.id)
    if (!g.watching) this.lastEnd = { won: r.winner < 0 ? null : r.winner === g.team, kills: mine?.kills ?? 0, deaths: mine?.deaths ?? 0 }
    const side = (team: number) => ({ score: r.score[team], rounds: r.rounds[team] })
    this.hud.board(side(g.team), side(1 - g.team), r.goal, g.state?.round ?? 1, g.wins, 0, 0)
    this.hud.waiting(null, 0)
    this.gun?.cue(r.winner === g.team ? 'go' : 'down')
    this.gun?.end()
    this.roar(1)
    this.endTimer = 30
    // Le relais vient de déclarer la partie au site : le tableau du lobby se met à jour dans un instant.
    window.setTimeout(() => void this.refreshRanks(), 4000)
    void this.stage(r)
  }

  /**
   * La scène de fin : le verdict claque, puis, sous un fondu, tous les combattants s'alignent face à
   * la caméra, les siens à gauche (le joueur au milieu d'eux), ceux d'en face à droite ; les
   * vainqueurs dansent. L'écran de fin se pose par-dessus : une fiche sous chacun, et le retour.
   */
  private async stage(r: ArenaEnd) {
    const g = this.game!
    const self = this.host.net.id
    const gone = () => this.game !== g || !!this.leaving || !this.inArena
    // Pour un spectateur, pas de victoire ni de défaite : un camp l'emporte.
    const verdict = r.winner < 0 ? tr('Égalité', 'Draw')
      : g.watching ? tr(`Victoire de l'équipe ${TEAM_NAMES[r.winner]}`, `${TEAM_NAMES[r.winner]} team wins`)
        : r.winner === g.team ? tr('Victoire !', 'Victory!') : tr('Défaite', 'Defeat')
    this.hud.shout(verdict, !g.watching && r.winner >= 0 && r.winner !== g.team)
    await new Promise((done) => window.setTimeout(done, CURTAIN))
    if (gone()) return
    await this.host.fade(true)
    if (gone()) return
    // Dans chaque camp, les plus forts au milieu ; chez les siens, c'est le joueur.
    const best = (a: ArenaEnd['stats'][number], b: ArenaEnd['stats'][number]) => b.kills - a.kills || b.damage - a.damage
    const centred = <T>(list: T[]) => (list.length > 2 ? [list[1], list[0], ...list.slice(2)] : list)
    const mates = r.stats.filter((s) => s.team === g.team).sort((a, b) => Number(b.id === self) - Number(a.id === self) || best(a, b))
    const foes = r.stats.filter((s) => s.team !== g.team).sort(best)
    const entries = [...centred(mates), ...centred(foes)].map((s): PodiumEntry => ({
      id: s.id, name: s.name, character: s.character, rel: s.id === self ? 'self' : s.team === g.team ? 'ally' : 'enemy', won: r.winner < 0 ? null : s.team === r.winner,
    }))
    this.podium ??= this.built.get(this.zone.id)!.podium = new Podium(this.deck!.group, this.host.scene, { x: (this.zone.width - 1) / 2, z: STAGE_Z })
    this.podium.show(entries, g.tint)
    this.staged = true
    this.victoryMusic.start()
    this.host.view('stage', { width: this.podium.width })
    this.hud.showEnd(r, g.team, self, entries.map((e) => e.id), () => {
      this.endTimer = 0
      void this.leave()
    }, g.watching ? verdict : undefined)
    // Le site a pu répondre avant le lever de rideau.
    const ranked = this.rankedAs
    if (ranked?.game === r.game) this.hud.ranked(ranked.ok ? tr('Partie comptée au classement', 'Match counted in the ranking') : UNRANKED[ranked.reason ?? 'site'], ranked.ok)
    this.placeCards()
    await this.host.fade(false)
  }

  /** Les fiches de l'écran de fin, sous les pieds de chaque combattant de la scène. */
  private placeCards() {
    if (!this.podium) return
    for (const { id, at } of this.podium.feet()) this.hud.card(id, this.host.project(at))
  }

  // ------------------------------------------------------------------ chaque image

  update(dt: number) {
    // Tessa, au lobby : elle se tourne vers qui s'approche de son comptoir.
    if (this.referee) {
      const here = this.host.player.position
      const near = this.host.deck() === this.host.hold && Math.hypot(here.x - ARENA_BOOTH.counter.x, here.z - ARENA_BOOTH.counter.z) < 2
      this.referee.update(dt, near ? here : null)
    }
    const g = this.game
    if (!g) return
    // Fin de partie : on rentre de soi-même au bout d'un moment.
    if (g.end && this.endTimer > 0 && (this.endTimer -= dt) <= 0) {
      void this.leave()
      return
    }
    if (g.end) this.hud.endClock(this.endTimer)
    if (this.staged) {
      this.podium!.update(dt)
      this.placeCards()
    }
    const inArena = this.inArena
    const self = this.host.net.id
    const origin = this.deck!.group.position
    const fps = this.host.fps()
    const here = this.host.player.position
    if (g.watching && inArena && !this.staged) {
      // Spectateur : sans corps, on se tient là où est le combattant suivi ; la vue, le son et les
      // murs qui s'effacent le suivent d'eux-mêmes. S'il est parti, on passe au suivant.
      if (!g.fighters.has(g.follow)) this.cycle(1)
      const followed = g.fighters.get(g.follow)
      const at = followed?.puppet?.group.position
      if (at && followed!.puppet!.group.position.x > -5) here.set(at.x, this.deck!.y, at.z)
      this.hud.spectate(followed ? { name: followed.name, rel: followed.rel, bot: followed.bot } : null)
    }
    // Les yeux au sol, les obstacles sont doublés en hauteur : on ne voit pas par-dessus ; le toit
    // de la baie et l'écran suspendu ne paraissent qu'alors.
    this.extras?.view(fps)
    this.extras?.update(dt)
    this.traps?.update(dt)
    // Boulon scanne : un adversaire caché dans un buisson, que seul son scanner trahit.
    const scan = this.bushNear
    const scanning = scan > ARENA_RULES.bush.near && [...g.fighters.values()].some((f) => {
      const at = f.puppet?.group.position
      return f.rel === 'enemy' && f.alive && !!at && inBush(this.zone, at) && Math.hypot(at.x - here.x, at.z - here.z) <= scan
    })
    const healer = !g.watching && !!characterById(this.character).stats.weapon.heal
    const now = performance.now()
    for (const f of g.fighters.values()) {
      // Il a fini de tomber : il s'efface et reparaît à sa base. Ses derniers instants au sol, il rapetisse.
      if (f.dying && (f.dying.left -= dt) <= 0) this.fallen(f)
      if (f.dying) {
        const k = THREE.MathUtils.clamp(1 - f.dying.left / DEATH_FADE, 0, 1)
        this.avatarOf(f)?.root.scale.setScalar(1 - 0.55 * k * k)
      } else if (f.appear > 0) {
        f.appear = Math.max(0, f.appear - dt)
        this.avatarOf(f)?.root.scale.setScalar(Math.max(0.05, easeOutBack(1 - f.appear / APPEAR)))
      }
    }
    for (const f of g.fighters.values()) {
      const mine = f.id === self
      const r = f.puppet
      const at = r ? r.group.position : mine ? here : undefined
      if (f.puppet) {
        f.puppet.update(dt)
        f.puppet.group.visible = inArena && !this.staged && this.visible(f, f.puppet.group.position)
      }
      const shown = inArena && !this.staged && !!at && (mine || !!r?.group.visible)
      // Qui traverse un buisson le froisse, s'il est vu (un adversaire caché ne se trahit pas ainsi).
      if (shown && f.alive) this.extras?.stir(f.id, at!.x, at!.z)
      const avatar = r ? r.avatar : this.host.player.avatar
      // Qui lance (Capucine, Jacques) tient son objet d'une main, prêt à le lancer.
      if (avatar) avatar.oneHand = this.holdOf(f.character)
      // Son contour, à sa couleur : posé dès que son modèle est là (il arrive après la doublure) ; il
      // flashe blanc un instant quand il encaisse un coup ou reçoit un soin.
      const flashing = f.flashUntil > now
      if (avatar && (!avatar.root.userData.outlined || flashing !== f.flashing)) {
        f.flashing = flashing
        outline(avatar.root, flashing ? '#ffffff' : g.tint[f.rel])
      }
      haunt(avatar, f.ghost && !f.alive && !f.dying)
      if (f.drone) {
        f.drone.root.visible = !f.ghost || f.alive
        f.drone.update(dt, mine && scanning)
      }
      // Son anneau, sous ses pieds ; il bat tant qu'il est protégé, et une bulle l'entoure (sauf effets réduits).
      f.mark.root.visible = shown && f.alive
      if (f.mark.root.visible) {
        this.local.set(at!.x, arenaGround(this.zone, at!), at!.z)
        const beat = f.shield ? 1 + 0.25 * Math.sin(performance.now() / 90) : 1
        f.mark.place(this.local, r ? r.group.rotation.y : this.host.player.root.rotation.y, beat)
      }
      const guarded = shown && f.alive && f.shield && !arenaFx.reduced
      if (guarded && !f.bubble) this.deck!.group.add((f.bubble = new ShieldBubble(g.tint[f.rel])).mesh)
      if (f.bubble) {
        const feet = shown && f.alive ? this.local.set(at!.x, arenaGround(this.zone, at!), at!.z) : null
        if (f.bubble.update(dt, feet, guarded) && feet) this.gun?.unshielded(feet)
      }
      // Sa plaque, au-dessus de sa tête : son nom et sa vie. En vue subjective, seulement s'il n'y
      // a rien entre lui et nous (la plaque ne doit pas le trahir derrière un conteneur) ; la nôtre
      // se pose en bas de l'écran (au-dessus de notre tête, par-dessus l'épaule, elle boucherait la mire).
      const waiting = !f.alive && f.ghost && !f.dying
      // Betty : les coéquipiers blessés portent une croix ; celui, au maximum de sa vie, que sa seringue traverserait, « PV max ».
      const info = {
        name: f.name, hp: f.hp, max: f.max, rel: f.rel, shield: f.shield, bot: f.bot, wait: waiting ? f.wait : undefined,
        ammo: mine && f.alive ? this.gun?.loaded : undefined, reloading: mine && this.gun?.reloading,
        heal: healer && f.rel === 'ally' && f.alive && f.hp < f.max, full: healer && f.alive && f.id === this.gun?.fullTarget,
      }
      let spot: { x: number; y: number; d: number } | null = null
      if (shown && (f.alive || waiting) && !f.dying && avatar && !g.end) {
        if (mine && fps) spot = { x: innerWidth / 2, y: innerHeight - 96, d: 0 }
        else if (!fps || arenaSight(this.zone, here, at!)) spot = this.host.project(avatar.head(this.hands))
      }
      this.hud.plate(f.id, spot, info, fps && !mine && spot ? THREE.MathUtils.clamp(1 - (spot.d - 2) / 9, 0, 1) : 1)
      if (!r) continue
      // Son arme, dans ses mains, tournée où il regarde.
      const armed = shown && f.alive && !!r.avatar
      if (r.avatar) r.avatar.carrying = f.alive
      if (armed && r.avatar!.grip(this.hands)) this.local.copy(this.hands).sub(origin)
      else if (armed) this.local.copy(at!).sub(origin)
      this.local.y = ARENA_RULES.aim - 0.02
      this.gun?.carry(f.id, f.character, armed ? this.local : null, r.group.rotation.y)
    }
    this.showThreats(inArena && !g.end && !g.watching && !this.staged, fps, here)
    if (!inArena || g.end) return
    const wait = g.state?.fighters.find((f) => f.id === self)?.wait ?? ARENA_RULES.respawn
    this.hud.waiting(g.downBy, wait)
  }

  /**
   * Les arcs des coups reçus, autour du joueur (ses pieds, vu de dessus ; la mire, dans les yeux),
   * chacun tourné vers son tireur, là où il est maintenant : il pivote quand on se tourne.
   */
  private showThreats(on: boolean, fps: boolean, here: THREE.Vector3) {
    const now = performance.now()
    this.threatsFrom = this.threatsFrom.filter((t) => now - t.at < THREAT_TIME)
    if (!on || !this.threatsFrom.length) return this.hud.threats([], null)
    const facing = this.host.facing()
    const center = fps ? { x: innerWidth / 2, y: innerHeight / 2 } : this.host.project(this.local.copy(here).setY(here.y + 0.3))
    if (!center) return this.hud.threats([], null)
    const origin = this.deck!.group.position
    const list = this.threatsFrom.map((t) => {
      let angle = facing - Math.atan2(t.src.x + origin.x - here.x, t.src.z + origin.z - here.z)
      if (!fps) {
        const q = this.host.project(this.local.copy(t.src).add(origin))
        if (q) angle = Math.atan2(q.x - center.x, -(q.y - center.y))
      }
      return { angle, alpha: Math.min(1, 1.6 * (1 - (now - t.at) / THREAT_TIME)), heavy: t.heavy }
    })
    this.hud.threats(list, center)
  }
}
