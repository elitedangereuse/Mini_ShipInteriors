# Roadmap — Mini ShipInteriors

Cette roadmap organise les demandes par catégorie et propose un ordre de
réalisation. Les cases cochées indiquent les demandes réalisées et vérifiées ;
les priorités ne constituent pas un engagement de calendrier.

## Priorités

- **P1 — En premier** : bugs visibles et améliorations de confort ciblées.
- **P2 — Ensuite** : liens avec le site et structure nécessaire aux évolutions.
- **P3 — Puis** : nouvelles activités, lieux de vie et contenu d'ambiance.

Les identifiants permettent de suivre les demandes sans les dupliquer entre
les catégories et les étapes de réalisation.

## 1. Corrections et ergonomie

- [x] **UX-01 · P1 · Bug — Plateaux de dames et d'échecs.** Corriger les
  différences de largeur des cases au centre ou sans pièce. Vérifier que toutes
  les cases gardent des dimensions uniformes, avec ou sans pièce.
- [x] **UX-02 · P1 · Bug — Popups pendant la rotation de caméra.** Masquer les
  popups pendant que la caméra tourne, puis les réafficher une fois la rotation
  terminée, afin d'éviter leur agitation à l'écran.
- [x] **UX-03 · P1 · Ergonomie — Repère dans l'ascenseur.** Indiquer clairement
  l'étage actuel, par exemple avec une mention « Vous êtes ici » sur le sélecteur
  des ponts.
- [x] **UX-04 · P1 · Ergonomie — Rotation du Holo-Me.** Ajouter un bouton pour
  arrêter et reprendre la rotation automatique du personnage.
- [x] **UX-05 · P2 · Performance — Mode léger.** Ajouter un mode destiné aux
  PC anciens, désactivé par défaut et activable depuis un bouton dans la barre
  en haut à droite. Réduire les effets et la qualité du rendu sans modifier les
  règles de jeu. Voir les critères détaillés ci-dessous.
- [x] **UX-06 · P1 · Bug — Comète bloqué contre le joueur.** Contourner
  le joueur du côté libre sans traverser les meubles. Si le joueur occupe
  la destination ou bouche le passage, abandonner le trajet plutôt qu'insister.
  Mesurer l'avancée après les collisions et préserver le mode photo figé.
- [x] **UX-07 · P1 · Bug — Interactions à travers les murs.** Empêcher
  d'activer un objet, un PNJ ou un siège situé derrière un mur ou une cloison.
  Vérifier la ligne de vue en plus de la distance, côté client pour le survol et
  côté serveur pour l'action, dans les espaces communs comme dans les quartiers
  où les joueurs posent leurs propres murs (SHIP-02). Vérifier aussi les objets
  adossés aux murs, qui doivent rester utilisables depuis la bonne face.
- [x] **UX-08 · P1 · Ergonomie — Bouton de sprint automatique.** Ajouter un
  bouton pour activer ou désactiver le sprint auto, avec choix mémorisé sur
  l'appareil. Le sprint auto doit rester compatible avec l'endurance et les
  bruits du jeu d'horreur : il ne donne aucun avantage, il évite seulement de
  maintenir une touche.

État de validation (27 septembre 2026) : UX-01 à UX-04 vérifiés dans Firefox,
avec 36 configurations de plateaux (vides, mixtes et remplis, de 180 à 520 px),
les rotations libres et amorties, les trois étages et la pause/reprise du Holo-Me.
Le profil UX-05 est implémenté : bouton en haut à droite, choix mémorisé,
résolution réduite, ombres désactivées, particules réduites, traînées d'étoiles
masquées et animations décoratives espacées. L'activation, la mémorisation et
le retour au rendu normal sont vérifiés avec le site Docker local. Cette fonctionnalité
est validée par l’utilisateur pour cette première livraison ; la mesure du
gain de fluidité sur un PC ancien reste à réaliser.
UX-06 dispose de tests de régression simulant les trajets, les meubles,
les passages étroits, l'arrivée du joueur en cours de trajet et le mode photo.

Réalisation (27 septembre 2026) :

