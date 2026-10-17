# Audit de la v1.0 : optimisation et débogage

Audit complet du jeu avant le gel de la v1.0 (octobre 2026) : ce qui coûte, ce qui casse, ce qui a
été corrigé, et ce qui reste. Les corrections sont sur la branche `claude/amazing-goodall-bya80h`.

## Méthode

- **Sept audits du code**, chacun vérifié sur le chemin réel du code avant d'être retenu :
  - la boucle d'image (CPU) ;
  - le rendu (GPU) ;
  - la mémoire (fuites) ;
  - le relais multijoueur ;
  - les assets, le bundle et le chargement ;
  - les bugs du cœur du client ;
  - les bugs des activités.
- **Le relais** a été éprouvé par des scripts de reproduction contre un relais lancé en mémoire
  (paquets malformés, rafales, joueurs simultanés, triche de vitesse).
- **Le jeu** a été mesuré dans Chromium piloté par Playwright :
  - profil CPU du fil principal ;
  - appels de dessin, programmes de shader, recherches de shader forcées à chaque image ;
  - mémoire, erreurs de la console.
  - Le rendu y est logiciel (SwiftShader) : les temps sont **relatifs**. Ils servent à comparer
    avant et après, pas à prédire les i/s d'une vraie carte graphique.
- **Hors de portée ici** :
  - le site (`elitedangereuse.fr`, et son Docker en local) ne répond pas dans le conteneur : ses
    chemins ont été vérifiés à la lecture du code ;
  - les en-têtes de production n'ont pas pu être relevés ;
  - aucun téléphone ni vrai GPU.

## Ce que coûte le jeu (avant corrections)

Mesuré au démarrage, en 1280 × 720, sur chacun des trois ponts communs :

| | Pont principal (0) | Pont supérieur (1) | Cale (-1) |
|---|---|---|---|
| Triangles | 364 k | 446 k | 268 k |
| Programmes de shader (tout le jeu) | 143 | 143 | 145 |
| Lumières ponctuelles évaluées par pixel | 11 | 11 | 11 |

- **Démarrage** : 162 requêtes, 14,2 Mo transférés sans compression (3,6 Mo en gzip). Le JS pèse
  3,7 Mo minifié (1,3 Mo en gzip). Le tas JS fait de 180 à 250 Mo une fois le jeu lancé.
- **Hors du rendu** : en temps de calcul, la boucle d'image est saine. Elle a déjà une résolution
  adaptative, des pièces masquées hors du champ, de la géométrie fusionnée, des atlas et un
  budget pour les écrans animés. Les gains restants sont des centaines de microsecondes par image,
  pas des millisecondes.

## Avant et après

Même machine, même navigateur, la version d'origine et la version corrigée servies côte à côte,
après un tour de chauffe des ponts (le rendu logiciel compile les shaders à leur première
utilisation, ce qui fausserait la première visite) :

| | Avant | Après |
|---|---|---|
| Démarrage jusqu'au HUD | 35,7 s | 22,4 à 24,0 s |
| Appels de dessin, pont principal | 485 | 464 |
| Appels de dessin, pont supérieur | 212 | 208 |
| Appels de dessin, cale | 390 | 369 |
| Shaders recherchés de force à chaque image (principal, supérieur, cale) | 24, 22, 46 | 4, 4, 2 |
| Pochettes du jukebox | 10,9 Mo | 108 ko |
| Musiques décodées gardées en mémoire, après toutes les activités | ≈ 400 Mio | celles qui jouent + 2 |
| Géométries ajoutées par 4 essayages au Holo-Me | +28 | 0 |
| Relais : paquet `{ toString: 0 }` | arrêt du serveur | ignoré |

- **Démarrage.** C'est le rendu logiciel du conteneur, donc lent en valeur absolue. Le gain vient
  de la recoloration et des personnages téléchargés d'un coup.
- **Temps du script par image.** Hors attente du GPU, il reste entre 14 et 21 ms sur ce
  processeur lent. Les gains par image (mobilier caché, rayons, portes, mini-carte, survol) sont
  de quelques centaines de microsecondes : ils se mesurent au chronomètre, méthode par méthode,
  mais restent dans le bruit d'une image entière.
