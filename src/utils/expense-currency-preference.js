import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_EXPENSE_CURRENCY,
  normalizeExpenseCurrency,
} from './expense-record.mjs';

const EXPENSE_CURRENCY_KEY = '@locknote_expense_currency';

export const expenseCurrencyPreference = {
  async load() {
    try {
      return normalizeExpenseCurrency(
        await AsyncStorage.getItem(EXPENSE_CURRENCY_KEY)
      );
    } catch {
      return DEFAULT_EXPENSE_CURRENCY;
    }
  },

  async save(currency) {
    const normalized = normalizeExpenseCurrency(currency);
    await AsyncStorage.setItem(EXPENSE_CURRENCY_KEY, normalized);
    return normalized;
  },
};
