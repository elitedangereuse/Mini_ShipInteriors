import { tr } from '../i18n'

/*
 * Les interrogations de la professeure Kepler (salle de classe du pont supérieur, cf. panel.ts).
 *
 * Trois sur l'univers d'Elite Dangerous, du rang « Inoffensif » au rang « Élite », et deux sur
 * Élite Dangereuse : le site, ses aventures, et la vie à bord. Chaque interrogation tire dix
 * questions au hasard dans sa liste, et mélange les réponses.
 *
 * Les questions sur les aventures ne reprennent que ce qu'on lit avant de les commencer (titre,
 * résumé, auteur) : aucune ne donne la solution d'une énigme.
 */

export interface Question {
  q: string
  right: string
  wrong: [string, string, string]
  /** Ce que la professeure ajoute une fois la réponse donnée. */
  why?: string
}

export interface Quiz {
  id: string
  /** Matière : l'univers du jeu, ou le site et ses aventures. */
  subject: 'elite' | 'site'
  name: string
  /** Niveau, de 1 à 3 étoiles. */
  stars: 1 | 2 | 3
  blurb: string
  questions: Question[]
}

/** Nombre de questions d'une interrogation. */
export const QUIZ_LENGTH = 10

const Q = (q: string, right: string, wrong: [string, string, string], why?: string): Question => ({ q, right, wrong, why })

// ---------------------------------------------------------------- univers d'Elite : Inoffensif

