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
- **Murs en tuiles** : on pose un type de mur (simple, demi-mur, avec porte, avec hublot, cassé,
  avec arche) sur les arêtes du quadrillage, puis on applique le papier peint case par case ou
  d'un coup. C'est l'actuelle feature des cloisons, étendue à tous les murs.
- Parcelle de **10 × 10** au départ, **deux agrandissements** à acheter.
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
Le mur cassé n'existe dans aucun kit : à dessiner en code (`src/furniture/kit.ts`) ou à dériver
d'un mur du kit.

---

## Bloc A · L'étage des quartiers

**A1. Ajouter le pont 2 « Quartiers ».** Plan dans `shared/ship-layouts.js` (`'2'`), entrée dans
`LEVELS` (`levels.ts`) : nom, ambiance (celle, chaleureuse, de l'actuel pont supérieur), pas,
palier d'ascenseur à `LIFT` (10, 5). Le pont n'a que le palier en dur ; la parcelle se construit
à la volée (cf. B1). L'ascenseur le propose au-dessus du pont supérieur (`lift.open`,
`lift-ride.ts`), « Vous êtes ici » compris.

**A2. Un pont sans coque.** La coque (`src/hull.ts`) épouse l'union des plans : la parcelle
(jusqu'à 18 cases) la déformerait. Le pont 2 sort de `footprint()` et reçoit son propre socle
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
Décider de l'usage de la place (cf. décisions Q2).

## Bloc B · La parcelle et sa bulle

**B1. Modèle de parcelle partagé.** Nouveau `shared/housing-plot.js` (+ `.d.ts`, tests) : tailles
par palier (10, puis cf. décisions Q1), position sur le pont 2 (ancrée du côté du palier, pour que
les coordonnées des objets restent valables quand elle grandit), cases, arêtes intérieures et
arêtes du périmètre, `applyPlot(map, layout)` qui pose les cases, les murs et les portes sur le
`ShipMap` (comme `applyWings` / `applyPartitions`). Utilisé par le client, le relais (ligne de
vue) et à reproduire sur le site.

**B2. Construire la parcelle à la volée.** Équivalent de `WingShell` (`src/cabin/wings.ts`) pour
toute la parcelle : sol de base, murs posés, portes animées, collisions, pathfinding, fondu des
murs côté caméra. Relever `MAX_OCCLUDERS` (96) de `view.ts` et vérifier les perfs à 18 × 18.

**B3. La bulle : champ de force sur le périmètre.** Généraliser `src/shield.ts` (un pan sur un
bord de pont) à une liste d'arêtes : un seul maillage (ou instancié) pour tout le périmètre, coins
propres, fondu en vue isométrique, collision de mur. Les pylônes deviennent des bornes aux coins.

**B4. Un mur sur le champ de force le remplace.** Les arêtes du périmètre acceptent un mur (cf.
D1) ; le champ de force n'est tendu que sur les arêtes restées libres. Retirer le mur rend le
champ. Étendre `applyPartitions`, qui exige aujourd'hui deux cases de la même pièce.

**B5. Acheter les agrandissements.** `economy.json` : `plot: [prix 1, prix 2]` à la place de
`wings` ; `wallet.buyPlot()` (`src/economy/wallet.ts`) ; l'achat et la taille gardée par le site.
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
Limite relevée (48 → de quoi faire le tour d'une parcelle de 18 et la cloisonner, p. ex. 256) dans
`shared/cabin-partitions.js`, `server/cabin.js`, le site ; bornes de coordonnées élargies au
pont 2.

**D2. Six types de murs.** Mur simple, demi-mur, mur avec porte (les huit battants actuels restent
une variante de la porte), mur avec hublot, mur cassé, mur avec arche. Modèles à prendre dans les
kits Kenney (cf. plus haut), à part le mur cassé (D4). `WALL_KINDS` / `DOOR_KINDS`,
`PARTITION_KINDS` (`partitions.ts`).

**D3. Ce que chaque type bloque.** Passage, vue (`shared/sight.js`, tests `server/sight.test.js`)
et accroche d'objets : le demi-mur bloque le passage mais pas la vue, on peut y poser de petits
objets ; l'arche et la porte laissent passer ; le mur cassé, cf. décisions Q3.

**D4. Le mur cassé.** Modèle fait main : pan du vaisseau éventré, câbles, débris au pied ; tient
dans le même encadrement que les autres pour les raccords et les poteaux d'angle.

**D5. Papier peint par face.** Chaque face d'un mur a son revêtement (`a` / `b` dans la cloison,
indices de la même palette que le sol). Outils : pinceau case par case, toute la pièce (faces
tournées vers une zone fermée), tous les murs d'un coup, pipette. Le panneau en retrait
(`PANEL_SPANS` de `view.ts`) à décliner pour les nouveaux types (demi-mur, arche, mur cassé).

**D6. Pièces déduites des murs.** Les règles de pose (`rules.ts`) parlent de « pièces » tirées du
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
D5. Tests relais.

**F3. Choisir où aller.** À l'ascenseur, l'étage des quartiers propose « Mes quartiers » et la
liste des quartiers ouverts des joueurs connectés (et ceux où l'on est invité) ; on arrive sur le
palier de l'hôte. Aussi depuis la liste de l'équipage.

**F4. Invitations et retours sur le pont 2.** Reprendre le parcours actuel (téléporté devant la
porte, « Rentrer chez moi », raccompagner, l'hôte qui part) avec le palier de la parcelle comme
point d'arrivée.

## Bloc G · Données, migration et site

**G1. Format v2 de l'aménagement.** `{ v: 2, plot, items, floor: { palette, cells }, walls:
[{ x, z, e, k?, a?, b? }], open? }` : `layout.ts`, `server/cabin.js`, le site
(`outils/mini-shipinteriors-cabin.php`, dépôt du site) et leurs tests. À poser en premier : les
autres blocs écrivent dedans.

**G2. Migration v1 → v2.** Les quartiers actuels ne doivent pas être perdus : transposer la cabine
`p` et ses extensions dans la parcelle (coordonnées des objets, murs de la pièce et des extensions
en murs posés, revêtements par pièce en revêtements par case et par face, cloisons gardées). Faite
à la lecture côté client, et une fois pour toutes sur le site. Ce qui ne tient pas dans 10 × 10 :
cf. décisions Q4.

**G3. Achats d'extensions déjà faits.** Cf. décisions D4 : convertis en agrandissements ou
remboursés en crédits, côté site.

## Bloc H · Finitions

**H1. Galerie.** `/gallery.html` : les six types de murs, la bulle, une parcelle exemple.
**H2. Perfs.** Parcelle de 18 × 18 meublée au maximum, sur mobile et en qualité basse.
**H3. README.** Sections « Quartiers personnalisables », « Le vaisseau », « Architecture »,
captures.

---

## Ordre proposé

1. **Socle** : G1, A1, A3, B1, B2, B3. On prend l'ascenseur, on arrive dans une bulle vide de
   10 × 10.
2. **Construire** : D1, D2, D3, B4, D6, E1, E2. On pose ses murs, le champ de force recule.
3. **Habiller** : C1, C2, C3, D5, D4. Sol et papier peint par case.
4. **Partager** : F1 à F4.
5. **Basculer** : A4, A5, A2, G2, G3, B5. On quitte l'ancienne cabine, migration, achats.
6. **Finir** : E3, E4, H1 à H3.

Le lot 5 est le seul qui casse l'existant : jusque-là, l'ancienne cabine reste en place et le
pont 2 peut rester derrière un drapeau (`?housing-v2`).

## Décisions à prendre

| | Question | Proposition |
|---|---|---|
| Q1 | Tailles et prix des agrandissements | 10 → 14 → 18 cases de côté ; 250 000 et 750 000 CR |
| Q2 | Que devient la place libérée sur le pont supérieur ? | Une pièce commune (salon, bibliothèque) ou un pont plus court |
| Q3 | Le mur cassé laisse-t-il passer ? | Non : décoratif, il laisse voir à travers la brèche mais pas passer |
| Q4 | Extensions déjà achetées, objets hors de la parcelle | Une extension ou plus = premier agrandissement offert (deux ou trois = les deux) ; objets hors parcelle remis à l'inventaire (toujours débloqués) |
| Q5 | Fermer ses quartiers pendant une visite | Les visiteurs restent jusqu'à leur départ ; « raccompagner » reste possible |
| Q6 | Sol sans revêtement | Dalle de base du vaisseau ; pas de vide (on marche partout dans la bulle) |
| Q7 | Murs et revêtements payants ? | Gratuits, comme les cloisons et les revêtements aujourd'hui |
