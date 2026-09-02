import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Slider from '@react-native-community/slider';
import { color, font, radius } from '../theme';
import { useAppState } from '../state/AppStateContext';
import { Retention, Sensitivity } from '../state/types';
import { formatBytes } from '../recording/library';
import { APP_LICENSE, APP_VERSION, ISSUES_URL, REPO_URL } from '../constants/app';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { SettingRow, StaticValue, ValueButton } from '../components/SetupRows';
import { Switch } from '../components/Switch';
import { SegmentedControl } from '../components/SegmentedControl';
import { PrimaryOutlineButton, SecondaryOutlineButton } from '../components/OutlineButton';
import { ShieldCheckIcon } from '../components/icons';

const SENS_OPTIONS: { label: string; value: Sensitivity }[] = [
  { label: 'Basse', value: 'Basse' },
  { label: 'Moyenne', value: 'Moyenne' },
  { label: 'Haute', value: 'Haute' },
];

const RETENTION_OPTIONS: Retention[] = ['1 jour', '7 jours', '30 jours', '90 jours', 'Toujours'];

// The sensitivity setting is really an analysis rate: it decides how often the
// scene is looked at, so it decides how fast a subject is confirmed. Saying so
// beats leaving three words the user has to guess at.
const SENS_HINT: Record<Sensitivity, string> = {
  Basse: '1 image analysée par seconde — économe, mais un passage rapide peut échapper',
  Moyenne: '3 images par seconde',
  Haute: '5 images par seconde — détection la plus réactive, batterie la plus sollicitée',
};

