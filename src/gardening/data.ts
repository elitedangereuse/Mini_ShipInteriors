import { ECONOMY } from '../economy/data'
import type { CropLook } from '../furniture/gardening'
import { EN, tr } from '../i18n'
import type { IconName } from '../icons'
import type { GardenTool } from '../../shared/gardening.js'

/*
 * Le jardinage, côté joueur : les noms et l'allure des cultures, des outils, des terreaux et des
 * engrais. Leurs chiffres (durées, prix, rendements) sont dans economy.json, section `gardening`,
 * et les règles de pousse dans shared/gardening.js.
 */

export const RULES = ECONOMY.gardening

export interface CropInfo {
  /** « Tomate », et ce qu'on en a quand on en a plusieurs : « tomates ». */
  name: string
  plural: string
  look: CropLook
  /** Couleur de ce qu'on récolte. */
  color: string
  /** Ce qu'en dit Capucine, sur son étal. */
  about: string
}

export const CROPS: Record<string, CropInfo> = {
  radish: { name: tr('Radis', 'Radish'), plural: tr('radis', 'radishes'), look: 'root', color: '#e0457a', about: tr('Vite semé, vite croqué. Parfait pour se faire la main.', 'Quick to sow, quick to crunch. Perfect for getting your hand in.') },
  lettuce: { name: tr('Laitue', 'Lettuce'), plural: tr('laitues', 'lettuces'), look: 'leafy', color: '#b6e07a', about: tr('Elle fane au premier Thargoïde qui passe. Sinon, elle est facile.', 'It wilts at the first passing Thargoid. Otherwise it\'s easy.') },
  carrot: { name: tr('Carotte', 'Carrot'), plural: tr('carottes', 'carrots'), look: 'root', color: '#f08a2a', about: tr('Marcel en met partout. Même dans le dessert.', 'Marcel puts them in everything. Even dessert.') },
  sunflower: { name: tr('Tournesol', 'Sunflower'), plural: tr('tournesols', 'sunflowers'), look: 'flower', color: '#ffd23c', about: tr('Il suit l\'étoile du système. Après un saut, il lui faut une minute.', 'It follows the system\'s star. After a jump it needs a minute.') },
  tomato: { name: tr('Tomate', 'Tomato'), plural: tr('tomates', 'tomatoes'), look: 'staked', color: '#e0453a', about: tr('Des cousines de Jameson. Donne-leur un nom, elles poussent mieux.', 'Jameson\'s cousins. Give them a name, they grow better.') },
  strawberry: { name: tr('Fraise', 'Strawberry'), plural: tr('fraises', 'strawberries'), look: 'bush', color: '#e8384f', about: tr('Il en manque toujours une ou deux à la récolte. Je ne dis pas qui.', 'One or two always go missing at harvest. I\'m not saying who.') },
  'fujin-tea': { name: tr('Thé de Fujin', 'Fujin tea'), plural: tr('feuilles de thé de Fujin', 'Fujin tea leaves'), look: 'leafy', color: '#7fc8a0', about: tr('On le cueille à l\'aube. À bord, l\'aube, c\'est quand tu veux.', 'Picked at dawn. Aboard, dawn is whenever you like.') },
  'ochoeng-chilli': { name: tr('Piment d\'Ochoeng', 'Ochoeng chilli'), plural: tr('piments d\'Ochoeng', 'Ochoeng chillies'), look: 'staked', color: '#ff5a1f', about: tr('Marcel en a goûté un cru. Il a parlé trois langues qu\'il ne connaît pas.', 'Marcel tried one raw. He spoke three languages he doesn\'t know.') },
  pumpkin: { name: tr('Citrouille', 'Pumpkin'), plural: tr('citrouilles', 'pumpkins'), look: 'gourd', color: '#f08a2a', about: tr('Elle prend son temps et toute la place. Comme un Type-9.', 'It takes its time and all the room. Like a Type-9.') },
  'achenar-rose': { name: tr('Rose d\'Achenar', 'Achenar rose'), plural: tr('roses d\'Achenar', 'Achenar roses'), look: 'flower', color: '#d83a7a', about: tr('La fleur des sénateurs. Susceptible, hors de prix, magnifique.', 'The senators\' flower. Touchy, overpriced, magnificent.') },
  'neritus-berry': { name: tr('Baie de Neritus', 'Neritus berry'), plural: tr('baies de Neritus', 'Neritus berries'), look: 'bush', color: '#7a5aff', about: tr('Rares, sucrées, et elles tachent les gants pour toujours.', 'Rare, sweet, and they stain your gloves forever.') },
  onionhead: { name: 'Onionhead', plural: tr('têtes d\'Onionhead', 'Onionhead heads'), look: 'flower', color: '#b27cff', about: tr('Pour la science. Et pour la cuisine de Marcel. Surtout pour la science.', 'For science. And for Marcel\'s cooking. Mostly for science.') },
}

