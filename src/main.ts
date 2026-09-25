import * as THREE from 'three'
import { CAT_MODEL, preload, rig } from './assets'
import type { CabinEditor } from './cabin/editor'
import { CabinBar, InviteMenu, InviteToasts, type CrewEntry } from './cabin/hud'
import { DEFAULT_CABIN, normalizeLayout, sameLayout, serializeLayout, type CabinItem } from './cabin/layout'
import { CabinStore, requestCabin, type SiteCabin } from './cabin/storage'
import { devCmdr, fetchCmdrAccount, isLegacyDefaultName, randomCmdrName } from './cmdr'
import { Sound } from './audio'
import { Avatar, EMOTES } from './avatar'
import { IsoCamera } from './camera'
import { Cat } from './cat'
import { Deck, type Interactable } from './deck'
import { holoMeGlow } from './furniture'
import { CAT_SPAWN, DEFAULT_AMBIENCE, LEVEL_HEIGHT, LEVELS, LIFT, SPAWN } from './levels'
import { hydrateIcons, icon } from './icons'
import { lookId, lookPath, lookRig, parseLook, RACES, raceOf, randomLook, variantsOf, type Look } from './looks'
import { Net, type PlayerState } from './net'
import type { Tile } from './pathfinding'
import { overlapsAny, resolveCircle } from './physics'
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

// Compte Élite Dangereuse et quartiers aménagés : demandés au site pendant le chargement des
// modèles (le cookie du site identifie le CMDR ; un invité reçoit un refus).
const accountRequest = fetchCmdrAccount(15000)
const cabinRequest = requestCabin(15000)
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
  skin: lookId(store.get('skin') ? parseLook(store.get('skin')) : randomLook()),
}
store.set('skin', profile.skin)
/** Compte lié au site (le relais le confirme en faisant reconnaître le cookie du site). */
let linked = false
/** Le relais a reconnu le CMDR : nom verrouillé, badge « vérifié ». */
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

// Les quartiers du commandant : la cabine du joueur, meublée selon son aménagement.
const cabinDeck = decks.find((d) => d.cabin)!
const cabin = cabinDeck.cabin!

/** Réponse du site (ou son absence) : l'aménagement à montrer, envoyé au site s'il vient de ce navigateur. */
function connectStore(store: CabinStore, site: SiteCabin | null): CabinItem[] {
  const { layout, upload } = store.connect(site)
  const items = normalizeLayout(layout ?? DEFAULT_CABIN, cabin.bounds)
  if (upload) store.save(items)
  return items
}

/**
 * Aménagement des quartiers du joueur : pour un CMDR, celui du site (en attendant sa réponse,
 * celui gardé dans ce navigateur) ; sinon, celui d'origine.
 */
let ownLayout: CabinItem[] = !cabinStore
  ? normalizeLayout(DEFAULT_CABIN, cabin.bounds)
  : siteCabin !== undefined
    ? connectStore(cabinStore, siteCabin)
    : normalizeLayout(cabinStore.localCopy ?? DEFAULT_CABIN, cabin.bounds)
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

const player = new Player(new Avatar(await lookRig(parseLook(profile.skin))), deck.colliders)
const spawn = spawnPoint()
player.position.set(spawn.x, deck.y, spawn.z)
scene.add(player.root)

// Comète vit près de son panier.
const catDeck = cabinDeck
const basket = cabin.items.find((i) => i.m === 'cat-bed') ?? CAT_SPAWN
const cat = new Cat(await rig(CAT_MODEL), catDeck, basket.x, basket.z)
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

