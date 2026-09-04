/**
 * Manual mock for the native surveillance service.
 *
 * Every suite that mounts `AppStateProvider` needs it, and each was carrying its
 * own inline `jest.mock` factory — copies that silently un-mock a native call
 * the day an export is added here. `jest.mock('../src/surveillance/
 * foregroundService')` with no factory picks this up.
 *
 * The notification strings are re-exported from the real module so tests still
 * assert against the real text.
 */
// `requireActual`, not a re-export: a bare `export ... from` resolves straight
// back through this mock and recurses.
import { PermissionOutcome } from '../../state/types';

const actual = jest.requireActual('../foregroundService');
export const NOTIFICATION_TITLE: string = actual.NOTIFICATION_TITLE;
export const NOTIFICATION_BODY: string = actual.NOTIFICATION_BODY;

export const startForegroundService = jest.fn(() => true);
export const stopForegroundService = jest.fn();
export const foregroundServiceError = jest.fn<string | null, []>(() => null);
export const isForegroundServiceRunning = jest.fn(() => false);
export const notifyDetection = jest.fn();
export const dismissDetectionAlert = jest.fn();
export const openDetectionChannelSettings = jest.fn();
export const shareRecording = jest.fn(() => true);
export const requestNotificationPermission = jest.fn<Promise<PermissionOutcome>, []>(
  async () => 'denied',
);
export const openAppSettings = jest.fn();
export const hasNotificationPermission = jest.fn(async () => false);
