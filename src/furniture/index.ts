import { ADVENTURES } from './adventures'
import { ARCADE } from './arcade'
import { ARCADE_DECOR } from './arcade-decor'
import { PIXELWAR } from './pixelwar'
import { CARDS } from './cards'
import { MEDBAY } from './medbay'
import { HOLD_DECOR } from './hold-decor'
import { CLOSET } from './closet'
import { ARMORY } from './armory'
import { BAR } from './bar'
import { BATH } from './bath'
import { BOARD } from './board'
import { CINEMA } from './cinema'
import { CLASSROOM } from './classroom'
import { CLUB } from './club'
import { COCKPIT } from './cockpit'
import { PROMENADE } from './promenade'
import { CORRIDOR } from './corridor'
import { CONCOURSE } from './concourse'
import { COZY } from './cozy'
import { DECOR } from './decor'
import { ELITE } from './elite'
import { GARDEN } from './garden'
import { GARDENING } from './gardening'
import { GYM } from './gym'
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
import { OUTDOOR } from './outdoor'
import { PARTY } from './party'
import { PETS } from './pets'
import { PLANETARIUM } from './planetarium'
import { POSTER_ART } from './posters'
import { RETRO } from './retro'
import { VENTS } from './vents'
import { VOIE } from './voie'
import { WORKSHOP } from './workshop'
import { WORKS } from './works'
import { FISHING } from './fishing'
import { SALVAGE } from './salvage'
import { SCAVENGERS } from './scavengers'
import { IDOT } from './idot'
import { SITE } from './site'
import { RANGE } from './range'
import { SPORT } from './sport'
import { STUDIO } from './studio'
import { TUTORIAL } from './tutorial'
import { QUESTS_FURNITURE } from './quests'
import { QUEST_REWARDS } from './quests-more'
import { SECURITY } from './security'
import { WAYFINDING } from './wayfinding'

