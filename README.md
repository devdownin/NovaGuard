# NovaGuard

Caméra de surveillance intelligente, locale et open source. NovaGuard transforme un smartphone Android en caméra de détection de personnes et d'animaux — toute la détection et l'enregistrement restent sur l'appareil, rien n'est envoyé vers un serveur.

[![CI](https://github.com/devdownin/NovaGuard/actions/workflows/ci.yml/badge.svg)](https://github.com/devdownin/NovaGuard/actions/workflows/ci.yml)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

## Fonctionnalités

- **Surveillance** — flux caméra en direct, indicateur d'état, démarrage/arrêt en un geste, dernières statistiques (dernière détection, détections du jour, espace disponible).
- **Détection** — personnes et animaux, avec zone de détection et niveau de confiance affichés en surimpression, enregistrement automatique déclenché par un événement.
- **Historique** — événements enregistrés sous forme de cartes, filtrables par type et par période, avec détail complet (lecture, confiance, taille, suppression) en panneau.
- **Setup** — réglages de surveillance, détection, enregistrement, stockage et notifications regroupés par sections repliables.
- **Confidentialité par conception** — traitement 100 % local ; réglages, permissions et historique sont stockés uniquement sur l'appareil (`AsyncStorage`), jamais transmis.

> Le flux caméra et la détection sont actuellement simulés (placeholder d'interface) — voir [Feuille de route](#feuille-de-route).

## Stack technique

- [React Native](https://reactnative.dev) (CLI *bare*, sans Expo) — Android
- TypeScript
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
  constants/    métadonnées de l'application (version, licence, dépôt)
  utils/        fonctions utilitaires (dates)
  theme.ts      jetons de design (couleurs, typographie, espacements)
assets/fonts/   police Inter embarquée
```

## Feuille de route

- [ ] Flux caméra réel (`react-native-vision-camera` ou équivalent)
- [ ] Détection de personnes/animaux sur l'appareil (modèle embarqué, ex. TensorFlow Lite / ML Kit)
- [ ] Enregistrement vidéo réel et gestion du stockage
- [ ] Notifications système réelles

## Contribuer

Les contributions sont bienvenues — voir [`CONTRIBUTING.md`](CONTRIBUTING.md) et le [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## Licence

NovaGuard est distribué sous licence [GNU GPL v3.0](LICENSE).
