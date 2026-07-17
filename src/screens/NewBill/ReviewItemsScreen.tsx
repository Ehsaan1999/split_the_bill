import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNewBill } from '../../context/NewBillContext';
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
  const { items, addItem, updateItem, removeItem, subtotal, discountPercent, discountAmount, taxPercent, taxAmount, setBillTotals } =
    useNewBill();

  const [subtotalText, setSubtotalText] = useState(subtotal ? String(subtotal) : '');
  const [discountPercentText, setDiscountPercentText] = useState(
    discountPercent != null ? String(discountPercent * 100) : ''
  );
  const [discountAmountText, setDiscountAmountText] = useState(discountAmount != null ? String(discountAmount) : '');
  const [taxPercentText, setTaxPercentText] = useState(taxPercent != null ? String(taxPercent * 100) : '');
  const [taxAmountText, setTaxAmountText] = useState(taxAmount != null ? String(taxAmount) : '');

  const itemsSum = items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);

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

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.sectionTitle}>Items</Text>
      {items.map((item) => (
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
      <Pressable style={styles.addItemButton} onPress={addItem}>
        <Text style={styles.addItemButtonText}>+ Add item</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Bill totals</Text>
      <Text style={styles.hint}>Items add up to {itemsSum.toFixed(2)}. Leave subtotal blank to use that.</Text>

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
    addItemButton: { paddingVertical: 8 },
    addItemButtonText: { color: colors.primary, fontWeight: '600' },
    pairRow: { flexDirection: 'row', gap: 8 },
    fieldContainer: { marginBottom: 12 },
    fieldLabel: { color: colors.textMuted, marginBottom: 4, fontSize: 13 },
    continueButton: { backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 8, marginTop: 12, marginBottom: 32 },
    continueButtonText: { color: colors.primaryText, fontWeight: '600', textAlign: 'center' },
  });
