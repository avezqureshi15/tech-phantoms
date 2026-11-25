import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export function AuthSplash() {
  return (
    <div className="brand-glow flex min-h-svh items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-sm text-tertiary">
        <span className="size-4 animate-spin rounded-full border-2 border-brand-lightest border-t-primary" />
        Loading Diya…
      </div>
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <AuthSplash />;
  if (status === "unauthenticated") {
    return <Navigate to="/sign-in" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  return <>{children}</>;
}

export function RequirePlatform({ children }: { children: ReactNode }) {
  const { status, isSuperAdmin } = useAuth();
  if (status === "loading") return <AuthSplash />;
  if (status === "unauthenticated") return <Navigate to="/sign-in" replace />;
  if (!isSuperAdmin) return <Navigate to="/select-workspace" replace />;
  return <>{children}</>;
}
