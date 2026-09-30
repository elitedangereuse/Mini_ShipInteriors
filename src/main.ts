import { GymGame, type Sport } from './gym'
import { loadSiteArt, SitePanel } from './site'
import * as THREE from 'three'
import type { ArcadeCabinet } from './arcade/cabinet'
import { isGameId, type GameId } from './arcade/game'
import { fetchRecords } from './arcade/scores'
import { BoardGames } from './board/games'
import { BarPanel, CocktailEffects } from './bar'
import { GameEmbed } from './game-embed'
import { MediaRoom } from './media-room'
import { CinemaRoom } from './cinema-room'
import { CAT_MODEL, preload, rig } from './assets'
import type { CabinEditor } from './cabin/editor'
import { CabinBar, InviteMenu, InviteToasts, type CrewEntry } from './cabin/hud'
import { normalizeLayout, sameLayout, serializeLayout, type CabinItem, type CabinLayout } from './cabin/layout'
import { CabinStore, requestCabin, type SiteCabin } from './cabin/storage'
import { devCmdr, devLjpc, devVoie, fetchCmdrAccount, isLegacyDefaultName, randomCmdrName } from './cmdr'
import { ECONOMY, formatCredits, skinPrice, wingPrice, type JobKind } from './economy/data'
import { CreditsHud } from './economy/hud'
import { taskOf } from './economy/schedule'
import { allLooks, lookOwned, skinProduct, starterLook } from './economy/skins'
import { TASK_INFO, TaskBoard, type LiveTask, type WorkSound } from './economy/tasks'
import { Wallet } from './economy/wallet'
import { Sound } from './audio'
import { Avatar, EMOTES } from './avatar'
import { IsoCamera } from './camera'
import { FirstPersonCamera } from './fps'
import { Cat } from './cat'
import { MAX_PETS, petRig, speciesOfItem, type Species } from './pets'
import { Deck, firstPersonGlass, type Interactable } from './deck'
import { Minimap } from './minimap'
import { beatAt, beatPulse, film, filmGlow, holoMeGlow, holoTime, studio, type ClawControl, type ClawResult } from './furniture'
import { GamepadControls, type GamepadInput } from '../shared/gamepad.js'
import { TouchGamepad } from './touch-gamepad'
import { lineOfSight } from '../shared/sight.js'
import { DIRS } from './map'
import { EN, localizeAttributes, tr } from './i18n'
import { CAT_SPAWN, DEFAULT_AMBIENCE, LEVEL_HEIGHT, LEVELS, LIFT, SPAWN } from './levels'
import { hydrateIcons, icon } from './icons'
import { lookId, lookPath, lookRig, parseLook, raceOf, variantsOf, type Look } from './looks'
import { JukeboxPanel, JukeboxPlayer, trackById, type MusicOptions, type Track } from './music'
import { Net, type BoardGameId, type JukeboxWhere, type MusicState, type PlayerState } from './net'
import type { Tile } from './pathfinding'
import { PhotoMode } from './photo'
import { overlapsAny, resolveCircle } from './physics'
import { Player } from './player'
import { renderQuality } from './quality'
import { findReaction, REACTIONS, reactionImage } from './reactions'
import { Patroller, SERGEANT, soldierRig, type ShipReport } from './patrol'
import { CHEF, Chef, chefRig, type ChefReport } from './chef'
import { Kitchen } from './kitchen'
import { NURSE, Nurse, nurseRig, type NurseReport } from './nurse'
import { DROID, MECHANIC, Mechanic, mechanicRig, type MechanicReport } from './mechanic'
import { Hangar } from './hangar'
import { KRAIT_COCKPIT } from '../shared/mechanic.js'
import { GroundBase } from './base/client'
import { CHIEF } from './base/chief'
import { BASE_COCKPIT, BASE_LEVEL } from '../shared/ground-base.js'
import type { ChiefState } from './net'
import { Infirmary, Plasters } from './infirmary'
import { menuOf } from './menu'
import { RemotePlayer } from './remote'
import { Seating, type Seated } from './seating'
import { Starfield } from './starfield'
import { SystemView, SYSTEMS } from './systems'
import { nextSystem, JUMP_CHARGE, JUMP_TRAVEL, type SystemId } from '../shared/systems.js'
import { DEFAULT_PATTERN, WING_SLOTS, type WingId } from '../shared/cabin-wings.js'
import { syncTempo, tempo } from './tempo'
import { ToiletFlushes } from './toilet-flush'
import { SalvageClient } from './salvage/client'
import { LOBBY_RETURN, ZONE_LEVEL } from '../shared/salvage.js'
import { $, bootDone, bootProgress, Bubbles, Chat, Dialog, fadeScreen, LiftPanel, nameTag, WardrobePanel } from './ui'
import { LiftRide } from './lift-ride'

// ------------------------------------------------------------------ profil

const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v)
    } catch {}
  },
}
// Nom d'invité : gardé d'une visite à l'autre, tiré au sort la première fois (« CMDR Ripley »…).
const storedName = store.get('name')
const guestName = storedName && !isLegacyDefaultName(storedName) ? storedName : randomCmdrName()
store.set('name', guestName)

// Compte Élite Dangereuse et quartiers aménagés : demandés au site pendant le chargement des
// modèles (le cookie du site identifie le CMDR ; un invité reçoit un refus).
const accountRequest = fetchCmdrAccount(15000)
const cabinRequest = requestCabin(15000)
/** Crédits du CMDR (cf. economy/wallet.ts), demandés au site en même temps. */
const wallet = new Wallet()
void wallet.load()
/**
 * Réponse d'une demande au site, attendue au plus `ms` à partir de maintenant. Le délai ne court
 * qu'une fois les modèles chargés : sur une machine lente, le chargement seul dépasse souvent
 * quelques secondes, alors que le site a répondu depuis longtemps.
 */
const within = <T,>(request: Promise<T>, ms: number, fallback: T) =>
  Promise.race([request, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))])

/**
 * `name` : nom affiché (CMDR du site si le compte est lié, sinon nom d'invité).
 * `skin` : identifiant d'apparence (cf. looks.ts), ex. « alien.female.c.blue ».
 */
const profile = {
  name: guestName,
  skin: lookId(store.get('skin') ? parseLook(store.get('skin')) : starterLook()),
}
store.set('skin', profile.skin)
/** Compte lié au site (le relais le confirme en faisant reconnaître le cookie du site). */
let linked = false
/** Le relais a reconnu le CMDR : nom verrouillé, badge « vérifié ». */
let verified = false
/** Badge accordé à la fin de l'aventure L.J.P.C. ; l'accès reste fermé pendant sa vérification. */
let ljpcMember = false
/** Première épreuve de la Voie accomplie : accès individuel au sanctuaire de la cale. */
let voieAdept = false

// ------------------------------------------------------------------ rendu

const coarsePointer = matchMedia('(pointer: coarse)').matches
// Sur téléphone, 1,5 pixel physique par pixel CSS suffit et évite de remplir jusqu'à quatre
// fois plus de fragments que nécessaire. La résolution adaptative continue d'affiner ce choix.
const MAX_DPR = Math.min(devicePixelRatio, coarsePointer ? 1.5 : 2)
renderQuality.light = store.get('mini-shipinteriors-light') === 'true'
let dpr = Math.min(MAX_DPR, coarsePointer ? 1.25 : 1.5)
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(renderQuality.light ? Math.min(MAX_DPR, 0.75) : dpr)
renderer.setSize(innerWidth, innerHeight)
renderer.setClearColor(0x000000, 0) // fond : dégradé CSS
renderer.shadowMap.enabled = !renderQuality.light
renderer.shadowMap.type = THREE.PCFShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.1
$('app').appendChild(renderer.domElement)

const scene = new THREE.Scene()
const iso = new IsoCamera(innerWidth / innerHeight)
const zoomParam = Number(new URLSearchParams(location.search).get('zoom'))
if (zoomParam) iso.zoomBy(zoomParam / 5.5)
// Vue subjective (bouton à côté du mode léger) : la vue isométrique reprend la main là où il faut
// voir la scène de haut (aménagement, photo, pince, bar, cinéma), cf. `isoOnly`.
const fps = new FirstPersonCamera(innerWidth / innerHeight)
let fpsWanted = store.get('mini-shipinteriors-fps') === 'true'
/** Vue subjective affichée à l'image courante. */
let fpsShown = false
/** Vue qui convertit les directions de l'écran en directions au sol, et caméra du rendu. */
const view = () => (fpsShown ? fps : iso)
const activeCamera = (): THREE.Camera => (fpsShown ? fps.camera : iso.camera)

// Ciel et soleil : leurs couleurs changent d'un pont à l'autre (cf. `ambience` dans levels.ts).
const hemi = new THREE.HemisphereLight(DEFAULT_AMBIENCE.sky, DEFAULT_AMBIENCE.ground, DEFAULT_AMBIENCE.hemi)
scene.add(hemi)

// Soleil fixe dont l'ombre couvre tout le vaisseau : pas de « nage » des ombres quand la caméra bouge.
const SHIP_CENTER = new THREE.Vector3(13, 0, 5)
const sun = new THREE.DirectionalLight(DEFAULT_AMBIENCE.sun, DEFAULT_AMBIENCE.sunIntensity)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
sun.shadow.camera.left = sun.shadow.camera.bottom = -20
sun.shadow.camera.right = sun.shadow.camera.top = 20
sun.shadow.camera.near = 1
sun.shadow.camera.far = 50
sun.shadow.bias = -0.0005
sun.shadow.normalBias = 0.03
scene.add(sun, sun.target)

// Réserve de lumières ponctuelles de taille fixe : changer de pont ne recompile aucun shader.
const lightPool = Array.from({ length: 8 }, () => {
  const l = new THREE.PointLight('#ffffff', 0, 7, 1.5)
  scene.add(l)
  return l
})

// ------------------------------------------------------------------ monde

// Les modèles font l'essentiel de l'attente : 90 % de la jauge, le reste pour le site et le montage.
await preload([lookPath(parseLook(profile.skin))], (r) => bootProgress(r * 0.9))
bootProgress(0.94, tr('Identification du CMDR', 'Identifying CMDR'))
const account = await within(accountRequest, 3000, null)
if (account) {
  linked = true
  profile.name = `CMDR ${account.name}`
  ljpcMember = account.ljpc
  voieAdept = account.voie
}
/** Réponse du site sur les quartiers du CMDR, si elle est arrivée à temps (undefined : pas encore). */
const siteCabin = account ? await within<SiteCabin | null | undefined>(cabinRequest, 3000, undefined) : undefined
/**
 * Enregistrement des quartiers d'un CMDR : sur le site, ou dans ce navigateur s'il ne répond pas.
 * Tant que le site n'a pas répondu, on ne les aménage pas : on écraserait ceux qu'il garde.
 */
let cabinStore = account ? new CabinStore(account.name) : null

const decks = LEVELS.map((def) => new Deck(def))
for (const d of decks) scene.add(d.group)
const deckById = (id: number) => decks.find((d) => d.def.id === id)!
/** Aspirés par les toilettes pendant un saut FSD (cf. flushCrew). */
const flushes = new ToiletFlushes(scene)
deckById(0).setLjpcAccess(ljpcMember)
deckById(-1).setVoieAccess(voieAdept)
const ljpcEntrance = deckById(0).map.doors.find((door) => {
  const d = DIRS[door.dir]
  const map = deckById(0).map
  return map.room(door.x, door.z) === 'l' || map.room(door.x + d.dx, door.z + d.dz) === 'l'
})
const ljpcDoorItem = ljpcEntrance && deckById(0).doorExamine(ljpcEntrance.x, ljpcEntrance.z, ljpcEntrance.dir)
if (ljpcDoorItem) ljpcDoorItem.label = tr('Accès réservé', 'Restricted access')
const voieEntrance = deckById(-1).map.doors.find((door) => {
  const d = DIRS[door.dir]
  const map = deckById(-1).map
  return map.room(door.x, door.z) === 'v' || map.room(door.x + d.dx, door.z + d.dz) === 'v'
})
const voieDoorItem = voieEntrance && deckById(-1).doorExamine(voieEntrance.x, voieEntrance.z, voieEntrance.dir)
const jacquesAt = deckById(-1).interactables.find((it) => it.furniture?.model === 'bartender')!.position

// Les quartiers du commandant : la cabine du joueur, meublée selon son aménagement.
const cabinDeck = decks.find((d) => d.cabin)!
const cabin = cabinDeck.cabin!

/** Réponse du site (ou son absence) : l'aménagement à montrer, envoyé au site s'il vient de ce navigateur. */
function connectStore(store: CabinStore, site: SiteCabin | null): CabinLayout {
  const { layout: raw, upload } = store.connect(site)
  const layout = normalizeLayout(raw, cabin.bounds)
  if (upload) store.save(layout)
  return layout
}

/**
 * Aménagement des quartiers du joueur : pour un CMDR, celui du site (en attendant sa réponse,
 * celui gardé dans ce navigateur) ; sinon, celui d'origine.
 */
let ownLayout: CabinLayout = !cabinStore
  ? normalizeLayout(null, cabin.bounds)
  : siteCabin !== undefined
    ? connectStore(cabinStore, siteCabin)
    : normalizeLayout(cabinStore.localCopy, cabin.bounds)
if (cabinStore && siteCabin === undefined) {
  const store = cabinStore
  void cabinRequest.then((site) => siteAnswered(store, site))
}
cabin.setLayout(ownLayout)

/** On se réveille à deux pas du Holo-Me : sur une tuile libre voisine, sinon sur sa plateforme. */
function spawnPoint(): { x: number; z: number } {
  const h = cabin.holoMe?.position
  if (!h) return SPAWN
  const hx = Math.round(h.x), hz = Math.round(h.z)
  for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [1, -1], [-1, 1], [1, 0], [0, 1], [1, 1]]) {
    if (cabinDeck.pathfinder.walkable(hx + dx, hz + dz)) return { x: hx + dx, z: hz + dz }
  }
  return { x: h.x, z: h.z }
}

/**
 * Où l'on se tenait juste avant de recharger la page (cf. saveWhere), si c'est à bord et que la
 * tuile est toujours libre : sinon, on se réveille dans ses quartiers.
 */
const WHERE_KEY = 'mini-shipinteriors-where'
function resumePoint(): { deck: Deck; x: number; z: number; yaw: number } | null {
  try {
    const w = JSON.parse(sessionStorage.getItem(WHERE_KEY) ?? 'null')
    const d = w && decks.find((d) => d.def.id === w.level && !d.def.zone && !d.def.ground)
    if (!d || ![w.x, w.z, w.yaw].every(Number.isFinite)) return null
    return d.pathfinder.walkable(Math.round(w.x), Math.round(w.z)) ? { deck: d, x: w.x, z: w.z, yaw: w.yaw } : null
  } catch {
    return null
  }
}
const resumed = resumePoint()

let deck = resumed?.deck ?? cabinDeck
/**
 * Pont affiché : celui du joueur, ou la baie de la zone thargoïde quand un capturé suit son
 * équipe par les caméras (le joueur, lui, reste au lobby).
 */
let viewDeck = cabinDeck
/** Zone thargoïde : lobby, mission, caméras (créée une fois le relais prêt, cf. plus bas). */
let salvage: SalvageClient | null = null

const stars = new Starfield()
scene.add(stars.group)
/** Le système où se trouve le vaisseau, vu par les verrières (il change au saut FSD). */
const systemView = new SystemView()
scene.add(systemView.group)

const player = new Player(new Avatar(await lookRig(parseLook(profile.skin))), deck.colliders)
player.doorways = () => deck.doorways()
const cocktailEffects = new CocktailEffects(player, scene)
const barFocus = new THREE.Vector3()
let barZoom: number | null = null
const barPanel = new BarPanel(wallet, cocktailEffects,
  () => {
    barZoom = iso.zoomLevel
    iso.zoomTo(Math.min(barZoom, innerWidth <= 900 ? 3.2 : 2.7))
  },
  () => {
    if (barZoom !== null) iso.zoomTo(barZoom)
    barZoom = null
  },
)
const gameEmbed = new GameEmbed()
const mediaRoom = new MediaRoom({ get: () => iso.zoomLevel, set: (value) => iso.zoomTo(value) })
const cinemaRoom = new CinemaRoom({
  online: () => net.online, self: () => net.id, choose: (id) => net.sendCinemaChoice(id),
  search: (query) => net.searchCinema(query), video: (id) => net.sendCinemaVideo(id),
  duration: (id, since, duration) => net.sendCinemaDuration(id, since, duration),
})
const cinemaScreenProp = deckById(1).def.props.find((p) => p.model === 'cinema-screen')!
const cinemaFocus = new THREE.Vector3()
const spawn = resumed ?? spawnPoint()
player.position.set(spawn.x, deck.y, spawn.z)
if (resumed) {
  player.setHeading(resumed.yaw)
  player.root.rotation.y = resumed.yaw
}
scene.add(player.root)

/** Place occupée sur un meuble : assis, couché, aux commandes, à une borne (cf. seating.ts). */
const seating = new Seating({
  player,
  deck: () => deck,
  visible: () => [...remotes.values()].filter((r) => r.group.visible),
  self: () => net.id,
  walk: (to, arrived) => walkTo(to, arrived),
  settled: (seat) => seated(seat),
  taken: () => dialog.show(tr('Quelqu\'un vient de prendre la place.', 'Someone just took that seat.')),
  changed: () => poseChanged(),
})

// Comète vit près de son panier ; sans panier dans les quartiers affichés, il n'est pas là
// (on peut le remplacer par un autre compagnon, cf. syncCompanions).
const catDeck = cabinDeck
const basket = cabin.items.find((i) => i.m === 'cat-bed') ?? CAT_SPAWN
/** Gamelles posées dans les quartiers affichés : les animaux y passent manger. */
const petBowls = () => cabin.items.filter((i) => i.m === 'pet-bowl').map(({ x, z }) => ({ x, z }))
const cat = new Cat(await rig(CAT_MODEL), catDeck, basket.x, basket.z, { bowls: petBowls })
const catInteractable: Interactable = {
  object: cat.root,
  position: cat.root.position,
  label: tr(`Caresser ${cat.name}`, `Pet ${cat.name}`),
  onInteract: () => {
    player.interact()
    net.sendEmote('interact')
    cat.pet(player.position)
  },
}
catDeck.interactables.push(catInteractable)
/** Comète est-il à bord (son panier est-il dans les quartiers affichés) ? */
let cometeHere = true

const sound = new Sound()
scene.add(sound.rig)

/** Jukebox du pont principal (celui de la salle commune), de la cale (celui du bar) et des quartiers où l'on se trouve. */
const deckMusic = new JukeboxPlayer(sound, 0.4)
const holdMusic = new JukeboxPlayer(sound, 0.4)
const cabinMusic = new JukeboxPlayer(sound, 0.4)
const jukeboxes: Record<JukeboxWhere, JukeboxPlayer> = { deck: deckMusic, hold: holdMusic, cabin: cabinMusic }
/** Pont des jukebox communs (ceux des quartiers vont avec leur aménagement). */
const JUKEBOX_DECKS = { deck: 0, hold: -1 } as const
for (const [where, level] of Object.entries(JUKEBOX_DECKS) as ['deck' | 'hold', number][]) {
  for (const it of deckById(level).interactables) {
    if (it.furniture?.model === 'jukebox') it.onInteract = () => openJukebox(where, it.position)
  }
}

// Repère de la tuile survolée (carré) et de la destination (anneau).
const hover = new THREE.Mesh(
  new THREE.RingGeometry(0.6, 0.7, 4, 1, Math.PI / 4),
  new THREE.MeshBasicMaterial({ color: '#59d8ff', transparent: true, opacity: 0.5, depthWrite: false }),
)
hover.rotation.x = -Math.PI / 2
hover.visible = false
scene.add(hover)

const marker = new THREE.Mesh(
  new THREE.RingGeometry(0.18, 0.26, 32),
  new THREE.MeshBasicMaterial({ color: '#ffb03a', transparent: true, depthWrite: false }),
)
marker.rotation.x = -Math.PI / 2
marker.visible = false
scene.add(marker)

// ------------------------------------------------------------------ HUD

const bubbles = new Bubbles()
const chat = new Chat()
const dialog = new Dialog()
const lift = new LiftPanel()
const sitePanel = new SitePanel(wallet)
for (const it of decks[LEVELS.findIndex((l) => l.id === 0)].interactables) {
  if (it.furniture?.model === 'reward-counter') {
    const kind = it.furniture.label === 'weekly' ? 'weekly' : 'hunt'
    it.onInteract = () => { stopWork(); player.cancelPath(); keys.clear(); marker.visible = false; void sitePanel.counter(kind) }
  } else if (it.furniture?.model === 'employee-board') {
    it.onInteract = () => { stopWork(); player.cancelPath(); keys.clear(); marker.visible = false; void sitePanel.rankings() }
  }
}
const promptEl = $('prompt')
const promptLabel = $('prompt-label')

bubbles.attach('me', (out) => (player.root.visible ? player.avatar.head(out) : null))
bubbles.attach('gym', (out) => player.avatar.head(out).setY(out.y + 0.35))
bubbles.attach('cat', (out) => (catDeck.group.visible && cometeHere ? cat.root.getWorldPosition(out).setY(out.y + 0.55) : null))
const gym = new GymGame(bubbles, dialog, wallet, () => { if (seating.current) seating.stand() })
for (const d of decks) for (const it of d.interactables) {
  const model = it.furniture?.model
  if (d.def.id === -1 && model === 'bartender') {
    it.onInteract = () => { stopWork(); player.cancelPath(); keys.clear(); marker.visible = false; player.interact(); net.sendEmote('interact'); barPanel.open() }
  }
  const sport = ({ treadmill: 'gym-run', 'exercise-bike': 'gym-bike', 'punching-bag': 'gym-punch' } as Record<string, Sport>)[model ?? '']
  // seated() appelle cette action une fois le personnage installé sur l'appareil.
  if (sport) it.onInteract = () => { stopWork(); player.cancelPath(); keys.clear(); marker.visible = false; gym.start(sport) }
}

hydrateIcons()
localizeAttributes()
const creditsHud = new CreditsHud(wallet)
// Crédits gagnés : ils s'envolent du solde ; une tâche ou un record, aussi au-dessus de la tête.
wallet.onPassiveCap = () => {
  const hours = ECONOMY.passive.daily / 60
  chat.add('system', tr(`Revenu passif du jour versé (${hours} h de jeu payées). Les tâches, le mess, le hangar et la zone thargoïde paient toujours.`, `Today's passive income is paid (${hours} h of play). Chores, the mess, the hangar and the Thargoid zone still pay.`))
}
wallet.onGain = (amount, kind) => {
  creditsHud.gain(amount, kind === 'passive')
  if (kind === 'passive') return
  bubbles.gain('me', `+${formatCredits(amount)}`)
  sound.credits(amount >= 1000)
}
for (const [i, e] of EMOTES.entries()) {
  const b = document.createElement('button')
  b.title = `${e.label} (${i + 1})`
  b.setAttribute('aria-label', e.label)
  if (e.icon) b.append(icon(e.icon))
  const n = document.createElement('span')
  n.textContent = String(i + 1)
  b.appendChild(n)
  b.onclick = () => emote(e.id)
  $('emotes').appendChild(b)
}

