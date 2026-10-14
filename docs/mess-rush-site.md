# MESS RUSH : ce que le site doit faire

Spécification pour le dépôt du site (`elitedangereuselight`), à l'attention de Mika. Elle décrit
ce que le relais du jeu enverra et ce qu'il attend en retour. Le reste de la conception est dans
[`mess-rush.md`](mess-rush.md).

Le modèle est l'endpoint de la zone thargoïde, `outils/mini-shipinteriors-salvage.php`. Le relais
appelle déjà celui-là de la même façon (`postSalvageResult`, `server/site.js`).

## En bref

- Un nouvel endpoint : `outils/mini-shipinteriors-messrush.php`.
- Une nouvelle table : `mini_shipinteriors_messrush`.
- Une nouvelle activité dans `mini_shipinteriors_weekly` : `messrush`.
- Les règles du jeu :
  - une victoire est une médaille de bronze au moins ;
  - la première victoire de la semaine d'un CMDR donne un booster de Cartes Dangereuses ;
  - les victoires suivantes donnent des crédits selon la médaille, 5 payées par jour au plus ;
  - une partie ne paie jamais deux fois le même CMDR ;
  - une défaite ne consomme rien.
- Ce booster est **distinct** de celui de la zone thargoïde : gagner l'un ne prive pas de l'autre.

## La requête du relais

`POST /outils/mini-shipinteriors-messrush.php`, envoyée par le relais seul, une par CMDR et par
partie.

| En-tête | Valeur |
|---|---|
| `X-Relay-Key` | `MSI_RELAY_SECRET` (`dev-local` en local, comme pour la zone) |
| `Cookie` | `ED_LOGGED_CMDR_ID=…`, le cookie du joueur à payer |
| `Content-Type`, `Accept` | `application/json` |

Corps :

```json
{
  "game": "9f2c4e1a7b3d5c60",
  "version": 1,
  "startedAt": 1792000000000,
  "endedAt": 1792000301000,
  "duration": 301,
  "players": 3,
  "score": 412,
  "medal": "silver",
  "won": true,
  "served": 11,
  "expired": 2,
  "bestCombo": 6
}
```

| Champ | Sens |
|---|---|
| `game` | Identifiant de la partie : 16 caractères hexadécimaux, tirés au hasard par le relais |
| `startedAt`, `endedAt` | Début et fin du service, en ms depuis 1970, horloge du relais. **`endedAt` fait foi pour la semaine** |
| `duration` | Durée du service en secondes |
| `players` | Joueurs au départ, de 1 à 4 |
| `medal` | `none`, `bronze`, `silver` ou `gold` |
| `won` | `true` si et seulement si `medal` n'est pas `none` |
| `served`, `expired`, `bestCombo` | Pour le contrôle et un futur classement |

Le relais peut renvoyer la même requête jusqu'à trois fois de plus (après 5 s, 30 s, puis
2 min) s'il n'a pas eu de réponse ou s'il a reçu une erreur 5xx. La réponse doit donc être
**idempotente** (cf. plus bas).

## Les contrôles

À refuser avec `422 {"status":"error","error":"invalid"}` :

- `game` n'a pas le bon format ;
- `won` ne correspond pas à `medal` ;
- `players` sort de 1 à 4 ;
- `duration` sort de 90 % à 120 % de `messRush.service` (dans `economy.json`) ;
- `endedAt` est dans le futur de plus de 60 s, ou date de plus de 15 min ;
- `endedAt - startedAt` ne correspond pas à `duration` (à 5 s près) ;
- `score`, `served`, `expired` sont négatifs ou invraisemblables (par exemple, `served` supérieur
  à `duration / 8`).

Les autres refus :

- clé absente ou fausse : `401 {"error":"key"}` ;
- cookie absent ou CMDR introuvable : `403 {"error":"cmdr"}`.

## La semaine

```
week_start = le dernier jeudi à RESET_HOUR (fuseau RESET_TZ) ≤ endedAt
```

- **Le jour est fixé : le jeudi.** L'heure et le fuseau ne sont **pas encore décidés**. Ils
  doivent être réglables sans toucher au code, et lus dans `economy.json` →
  `messRush.reset.hour` et `messRush.reset.tz`.
- Tant qu'ils valent `null`, on prend la bascule actuelle de la boutique de boosters (jeudi
  7 h UTC). C'est une valeur provisoire.
- La semaine dépend de `endedAt`, pas d'un délai de 7 jours depuis la dernière victoire, ni de
  l'heure de réception. Une partie finie à 6 h 59 et reçue à 7 h 01 compte pour la semaine qui
  s'achève.

## Une seule transaction

