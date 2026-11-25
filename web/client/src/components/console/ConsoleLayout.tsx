import { useEffect, useState } from "react";
import { BookOpen, ClipboardList, LayoutDashboard, ListChecks, LogOut, ShieldCheck, Users } from "lucide-react";
import { Link, NavLink, Outlet, useLocation, useSearchParams } from "react-router-dom";
import { useAuth, type TenantRole } from "@/auth/AuthProvider";
import WorkspacePicker from "@/pages/WorkspacePicker";

export interface ConsoleTenant {
  slug: string;
  name: string;
  role: TenantRole;
}

export interface ConsoleContext {
  tenants: ConsoleTenant[];
  tenantSlug: string;
  tenantError: string | null;
  role: TenantRole;
  setTenantSlug: (slug: string) => void;
}

function navClass(active: boolean) {
  return `flex items-center gap-2.5 rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
    active ? "bg-mint text-primary" : "text-tertiary hover:bg-brand-light/70 hover:text-ink"
  }`;
}

export function ConsoleLayout() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeTenant, memberships, isSuperAdmin, isTenantAdmin, switchTenant, signOut, user } = useAuth();
  const [tenantError, setTenantError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  const tenantSlug = activeTenant?.slug ?? "";

  // The URL parameter is a bookmark hint only — the server decides access.
  useEffect(() => {
    if (!activeTenant) return;
    const urlSlug = searchParams.get("tenantSlug");
    if (!urlSlug) {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set("tenantSlug", activeTenant.slug);
        return next;
      }, { replace: true });
      return;
    }
    if (urlSlug === activeTenant.slug) return;
    let cancelled = false;
    switchTenant(urlSlug).catch(() => {
      if (cancelled) return;
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set("tenantSlug", activeTenant.slug);
        return next;
      }, { replace: true });
      setTenantError("That workspace is not available. Showing your current workspace.");
    });
    return () => { cancelled = true; };
  }, [activeTenant, searchParams, setSearchParams, switchTenant]);

  if (!activeTenant) return <WorkspacePicker />;

  const tenants: ConsoleTenant[] = memberships.map((membership) => ({
    slug: membership.tenantSlug,
    name: membership.tenantName,
    role: membership.role,
  }));

  function setTenantSlug(slug: string) {
    if (slug === activeTenant?.slug) return;
    setSwitching(true);
    setTenantError(null);
    switchTenant(slug)
      .then(() => {
        setSearchParams((current) => {
          const next = new URLSearchParams(current);
          next.set("tenantSlug", slug);
          return next;
        }, { replace: true });
      })
      .catch((error) => setTenantError(error instanceof Error ? error.message : "Could not switch workspace"))
      .finally(() => setSwitching(false));
  }

  const isDetail = location.pathname.startsWith("/console/tickets/");
  const isQueries = location.pathname.startsWith("/queries");
  const isCallDetail = location.pathname.startsWith("/calls/");
  const isKnowledge = location.pathname.startsWith("/knowledge");
  const isMembers = location.pathname.startsWith("/settings/members");
  const overviewActive = location.pathname === "/console" && location.hash !== "#tickets";
  const ticketsActive = location.hash === "#tickets" || isDetail;
  const context: ConsoleContext = {
    tenants,
    tenantSlug,
    tenantError,
    role: activeTenant.role,
    setTenantSlug,
  };
  const breadcrumb = isDetail
    ? "Ticket detail"
    : isCallDetail
      ? "Call detail"
      : isQueries
        ? "Queries"
        : isKnowledge
          ? "Knowledge"
          : isMembers
            ? "Members"
            : "Console";

  return (
    <div className="flex min-h-svh flex-1 bg-brand-light/40">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
        <Link to={`/console?tenantSlug=${tenantSlug}`} className="flex h-16 items-center gap-2.5 border-b border-border px-5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-sm">D</span>
          <span className="font-heading text-lg font-medium tracking-tight text-ink">Diya</span>
          <span className="ml-auto rounded-full bg-mint px-2 py-0.5 font-heading text-[10px] font-medium tracking-wide text-primary uppercase">Ops</span>
        </Link>

        <nav aria-label="Console navigation" className="flex flex-col gap-1 p-3">
          <NavLink to={`/console?tenantSlug=${tenantSlug}`} end className={() => navClass(overviewActive)}>
            <LayoutDashboard className="size-4" aria-hidden="true" />
            Overview
          </NavLink>
          <Link to={`/console?tenantSlug=${tenantSlug}#tickets`} className={navClass(ticketsActive)}>
            <ListChecks className="size-4" aria-hidden="true" />
            Tickets
          </Link>
          <NavLink to={`/queries?tenantSlug=${tenantSlug}`} className={() => navClass(isQueries)}>
            <ClipboardList className="size-4" aria-hidden="true" />
            Queries
          </NavLink>
          <NavLink to={`/knowledge?tenantSlug=${tenantSlug}`} className={() => navClass(isKnowledge)}>
            <BookOpen className="size-4" aria-hidden="true" />
            Knowledge
          </NavLink>
          {isTenantAdmin && (
            <NavLink to={`/settings/members?tenantSlug=${tenantSlug}`} className={() => navClass(isMembers)}>
              <Users className="size-4" aria-hidden="true" />
              Members
            </NavLink>
          )}
          {isSuperAdmin && (
            <NavLink to="/platform/tenants" className={() => navClass(location.pathname.startsWith("/platform"))}>
              <ShieldCheck className="size-4" aria-hidden="true" />
              Platform
            </NavLink>
          )}
        </nav>

        <div className="mt-auto flex flex-col gap-3 border-t border-border p-4">
          {tenants.length > 1 ? (
            <div className="flex flex-col gap-2">
              <label htmlFor="sidebar-tenant" className="text-xs font-medium text-tertiary">Workspace</label>
              <select
                id="sidebar-tenant"
                value={tenantSlug}
                disabled={switching}
                onChange={(event) => setTenantSlug(event.target.value)}
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink transition focus:border-brand-lighter focus-visible:ring-4 focus-visible:ring-brand/10 disabled:opacity-60"
              >
                {tenants.map((tenant) => (
                  <option key={tenant.slug} value={tenant.slug}>
                    {tenant.name} · {tenant.role === "TENANT_ADMIN" ? "Admin" : "Operator"}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="rounded-2xl bg-brand-light/70 p-3">
              <p className="text-xs text-tertiary">Workspace</p>
              <p className="mt-0.5 font-heading text-sm font-medium text-ink">{activeTenant.name}</p>
              <p className="text-xs text-tertiary">{activeTenant.role === "TENANT_ADMIN" ? "Tenant admin" : "Operator"}</p>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-light text-xs font-semibold text-primary uppercase">
                {user?.name?.charAt(0) ?? "D"}
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-ink">{user?.name}</p>
                <p className="truncate text-[11px] text-tertiary">{user?.email}</p>
              </div>
            </div>
            <button type="button" onClick={() => void signOut()} title="Sign out" className="rounded-full border border-border p-2 text-tertiary transition-colors hover:border-brand-lighter hover:text-primary">
              <LogOut className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-16 items-center justify-between gap-4 border-b border-border bg-card px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="flex items-center gap-2 md:hidden">
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">D</span>
              <span className="font-heading font-medium text-ink">Diya</span>
            </span>
            <span className="hidden text-tertiary md:inline">{activeTenant.name}</span>
            <span className="hidden text-ink-gray md:inline">/</span>
            <span className="truncate font-medium text-ink">{breadcrumb}</span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {tenants.length > 1 && (
              <>
                <label className="sr-only" htmlFor="mobile-tenant">Tenant</label>
                <select
                  id="mobile-tenant"
                  value={tenantSlug}
                  disabled={switching}
                  onChange={(event) => setTenantSlug(event.target.value)}
                  className="max-w-40 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-ink md:hidden"
                >
                  {tenants.map((tenant) => <option key={tenant.slug} value={tenant.slug}>{tenant.name}</option>)}
                </select>
              </>
            )}
            <span className="inline-flex items-center gap-2 rounded-full bg-mint px-3 py-1 text-xs font-medium text-primary">
              <span className="size-1.5 rounded-full bg-primary" />
              Sandbox
            </span>
            <button type="button" onClick={() => void signOut()} className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-ink md:hidden">Sign out</button>
          </div>
        </header>

        <nav aria-label="Console navigation" className="flex gap-1 overflow-x-auto border-b border-border bg-card px-4 py-2 md:hidden">
          <NavLink to={`/console?tenantSlug=${tenantSlug}`} end className={() => navClass(overviewActive)}>
            <LayoutDashboard className="size-4" aria-hidden="true" />
            Overview
          </NavLink>
          <NavLink to={`/queries?tenantSlug=${tenantSlug}`} className={() => navClass(isQueries)}>
            <ClipboardList className="size-4" aria-hidden="true" />
            Queries
          </NavLink>
          <NavLink to={`/knowledge?tenantSlug=${tenantSlug}`} className={() => navClass(isKnowledge)}>
            <BookOpen className="size-4" aria-hidden="true" />
            Knowledge
          </NavLink>
          {isTenantAdmin && (
            <NavLink to={`/settings/members?tenantSlug=${tenantSlug}`} className={() => navClass(isMembers)}>
              <Users className="size-4" aria-hidden="true" />
              Members
            </NavLink>
          )}
        </nav>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-7 lg:px-8">
          {tenantError && <p role="alert" className="mb-4 rounded-xl border border-status-danger/25 bg-status-danger-bg px-3.5 py-2.5 text-sm text-status-danger">{tenantError}</p>}
          <Outlet key={activeTenant.id} context={context} />
        </main>
      </div>
    </div>
  );
}
