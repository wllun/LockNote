import * as Crypto from 'expo-crypto';

export const hashPassword = async (password) => {
  const result = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    password
  );
  return result;
};

export const verifyPassword = async (password, hash) => {
  const result = await hashPassword(password);
  return result === hash;
};