- UX-07 : le plan des ponts et un test de ligne de vue sont partagés entre le
  client et le relais (`shared/sight.js`). L'invite et `E` ignorent un objet,
  un PNJ ou un siège derrière un mur ; un clic mène à une place du bon côté.
  Une porte ne laisse passer la vue que par son ouverture. Le relais refuse
  les tables de jeux et le jukebox hors de portée ou derrière un mur. Les
  94 objets interactifs des trois ponts restent utilisables depuis leur face,
  objets adossés compris. Les murs posés par les joueurs (SHIP-02) devront
  s'ajouter au plan utilisé par ce test.
- UX-08 : bouton du coureur dans la barre en haut à droite, choix mémorisé sur
  l'appareil. Le sprint auto donne la même allure et les mêmes pas qu'une
  course à la main ; `Maj` ou `L3` font alors marcher.
- DEC-01 : néon plus grand, sans plaque (deux fixations discrètes), en six
  couleurs (rose d'origine, orange Elite, cyan, vert, violet, blanc), choisies en
  pastilles sous le texte. Il éclaire le mur de sa couleur ; les néons déjà
  posés restent roses.

## 2. Liens avec le site, progression et récompenses

- [x] **SITE-01 · P2 · Fonctionnalité — Badges, cartes et aventures.** Relier
  la progression du site aux mini-shipinteriors : badges obtenus et aventures
  terminées. Permettre d'exposer son badge préféré ou sa carte préférée dans ses
  quartiers.
- [x] **SITE-02 · P2 · Récompense — Posters d'aventures.** Terminer une aventure
  débloque son poster dans les mini-shipinteriors. Le déblocage doit être
  rétroactif pour les aventures déjà terminées. S'appuyer sur SITE-01.
- [x] **SITE-03 · P2 · Récompense — Comptoir de crédits.** Les activités Weekly
  et Chasse galactique donnent des crédits à venir récupérer au comptoir du
  vaisseau. Prévoir le suivi des gains en attente et empêcher de récupérer deux
  fois la même récompense. Installer deux comptoirs visuellement distincts
  dans la salle des machines, un pour chaque activité.
- [x] **SITE-04 · P2 · Fonctionnalité — Classements à bord.** Afficher les
  classements du site dans le vaisseau, notamment l'employé du mois. Choisir
  leur emplacement et les classements à présenter.

Choix et réalisation (27 septembre 2026) :

- Les trois décorations gratuites sont dans « Murs » : carte de collection
  encadrée, badge encadré et poster d’aventure. Après la pose, sélectionner
  l’objet pour choisir son visuel parmi les possessions du compte. Les visuels
  restent lumineux dans les pièces sombres ; le sélecteur propose un aperçu
  et une recherche par nom pour les cartes. Le badge épouse sa forme hexagonale,
  avec sa bordure d’origine comme cadre et sans fond rectangulaire. Les miniatures
  du catalogue montrent les trois cadres en 3D sur un mur, une fois leur visuel chargé.
- Toutes les aventures déjà terminées débloquent leur poster. La couverture
  publiée est utilisée pour les aventures créées avec l’éditeur.
- Weekly : 10 000 CR pour la semaine entièrement validée. Chasse galactique :
  10 000 CR par cible validée. Les gains sont immédiatement récupérables au
  comptoir correspondant ; les validations antérieures au lancement ne paient
  pas de crédits. La migration SQL fixe ce lancement une seule fois.
- Le panneau « Employés du mois » est dans la salle de sport du pont principal :
  top 10 des 30 derniers jours, général, collectionneurs et podiums d’aventures.
  Écran adapté du modèle GalNet, fenêtre élargie et quatre onglets sur une ligne
  (défilement horizontal sur petit écran).
- Les deux comptoirs sont adossés aux murs nord et sud de la salle des machines,
  avec un officier de liaison en uniforme sobre pour les Weekly et un scientifique
  du LJPC en blouse, avec tablette et échantillons, pour la Chasse galactique.
  Respiration, regards, clignements des yeux et petits gestes animent les PNJ.
  Les consoles et tuyaux sont regroupés en périphérie pour dégager les accès aux
  guichets et la circulation autour du réacteur ; parcours et collisions vérifiés.
- La base vérifie les possessions avant enregistrement et les récompenses avant
  paiement. Le relais vérifie aussi les visuels exposés aux visiteurs. Tests :
  double récupération, rollback d’un paiement, historique, noms stockés,
  décorations usurpées et conservation des visuels lors des visites.

## 3. Espaces communautaires et activités

- [ ] **SOC-01 · P2 · Fonctionnalité — Pièces réservées à la Voie et à LJPC.**
  Créer des espaces accessibles uniquement aux membres concernés. Les pièces
  restent visibles pour les autres joueurs, avec la porte fermée ; l'accès doit
  être vérifié à partir de l'appartenance au groupe sur le site.
- [ ] **SOC-02 · P3 · Activité — Clash galactique.** Créer une pièce où jouer
  au Clash galactique du site. Intégrer le jeu depuis un iframe du site par exemple, c'est plus simple.
- [ ] **SOC-03 · P3 · Activité — Mini CQC.** Intégrer le mini CQC du site dans
  les mini-shipinteriors via un embed.
- [ ] **SOC-04 · P3 · Activité — Cinéma.** Créer une salle diffusant les trailers
  du site depuis une playlist YouTube. Basculer sur le live Twitch quand la
  chaîne est en direct, puis revenir à la playlist à la fin du live.
- [ ] **SOC-05 · P3 · Lieu de vie — Bar.** Ajouter un bar avec un robot serveur.
- [ ] **SOC-06 · P3 · Activité — Récupération de cargaison en zone Thargoid.**
  Créer un jeu d'horreur solo ou coopératif jusqu'à quatre joueurs, accessible
  par une nouvelle porte dans la cale. Explorer une baie de stockage en forme
  de labyrinthe, récupérer les colis et les rapporter au lobby en échappant aux
  Thargoids. Voir la fiche détaillée ci-dessous.
- [x] **SOC-07 · P3 · Activité — Mini-jeux des équipements de sport.** Rendre
  les appareils de la salle de sport jouables : suites de touches à frapper en
  rythme, de plus en plus vite, avec échec sur erreur ou retard, score et
  meilleur score conservé. Prévoir un mini-jeu par type d'appareil. Plafonner
  les scores comme pour l'arcade et valider les gains côté site.


- SOC-07 : tapis, vélo et sac de frappe, avec séquences accélérées, erreur de
  touche ou de rythme, boutons tactiles, records et crédits par paliers.
  Le rythme et le score suivent le personnage dans la scène ; la boîte de
  dialogue en bas affiche les consignes et le résultat, sans fenêtre modale.
  Le personnage s'installe sur l'appareil et conserve son animation pendant le jeu.
  Les huit paliers rapportent 20 à 300 CR (925 CR au total par appareil), sans
  prime de record d'arcade ; le message de fin affiche le montant réellement gagné.
  Le site contrôle le plafond de 99 900 points et la plausibilité temporelle.

## 4. Structure du vaisseau et immersion

- [ ] **SHIP-01 · P2 · Aménagement — Vaisseau et poste de pilotage.** Agrandir
  le vaisseau et revoir le poste de pilotage. Ajouter des vitres dans la salle
  de pilotage, ouvertes sur l'espace et le système en cours, en conservant la
  lisibilité de la vue isométrique et la cohérence avec la coque de SHIP-03.
  Prévoir de la place pour les nouveaux espaces communautaires.
- [ ] **SHIP-02 · P2 · Aménagement et économie — Extensions des quartiers.**
  Faire acheter les agrandissements des quartiers personnels avec des crédits,
  plutôt que d'agrandir gratuitement les quartiers de tous les joueurs.
  Proposer des extensions permanentes par paliers, avec aperçu de la surface
  ajoutée et du prix avant achat. Enregistrer les paliers débloqués et valider
  l'achat côté site, sans double débit ni double achat d'une même extension.
  Permettre aussi de placer des murs. Préserver le mobilier et les aménagements
  existants ; vérifier les passages, les collisions et les visites dans des
  quartiers de tailles différentes. Les prix, surfaces et nombres de paliers
  restent à définir.
- [ ] **SHIP-03 · P2 · Exploration — Coque partiellement visible.** Essayer une
  coque visible autour de certaines parties du vaisseau pour donner l'impression
  d'un ensemble cohérent plutôt que de pièces flottant dans l'espace. Étudier
  cette coque avec SHIP-01 pour conserver la lisibilité de la vue isométrique.

## 5. Personnalisation et ambiance

- [x] **DEC-01 · P1 · Décoration — Néon o7.** Augmenter sa taille, retirer la
  plaque noire derrière et proposer plusieurs couleurs.
- [x] **DEC-02 · P3 · Expression — Emote et icônes du site.** Ajouter une emote
  o7 ainsi que des icônes du site, par exemple Raxxla et Braben.
- [x] **DEC-03 · P3 · Décoration — Éléments des aventures.** Ajouter des
  personnages ou objets issus des aventures, par exemple Jacob Scarlett.
- [x] **DEC-04 · P3 · Ambiance — Compagnons supplémentaires.** Ajouter d'autres 
  animaux du pack de sprites et créer d'autres objets pour les animaux.
  Si possible ajouter plusieurs couleurs pour les animaux.

Réalisation (27 septembre 2026) :

- DEC-02 : emote « o7 » (`8`, `/o7`) : le bras droit monte à la tempe et y reste
  deux secondes, sur toutes les apparences ; son icône « o7 » s'envole au-dessus
  de la tête. Un bouton « Réactions » (`9`) ouvre une palette de huit médaillons
  tirés des visuels du site : Braben (carte « Badge Braben »), Raxxla (symbole de
  la Voie), Thargoïdes, Gardiens, Dark Wheel, Fédération des pilotes (icônes du
  lore), Fuel Rats et le logo du site. Une réaction ne fait pas bouger le
  personnage : elle marche assis ou couché. Commandes du chat : `/braben`,
  `/raxxla`… Le relais n'accepte que ces identifiants.
- DEC-03 : choix retenu, des objets libres, achetés en crédits (pas de lien
  avec les aventures terminées). Catégorie « Aventures » du catalogue, dix
  souvenirs dessinés en primitives : hologramme de Jacob Scarlett (personnage
  qui tourne et grésille sur son socle), coffre de La Buse, capsule de survie
  de l'Odysseus (balise qui clignote), Guide de survie et ses pages perdues,
  maquette du FNS Damocles, portrait de la duchesse d'Adenates, sapin de la
  Quête de Noël (guirlande qui clignote), bannière de la Voie, boîte noire du
  Thetis (son écho en ondes) et enseigne de TAXI Corp. Chaque objet cite son
  aventure à l'interaction. Prix de 6 000 à 45 000 CR dans `economy.json`.
- DEC-04 : choix retenu, les compagnons vivent dans les quartiers. Catégorie
  « Animaux » : les 23 animaux du pack Cube Pets (Comète reste le chat du
  bord), chacun avec un nom clin d'œil à Elite, un panier adapté (coussin,
  perchoir, ruche, feuille, paille, banquise, bac à sable, hutte, bambous),
  un cri synthétisé et six robes (nature, nuit, neige, or, cosmique, menthe)
  obtenues en repeignant la palette, yeux et museaux compris à part. L'animal
  vit près de son panier, ne quitte pas les quartiers, va manger aux gamelles
  et se laisse caresser ; les invités voient ceux de leur hôte. Objets pour
  animaux : gamelles, arbre à chat, niche, jouets, griffoir, bocal à poisson
  (le poisson-clown du pack, en cubes). 15 000 à 50 000 CR par animal.

