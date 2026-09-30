import * as THREE from 'three'
import { Deck, type Interactable } from '../deck'
import { baseKraitPower } from '../furniture/hangar'
import { tr } from '../i18n'
import type { ChiefState } from '../net'
import type { Player } from '../player'
import { BASE_ARRIVAL, BASE_BURN, HANGAR_ARRIVAL } from '../../shared/ground-base.js'
import { CHIEF, Chief, chiefRig, type ChiefReport } from './chief'
import { FlightScreen } from './flight'
import { loadBaseKit } from './kit'
import { baseLevel } from './level'

/*
 * La base au sol, côté joueur : le voyage en Krait entre le hangar de la cale et l'avant-poste
 * Bradbury, dans les deux sens, et ce qui s'y passe (Ada, la cheffe de la base ; le Krait posé sur
 * son aire).
 *
 * Aux commandes d'un Krait (celui du hangar, ou celui de la base), Espace met les réacteurs en
 * route ; Espace encore, réacteurs allumés : on décolle. L'écran de voyage (cf. flight.ts) couvre
 * le changement de pont ; au premier départ, il couvre aussi le chargement de la base (les modèles
 * du Space Kit, la cheffe), qui n'est construite qu'alors.
 */

/** Quand un autre CMDR met les gaz sur l'aire, et qu'on est sur la base. */
const LIFTOFF = [
  tr('Les réacteurs du Krait rugissent sur l\'aire. Quelqu\'un s\'en va.', 'The Krait\'s thrusters roar on the pad. Someone is leaving.'),
]

/** Ce qu'on lit en mettant les réacteurs en route sur la base. */
const IGNITION = [
  tr('Les réacteurs du Krait s\'éveillent. La poussière rouge se soulève tout autour de l\'aire. Espace pour décoller.', 'The Krait\'s thrusters wake up. Red dust rises all around the pad. Space to take off.'),
  tr('Contact ! Le Krait tremble sur son train. Au pied de la tour, Ada lève la main. Espace pour décoller.', 'Ignition! The Krait shudders on its gear. At the foot of the tower, Ada raises a hand. Space to take off.'),
]

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]

export interface GroundBaseHost {
  player: Player
  /** Pont où se trouve le joueur. */
  here: () => Deck
  /** Le pont de la cale (le hangar du vaisseau). */
  hold: Deck
  /** Place où le joueur est installé, s'il l'est (installé seulement, pas en montant les marches). */
  seat: () => { item: Interactable } | null
  /** La base est construite : le jeu l'ajoute à ses ponts (scène, portes, lumières). */
  built: (deck: Deck, chief: Chief) => void
  /** Change de pont (écran couvert) : le joueur y arrive à cet endroit. */
  arrive: (deck: Deck, at: { x: number; z: number; yaw: number }) => void
  /** Réacteurs du Krait de la base, en route ou coupés : le relais le sait. */
  engines: (on: boolean) => void
  /** Texte dans la boîte de dialogue. */
  show: (text: string) => void
  /** Le nom du système où se trouve le vaisseau (la base est sur l'une de ses planètes). */
  system: () => string
  /** Grondement des réacteurs pendant le vol (rend de quoi le couper), et le posé. */
  roar: () => { stop: () => void } | undefined
  touchdown: () => void
}

export class GroundBase {
  deck: Deck | null = null
  chief: Chief | null = null
  private building: Promise<void> | null = null
  private readonly flight = new FlightScreen()
  private ladder?: Interactable
  /** C'est le joueur local qui a mis les réacteurs du Krait de la base en route. */
  private started = false

  constructor(private readonly host: GroundBaseHost) {}

  /** Un voyage est en cours (l'écran de vol couvre tout). */
  get flying(): boolean {
    return this.flight.busy
  }

  /** Le joueur est sur la base. */
  get here(): boolean {
    return !!this.deck && this.host.here() === this.deck
  }

