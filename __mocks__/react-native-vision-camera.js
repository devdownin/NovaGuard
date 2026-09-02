// Jest can't load the native Camera module (no native bridge in the test
// environment), so tests get a minimal stand-in: permissions denied, no
// device found. That's enough for App.test.tsx to render the fallback UI
// without crashing — it doesn't exercise real camera or recording behavior.
module.exports = {
  Camera: () => null,
  useCameraDevice: () => undefined,
  useCameraFormat: () => undefined,
  useCameraPermission: () => ({ hasPermission: false, requestPermission: jest.fn() }),
  useMicrophonePermission: () => ({ hasPermission: false, requestPermission: jest.fn() }),
  useFrameProcessor: () => undefined,
  runAsync: () => {},
  runAtTargetFps: () => {},
};