/** Nom de la culture, même si une version plus récente du jeu en a ajouté une que celle-ci ignore. */
export const cropName = (id: string): string => CROPS[id]?.name ?? id

export const SOILS: Record<string, { name: string; about: string }> = {
  plain: { name: tr('Terre du bord', 'Ship\'s soil'), about: tr('Gratuite, et il y en a toujours. Récolte ordinaire.', 'Free, and there is always some. Ordinary harvest.') },
  rich: { name: tr('Terreau riche', 'Rich compost'), about: tr('Un sac par tuile préparée. Belle récolte.', 'One bag per tilled plot. Fine harvest.') },
  colonia: { name: tr('Terreau de Colonia', 'Colonia compost'), about: tr('Vingt-deux mille années-lumière de voyage. Récolte exceptionnelle.', 'Twenty-two thousand light years of travel. Exceptional harvest.') },
}

export const FERTS: Record<string, { name: string; about: string }> = {
  compost: { name: tr('Compost du bord', 'Ship\'s compost'), about: tr('Les soufflés ratés de Marcel. Pousse une fois et demie plus vite.', 'Marcel\'s failed soufflés. Grows one and a half times faster.') },
  bradbury: { name: tr('Engrais de Bradbury', 'Bradbury fertiliser'), about: tr('La recette de la tomate de la base. Pousse deux fois plus vite.', 'The base tomato\'s recipe. Grows twice as fast.') },
}

/** Les outils : leur nom à chaque niveau, leur icône, ce qu'ils font, et ce qu'apporte un meilleur. */
export const TOOLS: Record<GardenTool, { names: [string, string, string]; icon: IconName; does: string; better: string }> = {
  hoe: {
    names: [tr('Bêche', 'Spade'), tr('Bêche renforcée', 'Reinforced spade'), tr('Bêche de maître', 'Master\'s spade')],
    icon: 'shovel', does: tr('Préparer la terre, désherber', 'Till the soil, weed'), better: tr('Travaille la terre plus vite.', 'Works the soil faster.'),
  },
  trowel: {
    names: [tr('Plantoir', 'Dibber'), tr('Plantoir de précision', 'Precision dibber'), tr('Plantoir de maître', 'Master\'s dibber')],
    icon: 'grains', does: tr('Semer', 'Sow'), better: tr('Sème plus vite, et des graines plus rares.', 'Sows faster, and rarer seeds.'),
  },
  can: {
    names: [tr('Arrosoir', 'Watering can'), tr('Grand arrosoir', 'Large watering can'), tr('Arrosoir à réserve', 'Reservoir watering can')],
    icon: 'drop', does: tr('Arroser', 'Water'), better: tr('La terre reste humide plus longtemps.', 'The soil stays wet longer.'),
  },
  shears: {
    names: [tr('Sécateur', 'Secateurs'), tr('Sécateur affûté', 'Sharpened secateurs'), tr('Sécateur de maître', 'Master\'s secateurs')],
    icon: 'scissors', does: tr('Récolter', 'Harvest'), better: tr('Une unité de plus à chaque récolte.', 'One more unit at every harvest.'),
  },
}

/** Qualité d'une récolte (0 à 2), en étoiles et en toutes lettres. */
export const gradeStars = (grade: number): string => '★'.repeat(grade + 1)
export const GRADES = [tr('ordinaire', 'ordinary'), tr('belle', 'fine'), tr('exceptionnelle', 'exceptional')]

/** « 20 min », « 1 h 30 », « 12 h ». */
export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60), m = minutes % 60
  return m ? (EN ? `${h} h ${m} min` : `${h} h ${String(m).padStart(2, '0')}`) : `${h} h`
}
