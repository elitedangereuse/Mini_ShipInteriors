import type { Sound } from '../audio'
import type { Net, FightState, ServerMessage } from '../net'
import { EN, tr } from '../i18n'
import { icon, type IconName } from '../icons'
import { Asteroids, AsteroidsPilot } from './asteroids'
import { Cargo, CargoPilot } from './cargo'
import { Fight, fightDemo, drawFightIntro, drawFightSelection } from './fight'
import { FightMusic } from './fight-music'
import { FIGHT_ROSTER, fighterProfile, type FighterId } from '../../shared/fight-roster.js'
import { padScore, pixelText, textWidth, type ArcadeGame, type Button, type GameId, type Pad } from './game'
import { arcadeTiers } from '../economy/data'
import { fetchBoard, localBest, saveLocalBest, submitScore, type ArcadeCredits, type Board, type Submission } from './scores'
import { ArcadeSfx } from './sfx'
import { Viper, ViperPilot } from './viper'

/*
 * La borne, en grand : fronton au néon, écran cathodique, pupitre. On y arrive depuis une borne
 * du vaisseau (cf. main.ts) ; chargée à la première partie. L'écran titre fait tourner une
 * démonstration (le pilote automatique du jeu) et alterne avec le tableau des meilleurs scores ;
 * une partie finie inscrit le score du CMDR sur le site (cf. scores.ts).
 */

interface GameInfo {
  title: string
  tagline: string
  /** Néon du fronton, flancs de la borne (les mêmes que dans le vaisseau, cf. furniture/arcade.ts). */
  neon: string
  side: string
  /** Aide du pupitre : touches, et ce qu'elles font. */
  help: [string[], string][]
}

const MOVE = tr('Déplacer', 'Move')
const PAUSE: [string[], string] = [['P'], tr('Pause', 'Pause')]

const GAMES: Record<GameId, GameInfo> = {
  fight: {
    title: 'ORBITAL CLASH',
    tagline: tr('DUEL DANS LE HANGAR ORBITAL', 'ORBITAL HANGAR DUEL'),
    neon: '#76eeff', side: '#322457',
    help: [
      [['1', '2'], tr('Solo / duel en ligne (titre)', 'Solo / online duel (title)')],
      [['←', '→'], tr('Choisir le combattant (titre)', 'Choose fighter (title)')],
      [[tr('Z Q S D', 'W A S D')], tr('Bouger / sauter / baisser', 'Move / jump / crouch')],
      [['F', 'G', 'H'], tr('Poing / pied / plasma', 'Punch / kick / plasma')],
      [[tr('Flèches', 'Arrows')], tr('Bouger / sauter / baisser aussi', 'Also move / jump / crouch')],
      [[tr('Reculer', 'Move back')], tr('Garde (bas + recul : garde basse)', 'Block (down + back: low block)')],
      [[tr('Espace', 'Space')], tr('Jouer / rejouer', 'Play / rematch')], [['P'], tr('Pause (solo)', 'Pause (solo)')],
    ],
  },
  cargo: {
    title: tr('CARGAISON', 'CARGO'),
    tagline: tr('CHARGEZ LA SOUTE, LIVREZ LES LIGNES', 'LOAD THE HOLD, DELIVER THE LINES'),
    neon: '#9dff5a',
    side: '#46561f',
    help: [
      [['←', '→'], MOVE],
      [['↑'], tr('Tourner', 'Rotate')],
      [['X'], tr('Tourner à gauche', 'Rotate left')],
      [['↓'], tr('Descendre', 'Soft drop')],
      [[tr('Espace', 'Space')], tr('Lâcher', 'Drop')],
      [[tr('Maj', 'Shift')], tr('Réserve', 'Hold')],
      PAUSE,
    ],
  },
  viper: {
    title: 'VIPER',
    tagline: tr('RAMASSEZ LE FRET, GARE À LA QUEUE', 'SCOOP THE CARGO, MIND YOUR TAIL'),
    neon: '#ffb03a',
    side: '#5a1446',
    help: [[['↑', '↓', '←', '→'], tr('Piloter', 'Steer')], PAUSE],
  },
  asteroids: {
    title: tr('ASTÉROÏDES', 'ASTEROIDS'),
    tagline: tr('PULVÉRISEZ LES ROCHES, FUYEZ LES THARGOÏDES', 'BLAST THE ROCKS, DODGE THE THARGOIDS'),
    neon: '#ffe14f',
    side: '#7a1f1f',
    help: [
      [['←', '→'], tr('Tourner', 'Rotate')],
      [['↑'], tr('Poussée', 'Thrust')],
      [[tr('Espace', 'Space')], tr('Tirer', 'Fire')],
      [['↓'], tr('Saut FSD', 'FSD jump')],
      PAUSE,
    ],
  },
}

