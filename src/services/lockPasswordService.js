import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { noteRepo } from '../db/noteRepo';
import { hashPassword } from '../utils/crypto';
import {
  getAuthErrorMessage,
  normalizeEmail,
  validatePassword,
} from '../utils/auth.mjs';
import { sendLockPasswordResetLink } from './authService.mjs';
import {
  isSupabaseConfigured,
  supabase,
} from './supabaseClient';

const CREDENTIAL_KEY = '@locknote_shared_note_password_v1';
const LEGACY_RECOVERY_PIN_KEY = '@locknote_recovery_pin';

const createError = (message, code) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const readStoredCredential = async () => {
  try {
    const raw = await AsyncStorage.getItem(CREDENTIAL_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!/^[a-f0-9]{64}$/i.test(value?.passwordHash ?? '')) return null;
    return {
      version: 1,
      passwordHash: value.passwordHash.toLowerCase(),
      recoveryUserId: value.recoveryUserId || null,
      recoveryEmail: value.recoveryEmail
        ? normalizeEmail(value.recoveryEmail)
        : null,
      updatedAt: value.updatedAt || null,
    };
  } catch {
    return null;
  }
};

const saveCredential = async (credential) => {
  const normalized = {
    version: 1,
    passwordHash: credential.passwordHash.toLowerCase(),
    recoveryUserId: credential.recoveryUserId || null,
    recoveryEmail: credential.recoveryEmail
      ? normalizeEmail(credential.recoveryEmail)
      : null,
    updatedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(CREDENTIAL_KEY, JSON.stringify(normalized));
  return normalized;
};

const getActiveLockedNotes = async () => {
  const snapshot = await noteRepo.getSyncSnapshot();
  return snapshot.records.filter((note) => !!note.password);
};

const getCurrentSessionIdentity = async () => {
  const { data } = await supabase.auth.getSession();
  const user = data?.session?.user;
  return user?.id && user?.email
    ? { recoveryUserId: user.id, recoveryEmail: normalizeEmail(user.email) }
    : { recoveryUserId: null, recoveryEmail: null };
};

const resolveCredential = async () => {
  const stored = await readStoredCredential();
  const lockedNotes = await getActiveLockedNotes();
  const hashes = [...new Set(lockedNotes.map((note) => note.password).filter(Boolean))];

  if (stored) {
    // A password change made on another device is carried by the hashes already
    // present on every synced locked note. If none still uses this device's
    // verifier and all notes agree, adopt that common verifier locally.
    const storedUpdatedAt = Date.parse(stored.updatedAt || '') || 0;
    const commonHashUpdatedAt = Math.max(
      0,
      ...lockedNotes.map((note) => Date.parse(note.updated_at || '') || 0)
    );
    if (
      lockedNotes.length > 0 &&
      hashes.length === 1 &&
      hashes[0] !== stored.passwordHash &&
      commonHashUpdatedAt > storedUpdatedAt
    ) {
      const credential = await saveCredential({
        ...stored,
        passwordHash: hashes[0],
      });
      return {
        credential,
        lockedCount: lockedNotes.length,
        legacyLockedCount: 0,
      };
    }
    return {
      credential: stored,
      lockedCount: lockedNotes.length,
      legacyLockedCount: lockedNotes.filter(
        (note) => note.password !== stored.passwordHash
      ).length,
    };
  }

  // A previous LockNote version copied the password hash into every note. If
  // those hashes already agree, adopting that verifier does not weaken access.
  if (hashes.length === 1) {
    const credential = await saveCredential({ passwordHash: hashes[0] });
    return { credential, lockedCount: lockedNotes.length, legacyLockedCount: 0 };
  }

  return {
    credential: null,
    lockedCount: lockedNotes.length,
    legacyLockedCount: lockedNotes.length,
  };
};

const linkRecoveryIdentity = async (credential) => {
  if (credential.recoveryUserId && credential.recoveryEmail) return credential;
  const identity = await getCurrentSessionIdentity();
  return { ...credential, ...identity };
};

const assertNewPassword = (password) => {
  const message = validatePassword(password);
  if (message) throw createError(message, 'LOCK_PASSWORD_VALIDATION');
};

export const maskRecoveryEmail = (email) => {
  const normalized = normalizeEmail(email ?? '');
  const [local, domain] = normalized.split('@');
  if (!local || !domain) return '';
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(3, local.length - visible.length))}@${domain}`;
};

export const lockPasswordService = {
  async getStatus() {
    const state = await resolveCredential();
    return {
      configured: !!state.credential,
      lockedCount: state.lockedCount,
      legacyLockedCount: state.legacyLockedCount,
      recoveryEnabled: !!(
        state.credential?.recoveryUserId && state.credential?.recoveryEmail
      ),
      recoveryEmail: state.credential?.recoveryEmail || null,
      maskedRecoveryEmail: maskRecoveryEmail(
        state.credential?.recoveryEmail || ''
      ),
    };
  },

  async removeUnsafeLegacyRecoveryPin() {
    await AsyncStorage.removeItem(LEGACY_RECOVERY_PIN_KEY);
  },

  async setOrChangePassword({ oldPassword = '', newPassword }) {
    assertNewPassword(newPassword);
    const state = await resolveCredential();
    const newPasswordHash = await hashPassword(newPassword);
    let currentPasswordHash = null;

    if (state.credential) {
      const oldPasswordHash = await hashPassword(oldPassword);
      if (oldPasswordHash !== state.credential.passwordHash) {
        throw createError('Old LockNote password is incorrect.', 'LOCK_PASSWORD_INCORRECT');
      }
      currentPasswordHash = state.credential.passwordHash;
    } else if (state.lockedCount > 0) {
      if (!oldPassword) {
        throw createError(
          'Enter one of your existing note passwords to start the shared password.',
          'LOCK_PASSWORD_REQUIRED'
        );
      }
      const oldPasswordHash = await hashPassword(oldPassword);
      const lockedNotes = await getActiveLockedNotes();
      if (!lockedNotes.some((note) => note.password === oldPasswordHash)) {
        throw createError('Old note password is incorrect.', 'LOCK_PASSWORD_INCORRECT');
      }
      currentPasswordHash = oldPasswordHash;
    }

    const recoveryIdentity = await getCurrentSessionIdentity();
    const credential = await saveCredential({
      passwordHash: newPasswordHash,
      ...recoveryIdentity,
    });
    const updatedCount = currentPasswordHash
      ? await noteRepo.replaceLockedPasswordHash(
          newPasswordHash,
          currentPasswordHash
        )
      : 0;
    const refreshed = await resolveCredential();
    return {
      updatedCount,
      legacyLockedCount: refreshed.legacyLockedCount,
      recoveryEnabled: !!(
        credential.recoveryUserId && credential.recoveryEmail
      ),
      recoveryEmail: credential.recoveryEmail,
    };
  },

  async lockNote(noteId, password) {
    const state = await resolveCredential();
    const enteredHash = await hashPassword(password);
    let credential = state.credential;

    if (credential) {
      if (enteredHash !== credential.passwordHash) {
        throw createError(
          'Enter your current LockNote password.',
          'LOCK_PASSWORD_INCORRECT'
        );
      }
    } else if (state.lockedCount > 0) {
      const lockedNotes = await getActiveLockedNotes();
      if (!lockedNotes.some((note) => note.password === enteredHash)) {
        throw createError(
          'Enter an existing note password, or create the shared password in Settings.',
          'LOCK_PASSWORD_INCORRECT'
        );
      }
      credential = await saveCredential(
        await linkRecoveryIdentity({ passwordHash: enteredHash })
      );
    } else {
      assertNewPassword(password);
      credential = await saveCredential(
        await linkRecoveryIdentity({ passwordHash: enteredHash })
      );
    }

    await noteRepo.update(noteId, { password });
    return credential;
  },

  async verifyNotePassword(password, note) {
    if (!note?.password) return false;
    const enteredHash = await hashPassword(password);
    const state = await resolveCredential();

    if (!state.credential) return enteredHash === note.password;
    if (note.password === state.credential.passwordHash) {
      return enteredHash === state.credential.passwordHash;
    }

    // Preserve access to a note created before the shared-password migration.
    // Once its old password is proven, migrate every note using that same old
    // verifier to the current LockNote password.
    if (enteredHash === note.password) {
      await noteRepo.replaceLockedPasswordHash(
        state.credential.passwordHash,
        note.password
      );
      return true;
    }
    return false;
  },

  async requestResetEmail() {
    const state = await resolveCredential();
    const credential = state.credential;
    if (!credential?.recoveryUserId || !credential?.recoveryEmail) {
      throw createError(
        'Email recovery is not linked. Sign in, then change your LockNote password using the old password to link it safely.',
        'LOCK_RECOVERY_NOT_LINKED'
      );
    }

    try {
      await sendLockPasswordResetLink(
        supabase.auth,
        isSupabaseConfigured,
        credential.recoveryEmail,
        Linking.createURL('reset-lock-password')
      );
    } catch (error) {
      throw createError(
        getAuthErrorMessage(error, 'Unable to send the reset email. Please try again.'),
        'LOCK_RECOVERY_EMAIL_FAILED'
      );
    }
    return { email: credential.recoveryEmail };
  },

  async resetPasswordAfterEmail(newPassword, user) {
    assertNewPassword(newPassword);
    const state = await resolveCredential();
    const credential = state.credential;
    const email = normalizeEmail(user?.email ?? '');
    if (
      !credential?.recoveryUserId ||
      credential.recoveryUserId !== user?.id ||
      credential.recoveryEmail !== email
    ) {
      throw createError(
        'This email account is not authorized to reset the LockNote password.',
        'LOCK_RECOVERY_ACCOUNT_MISMATCH'
      );
    }

    const newPasswordHash = await hashPassword(newPassword);
    await saveCredential({
      ...credential,
      passwordHash: newPasswordHash,
    });
    const updatedCount = await noteRepo.replaceLockedPasswordHash(newPasswordHash);
    return { updatedCount };
  },
};
