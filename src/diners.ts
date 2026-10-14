import * as THREE from 'three'
import { Avatar, EAT_BITE } from './avatar'
import type { Deck } from './deck'
import { tr } from './i18n'
import { HAND_LIFT, emptyTray, restCutlery, trayMesh, type TrayMesh } from './kitchen'
import { lookRig, parseLook } from './looks'
import type { DinersState } from './net'
import { dampAngle } from './player'
import { DINER_SPEED, DINERS, dinerAt, dinerSeat, dinersTime } from '../shared/diners.js'

/*
 * Les habitués du mess (cf. shared/diners.js) : Rahel, Bastien et Ilka y passent leurs pauses. Ils
 * prennent un plateau, longent le self, mangent à leur place, rendent leur plateau, prennent un café
 * au coin café, le boivent, rendent leur tasse et flânent, sans jamais quitter la salle ni entrer
 * en cuisine. Tout le bord les voit au même endroit : leur journée suit l'horloge que tient le
 * relais (hors ligne, celle de l'appareil). Ils ne s'arrêtent pas quand on leur parle : ils
 * répondent en passant.
 */

/** Qui ils sont : leur nom, leur métier à bord, ce qu'ils répondent, ce qu'ils disent en passant. */
export const DINER_PROFILES: Record<string, { name: string; role: string; lines: string[]; barks: string[] }> = {
  rahel: {
    name: 'Rahel Okonkwo',
    role: tr('pilote de convoi', 'convoy pilot'),
    lines: [
      tr('Douze sauts depuis Colonia, et le seul café correct de la bulle est ici. Ne le répétez pas à Marcel.', 'Twelve jumps from Colonia, and the only decent coffee in the bubble is here. Don\'t tell Marcel.'),
      tr('Le lapin de Ceti, c\'est le jeudi. Je m\'organise mes convois en fonction.', 'Ceti rabbit is on Thursdays. I plan my convoys around it.'),
      tr('Ma tasse, c\'est celle marquée « PAS TOUCHE ». Je dis ça, je dis rien.', 'My mug is the one marked “HANDS OFF”. Just saying.'),
    ],
    barks: [
      tr('Ah, enfin une pause.', 'Ah, finally a break.'),
      tr('Un café, et je redécolle.', 'One coffee, then I\'m off again.'),
    ],
  },
  bastien: {
    name: 'Bastien Morel',
    role: tr('mécanicien de bord', 'ship mechanic'),
    lines: [
      tr('Je répare les propulseurs, Nico répare ce que je casse. Ou l\'inverse, ça dépend des jours.', 'I fix the thrusters, Nico fixes what I break. Or the other way round, depending on the day.'),
      tr('Le distributeur m\'a encore avalé dix crédits. Je vais le démonter. Pour la science.', 'The vending machine swallowed ten more of my credits. I\'m going to take it apart. For science.'),
      tr('Vous voyez le tableau de liège ? C\'est moi qui ai perdu la spatule. Chut.', 'See the cork board? I\'m the one who lost the spatula. Shh.'),
    ],
    barks: [
      tr('Ça sent le ragoût, ou le liquide de refroidissement ?', 'Is that stew, or coolant?'),
      tr('Bon appétit, l\'équipage !', 'Enjoy your meal, crew!'),
    ],
  },
  ilka: {
    name: 'Ilka Varn',
    role: tr('cartographe', 'cartographer'),
    lines: [
      tr('Chez moi, on mange en silence, en regardant les étoiles. Ici, on mange en écoutant Marcel. C\'est… différent.', 'Back home, we eat in silence, watching the stars. Here, we eat listening to Marcel. It\'s… different.'),
      tr('J\'ai cartographié quarante systèmes, et je n\'ai toujours pas compris le principe du plateau.', 'I\'ve mapped forty systems, and I still don\'t understand the concept of the tray.'),
      tr('Le café de votre espèce est fascinant. Il rend nerveux. J\'en reprends.', 'Your species\' coffee is fascinating. It makes you jittery. I\'ll have more.'),
    ],
    barks: [
      tr('Fascinant.', 'Fascinating.'),
      tr('Encore un peu de ce liquide noir, s\'il vous plaît.', 'A little more of that black liquid, please.'),
    ],
  },
}

