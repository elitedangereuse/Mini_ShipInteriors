import * as THREE from 'three'
import { CHEF } from './chef'
import type { Deck, Interactable } from './deck'
import type { WorkSound } from './economy/tasks'
import { EAT_BITE } from './avatar'
import { tr } from './i18n'
import { menuOf, type Menu } from './menu'
import type { Player } from './player'
import type { SeatSpot } from './seats'
import { CHEF_ROOM } from '../shared/chef.js'

/*
 * Le self du mess, côté joueur : manger. (On cuisine désormais en équipe, au rail des bons : c'est
 * MESS RUSH, cf. src/mess-rush/.)
 *
 * Plateaux : au début du self, on prend un plateau garni du menu du jour (Marcel souhaite bon
 * appétit) ; on le porte à deux mains jusqu'à une table de cantine, il se pose devant soi, et on
 * mange (Espace) : la fourchette fait des allers-retours, l'entrée, le plat, le dessert et la
 * boisson se vident l'un après l'autre ; à la fin, il ne reste que l'assiette vide et les couverts
 * posés dessus. On rapporte le plateau au retour plateaux ; qui sort du mess avec, Marcel le lui
 * crie. Tout cela reste local au joueur (les autres ne voient pas les plateaux).
 *
 * Le nombre de plats livrés en cuisine (MESS RUSH) est gardé dans ce navigateur : Marcel en parle.
 */

/** Le plateau repose sur les mains : un peu au-dessus de leur bout, et à peine en avant. */
export const HAND_LIFT = new THREE.Vector3(0, 0.012, 0.03)
/** Temps d'un repas à table (s), d'une traite. */
const MEAL = 12
/** Part du repas où chaque plat se vide : entrée, plat, dessert, boisson (cf. trayMesh). */
const COURSES: [number, number][] = [[0, 0.22], [0.22, 0.62], [0.62, 0.85], [0.85, 1]]
/** Marcel ne crie pas plus souvent que ça après qui sort avec un plateau (s). */
const SHOUT_AGAIN = 20

/** Marcel, quand on prend un plateau (`{main}` : le plat du jour). */
const ENJOY = [
  tr('Bon appétit ! Et on finit son assiette, hein.', 'Enjoy your meal! And you finish your plate, mind.'),
  tr('Bon appétit, pilote ! {main}, c\'est ma fierté du jour.', 'Enjoy, pilot! {main}: today\'s pride and joy.'),
  tr('Régale-toi ! Et le plateau revient au chariot après.', 'Tuck in! And the tray goes back on the trolley afterwards.'),
  tr('Bon appétit ! Pas de miettes dans mes coursives.', 'Enjoy! No crumbs in my corridors.'),
  tr('Mange tant que c\'est chaud. Bon appétit !', 'Eat it while it\'s hot. Enjoy!'),
]

/** Marcel, à qui sort du mess avec son plateau (fini ou non) sans l'avoir rendu. */
const TAKEN_AWAY = {
  eaten: [
    tr('Hé ! Le plateau ! Le chariot de débarrassage, il n\'est pas là pour faire joli !', 'Hey! The tray! The clearing trolley isn\'t there for decoration!'),
    tr('Les plateaux restent au mess ! Tu le reposes sur le chariot, comme tout le monde !', 'Trays stay in the mess! Put it back on the trolley, like everyone else!'),
    tr('Où tu vas avec mon plateau ? Au chariot, pas en cabine !', 'Where are you going with my tray? The trolley, not your cabin!'),
  ],
  full: [
    tr('Tu pars avec un plateau plein ? Et en plus tu me l\'emportes ? Reviens ici !', 'Walking off with a full tray? And taking it with you? Get back here!'),
    tr('Hé ! On mange au mess, et on rend son plateau au chariot !', 'Hey! You eat in the mess, and you return your tray to the trolley!'),
  ],
}

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]

