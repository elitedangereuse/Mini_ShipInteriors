# Refonte des ponts : ce que le site doit faire

Spécification pour le dépôt du site (`elitedangereuselight`), à l'attention de Mika. La refonte
des ponts du vaisseau (téléporteur au cœur de chaque pont, complexe d'entraînement dans la cale,
bibliothèque du lore, hall d'accueil, antichambre des quartiers) se passe presque entièrement du
site : le jeu est prêt, et chaque branchement ci-dessous a son repli tant que le site ne le sert
pas. Rien ne casse si le site ne bouge pas ; il manque seulement ce qu'il apporte.

## En bref

| # | Côté site | Urgence | Sans lui, le jeu… |
|---|---|---|---|
| 1 | `?live=1` sur `outils/mini-shipinteriors-site.php` : le fil « En direct » | à faire | fait défiler les seules nouvelles du bord |
| 2 | `?profile=<cmdr>` sur le même endpoint : le résumé du profil (carte Open Graph) | à faire | montre l'image `og-card.php` sans texte |
| 3 | Les noms des pièces dans les statistiques de fréquentation | à faire | rien : seules les étiquettes de l'admin sont fausses |
| 4 | Quêtes, classements, Weekly, Chasse galactique | rien à faire | — |

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

*(Rempli avec l'antichambre des quartiers : voir plus bas dans cette même PR.)*

## 3. Les statistiques de fréquentation

Le relais raconte toujours au site, toutes les cinq minutes, le temps passé dans chaque pièce, avec
la même clé `<pont>:<lettre de la pièce>` (`server/site-stats.js`). Des pièces ont déménagé : si
l'admin du site donne un nom aux clés, voici les changements.

| Clé | Avant | Après |
|---|---|---|
| `0:r` | Salle de sport | *(n'existe plus)* |
| `0:d` | — | Toilettes (à la place de la salle de sport) |
| `0:w` | — | Bureau du Weekly (vitré, dans le hall) |
| `0:h` | — | Bureau de la Chasse galactique (vitré, dans le hall) |
| `0:e` | Salle commune | Salle commune / hall d'accueil (agrandie) |
| `1:b` | Terrain de basket | *(n'existe plus)* |
| `1:f` | Terrain de foot | *(n'existe plus)* |
| `1:d` | Toilettes | *(n'existe plus)* |
| `1:h` | Foyer (du cinéma à la zone sportive) | Foyer (du cinéma à la galerie) |
| `1:c` | Coursive | Coursive et galerie (le téléporteur y est) |
| `1:l` | — | Bibliothèque |
| `-1:p` | Hall de la cale | Hall de la cale, agrandi (le téléporteur y est) |
| `-1:z` | — | Hall d'entraînement |
| `-1:x` | — | Salle de sport |
| `-1:o` | — | Terrain de basket |
| `-1:f` | — | Terrain de foot |
| `-1:j` | Palier de la cale (l'ascenseur) | Palier du monte-charge, vers l'arrière-cale |
| `2:a` | Antichambre des quartiers | Antichambre des quartiers, agrandie (le téléporteur y est) |

## 4. Rien à changer

- **Quêtes** : `quest_list.php` ne connaît pas les pièces, seulement les étapes et les
  récompenses, qui n'ont pas bougé. Les quêtes de la salle de sport, du basket et du foot ouvrent
  maintenant les salles de la cale ; c'est le jeu qui le sait (`shared/quests.js`).
- **Classements** : le Tableau d'honneur de la Promenade lit `?rankings=crew`, comme l'ancien
  tableau de la salle commune. Les records de la salle de sport et des terrains gardent leurs
  identifiants (`gym-run`, `gym-basket`, `gym-foot`…).
- **Weekly et Chasse galactique** : les bureaux vitrés appellent `?pending=weekly|hunt` et
  `POST {kind}` comme les anciens comptoirs.
