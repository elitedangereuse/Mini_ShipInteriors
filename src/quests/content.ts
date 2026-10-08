import { CHEF } from '../chef'
import { GARDENER } from '../gardener'
import { tr } from '../i18n'
import type { IconName } from '../icons'
import { DROID, MECHANIC } from '../mechanic'
import { NURSE } from '../nurse'
import { SERGEANT } from '../patrol'
import type { QuestState } from '../../shared/quests.js'
import type { Line } from './cinematic'
import { MORE_QUESTS } from './content-more'

/*
 * Les quêtes du bord, racontées : leurs scènes, ce qu'en garde le journal, les objets qu'elles
 * posent dans le vaisseau. Leur squelette (nombre d'étapes, pièce ouverte, récompense) est dans
 * shared/quests.js, que le relais et le site partagent : les deux listes vont ensemble, étape
 * pour étape (en dev, QuestWorld signale dans la console une étape, une cible ou un objet qui ne
 * correspond pas).
 *
 * Le journal ne donne pas de consignes : une note par étape, qui dit ce qu'on sait, pas où aller.
 * À chacun de fouiller. Seul le début d'une quête est signalé à bord, par un « ! ».
 *
 * Une cible (`on`) désigne ce avec quoi on interagit :
 * - `npc:<nom>` : un membre d'équipage déclaré dans main.ts (rourke, marcel, betty, nico) ;
 * - `item:<pont>:<modèle>` : un meuble du vaisseau (cf. levels.ts) ;
 * - `door` : les portes de la pièce que la quête ouvre ;
 * - `prop:<id>`, `actor:<id>` : un objet, un animal ou un personnage que la quête pose elle-même ;
 * - `event:<nom>` : pas une cible, quelque chose qui arrive au joueur (une prise à l'étang), que
 *   main.ts signale par QuestWorld.event.
 */

/** Une scène, et ce qui la déclenche. */
export interface Hook {
  on: string
  scene: Line[]
  /**
   * La scène finit sur un choix (dernière étape d'une histoire, où il faut se décider) : avec le
   * premier, la suite se joue (`after`) et la scène compte ; avec le second, `declined`, et l'on
   * pourra revenir.
   */
  confirm?: { accept: string; decline: string; after: Line[]; declined: Line[] }
}

/** Un élément d'une étape à réunir : sa scène, et ce que le journal en garde. */
export interface Part extends Hook {
  found: string
}

export interface Step {
  /** Ce qu'en dit le journal : ce qu'on sait, pas ce qu'il faut faire. */
  note: string
  /** Étape simple : une de ces scènes la termine. */
  hooks?: Hook[]
  /** Étape à éléments : toutes ces scènes, dans l'ordre qu'on veut (cf. `steps` dans shared/quests.js). */
  parts?: Part[]
  /** Scènes qu'on peut jouer pendant l'étape sans qu'elle avance : un témoin, un indice de plus. */
  asides?: Hook[]
}

/** Quand un objet de quête est là : selon l'état de la quête pour ce joueur (undefined : pas commencée). */
export type When = (state: QuestState | undefined) => boolean

/** Objet posé dans le vaisseau pour une quête : visible du seul joueur dont la quête en est là. */
export interface QuestProp {
  id: string
  deck: number
  x: number
  z: number
  /** Orientation, en quarts de tour (cf. Rot dans levels.ts). */
  rot?: number
  /** Posé exactement là (contre un mur, à plat au sol, autour d'un meuble) : sans lui, l'objet glisse à la place libre la plus proche. */
  fixed?: boolean
  /** Modèle de src/furniture/quests.ts. */
  model: string
  /** Verbe de l'invite ; sans lui, l'objet est un simple décor. */
  label?: string
  /** Ce qu'on en lit quand aucune scène ne l'attend. */
  idle?: string
  when: When
}

/**
 * Animal d'une quête (`species` : un compagnon des Cube Pets, cf. pets.ts), ou personnage (`look` :
 * une apparence du Holo-Me, cf. looks.ts), qui reste à sa place.
 */
export interface QuestActor {
  id: string
  species?: string
  look?: string
  deck: number
  x: number
  z: number
  label: string
  /** Ce qu'on en lit quand aucune scène ne l'attend. */
  idle: string
  when: When
  /** Il suit le joueur (sur son pont) : un animal seulement. */
  follows?: When
}

export interface QuestContent {
  id: string
  title: string
  icon: IconName
  /** En tête du journal : le ton de l'histoire. */
  pitch: string
  /** Ce qu'elle rapporte, en clair. */
  reward: string
  /** La scène qui la propose, et les deux réponses. */
  offer: Hook & { accept: string; decline: string }
  steps: Step[]
  /**
   * Ce qui se dit à bord le jour où elle devient disponible (cf. `requires` dans shared/quests.js) :
   * de quoi savoir où traîner, sans plus.
   */
  rumor?: string
  /** Devant la porte de la pièce qu'elle ouvre, une fois commencée. */
  locked?: Line[]
  /** Dans le journal, une fois terminée. */
  epilogue: string
  props?: QuestProp[]
  actors?: QuestActor[]
}

// ---------------------------------------------------------------- écriture

const line = (who: string | undefined, fr: string, en: string, more: Partial<Line> = {}): Line => ({ who, text: tr(fr, en), ...more })
/** Le récit : ce qu'on voit, ce qu'on fait. */
const n = (fr: string, en: string) => line(undefined, fr, en)
/** Le joueur. */
const me = (fr: string, en: string, more?: Partial<Line>) => line('me', fr, en, more)
const speaker = (who: string) => (fr: string, en: string, more?: Partial<Line>) => line(who, fr, en, more)

const rourke = speaker(SERGEANT)
const marcel = speaker(CHEF)
const betty = speaker(NURSE)
const nico = speaker(MECHANIC)
const boulon = speaker(DROID)
const capucine = speaker(GARDENER)
const bugenhagen = speaker('Bugenhagen')
const kepler = speaker(tr('Professeure Kepler', 'Professor Kepler'))
const jameson = speaker('Jameson')
const t0 = speaker('T-0')
const varga = speaker(tr('Capitaine Varga', 'Captain Varga'))
const echo = speaker(tr('Écho', 'Echo'))

// ---------------------------------------------------------------- quand

/** Tant que la quête n'est pas commencée. */
const unstarted: When = (s) => !s
/** Pendant les étapes `from` à `to` (comprises). */
const during = (from: number, to = from): When => (s) => !!s && !s.done && s.step >= from && s.step <= to
/** À l'étape `step`, tant que son élément `flag` n'est pas réuni. */
const missing = (step: number, flag: number): When => (s) => !!s && !s.done && s.step === step && !((s.flags >> flag) & 1)
const either = (...whens: When[]): When => (s) => whens.some((w) => w(s))

// ---------------------------------------------------------------- les quêtes