/** Plats livrés par ce joueur en cuisine (MESS RUSH), gardés dans ce navigateur (le stockage peut manquer). */
const SERVED_KEY = 'mini-shipinteriors-plats'
function loadServed(): number {
  try {
    return Math.max(0, Number(localStorage.getItem(SERVED_KEY)) || 0)
  } catch {
    return 0
  }
}
function saveServed(n: number) {
  try {
    localStorage.setItem(SERVED_KEY, String(n))
  } catch {
    // Stockage indisponible (navigation privée) : on compte pour cette visite seulement.
  }
}

export interface KitchenHost {
  /** Le pont principal (le mess). */
  deck: Deck
  player: Player
  /** Pont où se trouve le joueur. */
  here: () => Deck
  /** Place où le joueur est installé, s'il l'est. */
  seat: () => { item: Interactable; spot: SeatSpot } | null
  /** Texte dans la boîte de dialogue. */
  show: (text: string) => void
  /** Bulle au-dessus du chef. */
  chefSays: (text: string) => void
  /** Se met à l'ouvrage (cf. startWork dans main.ts) ; false si le joueur est occupé ailleurs. */
  work: (job: {
    at: THREE.Vector3
    duration: number
    label: string
    sound: WorkSound
    alive: () => boolean
    finish: () => void
    stopped?: () => void
    seated?: boolean
    every?: number
    progress?: (f: number) => void
  }) => boolean
}

/** Plateau porté ou posé : le menu, et s'il reste à manger. */
interface Tray extends TrayMesh {
  menu: Menu
  eaten: boolean
  /** Part du repas déjà mangée (0 à 1) : on peut se lever en cours de route, et reprendre. */
  meal: number
  /** On est en train de manger (la fourchette est dans la main). */
  eating: boolean
  /** Était au mess à l'image d'avant (sortir avec le plateau fait crier Marcel). */
  inMess: boolean
}

export class Kitchen {
  /** Plats livrés en cuisine (MESS RUSH), dans ce navigateur. */
  served = loadServed()
  private tray: Tray | null = null
  /** Quand Marcel pourra de nouveau crier après un plateau emporté (horloge de performance, s). */
  private shoutAt = 0

  constructor(private readonly host: KitchenHost) {
    // Le début du self : prendre un plateau ; le retour : le rendre ; le tableau : le menu du jour.
    for (const it of host.deck.interactables) {
      if (it.furniture?.model === 'tray-stack') it.onInteract = () => this.takeTray()
      else if (it.furniture?.model === 'tray-return') it.onInteract = () => this.returnTray()
      else if (it.furniture?.model === 'menu-board') it.text = () => menuText(menuOf())
    }
  }

  /** Un plat de plus livré en cuisine par ce joueur (MESS RUSH). */
  addServed() {
    this.served++
    saveServed(this.served)
  }

  /**
   * Le plateau repart au chariot sans un mot (on prend le service de MESS RUSH : en cuisine, on a
   * les mains libres). Vrai s'il y en avait un.
   */
  stowTray(): boolean {
    const t = this.tray
    if (!t) return false
    t.mesh.removeFromParent()
    this.host.player.avatar.carrying = false
    this.host.player.avatar.eating = false
    this.tray = null
    return true
  }


  // ------------------------------------------------------------ plateaux

  private takeTray() {
    const { host } = this
    if (this.tray) return host.show(tr('Vous avez déjà un plateau. Un seul par personne, dit le panneau. Marcel l\'a écrit en rouge.', 'You already have a tray. One per person, says the sign. Marcel wrote it in red.'))
    const menu = menuOf()
    this.tray = { menu, eaten: false, meal: 0, eating: false, inMess: true, ...trayMesh() }
    host.player.root.add(this.tray.mesh)
    this.holdTray()
    host.player.interact()
    // Marcel souhaite bon appétit, d'où qu'il soit dans sa cuisine (sa bulle, et la boîte de dialogue).
    const enjoy = pick(ENJOY).replace('{main}', menu.main)
    host.show(tr(
      `Vous faites le tour du self : ${menu.starter}, ${menu.main}, ${menu.dessert} et ${menu.drink}. ${CHEF} : « ${enjoy} »`,
      `You go down the line: ${menu.starter}, ${menu.main}, ${menu.dessert} and ${menu.drink}. ${CHEF}: “${enjoy}”`,
    ))
    host.chefSays(enjoy)
  }

