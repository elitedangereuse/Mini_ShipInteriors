# MESS RUSH : conception

Refonte du mini-jeu de cuisine du mess en jeu coopératif, de 1 à 4 joueurs, inspiré
d'Overcooked. Branche de travail : `claude/festive-volta-t0qypn`.

Ce document est le résultat de la phase 1 (conception). Rien n'est codé tant qu'il n'est pas
validé. La partie site (endpoint PHP, tables, booster) est décrite à part, pour Mika :
[`mess-rush-site.md`](mess-rush-site.md).

## Décisions prises

| Sujet | Décision |
|---|---|
| Lieu | Une pièce **instanciée**, d'environ 10 × 8 tuiles, très inspirée du mess actuel ; pas une grande carte comme la baie thargoïde |
| Ancienne cuisine | Le rail des bons solo et sa paie (600 CR) sont remplacés par MESS RUSH ; le repas au plateau et Marcel restent au vrai mess |
| Victoire | Médaille de bronze au minimum |
| Booster | Un par semaine pour MESS RUSH, distinct de celui de la zone thargoïde |
| Solo | Une victoire en solo donne droit au booster et aux crédits |
| Salons | 4 salons publics d'abord ; salons privés et invitations plus tard (phase 5) |
| Ingrédients | Les noms officiels du jeu en français |
| Langues | `tr(fr, en)` comme dans tout le projet ; le français reste la langue par défaut |
| Service | 5 minutes au départ, réglable |
| Crédits | 1 000 / 2 000 / 3 000 CR selon la médaille (bronze, argent, or), 5 victoires payées par jour |
| Site | Mika écrit le côté site, d'après la spec |
| Reset | Le jeudi ; l'heure qui fait foi est la fin de partie, horodatée par le relais ; l'heure et le fuseau du reset restent à fixer |

## Ce qui existe et qu'on réutilise

| Existant | Où | Devient |
|---|---|---|
| Instances (baie thargoïde, arène, tutoriel) | `ZONE_LEVEL`, `ARENA_LEVEL`, `TUTORIAL_LEVEL` ; `instanced`, `hears` dans `server/relay.js` ; `setDeck`, `moveTo` dans `src/main.ts` | Un nouveau niveau `MESS_LEVEL` (−6), construit avec `new Deck(def)` comme le tutoriel |
| Mobilier et sol du mess | `src/furniture/kitchen.ts`, `src/furniture/mess-decor.ts` | Les mêmes builders, replacés dans la pièce agrandie ; le sol du mess (`messFloor`) reçoit son plan en paramètre au lieu de la constante `PLAN` |
| Lumières et ambiance | `src/levels.ts` (`lighting.m`, aire « Cuisine du mess », suspensions) | Copiées dans le `LevelDef` de l'instance |
| Salon de l'arène et de la zone | `server/arena.js:95-228`, `server/salvage.js:85-185` (blocs presque identiques) | Extraits dans un module partagé `server/lobby.js`, utilisé d'abord par MESS RUSH seul |
| Reconnexion | Tickets de `server/salvage.js` (`resume`, place gardée 60 s, résultat gardé 10 min) | La même mécanique |
| Paie par le site | `postSalvageResult` (`server/site.js:40-68`), `wallet.site`, `hud.siteRewards` | `postMessRushResult`, avec de nouveaux essais en cas d'échec |
| Fenêtres et menus | `Modal`, `.salvage-panel` (`src/salvage/ui.ts`, `src/style.css`) ; `pad-ui.ts` pour la manette | Le panneau du salon, le HUD et l'écran de fin |
| Jauge de geste | `startWork` (`src/main.ts`), déjà utilisée par la cuisine | Couper, rincer, fouetter |
| Repère des postes | L'hexagone cyan de `src/kitchen.ts` | Le poste utile à l'objet qu'on tient |
| Modèles 3D | `assets/3D assets/Food Kit/` (200 GLB, CC0) | Ingrédients, assiettes, marmite, poêle, tasses ; importés par un script vers `public/assets/`, jamais depuis `assets/` |
| Tests | `node --test server/*.test.js` ; le harnais de `server/salvage.test.js` (fausse horloge, aléa à graine) | Les mêmes harnais |

## La pièce : le mess agrandi