/** Réactions (médaillons du site) : un bouton de la barre des emotes ouvre leur palette. */
const REACTION_KEY = EMOTES.length + 1
const reactionsButton = document.createElement('button')
reactionsButton.title = tr(`Réactions (${REACTION_KEY})`, `Reactions (${REACTION_KEY})`)
reactionsButton.setAttribute('aria-label', tr('Réactions', 'Reactions'))
reactionsButton.setAttribute('aria-expanded', 'false')
reactionsButton.append(icon('smiley-sticker'))
const reactionsKey = document.createElement('span')
reactionsKey.textContent = String(REACTION_KEY)
reactionsButton.appendChild(reactionsKey)
const reactionsPanel = document.createElement('div')
reactionsPanel.className = 'panel reactions'
reactionsPanel.hidden = true
reactionsPanel.setAttribute('role', 'menu')
for (const [i, r] of REACTIONS.entries()) {
  const b = document.createElement('button')
  b.setAttribute('role', 'menuitem')
  b.title = `${r.label} (${i + 1})`
  b.setAttribute('aria-label', r.label)
  const img = document.createElement('img')
  img.src = reactionImage(r.id)
  img.alt = ''
  img.draggable = false
  const n = document.createElement('span')
  n.textContent = String(i + 1)
  b.append(img, n)
  b.onclick = () => {
    react(r.id)
    toggleReactions(false)
  }
  reactionsPanel.appendChild(b)
}
function toggleReactions(open = reactionsPanel.hidden === true) {
  reactionsPanel.hidden = !open
  reactionsButton.setAttribute('aria-expanded', String(open))
  reactionsButton.classList.toggle('active', open)
}
reactionsButton.onclick = () => toggleReactions()
$('emotes').append(reactionsButton, reactionsPanel)
const mobileEmotesToggle = document.createElement('button')
mobileEmotesToggle.className = 'mobile-emotes-toggle'
mobileEmotesToggle.setAttribute('aria-label', tr('Afficher les emotes', 'Show emotes'))
mobileEmotesToggle.setAttribute('aria-expanded', 'false')
mobileEmotesToggle.append(icon('smiley-sticker'))
mobileEmotesToggle.onclick = () => {
  const open = $('emotes').classList.toggle('expanded')
  mobileEmotesToggle.setAttribute('aria-expanded', String(open))
  if (!open) toggleReactions(false)
}
$('emotes').prepend(mobileEmotesToggle)
addEventListener('pointerdown', (e) => {
  if (!reactionsPanel.hidden && !$('emotes').contains(e.target as Node)) toggleReactions(false)
})

/** Boucles sonores des machines (raffinerie…), une par meuble, coupées hors de leur pont. */
const hums: { deck: Deck; gain: GainNode; volume: number }[] = []

/** Vacillement d'une lumière : néon fatigué (brèves crises de grésillement) ou feu de cheminée. */
function flicker(kind: 'neon' | 'fire', t: number, seed: number): number {
  if (kind === 'fire') return 0.8 + 0.12 * Math.sin(t * 7.3 + seed) + 0.08 * Math.sin(t * 17.9 + seed * 2)
  const crisis = Math.sin(t * 0.9 + seed * 5) + Math.sin(t * 2.3 + seed) * 0.6
  return crisis > 1.3 && Math.sin(t * 90) > 0.2 ? 0.25 : 1
}

/** Lumière du pont confiée à chaque lumière de la réserve (cf. applyLights). */
const pooled: (Deck['lights'][number] | undefined)[] = []
/** Position (au sol) d'où la réserve a été répartie la dernière fois. */
const lightsFrom = new THREE.Vector3(Infinity, 0, 0)

/**
 * Lumières du pont affiché dans la réserve (celles de la cabine suivent ses meubles) : les plus
 * proches du joueur, un grand pont en ayant plus que la réserve.
 */
function applyLights() {
  const focus = salvage?.watchTarget ?? player.position
  lightsFrom.copy(focus)
  // Dans la baie infestée, les projecteurs des zones éclairées passent devant les lampes de
  // secours plus proches : une zone éclairée se voit de loin (cf. RULES.litVision).
  const weight = viewDeck.def.zone ? (d: Deck['lights'][number]) => d.position.distanceToSquared(focus) / d.intensity : (d: Deck['lights'][number]) => d.position.distanceToSquared(focus)
  const near = viewDeck.lights.length <= lightPool.length
    ? viewDeck.lights
    : [...viewDeck.lights].sort((a, b) => weight(a) - weight(b)).slice(0, lightPool.length)
  for (const [i, l] of lightPool.entries()) {
    const def = (pooled[i] = near[i])
    l.intensity = def ? def.intensity : 0
    l.distance = def?.distance ?? 7
    if (def) {
      l.position.copy(def.position)
      l.color.copy(def.color)
    }
  }
}
cabin.onLights = () => {
  if (viewDeck === cabinDeck) applyLights()
}
/** Phrase d'une interaction (une au hasard dans une liste). */
function showText(text: Interactable['text']) {
  const t = typeof text === 'function' ? text() : text
  if (Array.isArray(t)) dialog.show(t[Math.floor(Math.random() * t.length)])
  else if (t) dialog.show(t)
}
// Danser sur la piste : l'emote, et une phrase.
cabin.onEmote = (id, text) => {
  emote(id)
  showText(text)
}
// Jukebox : on choisit un morceau. Platines : quelques mesures, lancées sur un temps de la piste
// de danse, au tempo du morceau qui passe (la pose « mix » fait le geste).
cabin.onMusic = (position, text, model) => {
  if (model === 'jukebox') return openJukebox('cabin', position)
  const b = beatAt(holoTime.value)
  sound.groove(new THREE.Vector3(position.x, cabinDeck.y + 0.6, position.z), ((Math.ceil(b) - b) * 60) / tempo.bpm, tempo.bpm)
  showText(text)
}

/** Lumière d'ambiance du pont, baissée dans les pièces tamisées (cf. `dim` dans levels.ts). */
let dimming = 1
function applyAmbience() {
  const ambience = viewDeck.def.ambience ?? DEFAULT_AMBIENCE
  hemi.intensity = ambience.hemi * dimming
  sun.intensity = ambience.sunIntensity * dimming
}

function setDeck(next: Deck) {
  seating.leave()
  deck = next
  player.colliders = deck.colliders
  player.position.y = deck.y
  iso.snapTo(player.position)
  setView(deck)
  hover.position.y = deck.y + 0.01
  marker.position.y = deck.y + 0.02
  marker.visible = false
  $('deck').textContent = deck.def.name
  // Sur la base au sol, on n'est plus à bord du Fleet Carrier.
  $('ship-where').textContent = deck.def.ground ? tr('Au sol', 'Planetside') : 'Fleet Carrier'
}

/** Affiche un pont (celui du joueur, ou la baie suivie par les caméras) : ses murs, ses lumières, son ambiance. */
function setView(next: Deck) {
  viewDeck = next
  for (const d of decks) d.group.visible = d === viewDeck
  if (salvage?.deck) salvage.deck.group.visible = salvage.deck === viewDeck
  applyLights()
  const ambience = viewDeck.def.ambience ?? DEFAULT_AMBIENCE
  hemi.color.set(ambience.sky)
  hemi.groundColor.set(ambience.ground)
  sun.color.set(ambience.sun)
  applyAmbience()
  // Le soleil cadre ses ombres sur le vaisseau, ou sur le plateau de la base au sol.
  const center = viewDeck.def.ground?.center ?? SHIP_CENTER
  sun.position.set(center.x - 6, viewDeck.y + 14, center.z + 4)
  sun.target.position.set(center.x, viewDeck.y, center.z)
  // Les machines d'un pont ne s'entendent que sur ce pont.
  for (const h of hums) sound.fade(h.gain, h.deck === viewDeck ? h.volume : 0)
  // La baie infestée est hors du vaisseau : ni étoiles, ni système par les verrières. Sur la base
  // au sol, le ciel de la planète (un fond CSS, cf. body.planet).
  stars.group.visible = systemView.group.visible = !viewDeck.def.zone && !viewDeck.def.ground
  document.body.classList.toggle('planet', !!viewDeck.def.ground)
}
setDeck(deck)

// ------------------------------------------------------------------ son

for (const d of decks) {
  d.onDoor = (pos, open) => {
    if (d === deck) sound.play(open ? 'doorOpen' : 'doorClose', pos, { volume: 0.14, rate: 0.9 + Math.random() * 0.1 })
  }
}
/** Pas d'un personnage : feutrés sur les sols des quartiers, métalliques ailleurs. */
function footstep(level: number, position: THREE.Vector3, sprint: boolean, skin: string) {
  const soft = (level === ZONE_LEVEL ? salvage?.deck : deckById(level))?.def.footsteps === 'soft'
  sound.play(soft ? 'softStep' : 'step', position, { volume: (sprint ? 0.15 : 0.11) * (soft ? 1.5 : 1), rate: stepRate(skin) })
}
player.onStep = (sprint) => footstep(deck.def.id, player.position, sprint, profile.skin)
cat.onStep = () => {
  if (catDeck === deck) sound.play('catStep', cat.root.getWorldPosition(new THREE.Vector3()), { volume: 0.03, rate: 1.6 })
}
cat.onMeow = (purr) => {
  if (catDeck !== deck) return
  const p = cat.root.getWorldPosition(new THREE.Vector3()).setY(catDeck.y + 0.3)
  sound.meow(p)
  if (purr) sound.purr(p, 2.6)
  if (purr) bubbles.say('cat', tr('Mrrrou…', 'Purrr…'), 'heart')
  else bubbles.say('cat', tr('Miaou ?', 'Meow?'))
}

// Moustache, la chatte noire de James et Julia, vit dans le labo du L.J.P.C. et n'en sort pas.
const labDeck = deckById(0)
const MOUSTACHE: Species = { id: 'moustache', model: 'cat', label: tr('Chat', 'Cat'), name: 'Moustache', scale: 0.24, voice: 'meow', home: 'cushion', says: [] }
const moustache = new Cat(await petRig(MOUSTACHE, 'nuit'), labDeck, 24.6, 2.5, {
  name: 'Moustache',
  scale: MOUSTACHE.scale,
  area: { minX: 21, maxX: 25, minZ: 0, maxZ: 3 },
  confine: true,
  bowls: () => [{ x: 25.05, z: 2.3 }],
})
labDeck.interactables.push({
  object: moustache.root,
  position: moustache.root.position,
  label: tr('Caresser Moustache', 'Pet Moustache'),
  onInteract: () => {
    player.interact()
    net.sendEmote('interact')
    moustache.pet(player.position)
  },
})
bubbles.attach('moustache', (out) => (labDeck.group.visible ? moustache.root.getWorldPosition(out).setY(out.y + 0.5) : null))
moustache.onStep = () => {
  if (labDeck === deck) sound.play('catStep', moustache.root.getWorldPosition(new THREE.Vector3()), { volume: 0.03, rate: 1.7 })
}
moustache.onMeow = (purr) => {
  if (labDeck !== deck) return
  const p = moustache.root.getWorldPosition(new THREE.Vector3()).setY(labDeck.y + 0.3)
  sound.meow(p)
  if (purr) sound.purr(p, 2.6)
  bubbles.say('moustache', purr ? tr('Mrrrou…', 'Purrr…') : tr('Mrrraou !', 'Mrrrow!'), purr ? 'heart' : undefined)
}

// Le sergent Rourke, de la sécurité, fait sa ronde sur le pont principal (cf. patrol.ts).
const patrolDeck = deckById(0)
const sergeant = new Patroller(await soldierRig(), patrolDeck)
/** Ce que le sergent sait du bord : le système, et les tâches en attente sur les ponts. */
function shipReport(): ShipReport {
  const tasks = [...board.live.values()]
  const quarters = cabinDeck.def.cabin?.room
  return {
    system: SYSTEMS[systemView.id].name,
    room: patrolDeck.roomName(sergeant.position.x, sergeant.position.z),
    deck: tasks.filter((t) => t.deck === patrolDeck).map((t) => ({ kind: t.spot.task, room: patrolDeck.roomName(t.item.position.x, t.item.position.z) })),
    quarters: tasks.filter((t) => t.deck === cabinDeck && cabinDeck.map.room(Math.round(t.item.position.x), Math.round(t.item.position.z)) === quarters).map((t) => t.spot.task),
    hold: tasks.filter((t) => t.deck.def.id === -1).length,
  }
}
patrolDeck.interactables.push({
  object: sergeant.root,
  position: sergeant.position,
  label: tr('Parler au sergent Rourke', 'Talk to Sergeant Rourke'),
  onInteract: () => {
    player.interact()
    net.sendEmote('interact')
    const line = sergeant.talk(player.position, shipReport())
    net.sendPatrolTalk()
    dialog.show(tr(`${SERGEANT} : « ${line} »`, `${SERGEANT}: “${line}”`))
  },
})
bubbles.attach('sergeant', (out) => (patrolDeck.group.visible ? sergeant.avatar.head(out) : null))
sergeant.onBark = (text) => {
  if (patrolDeck === deck) bubbles.say('sergeant', text)
}
sergeant.onStep = () => {
  if (patrolDeck === deck) sound.play('step', sergeant.root.getWorldPosition(new THREE.Vector3()), { volume: 0.08, rate: 0.8 })
}

// Marcel, le chef, fait la tournée de sa cuisine au mess (cf. chef.ts), et cuisine avec qui prend
// une commande au rail de la passe ; le self sert des plateaux (cf. kitchen.ts).
const chef = new Chef(await chefRig(), patrolDeck)
/** Ce que le chef sait quand on lui parle : le système, le menu, nos plats. */
function chefReport(): ChefReport {
  return { system: SYSTEMS[systemView.id].name, menu: menuOf(), served: kitchen.served }
}
const kitchen = new Kitchen({
  deck: patrolDeck,
  chef,
  player,
  here: () => deck,
  seat: () => seating.current,
  show: (text) => dialog.show(text),
  chefSays: (text) => {
    if (patrolDeck === deck) bubbles.say('chef', text)
  },
  cook: (on) => {
    chef.cook(player.position, on)
    net.sendChefCook(on)
  },
  reward: `+${formatCredits(ECONOMY.kitchen.reward)}`,
  ordered: () => wallet.startJob('kitchen'),
  sent: () => void payJob('kitchen'),
  work: (job) => startWork({ ...job, deck: patrolDeck }),
})
patrolDeck.interactables.push({
  object: chef.root,
  position: chef.position,
  label: tr('Parler au chef Marcel', 'Talk to Chef Marcel'),
  onInteract: () => {
    player.interact()
    net.sendEmote('interact')
    // Pendant une commande, il rappelle l'étape ; sinon il bavarde.
    const line = kitchen.reminder() ?? chef.talk(player.position, chefReport())
    if (!kitchen.cooking) net.sendChefTalk()
    dialog.show(tr(`${CHEF} : « ${line} »`, `${CHEF}: “${line}”`))
  },
})
bubbles.attach('chef', (out) => (patrolDeck.group.visible ? chef.avatar.head(out) : null))
chef.onBark = (text) => {
  if (patrolDeck === deck) bubbles.say('chef', text)
}
chef.onStep = () => {
  if (patrolDeck === deck) sound.play('step', chef.root.getWorldPosition(new THREE.Vector3()), { volume: 0.06, rate: 1.05 })
}
chef.onWork = (work) => {
  if (patrolDeck !== deck) return
  const at = chef.root.getWorldPosition(new THREE.Vector3()).setY(patrolDeck.y + 0.45)
  if (work === 'chop') sound.work('chop', at)
  else if (work === 'stir') sound.work('sizzle', at)
  else if (work === 'wash') sound.work('water', at)
  else if (work === 'fetch') sound.work('wrench', at)
}

// Betty, l'infirmière, fait la tournée de l'infirmerie (cf. nurse.ts) ; allongé sur un lit, on
// l'appelle en consultation, et on repart avec un pansement (cf. infirmary.ts).
const nurse = new Nurse(await nurseRig(), patrolDeck)
const infirmary = new Infirmary({
  deck: patrolDeck,
  nurse,
  player,
  here: () => deck,
  seat: () => seating.current,
  self: () => net.id,
  show: (text) => dialog.show(text),
  nurseSays: (text) => {
    if (patrolDeck === deck) bubbles.say('nurse', text)
  },
  feel: (icon) => bubbles.emote('me', icon),
  care: (bed, healed) => {
    nurse.care(bed, net.id)
    net.sendNurseCare(bed >= 0, healed)
  },
})
const plasters = new Plasters()
/** Ce que l'infirmière sait quand on lui parle : le système, nos consultations, notre pansement. */
function nurseReport(): NurseReport {
  return { system: SYSTEMS[systemView.id].name, visits: infirmary.visits, patched: infirmary.patched(net.id) }
}
patrolDeck.interactables.push({
  object: nurse.root,
  position: nurse.position,
  label: tr(`Parler à ${NURSE}`, `Talk to ${NURSE}`),
  onInteract: () => {
    player.interact()
    net.sendEmote('interact')
    // Pendant la consultation, elle ausculte ; sinon elle bavarde.
    const line = infirmary.reminder() ?? nurse.talk(player.position, nurseReport())
    if (!infirmary.busy) net.sendNurseTalk()
    dialog.show(tr(`${NURSE} : « ${line} »`, `${NURSE}: “${line}”`))
  },
})
bubbles.attach('nurse', (out) => (patrolDeck.group.visible ? nurse.avatar.head(out) : null))
nurse.onBark = (text) => {
  if (patrolDeck === deck) bubbles.say('nurse', text)
}
nurse.onStep = () => {
  if (patrolDeck === deck) sound.play('softStep', nurse.root.getWorldPosition(new THREE.Vector3()), { volume: 0.07, rate: 1.2 })
}
/**
 * Ses bruits de travail ne se chevauchent pas : l'ordinateur du poste de soins (un bruit de 5 s, au
 * volume des consoles du bord) et le bip d'un moniteur, une fois par poste et non à chaque geste.
 */
const nurseQuiet = { type: 0, check: 0 }
nurse.onWork = (work) => {
  if (patrolDeck !== deck) return
  const at = nurse.root.getWorldPosition(new THREE.Vector3()).setY(patrolDeck.y + 0.45)
  const now = performance.now()
  if (work === 'type') {
    if (now < nurseQuiet.type) return
    nurseQuiet.type = now + 12000
    sound.play('computer', at, { volume: 0.05, ref: 1.2, rolloff: 1.6 })
  } else if (work === 'check') {
    if (now < nurseQuiet.check) return
    nurseQuiet.check = now + 5000
    sound.beep(at)
  } else if (work === 'wash') sound.work('water', at)
}

// Nico, le mécano, fait le tour du Krait dans le hangar de la cale (cf. mechanic.ts), Boulon, son
// drone, sur les talons ; au pupitre du hangar, on fait une révision avec lui (cf. hangar.ts).
const holdDeck = deckById(-1)
/** Le grondement des réacteurs du Krait, tant qu'ils tournent (et qu'on est dans la cale). */
let kraitRoar: { stop: () => void } | undefined
const mechanic = new Mechanic(await mechanicRig(), holdDeck)
const hangar = new Hangar({
  deck: holdDeck,
  mechanic,
  player,
  here: () => deck,
  // Installé seulement : pendant la montée des marches, on n'est pas encore aux commandes.
  seat: () => (seating.pose ? seating.current : null),
  // Les autres joueurs assis aux commandes du Krait (la place de l'escabeau).
  pilots: () => {
    const cockpit = holdDeck.interactables.find((it) => it.furniture?.model === 'krait-ladder')?.seats?.(player.position)[0]
    if (!cockpit) return 0
    let n = 0
    for (const r of remotes.values()) if (r.level === holdDeck.def.id && r.pose === 'pilot' && Math.hypot(r.target.x - cockpit.x, r.target.z - cockpit.z) < 0.3) n++
    return n
  },
  show: (text) => dialog.show(text),
  help: (on) => {
    mechanic.help(player.position, on)
    net.sendMechHelp(on)
  },
  reward: `+${formatCredits(ECONOMY.hangar.reward)}`,
  requested: () => wallet.startJob('hangar'),
  finished: () => void payJob('hangar'),
  work: (job) => startWork({ ...job, deck: holdDeck }),
  engines: (on) => {
    mechanic.panic(on)
    net.sendKraitEngines(on)
  },
})
/** Ce que le mécano sait quand on lui parle : le système, nos révisions, si l'on est dans le cockpit. */
function mechanicReport(): MechanicReport {
  return { system: SYSTEMS[systemView.id].name, done: hangar.done, aboard: hangar.aboardKrait }
}
holdDeck.interactables.push({
  object: mechanic.root,
  position: mechanic.position,
  label: tr(`Parler à ${MECHANIC}`, `Talk to ${MECHANIC}`),
  onInteract: () => {
    player.interact()
    net.sendEmote('interact')
    // Pendant une révision, il rappelle l'étape ; sinon il bavarde.
    const line = hangar.reminder() ?? mechanic.talk(player.position, mechanicReport())
    if (!hangar.busy) net.sendMechTalk()
    dialog.show(tr(`${MECHANIC} : « ${line} »`, `${MECHANIC}: “${line}”`))
  },
})
bubbles.attach('mechanic', (out) => (holdDeck.group.visible ? mechanic.avatar.head(out) : null))

// La base au sol : on y descend en Krait depuis le hangar de la cale (cf. base/client.ts). Elle
// n'est construite qu'au premier voyage ; d'ici là, l'état d'Ada venu du relais attend.
let chiefPending: { state: ChiefState; id: number } | null = null
/** Le grondement des réacteurs du Krait de la base, tant qu'ils tournent (et qu'on y est). */
let baseRoar: { stop: () => void } | undefined
const groundBase = new GroundBase({
  player,
  here: () => deck,
  hold: holdDeck,
  seat: () => (seating.pose ? seating.current : null),
  built: (baseDeck, chief) => {
    decks.push(baseDeck)
    scene.add(baseDeck.group)
    baseDeck.group.visible = false
    actors.set(baseDeck, [])
    baseDeck.interactables.push({
      object: chief.root,
      position: chief.position,
      label: tr(`Parler à ${CHIEF}`, `Talk to ${CHIEF}`),
      onInteract: () => {
        player.interact()
        net.sendEmote('interact')
        net.sendChiefTalk()
        const visitors = [...remotes.values()].filter((r) => r.level === BASE_LEVEL).length
        const line = groundBase.talk({ system: SYSTEMS[systemView.id].name, visitors })
        if (line) dialog.show(line)
      },
    })
    bubbles.attach('chief', (out) => (baseDeck.group.visible ? chief.avatar.head(out) : null))
    chief.onBark = (text) => {
      if (baseDeck === deck) bubbles.say('chief', text)
    }
    chief.onStep = () => {
      if (baseDeck === deck) sound.play('softStep', chief.root.getWorldPosition(new THREE.Vector3()), { volume: 0.07, rate: 1.1 })
    }
    if (chiefPending) groundBase.sync(chiefPending.state, chiefPending.id, net.id)
    chiefPending = null
  },
  arrive: (next, at) => {
    setDeck(next)
    player.cancelPath()
    player.position.set(at.x, next.y, at.z)
    player.setHeading(at.yaw)
    player.root.rotation.y = at.yaw
    iso.snapTo(player.position)
    sendState(true)
  },
  engines: (on) => net.sendBaseEngines(on),
  show: (text) => dialog.show(text),
  system: () => SYSTEMS[systemView.id].name,
  roar: () => sound.thrusters(iso.target.clone()) ?? undefined,
  touchdown: () => sound.thud(iso.target.clone()),
})
mechanic.onBark = (text) => {
  if (holdDeck === deck) bubbles.say('mechanic', text)
}
mechanic.onBeep = (text) => {
  // Dans la bulle de Nico, en dessous : Boulon tourne autour de sa tête, deux bulles s'y recouvriraient.
  if (holdDeck === deck) bubbles.aside('mechanic', `${DROID} : ${text}`, 'say-droid')
}
mechanic.onStep = () => {
  if (holdDeck === deck) sound.play('step', mechanic.root.getWorldPosition(new THREE.Vector3()), { volume: 0.07, rate: 1.15 })
}
mechanic.onWork = (work) => {
  if (holdDeck !== deck) return
  const at = mechanic.root.getWorldPosition(new THREE.Vector3()).setY(holdDeck.y + 0.45)
  if (work === 'weld') sound.sparks(at)
  else if (work === 'refuel') sound.work('hiss', at)
  else if (work === 'type' || work === 'scan') sound.work('scrub', at)
  else sound.work('wrench', at)
}

// ------------------------------------------------------------------ compagnons

/**
 * Compagnons adoptés (cf. pets.ts) : un par panier des quartiers affichés (les siens, ou ceux de
 * l'hôte en visite). Chacun vit près de son panier et peut explorer le pont comme Comète.
 * Clé : modèle, robe et rang parmi les paniers identiques ; déplacer un panier ne le recrée pas.
 */
interface Companion {
  species: Species
  pet: Cat
  interactable: Interactable
}
const companions = new Map<string, Companion>()
const companionsLoading = new Set<string>()
let companionItems: CabinItem[] | null = null

