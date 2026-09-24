import * as THREE from 'three'
import { CAT_MODEL, preload, rig } from './assets'
import { fetchCmdrAccount, isLegacyDefaultName, randomCmdrName } from './cmdr'
import { Sound } from './audio'
import { Avatar, EMOTES } from './avatar'
import { IsoCamera } from './camera'
import { Cat } from './cat'
import { Deck, type Interactable } from './deck'
import { CAT_SPAWN, DEFAULT_AMBIENCE, LEVEL_HEIGHT, LEVELS, LIFT, SPAWN } from './levels'
import { hydrateIcons, icon } from './icons'
import { lookId, lookPath, lookRig, parseLook, RACES, raceOf, randomLook, variantsOf, type Look } from './looks'
import { Net, type PlayerState } from './net'
import type { Tile } from './pathfinding'
import { Player } from './player'
import { RemotePlayer } from './remote'
import { Starfield } from './starfield'
import { $, Bubbles, Chat, Dialog, fadeScreen, LiftPanel, nameTag, WardrobePanel } from './ui'

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

// Compte Élite Dangereuse : demandé au site pendant le chargement des modèles.
const accountRequest = fetchCmdrAccount()

/**
 * `name` : nom affiché (CMDR du site si le compte est lié, sinon nom d'invité).
 * `skin` : identifiant d'apparence (cf. looks.ts), ex. « alien.female.c.blue ».
 */
const profile = {
  name: guestName,
  skin: lookId(store.get('skin') ? parseLook(store.get('skin')) : randomLook()),
}
store.set('skin', profile.skin)
/** Compte lié au site (le relais le confirme en vérifiant le billet). */
let linked = false
/** Le relais a vérifié le billet : nom verrouillé, badge « vérifié ». */
let verified = false

// ------------------------------------------------------------------ rendu

const MAX_DPR = Math.min(devicePixelRatio, 2)
let dpr = Math.min(MAX_DPR, 1.5)
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(dpr)
renderer.setSize(innerWidth, innerHeight)
renderer.setClearColor(0x000000, 0) // fond : dégradé CSS
renderer.shadowMap.enabled = true
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

await preload([lookPath(parseLook(profile.skin))], (r) => ($('loading-bar').style.width = `${Math.round(r * 100)}%`))
const account = await accountRequest
if (account) {
  linked = true
  profile.name = `CMDR ${account.cmdr}`
}

const decks = LEVELS.map((def) => new Deck(def))
for (const d of decks) scene.add(d.group)
const deckById = (id: number) => decks.find((d) => d.def.id === id)!
let deck = deckById(SPAWN.level)

const stars = new Starfield()
scene.add(stars.group)

const player = new Player(new Avatar(await lookRig(parseLook(profile.skin))), deck.colliders)
player.position.set(SPAWN.x, deck.y, SPAWN.z)
scene.add(player.root)

const catDeck = deckById(CAT_SPAWN.level)
const cat = new Cat(await rig(CAT_MODEL), catDeck, CAT_SPAWN.x, CAT_SPAWN.z)
catDeck.interactables.push({
  object: cat.root,
  position: cat.root.position,
  label: `Caresser ${cat.name}`,
  onInteract: () => {
    player.interact()
    net.sendEmote('interact')
    cat.pet(player.position)
  },
})

const sound = new Sound()
scene.add(sound.rig)

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
const promptEl = $('prompt')
const promptLabel = $('prompt-label')

bubbles.attach('me', (out) => player.avatar.head(out))
bubbles.attach('cat', (out) => (catDeck.group.visible ? cat.root.getWorldPosition(out).setY(out.y + 0.55) : null))

hydrateIcons()
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

/** Boucles sonores des machines (raffinerie…), une par meuble, coupées hors de leur pont. */
const hums: { deck: Deck; gain: GainNode; volume: number }[] = []