  // ------------------------------------------------------------ manger

  /** Installé à une table de cantine, son plateau plein devant soi : on peut manger (Espace). */
  canEat(seat: { item: Interactable } | null): boolean {
    return !!this.tray && !this.tray.eaten && seat?.item.furniture?.model === 'canteen-table' && this.host.here() === this.host.deck
  }

  /** En train de manger. */
  get eating(): boolean {
    return !!this.tray?.eating
  }

  /** On vient de s'asseoir à table avec son plateau. */
  sat() {
    const t = this.tray
    if (!t || t.eaten) return
    this.host.show(t.meal > 0
      ? tr('Votre plateau vous attendait. Il en reste un peu.', 'Your tray was waiting for you. There\'s a bit left.')
      : tr(`Vous posez votre plateau. ${t.menu.main}, ça sent bon.`, `You put your tray down. ${t.menu.main}, it smells good.`))
  }

  /**
   * Manger (Espace, à table) : la jauge des tâches, une bouchée par EAT_BITE (la fourchette va de
   * l'assiette à la bouche, cf. Avatar.eating), les plats se vident l'un après l'autre. Se lever
   * arrête le repas, qui reprend où il en était.
   */
  eat() {
    const t = this.tray
    if (!t || t.eaten || t.eating || t.mesh.parent !== this.host.deck.group) return
    const { avatar } = this.host.player
    const from = t.meal
    const started = this.host.work({
      at: t.mesh.position,
      duration: MEAL * (1 - from),
      label: tr('Vous mangez…', 'Eating…'),
      sound: 'munch',
      seated: true,
      every: EAT_BITE,
      alive: () => this.tray === t && t.mesh.parent === this.host.deck.group,
      progress: (f) => {
        t.meal = from + (1 - from) * f
        emptyTray(t, t.meal)
      },
      stopped: () => {
        t.eating = false
        avatar.eating = false
        if (!t.eaten) restCutlery(t)
      },
      finish: () => this.finishMeal(t),
    })
    if (!started) return
    t.eating = true
    avatar.eating = true
  }

  /** Repas fini : il ne reste que l'assiette vide, les couverts posés dessus. */
  private finishMeal(t: Tray) {
    t.meal = 1
    t.eaten = true
    emptyTray(t, 1)
    this.host.show(pick([
      tr(`Plateau terminé. ${t.menu.main} : Marcel avait raison, ça a du caractère.`, `Tray finished. ${t.menu.main}: Marcel was right, it has character.`),
      tr(`Plateau terminé. Le ${t.menu.drink} vous réveillerait un Thargoïde.`, `Tray finished. The ${t.menu.drink} could wake a Thargoid.`),
      tr(`Plateau terminé. ${t.menu.dessert}… vous en reprendriez bien. Il n'y en a plus.`, `Tray finished. ${t.menu.dessert}… you\'d have seconds. There are none left.`),
    ]) + tr(' Pensez au retour plateaux.', ' Don\'t forget the tray return.'))
  }

  private returnTray() {
    const { host } = this
    const t = this.tray
    if (!t) return host.show(tr('Retour plateaux : le tapis emporte tout vers la plonge. Enfin, en théorie.', 'Tray return: the belt carries everything to the dishwashing station. In theory.'))
    t.mesh.removeFromParent()
    host.player.avatar.carrying = false
    host.player.avatar.eating = false
    this.tray = null
    host.player.interact()
    host.show(t.eaten
      ? pick([
        tr('Plateau rendu. Le tapis l\'emporte avec un couinement satisfait.', 'Tray returned. The belt carries it off with a satisfied squeak.'),
        tr('Plateau rendu, assiette propre. Marcel, de loin, hoche la tête. C\'est rare.', 'Tray returned, clean plate. Marcel nods from afar. That\'s rare.'),
      ])
      : tr('Vous rendez un plateau plein. Marcel l\'a vu. Marcel voit tout.', 'You return a full tray. Marcel saw that. Marcel sees everything.'))
  }

