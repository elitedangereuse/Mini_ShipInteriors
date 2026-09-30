# Suivi des tâches

Les tâches de Mini Interior se gèrent dans le projet GitHub « Mini Interior »
de l'organisation : https://github.com/orgs/elitedangereuse/projects/6/views/2
(vue tableau « TO DO »). Il n'y a plus de roadmap dans le dépôt.

Colonnes (champ `Status`) : `Idées`, `À faire`, `En cours`, `À tester`, `Bug`,
`Terminé`. Une tâche commencée passe en `En cours`, puis en `À tester` une fois
livrée ; c'est un humain qui la passe en `Terminé` après essai en jeu.

La plupart des cartes sont des brouillons (draft issues) ; les bugs sont des
issues du dépôt `elitedangereuse/Mini_ShipInteriors`.

En session cloud (Claude Code sur le web), le tableau est inaccessible (GraphQL
et API des projets d'organisation bloqués) : ne pas essayer de le lire ni de le
mettre à jour, travailler directement sur la tâche demandée.

## Lire et mettre à jour le tableau

Il faut `gh` connecté avec le scope `project`
(`gh auth refresh -s project` si besoin). Les versions récentes de `gh`
proposent `gh project item-list 6 --owner elitedangereuse` ; sinon, l'API
GraphQL marche partout :

```sh
# Lister les cartes avec leur colonne
gh api graphql -f query='query{organization(login:"elitedangereuse"){projectV2(number:6){
  items(first:100){nodes{id
    fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name}}
    content{... on DraftIssue{title body} ... on Issue{title number url}}}}}}}'

# Changer la colonne d'une carte (ITEM_ID = PVTI_… donné par la requête ci-dessus)
gh api graphql -f query='mutation{updateProjectV2ItemFieldValue(input:{
  projectId:"PVT_kwDOB4IjQs4BlL_3", itemId:"ITEM_ID",
  fieldId:"PVTSSF_lADOB4IjQs4BlL_3zhj50Hc",
  value:{singleSelectOptionId:"OPTION_ID"}}){projectV2Item{id}}}'

# Ajouter une carte brouillon (elle arrive sans colonne : la placer ensuite)
gh api graphql -f query='mutation{addProjectV2DraftIssue(input:{
  projectId:"PVT_kwDOB4IjQs4BlL_3", title:"…", body:"…"}){projectItem{id}}}'
```

Identifiants des colonnes (`OPTION_ID`) :

| Colonne   | OPTION_ID  |
|-----------|------------|
| Idées     | `c1d938ad` |
| À faire   | `88927aa9` |
| En cours  | `97c87b72` |
| À tester  | `bee3feac` |
| Bug       | `10e1af7c` |
| Terminé   | `b15e9f8e` |

Si une colonne est ajoutée ou renommée, ces identifiants changent : les relire
avec
`gh api graphql -f query='query{organization(login:"elitedangereuse"){projectV2(number:6){field(name:"Status"){... on ProjectV2SingleSelectField{id options{id name}}}}}}'`
et mettre ce tableau à jour.

# Assets Kenney

`assets/` contient la collection complète des packs de Kenney (achetée, tout en
CC0) : `3D assets/` (Furniture Kit, Space Station Kit, Modular Space Kit, Mini
Characters, Cube Pets…), `2D assets/`, `Audio/`, `Icons/`, `UI assets/`, etc.
`assets/assets.json` indexe chaque pack et ses fichiers, et `Overview.html`
permet de parcourir les aperçus.

Quand il manque un modèle, un son, une icône ou une texture, piocher d'abord
dans ce dossier avant de dessiner l'objet en code ou de chercher ailleurs.
C'est une réserve source : le jeu ne la sert pas. Copier (ou convertir via un
script de `scripts/`, cf. `import-kenney-furniture.mjs`) uniquement les
fichiers utiles vers `public/assets/`, et ne jamais importer `assets/`
directement depuis `src/`.