/** Lumières du pont affiché dans la réserve (celles de la cabine suivent ses meubles). */
function applyLights() {
  for (const [i, l] of lightPool.entries()) {
    const def = deck.lights[i]
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

function setDeck(next: Deck) {
  deck = next
  for (const d of decks) d.group.visible = d === deck
  player.colliders = deck.colliders
  player.position.y = deck.y
  iso.snapTo(player.position)
  applyLights()
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
const net = new Net(profile, devCmdr())

let lastAnnouncedName = ''

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
    for (const id of [...remotes.keys()]) removeRemote(id)
    inviteToasts.clear()
    inviteMenu.close()
    leaveVisit('Liaison perdue avec le relais : retour dans vos quartiers.')
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
      chat.add('system', m.players.length ? `Connecté. ${m.players.length} autre(s) membre(s) d'équipage à bord.` : 'Connecté. Personne d\'autre à bord pour l\'instant.')
      break
    case 'join':
      addRemote(m.player)
      chat.add('system', [nameTag(m.player.name, m.player.verified), ' a embarqué.'])
      break
    case 'leave': {
      const r = remotes.get(m.id)
      if (r) chat.add('system', `${r.name} a débarqué.`)
      if (visiting?.host === m.id || entering === m.id) leaveVisit(`${r?.name ?? 'Votre hôte'} a quitté le vaisseau : retour dans vos quartiers.`)
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
      chat.add('system', `${m.name} a décliné votre invitation.`)
      refreshInviteMenu()
      break
    case 'visit': {
      if (m.id === net.id) {
        const host = visiting?.name ?? remotes.get(entering ?? -1)?.name ?? 'Votre hôte'
        if (m.cabin !== net.id) void enterVisit(m.cabin)
        else if (visiting || entering !== null) leaveVisit(m.by ? `${host} vous a raccompagné : retour dans vos quartiers.` : 'Retour dans vos quartiers.')
        else if (joining !== null) chat.add('system', 'Cette invitation a expiré.')
        joining = null
        break
      }
      const r = remotes.get(m.id)
      if (!r) break
      if (m.cabin === net.id && r.cabin !== net.id) chat.add('system', `${r.name} est entré dans vos quartiers.`)
      else if (r.cabin === net.id && m.cabin !== net.id) chat.add('system', `${r.name} a quitté vos quartiers.`)
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
    case 'inviter': {
      if (!verified || !net.online) return chat.add('system', 'Inviter dans ses quartiers est réservé aux CMDR connectés au site, en ligne.')
      if (!arg) return chat.add('system', 'Usage : /inviter CMDR Nom')
      const key = (n: string) => n.toLowerCase().replace(/^cmdr\s+/, '').replace(/\s+\(invité\)$/, '').trim()
      const r = [...remotes.values()].find((x) => key(x.name) === key(arg))
      if (!r) return chat.add('system', `Personne à bord ne s'appelle ${arg}.`)
      return invite(r.id)
    }
    case 'aide':
      return chat.add('system', `Commandes : /nom CMDR Pseudo (invités) · /perso · /inviter CMDR Nom · ${EMOTES.map((x) => '/' + x.id).join(' ')}`)
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
      onChange: (items) => {
        ownLayout = items
        cabinStore?.save(items)
        if (verified) net.sendCabin(serializeLayout(items))
      },
      onClose: () => closeEditor(),
    })
  })
  return editorLoading
}

/**
 * CMDR reconnu par le relais sans que le site ait répondu au chargement : on va chercher ses
 * quartiers maintenant (en attendant, ceux gardés dans ce navigateur).
 */
function adoptAccount() {
  if (cabinStore) return
  const store = (cabinStore = new CabinStore(profile.name.replace(/^CMDR /, '')))
  setOwnLayout(normalizeLayout(store.localCopy ?? DEFAULT_CABIN, cabin.bounds))
  void requestCabin().then((site) => siteAnswered(store, site))
}

/** Le site répond en cours de partie : ses quartiers remplacent ceux montrés en attendant. */
function siteAnswered(store: CabinStore, site: SiteCabin | null) {
  if (cabinStore === store) setOwnLayout(connectStore(store, site))
}

/** Aménagement de ses quartiers venu d'ailleurs que du mode aménagement (qui attend le site). */
function setOwnLayout(items: CabinItem[]) {
  if (sameLayout(items, ownLayout)) return
  ownLayout = items
  if (verified) net.sendCabin(serializeLayout(items))
  if (!visiting) showCabin()
}

/** Position dans la cabine (le bon pont, la bonne pièce) ? */
function inCabin(level: number, x: number, z: number): boolean {
  return level === cabinDeck.def.id && cabin.contains(x, z)
}

