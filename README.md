# Carnet de sèche

App web pour suivre une sèche depuis son téléphone : repas (liste, texte libre, voix, photo), séances de musculation avec un corps anatomique qui se colore selon les séries, poids tendance et projection vers l'objectif.

- Les données restent dans le navigateur du téléphone (export et import dans Réglages).
- L'analyse par Claude utilise la clé API de l'utilisateur, gardée sur l'appareil.
- S'installe sur l'écran d'accueil et fonctionne hors connexion.

Mettre à jour le SDK embarqué : `npm install && npm run vendor`.

Dessin anatomique adapté de [@mjcdev/react-body-highlighter](https://www.npmjs.com/package/@mjcdev/react-body-highlighter) (licence MIT, voir `licenses/`).