/*
 * Mobilier fait main, en primitives Three.js, rangé par zone :
 * - elite.ts : poste de pilotage, cartes holographiques, FSD, SRV, drones, maquette du Cobra… (clins d'œil à Elite Dangerous) ;
 * - cockpit.ts : le poste de pilotage agrandi (tableau de bord, consoles, sièges d'équipage, fauteuil du commandant) ;
 * - promenade.ts : la Promenade (le monument au Cobra Mk III, sa place et ses pupitres gravés, colonnes lumineuses, jardinières) ;
 * - corridor.ts : la coursive du pont principal (chemin de roulement et feux de guidage, noms des pièces au sol, enseignes, pilastres lumineux) ;
 * - concourse.ts : le hall de la salle commune, façon station Coriolis (l'îlot du hall et son monument, cf. monument.ts) ;
 * - workshop.ts : la cale (minage, bricolage, réparation) ;
 * - hold-decor.ts : l'habillage de la cale (cage et anneaux du réacteur, conduits d'énergie, palan, étagère de pièces, marquages, rigole de coulée, lingots, grappin, gyrophare) ;
 * - closet.ts : le placard à balais de la cale (râtelier, seau à roulettes, étagère de produits, robot laveur, panneau « sol glissant ») ;
 * - bar.ts : Chez Jacques, le bar clandestin de la cale (comptoir, bouteilles, Jacques le robot barman) ;
 * - club.ts : le Zorb, la boîte de nuit des aliens de la cale (enseigne, cordon, videur, danseurs) ;
 * - leisure.ts : infirmerie (lits, scanner, pharmacie), appareils de la salle de sport, enseigne du salon d'arcade ;
 * - gym.ts : la salle de sport du pont principal (sols et tapis par zone, enseignes et records, miroir, boxe, disques, kettlebells, coin nettoyage) ;
 * - medical.ts : l'infirmerie agrandie de Betty (rideaux de box, perfusions, poste de soins, négatoscope…) ;
 * - medbay.ts : l'habillage de l'infirmerie (sol à lignes de couleur, potences des lits et leurs constantes en hologramme, croix de pharmacie, scialytique, filets lumineux) ;
 * - kitchen.ts : le mess, un self (tables de cantine, comptoir, cuisine de Marcel, décor des tâches de cuisine) ;
 * - arcade.ts : bornes d'arcade, borne cocktail, flippers, borne de course, pince à peluches ;
 * - arcade-decor.ts : le décor du salon d'arcade (moquette fluo, tubes de néon, fresques, comptoir à lots, monnayeur, boules de gomme) ;
 * - pixelwar.ts : la salle de la Pixel War (toile du site en direct, postes de jeu, nuancier, sol quadrillé, traînée de pixels) ;
 * - cards.ts : le Comptoir des Cartes Dangereuses du pont supérieur (mur de boosters du site, comptoir de Ludo, autel d'ouverture, tables de Galactic Clash, pupitres de collection, vitrines) ;
 * - cozy.ts : les quartiers (chambres, douches, serre, salon) ;
 * - nature.ts : les plantes du Nature Kit de Kenney pour la serre (buissons, fougères, palmiers en pot, bambous, cactus, paniers suspendus) ;
 * - outdoor.ts : l'extérieur des quartiers (arbres, haies, clôtures, bancs, fontaine, réverbères des kits de Kenney ; massifs, topiaires, saule, balançoire, pergola, puits faits main) ;
 * - garden.ts : la serre agrandie (bacs potagers, arbre fruitier, bassin, compost, grainothèque, arche fleurie, pelouse) ;
 * - gardening.ts : le jardinage dans les quartiers (tuile de terre cultivable, cabanon, brouette, épouvantail, nain, clôture, ruche) ;
 * - decor.ts : la décoration des cabines (affiches, cadres, plantes, petits objets…) ;
 * - lights.ts : les luminaires des cabines (guirlande, bandeau LED, néons, lampadaire arc, suspensions…) ;
 * - party.ts : la soirée dans les quartiers (piste de danse, boule à facettes, platines…) ;
 * - adventures.ts : les souvenirs des aventures du site (Jacob Scarlett, La Buse, l'Odysseus…) ;
 * - pets.ts : les paniers des compagnons et les objets pour animaux (gamelles, arbre à chat…) ;
 * - works.ts : les pièces en travaux (échafaudage, panneau « Bientôt », cônes, bâches) ;
 * - cinema.ts : le cinéma du pont supérieur (écran à rideaux, fauteuils, projecteur, pop-corn) ;
 * - classroom.ts : la salle de classe du pont supérieur (tableau vert, pupitre, tables d'élève, globe de la galaxie, emplacements de la professeure et des élèves) ;
 * - planetarium.ts : le planétarium de Bugenhagen, au pont supérieur (carte du ciel, projecteur, hologramme du système, lunette, bibliothèque, Bugenhagen) ;
 * - listening.ts : le salon d'écoute (casques, affiches de Radio Dangereuse et des Galères Galactiques, poste d'écoute) ;
 * - studio.ts : le studio de Radio Dangereuse (table à trois micros, fauteuils, mousse acoustique, néon « ON AIR ») ;
 * - ljpc.ts : le labo du L.J.P.C. (tableau d'enquête, paillasse, échantillon, hologramme, James et Julia) ;
 * - vents.ts : les conduits de ventilation (toiles d'araignée, ventilateur, mots grattés, la grille du bar) ;
 * - voie.ts : le sanctuaire de la Voie (portail de Raxxla, Chroniques, icône de Salomé, Reliques, l'Adepte Supérieur) ;
 * - hangar.ts : le hangar de la cale (le Krait Mk II, son escabeau, le pad, l'atelier de Nico le mécano, le pupitre du hangar) ;
 * - salvage.ts : la zone thargoïde (lobby du sas de la cale, casiers, colis, fusées, plateforme d'extraction) ;
 * - scavengers.ts : la gaine technique (tuyauterie, chaudière, ventilateur) et la planque des Scavengers (poste du jeu, ARIA, caisson de Kael, drones, butin) ;
 * - idot.ts : le poste d'exploration d'It's Dangerous Out There (baie d'observation, poste du jeu, maquettes en pixels du Mandalay et du commandant, table de navigation, soute) ;
 * - kenney.ts : le Furniture Kit de Kenney (salle de bain, cuisine, salon, chambre), pour les cabines ;
 * - retro.ts : écrans et consoles des cabines (télé cathodique, consoles, micro 8 bits, PC, cassettes) ;
 * - armory.ts : l'armurerie décorative des cabines (sabres laser, épées, katanas, armes d'Odyssey, armure) ;
 * - quests.ts : les objets des quêtes du bord (la gamelle de Jameson, les haltères empruntées, T-0 le mannequin d'essai…) ;
 * - posters.ts : les affiches des cabines (grands films, pin-up rétro) ;
 * - bath.ts : les petits objets de salle de bain des cabines (canard, gobelet, dérouleur, tapis) ;
 * - sport.ts : la zone sportive du pont supérieur (panier sur glissière, cage et gardien en carton, marquages, ballons) ;
 * - range.ts : le stand de tir de la cale (pas de tir, couloir et pare-balles, tapis des tireurs, armes au mur, caisses de munitions) ;
 * - tutorial.ts : le simulateur d'accueil des nouveaux venus (grille holographique, panneaux de consignes, téléporteur) ;
 * - wayfinding.ts : la signalétique du bord (le plan du vaisseau sur son écran holographique, cf. src/ship-plan/).
 * On les place dans levels.ts comme les modèles du kit : `{ model: 'fireplace', x, z, rot }`,
 * ou dans une cabine depuis le catalogue du mode aménagement (src/cabin/catalog.ts).
 */

const BUILDERS = { ...ELITE, ...COCKPIT, ...PROMENADE, ...CORRIDOR, ...CONCOURSE, ...WORKSHOP, ...BAR, ...CLUB, ...LEISURE, ...GYM, ...MEDICAL, ...KITCHEN, ...ARCADE, ...ARCADE_DECOR, ...PIXELWAR, ...CARDS, ...MEDBAY, ...HOLD_DECOR, ...CLOSET, ...BOARD, ...COZY, ...GARDEN, ...GARDENING, ...NATURE, ...OUTDOOR, ...DECOR, ...LIGHTS, ...PARTY, ...SITE, ...ADVENTURES, ...PETS, ...WORKS, ...CINEMA, ...CLASSROOM, ...LISTENING, ...STUDIO, ...LJPC, ...PLANETARIUM, ...VENTS, ...VOIE, ...SALVAGE, ...SCAVENGERS, ...IDOT, ...HANGAR, ...KENNEY, ...RETRO, ...ARMORY, ...POSTER_ART, ...BATH, ...SPORT, ...RANGE, ...FISHING, ...TUTORIAL, ...QUESTS_FURNITURE, ...QUEST_REWARDS, ...SECURITY, ...WAYFINDING } satisfies Record<string, Builder>

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
  if (f.solid) f.solid = compact(f.solid, true)
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
