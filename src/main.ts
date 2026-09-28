import { GymGame, type Sport } from './gym'
import { loadSiteArt, SitePanel } from './site'
import * as THREE from 'three'
import type { ArcadeCabinet } from './arcade/cabinet'
import { isGameId, type GameId } from './arcade/game'
import { fetchRecords } from './arcade/scores'
import { BoardGames } from './board/games'
import { BarPanel, CocktailEffects } from './bar'
import { GameEmbed } from './game-embed'
import { CAT_MODEL, preload, rig } from './assets'
import type { CabinEditor } from './cabin/editor'
import { CabinBar, InviteMenu, InviteToasts, type CrewEntry } from './cabin/hud'
import { normalizeLayout, sameLayout, serializeLayout, type CabinItem, type CabinLayout } from './cabin/layout'
import { CabinStore, requestCabin, type SiteCabin } from './cabin/storage'
import { devCmdr, fetchCmdrAccount, isLegacyDefaultName, randomCmdrName } from './cmdr'
import { ECONOMY, formatCredits, skinPrice, wingPrice } from './economy/data'
import { CreditsHud } from './economy/hud'
import { taskOf } from './economy/schedule'
import { allLooks, lookOwned, skinProduct, starterLook } from './economy/skins'
import { TASK_INFO, TaskBoard, type LiveTask } from './economy/tasks'
import { Wallet } from './economy/wallet'
import { Sound } from './audio'
import { Avatar, EMOTES } from './avatar'
import { IsoCamera } from './camera'
import { Cat } from './cat'
import { MAX_PETS, petRig, speciesOfItem, type Species } from './pets'
import { Deck, type Interactable } from './deck'
import { beatAt, beatPulse, film, filmGlow, holoMeGlow, holoTime, type ClawControl, type ClawResult } from './furniture'
import { GamepadControls, type GamepadInput } from '../shared/gamepad.js'
import { lineOfSight } from '../shared/sight.js'
import { EN, localizeAttributes, tr } from './i18n'
import { CAT_SPAWN, DEFAULT_AMBIENCE, LEVEL_HEIGHT, LEVELS, LIFT, SPAWN } from './levels'
import { hydrateIcons, icon } from './icons'
import { lookId, lookPath, lookRig, parseLook, raceOf, variantsOf, type Look } from './looks'
import { JukeboxPanel, JukeboxPlayer, trackById, type Track } from './music'
import { Net, type BoardGameId, type JukeboxWhere, type MusicState, type PlayerState } from './net'
import type { Tile } from './pathfinding'
import { PhotoMode } from './photo'
import { overlapsAny, resolveCircle } from './physics'
import { Player } from './player'
import { renderQuality } from './quality'
import { findReaction, REACTIONS, reactionImage } from './reactions'
import { RemotePlayer } from './remote'
import { Seating, type Seated } from './seating'
import { Starfield } from './starfield'
import { SystemView, SYSTEMS } from './systems'
import { nextSystem, JUMP_CHARGE, JUMP_TRAVEL, type SystemId } from '../shared/systems.js'
import { DEFAULT_PATTERN, WING_SLOTS, type WingId } from '../shared/cabin-wings.js'
import { syncTempo, tempo } from './tempo'
import { $, bootDone, bootProgress, Bubbles, Chat, Dialog, fadeScreen, LiftPanel, nameTag, WardrobePanel } from './ui'

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

// ------------------------------------------------------------------ rendu

const MAX_DPR = Math.min(devicePixelRatio, 2)
renderQuality.light = store.get('mini-shipinteriors-light') === 'true'
let dpr = Math.min(MAX_DPR, 1.5)
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
  profile.name = `CMDR ${account}`
}
/** Réponse du site sur les quartiers du CMDR, si elle est arrivée à temps (undefined : pas encore). */
const siteCabin = account ? await within<SiteCabin | null | undefined>(cabinRequest, 3000, undefined) : undefined
/**
 * Enregistrement des quartiers d'un CMDR : sur le site, ou dans ce navigateur s'il ne répond pas.
 * Tant que le site n'a pas répondu, on ne les aménage pas : on écraserait ceux qu'il garde.
 */