const HARMLESS: Question[] = [
  Q(
    tr('Avec quel vaisseau tout commandant débute-t-il sa carrière ?', 'Which ship does every commander start their career in?'),
    'Sidewinder', ['Cobra Mk III', 'Anaconda', 'Eagle'],
    tr('Le Sidewinder : petit, gratuit, et remplacé sans frais quand on le casse.', 'The Sidewinder: small, free, and replaced at no cost when you wreck it.'),
  ),
  Q(
    tr('Quel studio développe Elite Dangerous ?', 'Which studio develops Elite Dangerous?'),
    'Frontier Developments', ['Faulcon DeLacy', 'Core Dynamics', 'Lakon Spaceways'],
    tr('Les trois autres sont des constructeurs de vaisseaux du jeu.', 'The other three are shipbuilders in the game.'),
  ),
  Q(
    tr('Que signifie le sigle FSD ?', 'What does FSD stand for?'),
    'Frame Shift Drive', ['Fast Space Drive', 'Fuel Scoop Device', 'Federal Security Division'],
    tr('Le réacteur qui plie l\'espace : supercruise dans un système, saut entre deux étoiles.', 'The drive that folds space: supercruise within a system, jumps between stars.'),
  ),
  Q(
    tr('Dans quel système se trouve la capitale de la Fédération ?', 'In which system is the Federation\'s capital?'),
    'Sol', ['Achenar', 'Alioth', 'Lave'],
    tr('Sol, notre bon vieux système : il faut un permis pour y entrer.', 'Sol, good old home: you need a permit to enter.'),
  ),
  Q(
    tr('Quel système est la capitale de l\'Empire ?', 'Which system is the capital of the Empire?'),
    'Achenar', ['Sol', 'Alioth', 'Shinrarta Dezhra'],
    tr('Achenar, siège de la famille Duval. Alioth, c\'est l\'Alliance.', 'Achenar, seat of the Duval family. Alioth belongs to the Alliance.'),
  ),
  Q(
    tr('Comment s\'appelle l\'espèce extraterrestre qui a envahi la Bulle ?', 'What is the alien species that invaded the Bubble called?'),
    tr('Les Thargoïdes', 'The Thargoids'), [tr('Les Guardians', 'The Guardians'), tr('Les Zorbliens', 'The Zorblians'), tr('Les Lakoniens', 'The Lakonians')],
    tr('Les Guardians, eux, ont disparu il y a bien longtemps.', 'The Guardians, for their part, vanished a very long time ago.'),
  ),
  Q(
    tr('Que veut dire « o7 » dans un message entre commandants ?', 'What does “o7” mean in a message between commanders?'),
    tr('Un salut militaire', 'A military salute'), [tr('Un appel de détresse', 'A distress call'), tr('Une demande d\'appontage', 'A docking request'), tr('Le niveau zéro de carburant', 'Fuel level zero')],
    tr('Le « o » est la tête, le « 7 » le bras levé à la tempe.', 'The “o” is the head, the “7” the arm raised to the temple.'),
  ),
  Q(
    tr('À quoi sert un collecteur de carburant (fuel scoop) ?', 'What is a fuel scoop for?'),
    tr('Faire le plein en frôlant une étoile', 'Refuelling by skimming a star'), [tr('Ramasser les conteneurs en vol', 'Picking up canisters in flight'), tr('Miner les astéroïdes', 'Mining asteroids'), tr('Vider les réservoirs avant un combat', 'Dumping fuel before a fight')],
    tr('Et en surveillant sa température. Toujours.', 'While keeping an eye on your heat. Always.'),
  ),
  Q(
    tr('Comment appelle-t-on la région de la galaxie habitée par l\'humanité, autour de Sol ?', 'What do we call the region of the galaxy inhabited by humanity, around Sol?'),
    tr('La Bulle', 'The Bubble'), [tr('Le Noyau', 'The Core'), tr('La Ceinture', 'The Belt'), tr('Le Nid', 'The Nest')],
  ),
  Q(
    tr('Comment s\'appelle le véhicule de surface de base, à six roues ?', 'What is the basic six-wheeled surface vehicle called?'),
    'Scarab', ['Mako', 'Rover-9', 'Beetle'],
    tr('Le SRV Scarab : on le déploie depuis un hangar à véhicules planétaires.', 'The Scarab SRV: deployed from a planetary vehicle hangar.'),
  ),
  Q(
    tr('Quel objet occupe le centre de la galaxie ?', 'What lies at the centre of the galaxy?'),
    tr('Sagittarius A*, un trou noir supermassif', 'Sagittarius A*, a supermassive black hole'), [tr('Colonia, une colonie lointaine', 'Colonia, a distant colony'), tr('Beagle Point, une étoile solitaire', 'Beagle Point, a lonely star'), tr('La nébuleuse des Pléiades', 'The Pleiades nebula')],
  ),
  Q(
    tr('Quel est le tout premier rang de combat d\'un pilote ?', 'What is a pilot\'s very first combat rank?'),
    tr('Inoffensif', 'Harmless'), [tr('Novice', 'Novice'), tr('Compétent', 'Competent'), tr('Plutôt inoffensif', 'Mostly Harmless')],
    tr('« Plutôt inoffensif » vient juste après : c\'est déjà une promotion.', '“Mostly Harmless” comes right after: that is already a promotion.'),
  ),
  Q(
    tr('Par où entre-t-on dans une station Coriolis ?', 'How do you enter a Coriolis station?'),
    tr('Par la fente, sur sa face avant', 'Through the mail slot on its front face'), [tr('Par un sas sur chaque arête', 'Through an airlock on each edge'), tr('Par le dessous, en marche arrière', 'From underneath, in reverse'), tr('On ne rentre pas : on s\'amarre dehors', 'You don\'t: you moor outside')],
    tr('En respectant le feu vert à droite, s\'il vous plaît.', 'Keeping to the green light on the right, please.'),
  ),
  Q(
    tr('Quelle extension permet de quitter son siège et de marcher ?', 'Which expansion lets you leave your seat and walk?'),
    'Odyssey', ['Horizons', 'Arena', 'Beyond'],
    tr('Horizons, elle, a apporté les atterrissages sur les planètes.', 'Horizons, for its part, brought planetary landings.'),
  ),
  Q(
    tr('Combien de systèmes stellaires la galaxie du jeu compte-t-elle, environ ?', 'Roughly how many star systems does the game\'s galaxy hold?'),
    tr('400 milliards', '400 billion'), [tr('400 millions', '400 million'), tr('40 000', '40,000'), tr('4 milliards', '4 billion')],
    tr('Et l\'humanité n\'en a visité qu\'une infime fraction.', 'And humanity has visited only a tiny fraction.'),
  ),
  Q(
    tr('Qui a créé le premier Elite, en 1984 ?', 'Who created the first Elite, in 1984?'),
    tr('David Braben et Ian Bell', 'David Braben and Ian Bell'), [tr('Chris Roberts et Erin Roberts', 'Chris Roberts and Erin Roberts'), tr('Sid Meier et Bruce Shelley', 'Sid Meier and Bruce Shelley'), tr('Sean Murray et Grant Duncan', 'Sean Murray and Grant Duncan')],
  ),
  Q(
    tr('À quoi sert surtout un Type-9 Heavy ?', 'What is a Type-9 Heavy mostly used for?'),
    tr('Au transport de marchandises', 'Hauling cargo'), [tr('Au combat rapproché', 'Dogfighting'), tr('Aux courses de canyon', 'Canyon racing'), tr('Au transport de passagers de luxe', 'Luxury passenger transport')],
    tr('Une soute immense, et la maniabilité d\'une station spatiale.', 'A huge hold, and the handling of a space station.'),
  ),
  Q(
    tr('Qu\'est-ce que le supercruise ?', 'What is supercruise?'),
    tr('Le mode de vol rapide à l\'intérieur d\'un système', 'The fast flight mode inside a system'), [tr('Le saut entre deux systèmes', 'The jump between two systems'), tr('Le pilote automatique d\'appontage', 'The docking autopilot'), tr('Un rang de la Fédération des pilotes', 'A Pilots Federation rank')],
  ),
]

// ---------------------------------------------------------------- univers d'Elite : Compétent

