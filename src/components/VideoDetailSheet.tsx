import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { color, font, radius } from '../theme';
import { useAppState } from '../state/AppStateContext';
import { formatWhen } from '../utils/date';
import { Sheet } from './Sheet';
import { PlayIcon } from './icons';
import { PrimaryOutlineButton, SecondaryOutlineButton, TextButton } from './OutlineButton';

export function VideoDetailSheet() {
  const { events, selected, selectEvent, askDelete } = useAppState();
  const event = events.find(e => e.id === selected) ?? null;

  return (
    <Sheet visible={!!event} onClose={() => selectEvent(null)}>
      {event && (
        <View>
          <View style={styles.preview}>
            <LinearGradient colors={['#252838', '#0f1119']} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
            <View style={styles.previewFrame} />
            <View style={styles.playButton}>
              <PlayIcon size={16} color={color.accent} />
            </View>
            <View style={styles.progressTrack}>
              <View style={styles.progressFill} />
            </View>
          </View>

          <View style={styles.titleRow}>
            <View style={styles.dot} />
            <Text style={styles.title}>{event.kind === 'Personne' ? 'Personne détectée' : 'Animal détecté'}</Text>
          </View>

          <View style={styles.grid}>
            <StatCell label="Date & heure" value={formatWhen(event.timestamp)} />
            <StatCell label="Type" value={event.kind} />
            <StatCell label="Durée" value={`${event.dur} secondes`} />
            <StatCell label="Confiance" value={`${event.conf} %`} accent />
            <StatCell label="Fichier" value={event.size} />
            <StatCell label="Stockage" value="Local" />
          </View>

          <View style={styles.actions}>
            <PrimaryOutlineButton label="Partager" onPress={() => {}} style={{ flex: 1 }} />
            <SecondaryOutlineButton label="Supprimer" onPress={askDelete} style={{ flex: 1 }} />
            <TextButton label="Fermer" onPress={() => selectEvent(null)} style={{ flex: 1 }} />
          </View>
        </View>
      )}
    </Sheet>
  );
}

function StatCell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={[styles.cellValue, accent && { color: color.accent300 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    aspectRatio: 16 / 10,
    borderRadius: radius.lg - 2,
    overflow: 'hidden',
  },
  previewFrame: {
    position: 'absolute',
    left: '20%',
    top: '16%',
    width: '40%',
    height: '62%',
    borderWidth: 1.5,
    borderColor: color.accent600,
    borderRadius: 5,
  },
  playButton: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 50,
    height: 50,
    marginLeft: -25,
    marginTop: -25,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(22,24,38,0.5)',
  },
  progressTrack: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 11,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(233,233,237,0.18)',
  },
  progressFill: {
    width: '34%',
    height: '100%',
    borderRadius: 2,
    backgroundColor: color.accent,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 15,
    marginBottom: 12,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent },
  title: { fontFamily: font.medium, fontSize: 17, color: color.text },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 1,
    backgroundColor: color.divider,
    borderRadius: 10,
    overflow: 'hidden',
  },
  cell: {
    width: '49.95%',
    backgroundColor: color.surface,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  cellLabel: {
    fontFamily: font.regular,
    fontSize: 9.5,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: color.neutral600,
  },
  cellValue: {
    fontFamily: font.regular,
    fontSize: 13,
    color: color.text,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 14,
  },
});
