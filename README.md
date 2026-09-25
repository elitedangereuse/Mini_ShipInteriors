<h1 align="center">Mini Interior</h1>

<p align="center">
  <strong>Un vaisseau spatial isométrique et multijoueur, jouable directement dans le navigateur.</strong><br>
  Trois ponts à explorer entre CMDR, des quartiers à aménager et où recevoir, un Holo-Me pour changer d'apparence, et Comète, le chat du bord.
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
- [Quartiers personnalisables](#quartiers-personnalisables)
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
- **Multijoueur** : chaque onglet est un membre d'équipage, avec positions, emotes et chat en bulles, synchronisés par un petit relais socket.io.
- **Comptes Élite Dangereuse** : un CMDR connecté à [elitedangereuse.fr](https://elitedangereuse.fr) arrive sous son nom, avec un badge « vérifié ».
- **Holo-Me** : humain, combinaison spatiale, alien, robot ou créature, et chaque changement s'applique en direct.
- **Quartiers personnalisables** : chaque joueur a sa propre instance des quartiers du commandant. Un CMDR connecté les aménage (70 meubles et objets : lits, plantes, affiches, lampe à lave, tasse de Hutton Orbital…) et y invite qui il veut.
- **Des dizaines de meubles animés** : bornes d'arcade jouables, hologrammes, bras robotisé qui soude, aquarium, cheminée…
- **Son spatialisé** : pas, réacteur, bips des consoles, mélodies d'arcade, ronronnements.

<p align="center">
  <img src="docs/images/equipage.jpg" alt="Deux joueurs dans le salon panoramique : l'un parle dans une bulle, l'autre danse" width="100%">
  <br><em>Deux membres d'équipage dans le salon panoramique : chat en bulle, emote « danse », et Comète qui fait la sieste près du bureau.</em>
</p>

## Le vaisseau

Trois ponts, trois ambiances. Chaque pont repeint à sa façon la même palette du kit (coque et mobilier, cf. `themes` dans `src/assets.ts`), et a son propre éclairage (ciel, soleil, lumières qui vacillent) et son propre bruit de pas. Le pont principal est de loin le plus grand (~210 tuiles). La cale et le pont supérieur sont deux fois plus petits (~90 et ~110 tuiles), autour de l'ascenseur.

On se réveille dans ses quartiers, sur le pont supérieur, à deux pas du Holo-Me.

| Pont | Ambiance | Pièces |
|---|---|---|
| **Pont supérieur** · les quartiers | *cozy* : crème et bois miel, tissus, plantes, lumière chaude, pas feutrés | **quartiers du commandant**, [aménagés par chaque CMDR](#quartiers-personnalisables) (au départ : grand lit, cheminée holographique, canapé, aquarium, bureau, bibliothèque, casier à combinaisons, **Holo-Me**), cabines d'équipage (lits superposés), douches, serre hydroponique, salon panoramique (carte du système), coursive |
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

## Quartiers personnalisables

<p align="center">
  <img src="docs/images/amenagement.jpg" alt="Le mode aménagement : vue plongeante sur les quartiers, catalogue des objets à droite, une affiche en cours de pose sur un mur" width="100%">
</p>

Les quartiers du commandant (40 tuiles, là où se trouve le Holo-Me) sont **instanciés** : chaque joueur a les siens, meublés selon son aménagement, et n'y voit que ceux qui s'y trouvent avec lui. Hors des quartiers, rien ne change : on croise tout l'équipage dans la coursive.

Un CMDR connecté au site les **aménage** : dans ses quartiers, `B` ou « Aménager » ouvre le mode aménagement. La caméra passe en vue plongeante sur la cabine, les murs côté caméra s'estompent, le catalogue s'ouvre à droite.

| Action | Souris / clavier |
|---|---|
| Poser un objet | une carte du catalogue, puis un clic dans la cabine (ou glisser la carte jusqu'à sa place) ; `Maj`+clic pour en poser plusieurs |
| Déplacer | glisser l'objet (ce qui est posé dessus le suit) ; les flèches l'ajustent d'un vingtième de tuile (`Maj` : d'un quart) |
| Tourner | `R` / `Maj+R`, ou les boutons de la barre d'outils |
| Changer de variante | la barre d'outils de l'objet choisi : tissu, palette, affiche, planète du globe… |
| Retirer | `Suppr`, ou la corbeille (avec ce qui est posé dessus) |
| Annuler, rétablir | `Ctrl+Z`, `Ctrl+Y` (ou `Ctrl+Maj+Z`) |
| Terminer | `Échap`, « Terminer », ou `B` |

Le catalogue compte **70 objets** en dix catégories : le mobilier du vaisseau (lits, canapés, bureau, aquarium, cheminée, bornes d'arcade, carte galactique…), et de quoi décorer : des affiches de voyage aux couleurs d'Elite (Colonia, Jameson Memorial, Hutton Orbital, Sagittarius A*, Beagle Point, les Gardiens…), des tableaux, une horloge qui donne l'heure de l'appareil, l'écran de GalNet, un néon « o7 », une étagère, des plantes (dont un spécimen exobiologique lumineux), et des petits objets à poser sur les meubles : tasse de Hutton Orbital, lampe à lave, globe, bougies, peluche de Comète, trophée Elite, capteur thargoïde, relique des Gardiens… La galerie `/gallery.html?catalogue` les montre tous (`&variantes` : toutes leurs variantes).

Les **règles de pose** (`src/cabin/rules.ts`) : un objet tient dans la cabine, ou sur un pan de mur libre (ni porte, ni hublot, ni pilier) ; il ne traverse pas un autre objet, mais un tapis passe sous les meubles, un petit objet se pose sur le dessus d'un meuble (bureau, table basse, commode, étagère…), et une affiche peut dépasser un peu derrière le dossier d'un canapé. Devant la porte, le passage reste libre, et le Holo-Me reste accessible depuis la porte : il se déplace, mais ne se retire pas. 64 objets au plus. L'objet en main se soulève, vert s'il peut aller là, rouge sinon avec la raison ; poussé contre un mur, il glisse le long ; tout près d'un mur, il s'y colle.

L'aménagement est **enregistré sur le site** (cf. [Comptes Élite Dangereuse](#comptes-élite-dangereuse)) un peu après chaque changement, et suit le CMDR d'un appareil à l'autre. Un invité du site a les quartiers d'origine : il ne les aménage pas, mais peut être invité.

<p align="center">
  <img src="docs/images/visite.jpg" alt="Un CMDR en visite dans les quartiers aménagés d'un autre : chacun parle dans une bulle, la barre indique « Quartiers de CMDR Adam Fauster »" width="100%">
</p>

Un CMDR **invite** un membre d'équipage connecté : « Inviter » dans la barre de ses quartiers (la liste de l'équipage), ou `/inviter CMDR Nom`. L'invitation vaut une minute ; si l'invité la rejoint, où qu'il soit à bord, il est téléporté devant la porte, dans des quartiers meublés comme chez son hôte, et voit chacun de ses changements en direct. Il rentre chez lui en ressortant par la porte (ou « Rentrer chez moi »), quand l'hôte le raccompagne (depuis la liste de l'équipage), ou quand l'hôte quitte le vaisseau.

## Mobilier fait main

<p align="center">
  <img src="docs/images/mobilier.jpg" alt="La galerie de debug : tout le mobilier fait main, du lit douillet au SRV" width="100%">
  <br><em>La galerie de debug <code>/gallery.html?mobilier</code> : tous les meubles construits à la main, animés.</em>
</p>

Les meubles qui ne sont pas dans le kit sont construits en primitives Three.js dans `src/furniture/`, rangés par zone : `elite.ts` (clins d'œil à Elite Dangerous, et le Holo-Me), `workshop.ts` (la cale), `leisure.ts` (infirmerie, sport, arcade), `cozy.ts` (les quartiers), `decor.ts` (la décoration des cabines : affiches, cadres, plantes, petits objets). On les place dans `src/levels.ts` comme les modèles du kit : `{ model: 'fireplace', x, z, rot }`, et dans les quartiers depuis le catalogue du mode aménagement (`src/cabin/catalog.ts`, qui dit comment chacun se pose et ce qu'on peut en changer). Le nom du modèle est vérifié à la compilation.

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
npm test           # tests du relais (identité, origine, rediffusion, quartiers)
```

Pour tester le multijoueur, ouvre deux onglets (ou un onglet et un autre navigateur). Chaque onglet est un membre d'équipage.

Serveur autonome (un seul port pour le jeu et le relais) :

```bash
npm run build
npm start          # http://localhost:8080 (variable PORT pour changer)
```

Sans `dist/`, `npm start` ne fait que le relais : c'est le cas sur elitedangereuse.fr, où le site sert lui-même le jeu. Le contenu de `dist/` peut aussi être déposé sur un hébergement purement statique. Dans ce cas, le jeu fonctionne en **solo** : sans relais, le chat reste local.

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
| Commandes du chat | `/nom CMDR Pseudo` (invités), `/perso` (apparence au hasard), `/inviter CMDR Nom`, `/danse`…, `/aide` |
| Changer d'apparence | le **Holo-Me** des quartiers du commandant (pont supérieur) |
| Aménager ses quartiers | `B`, ou « Aménager » dans la barre des quartiers (CMDR connectés au site, cf. [Quartiers personnalisables](#quartiers-personnalisables)) |
| Inviter dans ses quartiers | « Inviter » dans la barre des quartiers, ou `/inviter CMDR Nom` ; rejoindre ou décliner une invitation reçue en haut à gauche |
| Pivoter la caméra | `R` / `Maj+R`, ou les boutons en haut à droite (d'un quart de tour ; ramène aussi la vue isométrique après la caméra libre) |
| Caméra libre | maintenir le **clic droit** ou le **clic molette** et glisser : horizontalement on tourne autour du personnage, verticalement on incline la vue (de rasante à presque de dessus) ; avec `Maj`, on fait glisser la vue, qui revient sur le personnage dès qu'il bouge |
| Zoom | molette, ou les boutons loupe |
| Son | `M` ou le bouton haut-parleur, curseur de volume (le son démarre au premier clic ou à la première touche, contrainte des navigateurs) |

## Comptes Élite Dangereuse

Un joueur connecté à [elitedangereuse.fr](https://elitedangereuse.fr) arrive dans le jeu sous son **nom de CMDR**, avec un badge « vérifié » vert. Il ne peut pas en changer (`/nom` est refusé). Les autres jouent en **invités**, avec un nom tiré au sort parmi des figures de la science-fiction (« CMDR Ripley », « CMDR Albator », « CMDR Jameson »…), qu'ils peuvent changer avec `/nom`. Un invité ne peut pas prendre le nom d'un CMDR vérifié présent à bord : il devient « … (invité) ».

### Fonctionnement

Le jeu est servi sur le domaine du site (`https://elitedangereuse.fr/outils/mini-shipinteriors`, construit avec `--base=/outils/mini-shipinteriors/`), et son relais multijoueur derrière le même nginx, sur `/ws/mini-shipinteriors`. Le cookie `ED_LOGGED_CMDR_ID` du site accompagne donc toutes les requêtes du jeu. Il est `httponly` : le JavaScript ne le lit pas, et il n'en a pas besoin.

1. À la connexion socket.io, le relais lit le cookie dans la poignée de main. C'est un jeton opaque (`cmdr.cmdr_id` en base) : il le transmet, seul, à l'endpoint du site `outils/mini-shipinteriors-cmdr.php` (repo `elitedangereuselight`).
2. L'endpoint retrouve le CMDR avec `ed_endpoint_cmdr()`, le helper du site, et répond son nom visible (`ed_cmdr_display_name()`), ou `null` pour un invité.
3. Le relais impose ce nom et marque le joueur « vérifié ». Personne ne peut se faire passer pour un autre CMDR : le nom ne vient jamais du client, et **le serveur du jeu n'a jamais accès à la base**.

Le client appelle aussi l'endpoint au chargement, pour afficher son nom avant d'être en ligne (et en solo).

Les **quartiers aménagés** passent par un second endpoint, `outils/mini-shipinteriors-cabin.php`, que seul le client appelle, avec le même cookie : `GET` rend l'aménagement du CMDR (`null` s'il n'a jamais aménagé ses quartiers) et sa date, `POST` l'enregistre (table `mini_shipinteriors_cabin`). L'écriture est réservée aux CMDR, et doit venir du site : son en-tête `Origin` est vérifié, une page tierce ne réaménage pas une cabine. Le site ne vérifie que la forme de l'aménagement (64 objets, identifiants courts, nombres finis dans le vaisseau) : le catalogue vit dans le jeu, qui écarte à la lecture ce qu'il ne connaît pas. Le relais n'y touche pas : c'est le client d'un CMDR vérifié qui lui envoie son aménagement, pour le montrer à ses invités.

Tant que le site n'a pas répondu, les quartiers ne s'aménagent pas : on écraserait ceux qu'il garde. S'il ne répond pas du tout, l'aménagement est gardé dans le navigateur, daté ; un envoi en échec y laisse aussi une copie, et il est réessayé. À la réponse suivante du site, cette copie l'emporte si elle est plus récente, et lui est envoyée. Chaque page du jeu numérote ses envois : un envoi plus ancien arrivé en retard (page fermée en plein enregistrement) n'écrase pas le plus récent.

Les demandes de compte et de quartiers partent dès le chargement de la page, pendant celui des modèles, et on ne les attend au plus que 3 s une fois les modèles chargés.

Le cookie du site n'est pas `SameSite` : le relais n'accepte que les connexions de la même origine (en-tête `Origin` comparé au `Host`). Sinon, une page d'un autre site pourrait ouvrir une socket avec le cookie d'un visiteur et parler en son nom.

### Mise en production

Le jeu est un sous-module du repo `elitedangereuselight`, dans `outils/mini-shipinteriors`. Ce repo contient les endpoints, la table des quartiers (`docker/tables/mini_shipinteriors.sql`, à jouer une fois en prod), la conf nginx (`scripts/nginx/mini-shipinteriors-*.conf`), et ses scripts de déploiement envoient le jeu construit et le relais (cf. son README).

`dependencies` ne contient que ce que le relais charge (socket.io) : le client (three, icônes, socket.io-client) est intégré au build par Vite, d'où `devDependencies`.

Le relais : `npm ci --omit=dev && npm start`, avec ces variables :

| Variable | Rôle |
|---|---|
| `ED_CMDR_URL` | endpoint du site, par son **adresse publique** : `https://elitedangereuse.fr/outils/mini-shipinteriors-cmdr.php`. Sur `localhost` ou `127.0.0.1`, le site se croit en local et connecte d'office tout visiteur avec le CMDR de dev : avec `NODE_ENV=production`, le relais refuse alors de démarrer. Les redirections ne sont pas suivies (le cookie ne doit pas partir ailleurs) |
| `PORT`, `BIND_HOST` | écoute du relais (8080 et toutes les interfaces par défaut ; en prod, `127.0.0.1` derrière nginx) |
| `LOG_LABEL` | étiquette ajoutée à chaque ligne de log, horodatée (ex. `prod`, `preprod`). Les erreurs (site injoignable, plantage) vont sur la sortie d'erreur, le reste (arrivées, départs) sur la sortie standard |
| `WS_PATH` | chemin de la socket (défaut `/ws/mini-shipinteriors`). S'il change, rebâtir le client avec `VITE_WS_PATH` et adapter nginx |

Au build : `VITE_WS_PATH` (chemin de la socket), `VITE_ED_CMDR_URL` (endpoint du compte, défaut `/outils/mini-shipinteriors-cmdr.php`) et `VITE_ED_CABIN_URL` (endpoint des quartiers, défaut `/outils/mini-shipinteriors-cabin.php`).

Sans `ED_CMDR_URL`, ou si le site ne répond pas, le jeu fonctionne quand même : tout le monde est invité.

### En local

Avec le site en local (Docker, `http://localhost:8080`), `npm run dev` suffit : les cookies ne dépendent pas du port, et le site local connecte d'office son CMDR de dev. Le relais de dev interroge `http://localhost:8080/outils/mini-shipinteriors-cmdr.php`, et le serveur de dev y renvoie aussi les requêtes du client, quartiers compris (variable `ED_SITE_URL` pour une autre adresse). La table des quartiers se crée à la main dans le conteneur : `docker exec -i elitedangereuse mysql -u root -proot lavermv500 < docker/tables/mini_shipinteriors.sql`.

Sans le site, `http://localhost:5173/?cmdr=Adam%20Fauster` simule un CMDR connecté (serveur de dev uniquement) ; ses quartiers sont alors gardés dans le navigateur. Pour essayer les visites, ouvrir deux onglets sous deux noms différents.

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
- **Performances.** Les packs Kenney sont entièrement mats, donc ils sont rendus en **Lambert** au lieu du PBR : même aspect, bien moins de calcul par pixel. Toute la géométrie immobile d'un pont (sols, coque, murs, poteaux, meubles) est fusionnée en quelques maillages : on fait **~105 appels de dessin par image sur le pont principal (ombres comprises), au lieu de ~420**. Les meubles des quartiers sont fusionnés à part, et refusionnés à chaque changement d'aménagement (un meuble déplacé n'est pas reconstruit) : ~6 appels de dessin de plus sur le pont supérieur. Les murs à rendre transparents devant le joueur restent individualisables grâce à un index par sommet et une petite texture de fondu. Les étoiles sont animées entièrement dans le GPU. Une réserve de 8 lumières ponctuelles, de taille fixe, évite toute recompilation de shader, et tous les shaders sont compilés avant la première image. La densité de pixels démarre à 1,5. Elle baisse si l'image passe sous ~50 i/s, et remonte jusqu'à 2 s'il reste de la marge. Le survol à la souris est traité une fois par image, et la boucle n'alloue presque plus rien (moins de pauses du ramasse-miettes).
- **Anti-clignotement.** Le fondu des murs est **tramé** (matrice de Bayer) au lieu d'être en vraie transparence. Il n'y a donc plus de tri d'objets transparents ni de bascule opaque/transparent. Les **poteaux d'angle** sont un peu plus larges et plus hauts que les murs : les dessus de murs qui se chevauchaient au même niveau causaient un z-fighting en dents de scie. L'ombre du soleil est fixe et couvre tout le vaisseau, elle ne « nage » plus quand la caméra bouge. Enfin, les faces confondues (panneaux de portes, dalles au sol) ont été décalées.
- **Multijoueur.** Un relais socket.io minimal (`server/relay.js`) reçoit positions, messages et emotes, les valide et les rediffuse. socket.io apporte la reconnexion automatique et le repli en long polling quand le WebSocket ne passe pas. Le relais est branché sur le serveur de dev de Vite et sur `server/index.js` en production. Ce n'est pas un serveur qui fait autorité : pour un POC, chaque client fait confiance aux autres. Comète (l'animal) est simulé séparément sur chaque client. Pour les quartiers, en revanche, le relais tranche : il garde l'aménagement de chaque CMDR vérifié (forme vérifiée par `server/cabin.js`), n'ouvre des quartiers que sur invitation, transmet leurs changements aux seuls visiteurs, et renvoie ceux-ci chez eux quand leur hôte part. Chaque joueur porte l'instance des quartiers où il se trouve (`cabin`, l'id de son hôte) ; chaque client en déduit qui il voit.
- **Chargement à la demande.** Le mode aménagement (éditeur, règles de pose, vignettes du catalogue, ~25 ko) n'est téléchargé qu'à sa première ouverture. Les vignettes sont rendues à la demande dans un petit contexte WebGL hors écran, libéré une fois la file vidée.

## Architecture

| Fichier | Rôle |
|---|---|
| `src/levels.ts` | **Les trois ponts** : plans ASCII (une lettre par pièce, `+` pour une porte), noms des pièces, ambiance (peinture, éclairage, pas), meubles, lumières, position de l'ascenseur, pièce des quartiers personnalisables. C'est ici qu'on modifie le vaisseau. |
| `src/map.ts` | Lecture d'un plan : pièces, portes, arêtes (mur / porte / ouvert). |
| `src/deck.ts` · `src/merge.ts` | Construit un pont : sols, murs sur les arêtes, hublots, poteaux, portes automatiques, meubles, ascenseur, réacteur, tuyères. Fusion de géométrie et fondu tramé (`merge.ts`, partagé avec les quartiers). |
| `src/cabin/` | **Quartiers personnalisables** : catalogue des objets (`catalog.ts`), aménagement et sa normalisation (`layout.ts`), construction et fusion dans le pont (`view.ts`), règles de pose (`rules.ts`), mode aménagement (`editor.ts`), vignettes (`thumbs.ts`), barre des quartiers et invitations (`hud.ts`), enregistrement sur le site (`storage.ts`). |
| `src/fade.ts` | Shaders de transparence tramée (par objet ou indexée pour la géométrie fusionnée). |
| `src/avatar.ts` | Personnage animé : locomotion, emotes. Partagé par le joueur local et les joueurs distants. |
| `src/looks.ts` | Catalogue des apparences (espèces, sexe, modèles, teintes, combinaisons) et fabrication des modèles correspondants (casques, sacs dorsaux). |
| `src/furniture/` | Mobilier fait main, par zone (`elite`, `workshop`, `leisure`, `cozy`, `decor`), et sa boîte à outils commune (`kit.ts` : fusion, instanciation, hologrammes, écrans animés). |
| `src/recolor.ts` | Recoloration de texture pixel par pixel (aliens, combinaisons, mobilier repeint). |
| `src/icons.ts` | Icônes de l'interface (Phosphor Icons). |
| `src/player.ts` | Joueur local : clavier, suivi de chemin lissé, collisions, rythme des pas. |
| `src/remote.ts` | Joueurs distants : interpolation, animations et emotes rejouées. |
| `src/cat.ts` | Comète, le chat (petite machine à états). |
| `src/audio.ts` | Sons spatialisés ; bips, mélodies d'arcade, étincelles, miaulement et ronronnement synthétisés. |
| `src/net.ts` · `server/` | Client et relais multijoueur (socket.io), reconnaissance du CMDR par le site (`server/cmdr.js`), aménagements des quartiers (`server/cabin.js`), serveur de production, tests (`server/relay.test.js`). |
| `src/cmdr.ts` | Identité : CMDR connecté au site, noms d'invités tirés de la SF. |
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

- Le relais ne fait pas autorité (pas de validation des déplacements), et Comète est simulé séparément sur chaque client (chacun voit « son » chat, qui le suit aussi en visite).
- Deux onglets d'un même CMDR aménagent les mêmes quartiers : le dernier enregistrement l'emporte, et l'autre onglet ne voit le changement qu'au rechargement.
- Une visite ne survit pas à une reconnexion au relais : le visiteur rentre chez lui.
- Les sons sont en Ogg Vorbis : c'est parfait sur Chrome et Firefox, mais un ancien Safari peut rester muet. Une conversion en `.m4a` réglerait ça.
- Pistes : pseudo et choix du personnage dans un écran d'accueil, PNJ d'équipage avec routines, escaliers du kit en plus de l'ascenseur, plans édités dans [Tiled](https://www.mapeditor.org/), s'asseoir sur les canapés et fauteuils des quartiers, objets gagnés en jeu à ajouter au catalogue.

<p align="center"><sub>o7, CMDR.</sub></p>
