import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  /**
   * Promotes the app to a foreground service of type camera (plus microphone
   * when that permission is held), so Android keeps the process alive and
   * allows camera access while the app is not on screen.
   */
  start(title: string, body: string): void;
  stop(): void;
  isRunning(): boolean;
}

// `get` rather than `getEnforcing`: this returns null under Jest, where there
// is no native side, and the wrapper in ../surveillance/foregroundService.ts
// degrades to a no-op instead of taking the whole app down with it.
export default TurboModuleRegistry.get<Spec>('SurveillanceService');
