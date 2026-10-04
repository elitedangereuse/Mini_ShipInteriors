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
  'pilot-goldfish': {
    name: tr('Poisson rouge du pilote', 'Pilot\'s goldfish'),
    about: tr('Chaque pilote en a eu un dans un bocal, sanglé au tableau de bord. Ceux de l\'étang sont les rescapés des vols en assistance désactivée.', 'Every pilot once kept one in a bowl, strapped to the dashboard. The ones in the pond are the survivors of flight-assist-off sessions.'),
  },
  'cargo-tetra': {
    name: tr('Tétra de soute', 'Cargo tetra'),
    about: tr('Minuscule, et toujours en banc de cent unités. Il n\'apparaît sur aucun manifeste, ce qui en fait techniquement une marchandise illégale.', 'Tiny, and always in shoals of a hundred units. It appears on no manifest, which technically makes it illegal cargo.'),
  },
  'coolant-catfish': {
    name: tr('Silure des circuits', 'Coolant catfish'),
    about: tr('Noir comme une conduite de refroidissement, dont il sort d\'ailleurs. Il fouille la vase du fond et remonte de temps en temps un boulon qui manquait à quelqu\'un.', 'Black as a coolant pipe, which is where it came from. It rummages through the mud and occasionally brings up a bolt somebody was missing.'),
  },
  'sidewinder-tang': {
    name: tr('Chirurgien Sidewinder', 'Sidewinder tang'),
    about: tr('Petit, bleu, fourni gratuitement avec l\'étang. Tout le monde a commencé par en prendre un, et tout le monde jure qu\'il en a gardé un bon souvenir.', 'Small, blue, supplied free of charge with the pond. Everyone started by catching one, and everyone swears they remember it fondly.'),
  },
  'eravate-butterfly': {
    name: tr('Poisson-papillon d\'Eravate', 'Eravate butterflyfish'),
    about: tr('Il papillonne près de la surface en attendant qu\'un débutant passe. Inoffensif, curieux, et incapable de retrouver la sortie de l\'étang.', 'It flutters near the surface, waiting for a beginner to come by. Harmless, curious, and unable to find its way out of the pond.'),
  },
  'hauler-cowfish': {
    name: tr('Poisson-coffre Hauler', 'Hauler cowfish'),
    about: tr('Une caisse avec des nageoires. Lent, carré, increvable : il transporte on ne sait quoi d\'un bout à l\'autre de l\'étang, et il a l\'air d\'y trouver son compte.', 'A crate with fins. Slow, square, unkillable: it hauls who knows what from one end of the pond to the other, and seems to turn a profit.'),
  },
  'paintjob-gramma': {
    name: tr('Gramma peinture de coque', 'Paintjob gramma'),
    about: tr('Violet devant, jaune derrière : on dirait une livrée achetée en promotion. Il ne nage pas plus vite pour autant, mais il le fait avec style.', 'Purple at the front, yellow at the back: it looks like a paintjob bought on sale. It swims no faster for it, but it does so in style.'),
  },
  'limpet-parrot': {
    name: tr('Poisson-perroquet à drones', 'Limpet parrotfish'),
    about: tr('Il grignote tout ce qui dépasse, et recrache du sable. Capucine le soupçonne d\'avoir mangé trois drones de collecte ; il en a gardé le bourdonnement.', 'It nibbles anything that sticks out and spits sand. Capucine suspects it of eating three collector limpets; it kept the buzzing.'),
  },
  'onionhead-horn': {
    name: tr('Flowerhorn Tête d\'Oignon', 'Onionhead flowerhorn'),
    about: tr('Sa bosse sur le front lui donne l\'air de réfléchir très fort. Il a surtout brouté une plante de Kappa Fornacis tombée de la serre, et depuis il plane.', 'The bump on its forehead makes it look deep in thought. Mostly it grazed on a Kappa Fornacis plant that fell from the greenhouse, and has been drifting ever since.'),
  },
  'imperial-betta': {
    name: tr('Combattant impérial', 'Imperial betta'),
    about: tr('Robe bleu nuit, voiles écarlates, port altier. Il refuse de partager son coin d\'étang avec le Combattant fédéral, et l\'affaire dure depuis plus longtemps que la serre.', 'Midnight-blue coat, scarlet veils, haughty bearing. It refuses to share its corner of the pond with the Federal fighter, and the feud is older than the greenhouse.'),
  },
  'kumo-koi': {
    name: tr('Koï des Kumo', 'Kumo koi'),
    about: tr('Rouge, blanche et noire, aux couleurs d\'un certain équipage. Elle prélève sa part sur tous les appâts de l\'étang et appelle ça une protection.', 'Red, white and black, in the colours of a certain crew. She takes her cut of every bait in the pond and calls it protection.'),
  },
  'pirate-piranha': {
    name: tr('Piranha pirate', 'Pirate piranha'),
    about: tr('Il vous scanne l\'hameçon, constate que vous transportez un ver, et vous somme de le larguer. Sa prime ne dépasse jamais 400 crédits.', 'It scans your hook, notes that you are carrying a worm, and orders you to drop it. Its bounty never exceeds 400 credits.'),
  },
  'heatsink-puffer': {
    name: tr('Poisson-globe dissipateur', 'Heat sink pufferfish'),
    about: tr('Quand la température monte, il gonfle d\'un coup et part à la dérive en fumant. Ne pas le sortir de l\'eau trop vite : il lui reste rarement plus de deux charges.', 'When the temperature climbs, it puffs up at once and drifts away smoking. Do not land it too fast: it rarely has more than two charges left.'),
  },
  'cubeo-idol': {
    name: tr('Idole de Cubeo', 'Cubeo idol'),
    about: tr('Jaune et noir, un long fanion sur le dos. Il défile plus qu\'il ne nage, et un petit banc de fidèles le suit partout en promettant des jours meilleurs.', 'Yellow and black, with a long pennant on its back. It parades more than it swims, and a small shoal of followers trails behind, promising better days.'),
  },
  'colonia-mandarin': {
    name: tr('Poisson-mandarin de Colonia', 'Colonia mandarinfish'),
    about: tr('Un tout petit poisson bariolé qui a fait 22 000 années-lumière dans un bocal pour finir ici. Il raconte le voyage à qui veut l\'entendre. Personne ne veut.', 'A tiny gaudy fish that travelled 22,000 light years in a bowl to end up here. It tells the story to anyone who will listen. Nobody will.'),
  },
  'anaconda-wrasse': {
    name: tr('Napoléon Anaconda', 'Anaconda wrasse'),
    about: tr('Gros, vert, un front comme une proue. Il met trois minutes à faire demi-tour, et ne rentre dans aucun des abris de l\'étang prévus pour sa taille.', 'Big, green, with a forehead like a prow. It takes three minutes to turn around, and fits in none of the pond shelters rated for its size.'),
  },
  'type9-tuna': {
    name: tr('Thon Type-9', 'Type-9 tuna'),
    about: tr('Le gros porteur de l\'étang. Il fend l\'eau en ligne droite, parce que tourner n\'était pas prévu dans le cahier des charges. Marcel le regarde avec beaucoup trop d\'intérêt.', 'The pond\'s heavy hauler. It ploughs through the water in a straight line, because turning was never in the specification. Marcel eyes it with far too much interest.'),
  },
  'interdictor-sole': {
    name: tr('Limande d\'interdiction', 'Interdictor sole'),
    about: tr('Rayée de rouge, plate, pleine de dents. Elle attend sur le fond qu\'un poisson passe en supercroisière, puis l\'en sort brutalement. On peut céder, c\'est moins fatigant.', 'Red-striped, flat, full of teeth. It waits on the bottom for a fish to cruise past, then yanks it out. You may submit; it is less tiring.'),
  },
  'fdl-lionfish': {
    name: tr('Poisson-lion Fer-de-Lance', 'Fer-de-Lance lionfish'),
    about: tr('Élégant, hérissé de pointes, et hors de prix à entretenir. Il ne va jamais très loin, mais ce qu\'il croise en chemin s\'en souvient.', 'Elegant, bristling with hardpoints, and ruinous to maintain. It never travels far, but whatever it meets on the way remembers.'),
  },
  'stealth-lionfish': {
    name: tr('Poisson-lion furtif', 'Silent-running lionfish'),
    about: tr('Noir, froid, toutes épines dehors. Il nage en mode silencieux : aucun capteur du bord ne l\'a jamais accroché, et il faut le sortir de l\'eau pour être sûr qu\'il existe.', 'Black, cold, all spines out. It swims in silent running: no sensor aboard ever locked onto it, and you have to land it to be sure it exists.'),
  },
  'railgun-swordfish': {
    name: tr('Espadon canon électrique', 'Rail gun swordfish'),
    about: tr('Il charge une seconde, puis traverse l\'étang d\'un trait. Sa précision est remarquable ; la margelle porte la marque des fois où elle ne l\'a pas été.', 'It charges for a second, then crosses the pond in a flash. Its accuracy is remarkable; the rim bears the marks of the times it was not.'),
  },
  'witch-goblin': {
    name: tr('Requin-lutin de l\'hyperespace', 'Witch-space goblin shark'),
    about: tr('Personne ne l\'a mis dans l\'étang. Il y est apparu après un saut un peu long, le nez en avant, l\'air aussi surpris que nous. Il disparaît parfois au suivant.', 'Nobody put it in the pond. It turned up after a rather long jump, nose first, looking as surprised as we were. It sometimes vanishes on the next one.'),
  },
  'explorer-blobfish': {
    name: tr('Blobfish de l\'explorateur', 'Explorer\'s blobfish'),
    about: tr('La tête exacte d\'un pilote qui rentre de six mois dans le vide sans avoir croisé une station. Il ne demande rien, sinon qu\'on lui achète ses données cartographiques.', 'The exact face of a pilot back from six months in the void without seeing a station. It asks for nothing, except that someone buy its cartographic data.'),
  },
  'beagle-sunfish': {
    name: tr('Poisson-lune de Beagle Point', 'Beagle Point sunfish'),
    about: tr('Immense, pâle, plus haut que long. On dit qu\'il a fait le tour de la galaxie à la dérive, sans jamais se presser, et qu\'il a vu la dernière étoile avant le noir. Il n\'en tire aucune fierté.', 'Huge, pale, taller than it is long. They say it drifted all the way around the galaxy, never hurrying, and saw the last star before the dark. It takes no pride in it.'),
  },
  'void-angler': {
    name: tr('Baudroie du Vide', 'Void anglerfish'),
    about: tr('Une lueur bleue au fond de l\'étang, là où il ne devrait pas y avoir de fond. Ceux qui l\'ont suivie disent qu\'elle ressemblait à une balise de détresse. C\'est exactement l\'idée.', 'A blue glow at the bottom of the pond, where there should be no bottom. Those who followed it say it looked like a distress beacon. That is exactly the idea.'),
  },
}

export const fishName = (fish: FishSpecies): string => TEXT[fish.id]?.name ?? fish.id
export const fishAbout = (fish: FishSpecies): string => TEXT[fish.id]?.about ?? ''

/** Espèces sans texte (oubli) : vide si tout va bien (cf. le test des espèces). */
export const untitled = () => FISH.filter((f) => !TEXT[f.id]).map((f) => f.id)