const COMPETENT: Question[] = [
  Q(
    tr('Dans quel système se trouve la station Jameson Memorial ?', 'In which system is Jameson Memorial station?'),
    'Shinrarta Dezhra', ['Lave', 'Sol', 'Deciat'],
    tr('Le monde des Fondateurs : son permis récompense le rang Élite.', 'The Founders World: its permit rewards Elite rank.'),
  ),
  Q(
    tr('À quelle distance de son étoile d\'arrivée se trouve Hutton Orbital, environ ?', 'Roughly how far from its arrival star is Hutton Orbital?'),
    tr('0,22 année-lumière', '0.22 light years'), [tr('2 200 secondes-lumière', '2,200 light seconds'), tr('22 000 secondes-lumière', '22,000 light seconds'), tr('2,2 années-lumière', '2.2 light years')],
    tr('Soit plus de six millions de secondes-lumière. Prévoyez un thermos.', 'That is over six million light seconds. Bring a flask.'),
  ),
  Q(
    tr('Quel est le plus redoutable des intercepteurs thargoïdes ?', 'Which is the most fearsome Thargoid interceptor?'),
    'Hydra', ['Cyclops', 'Basilisk', 'Medusa'],
    tr('Dans l\'ordre : Cyclops, Basilisk, Medusa, Hydra.', 'In order: Cyclops, Basilisk, Medusa, Hydra.'),
  ),
  Q(
    tr('Dans quel système travaille l\'ingénieure Felicity Farseer ?', 'In which system does the engineer Felicity Farseer work?'),
    'Deciat', ['Khun', 'Wyrd', 'Leesti'],
    tr('Farseer Inc., sur Deciat 6 a : la première porte que poussent les explorateurs.', 'Farseer Inc., on Deciat 6 a: the first door explorers knock on.'),
  ),
  Q(
    tr('Quel constructeur fabrique l\'Anaconda ?', 'Which manufacturer builds the Anaconda?'),
    'Faulcon DeLacy', ['Core Dynamics', 'Lakon Spaceways', 'Gutamaya'],
  ),
  Q(
    tr('À quelle distance de Sol se trouve Colonia, environ ?', 'Roughly how far from Sol is Colonia?'),
    tr('22 000 années-lumière', '22,000 light years'), [tr('2 200 années-lumière', '2,200 light years'), tr('65 000 années-lumière', '65,000 light years'), tr('500 années-lumière', '500 light years')],
  ),
  Q(
    tr('Le jet d\'une étoile à neutrons multiplie la portée du prochain saut par…', 'The jet of a neutron star multiplies the range of your next jump by…'),
    tr('4', '4'), [tr('1,5', '1.5'), tr('2', '2'), tr('10', '10')],
    tr('Une naine blanche ne donne que 1,5, et beaucoup plus de sueurs froides.', 'A white dwarf only gives 1.5, and a lot more cold sweat.'),
  ),
  Q(
    tr('Lequel de ces vaisseaux exige un grand pad d\'appontage ?', 'Which of these ships needs a large landing pad?'),
    'Type-9 Heavy', ['Python', 'Krait Mk II', 'Asp Explorer'],
  ),
  Q(
    tr('Comment extrait-on des opales du vide ?', 'How do you extract void opals?'),
    tr('En faisant éclater le cœur d\'un astéroïde', 'By cracking open an asteroid\'s core'), [tr('En écopant les anneaux d\'une géante gazeuse', 'By scooping a gas giant\'s rings'), tr('En forant la surface d\'une lune', 'By drilling a moon\'s surface'), tr('En raffinant du carburant d\'étoile', 'By refining star fuel')],
    tr('Charges sismiques dans les fissures, et l\'on recule.', 'Seismic charges in the fissures, then back away.'),
  ),
  Q(
    tr('Combien de grades compte une modification d\'ingénieur ?', 'How many grades does an engineer modification have?'),
    '5', ['3', '4', '10'],
  ),
  Q(
    tr('Qui règne sur l\'Empire depuis 3301 ?', 'Who has ruled the Empire since 3301?'),
    'Arissa Lavigny-Duval', ['Aisling Duval', 'Zemina Torval', 'Denton Patreus'],
  ),
  Q(
    tr('Lave, Leesti, Diso et Zaonce font partie des…', 'Lave, Leesti, Diso and Zaonce are part of the…'),
    tr('Vieux Mondes', 'Old Worlds'), [tr('Mondes des Fondateurs', 'Founders Worlds'), tr('Colonies de la Frontière', 'Frontier Colonies'), tr('Systèmes des Pléiades', 'Pleiades systems')],
    tr('Les systèmes du premier Elite, en 1984.', 'The systems of the first Elite, back in 1984.'),
  ),
  Q(
    tr('Quelle marchandise rare fait la réputation de Lave ?', 'Which rare commodity is Lave famous for?'),
    'Lavian Brandy', ['Hutton Mug', 'Onionhead', 'Leestian Evil Juice'],
  ),
  Q(
    tr('Près de laquelle de ces étoiles peut-on faire le plein ?', 'Near which of these stars can you scoop fuel?'),
    tr('Une étoile de classe K', 'A class K star'), [tr('Une naine blanche', 'A white dwarf'), tr('Une étoile à neutrons', 'A neutron star'), tr('Une naine brune de classe T', 'A class T brown dwarf')],
    tr('K, G, B, F, O, A, M : les sept classes qui se laissent écoper.', 'K, G, B, F, O, A, M: the seven classes you can scoop.'),
  ),
  Q(
    tr('Quel système marque, pour les explorateurs, l\'autre bout de la galaxie ?', 'Which system marks the far side of the galaxy for explorers?'),
    'Beagle Point', ['Colonia', 'Sagittarius A*', 'Maia'],
    tr('À plus de 65 000 années-lumière de Sol.', 'More than 65,000 light years from Sol.'),
  ),
  Q(
    tr('Quel carburant brûle un Fleet Carrier pour sauter ?', 'What fuel does a Fleet Carrier burn to jump?'),
    'Tritium', [tr('Hydrogène', 'Hydrogen'), 'Painite', tr('Antimatière', 'Antimatter')],
    tr('Jusqu\'à 500 années-lumière par saut.', 'Up to 500 light years per jump.'),
  ),
  Q(
    tr('Qui vient au secours des pilotes tombés en panne sèche ?', 'Who comes to the rescue of pilots who have run out of fuel?'),
    'The Fuel Rats', ['Canonn', 'The Dark Wheel', 'Aegis'],
    tr('« Nous avons du carburant. Vous, non. »', '“We have fuel. You don\'t.”'),
  ),
  Q(
    tr('Quelle légende attire les pilotes novices jusqu\'à Hutton Orbital ?', 'Which legend lures novice pilots all the way to Hutton Orbital?'),
    tr('Une Anaconda gratuite', 'A free Anaconda'), [tr('Le permis de Sol', 'The Sol permit'), tr('Un ingénieur secret', 'A secret engineer'), tr('L\'entrée de Raxxla', 'The entrance to Raxxla')],
    tr('Il n\'y a pas d\'Anaconda. Il y a un mug.', 'There is no Anaconda. There is a mug.'),
  ),
  Q(
    tr('Que faut-il détruire pour venir à bout d\'un intercepteur thargoïde ?', 'What must you destroy to bring down a Thargoid interceptor?'),
    tr('Ses cœurs', 'Its hearts'), [tr('Son cockpit', 'Its cockpit'), tr('Ses réacteurs', 'Its thrusters'), tr('Son générateur de bouclier', 'Its shield generator')],
  ),
  Q(
    tr('Quel constructeur signe les vaisseaux impériaux, comme le Clipper ?', 'Which manufacturer builds Imperial ships such as the Clipper?'),
    'Gutamaya', ['Zorgon Peterson', 'Saud Kruger', 'Faulcon DeLacy'],
  ),
]

