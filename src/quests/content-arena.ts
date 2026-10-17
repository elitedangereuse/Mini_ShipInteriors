import { CHEF } from '../chef'
import { GARDENER } from '../gardener'
import { tr } from '../i18n'
import { DROID, MECHANIC } from '../mechanic'
import { NURSE } from '../nurse'
import { SERGEANT } from '../patrol'
import type { QuestState } from '../../shared/quests.js'
import type { Line } from './cinematic'
import type { QuestContent, When } from './content'

/*
 * Les recrues de CMDR Arena : une petite quête par personnage jouable, qui l'ouvre à l'arène
 * (cf. `character` dans shared/quests.js). C'est le second tutoriel : après le simulateur, elles
 * font parler tout l'équipage et passer par les trois ponts (l'ascenseur, la cale, la serre, le
 * hangar, le poste de pilotage…). Le sergent d'abord ; sa recrue ouvre celles des cinq autres, qui
 * ouvrent à leur tour les histoires du bord.
 *
 *   Bon pour le service ──┬► Tomates de compétition ──► Le dernier match
 *                         ├► Visite médicale ─────────► Poids lourds
 *                         ├► Calibrage ───────────────► La gamelle vide, Quatre cent douze
 *                         ├► Mauvaises herbes ────────► Silence, on dribble
 *                         ├► Le dernier verre ────────► La recette de Jacques (avec La gamelle vide)
 *                         └► Permis de tir, L'essayage
 *
 * Plus directes que les autres : leur journal dit où aller, c'est leur rôle. Sauf Le dernier
 * verre : le bar de Jacques se cherche, sans indice sur son entrée. Mêmes outils d'écriture que
 * content.ts.
 */

const line = (who: string | undefined, fr: string, en: string, more: Partial<Line> = {}): Line => ({ who, text: tr(fr, en), ...more })
const n = (fr: string, en: string) => line(undefined, fr, en)
const me = (fr: string, en: string, more?: Partial<Line>) => line('me', fr, en, more)
const speaker = (who: string) => (fr: string, en: string, more?: Partial<Line>) => line(who, fr, en, more)

const rourke = speaker(SERGEANT)
const marcel = speaker(CHEF)
const betty = speaker(NURSE)
const nico = speaker(MECHANIC)
const boulon = speaker(DROID)
const capucine = speaker(GARDENER)
const jacques = speaker('Jacques')

const unstarted: When = (s: QuestState | undefined) => !s
const during = (from: number, to = from): When => (s) => !!s && !s.done && s.step >= from && s.step <= to
const missing = (step: number, flag: number): When => (s) => !!s && !s.done && s.step === step && !((s.flags >> flag) & 1)

/** Ce qu'elle rapporte : le personnage, à l'arène. */
const unlocks = (name: string) => tr(`${name}, jouable dans CMDR Arena.`, `${name}, playable in CMDR Arena.`)