/** Hauteur de l'assise des bancs des tables de cantine (cf. seats.ts). */
const BENCH = 0.27
/** Le plateau posé sur la table, devant sa place : à cette distance, à cette hauteur. */
const TABLE_REACH = 0.36
const TABLE_TOP = 0.42

/** Une tasse de café, anse comprise (repère de la main). */
function cupMesh(): THREE.Group {
  const g = new THREE.Group()
  const white = new THREE.MeshLambertMaterial({ color: '#f4f6f8' })
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.02, 0.05, 10), white)
  const coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.004, 10), new THREE.MeshLambertMaterial({ color: '#3a2214' }))
  coffee.position.y = 0.022
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.004, 4, 10), white)
  handle.position.x = 0.027
  g.add(body, coffee, handle)
  return g
}

interface Diner {
  id: string
  avatar: Avatar
  tray: TrayMesh
  cup: THREE.Group
  /** Repas affiché (pour ne vider le plateau qu'à chaque changement). */
  meal: number
  posed: boolean
  stride: number
  /** Poste et geste en cours (un geste au début de chaque arrêt). */
  post: number
  placed: boolean
  /** Prochaine bouchée (s), pendant le repas. */
  biteIn: number
}

export class Diners {
  readonly list: Diner[]
  /** Horloge des habitués (ms de l'appareil) : celle du relais, recalée à l'arrivée à bord. */
  private clock = { tau: Date.now() / 1000, at: Date.now(), holdUntil: 0 }
  private barkIn = 20 + Math.random() * 20

  onStep?: (at: THREE.Vector3) => void
  onBark?: (id: string, text: string) => void
  /** Un geste à un poste : le bruit qui va avec (cf. main.ts). */
  onAct?: (act: string, at: THREE.Vector3) => void

  constructor(rigs: Awaited<ReturnType<typeof lookRig>>[], readonly deck: Deck) {
    this.list = DINERS.map((d, i) => {
      const avatar = new Avatar(rigs[i])
      deck.group.add(avatar.root)
      const tray = trayMesh()
      tray.mesh.visible = false
      const cup = cupMesh()
      cup.visible = false
      deck.group.add(tray.mesh, cup)
      return { id: d.id, avatar, tray, cup, meal: -1, posed: false, stride: 0, post: -1, placed: false, biteIn: EAT_BITE }
    })
  }

  /** Où en est leur journée, d'après le relais (à l'arrivée à bord). */
  sync(s: DinersState) {
    this.clock = { tau: s.tau, at: Date.now(), holdUntil: 0 }
  }

  /** Une place des tables est-elle tenue par un habitué (il y est, s'y assoit ou s'en relève) ? */
  holds(spot: { x: number; z: number }): boolean {
    const t = dinersTime(this.clock, Date.now())
    return DINERS.some((_, i) => {
      const seat = dinerSeat(i)
      return Math.hypot(seat.x - spot.x, seat.z - spot.z) < 0.25 && dinerAt(i, t).seated > 0
    })
  }

  /** Ce qu'il répond quand on lui parle. */
  talk(diner: Diner): string {
    const p = DINER_PROFILES[diner.id]
    const line = p.lines[Math.floor(Math.random() * p.lines.length)]
    diner.avatar.playEmote('salut')
    return tr(`${p.name}, ${p.role} : « ${line} »`, `${p.name}, ${p.role}: “${line}”`)
  }

