# Brainstorm gameplay — Mini Ship Interiors

Document de travail pour les prochaines boucles de jeu à bord. L'objectif est de donner une
raison de revenir dans le vaisseau sans transformer l'intérieur en une deuxième simulation de
commerce spatial.

## Gagner des crédits à bord

### Activités courtes (30 secondes à 3 minutes)

- **Contrats de maintenance** — réparer une fuite, recalibrer une console ou relancer un filtre
  avec une petite séquence interactive. Les récompenses peuvent varier selon le pont et le type
  de panne.
- **Tri de cargaison** — ranger des caisses selon leur destination, leur dangerosité ou leur
  température. Les erreurs font perdre du temps mais pas de crédits.
- **Inspection de modules** — suivre une checklist dans une salle et valider les voyants dans le
  bon ordre. Un bonus est accordé si toute la checklist est faite sans interruption.
- **Récolte hydroponique** — entretenir les plantes, récolter une ressource et la livrer à une
  zone de transformation. L'aménagement de la serre pourrait modifier les récoltes disponibles.
- **Récupération de données** — trouver une balise lumineuse dans le vaisseau puis décoder une
  courte séquence. Les thèmes Guardian et Thargoid donnent une identité forte à cette activité.

### Activités plus longues (5 à 10 minutes)

- **Mission de ravitaillement interne** — préparer plusieurs commandes pour l'équipage avant une
  échéance. La récompense augmente si l'itinéraire choisi évite les détours.
- **Contrat de service du Fleet Carrier** — choisir une priorité entre confort, sécurité et
  rendement. Chaque choix influence les tâches qui apparaissent ensuite pendant quelques minutes.
- **Chasse aux anomalies** — des signaux rares apparaissent dans un pont précis. Les trouver et
  les analyser offre une récompense moins fréquente mais plus élevée.
- **Défi hebdomadaire du vaisseau** — une rotation de trois objectifs : nettoyer, réparer,
  battre un score d'arcade ou décorer une pièce. La récompense est un bonus fixe, pas une source
  de crédits infinie.

## Mini-jeux à plusieurs

Le réseau actuel synchronise les positions, le chat, les emotes, les profils et les quartiers.
Un mini-jeu partagé devra donc ajouter une petite session serveur autoritaire : identifiant de
partie, joueurs présents, état de la manche, validation de la récompense. Pour une première
version, il vaut mieux éviter de synchroniser chaque projectile ou chaque pixel.

### Candidats prioritaires

1. **Calibrage du réacteur** — 2 à 4 joueurs. Chaque joueur voit un panneau différent et donne
   des indications aux autres. Il faut aligner les curseurs dans le bon ordre avant la surcharge.
   Très bon candidat : peu d'objets à synchroniser et une vraie communication d'équipe.
2. **Relais de cargaison** — 2 à 4 joueurs. Une caisse passe de zone en zone ; chacun doit la
   déposer au bon endroit pendant que les autres lisent les erreurs de destination. La disposition
   des quartiers devient utile, sans demander une nouvelle grande arène.
3. **Mémoire d'obélisque** — 2 à 6 joueurs. Une séquence de glyphes apparaît sur le panneau
   Guardian ; chaque joueur mémorise une partie puis le groupe la recompose. Parties de 60 à
   120 secondes, avec difficulté progressive.

### Autres idées

- **Amarrage synchronisé** — deux joueurs règlent séparément la poussée et l'orientation d'un
  module jusqu'à obtenir une fenêtre verte.
- **Chasse au drone** — un joueur reçoit les coordonnées, les autres cherchent le drone dans les
  coursives. Variante légère du jeu du chaud/froid.
- **Alerte incendie** — répartition des rôles : repérer, isoler, ventiler. Le niveau du vaisseau
  change réellement l'ordre des interventions.
- **Orchestre du jukebox** — chacun active une piste au bon moment pour maintenir un rythme. Plus
  social et moins compétitif, idéal pour les quartiers décorés.
- **Défi d'arcade en relais** — chaque joueur prend une manche d'une même tentative. Le score du
  groupe est comparé au record du vaisseau, avec une petite prime collective.

## Garde-fous économiques

- Récompenser l'équipe, puis répartir la prime de façon égale pour éviter la compétition toxique.
- Ajouter un plafond quotidien ou une baisse de rendement après plusieurs parties afin de garder
  les crédits décoratifs plutôt que de remplacer toutes les autres sources de revenus.
- Donner des récompenses de progression non monétaires : titres, badges de pont, variantes de
  marqueurs, effets lumineux ou thèmes d'écran.
- Garder les activités de 30 secondes à 3 minutes rejouables à volonté, mais réserver les gros
  paiements aux contrats plus rares et aux objectifs hebdomadaires.

## Proposition de première tranche

1. Ajouter deux tâches solo : tri de cargaison et récupération de données.
2. Implémenter **Calibrage du réacteur** en partie de 90 secondes pour 2 à 4 joueurs.
3. Ajouter une récompense collective et un historique local des meilleurs temps.
4. Tester ensuite l'effet sur la fréquentation avant d'ajouter une deuxième monnaie ou des
   systèmes de progression plus lourds.