/** Vacillement d'une lumière : néon fatigué (brèves crises de grésillement) ou feu de cheminée. */
function flicker(kind: 'neon' | 'fire', t: number, seed: number): number {
  if (kind === 'fire') return 0.8 + 0.12 * Math.sin(t * 7.3 + seed) + 0.08 * Math.sin(t * 17.9 + seed * 2)
  const crisis = Math.sin(t * 0.9 + seed * 5) + Math.sin(t * 2.3 + seed) * 0.6
  return crisis > 1.3 && Math.sin(t * 90) > 0.2 ? 0.25 : 1
}

function setDeck(next: Deck) {
  deck = next
  for (const d of decks) d.group.visible = d === deck
  player.colliders = deck.colliders
  player.position.y = deck.y
  iso.snapTo(player.position)
  for (const [i, l] of lightPool.entries()) {
    const def = deck.lights[i]
    l.intensity = def ? def.intensity : 0
    if (def) {
      l.position.copy(def.position)
      l.color.copy(def.color)
    }
  }
  const ambience = deck.def.ambience ?? DEFAULT_AMBIENCE
  hemi.color.set(ambience.sky)
  hemi.groundColor.set(ambience.ground)
  hemi.intensity = ambience.hemi
  sun.color.set(ambience.sun)
  sun.intensity = ambience.sunIntensity
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
  if (purr) bubbles.say('cat', 'Mrrrou…', 'heart')
  else bubbles.say('cat', 'Miaou ?')
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
// Premier billet : celui obtenu au chargement ; ensuite, un billet frais à chaque reconnexion.
let firstTicket = account?.ticket
const net = new Net(profile, async () => {
  if (!linked) return undefined
  const t = firstTicket ?? (await fetchCmdrAccount())?.ticket
  firstTicket = undefined
  return t
})

let lastAnnouncedName = ''

function updateIdentity() {
  const el = $('identity')
  el.replaceChildren()
  const name = document.createElement('span')
  name.className = verified ? 'id-name verified' : 'id-name'
  name.append(nameTag(profile.name, verified))
  el.appendChild(name)
  if (!linked) {
    const a = document.createElement('a')
    a.href = 'https://elitedangereuse.fr/'
    a.target = '_blank'
    a.rel = 'noopener'
    a.textContent = 'Invité · se connecter au site'
    el.appendChild(a)
  } else if (net.online && !verified) {
    const w = document.createElement('span')
    w.className = 'id-warn'
    w.textContent = 'compte non vérifié par le serveur'
    el.appendChild(w)
  }
}
const levelY = (level: number) => level * LEVEL_HEIGHT

function updateNetStatus() {
  const el = $('net')
  el.classList.toggle('online', net.online)
  el.replaceChildren(icon(net.online ? 'users-three' : 'user-solo'), net.online ? `En ligne · ${remotes.size + 1} à bord` : 'Solo')
}

function addRemote(s: PlayerState) {
  if (remotes.has(s.id)) return
  const r = new RemotePlayer(s.id, s, levelY)
  remotes.set(s.id, r)
  scene.add(r.group)
  bubbles.attach(`p${s.id}`, (out) => (r.group.visible && r.avatar ? r.avatar.head(out) : null), r.name, s.verified)
  r.onStep = (pos, sprint) => {
    if (r.level === deck.def.id) footstep(r.level, pos, sprint, r.skin)
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
  if (!online) for (const id of [...remotes.keys()]) removeRemote(id)
  updateNetStatus()
  updateIdentity()
}
net.onMessage = (m) => {
  switch (m.t) {
    case 'welcome':
      // Le relais fait autorité sur le nom (CMDR vérifié, ou invité homonyme d'un CMDR présent).
      profile.name = m.you.name
      verified = m.you.verified
      updateIdentity()
      for (const p of m.players) addRemote(p)
      chat.add('system', m.players.length ? `Connecté. ${m.players.length} autre(s) membre(s) d'équipage à bord.` : 'Connecté. Personne d\'autre à bord pour l\'instant.')
      break
    case 'join':
      addRemote(m.player)
      chat.add('system', [nameTag(m.player.name, m.player.verified), ' a embarqué.'])
      break
    case 'leave': {
      const r = remotes.get(m.id)
      if (r) chat.add('system', `${r.name} a débarqué.`)
      removeRemote(m.id)
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
      r.emote(m.emote)
      const def = EMOTES.find((e) => e.id === m.emote)
      if (def && r.level === deck.def.id) bubbles.emote(`p${m.id}`, def.icon)
      break
    }
    case 'profile': {
      if (m.id === net.id) {
        // Nom accepté par le relais (éventuellement suffixé « (invité) »).
        if (!verified && m.name !== lastAnnouncedName) chat.add('system', `Vous vous appelez désormais ${m.name}.`)
        lastAnnouncedName = m.name
        profile.name = m.name
        updateIdentity()
        break
      }
      const r = remotes.get(m.id)
      if (!r) break
      if (r.name !== m.name) chat.add('system', `${r.name} s'appelle désormais ${m.name}.`)
      r.name = m.name
      bubbles.rename(`p${m.id}`, m.name, m.verified)
      if (r.skin !== m.skin) {
        r.skin = m.skin
        void r.load()
      }
      break
    }
  }
  updateNetStatus()
}
net.connect()

// ------------------------------------------------------------------ chat & emotes

function emote(id: string) {
  const def = player.avatar.playEmote(id)
  if (!def) return
  player.cancelPath()
  marker.visible = false
  bubbles.emote('me', def.icon)
  net.sendEmote(id)
  sound.play('emote', null, { volume: 0.06 })
}

chat.onSend = (text) => {
  if (text.startsWith('/')) return command(text)
  chat.add('me', text, nameTag(profile.name, verified))
  bubbles.say('me', text)
  net.sendChat(text)
  sound.play('chat', null, { volume: 0.1, rate: 1.2 })
}

async function command(text: string) {
  const [cmd, ...rest] = text.slice(1).split(' ')
  const arg = rest.join(' ').trim()
  const e = EMOTES.find((x) => x.id === cmd.toLowerCase())
  if (e) return emote(e.id)
  switch (cmd.toLowerCase()) {
    case 'nom':
      if (linked) return chat.add('system', `Votre nom vient de votre compte Élite Dangereuse : ${profile.name}.`)
      if (!arg) return chat.add('system', 'Usage : /nom CMDR Pseudo')
      profile.name = arg.slice(0, 32)
      store.set('name', profile.name)
      updateIdentity()
      // En ligne, le relais confirme (et peut suffixer « (invité) ») : message à la réponse.
      if (net.online) return net.sendProfile(profile)
      return chat.add('system', `Vous vous appelez désormais ${profile.name}.`)
    case 'perso': {
      const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]
      const race = pick(RACES)
      const sex = Math.random() < 0.5 ? 'female' : 'male'
      const look: Look = {
        race: race.id,
        sex,
        variant: pick(variantsOf(race, sex)).id,
        tint: race.tints ? pick(race.tints).id : 'green',
      }
      await applyLook(look)
      return saveLook(look)
    }
    case 'aide':
      return chat.add('system', `Commandes : /nom CMDR Pseudo (invités) · /perso · ${EMOTES.map((x) => '/' + x.id).join(' ')}`)
    default:
      return chat.add('system', `Commande inconnue : /${cmd}. Tapez /aide.`)
  }
}

chat.add(
  'system',
  linked
    ? `Bienvenue à bord, ${profile.name}. Compte Élite Dangereuse lié. Entrée pour discuter, /aide pour les commandes.`
    : `Bienvenue à bord, ${profile.name} (invité). Entrée pour discuter, /aide pour les commandes.`,
)

// ------------------------------------------------------------------ garde-robe

const wardrobe = new WardrobePanel()
const wardrobeDeck = decks.find((d) => d.wardrobeInteractable)!
const wardrobePad = wardrobeDeck.wardrobeInteractable!
let dressing: { original: string; zoom: number } | null = null
let lookRequest = 0
let spin = 0

/** Change le modèle du joueur (la dernière demande l'emporte si plusieurs chargements se croisent). */
async function applyLook(look: Look) {
  const req = ++lookRequest
  const r = await lookRig(look)
  if (req === lookRequest) player.setAvatar(new Avatar(r))
}

function describe(look: Look): string {
  const race = raceOf(look)
  const parts = [race.label]
  if (race.sexed) parts.push(look.sex === 'female' ? 'femme' : 'homme')
  parts.push(variantsOf(race, look.sex).find((v) => v.id === look.variant)?.label ?? '')
  const tint = race.tints?.find((t) => t.id === look.tint)
  if (tint) parts.push(tint.label)
  return parts.join(' · ')
}

function saveLook(look: Look) {
  profile.skin = lookId(look)
  store.set('skin', profile.skin)
  net.sendProfile(profile)
  chat.add('system', `Nouvelle apparence : ${describe(look)}.`)
}

function openWardrobe() {
  const start = () => {
    dressing = { original: profile.skin, zoom: iso.zoomLevel }
    iso.zoomTo(2.3)
    spin = Math.atan2(toCam.x, toCam.z) // face à la caméra
    wardrobeDeck.wardrobeGlow = 1
    sound.play('lift', new THREE.Vector3(wardrobePad.position.x, deck.y + 0.5, wardrobePad.position.z), { volume: 0.1, rate: 1.4 })
    wardrobe.open(parseLook(profile.skin))
  }
  // On monte d'abord sur la plateforme.
  if (Math.hypot(player.position.x - wardrobePad.position.x, player.position.z - wardrobePad.position.z) > 0.1) {
    player.setPath([{ x: wardrobePad.position.x, z: wardrobePad.position.z }])
    player.onArrive = start
  } else start()
}
wardrobePad.onInteract = openWardrobe

wardrobe.onChange = (look) => {
  void applyLook(look)
  sound.play('emote', null, { volume: 0.04, rate: 1.3 })
}
wardrobe.onClose = (confirmed, look) => {
  if (!dressing) return
  iso.zoomTo(dressing.zoom)
  wardrobeDeck.wardrobeGlow = 0
  if (confirmed) {
    if (lookId(look) !== dressing.original) saveLook(look)
    emote('joie')
  } else if (lookId(parseLook(dressing.original)) !== lookId(look)) {
    void applyLook(parseLook(dressing.original))
  }
  dressing = null
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

// ------------------------------------------------------------------ entrées

const keys = new Set<string>()
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
  if (chat.typing || e.repeat) return
  if (liftKey(e)) return
  if (e.code === 'Enter') {
    e.preventDefault()
    return chat.open()
  }
  if (e.code === 'Escape') return wardrobe.close(false)
  keys.add(e.code)
  if (e.code === 'KeyR') iso.rotate(e.shiftKey ? -1 : 1)
  if (e.code === 'KeyE' || e.code === 'Space') tryInteract()
  if (e.code === 'KeyM') {
    sound.toggleMute()
    updateMuteButton()
  }
  if (e.code === 'KeyH') $('help').hidden = !$('help').hidden
  const digit = /^Digit([1-9])$/.exec(e.code)
  if (digit && EMOTES[+digit[1] - 1]) emote(EMOTES[+digit[1] - 1].id)
})
addEventListener('keyup', (e) => keys.delete(e.code))
addEventListener('blur', () => keys.clear())
chat.onOpen = () => keys.clear()

