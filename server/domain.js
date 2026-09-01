/* ===========================================================================
   Domain rules for the alarm panel.

   These live on the server because the panel decides and the client displays.
   A client that decided for itself could be lied to.
   =========================================================================== */

export const MODES = ['off', 'home', 'away'];

/** The state each sensor type sits in when nothing is happening. */
export const RESTING = { contact: 'closed', motion: 'clear', smoke: 'clear', water: 'clear' };

/** The state that represents "something happened here". */
export const TRIPPED = { contact: 'open', motion: 'motion', smoke: 'smoke', water: 'leak' };

export function isTripped(sensor) {
  return sensor.state !== RESTING[sensor.type];
}

/**
 * Whether a sensor participates in a given arm mode. Motion detectors are
 * ignored in Home mode — you are inside, moving around; that is the point of
 * the mode. Everything else stays live.
 */
export function armsIn(sensor, mode) {
  if (sensor.type === 'motion') return mode === 'away';
  return true;
}

/**
 * Life-safety sensors alarm whether or not the system is armed. Nobody arms
 * their house against a fire.
 */
export function isLifeSafety(sensor) {
  return sensor.type === 'smoke' || sensor.type === 'water';
}

/** Flip a sensor between resting and tripped. */
export function toggled(sensor) {
  return {
    ...sensor,
    state: isTripped(sensor) ? RESTING[sensor.type] : TRIPPED[sensor.type]
  };
}
