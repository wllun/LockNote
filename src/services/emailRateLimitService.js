import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeEmail } from '../utils/auth.mjs';
import {
  createEmailCooldownError,
  getEmailCooldownSeconds,
} from '../utils/email-rate-limit.mjs';

const STORAGE_KEY = '@locknote_auth_email_cooldowns';

const readCooldowns = async () => {
  try {
    const value = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
};

const writeCooldowns = async (cooldowns, now) => {
  const active = Object.fromEntries(
    Object.entries(cooldowns).filter(([, sentAt]) =>
      getEmailCooldownSeconds(sentAt, now) > 0
    )
  );
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(active));
};

export const emailRateLimitService = {
  async getRemainingSeconds(email, now = Date.now()) {
    const normalized = normalizeEmail(email || '');
    if (!normalized) return 0;
    const cooldowns = await readCooldowns();
    return getEmailCooldownSeconds(cooldowns[normalized], now);
  },

  async run(email, send, { shouldRecord = () => true } = {}) {
    const normalized = normalizeEmail(email || '');
    const cooldowns = await readCooldowns();
    const remaining = getEmailCooldownSeconds(cooldowns[normalized]);
    if (remaining > 0) throw createEmailCooldownError(remaining);

    const result = await send();
    if (shouldRecord(result)) {
      const now = Date.now();
      cooldowns[normalized] = now;
      // A local storage failure must not make a successfully sent email look failed.
      await writeCooldowns(cooldowns, now).catch(() => {});
    }
    return result;
  },
};