const inputDir = new THREE.Vector3()
function keyboardDirection(): THREE.Vector3 {
  inputDir.set(0, 0, 0)
  if (chat.typing || riding || lift.isOpen) return inputDir
  const on = (...codes: string[]) => codes.some((c) => keys.has(c))
  // event.code = position physique : KeyW/KeyA correspondent à Z/Q sur un clavier AZERTY.
  const sx = (on('KeyD', 'ArrowRight') ? 1 : 0) - (on('KeyA', 'ArrowLeft') ? 1 : 0)
  const sy = (on('KeyW', 'ArrowUp') ? 1 : 0) - (on('KeyS', 'ArrowDown') ? 1 : 0)
  if (!sx && !sy) return inputDir
  return iso.screenToGround(sx, sy, inputDir).normalize()
}

addEventListener('wheel', (e) => iso.zoomBy(Math.exp(e.deltaY * 0.001)), { passive: true })
$('rot-left').onclick = () => iso.rotate(-1)
$('rot-right').onclick = () => iso.rotate(1)
$('zoom-in').onclick = () => iso.zoomBy(0.8)
$('zoom-out').onclick = () => iso.zoomBy(1.25)
$('mute').onclick = () => {
  sound.toggleMute()
  updateMuteButton()
}
$('help-toggle').onclick = () => ($('help').hidden = !$('help').hidden)

