import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { folderRepo } from '../db/folderRepo';
import { noteRepo } from '../db/noteRepo';
import { hashPassword } from '../utils/crypto';
import FolderItem from '../components/FolderItem';
import NoteItem from '../components/NoteItem';
import PasswordModal from '../components/PasswordModal';

const HomeScreen = ({ navigation }) => {
  const [folders, setFolders] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [folderPassword, setFolderPassword] = useState('');
  const [passwordModal, setPasswordModal] = useState({ visible: false, item: null, type: '' });

  const loadData = useCallback(async () => {
    try {
      const [foldersData, notesData] = await Promise.all([
        folderRepo.getAll(),
        noteRepo.getRootNotes(),
      ]);
      setFolders(foldersData);
      setNotes(notesData);
    } catch (error) {
      Alert.alert('Error', 'Failed to load data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleCreateFolder = async () => {
    if (!folderName.trim()) {
      Alert.alert('Error', 'Please enter a folder name');
      return;
    }
    try {
      await folderRepo.create(folderName.trim(), folderPassword || null);
      setFolderName('');
      setFolderPassword('');
      setShowFolderModal(false);
      loadData();
    } catch (error) {
      Alert.alert('Error', 'Failed to create folder');
    }
  };

  const handleCreateRootNote = async () => {
    try {
      const note = await noteRepo.create(null, '', '');
      navigation.navigate('NoteEditor', { noteId: note.id });
    } catch (error) {
      Alert.alert('Error', 'Failed to create note');
    }
  };

  const handleFolderPress = (folder) => {
    if (folder.password) {
      setPasswordModal({ visible: true, item: folder, type: 'folder' });
    } else {
      navigation.navigate('Folder', { folderId: folder.id, folderName: folder.name });
    }
  };

  const handleNotePress = (note) => {
    if (note.password) {
      setPasswordModal({ visible: true, item: note, type: 'note' });
    } else {
      navigation.navigate('NoteEditor', { noteId: note.id });
    }
  };

  const handlePasswordVerified = (item, type) => {
    setPasswordModal({ visible: false, item: null, type: '' });
    if (type === 'folder') {
      navigation.navigate('Folder', { folderId: item.id, folderName: item.name });
    } else {
      navigation.navigate('NoteEditor', { noteId: item.id });
    }
  };

  useEffect(() => {
    //👉 “register the listener in useEffect, and return a cleanup function so React removes the listener automatically to prevent duplicates.”
    const unsubscribe = navigation.addListener('focus', loadData);
    return unsubscribe;
  }, [navigation, loadData]);

  return (
    <View style={styles.container}>
      <FlatList
        data={[]}
        renderItem={null}
        ListHeaderComponent={
          <>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Folders</Text>
                <TouchableOpacity onPress={() => setShowFolderModal(true)}>
                  <Ionicons name="add-circle" size={28} color="#007AFF" />
                </TouchableOpacity>
              </View>
              {folders.length === 0 ? (
                <Text style={styles.emptyText}>No folders yet</Text>
              ) : (
                folders.map((folder) => (
                  <FolderItem
                    key={folder.id}
                    folder={folder}
                    onPress={() => handleFolderPress(folder)}
                  />
                ))
              )}
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Notes</Text>
              </View>
              {notes.length === 0 ? (
                <Text style={styles.emptyText}>No notes yet</Text>
              ) : (
                notes.map((note) => (
                  <NoteItem
                    key={note.id}
                    note={note}
                    onPress={() => handleNotePress(note)}
                  />
                ))
              )}
            </View>
          </>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={handleCreateRootNote}
      >
        <Ionicons name="add" size={24} color="white" />
      </TouchableOpacity>

      <Modal visible={showFolderModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Folder</Text>
            <TextInput
              style={styles.input}
              placeholder="Folder name"
              value={folderName}
              onChangeText={setFolderName}
            />
            <TextInput
              style={styles.input}
              placeholder="Password (optional)"
              value={folderPassword}
              onChangeText={setFolderPassword}
              secureTextEntry
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => setShowFolderModal(false)}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.createButton]}
                onPress={handleCreateFolder}
              >
                <Text style={[styles.buttonText, styles.createButtonText]}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <PasswordModal
        visible={passwordModal.visible}
        onClose={() => setPasswordModal({ visible: false, item: null, type: '' })}
        onVerify={async (password) => {
          const hash = await hashPassword(password);
          return hash === passwordModal.item.password;
        }}
        onVerified={() => handlePasswordVerified(passwordModal.item, passwordModal.type)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  section: {
    marginTop: 20,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  emptyText: {
    color: '#999',
    fontStyle: 'italic',
    paddingVertical: 20,
    textAlign: 'center',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 24,
    width: '80%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  button: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  createButton: {
    backgroundColor: '#007AFF',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  createButtonText: {
    color: 'white',
  },
});

export default HomeScreen;
