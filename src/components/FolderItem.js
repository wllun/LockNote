import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const FolderItem = ({ folder, onPress }) => {
  return (
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <View style={styles.iconContainer}>
        <Ionicons name="folder" size={28} color="#FFD60A" />
      </View>
      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={1}>
          {folder.name}
        </Text>
      </View>
      <View style={styles.trailing}>
        {folder.password && (
          <Ionicons name="lock-closed" size={14} color="#999" style={styles.lockIcon} />
        )}
        <Ionicons name="chevron-forward" size={20} color="#999" />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 16,
    marginBottom: 8,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  iconContainer: {
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lockIcon: {
    marginRight: 4,
  },
});

export default FolderItem;
