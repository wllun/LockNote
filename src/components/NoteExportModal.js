import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  saveNoteImage,
  saveNotePdf,
  shareNoteImage,
  shareNotePdf,
} from '../utils/note-export-adapter';
import {
  formatExportAmount,
  getExpenseExportCategories,
  getExpenseExportCategorizedTotal,
  getExpenseExportCategoryDescription,
  getExpenseExportMonthlyCommitments,
  getExpenseExportRows,
  getChecklistExportItems,
  getExportTitle,
} from '../utils/note-export.mjs';
import { radius, shadow, useTheme } from '../theme';
import { formatReminderSchedule, normalizeReminder } from '../utils/reminder-note.mjs';

const NoteExportModal = ({
  visible,
  onClose,
  title,
  content = '',
  rows,
  total = 0,
  categories = [],
  summaryNote = '',
  monthlyCommitments = [],
  checklistItems,
  type = 'note',
  reminder,
}) => {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const previewRef = useRef(null);
  const [exporting, setExporting] = useState(null);
  const exportData = {
    title,
    content,
    rows,
    total,
    categories,
    summaryNote,
    monthlyCommitments,
    checklistItems,
    type,
    reminder,
  };
  const visibleRows = getExpenseExportRows(rows);
  const visibleCategories = getExpenseExportCategories(categories);
  const visibleCommitments = getExpenseExportMonthlyCommitments(monthlyCommitments);
  const visibleChecklistItems = getChecklistExportItems(checklistItems);
  const checklistCompleted = visibleChecklistItems.filter((item) => item.completed).length;
  const visibleSummaryNote = typeof summaryNote === 'string' ? summaryNote.trim() : '';
  const hasMonthlySummary = visibleCategories.length > 0 || visibleSummaryNote.length > 0;
  const visibleReminder = normalizeReminder(reminder);

  const runExport = async (format, destination = 'save') => {
    const actionKey = `${destination}:${format}`;
    setExporting(actionKey);
    try {
      let result;
      if (destination === 'share') {
        if (format === 'pdf') result = await shareNotePdf(exportData);
        else result = await shareNoteImage(previewRef.current, exportData);
      } else if (format === 'pdf') {
        result = await saveNotePdf(exportData);
      } else {
        result = await saveNoteImage(previewRef.current, exportData);
      }

      if (result?.canceled || destination === 'share' || Platform.OS === 'web') return;
      Alert.alert(
        'Saved',
        format === 'pdf'
          ? 'The PDF was saved to the folder you selected.'
          : 'The image was saved to your gallery.'
      );
    } catch (error) {
      const action = destination === 'share' ? 'Share' : 'Save';
      Alert.alert(
        `${action} failed`,
        error?.message || `Could not ${action.toLowerCase()} the ${format.toUpperCase()}.`
      );
    } finally {
      setExporting(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={[styles.sheet, { paddingBottom: Math.max(20, insets.bottom + 12) }]}
          accessibilityViewIsModal
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>EXPORT NOTE</Text>
              <Text style={styles.title}>
                {Platform.OS === 'web' ? 'Choose a format' : 'Save or share'}
              </Text>
            </View>
            <Pressable style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close export">
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView style={styles.previewScroll} contentContainerStyle={styles.previewScrollContent}>
            <View ref={previewRef} collapsable={false} style={styles.preview}>
              <Text style={styles.previewTitle}>{getExportTitle(title, type)}</Text>
              <View style={styles.accent} />
              {type === 'reminder' ? (
                <>
                  <View style={styles.reminderPreview}>
                    <View style={styles.reminderPreviewIcon}>
                      <Ionicons name={visibleReminder.enabled ? 'notifications' : 'notifications-off-outline'} size={20} color="#4854dc" />
                    </View>
                    <View style={styles.reminderPreviewText}>
                      <Text style={styles.reminderPreviewTitle}>{visibleReminder.enabled ? 'Reminder scheduled' : 'Reminder is off'}</Text>
                      <Text style={styles.reminderPreviewSchedule}>{visibleReminder.enabled ? formatReminderSchedule(visibleReminder) : 'No notification scheduled'}</Text>
                    </View>
                  </View>
                  <Text style={styles.previewBody}>{content || 'This reminder note is empty.'}</Text>
                </>
              ) : type === 'checklist' ? (
                <View style={styles.checklistPreview}>
                  <Text style={styles.checklistSummary}>
                    {checklistCompleted} of {visibleChecklistItems.length} completed
                  </Text>
                  {visibleChecklistItems.length ? (
                    visibleChecklistItems.map((item, index) => (
                      <View key={item.id || index} style={styles.checklistRow}>
                        <View style={[styles.checklistBox, item.completed && styles.checklistBoxChecked]}>
                          {item.completed && <Text style={styles.checklistMark}>✓</Text>}
                        </View>
                        <Text style={[styles.checklistText, item.completed && styles.checklistTextCompleted]}>
                          {item.text}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.previewBody}>No checklist items</Text>
                  )}
                </View>
              ) : rows ? (
                <>
                  {!!visibleCommitments.length && (
                    <View style={[styles.monthlySummary, styles.firstExpenseSection]}>
                      <Text style={styles.summaryTitle}>Monthly commitments</Text>
                      {visibleCommitments.map((item) => (
                        <View key={item.id || item.remark} style={styles.summaryCategoryRow}>
                          <View style={styles.summaryCategoryInfo}>
                            <Text style={styles.summaryCategoryName}>{item.remark}</Text>
                            <Text style={styles.summaryCategoryMeta}>
                              {item.day ? `Due day ${item.day}` : 'No due day'} · {item.isPaid ? 'Paid' : 'Unpaid'}
                            </Text>
                          </View>
                          <Text style={styles.summaryCategoryAmount}>
                            RM {formatExportAmount(item.amount)}
                          </Text>
                        </View>
                      ))}
                      <View style={styles.categorizedTotalRow}>
                        <Text style={styles.categorizedTotalLabel}>Remaining</Text>
                        <Text style={styles.categorizedTotalAmount}>
                          RM {formatExportAmount(
                            visibleCommitments
                              .filter((item) => !item.isPaid)
                              .reduce((sum, item) => sum + item.amount, 0)
                          )}
                        </Text>
                      </View>
                    </View>
                  )}
                  <View style={[styles.dailyExpenses, !visibleCommitments.length && styles.firstExpenseSection]}>
                    <Text style={styles.summaryTitle}>Daily expenses</Text>
                    <View style={[styles.tableRow, styles.tableHeader]}>
                      <Text style={[styles.headerCell, styles.dateCell]}>Day</Text>
                      <Text style={[styles.headerCell, styles.remarkCell]}>Remark</Text>
                      <Text style={[styles.headerCell, styles.amountCell]}>RM</Text>
                    </View>
                    {visibleRows.map((row, index) => (
                      <View key={row.id || index} style={[styles.tableRow, index % 2 === 0 && styles.altRow]}>
                        <Text style={[styles.cell, styles.dateCell]}>{row.date}</Text>
                        <Text style={[styles.cell, styles.remarkCell]}>{row.remark}</Text>
                        <Text style={[styles.cell, styles.amountCell]}>{row.amount || '0.00'}</Text>
                      </View>
                    ))}
                    <Text style={styles.total}>Total  RM {formatExportAmount(total)}</Text>
                  </View>
                  {hasMonthlySummary && (
                    <View style={styles.monthlySummary}>
                      <Text style={styles.summaryTitle}>Monthly summary</Text>
                      {visibleCategories.map((category) => (
                        <View key={category.id || category.name} style={styles.summaryCategoryRow}>
                          <View style={styles.summaryCategoryInfo}>
                            <Text style={styles.summaryCategoryName}>{category.name}</Text>
                            <Text style={styles.summaryCategoryMeta}>
                              {getExpenseExportCategoryDescription(category)}
                            </Text>
                          </View>
                          <Text style={styles.summaryCategoryAmount}>
                            RM {formatExportAmount(category.amount)}
                          </Text>
                        </View>
                      ))}
                      {!!visibleCategories.length && (
                        <View style={styles.categorizedTotalRow}>
                          <Text style={styles.categorizedTotalLabel}>Categorized total</Text>
                          <Text style={styles.categorizedTotalAmount}>
                            RM {formatExportAmount(getExpenseExportCategorizedTotal(visibleCategories))}
                          </Text>
                        </View>
                      )}
                      {!!visibleSummaryNote && (
                        <View style={styles.summaryNoteCard}>
                          <Text style={styles.summaryNoteLabel}>Summary note</Text>
                          <Text style={styles.summaryNoteText}>{visibleSummaryNote}</Text>
                        </View>
                      )}
                    </View>
                  )}
                </>
              ) : (
                <Text style={styles.previewBody}>{content || 'This note is empty.'}</Text>
              )}
              <Text style={styles.brand}>Exported from LockNote</Text>
            </View>
          </ScrollView>

          <View style={styles.actions}>
            {[
              {
                format: 'pdf',
                icon: 'document-text-outline',
                label: Platform.OS === 'web' ? 'Print / save PDF' : 'Save PDF',
              },
              {
                format: 'image',
                icon: 'image-outline',
                label: Platform.OS === 'web' ? 'Download image' : 'Save image',
              },
            ].map((item) => (
              <View key={item.format} style={styles.actionRow}>
                <Pressable
                  disabled={!!exporting}
                  style={({ pressed }) => [
                    styles.action,
                    pressed && styles.pressed,
                    exporting && styles.disabled,
                  ]}
                  onPress={() => runExport(item.format)}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  accessibilityState={{
                    disabled: !!exporting,
                    busy: exporting === `save:${item.format}`,
                  }}
                >
                  {exporting === `save:${item.format}` ? (
                    <ActivityIndicator color={colors.card} />
                  ) : (
                    <Ionicons name={item.icon} size={21} color={colors.card} />
                  )}
                  <Text style={styles.actionText}>
                    {exporting === `save:${item.format}` ? 'Preparing...' : item.label}
                  </Text>
                </Pressable>
                {Platform.OS !== 'web' && (
                  <Pressable
                    disabled={!!exporting}
                    style={({ pressed }) => [
                      styles.shareAction,
                      pressed && styles.pressed,
                      exporting && styles.disabled,
                    ]}
                    onPress={() => runExport(item.format, 'share')}
                    accessibilityRole="button"
                    accessibilityLabel={`Share ${item.format === 'pdf' ? 'PDF' : 'image'}`}
                    accessibilityHint="Opens the system share menu"
                    accessibilityState={{
                      disabled: !!exporting,
                      busy: exporting === `share:${item.format}`,
                    }}
                  >
                    {exporting === `share:${item.format}` ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <Ionicons name="share-outline" size={21} color={colors.primary} />
                    )}
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const makeStyles = (colors) => StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.52)' },
  sheet: { maxHeight: '90%', backgroundColor: colors.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: 20, gap: 16, ...shadow.card },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  title: { color: colors.text, fontSize: 21, fontWeight: '800', marginTop: 2 },
  closeButton: { width: 48, height: 48, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.inputBg },
  pressed: { opacity: 0.72 },
  previewScroll: { maxHeight: 430, flexShrink: 1, borderRadius: radius.md, backgroundColor: colors.background },
  previewScrollContent: { padding: 12 },
  preview: { width: '100%', minHeight: 260, padding: 24, backgroundColor: '#ffffff', borderRadius: radius.md },
  previewTitle: { color: '#172033', fontSize: 24, lineHeight: 30, fontWeight: '800' },
  accent: { height: 3, backgroundColor: '#5b67f1', borderRadius: radius.full, marginTop: 14, marginBottom: 20 },
  previewBody: { color: '#30384c', fontSize: 15, lineHeight: 23 },
  reminderPreview: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginBottom: 18, borderWidth: 1, borderColor: '#c7cdfd', borderRadius: 12, backgroundColor: '#f1f2ff' },
  reminderPreviewIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
  reminderPreviewText: { flex: 1 }, reminderPreviewTitle: { color: '#30384c', fontSize: 14, fontWeight: '800' }, reminderPreviewSchedule: { color: '#687086', fontSize: 12, lineHeight: 17, marginTop: 2 },
  checklistPreview: { gap: 9 },
  checklistSummary: { color: '#4854dc', fontSize: 14, fontWeight: '800', marginBottom: 4 },
  checklistRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderColor: '#dfe3ee', borderRadius: 10 },
  checklistBox: { width: 23, height: 23, borderRadius: 7, borderWidth: 2, borderColor: '#9aa3b7', alignItems: 'center', justifyContent: 'center' },
  checklistBoxChecked: { backgroundColor: '#5b67f1', borderColor: '#5b67f1' },
  checklistMark: { color: '#ffffff', fontSize: 15, fontWeight: '900' },
  checklistText: { flex: 1, color: '#30384c', fontSize: 15, lineHeight: 21 },
  checklistTextCompleted: { color: '#7b8498', textDecorationLine: 'line-through' },
  tableRow: { flexDirection: 'row', minHeight: 42, borderBottomWidth: 1, borderBottomColor: '#dfe3ee', alignItems: 'center' },
  tableHeader: { backgroundColor: '#5b67f1', borderBottomWidth: 0 },
  altRow: { backgroundColor: '#f6f7fb' },
  headerCell: { color: '#ffffff', fontSize: 11, fontWeight: '800', padding: 8 },
  cell: { color: '#30384c', fontSize: 12, padding: 8 },
  dateCell: { width: 64 }, remarkCell: { flex: 1 }, amountCell: { width: 92, textAlign: 'right' },
  total: { color: '#4854dc', textAlign: 'right', fontSize: 17, fontWeight: '800', marginTop: 18 },
  dailyExpenses: { marginTop: 28, paddingTop: 20, borderTopWidth: 2, borderTopColor: '#dfe3ee' },
  monthlySummary: { marginTop: 28, paddingTop: 20, borderTopWidth: 2, borderTopColor: '#dfe3ee' },
  firstExpenseSection: { marginTop: 0, paddingTop: 0, borderTopWidth: 0 },
  summaryTitle: { color: '#172033', fontSize: 18, lineHeight: 23, fontWeight: '800', marginBottom: 10 },
  summaryCategoryRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#dfe3ee' },
  summaryCategoryInfo: { flex: 1, minWidth: 0 },
  summaryCategoryName: { color: '#30384c', fontSize: 13, fontWeight: '800' },
  summaryCategoryMeta: { color: '#687086', fontSize: 10, lineHeight: 15, marginTop: 2 },
  summaryCategoryAmount: { color: '#30384c', fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  categorizedTotalRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 12 },
  categorizedTotalLabel: { color: '#687086', fontSize: 12, fontWeight: '700' },
  categorizedTotalAmount: { color: '#4854dc', fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  summaryNoteCard: { marginTop: 18, padding: 14, borderLeftWidth: 4, borderLeftColor: '#5b67f1', backgroundColor: '#f6f7fb' },
  summaryNoteLabel: { color: '#30384c', fontSize: 11, fontWeight: '800', marginBottom: 5 },
  summaryNoteText: { color: '#30384c', fontSize: 12, lineHeight: 18 },
  brand: { color: '#8a91a3', fontSize: 10, marginTop: 28 },
  actions: { gap: 10 },
  actionRow: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.md, backgroundColor: colors.primary },
  actionText: { color: colors.card, fontSize: 14, fontWeight: '800' },
  shareAction: { width: 52, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, backgroundColor: colors.card },
  disabled: { opacity: 0.55 },
});

export default NoteExportModal;
