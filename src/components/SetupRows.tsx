import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, font } from '../theme';

export function SettingRow({
  label, subtitle, children,
}: { label: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={styles.labelCol}>
        <Text style={styles.label}>{label}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function StaticValue({ label }: { label: string }) {
  return <Text style={styles.staticValue}>{label}</Text>;
}

export function ValueButton({
  label, onPress, active = false, pill = false,
}: { label: string; onPress: () => void; active?: boolean; pill?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.valueButton,
        pill && { borderRadius: 999, paddingVertical: 6, paddingHorizontal: 11 },
        active && { backgroundColor: color.accent900, borderColor: color.accent },
      ]}
    >
      <Text style={[styles.valueButtonText, active && { color: color.accent200 }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  labelCol: {
    flex: 1,
    flexDirection: 'column',
  },
  label: {
    fontFamily: font.regular,
    fontSize: 13,
    color: color.text,
  },
  subtitle: {
    fontFamily: font.regular,
    fontSize: 10.5,
    color: color.neutral600,
    marginTop: 2,
  },
  valueButton: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: color.neutral800,
    backgroundColor: 'transparent',
  },
  valueButtonText: {
    fontFamily: font.regular,
    fontSize: 11.5,
    color: color.neutral200,
  },
  staticValue: {
    fontFamily: font.regular,
    fontSize: 12.5,
    color: color.neutral400,
  },
});
