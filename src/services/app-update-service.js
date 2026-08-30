import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { isSupabaseConfigured, supabase } from './supabaseClient';
import { evaluateAppUpdate } from '../utils/app-update-policy.mjs';

const CACHE_KEY = '@locknote_app_update_config_v1';
const REQUEST_TIMEOUT_MS = 5000;
const PLAY_PACKAGE = 'com.locknote.app';
const PLAY_MARKET_URL = `market://details?id=${PLAY_PACKAGE}`;
const PLAY_WEB_URL = `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`;

const unsupportedResult = (reason) => ({
  checked: true,
  supported: false,
  required: false,
  updateAvailable: false,
  reason,
});

const readCache = async () => {
  try {
    const value = JSON.parse(await AsyncStorage.getItem(CACHE_KEY));
    return value?.config && value?.fetchedAt ? value : null;
  } catch {
    return null;
  }
};

const saveCache = async (config, fetchedAt) => {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ config, fetchedAt }));
};

const fetchRemoteConfig = async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const { data, error } = await supabase
      .from('app_update_config')
      .select(
        'platform,latest_version_code,minimum_version_code,force_update_enabled,update_url,message'
      )
      .eq('platform', 'android')
      .abortSignal(controller.signal)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Android update configuration is missing.');
    return data;
  } finally {
    clearTimeout(timeout);
  }
};

const evaluateCachedConfig = async (currentBuildVersion) => {
  const cached = await readCache();
  if (!cached) return unsupportedResult('unavailable');
  return evaluateAppUpdate({
    currentBuildVersion,
    config: cached.config,
    source: 'cache',
    fetchedAt: cached.fetchedAt,
  });
};

export const checkForAppUpdate = async () => {
  if (Platform.OS !== 'android') return unsupportedResult('unsupported-platform');
  if (Constants.executionEnvironment === 'storeClient') {
    return unsupportedResult('expo-go');
  }

  const currentBuildVersion = Application.nativeBuildVersion;
  if (!currentBuildVersion) return unsupportedResult('unknown-build');
  if (!isSupabaseConfigured) return evaluateCachedConfig(currentBuildVersion);

  try {
    const config = await fetchRemoteConfig();
    const fetchedAt = new Date().toISOString();
    const result = evaluateAppUpdate({ currentBuildVersion, config });
    if (!result.supported) throw new Error('Invalid app update configuration.');
    await saveCache(config, fetchedAt).catch(() => {});
    return result;
  } catch (error) {
    console.warn('App update check failed; using a recent cached policy if available.');
    return evaluateCachedConfig(currentBuildVersion);
  }
};

export const openAppUpdatePage = async (configuredUrl) => {
  const urls = [configuredUrl, PLAY_MARKET_URL, PLAY_WEB_URL]
    .filter((url, index, values) => url && values.indexOf(url) === index);

  for (const url of urls) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {}
  }
  return false;
};
