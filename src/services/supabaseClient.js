// Supabase client for account auth, explicit note collaboration, and manual
// private note/folder sync. Local SQLite/AsyncStorage remains the primary store.
// Session persists via AsyncStorage so a logged-in user stays logged in across app restarts.
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const { supabaseUrl, supabaseAnonKey } = Constants.expoConfig?.extra ?? {};

const hasValidUrl = (() => {
  try {
    return ['http:', 'https:'].includes(new URL(supabaseUrl).protocol);
  } catch {
    return false;
  }
})();

export const isSupabaseConfigured = hasValidUrl && Boolean(supabaseAnonKey);

export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : 'https://invalid.supabase.co',
  isSupabaseConfigured ? supabaseAnonKey : 'invalid-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
