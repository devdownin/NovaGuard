# Contribuer à NovaGuard

Merci de votre intérêt pour NovaGuard ! Ce projet est open source (GPL-3.0) et les contributions — code, documentation, rapports de bugs, traductions — sont les bienvenues.

## Avant de commencer

- Merci de respecter notre [Code de conduite](CODE_OF_CONDUCT.md).
- Pour un changement important (nouvelle fonctionnalité, refonte), ouvrez d'abord une [issue](../../issues) pour en discuter avant d'investir du temps dans une pull request.
- Pour un bug ou une petite correction, une pull request directe est bienvenue.

## Mettre en place l'environnement

```sh
git clone <votre-fork>
cd NovaGuard
npm install
```

Suivez ensuite le guide [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) de React Native (onglet Android) si ce n'est pas déjà fait.

## Développer

```sh
npm start          # démarre Metro
npm run android     # build + lance l'app sur émulateur/appareil Android
```

Avant de proposer une pull request, vérifiez que le projet est propre :

```sh
npx tsc --noEmit    # types
npm run lint         # ESLint
npm test             # Jest
```

Ces trois vérifications tournent aussi automatiquement en CI (GitHub Actions) sur chaque pull request — voir [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Style de code

- TypeScript strict, pas de `any` sauf nécessité justifiée.
- Les couleurs, espacements et typographies viennent de `src/theme.ts` — éviter les valeurs codées en dur.
- Un composant réutilisable va dans `src/components/`, un écran dans `src/screens/`, l'état partagé dans `src/state/`.
- Suivre le style déjà en place (voir `.eslintrc.js` / `.prettierrc.js`) plutôt que d'introduire de nouvelles conventions.

## Soumettre une pull request

1. Forkez le dépôt et créez une branche depuis `main` (`git checkout -b ma-fonctionnalite`).
2. Faites vos changements, avec des commits clairs.
3. Vérifiez `tsc`, `lint` et `test` (voir ci-dessus).
4. Ouvrez la pull request en décrivant le changement et son motif ; reliez l'issue concernée le cas échéant.

## Signaler un bug ou proposer une fonctionnalité

Utilisez les [templates d'issue](.github/ISSUE_TEMPLATE) du dépôt — ils indiquent les informations utiles à fournir.

## Licence

En contribuant, vous acceptez que vos contributions soient distribuées sous la licence [GPL-3.0](LICENSE) du projet.