const raycaster = new THREE.Raycaster()
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const groundHit = new THREE.Vector3()
const pointer = new THREE.Vector2()
const canvas = renderer.domElement

function pick(e: PointerEvent): { tile: Tile | null; item: Interactable | null } {
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
  return { tile: tile && deck.map.isFloor(tile.x, tile.z) ? tile : null, item }
}

// Survol traité une fois par image (les souris 1000 Hz enverraient des centaines de lancers de rayon).
let pendingMove: PointerEvent | null = null
canvas.addEventListener('pointermove', (e) => (pendingMove = e))
function processHover() {
  if (!pendingMove) return
  const { tile, item } = pick(pendingMove)
  pendingMove = null
  canvas.style.cursor = item ? 'pointer' : 'default'
  hover.visible = !!tile && deck.pathfinder.walkable(tile.x, tile.z)
  if (tile) hover.position.set(tile.x, deck.y + 0.01, tile.z)
}

// Clic en dehors du panneau d'ascenseur : il se ferme, et le clic ne fait rien d'autre.
addEventListener(
  'pointerdown',
  (e) => {
    if (!lift.isOpen || lift.contains(e.target)) return
    lift.close()
    e.stopPropagation()
  },
  { capture: true },
)

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || riding) return
  if (wardrobe.isOpen) return wardrobe.close(false)
  const { tile, item } = pick(e)
  if (item) return goInteract(item)
  if (tile) goTo(tile)
})

