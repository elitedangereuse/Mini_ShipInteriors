import { tr } from '../i18n'
import type { CatalogEntry } from './catalog'
import { APPLIANCE_COLORS, fabrics, FUR_COLORS, METAL_FINISHES, PORCELAIN_COLORS, WOOD_FINISHES, type Variant } from './variants'

/*
 * Le Furniture Kit de Kenney dans le catalogue (cf. src/furniture/kenney.ts) : de quoi se faire
 * une salle de bain, une cuisine, un salon et une chambre comme à la maison… à 22 000 al de la
 * maison. Les places où l'on s'assoit ou s'allonge sont dans src/seats.ts.
 */

const woods = (first = 'oak'): Variant[] => [WOOD_FINISHES.find((w) => w.id === first)!, ...WOOD_FINISHES.filter((w) => w.id !== first)]

/** Pots des plantes du kit : les essences et laques, en commençant par la terre cuite. */
const POTS = woods('terracotta')

/** Tapis du kit : les tissus, en commençant par une teinte chaude. */
const RUG = fabrics('terracotta')

/**
 * Nappes des tables du kit (la teinte, sous l'essence du bois) : la nappe d'origine, la première,
 * ne s'écrit pas dans la variante posée (cf. joinVariant) ; on la redonne au constructeur.
 */
const CLOTHS = fabrics('terracotta')
const clothLabel = (variant: string | undefined) => {
  const [wood, cloth] = (variant ?? '').split(':')
  return `${wood}:${cloth ?? CLOTHS[0].id}`
}

