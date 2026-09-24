<h1 align="center">Mini Interior</h1>

<p align="center">
  <strong>Un vaisseau spatial isométrique et multijoueur, jouable directement dans le navigateur.</strong><br>
  Trois ponts à explorer entre CMDR, un Holo-Me pour changer d'apparence, et Comète, le chat du bord.
</p>

<p align="center">
  <img alt="Three.js" src="https://img.shields.io/badge/Three.js-r186-black?logo=threedotjs">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-7-3178c6?logo=typescript&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-8-646cff?logo=vite&logoColor=white">
  <img alt="Node.js ≥ 20" src="https://img.shields.io/badge/Node.js-%E2%89%A5%2020-5fa04e?logo=nodedotjs&logoColor=white">
  <img alt="Assets CC0" src="https://img.shields.io/badge/assets-CC0%20Kenney-f59e0b">
</p>

<p align="center">
  <img src="docs/images/pont-superieur.jpg" alt="Le pont supérieur en vue isométrique : quartiers du commandant, cabines, douches, serre et salon panoramique" width="100%">
</p>

---

## Sommaire

- [En bref](#en-bref)
- [Le vaisseau](#le-vaisseau)
- [Holo-Me (garde-robe)](#holo-me-garde-robe)
- [Mobilier fait main](#mobilier-fait-main)
- [Lancer en local](#lancer-en-local)
- [Commandes](#commandes)
- [Comptes Élite Dangereuse](#comptes-élite-dangereuse)
- [Sons](#sons)
- [Choix techniques](#choix-techniques)
- [Architecture](#architecture)
- [Assets](#assets-tous-en-cc0--domaine-public-par-kenney)
- [Limites connues / pistes](#limites-connues--pistes)

## En bref

Mini Interior est un POC : un vaisseau sur trois ponts, vu de dessus en isométrique. On y promène un personnage, on y croise les autres joueurs connectés et Comète, le chat du bord.

- **Trois ponts, trois ambiances** : des quartiers chaleureux, un pont principal aux couleurs d'Elite, une cale rouillée à l'éclairage sodium.
- **Multijoueur** : chaque onglet est un membre d'équipage, avec positions, emotes et chat en bulles, synchronisés par un petit relais WebSocket.
- **Comptes Élite Dangereuse** : un CMDR connecté à [elitedangereuse.fr](https://elitedangereuse.fr) arrive sous son nom, avec un badge « vérifié ».
- **Holo-Me** : humain, combinaison spatiale, alien, robot ou créature, et chaque changement s'applique en direct.
- **Des dizaines de meubles animés** : bornes d'arcade jouables, hologrammes, bras robotisé qui soude, aquarium, cheminée…
- **Son spatialisé** : pas, réacteur, bips des consoles, mélodies d'arcade, ronronnements.

<p align="center">
  <img src="docs/images/equipage.jpg" alt="Deux joueurs dans le salon panoramique : l'un parle dans une bulle, l'autre danse" width="100%">
  <br><em>Deux membres d'équipage dans le salon panoramique : chat en bulle, emote « danse », et Comète qui fait la sieste près du bureau.</em>
</p>

## Le vaisseau

Trois ponts, trois ambiances. Chaque pont repeint à sa façon la même palette du kit (coque et mobilier, cf. `themes` dans `src/assets.ts`), et a son propre éclairage (ciel, soleil, lumières qui vacillent) et son propre bruit de pas. Le pont principal est de loin le plus grand (~210 tuiles). La cale et le pont supérieur sont deux fois plus petits (~90 et ~100 tuiles), autour de l'ascenseur.

On se réveille dans ses quartiers, sur le pont supérieur, à deux pas du Holo-Me.

| Pont | Ambiance | Pièces |
|---|---|---|
| **Pont supérieur** · les quartiers | *cozy* : crème et bois miel, tissus, plantes, lumière chaude, pas feutrés | **quartiers du commandant** (grand lit, cheminée holographique, canapé, aquarium, bureau, bibliothèque, casier à combinaisons, **Holo-Me**), cabines d'équipage (lits superposés), douches, serre hydroponique, salon panoramique (carte du système), coursive |
| **Pont principal** | la station d'origine, mobilier aux couleurs d'Elite | poste de pilotage (siège et HOTAS, scanner, panneaux holographiques, carte galactique), salle des machines (centrale, réacteur FSD, tuyères), **infirmerie** (lits médicaux, scanner corporel, quarantaine), **salle de sport**, **salon d'arcade** (trois bornes jouables), mess, coursive |
| **Cale** | *brute* : acier noirci et rouillé, jaune de chantier, lumière sodium, néons qui grésillent | **atelier** (établis, poste de soudure, établi d'ingénieur, ferraille), **baie de réparation** (SRV Scarab sur pont élévateur, bras robotisé qui soude, AFMU), **raffinerie** (fusion, tapis roulant de minerai, cristaux, drones collecteurs, laser minier), soute, palier de l'ascenseur |

### Pont supérieur · les quartiers

<p align="center">
  <img src="docs/images/quartiers.jpg" alt="Les quartiers du commandant : grand lit, aquarium, bibliothèque, bureau, canapé et Comète le chat" width="100%">
</p>

### Pont principal

<p align="center">
  <img src="docs/images/pont-principal.jpg" alt="Vue d'ensemble du pont principal : salle des machines, infirmerie, salle de sport, mess, arcade et poste de pilotage" width="100%">
</p>

<table>
  <tr>
    <td width="50%"><img src="docs/images/cockpit.jpg" alt="Le poste de pilotage : siège, consoles, carte galactique holographique"><br><sub><b>Poste de pilotage</b> : siège et HOTAS, scanner, carte galactique holographique.</sub></td>
    <td width="50%"><img src="docs/images/arcade.jpg" alt="Le salon d'arcade et ses trois bornes"><br><sub><b>Salon d'arcade</b> : trois bornes jouables (Elite, Invaders, Asteroids) à côté du mess.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/machines.jpg" alt="La salle des machines : réacteur, FSD et tuyères"><br><sub><b>Salle des machines</b> : centrale, réacteur FSD, et les tuyères à la poupe.</sub></td>
    <td width="50%"><img src="docs/images/infirmerie-sport.jpg" alt="L'infirmerie et la salle de sport"><br><sub><b>Infirmerie et salle de sport</b> : lit médical, scanner corporel, tapis de course, sac de frappe.</sub></td>
  </tr>
</table>

### Cale

<p align="center">
  <img src="docs/images/cale.jpg" alt="Vue d'ensemble de la cale : atelier, palier de l'ascenseur, baie de réparation, raffinerie et soute" width="100%">
</p>

<table>
  <tr>
    <td width="50%"><img src="docs/images/reparation.jpg" alt="La baie de réparation avec le SRV Scarab et le bras robotisé"><br><sub><b>Baie de réparation</b> : le SRV Scarab sur son pont élévateur, le bras robotisé qui soude.</sub></td>
    <td width="50%"><img src="docs/images/atelier.jpg" alt="L'atelier : établis, poste de soudure, établi d'ingénieur"><br><sub><b>Atelier</b> : établis, poste de soudure, établi d'ingénieur, ferraille.</sub></td>
  </tr>
</table>

## Holo-Me (garde-robe)

<p align="center">
  <img src="docs/images/holo-me.jpg" alt="Le panneau Holo-Me ouvert : choix de l'espèce, du sexe, du modèle et de la combinaison" width="100%">
</p>

Dans les quartiers du commandant (pont supérieur), monte sur la plateforme orange du Holo-Me et appuie sur `E`. La caméra se rapproche, le personnage tourne sur lui-même et chaque choix s'applique en direct. **Valider** enregistre l'apparence et l'envoie aux autres joueurs. **Annuler** ou `Échap` revient à l'apparence d'avant.

| Espèce | Choix |
|---|---|
| Humain | sexe, 5 modèles (femme) ou 6 (homme) |
| Combinaison | les modèles humains en combinaison spatiale, 4 combinaisons d'après Elite Dangerous: Odyssey : **Vol** (sombre, liserés orange, sans casque), **Maverick** (orange, casque à visière dorée), **Dominator** (noire, visière rouge), **Artemis** (blanche, bulle de verre) |
| Alien | sexe, 5 ou 6 modèles, 3 teintes (Zorblien, Cryonien, Nébulien) : les humains avec une rotation de teinte et des antennes |
| Robot | Unité R-7, Unité V-3, Mannequin T-0 |
| Créature | Orque de Kepler, Troll des soutes, Zombie en costume |

Un nouveau joueur arrive dans une combinaison tirée au hasard. Les combinaisons recolorent le corps du modèle par « carte de dégradé » (la peau devient des gants), et le casque, le col et le sac dorsal sont accrochés aux os de la tête et du torse : ils suivent les animations. La femme « a » des Mini Characters (avec des béquilles) est retirée du catalogue. Une apparence enregistrée qui l'utilisait passe au premier modèle disponible.

Les robots ont des pas plus lourds. Pour ajouter une espèce ou un modèle, il suffit de compléter `RACES` dans `src/looks.ts` : les modèles sont remis à la même taille automatiquement, et une animation manquante est remplacée par une animation voisine.

**Comète** vit dans les quartiers (pont supérieur), près de son panier au coin du feu. Il vient se frotter aux jambes du joueur, fait sa toilette, pique des sprints, miaule, ronronne quand on le caresse (`E`) et danse quand on danse à côté de lui. S'il se retrouve coincé contre un meuble, il renonce à son trajet et repart ailleurs.

## Mobilier fait main

<p align="center">
  <img src="docs/images/mobilier.jpg" alt="La galerie de debug : tout le mobilier fait main, du lit douillet au SRV" width="100%">
  <br><em>La galerie de debug <code>/gallery.html?mobilier</code> : tous les meubles construits à la main, animés.</em>
</p>

Les meubles qui ne sont pas dans le kit sont construits en primitives Three.js dans `src/furniture/`, rangés par zone : `elite.ts` (clins d'œil à Elite Dangerous), `workshop.ts` (la cale), `leisure.ts` (infirmerie, sport, arcade), `cozy.ts` (les quartiers). On les place dans `src/levels.ts` comme les modèles du kit : `{ model: 'fireplace', x, z, rot }`. Le nom du modèle est vérifié à la compilation.

- `label` passe un texte libre au meuble : le titre d'un panneau holographique (`'Titre|ligne|ligne'`), le jeu d'une borne (`elite`, `invaders`, `asteroids`), la couleur d'un tissu (`teal`, `terracotta`, `mustard`…), la palette et la taille d'un tapis (`warm:2.2x1.5`).
- `interact` accepte une liste de phrases : une au hasard à chaque interaction. `action` change le verbe de l'invite (« Jouer », « Se doucher », « Frapper »…).
- Certains meubles s'animent (hologrammes, flammes, poissons, étincelles, bras robotisé, tapis roulant) et ont un son d'ambiance (bornes d'arcade, soudure, grondement de la raffinerie).

La galerie de debug les montre tous, animés : `/gallery.html?mobilier` (avec `&only=arcade,fireplace`, `&label=…`).

Côté performances, chaque meuble est fusionné en deux maillages au plus (couleurs portées par les sommets), puis avec le reste du pont. Un meuble interactif se clique grâce à un volume invisible, qui ne coûte aucun appel de dessin. Les pièces mobiles répétées (contacts du scanner, poissons, étincelles…) sont instanciées. Les consoles racontent le lore d'Elite : Jameson Memorial, Hutton Orbital, Felicity Farseer, les étoiles KGBFOAM…

## Lancer en local

Prérequis : Node 20 ou plus.

```bash
npm install
npm run dev        # http://localhost:5173 — jeu + relais multijoueur
```

Pour tester le multijoueur, ouvre deux onglets (ou un onglet et un autre navigateur). Chaque onglet est un membre d'équipage.

Production (un seul port pour le jeu et le relais) :

```bash
npm run build
npm start          # http://localhost:8080 (variable PORT pour changer)
```

Le contenu de `dist/` peut aussi être déposé sur un hébergement purement statique. Dans ce cas, le jeu fonctionne en **solo** : sans relais, le chat reste local.

Une page de debug, `/gallery.html`, affiche chaque modèle du kit avec son nom et son orientation d'origine (`?only=wall,floor&zoom=4&cols=4&back`), ou le mobilier fait main avec `?mobilier`. En dev, `window.__game` expose quelques fonctions (`goTo`, `ride`, `emote`, `say`…).

## Commandes

| Action | Clavier / souris |
|---|---|
| Se déplacer | `ZQSD` (AZERTY), `WASD` (QWERTY), flèches, ou clic sur le sol (pathfinding) |
| Courir | `Maj` |
| Interagir | `E` ou `Espace` près d'un objet, ou clic sur l'objet (le perso y va tout seul) |
| Changer de pont | interagir avec l'ascenseur (la plateforme cyan surmontée d'un panneau ▲▼, dans la coursive ou sur le palier), puis `↑` `↓` pour choisir l'étage et `Entrée` pour y aller, ou un clic ; `E`, `Échap` ou un clic en dehors pour fermer |
| Emotes | `1`…`7` ou la barre en bas : salut, oui, non, joie, danse, assis, dodo |
| Chat | `Entrée`, puis `Entrée` pour envoyer, `Échap` pour annuler |
| Commandes du chat | `/nom CMDR Pseudo` (invités), `/perso` (apparence au hasard), `/danse`…, `/aide` |
| Changer d'apparence | le **Holo-Me** des quartiers du commandant (pont supérieur) |
| Pivoter la caméra | `R` / `Maj+R`, ou les boutons en haut à droite (d'un quart de tour ; ramène aussi la vue isométrique après la caméra libre) |
| Caméra libre | maintenir le **clic droit** ou le **clic molette** et glisser : horizontalement on tourne autour du personnage, verticalement on incline la vue (de rasante à presque de dessus) ; avec `Maj`, on fait glisser la vue, qui revient sur le personnage dès qu'il bouge |
| Zoom | molette, ou les boutons loupe |
| Son | `M` ou le bouton haut-parleur, curseur de volume (le son démarre au premier clic ou à la première touche, contrainte des navigateurs) |

## Comptes Élite Dangereuse

Un joueur connecté à [elitedangereuse.fr](https://elitedangereuse.fr) arrive dans le jeu sous son **nom de CMDR**, avec un badge « vérifié » vert. Il ne peut pas en changer (`/nom` est refusé). Les autres jouent en **invités**, avec un nom tiré au sort parmi des figures de la science-fiction (« CMDR Ripley », « CMDR Albator », « CMDR Jameson »…), qu'ils peuvent changer avec `/nom`. Un invité ne peut pas prendre le nom d'un CMDR vérifié présent à bord : il devient « … (invité) ».

### Fonctionnement

Le cookie `ED_LOGGED_CMDR_ID` est `httponly` et propre à `elitedangereuse.fr` : ni le JavaScript du jeu ni un sous-domaine ne peuvent le lire. Le jeu passe donc par le site :

1. Le jeu appelle `https://elitedangereuse.fr/mini-interior-ticket.php` (fetch avec `credentials: 'include'`). La requête reste sur le même site, donc le cookie part avec.
2. La page PHP retrouve le CMDR avec `ed_endpoint_cmdr()`, le helper existant du site, et répond par un **billet signé** HMAC-SHA256, valable 5 minutes, qui contient le nom visible (`ed_cmdr_display_name()`).
3. Le jeu remet le billet au relais multijoueur, qui vérifie la signature (`server/ticket.js`) et impose le nom. Personne ne peut se faire passer pour un autre CMDR, et **le serveur du jeu n'a jamais accès à la base**.

Un billet frais est redemandé à chaque reconnexion.

### Mise en production

1. **Sur le site** (repo `elitedangereuselight`) : copier `integration/elitedangereuse/mini-interior-ticket.php` à la racine. Il s'appuie sur `phputils/endpoint_auth.php` et `phputils/secrets.php`.
2. **Un secret partagé** : générer `openssl rand -base64 32` et exporter la même valeur dans `MINI_INTERIOR_SECRET` côté PHP (lu par `ed_secret()`) et côté serveur du jeu.
3. **Si le sous-domaine n'est pas `jeu.elitedangereuse.fr`** : renseigner `MINI_INTERIOR_ORIGINS=https://autre.elitedangereuse.fr` côté PHP (liste séparée par des virgules). Côté jeu, l'adresse du billet est déduite toute seule sur `*.elitedangereuse.fr`. Sinon : `VITE_ED_TICKET_URL=… npm run build`.
4. **Le jeu** : `npm run build && MINI_INTERIOR_SECRET=… npm start` (port 8080, variable `PORT`), derrière un reverse proxy HTTPS qui laisse passer les WebSockets sur `/ws`.

Sans secret, ou si le site ne répond pas, le jeu fonctionne quand même : tout le monde est invité.

### En local

`npm run dev`, puis `http://localhost:5173/?cmdr=Adam%20Fauster` simule un CMDR connecté. Le serveur de dev signe lui-même le billet (`/dev/ticket`), avec le même chemin de vérification qu'en prod.

## Sons

Tous les sons sont spatialisés (HRTF), avec l'auditeur au-dessus du joueur, orienté comme la caméra. Ils passent par un filtre passe-bas doux et un compresseur léger, qui évitent les sons qui claquent. Le volume par défaut est à 60 % :

- bruits de pas du joueur, des autres joueurs et du chat ;
- grondement des tuyères à la poupe et bourdonnement du réacteur, qui s'atténuent en s'éloignant vers la proue ;
- « bip bip » aléatoires et bruits d'ordinateur autour des consoles du cockpit ;
- mélodies des bornes d'arcade, crépitements de soudure dans la cale, grondement de la raffinerie (qu'on n'entend que dans la cale) ;
- pas feutrés sur les sols des quartiers ;
- portes coulissantes, ascenseur, notifications du chat.

Les bips, les mélodies d'arcade, les étincelles, le miaulement et le ronronnement sont synthétisés en direct (Web Audio), le reste vient des packs audio de Kenney.

## Choix techniques

- **Three.js + TypeScript + Vite.** Le rendu est en « 2D isométrique » : une caméra **orthographique** placée au vrai angle isométrique (35,26° d'élévation, 45° d'azimut) filme des modèles 3D low-poly. On garde l'aspect iso 2D sans avoir à gérer l'ordre d'affichage des sprites, avec des animations dans toutes les directions, des ombres, de l'éclairage et la rotation de la caméra par quarts de tour.
- **Performances.** Les packs Kenney sont entièrement mats, donc ils sont rendus en **Lambert** au lieu du PBR : même aspect, bien moins de calcul par pixel. Toute la géométrie immobile d'un pont (sols, coque, murs, poteaux, meubles) est fusionnée en quelques maillages : on fait **~105 appels de dessin par image sur le pont principal (ombres comprises), au lieu de ~420**. Les murs à rendre transparents devant le joueur restent individualisables grâce à un index par sommet et une petite texture de fondu. Les étoiles sont animées entièrement dans le GPU. Une réserve de 8 lumières ponctuelles, de taille fixe, évite toute recompilation de shader, et tous les shaders sont compilés avant la première image. La densité de pixels démarre à 1,5. Elle baisse si l'image passe sous ~50 i/s, et remonte jusqu'à 2 s'il reste de la marge. Le survol à la souris est traité une fois par image, et la boucle n'alloue presque plus rien (moins de pauses du ramasse-miettes).
- **Anti-clignotement.** Le fondu des murs est **tramé** (matrice de Bayer) au lieu d'être en vraie transparence. Il n'y a donc plus de tri d'objets transparents ni de bascule opaque/transparent. Les **poteaux d'angle** sont un peu plus larges et plus hauts que les murs : les dessus de murs qui se chevauchaient au même niveau causaient un z-fighting en dents de scie. L'ombre du soleil est fixe et couvre tout le vaisseau, elle ne « nage » plus quand la caméra bouge. Enfin, les faces confondues (panneaux de portes, dalles au sol) ont été décalées.
- **Multijoueur.** Un relais WebSocket minimal (`server/relay.js`) reçoit positions, messages et emotes, les valide et les rediffuse. Il est branché sur le serveur de dev de Vite et sur `server/index.js` en production. Ce n'est pas un serveur qui fait autorité : pour un POC, chaque client fait confiance aux autres. Comète (l'animal) est simulé séparément sur chaque client.

## Architecture

| Fichier | Rôle |
|---|---|
| `src/levels.ts` | **Les trois ponts** : plans ASCII (une lettre par pièce, `+` pour une porte), noms des pièces, ambiance (peinture, éclairage, pas), meubles, lumières, position de l'ascenseur. C'est ici qu'on modifie le vaisseau. |
| `src/map.ts` | Lecture d'un plan : pièces, portes, arêtes (mur / porte / ouvert). |
| `src/deck.ts` | Construit un pont : sols, murs sur les arêtes, hublots, poteaux, portes automatiques, meubles, ascenseur, réacteur, tuyères. Fusion de géométrie et fondu tramé. |
| `src/fade.ts` | Shaders de transparence tramée (par objet ou indexée pour la géométrie fusionnée). |
| `src/avatar.ts` | Personnage animé : locomotion, emotes. Partagé par le joueur local et les joueurs distants. |
| `src/looks.ts` | Catalogue des apparences (espèces, sexe, modèles, teintes, combinaisons) et fabrication des modèles correspondants (casques, sacs dorsaux). |
| `src/furniture/` | Mobilier fait main, par zone (`elite`, `workshop`, `leisure`, `cozy`), et sa boîte à outils commune (`kit.ts` : fusion, instanciation, hologrammes, écrans animés). |
| `src/recolor.ts` | Recoloration de texture pixel par pixel (aliens, combinaisons, mobilier repeint). |
| `src/icons.ts` | Icônes de l'interface (Phosphor Icons). |
| `src/player.ts` | Joueur local : clavier, suivi de chemin lissé, collisions, rythme des pas. |
| `src/remote.ts` | Joueurs distants : interpolation, animations et emotes rejouées. |
| `src/cat.ts` | Comète, le chat (petite machine à états). |
| `src/audio.ts` | Sons spatialisés ; bips, mélodies d'arcade, étincelles, miaulement et ronronnement synthétisés. |
| `src/net.ts` · `server/` | Client et relais multijoueur, vérification des billets (`server/ticket.js`), serveur de production. |
| `src/cmdr.ts` | Identité : billet du site, noms d'invités tirés de la SF. |
| `integration/elitedangereuse/` | Endpoint PHP à déposer sur elitedangereuse.fr. |
| `src/ui.ts` | Bulles au-dessus des têtes, chat, panneaux d'ascenseur et du Holo-Me, dialogues. |
| `src/pathfinding.ts` · `src/physics.ts` | A* 8 directions, dont chaque passage entre deux tuiles est validé contre les meubles (plus de chemin à travers une chaise) ; collisions cercle contre rectangles. |
| `src/camera.ts` · `src/starfield.ts` | Caméra isométrique et caméra libre (rotation, inclinaison, glissement) ; étoiles (shader). |
| `src/main.ts` | Assemblage, entrées, boucle de jeu. |
| `docs/images/` | Captures d'écran de ce README. |

## Assets (tous en CC0 / domaine public, par [Kenney](https://www.kenney.nl))

- [Space Station Kit](https://kenney.nl/assets/space-station-kit) — `public/assets/station/`
- [Mini Characters](https://kenney.nl/assets/mini-characters) — `public/assets/characters/` (12 personnages, ~30 animations)
- [Blocky Characters](https://kenney.nl/assets/blocky-characters) — `public/assets/blocky/` (robots, troll, zombie)
- [Mini Dungeon](https://kenney.nl/assets/mini-dungeon) — `public/assets/creatures/` (orque)
- [Cube Pets](https://kenney.nl/assets/cube-pets) — `public/assets/pets/` (le chat)
- [Impact Sounds](https://kenney.nl/assets/impact-sounds), [Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds), [Interface Sounds](https://kenney.nl/assets/interface-sounds) — `public/assets/sounds/`

Les licences d'origine sont copiées à côté des fichiers.

Les icônes de l'interface viennent de [Phosphor Icons](https://phosphoricons.com) (licence MIT, paquet `@phosphor-icons/core`). Seules les icônes importées dans `src/icons.ts` sont embarquées dans le build. Pour en ajouter une, il suffit de l'importer là (`@phosphor-icons/core/<graisse>/<nom>-<graisse>.svg?raw`), puis de l'utiliser avec `icon('nom')`, ou `<i data-icon="nom"></i>` dans le HTML.

## Limites connues / pistes

- Le relais ne fait pas autorité (pas de validation des déplacements), et Comète est simulé séparément sur chaque client (chacun voit « son » chat).
- Les sons sont en Ogg Vorbis : c'est parfait sur Chrome et Firefox, mais un ancien Safari peut rester muet. Une conversion en `.m4a` réglerait ça.
- Pistes : pseudo et choix du personnage dans un écran d'accueil, PNJ d'équipage avec routines, escaliers du kit en plus de l'ascenseur, plans édités dans [Tiled](https://www.mapeditor.org/).

<p align="center"><sub>o7, CMDR.</sub></p>