```
BEGIN
1. INSERT INTO mini_shipinteriors_messrush (game, cmdr_id, …) — clé primaire (game, cmdr_id)
   → doublon : rendre la ligne déjà enregistrée, avec "already": true, et s'arrêter (COMMIT).
2. won = false → reward = 'none'.
3. won = true :
   a. INSERT dans mini_shipinteriors_weekly (cmdr_id, semaine = week_start, activité 'messrush')
      — la clé primaire empêche un second booster la même semaine.
      → inséré : verser messRush.boosters booster(s), comme pour la zone thargoïde ;
        reward = 'booster' ; crédits seulement si messRush.firstWinCredits = true.
   b. déjà présent (booster de la semaine déjà pris) :
      → compter les lignes reward = 'credits' du CMDR sur le jour de endedAt (jour de Paris,
        comme les autres plafonds) ;
      → sous messRush.daily : créditer messRush.credits[medal] au portefeuille
        (mini_shipinteriors_wallet) ; reward = 'credits' ;
      → sinon : reward = 'capped', rien de versé.
4. UPDATE de la ligne : reward, boosters, earned.
COMMIT
```

Table proposée (à adapter aux conventions du site) :

```sql
CREATE TABLE IF NOT EXISTS mini_shipinteriors_messrush (
  game        CHAR(16)     NOT NULL,
  cmdr_id     INT          NOT NULL,
  ended_at    DATETIME(3)  NOT NULL,
  week_start  DATETIME     NOT NULL,
  players     TINYINT      NOT NULL,
  score       INT          NOT NULL,
  medal       ENUM('none','bronze','silver','gold') NOT NULL,
  won         TINYINT(1)   NOT NULL,
  served      SMALLINT     NOT NULL,
  expired     SMALLINT     NOT NULL,
  best_combo  SMALLINT     NOT NULL,
  reward      ENUM('none','booster','credits','capped') NOT NULL DEFAULT 'none',
  boosters    TINYINT      NOT NULL DEFAULT 0,
  earned      INT          NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (game, cmdr_id),
  KEY by_cmdr_day (cmdr_id, ended_at)
);
```

À jouer en production comme les autres tables (idempotent), dans
`docker/tables/mini_shipinteriors.sql` ou un fichier à part.

## La réponse

Pour un succès, ou pour une partie déjà enregistrée (`already: true`), on renvoie
`200` :

```json
{
  "status": "success",
  "reward": "booster",
  "boosters": 1,
  "earned": 0,
  "balance": 184200,
  "already": false,
  "week": "2026-10-15T07:00:00Z"
}
```

| `reward` | Ce que le joueur verra |
|---|---|
| `booster` | « Première victoire de la semaine ! Booster de cartes attribué : il vous attend sur le site. » |
| `credits` | « Victoire ! Vous gagnez 2 000 CR. », avec le solde |
| `capped` | « Plafond du jour atteint : cette victoire ne rapporte pas de crédits. » |
| `none` | Rien (service raté) |

- Le jeu n'affiche **que** ce que cette réponse confirme. Si elle n'arrive jamais, il dit que la
  récompense n'a pas été confirmée et donne le code de partie, pour qu'un administrateur puisse
  la retrouver dans la table.
- Le booster doit être réellement versé au compte, comme ceux de la zone thargoïde (on l'ouvre
  ensuite sur le site ou au comptoir de Ludo). Le jeu ne simule rien.

## `economy.json`

Le jeu ajoute cette section (le build la copie dans `dist/`, où le site la lit déjà) :

```json
"messRush": {
  "service": 300,
  "credits": { "bronze": 1000, "silver": 2000, "gold": 3000 },
  "daily": 5,
  "boosters": 1,
  "firstWinCredits": false,
  "reset": { "day": "thursday", "hour": null, "tz": null }
}
```

## Ce qui disparaît

L'ancienne cuisine solo ne demandera plus la paie `kitchen` (600 CR par plat). La clé `kitchen`
reste dans `economy.json` tant que le site la lit ; Mika pourra retirer ce travail de
`credits.php` quand MESS RUSH sera en ligne, puis on enlèvera la clé.

## Cas à tester côté site

1. Première victoire de la semaine : un booster, 0 crédit, une ligne `weekly` `messrush`.
2. Deuxième victoire, même semaine : les crédits de la médaille, le solde mis à jour.
3. Sixième victoire payée du même jour : `capped`, rien de versé.
4. Défaite d'abord, puis victoire, même semaine : la victoire donne le booster.
5. Même requête envoyée deux fois, ou deux fois en même temps : une seule ligne, un seul
   versement ; la seconde réponse a `already: true` et les mêmes chiffres.
6. Partie finie à 6 h 59 un jeudi, reçue à 7 h 01 : elle compte pour la semaine précédente.
7. Partie finie à 7 h 01 un jeudi, alors que le CMDR a déjà son booster de la semaine précédente :
   nouveau booster.
8. Booster de la zone thargoïde déjà pris cette semaine : MESS RUSH donne quand même le sien.
9. Clé fausse : 401. Cookie d'invité : 403. Durée de 60 s : 422.
10. Changer `reset.hour` dans `economy.json` déplace la bascule sans autre changement.
