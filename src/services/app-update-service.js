import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { isSupabaseConfigured, supabase } from './supabaseClient';
import { evaluateAppUpdate } from '../utils/app-update-policy.mjs';

const CACHE_KEY_PREFIX = '@locknote_app_update_config_v2';
const LEGACY_ANDROID_CACHE_KEY = '@locknote_app_update_config_v1';
const REQUEST_TIMEOUT_MS = 5000;
const PLAY_PACKAGE = 'com.locknote.app';
const PLAY_MARKET_URL = `market://details?id=${PLAY_PACKAGE}`;
const PLAY_WEB_URL = `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`;
const SUPPORTED_PLATFORMS = new Set(['android', 'ios']);

const unsupportedResult = (reason) => ({
  checked: true,
  supported: false,
  required: false,
  updateAvailable: false,
  reason,
});

const getCacheKey = (platform) => `${CACHE_KEY_PREFIX}_${platform}`;

const readCache = async (platform) => {
  try {
    let raw = await AsyncStorage.getItem(getCacheKey(platform));
    if (!raw && platform === 'android') {
      raw = await AsyncStorage.getItem(LEGACY_ANDROID_CACHE_KEY);
    }
    const value = JSON.parse(raw);
    return value?.config && value?.fetchedAt ? value : null;
  } catch {
    return null;
  }
};

const saveCache = async (platform, config, fetchedAt) => {
  await AsyncStorage.setItem(
    getCacheKey(platform),
    JSON.stringify({ config, fetchedAt })
  );
};

const fetchRemoteConfig = async (platform) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const { data, error } = await supabase
      .from('app_update_config')
      .select(
        'platform,latest_version_code,minimum_version_code,force_update_enabled,update_url,message'
      )
      .eq('platform', platform)
      .abortSignal(controller.signal)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`${platform} update configuration is missing.`);
    return data;
  } finally {
    clearTimeout(timeout);
  }
};

const evaluateCachedConfig = async (platform, currentBuildVersion) => {
  const cached = await readCache(platform);
  if (!cached) return unsupportedResult('unavailable');
  if (cached.config?.platform !== platform) return unsupportedResult('invalid-cache');
  return evaluateAppUpdate({
    currentBuildVersion,
    config: cached.config,
    source: 'cache',
    fetchedAt: cached.fetchedAt,
  });
};

export const checkForAppUpdate = async () => {
  const platform = Platform.OS;
  if (!SUPPORTED_PLATFORMS.has(platform)) {
    return unsupportedResult('unsupported-platform');
  }
  if (Constants.executionEnvironment === 'storeClient') {
    return unsupportedResult('expo-go');
  }

  const currentBuildVersion = Application.nativeBuildVersion;
  if (!currentBuildVersion) return unsupportedResult('unknown-build');
  if (!isSupabaseConfigured) {
    return evaluateCachedConfig(platform, currentBuildVersion);
  }

  try {
    const config = await fetchRemoteConfig(platform);
    const fetchedAt = new Date().toISOString();
    const result = evaluateAppUpdate({ currentBuildVersion, config });
    if (!result.supported) throw new Error('Invalid app update configuration.');
    await saveCache(platform, config, fetchedAt).catch(() => {});
    return result;
  } catch (error) {
    console.warn('App update check failed; using a recent cached policy if available.');
    return evaluateCachedConfig(platform, currentBuildVersion);
  }
};

export const openAppUpdatePage = async (configuredUrl) => {
  const platformFallbacks = Platform.OS === 'android'
    ? [PLAY_MARKET_URL, PLAY_WEB_URL]
    : [];
  const urls = [configuredUrl, ...platformFallbacks]
    .filter((url, index, values) => url && values.indexOf(url) === index);

  for (const url of urls) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {}
  }
  return false;
};
