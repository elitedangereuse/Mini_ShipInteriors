import * as THREE from 'three'
import type { Sound } from '../audio'
import type { Avatar } from '../avatar'
import type { IsoCamera } from '../camera'
import { Deck } from '../deck'
import type { Wallet } from '../economy/wallet'
import { tr } from '../i18n'
import { lookId, randomLook } from '../looks'
import type { ArenaEnd, ArenaEvent, ArenaFighter, ArenaLobby, ArenaStart, ArenaState, Net, PlayerState, ServerMessage } from '../net'
import type { Player } from '../player'
import { RangeSfx } from '../range-sfx'
import { WEAPONS, type WeaponId } from '../range-weapons'
import { RemotePlayer } from '../remote'
import { loadZoneKit } from '../salvage/kit'
import type { Dialog } from '../ui'
import { ARENA_BOOTH, ARENA_LEVEL, ARENA_RETURN, ARENA_RULES, ARENA_TEAMS, arenaHidden, arenaSight, arenaZone } from '../../shared/arena.js'
import { arenaExtras, arenaLevel, type ArenaExtras } from './deck'
import { ArenaGun, type ArenaBody } from './gun'
import { ArenaMusic } from './music'
import { Podium, type PodiumEntry } from './podium'
import { Referee, REFEREE, refereeRig } from './referee'
import { arenaLive, arenaRanks } from '../furniture/arena'
import { ArenaHud, ArenaPanel, fetchRanking, RankingPanel, TEAM_NAMES, type Ranking, type Relation } from './ui'

/*
 * L'arène, côté client : le terminal du lobby, puis la partie. Le relais fait autorité (cf.
 * server/arena.js) : ici, on construit l'arène (cf. deck.ts), on y envoie le joueur, on y fait
 * jouer le moteur du stand de tir (cf. gun.ts), on montre ce que le relais envoie (les bots, les
 * tirs des autres, les points de vie, le score), et l'on gère ce qui est propre à chacun :
 * l'élimination (on tombe, on attend, on revient à sa base avec l'arme choisie), l'écran de fin.
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
 * nous l'envoie comme à un joueur ; ici, tous les combattants sont des doublures menées par ce
 * qu'il dit, les camps gardent leurs couleurs du lobby (orange, bleu), la vue suit un combattant
 * (← et → en changent), et l'on n'a ni arme ni corps : pour le bord, on est resté au lobby.
 */

/** Les couleurs du joueur : lui, les siens, ceux d'en face. */
const TINT: Record<Relation, string> = { self: '#5fe08a', ally: '#35a7ff', enemy: '#ff4d4d' }
/** Pour un spectateur, pas de « siens » : les deux camps gardent leurs couleurs du lobby. */
const WATCH_TINT: Record<Relation, string> = { self: TINT.self, ally: ARENA_TEAMS[0].color, enemy: ARENA_TEAMS[1].color }
/** Le fantôme : ce que devient un combattant éliminé, à sa base, le temps de revenir en jeu. */
const GHOST = new THREE.MeshBasicMaterial({ color: '#bfeaff', transparent: true, opacity: 0.4, depthWrite: false })

/** Passe un personnage en fantôme (translucide, bleuté), ou lui rend ses couleurs. Sans effet s'il l'est déjà. */
function haunt(avatar: Avatar | undefined, on: boolean) {
  if (!avatar || !!avatar.root.userData.ghost === on) return
  avatar.root.userData.ghost = on
  avatar.root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
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
/** Fin de partie : le temps de voir tomber le dernier, avant le rideau (ms). */
const CURTAIN = 1100
/** La scène de fin : au nord de l'arène, hors du plan (z, repère de l'arène). */
const STAGE_Z = -9

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
  remotes: Map<number, RemotePlayer>
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
  /** L'apparence du joueur (cf. looks.ts). */
  skin(): string
  /** Vue subjective (sinon : vue de dessus). */
  fps(): boolean
  /** Tourne le joueur (et son regard, en vue subjective) vers ce cap. */
  face(yaw: number): void
  /** Redit tout de suite sa position au relais (retour à la base). */
  sync(): void
  /** Position à l'écran (pixels) d'un point du monde, et sa distance à la caméra ; null s'il est derrière elle. */
  project(p: THREE.Vector3): { x: number; y: number; d: number } | null
  /** L'arme de l'arène vient d'être créée : le jeu y branche ses réglages (vitesse, pose, curseur). */
  armed(gun: ArenaGun): void
}

