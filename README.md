# Carnet de sèche

App web pour suivre une sèche depuis son téléphone : repas (liste, texte libre, voix, photo), séances de musculation avec un corps anatomique qui se colore selon les séries, poids tendance et projection vers l'objectif.

- Les données restent dans le navigateur du téléphone (export et import dans Réglages).
- L'analyse par Claude utilise la clé API de l'utilisateur, gardée sur l'appareil.
- S'installe sur l'écran d'accueil et fonctionne hors connexion.

Mettre à jour le SDK et le lecteur de codes-barres embarqués : `npm install && npm run vendor`.

Photos d'exercices : [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (domaine public, voir `licenses/`).

Dessin anatomique adapté de [@mjcdev/react-body-highlighter](https://www.npmjs.com/package/@mjcdev/react-body-highlighter) (licence MIT, voir `licenses/`).

Scanner de code-barres : valeurs nutritionnelles d'[Open Food Facts](https://world.openfoodfacts.org) (base ouverte, licence ODbL), lecture du code par [ZXing](https://github.com/zxing-js/library) (licence Apache-2.0, voir `licenses/`).
