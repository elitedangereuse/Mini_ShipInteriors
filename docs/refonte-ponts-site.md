# Refonte des ponts : ce que le site doit faire

Spécification pour le dépôt du site (`elitedangereuselight`), à l'attention de Mika. La refonte
des ponts du vaisseau (téléporteur au cœur de chaque pont, complexe d'entraînement dans la cale,
bibliothèque du lore, hall d'accueil, antichambre des quartiers, puis le Vestiaire des Légendes
et ses tenues de sport) se passe presque entièrement du site : le jeu est prêt, et chaque branchement ci-dessous a son repli tant que le site ne le sert
pas. Rien ne casse si le site ne bouge pas ; il manque seulement ce qu'il apporte.

## En bref

| # | Côté site | Urgence | Sans lui, le jeu… |
|---|---|---|---|
| 1 | `?live=1` sur `outils/mini-shipinteriors-site.php` : le fil « En direct » | à faire | fait défiler les seules nouvelles du bord |
| 2 | `?profile=<cmdr>` sur le même endpoint : le résumé du profil (carte Open Graph) | conseillé | lit les balises Open Graph de `profil.php`, sinon compose l'adresse d'`og-card.php` |
| 3 | Les noms des pièces dans les statistiques de fréquentation | à faire | rien : seules les étiquettes de l'admin sont fausses |
| 4 | Les tenues de sport : verser `suit.basket`, `suit.football`, `suit.marksman`, `suit.boxer` au palier de record | à faire | montre la progression au casier, mais personne ne reçoit les tenues |
| 5 | Quêtes, classements, Weekly, Chasse galactique, tâches de bord | rien à faire | — |

## 1. Le fil « En direct » : `?live=1`

Le bandeau de la salle commune (pont principal) fait défiler le fil « En direct » du site, à la
place de l'ancien tableau des classements (passé sur la Promenade, en Tableau d'honneur). On le
lit aussi en entier dans un panneau, avec un lien par nouvelle.

### La requête

