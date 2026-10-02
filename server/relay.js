// Relais multijoueur minimal (socket.io) : chaque client annonce sa position, ses messages
// et ses emotes ; le serveur valide, mémorise l'état et le rediffuse aux autres.
// Utilisé par le serveur de dev (plugin Vite) et par server/index.js en production.
//
// Identité : le jeu est servi sur le domaine du site, la poignée de main emporte donc le cookie
// ED_LOGGED_CMDR_ID. Le relais le fait reconnaître par le site (cf. cmdr.js), puis impose au
// joueur son nom de CMDR et le marque « vérifié ». Les autres sont des invités, libres de leur
// nom, mais sans la marque.
//
// Jukebox : le morceau choisi (et depuis quand il joue) est gardé pour le pont principal, et pour
// chaque instance des quartiers ; le relais le transmet à ceux qui sont là, et à ceux qui arrivent.
//
// Saut FSD : le vaisseau est dans un système (cf. shared/systems.js), le même pour tout le bord.
// Le pilote, installé dans son siège, demande un saut ; le relais choisit la destination et
// l'annonce à tous, qui le vivent ensemble. Un saut à la fois.
//
// Patrouille : le sergent Rourke fait sa ronde sur le pont principal (cf. shared/patrol.js). Le
// relais tient l'horloge de la ronde, la même pour tous ; un joueur qui lui parle l'arrête
// quelques secondes pour tout le bord, face à lui.
//
// Mess : Marcel, le chef, fait la tournée de sa cuisine (cf. shared/chef.js), sur une horloge
// que le relais tient de même. Un joueur qui prend une commande l'attire au bout du self pour tout le
// bord, tant qu'il cuisine (chaque étape relance l'attente), puis le chef reprend sa tournée.
//
// Infirmerie : Betty, l'infirmière, fait la tournée de l'infirmerie (cf. shared/nurse.js), sur une
// horloge que le relais tient de même. Un joueur allongé sur un lit qui l'appelle la fait venir à
// son chevet pour tout le bord, une consultation à la fois ; menée à son terme, elle lui laisse un
// pansement que tout le bord voit un moment.
//
// Hangar : Nico, le mécano, fait la tournée du hangar de la cale autour du Krait (cf.
// shared/mechanic.js), sur une horloge que le relais tient de même. Un joueur qui l'aide (une
// révision du Krait) l'attire devant le nez du vaisseau pour tout le bord, tant qu'il travaille
// (chaque étape relance l'attente), puis le mécano reprend sa tournée. Un joueur aux commandes
// du Krait peut mettre les réacteurs en route (quelques secondes au plus) : Nico panique, pour tout
// le bord, au pied de l'escabeau ; l'état de Nico dit aussi depuis quand ça tourne, et qui pilote.
//
// Serre : Capucine, la jardinière, fait la tournée de la serre hydroponique du pont supérieur (cf.
// shared/gardener.js), sur une horloge que le relais tient de même. Un joueur qui l'aide (une
// fiche de culture) l'attire au bout des pas japonais pour tout le bord, tant qu'il travaille
// (chaque étape relance l'attente), puis la jardinière reprend sa tournée.
//
// Quartiers : chaque joueur a sa propre instance des quartiers du commandant (`cabin` : l'id du
// joueur chez qui il se trouve, le sien par défaut). Le pont des quartiers (cf.
// shared/housing-plot.js) est instancié en entier : chacun y est dans sa bulle. Un CMDR vérifié envoie l'aménagement des
// siens (cf. cabin.js), et peut inviter un joueur connecté : celui-ci n'y entre qu'avec une
// invitation, reçoit l'aménagement, puis chacun de ses changements. L'hôte peut raccompagner un
// visiteur ; s'il quitte le vaisseau, ses visiteurs rentrent chez eux. Des quartiers ouverts
// (housing v2) se visitent sans invitation ; les fermer ne met pas dehors ceux qui y sont.
// Ils se visitent aussi en l'absence de leur CMDR : le relais demande l'aménagement au site (cf.
// fetchQuarters) et leur ouvre une instance à part, où se retrouvent ceux qui viennent les voir.
// On peut sonner chez un CMDR à bord dont les quartiers sont fermés : à lui d'inviter.
//
// Chuchoter : entre CMDR, les messages sont gardés par le site (le destinataire peut être absent) ;
// l'expéditeur prévient le destinataire à bord (`nudge`), qui les relit aussitôt. Un invité n'a pas
// de compte sur le site : son chuchotement passe par le relais, pour un joueur à bord seulement.
//
// Base au sol (cf. shared/ground-base.js) : on y descend en Krait depuis le hangar. C'est un lieu
// commun, comme un pont. Ada, la cheffe de la base, y fait sa ronde sur une horloge que le relais
// tient de même ; un joueur aux commandes du Krait de la base peut en mettre les réacteurs en route
// (quelques secondes au plus) : tous ceux qui sont sur la base les voient cracher, et Ada salue.
//
// Zone thargoïde (cf. salvage.js) : les équipes se forment au lobby de la cale, chaque partie a
// son instance. Dans la baie infestée, un joueur ne voit et n'entend que son équipe ; le reste du
// bord apprend seulement qu'il y est entré.
import { Server } from 'socket.io'
import { fightRelay } from './fights.js'
import { BOARD_GAMES, applyBoardMove, boardColor, boardState, newBoardGame } from './boards.js'
import { sanitizeLayout } from './cabin.js'
import { fetchQuarters, hasSiteArtwork, postSalvageResult, siteArtworkAllowed } from './site.js'
import { COOKIE, cleanCmdrName, cmdrIdentityFromCookie, cookieValue } from './cmdr.js'
import { createSalvage, GAME_ACTIONS, LOBBY_ACTIONS } from './salvage.js'
import { salvageMinDuration } from '../shared/salvage.js'
import { readFileSync } from 'node:fs'
import { createCinema } from './cinema.js'
import { BOARD_TABLES, SHIP_LAYOUTS, shipMapOptions } from '../shared/ship-layouts.js'
import { DIRS, ShipMap } from '../shared/ship-map.js'
import { applyPlot, HOUSING_LEVEL, PLOT_DOOR, PLOT_ORIGIN } from '../shared/housing-plot.js'
import { applyWalls, unpackHome } from '../shared/housing-home.js'
import { canReach } from '../shared/sight.js'
import { PATROL_LEVEL, PATROL_PERIOD, holdPatrol, patrolAt, patrolTime } from '../shared/patrol.js'
import { CHEF_COOK, CHEF_LEVEL, CHEF_PERIOD, CHEF_ROOM, CHEF_WAIT, chefAt, chefTime, cookChef, holdChef } from '../shared/chef.js'
import {
  NURSE_BEDS, NURSE_CARE, NURSE_CARE_MIN, NURSE_LEVEL, NURSE_PATCH, NURSE_PERIOD, NURSE_ROOM, bedOf, careNurse, holdNurse, nurseAt, nurseTime,
} from '../shared/nurse.js'
import {
  KRAIT_BURN, MECH_HELP, MECH_LEVEL, MECH_PANIC, MECH_PERIOD, MECH_ROOM, MECH_WAIT, helpMech, holdMech, inCockpit, mechAt, mechTime, panicMech,
} from '../shared/mechanic.js'
import {
  GARDEN_HELP, GARDEN_LEVEL, GARDEN_PERIOD, GARDEN_ROOM, GARDEN_WAIT, gardenAt, gardenTime, helpGarden, holdGarden,
} from '../shared/gardener.js'
import { HOME_SYSTEM, JUMP_CHARGE, JUMP_TRAVEL, PILOT_SEAT, nextSystem } from '../shared/systems.js'
import { ZONE_LEVEL } from '../shared/salvage.js'
// Identifiant d'apparence (cf. src/looks.ts), ex. « human.female.b », « alien.male.c.blue », « robot.g »,
// suivi au besoin du style du Holo-Me (« suit.male.c.flight.mo-pk-sm-nv- ») dont chaque champ est vérifié.
import { validLook } from '../shared/look-style.js'
import {
  BASE_BURN, BASE_COCKPIT, BASE_LAYOUT, BASE_LEVEL, CHIEF_PERIOD, chiefAt, chiefTime, holdChief, inBaseCockpit,
} from '../shared/ground-base.js'

