# NovaGuard

Caméra de surveillance intelligente, locale et open source. NovaGuard transforme un smartphone Android en caméra de détection de personnes et d'animaux — toute la détection et l'enregistrement restent sur l'appareil, rien n'est envoyé vers un serveur.

[![CI](https://github.com/devdownin/NovaGuard/actions/workflows/ci.yml/badge.svg)](https://github.com/devdownin/NovaGuard/actions/workflows/ci.yml)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

## Fonctionnalités

- **Surveillance** — flux caméra en direct, indicateur d'état, démarrage/arrêt en un geste, dernières statistiques (dernière détection, détections du jour, espace disponible).
- **Détection sur l'appareil** — personnes et animaux, reconnus en local par un modèle TensorFlow Lite (SSD MobileNet V1, COCO) tournant sur le flux caméra ; zone de détection et niveau de confiance affichés en surimpression, événement ajouté à l'historique automatiquement.
- **Historique** — événements enregistrés sous forme de cartes, filtrables par type et par période, avec détail complet (lecture, confiance, taille, suppression) en panneau.
- **Setup** — réglages de surveillance, détection, enregistrement, stockage et notifications regroupés par sections repliables ; la sensibilité et le seuil de confiance pilotent directement le pipeline de détection.
- **Confidentialité par conception** — traitement 100 % local, y compris la détection ; réglages, permissions et historique sont stockés uniquement sur l'appareil (`AsyncStorage`), jamais transmis.

> La détection tourne réellement sur l'appareil (caméra + TFLite), mais rien n'est encore écrit sur disque : pas d'enregistrement vidéo réel pour l'instant — voir [Feuille de route](#feuille-de-route). L'alignement visuel de la zone de détection avec l'aperçu caméra n'a pas pu être calibré sur un vrai appareil dans cet environnement de build ; à vérifier en priorité en conditions réelles.

## Stack technique

- [React Native](https://reactnative.dev) (CLI *bare*, sans Expo) — Android
- TypeScript
- [react-native-vision-camera](https://github.com/mrousavy/react-native-vision-camera) pour le flux caméra et les frame processors
- [react-native-fast-tflite](https://github.com/mrousavy/react-native-fast-tflite) pour l'inférence TensorFlow Lite embarquée (modèle `assets/models/coco-ssd-mobilenet-v1.tflite`, SSD MobileNet V1 quantifié, licence Apache-2.0)
- [vision-camera-resize-plugin](https://github.com/mrousavy/vision-camera-resize-plugin) et [react-native-worklets-core](https://github.com/margelo/react-native-worklets-core) pour le traitement des frames sur un thread dédié
- [react-native-svg](https://github.com/software-mansion/react-native-svg), [react-native-linear-gradient](https://github.com/react-native-linear-gradient/react-native-linear-gradient), [@react-native-community/slider](https://github.com/callstack/react-native-slider)
- [@react-native-async-storage/async-storage](https://github.com/react-native-async-storage/async-storage) pour la persistance locale
- Police [Inter](https://rsms.me/inter/) (SIL OFL 1.1)

## Démarrage

Prérequis : suivre le guide [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) de React Native pour Android (JDK, Android Studio/SDK, un émulateur ou un appareil connecté).

```sh
git clone https://github.com/devdownin/NovaGuard.git
cd NovaGuard
npm install
npm run android
```

`npm start` lance Metro séparément si besoin. Voir aussi [`CONTRIBUTING.md`](CONTRIBUTING.md) pour le détail des scripts (`lint`, `test`, `tsc`).

## Structure du projet

```
src/
  components/   composants d'interface réutilisables (boutons, switch, feuilles, icônes…)
  screens/      les trois écrans principaux : Surveillance, Historique, Setup
  state/        état applicatif (contexte React), types, valeurs par défaut, persistance
  camera/       sélection du device caméra (position, objectif)
  ml/           décodage des sorties du modèle TFLite, labels COCO
  constants/    métadonnées de l'application (version, licence, dépôt)
  utils/        fonctions utilitaires (dates)
  theme.ts      jetons de design (couleurs, typographie, espacements)
assets/fonts/   police Inter embarquée
assets/models/  modèle de détection TensorFlow Lite embarqué
```

## Feuille de route

- [x] Flux caméra réel (`react-native-vision-camera`)
- [x] Détection de personnes/animaux sur l'appareil (TensorFlow Lite)
- [ ] Calibrer l'alignement de la zone de détection sur un vrai appareil (non vérifiable dans l'environnement où cette fonctionnalité a été développée — aucun SDK/émulateur Android disponible)
- [ ] Enregistrement vidéo réel et gestion du stockage
- [ ] Notifications système réelles

## Contribuer

Les contributions sont bienvenues — voir [`CONTRIBUTING.md`](CONTRIBUTING.md) et le [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## Licence

NovaGuard est distribué sous licence [GNU GPL v3.0](LICENSE).
