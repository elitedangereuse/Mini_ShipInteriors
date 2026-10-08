import { tr } from '../i18n'
import type { CatalogEntry } from './catalog'
import type { Variant } from './variants'

/*
 * La catégorie « Récup » : ce qui traîne dans la gaine technique et la planque des Scavengers
 * de la cale (cf. src/furniture/scavengers.ts), proposé pour les quartiers. De la tuyauterie
 * qui fuit, une chaudière, des écrans cathodiques, des drones : du matériel de seconde main.
 * Les constructeurs sont ceux des deux pièces.
 */

/** Longueur d'une tuyauterie (le `label` du constructeur, en tuiles). */
const PIPE_LENGTHS: Variant[] = [
  { id: '1', label: tr('Courte (1 m)', 'Short (1 m)') },
  { id: '2', label: tr('Moyenne (2 m)', 'Medium (2 m)') },
  { id: '3', label: tr('Longue (3 m)', 'Long (3 m)') },
]

/** Textes des plaques émaillées, par variante. */
const PLATES: Record<string, string> = {
  danger: 'DANGER',
  steam: tr('VAPEUR', 'STEAM'),
  pressure: tr('HAUTE PRESSION', 'HIGH PRESSURE'),
  keep: tr('ACCÈS INTERDIT', 'KEEP OUT'),
  scavengers: 'SCAVENGERS',
}

