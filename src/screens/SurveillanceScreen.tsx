import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, font } from '../theme';
import { useAppState } from '../state/AppStateContext';
import { Viewfinder } from '../components/Viewfinder';

export function SurveillanceScreen() {
  const { monitoring, toggleMonitoring, lastDet, detToday } = useAppState();

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>NOVAGUARD</Text>
          <Text style={styles.brandSub}>Caméra intelligente locale</Text>
        </View>
        <View
          style={[
            styles.statusPill,
            {
              borderColor: monitoring ? color.accent700 : color.neutral800,
              backgroundColor: monitoring ? color.accent900 : 'transparent',
            },
          ]}
        >
          <View style={[styles.statusDot, { backgroundColor: monitoring ? color.accent : color.neutral600 }]} />
          <Text style={[styles.statusLabel, { color: monitoring ? color.accent200 : color.neutral500 }]}>
            {monitoring ? 'Surveillance active' : 'Surveillance inactive'}
          </Text>
        </View>
      </View>

      <Viewfinder />

      <View style={styles.controls}>
        <Pressable
          onPress={toggleMonitoring}
          style={[
            styles.cta,
            {
              backgroundColor: monitoring ? 'transparent' : color.accent900,
              borderColor: monitoring ? color.neutral700 : color.accent,
            },
          ]}
        >
          <Text style={[styles.ctaLabel, { color: monitoring ? color.neutral200 : color.accent200 }]}>
            {monitoring ? 'ARRÊTER LA SURVEILLANCE' : 'DÉMARRER LA SURVEILLANCE'}
          </Text>
        </Pressable>

        <View style={styles.statsRow}>
          <View style={styles.statCell}>
            <Text style={styles.statLabel}>Dernière</Text>
            <Text style={styles.statValue}>{lastDet}</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statLabel}>Aujourd&apos;hui</Text>
            <Text style={styles.statValue}>{detToday}</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statLabel}>Espace</Text>
            <Text style={styles.statValue}>24,8 Go</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  brand: {
    fontFamily: font.semibold,
    fontSize: 15,
    letterSpacing: 2.1,
    color: color.text,
  },
  brandSub: {
    fontFamily: font.regular,
    fontSize: 10.5,
    letterSpacing: 0.6,
    color: color.neutral500,
    marginTop: 1,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 5,
    paddingLeft: 9,
    paddingRight: 11,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusLabel: { fontFamily: font.medium, fontSize: 11 },
  controls: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 6,
    gap: 12,
  },
  cta: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  ctaLabel: {
    fontFamily: font.semibold,
    fontSize: 13.5,
    letterSpacing: 1.4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 1,
    backgroundColor: color.divider,
    borderRadius: 10,
    overflow: 'hidden',
  },
  statCell: {
    flex: 1,
    backgroundColor: color.surface,
    paddingVertical: 10,
    paddingHorizontal: 11,
  },
  statLabel: {
    fontFamily: font.regular,
    fontSize: 9.5,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: color.neutral500,
  },
  statValue: {
    fontFamily: font.medium,
    fontSize: 14,
    color: color.text,
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
});
