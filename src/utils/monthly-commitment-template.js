import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createMonthlyCommitmentTemplate,
  parseMonthlyCommitmentTemplate,
} from './expense-record.mjs';

const MONTHLY_COMMITMENT_TEMPLATE_KEY =
  '@locknote_monthly_commitment_template';

export const monthlyCommitmentTemplate = {
  async load() {
    const stored = await AsyncStorage.getItem(MONTHLY_COMMITMENT_TEMPLATE_KEY);
    return parseMonthlyCommitmentTemplate(stored).commitments;
  },

  async save(commitments) {
    const template = createMonthlyCommitmentTemplate(commitments);
    await AsyncStorage.setItem(
      MONTHLY_COMMITMENT_TEMPLATE_KEY,
      JSON.stringify(template)
    );
    return template.commitments;
  },
};