  /** @param player position du joueur s'il est sur le pont principal, sinon null */
  update(dt: number, player: THREE.Vector3 | null) {
    const t = dinersTime(this.clock, Date.now())
    // Tout se place dans le repère du pont (son groupe est à sa hauteur) ; les mains sont en monde.
    const local = (v: THREE.Vector3) => this.deck.group.worldToLocal(v)
    this.list.forEach((d, i) => {
      const s = dinerAt(i, t)
      const root = d.avatar.root
      const was = root.position.clone()
      root.position.set(s.x, BENCH * s.seated, s.z)
      const moved = d.placed ? Math.hypot(s.x - was.x, s.z - was.z) : 0
      d.placed = true
      root.rotation.y = dampAngle(root.rotation.y, s.yaw, 8, dt)

      // Assis à sa place, ou debout ; au pas, ou arrêté.
      const sit = s.seated > 0.5
      if (sit !== d.posed) {
        d.avatar.setPose(sit ? 'sit' : null)
        d.posed = sit
      }
      d.avatar.setLocomotion(s.walking ? 'walk' : 'idle', s.walking ? DINER_SPEED : 0)
      if (s.walking) {
        d.stride += moved
        if (d.stride > 0.32) {
          d.stride = 0
          this.onStep?.(root.position)
        }
      }
      // Un geste au début de chaque arrêt à un poste : prendre un plateau, se servir, rendre, le café…
      if (!s.walking && s.seated === 0 && s.post !== d.post) {
        d.post = s.post
        if (s.act !== 'read' && s.act !== 'drink') {
          d.avatar.playEmote('interact')
          this.onAct?.(s.act, root.position)
        }
      } else if (s.walking) d.post = -1

      // On mange (le bras va de l'assiette à la bouche, une bouchée par EAT_BITE) ; on boit son café de même.
      d.avatar.eating = s.eating || (s.cup && s.act === 'drink' && !s.walking)
      if (s.eating) {
        d.biteIn -= dt
        if (d.biteIn <= 0) {
          d.biteIn = EAT_BITE
          this.onAct?.('bite', root.position)
        }
      } else d.biteIn = EAT_BITE * 0.6
      d.avatar.carrying = s.tray && s.seated === 0
      d.avatar.update(dt)

      // Le plateau : dans les mains, ou posé sur la table devant sa place pendant le repas.
      d.tray.mesh.visible = s.tray
      if (s.tray) {
        if (s.meal !== d.meal) {
          if (s.meal === 0) restCutlery(d.tray)
          emptyTray(d.tray, s.meal)
          d.meal = s.meal
        }
        if (s.seated > 0) {
          const seat = dinerSeat(i)
          d.tray.mesh.position.set(seat.x + Math.sin(seat.yaw) * TABLE_REACH, TABLE_TOP, seat.z + Math.cos(seat.yaw) * TABLE_REACH)
          d.tray.mesh.rotation.set(0, seat.yaw, 0)
          if (s.eating) this.forkInHand(d)
        } else {
          const at = d.avatar.hands(new THREE.Vector3())
          if (at) d.tray.mesh.position.copy(local(at)).add(HAND_LIFT.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, root.rotation.y))
          else d.tray.mesh.position.set(s.x + Math.sin(s.yaw) * 0.17, 0.3, s.z + Math.cos(s.yaw) * 0.17)
          d.tray.mesh.rotation.set(0, root.rotation.y, 0)
        }
      } else d.meal = -1

      // La tasse, dans la main droite.
      d.cup.visible = s.cup
      if (s.cup) {
        const hand = d.avatar.rightHand(new THREE.Vector3())
        if (hand) d.cup.position.copy(local(hand)).add(new THREE.Vector3(0, 0.02, 0))
        else d.cup.position.set(s.x, 0.4, s.z)
        d.cup.rotation.set(0, root.rotation.y, 0)
      }
    })

    // De temps en temps, l'un d'eux dit un mot, si le joueur est près.
    this.barkIn -= dt
    if (this.barkIn <= 0) {
      this.barkIn = 30 + Math.random() * 30
      const near = player ? this.list.filter((d) => d.avatar.root.position.distanceTo(player) < 4.5) : []
      if (near.length) {
        const d = near[Math.floor(Math.random() * near.length)]
        const barks = DINER_PROFILES[d.id].barks
        this.onBark?.(d.id, barks[Math.floor(Math.random() * barks.length)])
      }
    }
  }

  /** La fourchette suit la main droite, dents vers l'avant et vers le haut (repère du plateau, cf. kitchen.ts). */
  private forkInHand(d: Diner) {
    const at = d.avatar.rightHand(new THREE.Vector3())
    if (!at) return
    d.tray.mesh.updateWorldMatrix(true, false)
    d.tray.fork.position.copy(d.tray.mesh.worldToLocal(at))
    d.tray.fork.rotation.set(-0.9, 0.35, 0)
  }
}

/** Les habitués, habillés (cf. DINERS dans shared/diners.js). */
export function dinerRigs() {
  return Promise.all(DINERS.map((d) => lookRig(parseLook(d.look))))
}
