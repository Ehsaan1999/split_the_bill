import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNewBill } from '../../context/NewBillContext';
import { listFriends } from '../../lib/db';
import { formatCurrency } from '../../lib/currency';
import { useTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import type { Friend } from '../../types/bill';
import type { RootStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'AssignFriends'>;

export default function AssignFriendsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items, setUnitAssignment, setUnitSplitMode, participantIds } = useNewBill();
  const [friends, setFriends] = useState<Friend[]>([]);

  useEffect(() => {
    listFriends().then(setFriends);
  }, []);

  const participants = friends.filter((f) => participantIds.includes(f.id));

  const toggleUnitAssignee = (itemId: string, unitIndex: number, currentAssignees: string[], friendId: string) => {
    const already = currentAssignees.includes(friendId);
    setUnitAssignment(
      itemId,
      unitIndex,
      already ? currentAssignees.filter((id) => id !== friendId) : [...currentAssignees, friendId]
    );
  };

  const onContinue = () => {
    const unassignedUnits = items.flatMap((item) =>
      item.unitAssignments
        .map((assignees, unitIndex) => ({ item, unitIndex, assignees }))
        .filter((u) => u.assignees.length === 0)
    );
    if (unassignedUnits.length > 0) {
      const labels = unassignedUnits.map(
        ({ item, unitIndex }) => `${item.name || 'Unnamed item'}${item.qty > 1 ? ` (${unitIndex + 1}/${item.qty})` : ''}`
      );
      Alert.alert(
        'Some items unassigned',
        `${labels.join(', ')} ${labels.length > 1 ? "aren't" : "isn't"} assigned to anyone and won't be split. Continue anyway?`,
        [
          { text: 'Go back', style: 'cancel' },
          { text: 'Continue anyway', onPress: () => navigation.navigate('Summary') },
        ]
      );
      return;
    }
    navigation.navigate('Summary');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.hint}>
        Tap who had each item. Ordered more than one? Each one is assigned separately — split a
        single one among a group by tapping more than one person for it.
      </Text>
      {items.map((item) => (
        <View key={item.id} style={styles.itemGroup}>
          <Text style={styles.itemName}>{item.name || 'Unnamed item'}</Text>
          {item.unitAssignments.map((assignees, unitIndex) => {
            const splitMode = item.unitSplitModes[unitIndex] ?? 'even';
            return (
              <View key={unitIndex} style={styles.unitBlock}>
                <View style={styles.itemHeader}>
                  <Text style={styles.unitLabel}>{item.qty > 1 ? `Unit ${unitIndex + 1} of ${item.qty}` : 'Price'}</Text>
                  <Text style={styles.itemPrice}>{formatCurrency(item.unitPrice)}</Text>
                </View>
                <View style={styles.chipRow}>
                  {participants.map((friend) => {
                    const isSelected = assignees.includes(friend.id);
                    return (
                      <Pressable
                        key={friend.id}
                        style={[styles.chip, isSelected && styles.chipSelected]}
                        onPress={() => toggleUnitAssignee(item.id, unitIndex, assignees, friend.id)}
                      >
                        <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{friend.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {assignees.length > 1 && (
                  <>
                    <View style={styles.splitModeRow}>
                      <Pressable
                        style={[styles.splitModeButton, splitMode === 'even' && styles.splitModeButtonActive]}
                        onPress={() => setUnitSplitMode(item.id, unitIndex, 'even')}
                      >
                        <Text style={[styles.splitModeText, splitMode === 'even' && styles.splitModeTextActive]}>
                          Split it
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[styles.splitModeButton, splitMode === 'each' && styles.splitModeButtonActive]}
                        onPress={() => setUnitSplitMode(item.id, unitIndex, 'each')}
                      >
                        <Text style={[styles.splitModeText, splitMode === 'each' && styles.splitModeTextActive]}>
                          Full price each
                        </Text>
                      </Pressable>
                    </View>
                    <Text style={styles.mathHint}>
                      {splitMode === 'each'
                        ? `${formatCurrency(item.unitPrice)} each × ${assignees.length} people = ${formatCurrency(item.unitPrice * assignees.length)} total`
                        : `${formatCurrency(item.unitPrice)} ÷ ${assignees.length} people = ${formatCurrency(item.unitPrice / assignees.length)} each`}
                    </Text>
                  </>
                )}
              </View>
            );
          })}
        </View>
      ))}

      <Pressable style={styles.continueButton} onPress={onContinue}>
        <Text style={styles.continueButtonText}>Continue</Text>
      </Pressable>
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    hint: { color: colors.textMuted, marginBottom: 16 },
    itemGroup: { marginBottom: 20 },
    itemName: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 8 },
    unitBlock: { marginBottom: 12, paddingLeft: 4 },
    itemHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    unitLabel: { fontSize: 13, color: colors.textMuted },
    itemPrice: { color: colors.textMuted },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      borderWidth: 1,
      borderColor: colors.chipBorder,
      borderRadius: 20,
      paddingVertical: 6,
      paddingHorizontal: 14,
      backgroundColor: colors.chipBackground,
    },
    chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { color: colors.text },
    chipTextSelected: { color: colors.primaryText, fontWeight: '600' },
    splitModeRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
    splitModeButton: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 6 },
    splitModeButtonActive: { backgroundColor: colors.surfaceAlt, borderColor: colors.primary },
    splitModeText: { textAlign: 'center', color: colors.textMuted, fontSize: 12 },
    splitModeTextActive: { color: colors.primary, fontWeight: '600' },
    mathHint: { color: colors.textMuted, fontSize: 12, marginTop: 4, fontStyle: 'italic' },
    continueButton: { backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 8, marginTop: 12, marginBottom: 32 },
    continueButtonText: { color: colors.primaryText, fontWeight: '600', textAlign: 'center' },
  });
