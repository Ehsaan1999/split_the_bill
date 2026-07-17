import { useFocusEffect } from '@react-navigation/native';
import { Contact, ContactField } from 'expo-contacts';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { addFriend, deleteFriend, listFriends, updateFriend } from '../lib/db';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import type { Friend } from '../types/bill';

export default function FriendsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const load = useCallback(async () => {
    setFriends(await listFriends());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onAdd = async () => {
    if (!newName.trim()) return;
    await addFriend(newName);
    setNewName('');
    load();
  };

  const onImportFromContacts = async () => {
    try {
      const contact = await Contact.presentPicker();
      if (!contact) return;
      const details = await contact.getDetails([ContactField.FULL_NAME, ContactField.GIVEN_NAME, ContactField.FAMILY_NAME]);
      const name =
        details.fullName?.trim() || [details.givenName, details.familyName].filter(Boolean).join(' ').trim();
      if (!name) {
        Alert.alert('No name found', "That contact doesn't have a name to import.");
        return;
      }
      await addFriend(name);
      load();
    } catch (err: any) {
      Alert.alert('Could not import contact', err?.message ?? 'Unknown error');
    }
  };

  const onStartEdit = (friend: Friend) => {
    setEditingId(friend.id);
    setEditingName(friend.name);
  };

  const onSaveEdit = async () => {
    if (editingId && editingName.trim()) {
      await updateFriend(editingId, editingName);
    }
    setEditingId(null);
    load();
  };

  const onDelete = (friend: Friend) => {
    Alert.alert('Remove friend', `Remove ${friend.name}? Past bills will keep their record.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteFriend(friend.id);
          load();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          placeholder="Friend's name"
          placeholderTextColor={colors.placeholder}
          value={newName}
          onChangeText={setNewName}
          onSubmitEditing={onAdd}
        />
        <Pressable style={styles.addButton} onPress={onAdd}>
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>
      <Pressable style={styles.importButton} onPress={onImportFromContacts}>
        <Text style={styles.importButtonText}>Import from contacts</Text>
      </Pressable>
      <FlatList
        data={friends}
        keyExtractor={(f) => f.id}
        ListEmptyComponent={<Text style={styles.empty}>No friends yet — add your first above.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            {editingId === item.id ? (
              <TextInput
                style={styles.editInput}
                value={editingName}
                onChangeText={setEditingName}
                onSubmitEditing={onSaveEdit}
                onBlur={onSaveEdit}
                autoFocus
              />
            ) : (
              <Text style={styles.name} onPress={() => onStartEdit(item)}>
                {item.name}
              </Text>
            )}
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
    container: { flex: 1, padding: 16, backgroundColor: colors.background },
    addRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    addButton: { backgroundColor: colors.primary, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 8 },
    addButtonText: { color: colors.primaryText, fontWeight: '600' },
    importButton: {
      borderWidth: 1,
      borderColor: colors.primary,
      paddingVertical: 10,
      borderRadius: 8,
      marginBottom: 16,
    },
    importButtonText: { color: colors.primary, fontWeight: '600', textAlign: 'center' },
    empty: { color: colors.textMuted },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    name: { fontSize: 16, color: colors.text },
    editInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
      marginRight: 8,
      color: colors.text,
    },
    delete: { color: colors.danger },
  });
