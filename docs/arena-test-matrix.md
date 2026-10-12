# CMDR Arena — matrice des essais

Ce qu'il faut essayer avant de livrer un changement de l'arène, et comment. Les règles (dégâts,
soins, pièges, portée, manches, statistiques) sont vérifiées par les essais automatiques du relais
(`npm test`) ; ce qui se voit, s'entend et se manie se vérifie dans le navigateur, avec la souris, au
doigt et à la manette, dans chacune des trois vues. Cf. le README, « L'arène » et « L'équilibrage ».

## Les outils

| Outil | Pour quoi |
|---|---|
| `npm test` | les essais automatiques (relais, règles partagées, statistiques, palette) |
| `npm run dev`, puis `http://localhost:5173/?cmdr=Testeur` | un joueur connecté sous ce nom (serveur de dev) ; un second onglet, un second joueur |
| `?lag=300` (serveur de dev) | une latence simulée de 300 ms aller-retour (`src/net.ts`) ; l'ordre des messages est gardé |
| `window.__game` (dev) | la partie en cours (`arena`), le réseau (`net`), le joueur (`player`) ; `__game.net.sendArena('debug', { freeze: true })` fige les bots, `{ score: [14, 0] }` règle le score, `{ rounds: [1, 0] }` les manches |
| `/gallery.html?arena` | les six personnages arme en main ; `&act=lob` (recoil, toss, heal, reload), `&at=0.15`, `&hurt`, `&ko`, `&only=jacques` |
| Outils de développement du navigateur, mode appareil | un écran tactile, en paysage (667 × 375, 740 × 360, 844 × 390) |
| Une manette (XInput) | la manette ; le terminal la suit dès qu'on la touche |
| `node scripts/arena-balance.mjs simulate 600` | des parties de bots seulement, pour l'équilibrage ; `report` lit les statistiques des vraies parties |

## La matrice

Légende : **A** essai automatique (nommé) ; **M** à essayer à la main (les étapes sont dessous) ;
**—** sans objet. Les vues : de dessus (D), dans les yeux (`V`, Y), par-dessus l'épaule (`C`, É).

| Ce qu'on essaie | Souris D | Souris Y | Souris É | Doigt D | Doigt Y | Manette D | Manette Y |
|---|---|---|---|---|---|---|---|
| 1. Viser et tirer : le cône est le tir | A + M | M | M | A + M | M | M | M |
| 2. Lancer (Capucine, Jacques) : la cloche, le point de chute | A + M | M | M | A + M | M | M | M |
| 3. Tir rapide au doigt (toucher le stick) | — | — | — | A + M | M | — | — |
| 4. Soigner (Betty) : seringue, lien, « PV max » | A + M | M | M | M | M | M | M |
| 5. Pièges : fleur qui s'arme et mord, flaque, minuteurs | A + M | M | — | M | M | M | — |
| 6. Être touché : réaction, arc de direction, sons | M | M | M | M | M | M | M |
| 7. Élimination et réapparition : chute, fantôme, bulle | A + M | M | M | M | M | M | M |
| 8. Annonces : départ, élimination, série, balle de match, verdict | M | M | — | M | — | M | — |
| 9. Terminal : choix du personnage, fiche, comparaison, démonstration | M | — | — | M | — | M | — |
| 10. Fin de partie : récapitulatif, personnage suivant | M | — | — | M | — | M | — |
| 11. Effets réduits | M | M | — | M | M | — | — |
| 12. Spectateur | A + M | M | — | M | — | M | — |
| 13. Latence élevée (`?lag=300`) | M | M | — | M | — | — | — |
| 14. Reconnexion | A + M | — | — | M | — | — | — |
| 15. Statistiques et équilibrage | A | — | — | A | — | A | — |

## Ce qu'on vérifie, ligne par ligne

1. **Viser et tirer.** *A* : « le cône de visée prévoit le tir du relais… » (`server/arena.test.js`),
   « une balle s'arrête sur un conteneur… », « une balle s'éteint au bout de la portée… ». *M* : à la
   souris, le cône part de la main vers le curseur, s'arrête sur un conteneur comme la balle ; la
   traînée est à la couleur du joueur (jaune), celles d'en face en rouge-orangé ; au doigt, le stick
   rouge vise là où il pointe à l'écran, le coup part au lâcher, dans la direction visée même en
   courant ; à la manette, le stick droit vise, la gâchette tire, X recharge.
2. **Lancer.** *A* : « la graine de Capucine passe par-dessus un conteneur… », « le cocktail de
   Jacques éclate… ». *M* : la cloche en pointillés et la croix tombent là où l'objet retombe ; le
   disque est grisé dans la base adverse ; au doigt, plus le stick est poussé, plus loin on lance ;
   l'objet quitte la main au milieu du geste ; un objet d'en face siffle en retombant.
