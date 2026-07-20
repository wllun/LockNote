import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import AuthScreen from './AuthScreen';
import ProfileScreen from './ProfileScreen';
import { useTheme } from '../theme';

const ProfileTabScreen = () => {
  const colors = useTheme();
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return session ? <ProfileScreen /> : <AuthScreen />;
};

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ProfileTabScreen;
