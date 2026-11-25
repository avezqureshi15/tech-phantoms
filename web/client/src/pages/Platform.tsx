import { useEffect, useState } from "react";
import { ArrowLeft, Building2, Copy, LogOut, ShieldCheck, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/auth/AuthProvider";

interface PlatformTenant {
  id: string;
  slug: string;
  name: string;
  brandTone: string;
  status: "ACTIVE" | "SUSPENDED";
  memberCount: number;
  queryCount: number;
}

interface PlatformUser {
  id: string;
  email: string;
  name: string;
  platformRole: "NONE" | "SUPER_ADMIN";
  status: "ACTIVE" | "SUSPENDED";
  lastLoginAt: string | null;
  memberships: Array<{ tenantId: string; tenantName: string; role: string; status: string }>;
}

const fieldClass =
  "w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-brand-lighter focus-visible:ring-4 focus-visible:ring-brand/10";

export default function Platform() {
  const { signOut, user } = useAuth();
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [tenantData, userData] = await Promise.all([
      apiFetch<{ tenants: PlatformTenant[] }>("/api/platform/tenants"),
      apiFetch<{ users: PlatformUser[] }>("/api/platform/users"),
    ]);
    setTenants(tenantData.tenants);
    setUsers(userData.users);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Could not load platform data"));
  }, []);

  async function createTenant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setInviteLink(null);
    try {
      const result = await apiFetch<{ inviteLink: string }>("/api/platform/tenants", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), slug: slug.trim(), adminEmail: adminEmail.trim() }),
      });
      setInviteLink(result.inviteLink);
      setNotice("Tenant created. Copy the first-admin invitation link and send it.");
      setName("");
      setSlug("");
      setAdminEmail("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the tenant");
    } finally {
      setBusy(false);
    }
  }

  async function toggleTenant(tenant: PlatformTenant) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/platform/tenants/${tenant.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: tenant.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the tenant");
    } finally {
      setBusy(false);
    }
  }

  async function inviteAdmin(tenant: PlatformTenant) {
    const email = window.prompt(`Invite an additional tenant admin for ${tenant.name}:`);
    if (!email) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<{ inviteLink: string }>(`/api/platform/tenants/${tenant.id}/invitations`, {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setInviteLink(result.inviteLink);
      setNotice(`Invitation created for ${email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not invite the admin");
    } finally {
      setBusy(false);
    }
  }

  async function toggleUser(platformUser: PlatformUser) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/platform/users/${platformUser.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: platformUser.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the user");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-svh bg-brand-light/40">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-sm">D</span>
          <div>
            <p className="flex items-center gap-1.5 font-heading text-sm font-medium text-ink"><ShieldCheck className="size-4 text-primary" /> Platform administration</p>
            <p className="text-xs text-tertiary">{user?.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/select-workspace" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-medium text-ink shadow-sm transition-colors hover:border-brand-lighter hover:bg-brand-light"><ArrowLeft className="size-4" />Workspaces</Link>
          <button type="button" onClick={() => void signOut()} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-medium text-ink shadow-sm transition-colors hover:border-brand-lighter hover:bg-brand-light"><LogOut className="size-4" />Sign out</button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-7 sm:px-6">
        {notice && <p role="status" className="rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-ink shadow-sm">{notice}</p>}
        {error && <p role="alert" className="rounded-xl border border-status-danger/25 bg-status-danger-bg px-3.5 py-2.5 text-sm text-status-danger">{error}</p>}
        {inviteLink && (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <p className="text-sm font-medium text-ink">Invitation link</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-border bg-brand-light/60 px-3 py-2 text-xs text-tertiary">{inviteLink}</code>
              <button type="button" onClick={() => { void navigator.clipboard.writeText(inviteLink); setNotice("Link copied."); }} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-xs font-medium text-ink transition-colors hover:border-brand-lighter hover:bg-brand-light"><Copy className="size-3.5" />Copy</button>
            </div>
          </div>
        )}

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h1 className="flex items-center gap-2 font-heading text-xl font-medium tracking-tight text-ink"><span className="flex size-8 items-center justify-center rounded-xl bg-mint text-primary"><Building2 className="size-4" /></span>Create a tenant</h1>
          <form onSubmit={createTenant} className="mt-4 grid gap-3 sm:grid-cols-2">
            <div><label htmlFor="tenant-name" className="mb-1.5 block text-xs font-medium text-tertiary">Name</label><input id="tenant-name" required value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} /></div>
            <div><label htmlFor="tenant-slug" className="mb-1.5 block text-xs font-medium text-tertiary">Slug</label><input id="tenant-slug" required value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="festive-mart" className={fieldClass} /></div>
            <div className="sm:col-span-2"><label htmlFor="tenant-admin-email" className="mb-1.5 block text-xs font-medium text-tertiary">First tenant admin email</label><input id="tenant-admin-email" type="email" required value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} className={fieldClass} /></div>
            <div className="sm:col-span-2"><button type="submit" disabled={busy} className="rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-brand-dark disabled:opacity-50">Create tenant</button></div>
          </form>
        </section>

        <section>
          <h2 className="mb-3 font-heading text-xl font-medium tracking-tight text-ink">Tenants</h2>
          <div className="flex flex-col gap-2">
            {tenants.map((tenant) => (
              <div key={tenant.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-3.5 shadow-sm">
                <div>
                  <p className="text-sm font-medium text-ink">{tenant.name} <span className="ml-1 font-mono text-xs text-tertiary">{tenant.slug}</span></p>
                  <p className="text-xs capitalize text-tertiary">{tenant.memberCount} members · {tenant.queryCount} queries · {tenant.status.toLowerCase()}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" disabled={busy} onClick={() => void inviteAdmin(tenant)} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-brand-lighter hover:bg-brand-light disabled:opacity-50"><UserPlus className="size-3.5" />Invite admin</button>
                  <button type="button" disabled={busy} onClick={() => void toggleTenant(tenant)} className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-brand-lighter hover:bg-brand-light disabled:opacity-50">{tenant.status === "ACTIVE" ? "Suspend" : "Reactivate"}</button>
                </div>
              </div>
            ))}
            {tenants.length === 0 && <p className="rounded-2xl border border-border bg-card px-4 py-6 text-center text-sm text-tertiary shadow-sm">No tenants yet.</p>}
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-heading text-xl font-medium tracking-tight text-ink">Users</h2>
          <div className="overflow-auto rounded-2xl border border-border bg-card shadow-sm">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-brand-light text-[11px] font-medium tracking-wide text-tertiary uppercase"><tr><th className="px-4 py-2.5 font-heading">Name</th><th className="px-4 py-2.5 font-heading">Email</th><th className="px-4 py-2.5 font-heading">Memberships</th><th className="px-4 py-2.5 font-heading">Status</th><th className="px-4 py-2.5 text-right font-heading">Action</th></tr></thead>
              <tbody>
                {users.map((platformUser) => (
                  <tr key={platformUser.id} className="border-t border-border transition-colors hover:bg-brand-light/70">
                    <td className="px-4 py-3 font-medium text-ink">{platformUser.name}{platformUser.platformRole === "SUPER_ADMIN" && <span className="ml-2 rounded-full bg-mint px-2 py-0.5 text-xs text-primary">super admin</span>}</td>
                    <td className="px-4 py-3 text-tertiary">{platformUser.email}</td>
                    <td className="px-4 py-3 text-tertiary">{platformUser.memberships.filter((membership) => membership.status === "ACTIVE").map((membership) => `${membership.tenantName} (${membership.role.toLowerCase()})`).join(", ") || "—"}</td>
                    <td className="px-4 py-3 capitalize">{platformUser.status.toLowerCase()}</td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" disabled={busy || platformUser.id === user?.id} onClick={() => void toggleUser(platformUser)} className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-brand-lighter hover:bg-brand-light disabled:opacity-40">{platformUser.status === "ACTIVE" ? "Suspend" : "Reactivate"}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
