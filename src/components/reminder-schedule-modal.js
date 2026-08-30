import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getReminderScheduleError, normalizeReminder } from '../utils/reminder-note.mjs';
import { radius, shadow, useTheme } from '../theme';
import AppDialogModal from './AppDialogModal';
import ReminderDateTimePicker from './reminder-date-time-picker';

const REPEATS = [
  { id: 'none', label: 'Does not repeat' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
];

const ReminderScheduleModal = ({ visible, reminder, onClose, onSave, saving = false }) => {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [date, setDate] = useState(new Date());
  const [repeat, setRepeat] = useState('none');
  const [picker, setPicker] = useState(null);
  const [error, setError] = useState('');
  const [showPastTimePrompt, setShowPastTimePrompt] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const normalized = normalizeReminder(reminder);
    setDate(new Date(normalized.scheduledAt));
    setRepeat(normalized.repeat);
    setPicker(null);
    setError('');
    setShowPastTimePrompt(false);
  }, [visible, reminder]);

  const chooseDay = (offset) => {
    const next = new Date();
    next.setDate(next.getDate() + offset);
    next.setHours(date.getHours(), date.getMinutes(), 0, 0);
    setDate(next);
    setError('');
  };

  const save = () => {
    const nextReminder = {
      ...normalizeReminder(reminder),
      enabled: true,
      scheduledAt: date.toISOString(),
      repeat,
    };
    const validationError = getReminderScheduleError(nextReminder);
    if (validationError) {
      setError(validationError);
      setShowPastTimePrompt(true);
      return;
    }
    onSave(nextReminder);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
        <View style={[styles.sheet, { paddingBottom: Math.max(20, insets.bottom + 12) }]} accessibilityViewIsModal>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>REMINDER</Text>
              <Text style={styles.title}>Choose date and time</Text>
            </View>
            <Pressable style={({ pressed }) => [styles.close, pressed && styles.pressed]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close reminder settings">
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Quick date</Text>
            <View style={styles.chips}>
              <Pressable style={({ pressed }) => [styles.chip, pressed && styles.pressed]} onPress={() => chooseDay(0)} accessibilityRole="button"><Text style={styles.chipText}>Today</Text></Pressable>
              <Pressable style={({ pressed }) => [styles.chip, pressed && styles.pressed]} onPress={() => chooseDay(1)} accessibilityRole="button"><Text style={styles.chipText}>Tomorrow</Text></Pressable>
            </View>

            <View style={styles.fields}>
              <Pressable style={({ pressed }) => [styles.field, pressed && styles.pressed]} onPress={() => setPicker(picker === 'date' ? null : 'date')} accessibilityRole="button" accessibilityLabel="Change reminder date">
                <View style={styles.fieldIcon}><Ionicons name="calendar-outline" size={20} color={colors.primary} /></View>
                <View style={styles.fieldText}><Text style={styles.fieldLabel}>Date</Text><Text style={styles.fieldValue}>{date.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</Text></View>
                <Ionicons name="chevron-down" size={18} color={colors.textTertiary} />
              </Pressable>
              {picker === 'date' && <View style={styles.picker}><ReminderDateTimePicker mode="date" value={date} onChange={(next) => { setDate(next); setError(''); if (Platform.OS !== 'ios') setPicker(null); }} /></View>}

              <Pressable style={({ pressed }) => [styles.field, pressed && styles.pressed]} onPress={() => setPicker(picker === 'time' ? null : 'time')} accessibilityRole="button" accessibilityLabel="Change reminder time">
                <View style={styles.fieldIcon}><Ionicons name="time-outline" size={20} color={colors.primary} /></View>
                <View style={styles.fieldText}><Text style={styles.fieldLabel}>Time</Text><Text style={styles.fieldValue}>{date.toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' })}</Text></View>
                <Ionicons name="chevron-down" size={18} color={colors.textTertiary} />
              </Pressable>
              {picker === 'time' && <View style={styles.picker}><ReminderDateTimePicker mode="time" value={date} onChange={(next) => { setDate(next); setError(''); if (Platform.OS !== 'ios') setPicker(null); }} /></View>}
            </View>

            <Text style={styles.label}>Repeat</Text>
            <View style={styles.repeatList}>
              {REPEATS.map((item) => (
                <Pressable key={item.id} style={({ pressed }) => [styles.repeatRow, repeat === item.id && styles.repeatRowSelected, pressed && styles.pressed]} onPress={() => setRepeat(item.id)} accessibilityRole="radio" accessibilityState={{ checked: repeat === item.id }}>
                  <Text style={[styles.repeatText, repeat === item.id && styles.repeatTextSelected]}>{item.label}</Text>
                  <Ionicons name={repeat === item.id ? 'radio-button-on' : 'radio-button-off'} size={22} color={repeat === item.id ? colors.primary : colors.textTertiary} />
                </Pressable>
              ))}
            </View>
            {!!error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
          </ScrollView>

          <Pressable disabled={saving} style={({ pressed }) => [styles.save, pressed && styles.pressed, saving && styles.saveDisabled]} onPress={save} accessibilityRole="button" accessibilityLabel="Set reminder" accessibilityState={{ disabled: saving, busy: saving }}>
            {saving ? <ActivityIndicator color={colors.card} /> : <Ionicons name="notifications-outline" size={20} color={colors.card} />}
            <Text style={styles.saveText}>{saving ? 'Scheduling...' : 'Set reminder'}</Text>
          </Pressable>
        </View>
        <AppDialogModal
          contained
          visible={showPastTimePrompt}
          title="Reminder time has passed"
          message={error}
          variant="warning"
          iconName="time-outline"
          actions={[{ label: 'OK', onPress: () => setShowPastTimePrompt(false) }]}
          onRequestClose={() => setShowPastTimePrompt(false)}
          testID="reminder-past-time-dialog"
        />
      </View>
    </Modal>
  );
};

const makeStyles = (colors) => StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.backdropStrong },
  sheet: { maxHeight: '92%', padding: 20, gap: 16, backgroundColor: colors.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, ...shadow.card },
  handle: { width: 42, height: 4, borderRadius: radius.full, backgroundColor: colors.border, alignSelf: 'center', marginTop: -6 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  title: { color: colors.text, fontSize: 21, fontWeight: '800', marginTop: 2 },
  close: { width: 48, height: 48, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.inputBg },
  pressed: { opacity: 0.7 },
  label: { color: colors.textSecondary, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 10, marginBottom: 9 },
  chips: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 18, borderRadius: radius.full, backgroundColor: colors.primarySoft },
  chipText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  fields: { gap: 8 },
  field: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.inputBg },
  fieldIcon: { width: 42, height: 42, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  fieldText: { flex: 1 }, fieldLabel: { color: colors.textSecondary, fontSize: 12 }, fieldValue: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 2 },
  picker: { alignItems: 'center', padding: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  repeatList: { gap: 8 },
  repeatRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  repeatRowSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  repeatText: { color: colors.text, fontSize: 15, fontWeight: '600' }, repeatTextSelected: { color: colors.primary },
  error: { color: colors.danger, fontSize: 13, marginTop: 10 },
  save: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.md, backgroundColor: colors.primary },
  saveText: { color: colors.card, fontSize: 16, fontWeight: '800' },
  saveDisabled: { opacity: 0.58 },
});

export default ReminderScheduleModal;
