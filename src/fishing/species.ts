import { tr } from '../i18n'
import { FISH, type FishRarity, type FishSpecies } from '../../shared/fishing.js'

/*
 * Les poissons de l'étang, côté joueur : leur nom et ce qu'en dit le livre des prises. Les espèces
 * elles-mêmes (modèle, couleurs, rareté, tailles) sont dans shared/fishing.js.
 */

export const RARITY_NAME: Record<FishRarity, string> = {
  common: tr('Commun', 'Common'),
  rare: tr('Rare', 'Rare'),
  epic: tr('Épique', 'Epic'),
  legendary: tr('Légendaire', 'Legendary'),
}

/** Couleur de chaque rareté (liseré des fiches, éclat de la prise). */
export const RARITY_COLOR: Record<FishRarity, string> = {
  common: '#b8c4cc',
  rare: '#4aa8ff',
  epic: '#c07bff',
  legendary: '#ffb83c',
}

const TEXT: Record<string, { name: string; about: string }> = {
  'lave-carp': {
    name: tr('Carpe de Lave', 'Lave carp'),
    about: tr('Élevée dans les bassins de Lave depuis l\'époque des premiers Cobra. Robuste, gourmande, et à peu près aussi difficile à attraper qu\'une mission de livraison.', 'Farmed in the ponds of Lave since the days of the first Cobras. Hardy, greedy, and about as hard to catch as a courier mission.'),
  },
  'hull-roach': {
    name: tr('Gardon de coque', 'Hull roach'),
    about: tr('Il vit dans l\'eau de condensation de la coque et finit toujours par trouver l\'étang. Capucine jure qu\'elle n\'en a jamais mis un seul.', 'It lives in the hull\'s condensation water and always ends up finding the pond. Capucine swears she never put a single one in.'),
  },
  'sol-bluefin': {
    name: tr('Azuré de Sol', 'Sol bluefin'),
    about: tr('Un petit poisson bleu venu de la vieille Terre, avec un permis en règle. C\'est le seul passager du bord à en avoir un.', 'A small blue fish from old Earth, with a valid permit. It is the only passenger aboard who has one.'),
  },
  'hydro-grazer': {
    name: tr('Brouteur hydroponique', 'Hydroponic grazer'),
    about: tr('Il nettoie les algues des bacs de la serre, gratuitement. Marcel le trouve « très correct en friture », ce qui lui vaut d\'être interdit d\'étang.', 'It cleans the algae off the greenhouse racks, free of charge. Marcel finds it “quite decent fried”, which got him banned from the pond.'),
  },
  'jameson-clown': {
    name: tr('Poisson-clown de Jameson', 'Jameson clownfish'),
    about: tr('Orange et blanc, comme une combinaison de vol Remlok. Il tourne en rond en attendant l\'autorisation d\'apponter.', 'Orange and white, like a Remlok flight suit. It swims in circles while waiting for docking clearance.'),
  },
  'runaway-koi': {
    name: tr('Koï fugueuse', 'Runaway koi'),
    about: tr('Une cousine de Faulcon, DeLacy et Gutamaya, blanche à nageoires orange. Elle se cache des comptages de Capucine depuis trois ans.', 'A cousin of Faulcon, DeLacy and Gutamaya, white with orange fins. She has been dodging Capucine\'s headcounts for three years.'),
  },
  'federal-fighter': {
    name: tr('Combattant fédéral', 'Federal fighter'),
    about: tr('Rouge, blanc, bleu, et persuadé que tout l\'étang lui appartient. Il fonce sur l\'appât sans réfléchir, puis réclame des renforts.', 'Red, white, blue, and convinced the whole pond is his. He charges the bait without thinking, then calls for reinforcements.'),
  },
  'achenar-angel': {
    name: tr('Poisson-ange d\'Achenar', 'Achenar angelfish'),
    about: tr('Bleu impérial rayé d\'or. Il ne mord qu\'aux appâts servis avec élégance, et attend d\'être sorti de l\'eau avec les honneurs.', 'Imperial blue with gold stripes. It only takes bait served with elegance, and expects to be landed with full honours.'),
  },
  'dwarf-manta': {
    name: tr('Raie manta naine', 'Dwarf manta ray'),
    about: tr('Une raie de la taille d\'un plateau du mess. Elle plane au fond de l\'étang comme un Type-9 en approche : lentement, et en prenant toute la place.', 'A ray the size of a mess tray. It glides along the bottom of the pond like a Type-9 on approach: slowly, and taking up all the room.'),
  },
  'diso-dolphin': {
    name: tr('Dauphin nain de Diso', 'Diso dwarf dolphin'),
    about: tr('Pas un poisson, il vous le ferait remarquer s\'il parlait. Joueur, il feinte plusieurs fois avant de mordre, et siffle l\'air d\'accostage de la station.', 'Not a fish, as it would point out if it could talk. Playful, it feints several times before biting, and whistles the station\'s docking tune.'),
  },
  'archon-shark': {
    name: tr('Requin d\'Archon', 'Archon shark'),
    about: tr('Petit requin gris des eaux sans loi. Il ne paie jamais sa place dans l\'étang, et personne ne s\'est proposé pour la lui réclamer.', 'A small grey shark from lawless waters. It never pays for its spot in the pond, and nobody has volunteered to ask for it.'),
  },
  'caustic-fish': {
    name: tr('Poisson caustique', 'Caustic fish'),
    about: tr('Ses rayures luisent d\'un vert qu\'on connaît bien du côté des Pléiades. À ne pas poser sur une coque. Ni sur un seau. Ni sur les genoux.', 'Its stripes glow a green that is well known around the Pleiades. Do not put it on a hull. Or in a bucket. Or on your lap.'),
  },
  'nebula-ray': {
    name: tr('Raie des nébuleuses', 'Nebula ray'),
    about: tr('Violette dessus, rose dessous, comme un ciel de nébuleuse. On dit qu\'elle ne remonte que pour ceux qui ont déjà vu Colonia.', 'Purple on top, pink underneath, like a nebula sky. They say it only surfaces for those who have already seen Colonia.'),
  },
  'pocket-whale': {
    name: tr('Baleine de poche', 'Pocket whale'),
    about: tr('Une baleine entière, dans un étang de serre. Personne ne sait comment elle est montée à bord, ni ce qu\'elle mange. Elle chante la nuit, et Capucine nie tout.', 'A whole whale, in a greenhouse pond. Nobody knows how it got aboard, or what it eats. It sings at night, and Capucine denies everything.'),
  },
  'raxxla-shark': {
    name: tr('Requin doré de Raxxla', 'Golden shark of Raxxla'),
    about: tr('Un requin d\'or pur qui ne devrait pas exister, dans un étang qui ne mène nulle part. Ceux qui l\'ont sorti de l\'eau disent avoir vu une porte au fond. Ils n\'ont pas de capture d\'écran.', 'A shark of pure gold that should not exist, in a pond that leads nowhere. Those who landed it say they saw a gate at the bottom. They have no screenshot.'),
  },
  'guardian-fish': {
    name: tr('Poisson des Gardiens', 'Guardian fish'),
    about: tr('Noir, aux nageoires de lumière bleue. Il dormait sous l\'étang depuis des millions d\'années et s\'allume quand on l\'approche. Il a l\'air de vous scanner en retour.', 'Black, with fins of blue light. It slept beneath the pond for millions of years and lights up when approached. It seems to be scanning you back.'),
  },
}

export const fishName = (fish: FishSpecies): string => TEXT[fish.id]?.name ?? fish.id
export const fishAbout = (fish: FishSpecies): string => TEXT[fish.id]?.about ?? ''

/** Espèces sans texte (oubli) : vide si tout va bien (cf. le test des espèces). */
export const untitled = () => FISH.filter((f) => !TEXT[f.id]).map((f) => f.id)
