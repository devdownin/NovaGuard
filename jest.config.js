module.exports = {
  preset: 'react-native',
  setupFiles: [
    '@react-native-async-storage/async-storage/jest',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|react-native|@react-native-async-storage|react-native-svg|react-native-linear-gradient|@react-native-community)/)',
  ],
};
