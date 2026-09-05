// Design tokens ported from the Nocturne design system
// (_ds/nocturne-4a4cdbd3-a425-47a5-9092-d76ee9fd6dc3/styles.css)
// Keep these in sync with that source if the design system is retuned.

export const color = {
  bg: '#161826',
  surface: '#232532',
  text: '#e9e9ed',
  accent: '#9184d9',
  accent2: '#a7a1db',
  divider: 'rgba(233,233,237,0.16)',

  neutral100: '#f3f5fe',
  neutral200: '#e4e7f5',
  neutral300: '#cfd3e5',
  neutral400: '#b2b6ca',
  neutral500: '#9397ab',
  neutral600: '#75798c',
  neutral700: '#595d6c',
  neutral800: '#3f424d',
  neutral900: '#292b31',

  accent100: '#f5f4ff',
  accent200: '#e7e5fe',
  accent300: '#d2cefd',
  accent400: '#b5abfc',
  accent500: '#968ae0',
  accent600: '#796cbf',
  accent700: '#5d5294',
  accent800: '#423a6a',
  accent900: '#2b2741',
} as const;

export const font = {
  regular: 'Inter-Regular',
  medium: 'Inter-Medium',
  semibold: 'Inter-SemiBold',
} as const;

// Density 0.70x scale, as in the design system.
export const space = {
  1: 2.8,
  2: 5.6,
  3: 8.4,
  4: 11.2,
  6: 16.8,
  8: 22.4,
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 14,
} as const;

// Elevation on this dark ground is a hairline edge + ambient darkness,
// approximated here as RN shadow props (iOS) since box-shadow multi-layer
// stacking has no direct RN equivalent.
export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  lg: {
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
} as const;

/**
 * How far the system font size may stretch this app's dense chrome.
 *
 * Not a refusal to scale — `allowFontScaling={false}` is the accessibility
 * anti-pattern, and body text here scales without a cap. This bounds only the
 * places where a label shares a fixed row with something else and would push it
 * off screen at 2×: the tab labels, the viewfinder chips, the counter cells.
 * Above 1.4× those become unreadable by being clipped rather than by being
 * small.
 */
export const MAX_FONT_SCALE = 1.4;

/**
 * The extra touch area given to the small controls.
 *
 * Android asks for 48 dp; several controls here are ~28 dp tall because the
 * design is dense. `hitSlop` grows what the finger hits without moving what the
 * eye sees, which is the whole point — enlarging the boxes themselves would
 * relayout every screen.
 */
export const TOUCH_SLOP = { top: 10, bottom: 10, left: 8, right: 8 };
