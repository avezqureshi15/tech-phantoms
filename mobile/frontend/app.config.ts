import type { ConfigContext, ExpoConfig } from "expo/config";

const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "";
const iosUrlScheme = `com.googleusercontent.apps.${
  iosClientId.replace(".apps.googleusercontent.com", "") || "unset"
}`;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "FestiveOS",
  slug: "festiveos",
  scheme: "festiveos",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  ios: {
    bundleIdentifier: "com.festiveos.app",
    supportsTablet: true,
  },
  android: {
    package: "com.festiveos.app",
    adaptiveIcon: {
      backgroundColor: "#5E1626",
      foregroundImage: "./assets/android-icon-foreground.png",
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#5E1626",
        image: "./assets/splash-icon.png",
        imageWidth: 200,
      },
    ],
    "expo-secure-store",
    [
      "expo-image-picker",
      {
        cameraPermission: "FestiveOS uses the camera to photograph a receipt so it can fill in an expense. The photo is not kept.",
        photosPermission: "FestiveOS reads the receipt photo you choose to fill in an expense. The photo is not kept.",
      },
    ],
    "expo-document-picker",
    [
      "expo-calendar",
      {
        // The app only ever adds events (never reads the calendar), so it asks for write-only access.
        writeOnlyAccess: true,
        writeOnlyCalendarPermission:
          "FestiveOS adds festivals and events to your calendar only when you tap Add. It never reads your calendar.",
      },
    ],
    "expo-font",
    "@react-native-community/datetimepicker",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "FestiveOS uses your location once, to show the panchang, prayer times and festival dates for where you are. It is not stored.",
      },
    ],
    ["@react-native-google-signin/google-signin", { iosUrlScheme }],
    [
      "expo-audio",
      {
        microphonePermission:
          "FestiveOS records a short clip only while you talk to Utsav, turns it into text and does not keep it.",
      },
    ],
  ],
});