## Fiche détaillée — Jeu d'horreur et de récupération (SOC-06)

### Intention et accès

Une mission de récupération dans une baie de stockage infestée : les joueurs
cherchent une cargaison dans un labyrinthe sombre, avec une visibilité réduite,
des bruits étranges et une musique mystérieuse. Un ou plusieurs Thargoids les
pourchassent. Créer un modèle ou skin Thargoid adapté à cette activité.

Une nouvelle porte au sous-sol, dans la cale, donne accès au lobby de cette
zone. Le lobby sert à former l'équipe, lancer une partie et consulter le
classement. Il constitue aussi le point de dépôt des colis et le lieu où sont
renvoyés les joueurs capturés. Le labyrinthe forme la zone dangereuse au-delà.

### Lobby et préparation

- Jouer seul ou former une équipe de **deux à quatre joueurs maximum**.
- Choisir **le nombre de colis à récupérer avant le lancement**. Ce nombre
  devient l'objectif commun de la partie ; il ne change plus en cours de jeu.
- Afficher les membres, le nombre de colis et le nombre de Thargoids avant de
  lancer la mission. Proposition : le créateur de l'équipe choisit les colis
  et lance quand tous les membres sont prêts.
- Augmenter le nombre de Thargoids avec la taille de l'équipe au lancement.
  Proposition initiale à tester : un Thargoid par joueur, soit un à quatre ;
  ajuster ensuite ce barème selon les essais solo et coopératifs.
