import { Linking, PermissionsAndroid } from 'react-native';
import NativeSurveillanceService from '../specs/NativeSurveillanceService';
import { PermissionOutcome } from '../state/types';

/**
 * Thin wrapper over the native foreground service.
 *
 * The module is null wherever the native side isn't there (Jest, a stale build
 * before codegen has run), so every call degrades to a no-op rather than
 * throwing: failing to promote the process is a downgrade in what surveillance
 * can do, not a reason to take the app down.
 */

export const NOTIFICATION_TITLE = 'Surveillance active';
export const NOTIFICATION_BODY =
  'NovaGuard analyse la caméra. Tout reste sur cet appareil.';

export function startForegroundService(): boolean {
  if (!NativeSurveillanceService) return false;
  try {
    NativeSurveillanceService.start(NOTIFICATION_TITLE, NOTIFICATION_BODY);
    return true;
  } catch {
    return false;
  }
}

export function stopForegroundService(): void {
  if (!NativeSurveillanceService) return;
  try {
    NativeSurveillanceService.stop();
  } catch {
    // Already gone, or the process is being torn down anyway.
  }
}

/**
 * Why the foreground service refused to start, or null.
 *
 * `startForegroundService` only queues the start; everything that can go wrong
 * — a missing camera permission, a foreground-service type Android will not
 * grant from the current state — happens later, inside the service. It cannot
 * surface as a thrown error here, so the service records it and we read it back.
 */
export function foregroundServiceError(): string | null {
  if (!NativeSurveillanceService) return null;
  try {
    return NativeSurveillanceService.lastError() || null;
  } catch {
    return null;
  }
}

export function isForegroundServiceRunning(): boolean {
  if (!NativeSurveillanceService) return false;
  try {
    return NativeSurveillanceService.isRunning();
  } catch {
    return false;
  }
}

export function notifyDetection(title: string, body: string): void {
  if (!NativeSurveillanceService) return;
  try {
    NativeSurveillanceService.notifyDetection(title, body);
  } catch {
    // An alert that fails to post is not worth interrupting surveillance for.
  }
}

export function dismissDetectionAlert(): void {
  if (!NativeSurveillanceService) return;
  try {
    NativeSurveillanceService.dismissDetection();
  } catch {
    // Nothing to clear, or the notification manager is gone.
  }
}

/** Android owns sound and vibration per channel; this is where the user sets them. */
export function openDetectionChannelSettings(): void {
  if (!NativeSurveillanceService) return;
  try {
    NativeSurveillanceService.openDetectionChannelSettings();
  } catch {
    // Deep link unavailable on this device — nothing better to fall back to.
  }
}

/**
 * The service runs whether or not this is granted — but its notification is
 * silently withheld without it, which would leave the camera running with no
 * visible indication. Asked for at the same moment as the other permissions.
 */
export async function requestNotificationPermission(): Promise<PermissionOutcome> {
  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    if (result === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
    // Told apart from a plain refusal on purpose: Android shows no dialog at
    // all once this is the answer, so a caller that collapsed the two into
    // `false` could only offer a button that does nothing you can see.
    if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'blocked';
    return 'denied';
  } catch {
    return 'denied';
  }
}

/**
 * Opens this app's page in Android settings.
 *
 * The only way back once a permission is refused for good — the in-app request
 * returns immediately and shows nothing. Distinct from
 * {@link openDetectionChannelSettings}, which tunes a channel the app is
 * already allowed to post on.
 */
export function openAppSettings(): void {
  try {
    Linking.openSettings();
  } catch {
    // Nothing better to fall back to; the caller has already said what it wants.
  }
}

export async function hasNotificationPermission(): Promise<boolean> {
  try {
    return await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
  } catch {
    return false;
  }
}
