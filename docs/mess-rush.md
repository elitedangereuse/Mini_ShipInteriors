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
  `setDeck`). Un joueur qui n'est pas arrivé au bout de 30 s est retiré.
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
| Une nouvelle toutes les | 25 s | 15 s | 13 s | 11 s |
| Délais multipliés par | 1,3 | 1,3 | 1,3 | 1,25 |
| Hors carte | riz aux crevettes, bouillon impérial | bouillon impérial | — | — |

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
| Bronze (victoire) | 230 | 410 | 450 | 450 |
| Argent | 390 | 580 | 700 | 700 |
| Or | 490 | 650 | 770 | 830 |

À plusieurs, ces chiffres viennent de la mise à jour 1.1 (cf. plus bas) : la cuisine cloisonnée
oblige à se passer les plats, ce que la simulation ne sait pas faire. Les délais ont été allongés
et les seuils baissés d'environ 15 % au jugé ; à confirmer en jeu.

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
| 1 | 230 | 385 | 548 | 0,9 |
| 2 | 477 | 681 | 844 | 1,7 |
| 3 | 534 | 828 | 1 003 | 2,8 |
| 4 | 515 | 816 | 1 094 | 4,9 |

(Score moyen sur 30 services par case, avec les 15 recettes de la carte.) Avec 12 recettes, les
scores étaient de 15 à 30 % plus hauts : les trois intermédiaires ajoutées sont plus longues, et la
plonge unique devient un goulot à plusieurs. Relancer le script après tout changement de recettes, de
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
| `mess:end {…}` | Les résultats, aux membres encore en service (pas à ceux qui l'ont quitté) ; `rewarding` : sa victoire part au site ; `late` : revenu après la fin |
| `mess:reward {game, status, reward, boosters, earned, balance}` | La récompense confirmée par le site |
| `mess:error {code}` | Les erreurs du salon : `lobby`, `full`, `playing`, `gone`, `resume`, `elsewhere` (place encore tenue par une autre liaison) |

- **Ce que les autres tiennent.** Chacun voit ce que ses coéquipiers portent grâce à
  `mess:state`, qui dit qui tient quoi. `PlayerState` ne change pas.
- **Les délais.** Ils sont envoyés en heure du relais (`endsAt`, `now`), et le client corrige
  l'écart.
- **Dans `relay.js` :**
  - `MESS_LEVEL` rejoint `instanced`, la liste blanche de `state` et `MAPS` ;
  - `messRush.mates` rejoint `hears` et la diffusion à l'équipe ;
  - le contrôle de vraisemblance `accepts` (une réserve de course qui se recharge au rythme du
    sprint et que chaque position use : une rafale de positions ne téléporte pas), la
    déconnexion `leave` ;
  - une limite de débit, comme la zone (20 jetons, +10/s).
- **Les coupures.** Une coupure fait poser ce qu'on tenait sur le premier comptoir libre, et la
  place est gardée 60 s. Le navigateur garde le ticket : on revient dans l'allée de cuisine. Si
  l'ancienne liaison tient encore la place (changement de réseau, le relais ne l'a pas encore vue
  tomber), le client réessaie toutes les 5 s le temps que la place attend. Si le service s'est
  terminé entre-temps, on en voit le résultat et la récompense (gardés 10 min) ; si le site n'a
  pas encore répondu, sa réponse suit sur la nouvelle liaison.

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
   - invité : « Connectez-vous sur le site pour gagner des récompenses. » ;
   - parti plus d'une minute avant la fin (donc pas présenté au site) : « Pas de récompense :
     vous n'étiez plus en cuisine à la fin du service. »

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
| Truffes de Deuringas | Deuringas Truffles | Alimentation, rare | Deuringas, Shukor Hub | Garde-manger | canonique | A B C D |
| Piments d'Ochoeng | Ochoeng Chillies | Alimentation, rare | Ochoeng, Roddenberry Gateway | Garde-manger | canonique | A B C D |
| Œuf d'Aepyornis | Aepyornis Egg | Alimentation, rare | 47 Ceti, Glushko Station | Frigo | canonique | A B C D |
| Bœuf de Kobe de Witchhaul | Witchhaul Kobe Beef | Alimentation, rare | Witchhaul, Hornby Terminal | Frigo | canonique | A B C D |
| Riz jarouan | Jaroua Rice | Alimentation, rare | Jaroua, McCool City | Garde-manger | canonique | A B C D |
| Fruits et légumes | Fruit and Vegetables | Alimentation | — | Garde-manger | canonique | A B |
| Viande synthétique | Synthetic Meat | Alimentation | — | Synthétiseur | canonique | A B |
| Cartouches alimentaires | Food Cartridges | Alimentation | — | Synthétiseur | canonique | A B |
| Balanes spatiales | — (« space barnacle », GalNet) | — | — | Frigo | **création** : ce n'est pas une marchandise ; les Thargoid Barnacles sont des structures au sol qui donnent des méta-alliages. Seul l'article de GalNet en fait un mets | GalNet 06 MAR 3302 |