- Réserver une instance de partie à chaque équipe pour séparer ses colis,
  ennemis et résultats de ceux des autres équipes. Le mode solo suit les mêmes
  règles avec une équipe d'une personne.

### Déroulement d'une partie

1. **Lancement.** Préparer le labyrinthe, cacher le nombre de colis choisi et
   placer les Thargoids. Les joueurs partent du lobby et entrent dans la baie.
2. **Exploration.** Chercher les colis avec une vision limitée. L'ambiance
   sonore accompagne la recherche et la menace. La carte complète ne doit pas
   permettre de voir les colis ou ennemis à travers les murs.
3. **Récupération.** Ramasser un colis et le transporter jusqu'au lobby. Un
   porteur se déplace plus lentement : le retour est plus risqué que l'aller.
   Proposition : un seul colis porté par joueur à la fois ; les coéquipiers
   peuvent continuer à chercher ou accompagner le porteur.
4. **Dépôt.** Déposer le colis dans le lobby pour le comptabiliser. Afficher
   la progression commune, par exemple « 2 / 5 colis rapportés ». Un joueur
   encore actif peut repartir chercher les colis restants.
5. **Capture.** Si un Thargoid attrape un joueur, le renvoyer au lobby et le
   faire passer en spectateur pour le reste de la partie. Il ne peut plus
   récupérer de colis ni retourner dans le labyrinthe pendant cette manche.