- **GPU.** Les gains du côté GPU (lumières éteintes sautées, une passe au lieu de deux, ombres une
  image sur deux sur téléphone, brouillard sans anticrénelage) ne se lisent pas sur le rendu
  logiciel : ils sont à constater sur une vraie carte graphique et sur téléphone.

## Corrigé

### Relais multijoueur

- **Un paquet suffisait à arrêter le relais de production (critique).** Un objet envoyé à la place
  d'un texte (`{ toString: 0 }` comme nom, message, profil ou morceau du jukebox) faisait lever
  `String()` hors des garde-fous de socket.io, puis `server/index.js` s'arrêtait. Toutes les
  parties et tous les tickets de reprise étaient perdus, et c'était à refaire après chaque
  redémarrage.
  - Les textes n'acceptent plus que des chaînes.
  - Chaque évènement d'un joueur passe par un garde-fou : l'erreur est consignée, le joueur fautif
    est débarqué (son client revient 15 s plus tard), le vaisseau continue.
  - Les tics de la zone, de l'arène, de MESS RUSH et des duels, l'embarquement et le départ sont
    protégés de même.
- **Zone thargoïde injouable une fois sur trois.** Le relais ramenait les positions à z = 30 alors
  que la baie compte 34 rangées : un colis posé au fond ne se ramassait jamais, et la mission ne
  pouvait pas se gagner.
- **Rafales.** Rien ne bornait les positions, les emotes, les profils (diffusés à tout le bord) ni
  les entrées dans des quartiers. Un seul client à 2 200 messages par seconde faisait relayer
  68 000 messages par seconde.
  - Chacun a désormais son débit, plus un plafond global de 300 messages par seconde.
  - Un changement d'apparence au-delà du débit attend au lieu de se perdre.
- **Places à bord.** 80 poignées de main simultanées faisaient embarquer 80 joueurs (le maximum est
  32).
- **Récompenses.**
  - La zone payait les membres partis ou déconnectés.
  - Un abandon en moins de 60 s (un invité placé dans l'autre camp) donnait une victoire classée
    à l'arène. Le résultat envoyé au site dit maintenant sa durée et sa raison.
- **Zone thargoïde : sorties.**
  - Qui quittait une mission y restait attaché jusqu'à sa fin (30 min) : impossible d'en rejoindre
    une autre, et il recevait toujours le chat de l'équipe.
  - Un membre resté « en route » n'était jamais lâché.
- **Ruelle Fighter II à deux.** Le duel ne marchait jamais dans les quartiers : le relais les
  attendait au niveau 1, ils sont au 2.
- **Cinéma.** N'importe quel spectateur pouvait arrêter la séance de tous, et les recherches
  YouTube n'avaient pas de plafond global (30 par heure désormais).
- **Jukebox.** Un visiteur pouvait changer de loin la musique de quartiers ouverts.
- **Liaison morte.** Elle se voit en 20 s au lieu de 45 : la reprise d'une mission après un
  changement de réseau trouvait encore l'ancienne liaison.
- **Serveur autonome** (`npm start` avec `dist/`) :
  - les SVG, MP3, JSON et WebP partaient en `application/octet-stream` (logos et pochettes
    invisibles) ;
  - pas de plages d'octets pour l'audio, pas de 304, pas de gzip ;
  - un téléchargement interrompu perdait un descripteur de fichier, et une erreur de lecture
    arrêtait le serveur.
- **Tests.** 14 nouveaux, qui échouent sur l'ancien code. Il y a désormais 504 tests (502 réussis,
  2 ignorés, aucun échec).

### Données des joueurs

- **Quartiers écrasés (critique).** Si le site répondait mal au chargement des quartiers (délai
  dépassé, erreur 500, erreur dite dans la réponse), le jeu montrait les quartiers d'origine et les
  enregistrait dans le navigateur, datés du jour. À la visite suivante, cette copie « plus
  récente » partait au site par-dessus les vrais quartiers, et le jardin pouvait suivre.
  - Sans réponse du site, plus rien ne s'enregistre.
  - L'aménagement attend sa réponse, redemandée de plus en plus rarement.
  - Une erreur dite par le site n'est plus lue comme « jamais aménagé ».
  - Fichiers : `src/cabin/storage.ts`, `connectStore`, `canDecorate` et `saveHome` dans `src/main.ts`.
