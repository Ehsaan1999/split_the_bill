import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { recognizeReceiptViaCloud } from '../../lib/cloudOcr';
import { recognizeReceiptViaGemini } from '../../lib/cloudOcrGemini';
import { type Group, listFriends, listGroups } from '../../lib/db';
import { generateId } from '../../lib/id';
import { recognizeReceiptOnDevice } from '../../lib/ocrOnDevice';
import { getEffectiveSubtotal } from '../../lib/receiptParser';
import { useNewBill } from '../../context/NewBillContext';
import { useTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import type { Friend } from '../../types/bill';
import type { RootStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'PickReceipt'>;

export default function PickReceiptScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { setParticipantIds, setMerchant, setItems, setBillTotals, reset } = useNewBill();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState('');

  useFocusEffect(
    useCallback(() => {
      reset();
      setSelected([]);
      listFriends().then(setFriends);
      listGroups().then(setGroups);
    }, [reset])
  );

  const toggleFriend = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
  };

  const toggleGroup = (group: Group) => {
    const isFullyApplied = group.memberIds.length > 0 && group.memberIds.every((id) => selected.includes(id));
    setSelected((prev) =>
      isFullyApplied
        ? prev.filter((id) => !group.memberIds.includes(id))
        : Array.from(new Set([...prev, ...group.memberIds]))
    );
  };

  const onPick = async () => {
    if (selected.length === 0) {
      Alert.alert('Pick friends first', 'Select at least one friend who was part of this bill.');
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Photo library access is required to pick a receipt image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) return;

    const asset = result.assets[0];
    setBusy(true);
    try {
      setStatusText('Scanning receipt on-device…');
      const onDevice = await recognizeReceiptOnDevice(asset.uri);
      let parsed = onDevice.parsed;

      if (!onDevice.confident) {
        if (!asset.base64) {
          Alert.alert(
            'Cloud scan unavailable',
            "Image data unavailable for cloud scan.\n\nContinuing with the on-device scan — you can fix anything wrong on the next screen."
          );
        } else {
          const cloudErrors: string[] = [];

          setStatusText('On-device scan was unsure — asking Gemini for a second look…');
          try {
            parsed = await recognizeReceiptViaGemini(asset.base64, asset.mimeType ?? 'image/jpeg');
          } catch (geminiError: any) {
            console.error('[PickReceipt] Gemini scan failed', geminiError);
            cloudErrors.push(`Gemini: ${geminiError.message ?? 'unknown error'}`);

            setStatusText('Gemini scan unavailable — trying OpenAI…');
            try {
              parsed = await recognizeReceiptViaCloud(asset.base64, asset.mimeType ?? 'image/jpeg');
            } catch (openAiError: any) {
              console.error('[PickReceipt] OpenAI scan failed', openAiError);
              cloudErrors.push(`OpenAI: ${openAiError.message ?? 'unknown error'}`);
            }
          }

          if (cloudErrors.length > 0 && parsed === onDevice.parsed) {
            Alert.alert(
              'Cloud scan unavailable',
              `${cloudErrors.join('\n')}\n\nContinuing with the on-device scan — you can fix anything wrong on the next screen.`
            );
          }
        }
      }

      setParticipantIds(selected);
      setMerchant(parsed.merchant);
      setItems(
        parsed.items.map((item) => {
          const qty = Number.isFinite(item.qty) && item.qty > 0 ? Math.floor(item.qty) : 1;
          return {
            id: generateId(),
            name: item.name,
            qty,
            unitPrice: item.unitPrice,
            unitAssignments: Array.from({ length: qty }, () => []),
          };
        })
      );
      setBillTotals({
        subtotal: getEffectiveSubtotal(parsed),
        discountPercent: parsed.discountPercent,
        discountAmount: parsed.discountAmount,
        taxPercent: parsed.taxPercent,
        taxAmount: parsed.taxAmount,
      });

      navigation.navigate('ReviewItems');
    } catch (error: any) {
      Alert.alert('Scan failed', error.message ?? 'Could not read the receipt. Try again or enter items manually.');
      setParticipantIds(selected);
      setItems([]);
      setBillTotals({ subtotal: 0, discountPercent: null, discountAmount: null, taxPercent: null, taxAmount: null });
      navigation.navigate('ReviewItems');
    } finally {
      setBusy(false);
      setStatusText('');
    }
  };

  if (busy) {
    return (
      <View style={styles.busyContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.busyText}>{statusText}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      {groups.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Quick add a group</Text>
          <View style={styles.chipRow}>
            {groups.map((group) => {
              const isApplied = group.memberIds.length > 0 && group.memberIds.every((id) => selected.includes(id));
              return (
                <Pressable
                  key={group.id}
                  style={[styles.chip, styles.groupChip, isApplied && styles.chipSelected]}
                  onPress={() => toggleGroup(group)}
                >
                  <Text style={[styles.chipText, isApplied && styles.chipTextSelected]}>{group.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      <Text style={styles.sectionTitle}>Who&apos;s in on this bill?</Text>
      <Text style={styles.hint}>Tap a group above to add its members, then add or remove anyone individually below.</Text>
      {friends.length === 0 ? (
        <Text style={styles.empty}>Add friends first from the Friends screen.</Text>
      ) : (
        <View style={styles.chipRow}>
          {friends.map((friend) => {
            const isSelected = selected.includes(friend.id);
            return (
              <Pressable
                key={friend.id}
                style={[styles.chip, isSelected && styles.chipSelected]}
                onPress={() => toggleFriend(friend.id)}
              >
                <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{friend.name}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <Pressable style={styles.pickButton} onPress={onPick}>
        <Text style={styles.pickButtonText}>Pick receipt photo from gallery</Text>
      </Pressable>
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12, color: colors.text },
    hint: { color: colors.textMuted, marginBottom: 12, fontSize: 13 },
    empty: { color: colors.textMuted, marginBottom: 16 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
    chip: {
      borderWidth: 1,
      borderColor: colors.chipBorder,
      borderRadius: 20,
      paddingVertical: 8,
      paddingHorizontal: 16,
      backgroundColor: colors.chipBackground,
    },
    groupChip: { borderStyle: 'dashed' },
    chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary, borderStyle: 'solid' },
    chipText: { color: colors.text },
    chipTextSelected: { color: colors.primaryText, fontWeight: '600' },
    pickButton: { backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 8 },
    pickButtonText: { color: colors.primaryText, fontWeight: '600', textAlign: 'center' },
    busyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.background },
    busyText: { marginTop: 16, color: colors.textMuted, textAlign: 'center' },
  });
