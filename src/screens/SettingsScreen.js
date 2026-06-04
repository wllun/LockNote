import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const SettingsScreen = () => {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data</Text>
        <TouchableOpacity style={styles.item}>
          <Ionicons name="cloud-upload-outline" size={22} color="#333" />
          <View style={styles.itemContent}>
            <Text style={styles.itemLabel}>Backup Data</Text>
            <Text style={styles.itemDescription}>Coming soon</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#999" />
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.item}>
          <Ionicons name="information-circle-outline" size={22} color="#333" />
          <View style={styles.itemContent}>
            <Text style={styles.itemLabel}>Version</Text>
            <Text style={styles.itemValue}>1.0.0</Text>
          </View>
        </View>
        <View style={styles.item}>
          <Ionicons name="phone-portrait-outline" size={22} color="#333" />
          <View style={styles.itemContent}>
            <Text style={styles.itemLabel}>Storage</Text>
            <Text style={styles.itemValue}>Local (Offline)</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  itemContent: {
    flex: 1,
    marginLeft: 12,
  },
  itemLabel: {
    fontSize: 16,
    color: '#333',
  },
  itemValue: {
    fontSize: 14,
    color: '#999',
    marginTop: 2,
  },
  itemDescription: {
    fontSize: 14,
    color: '#999',
    marginTop: 2,
  },
});

export default SettingsScreen;
