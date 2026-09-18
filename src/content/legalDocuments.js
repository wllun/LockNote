export const LEGAL_LAST_UPDATED = '19 September 2026';

export const LEGAL_DOCUMENTS = {
  privacy: {
    title: 'Privacy Policy',
    summary:
      'LockNote keeps your notes on your device by default. Account, sync, sharing, attachment sync, and subscription services use trusted service providers only when you use those features.',
    sections: [
      {
        heading: '1. What this policy covers',
        paragraphs: [
          'This Privacy Policy explains how LockNote handles information when you use the mobile or web app. LockNote is designed as a local-first notes app, so local storage remains the primary copy of your private notes.',
        ],
      },
      {
        heading: '2. Information stored on your device',
        paragraphs: [
          'Folders, notes, checklists, expense records, reminders, settings, local images, and note attachments are stored on your device. A locked note is protected by a password check, but its content is not encrypted.',
          'Reminder schedules use your device notification system. Exported files and backup files are saved only when you choose to create them. Backup files can contain readable note content and password hashes, so keep them private.',
        ],
      },
      {
        heading: '3. Account and cloud information',
        paragraphs: [
          'If you create an account, Supabase processes your email address, account identifier, authentication information, and the technical information needed to provide account services.',
          'Private folders and notes are sent to Supabase when you use Sync Notes or explicitly enable Automatic Sync for your account on this device. Automatic Sync is off by default and can be turned off in Profile. Notes you share, collaborator email addresses, access roles, edit history, and collaboration status are stored in Supabase so invited people can view or edit them. Signed-in image attachment synchronization also stores optimized images and attachment metadata in Supabase.',
          'LockNote does not provide end-to-end encryption for cloud note content. Do not use LockNote for information that requires encrypted or regulated storage.',
        ],
      },
      {
        heading: '4. Subscriptions and payments',
        paragraphs: [
          'Apple App Store or Google Play processes your payment. RevenueCat helps LockNote recognize your subscription status and may process a store customer identifier, product, entitlement, purchase status, and renewal information. LockNote does not receive your full payment-card details.',
        ],
      },
      {
        heading: '5. How information is used',
        bullets: [
          'Provide accounts, manual and opt-in automatic sync, shared-note collaboration, attachment sync, reminders, exports, and subscriptions.',
          'Keep shared changes consistent and enforce viewer or editor access.',
          'Protect the service, diagnose failures, and meet legal obligations.',
        ],
      },
      {
        heading: '6. Service providers and sharing',
        paragraphs: [
          'LockNote uses Supabase for account and cloud features, RevenueCat for subscription status, and Apple or Google for store payments. These providers process information under their own terms and privacy policies.',
          'LockNote does not sell your note content. Content is shared with another person only when you invite that person to a note or when disclosure is required by law.',
        ],
      },
      {
        heading: '7. Retention and deletion',
        paragraphs: [
          'Local data remains on your device until you delete it, clear the app data, or uninstall the app. Notes moved to Trash are permanently deleted from local storage after 30 days unless restored earlier.',
          'Uninstalling LockNote does not automatically delete an account or cloud data. To request account and associated cloud-data deletion, use the support contact on LockNote\'s app-store listing. Some limited records may be retained when required for security, dispute resolution, or legal compliance.',
        ],
      },
      {
        heading: '8. Your choices',
        bullets: [
          'Use LockNote without an account for local-only notes.',
          'Choose whether to run private-note sync, enable or disable Automatic Sync, or share a note.',
          'Change or remove a collaborator\'s access to a note you own.',
          'Control photo and notification permissions in your device settings.',
          'Export your notes or a portable backup before deleting local data.',
        ],
      },
      {
        heading: '9. Security',
        paragraphs: [
          'LockNote uses access controls and service-provider safeguards for cloud features, but no system is completely secure. Your LockNote password is separate from your account password. Password locking is an access gate and must not be treated as encryption.',
        ],
      },
      {
        heading: '10. Changes and contact',
        paragraphs: [
          'This policy may change as LockNote develops. The updated date will change when material revisions are published. For privacy questions or deletion requests, use the support contact shown on LockNote\'s app-store listing.',
        ],
      },
    ],
  },
  terms: {
    title: 'Terms of Service',
    summary:
      'These terms explain the rules for using LockNote, including local data, cloud features, collaboration, and optional subscriptions.',
    sections: [
      {
        heading: '1. Acceptance',
        paragraphs: [
          'By using LockNote, you agree to these Terms of Service. If you do not agree, do not use the app. These terms are between you and the publisher of LockNote (referred to as “LockNote”, “we”, or “us”).',
        ],
      },
      {
        heading: '2. Your account',
        paragraphs: [
          'You are responsible for accurate account information, protecting your sign-in details, and activity performed through your account. Tell us through the support contact on the app-store listing if you believe your account has been misused.',
        ],
      },
      {
        heading: '3. Your content and local data',
        paragraphs: [
          'You keep ownership of the notes, images, and other content you create. You give LockNote and its service providers only the limited permission needed to store, synchronize, display, export, and share content when you choose those features.',
          'LockNote is local-first. You are responsible for keeping suitable backups and protecting exported files. Removing the app, clearing app data, losing a device, or deleting local content may cause permanent loss when no usable backup or cloud copy exists.',
        ],
      },
      {
        heading: '4. Cloud and collaboration features',
        paragraphs: [
          'Cloud features require an account and internet access. When you share a note, recipients may view or edit it according to the access you assign. You are responsible for choosing recipients and ensuring you have the right to share the content.',
          'Cloud services may be delayed, unavailable, or changed. LockNote does not promise uninterrupted synchronization, and you should review important changes and keep independent copies of important information.',
        ],
      },
      {
        heading: '5. Password locking and security',
        paragraphs: [
          'The LockNote password is an access gate for locked notes. It is not encryption and does not make note content suitable for secrets, regulated records, or other highly sensitive information. You are responsible for choosing a strong password and controlling access to your device.',
        ],
      },
      {
        heading: '6. Subscriptions',
        paragraphs: [
          'Paid plans are billed by Apple App Store or Google Play at the price shown before purchase. Subscriptions renew automatically unless cancelled through the applicable store. The store controls billing, upgrades, credits, cancellations, and refunds under its rules.',
          'If a paid plan ends, LockNote should not delete your notes merely because the subscription expired. Paid cloud features may pause or become read-only, while local access remains available subject to the app\'s normal device-storage limits.',
        ],
      },
      {
        heading: '7. Acceptable use',
        bullets: [
          'Do not use LockNote to break the law or violate another person\'s rights.',
          'Do not upload malicious content, interfere with the service, or attempt unauthorized access.',
          'Do not share content unless you have permission to do so.',
        ],
      },
      {
        heading: '8. Updates and availability',
        paragraphs: [
          'We may update, add, remove, suspend, or discontinue features to maintain security, comply with law, or improve LockNote. A required app update may be necessary to continue using online services.',
        ],
      },
      {
        heading: '9. Disclaimers and liability',
        paragraphs: [
          'LockNote is provided on an “as is” and “as available” basis to the extent permitted by law. We do not guarantee that the app will always be error-free or that data will never be lost. Nothing in these terms excludes rights or liability that cannot legally be excluded.',
          'To the extent permitted by law, LockNote is not responsible for indirect or consequential loss arising from use of the app, unavailable services, unauthorized sharing, or failure to maintain a backup.',
        ],
      },
      {
        heading: '10. Changes and contact',
        paragraphs: [
          'We may update these terms and will change the updated date when material revisions are published. Continued use after an update means you accept the revised terms where permitted by law. For legal questions, use the support contact shown on LockNote\'s app-store listing.',
        ],
      },
    ],
  },
};

