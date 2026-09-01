module.exports = {
  preset: 'react-native',
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