function playerTile(): Tile {
  return { x: Math.round(player.position.x), z: Math.round(player.position.z) }
}

function goTo(tile: Tile, onArrive?: () => void): boolean {
  const path = deck.pathfinder.find(playerTile(), tile)
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

/** Marche jusqu'à la tuile libre la plus proche de l'objet, puis interagit. */
function goInteract(item: Interactable) {
  if (distanceTo(item) < INTERACT_RANGE) return interactWith(item)
  const start = playerTile()
  const candidates: { tile: Tile; len: number }[] = []
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      const t = { x: Math.round(item.position.x) + dx, z: Math.round(item.position.z) + dz }
      if (!deck.pathfinder.walkable(t.x, t.z)) continue
      if (Math.hypot(t.x - item.position.x, t.z - item.position.z) > INTERACT_RANGE) continue
      const path = deck.pathfinder.find(start, t)
      if (path) candidates.push({ tile: t, len: path.length })
    }
  }
  candidates.sort((a, b) => a.len - b.len)
  if (candidates.length) goTo(candidates[0].tile, () => interactWith(item))
}

// ------------------------------------------------------------------ interactions

const INTERACT_RANGE = 1.45

function distanceTo(item: Interactable): number {
  return Math.hypot(player.position.x - item.position.x, player.position.z - item.position.z)
}

function nearestInteractable(): Interactable | null {
  let best: Interactable | null = null
  let bestD = INTERACT_RANGE
  for (const i of deck.interactables) {
    const d = distanceTo(i)
    if (d < bestD) {
      best = i
      bestD = d
    }
  }
  return best
}

function tryInteract() {
  if (riding || lift.isOpen || wardrobe.isOpen) return
  const item = nearestInteractable()
  if (item) interactWith(item)
}

function interactWith(item: Interactable) {
  player.lookAt(item.position)
  if (item.onInteract) return item.onInteract()
  player.interact()
  net.sendEmote('interact')
  if (Array.isArray(item.text)) dialog.show(item.text[Math.floor(Math.random() * item.text.length)])
  else if (item.text) dialog.show(item.text)
}

// ------------------------------------------------------------------ boucle

