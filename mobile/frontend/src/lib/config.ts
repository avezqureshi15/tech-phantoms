import { Platform } from "react-native";

// Android emulators reach the host machine at 10.0.2.2, iOS simulators at localhost.
// Physical devices need EXPO_PUBLIC_API_URL set to the machine's LAN address.
const devHost = Platform.OS === "android" ? "http://10.0.2.2:8000" : "http://localhost:8000";

export const API_URL = `${process.env.EXPO_PUBLIC_API_URL ?? devHost}/api/v1`;
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "";

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

/** Development builds only: a refresh token minted by backend/scripts/seed_dev.py. */
export const DEV_REFRESH_TOKEN = __DEV__ ? (process.env.EXPO_PUBLIC_DEV_REFRESH_TOKEN ?? "") : "";
