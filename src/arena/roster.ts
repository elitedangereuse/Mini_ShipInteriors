import { tr } from '../i18n'
import type { IconName } from '../icons'
import type { CharacterId } from '../../shared/arena.js'

/*
 * Qui sont les personnages de CMDR Arena, en quelques mots : leur nom, leur rôle, leur arme, leur
 * couleur, leur humour. Rien d'autre ici, pour que le décor du lobby (le tableau des personnages,
 * cf. src/furniture/arena.ts) puisse les lire sans charger leurs modèles (cf. characters.ts).
 */

export interface Identity {
  /** Son nom, et son nom complet (« Sergent Rourke »). */
  name: string
  full: string
  role: string
  /** Le nom de son arme. */
  weapon: string
  /** Une ligne d'humour, sur sa fiche au terminal. */
  quip: string
  /** Sa couleur : sa fiche, sa pastille, le liseré de son arme. */
  color: string
  icon: IconName
}

export const ROSTER: Record<CharacterId, Identity> = {
  rourke: {
    name: 'Rourke', full: tr('Sergent Rourke', 'Sergeant Rourke'), role: tr('Soldat polyvalent', 'All-round soldier'), weapon: tr('Mitraillette de service', 'Service SMG'),
    quip: tr('Il fait sa ronde jusque dans l\'arène. Rien à signaler, sauf vous.', 'He walks his beat all the way into the arena. Nothing to report, except you.'),
    color: '#4fc3ff', icon: 'shield-warning',
  },
  marcel: {
    name: 'Marcel', full: tr('Chef Marcel', 'Chef Marcel'), role: tr('Tank à dégâts de zone', 'Splash tank'), weapon: tr('Lance-tomates', 'Tomato launcher'),
    quip: tr('Les tomates du jardin, la sauce du chef. Réclamations au sergent Rourke.', 'Tomatoes from the garden, sauce by the chef. Complaints to Sergeant Rourke.'),
    color: '#ff5a3c', icon: 'chef-hat',
  },
  nico: {
    name: tr('Nico et Boulon', 'Nico & Bolt'), full: tr('Nico et Boulon', 'Nico & Bolt'), role: tr('Glass cannon mobile', 'Mobile glass cannon'), weapon: tr('Fusil laser', 'Laser rifle'),
    quip: tr('Nico vise, Boulon scanne les buissons. Ni l\'un ni l\'autre n\'encaisse.', 'Nico aims, Bolt scans the bushes. Neither of them can take a hit.'),
    color: '#ff9a2e', icon: 'rocket',
  },
  betty: {
    name: 'Betty', full: tr('Betty, l\'infirmière', 'Betty the nurse'), role: tr('Soutien et soigneuse', 'Support healer'), weapon: tr('Pistolet à seringues', 'Syringe gun'),
    quip: tr('Une seringue pour les siens, une autre pour les autres. Elle ne dit pas laquelle est laquelle.', 'One syringe for her side, another for the rest. She won\'t say which is which.'),
    color: '#ff7bc0', icon: 'first-aid-kit',
  },
  capucine: {
    name: 'Capucine', full: tr('Capucine, la jardinière', 'Capucine the gardener'), role: tr('Contrôle de zone', 'Area control'), weapon: tr('Graines carnivores', 'Carnivorous seeds'),
    quip: tr('Elle plante, ça pousse, ça mord. Arrosage déconseillé.', 'She plants, it grows, it bites. Watering not advised.'),
    color: '#8ad94a', icon: 'potted-plant',
  },
  jacques: {
    name: 'Jacques', full: tr('Jacques, le barman', 'Jacques the bartender'), role: tr('Tank explosif', 'Explosive tank'), weapon: tr('Cocktails spéciaux', 'Special cocktails'),
    quip: tr('Le cocktail de la maison flambe au comptoir. Ici, il flambe partout.', 'The house cocktail is flambéed at the bar. Here, it flambés everywhere.'),
    color: '#b6ff3a', icon: 'robot',
  },
}