- **Réponse du site pendant le démarrage.** Une réponse arrivée pendant le montage des ponts
  touchait des variables pas encore créées. Elle attend désormais la fin du démarrage.
- **Achat d'un booster après un délai dépassé.** L'achat a pu passer au site sans que le jeu le
  sache : il affichait encore l'ancien prix, et le clic suivant payait le booster suivant, plus
  cher. Le stock et le solde sont relus avant qu'on puisse recliquer.
- **Crédits des bornes d'arcade.** Ils étaient perdus si l'on quittait la borne ou relançait une
  partie avant la réponse du site.
- **Pêche.** Échap pendant le moulinet perdait la prise, y compris un poisson de quête.

### Robustesse

- **Boucle d'image.** Une seule exception, n'importe où dans une image, arrêtait le jeu pour de
  bon. L'image suivante est désormais demandée en premier.
- **Démarrage.**
  - Un modèle qui ne se télécharge pas est retenté deux fois.
  - Un échec se dit sur l'écran de chargement au lieu d'une jauge immobile.
- **Safari 15 / iOS 15.** `AbortSignal.timeout` y manquait : chaque demande au site échouait avant
  de partir. Le joueur était alors toujours invité, et le relais pouvait s'interrompre au milieu
  de l'accueil d'un membre du L.J.P.C. Corrigé par `src/polyfills.ts`.
- **Mode aménagement et construction.** Après une mise en ligne, leur module peut être introuvable.
  Les échecs d'enregistrement en construction étaient muets. Les deux se disent maintenant dans le
  chat.
- **Zone thargoïde.**
  - Un kit qui ne se chargeait pas figeait le joueur dans la mission, et l'échec restait en cache.
    Le joueur revient désormais au vaisseau, et le chargement se retente.
  - La reprise d'une mission après un changement de réseau abandonnait au premier
    « déjà en jeu ». Elle insiste maintenant.
- **CMDR Arena.** Partir pendant le fondu d'entrée laissait le joueur seul dans l'arène, costumé,
  sans interface ni sortie.
- **Saut FSD.** Un système inconnu (relais plus récent que la page) bloquait le réacteur jusqu'au
  rechargement.
- **Tables de jeux de plateau des quartiers.** Elles proposaient « Jouer » et finissaient sur
  « table indisponible » : seules celles du salon sont tenues par le relais. Elles sont désormais
  décoratives.

### Contrôles

- Une touche tenue en entrant dans un champ du combiné ou du chat Twitch faisait marcher le
  personnage pendant qu'on écrivait.
- Derrière un jeu de plateau ouvert, les touches (emotes, photo, vues…) agissaient toujours. Le
  chat était impossible devant les caméras ou en salle de sport.
- La molette zoomait la vue derrière les panneaux qu'elle faisait défiler.
- En vue subjective, la mire n'était pas reprise après le basket, la pêche ou l'interro.
- Un Alt-Tab pendant un glisser du clic droit laissait la caméra tourner au moindre mouvement.
- Un glissement vers un terrain se poursuivait sur un autre pont.
- La minimap montrait un faux téléporteur sur le simulateur et la base au sol.
- Dans l'instant figé du mode photo, la vitesse valait NaN et figeait l'animation de marche.

### Rendu (GPU)

- **Lumières éteintes.** Three.js calcule ses 11 lumières ponctuelles pour chaque pixel éclairé,
  même éteintes (la réserve qui attend une lampe, les lanternes des conduits et de la zone). Elles
  sont désormais sautées dans le shader, sans changer l'image. Voir `skipDarkLights` dans
  `src/lighting/rig.ts`.
- **Double passe des transparents.** Les matières transparentes à deux faces étaient dessinées
  deux fois par image, avec une recherche de shader à chaque passe : 11 à 23 objets par image
  (vitres, affiches, silhouettes des portes, cônes des projecteurs), plus les traînées des balles.
  Sur un panneau plat, ou pour une lumière additive qui n'écrit pas la profondeur, une seule passe
  donne la même image.
- **Caustic Sour.** La lumière de ce cocktail changeait le nombre de lumières de la scène : tous
  les shaders éclairés se recompilaient (un à-coup), puis encore à chaque pièce découverte. Elle
  prend maintenant une lumière de la réserve.
