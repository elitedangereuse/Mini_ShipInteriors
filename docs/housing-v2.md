# Housing v2 : découpage en tâches

Refonte des quartiers du commandant. Branche de travail : `feature/housing-v2`.

Les tâches se suivent dans le projet GitHub « Mini Interior » (cf. `AGENTS.md`) ; ce document
sert à créer les cartes et à garder le cahier des charges sous la main pendant le développement.
Une fois les cartes créées, il peut ne garder que la partie « Cible » et les décisions.

## Cible

- Les quartiers quittent le pont supérieur pour un **étage dédié** (pont 2), au-dessus, desservi
  par l'ascenseur.
- Sur cet étage, chaque joueur a **sa bulle** : une parcelle à lui, instanciée, où il fait ce
  qu'il veut.
- La parcelle est **ouverte** au départ, entourée d'un **champ de force** (celui du hangar,
  `src/shield.ts`). Un mur posé sur le champ de force le remplace.
- **Sol en tuiles** : on pose un revêtement sur une zone d'une case à plusieurs.
- **Murs en tuiles** : on pose un type de mur (simple, demi-mur, avec porte, avec hublot, avec
  arche) sur les arêtes du quadrillage, puis on applique le papier peint case par case ou
  d'un coup. C'est l'actuelle feature des cloisons, étendue à tous les murs.
- Parcelle de **10 × 10** au départ, **deux agrandissements** à acheter : 20 × 20, puis 30 × 30.
- Quartiers **ouverts ou fermés** : ouverts, n'importe quel joueur peut venir les visiter sans
  invitation.

## Ce qui existe et qu'on réutilise

| Existant | Où | Devient |
|---|---|---|
| Cabine `p` du pont 1, instanciée par joueur | `levels.ts` (`cabin`), `server/relay.js` (`p.cabin`, `moveTo`, `visit`) | toute la parcelle du pont 2, instanciée |
| Cloisons (murs et portes sur les arêtes, 48 max) | `shared/cabin-partitions.js`, `src/cabin/partitions.ts`, onglet « Cloisons » d'`editor.ts` | **tous** les murs de la parcelle |
| Revêtements murs et sol (un par pièce) | `src/cabin/finishes.ts`, `view.ts` | revêtements par case (sol) et par face de mur |
| Extensions payantes (3 espaces × 10 formes) | `shared/cabin-wings.js`, `src/cabin/wings.ts`, `economy.json` (`wings`) | remplacées par les agrandissements de la parcelle |
| Bouclier du hangar (un pan sur un bord de pont) | `src/shield.ts`, `shield` dans `levels.ts` | périmètre complet de la parcelle |
| Invitations, « Rentrer chez moi », raccompagner | `src/cabin/hud.ts`, `server/relay.js` | gardées, plus la visite libre |
| Enregistrement sur le site | `src/cabin/storage.ts`, `server/cabin.js`, site (`outils/mini-shipinteriors-cabin.php`, dépôt du site) | format v2 |

