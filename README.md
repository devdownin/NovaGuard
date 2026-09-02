# NovaGuard

Caméra de surveillance intelligente, locale et open source. NovaGuard transforme un smartphone Android en caméra de détection de personnes et d'animaux — toute la détection et l'enregistrement restent sur l'appareil, rien n'est envoyé vers un serveur.

[![CI](https://github.com/devdownin/NovaGuard/actions/workflows/ci.yml/badge.svg)](https://github.com/devdownin/NovaGuard/actions/workflows/ci.yml)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

## Fonctionnalités

- **Surveillance** — flux caméra en direct, indicateur d'état, démarrage/arrêt en un geste, dernières statistiques (dernière détection, détections du jour, espace disponible).
- **Détection sur l'appareil** — personnes et animaux, reconnus en local par EfficientDet-Lite0 (TensorFlow Lite, COCO) sur **tout** le champ de vision et sur une image redressée. Suivi multi-sujets : chaque personne présente est encadrée, avec son niveau de confiance. Un sujet doit être vu sur plusieurs images consécutives avant de déclencher un événement, et survit à une occlusion brève sans couper l'événement en deux.
- **Zoom auto sur les visages** — quand un visage est détecté (ML Kit), le cadrage glisse doucement en gros plan, s'y maintient 4 s, puis revient sur la ou les personnes en entier. Mouvement animé sur le driver natif, donc insensible à la charge de l'inférence. Désactivable dans Setup → Détection.
- **Enregistrement** — chaque détection confirmée écrit un clip MP4 (H.264) dans le stockage privé de l'application : aucune permission de stockage, rien dans la galerie partagée, tout disparaît à la désinstallation. La qualité (720p/1080p/4K), la durée après détection et la durée maximale d'un clip sont réglables ; au-delà du maximum le clip est coupé et la suite enregistrée dans un segment suivant.
- **Gestion du stockage** — rétention configurable (1 à 90 jours, ou toujours), suppression automatique des clips les plus anciens quand le volume passe sous 500 Mo libres, espace réellement mesuré sur l'appareil, et nettoyage au démarrage des fichiers qu'aucun évènement ne référence plus.
- **Historique** — événements enregistrés sous forme de cartes, filtrables par type et par période, avec détail complet (lecture de la vidéo, confiance, taille réelle, suppression) en panneau.
- **Setup** — réglages de surveillance, détection, enregistrement, stockage et notifications regroupés par sections repliables ; la sensibilité et le seuil de confiance pilotent directement le pipeline de détection.
- **Confidentialité par conception** — traitement 100 % local, détection et enregistrement compris. Les clips restent dans le stockage privé de l'application, les réglages et l'historique dans `AsyncStorage`, et l'APK de release ne déclare même pas la permission `INTERNET`.
- **Premier lancement** — écran de démarrage animé (viseur, marque, trois piliers du produit) pendant l'hydratation de l'état persisté, avant l'onboarding.

> Détection **et** enregistrement tournent réellement sur l'appareil. Rien n'a toutefois pu être exécuté sur un vrai capteur dans cet environnement de build (ni SDK Android ni émulateur) : la géométrie et la gestion du stockage sont couvertes par des tests unitaires, mais la capture, l'orientation et l'alignement des cadres restent à valider en conditions réelles. La surveillance suppose l'application au premier plan — voir [Feuille de route](#feuille-de-route).

## Stack technique

- [React Native](https://reactnative.dev) (CLI *bare*, sans Expo) — Android 16 (API 36) minimum ; `minSdk`, `compileSdk` et `targetSdk` sont tous à 36, donc un seul niveau de plateforme à supporter
- TypeScript
- [react-native-vision-camera](https://github.com/mrousavy/react-native-vision-camera) pour le flux caméra et les frame processors
- [react-native-fast-tflite](https://github.com/mrousavy/react-native-fast-tflite) pour l'inférence TensorFlow Lite embarquée (modèle `assets/models/efficientdet-lite0.tflite`, quantifié uint8 320×320, licence Apache-2.0), avec délégué GPU et repli CPU automatique
- [react-native-vision-camera-face-detector](https://github.com/luicfrr/react-native-vision-camera-face-detector) (ML Kit) pour la détection de visages qui pilote le zoom auto
- [vision-camera-resize-plugin](https://github.com/mrousavy/vision-camera-resize-plugin) et [react-native-worklets-core](https://github.com/margelo/react-native-worklets-core) pour le traitement des frames sur un thread dédié
- [react-native-svg](https://github.com/software-mansion/react-native-svg), [react-native-linear-gradient](https://github.com/react-native-linear-gradient/react-native-linear-gradient), [@react-native-community/slider](https://github.com/callstack/react-native-slider)
- [@dr.pogodin/react-native-fs](https://github.com/birdofpreyru/react-native-fs) pour les fichiers vidéo et l'espace disque, [react-native-video](https://github.com/TheWidlarzGroup/react-native-video) pour la lecture
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
  camera/       sélection du device caméra, géométrie de cadrage et machine à états du zoom auto
  recording/    capture des clips, rétention, récupération d'espace et accès disque
  ml/           décodage des sorties du modèle TFLite, labels COCO, suivi des sujets (IoU)
  constants/    métadonnées de l'application (version, licence, dépôt)
  utils/        fonctions utilitaires (dates)
  theme.ts      jetons de design (couleurs, typographie, espacements)
assets/fonts/   police Inter embarquée
assets/models/  modèle de détection TensorFlow Lite embarqué
assets/splash/  illustration de l'écran de démarrage
assets/store/   icône source et icône 512×512 pour les fiches store
```

## Feuille de route

- [x] Flux caméra réel (`react-native-vision-camera`)
- [x] Détection de personnes/animaux sur l'appareil (TensorFlow Lite)
- [x] Enregistrement vidéo réel et gestion du stockage
- [ ] Vérifier sur un vrai appareil le sens de redressement des images (`src/camera/orientation.ts`), l'alignement des cadres et toute la chaîne d'enregistrement — la géométrie et la gestion du stockage sont couvertes par des tests unitaires, mais ni la convention d'orientation du capteur ni la capture elle-même ne le sont
- [ ] Service de premier plan, pour surveiller écran éteint ou application en arrière-plan
- [ ] Partage d'un enregistrement (nécessite un `FileProvider` Android)
- [ ] Notifications système réelles

## Contribuer

Les contributions sont bienvenues — voir [`CONTRIBUTING.md`](CONTRIBUTING.md) et le [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## Licence

NovaGuard est distribué sous licence [GNU GPL v3.0](LICENSE).