let cabinStore = account ? new CabinStore(account) : null

const decks = LEVELS.map((def) => new Deck(def))
for (const d of decks) scene.add(d.group)
const deckById = (id: number) => decks.find((d) => d.def.id === id)!
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

let deck = cabinDeck

const stars = new Starfield()
scene.add(stars.group)
/** Le système où se trouve le vaisseau, vu par les verrières (il change au saut FSD). */
const systemView = new SystemView()
scene.add(systemView.group)

const player = new Player(new Avatar(await lookRig(parseLook(profile.skin))), deck.colliders)
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
const spawn = spawnPoint()
player.position.set(spawn.x, deck.y, spawn.z)
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

/** Jukebox du pont principal (celui du mess), de la cale (celui du bar) et des quartiers où l'on se trouve. */
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

bubbles.attach('me', (out) => player.avatar.head(out))
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
  lightsFrom.copy(player.position)
  const near = deck.lights.length <= lightPool.length
    ? deck.lights
    : [...deck.lights].sort((a, b) => a.position.distanceToSquared(player.position) - b.position.distanceToSquared(player.position)).slice(0, lightPool.length)
  for (const [i, l] of lightPool.entries()) {
    const def = (pooled[i] = near[i])
    l.intensity = def ? def.intensity : 0
    if (def) {
      l.position.copy(def.position)
      l.color.copy(def.color)
    }
  }
}
cabin.onLights = () => {
  if (deck === cabinDeck) applyLights()
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
  const ambience = deck.def.ambience ?? DEFAULT_AMBIENCE
  hemi.intensity = ambience.hemi * dimming
  sun.intensity = ambience.sunIntensity * dimming
}