// ---------------------------------------------------------------- univers d'Elite : Élite

const ELITE: Question[] = [
  Q(
    tr('De combien d\'années le calendrier du jeu est-il en avance sur le nôtre ?', 'How many years ahead of ours is the game\'s calendar?'),
    '1286', ['1000', '1300', '1984'],
    tr('2014 est devenu 3300 : le compte est resté le même depuis.', '2014 became 3300: the offset has not changed since.'),
  ),
  Q(
    tr('Quel commandant a abattu Salomé à Tionisla, en avril 3303 ?', 'Which commander shot down Salomé at Tionisla in April 3303?'),
    'CMDR Harry Potter', ['CMDR Kamzel', 'CMDR DP Sayre', 'CMDR Zulu Romeo'],
    tr('Oui, vraiment. L\'Histoire a de ces noms.', 'Yes, really. History has a way with names.'),
  ),
  Q(
    tr('Quel commandant a filmé la première interception par un vaisseau thargoïde, en 3303 ?', 'Which commander filmed the first interception by a Thargoid ship, in 3303?'),
    'CMDR DP Sayre', ['CMDR Harry Potter', 'CMDR Kamzel', 'CMDR Jameson'],
  ),
  Q(
    tr('Quel mégavaisseau fantôme de l\'expédition Dynasty dérive dans la faille Formidine ?', 'Which ghost megaship of the Dynasty expedition drifts in the Formidine Rift?'),
    'Zurara', ['The Gnosis', 'Hesperus', 'Adamastor'],
  ),
  Q(
    tr('Quel ingénieur a déchiffré les ruines des Guardians ?', 'Which engineer deciphered the Guardian ruins?'),
    'Ram Tah', [tr('Le professeur Palin', 'Professor Palin'), 'Liz Ryder', 'Tod « The Blaster » McQuinn'],
  ),
  Q(
    tr('Combien de Titans thargoïdes se sont installés dans la Bulle à la fin de 3308 ?', 'How many Thargoid Titans settled in the Bubble at the end of 3308?'),
    '8', ['4', '6', '12'],
    tr('Taranis, Leigong, Oya, Indra, Hadad, Thor, Raijin et Cocijo.', 'Taranis, Leigong, Oya, Indra, Hadad, Thor, Raijin and Cocijo.'),
  ),
  Q(
    tr('Quel Titan a porté la guerre jusqu\'à Sol ?', 'Which Titan carried the war all the way to Sol?'),
    'Cocijo', ['Taranis', 'Thor', 'Raijin'],
  ),
  Q(
    tr('Dans quel système l\'onde Proteus a-t-elle été déclenchée ?', 'In which system was the Proteus Wave fired?'),
    'HIP 22460', ['Maia', 'Merope', 'Asterope'],
    tr('L\'arme miracle d\'Azimuth. Elle n\'a pas fait de miracle.', 'Azimuth\'s miracle weapon. It worked no miracle.'),
  ),
  Q(
    tr('Quelle arme l\'INRA a-t-elle employée contre les Thargoïdes ?', 'Which weapon did the INRA use against the Thargoids?'),
    tr('Le mycoïde, un agent biologique', 'The mycoid, a biological agent'), [tr('L\'onde Proteus', 'The Proteus Wave'), tr('Le canon Gauss des Guardians', 'The Guardian Gauss cannon'), tr('Des mines à antimatière', 'Antimatter mines')],
  ),
  Q(
    tr('Dans quel système sous permis travaille l\'ingénieur Marco Qwent ?', 'In which permit-locked system does the engineer Marco Qwent work?'),
    'Sirius', ['Sol', 'Alioth', 'Shinrarta Dezhra'],
  ),
  Q(
    tr('À quelle distance de Sol se trouve Sagittarius A*, environ ?', 'Roughly how far from Sol is Sagittarius A*?'),
    tr('25 900 années-lumière', '25,900 light years'), [tr('22 000 années-lumière', '22,000 light years'), tr('12 500 années-lumière', '12,500 light years'), tr('65 000 années-lumière', '65,000 light years')],
  ),
  Q(
    tr('Vers quelle destination Jaques Station sautait-elle quand elle s\'est échouée dans ce qui deviendrait Colonia ?', 'Where was Jaques Station jumping to when it ended up stranded in what would become Colonia?'),
    'Beagle Point', ['Sagittarius A*', 'Sol', tr('Les Pléiades', 'The Pleiades')],
  ),
  Q(
    tr('Sur quelle machine le premier Elite est-il sorti, en 1984 ?', 'On which machine was the first Elite released, in 1984?'),
    'BBC Micro', ['ZX Spectrum', 'Commodore 64', 'Amstrad CPC'],
  ),
  Q(
    tr('Comment s\'appelle le deuxième épisode de la série, sorti en 1993 ?', 'What is the second game in the series, released in 1993, called?'),
    'Frontier: Elite II', ['Elite Plus', 'Frontier: First Encounters', 'Elite: The New Kind'],
  ),
  Q(
    tr('Dans quelle nébuleuse les premières bernacles thargoïdes ont-elles été découvertes ?', 'In which nebula were the first Thargoid barnacles discovered?'),
    tr('Les Pléiades', 'The Pleiades'), [tr('La nébuleuse d\'Orion', 'The Orion Nebula'), tr('La Tête de Sorcière', 'The Witch Head'), tr('La nébuleuse de Californie', 'The California Nebula')],
  ),
  Q(
    tr('Quel mégavaisseau de Canonn a été intercepté en tentant de sauter vers le Cone Sector ?', 'Which Canonn megaship was intercepted while trying to jump to the Cone Sector?'),
    'The Gnosis', ['Zurara', 'Jaques Station', 'The Golconda'],
  ),
  Q(
    tr('Combien d\'années-lumière ajoute un Guardian FSD Booster de classe 5 ?', 'How many light years does a class 5 Guardian FSD Booster add?'),
    tr('10,5', '10.5'), [tr('5', '5'), tr('7,75', '7.75'), tr('15', '15')],
  ),
  Q(
    tr('Quel rang de la marine impériale ouvre l\'achat d\'un Imperial Cutter ?', 'Which Imperial Navy rank unlocks the Imperial Cutter?'),
    tr('Duc', 'Duke'), [tr('Baron', 'Baron'), tr('Comte', 'Count'), tr('Prince', 'Prince')],
    tr('Baron suffit pour le Clipper. Le Cutter se mérite.', 'Baron is enough for the Clipper. The Cutter has to be earned.'),
  ),
  Q(
    tr('Où le professeur Palin s\'est-il réinstallé après l\'attaque de Maia ?', 'Where did Professor Palin relocate after the attack on Maia?'),
    'Arque', ['Deciat', 'Meene', 'Colonia'],
  ),
  Q(
    tr('Quel commandant a atteint le premier le système qui porte le nom de son vaisseau, Beagle Point ?', 'Which commander first reached the system named after his ship, Beagle Point?'),
    'CMDR Kamzel', ['CMDR Zulu Romeo', 'CMDR Erimus', 'CMDR Harry Potter'],
  ),
  Q(
    tr('Quel rang de la marine fédérale donne le permis de Sol ?', 'Which Federal Navy rank grants the Sol permit?'),
    tr('Sous-officier (Petty Officer)', 'Petty Officer'), [tr('Cadet', 'Cadet'), tr('Lieutenant', 'Lieutenant'), tr('Contre-amiral (Rear Admiral)', 'Rear Admiral')],
  ),
  Q(
    tr('En quelle année la campagne Kickstarter d\'Elite Dangerous a-t-elle été lancée ?', 'In which year was the Elite Dangerous Kickstarter campaign launched?'),
    '2012', ['2010', '2014', '2016'],
  ),
]