interface Fighter extends ArenaFighter {
  hp: number
  alive: boolean
  shield: boolean
  /** Qui il est pour le joueur (sa couleur), et quand il a tiré ou pris une balle pour la dernière fois (un buisson ne le cache plus). */
  rel: Relation
  revealAt: number
  /** Éliminé : il attend à sa base, en fantôme, encore `wait` secondes. */
  ghost: boolean
  wait: number
  /** Bot : son personnage, tenu ici (celui d'un joueur est dans `host.remotes`). */
  puppet: RemotePlayer | null
  /** Anneau au sol, à sa couleur. */
  ring: THREE.Mesh
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
  /** Éliminations du joueur depuis sa dernière chute, et dernier échange de balles où il était (pour la musique). */
  streak: number
  foughtAt: number
  /** Spectateur : on regarde la partie sans y être ; `follow` : le combattant que suit la vue. */
  watching: boolean
  follow: number
  /** Les couleurs de la partie : celles du joueur, ou celles des camps pour un spectateur. */
  tint: Record<Relation, string>
}

type Phase = 'ship' | 'loading' | 'arena'

const WEAPON_KEY = 'mini-shipinteriors-arena-weapon'
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

const ringGeometry = new THREE.RingGeometry(0.21, 0.3, 28).rotateX(-Math.PI / 2)

export class ArenaClient {
  private readonly panel: ArenaPanel
  private readonly hud = new ArenaHud()
  private readonly ranking = new RankingPanel()
  private readonly zone = arenaZone()
  private lobby: ArenaLobby = { rooms: [] }
  private game: Game | null = null
  private phase: Phase = 'ship'
  /** L'arène, construite au premier départ, puis gardée : son plan ne change pas. */
  deck: Deck | null = null
  /** Le moteur de tir, dans l'arène (créé avec elle). */
  gun: ArenaGun | null = null
  private weapon: WeaponId = 'pistol'
  /** Éliminé : l'arme sous le curseur, que les flèches déplacent et qu'Entrée valide. */
  private cursor = 0
  private quitArmed = 0
  private endTimer = 0
  private leaving: Promise<void> | null = null
  /** Tessa, l'arbitre, à son guichet du lobby (chargée à part) ; et ce qu'elle retient de notre dernière partie. */
  referee: Referee | null = null
  private lastEnd: { won: boolean | null; kills: number; deaths: number } | null = null
  /** Ce qui dépend du joueur dans le décor : la couleur des bases, l'étage des obstacles en vue subjective. */
  private extras: ArenaExtras | null = null
  private readonly hands = new THREE.Vector3()
  private readonly local = new THREE.Vector3()
  private readonly focus = new THREE.Vector3()
  /** Ce que le site a répondu pour la dernière partie finie (il peut répondre avant que l'écran de fin ne soit posé). */
  private rankedAs: { game: string; ok: boolean; reason?: string } | null = null
  /** La scène de fin (construite à la première), et si l'on y est. */
  private podium: Podium | null = null
  private staged = false

