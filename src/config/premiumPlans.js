export const PREMIUM_PLANS = [
  {
    id: 'plus',
    name: 'LockNote Plus',
    price: 'RM 4.90',
    period: 'per month',
    description: 'Keep your notes available across your devices and work with others.',
    badge: 'Most popular',
    features: [
      '100 MB cloud note storage',
      'Manual cloud sync',
      'Use notes across devices',
      'Share and edit notes together',
      'Automatic background sync (planned)',
    ],
  },
  {
    id: 'pro',
    name: 'LockNote Pro',
    price: 'RM 9.99',
    period: 'per month',
    description: 'Everything in LockNote Plus, plus richer ways to personalize your notes.',
    features: [
      'Everything in LockNote Plus',
      '2 GB cloud attachment storage',
      'Image attachments (planned)',
      'Custom note backgrounds (planned)',
    ],
  },
];

export const FREE_FEATURES = [
  'Notes, checklists, expenses and reminders',
  'Account login and cloud recovery access',
  'Folders, search, pinning and note colors',
  'Archive, Trash and local password locks',
  'PDF, image and local backup import or export',
];

export const EXPIRED_PLAN_BEHAVIOR = [
  'Local notes stay available and editable',
  'Cloud sync, uploads and collaboration pause',
  'Existing cloud data stays read-only and downloadable',
  'Resubscribing resumes cloud features',
];