export const ARENA_QUESTS: QuestContent[] = [
  // ============================================================ Bon pour le service
  {
    id: 'bon-pour-le-service',
    title: tr('Bon pour le service', 'Fit for duty'),
    icon: 'shield-warning',
    pitch: tr('Le sergent Rourke recrute pour CMDR Arena. Il lui manque une signature : la vôtre.', 'Sergeant Rourke is recruiting for CMDR Arena. He is missing one signature: yours.'),
    reward: unlocks('Rourke'),
    offer: {
      on: 'npc:rourke',
      accept: tr('Signer', 'Sign up'),
      decline: tr('Plus tard', 'Later'),
      scene: [
        rourke('Vous, là. La recrue du simulateur. Swann dit que vous savez marcher droit. On va voir ça.', 'You there. The simulator recruit. Swann says you can walk in a straight line. We\'ll see.'),
        rourke('Dans la cale, il y a l\'arène : CMDR Arena. Des duels par équipes, pour l\'honneur. Personne n\'y entre sans être inscrit au terminal du lobby.', 'Down in the hold there\'s the arena: CMDR Arena. Team duels, for honour. Nobody gets in without signing up at the lobby terminal.'),
        rourke('Et à l\'arène, on ne joue pas n\'importe qui : on joue l\'équipage. Moi, le chef, l\'infirmière, le mécano… Chacun a son prix.', 'And in the arena you don\'t play just anyone: you play the crew. Me, the chef, the nurse, the mechanic… Everyone has a price.'),
        rourke('Le mien est simple. Allez vous inscrire, revenez me voir, et je signe avec vous.', 'Mine is simple. Go and sign up, come back to me, and I\'ll sign up with you.'),
      ],
    },
    steps: [
      {
        note: tr('Le terminal d\'inscription est au lobby de CMDR Arena, dans la cale : l\'ascenseur, tout en bas.', 'The sign-up terminal is in the CMDR Arena lobby, in the hold: take the lift all the way down.'),
        hooks: [{
          on: 'item:-1:arena-terminal',
          scene: [
            n('Le terminal s\'allume à votre approche. Une voix synthétique, enthousiaste à l\'excès : BIENVENUE, COMBATTANT.', 'The terminal lights up as you approach. A synthetic voice, far too cheerful: WELCOME, FIGHTER.'),
            n('Votre nom s\'inscrit en lettres orange. En face, six cases, six visages de l\'équipage. Six cadenas.', 'Your name appears in orange letters. Opposite, six slots, six crew faces. Six padlocks.'),
            n('AUCUN PERSONNAGE DISPONIBLE. CONSULTEZ L\'ÉQUIPAGE.', 'NO CHARACTER AVAILABLE. CONSULT THE CREW.'),
            me('…Il aurait pu le dire.', '…He could have said.'),
          ],
        }],
      },
      {
        note: tr('Inscrit, mais sans personnage. Le sergent fait sa ronde sur le pont principal : il a promis de signer.', 'Signed up, but with no character. The sergeant walks his beat on the main deck: he promised to sign.'),
        hooks: [{
          on: 'npc:rourke',
          scene: [
            rourke('Six cadenas ? Évidemment. On ne prête pas sa tête au premier venu.', 'Six padlocks? Of course. Nobody lends their face to the first one who comes along.'),
            rourke('Vous êtes allé jusqu\'en bas sans vous perdre. Pour moi, c\'est bon pour le service.', 'You made it all the way down without getting lost. That\'s fit for duty in my book.', { emote: 'oui' }),
            n('Rourke tape quelque chose sur son bracelet. Quelque part dans la cale, un cadenas saute.', 'Rourke taps something on his wristband. Somewhere in the hold, a padlock snaps open.'),
            rourke('Ma mitraillette de service est à vous, à l\'arène. Les autres, il faudra aller les voir : Marcel au mess, Betty à l\'infirmerie, Nico au hangar, Capucine à la serre.', 'My service SMG is yours, in the arena. The others, you\'ll have to go and see: Marcel in the mess, Betty in the medical bay, Nico in the hangar, Capucine in the greenhouse.'),
            rourke('Et Jacques. Si vous trouvez son bar. Moi, je n\'ai jamais trouvé.', 'And Jacques. If you can find his bar. I never have.'),
          ],
        }],
      },
    ],
    epilogue: tr('Le sergent a signé. Rourke vous attend à l\'arène, et l\'équipage a entendu parler de vous.', 'The sergeant signed. Rourke is waiting for you in the arena, and the crew has heard about you.'),
  },

  // ============================================================ Tomates de compétition
  {
    id: 'tomates-de-competition',
    title: tr('Tomates de compétition', 'Competition tomatoes'),
    icon: 'chef-hat',
    pitch: tr('Le lance-tomates de Marcel est à sec. Il ne tire que des tomates de la serre.', 'Marcel\'s tomato launcher is empty. It only fires greenhouse tomatoes.'),
    reward: unlocks('Marcel'),
    offer: {
      on: 'npc:marcel',
      accept: tr('Aller chercher les tomates', 'Fetch the tomatoes'),
      decline: tr('Pas le temps', 'No time'),
      scene: [
        marcel('Ah, c\'est vous, la recrue du sergent. Il paraît que vous voulez me jouer à l\'arène.', 'Ah, you\'re the sergeant\'s recruit. I hear you want to play me in the arena.'),
        marcel('Mon lance-tomates, il est à sec. Et je ne charge pas n\'importe quoi : des tomates de la serre, celles de Capucine. Bien mûres. Qui éclatent.', 'My tomato launcher is empty. And I don\'t load just anything: greenhouse tomatoes, Capucine\'s. Nice and ripe. The kind that burst.'),
        marcel('Montez la voir au pont supérieur, ramenez-moi une cagette, et je vous prête ma toque.', 'Go up and see her on the upper deck, bring me back a crate, and I\'ll lend you my hat.'),
      ],
    },
    steps: [
      {
        note: tr('Des tomates bien mûres, de la serre hydroponique : Capucine les cultive, au pont supérieur.', 'Nice ripe tomatoes, from the hydroponics bay: Capucine grows them, on the upper deck.'),
        hooks: [{
          on: 'npc:capucine',
          scene: [
            capucine('Des tomates pour Marcel ? Pour les manger ou pour les lancer ?', 'Tomatoes for Marcel? For eating or for throwing?'),
            me('…Les deux ?', '…Both?'),
            capucine('Il ne change pas. Tenez : les plus moches. Celles-là, elles éclatent très bien.', 'He never changes. Here: the ugliest ones. Those burst beautifully.', { emote: 'joie' }),
            n('Capucine vous tend une cagette de tomates cabossées, encore tièdes des lampes de culture.', 'Capucine hands you a crate of dented tomatoes, still warm from the grow lamps.'),
          ],
        }],
      },
      {
        note: tr('Une cagette de tomates cabossées, à rapporter à Marcel, au mess du pont principal.', 'A crate of dented tomatoes, to bring back to Marcel, in the main deck mess.'),
        hooks: [{
          on: 'npc:marcel',
          scene: [
            marcel('Regardez-moi ça. Parfaites. Elles vont faire un de ces dégâts…', 'Look at those. Perfect. They\'ll make such a mess…', { emote: 'joie' }),
            marcel('Marché conclu : à l\'arène, je suis à vous. Lent, mais solide. Comme ma sauce.', 'It\'s a deal: in the arena, I\'m yours. Slow, but solid. Like my sauce.'),
            marcel('Et si quelqu\'un se plaint des taches, envoyez-le au sergent.', 'And if anyone complains about the stains, send them to the sergeant.'),
          ],
        }],
      },
    ],
    epilogue: tr('Le lance-tomates est plein. Marcel vous attend à l\'arène ; le mess sent la sauce.', 'The tomato launcher is full. Marcel is waiting for you in the arena; the mess smells of sauce.'),
  },

  // ============================================================ Visite médicale
  {
    id: 'visite-medicale',
    title: tr('Visite médicale', 'Medical check'),
    icon: 'first-aid-kit',
    pitch: tr('Le pistolet à seringues de Betty se bloque. Seul un mécanicien peut le régler.', 'Betty\'s syringe gun keeps jamming. Only a mechanic can fix it.'),
    reward: unlocks('Betty'),
    offer: {
      on: 'npc:betty',
      accept: tr('Porter le pistolet', 'Take the gun'),
      decline: tr('Une autre fois', 'Another time'),
      scene: [
        betty('Vous venez pour l\'arène, je suppose. Tout le monde vient pour l\'arène. Personne ne vient pour une piqûre.', 'You\'re here about the arena, I suppose. Everyone comes about the arena. Nobody comes for a jab.'),
        betty('Mon pistolet à seringues se bloque au troisième tir. Pour soigner une équipe, c\'est embêtant.', 'My syringe gun jams on the third shot. When you\'re healing a team, that\'s awkward.'),
        betty('Portez-le à Nico, au hangar de la cale. Il râlera, mais il le réglera.', 'Take it to Nico, in the hold hangar. He\'ll grumble, but he\'ll fix it.'),
      ],
    },
    steps: [
      {
        note: tr('Un pistolet à seringues qui se bloque, à faire régler par Nico, le mécanicien du hangar, dans la cale.', 'A syringe gun that jams, for Nico to fix: the mechanic in the hangar, down in the hold.'),
        hooks: [{
          on: 'npc:nico',
          scene: [
            nico('Le pistolet de Betty ? Encore ? Elle tire avec des seringues pleines de sirop, aussi.', 'Betty\'s gun? Again? She fires syringes full of syrup, that\'s why.'),
            boulon('Bip. (Ressort fatigué.)', 'Beep. (Tired spring.)'),
            n('Nico démonte le chargeur, souffle dedans, change un ressort et le remonte sans regarder.', 'Nico takes the magazine apart, blows into it, swaps a spring and puts it back together without looking.'),
            nico('Voilà. Dites-lui que ça fera une visite médicale gratuite. Elle saura.', 'There. Tell her that\'s one free check-up. She\'ll know.'),
          ],
        }],
      },
      {
        note: tr('Le pistolet est réglé. Betty attend à l\'infirmerie, sur le pont principal.', 'The gun is fixed. Betty is waiting in the medical bay, on the main deck.'),
        hooks: [{
          on: 'npc:betty',
          scene: [
            betty('Un ressort neuf ? Il aurait pu le faire il y a trois mois.', 'A new spring? He could have done that three months ago.'),
            betty('Et une visite gratuite, en plus. Il s\'est encore brûlé, je parie.', 'And a free check-up, too. He\'s burnt himself again, I bet.'),
            betty('Bon. À l\'arène, je soigne les vôtres et je pique les autres. Ne me demandez pas laquelle est laquelle.', 'Right. In the arena, I heal your side and sting the other. Don\'t ask me which syringe is which.', { emote: 'joie' }),
          ],
        }],
      },
    ],
    epilogue: tr('Le pistolet à seringues ne se bloque plus. Betty vous attend à l\'arène.', 'The syringe gun no longer jams. Betty is waiting for you in the arena.'),
  },

  // ============================================================ Calibrage
  {
    id: 'calibrage',
    title: tr('Calibrage', 'Calibration'),
    icon: 'rocket',
    pitch: tr('Boulon voit des buissons partout, même là où il n\'y en a pas.', 'Bolt sees bushes everywhere, even where there aren\'t any.'),
    reward: unlocks(tr('Nico et Boulon', 'Nico & Bolt')),
    offer: {
      on: 'npc:nico',
      accept: tr('Aller au poste de pilotage', 'Go to the cockpit'),
      decline: tr('Laisser Boulon à ses buissons', 'Leave Bolt to his bushes'),
      scene: [
        nico('L\'arène ? Je veux bien. Mais Boulon est déréglé : son scanner voit des buissons partout.', 'The arena? Sure. But Bolt is off: his scanner sees bushes everywhere.'),
        boulon('Bip ! (Buisson.) Bip ! (Buisson.)', 'Beep! (Bush.) Beep! (Bush.)'),
        nico('Ça, c\'est un extincteur. Il faut le recaler sur les capteurs du vaisseau : la balise de calibrage, au poste de pilotage du pont principal.', 'That\'s a fire extinguisher. He needs recalibrating against the ship\'s sensors: the calibration beacon, in the main deck cockpit.'),
        nico('Allez l\'allumer, je m\'occupe de lui pendant ce temps.', 'Go and switch it on, I\'ll keep an eye on him meanwhile.'),
      ],
    },
    steps: [
      {
        note: tr('La balise de calibrage est au poste de pilotage, à l\'avant du pont principal.', 'The calibration beacon is in the cockpit, at the front of the main deck.'),
        hooks: [{
          on: 'prop:beacon',
          scene: [
            n('Une balise sur trépied, entre les sièges du poste de pilotage. Un seul bouton, et une étiquette : NE PAS TOUCHER (SAUF NICO).', 'A beacon on a tripod, between the cockpit seats. One button, and a label: DO NOT TOUCH (EXCEPT NICO).'),
            n('Vous appuyez. La balise siffle, tourne trois fois sur elle-même, et un signal part vers la cale.', 'You press it. The beacon whistles, spins three times, and a signal goes out towards the hold.'),
            n('Par la verrière, les étoiles. Le vaisseau est grand, vu d\'ici.', 'Through the canopy, the stars. The ship looks big, from here.'),
          ],
        }],
      },
      {
        note: tr('Le signal est parti. Nico et Boulon attendent au hangar, dans la cale.', 'The signal is out. Nico and Bolt are waiting in the hangar, in the hold.'),
        hooks: [{
          on: 'npc:nico',
          scene: [
            boulon('Bip. (Extincteur.)', 'Beep. (Fire extinguisher.)'),
            nico('Il a raison, cette fois. Bravo, mon grand.', 'He\'s right, this time. Well done, buddy.', { emote: 'joie' }),
            nico('À l\'arène, on est à vous : moi je vise, lui scanne les buissons. Les vrais. Par contre, on n\'encaisse rien, tous les deux.', 'In the arena, we\'re yours: I aim, he scans the bushes. The real ones. We can\'t take a hit, though, either of us.'),
          ],
        }],
      },
    ],
    epilogue: tr('Boulon distingue un buisson d\'un extincteur. Nico et lui vous attendent à l\'arène.', 'Bolt can tell a bush from a fire extinguisher. He and Nico are waiting for you in the arena.'),
    props: [
      {
        id: 'beacon', deck: 0, x: 33.5, z: 6.5, model: 'quest-beacon',
        label: tr('Allumer la balise', 'Switch on the beacon'), when: during(0),
      },
    ],
  },

  // ============================================================ Mauvaises herbes
  {
    id: 'mauvaises-herbes',
    title: tr('Mauvaises herbes', 'Weeds'),
    icon: 'potted-plant',
    pitch: tr('Deux graines carnivores ont filé de la serre. Elles poussent quelque part, et elles mordent.', 'Two carnivorous seeds have escaped the greenhouse. They\'re growing somewhere, and they bite.'),
    reward: unlocks('Capucine'),
    offer: {
      on: 'npc:capucine',
      accept: tr('Chercher les pousses', 'Find the sprouts'),
      decline: tr('Ne pas s\'en mêler', 'Stay out of it'),
      scene: [
        capucine('Vous tombez bien. J\'ai perdu deux graines. Pas des graines de radis : mes graines d\'arène.', 'Good timing. I\'ve lost two seeds. Not radish seeds: my arena seeds.'),
        capucine('Elles ont dû s\'accrocher à quelqu\'un et tomber ailleurs. Une au pont principal, une autre ici, au pont supérieur. Je le sens.', 'They must have hitched a ride on someone and dropped off elsewhere. One on the main deck, another one up here. I can feel it.'),
        capucine('Si elles prennent racine dans une pièce commune, quelqu\'un va se faire mordre les chevilles. Ramenez-les-moi avant.', 'If they take root in a common room, someone\'s ankles are going to get bitten. Bring them back before that.'),
      ],
    },
    steps: [
      {
        note: tr('Deux pousses carnivores : une sur le pont principal, sans doute là où l\'on se retrouve ; une au pont supérieur, là où l\'on vient lire.', 'Two carnivorous sprouts: one on the main deck, probably where people gather; one on the upper deck, where people come to read.'),
        parts: [
          {
            on: 'prop:sprout-common',
            found: tr('Une pousse dans la salle commune, qui grignotait un pied de table.', 'A sprout in the common room, nibbling a table leg.'),
            scene: [
              n('Entre deux fauteuils de la salle commune, une pousse vert vif claque des mâchoires en direction d\'un pied de table.', 'Between two common room armchairs, a bright green sprout snaps its jaws at a table leg.'),
              n('Vous la soulevez avec sa motte. Elle vous mord le gant, sans conviction, puis se rendort.', 'You lift it out, roots and all. It bites your glove half-heartedly, then goes back to sleep.'),
            ],
          },
          {
            on: 'prop:sprout-library',
            found: tr('Une pousse à la bibliothèque, qui avait déjà mangé une page.', 'A sprout in the library, which had already eaten a page.'),
            scene: [
              n('Au pied d\'un rayonnage de la bibliothèque, une pousse mâchonne une page arrachée. Un traité de botanique, évidemment.', 'At the foot of a library shelf, a sprout is chewing a torn-out page. A botany treatise, of course.'),
              n('Elle grogne quand vous la prenez. Elle a meilleur goût que le livre, apparemment.', 'It growls when you pick it up. Apparently you taste better than the book.'),
            ],
          },
        ],
      },
      {
        note: tr('Les deux pousses sont dans votre sac, et elles s\'impatientent. Capucine attend à la serre.', 'Both sprouts are in your bag, and they\'re getting restless. Capucine is waiting in the greenhouse.'),
        hooks: [{
          on: 'npc:capucine',
          scene: [
            capucine('Les voilà, mes petites ! Vous n\'avez mordu personne ? …Juste vous ? Ça compte pas.', 'There they are, my little ones! Didn\'t bite anyone? …Just you? That doesn\'t count.', { emote: 'joie' }),
            capucine('Merci. À l\'arène, je sèmerai pour vous. Là où l\'adversaire va passer. C\'est tout l\'art.', 'Thank you. In the arena, I\'ll sow for you. Wherever the enemy is about to walk. That\'s the whole art of it.'),
          ],
        }],
      },
    ],
    epilogue: tr('Les deux pousses ont retrouvé la serre. Capucine vous attend à l\'arène.', 'Both sprouts are back in the greenhouse. Capucine is waiting for you in the arena.'),
    props: [
      { id: 'sprout-common', deck: 0, x: 6.6, z: 12.4, model: 'quest-sprout', label: tr('Attraper la pousse', 'Catch the sprout'), when: missing(0, 0) },
      { id: 'sprout-library', deck: 1, x: 17.3, z: 12.2, model: 'quest-sprout', label: tr('Attraper la pousse', 'Catch the sprout'), when: missing(0, 1) },
    ],
  },

  // ============================================================ Le dernier verre
  {
    id: 'dernier-verre',
    title: tr('Le dernier verre', 'One last drink'),
    icon: 'martini',
    pitch: tr('Une ardoise vante un bar que personne n\'a jamais vu.', 'A chalkboard advertises a bar nobody has ever seen.'),
    reward: unlocks('Jacques'),
    rumor: tr('Au mess, quelqu\'un a posé une ardoise de bar. Marcel jure que ce n\'est pas la sienne.', 'In the mess, someone has put up a bar chalkboard. Marcel swears it isn\'t his.'),
    offer: {
      on: 'prop:slate',
      accept: tr('Chercher le bar', 'Look for the bar'),
      decline: tr('Laisser l\'ardoise', 'Leave the chalkboard'),
      scene: [
        n('Une ardoise de bistrot, posée contre le mur du mess. À la craie, d\'une écriture penchée : CHEZ JACQUES. COCKTAIL DU JOUR : SURPRISE.', 'A bistro chalkboard, propped against the mess wall. In chalk, in slanted handwriting: CHEZ JACQUES. COCKTAIL OF THE DAY: SURPRISE.'),
        n('Dessous, plus petit : « Les habitués savent où nous trouver. »', 'Underneath, smaller: “Regulars know where to find us.”'),
        n('Pas d\'adresse, pas de plan. Au mess, personne n\'a l\'air d\'en savoir plus.', 'No address, no map. Nobody in the mess seems to know any more.'),
      ],
    },
    steps: [
      {
        note: tr('Chez Jacques est quelque part à bord. Les habitués savent où ; aucun n\'en dira plus.', 'Chez Jacques is somewhere aboard. Regulars know where; none of them will say.'),
        hooks: [{
          on: 'item:-1:bartender',
          scene: [
            jacques('Tiens. Un nouveau. Par les conduits, comme tout le monde ?', 'Well. A new one. Through the ducts, like everyone?'),
            me('Il y a une ardoise au mess. Avec votre nom.', 'There\'s a chalkboard in the mess. With your name on it.'),
            jacques('Mon ardoise ! Je me demandais où elle était passée. Marcel a dû la trouver encombrante.', 'My chalkboard! I was wondering where it went. Marcel must have found it in the way.'),
            jacques('Bon. Qui trouve le bar mérite le dernier verre. Et l\'arène, si ça vous chante : mes cocktails y flambent encore mieux qu\'au comptoir.', 'Right. Whoever finds the bar deserves one last drink. And the arena, if you fancy it: my cocktails flambé even better there than at the counter.', { emote: 'joie' }),
            n('Jacques fait glisser un verre fumant sur le comptoir. Il sent la menthe, et un peu le kérosène.', 'Jacques slides a smoking glass down the counter. It smells of mint, and a little of kerosene.'),
          ],
        }],
      },
    ],
    epilogue: tr('Vous avez trouvé Chez Jacques. Le patron vous attend à l\'arène, cocktails compris.', 'You found Chez Jacques. The boss is waiting for you in the arena, cocktails included.'),
    props: [
      {
        id: 'slate', deck: 0, x: 10.13, z: 8.39, model: 'quest-slate',
        label: tr('Lire l\'ardoise', 'Read the chalkboard'),
        idle: tr('CHEZ JACQUES. Les habitués savent où nous trouver.', 'CHEZ JACQUES. Regulars know where to find us.'),
        when: (s) => unstarted(s) || during(0)(s),
      },
    ],
  },
]