/** Touches (position physique : KeyW/KeyA sont Z/Q sur un clavier AZERTY) → boutons de la borne. */
const KEYS: Record<string, Button> = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  Space: 'a', Enter: 'a', NumpadEnter: 'a', KeyX: 'b', ShiftLeft: 'c', ShiftRight: 'c', KeyC: 'c',
}

const FIGHT_KEYS: Record<string, Button> = {
  KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down', KeyF: 'a', KeyG: 'b', KeyH: 'c',
  Space: 'a', Enter: 'a', NumpadEnter: 'a',
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
}

type Mode = 'intro' | 'title' | 'play' | 'pause' | 'over'

/** Écran tactile : la borne affiche sa manette, et parle de ses boutons plutôt que du clavier. */
const TOUCH = matchMedia('(pointer: coarse)').matches
const START = TOUCH ? 'A' : tr('ESPACE', 'SPACE')

/** Manette lâchée (fin de partie : le jeu finit ses animations). */
const IDLE: Pad = { held: new Set(), pressed: new Set() }

function create(id: GameId): ArcadeGame {
  if (id === 'fight') return new Fight()
  return id === 'cargo' ? new Cargo() : id === 'viper' ? new Viper() : new Asteroids()
}

/** Une partie de démonstration et son pilote automatique, déjà en cours (quelques secondes d'avance). */
function demo(id: GameId): { game: ArcadeGame; next: (dt: number) => Pad } {
  let d: { game: ArcadeGame; next: (dt: number) => Pad }
  if (id === 'fight') return fightDemo()
  if (id === 'cargo') {
    const game = new Cargo()
    const pilot = new CargoPilot(game)
    d = { game, next: (dt) => pilot.next(dt) }
  } else if (id === 'viper') {
    const game = new Viper()
    const pilot = new ViperPilot(game)
    d = { game, next: () => pilot.next() }
  } else {
    const game = new Asteroids()
    const pilot = new AsteroidsPilot(game)
    d = { game, next: (dt) => pilot.next(dt) }
  }
  for (let i = 0; i < 400 && !d.game.over; i++) d.game.step(0.03, d.next(0.03))
  d.game.sounds.length = 0
  return d.game.over ? demo(id) : d
}

export interface CabinetHost {
  sound: Sound
  net: Net
  /** Le joueur est-il un CMDR connecté au site (son score s'inscrit au classement) ? */
  linked: () => boolean
  /** Un record personnel rapporte des crédits (paliers franchis, record du vaisseau). */
  onCredits?: (credits: ArcadeCredits) => void
}

/** Nombre écrit pour la police pixel, par milliers : « 25 000 ». */
const grouped = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

export class ArcadeCabinet {
  private readonly el: HTMLDivElement
  private readonly canvas: HTMLCanvasElement
  private readonly g: CanvasRenderingContext2D
  private readonly marquee: HTMLDivElement
  private readonly help: HTMLDivElement
  private readonly fightRoster: HTMLDivElement
  private selectedFighter: FighterId = 'nova'
  private fightMusic: FightMusic | null = null
  private readonly fightMenu: HTMLDivElement
  private fightMode: 'solo' | 'online' = 'solo'
  private readonly fightStatus: HTMLDivElement
  private fightState: FightState | null = null
  private fightJoined = false
  private fightSendAt = 0
  private fightWaitingSince = 0
  private readonly fightPressed = new Set<Button>()
  private id: GameId = 'cargo'
  private info = GAMES.cargo
  private game: ArcadeGame | null = null
  private attract: { game: ArcadeGame; next: (dt: number) => Pad } | null = null
  private attractOver = 0
  private mode: Mode = 'title'
  private modeTime = 0
  private readonly pad: Pad = { held: new Set(), pressed: new Set() }
  private readonly pressed = new Set<Button>()
  private readonly held = new Set<Button>()
  private raf = 0
  private last = 0
  private time = 0
  private duration = 0
  /** Tableau des scores du jeu : undefined tant que le site n'a pas répondu, null s'il ne répond pas. */
  private board: Board | null | undefined = undefined
  private result: Submission | 'pending' | null = null
  private personal = false
  private sfx: ArcadeSfx | null = null
  onClose?: () => void