- **Mode léger.** Il coupait la carte d'ombre sans couper l'ombre du soleil : les matières
  gardaient la dernière carte, figée, et son coût. Choisi au chargement, il privait ensuite le
  jeu d'ombres une fois quitté.
- **Téléphone.** La carte d'ombre n'est redessinée qu'une image sur deux. Les ombres fixes restent
  justes ; celles des personnages suivent à 30 i/s.
- **Densité de pixels.** Elle restait celle du chargement : flou en passant sur un écran plus fin,
  ou trop de pixels.
- **Brouillard de la zone thargoïde.** Plus d'anticrénelage sur les écrans denses, comme pour
  l'image du jeu.
- **Vignettes du catalogue.** Leur contexte WebGL est gardé : il recompilait ses shaders à chaque
  visite.

### Temps de calcul par image (CPU)

- **Mobilier animé caché.** Les animations des meubles d'une pièce hors du champ ne tournent plus.
  Cela concerne aussi le Zorb fermé et les pièces à débloquer. Sur la cale, 15 meubles sur 112
  restent animés en vue subjective. Le meuble se remet à l'heure avant d'être redessiné, et les
  meubles interactifs tournent toujours, de même que l'écran du cinéma (qui règle l'horloge du
  film).
- **Rayons de visibilité.** En vue subjective, jusqu'à 1 880 rayons étaient lancés à chaque image,
  même à l'arrêt. Ils ne repartent plus que si les yeux, les portes ouvertes ou les murs percés
  changent. Le résultat est vérifié identique à un recalcul forcé. Mesuré : `cull` passe de
  101 à 20 µs sur le pont principal, de 70 à 3 µs sur le pont supérieur.
- **Portes.**
  - Leurs verrous ne se relisent plus qu'au changement du plan : `ShipMap.version`, un nouveau
    compteur.
  - Sur les ponts cachés, les battants attendent et rattrapent leur retard à l'affichage.
- **Mini-carte.** En vue subjective, son plan était redessiné chaque seconde : environ 1 ms et un
  renvoi du canevas, un à-coup que la résolution adaptative ne voyait pas. Il ne l'est plus qu'au
  changement du plan, de la pièce ou de la densité.
- **Mise à jour d'un pont en vue subjective.** De 303 à 148 µs sur le pont principal, de 372 à
  139 µs sur la cale.
- Le survol n'est plus calculé quand la souris est capturée (vue subjective). La mire ne lance
  plus qu'un rayon tous les dixièmes de seconde.
- Un `querySelector` sur toute la page à chaque image a été retiré, ainsi que des écritures
  inutiles dans la page (lecteur du cinéma, curseur de la manette).
- Les étincelles du Stellar Kick partagent leurs deux matières : il s'en créait une toutes les
  75 ms.

### Mémoire (fuites)

- **La fuite principale.** Un personnage retiré de la scène n'était jamais libéré, et three.js
  garde pour toujours une géométrie déjà dessinée. Les cas :
  - les joueurs qui partent ou changent d'apparence (une reconnexion les recréait tous) ;
  - son propre personnage, à chaque essayage du Holo-Me ;
  - les doublures et drones de l'arène et du podium : environ 13 personnages par partie, de 2 à
    6 Mo ;
  - les clients de MESS RUSH (un par commande) ;
  - le technicien et les Thargoïdes de la zone.

  Le registre `src/dispose.ts` (`keepShared`, `disposeOwned`) et `Avatar.dispose` libèrent ce qui
  est propre à chacun et gardent ce qui est partagé. Mesuré : 4 essayages ajoutaient 28
  géométries ; après correction, plus aucune.
- **Musiques de fond.** Un morceau décodé pèse de 11 à 64 Mio et restait en mémoire pour toujours,
  soit environ 400 Mio après toutes les activités. On ne garde plus que ceux qui jouent et les deux
  derniers écoutés.
- **Autres caches et ressources bornés ou libérés :**
  - les œuvres du site (48 au plus) ;
  - les voix des sons de la zone thargoïde et des caméras ;
  - la géométrie de l'extincteur de MESS RUSH ;
  - les contours de l'arène (une géométrie par modèle, non plus par combattant) ;
  - la mémoire graphique des arènes, rendue comme celle des ponts.

