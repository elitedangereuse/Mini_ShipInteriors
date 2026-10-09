import * as THREE from 'three'
import { renderQuality } from '../quality'
import { haloTime } from './glow'
import { lightFieldGain, showLightField, type LightField } from './field'

/*
 * Éclairage du jeu : le ciel et le soleil d'ambiance, la réserve de vraies lumières, et le champ
 * de lumière du pont affiché (cf. field.ts).
 *
 * Un pont déclare autant de lampes qu'il veut (cf. LightSource). Toutes s'inscrivent dans son
 * champ, qui éclaire le pont entier ; les plus proches du joueur reçoivent en plus une vraie
 * lumière de la réserve, qui donne du relief aux meubles et aux personnages, et qui seule peut
 * vaciller. Une lampe entre dans la réserve et en sort en fondu : rien ne saute quand on marche.
 */

/**
 * Vacillement d'une lampe : néon fatigué, feu de cheminée ; lumière de soirée, qui bat au tempo de
 * la piste de danse (pulse), en changeant de couleur (disco) ; reflet de l'écran de cinéma, qui
 * suit les scènes du film (screen) ; lampe du stand de tir, qui suit la partie (range).
 */
export type Flicker = 'neon' | 'fire' | 'disco' | 'pulse' | 'screen' | 'range'

/** Lampe d'un pont, en coordonnées monde. */
export interface LightSource {
  position: THREE.Vector3
  color: THREE.Color
  intensity: number
  flicker?: Flicker
  /** Portée (7 par défaut). */
  distance?: number
  /**
   * Éclairage général (les dalles du plafond) : dans le champ de lumière seulement, jamais dans
   * la réserve.
   */
  ambient?: boolean
}

/** Éclairage d'ambiance d'un pont : ciel et sol (lumière hémisphérique), soleil. */
export interface Ambience {
  sky: string
  ground: string
  hemi: number
  sun: string
  sunIntensity: number
}

/** Portée d'une lampe qui n'en dit rien. */
export const LIGHT_DISTANCE = 7
/** Taille de la réserve : fixe, pour que changer de pont ne recompile aucun shader. */
const POOL = 8
/**
 * Part de l'ambiance (ciel, soleil) dans l'image : le reste vient des lampes du pont, par le champ
 * de lumière. Un pont sans lampes garde ainsi son ambiance seule, en plus sombre.
 */
const AMBIENT_SHARE = 0.5
/** Force du champ de lumière. */
const FIELD_GAIN = 0.22
/** Une lampe de la réserve est déjà dans le champ : sa vraie lumière n'apporte que le relief. */
const POOL_SHARE = 0.7
/** Durée du fondu d'une lampe qui entre dans la réserve ou en sort, en secondes. */
const FADE = 0.35

/** Anime la lumière d'une lampe qui vacille : règle `light.intensity` et `light.color`. */
export type FlickerDriver = (source: LightSource, light: THREE.PointLight, slot: number, t: number) => void

interface Slot {
  light: THREE.PointLight
  source: LightSource | null
  /** Fondu : 0 éteinte, 1 pleine. */
  gain: number
}

export class LightRig {
  readonly hemi = new THREE.HemisphereLight('#ffffff', '#000000', 0)
  readonly sun = new THREE.DirectionalLight('#ffffff', 0)
  private readonly slots: Slot[]
  private sources: LightSource[] = []
  private ambience: Ambience | null = null
  private byIntensity = false
  private general = true
  /** Position (au sol) d'où la réserve a été répartie la dernière fois. */
  private readonly from = new THREE.Vector3(Infinity, 0, 0)
  private readonly drivers = new Map<Flicker, FlickerDriver>()
  private wanted: LightSource[] = []
  /** Ambiance baissée dans une pièce tamisée (1 : pleine). */
  private dimming = 1
  /** Lampes baissées pendant la séance du planétarium (1 : pleines). */
  private lampDim = 1

  constructor(scene: THREE.Scene) {
    scene.add(this.hemi, this.sun, this.sun.target)
    this.slots = Array.from({ length: POOL }, () => {
      const light = new THREE.PointLight('#ffffff', 0, LIGHT_DISTANCE, 1.5)
      scene.add(light)
      return { light, source: null, gain: 0 }
    })
    this.drivers.set('neon', (s, l, i, t) => {
      // Brèves crises de grésillement.
      const crisis = Math.sin(t * 0.9 + i * 5) + Math.sin(t * 2.3 + i) * 0.6
      l.intensity = s.intensity * (crisis > 1.3 && Math.sin(t * 90) > 0.2 ? 0.25 : 1)
    })
    this.drivers.set('fire', (s, l, i, t) => {
      l.intensity = s.intensity * (0.8 + 0.12 * Math.sin(t * 7.3 + i) + 0.08 * Math.sin(t * 17.9 + i * 2))
    })
  }

