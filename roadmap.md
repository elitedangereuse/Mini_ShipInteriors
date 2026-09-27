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
  au Clash galactique du site.
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

## 4. Structure du vaisseau et immersion

- [ ] **SHIP-01 · P2 · Aménagement — Vaisseau et poste de pilotage.** Agrandir
  le vaisseau et revoir le poste de pilotage, notamment en ajoutant des vitres.
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

- [ ] **DEC-01 · P1 · Décoration — Néon o7.** Augmenter sa taille, retirer la
  plaque noire derrière et proposer plusieurs couleurs.
- [ ] **DEC-02 · P3 · Expression — Emote et icônes du site.** Ajouter une emote
  o7 ainsi que des icônes du site, par exemple Raxxla et Braben.
- [ ] **DEC-03 · P3 · Décoration — Éléments des aventures.** Ajouter des
  personnages ou objets issus des aventures, par exemple Jacob Scarlett.
- [ ] **DEC-04 · P3 · Ambiance — Compagnons supplémentaires.** Ajouter un
  chien, une tortue et un robot aspirateur en complément de Comète.

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

### Découpage de réalisation proposé

1. Construire la porte, le lobby, le labyrinthe et la boucle solo : chercher,
   porter, déposer et terminer la partie.
2. Ajouter le skin Thargoid, les poursuites, les captures, la vision réduite
   et l'ambiance sonore ; équilibrer une mission solo complète.
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

1. **Stabiliser et améliorer le confort.** Traiter UX-01 à UX-04, puis DEC-01.
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
   les espaces prévus. Vérifier la faisabilité des embeds du mini CQC, de
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
