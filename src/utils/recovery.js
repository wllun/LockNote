// App-wide recovery PIN: lets a forgotten item password be cleared.
// True recovery of a SHA-256 hash is impossible, so this is a reset
// credential, not a password unveil — consistent with the "gating, not
// encryption" model (see docs/ARCHITECTURE.md).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hashPassword } from './crypto';

const RECOVERY_KEY = '@locknote_recovery_pin';

export const recovery = {
  async hasPin() {
    return (await AsyncStorage.getItem(RECOVERY_KEY)) !== null;
  },

  async setPin(pin) {
    await AsyncStorage.setItem(RECOVERY_KEY, await hashPassword(pin));
  },

  async clearPin() {
    await AsyncStorage.removeItem(RECOVERY_KEY);
  },

  async verifyPin(pin) {
    const hash = await AsyncStorage.getItem(RECOVERY_KEY);
    if (!hash) return false;
    return (await hashPassword(pin)) === hash;
  },
};
