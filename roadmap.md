# Roadmap — Mini ShipInteriors

Cette roadmap organise les 20 demandes initiales par catégorie et propose un
ordre de réalisation. Toutes restent à faire ou à vérifier ; les priorités ne
constituent pas un engagement de calendrier.

## Priorités

- **P1 — En premier** : bugs visibles et améliorations de confort ciblées.
- **P2 — Ensuite** : liens avec le site et structure nécessaire aux évolutions.
- **P3 — Puis** : nouvelles activités, lieux de vie et contenu d'ambiance.

Les identifiants permettent de suivre les demandes sans les dupliquer entre
les catégories et les étapes de réalisation.

## 1. Corrections et ergonomie

- [ ] **UX-01 · P1 · Bug — Plateaux de dames et d'échecs.** Corriger les
  différences de largeur des cases au centre ou sans pièce. Vérifier que toutes
  les cases gardent des dimensions uniformes, avec ou sans pièce.
- [ ] **UX-02 · P1 · Bug — Popups pendant la rotation de caméra.** Masquer les
  popups pendant que la caméra tourne, puis les réafficher une fois la rotation
  terminée, afin d'éviter leur agitation à l'écran.
- [ ] **UX-03 · P1 · Ergonomie — Repère dans l'ascenseur.** Indiquer clairement
  l'étage actuel, par exemple avec une mention « Vous êtes ici » sur le sélecteur
  des ponts.
- [ ] **UX-04 · P1 · Ergonomie — Rotation du Holo-Me.** Ajouter un bouton pour
  arrêter et reprendre la rotation automatique du personnage.

## 2. Liens avec le site, progression et récompenses

- [ ] **SITE-01 · P2 · Fonctionnalité — Badges, cartes et aventures.** Relier
  la progression du site aux mini-shipinteriors : badges obtenus et aventures
  terminées. Permettre d'exposer son badge préféré ou sa carte préférée dans ses
  quartiers.
- [ ] **SITE-02 · P2 · Récompense — Posters d'aventures.** Terminer une aventure
  débloque son poster dans les mini-shipinteriors. Le déblocage doit être
  rétroactif pour les aventures déjà terminées. S'appuyer sur SITE-01.
- [ ] **SITE-03 · P2 · Récompense — Comptoir de crédits.** Les activités Weekly
  et Chasse galactique donnent des crédits à venir récupérer au comptoir du
  vaisseau. Prévoir le suivi des gains en attente et empêcher de récupérer deux
  fois la même récompense.
- [ ] **SITE-04 · P2 · Fonctionnalité — Classements à bord.** Afficher les
  classements du site dans le vaisseau, notamment l'employé du mois. Choisir
  leur emplacement et les classements à présenter.

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

## 4. Structure du vaisseau et immersion

- [ ] **SHIP-01 · P2 · Aménagement — Vaisseau et poste de pilotage.** Agrandir
  le vaisseau et revoir le poste de pilotage, notamment en ajoutant des vitres.
  Prévoir de la place pour les nouveaux espaces communautaires.
- [ ] **SHIP-02 · P2 · Aménagement — Quartiers et cloisons.** Agrandir les
  quartiers et permettre aux joueurs d'y placer des murs. Préserver les
  aménagements existants et vérifier les passages et les collisions.
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

## Ordre de réalisation proposé

1. **Stabiliser et améliorer le confort.** Traiter UX-01 à UX-04, puis DEC-01.
   Le bug des plateaux reste à vérifier même si des corrections ont déjà été
   apportées aux jeux de société.
2. **Relier la progression du site au vaisseau.** Réaliser SITE-01, puis
   SITE-02 ; ajouter SITE-03 et SITE-04. La même identité et les données du site
   serviront ensuite à contrôler l'accès aux pièces réservées.
3. **Préparer les espaces.** Définir le plan agrandi avec SHIP-01 et expérimenter
   SHIP-03, puis réaliser SHIP-02 et SOC-01. Fixer les emplacements du comptoir,
   des classements et des futures pièces avant leur aménagement définitif.
4. **Installer les activités et lieux de vie.** Ajouter SOC-02 à SOC-05 dans
   les espaces prévus. Vérifier la faisabilité des embeds du mini CQC, de
   YouTube et de Twitch avant de construire les pièces concernées.
5. **Enrichir l'ambiance et la personnalisation.** Ajouter DEC-02 à DEC-04.
   Les éléments d'aventures pourront compléter les posters et récompenses.

## Choix à préciser au moment de chaque chantier

- Quelles cartes peuvent être exposées, et quels badges, aventures et
  classements du site sont concernés ?
- Quel montant de crédits attribuer aux Weekly et à la Chasse galactique,
  et à quel moment rendre les gains récupérables ?
- Faut-il une pièce par groupe (Voie / LJPC), ou un espace commun réservé aux
  membres de l'un ou l'autre ?
- Quelle playlist YouTube et quelle chaîne Twitch utiliser pour le cinéma ?
- Quelle forme donner aux éléments d'aventures : PNJ, objets décoratifs ou
  objets à débloquer ?
- Les nouveaux compagnons vivent-ils dans les espaces communs, dans les
  quartiers, ou dans les deux ?
