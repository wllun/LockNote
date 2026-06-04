import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Alert,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { noteRepo } from '../db/noteRepo';
import { hashPassword } from '../utils/crypto';

const NoteEditorScreen = ({ route, navigation }) => {
  const { noteId } = route.params;
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [lockPassword, setLockPassword] = useState('');
  const saveTimeout = useRef(null);
  const contentRef = useRef(null);


  const loadNote = async () => {
    try {
      const note = await noteRepo.getById(noteId);
      if (note) {
        setTitle(note.title);
        setContent(note.content);
        setHasPassword(!!note.password);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load note');
    }
  };

  const autoSave = useCallback(
    (newTitle, newContent) => {
      if (saveTimeout.current) {
        clearTimeout(saveTimeout.current);
      }
      saveTimeout.current = setTimeout(async () => {
        try {
          await noteRepo.update(noteId, { title: newTitle, content: newContent });
        } catch (error) {
          console.error('Auto-save failed:', error);
        }
      }, 800);
    },
    [noteId]
  );

  const handleTitleChange = (text) => {
    setTitle(text);
    autoSave(text, content);
  };

  const handleContentChange = (text) => {
    setContent(text);
    autoSave(title, text);
  };

  const handleSetPassword = async () => {
    if (!lockPassword.trim()) {
      Alert.alert('Error', 'Please enter a password');
      return;
    }
    try {
      await noteRepo.update(noteId, { password: lockPassword });
      setHasPassword(true);
      setShowLockModal(false);
      setLockPassword('');
    } catch (error) {
      Alert.alert('Error', 'Failed to set password');
    }
  };

  const handleRemovePassword = async () => {
    try {
      await noteRepo.update(noteId, { password: null });
      setHasPassword(false);
      setShowLockModal(false);
      setLockPassword('');
    } catch (error) {
      Alert.alert('Error', 'Failed to remove password');
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Note',
      'Are you sure you want to delete this note?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (saveTimeout.current) {
                clearTimeout(saveTimeout.current);
              }
              await noteRepo.softDelete(noteId);
              navigation.goBack();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete note');
            }
          },
        },
      ]
    );
  };

  
  useEffect(() => {
    loadNote();
  }, [noteId]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerButtons}>
          <TouchableOpacity
            onPress={() => setShowLockModal(true)}
            style={styles.headerButton}
          >
            <Ionicons
              name={hasPassword ? 'lock-closed' : 'lock-open-outline'}
              size={22}
              color={hasPassword ? '#FF9500' : '#999'}
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete} style={styles.headerButton}>
            <Ionicons name="trash-outline" size={22} color="#FF3B30" />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, hasPassword, title, content]);

  useEffect(() => {
    return () => {
      if (saveTimeout.current) {
        clearTimeout(saveTimeout.current);
      }
    };
  }, []);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <TextInput
        style={styles.titleInput}
        placeholder="Title"
        placeholderTextColor="#999"
        value={title}
        onChangeText={handleTitleChange}
        multiline
        blurOnSubmit
        returnKeyType="next"
        onSubmitEditing={() => contentRef.current?.focus()}
      />
      <TextInput
        ref={contentRef}
        style={styles.contentInput}
        placeholder="Start writing..."
        placeholderTextColor="#999"
        value={content}
        onChangeText={handleContentChange}
        multiline
        textAlignVertical="top"
        autoFocus={!title}
      />

      <Modal visible={showLockModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {hasPassword ? 'Password Protection' : 'Set Password'}
            </Text>
            {hasPassword ? (
              <Text style={styles.modalDescription}>
                This note is password protected.
              </Text>
            ) : (
              <>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Enter password"
                  value={lockPassword}
                  onChangeText={setLockPassword}
                  secureTextEntry
                  autoFocus
                />
              </>
            )}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowLockModal(false);
                  setLockPassword('');
                }}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              {hasPassword ? (
                <TouchableOpacity
                  style={[styles.modalButton, styles.removeButton]}
                  onPress={handleRemovePassword}
                >
                  <Text style={[styles.modalButtonText, styles.removeButtonText]}>
                    Remove Lock
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.modalButton, styles.setButton]}
                  onPress={handleSetPassword}
                >
                  <Text style={[styles.modalButtonText, styles.setButtonText]}>
                    Set Lock
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  titleInput: {
    fontSize: 22,
    fontWeight: '600',
    padding: 16,
    paddingBottom: 8,
    color: '#333',
  },
  contentInput: {
    flex: 1,
    fontSize: 16,
    padding: 16,
    paddingTop: 8,
    color: '#333',
    lineHeight: 24,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 4,
  },
  headerButton: {
    padding: 8,
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
    marginBottom: 8,
    textAlign: 'center',
  },
  modalDescription: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalInput: {
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
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  setButton: {
    backgroundColor: '#007AFF',
  },
  removeButton: {
    backgroundColor: '#FFF0F0',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  setButtonText: {
    color: 'white',
  },
  removeButtonText: {
    color: '#FF3B30',
  },
});

export default NoteEditorScreen;
