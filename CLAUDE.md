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

**Une erreur dans le frame processor tue le processus.** VisionCamera la
rattrape sur le thread worklet et la repasse à `reportFatalError` : en release,
une seule mauvaise image ferme l'application. Le corps de l'analyse est donc
sous `try`, et `frameErrorGuard` rattrape le reste — mais seulement ce qui porte
la marque de VisionCamera. Élargir ce filtre transformerait chaque vrai plantage
en application vivante et inerte, ce qui est pire.

**`runAsync` a tué cette application.** Il déplace l'analyse dans un second
contexte worklet et maintient l'image vivante d'un thread à l'autre : SIGSEGV
sur `VisionCamera.video` quelques images après l'apparition de l'aperçu, puis un
`ImageReader` à court de tampons parce que les images retenues n'étaient jamais
refermées (même panne ouverte en amont,
mrousavy/react-native-vision-camera#2589, builds release uniquement). L'analyse
tourne donc sur le thread qui livre l'image. Elle le bloque, et c'est voulu :
`runAtTargetFps` et la contre-pression de CameraX écartent déjà les images qu'on
ne regarde pas, l'aperçu a son propre flux. `__tests__/workletSafety.test.ts`
vérifie que `runAsync` n'est pas réintroduit.

**Ce qui plante sous le JavaScript ne laisse rien.** Un segfault dans libyuv,
LiteRT ou ML Kit termine le processus avant le `try` comme avant le garde : pas
de message, pas de log que l'utilisateur puisse lire. `frameTrace.ts` note donc
l'appel que l'analyse *s'apprête* à faire — `camera`, `resize`, `inference`,
`faces` — avant de le faire, et le lancement suivant nomme celui qui n'a jamais
rendu la main. L'ordre est tout le principe : enregistrer un succès nommerait la
dernière chose qui a marché, c'est-à-dire tout sauf le coupable. Les sauts
d'étape dans le worklet sont inconditionnels, et doivent le rester : un drapeau
serait soit une valeur capturée, figée à la compilation, soit une valeur
partagée dont le compilateur recopie le `.value` — les deux arrêteraient la
trace en silence. C'est le côté JS qui cesse d'écrire, dès qu'une image passe
entière.

**Entre deux clips, personne n'est filmé.** La durée maximale coupe un fichier
sans couper le passage : la session survit, et le clip suivant s'ouvre dès que
l'encodeur rend la caméra. VisionCamera n'offre pas de segmentation sans
couture, donc ce trou — la finalisation du fichier — ne peut pas être supprimé.
Il peut en revanche être élargi par accident, et il l'était : la taille du clip
était relue sur disque *avant* de rouvrir, ajoutant un aller-retour par le pont
natif à une fenêtre où rien n'est enregistré. D'où `onEncoderFree`, annoncé dans
`onRecordingFinished` avant le `stat()`, distinct de `onClip` qui a besoin du
compte d'octets. Tout ce qu'on ajoute entre la fin d'un clip et le début du
suivant se paie en images perdues. L'application se mesure donc elle-même
(`clipGap.ts`, affiché dans Setup → À propos) : seul un appareil peut répondre,
un faux timer ne dit rien d'un encodeur. Les deux moitiés sont rapportées
séparément parce qu'elles n'appellent pas le même travail — la finalisation
appartient à VisionCamera, la relance est à nous. Ni l'une ni l'autre borne
n'est l'instant où le capteur cesse ou reprend de livrer des images, que rien
en JS ne peut voir : la somme encadre cette fenêtre, elle ne l'égale pas, et
c'est ainsi qu'elle est présentée.

**Le garde-fou d'espace disque doit tourner à chaque clip, pas à chaque
session.** Il ne s'exécutait qu'à l'ouverture d'une session, ce qui suffisait
tant qu'une coupure de durée maximale détruisait la session — l'image suivante
repassait par là. Faire survivre la session à la coupure a donc silencieusement
retiré le contrôle des passages longs, c'est-à-dire précisément des
enregistrements capables de remplir un disque. `hasRoomToRecord` est appelé aux
deux endroits, et les seuils ne sont plus des constantes plates : 150 Mo
laissaient démarrer un clip de 2,2 Go (15 min en 4K). `minFreeBytes` et
`lowSpaceBytes` dérivent de `qualityBitRate × maxDurationMs`, et
l'auto-suppression ne récupère jamais jusqu'à une marque qui refuserait encore
d'enregistrer — supprimer l'historique *et* rester incapable de filmer est le
pire des deux.

**Un transform React Native ne touche pas l'enregistrement.** Le zoom
cinématique a longtemps été un `transform` sur la vue qui contient l'aperçu :
l'encodeur est en aval de la session de capture, pas de l'arbre de vues, donc le
fichier restait large. Seul `<Camera zoom>` atteint le fichier — et c'est un
recadrage **centré, sans panoramique**. Appliquer telle quelle l'échelle du
mouvement recadrerait hors du sujet dès qu'il n'est pas au centre : sur une
caméra de surveillance, c'est perdre la preuve. D'où `maxZoomKeepingInFrame`,
qui borne le zoom de capture par la position du sujet lui-même ; le reliquat
reste au transform, qui sait panoramiquer. Les deux changent dans le même
commit et leur produit est inchangé, donc l'écran ne bouge pas —
`boxInZoomedFrame` est ce qui empêche les deux grossissements de se multiplier.
**Un zoom de capture n'est pas un mouvement, mais le tracker ne sait pas
faire la différence.** Toutes ses boîtes sont exprimées dans un cadre qui vient
d'être recadré, donc le même sujet arrive ailleurs à l'image suivante ;
au-delà d'un certain pas, `updateTracks` cesse de le reconnaître, abandonne la
piste, et la remplaçante demande `confirmAfter` images avant d'être confirmée —
sans sujet confirmé pendant ce temps, et le post-roll qui s'arme. **Un plafond
fixe ne corrige pas ça** : une boîte centrée ne fait que grandir et garde
`1/z²` d'elle-même (2× est sa limite), mais une boîte décentrée est *translatée*
bien plus qu'elle ne grandit et peut ne plus recouvrir sa position d'avant dès
1,5×. La borne doit donc être celle du sujet lui-même — `maxZoomTrackable`,
mesurée avec l'`iou` **du tracker**, sur la boîte **brute** qu'il compare et non
sur la boîte paddée du cadrage. `captureZoomFor` réunit les trois bornes en un
seul endroit exprès : trois bornes qui interagissent, et un balayage qui
recalculerait la décision au lieu de l'appeler continuerait de passer après
qu'elle a changé — ce qui est arrivé à la première version de ce test.

Et la main n'est passée au capteur **qu'à l'arrivée** du mouvement : `zoom` est
une propriété de session native, ce projet n'a pas Reanimated, et l'animer
voudrait dire une mise à jour de prop par image affichée dans une application
bâtie pour ne pas re-rendre le viseur. L'enregistrement reçoit donc le gros plan
d'un coup, pas en fondu.

**La surveillance tourne écran éteint ; le reste ne doit pas.** C'est tout
l'objet du service de premier plan : caméra, analyse, suivi et enregistrement
continuent en arrière-plan. Ce qui continuait avec eux, c'était le travail dont
le seul produit est à l'écran — le flux d'aperçu, et l'état du viseur que le
chemin d'image poussait jusqu'à cinq fois par seconde pour déplacer une boîte
sur un écran éteint. `useForeground` sépare les deux, et `preview={foreground}`
est la seule prop touchée : **`isActive` reste vrai**, sinon on arrêterait la
surveillance au lieu d'économiser. La bascule ne suit que le passage en
arrière-plan, jamais le début ou la fin d'un enregistrement — ajouter ou retirer
une sortie d'aperçu en plein clip reconfigure la session de capture, et ce
dépôt a déjà payé une reconfiguration de ce genre entre deux clips. Enfin
`AppState.currentState` vaut `undefined` avant le premier évènement et peut
valoir `unknown` sur appareil : seul un `background` explicite compte comme
caché, parce que se tromper dans l'autre sens éteint l'aperçu d'une application
qu'on est en train de regarder.

**Une nouvelle référence de tableau est un re-rendu.** `confirmedTracksIfChanged`
existe pour ça : conserver l'identité quand l'incrustation ne changerait pas.

**Un clip sans événement est une vidéo perdue.** Le sort d'un enregistrement est
exhaustif (`clipOutcome`) : rattaché, gardé comme événement sans fichier, ou
supprimé. Il n'y a pas de quatrième issue, et il ne doit pas y en avoir.

**Une lecture qui échoue n'est pas une valeur vide.** Le balayage de démarrage
supprime tout clip que plus aucun évènement ne réclame ; un chargeur qui répond
`null` pour « illisible » comme pour « jamais écrit » lui fait donc effacer
toute la bibliothèque. Ce qui peut détruire quelque chose lit à travers
`readJsonChecked` et s'abstient quand `ok` est faux — sans réécrire non plus la
clé qu'il n'a pas su lire.

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

**Et `xmllint` ne lance pas Gradle.** Bien formé n'est pas compilable : un
manifeste fautif, un module natif qui réclame un autre NDK, une dépendance dont
le code autolié ne compile pas — rien de tout cela ne se voit avant un vrai run
Gradle. Le job `changes` de `ci.yml` décide donc, par PR et d'après les fichiers
touchés, s'il faut construire un APK ; une PR purement JavaScript ne paie
toujours rien. La liste des chemins exclut volontairement le `Dockerfile` et les
scripts de build, qu'`android-image.yml` couvre déjà sur PR — les nommer aux
deux endroits téléchargerait deux fois plusieurs gigaoctets de SDK.
`__tests__/apkOnPullRequest.test.ts` rejoue la vraie expression extraite du
workflow : une décision qui vit dans un `grep` de CI ne s'exercerait sinon que
lors d'un run Actions, c'est-à-dire trop tard.

**Une dépendance qui réclame un autre NDK casse le build.** L'image porte
exactement ce que `android/build.gradle` épingle, et rien d'autre : un module
qui demande autre chose fait tenter à AGP un téléchargement dans un SDK en
lecture seule, et ça s'arrête là. Deux cas déjà présents — `worklets-core` ne
déclare aucun `ndkVersion` (AGP retombe sur le sien), le détecteur de visages
code en dur NDK 27.3/plateforme 35/build-tools 35, et **aucun** module natif ne
fixe de version de CMake, donc tous héritent du défaut d'AGP (3.22.1) au lieu du
3.30.5 que l'image installe. Et ça ne casse pas d'un coup : se mettre d'accord
sur le NDK n'a fait avancer le build que jusqu'à `configureCMake…`. Le bloc
`subprojects` de `android/build.gradle` force les quatre valeurs sur **tous** les
modules Android
plutôt que de les poursuivre un par un, et `__tests__/toolchainPinning.test.ts`
vérifie que `build.gradle`, le `Dockerfile` et les assertions d'`android-image.yml`
nomment bien les mêmes versions pour chacune des quatre — l'échec, lui, ne se voit que dans un vrai run
Gradle, que la CI ne fait pas sur une PR ordinaire.

## Construire l'APK

Le SDK Android n'est pas nécessaire sur la machine : `Dockerfile` porte la
chaîne d'outils, épinglée sur exactement ce que `android/build.gradle` demande
(plateforme 36, build-tools 36.0.0, NDK 27.1.12297006, CMake 3.30.5, JDK 17,
Node 22). L'image ne contient que les outils ; les sources sont montées.

```bash
docker build -t novaguard-android .
scripts/build-apk-in-docker.sh novaguard-android
```

L'APK sort dans `android/app/build/outputs/apk/release/`.

Deux scripts, et la raison de la séparation compte :

- `scripts/build-apk.sh` — ce qui transforme le dépôt en APK (`npm ci`, puis
  `assembleRelease`). Tourne *dans* l'image.
- `scripts/build-apk-in-docker.sh` — l'invocation `docker run` : montage des
  sources, caches Gradle et npm, et `--user` pour que Gradle ne laisse pas des
  répertoires appartenant à root dans votre checkout.

La CI appelle exactement ces deux-là. Un chemin de release que personne
n'exécute est précisément la façon dont le build d'APK est resté cassé pendant
onze fusions sans que personne ne le voie : ici, ce que la PR vérifie et ce que
la release exécute sont la même commande.

L'image est publiée sur `ghcr.io/devdownin/novaguard/android-build`, **étiquetée
par le hash du `Dockerfile`**. `build-apk` demande l'étiquette que son propre
commit décrit : une image ne peut donc jamais être décalée du `Dockerfile` avec
lequel la release est construite. Si l'étiquette n'existe pas encore, le job
construit l'image sur place — un tag manquant coûte un téléchargement, il ne
casse pas une release.

`android-image.yml` reconstruit l'image, **vérifie composant par composant**
qu'ils sont sur le disque (un `docker build` qui sort en zéro ne prouve que
l'exécution des commandes), fabrique un APK, et ne publie qu'ensuite. Il est
dans son propre fichier parce que GitHub ne filtre par `paths` qu'au niveau du
workflow, et personne ne doit payer plusieurs gigaoctets de SDK sur une PR
ordinaire.

## Tests

Jest, avec des mocks pour tout ce qui est natif (`__mocks__/`,
`src/surveillance/__mocks__/`). `testing/mountProvider.tsx` monte
`AppStateProvider` — lisez l'état à travers le handle, pas une copie
déstructurée, qui fige le premier rendu.

Écrire un test qui ne peut pas échouer est pire que ne pas en écrire : plusieurs
l'ont été ici et ont dû être réécrits. Vérifiez par mutation — cassez le code,
regardez le test échouer, restaurez.

## Conventions

- Java 17, `minSdk`/`compileSdk`/`targetSdk` 36, un seul niveau de plateforme —
  imposé aux dépendances aussi, voir plus bas.
- Fusion par commit de merge, pas de squash.
- Le CHANGELOG suit Keep a Changelog ; les changements visibles y vont.
