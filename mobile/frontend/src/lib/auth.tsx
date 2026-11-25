import { useQueryClient } from "@tanstack/react-query";
import {
  GoogleSignin,
  isSuccessResponse,
} from "@react-native-google-signin/google-signin";
import * as SecureStore from "expo-secure-store";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { Platform } from "react-native";

import { ApiError, command, configureApi, request } from "@/lib/api";
import {
  ConfigurationError,
  DEV_REFRESH_TOKEN,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_WEB_CLIENT_ID,
} from "@/lib/config";
import { authResponseSchema, type AuthResponse, type User } from "@/lib/schemas";

const REFRESH_TOKEN_KEY = "festiveos.refresh-token";

// iOS cannot configure Google Sign-In without its own client ID, and the module throws if asked
// to. Configure only when the IDs exist; signing in without them shows a clear message instead.
const googleConfigured = Boolean(
  GOOGLE_WEB_CLIENT_ID && (Platform.OS !== "ios" || GOOGLE_IOS_CLIENT_ID),
);
if (googleConfigured) {
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
  });
}

type AuthState = {
  status: "loading" | "offline" | "signedOut" | "signedIn";
  user: User | null;
  /** Re-attempts restoring the saved session after a network failure. */
  retry: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Permanently deletes the account on the server, then signs out locally. */
  deleteAccount: () => Promise<void>;
  /** Replaces the signed-in user, e.g. after they change their own profile. */
  updateUser: (user: User) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const value = use(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}

export function useCurrentUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error("useCurrentUser requires a signed-in user");
  return user;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthState["status"]>("loading");
  const [user, setUser] = useState<User | null>(null);
  const accessToken = useRef<string | null>(null);
  const inFlightRefresh = useRef<Promise<boolean> | null>(null);
  const lastFailureWasNetwork = useRef(false);

  const clearSession = useCallback(async () => {
    accessToken.current = null;
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    queryClient.clear();
    setUser(null);
    setStatus("signedOut");
  }, [queryClient]);

  const applySession = useCallback(async (session: AuthResponse) => {
    accessToken.current = session.access_token;
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, session.refresh_token);
    setUser(session.user);
    setStatus("signedIn");
  }, []);

  // Refresh tokens rotate, so concurrent 401s must share one refresh call.
  const refresh = useCallback((): Promise<boolean> => {
    inFlightRefresh.current ??= (async () => {
      lastFailureWasNetwork.current = false;
      try {
        const token = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
        if (!token) {
          await clearSession();
          return false;
        }
        const session = await request("/auth/refresh", {
          method: "POST",
          body: { refresh_token: token },
          schema: authResponseSchema,
          authenticated: false,
        });
        await applySession(session);
        return true;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) await clearSession();
        lastFailureWasNetwork.current = error instanceof ApiError && error.status === 0;
        return false;
      } finally {
        inFlightRefresh.current = null;
      }
    })();
    return inFlightRefresh.current;
  }, [applySession, clearSession]);

  useEffect(() => {
    configureApi({ getAccessToken: () => accessToken.current, refresh });
  }, [refresh]);

  // A network failure keeps the stored token and shows a retry screen instead of
  // silently signing the user out.
  const restore = useCallback(async () => {
    // Development builds can open signed in as the seeded demo user, without Google.
    if (DEV_REFRESH_TOKEN && !(await SecureStore.getItemAsync(REFRESH_TOKEN_KEY))) {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, DEV_REFRESH_TOKEN);
    }
    const restored = await refresh();
    if (!restored) setStatus(lastFailureWasNetwork.current ? "offline" : "signedOut");
  }, [refresh]);

  const retry = useCallback(async () => {
    setStatus("loading");
    await restore();
  }, [restore]);

  useEffect(() => {
    void restore();
  }, [restore]);

  const signInWithGoogle = useCallback(async () => {
    if (!googleConfigured) {
      throw new ConfigurationError(
        "Google sign-in is not set up: set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID and " +
          "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID. See frontend/README.md.",
      );
    }
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return;

    const idToken = response.data.idToken;
    if (!idToken) throw new Error("Google did not return an ID token. Check the web client ID.");

    const session = await request("/auth/google", {
      method: "POST",
      body: { id_token: idToken },
      schema: authResponseSchema,
      authenticated: false,
    });
    await applySession(session);
  }, [applySession]);

  const signOut = useCallback(async () => {
    const token = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    if (token) {
      await command("/auth/logout", {
        method: "POST",
        body: { refresh_token: token },
        authenticated: false,
      }).catch(() => undefined);
    }
    await GoogleSignin.signOut().catch(() => undefined);
    await clearSession();
  }, [clearSession]);

  const deleteAccount = useCallback(async () => {
    await command("/users/me", { method: "DELETE" }); // throws (e.g. 409) if it can't be done
    await GoogleSignin.signOut().catch(() => undefined);
    await clearSession();
  }, [clearSession]);

  const value = useMemo(
    () => ({ status, user, retry, signInWithGoogle, signOut, deleteAccount, updateUser: setUser }),
    [status, user, retry, signInWithGoogle, signOut, deleteAccount],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
