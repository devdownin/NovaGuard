import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { color, font } from '../theme';
import { useAppState } from '../state/AppStateContext';
import { THIRD_PARTY_LICENSES } from '../constants/app';
import { Sheet } from './Sheet';
import { PrimaryOutlineButton } from './OutlineButton';

const TITLES: Record<'perms' | 'data' | 'licenses', string> = {
  perms: 'Permissions',
  data: 'Données stockées',
  licenses: 'Licences tierces',
};

export function InfoSheet() {
  const { info, closeInfo, perms, events } = useAppState();

  const rows = info === 'perms'
    ? [
      { label: 'Caméra', note: 'Flux vidéo local', value: perms.cam ? 'Autorisée' : 'Refusée' },
      { label: 'Microphone', note: 'Audio des vidéos', value: perms.mic ? 'Autorisé' : 'Refusé' },
      { label: 'Notifications', note: 'Alertes de détection', value: perms.notif ? 'Autorisées' : 'Refusées' },
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
      {rows.map(row => (
        <View key={row.label} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{row.label}</Text>
            <Text style={styles.note}>{row.note}</Text>
          </View>
          <Text style={styles.value}>{row.value}</Text>
        </View>
      ))}
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