function setDeck(next: Deck) {
  seating.leave()
  deck = next
  for (const d of decks) d.group.visible = d === deck
  player.colliders = deck.colliders
  player.position.y = deck.y
  iso.snapTo(player.position)
  applyLights()
  const ambience = deck.def.ambience ?? DEFAULT_AMBIENCE
  hemi.color.set(ambience.sky)
  hemi.groundColor.set(ambience.ground)
  sun.color.set(ambience.sun)
  applyAmbience()
  sun.position.set(SHIP_CENTER.x - 6, deck.y + 14, SHIP_CENTER.z + 4)
  sun.target.position.set(SHIP_CENTER.x, deck.y, SHIP_CENTER.z)
  // Les machines d'un pont ne s'entendent que sur ce pont.
  for (const h of hums) sound.fade(h.gain, h.deck === deck ? h.volume : 0)
  hover.position.y = deck.y + 0.01
  marker.position.y = deck.y + 0.02
  marker.visible = false
  $('deck').textContent = deck.def.name
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
  const soft = deckById(level).def.footsteps === 'soft'
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

// ------------------------------------------------------------------ compagnons

/**
 * Compagnons adoptés (cf. pets.ts) : un par panier des quartiers affichés (les siens, ou ceux de
 * l'hôte en visite). Chacun vit près de son panier, comme Comète, et ne quitte pas les quartiers.
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
  const pet = new Cat(r, cabinDeck, item.x, item.z + aside, { name: species.name, scale: species.scale, area: cabin.bounds, bowls: petBowls })
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
    // Tuyères à la poupe et bourdonnement du réacteur (pont principal).
    for (const [i, p] of deckById(0).engineEmitters.entries()) {
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
const net = new Net(profile, devCmdr())
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
const levelY = (level: number) => level * LEVEL_HEIGHT

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
    boardGames.close(false)
    arcade?.disconnected()
    for (const id of [...remotes.keys()]) removeRemote(id)
    inviteToasts.clear()
    inviteMenu.close()
    leaveVisit(tr('Liaison perdue avec le relais : retour dans vos quartiers.', 'Lost contact with the relay: back to your quarters.'))
  }
  updateNetStatus()
  updateIdentity()
}
net.onMessage = (m) => {
  switch (m.t) {
    case 'welcome':
      // Le relais fait autorité sur le nom (CMDR vérifié, ou invité homonyme d'un CMDR présent).
      profile.name = m.you.name
      verified = m.you.verified
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
      // Le relais oublie tout à chaque connexion : la musique de nos quartiers, on la lui rend.
      const own = cabinMusic.playing
      if (own) net.sendMusic('cabin', own.track.id, own.x, own.z, own.position)
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
        leaveVisit(tr(`${host} a quitté le vaisseau : retour dans vos quartiers.`, `${host} left the ship: back to your quarters.`))
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
    case 'jump':
      // Un pilote lance le saut FSD (nous, ou un autre) : tout le bord part.
      void playJump(m.system, m.id === net.id ? null : m.name)
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
          leaveVisit(m.by ? tr(`${host} vous a raccompagné : retour dans vos quartiers.`, `${host} showed you out: back to your quarters.`) : BACK_HOME)
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
        const rooms = [...board.live.values()].filter((t) => t.deck === d).map((t) => d.roomName(t.spot.x, t.spot.z))
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

const wardrobe = new WardrobePanel()
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
wardrobe.shop = {
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
  if (track) music.play(track, jukeboxAt(m.where, m.x, m.z), m.at)
  else music.stop()
  return track
}

function nowPlaying(track: Track) {
  dialog.show(`♪ ${track.title} — ${track.artist}. ${track.mood}`)
}

/** Le panneau du jukebox : on choisit un morceau (pour tous ceux qui sont là), ou on l'arrête. */
function openJukebox(where: JukeboxWhere, at: THREE.Vector3) {
  player.interact()
  net.sendEmote('interact')
  const music = jukeboxes[where]
  jukeboxNear = at.clone()
  jukeboxWhere = where
  jukebox.open(
    music,
    (track) => {
      music.play(track, jukeboxAt(where, at.x, at.z), 0)
      net.sendMusic(where, track.id, at.x, at.z)
      nowPlaying(track)
      sound.play('emote', null, { volume: 0.05, rate: 0.8 })
    },
    () => {
      music.stop()
      net.sendMusic(where, null, at.x, at.z)
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

function openLift() {
  lift.open(LEVELS, deck.def.id, (id) => void ride(id))
}
for (const d of decks) d.liftInteractable.onInteract = openLift

async function ride(target: number) {
  if (riding || target === deck.def.id) return
  riding = true
  player.cancelPath()
  player.position.x = LIFT.x
  player.position.z = LIFT.z
  deck.pulseLift()
  sound.play('lift', new THREE.Vector3(LIFT.x, deck.y + 0.5, LIFT.z), { volume: 0.2 })
  await fadeScreen(true)
  setDeck(deckById(target))
  deck.pulseLift()
  net.sendState({ x: player.position.x, z: player.position.z, yaw: player.heading, level: deck.def.id, anim: 'idle' }, Infinity)
  sound.play('ding', null, { volume: 0.1 })
  await fadeScreen(false)
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
  if (visiting) return chat.add('system', tr('Ces quartiers ne sont pas les vôtres : on n\'aménage que chez soi.', 'These quarters aren\'t yours: you can only decorate your own.'))
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
  iso.zoomTo(ed.fitZoom())
  ed.setSaveState(store.state)
  store.onState = (state) => ed.setSaveState(state)
}

function closeEditor() {
  if (!editor?.active) return
  editor.stop()
  iso.setRestElevation(null)
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
 * en direct. Il rentre chez lui en sortant par la porte, ou quand l'hôte le raccompagne ou
 * quitte le vaisseau.
 */

/** Quartiers d'un autre CMDR où l'on se trouve (null : chez soi). */
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
  if (r.level !== deck.def.id) return false
  return !inCabin(r.level, r.group.position.x, r.group.position.z) || r.cabin === myCabin()
}

/** Aménagement affiché : celui de l'hôte pendant une visite, le sien sinon. */
function showCabin() {
  cabin.setLayout(visiting ? normalizeLayout(hostLayouts.get(visiting.host) ?? null, cabin.bounds) : ownLayout)
  // Le jukebox du panneau a pu bouger, disparaître, ou être celui de l'hôte qui nous raccompagne.
  if (jukeboxWhere === 'cabin') jukebox.close()
  // Assis sur un meuble des quartiers : on retrouve sa place, ou l'on se relève s'il a bougé.
  seating.relink()
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
    chat.add('system', tr(`Vous voici dans les quartiers de ${name}. Ressortez par la porte pour rentrer chez vous.`, `You are in ${name}'s quarters. Walk back out through the door to go home.`))
  }
}

/** Fin de visite (ou d'une entrée en cours) : on retrouve ses propres quartiers, là où l'on se tient. */
function leaveVisit(message?: string) {
  const was = visiting !== null || entering !== null
  visitSeq++
  entering = null
  // La musique de l'hôte reste chez lui ; en ligne, le relais nous rend celle de nos quartiers.
  if (was) cabinMusic.stop()
  if (visiting) {
    visiting = null
    showCabin()
  }
  if (was && message) chat.add('system', message)
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
  let best: { x: number; z: number } | null = null
  for (const t of cabin.tiles) {
    if (cabinDeck.pathfinder.walkable(t.x, t.z) && (!best || Math.hypot(t.x - p.x, t.z - p.z) < Math.hypot(best.x - p.x, best.z - p.z))) best = t
  }
  if (best) {
    p.x = best.x
    p.z = best.z
  }
}

// ------------------------------------------------------------------ entrées

const keys = new Set<string>()
const gamepad = new GamepadControls()
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
  if (barPanel.isOpen || gameEmbed.isOpen) { if (e.code === 'Escape') { barPanel.close(); gameEmbed.close() }; e.preventDefault(); return }
  if (gym.key(e)) return
  if (chat.typing) return
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
  if (e.code === 'KeyR') iso.rotate(e.shiftKey ? -1 : 1)
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
  if (gym.active || chat.typing || riding || sitePanel.isOpen || lift.isOpen || jukebox.isOpen || barPanel.isOpen || gameEmbed.isOpen || editing()) return inputDir
  const on = (...codes: string[]) => codes.some((c) => keys.has(c))
  // event.code = position physique : KeyW/KeyA correspondent à Z/Q sur un clavier AZERTY.
  const sx = (on('KeyD', 'ArrowRight') ? 1 : 0) - (on('KeyA', 'ArrowLeft') ? 1 : 0)
  const sy = (on('KeyW', 'ArrowUp') ? 1 : 0) - (on('KeyS', 'ArrowDown') ? 1 : 0)
  if (!sx && !sy) return inputDir
  return iso.screenToGround(sx, sy, inputDir).normalize()
}

function updateGamepad(dt: number): GamepadInput {
  const focus = document.activeElement
  const typing = focus instanceof HTMLElement && (focus.matches('input, textarea, select') || focus.isContentEditable)
  const enabled = document.hasFocus() && !document.hidden && !typing && !chat.typing && !editing() && !photo.active && !arcade?.isOpen && !boardGames.isOpen && !barPanel.isOpen && !gameEmbed.isOpen
  const pad = gamepad.poll(enabled)
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
  if (pad.rotateLeft) iso.rotate(-1)
  if (pad.rotateRight) iso.rotate(1)
  if (pad.lookX || pad.lookY) iso.orbit(-pad.lookX * dt * 1.8, pad.lookY * dt * 1.2)
  if (pad.zoom) iso.zoomBy(Math.exp(pad.zoom * dt))
  if (seating.current) {
    if (pad.interact && seating.settled) seating.stand()
    else if (pad.action && seating.settled) seatAction(seating.current)
  } else if (pad.interact || pad.action) tryInteract()
  return pad
}

function movementDirection(pad: GamepadInput): THREE.Vector3 {
  const input = keyboardDirection()
  if (chat.typing || riding || sitePanel.isOpen || lift.isOpen || jukebox.isOpen || barPanel.isOpen || wardrobe.isOpen || editing() || photo.active) return input
  // Le clavier reste prioritaire lorsqu'une touche de déplacement est maintenue.
  if (input.lengthSq() === 0) iso.screenToGround(pad.moveX, -pad.moveY, input)
  return input
}

addEventListener('wheel', (e) => { if (!barPanel.isOpen) iso.zoomBy(Math.exp(e.deltaY * 0.001)) }, { passive: true })
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

function pick(e: PointerEvent): { tile: Tile | null; item: Interactable | null; point: THREE.Vector3 | null } {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  raycaster.setFromCamera(pointer, iso.camera)
  const hits = raycaster.intersectObjects(deck.interactables.map((i) => i.object), true)
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
  hover.visible = !!tile && deck.pathfinder.walkable(tile.x, tile.z)
  if (tile) hover.position.set(tile.x, deck.y + 0.01, tile.z)
}

// Caméra libre : clic droit ou clic molette maintenu, puis glisser. Horizontalement on tourne
// autour du personnage, verticalement on incline la vue ; avec Maj, on la fait glisser.
// R (ou les boutons de rotation) ramène la vue isométrique.
let freeLook: { id: number; x: number; y: number } | null = null
canvas.addEventListener('contextmenu', (e) => e.preventDefault())
// Pas de défilement automatique au clic molette.
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 1) e.preventDefault()
})
canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 1 && e.button !== 2) return
  e.preventDefault()
  freeLook = { id: e.pointerId, x: e.clientX, y: e.clientY }
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
  if (e.shiftKey) iso.pan(dx, dy, innerHeight)
  else iso.orbit(-dx * 0.008, dy * 0.006)
})
function endFreeLook(e: PointerEvent) {
  if (!freeLook || e.pointerId !== freeLook.id) return
  freeLook = null
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
  canvas.style.cursor = 'default'
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
    if (barPanel.isOpen) {
      if (!barPanel.contains(e.target)) { barPanel.close(); e.stopPropagation() }
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
  if (e.button !== 0 || riding || gym.active) return
  if (editing()) {
    // Objet glissé jusque sous le catalogue : il le relâche quand même dans le mode aménagement.
    try {
      canvas.setPointerCapture(e.pointerId)
    } catch {}
    return editor!.pointerDown(e)
  }
  if (wardrobe.isOpen) return wardrobe.close(false)
  stopWork()
  const { tile, item, point } = pick(e)
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
})

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
  let best: Interactable | null = null
  let bestD = INTERACT_RANGE
  for (const i of deck.interactables) {
    const d = distanceTo(i)
    if (d < bestD && inSight(i)) {
      best = i
      bestD = d
    }
  }
  return best
}

