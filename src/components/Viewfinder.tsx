import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { color, font } from '../theme';
import { useAppState } from '../state/AppStateContext';
import { useAutoZoom } from '../camera/useAutoZoom';
import { uprightBoxToViewBox } from '../camera/framing';
import { formatDuration } from '../utils/date';
import { GridOverlay } from './GridOverlay';
import { CameraFeed } from './CameraFeed';

function ScanBeam() {
  const y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(y, { toValue: 1, duration: 6000, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [y]);

  const translateY = y.interpolate({ inputRange: [0, 1], outputRange: [-70, 400] });

  return (
    <Animated.View style={[styles.scanBeam, { transform: [{ translateY }] }]} pointerEvents="none">
      <LinearGradient
        colors={['transparent', 'rgba(145,132,217,0.13)']}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

function RecDot() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.25, duration: 550, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 550, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={[styles.recDot, { opacity }]} />;
}

export function Viewfinder() {
  const {
    monitoring, det, tracks, primaryTrackId, frameAspect, recSec, clock, perms, settings,
    recording, recError, cameraRef, reportCameraProblem,
  } = useAppState();

  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  }, []);

  const autoZoom = useAutoZoom({
    enabled: monitoring && settings.autoZoom,
    viewWidth: size.width,
    viewHeight: size.height,
  });

  const standbyLabel = !perms.cam
    ? 'AUTORISEZ LA CAMÉRA'
    : monitoring
      ? 'AUCUNE CAMÉRA DÉTECTÉE'
      : 'CAMÉRA EN VEILLE';
  const standbySubtext = !perms.cam ? 'Setup → Confidentialité → Permissions' : undefined;

  const overlayText = det
    ? det === 'Personne' ? 'Personne détectée · enregistrement' : 'Animal détecté · enregistrement'
    : monitoring ? 'Aucune détection' : 'Caméra en veille';
  const overlayDotColor = det ? color.accent : color.neutral600;

  return (
    <View style={[styles.frame, det ? styles.frameGlowActive : styles.frameGlowIdle]} onLayout={onLayout}>
      {/* Standby background — only visible where the real camera isn't covering it. */}
      <LinearGradient
        colors={['#20232f', '#14161f', '#0c0e15']}
        locations={[0, 0.45, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.35, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <GridOverlay />
      <View style={styles.glowBlob} pointerEvents="none" />
      <View style={styles.placeholderTextWrap} pointerEvents="none">
        <Text style={styles.placeholderText}>{standbyLabel}</Text>
        {standbySubtext && <Text style={styles.placeholderSubtext}>{standbySubtext}</Text>}
      </View>

      {/* Camera and detection boxes move together, so a box stays glued to its
          subject while the auto-zoom eases in and out. */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            transform: [
              { translateX: autoZoom.translateX },
              { translateY: autoZoom.translateY },
              { scale: autoZoom.scale },
            ],
          },
        ]}
      >
        <CameraFeed
          style={StyleSheet.absoluteFill}
          active={monitoring}
          viewWidth={size.width}
          viewHeight={size.height}
          onFrame={autoZoom.submitFrame}
          cameraRef={cameraRef}
          onProblem={reportCameraProblem}
        />

        {size.width > 0 && tracks.map(track => {
          const viewBox = uprightBoxToViewBox(track.box, frameAspect, size.width, size.height);
          const isPrimary = track.id === primaryTrackId;
          return (
            <View
              key={track.id}
              pointerEvents="none"
              style={[
                styles.detBox,
                isPrimary ? styles.detBoxPrimary : styles.detBoxSecondary,
                {
                  left: `${viewBox.x * 100}%`,
                  top: `${viewBox.y * 100}%`,
                  width: `${viewBox.width * 100}%`,
                  height: `${viewBox.height * 100}%`,
                },
              ]}
            >
              <View style={[styles.detLabelChip, !isPrimary && styles.detLabelChipSecondary]}>
                <Text style={styles.detLabelText}>{track.kind}</Text>
                <Text style={styles.detConfText}>{Math.round(track.confidence * 100)} %</Text>
              </View>
            </View>
          );
        })}
      </Animated.View>

      {monitoring && <ScanBeam />}

      <View style={styles.overlayChip}>
        <View style={[styles.overlayDot, { backgroundColor: overlayDotColor }]} />
        <Text style={styles.overlayText}>{overlayText}</Text>
      </View>

      {recording && (
        <View style={styles.recChip}>
          <RecDot />
          <Text style={styles.recLabel}>REC</Text>
          <Text style={styles.recClock}>{formatDuration(recSec)}</Text>
        </View>
      )}

      {autoZoom.phase !== 'idle' && (
        <View style={styles.zoomChip}>
          <Text style={styles.zoomChipText}>
            {autoZoom.phase === 'face' ? 'ZOOM VISAGE' : 'PLAN LARGE'}
          </Text>
        </View>
      )}

      {recError && (
        <View style={styles.errorChip} pointerEvents="none">
          <Text style={styles.errorText}>{recError}</Text>
        </View>
      )}

      <Text style={styles.clockText}>{clock}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    marginHorizontal: 14,
    borderRadius: 14,
    overflow: 'hidden',
  },
  frameGlowIdle: {
    borderWidth: 1,
    borderColor: color.neutral800,
  },
  frameGlowActive: {
    borderWidth: 1.5,
    borderColor: color.accent600,
  },
  glowBlob: {
    position: 'absolute',
    left: '0%',
    top: '35%',
    width: '65%',
    height: '48%',
    borderRadius: 999,
    backgroundColor: 'rgba(145,132,217,0.08)',
  },
  placeholderTextWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    alignItems: 'center',
    transform: [{ translateY: -12 }],
  },
  placeholderText: {
    fontFamily: font.regular,
    fontSize: 10,
    letterSpacing: 2.2,
    color: color.neutral700,
    textAlign: 'center',
  },
  placeholderSubtext: {
    fontFamily: font.regular,
    fontSize: 9,
    letterSpacing: 0.4,
    color: color.neutral700,
    textAlign: 'center',
    marginTop: 4,
  },
  scanBeam: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 70,
  },
  detBox: {
    position: 'absolute',
    borderRadius: 6,
  },
  detBoxPrimary: {
    borderWidth: 1.5,
    borderColor: color.accent,
  },
  // Extra subjects stay visible without competing with the one driving the recording.
  detBoxSecondary: {
    borderWidth: 1,
    borderColor: color.accent700,
  },
  detLabelChip: {
    position: 'absolute',
    top: -25,
    left: -1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 5,
    backgroundColor: 'rgba(22,24,38,0.82)',
    borderWidth: 1,
    borderColor: color.accent700,
  },
  detLabelChipSecondary: {
    opacity: 0.75,
  },
  detLabelText: {
    fontFamily: font.medium,
    fontSize: 10.5,
    letterSpacing: 0.4,
    color: color.accent300,
  },
  detConfText: {
    fontFamily: font.regular,
    fontSize: 10.5,
    color: color.neutral400,
  },
  overlayChip: {
    position: 'absolute',
    left: 12,
    top: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(22,24,38,0.68)',
    borderWidth: 1,
    borderColor: 'rgba(233,233,237,0.10)',
  },
  overlayDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  overlayText: {
    fontFamily: font.regular,
    fontSize: 10.5,
    color: color.neutral200,
  },
  recChip: {
    position: 'absolute',
    right: 12,
    top: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(22,24,38,0.68)',
    borderWidth: 1,
    borderColor: color.accent700,
  },
  recDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: color.accent,
  },
  recLabel: {
    fontFamily: font.semibold,
    fontSize: 10.5,
    letterSpacing: 1.2,
    color: color.accent300,
  },
  recClock: {
    fontFamily: font.regular,
    fontSize: 10.5,
    color: color.neutral400,
    fontVariant: ['tabular-nums'],
  },
  zoomChip: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(22,24,38,0.68)',
    borderWidth: 1,
    borderColor: color.accent700,
  },
  zoomChipText: {
    fontFamily: font.medium,
    fontSize: 9.5,
    letterSpacing: 1.1,
    color: color.accent300,
  },
  errorChip: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 34,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(22,24,38,0.86)',
    borderWidth: 1,
    borderColor: color.accent700,
  },
  errorText: {
    fontFamily: font.regular,
    fontSize: 10.5,
    color: color.accent300,
    textAlign: 'center',
  },
  clockText: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    fontFamily: font.regular,
    fontSize: 10,
    color: color.neutral600,
    fontVariant: ['tabular-nums'],
  },
});
