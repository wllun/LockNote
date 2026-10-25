import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, useTheme } from '../theme';
import { createRecipeStep, parseRecipeNote, RECIPE_INGREDIENTS_MAX_CHARACTERS, RECIPE_MAX_STEPS, RECIPE_STEP_MAX_CHARACTERS } from '../utils/recipe-note.mjs';

// The screen owns serialized content/history; this view never writes repositories.
const RecipeNoteContent = ({ content, attachments, readOnly, editing, busy, canAddPhoto, onEdit, onDone, onChange, onAddPhoto, onChangePhoto, onRemovePhoto }) => {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [viewedPhotoId, setViewedPhotoId] = useState(null);
  const recipe = parseRecipeNote(content);
  const editable = editing && !readOnly;
  const photo = attachments[0];
  const update = (changes, group = 'recipe') => onChange({ ...recipe, ...changes }, group === 'recipe-action' ? null : group);
  const steps = recipe.steps;
  const move = (index, direction) => {
    const next = [...steps];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    update({ steps: next }, 'recipe-action');
  };
  const iconButton = (icon, label, onPress, disabled = false, danger = false) => (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled }} style={({ pressed }) => [styles.iconButton, disabled && styles.disabled, pressed && styles.pressed]}>
      <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.textSecondary} />
    </Pressable>
  );

  return (
    <>
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
      <View style={styles.toolbar}>
        <View style={styles.badge}><Ionicons name="restaurant-outline" size={16} color={colors.primary} /><Text style={styles.badgeText}>Recipe Note</Text></View>
        {!readOnly && <Pressable accessibilityRole="button" accessibilityLabel={editable ? 'Finish editing recipe' : 'Edit recipe'}
          onPress={() => { if (editable) { Keyboard.dismiss(); onDone(); } else onEdit(); }}
          style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
          <Ionicons name={editable ? 'checkmark' : 'create-outline'} size={18} color={colors.primary} />
          <Text style={styles.buttonText}>{editable ? 'Done' : 'Edit'}</Text>
        </Pressable>}
      </View>

      {photo ? <View style={styles.photoCard}>
        <Pressable accessibilityRole="button" accessibilityLabel="View recipe photo" accessibilityHint="Opens the full image"
          onPress={() => { Keyboard.dismiss(); setViewedPhotoId(photo.id); }}
          style={({ pressed }) => [styles.photoFrame, pressed && styles.pressed]}>
          <Image key={photo.id} source={{ uri: photo.local_uri || photo.data_uri }} accessibilityLabel="Recipe photo" resizeMode="contain"
            style={styles.photo} />
          <View pointerEvents="none" style={styles.expandBadge}>
            <Ionicons name="expand-outline" size={18} color={colors.text} />
          </View>
        </Pressable>
        {!readOnly && <View style={styles.photoActions}>
          {canAddPhoto && <Pressable disabled={busy} onPress={onChangePhoto} accessibilityRole="button" accessibilityLabel="Change recipe photo"
            accessibilityState={{ disabled: busy }} style={({ pressed }) => [styles.textButton, busy && styles.disabled, pressed && styles.pressed]}>
            <Ionicons name="image-outline" size={18} color={colors.primary} />
            <Text style={styles.buttonText}>Change photo</Text>
          </Pressable>}
          {editable && iconButton('trash-outline', 'Remove recipe photo', () => onRemovePhoto(photo), busy, true)}
        </View>}
      </View> : canAddPhoto && !readOnly ? <Pressable disabled={busy} onPress={onAddPhoto} accessibilityRole="button" accessibilityLabel="Add recipe photo"
        style={({ pressed }) => [styles.photoPlaceholder, busy && styles.disabled, pressed && styles.pressed]}>
        {busy ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="image-outline" size={28} color={colors.primary} />}
        <Text style={styles.buttonText}>{busy ? 'Adding photo…' : 'Add photo'}</Text>
        <Text style={styles.hint}>Up to 5 MB · compressed below 1 MB</Text>
      </Pressable> : null}
      {busy && photo && <ActivityIndicator color={colors.primary} accessibilityLabel="Updating recipe photo" />}

      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.heading}>Ingredients</Text>
        {editable ? <>
          <Text style={styles.hint}>One ingredient per line, including the amount.</Text>
          <TextInput multiline scrollEnabled={false} value={recipe.ingredients} onChangeText={(ingredients) => update({ ingredients }, 'recipe-ingredients')}
            maxLength={Math.max(RECIPE_INGREDIENTS_MAX_CHARACTERS, recipe.ingredients.length)} accessibilityLabel="Ingredients"
            placeholder={'2 eggs\n200 g flour\n100 ml milk'} placeholderTextColor={colors.textTertiary} style={[styles.input, styles.ingredientsInput]} />
        </> : <Text selectable style={styles.body}>{recipe.ingredients || 'No ingredients yet'}</Text>}
      </View>

      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.heading}>Preparation</Text>
        {steps.map((step, index) => <View key={step.id} style={styles.step}>
          <View style={styles.stepHeader}>
            <View style={styles.number}><Text style={styles.numberText}>{index + 1}</Text></View>
            <Text style={styles.stepLabel}>Step {index + 1}</Text>
            {editable && <View style={styles.stepActions}>
              {iconButton('arrow-up', `Move step ${index + 1} up`, () => move(index, -1), index === 0)}
              {iconButton('arrow-down', `Move step ${index + 1} down`, () => move(index, 1), index === steps.length - 1)}
              {iconButton('close', `Remove step ${index + 1}`, () => update({ steps: steps.filter((item) => item.id !== step.id) }, 'recipe-action'), false, true)}
            </View>}
          </View>
          {editable ? <TextInput multiline scrollEnabled={false} value={step.text} accessibilityLabel={`Step ${index + 1}`}
            maxLength={Math.max(RECIPE_STEP_MAX_CHARACTERS, step.text.length)} placeholder="Describe what to do…" placeholderTextColor={colors.textTertiary}
            onChangeText={(text) => update({ steps: steps.map((item) => item.id === step.id ? { ...item, text } : item) }, `recipe-step-${step.id}`)} style={styles.input} />
            : <Text selectable style={styles.body}>{step.text || 'No instruction yet'}</Text>}
        </View>)}
        {!steps.length && !editable && <Text style={styles.body}>No preparation steps yet</Text>}
        {editable && <Pressable disabled={steps.length >= RECIPE_MAX_STEPS} accessibilityRole="button" accessibilityLabel="Add preparation step"
          onPress={() => update({ steps: [...steps, createRecipeStep()] }, 'recipe-action')}
          style={({ pressed }) => [styles.addButton, steps.length >= RECIPE_MAX_STEPS && styles.disabled, pressed && styles.pressed]}>
          <Ionicons name="add" size={20} color={colors.primary} /><Text style={styles.buttonText}>Add step</Text>
        </Pressable>}
      </View>
    </ScrollView>
    <Modal visible={!!photo && viewedPhotoId === photo.id} animationType="none" transparent={false}
      onRequestClose={() => setViewedPhotoId(null)}>
      <View accessibilityViewIsModal onAccessibilityEscape={() => setViewedPhotoId(null)}
        style={[styles.viewer, {
          paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 12),
          paddingLeft: Math.max(insets.left, 12), paddingRight: Math.max(insets.right, 12),
        }]}>
        <View style={styles.viewerHeader}>
          <Text style={styles.heading}>Recipe photo</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close recipe photo" onPress={() => setViewedPhotoId(null)}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.viewerImageArea}>
          {!!photo && viewedPhotoId === photo.id && <Image key={photo.id} source={{ uri: photo.local_uri || photo.data_uri }}
            style={styles.viewerImage} resizeMode="contain" accessibilityLabel="Full recipe photo" />}
        </View>
      </View>
    </Modal>
    </>
  );
};

