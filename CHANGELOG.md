# Changelog

Tous les changements notables de ce projet sont documentés dans ce fichier.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [Non publié]

### Ajouté
- **Enregistrement vidéo réel.** Une détection confirmée ouvre un clip MP4 (H.264) écrit dans le stockage privé de l'application ; l'évènement d'historique porte le chemin du fichier et sa taille réelle lue sur disque.
- Lecture des enregistrements depuis le panneau de détail (`react-native-video`).
- Permission micro réelle (`useMicrophonePermission` + `RECORD_AUDIO`) : l'audio n'est capté qu'une fois accordée.
- Purge automatique par rétention, et récupération d'espace en supprimant les clips les plus anciens quand le volume passe sous 500 Mo libres.
- Nettoyage au démarrage des clips orphelins — fichiers restés sur disque après un arrêt brutal, qu'aucun évènement ne référence.
- Tests unitaires de la gestion des enregistrements (`__tests__/library.test.ts`) — 65 tests au total.
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
- La surveillance ne fonctionne qu'application au premier plan : il n'y a pas encore de service de premier plan, donc l'enregistrement s'arrête quand l'écran s'éteint.
- Le zoom auto s'appuie sur ce même cadrage, plus l'hypothèse que le mode `autoMode` du détecteur de visages renvoie des coordonnées dans l'espace de la fenêtre qu'on lui passe. La géométrie est testée unitairement, mais la correspondance avec l'aperçu réel reste à confirmer sur appareil.

### Retiré
- Réglage « Durée avant détection » (pré-enregistrement 0/3/5 s). VisionCamera écrit directement dans un fichier et ne peut pas revenir en arrière ; l'honorer demanderait un tampon d'encodage circulaire. Le clip démarre à la confirmation du sujet.
- Bouton « Partager » du panneau de détail : il était inerte, et un partage réel exige un `FileProvider` Android (voir la feuille de route).

### À venir
- Service de premier plan pour surveiller écran éteint / application en arrière-plan.
- Partage d'un enregistrement via un `FileProvider`.
- Notifications système réelles.

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