function tryInteract() {
  if (gym.active || riding || sitePanel.isOpen || lift.isOpen || wardrobe.isOpen || barPanel.isOpen || gameEmbed.isOpen || editing()) return
  const item = nearestInteractable()
  if (item) interactWith(item)
}

function interactWith(item: Interactable) {
  if (item.seats) return sitOn(item)
  player.lookAt(item.position)
  if (item.onInteract) return item.onInteract()
  player.interact()
  net.sendEmote('interact')
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
  const board = boardGame(seat)
  if (board) return boardGames.open(board.game, board.table)
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

/** Invite au-dessus du personnage installé : se relever, et ce que permet sa place (Espace). */
function seatPrompt(seat: Seated): { main: string; space?: string } {
  if (claw) return { main: tr('Quitter', 'Leave'), space: claw.control.busy ? undefined : tr('Lâcher la pince', 'Drop the claw') }
  if (canJump(seat)) return { main: tr('Se lever', 'Stand up'), space: jumping ? undefined : tr('Saut FSD', 'FSD jump') }
  // Devant une borne fermée (on sort du mode photo, ou elle n'a pas pu se charger).
  if (arcadeGame(seat)) return { main: tr('Se lever', 'Stand up'), space: tr('Jouer', 'Play') }
  if (seat.item.furniture?.model === 'bar-table' && seat.item.furniture.label === 'galactic-clash') return { main: tr('Se lever', 'Stand up'), space: tr('Jouer', 'Play') }
  if (seat.item.furniture?.model === 'pinball' && deck.def.id === -1) return { main: tr('Se lever', 'Stand up'), space: tr('Jouer', 'Play') }
  if (seat.item.furniture?.model === 'bar-stool' && deck.def.id === -1) return { main: tr('Se lever', 'Stand up'), space: tr('Parler à Jacques', 'Talk to Jacques') }
  if (boardGame(seat)) return { main: tr('Se lever', 'Stand up'), space: tr('Jouer', 'Play') }
  return { main: tr('Se lever', 'Stand up') }
}

/** Espace, installé sur un meuble. */
function seatAction(seat: Seated) {
  if (claw) return dropClaw()
  if (canJump(seat)) return void fsdJump()
  const game = arcadeGame(seat)
  if (game) void openArcade(seat, game)
  if (seat.item.furniture?.model === 'bar-table' && seat.item.furniture.label === 'galactic-clash') return gameEmbed.open('cards')
  if (seat.item.furniture?.model === 'pinball' && deck.def.id === -1) return gameEmbed.open('cqc')
  if (seat.item.furniture?.model === 'bar-stool' && deck.def.id === -1) return barPanel.open()
  const board = boardGame(seat)
  if (board) boardGames.open(board.game, board.table)
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

// ------------------------------------------------------------------ saut FSD

let jumping = false

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
  await wait(JUMP_TRAVEL * 1000)
  stars.warp(1)
  systemView.set(system)
  systemView.hide(false)
  flash(true)
  dialog.show(tr(`Arrivée : ${name}. ${arrival}`, `Arrived: ${name}. ${arrival}`))
  jumping = false
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
/** Tâche en cours de règlement, où en est le geste, et quand vient le prochain. */
let working: { task: LiveTask; t: number; duration: number; next: number } | null = null

board.onInteract = (task) => {
  if (working || riding || photo.active || editing()) return
  player.cancelPath()
  marker.visible = false
  player.lookAt(task.item.position)
  working = { task, t: 0, duration: taskOf(task.spot).duration, next: 0 }
  board.pin(task.spot.id)
  $('task-progress-label').textContent = TASK_INFO[task.spot.task].doing
  progressFill.style.width = '0'
  progressEl.hidden = false
}

function stopWork() {
  if (!working) return
  working = null
  board.pin(null)
  progressEl.hidden = true
}

/** Le geste avance (à chaque image) : le personnage s'affaire, la jauge se remplit. */
function workStep(dt: number) {
  const w = working
  if (!w) return
  // Parti ailleurs, installé, en photo, ou la tâche a disparu : le geste s'arrête.
  if (riding || seating.current || editing() || photo.active || player.moving || !board.live.has(w.task.spot.id)) return stopWork()
  w.t += dt
  w.next -= dt
  if (w.next <= 0) {
    w.next = 0.65
    player.interact()
    net.sendEmote('interact')
    const p = w.task.item.position
    const at = new THREE.Vector3(p.x, w.task.deck.y + 0.4, p.z)
    const noise = TASK_INFO[w.task.spot.task].sound
    if (noise === 'sparks') sound.sparks(at)
    else sound.work(noise, at)
  }
  progressFill.style.width = `${Math.min(100, (w.t / w.duration) * 100).toFixed(1)}%`
  screenPos.set(w.task.item.position.x, w.task.deck.y + 1.05, w.task.item.position.z).project(iso.camera)
  progressEl.style.transform = `translate(${(((screenPos.x + 1) / 2) * innerWidth).toFixed(1)}px, ${(((1 - screenPos.y) / 2) * innerHeight).toFixed(1)}px) translate(-50%, -100%)`
  if (w.t >= w.duration) void finishTask(w.task)
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
  // Pas payée (site injoignable) : la tâche revient, on pourra réessayer.
  board.undo(task.spot, task.cycle)
  chat.add('system', tr('Crédits indisponibles : le site ne répond pas. La tâche reste à régler.', 'Credits unavailable: the site isn\'t responding. The chore is still there.'))
}

/** Un invité règle une tâche : il n'est pas payé, on lui dit comment l'être. */
function guestPaid(reward: string) {
  const a = document.createElement('a')
  a.href = loginUrl()
  a.textContent = tr('Connectez-vous au site', 'Log in to the site')
  chat.add('system', [tr(`Tâche réglée (${reward} pour un CMDR). `, `Chore done (${reward} for a CMDR). `), a, tr(' pour être payé en crédits.', ' to be paid in credits.')])
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
  if (editing() || arcade?.isOpen || boardGames.isOpen || barPanel.isOpen || gameEmbed.isOpen || riding) return
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
const screenPos = new THREE.Vector3()
const actors = new Map<Deck, THREE.Vector3[]>(decks.map((d) => [d, []]))
const editFocus = new THREE.Vector3()
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
  player.update(world, input, autoSprint !== (pad.sprint || keys.has('ShiftLeft') || keys.has('ShiftRight')))
  cocktailEffects.update(world)

  for (const r of remotes.values()) {
    r.update(world)
    r.group.visible = sees(r)
  }
  if (cometeHere) cat.update(world, catDeck === deck ? player.position : null, player.avatar.emoteId === 'danse')
  syncCompanions()
  for (const c of companions.values()) c.pet.update(world, cabinDeck === deck ? player.position : null, player.avatar.emoteId === 'danse')

  // Chez Jacques, on garde le joueur et le barman ensemble dans le cadre.
  if (barPanel.isOpen && deck.def.id === -1) {
    barFocus.set((player.position.x + jacquesAt.x) / 2, player.position.y, (player.position.z + jacquesAt.z) / 2)
    if (innerWidth <= 900) barFocus.add(iso.screenToGround(0, -1.1))
  }
  iso.update(dt, editing() ? editor!.focus(editFocus) : claw ? claw.focus : barPanel.isOpen && deck.def.id === -1 ? barFocus : player.position)
  if (barPanel.isOpen) {
    iso.camera.updateMatrixWorld()
    barPanel.place(iso.camera, player.position, jacquesAt)
  }
  iso.toCamera(toCam)
  document.body.classList.toggle('camera-rotating', iso.rotating)

  // Qui se trouve sur quel pont (pour ouvrir les portes).
  for (const list of actors.values()) list.length = 0
  actors.get(deck)!.push(player.position)
  if (cometeHere) actors.get(catDeck)!.push(cat.root.position)
  // Un joueur d'une autre instance des quartiers n'ouvre pas nos portes.
  for (const r of remotes.values()) if (r.group.visible || r.level !== deck.def.id) actors.get(deckById(r.level))?.push(r.group.position)
  const keep = seating.current?.item.position ?? null
  for (const d of decks) d.update(world, actors.get(d)!, d === deck ? player.position : null, toCam, editing() && d === cabinDeck, keep, dt)
  editor?.update(timer.getElapsed())
  // Tâches de bord : à l'heure chaque seconde, animées sur le pont affiché.
  if ((taskClock -= dt) <= 0) {
    taskClock = 1
    board.refresh()
    creditsHud.setTasks(board.count(deck))
  }
  board.update(photo.frozen ? frozenAt : (frozenAt = timer.getElapsed()), deck, !photo.active)
  creditsHud.update(dt)

  stars.update(world, iso.target, toCam, iso.tilt)
  systemView.update(world, deck.y, iso.target, toCam, iso.tilt)
  sound.update(iso.target, iso.angle)
  ambience(dt)
  // Le joueur a fait quelques pas : la réserve se répartit sur les lumières les plus proches.
  if (deck.lights.length > lightPool.length && Math.hypot(player.position.x - lightsFrom.x, player.position.z - lightsFrom.z) > 2) applyLights()
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
  // On sort des quartiers d'un hôte par la porte : on rentre chez soi.
  if (visiting && !here && !riding) {
    net.sendVisit(null)
    leaveVisit()
  }
  const name = visiting && here ? tr(`Quartiers de ${visiting.name}`, `${visiting.name}'s quarters`) : deck.roomName(player.position.x, player.position.z)
  if (name !== currentRoom) {
    currentRoom = name
    roomEl.textContent = name
  }

  // Dans ses quartiers : de quoi les aménager.
  cabinBar.set(
    !here || editing() ? null : visiting ? { kind: 'visit', host: visiting.name } : { kind: 'own', canEdit: linked, canInvite: verified && net.online, loginUrl: loginUrl() },
  )
  if (!here && inviteMenu.isOpen) inviteMenu.close()

  // Invite « E » au-dessus de l'objet le plus proche ; installé sur un meuble, au-dessus du
  // personnage : se relever (et ce que permet la place).
  const sitting = seating.settled && !gym.active && !riding && !editing() && !barPanel.isOpen
  const near = gym.active || riding || sitePanel.isOpen || lift.isOpen || jukebox.isOpen || barPanel.isOpen || wardrobe.isOpen || editing() || seating.current || working ? null : nearestInteractable()
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
    if (sitting) screenPos.set(player.position.x, player.position.y + 1.3, player.position.z).project(iso.camera)
    else screenPos.set(near!.position.x, deck.y + 1.1, near!.position.z).project(iso.camera)
    const x = ((screenPos.x + 1) / 2) * innerWidth
    const y = ((1 - screenPos.y) / 2) * innerHeight
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
    music.setRoom(source === deck, !!jukeboxRoom && jukeboxRoom === playerRoom)
  }
  // La soirée bat sur le morceau entendu dans la pièce, sauf quand le mode photo fige l'instant.
  if (!photo.frozen && !deckMusic.syncTempo() && !holdMusic.syncTempo() && !cabinMusic.syncTempo()) syncTempo(null)

  workStep(dt)
  dialog.update(dt)
  seating.arbitrate()
  sendState()
  // Couché sur un lit : de petits « Zzz » de temps en temps, chez soi comme chez les autres.
  snore += dt
  if (snore > 4.5) {
    snore = 0
    if (seating.settled && seating.pose === 'lie') bubbles.emote('me', 'moon-stars')
    for (const r of remotes.values()) if (r.group.visible && r.pose === 'lie') bubbles.emote(`p${r.id}`, 'moon-stars')
  }

  renderer.render(scene, iso.camera)
  bubbles.update(iso.camera)

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
})

// Compile tous les shaders avant la première image (pas d'à-coup au premier fondu de mur).
for (const d of decks) d.group.visible = true
renderer.compile(scene, iso.camera)
setDeck(deck)

bootDone()
$('hud').hidden = false
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
    __game: { renderer, sound, player, cat, companions, cabin, seating, sitOn, interactables: () => deck.interactables, arcade: () => arcade, photo, wallet, board, music: { deck: deckMusic, hold: holdMusic, cabin: cabinMusic }, tempo, get editor() { return editor }, openEditor, closeEditor, net, remotes, visiting: () => visiting, sees: (id: number) => { const r = remotes.get(id); return r ? sees(r) : null }, openWardrobe, applyLook, ride, emote, goTo: (x: number, z: number) => goTo({ x, z }), say: (t: string) => chat.onSend?.(t), interact: tryInteract, deck: () => deck, iso, systems: systemView },
  })
}
