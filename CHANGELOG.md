# Changelog

Tous les changements notables de ce projet sont documentés dans ce fichier.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [Non publié]

### Ajouté
- **Build d'APK en CI** (`.github/workflows/ci.yml`, job `build-apk`) : après chaque fusion sur `main`, et à la demande sur n'importe quelle branche (`workflow_dispatch`), un APK `release` — signé avec le keystore de debug du dépôt, donc sans secret à configurer — est construit et déposé en artefact de run. Le job installe explicitement `platforms;android-36`, `build-tools;36.0.0`, `ndk;27.1.12297006` et `cmake;3.30.5` plutôt que de compter sur ce que l'image du runner a préinstallé, pour ne pas dépendre d'une dérive de version silencieuse. Gate par le job `check` existant : un APK n'est jamais construit sur des types, un lint ou des tests en échec.
- **Service de premier plan** (`SurveillanceService`, TurboModule `SurveillanceService`) démarré avec la surveillance et arrêté avec elle. Sans lui Android coupe l'accès caméra dès que l'application quitte l'écran, et le processus devient candidat à la fermeture. Notification permanente en canal `IMPORTANCE_LOW`, silencieuse, masquée sur l'écran verrouillé (les images de surveillance sont sensibles) et ouvrant l'application au tap.
  - Le type `microphone` n'est déclaré **qu'à l'exécution**, quand `RECORD_AUDIO` est réellement accordée : depuis Android 14, démarrer un service de premier plan avec un type dont la permission manque lève une `SecurityException`. L'audio étant optionnel dans NovaGuard, le jeu de types se décide à l'exécution.
  - `START_NOT_STICKY` volontairement : la session caméra vit dans l'arbre de vues React, donc un service relancé seul par le système — sans Activity ni contexte JS — afficherait « surveillance active » sans rien enregistrer.
- **Permission de notification réelle** (`POST_NOTIFICATIONS`) : c'était la dernière permission simulée. Le service tourne sans elle, mais sa notification est alors retenue silencieusement, ce qui laisserait la caméra active sans aucune indication visible. Toute la plomberie des permissions simulées (`SimulatedPermissions`, clé `@novaguard:perms`) a été supprimée — les trois permissions sont désormais de véritables états système.
- **Enregistrement vidéo réel.** Une détection confirmée ouvre un clip MP4 (H.264) écrit dans le stockage privé de l'application ; l'évènement d'historique porte le chemin du fichier et sa taille réelle lue sur disque.
- Lecture des enregistrements depuis le panneau de détail (`react-native-video`).
- Permission micro réelle (`useMicrophonePermission` + `RECORD_AUDIO`) : l'audio n'est capté qu'une fois accordée.
- Purge automatique par rétention, et récupération d'espace en supprimant les clips les plus anciens quand le volume passe sous 500 Mo libres.
- Nettoyage au démarrage des clips orphelins — fichiers restés sur disque après un arrêt brutal, qu'aucun évènement ne référence.
- Tests unitaires de la gestion des enregistrements (`__tests__/library.test.ts`).
- Tests du service de premier plan (`__tests__/foregroundService.test.ts`) : démarrage, arrêt, état, dégradation en no-op quand le module natif est absent, et gestion de la permission de notification. **87 tests au total.**
- Tests de démarrage et de chargement du modèle (`__tests__/startup.test.tsx`) : passage de l'écran de démarrage, hydratation depuis `AsyncStorage`, arrivée sur l'écran Surveillance, repli quand la caméra n'est pas autorisée, absence de données de démonstration, ignorance des anciennes clés `v1` — et, côté modèle, résolution de l'asset par Metro, choix du délégué GPU en premier, repli CPU, et échec signalé seulement quand les deux ont refusé.
- Flux caméra réel (`react-native-vision-camera`) à la place du placeholder de l'écran Surveillance.
- Détection de personnes/animaux sur l'appareil via un modèle TensorFlow Lite embarqué (COCO), avec `react-native-fast-tflite` et `vision-camera-resize-plugin` dans un frame processor dédié.
- Permission caméra réelle (demandée depuis l'onboarding et Setup → Confidentialité, au lieu d'être simulée).
- Sélection du device caméra (avant/arrière, tentative grand-angle pour « Arrière (0,5×) ») et sensibilité de détection reliées aux vrais réglages.
- Workflow CI (GitHub Actions) : types, lint et tests sur chaque push/pull request vers `main`.
- Icône d'application (Android adaptive + legacy, iOS) remplaçant l'icône par défaut de React Native.
- Écran de démarrage animé (viseur pulsant, marque, trois piliers du produit, illustration de maison la nuit) affiché pendant l'hydratation de l'état.
- Détection de visages (ML Kit via `react-native-vision-camera-face-detector`) et zoom automatique cinématique : gros plan progressif sur le visage, maintien 4 s, puis retour sur la ou les personnes en entier. Réglage « Zoom auto sur les visages » dans Setup → Détection.
- Tests unitaires de la géométrie de cadrage (`__tests__/framing.test.ts`), du redressement et du mapping « cover » (`__tests__/orientation.test.ts`) et du suivi des sujets (`__tests__/tracker.test.ts`).