Écartés pour l'instant :

- « Krill du Vide », introuvable : l'article dit « Vacuum krill », qui renvoie aux crevettes de
  Baltah'sine.
- Le caviar d'Esuseku, le mammouth albinos, la viande ornementale de Sanuma, les œufs millénaires,
  etc. Ils sont vérifiés (A B C D) et disponibles pour de prochaines recettes. L'œuf d'Aepyornis, le
  bœuf de Kobe et le riz jarouan sont entrés à la carte en phase 4.

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
| Omelette à l'œuf d'Aepyornis | intermédiaire | Frigo → plan (fouetter) → poêle (5 s) → assiette → passe | adaptation (phase 4) |
| Bœuf de Kobe de Witchhaul grillé | intermédiaire | Frigo → plan (couper) → poêle (5 s) → assiette → passe | adaptation (phase 4) |
| Riz jarouan aux crevettes stellaires | intermédiaire (60 pts, 120 s) | Riz : garde-manger → plonge (rincer) → marmite. Crevettes : frigo → plonge (rincer) → poêle. Assiette avec les deux → passe | adaptation (phase 4) |
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
- **Service :** la fin à 5:00, l'abandon quand tout le monde part, l'arrivée manquée (30 s).
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

## Mise à jour 1.1

Carte « 👨🏻‍🍳 Mess Rush Update v1.1 » du tableau : rapprocher MESS RUSH d'Overcooked.

### La vue du dessus

En cuisine, la caméra est imposée : presque à la verticale (58°), du côté de la salle, les postes du
mur sud face à soi, toute la pièce à l'écran entre le bandeau du haut et la consigne du bas. On ne
la tourne, ne l'incline ni ne zoome (`IsoCamera.locked`), et la vue subjective attend la sortie
(`isoOnly`). Le cadrage suit la taille de l'écran (`kitchenZoom` dans `src/main.ts`) ; les bons
passent en colonne à gauche, et l'invite « E » se pose sous les pieds du joueur.

### Les cloisons

À plusieurs, chacun tient sa zone et l'on se passe les plats par-dessus les comptoirs
(`KITCHENS` dans `shared/mess-rush.js`). La cloison du milieu est un plan de travail étroit, entre
les deux fourneaux ; le comptoir du self sépare la salle de la cuisine une fois ses deux passages
fermés.