  constructor(private readonly host: CabinetHost) {
    this.el = document.createElement('div')
    this.el.className = 'arcade'
    this.el.hidden = true
    this.el.setAttribute('role', 'dialog')
    this.el.setAttribute('aria-modal', 'true')
    const cab = document.createElement('div')
    cab.className = 'arc-cab'
    this.marquee = document.createElement('div')
    this.marquee.className = 'arc-marquee'
    const bezel = document.createElement('div')
    bezel.className = 'arc-bezel'
    const screen = document.createElement('div')
    screen.className = 'arc-screen'
    this.canvas = document.createElement('canvas')
    this.g = this.canvas.getContext('2d')!
    const crt = document.createElement('div')
    crt.className = 'arc-crt'
    screen.append(this.canvas, crt)
    bezel.append(screen)
    const deck = document.createElement('div')
    deck.className = 'arc-deck'
    this.help = document.createElement('div')
    this.help.className = 'arc-help'
    const quit = document.createElement('button')
    quit.className = 'arc-quit'
    quit.append(icon('x'), tr('Quitter', 'Leave'))
    const k = document.createElement('kbd')
    k.textContent = tr('Échap', 'Esc')
    quit.append(k)
    quit.onclick = () => this.close()
    this.fightMenu = document.createElement('div')
    this.fightMenu.className = 'arc-fight-menu'
    for (const [mode, label] of [['solo', tr('Solo contre CPU', 'Solo vs CPU')], ['online', tr('2 joueurs en ligne', '2 players online')]] as const) {
      const btn = document.createElement('button')
      btn.textContent = label
      btn.dataset.mode = mode
      btn.onclick = () => {
        this.leaveFight()
        this.fightMode = mode
        this.game = null
        this.clearInput()
        this.setMode('title')
        this.updateFightMenu()
      }
      this.fightMenu.append(btn)
    }
    const start = document.createElement('button')
    start.textContent = tr('Combat !', 'Fight!')
    start.onclick = () => this.start()
    this.fightMenu.append(start)
    this.fightStatus = document.createElement('div')
    this.fightStatus.className = 'arc-fight-status'
    this.fightStatus.setAttribute('aria-live', 'polite')
    this.fightMenu.append(this.fightStatus)
    this.fightRoster = document.createElement('div')
    this.fightRoster.className = 'arc-fight-roster'
    this.fightRoster.setAttribute('role', 'group')
    this.fightRoster.setAttribute('aria-label', tr('Choisir un combattant', 'Choose a fighter'))
    for (const profile of FIGHT_ROSTER) {
      const btn = document.createElement('button')
      btn.textContent = profile.name
      btn.dataset.fighter = profile.id
      btn.style.setProperty('--fighter', profile.color)
      btn.title = `${tr(...profile.role)} · + ${tr(...profile.strength)} · - ${tr(...profile.weakness)}`
      btn.onclick = () => this.chooseFighter(profile.id)
      this.fightRoster.append(btn)
    }
    deck.append(this.help, quit)
    cab.append(this.marquee, bezel, this.fightMenu, this.fightRoster, deck)
    this.el.append(cab, this.touchPad())
    document.body.append(this.el)
    // Clic à côté de la borne : on la quitte.
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.el) this.close()
    })
  }

  get isOpen(): boolean {
    return !this.el.hidden
  }

  /** Manette tactile (écrans sans clavier) : croix directionnelle, trois boutons. */
  private touchPad(): HTMLDivElement {
    const pad = document.createElement('div')
    pad.className = 'arc-touch'
    const group = (cls: string, buttons: [Button, IconName | string][]) => {
      const g = document.createElement('div')
      g.className = cls
      for (const [b, face] of buttons) {
        const btn = document.createElement('button')
        btn.dataset.b = b
        if (face.length > 1) btn.append(icon(face as IconName))
        else btn.textContent = face
        const release = () => this.held.delete(b)
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault()
          btn.setPointerCapture(e.pointerId)
          this.held.add(b)
          this.pressed.add(b)
        })
        btn.addEventListener('pointerup', release)
        btn.addEventListener('pointercancel', release)
        g.append(btn)
      }
      return g
    }
    pad.append(
      group('arc-dpad', [['up', 'caret-up'], ['left', 'caret-left'], ['right', 'caret-right'], ['down', 'caret-down']]),
      group('arc-abc', [['c', 'C'], ['b', 'B'], ['a', 'A']]),
    )
    return pad
  }

  open(id: GameId) {
    this.leaveFight()
    this.id = id
    this.fightMusic?.stop()
    this.fightMusic = null
    this.fightMenu.hidden = id !== 'fight'
    this.fightRoster.hidden = id !== 'fight'
    this.el.classList.toggle('arc-fighting', id === 'fight')
    this.updateFightMenu()
    this.el.setAttribute('aria-label', GAMES[id].title)
    this.info = GAMES[id]
    this.el.style.setProperty('--neon', this.info.neon)
    this.el.style.setProperty('--side', this.info.side)
    this.marquee.textContent = this.info.title
    this.help.replaceChildren(
      ...this.info.help.map(([keys, label]) => {
        const row = document.createElement('span')
        for (const key of keys) {
          const k = document.createElement('kbd')
          k.textContent = key
          row.append(k)
        }
        row.append(label)
        return row
      }),
    )
    this.game = null
    this.attract = demo(id)
    this.canvas.width = this.attract.game.width
    this.canvas.height = this.attract.game.height
    this.canvas.classList.toggle('smooth', !!this.attract.game.smooth)
    this.setMode(id === 'fight' ? 'intro' : 'title')
    this.board = undefined
    if (id !== 'fight') void fetchBoard(id).then((b) => {
      if (this.id === id) this.board = b
    })
    this.clearInput()
    this.el.hidden = false
    addEventListener('keydown', this.onKey, true)
    addEventListener('keyup', this.onKey, true)
    addEventListener('blur', this.onBlur)
    this.last = performance.now()
    cancelAnimationFrame(this.raf)
    this.raf = requestAnimationFrame(this.frame)
  }

  close() {
    if (this.el.hidden) return
    this.el.hidden = true
    this.fightMusic?.stop()
    this.fightMusic = null
    this.leaveFight()
    cancelAnimationFrame(this.raf)
    removeEventListener('keydown', this.onKey, true)
    removeEventListener('keyup', this.onKey, true)
    removeEventListener('blur', this.onBlur)
    this.clearInput()
    this.game = null
    this.attract = null
    this.onClose?.()
  }

  private setMode(mode: Mode) {
    this.mode = mode
    this.modeTime = 0
    this.updateFightMenu()
  }

  private leaveFight() {
    if (this.fightJoined) this.host.net.sendFightLeave()
    this.fightJoined = false
    this.fightState = null
    this.fightPressed.clear()
    if (this.fightStatus) this.fightStatus.textContent = ''
    this.updateFightMenu()
  }

  disconnected() {
    if (!this.fightJoined) return
    this.leaveFight()
    this.game = null
    this.setMode('title')
    this.clearInput()
    this.fightStatus.textContent = tr('Connexion perdue. Rejoignez le duel après reconnexion.', 'Connection lost. Rejoin the duel after reconnecting.')
  }

  receiveFight(message: Extract<ServerMessage, { t: 'fight:state' | 'fight:error' }>) {
    if (!this.isOpen || this.id !== 'fight' || !this.fightJoined) return
    if (message.t === 'fight:error') {
      this.leaveFight()
      this.fightStatus.textContent = message.code === 'full'
        ? tr('Un duel est déjà en cours ici. Réessayez après leur départ.', 'A duel is already in progress here. Try again when they leave.')
        : tr('Duel indisponible ici. Rejoignez la borne du salon ou des quartiers.', 'Duel unavailable here. Join a lounge or cabin cabinet.')
      return
    }
    const me = message.players.findIndex(p => p.id === this.host.net.id)
    if (me < 0) return
    this.fightState = message
    if (!message.snapshot) {
      this.game = null
      this.setMode('title')
      this.clearInput()
      this.fightStatus.textContent = tr('En attente : un autre joueur doit choisir « 2 joueurs en ligne » puis « Combat » dans la même pièce.', 'Waiting: another player must choose “2 players online” then “Fight” in the same room.')
      return
    }
    if (!(this.game instanceof Fight)) this.game = new Fight('versus')
    Object.assign(this.game, message.snapshot, { sounds: [] })
    for (const s of message.snapshot.sounds) this.play(s)
    const next = message.snapshot.over ? 'over' : 'play'
    if (this.mode !== next) { this.clearInput(); this.setMode(next) }
    const other = message.players[1 - me]
    this.fightStatus.textContent = `${tr('Vous :', 'You:')} ${fighterProfile(message.players[me].fighter).name} · ${other?.name ?? ''}`
    if (message.rematch.length) this.fightStatus.textContent += tr(' · Revanche : les deux joueurs doivent accepter.', ' · Rematch: both players must accept.')
  }

  private chooseFighter(id: FighterId) {
    if (this.fightJoined || (this.mode !== 'title' && this.mode !== 'intro')) return
    this.selectedFighter = id
    if (this.mode === 'intro') this.setMode('title')
    this.updateFightMenu()
    this.play('rotate')
  }

  private updateFightMenu() {
    for (const btn of this.fightRoster?.querySelectorAll<HTMLButtonElement>('button') ?? []) {
      btn.setAttribute('aria-pressed', String(btn.dataset.fighter === this.selectedFighter))
      btn.disabled = this.fightJoined || (this.mode !== 'title' && this.mode !== 'intro')
    }
    for (const btn of this.fightMenu.querySelectorAll('button[data-mode]')) btn.setAttribute('aria-pressed', String((btn as HTMLButtonElement).dataset.mode === this.fightMode))
  }

  private clearInput() {
    this.held.clear(); this.pressed.clear()
    this.pad.held.clear(); this.pad.pressed.clear()
    this.fightPressed.clear()
  }

  private onBlur = () => {
    this.fightMusic?.setScene('pause')
    this.clearInput()
    if (this.fightJoined && this.fightState) this.host.net.sendFightInput(this.fightState.session, [], [])
    if (this.mode === 'play' && !this.fightJoined) this.setMode('pause')
  }

  /**
   * Clavier : pris en entier par la borne, en phase de capture, sauf M (le son). Les raccourcis
   * du navigateur (Ctrl, Alt, Cmd) gardent leur effet, sans atteindre le jeu derrière la borne.
   */
  private onKey = (e: KeyboardEvent) => {
    const modified = e.ctrlKey || e.metaKey || e.altKey
    if (e.code === 'KeyM' && !modified) return
    e.stopPropagation()
    const down = e.type === 'keydown'
    const keyMap = this.id === 'fight' ? FIGHT_KEYS : KEYS
    if (modified) {
      // Un bouton relâché pendant le raccourci l'est aussi pour la borne.
      const b = keyMap[e.code]
      if (b && !down) this.held.delete(b)
      return
    }
    if (e.code === 'Tab') return
    e.preventDefault()
    if (this.id === 'fight' && (e.code === 'Space' || e.code === 'Enter') && e.target instanceof HTMLButtonElement && this.el.contains(e.target)) {
      if (down && !e.repeat) { e.target.click(); e.target.blur() }
      return
    }
    if (this.id === 'fight' && (this.mode === 'title' || this.mode === 'intro') && down && !e.repeat && (e.code === 'Digit1' || e.code === 'Digit2')) {
      const mode = e.code === 'Digit1' ? 'solo' : 'online'
      this.fightMenu.querySelector<HTMLButtonElement>(`button[data-mode="${mode}"]`)?.click()
      return
    }
    if (this.id === 'fight' && this.mode === 'title' && !this.fightJoined && down && !e.repeat && ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) {
      const direction = e.code === 'ArrowLeft' || e.code === 'KeyA' ? -1 : 1
      const index = FIGHT_ROSTER.findIndex(f => f.id === this.selectedFighter)
      this.chooseFighter(FIGHT_ROSTER[(index + direction + FIGHT_ROSTER.length) % FIGHT_ROSTER.length].id)
      return
    }
    if (down && !e.repeat && (e.code === 'Escape' || e.code === 'KeyE')) return this.close()
    if (down && !e.repeat && e.code === 'KeyP') {
      if (this.fightJoined) return
      if (this.mode === 'play') this.setMode('pause')
      else if (this.mode === 'pause') this.setMode('play')
      return
    }
    const b = keyMap[e.code]
    if (!b) return
    if (!down) return void this.held.delete(b)
    if (!e.repeat) this.pressed.add(b)
    this.held.add(b)
  }

  private start() {
    if (this.id === 'fight' && this.mode === 'intro') { this.setMode('title'); this.clearInput(); return }
    if (this.id === 'fight' && this.fightMode === 'online') {
      if (!this.host.net.online) {
        this.fightStatus.textContent = tr('Relais déconnecté : le mode solo reste disponible.', 'Relay disconnected: solo mode is available.')
        return
      }
      if (this.fightJoined && this.fightState?.status === 'playing') return
      this.clearInput()
      if (this.fightJoined && this.fightState?.status === 'ended') {
        this.host.net.sendFightRematch()
        this.fightStatus.textContent = tr('Revanche demandée : votre adversaire doit aussi accepter.', 'Rematch requested: your opponent must also accept.')
      } else {
        this.fightJoined = true
        this.fightWaitingSince = performance.now()
        this.fightStatus.textContent = tr('Connexion à la borne…', 'Connecting to the cabinet…')
        this.updateFightMenu()
        this.host.net.sendFightJoin(this.selectedFighter)
      }
      return
    }
    this.clearInput()
    const choice = FIGHT_ROSTER.filter(f => f.id !== this.selectedFighter)
    const cpu = choice[Math.floor(Math.random() * choice.length)].id
    this.game = this.id === 'fight' ? new Fight('solo', 3312, [this.selectedFighter, cpu]) : create(this.id)
    this.game.best = Math.max(localBest(this.id), this.board?.top[0]?.score ?? 0)
    this.canvas.width = this.game.width
    this.canvas.height = this.game.height
    this.duration = 0
    this.result = null
    this.personal = false
    this.setMode('play')
    this.play('level')
  }

  private play(s: Parameters<ArcadeSfx['play']>[0]) {
    if (!this.sfx) {
      const out = this.host.sound.arcadeOutput()
      if (out) this.sfx = new ArcadeSfx(this.host.sound.ctx, out)
    }
    this.sfx?.play(s)
  }

  private frame = (now: number) => {
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000))
    this.last = now
    this.time += dt
    this.modeTime += dt
    const pad = this.pad
    pad.pressed.clear()
    for (const b of this.pressed) pad.pressed.add(b)
    this.pressed.clear()
    pad.held.clear()
    for (const b of this.held) pad.held.add(b)

    if (this.fightJoined) {
      for (const b of pad.pressed) this.fightPressed.add(b)
      if (this.fightState?.status === 'playing' && now - this.fightSendAt >= 1000 / 30) {
        this.host.net.sendFightInput(this.fightState.session, [...pad.held], [...this.fightPressed])
        this.fightPressed.clear()
        this.fightSendAt = now
      }
      if (!this.fightState && now - this.fightWaitingSince > 8000) {
        this.leaveFight()
        this.fightStatus.textContent = tr('La borne ne répond pas. Réessayez ou jouez en solo.', 'Cabinet not responding. Retry or play solo.')
      }
    }

    if (this.id === 'fight') {
      if (!this.fightMusic) {
        const out = this.host.sound.arcadeOutput()
        if (out) this.fightMusic = new FightMusic(this.host.sound.ctx, out)
      }
      const scene = document.hidden || this.mode === 'pause' ? 'pause'
        : this.mode === 'intro' || (this.game instanceof Fight && this.game.phase === 'intro') ? 'intro'
        : this.mode === 'title' ? 'select' : this.mode === 'over' ? 'over' : 'battle'
      this.fightMusic?.setScene(scene)
    }

    switch (this.mode) {
      case 'intro':
        if (this.modeTime >= 3.6 || pad.pressed.has('a')) { this.setMode('title'); this.clearInput() }
        break
      case 'title': {
        const a = this.attract!
        a.game.step(dt, a.next(dt))
        a.game.sounds.length = 0
        if (a.game.over && (this.attractOver += dt) > 3) {
          this.attract = demo(this.id)
          this.attractOver = 0
        }
        if (this.id === 'fight' && !this.fightJoined) {
          if (pad.pressed.has('left') || pad.pressed.has('right')) {
            const index = FIGHT_ROSTER.findIndex(f => f.id === this.selectedFighter)
            this.chooseFighter(FIGHT_ROSTER[(index + (pad.pressed.has('left') ? -1 : 1) + 6) % 6].id)
          }
        }
        if (pad.pressed.has('a')) this.start()
        break
      }
      case 'play': {
        const game = this.game!
        if (!this.fightJoined) game.step(dt, pad)
        this.duration += dt
        for (const s of game.sounds) this.play(s)
        game.sounds.length = 0
        if (game.over && !this.fightJoined) this.finish()
        break
      }
      case 'pause':
        if (pad.pressed.has('a')) this.setMode('play')
        break
      case 'over': {
        const game = this.game!
        if (!this.fightJoined) game.step(dt, IDLE)
        for (const s of game.sounds) this.play(s)
        game.sounds.length = 0
        if (this.modeTime > 2.5 && pad.pressed.has('a')) this.start()
        break
      }
    }
    this.draw()
    this.raf = requestAnimationFrame(this.frame)
  }

  /** Partie finie : record du navigateur, puis score inscrit au classement du site (CMDR). */
  private finish() {
    const game = this.game!
    this.setMode('over')
    if (this.id === 'fight') return
    this.personal = saveLocalBest(this.id, game.score)
    if (game.score <= 0) return
    if (!this.host.linked()) {
      this.result = { kind: 'guest' }
      return
    }
    this.result = 'pending'
    const id = this.id
    void submitScore(id, game.score, game.level, this.duration).then((r) => {
      if (this.id !== id || this.game !== game) return
      this.result = r
      if (r.kind === 'saved') this.board = r.board
      if (r.kind === 'saved' && r.credits) this.host.onCredits?.(r.credits)
      if (r.kind === 'saved' && ((r.best && r.board.me?.rank === 1) || r.credits)) this.play('life')
    })
  }

  // ---------------------------------------------------------------- affichage

  private draw() {
    const g = this.g, w = this.canvas.width, h = this.canvas.height
    const k = w / 320
    g.save()
    if (this.id === 'fight' && this.mode === 'intro') {
      drawFightIntro(g, this.modeTime)
    } else if (this.id === 'fight' && this.mode === 'title') {
      drawFightSelection(g, this.selectedFighter, this.fightMode === 'online', this.fightJoined, this.time)
    } else if (this.mode === 'title') {
      const a = this.attract!
      a.game.draw(g, this.time)
      g.fillStyle = 'rgba(2, 3, 8, 0.55)'
      g.fillRect(0, 0, w, h)
      // Titre et tableau des scores, sept secondes chacun, sur un panneau sombre (la démonstration
      // continue autour).
      g.fillStyle = 'rgba(2, 3, 8, 0.88)'
      g.fillRect(14 * k, 18 * k, w - 28 * k, 176 * k)
      g.fillStyle = this.info.neon
      g.globalAlpha = 0.5
      g.fillRect(14 * k, 18 * k, w - 28 * k, k)
      g.fillRect(14 * k, 193 * k, w - 28 * k, k)
      g.globalAlpha = 1
      if (this.id === 'fight' || Math.floor(this.modeTime / 7) % 2 === 0) this.drawTitle(k)
      else this.drawBoard(k, 30 * k, null)
      if (Math.floor(this.time * 2) % 2) {
        g.fillStyle = '#ffffff'
        pixelText(g, tr(`APPUYEZ SUR ${START}`, `PRESS ${START}`), w / 2, h - 32 * k, 2 * k, 'center')
      }
    } else {
      this.game!.draw(g, this.time)
      if (this.mode === 'pause') {
        g.fillStyle = 'rgba(2, 3, 8, 0.6)'
        g.fillRect(0, 0, w, h)
        g.fillStyle = '#ffffff'
        pixelText(g, 'PAUSE', w / 2, h / 2 - 12 * k, 3 * k, 'center')
        g.fillStyle = '#8a92a6'
        pixelText(g, TOUCH ? tr('A : REPRENDRE', 'A: RESUME') : tr('P OU ESPACE : REPRENDRE', 'P OR SPACE: RESUME'), w / 2, h / 2 + 16 * k, k, 'center')
      }
      if (this.mode === 'over' && this.modeTime > 1.6) {
        if (this.id === 'fight') {
          g.fillStyle = '#fff'
          pixelText(g, tr(`${START} OU COMBAT : REVANCHE`, `${START} OR FIGHT: REMATCH`), w / 2, h - 40, 1, 'center')
        } else this.drawResult(k)
      }
    }
    g.restore()
  }

  private drawTitle(k: number) {
    const g = this.g, w = this.canvas.width
    const title = this.info.title
    const scale = Math.max(1, Math.min(5 * k, Math.floor((w * 0.86) / textWidth(title, 1))))
    const y = 44 * k
    g.fillStyle = this.info.side
    pixelText(g, title, w / 2 + scale, y + scale, scale, 'center')
    g.fillStyle = this.info.neon
    pixelText(g, title, w / 2, y, scale, 'center')
    g.fillStyle = '#d8dde4'
    pixelText(g, this.info.tagline, w / 2, y + 7 * scale + 16 * k, k, 'center')
    const top = this.board?.top[0]
    const best = Math.max(localBest(this.id), top?.score ?? 0)
    g.fillStyle = '#ffe14f'
    if (top && top.score >= best) pixelText(g, tr(`RECORD : ${padScore(top.score)} · ${top.cmdr}`, `HIGH SCORE: ${padScore(top.score)} · ${top.cmdr}`), w / 2, y + 7 * scale + 44 * k, k, 'center')
    else if (best) pixelText(g, tr(`VOTRE RECORD : ${padScore(best)}`, `YOUR BEST: ${padScore(best)}`), w / 2, y + 7 * scale + 44 * k, k, 'center')
    g.fillStyle = '#8a92a6'
    pixelText(g, 'ÉLITE DANGEREUSE · 3312', w / 2, y + 7 * scale + 64 * k, k, 'center')
    // Crédits : le prochain palier de score à franchir, et ce qu'il rapporte.
    g.fillStyle = '#7dffa8'
    pixelText(g, this.nextTier(), w / 2, y + 7 * scale + 84 * k, k, 'center')
  }

  /** Ligne des crédits de l'écran titre : le prochain palier de score (records personnels). */
  private nextTier(): string {
    if (!this.host.linked()) return tr('CONNECTEZ-VOUS AU SITE POUR GAGNER DES CRÉDITS', 'LOG IN TO THE SITE TO EARN CREDITS')
    const best = Math.max(localBest(this.id), this.board?.me?.score ?? 0)
    const next = arcadeTiers(this.id).find(([score]) => score > best)
    if (!next) return tr('TOUS LES PALIERS FRANCHIS : BATTEZ LE RECORD DU VAISSEAU', 'EVERY TIER CLEARED: BEAT THE SHIP RECORD')
    return tr(`PALIER ${grouped(next[0])} : +${grouped(next[1])} CR`, `TIER ${grouped(next[0])}: +${grouped(next[1])} CR`)
  }

  /**
   * Tableau des dix meilleurs, à partir de `y` ; `rank` : ligne à mettre en valeur (celle du
   * joueur qui vient de jouer).
   */
  private drawBoard(k: number, y: number, rank: number | null) {
    const g = this.g, w = this.canvas.width
    g.fillStyle = this.info.neon
    pixelText(g, tr('MEILLEURS SCORES', 'HIGH SCORES'), w / 2, y, 2 * k, 'center')
    const board = this.board
    const rowsY = y + 26 * k
    if (!board) {
      g.fillStyle = '#8a92a6'
      pixelText(g, board === undefined ? tr('CHARGEMENT…', 'LOADING…') : tr('CLASSEMENT INDISPONIBLE', 'LEADERBOARD UNAVAILABLE'), w / 2, rowsY + 30 * k, k, 'center')
      return
    }
    if (!board.top.length) {
      g.fillStyle = '#8a92a6'
      pixelText(g, tr('AUCUN SCORE : À VOUS DE JOUER !', 'NO SCORES YET: YOUR TURN!'), w / 2, rowsY + 30 * k, k, 'center')
      return
    }
    const left = 44 * k, right = w - 44 * k
    board.top.forEach((row, i) => {
      const ry = rowsY + i * 12 * k
      const mine = rank === i + 1
      if (mine) {
        g.fillStyle = 'rgba(255, 225, 79, 0.18)'
        g.fillRect(left - 6 * k, ry - 3 * k, right - left + 12 * k, 12 * k)
      }
      g.fillStyle = mine ? '#ffe14f' : i === 0 ? '#ffffff' : '#c8cfdb'
      const place = EN ? `${i + 1}.` : i === 0 ? '1ER' : `${i + 1}E`
      pixelText(g, place, left, ry, k)
      pixelText(g, row.cmdr.slice(0, 18), left + 30 * k, ry, k)
      pixelText(g, padScore(row.score), right, ry, k, 'right')
    })
  }

  private drawResult(k: number) {
    const g = this.g, w = this.canvas.width, h = this.canvas.height
    const game = this.game!
    g.fillStyle = 'rgba(2, 3, 8, 0.82)'
    g.fillRect(0, 0, w, h)
    g.fillStyle = '#ffffff'
    pixelText(g, tr('FIN DE PARTIE', 'GAME OVER'), w / 2, 14 * k, 2 * k, 'center')
    g.fillStyle = '#ffe14f'
    pixelText(g, tr(`SCORE ${padScore(game.score)}`, `SCORE ${padScore(game.score)}`), w / 2, 34 * k, k, 'center')
    const r = this.result
    let line = ''
    if (game.score <= 0) line = tr('AUCUN POINT : RETENTEZ VOTRE CHANCE', 'NO POINTS: TRY AGAIN')
    else if (r === 'pending') line = tr('INSCRIPTION DU SCORE…', 'SENDING SCORE…')
    else if (r?.kind === 'guest') line = this.personal ? tr('RECORD PERSONNEL ! CONNECTEZ-VOUS AU SITE POUR ENTRER AU CLASSEMENT', 'PERSONAL BEST! LOG IN TO JOIN THE LEADERBOARD') : tr('CONNECTEZ-VOUS AU SITE POUR ENTRER AU CLASSEMENT', 'LOG IN TO THE SITE TO JOIN THE LEADERBOARD')
    else if (r?.kind === 'error') line = tr('CLASSEMENT INDISPONIBLE : SCORE GARDÉ ICI', 'LEADERBOARD UNAVAILABLE: SCORE KEPT HERE')
    else if (r?.kind === 'saved') {
      const rank = r.board.me?.rank
      if (r.best && rank === 1) line = tr('NOUVEAU RECORD DU VAISSEAU !', 'NEW SHIP RECORD!')
      else if (r.best && rank) line = EN ? `PERSONAL BEST! RANK #${rank}` : `RECORD PERSONNEL ! ${rank === 1 ? '1ER' : rank + 'E'} AU CLASSEMENT`
      else if (r.board.me) line = tr(`VOTRE RECORD : ${padScore(r.board.me.score)}`, `YOUR BEST: ${padScore(r.board.me.score)}`)
    }
    g.fillStyle = r && r !== 'pending' && r.kind === 'saved' && r.best ? this.info.neon : '#c8cfdb'
    // Un message trop long pour une ligne passe sur deux.
    if (textWidth(line, k) > w - 16 * k && line.includes(' ! ')) {
      const [a, b] = line.split(' ! ')
      pixelText(g, a + ' !', w / 2, 48 * k, k, 'center')
      pixelText(g, b, w / 2, 58 * k, k, 'center')
    } else pixelText(g, line, w / 2, 50 * k, k, 'center')
    // Crédits gagnés par ce record : paliers franchis, prime du record du vaisseau.
    const credits = r && r !== 'pending' && r.kind === 'saved' ? r.credits : null
    if (credits) {
      const parts = [`+${grouped(credits.earned)} CR`]
      if (credits.tiers.length === 1) parts.push(tr(`PALIER ${grouped(credits.tiers[0])}`, `TIER ${grouped(credits.tiers[0])}`))
      else if (credits.tiers.length > 1) parts.push(tr(`${credits.tiers.length} PALIERS`, `${credits.tiers.length} TIERS`))
      if (credits.record) parts.push(tr('PRIME DE RECORD', 'RECORD BONUS'))
      g.fillStyle = '#7dffa8'
      pixelText(g, parts.join(' · '), w / 2, (line.includes(' ! ') && textWidth(line, k) > w - 16 * k ? 66 : 62) * k, k, 'center')
    }
    const rank = r && r !== 'pending' && r.kind === 'saved' ? (r.board.me?.rank ?? null) : null
    this.drawBoard(k, 74 * k, rank)
    if (this.modeTime > 2.5) {
      g.fillStyle = Math.floor(this.time * 2) % 2 ? '#ffffff' : '#8a92a6'
      pixelText(g, TOUCH ? tr('A : REJOUER', 'A: PLAY AGAIN') : tr('ESPACE : REJOUER · ÉCHAP : QUITTER', 'SPACE: PLAY AGAIN · ESC: LEAVE'), w / 2, h - 16 * k, k, 'center')
    }
  }
}
