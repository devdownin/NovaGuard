export const APP_VERSION = '1.0.0';
export const APP_LICENSE = 'GPL-3.0';
export const REPO_URL = 'https://github.com/devdownin/NovaGuard';
export const ISSUES_URL = `${REPO_URL}/issues`;

export interface ThirdPartyLicense {
  name: string;
  note: string;
  license: string;
}

// Keep in sync with package.json dependencies.
export const THIRD_PARTY_LICENSES: ThirdPartyLicense[] = [
  { name: 'React & React Native', note: 'Framework applicatif', license: 'MIT' },
  { name: 'react-native-vision-camera', note: 'Flux caméra et frame processors', license: 'MIT' },
  { name: 'react-native-fast-tflite', note: 'Inférence TensorFlow Lite embarquée', license: 'MIT' },
  { name: 'vision-camera-resize-plugin', note: 'Redimensionnement des frames caméra', license: 'MIT' },
  { name: 'react-native-worklets-core', note: 'Traitement des frames hors thread JS', license: 'MIT' },
  { name: 'SSD MobileNet V1 (COCO)', note: 'Modèle de détection embarqué', license: 'Apache-2.0' },
  { name: 'react-native-safe-area-context', note: 'Zones sûres de l’écran', license: 'MIT' },
  { name: 'react-native-svg', note: 'Icônes vectorielles', license: 'MIT' },
  { name: 'react-native-linear-gradient', note: 'Dégradés visuels', license: 'MIT' },
  { name: '@react-native-community/slider', note: 'Curseur du seuil de confiance', license: 'MIT' },
  { name: '@react-native-async-storage/async-storage', note: 'Sauvegarde locale des réglages', license: 'MIT' },
  { name: 'Inter', note: 'Police de caractères', license: 'SIL OFL 1.1' },
];
