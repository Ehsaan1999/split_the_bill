import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { formatCurrency } from '../lib/currency';
import { type BillSummary, type FriendBalance, getFriendBalances, listBills } from '../lib/db';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [bills, setBills] = useState<BillSummary[]>([]);
  const [balances, setBalances] = useState<FriendBalance[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [b, f] = await Promise.all([listBills(), getFriendBalances()]);
    setBills(b);
    setBalances(f);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.actions}>
        <Pressable style={styles.primaryButton} onPress={() => navigation.navigate('PickReceipt')}>
          <Text style={styles.primaryButtonText}>+ New Bill</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('Friends')}>
          <Text style={styles.secondaryButtonText}>Friends</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('Groups')}>
          <Text style={styles.secondaryButtonText}>Groups</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('Settings')}>
          <Text style={styles.secondaryButtonText}>Settings</Text>
        </Pressable>
      </View>

      <FlatList
        data={bills}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <>
            <Text style={styles.sectionTitle}>Running balances</Text>
            {balances.length === 0 ? (
              <Text style={styles.empty}>No friends yet — add some in Friends.</Text>
            ) : (
              balances.map((b) => (
                <View key={b.friendId} style={styles.balanceRow}>
                  <Text style={styles.balanceName}>{b.name}</Text>
                  <Text style={styles.balanceAmount}>{formatCurrency(b.balance)}</Text>
                </View>
              ))
            )}
            <Text style={styles.sectionTitle}>Recent bills</Text>
          </>
        }
        ListEmptyComponent={<Text style={styles.empty}>No bills yet — scan your first receipt.</Text>}
        renderItem={({ item }) => (
          <View style={styles.billRow}>
            <Text style={styles.billMerchant}>{item.merchant ?? 'Receipt'}</Text>
            <Text style={styles.billDate}>{new Date(item.date).toLocaleDateString()}</Text>
            <Text style={styles.billTotal}>{formatCurrency(item.total)}</Text>
          </View>
        )}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, padding: 16, backgroundColor: colors.background },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    primaryButton: {
      backgroundColor: colors.primary,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 8,
      flexGrow: 1,
      flexBasis: '100%',
    },
    primaryButtonText: { color: colors.primaryText, fontWeight: '600', textAlign: 'center' },
    secondaryButton: { backgroundColor: colors.surfaceAlt, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, flexGrow: 1 },
    secondaryButtonText: { color: colors.text, fontWeight: '600', textAlign: 'center' },
    sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 8, marginBottom: 8, color: colors.text },
    empty: { color: colors.textMuted, marginBottom: 8 },
    balanceRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    balanceName: { fontSize: 15, color: colors.text },
    balanceAmount: { fontSize: 15, fontWeight: '600', color: colors.text },
    billRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    billMerchant: { flex: 1, fontSize: 15, color: colors.text },
    billDate: { color: colors.textMuted, marginRight: 12 },
    billTotal: { fontWeight: '600', color: colors.text },
  });