export const JUNK_ENTRIES: CatalogEntry[] = [
  // --- La gaine technique
  {
    id: 'duct-pipes', name: tr('Tuyauterie de chaufferie', 'Boiler-room pipework'), category: 'junk', model: 'duct-pipes', mount: 'wall',
    variants: PIPE_LENGTHS, thumbnailVariant: '2',
  },
  {
    id: 'duct-leak', name: tr('Raccord qui fuit', 'Leaking joint'), category: 'junk', model: 'duct-leak', mount: 'wall',
    interact: tr('Un raccord fuit. Quelqu\'un l\'a réparé avec du ruban adhésif, puis a réparé le ruban adhésif avec du ruban adhésif.', 'A joint is leaking. Someone fixed it with tape, then fixed the tape with tape.'),
  },
  {
    id: 'duct-valve', name: tr('Vanne cadenassée', 'Padlocked valve'), category: 'junk', model: 'duct-valve', mount: 'wall', action: tr('Tourner', 'Turn'),
    interact: tr('Tu forces sur le volant. Il ne bouge pas. Le cadenas, lui, a l\'air neuf.', 'You strain at the wheel. It does not move. The padlock, on the other hand, looks brand new.'),
  },
  {
    id: 'duct-lamp', name: tr('Hublot au sodium', 'Sodium bulkhead light'), category: 'junk', model: 'duct-lamp', mount: 'wall',
    light: { color: '#ff9a3c', intensity: 0.9, at: [0, 0.84, 0.2], flicker: 'neon', priority: 2 },
  },
  {
    id: 'duct-sign', name: tr('Plaque émaillée', 'Enamel sign'), category: 'junk', model: 'duct-sign', mount: 'wall',
    variants: Object.entries(PLATES).map(([id, label]) => ({ id, label })), label: (v) => PLATES[v ?? 'danger'] ?? PLATES.danger,
  },
  {
    id: 'duct-fan', name: tr('Double ventilateur d\'extraction', 'Twin extraction fan'), category: 'junk', model: 'duct-fan', mount: 'wall',
    interact: tr('Extraction VT-03. L\'hélice de gauche tourne. Celle de droite y réfléchit.', 'Extraction VT-03. The left fan spins. The right one is thinking about it.'),
  },
  {
    id: 'duct-boiler', name: tr('Chaudière', 'Boiler'), category: 'junk', model: 'duct-boiler', mount: 'floor',
    interact: tr('Sur la porte du foyer, à la craie : « Ne pas éteindre. Personne ne sait la rallumer. »', 'Chalked on the firebox door: “Do not put out. Nobody knows how to relight it.”'),
    light: { color: '#ff6a1c', intensity: 0.8, at: [0, 0.3, 0.4], flicker: 'fire', priority: 2 },
  },
  { id: 'duct-grate', name: tr('Caillebotis sur braises', 'Grating over embers'), category: 'junk', model: 'duct-grate', mount: 'flat' },

  // --- La planque des Scavengers
  {
    id: 'scav-terminal', name: tr('Poste de Scavengers', 'Scavengers station'), category: 'junk', model: 'scav-terminal', mount: 'floor',
    action: tr('Jouer à Scavengers', 'Play Scavengers'), interact: tr('Le poste de pilotage des drones de l\'Erebus.', 'The Erebus drone control station.'),
    light: { color: '#00ff41', intensity: 0.7, at: [-0.08, 0.7, 0.4], priority: 3 },
  },
  {
    id: 'scav-aria', name: tr('Écran d\'ARIA', 'ARIA\'s screen'), category: 'junk', model: 'scav-aria', mount: 'wall', action: tr('Parler à ARIA', 'Talk to ARIA'),
    interact: [
      tr('ARIA : « Systèmes en ligne. Recherche d\'épaves abandonnées. » Son regard cyan te suit dans la pièce.', 'ARIA: “Systems online. Scanning for derelict ships.” Her cyan gaze follows you around the room.'),
      tr('ARIA : « J\'ai analysé ta décoration. Je ne ferai pas de commentaire. »', 'ARIA: “I have analysed your décor. I will not comment.”'),
      tr('ARIA : « Mes journaux sont confidentiels. Surtout ceux que tu n\'as pas encore trouvés. »', 'ARIA: “My logs are confidential. Especially the ones you have not found yet.”'),
    ],
    light: { color: '#00e5ff', intensity: 1, at: [0, 0.55, 0.5], priority: 3 },
  },
  {
    id: 'scav-sign', name: tr('Enseigne « Scavengers »', '“Scavengers” sign'), category: 'junk', model: 'scav-sign', mount: 'wall',
    light: { color: '#00ff41', intensity: 0.6, at: [0, 0.83, 0.3], flicker: 'neon', priority: 1 },
  },
  {
    id: 'scav-map', name: tr('Carte des secteurs', 'Sector map'), category: 'junk', model: 'scav-map', mount: 'wall', action: tr('Étudier la carte', 'Study the map'),
    interact: tr('Cinq zones à traverser, d\'épave en épave. Tout au bout, un point violet, et un mot suivi d\'un point d\'interrogation.', 'Five zones to cross, wreck by wreck. At the far end, a violet dot, and a word followed by a question mark.'),
  },
  {
    id: 'scav-cryo', name: tr('Caisson cryogénique', 'Cryo pod'), category: 'junk', model: 'scav-cryo', mount: 'floor',
    interact: [
      tr('Caisson cryogénique n° 7. Compteur : 250 ans. Sur la vitre, de l\'intérieur, une trace de main.', 'Cryo pod no. 7. Counter: 250 years. On the glass, from the inside, a handprint.'),
      tr('Une étiquette : « Ne pas réveiller avant la fin de l\'humanité. »', 'A label: “Do not wake before the end of humanity.”'),
    ],
  },
  {
    id: 'scav-drone', name: tr('Drone de fouille', 'Salvage drone'), category: 'junk', model: 'scav-drone', mount: 'floor',
    variants: [{ id: 'd1', label: tr('En état', 'Working'), swatch: '#00ff41' }, { id: 'd2', label: tr('Cabossé', 'Battered'), swatch: '#ffb000' }],
    interact: (v) => v === 'd2'
      ? tr('Une chenille tordue, la tourelle coincée. Il est revenu d\'une épave où il n\'aurait pas dû entrer.', 'One bent track, a jammed turret. It came back from a wreck it should never have entered.')
      : tr('Chenilles neuves, capteur de mouvement, et un autocollant « ne mord pas ». Son œil vert te suit.', 'New tracks, motion sensor, and a “does not bite” sticker. Its green eye follows you.'),
  },
  {
    id: 'scav-loot', name: tr('Étagère de butin', 'Loot rack'), category: 'junk', model: 'scav-loot', mount: 'floor',
    interact: tr('De la ferraille, des cellules de carburant, un module qui luit en violet, et une boîte noire que personne n\'a envie d\'écouter.', 'Scrap, fuel cells, a module glowing violet, and a black box nobody wants to listen to.'),
  },
]
