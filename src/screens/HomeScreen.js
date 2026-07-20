import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { radius, shadow, useTheme } from '../theme';

const HomeScreen = ({ navigation }) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [folders, setFolders] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [folderPassword, setFolderPassword] = useState('');
  const [passwordModal, setPasswordModal] = useState({ visible: false, item: null, type: '' });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ folders: [], notes: [] });

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

  // Search across all folders and all notes (root + inside folders).
  const searching = query.trim().length > 0;
  const runSearch = useCallback(async (q) => {
    try {
      const [f, n] = await Promise.all([folderRepo.search(q), noteRepo.search(q)]);
      setResults({ folders: f, notes: n });
    } catch (error) {
      setResults({ folders: [], notes: [] });
    }
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults({ folders: [], notes: [] });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [f, n] = await Promise.all([folderRepo.search(q), noteRepo.search(q)]);
        if (!cancelled) setResults({ folders: f, notes: n });
      } catch (error) {
        if (!cancelled) setResults({ folders: [], notes: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query]);

  // Refresh whichever view (list or search results) is currently showing.
  const refreshCurrent = useCallback(() => {
    const q = query.trim();
    if (q) runSearch(q);
    else loadData();
  }, [query, runSearch, loadData]);

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

  const handleToggleFolderPin = async (folder) => {
    try {
      await folderRepo.update(folder.id, { is_pinned: !folder.is_pinned });
      refreshCurrent();
    } catch (error) {
      Alert.alert('Error', 'Failed to update pin');
    }
  };

  const handleToggleNotePin = async (note) => {
    try {
      await noteRepo.update(note.id, { is_pinned: !note.is_pinned });
      refreshCurrent();
    } catch (error) {
      Alert.alert('Error', 'Failed to update pin');
    }
  };

  useEffect(() => {
    //👉 “register the listener in useEffect, and return a cleanup function so React removes the listener automatically to prevent duplicates.”
    const unsubscribe = navigation.addListener('focus', loadData);
    return unsubscribe;
  }, [navigation, loadData]);

  const searchBar = (
    <View style={styles.searchBar}>
      <Ionicons name="search" size={18} color={colors.textTertiary} />
      <TextInput
        style={styles.searchInput}
        placeholder="Search folders and notes"
        placeholderTextColor={colors.textTertiary}
        value={query}
        onChangeText={setQuery}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
      {query.length > 0 && (
        <TouchableOpacity onPress={() => setQuery('')} activeOpacity={0.7}>
          <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
        </TouchableOpacity>
      )}
    </View>
  );

  const renderSearchResults = () => {
    const empty = results.folders.length === 0 && results.notes.length === 0;
    if (empty) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="search-outline" size={32} color={colors.textTertiary} />
          <Text style={styles.emptyText}>No matches for “{query.trim()}”</Text>
        </View>
      );
    }
    return (
      <>
        {results.folders.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Folders</Text>
            </View>
            {results.folders.map((folder, index) => (
              <FolderItem
                key={folder.id}
                folder={folder}
                index={index}
                onPress={() => handleFolderPress(folder)}
                onTogglePin={() => handleToggleFolderPin(folder)}
              />
            ))}
          </View>
        )}
        {results.notes.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Notes</Text>
            </View>
            {results.notes.map((note, index) => (
              <NoteItem
                key={note.id}
                note={note}
                index={index}
                onPress={() => handleNotePress(note)}
                onTogglePin={() => handleToggleNotePin(note)}
              />
            ))}
          </View>
        )}
      </>
    );
  };

  const renderDefault = () => (
    <>
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Folders</Text>
          <TouchableOpacity
            onPress={() => setShowFolderModal(true)}
            style={styles.addFolderButton}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
        {folders.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="folder-open-outline" size={32} color={colors.textTertiary} />
            <Text style={styles.emptyText}>No folders yet</Text>
          </View>
        ) : (
          folders.map((folder, index) => (
            <FolderItem
              key={folder.id}
              folder={folder}
              index={index}
              onPress={() => handleFolderPress(folder)}
              onTogglePin={() => handleToggleFolderPin(folder)}
            />
          ))
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Notes</Text>
        </View>
        {notes.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={32} color={colors.textTertiary} />
            <Text style={styles.emptyText}>No notes yet</Text>
            <Text style={styles.emptyHint}>Tap + to create one</Text>
          </View>
        ) : (
          notes.map((note, index) => (
            <NoteItem
              key={note.id}
              note={note}
              index={index}
              onPress={() => handleNotePress(note)}
              onTogglePin={() => handleToggleNotePin(note)}
            />
          ))
        )}
      </View>
    </>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={[]}
        renderItem={null}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            {searchBar}
            {searching ? renderSearchResults() : renderDefault()}
          </>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      />

      {!searching && (
        <TouchableOpacity
          style={styles.fab}
          onPress={handleCreateRootNote}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={28} color={colors.card} />
        </TouchableOpacity>
      )}

      <Modal visible={showFolderModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconCircle}>
              <Ionicons name="folder-open" size={26} color={colors.folder} />
            </View>
            <Text style={styles.modalTitle}>New Folder</Text>
            <TextInput
              style={styles.input}
              placeholder="Folder name"
              placeholderTextColor={colors.textTertiary}
              value={folderName}
              onChangeText={setFolderName}
              autoFocus
            />
            <TextInput
              style={styles.input}
              placeholder="Password (optional)"
              placeholderTextColor={colors.textTertiary}
              value={folderPassword}
              onChangeText={setFolderPassword}
              secureTextEntry
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                activeOpacity={0.7}
                onPress={() => setShowFolderModal(false)}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.createButton]}
                activeOpacity={0.7}
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
        onReset={async () => {
          const { item, type } = passwordModal;
          if (type === 'folder') {
            await folderRepo.update(item.id, { password: null });
          } else {
            await noteRepo.update(item.id, { password: null });
          }
          refreshCurrent();
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
      paddingBottom: 100,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.card,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginHorizontal: 16,
      marginTop: 16,
      ...shadow.card,
    },
    searchInput: {
      flex: 1,
      fontSize: 16,
      color: colors.text,
      padding: 0,
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
      fontWeight: '700',
      color: colors.text,
    },
    addFolderButton: {
      width: 32,
      height: 32,
      borderRadius: radius.full,
      backgroundColor: colors.primarySoft,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 28,
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
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15,23,42,0.45)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    modalContent: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      padding: 24,
      width: '100%',
      maxWidth: 400,
      alignItems: 'center',
      ...shadow.card,
    },
    modalIconCircle: {
      width: 56,
      height: 56,
      borderRadius: radius.full,
      backgroundColor: colors.folderSoft,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 14,
    },
    modalTitle: {
      fontSize: 19,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 18,
      textAlign: 'center',
    },
    input: {
      backgroundColor: colors.inputBg,
      borderRadius: radius.md,
      padding: 14,
      marginBottom: 12,
      fontSize: 16,
      color: colors.text,
      alignSelf: 'stretch',
    },
    modalButtons: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 8,
      alignSelf: 'stretch',
    },
    button: {
      flex: 1,
      padding: 14,
      borderRadius: radius.md,
      alignItems: 'center',
    },
    cancelButton: {
      backgroundColor: colors.inputBg,
    },
    createButton: {
      backgroundColor: colors.primary,
    },
    buttonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    createButtonText: {
      color: colors.card,
    },
  });

export default HomeScreen;
