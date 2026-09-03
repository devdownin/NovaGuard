# NovaGuard

Caméra de surveillance Android, locale et open source. React Native 0.81 /
React 19 / TypeScript. Rien ne quitte l'appareil : pas de réseau, pas de compte,
pas de télémétrie. Le code est commenté en anglais, l'interface est en français.

## Commandes

```bash
npm ci                 # les tests et le typecheck en dépendent
npm run typecheck      # tsc --noEmit
npm run lint           # eslint (0 erreur attendu ; 34 avertissements no-inline-styles connus)
npm test               # jest
npm run android        # build + déploiement sur un appareil ou un émulateur
```

`npm test`, `npm run typecheck` et `npm run lint` sont ce que la CI exécute. Un
quatrième garde-fou y valide les ressources XML Android (voir plus bas).

## Architecture

Le flux principal va de la caméra à l'historique :

```
CameraFeed (frame processor, worklet)
  → interpretDetections   décode les 4 tenseurs d'EfficientDet-Lite0
  → updateTracks          suivi IoU : confirme sur N images, tolère une occlusion
  → reportDetections      ouvre/ferme une session, pilote l'enregistrement
  → useRecorder           VisionCamera, cap de durée, clip rendu par callback
  → videoStore            nommage, renommage sans écrasement, suppression
  → events                historique persisté dans AsyncStorage
```

- `src/state/AppStateContext.tsx` — l'état applicatif. Deux contextes : le
  principal, qui ne change qu'au rythme des actions utilisateur, et
  `ViewfinderCtx`, qui porte l'état par image et vit dans un composant enfant.
- `src/ml/`, `src/camera/framing.ts`, `src/recording/library.ts` — logique pure
  et testée. Les effets de bord vivent dans `videoStore.ts`.
- `src/specs/` — TurboModule (codegen). L'implémentation native est en Kotlin
  dans `android/app/src/main/java/com/novaguard/surveillance/`.

## Ce qui casse ici, et pourquoi

Ces pièges ont tous déjà coûté un bug en production. Ils justifient des choix
qui, sans ça, paraissent tordus.

**Le chemin chaud est le frame processor.** `reportDetections` est appelé
jusqu'à 5 fois par seconde. Son identité alimente la liste de dépendances du
worklet : la faire changer reconstruit le worklet. Tout réglage qu'elle lit
passe donc par une ref (`useLatest`), jamais par une dépendance. Un nouvel état
qui change à cette cadence va dans `ViewfinderProvider`, pas dans le fournisseur
principal — sinon tout l'arbre se redessine à 5 Hz.

**Ce qui entre dans un worklet est recopié, pas partagé.** Le compilateur
worklets détache la fonction de sa portée et met les variables libres qu'elle
lit dans un `__closure` transmis par valeur à un second runtime. Une fonction JS
ordinaire y devient un talon qui lève à l'appel ; un `Set` ou une `Map` n'y
arrive pas du tout — voyant `X.has(...)`, le compilateur ne remonte que
`{ has: Set.prototype.has }`, une primitive sur un objet nu. Les deux ont tué
l'application sur la première image. Donc : toute fonction appelée depuis le
frame processor porte `'worklet'`, et on n'y capture que des données simples
(tableaux, objets, nombres) lues en accès *calculé*. `npm test` ne voit rien de
tout ça — `babel.config.js` coupe le plugin sous Jest — d'où
`__tests__/workletSafety.test.ts`, qui compile pour de vrai et inspecte les
closures.

**Une nouvelle référence de tableau est un re-rendu.** `confirmedTracksIfChanged`
existe pour ça : conserver l'identité quand l'incrustation ne changerait pas.

**Un clip sans événement est une vidéo perdue.** Le sort d'un enregistrement est
exhaustif (`clipOutcome`) : rattaché, gardé comme événement sans fichier, ou
supprimé. Il n'y a pas de quatrième issue, et il ne doit pas y en avoir.

**Les frontières de jour se calculent en jours calendaires**, via
`startOfDayBefore`. Soustraire 86 400 000 ms décale d'une heure aux changements
d'heure, et c'est la rétention — donc une suppression — qui en dépend.
`jest.config.js` fixe `TZ=Europe/Paris` pour que ces tests puissent échouer.

**Un réglage se vérifie de bout en bout.** Ce dépôt a déjà livré une section
NOTIFICATIONS entièrement inerte. Un réglage doit être exposé, persisté *et*
consommé ; `__tests__/settingsWiring.test.tsx` verrouille les trois.

**`check` ne compile aucune ressource Android.** Un `--` dans un commentaire XML
a cassé tous les builds d'APK sans qu'aucune PR verte ne le signale. D'où l'étape
`xmllint` dans le job `check`. Une erreur Android ne peut pas être attrapée par
tsc, eslint ou jest.

## Construire l'APK

Le SDK Android n'est pas nécessaire sur la machine : `Dockerfile` porte la
chaîne d'outils, épinglée sur exactement ce que `android/build.gradle` demande
(plateforme 36, build-tools 36.0.0, NDK 27.1.12297006, CMake 3.30.5, JDK 17,
Node 22). L'image ne contient que les outils ; les sources sont montées.

```bash
docker build -t novaguard-android .
docker run --rm -v "$PWD":/app -w /app novaguard-android \
  bash -lc 'npm ci && cd android && ./gradlew assembleRelease'
```

L'APK sort dans `android/app/build/outputs/apk/release/`. Gradle tourne en root
par défaut et laissera des répertoires de build appartenant à root sur l'hôte —
passez `--user "$(id -u):$(id -g)"` avec un HOME accessible en écriture si ça
vous gêne.

Le workflow `android-image.yml` reconstruit l'image et **fabrique un APK avec**
dès qu'un de ces fichiers change : une image qui ne produirait plus rien échoue
là, pas dans une release des semaines plus tard. Il est dans son propre fichier
parce que GitHub ne filtre par `paths` qu'au niveau du workflow, et personne ne
doit payer plusieurs gigaoctets de SDK sur une PR ordinaire.

## Tests

Jest, avec des mocks pour tout ce qui est natif (`__mocks__/`,
`src/surveillance/__mocks__/`). `testing/mountProvider.tsx` monte
`AppStateProvider` — lisez l'état à travers le handle, pas une copie
déstructurée, qui fige le premier rendu.

Écrire un test qui ne peut pas échouer est pire que ne pas en écrire : plusieurs
l'ont été ici et ont dû être réécrits. Vérifiez par mutation — cassez le code,
regardez le test échouer, restaurez.

## Conventions

- Java 17, `minSdk`/`compileSdk`/`targetSdk` 36, un seul niveau de plateforme.
- Fusion par commit de merge, pas de squash.
- Le CHANGELOG suit Keep a Changelog ; les changements visibles y vont.
