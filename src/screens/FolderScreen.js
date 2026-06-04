import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
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

const FolderScreen = ({ route, navigation }) => {
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

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadNotes);
    return unsubscribe;
  }, [navigation, loadNotes]);

  return (
    <View style={styles.container}>
      <FlatList
        data={notes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <NoteItem note={item} onPress={() => handleNotePress(item)} />
        )}
        ListEmptyComponent={null}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={handleCreateNote}
      >
        <Ionicons name="add" size={24} color="white" />
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
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});

export default FolderScreen;
