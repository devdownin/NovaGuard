import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { color, font, radius, shadow } from '../theme';
import { useAppState } from '../state/AppStateContext';
import { Permissions } from '../state/types';
import { SolidAccentButton } from './OutlineButton';

const STEPS = [
  {
    n: '1',
    title: 'Détection locale',
    body: 'Les personnes et les animaux sont reconnus directement sur l’appareil.',
  },
  {
    n: '2',
    title: 'Enregistrement automatique',
    body: 'La vidéo démarre dès qu’une détection est confirmée.',
  },
  {
    n: '3',
    title: 'Vidéos conservées localement',
    body: 'Rien ne quitte votre téléphone, aucun compte n’est requis.',
  },
];

export function OnboardingModal() {
  const { onb, onbNext, onbFinish, perms, grantPermission } = useAppState();

  if (!onb) return null;

  const permRows: {
    key: keyof Permissions; label: string; note: string; enabled: boolean;
  }[] = [
    { key: 'cam', label: 'Caméra', note: 'Indispensable à la surveillance', enabled: true },
    // Both optional permissions unlock together, on the camera. Chaining
    // notifications behind the microphone contradicted the line right above
    // them — refusing the mic, which this screen invites, left the alerts of a
    // surveillance app permanently out of reach, and nothing else in the app
    // asks for them.
    { key: 'mic', label: 'Microphone', note: 'Son des enregistrements', enabled: perms.cam },
    { key: 'notif', label: 'Notifications', note: "Alerte lors d'une détection", enabled: perms.cam },
  ];

  const blocked = !perms.cam;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <LinearGradient colors={['rgba(16,18,32,0.9)', 'rgba(16,18,32,0.98)']} style={styles.backdrop}>
        <View style={styles.panel}>
          {onb === 'intro' && (
            <View>
              <Text style={styles.kicker}>BIENVENUE</Text>
              <Text style={styles.headline}>NovaGuard transforme{'\n'}ce téléphone en caméra.</Text>
              <View style={{ gap: 14 }}>
                {STEPS.map(step => (
                  <View key={step.n} style={styles.stepRow}>
                    <View style={styles.stepBadge}>
                      <Text style={styles.stepBadgeText}>{step.n}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.stepTitle}>{step.title}</Text>
                      <Text style={styles.stepBody}>{step.body}</Text>
                    </View>
                  </View>
                ))}
              </View>
              <SolidAccentButton label="CONTINUER" onPress={onbNext} style={{ width: '100%', marginTop: 22 }} />
            </View>
          )}

          {onb === 'perms' && (
            <View>
              <Text style={styles.kicker}>AUTORISATIONS</Text>
              <Text style={styles.headlineSm}>Trois accès, demandés{'\n'}un par un.</Text>
              <Text style={styles.subtext}>
                Vous pouvez refuser la notification et le micro : la surveillance fonctionnera quand même.
              </Text>
              <View style={{ gap: 8 }}>
                {permRows.map(row => {
                  const granted = perms[row.key];
                  const disabled = !row.enabled || granted;
                  return (
                    <View
                      key={row.key}
                      style={[
                        styles.permRow,
                        {
                          opacity: row.enabled ? 1 : 0.4,
                          backgroundColor: granted ? color.accent900 : 'transparent',
                          borderColor: granted ? color.accent700 : color.neutral800,
                        },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.permLabel}>{row.label}</Text>
                        <Text style={styles.permNote}>{row.note}</Text>
                      </View>
                      <Pressable
                        testID={`onb-${row.key}`}
                        onPress={() => grantPermission(row.key)}
                        disabled={disabled}
                        style={[
                          styles.permButton,
                          {
                            borderColor: granted ? color.accent700 : row.enabled ? color.accent : color.neutral800,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.permButtonText,
                            { color: granted ? color.accent300 : row.enabled ? color.accent : color.neutral600 },
                          ]}
                        >
                          {granted ? 'Autorisé' : 'Autoriser'}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
              <SolidAccentButton
                label={blocked ? "AUTORISER LA CAMÉRA D'ABORD" : 'COMMENCER'}
                onPress={onbFinish}
                disabled={blocked}
                style={{ width: '100%', marginTop: 18 }}
              />
            </View>
          )}
        </View>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  panel: {
    padding: 20,
    paddingTop: 24,
    paddingBottom: 26,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: color.surface,
    ...shadow.lg,
  },
  kicker: {
    fontFamily: font.regular,
    fontSize: 11,
    letterSpacing: 1.5,
    color: color.accent300,
    marginBottom: 8,
  },
  headline: {
    fontFamily: font.medium,
    fontSize: 24,
    lineHeight: 27.6,
    color: color.text,
    marginBottom: 18,
  },
  headlineSm: {
    fontFamily: font.medium,
    fontSize: 21,
    lineHeight: 25.2,
    color: color.text,
    marginBottom: 6,
  },
  subtext: {
    fontFamily: font.regular,
    fontSize: 12,
    color: color.neutral500,
    marginBottom: 16,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: color.accent700,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: {
    fontFamily: font.regular,
    fontSize: 11,
    color: color.accent300,
  },
  stepTitle: {
    fontFamily: font.medium,
    fontSize: 13.5,
    color: color.text,
  },
  stepBody: {
    fontFamily: font.regular,
    fontSize: 12,
    color: color.neutral500,
    marginTop: 2,
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.lg - 3,
    borderWidth: 1,
  },
  permLabel: { fontFamily: font.medium, fontSize: 13, color: color.text },
  permNote: { fontFamily: font.regular, fontSize: 11, color: color.neutral600, marginTop: 1 },
  permButton: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  permButtonText: {
    fontFamily: font.regular,
    fontSize: 11.5,
  },
});
