import { tr } from '../i18n'
import type { CatalogEntry } from './catalog'
import { fabrics, type Variant } from './variants'

/*
 * Le mobilier du vaisseau, qu'on croise dans ses pièces (les douches, le mess, l'atelier de la
 * cale, l'infirmerie de Betty, le bar de Jacques, le studio, le labo du L.J.P.C., le sanctuaire
 * de la Voie…), désormais proposé pour les quartiers. Les constructeurs sont ceux des pièces
 * (src/furniture/) ; leurs places, celles de src/seats.ts.
 */

/** Longueur d'un comptoir ou d'un arrière-bar (le `label` du constructeur, en mètres). */
const LENGTHS: Variant[] = [
  { id: '1.2', label: tr('Court (1,2 m)', 'Short (1.2 m)') },
  { id: '1.8', label: tr('Moyen (1,8 m)', 'Medium (1.8 m)') },
  { id: '2.4', label: tr('Long (2,4 m)', 'Long (2.4 m)') },
]

const SIGNS: Record<string, string> = {
  soon: tr('Bientôt', 'Coming soon'),
  nap: tr('Sieste en cours', 'Nap in progress'),
  works: tr('Travaux', 'Roadworks'),
  keep: tr('Défense d\'entrer', 'Keep out'),
}

export const SHIP_ENTRIES: CatalogEntry[] = [
  // --- Salle de bain : les douches du pont supérieur
  {
    id: 'ship-shower', name: tr('Douche du vaisseau', 'Ship\'s shower'), category: 'bath', model: 'shower', mount: 'floor',
    interact: tr('Douche sonique réglementaire : on en ressort propre et un peu sourd.', 'Regulation sonic shower: you come out clean and slightly deaf.'),
  },
  { id: 'ship-sink', name: tr('Lavabo et miroir', 'Basin and mirror'), category: 'bath', model: 'sink', mount: 'floor' },
  { id: 'ship-toilet', name: tr('Toilettes du bord', 'Ship\'s toilet'), category: 'bath', model: 'toilet', mount: 'floor' },
  { id: 'towel-rail', name: tr('Porte-serviettes', 'Towel rail'), category: 'bath', model: 'towel-rail', mount: 'wall' },
  { id: 'bath-cabinet', name: tr('Armoire de toilette', 'Bathroom cabinet'), category: 'bath', model: 'bath-cabinet', mount: 'wall' },
  {
    id: 'bath-scale', name: tr('Pèse-personne', 'Bathroom scales'), category: 'bath', model: 'bath-scale', mount: 'top', action: tr('Se peser', 'Weigh yourself'),
    interact: tr('En gravité réduite, vous pesez 12 kg. Vous décidez que c\'est votre vrai poids.', 'In low gravity you weigh 12 kg. You decide that\'s your real weight.'),
  },
  { id: 'laundry-basket', name: tr('Panier à linge', 'Laundry basket'), category: 'bath', model: 'laundry-basket', mount: 'floor' },

  // --- Cuisine : le mess de Marcel
  {
    id: 'mess-range', name: tr('Piano de cuisson', 'Range cooker'), category: 'kitchen', model: 'kitchen-range', mount: 'floor', action: tr('Cuisiner', 'Cook'),
    interact: tr('Le piano de Marcel, ou sa réplique : six feux, une hotte, et l\'odeur du ragoût de Leesti.', 'Marcel\'s range, or a copy of it: six burners, a hood, and the smell of Leesti stew.'),
  },
  { id: 'mess-prep', name: tr('Plan de travail', 'Worktop'), category: 'kitchen', model: 'kitchen-prep', mount: 'floor' },
  { id: 'mess-sink', name: tr('Plonge', 'Scullery sink'), category: 'kitchen', model: 'kitchen-sink', mount: 'floor' },
  { id: 'mess-fridge', name: tr('Réfrigérateur du mess', 'Mess fridge'), category: 'kitchen', model: 'kitchen-fridge', mount: 'floor' },
  { id: 'mess-pantry', name: tr('Garde-manger', 'Pantry'), category: 'kitchen', model: 'kitchen-pantry', mount: 'floor' },
  {
    id: 'water-fountain', name: tr('Fontaine à eau', 'Water cooler'), category: 'kitchen', model: 'water-fountain', mount: 'floor', action: tr('Boire', 'Drink'),
    interact: tr('Glou glou. L\'eau a le goût du recycleur. On s\'y fait.', 'Glug glug. The water tastes of the recycler. You get used to it.'),
  },
  { id: 'canteen-table', name: tr('Table de cantine', 'Canteen table'), category: 'kitchen', model: 'canteen-table', mount: 'floor', label: () => '' },
  { id: 'menu-board', name: tr('Menu du mess', 'Mess menu board'), category: 'kitchen', model: 'menu-board', mount: 'wall' },
  { id: 'tray-stack', name: tr('Pile de plateaux', 'Stack of trays'), category: 'kitchen', model: 'tray-stack', mount: 'top' },

  // --- Rangements
  { id: 'footlocker', name: tr('Cantine', 'Footlocker'), category: 'storage', model: 'footlocker', mount: 'floor', surface: 0.31 },
  { id: 'coat-hooks', name: tr('Patères', 'Coat hooks'), category: 'storage', model: 'coat-hooks', mount: 'wall' },
  { id: 'crew-board', name: tr('Tableau de service', 'Duty roster'), category: 'storage', model: 'crew-board', mount: 'wall' },
  { id: 'locker-row', name: tr('Rangée de casiers', 'Row of lockers'), category: 'storage', model: 'locker-row', mount: 'floor' },

  // --- Plantes : la serre
  {
    id: 'plant-wall', name: tr('Mur végétal', 'Living wall'), category: 'plants', model: 'plant-wall', mount: 'wall',
    variants: [{ id: '0.9', label: tr('Étroit', 'Narrow') }, { id: '1.6', label: tr('Large', 'Wide') }],
  },
  { id: 'potting-bench', name: tr('Établi de rempotage', 'Potting bench'), category: 'plants', model: 'potting-bench', mount: 'floor' },
  { id: 'nutrient-tank', name: tr('Cuve de nutriments', 'Nutrient tank'), category: 'plants', model: 'nutrient-tank', mount: 'floor' },
  {
    id: 'pollinator-drone', name: tr('Drone pollinisateur', 'Pollinator drone'), category: 'plants', model: 'pollinator-drone', mount: 'floor', solid: false,
    label: () => '0.5',
    interact: tr('Le drone butine vos plantes. Il a pris les fleurs en plastique pour des vraies, et il insiste.', 'The drone pollinates your plants. It has mistaken the plastic flowers for real ones, and keeps at it.'),
  },
  {
    id: 'garden-bed', name: tr('Bac potager', 'Raised garden bed'), category: 'plants', model: 'garden-bed', mount: 'floor',
    variants: [
      { id: 'tomato', label: tr('Tomates', 'Tomatoes') },
      { id: 'lettuce', label: tr('Salades', 'Lettuce') },
      { id: 'herbs', label: tr('Herbes', 'Herbs') },
      { id: 'flowers', label: tr('Fleurs', 'Flowers') },
    ],
  },
  {
    id: 'fruit-tree', name: tr('Pommier de Lave', 'Lave apple tree'), category: 'plants', model: 'fruit-tree', mount: 'floor',
    interact: tr('Un pommier nain. Ses fruits luisent la nuit : plus besoin de veilleuse.', 'A dwarf apple tree. Its fruit glows at night: no need for a night light.'),
  },
  {
    id: 'garden-pond', name: tr('Bassin aux carpes', 'Koi pond'), category: 'plants', model: 'garden-pond', mount: 'floor',
    interact: tr('Trois carpes koï tournent en rond. Elles ont l\'air de méditer. Ou de s\'ennuyer.', 'Three koi swim in circles. They seem to be meditating. Or bored.'),
  },
  { id: 'seed-cabinet', name: tr('Grainothèque', 'Seed library'), category: 'plants', model: 'seed-cabinet', mount: 'floor' },
  { id: 'water-barrel', name: tr('Récupérateur d\'eau', 'Water butt'), category: 'plants', model: 'water-barrel', mount: 'floor' },
  { id: 'compost-bin', name: tr('Composteur', 'Compost bin'), category: 'plants', model: 'compost-bin', mount: 'floor' },
  { id: 'harvest-crate', name: tr('Caisses de récolte', 'Harvest crates'), category: 'plants', model: 'harvest-crate', mount: 'floor' },
  { id: 'garden-arch', name: tr('Arche de rosiers', 'Rose arch'), category: 'plants', model: 'garden-arch', mount: 'floor', solid: false, label: () => '1.1' },
  { id: 'butterflies', name: tr('Papillons', 'Butterflies'), category: 'plants', model: 'butterflies', mount: 'floor', solid: false, label: () => '0.6' },

  // --- Elite
  {
    id: 'fsd', name: tr('FSD de rechange', 'Spare FSD'), category: 'elite', model: 'fsd', mount: 'floor',
    interact: tr('Frame Shift Drive de classe 5A, rechargé chez Felicity Farseer. Ne pas démarrer à l\'intérieur.', 'Class 5A Frame Shift Drive, engineered by Felicity Farseer. Do not spool up indoors.'),
  },
  {
    id: 'srv', name: 'SRV Scarab', category: 'elite', model: 'srv', mount: 'floor',
    interact: tr('Un Scarab garé dans la chambre. Le parking du hangar était plein.', 'A Scarab parked in the bedroom. The hangar car park was full.'),
  },
  { id: 'afmu', name: tr('Unité de réparation (AFMU)', 'AFM unit'), category: 'elite', model: 'afmu', mount: 'floor' },
  { id: 'crew-seat', name: tr('Siège d\'équipage', 'Crew seat'), category: 'elite', model: 'crew-seat', mount: 'floor' },
  {
    id: 'command-chair', name: tr('Fauteuil de commandant', 'Commander\'s chair'), category: 'elite', model: 'command-chair', mount: 'floor',
    interact: tr('Le fauteuil du commandant. Dans vos quartiers, c\'est vous le commandant.', 'The commander\'s chair. In your quarters, you are the commander.'),
  },
  {
    id: 'side-console', name: tr('Console d\'équipage', 'Crew console'), category: 'elite', model: 'side-console', mount: 'floor', action: tr('Consulter', 'Check'),
    variants: [{ id: 'nav', label: tr('Navigation', 'Navigation') }, { id: 'comms', label: 'Communications' }, { id: 'scan', label: tr('Scanner', 'Scanner') }],
    interact: tr('Tous les voyants sont au vert. Enfin, presque tous.', 'All the lights are green. Well, nearly all.'),
  },
  {
    id: 'limpets', name: tr('Drones collecteurs', 'Collector limpets'), category: 'elite', model: 'limpets', mount: 'floor', solid: false,
    interact: tr('Trois drones collecteurs en vol stationnaire. Ils cherchent des conteneurs. Il n\'y en a pas.', 'Three collector limpets hovering. They are looking for canisters. There are none.'),
  },

  // --- Aventures : le labo du L.J.P.C. et le sanctuaire de la Voie
  {
    id: 'holo-thargoid', name: tr('Hologramme de Thargoïde', 'Thargoid hologram'), category: 'adventures', model: 'holo-thargoid', mount: 'floor',
    interact: tr('Un Thargoïde en hologramme, grandeur (très) réduite. Il fait moins peur comme ça.', 'A Thargoid hologram, (very) scaled down. It\'s less scary like that.'),
  },
  { id: 'containment-pod', name: tr('Capsule de confinement', 'Containment pod'), category: 'adventures', model: 'containment-pod', mount: 'floor' },
  { id: 'lab-bench', name: tr('Paillasse de labo', 'Lab bench'), category: 'adventures', model: 'lab-bench', mount: 'floor' },
  { id: 'ljpc-banner', name: tr('Bannière du L.J.P.C.', 'L.J.P.C. banner'), category: 'adventures', model: 'ljpc-banner', mount: 'wall' },
  { id: 'amadioha-photo', name: tr('Photo d\'Amadioha', 'Photo of Amadioha'), category: 'adventures', model: 'amadioha-photo', mount: 'wall' },
  { id: 'chronicles-lectern', name: tr('Pupitre des Chroniques', 'Chronicles lectern'), category: 'adventures', model: 'chronicles-lectern', mount: 'floor', action: tr('Lire', 'Read') , interact: tr('Les Chroniques de la Voie, ouvertes à la page de Raxxla.', 'The Chronicles of the Path, open at the page on Raxxla.') },
  {
    id: 'voie-relic', name: tr('Relique de la Voie', 'Relic of the Path'), category: 'adventures', model: 'voie-relic', mount: 'floor',
    variants: [{ id: 'shard', label: tr('Éclat', 'Shard'), swatch: '#3dff9a' }, { id: 'medallion', label: tr('Médaillon', 'Medallion'), swatch: '#e8c15a' }, { id: 'eye', label: tr('Œil', 'Eye'), swatch: '#b06bff' }],
  },
  { id: 'salome-shrine', name: tr('Autel de Salomé', 'Salomé\'s shrine'), category: 'adventures', model: 'salome-shrine', mount: 'floor' },
  { id: 'raxxla-gate', name: tr('Portail de Raxxla', 'Raxxla gate'), category: 'adventures', model: 'raxxla-gate', mount: 'floor' },
  {
    id: 'voie-drape', name: tr('Tenture de la Voie', 'Drape of the Path'), category: 'adventures', model: 'voie-drape', mount: 'wall',
    variants: [{ id: '0.6', label: tr('Étroite', 'Narrow') }, { id: '1', label: tr('Large', 'Wide') }],
  },
  { id: 'adept-robes', name: tr('Robe d\'Adepte', 'Adept\'s robes'), category: 'adventures', model: 'adept-robes', mount: 'wall' },

  // --- Armurerie : la dague de la Voie
  {
    id: 'dark-wheel-dagger', name: tr('Dague de la Roue Sombre', 'Dark Wheel dagger'), category: 'weapons', model: 'dark-wheel-dagger', mount: 'wall',
    interact: tr('La dague de la Roue Sombre, sur son présentoir. On dit qu\'elle montre le chemin.', 'The Dark Wheel dagger, on its display. They say it points the way.'),
  },

  // --- Soirée : le bar de Jacques, le studio, le salon d'écoute, le cinéma
  { id: 'back-bar', name: tr('Arrière-bar', 'Back bar'), category: 'party', model: 'back-bar', mount: 'floor', variants: LENGTHS },
  {
    id: 'bar-counter', name: tr('Comptoir de bar', 'Bar counter'), category: 'party', model: 'bar-counter', mount: 'floor', variants: LENGTHS,
    interact: tr('Un comptoir comme chez Jacques. Il ne manque plus que Jacques.', 'A counter just like Jacques\'s. All it needs is Jacques.'),
  },
  {
    id: 'bar-stool', name: tr('Tabouret de bar en cuir', 'Leather bar stool'), category: 'party', model: 'bar-stool', mount: 'floor',
    variants: [{ id: 'brown', label: tr('Cuir fauve', 'Tan leather'), swatch: '#7a3b24' }, { id: 'black', label: tr('Cuir noir', 'Black leather'), swatch: '#1f1d1f' }],
  },
  { id: 'bar-table', name: tr('Table de bistro', 'Bistro table'), category: 'party', model: 'bar-table', mount: 'floor', label: () => '' },
  { id: 'bar-chair', name: tr('Chaise de bistro', 'Bistro chair'), category: 'party', model: 'bar-chair', mount: 'floor' },
  { id: 'popcorn-machine', name: tr('Machine à pop-corn', 'Popcorn machine'), category: 'party', model: 'popcorn-machine', mount: 'floor', interact: tr('Pop ! Pop ! Le pop-corn saute plus haut en gravité réduite.', 'Pop! Pop! Popcorn jumps higher in low gravity.') },
  {
    id: 'vending-machine', name: tr('Distributeur', 'Vending machine'), category: 'party', model: 'vending-machine', mount: 'floor', action: tr('Acheter', 'Buy'),
    interact: tr('Vous achetez une barre chocolatée. Elle reste coincée. Évidemment.', 'You buy a chocolate bar. It gets stuck. Of course.'),
  },
  {
    id: 'cinema-row', name: tr('Fauteuils de cinéma', 'Cinema seats'), category: 'party', model: 'cinema-row', mount: 'floor',
    variants: [{ id: 'red', label: tr('Velours rouge', 'Red velvet'), swatch: '#8a1d2a' }, { id: 'blue', label: tr('Velours bleu nuit', 'Midnight blue velvet'), swatch: '#243a6b' }],
  },
  { id: 'studio-table', name: tr('Table de studio radio', 'Radio studio desk'), category: 'party', model: 'studio-table', mount: 'floor' },
  { id: 'studio-chair', name: tr('Fauteuil de studio', 'Studio chair'), category: 'party', model: 'studio-chair', mount: 'floor' },
  { id: 'podcast-console', name: tr('Poste d\'écoute', 'Listening station'), category: 'party', model: 'podcast-console', mount: 'floor' },
  {
    id: 'acoustic-panel', name: tr('Mousse acoustique', 'Acoustic foam'), category: 'party', model: 'acoustic-panel', mount: 'wall',
    variants: [{ id: 'charcoal', label: tr('Anthracite', 'Charcoal'), swatch: '#2c2f36' }, { id: 'orange', label: 'Orange', swatch: '#b85c1c' }, { id: 'slate', label: tr('Ardoise', 'Slate'), swatch: '#3b4454' }],
  },
  {
    id: 'headphone-stand', name: tr('Casque sur pied', 'Headphones on a stand'), category: 'tech', model: 'headphone-stand', mount: 'top',
    variants: [{ id: 'orange', label: 'Orange', swatch: '#ff8a1c' }, { id: 'navy', label: tr('Marine', 'Navy'), swatch: '#34507a' }, { id: 'teal', label: tr('Bleu canard', 'Teal'), swatch: '#3f8f8c' }, { id: 'cream', label: tr('Crème', 'Cream'), swatch: '#e9dcc4' }],
  },
  { id: 'headphone-rack', name: tr('Porte-casques', 'Headphone rack'), category: 'tech', model: 'headphone-rack', mount: 'wall' },
  { id: 'floor-cushion', name: tr('Coussin de sol', 'Floor cushion'), category: 'living', model: 'floor-cushion', mount: 'floor', variants: fabrics('plum') },

  // --- Jeux : les tables de jeu du salon
  { id: 'holo-draughts', name: tr('Dames holographiques', 'Holographic draughts'), category: 'arcade', model: 'holo-draughts', mount: 'floor' },
  { id: 'guardian-connect', name: tr('Puissance 4 des Gardiens', 'Guardian Connect'), category: 'arcade', model: 'guardian-connect', mount: 'floor' },
  { id: 'imperial-chess', name: tr('Échecs impériaux', 'Imperial chess'), category: 'arcade', model: 'imperial-chess', mount: 'floor' },

  // --- Atelier : la cale
  { id: 'workbench', name: tr('Établi', 'Workbench'), category: 'workshop', model: 'workbench', mount: 'floor' },
  { id: 'engineer-bench', name: tr('Établi d\'ingénieur', 'Engineer\'s bench'), category: 'workshop', model: 'engineer-bench', mount: 'floor', interact: tr('Un établi digne de Felicity Farseer. Il manque juste les méta-alliages.', 'A bench worthy of Felicity Farseer. Only the meta-alloys are missing.') },
  { id: 'tool-rack', name: tr('Servante d\'outils', 'Tool trolley'), category: 'workshop', model: 'tool-rack', mount: 'floor' },
  { id: 'welder', name: tr('Poste à souder', 'Welding station'), category: 'workshop', model: 'welder', mount: 'floor' },
  { id: 'drums', name: tr('Fûts', 'Drums'), category: 'workshop', model: 'drums', mount: 'floor' },
  { id: 'work-lamp', name: tr('Lampe de chantier', 'Work light'), category: 'workshop', model: 'work-lamp', mount: 'floor', light: { color: '#fff1d0', intensity: 0.9, at: [0, 0.9, 0.1], priority: 3 } },
  { id: 'tire-stack', name: tr('Pneus de SRV', 'SRV tyres'), category: 'workshop', model: 'tire-stack', mount: 'floor', surface: 0.34 },
  { id: 'mining-laser', name: tr('Laser minier', 'Mining laser'), category: 'workshop', model: 'mining-laser', mount: 'floor' },
  { id: 'scrap-pile', name: tr('Tas de ferraille', 'Scrap pile'), category: 'workshop', model: 'scrap-pile', mount: 'floor' },
  { id: 'ore-pile', name: tr('Tas de minerai', 'Ore pile'), category: 'workshop', model: 'ore-pile', mount: 'floor', interact: tr('De la painite ! Non, de la bauxite. Mais de très belle bauxite.', 'Painite! No, bauxite. But very nice bauxite.') },
  { id: 'repair-lift', name: tr('Pont élévateur', 'Vehicle lift'), category: 'workshop', model: 'repair-lift', mount: 'floor' },
  { id: 'flare-crate', name: tr('Caisse de fusées', 'Flare crate'), category: 'workshop', model: 'flare-crate', mount: 'floor' },
  { id: 'cones', name: tr('Cônes de chantier', 'Traffic cones'), category: 'workshop', model: 'cones', mount: 'floor' },
  {
    id: 'works-sign', name: tr('Panneau de chantier', 'Works sign'), category: 'workshop', model: 'works-sign', mount: 'floor',
    variants: Object.entries(SIGNS).map(([id, label]) => ({ id, label })), label: (v) => SIGNS[v ?? ''] ?? SIGNS.soon,
  },
  { id: 'scaffold', name: tr('Échafaudage', 'Scaffolding'), category: 'workshop', model: 'scaffold', mount: 'floor' },
  { id: 'tarp-crates', name: tr('Caisses bâchées', 'Tarped crates'), category: 'workshop', model: 'tarp-crates', mount: 'floor' },
  { id: 'emergency-lamp', name: tr('Gyrophare de secours', 'Emergency beacon'), category: 'workshop', model: 'emergency-lamp', mount: 'wall', light: { color: '#ff5a2a', intensity: 0.6, at: [0, 0.86, 0.1], flicker: 'neon', priority: 5 } },
  { id: 'bio-sign', name: tr('Panneau « Danger biologique »', 'Biohazard sign'), category: 'workshop', model: 'bio-sign', mount: 'wall' },

  // --- Infirmerie : celle de Betty
  { id: 'med-bed', name: tr('Lit médical', 'Medical bed'), category: 'medical', model: 'med-bed', mount: 'floor', label: () => '' },
  { id: 'body-scan', name: tr('Scanner corporel', 'Body scanner'), category: 'medical', model: 'body-scan', mount: 'floor' },
  { id: 'nurse-station', name: tr('Poste de soins', 'Nurses\' station'), category: 'medical', model: 'nurse-station', mount: 'floor' },
  { id: 'med-cabinet', name: tr('Armoire à médicaments', 'Medicine cupboard'), category: 'medical', model: 'med-cabinet', mount: 'floor' },
  { id: 'med-fridge', name: tr('Réfrigérateur médical', 'Medical fridge'), category: 'medical', model: 'med-fridge', mount: 'floor' },
  { id: 'iv-stand', name: tr('Pied à perfusion', 'Drip stand'), category: 'medical', model: 'iv-stand', mount: 'floor' },
  { id: 'wheelchair', name: tr('Fauteuil roulant', 'Wheelchair'), category: 'medical', model: 'wheelchair', mount: 'floor' },
  { id: 'med-scale', name: tr('Toise et balance', 'Height and weight scale'), category: 'medical', model: 'med-scale', mount: 'floor' },
  { id: 'med-sink', name: tr('Lavabo médical', 'Medical basin'), category: 'medical', model: 'med-sink', mount: 'floor' },
  { id: 'xray-board', name: tr('Négatoscope', 'X-ray viewer'), category: 'medical', model: 'xray-board', mount: 'wall', interact: tr('Une radio de bras cassé. Signé : « Chute d\'échelle en gravité nulle, 3310 ».', 'An X-ray of a broken arm. Signed: “Fell off a ladder in zero-g, 3310”.') },
  { id: 'eye-chart', name: tr('Échelle d\'acuité', 'Eye chart'), category: 'medical', model: 'eye-chart', mount: 'wall', action: tr('Lire', 'Read'), interact: tr('E… O7… Vous lisez tout jusqu\'à la dernière ligne. Betty serait fière.', 'E… O7… You read right down to the last line. Betty would be proud.') },
  { id: 'defibrillator', name: tr('Défibrillateur', 'Defibrillator'), category: 'medical', model: 'defibrillator', mount: 'wall' },
  { id: 'med-poster', name: tr('Affiche de prévention', 'Health poster'), category: 'medical', model: 'med-poster', mount: 'wall' },
]
