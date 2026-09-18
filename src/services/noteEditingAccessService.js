import { folderRepo } from '../db/folderRepo';
import { premiumAccessService } from './premiumAccessService';
import { isSubfolderReadOnly, subfolderReadOnlyError } from '../utils/subfolder-edit-access.mjs';

export const noteEditingAccessService = {
  async isReadOnly(note) {
    if (!note?.folder_id || note.share_origin === 'incoming') return false;
    const folder = await folderRepo.getById(note.folder_id);
    return isSubfolderReadOnly(note, folder, premiumAccessService.getPlan());
  },
  async requireFolder(folderId) {
    if (!folderId) return;
    const note = { folder_id: folderId };
    if (!(await this.isReadOnly(note))) return;
    try {
      await premiumAccessService.require('nesting');
    } catch (error) {
      if (error?.code === 'PREMIUM_REQUIRED') throw subfolderReadOnlyError();
      throw error;
    }
  },
  async requireNote(note) {
    if (note?.share_origin !== 'incoming') await this.requireFolder(note?.folder_id);
  },
};
