import { COZY } from './cozy'
import { DECOR } from './decor'
import { ELITE } from './elite'
import { compact, rng, type Builder, type Furniture } from './kit'
import { LEISURE } from './leisure'
import { WORKSHOP } from './workshop'

/*
 * Mobilier fait main, en primitives Three.js, rangé par zone :
 * - elite.ts : poste de pilotage, cartes holographiques, FSD, SRV, drones… (clins d'œil à Elite Dangerous) ;
 * - workshop.ts : la cale (minage, bricolage, réparation) ;
 * - leisure.ts : infirmerie, salle de sport, salon d'arcade ;
 * - cozy.ts : les quartiers (chambres, douches, serre, salon) ;
 * - decor.ts : la décoration des cabines (affiches, cadres, plantes, petits objets…).
 * On les place dans levels.ts comme les modèles du kit : `{ model: 'fireplace', x, z, rot }`,
 * ou dans une cabine depuis le catalogue du mode aménagement (src/cabin/catalog.ts).
 */

const BUILDERS = { ...ELITE, ...WORKSHOP, ...LEISURE, ...COZY, ...DECOR } satisfies Record<string, Builder>

export type CustomModel = keyof typeof BUILDERS

export const CUSTOM_MODELS = Object.keys(BUILDERS) as CustomModel[]

export function isCustomModel(name: string): name is CustomModel {
  return name in BUILDERS
}

/**
 * @param label texte libre du meuble (cf. chaque constructeur)
 * @param seed graine de l'aléatoire : même graine, même meuble (on la tire de sa position)
 */
export function buildFurniture(model: CustomModel, label: string | undefined, seed: number): Furniture {
  const f = BUILDERS[model]({ label, random: rng(seed) })
  if (f.solid) f.solid = compact(f.solid)
  return f
}

export { holoMeGlow } from './elite'
export { beamMaterial, disposeFurniture, ED_ORANGE, keepShared, tickFurniture, type Emitter } from './kit'
