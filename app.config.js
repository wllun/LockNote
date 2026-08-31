import 'dotenv/config';

export default {
  expo: {
    name: "LockNote",
    slug: "LockNote",
    scheme: "locknote",
    version: "1.1.0",
    orientation: "portrait",
    icon: "./assets/locknote-icon-v2.png",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    },
    ios: {
      bundleIdentifier: "com.locknote.app",
      supportsTablet: true,
    },
    android: {
      package: "com.locknote.app",
      versionCode: 2,
      adaptiveIcon: {
        foregroundImage: "./assets/locknote-adaptive-foreground-v2.png",
        backgroundColor: "#4F46E5",
      },
      edgeToEdgeEnabled: true,
      permissions: ["SCHEDULE_EXACT_ALARM"],
    },
    web: {
      favicon: "./assets/locknote-favicon-v2.png",
    },
    extra: {
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
      eas: {
        projectId: "7d5a673d-6949-45ae-9f32-c6fd926b6af3",
      },
    },
    plugins: [
      "expo-sqlite",
      "@react-native-community/datetimepicker",
      [
        "expo-notifications",
        {
          color: "#4F46E5",
          defaultChannel: "reminders",
        },
      ],
      [
        "expo-media-library",
        {
          photosPermission: "Allow LockNote to access your photos.",
          savePhotosPermission: "Allow LockNote to save exported note images.",
          isAccessMediaLocationEnabled: false,
          granularPermissions: [],
        },
      ],
    ],
  },
};
