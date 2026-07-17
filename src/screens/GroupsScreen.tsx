import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { deleteGroup, type Group, listFriends, listGroups, saveGroup } from '../lib/db';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import type { Friend } from '../types/bill';

const NEW_GROUP = 'new';

export default function GroupsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftMemberIds, setDraftMemberIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    const [g, f] = await Promise.all([listGroups(), listFriends()]);
    setGroups(g);
    setFriends(f);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const friendNameById = Object.fromEntries(friends.map((f) => [f.id, f.name]));

  const startNew = () => {
    setEditingId(NEW_GROUP);
    setDraftName('');
    setDraftMemberIds([]);
  };

  const startEdit = (group: Group) => {
    setEditingId(group.id);
    setDraftName(group.name);
    setDraftMemberIds(group.memberIds);
  };

  const cancelEdit = () => setEditingId(null);

  const toggleMember = (friendId: string) => {
    setDraftMemberIds((prev) => (prev.includes(friendId) ? prev.filter((id) => id !== friendId) : [...prev, friendId]));
  };

  const onSave = async () => {
    if (!draftName.trim()) {
      Alert.alert('Name required', 'Give the group a name.');
      return;
    }
    await saveGroup({
      id: editingId === NEW_GROUP ? undefined : editingId ?? undefined,
      name: draftName,
      memberIds: draftMemberIds,
    });
    setEditingId(null);
    load();
  };

  const onDelete = (group: Group) => {
    Alert.alert('Delete group', `Delete "${group.name}"? Your friends themselves won't be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteGroup(group.id);
          load();
        },
      },
    ]);
  };

  if (editingId != null) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
        <Text style={styles.sectionTitle}>{editingId === NEW_GROUP ? 'New group' : 'Edit group'}</Text>
        <TextInput
          style={styles.input}
          placeholder="Group name"
          placeholderTextColor={colors.placeholder}
          value={draftName}
          onChangeText={setDraftName}
        />

        <Text style={styles.label}>Members</Text>
        {friends.length === 0 ? (
          <Text style={styles.empty}>Add friends first from the Friends screen.</Text>
        ) : (
          <View style={styles.chipRow}>
            {friends.map((friend) => {
              const isSelected = draftMemberIds.includes(friend.id);
              return (
                <Pressable
                  key={friend.id}
                  style={[styles.chip, isSelected && styles.chipSelected]}
                  onPress={() => toggleMember(friend.id)}
                >
                  <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{friend.name}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={styles.editActions}>
          <Pressable style={styles.cancelButton} onPress={cancelEdit}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
          <Pressable style={styles.saveButton} onPress={onSave}>
            <Text style={styles.saveButtonText}>Save</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <Pressable style={styles.addButton} onPress={startNew}>
          <Text style={styles.addButtonText}>+ New group</Text>
        </Pressable>
      </View>
      <FlatList
        data={groups}
        keyExtractor={(g) => g.id}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <Text style={styles.empty}>No groups yet — group your regular friends for faster bill setup.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Pressable style={{ flex: 1 }} onPress={() => startEdit(item)}>
              <Text style={styles.groupName}>{item.name}</Text>
              <Text style={styles.groupMembers}>
                {item.memberIds.length === 0
                  ? 'No members'
                  : item.memberIds.map((id) => friendNameById[id] ?? '?').join(', ')}
              </Text>
            </Pressable>
            <Pressable onPress={() => onDelete(item)}>
              <Text style={styles.delete}>Remove</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12, color: colors.text },
    label: { color: colors.textMuted, marginTop: 4, marginBottom: 8, fontSize: 13 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 8,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    empty: { color: colors.textMuted },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    chip: {
      borderWidth: 1,
      borderColor: colors.chipBorder,
      borderRadius: 20,
      paddingVertical: 8,
      paddingHorizontal: 16,
      backgroundColor: colors.chipBackground,
    },
    chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { color: colors.text },
    chipTextSelected: { color: colors.primaryText, fontWeight: '600' },
    editActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
    cancelButton: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
    cancelButtonText: { textAlign: 'center', color: colors.text, fontWeight: '600' },
    saveButton: { flex: 1, backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 8 },
    saveButtonText: { textAlign: 'center', color: colors.primaryText, fontWeight: '600' },
    addButton: { backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 8, marginBottom: 8 },
    addButtonText: { color: colors.primaryText, fontWeight: '600', textAlign: 'center' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    groupName: { fontSize: 16, fontWeight: '600', color: colors.text },
    groupMembers: { color: colors.textMuted, marginTop: 2 },
    delete: { color: colors.danger },
  });
