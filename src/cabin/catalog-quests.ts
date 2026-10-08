import { tr } from '../i18n'
import type { CatalogEntry } from './catalog'

/*
 * Ce que les quêtes « qui se méritent » offrent pour les quartiers (cf. shared/quests.js et
 * src/furniture/quests-more.ts) : rien de tout cela ne s'achète, le catalogue dit « se gagne à bord ».
 */
export const QUEST_ENTRIES: CatalogEntry[] = [
  {
    id: 'pirate-radio', name: tr('Poste pirate', 'Pirate radio set'), category: 'objects', model: 'pirate-radio', mount: 'top', action: tr('Écouter', 'Listen'),
    interact: [
      tr('Le poste est calé sur 88.8, et ne veut plus rien savoir d\'autre. Entre deux morceaux, une petite voix : « Bip. »', 'The set is locked on 88.8 and wants nothing else. Between two tracks, a small voice: “Beep.”'),
      tr('88.8. Ça grésille, puis une nappe de synthé monte, toute seule. Quelqu\'un émet encore, cette nuit.', '88.8. Static, then a synth pad rises on its own. Somebody is still on the air tonight.'),
      tr('Une voix lit des chiffres : « sept… quatre… zéro… » puis s\'arrête, comme si elle avait oublié la suite.', 'A voice reads numbers: “seven… four… zero…” then stops, as if it had forgotten the rest.'),
    ],
    light: { color: '#ffb03a', intensity: 0.5, at: [0.07, 0.14, 0.2], priority: 1 },
  },
  {
    id: 'pocket-bar', name: tr('Bar de poche', 'Pocket bar'), category: 'party', model: 'pocket-bar', mount: 'floor', action: tr('Se servir', 'Pour a drink'),
    interact: [
      tr('Le globe s\'ouvre : trois bouteilles, un shaker, deux verres. Une carte, de la main de Jacques : « On ne secoue pas. On FRAPPE. »', 'The globe opens: three bottles, a shaker, two glasses. A card in Jacques\' hand: “You don\'t shake. You STRIKE.”'),
      tr('Vous dosez comme Jacques : trois, deux, un. Ce n\'est pas tout à fait ça. Ce n\'est jamais tout à fait ça, sans lui.', 'You pour like Jacques: three, two, one. Not quite right. It never is quite right without him.'),
    ],
  },
  {
    id: 'reel-projector', name: tr('Projecteur à bobine', 'Reel projector'), category: 'party', model: 'reel-projector', mount: 'floor', action: tr('Regarder le faisceau', 'Watch the beam'),
    interact: [
      tr('Le projecteur ronronne. Dans le faisceau, la poussière dessine six pétales, une seconde, puis plus rien.', 'The projector purrs. In the beam, the dust draws six petals, for a second, then nothing.'),
      tr('La bobine tourne à vide : la vraie est restée au cinéma. Celle-ci ne montre que de la lumière. C\'est déjà beaucoup.', 'The reel runs empty: the real one stayed at the cinema. This one only shows light. That is already a lot.'),
    ],
    light: { color: '#fff3d0', intensity: 0.9, at: [0, 0.66, 0.9], priority: 2 },
  },
]
