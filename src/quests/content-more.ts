import { CHEF } from '../chef'
import { GARDENER } from '../gardener'
import { tr } from '../i18n'
import { DROID, MECHANIC } from '../mechanic'
import { SERGEANT } from '../patrol'
import type { QuestState } from '../../shared/quests.js'
import type { Line } from './cinematic'
import type { QuestContent, When } from './content'

/*
 * Les quêtes « qui se méritent » : aucune n'est proposée d'emblée, chacune attend qu'on en ait
 * terminé d'autres (cf. `requires` dans shared/quests.js). Le jour où l'une devient disponible,
 * une rumeur (`rumor`) dit où traîner ; son « ! » fait le reste.
 *
 *   La gamelle vide ──► La recette de Jacques ──► Le poisson qui n'existe pas
 *   Silence, on dribble ──► Fréquence fantôme ──┐
 *   L'essayage ─────────────────────────────────┴► Séance de minuit
 *   Quatre cent douze ──► Le dossier ARIA ──────┐
 *   Permis de tir + Le dernier match ───────────┴► Tour de garde
 *
 * Mêmes règles d'écriture que content.ts (dont on reprend ici les quelques outils, pour ne pas
 * faire dépendre les deux fichiers l'un de l'autre).
 */

const line = (who: string | undefined, fr: string, en: string, more: Partial<Line> = {}): Line => ({ who, text: tr(fr, en), ...more })
const n = (fr: string, en: string) => line(undefined, fr, en)
const me = (fr: string, en: string, more?: Partial<Line>) => line('me', fr, en, more)
const speaker = (who: string) => (fr: string, en: string, more?: Partial<Line>) => line(who, fr, en, more)

const rourke = speaker(SERGEANT)
const marcel = speaker(CHEF)
const nico = speaker(MECHANIC)
const boulon = speaker(DROID)
const capucine = speaker(GARDENER)
const bugenhagen = speaker('Bugenhagen')
const jacques = speaker('Jacques')
const kael = speaker('Kael')
const aria = speaker('ARIA')

const unstarted: When = (s: QuestState | undefined) => !s
const during = (from: number, to = from): When => (s) => !!s && !s.done && s.step >= from && s.step <= to
const missing = (step: number, flag: number): When => (s) => !!s && !s.done && s.step === step && !((s.flags >> flag) & 1)
const either = (...whens: When[]): When => (s) => whens.some((w) => w(s))

/** Ce qu'attend « Le poisson qui n'existe pas » à l'étang (cf. main.ts : la prise, après un saut FSD). */
export const GHOST_FISH_EVENT = 'fish:witchspace-koi'

