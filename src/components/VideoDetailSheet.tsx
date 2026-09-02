import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Video from 'react-native-video';
import { color, font, radius } from '../theme';
import { useAppState } from '../state/AppStateContext';
import { formatBytes } from '../recording/library';
import { formatWhen } from '../utils/date';
import { Sheet } from './Sheet';
import { PlayIcon } from './icons';
import { SecondaryOutlineButton, TextButton } from './OutlineButton';

export function VideoDetailSheet() {
  const { events, selected, selectEvent, askDelete } = useAppState();
  // Memoised: this sheet stays mounted for the whole session, so the lookup ran
  // over the entire history on every provider render — including the ones the
  // frame processor triggers while surveillance is on.
  const event = useMemo(
    () => events.find(e => e.id === selected) ?? null,
    [events, selected],
  );
  const [playing, setPlaying] = useState(false);

  // Never carry playback over from the previously opened event.
  useEffect(() => { setPlaying(false); }, [selected]);

  const close = useCallback(() => {
    setPlaying(false);
    selectEvent(null);
  }, [selectEvent]);

  const hasClip = !!event?.path;

  return (
    <Sheet visible={!!event} onClose={close}>
      {event && (
        <View>
          <View style={styles.preview}>
            <LinearGradient colors={['#252838', '#0f1119']} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />

            {hasClip && playing ? (
              <Video
                source={{ uri: `file://${event.path}` }}
                style={StyleSheet.absoluteFill}
                resizeMode="contain"
                controls
                paused={false}
                onEnd={() => setPlaying(false)}
                onError={() => setPlaying(false)}
              />
            ) : hasClip ? (
              <Pressable
                style={styles.playButton}
                onPress={() => setPlaying(true)}
                accessibilityRole="button"
                accessibilityLabel="Lire l'enregistrement"
              >
                <PlayIcon size={16} color={color.accent} />
              </Pressable>
            ) : (
              // A sighting with no file: recording was refused, the disk was
              // full, or the clip has been reclaimed. Say so instead of showing
              // a play button that would do nothing.
              <Text style={styles.noClip}>AUCUNE VIDÉO POUR CET ÉVÈNEMENT</Text>
            )}
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
            <StatCell label="Taille" value={hasClip ? formatBytes(event.bytes) : '—'} />
            <StatCell
              label="Fichier"
              value={hasClip ? event.path!.split('/').pop()! : 'Aucun'}
              small
            />
          </View>

          <View style={styles.actions}>
            <SecondaryOutlineButton label="Supprimer" onPress={askDelete} style={{ flex: 1 }} />
            <TextButton label="Fermer" onPress={close} style={{ flex: 1 }} />
          </View>
        </View>
      )}
    </Sheet>
  );
}

interface StatCellProps {
  label: string;
  value: string;
  accent?: boolean;
  /** For the file name, which is long enough to need the room. */
  small?: boolean;
}

function StatCell({ label, value, accent, small }: StatCellProps) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={[styles.cellValue, small && styles.cellValueSmall, accent && styles.cellValueAccent]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    aspectRatio: 16 / 10,
    borderRadius: radius.lg - 2,
    overflow: 'hidden',
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
  noClip: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    marginTop: -6,
    textAlign: 'center',
    fontFamily: font.regular,
    fontSize: 9.5,
    letterSpacing: 1.6,
    color: color.neutral600,
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
  cellValueSmall: {
    fontSize: 11,
    lineHeight: 15,
  },
  cellValueAccent: {
    color: color.accent300,
  },
  actions: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 14,
  },
});
