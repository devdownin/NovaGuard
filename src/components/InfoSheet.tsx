import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { color, font } from '../theme';
import { useAppState } from '../state/AppStateContext';
import { THIRD_PARTY_LICENSES } from '../constants/app';
import { Sheet } from './Sheet';
import { PrimaryOutlineButton } from './OutlineButton';
import { ValueButton } from './SetupRows';

const TITLES: Record<'perms' | 'data' | 'licenses', string> = {
  perms: 'Permissions',
  data: 'Données stockées',
  licenses: 'Licences tierces',
};

export function InfoSheet() {
  const { info, closeInfo, perms, events, grantPermission } = useAppState();

  /**
   * Refusing a permission has to be recoverable here.
   *
   * Onboarding was the only place in the app that ever asked for one, and it is
   * shown once — so a permission refused there, which that screen explicitly
   * invites for the microphone and the notifications, could never be granted
   * again. This panel was the natural second chance and only reported the
   * state it was powerless to change.
   */
  const rows = info === 'perms'
    ? [
      { key: 'cam' as const, label: 'Caméra', note: 'Flux vidéo local', value: 'Autorisée' },
      { key: 'mic' as const, label: 'Microphone', note: 'Audio des vidéos', value: 'Autorisé' },
      { key: 'notif' as const, label: 'Notifications', note: 'Alertes de détection', value: 'Autorisées' },
      // Granted by installing the app: nothing to ask for, so nothing to press.
      { label: 'Stockage', note: 'Écriture des vidéos', value: 'Autorisé' },
    ]
    : info === 'licenses'
      ? THIRD_PARTY_LICENSES.map(lib => ({ label: lib.name, note: lib.note, value: lib.license }))
      : [
        { label: 'Vidéos enregistrées', note: "Dossier privé de l'application", value: `${events.length} fichiers` },
        { label: 'Vignettes', note: 'Générées localement', value: '2,1 Mo' },
        { label: 'Journal de détection', note: 'Type, heure, confiance', value: '48 Ko' },
        { label: 'Envoyé sur un serveur', note: 'Aucune donnée sortante', value: 'Rien' },
      ];

  return (
    <Sheet visible={!!info} onClose={closeInfo} maxHeightPercent={76}>
      <Text style={styles.title}>{info ? TITLES[info] : ''}</Text>
      {rows.map(row => {
        const key = 'key' in row ? row.key : null;
        const granted = key ? perms[key] : true;
        return (
          <View key={row.label} style={styles.row} testID={key ? `perm-${key}` : undefined}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{row.label}</Text>
              <Text style={styles.note}>{row.note}</Text>
            </View>
            {granted
              ? <Text style={styles.value}>{row.value}</Text>
              : <ValueButton label="Autoriser" onPress={() => grantPermission(key!)} />}
          </View>
        );
      })}
      <PrimaryOutlineButton label="Fermer" onPress={closeInfo} style={{ width: '100%', marginTop: 16 }} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: font.medium,
    fontSize: 17,
    color: color.text,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 14,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  label: { fontFamily: font.regular, fontSize: 13, color: color.text },
  note: { fontFamily: font.regular, fontSize: 11, color: color.neutral600, marginTop: 1 },
  value: { fontFamily: font.regular, fontSize: 12, color: color.accent300 },
});