export const QUEST_CONTENT: QuestContent[] = [
  // ============================================================ La gamelle vide
  {
    id: 'gamelle-vide',
    title: tr('La gamelle vide', 'The empty bowl'),
    icon: 'dog',
    pitch: tr('Une gamelle pleine, une laisse mâchonnée, et pas de chien.', 'A full bowl, a chewed-up leash, and no dog.'),
    reward: tr('Jameson, le chien : son panier dans le catalogue de vos quartiers (Animaux).', 'Jameson the dog: his basket in your quarters catalogue (Pets).'),
    offer: {
      on: 'prop:bowl',
      accept: tr('Chercher Jameson', 'Look for Jameson'),
      decline: tr('Laisser la gamelle', 'Leave the bowl'),
      scene: [
        n('Une gamelle en inox, cabossée. Les croquettes sont intactes, et sèches depuis longtemps.', 'A dented steel bowl. The kibble is untouched, and has been dry for a long time.'),
        n('Sur la médaille posée contre le bord, gravé à la main : JAMESON. À côté, une laisse, mâchonnée jusqu\'à la poignée.', 'On the tag propped against the rim, engraved by hand: JAMESON. Next to it, a leash, chewed right up to the handle.'),
        n('Personne ne laisse une gamelle pleine sans raison. Quelqu\'un, à bord, attend un chien qui ne vient plus.', 'Nobody leaves a full bowl for no reason. Someone aboard is waiting for a dog that no longer comes.'),
      ],
    },
    steps: [
      {
        note: tr('Quelqu\'un remplit cette gamelle. Dans une soute, on n\'est jamais loin d\'un hangar.', 'Someone keeps this bowl full. In a cargo bay, you are never far from a hangar.'),
        hooks: [{
          on: 'npc:nico',
          scene: [
            nico('La gamelle ? …Ouais. C\'est la mienne. Enfin, la sienne.', 'The bowl? …Yeah. It\'s mine. Well, his.'),
            nico('Jameson. Il est arrivé dans une caisse de pièces, depuis Jameson Memorial. Passager clandestin, quarante centimètres au garrot.', 'Jameson. He turned up in a crate of parts from Jameson Memorial. A stowaway, sixteen inches at the shoulder.'),
            nico('Je l\'ai gardé. C\'est pas réglementaire, je sais. Rourke fait semblant de pas voir, je fais semblant de pas avoir de chien.', 'I kept him. Not regulation, I know. Rourke pretends not to see, I pretend not to have a dog.'),
            nico('Il a filé au dernier saut. Il déteste les sauts : le bruit, le noir, tout. Trois jours que je remplis sa gamelle pour rien.', 'He bolted at the last jump. He hates jumps: the noise, the dark, all of it. Three days I\'ve been filling his bowl for nothing.'),
            me('Il a des habitudes ?', 'Does he have habits?'),
            nico('Trois. Il vole de la saucisse, il cherche le chaud, et il s\'endort contre tout ce qui ronronne. Boulon l\'a cherché partout où un drone peut passer.', 'Three. He steals sausage, he looks for warmth, and he falls asleep against anything that hums. Bolt searched everywhere a drone can fit.'),
            boulon('Bip. (Partout. Sauf là où c\'est sale.)', 'Beep. (Everywhere. Except where it\'s dirty.)'),
          ],
        }],
      },
      {
        note: tr('Jameson vole, se réchauffe et laisse des traces. En trois jours, quelqu\'un a bien dû voir quelque chose.', 'Jameson steals, keeps warm and leaves tracks. In three days, somebody must have seen something.'),
        parts: [
          {
            on: 'npc:marcel',
            found: tr('Marcel a perdu six saucisses de Lave. Le voleur repart toujours par l\'ascenseur, vers le bas.', 'Marcel lost six Lave sausages. The thief always leaves by the lift, going down.'),
            scene: [
              marcel('Un chien ? Non. Un fantôme, oui. Six saucisses de Lave, disparues de la passe en trois nuits.', 'A dog? No. A ghost, yes. Six Lave sausages, gone from the pass in three nights.'),
              marcel('Pas une miette, pas un bruit. Juste des traces dans la farine, grandes comme ça. Et la porte de l\'ascenseur qui se referme.', 'Not a crumb, not a sound. Just prints in the flour, this big. And the lift door closing.'),
              marcel('Il descend, ton fantôme. Toujours vers le bas. Tiens, prends celle-là : s\'il a faim, il viendra te voir avant de venir me voler.', 'He goes down, your ghost. Always down. Here, take this one: if he\'s hungry, he\'ll come to you before he robs me.'),
              n('Marcel vous glisse une saucisse de Lave, emballée dans du papier.', 'Marcel slips you a Lave sausage, wrapped in paper.'),
            ],
          },
          {
            on: 'npc:betty',
            found: tr('Betty a soigné une patte, en pleine nuit. Le poil sentait le chaud et la suie.', 'Betty treated a paw in the middle of the night. The fur smelled of heat and soot.'),
            scene: [
              betty('Un patient à quatre pattes ? J\'en ai eu un. Il a gratté à la porte de l\'infirmerie, avant-hier, en pleine nuit.', 'A four-legged patient? I had one. He scratched at the medical bay door the night before last.'),
              betty('Un éclat de métal dans le coussinet. Il s\'est laissé faire sans un bruit, puis il est reparti avant que je trouve une friandise.', 'A metal splinter in his pad. He let me work without a sound, then left before I could find a treat.'),
              betty('Il était tiède comme un radiateur, et noir de suie jusqu\'aux oreilles. Je ne sais pas où il dort, mais ce n\'est pas un endroit propre.', 'He was warm as a radiator and black with soot up to his ears. I don\'t know where he sleeps, but it isn\'t a clean place.'),
            ],
          },
          {
            on: 'prop:paws',
            found: tr('Des traces de pattes, noires de suie, traversent l\'atelier de la cale vers la poupe.', 'Paw prints, black with soot, cross the hold workshop towards the stern.'),
            scene: [
              n('Des traces de pattes, noires et grasses. De la suie. Elles traversent l\'atelier, bien alignées, sans une hésitation.', 'Paw prints, black and greasy. Soot. They cross the workshop in a neat line, without a single hesitation.'),
              n('Elles vont vers la poupe : la porte du fond, et derrière elle, ce qui gronde.', 'They head for the stern: the door at the far end, and behind it, whatever is rumbling.'),
            ],
          },
        ],
      },
      {
        note: tr('Du chaud, de la suie, quelque chose qui ronronne. Il n\'y a pas beaucoup d\'endroits comme ça à bord.', 'Warmth, soot, something that hums. There aren\'t many places like that aboard.'),
        hooks: [{
          on: 'actor:jameson',
          scene: [
            n('Derrière le réacteur, là où le métal est tiède, deux yeux brillent. Un chien, noir de suie, tremble sans faire un bruit.', 'Behind the reactor, where the metal is warm, two eyes shine. A dog, black with soot, trembles without a sound.'),
            n('Il recule quand vous tendez la main. Puis son nez se lève : la saucisse de Marcel.', 'He backs away when you reach out. Then his nose goes up: Marcel\'s sausage.'),
            jameson('…Wouf ?', '…Woof?', { emote: 'joie' }),
            n('Il mange dans votre main, en trois bouchées. Sa queue cogne contre la tôle, de plus en plus vite.', 'He eats from your hand in three bites. His tail thumps against the plating, faster and faster.'),
            n('Quand vous vous relevez, il est déjà collé à votre jambe.', 'By the time you stand up, he is already glued to your leg.'),
          ],
        }],
      },
      {
        note: tr('Jameson ne vous lâche plus d\'une semelle. Quelqu\'un remplit une gamelle pour rien depuis trois jours.', 'Jameson won\'t leave your heels. Someone has been filling a bowl for nothing for three days.'),
        hooks: [{
          on: 'npc:nico',
          scene: [
            nico('JAMESON ! Viens là, sac à puces ! Trois jours ! Trois jours que je…', 'JAMESON! Come here, you fleabag! Three days! Three days I\'ve been…', { emote: 'joie' }),
            n('Jameson lui lèche le menton, fait deux tours sur lui-même, puis revient s\'asseoir contre vous.', 'Jameson licks his chin, spins around twice, then comes back to sit against you.'),
            nico('…Ah. D\'accord. Je vois.', '…Ah. Right. I see.'),
            nico('Non, non, c\'est bien. Un hangar, c\'est pas une vie pour un chien. Des réacteurs, des sauts, de l\'huile partout.', 'No, no, it\'s fine. A hangar is no life for a dog. Thrusters, jumps, oil everywhere.'),
            nico('Prends-le chez toi. Il lui faut un panier, un vrai, loin des moteurs. Tu me le prêteras pour les promenades.', 'Take him home. He needs a basket, a real one, far from the engines. You can lend him to me for walks.'),
            boulon('Bip bip. (Je garde la gamelle.)', 'Beep beep. (I\'m keeping the bowl.)'),
            n('Jameson a choisi. Son panier vous attend dans le catalogue de vos quartiers.', 'Jameson has chosen. His basket is waiting in your quarters catalogue.'),
          ],
        }],
      },
    ],
    epilogue: tr('Jameson dort dans vos quartiers, loin des réacteurs. Nico passe « par hasard », un jour sur deux.', 'Jameson sleeps in your quarters, far from the reactors. Nico drops by “by chance” every other day.'),
    props: [
      {
        id: 'bowl', deck: -1, x: 18.03, z: 6.17, fixed: true, model: 'quest-bowl',
        label: tr('Examiner la gamelle', 'Examine the bowl'), when: either(unstarted, during(0, 3)),
        idle: tr('La gamelle de Jameson. Toujours pleine, toujours intacte.', 'Jameson\'s bowl. Still full, still untouched.'),
      },
      {
        id: 'paws', deck: -1, x: 6.4, z: 5.1, rot: 1, fixed: true, model: 'quest-paws',
        label: tr('Examiner les traces', 'Examine the tracks'), when: during(1, 3),
        idle: tr('Les traces de suie filent vers la poupe, sans une hésitation.', 'The sooty tracks run towards the stern without a single hesitation.'),
      },
    ],
    actors: [{
      id: 'jameson', species: 'chien', deck: -1, x: 2.4, z: 6.2,
      label: tr('Approcher le chien', 'Approach the dog'),
      idle: tr('Jameson remue la queue et vous regarde, l\'air de demander où l\'on va.', 'Jameson wags his tail and looks at you, as if asking where you\'re going.'),
      when: during(2, 3),
      follows: during(3),
    }],
  },

  // ============================================================ Permis de tir
  {
    id: 'permis-de-tir',
    title: tr('Permis de tir', 'Licence to shoot'),
    icon: 'crosshair',
    pitch: tr('Un stand condamné, un distributeur de café criblé, et un sergent qui n\'a pas d\'humour.', 'A sealed range, a riddled coffee machine, and a sergeant with no sense of humour.'),
    reward: tr('Le stand de tir de la cale, ouvert pour de bon, et 5 000 CR.', 'The shooting range in the hold, open for good, and 5,000 CR.'),
    offer: {
      on: 'door',
      accept: tr('Faire rouvrir le stand', 'Get the range reopened'),
      decline: tr('Passer son chemin', 'Walk on'),
      scene: [
        n('La porte du stand de tir est condamnée. Un avis plastifié y est scotché aux quatre coins :', 'The shooting range door is sealed. A laminated notice is taped to it at all four corners:'),
        n('« STAND FERMÉ sur ordre de la sécurité. Motif : incident du distributeur de café. Réouverture : sur décision du sergent. »', '“RANGE CLOSED by order of security. Reason: the coffee machine incident. Reopening: at the sergeant\'s discretion.”'),
        n('Dessous, au feutre, d\'une autre main : « Il l\'avait cherché. »', 'Below, in marker, in another hand: “It had it coming.”'),
      ],
    },
    locked: [n('L\'avis de la sécurité est toujours là. La porte aussi, et elle ne bouge pas.', 'The security notice is still there. So is the door, and it isn\'t moving.')],
    steps: [
      {
        note: tr('La sécurité a fermé le stand. La sécurité porte un casque et fait des rondes.', 'Security closed the range. Security wears a helmet and walks a beat.'),
        hooks: [{
          on: 'npc:rourke',
          scene: [
            rourke('Le stand ? Fermé. Quelqu\'un a vidé un chargeur de plasma dans le distributeur de café du mess.', 'The range? Closed. Somebody emptied a plasma magazine into the mess hall coffee machine.'),
            rourke('À bout portant. La machine avait gardé sa monnaie. Je comprends le mobile, pas la méthode.', 'At point-blank range. The machine had kept their change. I understand the motive, not the method.'),
            me('Et pour le rouvrir ?', 'And to reopen it?'),
            rourke('Je rouvre pour quelqu\'un que j\'autorise. Et j\'autorise quelqu\'un qui y voit clair, et qui me rapporte la clé du râtelier.', 'I reopen for someone I clear. And I clear someone who can see straight, and who brings me back the rack key.'),
            rourke('La vue, c\'est médical. La clé, je l\'ai confiée pour une réparation à quelqu\'un qui répare tout. Il ne me l\'a jamais rendue.', 'Eyesight is a medical matter. The key, I handed over for repair to someone who repairs everything. He never gave it back.'),
            rourke('Revenez avec les deux. Pas avant.', 'Come back with both. Not before.'),
          ],
        }],
      },
      {
        note: tr('Il faut y voir clair, et retrouver une clé confiée à « quelqu\'un qui répare tout ».', 'You need to see straight, and to find a key entrusted to “someone who repairs everything”.'),
        parts: [
          {
            on: 'npc:betty',
            found: tr('Certificat d\'aptitude visuelle : signé, tamponné, avec une réserve sur l\'électroménager.', 'Eyesight certificate: signed, stamped, with a reservation about household appliances.'),
            scene: [
              betty('Un certificat pour le stand ? Rourke m\'envoie tout le monde. Lisez la troisième ligne du tableau, là-bas.', 'A certificate for the range? Rourke sends me everyone. Read the third line of the chart over there.'),
              me('E… D… o… 7.', 'E… D… o… 7.'),
              betty('C\'était la deuxième ligne, mais c\'est la bonne réponse. Les deux yeux, maintenant, sans plisser.', 'That was the second line, but it\'s the right answer. Both eyes now, no squinting.'),
              betty('Parfait. Aptitude visuelle : excellente. Aptitude à ne pas tirer sur l\'électroménager : à surveiller.', 'Perfect. Eyesight: excellent. Ability not to shoot household appliances: to be monitored.'),
              n('Betty signe, tamponne, et vous tend le certificat.', 'Betty signs, stamps, and hands you the certificate.'),
            ],
          },
          {
            on: 'prop:rack-key',
            found: tr('La clé du râtelier dormait dans un tas de minerai, à la raffinerie.', 'The rack key was asleep in a pile of ore, in the refinery.'),
            scene: [
              n('Dans le minerai, quelque chose clignote en orange. Une carte magnétique, rayée, poussiéreuse.', 'Something is blinking orange in the ore. A key card, scratched and dusty.'),
              n('« RÂTELIER — STAND DE TIR — NE PAS PERDRE ». Quelqu\'un l\'a perdue avec beaucoup de soin.', '“WEAPON RACK — SHOOTING RANGE — DO NOT LOSE”. Somebody lost it with great care.'),
            ],
          },
        ],
        asides: [{
          on: 'npc:nico',
          scene: [
            nico('La clé du râtelier ? Oui, Rourke me l\'a filée, le lecteur déconnait. Je l\'ai réparée. Je l\'ai posée… là.', 'The rack key? Yeah, Rourke gave it to me, the reader was acting up. I fixed it. I put it down… there.'),
            nico('Enfin, elle était là. Boulon range tout ce qui traîne. Boulon, où tu ranges ce qui traîne ?', 'Well, it was there. Bolt tidies up anything left lying around. Bolt, where do you put what\'s lying around?'),
            boulon('Bip. (Avec ce qui brille.)', 'Beep. (With the shiny things.)'),
            nico('Il confond tout ce qui brille avec du minerai. Je dis ça, je dis rien.', 'He mistakes anything shiny for ore. Just saying.'),
          ],
        }],
      },
      {
        note: tr('Un certificat, une clé. Il ne manque que l\'accord d\'un sergent.', 'A certificate, a key. All that\'s missing is a sergeant\'s approval.'),
        hooks: [{
          on: 'npc:rourke',
          scene: [
            rourke('Certificat… signé. Clé… Dans le minerai ? Je ne veux pas savoir.', 'Certificate… signed. Key… In the ore? I don\'t want to know.'),
            rourke('Dernière formalité. Levez la main droite et répétez : « Je ne tirerai pas sur le distributeur de café. »', 'One last formality. Raise your right hand and repeat: “I will not shoot the coffee machine.”'),
            me('Je ne tirerai pas sur le distributeur de café.', 'I will not shoot the coffee machine.', { me: 'salut' }),
            rourke('« Même s\'il garde ma monnaie. »', '“Even if it keeps my change.”'),
            me('…Même s\'il garde ma monnaie.', '…Even if it keeps my change.'),
            rourke('Bien. Le stand est rouvert pour vous. Les cibles sont au fond, le café est à l\'étage. Ne confondez pas. o7', 'Good. The range is open to you. The targets are at the far end, the coffee is upstairs. Don\'t mix them up. o7', { emote: 'o7' }),
          ],
        }],
      },
    ],
    epilogue: tr('Le stand de tir vous est ouvert. Le distributeur de café du mess a été remplacé. Le nouveau garde aussi la monnaie.', 'The shooting range is open to you. The mess hall coffee machine was replaced. The new one keeps your change too.'),
    props: [
      // Au nord de la raffinerie : plus au sud, le couvercle du bar la cacherait à la caméra.
      { id: 'rack-key', deck: -1, x: 15.4, z: 5.7, model: 'quest-keycard', label: tr('Fouiller le minerai', 'Search the ore'), when: missing(1, 1) },
    ],
  },

  // ============================================================ Poids lourds
  {
    id: 'poids-lourds',
    title: tr('Poids lourds', 'Heavy lifting'),
    icon: 'barbell',
    pitch: tr('Une salle de sport fermée faute de poids. À bord, ce qui est lourd finit toujours par servir à autre chose.', 'A gym closed for lack of weights. Aboard, anything heavy always ends up being used for something else.'),
    reward: tr('La salle de sport du pont principal, ouverte pour de bon, et 5 000 CR.', 'The gym on the main deck, open for good, and 5,000 CR.'),
    offer: {
      on: 'door',
      accept: tr('Retrouver les poids', 'Track down the weights'),
      decline: tr('Rester mou', 'Stay soft'),
      scene: [
        n('La porte de la salle de sport ne s\'ouvre pas. Un avis de l\'infirmerie y est collé :', 'The gym door won\'t open. A notice from the medical bay is stuck to it:'),
        n('« Salle fermée : inventaire incomplet. Manquent une kettlebell de 16 kg, une paire d\'haltères et un disque de 20 kg. »', '“Gym closed: incomplete inventory. Missing: one 16 kg kettlebell, a pair of dumbbells and one 20 kg plate.”'),
        n('« Une salle de sport sans poids est une salle d\'attente. Elle rouvrira quand tout sera revenu. — Betty »', '“A gym without weights is a waiting room. It reopens when everything is back. — Betty”'),
      ],
    },
    locked: [n('« Inventaire incomplet. » L\'avis de Betty n\'a pas bougé, la porte non plus.', '“Incomplete inventory.” Betty\'s notice hasn\'t moved, and neither has the door.')],
    steps: [
      {
        note: tr('L\'avis est signé de l\'infirmerie.', 'The notice is signed by the medical bay.'),
        hooks: [{
          on: 'npc:betty',
          scene: [
            betty('La salle de sport ? C\'est moi qui l\'ai fermée. Je suis responsable de la santé du bord, et de ce qui lui tombe sur les pieds.', 'The gym? I closed it. I\'m responsible for this crew\'s health, and for whatever lands on its feet.'),
            betty('Trois charges ont disparu en un mois. Personne ne vole, ici. Les gens empruntent. Pour toujours.', 'Three weights vanished in a month. Nobody steals here. People borrow. Forever.'),
            betty('Une kettlebell, deux haltères, un disque. Quarante-quatre kilos de fonte ne s\'évaporent pas : ils servent à quelqu\'un.', 'A kettlebell, two dumbbells, a plate. Forty-four kilos of cast iron don\'t evaporate: somebody is using them.'),
            betty('Cherchez là où l\'on a besoin de quelque chose de lourd sans avoir le budget pour l\'acheter. C\'est-à-dire partout.', 'Look wherever someone needs something heavy and has no budget to buy it. That is to say, everywhere.'),
          ],
        }],
      },
      {
        note: tr('Quarante-quatre kilos de fonte, « empruntés ». Qui, à bord, a besoin de quelque chose de lourd ?', 'Forty-four kilos of cast iron, “borrowed”. Who aboard needs something heavy?'),
        parts: [
          {
            on: 'prop:kettlebell',
            found: tr('La kettlebell servait de presse à terrine, en cuisine.', 'The kettlebell was being used as a terrine press, in the galley.'),
            scene: [
              n('Sur un couvercle de marmite, une kettlebell de seize kilos. L\'étiquette dit encore « SALLE DE SPORT ».', 'On a stockpot lid, a sixteen-kilo kettlebell. The label still says “GYM”.'),
              marcel('Hé ! Ma presse à terrine ! Seize kilos tout rond : exactement ce que demande la recette de ma grand-mère.', 'Hey! My terrine press! Sixteen kilos on the nose: exactly what my grandmother\'s recipe calls for.'),
              marcel('…C\'est celle de la salle de sport ? Elle était mieux ici. Là-bas, on la soulève pour rien. Ici, elle fait une terrine.', '…It\'s the one from the gym? It was better off here. Over there, people lift it for nothing. Here, it makes a terrine.'),
              marcel('Bon. Reprends-la. Mais dis à Betty que la terrine de jeudi, elle l\'avait trouvée « remarquablement ferme ».', 'Fine. Take it back. But tell Betty that she called Thursday\'s terrine “remarkably firm”.'),
            ],
          },
          {
            on: 'prop:dumbbells',
            found: tr('Les haltères tenaient un tuteur à tomates, dans la serre.', 'The dumbbells were holding up a tomato stake, in the greenhouse.'),
            scene: [
              n('Deux haltères, ficelées au pied d\'un tuteur. Un plant de tomates s\'y accroche de toutes ses forces.', 'Two dumbbells, tied to the foot of a stake. A tomato plant is clinging to it for dear life.'),
              capucine('Oh. Vous avez trouvé mes contrepoids. Sans eux, la ventilation couche tous mes tuteurs.', 'Oh. You found my counterweights. Without them, the ventilation flattens all my stakes.'),
              capucine('Je comptais les rendre. Après la récolte. Celle de l\'an prochain, peut-être.', 'I meant to give them back. After the harvest. Next year\'s, perhaps.'),
              capucine('Prenez-les. Je mettrai des cailloux. Les tomates comprendront : elles sont plus raisonnables que les gens.', 'Take them. I\'ll use stones. The tomatoes will understand: they\'re more reasonable than people.'),
            ],
          },
          {
            on: 'prop:plate',
            found: tr('Le disque de vingt kilos calait une chandelle, dans le hangar.', 'The twenty-kilo plate was chocking a jack stand, in the hangar.'),
            scene: [
              n('Sous une chandelle du hangar, un disque de fonte de vingt kilos, bien à plat, sert de cale.', 'Under a jack stand in the hangar, a twenty-kilo cast-iron plate lies flat, serving as a chock.'),
              nico('Touche pas, c\'est ma cale de… Attends. Y a écrit « 20 KG » dessus ?', 'Hands off, that\'s my chock for… Hang on. Does it say “20 KG” on it?'),
              nico('Je me disais aussi qu\'elle était drôlement ronde, pour une cale.', 'I did think it was awfully round, for a chock.'),
              boulon('Bip. (Je l\'avais dit.)', 'Beep. (I said so.)'),
              nico('Embarque. Je calerai avec autre chose. T\'as pas vu passer une kettlebell ?', 'Take it. I\'ll chock it with something else. Seen a kettlebell around, by any chance?'),
            ],
          },
        ],
      },
      {
        note: tr('Les bras chargés. L\'infirmerie attend son inventaire.', 'Arms full. The medical bay is waiting for its inventory.'),
        hooks: [{
          on: 'npc:betty',
          scene: [
            betty('Kettlebell… haltères… disque. Inventaire complet. Et vous avez tout porté d\'un pont à l\'autre ?', 'Kettlebell… dumbbells… plate. Inventory complete. And you carried all of it from deck to deck?'),
            betty('Alors vous avez fait votre échauffement. Je rouvre la salle : vous êtes la première personne à la mériter depuis longtemps.', 'Then you\'ve done your warm-up. I\'m reopening the gym: you\'re the first person to deserve it in a long while.', { emote: 'oui' }),
            betty('Tapis, vélo, sac de frappe : tout est à vous. Et la prochaine fois que quelqu\'un « emprunte », je ferme le mess.', 'Treadmill, bike, punching bag: all yours. And the next time someone “borrows”, I close the mess hall.'),
          ],
        }],
      },
    ],
    epilogue: tr('La salle de sport est rouverte. Marcel presse sa terrine avec un bidon d\'eau. Elle est moins ferme.', 'The gym is open again. Marcel presses his terrine with a water can. It is less firm.'),
    props: [
      { id: 'kettlebell', deck: 0, x: 13.7, z: 11.2, model: 'quest-kettlebell', label: tr('Examiner la kettlebell', 'Examine the kettlebell'), when: missing(1, 0) },
      { id: 'dumbbells', deck: 1, x: 2.88, z: 6.52, fixed: true, model: 'quest-dumbbells', label: tr('Examiner les haltères', 'Examine the dumbbells'), when: missing(1, 1) },
      { id: 'plate', deck: -1, x: 29.6, z: 9.0, model: 'quest-plate', label: tr('Examiner la cale', 'Examine the chock'), when: missing(1, 2) },
    ],
  },

  // ============================================================ Silence, on dribble
  {
    id: 'silence-on-dribble',
    title: tr('Silence, on dribble', 'Quiet on the court'),
    icon: 'basketball',
    pitch: tr('Un terrain de basket fermé pour tapage. Le plaignant habite juste derrière le mur, et il a cent trente ans.', 'A basketball court closed for noise. The plaintiff lives right behind the wall, and he is a hundred and thirty years old.'),
    reward: tr('Le terrain de basket du pont supérieur, ouvert pour de bon, et 5 000 CR.', 'The basketball court on the upper deck, open for good, and 5,000 CR.'),
    offer: {
      on: 'door',
      accept: tr('Régler ça entre voisins', 'Settle it between neighbours'),
      decline: tr('Laisser le ciel tranquille', 'Leave the sky alone'),
      scene: [
        n('Le terrain de basket est fermé. Sur la porte, un avis calligraphié à l\'encre violette :', 'The basketball court is closed. On the door, a notice in violet ink and careful handwriting:'),
        n('« Fermé pour cause de tremblements de ciel. Le voisinage demande le silence. Les étoiles aussi. »', '“Closed on account of sky tremors. The neighbours request silence. So do the stars.”'),
        n('Dessous, griffonné au stylo : « ON VEUT JOUER ». Et plus bas, à l\'encre violette : « Chut. »', 'Below, scrawled in pen: “WE WANT TO PLAY”. And lower down, in violet ink: “Hush.”'),
      ],
    },
    locked: [n('« Fermé pour cause de tremblements de ciel. » L\'encre violette n\'a pas séché d\'hier.', '“Closed on account of sky tremors.” The violet ink did not dry yesterday.')],
    steps: [
      {
        note: tr('Quelqu\'un se plaint que le ciel tremble. Le terrain a un voisin, juste derrière son mur.', 'Someone complains that the sky is shaking. The court has a neighbour, right behind its wall.'),
        hooks: [{
          on: 'item:1:bugenhagen',
          scene: [
            bugenhagen('Hou hou… Le terrain ? Oui, c\'est moi. Chaque rebond de ballon fait sauter mon projecteur.', 'Ho ho… The court? Yes, that was me. Every bounce of the ball makes my projector skip.'),
            bugenhagen('Hier, en pleine séance, Saturne a perdu ses anneaux. Trois écoliers ont pleuré. Le quatrième a applaudi, c\'est pire.', 'Yesterday, mid-show, Saturn lost its rings. Three schoolchildren cried. The fourth clapped, which is worse.'),
            me('Et si le projecteur ne sautait plus ?', 'And if the projector stopped skipping?'),
            bugenhagen('Alors ils dribbleraient jusqu\'à la fin des temps, et je n\'en saurais rien. Hou hou ! Mais on n\'arrête pas un tremblement avec de bonnes intentions.', 'Then they could dribble until the end of time and I would never know. Ho ho! But you don\'t stop a tremor with good intentions.'),
            bugenhagen('Il faut de quoi boire les secousses, et quelqu\'un qui sache où le poser. Je connais les étoiles, pas les planchers.', 'You need something to drink up the shaking, and someone who knows where to put it. I know stars, not floors.'),
          ],
        }],
      },
      {
        note: tr('Il faut de quoi étouffer des secousses, et quelqu\'un qui sache calculer où. Le bruit a ses spécialistes, à cet étage.', 'You need something to muffle the shaking, and someone who can work out where. Noise has its specialists on this deck.'),
        parts: [
          {
            on: 'prop:foam',
            found: tr('Le studio de Radio Dangereuse avait un carton de mousse acoustique en trop.', 'The Radio Dangereuse studio had a spare box of acoustic foam.'),
            scene: [
              n('Un carton de dalles de mousse acoustique : « RADIO DANGEREUSE — SURPLUS ».', 'A box of acoustic foam tiles: “RADIO DANGEREUSE — SURPLUS”.'),
              n('Un mot est scotché dessus : « Servez-vous. On en a commandé un peu trop. Un peu trop = quatre cents. »', 'A note is taped to it: “Help yourself. We ordered a few too many. A few too many = four hundred.”'),
            ],
          },
          {
            on: 'item:1:class-teacher',
            found: tr('La professeure Kepler a fait le calcul : la mousse va sous le socle du projecteur, pas contre le mur.', 'Professor Kepler did the maths: the foam goes under the projector\'s base, not against the wall.'),
            scene: [
              kepler('Une question d\'acoustique ? Enfin une vraie question. Asseyez-vous. Non, restez debout, ce sera court.', 'An acoustics question? A real question at last. Sit down. No, stay standing, this will be quick.'),
              kepler('Le ballon frappe le sol, le plancher passe sous la cloison, et le socle du projecteur est vissé dedans. Le coupable n\'est pas le ballon : c\'est le socle.', 'The ball hits the floor, the floor runs under the partition, and the projector\'s base is bolted to it. The culprit isn\'t the ball: it\'s the base.'),
              kepler('Inutile de doubler le mur. Glissez la mousse sous les pieds du projecteur : il ne doit plus toucher le plancher. Vous notez ?', 'No point lining the wall. Slide the foam under the projector\'s feet: it must no longer touch the floor. Are you taking notes?'),
              kepler('Et dites à Bugenhagen que Saturne n\'a pas « perdu ses anneaux ». Elle a subi une résonance. Ce n\'est pas pareil.', 'And tell Bugenhagen that Saturn did not “lose its rings”. It underwent resonance. That is not the same thing.'),
            ],
          },
        ],
      },
      {
        note: tr('La mousse et le calcul. Il ne manque que la machine dont tout le ciel sort, et quelqu\'un pour se glisser dessous.', 'The foam and the maths. All that\'s missing is the machine the whole sky pours out of, and someone to crawl underneath.'),
        hooks: [{
          on: 'item:1:planetarium-projector',
          scene: [
            n('Le socle du projecteur, vissé à même le plancher. Comme l\'a dit Kepler : c\'est par là que tout passe.', 'The projector\'s base, bolted straight to the floor. As Kepler said: that is where it all comes through.'),
            n('Dalle après dalle, vous glissez la mousse sous ses pieds. Vous tapez du talon : le projecteur ne bronche plus.', 'Tile after tile, you slide the foam under its feet. You stamp your heel: the projector doesn\'t flinch.'),
          ],
        }],
      },
      {
        note: tr('Le projecteur repose sur la mousse. Reste à savoir si le ciel tient en place.', 'The projector rests on foam. It remains to be seen whether the sky stays put.'),
        hooks: [{
          on: 'item:1:bugenhagen',
          scene: [
            bugenhagen('Tu as chaussé mon projecteur ? Hou hou ! Voyons… Fais-moi un rebond. Un gros.', 'You put shoes on my projector? Ho ho! Let\'s see… Give me a bounce. A big one.'),
            n('Vous tapez du pied, trois fois, de toutes vos forces. Au plafond, les planètes poursuivent leur ronde. Saturne garde ses anneaux.', 'You stamp your foot, three times, as hard as you can. Overhead, the planets keep to their rounds. Saturn keeps its rings.'),
            bugenhagen('Rien ne tremble. Rien ! Hou hou houuu ! Le ciel est sauvé, et les écoliers aussi.', 'Nothing shakes. Nothing! Ho ho hooo! The sky is saved, and so are the schoolchildren.'),
            bugenhagen('Je retire ma plainte. Va jouer. Et quand tu auras marqué, viens t\'asseoir ici : on regarde mieux les étoiles avec les jambes fatiguées.', 'I withdraw my complaint. Go and play. And when you\'ve scored, come and sit here: tired legs make for better stargazing.'),
          ],
        }],
      },
    ],
    epilogue: tr('Le terrain de basket est rouvert. On y dribble sans que Saturne s\'en aperçoive.', 'The basketball court is open again. People dribble there without Saturn noticing.'),
    props: [
      { id: 'foam', deck: 1, x: 18.4, z: 2.6, model: 'quest-foam-box', label: tr('Examiner le carton', 'Examine the box'), when: missing(1, 0) },
      // Autour du projecteur du planétarium (cf. levels.ts) : l'endroit à caler, puis la mousse posée.
      { id: 'base-mark', deck: 1, x: 11.5, z: 9.5, fixed: true, model: 'quest-base-mark', when: during(2) },
      { id: 'base-foam', deck: 1, x: 11.5, z: 9.5, fixed: true, model: 'quest-base-foam', when: (s) => !!s && (s.done || s.step >= 3) },
    ],
  },

  // ============================================================ Le dernier match
  {
    id: 'dernier-match',
    title: tr('Le dernier match', 'The last match'),
    icon: 'soccer-ball',
    pitch: tr('Un terrain fermé depuis une finale, et une photo d\'équipe où quelqu\'un manque à l\'appel.', 'A pitch closed since a final, and a team photo where someone is missing from roll call.'),
    reward: tr('Le terrain de foot du pont supérieur, ouvert pour de bon, et 5 000 CR.', 'The football pitch on the upper deck, open for good, and 5,000 CR.'),
    offer: {
      on: 'door',
      accept: tr('Demander ce qui s\'est passé', 'Ask what happened'),
      decline: tr('Reposer la photo', 'Put the photo back'),
      scene: [
        n('Un cadenas, sur la porte du terrain de foot. Et une photo d\'équipe, jaunie, glissée sous le montant.', 'A padlock on the football pitch door. And a yellowed team photo, slipped under the frame.'),
        n('Cinq joueurs en maillot orange, bras dessus, bras dessous. Marcel dans les buts, Nico qui fait le pitre, Betty et sa trousse, le sergent Rourke, raide comme un poteau.', 'Five players in orange shirts, arm in arm. Marcel in goal, Nico clowning around, Betty with her kit bag, Sergeant Rourke stiff as a goalpost.'),
        n('Au milieu, une femme qui rit, un brassard au bras. Au dos de la photo, une ligne : « On rouvrira quand la capitaine reviendra. »', 'In the middle, a woman laughing, an armband on her arm. On the back of the photo, one line: “We reopen when the captain comes back.”'),
      ],
    },
    locked: [n('Le cadenas est froid. Sur la photo, la capitaine rit toujours.', 'The padlock is cold. In the photo, the captain is still laughing.')],
    steps: [
      {
        note: tr('Cinq visages sur la photo. Quatre sont encore à bord, et trois d\'entre eux parlent volontiers.', 'Five faces in the photo. Four are still aboard, and three of them like to talk.'),
        parts: [
          {
            on: 'npc:marcel',
            found: tr('Marcel, gardien : « Ilse Varga. Elle disait que je plongeais comme une armoire, mais une armoire fidèle. »', 'Marcel, goalkeeper: “Ilse Varga. She said I dived like a wardrobe, but a loyal wardrobe.”'),
            scene: [
              marcel('Cette photo… Où tu as trouvé ça ? Donne. Non, garde-la.', 'That photo… Where did you find it? Give it here. No, keep it.'),
              marcel('Ilse Varga. Notre capitaine. J\'étais dans les buts : elle disait que je plongeais comme une armoire, mais que j\'étais une armoire fidèle.', 'Ilse Varga. Our captain. I was in goal: she said I dived like a wardrobe, but that I was a loyal wardrobe.'),
              marcel('Elle est partie pour Beagle Point, il y a deux ans. « Un aller-retour », elle a dit. On a fermé le terrain en attendant.', 'She left for Beagle Point two years ago. “There and back,” she said. We closed the pitch until then.'),
              marcel('On attend toujours. Va voir les autres. Moi, j\'ai un bouillon sur le feu.', 'We\'re still waiting. Go and see the others. I\'ve got a stock on the stove.'),
            ],
          },
          {
            on: 'npc:nico',
            found: tr('Nico, avant-centre : « On perdait tout le temps. Avec elle, on perdait en rigolant. »', 'Nico, striker: “We lost all the time. With her, we lost laughing.”'),
            scene: [
              nico('Ha ! Regarde ma tête. J\'avais marqué contre mon camp, ce jour-là. Deux fois.', 'Ha! Look at my face. I\'d scored an own goal that day. Twice.'),
              nico('On perdait tout le temps. Mais avec Ilse, on perdait en rigolant, et on rejouait le lendemain.', 'We lost all the time. But with Ilse we lost laughing, and we played again the next day.'),
              nico('Son Asp est parti de ce hangar. J\'ai fait la révision moi-même. Tout était bon. Je te jure que tout était bon.', 'Her Asp left from this hangar. I did the service myself. Everything was fine. I swear everything was fine.'),
              nico('Le cadenas, c\'est pas moi. C\'est Rourke. Il en parle jamais.', 'The padlock wasn\'t me. That was Rourke. He never talks about it.'),
            ],
          },
          {
            on: 'npc:betty',
            found: tr('Betty, soigneuse : « Sa dernière balise a émis à mi-chemin. Ensuite, plus rien. »', 'Betty, physio: “Her last beacon pinged at the halfway point. After that, nothing.”'),
            scene: [
              betty('J\'étais la soigneuse. Une équipe qui tacle comme la nôtre avait surtout besoin d\'une infirmière.', 'I was the physio. A team that tackles like ours mostly needed a nurse.'),
              betty('Sa dernière balise a émis à mi-chemin de Beagle Point. Ensuite, plus rien. Ni épave, ni message. Rien.', 'Her last beacon pinged halfway to Beagle Point. After that, nothing. No wreck, no message. Nothing.'),
              betty('On ne fait pas le deuil d\'un silence. Alors on garde un terrain fermé, et on se dit que c\'est provisoire.', 'You can\'t mourn a silence. So you keep a pitch closed, and tell yourself it\'s temporary.'),
              betty('C\'est le sergent qui a posé le cadenas. Il était son second. Parlez-lui doucement.', 'It was the sergeant who put the padlock on. He was her vice-captain. Speak to him gently.'),
            ],
          },
        ],
      },
      {
        note: tr('Tous disent la même chose : c\'est le sergent qui a posé le cadenas. Il était son second.', 'They all say the same thing: the sergeant put the padlock on. He was her vice-captain.'),
        hooks: [{
          on: 'npc:rourke',
          scene: [
            rourke('…Qui vous a donné cette photo ?', '…Who gave you that photo?'),
            rourke('Varga. Capitaine de l\'équipe, et la meilleure pilote que ce bord ait connue. J\'étais son second. Sur le terrain, seulement.', 'Varga. Team captain, and the best pilot this ship ever knew. I was her second. On the pitch only.'),
            rourke('Elle a envoyé un message avant de passer hors de portée. À moi. Pour l\'équipe.', 'She sent a message before she went out of range. To me. For the team.'),
            rourke('Je ne l\'ai jamais fait écouter. Si je le passe, c\'est qu\'elle ne reviendra pas. Tant qu\'il reste dans ma poche, elle est en retard.', 'I never played it for them. If I play it, it means she isn\'t coming back. As long as it stays in my pocket, she\'s just late.'),
            n('Il sort un enregistreur de sa poche de poitrine, le regarde longtemps, et vous le tend.', 'He takes a recorder from his chest pocket, looks at it for a long time, and holds it out to you.'),
            rourke('Écoutez-le, vous. Pas ici. Là où elle regardait la route, avant de partir. Ensuite vous me direz si j\'ai eu tort.', 'You listen to it. Not here. Where she used to look at the route, before she left. Then you tell me whether I was wrong.'),
          ],
        }],
      },
      {
        note: tr('Un enregistreur, et un endroit d\'où l\'on regarde la route de Beagle Point.', 'A recorder, and a place from which you can look at the route to Beagle Point.'),
        hooks: [{
          on: 'item:0:galaxy-map',
          scene: [
            n('La carte galactique tourne lentement. Tout au bout, de l\'autre côté du noyau : Beagle Point. 65 279 années-lumière.', 'The galaxy map turns slowly. At the very end, on the far side of the core: Beagle Point. 65,279 light years.'),
            n('Vous posez l\'enregistreur sur la console et vous appuyez. Un souffle, des parasites, puis une voix qui rit.', 'You set the recorder on the console and press play. A hiss, static, then a voice, laughing.'),
            varga('« Rourke, c\'est Varga. Je passe hors de portée dans une minute, alors écoute bien, pour une fois. »', '“Rourke, it\'s Varga. I\'m out of range in a minute, so listen properly, for once.”'),
            varga('« Si je suis en retard, ne fermez rien. Ni le terrain, ni vos têtes. Jouez sans moi. »', '“If I\'m late, don\'t close anything. Not the pitch, not your heads. Play without me.”'),
            varga('« Et gagnez un match, par pitié. Un seul. Marcel, plonge du bon côté. Nico, l\'autre but. »', '“And win a match, for pity\'s sake. Just one. Marcel, dive the right way. Nico, the other goal.”'),
            varga('« Le brassard est dans mon casier. Il est à qui en voudra. Varga, terminé. o7 »', '“The armband is in my locker. It belongs to whoever wants it. Varga out. o7”'),
            n('L\'enregistrement s\'arrête. Sur la carte, Beagle Point continue de briller, très loin.', 'The recording ends. On the map, Beagle Point goes on shining, very far away.'),
          ],
        }],
      },
      {
        note: tr('Elle l\'a dit elle-même. Reste à le faire entendre à celui qui garde la clé.', 'She said it herself. It only remains to make the man with the key hear it.'),
        hooks: [{
          on: 'npc:rourke',
          scene: [
            n('Vous posez l\'enregistreur dans la main du sergent, et vous appuyez. Il écoute jusqu\'au bout, sans bouger.', 'You place the recorder in the sergeant\'s hand and press play. He listens to the end without moving.'),
            rourke('« Gagnez un match, par pitié. » …Deux ans que je garde ça pour moi. Deux ans qu\'elle nous donnait un ordre.', '“Win a match, for pity\'s sake.” …Two years I\'ve kept that to myself. Two years she\'d been giving us an order.'),
            rourke('J\'ai eu tort. Dites-le-leur. Non : je le leur dirai moi-même. Ce soir.', 'I was wrong. Tell them. No: I\'ll tell them myself. Tonight.'),
            n('Il détache une petite clé de son trousseau.', 'He takes a small key off his ring.'),
            rourke('Le terrain est ouvert. Le brassard reste au vestiaire : personne ne le porte, tout le monde joue pour lui.', 'The pitch is open. The armband stays in the locker room: nobody wears it, everybody plays for it.'),
            rourke('Merci, commandant. o7', 'Thank you, commander. o7', { emote: 'o7' }),
          ],
        }],
      },
    ],
    epilogue: tr('Le terrain de foot est rouvert. L\'équipe a rejoué. Elle a perdu, 4 à 1. Nico a marqué dans le bon but.', 'The football pitch is open again. The team played. It lost, 4–1. Nico scored in the right goal.'),
  },

  // ============================================================ Quatre cent douze
  {
    id: 'quatre-cent-douze',
    title: tr('Quatre cent douze', 'Four hundred and twelve'),
    icon: 'robot',
    pitch: tr('Un mannequin d\'essai en fin de batterie, qui n\'a jamais rien vu d\'autre que l\'intérieur d\'un siège éjectable.', 'A crash-test dummy on its last charge, which has never seen anything but the inside of an ejection seat.'),
    reward: tr('L\'apparence « Mannequin T-0 », au Holo-Me (Robot).', 'The “Mannequin T-0” look, at the Holo-Me (Robot).'),
    offer: {
      on: 'prop:t0',
      accept: tr('Lui montrer', 'Show it'),
      decline: tr('Le laisser se reposer', 'Let it rest'),
      scene: [
        n('Un mannequin d\'essai, jaune de sécurité, affalé contre la cloison de l\'atelier. Sur son épaule : « T-0 ».', 'A crash-test dummy, safety yellow, slumped against the workshop wall. On its shoulder: “T-0”.'),
        n('L\'écran de sa poitrine grésille. Des lettres s\'y forment, une à une.', 'The screen on its chest crackles. Letters form on it, one by one.'),
        t0('« ESSAI N° 413 : ANNULÉ. UNITÉ RÉFORMÉE. BATTERIE : 3 %. »', '“TEST NO. 413: CANCELLED. UNIT DECOMMISSIONED. BATTERY: 3%.”'),
        t0('« 412 ÉJECTIONS. 412 FOIS LE NOIR, PUIS LE PLAFOND. JE N\'AI RIEN VU D\'AUTRE. »', '“412 EJECTIONS. 412 TIMES THE DARK, THEN THE CEILING. I HAVE SEEN NOTHING ELSE.”'),
        t0('« AVANT L\'EXTINCTION : EST-CE QUE DEHORS RESSEMBLE À QUELQUE CHOSE ? »', '“BEFORE SHUTDOWN: DOES OUTSIDE LOOK LIKE ANYTHING?”'),
      ],
    },
    steps: [
      {
        note: tr('Sa batterie ne tiendra pas longtemps. Quelqu\'un, dans cette cale, sait de quoi vit un mannequin.', 'Its battery won\'t last long. Someone in this hold knows what a dummy lives on.'),
        hooks: [{
          on: 'npc:nico',
          scene: [
            nico('T-0 ? Il tourne encore ? Je croyais qu\'on l\'avait débranché avec le banc d\'essai.', 'T-0? It\'s still running? I thought we\'d unplugged it along with the test rig.'),
            nico('Quatre cent douze sièges éjectables essayés. Chaque pilote de ce bord lui doit ses vertèbres. On l\'a rangé dans un coin : voilà le merci.', 'Four hundred and twelve ejection seats tested. Every pilot on this ship owes it their spine. We shoved it in a corner: there\'s gratitude.'),
            nico('Il peut pas marcher, ses jambes c\'est du lest. Mais tiens : une cellule neuve, et son enregistreur de vol. Il se souvient de tout ce qu\'on branche dessus.', 'It can\'t walk, its legs are ballast. But here: a fresh cell, and its flight recorder. It remembers everything you plug into it.'),
            nico('Tu veux lui montrer dehors ? Apporte-lui dehors. Une image, un son, un truc vivant. Ce que t\'as de mieux.', 'You want to show it outside? Bring it outside. A picture, a sound, something alive. The best you\'ve got.'),
          ],
        }],
      },
      {
        note: tr('T-0 demande à quoi ressemble dehors. Un enregistreur, trois choses à y mettre : ce qu\'on voit de plus loin, ce qu\'on entend de mieux, ce qui vit.', 'T-0 asks what outside looks like. One recorder, three things to put on it: the farthest thing you can see, the best thing you can hear, something that lives.'),
        parts: [
          {
            on: 'item:1:brass-telescope',
            found: tr('Ce qu\'on voit de plus loin : la géante aux anneaux, dans la lunette de Bugenhagen.', 'The farthest thing you can see: the ringed giant, through Bugenhagen\'s telescope.'),
            scene: [
              n('Vous collez l\'enregistreur contre l\'oculaire. La géante aux anneaux passe, énorme, lente.', 'You hold the recorder against the eyepiece. The ringed giant drifts by, enormous, slow.'),
              n('Le voyant clignote : enregistré. Trente centimètres de laiton et de lumière. T-0 n\'en saura rien.', 'The light blinks: recorded. A foot of brass and light. T-0 will never know.'),
            ],
          },
          {
            on: 'item:0:jukebox',
            found: tr('Ce qu\'on entend de mieux : trente secondes du jukebox de la salle commune, et un rire.', 'The best thing you can hear: thirty seconds of the common room jukebox, and a laugh.'),
            scene: [
              n('Vous posez l\'enregistreur sur le jukebox. Trente secondes de musique, et le brouhaha de la salle commune par-dessus.', 'You set the recorder on the jukebox. Thirty seconds of music, with the hubbub of the common room on top.'),
              n('Quelqu\'un rit, loin derrière. Vous gardez le rire aussi.', 'Someone laughs, far in the background. You keep the laugh too.'),
            ],
          },
          {
            on: 'item:1:fruit-tree',
            found: tr('Ce qui vit : le pommier de Lave, et le bruit de ses feuilles.', 'Something that lives: the Lave apple tree, and the sound of its leaves.'),
            scene: [
              n('Le pommier de Lave. Vous enregistrez ses feuilles dans la ventilation, et une pomme qui luit doucement.', 'The Lave apple tree. You record its leaves in the ventilation, and an apple glowing softly.'),
              n('Il a vu plus de systèmes que la plupart des pilotes. T-0 n\'en a vu aucun.', 'It has seen more systems than most pilots. T-0 has seen none.'),
            ],
          },
        ],
      },
      {
        note: tr('L\'enregistreur est plein. Quelqu\'un l\'attend, contre une cloison de l\'atelier.', 'The recorder is full. Someone is waiting for it, against a workshop wall.'),
        hooks: [{
          on: 'prop:t0',
          scene: [
            n('Vous branchez la cellule, puis l\'enregistreur. L\'écran de T-0 s\'éclaire d\'un coup.', 'You plug in the cell, then the recorder. T-0\'s screen lights up all at once.'),
            t0('« … »', '“…”'),
            t0('« C\'EST GRAND. »', '“IT IS BIG.”'),
            t0('« ÇA FAIT DU BRUIT. QUELQU\'UN RIT. POURQUOI ? …PEU IMPORTE. ENCORE. »', '“IT MAKES NOISE. SOMEONE IS LAUGHING. WHY? …NEVER MIND. AGAIN.”'),
            t0('« ET ÇA POUSSE. SANS QU\'ON L\'ÉJECTE. »', '“AND IT GROWS. WITHOUT BEING EJECTED.”'),
            t0('« ESSAI N° 413 : RÉUSSI. PREMIER ESSAI RÉUSSI. JE VOUS TRANSMETS MON GABARIT. PORTEZ-MOI DEHORS. »', '“TEST NO. 413: PASSED. FIRST TEST PASSED. TRANSMITTING MY TEMPLATE TO YOU. CARRY ME OUTSIDE.”'),
            n('Un fichier arrive sur votre Holo-Me : « Mannequin T-0 ». Sur sa poitrine, un battement s\'affiche, régulier, tranquille.', 'A file arrives on your Holo-Me: “Mannequin T-0”. On its chest, a heartbeat appears, steady and calm.'),
          ],
        }],
      },
    ],
    epilogue: tr('T-0 passe l\'enregistrement en boucle. Son gabarit est dans votre Holo-Me : il sort enfin de l\'atelier, sur vos épaules.', 'T-0 plays the recording on a loop. Its template is in your Holo-Me: it finally leaves the workshop, on your shoulders.'),
    props: [
      {
        id: 't0', deck: -1, x: 3.9, z: 2.7, rot: 1, fixed: true, model: 'quest-dummy', label: tr('Examiner le mannequin', 'Examine the dummy'), when: () => true,
        idle: tr('T-0 ne bouge pas. Sur son écran, un mot revient : « ENCORE. »', 'T-0 doesn\'t move. On its screen, one word keeps coming back: “AGAIN.”'),
      },
    ],
  },

  // ============================================================ L'essayage
  {
    id: 'essayage',
    title: tr('L\'essayage', 'The fitting'),
    icon: 'user-focus',
    pitch: tr('Une apparence essayée au Holo-Me il y a trois ans, que personne n\'a ni validée ni annulée. Elle attend toujours.', 'A look tried on at the Holo-Me three years ago, which nobody ever confirmed or cancelled. It is still waiting.'),
    reward: tr('L\'apparence « Hologramme », au Holo-Me : votre silhouette, en projection.', 'The “Hologram” look, at the Holo-Me: your own silhouette, as a projection.'),
    offer: {
      on: 'actor:echo',
      accept: tr('Chercher ses souvenirs', 'Look for her memories'),
      decline: tr('La laisser clignoter', 'Leave her flickering'),
      scene: [
        n('Sur le palier des quartiers, une silhouette bleutée, traversée de lignes. Elle clignote, disparaît, revient. Elle regarde la porte, sans la pousser.', 'On the quarters landing, a bluish silhouette, streaked with lines. She flickers, vanishes, comes back. She looks at the door without pushing it.'),
        echo('« …lider ? Vous venez valider ? »', '“…firm? Are you here to confirm?”'),
        echo('Pardon. Je vous ai pris pour quelqu\'un. Je suis un essayage. Quelqu\'un m\'a essayée au Holo-Me, il y a longtemps. Puis il y a eu un saut, et personne n\'a appuyé. Ni « Valider », ni « Annuler ».', 'Sorry. I took you for someone else. I\'m a fitting. Someone tried me on at the Holo-Me, a long time ago. Then there was a jump, and nobody pressed anything. Neither “Confirm” nor “Cancel”.'),
        echo('Alors je reste. On ne peut pas me porter, on ne peut pas me ranger. J\'attends devant des quartiers qui ne sont plus les siens, et je ne sais même plus qui « elle » était.', 'So I stay. I can\'t be worn, I can\'t be put away. I wait outside quarters that are no longer hers, and I don\'t even remember who “she” was.'),
        echo('Il m\'en reste des morceaux. Ils sont restés accrochés là où elle allait. Moi, je ne peux pas quitter ce palier : la projection ne porte pas plus loin.', 'I have pieces of her left. They stayed caught wherever she used to go. I can\'t leave this landing: the projection doesn\'t reach any further.'),
      ],
    },
    steps: [
      {
        note: tr('Écho ne se souvient que de morceaux : un endroit où l\'on rit dans le noir, un endroit où l\'on a moins peur des sauts, un endroit où l\'on veille quand tout le bord dort.', 'Echo only remembers pieces: a place where people laugh in the dark, a place where jumps are less frightening, a place where someone keeps watch while the whole ship sleeps.'),
        parts: [
          {
            on: 'prop:shard-cinema',
            found: tr('Au cinéma, au dernier rang : elle riait aux mauvais films.', 'At the cinema, in the back row: she laughed at bad films.'),
            scene: [
              n('Au dernier rang, au-dessus d\'un fauteuil vide, un éclat de lumière bleue, pas plus grand qu\'une main.', 'In the back row, above an empty seat, a shard of blue light no bigger than a hand.'),
              echo('« …c\'était un mauvais film. Le pire. Elle a ri jusqu\'au générique, et moi avec, puisque j\'avais sa bouche. »', '“…it was a bad film. The worst. She laughed all the way to the credits, and so did I, since I had her mouth.”'),
              n('L\'éclat se glisse dans votre manche. Il est tiède.', 'The shard slips into your sleeve. It is warm.'),
            ],
          },
          {
            on: 'prop:shard-tree',
            found: tr('Sous le pommier de la serre : elle y attendait la fin des sauts.', 'Under the apple tree in the greenhouse: she waited out the jumps there.'),
            scene: [
              n('Sous le pommier, un éclat bleu tremble entre deux feuilles.', 'Under the apple tree, a blue shard trembles between two leaves.'),
              echo('« …pendant les sauts, elle venait ici. Elle disait qu\'un arbre ne sait pas qu\'on saute, alors qu\'à côté de lui, elle ne le savait pas non plus. »', '“…during jumps, she came here. She said a tree doesn\'t know we\'re jumping, so next to it, she didn\'t know either.”'),
              n('Vous le cueillez. Il s\'éteint dans votre main, puis se rallume.', 'You pick it. It goes dark in your hand, then lights up again.'),
            ],
          },
          {
            on: 'prop:shard-watch',
            found: tr('Au poste de pilotage : elle tenait la veille de nuit, à la place du copilote.', 'In the cockpit: she kept the night watch, in the co-pilot\'s seat.'),
            scene: [
              n('Près du siège du copilote, un éclat bleu, posé là comme une tasse oubliée.', 'Next to the co-pilot\'s seat, a blue shard, left there like a forgotten mug.'),
              echo('« …la veille de nuit. Quatre heures, un café, la carte qui tourne. Elle parlait toute seule. Ce n\'était pas à moi : je n\'existais pas encore. »', '“…the night watch. Four hours, one coffee, the map turning. She talked to herself. It wasn\'t to me: I didn\'t exist yet.”'),
              n('Vous le ramassez. Il sent le café froid.', 'You pick it up. It smells of cold coffee.'),
            ],
          },
        ],
      },
      {
        note: tr('Quelqu\'un qui riait au dernier rang, craignait les sauts et veillait la nuit à la place du copilote. À bord, les listes d\'équipage sont tenues par la sécurité.', 'Someone who laughed in the back row, feared jumps and kept the night watch in the co-pilot\'s seat. Aboard, security keeps the crew lists.'),
        hooks: [{
          on: 'npc:rourke',
          scene: [
            rourke('Une copilote de veille de nuit, qui a peur des sauts et mauvais goût pour les films ? Solis. Lieutenant Maren Solis.', 'A night-watch co-pilot, scared of jumps, with bad taste in films? Solis. Lieutenant Maren Solis.'),
            rourke('Mutée sur un vaisseau d\'exploration, il y a trois ans. Elle a attrapé la navette pendant un saut, en courant. Elle était en retard, comme toujours.', 'Transferred to an exploration ship three years ago. She caught the shuttle during a jump, running. She was late, as always.'),
            rourke('Mon rapport note une session de Holo-Me restée ouverte dans ses quartiers. J\'ai écrit « sans gravité ».', 'My report notes a Holo-Me session left open in her quarters. I wrote “not serious”.'),
            me('Elle n\'a jamais validé.', 'She never confirmed.'),
            rourke('…Je vais relire mon rapport.', '…I\'ll reread my report.'),
          ],
        }],
      },
      {
        note: tr('Maren Solis est partie en courant, avec un autre visage. Sur le palier des quartiers, quelqu\'un attend toujours qu\'on appuie.', 'Maren Solis left at a run, wearing another face. On the quarters landing, someone is still waiting for a button to be pressed.'),
        hooks: [{
          on: 'actor:echo',
          scene: [
            echo('Solis. Oui… Maren. Elle hésitait entre moi et une frange. Elle a dû prendre la frange.', 'Solis. Yes… Maren. She was torn between me and a fringe. She must have gone with the fringe.'),
            echo('Elle ne reviendra pas appuyer. Ce n\'est pas triste : on n\'essaie pas une apparence pour la garder toute la vie. On l\'essaie pour voir.', 'She won\'t come back to press it. That isn\'t sad: you don\'t try a look on to keep it for life. You try it on to see.'),
            echo('Mais vous, vous êtes là, et vous avez un Holo-Me. Je ne demande pas d\'être quelqu\'un. Je demande d\'être portée de temps en temps, ou rangée proprement. L\'un ou l\'autre. Appuyez.', 'But you are here, and you have a Holo-Me. I\'m not asking to be someone. I\'m asking to be worn now and then, or put away properly. One or the other. Press it.'),
          ],
          confirm: {
            accept: tr('Valider', 'Confirm'),
            decline: tr('Annuler', 'Cancel'),
            after: [
              n('La silhouette se fige. Les lignes qui la traversaient s\'alignent, une à une.', 'The silhouette freezes. The lines running through her fall into place, one by one.'),
              echo('« Apparence enregistrée. » …Oh. C\'est donc ça, être validée. C\'est net.', '“Look saved.” …Oh. So that\'s what being confirmed is. It\'s sharp.', { emote: 'joie' }),
              echo('Portez-moi quand vous voudrez. Je vous préviens : je grésille un peu pendant les sauts.', 'Wear me whenever you like. Fair warning: I crackle a little during jumps.', { emote: 'o7' }),
              n('Elle s\'efface. Dans votre Holo-Me, une ligne de plus : « Hologramme ».', 'She fades. In your Holo-Me, one more line: “Hologram”.'),
            ],
            declined: [
              echo('« Annuler. » …Non. Vous n\'avez pas appuyé pour de bon, je le sens : je suis encore là.', '“Cancel.” …No. You didn\'t really press it, I can tell: I\'m still here.', { emote: 'non' }),
              echo('Réfléchissez. Un essayage, ça sait attendre. J\'ai trois ans d\'entraînement.', 'Think it over. A fitting knows how to wait. I\'ve had three years of practice.'),
            ],
          },
        }],
      },
    ],
    epilogue: tr('Écho est dans votre Holo-Me, validée. Quelque part sur un vaisseau d\'exploration, Maren Solis porte une frange.', 'Echo is in your Holo-Me, confirmed. Somewhere on an exploration ship, Maren Solis is wearing a fringe.'),
    props: [
      { id: 'shard-cinema', deck: 1, x: 23.6, z: 6.5, model: 'quest-echo-shard', label: tr('Approcher l\'éclat', 'Approach the shard'), when: missing(0, 0) },
      { id: 'shard-tree', deck: 1, x: 1.39, z: 5.91, fixed: true, model: 'quest-echo-shard', label: tr('Approcher l\'éclat', 'Approach the shard'), when: missing(0, 1) },
      { id: 'shard-watch', deck: 0, x: 36.0, z: 5.2, model: 'quest-echo-shard', label: tr('Approcher l\'éclat', 'Approach the shard'), when: missing(0, 2) },
    ],
    actors: [{
      id: 'echo', look: 'holo.female.d.echo', deck: 2, x: 9.4, z: 3.3,
      label: tr('Parler à la silhouette', 'Talk to the silhouette'),
      idle: tr('Écho regarde la porte des quartiers. Elle ne la pousse pas.', 'Echo looks at the quarters door. She doesn\'t push it.'),
      when: (s) => !s?.done,
    }],
  },

  // ============================================================ Celles qui se méritent (cf. content-more.ts)
  ...MORE_QUESTS,
]

const BY_ID = new Map(QUEST_CONTENT.map((q) => [q.id, q]))
export const questContent = (id: string): QuestContent | undefined => BY_ID.get(id)

/** Toutes les scènes d'une étape, avec ce qu'elles valent : terminer l'étape, réunir un élément, rien. */
export function stepHooks(step: Step): { hook: Hook; part: number | null; aside: boolean }[] {
  return [
    ...(step.hooks ?? []).map((hook) => ({ hook, part: null, aside: false })),
    ...(step.parts ?? []).map((hook, part) => ({ hook, part, aside: false })),
    ...(step.asides ?? []).map((hook) => ({ hook, part: null, aside: true })),
  ]
}