| Joueurs | Zones (dans l'ordre du salon) | Ce qui oblige à coopérer |
|---|---|---|
| 1 | toute la cuisine | — |
| 2 | ouest (distributeurs, assiettes, fontaine) · est (plonge, passe) | tout plat passe d'ouest en est |
| 3 | cuisine ouest · cuisine est · salle (assiettes, fontaine, passe) | la cuisine prépare, la salle dresse et livre |
| 4 | les quatre coins | idem, et la cloison coupe aussi la salle |

- Les **passe-plats** sont des places de comptoir qu'atteignent deux zones : ceux de la cloison
  (`passe-plat-sud`, `passe-plat-nord`), et le comptoir du self entre la salle et la cuisine.
- Un **second bac** (`recyclage-2`) est encastré dans la cloison, et le retour plateaux de la salle
  sert de bac (`retour-plateaux`).
- Le relais refuse une position hors de sa zone (`inZone`), et les règles une action sur un poste
  qu'on n'atteint pas (`canReach`, dans `resolveAction`) ; le client ne vise que les postes de sa
  zone, et les cloisons bloquent le passage (`Deck.addRuntime`).
- **Un cuisinier part pour de bon** (abandon, liaison perdue plus d'une minute, jamais arrivé) :
  les cloisons tombent (`openKitchen`) et la cuisine reprend le plan solo ; ce que portaient les
  passe-plats va sur le comptoir. Sans cela, une zone sans personne rendrait des plats impossibles.
- La **carte** dépend aussi du nombre de joueurs (`menuFor`) : seul, ni le riz aux crevettes ni le
  bouillon impérial ; à deux, pas de bouillon impérial.

### Le guidage

`guide(state, joueur)` dit le prochain geste utile et où le faire, dans sa zone : des flèches vertes
rebondissent au-dessus des postes, et une consigne s'affiche en bas (« Rincer : Escargots », « À la
passe ! », « Passez-le à l'équipe par le passe-plat »). Quand le poste utile est chez un coéquipier,
la flèche montre le passe-plat. Les mains vides, dans l'ordre : un plat prêt à livrer, quelque chose
de prêt à dresser (prendre une assiette, ou une assiette entamée qu'il complète), un geste à faire,
un ustensile à lancer, un ingrédient posé qu'on sait traiter, débarrasser une assiette vide qui
bouche un passe-plat, puis ce qui manque aux bons, au distributeur.

Un test fait jouer des services entiers, de 1 à 4 cuisiniers, à des robots qui ne font que suivre le
guidage (`server/mess-rush-kitchens.test.js`) : ils servent 15 à 27 plats par service, presque sans
commande expirée. C'est ce qui a fait sortir les cas où le guidage tournait en rond (assiettes vides
qui bouchent les passe-plats, plat fini qui fait l'aller-retour entre deux zones).

### Les postes

- **Le poste visé** est celui qu'on regarde, à portée : un poste de côté compte jusqu'à deux fois
  sa distance, un poste dans le dos trois fois. Sans cela, devant une poêle, on visait le
  passe-plat de la cloison voisine.
- **Repères** : chaque poste a son pictogramme au-dessus de lui (frigo, garde-manger, couteau,
  plonge, marmite, poêle, café, assiettes, sonnette de la passe, recyclage, passe-plat), grisé chez
  un coéquipier.
- **Vider** : Espace sur une marmite, une poêle ou la fontaine en cuisson ou cuite la vide (deux
  appuis, c'est perdu, compté en gaspillage). Pas encore lancée, E reprend le dernier ingrédient
  mis.
- **La jauge** des gestes et des cuissons était invisible : minuscule, sous l'invite « E », et son
  remplissage opaque, dessiné sans test de profondeur, était recouvert par la passe transparente du
  pont. Elle est plus grande, devant le poste, et « transparente » pour passer après le décor.

### Les bons qui expirent

Quand un bon expire, ce qu'on lui préparait et qu'aucun autre bon n'attend disparaît, où qu'il soit
(mains, postes, ustensiles, assiettes et tasses ; les assiettes restent, vidées) : `clearUnneeded`.
Sans pénalité ni gaspillage compté.

### Les sons

Synthétisés (`Sound.kitchen`) : la sonnette quand une cuisson est prête, le ticket et la petite
cloche d'un nouveau bon, le buzzer d'un bon expiré, deux notes quand un geste est fini, le bac de
recyclage ; et la caisse quand un plat est servi, un petit son quand on prend ou pose.

### À confirmer en jeu

- Le rythme et les médailles à plusieurs (cf. plus haut).
- Le partage des rôles à quatre : le coin nord-est n'a que la passe et le retour plateaux.
- Les sons, jamais écoutés (session sans haut-parleur).

## Mise à jour 1.2

Plus près des cuisiniers, des rôles mieux partagés, des imprévus, et deux musiques.

### La vue

La vue du dessus montre un peu plus que la moitié de la pièce (`KITCHEN_SPAN`, 8 × 6,6 m, au lieu de
toute la cuisine) et suit le cuisinier à moitié, sans s'écarter du milieu de plus de 1,3 m en
largeur et 0,9 m en profondeur : les murs restent à l'écran (`FOLLOW` et `focus` dans
`src/mess-rush/client.ts`). On ne la tourne ni ne zoome toujours pas.

### Les rôles

À deux, le joueur du coin du frigo faisait presque tout : les distributeurs, les plans de travail
et la fontaine étaient à l'ouest, l'est n'avait que la plonge, les fourneaux et la passe. Le mur sud
est réparti autrement : **l'ouest prépare** (distributeurs, deux plans de travail, assiettes,
fontaine), **l'est cuit et sert** (deux fourneaux, plonge, passe). Un second passe-plat
(`passe-plat-centre`) double celui du sud dans la cloison.

Mesuré avec les robots du guidage (part des gestes, plats servis par service, imprévus compris) :

| Joueurs | Avant (1.1) | Après |
|---|---|---|
| 2 | 54 / 46 %, 21,5 plats | 49 / 51 %, 21,4 plats |
| 3 | 45 / 31 / 24 %, 21,2 plats | 41 / 35 / 23 %, 20,5 plats |
| 4 | 50 / 29 / 9 / 11 %, 23,2 plats | 47 / 37 / 6 / 10 %, 22,8 plats |

À quatre, les coins de la salle restent légers ; le plateau renversé leur donne du travail.

### Les imprévus

Comme dans Overcooked, la cuisine se dérègle. Le relais tire les imprévus sur la graine du service :
toute l'équipe vit les mêmes, au même moment (`stepEvent`, `RULES.events`). Un seul à la fois, le
premier après une minute, puis toutes les 35 à 55 s, jamais dans les 20 dernières secondes.

| Imprévu | Effet | Fin |
|---|---|---|
| Panne de courant (`outage`) | les cuissons s'arrêtent où elles en sont, l'écran s'assombrit et grésille | 10 s |
| Plonge bouchée (`sink`) | on y pose, mais on n'y rince plus ; une flaque devant | 12 s |
| Plateau renversé (`spill`) | la passe refuse les plats ; une flaque de sauce dessus | nettoyée : Espace, mains vides, 2,5 s |
| Coup de feu (`rush`) | deux bons d'un coup | aussitôt |
| L'amiral à bord (`vip`) | un bon doré, au délai ×0,75, qui rapporte ×2 | aussitôt |

Le bandeau rouge sous le score dit l'imprévu en cours et ce qui reste (secondes, ou nettoyage) ; le
guidage en tient compte (ni plonge bouchée, ni passe renversée ; « nettoyez la passe », ou posez le
plat en attendant). Essais : `server/mess-rush-events.test.js`.

### Les musiques

Deux morceaux enregistrés (`public/assets/music/mess-rush/`, cf. `CREDITS.txt` et
`src/mess-rush/music.ts`) :

- **« MESS RUSH »** au mess, tant qu'on y est, comme la sono du lobby de CMDR Arena ou de la zone
  thargoïde : la même mesure pour tous, et le jukebox du pont lui laisse la place. Il passe par une
  **platine** : pleurage et scintillement (un retard modulé fait onduler la hauteur), son de vinyle
  (ni sub-graves, aigus adoucis, un peu de saturation) et craquements.
- **« Arcade Groove »** en cuisine, en boucle, de l'arrivée au début du service jusqu'à la fin des
  cinq minutes (ou au départ).

### À confirmer en jeu (1.2)

- Le cadrage plus serré sur téléphone (en paysage).
- Le volume des deux musiques face aux sons de la cuisine, et le dosage de la platine.
- La fréquence des imprévus : assez pour pimenter, pas au point d'agacer.

## Mise à jour 1.3

Retours d'une partie en direct à deux : la cuisine seule, des tâches plus variées, des assiettes
qu'on réunit, un fil rouge, une file de clients et une couleur par plat.

### La cuisine seule

La salle du self a disparu de l'instance : la partie se joue dans la cuisine (10 × 6 tuiles,
`MESS_LAYOUT`). Le long du mur du fond, à l'ouest le frigo, la plonge et deux poêles, à l'est deux
marmites, le garde-manger et une place de comptoir ; au milieu, l'îlot, avec ses deux plans de
travail, ses deux piles d'assiettes et ses places de comptoir, qu'on atteint des deux côtés ; au
nord, le comptoir de service d'un mur à l'autre, avec ses deux passes, la machine à café (à l'ouest)
et le four de comptoir (à l'est). Derrière lui, l'allée où les clients font la queue. Une poubelle
dans chaque coin (plus de bac au milieu de la cloison, dont le repère chevauchait celui du comptoir).

La vue est plus serrée (`KITCHEN_SPAN`, 7,6 × 4,9 m) et se tient un peu vers la file des clients, en
suivant le cuisinier sans sortir des murs. Les meubles neufs (sol, îlot, comptoir de service, four,
enseigne au logo) sont dans `src/furniture/mess-rush.ts`.

| Joueurs | Zones | Cloisons |
|---|---|---|
| 1 | toute la cuisine | — |
| 2 | ouest (frigo, plonge, poêles, café) · est (garde-manger, marmites, four) | la cloison du milieu, qui traverse l'îlot |
| 3 | ouest · sud-est · nord-est | idem, et le portillon au bout est de l'îlot |
| 4 | les quatre coins | idem, et les deux portillons : l'îlot sépare le nord du sud |

Chaque zone a son plan de travail et ses assiettes (à quatre, l'îlot est partagé entre le nord et le
sud), sa passe et sa poubelle. Les passe-plats : deux dans la cloison (`passe-plat-nord`,
`passe-plat-sud`) et un au milieu de l'îlot (`passe-plat-ilot`).

### Des tâches variées

Les gestes : rincer (plonge), éplucher, couper, émincer, fouetter (plan de travail). Les cuissons :
cuire et mijoter (marmite), saisir et poêler (poêle), enfourner (four, deux à la fois), infuser
(machine à café). Un ustensile cuit comme ce qu'il contient : ce qui cuit à l'eau ne va pas avec ce
qui mijote (`cookOf`). Les ingrédients du frigo se rincent, s'émincent ou se fouettent, et se
saisissent ou se poêlent ; ceux du garde-manger s'épluchent et se coupent, et cuisent, mijotent ou
passent au four.

Deux recettes de plus, qui mêlent les deux côtés : l'omelette à la mousse de truffe et le riz aux
piments (le riz aux crevettes et le bouillon impérial le faisaient déjà).

Mesuré avec les robots du guidage (part des gestes, plats servis par service, assiettes réunies) :
à deux, 46 / 54 %, 22,6 plats, et chacun prend, prépare, cuit, dresse et livre ; à trois,
43 / 36 / 21 %, 24,6 plats ; à quatre, 32 / 17 / 33 / 17 %, 27,1 plats ; aucun bon expiré.

### Réunir deux assiettes

Une assiette qu'on tient, posée (E) sur une assiette posée, s'y verse : les crevettes saisies d'un
côté, le riz cuit de l'autre, et le plat est complet (`merge`, dans la limite de ce que tient une
assiette). Le guidage le propose : prendre une des deux assiettes entamées (`take-merge`), puis la
verser dans l'autre (`merge`), au besoin par un passe-plat.

### Le fil rouge

Un encadré à droite de l'écran explique à quoi sert ce qu'on fait (`threadOf` dans les règles,
`MessHud.thread`) :

- un ingrédient en main : le bon qu'il sert (à sa couleur) et son chemin, étape par étape, faite,
  en cours ou à faire (frigo › rincer › saisir · poêle › assiette › passe), et ce que le plat
  demande d'autre ;
- une assiette : ce qu'elle porte, ce qui manque, et comment le compléter (ou la réunir) ;
- une assiette vide, un plat qui ne sert à rien : à quoi sert une assiette, la poubelle ;
- les mains vides, devant un poste : à quoi il sert ; sinon, le chemin du bon le plus ancien.

### La file des clients

Un client par bon, derrière le comptoir de service (`src/mess-rush/queue.ts`) : il arrive par l'est,
attend à sa place avec sa bulle (la couleur de son plat, une tasse ou une assiette, la couronne de
l'amiral) et sa patience, qui baisse avec le délai du bon. Servi, il saute de joie et s'en va
content ; son bon expiré, il fait non de la tête et s'en va fâché. La file se lit dans les bons de
l'état du service : rien de plus ne passe par le relais.

### Une couleur par plat

Chaque recette a sa couleur (`color`, toutes différentes) : le bandeau, le liseré et la pastille de
son bon, la bulle de son client, et un anneau sous les assiettes et les tasses qui deviennent ce
plat. Les annonces (nouveau client, plat servi, client fâché) ont aussi leur pastille.

### Le salon

Le terminal du salon ne montre plus la carte des recettes : elle se découvre en cuisine, bon par
bon. Les touches y sont rappelées, avec la fusion des assiettes et le fil rouge.

### À confirmer en jeu (1.3)

- Le cadrage, avec la file en bas de l'écran, sur téléphone surtout.
- Les trajets réels (les robots n'en ont pas) : l'îlot à contourner, les deux passes.
- La lisibilité des couleurs proches (rose et magenta, orange et saumon) ; un daltonien s'aidera du
  nom sur le bon et du fil rouge.

## Mise à jour 2.0

Retours après les essais en direct de la 1.3 : trop de postes, des cuisiniers qui ont la tête dans
les meubles, un fil rouge qui ne sert à rien, deux touches de trop, une coupure de courant vécue
comme une punition, une coopération qui reste à créer, et une interface où l'on peine à comprendre
quoi faire. La règle de la 2.0 : **la difficulté vient de l'enchaînement des tâches et des timings,
jamais de la difficulté à comprendre quoi faire.**

### Ce qu'on retient d'Overcooked

La bande-annonce demandée (YouTube) n'était pas joignable depuis l'environnement de travail :
l'analyse s'appuie sur ce que montrent les bandes-annonces d'Overcooked (« Co-op Chaos », E3 2016)
et sur ce qu'en disent ses auteurs, Ghost Town Games :
[Game Developer, Road to the IGF](https://gamedeveloper.com/design/road-to-the-igf-ghost-town-games-i-overcooked-i-),
[Gamereactor](https://www.gamereactor.eu/every-single-person-has-an-integral-role-in-overcooked/),
[Red Bull, Overcooked 2](https://www.redbull.com/int-en/overcooked-2-ghost-town-games-interview),
[Wikipédia](https://en.wikipedia.org/wiki/Overcooked),
[Game Informer](https://gameinformer.com/games/overcooked/b/playstation4/archive/2016/07/15/the-steaks-are-high-in-new-trailer-and-eggcellent-release-date.aspx).

| Overcooked | Ce qu'on en tire | MESS RUSH 2.0 |
|---|---|---|
| Deux boutons : prendre/poser, et agir (couper, laver, l'extincteur) | Le geste se lit sur le poste, pas sur le clavier | **Une seule touche** (E, Espace, A ou ×) : elle fait ce que permettent le poste et ce qu'on tient (`resolveAction`) |
| Une caisse par ingrédient, son image sur le couvercle | On voit d'un coup d'œil où est quoi | Cinq caisses, l'ingrédient posé dessus en grand ; plus de frigo ni de garde-manger à menu |
| On coupe en restant devant la planche, une jauge avance | Un seul geste actif, lisible | **Couper**, seul geste actif (2,5 s), sur trois planches |
| La marmite cuit seule ; trop longtemps, elle clignote puis prend feu | Une tension qu'on gère en jouant, pas un temps mort | La marmite et la poêle cuisent seules ; cuit, un signal d'alerte, puis **brûlé** (9 s marmite, 6 s poêle) : la touche la vide |
| Peu d'assiettes ; servies, elles reviennent sales, il faut les laver | Une seconde boucle qui pèse sur le rythme | 3 à 5 assiettes ; chaque plat servi rend une **assiette sale** au retour 7 s plus tard ; on la lave à la **plonge** (1,5 s chacune) |
| Des bons sans texte : le plat, ses ingrédients, ses gestes, une barre de temps | Comprendre sans lire | Les bons en **images** (le Food Kit de Kenney), le nombre, les icônes des gestes, la barre de délai, la couleur du plat |
| Le pourboire selon la rapidité, les étoiles | Récompenser l'enchaînement | Bonus de rapidité, combo, médailles (inchangés) |
| Des cuisines coupées en deux, un passe-plat au milieu : chacun est indispensable | Créer de la vraie coopération | Des **cuisines en colonnes** : à plusieurs, chacun tient un maillon de la chaîne (prendre et couper, cuire et dresser, servir et laver) et l'on se passe les plats |
| Des surprises qui se règlent (le feu, les rats d'Overcooked 2, le décor qui bouge) | Du chaos qu'on peut combattre, jamais une punition gratuite | Des **imprévus jouables** : chacun a sa parade (cf. plus bas) |
| Lisibilité absolue : gros objets, peu de postes | La difficulté vient du rythme | Moins de postes, des meubles bas, une flèche et une consigne courte |

Pas repris pour l'instant : lancer les ingrédients (Overcooked 2), le sprint, l'extincteur, les
cuisines qui bougent. Ce sont des pistes pour une prochaine version.

### Une seule touche

`resolveAction(state, pid, station)` renvoie l'action de la touche, ou null. Les mains vides :
prendre à une caisse, prendre une assiette, couper ce qui attend sur une planche, laver à la plonge,
reprendre ce qui est posé, vider une marmite brûlée, nettoyer la passe, chasser le chat. Les mains
pleines : poser (planche, comptoir), mettre à cuire, dresser (depuis un ustensile cuit ou un
ingrédient prêt), réunir deux assiettes, livrer, jeter, déposer la vaisselle sale. Le client montre
l'action dans l'invite ; le relais arbitre avec la même fonction. `useStation` fait tout ;
`workStation` n'en est plus qu'un alias (le relais accepte encore `mess:work`). Quand plusieurs postes
sont à portée, celui où la touche ferait quelque chose l'emporte sur celui où elle ne ferait rien.

### Moins de postes, plus lisibles

Trois procédés au lieu de dix : **couper** (planche), **cuire** (marmite, qui prend jusqu'à trois
ingrédients, 8 s et 1,5 s par ingrédient de plus) et **saisir** (poêle, une portion, 4 s). Cinq
ingrédients (lapin, légumes, crevettes, riz, pommes), six recettes :

| Recette | Contenu | Couleur |
|---|---|---|
| Pommes d'eden en quartiers | pomme coupée | rouge |
| Crevettes stellaires saisies | crevettes coupées, saisies | rose |
| Bouillon de légumes du bord | trois légumes coupés, cuits ensemble | vert |
| Ragoût de lapin de Ceti | lapin et deux légumes, cuits ensemble | orange |
| Riz jarouan aux crevettes | riz cuit + crevettes saisies | violet |
| Festin du bord (pas en solo) | riz cuit + crevettes saisies + pomme coupée | cyan |

Disparus : le frigo et le garde-manger à menu, la machine à café, le four, rincer, éplucher,
émincer, fouetter, mijoter, poêler, et les tasses.

### Le plan en colonnes, à l'échelle

La cuisine (10 × 6 tuiles) se lit de gauche à droite comme une chaîne : à l'ouest, les caisses et
les planches ; au milieu, les fourneaux (deux marmites, deux poêles) au fond et la pile d'assiettes
au nord ; à l'est, la passe et le retour de vaisselle au comptoir de service, la plonge au fond.

| Joueurs | Zones | Ce que fait chacun |
|---|---|---|
| 1 | toute la cuisine | tout |
| 2 | ouest · est (cloison ouest) | le commis prend et coupe le lapin, les légumes, les crevettes ; le chef a le riz, les pommes, cuit, dresse, sert et lave |
| 3 | ouest · milieu · est | prendre et couper · cuire et dresser · servir, laver, couper les pommes |
| 4 | ouest-nord · milieu · est · ouest-sud | l'ouest coupé en deux (chacun ses caisses et sa planche) |

Les cloisons courent du nord au sud, dans l'axe de la caméra : elles ne cachent personne. Deux
passe-plats par cloison, un dans la cloison de l'ouest à quatre.

L'échelle : les cuisiniers mesurent 0,67 m ; les meubles sont bas (dessus à 0,34 m, `COUNTER_TOP`),
sans hotte, crédence ni étagère, comme dans Overcooked : plus personne n'a la tête dans un meuble.
La caméra est plus plongeante (62°). Les meubles sont dans `src/furniture/mess-rush.ts`
(`rush-floor`, `rush-counter`, `rush-crate`, `rush-stove`, `rush-sink`).

### Des imprévus jouables

La coupure de courant (on ne pouvait rien y faire) et la plonge bouchée sont retirées. Chaque
imprévu a désormais sa parade, et le guidage la montre en premier :

- **plateau renversé** sur la passe : plus de livraison tant qu'on ne l'a pas nettoyée (la touche,
  les mains vides, 2,5 s) ;
- **Comète, le chat du bord**, saute sur un comptoir ou une planche : au bout de 7 s, il mange
  l'ingrédient qui s'y trouve, sauf si on le chasse (la touche) ; tant qu'il est là, le poste est
  bloqué ;
- **surchauffe** des fourneaux (15 s) : tout cuit, et brûle, 1,7 fois plus vite : il faut surveiller
  ses feux ;
- **coup de feu** : deux bons d'un coup ;
- **l'amiral à bord** : un bon doré, plus pressé, qui rapporte double.

### L'interface

- Le fil rouge est supprimé. À la place : une **flèche** au-dessus du prochain poste utile et une
  **consigne courte** en bas (« Coupez : Crevettes », « À la plonge ! », « Comète est sur le plan :
  chassez-le ! »).
- Les **bons** en images : l'ingrédient (aperçu du Food Kit, `public/assets/mess-rush/food/`), le
  nombre, les icônes de ses gestes (couteau, marmite, flamme), la barre de délai, la couleur du plat.
- Sur les postes : la jauge de coupe, de cuisson et de lavage ; l'alerte rouge avant que ça brûle,
  la fumée quand c'est brûlé ; la pile d'assiettes et la vaisselle sale comptées ; le chat sur son
  poste, dont l'icône clignote ; la flaque sur la passe.
- L'invite dit ce que fera la touche ; rien à faire : le nom du poste et ce qui manque (« il faut
  une assiette », « ça cuit… »).

### L'équilibrage

Mesuré avec les robots du guidage (sans trajets, une touche par seconde, imprévus compris, moyenne
sur plusieurs graines) :

| Joueurs | Plats servis | Score | Part des gestes |
|---|---|---|---|
| 1 | 14,3 | 1 091 | — |
| 2 | 18,8 | 1 696 | 48 / 52 % |
| 3 | 17,8 | 1 514 | 45 / 28 / 27 % |
| 4 | 23,2 | 2 073 | 18 / 25 / 29 / 27 % |

Presque aucun bon n'expire. Les médailles sont réglées à environ 30, 50 et 70 % de ces scores
(`RULES.medals`). `server/mess-rush-kitchens.test.js` vérifie que les robots servent au moins 12
plats à tous les effectifs et décrochent le bronze ; `server/mess-rush-events.test.js`, que personne
ne reste les bras croisés ; `server/mess-rush-plates.test.js`, la vaisselle et les assiettes réunies.

### À confirmer en jeu (2.0)

- Les vrais trajets : les robots n'en ont pas ; la colonne du milieu, à trois, attend-elle trop ?
- Le temps avant de brûler (9 s, 6 s) et la vitesse de la vaisselle, avec la latence réelle.
- La place de Comète : sur une planche où l'on coupe, il agace peut-être plus qu'il n'amuse.
