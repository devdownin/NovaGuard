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

### Sécurité
- Correction de 7 vulnérabilités modérées (`npm audit` : 7 → 0) : `fast-xml-parser < 5.7.0` ([GHSA-gh4j-gqv2-49f6](https://github.com/advisories/GHSA-gh4j-gqv2-49f6), injection XML/CDATA), atteint via `@react-native-community/cli-*` ≤ 20.1.1.

### Modifié
- Dépendances de développement à jour : `@react-native-community/cli*` 20.0.0 → 20.2.0, `jest` 29 → 30, `@types/jest` 29 → 30.
- CI sur Node 22 (au lieu de 20) et `engines.node` relevé à `>=20.19.4`, minimum exigé par `@react-native-community/cli` 20.2.0.
- Renommage du projet « Sentinelle » → **NovaGuard** (nom affiché, `applicationId` Android `com.novaguard`, dépôt, clés de stockage local).
- La détection déclenchée par le timer factice a été retirée ; l'historique et le statut REC sont maintenant pilotés par de vraies détections.

### Connu
- L'alignement de la zone de détection sur l'aperçu caméra repose sur une hypothèse de recadrage carré centré, non calibrée sur un appareil réel (voir la feuille de route du README).
- Plusieurs dépendances restent volontairement en deçà de leur dernière majeure (VisionCamera 4 et non 5, ESLint 8, TypeScript 5, Babel 7…). Les raisons vérifiées sont détaillées dans [`CONTRIBUTING.md`](CONTRIBUTING.md#dépendances--ce-qui-est-volontairement-figé) — le verrou principal est `vision-camera-resize-plugin`, sans version compatible Nitro Modules.

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