`GET /outils/mini-shipinteriors-site.php?live=1`, envoyée par le navigateur du joueur (cookie de
session s'il en a un, mais **le fil est public** : un invité le voit aussi). Le jeu la renvoie
toutes les deux minutes tant qu'il est ouvert.

### La réponse

```json
{
  "status": "success",
  "live": [
    {
      "id": "adv-1834",
      "at": 1792000000000,
      "text": "CMDR Aussi a terminé l'aventure « La Route de Salomé »",
      "text_en": "CMDR Aussi completed the adventure “Salomé's Road”",
      "url": "/aventure.php?id=1834",
      "kind": "adventure"
    }
  ]
}
```

| Champ | Sens |
|---|---|
| `live` | Les nouvelles, **la plus récente d'abord**. Le jeu en garde dix ; en envoyer une vingtaine au plus |
| `id` | Identifiant stable (chaîne ou nombre), unique dans le fil |
| `at` | Date de la nouvelle : ms depuis 1970, ou date ISO 8601 (`2026-10-15T12:00:00Z`). Facultatif |
| `text` | La nouvelle en français, en **texte brut** (pas de HTML : le jeu l'écrit tel quel), une ligne, 140 caractères au plus |
| `text_en` | La même en anglais ; à défaut, le jeu anglais affiche `text` |
| `url` | Facultatif : la page dont parle la nouvelle, relative au site (`/profil.php?cmdr=…`, `/aventure.php?id=…`) ; le panneau l'ouvre dans un nouvel onglet |
| `kind` | Facultatif, libre (`adventure`, `badge`, `weekly`, `hunt`, `cards`…) : le jeu ne s'en sert pas encore |

Les nouvelles sont **celles du bloc « En direct » de la page d'accueil** : reprendre sa requête,
en sortant le texte des balises. Une réponse peut être gardée en cache une minute côté site : tous
les joueurs à bord la demandent.

Erreurs : `{"status": "error", "error": "unavailable"}` (ou tout autre corps, ou un délai de plus
de 15 s). Le jeu garde alors les dernières nouvelles reçues, ou ne montre que celles du bord.

Code côté jeu : `liveFeed` dans `src/site.ts`, `src/community-feed.ts` (ce qui défile),
`live-ticker` dans `src/furniture/community.ts` (le bandeau).

## 2. Le résumé du profil : `?profile=<cmdr>`

L'antichambre des quartiers (pont +2, là où arrive le téléporteur) montre au mur, dans un grand
cadre, **la carte Open Graph du profil** du CMDR dont ce sont les quartiers : la sienne chez soi,
celle de l'hôte quand on le visite. La lire ouvre une vue compacte (la carte, la bio ou les
compteurs, le lien « Voir le profil complet »). Le paillasson, devant la porte, dit « Bienvenue
chez CMDR … ».

### Ce que le jeu fait déjà, sans rien de neuf côté site

Dans l'ordre, jusqu'à ce que l'un réponde :

1. `?profile=` (ci-dessous) ;
2. la page du profil elle-même, `GET /profil.php?cmdr=<nom>` (`/en/profil.php` en anglais) : le
   jeu y lit les balises `og:title`, `og:description`, `og:image` et `og:url` posées par
   `og_meta_profile_tags` ;
3. à défaut, il compose `/og-card.php?cmdr=<nom>&lang=fr_FR|en_US` et `/profil.php?cmdr=<nom>`.

L'image est dessinée dans une texture : elle doit venir **de la même origine que le jeu**, ou
porter `Access-Control-Allow-Origin` (en local seulement, où le site est servi ailleurs). Le jeu
ramène toute adresse `*.elitedangereuse.fr` à son chemin pour rester sur la même origine.

`<nom>` est le nom du CMDR tel que le jeu l'affiche, sans « CMDR » (`Aussi`). Si
`ed_cmdr_query_value` attend autre chose (nom stocké, casse…), c'est une raison de plus de servir
`?profile=`, qui renvoie les bonnes adresses.

### La requête

`GET /outils/mini-shipinteriors-site.php?profile=<nom>&lang=fr_FR` (ou `en_US`), par le
navigateur du joueur, **publique** : on voit le profil d'un hôte sans être connecté. Une fois par
CMDR et par session de jeu.

### La réponse

```json
{
  "status": "success",
  "profile": {
    "name": "Aussi",
    "title": "CMDR Aussi",
    "description": "Exploratrice des confins, chasseuse de Raxxla à ses heures perdues.",
    "image": "/og-card.php?cmdr=Aussi&lang=fr_FR",
    "url": "/profil.php?cmdr=Aussi",
    "stats": { "adventures": 42, "badges": 87, "points": 15230 }
  }
}
```

| Champ | D'où le tirer |
|---|---|
| `name` | `og_card_profile_data()['name']` |
| `title`, `description` | `og:title` et `og:description` de `og_meta_profile_tags()` (la bio en texte brut, sinon les compteurs) |
| `image`, `url` | `og:image` et `og:url` (absolues ou relatives : le jeu accepte les deux) |
| `stats` | `aventures`, `badges`, `points` d'`og_card_profile_data()` ; facultatif, affiché en pastilles |

Profil inconnu : `{"status": "error", "error": "unknown"}`. Le jeu passe alors à la page du profil,
puis à ce qu'il compose.

Code côté jeu : `src/profile-card.ts` (résumé, vue compacte), `profile-frame` et
`quarters-doormat` dans `src/furniture/antechamber.ts`.

## 3. Les statistiques de fréquentation

Le relais raconte toujours au site, toutes les cinq minutes, le temps passé dans chaque pièce, avec
la même clé `<pont>:<lettre de la pièce>` (`server/site-stats.js`). Des pièces ont déménagé : si
l'admin du site donne un nom aux clés, voici les changements.

| Clé | Avant | Après |
|---|---|---|
| `0:r` | Salle de sport | *(n'existe plus)* |
| `0:d` | — | Toilettes (à la place de la salle de sport) |
| `0:w` | — | Boutique du Weekly (vitrée, au nord du hall) |
| `0:h` | — | Labo de la Chasse galactique (vitré, au nord du hall) |
| `0:e` | Salle commune | Salle commune / hall d'accueil (agrandie, avec un salon au sud) |
| `1:b` | Terrain de basket | *(n'existe plus)* |
| `1:f` | Terrain de foot | *(n'existe plus)* |
| `1:d` | Toilettes | *(n'existe plus)* |
| `1:h` | Foyer (du cinéma à la zone sportive) | Foyer (du cinéma à la galerie) |
| `1:c` | Coursive | Coursive et galerie (le téléporteur y est) |
| `1:l` | — | Bibliothèque |
| `-1:p` | Hall de la cale | Hall de la cale, agrandi jusqu'à l'ancienne soute (le téléporteur y est) |
| `-1:g` | Soute | *(n'existe plus : la cloison est tombée, c'est le hall, `-1:p`)* |
| `-1:y` | Lobby de l'arène | Lobby de l'arène (déplacé au nord-ouest du hall) |
| `-1:l` | — | Vestiaire des Légendes |
| `-1:z` | — | Hall d'entraînement |
| `-1:x` | — | Salle de sport |
| `-1:o` | — | Terrain de basket |
| `-1:f` | — | Terrain de foot |
| `-1:j` | Palier de la cale (l'ascenseur) | Palier du monte-charge, vers l'arrière-cale |
| `2:a` | Antichambre des quartiers | Antichambre des quartiers (le téléporteur y est) |

## 4. Les tenues de sport du Vestiaire des Légendes

Dans la cale, à côté du hall d'entraînement, le **Vestiaire des Légendes** affiche un maillot par
sport, floqué au nom de qui détient le record du bord, et le **casier** du joueur : pour chaque
sport, son record et la tenue de sport du Holo-Me qu'il gagne. Ces tenues ne s'achètent pas : comme
les apparences des quêtes, **c'est le site qui les verse**.

### La règle

Dans `src/economy/economy.json` (le fichier que le site relit déjà) :

```json
"sportSkins": {
  "suit.basket":   { "game": "gym-basket", "score": 2100 },
  "suit.football": { "game": "gym-foot",   "score": 2100 },
  "suit.marksman": { "game": "gym-range",  "score": 6000 },
  "suit.boxer":    { "game": "gym-punch",  "score": 5000 }
}
```

Chaque palier est un palier de crédits du même jeu (`arcade.tiers`, vérifié par
`server/economy.test.js`). Les quatre clés ont aussi un prix dans `skins` (30 000 à 40 000 CR) :
c'est leur valeur de référence, **pas une offre**.

### Ce que le site fait

1. **À l'inscription d'un score** (`POST outils/mini-shipinteriors-scores.php`, là où
   `phputils/mini_shipinteriors/credits.php` verse déjà les paliers) : si le CMDR atteint ou
   dépasse le `score` d'une règle de `sportSkins` pour ce `game`, ajouter la clé (`suit.basket`…)
   à ses apparences, une seule fois, comme une récompense de quête. Le score est déjà contrôlé
   (points par seconde) ; rien d'autre à vérifier.
2. **Rattrapage** : une fois, pour les CMDR dont le meilleur score enregistré dépasse déjà un
   palier, verser la tenue (une requête sur la table des scores suffit).
3. **Ne pas les vendre** : refuser l'achat d'une clé de `sportSkins` (`{ "skin": "suit.basket" }`)
   comme celui d'une apparence de quête. Le jeu ne propose pas l'achat (le Holo-Me dit comment la
   gagner), mais le site fait foi.

Le portefeuille (`wallet.skins`) les rend ensuite comme les autres apparences. Côté jeu, rien à
attendre : après un score qui atteint un palier, le jeu relit le portefeuille, et la tenue apparaît
au Holo-Me sans recharger (`onScoreSaved` dans `src/arcade/scores.ts`, cf. `src/main.ts`). Tant
que le site ne la verse pas, le casier dit « palier atteint, le site la verse à votre Holo-Me ».

Code côté jeu : `src/legends.ts` (le casier, les maillots), `src/furniture/legends.ts` (le
mobilier), `sportSkins` dans `src/economy/data.ts`, les tenues dans `src/looks.ts`.

## 5. Rien à changer

- **Quêtes** : `quest_list.php` ne connaît pas les pièces, seulement les étapes et les
  récompenses, qui n'ont pas bougé. Les quêtes de la salle de sport, du basket et du foot ouvrent
  maintenant les salles de la cale ; c'est le jeu qui le sait (`shared/quests.js`).
- **Classements** : le Tableau d'honneur de la Promenade lit `?rankings=crew`, comme l'ancien
  tableau de la salle commune. Les records de la salle de sport et des terrains gardent leurs
  identifiants (`gym-run`, `gym-basket`, `gym-foot`…).
- **Weekly et Chasse galactique** : les boutiques vitrées appellent `?pending=weekly|hunt` et
  `POST {kind}` comme les anciens comptoirs.
- **Tâches de bord** : des postes (`spots` dans `economy.json`) ont bougé avec le hall de la cale
  et les boutiques du hall d'accueil, mais leurs identifiants (`cale-crates-soute`, `cale-broken-soute`,
  `pp-console-machines`, `pp-spill-machines`…) ne changent pas.