6. **Fin.** Gagner quand tous les colis choisis ont été rapportés ; perdre
   quand le dernier joueur encore actif est capturé avant d'atteindre cet
   objectif. Afficher le résultat, les colis livrés et les crédits gagnés,
   puis proposer une nouvelle partie depuis le lobby.

### Thargoids, visibilité et ambiance

- Prévoir des déplacements dans le labyrinthe et une poursuite des joueurs,
  avec des règles de détection à régler pendant les essais. Proposition :
  alterner patrouille, détection et poursuite, puis abandonner la poursuite
  lorsque la cible est perdue.
- Réduire la vision de chaque joueur dans la zone dangereuse, y compris en
  vue isométrique. Régler la portée pour maintenir la lisibilité des passages
  sans révéler tout le labyrinthe.
- Ajouter des bruits inquiétants et une musique mystérieuse ; distinguer les
  sons d'ambiance des indices de proximité des ennemis.
- Faire du lobby une zone sûre : les Thargoids ne peuvent ni y entrer ni y
  capturer un joueur. Y déposer un colis ne doit pas éliminer son porteur.
- Appliquer le ralentissement uniquement pendant le transport. Proposition :
  à la capture, laisser tomber le colis à un emplacement accessible dans le
  labyrinthe afin qu'un survivant puisse encore le récupérer.

### Furtivité, bruit et endurance

- **Casiers de cachette.** Répartir des casiers dans le labyrinthe où se
  cacher, avec une **durée maximale** au-delà de laquelle le joueur est éjecté,
  afin d'éviter l'attente indéfinie. Afficher le temps restant. Proposition :
  un Thargoid passant à proximité peut fouiller un casier occupé ; un casier ne
  peut accueillir qu'un joueur, et entrer ou sortir prend un court instant.
  Régler la durée, le délai de recharge et le comportement en portant un colis.
- **Bruit des déplacements.** Marcher est silencieux, courir fait du bruit et
  attire les Thargoids vers la position sonore. Distinguer clairement les deux
  allures pour le joueur, avec un repère visuel du bruit émis. Proposition :
  d'autres actions bruyantes (ouvrir un casier, faire tomber un colis) émettent
  un bruit ponctuel. Les portées d'écoute restent à régler pendant les essais.
