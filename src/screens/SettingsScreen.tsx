import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { clearApiKey, getApiKey, InvalidApiKeyError, setApiKey } from '../lib/apiKeyStore';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import type { ThemePreference } from '../theme/ThemeContext';

function ApiKeyField({
  label,
  hint,
  placeholder,
  provider,
  colors,
  styles,
}: {
  label: string;
  hint: string;
  placeholder: string;
  provider: 'gemini' | 'openai';
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getApiKey(provider).then((k) => {
      if (k) {
        setKey(k);
        setSaved(true);
      }
    });
  }, [provider]);

  const onSave = async () => {
    if (!key.trim()) return;
    try {
      await setApiKey(provider, key);
      setSaved(true);
      Alert.alert('Saved', `${label} saved on this device.`);
    } catch (err) {
      if (err instanceof InvalidApiKeyError) {
        Alert.alert('Invalid key', err.message);
      } else {
        Alert.alert('Could not save key', (err as Error).message ?? 'Unknown error');
      }
    }
  };

  const onClear = async () => {
    await clearApiKey(provider);
    setKey('');
    setSaved(false);
  };

  return (
    <View style={styles.section}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.hint}>{hint}</Text>
      <TextInput
        style={styles.input}
        value={key}
        onChangeText={setKey}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Pressable style={styles.saveButton} onPress={onSave}>
        <Text style={styles.saveButtonText}>Save</Text>
      </Pressable>
      {saved && (
        <Pressable style={styles.clearButton} onPress={onClear}>
          <Text style={styles.clearButtonText}>Remove saved key</Text>
        </Pressable>
      )}
    </View>
  );
}

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function SettingsScreen() {
  const { colors, preference, setPreference } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.label}>Appearance</Text>
        <View style={styles.themeRow}>
          {THEME_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              style={[styles.themeButton, preference === opt.value && styles.themeButtonActive]}
              onPress={() => setPreference(opt.value)}
            >
              <Text style={[styles.themeButtonText, preference === opt.value && styles.themeButtonTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ApiKeyField
        label="Gemini API key (default, free)"
        hint="Used first for cloud-assisted scanning when the on-device scan can't confidently read a receipt. Google's free tier covers normal personal use. Get one at aistudio.google.com/apikey."
        placeholder="AIza..."
        provider="gemini"
        colors={colors}
        styles={styles}
      />

      <ApiKeyField
        label="OpenAI API key (fallback)"
        hint="Used only if Gemini isn't configured or fails. Stored securely on this device only — never leaves it except when a scan is sent to OpenAI."
        placeholder="sk-..."
        provider="openai"
        colors={colors}
        styles={styles}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, padding: 16, backgroundColor: colors.background },
    section: { marginBottom: 24 },
    label: { fontSize: 16, fontWeight: '700', marginBottom: 4, color: colors.text },
    hint: { color: colors.textMuted, marginBottom: 12 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 12,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    saveButton: { backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 8 },
    saveButtonText: { color: colors.primaryText, fontWeight: '600', textAlign: 'center' },
    clearButton: { marginTop: 12, paddingVertical: 12 },
    clearButtonText: { color: colors.danger, textAlign: 'center' },
    themeRow: { flexDirection: 'row', gap: 8 },
    themeButton: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 10 },
    themeButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    themeButtonText: { textAlign: 'center', color: colors.text },
    themeButtonTextActive: { color: colors.primaryText, fontWeight: '600' },
  });