// ---------------------------------------------------------------- Élite Dangereuse : facile

const SITE_EASY: Question[] = [
  Q(
    tr('Que propose avant tout le site Élite Dangereuse ?', 'What does the Élite Dangereuse website offer above all?'),
    tr('Des aventures scénarisées à vivre dans le jeu', 'Scripted adventures to play through in the game'), [tr('Un comparateur de prix de vaisseaux', 'A ship price comparison tool'), tr('Des serveurs privés du jeu', 'Private game servers'), tr('La vente de crédits', 'Credits for sale')],
  ),
  Q(
    tr('Combien coûtent les aventures du site ?', 'How much do the site\'s adventures cost?'),
    tr('Rien : elles sont toutes gratuites', 'Nothing: they are all free'), [tr('Un booster de cartes chacune', 'One card booster each'), tr('Un abonnement mensuel', 'A monthly subscription'), tr('Cent tonnes d\'opales du vide', 'A hundred tonnes of void opals')],
  ),
  Q(
    tr('Quel est le métier de Jacob Scarlett, dont il faut élucider la disparition ?', 'What is the job of Jacob Scarlett, whose disappearance you must solve?'),
    tr('Officier de sécurité', 'Security officer'), [tr('Mineur d\'astéroïdes', 'Asteroid miner'), tr('Chauffeur de taxi', 'Taxi driver'), tr('Barman', 'Bartender')],
  ),
  Q(
    tr('Dans « La Quête de Noël », que dirige Sandra Corrs ?', 'In “The Christmas Quest”, what does Sandra Corrs run?'),
    tr('Une fabrique de jouets', 'A toy factory'), [tr('Un chantier naval', 'A shipyard'), tr('Une station de minage', 'A mining station'), tr('Une chocolaterie', 'A chocolate factory')],
  ),
  Q(
    tr('Que cherche-t-on dans l\'aventure consacrée à La Buse ?', 'What are you looking for in the adventure about La Buse?'),
    tr('Un trésor de pirate', 'A pirate\'s treasure'), [tr('Un oiseau rare', 'A rare bird'), tr('Un croiseur disparu', 'A missing cruiser'), tr('Une recette de cuisine', 'A recipe')],
  ),
  Q(
    tr('Comment s\'appelle le podcast de la communauté, qui a son studio au pont supérieur ?', 'What is the community podcast, which has its studio on the upper deck, called?'),
    'Radio Dangereuse', ['Radio Sidewinder', 'Galnet Matin', 'Fréquence Thargoïde'],
  ),
  Q(
    tr('Que sont « Les Galères Galactiques » ?', 'What is “Les Galères Galactiques”?'),
    tr('Une mini-fiction audio humoristique', 'A comedy audio mini-series'), [tr('Un tournoi de courses de vaisseaux', 'A ship racing tournament'), tr('La flotte de la communauté', 'The community\'s fleet'), tr('Un jeu de cartes', 'A card game')],
    tr('À bord, rien ne se passe jamais comme prévu.', 'Aboard, nothing ever goes to plan.'),
  ),
  Q(
    tr('Qui tient la cuisine du mess, à bord ?', 'Who runs the mess kitchen aboard?'),
    tr('Le chef Marcel', 'Chef Marcel'), ['Nico', 'Jacques', 'Bugenhagen'],
  ),
  Q(
    tr('Comment s\'appelle le chat du bord ?', 'What is the ship\'s cat called?'),
    'Comète', ['Pulsar', 'Nébuleuse', 'Sidewinder'],
  ),
  Q(
    tr('Qui soigne l\'équipage à l\'infirmerie ?', 'Who looks after the crew in the infirmary?'),
    'Betty', ['Capucine', 'Julia', 'Sandra'],
  ),
  Q(
    tr('Qui s\'occupe de la serre hydroponique ?', 'Who tends the hydroponics bay?'),
    'Capucine', ['Betty', 'Marcel', 'Nico'],
  ),
  Q(
    tr('Qui répare le Krait, au hangar de la cale ?', 'Who repairs the Krait in the hold\'s hangar?'),
    tr('Nico, le mécano', 'Nico, the mechanic'), [tr('Marcel, le chef', 'Marcel, the chef'), tr('Jacques, le barman', 'Jacques, the bartender'), tr('Comète, le chat', 'Comète, the cat')],
  ),
  Q(
    tr('Qui a le droit d\'entrer au Zorb, la boîte de nuit de la cale ?', 'Who is allowed into the Zorb, the nightclub in the hold?'),
    tr('Les aliens, et eux seuls', 'Aliens, and aliens only'), [tr('Les pilotes de rang Élite', 'Elite-ranked pilots'), tr('Les membres de l\'équipage', 'Crew members'), tr('Tout le monde, après minuit', 'Everyone, after midnight')],
    tr('Le videur compte les antennes.', 'The bouncer counts antennae.'),
  ),
  Q(
    tr('Qui vous accueille au planétarium ?', 'Who welcomes you to the planetarium?'),
    'Bugenhagen', ['Kepler', 'Galilée', 'Jameson'],
    tr('« Hou hou houuu ! »', '“Ho ho hooo!”'),
  ),
  Q(
    tr('Quelle entreprise recrute dans l\'aventure « Taxi Driver » ?', 'Which company is hiring in the “Taxi Driver” adventure?'),
    'TAXI Corp.', ['Sirius Corporation', 'Faulcon DeLacy', 'Brewer Corporation'],
  ),
  Q(
    tr('Que collectionne-t-on sur le site, en ouvrant des boosters ?', 'What do you collect on the site by opening boosters?'),
    tr('Des cartes', 'Cards'), [tr('Des vaisseaux', 'Ships'), tr('Des permis', 'Permits'), tr('Des mugs', 'Mugs')],
  ),
]