- **Barre d'endurance.** Limiter la course avec une endurance qui se consomme
  en courant et se régénère à l'arrêt ou en marchant. Porter un colis pèse sur
  la dépense. L'endurance épuisée ramène à la marche, sans blocage total du
  joueur. Afficher la barre près du personnage et régler valeurs et vitesses de
  régénération avec les vitesses de la partie.
- **Fusées d'appel (flairs).** Placer dans le labyrinthe des fusées ramassables
  qui, une fois lancées, attirent le ou les monstres quelques instants vers
  l'endroit choisi. Utile pour dégager un passage ou couvrir un porteur.
  Proposition : nombre porté limité, une seule fusée active à la fois, et un
  effet visuel et sonore repérable par toute l'équipe. Régler la durée de
  l'attraction, la portée et la quantité disponible par partie.
- Ces mécaniques ne doivent pas dépendre du profil graphique : le mode léger
  (UX-05) conserve les mêmes durées, portées de bruit et règles d'attraction.
  Le sprint auto (UX-08) reste soumis au bruit et à l'endurance.

### Spectateurs et caméras de surveillance

Les joueurs capturés restent au lobby et suivent leurs coéquipiers encore
actifs à travers une interface de caméras de surveillance. Permettre de passer
d'une caméra à l'autre pour observer l'équipe. Ce mode ne donne aucun contrôle
sur les survivants et n'autorise pas le retour dans la manche. Les emplacements
des caméras et leur couverture du labyrinthe restent à définir.

### Crédits et classement

- Une victoire rapporte des crédits. Définir le montant selon le nombre de
  colis et la difficulté, ainsi que la répartition entre les membres.
- Proposition : récompenser chaque membre de l'équipe gagnante, y compris un
  joueur capturé, pour conserver le caractère coopératif du jeu. Ne pas
  attribuer de récompense de victoire lors d'une défaite.
- Afficher dans le lobby un classement des joueurs par **nombre de parties
  gagnées**, enregistré durablement sur le site. Définir le départage des
  égalités avant la mise en place du classement.
- Faire valider les captures, les dépôts et le résultat par le serveur de jeu,
  puis enregistrer les gains et les victoires côté site. Une même partie ne
  doit créditer ni une récompense ni une victoire deux fois.

### Points à régler et critères de validation

Le concept ci-dessus reprend les règles demandées ; les éléments signalés
comme propositions constituent des choix de conception à tester.

- Fixer les nombres de colis autorisés, les vitesses normales et de portage,
  la portée de vision, les règles de détection et le barème des ennemis.
- Fixer l'endurance et sa régénération, les portées d'écoute de la marche et de
  la course, la durée maximale des casiers, ainsi que la durée, la portée et le
  nombre des fusées d'appel. Vérifier qu'aucune de ces mécaniques ne permet de
  terminer une partie sans risque ni de bloquer les Thargoids indéfiniment.
- Choisir un labyrinthe fixe ou des variantes ; garantir que chaque colis
  reste accessible et qu'aucune disposition ne rend la mission impossible.
- Définir l'abandon et la déconnexion : traitement du colis porté, maintien
  éventuel de la place du joueur, délai de reconnexion et fin de partie quand
  il ne reste aucun joueur actif. Prévoir le retour au lobby si la partie est
  interrompue.
- Vérifier une victoire solo et à quatre, une défaite par capture de toute
  l'équipe, et une victoire obtenue par un survivant après les captures des
  autres. Vérifier aussi le dépôt du dernier colis, le ralentissement,
  les caméras, l'isolement des équipes et l'attribution unique des gains.
  Vérifier aussi l'éjection d'un casier en fin de durée, la fouille d'un casier
  occupé, la course sans endurance, une fuite réussie grâce à une fusée, et le
  bruit entendu par les Thargoids en coopératif.

### Découpage de réalisation proposé

1. Construire la porte, le lobby, le labyrinthe et la boucle solo : chercher,
   porter, déposer et terminer la partie.
2. Ajouter le skin Thargoid, les poursuites, les captures, la vision réduite
   et l'ambiance sonore ; équilibrer une mission solo complète.
   Ajouter ensuite la furtivité : endurance et bruit des déplacements, casiers
   de cachette à durée limitée, puis fusées d'appel.