async function openEditor() {
  if (editing() || riding) return
  if (visiting) return chat.add('system', 'Ces quartiers ne sont pas les vôtres : on n\'aménage que chez soi.')
  if (!linked) return chat.add('system', 'Aménager ses quartiers est réservé aux CMDR connectés à elitedangereuse.fr.')
  if (!cabinStore?.ready) return chat.add('system', 'Vos quartiers arrivent du site, encore un instant…')
  if (!editor) {
    await loadEditor()
    // On a pu partir (ascenseur, invitation) pendant le chargement.
    if (!editor || editing() || riding || visiting || !inCabin(deck.def.id, player.position.x, player.position.z)) return
  }
  const store = cabinStore
  const ed = editor
  if (!inCabin(deck.def.id, player.position.x, player.position.z)) return chat.add('system', 'On aménage ses quartiers depuis ses quartiers, sur le pont supérieur.')
  lift.close()
  wardrobe.close(false)
  player.cancelPath()
  marker.visible = hover.visible = false
  editZoom = iso.zoomLevel
  iso.setRestElevation(editElevation)
  iso.zoomTo(ed.fitZoom())
  document.body.classList.add('editing')
  ed.start(ownLayout)
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
  void cabinStore?.flush()
}
cabinBar.onEdit = () => void openEditor()

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
  cabin.setLayout(visiting ? normalizeLayout(hostLayouts.get(visiting.host) ?? DEFAULT_CABIN, cabin.bounds) : ownLayout)
  // Un meuble a pu apparaître sous nos pieds (ou sous les pattes de Comète).
  if (deck === cabinDeck) unstick(player.position, 0.18)
  unstick(cat.root.position, 0.12)
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

function invite(id: number) {
  const r = remotes.get(id)
  if (!r) return
  if (r.cabin === net.id) return chat.add('system', `${r.name} est déjà dans vos quartiers.`)
  net.sendInvite(id)
  invitedAt.set(id, Date.now() + 60000)
  refreshInviteMenu()
  chat.add('system', `Invitation envoyée à ${r.name}.`)
}

/** Invitation acceptée : on demande au relais d'entrer (il vérifie qu'elle est valable). */
function acceptInvite(host: number) {
  if (!net.online) return
  joining = host
  net.sendVisit(host)
}

/** Le relais nous fait entrer : téléportation devant la porte des quartiers de l'hôte. */
async function enterVisit(host: number) {
  const seq = ++visitSeq
  const name = remotes.get(host)?.name ?? 'un CMDR'
  entering = host
  if (editing()) closeEditor()
  wardrobe.close(false)
  lift.close()
  inviteMenu.close()
  inviteToasts.remove(host)
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
  if (seq === visitSeq && visiting?.host === host) chat.add('system', `Vous voici dans les quartiers de ${name}. Ressortez par la porte pour rentrer chez vous.`)
}

/** Fin de visite (ou d'une entrée en cours) : on retrouve ses propres quartiers, là où l'on se tient. */
function leaveVisit(message?: string) {
  const was = visiting !== null || entering !== null
  visitSeq++
  entering = null
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
  leaveVisit('Retour dans vos quartiers.')
}
inviteMenu.onInvite = invite
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
  if (chat.typing) return
  // Mode aménagement : ses touches d'abord (les flèches se répètent pour ajuster un objet).
  if (editing() && editor!.keyDown(e)) return
  if (e.repeat) return
  if (liftKey(e)) return
  if (e.code === 'Enter') {
    e.preventDefault()
    return chat.open()
  }
  if (e.code === 'Escape') {
    toggleAbout(false)
    inviteMenu.close()
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
  if (editing()) return
  if (e.code === 'KeyE' || e.code === 'Space') tryInteract()
  const digit = /^Digit([1-9])$/.exec(e.code)
  if (digit && EMOTES[+digit[1] - 1]) emote(EMOTES[+digit[1] - 1].id)
})
addEventListener('keyup', (e) => keys.delete(e.code))
addEventListener('blur', () => keys.clear())
chat.onOpen = () => keys.clear()

const inputDir = new THREE.Vector3()
function keyboardDirection(): THREE.Vector3 {
  inputDir.set(0, 0, 0)
  if (chat.typing || riding || lift.isOpen || editing()) return inputDir
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
    if (!lift.isOpen || lift.contains(e.target)) return
    lift.close()
    e.stopPropagation()
  },
  { capture: true },
)

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || riding) return
  if (editing()) {
    // Objet glissé jusque sous le catalogue : il le relâche quand même dans le mode aménagement.
    try {
      canvas.setPointerCapture(e.pointerId)
    } catch {}
    return editor!.pointerDown(e)
  }
  if (wardrobe.isOpen) return wardrobe.close(false)
  const { tile, item } = pick(e)
  if (item) return goInteract(item)
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