### Modifié
- **Plancher relevé à Android 16 (API 36)** : `minSdkVersion` passe de 24 à 36, au niveau de `compileSdk` et `targetSdk`. L'application est donc construite, livrée et testée contre un seul niveau de plateforme.
- **ABI 32 bits retirées** : `reactNativeArchitectures` passe de `armeabi-v7a,arm64-v8a,x86,x86_64` à `arm64-v8a,x86_64`. Avec un plancher Android 16, aucun appareil capable d'installer l'application n'est en 32 bits, et il n'existe pas d'image d'émulateur x86 32 bits à ce niveau d'API : ces bibliothèques natives n'auraient jamais été chargées.
- **Edge-to-edge activé** (`edgeToEdgeEnabled=true`) : ce n'est pas un choix à ce niveau d'API. Android 15 impose l'affichage bord à bord aux applications ciblant l'API 35+, et Android 16 ignore complètement l'échappatoire `windowOptOutEdgeToEdgeEnforcement`. Le système dessine derrière les barres de toute façon ; laisser le drapeau à `false` empêchait seulement React Native d'accorder sa barre d'état et ses encarts à ce comportement. La prop `backgroundColor` de `StatusBar`, ignorée dans ce mode, a été retirée.
- `SafeAreaProvider` reçoit `initialMetrics` : le premier rendu utilise les encarts déjà connus côté natif au lieu d'attendre un aller-retour `onLayout`, ce qui retire une image blanche entre l'écran de lancement et l'application.
- Jest s'exécute désormais en plateforme `android` : sans cela le préréglage résolvait les fichiers `.ios.js` et rapportait `Platform.OS === 'ios'`, donc les branches spécifiques à Android — dont le choix du délégué GPU pour TFLite — étaient testées sur le mauvais chemin.
- **Les réglages d'enregistrement et de stockage font enfin quelque chose.** Ils n'étaient lus que pour afficher leur propre libellé :
  - « Durée après détection » prolonge réellement le clip après le départ du sujet ;
  - « Durée maximale » coupe le clip et enchaîne sur un nouveau segment si le sujet est toujours là ;
  - « Qualité vidéo » choisit le format caméra et le débit (720p / 1080p / 4K) ;
  - « Conserver les vidéos » supprime pour de bon les clips expirés ;
  - « Suppression automatique » libère de la place au lieu de ne rien faire ;
  - « Supprimer toutes les vidéos » efface les fichiers, pas seulement les lignes de la liste.