3. **Tir rapide.** *A* : « au doigt, le tir rapide vise moins bien qu'un très bon joueur, mieux
   qu'un débutant » (`server/arena-assist.test.js`). *M* : un toucher vise l'adversaire visible le plus
   proche ; il le manque parfois de loin (l'écart voulu), jamais de près.
4. **Soigner.** *A* : « Betty soigne les siens… ». *M* : le cône vire au vert d'eau sur un coéquipier
   blessé ; « PV max » sur celui qui n'en a pas besoin (la seringue le traverse) ; au soin, le bras de
   Betty se tend, un trait relie Betty au soigné, des croix montent, le soigné entend trois notes.
5. **Pièges.** *A* : « la fleur de Capucine s'arme avant de mordre… », « …sa flaque brûle… ». *M* :
   la fleur jaillit, se tourne vers sa proie (pas vers qui se cache dans un buisson), rougeoie,
   mord ; l'arc du minuteur se rétracte et clignote dans la dernière seconde ; la flaque crépite ; en
   vue subjective, un obstacle cache le cercle d'un piège.
6. **Être touché.** *M* : le chiffre rouge, le bord de l'écran qui rougit, l'arc rouge tourné vers
   le tireur (qui suit quand on se tourne), le sursaut du personnage ; un son par coup reçu.
7. **Élimination et réapparition.** *A* : « pas de tir avant le coup d'envoi ; ensuite, les balles
   blessent, puis éliminent » (le relais remet aussitôt à la base). *M* : la chute dure moins d'une
   seconde, ne bloque ni les balles ni les pas ; le fantôme à la base, le compte à rebours ; au retour,
   le faisceau, l'onde, la bulle qui crève au premier tir ou au bout de deux secondes ; en effets
   réduits, le corps s'efface sans tomber.
8. **Annonces.** *M* (avec `{ score: [14, 0] }` et `{ rounds: [1, 0] }`) : « Manche 1 · 15 points »
   au décompte, « Baston ! » au départ ; « X éliminé », puis « Doublé ! », « Triplé ! » en or, de
   plus en plus haut ; « Balle de manche ! » à 14, « Balle de match ! » quand la manche donnerait la
   partie (« pour eux », en rouge, pour l'équipe d'en face) ; « Manche décisive » ; le verdict et son
   accord.
9. **Terminal.** *M* : six visages ; le personnage choisi ressort ; flèches, `1` à `6`, Échap ; à la
   manette : stick, A, B, LB, RB, Y, X ; « Fiche détaillée », « Comparer », « Choisir » ; la fiche
   dépliée et le personnage choisi se retrouvent à la prochaine ouverture ; au doigt, en paysage
   (667 × 375), tout tient sur la largeur, les cibles font 44 px ; la démonstration tourne, et
   s'arrête (image fixe) si le système demande moins d'animations.
10. **Fin de partie.** *M* : la fiche de chacun et sa part de l'équipe ; « Récapitulatif » :
    éliminations, chutes, dégâts, soins, précision, série, part ; « Partie suivante » : le personnage
    choisi est celui du lobby au retour (le terminal le montre).
11. **Effets réduits.** *M* : au terminal, « Effets visuels » ; en « Réduits », ni fumée, ni braises,
    ni bulle, ni secousse ; restent les anneaux, contours, plaques, cônes, traînées, pièges et chiffres.
12. **Spectateur.** *A* : « un spectateur reçoit la partie en cours sans y être… ». *M* : les camps
    à leurs couleurs du lobby, `←` `→` pour suivre un autre combattant, les annonces au nom des
    équipes, ni récapitulatif à remplir ni personnage suivant.
13. **Latence élevée.** *M* (`?lag=300`, deux onglets) : le tir part aussitôt chez le tireur ; les
    dégâts, soins, chutes, pièges arrivent avec le retard, jamais en double ; aucun geste ni effet ne
    décide d'un dégât (le relais seul) ; le décompte et les annonces restent en ordre.
14. **Reconnexion.** *A* : « qui part est remplacé par un bot ; sans bots, une équipe vide perd par
    forfait » (`server/arena.test.js`), « un salon se forme au lobby, la partie part, et l'arène reste
    entre ses joueurs » (`server/arena-relay.test.js`). *M* : couper le réseau en partie (mode avion,
    ou arrêter le serveur de dev) : au retour, on est à bord, la partie a continué avec un bot ; le
    personnage choisi est gardé (`localStorage`).
15. **Statistiques et équilibrage.** *A* : `server/arena-stats.test.js` (ce qu'elles comptent, par
    commande, tir rapide compris, et leur fichier), `server/arena-roles.test.js` (les fiches disent
    vrai, nul n'est meilleur qu'un autre partout). *M* : `node scripts/arena-balance.mjs report` après
    quelques parties sur le serveur de dev (`var/arena-stats-dev.json`) ; le classement complet (`E`)
    les montre sous les joueurs.
