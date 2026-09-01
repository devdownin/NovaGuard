# Changelog

Tous les changements notables de ce projet sont documentés dans ce fichier.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [Non publié]

### Ajouté
- Flux caméra réel (`react-native-vision-camera`) à la place du placeholder de l'écran Surveillance.
- Détection de personnes/animaux sur l'appareil via un modèle TensorFlow Lite embarqué (SSD MobileNet V1, COCO), avec `react-native-fast-tflite` et `vision-camera-resize-plugin` dans un frame processor dédié.
- Permission caméra réelle (demandée depuis l'onboarding et Setup → Confidentialité, au lieu d'être simulée).
- Sélection du device caméra (avant/arrière, tentative grand-angle pour « Arrière (0,5×) ») et sensibilité de détection reliées aux vrais réglages.
- Workflow CI (GitHub Actions) : types, lint et tests sur chaque push/pull request vers `main`.
- Icône d'application (Android adaptive + legacy, iOS) remplaçant l'icône par défaut de React Native.
- Écran de démarrage animé (viseur pulsant, marque, trois piliers du produit, illustration de maison la nuit) affiché pendant l'hydratation de l'état.
- Détection de visages (ML Kit via `react-native-vision-camera-face-detector`) et zoom automatique cinématique : gros plan progressif sur le visage, maintien 4 s, puis retour sur la ou les personnes en entier. Réglage « Zoom auto sur les visages » dans Setup → Détection.
- Tests unitaires de la géométrie de cadrage (`__tests__/framing.test.ts`) : magnification, recentrage, bornes de panoramique.

### Modifié
- Renommage du projet « Sentinelle » → **NovaGuard** (nom affiché, `applicationId` Android `com.novaguard`, dépôt, clés de stockage local).
- La détection déclenchée par le timer factice a été retirée ; l'historique et le statut REC sont maintenant pilotés par de vraies détections.

### Connu
- L'alignement de la zone de détection sur l'aperçu caméra repose sur une hypothèse de recadrage carré centré, non calibrée sur un appareil réel (voir la feuille de route du README).
- Le zoom auto s'appuie sur ce même cadrage, plus l'hypothèse que le mode `autoMode` du détecteur de visages renvoie des coordonnées dans l'espace de la fenêtre qu'on lui passe. La géométrie est testée unitairement, mais la correspondance avec l'aperçu réel reste à confirmer sur appareil.

### À venir
- Enregistrement vidéo réel et gestion du stockage (voir la feuille de route du README).

## [1.0.0] - 2026-09-01

### Ajouté
- Écrans Surveillance, Historique et Setup, avec navigation par onglets.
- Simulation de détection (personnes/animaux) avec superposition à l'écran et journal d'événements.
- Filtres et période dans l'Historique ; panneau de détail vidéo avec suppression confirmée.
- Réglages de surveillance, détection, enregistrement, stockage et notifications, en sections repliables.
- Écran de premier lancement avec demande progressive des permissions.
- Section « À propos » : version, licence, lien vers le dépôt, licences tierces.
- Persistance locale des réglages, permissions et de l'historique (`AsyncStorage`).

[Non publié]: https://github.com/devdownin/NovaGuard/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/devdownin/NovaGuard/releases/tag/v1.0.0
