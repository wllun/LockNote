import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { exportNoteImage, exportNotePdf } from '../utils/note-export';
import {
  formatExportAmount,
  getExpenseExportCategories,
  getExpenseExportCategorizedTotal,
  getExpenseExportCategoryDescription,
  getExportTitle,
} from '../utils/note-export.mjs';
import { radius, shadow, useTheme } from '../theme';

const NoteExportModal = ({
  visible,
  onClose,
  title,
  content = '',
  rows,
  total = 0,
  categories = [],
  summaryNote = '',
  type = 'note',
}) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const previewRef = useRef(null);
  const [exporting, setExporting] = useState(null);
  const exportData = { title, content, rows, total, categories, summaryNote, type };
  const visibleRows = rows?.filter((row) => row.date?.trim() || row.remark?.trim() || row.amount?.trim()) ?? [];
  const visibleCategories = getExpenseExportCategories(categories);
  const visibleSummaryNote = typeof summaryNote === 'string' ? summaryNote.trim() : '';
  const hasMonthlySummary = visibleCategories.length > 0 || visibleSummaryNote.length > 0;

  const runExport = async (format) => {
    setExporting(format);
    try {
      if (format === 'pdf') await exportNotePdf(exportData);
      else await exportNoteImage(previewRef.current, exportData);
    } catch (error) {
      Alert.alert('Export failed', error?.message || `Could not export the ${format.toUpperCase()}.`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>EXPORT NOTE</Text>
              <Text style={styles.title}>Choose a format</Text>
            </View>
            <Pressable style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close export">
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView style={styles.previewScroll} contentContainerStyle={styles.previewScrollContent}>
            <View ref={previewRef} collapsable={false} style={styles.preview}>
              <Text style={styles.previewTitle}>{getExportTitle(title, type)}</Text>
              <View style={styles.accent} />
              {rows ? (
                <>
                  <View style={[styles.tableRow, styles.tableHeader]}>
                    <Text style={[styles.headerCell, styles.dateCell]}>Date</Text>
                    <Text style={[styles.headerCell, styles.remarkCell]}>Remark</Text>
                    <Text style={[styles.headerCell, styles.amountCell]}>Amount (RM)</Text>
                  </View>
                  {visibleRows.map((row, index) => (
                    <View key={row.id || index} style={[styles.tableRow, index % 2 === 0 && styles.altRow]}>
                      <Text style={[styles.cell, styles.dateCell]}>{row.date}</Text>
                      <Text style={[styles.cell, styles.remarkCell]}>{row.remark}</Text>
                      <Text style={[styles.cell, styles.amountCell]}>{row.amount || '0.00'}</Text>
                    </View>
                  ))}
                  <Text style={styles.total}>Total  RM {formatExportAmount(total)}</Text>
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
              { format: 'pdf', icon: 'document-text-outline', label: 'Export PDF' },
              { format: 'image', icon: 'image-outline', label: 'Export image' },
            ].map((item) => (
              <Pressable key={item.format} disabled={!!exporting} style={({ pressed }) => [styles.action, pressed && styles.pressed, exporting && styles.disabled]} onPress={() => runExport(item.format)} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ disabled: !!exporting, busy: exporting === item.format }}>
                {exporting === item.format ? <ActivityIndicator color={colors.card} /> : <Ionicons name={item.icon} size={21} color={colors.card} />}
                <Text style={styles.actionText}>{exporting === item.format ? 'Preparing...' : item.label}</Text>
              </Pressable>
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
  previewScroll: { maxHeight: 430, borderRadius: radius.md, backgroundColor: colors.background },
  previewScrollContent: { padding: 12 },
  preview: { width: '100%', minHeight: 260, padding: 24, backgroundColor: '#ffffff', borderRadius: radius.md },
  previewTitle: { color: '#172033', fontSize: 24, lineHeight: 30, fontWeight: '800' },
  accent: { height: 3, backgroundColor: '#5b67f1', borderRadius: radius.full, marginTop: 14, marginBottom: 20 },
  previewBody: { color: '#30384c', fontSize: 15, lineHeight: 23 },
  tableRow: { flexDirection: 'row', minHeight: 42, borderBottomWidth: 1, borderBottomColor: '#dfe3ee', alignItems: 'center' },
  tableHeader: { backgroundColor: '#5b67f1', borderBottomWidth: 0 },
  altRow: { backgroundColor: '#f6f7fb' },
  headerCell: { color: '#ffffff', fontSize: 11, fontWeight: '800', padding: 8 },
  cell: { color: '#30384c', fontSize: 12, padding: 8 },
  dateCell: { width: 64 }, remarkCell: { flex: 1 }, amountCell: { width: 92, textAlign: 'right' },
  total: { color: '#4854dc', textAlign: 'right', fontSize: 17, fontWeight: '800', marginTop: 18 },
  monthlySummary: { marginTop: 28, paddingTop: 20, borderTopWidth: 2, borderTopColor: '#dfe3ee' },
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
  actions: { flexDirection: 'row', gap: 12 },
  action: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.md, backgroundColor: colors.primary },
  actionText: { color: colors.card, fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.55 },
});

export default NoteExportModal;
