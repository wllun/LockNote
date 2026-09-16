export const PREMIUM_PLANS = [
  {
    id: 'plus',
    entitlementId: 'plus',
    packageId: 'plus_monthly',
    name: 'LockNote Plus',
    price: 'RM 4.90',
    period: 'per month',
    description: 'Export your notes and work with others.',
    badge: 'Most popular',
    features: [
      '75 MB cloud storage (about 1,000 long notes)',
      'PDF and image export',
      'Share and edit notes together',
      'Automatic background sync (planned)',
    ],
  },
  {
    id: 'pro',
    entitlementId: 'pro',
    packageId: 'pro_monthly',
    name: 'LockNote Pro',
    price: 'RM 9.99',
    period: 'per month',
    description: 'Everything in LockNote Plus, plus richer notes and organization.',
    features: [
      'Everything in LockNote Plus',
      '750 MB cloud storage for notes and images',
      'Image attachments',
      'Custom note backgrounds',
      'Nested folders',
    ],
  },
];

export const FREE_FEATURES = [
  'Notes, checklists, expenses and reminders',
  '25 MB cloud storage and manual sync',
  'Use notes across devices',
  'Folders, search, pinning and note colors',
  'Archive, Trash and local password locks',
  'Portable backup import and export',
];

export const EXPIRED_PLAN_BEHAVIOR = [
  'Local notes stay available and editable',
  'Cloud sync, uploads and collaboration pause',
  'Existing cloud data stays read-only and downloadable',
  'Resubscribing resumes cloud features',
];
