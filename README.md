# 🎹 Entraînement aux intervalles

Petite application web pour apprendre à reconnaître les intervalles musicaux à l'oreille.

**➡️ [Essayer l'application](https://maximeansquer.github.io/interval-trainer/)**

## Fonctionnement

- Deux notes sont jouées avec un son de type piano (Web Audio API) ; il faut cliquer sur l'intervalle correspondant.
- **Progression** : on commence avec deux intervalles simples (quinte juste et octave). Un nouvel intervalle se débloque quand tous les intervalles en cours sont bien maîtrisés (≥ 80 % de réussite récente).
- **Répétition adaptative** : les intervalles sur lesquels on se trompe le plus reviennent plus souvent.
- **Chansons de référence** : en cas d'erreur, une liste de chansons célèbres commençant par cet intervalle est proposée (sources : [Musicca](https://www.musicca.com/interval-song-chart), [EarMaster](https://www.earmaster.com/products/free-tools/interval-song-chart-generator.html)). On en choisit une comme référence — ou on ajoute la sienne — et c'est ensuite elle qui est rappelée à chaque nouvelle erreur.
- **Historique** conservé dans le navigateur (localStorage), avec statistiques par intervalle et bouton de réinitialisation.
- Réglage de la direction des intervalles : ascendant, descendant ou les deux.

## Développement

Aucune dépendance ni build : ouvrir `index.html` dans un navigateur, ou servir le dossier avec n'importe quel serveur statique.

```sh
python3 -m http.server 8000
```

Déployé automatiquement sur GitHub Pages depuis la branche `main`.
