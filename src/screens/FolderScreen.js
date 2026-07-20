import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { noteRepo } from '../db/noteRepo';
import NoteItem from '../components/NoteItem';
import PasswordModal from '../components/PasswordModal';
import { hashPassword } from '../utils/crypto';
import { radius, shadow, useTheme } from '../theme';

const FolderScreen = ({ route, navigation }) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { folderId, folderName } = route.params;
  const [notes, setNotes] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [passwordModal, setPasswordModal] = useState({ visible: false, note: null });

  const loadNotes = useCallback(async () => {
    try {
      const notesData = await noteRepo.getByFolderId(folderId);
      setNotes(notesData);
    } catch (error) {
      Alert.alert('Error', 'Failed to load notes');
    } finally {
      setRefreshing(false);
    }
  }, [folderId]);

  const onRefresh = () => {
    setRefreshing(true);
    loadNotes();
  };

  const handleCreateNote = async () => {
    try {
      const note = await noteRepo.create(folderId, '', '');
      navigation.navigate('NoteEditor', { noteId: note.id });
    } catch (error) {
      Alert.alert('Error', 'Failed to create note');
    }
  };

  const handleNotePress = (note) => {
    if (note.password) {
      setPasswordModal({ visible: true, note });
    } else {
      navigation.navigate('NoteEditor', { noteId: note.id });
    }
  };

  const handleToggleNotePin = async (note) => {
    try {
      await noteRepo.update(note.id, { is_pinned: !note.is_pinned });
      loadNotes();
    } catch (error) {
      Alert.alert('Error', 'Failed to update pin');
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadNotes);
    return unsubscribe;
  }, [navigation, loadNotes]);

  return (
    <View style={styles.container}>
      <FlatList
        data={notes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => (
          <NoteItem
            note={item}
            index={index}
            onPress={() => handleNotePress(item)}
            onTogglePin={() => handleToggleNotePin(item)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={32} color={colors.textTertiary} />
            <Text style={styles.emptyText}>No notes in this folder</Text>
            <Text style={styles.emptyHint}>Tap + to create one</Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={handleCreateNote}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color={colors.card} />
      </TouchableOpacity>

      <PasswordModal
        visible={passwordModal.visible}
        onClose={() => setPasswordModal({ visible: false, note: null })}
        onVerify={async (password) => {
          const hash = await hashPassword(password);
          return hash === passwordModal.note.password;
        }}
        onVerified={() => {
          setPasswordModal({ visible: false, note: null });
          navigation.navigate('NoteEditor', { noteId: passwordModal.note.id });
        }}
        onReset={async () => {
          await noteRepo.update(passwordModal.note.id, { password: null });
          loadNotes();
        }}
      />
    </View>
  );
};

const makeStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    listContent: {
      padding: 16,
      paddingBottom: 100,
      flexGrow: 1,
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    emptyText: {
      color: colors.textSecondary,
      fontSize: 15,
      fontWeight: '500',
    },
    emptyHint: {
      color: colors.textTertiary,
      fontSize: 13,
    },
    fab: {
      position: 'absolute',
      right: 20,
      bottom: 24,
      width: 58,
      height: 58,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      ...shadow.fab,
    },
  });

export default FolderScreen;