Modèles Kenney utiles (cf. `assets/`) : `Furniture Kit` (`wallHalf`, `wallDoorway`,
`wallDoorwayWide`, `wallWindow`, `floorHalf`), `Building Kit` (`wall-half`, `wall-low`,
`wall-doorway-round` pour l'arche, `wall-window-*`), `Modular Space Kit`
(`template-wall-half`), `Space Station Kit` (les murs actuels du vaisseau, `wall-door-wide`).

---

## Bloc A · L'étage des quartiers

**A1. Ajouter le pont 2 « Quartiers ».** Plan dans `shared/ship-layouts.js` (`'2'`), entrée dans
`LEVELS` (`levels.ts`) : nom, ambiance (celle, chaleureuse, de l'actuel pont supérieur), pas,
palier d'ascenseur à `LIFT` (10, 5). Le pont n'a que le palier en dur ; la parcelle se construit
à la volée (cf. B1). L'ascenseur le propose au-dessus du pont supérieur (`lift.open`,
`lift-ride.ts`), « Vous êtes ici » compris.

**A2. Un pont sans coque.** La coque (`src/hull.ts`) épouse l'union des plans : la parcelle
(jusqu'à 30 cases de côté) la déformerait. Le pont 2 sort de `footprint()` et reçoit son propre socle
(plateforme sous la bulle, rebord, feux), étoiles tout autour ; vu du pont 1, rien ne change.

**A3. Instancier tout le pont 2.** Aujourd'hui seule la pièce `p` du pont 1 l'est. Côté relais :
`reaches` / `cabinMap` (niveau 1 → 2), `JUKEBOX_LEVEL` (`cabin` → 2), `moveTo`, fin de visite au
changement de pont (`ride` dans `main.ts`). Côté client : on ne voit que les joueurs de son
instance sur le pont 2, tout le monde ailleurs. Tests dans `server/relay.test.js`.

**A4. Réveil et Holo-Me.** `SPAWN` passe sur le pont 2, devant le palier ; le Holo-Me reste un
objet de la parcelle, accessible depuis le palier (`holoReachable`).

**A5. Libérer le pont supérieur.** Retirer la cabine `p`, les trois espaces d'extension et leurs
portes (`wingDoors`, `shipMapOptions`), l'éclairage réservé aux objets de la cabine, les tâches de
bord qui y tombent (`economy.json`, entrées `deck: 1`), l'emplacement de Comète si besoin.
La place libérée devient une pièce vide, « Pièce vierge » (« Blank room »), qu'on aménagera
plus tard (cf. décisions Q2).

## Bloc B · La parcelle et sa bulle

**B1. Modèle de parcelle partagé.** Nouveau `shared/housing-plot.js` (+ `.d.ts`, tests) : tailles
par palier (10, 20, 30 ; cf. décisions Q1), position sur le pont 2 (ancrée du côté du palier, pour que
les coordonnées des objets restent valables quand elle grandit), cases, arêtes intérieures et
arêtes du périmètre, `applyPlot(map, layout)` qui pose les cases, les murs et les portes sur le
`ShipMap` (comme `applyWings` / `applyPartitions`). Utilisé par le client, le relais (ligne de
vue) et à reproduire sur le site.

**B2. Construire la parcelle à la volée.** Équivalent de `WingShell` (`src/cabin/wings.ts`) pour
toute la parcelle : sol de base, murs posés, portes animées, collisions, pathfinding, fondu des
murs côté caméra. Relever `MAX_OCCLUDERS` (96) de `view.ts` et vérifier les perfs à 30 × 30 (900 cases : découper la géométrie fusionnée par
blocs, pour ne reconstruire que le bloc touché).

**B3. La bulle : champ de force sur le périmètre.** Généraliser `src/shield.ts` (un pan sur un
bord de pont) à une liste d'arêtes : un seul maillage (ou instancié) pour tout le périmètre, coins
propres, fondu en vue isométrique, collision de mur. Les pylônes deviennent des bornes aux coins.

**B4. Un mur sur le champ de force le remplace.** Les arêtes du périmètre acceptent un mur (cf.
D1) ; le champ de force n'est tendu que sur les arêtes restées libres. Retirer le mur rend le
champ. Étendre `applyPartitions`, qui exige aujourd'hui deux cases de la même pièce.

**B5. Acheter les agrandissements.** `economy.json` : `plot: [100000, 250000]` à la place de
`wings` (cf. décisions Q1) ; `wallet.buyPlot()` (`src/economy/wallet.ts`) ; l'achat et la taille gardée par le site.
Interface : onglet « Parcelle » du mode aménagement (remplace « Pièces »), aperçu au sol de la
surface gagnée, le champ de force recule.

## Bloc C · Le sol en tuiles

**C1. Revêtement par case.** Format : une palette de revêtements (`{ style, color }`, 16 au plus)
et une grille d'indices sur la parcelle (encodage compact, p. ex. RLE par ligne) ; case sans
revêtement = dalle de base. Lecture, normalisation et bornes dans `layout.ts`, `server/cabin.js`.

**C2. Rendu.** Une géométrie fusionnée par revêtement utilisé (`FinishTexture` de `finishes.ts`),
sous les tapis comme aujourd'hui (`FLOORING_Y`) ; raccords propres entre deux revêtements.

**C3. Outils de pose.** Clic : une case ; glisser : un rectangle ; remplir : la zone fermée par
les murs (ou toute la parcelle) ; pipette ; gomme (retour à la dalle). Aperçu avant de relâcher,
annuler / rétablir.

## Bloc D · Les murs en tuiles et le papier peint

**D1. Tous les murs sont des tuiles.** Les cloisons deviennent l'unique façon de bâtir : plus de
pièces dessinées en ASCII, plus de murs « d'origine ». Arêtes intérieures et périmètre (B4).
Limite relevée (48 → de quoi faire le tour d'une parcelle de 30, 120 arêtes, et la cloisonner,
p. ex. 512) dans
`shared/cabin-partitions.js`, `server/cabin.js`, le site ; bornes de coordonnées élargies au
pont 2.

**D2. Cinq types de murs.** Mur simple, demi-mur, mur avec porte (les huit battants actuels restent
une variante de la porte), mur avec hublot, mur avec arche. Modèles à prendre dans les kits
Kenney (cf. plus haut). `WALL_KINDS` / `DOOR_KINDS`,
`PARTITION_KINDS` (`partitions.ts`).

**D3. Ce que chaque type bloque.** Passage, vue (`shared/sight.js`, tests `server/sight.test.js`)
et accroche d'objets : le demi-mur bloque le passage mais pas la vue, on peut y poser de petits
objets ; l'arche et la porte laissent passer.

**D4. Papier peint par face.** Chaque face d'un mur a son revêtement (`a` / `b` dans la cloison,
indices de la même palette que le sol). Outils : pinceau case par case, toute la pièce (faces
tournées vers une zone fermée), tous les murs d'un coup, pipette. Le panneau en retrait
(`PANEL_SPANS` de `view.ts`) à décliner pour les nouveaux types (demi-mur, arche).

**D5. Pièces déduites des murs.** Les règles de pose (`rules.ts`) parlent de « pièces » tirées du
plan ASCII : les déduire des murs (remplissage depuis le palier), garder les règles (pas à cheval
sur un mur, passage des portes libre, tout accessible depuis le palier, Holo-Me compris).
Remplacer la limite par pièce (64 / 32) par une limite par parcelle, qui grandit avec elle.

## Bloc E · Le mode aménagement

**E1. Onglets.** « Mobilier » (le catalogue), « Murs », « Papier peint », « Sol », « Parcelle » ;
les onglets « Murs et sol », « Cloisons » et « Pièces » disparaissent. `editor.ts` (2 100 lignes)
gagne à être découpé par onglet au passage.

**E2. Outils communs.** Une barre d'outils partagée par murs, papier peint et sol : pinceau,
rectangle / ligne, remplir, pipette, gomme ; mêmes raccourcis, un seul historique d'annulation.

**E3. Manette et tactile.** Tracer des murs et des zones au pad (`shared/gamepad.js`) et au doigt
(`touch-gamepad.ts`).

**E4. Parcelle neuve.** Ce qu'on trouve en arrivant : la parcelle ouverte, le Holo-Me, le lit, et
pourquoi pas deux ou trois plans tout faits (« studio », « deux pièces ») à poser d'un clic.

## Bloc F · Ouvert ou fermé, et visites

**F1. Le réglage.** « Quartiers ouverts / sur invitation » dans la barre des quartiers
(`hud.ts`) ; gardé avec l'aménagement, connu du relais (`publicState`) ; fermé par défaut.

**F2. Visiter sans invitation.** Le relais accepte `visit` vers un hôte ouvert sans invitation en
cours ; l'invitation reste pour les quartiers fermés. Fermer pendant une visite : cf. décisions
Q5. Tests relais.

**F3. Choisir où aller.** À l'ascenseur, l'étage des quartiers propose « Mes quartiers » et la
liste des quartiers ouverts des joueurs connectés (et ceux où l'on est invité) ; on arrive sur le
palier de l'hôte. Aussi depuis la liste de l'équipage.

**F4. Invitations et retours sur le pont 2.** Reprendre le parcours actuel (téléporté devant la
porte, « Rentrer chez moi », raccompagner, l'hôte qui part) avec le palier de la parcelle comme
point d'arrivée.

## Bloc G · Données, migration et site

**G1. Format v2 de l'aménagement.** `{ v: 2, plot, items, floor: { palette, cells }, walls:
[{ x, z, e, k?, a?, b? }], open? }` : `layout.ts`, `server/cabin.js`, le site
(`outils/mini-shipinteriors-cabin.php`, dépôt du site) et leurs tests. À poser avant les murs : ce
sont eux qui y écrivent les premiers (la bulle vide du lot 1 n'enregistre rien).

État (lots 2 et 3) : `shared/housing-home.js` définit le format 2 et sa vérification
(`sanitizeHome`), le relais le garde dans le champ `home` de l'aménagement (`server/cabin.js`).
**Reste le site**, dont le dépôt n'était pas accessible depuis la session : en attendant, la
parcelle est gardée dans le navigateur (`src/housing/storage.ts`). Ce que le site doit accepter
et rendre, dans le champ `home` de l'aménagement (le plus simple : porter `sanitizeHome` tel quel) :

- `v` vaut 2, sinon le champ est ignoré ;
- `open` : `true` si les quartiers sont ouverts (on y entre sans invitation), absent sinon ;
- `walls` : 512 murs au plus, chacun `{ x, z, e, k?, a?, b? }`, `x` et `z` entiers, `x` entre 11
  et 41, `z` entre -1 et 29, `e` vaut `v` ou `h` ; une arête en double n'est gardée qu'une fois,
  la dernière ;
- `k` : chaîne de 1 à 24 caractères `[a-z0-9-]`, jamais `wall`, qui s'écrit sans `k` ;
- `a`, `b` : papier peint des deux faces du mur, entiers de 0 à 15, index dans `papers` ;
- `papers` : 16 revêtements au plus, `{ style, color }`, `style` de 1 à 24 caractères
  `[a-z0-9-]`, `color` en `#rrggbb` ;
- `floor` : `{ palette, cells }`, `palette` comme `papers`, `cells` les 900 cases de la plus
  grande parcelle (30 × 30, ligne par ligne depuis son coin nord-ouest), en plages `[.a-p]\d{1,4}`
  (`.` : dalle nue, `a` à `p` : index dans `palette`) ;
- un revêtement mal formé est oublié (ses faces et ses cases redeviennent nues) ; les palettes
  ne gardent que ce qui sert, dans l'ordre où on le rencontre.

**G2. Migration v1 → v2.** Les quartiers actuels ne doivent pas être perdus : transposer la cabine
`p` et ses extensions dans la parcelle (coordonnées des objets, murs de la pièce et des extensions
en murs posés, revêtements par pièce en revêtements par case et par face, cloisons gardées). Faite
à la lecture côté client, et une fois pour toutes sur le site. Ce qui ne tient pas dans 10 × 10 :
cf. décisions Q4.

**G3. Achats d'extensions déjà faits.** Cf. décisions Q4 : convertis en agrandissements ou
remboursés en crédits, côté site.

## Bloc H · Finitions

**H1. Galerie.** `/gallery.html` : les cinq types de murs, la bulle, une parcelle exemple.
**H2. Perfs.** Parcelle de 30 × 30 meublée au maximum, sur mobile et en qualité basse.
**H3. README.** Sections « Quartiers personnalisables », « Le vaisseau », « Architecture »,
captures.

---

## Ordre proposé

1. **Socle** (fait) : A1, A2, A3, B1, B2, B3. On prend l'ascenseur, on arrive dans une bulle vide de
   10 × 10. Derrière `?housing-v2` ; la parcelle se construit déjà aux trois tailles (`HomeView`).
2. **Construire** (fait) : G1 (côté jeu et relais), D1, D2, D3, B4, E1, E2. On pose ses murs, le
   champ de force recule. D5 en partie : une partie coupée de l'ascenseur est signalée (« ajoutez
   une porte ») sans bloquer, le reste (règles de pose des meubles) vient avec le mobilier.
3. **Habiller** (fait) : C1, C2, C3, D4. Sol et papier peint par case.
4. **Partager** (fait) : F1 à F4. Quartiers ouverts ou sur invitation (barre des quartiers), visite
   sans invitation des quartiers ouverts, à l'ascenseur (« Mes quartiers », « Chez … ») et depuis la
   liste de l'équipage ; invitations, retour et raccompagnement arrivent et repartent du palier.
   Fermer pendant une visite laisse les visiteurs (proposition Q5, appliquée en attendant votre avis).
5. **Basculer** (fait, derrière `?housing-v2`) : A4, A5, D5, G2, G3, B5.
   - On se réveille sur le pont des quartiers, à côté de son Holo-Me ; Comète et les compagnons
     y vivent ; au pont supérieur, la « Pièce vierge » a pris la place des quartiers, sans les
     portes des extensions.
   - La première fois, les anciens quartiers deviennent une construction de la parcelle
     (`shared/housing-migrate.js`) : leurs murs, leurs portes (les battants des cloisons compris),
     leur papier peint et leur sol en tuiles, leurs objets décalés d'un bloc. Les extensions
     achetées offrent les agrandissements (Q4) : la construction tient toujours.
   - Le mobilier se pose sur la parcelle avec le mode aménagement (`CabinView` en mode parcelle :
     murs d'accroche tirés des murs posés, limite de 64, 128 puis 160 objets selon la taille) ;
     « Construction » et « Mobilier » passent de l'un à l'autre. Un mur ne traverse pas un meuble,
     et retirer un mur décroche ce qui y était accroché (Ctrl+Z le raccroche).
   - Onglet « Parcelle » : la taille, les deux agrandissements et leur prix (`plot` dans
     `economy.json`), l'achat (`wallet.buyPlot`).
   - Les anciens quartiers (format 1, sur le site) ne sont plus modifiés : retirer le drapeau les
     rend tels qu'ils étaient.
6. **Finir** (fait, derrière `?housing-v2`) : E3, E4, H1 à H3.
   - Manette (E3) : un curseur au stick gauche, `A` maintenu trace, `X` annule, `B` abandonne le
     trait ou ferme, `LB` / `RB` changent d'outil, `Y` passe au type, au motif ou au plan suivant,
     `R3` tourne le plan, `Start` change d'onglet ; stick droit et gâchettes pour la caméra. Au
     doigt, on trace comme à la souris.
   - Plans tout faits (E4, `shared/housing-templates.js`) : studio, deux pièces, suite, véranda,
     coin salon ; outil « Plans » de l'onglet Murs, `R` pour tourner, posés en entier ou refusés
     (sur un meuble, hors de la parcelle, sur le palier).
   - Galerie (H1) : `/gallery.html?parcelle`, les onze murs et portes, des revêtements, trois plans.
   - Perfs (H2), parcelle de 30 × 30 pleine (512 murs dont 68 portes, papier peint sur chaque face,
     sol partout, 160 objets), mesurées en rendu logiciel (swiftshader), en qualité normale comme
     en qualité basse : un mur de plus, qui reconstruit les murs, le champ et les liaisons de la
     cabine, autour de 100 ms (une fois par trait, au lâcher) ; une case de sol, 3 ms ; une image
     du pont, 0,15 ms hors rendu ; la visée du mode construction, moins de 1 ms ; 670 maillages
     dessinés (plus leur ombre en qualité normale). Gagné en route : les objets ne se refusionnent
     plus quand seuls les murs changent (`CabinView.relink`), les plots du champ de force sont
     instanciés, et l'encadrement, le décor et le papier peint d'une porte sont fusionnés (avec
     une porte sur trois murs, de 1 661 à 1 127 maillages). Pas encore essayé sur un vrai
     téléphone.
   - README (H3) : section « Quartiers v2 », captures, architecture.

Pour basculer pour de bon, il reste ce qui ne se fait pas dans ce dépôt, puis un ménage :

1. **Le site** (dépôt du site) : garder le champ `home` au format 2 (G1, cf. plus haut, objets et
   palier compris) ; vendre les agrandissements (`buy` avec `plot: 1 | 2`, prix de `economy.json`)
   et rendre `wallet.plot` ; faire la migration une fois pour toutes à la première lecture (la
   logique est `migrateCabin`, à porter telle quelle ou à confier au jeu, qui la fait déjà).
2. **Le jeu** : enregistrer la parcelle sur le site plutôt que dans le navigateur
   (`housing/storage.ts`), réserver de nouveau l'aménagement aux CMDR connectés, puis retirer le
   drapeau (`housing/flag.ts`) et le code des anciens quartiers devenu inutile (extensions,
   cloisons, onglets « Murs et sol », « Cloisons » et « Pièces »).

## Décisions

Prises :

| | Question | Décision |
|---|---|---|
| Q1 | Tailles et prix des agrandissements | 10 × 10, puis 20 × 20, puis 30 × 30 ; les prix des extensions actuelles, dans l'ordre : 100 000 puis 250 000 CR |
| Q2 | Que devient la place libérée sur le pont supérieur ? | Une pièce vide, « Pièce vierge », pour plus tard |
| Q3 | Mur cassé | Abandonné |

À prendre (propositions) :

| | Question | Proposition |
|---|---|---|
| Q4 | Extensions déjà achetées, objets hors de la parcelle | Une extension ou plus = premier agrandissement offert (deux ou trois = les deux) ; objets hors parcelle retirés (ils restent débloqués, à reposer). Appliqué au lot 5 : la migration fait tenir la construction, rien n'est retiré |
| Q5 | Fermer ses quartiers pendant une visite | Les visiteurs restent jusqu'à leur départ ; « raccompagner » reste possible (appliqué au lot 4) |
| Q6 | Sol sans revêtement | Dalle de base du vaisseau ; pas de vide (on marche partout dans la bulle). Appliqué au lot 3 |
| Q7 | Murs et revêtements payants ? | Gratuits, comme les cloisons et les revêtements aujourd'hui. Appliqué aux lots 2 et 3 |
