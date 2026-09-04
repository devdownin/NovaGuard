import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, font } from '../theme';
import { Tab } from '../state/types';
import { useAppState } from '../state/AppStateContext';
import { useLandscape } from '../utils/useLandscape';
import { CameraIcon, HistoryIcon, SetupIcon } from './icons';

const TABS: { key: Tab; label: string; Icon: typeof CameraIcon }[] = [
  { key: 'cam', label: 'Caméra', Icon: CameraIcon },
  { key: 'hist', label: 'Historique', Icon: HistoryIcon },
  { key: 'setup', label: 'Setup', Icon: SetupIcon },
];

/**
 * Material 3 style nav: pill indicator behind the active tab's icon.
 *
 * A bottom bar in landscape spends ~60 dp of the short axis — the one axis the
 * viewfinder has none of when the phone is on its side. It becomes a left rail
 * there instead, which spends width, of which there is plenty.
 */
export function TabBar() {
  const { tab, setTab } = useAppState();
  const insets = useSafeAreaInsets();
  const landscape = useLandscape();

  return (
    <View
      style={[
        styles.bar,
        landscape ? styles.rail : styles.bottomBar,
        // The gesture bar stays at the bottom of the window in landscape, so
        // the rail keeps its own clearance; the side cutout is handled by the
        // app's safe area, one level up.
        landscape ? { paddingBottom: insets.bottom } : { paddingBottom: Math.max(10, insets.bottom) },
      ]}
    >
      {TABS.map(({ key, label, Icon }) => {
        const active = tab === key;
        const tint = active ? color.accent : color.neutral600;
        return (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            style={landscape ? styles.railItem : styles.item}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <View style={[styles.pill, { backgroundColor: active ? color.accent900 : 'transparent' }]}>
              <Icon size={22} color={tint} />
            </View>
            <Text style={[styles.label, { color: tint }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: 'rgba(22,24,38,0.94)',
  },
  bottomBar: {
    flexDirection: 'row',
    gap: 2,
    paddingTop: 9,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  rail: {
    flexDirection: 'column',
    justifyContent: 'center',
    width: 74,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRightWidth: 1,
    borderRightColor: color.divider,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  // No `flex` on the rail: three items sharing the height would push the
  // labels to the far corners of the screen instead of grouping them.
  railItem: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 11,
  },
  pill: {
    width: 62,
    height: 31,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: font.regular,
    fontSize: 10.5,
    letterSpacing: 0.1,
  },
});