3. Ajouter les équipes jusqu'à quatre, les instances, le choix des colis et
   l'évolution du nombre d'ennemis ; synchroniser les événements de la partie.
4. Ajouter les caméras des spectateurs, les cas de déconnexion, les récompenses
   persistantes et le classement ; valider la boucle complète en multijoueur.

## Fiche détaillée — Mode léger (UX-05)

- **Activation manuelle uniquement**, par un bouton identifiable dans la barre
  en haut à droite ; afficher si le mode est actif et permettre le retour au
  rendu normal. Proposition : mémoriser le choix sur l'appareil.
- Définir un profil de rendu moins coûteux : résolution de rendu réduite,
  ombres simplifiées ou désactivées, moins de particules et d'effets lumineux,
  et animations purement décoratives simplifiées. Ajuster ce profil à partir
  de mesures sur une machine ancienne.
- Garder toutes les interactions, les collisions, le multijoueur et les
  activités disponibles. Dans le jeu d'horreur, conserver la même portée de
  vision et les mêmes règles de détection : le profil graphique ne doit pas
  donner d'avantage de jeu.
- Vérifier le gain de fluidité sur un PC ancien, la lisibilité de l'interface
  et le basculement entre les deux modes sans perdre la session ni les
  aménagements. Le rendu normal reste le mode initial.

## Ordre de réalisation proposé

1. **Stabiliser et améliorer le confort.** Traiter UX-01 à UX-04, puis UX-07,
   UX-08 et DEC-01. UX-07 précède les extensions de quartiers, qui multiplient
   les murs, et le jeu d'horreur, où les casiers et les colis se trouvent près
   des cloisons.
   Le bug des plateaux reste à vérifier même si des corrections ont déjà été
   apportées aux jeux de société.
   Réaliser ensuite UX-05 pour faciliter l'accès sur les PC anciens et disposer
   d'un profil léger à vérifier lors de l'ajout de nouveaux espaces.
2. **Relier la progression du site au vaisseau.** Réaliser SITE-01, puis
   SITE-02 ; ajouter SITE-03 et SITE-04. La même identité et les données du site
   serviront ensuite à contrôler l'accès aux pièces réservées.
3. **Préparer les espaces.** Définir le plan agrandi avec SHIP-01 et expérimenter
   SHIP-03, puis réaliser les extensions payantes de SHIP-02 et SOC-01. Fixer
   les emplacements du comptoir, des classements, des futures pièces et de la
   porte de SOC-06 avant leur aménagement définitif.
4. **Installer les activités et lieux de vie.** Ajouter SOC-02 à SOC-05 dans
   les espaces prévus, puis SOC-07 dans la salle de sport existante. Vérifier la faisabilité des embeds du mini CQC, de
   YouTube et de Twitch avant de construire les pièces concernées.
5. **Construire le jeu d'horreur par étapes.** Réaliser SOC-06 selon son
   découpage dédié, en s'appuyant sur l'économie existante, le relais
   multijoueur et l'accès prévu dans la cale. Vérifier aussi le mode léger.
6. **Enrichir l'ambiance et la personnalisation.** Ajouter DEC-02 à DEC-04.
   Les éléments d'aventures pourront compléter les posters et récompenses.

## Choix à préciser au moment de chaque chantier

- Faut-il une pièce par groupe (Voie / LJPC), ou un espace commun réservé aux
  membres de l'un ou l'autre ?
- Quelle playlist YouTube et quelle chaîne Twitch utiliser pour le cinéma ?
- Quelle forme donner aux éléments d'aventures : PNJ, objets décoratifs ou
  objets à débloquer ?
- Les nouveaux compagnons vivent-ils dans les espaces communs, dans les
  quartiers, ou dans les deux ?
- Quels prix et quelles surfaces retenir pour les extensions des quartiers ?
- Pour SOC-06, régler les paramètres, les récompenses et les cas d'abandon
  listés dans sa fiche avant de figer les règles de la première version.
- Quels appareils de sport rendre jouables, et les mini-jeux rapportent-ils des
  crédits ou seulement un score ?