  /** Le plateau dans les mains, devant soi : les bras se tendent pour le tenir (cf. carryTray). */
  private holdTray() {
    const t = this.tray
    if (!t) return
    this.host.player.root.add(t.mesh)
    this.host.player.avatar.carrying = true
    t.mesh.rotation.set(0, 0, 0)
    this.carryTray()
  }

  /** Le plateau porté suit les mains (qui bougent avec la marche) ; faute de mains, devant le buste. */
  private carryTray() {
    const t = this.tray
    const { player } = this.host
    if (!t || t.mesh.parent !== player.root) return
    const at = player.avatar.hands(new THREE.Vector3())
    if (at) t.mesh.position.copy(player.root.worldToLocal(at)).add(HAND_LIFT)
    else t.mesh.position.set(0, 0.3, 0.17)
  }

  /** Assis à une table de cantine : le plateau se pose devant soi, sur la table. */
  private layTray(spot: SeatSpot) {
    const t = this.tray
    if (!t) return
    this.host.deck.group.add(t.mesh)
    this.host.player.avatar.carrying = false
    t.mesh.position.set(spot.x + Math.sin(spot.yaw) * 0.42, 0.42, spot.z + Math.cos(spot.yaw) * 0.42)
    t.mesh.rotation.set(0, spot.yaw, 0)
  }

  // ------------------------------------------------------------ à chaque image

  update() {
    const { host } = this
    // Le plateau : posé devant soi à une table de cantine (on y mange), dans les mains sinon.
    const t = this.tray
    if (!t) return
    const seat = host.seat()
    const atTable = seat?.item.furniture?.model === 'canteen-table' && host.here() === host.deck
    if (atTable && t.mesh.parent !== host.deck.group) this.layTray(seat.spot)
    else if (!atTable && t.mesh.parent !== host.player.root) this.holdTray()
    this.carryTray()
    if (t.eating) this.forkInHand(t)

    // Sorti du mess avec son plateau, sans l'avoir rendu : Marcel le crie (à ce joueur seulement).
    const p = host.player.position
    const inMess = host.here() === host.deck && host.deck.map.room(Math.round(p.x), Math.round(p.z)) === CHEF_ROOM
    const now = performance.now() / 1000
    if (t.inMess && !inMess && now >= this.shoutAt) {
      this.shoutAt = now + SHOUT_AGAIN
      const line = pick(t.eaten ? TAKEN_AWAY.eaten : TAKEN_AWAY.full)
      host.show(tr(`${CHEF}, depuis le mess : « ${line} »`, `${CHEF}, from the mess: “${line}”`))
      host.chefSays(line)
    }
    t.inMess = inMess
  }

  /** La fourchette suit la main droite, dents vers l'avant et vers le haut (repère du plateau). */
  private forkInHand(t: Tray) {
    const at = this.host.player.avatar.rightHand(new THREE.Vector3())
    if (!at || t.mesh.parent !== this.host.deck.group) return
    t.mesh.updateWorldMatrix(true, false)
    t.fork.position.copy(t.mesh.worldToLocal(at))
    t.fork.rotation.set(-0.9, 0.35, 0)
  }
}

/** Le tableau du menu, lu de près. */
function menuText(menu: Menu): string {
  return tr(
    `Menu du jour · Entrée : ${menu.starter} · Plat : ${menu.main} · Dessert : ${menu.dessert} · Boisson : ${menu.drink}.`,
    `Today's menu · Starter: ${menu.starter} · Main: ${menu.main} · Dessert: ${menu.dessert} · Drink: ${menu.drink}.`,
  )
}

/** Le plateau, et ce qui est dessus. */
export interface TrayMesh {
  mesh: THREE.Group
  /** Entrée, plat, dessert, boisson : se vident dans cet ordre (cf. COURSES). */
  food: THREE.Mesh[]
  /** Bol d'entrée, coupelle de dessert, gobelet : débarrassés à la fin du repas. */
  dishes: THREE.Object3D[]
  fork: THREE.Object3D
  knife: THREE.Object3D
}

/** Les couverts, le repas pas fini : la fourchette à gauche de l'assiette, le couteau à droite. */
const FORK_AT = new THREE.Vector3(0.035, 0.016, 0.02)
const KNIFE_AT = new THREE.Vector3(-0.13, 0.016, 0.02)

