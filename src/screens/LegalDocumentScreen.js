import React, { useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LEGAL_DOCUMENTS, LEGAL_LAST_UPDATED } from '../content/legalDocuments';
import { radius, useTheme } from '../theme';

const LegalDocumentScreen = ({ route }) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const documentKey = route.name === 'TermsOfService' ? 'terms' : 'privacy';
  const document = LEGAL_DOCUMENTS[documentKey];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={[styles.content, width >= 760 && styles.contentWide]}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <Ionicons
              name={documentKey === 'privacy' ? 'shield-checkmark-outline' : 'document-text-outline'}
              size={24}
              color={colors.primary}
            />
          </View>
          <View style={styles.summaryCopy}>
            <Text selectable style={styles.updatedText}>
              Last updated {LEGAL_LAST_UPDATED}
            </Text>
            <Text selectable style={styles.summaryText}>{document.summary}</Text>
          </View>
        </View>

        <View style={styles.documentCard}>
          {document.sections.map((section, sectionIndex) => (
            <View
              key={section.heading}
              style={[
                styles.section,
                sectionIndex > 0 && styles.sectionWithDivider,
              ]}
            >
              <Text selectable accessibilityRole="header" style={styles.heading}>
                {section.heading}
              </Text>
              {section.paragraphs?.map((paragraph) => (
                <Text selectable key={paragraph} style={styles.paragraph}>
                  {paragraph}
                </Text>
              ))}
              {section.bullets?.map((item) => (
                <View key={item} style={styles.bulletRow}>
                  <View style={styles.bullet} />
                  <Text selectable style={styles.bulletText}>{item}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
};

const makeStyles = (colors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    gap: 16,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  contentWide: {
    paddingHorizontal: 24,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
  },
  summaryIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
  },
  summaryCopy: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  updatedText: {
    color: colors.primary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  summaryText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '600',
  },
  documentCard: {
    overflow: 'hidden',
    paddingHorizontal: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
  },
  section: {
    gap: 10,
    paddingVertical: 20,
  },
  sectionWithDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  heading: {
    color: colors.text,
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '800',
  },
  paragraph: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 24,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bullet: {
    width: 6,
    height: 6,
    marginTop: 9,
    flexShrink: 0,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  bulletText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 24,
  },
});

export default LegalDocumentScreen;