/** Paniers habités : deux animaux au plus, Comète compris (les règles de pose l'imposent aussi). */
function wantedCompanions(): Map<string, CabinItem> {
  const wanted = new Map<string, CabinItem>()
  const seen = new Map<string, number>()
  let room = MAX_PETS - (cabin.items.some((i) => i.m === 'cat-bed') ? 1 : 0)
  for (const item of cabin.items) {
    if (!speciesOfItem(item.m) || room <= 0) continue
    room--
    const base = `${item.m}|${item.v ?? ''}`
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    wanted.set(`${base}|${n}`, item)
  }
  return wanted
}

/** Fait correspondre les animaux aux paniers, à chaque nouvel aménagement affiché. */
function syncCompanions() {
  if (cabin.items === companionItems) return
  companionItems = cabin.items
  // Comète arrive avec son panier, et repart avec.
  const basket = cabin.items.find((i) => i.m === 'cat-bed')
  if (!!basket !== cometeHere) {
    cometeHere = !!basket
    const i = catDeck.interactables.indexOf(catInteractable)
    if (basket) {
      cat.root.position.set(basket.x, 0, basket.z)
      catDeck.group.add(cat.root)
      unstick(cat.root.position, 0.12)
      if (i < 0) catDeck.interactables.push(catInteractable)
    } else {
      cat.root.removeFromParent()
      if (i >= 0) catDeck.interactables.splice(i, 1)
    }
  }
  const wanted = wantedCompanions()
  for (const key of [...companions.keys()]) if (!wanted.has(key)) removeCompanion(key)
  for (const [key, item] of wanted) if (!companions.has(key) && !companionsLoading.has(key)) void addCompanion(key, item)
}

async function addCompanion(key: string, item: CabinItem) {
  const species = speciesOfItem(item.m)!
  companionsLoading.add(key)
  const r = await petRig(species, item.v).catch(() => null)
  companionsLoading.delete(key)
  // Le panier a pu disparaître pendant le chargement.
  if (!r || companions.has(key) || !wantedCompanions().has(key)) return
  // Perchoir et ruche ont un mât au milieu : l'animal apparaît au pied.
  const aside = species.home === 'perch' || species.home === 'hive' ? 0.3 : 0
  const pet = new Cat(r, cabinDeck, item.x, item.z + aside, { name: species.name, scale: species.scale, bowls: petBowls })
  unstick(pet.root.position, 0.12)
  const bubble = `pet:${key}`
  const say = (happy: boolean) => {
    if (cabinDeck !== deck) return
    sound.critter(species.voice, pet.root.getWorldPosition(new THREE.Vector3()).setY(cabinDeck.y + 0.3))
    bubbles.say(bubble, species.says[happy ? species.says.length - 1 : 0], happy ? 'heart' : undefined)
  }
  pet.onMeow = say
  pet.onStep = () => {
    if (cabinDeck === deck) sound.play('catStep', pet.root.getWorldPosition(new THREE.Vector3()), { volume: 0.03, rate: 1.6 * (0.26 / species.scale) })
  }
  const interactable: Interactable = {
    object: pet.root,
    position: pet.root.position,
    label: tr(`Caresser ${species.name}`, `Pet ${species.name}`),
    onInteract: () => {
      player.interact()
      net.sendEmote('interact')
      pet.pet(player.position)
    },
  }
  cabinDeck.interactables.push(interactable)
  bubbles.attach(bubble, (out) => (cabinDeck.group.visible ? pet.root.getWorldPosition(out).setY(out.y + 0.5) : null))
  companions.set(key, { species, pet, interactable })
}

function removeCompanion(key: string) {
  const c = companions.get(key)
  if (!c) return
  c.pet.root.removeFromParent()
  const i = cabinDeck.interactables.indexOf(c.interactable)
  if (i >= 0) cabinDeck.interactables.splice(i, 1)
  bubbles.detach(`pet:${key}`)
  companions.delete(key)
}

function startSound() {
  void sound.start(() => {
    // Tuyères à la poupe et bourdonnement du réacteur (salle des machines, dans la cale).
    for (const [i, p] of (decks.find((d) => d.def.engine) ?? deck).engineEmitters.entries()) {
      if (i === 0) sound.loop('engine', p, { volume: 0.2, rate: 0.5, ref: 1.5, rolloff: 1.2 })
      else sound.loop('engine', p, { volume: 0.32, rate: 0.8, ref: 2.5, rolloff: 1 })
    }
    // Grondement des machines de la cale (raffinerie).
    for (const d of decks) {
      for (const p of d.emitters.get('hum') ?? []) {
        const gain = sound.loop('engine', p, { volume: 0.16, rate: 0.32, ref: 1.2, rolloff: 1.4 })
        if (!gain) continue
        hums.push({ deck: d, gain, volume: 0.16 })
        if (d !== deck) sound.fade(gain, 0, 0.01)
      }
    }
  })
  $('sound-hint').classList.add('gone')
}
addEventListener('pointerdown', startSound, { once: true })
addEventListener('keydown', startSound, { once: true })

const volumeInput = $<HTMLInputElement>('volume')
function updateMuteIcon() {
  $('mute').replaceChildren(icon(sound.isMuted ? 'speaker-slash' : 'speaker-high'))
}
function updateMuteButton() {
  updateMuteIcon()
  volumeInput.value = String(Math.round((sound.isMuted ? 0 : sound.level) * 100))
}
updateMuteButton()
volumeInput.addEventListener('input', () => {
  sound.setLevel(Number(volumeInput.value) / 100)
  updateMuteIcon()
})
volumeInput.addEventListener('keydown', (e) => e.stopPropagation())

/** Cadence des pas selon l'espèce : les robots sont plus lourds. */
function stepRate(skin: string): number {
  const race = parseLook(skin).race
  const base = race === 'robot' ? 0.72 : race === 'creature' ? 0.85 : 1
  return base * (0.92 + Math.random() * 0.16)
}

/** Sons d'ambiance du pont affiché : bips des consoles, bornes d'arcade, crépitements de soudure. */
const AMBIENT = {
  beep: { gap: [1.2, 4.2], play: (p: THREE.Vector3) => sound.beep(p) },
  computer: { gap: [8, 16], play: (p: THREE.Vector3) => sound.play('computer', p, { volume: 0.05, ref: 1.2, rolloff: 1.6 }) },
  arcade: { gap: [0.7, 2.2], play: (p: THREE.Vector3) => sound.chiptune(p) },
  sparks: { gap: [1.2, 3.5], play: (p: THREE.Vector3) => sound.sparks(p) },
} as const
const ambientIn: Record<keyof typeof AMBIENT, number> = { beep: 2, computer: 6, arcade: 1, sparks: 1.5 }

function ambience(dt: number) {
  for (const kind of Object.keys(AMBIENT) as (keyof typeof AMBIENT)[]) {
    // Les bruits d'ordinateur viennent des mêmes consoles que les bips.
    const sources = deck.emitters.get(kind === 'computer' ? 'beep' : kind)
    if (!sources?.length) continue
    ambientIn[kind] -= dt
    if (ambientIn[kind] > 0) continue
    const [min, max] = AMBIENT[kind].gap
    ambientIn[kind] = min + Math.random() * (max - min)
    AMBIENT[kind].play(sources[Math.floor(Math.random() * sources.length)])
  }
}

// ------------------------------------------------------------------ réseau

const remotes = new Map<number, RemotePlayer>()
const net = new Net(profile, devCmdr(), devLjpc(), devVoie())
salvage = new SalvageClient({
  scene, renderer, iso, player, sound, net, dialog, wallet, remotes,
  deck: () => deck,
  hold: deckById(-1),
  moveTo: async (next, at) => {
    await fadeScreen(true)
    stopWork()
    player.cancelPath()
    player.stopGlide()
    marker.visible = false
    setDeck(next)
    player.position.set(at.x, next.y, at.z)
    iso.snapTo(player.position)
    sendState(true)
    await fadeScreen(false)
  },
  showView: (zone) => setView(zone ?? deck),
  verified: () => verified,
  pointed: () => (hover.visible ? { x: hover.position.x, z: hover.position.z } : null),
  // Vue subjective : la caméra est du côté (sin yaw, cos yaw) du personnage, et regarde à l'opposé.
  aim: () => (fpsShown ? { x: -Math.sin(fps.yaw), z: -Math.cos(fps.yaw) } : null),
  project: (p) => {
    screenPos.copy(p).project(activeCamera())
    return { x: ((screenPos.x + 1) / 2) * innerWidth, y: ((1 - screenPos.y) / 2) * innerHeight }
  },
  bark: (text) => {
    if (deck === deckById(-1)) bubbles.say('controller', text)
  },
})
const zone = salvage
// Odile, au poste de sécurité du lobby (cf. salvage/controller.ts) : sa bulle suit sa tête.
bubbles.attach('controller', (out) => (deckById(-1).group.visible ? zone.controller?.avatar.head(out) ?? null : null))
// Le lobby de la zone thargoïde : terminal de mission, caméras de surveillance, classement.
for (const it of deckById(-1).interactables) {
  const model = it.furniture?.model
  if (model === 'salvage-terminal') it.onInteract = () => { player.interact(); zone.openTerminal() }
  else if (model === 'salvage-board') it.onInteract = () => { player.interact(); zone.openLeaderboard() }
  else if (model === 'surveillance-wall') it.onInteract = () => {
    player.interact()
    if (!zone.openCameras()) showText(it.text)
  }
}
const boardGames = new BoardGames({
  playerId: () => net.id,
  sendJoin: (game, table) => net.sendBoardJoin(game, table),
  sendMove: (game, table, move) => net.sendBoardMove(game, table, move),
  sendLeave: () => net.sendBoardLeave(),
})
boardGames.onClose = () => {
  if (seating.current?.spot.pose === 'sit') seating.stand()
}

let lastAnnouncedName = ''

/** Arrivée sur le relais : qui d'autre est à bord. */
function welcomeOnline(others: number): string {
  if (!others) return tr('Connecté. Personne d\'autre à bord pour l\'instant.', 'Connected. Nobody else aboard for now.')
  if (EN) return others === 1 ? 'Connected. One other crew member aboard.' : `Connected. ${others} other crew members aboard.`
  return `Connecté. ${others} autre(s) membre(s) d'équipage à bord.`
}

const renamed = (name: string) => tr(`Vous vous appelez désormais ${name}.`, `You are now called ${name}.`)
const BACK_HOME = tr('Retour dans vos quartiers.', 'Back to your quarters.')

function updateIdentity() {
  const el = $('identity')
  el.replaceChildren()
  const name = document.createElement('span')
  name.className = verified ? 'id-name verified' : 'id-name'
  name.append(nameTag(profile.name, verified))
  el.appendChild(name)
  if (!linked) {
    // Même domaine que le site : sa page de connexion, avec la page de retour, comme ailleurs sur le site.
    const a = document.createElement('a')
    a.href = `/auth-redirect.php?redirect=${encodeURIComponent(location.pathname + location.search)}`
    a.textContent = tr('Invité · se connecter au site', 'Guest · log in to the site')
    el.appendChild(a)
  } else if (net.online && !verified) {
    const w = document.createElement('span')
    w.className = 'id-warn'
    w.textContent = tr('compte non vérifié par le serveur', 'account not verified by the server')
    el.appendChild(w)
  }
}
/** Sol du pont `level` en (x, z) : dans la baie infestée, la passerelle et ses escaliers montent. */
const levelY = (level: number, x: number, z: number) => level * LEVEL_HEIGHT + (level === ZONE_LEVEL ? zone.groundHeight(x, z) : 0)

function updateNetStatus() {
  const el = $('net')
  el.classList.toggle('online', net.online)
  el.replaceChildren(icon(net.online ? 'users-three' : 'user-solo'), net.online ? tr(`En ligne · ${remotes.size + 1} à bord`, `Online · ${remotes.size + 1} aboard`) : 'Solo')
}

function addRemote(s: PlayerState) {
  if (remotes.has(s.id)) return
  const r = new RemotePlayer(s.id, s, levelY)
  remotes.set(s.id, r)
  scene.add(r.group)
  bubbles.attach(`p${s.id}`, (out) => (r.group.visible && r.avatar ? r.avatar.head(out) : null), r.name, s.verified)
  r.onStep = (pos, sprint) => {
    if (r.group.visible) footstep(r.level, pos, sprint, r.skin)
  }
}

function removeRemote(id: number) {
  const r = remotes.get(id)
  if (!r) return
  scene.remove(r.group)
  bubbles.detach(`p${id}`)
  remotes.delete(id)
}

net.onStatus = (online) => {
  if (!online) {
    zone.disconnected()
    cinemaRoom.close()
    boardGames.close(false)
    arcade?.disconnected()
    for (const id of [...remotes.keys()]) removeRemote(id)
    inviteToasts.clear()
    inviteMenu.close()
    leaveVisit(tr('Liaison perdue avec le relais : retour dans vos quartiers.', 'Lost contact with the relay: back to your quarters.'), true)
  }
  updateNetStatus()
  updateIdentity()
}
net.onMessage = (m) => {
  zone.onMessage(m)
  switch (m.t) {
    case 'welcome':
      // Le relais fait autorité sur le nom (CMDR vérifié, ou invité homonyme d'un CMDR présent).
      profile.name = m.you.name
      verified = m.you.verified
      ljpcMember = m.you.ljpc
      voieAdept = m.you.voie
      deckById(0).setLjpcAccess(ljpcMember)
      deckById(-1).setVoieAccess(voieAdept)
      // Reconnu par le site via le relais : le compte est lié, même si la demande faite au
      // chargement n'avait pas abouti.
      if (verified) {
        linked = true
        adoptAccount()
        // Ses quartiers, pour ceux qu'il invitera (le relais oublie tout à chaque connexion).
        net.sendCabin(serializeLayout(ownLayout))
      }
      updateIdentity()
      for (const p of m.players) addRemote(p)
      chat.add('system', welcomeOnline(m.players.length))
      // Les jukebox du pont principal et de la cale, tels que le relais les connaît (après une reconnexion aussi).
      if (m.music) applyMusic(m.music)
      if (m.hold) applyMusic(m.hold)
      // Le système où se trouve le vaisseau, le même pour tout le bord.
      if (m.system && !jumping) systemView.set(m.system)
      // Le sergent en est au même point de sa ronde pour tout le bord.
      if (m.patrol) sergeant.sync(m.patrol)
      // Le chef aussi, dans sa tournée (ou à la passe, si quelqu'un cuisine avec lui).
      if (m.chef) chef.sync(m.chef)
      // Et Betty, dans sa tournée (ou au chevet d'un patient), avec les pansements du bord.
      if (m.nurse) nurse.sync(m.nurse)
      // Et le mécano du hangar (ou devant le nez du Krait, si quelqu'un fait une révision avec lui).
      if (m.mechanic) mechanic.sync(m.mechanic)
      // Et Ada, sur la base au sol (construite ou pas encore).
      if (m.chief) {
        if (groundBase.chief) groundBase.sync(m.chief, 0, net.id)
        else chiefPending = { state: m.chief, id: 0 }
      }
      // Le relais oublie tout à chaque connexion : la musique de nos quartiers, on la lui rend.
      const own = cabinMusic.playing
      if (own) net.sendMusic('cabin', own.track.id, own.x, own.z, own.position, own)
      break
    case 'join':
      addRemote(m.player)
      chat.add('system', [nameTag(m.player.name, m.player.verified), tr(' a embarqué.', ' came aboard.')])
      break
    case 'leave': {
      const r = remotes.get(m.id)
      if (r) chat.add('system', tr(`${r.name} a débarqué.`, `${r.name} disembarked.`))
      if (visiting?.host === m.id || entering === m.id) {
        const host = r?.name ?? tr('Votre hôte', 'Your host')
        leaveVisit(tr(`${host} a quitté le vaisseau : retour dans vos quartiers.`, `${host} left the ship: back to your quarters.`), true)
      }
      removeRemote(m.id)
      hostLayouts.delete(m.id)
      invitedAt.delete(m.id)
      inviteToasts.remove(m.id)
      refreshInviteMenu()
      break
    }
    case 'state':
      remotes.get(m.id)?.apply(m)
      break
    case 'chat': {
      const r = remotes.get(m.id)
      chat.add('other', m.text, nameTag(m.name, m.verified))
      if (r && r.level === deck.def.id) bubbles.say(`p${m.id}`, m.text)
      sound.play('chat', null, { volume: 0.12 })
      break
    }
    case 'emote': {
      const r = remotes.get(m.id)
      if (!r) break
      const reaction = findReaction(m.emote)
      if (reaction) {
        if (r.level === deck.def.id) bubbles.reaction(`p${m.id}`, reactionImage(reaction.id))
        break
      }
      r.emote(m.emote)
      // Un salut à côté du sergent : il le rend (chacun le voit, le calcul est le même partout).
      if (m.emote === 'o7' && r.level === patrolDeck.def.id) {
        sergeant.greet(r.group.position, false)
        chef.greet(r.group.position, false)
        nurse.greet(r.group.position, false)
      }
      if (m.emote === 'o7' && r.level === holdDeck.def.id) mechanic.greet(r.group.position, false)
      const def = EMOTES.find((e) => e.id === m.emote)
      if (def && r.level === deck.def.id) bubbles.emote(`p${m.id}`, def.icon)
      break
    }
    case 'profile': {
      if (m.id === net.id) {
        // Nom accepté par le relais (éventuellement suffixé « (invité) »).
        if (!verified && m.name !== lastAnnouncedName) chat.add('system', renamed(m.name))
        lastAnnouncedName = m.name
        profile.name = m.name
        updateIdentity()
        break
      }
      const r = remotes.get(m.id)
      if (!r) break
      if (r.name !== m.name) chat.add('system', tr(`${r.name} s'appelle désormais ${m.name}.`, `${r.name} is now called ${m.name}.`))
      r.name = m.name
      r.verified = !!m.verified
      bubbles.rename(`p${m.id}`, m.name, m.verified)
      if (r.skin !== m.skin) {
        r.skin = m.skin
        void r.load()
      }
      break
    }
    case 'patrol':
      // Quelqu'un parle au sergent (nous aussi : le relais recale l'arrêt) ; les autres le voient répondre.
      sergeant.sync(m)
      if (m.id !== net.id && patrolDeck === deck) bubbles.say('sergeant', '…')
      break
    case 'chef':
      // Quelqu'un parle au chef ou cuisine avec lui (nous aussi : le relais recale sa tournée).
      chef.sync(m)
      if (m.id !== net.id && patrolDeck === deck && m.hold > 0 && m.cook === 0) bubbles.say('chef', '…')
      break
    case 'nurse':
      // Quelqu'un parle à Betty, l'appelle à son lit ou en repart (nous aussi : le relais recale sa tournée).
      nurse.sync(m)
      if (m.id !== net.id && patrolDeck === deck && m.hold > 0 && m.care === 0 && m.face) bubbles.say('nurse', '…')
      break
    case 'mechanic': {
      // Quelqu'un parle au mécano, l'aide, ou met les réacteurs du Krait en route (nous aussi : le
      // relais recale sa tournée) ; un autre qui les lance, on l'apprend dans le chat.
      const burning = mechanic.panicking
      mechanic.sync(m)
      if (!burning && m.panic > 0 && m.pilot !== undefined && m.pilot !== net.id) {
        const pilot = remotes.get(m.pilot)?.name ?? tr('Quelqu\'un', 'Someone')
        chat.add('system', tr(`${pilot} a mis en route les réacteurs du Krait. Nico panique.`, `${pilot} started the Krait's thrusters. Nico is panicking.`))
      }
      if (m.id !== net.id && holdDeck === deck && m.hold > 0 && m.help === 0 && m.panic === 0) bubbles.say('mechanic', '…')
      break
    }
    case 'chief':
      // Quelqu'un parle à Ada, ou met les gaz sur l'aire de la base (nous aussi : le relais recale sa ronde).
      if (groundBase.chief) groundBase.sync(m, m.id, net.id)
      else chiefPending = { state: m, id: m.id }
      break
    case 'jump':
      // Un pilote lance le saut FSD (nous, ou un autre) : tout le bord part. Dans la baie infestée,
      // on ne le vit pas ; on retrouvera le vaisseau dans son nouveau système.
      if (deck.def.zone || viewDeck.def.zone || deck.def.ground) systemView.set(m.system)
      else void playJump(m.system, m.id === net.id ? null : m.name)
      break
    case 'music': {
      // Un morceau au jukebox (du pont principal, de la cale, ou des quartiers où l'on est), ou le silence.
      const track = applyMusic(m)
      if (m.busy) dialog.show(tr('Doucement avec le jukebox : un morceau à la fois.', 'Easy on the jukebox: one track at a time.'))
      if (m.far) dialog.show(tr('Approchez-vous du jukebox pour choisir un morceau.', 'Move closer to the jukebox to pick a song.'))
      const r = remotes.get(m.id)
      if (track && r) chat.add('system', tr(`${r.name} a mis « ${track.title} » au jukebox.`, `${r.name} put “${track.title}” on the jukebox.`))
      break
    }
    case 'cinema:state':
      cinemaRoom.receive(m)
      break
    case 'cinema:error':
      cinemaRoom.error(m.reason)
      break
    case 'fight:state':
    case 'fight:error':
      arcade?.receiveFight(m)
      break
    case 'board:state':
    case 'board:error':
      boardGames.receive(m)
      break
    case 'cabin':
      // Aménagement d'un hôte : à l'entrée dans ses quartiers, puis à chacun de ses changements.
      hostLayouts.set(m.id, m.layout)
      if (visiting?.host === m.id) showCabin()
      break
    case 'invite':
      inviteToasts.add(m.id, m.name, m.verified)
      sound.play('ding', null, { volume: 0.12, rate: 1.25 })
      break
    case 'decline':
      invitedAt.delete(m.id)
      chat.add('system', tr(`${m.name} a décliné votre invitation.`, `${m.name} declined your invitation.`))
      refreshInviteMenu()
      break
    case 'visit': {
      if (m.id === net.id) {
        const host = visiting?.name ?? remotes.get(entering ?? -1)?.name ?? tr('Votre hôte', 'Your host')
        // Entrée refusée : on reste où l'on est (chez soi, ou chez un autre hôte).
        if (m.expired) {
          if (joining !== null) chat.add('system', tr('Cette invitation a expiré.', 'This invitation has expired.'))
        } else if (m.cabin !== net.id) void enterVisit(m.cabin)
        else if (visiting || entering !== null) {
          leaveVisit(m.by ? tr(`${host} vous a raccompagné : retour dans vos quartiers.`, `${host} showed you out: back to your quarters.`) : BACK_HOME, true)
        }
        joining = null
        break
      }
      const r = remotes.get(m.id)
      if (!r) break
      if (m.cabin === net.id && r.cabin !== net.id) chat.add('system', tr(`${r.name} est entré dans vos quartiers.`, `${r.name} entered your quarters.`))
      else if (r.cabin === net.id && m.cabin !== net.id) chat.add('system', tr(`${r.name} a quitté vos quartiers.`, `${r.name} left your quarters.`))
      r.cabin = m.cabin
      invitedAt.delete(m.id)
      refreshInviteMenu()
      break
    }
  }
  updateNetStatus()
}
net.connect()

// ------------------------------------------------------------------ chat & emotes

function emote(id: string) {
  // Assis ou couché : on se relève d'abord.
  if (seating.current) return seating.stand(() => emote(id))
  const def = player.avatar.playEmote(id)
  if (!def) return
  player.cancelPath()
  marker.visible = false
  bubbles.emote('me', def.icon)
  net.sendEmote(id)
  sound.play('emote', null, { volume: 0.06 })
}

/** Réaction : le médaillon s'envole, le personnage ne bouge pas (on peut rester assis). */
function react(id: string) {
  bubbles.reaction('me', reactionImage(id))
  net.sendEmote(id)
  sound.play('emote', null, { volume: 0.06, rate: 1.25 })
}

chat.onSend = (text) => {
  if (text.startsWith('/')) return command(text)
  chat.add('me', text, nameTag(profile.name, verified))
  bubbles.say('me', text)
  net.sendChat(text)
  sound.play('chat', null, { volume: 0.1, rate: 1.2 })
}

/**
 * Commandes du chat, en français ou en anglais quelle que soit la langue du jeu (/nom ou /name…) ;
 * l'aide donne celles de la langue du joueur.
 */
