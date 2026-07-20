// Supabase client for account auth only — notes/folders stay in local
// SQLite/AsyncStorage (see docs/ARCHITECTURE.md). Session persists via
// AsyncStorage so a logged-in user stays logged in across app restarts.
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const { supabaseUrl, supabaseAnonKey } = Constants.expoConfig?.extra ?? {};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
