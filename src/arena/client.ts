import * as THREE from 'three'
import type { Sound } from '../audio'
import type { IsoCamera } from '../camera'
import { Deck } from '../deck'
import type { Wallet } from '../economy/wallet'
import { tr } from '../i18n'
import { lookId, randomLook } from '../looks'
import type { ArenaEnd, ArenaEvent, ArenaFighter, ArenaLobby, ArenaStart, ArenaState, Net, PlayerState, ServerMessage } from '../net'
import type { Player } from '../player'
import { RangeMusic } from '../range-music'
import { RangeSfx } from '../range-sfx'
import { WEAPONS, type WeaponId } from '../range-weapons'
import { RemotePlayer } from '../remote'
import { loadZoneKit } from '../salvage/kit'
import type { Dialog } from '../ui'
import { ARENA_LEVEL, ARENA_RETURN, ARENA_RULES, ARENA_TEAMS, arenaSight, arenaZone } from '../../shared/arena.js'
import { arenaLevel } from './deck'
import { ArenaGun, type ArenaBody } from './gun'
import { ArenaHud, ArenaPanel, TEAM_NAMES } from './ui'

/*
 * L'arène, côté client : le terminal du lobby, puis la partie. Le relais fait autorité (cf.
 * server/arena.js) : ici, on construit l'arène (cf. deck.ts), on y envoie le joueur, on y fait
 * jouer le moteur du stand de tir (cf. gun.ts), on montre ce que le relais envoie (les bots, les
 * tirs des autres, les points de vie, le score), et l'on gère ce qui est propre à chacun :
 * l'élimination (on tombe, on attend, on revient à sa base avec l'arme choisie), l'écran de fin.
 *
 * Vu de dessus, on ne voit un adversaire que s'il n'y a rien entre lui et soi : sans cela, la vue
 * de dessus verrait par-dessus les conteneurs ce que la vue subjective ne voit pas.
 */

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
  /** Passe le joueur sur ce pont, à cet endroit, sous un fondu au noir. */
  moveTo(deck: Deck, at: { x: number; z: number }): Promise<void>
  /** Vue subjective (sinon : vue de dessus). */
  fps(): boolean
  /** Tourne le joueur (et son regard, en vue subjective) vers ce cap. */
  face(yaw: number): void
  /** Redit tout de suite sa position au relais (retour à la base). */
  sync(): void
  /** Pose (ou retire, `head` null) le nom d'un bot au-dessus de sa tête. */
  label(key: string, head: ((out: THREE.Vector3) => THREE.Vector3 | null) | null, name?: string): void
  /** L'arme de l'arène vient d'être créée : le jeu y branche ses réglages (vitesse, pose, curseur). */
  armed(gun: ArenaGun): void
}

interface Fighter extends ArenaFighter {
  hp: number
  alive: boolean
  shield: boolean
  /** Bot : son personnage, tenu ici (celui d'un joueur est dans `host.remotes`). */
  puppet: RemotePlayer | null
  /** Anneau au sol, de la couleur de son équipe. */
  ring: THREE.Mesh
}

interface Game {
  id: string
  team: 0 | 1
  goal: number
  fighters: Map<number, Fighter>
  state: ArenaState | null
  end: ArenaEnd | null
  /** Éliminé : par qui (null : debout). */
  downBy: string | null
  /** Dernière seconde annoncée par le décompte du coup d'envoi. */
  second: number
}

type Phase = 'ship' | 'loading' | 'arena'

const WEAPON_KEY = 'mini-shipinteriors-arena-weapon'
const ERRORS: Record<string, string> = {
  lobby: tr('Il faut être dans le lobby du sas.', 'You need to be in the airlock lobby.'),
  full: tr('Ce camp est complet.', 'That side is full.'),
  playing: tr('Ce salon est déjà en partie.', 'That room is already playing.'),
  gone: tr('Ce salon n\'existe plus.', 'That room no longer exists.'),
  leader: tr('Seul le chef du salon règle la partie.', 'Only the room leader sets the match.'),
  crowded: tr('Trop de monde dans un camp pour ce format.', 'Too many players on one side for that format.'),
  alone: tr('Sans bots, il faut quelqu\'un dans le camp d\'en face.', 'Without bots, someone has to be on the other side.'),
}

const ringGeometry = new THREE.RingGeometry(0.2, 0.27, 28).rotateX(-Math.PI / 2)