On reconnaît le mess : la salle chaude au nord, le comptoir du self qui traverse la pièce, la
cuisine blanche au sud. Elle passe de 7 × 7 à 10 × 8 tuiles : une allée de cuisine de deux
tuiles au lieu d'une, des postes doublés, et un passage à chaque bout du comptoir pour que quatre
joueurs se croisent. Le plan ci-dessous est un schéma : les positions exactes se règlent en
phase 2.

```
x →        8     9    10    11    12    13    14    15    16    17
z 5  (N)  SYN    .   MENU    .     .   porte  FON    .    RET    .     mur nord
z 6        .   [ table 1  ]  .     .   [ table 2  ]  .     .     .
z 7        .   [  bancs   ]  .     .   [  bancs   ]  .     .     .
z 8        .     .     .     .     .     .     .     .     .     .     allée du self
z 9       ⇅    ASS   DEP   DEP  RAIL   DEP   DEP   PASSE PASSE  ⇅     comptoir
z 10       .     .     .     .     .     .     .     .     .     .     allée de cuisine
z 11       .     .     .     .     .     .     .     .     .     .
z 12 (S)  FRIGO GARDE PLAN  PLAN  FOUR  FOUR  PLONGE  .   RECY    .     mur sud
```

| Repère | Meuble existant | Rôle |
|---|---|---|
| FRIGO | `fridge` | Distributeur : produits frais (lapin, escargots, crevettes, viande…) |
| GARDE | `pantry` (garde-manger) | Distributeur : produits secs (café, thé, céréales, légumes…) |
| SYN | `vending-machine` (distributeur de la salle) | Synthétiseur : viande synthétique, cartouches alimentaires |
| PLAN | `prep` (plan de travail), ×2 | Couper, fouetter (geste actif) |
| FOUR | `kitchen-range` (fourneau), ×2 | Une marmite et une poêle sur chacun (cuisson passive) |
| PLONGE | `sink` | Rincer (geste actif) |
| FON | `water-fountain` | Infuser le café et le thé (passif), servis en tasse |
| ASS | `tray-stack` | Pile d'assiettes propres |
| DEP | Le comptoir (`self-counter`) | Surfaces de dépôt et d'assemblage, accessibles des deux côtés |
| RAIL | `order-rail` | Les bons des commandes en cours |
| PASSE | La passe du comptoir, sous les lampes chauffantes | Livraison |
| RECY | `tray-return`, ou une poubelle du mobilier existant | Recyclage : jeter un objet raté |
| MENU, tables, porte | Décor | La porte reste fermée pendant le service |

Ajustements visuels, et rien d'autre :

- les objets posés et portés (modèles du Food Kit) ;
- une marmite et une poêle sur chaque fourneau ;
- des emplacements discrets peints sur le comptoir ;
- les jauges au-dessus des postes ;
- les bons accrochés au rail.

Le vrai mess du pont 0 ne change pas, sauf son rail des bons, qui devient le terminal du salon.

Marcel reste au vrai mess. Dans l'instance, il n'a pas de corps : un second `Chef` rejouerait
l'horloge partagée. Il parle à la radio, en bulles du HUD (« Deux ragoûts, ça presse ! »).

## Le salon

- **Où.** Au vrai mess, le rail des bons devient « Prendre le service » et ouvre le panneau du
  salon. Comme pour l'arène, on reste dans le salon tant qu'on reste dans le mess (pièce `m`).
- **Quoi.** 4 salons publics de 1 à 4 joueurs. Le premier arrivé est chef de salon ; s'il part,
  le suivant prend sa place. Chacun se dit prêt ; tout changement de l'équipe remet les « prêt »
  à zéro. Quand tous sont prêts, un compte à rebours de 3 s, puis l'entrée dans l'instance (fondu,
  `setDeck`). Un joueur qui n'est pas arrivé au bout de 20 s est retiré.
- **Code.** `server/lobby.js` reprend le bloc commun à l'arène et à la zone : membres, prêt, chef,
  réglages validés par le chef, compte à rebours, codes d'erreur. MESS RUSH est son seul
  utilisateur au début. Passer l'arène et la zone dessus serait une tâche à part, avec leurs
  tests comme filet.
- **Réglage du chef de salon :** aucun dans le prototype. La difficulté suit le nombre de joueurs.

## Le service

