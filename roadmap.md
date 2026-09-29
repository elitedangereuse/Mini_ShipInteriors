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

- [x] **SOC-01 · P2 · Fonctionnalité — Pièces réservées à la Voie et à LJPC.**
  Créer des espaces accessibles uniquement aux membres concernés. Les pièces
  restent visibles pour les autres joueurs, avec la porte fermée ; l'accès doit
  être vérifié à partir de l'appartenance au groupe sur le site.
- [x] **SOC-02 · P3 · Activité — Clash galactique.** Créer une pièce où jouer
  au Clash galactique du site. Intégrer le jeu depuis un iframe du site par exemple, c'est plus simple.
- [x] **SOC-03 · P3 · Activité — Mini CQC.** Intégrer le mini CQC du site dans
  les mini-shipinteriors via un embed.
- [ ] **SOC-04 · P3 · Activité — Cinéma.** Créer une salle diffusant les trailers
  du site depuis une playlist YouTube. Basculer sur le live Twitch quand la
  chaîne est en direct, puis revenir à la playlist à la fin du live.
- [x] **SOC-05 · P3 · Lieu de vie — Bar.** Ajouter un bar avec un robot serveur.
- [x] **SOC-06 · P3 · Activité — Récupération de cargaison en zone Thargoid.**
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
- SOC-04 (28 septembre 2026) : le cinéma du pont supérieur
  est ouvert, derrière le salon. Grand écran à rideaux de velours au nord, où
  tourne en boucle une fausse bande-annonce dessinée (même scène pour tout le
  bord), quatre rangées de six fauteuils, projecteur à bobines et son faisceau,
  machine à pop-corn, affiches de faux films, panneau « Sortie ». La lumière
  baisse en fondu quand on entre (`dim` dans levels.ts) et l'écran éclaire la
  salle aux couleurs de la scène. Un fauteuil bleu au fond sert de régie : son
  occupant choisit, parmi les aventures visibles avec trailer en base, la séance
  commune à tout le bord. Les autres fauteuils et l'écran ouvrent le lecteur
  partagé. En direct, la chaîne Twitch prend la priorité et suspend les trailers.
  Sous l'écran, chacun règle son propre volume (curseur, muet par défaut,
  retenu par le navigateur) ; le son ne s'entend que dans la salle. Un rai de
  lumière bleue désigne la régie, et le carton final du faux film y renvoie ;
  assis dans les rangées, plus d'invite par-dessus l'écran.
- Salon d'écoute (même jour) : l'ancien salon panoramique, en version cosy,
  pour Radio Dangereuse (le podcast Elite Dangerous) et les Galères
  Galactiques (mini-fiction audio humoristique). Affiches des deux émissions,
  enseigne « ON AIR », casques sur pied et au mur, poste d'écoute animé, coussins
  de sol. Les assises et l'ampli ouvrent un sélecteur Radio Dangereuse / Galères
  Galactiques. Le premier se lit dans un lecteur local (son site interdit les
  iframes tierces), le second dans une iframe directe.
- Labo du L.J.P.C. (même jour), d'après l'aventure « Connais ton ennemi » :
  tableau d'enquête des trois sites thargoïdes, paillasse, échantillon sous
  cloche, hologramme d'un intercepteur, photo d'Amadioha. James et Julia sont
  des PNJ animés ; Moustache, leur chatte noire, ne quitte jamais le labo.
  La porte est ouverte à tous : l'accès réservé aux membres (SOC-01) reste à
  faire.
- Promenade (même jour) : les salles en travaux de La Voie et du Mini-CQC
  quittent le pont principal. À leur place, la coursive s'ouvre sur un atrium
  vitré au nord, à l'est et au sud, et contourne une grande maquette de Cobra
  Mk III sur son socle, avec bancs, plantes et longues-vues. La Voie, toujours
  en travaux, est cachée dans la cale derrière la salle des machines ; le
  Mini-CQC reste jouable par l'intégration du site.