export class ArenaClient {
  private readonly panel: ArenaPanel
  private readonly hud = new ArenaHud()
  private readonly zone = arenaZone()
  private lobby: ArenaLobby = { rooms: [] }
  private game: Game | null = null
  private phase: Phase = 'ship'
  /** L'arène, construite au premier départ, puis gardée : son plan ne change pas. */
  deck: Deck | null = null
  /** Le moteur de tir, dans l'arène (créé avec elle). */
  gun: ArenaGun | null = null
  private weapon: WeaponId = 'pistol'
  private quitArmed = 0
  private endTimer = 0
  private leaving: Promise<void> | null = null
  private readonly hands = new THREE.Vector3()
  private readonly local = new THREE.Vector3()

  constructor(private host: ArenaHost) {
    try {
      const saved = localStorage.getItem(WEAPON_KEY)
      if (WEAPONS.some((w) => w.id === saved)) this.weapon = saved as WeaponId
    } catch {}
    this.panel = new ArenaPanel({
      create: () => {
        host.net.sendArena('create', { weapon: this.weapon })
        void loadZoneKit()
      },
      join: (room, team) => host.net.sendArena('join', { room, team, weapon: this.weapon }),
      leave: () => host.net.sendArena('leave'),
      side: (team) => host.net.sendArena('side', { team }),
      settings: (s) => host.net.sendArena('settings', s),
      weapon: (id) => this.choose(id),
      ready: (on) => {
        host.net.sendArena('ready', { ready: on })
        if (on) void loadZoneKit()
      },
    })
    this.panel.weapon = this.weapon
    this.hud.onQuit = () => this.quit()
    this.hud.onWeapon = (id) => this.choose(id)
  }

  // ------------------------------------------------------------------ état

  /** Une partie est en cours, et le joueur est dans l'arène. */
  get inArena(): boolean {
    return !!this.game && !!this.deck && this.host.deck() === this.deck
  }

  /** Le personnage ne bouge pas : en route, éliminé, ou devant l'écran de fin. */
  get frozen(): boolean {
    return this.phase === 'loading' || (this.inArena && (this.game!.downBy !== null || !!this.game!.end))
  }

  get panelOpen(): boolean {
    return this.panel.isOpen || this.hud.endOpen
  }

  contains(target: EventTarget | null): boolean {
    return this.panel.contains(target)
  }

  closePanels() {
    this.panel.close()
  }

  /** Un autre joueur de l'arène se voit-il ? Ceux de sa partie ; vu de dessus, un adversaire seulement en ligne de vue. */
  sees(id: number): boolean {
    const f = this.game?.fighters.get(id)
    if (!f || !this.inArena) return false
    const r = f.puppet ?? this.host.remotes.get(id)
    return !!r && this.visible(f, r.group.position)
  }

  private visible(f: Fighter, at: THREE.Vector3): boolean {
    if (f.team === this.game!.team || this.host.fps()) return true
    return arenaSight(this.zone, this.host.player.position, at)
  }

  // ------------------------------------------------------------------ lobby

  openTerminal() {
    this.refresh()
    this.panel.open()
    void loadZoneKit()
  }