/** Marche jusqu'à la tuile libre la plus proche de l'objet, puis interagit. */
function goInteract(item: Interactable) {
  if (distanceTo(item) < INTERACT_RANGE) return interactWith(item)
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
  if (riding || lift.isOpen || wardrobe.isOpen || editing()) return
  const item = nearestInteractable()
  if (item) interactWith(item)
}

function interactWith(item: Interactable) {
  player.lookAt(item.position)
  if (item.onInteract) return item.onInteract()
  player.interact()
  net.sendEmote('interact')
  const text = typeof item.text === 'function' ? item.text() : item.text
  if (Array.isArray(text)) dialog.show(text[Math.floor(Math.random() * text.length)])
  else if (text) dialog.show(text)
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
  if (!editing()) processHover()
  player.update(dt, input, keys.has('ShiftLeft') || keys.has('ShiftRight'))

  for (const r of remotes.values()) {
    r.update(dt)
    r.group.visible = sees(r)
  }
  cat.update(dt, catDeck === deck ? player.position : null, player.avatar.emoteId === 'danse')

  // En mode aménagement, la caméra regarde la cabine, pas le personnage.
  iso.update(dt, editing() ? editor!.focus(editFocus) : player.position)
  iso.toCamera(toCam)

  // Qui se trouve sur quel pont (pour ouvrir les portes).
  for (const list of actors.values()) list.length = 0
  actors.get(deck)!.push(player.position)
  actors.get(catDeck)!.push(cat.root.position)
  // Un joueur d'une autre instance des quartiers n'ouvre pas nos portes.
  for (const r of remotes.values()) if (r.group.visible || r.level !== deck.def.id) actors.get(deckById(r.level))?.push(r.group.position)
  for (const d of decks) d.update(dt, actors.get(d)!, d === deck ? player.position : null, toCam, editing() && d === cabinDeck)
  editor?.update(timer.getElapsed())

  stars.update(dt, iso.target, toCam, iso.tilt)
  sound.update(iso.target, iso.angle)
  ambience(dt)
  for (const [i, l] of lightPool.entries()) {
    const def = deck.lights[i]
    if (def?.flicker) l.intensity = def.intensity * flicker(def.flicker, timer.getElapsed(), i)
  }
  marker.scale.setScalar(1 + Math.sin(timer.getElapsed() * 6) * 0.12)

  // Pièce courante.
  const here = inCabin(deck.def.id, player.position.x, player.position.z)
  // On sort des quartiers d'un hôte par la porte : on rentre chez soi.
  if (visiting && !here && !riding) {
    net.sendVisit(null)
    leaveVisit()
  }
  const name = visiting && here ? `Quartiers de ${visiting.name}` : deck.roomName(player.position.x, player.position.z)
  if (name !== currentRoom) {
    currentRoom = name
    roomEl.textContent = name
  }

  // Dans ses quartiers : de quoi les aménager.
  cabinBar.set(
    !here || editing() ? null : visiting ? { kind: 'visit', host: visiting.name } : { kind: 'own', canEdit: linked, canInvite: verified && net.online, loginUrl: loginUrl() },
  )
  if (!here && inviteMenu.isOpen) inviteMenu.close()

  // Invite « E » au-dessus de l'objet le plus proche.
  const near = riding || lift.isOpen || wardrobe.isOpen || editing() ? null : nearestInteractable()
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
  const { refusal } = await import('./cabin/rules')
  Object.assign(window, { __refusal: (items: CabinItem[], i: number) => refusal(cabin, items, i) })
  Object.assign(window, {
    __game: { renderer, sound, player, cat, cabin, get editor() { return editor }, openEditor, closeEditor, net, remotes, visiting: () => visiting, sees: (id: number) => { const r = remotes.get(id); return r ? sees(r) : null }, openWardrobe, applyLook, ride, emote, goTo: (x: number, z: number) => goTo({ x, z }), say: (t: string) => chat.onSend?.(t), interact: tryInteract, deck: () => deck, iso },
  })
}
