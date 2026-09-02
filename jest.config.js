module.exports = {
  preset: 'react-native',
  // NovaGuard is Android-only. Without this the preset resolves `.ios.js`
  // files and reports Platform.OS as 'ios', so platform branches (the TFLite
  // GPU delegate choice, for one) would be tested on the wrong path.
  haste: { defaultPlatform: 'android', platforms: ['android', 'native'] },
  setupFiles: [
    '@react-native-async-storage/async-storage/jest',
  ],
  transform: {
    // Bundled TFLite model — treat it like RN's other binary assets under Jest.
    '^.+\\.tflite$': require.resolve('react-native/jest/assetFileTransformer.js'),
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|react-native|@react-native-async-storage|react-native-svg|react-native-linear-gradient|@react-native-community)/)',
  ],
};
