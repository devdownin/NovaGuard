/**
 * NovaGuard — caméra intelligente de surveillance
 * @format
 */

import React, { useEffect, useState } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { color } from './src/theme';
import { AppStateProvider, useAppState } from './src/state/AppStateContext';
import { SurveillanceScreen } from './src/screens/SurveillanceScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { SetupScreen } from './src/screens/SetupScreen';
import { TabBar } from './src/components/TabBar';
import { VideoDetailSheet } from './src/components/VideoDetailSheet';
import { InfoSheet } from './src/components/InfoSheet';
import { OnboardingModal } from './src/components/OnboardingModal';
import { ConfirmDialog } from './src/components/ConfirmDialog';
import { SplashScreen, SPLASH_MIN_DURATION_MS } from './src/components/SplashScreen';

function AppShell() {
  const {
    hydrated, tab, confirmDelete, cancelDelete, doDelete,
    confirmWipe, cancelWipe, doWipe, events,
  } = useAppState();

  // Keeps the splash up for a minimum stretch so its progress bar reads as
  // real feedback instead of a flash, even when hydration itself is instant.
  const [minDurationElapsed, setMinDurationElapsed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinDurationElapsed(true), SPLASH_MIN_DURATION_MS);
    return () => clearTimeout(t);
  }, []);

  if (!hydrated || !minDurationElapsed) {
    return <SplashScreen />;
  }

  return (
    <View style={styles.root}>
      {tab === 'cam' && <SurveillanceScreen />}
      {tab === 'hist' && <HistoryScreen />}
      {tab === 'setup' && <SetupScreen />}
      <TabBar />

      <VideoDetailSheet />
      <InfoSheet />
      <OnboardingModal />

      <ConfirmDialog
        visible={confirmDelete}
        title="Supprimer cette vidéo ?"
        body="La vidéo sera définitivement supprimée de votre appareil. Cette action est irréversible."
        confirmLabel="Supprimer"
        onCancel={cancelDelete}
        onConfirm={doDelete}
      />
      <ConfirmDialog
        visible={confirmWipe}
        title="Supprimer toutes les vidéos ?"
        body={`${events.length} vidéos seront supprimées de cet appareil. Cette action est irréversible.`}
        confirmLabel="Tout supprimer"
        onCancel={cancelWipe}
        onConfirm={doWipe}
      />
    </View>
  );
}

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={color.bg} />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <AppStateProvider>
          <AppShell />
        </AppStateProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: color.bg,
  },
  root: {
    flex: 1,
    backgroundColor: color.bg,
  },
});

export default App;