  /** Confie un vacillement au jeu (la piste de danse, l'écran du cinéma, le stand de tir). */
  drive(kind: Flicker, driver: FlickerDriver) {
    this.drivers.set(kind, driver)
  }

  /**
   * Affiche l'éclairage d'un pont.
   * @param general le pont a son éclairage général au plafond (cf. fixtures.ts) : son ambiance
   *   baisse d'autant. Sinon (la baie infestée, la base au sol) il garde son ambiance entière, et
   *   le champ n'ajoute que la lueur de ses lampes.
   * @param byIntensity la réserve préfère les lampes fortes aux lampes proches (la baie infestée :
   *   une zone éclairée se voit de loin)
   */
  show(sources: LightSource[], field: LightField | null, ambience: Ambience, general: boolean, byIntensity = false) {
    this.sources = sources
    this.ambience = ambience
    this.general = general
    this.byIntensity = byIntensity
    this.hemi.color.set(ambience.sky)
    this.hemi.groundColor.set(ambience.ground)
    this.sun.color.set(ambience.sun)
    showLightField(field)
    // On arrive sur un pont : pas de fondu, ses lampes sont déjà allumées.
    for (const s of this.slots) {
      s.source = null
      s.gain = 0
    }
    this.from.x = Infinity
    this.applyAmbience()
  }

  /** Le champ du pont affiché a été recalculé (ses meubles ont changé). */
  setField(field: LightField | null) {
    showLightField(field)
  }

  /** Les lampes du pont affiché ont changé : la réserve se répartit de nouveau. */
  refresh() {
    this.from.x = Infinity
  }

  /** Baisse l'ambiance (pièce tamisée) ; 1 : pleine. */
  dim(k: number) {
    if (k === this.dimming) return
    this.dimming = k
    this.applyAmbience()
  }

  /** Baisse les lampes (séance du planétarium) ; 1 : pleines. */
  dimLamps(k: number) {
    if (k === this.lampDim) return
    this.lampDim = k
    this.applyAmbience()
  }

  private applyAmbience() {
    if (!this.ambience) return
    const share = this.general ? AMBIENT_SHARE : 1
    this.hemi.intensity = this.ambience.hemi * share * this.dimming
    this.sun.intensity = this.ambience.sunIntensity * share * this.dimming
    // Une pièce tamisée garde ses lampes : elles ressortent sur l'ambiance baissée.
    lightFieldGain.value = FIELD_GAIN * (this.general ? 1 : 0.5) * this.lampDim * (0.55 + 0.45 * this.dimming)
  }

  /**
   * À chaque image : la réserve suit `focus` (le joueur, ou ce que regardent les caméras), ses
   * lampes fondent et vacillent.
   * @param t horloge du jeu, en secondes
   */
  update(dt: number, t: number, focus: THREE.Vector3) {
    haloTime.value = t
    if (Math.hypot(focus.x - this.from.x, focus.z - this.from.z) > 1.5) this.assign(focus)
    this.fill(0)
    const step = dt / FADE
    for (const [i, slot] of this.slots.entries()) {
      const keep = slot.source !== null && this.wanted.includes(slot.source)
      slot.gain = keep ? Math.min(1, slot.gain + step) : Math.max(0, slot.gain - step)
      if (!keep && slot.gain === 0) slot.source = null
      const s = slot.source
      if (!s) {
        slot.light.intensity = 0
        continue
      }
      const l = slot.light
      l.position.copy(s.position)
      l.distance = s.distance ?? LIGHT_DISTANCE
      l.color.copy(s.color)
      l.intensity = s.intensity
      // Le mode léger fige les lampes : pas de vacillement.
      const driver = s.flicker && !renderQuality.light ? this.drivers.get(s.flicker) : undefined
      driver?.(s, l, i, t)
      l.intensity *= slot.gain * this.lampDim * (s.flicker || !this.general ? 1 : POOL_SHARE)
    }
  }

  /** Répartit la réserve : les lampes qui vacillent d'abord (le champ ne sait pas les animer), puis les plus proches. */
  private assign(focus: THREE.Vector3) {
    const first = this.from.x === Infinity
    this.from.copy(focus)
    const weight = (s: LightSource) => (s.position.distanceToSquared(focus) + 1) / ((this.byIntensity ? s.intensity : 1) * (s.flicker ? 2.5 : 1))
    this.wanted = this.sources.filter((s) => !s.ambient).sort((a, b) => weight(a) - weight(b)).slice(0, POOL)
    this.fill(first ? 1 : 0)
  }

  /** Donne une lumière libre de la réserve à chaque lampe voulue qui n'en a pas encore. */
  private fill(gain: number) {
    for (const s of this.wanted) {
      if (this.slots.some((slot) => slot.source === s)) continue
      const slot = this.slots.find((slot) => !slot.source)
      if (!slot) return
      slot.source = s
      slot.gain = gain
    }
  }
}