- Sanctuaire de la Voie (même jour), d'après L'Épreuve, La Cérémonie et Les
  Reliques de la Voie : la pièce cachée derrière la salle des machines passe à
  5 × 5 et quitte les travaux. Obsidienne, or terni et vert de Raxxla, tentures,
  lumière baissée (`dim`) ; au mur ouest, le portail de Raxxla (l'emblème en
  relief autour d'un vortex qui aspire les étoiles), gardé par l'Adepte
  Supérieur (PNJ encapuchonné, sans visage, qui lévite) ; au sol, l'emblème
  incrusté dont les pétales s'éveillent un à un, cerclé de la devise « brouillée »
  du site et de bougies noires. Autour : le lutrin des Chroniques de la Voie,
  l'icône de Salomé (Kahina Tijani Loren) et ses cierges, le terminal
  adepte@voie, les trois Reliques sous cloche, les robes des adeptes et la roue
  brisée du Dark Wheel. Aucune réponse des aventures n'y figure (date, système,
  clé). L'accès réservé aux adeptes (SOC-01) est traité à part.
- Studio Radio Dangereuse (29 septembre 2026) : le salon d'écoute est coupé en
  deux. Au nord, derrière une cloison vitrée (`glazed` dans levels.ts), le
  studio : table ronde, trois fauteuils et trois micros sur bras, mousse
  acoustique, horloge. Au-dessus de la vitre, côté salon, un néon tracé d'après
  les SVG du logo du site (planète et nom, en tubes) et un « ON AIR » rouge, qui
  s'amorce en clignotant dès que quelqu'un est installé au micro (vu de tout le
  bord). Au sud, le salon garde son côté cosy : fauteuils et poufs tournés vers
  le studio, poste d'écoute au mur ouest.
- Toilettes à dépression (même jour) : assis sur des toilettes du pont
  supérieur au moment du saut FSD, on est aspiré dans un tourbillon, puis l'on
  tombe du plafond de la cale, juste en dessous, et l'on reste sonné par terre.
  Les autres joueurs voient l'aspiration et lisent un message dans le chat.

## 4. Structure du vaisseau et immersion

- [x] **SHIP-01 · P2 · Aménagement — Vaisseau et poste de pilotage.** Agrandir
  le vaisseau et revoir le poste de pilotage. Ajouter des vitres dans la salle
  de pilotage, ouvertes sur l'espace et le système en cours, en conservant la
  lisibilité de la vue isométrique et la cohérence avec la coque de SHIP-03.
  Prévoir de la place pour les nouveaux espaces communautaires.
- [x] **SHIP-02 · P2 · Aménagement et économie — Extensions des quartiers.**
  Faire acheter les agrandissements des quartiers personnels avec des crédits,
  plutôt que d'agrandir gratuitement les quartiers de tous les joueurs.
  Proposer des extensions permanentes par paliers, avec aperçu de la surface
  ajoutée et du prix avant achat. Enregistrer les paliers débloqués et valider
  l'achat côté site, sans double débit ni double achat d'une même extension.
  Permettre aussi de placer des murs. Préserver le mobilier et les aménagements
  existants ; vérifier les passages, les collisions et les visites dans des
  quartiers de tailles différentes. Les prix, surfaces et nombres de paliers
  restent à définir.
- [x] **SHIP-03 · P2 · Exploration — Coque partiellement visible.** Essayer une
  coque visible autour de certaines parties du vaisseau pour donner l'impression
  d'un ensemble cohérent plutôt que de pièces flottant dans l'espace. Étudier
  cette coque avec SHIP-01 pour conserver la lisibilité de la vue isométrique.

Choix retenus (28 septembre 2026) :

- **Répartition des futurs espaces selon l'ambiance des ponts.** Pont principal :
  LJPC et La Voie au nord de la coursive prolongée, mini CQC au sud, à côté de
  l'arcade. La salle prévue pour le Clash galactique a été rendue à l'arcade,
  désormais sur deux salles (le Clash se joue déjà au bar de la cale). Pont supérieur (cosy) : le cinéma, et le salon
  panoramique recyclé plus tard en salon d'écoute (podcasts Radio Dangereuse,
  épisodes de Galère Galactique). Cale : le lobby du jeu d'horreur (SOC-06).
  Ces pièces sont construites dès la refonte, « en travaux » : murs, sol, place
  dans la coque, porte verrouillée, caisses, échafaudage et panneau « Bientôt ».