const roomEl = $('room')
let currentRoom = ''
const timer = new THREE.Timer()
timer.connect(document)
const toCam = new THREE.Vector3()
const screenPos = new THREE.Vector3()
const actors = new Map<Deck, THREE.Vector3[]>(decks.map((d) => [d, []]))
let perfTime = 0
let perfFrames = 0
let fastWindows = 0
/** Densité de pixels maximale autorisée ; redescend si l'affichage a déjà peiné à ce niveau. */
let dprCeiling = MAX_DPR
let promptText = ''

function frame() {
  timer.update()
  const dt = Math.min(timer.getDelta(), 0.05)

  const input = keyboardDirection()
  if (input.lengthSq() > 0) {
    marker.visible = false
    if (lift.isOpen) lift.close()
    if (wardrobe.isOpen) wardrobe.close(false)
  }
  if (wardrobe.isOpen) {
    // Essayage : le personnage tourne lentement sur lui-même.
    spin += dt * 0.7
    player.setHeading(spin)
  }
  processHover()
  player.update(dt, input, keys.has('ShiftLeft') || keys.has('ShiftRight'))

  for (const r of remotes.values()) {
    r.group.visible = r.level === deck.def.id
    r.update(dt)
  }
  cat.update(dt, catDeck === deck ? player.position : null, player.avatar.emoteId === 'danse')

  iso.update(dt, player.position)
  iso.toCamera(toCam)

  // Qui se trouve sur quel pont (pour ouvrir les portes).
  for (const list of actors.values()) list.length = 0
  actors.get(deck)!.push(player.position)
  actors.get(catDeck)!.push(cat.root.position)
  for (const r of remotes.values()) actors.get(deckById(r.level))?.push(r.group.position)
  for (const d of decks) d.update(dt, actors.get(d)!, d === deck ? player.position : null, toCam)

  stars.update(dt, iso.target, toCam)
  sound.update(iso.target, iso.angle)
  ambience(dt)
  for (const [i, l] of lightPool.entries()) {
    const def = deck.lights[i]
    if (def?.flicker) l.intensity = def.intensity * flicker(def.flicker, timer.getElapsed(), i)
  }
  marker.scale.setScalar(1 + Math.sin(timer.getElapsed() * 6) * 0.12)

  // Pièce courante.
  const name = deck.roomName(player.position.x, player.position.z)
  if (name !== currentRoom) {
    currentRoom = name
    roomEl.textContent = name
  }

  // Invite « E » au-dessus de l'objet le plus proche.
  const near = riding || lift.isOpen || wardrobe.isOpen ? null : nearestInteractable()
  if (promptEl.hidden !== !near) promptEl.hidden = !near
  if (near) {
    if (near.label !== promptText) promptLabel.textContent = promptText = near.label
    screenPos.set(near.position.x, deck.y + 1.1, near.position.z).project(iso.camera)
    const x = ((screenPos.x + 1) / 2) * innerWidth
    const y = ((1 - screenPos.y) / 2) * innerHeight
    promptEl.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`
  }
  // On s'éloigne de l'ascenseur : le panneau se ferme.
  if (lift.isOpen && Math.hypot(player.position.x - liftTile.x, player.position.z - liftTile.z) > 1.6) lift.close()

  dialog.update(dt)
  net.sendState(
    { x: player.position.x, z: player.position.z, yaw: player.heading, level: deck.def.id, anim: player.avatar.locomotion },
    performance.now(),
  )

  renderer.render(scene, iso.camera)
  bubbles.update(iso.camera)

  // Résolution adaptative : on baisse la densité de pixels si l'affichage peine,
  // on la remonte (sans dépasser le dernier niveau qui a peiné) s'il reste de la marge.
  perfTime += dt
  perfFrames++
  if (perfTime > 2) {
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

$('loading').classList.add('done')
$('hud').hidden = false
updateNetStatus()
updateIdentity()
frame()

// Accès de debug (dev uniquement) : window.__game dans la console.
if (import.meta.env.DEV) {
  Object.assign(window, {
    __game: { renderer, sound, player, cat, openWardrobe, applyLook, ride, emote, goTo: (x: number, z: number) => goTo({ x, z }), say: (t: string) => chat.onSend?.(t), interact: tryInteract, deck: () => deck, iso },
  })
}