  /** Charge et construit la base (une fois). */
  prepare(): Promise<void> {
    return (this.building ??= (async () => {
      const [kit, rig] = await Promise.all([loadBaseKit(), chiefRig()])
      const deck = new Deck(baseLevel(kit))
      const chief = new Chief(rig, deck)
      this.ladder = deck.interactables.find((it) => it.furniture?.model === 'krait-ladder')
      const krait = deck.interactables.find((it) => it.furniture?.model === 'krait-mk2')
      // Aux commandes, c'est le Krait qui reste net (on est dans son cockpit), pas l'escabeau.
      if (this.ladder && krait) this.ladder.keep = krait.object.position
      this.deck = deck
      this.chief = chief
      this.host.built(deck, chief)
    })())
  }

  /** Le joueur local est aux commandes du Krait de la base. */
  get aboardKrait(): boolean {
    const seat = this.host.seat()
    return this.here && !!seat && seat.item === this.ladder
  }

  /** Les réacteurs du Krait de la base tournent (le joueur local ou un autre les a mis en route). */
  get engines(): boolean {
    return !!this.chief?.burning
  }

  /** Aux commandes du Krait de la base, Espace : les réacteurs démarrent ; allumés, on décolle. */
  seatAction() {
    if (!this.aboardKrait) return
    if (this.engines) return void this.fly(false)
    this.started = true
    this.chief?.setBurn(BASE_BURN, true)
    this.host.engines(true)
    this.host.show(pick(IGNITION))
  }

  /** Le relais : la ronde d'Ada, et les réacteurs du Krait de la base. */
  sync(s: ChiefState, from: number, self: number) {
    const was = this.engines
    this.chief?.sync(s)
    if (!was && this.engines && from !== self && this.here) this.host.show(pick(LIFTOFF))
  }

  /** On parle à Ada. */
  talk(report: ChiefReport): string | null {
    if (!this.chief) return null
    const line = this.chief.talk(this.host.player.position, report)
    return tr(`${CHIEF} : « ${line} »`, `${CHIEF}: “${line}”`)
  }

  /**
   * Le voyage : du hangar vers la base (`down`), ou de la base vers le hangar. Le joueur quitte le
   * cockpit, l'écran de vol couvre tout, et il pose le pied au pied de l'escabeau de l'autre Krait.
   */
  async fly(down: boolean) {
    if (this.flying) return
    const ready = down ? this.prepare() : Promise.resolve()
    const roar = this.host.roar()
    const stop = () => roar?.stop()
    try {
      await this.flight.run({
        down,
        title: down ? tr('Avant-poste Bradbury', 'Bradbury Outpost') : tr('Hangar du vaisseau', 'Ship\'s hangar'),
        where: down
          ? tr(`Quatrième planète de ${this.host.system()}`, `Fourth planet of ${this.host.system()}`)
          : tr(`En orbite de ${this.host.system()}`, `In orbit around ${this.host.system()}`),
        ready,
        swap: () => {
          stop()
          if (this.started) this.host.engines(false)
          this.started = false
          if (down && this.deck) this.host.arrive(this.deck, BASE_ARRIVAL)
          else if (!down) this.host.arrive(this.host.hold, HANGAR_ARRIVAL)
          this.host.touchdown()
        },
      })
    } catch (e) {
      stop()
      console.error(e)
      this.host.show(tr('Le Krait fait demi-tour : la base ne répond pas. Réessayez dans un instant.', 'The Krait turns back: the base is not answering. Try again in a moment.'))
    }
  }

  /** À chaque image : la cheffe, et les tuyères du Krait de la base. */
  update(dt: number) {
    const { chief, deck } = this
    if (!chief || !deck) return
    const here = this.here
    chief.update(dt, here ? this.host.player.position : null)
    const aboard = this.aboardKrait
    // Descendu du cockpit : ses réacteurs se coupent avec lui.
    if (this.started && (!aboard || !this.engines) && !this.flying) {
      if (this.engines) {
        this.host.engines(false)
        chief.setBurn(0, true)
      }
      this.started = false
    }
    baseKraitPower.value = this.engines ? 1 : aboard ? 0.3 : 0
  }

  /** Position de la cheffe (pour les bulles et les portes), si la base est construite. */
  get chiefPosition(): THREE.Vector3 | null {
    return this.chief?.position ?? null
  }
}
