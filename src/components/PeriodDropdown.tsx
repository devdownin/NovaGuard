import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, font, shadow } from '../theme';
import { Period } from '../state/types';
import { ChevronDownIcon } from './icons';
import { tValue } from '../i18n';

const OPTIONS: Period[] = ["Aujourd'hui", '7 jours', '30 jours', 'Tout'];

interface PeriodDropdownProps {
  value: Period;
  open: boolean;
  onToggle: () => void;
  onSelect: (p: Period) => void;
}

export function PeriodDropdown({ value, open, onToggle, onSelect }: PeriodDropdownProps) {
  return (
    <View style={styles.wrap}>
      <Pressable onPress={onToggle} style={styles.trigger}>
        <Text style={styles.triggerLabel}>{tValue(`value.period.${value}`)}</Text>
        <ChevronDownIcon size={9} color={color.neutral300} />
      </Pressable>
      {open && (
        <View style={styles.menu}>
          {OPTIONS.map(opt => (
            <Pressable key={opt} onPress={() => onSelect(opt)} style={styles.menuItem}>
              <Text style={styles.menuLabel}>{tValue(`value.period.${opt}`)}</Text>
              {opt === value && <Text style={styles.menuCheck}>✓</Text>}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-start',
    position: 'relative',
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: color.neutral800,
  },
  triggerLabel: {
    fontFamily: font.regular,
    fontSize: 11.5,
    color: color.neutral300,
  },
  menu: {
    position: 'absolute',
    top: 36,
    left: 0,
    zIndex: 30,
    minWidth: 150,
    padding: 5,
    borderRadius: 10,
    backgroundColor: color.surface,
    ...shadow.md,
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 7,
  },
  menuLabel: {
    fontFamily: font.regular,
    fontSize: 12,
    color: color.neutral200,
  },
  menuCheck: {
    color: color.accent,
    fontSize: 12,
  },
});