export const HOME_ENTRIES: CatalogEntry[] = [
  // --- Salle de bain
  {
    id: 'k-toilet', name: tr('Toilettes', 'Toilet'), category: 'bath', model: 'k-toilet', mount: 'floor', variants: PORCELAIN_COLORS,
    interact: [
      tr('Toilettes : chasse d\'eau à recyclage intégral. Mieux vaut ne pas trop y penser.', 'Toilet: full-cycle water recycling. Best not to think about it too much.'),
      tr('Une étiquette : « Ne pas utiliser pendant un saut FSD. » Quelqu\'un a écrit dessous : « trop tard ».', 'A label: “Do not use during an FSD jump.” Someone has written underneath: “too late”.'),
    ],
  },
  { id: 'k-toilet-square', name: tr('Toilettes design', 'Designer toilet'), category: 'bath', model: 'k-toilet-square', mount: 'floor', variants: PORCELAIN_COLORS },
  {
    id: 'k-bathtub', name: tr('Baignoire', 'Bathtub'), category: 'bath', model: 'k-bathtub', mount: 'floor', variants: PORCELAIN_COLORS, action: tr('Prendre un bain', 'Take a bath'),
    interact: [
      tr('Un bain chaud dans l\'espace : le luxe ultime. L\'eau, elle, a déjà fait trois fois le tour du vaisseau.', 'A hot bath in space: the ultimate luxury. The water has already been round the ship three times.'),
      tr('Vous faites des bulles. Quelque part, un ingénieur du recyclage soupire.', 'You blow bubbles. Somewhere, a recycling engineer sighs.'),
    ],
  },
  {
    id: 'k-shower', name: tr('Cabine de douche', 'Shower cubicle'), category: 'bath', model: 'k-shower', mount: 'floor', variants: PORCELAIN_COLORS,
    interact: tr('Douche : trois minutes d\'eau chaude, pas une de plus. Le chronomètre ne pardonne pas.', 'Shower: three minutes of hot water, not a second more. The timer is merciless.'),
  },
  { id: 'k-shower-round', name: tr('Douche d\'angle', 'Corner shower'), category: 'bath', model: 'k-shower-round', mount: 'floor', variants: PORCELAIN_COLORS },
  { id: 'k-bathroom-sink', name: tr('Lavabo sur colonne', 'Pedestal basin'), category: 'bath', model: 'k-bathroom-sink', mount: 'floor', variants: PORCELAIN_COLORS },
  { id: 'k-bathroom-sink-square', name: tr('Lavabo carré', 'Square basin'), category: 'bath', model: 'k-bathroom-sink-square', mount: 'floor', variants: PORCELAIN_COLORS },
  { id: 'k-bathroom-vanity', name: tr('Meuble vasque', 'Vanity unit'), category: 'bath', model: 'k-bathroom-vanity', mount: 'floor', variants: woods() },
  {
    id: 'k-bathroom-mirror', name: tr('Miroir', 'Mirror'), category: 'bath', model: 'k-bathroom-mirror', mount: 'wall', variants: woods(), action: tr('Se regarder', 'Look'),
    interact: [
      tr('Vous vous recoiffez. Le Holo-Me ferait mieux, mais c\'est moins satisfaisant.', 'You fix your hair. The Holo-Me would do better, but it\'s less satisfying.'),
      tr('Miroir, mon beau miroir… Qui est le meilleur pilote de ce vaisseau ? Le miroir reste poli.', 'Mirror, mirror… who is the finest pilot on this ship? The mirror stays polite.'),
    ],
  },
  { id: 'k-bathroom-cabinet', name: tr('Armoire à pharmacie', 'Medicine cabinet'), category: 'bath', model: 'k-bathroom-cabinet', mount: 'wall', variants: woods() },
  {
    id: 'k-washer', name: tr('Lave-linge', 'Washing machine'), category: 'bath', model: 'k-washer', mount: 'floor', variants: APPLIANCE_COLORS, surface: 0.587,
    interact: tr('Lave-linge : programme « Combinaison de vol, taches de caféine ». 90 minutes.', 'Washing machine: “Flight suit, caffeine stains” cycle. 90 minutes.'),
  },
  { id: 'k-dryer', name: tr('Sèche-linge', 'Tumble dryer'), category: 'bath', model: 'k-dryer', mount: 'floor', variants: APPLIANCE_COLORS, surface: 0.587 },
  { id: 'k-washer-dryer', name: tr('Colonne lave-linge', 'Stacked washer-dryer'), category: 'bath', model: 'k-washer-dryer', mount: 'floor', variants: APPLIANCE_COLORS },
  { id: 'k-trashcan', name: tr('Poubelle', 'Bin'), category: 'bath', model: 'k-trashcan', mount: 'floor', variants: METAL_FINISHES },
  { id: 'k-bath-mat', name: tr('Paillasson', 'Doormat'), category: 'rugs', model: 'k-bath-mat', mount: 'flat' },

  // --- Cuisine
  {
    id: 'k-fridge', name: tr('Réfrigérateur', 'Fridge'), category: 'kitchen', model: 'k-fridge', mount: 'floor', variants: APPLIANCE_COLORS, surface: 0.966,
    action: tr('Ouvrir', 'Open'),
    interact: [
      tr('Réfrigérateur : du lait de Lave, trois yaourts périmés depuis 3309, et un Brandy de Lave « pour les grandes occasions ».', 'Fridge: Lave milk, three yoghurts past their date since 3309, and a Lavian Brandy “for special occasions”.'),
      tr('Vous refermez la porte. Vous la rouvrez. Toujours rien de nouveau.', 'You close the door. You open it again. Still nothing new.'),
    ],
  },
  { id: 'k-fridge-large', name: tr('Réfrigérateur américain', 'American fridge'), category: 'kitchen', model: 'k-fridge-large', mount: 'floor', variants: APPLIANCE_COLORS, surface: 0.966 },
  { id: 'k-fridge-small', name: tr('Petit réfrigérateur', 'Small fridge'), category: 'kitchen', model: 'k-fridge-small', mount: 'floor', variants: APPLIANCE_COLORS, surface: 0.72 },
  {
    id: 'k-stove', name: tr('Cuisinière à gaz', 'Gas cooker'), category: 'kitchen', model: 'k-stove', mount: 'floor', variants: woods(), action: tr('Cuisiner', 'Cook'),
    interact: [
      tr('Vous faites sauter une omelette. Elle retombe au plafond : la gravité artificielle hésite.', 'You flip an omelette. It lands on the ceiling: the artificial gravity is having doubts.'),
      tr('Au menu : ragoût de Leesti, recette de Marcel. Vous en avez raté la moitié.', 'On the menu: Leesti stew, Marcel\'s recipe. You\'ve botched half of it.'),
    ],
  },
  { id: 'k-stove-electric', name: tr('Plaque vitrocéramique', 'Ceramic hob'), category: 'kitchen', model: 'k-stove-electric', mount: 'floor', variants: woods() },
  { id: 'k-kitchen-sink', name: tr('Évier', 'Kitchen sink'), category: 'kitchen', model: 'k-kitchen-sink', mount: 'floor', variants: woods() },
  { id: 'k-kitchen-cabinet', name: tr('Meuble bas', 'Base unit'), category: 'kitchen', model: 'k-kitchen-cabinet', mount: 'floor', variants: woods(), surface: 0.546 },
  { id: 'k-kitchen-drawers', name: tr('Meuble à tiroirs', 'Drawer unit'), category: 'kitchen', model: 'k-kitchen-drawers', mount: 'floor', variants: woods(), surface: 0.546 },
  { id: 'k-kitchen-corner', name: tr('Meuble d\'angle', 'Corner unit'), category: 'kitchen', model: 'k-kitchen-corner', mount: 'floor', variants: woods(), surface: 0.546 },
  { id: 'k-kitchen-upper', name: tr('Meuble haut', 'Wall cupboard'), category: 'kitchen', model: 'k-kitchen-upper', mount: 'wall', variants: woods() },
  { id: 'k-kitchen-upper-double', name: tr('Meuble haut double', 'Double wall cupboard'), category: 'kitchen', model: 'k-kitchen-upper-double', mount: 'wall', variants: woods() },
  { id: 'k-hood', name: tr('Hotte', 'Cooker hood'), category: 'kitchen', model: 'k-hood', mount: 'wall', variants: APPLIANCE_COLORS },
  { id: 'k-kitchen-bar', name: tr('Comptoir', 'Breakfast bar'), category: 'kitchen', model: 'k-kitchen-bar', mount: 'floor', variants: woods(), surface: 0.546 },
  { id: 'k-kitchen-bar-end', name: tr('Bout de comptoir', 'Bar end'), category: 'kitchen', model: 'k-kitchen-bar-end', mount: 'floor', variants: woods() },
  {
    id: 'k-microwave', name: tr('Micro-ondes', 'Microwave'), category: 'kitchen', model: 'k-microwave', mount: 'top', variants: APPLIANCE_COLORS, action: tr('Réchauffer', 'Heat up'),
    interact: tr('Ding ! Votre ration de survie est chaude à l\'extérieur et gelée au milieu. Comme toujours.', 'Ding! Your survival ration is hot on the outside and frozen in the middle. As always.'),
  },
  {
    id: 'k-coffee-machine', name: tr('Machine à café', 'Coffee machine'), category: 'kitchen', model: 'k-coffee-machine', mount: 'top', variants: APPLIANCE_COLORS, action: tr('Se servir un café', 'Pour a coffee'),
    interact: [
      tr('Un café noir, serré. Le vrai carburant des pilotes.', 'A strong black coffee. The real fuel of pilots.'),
      tr('La machine gargouille comme un FSD qui charge. Le café arrive trois minutes plus tard.', 'The machine gurgles like a charging FSD. The coffee arrives three minutes later.'),
    ],
  },
  { id: 'k-toaster', name: tr('Grille-pain', 'Toaster'), category: 'kitchen', model: 'k-toaster', mount: 'top', variants: APPLIANCE_COLORS, interact: tr('Le grille-pain éjecte deux tartines. L\'une d\'elles atteint la vitesse de libération.', 'The toaster ejects two slices. One of them reaches escape velocity.') },
  { id: 'k-blender', name: tr('Blender', 'Blender'), category: 'kitchen', model: 'k-blender', mount: 'top', variants: APPLIANCE_COLORS },
  { id: 'k-bar-stool', name: tr('Tabouret de bar', 'Bar stool'), category: 'kitchen', model: 'k-bar-stool', mount: 'floor', variants: fabrics('terracotta'), tints: WOOD_FINISHES },
  { id: 'k-bar-stool-square', name: tr('Tabouret carré', 'Square stool'), category: 'kitchen', model: 'k-bar-stool-square', mount: 'floor', variants: fabrics('teal'), tints: WOOD_FINISHES },
  { id: 'k-dining-table', name: tr('Table de ferme', 'Farmhouse table'), category: 'kitchen', model: 'k-dining-table', mount: 'floor', variants: woods(), surface: 0.452 },
  { id: 'k-dining-table-cloth', name: tr('Table à nappe', 'Table with runner'), category: 'kitchen', model: 'k-dining-table-cloth', mount: 'floor', variants: woods(), tints: CLOTHS, label: clothLabel, surface: 0.452 },
  { id: 'k-table-cloth', name: tr('Table de cuisine', 'Kitchen table'), category: 'kitchen', model: 'k-table-cloth', mount: 'floor', variants: woods(), tints: CLOTHS, label: clothLabel, surface: 0.425 },
  { id: 'k-round-table', name: tr('Table ronde', 'Round table'), category: 'kitchen', model: 'k-round-table', mount: 'floor', variants: woods(), surface: 0.458 },

  // --- Salon
  { id: 'k-lounge-sofa', name: tr('Canapé moelleux', 'Plush sofa'), category: 'living', model: 'k-lounge-sofa', mount: 'floor', variants: fabrics('rose') },
  { id: 'k-lounge-sofa-long', name: tr('Canapé méridienne', 'Chaise sofa'), category: 'living', model: 'k-lounge-sofa-long', mount: 'floor', variants: fabrics('rose') },
  {
    id: 'k-lounge-sofa-corner', name: tr('Canapé d\'angle', 'Corner sofa'), category: 'living', model: 'k-lounge-sofa-corner', mount: 'floor', variants: fabrics('rose'),
    interact: tr('Canapé d\'angle : assez de places pour toute une escadrille. Les miettes y sont déjà.', 'Corner sofa: enough seats for a whole wing. The crumbs are already there.'),
  },
  { id: 'k-ottoman', name: tr('Repose-pieds', 'Footstool'), category: 'living', model: 'k-ottoman', mount: 'floor', variants: fabrics('rose') },
  { id: 'k-lounge-chair', name: tr('Fauteuil moelleux', 'Plush armchair'), category: 'living', model: 'k-lounge-chair', mount: 'floor', variants: fabrics('rose') },
  {
    id: 'k-lounge-chair-relax', name: tr('Fauteuil relax', 'Recliner'), category: 'living', model: 'k-lounge-chair-relax', mount: 'floor', variants: fabrics('mustard'),
    interact: tr('Fauteuil relax : position « supercroisière », dossier incliné, pieds en l\'air.', 'Recliner: “supercruise” setting, back tilted, feet up.'),
  },
  { id: 'k-design-chair', name: tr('Fauteuil design', 'Designer armchair'), category: 'living', model: 'k-design-chair', mount: 'floor', variants: fabrics('navy') },
  { id: 'k-design-sofa', name: tr('Canapé design', 'Designer sofa'), category: 'living', model: 'k-design-sofa', mount: 'floor', variants: fabrics('navy') },
  { id: 'k-design-sofa-corner', name: tr('Grand canapé design', 'Large designer sofa'), category: 'living', model: 'k-design-sofa-corner', mount: 'floor', variants: fabrics('navy') },
  { id: 'k-coffee-table-glass', name: tr('Table basse en verre', 'Glass coffee table'), category: 'living', model: 'k-coffee-table-glass', mount: 'floor', variants: METAL_FINISHES, surface: 0.322 },
  { id: 'k-coffee-table-square', name: tr('Table basse carrée', 'Square coffee table'), category: 'living', model: 'k-coffee-table-square', mount: 'floor', variants: woods(), surface: 0.322 },
  { id: 'k-glass-table', name: tr('Table en verre', 'Glass table'), category: 'living', model: 'k-glass-table', mount: 'floor', variants: METAL_FINISHES, surface: 0.425 },
  { id: 'k-chair-modern', name: tr('Chaise moderne', 'Modern chair'), category: 'living', model: 'k-chair-modern', mount: 'floor', variants: fabrics('navy'), tints: METAL_FINISHES },
  { id: 'k-chair-modern-frame', name: tr('Chaise à armature', 'Frame chair'), category: 'living', model: 'k-chair-modern-frame', mount: 'floor', variants: fabrics('teal'), tints: METAL_FINISHES },
  { id: 'k-chair-rounded', name: tr('Chaise en bois', 'Wooden chair'), category: 'living', model: 'k-chair-rounded', mount: 'floor', variants: woods() },
  { id: 'k-desk-chair', name: tr('Chaise de bureau', 'Desk chair'), category: 'living', model: 'k-desk-chair', mount: 'floor', variants: fabrics('terracotta') },
  { id: 'k-low-bench', name: tr('Banquette basse', 'Low bench'), category: 'living', model: 'k-low-bench', mount: 'floor', variants: fabrics('sage'), tints: WOOD_FINISHES },
  { id: 'k-side-table-drawers', name: tr('Console à tiroirs', 'Drawer console'), category: 'living', model: 'k-side-table-drawers', mount: 'floor', variants: woods(), surface: 0.5 },
  { id: 'k-desk', name: tr('Bureau en bois', 'Wooden desk'), category: 'living', model: 'k-desk', mount: 'floor', variants: woods(), surface: 0.557 },
  { id: 'k-desk-corner', name: tr('Bureau d\'angle', 'Corner desk'), category: 'living', model: 'k-desk-corner', mount: 'floor', variants: woods() },
  { id: 'k-pillow', name: tr('Coussin', 'Cushion'), category: 'living', model: 'k-pillow', mount: 'top', variants: fabrics('mustard') },
  { id: 'k-pillow-long', name: tr('Grand coussin', 'Long cushion'), category: 'living', model: 'k-pillow-long', mount: 'top', variants: fabrics('teal') },

  // --- Écrans et consoles (le kit)
  { id: 'k-tv-cabinet', name: tr('Meuble télé', 'TV stand'), category: 'tech', model: 'k-tv-cabinet', mount: 'floor', variants: woods(), surface: 0.419 },
  { id: 'k-tv-cabinet-doors', name: tr('Meuble télé à portes', 'TV cabinet'), category: 'tech', model: 'k-tv-cabinet-doors', mount: 'floor', variants: woods(), surface: 0.419 },
  {
    id: 'k-tv-modern', name: tr('Télévision plate', 'Flat-screen TV'), category: 'tech', model: 'k-tv-modern', mount: 'top', action: tr('Regarder', 'Watch'),
    interact: tr('Écran plat : 4 000 chaînes, et toujours rien à regarder à part le replay du dernier Buckyball Run.', 'Flat screen: 4,000 channels, and still nothing on except a replay of the last Buckyball Run.'),
  },
  { id: 'k-tv-vintage', name: tr('Petit téléviseur', 'Small TV set'), category: 'tech', model: 'k-tv-vintage', mount: 'top', variants: woods() },
  { id: 'k-laptop', name: tr('Ordinateur portable', 'Laptop'), category: 'tech', model: 'k-laptop', mount: 'top', interact: tr('Le portable affiche Inara. Onze onglets de routes commerciales ouverts.', 'The laptop shows Inara. Eleven trade-route tabs open.') },
  { id: 'k-computer-screen', name: tr('Écran d\'ordinateur', 'Computer monitor'), category: 'tech', model: 'k-computer-screen', mount: 'top' },
  { id: 'k-keyboard', name: tr('Clavier', 'Keyboard'), category: 'tech', model: 'k-keyboard', mount: 'top' },
  { id: 'k-speaker-tall', name: tr('Enceinte colonne', 'Tower speaker'), category: 'tech', model: 'k-speaker-tall', mount: 'floor', variants: woods('graphite') },
  { id: 'k-speaker-small', name: tr('Petite enceinte', 'Bookshelf speaker'), category: 'tech', model: 'k-speaker-small', mount: 'top', variants: woods('graphite') },

  // --- Lumières
  { id: 'k-lamp-round-floor', name: tr('Lampadaire rond', 'Round floor lamp'), category: 'light', model: 'k-lamp-round-floor', mount: 'floor', variants: METAL_FINISHES, light: { color: '#ffe0b0', intensity: 1, at: [0, 0.9, 0], priority: 3 } },
  { id: 'k-lamp-square-floor', name: tr('Lampadaire carré', 'Square floor lamp'), category: 'light', model: 'k-lamp-square-floor', mount: 'floor', variants: METAL_FINISHES, light: { color: '#ffe0b0', intensity: 1, at: [0, 0.9, 0], priority: 3 } },
  { id: 'k-lamp-round-table', name: tr('Lampe de chevet', 'Bedside lamp'), category: 'light', model: 'k-lamp-round-table', mount: 'top', variants: METAL_FINISHES, light: { color: '#ffe0b0', intensity: 0.55, at: [0, 0.28, 0], priority: 5 } },
  { id: 'k-lamp-square-table', name: tr('Lampe carrée', 'Square lamp'), category: 'light', model: 'k-lamp-square-table', mount: 'top', variants: METAL_FINISHES, light: { color: '#ffe0b0', intensity: 0.55, at: [0, 0.26, 0], priority: 5 } },
  { id: 'k-lamp-wall', name: tr('Applique design', 'Designer wall light'), category: 'light', model: 'k-lamp-wall', mount: 'wall', light: { color: '#ffe0b0', intensity: 0.7, at: [0, 0.7, 0.2], priority: 4 } },
  {
    id: 'k-ceiling-fan', name: tr('Ventilateur de plafond', 'Ceiling fan'), category: 'light', model: 'k-ceiling-fan', mount: 'floor', variants: woods(), solid: false,
    light: { color: '#ffe6b8', intensity: 0.9, at: [0, 0.78, 0], priority: 3 },
    interact: tr('Ventilateur de plafond : il brasse l\'air recyclé. Il a l\'air plus frais, promis.', 'Ceiling fan: it stirs the recycled air. It feels fresher, honest.'),
  },

  // --- Plantes
  { id: 'k-potted-plant', name: tr('Plante en pot', 'Potted plant'), category: 'plants', model: 'k-potted-plant', mount: 'floor', variants: POTS },
  { id: 'k-plant-small-1', name: tr('Petite plante', 'Small plant'), category: 'plants', model: 'k-plant-small-1', mount: 'top', variants: POTS },
  { id: 'k-plant-small-2', name: tr('Plante touffue', 'Bushy plant'), category: 'plants', model: 'k-plant-small-2', mount: 'top', variants: POTS },
  { id: 'k-plant-small-3', name: tr('Jeune pousse', 'Seedling'), category: 'plants', model: 'k-plant-small-3', mount: 'top', variants: POTS },

  // --- Rangements
  { id: 'k-bookcase-open', name: tr('Étagère haute', 'Tall shelf'), category: 'storage', model: 'k-bookcase-open', mount: 'floor', variants: woods(), surface: 0.935 },
  { id: 'k-bookcase-low', name: tr('Étagère basse', 'Low shelf'), category: 'storage', model: 'k-bookcase-low', mount: 'floor', variants: woods(), surface: 0.407 },
  { id: 'k-bookcase-doors', name: tr('Armoire', 'Wardrobe'), category: 'storage', model: 'k-bookcase-doors', mount: 'floor', variants: woods(), surface: 0.935 },
  { id: 'k-bookcase-wide', name: tr('Bibliothèque large', 'Wide bookcase'), category: 'storage', model: 'k-bookcase-wide', mount: 'floor', variants: woods(), surface: 0.869 },
  { id: 'k-coat-rack', name: tr('Portemanteau', 'Coat stand'), category: 'storage', model: 'k-coat-rack', mount: 'floor', variants: woods() },
  { id: 'k-coat-rack-wall', name: tr('Patère murale', 'Wall coat rack'), category: 'storage', model: 'k-coat-rack-wall', mount: 'wall', variants: woods() },
  {
    id: 'k-box-closed', name: tr('Carton', 'Cardboard box'), category: 'storage', model: 'k-box-closed', mount: 'floor', surface: 0.337,
    interact: tr('Carton de déménagement : « Affaires de Colonia — ne pas ouvrir avant l\'arrivée ». Ça fait deux ans.', 'Moving box: “Colonia stuff — do not open before arrival”. That was two years ago.'),
  },
  {
    id: 'k-box-open', name: tr('Carton ouvert', 'Open box'), category: 'storage', model: 'k-box-open', mount: 'floor',
    interact: tr('Carton ouvert. Comète a déjà élu domicile dedans. Enfin, elle aimerait.', 'An open box. Comète has already moved in. Well, she\'d like to.'),
  },

  // --- Chambre
  { id: 'k-bed-double', name: tr('Lit double', 'Double bed'), category: 'rest', model: 'k-bed-double', mount: 'floor', variants: fabrics('rose'), tints: WOOD_FINISHES },
  { id: 'k-bed-single', name: tr('Lit simple', 'Single bed'), category: 'rest', model: 'k-bed-single', mount: 'floor', variants: fabrics('teal'), tints: WOOD_FINISHES },
  { id: 'k-bed-bunk', name: tr('Lits superposés en bois', 'Wooden bunk beds'), category: 'rest', model: 'k-bed-bunk', mount: 'floor', variants: fabrics('navy'), tints: WOOD_FINISHES },
  { id: 'k-nightstand', name: tr('Chevet', 'Nightstand'), category: 'rest', model: 'k-nightstand', mount: 'floor', variants: woods(), surface: 0.368 },
  { id: 'k-nightstand-drawers', name: tr('Chevet à tiroirs', 'Nightstand with drawers'), category: 'rest', model: 'k-nightstand-drawers', mount: 'floor', variants: woods(), surface: 0.368 },
  {
    id: 'k-bear', name: tr('Ours en peluche', 'Teddy bear'), category: 'rest', model: 'k-bear', mount: 'top', variants: FUR_COLORS, action: tr('Câliner', 'Cuddle'),
    interact: tr('Nounours : il a fait le tour de la bulle avec vous. Il n\'a jamais rien dit à personne.', 'Teddy: he\'s been all round the bubble with you. He has never told a soul.'),
  },
  {
    id: 'k-bear-giant', name: tr('Nounours géant', 'Giant teddy bear'), category: 'rest', model: 'k-bear-giant', mount: 'floor', variants: FUR_COLORS, action: tr('Câliner', 'Cuddle'),
    interact: tr('Nounours géant, gagné à la pince à peluches après 212 essais. Il en valait la peine.', 'Giant teddy, won at the claw machine after 212 attempts. Worth every one.'),
  },

  // --- Tapis
  { id: 'k-rug-rectangle', name: tr('Tapis rectangle', 'Rectangular rug'), category: 'rugs', model: 'k-rug-rectangle', mount: 'flat', variants: RUG },
  { id: 'k-rug-rounded', name: tr('Tapis ovale', 'Oval rug'), category: 'rugs', model: 'k-rug-rounded', mount: 'flat', variants: RUG },
  { id: 'k-rug-square', name: tr('Tapis carré', 'Square rug'), category: 'rugs', model: 'k-rug-square', mount: 'flat', variants: RUG },
  { id: 'k-rug-disc', name: tr('Tapis disque', 'Disc rug'), category: 'rugs', model: 'k-rug-disc', mount: 'flat', variants: RUG },
]
