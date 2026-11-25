import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";

export type TenantRole = "TENANT_ADMIN" | "OPERATOR";
export type PlatformRole = "NONE" | "SUPER_ADMIN";

export interface Membership {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  role: TenantRole;
}

export interface ActiveTenant {
  id: string;
  slug: string;
  name: string;
  role: TenantRole;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  platformRole: PlatformRole;
}

interface MeResponse {
  user: AuthUser;
  session: { viewAs: boolean };
  memberships: Membership[];
  activeTenant: ActiveTenant | null;
}

interface SignInResponse {
  ok: true;
  user: AuthUser;
  memberships: Membership[];
  activeTenant: ActiveTenant | null;
}

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  memberships: Membership[];
  activeTenant: ActiveTenant | null;
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ activeTenant: ActiveTenant | null }>;
  signOut: () => Promise<void>;
  switchTenant: (tenantSlug: string) => Promise<ActiveTenant>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [me, setMe] = useState<MeResponse | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<MeResponse>("/api/auth/me");
      setMe(data);
      setStatus("authenticated");
    } catch {
      setMe(null);
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onUnauthorized = () => {
      setMe(null);
      setStatus("unauthenticated");
      navigate("/sign-in", { replace: true });
    };
    window.addEventListener("diya:unauthorized", onUnauthorized);
    return () => window.removeEventListener("diya:unauthorized", onUnauthorized);
  }, [navigate]);

  const signIn = useCallback(async (email: string, password: string) => {
    const data = await apiFetch<SignInResponse>("/api/auth/sign-in", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setMe({ user: data.user, session: { viewAs: false }, memberships: data.memberships, activeTenant: data.activeTenant });
    setStatus("authenticated");
    return { activeTenant: data.activeTenant };
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiFetch("/api/auth/sign-out", { method: "POST" });
    } finally {
      setMe(null);
      setStatus("unauthenticated");
      navigate("/sign-in", { replace: true });
    }
  }, [navigate]);

  const switchTenant = useCallback(async (tenantSlug: string) => {
    const data = await apiFetch<{ activeTenant: ActiveTenant }>("/api/auth/switch-tenant", {
      method: "POST",
      body: JSON.stringify({ tenantSlug }),
    });
    setMe((current) => (current ? { ...current, activeTenant: data.activeTenant } : current));
    return data.activeTenant;
  }, []);

  const value: AuthContextValue = {
    status,
    user: me?.user ?? null,
    memberships: me?.memberships ?? [],
    activeTenant: me?.activeTenant ?? null,
    isSuperAdmin: me?.user.platformRole === "SUPER_ADMIN",
    isTenantAdmin: me?.activeTenant?.role === "TENANT_ADMIN",
    refresh,
    signIn,
    signOut,
    switchTenant,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