const makeStyles = (colors) => StyleSheet.create({
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16, gap: 20 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badgeText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  textButton: { minHeight: 48, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.sm },
  buttonText: { fontSize: 16, fontWeight: '600', color: colors.primary },
  photoCard: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.inputBg },
  photoFrame: { height: 220, width: '100%', alignItems: 'center', justifyContent: 'center' },
  photo: { width: '100%', height: '100%' },
  expandBadge: { position: 'absolute', right: 8, bottom: 8, padding: 8, borderRadius: radius.sm, backgroundColor: colors.card },
  viewer: { flex: 1, backgroundColor: colors.background },
  viewerHeader: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  viewerImageArea: { flex: 1, minHeight: 0 },
  viewerImage: { width: '100%', height: '100%' },
  photoActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 8 },
  photoPlaceholder: { minHeight: 144, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  section: { gap: 12 },
  heading: { fontSize: 20, fontWeight: '700', color: colors.text },
  hint: { fontSize: 13, lineHeight: 20, color: colors.textSecondary },
  body: { fontSize: 16, lineHeight: 25, color: colors.text },
  input: { minHeight: 96, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.inputBg, padding: 12, fontSize: 16, lineHeight: 25, color: colors.text, textAlignVertical: 'top' },
  ingredientsInput: { minHeight: 144 },
  step: { gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  number: { width: 32, height: 32, borderRadius: radius.full, backgroundColor: colors.primarySoft, justifyContent: 'center', alignItems: 'center' },
  numberText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  stepLabel: { color: colors.textSecondary, fontSize: 14, flex: 1 },
  stepActions: { flexDirection: 'row', gap: 8 },
  iconButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  addButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  disabled: { opacity: 0.38 },
  pressed: { opacity: 0.65 },
});

export default RecipeNoteContent;
