import 'dotenv/config';

export default {
  expo: {
    name: "LockNote",
    slug: "LockNote",
    scheme: "locknote",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
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
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff",
      },
      edgeToEdgeEnabled: true,
    },
    web: {
      favicon: "./assets/favicon.png",
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
    ],
  },
};
