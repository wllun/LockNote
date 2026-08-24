import { noteRepo } from '../db/noteRepo';
import { collaborationService } from './collaborationService';
import {
  EXPENSE_NOTE_TYPE,
  normalizeExpenseCurrency,
  setExpenseNoteCurrency,
} from '../utils/expense-record.mjs';

export const expenseCurrencyService = {
  async applyToExistingNotes(currency) {
    const normalizedCurrency = normalizeExpenseCurrency(currency);
    const { records } = await noteRepo.getSyncSnapshot();
    const expenseNotes = records.filter(
      (note) => note.note_type === EXPENSE_NOTE_TYPE
    );
    let updatedCount = 0;
    let pendingCloudCount = 0;
    let failedCount = 0;

    for (const note of expenseNotes) {
      const content = setExpenseNoteCurrency(
        note.content,
        normalizedCurrency
      );

      try {
        await collaborationService.save(note.id, {
          title: note.title,
          content,
        });
        updatedCount += 1;
      } catch (error) {
        if (error?.localSaved) {
          updatedCount += 1;
          pendingCloudCount += 1;
        } else {
          failedCount += 1;
        }
      }
    }

    return {
      currency: normalizedCurrency,
      noteCount: expenseNotes.length,
      updatedCount,
      pendingCloudCount,
      failedCount,
    };
  },
};
