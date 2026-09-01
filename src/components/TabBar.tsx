import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, font } from '../theme';
import { Tab } from '../state/types';
import { useAppState } from '../state/AppStateContext';
import { CameraIcon, HistoryIcon, SetupIcon } from './icons';

const TABS: { key: Tab; label: string; Icon: typeof CameraIcon }[] = [
  { key: 'cam', label: 'Caméra', Icon: CameraIcon },
  { key: 'hist', label: 'Historique', Icon: HistoryIcon },
  { key: 'setup', label: 'Setup', Icon: SetupIcon },
];

/** Material 3 style bottom nav: pill indicator behind the active tab's icon. */
export function TabBar() {
  const { tab, setTab } = useAppState();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(10, insets.bottom) }]}>
      {TABS.map(({ key, label, Icon }) => {
        const active = tab === key;
        const tint = active ? color.accent : color.neutral600;
        return (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            style={styles.item}
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
    flexDirection: 'row',
    paddingTop: 9,
    paddingHorizontal: 8,
    gap: 2,
    backgroundColor: 'rgba(22,24,38,0.94)',
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
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
