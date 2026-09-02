export const APP_UPDATE_CACHE_MAX_AGE_MS = 72 * 60 * 60 * 1000;
export const DEFAULT_APP_UPDATE_MESSAGE =
  'A newer version of LockNote is required to continue.';

const SUPPORTED_PLATFORMS = new Set(['android', 'ios']);

export const parseBuildVersion = (value) => {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeUpdateUrl = (value, platform) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    const allowedProtocols = platform === 'android'
      ? ['https:', 'market:']
      : ['https:'];
    return allowedProtocols.includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
};

export const normalizeAppUpdateConfig = (value) => {
  if (!value || !SUPPORTED_PLATFORMS.has(value.platform)) return null;

  const latestVersionCode = parseBuildVersion(value.latest_version_code);
  const minimumVersionCode = parseBuildVersion(value.minimum_version_code);
  const updateUrl = normalizeUpdateUrl(value.update_url, value.platform);
  if (
    !latestVersionCode ||
    !minimumVersionCode ||
    latestVersionCode < minimumVersionCode ||
    !updateUrl
  ) {
    return null;
  }

  const message = typeof value.message === 'string'
    ? value.message.trim().slice(0, 500)
    : '';

  return {
    platform: value.platform,
    latestVersionCode,
    minimumVersionCode,
    forceUpdateEnabled: value.force_update_enabled === true,
    updateUrl,
    message: message || DEFAULT_APP_UPDATE_MESSAGE,
  };
};

export const evaluateAppUpdate = ({
  currentBuildVersion,
  config,
  source = 'remote',
  fetchedAt = null,
  now = Date.now(),
  maxCacheAgeMs = APP_UPDATE_CACHE_MAX_AGE_MS,
} = {}) => {
  const currentBuild = parseBuildVersion(currentBuildVersion);
  const normalized = normalizeAppUpdateConfig(config);
  if (!currentBuild || !normalized) {
    return {
      checked: true,
      supported: false,
      required: false,
      updateAvailable: false,
      reason: 'invalid-config',
    };
  }

  if (source === 'cache') {
    const cachedAt = Date.parse(fetchedAt ?? '');
    const cacheAge = now - cachedAt;
    if (!Number.isFinite(cachedAt) || cacheAge < 0 || cacheAge > maxCacheAgeMs) {
      return {
        checked: true,
        supported: true,
        required: false,
        updateAvailable: false,
        reason: 'stale-cache',
        source,
        currentBuildVersion: currentBuild,
      };
    }
  }

  const updateAvailable = currentBuild < normalized.latestVersionCode;
  const required = normalized.forceUpdateEnabled &&
    currentBuild < normalized.minimumVersionCode;

  return {
    checked: true,
    supported: true,
    required,
    updateAvailable,
    reason: required ? 'below-minimum' : updateAvailable ? 'update-available' : 'current',
    source,
    platform: normalized.platform,
    currentBuildVersion: currentBuild,
    latestVersionCode: normalized.latestVersionCode,
    minimumVersionCode: normalized.minimumVersionCode,
    updateUrl: normalized.updateUrl,
    message: normalized.message,
  };
};