async function command(text: string) {
  const [cmd, ...rest] = text.slice(1).split(' ')
  const arg = rest.join(' ').trim()
  const name = cmd.toLowerCase()
  const e = EMOTES.find((x) => x.id === name || x.en === name)
  if (e) return emote(e.id)
  const reaction = findReaction(name)
  if (reaction) return react(reaction.id)
  switch (name) {
    case 'nom':
    case 'name':
      if (linked) return chat.add('system', tr(`Votre nom vient de votre compte Élite Dangereuse : ${profile.name}.`, `Your name comes from your Élite Dangereuse account: ${profile.name}.`))
      if (!arg) return chat.add('system', tr('Usage : /nom CMDR Pseudo', 'Usage: /name CMDR Nickname'))
      profile.name = arg.slice(0, 32)
      store.set('name', profile.name)
      updateIdentity()
      // En ligne, le relais confirme (et peut suffixer « (invité) ») : message à la réponse.
      if (net.online) return net.sendProfile(profile)
      return chat.add('system', renamed(profile.name))
    case 'perso':
    case 'random': {
      // Au hasard parmi les apparences qu'on peut porter (offertes, ou achetées).
      const looks = allLooks().filter((l) => lookOwned(l, wallet))
      const look: Look = looks[Math.floor(Math.random() * looks.length)]
      await applyLook(look)
      return saveLook(look)
    }
    case 'inviter':
    case 'invite': {
      if (!verified || !net.online) {
        return chat.add('system', tr('Inviter dans ses quartiers est réservé aux CMDR connectés au site, en ligne.', 'Only CMDRs logged in to the site, and online, can invite people to their quarters.'))
      }
      if (!arg) return chat.add('system', tr('Usage : /inviter CMDR Nom', 'Usage: /invite CMDR Name'))
      const key = (n: string) => n.toLowerCase().replace(/^cmdr\s+/, '').replace(/\s+\(invité\)$/, '').trim()
      const r = [...remotes.values()].find((x) => key(x.name) === key(arg))
      if (!r) return chat.add('system', tr(`Personne à bord ne s'appelle ${arg}.`, `Nobody aboard is called ${arg}.`))
      return invite(r.id)
    }
    case 'credits':
    case 'crédits':
    case 'solde':
    case 'balance': {
      if (wallet.state === 'guest') return chat.add('system', tr('Les crédits sont réservés aux CMDR connectés au site.', 'Credits are for CMDRs logged in to the site.'))
      if (!wallet.ready) return chat.add('system', tr('Crédits indisponibles pour l\'instant : le site ne répond pas.', 'Credits unavailable for now: the site isn\'t responding.'))
      return chat.add('system', tr(`Solde : ${formatCredits(wallet.balance)}.`, `Balance: ${formatCredits(wallet.balance)}.`))
    }
    case 'taches':
    case 'tâches':
    case 'chores': {
      // Où sont les tâches : par pont, et les pièces où elles attendent.
      const lines: string[] = []
      for (const d of [...decks].sort((a, b) => b.def.id - a.def.id)) {
        const rooms = [...board.live.values()].filter((t) => t.deck === d).map((t) => d.roomName(t.item.position.x, t.item.position.z))
        if (rooms.length) lines.push(`${d.def.name} : ${rooms.length} (${[...new Set(rooms)].join(', ')})`)
      }
      if (!lines.length) return chat.add('system', tr('Aucune tâche à bord pour l\'instant : tout est en ordre.', 'No chores aboard right now: everything is shipshape.'))
      return chat.add('system', tr(`Tâches à bord · ${lines.join(' · ')}`, `Chores aboard · ${lines.join(' · ')}`))
    }
    case 'aide':
    case 'help': {
      const emotes = [...EMOTES, ...REACTIONS].map((x) => '/' + tr(x.id, x.en)).join(' ')
      return chat.add(
        'system',
        tr(
          `Commandes : /nom CMDR Pseudo (invités) · /perso · /inviter CMDR Nom · /credits · /taches · ${emotes}`,
          `Commands: /name CMDR Nickname (guests) · /random · /invite CMDR Name · /credits · /chores · ${emotes}`,
        ),
      )
    }
    default:
      return chat.add('system', tr(`Commande inconnue : /${cmd}. Tapez /aide.`, `Unknown command: /${cmd}. Type /help.`))
  }
}

chat.add(
  'system',
  linked
    ? tr(
        `Bienvenue à bord, ${profile.name}. Compte Élite Dangereuse lié. Entrée pour discuter, /aide pour les commandes.`,
        `Welcome aboard, ${profile.name}. Élite Dangereuse account linked. Press Enter to chat, /help for commands.`,
      )
    : tr(
        `Bienvenue à bord, ${profile.name} (invité). Entrée pour discuter, /aide pour les commandes.`,
        `Welcome aboard, ${profile.name} (guest). Press Enter to chat, /help for commands.`,
      ),
)

// ------------------------------------------------------------------ garde-robe

const wardrobe = new WardrobePanel({
  price: (look) => (lookOwned(look, wallet) ? null : skinPrice(skinProduct(look)!)),
  blocked: shopBlocked,
  balance: () => wallet.balance,
  buy: async (look) => {
    const product = skinProduct(look)
    if (!product) return null
    const result = await wallet.buySkin(product)
    if (result.ok) {
      sound.credits(true)
      chat.add('system', tr(`Apparence achetée : ${describe(look)}.`, `Look bought: ${describe(look)}.`))
      return null
    }
    return result.reason === 'funds' ? tr('Crédits insuffisants.', 'Not enough credits.') : (shopBlocked() ?? tr('Achat non abouti : le site ne répond pas.', 'Purchase failed: the site isn\'t responding.'))
  },
})
let dressing: { original: string; zoom: number } | null = null
let lookRequest = 0
let spin = 0

/** Change le modèle du joueur (la dernière demande l'emporte si plusieurs chargements se croisent). */
async function applyLook(look: Look) {
  const req = ++lookRequest
  const r = await lookRig(look)
  if (req !== lookRequest) return
  player.setAvatar(new Avatar(r))
  player.avatar.setPose(seating.pose)
  // Au sac de frappe, le nouvel avatar frappe aussi.
  bindPose()
  photo.refresh()
}

function describe(look: Look): string {
  const race = raceOf(look)
  const parts = [race.label]
  if (race.sexed) parts.push(look.sex === 'female' ? tr('femme', 'female') : tr('homme', 'male'))
  parts.push(variantsOf(race, look.sex).find((v) => v.id === look.variant)?.label ?? '')
  const tint = race.tints?.find((t) => t.id === look.tint)
  if (tint) parts.push(tint.label)
  return parts.join(' · ')
}

function saveLook(look: Look) {
  profile.skin = lookId(look)
  store.set('skin', profile.skin)
  net.sendProfile(profile)
  chat.add('system', tr(`Nouvelle apparence : ${describe(look)}.`, `New look: ${describe(look)}.`))
}

function openWardrobe() {
  const pad = cabin.holoMe?.position
  if (!pad) return
  const start = () => {
    dressing = { original: profile.skin, zoom: iso.zoomLevel }
    iso.zoomTo(2.3)
    spin = Math.atan2(toCam.x, toCam.z) // face à la caméra
    holoMeGlow.value = 1
    sound.play('lift', new THREE.Vector3(pad.x, deck.y + 0.5, pad.z), { volume: 0.1, rate: 1.4 })
    wardrobe.open(parseLook(profile.skin))
  }
  // On monte d'abord sur la plateforme.
  if (Math.hypot(player.position.x - pad.x, player.position.z - pad.z) > 0.1) {
    player.setPath([{ x: pad.x, z: pad.z }])
    player.onArrive = start
  } else start()
}
cabin.onHoloMe = openWardrobe

/** Pourquoi on ne peut pas acheter en ce moment, ou null. */
function shopBlocked(): string | null {
  if (!linked || wallet.state === 'guest') return tr('Connectez-vous au site pour acheter des apparences.', 'Log in to the site to buy looks.')
  if (wallet.state === 'offline') return tr('Boutique indisponible : le site ne répond pas.', 'Shop unavailable: the site isn\'t responding.')
  if (wallet.state === 'loading') return tr('Chargement de vos crédits…', 'Loading your credits…')
  return null
}
/**
 * Apparence portée sans être à soi (choisie avant les crédits, ou sur un autre appareil comme
 * invité) : retour à la combinaison de vol, offerte. Rien tant qu'on ne sait pas (site injoignable).
 */
function checkLook() {
  wardrobe.refresh()
  if (wallet.state !== 'ready' && wallet.state !== 'guest') return
  const look = parseLook(profile.skin)
  if (lookOwned(look, wallet)) return
  const next = starterLook()
  void applyLook(next)
  profile.skin = lookId(next)
  store.set('skin', profile.skin)
  net.sendProfile(profile)
  chat.add(
    'system',
    tr(
      `${describe(look)} n'est pas dans votre garde-robe : retour à la combinaison de vol. Le Holo-Me de vos quartiers vend les autres apparences.`,
      `${describe(look)} isn't in your wardrobe: back to the flight suit. The Holo-Me in your quarters sells the other looks.`,
    ),
  )
}
wallet.subscribe(checkLook)

wardrobe.onChange = (look) => {
  void applyLook(look)
  sound.play('emote', null, { volume: 0.04, rate: 1.3 })
}
wardrobe.onClose = (confirmed, look) => {
  if (!dressing) return
  iso.zoomTo(dressing.zoom)
  holoMeGlow.value = 0
  if (confirmed) {
    if (lookId(look) !== dressing.original) saveLook(look)
    emote('joie')
  } else if (lookId(parseLook(dressing.original)) !== lookId(look)) {
    void applyLook(parseLook(dressing.original))
  }
  dressing = null
}

// ------------------------------------------------------------------ jukebox

const jukebox = new JukeboxPanel()
/** Jukebox dont le panneau est ouvert : on s'en éloigne, il se ferme. */
let jukeboxNear: THREE.Vector3 | null = null
/** Où est ce jukebox : les quartiers peuvent changer d'aménagement sous le panneau. */
let jukeboxWhere: JukeboxWhere = 'deck'

/** Place (monde) d'un jukebox : au pont principal, à la cale, ou dans les quartiers. */
function jukeboxAt(where: JukeboxWhere, x: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, (where === 'cabin' ? cabinDeck.y : deckById(JUKEBOX_DECKS[where]).y) + 0.7, z)
}

/** Ce que joue un jukebox selon le relais : un morceau, à sa position et à sa place, ou le silence. */
function applyMusic(m: MusicState): Track | null {
  const music = jukeboxes[m.where]
  if (!music) return null
  const track = trackById(m.track)
  if (track) music.play(track, jukeboxAt(m.where, m.x, m.z), m.at, m)
  else music.stop()
  return track
}

function nowPlaying(track: Track, song = 0) {
  dialog.show(`♪ ${track.songs?.[song]?.title ?? track.title} — ${track.artist}. ${track.mood}`)
}

/** Le panneau du jukebox : on choisit un morceau (pour tous ceux qui sont là), ou on l'arrête. */
function openJukebox(where: JukeboxWhere, at: THREE.Vector3) {
  player.interact()
  net.sendEmote('interact')
  const music = jukeboxes[where]
  jukeboxNear = at.clone()
  jukeboxWhere = where
  const choose = (track: Track, song: number, position = 0, options: Omit<MusicOptions, 'song'> = music.options) => {
    music.play(track, jukeboxAt(where, at.x, at.z), position, { ...options, song })
    net.sendMusic(where, track.id, at.x, at.z, position > 0 ? position : undefined, { ...options, song })
  }
  jukebox.open(
    music,
    (track, song) => {
      choose(track, song)
      nowPlaying(track, song)
      sound.play('emote', null, { volume: 0.05, rate: 0.8 })
    },
    () => {
      music.stop()
      net.sendMusic(where, null, at.x, at.z)
    },
    (kind) => {
      const current = music.current
      if (!current) return
      const options = music.options
      if (kind === 'previous' || kind === 'next') {
        const target = music.adjacent(kind === 'previous' ? -1 : 1)
        if (target) choose(target.track, target.song, 0, options)
      } else if (kind === 'loop') {
        choose(current.track, current.songIndex, current.position, { ...options, loop: !options.loop })
      } else {
        choose(current.track, current.songIndex, current.position, {
          ...options, shuffle: !options.shuffle, seed: !options.shuffle ? Math.floor(Math.random() * 0x100000000) : options.seed,
        })
      }
    },
  )
}

/** Panneau du jukebox ouvert : flèches pour le catalogue et les styles. */
function jukeboxKey(e: KeyboardEvent): boolean {
  if (!jukebox.isOpen) return false
  if (e.code === 'ArrowUp' || e.code === 'KeyW') jukebox.move(-1)
  else if (e.code === 'ArrowDown' || e.code === 'KeyS') jukebox.move(1)
  else if (e.code === 'ArrowLeft' || e.code === 'KeyA') jukebox.filterMove(-1)
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') jukebox.filterMove(1)
  else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') jukebox.confirm()
  else if (e.code === 'KeyE' || e.code === 'Escape') jukebox.close()
  else if (!MOVE_KEYS.has(e.code)) return false
  e.preventDefault()
  return true
}

// ------------------------------------------------------------------ ascenseur

let riding = false
const liftTile = { x: LIFT.x, z: LIFT.z }
const liftRide = new LiftRide()
scene.add(liftRide.group)

function openLift() {
  lift.open(LEVELS, deck.def.id, (id) => void ride(id))
}
for (const d of decks) if (d.liftInteractable) d.liftInteractable.onInteract = openLift

async function ride(target: number) {
  if (riding || target === deck.def.id) return
  riding = true
  player.cancelPath()
  player.position.x = LIFT.x
  player.position.z = LIFT.z
  marker.visible = false
  sound.play('lift', new THREE.Vector3(LIFT.x, deck.y + 0.5, LIFT.z), { volume: 0.2 })
  const next = deckById(target)
  for (const d of decks) d.showLiftBeam(false)
  // On s'approche du tube le temps du trajet, puis on revient au cadrage du joueur.
  const zoom = iso.zoomLevel
  iso.zoomTo(Math.min(zoom, 3.4))
  // Le pont change en plein noir, au milieu du trajet dans le tube (cf. lift-ride.ts).
  await liftRide.run(LIFT.x, deck.y, LIFT.z, next.y > deck.y, next.def.name, () => {
    // Changer de pont met fin à une visite : on retrouvera ses propres quartiers.
    if (visiting) {
      const host = visiting.name
      net.sendVisit(null)
      leaveVisit(tr(`Fin de la visite chez ${host} : vos quartiers vous attendent.`, `Your visit to ${host} is over: your own quarters await.`))
    }
    setDeck(next)
    deck.pulseLift()
    net.sendState({ x: player.position.x, z: player.position.z, yaw: player.heading, level: deck.def.id, anim: 'idle' }, Infinity)
    sound.play('ding', null, { volume: 0.1 })
    return deck.y
  })
  for (const d of decks) d.showLiftBeam(true)
  iso.zoomTo(zoom)
  riding = false
}

// ------------------------------------------------------------------ aménagement

let editZoom = 0
const loginUrl = () => `/auth-redirect.php?redirect=${encodeURIComponent(location.pathname + location.search)}`
const cabinBar = new CabinBar()
/**
 * Mode aménagement : chargé à la première ouverture (seuls les CMDR qui aménagent leurs
 * quartiers téléchargent l'éditeur, ses règles et ses vignettes).
 */
let editor: CabinEditor | null = null
let editorLoading: Promise<void> | null = null
/** Vue plongeante du mode aménagement (cf. cabin/editor.ts). */
let editElevation = 0
const editing = () => editor?.active === true

function loadEditor(): Promise<void> {
  editorLoading ??= import('./cabin/editor').then(({ CabinEditor, EDIT_ELEVATION }) => {
    editElevation = EDIT_ELEVATION
    editor = new CabinEditor(cabin, {
      canvas: renderer.domElement,
      iso,
      sound,
      onChange: (layout) => {
        ownLayout = layout
        cabinStore?.save(layout)
        if (verified) net.sendCabin(serializeLayout(layout))
      },
      onClose: () => closeEditor(),
      wallet,
      player: player.position,
    })
  })
  return editorLoading
}

/**
 * CMDR reconnu par le relais sans que le site ait répondu au chargement : on va chercher ses
 * quartiers maintenant (en attendant, ceux gardés dans ce navigateur).
 */
function adoptAccount() {
  if (!wallet.ready) void wallet.load()
  if (cabinStore) return
  const store = (cabinStore = new CabinStore(profile.name.replace(/^CMDR /, '')))
  setOwnLayout(normalizeLayout(store.localCopy, cabin.bounds))
  void requestCabin().then((site) => siteAnswered(store, site))
}

/** Le site répond en cours de partie : ses quartiers remplacent ceux montrés en attendant. */
function siteAnswered(store: CabinStore, site: SiteCabin | null) {
  if (cabinStore !== store) return
  setOwnLayout(connectStore(store, site))
  reconcileWings()
}

/** Aménagement de ses quartiers venu d'ailleurs que du mode aménagement (qui attend le site). */
function setOwnLayout(layout: CabinLayout) {
  if (sameLayout(layout, ownLayout)) return
  ownLayout = layout
  if (verified) net.sendCabin(serializeLayout(layout))
  if (!visiting) showCabin()
}

/** Position dans la cabine (le bon pont, la bonne pièce) ? */
function inCabin(level: number, x: number, z: number): boolean {
  return level === cabinDeck.def.id && cabin.contains(x, z)
}

/** @param tab onglet à ouvrir : « Pièces » depuis la porte d'un espace d'extension */
async function openEditor(tab?: 'rooms') {
  if (editing() || riding || photo.active) return
  if (visiting) return chat.add('system', tr(`Vous êtes en visite chez ${visiting.name} : on n'aménage que chez soi.`, `You're visiting ${visiting.name}: you can only decorate your own quarters.`))
  if (!linked) return chat.add('system', tr('Aménager ses quartiers est réservé aux CMDR connectés à elitedangereuse.fr.', 'Only CMDRs logged in to elitedangereuse.fr can decorate their quarters.'))
  if (!cabinStore?.ready) return chat.add('system', tr('Vos quartiers arrivent du site, encore un instant…', 'Your quarters are on their way from the site, just a moment…'))
  await loadSiteArt()
  if (editing() || riding || visiting || photo.active) return
  if (!editor) {
    await loadEditor()
    // On a pu partir (ascenseur, invitation) pendant le chargement.
    if (!editor || editing() || riding || visiting || photo.active || !inCabin(deck.def.id, player.position.x, player.position.z)) return
  }
  const store = cabinStore
  const ed = editor
  if (!inCabin(deck.def.id, player.position.x, player.position.z)) {
    return chat.add('system', tr('On aménage ses quartiers depuis ses quartiers, sur le pont supérieur.', 'You decorate your quarters from inside them, on the upper deck.'))
  }
  lift.close()
  jukebox.close()
  wardrobe.close(false)
  seating.leave()
  player.cancelPath()
  marker.visible = hover.visible = false
  editZoom = iso.zoomLevel
  iso.setRestElevation(editElevation)
  document.body.classList.add('editing')
  ed.start(ownLayout, tab)
  ed.reframe(player.position)
  ed.setSaveState(store.state)
  store.onState = (state) => ed.setSaveState(state)
}

function closeEditor() {
  if (!editor?.active) return
  editor.stop()
  iso.setRestElevation(null)
  iso.zoomMax = 14
  iso.zoomTo(editZoom)
  document.body.classList.remove('editing')
  renderer.domElement.style.cursor = 'default'
  unstick(player.position, 0.18)
  unstick(cat.root.position, 0.12)
  for (const c of companions.values()) unstick(c.pet.root.position, 0.12)
  void cabinStore?.flush()
}
cabinBar.onEdit = () => void openEditor()

// ------------------------------------------------------------------ extensions des quartiers

/** Espace d'extension dont la porte est sur ce bord de tuile. */
const wingAtDoor = (x: number, z: number, dir: number) => WING_SLOTS.find((s) => s.door.x === x && s.door.z === z && s.door.dir === dir)
const WING_DOOR_NAMES: Record<WingId, string> = { left: tr('gauche', 'left'), middle: tr('du milieu', 'middle'), right: tr('droite', 'right') }

/** Porte fermée d'un espace : chez un hôte, un espace qu'il n'a pas aménagé ; chez soi, l'extension à débloquer. */
cabinDeck.lockedText = (x, z, dir) => {
  const slot = wingAtDoor(x, z, dir)
  if (!slot) return undefined
  if (visiting) return tr('Porte fermée : votre hôte n\'a pas encore aménagé cet espace.', 'Closed door: your host has not fitted out this space yet.')
  if (!linked) return tr('Porte fermée : une extension des quartiers, réservée aux CMDR connectés à elitedangereuse.fr.', 'Closed door: a quarters extension, for CMDRs logged in to elitedangereuse.fr.')
  const price = wingPrice(wallet.wings.size)
  return tr(
    `Extension ${WING_DOOR_NAMES[slot.id]} de vos quartiers${price ? ` : ${formatCredits(price)}` : ''}. Débloquez-la depuis le mode aménagement, onglet « Pièces ».`,
    `Your quarters' ${WING_DOOR_NAMES[slot.id]} extension${price ? `: ${formatCredits(price)}` : ''}. Unlock it from the decorating mode, “Rooms” tab.`,
  )
}
for (const slot of WING_SLOTS) {
  const it = cabinDeck.doorExamine(slot.door.x, slot.door.z, slot.door.dir)
  // Chez soi, la porte mène droit à l'onglet « Pièces » ; ailleurs, on lit ce qu'elle dit.
  if (it) it.onInteract = () => (!visiting && linked ? void openEditor('rooms') : showText(it.text))
}

/**
 * Les pièces de ses quartiers suivent les espaces débloqués sur le site : un espace acheté
 * (ailleurs, ou avant un enregistrement manqué) reçoit une pièce de la forme par défaut, une pièce
 * sans espace débloqué disparaît (le site la refuserait).
 */
function reconcileWings() {
  if (!wallet.ready || !cabinStore?.ready || editing()) return
  const wings = { ...(ownLayout.wings ?? {}) }
  let changed = false
  for (const slot of WING_SLOTS) {
    const owned = wallet.wings.has(slot.id)
    if (owned === !!wings[slot.id]) continue
    if (owned) wings[slot.id] = { shape: DEFAULT_PATTERN }
    else delete wings[slot.id]
    changed = true
  }
  if (!changed) return
  const next: CabinLayout = { ...ownLayout, wings }
  if (!Object.keys(wings).length) delete next.wings
  cabinStore.save(next)
  setOwnLayout(next)
}
wallet.subscribe(reconcileWings)

// ------------------------------------------------------------------ visites

/*
 * Chacun a sa propre instance des quartiers : on n'y voit que ceux qui s'y trouvent avec nous.
 * Un CMDR invite un membre d'équipage (le relais vérifie l'invitation) ; l'invité est
 * téléporté devant la porte, dans les quartiers meublés comme chez l'hôte, et les voit changer
 * en direct. La visite dure même s'il sort dans la coursive (il peut revenir) : il rentre chez
 * lui avec « Rentrer chez moi », en changeant de pont, ou quand l'hôte le raccompagne ou quitte
 * le vaisseau.
 */

/** Hôte dont on visite les quartiers, qu'on y soit ou dans la coursive (null : chez soi). */
let visiting: { host: number; name: string } | null = null
/** Invitation acceptée, en attente de la réponse du relais. */
let joining: number | null = null
/** Entrée en cours dans les quartiers d'un hôte, le temps du fondu (id de l'hôte). */
let entering: number | null = null
/** Numéro de la dernière entrée ou sortie : une entrée interrompue en plein fondu s'arrête là. */
let visitSeq = 0
/** Derniers aménagements reçus des hôtes. */
const hostLayouts = new Map<number, unknown>()
/** Invitations envoyées (id de l'invité → fin de validité), pour la liste d'équipage. */
const invitedAt = new Map<number, number>()
const inviteMenu = new InviteMenu()
const inviteToasts = new InviteToasts()

/** Instance des quartiers où se trouve le joueur local (id de l'hôte). */
const myCabin = () => visiting?.host ?? net.id

/** Un autre joueur est-il visible ? Dans des quartiers, seulement s'il est dans la même instance. */
function sees(r: RemotePlayer): boolean {
  // Dans la baie infestée (ou par les caméras) : seulement ses coéquipiers, hors des casiers.
  if (r.level === ZONE_LEVEL) return !!viewDeck.def.zone && !!salvage?.sees(r.id)
  if (r.level !== viewDeck.def.id || viewDeck !== deck) return false
  return !inCabin(r.level, r.group.position.x, r.group.position.z) || r.cabin === myCabin()
}

