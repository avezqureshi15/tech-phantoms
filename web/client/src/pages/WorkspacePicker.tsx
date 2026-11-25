import { useState } from "react";
import { Building2, LogOut, ShieldCheck } from "lucide-react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { AuthSplash } from "@/auth/guards";

export default function WorkspacePicker() {
  const { status, memberships, activeTenant, isSuperAdmin, switchTenant, signOut, user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (status === "loading") return <AuthSplash />;
  if (status === "unauthenticated") return <Navigate to="/sign-in" replace />;

  async function choose(slug: string) {
    setBusy(slug);
    setError(null);
    try {
      await switchTenant(slug);
      navigate(`/queries?tenantSlug=${encodeURIComponent(slug)}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open that workspace");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="brand-glow flex min-h-svh items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-7 flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground shadow-sm">D</span>
          <span className="font-heading text-xl font-medium tracking-tight text-ink">Diya</span>
        </div>
        <div className="mb-6">
          <h1 className="font-heading text-2xl font-medium tracking-tight text-ink">Choose a workspace</h1>
          <p className="mt-1.5 text-sm text-tertiary">Signed in as {user?.email}.</p>
        </div>
        {error && <p role="alert" className="mb-4 rounded-xl border border-status-danger/25 bg-status-danger-bg px-3.5 py-2.5 text-sm text-status-danger">{error}</p>}
        <div className="flex flex-col gap-2.5">
          {memberships.map((membership) => (
            <button
              key={membership.tenantId}
              type="button"
              disabled={busy !== null}
              onClick={() => void choose(membership.tenantSlug)}
              className={`group flex items-center justify-between rounded-2xl border bg-card px-4 py-3.5 text-left shadow-sm transition-all hover:border-brand-lighter hover:bg-brand-light/60 disabled:opacity-60 ${activeTenant?.id === membership.tenantId ? "border-brand-lighter" : "border-border"}`}
            >
              <span className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-mint text-primary"><Building2 className="size-4" /></span>
                <span>
                  <span className="block font-heading text-sm font-medium text-ink">{membership.tenantName}</span>
                  <span className="block text-xs capitalize text-tertiary">{membership.role.replaceAll("_", " ").toLowerCase()}</span>
                </span>
              </span>
              <span className="text-xs font-medium text-primary">{busy === membership.tenantSlug ? "Opening…" : "Open"}</span>
            </button>
          ))}
          {memberships.length === 0 && (
            <p className="rounded-2xl border border-border bg-card px-4 py-7 text-center text-sm text-tertiary shadow-sm">
              You are not a member of any workspace yet.
            </p>
          )}
        </div>
        <div className="mt-7 flex items-center justify-between text-sm">
          {isSuperAdmin ? (
            <Link to="/platform/tenants" className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
              <ShieldCheck className="size-4" /> Platform administration
            </Link>
          ) : <span />}
          <button type="button" onClick={() => void signOut()} className="inline-flex items-center gap-1.5 text-tertiary transition-colors hover:text-ink">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