- **Poste de pilotage agrandi sur place**, à la proue du pont principal :
  verrières, sièges supplémentaires, tableaux de bord.
- **Système en cours** : le saut FSD lancé depuis le siège du pilote change de
  système pour tout le bord (synchronisé par le relais). Chaque destination est
  dessinée hors du vaisseau, visible par les verrières (étoile, planètes,
  anneaux, station).
- **Extensions des quartiers (SHIP-02) : trois espaces** (gauche, milieu,
  droite) accolés aux quartiers, chacun derrière sa propre porte. On débloque un
  espace une fois, dans l'ordre de son choix : 100 000 CR le premier, 250 000 CR
  le deuxième, 500 000 CR le troisième. Dans un espace débloqué, on choisit une
  pièce parmi **10 formes de plan** communes aux trois espaces (carrés de 5 × 5
  tuiles orientés vers leur porte), avec ses propres murs et sol. Changer de
  forme est gratuit et vide la pièce de ses objets (qui restent débloqués).
  Les formes remplacent la pose libre de murs.

Réalisation (28 septembre 2026) :

- SHIP-01 : le pont principal passe de ~210 à ~330 tuiles, la cale et le pont
  supérieur de ~140 et ~110 à ~180 et ~170. Les cinq pièces réservées sont en
  travaux derrière des portes verrouillées (voyant rouge, texte à l'examen) :
  le plan partagé (`shared/ship-map.js`) connaît les portes verrouillées, qui
  arrêtent le passage et la vue. Le poste de pilotage passe de 26 à 44 tuiles :
  verrières (allège, bandeau orange, verre) sur l'avant et les flancs, tableau
  de bord du pilote à écrans animés, postes du navigateur et du copilote,
  fauteuil du commandant sur son estrade. La réserve de huit lumières suit
  désormais le joueur.
- Système en cours : le relais garde le système du vaisseau et choisit la
  destination du saut demandé par le pilote installé ; tout le bord le vit, un
  saut à la fois, et un nouveau venu arrive dans le système en cours. Huit
  destinations dessinées sous le pont, à la proue, et qui suivent la caméra
  comme le champ d'étoiles (`src/systems.ts`, `shared/systems.js`).
- SHIP-03 : un seul corps de coque sous le pont affiché, dont la silhouette
  épouse les trois ponts et la place des extensions (élargie d'une tuile,
  creux comblés, escaliers lissés), sous les planchers : il ne masque jamais
  la vue isométrique. Tôles, feux de navigation, tuyères à la poupe.
- SHIP-02 : achat par le site (`{"action":"buy","wing":…}`), compte et espaces
  verrouillés pendant l'achat (pas de double débit, pas deux fois le même
  palier), espaces débloqués rendus avec le compte ; le site ne garde que les
  pièces des espaces débloqués et accepte 32 objets de plus par pièce (160 au
  plus). Pièces construites à la volée (sols, murs, portes intérieures,
  poteaux, fondu), revêtements par pièce, règles de pose par pièce, onglet
  « Pièces » avec aperçu au sol. Vérifié de bout en bout avec le site Docker
  local : achat, forme, revêtement, confirmation d'une pièce meublée,
  annulation, rechargement ; tests Node (formes, orientations, portes,
  relais) et PHP (prix, économie, pièces gardées).