/** Aménagement affiché : celui de l'hôte pendant une visite, le sien sinon. */
function showCabin() {
  cabin.setLayout(visiting ? normalizeLayout(hostLayouts.get(visiting.host) ?? null, cabin.bounds) : ownLayout)
  // Le jukebox du panneau a pu bouger, disparaître, ou être celui de l'hôte qui nous raccompagne.
  if (jukeboxWhere === 'cabin') jukebox.close()
  // Assis sur un meuble des quartiers : on retrouve sa place, ou l'on se relève s'il a bougé.
  seating.relink()
  // La pièce d'extension où l'on se tenait (celle de l'hôte, ou une forme changée) n'existe plus :
  // on revient dans les quartiers, au plus près, plutôt que de flotter dans le vide.
  if (deck === cabinDeck && !cabinDeck.map.isFloor(Math.round(player.position.x), Math.round(player.position.z))) {
    seating.leave()
    player.cancelPath()
    marker.visible = false
    const t = nearestCabinTile(player.position)
    if (t) player.position.set(t.x, cabinDeck.y, t.z)
  }
  // Un meuble a pu apparaître sous nos pieds (ou sous les pattes de Comète).
  if (deck === cabinDeck && !seating.current) unstick(player.position, 0.18)
  unstick(cat.root.position, 0.12)
  syncCompanions()
  for (const c of companions.values()) unstick(c.pet.root.position, 0.12)
}

function crew(): CrewEntry[] {
  // Ses propres autres onglets (même CMDR) ne s'invitent pas.
  return [...remotes.values()].filter((r) => !verified || r.name !== profile.name).map((r) => ({
    id: r.id,
    name: r.name,
    state: r.cabin === net.id ? 'visiting' : (invitedAt.get(r.id) ?? 0) > Date.now() ? 'invited' : 'free',
  }))
}

function refreshInviteMenu() {
  inviteMenu.refresh(crew())
}

const alreadyHere = (name: string) => tr(`${name} est déjà dans vos quartiers.`, `${name} is already in your quarters.`)

async function invite(id: number) {
  const r = remotes.get(id)
  if (!r) return
  if (r.cabin === net.id) return chat.add('system', alreadyHere(r.name))
  // Grisée tout de suite dans la liste (pas de double envoi), rendue si le relais la refuse ;
  // une invitation envoyée avant reste valable.
  const previous = invitedAt.get(id)
  invitedAt.set(id, Date.now() + 60000)
  refreshInviteMenu()
  const reply = await net.sendInvite(id)
  if (reply?.ok) return chat.add('system', tr(`Invitation envoyée à ${r.name}.`, `Invitation sent to ${r.name}.`))
  if (previous) invitedAt.set(id, previous)
  else invitedAt.delete(id)
  refreshInviteMenu()
  if (!reply) return chat.add('system', tr('Invitation non envoyée : liaison perdue avec le relais.', 'Invitation not sent: lost contact with the relay.'))
  chat.add(
    'system',
    {
      guest: tr('Inviter dans ses quartiers est réservé aux CMDR connectés au site.', 'Only CMDRs logged in to the site can invite people to their quarters.'),
      gone: tr(`${r.name} n'est plus à bord.`, `${r.name} is no longer aboard.`),
      here: alreadyHere(r.name),
      busy: tr('Doucement : trop d\'invitations d\'un coup. Réessayez dans quelques secondes.', 'Easy there: too many invitations at once. Try again in a few seconds.'),
    }[reply.reason],
  )
}

/** Invitation acceptée : on demande au relais d'entrer (il vérifie qu'elle est valable). */
function acceptInvite(host: number) {
  if (!net.online || visiting?.host === host) return
  joining = host
  net.sendVisit(host)
}

/** Le relais nous fait entrer : téléportation devant la porte des quartiers de l'hôte. */
async function enterVisit(host: number) {
  const seq = ++visitSeq
  const name = remotes.get(host)?.name ?? tr('un CMDR', 'a CMDR')
  entering = host
  if (editing()) closeEditor()
  wardrobe.close(false)
  lift.close()
  jukebox.close()
  inviteMenu.close()
  inviteToasts.remove(host)
  seating.leave()
  player.cancelPath()
  marker.visible = false
  riding = true
  await fadeScreen(true)
  // Raccompagné (ou hôte parti) pendant le fondu : on n'entre pas.
  if (seq === visitSeq) {
    if (deck !== cabinDeck) setDeck(cabinDeck)
    visiting = { host, name }
    const door = cabin.def.door
    player.position.set(door.x, cabinDeck.y, door.z + 0.25)
    player.setHeading(0)
    showCabin()
    iso.snapTo(player.position)
    net.sendState({ x: player.position.x, z: player.position.z, yaw: player.heading, level: deck.def.id, anim: 'idle' }, Infinity)
    sound.play('ding', null, { volume: 0.1 })
  }
  if (entering === host) entering = null
  await fadeScreen(false)
  riding = false
  if (seq === visitSeq && visiting?.host === host) {
    chat.add('system', tr(`Vous voici dans les quartiers de ${name}. « Rentrer chez moi » ou l'ascenseur vous ramènent chez vous.`, `You are in ${name}'s quarters. “Go home” or the lift takes you back to yours.`))
  }
}

/**
 * Fin de visite (ou d'une entrée en cours) : on retrouve ses propres quartiers, là où l'on se
 * tient. `home` : visite interrompue (liaison perdue, hôte parti, raccompagné), on y est ramené.
 */
function leaveVisit(message?: string, home = false) {
  const was = visiting !== null || entering !== null
  const inside = visiting !== null
  visitSeq++
  entering = null
  // La musique de l'hôte reste chez lui ; en ligne, le relais nous rend celle de nos quartiers.
  if (was) cabinMusic.stop()
  if (visiting) {
    visiting = null
    showCabin()
  }
  if (was && message) chat.add('system', message)
  if (inside && home) void bringHome()
}

/** Retour dans ses quartiers, à deux pas du Holo-Me, le temps d'un fondu. */
async function bringHome() {
  // En plein trajet d'ascenseur ou d'entrée chez un autre hôte : on n'y touche pas (showCabin
  // nous a déjà sortis du vide, s'il le fallait).
  if (riding) return
  const seq = visitSeq
  riding = true
  seating.leave()
  player.cancelPath()
  marker.visible = false
  lift.close()
  jukebox.close()
  await fadeScreen(true)
  // Invité ailleurs pendant le fondu : on laisse faire l'entrée.
  if (seq === visitSeq && !visiting) {
    if (deck !== cabinDeck) setDeck(cabinDeck)
    const s = spawnPoint()
    player.position.set(s.x, cabinDeck.y, s.z)
    iso.snapTo(player.position)
    sendState(true)
  }
  await fadeScreen(false)
  // Une entrée chez un autre hôte, commencée pendant le fondu, rendra la main elle-même.
  if (seq === visitSeq) riding = false
}

cabinBar.onInvite = () => {
  if (inviteMenu.isOpen) return inviteMenu.close()
  inviteMenu.open(crew())
}
cabinBar.onLeave = () => {
  net.sendVisit(null)
  leaveVisit(BACK_HOME)
}
inviteMenu.onInvite = (id) => void invite(id)
inviteMenu.onKick = (id) => net.sendKick(id)
inviteToasts.onAccept = acceptInvite
inviteToasts.onDecline = (id) => net.sendDecline(id)
// Clic en dehors de la liste d'équipage : elle se ferme.
addEventListener(
  'pointerdown',
  (e) => {
    if (inviteMenu.isOpen && !inviteMenu.contains(e.target) && !(e.target instanceof Node && $('cabin-bar').contains(e.target))) inviteMenu.close()
  },
  { capture: true },
)

/**
 * Un meuble vient d'être posé là où se tient un personnage : il en sort par le côté le plus
 * proche, ou, à défaut, rejoint la tuile libre la plus proche de la cabine.
 */
function unstick(p: THREE.Vector3, r: number) {
  const colliders = cabinDeck.colliders
  if (!overlapsAny(p, r, colliders)) return
  const q = { x: p.x, z: p.z }
  resolveCircle(q, r, colliders)
  if (!overlapsAny(q, r, colliders)) {
    p.x = q.x
    p.z = q.z
    return
  }
  const best = nearestCabinTile(p)
  if (best) {
    p.x = best.x
    p.z = best.z
  }
}

/** Tuile libre des quartiers (hors extensions) la plus proche. */
function nearestCabinTile(p: { x: number; z: number }): { x: number; z: number } | null {
  let best: { x: number; z: number } | null = null
  for (const t of cabin.tiles) {
    if (cabinDeck.pathfinder.walkable(t.x, t.z) && (!best || Math.hypot(t.x - p.x, t.z - p.z) < Math.hypot(best.x - p.x, best.z - p.z))) best = t
  }
  return best
}

// ------------------------------------------------------------------ entrées

const keys = new Set<string>()
const gamepad = new GamepadControls()
const touchGamepad = coarsePointer ? new TouchGamepad() : null
let mobileStarted = false
function syncMobileEntry() {
  if (!touchGamepad) return
  $('mobile-entry').hidden = mobileStarted && innerWidth > innerHeight
}
async function enterMobile() {
  mobileStarted = true
  try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.() } catch { /* Plein écran indisponible. */ }
  try { await (screen.orientation as ScreenOrientation & { lock?: (orientation: 'landscape') => Promise<void> }).lock?.('landscape') } catch { /* Rotation manuelle requise. */ }
  syncMobileEntry()
}
$('mobile-enter').onclick = () => void enterMobile()
$('mobile-fullscreen').onclick = () => void enterMobile()
addEventListener('orientationchange', syncMobileEntry)
let usingGamepad = false
for (const type of ['keydown', 'pointerdown']) addEventListener(type, () => (usingGamepad = false), { capture: true })
addEventListener('blur', () => gamepad.suspend())
addEventListener('visibilitychange', () => gamepad.suspend())
/** Touches de déplacement (position physique : KeyW/KeyA = Z/Q sur un clavier AZERTY). */
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

/**
 * Panneau d'ascenseur ouvert : haut/bas pour choisir l'étage, Entrée ou Espace pour y aller,
 * E ou Échap pour fermer. Le personnage ne bouge pas pendant ce temps.
 * @returns true si la touche a été prise par le panneau
 */
function liftKey(e: KeyboardEvent): boolean {
  if (!lift.isOpen) return false
  if (e.code === 'ArrowUp' || e.code === 'KeyW') lift.move(-1)
  else if (e.code === 'ArrowDown' || e.code === 'KeyS') lift.move(1)
  else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') lift.confirm()
  else if (e.code === 'KeyE' || e.code === 'Escape') lift.close()
  else if (!MOVE_KEYS.has(e.code)) return false
  e.preventDefault()
  return true
}

addEventListener('keydown', (e) => {
  // En vol vers la base au sol (ou retour) : l'écran de voyage couvre tout, rien à faire.
  if (groundBase.flying) return e.preventDefault()
  if (barPanel.isOpen || gameEmbed.isOpen || mediaRoom.isOpen || cinemaRoom.isOpen) { if (e.code === 'Escape') { barPanel.close(); gameEmbed.close(); mediaRoom.close(); cinemaRoom.close() }; e.preventDefault(); return }
  if (gym.key(e)) return
  if (chat.typing) return
  if (zone.keyDown(e)) return
  if (sitePanel.isOpen) {
    if (e.code === 'Escape' || e.code === 'KeyE') sitePanel.close()
    e.preventDefault()
    return
  }
  // Mode aménagement : ses touches d'abord (les flèches se répètent pour ajuster un objet).
  if (editing() && editor!.keyDown(e)) return
  if (e.repeat) return
  // Mode photo : ses touches (déclencheur, options) ; on garde les déplacements, les poses, R et M.
  if (photo.keyDown(e)) return
  if (e.code === 'KeyP' && !editing()) return openPhoto()
  if (liftKey(e) || jukeboxKey(e)) return
  if (e.code === 'Enter') {
    e.preventDefault()
    return chat.open()
  }
  if (e.code === 'Escape') {
    toggleAbout(false)
    toggleReactions(false)
    inviteMenu.close()
    stopWork()
    // Devant la pince : on quitte la partie.
    if (claw && seating.settled) seating.stand()
    return wardrobe.close(false)
  }
  keys.add(e.code)
  if (e.code === 'KeyR' && !fpsShown) iso.rotate(e.shiftKey ? -1 : 1)
  if (e.code === 'KeyV' && !editing()) return toggleFps()
  if (e.code === 'KeyB') return editing() ? closeEditor() : void openEditor()
  if (e.code === 'KeyM') {
    sound.toggleMute()
    updateMuteButton()
  }
  if (e.code === 'KeyH') $('help').hidden = !$('help').hidden
  if (editing() || photo.active) {
    // En photo, les emotes servent de poses.
    const pose = /^Digit([1-9])$/.exec(e.code)
    if (photo.active && pose && EMOTES[+pose[1] - 1]) emote(EMOTES[+pose[1] - 1].id)
    return
  }
  // Installé sur un meuble : E relève le personnage, Espace fait ce que permet la place.
  if (seating.current) {
    if (e.code === 'KeyE' && seating.settled) seating.stand()
    if (e.code === 'Space' && seating.settled) seatAction(seating.current)
  } else if (e.code === 'KeyE' || e.code === 'Space') tryInteract()
  const digit = /^Digit([1-9])$/.exec(e.code)
  if (!digit) return
  // Palette des réactions ouverte : les chiffres choisissent une réaction.
  if (!reactionsPanel.hidden && REACTIONS[+digit[1] - 1]) {
    react(REACTIONS[+digit[1] - 1].id)
    return toggleReactions(false)
  }
  if (+digit[1] === REACTION_KEY) return toggleReactions()
  if (EMOTES[+digit[1] - 1]) emote(EMOTES[+digit[1] - 1].id)
})
addEventListener('keyup', (e) => keys.delete(e.code))
addEventListener('blur', () => keys.clear())
chat.onOpen = () => keys.clear()

const inputDir = new THREE.Vector3()
function keyboardDirection(): THREE.Vector3 {
  inputDir.set(0, 0, 0)
  if (gym.active || chat.typing || riding || groundBase.flying || sitePanel.isOpen || lift.isOpen || jukebox.isOpen || barPanel.isOpen || gameEmbed.isOpen || mediaRoom.isOpen || cinemaRoom.isOpen || editing() || zone.frozen || zone.panelOpen) return inputDir
  const on = (...codes: string[]) => codes.some((c) => keys.has(c))
  // event.code = position physique : KeyW/KeyA correspondent à Z/Q sur un clavier AZERTY.
  const sx = (on('KeyD', 'ArrowRight') ? 1 : 0) - (on('KeyA', 'ArrowLeft') ? 1 : 0)
  const sy = (on('KeyW', 'ArrowUp') ? 1 : 0) - (on('KeyS', 'ArrowDown') ? 1 : 0)
  if (!sx && !sy) return inputDir
  return view().screenToGround(sx, sy, inputDir).normalize()
}

function updateGamepad(dt: number): GamepadInput {
  const focus = document.activeElement
  const typing = focus instanceof HTMLElement && (focus.matches('input, textarea, select') || focus.isContentEditable)
  const enabled = !document.hidden && !typing && !chat.typing && !editing() && !photo.active && !arcade?.isOpen && !boardGames.isOpen && !barPanel.isOpen && !gameEmbed.isOpen && !mediaRoom.isOpen && !cinemaRoom.isOpen
  // Certains navigateurs mobiles rapportent brièvement document.hasFocus() = false après le
  // passage en plein écran. Cela ne doit pas couper le joystick ni ses boutons.
  const pad = gamepad.poll(document.hasFocus() && enabled)
  let flare = false
  if (touchGamepad) {
    const touch = touchGamepad.poll(enabled)
    touchGamepad.showFlares(zone.flares)
    flare = touch.flare
    if (touch.moveX || touch.moveY) { pad.moveX = touch.moveX; pad.moveY = touch.moveY }
    pad.sprint ||= touch.sprint
    pad.interact ||= touch.interact
    pad.action ||= touch.action
    pad.cancel ||= touch.cancel
    pad.up ||= touch.up
    pad.down ||= touch.down
    pad.active ||= touch.active
    pad.connected ||= touch.connected
  }
  if (!pad.connected) usingGamepad = false
  if (!enabled) return pad
  if (pad.active) {
    usingGamepad = true
    lastInput = performance.now()
  }
  if (gym.active) {
    pad.moveX = pad.moveY = 0
    if (pad.cancel) gym.stop()
    return pad
  }
  if (barPanel.isOpen) {
    pad.moveX = pad.moveY = 0
    if (pad.cancel) barPanel.close()
    return pad
  }
  // Les panneaux prennent les commandes avant le personnage.
  const panel = sitePanel.isOpen ? sitePanel : lift.isOpen ? lift : jukebox.isOpen ? jukebox : null
  if (panel) {
    pad.moveX = pad.moveY = 0
    if (pad.cancel) panel.close()
    else {
      if (pad.up) panel.move(-1)
      if (pad.down) panel.move(1)
      if (panel === jukebox && pad.rotateLeft) jukebox.filterMove(-1)
      if (panel === jukebox && pad.rotateRight) jukebox.filterMove(1)
      if (pad.interact) panel.confirm()
    }
    return pad
  }
  if (pad.cancel) {
    toggleAbout(false)
    inviteMenu.close()
    stopWork()
    wardrobe.close(false)
    if (claw && seating.settled) seating.stand()
    return pad
  }
  if (pad.help) $('help').hidden = !$('help').hidden
  if (riding || wardrobe.isOpen) return pad
  if (zone.frozen) {
    // Caméras alliées : gauche, droite pour changer de coéquipier ; A pour les quitter. Caché
    // dans un casier : A pour en sortir.
    if (pad.rotateLeft) zone.keyDown(new KeyboardEvent('keydown', { code: 'ArrowLeft' }))
    if (pad.rotateRight) zone.keyDown(new KeyboardEvent('keydown', { code: 'ArrowRight' }))
    if (pad.interact) zone.keyDown(new KeyboardEvent('keydown', { code: 'KeyE' }))
    return pad
  }
  if (fpsShown) {
    if (pad.lookX || pad.lookY) fps.look(-pad.lookX * dt * 2.4, -pad.lookY * dt * 1.8)
  } else {
    if (pad.rotateLeft) iso.rotate(-1)
    if (pad.rotateRight) iso.rotate(1)
    if (pad.lookX || pad.lookY) iso.orbit(-pad.lookX * dt * 1.8, pad.lookY * dt * 1.2)
    if (pad.zoom) iso.zoomBy(Math.exp(pad.zoom * dt))
  }
  if (groundBase.flying) return pad
  if (seating.current) {
    if (pad.interact && seating.settled) seating.stand()
    else if (pad.action && seating.settled) seatAction(seating.current)
  } else if ((pad.action || flare) && zone.inZone) zone.throwFlare(true)
  else if (pad.interact || pad.action) tryInteract()
  return pad
}

function movementDirection(pad: GamepadInput): THREE.Vector3 {
  const input = keyboardDirection()
  if (chat.typing || riding || groundBase.flying || sitePanel.isOpen || lift.isOpen || jukebox.isOpen || barPanel.isOpen || wardrobe.isOpen || editing() || photo.active || zone.frozen || zone.panelOpen) return input
  // Le clavier reste prioritaire lorsqu'une touche de déplacement est maintenue.
  if (input.lengthSq() === 0) view().screenToGround(pad.moveX, -pad.moveY, input)
  return input
}

addEventListener('wheel', (e) => {
  if (!barPanel.isOpen && !cinemaRoom.isOpen && !fpsShown) iso.zoomBy(Math.exp(e.deltaY * 0.001))
}, { passive: true })
$('rot-left').onclick = () => iso.rotate(-1)
$('rot-right').onclick = () => iso.rotate(1)
$('zoom-in').onclick = () => iso.zoomBy(0.8)
$('zoom-out').onclick = () => iso.zoomBy(1.25)
$('mute').onclick = () => {
  sound.toggleMute()
  updateMuteButton()
}
$('help-toggle').onclick = () => ($('help').hidden = !$('help').hidden)
$('photo-toggle').onclick = () => openPhoto()
function updateLightMode() {
  const light = renderQuality.light
  renderer.setPixelRatio(light ? Math.min(MAX_DPR, 0.75) : dpr)
  renderer.shadowMap.enabled = !light
  renderer.shadowMap.needsUpdate = true
  for (const [i, l] of lightPool.entries()) {
    const def = pooled[i]
    if (def) { l.intensity = def.intensity; l.color.set(def.color) }
  }
  const button = $('light-mode')
  button.setAttribute('aria-pressed', String(light))
  button.title = tr(light ? 'Mode léger actif · revenir au rendu normal' : 'Activer le mode léger', light ? 'Light mode active · restore normal rendering' : 'Enable light mode')
  button.setAttribute('aria-label', button.title)
}
$('light-mode').onclick = () => {
  renderQuality.light = !renderQuality.light
  store.set('mini-shipinteriors-light', String(renderQuality.light))
  perfTime = perfFrames = fastWindows = 0
  updateLightMode()
}
updateLightMode()

function updateFpsButton() {
  const button = $('fps-view')
  button.setAttribute('aria-pressed', String(fpsWanted))
  button.title = tr(fpsWanted ? 'Vue subjective active · revenir à la vue isométrique (V)' : 'Vue subjective (V)', fpsWanted ? 'First-person view on · back to isometric view (V)' : 'First-person view (V)')
  button.setAttribute('aria-label', button.title)
}
function toggleFps() {
  fpsWanted = !fpsWanted
  store.set('mini-shipinteriors-fps', String(fpsWanted))
  updateFpsButton()
  // Le clic ou la touche qui active la vue suffit à capturer le curseur (sinon, au premier pas).
  relock = fpsWanted
  if (fpsWanted && !isoOnly() && !needsCursor() && matchMedia('(pointer: fine)').matches) lockCursor()
}
$('fps-view').onclick = () => toggleFps()
updateFpsButton()

/** Là, il faut voir la scène de haut : la vue isométrique reprend la main, même en vue subjective. */
function isoOnly(): boolean {
  // Les caméras alliées de la zone thargoïde suivent un coéquipier, de haut.
  // Caché dans un casier aussi : en vue subjective, on ne verrait que l'intérieur de la porte.
  return editing() || photo.active || !!claw || barPanel.isOpen || cinemaRoom.isOpen || mediaRoom.isOpen || !!zone.watchTarget || zone.hiding
}
/** Occupé (installé, en emote, au travail…) : en vue subjective, la caméra passe derrière le personnage. */
function busyBody(): boolean {
  return !!seating.current || player.gliding || !!working || gym.active || riding || wardrobe.isOpen || player.avatar.emoteId !== null
}
/** Passage d'une vue à l'autre : un bref fondu au noir cache la bascule de projection. */
function curtain() {
  const el = $('view-curtain')
  el.classList.remove('lift')
  void el.offsetWidth
  el.classList.add('lift')
}

// Sprint auto : évite de maintenir Maj, sans autre avantage (même vitesse, mêmes pas) ; Maj ou L3 font alors marcher.
let autoSprint = store.get('mini-shipinteriors-autosprint') === 'true'
function updateAutoSprint() {
  const button = $('auto-sprint')
  button.setAttribute('aria-pressed', String(autoSprint))
  button.title = tr(autoSprint ? 'Sprint auto actif · Maj pour marcher' : 'Activer le sprint automatique', autoSprint ? 'Auto-sprint on · Shift to walk' : 'Enable auto-sprint')
  button.setAttribute('aria-label', button.title)
}
$('auto-sprint').onclick = () => {
  autoSprint = !autoSprint
  store.set('mini-shipinteriors-autosprint', String(autoSprint))
  updateAutoSprint()
}
updateAutoSprint()

// « À propos » : comment le jeu a été fait, pour qui veut savoir. Échap le referme aussi.
function toggleAbout(open = $('about').hidden) {
  $('about').hidden = !open
  $('about-toggle').setAttribute('aria-expanded', String(open))
}
$('about-toggle').onclick = () => toggleAbout()

const raycaster = new THREE.Raycaster()
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const groundHit = new THREE.Vector3()
const pointer = new THREE.Vector2()
const canvas = renderer.domElement