Les états du service :
`salon → compte à rebours → arrivée → en service (5:00) → fin (résultats) → salon`.

- Au retour, l'équipe reste formée pour relancer.
- Si plus personne n'est en jeu, le service est **abandonné** : pas de résultat ni de paie.

La boucle de jeu :

1. Un bon arrive au rail.
2. On prend les ingrédients aux distributeurs.
3. On les prépare : rincer, couper, fouetter.
4. On les cuit : marmite, poêle, infusion.
5. On dresse l'assiette.
6. On la pose à la passe.

### Deux touches, comme partout à bord

- `E` (A / Croix) : **prendre ou poser**.
  - Les mains vides, à un distributeur, on prend un ingrédient.
  - Les mains vides, sur un poste ou une surface, on prend ce qui s'y trouve.
  - Les mains pleines, on pose.
  - Une assiette en main devant une marmite cuite, on la sert.
- `Espace` (X / Carré) : **l'action du poste**.
  - On coupe, on rince ou on fouette : c'est un geste actif, avec la jauge de geste. S'éloigner
    le met en pause, et la progression reste sur l'ingrédient.
  - On lance la cuisson de la marmite ou de la poêle : c'est passif, on peut s'en aller.

On ne porte qu'un objet à la fois. L'invite affiche ce que la touche va faire. Elle est calculée
par la même fonction pure que le serveur (`resolveAction`), donc l'invite et l'arbitrage ne
peuvent pas diverger.

### Les objets et leurs états

Chaque objet a un identifiant unique, donné par le serveur, et un seul emplacement à la fois :
dans les mains d'un joueur, sur une surface ou dans un ustensile.

| Objet | États |
|---|---|
| Ingrédient | `brut → rincé`, `coupé`, `fouetté` (selon le catalogue) `→ cuit`. `→ brûlé` viendra après le prototype, désactivé par réglage |
| Ustensile (marmite, poêle) | `vide → garni → en cuisson → cuit → vide` (une fois servi). Il accepte des ingrédients seulement s'il est vide ou garni |
| Assiette, tasse | `vide → garnie`. Elle contient de 1 à 3 composants. Le plat est reconnu quand son contenu correspond exactement au dressage d'une recette |
| Commande | `en attente → servie` ou `expirée`. Les deux états finaux sont définitifs |
| Poste | `libre → occupé → en cours → prêt`, avec une capacité (1 sur un plan de travail, 1 par ustensile) |

Les règles qui empêchent les doublons :

- **Une transition à la fois.** Le serveur traite les actions une par une. Si deux joueurs
  prennent le même objet, le premier l'a et le second reçoit `taken`.
- **Une livraison consomme l'assiette.** Elle sert la plus ancienne commande en attente de la
  même recette, dans le même pas de calcul. L'assiette disparaît et la commande devient
  `servie` : elle ne peut pas l'être deux fois.
- **Une assiette qui ne correspond à rien est refusée.** Elle reste dans les mains, sans pénalité.
- **Un objet jeté au recyclage est consommé.** Il est compté comme gaspillage.
- **Toute action incompatible est refusée** avec un code : `far` (poste hors de portée, 1,6 m
  côté serveur), `busy`, `hands`, `state`, `full`.

### Les commandes

| Réglage, selon le nombre de joueurs | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| Commandes en même temps, au plus | 2 | 3 | 4 | 5 |
| Une nouvelle toutes les | 25 s | 14 s | 12 s | 10 s |
| Délais multipliés par | 1,3 | 1,1 | 1,05 | 1 |