  constructor(private host: ArenaHost) {
    try {
      const saved = localStorage.getItem(WEAPON_KEY)
      if (WEAPONS.some((w) => w.id === saved)) this.weapon = saved as WeaponId
    } catch {}
    this.panel = new ArenaPanel({
      join: (room, team) => {
        host.net.sendArena('join', { room, team, weapon: this.weapon })
        void loadZoneKit()
      },
      leave: () => host.net.sendArena('leave'),
      side: (team) => host.net.sendArena('side', { team }),
      settings: (s) => host.net.sendArena('settings', s),
      weapon: (id) => this.choose(id),
      watch: (room) => this.watch(room),
      ready: (on) => {
        host.net.sendArena('ready', { ready: on })
        if (on) void loadZoneKit()
      },
    })
    this.panel.weapon = this.weapon
    this.hud.onQuit = () => this.quit()
    this.hud.onWeapon = (id) => this.choose(id)
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

  /** Un autre joueur de l'arène se voit-il ? Ceux de sa partie, sauf un adversaire caché dans un buisson. */
  sees(id: number): boolean {
    const f = this.game?.fighters.get(id)
    // Un spectateur voit des doublures : le vrai personnage, dont il ne reçoit pas les pas, reste caché.
    if (!f || !this.inArena || this.staged || this.game!.watching) return false
    const r = f.puppet ?? this.host.remotes.get(id)
    return !!r && this.visible(f, r.group.position)
  }

  private visible(f: Fighter, at: THREE.Vector3): boolean {
    // Un spectateur voit tout le monde, buissons compris.
    if (f.rel !== 'enemy' || this.game?.watching) return true
    const revealed = performance.now() - f.revealAt < ARENA_RULES.bush.reveal * 1000
    return !arenaHidden(this.zone, at, this.host.player.position, revealed)
  }

  // ------------------------------------------------------------------ lobby

  openTerminal() {
    this.refresh()
    this.panel.open()
    void loadZoneKit()
  }

  private refresh() {
    this.panel.update(this.lobby, this.host.net.id, this.host.net.online)
    // Le tableau du mur et l'hologramme du lobby disent les parties en cours.
    const games = this.lobby.rooms.filter((r) => r.status === 'playing').map((r) => ({ lobby: r.id, rounds: r.rounds ?? [0, 0], score: r.score ?? [0, 0] }))
    if (JSON.stringify(games) === JSON.stringify(arenaLive.games)) return
    arenaLive.games = games
    arenaLive.stamp++
  }

  /** Regarder la partie du lobby `room` (du terminal) : le relais répond par son départ, en spectateur. */
  private watch(room: number) {
    if (this.game) return
    this.host.net.sendArena('watch', { room })
    void loadZoneKit()
  }

  /** De l'hologramme du lobby : regarder la partie en cours, s'il y en a une. */
  watchLive() {
    const live = this.lobby.rooms.find((r) => r.status === 'playing')
    if (live) this.watch(live.id)
    else this.host.dialog.show(tr('Aucune partie en cours : l\'hologramme montre l\'arène au repos. Dès qu\'une partie se joue, on la regarde d\'ici.', 'No match in progress: the hologram shows the arena at rest. As soon as one is on, you watch it from here.'))
  }

  /** L'arme choisie : au terminal, ou en attendant de revenir à sa base. */
  private choose(id: WeaponId) {
    this.weapon = this.panel.weapon = id
    try {
      localStorage.setItem(WEAPON_KEY, id)
    } catch {}
    this.host.net.sendArena('weapon', { weapon: id })
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

  /** Construit l'arène (une fois) et son moteur de tir. */
  private async build(): Promise<Deck> {
    if (this.deck) return this.deck
    const kit = await loadZoneKit()
    if (this.deck) return this.deck
    const zone = this.zone
    const deck = new Deck(arenaLevel(zone, kit))
    // Chaque obstacle bloque sa tuile entière, comme pour le relais.
    for (let z = 0; z < zone.height; z++) {
      for (let x = 0; x < zone.width; x++) {
        if (zone.blocked[z * zone.width + x] && zone.room[z * zone.width + x] !== ' ') deck.colliders.push({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5 })
      }
    }
    deck.pathfinder.invalidate()
    deck.group.visible = false
    this.extras = arenaExtras(zone, kit)
    deck.group.add(this.extras.group)
    this.host.scene.add(deck.group)
    this.deck = deck
    const gun = new ArenaGun(deck.group, this.host.dialog, this.host.wallet, new RangeSfx(this.host.sound), new ArenaMusic(this.host.sound))
    gun.host = {
      zone,
      self: () => this.host.net.id,
      team: () => this.game?.team ?? 0,
      bodies: () => this.bodies(),
      foes: () => this.foes(),
      canFire: () => !!this.game && !this.game.end && !this.game.watching && this.game.downBy === null && (this.game.state?.warmup ?? 1) <= 0,
      fire: (o, d) => this.host.net.sendArena('fire', { o, d }),
      quit: () => this.quit(),
    }
    this.gun = gun
    this.host.armed(gun)
    return deck
  }

  private async start(m: ArenaStart) {
    this.closePanels()
    if (this.game) this.dispose()
    this.phase = 'loading'
    let deck: Deck
    try {
      deck = await this.build()
    } catch {
      // Le kit de l'arène n'a pas pu se charger : on rend sa place, plutôt que de rester figé au lobby.
      this.phase = 'ship'
      this.host.net.sendArena('quit')
      this.host.dialog.show(tr('L\'arène n\'a pas pu se charger : réessayez dans un instant.', 'The arena failed to load: try again in a moment.'))
      return
    }
    const watching = !!m.watch
    const game: Game = {
      id: m.game, team: m.team, goal: m.goal, wins: m.wins, fighters: new Map(), state: null, end: null, downBy: null, second: Infinity, streak: 0, foughtAt: 0,
      watching, follow: m.fighters[0]?.id ?? 0, tint: watching ? WATCH_TINT : TINT,
    }
    this.game = game
    this.rankedAs = null
    // Un spectateur mène tout le monde en doublure : il ne reçoit pas les pas des joueurs.
    for (const f of m.fighters) this.addFighter(f, f.bot || watching ? null : undefined)
    const mine = game.fighters.get(this.host.net.id)
    if (mine) this.weapon = this.panel.weapon = mine.weapon
    this.hud.show(true, watching)
    this.hud.board({ score: 0, rounds: 0 }, { score: 0, rounds: 0 }, m.goal, 1, m.wins, m.duration, m.warmup)
    // Sa base en bleu, celle d'en face en rouge (pour un spectateur : chacune à la couleur de son camp).
    this.extras?.paintBases(m.team === 0 ? [game.tint.ally, game.tint.enemy] : [game.tint.enemy, game.tint.ally])
    await this.host.moveTo(deck, m.spawn, () => this.host.view('match', { team: m.team }))
    // Reparti entre-temps (liaison perdue pendant le fondu).
    if (this.game !== game) return
    this.phase = 'arena'
    this.host.face(m.spawn.yaw)
    this.gun!.watching = watching
    this.gun!.begin(this.weapon)
    if (watching) {
      // Ni arme ni mire : le moteur de tir ne sert qu'à montrer les balles des autres.
      this.gun!.down()
      return
    }
    // Au doigt, le bandeau est étroit : le score dit déjà la limite de points.
    this.host.dialog.show(COARSE
      ? tr('Vos adversaires sont en rouge ; les buissons cachent qui s\'y tient.', 'Your opponents are in red; bushes hide whoever stands in them.')
      : tr(
        `${m.wins} manches gagnantes : la première équipe à ${m.goal} points gagne la manche. Vos adversaires sont en rouge ; les buissons cachent qui s'y tient.`,
        `First to ${m.wins} rounds: the first team to ${m.goal} points takes the round. Your opponents are in red; bushes hide whoever stands in them.`,
      ))
  }

  /** @param at où poser un bot (undefined : un joueur, son personnage est celui du bord) */
  private addFighter(f: ArenaFighter, at: { x: number; z: number; yaw: number } | null | undefined) {
    const g = this.game!
    const rel: Relation = f.id === this.host.net.id ? 'self' : f.team === g.team ? 'ally' : 'enemy'
    const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: g.tint[rel], transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6 }))
    ring.visible = false
    ring.renderOrder = 2
    this.deck!.group.add(ring)
    let puppet: RemotePlayer | null = null
    if (f.bot || g.watching) {
      const deckY = this.deck!.y
      // Hors de vue le temps que le premier état du relais donne sa place. Un joueur garde son apparence du bord.
      const skin = (!f.bot && this.host.remotes.get(f.id)?.skin) || lookId(randomLook())
      const state = { id: f.id, name: f.name, skin, x: at?.x ?? -10, z: at?.z ?? -10, yaw: at?.yaw ?? 0, level: ARENA_LEVEL, anim: 'idle' } as PlayerState
      puppet = new RemotePlayer(f.id, state, () => deckY)
      puppet.group.visible = false
      this.host.scene.add(puppet.group)
    }
    g.fighters.set(f.id, { ...f, hp: ARENA_RULES.hp, alive: true, shield: false, rel, revealAt: 0, ghost: false, wait: 0, puppet, ring })
  }

  private removeFighter(id: number) {
    const f = this.game?.fighters.get(id)
    if (!f) return
    this.game!.fighters.delete(id)
    this.gun?.disarm(id)
    this.hud.dropPlate(id)
    f.ring.removeFromParent()
    ;(f.ring.material as THREE.Material).dispose()
    if (f.puppet) f.puppet.group.removeFromParent()
    else {
      const avatar = id === this.host.net.id ? this.host.player.avatar : this.host.remotes.get(id)?.avatar
      haunt(avatar, false)
      if (avatar && id !== this.host.net.id) avatar.carrying = false
    }
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
    if (this.inArena) await this.host.moveTo(this.host.hold, ARENA_RETURN, () => this.unstage())
    if (this.game !== g) return
    this.dispose()
    if (message) this.host.dialog.show(message)
  }

  private dispose() {
    const g = this.game
    if (!g) return
    this.gun?.end()
    for (const id of [...g.fighters.keys()]) this.removeFighter(id)
    haunt(this.host.player.avatar, false)
    this.unstage()
    this.hud.closeEnd()
    this.hud.show(false)
    this.game = null
    this.phase = 'ship'
    this.endTimer = 0
  }

  /** La scène de fin est démontée, et la vue redevient celle d'avant la partie. */
  private unstage() {
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

  /**
   * Touches du mode ; true si la touche est prise. Éliminé (le curseur est pris par la mire, en vue
   * subjective) : ← et → déplacent le choix de l'arme du retour, Entrée, Espace ou E le valident ;
   * 1 à 5 choisissent et valident d'un coup.
   */
  keyDown(e: KeyboardEvent): boolean {
    const g = this.game
    if (g?.watching && this.inArena && !g.end) {
      // Spectateur : ← et → passent d'un combattant à l'autre.
      const turn = e.code === 'ArrowLeft' || e.code === 'KeyA' ? -1 : e.code === 'ArrowRight' || e.code === 'KeyD' ? 1 : 0
      if (!turn) return false
      e.preventDefault()
      if (!e.repeat) this.cycle(turn)
      return true
    }
    if (!g || !this.inArena || g.end || g.downBy === null) return false
    const digit = /^Digit([1-5])$/.exec(e.code)
    const step = e.code === 'ArrowLeft' || e.code === 'KeyA' ? -1 : e.code === 'ArrowRight' || e.code === 'KeyD' ? 1 : 0
    const confirm = e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space' || e.code === 'KeyE'
    if (!digit && !step && !confirm) return false
    e.preventDefault()
    if (e.repeat && !step) return true
    if (digit) this.cursor = Number(digit[1]) - 1
    else this.cursor = (this.cursor + step + WEAPONS.length) % WEAPONS.length
    if (digit || confirm) this.choose(WEAPONS[this.cursor].id)
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
      const at = f.id === this.host.net.id ? this.host.player.position : (f.puppet ?? this.host.remotes.get(f.id))?.group.position
      if (at) out.push({ id: f.id, team: f.team, x: at.x, z: at.z })
    }
    return out
  }

  /** Les adversaires debout que le joueur voit (un buisson peut les cacher) : ceux que vise le tir rapide. */
  private foes(): { x: number; z: number }[] {
    const out: { x: number; z: number }[] = []
    for (const f of this.game?.fighters.values() ?? []) {
      if (!f.alive || f.rel !== 'enemy') continue
      const at = (f.puppet ?? this.host.remotes.get(f.id))?.group.position
      if (at && this.visible(f, at)) out.push({ x: at.x, z: at.z })
    }
    return out
  }

  private apply(s: ArenaState) {
    const g = this.game!
    g.state = s
    for (const st of s.fighters) {
      const f = g.fighters.get(st.id)
      if (!f) continue
      Object.assign(f, { hp: st.hp, alive: st.alive, shield: st.shield, weapon: st.weapon, wait: st.wait })
      f.puppet?.apply({ x: st.x, z: st.z, yaw: st.yaw, level: ARENA_LEVEL, anim: st.anim })
    }
    const side = (team: number) => ({ score: s.score[team], rounds: s.rounds[team] })
    this.hud.board(side(g.team), side(1 - g.team), g.goal, s.round, g.wins, s.left, s.warmup)
    // La musique suit la partie : le score qui monte, et les balles qu'on vient d'échanger.
    const lead = Math.max(...s.score)
    const heat = Math.min(3, Math.floor((3 * lead) / g.goal) + (performance.now() - g.foughtAt < 4000 ? 1 : 0))
    if (this.gun) this.gun.matchPoint = lead >= g.goal - 1
    this.gun?.sync(s.left, s.warmup <= 0, heat)
    // Le décompte du coup d'envoi : un top par seconde, puis le signal.
    const second = Math.ceil(s.warmup)
    if (second < g.second) {
      if (second > 0) this.gun?.cue('tick', second)
      else if (g.second !== Infinity) this.gun?.cue('go')
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
        if (f && e.id !== self && this.inArena) gun.remoteShot(e.id, f.team, e.weapon, e.o, e.d)
        break
      }
      case 'hit': {
        const f = g.fighters.get(e.id)
        if (f) Object.assign(f, { hp: e.hp, revealAt: performance.now() })
        if (e.id === self || e.by === self) g.foughtAt = performance.now()
        if (e.id === self) {
          this.hud.hurt()
          buzz(25)
          gun.jar(0.9)
          gun.cue('hurt')
          if (this.inArena) gun.took(new THREE.Vector3(e.x, e.y + 0.3, e.z), e.dmg)
        } else if (e.by === self && this.inArena) gun.confirm(new THREE.Vector3(e.x, e.y, e.z), e.dmg, e.hp <= 0)
        break
      }
      case 'kill': {
        const victim = g.fighters.get(e.id)
        const by = g.fighters.get(e.by)
        if (!victim) break
        Object.assign(victim, { alive: false, hp: 0, ghost: true, wait: e.wait })
        // Il disparaît là où il est tombé, et reparaît à sa base, en fantôme.
        if (this.inArena) gun.poof(new THREE.Vector3(e.from.x, 0.35, e.from.z), g.tint[victim.rel])
        const body = victim.puppet ?? (e.id === self ? null : this.host.remotes.get(e.id))
        if (body) {
          body.apply({ x: e.x, z: e.z, yaw: e.yaw, level: ARENA_LEVEL, anim: 'idle' })
          body.group.position.copy(body.target)
        }
        this.hud.kill(by && by !== victim ? by : null, victim, e.weapon, e.by === self || e.id === self)
        if (g.state) g.state.score = e.score
        if (e.id === self) {
          g.streak = 0
          this.down(by && by !== victim ? by.name : '', e)
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
        Object.assign(f, { alive: true, hp: ARENA_RULES.hp, shield: true, weapon: e.weapon, ghost: false, wait: 0 })
        if (e.id === self) this.back(e)
        else if (f.puppet) {
          f.puppet.apply({ x: e.x, z: e.z, yaw: e.yaw, level: ARENA_LEVEL, anim: 'idle' })
          f.puppet.group.position.copy(f.puppet.target)
        }
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
        g.second = Infinity
        break
      }
    }
  }

  /** Éliminé : on reparaît à sa base, en fantôme, sans arme, le temps de revenir en jeu. */
  private down(by: string, at: { x: number; z: number; yaw: number }) {
    const g = this.game!
    g.downBy = by
    this.cursor = Math.max(0, WEAPONS.findIndex((w) => w.id === this.weapon))
    const player = this.host.player
    player.cancelPath()
    this.host.iso.shake(0.3)
    if (this.inArena) {
      player.position.set(at.x, this.deck!.y, at.z)
      this.host.iso.snapTo(this.matchFocus(this.host.iso) ?? player.position)
      this.host.face(at.yaw)
    }
    this.gun!.down()
    this.gun!.cue('down')
    buzz([70, 40, 130])
  }

  /** De retour en jeu : à sa base, protégé un instant, l'arme choisie en main. */
  private back(e: { x: number; z: number; yaw: number; weapon: WeaponId }) {
    const g = this.game!
    g.downBy = null
    const player = this.host.player
    if (!this.inArena) return
    player.position.set(e.x, this.deck!.y, e.z)
    this.host.iso.snapTo(this.matchFocus(this.host.iso) ?? player.position)
    this.host.face(e.yaw)
    this.host.sync()
    this.weapon = e.weapon
    this.gun!.begin(e.weapon)
  }

  private finish(r: ArenaEnd) {
    const g = this.game!
    g.end = r
    g.downBy = null
    const mine = r.stats.find((s) => s.id === this.host.net.id)
    if (!g.watching) this.lastEnd = { won: r.winner < 0 ? null : r.winner === g.team, kills: mine?.kills ?? 0, deaths: mine?.deaths ?? 0 }
    const side = (team: number) => ({ score: r.score[team], rounds: r.rounds[team] })
    this.hud.board(side(g.team), side(1 - g.team), r.goal, g.state?.round ?? 1, g.wins, 0, 0)
    this.hud.waiting(null, 0, this.weapon, this.cursor)
    this.gun?.cue(r.winner === g.team ? 'go' : 'down')
    this.gun?.end()
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
    const entries = [...centred(mates), ...centred(foes)].map((s): PodiumEntry => {
      const f = g.fighters.get(s.id)
      const skin = s.id === self ? this.host.skin() : (f?.puppet ?? this.host.remotes.get(s.id))?.skin ?? lookId(randomLook())
      return { id: s.id, name: s.name, skin, rel: s.id === self ? 'self' : s.team === g.team ? 'ally' : 'enemy', won: r.winner < 0 ? null : s.team === r.winner }
    })
    this.podium ??= new Podium(this.deck!.group, this.host.scene, { x: (this.zone.width - 1) / 2, z: STAGE_Z })
    this.podium.show(entries, g.tint)
    this.staged = true
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
    // Les yeux au sol, les obstacles sont doublés en hauteur : on ne voit pas par-dessus.
    if (this.extras) this.extras.upper.visible = fps
    for (const f of g.fighters.values()) {
      const mine = f.id === self
      const r = mine ? null : f.puppet ?? this.host.remotes.get(f.id) ?? null
      const at = mine ? here : r?.group.position
      if (f.puppet) {
        f.puppet.update(dt)
        f.puppet.group.visible = inArena && !this.staged && this.visible(f, f.puppet.group.position)
      }
      const shown = inArena && !this.staged && !!at && (mine || !!r?.group.visible)
      const avatar = mine ? this.host.player.avatar : r?.avatar
      haunt(avatar, f.ghost && !f.alive)
      // Son anneau, sous ses pieds ; il bat tant qu'il est protégé.
      f.ring.visible = shown && f.alive
      if (f.ring.visible) {
        f.ring.position.set(at!.x, 0.04, at!.z)
        const beat = f.shield ? 1 + 0.25 * Math.sin(performance.now() / 90) : 1
        f.ring.scale.setScalar((mine ? 1.15 : 1) * beat)
      }
      // Sa plaque, au-dessus de sa tête : son nom et sa vie. En vue subjective, seulement s'il n'y
      // a rien entre lui et nous (la plaque ne doit pas le trahir derrière un conteneur) ; la nôtre
      // se pose en bas de l'écran (au-dessus de notre tête, par-dessus l'épaule, elle boucherait la mire).
      const waiting = !f.alive && f.ghost
      const info = {
        name: f.name, hp: f.hp, rel: f.rel, shield: f.shield, bot: f.bot, wait: waiting ? f.wait : undefined,
        ammo: mine && f.alive ? this.gun?.loaded : undefined, reloading: mine && this.gun?.reloading,
      }
      let spot: { x: number; y: number; d: number } | null = null
      if (shown && (f.alive || waiting) && avatar && !g.end) {
        if (mine && fps) spot = { x: innerWidth / 2, y: innerHeight - 96, d: 0 }
        else if (!fps || arenaSight(this.zone, here, at!)) spot = this.host.project(avatar.head(this.hands))
      }
      this.hud.plate(f.id, spot, info, fps && !mine && spot ? THREE.MathUtils.clamp(1 - (spot.d - 2) / 9, 0, 1) : 1)
      if (mine || !r) continue
      // Son arme, dans ses mains, tournée où il regarde.
      const armed = shown && f.alive && !!r.avatar
      if (r.avatar) r.avatar.carrying = f.alive
      if (armed && r.avatar!.hands(this.hands)) this.local.copy(this.hands).sub(origin)
      else if (armed) this.local.copy(at!).sub(origin)
      this.local.y = ARENA_RULES.aim - 0.02
      this.gun?.carry(f.id, f.weapon, armed ? this.local : null, r.group.rotation.y)
    }
    if (!inArena || g.end) return
    const wait = g.state?.fighters.find((f) => f.id === self)?.wait ?? ARENA_RULES.respawn
    this.hud.waiting(g.downBy, wait, this.weapon, this.cursor)
  }
}