- **Fin des données inventées** : les 7 évènements de démonstration (qui étaient persistés au premier lancement et devenaient indiscernables des vraies détections), la taille de fichier calculée en `durée × 0,8 Mo`, et les « 7,9 Go / 24,8 Go » codés en dur ont été remplacés par de vraies valeurs (`getFSInfo`, `stat`).
- Le compteur « détections aujourd'hui » se remet à zéro au changement de jour ; il était persisté et seulement incrémenté, donc c'était en réalité un total depuis l'installation.
- La permission `INTERNET` est passée dans le manifeste de *debug* uniquement (Metro en a besoin) : l'APK de release ne la déclare plus, ce qui rend vérifiable la promesse « rien n'est envoyé vers un serveur ».
- Le chronomètre REC et la durée des cartes d'historique gèrent les minutes (`0:18`, `2:05`) — ils étaient figés sur un préfixe `0:`, faux dès qu'un clip dépasse 60 s.
- Clés de persistance `events` et `detToday` versionnées en `:v2`, pour que les anciennes valeurs inventées ne soient pas relues.
- **Détection revue en profondeur** :
  - le modèle reçoit maintenant **tout le champ de vision** au lieu d'un carré central (~44 % de la largeur n'était jamais analysée sur un capteur 16:9) ;
  - l'image est **redressée** avant inférence — le détecteur recevait jusqu'ici un buffer paysage où les personnes apparaissent couchées, ce à quoi il n'est pas invariant ;
  - passage de SSD MobileNet V1 (2018) à **EfficientDet-Lite0**, plus précis, et 25 détections par image au lieu de 10 ;
  - **délégué GPU** avec repli automatique sur CPU si le modèle est refusé ;
  - **suivi des sujets par IoU** : confirmation sur plusieurs images avant d'ouvrir un événement, tolérance aux occlusions brèves, et suivi de plusieurs personnes simultanément ;
  - le **mode nuit** active désormais réellement `lowLightBoost` quand l'appareil le supporte (il n'était relié à rien).
- Renommage du projet « Sentinelle » → **NovaGuard** (nom affiché, `applicationId` Android `com.novaguard`, dépôt, clés de stockage local).
- La détection déclenchée par le timer factice a été retirée ; l'historique et le statut REC sont maintenant pilotés par de vraies détections.

### Connu
- Le sens de redressement (`uprightRotation`) suit la documentation de vision-camera mais n'a pas été confronté à un vrai capteur. Diagnostic si la détection est mauvaise sur appareil alors que les visages sont bien détectés (ML Kit pivote nativement, donc n'est pas affecté) : inverser `90deg` et `270deg` dans `src/camera/orientation.ts`.
- **L'enregistrement n'a pas pu être exécuté sur un appareil** : cet environnement de build n'a ni SDK Android ni émulateur. La logique de rétention, de récupération d'espace et de formatage est couverte par des tests unitaires, mais la capture elle-même (`startRecording`, chemins de fichiers, permission micro, lecture) reste à valider en conditions réelles.
- **Le service de premier plan n'a pas pu être compilé** : sans SDK Android ici, le code Kotlin et la génération codegen du TurboModule n'ont jamais été passés au compilateur. C'est le morceau le plus risqué de cette branche ; le wrapper JS dégrade en no-op si le module natif manque, donc une erreur de codegen se manifesterait par une surveillance limitée au premier plan, pas par un plantage.
- Ce que le service garantit et ce qu'il ne garantit pas : il rend l'accès caméra en arrière-plan **autorisé** et empêche la fermeture du processus, et VisionCamera pilote son propre `LifecycleRegistry` depuis `isActive` plutôt que depuis l'Activity, donc la session survit au passage en arrière-plan. En revanche, la survie de la capture **écran éteint** dépend du sort de la surface d'aperçu et reste à confirmer sur appareil.
- « Surveillance au démarrage » reste sans effet : cela demande un `BroadcastReceiver` sur `BOOT_COMPLETED`, désormais possible grâce au service mais pas encore implémenté.
- Le zoom auto s'appuie sur ce même cadrage, plus l'hypothèse que le mode `autoMode` du détecteur de visages renvoie des coordonnées dans l'espace de la fenêtre qu'on lui passe. La géométrie est testée unitairement, mais la correspondance avec l'aperçu réel reste à confirmer sur appareil.

### Retiré
- Réglage « Durée avant détection » (pré-enregistrement 0/3/5 s). VisionCamera écrit directement dans un fichier et ne peut pas revenir en arrière ; l'honorer demanderait un tampon d'encodage circulaire. Le clip démarre à la confirmation du sujet.
- Bouton « Partager » du panneau de détail : il était inerte, et un partage réel exige un `FileProvider` Android (voir la feuille de route).

### À venir
- Démarrage automatique de la surveillance au boot (`BOOT_COMPLETED`).
- Bouton « Arrêter » dans la notification (demande un événement natif → JS, écarté ici pour ne pas risquer une désynchronisation d'état).
- Partage d'un enregistrement via un `FileProvider`.
- Notifications à chaque détection.

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