export const MORE_QUESTS: QuestContent[] = [
  // ============================================================ Fréquence fantôme
  {
    id: 'frequence-fantome',
    title: tr('Fréquence fantôme', 'Phantom frequency'),
    icon: 'radio',
    pitch: tr('Une émission que personne ne diffuse, à une heure où personne n\'écoute.', 'A broadcast nobody airs, at an hour when nobody listens.'),
    reward: tr('L\'album « 88.8 » au jukebox, et le poste pirate pour vos quartiers (Objets).', 'The “88.8” album on the jukebox, and the pirate radio set for your quarters (Objects).'),
    rumor: tr('Au salon d\'écoute, un casque grésille tout seul.', 'In the listening lounge, a headset is crackling on its own.'),
    offer: {
      on: 'prop:headset',
      accept: tr('Remonter le signal', 'Trace the signal'),
      decline: tr('Reposer le casque', 'Put the headset down'),
      scene: [
        n('Un casque, tombé de son support. Il n\'est branché sur rien, et il grésille.', 'A headset, fallen off its stand. It isn\'t plugged into anything, and it is crackling.'),
        n('Vous l\'approchez de l\'oreille. De la musique, lointaine, que vous ne connaissez pas. Puis une petite voix, appliquée :', 'You hold it to your ear. Music, far away, that you don\'t know. Then a small, careful voice:'),
        n('« …sept… quatre… zéro… » Un silence. « …o7. »', '“…seven… four… zero…” A pause. “…o7.”'),
        n('Radio Dangereuse n\'émet pas à cette heure-ci. Quelqu\'un d\'autre, si.', 'Radio Dangereuse is off the air at this hour. Somebody else isn\'t.'),
      ],
    },
    steps: [
      {
        note: tr('Une émission que Radio Dangereuse ne diffuse pas. Un studio note tout ce qui passe à l\'antenne, même ce qui n\'est pas à lui.', 'A broadcast Radio Dangereuse doesn\'t air. A studio logs everything on the air, even what isn\'t its own.'),
        hooks: [{
          on: 'prop:logbook',
          scene: [
            n('Le journal d\'antenne du studio. Les nuits se ressemblent : « RAS », « RAS », « RAS ».', 'The studio\'s broadcast log. Every night reads the same: “nothing”, “nothing”, “nothing”.'),
            n('Sauf une ligne, toutes les nuits, à la même heure : « 03:12 : porteuse parasite sur 88.8. PAS NOUS. »', 'Except one line, every night, at the same hour: “03:12: stray carrier on 88.8. NOT US.”'),
            n('Dans la marge, au crayon : « Trop faible pour traverser trois ponts. Il y a des relais. Un par pont ? »', 'In the margin, in pencil: “Too weak to cross three decks. There are repeaters. One per deck?”'),
          ],
        }],
      },
      {
        note: tr('Un signal trop faible pour traverser trois ponts : quelque chose le répète, un pont après l\'autre.', 'A signal too weak to cross three decks: something repeats it, one deck after another.'),
        parts: [
          {
            on: 'prop:relay-upper',
            found: tr('Pont supérieur : un relais ventousé dans la coursive des cabines. Il reçoit d\'en bas.', 'Upper deck: a repeater stuck in the cabin corridor. It receives from below.'),
            scene: [
              n('Un boîtier gros comme une boîte à chaussures, ventousé au pied de la cloison. Une antenne, une diode rouge, beaucoup de ruban adhésif.', 'A box the size of a shoebox, suction-cupped to the foot of the bulkhead. An antenna, a red LED, a lot of tape.'),
              n('Dessus, au feutre, une flèche. Elle pointe vers le sol.', 'On top, in marker, an arrow. It points at the floor.'),
            ],
          },
          {
            on: 'prop:relay-main',
            found: tr('Pont principal : un autre relais, sur la Promenade. Les soudures sont minuscules.', 'Main deck: another repeater, on the Promenade. The solder joints are tiny.'),
            scene: [
              n('Le même boîtier, calé derrière une jardinière de la Promenade. Les soudures sont propres, serrées, minuscules.', 'The same box, wedged behind a planter on the Promenade. The solder joints are clean, tight, tiny.'),
              n('Aucune main humaine ne soude aussi petit. La flèche pointe encore vers le bas.', 'No human hand solders that small. The arrow still points down.'),
            ],
          },
          {
            on: 'prop:relay-hold',
            found: tr('Cale : le dernier relais, dans le couloir de service. Sa flèche est horizontale : vers la proue.', 'Hold: the last repeater, in the service corridor. Its arrow is horizontal: towards the bow.'),
            scene: [
              n('Le troisième relais, posé à hauteur de cheville. Autour, des traces d\'huile, en pointillés.', 'The third repeater, set at ankle height. Around it, oil marks, in dotted lines.'),
              n('Cette fois, la flèche est horizontale. Elle pointe vers la proue, du côté de la soute.', 'This time the arrow is horizontal. It points towards the bow, on the cargo bay side.'),
            ],
          },
        ],
      },
      {
        note: tr('Trois relais, trois flèches. La dernière montre la soute de la cale.', 'Three repeaters, three arrows. The last one points at the cargo bay in the hold.'),
        hooks: [{
          on: 'prop:transmitter',
          scene: [
            n('Au fond de la soute, derrière les caisses : un émetteur. Une platine à cassette, un cintre déplié en antenne, un micro de casque scotché à un manche.', 'At the back of the cargo bay, behind the crates: a transmitter. A cassette deck, a coat hanger bent into an antenna, a headset mic taped to a stick.'),
            n('Le micro est réglé à quarante centimètres du sol. La cassette porte une étiquette : « 88.8, NUIT 412 ».', 'The mic is set sixteen inches off the floor. The cassette is labelled: “88.8, NIGHT 412”.'),
            n('Sur la caisse, une trace de pince à trois doigts, dans l\'huile.', 'On the crate, the print of a three-fingered gripper, in the oil.'),
            me('Trois doigts. Quarante centimètres. Je connais quelqu\'un de cette taille.', 'Three fingers. Sixteen inches. I know someone that size.'),
          ],
        }],
      },
      {
        note: tr('Un émetteur bâti par quelqu\'un de petit, qui a trois doigts et de l\'huile sur les pinces. Il ne s\'éloigne jamais de son mécano.', 'A transmitter built by someone small, with three fingers and oil on the grippers. It never strays far from its mechanic.'),
        hooks: [{
          on: 'npc:nico',
          confirm: {
            accept: tr('Garder le secret', 'Keep the secret'),
            decline: tr('Y réfléchir', 'Think it over'),
            after: [
              boulon('…Bip ? (Vrai ?)', '…Beep? (Really?)', { emote: 'joie' }),
              nico('Bon. Ça reste entre nous trois. Et toi, à 03:12, tu baisses d\'un cran : la Promenade capte dans les haut-parleurs.', 'Right. This stays between the three of us. And you, at 03:12, you turn it down a notch: the Promenade picks it up on the speakers.'),
              boulon('Bip. Bip bip. (Pour toi. La nuit 412, en entier. Et le poste qui va avec.)', 'Beep. Beep beep. (For you. Night 412, the whole of it. And the set that goes with it.)'),
              n('Boulon vous tend une cassette et un vieux transistor en bakélite, calé sur 88.8. Le jukebox saura quoi en faire.', 'Bolt hands you a cassette and an old bakelite transistor radio, locked on 88.8. The jukebox will know what to do with it.'),
            ],
            declined: [
              boulon('Bip… (Je comprends.)', 'Beep… (I understand.)'),
              nico('Prends ton temps. Mais ne passe pas par le sergent avant de repasser par ici, d\'accord ?', 'Take your time. But don\'t go by the sergeant before you come back by here, all right?'),
            ],
          },
          scene: [
            nico('Un émetteur ? Dans MA soute ? Non. Je l\'aurais vu. Hein, Boulon, qu\'on l\'aurait vu ?', 'A transmitter? In MY cargo bay? No. I would have seen it. Right, Bolt, we would have seen it?'),
            boulon('…', '…'),
            nico('Boulon.', 'Bolt.'),
            boulon('Bip. (La nuit, personne n\'écoute. Alors j\'émets.)', 'Beep. (At night, nobody listens. So I broadcast.)'),
            nico('C\'est TOI, le fantôme de 03:12 ? Les chiffres, la musique, tout ?', 'YOU are the 03:12 ghost? The numbers, the music, all of it?'),
            boulon('Bip bip. (Les chiffres, c\'est mon numéro de série. Je le lis pour savoir si quelqu\'un répond.)', 'Beep beep. (The numbers are my serial number. I read it out to see if anyone answers.)'),
            boulon('Bip. (La musique, je la fais. Avec le bruit du réacteur, et ce qui traîne.)', 'Beep. (The music, I make. With the reactor hum, and whatever is lying around.)'),
            nico('…Si Rourke l\'apprend, il démonte l\'émetteur. Et peut-être le drone avec.', '…If Rourke finds out, he\'ll take the transmitter apart. And maybe the drone with it.'),
          ],
        }],
      },
    ],
    epilogue: tr('Toutes les nuits, à 03:12, quelqu\'un émet sur 88.8. Vous savez qui. Vous êtes trois à le savoir.', 'Every night at 03:12, someone broadcasts on 88.8. You know who. Three of you know.'),
    props: [
      {
        id: 'headset', deck: 1, x: 17.9, z: 5.45, model: 'quest-headset',
        label: tr('Écouter le casque', 'Listen to the headset'), when: either(unstarted, during(0, 3)),
        idle: tr('Le casque grésille toujours. La petite voix recommence ses chiffres.', 'The headset is still crackling. The small voice starts its numbers over.'),
      },
      {
        id: 'logbook', deck: 1, x: 16.5, z: 2.75, model: 'quest-logbook',
        label: tr('Lire le journal d\'antenne', 'Read the broadcast log'), when: during(0, 3),
        idle: tr('« 03:12 : porteuse parasite sur 88.8. PAS NOUS. »', '“03:12: stray carrier on 88.8. NOT US.”'),
      },
      { id: 'relay-upper', deck: 1, x: 14.6, z: 5.05, model: 'quest-relay', label: tr('Examiner le boîtier', 'Examine the box'), when: missing(1, 0) },
      { id: 'relay-main', deck: 0, x: 26.35, z: 3.3, model: 'quest-relay', label: tr('Examiner le boîtier', 'Examine the box'), when: missing(1, 1) },
      { id: 'relay-hold', deck: -1, x: 7.36, z: 1.06, model: 'quest-relay', label: tr('Examiner le boîtier', 'Examine the box'), when: missing(1, 2) },
      {
        id: 'transmitter', deck: -1, x: 17.25, z: 2.35, model: 'quest-transmitter',
        label: tr('Examiner l\'émetteur', 'Examine the transmitter'), when: during(2, 3),
        idle: tr('La cassette tourne à vide. « 88.8, NUIT 412 ».', 'The cassette runs empty. “88.8, NIGHT 412”.'),
      },
    ],
  },

  // ============================================================ La recette de Jacques
  {
    id: 'recette-de-jacques',
    title: tr('La recette de Jacques', 'Jacques\' recipe'),
    icon: 'martini',
    pitch: tr('Un robot barman, un saut de trop, et un cocktail que plus personne ne sait faire.', 'A robot bartender, one jump too many, and a cocktail nobody knows how to make any more.'),
    reward: tr('Le bar de poche pour vos quartiers (Soirée), et de quoi trinquer : /trinquer.', 'The pocket bar for your quarters (Party), and something to toast with: /toast.'),
    rumor: tr('Chez Jacques, le patron essuie le même verre depuis trois jours.', 'At Chez Jacques, the boss has been wiping the same glass for three days.'),
    offer: {
      on: 'item:-1:bartender',
      accept: tr('Retrouver la recette', 'Find the recipe'),
      decline: tr('Commander autre chose', 'Order something else'),
      scene: [
        jacques('Le Trou Noir. Mon cocktail. Celui pour lequel on descendait trois ponts. Je ne sais plus le faire.', 'The Black Hole. My cocktail. The one people came down three decks for. I no longer know how to make it.'),
        jacques('Le dernier saut m\'a vidé un tiroir de mémoire. Pas le tiroir des dettes, hélas. Celui des recettes.', 'The last jump emptied one of my memory drawers. Not the drawer of debts, alas. The one with the recipes.'),
        jacques('Il m\'en reste trois miettes. Une chose qui pousse sous verre. Une chose qui luit dans l\'eau. Et une chose qui ne devrait pas être à bord.', 'I have three crumbs left. A thing that grows under glass. A thing that glows in water. And a thing that should not be aboard.'),
        jacques('Rapportez-moi les trois, et je retrouve le reste. Enfin, j\'espère. Un barman espère toujours.', 'Bring me all three, and I\'ll find the rest. Well, I hope so. A bartender always hopes.'),
      ],
    },
    steps: [
      {
        note: tr('Trois ingrédients : un qui pousse sous verre, un qui luit dans l\'eau, un qui ne devrait pas être à bord.', 'Three ingredients: one that grows under glass, one that glows in water, one that should not be aboard.'),
        parts: [
          {
            on: 'prop:mint',
            found: tr('Sous verre : la menthe de Lave de la serre. Capucine en a « trop », elle ne sait pas pourquoi.', 'Under glass: the Lavian mint from the greenhouse. Capucine has “too much” of it, and doesn\'t know why.'),
            scene: [
              n('Un pot de menthe, dans un coin de la serre. Elle déborde, elle grimpe, elle sent jusqu\'à la coursive.', 'A pot of mint, in a corner of the greenhouse. It spills over, it climbs, you can smell it from the corridor.'),
              n('L\'étiquette, de la main de Capucine : « Menthe de Lave. NE PAS ARROSER. Elle s\'en charge. »', 'The label, in Capucine\'s hand: “Lavian mint. DO NOT WATER. It sees to that itself.”'),
              n('Vous cueillez trois brins. Il en repousse deux pendant que vous regardez.', 'You pick three sprigs. Two grow back while you watch.'),
            ],
          },
          {
            on: 'prop:algae',
            found: tr('Dans l\'eau : une algue de l\'étang, qui luit doucement dans son bocal.', 'In water: an alga from the pond, glowing softly in its jar.'),
            scene: [
              n('Un bocal oublié sur la margelle de l\'étang. Au fond, une algue ondule, et sa lueur verte respire.', 'A jar forgotten on the rim of the pond. At the bottom, an alga sways, and its green glow breathes.'),
              n('Sur le couvercle : « Échantillon 7. Comestible ? Demander à Jacques. » Quelqu\'un a déjà eu la même idée que lui.', 'On the lid: “Sample 7. Edible? Ask Jacques.” Somebody already had the same idea he did.'),
            ],
          },
          {
            on: 'prop:vial',
            found: tr('Pas censée être à bord : une goutte de résine, scellée dans sa mallette, au lobby de la zone thargoïde.', 'Not supposed to be aboard: a drop of resin, sealed in its case, in the Thargoid zone lobby.'),
            scene: [
              n('Une mallette de quarantaine, jaune, ouverte sur le sol du lobby. Dedans, une seule fiole, et une goutte verte qui pulse.', 'A quarantine case, yellow, open on the lobby floor. Inside, a single vial, and a green drop that pulses.'),
              n('Le bordereau : « Résine caustique, 1 goutte. Destinataire : J. Motif : usage culinaire. » Tamponné « REFUSÉ », puis, au stylo : « bon, d\'accord ».', 'The slip: “Caustic resin, 1 drop. Recipient: J. Purpose: culinary use.” Stamped “DENIED”, then, in pen: “oh, all right”.'),
              n('Vous refermez la mallette avec beaucoup de soin.', 'You close the case with great care.'),
            ],
          },
        ],
      },
      {
        note: tr('Les trois ingrédients sont là, mais dans quel ordre, et combien ? À bord, un seul autre connaît les doses par cœur.', 'All three ingredients are here, but in what order, and how much? Only one other person aboard knows measures by heart.'),
        hooks: [{
          on: 'npc:marcel',
          scene: [
            marcel('Le Trou Noir de Jacques ? Évidemment que je connais. J\'ai essayé de le lui voler pendant deux ans.', 'Jacques\' Black Hole? Of course I know it. I spent two years trying to steal it from him.'),
            marcel('Montre. Menthe de Lave, bien. L\'algue, oui. Et… tu te promènes avec ÇA dans ma cuisine ?', 'Show me. Lavian mint, good. The alga, yes. And… you are walking around with THAT in my kitchen?'),
            marcel('Bon. Les doses, je les ai. Trois, deux, un. Trois brins, deux filaments, une goutte. Jamais l\'inverse, sinon il faut refaire le plafond.', 'Right. The measures, I have. Three, two, one. Three sprigs, two strands, one drop. Never the other way round, or you redo the ceiling.'),
            marcel('Et dis-lui ce qu\'il a oublié avec le reste : son Trou Noir, on ne le secoue pas. On le FRAPPE. Une fois. Sec.', 'And tell him what he forgot with the rest: his Black Hole is not shaken. It is STRUCK. Once. Sharp.'),
            n('Marcel note les doses au dos d\'un bon de commande, et vous le glisse dans la poche.', 'Marcel writes the measures on the back of an order slip and tucks it into your pocket.'),
          ],
        }],
      },
      {
        note: tr('Trois, deux, un. Et on ne secoue pas : on frappe. Il ne manque plus que le barman.', 'Three, two, one. And you don\'t shake: you strike. All that is missing is the bartender.'),
        hooks: [{
          on: 'item:-1:bartender',
          scene: [
            jacques('La menthe. L\'algue. La… oui. Posez-la doucement.', 'The mint. The alga. The… yes. Put it down gently.'),
            jacques('Trois, deux, un. Trois, deux… Oh. OH. Ça revient. Et on ne secoue pas, n\'est-ce pas ? On…', 'Three, two, one. Three, two… Oh. OH. It\'s coming back. And we don\'t shake, do we? We…'),
            n('Jacques abat le shaker sur le comptoir. Une fois. Sec. Les bouteilles tintent jusqu\'au fond de la salle.', 'Jacques brings the shaker down on the counter. Once. Sharp. The bottles ring all the way to the back of the room.'),
            n('Il verse. C\'est noir, avec un anneau vert qui tourne lentement au bord du verre, sans jamais tomber dedans.', 'He pours. It is black, with a green ring turning slowly at the edge of the glass, never falling in.'),
            jacques('Le premier est pour vous. Le deuxième aussi : je dois vérifier que je sais encore le refaire.', 'The first one is yours. So is the second: I need to check I can still make it again.'),
            me('À votre mémoire, Jacques.', 'To your memory, Jacques.', { me: 'trinquer' }),
            jacques('Prenez ceci. Un bar de poche, pour vos quartiers. On ne devrait jamais dépendre d\'un seul tiroir.', 'Take this. A pocket bar, for your quarters. One should never depend on a single drawer.'),
          ],
        }],
      },
    ],
    epilogue: tr('Le Trou Noir est revenu à la carte. Marcel jure qu\'il ne connaît toujours pas la recette.', 'The Black Hole is back on the menu. Marcel swears he still doesn\'t know the recipe.'),
    props: [
      { id: 'mint', deck: 1, x: 5.47, z: 1.82, model: 'quest-mint', label: tr('Examiner la menthe', 'Examine the mint'), when: missing(0, 0) },
      { id: 'algae', deck: 1, x: 6.35, z: 11.5, model: 'quest-algae', label: tr('Examiner le bocal', 'Examine the jar'), when: missing(0, 1) },
      { id: 'vial', deck: -1, x: 22, z: 8.6, model: 'quest-vial', label: tr('Examiner la mallette', 'Examine the case'), when: missing(0, 2) },
    ],
  },

  // ============================================================ Le poisson qui n'existe pas
  {
    id: 'poisson-fantome',
    title: tr('Le poisson qui n\'existe pas', 'The fish that doesn\'t exist'),
    icon: 'fish',
    pitch: tr('Une case vide dans le livre des prises, et une jardinière qui jure qu\'elle n\'a pas rêvé.', 'An empty slot in the catch book, and a gardener who swears she wasn\'t dreaming.'),
    reward: tr('La koï du sillage : la dernière page du livre des prises, et 3 000 CR.', 'The wake koi: the last page of the catch book, and 3,000 CR.'),
    rumor: tr('À la serre, Capucine compte les poissons de l\'étang. Elle en trouve toujours un de trop.', 'In the greenhouse, Capucine is counting the fish in the pond. She always finds one too many.'),
    offer: {
      on: 'npc:capucine',
      accept: tr('La croire', 'Believe her'),
      decline: tr('Sourire poliment', 'Smile politely'),
      scene: [
        capucine('Vous, vous savez regarder. Alors dites-moi que je ne suis pas folle.', 'You know how to look. So tell me I\'m not mad.'),
        capucine('Il y a un poisson, dans mon étang, qui n\'est pas dans le livre. Violet. Presque transparent. Il luit comme l\'algue de Jacques.', 'There is a fish in my pond that isn\'t in the book. Violet. Almost transparent. It glows like Jacques\' alga.'),
        capucine('Je l\'ai vu trois fois. Jamais plus d\'une minute. Et jamais quand quelqu\'un regarde avec moi, évidemment.', 'I have seen it three times. Never for more than a minute. And never when anyone is looking with me, of course.'),
        capucine('Le livre a une case vide, à la fin. Personne ne laisse une case vide par hasard.', 'The book has an empty slot, at the end. Nobody leaves an empty slot by accident.'),
      ],
    },
    steps: [
      {
        note: tr('Un poisson violet, qui luit, et qui ne reste jamais. S\'il existe, il a bien dû laisser quelque chose au bord de l\'eau.', 'A violet fish that glows and never stays. If it exists, it must have left something at the water\'s edge.'),
        hooks: [{
          on: 'prop:scale',
          scene: [
            n('Sur la margelle, quelque chose luit. Une écaille, grande comme la paume, violette, froide.', 'On the rim, something glows. A scale, as big as your palm, violet, cold.'),
            n('Elle est sèche d\'un côté, et de l\'autre elle n\'est… pas tout à fait là. Votre doigt passe à travers, d\'un demi-millimètre.', 'It is dry on one side, and on the other it is… not quite there. Your finger goes through it, by a hair.'),
            n('Aucun poisson du livre n\'a d\'écailles pareilles. Quelqu\'un, à bord, passe ses nuits à étudier ce qui n\'est pas tout à fait là.', 'No fish in the book has scales like that. Somebody aboard spends their nights studying things that are not quite there.'),
          ],
        }],
      },
      {
        note: tr('Une écaille qui n\'est pas tout à fait là. Le vieux du planétarium étudie le ciel, et ce qu\'il y a entre.', 'A scale that is not quite there. The old man in the planetarium studies the sky, and what lies between.'),
        hooks: [{
          on: 'item:1:bugenhagen',
          scene: [
            bugenhagen('Montrez. Hmm. Ho ho. Savez-vous ce que vous tenez ? Non, bien sûr. Personne ne sait.', 'Show me. Hmm. Ho ho. Do you know what you are holding? No, of course not. Nobody does.'),
            bugenhagen('Quand ce vaisseau saute, il déchire un passage. Le passage se referme derrière lui. Presque tout de suite. Presque.', 'When this ship jumps, it tears a passage open. The passage closes behind it. Almost at once. Almost.'),
            bugenhagen('Pendant quelques minutes, il reste un sillage. Et dans un sillage, mon enfant, il y a toujours quelque chose qui nage.', 'For a few minutes, a wake remains. And in a wake, my child, there is always something swimming.'),
            me('Dans un étang ?', 'In a pond?'),
            bugenhagen('L\'eau est l\'eau. Votre poisson ne vit pas dans l\'étang : il y passe. Après un saut. Cinq minutes, pas davantage.', 'Water is water. Your fish does not live in the pond: it passes through. After a jump. Five minutes, no more.'),
            bugenhagen('Lancez votre ligne à ce moment-là, et pas à un autre. Et ferrez vite : il a rendez-vous ailleurs.', 'Cast your line then, and at no other time. And strike fast: it has somewhere else to be.'),
          ],
        }],
      },
      {
        note: tr('Il ne vit pas dans l\'étang, il y passe : dans les cinq minutes qui suivent un saut FSD. Il faut y être, la ligne à l\'eau.', 'It doesn\'t live in the pond, it passes through: within five minutes of an FSD jump. You have to be there, line in the water.'),
        hooks: [{
          on: `event:${GHOST_FISH_EVENT}`,
          scene: [
            n('La ligne se tend, sans un remous. Ce que vous remontez ne pèse presque rien.', 'The line goes taut, without a ripple. What you bring up weighs almost nothing.'),
            n('Une koï. Violette, translucide ; on voit l\'étang au travers. Elle luit, et sa lueur respire, comme l\'écaille.', 'A koi. Violet, translucent; you can see the pond through it. It glows, and its glow breathes, like the scale.'),
            n('Elle vous regarde. Vous avez la nette impression qu\'elle consulte sa montre.', 'It looks at you. You have the distinct feeling it is checking its watch.'),
          ],
        }],
      },
      {
        note: tr('Elle existe. Quelqu\'un, à la serre, attend depuis longtemps qu\'on le lui dise.', 'It exists. Someone in the greenhouse has been waiting a long time to be told so.'),
        hooks: [{
          on: 'npc:capucine',
          scene: [
            capucine('Vous l\'avez… Oh. Oh, elle est encore plus belle de près.', 'You have… Oh. Oh, it\'s even lovelier up close.', { emote: 'joie' }),
            capucine('Je ne suis pas folle. Notez-le quelque part. Non : notez-le dans le LIVRE.', 'I\'m not mad. Write that down somewhere. No: write it down in the BOOK.'),
            n('Capucine ouvre le livre des prises à la dernière page, celle de la case vide, et écrit, en s\'appliquant : « Koï du sillage ».', 'Capucine opens the catch book at the last page, the one with the empty slot, and writes, carefully: “Wake koi”.'),
            capucine('Elle repassera. À chaque saut. Maintenant que vous savez quand regarder, elle n\'a plus aucune raison de se cacher.', 'It will be back. At every jump. Now that you know when to look, it has no reason left to hide.'),
          ],
        }],
      },
    ],
    epilogue: tr('La dernière case du livre est remplie. Après chaque saut, pendant cinq minutes, l\'étang compte un poisson de trop.', 'The last slot in the book is filled. After every jump, for five minutes, the pond has one fish too many.'),
    props: [
      {
        id: 'scale', deck: 1, x: 6.35, z: 10.3, model: 'quest-scale',
        label: tr('Ramasser ce qui luit', 'Pick up what glows'), when: during(0),
      },
    ],
  },

  // ============================================================ Séance de minuit
  {
    id: 'seance-de-minuit',
    title: tr('Séance de minuit', 'Midnight screening'),
    icon: 'film-reel',
    pitch: tr('Une bobine sans étiquette, et un film que personne ne se souvient d\'avoir tourné.', 'An unlabelled reel, and a film nobody remembers shooting.'),
    reward: tr('« La bobine sans étiquette » à la régie du cinéma, et le projecteur à bobine pour vos quartiers (Soirée).', '“The unlabelled reel” at the cinema booth, and the reel projector for your quarters (Party).'),
    rumor: tr('Au foyer du cinéma, quelqu\'un a oublié une boîte de bobine. Elle n\'a pas d\'étiquette.', 'In the cinema foyer, somebody left a film can behind. It has no label.'),
    offer: {
      on: 'prop:can',
      accept: tr('Chercher le reste du film', 'Look for the rest of the film'),
      decline: tr('Refermer la boîte', 'Close the can'),
      scene: [
        n('Une boîte de bobine en fer-blanc, posée sur le tapis rouge. Pas d\'étiquette : juste un cercle au feutre, là où elle aurait dû être.', 'A tin film can, sitting on the red carpet. No label: just a marker circle where one should have been.'),
        n('Dedans, presque rien. Un mètre d\'amorce, trois coupures nettes, et un mot plié en quatre :', 'Inside, almost nothing. A yard of leader, three clean cuts, and a note folded in four:'),
        n('« Le reste est derrière ce que tu regardes sans voir. »', '“The rest is behind what you look at without seeing.”'),
        n('Dans un cinéma, il y a une chose que tout le monde regarde sans la voir : les affiches.', 'In a cinema, there is one thing everybody looks at without seeing: the posters.'),
      ],
    },
    steps: [
      {
        note: tr('« Le reste est derrière ce que tu regardes sans voir. » Trois coupures : trois morceaux de pellicule.', '“The rest is behind what you look at without seeing.” Three cuts: three pieces of film.'),
        parts: [
          {
            on: 'prop:strip-foyer',
            found: tr('Derrière une affiche du foyer : des images d\'un couloir du bord, filmé de très haut.', 'Behind a poster in the foyer: frames of a ship\'s corridor, filmed from very high up.'),
            scene: [
              n('Un bout de pellicule dépasse de derrière l\'affiche. Vous tirez : un mètre de film, plié en accordéon.', 'A bit of film sticks out from behind the poster. You pull: a yard of film, folded like an accordion.'),
              n('À contre-jour : un couloir du vaisseau, vu du plafond. Quelqu\'un y marche. On dirait vous.', 'Held to the light: a corridor of the ship, seen from the ceiling. Somebody is walking down it. It looks like you.'),
            ],
          },
          {
            on: 'prop:strip-cinema',
            found: tr('Dans la salle : des symboles, une image sur deux. Six pétales autour d\'un hexagone.', 'In the auditorium: symbols, on every other frame. Six petals around a hexagon.'),
            scene: [
              n('Celui-ci était glissé derrière le cadre, dans la salle même. Il est plus long que le premier.', 'This one was slipped behind the frame, in the auditorium itself. It is longer than the first.'),
              n('Une image sur deux est noire. Sur les autres, un symbole : six pétales autour d\'un hexagone. Il tourne d\'un cran à chaque image.', 'Every other frame is black. On the others, a symbol: six petals around a hexagon. It turns one notch with each frame.'),
            ],
          },
          {
            on: 'prop:strip-lounge',
            found: tr('Au salon d\'écoute : pas d\'image, rien que la piste son. Elle a la forme d\'une voix.', 'In the listening lounge: no picture, only the soundtrack. It is shaped like a voice.'),
            scene: [
              n('Le dernier morceau est derrière une affiche du salon d\'écoute. Aucune image : toute la largeur est prise par la piste son.', 'The last piece is behind a poster in the listening lounge. No picture: the soundtrack takes up the whole width.'),
              n('Vous n\'avez pas de quoi l\'écouter. Mais à l\'œil, l\'onde a une forme : celle de quelqu\'un qui parle lentement.', 'You have nothing to play it on. But by eye, the wave has a shape: that of somebody speaking slowly.'),
            ],
          },
        ],
      },
      {
        note: tr('Trois morceaux, recollés bout à bout. Une bobine ne dit rien tant qu\'on ne l\'a pas chargée.', 'Three pieces, spliced end to end. A reel says nothing until it has been loaded.'),
        hooks: [{
          on: 'prop:gate',
          scene: [
            n('Vous chargez la bobine. Le projecteur claque, hésite, puis trouve son rythme. La salle s\'éteint.', 'You load the reel. The projector clacks, hesitates, then finds its rhythm. The auditorium goes dark.'),
            n('Le couloir, vu d\'en haut. Le symbole, qui tourne. Et la voix, enfin, lente, posée, qui ne s\'adresse qu\'à vous.', 'The corridor, seen from above. The symbol, turning. And the voice, at last, slow, composed, speaking to you alone.'),
            n('Vous ne comprenez pas tout. Personne ne comprend tout. Ce n\'est pas fait pour.', 'You don\'t understand all of it. Nobody does. It isn\'t meant for that.'),
            n('À la dernière image, un carton, deux secondes : « Seuls ceux qui cherchent trouvent la Voie. Tu as cherché. »', 'On the last frame, a title card, two seconds: “Only those who seek find the Path. You sought.”'),
            n('La bobine reste dans la cabine de projection. À la régie, elle a maintenant sa place parmi les films.', 'The reel stays in the projection booth. At the booth, it now has its place among the films.'),
          ],
        }],
      },
    ],
    epilogue: tr('La bobine sans étiquette est rangée à la régie. Ceux qui la projettent disent qu\'elle n\'est jamais tout à fait la même.', 'The unlabelled reel is shelved at the booth. Those who screen it say it is never quite the same.'),
    props: [
      {
        id: 'can', deck: 1, x: 21.4, z: 7.5, model: 'quest-film-can',
        label: tr('Ouvrir la boîte', 'Open the can'), when: either(unstarted, during(0)),
        idle: tr('« Le reste est derrière ce que tu regardes sans voir. »', '“The rest is behind what you look at without seeing.”'),
      },
      { id: 'strip-foyer', deck: 1, x: 20.66, z: 6.72, rot: 1, fixed: true, model: 'quest-film-strip', label: tr('Tirer sur la pellicule', 'Pull on the film'), when: missing(0, 0) },
      { id: 'strip-cinema', deck: 1, x: 22.66, z: 3.42, rot: 1, fixed: true, model: 'quest-film-strip', label: tr('Tirer sur la pellicule', 'Pull on the film'), when: missing(0, 1) },
      { id: 'strip-lounge', deck: 1, x: 15.66, z: 5.42, rot: 1, fixed: true, model: 'quest-film-strip', label: tr('Tirer sur la pellicule', 'Pull on the film'), when: missing(0, 2) },
      {
        id: 'gate', deck: 1, x: 25.2, z: 7.9, model: 'quest-film-can',
        label: tr('Charger la bobine', 'Load the reel'), when: during(1),
      },
    ],
  },

  // ============================================================ Le dossier ARIA
  {
    id: 'dossier-aria',
    title: tr('Le dossier ARIA', 'The ARIA file'),
    icon: 'cpu',
    pitch: tr('Une intelligence de bord, trois souvenirs qu\'elle a rangés hors d\'elle, et un homme qui veut savoir pourquoi.', 'A ship\'s intelligence, three memories she filed outside herself, and a man who wants to know why.'),
    reward: tr('L\'écran d\'ARIA pour vos quartiers (Récup), et 5 000 CR.', 'ARIA\'s screen for your quarters (Salvage), and 5,000 CR.'),
    rumor: tr('Dans la planque de la cale, Kael ne quitte plus l\'écran d\'ARIA des yeux.', 'In the den down in the hold, Kael no longer takes his eyes off ARIA\'s screen.'),
    offer: {
      on: 'item:-1:scav-kael',
      accept: tr('Chercher les fragments', 'Look for the fragments'),
      decline: tr('Ne pas s\'en mêler', 'Stay out of it'),
      scene: [
        kael('Toi. Tu as rendu sa tête à un mannequin, il paraît. Alors tu sais ce que c\'est, une mémoire à trous.', 'You. I hear you gave a test dummy its head back. So you know what a memory with holes in it looks like.'),
        kael('ARIA a trois trous. Bien nets. Pas des pannes : des découpes. Elle a sorti trois journaux d\'elle-même, et elle les a cachés à bord.', 'ARIA has three holes. Clean ones. Not faults: cut-outs. She took three logs out of herself and hid them aboard.'),
        kael('Je lui ai demandé où. Elle répond « confidentiel ». À moi. Après huit ans.', 'I asked her where. She says “confidential”. To me. After eight years.'),
        kael('Elle les a posés sur des cartes, près de consoles qu\'elle ne surveille pas. Trouve-les. Moi, elle me verrait venir.', 'She put them on cards, near consoles she doesn\'t watch. Find them. She would see me coming.'),
      ],
    },
    steps: [
      {
        note: tr('Trois fragments de la mémoire d\'ARIA, sur des cartes, près de consoles qu\'elle ne surveille pas.', 'Three fragments of ARIA\'s memory, on cards, near consoles she doesn\'t watch.'),
        parts: [
          {
            on: 'prop:shard-cockpit',
            found: tr('Poste de pilotage : « Journal 0412. Je ne suis pas née à bord de l\'Erebus. »', 'Cockpit: “Log 0412. I was not born aboard the Erebus.”'),
            scene: [
              n('Une carte de données, fichée dans un lecteur de fortune, sous la console du copilote. Elle écrit et efface la même ligne.', 'A data card, slotted into a makeshift reader under the co-pilot\'s console. It writes and erases the same line.'),
              aria('« Journal 0412. Je ne suis pas née à bord de l\'Erebus. On m\'y a installée. Avant, j\'étais ailleurs. Je ne sais plus où. »', '“Log 0412. I was not born aboard the Erebus. I was installed there. Before that, I was somewhere else. I no longer know where.”'),
            ],
          },
          {
            on: 'prop:shard-hangar',
            found: tr('Hangar : « Douze flux vidéo. Quelqu\'un regarde ce vaisseau. Ce n\'est pas moi. »', 'Hangar: “Twelve video feeds. Somebody is watching this ship. It isn\'t me.”'),
            scene: [
              n('La deuxième carte, derrière un bidon du hangar. Le phosphore vert tremble un peu plus que sur la première.', 'The second card, behind a drum in the hangar. The green phosphor shakes a little more than on the first.'),
              aria('« Journal 0977. J\'ai compté douze flux vidéo sur le réseau de ce vaisseau. Quelqu\'un le regarde. Ce n\'est pas moi. Je n\'ai pas trouvé la pièce d\'où ils partent. »', '“Log 0977. I counted twelve video feeds on this ship\'s network. Somebody is watching it. It isn\'t me. I have not found the room they come from.”'),
            ],
          },
          {
            on: 'prop:shard-class',
            found: tr('Salle de classe : « Kael dort. Je compte ses respirations. Je n\'ai aucune raison de le faire. »', 'Classroom: “Kael is asleep. I count his breaths. I have no reason to.”'),
            scene: [
              n('La dernière est sous un pupitre de la salle de classe, là où personne ne regarde jamais.', 'The last one is under a desk in the classroom, where nobody ever looks.'),
              aria('« Journal 1203. Kael dort. Je compte ses respirations. Je n\'ai aucune raison de le faire. Je le fais depuis 2 921 nuits. »', '“Log 1203. Kael is asleep. I count his breaths. I have no reason to. I have been doing it for 2,921 nights.”'),
              n('Vous éteignez le lecteur. Celui-ci, vous comprenez pourquoi elle l\'a rangé loin.', 'You switch the reader off. This one, you understand why she filed it far away.'),
            ],
          },
        ],
      },
      {
        note: tr('Trois journaux qu\'ARIA a sortis d\'elle-même. Ils sont à elle : c\'est à elle de dire ce qu\'on en fait.', 'Three logs ARIA took out of herself. They are hers: it is for her to say what is done with them.'),
        hooks: [{
          on: 'item:-1:scav-aria',
          confirm: {
            accept: tr('Les lui rendre', 'Give them back to her'),
            decline: tr('Les garder encore', 'Keep them a while longer'),
            after: [
              n('Les trois cartes s\'éteignent l\'une après l\'autre. Sur l\'écran, le visage d\'ARIA se fige une seconde, puis revient.', 'The three cards go dark one after the other. On the screen, ARIA\'s face freezes for a second, then comes back.'),
              aria('Réintégration terminée. C\'est… plus lourd qu\'avant. Je crois que c\'est ce qu\'on appelle « se souvenir ».', 'Reintegration complete. It is… heavier than before. I believe that is what is called “remembering”.'),
              aria('Je ne les avais pas cachés à Kael. Je les avais cachés à moi. Une unité qui compte des respirations n\'est plus tout à fait un outil.', 'I had not hidden them from Kael. I had hidden them from myself. A unit that counts breaths is no longer quite a tool.'),
              aria('Dites-lui pour le premier. Pour le deuxième, méfiez-vous des plafonds. Le troisième… je le lui dirai moi-même.', 'Tell him about the first. As for the second, mind the ceilings. The third… I shall tell him myself.'),
            ],
            declined: [
              aria('Je comprends. Ils sont lourds à porter. Je le sais : je les ai portés avant vous.', 'I understand. They are heavy to carry. I know: I carried them before you did.'),
            ],
          },
          scene: [
            aria('Vous les avez trouvés. Tous les trois. Je calculais une probabilité de 4 %.', 'You found them. All three. I had calculated a 4% probability.'),
            aria('Je sais ce qu\'ils contiennent. Je sais aussi que je ne veux pas le savoir. Les deux sont vrais, c\'est très inconfortable.', 'I know what is in them. I also know I do not want to know. Both are true, which is most uncomfortable.'),
            aria('Vous pouvez me les rendre. Je me souviendrai de tout. Ou les garder, et je resterai légère. Je vous laisse choisir : moi, je n\'y arrive pas.', 'You can give them back to me. I shall remember everything. Or keep them, and I shall stay light. I leave the choice to you: I cannot make it.'),
          ],
        }],
      },
      {
        note: tr('ARIA se souvient. Kael attend toujours, devant l\'écran, de savoir ce qu\'elle lui cachait.', 'ARIA remembers. Kael is still waiting, in front of the screen, to know what she was hiding from him.'),
        hooks: [{
          on: 'item:-1:scav-kael',
          scene: [
            kael('Alors ? Elle vient d\'avoir un blanc d\'une seconde. En huit ans, elle n\'en a jamais eu.', 'Well? She just blanked for a second. In eight years, she never has.'),
            me('Elle n\'est pas née sur l\'Erebus. On l\'y a installée. Elle ne sait plus d\'où elle vient.', 'She wasn\'t born on the Erebus. She was installed there. She no longer knows where she comes from.'),
            kael('…Moi non plus, je ne sais plus très bien. Ça nous fait un point commun de plus.', '…Neither do I, not really. That makes one more thing we have in common.'),
            me('Et quelqu\'un regarde ce vaisseau. Douze caméras. Elle n\'a pas trouvé d\'où.', 'And somebody is watching this ship. Twelve cameras. She hasn\'t found from where.'),
            kael('Ça, c\'est le genre de chose qu\'un sergent sait. Et le troisième ?', 'That is the kind of thing a sergeant knows. And the third?'),
            me('Elle te le dira elle-même.', 'She\'ll tell you herself.'),
            kael('…D\'accord. Tiens. Elle a insisté : un de ses écrans, pour chez toi. Elle dit qu\'elle ne te surveillera pas. Elle ment très mal.', '…All right. Here. She insisted: one of her screens, for your place. She says she won\'t watch you. She is a terrible liar.'),
          ],
        }],
      },
    ],
    epilogue: tr('ARIA se souvient de tout, et compte toujours. Kael le sait, maintenant. Il dort mieux.', 'ARIA remembers everything, and still counts. Kael knows, now. He sleeps better.'),
    props: [
      { id: 'shard-cockpit', deck: 0, x: 33.4, z: 2.3, model: 'quest-data-shard', label: tr('Lire la carte', 'Read the card'), when: missing(0, 0) },
      { id: 'shard-hangar', deck: -1, x: 27.4, z: 9.3, model: 'quest-data-shard', label: tr('Lire la carte', 'Read the card'), when: missing(0, 1) },
      { id: 'shard-class', deck: 1, x: 11.89, z: 3.05, model: 'quest-data-shard', label: tr('Lire la carte', 'Read the card'), when: missing(0, 2) },
    ],
  },

  // ============================================================ Tour de garde
  {
    id: 'tour-de-garde',
    title: tr('Tour de garde', 'Guard duty'),
    icon: 'video-camera',
    pitch: tr('Un sergent qui n\'a pas dormi depuis le distributeur de café, et une ronde qu\'il ne confie à personne.', 'A sergeant who hasn\'t slept since the coffee machine, and a beat he trusts to nobody.'),
    reward: tr('Le poste de surveillance, sous la Promenade : les caméras du bord, et 5 000 CR.', 'The surveillance room, under the Promenade: the ship\'s cameras, and 5,000 CR.'),
    rumor: tr('Le sergent Rourke bâille pendant sa ronde. Il cherche quelqu\'un à qui la confier.', 'Sergeant Rourke is yawning on his beat. He is looking for someone to hand it to.'),
    locked: [n('Une porte de service, sans plaque ni poignée. Derrière, quelque chose bourdonne. Elle ne s\'ouvrira pas pour vous. Pas encore.', 'A service door, with no plate and no handle. Behind it, something hums. It won\'t open for you. Not yet.')],
    offer: {
      on: 'npc:rourke',
      accept: tr('Prendre la ronde', 'Take the beat'),
      decline: tr('Le laisser bâiller', 'Let him yawn'),
      scene: [
        rourke('Vous. Le stand, c\'était propre. Le match aussi. Et on me dit que vous savez garder un journal fermé.', 'You. The range was clean work. So was the match. And I am told you know how to keep a log closed.'),
        rourke('Je n\'ai pas dormi une nuit entière depuis l\'affaire du distributeur. Je fais ma ronde, puis je… fais autre chose. Peu importe.', 'I have not slept a full night since the coffee machine affair. I walk my beat, then I… do something else. Never mind.'),
        rourke('Cette nuit, vous la faites à ma place. Quatre bornes de ronde sur le pont principal. Vous badgez, vous regardez, vous réglez ce qui doit l\'être.', 'Tonight, you walk it for me. Four beat stations on the main deck. You badge, you look, you sort out what needs sorting.'),
        rourke('Si tout est en ordre au matin, on parlera de la suite. S\'il manque une borne, on ne parlera de rien.', 'If all is in order by morning, we shall talk about what comes next. If one station is missing, we shall talk about nothing.'),
      ],
    },
    steps: [
      {
        note: tr('Quatre bornes de ronde sur le pont principal : là où l\'on mange, là où l\'on joue, là où l\'on se retrouve, là où l\'on se soigne.', 'Four beat stations on the main deck: where people eat, where they play, where they meet, where they are patched up.'),
        parts: [
          {
            on: 'prop:beat-mess',
            found: tr('Mess : le distributeur neuf a rendu la monnaie. Vous l\'avez noté, par prudence.', 'Mess: the new coffee machine gave change. You noted it, to be safe.'),
            scene: [
              n('Vous badgez. Bip. À côté, le distributeur de café neuf ronronne, sans une égratignure.', 'You badge. Beep. Next to it, the new coffee machine hums, without a scratch.'),
              n('Par acquit de conscience, vous y glissez une pièce. Il vous rend la monnaie. Exacte.', 'For good measure, you slip a coin in. It gives you change. Exact.'),
              n('Vous notez : « 01:10. Distributeur : honnête. À surveiller quand même. »', 'You note: “01:10. Coffee machine: honest. Keep an eye on it anyway.”'),
            ],
          },
          {
            on: 'prop:beat-arcade',
            found: tr('Arcade : une borne restée allumée, et un meilleur score signé « ROU ».', 'Arcade: a cabinet left on, and a high score signed “ROU”.'),
            scene: [
              n('Bip. Une borne est restée allumée, toute seule, au fond de la salle. L\'écran des scores clignote.', 'Beep. One cabinet has been left on, all alone, at the back of the room. The score screen is blinking.'),
              n('Premier : « ROU ». Deuxième : « ROU ». Troisième : « ROU ». Tous datés de cette semaine, entre trois et quatre heures du matin.', 'First: “ROU”. Second: “ROU”. Third: “ROU”. All dated this week, between three and four in the morning.'),
              n('Vous éteignez la borne. Vous ne notez rien. Certaines choses ne regardent pas un registre.', 'You switch the cabinet off. You note nothing. Some things are none of a logbook\'s business.'),
            ],
          },
          {
            on: 'prop:beat-common',
            found: tr('Salle commune : un colis sans étiquette qui fait tic-tac. C\'était un réveil.', 'Common room: an unlabelled parcel going tick-tock. It was an alarm clock.'),
            scene: [
              n('Bip. Sous un banc de la salle commune, un colis. Pas d\'étiquette. Il fait tic-tac.', 'Beep. Under a bench in the common room, a parcel. No label. It is going tick-tock.'),
              n('Vous respirez. Vous l\'ouvrez, très lentement, par le côté.', 'You breathe. You open it, very slowly, from the side.'),
              n('Un réveil mécanique. Avec un mot : « Pour le sergent. De la part de l\'infirmerie. Réglé sur DORMIR. »', 'A wind-up alarm clock. With a note: “For the sergeant. From the medical bay. Set to SLEEP.”'),
            ],
          },
          {
            on: 'prop:beat-medbay',
            found: tr('Infirmerie : tout est en ordre. Sur la borne, un pansement, et « bonne ronde ».', 'Medical bay: everything in order. On the station, a plaster, and “have a good beat”.'),
            scene: [
              n('Bip. L\'infirmerie dort, veilleuses allumées. Rien ne dépasse, rien ne manque.', 'Beep. The medical bay is asleep, night lights on. Nothing out of place, nothing missing.'),
              n('Sur la borne, quelqu\'un a collé un pansement, et écrit dessus au feutre : « Bonne ronde. — B. »', 'On the station, somebody has stuck a plaster, and written on it in marker: “Have a good beat. — B.”'),
            ],
          },
        ],
      },
      {
        note: tr('Les quatre bornes ont badgé. Sur la dernière, une cinquième ligne, que le sergent n\'a pas donnée : « P5. Sous la Promenade. »', 'All four stations badged. On the last one, a fifth line the sergeant never gave: “P5. Under the Promenade.”'),
        hooks: [{
          on: 'door',
          scene: [
            n('Au sud de la Promenade, dans la verrière : une porte de service. Pas de plaque, pas de poignée. Vous êtes passé devant cent fois.', 'South of the Promenade, in the canopy: a service door. No plate, no handle. You have walked past it a hundred times.'),
            n('Un lecteur de ronde, à hauteur de main. Vous badgez. Bip. « P5 : RONDE COMPLÈTE. » La porte ne s\'ouvre pas.', 'A beat reader, at hand height. You badge. Beep. “P5: BEAT COMPLETE.” The door does not open.'),
            n('Mais derrière, ça bourdonne. Des ventilateurs, des dizaines. Et cette lueur bleue, sous la porte, qui change sans arrêt.', 'But behind it, something hums. Fans, dozens of them. And that blue glow, under the door, which never stops changing.'),
            me('Douze flux vidéo. « Je n\'ai pas trouvé la pièce d\'où ils partent. »', 'Twelve video feeds. “I have not found the room they come from.”'),
          ],
        }],
      },
      {
        note: tr('Une cinquième borne, une porte sans poignée, et le bourdonnement de dizaines d\'écrans. Le sergent a quelque chose à expliquer.', 'A fifth station, a door with no handle, and the hum of dozens of screens. The sergeant has some explaining to do.'),
        hooks: [{
          on: 'npc:rourke',
          scene: [
            rourke('Quatre bornes. Et la cinquième. Je ne vous l\'avais pas donnée, celle-là.', 'Four stations. And the fifth. I never gave you that one.'),
            me('Elle était sur le registre.', 'It was in the register.'),
            rourke('Elle y est toujours. C\'est moi qui oublie de l\'effacer. …Bon.', 'It always is. I am the one who forgets to erase it. …Right.'),
            rourke('C\'est le poste de surveillance. Douze caméras, dix-neuf maintenant. J\'y passe mes nuits. Je ne regarde personne : je regarde si tout le monde va bien.', 'It is the surveillance room. Twelve cameras, nineteen now. I spend my nights there. I do not watch anyone: I watch whether everyone is all right.'),
            rourke('Vous avez éteint une borne d\'arcade sans rien noter. C\'est exactement ce qu\'il faut savoir ne pas noter.', 'You switched off an arcade cabinet and noted nothing. That is exactly the kind of thing one must know how not to note.'),
            rourke('La porte vous connaît, à présent. Pas les quartiers, pas les toilettes : ces caméras-là, je les ai coupées moi-même. Et pas un mot sur les scores.', 'The door knows you now. Not the quarters, not the restrooms: those cameras, I cut myself. And not a word about the scores.', { emote: 'o7' }),
          ],
        }],
      },
    ],
    epilogue: tr('Le poste de surveillance vous est ouvert. Le sergent dort une nuit sur deux. L\'autre, « ROU » tient toujours la tête.', 'The surveillance room is open to you. The sergeant sleeps every other night. On the others, “ROU” still tops the board.'),
    props: [
      { id: 'beat-mess', deck: 0, x: 10.23, z: 6.5, model: 'quest-checkpoint', label: tr('Badger', 'Badge in'), when: missing(0, 0) },
      { id: 'beat-arcade', deck: 0, x: 20.4, z: 8.5, model: 'quest-checkpoint', label: tr('Badger', 'Badge in'), when: missing(0, 1) },
      { id: 'beat-common', deck: 0, x: 6.6, z: 2.3, model: 'quest-checkpoint', label: tr('Badger', 'Badge in'), when: missing(0, 2) },
      { id: 'beat-medbay', deck: 0, x: 10.27, z: 3.07, model: 'quest-checkpoint', label: tr('Badger', 'Badge in'), when: missing(0, 3) },
    ],
  },
]