function pick(e: { clientX: number; clientY: number }): { tile: Tile | null; item: Interactable | null; point: THREE.Vector3 | null } {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  raycaster.setFromCamera(pointer, activeCamera())
  const hits = raycaster.intersectObjects(deck.interactables.filter((i) => !hiddenRestrictedItem(i)).map((i) => i.object), true)
  let item: Interactable | null = null
  if (hits.length) {
    item =
      deck.interactables.find((i) => {
        let o: THREE.Object3D | null = hits[0].object
        while (o) {
          if (o === i.object) return true
          o = o.parent
        }
        return false
      }) ?? null
  }
  groundPlane.constant = -deck.y
  const p = raycaster.ray.intersectPlane(groundPlane, groundHit)
  const tile = p ? { x: Math.round(p.x), z: Math.round(p.z) } : null
  return { tile: tile && deck.map.isFloor(tile.x, tile.z) ? tile : null, item, point: item ? hits[0].point : null }
}

// Survol traité une fois par image (les souris 1000 Hz enverraient des centaines de lancers de rayon).
let pendingMove: PointerEvent | null = null
canvas.addEventListener('pointermove', (e) => {
  if (freeLook) return
  if (editing()) editor!.pointerMove(e)
  else pendingMove = e
})
function processHover() {
  if (!pendingMove) return
  const { tile, item } = pick(pendingMove)
  pendingMove = null
  canvas.style.cursor = item ? 'pointer' : 'default'
  hover.visible = !fpsShown && !!tile && deck.pathfinder.walkable(tile.x, tile.z)
  if (tile) hover.position.set(tile.x, deck.y + 0.01, tile.z)
}

// Caméra libre : clic droit ou clic molette maintenu, puis glisser. Horizontalement on tourne
// autour du personnage, verticalement on incline la vue ; avec Maj, on la fait glisser.
// R (ou les boutons de rotation) ramène la vue isométrique.
// En vue subjective, le clic gauche glissé tourne aussi le regard ; sans glisser, c'est un clic.
let freeLook: { id: number; x: number; y: number; button: number; moved: number } | null = null
canvas.addEventListener('contextmenu', (e) => e.preventDefault())
// Pas de défilement automatique au clic molette.
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 1) e.preventDefault()
})
canvas.addEventListener('pointerdown', (e) => {
  // Vue subjective à la souris : le curseur est capturé sur la mire (cf. lockCursor).
  if (fpsShown && e.pointerType === 'mouse') return
  // Au doigt, la scène entière devient le stick de caméra. Le joystick de marche capture un
  // autre pointerId : les deux gestes restent donc actifs simultanément.
  const touchLook = e.pointerType !== 'mouse' && e.button === 0 && !editing()
  if (freeLook || (e.button !== 1 && e.button !== 2 && !(e.button === 0 && fpsShown) && !touchLook)) return
  e.preventDefault()
  freeLook = { id: e.pointerId, x: e.clientX, y: e.clientY, button: e.button, moved: 0 }
  try {
    canvas.setPointerCapture(e.pointerId)
  } catch {}
  canvas.style.cursor = 'grabbing'
  hover.visible = false
})
canvas.addEventListener('pointermove', (e) => {
  if (!freeLook || e.pointerId !== freeLook.id) return
  const dx = e.clientX - freeLook.x, dy = e.clientY - freeLook.y
  freeLook.x = e.clientX
  freeLook.y = e.clientY
  freeLook.moved += Math.abs(dx) + Math.abs(dy)
  if (fpsShown) fps.look(-dx * 0.005, -dy * 0.004)
  else if (e.shiftKey) iso.pan(dx, dy, innerHeight)
  else iso.orbit(-dx * 0.008, dy * 0.006)
})
function endFreeLook(e: PointerEvent) {
  if (!freeLook || e.pointerId !== freeLook.id) return
  const tap = freeLook.button === 0 && freeLook.moved < (e.pointerType === 'mouse' ? 6 : 12)
  freeLook = null
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
  canvas.style.cursor = 'default'
  // Le clic tactile est différé au relâchement : un glissé de caméra ne donne plus en même
  // temps un ordre de marche ou d'interaction.
  if (tap && e.type === 'pointerup' && (fpsShown || e.pointerType !== 'mouse')) click(e)
}
canvas.addEventListener('pointerup', endFreeLook)
canvas.addEventListener('pointercancel', endFreeLook)
canvas.addEventListener('pointerup', (e) => {
  if (e.button === 0 && editing()) editor!.pointerUp(e)
})

// Clic en dehors du panneau d'ascenseur : il se ferme, et le clic ne fait rien d'autre.
addEventListener(
  'pointerdown',
  (e) => {
    // Les commandes tactiles pilotent les panneaux via updateGamepad ; elles ne sont pas un clic
    // « dehors » qui doit fermer le panneau avant que le bouton A/X soit lu.
    if (e.target instanceof Element && e.target.closest('#touch-pad')) return
    if (barPanel.isOpen) {
      if (!barPanel.contains(e.target)) { barPanel.close(); e.stopPropagation() }
      return
    }
    // Terminal ou classement de la zone thargoïde : un clic à côté les ferme (l'écran de fin, lui, attend son bouton).
    if (zone.panelOpen && !zone.contains(e.target) && !(e.target instanceof Element && e.target.closest('.salvage-end'))) {
      zone.closePanels()
      e.stopPropagation()
      return
    }
    const panel = sitePanel.isOpen ? sitePanel : lift.isOpen ? lift : jukebox.isOpen ? jukebox : null
    if (!panel || panel.contains(e.target)) return
    panel.close()
    e.stopPropagation()
  },
  { capture: true },
)

canvas.addEventListener('pointerdown', (e) => {
  if (fpsShown && e.pointerType === 'mouse') {
    // Premier clic : le curseur est capturé ; ensuite, le clic gauche vise ce qui est sous la mire.
    if (!cursorLocked()) lockCursor()
    else if (e.button === 0) click(e, screenCenter())
    return
  }
  // Vue subjective au doigt : le clic part au relâchement, s'il n'a pas servi à tourner le regard.
  if (e.button === 0 && !fpsShown && e.pointerType === 'mouse') click(e)
})

// Vue subjective à la souris : le curseur disparaît, bloqué sur la mire, et la souris tourne
// le regard sans limite. Échap le libère (le navigateur s'en charge) ; un panneau, le chat ou
// le retour à la vue isométrique aussi (cf. frame). Curseur visible, la vue est figée : on s'en
// sert pour cliquer, pas pour viser.
const cursorLocked = () => document.pointerLockElement === canvas
const screenCenter = () => ({ clientX: innerWidth / 2, clientY: innerHeight / 2 })
/** Refus de capture d'affilée : au-delà de deux, le navigateur ne la permet pas (cf. freeAim). */
let lockRefusals = 0
/** Instant de la dernière capture : les premiers mouvements rapportés sont parfois un saut. */
let lockedAt = 0
function lockCursor() {
  const refused = () => lockRefusals++
  try {
    ;(canvas.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(refused)
  } catch {
    refused()
  }
}
document.addEventListener('pointerlockerror', () => lockRefusals++)
function unlockCursor() {
  if (cursorLocked()) document.exitPointerLock()
}
/** Ce qui se manipule au curseur : on le rend. */
function needsCursor(): boolean {
  return chat.typing || sitePanel.isOpen || lift.isOpen || jukebox.isOpen || wardrobe.isOpen || inviteMenu.isOpen || !!arcade?.isOpen || boardGames.isOpen || gameEmbed.isOpen || !$('help').hidden || !$('about').hidden || zone.panelOpen || !reactionsPanel.hidden
}
document.addEventListener('pointerlockchange', () => {
  document.body.classList.toggle('fps-locked', cursorLocked())
  if (!cursorLocked()) return
  relock = false
  lockRefusals = 0
  lockedAt = performance.now()
})
document.addEventListener('mousemove', (e) => {
  if (!cursorLocked() || !fpsShown) return
  // Juste après la capture, ou d'un coup énorme : le navigateur rapporte le trajet du curseur
  // jusqu'au centre (ou un sursaut), pas un geste. Sans ce filtre, la vue partait d'un bond.
  if (performance.now() - lockedAt < 120 || Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return
  fps.look(-e.movementX * mouseLook(), -e.movementY * mouseLook())
})

// Sensibilité de la souris en vue subjective, réglée dans l'aide : curseur capturé ou libre.
const sensitivityInput = $<HTMLInputElement>('mouse-sensitivity')
let mouseSensitivity = THREE.MathUtils.clamp(Number(store.get('mini-shipinteriors-mouse-sensitivity')) || 1, 0.2, 3)
/** Angle (radians) par pixel de souris. */
const mouseLook = () => 0.0025 * mouseSensitivity
function updateSensitivity() {
  sensitivityInput.value = String(mouseSensitivity)
  const x = mouseSensitivity.toFixed(1)
  $('mouse-sensitivity-value').textContent = `${tr(x.replace('.', ','), x)}×`
}
sensitivityInput.addEventListener('input', () => {
  mouseSensitivity = Number(sensitivityInput.value)
  store.set('mini-shipinteriors-mouse-sensitivity', String(mouseSensitivity))
  updateSensitivity()
})
sensitivityInput.addEventListener('keydown', (e) => e.stopPropagation())
updateSensitivity()

// Secours, quand le navigateur refuse de capturer le curseur : le regard suit la souris sans
// bouton à tenir, et tourne tant que le curseur reste près d'un bord de l'écran. Sinon, curseur
// libre, la vue ne bouge pas (on va cliquer quelque chose).
const lockUnavailable = () => !('requestPointerLock' in canvas) || lockRefusals >= 2
let freeAim: { x: number; y: number } | null = null
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || cursorLocked() || !fpsShown || needsCursor() || !lockUnavailable()) {
    freeAim = null
    return
  }
  if (freeAim) fps.look(-(e.clientX - freeAim.x) * mouseLook(), -(e.clientY - freeAim.y) * mouseLook())
  freeAim = { x: e.clientX, y: e.clientY }
})
canvas.addEventListener('pointerleave', () => (freeAim = null))
/** Bord de l'écran où le regard tourne tout seul (part de la demi-largeur ou de la demi-hauteur). */
const EDGE = 0.15
function edgeLook(dt: number) {
  if (!freeAim || cursorLocked() || needsCursor() || !lockUnavailable()) return
  const edge = (u: number) => Math.sign(u) * THREE.MathUtils.clamp((Math.abs(u) - (1 - EDGE)) / EDGE, 0, 1)
  const ex = edge((freeAim.x / innerWidth) * 2 - 1), ey = edge((freeAim.y / innerHeight) * 2 - 1)
  if (ex || ey) fps.look(-ex * dt * 2.4, -ey * dt * 1.2)
}
// Le curseur rendu par un panneau (ou pas encore pris) se reprend au clic qui ferme le panneau,
// ou dès qu'on se remet à marcher ; Échap, lui, le laisse libre jusqu'au prochain clic sur la scène.
let relock = fpsWanted
const mayRelock = () => relock && fpsShown && !cursorLocked() && !needsCursor() && matchMedia('(pointer: fine)').matches
addEventListener('keydown', (e) => {
  if (MOVE_KEYS.has(e.code) && mayRelock()) lockCursor()
})
// Phase de bouillonnement : le bouton « Fermer » a déjà fermé son panneau.
addEventListener('click', () => {
  if (mayRelock()) lockCursor()
})
// Curseur rendu pour une interface : la mire et son aide s'effacent.
const syncCursorUi = () => document.body.classList.toggle('fps-cursor-ui', fpsShown && needsCursor())
const crosshair = $('fps-crosshair')
// Mini-carte de la vue subjective ; pas dans la baie infestée (elle en trahirait le labyrinthe).
const minimapEl = $<HTMLCanvasElement>('minimap')
const minimap = new Minimap(minimapEl)
function drawMinimap() {
  const shown = fpsShown && viewDeck === deck && !deck.def.zone
  if (minimapEl.hidden !== !shown) minimapEl.hidden = !shown
  if (!shown) return
  const others = [...remotes.values()].filter((r) => r.group.visible && r.level === deck.def.id).map((r) => r.group.position)
  minimap.draw(deck.map, deck.def.id, player.position.x, player.position.z, fps.yaw, liftTile, others, timer.getElapsed())
}
/** Bas des invites et bulles posées à l'écran en vue subjective : au-dessus de la barre d'emotes. */
const fpsBottom = () => innerHeight - 130

function click(e: PointerEvent, at: { clientX: number; clientY: number } = e) {
  // Caché dans un casier, capturé, derrière les caméras : le clic ne fait rien.
  if (riding || gym.active || zone.frozen) return
  if (editing()) {
    // Objet glissé jusque sous le catalogue : il le relâche quand même dans le mode aménagement.
    try {
      canvas.setPointerCapture(e.pointerId)
    } catch {}
    return editor!.pointerDown(e)
  }
  if (wardrobe.isOpen) return wardrobe.close(false)
  stopWork()
  const { tile, item, point } = pick(at)
  // Mode photo : un clic place le personnage, sans rien déclencher (une borne s'ouvrirait par-dessus).
  if (photo.active) {
    if (tile && !seating.current) goTo(tile)
    return
  }
  // Installé sur un meuble : un clic sur lui relève le personnage, un clic ailleurs aussi, puis il y va.
  const seat = seating.current
  if (seat) {
    if (!seating.settled) return
    if (item === seat.item) return seating.stand()
    return seating.stand(() => (item ? goInteract(item, point) : tile && goTo(tile)))
  }
  if (item) return goInteract(item, point)
  if (tile) goTo(tile)
}

function playerTile(): Tile {
  return { x: Math.round(player.position.x), z: Math.round(player.position.z) }
}

function goTo(tile: Tile, onArrive?: () => void): boolean {
  // Chemin qui contourne les meubles ; à défaut, on tente quand même (au pire, on s'arrête contre l'obstacle).
  const path = deck.pathfinder.find(playerTile(), tile) ?? deck.pathfinder.find(playerTile(), tile, false)
  if (!path) return false
  player.setPath(path.slice(1).map((t) => ({ x: t.x, z: t.z })))
  if (!player.moving) player.setPath([{ x: tile.x, z: tile.z }])
  player.onArrive = () => {
    marker.visible = false
    onArrive?.()
  }
  marker.position.set(tile.x, deck.y + 0.02, tile.z)
  marker.visible = true
  return true
}

/**
 * Marche jusqu'à la tuile libre la plus proche de l'objet, puis interagit. Un meuble où l'on
 * s'installe a ses propres abords : on prend la place la plus proche de `point` (le clic).
 */
function goInteract(item: Interactable, point?: THREE.Vector3 | null) {
  if (item.seats) return sitOn(item, point ?? undefined)
  if (distanceTo(item) < INTERACT_RANGE && inSight(item)) return interactWith(item)
  const start = playerTile()
  // Tuile libre la plus proche (en chemin) : d'abord en contournant les meubles, sinon sans ;
  // d'abord à portée de main, sinon un peu plus loin (le centre d'un grand lit est loin de ses bords).
  for (const strict of [true, false]) {
    for (const range of [INTERACT_RANGE, INTERACT_RANGE + 0.45]) {
      const candidates: { tile: Tile; len: number }[] = []
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          const t = { x: Math.round(item.position.x) + dx, z: Math.round(item.position.z) + dz }
          if (!deck.pathfinder.walkable(t.x, t.z)) continue
          if (Math.hypot(t.x - item.position.x, t.z - item.position.z) > range) continue
          // À portée, mais derrière le mur : on n'y interagirait pas.
          if (!lineOfSight(deck.map, t, item.position)) continue
          const path = deck.pathfinder.find(start, t, strict)
          if (path) candidates.push({ tile: t, len: path.length })
        }
      }
      candidates.sort((a, b) => a.len - b.len)
      if (candidates.length) return goTo(candidates[0].tile, () => interactWith(item))
    }
  }
}

// ------------------------------------------------------------------ interactions

const INTERACT_RANGE = 1.45

function distanceTo(item: Interactable): number {
  return Math.hypot(player.position.x - item.position.x, player.position.z - item.position.z)
}

/** Rien ne sépare le joueur de l'objet : ni mur ni cloison (cf. shared/sight.js). */
function inSight(item: Interactable): boolean {
  return lineOfSight(deck.map, player.position, item.position)
}

function nearestInteractable(): Interactable | null {
  // Pendant une révision du Krait, le poste de l'étape passe avant les meubles voisins (une cale
  // du train est plus près du chariot à outils que le chariot lui-même, d'où l'on se tient).
  const job = deck === holdDeck ? hangar.target : null
  if (job && distanceTo(job) < INTERACT_RANGE && inSight(job)) return job
  let best: Interactable | null = null
  let bestD = INTERACT_RANGE
  for (const i of deck.interactables) {
    if (hiddenRestrictedItem(i)) continue
    const d = distanceTo(i)
    if (d < bestD && inSight(i)) {
      best = i
      bestD = d
    }
  }
  return best
}

function hiddenRestrictedItem(item: Interactable): boolean {
  const room = deck.map.room(Math.round(item.position.x), Math.round(item.position.z))
  return (!ljpcMember && deck.def.id === 0 && room === 'l')
    || (!voieAdept && deck.def.id === -1 && room === 'v' && item !== voieDoorItem)
}

function tryInteract() {
  if (gym.active || riding || sitePanel.isOpen || lift.isOpen || wardrobe.isOpen || barPanel.isOpen || gameEmbed.isOpen || mediaRoom.isOpen || cinemaRoom.isOpen || editing() || zone.frozen || zone.panelOpen) return
  const item = nearestInteractable()
  if (item) interactWith(item)
}

function interactWith(item: Interactable) {
  if (item.seats) return sitOn(item)
  player.lookAt(item.position)
  if (item.furniture?.model === 'galaxy-map') return gameEmbed.open('edgis')
  if (deck.def.id === 1) {
    if (item.furniture?.model === 'podcast-console' || item.furniture?.model === 'podcast-poster') return mediaRoom.open()
    if (item.furniture?.model === 'cinema-screen') return void cinemaRoom.open(false)
  }
  if (item.onInteract) return item.onInteract()
  player.interact()
  net.sendEmote('interact')
  if (item === voieDoorItem && !voieAdept) return dialog.showCipher()
  const text = typeof item.text === 'function' ? item.text() : item.text
  if (Array.isArray(text)) dialog.show(text[Math.floor(Math.random() * text.length)])
  else if (text) dialog.show(text)
}

// ------------------------------------------------------------------ s'installer

/**
 * Position, animation et pose du joueur, pour les autres (10 fois par seconde au plus, sauf
 * `now`). Pendant qu'il s'installe ou se relève, on annonce déjà où il arrive : les autres l'y
 * voient glisser d'un seul mouvement, et la place est prise dès le départ.
 */
function sendState(now = false) {
  const at = player.glideEnd ?? { x: player.position.x, z: player.position.z, yaw: player.heading }
  net.sendState(
    { x: at.x, z: at.z, yaw: at.yaw, level: deck.def.id, anim: player.avatar.locomotion, pose: seating.pose ?? undefined, py: seating.height },
    now ? Infinity : performance.now(),
  )
}

/**
 * Retient pour cet onglet où l'on se tient, qu'un rechargement nous y ramène (cf. resumePoint).
 * Assis, en trajet (ascenseur, fondu, toilettes), dans la zone thargoïde ou sur la base au sol :
 * on garde la dernière place à bord.
 */
function saveWhere() {
  if (riding || seating.current || deck.def.zone || deck.def.ground) return
  const at = player.glideEnd ?? { x: player.position.x, z: player.position.z, yaw: player.heading }
  try {
    sessionStorage.setItem(WHERE_KEY, JSON.stringify({ level: deck.def.id, x: at.x, z: at.z, yaw: at.yaw }))
  } catch {}
}
setInterval(saveWhere, 1000)
addEventListener('pagehide', saveWhere)

/** S'installer sur un meuble (la place libre la plus proche de `near`, là où l'on a cliqué). */
function sitOn(item: Interactable, near?: { x: number; z: number }) {
  const result = seating.take(item, near)
  if (result === 'full') dialog.show(tr('Toutes les places sont prises.', 'All the seats are taken.'))
  else if (result === 'blocked') dialog.show(tr('Impossible d\'y accéder : quelque chose bloque le passage.', 'Can\'t get there: something is in the way.'))
}

/**
 * Marche jusqu'à l'abord d'une place : tout droit s'il n'y a rien entre les deux, sinon par les
 * tuiles, jusqu'à la plus proche de l'abord, puis l'abord lui-même.
 */
function walkTo(to: { x: number; z: number }, arrived: () => void): boolean {
  const here = player.position
  if (Math.hypot(to.x - here.x, to.z - here.z) < 0.05) {
    arrived()
    return true
  }
  let points: { x: number; z: number }[] = [to]
  if (!Seating.straight(here, to, deck)) {
    const start = playerTile()
    const room = deck.map.room(Math.round(to.x), Math.round(to.z))
    const candidates: { path: Tile[]; score: number }[] = []
    for (const strict of [true, false]) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const t = { x: Math.round(to.x) + dx, z: Math.round(to.z) + dz }
          // Une tuile de la pièce voisine est à côté, mais derrière le mur.
          if (!deck.pathfinder.walkable(t.x, t.z) || deck.map.room(t.x, t.z) !== room || Math.hypot(t.x - to.x, t.z - to.z) > 1.2) continue
          const path = deck.pathfinder.find(start, t, strict)
          if (path) candidates.push({ path, score: path.length + Math.hypot(t.x - to.x, t.z - to.z) * 3 })
        }
      }
      if (candidates.length) break
    }
    if (!candidates.length) return false
    const best = candidates.reduce((a, b) => (b.score < a.score ? b : a))
    points = [...best.path.slice(1).map((t) => ({ x: t.x, z: t.z })), to]
  }
  player.setPath(points)
  player.onArrive = () => {
    marker.visible = false
    arrived()
  }
  marker.position.set(to.x, deck.y + 0.02, to.z)
  marker.visible = true
  return true
}

/**
 * Installé : ce que fait le meuble (la pince se pilote, le sac encaisse, les platines jouent
 * quelques mesures), ou sa phrase.
 */
function seated(seat: Seated) {
  const { item } = seat
  bindPose()
  // Passé en mode photo pendant qu'on s'installait : on tient la pose, sans rien lancer.
  if (photo.active) return
  if (deck.def.id === -1 && item.furniture?.model === 'bar-stool') return barPanel.open()
  if (seat.spot.pose === 'claw' && item.control?.kind === 'claw') return startClaw(seat, item.control)
  const game = arcadeGame(seat)
  if (game) return void openArcade(seat, game)
  if (seat.item.furniture?.model === 'bar-table' && seat.item.furniture.label === 'galactic-clash') return gameEmbed.open('cards')
  if (seat.item.furniture?.model === 'pinball' && deck.def.id === -1) return gameEmbed.open('cqc')
  if (deck.def.id === 1 && deck.map.room(Math.round(item.position.x), Math.round(item.position.z)) === 'o') return mediaRoom.open()
  if (deck.def.id === 1 && item.furniture?.model === 'cinema-row') return void cinemaRoom.open(false)
  if (deck.def.id === 1 && item.furniture?.model === 'projection-chair') return void cinemaRoom.open(true)
  const board = boardGame(seat)
  if (board) return boardGames.open(board.game, board.table)
  if (kitchen.canEat(seat)) return kitchen.sat()
  if (item.onInteract) return item.onInteract()
  showText(item.text)
}

/** Pose prise ou quittée : les autres le voient tout de suite ; la pince et le sac, eux, sont lâchés. */
function poseChanged() {
  if (!seating.current) {
    gym.stop()
    stopClaw()
    arcade?.close()
    boardGames.close(false)
    gameEmbed.close()
    mediaRoom.close()
    cinemaRoom.close()
    player.avatar.onPoseStep = undefined
  }
  sendState(true)
}

/** À chaque coup de poing, le sac de frappe encaisse (un peu après le début du geste). */
function bindPose() {
  const seat = seating.current
  const bag = seat?.item.control?.kind === 'bag' ? seat.item.control : null
  player.avatar.onPoseStep = bag
    ? () => {
        setTimeout(() => {
          if (seating.current !== seat) return
          bag.hit()
          sound.thud(new THREE.Vector3(seat!.item.position.x, deck.y + 0.6, seat!.item.position.z))
        }, 180)
      }
    : undefined
}

