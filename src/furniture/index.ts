import { ADVENTURES } from './adventures'
import { ARCADE } from './arcade'
import { BAR } from './bar'
import { BOARD } from './board'
import { COZY } from './cozy'
import { DECOR } from './decor'
import { ELITE } from './elite'
import { compact, rng, type Builder, type Furniture, type Room } from './kit'
import { LEISURE } from './leisure'
import { LIGHTS } from './lights'
import { PARTY } from './party'
import { PETS } from './pets'
import { WORKSHOP } from './workshop'
import { WORKS } from './works'
import { SITE } from './site'

/*
 * Mobilier fait main, en primitives Three.js, rangé par zone :
 * - elite.ts : poste de pilotage, cartes holographiques, FSD, SRV, drones… (clins d'œil à Elite Dangerous) ;
 * - workshop.ts : la cale (minage, bricolage, réparation) ;
 * - bar.ts : Chez Jacques, le bar clandestin de la cale (comptoir, bouteilles, Jacques le robot barman) ;
 * - leisure.ts : infirmerie, salle de sport, enseigne du salon d'arcade ;
 * - arcade.ts : bornes d'arcade, borne cocktail, flippers, borne de course, pince à peluches ;
 * - cozy.ts : les quartiers (chambres, douches, serre, salon) ;
 * - decor.ts : la décoration des cabines (affiches, cadres, plantes, petits objets…) ;
 * - lights.ts : les luminaires des cabines (guirlande, bandeau LED, néons, lampadaire arc, suspensions…) ;
 * - party.ts : la soirée dans les quartiers (piste de danse, boule à facettes, platines…) ;
 * - adventures.ts : les souvenirs des aventures du site (Jacob Scarlett, La Buse, l'Odysseus…) ;
 * - pets.ts : les paniers des compagnons et les objets pour animaux (gamelles, arbre à chat…) ;
 * - works.ts : les pièces en travaux (échafaudage, panneau « Bientôt », cônes, bâches).
 * On les place dans levels.ts comme les modèles du kit : `{ model: 'fireplace', x, z, rot }`,
 * ou dans une cabine depuis le catalogue du mode aménagement (src/cabin/catalog.ts).
 */

const BUILDERS = { ...ELITE, ...WORKSHOP, ...BAR, ...LEISURE, ...ARCADE, ...BOARD, ...COZY, ...DECOR, ...LIGHTS, ...PARTY, ...SITE, ...ADVENTURES, ...PETS, ...WORKS } satisfies Record<string, Builder>

export type CustomModel = keyof typeof BUILDERS

export const CUSTOM_MODELS = Object.keys(BUILDERS) as CustomModel[]

export function isCustomModel(name: string): name is CustomModel {
  return name in BUILDERS
}

/**
 * @param label texte libre du meuble (cf. chaque constructeur)
 * @param seed graine de l'aléatoire : même graine, même meuble (on la tire de sa position)
 * @param room pièce où il est posé, si on la connaît (cf. BuildOptions)
 */
export function buildFurniture(model: CustomModel, label: string | undefined, seed: number, room?: Room): Furniture {
  const f = BUILDERS[model]({ label, random: rng(seed), room })
  if (f.solid) f.solid = compact(f.solid)
  return f
}

export { holoMeGlow } from './elite'
export { beatAt, beatPulse } from './party'
export {
  beamMaterial, disposeFurniture, ED_ORANGE, holoTime, keepShared, tickFurniture, type BagControl, type ClawControl, type ClawResult, type Emitter,
  type FurnitureControl,
} from './kit'
