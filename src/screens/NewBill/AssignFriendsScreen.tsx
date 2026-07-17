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
  const { items, updateItem, participantIds } = useNewBill();
  const [friends, setFriends] = useState<Friend[]>([]);

  useEffect(() => {
    listFriends().then(setFriends);
  }, []);

  const participants = friends.filter((f) => participantIds.includes(f.id));

  const toggleAssignee = (itemId: string, friendId: string) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    const already = item.assignedFriendIds.includes(friendId);
    updateItem(itemId, {
      assignedFriendIds: already
        ? item.assignedFriendIds.filter((id) => id !== friendId)
        : [...item.assignedFriendIds, friendId],
    });
  };

  const onContinue = () => {
    const unassigned = items.filter((item) => item.assignedFriendIds.length === 0);
    if (unassigned.length > 0) {
      Alert.alert(
        'Some items unassigned',
        `${unassigned.map((i) => i.name || 'Unnamed item').join(', ')} ${unassigned.length > 1 ? "aren't" : "isn't"} assigned to anyone and won't be split. Continue anyway?`,
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
      <Text style={styles.hint}>Tap who had each item. Shared items split evenly among everyone tapped.</Text>
      {items.map((item) => (
        <View key={item.id} style={styles.itemBlock}>
          <View style={styles.itemHeader}>
            <Text style={styles.itemName}>{item.name || 'Unnamed item'}</Text>
            <Text style={styles.itemPrice}>{formatCurrency(item.qty * item.unitPrice)}</Text>
          </View>
          <View style={styles.chipRow}>
            {participants.map((friend) => {
              const isSelected = item.assignedFriendIds.includes(friend.id);
              return (
                <Pressable
                  key={friend.id}
                  style={[styles.chip, isSelected && styles.chipSelected]}
                  onPress={() => toggleAssignee(item.id, friend.id)}
                >
                  <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{friend.name}</Text>
                </Pressable>
              );
            })}
          </View>
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
    itemBlock: { marginBottom: 20 },
    itemHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    itemName: { fontSize: 15, fontWeight: '600', color: colors.text },
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
    continueButton: { backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 8, marginTop: 12, marginBottom: 32 },
    continueButtonText: { color: colors.primaryText, fontWeight: '600', textAlign: 'center' },
  });
