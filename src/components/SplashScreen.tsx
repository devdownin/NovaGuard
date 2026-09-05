import React, { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import { color, font } from '../theme';
import { t } from '../i18n';
import {
  CameraIcon, DogIcon, PersonIcon, ShieldHomeIcon, ShieldLockIcon,
} from './icons';

const HOUSE_IMAGE = require('../../assets/splash/house-night.png');

/** How long the progress bar takes to fill — App.tsx keeps the splash mounted at least this long. */
export const SPLASH_MIN_DURATION_MS = 1600;

function Pulse({ children, minOpacity = 0.35, size = 1.08, duration = 1400 }: {
  children: React.ReactNode; minOpacity?: number; size?: number; duration?: number;
}) {
  const phase = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(phase, { toValue: 1, duration, useNativeDriver: true }),
        Animated.timing(phase, { toValue: 0, duration, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [phase, duration]);

  const opacity = phase.interpolate({ inputRange: [0, 1], outputRange: [minOpacity, 1] });
  const scale = phase.interpolate({ inputRange: [0, 1], outputRange: [1, size] });

  return (
    <Animated.View style={{ opacity, transform: [{ scale }] }}>
      {children}
    </Animated.View>
  );
}

function CornerBracket({ corner }: { corner: 'tl' | 'tr' | 'bl' | 'br' }) {
  const vertical: 'top' | 'bottom' = corner[0] === 't' ? 'top' : 'bottom';
  const horizontal: 'left' | 'right' = corner[1] === 'l' ? 'left' : 'right';
  return (
    <View
      style={[
        styles.bracket,
        { [vertical]: 0, [horizontal]: 0 },
        vertical === 'top' ? { borderTopWidth: 2 } : { borderBottomWidth: 2 },
        horizontal === 'left' ? { borderLeftWidth: 2 } : { borderRightWidth: 2 },
      ]}
    />
  );
}

function FeatureItem({ Icon, label, sub }: { Icon: typeof CameraIcon; label: string; sub: string }) {
  return (
    <View style={styles.featureItem}>
      <View style={styles.featureBadge}>
        <Icon size={20} color={color.accent} />
      </View>
      <Text style={styles.featureLabel}>{label}</Text>
      <Text style={styles.featureSub}>{sub}</Text>
    </View>
  );
}

export function SplashScreen() {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: SPLASH_MIN_DURATION_MS,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const progressWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <View style={styles.lensArea}>
          <Pulse minOpacity={0.25} size={1.15} duration={1500}>
            <View style={styles.ringOuter} />
          </Pulse>
          <View style={styles.ringInner} />
          <Pulse minOpacity={0.5} size={1.06} duration={1100}>
            <View style={styles.lensGlow} />
          </Pulse>
          <View style={styles.lens}>
            <View style={styles.lensReflection} />
          </View>

          <CornerBracket corner="tl" />
          <CornerBracket corner="tr" />
          <CornerBracket corner="bl" />
          <CornerBracket corner="br" />

          <View style={styles.frameDotTop} />
          <View style={styles.frameDotBottom} />

          <View style={[styles.sideFrame, styles.sideFrameLeft]}>
            <PersonIcon size={22} color={color.accent} />
          </View>
          <View style={[styles.sideFrame, styles.sideFrameRight]}>
            <DogIcon size={22} color={color.accent} />
          </View>
        </View>

        <View style={styles.wordmarkRow}>
          <ShieldHomeIcon size={34} color={color.accent} />
          <Text style={styles.wordmark}>
            <Text style={styles.wordmarkAccent}>Nova</Text>
            <Text style={styles.wordmarkWhite}>Guard</Text>
          </Text>
        </View>

        <Text style={styles.taglineMuted}>{t('splash.tagline1')}</Text>
        <Text style={styles.taglineAccent}>{t('splash.tagline2')}</Text>

        <View style={styles.featureRow}>
          <FeatureItem Icon={PersonIcon} label={t('splash.detect')} sub={t('splash.detect.sub')} />
          <View style={styles.featureDivider} />
          <FeatureItem Icon={CameraIcon} label={t('splash.record')} sub={t('splash.record.sub')} />
          <View style={styles.featureDivider} />
          <FeatureItem Icon={ShieldLockIcon} label={t('splash.protect')} sub={t('splash.protect.sub')} />
        </View>
      </View>

      <View style={styles.houseWrap}>
        <Image source={HOUSE_IMAGE} style={styles.houseImage} resizeMode="cover" />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>{t('splash.loading')}</Text>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>
      </View>
    </View>
  );
}

const LENS_SIZE = 118;
const RING_INNER_SIZE = 172;
const RING_OUTER_SIZE = 220;
const FRAME_SIZE = 240;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.bg,
    justifyContent: 'space-between',
  },
  top: {
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 24,
  },
  lensArea: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  ringOuter: {
    position: 'absolute',
    width: RING_OUTER_SIZE,
    height: RING_OUTER_SIZE,
    borderRadius: RING_OUTER_SIZE / 2,
    borderWidth: 1,
    borderColor: color.accent700,
  },
  ringInner: {
    position: 'absolute',
    width: RING_INNER_SIZE,
    height: RING_INNER_SIZE,
    borderRadius: RING_INNER_SIZE / 2,
    borderWidth: 1,
    borderColor: color.accent800,
  },
  lensGlow: {
    position: 'absolute',
    width: LENS_SIZE + 34,
    height: LENS_SIZE + 34,
    borderRadius: (LENS_SIZE + 34) / 2,
    backgroundColor: 'rgba(145,132,217,0.30)',
  },
  lens: {
    width: LENS_SIZE,
    height: LENS_SIZE,
    borderRadius: LENS_SIZE / 2,
    backgroundColor: '#14161f',
    borderWidth: 3,
    borderColor: color.accent400,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  lensReflection: {
    position: 'absolute',
    top: 16,
    left: 22,
    width: 26,
    height: 18,
    borderRadius: 13,
    backgroundColor: 'rgba(233,233,237,0.22)',
    transform: [{ rotate: '-24deg' }],
  },
  bracket: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderColor: color.accent500,
  },
  frameDotTop: {
    position: 'absolute',
    top: 0,
    left: '50%',
    marginLeft: -2,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.accent500,
  },
  frameDotBottom: {
    position: 'absolute',
    bottom: 0,
    left: '50%',
    marginLeft: -2,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.accent500,
  },
  sideFrame: {
    position: 'absolute',
    top: '50%',
    marginTop: -19,
    width: 38,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: color.accent700,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideFrameLeft: { left: -6 },
  sideFrameRight: { right: -6 },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  wordmark: {
    fontFamily: font.semibold,
    fontSize: 32,
    letterSpacing: -0.4,
  },
  wordmarkAccent: {
    color: color.accent,
  },
  wordmarkWhite: {
    color: color.text,
  },
  taglineMuted: {
    fontFamily: font.regular,
    fontSize: 11.5,
    letterSpacing: 2.6,
    color: color.neutral400,
    textAlign: 'center',
  },
  taglineAccent: {
    fontFamily: font.medium,
    fontSize: 12.5,
    letterSpacing: 2.6,
    color: color.accent300,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 26,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  featureItem: {
    width: 92,
    alignItems: 'center',
  },
  featureBadge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  featureLabel: {
    fontFamily: font.medium,
    fontSize: 12.5,
    color: color.text,
  },
  featureSub: {
    fontFamily: font.regular,
    fontSize: 10.5,
    color: color.neutral500,
    textAlign: 'center',
    marginTop: 1,
  },
  featureDivider: {
    width: 1,
    height: 40,
    backgroundColor: color.divider,
    marginTop: 14,
  },
  houseWrap: {
    flex: 1,
    minHeight: 90,
    marginTop: 18,
  },
  houseImage: {
    width: '100%',
    height: '100%',
  },
  footer: {
    paddingHorizontal: 32,
    paddingBottom: 34,
  },
  footerText: {
    fontFamily: font.regular,
    fontSize: 12.5,
    color: color.neutral500,
    textAlign: 'center',
    marginBottom: 10,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: color.neutral800,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: color.accent,
  },
});