- Avant déploiement : aucune table nouvelle (les espaces sont des lignes
  `wing:…` de `mini_shipinteriors_owned`) ; redémarrer le relais (plans,
  saut FSD, aménagements plus grands : messages jusqu'à 32 Ko) ; déployer le
  build avec son `economy.json` (prix des espaces) avant ou avec le site.

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
  tirés des visuels du site : le logo du site en premier, Braben (carte « Badge
  Braben »), Raxxla (symbole de la Voie), les emblèmes de la Fédération, de
  l'Empire, de l'Alliance et d'Aegis, et les Fuel Rats ; chaque visuel est
  centré dans son médaillon rond. Une réaction ne fait pas bouger le
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
  « Animaux » : Comète en tête (offert, un seul : le choisir pose son panier),
  puis les 22 autres animaux du pack Cube Pets, chacun avec un nom clin d'œil à Elite, un panier adapté (coussin,
  perchoir, ruche, feuille, paille, banquise, bac à sable, hutte, bambous),
  un cri synthétisé et six robes (nature, nuit, neige, or, cosmique, menthe)
  obtenues en repeignant la palette : seules les cases du pelage changent,
  les yeux et le museau (repérés comme petits volumes à l'avant de la tête)
  gardent leurs couleurs. Deux animaux au plus par quartiers, Comète compris :
  sans son panier, Comète n'est pas là, et l'on peut le remplacer. L'animal
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
sur les survivants et n'autorise pas le retour dans la manche. Les caméras sont centrés sur les joueurs restants et montrent la même chose que voient les joueurs observés.

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

### Réalisation (29 septembre 2026)

Les quatre étapes du découpage sont livrées ensemble. Choix retenus :

- **Lobby** : l'ancien sas en travaux de la cale (pièce `h`), ouvert et meublé : terminal
  de mission, mur de six caméras de surveillance, porte blindée de la zone (bandes de
  danger, gyrophare), tableau des victoires, vestiaire, caisse de fusées. On y forme son
  équipe au terminal ; en sortir, c'est la quitter.
- **Réglages de l'équipe** : le chef choisit le nombre de colis **et** le nombre d'ennemis
  (1 à 6 chacun, demande de l'utilisateur plutôt que le barème « un par joueur ») ; menace
  et récompense s'affichent ; un changement remet tout le monde en attente ; départ trois
  secondes après le dernier « prêt ».
- **Labyrinthe** : un nouveau tirage à chaque mission, depuis une graine du relais, le même
  chez chaque client (`shared/salvage.js`) : couloirs sinueux, culs-de-sac en partie
  rouverts (des boucles pour semer un ennemi), halls encombrés de conteneurs, sas
  d'extraction contre un bord (zone sûre, deux portes). Tout reste accessible, ennemis
  compris (vérifié sur des dizaines de graines). Taille : 18 × 16 à 26 × 22 tuiles selon
  l'équipe et les colis. Murs du Modular Space Kit à l'échelle 1/4 (une pièce du kit = une
  tuile), conteneurs du Train Kit, décor du Space Kit.
- **Dépôt** : au sas d'extraction de la baie (entrer dans le sas avec un colis le livre),
  plutôt qu'au lobby du vaisseau : le joueur reste en course pour les colis suivants.
- **Vision** : 3,6 tuiles autour de soi, en ligne de vue (murs et conteneurs), rendue par
  un brouillard de guerre qui relit la profondeur ; 1,5 dans un casier ; le zoom reste
  libre, la vue ne grandit pas.
- **Son** : pas de musique ; pas avec écho, grognements et pas des ennemis, cœur qui bat
  quand l'un est à moins de 5 tuiles, détecteur de cargaison qui bipe à moins de 7 tuiles
  d'un colis, flèche vers le sas quand on porte un colis.
- **Vitesses** : marche 1,7, course 3,4 ; porteur × 0,62. Ennemis : patrouille 1, enquête
  1,55, poursuite 2,45 (plus vite qu'un porteur, moins qu'un joueur qui court à vide).
- **Détection** : vue de 4,6 tuiles dans un cône de 125°, 1,35 tout autour ; capture à
  0,5 ; cible perdue au bout de 4 s sans la voir ; 4 s de répit au départ.
- **Bruit et endurance** : la course s'entend à 7 tuiles de chemin (8,5 avec un colis),
  casier 3,5, éjection 4,5, colis qui tombe 5. Endurance : 5 s de course (3,3 avec un
  colis), récupération plus rapide à l'arrêt qu'en marchant, reprise à 30 %.
- **Casiers** : 20 s au plus, un par casier, pas avec un colis, 6 s avant d'y revenir. Un
  ennemi qui a vu le joueur y entrer le fouille (2,2 s) et l'en tire ; un ennemi qui passe
  devant un casier occupé le fouille une fois sur cinq environ.
- **Fusées** : 2 + taille de l'équipe + colis / 2 dans la baie, deux au plus sur soi ;
  lancées à 5,5 tuiles au plus, en vue ; 12 s ; portée d'attraction 12 tuiles de chemin ;
  une seule à la fois ; les ennemis attirés ignorent les joueurs.
- **Capture** : le colis tombe sur place (un coéquipier peut le reprendre) ; le capturé
  revient au lobby et suit l'équipe par la caméra alliée (même vue que le coéquipier
  suivi) ; le mur des caméras la rouvre. Il ne revient pas dans la manche.
- **Abandon, déconnexion** : « Abandonner » (deux clics) ou une déconnexion valent
  capture, colis lâché ; pas de reconnexion à la partie. Plus personne en course : défaite.
  Une mission oubliée s'arrête au bout de 30 minutes.
- **Récompense** : 1 500 CR par colis, + 50 % par ennemi au-delà du premier (1 500 CR
  pour 1 colis et 1 ennemi, 6 800 pour 3 et 2, 31 500 pour 6 et 6), à chaque CMDR de
  l'équipe gagnante, capturés compris ; rien en cas de défaite ; les invités jouent sans
  crédits. Chiffres dans `economy.json`.
- **Classement** : par victoires ; à égalité, colis rapportés, puis première victoire.
- **Autorité** : le relais arbitre tout et ignore une position impossible ; il transmet la
  victoire au site avec le cookie de chaque membre et une clé partagée
  (`MSI_RELAY_SECRET`) ; le site ne paie qu'une fois par partie et par CMDR.
- **Chat** : dans la baie, on ne parle qu'à son équipe.
- **Mode léger** : mêmes règles, même vue ; seul l'anticrénelage du brouillard saute.

Vérifications : 29 tests Node (labyrinthe, relais de jeu, relais socket.io, gains), 4 tests
PHP (dont un en base) ; parties jouées dans Chrome : victoire solo payée par le site local,
partie à deux (chat d'équipe, capture, caméra alliée, fusée, casier, abandon, défaite).
Reste à faire pour une version suivante :

- **Équilibrage en vraies parties** : vitesses, portées de vue et d'ouïe, durée des casiers et
  des fusées, nombre d'ennemis conseillé, montant des récompenses. Impossible à régler en
  headless (le client y tourne à quelques images par seconde, les ennemis du relais non).
- **Un vrai modèle de Thargoïde** à la place des zombies en costume.
- **Reconnexion** : une déconnexion vaut abandon ; pas de retour dans une partie en cours.
- **Écrans du lobby** : les six moniteurs montrent des images d'ambiance ; la vraie caméra
  alliée s'ouvre depuis le mur (ou d'elle-même après une capture).
- **Mesures** : coût du brouillard de guerre (une passe de rendu en plus) sur un PC ancien et
  sous Safari ; le mode léger n'en retire que l'anticrénelage.
- **Tactile** : la fusée se lance depuis la pastille « Fusées » du HUD, sans bouton dédié.
- **Vue subjective** (`V`, arrivée entre-temps) : utilisable dans la baie, fusée lancée dans
  le sens du regard ; les caméras alliées restent en vue isométrique. À éprouver en partie.

Avant déploiement : jouer `docker/tables/mini_shipinteriors_salvage.sql` ; définir
`MSI_RELAY_SECRET` (même valeur) pour le relais (unité systemd) et pour PHP ; redémarrer
le relais ; déployer le build avec son `economy.json` (section `salvage`).

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
   porte de SOC-06 avant leur aménagement définitif. Fait pour SHIP-01 à 03 :
   les futures pièces et la porte de SOC-06 ont leur place, en travaux.
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
- Quelle forme donner aux éléments d'aventures : PNJ, objets décoratifs ou
  objets à débloquer ?
- Les nouveaux compagnons vivent-ils dans les espaces communs, dans les
  quartiers, ou dans les deux ?
- Pour SOC-06, régler les paramètres, les récompenses et les cas d'abandon
  listés dans sa fiche avant de figer les règles de la première version.
- Quels appareils de sport rendre jouables, et les mini-jeux rapportent-ils des
  crédits ou seulement un score ?