// ---------------------------------------------------------------- Élite Dangereuse : difficile

const SITE_HARD: Question[] = [
  Q(
    tr('Combien de pages faut-il retrouver dans « Les Pages Perdues du Guide de Survie » ?', 'How many pages must you recover in “The Lost Pages of the Survival Guide”?'),
    '11', ['7', '9', '13'],
  ),
  Q(
    tr('Quel explorateur recherche-t-on dans « Sur les traces du Stargazer » ?', 'Which explorer are you looking for in “On the Trail of the Stargazer”?'),
    'Luca Rekivek', ['Jacob Scarlett', 'Milan Hunt', 'Humphrey Penworthy'],
  ),
  Q(
    tr('À quelle date la station a-t-elle lancé son appel à l\'aide pour le Stargazer ?', 'On what date did the station send its call for help about the Stargazer?'),
    tr('Le 26 juin 3303', '26 June 3303'), [tr('Le 24 décembre 3308', '24 December 3308'), tr('Le 29 avril 3303', '29 April 3303'), tr('Le 1er avril 3310', '1 April 3310')],
  ),
  Q(
    tr('Dans quel système Jacob Scarlett était-il officier de sécurité ?', 'In which system was Jacob Scarlett a security officer?'),
    'Ross 154', ['Wolf 359', 'Cofana', 'Meene'],
  ),
  Q(
    tr('Qui a écrit « Une duchesse d\'Adenates en détresse » ?', 'Who wrote “A Distressed Duchess from Adenates”?'),
    'THARGOSU', ['OptimusKoala', 'Chelito', 'Fred89210'],
  ),
  Q(
    tr('De quelle classe est le FNS Damocles, le vaisseau détourné ?', 'What class is the FNS Damocles, the hijacked ship?'),
    'Farragut', ['Majestic', 'Anaconda', 'Coriolis'],
    tr('Un croiseur de bataille fédéral. Le Majestic, c\'est l\'Empire.', 'A Federal battle cruiser. The Majestic is the Empire\'s.'),
  ),
  Q(
    tr('Dans « Haute Sécurité », dans quel système votre contact vous donne-t-il rendez-vous ?', 'In “High Security”, in which system does your contact arrange to meet you?'),
    'Cofana', ['Morana', 'Meene', 'Ross 154'],
    tr('Sur Cortes Analytics Enterprise.', 'Aboard Cortes Analytics Enterprise.'),
  ),
  Q(
    tr('Dans « Jamais Deux Sans Trois », quel objet trouvez-vous sur un marché de Tellus Tertius ?', 'In “Three\'s A Charm”, what do you find at a market on Tellus Tertius?'),
    tr('Une vieille carte de jeu', 'An old playing card'), [tr('Une boîte noire', 'A black box'), tr('Un mug ébréché', 'A chipped mug'), tr('Une carte au trésor', 'A treasure map')],
  ),
  Q(
    tr('Où faites-vous escale au début de « Voyage au sein d\'une civilisation éteinte » ?', 'Where do you stop over at the start of “Journey within an extinct civilization”?'),
    tr('Felice Dock, dans le système Meene', 'Felice Dock, in the Meene system'), [tr('Jameson Memorial, à Shinrarta Dezhra', 'Jameson Memorial, in Shinrarta Dezhra'), tr('Hutton Orbital, à Alpha Centauri', 'Hutton Orbital, in Alpha Centauri'), tr('Jaques Station, à Colonia', 'Jaques Station, in Colonia')],
  ),
  Q(
    tr('Quel site la page « À propos » cite-t-elle comme la plus grande inspiration d\'Élite Dangereuse ?', 'Which website does the “About” page name as Élite Dangereuse\'s greatest inspiration?'),
    'ED Trip', ['Canonn', 'Inara', 'EDSM'],
    tr('Canonn y est remercié aussi, pour ses précieuses ressources.', 'Canonn is thanked there too, for its precious resources.'),
  ),
  Q(
    tr('Que signifie L.J.P.C., le labo de James et Julia ?', 'What does L.J.P.C., James and Julia\'s lab, stand for?'),
    'Laboratoire des Jeunes Prodiges Cosmiques', ['Ligue des Joyeux Pilotes de Colonia', 'Laboratoire Jameson de Physique Céleste', 'Les Jeunes Pirates de la Cale'],
  ),
  Q(
    tr('Quelle aventure faut-il terminer pour entrer au labo du L.J.P.C. ?', 'Which adventure must you complete to enter the L.J.P.C. lab?'),
    tr('Connais ton Ennemi', 'Know your Enemy'), [tr('L\'Épreuve de la Voie', 'The Trial of the Path'), tr('L\'Écho du Thetis', 'The Echo of the Thetis'), tr('Haute Sécurité', 'High Security')],
  ),
  Q(
    tr('À qui « Brookes Galactic Tours » rend-elle hommage ?', 'Who does “Brookes Galactic Tours” pay tribute to?'),
    'Michael Brookes', ['David Braben', 'Ian Bell', 'Drew Wagar'],
  ),
  Q(
    tr('Quelle ingénieure vous lance un défi dans « Une Dose de Boost » ?', 'Which engineer challenges you in “A Pick-Me-Up”?'),
    'Felicity Farseer', ['Elvira Martuuk', 'Liz Ryder', 'Selene Jean'],
  ),
  Q(
    tr('Faulcon, DeLacy et Gutamaya nagent dans l\'étang du jardin exotique. Laquelle coûte le plus cher à nourrir ?', 'Faulcon, DeLacy and Gutamaya swim in the exotic garden\'s pond. Which one costs the most to feed?'),
    'Gutamaya', ['Faulcon', 'DeLacy', tr('Les trois, à égalité', 'All three, equally')],
    tr('Le luxe impérial a un prix, même chez les carpes.', 'Imperial luxury has a price, even among koi.'),
  ),
  Q(
    tr('Par quelle aventure s\'ouvre la trilogie de la Voie ?', 'Which adventure opens the trilogy of the Path?'),
    tr('L\'Épreuve de la Voie', 'The Trial of the Path'), [tr('La Cérémonie de la Voie', 'The Ceremony of the Path'), tr('Les Reliques de la Voie', 'The Relics of the Path'), tr('La Secte de la Voie', 'The Sect of the Path')],
  ),
  Q(
    tr('Qui a écrit « L\'Odyssée Céleste » ?', 'Who wrote “The Celestial Odyssey”?'),
    'Chelito', ['Malyda Sunstrider', 'THARGOSU', 'Bowring'],
  ),
]