/** Chemin de la socket, partagé avec le client (VITE_WS_PATH) et la conf nginx. */
export const WS_PATH = '/ws/mini-shipinteriors'

/**
 * Règles de paie de la zone thargoïde (`salvage` d'economy.json, celui que relit le site). Un relais
 * déployé sans src/ garde la durée minimale par défaut (cf. salvageMinDuration).
 */
const SALVAGE_ECONOMY = (() => {
  try {
    return JSON.parse(readFileSync(new URL('../src/economy/economy.json', import.meta.url), 'utf8')).salvage ?? null
  } catch {
    return null
  }
})()

const MAX_PLAYERS = 32
const MAX_TEXT = 200
const MAX_NAME = 32
// Emotes (src/avatar.ts), puis réactions (médaillons du site, src/reactions.ts).
const EMOTES = new Set([
  'salut', 'oui', 'non', 'joie', 'danse', 'assis', 'dodo', 'o7', 'interact',
  'site', 'braben', 'raxxla', 'federation', 'empire', 'alliance', 'aegis', 'fuel-rats',
])
const ANIMS = new Set(['idle', 'walk', 'sprint'])
// Poses tenues sur un meuble (cf. src/seats.ts) : assis, couché, aux commandes, à une borne…
const POSES = new Set(['sit', 'lie', 'pilot', 'arcade', 'claw', 'punch', 'run', 'pedal', 'mix'])
const LEVELS = new Set([-1, 0, 1, HOUSING_LEVEL])
/** Une invitation dans des quartiers vaut une minute. */
const INVITE_TTL = 60000
/** L'aménagement d'un CMDR absent est redemandé au site passé ce délai (ms). */
const ABSENT_TTL = 60000
/**
 * Portée d'une action arbitrée par le relais (table de jeu, jukebox) : celle du client (1,45),
 * plus la place assise autour de la table et le retard de la dernière position reçue.
 */
const REACH = 2.5
/** Plans des ponts : on n'agit pas à travers un mur (cf. shared/sight.js). */
const MAPS = new Map(Object.entries(SHIP_LAYOUTS).map(([id, layout]) => [Number(id), new ShipMap(layout, shipMapOptions(id))]))
MAPS.set(BASE_LEVEL, new ShipMap(BASE_LAYOUT))
// Pont des quartiers : chacun y est dans sa bulle (son instance, cf. `cabin`), une parcelle de départ.
applyPlot(MAPS.get(HOUSING_LEVEL), 0)
const voieMap = new ShipMap(SHIP_LAYOUTS['-1'], shipMapOptions(-1))
for (const d of voieMap.doors) {
  const step = DIRS[d.dir]
  if (voieMap.room(d.x, d.z) === 'v' || voieMap.room(d.x + step.dx, d.z + step.dz) === 'v') voieMap.lock(d.x, d.z, d.dir, false)
}
/** Plan du pont des quartiers avec la parcelle d'un aménagement : sa taille et ses murs (gardé avec lui). */
const homeMaps = new WeakMap()
function homeMap(layout) {
  if (!layout?.home) return MAPS.get(HOUSING_LEVEL)
  let map = homeMaps.get(layout)
  if (!map) {
    const plan = unpackHome(layout.home)
    map = new ShipMap(SHIP_LAYOUTS[String(HOUSING_LEVEL)], shipMapOptions(HOUSING_LEVEL))
    applyPlot(map, plan.stage ?? 0)
    applyWalls(map, plan.walls, plan.stage ?? 0)
    homeMaps.set(layout, map)
  }
  return map
}
/** `host` : dans des quartiers, leur hôte (sa parcelle et ses murs comptent). */
const reaches = (player, level, at, host) => player.level === level && canReach(
  host && level === HOUSING_LEVEL ? homeMap(host.layout) : level === -1 && player.voie ? voieMap : MAPS.get(level), player, at, REACH,
)
/** Pont de chaque jukebox : la salle commune (pont principal), le bar (la cale), les quartiers. */
const JUKEBOX_LEVEL = new Map([['deck', 0], ['hold', -1], ['cabin', HOUSING_LEVEL]])
/** Jukebox d'une instance commune (cf. `music` plus bas) ; les autres sont des quartiers. */
const JUKEBOX_WHERE = new Map([[0, 'deck'], [-1, 'hold']])
/** Morceaux du jukebox (cf. src/music.ts) : un identifiant court. */
const TRACK = /^[a-z0-9-]{1,24}$/
/** Après un saut, le réacteur refroidit un peu avant le suivant (ms). */
const FSD_COOLDOWN = 2000

const clean = (s, max) =>
  String(s ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max)
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null)
const obj = (v) => (v && typeof v === 'object' ? v : {})

/**
 * Même origine uniquement. Le cookie du site n'est pas SameSite : sans ce contrôle, une page
 * d'un autre site pourrait ouvrir une socket avec le cookie d'un visiteur et parler en son nom.
 * Un client hors navigateur n'envoie pas d'Origin, mais il n'a pas non plus le cookie d'autrui.
 */
function sameOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

/**
 * Branche le relais sur un serveur HTTP existant.
 * @param {import('node:http').Server} httpServer
 * @param {{ log?: (m: string) => void, error?: (m: string) => void, cmdrUrl?: string, path?: string, devCmdr?: boolean }} options
 *   log     : arrivées et départs ; error : ce qui empêche de reconnaître les CMDR
 *   cmdrUrl : endpoint du site qui reconnaît le cookie (défaut : variable ED_CMDR_URL)
 *   path    : chemin de la socket (défaut : WS_PATH, ou la variable WS_PATH)
 *   devCmdr : serveur de dev uniquement, accepte le nom de CMDR envoyé par le client (?cmdr=Nom)
 */
