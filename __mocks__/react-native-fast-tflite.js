// No native TFLite module in the Jest environment — see react-native-vision-camera.js.
module.exports = {
  useTensorflowModel: () => ({ state: 'loading', model: undefined }),
  loadTensorflowModel: () => Promise.reject(new Error('not available in tests')),
};
