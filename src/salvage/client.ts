import * as THREE from 'three'
import type { Sound } from '../audio'
import type { IsoCamera } from '../camera'
import { Deck } from '../deck'
import type { Wallet } from '../economy/wallet'
import { tr } from '../i18n'
import type { Net, SalvageEnd, SalvageEvent, SalvageLobby, SalvageMember, SalvageStart, SalvageState, ServerMessage } from '../net'
import type { Player } from '../player'
import type { RemotePlayer } from '../remote'
import type { Dialog } from '../ui'
import { cargoCanister } from '../furniture'
import {
  BAY_BOOTH, generateZone, inAirlock, LOBBY_RETURN, sightOrigin, lockerFront, lockerSpot, RULES, walkable, ZONE_LEVEL, zoneSight, type Zone,
} from '../../shared/salvage.js'
import { FogOfWar } from './fog'
import { ZoneItems } from './items'
import { loadZoneKit } from './kit'
import { MonsterView } from './monsters'
import { SalvageSfx } from './sfx'
import { Technician, technicianRig, TECHNICIAN } from './technician'
import { LeaderboardPanel, LobbyPanel, MissionHud, type HudMember } from './ui'
import { zoneLevel } from './zone-deck'

/*
 * Récupération de cargaison en zone thargoïde (SOC-06), côté client : le terminal du lobby, puis
 * la mission. Le relais fait autorité (cf. server/salvage.js) ; ici, on construit la baie tirée
 * de sa graine (cf. shared/salvage.js), on y téléporte l'équipe, on montre ce qu'il envoie
 * (ennemis, colis, casiers, fusée), on lui envoie nos actions, et l'on gère ce qui est propre à
 * chacun : la vue réduite (cf. fog.ts), l'endurance, le bruit de nos pas, le détecteur de
 * cargaison, le cœur qui s'emballe, la caméra alliée des capturés.
 */

/** Ce que le jeu prête au mode (cf. main.ts). */
export interface SalvageHost {
  scene: THREE.Scene
  renderer: THREE.WebGLRenderer
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
  /** Montre la baie (caméras alliées) ou revient au pont du joueur. */
  showView(zone: Deck | null): void
  /** CMDR reconnu par le site (sinon, invité : pas de crédits). */
  verified(): boolean
  /** Tuile survolée par la souris, s'il y en a une. */
  pointed(): { x: number; z: number } | null
  /** Direction du regard au sol en vue subjective ; null en vue isométrique. */
  aim(): { x: number; z: number } | null
  /** Position à l'écran (pixels) d'un point du monde. */
  project(p: THREE.Vector3): { x: number; y: number }
}

interface Game {
  id: string
  zone: Zone
  deck: Deck
  monsters: MonsterView
  items: ZoneItems
  members: { id: number; name: string }[]
  parcels: number
  enemies: number
  state: SalvageState | null
  end: SalvageEnd | null
  /** Colis accrochés dans le dos des porteurs (joueur ou coéquipier). */
  carried: Map<number, THREE.Object3D>
  /** Gaspard, barricadé dans le guichet de sécurité. */
  technician: Technician
}

type Phase = 'ship' | 'loading' | 'zone' | 'caught' | 'watching'

/**
 * Ticket de reconnexion de la mission en cours, gardé dans le navigateur : après une coupure,
 * un rechargement, même une fermeture de l'onglet, on le présente au relais pour retrouver sa
 * place (cf. `resume` dans server/salvage.js).
 */
const TICKET_KEY = 'mini-shipinteriors-salvage'
let ticketMemo: { game: string; ticket: string } | null = null
const ticketStore = {
  get(): { game: string; ticket: string } | null {
    try {
      const v = JSON.parse(localStorage.getItem(TICKET_KEY) ?? 'null')
      if (v && typeof v.game === 'string' && typeof v.ticket === 'string') return v
    } catch {}
    // Stockage refusé (navigation privée) : la reconnexion marche encore sans rechargement.
    return ticketMemo
  },
  set(game: string, ticket: string) {
    ticketMemo = { game, ticket }
    try {
      localStorage.setItem(TICKET_KEY, JSON.stringify(ticketMemo))
    } catch {}
  },
  clear() {
    ticketMemo = null
    try {
      localStorage.removeItem(TICKET_KEY)
    } catch {}
  },
}

const ERRORS: Record<string, string> = {
  lobby: tr('Il faut être dans le lobby du sas.', 'You need to be in the airlock lobby.'),
  full: tr('Équipe complète (quatre au plus).', 'Crew full (four at most).'),
  playing: tr('Cette équipe est déjà en mission.', 'That crew is already on a mission.'),
  gone: tr('Cette équipe n\'existe plus.', 'That crew no longer exists.'),
  leader: tr('Seul le chef d\'équipe règle la mission.', 'Only the crew leader sets the mission.'),
  carrying: tr('Le colis ne rentre pas dans le casier : posez-vous ailleurs.', 'The crate won\'t fit in the locker.'),
  occupied: tr('Ce casier est déjà pris.', 'That locker is taken.'),
  cooldown: tr('Vous sortez à peine d\'un casier : reprenez votre souffle.', 'You just left a locker: catch your breath.'),
  far: tr('Trop loin, ou hors de vue.', 'Too far, or out of sight.'),
  burning: tr('Une fusée brûle déjà.', 'A flare is already burning.'),
  cargo: tr('Vous portez déjà un colis.', 'You\'re already carrying a crate.'),
  flare: tr('Plus de fusée ici.', 'No flare left here.'),
}

