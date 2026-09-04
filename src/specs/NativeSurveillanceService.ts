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
  /**
   * Why the last start was refused, or '' if it went through.
   *
   * The service starts asynchronously on its own stack, so a failure there
   * cannot come back as a thrown error on the call that asked for it.
   */
  lastError(): string;

  /**
   * Posts (or replaces) the detection alert. One reusable notification rather
   * than a stack: the app's own Historique screen is the record, so a pile of
   * system notifications would only be noise.
   */
  notifyDetection(title: string, body: string): void;
  dismissDetection(): void;

  /**
   * Hands one recorded clip to another app through a chooser.
   *
   * Returns false when there was nothing to share — a file the retention sweep
   * has already reclaimed — or when Android refused to raise a chooser, so the
   * UI can say so rather than looking like it did nothing.
   */
  shareRecording(path: string): boolean;

  /**
   * Opens Android's own settings page for the detection channel. Since Android
   * 8 the platform — not the app — owns whether a channel makes sound or
   * vibrates, so this is the only honest place to send someone who wants to
   * change that.
   */
  openDetectionChannelSettings(): void;
}

// `get` rather than `getEnforcing`: this returns null under Jest, where there
// is no native side, and the wrapper in ../surveillance/foregroundService.ts
// degrades to a no-op instead of taking the whole app down with it.
export default TurboModuleRegistry.get<Spec>('SurveillanceService');
