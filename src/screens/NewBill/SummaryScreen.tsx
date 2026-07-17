import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNewBill } from '../../context/NewBillContext';
import { computeBillSplit } from '../../lib/calc';
import { formatCurrency } from '../../lib/currency';
import { listFriends, saveBill } from '../../lib/db';
import { useTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import type { Friend, TipSplitMode } from '../../types/bill';
import type { RootStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Summary'>;

function toNumber(text: string): number {
  const n = parseFloat(text);
  return Number.isFinite(n) ? n : 0;
}

export default function SummaryScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    merchant,
    items,
    subtotal,
    discountPercent,
    discountAmount,
    taxPercent,
    taxAmount,
    participantIds,
    tipAmount,
    tipSplitMode,
    setTip,
    reset,
  } = useNewBill();

  const [friends, setFriends] = useState<Friend[]>([]);
  const [tipText, setTipText] = useState(tipAmount ? String(tipAmount) : '');
  const [mode, setMode] = useState<TipSplitMode>(tipSplitMode);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listFriends().then(setFriends);
  }, []);

  const friendNameById = useMemo(() => Object.fromEntries(friends.map((f) => [f.id, f.name])), [friends]);

  const split = useMemo(
    () =>
      computeBillSplit({
        items: items.map((item) => ({
          id: item.id,
          unitPrice: item.unitPrice,
          qty: item.qty,
          assignedFriendIds: item.assignedFriendIds,
        })),
        subtotal,
        discountPercent,
        discountAmount,
        taxPercent,
        taxAmount,
        tipAmount: toNumber(tipText),
        tipSplitMode: mode,
        friendIds: participantIds,
      }),
    [items, subtotal, discountPercent, discountAmount, taxPercent, taxAmount, tipText, mode, participantIds]
  );

  const buildShareText = () => {
    const lines = [`${merchant ?? 'Bill'} split`, ''];
    for (const friendId of participantIds) {
      const name = friendNameById[friendId] ?? 'Friend';
      lines.push(`${name}: ${formatCurrency(split.perFriendTotal[friendId] ?? 0)}`);
    }
    lines.push('', `Total: ${formatCurrency(split.grandTotal)}`);
    return lines.join('\n');
  };

  const onShare = async () => {
    try {
      await Share.share({ message: buildShareText() });
    } catch {
      // user dismissed the share sheet — nothing to do
    }
  };

  const onCopy = async () => {
    await Clipboard.setStringAsync(buildShareText());
    Alert.alert('Copied', 'Summary copied — paste it into any WhatsApp chat.');
  };

  const onSave = async () => {
    setSaving(true);
    try {
      setTip(toNumber(tipText), mode);
      await saveBill({
        date: new Date().toISOString(),
        merchant,
        subtotal,
        discountPercent,
        discountAmount,
        taxPercent,
        taxAmount,
        tipAmount: toNumber(tipText),
        tipSplitMode: mode,
        friendIds: participantIds,
        items: items.map((item) => ({
          name: item.name || 'Unnamed item',
          qty: item.qty,
          unitPrice: item.unitPrice,
          assignedFriendIds: item.assignedFriendIds,
        })),
      });
      reset();
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    } catch (error: any) {
      Alert.alert('Could not save bill', error.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.sectionTitle}>Cash tip (optional)</Text>
      <TextInput
        style={styles.input}
        value={tipText}
        onChangeText={setTipText}
        placeholder="0"
        placeholderTextColor={colors.placeholder}
        keyboardType="numeric"
      />
      <View style={styles.modeRow}>
        <Pressable style={[styles.modeButton, mode === 'even' && styles.modeButtonActive]} onPress={() => setMode('even')}>
          <Text style={[styles.modeButtonText, mode === 'even' && styles.modeButtonTextActive]}>Split evenly</Text>
        </Pressable>
        <Pressable
          style={[styles.modeButton, mode === 'proportional' && styles.modeButtonActive]}
          onPress={() => setMode('proportional')}
        >
          <Text style={[styles.modeButtonText, mode === 'proportional' && styles.modeButtonTextActive]}>
            Proportional to order
          </Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Split</Text>
      {participantIds.map((friendId) => (
        <View key={friendId} style={styles.friendBlock}>
          <View style={styles.friendHeaderRow}>
            <Text style={styles.friendName}>{friendNameById[friendId] ?? 'Friend'}</Text>
            <Text style={styles.friendTotal}>{formatCurrency(split.perFriendTotal[friendId] ?? 0)}</Text>
          </View>
          {split.items
            .filter((item) => item.perFriendShare[friendId] != null)
            .map((item) => {
              const source = items.find((i) => i.id === item.id);
              return (
                <View key={item.id} style={styles.itemLine}>
                  <Text style={styles.itemLineName}>{source?.name || 'Item'}</Text>
                  <Text style={styles.itemLineAmount}>{formatCurrency(item.perFriendShare[friendId])}</Text>
                </View>
              );
            })}
          {(split.perFriendTip[friendId] ?? 0) > 0 && (
            <View style={styles.itemLine}>
              <Text style={styles.itemLineName}>Tip</Text>
              <Text style={styles.itemLineAmount}>{formatCurrency(split.perFriendTip[friendId])}</Text>
            </View>
          )}
        </View>
      ))}

      <View style={styles.grandTotalRow}>
        <Text style={styles.grandTotalLabel}>Grand total</Text>
        <Text style={styles.grandTotalAmount}>{formatCurrency(split.grandTotal)}</Text>
      </View>

      <Pressable style={styles.shareButton} onPress={onShare}>
        <Text style={styles.shareButtonText}>Share summary</Text>
      </Pressable>
      <Pressable style={styles.shareButton} onPress={onCopy}>
        <Text style={styles.shareButtonText}>Copy summary (for WhatsApp)</Text>
      </Pressable>
      <Pressable style={styles.saveButton} onPress={onSave} disabled={saving}>
        <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save bill'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 16, marginBottom: 8, color: colors.text },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    modeRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
    modeButton: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 10 },
    modeButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    modeButtonText: { textAlign: 'center', color: colors.text },
    modeButtonTextActive: { color: colors.primaryText, fontWeight: '600' },
    friendBlock: { marginBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 8 },
    friendHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    friendName: { fontSize: 16, fontWeight: '700', color: colors.text },
    friendTotal: { fontSize: 16, fontWeight: '700', color: colors.text },
    itemLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
    itemLineName: { color: colors.textMuted },
    itemLineAmount: { color: colors.textMuted },
    grandTotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, marginBottom: 24 },
    grandTotalLabel: { fontSize: 17, fontWeight: '700', color: colors.text },
    grandTotalAmount: { fontSize: 17, fontWeight: '700', color: colors.text },
    shareButton: { backgroundColor: colors.surfaceAlt, paddingVertical: 14, borderRadius: 8, marginBottom: 12 },
    shareButtonText: { color: colors.text, fontWeight: '600', textAlign: 'center' },
    saveButton: { backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 8, marginBottom: 32 },
    saveButtonText: { color: colors.primaryText, fontWeight: '600', textAlign: 'center' },
  });