export const QUIZZES: Quiz[] = [
  {
    id: 'elite-harmless', subject: 'elite', stars: 1, questions: HARMLESS,
    name: tr('Rang Inoffensif', 'Harmless rank'),
    blurb: tr('Les bases : vaisseaux, stations, premiers sauts.', 'The basics: ships, stations, first jumps.'),
  },
  {
    id: 'elite-competent', subject: 'elite', stars: 2, questions: COMPETENT,
    name: tr('Rang Compétent', 'Competent rank'),
    blurb: tr('Ingénieurs, constructeurs, Thargoïdes, grands voyages.', 'Engineers, shipbuilders, Thargoids, long hauls.'),
  },
  {
    id: 'elite-elite', subject: 'elite', stars: 3, questions: ELITE,
    name: tr('Rang Élite', 'Elite rank'),
    blurb: tr('L\'histoire de la galaxie, dans ses moindres recoins.', 'The history of the galaxy, down to its darkest corners.'),
  },
  {
    id: 'site-easy', subject: 'site', stars: 1, questions: SITE_EASY,
    name: tr('Élite Dangereuse : facile', 'Élite Dangereuse: easy'),
    blurb: tr('Le site, ses aventures, et la vie à bord.', 'The website, its adventures, and life aboard.'),
  },
  {
    id: 'site-hard', subject: 'site', stars: 3, questions: SITE_HARD,
    name: tr('Élite Dangereuse : difficile', 'Élite Dangereuse: hard'),
    blurb: tr('Pour qui a lu chaque aventure jusqu\'au bout.', 'For those who read every adventure to the end.'),
  },
]
