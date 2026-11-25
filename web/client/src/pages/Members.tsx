import { useEffect, useState } from "react";
import { Copy, Mail, Trash2, UserPlus } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth, type TenantRole } from "@/auth/AuthProvider";

interface Member {
  userId: string;
  name: string;
  email: string;
  status: string;
  role: TenantRole;
  joinedAt: string;
}

interface PendingInvite {
  id: string;
  email: string;
  role: TenantRole | null;
  expiresAt: string;
  createdAt: string;
}

interface MembersResponse {
  members: Member[];
  invitations: PendingInvite[];
}

const fieldClass =
  "w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-brand-lighter focus-visible:ring-4 focus-visible:ring-brand/10";

export default function Members() {
  const { user, isTenantAdmin } = useAuth();
  const [data, setData] = useState<MembersResponse | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TenantRole>("OPERATOR");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const response = await apiFetch<MembersResponse>("/api/tenant/members");
      setData(response);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load members");
    }
  }

  useEffect(() => {
    if (isTenantAdmin) void load();
  }, [isTenantAdmin]);

  if (!isTenantAdmin) {
    return <p className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-tertiary shadow-sm">Only tenant admins can manage members.</p>;
  }

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setInviteLink(null);
    try {
      const result = await apiFetch<{ inviteLink: string }>("/api/tenant/invitations", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), role }),
      });
      setInviteLink(result.inviteLink);
      setEmail("");
      setNotice("Invitation created. Copy the link and send it to the recipient.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the invitation");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(member: Member, nextRole: TenantRole) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/tenant/members/${member.userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role: nextRole }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the role");
    } finally {
      setBusy(false);
    }
  }

  async function remove(member: Member) {
    if (!window.confirm(`Remove ${member.name} from this workspace?`)) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/tenant/members/${member.userId}`, { method: "DELETE" });
      setNotice(`${member.name} was removed from this workspace.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the member");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(invitation: PendingInvite) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/tenant/invitations/${invitation.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke the invitation");
    } finally {
      setBusy(false);
    }
  }

  async function newLink(invitation: PendingInvite) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/tenant/invitations/${invitation.id}`, { method: "DELETE" });
      const result = await apiFetch<{ inviteLink: string }>("/api/tenant/invitations", {
        method: "POST",
        body: JSON.stringify({ email: invitation.email, role: invitation.role ?? "OPERATOR" }),
      });
      setInviteLink(result.inviteLink);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create a new link");
    } finally {
      setBusy(false);
    }
  }

  const adminCount = data?.members.filter((member) => member.role === "TENANT_ADMIN").length ?? 0;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header>
        <h1 className="font-heading text-3xl font-medium tracking-tight text-ink">
          Team <span className="text-primary">members</span>
        </h1>
        <p className="mt-1.5 text-sm text-tertiary">Invite operators and manage roles for this workspace.</p>
      </header>

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
        <h2 className="flex items-center gap-2 font-heading text-base font-medium tracking-tight text-ink"><span className="flex size-7 items-center justify-center rounded-lg bg-mint text-primary"><UserPlus className="size-4" /></span>Invite a member</h2>
        <form onSubmit={invite} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor="invite-email" className="mb-1.5 block text-xs font-medium text-tertiary">Email</label>
            <input id="invite-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className={fieldClass} />
          </div>
          <div>
            <label htmlFor="invite-role" className="mb-1.5 block text-xs font-medium text-tertiary">Role</label>
            <select id="invite-role" value={role} onChange={(event) => setRole(event.target.value as TenantRole)} className="rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-brand-lighter focus-visible:ring-4 focus-visible:ring-brand/10">
              <option value="OPERATOR">Operator</option>
              <option value="TENANT_ADMIN">Tenant admin</option>
            </select>
          </div>
          <button type="submit" disabled={busy} className="rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-brand-dark disabled:opacity-50">Create invitation</button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 font-heading text-xl font-medium tracking-tight text-ink">Active members</h2>
        <div className="overflow-auto rounded-2xl border border-border bg-card shadow-sm">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-brand-light text-[11px] font-medium tracking-wide text-tertiary uppercase">
              <tr><th className="px-4 py-2.5 font-heading">Name</th><th className="px-4 py-2.5 font-heading">Email</th><th className="px-4 py-2.5 font-heading">Role</th><th className="px-4 py-2.5 font-heading">Joined</th><th className="px-4 py-2.5 text-right font-heading">Actions</th></tr>
            </thead>
            <tbody>
              {data?.members.map((member) => {
                const isSelf = member.userId === user?.id;
                const demotingLastAdmin = member.role === "TENANT_ADMIN" && adminCount <= 1;
                return (
                  <tr key={member.userId} className="border-t border-border transition-colors hover:bg-brand-light/70">
                    <td className="px-4 py-3 font-medium text-ink">{member.name}{isSelf && <span className="ml-2 rounded-full bg-mint px-2 py-0.5 text-xs text-primary">you</span>}</td>
                    <td className="px-4 py-3 text-tertiary">{member.email}</td>
                    <td className="px-4 py-3">
                      <select
                        value={member.role}
                        disabled={busy || isSelf}
                        onChange={(event) => void changeRole(member, event.target.value as TenantRole)}
                        className="rounded-full border border-border bg-card px-3 py-1 text-sm text-ink disabled:opacity-60"
                      >
                        <option value="OPERATOR">Operator</option>
                        <option value="TENANT_ADMIN">Tenant admin</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-tertiary">{new Date(member.joinedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={busy || isSelf || demotingLastAdmin}
                        title={isSelf ? "You cannot remove yourself" : demotingLastAdmin ? "A tenant must keep at least one admin" : "Remove member"}
                        onClick={() => void remove(member)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-status-danger/30 hover:text-status-danger disabled:opacity-40"
                      >
                        <Trash2 className="size-3.5" />Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
              {data?.members.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-tertiary">No active members.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-heading text-xl font-medium tracking-tight text-ink">Pending invitations</h2>
        <div className="flex flex-col gap-2">
          {data?.invitations.map((invitation) => (
            <div key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-3.5 shadow-sm">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{invitation.email}</p>
                <p className="text-xs capitalize text-tertiary">{invitation.role?.replaceAll("_", " ").toLowerCase()} · expires {new Date(invitation.expiresAt).toLocaleDateString()}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => void newLink(invitation)} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-brand-lighter hover:bg-brand-light disabled:opacity-50"><Mail className="size-3.5" />New link</button>
                <button type="button" disabled={busy} onClick={() => void revoke(invitation)} className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-status-danger/30 hover:text-status-danger disabled:opacity-50">Revoke</button>
              </div>
            </div>
          ))}
          {data?.invitations.length === 0 && <p className="rounded-2xl border border-border bg-card px-4 py-6 text-center text-sm text-tertiary shadow-sm">No pending invitations.</p>}
        </div>
      </section>
    </div>
  );
}
