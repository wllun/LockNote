import React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import HomeScreen from '../screens/HomeScreen';
import FolderScreen from '../screens/FolderScreen';
import NoteEditorScreen from '../screens/NoteEditorScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ProfileTabScreen from '../screens/ProfileTabScreen';
import { useTheme, useThemeMode } from '../theme';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const HomeStack = ({ screenOptions }) => (
  <Stack.Navigator screenOptions={screenOptions}>
    <Stack.Screen
      name="HomeMain"
      component={HomeScreen}
      options={{ title: 'LockNote' }}
    />
    <Stack.Screen
      name="Folder"
      component={FolderScreen}
      options={({ route }) => ({ title: route.params?.folderName || 'Folder' })}
    />
    <Stack.Screen
      name="NoteEditor"
      component={NoteEditorScreen}
      options={{ headerShown: false }}
    />
  </Stack.Navigator>
);

const SettingsStack = ({ screenOptions }) => (
  <Stack.Navigator screenOptions={screenOptions}>
    <Stack.Screen
      name="SettingsMain"
      component={SettingsScreen}
      options={{ title: 'Settings' }}
    />
  </Stack.Navigator>
);

const ProfileStack = ({ screenOptions }) => (
  <Stack.Navigator screenOptions={screenOptions}>
    <Stack.Screen
      name="ProfileMain"
      component={ProfileTabScreen}
      options={{ title: 'Profile' }}
    />
  </Stack.Navigator>
);

const AppNavigator = () => {
  const colors = useTheme();
  const { scheme } = useThemeMode();

  const stackScreenOptions = {
    headerStyle: { backgroundColor: colors.background },
    headerShadowVisible: false,
    headerTintColor: colors.primary,
    headerTitleStyle: { fontWeight: '700', color: colors.text },
    contentStyle: { backgroundColor: colors.background },
  };

  const navTheme = scheme === 'dark' ? DarkTheme : DefaultTheme;

  return (
    <NavigationContainer
      theme={{
        ...navTheme,
        colors: {
          ...navTheme.colors,
          background: colors.background,
          card: colors.card,
          text: colors.text,
          border: colors.border,
          primary: colors.primary,
        },
      }}
    >
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            let iconName;
            if (route.name === 'Home') {
              iconName = focused ? 'home' : 'home-outline';
            } else if (route.name === 'Settings') {
              iconName = focused ? 'settings' : 'settings-outline';
            } else if (route.name === 'Profile') {
              iconName = focused ? 'person-circle' : 'person-circle-outline';
            }
            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textTertiary,
          tabBarStyle: {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
          },
          tabBarLabelStyle: { fontWeight: '600' },
          headerShown: false,
        })}
      >
        <Tab.Screen name="Home">
          {() => <HomeStack screenOptions={stackScreenOptions} />}
        </Tab.Screen>
        <Tab.Screen name="Settings">
          {() => <SettingsStack screenOptions={stackScreenOptions} />}
        </Tab.Screen>
        <Tab.Screen name="Profile">
          {() => <ProfileStack screenOptions={stackScreenOptions} />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
