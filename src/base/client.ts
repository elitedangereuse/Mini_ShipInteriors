import * as THREE from 'three'
import { Deck, type Interactable } from '../deck'
import { baseKraitPower } from '../furniture/hangar'
import { tr } from '../i18n'
import type { ChiefState } from '../net'
import type { Player } from '../player'
import type { EdShipId } from '../ed-ships'
import { chosenShip, ShipBay } from '../ship-bay'
import { BASE_ARRIVAL, BASE_BURN, BASE_KRAIT, HANGAR_ARRIVAL } from '../../shared/ground-base.js'
import { CHIEF, Chief, chiefRig, type ChiefReport } from './chief'
import { FlightScreen } from './flight'
import { loadBaseKit } from './kit'
import { baseLevel } from './level'

/*
 * La base au sol, côté joueur : le voyage entre le hangar de la cale et l'avant-poste Bradbury,
 * dans les deux sens, à bord du vaisseau choisi au registre du hangar (le Krait Mk II d'abord, cf.
 * ship-bay.ts), et ce qui s'y passe (Ada, la cheffe de la base ; notre vaisseau posé sur son aire).
 *
 * Aux commandes (au hangar, ou sur la base), Espace met les réacteurs en route ; Espace encore,
 * réacteurs allumés : on décolle. L'écran de voyage (cf. flight.ts) couvre
 * le changement de pont ; au premier départ, il couvre aussi le chargement de la base (les modèles
 * du Space Kit, la cheffe), qui n'est construite qu'alors.
 */

/** Quand un autre CMDR met les gaz sur l'aire, et qu'on est sur la base. */
const LIFTOFF = [
  tr('Des réacteurs rugissent sur l\'aire. Quelqu\'un s\'en va.', 'Thrusters roar on the pad. Someone is leaving.'),
]

/** Ce qu'on lit en mettant les réacteurs en route sur la base. */
const IGNITION = [
  tr('Les réacteurs de ton {ship} s\'éveillent. La poussière rouge se soulève tout autour de l\'aire. Espace pour décoller.', 'Your {ship}\'s thrusters wake up. Red dust rises all around the pad. Space to take off.'),
  tr('Contact ! Ton {ship} tremble sur son train. Au pied de la tour, Ada lève la main. Espace pour décoller.', 'Ignition! Your {ship} shudders on its gear. At the foot of the tower, Ada raises a hand. Space to take off.'),
]

/** Ce qu'on lit en examinant son vaisseau, posé sur l'aire. */
const PARKED = [
  tr('Ton {ship}, posé sur l\'aire de l\'avant-poste. De la poussière rouge s\'est déjà glissée dans le train. Nico va adorer.', 'Your {ship}, parked on the outpost\'s pad. Red dust has already crept into the landing gear. Nico is going to love that.'),
  tr('La coque craque en refroidissant. Pour rentrer au vaisseau : l\'escabeau, le cockpit, et Espace pour les réacteurs.', 'The hull creaks as it cools. To fly back to the ship: the ladder, the cockpit, and Space for the thrusters.'),
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
  /** Réacteurs du vaisseau de la base, en route ou coupés : le relais le sait. */
  engines: (on: boolean) => void
  /** Texte dans la boîte de dialogue. */
  show: (text: string) => void
  /** Le nom du système où se trouve le vaisseau (la base est sur l'une de ses planètes). */
  system: () => string
  /** Grondement des réacteurs pendant le vol (rend de quoi le couper), et le posé. */
  roar: () => { stop: () => void } | undefined
  touchdown: () => void
  /** La silhouette du vaisseau du joueur (vue de dessus, nez vers +x), pour l'écran de vol. */
  silhouette: () => string | null
}

export class GroundBase {
  deck: Deck | null = null
  chief: Chief | null = null
  private building: Promise<void> | null = null
  private readonly flight = new FlightScreen()
  private ladder?: Interactable
  /** Notre vaisseau, posé sur l'aire de la base (cf. ship-bay.ts). */
  bay: ShipBay | null = null
  /** C'est le joueur local qui a mis les réacteurs de son vaisseau, sur la base, en route. */
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
      // Notre vaisseau, là où se posait le Krait : nez à l'ouest, vers les bâtiments.
      const bay = new ShipBay({ deck, pad: { x: BASE_KRAIT.x, z: BASE_KRAIT.z, rot: 3 }, power: baseKraitPower })
      bay.hull.text = () => {
        const line = PARKED[Math.floor(Math.random() * PARKED.length)]
        return line.split('{ship}').join(bay.info?.name ?? 'Krait Mk II')
      }
      await bay.set(chosenShip())
      this.bay = bay
      this.ladder = bay.cockpit
      this.deck = deck
      this.chief = chief
      this.host.built(deck, chief)
    })())
  }

  /** Le joueur local est aux commandes de son vaisseau, sur la base. */
  get aboardKrait(): boolean {
    const seat = this.host.seat()
    return this.here && !!seat && seat.item === this.ladder
  }

  /** Nos réacteurs tournent, sur la base : nous les avons mis en route (chacun son vaisseau). */
  get engines(): boolean {
    return this.started && !!this.chief?.burning
  }

  /** Des réacteurs tournent sur l'aire, les nôtres ou ceux d'un autre CMDR (le grondement, Ada qui salue). */
  get roaring(): boolean {
    return !!this.chief?.burning
  }

  /** Aux commandes, sur la base, Espace : les réacteurs démarrent ; allumés, on décolle. */
  seatAction() {
    if (!this.aboardKrait) return
    if (this.engines) return void this.fly(false)
    this.started = true
    this.chief?.setBurn(BASE_BURN, true)
    this.host.engines(true)
    this.host.show(pick(IGNITION).split('{ship}').join(this.bay?.info?.name ?? 'Krait Mk II'))
  }

  /** Le joueur a choisi un autre vaisseau au registre du hangar : il l'attend aussi sur la base. */
  setShip(id: EdShipId) {
    void this.bay?.set(id)
  }

  /** Le relais : la ronde d'Ada, et les réacteurs sur l'aire de la base. */
  sync(s: ChiefState, from: number, self: number) {
    const was = this.roaring
    this.chief?.sync(s)
    if (!was && this.roaring && from !== self && this.here) this.host.show(pick(LIFTOFF))
  }

  /** On parle à Ada (elle parle de notre vaisseau, celui de l'aire). */
  talk(report: ChiefReport): string | null {
    if (!this.chief) return null
    const line = this.chief.talk(this.host.player.position, report)
    return tr(`${CHIEF} : « ${line} »`, `${CHIEF}: “${line}”`)
  }

  /**
   * Le voyage : du hangar vers la base (`down`), ou de la base vers le hangar. Le joueur quitte le
   * cockpit, l'écran de vol couvre tout, et il pose le pied au pied de l'escabeau, à l'autre bout.
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
        ship: this.host.silhouette(),
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
      this.host.show(tr('Ton vaisseau fait demi-tour : la base ne répond pas. Réessayez dans un instant.', 'Your ship turns back: the base is not answering. Try again in a moment.'))
    }
  }

  /** À chaque image : la cheffe, et les tuyères de notre vaisseau sur la base. */
  update(dt: number) {
    this.bay?.update(performance.now() / 1000)
    const { chief, deck } = this
    if (!chief || !deck) return
    const here = this.here
    chief.update(dt, here ? this.host.player.position : null)
    const aboard = this.aboardKrait
    // Descendu du cockpit : ses réacteurs se coupent avec lui.
    if (this.started && (!aboard || !chief.burning) && !this.flying) {
      if (chief.burning) {
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