export class SalvageClient {
  private readonly lobbyPanel: LobbyPanel
  private readonly boardPanel = new LeaderboardPanel()
  private readonly hud = new MissionHud()
  private readonly sfx: SalvageSfx
  private readonly fog: FogOfWar
  /** Lampe frontale : elle suit le joueur (ou le coéquipier suivi par la caméra). */
  private readonly lantern = new THREE.PointLight('#ffe7c4', 0, 9, 1.2)
  private readonly flareLight = new THREE.PointLight('#ff3b2f', 0, 7, 1.4)
  private readonly compass: THREE.Mesh
  private readonly rings: { mesh: THREE.Mesh; t: number }[] = []
  private lobby: SalvageLobby = { teams: [] }
  private game: Game | null = null
  private phase: Phase = 'ship'
  private me: SalvageMember | null = null
  private stamina = 1
  private exhausted = false
  private watching: number | null = null
  private ringClock = 0
  private beatClock = 0
  private beepClock = 0
  private quitArmed = 0
  private endTimer = 0
  private caughtTimer = 0
  /** Revenu en capturé : on ouvre les caméras dès que l'équipe est là. */
  private resumeWatch = false
  private resumeTries = 0
  private resumeTimer = 0
  /** Retour au lobby en cours : un seul trajet à la fois. */
  private leaving: Promise<void> | null = null
  private readonly tmp = new THREE.Vector3()

