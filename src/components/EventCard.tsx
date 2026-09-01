import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { color, font } from '../theme';
import { DetectionEvent } from '../state/types';
import { formatDuration, formatWhen } from '../utils/date';
import { ChevronRightIcon } from './icons';

export function EventCard({ event, onPress }: { event: DetectionEvent; onPress: () => void }) {
  const title = event.kind === 'Personne' ? 'Personne détectée' : 'Animal détecté';
  const durLabel = formatDuration(event.dur);

  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={styles.thumb}>
        <LinearGradient colors={['#252838', '#14161f']} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={styles.thumbFrame} />
        <Text style={styles.thumbDur}>{durLabel}</Text>
      </View>
      <View style={styles.info}>
        <View style={styles.titleRow}>
          <View style={styles.dot} />
          <Text style={styles.title}>{title}</Text>
        </View>
        <Text style={styles.when}>{formatWhen(event.timestamp)}</Text>
        <Text style={styles.meta}>{event.dur} secondes · {event.conf} %</Text>
      </View>
      <ChevronRightIcon size={7} color={color.neutral700} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 11,
    alignItems: 'center',
    width: '100%',
    padding: 9,
    borderRadius: 11,
    backgroundColor: color.surface,
  },
  thumb: {
    width: 74,
    height: 52,
    borderRadius: 7,
    overflow: 'hidden',
  },
  thumbFrame: {
    position: 'absolute',
    left: 9,
    top: 8,
    width: 26,
    height: 34,
    borderWidth: 1,
    borderColor: color.accent600,
    borderRadius: 3,
  },
  thumbDur: {
    position: 'absolute',
    right: 5,
    bottom: 4,
    fontFamily: font.regular,
    fontSize: 8.5,
    color: color.neutral400,
    fontVariant: ['tabular-nums'],
  },
  info: {
    flex: 1,
    gap: 3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: color.accent,
  },
  title: {
    fontFamily: font.medium,
    fontSize: 13,
    color: color.text,
  },
  when: {
    fontFamily: font.regular,
    fontSize: 11,
    color: color.neutral500,
    fontVariant: ['tabular-nums'],
  },
  meta: {
    fontFamily: font.regular,
    fontSize: 11,
    color: color.neutral600,
  },
});