- La première commande arrive 3 s après le début.
- Les recettes complexes n'apparaissent qu'après 2 minutes.
- Délais de base : rapide 60 s, intermédiaire 90 s, complexe 150 s.
- Tous ces chiffres sont dans `RULES` (`shared/mess-rush.js`). Ils sortent de la simulation de la
  phase 4 (cf. « L'équilibrage ») et restent à confirmer en jeu.

### Le score (collectif)

| Évènement | Points de départ |
|---|---|
| Livraison | La valeur de la recette : rapide 20, intermédiaire 40, complexe 80 |
| Rapidité | +50 % s'il reste au moins 2/3 du délai, +25 % s'il en reste au moins 1/3 |
| Combo | Livraisons réussies d'affilée : × (1 + 0,1 par livraison au-delà de la première), plafonné à × 1,5. Une commande expirée remet le combo à zéro |
| Commande expirée | −50 % de la valeur de la recette. Le score ne descend pas sous 0 |
| Gaspillage | Compté, sans pénalité ; on décidera après les essais |

Les médailles, issues de la simulation (cf. « L'équilibrage ») :

| Médaille | 1 joueur | 2 | 3 | 4 |
|---|---|---|---|---|
| Bronze (victoire) | 270 | 530 | 660 | 660 |
| Argent | 560 | 780 | 940 | 950 |
| Or | 730 | 950 | 1 050 | 1 150 |

### L'équilibrage

`scripts/mess-rush-balance.mjs` fait jouer des services complets avec les vraies règles et toute la
carte, de 1 à 4 cuisiniers, à trois niveaux :

| Niveau | Vitesse de marche | Réaction par action |
|---|---|---|
| Débutant | 1,6 m/s | 1,4 s |
| Moyen | 2,1 m/s | 0,8 s |
| Expert | 2,8 m/s | 0,35 s |

- **Les trajets** sont tirés du plan de la cuisine (le détour par un passage pour franchir le
  comptoir).
- **Ce que le modèle simplifie.** Un cuisinier attend la fin de ses cuissons au lieu d'en
  profiter ; les équipes se coordonnent sans se gêner.
- **Les seuils** : des débutants font le bronze, des joueurs moyens l'argent, l'or demande 90 %
  du score d'experts.
- **Le rythme.** Il a été resserré à plusieurs : avec l'ancien, quatre experts ne servaient que
  14 plats, contre 11 pour un seul.

| Joueurs | Débutants | Moyens | Experts | Expirées (débutants) |
|---|---|---|---|---|
| 1 | 265 | 557 | 809 | 1,0 |
| 2 | 528 | 782 | 1 058 | 1,2 |
| 3 | 655 | 935 | 1 166 | 1,6 |
| 4 | 609 | 951 | 1 278 | 3,8 |

(Score moyen sur 30 services par case.) Relancer le script après tout changement de recettes, de
durées ou de rythme ; les essais en jeu trancheront.

L'écran de fin affiche :

- victoire ou service raté ;
- le score et la médaille ;
- les commandes servies et expirées ;
- le meilleur combo ;
- le gaspillage ;
- puis la récompense, dans son état réel (cf. plus bas).

## Le réseau

Le relais fait autorité, comme pour la zone thargoïde. Il tient l'état de chaque partie
(`server/mess-rush.js`, une fabrique sur le modèle de `createSalvage`) et calcule à 10 Hz les
commandes, les délais, les cuissons, le score et la fin. Les clients n'envoient que leur
position (l'évènement `state`, déjà contrôlé) et leurs intentions.

| Client → relais | Sens |
|---|---|
| `mess:join {team}`, `mess:leave`, `mess:ready {ready}` | Le salon |
| `mess:use {station}` | La touche `E` sur un poste |
| `mess:work {station}`, `mess:stop` | La touche `Espace` : un geste ou le lancement d'une cuisson |
| `mess:quit` | Abandonner (deux clics) |
| `mess:resume {game, ticket}` | Reprendre après une coupure |

| Relais → client | Sens |
|---|---|
| `mess:lobby {teams}` | Les salons, pour tout le bord (et dans `welcome`) |
| `mess:start {game, ticket, seed, endsAt, now}` | Entrée dans l'instance |
| `mess:state {v, orders, items, stations, score, combo}` | L'état, à chaque changement, au plus 10 fois par seconde |
| `mess:event {kind, …}` | Les évènements : livraison, expiration, refus, médaille franchie, coéquipier parti ou revenu |
| `mess:end {…}` | Les résultats ; avec `late` pour un joueur revenu après la fin |
| `mess:reward {game, status, reward, boosters, earned, balance}` | La récompense confirmée par le site |
| `mess:error {code}` | Les erreurs du salon : `lobby`, `full`, `playing`, `gone`, `leader`, `resume` |

- **Ce que les autres tiennent.** Chacun voit ce que ses coéquipiers portent grâce à
  `mess:state`, qui dit qui tient quoi. `PlayerState` ne change pas.
- **Les délais.** Ils sont envoyés en heure du relais (`endsAt`, `now`), et le client corrige
  l'écart.
- **Dans `relay.js` :**
  - `MESS_LEVEL` rejoint `instanced`, la liste blanche de `state` et `MAPS` ;
  - `messRush.mates` rejoint `hears` et la diffusion à l'équipe ;
  - le contrôle de vraisemblance `accepts`, la déconnexion `leave` ;
  - une limite de débit, comme la zone (20 jetons, +10/s).
- **Les coupures.** Une coupure fait poser ce qu'on tenait sur la surface libre la plus proche,
  et la place est gardée 60 s. Le navigateur garde le ticket : on revient dans l'allée de
  cuisine. Si le service s'est terminé entre-temps, on en voit le résultat et la récompense
  (gardés 10 min).

## Les récompenses

Elles sont individuelles, payées par le site, jamais déclarées par le client.

1. À la fin du service, le relais horodate la fin (`endedAt`). Pour chaque membre CMDR encore là
   (ou parti depuis moins de 60 s), il envoie le résultat au site avec le cookie du joueur et la
   clé `MSI_RELAY_SECRET` (`postMessRushResult`).
2. Le site décide, dans une seule transaction :
   - pas de médaille : rien ;
   - première victoire de la semaine pour ce CMDR : le booster ;
   - sinon : les crédits de la médaille, dans la limite de 5 victoires payées par jour ;
   - une même partie ne paie jamais deux fois un même CMDR (clé partie + CMDR).
3. **Si le site ne répond pas,** le relais réessaie avec la même partie (5 s, 30 s, 2 min).
   C'est sans risque : le site rend la réponse déjà enregistrée au lieu de payer de nouveau.
4. **Le client n'affiche que ce que le site a confirmé :**
   - en attente : « Envoi du résultat au site… » ;
   - booster : « Première victoire de la semaine ! Booster de cartes attribué : il vous attend
     sur le site. » ;
   - crédits : « Victoire ! Vous gagnez 2 000 CR. », avec le nouveau solde ;
   - plafond atteint : « Plafond du jour atteint : cette victoire ne rapporte pas de crédits. » ;
   - échec : « Le site n'a pas confirmé la récompense. Code de partie : … » ;
   - invité : « Connectez-vous sur le site pour gagner des récompenses. »

- **Cas limites :**
  - Une défaite n'écrit rien dans la table de la semaine, donc ne consomme jamais le booster.
  - Les crédits restent dans le portefeuille du site : un reset ne les touche pas.
  - Une partie finie avant la bascule du jeudi compte pour l'ancienne semaine, même si le site la
    reçoit après.
- **Les réglages.** Les chiffres vivent dans `src/economy/economy.json`, que le site relit déjà :

```json
"messRush": {
  "service": 300,
  "credits": { "bronze": 1000, "silver": 2000, "gold": 3000 },
  "daily": 5,
  "boosters": 1,
  "firstWinCredits": false,
  "reset": { "day": "thursday", "hour": null, "tz": null }
}
```

  `hour` et `tz` à `null` : le site applique sa bascule actuelle (celle de la boutique), en
  attendant la décision.

  `firstWinCredits: false` suit le cahier des charges : la première victoire donne le booster,
  pas de crédits. On peut l'inverser sans code.

## Le catalogue

Le catalogue est fait de données (`shared/mess-rush-catalog.js`) : on ajoute une recette sans
toucher au moteur. Un test vérifie sa cohérence.

- **Un ingrédient :** `id`, nom français, nom canonique anglais, catégorie, rare ou non, origine
  (système, station), poste d'où il sort, modèle 3D, statut, sources.
- **Une recette :** `id`, nom français, difficulté, valeur de base, délai, contenant (assiette,
  assiette creuse, tasse), dressage (composants et état attendu), étapes ordonnées (poste,
  action, durée), conditions de réussite et d'échec, statut, sources.

Statuts : `canonique` (attesté par le jeu ou GalNet), `adaptation` (un ingrédient canonique dans
une recette inventée), `création` (une invention de gameplay).

### Ingrédients

Les sources sont :

- **A** : identifiants du jeu, [EDCD FDevIDs](https://github.com/EDCD/FDevIDs) (`rare_commodity.csv`, `commodity.csv`) ;
- **B** : noms français d'un client du jeu en français
  ([journal `Market.json`](https://github.com/Mirooz/EliteDangerousWarboard), confirmé par
  BGS-Tally `fr.rare_commodity.csv`) ;
- **C** : la liste des marchandises rares du wiki (miroir) ;
- **D** : le jeu de données `rares.csv` de jackies-map.

Le wiki fandom, Inara, EDSM et scotty.newlevels.org étaient inaccessibles depuis la session : à
revérifier par un humain avant la sortie.

| Nom affiché | Nom canonique | Catégorie | Origine | Poste | Statut | Sources |
|---|---|---|---|---|---|---|
| Lapins de Ceti | Ceti Rabbits | Alimentation, rare | 47 Ceti, Kaufmanis Hub | Frigo | canonique | A B C D |
| Escargots géants d'Irukama | Giant Irukama Snails | Alimentation, rare | Irukama, Blaauw City | Frigo | canonique | A B C D |
| Crevettes stellaires de Baltah'sine | Baltah'sine Vacuum Krill | Alimentation, rare | Baltah'Sine, Baltha'sine Station | Frigo | canonique | A B C D |
| Café Goman Yaupon | Goman Yaupon Coffee | Alimentation, rare | Goman, Gustav Sporer Port | Garde-manger | canonique | A B C D |
| Bourgeons de thé d'Ethgreze | Ethgreze Tea Buds | Alimentation, rare | Ethgreze, Bloch Station | Garde-manger | canonique | A B C D |
| Pommes d'eden d'Aerial | Eden Apples of Aerial | Alimentation, rare | Aerial, Andrade Legacy | Garde-manger | canonique | A B C D |
| Ma Corn de Diso | Diso Ma Corn | Alimentation, rare | Diso, Shifnalport | Garde-manger | canonique (le lore en fait une plante dont on prise la poussière de graines : la cuire est une adaptation) | A B C D |
| Gâteaux de blé Wheemete | Wheemete Wheat Cakes | Alimentation, rare | Wheemete, Eisinga Enterprise | Garde-manger | canonique | A B C D |
| Riz jarouan | Jaroua Rice | Alimentation, rare | Jaroua, McCool City | Garde-manger | canonique | A B C D |
| Truffes de Deuringas | Deuringas Truffles | Alimentation, rare | Deuringas, Shukor Hub | Garde-manger | canonique | A B C D |
| Piments d'Ochoeng | Ochoeng Chillies | Alimentation, rare | Ochoeng, Roddenberry Gateway | Garde-manger | canonique | A B C D |
| Fruits et légumes | Fruit and Vegetables | Alimentation | — | Garde-manger | canonique | A B |
| Viande synthétique | Synthetic Meat | Alimentation | — | Synthétiseur | canonique | A B |
| Cartouches alimentaires | Food Cartridges | Alimentation | — | Synthétiseur | canonique | A B |
| Balanes spatiales | — (« space barnacle », GalNet) | — | — | Frigo | **création** : ce n'est pas une marchandise ; les Thargoid Barnacles sont des structures au sol qui donnent des méta-alliages. Seul l'article de GalNet en fait un mets | GalNet 06 MAR 3302 |

Écartés pour l'instant :

- « Krill du Vide », introuvable : l'article dit « Vacuum krill », qui renvoie aux crevettes de
  Baltah'sine.
- Le caviar, le bœuf de Kobe, l'œuf d'Aepyornis, etc. Ils sont vérifiés (A B C D) et
  disponibles pour enrichir le catalogue en phase 4.

### Recettes

| Recette | Difficulté | Étapes de jeu | Statut |
|---|---|---|---|
| Café Goman Yaupon | rapide | Garde-manger → fontaine (infuser, 4 s) → passe | adaptation |
| Thé en bourgeons d'Ethgreze | rapide | Garde-manger → fontaine (infuser, 4 s) → passe | adaptation |
| Pommes d'eden d'Aerial | rapide | Garde-manger → plan (couper) → assiette → passe | adaptation |
| Ma Corn de Diso grillé | rapide | Garde-manger → poêle (5 s) → assiette → passe | adaptation |
| Ragoût de lapin de Ceti | intermédiaire | Lapin : frigo → plan (couper). Légumes : garde-manger → plan (couper). Les deux dans la marmite (8 s) → assiette → passe | adaptation (déjà au menu du jour et dans l'ancienne cuisine) |
| Escargots géants d'Irukama | intermédiaire | Frigo → plonge (rincer) → poêle (5 s) → assiette → passe | adaptation |
| Crevettes stellaires de Baltah'sine sautées | intermédiaire | Frigo → plonge (rincer) → poêle (5 s) → assiette → passe | adaptation |
| Gâteaux de blé Wheemete aux pommes d'eden | intermédiaire | Gâteaux : garde-manger → poêle (réchauffer). Pommes : garde-manger → plan (couper). Assiette avec les deux → passe | adaptation |
| Bouillon de balanes spatiales | complexe | Frigo → plonge (rincer) → marmite (10 s) → assiette creuse → passe | création, inspirée de GalNet |
| Mousse à l'huile de truffe de Deuringas | complexe | Garde-manger → plan (couper) → plan (fouetter) → assiette → passe | adaptation, inspirée de GalNet |
| Réduction de piments d'Ochoeng | complexe | Garde-manger → plan (couper) → poêle (réduire, 6 s) → assiette → passe | adaptation, inspirée de GalNet |
| Bouillon impérial de balanes spatiales | complexe | Le bouillon, la mousse et la réduction réunis dans une assiette creuse → passe | création (le nom n'est pas attesté) |

La référence, citée en anglais dans les métadonnées : « Freelance Report: Pleased To Eat You »,
GalNet, 06 MAR 3302, texte officiel de Frontier
([archive](https://community.elitedangerous.com/galnet/uid/56d9702c9657baef074bf67d)).
Oliver Gordon y annonce *« a dish fit for an emperor: space barnacle broth with a Deuringas truffle
oil foam and Ochoeng chilli reduction »*. C'est un seul plat en trois composantes ; les étapes de
jeu sont inventées. La traduction française de news.galnet.fr n'a pas pu être lue.

**La carte du service (phase 4) :** toutes les recettes ci-dessus. Les rapides et les
intermédiaires dès le début, les complexes après 2 minutes de service.

**Prototype (phase 2) :**

- Café Goman Yaupon : un distributeur, la fontaine, la passe.
- Escargots géants d'Irukama : la plonge, la poêle, l'assiette.
- Ragoût de lapin de Ceti : la découpe, la marmite à deux ingrédients, l'assemblage.

Ces trois recettes couvrent tous les postes.

## Fichiers

À créer :

| Fichier | Contenu |
|---|---|
| `shared/mess-rush.js` (+ `.d.ts`) | `MESS_LEVEL`, le plan de la pièce, `RULES`, les machines à états, `resolveAction`, le score, les combos, les médailles : du code pur, sans réseau |
| `shared/mess-rush-catalog.js` (+ `.d.ts`) | Les ingrédients, les recettes, les postes, les procédés |
| `server/lobby.js` | Le salon commun (extrait de l'arène et de la zone) |
| `server/mess-rush.js` | La partie, qui fait autorité : salon, instance, tickets, fin, paie |
| `server/mess-rush.test.js`, `server/mess-rush-catalog.test.js`, `server/lobby.test.js`, `server/mess-rush-relay.test.js` | Les tests (cf. plus bas) |
| `src/mess-rush/client.ts` | La machine à états du client et son interface d'hôte, comme `SalvageHost` |
| `src/mess-rush/ui.ts` | Le panneau du salon, le HUD (bons, minuteur, score, combo) et l'écran de fin |
| `src/mess-rush/props.ts` | Les objets posés et portés, les jauges, les bons au rail |
| `scripts/import-kenney-food.mjs` | L'import des modèles utiles du Food Kit vers `public/assets/` |

À modifier, par ajouts ciblés :

| Fichier | Changement |
|---|---|
| `server/relay.js` | `MESS_LEVEL` dans `instanced`, `hears`, la liste blanche, `MAPS` ; branchement des évènements, limite de débit, `tick`, déconnexion |
| `server/site.js` | `postMessRushResult`, avec de nouveaux essais |
| `src/net.ts` | Les types, `EVENTS`, `sendMessRush` |
| `src/main.ts` | Construction de l'instance (comme la base au sol), `moveTo`, `sees`, `whereIs`, entrées, mise à jour par image, invites |
| `src/levels.ts` | Le `LevelDef` de l'instance (`messRushLevel()`) et un drapeau `instance` |
| `src/deck.ts` | Garder l'éclairage de la pièce pour un deck `instance` (une ligne, vers 1188) |
| `src/furniture/mess-decor.ts` | `messFloor` reçoit son plan au lieu de la constante `PLAN` ; le mess actuel garde le sien |
| `src/kitchen.ts` | Retirer le rail des bons solo ; garder les plateaux et le repas |
| `src/economy/economy.json`, `src/economy/data.ts` | La section `messRush` |
| `src/style.css`, `src/mobile.css` | Le salon, le HUD, l'écran de fin |
| `server/arena-relay.test.js` | Ajouter `MESS_LEVEL` au test des niveaux distincts |
| `README.md` | Les sections « Le mess », « Crédits » et « Comptes » |

Hors de ce dépôt (Mika) : l'endpoint, les tables et le booster, cf.
[`mess-rush-site.md`](mess-rush-site.md).

## Tests

Logique pure (`node --test`, fausse horloge et aléa à graine, comme `salvage.test.js`) :

- **Catalogue :**
  - chaque ingrédient d'une recette existe ;
  - chaque étape vise un poste qui sait la faire ;
  - chaque recette est faisable de bout en bout ;
  - tout nom affiché est rempli ;
  - les statuts et les sources sont présents.
- **Transitions :**
  - toutes les transitions valides passent et les invalides sont refusées avec leur code ;
  - deux prises simultanées du même objet donnent un gagnant et un `taken` ;
  - une même assiette livrée deux fois ne compte qu'une fois ;
  - une commande expirée ne peut plus être servie ;
  - un ustensile en cuisson refuse les ajouts.
- **Commandes :** l'apparition selon le nombre de joueurs, le plafond simultané, l'expiration et
  sa pénalité, le combo remis à zéro.
- **Score :** les bonus de rapidité, les combos, le plancher à 0, les médailles selon les seuils.
- **Service :** la fin à 5:00, l'abandon quand tout le monde part, l'arrivée manquée (20 s).
- **Coupure :** l'objet tenu est posé, la place gardée 60 s, la reprise par ticket, la reprise
  après la fin (`late`).
- **Paie :**
  - un appel par CMDR et par partie, aucun pour un invité ni pour un service raté ;
  - de nouveaux essais avec le même identifiant de partie ;
  - le refus si la durée n'est pas plausible.

Intégration (un vrai relais socket.io, comme `salvage-relay.test.js`) : former un salon de 2
puis de 4 joueurs, lancer, isoler l'instance des autres joueurs, actions simultanées, coupure et
reprise.

Avant la première ligne de code, on lance `npm test` et `npm run build` sur la branche, pour avoir
la référence.

## Découpage de la phase 2 (prototype solo)

1. Les règles pures et le catalogue du prototype, avec leurs tests.
2. L'instance : le `LevelDef` agrandi, le sol paramétré, l'entrée et la sortie (sur le modèle du
   tutoriel), un salon d'un seul joueur.
3. Les postes et les objets : prendre, poser, couper, rincer, cuire, infuser, dresser, livrer.
4. Le HUD : les bons, le minuteur, le score, le combo.
5. La fin de service et l'écran de résultats (la paie reste désactivée tant que le site n'est
   pas prêt).
6. Retrait du rail solo de l'ancienne cuisine.
7. Une partie complète de bout en bout, en solo.

## Risques suivis

- **`main.ts` et `relay.js` sont centraux.** On n'y fait que des ajouts ciblés : la logique vit
  dans les modules de MESS RUSH.
- **L'éclairage de l'instance.** `offShip()` coupe l'éclairage général : il faut l'exception dans
  `deck.ts`, à vérifier à l'œil.
- **Le sol du mess** dépend de coordonnées absolues (`PLAN`). Le paramétrer ne doit pas changer
  le vrai mess : il faut comparer avant et après.
- **Le site injoignable.** Les nouveaux essais couvrent les coupures courtes. Un redémarrage du
  relais pendant un essai perd la paie (comme aujourd'hui pour la zone) : une file sur disque est
  possible en phase 5 si besoin.
- **Les noms français officiels** viennent d'une seule capture du client : à confirmer.