  constructor(private host: SalvageHost) {
    this.sfx = new SalvageSfx(host.sound)
    this.fog = new FogOfWar(host.renderer)
    this.lobbyPanel = new LobbyPanel({
      create: () => host.net.sendSalvage('create'),
      join: (team) => host.net.sendSalvage('join', { team }),
      leave: () => host.net.sendSalvage('leave'),
      settings: (parcels, enemies) => host.net.sendSalvage('settings', { parcels, enemies }),
      ready: (on) => {
        host.net.sendSalvage('ready', { ready: on })
        // Le kit de la baie se charge pendant qu'on attend l'équipe.
        if (on) void loadZoneKit()
      },
      leaderboard: () => void this.boardPanel.open(),
    })
    // Toujours dans la scène (intensité nulle hors de la baie) : pas de shader à recompiler.
    host.scene.add(this.lantern, this.flareLight)
    const arrow = new THREE.Shape()
    arrow.moveTo(0, 0.2)
    arrow.lineTo(0.1, 0)
    arrow.lineTo(0.035, 0.02)
    arrow.lineTo(0.035, -0.12)
    arrow.lineTo(-0.035, -0.12)
    arrow.lineTo(-0.035, 0.02)
    arrow.lineTo(-0.1, 0)
    arrow.closePath()
    const geo = new THREE.ShapeGeometry(arrow)
    geo.rotateX(-Math.PI / 2)
    geo.rotateY(Math.PI)
    this.compass = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#6dff9a', transparent: true, opacity: 0.85, depthWrite: false }))
    this.compass.visible = false
    this.compass.renderOrder = 3
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.36, 32), new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0, depthWrite: false }))
      mesh.rotation.x = -Math.PI / 2
      mesh.visible = false
      this.rings.push({ mesh, t: 1 })
    }
    this.hud.onQuit = () => this.abort()
    this.hud.onThrow = () => this.throwFlare()
    this.hud.onCamera = (step) => this.cycle(step)
    this.hud.onCameraClose = () => this.stopWatching()
  }

  // ------------------------------------------------------------------ état

  /** La baie de la mission en cours (construite), s'il y en a une. */
  get deck(): Deck | null {
    return this.game?.deck ?? null
  }

  get inZone(): boolean {
    return !!this.game && this.host.deck() === this.game.deck
  }

  /** Le personnage ne bouge pas : caché, capturé, derrière les caméras, ou en route. */
  get frozen(): boolean {
    return this.phase === 'loading' || this.phase === 'caught' || this.phase === 'watching' || this.hiding
  }

  /** Le joueur est caché dans un casier de la baie (on ne le voit plus). */
  get hiding(): boolean {
    return this.inZone && this.me?.hidden !== null && this.me?.hidden !== undefined
  }

  /** Un panneau du mode est ouvert (il prend le clavier). */
  /** Fusées en poche, pour le bouton tactile : null hors de la baie (ou caché, capturé). */
  get flares(): { count: number; ready: boolean } | null {
    if (this.phase !== 'zone' || !this.inZone || !this.me || this.me.status !== 'alive' || this.hiding) return null
    return { count: this.me.flares, ready: !this.game?.state?.flare }
  }

  get panelOpen(): boolean {
    return this.lobbyPanel.isOpen || this.boardPanel.isOpen || this.hud.endOpen
  }

  contains(target: EventTarget | null): boolean {
    return this.lobbyPanel.contains(target) || this.boardPanel.contains(target)
  }

  closePanels() {
    this.lobbyPanel.close()
    this.boardPanel.close()
  }

  /** Position du coéquipier suivi par la caméra alliée, s'il y en a un. */
  get watchTarget(): THREE.Vector3 | null {
    if (this.phase !== 'watching' || this.watching === null) return null
    return this.host.remotes.get(this.watching)?.group.position ?? null
  }

  /** Un autre joueur de la baie se voit-il ? Seulement un coéquipier, pas caché dans un casier. */
  sees(id: number): boolean {
    const g = this.game
    if (!g?.state || !g.members.some((m) => m.id === id)) return false
    const m = g.state.members.find((x) => x.id === id)
    return !!m && (m.status === 'alive' || m.status === 'arriving' || m.status === 'captured') && m.hidden === null
  }

  /** Coéquipier de la mission en cours (le chat de la baie reste dans l'équipe). */
  isTeammate(id: number): boolean {
    return !!this.game?.members.some((m) => m.id === id)
  }

  /** Course demandée : refusée à bout de souffle (on reprend la marche jusqu'à récupérer). */
  sprint(wanted: boolean): boolean {
    return wanted && !(this.inZone && this.exhausted)
  }

  // ------------------------------------------------------------------ lobby

  /** Le terminal de mission du lobby. */
  openTerminal() {
    this.refreshLobby()
    this.lobbyPanel.open()
    void loadZoneKit()
  }

  openLeaderboard() {
    void this.boardPanel.open()
  }

  /** Le mur des caméras : suivre ses coéquipiers encore en mission. */
  openCameras(): boolean {
    const g = this.game
    if (!g || g.end || this.inZone) return false
    const alive = this.watchable()
    if (!alive.length) return false
    this.watch(alive[0])
    return true
  }

  private refreshLobby() {
    this.lobbyPanel.update(this.lobby, this.host.net.id, this.host.net.online, !this.host.verified())
  }

  // ------------------------------------------------------------------ messages

  onMessage(m: ServerMessage) {
    switch (m.t) {
      case 'welcome': {
        if (m.salvage) this.lobby = m.salvage
        this.refreshLobby()
        // Une mission en cours avant la coupure (ou le rechargement) : on demande à y revenir.
        this.resumeTries = 0
        this.askResume()
        break
      }
      case 'salvage:lobby':
        this.lobby = { teams: m.teams }
        this.refreshLobby()
        break
      case 'salvage:error':
        if (m.code === 'resume' || m.code === 'elsewhere') clearTimeout(this.resumeTimer)
        // Plus de place à reprendre (partie oubliée par le relais, délai passé) : rien à dire.
        if (m.code === 'resume') {
          ticketStore.clear()
          break
        }
        // La mission se joue dans un autre onglet : on le laisse faire.
        if (m.code === 'elsewhere') break
        if (this.lobbyPanel.isOpen) this.lobbyPanel.message(ERRORS[m.code] ?? tr('Action refusée.', 'Action refused.'))
        else if (this.game) {
          this.host.dialog.show(ERRORS[m.code] ?? tr('Impossible pour l\'instant.', 'Not possible right now.'))
          this.sfx.click(false)
        }
        break
      case 'salvage:start':
        void this.start(m)
        break
      case 'salvage:state':
        if (this.game?.id === m.game) this.apply(m)
        break
      case 'salvage:event':
        if (this.game) this.event(m)
        break
      case 'salvage:end':
        if (this.game?.id === m.game) this.finish(m)
        else if (m.late) {
          clearTimeout(this.resumeTimer)
          // La mission s'est finie pendant la coupure.
          ticketStore.clear()
          this.host.dialog.show(m.won
            ? tr('Pendant votre absence, votre équipe a récupéré toute la cargaison : mission réussie.', 'While you were away, your crew recovered all the cargo: mission accomplished.')
            : tr('Pendant votre absence, la mission a échoué.', 'While you were away, the mission failed.'))
        }
        break
      case 'salvage:reward':
        if (m.refused) {
          this.hud.refused(m.refused)
          break
        }
        this.host.wallet.site({ earned: m.earned, balance: m.balance })
        this.hud.paid(m.earned)
        break
    }
  }

  /**
   * Liaison perdue avec le relais : on revient au lobby ; à la reconnexion, le ticket rend sa
   * place (au sas d'extraction), pendant une minute.
   */
  disconnected() {
    if (!this.game) return
    const g = this.game
    void this.leave(tr(`Liaison perdue avec le relais : votre place vous attend ${RULES.reconnect} secondes, vous reprendrez au sas d'extraction.`, `Lost contact with the relay: your place is kept for ${RULES.reconnect} seconds, you'll resume at the extraction airlock.`))
      .then(() => { if (this.game === g) this.dispose() })
  }

  // ------------------------------------------------------------------ départ, arrivée

  /** Demande à reprendre la mission du ticket ; sans réponse (message perdu), redemande deux fois. */
  private askResume() {
    clearTimeout(this.resumeTimer)
    const saved = ticketStore.get()
    if (!saved || !this.host.net.online || this.game?.id === saved.game) return
    this.host.net.sendSalvage('resume', saved)
    if (this.resumeTries++ < 2) this.resumeTimer = window.setTimeout(() => this.askResume(), 8000)
  }

  private async start(m: SalvageStart) {
    clearTimeout(this.resumeTimer)
    this.closePanels()
    if (this.game) this.dispose()
    ticketStore.set(m.game, m.ticket)
    this.phase = 'loading'
    const [kit, techRig] = await Promise.all([loadZoneKit(), technicianRig()])
    const zone = generateZone(m.seed, { team: m.team, parcels: m.parcels, enemies: m.enemies })
    const deck = new Deck(zoneLevel(zone, kit))
    // Une tuile bloquée l'est tout entière, comme pour le relais : on ne se glisse pas au ras d'un
    // meuble plus petit que sa tuile (le relais refuserait la position, et la vue partirait de dedans).
    for (let z = 0; z < zone.height; z++) {
      for (let x = 0; x < zone.width; x++) {
        const i = z * zone.width + x
        if (zone.blocked[i] && zone.room[i] !== ' ' && !zone.booth[i]) deck.colliders.push({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5 })
      }
    }
    deck.pathfinder.invalidate()
    // Gaspard, derrière la vitre du guichet ; on lui parle au comptoir.
    const technician = new Technician(techRig, BAY_BOOTH.technician, 0)
    deck.group.add(technician.root)
    deck.interactables.push({
      object: technician.root,
      position: new THREE.Vector3(BAY_BOOTH.counter.x, 0, BAY_BOOTH.counter.z - 0.25),
      label: tr(`Parler à ${TECHNICIAN}`, `Talk to ${TECHNICIAN}`),
      onInteract: () => this.talkToTechnician(),
    })
    deck.group.visible = false
    this.host.scene.add(deck.group)
    const monsters = new MonsterView(this.sfx, deck.y)
    this.host.scene.add(monsters.group)
    const items = new ZoneItems(zone, deck, {
      pickup: (kind, id) => this.host.net.sendSalvage('pickup', { kind, id }),
      hide: (locker) => this.hide(locker),
    })
    deck.group.add(this.compass, ...this.rings.map((r) => r.mesh))
    this.game = { id: m.game, zone, deck, monsters, items, members: m.members, parcels: m.parcels, enemies: m.enemies, state: null, end: null, carried: new Map(), technician }
    this.me = { id: this.host.net.id, status: m.status, carrying: null, hidden: null, flares: 0 }
    this.stamina = 1
    this.exhausted = false
    this.fog.setZone(zone)
    this.fog.update(m.spawn, RULES.vision, 0, true)
    this.hud.mission(0, m.parcels)
    this.hud.setFlares(0, false)
    // Revenu après avoir été capturé : on reste au vaisseau, et l'on suit l'équipe par les caméras.
    if (m.resumed && m.status === 'captured') {
      this.phase = 'ship'
      this.resumeWatch = true
      this.host.dialog.show(tr('De retour : vous suivez votre équipe par les caméras.', 'Back: you follow your crew through the cameras.'))
      return
    }
    this.hud.canQuit(true)
    this.hud.show(true)
    this.host.sound.setEcho(1)
    await this.host.moveTo(deck, m.spawn)
    this.phase = 'zone'
    if (m.resumed) {
      this.host.dialog.show(tr('De retour dans la mission : vous reprenez au sas d\'extraction.', 'Back in the mission: you resume at the extraction airlock.'))
      return
    }
    this.host.dialog.show(m.parcels > 1
      ? tr(`${m.parcels} colis à rapporter au sas d'extraction. Marchez sans bruit : ils entendent courir.`, `${m.parcels} crates to bring back to the extraction airlock. Walk quietly: they can hear running.`)
      : tr('Un colis à rapporter au sas d\'extraction. Marchez sans bruit : ils entendent courir.', 'One crate to bring back to the extraction airlock. Walk quietly: they can hear running.'))
  }

  /**
   * Quitte la baie (fin, abandon, capture) : retour devant la porte blindée du lobby. Un second
   * appel pendant le trajet (« Retour au lobby » cliqué pendant la capture) attend le premier.
   */
  private leave(message?: string): Promise<void> {
    this.leaving ??= this.leaveNow(message).finally(() => (this.leaving = null))
    return this.leaving
  }

  private async leaveNow(message?: string) {
    const g = this.game
    if (!g) return
    this.stopWatching(false)
    if (this.inZone) await this.host.moveTo(this.host.hold, LOBBY_RETURN)
    // Reconnecté pendant le trajet : la mission reprise a déjà pris la main.
    if (this.game !== g) return
    // Capturé, on s'était effondré : on se relève au lobby.
    if (this.host.player.avatar.emoteId === 'dodo') this.host.player.avatar.stopEmote()
    this.host.player.load = 1
    this.host.sound.setEcho(0)
    this.hud.show(false)
    this.phase = 'ship'
    if (message) this.host.dialog.show(message)
    // La mission continue pour l'équipe : on garde la baie pour les caméras, jusqu'à la fin ;
    // finie, on la démonte une fois l'écran de fin refermé (son bouton, ou le délai).
    if (g.end && !this.hud.endOpen) this.dispose()
  }

  private dispose() {
    const g = this.game
    if (!g) return
    this.hud.closeEnd()
    this.stopWatching(false)
    for (const o of g.carried.values()) o.removeFromParent()
    g.monsters.dispose()
    g.items.dispose()
    g.technician.dispose()
    this.compass.removeFromParent()
    for (const r of this.rings) r.mesh.removeFromParent()
    g.deck.group.removeFromParent()
    g.deck.group.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.geometry.dispose()
      if (mesh.userData.ownMaterial) (mesh.material as THREE.Material).dispose()
    })
    this.fog.setZone(null)
    this.lantern.intensity = 0
    this.flareLight.intensity = 0
    this.game = null
    this.me = null
    this.phase = 'ship'
    this.hud.show(false)
  }

  // ------------------------------------------------------------------ actions

  private hide(locker: number) {
    if (this.me?.hidden === locker) return this.host.net.sendSalvage('unhide')
    if (this.me?.carrying !== null && this.me?.carrying !== undefined) {
      this.host.dialog.show(ERRORS.carrying)
      return this.sfx.click(false)
    }
    this.host.net.sendSalvage('hide', { locker })
  }

  /** Lance une fusée : vers la tuile visée si elle est à portée et en vue, sinon droit devant. */
  /** Quelques mots avec Gaspard, par l'hygiaphone : ça détend (lui un peu, nous surtout). */
  private talkToTechnician() {
    const g = this.game
    if (!g) return
    this.host.player.interact()
    const line = g.technician.talk({
      carrying: this.me?.carrying !== null && this.me?.carrying !== undefined,
      danger: g.monsters.nearest(BAY_BOOTH.technician),
      delivered: g.state?.delivered ?? 0,
      parcels: g.parcels,
      flares: this.me?.flares ?? 0,
    })
    this.host.dialog.show(tr(`${TECHNICIAN} : « ${line} »`, `${TECHNICIAN}: “${line}”`))
  }

  /** Lance une fusée là où l'on vise ; `ahead` (manette, bouton tactile) : droit devant. */
  throwFlare(ahead = false) {
    const g = this.game
    if (!g || !this.inZone || this.phase !== 'zone' || !this.me || this.me.status !== 'alive' || this.me.hidden !== null) return
    if (!this.me.flares) {
      this.host.dialog.show(tr('Pas de fusée. Il en traîne dans les couloirs.', 'No flares. Some lie around in the corridors.'))
      return this.sfx.click(false)
    }
    const p = sightOrigin(g.zone, this.host.player.position)
    let target: { x: number; z: number } | null = null
    const pointed = ahead ? null : this.host.pointed()
    if (pointed && Math.hypot(pointed.x - p.x, pointed.z - p.z) <= RULES.flare.range && walkable(g.zone, pointed.x, pointed.z) && !inAirlock(g.zone, pointed) && zoneSight(g.zone, p, pointed)) target = pointed
    if (!target) {
      // Droit devant (le regard en vue subjective, sinon le personnage), puis tout autour : au
      // fond d'un cul-de-sac, la fusée repart dans le couloir. La première direction qui porte à
      // 1,5 tuile au moins, sinon la plus lointaine.
      const look = this.host.aim()
      const yaw = look ? Math.atan2(look.x, look.z) : this.host.player.heading
      let best: { x: number; z: number; d: number } | null = null
      for (let k = 0; k < 16 && !(best && best.d >= 1.5); k++) {
        const a = yaw + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8)
        for (let d = RULES.flare.range; d >= 0.6; d -= 0.25) {
          const t = { x: p.x + Math.sin(a) * d, z: p.z + Math.cos(a) * d }
          if (walkable(g.zone, Math.round(t.x), Math.round(t.z)) && !inAirlock(g.zone, t) && zoneSight(g.zone, p, t)) {
            if (!best || d > best.d) best = { ...t, d }
            break
          }
        }
      }
      if (best) target = { x: best.x, z: best.z }
    }
    if (!target) return this.sfx.click(false)
    this.host.player.interact()
    this.host.net.sendSalvage('flare', { x: Math.round(target.x * 100) / 100, z: Math.round(target.z * 100) / 100 })
  }

  /** Abandon (deux clics) : un joueur actif lâche son colis et rentre au lobby. */
  abort() {
    const now = performance.now()
    if (now - this.quitArmed > 3000) {
      this.quitArmed = now
      this.host.dialog.show(tr('Abandonner la mission ? Cliquez encore pour rentrer au lobby.', 'Abort the mission? Click again to return to the lobby.'))
      return
    }
    this.quitArmed = 0
    ticketStore.clear()
    this.host.net.sendSalvage('quit')
    void this.leave(tr('Mission abandonnée : retour au lobby.', 'Mission aborted: back to the lobby.'))
  }

  /** Touches du mode ; true si la touche est prise. */
  keyDown(e: KeyboardEvent): boolean {
    if (this.phase === 'watching') {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.cycle(-1)
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') this.cycle(1)
      else if (e.code === 'Escape' || e.code === 'KeyE') this.stopWatching()
      else return false
      e.preventDefault()
      return true
    }
    if (!this.inZone || e.repeat) return false
    if (e.code === 'KeyF') {
      this.throwFlare()
      return true
    }
    if ((e.code === 'KeyE' || e.code === 'Space') && this.me?.hidden !== null && this.me?.hidden !== undefined) {
      this.host.net.sendSalvage('unhide')
      return true
    }
    if (e.code === 'KeyP') {
      this.host.dialog.show(tr('Pas de photo dans la zone : il fait bien trop noir.', 'No photos in the zone: it\'s far too dark.'))
      return true
    }
    return false
  }

  // ------------------------------------------------------------------ caméras alliées

  private watchable(): number[] {
    const g = this.game
    if (!g?.state) return []
    return g.state.members.filter((m) => m.id !== this.host.net.id && (m.status === 'alive' || m.status === 'arriving') && this.host.remotes.has(m.id)).map((m) => m.id)
  }

  private watch(id: number) {
    const g = this.game
    if (!g) return
    this.watching = id
    this.phase = 'watching'
    this.host.showView(g.deck)
    const r = this.host.remotes.get(id)
    if (r) this.host.iso.snapTo(r.group.position)
    this.fog.update(r?.group.position ?? { x: 0, z: 0 }, RULES.vision, 0, true)
    this.hud.show(true)
    this.hud.canQuit(false)
    this.hud.camera(g.members.find((m) => m.id === id)?.name ?? '?')
  }

  private cycle(step: 1 | -1) {
    const ids = this.watchable()
    if (!ids.length) return
    const i = this.watching === null ? -1 : ids.indexOf(this.watching)
    this.watch(ids[(i + step + ids.length) % ids.length])
  }

  private stopWatching(restore = true) {
    if (this.phase !== 'watching') return
    this.watching = null
    this.phase = 'ship'
    this.hud.camera(null)
    this.hud.show(false)
    if (restore) {
      this.host.showView(null)
      this.host.iso.snapTo(this.host.player.position)
    }
  }

  // ------------------------------------------------------------------ état reçu

  private apply(s: SalvageState) {
    const g = this.game!
    g.state = s
    g.monsters.apply(s.monsters)
    const self = this.host.net.id
    const mine = s.members.find((m) => m.id === self) ?? null
    const wasHidden = this.me?.hidden ?? null
    this.me = mine
    g.items.sync(s, mine?.hidden ?? null)
    this.hud.mission(s.delivered, g.parcels)
    this.hud.team(g.members.map((m): HudMember => {
      const st = s.members.find((x) => x.id === m.id)
      return { id: m.id, name: m.name, status: st?.status ?? 'gone', carrying: st?.carrying !== null && st?.carrying !== undefined, hidden: st?.hidden !== null && st?.hidden !== undefined }
    }), self)
    if (mine) {
      this.hud.setFlares(mine.flares, !g.state.flare)
      this.host.player.load = mine.carrying !== null ? RULES.carry : 1
      // Caché, ou sorti du casier : le personnage suit (le relais l'a posé au fond, ou devant).
      if (this.inZone && mine.hidden !== wasHidden) {
        const player = this.host.player
        if (mine.hidden !== null) {
          const spot = lockerSpot(g.zone.lockers[mine.hidden])
          player.cancelPath()
          player.position.set(spot.x, g.deck.y, spot.z)
        } else if (wasHidden !== null) {
          const front = lockerFront(g.zone.lockers[wasHidden])
          player.position.set(front.x, g.deck.y, front.z)
        }
      }
    }
    // Colis sur le dos des porteurs.
    const carriers = new Set(s.members.filter((m) => m.carrying !== null && m.status === 'alive').map((m) => m.id))
    for (const [id, o] of g.carried) {
      if (!carriers.has(id)) {
        o.removeFromParent()
        g.carried.delete(id)
      }
    }
    for (const id of carriers) this.carry(id)
    // Fusée qui brûle (le relais la tient ; on la rattrape si on l'a manquée).
    if (!s.flare) g.items.stopFlare()
    if (this.resumeWatch && this.watchable().length) {
      this.resumeWatch = false
      this.openCameras()
    }
  }

  /** Accroche un colis dans le dos du porteur (os du torse : il suit les animations). */
  private carry(id: number) {
    const g = this.game!
    const avatar = id === this.host.net.id ? this.host.player.avatar : this.host.remotes.get(id)?.avatar
    const torso = avatar?.root.getObjectByName('torso')
    const current = g.carried.get(id)
    if (!torso || current?.parent === torso) return
    current?.removeFromParent()
    const c = cargoCanister(1)
    // Repère de l'os, unités du modèle : on le recale sur la taille réelle du torse.
    const box = new THREE.Box3()
    torso.updateMatrixWorld(true)
    const inv = new THREE.Matrix4().copy(torso.matrixWorld).invert()
    torso.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh || !mesh.geometry) return
      mesh.geometry.computeBoundingBox()
      box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld).applyMatrix4(inv))
    })
    if (box.isEmpty()) box.set(new THREE.Vector3(-0.4, 0, -0.3), new THREE.Vector3(0.4, 0.9, 0.3))
    // Plaqué dans le dos, à sa taille réelle (celle du colis posé au sol), le bas au niveau des
    // hanches : le porteur le sent passer.
    const world = torso.getWorldScale(new THREE.Vector3()).y || 1
    const scale = 1 / world
    c.scale.setScalar(scale)
    c.position.set((box.min.x + box.max.x) / 2, box.min.y, box.min.z - 0.1 * scale)
    torso.add(c)
    g.carried.set(id, c)
  }

  private event(e: SalvageEvent) {
    const g = this.game!
    const self = this.host.net.id
    const name = (id?: number) => g.members.find((m) => m.id === id)?.name ?? '?'
    const at = (x?: number, z?: number) => (x === undefined || z === undefined ? null : new THREE.Vector3(x, g.deck.y + 0.4, z))
    switch (e.kind) {
      case 'pickup':
        if (e.id === self) {
          this.sfx.pickup()
          this.host.player.interact()
          this.host.dialog.show(tr('Colis récupéré ! Rapportez-le au sas d\'extraction : suivez la flèche verte. Il pèse : vous êtes plus lent.', 'Crate recovered! Bring it to the extraction airlock: follow the green arrow. It\'s heavy: you\'re slower.'))
        } else this.host.dialog.show(tr(`${name(e.id)} a trouvé un colis.`, `${name(e.id)} found a crate.`))
        break
      case 'flare-pickup':
        if (e.id === self) {
          this.sfx.click(true)
          this.host.player.interact()
          this.host.dialog.show(matchMedia('(pointer: coarse)').matches
            ? tr('Fusée d\'appel : le bouton rouge à flamme la lance droit devant. Elle attire les ennemis proches quelques secondes.', 'Decoy flare: the red flame button throws it straight ahead. It lures nearby enemies for a few seconds.')
            : tr('Fusée d\'appel : F la lance là où vous visez. Elle attire les ennemis proches quelques secondes.', 'Decoy flare: F throws it where you aim. It lures nearby enemies for a few seconds.'))
        }
        break
      case 'deposit':
        this.sfx.deposit()
        if (e.delivered !== undefined) this.hud.mission(e.delivered, g.parcels)
        this.host.dialog.show(e.id === self
          ? tr(`Colis livré ! ${e.delivered} sur ${g.parcels}.`, `Crate delivered! ${e.delivered} of ${g.parcels}.`)
          : tr(`${name(e.id)} a livré un colis : ${e.delivered} sur ${g.parcels}.`, `${name(e.id)} delivered a crate: ${e.delivered} of ${g.parcels}.`))
        break
      case 'drop':
        if (e.id !== self) this.host.dialog.show(tr(`${name(e.id)} a lâché son colis.`, `${name(e.id)} dropped their crate.`))
        break
      case 'hide':
      case 'unhide':
      case 'eject': {
        if (e.locker !== undefined) g.items.bang(e.locker)
        const pos = e.locker !== undefined ? g.items.lockerPosition(e.locker) : null
        if (pos && this.hearing()) this.sfx.locker(pos, e.kind === 'eject')
        if (e.kind === 'eject' && e.id === self) this.host.dialog.show(tr('Impossible de rester plus longtemps : vous sortez du casier.', 'You can\'t stay any longer: you step out of the locker.'))
        if (e.kind === 'hide' && e.id === self) this.host.dialog.show(tr(`Caché. ${RULES.locker.max} secondes au plus ; E pour sortir. Il ne vous trouvera que s'il était juste derrière vous.`, `Hidden. ${RULES.locker.max} seconds at most; E to get out. It will only find you if it was right behind you.`))
        break
      }
      case 'search': {
        if (e.locker === undefined) break
        g.items.shake(e.locker)
        const pos = g.items.lockerPosition(e.locker)
        if (pos) this.sfx.rattle(pos)
        if (this.me?.hidden === e.locker) this.host.dialog.show(tr('Il fouille votre casier…', 'It\'s searching your locker…'))
        break
      }
      case 'searched':
        if (e.locker !== undefined) g.items.bang(e.locker)
        break
      case 'flare': {
        const from = this.host.remotes.get(e.id ?? -1)?.group.position ?? this.host.player.position
        g.items.throwFlare(new THREE.Vector3(from.x, 0, from.z), { x: e.x ?? 0, z: e.z ?? 0 }, e.burn ?? RULES.flare.burn)
        const pos = at(e.x, e.z)
        if (pos) this.sfx.flare(pos, e.burn ?? RULES.flare.burn)
        if (e.id !== self) this.host.dialog.show(tr(`${name(e.id)} a lancé une fusée.`, `${name(e.id)} threw a flare.`))
        break
      }
      case 'flare-out':
        g.items.stopFlare()
        break
      case 'spotted':
        if (e.id === self) this.host.dialog.show(tr('Repéré ! Courez, cachez-vous, ou lancez une fusée.', 'Spotted! Run, hide, or throw a flare.'))
        break
      case 'capture':
        this.captured(e)
        break
      case 'quit':
      case 'gone':
        if (e.id !== self) this.host.dialog.show(tr(`${name(e.id)} a quitté la mission.`, `${name(e.id)} left the mission.`))
        if (this.watching === e.id) this.cycle(1)
        break
      case 'away':
        if (e.id !== self) this.host.dialog.show(tr(`${name(e.id)} a perdu la liaison : sa place l'attend ${e.wait ?? RULES.reconnect} secondes.`, `${name(e.id)} lost contact: their place is kept for ${e.wait ?? RULES.reconnect} seconds.`))
        if (this.watching === e.id) this.cycle(1)
        break
      case 'back': {
        // Revenu sous un nouvel id : l'équipe le retrouve.
        const member = g.members.find((m) => m.id === e.old)
        if (member && e.id !== undefined) member.id = e.id
        if (e.id !== self) this.host.dialog.show(tr(`${name(e.id)} est de retour.`, `${name(e.id)} is back.`))
        break
      }
    }
  }

  private captured(e: SalvageEvent) {
    const g = this.game!
    const self = this.host.net.id
    const monster = e.monster !== undefined ? g.monsters.position(e.monster) : null
    if (e.id === self) {
      this.phase = 'caught'
      this.caughtTimer = 2.4
      this.hud.flash(true)
      this.sfx.capture(null)
      this.host.iso.shake(0.35)
      const player = this.host.player
      player.cancelPath()
      if (monster) player.lookAt(monster)
      player.avatar.playEmote('dodo')
      this.host.net.sendEmote('dodo')
      const others = g.state?.members.some((m) => m.id !== self && (m.status === 'alive' || m.status === 'arriving' || m.status === 'away'))
      this.host.dialog.show(others
        ? tr('Capturé ! Vos coéquipiers continuent : suivez-les sur les caméras.', 'Caught! Your crewmates carry on: follow them on the cameras.')
        : tr('Capturé !', 'Caught!'))
      return
    }
    const r = this.host.remotes.get(e.id ?? -1)
    const pos = r?.group.position ?? (e.x !== undefined ? new THREE.Vector3(e.x, g.deck.y, e.z) : null)
    if (pos && this.hearing()) this.sfx.capture(pos.clone().setY(g.deck.y + 0.5))
    this.hud.flash(false)
    this.host.dialog.show(tr(`${g.members.find((m) => m.id === e.id)?.name ?? '?'} a été capturé !`, `${g.members.find((m) => m.id === e.id)?.name ?? '?'} was caught!`))
    if (this.watching === e.id) window.setTimeout(() => this.cycle(1), 1800)
  }

  private finish(r: SalvageEnd) {
    const g = this.game!
    g.end = r
    ticketStore.clear()
    this.sfx.end(r.won)
    this.hud.mission(r.delivered, r.parcels)
    // Plus rien à suivre : un capturé resté au lobby retrouve sa vue, sous l'écran de fin.
    if (this.phase === 'watching') this.stopWatching()
    this.hud.canQuit(false)
    this.endTimer = 25
    g.items.stopFlare()
    this.hud.showEnd(r, !this.host.verified(), () => {
      this.endTimer = 0
      if (this.inZone || this.phase === 'watching') void this.leave()
      else this.dispose()
    })
  }

  /** On entend la baie : on y est, ou on la suit par les caméras. */
  private hearing(): boolean {
    return this.inZone || this.phase === 'watching'
  }

  // ------------------------------------------------------------------ chaque image

  /**
   * @param dt pas de temps
   * @param moving le joueur se déplace ; `running` : à la course
   */
  update(dt: number) {
    const g = this.game
    if (!g) return
    const inZone = this.inZone
    const viewer = this.watchTarget ?? (inZone ? this.host.player.position : null)
    // Fin de mission : on rentre de soi-même au bout d'un moment.
    if (g.end && this.endTimer > 0 && (this.endTimer -= dt) <= 0 && this.hud.endOpen) {
      this.hud.closeEnd()
      if (inZone || this.phase === 'watching') void this.leave()
      else this.dispose()
      return
    }
    if (this.phase === 'caught' && (this.caughtTimer -= dt) <= 0) {
      this.phase = 'zone'
      void this.leave().then(() => {
        if (!this.game || this.game.end) return
        if (!this.openCameras()) this.host.dialog.show(tr('Plus personne à suivre : la mission se termine.', 'Nobody left to follow: the mission is ending.'))
      })
    }
    if (this.phase === 'watching' && this.watching !== null && !this.watchable().includes(this.watching)) {
      const next = this.watchable()
      if (next.length) this.watch(next[0])
    }

    g.monsters.group.visible = g.deck.group.visible
    g.monsters.update(dt, viewer ? this.tmp.copy(viewer) : null)
    g.items.update(dt)
    g.technician.update(dt, g.monsters.nearest(BAY_BOOTH.technician))
    if (!viewer) {
      this.lantern.intensity = 0
      this.flareLight.intensity = 0
      return
    }

    // Vue : autour de soi (ou du coéquipier suivi), réduite dans un casier.
    const hidden = inZone && this.me?.hidden !== null && this.me?.hidden !== undefined
    this.fog.update(viewer, hidden ? RULES.hiddenVision : RULES.vision, dt)
    this.hud.peek(hidden)
    this.lantern.position.set(viewer.x, g.deck.y + 1.05, viewer.z)
    // Caché, la lampe baisse un peu, mais éclaire encore devant le casier : on voit venir.
    this.lantern.intensity = hidden ? 3.2 : 4.5
    this.lantern.distance = hidden ? 8 : 9
    const flare = g.items.flare
    this.flareLight.intensity = flare ? 4 * flare.k : 0
    if (flare) this.flareLight.position.set(flare.x, g.deck.y + 0.35, flare.z)

    // Cœur qui bat : un ennemi tout près.
    const near = g.monsters.nearest(viewer)
    if (near < 5 && (this.beatClock -= dt) <= 0) {
      this.beatClock = 0.42 + (near / 5) * 0.75
      this.sfx.heartbeat(1 - near / 5)
    }
    if (!inZone) return

    const player = this.host.player
    const alive = this.me?.status === 'alive' && !hidden
    // Endurance : la course la vide (plus vite avec un colis), la marche et l'arrêt la rendent.
    const running = alive && player.avatar.locomotion === 'sprint'
    const walking = player.avatar.locomotion === 'walk'
    const carrying = this.me?.carrying !== null && this.me?.carrying !== undefined
    const s = RULES.stamina
    if (running) this.stamina -= dt * (carrying ? s.carryDrain : s.drain)
    else this.stamina += dt * (walking ? s.walkRegen : s.idleRegen)
    this.stamina = THREE.MathUtils.clamp(this.stamina, 0, 1)
    if (this.stamina <= 0) {
      if (!this.exhausted) this.host.dialog.show(tr('À bout de souffle : vous marchez.', 'Out of breath: you slow to a walk.'))
      this.exhausted = true
    } else if (this.exhausted && this.stamina >= s.recover) this.exhausted = false
    const head = this.host.project(this.tmp.set(player.position.x, player.position.y + 1.25, player.position.z))
    this.hud.placeStamina(head.x, head.y, this.stamina, this.exhausted, alive && (this.stamina < 0.999 || running))
    const lockerLeft = hidden ? this.me?.left ?? null : null
    this.hud.placeLocker(head.x, head.y - 14, lockerLeft)

    // Repère du bruit : des ondes au sol quand on court.
    this.ringClock -= dt
    if (running && this.ringClock <= 0) {
      this.ringClock = 0.45
      const ring = this.rings.find((r) => r.t >= 1)
      if (ring) {
        ring.t = 0
        ring.mesh.position.set(player.position.x, 0.02, player.position.z)
        ring.mesh.visible = true
      }
    }
    for (const r of this.rings) {
      if (r.t >= 1) continue
      r.t = Math.min(1, r.t + dt / 0.7)
      r.mesh.scale.setScalar(1 + r.t * (carrying ? 5.5 : 4.5))
      ;(r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - r.t) * 0.55
      r.mesh.visible = r.t < 1
    }

    // Flèche vers le sas quand on porte un colis.
    const pad = g.zone.airlock.pad
    this.compass.visible = alive && carrying
    if (this.compass.visible) {
      const yaw = Math.atan2(pad.x - player.position.x, pad.z - player.position.z)
      this.compass.position.set(player.position.x + Math.sin(yaw) * 0.5, 0.03, player.position.z + Math.cos(yaw) * 0.5)
      this.compass.rotation.y = yaw
    }

    // Détecteur de cargaison : il bipe plus vite près d'un colis au sol.
    if (alive && !carrying && g.state) {
      let d = Infinity
      for (const c of g.state.cargo) if (c.state === 'ground') d = Math.min(d, Math.hypot(c.x - player.position.x, c.z - player.position.z))
      if (d < 7 && (this.beepClock -= dt) <= 0) {
        this.beepClock = 0.28 + d * 0.22
        this.sfx.detector(1 - d / 7)
      }
    }

    this.hud.setHint(hidden
      ? tr('E : sortir du casier', 'E: leave the locker')
      : carrying
        ? tr('Rapportez le colis au sas (flèche verte) · Maj : courir, bruyant', 'Bring the crate to the airlock (green arrow) · Shift: run, noisy')
        : tr('E : ramasser, se cacher · Maj : courir (bruyant) · F : fusée · le détecteur bipe près d\'un colis', 'E: pick up, hide · Shift: run (noisy) · F: flare · the detector beeps near a crate'))
  }

  /** Rend la scène à travers le brouillard (dans la baie, ou par les caméras) ; false sinon. */
  render(scene: THREE.Scene, camera: THREE.Camera, light: boolean): boolean {
    if (!this.game || !(this.inZone || this.phase === 'watching')) return false
    this.fog.resize(light)
    this.fog.render(scene, camera)
    return true
  }

  /** Niveau (pont) de la baie, pour les pas et la hauteur des personnages. */
  static readonly LEVEL = ZONE_LEVEL
}
