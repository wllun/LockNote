import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
  useNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import HomeScreen from '../screens/HomeScreen';
import FolderScreen from '../screens/FolderScreen';
import NoteEditorScreen from '../screens/NoteEditorScreen';
import ChecklistEditorScreen from '../screens/ChecklistEditorScreen';
import ExpenseRecordEditorScreen from '../screens/ExpenseRecordEditorScreen';
import ReminderEditorScreen from '../screens/ReminderEditorScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ProfileTabScreen from '../screens/ProfileTabScreen';
import SharedScreen from '../screens/SharedScreen';
import TrashScreen from '../screens/TrashScreen';
import ArchiveScreen from '../screens/ArchiveScreen';
import PasswordModal from '../components/PasswordModal';
import { noteRepo } from '../db/noteRepo';
import { lockPasswordService } from '../services/lockPasswordService';
import { useTheme, useThemeMode } from '../theme';
import { AppAlert as Alert } from '../utils/app-alert';
import {
  getNotificationResponseKey,
  getReminderNavigationTarget,
  getReminderNoteIdFromResponse,
} from '../utils/reminder-notification-response.mjs';
import { REMINDER_NOTE_TYPE } from '../utils/reminder-note.mjs';
import {
  addReminderNotificationResponseListener,
  clearLastReminderNotificationResponse,
  getLastReminderNotificationResponse,
} from '../utils/reminder-notification-responses';

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
    <Stack.Screen
      name="ChecklistEditor"
      component={ChecklistEditorScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name="ExpenseRecordEditor"
      component={ExpenseRecordEditorScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name="ReminderEditor"
      component={ReminderEditorScreen}
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
    <Stack.Screen
      name="Archive"
      component={ArchiveScreen}
      options={{ title: 'Archive' }}
    />
    <Stack.Screen
      name="Trash"
      component={TrashScreen}
      options={{ title: 'Trash' }}
    />
    <Stack.Screen
      name="Folder"
      component={FolderScreen}
      options={({ route }) => ({ title: route.params?.folderName || 'Folder' })}
    />
    <Stack.Screen name="NoteEditor" component={NoteEditorScreen} options={{ headerShown: false }} />
    <Stack.Screen name="ChecklistEditor" component={ChecklistEditorScreen} options={{ headerShown: false }} />
    <Stack.Screen name="ExpenseRecordEditor" component={ExpenseRecordEditorScreen} options={{ headerShown: false }} />
    <Stack.Screen name="ReminderEditor" component={ReminderEditorScreen} options={{ headerShown: false }} />
  </Stack.Navigator>
);

const SharedStack = ({ screenOptions }) => (
  <Stack.Navigator screenOptions={screenOptions}>
    <Stack.Screen name="SharedMain" component={SharedScreen} options={{ title: 'Shared with me' }} />
    <Stack.Screen name="NoteEditor" component={NoteEditorScreen} options={{ headerShown: false }} />
    <Stack.Screen name="ChecklistEditor" component={ChecklistEditorScreen} options={{ headerShown: false }} />
    <Stack.Screen name="ExpenseRecordEditor" component={ExpenseRecordEditorScreen} options={{ headerShown: false }} />
    <Stack.Screen name="ReminderEditor" component={ReminderEditorScreen} options={{ headerShown: false }} />
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
  const navigationRef = useNavigationContainerRef();
  const pendingResponseRef = useRef(null);
  const handledResponseKeysRef = useRef(new Set());
  const [lockedReminder, setLockedReminder] = useState(null);

  const navigateToReminder = useCallback((noteId) => {
    const target = getReminderNavigationTarget(noteId);
    navigationRef.navigate(target.name, target.params);
  }, [navigationRef]);

  const navigateHome = useCallback(() => {
    navigationRef.navigate('Home', {
      screen: 'HomeMain',
      initial: false,
    });
  }, [navigationRef]);

  const handleNotificationResponse = useCallback(async (response) => {
    const noteId = getReminderNoteIdFromResponse(response);
    if (!noteId) return;

    if (!navigationRef.isReady()) {
      pendingResponseRef.current = response;
      return;
    }

    const responseKey = getNotificationResponseKey(response);
    if (responseKey && handledResponseKeysRef.current.has(responseKey)) return;
    if (responseKey) handledResponseKeysRef.current.add(responseKey);

    try {
      const note = await noteRepo.getById(noteId);
      if (!note || note.note_type !== REMINDER_NOTE_TYPE) {
        navigateHome();
        Alert.alert(
          'Reminder unavailable',
          'This reminder was deleted or is no longer available.'
        );
        return;
      }

      if (note.password) {
        setLockedReminder(note);
      } else {
        navigateToReminder(note.id);
      }
    } catch (error) {
      console.warn('Failed to open reminder from notification:', error);
      Alert.alert(
        'Unable to open reminder',
        'LockNote could not open this reminder. Please try again.'
      );
    } finally {
      clearLastReminderNotificationResponse().catch((error) => {
        console.warn('Failed to clear notification response:', error);
      });
    }
  }, [navigateHome, navigateToReminder, navigationRef]);

  useEffect(() => {
    const subscription = addReminderNotificationResponseListener((response) => {
      handleNotificationResponse(response);
    });

    const lastResponse = getLastReminderNotificationResponse();
    if (lastResponse) handleNotificationResponse(lastResponse);

    return () => subscription.remove();
  }, [handleNotificationResponse]);

  const handleNavigationReady = useCallback(() => {
    const response = pendingResponseRef.current
      ?? getLastReminderNotificationResponse();
    pendingResponseRef.current = null;
    if (response) handleNotificationResponse(response);
  }, [handleNotificationResponse]);

  const stackScreenOptions = {
    headerStyle: { backgroundColor: colors.background },
    headerShadowVisible: false,
    headerTintColor: colors.primary,
    headerTitleStyle: { fontWeight: '700', color: colors.text },
    contentStyle: { backgroundColor: colors.background },
  };

  const navTheme = scheme === 'dark' ? DarkTheme : DefaultTheme;

  return (
    <>
      <NavigationContainer
        ref={navigationRef}
        onReady={handleNavigationReady}
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
              } else if (route.name === 'Shared') {
                iconName = focused ? 'people' : 'people-outline';
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
          <Tab.Screen name="Shared">
            {() => <SharedStack screenOptions={stackScreenOptions} />}
          </Tab.Screen>
          <Tab.Screen name="Settings">
            {() => <SettingsStack screenOptions={stackScreenOptions} />}
          </Tab.Screen>
          <Tab.Screen name="Profile">
            {() => <ProfileStack screenOptions={stackScreenOptions} />}
          </Tab.Screen>
        </Tab.Navigator>
      </NavigationContainer>

      <PasswordModal
        visible={!!lockedReminder}
        onClose={() => setLockedReminder(null)}
        onVerify={(password) =>
          lockPasswordService.verifyNotePassword(password, lockedReminder)
        }
        onVerified={() => {
          const noteId = lockedReminder?.id;
          setLockedReminder(null);
          if (noteId) navigateToReminder(noteId);
        }}
        allowLockPasswordRecovery
        passwordLabel="LockNote password"
        title="Locked reminder"
        subtitle="Enter your LockNote password to open this reminder"
      />
    </>
  );
};

export default AppNavigator;
