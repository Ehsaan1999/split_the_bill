import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MANUAL_BATCH_ID, useNewBill } from '../../context/NewBillContext';
import { getEffectiveSubtotal } from '../../lib/receiptParser';
import { scanReceiptImage } from '../../lib/scanReceipt';
import { useTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import type { RootStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'ReviewItems'>;

function toNumber(text: string): number {
  const n = parseFloat(text);
  return Number.isFinite(n) ? n : 0;
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  colors,
  styles,
  style,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  style?: any;
}) {
  return (
    <View style={[styles.fieldContainer, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        keyboardType="numeric"
      />
    </View>
  );
}

export default function ReviewItemsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    items,
    addItem,
    updateItem,
    removeItem,
    batches,
    discountTaxMode,
    setDiscountTaxMode,
    updateBatch,
    addBatch,
    subtotal,
    discountPercent,
    discountAmount,
    taxPercent,
    taxAmount,
    setBillTotals,
  } = useNewBill();

  const [subtotalText, setSubtotalText] = useState(subtotal ? String(subtotal) : '');
  const [discountPercentText, setDiscountPercentText] = useState(
    discountPercent != null ? String(discountPercent * 100) : ''
  );
  const [discountAmountText, setDiscountAmountText] = useState(discountAmount != null ? String(discountAmount) : '');
  const [taxPercentText, setTaxPercentText] = useState(taxPercent != null ? String(taxPercent * 100) : '');
  const [taxAmountText, setTaxAmountText] = useState(taxAmount != null ? String(taxAmount) : '');
  const [scanning, setScanning] = useState(false);
  const [statusText, setStatusText] = useState('');

  const itemsByBatch = useMemo(() => {
    const map = new Map<string, typeof items>();
    for (const item of items) {
      const arr = map.get(item.batchId) ?? [];
      arr.push(item);
      map.set(item.batchId, arr);
    }
    return map;
  }, [items]);

  const itemsSum = items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  const receiptBatchCount = batches.filter((b) => b.id !== MANUAL_BATCH_ID).length;

  const onScanAnother = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Photo library access is required to pick a receipt image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.8 });
    if (result.canceled || result.assets.length === 0) return;

    const asset = result.assets[0];
    setScanning(true);
    try {
      const { parsed, cloudErrors, usedOnDeviceFallback } = await scanReceiptImage(asset, setStatusText);
      if (cloudErrors.length > 0 && usedOnDeviceFallback) {
        Alert.alert(
          'Cloud scan unavailable',
          `${cloudErrors.join('\n')}\n\nContinuing with the on-device scan — you can fix anything wrong below.`
        );
      }
      addBatch(
        {
          label: `Receipt ${receiptBatchCount + 1}`,
          subtotal: getEffectiveSubtotal(parsed),
          discountPercent: parsed.discountPercent,
          discountAmount: parsed.discountAmount,
          taxPercent: parsed.taxPercent,
          taxAmount: parsed.taxAmount,
        },
        parsed.items
      );
      if (batches.length > 0) {
        // A second receipt almost always means the discount/tax genuinely varies — default to
        // isolated mode so it doesn't silently get merged into the first receipt's flat rate.
        setDiscountTaxMode('isolated');
      }
    } catch (error: any) {
      Alert.alert('Scan failed', error.message ?? 'Could not read the receipt. Add its items manually instead.');
    } finally {
      setScanning(false);
      setStatusText('');
    }
  };

  const onContinue = () => {
    if (items.length === 0) {
      Alert.alert('No items', 'Add at least one item before continuing.');
      return;
    }
    const resolvedSubtotal = subtotalText.trim() ? toNumber(subtotalText) : itemsSum;
    setBillTotals({
      subtotal: resolvedSubtotal,
      discountPercent: discountPercentText.trim() ? toNumber(discountPercentText) / 100 : null,
      discountAmount: !discountPercentText.trim() && discountAmountText.trim() ? toNumber(discountAmountText) : null,
      taxPercent: taxPercentText.trim() ? toNumber(taxPercentText) / 100 : null,
      taxAmount: !taxPercentText.trim() && taxAmountText.trim() ? toNumber(taxAmountText) : null,
    });
    navigation.navigate('AssignFriends');
  };

  if (scanning) {
    return (
      <View style={styles.busyContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.busyText}>{statusText}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.sectionTitle}>Items</Text>
      {batches.map((batch) => {
        const batchItems = itemsByBatch.get(batch.id) ?? [];
        if (batchItems.length === 0) return null;
        return (
          <View key={batch.id} style={styles.batchGroup}>
            <Text style={styles.batchLabel}>{batch.label}</Text>
            {batchItems.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <TextInput
                  style={[styles.input, styles.nameInput]}
                  value={item.name}
                  onChangeText={(text) => updateItem(item.id, { name: text })}
                  placeholder="Item name"
                  placeholderTextColor={colors.placeholder}
                />
                <TextInput
                  style={[styles.input, styles.qtyInput]}
                  value={String(item.qty)}
                  onChangeText={(text) => updateItem(item.id, { qty: toNumber(text) })}
                  keyboardType="numeric"
                  placeholder="Qty"
                  placeholderTextColor={colors.placeholder}
                />
                <TextInput
                  style={[styles.input, styles.priceInput]}
                  value={String(item.unitPrice)}
                  onChangeText={(text) => updateItem(item.id, { unitPrice: toNumber(text) })}
                  keyboardType="numeric"
                  placeholder="Unit price"
                  placeholderTextColor={colors.placeholder}
                />
                <Pressable onPress={() => removeItem(item.id)}>
                  <Text style={styles.remove}>✕</Text>
                </Pressable>
              </View>
            ))}
          </View>
        );
      })}
      <View style={styles.addRow}>
        <Pressable style={styles.addItemButton} onPress={addItem}>
          <Text style={styles.addItemButtonText}>+ Add item</Text>
        </Pressable>
        <Pressable style={styles.addItemButton} onPress={onScanAnother}>
          <Text style={styles.addItemButtonText}>+ Scan another receipt</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Discount &amp; tax</Text>
      <View style={styles.modeRow}>
        <Pressable
          style={[styles.modeButton, discountTaxMode === 'flat' && styles.modeButtonActive]}
          onPress={() => setDiscountTaxMode('flat')}
        >
          <Text style={[styles.modeButtonText, discountTaxMode === 'flat' && styles.modeButtonTextActive]}>
            Whole bill together
          </Text>
        </Pressable>
        <Pressable
          style={[styles.modeButton, discountTaxMode === 'isolated' && styles.modeButtonActive]}
          onPress={() => setDiscountTaxMode('isolated')}
        >
          <Text style={[styles.modeButtonText, discountTaxMode === 'isolated' && styles.modeButtonTextActive]}>
            Keep each receipt separate
          </Text>
        </Pressable>
      </View>

      {discountTaxMode === 'flat' ? (
        <>
          <Text style={styles.hint}>
            One discount/tax rate applies to every item, scanned or manually added. Items add up to{' '}
            {itemsSum.toFixed(2)}. Leave subtotal blank to use that.
          </Text>
          <Field
            label="Subtotal"
            value={subtotalText}
            onChangeText={setSubtotalText}
            placeholder={itemsSum.toFixed(2)}
            colors={colors}
            styles={styles}
          />
          <View style={styles.pairRow}>
            <Field
              label="Discount %"
              value={discountPercentText}
              onChangeText={setDiscountPercentText}
              placeholder="e.g. 10"
              colors={colors}
              styles={styles}
              style={{ flex: 1 }}
            />
            <Field
              label="or flat discount"
              value={discountAmountText}
              onChangeText={setDiscountAmountText}
              placeholder="e.g. 50"
              colors={colors}
              styles={styles}
              style={{ flex: 1 }}
            />
          </View>
          <View style={styles.pairRow}>
            <Field
              label="Tax %"
              value={taxPercentText}
              onChangeText={setTaxPercentText}
              placeholder="e.g. 8"
              colors={colors}
              styles={styles}
              style={{ flex: 1 }}
            />
            <Field
              label="or flat tax"
              value={taxAmountText}
              onChangeText={setTaxAmountText}
              placeholder="e.g. 40"
              colors={colors}
              styles={styles}
              style={{ flex: 1 }}
            />
          </View>
        </>
      ) : (
        <>
          <Text style={styles.hint}>
            Each receipt keeps its own discount/tax — items with no receipt of their own (like
            manually added extras) get none unless you set it here.
          </Text>
          {batches.map((batch) => (
            <View key={batch.id} style={styles.batchTotals}>
              <Text style={styles.batchLabel}>{batch.label}</Text>
              <View style={styles.pairRow}>
                <Field
                  label="Discount %"
                  value={batch.discountPercent != null ? String(batch.discountPercent * 100) : ''}
                  onChangeText={(t) => updateBatch(batch.id, { discountPercent: t.trim() ? toNumber(t) / 100 : null })}
                  placeholder="e.g. 10"
                  colors={colors}
                  styles={styles}
                  style={{ flex: 1 }}
                />
                <Field
                  label="or flat discount"
                  value={batch.discountAmount != null ? String(batch.discountAmount) : ''}
                  onChangeText={(t) => updateBatch(batch.id, { discountAmount: t.trim() ? toNumber(t) : null })}
                  placeholder="e.g. 50"
                  colors={colors}
                  styles={styles}
                  style={{ flex: 1 }}
                />
              </View>
              <View style={styles.pairRow}>
                <Field
                  label="Tax %"
                  value={batch.taxPercent != null ? String(batch.taxPercent * 100) : ''}
                  onChangeText={(t) => updateBatch(batch.id, { taxPercent: t.trim() ? toNumber(t) / 100 : null })}
                  placeholder="e.g. 8"
                  colors={colors}
                  styles={styles}
                  style={{ flex: 1 }}
                />
                <Field
                  label="or flat tax"
                  value={batch.taxAmount != null ? String(batch.taxAmount) : ''}
                  onChangeText={(t) => updateBatch(batch.id, { taxAmount: t.trim() ? toNumber(t) : null })}
                  placeholder="e.g. 40"
                  colors={colors}
                  styles={styles}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          ))}
        </>
      )}

      <Pressable style={styles.continueButton} onPress={onContinue}>
        <Text style={styles.continueButtonText}>Continue</Text>
      </Pressable>
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 16, marginBottom: 8, color: colors.text },
    hint: { color: colors.textMuted, marginBottom: 8 },
    batchGroup: { marginBottom: 12 },
    batchLabel: { color: colors.textMuted, fontWeight: '700', fontSize: 13, marginBottom: 6, textTransform: 'uppercase' },
    batchTotals: { marginBottom: 16 },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    nameInput: { flex: 2 },
    qtyInput: { width: 50 },
    priceInput: { width: 80 },
    remove: { color: colors.danger, fontSize: 16, paddingHorizontal: 4 },
    addRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 8 },
    addItemButton: { paddingVertical: 8 },
    addItemButtonText: { color: colors.primary, fontWeight: '600' },
    modeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    modeButton: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 10 },
    modeButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    modeButtonText: { textAlign: 'center', color: colors.text, fontSize: 13 },
    modeButtonTextActive: { color: colors.primaryText, fontWeight: '600' },
    pairRow: { flexDirection: 'row', gap: 8 },
    fieldContainer: { marginBottom: 12 },
    fieldLabel: { color: colors.textMuted, marginBottom: 4, fontSize: 13 },
    continueButton: { backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 8, marginTop: 12, marginBottom: 32 },
    continueButtonText: { color: colors.primaryText, fontWeight: '600', textAlign: 'center' },
    busyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.background },
    busyText: { marginTop: 16, color: colors.textMuted, textAlign: 'center' },
  });
