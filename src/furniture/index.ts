import { ADVENTURES } from './adventures'
import { ARCADE } from './arcade'
import { ARMORY } from './armory'
import { BAR } from './bar'
import { BATH } from './bath'
import { BOARD } from './board'
import { CINEMA } from './cinema'
import { CLUB } from './club'
import { COCKPIT } from './cockpit'
import { COZY } from './cozy'
import { DECOR } from './decor'
import { ELITE } from './elite'
import { GARDEN } from './garden'
import { HANGAR } from './hangar'
import { compact, rng, type Builder, type Furniture, type Room } from './kit'
import { KENNEY } from './kenney'
import { KITCHEN } from './kitchen'
import { LEISURE } from './leisure'
import { LIGHTS } from './lights'
import { LISTENING } from './listening'
import { LJPC } from './ljpc'
import { MEDICAL } from './medical'
import { NATURE } from './nature'
import { PARTY } from './party'
import { PETS } from './pets'
import { PLANETARIUM } from './planetarium'
import { POSTER_ART } from './posters'
import { RETRO } from './retro'
import { VENTS } from './vents'
import { VOIE } from './voie'
import { WORKSHOP } from './workshop'
import { WORKS } from './works'
import { SALVAGE } from './salvage'
import { SITE } from './site'
import { STUDIO } from './studio'

/*
 * Mobilier fait main, en primitives Three.js, rangé par zone :
 * - elite.ts : poste de pilotage, cartes holographiques, FSD, SRV, drones, maquette du Cobra… (clins d'œil à Elite Dangerous) ;
 * - cockpit.ts : le poste de pilotage agrandi (tableau de bord, consoles, sièges d'équipage, fauteuil du commandant) ;
 * - workshop.ts : la cale (minage, bricolage, réparation) ;
 * - bar.ts : Chez Jacques, le bar clandestin de la cale (comptoir, bouteilles, Jacques le robot barman) ;
 * - club.ts : le Zorb, la boîte de nuit des aliens de la cale (enseigne, cordon, videur, danseurs) ;
 * - leisure.ts : infirmerie (lits, scanner, pharmacie), salle de sport, enseigne du salon d'arcade ;
 * - medical.ts : l'infirmerie agrandie de Betty (rideaux de box, perfusions, poste de soins, négatoscope…) ;
 * - kitchen.ts : le mess, un self (tables de cantine, comptoir, cuisine de Marcel, décor des tâches de cuisine) ;
 * - arcade.ts : bornes d'arcade, borne cocktail, flippers, borne de course, pince à peluches ;
 * - cozy.ts : les quartiers (chambres, douches, serre, salon) ;
 * - nature.ts : les plantes du Nature Kit de Kenney pour la serre (buissons, fougères, palmiers en pot, bambous, cactus, paniers suspendus) ;
 * - garden.ts : la serre agrandie (bacs potagers, arbre fruitier, bassin, compost, grainothèque, arche fleurie, pelouse) ;
 * - decor.ts : la décoration des cabines (affiches, cadres, plantes, petits objets…) ;
 * - lights.ts : les luminaires des cabines (guirlande, bandeau LED, néons, lampadaire arc, suspensions…) ;
 * - party.ts : la soirée dans les quartiers (piste de danse, boule à facettes, platines…) ;
 * - adventures.ts : les souvenirs des aventures du site (Jacob Scarlett, La Buse, l'Odysseus…) ;
 * - pets.ts : les paniers des compagnons et les objets pour animaux (gamelles, arbre à chat…) ;
 * - works.ts : les pièces en travaux (échafaudage, panneau « Bientôt », cônes, bâches) ;
 * - cinema.ts : le cinéma du pont supérieur (écran à rideaux, fauteuils, projecteur, pop-corn) ;
 * - planetarium.ts : le planétarium de Bugenhagen, au pont supérieur (carte du ciel, projecteur, hologramme du système, lunette, bibliothèque, Bugenhagen) ;
 * - listening.ts : le salon d'écoute (casques, affiches de Radio Dangereuse et des Galères Galactiques, poste d'écoute) ;
 * - studio.ts : le studio de Radio Dangereuse (table à trois micros, fauteuils, mousse acoustique, néon « ON AIR ») ;
 * - ljpc.ts : le labo du L.J.P.C. (tableau d'enquête, paillasse, échantillon, hologramme, James et Julia) ;
 * - vents.ts : les conduits de ventilation (toiles d'araignée, ventilateur, mots grattés, la grille du bar) ;
 * - voie.ts : le sanctuaire de la Voie (portail de Raxxla, Chroniques, icône de Salomé, Reliques, l'Adepte Supérieur) ;
 * - hangar.ts : le hangar de la cale (le Krait Mk II, son escabeau, le pad, l'atelier de Nico le mécano, le pupitre du hangar) ;
 * - salvage.ts : la zone thargoïde (lobby du sas de la cale, casiers, colis, fusées, plateforme d'extraction) ;
 * - kenney.ts : le Furniture Kit de Kenney (salle de bain, cuisine, salon, chambre), pour les cabines ;
 * - retro.ts : écrans et consoles des cabines (télé cathodique, consoles, micro 8 bits, PC, cassettes) ;
 * - armory.ts : l'armurerie décorative des cabines (sabres laser, épées, katanas, armes d'Odyssey, armure) ;
 * - posters.ts : les affiches des cabines (grands films, pin-up rétro) ;
 * - bath.ts : les petits objets de salle de bain des cabines (canard, gobelet, dérouleur, tapis).
 * On les place dans levels.ts comme les modèles du kit : `{ model: 'fireplace', x, z, rot }`,
 * ou dans une cabine depuis le catalogue du mode aménagement (src/cabin/catalog.ts).
 */

const BUILDERS = { ...ELITE, ...COCKPIT, ...WORKSHOP, ...BAR, ...CLUB, ...LEISURE, ...MEDICAL, ...KITCHEN, ...ARCADE, ...BOARD, ...COZY, ...GARDEN, ...NATURE, ...DECOR, ...LIGHTS, ...PARTY, ...SITE, ...ADVENTURES, ...PETS, ...WORKS, ...CINEMA, ...LISTENING, ...STUDIO, ...LJPC, ...PLANETARIUM, ...VENTS, ...VOIE, ...SALVAGE, ...HANGAR, ...KENNEY, ...RETRO, ...ARMORY, ...POSTER_ART, ...BATH } satisfies Record<string, Builder>

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
export { film, filmGlow } from './cinema'
export { studio } from './studio'
export { cargoCanister, flareStick, lockerParts } from './salvage'
export {
  beamMaterial, disposeFurniture, ED_ORANGE, holoTime, keepShared, tickFurniture, type BagControl, type ClawControl, type ClawResult, type Emitter,
  type FurnitureControl,
} from './kit'
