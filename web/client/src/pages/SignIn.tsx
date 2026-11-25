import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";

interface LocationState {
  from?: string;
}

const fieldClass =
  "w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-brand-lighter focus-visible:ring-4 focus-visible:ring-brand/10";

export default function SignIn() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LocationState | null)?.from ?? "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await signIn(email.trim(), password);
      if (!result.activeTenant) {
        navigate("/select-workspace", { replace: true });
        return;
      }
      navigate(from || `/queries?tenantSlug=${result.activeTenant.slug}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="brand-glow flex min-h-svh items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground shadow-sm">D</span>
          <span className="font-heading text-xl font-medium tracking-tight text-ink">Diya</span>
        </Link>
        <div className="rounded-2xl border border-border bg-card p-7 shadow-sm">
          <h1 className="font-heading text-2xl font-medium tracking-tight text-ink">Sign in</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-tertiary">Operations console access is invitation-only.</p>
          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            <div>
              <label htmlFor="sign-in-email" className="mb-1.5 block text-[13px] font-medium text-ink">Email</label>
              <input
                id="sign-in-email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={fieldClass}
              />
            </div>
            <div>
              <label htmlFor="sign-in-password" className="mb-1.5 block text-[13px] font-medium text-ink">Password</label>
              <input
                id="sign-in-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={fieldClass}
              />
            </div>
            {error && <p role="alert" className="rounded-xl border border-status-danger/25 bg-status-danger-bg px-3.5 py-2.5 text-sm text-status-danger">{error}</p>}
            <button type="submit" disabled={busy} className="mt-1 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-brand-dark disabled:opacity-50">
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
        <p className="mt-5 text-center text-xs text-tertiary">No account? Ask your tenant admin for an invitation link.</p>
      </div>
    </div>
  );
}
