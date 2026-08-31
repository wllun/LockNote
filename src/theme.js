// Single source of truth for colors, radii, shadows, and the theme preference.
// Theme mode is 'system' | 'light' | 'dark', persisted in AsyncStorage and shared
// via context (React built-in — not a state library). 'system' follows the OS via
// useColorScheme. StyleSheet is static, so components build styles with
// makeStyles(colors) and read the live palette from useTheme().

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const lightColors = {
  primary: '#4F46E5',
  primarySoft: '#EEF0FE',
  background: '#F4F5FA',
  card: '#FFFFFF',
  text: '#1A1D29',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  border: '#E8EAF0',
  inputBg: '#F4F5FA',
  danger: '#EF4444',
  dangerSoft: '#FEEFEF',
  dangerAction: '#DC2626',
  onDanger: '#FFFFFF',
  folder: '#F59E0B',
  folderSoft: '#FEF4E4',
  backdropSoft: 'rgba(0,0,0,0.50)',
  backdrop: 'rgba(0,0,0,0.50)',
  backdropStrong: 'rgba(0,0,0,0.50)',
  noteColors: {
    default: { surface: '#FFFFFF', accent: '#CBD0DC' },
    rose: { surface: '#FFF0F3', accent: '#E11D48' },
    orange: { surface: '#FFF2E7', accent: '#EA580C' },
    yellow: { surface: '#FFF8D8', accent: '#CA8A04' },
    green: { surface: '#EAF8EF', accent: '#16A34A' },
    blue: { surface: '#EAF3FF', accent: '#2563EB' },
    purple: { surface: '#F3EDFF', accent: '#7C3AED' },
  },
};

const darkColors = {
  primary: '#8B93FF',
  primarySoft: '#2C2F5E',
  background: '#151923',
  card: '#1C2233',
  text: '#F5F7FC',
  textSecondary: '#ACB4C8',
  textTertiary: '#7E879E',
  border: '#353E54',
  inputBg: '#283047',
  danger: '#FF7B7B',
  dangerSoft: '#46232A',
  dangerAction: '#FF8A8A',
  onDanger: '#1A1D29',
  folder: '#FFC94A',
  folderSoft: '#453A1D',
  backdropSoft: 'rgba(0,0,0,0.50)',
  backdrop: 'rgba(0,0,0,0.50)',
  backdropStrong: 'rgba(0,0,0,0.50)',
  noteColors: {
    default: { surface: '#1C2233', accent: '#59647C' },
    rose: { surface: '#321B25', accent: '#FB7185' },
    orange: { surface: '#342318', accent: '#FB923C' },
    yellow: { surface: '#332F18', accent: '#FACC15' },
    green: { surface: '#173023', accent: '#4ADE80' },
    blue: { surface: '#192A3D', accent: '#60A5FA' },
    purple: { surface: '#29213D', accent: '#A78BFA' },
  },
};

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  full: 999,
};

export const shadow = {
  card: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  fab: {
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
};

export const THEME_MODES = ['system', 'light', 'dark'];
const THEME_KEY = '@locknote_theme';

const ThemeContext = createContext(null);

export const ThemeProvider = ({ children }) => {
  const system = useColorScheme();
  const [mode, setModeState] = useState('system');

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((v) => {
      if (THEME_MODES.includes(v)) setModeState(v);
    });
  }, []);

  const setMode = (m) => {
    setModeState(m);
    AsyncStorage.setItem(THEME_KEY, m).catch(() => {});
  };

  const scheme = mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;
  const colors = scheme === 'dark' ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ mode, setMode, scheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
};

// Live palette for styling. Falls back to light if used outside a provider.
export const useTheme = () => useContext(ThemeContext)?.colors ?? lightColors;

// Mode preference + resolved scheme, for the Settings control.
export const useThemeMode = () => {
  const ctx = useContext(ThemeContext);
  return {
    mode: ctx?.mode ?? 'system',
    setMode: ctx?.setMode ?? (() => {}),
    scheme: ctx?.scheme ?? 'light',
  };
};