export function SetupScreen() {
  const s = useAppState();
  const { settings, events, storage: store } = s;

  // Share of the whole volume taken by NovaGuard's own clips. Kept visible at a
  // sliver once anything is stored, so the bar never reads as "nothing on disk".
  const usedPercent = store.total > 0
    ? Math.min(100, Math.max(store.used > 0 ? 1 : 0, (store.used / store.total) * 100))
    : 0;

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Setup</Text>
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>

        <CollapsibleSection title="SURVEILLANCE" expanded={settings.exp.surv} onToggle={() => s.toggleSection('surv')}>
          <SettingRow label="Caméra utilisée">
            <ValueButton label={settings.camera} onPress={s.cycleCamera} />
          </SettingRow>
          <SettingRow
            label="Reprendre à l'ouverture"
            subtitle="Android interdit à la caméra de démarrer seule après un redémarrage"
          >
            <Switch value={settings.resumeOnLaunch} onValueChange={s.toggleResumeOnLaunch} />
          </SettingRow>
          <SettingRow label="Mode nuit" subtitle="Disponible sur cet appareil">
            <Switch value={settings.night} onValueChange={s.toggleNight} />
          </SettingRow>
        </CollapsibleSection>

        <CollapsibleSection title="DÉTECTION" expanded={settings.exp.det} onToggle={() => s.toggleSection('det')}>
          <SettingRow label="Détecter les personnes">
            <Switch value={settings.person} onValueChange={s.togglePerson} />
          </SettingRow>
          <SettingRow label="Détecter les animaux">
            <Switch value={settings.animal} onValueChange={s.toggleAnimal} />
          </SettingRow>
          <SettingRow label="Zoom auto sur les visages" subtitle="Gros plan 4 s, puis retour sur la personne">
            <Switch value={settings.autoZoom} onValueChange={s.toggleAutoZoom} />
          </SettingRow>
          <View style={styles.subBlock}>
            <Text style={styles.subLabel}>Sensibilité</Text>
            <SegmentedControl
              options={SENS_OPTIONS}
              value={settings.sens}
              onChange={s.setSensitivity}
              fontSize={11.5}
              paddingVertical={7}
              segmentRadius={7}
            />
            <Text style={styles.hint}>
              {SENS_HINT[settings.sens]}
            </Text>
          </View>
          <View style={[styles.subBlock, { paddingTop: 14, paddingBottom: 2 }]}>
            <View style={styles.thresholdRow}>
              <Text style={styles.subLabel}>Seuil de confiance</Text>
              <Text style={styles.thresholdValue}>{settings.threshold} %</Text>
            </View>
            <Slider
              minimumValue={50}
              maximumValue={95}
              step={5}
              value={settings.threshold}
              onSlidingComplete={s.setThreshold}
              minimumTrackTintColor={color.accent}
              maximumTrackTintColor={color.neutral800}
              thumbTintColor={color.accent}
            />
          </View>
        </CollapsibleSection>

        <CollapsibleSection title="ENREGISTREMENT" expanded={settings.exp.rec} onToggle={() => s.toggleSection('rec')}>
          <SettingRow label="Durée après détection">
            <ValueButton label={settings.post} onPress={s.cyclePost} />
          </SettingRow>
          <SettingRow label="Durée maximale">
            <ValueButton label={settings.max} onPress={s.cycleMax} />
          </SettingRow>
          <SettingRow
            label="Qualité vidéo"
            subtitle={settings.quality === '4K'
              ? 'Le 4K quadruple aussi le coût de l’analyse des images'
              : undefined}
          >
            <ValueButton label={settings.quality} onPress={s.cycleQuality} />
          </SettingRow>
        </CollapsibleSection>

        <CollapsibleSection title="STOCKAGE" expanded={settings.exp.sto} onToggle={() => s.toggleSection('sto')}>
          <View style={[styles.subBlock, { borderTopWidth: 1, borderTopColor: color.divider }]}>
            <View style={styles.storageBarTrack}>
              <View style={[styles.storageBarFill, { width: `${usedPercent}%` }]} />
            </View>
            <View style={styles.storageStatsRow}>
              <View>
                <Text style={styles.storageStatLabel}>Utilisé</Text>
                <Text style={styles.storageStatValue}>{formatBytes(store.used)}</Text>
              </View>
              <View>
                <Text style={styles.storageStatLabel}>Disponible</Text>
                <Text style={styles.storageStatValue}>{formatBytes(store.free)}</Text>
              </View>
              <View>
                <Text style={styles.storageStatLabel}>Vidéos</Text>
                <Text style={styles.storageStatValue}>{events.length}</Text>
              </View>
            </View>
          </View>

          <View style={[styles.subBlock, { borderTopWidth: 1, borderTopColor: color.divider }]}>
            <Text style={styles.subLabel}>Conserver les vidéos</Text>
            <View style={styles.retentionWrap}>
              {RETENTION_OPTIONS.map(opt => {
                const on = settings.retention === opt;
                return (
                  <ValueButton
                    key={opt}
                    label={opt}
                    onPress={() => s.setRetention(opt)}
                    active={on}
                    pill
                  />
                );
              })}
            </View>
          </View>

          <SettingRow label="Suppression automatique" subtitle="Quand le stockage devient insuffisant">
            <Switch value={settings.autoDel} onValueChange={s.toggleAutoDel} />
          </SettingRow>

          <SecondaryOutlineButton label="Supprimer toutes les vidéos" onPress={s.wipeAllVideos} style={{ marginTop: 10 }} />
        </CollapsibleSection>

        <CollapsibleSection title="NOTIFICATIONS" expanded={settings.exp.not} onToggle={() => s.toggleSection('not')}>
          <SettingRow label="Notifications activées">
            <Switch value={settings.notif} onValueChange={s.toggleNotif} />
          </SettingRow>
          <SettingRow label="À chaque détection">
            <Switch value={settings.notifDet} onValueChange={s.toggleNotifDet} />
          </SettingRow>
          <SecondaryOutlineButton
            label="Son et vibration (Android)"
            onPress={s.openAlertSoundSettings}
            style={{ marginTop: 10 }}
          />
          <Text style={styles.hint}>
            Depuis Android 8, le son et la vibration d'une notification appartiennent au
            système, pas à l'application.
          </Text>
        </CollapsibleSection>

        <CollapsibleSection title="À PROPOS" expanded={settings.exp.about} onToggle={() => s.toggleSection('about')}>
          <SettingRow label="Version">
            <StaticValue label={APP_VERSION} />
          </SettingRow>
          <SettingRow label="Licence" subtitle="Logiciel libre et open source">
            <StaticValue label={APP_LICENSE} />
          </SettingRow>
          <View style={[styles.subBlock, { flexDirection: 'row', gap: 7 }]}>
            <PrimaryOutlineButton label="Code source" onPress={() => Linking.openURL(REPO_URL)} style={{ flex: 1 }} />
            <SecondaryOutlineButton label="Signaler un bug" onPress={() => Linking.openURL(ISSUES_URL)} style={{ flex: 1 }} />
          </View>
          <SecondaryOutlineButton label="Licences tierces" onPress={() => s.openInfo('licenses')} style={{ marginTop: 8, marginBottom: 6 }} />
        </CollapsibleSection>

        <LinearGradient
          colors={[color.accent900, color.surface]}
          locations={[0, 0.7]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.75, y: 1 }}
          style={styles.privacyCard}
        >
          <Text style={styles.privacyTitle}>CONFIDENTIALITÉ</Text>
          <View style={styles.privacyBody}>
            <ShieldCheckIcon size={18} color={color.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.privacyHeading}>Traitement local</Text>
              <Text style={styles.privacyText}>
                La détection s&apos;exécute sur l&apos;appareil. Les vidéos restent sur votre téléphone et ne sont jamais envoyées sur un serveur.
              </Text>
            </View>
          </View>
          <View style={styles.privacyActions}>
            <PrimaryOutlineButton label="Permissions" onPress={() => s.openInfo('perms')} style={{ flex: 1 }} />
            <SecondaryOutlineButton label="Données stockées" onPress={() => s.openInfo('data')} style={{ flex: 1 }} />
          </View>
        </LinearGradient>

        <Text style={styles.footer}>NovaGuard {APP_VERSION} · open source · détection sur appareil</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  title: {
    fontFamily: font.medium,
    fontSize: 20,
    color: color.text,
    paddingTop: 10,
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  list: {
    paddingHorizontal: 14,
    paddingBottom: 18,
    gap: 8,
  },
  subBlock: {
    paddingVertical: 12,
  },
  subLabel: {
    fontFamily: font.regular,
    fontSize: 13,
    color: color.text,
    marginBottom: 9,
  },
  thresholdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  thresholdValue: {
    fontFamily: font.regular,
    fontSize: 13,
    color: color.accent300,
    fontVariant: ['tabular-nums'],
  },
  storageBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: color.neutral900,
    overflow: 'hidden',
  },
  storageBarFill: {
    height: '100%',
    backgroundColor: color.accent600,
  },
  storageStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 9,
  },
  storageStatLabel: {
    fontFamily: font.regular,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: color.neutral600,
  },
  storageStatValue: {
    fontFamily: font.regular,
    fontSize: 13.5,
    color: color.text,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  hint: {
    fontFamily: font.regular,
    fontSize: 11,
    lineHeight: 15,
    color: color.neutral600,
    marginTop: 8,
  },
  retentionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  privacyCard: {
    borderRadius: radius.lg - 3,
    padding: 14,
  },
  privacyTitle: {
    fontFamily: font.semibold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: color.neutral300,
    marginBottom: 10,
  },
  privacyBody: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  privacyHeading: {
    fontFamily: font.medium,
    fontSize: 13.5,
    color: color.text,
  },
  privacyText: {
    fontFamily: font.regular,
    fontSize: 11.5,
    lineHeight: 17,
    color: color.neutral400,
    marginTop: 2,
  },
  privacyActions: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 12,
  },
  footer: {
    textAlign: 'center',
    fontFamily: font.regular,
    fontSize: 10,
    color: color.neutral700,
    paddingTop: 6,
    paddingBottom: 2,
  },
});