### Chargement

- **Recoloration au démarrage.** Le cache reconnaît désormais une palette à ses pixels (chaque
  modèle GLB en a sa copie), et les conversions se font une fois par couleur. Même résultat au
  pixel près. Le calcul passe d'environ 4 s à 0,5 s sur le rendu logiciel du conteneur.
- **Pochettes du jukebox.** Les cinq PNG de 1024 à 1254 px (10,9 Mo, tous chargés à l'ouverture de
  la liste, affichés à 112 px au plus) deviennent des WebP 256 × 256 (108 ko), via
  `scripts/import-jukebox-covers.py`.
- **Personnages.** Les douze Mini Characters partent avec les autres modèles : l'équipage et les
  dîneurs les attendaient en quatre vagues, pendant le montage des ponts.
- **Sons partagés.** Un fichier commun à deux sons n'est plus téléchargé ni décodé deux fois.

### Développement

- **Serveur de dev.** Vite surveillait `assets/` (90 000 fichiers) et s'arrêtait dès que la limite
  du système était atteinte (ENOSPC). Il surveille désormais 977 fichiers.

## Reste à faire

Classé par intérêt pour la v1.0. Rien de bloquant n'y reste.

### À vérifier en production (hors de ce dépôt)

- **Compression sur le serveur du site.** C'est le plus gros gain de chargement qui reste, et il
  ne demande qu'un réglage. Le démarrage passe de 14,2 Mo à 3,6 Mo en gzip, 3,1 Mo en brotli. Les
  GLB se compressent 5 à 6 fois (pas de tampons d'index, gros JSON), mais nginx et Apache laissent
  souvent `model/gltf-binary` hors de leurs types compressés. À vérifier :
  `curl -sI -H 'Accept-Encoding: gzip, br' https://elitedangereuse.fr/<chemin du jeu>/assets/kenney-furniture.glb`.
  Compresser aussi `.json`, `.svg`, `.js`, `.css` et `.html`.
- **Cache.** Les fichiers de `dist/assets/` dont le nom porte une empreinte (`index-Cq3357ZK.js`)
  peuvent être servis `immutable, max-age=31536000`. `index.html` doit rester en `no-cache`.

### Relais

- **Triche de vitesse.** La zone thargoïde (qui paie des crédits) et l'arène acceptent, à chaque
  message, la distance permise plus une marge. Une rafale de messages cumule ces marges : 32 tuiles
  en 64 ms acceptées, et des sauts à travers les murs. MESS RUSH a déjà la bonne parade : une
  réserve de foulée et un contrôle en ligne droite. À reprendre pour les deux autres.
- **Positions.** Chaque position est encodée une fois par destinataire, jamais en `volatile`, et
  envoyée même à ceux qui sont seuls dans leurs quartiers. Mesuré : 32 joueurs à 10 Hz font
  9 920 envois par seconde et 13,5 % d'un cœur. Des salles socket.io par pont et par instance la
  feraient encoder une seule fois.
- **Quota YouTube.** Le plafond de 30 recherches par heure ne protège pas un quota quotidien
  (100 recherches par jour au quota par défaut) : ajouter un plafond journalier si besoin.
- **Arène.** Les spectateurs reçoivent encore l'état à 20 Hz après avoir quitté le lobby. Une
  coupure réseau brève compte comme un abandon (pas de délai de grâce).
- **Déploiement.** Le relais s'arrête sur une vraie erreur : l'unité systemd doit avoir
  `Restart=always`. Le serveur de dev accepte n'importe quel `?cmdr=` : il ne doit jamais être
  exposé.

### Client

- **Jeux à score sous 20 i/s.** Le pas d'une image est plafonné à 50 ms : sur une machine très
  lente, le basket, le stand de tir et les bornes tournent au ralenti, et leur score s'en trouve
  gonflé. Il faudrait des sous-pas, ou que le site compare durée de jeu et temps réel.
- **Compte du site arrivé trop tard.** S'il répond après 3 s et que le relais ne reconnaît pas
  non plus le CMDR, toute la session se joue en invité.
- **Première fois aux caméras, dans les conduits ou dans la zone thargoïde.** Ces rendus passent
  par une cible hors écran : chaque matière y compile une seconde variante de son shader. C'est
  un à-coup la première fois, de 0,5 à 4 s estimés sur téléphone. Les précompiler derrière leur
  fondu (`compileAsync` avec la cible liée).
- **Compilation au démarrage.** Elle est synchrone (`renderer.compile`). `compileAsync` libérerait
  l'écran de chargement, mais il faut alors faire attendre les messages du relais qui arrivent
  pendant ce temps.
- **Shaders pas encore prêts à la première visite d'un pont.** Avec la compilation parallèle du
  navigateur, `renderer.compile` lance les 143 compilations sans les attendre. C'est la première
  image qui dessine une matière qui attend son shader. Sur le rendu logiciel, la première visite
  du pont supérieur coûtait plusieurs secondes d'attente. Sur une vraie carte graphique, tout est
  prêt bien avant ; sur un téléphone lent, ce peut être un à-coup. `compileAsync` (ci-dessus)
  attendrait la fin réelle des compilations.
- **Matières des modèles GLB dupliquées.** Base au sol et zone thargoïde : 115 instances de
  matière pour 9 distinctes dans le Space Kit, donc une centaine d'appels de dessin de trop. Elles
  restent aussi en MeshStandard.
- **Kenney `metallicFactor: 1`.** Une vingtaine de matières des kits Outdoor, Nature, Space et
  Blocky sont rendues en métal sans carte d'environnement, donc ternes. Les passer en mat changerait
  leur aspect : à juger à l'œil.
- **Écrans animés.** Leurs mipmaps sont recalculées à chaque envoi (jusqu'à 1300 × 800 à 20 i/s).
  Les couper ferait scintiller le texte de loin : à juger à l'œil.
- **Étoiles.** Leur taille suit `devicePixelRatio` et non la densité du rendu : elles sont 1,3 à
  2,7 fois trop grosses en résolution adaptative et en mode léger.
- **Teintes à travers les caméras, les conduits et la zone.** Quelques shaders maison (halos,
  bouclier, étoiles…) y reçoivent deux fois le mappage tonal, et paraissent plus pâles.
- **Lecteur Twitch.** Il est recréé à chaque changement de chaîne ; `setChannel()` suffirait.
- **Soupçonnés, non reproduits :**
  - l'écran de vol vers la base au sol peut rester bloqué si un modèle ne vient pas ;
  - deux tâches de bord qui se chevauchent peuvent perdre un paiement ;
  - des réponses du site arrivées dans le désordre peuvent montrer un solde périmé ;
  - une déconnexion pendant le premier chargement du kit de la zone.

### Assets et dépôt

- **Musique.** 175 des 195 Mo de `public/assets`. Réencodés à 128 kb/s, les 29 morceaux
  économiseraient 40 Mio de flux, à faire depuis les originaux.
- **`shows/galeres-galactiques.svg`** (436 ko, chargé au démarrage) embarque une police TTF de
  207 ko : en faire une image WebP.
- **Empreinte des modèles.** Il n'y en a qu'une, pour tous les GLB : un modèle changé fait
  retélécharger les 13 Mo. `ships/catalog.json` et `paints.json` n'y entrent pas.
- **45 modèles de la station.** Chacun décode sa propre copie de la même palette de 7 ko : 45
  requêtes, et environ 45 Mo de mémoire sur téléphone.
- **Fichiers inutilisés.** 59 GLB, 586 ko, jamais téléchargés (liste en annexe). Ils ne pèsent
  que sur le déploiement.
- **`assets/`** (les packs Kenney) met 1,3 Go et 91 000 fichiers dans git.
- **Bundle.** Le morceau `furniture` dépasse l'alerte de 900 ko (998 ko) : c'est du vrai contenu
  (77 meubles faits main). Il n'y a ni module en double ni code de debug, et seules les icônes
  utilisées sont incluses. Rien à faire pour la v1.0.

## À essayer en jeu

Ce que les essais automatiques et le navigateur sans GPU ne montrent pas, à faire une fois avant
de passer en `Terminé` :

1. **Quartiers, site lent.** Couper le site, ou faire répondre 500 à
   `mini-shipinteriors-cabin.php`, puis charger le jeu en CMDR :
   - `B` répond « Vos quartiers arrivent du site » ;
   - au retour du site, les vrais quartiers apparaissent d'eux-mêmes (dans les 20 s, puis
     40 s…) ;
   - au rechargement suivant, rien n'a été écrasé.
2. **Ombres.** Basculer le mode léger dans les deux sens, en jeu puis au chargement : les ombres
   disparaissent et reviennent, sans rester figées.
3. **Lumières.** Pont principal, cale, bar, piste de danse, zone thargoïde et conduits doivent
   avoir le même éclairage qu'avant.
4. **Caustic Sour.** Commander le cocktail au bar de Jacques : la lueur verte suit le personnage,
   sans à-coup, et s'éteint au bout de 60 s ou en entrant dans une partie.
5. **Vitres, affiches, reflets, traînées des balles.** Les serres, verrières et vitres de la
   coursive, le stand de tir et l'arène doivent avoir le même aspect qu'avant.
6. **Téléphone.** Les ombres des personnages suivent bien la marche (30 i/s). Rien ne doit
   scintiller en tournant la vue.
7. **Mémoire.** Enchaîner 5 parties de CMDR Arena puis un service de MESS RUSH. Dans la console de
   dev, `__game.renderer.info.memory.geometries` doit revenir à peu près au même niveau.
8. **Personnages.** Changer plusieurs fois d'apparence au Holo-Me, voir un joueur partir et
   revenir, puis une reconnexion : rien ne disparaît ni ne devient noir chez les autres
   personnages.
9. **Arène.** Quitter une partie pendant le fondu d'entrée : on revient au lobby de la cale.
10. **Zone thargoïde.** Changer de réseau en pleine mission (Wi-Fi vers 4G) : la mission reprend.
    Les colis au fond de la baie (au-delà de z = 30) se ramassent. Les battements de cœur et le
    détecteur sonnent comme avant.
11. **Jukebox.** Les pochettes s'affichent nettes dans la liste et dans « À l'écoute ».
12. **Contrôles.**
    - Marcher en ouvrant le combiné et en cliquant dans un champ : le personnage s'arrête.
    - La molette sur le journal fait défiler sans zoomer.
    - En vue subjective, après une partie de basket, un clic reprend la mire.
13. **Safari sur iOS 15**, si un appareil est disponible : le CMDR est reconnu.

## Annexe : modèles jamais chargés

Vérifiés contre les listes de modèles du code (`STATION_MODELS` dans `src/assets.ts`, `MODELS`
dans `src/base/kit.ts`, `MODULAR`, `TRAIN` et `SPACE` dans `src/salvage/kit.ts`) et contre les
chemins construits (vaisseaux, animaux, personnages, musiques, sons). Tous dans `public/assets/`.

- `station/` (52) : balcony-floor-center, balcony-floor-corner, balcony-floor,
  balcony-rail-center, balcony-rail-corner, balcony-rail, bed-double-cover, bed-single-cover,
  chair-armrest, chair-cushion-headrest, chair-headrest, container-flat-open, door-double-closed,
  door-double-half, door-single-closed, door-single-half, floor-corner, floor-panel-corner,
  floor-panel-end, pipe-bend-diagonal, pipe-end, pipe-ring, rail-narrow, rail,
  stairs-corner-inner, stairs-corner, stairs-handrail-single, stairs-handrail, stairs-ramp,
  stairs-small-center, stairs-small-corner-inner, stairs-small-corner,
  stairs-small-edge-handrail, stairs-small-edge, stairs-small-edges-handrail, stairs-small-edges,
  stairs, structure-barrier-high, table-inset-small, wall-banner, wall-corner-banner,
  wall-corner-round-banner, wall-corner-round, wall-door-banner, wall-door-center,
  wall-door-edge-banner, wall-door-wide-banner, wall-door-wide, wall-pillar-banner,
  wall-window-banner, wall-window-frame, wall-window-shutters (`.glb`).
- `space/` (6) : craft_cargoB, craft_racer, craft_speederA, craft_speederB, craft_speederC,
  craft_speederD (`.glb`).
- `zone/` (1) : template-wall-corner.glb.