/** Un plateau garni : assiette du plat, bol d'entrée, coupelle de dessert, gobelet, couverts. */
export function trayMesh(): TrayMesh {
  const lit = (color: string) => new THREE.MeshLambertMaterial({ color })
  const g = new THREE.Group()
  const at = (o: THREE.Mesh, x: number, y: number, z: number) => {
    o.position.set(x, y, z)
    g.add(o)
    return o
  }
  const cyl = (rt: number, rb: number, h: number, color: string, seg = 12) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), lit(color))
  at(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.014, 0.22), lit('#3a3f48')), 0, 0.007, 0)
  at(cyl(0.065, 0.055, 0.012, '#f2f0ea'), -0.05, 0.02, 0.02)
  const dishes = [
    at(cyl(0.035, 0.028, 0.03, '#f2f0ea'), 0.08, 0.029, -0.05),
    at(cyl(0.03, 0.024, 0.018, '#f2f0ea'), 0.1, 0.023, 0.035),
    at(cyl(0.02, 0.017, 0.045, '#c9dde6'), 0.045, 0.036, 0.075),
  ]
  const food = [
    at(cyl(0.03, 0.03, 0.01, '#6fb04a'), 0.08, 0.043, -0.05),
    at(cyl(0.045, 0.05, 0.025, '#9a4a24'), -0.05, 0.035, 0.02),
    at(cyl(0.026, 0.026, 0.01, '#7a2a6b'), 0.1, 0.031, 0.035),
    at(cyl(0.017, 0.016, 0.034, '#7a4a26'), 0.045, 0.036, 0.075),
  ]
  for (const f of food) f.userData.y = f.position.y
  const steel = lit('#c6ccd4')
  // La fourchette : manche et trois dents, le long de z (dents vers +z) ; le couteau : manche et lame.
  const fork = new THREE.Group()
  fork.add(new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.003, 0.075), steel))
  for (const x of [-0.004, 0, 0.004]) fork.add(new THREE.Mesh(new THREE.BoxGeometry(0.0022, 0.003, 0.03), steel).translateX(x).translateZ(0.05))
  const knife = new THREE.Group()
  knife.add(new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.004, 0.055), lit('#2d3138')).translateZ(-0.03))
  knife.add(new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.002, 0.06), steel).translateZ(0.027))
  g.add(fork, knife)
  const t = { mesh: g, food, dishes, fork, knife }
  restCutlery(t)
  return t
}

/**
 * Le repas avance (`meal` : 0 à 1) : chaque plat baisse à son tour (cf. COURSES), jusqu'à ne
 * plus rien laisser. Fini, on débarrasse le bol, la coupelle et le gobelet : il ne reste que
 * l'assiette vide, les couverts posés dessus, en biais, côte à côte (c'est terminé).
 */
export function emptyTray(t: TrayMesh, meal: number) {
  t.food.forEach((f, i) => {
    const [a, b] = COURSES[i]
    const left = 1 - THREE.MathUtils.clamp((meal - a) / (b - a), 0, 1)
    f.visible = left > 0.03
    const h = (f.geometry as THREE.CylinderGeometry).parameters.height
    f.scale.set(0.45 + 0.55 * left, Math.max(0.01, left), 0.45 + 0.55 * left)
    f.position.y = f.userData.y - (h * (1 - left)) / 2
  })
  const done = meal >= 1
  for (const d of t.dishes) d.visible = !done
  if (done) {
    t.fork.position.set(-0.042, 0.03, 0.02)
    t.fork.rotation.set(0, 0.55, 0)
    t.knife.position.set(-0.06, 0.03, 0.028)
    t.knife.rotation.set(0, 0.55, 0)
  }
}

/** Les couverts reprennent leur place de part et d'autre de l'assiette. */
export function restCutlery(t: TrayMesh) {
  t.fork.position.copy(FORK_AT)
  t.fork.rotation.set(0, 0, 0)
  t.knife.position.copy(KNIFE_AT)
  t.knife.rotation.set(0, 0, 0)
}