/**
 * Invite au-dessus du personnage installé : se relever, et ce que permet sa place (Espace).
 * Aucune dans les rangées du cinéma : elle cacherait l'écran (E et Espace marchent toujours).
 */
function seatPrompt(seat: Seated): { main: string; space?: string } | null {
  // Aux commandes d'un Krait (au hangar, ou sur la base au sol) : les réacteurs, puis le décollage.
  if (hangar.aboardKrait) return { main: tr('Se lever', 'Stand up'), space: hangar.engines ? tr('Décoller', 'Take off') : tr('Démarrer les réacteurs', 'Start the thrusters') }
  if (groundBase.aboardKrait) return { main: tr('Se lever', 'Stand up'), space: groundBase.engines ? tr('Décoller', 'Take off') : tr('Démarrer les réacteurs', 'Start the thrusters') }
  if (claw) return { main: tr('Quitter', 'Leave'), space: claw.control.busy ? undefined : tr('Lâcher la pince', 'Drop the claw') }
  if (canJump(seat)) return { main: tr('Se lever', 'Stand up'), space: jumping ? undefined : tr('Saut FSD', 'FSD jump') }
  // Devant une borne fermée (on sort du mode photo, ou elle n'a pas pu se charger).
  if (arcadeGame(seat)) return { main: tr('Se lever', 'Stand up'), space: tr('Jouer', 'Play') }
  if (seat.item.furniture?.model === 'bar-table' && seat.item.furniture.label === 'galactic-clash') return { main: tr('Se lever', 'Stand up'), space: tr('Jouer', 'Play') }
  if (seat.item.furniture?.model === 'pinball' && deck.def.id === -1) return { main: tr('Se lever', 'Stand up'), space: tr('Jouer', 'Play') }
  if (deck.def.id === 1 && deck.map.room(Math.round(seat.item.position.x), Math.round(seat.item.position.z)) === 'o') return { main: tr('Se lever', 'Stand up'), space: tr('Écouter', 'Listen') }
  if (deck.def.id === 1 && seat.item.furniture?.model === 'cinema-row') return null
  if (deck.def.id === 1 && seat.item.furniture?.model === 'projection-chair') return { main: tr('Se lever', 'Stand up'), space: tr('Régie', 'Controls') }
  if (seat.item.furniture?.model === 'bar-stool' && deck.def.id === -1) return { main: tr('Se lever', 'Stand up'), space: tr('Parler à Jacques', 'Talk to Jacques') }
  if (boardGame(seat)) return { main: tr('Se lever', 'Stand up'), space: tr('Jouer', 'Play') }
  if (infirmary.canCall(seat)) return { main: tr('Se lever', 'Stand up'), space: infirmary.busy ? undefined : tr(`Appeler ${NURSE}`, `Call ${NURSE}`) }
  if (kitchen.canEat(seat)) return { main: tr('Se lever', 'Stand up'), space: kitchen.eating ? undefined : tr('Manger', 'Eat') }
  return { main: tr('Se lever', 'Stand up') }
}

/** Espace, installé sur un meuble. */
function seatAction(seat: Seated) {
  if (hangar.aboardKrait) return hangar.engines ? void groundBase.fly(true) : hangar.toggleEngines()
  if (groundBase.aboardKrait) return groundBase.seatAction()
  if (claw) return dropClaw()
  if (canJump(seat)) return void fsdJump()
  const game = arcadeGame(seat)
  if (game) void openArcade(seat, game)
  if (seat.item.furniture?.model === 'bar-table' && seat.item.furniture.label === 'galactic-clash') return gameEmbed.open('cards')
  if (seat.item.furniture?.model === 'pinball' && deck.def.id === -1) return gameEmbed.open('cqc')
  if (deck.def.id === 1 && deck.map.room(Math.round(seat.item.position.x), Math.round(seat.item.position.z)) === 'o') return mediaRoom.open()
  if (deck.def.id === 1 && seat.item.furniture?.model === 'cinema-row') return void cinemaRoom.open(false)
  if (deck.def.id === 1 && seat.item.furniture?.model === 'projection-chair') return void cinemaRoom.open(true)
  if (seat.item.furniture?.model === 'bar-stool' && deck.def.id === -1) return barPanel.open()
  const board = boardGame(seat)
  if (board) boardGames.open(board.game, board.table)
  if (infirmary.canCall(seat)) infirmary.call()
  if (kitchen.canEat(seat)) kitchen.eat()
}

// ------------------------------------------------------------------ bornes d'arcade

/** La borne en grand (cf. arcade/cabinet.ts) : chargée à la première partie. */
let arcade: ArcadeCabinet | null = null
let arcadeLoading: Promise<void> | null = null

/** Jeu de la borne où l'on se tient, s'il est jouable. */
function arcadeGame(seat: Seated): GameId | null {
  const game = seat.item.furniture?.label
  return seat.spot.pose === 'arcade' && isGameId(game) ? game : null
}

function boardGame(seat: Seated): { game: BoardGameId; table: string } | null {
  if (seat.spot.pose !== 'sit') return null
  const model = seat.item.furniture?.model
  if (model === 'holo-draughts') return { game: 'draughts', table: 'draughts' }
  if (model === 'guardian-connect') return { game: 'guardian-connect', table: 'guardian-connect' }
  if (model === 'imperial-chess') return { game: 'imperial-chess', table: 'imperial-chess' }
  return null
}

async function openArcade(seat: Seated, game: GameId) {
  if (arcade?.isOpen) return
  arcadeLoading ??= import('./arcade/cabinet').then(({ ArcadeCabinet }) => {
    arcade = new ArcadeCabinet({ sound, net, linked: () => linked, onCredits: (credits) => wallet.arcade(credits) })
    // On quitte la borne : on s'en écarte.
    arcade.onClose = () => {
      if (seating.current?.spot.pose === 'arcade') seating.stand()
    }
  })
  try {
    await arcadeLoading
  } catch {
    // Réseau coupé, ou nouvelle version du jeu en ligne. Chrome garde l'échec en mémoire
    // (même module, même échec) : seul un rechargement de la page répare à coup sûr.
    arcadeLoading = null
    if (seating.current === seat) dialog.show(tr('La borne ne répond pas : rechargez la page pour y jouer.', 'The cabinet isn\'t responding: reload the page to play.'))
    return
  }
  // Relevé (ou parti) pendant le chargement.
  if (seating.current !== seat) return
  keys.clear()
  arcade!.open(game)
}

// ------------------------------------------------------------------ pince à peluches

/** Partie de pince en cours : la machine, son orientation, le cadrage, le zoom d'avant. */
let claw: { control: ClawControl; rot: number; focus: THREE.Vector3; zoom: number; heading: number } | null = null
const pickText = (list: string[]) => list[Math.floor(Math.random() * list.length)]

function startClaw(seat: Seated, control: ClawControl) {
  control.take(true)
  const p = seat.item.position
  claw = { control, rot: seat.spot.yaw - Math.PI, focus: new THREE.Vector3(p.x, deck.y, p.z), zoom: iso.zoomLevel, heading: iso.heading }
  // La caméra passe derrière le joueur et plonge : on voit la pince à travers la vitre, par-dessus
  // sa tête, et non le dos de la machine.
  iso.turnTo(seat.spot.yaw + Math.PI)
  iso.setRestElevation(0.95)
  iso.zoomTo(1.7)
  sound.jingle('coin')
  dialog.show(
    tr(
      'PINCE À COMÈTE · 1 CR la partie. Flèches : déplacer la pince au-dessus de la Comète assise sur le Thargoïde. Espace : la lâcher.',
      'COMÈTE CLAW · 1 CR a go. Arrow keys: move the claw over the Comète sitting on the Thargoid. Space: drop it.',
    ),
  )
}

function stopClaw() {
  if (!claw) return
  claw.control.take(false)
  iso.setRestElevation(null)
  iso.zoomTo(claw.zoom)
  iso.turnTo(claw.heading, false)
  claw = null
}

function dropClaw() {
  if (!claw?.control.drop(clawResult)) return
  sound.jingle('motor')
}

function clawResult(result: ClawResult) {
  if (result === 'win') {
    const wins = Number(store.get('claw-wins') ?? 0) + 1
    store.set('claw-wins', String(wins))
    sound.jingle('win')
    bubbles.emote('me', 'confetti')
    const count = wins === 1 ? tr('Votre toute première !', 'Your very first!') : tr(`Peluches gagnées : ${wins}.`, `Plushies won: ${wins}.`)
    dialog.show(tr(`Gagné ! Une Comète en peluche tombe dans la trappe. ${count}`, `You win! A plush Comète drops into the prize chute. ${count}`))
    return
  }
  sound.jingle('lose')
  dialog.show(
    result === 'slip'
      ? pickText([
          tr('La pince attrape la Comète… et la lâche en remontant. Comme d\'habitude.', 'The claw grabs the Comète… and drops it on the way up. As usual.'),
          tr('Presque ! La peluche glisse entre les griffes. La vraie Comète ricane.', 'So close! The plush slips through the prongs. The real Comète sniggers.'),
        ])
      : pickText([
          tr('La pince se referme sur du vide. Visez la Comète assise sur le Thargoïde.', 'The claw closes on thin air. Aim for the Comète sitting on the Thargoid.'),
          tr('Raté : la pince ramène un Thargoïde en peluche… qui retombe aussitôt.', 'Missed: the claw hauls up a plush Thargoid… which falls straight back.'),
        ]),
  )
}

// ------------------------------------------------------------------ studio de Radio Dangereuse

/** Quelqu'un est-il installé à un micro du studio (pièce `s` du pont supérieur) ? */
function studioLive(): boolean {
  const upper = deckById(1)
  const inStudio = (x: number, z: number) => upper.map.room(Math.round(x), Math.round(z)) === 's'
  const seat = seating.current
  if (seat && deck === upper && inStudio(seat.spot.x, seat.spot.z)) return true
  for (const r of remotes.values()) if (r.level === 1 && r.pose === 'sit' && inStudio(r.target.x, r.target.z)) return true
  return false
}

// ------------------------------------------------------------------ saut FSD

let jumping = false
/** Aspirés par les toilettes, déjà dans la cale avant la fin du saut (cf. flushToHold). */
let flushLanded = false

/** Le saut n'est possible que depuis le vrai poste de pilotage (pas d'un siège recyclé en fauteuil). */
function canJump(seat: Seated): boolean {
  return deck.def.id === 0 && seat.item.furniture?.model === 'pilot-seat'
}

function flash(soft = false) {
  const el = $('flash')
  el.classList.toggle('soft', soft)
  el.classList.remove('on')
  void el.offsetWidth
  el.classList.add('on')
}

/**
 * Le pilote demande un saut FSD : le relais choisit la destination et l'annonce à tout le bord
 * (cf. playJump) ; sans relais, on part seul, au hasard.
 */
function fsdJump() {
  if (jumping) return
  if (net.online) net.sendJump()
  else void playJump(nextSystem(systemView.id), null)
}

/**
 * Saut FSD vers `system`, vécu par tout le bord : charge du réacteur, compte à rebours,
 * traversée (étoiles étirées, le décor s'efface), arrivée dans le nouveau système.
 * @param by nom du pilote, si ce n'est pas nous
 */
async function playJump(system: SystemId, by: string | null) {
  if (jumping) return
  jumping = true
  const { name, arrival } = SYSTEMS[system]
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
  sound.fsd(JUMP_CHARGE, JUMP_TRAVEL)
  dialog.show(
    by
      ? tr(`${by} lance le saut FSD vers ${name}. Chargement du réacteur…`, `${by} is jumping to ${name}. Charging frame shift drive…`)
      : tr(`Saut FSD vers ${name}. Chargement du réacteur…`, `FSD jump to ${name}. Charging frame shift drive…`),
  )
  iso.shake(0.02)
  await wait(JUMP_CHARGE * 1000 - 2400)
  for (const n of [3, 2, 1]) {
    dialog.show(`${n}…`)
    iso.shake(0.03 + (3 - n) * 0.02)
    await wait(800)
  }
  flash()
  stars.warp(55)
  systemView.hide(true)
  iso.shake(0.16)
  dialog.show(tr('Saut !', 'Jump!'))
  flushCrew()
  await wait(JUMP_TRAVEL * 1000)
  stars.warp(1)
  systemView.set(system)
  systemView.hide(false)
  flash(true)
  dialog.show(flushLanded
    ? tr(`Arrivée : ${name}… et vous, dans la cale. ${FLUSH_MORAL}`, `Arrived: ${name}… and you, in the hold. ${FLUSH_MORAL}`)
    : tr(`Arrivée : ${name}. ${arrival}`, `Arrived: ${name}. ${arrival}`))
  flushLanded = false
  jumping = false
}

// ------------------------------------------------------------------ toilettes à dépression

const FLUSH_MORAL = tr('Les toilettes à dépression n\'aiment pas les sauts FSD : c\'était pourtant écrit dessus.', 'Vacuum toilets don\'t like FSD jumps: it said so right on the lid.')

/** Assis sur des toilettes du pont supérieur (les nôtres, ou celles des quartiers) ? */
const onToilet = (seat: Seated | null) => !!seat && deck.def.id === 1 && seat.item.furniture?.model === 'toilet'

/**
 * Au moment du saut, les toilettes du pont supérieur aspirent leurs occupants (« Ne pas utiliser
 * pendant un saut FSD ») : nous, qui retombons dans la cale, et les autres joueurs que l'on voit
 * assis dessus (leur propre client les y envoie).
 */
function flushCrew() {
  const seat = seating.current
  if (onToilet(seat) && !riding && !photo.active && !editing()) void flushToHold(seat!)
  if (deck.def.id !== 1) return
  const toilets = deck.interactables.filter((it) => it.furniture?.model === 'toilet')
  for (const r of remotes.values()) {
    if (!r.avatar || !r.group.visible || r.level !== 1 || r.pose !== 'sit') continue
    const on = toilets.some((it) => it.seats?.(r.target).some((s) => Math.hypot(s.x - r.target.x, s.z - r.target.z) < 0.25))
    if (!on) continue
    const bowl = new THREE.Vector3(r.target.x, deck.y + 0.25, r.target.z)
    flushes.start(r.avatar.root, bowl, () => r.level !== 1)
    sound.flush(bowl)
    chat.add('system', tr(`Les toilettes à dépression ont aspiré ${r.name} en plein saut FSD. Direction : la cale.`, `The vacuum toilet sucked ${r.name} down mid-jump. Next stop: the hold.`))
  }
}

/** Aspirés par la cuvette, on tourne, on rétrécit, et l'on retombe dans la cale, juste en dessous. */
async function flushToHold(seat: Seated) {
  riding = true
  player.cancelPath()
  marker.visible = false
  lift.close()
  jukebox.close()
  const bowl = new THREE.Vector3(seat.spot.x, deck.y + 0.25, seat.spot.z)
  sound.flush(bowl)
  await new Promise<void>((done) => flushes.start(player.avatar.root, bowl, () => deck.def.id === -1, done))
  await fadeScreen(true)
  // Aspirés chez un autre : la visite s'arrête là.
  if (visiting) {
    net.sendVisit(null)
    leaveVisit()
  }
  flushes.reset(player.avatar.root)
  const hold = deckById(-1)
  setDeck(hold)
  const at = landingSpot(hold, seat.spot.x, seat.spot.z)
  player.position.set(at.x, hold.y, at.z)
  iso.snapTo(player.position)
  sendState(true)
  flushes.drop(player.root, player.avatar.root, hold.y, () => {
    sound.thud(player.position.clone())
    iso.shake(0.05)
    // Sonné, par terre : le moindre pas le relève.
    player.avatar.playEmote('dodo')
    net.sendEmote('dodo')
    riding = false
    // Arrivés avant la fin du saut, la morale vient avec l'arrivée ; sinon, tout de suite.
    if (jumping) flushLanded = true
    else dialog.show(tr(`Vous voilà dans la cale. ${FLUSH_MORAL}`, `Here you are, in the hold. ${FLUSH_MORAL}`))
  })
  await fadeScreen(false)
}

/**
 * Où l'on tombe dans la cale : à la verticale de la cuvette si le sol y est libre, sinon au centre
 * de la tuile libre la plus proche (jamais dans une pièce fermée, ni au sanctuaire de la Voie).
 */
function landingSpot(hold: Deck, x: number, z: number): { x: number; z: number } {
  const open = (tx: number, tz: number) => {
    const room = hold.map.room(tx, tz)
    return !!room && room !== 'v' && hold.def.closed?.[room] === undefined && hold.pathfinder.walkable(tx, tz)
  }
  if (open(Math.round(x), Math.round(z)) && !overlapsAny({ x, z }, 0.2, hold.colliders)) return { x, z }
  let best: { x: number; z: number } | null = null
  for (let tz = 0; tz < hold.map.height; tz++) {
    for (let tx = 0; tx < hold.map.width; tx++) {
      if (open(tx, tz) && (!best || Math.hypot(tx - x, tz - z) < Math.hypot(best.x - x, best.z - z))) best = { x: tx, z: tz }
    }
  }
  return best ?? { x: LIFT.x, z: LIFT.z }
}

// ------------------------------------------------------------------ tâches de bord

/*
 * Tâches de bord (cf. economy/tasks.ts) : on s'approche d'une tâche, `E` ou un clic, et le
 * personnage s'y met pendant quelques secondes ; le moindre pas l'interrompt. Réglée, la tâche
 * disparaît pour soi, et le site la paie (un invité n'est pas payé).
 */
const board = new TaskBoard(decks, wallet)
// Le site a répondu (tâches déjà réglées ailleurs) : on met les ponts à jour.
wallet.subscribe(() => board.refresh())
const progressEl = $('task-progress')
const progressFill = $('task-progress-fill')

/**
 * Un geste de quelques secondes, jauge au-dessus : régler une tâche de bord, ou une étape d'une
 * commande du chef (cf. kitchen.ts).
 */
interface WorkJob {
  /** Où l'on travaille, au sol (repère du pont). */
  at: THREE.Vector3
  deck: Deck
  duration: number
  label: string
  sound: WorkSound
  /** Faux : ce qu'on faisait a disparu (tâche réglée ailleurs, commande abandonnée), le geste s'arrête. */
  alive: () => boolean
  finish: () => void
  /** Le geste s'arrête, fini ou non. */
  stopped?: () => void
  /**
   * Assis (manger à table, cf. kitchen.ts) : se relever arrête le geste, au lieu de l'interdire ;
   * on ne se tourne pas, et le geste n'est pas celui des mains (kitchen.ts anime le bras).
   */
  seated?: boolean
  /** Temps entre deux bruits du geste (0,65 s par défaut). */
  every?: number
  /** À chaque image : où en est le geste (0 à 1). */
  progress?: (f: number) => void
}
/** Geste en cours, où il en est, et quand vient le prochain mouvement. */
let working: (WorkJob & { t: number; next: number }) | null = null

function startWork(job: WorkJob): boolean {
  if (working || riding || photo.active || editing()) return false
  player.cancelPath()
  marker.visible = false
  if (!job.seated) player.lookAt(job.at)
  working = { ...job, t: 0, next: 0 }
  $('task-progress-label').textContent = job.label
  progressFill.style.width = '0'
  progressEl.hidden = false
  return true
}

board.onInteract = (task) => {
  const { id } = task.spot
  const info = TASK_INFO[task.spot.task]
  const job = { at: task.item.position, deck: task.deck, duration: taskOf(task.spot).duration, label: info.doing, sound: info.sound }
  if (startWork({ ...job, alive: () => board.live.has(id), finish: () => void finishTask(task), stopped: () => board.pin(null) })) board.pin(id)
}

function stopWork() {
  const w = working
  if (!w) return
  working = null
  progressEl.hidden = true
  w.stopped?.()
}

/** Le geste avance (à chaque image) : le personnage s'affaire, la jauge se remplit. */
function workStep(dt: number) {
  const w = working
  if (!w) return
  // Parti ailleurs, installé, en photo, ou ce qu'on faisait a disparu : le geste s'arrête.
  if (riding || !seating.current !== !w.seated || editing() || photo.active || player.moving || !w.alive()) return stopWork()
  w.t += dt
  w.next -= dt
  if (w.next <= 0) {
    w.next = w.every ?? 0.65
    if (!w.seated) {
      player.interact()
      net.sendEmote('interact')
    }
    const at = new THREE.Vector3(w.at.x, w.deck.y + 0.4, w.at.z)
    if (w.sound === 'sparks') sound.sparks(at)
    else sound.work(w.sound, at)
  }
  w.progress?.(Math.min(1, w.t / w.duration))
  progressFill.style.width = `${Math.min(100, (w.t / w.duration) * 100).toFixed(1)}%`
  screenPos.set(w.at.x, w.deck.y + 1.05, w.at.z).project(activeCamera())
  progressEl.style.transform = `translate(${(((screenPos.x + 1) / 2) * innerWidth).toFixed(1)}px, ${(((1 - screenPos.y) / 2) * innerHeight).toFixed(1)}px) translate(-50%, -100%)`
  if (w.t >= w.duration) {
    stopWork()
    w.finish()
  }
}

/** Tâche réglée : elle disparaît pour soi, le site la paie. */
async function finishTask(task: LiveTask) {
  stopWork()
  board.complete(task)
  const info = TASK_INFO[task.spot.task]
  showText(info.done)
  const reward = formatCredits(taskOf(task.spot).reward)
  if (wallet.state === 'guest') return guestPaid(reward)
  const result = await wallet.claimTask(task.spot.id, task.cycle)
  if (result.ok) return
  if (result.reason === 'guest') return guestPaid(reward)
  if (result.reason === 'claimed') return chat.add('system', tr('Cette tâche était déjà réglée, dans une autre fenêtre du jeu.', 'That chore was already done, in another game window.'))
  if (result.reason === 'expired' || result.reason === 'inactive') return chat.add('system', tr('Trop tard : cette tâche n\'était plus là.', 'Too late: that chore was no longer there.'))
  if (result.reason === 'max') {
    const n = ECONOMY.taskRules.daily
    return chat.add('system', tr(`Primes des tâches épuisées pour aujourd'hui (${n} tâches payées). Elles reprennent demain ; la tâche est tout de même réglée.`, `Chore bonuses used up for today (${n} chores paid). They resume tomorrow; the chore is still done.`))
  }
  // Pas payée (site injoignable) : la tâche revient, on pourra réessayer.
  board.undo(task.spot, task.cycle)
  chat.add('system', tr('Crédits indisponibles : le site ne répond pas. La tâche reste à régler.', 'Credits unavailable: the site isn\'t responding. The chore is still there.'))
}

/** Un invité règle une tâche (envoie un plat…) : il n'est pas payé, on lui dit comment l'être. */
function guestPaid(reward: string, what = tr('Tâche réglée', 'Chore done')) {
  const a = document.createElement('a')
  a.href = loginUrl()
  a.textContent = tr('Connectez-vous au site', 'Log in to the site')
  chat.add('system', [tr(`${what} (${reward} pour un CMDR). `, `${what} (${reward} for a CMDR). `), a, tr(' pour être payé en crédits.', ' to be paid in credits.')])
}

/** Ce que dit le membre d'équipage d'un travail, et ce que le jeu en dit quand il ne le paie plus. */
const JOB_TEXT: Record<JobKind, { done: string; say: (text: string) => void; capped: string; cappedChat: (n: number) => string }> = {
  kitchen: {
    done: tr('Plat envoyé', 'Dish sent'),
    say: (text) => {
      if (patrolDeck === deck) bubbles.say('chef', text)
    },
    capped: tr('La caisse est fermée pour aujourd\'hui. Tu cuisines pour la gloire, maintenant !', 'The till is closed for today. You\'re cooking for glory now!'),
    cappedChat: (n) => tr(`Marcel a payé ses ${n} plats du jour. Les suivants sont pour la gloire, jusqu'à demain.`, `Marcel has paid his ${n} dishes for today. The rest are for glory, until tomorrow.`),
  },
  hangar: {
    done: tr('Révision finie', 'Service done'),
    say: (text) => mechanic.say(text),
    capped: tr('Budget révisions épuisé pour aujourd\'hui. Là, tu bosses pour la gloire !', 'Service budget spent for today. You\'re working for glory now!'),
    cappedChat: (n) => tr(`Nico a payé ses ${n} révisions du jour. Les suivantes sont pour la gloire, jusqu'à demain.`, `Nico has paid his ${n} services for today. The rest are for glory, until tomorrow.`),
  },
}