export function attachRelay(
  httpServer,
  { log = console.log, error = console.error, cmdrUrl = process.env.ED_CMDR_URL ?? '', path = process.env.WS_PATH || WS_PATH,
    devCmdr = false, youtubeKey = process.env.YOUTUBE_API_KEY ?? '', youtubeFetch = fetch, relaySecret = process.env.MSI_RELAY_SECRET ?? '',
    salvageFetch = fetch, quartersFetch = fetch } = {},
) {
  if (!cmdrUrl) error('[relais] ED_CMDR_URL absent : les comptes Élite Dangereuse ne peuvent pas être reconnus (tout le monde est invité).')
  const io = new Server(httpServer, {
    path,
    serveClient: false,
    // Un aménagement de quartiers plein (160 objets, extensions comprises) fait ~13 Ko.
    maxHttpBufferSize: 32768,
    allowRequest: (req, callback) => callback(null, sameOrigin(req)),
  })
  const players = new Map() // socket.id -> joueur
  const sockets = new Map() // id du joueur -> socket
  const cinema = createCinema({ cmdrUrl, players: () => [...players.values()], emit: (event, state) => io.emit(event, state), error,
    youtubeKey, fetcher: youtubeFetch })
  httpServer.on('close', () => cinema.dispose())
  const boards = new Map() // table -> partie de plateau
  let nextId = 1
  /**
   * Quartiers ouverts de CMDR absents : forme stockée du nom -> { id (de l'instance), key, name,
   * layout, at (dernière lecture sur le site) } ; et les mêmes par id d'instance.
   */
  const absent = new Map()
  const absentById = new Map()
  /**
   * Jukebox qui jouent : 0 pour le pont principal (la salle commune), -1 pour la cale (le bar), sinon
   * l'id de l'hôte des quartiers.
   */
  const music = new Map() // instance -> { track, since, x, z, song, loop, shuffle, seed }
  /** Système où se trouve le vaisseau, et fin du saut en cours (aucun autre avant). */
  let system = HOME_SYSTEM
  let jumpEnds = 0
  /** Horloge de la ronde du sergent, et le joueur vers qui il se tourne pendant un arrêt. */
  let patrol = { tau: Math.random() * PATROL_PERIOD, at: Date.now(), holdUntil: 0 }
  let patrolFace = null
  /** Où en est la ronde : instant (s), arrêt restant (s), et vers qui il regarde. */
  const patrolState = (now = Date.now()) => ({
    tau: patrolTime(patrol, now),
    hold: Math.max(0, patrol.holdUntil - now) / 1000,
    ...(patrolFace && patrol.holdUntil > now ? { face: patrolFace } : {}),
  })
  /** Horloge de la tournée du chef, vers qui il se tourne, et les commandes en cours (id du joueur -> fin, ms). */
  let chef = { tau: Math.random() * CHEF_PERIOD, at: Date.now(), holdUntil: 0 }
  let chefFace = null
  const cooks = new Map()
  /** Fin de la dernière commande en cours (ms), 0 s'il n'y en a plus. */
  const cookUntil = (now = Date.now()) => {
    let until = 0
    for (const [id, end] of cooks) {
      if (end <= now) cooks.delete(id)
      else until = Math.max(until, end)
    }
    return until
  }
  /** Où en est le chef : instant de la tournée (s), arrêt restant (s), commande en cours (s), et vers qui il regarde. */
  const chefState = (now = Date.now()) => {
    const cook = cookUntil(now)
    return {
      tau: chefTime(chef, now),
      hold: Math.max(0, chef.holdUntil - now) / 1000,
      cook: Math.max(0, cook - now) / 1000,
      ...(chefFace && chef.holdUntil > now ? { face: chefFace } : {}),
    }
  }
  /**
   * Un commis se met aux fourneaux ou avance d'une étape (`on`), ou s'en va : le chef l'attend au
   * bout du self, ou repart. Rend false si rien n'a changé.
   */
  const setCook = (player, on, now = Date.now()) => {
    if (on) {
      cooks.set(player.id, now + CHEF_COOK * 1000)
      chefFace = { x: player.x, z: player.z }
    } else if (!cooks.delete(player.id)) return false
    chef = cookChef(chef, now, cookUntil(now))
    return true
  }
  /**
   * Horloge de la tournée de l'infirmière, vers qui elle se tourne, la consultation en cours
   * (patient, lit, début et fin, ms) et les pansements (id du joueur -> fin, ms).
   */
  let nurse = { tau: Math.random() * NURSE_PERIOD, at: Date.now(), holdUntil: 0 }
  let nurseFace = null
  let care = null
  const patched = new Map()
  /** Où en est l'infirmière : instant (s), arrêt restant (s), consultation (s restantes, lit, patient), pansements (s restantes). */
  const nurseState = (now = Date.now()) => {
    if (care && care.until <= now) care = null
    for (const [id, end] of patched) if (end <= now) patched.delete(id)
    return {
      tau: nurseTime(nurse, now),
      hold: Math.max(0, nurse.holdUntil - now) / 1000,
      care: care ? (care.until - now) / 1000 : 0,
      bed: care ? care.bed : -1,
      patient: care ? care.patient : 0,
      patched: [...patched].map(([id, end]) => [id, (end - now) / 1000]),
      ...(nurseFace && nurse.holdUntil > now ? { face: nurseFace } : {}),
    }
  }
  /**
   * Le patient en consultation s'en va, ou elle se termine (`healed` : menée à son terme, il
   * repart avec un pansement) : l'infirmière reprend sa tournée. Rend false si ce n'était pas lui.
   */
  const endCare = (player, healed, now = Date.now()) => {
    if (!care || care.patient !== player.id) return false
    if (healed && now - care.start >= NURSE_CARE_MIN * 1000) patched.set(player.id, now + NURSE_PATCH * 1000)
    nurse = careNurse(nurse, now, 0, care.bed)
    nurseFace = null
    care = null
    return true
  }
  /** Horloge de la tournée du mécano, vers qui il se tourne, et les révisions en cours (id du joueur -> fin, ms). */
  let mech = { tau: Math.random() * MECH_PERIOD, at: Date.now(), holdUntil: 0 }
  let mechFace = null
  const helpers = new Map()
  /** Réacteurs du Krait : qui les a mis en route (id du joueur), et jusqu'à quand ils tournent (ms). */
  let burn = { by: 0, until: 0 }
  /** Fin de la dernière révision en cours (ms), 0 s'il n'y en a plus. */
  const helpUntil = (now = Date.now()) => {
    let until = 0
    for (const [id, end] of helpers) {
      if (end <= now) helpers.delete(id)
      else until = Math.max(until, end)
    }
    return until
  }
  /** Où en est le mécano : instant de la tournée (s), arrêt restant (s), révision en cours (s), et vers qui il regarde. */
  const mechState = (now = Date.now()) => {
    const help = helpUntil(now)
    const panic = Math.max(0, burn.until - now) / 1000
    return {
      tau: mechTime(mech, now),
      hold: Math.max(0, mech.holdUntil - now) / 1000,
      help: Math.max(0, help - now) / 1000,
      // Réacteurs en route : secondes restantes, et le pilote.
      panic,
      ...(panic > 0 ? { pilot: burn.by } : {}),
      ...(mechFace && mech.holdUntil > now ? { face: mechFace } : {}),
    }
  }
  /**
   * Un aide se met à la révision ou avance d'une étape (`on`), ou s'en va : le mécano l'attend au
   * nez du Krait, ou repart. Rend false si rien n'a changé.
   */
  const setHelp = (player, on, now = Date.now()) => {
    if (on) {
      helpers.set(player.id, now + MECH_HELP * 1000)
      mechFace = { x: player.x, z: player.z }
    } else if (!helpers.delete(player.id)) return false
    // Pendant que les réacteurs tournent, la panique passe avant la révision.
    mech = burn.until > now ? panicMech(mech, now, burn.until) : helpMech(mech, now, helpUntil(now))
    return true
  }
  /**
   * Un pilote met les réacteurs du Krait en route (`on`), ou les coupe (le sien seulement), ou s'en
   * va : Nico panique au pied de l'escabeau, ou souffle et repart. Rend false si rien n'a changé.
   */
  const setBurn = (player, on, now = Date.now()) => {
    if (on) {
      if (burn.until > now) return false
      burn = { by: player.id, until: now + KRAIT_BURN * 1000 }
      mechFace = { x: MECH_PANIC.x, z: MECH_PANIC.z }
      mech = panicMech(mech, now, burn.until)
      return true
    }
    if (burn.by !== player.id || burn.until <= now) return false
    burn = { by: 0, until: 0 }
    mech = helpUntil(now) ? helpMech(mech, now, helpUntil(now)) : panicMech(mech, now, 0)
    return true
  }
  /** Horloge de la tournée de la jardinière, vers qui elle se tourne, et les fiches en cours (id du joueur -> fin, ms). */
  let garden = { tau: Math.random() * GARDEN_PERIOD, at: Date.now(), holdUntil: 0 }
  let gardenFace = null
  const growers = new Map()
  /** Fin de la dernière fiche de culture en cours (ms), 0 s'il n'y en a plus. */
  const growUntil = (now = Date.now()) => {
    let until = 0
    for (const [id, end] of growers) {
      if (end <= now) growers.delete(id)
      else until = Math.max(until, end)
    }
    return until
  }
  /** Où en est la jardinière : instant de la tournée (s), arrêt restant (s), fiche en cours (s), et vers qui elle regarde. */
  const gardenState = (now = Date.now()) => {
    const help = growUntil(now)
    return {
      tau: gardenTime(garden, now),
      hold: Math.max(0, garden.holdUntil - now) / 1000,
      help: Math.max(0, help - now) / 1000,
      ...(gardenFace && garden.holdUntil > now ? { face: gardenFace } : {}),
    }
  }
  /**
   * Un aide se met à la fiche de culture ou avance d'une étape (`on`), ou s'en va : la jardinière
   * l'attend sur les pas japonais, ou repart. Rend false si rien n'a changé.
   */
  const setGrow = (player, on, now = Date.now()) => {
    if (on) {
      growers.set(player.id, now + GARDEN_HELP * 1000)
      gardenFace = { x: player.x, z: player.z }
    } else if (!growers.delete(player.id)) return false
    garden = helpGarden(garden, now, growUntil(now))
    return true
  }
  /** Horloge de la ronde d'Ada, la cheffe de la base, et vers qui elle se tourne pendant un arrêt. */
  let chief = { tau: Math.random() * CHIEF_PERIOD, at: Date.now(), holdUntil: 0 }
  let chiefFace = null
  /** Réacteurs du Krait de la base : qui les a mis en route (id du joueur), et jusqu'à quand ils tournent (ms). */
  let baseBurn = { by: 0, until: 0 }
  /** Où en est Ada : instant de la ronde (s), arrêt restant (s), réacteurs du Krait (s, et le pilote), vers qui elle regarde. */
  const chiefState = (now = Date.now()) => {
    const burn = Math.max(0, baseBurn.until - now) / 1000
    return {
      tau: chiefTime(chief, now),
      hold: Math.max(0, chief.holdUntil - now) / 1000,
      burn,
      ...(burn > 0 ? { pilot: baseBurn.by } : {}),
      ...(chiefFace && chief.holdUntil > now ? { face: chiefFace } : {}),
    }
  }
  /**
   * Un pilote met les réacteurs du Krait de la base en route (`on`), ou les coupe (les siens
   * seulement), ou s'en va : Ada s'arrête et regarde le cockpit. Rend false si rien n'a changé.
   */
  const setBaseBurn = (player, on, now = Date.now()) => {
    if (on) {
      if (baseBurn.until > now) return false
      baseBurn = { by: player.id, until: now + BASE_BURN * 1000 }
      chief = holdChief(chief, now, BASE_BURN)
      chiefFace = { x: BASE_COCKPIT.x, z: BASE_COCKPIT.z }
      return true
    }
    if (baseBurn.by !== player.id || baseBurn.until <= now) return false
    baseBurn = { by: 0, until: 0 }
    return true
  }
  /** Ce que joue le jukebox d'une instance, pour un joueur qui y arrive (track null : il se tait). */
  const musicOf = (instance) => {
    const m = music.get(instance)
    return {
      where: JUKEBOX_WHERE.get(instance) ?? 'cabin', track: m?.track ?? null,
      at: m ? (Date.now() - m.since) / 1000 : 0, x: m?.x ?? 0, z: m?.z ?? 0,
      ...(m?.song ? { song: m.song } : {}),
      ...(m?.loop ? { loop: true } : {}),
      ...(m?.shuffle ? { shuffle: true, seed: m.seed } : {}),
    }
  }

  /** Position et animation d'un joueur, avec sa pose s'il est installé sur un meuble. */
  const motion = (p) => ({ x: p.x, z: p.z, yaw: p.yaw, level: p.level, anim: p.anim, ...(p.pose ? { pose: p.pose, py: p.py } : {}) })
  const publicState = (p) => ({ id: p.id, name: p.name, verified: p.verified, skin: p.skin, ...motion(p), cabin: p.cabin, ...(p.open ? { open: true } : {}) })
  const playerById = (id) => {
    const socket = sockets.get(id)
    return socket ? players.get(socket.id) : undefined
  }
  /** Hôte d'une instance des quartiers : le joueur à bord, ou les quartiers d'un absent (son aménagement compte). */
  const hostOf = (id) => playerById(id) ?? absentById.get(id)
  const fights = fightRelay(playerById, id => sockets.get(id))
  const salvage = createSalvage({
    playerById,
    emit: (id, event, data) => sockets.get(id)?.emit(event, data),
    broadcast: (event, data) => io.emit(event, data),
    reward: (member, result) => postSalvageResult(member.cookie, result, { cmdrUrl, secret: relaySecret, error, fetcher: salvageFetch }),
    minDuration: (parcels, team) => salvageMinDuration(SALVAGE_ECONOMY, parcels, team),
    log,
    // Serveur de dev : les essais dans le navigateur peuvent figer ou placer les ennemis.
    debug: devCmdr,
  })
  const salvageTimer = setInterval(() => salvage.tick(0.1), 100)
  salvageTimer.unref?.()
  httpServer.on('close', () => clearInterval(salvageTimer))
  /**
   * `to` entend `from` (chat, emotes) : dans la baie infestée, on ne parle qu'à son équipe ; au
   * vaisseau, à tout le bord hors de la baie, et à son équipe en mission (un capturé la suit).
   */
  const hears = (from, to) => salvage.teammates(from).has(to.id) || (from.level !== ZONE_LEVEL && to.level !== ZONE_LEVEL)
  const boardKey = (game, table) => (BOARD_GAMES.has(game) && table === game ? table : null)
  const emitBoard = (state) => {
    const msg = boardState(state)
    for (const p of state.players) sockets.get(p.id)?.emit('board:state', msg)
  }
  const leaveBoard = (p) => {
    const key = p.boardKey
    if (!key) return
    const state = boards.get(key)
    p.boardKey = null
    if (!state) return
    state.players = state.players.filter((x) => x.id !== p.id)
    if (!state.players.length) boards.delete(key)
    else {
      // Une partie qui perd un joueur repart proprement à zéro ; aucune victoire n'est attribuée
      // automatiquement, ce qui évite de récompenser une déconnexion ou de conserver un vieux
      // plateau terminé pour le prochain adversaire.
      const fresh = newBoardGame(state.game, state.table)
      fresh.players = state.players
      boards.set(key, fresh)
      for (const boardPlayer of fresh.players) sockets.get(boardPlayer.id)?.emit('board:state', boardState(fresh))
    }
  }
  /** Le joueur passe dans l'instance des quartiers de `cabin` (la sienne s'il rentre chez lui). */
  const moveTo = (p, cabin, by) => {
    if (p.cabin === cabin) return
    fights.leave(p)
    p.cabin = cabin
    // Chez un absent : son nom accompagne l'annonce (personne à bord ne le porte).
    const away = absentById.get(cabin)
    io.emit('visit', { id: p.id, cabin, ...(by ? { by } : {}), ...(away ? { host: `CMDR ${away.name}` } : {}) })
    // La musique de ces quartiers-là (ou le silence).
    sockets.get(p.id)?.emit('music', { id: 0, ...musicOf(cabin) })
  }

  /** Nom d'invité : jamais celui d'un CMDR vérifié présent à bord. */
  const guestName = (wanted, self) => {
    const name = clean(wanted, MAX_NAME) || 'CMDR Jameson'
    const taken = [...players.values()].some((p) => p !== self && p.verified && p.name.toLowerCase() === name.toLowerCase())
    return taken ? `${name.slice(0, MAX_NAME - 9)} (invité)` : name
  }

  // Avant d'embarquer : place à bord, puis identité (le site est interrogé une fois par connexion).
  io.use(async (socket, next) => {
    if (players.size >= MAX_PLAYERS) return next(new Error('Vaisseau complet'))
    const auth = obj(socket.handshake.auth)
    socket.data.identity = devCmdr && auth.cmdr
      ? { name: cleanCmdrName(auth.cmdr), ljpc: auth.ljpc === true, voie: auth.voie === true }
      : await cmdrIdentityFromCookie(socket.handshake.headers.cookie, { url: cmdrUrl, error })
    next()
  })

  io.on('connection', (socket) => {
    const auth = obj(socket.handshake.auth)
    const identity = socket.data.identity
    const cmdr = identity?.name
    const player = {
      id: nextId++,
      name: '',
      verified: !!cmdr,
      ljpc: !!cmdr && identity.ljpc === true,
      voie: !!cmdr && identity.voie === true,
      skin: validLook(auth.skin) ? auth.skin : 'human.female.b',
      // Point d'apparition : l'entrée de sa parcelle, sur le pont des quartiers (cf. SPAWN dans src/levels.ts).
      x: PLOT_ORIGIN.x + 1, z: PLOT_DOOR.z, level: HOUSING_LEVEL, yaw: 0, anim: 'idle', pose: '', py: 0,
      // Instance des quartiers : les siens (id du joueur qui reçoit), son aménagement, ses invitations.
      cabin: 0,
      layout: null,
      // Quartiers ouverts (housing v2, cf. shared/housing-home.js) : on y entre sans invitation.
      open: false,
      invited: new Map(), // id de l'invité -> fin de validité
      boardKey: null,
      // Cookie du site (lui seul) : le relais le présente au site pour payer une mission gagnée.
      cookie: cmdr && cookieValue(socket.handshake.headers.cookie) ? `${COOKIE}=${cookieValue(socket.handshake.headers.cookie)}` : null,
    }
    player.cabin = player.id
    player.name = cmdr ? `CMDR ${cmdr}` : guestName(auth.name, player)
    players.set(socket.id, player)
    sockets.set(player.id, socket)
    socket.emit('welcome', {
      id: player.id,
      you: { name: player.name, verified: player.verified, ljpc: player.ljpc, voie: player.voie },
      // Ceux qui sont dans la baie infestée y sont annoncés (pont -2) : le client ne les montre pas.
      players: [...players.values()].filter((p) => p !== player).map(publicState),
      // Les jukebox du pont principal et de la cale, silence compris : après une reconnexion, on se recale.
      music: musicOf(0),
      hold: musicOf(-1),
      system,
      patrol: patrolState(),
      chef: chefState(),
      nurse: nurseState(),
      mechanic: mechState(),
      gardener: gardenState(),
      chief: chiefState(),
      salvage: salvage.snapshot(),
      // Quartiers d'absents où se trouvent des visiteurs : de quoi dire chez qui ils sont.
      homes: [...absentById.values()].map((h) => ({ id: h.id, name: `CMDR ${h.name}` })),
    })
    socket.emit('cinema:state', cinema.snapshot())
    void cinema.refresh().then(() => socket.connected && socket.emit('cinema:state', cinema.snapshot()))
    socket.broadcast.emit('join', { player: publicState(player) })
    log(`[relais] ${player.name}${player.verified ? ' (CMDR vérifié)' : ''} (#${player.id}) a embarqué — ${players.size} à bord`)

    fights.connect(socket, player)

    let chatBudget = 5
    let inviteBudget = 3
    let visitBudget = 3
    let cabinBudget = 10
    let musicBudget = 3
    let cinemaBudget = 3
    let lastCinemaSearch = 0
    let boardBudget = 30
    let patrolBudget = 1
    let chefBudget = 3
    let nurseBudget = 3
    let mechBudget = 3
    let gardenBudget = 3
    let chiefBudget = 3
    let salvageBudget = 20
    const refill = setInterval(() => {
      chatBudget = Math.min(5, chatBudget + 1)
      inviteBudget = Math.min(3, inviteBudget + 0.25)
      visitBudget = Math.min(3, visitBudget + 0.25)
      cabinBudget = Math.min(10, cabinBudget + 5)
      musicBudget = Math.min(3, musicBudget + 0.5)
      cinemaBudget = Math.min(3, cinemaBudget + 0.5)
      boardBudget = Math.min(30, boardBudget + 10)
      patrolBudget = Math.min(1, patrolBudget + 0.5)
      chefBudget = Math.min(3, chefBudget + 1)
      nurseBudget = Math.min(3, nurseBudget + 1)
      mechBudget = Math.min(3, mechBudget + 1)
      gardenBudget = Math.min(3, gardenBudget + 1)
      chiefBudget = Math.min(3, chiefBudget + 1)
      salvageBudget = Math.min(20, salvageBudget + 10)
    }, 1000)

    socket.on('state', (raw) => {
      const m = obj(raw)
      const x = num(m.x, -5, 50), z = num(m.z, -5, 30), yaw = num(m.yaw, -10, 10)
      if (x === null || z === null || yaw === null || !(LEVELS.has(m.level) || m.level === ZONE_LEVEL || m.level === BASE_LEVEL)) return
      // La base au sol : sur son plateau seulement.
      if (m.level === BASE_LEVEL && !MAPS.get(BASE_LEVEL).isFloor(Math.round(x), Math.round(z))) return
      if (m.level === 0 && MAPS.get(0).room(Math.round(x), Math.round(z)) === 'l' && !player.ljpc) return
      if (m.level === -1 && MAPS.get(-1).room(Math.round(x), Math.round(z)) === 'v' && !player.voie) return
      // La baie infestée : seulement en mission, sur son sol, et pas plus vite qu'on ne court.
      if (m.level === ZONE_LEVEL && !salvage.accepts(player, x, z)) return
      // Une pose inconnue n'en est pas une ; sa hauteur reste à portée d'une couchette du haut.
      const pose = POSES.has(m.pose) && m.level !== ZONE_LEVEL ? m.pose : ''
      if (player.level !== m.level) fights.leave(player)
      // Le pilote quitte la base (il décolle) : les réacteurs du Krait de la base se coupent derrière lui.
      if (player.level === BASE_LEVEL && m.level !== BASE_LEVEL && setBaseBurn(player, false)) io.emit('chief', { id: player.id, ...chiefState() })
      const wasZone = player.level === ZONE_LEVEL
      Object.assign(player, { x, z, yaw, level: m.level, anim: ANIMS.has(m.anim) ? m.anim : 'idle', pose, py: pose ? (num(m.py, 0, 1.2) ?? 0) : 0 })
      salvage.moved(player)
      const msg = { id: player.id, ...motion(player) }
      const team = salvage.teammates(player)
      for (const p of players.values()) {
        if (p === player) continue
        // Dans la baie, seule l'équipe suit le joueur ; le reste du bord apprend seulement qu'il y est entré.
        if (team.has(p.id) || (p.level !== ZONE_LEVEL && (player.level !== ZONE_LEVEL || !wasZone))) sockets.get(p.id)?.emit('state', msg)
      }
      cinema.operatorChanged()
    })

    for (const event of [...LOBBY_ACTIONS, ...GAME_ACTIONS, ...(devCmdr ? ['salvage:debug'] : [])]) {
      socket.on(event, (raw) => {
        if (salvageBudget < 1) return
        salvageBudget--
        salvage.handle(player, event, raw)
      })
    }

    socket.on('cinema:choose', async (raw) => {
      if (cinemaBudget < 1) return socket.emit('cinema:error', { reason: 'busy' })
      cinemaBudget--
      const id = obj(raw).id
      const reason = await cinema.choose(player, id)
      if (reason) socket.emit('cinema:error', { reason })
    })

    socket.on('cinema:search', async (raw, reply) => {
      if (typeof reply !== 'function') return
      if (Date.now() - lastCinemaSearch < 2000) return reply({ reason: 'busy', videos: [] })
      lastCinemaSearch = Date.now()
      reply(await cinema.search(player, obj(raw).query))
    })

    socket.on('cinema:video', async (raw) => {
      if (cinemaBudget < 1) return socket.emit('cinema:error', { reason: 'busy' })
      cinemaBudget--
      const reason = await cinema.chooseVideo(player, obj(raw).video)
      if (reason) socket.emit('cinema:error', { reason })
    })

    socket.on('cinema:duration', (raw) => {
      if (player.level !== 1) return
      const { id, since, duration } = obj(raw)
      cinema.reportDuration(id, since, duration)
    })

    socket.on('chat', (raw) => {
      const text = clean(obj(raw).text, MAX_TEXT)
      if (!text || chatBudget <= 0) return
      chatBudget--
      const msg = { id: player.id, name: player.name, verified: player.verified, text }
      for (const p of players.values()) if (p !== player && hears(player, p)) sockets.get(p.id)?.emit('chat', msg)
    })

    // Chuchoter à un joueur à bord, où qu'il soit : lui seul le reçoit. L'expéditeur apprend si le
    // message est parti, ou pourquoi (gone : il n'est plus à bord, busy : trop de messages d'un coup).
    socket.on('whisper', (raw, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {}
      const m = obj(raw)
      const text = clean(m.text, MAX_TEXT)
      const to = playerById(m.to)
      if (!text) return reply({ ok: false, reason: 'empty' })
      if (!to || to === player) return reply({ ok: false, reason: 'gone' })
      if (chatBudget <= 0) return reply({ ok: false, reason: 'busy' })
      chatBudget--
      sockets.get(to.id)?.emit('whisper', { id: player.id, name: player.name, verified: player.verified, text })
      reply({ ok: true })
    })

    // « J'ai écrit à ce CMDR sur le site » : le destinataire à bord relit ses messages aussitôt.
    socket.on('nudge', (raw) => {
      const to = playerById(obj(raw).to)
      if (!to || to === player || chatBudget <= 0) return
      chatBudget--
      sockets.get(to.id)?.emit('nudge', { id: player.id })
    })

    socket.on('emote', (raw) => {
      const emote = obj(raw).emote
      if (!EMOTES.has(emote)) return
      for (const p of players.values()) if (p !== player && hears(player, p)) sockets.get(p.id)?.emit('emote', { id: player.id, emote })
    })

    socket.on('profile', (raw) => {
      const m = obj(raw)
      // Le nom d'un CMDR vérifié vient du site : il ne se change pas en jeu.
      if (!player.verified && clean(m.name, MAX_NAME)) player.name = guestName(m.name, player)
      if (validLook(m.skin)) player.skin = m.skin
      io.emit('profile', { id: player.id, name: player.name, verified: player.verified, skin: player.skin })
      if (player.boardKey) {
        const state = boards.get(player.boardKey)
        const boardPlayer = state?.players.find((p) => p.id === player.id)
        if (boardPlayer) {
          boardPlayer.name = player.name
          emitBoard(state)
        }
      }
    })

    // Jeux de plateau : deux places maximum, un seul état validé par le relais pour chaque table.
    socket.on('board:join', (raw) => {
      if (boardBudget-- <= 0) return socket.emit('board:error', { game: '', table: '', code: 'busy' })
      const m = obj(raw)
      const game = typeof m.game === 'string' ? m.game : ''
      const table = typeof m.table === 'string' ? m.table : ''
      const key = boardKey(game, table)
      if (!key || player.level !== 0) return socket.emit('board:error', { game, table, code: 'unavailable' })
      if (!reaches(player, BOARD_TABLES[game].level, BOARD_TABLES[game])) return socket.emit('board:error', { game, table, code: 'far' })
      if (player.boardKey && player.boardKey !== key) leaveBoard(player)
      let state = boards.get(key)
      if (!state) boards.set(key, (state = newBoardGame(game, table)))
      const already = state.players.find((p) => p.id === player.id)
      if (!already && state.players.length >= 2) return socket.emit('board:error', { game, table, code: 'full' })
      if (!already) {
        const color = [boardColor(game, 0), boardColor(game, 1)].find((c) => !state.players.some((p) => p.color === c))
        state.players.push({ id: player.id, name: player.name, color })
        player.boardKey = key
      }
      if (state.players.length >= 2 && state.status === 'waiting') state.status = 'playing'
      emitBoard(state)
    })

    socket.on('board:move', (raw) => {
      if (boardBudget-- <= 0) return socket.emit('board:error', { game: '', table: '', code: 'busy' })
      const m = obj(raw)
      const key = boardKey(m.game, m.table)
      const state = key ? boards.get(key) : null
      if (!state || player.boardKey !== key || !applyBoardMove(state, player, m.move)) return socket.emit('board:error', { game: m.game, table: m.table, code: 'invalid' })
      emitBoard(state)
    })

    socket.on('board:leave', () => leaveBoard(player))

    // Jukebox : un morceau (ou le silence) au pont principal, à la cale, ou dans les quartiers où l'on est,
    // depuis son début ou `at` secondes plus loin (un hôte reconnecté rend la sienne au relais).
    // Trop de choix d'un coup : le demandeur, qui joue déjà le sien, retrouve celui de tous.
    socket.on('music', (raw) => {
      const m = obj(raw)
      if (!JUKEBOX_LEVEL.has(m.where)) return
      const instance = m.where === 'cabin' ? player.cabin : m.where === 'deck' ? 0 : -1
      if (musicBudget < 1) return socket.emit('music', { id: 0, ...musicOf(instance), busy: true })
      const track = m.track === null ? null : TRACK.test(String(m.track)) ? String(m.track) : undefined
      const x = num(m.x, -5, 50), z = num(m.z, -5, 32)
      if (track === undefined || x === null || z === null) return
      const song = Number.isInteger(m.song) && m.song >= 0 && m.song <= 3 ? m.song : 0
      const loop = m.loop === true
      const shuffle = m.shuffle === true
      const seed = Number.isInteger(m.seed) && m.seed >= 0 && m.seed <= 0xffffffff ? m.seed : 0
      // Au jukebox, et de ce côté du mur ; sauf l'hôte reconnecté qui rend sa musique (`at`).
      const restore = m.where === 'cabin' && m.at !== undefined
      const host = m.where === 'cabin' ? hostOf(player.cabin) : undefined
      if (!restore && !reaches(player, JUKEBOX_LEVEL.get(m.where), { x, z }, host)) return socket.emit('music', { id: 0, ...musicOf(instance), far: true })
      musicBudget--
      if (track) music.set(instance, { track, since: Date.now() - (num(m.at, 0, 86400) ?? 0) * 1000, x, z, song, loop, shuffle, seed })
      else music.delete(instance)
      const msg = { id: player.id, ...musicOf(instance) }
      for (const p of players.values()) {
        // Les ponts communs s'entendent de tous (chacun n'écoute que celui de son pont) ; des quartiers, seulement de qui s'y trouve.
        if (p !== player && (instance <= 0 || p.cabin === instance)) sockets.get(p.id)?.emit('music', msg)
      }
    })

    // On parle au sergent : à portée de lui (sans mur entre les deux), une réplique toutes les 2 s au plus.
    socket.on('patrol:talk', () => {
      if (patrolBudget < 1) return
      const now = Date.now()
      const at = patrolAt(patrolTime(patrol, now))
      if (!reaches(player, PATROL_LEVEL, at)) return
      patrolBudget--
      patrol = holdPatrol(patrol, now)
      patrolFace = { x: player.x, z: player.z }
      io.emit('patrol', { id: player.id, ...patrolState(now) })
    })

    // On parle au chef : à portée de lui (à sa place dans la tournée, ou au bout du self s'il y attend un commis).
    socket.on('chef:talk', () => {
      if (chefBudget < 1) return
      const now = Date.now()
      const at = cookUntil(now) ? CHEF_WAIT : chefAt(chefTime(chef, now))
      if (!reaches(player, CHEF_LEVEL, at) && !reaches(player, CHEF_LEVEL, CHEF_WAIT)) return
      chefBudget--
      chef = holdChef(chef, now)
      chefFace = { x: player.x, z: player.z }
      io.emit('chef', { id: player.id, ...chefState(now) })
    })

    // On cuisine avec le chef (on), ou on a fini (off) : se mettre aux fourneaux, seulement depuis le
    // mess ; finir ne coûte rien (il n'y a rien à finir sans avoir commencé).
    socket.on('chef:cook', (raw) => {
      const on = obj(raw).on === true
      if (on) {
        if (chefBudget < 1 || player.level !== CHEF_LEVEL || MAPS.get(CHEF_LEVEL).room(Math.round(player.x), Math.round(player.z)) !== CHEF_ROOM) return
        chefBudget--
      }
      if (setCook(player, on)) io.emit('chef', { id: player.id, ...chefState() })
    })

    // On parle à l'infirmière : à portée d'elle (à sa place dans la tournée, ou au chevet où elle consulte).
    socket.on('nurse:talk', () => {
      if (nurseBudget < 1) return
      const now = Date.now()
      nurseState(now)
      const at = care ? NURSE_BEDS[care.bed].side : nurseAt(nurseTime(nurse, now))
      if (!reaches(player, NURSE_LEVEL, at)) return
      nurseBudget--
      nurse = holdNurse(nurse, now)
      nurseFace = { x: player.x, z: player.z }
      io.emit('nurse', { id: player.id, ...nurseState(now) })
    })

    // On l'appelle depuis un lit de l'infirmerie (on), ou la consultation est finie (off ; `healed` :
    // menée à son terme). Une consultation à la fois : elle ne quitte pas un autre patient.
    socket.on('nurse:care', (raw) => {
      const m = obj(raw)
      const now = Date.now()
      nurseState(now)
      if (m.on !== true) {
        if (endCare(player, m.healed === true, now)) io.emit('nurse', { id: player.id, ...nurseState(now) })
        return
      }
      if (nurseBudget < 1 || care || player.level !== NURSE_LEVEL || player.pose !== 'lie') return
      if (MAPS.get(NURSE_LEVEL).room(Math.round(player.x), Math.round(player.z)) !== NURSE_ROOM) return
      const bed = bedOf(player)
      if (bed < 0) return
      nurseBudget--
      care = { patient: player.id, bed, start: now, until: now + NURSE_CARE * 1000 }
      nurseFace = { x: NURSE_BEDS[bed].x, z: NURSE_BEDS[bed].z }
      nurse = careNurse(nurse, now, care.until, bed)
      io.emit('nurse', { id: player.id, ...nurseState(now) })
    })

    // On parle au mécano : à portée de lui (à sa place dans la tournée, ou au nez du Krait s'il y attend un aide).
    socket.on('mech:talk', () => {
      if (mechBudget < 1) return
      const now = Date.now()
      const at = burn.until > now ? MECH_PANIC : helpUntil(now) ? MECH_WAIT : mechAt(mechTime(mech, now))
      if (!reaches(player, MECH_LEVEL, at) && !reaches(player, MECH_LEVEL, MECH_WAIT) && !reaches(player, MECH_LEVEL, MECH_PANIC)) return
      mechBudget--
      mech = holdMech(mech, now)
      mechFace = { x: player.x, z: player.z }
      io.emit('mechanic', { id: player.id, ...mechState(now) })
    })

    // On aide le mécano (on : une étape de plus de la révision), ou on a fini (off) : seulement
    // depuis le hangar ; finir ne coûte rien.
    socket.on('mech:help', (raw) => {
      const on = obj(raw).on === true
      if (on) {
        if (mechBudget < 1 || player.level !== MECH_LEVEL || MAPS.get(MECH_LEVEL).room(Math.round(player.x), Math.round(player.z)) !== MECH_ROOM) return
        mechBudget--
      }
      if (setHelp(player, on)) io.emit('mechanic', { id: player.id, ...mechState() })
    })

    // On parle à la jardinière : à portée d'elle (à sa place dans la tournée, ou sur les pas japonais
    // si elle y attend un aide).
    socket.on('garden:talk', () => {
      if (gardenBudget < 1) return
      const now = Date.now()
      const at = growUntil(now) ? GARDEN_WAIT : gardenAt(gardenTime(garden, now))
      if (!reaches(player, GARDEN_LEVEL, at) && !reaches(player, GARDEN_LEVEL, GARDEN_WAIT)) return
      gardenBudget--
      garden = holdGarden(garden, now)
      gardenFace = { x: player.x, z: player.z }
      io.emit('gardener', { id: player.id, ...gardenState(now) })
    })

    // On aide la jardinière (on : une étape de plus de la fiche), ou on a fini (off) : seulement
    // depuis la serre ; finir ne coûte rien.
    socket.on('garden:help', (raw) => {
      const on = obj(raw).on === true
      if (on) {
        if (gardenBudget < 1 || player.level !== GARDEN_LEVEL || MAPS.get(GARDEN_LEVEL).room(Math.round(player.x), Math.round(player.z)) !== GARDEN_ROOM) return
        gardenBudget--
      }
      if (setGrow(player, on)) io.emit('gardener', { id: player.id, ...gardenState() })
    })

    // Réacteurs du Krait : on les met en route installé aux commandes (dans la cale), on les coupe
    // si c'est soi qui les a lancés ; tout le bord voit Nico paniquer.
    socket.on('krait:engines', (raw) => {
      const on = obj(raw).on === true
      if (on) {
        if (mechBudget < 1 || player.level !== MECH_LEVEL || !inCockpit(player)) return
        mechBudget--
      }
      if (setBurn(player, on)) io.emit('mechanic', { id: player.id, ...mechState() })
    })

    // On parle à Ada, la cheffe de la base : à portée d'elle, sur la base.
    socket.on('chief:talk', () => {
      if (chiefBudget < 1) return
      const now = Date.now()
      if (!reaches(player, BASE_LEVEL, chiefAt(chiefTime(chief, now)))) return
      chiefBudget--
      chief = holdChief(chief, now)
      chiefFace = { x: player.x, z: player.z }
      io.emit('chief', { id: player.id, ...chiefState(now) })
    })

    // Réacteurs du Krait de la base : on les met en route installé aux commandes, on les coupe si
    // c'est soi qui les a lancés ; tous ceux qui sont sur la base les voient.
    socket.on('base:engines', (raw) => {
      const on = obj(raw).on === true
      if (on) {
        if (chiefBudget < 1 || !inBaseCockpit(player)) return
        chiefBudget--
      }
      if (setBaseBurn(player, on)) io.emit('chief', { id: player.id, ...chiefState() })
    })

    // Saut FSD : installé dans le siège du pilote, et pas pendant un autre saut. Tout le bord le vit.
    socket.on('jump', () => {
      const now = Date.now()
      if (now < jumpEnds || player.level !== PILOT_SEAT.level || player.pose !== 'pilot') return
      if (Math.hypot(player.x - PILOT_SEAT.x, player.z - PILOT_SEAT.z) > 1) return
      system = nextSystem(system)
      jumpEnds = now + (JUMP_CHARGE + JUMP_TRAVEL) * 1000 + FSD_COOLDOWN
      io.emit('jump', { id: player.id, name: player.name, system })
    })

    // Aménagement de ses quartiers (CMDR vérifiés seulement), transmis à ceux qui s'y trouvent.
    let cabinRevision = 0
    socket.on('cabin', async (raw) => {
      if (!player.verified || cabinBudget < 1) return
      const layout = sanitizeLayout(obj(raw).layout)
      if (!layout) return
      cabinBudget--
      const revision = ++cabinRevision
      if (hasSiteArtwork(layout) && !await siteArtworkAllowed(layout, socket.handshake.headers.cookie, cmdrUrl)) return
      if (revision !== cabinRevision || !players.has(socket.id)) return
      player.layout = layout
      for (const p of players.values()) {
        if (p !== player && p.cabin === player.id) sockets.get(p.id)?.emit('cabin', { id: player.id, layout })
      }
      // Quartiers ouverts (housing v2) : tout le bord l'apprend. Les fermer ne met personne dehors.
      const open = layout.home?.open === true
      if (open !== player.open) {
        player.open = open
        io.emit('open', { id: player.id, open })
      }
    })

    // Invitation dans ses quartiers (CMDR vérifiés seulement), valable une minute. L'hôte apprend
    // si elle est partie, ou pourquoi (guest : il n'est pas CMDR, gone : l'invité n'est plus à
    // bord, here : déjà chez lui, busy : trop d'invitations d'un coup).
    socket.on('invite', (raw, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {}
      const to = playerById(obj(raw).to)
      if (!player.verified) return reply({ ok: false, reason: 'guest' })
      if (!to || to === player) return reply({ ok: false, reason: 'gone' })
      if (to.cabin === player.id) return reply({ ok: false, reason: 'here' })
      if (inviteBudget < 1) return reply({ ok: false, reason: 'busy' })
      inviteBudget--
      player.invited.set(to.id, Date.now() + INVITE_TTL)
      sockets.get(to.id)?.emit('invite', { id: player.id, name: player.name, verified: player.verified })
      reply({ ok: true })
    })

    // Sonner chez un CMDR à bord : il l'apprend, à lui d'inviter. Le visiteur apprend si ça a
    // sonné, ou pourquoi pas (gone : il n'est plus à bord, guest : un invité n'a pas de quartiers
    // où recevoir, here : on y est déjà, busy : trop de coups de sonnette).
    socket.on('ring', (raw, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {}
      const host = playerById(obj(raw).to)
      if (!host || host === player) return reply({ ok: false, reason: 'gone' })
      if (!host.verified) return reply({ ok: false, reason: 'guest' })
      if (player.cabin === host.id) return reply({ ok: false, reason: 'here' })
      if (inviteBudget < 1) return reply({ ok: false, reason: 'busy' })
      inviteBudget--
      sockets.get(host.id)?.emit('ring', { id: player.id, name: player.name, verified: player.verified })
      reply({ ok: true })
    })

    socket.on('decline', (raw) => {
      const host = playerById(obj(raw).to)
      if (!host?.invited.delete(player.id)) return
      sockets.get(host.id)?.emit('decline', { id: player.id, name: player.name })
    })

    /** Notre demande d'entrée est refusée : le client apprend qu'il reste où il est. */
    const refuseVisit = () => socket.emit('visit', { id: player.id, cabin: player.cabin, expired: true })

    // Quartiers ouverts d'un CMDR absent (`stored` : son nom tel que l'annuaire du site le donne) :
    // le site dit s'ils le sont toujours et donne leur aménagement, relu au plus une fois par minute.
    const visitAbsent = async (stored) => {
      const key = clean(stored, 200)
      if (!key || visitBudget < 1) return refuseVisit()
      visitBudget--
      let home = absent.get(key)
      if (!home || Date.now() - home.at > ABSENT_TTL) {
        const found = await fetchQuarters(key, { cmdrUrl, fetcher: quartersFetch })
        if (!players.has(socket.id)) return
        const layout = found ? sanitizeLayout(found.layout) : null
        const name = found ? cleanCmdrName(found.name) : null
        // Fermés depuis, ou site injoignable : on n'entre plus (ceux qui y sont restent).
        if (!layout || !name) return refuseVisit()
        home = absent.get(key)
        if (home) {
          Object.assign(home, { name, layout, at: Date.now() })
          // Réaménagés depuis la dernière visite : ceux qui s'y trouvent le voient.
          for (const p of players.values()) if (p.cabin === home.id && p !== player) sockets.get(p.id)?.emit('cabin', { id: home.id, layout })
        } else {
          // Les instances que plus personne ne visite sont oubliées.
          for (const old of absent.values()) {
            if (Date.now() - old.at <= ABSENT_TTL || [...players.values()].some((p) => p.cabin === old.id)) continue
            absent.delete(old.key)
            absentById.delete(old.id)
            music.delete(old.id)
          }
          home = { id: nextId++, key, name, layout, at: Date.now() }
          absent.set(key, home)
          absentById.set(home.id, home)
        }
      }
      // Monté à bord entre-temps : ses quartiers sont ceux qu'il tient lui-même.
      const aboard = [...players.values()].find((p) => p.verified && p.name === `CMDR ${home.name}`)
      if (aboard === player) return moveTo(player, player.id)
      if (aboard && !aboard.open) return refuseVisit()
      const host = aboard ?? home
      // L'aménagement d'abord : le visiteur entre dans des quartiers déjà meublés.
      socket.emit('cabin', { id: host.id, layout: host.layout, ...(aboard ? {} : { name: `CMDR ${home.name}` }) })
      moveTo(player, host.id)
    }

    // Entrer dans les quartiers d'un hôte (sur invitation, ou sans s'ils sont ouverts), dans ceux,
    // ouverts, d'un CMDR absent (`cmdr`), ou rentrer chez soi (host absent).
    socket.on('visit', (raw) => {
      if (typeof obj(raw).cmdr === 'string') return void visitAbsent(obj(raw).cmdr)
      const hostId = obj(raw).host
      if (hostId === null || hostId === undefined || hostId === player.id) return moveTo(player, player.id)
      const host = playerById(hostId)
      const until = host?.invited.get(player.id) ?? 0
      // Invitation expirée ou inconnue, quartiers fermés.
      if (!host || (until < Date.now() && !host.open)) return refuseVisit()
      host.invited.delete(player.id)
      // L'aménagement d'abord : le visiteur entre dans des quartiers déjà meublés.
      socket.emit('cabin', { id: host.id, layout: host.layout })
      moveTo(player, host.id)
    })

    // L'hôte raccompagne un visiteur : celui-ci rentre chez lui.
    socket.on('kick', (raw) => {
      const guest = playerById(obj(raw).id)
      if (guest && guest !== player && guest.cabin === player.id) moveTo(guest, guest.id, player.id)
    })

    socket.on('disconnect', () => {
      clearInterval(refill)
      leaveBoard(player)
      salvage.leave(player)
      players.delete(socket.id)
      sockets.delete(player.id)
      cinema.operatorChanged()
      music.delete(player.id)
      // Son commis parti, le chef reprend sa tournée.
      if (setCook(player, false)) socket.broadcast.emit('chef', { id: player.id, ...chefState() })
      // Son aide parti, ou son pilote (les réacteurs se coupent), le mécano reprend sa tournée.
      const helped = setHelp(player, false)
      if (setBurn(player, false) || helped) socket.broadcast.emit('mechanic', { id: player.id, ...mechState() })
      // Son aide parti, la jardinière reprend sa tournée.
      if (setGrow(player, false)) socket.broadcast.emit('gardener', { id: player.id, ...gardenState() })
      // Son pilote parti, les réacteurs du Krait de la base se coupent.
      if (setBaseBurn(player, false)) socket.broadcast.emit('chief', { id: player.id, ...chiefState() })
      // Son patient parti, l'infirmière reprend sa tournée ; son pansement part avec lui.
      const hadPatch = patched.delete(player.id)
      if (endCare(player, false) || hadPatch) socket.broadcast.emit('nurse', { id: player.id, ...nurseState() })
      // Plus personne à bord : les jukebox de la salle commune et du bar se taisent.
      if (!players.size) music.clear()
      socket.broadcast.emit('leave', { id: player.id })
      // Ses visiteurs rentrent chez eux.
      for (const p of players.values()) if (p.cabin === player.id) moveTo(p, p.id)
      log(`[relais] ${player.name} (#${player.id}) a débarqué — ${players.size} à bord`)
    })
  })
  return io
}
