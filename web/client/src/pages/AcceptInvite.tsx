import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/auth/AuthProvider";

interface InvitePreview {
  email: string;
  tenantName: string;
  role: string;
  invitedBy: string;
  requiresPassword: boolean;
  existingAccount: boolean;
}

const fieldClass =
  "w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-brand-lighter focus-visible:ring-4 focus-visible:ring-brand/10";

export default function AcceptInvite() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<InvitePreview>(`/api/auth/invite/${encodeURIComponent(token)}`)
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch((err) => {
        if (!cancelled) setPreviewError(err instanceof Error ? err.message : "This invitation is not valid");
      });
    return () => { cancelled = true; };
  }, [token]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/auth/accept-invite", {
        method: "POST",
        body: JSON.stringify({ token, name, password }),
      });
      await refresh();
      navigate("/select-workspace", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept the invitation");
    } finally {
      setBusy(false);
    }
  }

  if (previewError) {
    return (
      <div className="brand-glow flex min-h-svh items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 text-center shadow-sm">
          <h1 className="font-heading text-xl font-medium tracking-tight text-ink">Invitation unavailable</h1>
          <p className="mt-2 text-sm text-tertiary">{previewError}</p>
          <Link to="/sign-in" className="mt-5 inline-block text-sm font-medium text-primary hover:underline">Go to sign in</Link>
        </div>
      </div>
    );
  }

  if (!preview) {
    return <div className="brand-glow flex min-h-svh items-center justify-center bg-background text-sm text-tertiary">Checking invitation…</div>;
  }

  return (
    <div className="brand-glow flex min-h-svh items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground shadow-sm">D</span>
          <div>
            <h1 className="font-heading text-xl font-medium tracking-tight text-ink">Join {preview.tenantName}</h1>
            <p className="text-xs capitalize text-tertiary">Invited by {preview.invitedBy} as {preview.role.replaceAll("_", " ").toLowerCase()}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-7 shadow-sm">
          <p className="text-sm text-tertiary">{preview.email}</p>
          <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
            {!preview.existingAccount && (
              <div>
                <label htmlFor="invite-name" className="mb-1.5 block text-[13px] font-medium text-ink">Your name</label>
                <input id="invite-name" required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} />
              </div>
            )}
            <div>
              <label htmlFor="invite-password" className="mb-1.5 block text-[13px] font-medium text-ink">
                {preview.existingAccount ? "Your existing password" : "Create a password"}
              </label>
              <input
                id="invite-password"
                type="password"
                autoComplete={preview.existingAccount ? "current-password" : "new-password"}
                required={!preview.existingAccount}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={fieldClass}
              />
              <p className="mt-2 text-xs leading-relaxed text-tertiary">
                {preview.existingAccount
                  ? "An account already exists. Enter its password, or sign in first."
                  : "At least 12 characters. Common passwords and your email address are rejected."}
              </p>
            </div>
            {error && <p role="alert" className="rounded-xl border border-status-danger/25 bg-status-danger-bg px-3.5 py-2.5 text-sm text-status-danger">{error}</p>}
            <button type="submit" disabled={busy} className="mt-1 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-brand-dark disabled:opacity-50">
              {busy ? "Joining…" : "Accept invitation"}
            </button>
          </form>
        </div>
        <p className="mt-5 text-center text-xs text-tertiary">
          Already signed in? <Link to="/sign-in" className="font-medium text-primary hover:underline">Switch account</Link>
        </p>
      </div>
    </div>
  );
}