  private refresh() {
    this.panel.update(this.lobby, this.host.net.id, this.host.net.online)
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
        if (this.panel.isOpen) this.panel.message(ERRORS[m.code] ?? tr('Action refusée.', 'Action refused.'))
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
    this.host.scene.add(deck.group)
    this.deck = deck
    const gun = new ArenaGun(deck.group, this.host.dialog, this.host.wallet, new RangeSfx(this.host.sound), new RangeMusic(this.host.sound))
    gun.host = {
      zone,
      self: () => this.host.net.id,
      team: () => this.game?.team ?? 0,
      bodies: () => this.bodies(),
      canFire: () => !!this.game && !this.game.end && this.game.downBy === null && (this.game.state?.warmup ?? 1) <= 0,
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
    const game: Game = { id: m.game, team: m.team, goal: m.goal, fighters: new Map(), state: null, end: null, downBy: null, second: Infinity }
    this.game = game
    for (const f of m.fighters) this.addFighter(f, f.bot ? null : undefined)
    const mine = game.fighters.get(this.host.net.id)
    if (mine) this.weapon = this.panel.weapon = mine.weapon
    this.hud.show(true, m.team)
    this.hud.board([0, 0], m.goal, m.duration, m.warmup)
    this.hud.life(ARENA_RULES.hp, true)
    await this.host.moveTo(deck, m.spawn)
    // Reparti entre-temps (liaison perdue pendant le fondu).
    if (this.game !== game) return
    this.phase = 'arena'
    this.host.face(m.spawn.yaw)
    this.gun!.begin(this.weapon)
    const foes = [...game.fighters.values()].filter((f) => f.team !== m.team).length
    this.host.dialog.show(tr(
      `Équipe ${TEAM_NAMES[m.team]} : ${m.goal} éliminations pour gagner, ${foes} adversaire${foes > 1 ? 's' : ''} en face. Les conteneurs arrêtent les balles.`,
      `${TEAM_NAMES[m.team]} team: ${m.goal} kills to win, ${foes} opponent${foes > 1 ? 's' : ''} ahead. Containers stop bullets.`,
    ))
  }

  /** @param at où poser un bot (undefined : un joueur, son personnage est celui du bord) */
  private addFighter(f: ArenaFighter, at: { x: number; z: number; yaw: number } | null | undefined) {
    const g = this.game!
    const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: ARENA_TEAMS[f.team].color, transparent: true, opacity: 0.85, depthWrite: false }))
    ring.visible = false
    ring.renderOrder = 2
    this.deck!.group.add(ring)
    let puppet: RemotePlayer | null = null
    if (f.bot) {
      const deckY = this.deck!.y
      // Hors de vue le temps que le premier état du relais donne sa place.
      const state = { id: f.id, name: f.name, skin: lookId(randomLook()), x: at?.x ?? -10, z: at?.z ?? -10, yaw: at?.yaw ?? 0, level: ARENA_LEVEL, anim: 'idle' } as PlayerState
      puppet = new RemotePlayer(f.id, state, () => deckY)
      puppet.group.visible = false
      this.host.scene.add(puppet.group)
      const bot = puppet
      this.host.label(`arena${f.id}`, (out) => (bot.group.visible && bot.avatar ? bot.avatar.head(out) : null), f.name)
    }
    g.fighters.set(f.id, { ...f, hp: ARENA_RULES.hp, alive: true, shield: false, puppet, ring })
  }

  private removeFighter(id: number) {
    const f = this.game?.fighters.get(id)
    if (!f) return
    this.game!.fighters.delete(id)
    this.gun?.disarm(id)
    f.ring.removeFromParent()
    ;(f.ring.material as THREE.Material).dispose()
    if (f.puppet) {
      f.puppet.group.removeFromParent()
      this.host.label(`arena${id}`, null)
    } else {
      const avatar = this.host.remotes.get(id)?.avatar
      if (avatar) avatar.carrying = false
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
    if (this.inArena) await this.host.moveTo(this.host.hold, ARENA_RETURN)
    if (this.game !== g) return
    this.dispose()
    if (message) this.host.dialog.show(message)
  }

  private dispose() {
    const g = this.game
    if (!g) return
    this.gun?.end()
    for (const id of [...g.fighters.keys()]) this.removeFighter(id)
    if (this.host.player.avatar.emoteId === 'dodo') this.host.player.avatar.stopEmote()
    this.hud.closeEnd()
    this.hud.show(false)
    this.game = null
    this.phase = 'ship'
    this.endTimer = 0
  }

  /** Abandon (deux fois de suite) : on quitte la partie et l'on rentre au lobby. */
  quit() {
    if (!this.game || this.game.end) return
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

  /** Touches du mode ; true si la touche est prise. Éliminé : 1 à 5 choisissent l'arme du retour. */
  keyDown(e: KeyboardEvent): boolean {
    const g = this.game
    if (!g || !this.inArena || g.end || g.downBy === null || e.repeat) return false
    const digit = /^Digit([1-5])$/.exec(e.code)
    if (!digit) return false
    this.choose(WEAPONS[Number(digit[1]) - 1].id)
    e.preventDefault()
    return true
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

  private apply(s: ArenaState) {
    const g = this.game!
    g.state = s
    const self = this.host.net.id
    for (const st of s.fighters) {
      const f = g.fighters.get(st.id)
      if (!f) continue
      Object.assign(f, { hp: st.hp, alive: st.alive, shield: st.shield, weapon: st.weapon })
      f.puppet?.apply({ x: st.x, z: st.z, yaw: st.yaw, level: ARENA_LEVEL, anim: st.anim })
    }
    const me = g.fighters.get(self)
    if (me) this.hud.life(me.hp, me.shield)
    this.hud.board(s.score, g.goal, s.left, s.warmup)
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
        if (f && e.id !== self && this.inArena) gun.remoteShot(e.id, f.team, e.weapon, e.o, e.d)
        break
      }
      case 'hit': {
        const f = g.fighters.get(e.id)
        if (f) f.hp = e.hp
        if (e.id === self) {
          this.hud.life(e.hp, false)
          this.hud.hurt()
          gun.jar(0.9)
          gun.cue('hurt')
        } else if (e.by === self && this.inArena) gun.confirm(new THREE.Vector3(e.x, e.y, e.z), e.dmg, e.hp <= 0)
        break
      }
      case 'kill': {
        const victim = g.fighters.get(e.id)
        const by = g.fighters.get(e.by)
        if (!victim) break
        victim.alive = false
        victim.hp = 0
        this.hud.kill(by && by !== victim ? by : null, victim, e.weapon, e.by === self || e.id === self)
        if (g.state) g.state.score = e.score
        if (e.id === self) this.down(by && by !== victim ? by.name : '')
        else {
          // Un bot tombe sur place ; un joueur le fait de lui-même (il joue l'emote).
          victim.puppet?.emote('dodo')
          if (e.by === self) gun.announce(tr(`${victim.name} éliminé`, `${victim.name} taken out`))
        }
        break
      }
      case 'spawn': {
        const f = g.fighters.get(e.id)
        if (!f) break
        Object.assign(f, { alive: true, hp: ARENA_RULES.hp, shield: true, weapon: e.weapon })
        if (e.id === self) this.back(e)
        // Un joueur revenu à sa base est debout : son personnage ne reste pas couché tant qu'il n'a pas bougé.
        else if (!f.puppet) this.host.remotes.get(e.id)?.avatar?.stopEmote()
        else {
          f.puppet.avatar?.stopEmote()
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
    }
  }

  /** Éliminé : on tombe, l'arme disparaît, on attend de revenir à sa base. */
  private down(by: string) {
    const g = this.game!
    g.downBy = by
    const player = this.host.player
    player.cancelPath()
    player.avatar.playEmote('dodo')
    this.host.net.sendEmote('dodo')
    this.host.iso.shake(0.3)
    this.gun!.down()
    this.gun!.cue('down')
  }

  /** De retour à sa base : debout, protégé un instant, l'arme choisie en main. */
  private back(e: { x: number; z: number; yaw: number; weapon: WeaponId }) {
    const g = this.game!
    g.downBy = null
    const player = this.host.player
    if (player.avatar.emoteId === 'dodo') player.avatar.stopEmote()
    if (!this.inArena) return
    player.position.set(e.x, this.deck!.y, e.z)
    this.host.iso.snapTo(player.position)
    this.host.face(e.yaw)
    this.host.sync()
    this.weapon = e.weapon
    this.gun!.begin(e.weapon)
    this.hud.life(ARENA_RULES.hp, true)
  }

  private finish(r: ArenaEnd) {
    const g = this.game!
    g.end = r
    g.downBy = null
    this.hud.board(r.score, r.goal, 0, 0)
    this.hud.waiting(null, 0, this.weapon)
    this.gun?.cue(r.winner === g.team ? 'go' : 'down')
    this.gun?.end()
    this.endTimer = 30
    this.hud.showEnd(r, g.team, this.host.net.id, () => {
      this.endTimer = 0
      void this.leave()
    })
  }

  // ------------------------------------------------------------------ chaque image

  update(dt: number) {
    const g = this.game
    if (!g) return
    // Fin de partie : on rentre de soi-même au bout d'un moment.
    if (g.end && this.endTimer > 0 && (this.endTimer -= dt) <= 0) {
      void this.leave()
      return
    }
    const inArena = this.inArena
    const self = this.host.net.id
    const origin = this.deck!.group.position
    for (const f of g.fighters.values()) {
      const mine = f.id === self
      const r = mine ? null : f.puppet ?? this.host.remotes.get(f.id) ?? null
      const at = mine ? this.host.player.position : r?.group.position
      if (f.puppet) {
        f.puppet.update(dt)
        f.puppet.group.visible = inArena && this.visible(f, f.puppet.group.position)
      }
      const shown = inArena && !!at && (mine || !!r?.group.visible)
      // L'anneau de son équipe, sous ses pieds ; il bat tant qu'il est protégé.
      f.ring.visible = shown && f.alive
      if (f.ring.visible) {
        f.ring.position.set(at!.x, 0.02, at!.z)
        const beat = f.shield ? 1 + 0.25 * Math.sin(performance.now() / 90) : 1
        f.ring.scale.setScalar((mine ? 1.15 : 1) * beat)
      }
      if (mine || !r) continue
      // Son arme, dans ses mains, tournée où il regarde.
      const avatar = r.avatar
      const armed = shown && f.alive && !!avatar
      if (avatar) avatar.carrying = f.alive
      if (armed && avatar!.hands(this.hands)) this.local.copy(this.hands).sub(origin)
      else if (armed) this.local.copy(at!).sub(origin)
      this.local.y = ARENA_RULES.aim - 0.02
      this.gun?.carry(f.id, f.weapon, armed ? this.local : null, r.group.rotation.y)
    }
    if (!inArena || g.end) return
    const wait = g.state?.fighters.find((f) => f.id === self)?.wait ?? ARENA_RULES.respawn
    this.hud.waiting(g.downBy, wait, this.weapon)
  }
}
