// No native ML Kit face detector in the Jest environment — see react-native-vision-camera.js.
module.exports = {
  useFaceDetector: () => ({ detectFaces: () => [], stopListeners: () => {} }),
};