/** Plat envoyé avec Marcel, révision finie avec Nico : le site le paie (cf. Wallet.finishJob). */
async function payJob(job: JobKind) {
  const text = JOB_TEXT[job]
  const reward = formatCredits(ECONOMY[job].reward)
  if (wallet.state === 'guest') return guestPaid(reward, text.done)
  const result = await wallet.finishJob(job)
  if (result.ok) return
  if (result.reason === 'guest') return guestPaid(reward, text.done)
  if (result.reason === 'max') {
    text.say(text.capped)
    return chat.add('system', text.cappedChat(ECONOMY[job].daily))
  }
  // Commande pas enregistrée (site injoignable au départ), délai refusé, site muet : pas de paie.
  chat.add('system', tr('Crédits indisponibles : le site n\'a pas enregistré ce travail, il n\'est pas payé.', 'Credits unavailable: the site didn\'t record this job, so it isn\'t paid.'))
}

// Revenu passif : un battement par minute, tant qu'on joue (fenêtre visible, et une touche, un
// clic ou un mouvement de souris dans le dernier quart d'heure). Le site paie le temps écoulé.
const AFK = 15 * 60 * 1000
let lastInput = performance.now()
for (const type of ['keydown', 'pointerdown', 'pointermove', 'wheel']) addEventListener(type, () => (lastInput = performance.now()), { capture: true, passive: true })
setInterval(() => {
  if (document.visibilityState === 'visible' && performance.now() - lastInput < AFK) void wallet.passive()
}, ECONOMY.passive.beat * 1000)

// ------------------------------------------------------------------ mode photo

const photo = new PhotoMode({
  renderer,
  scene,
  camera: () => iso.camera,
  helpers: [hover, marker],
  me: () => player.root,
  tags: () => [
    { at: player.avatar.head(new THREE.Vector3()), name: profile.name, verified, me: true },
    ...[...remotes.values()].filter((r) => r.group.visible && r.avatar).map((r) => ({ at: r.avatar!.head(new THREE.Vector3()), name: r.name, verified: r.verified })),
  ],
  shutter: () => sound.shutter(),
  rotate: (step) => iso.rotate(step),
  zoom: (factor) => iso.zoomBy(factor),
  onToggle: (on) => {
    // Plus près en photo (jusqu'au visage), plus loin aussi (tout le pont).
    iso.zoomMin = on ? 1.1 : 2.5
    iso.zoomMax = on ? 18 : 14
    if (!on) iso.zoomTo(THREE.MathUtils.clamp(iso.zoomLevel, 2.5, 14))
    // Un trajet commencé avant s'arrête là : à l'arrivée, une borne ou un panneau s'ouvrirait
    // par-dessus le mode photo.
    if (on) player.cancelPath()
    hover.visible = marker.visible = false
    keys.clear()
  },
})

function openPhoto() {
  if (editing() || arcade?.isOpen || boardGames.isOpen || barPanel.isOpen || gameEmbed.isOpen || mediaRoom.isOpen || cinemaRoom.isOpen || riding) return
  lift.close()
  jukebox.close()
  wardrobe.close(false)
  inviteMenu.close()
  toggleAbout(false)
  photo.toggle()
}

// ------------------------------------------------------------------ boucle

const roomEl = $('room')
let currentRoom = ''
const timer = new THREE.Timer()
timer.connect(document)
const toCam = new THREE.Vector3()
const fpsHead = new THREE.Vector3()
const screenPos = new THREE.Vector3()
const actors = new Map<Deck, THREE.Vector3[]>(decks.map((d) => [d, []]))
let perfTime = 0
let perfFrames = 0
let fastWindows = 0
/** Densité de pixels maximale autorisée ; redescend si l'affichage a déjà peiné à ce niveau. */
let dprCeiling = MAX_DPR
let promptText = ''
/** Chronomètre des « Zzz » de ceux qui dorment. */
let snore = 0
/** Prochaine mise à l'heure des tâches de bord ; instant figé par le mode photo. */
let taskClock = 0
let frozenAt = 0

function frame() {
  timer.update()
  const dt = Math.min(timer.getDelta(), 0.05)
  gym.update()
  const pad = updateGamepad(dt)
  if (cursorLocked() && (!fpsWanted || isoOnly() || needsCursor())) {
    unlockCursor()
    relock = true
  }
  if (fpsShown) edgeLook(dt)
  syncCursorUi()
  // Borne d'arcade ouverte : elle couvre l'écran, le vaisseau reste figé derrière (dernière image),
  // et la borne a toute la machine pour elle.
  if (arcade?.isOpen || boardGames.isOpen || gameEmbed.isOpen) {
    requestAnimationFrame(frame)
    return
  }
  // Horloge de la soirée : celle des meubles (danseurs, platines).
  tempo.now = holoTime.value

  const input = movementDirection(pad)
  if (claw) {
    // Devant la pince : les flèches la déplacent, dans le repère de la machine.
    const c = Math.cos(claw.rot), s = Math.sin(claw.rot)
    claw.control.steer(input.x * c - input.z * s, input.x * s + input.z * c, dt)
    input.set(0, 0, 0)
  }
  if (seating.current) {
    // Installé sur un meuble : le moindre pas relève le personnage, qui repart une fois debout.
    if (input.lengthSq() > 0 && seating.settled) seating.stand()
    input.set(0, 0, 0)
  }
  if (input.lengthSq() > 0) {
    marker.visible = false
    stopWork()
    if (lift.isOpen) lift.close()
    if (wardrobe.isOpen) wardrobe.close(false)
  }
  if (wardrobe.isOpen) {
    // Essayage : le personnage tourne lentement sur lui-même.
    if (wardrobe.rotating) spin += dt * 0.7
    player.setHeading(spin)
  }
  // Mode photo, instant figé : personnages, meubles et étoiles s'arrêtent ; la caméra, non.
  const world = photo.frozen ? 0 : dt
  if (!editing() && !photo.active) processHover()
  // Mire sur un objet utilisable : elle s'allume.
  crosshair.classList.toggle('aim', fpsShown && cursorLocked() && !!pick(screenCenter()).item)
  player.update(world, input, zone.sprint(autoSprint !== (pad.sprint || keys.has('ShiftLeft') || keys.has('ShiftRight'))))
  cocktailEffects.update(world)

  for (const r of remotes.values()) {
    r.update(world)
    const room = r.level === ZONE_LEVEL ? null : deckById(r.level)?.map.room(Math.round(r.group.position.x), Math.round(r.group.position.z))
    r.group.visible = sees(r) && (ljpcMember || r.level !== 0 || room !== 'l') && (voieAdept || r.level !== -1 || room !== 'v')
  }
  // Zone thargoïde : la mission (ennemis, objets, vue, endurance) ; le joueur caché dans un casier,
  // ou resté au lobby pendant qu'il suit son équipe, ne se voit pas.
  zone.update(dt)
  player.root.visible = viewDeck === deck && !zone.hiding
  flushes.update(world)
  // Quelqu'un au micro du studio (nous, ou un autre) : le néon « ON AIR » s'allume.
  studio.onAir = studioLive()
  if (cometeHere) cat.update(world, catDeck === deck ? player.position : null, player.avatar.emoteId === 'danse')
  syncCompanions()
  for (const c of companions.values()) c.pet.update(world, cabinDeck === deck ? player.position : null, player.avatar.emoteId === 'danse')
  moustache.update(world, labDeck === deck ? player.position : null, player.avatar.emoteId === 'danse')
  sergeant.update(world, patrolDeck === deck ? player.position : null, player.avatar.emoteId)
  chef.update(world, patrolDeck === deck ? player.position : null, player.avatar.emoteId)
  nurse.update(world, patrolDeck === deck ? player.position : null, player.avatar.emoteId)
  infirmary.update()
  mechanic.update(world, holdDeck === deck ? player.position : null, player.avatar.emoteId)
  hangar.update(world)
  // Réacteurs du Krait en route : leur grondement dans la cale, et la vue qui tremble (vue isométrique).
  const roaring = hangar.engines && holdDeck === deck
  if (roaring && !kraitRoar) kraitRoar = sound.thrusters(new THREE.Vector3(KRAIT_COCKPIT.x - 3, holdDeck.y + 0.6, KRAIT_COCKPIT.z)) ?? undefined
  else if (!roaring && kraitRoar) {
    kraitRoar.stop()
    kraitRoar = undefined
  }
  if (roaring) iso.shake(0.1)
  // La base au sol : Ada, et les réacteurs du Krait de l'aire (leur grondement, la vue qui tremble).
  groundBase.update(world)
  const baseRoaring = groundBase.engines && groundBase.here && !groundBase.flying
  if (baseRoaring && !baseRoar) baseRoar = sound.thrusters(new THREE.Vector3(BASE_COCKPIT.x + 3, deck.y + 0.6, BASE_COCKPIT.z)) ?? undefined
  else if (!baseRoaring && baseRoar) {
    baseRoar.stop()
    baseRoar = undefined
  }
  if (baseRoaring) iso.shake(0.1)
  // Pansements de Betty : le nôtre, et ceux des autres.
  plasters.show(player.avatar, infirmary.patched(net.id))
  for (const r of remotes.values()) plasters.show(r.avatar, infirmary.patched(r.id))

  // Chez Jacques, on garde le joueur et le barman ensemble dans le cadre.
  if (barPanel.isOpen && deck.def.id === -1) {
    barFocus.set((player.position.x + jacquesAt.x) / 2, player.position.y, (player.position.z + jacquesAt.z) / 2)
    if (innerWidth <= 900) barFocus.add(iso.screenToGround(0, -1.1))
  }
  // Mode aménagement : le joueur au milieu de la zone que le catalogue laisse visible.
  if (editing()) editor!.frameCamera()
  else iso.frameCenter(0, 0, innerHeight)
  const cinemaSeat = deck.def.id === 1 && ['cinema-row', 'projection-chair'].includes(seating.current?.item.furniture?.model ?? '')
  if (cinemaSeat) cinemaFocus.set(cinemaScreenProp.x, deck.y, (player.position.z + cinemaScreenProp.z) / 2)
  iso.update(dt, zone.watchTarget ?? (claw ? claw.focus : barPanel.isOpen && deck.def.id === -1 ? barFocus : cinemaSeat ? cinemaFocus : player.position))
  if (barPanel.isOpen) {
    iso.camera.updateMatrixWorld()
    barPanel.place(iso.camera, player.position, jacquesAt)
  }
  // Vue subjective : dans les yeux du personnage, derrière lui quand il est occupé.
  const subjective = fpsWanted && !isoOnly()
  if (subjective !== fpsShown) {
    fpsShown = subjective
    curtain()
    document.body.classList.toggle('fps-view', fpsShown)
    if (fpsShown) {
      fps.align(iso.angle)
      fps.thirdPerson = busyBody()
      fps.snap()
      hover.visible = false
    }
  }
  if (fpsShown) {
    fps.thirdPerson = busyBody()
    fps.update(dt, player.avatar.head(fpsHead), deck.y + deck.ceilingY)
    fps.toCamera(toCam)
  } else iso.toCamera(toCam)
  player.avatar.root.visible = !fpsShown || fps.showsBody
  drawMinimap()
  document.body.classList.toggle('camera-rotating', !fpsShown && iso.rotating)

  // Qui se trouve sur quel pont (pour ouvrir les portes).
  for (const list of actors.values()) list.length = 0
  actors.get(deck)?.push(player.position)
  if (cometeHere) actors.get(catDeck)!.push(cat.root.position)
  actors.get(patrolDeck)!.push(sergeant.position, chef.position, nurse.position)
  actors.get(holdDeck)!.push(mechanic.position)
  if (groundBase.deck && groundBase.chief) actors.get(groundBase.deck)?.push(groundBase.chief.position)
  for (const c of companions.values()) actors.get(cabinDeck)!.push(c.pet.root.position)
  // Un joueur d'une autre instance des quartiers n'ouvre pas nos portes.
  for (const r of remotes.values()) if (r.group.visible || r.level !== deck.def.id) actors.get(deckById(r.level))?.push(r.group.position)
  const keep = seating.current ? (seating.current.item.keep ?? seating.current.item.position) : null
  for (const d of decks) {
    d.doorHints = !photo.active && !fpsShown
    // Le plafond cacherait tout, vu de haut : on ne le voit que de l'intérieur.
    d.ceiling.visible = fpsShown
    d.tallDoors = fpsShown
    d.update(world, actors.get(d)!, d === viewDeck ? player.position : null, toCam, editing() && d === cabinDeck, keep, dt)
  }
  firstPersonGlass(fpsShown)
  // Filet de sécurité : ni le joueur ni la vue ne restent sur une baie démontée (l'écran serait
  // vide, sans rien à dessiner) ; on rentre au lobby.
  if (deck.def.zone && deck !== zone.deck) {
    setDeck(deckById(-1))
    player.position.set(LOBBY_RETURN.x, deck.y, LOBBY_RETURN.z)
    iso.snapTo(player.position)
    sendState(true)
  } else if (viewDeck.def.zone && viewDeck !== zone.deck) setView(deck)
  // La baie infestée : ses portes s'ouvrent devant l'équipe ; ses murs s'estompent devant le joueur
  // (ou devant le coéquipier que suit la caméra).
  const bay = zone.deck
  if (bay) {
    bay.ceiling.visible = fpsShown
    const inside = [...remotes.values()].filter((r) => r.level === ZONE_LEVEL && r.group.visible).map((r) => r.group.position)
    if (deck === bay) inside.push(player.position)
    bay.update(world, inside, viewDeck === bay ? (zone.watchTarget ?? player.position) : null, toCam, false, null, dt)
  }
  editor?.update(timer.getElapsed())
  // Tâches de bord : à l'heure chaque seconde, animées sur le pont affiché.
  if ((taskClock -= dt) <= 0) {
    taskClock = 1
    board.refresh()
    creditsHud.setTasks(board.count(deck))
  }
  board.update(photo.frozen ? frozenAt : (frozenAt = timer.getElapsed()), deck, !photo.active)
  creditsHud.update(dt)

  // Dans la baie infestée (ou par les caméras), ni étoiles ni système : on est hors du vaisseau ; sur
  // la base au sol, le ciel de la planète.
  if (!viewDeck.def.zone && !viewDeck.def.ground) {
    const eye = fpsShown ? fps.camera.position : null
    stars.update(world, iso.target, toCam, iso.tilt, eye)
    systemView.update(world, deck.y, iso.target, toCam, iso.tilt, eye)
  }
  sound.update(fpsShown ? fps.listener : iso.target, view().angle)
  ambience(dt)
  // Le joueur (ou le coéquipier suivi) a fait quelques pas : la réserve se répartit sur les lumières les plus proches.
  const lit = zone.watchTarget ?? player.position
  if (viewDeck.lights.length > lightPool.length && Math.hypot(lit.x - lightsFrom.x, lit.z - lightsFrom.z) > 2) applyLights()
  for (const [i, l] of lightPool.entries()) {
    const def = pooled[i]
    if (!def?.flicker || renderQuality.light) continue
    if (def.flicker === 'neon' || def.flicker === 'fire') l.intensity = def.intensity * flicker(def.flicker, timer.getElapsed(), i)
    else if (def.flicker === 'screen') {
      // Reflet de l'écran de cinéma : il suit les scènes du film.
      const glow = filmGlow(film.time)
      l.intensity = def.intensity * glow.k
      l.color.set(glow.color)
    } else {
      // Lumière de soirée : à l'horloge des meubles, pour battre avec la piste de danse.
      l.intensity = def.intensity * (0.4 + 0.6 * beatPulse(holoTime.value))
      if (def.flicker === 'disco') l.color.setHSL((holoTime.value * 0.07 + i * 0.13) % 1, 0.9, 0.55)
    }
  }
  marker.scale.setScalar(1 + Math.sin(timer.getElapsed() * 6) * 0.12)
  // Pièce tamisée (cinéma, salon d'écoute) : l'ambiance baisse en fondu quand on y entre, remonte quand on en sort.
  const dimTo = deck.def.dim?.[deck.map.room(Math.round(player.position.x), Math.round(player.position.z)) ?? ''] ?? 1
  if (dimming !== dimTo) {
    dimming = Math.abs(dimTo - dimming) < 0.005 ? dimTo : dimming + (dimTo - dimming) * Math.min(1, dt * 2.5)
    applyAmbience()
  }

  // Pièce courante.
  const here = inCabin(deck.def.id, player.position.x, player.position.z)
  const name = visiting && here ? tr(`Quartiers de ${visiting.name}`, `${visiting.name}'s quarters`) : deck.roomName(player.position.x, player.position.z)
  if (name !== currentRoom) {
    currentRoom = name
    roomEl.textContent = name
  }

  // Dans ses quartiers : de quoi les aménager. En visite, jusque dans la coursive : de quoi rentrer.
  cabinBar.set(
    editing() ? null : visiting ? { kind: 'visit', host: visiting.name, inside: here } : !here ? null : { kind: 'own', canEdit: linked, canInvite: verified && net.online, loginUrl: loginUrl() },
  )
  if (!here && inviteMenu.isOpen) inviteMenu.close()

  // Invite « E » au-dessus de l'objet le plus proche ; installé sur un meuble, au-dessus du
  // personnage : se relever (et ce que permet la place).
  const sitting = seating.settled && !gym.active && !riding && !editing() && !barPanel.isOpen
  const near = gym.active || riding || sitePanel.isOpen || lift.isOpen || jukebox.isOpen || barPanel.isOpen || wardrobe.isOpen || editing() || seating.current || working || zone.frozen || zone.panelOpen ? null : nearestInteractable()
  const sit = sitting ? seatPrompt(seating.current!) : null
  const label = sit ? `${sit.main}|${sit.space ?? ''}` : near?.label
  promptEl.querySelector('kbd')!.textContent = usingGamepad ? 'A / ×' : 'E'
  if (promptEl.hidden !== !label) promptEl.hidden = !label
  if (label) {
    const promptKey = `${usingGamepad}|${label}`
    if (promptKey !== promptText) {
      promptText = promptKey
      if (sit?.space) {
        const k = document.createElement('kbd')
        k.textContent = usingGamepad ? 'X / □' : tr('Espace', 'Space')
        promptLabel.replaceChildren(sit.main, ' · ', k, ' ', sit.space)
      } else promptLabel.textContent = sit ? sit.main : label
    }
    let x = innerWidth / 2, y = fpsBottom()
    // Vue subjective : l'invite reste devant soi, en bas de l'écran ; sinon, au-dessus de l'objet.
    if (!fpsShown) {
      if (sitting) screenPos.set(player.position.x, player.position.y + 1.3, player.position.z).project(activeCamera())
      else screenPos.set(near!.position.x, deck.y + 1.1, near!.position.z).project(activeCamera())
      x = ((screenPos.x + 1) / 2) * innerWidth
      y = ((1 - screenPos.y) / 2) * innerHeight
    }
    promptEl.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`
  }
  // On s'éloigne de l'ascenseur ou du jukebox : le panneau se ferme.
  if (lift.isOpen && Math.hypot(player.position.x - liftTile.x, player.position.z - liftTile.z) > 1.6) lift.close()
  if (jukebox.isOpen && jukeboxNear && Math.hypot(player.position.x - jukeboxNear.x, player.position.z - jukeboxNear.z) > 2) jukebox.close()
  // Chaque jukebox remplit sa pièce en stéréo ; derrière une cloison, il reste sourd et lointain.
  // Un autre pont est silencieux. Le repère des pièces suit la carte du pont, portes comprises.
  for (const [music, source] of [[deckMusic, deckById(0)], [holdMusic, deckById(-1)], [cabinMusic, cabinDeck]] as const) {
    const playing = music.playing
    const jukeboxRoom = playing && source.map.room(Math.round(playing.x), Math.round(playing.z))
    const playerRoom = source === deck ? source.map.room(Math.round(player.position.x), Math.round(player.position.z)) : null
    music.setRoom(source === deck && viewDeck === deck, !!jukeboxRoom && jukeboxRoom === playerRoom)
  }
  // La soirée bat sur le morceau entendu dans la pièce, sauf quand le mode photo fige l'instant.
  if (!photo.frozen && !deckMusic.syncTempo() && !holdMusic.syncTempo() && !cabinMusic.syncTempo()) syncTempo(null)

  workStep(dt)
  kitchen.update(world)
  dialog.update(dt)
  seating.arbitrate()
  sendState()
  // Couché sur un lit : de petits « Zzz » de temps en temps, chez soi comme chez les autres.
  snore += dt
  if (snore > 4.5) {
    snore = 0
    if (seating.settled && seating.pose === 'lie' && !infirmary.busy) bubbles.emote('me', 'moon-stars')
    for (const r of remotes.values()) if (r.group.visible && r.pose === 'lie' && nurse.patient !== r.id) bubbles.emote(`p${r.id}`, 'moon-stars')
  }

  liftRide.update(dt, activeCamera())
  // Dans la baie (ou par les caméras), tout passe par le brouillard de guerre (cf. salvage/fog.ts).
  if (!zone.render(scene, activeCamera(), renderQuality.light)) renderer.render(scene, activeCamera())
  cinemaRoom.placeScreen(activeCamera(), deck.def.id === 1,
    deck.def.id === 1 && deck.map.room(Math.round(player.position.x), Math.round(player.position.z)) === 'n',
    cinemaScreenProp.x, deckById(1).y, cinemaScreenProp.z)
  // Vue subjective, dans sa tête : ses propres bulles au-dessus de l'invite, en bas de l'écran.
  bubbles.update(activeCamera(), fpsShown && !fps.showsBody ? { key: 'me', x: innerWidth / 2, y: fpsBottom() - (promptEl.hidden ? 0 : 40) } : null)

  // Résolution adaptative : on baisse la densité de pixels si l'affichage peine,
  // on la remonte (sans dépasser le dernier niveau qui a peiné) s'il reste de la marge.
  perfTime += dt
  perfFrames++
  if (perfTime > 2 && !renderQuality.light) {
    const avg = perfTime / perfFrames
    if (avg > 1 / 50 && dpr > 1) {
      dprCeiling = dpr - 0.25
      dpr = Math.max(1, dpr - 0.25)
      renderer.setPixelRatio(dpr)
      fastWindows = 0
    } else if (avg < 1 / 57 && dpr < dprCeiling) {
      if (++fastWindows >= 3) {
        dpr = Math.min(dprCeiling, dpr + 0.25)
        renderer.setPixelRatio(dpr)
        fastWindows = 0
      }
    } else fastWindows = 0
    perfTime = 0
    perfFrames = 0
  }
  requestAnimationFrame(frame)
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight)
  iso.resize(innerWidth / innerHeight)
  fps.resize(innerWidth / innerHeight)
  syncMobileEntry()
})

// Compile tous les shaders avant la première image (pas d'à-coup au premier fondu de mur).
for (const d of decks) d.group.visible = true
renderer.compile(scene, iso.camera)
setDeck(deck)

bootDone()
$('hud').hidden = false
syncMobileEntry()
// Les crédits ont pu arriver pendant le chargement : l'apparence portée est-elle à soi ?
checkLook()
// Les records des bornes, pour leurs écrans (« HI 12340 »).
void fetchRecords()
updateNetStatus()
updateIdentity()
frame()

// Accès de debug (dev uniquement) : window.__game dans la console.
if (import.meta.env.DEV) {
  const { refusal } = await import('./cabin/rules')
  Object.assign(window, { __refusal: (items: CabinItem[], i: number) => refusal(cabin, items, i) })
  Object.assign(window, {
    __game: { renderer, sound, player, fps, cat, moustache, sergeant, chef, kitchen, nurse, infirmary, mechanic, hangar, companions, cabin, seating, sitOn, interactables: () => deck.interactables, groundBase, arcade: () => arcade, photo, wallet, board, music: { deck: deckMusic, hold: holdMusic, cabin: cabinMusic }, tempo, get editor() { return editor }, openEditor, closeEditor, net, remotes, visiting: () => visiting, sees: (id: number) => { const r = remotes.get(id); return r ? sees(r) : null }, openWardrobe, applyLook, ride, emote, goTo: (x: number, z: number) => goTo({ x, z }), say: (t: string) => chat.onSend?.(t), interact: tryInteract, deck: () => deck, iso, systems: systemView, salvage: zone, view: () => viewDeck },
  })
}
