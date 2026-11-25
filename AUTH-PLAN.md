# Diya — Tenant Authentication & Access Control Plan

Scope: replace the single shared operator token with real accounts, real tenants,
and role-based access. Sign-in only — no public sign-up. A super admin creates
tenants and seeds their first admin; a tenant admin invites and removes the
operators who use the console.

This plan is written against the code as it stands, not against an idealised
version of it. §0 is the honest starting point; everything after it is the work.

---

## §0 Where we are today, and why this is not a cosmetic change

Three facts about the current build drive every decision below.

**0.1 — There is one shared secret, not identity.**
`web/server/src/security/operator-auth.ts` compares a bearer token against
`OUTBOUND_OPERATOR_TOKEN`. Every person holds the same string. There is no
"who", so there is nothing to attribute an action to, nothing to revoke when
someone leaves, and no way to give one person less access than another. The
override endpoint already writes `overriddenBy: process.env.OUTBOUND_OPERATOR_NAME`
— a single name from an env var standing in for an actual user.

**0.2 — The tenant is chosen by the client.**
Fourteen call sites read the tenant from `req.query.tenantSlug` or
`req.body.tenantSlug` and then look it up directly:

```
src/routes/queries.ts:13    req.query.tenantSlug
src/routes/knowledge.ts:47  req.body?.tenantSlug
src/routes/console.ts:16    resolveTenantId(req.query.tenantSlug)
src/routes/calls.ts:27      req.query.tenantSlug
```

Whoever holds the token can set `?tenantSlug=` to anything and read or write
that tenant's data. Right now that is acceptable because the token holder is
the developer and both tenants are demo fixtures. With real customers it is a
cross-tenant data breach by query string.

**0.3 — Several routes carry no tenant predicate at all.**
These load a row by primary key with no tenant check:

| Route | Query |
|---|---|
| `GET /api/calls/:id` | `callSession.findUnique({ where: { id } })` |
| `POST /api/calls/:id/end` | `callSession.findUnique({ where: { id } })` |
| `PATCH /api/calls/:id/outcome` | `callSession.findUnique({ where: { id } })` |
| `POST /api/queries/:id/consent` | `query.findUnique({ where: { id } })` |
| `PATCH /api/queries/:id/do-not-call` | `query.findUnique({ where: { id } })` |

A cuid from tenant A, replayed by a user of tenant B, succeeds. `consent` and
`do-not-call` are *writes* against a customer record — this is the sharpest
edge in the current code.

**0.4 — The isolation rule is already written down and already half-broken.**
`src/db/scoped.ts` says, in its own header comment, that new paths "MUST include
tenantId in every read, write and update predicate". The call, query and
knowledge routes were then written with bare `prisma.*`. A convention that is
documented and not enforced has already failed once; §7 makes it structural
instead of repeating the comment louder.

**What this means for sequencing.** Authentication (§3–5) is the visible
feature, but authorisation (§6–7) is the part that actually protects data.
Phases 2 and 3 of the work order are not optional polish — without them,
adding real users to the current routing *increases* exposure, because it puts
genuine tenants behind a boundary that does not hold.

---

## §1 Roles

Two role axes. Keep them separate; conflating them is how super admins end up
able to read customer transcripts by accident.

### Platform axis — who may administer the system

| Role | Who | Can |
|---|---|---|
| `SUPER_ADMIN` | You / the platform operator | Create, rename, suspend tenants. Invite a tenant's first admin. List tenants and users. |
| `NONE` | Everyone else | Nothing at platform level |

### Tenant axis — a `Membership` row joining a user to a tenant

| Role | Can |
|---|---|
| `TENANT_ADMIN` | Everything an operator can, plus: invite and remove members, change member roles, see the member list and pending invitations |
| `OPERATOR` | Queries, Contact, call detail, outcome override, knowledge base, overview. The day-to-day console from the operator manual. |

A user may hold memberships in several tenants with a different role in each.
The session carries exactly one **active tenant** at a time.

### The rule that matters most

> **`SUPER_ADMIN` is not a tenant role, and does not grant access to tenant
> operational data.**

A super admin who needs to see a tenant's queries must either be given a
membership like anyone else, or use the explicit, audited *view-as* in §5.4.
There is no ambient god-mode read.

Two reasons. First, operational data here is customer PII — names, phone
numbers, call transcripts, consent records — and "the platform owner can
silently read every customer's support calls" is the wrong default. Second, it
is a question a judge or a client security review will ask, and "the super
admin manages tenants, it cannot read their call data without leaving an audit
record" is a much better answer than "yes, it can see everything".

---

## §2 Data model

Additions to `web/server/prisma/schema.prisma`. Existing models are unchanged except
`Tenant`.

```prisma
model User {
  id               String     @id @default(cuid())
  email            String     @unique            // always stored lowercased
  name             String
  passwordHash     String?                        // null until an invite is accepted
  passwordAlgo     String     @default("argon2id")
  platformRole     PlatformRole @default(NONE)
  status           UserStatus @default(ACTIVE)
  failedLoginCount Int        @default(0)
  lockedUntil      DateTime?
  lastLoginAt      DateTime?
  passwordChangedAt DateTime?
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt

  memberships Membership[]
  sessions    Session[]
  invitesSent Invitation[] @relation("InvitedBy")
  auditEvents AuditEvent[]

  @@index([platformRole])
}

model Membership {
  id          String           @id @default(cuid())
  userId      String
  tenantId    String
  role        TenantRole
  status      MembershipStatus @default(ACTIVE)
  invitedById String?
  createdAt   DateTime         @default(now())
  removedAt   DateTime?

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([userId, tenantId])
  @@index([tenantId, status])
  @@index([tenantId, role])
}

model Session {
  id             String    @id @default(cuid())
  userId         String
  tokenHash      String    @unique          // SHA-256 of the cookie value
  activeTenantId String?
  createdAt      DateTime  @default(now())
  lastSeenAt     DateTime  @default(now())
  idleExpiresAt  DateTime                   // slides forward on use
  absoluteExpiresAt DateTime                // never extends
  revokedAt      DateTime?
  revokedReason  String?
  ip             String?
  userAgent      String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, revokedAt])
  @@index([idleExpiresAt])
}

model Invitation {
  id           String      @id @default(cuid())
  email        String                         // lowercased
  tenantId     String?                        // null for a platform-admin invite
  role         TenantRole?
  platformRole PlatformRole?
  tokenHash    String      @unique            // SHA-256 of the emailed token
  invitedById  String
  expiresAt    DateTime
  acceptedAt   DateTime?
  revokedAt    DateTime?
  createdAt    DateTime    @default(now())

  tenant    Tenant? @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  invitedBy User    @relation("InvitedBy", fields: [invitedById], references: [id])

  @@index([tenantId, email])
  @@index([expiresAt])
}

model AuditEvent {
  id          String   @id @default(cuid())
  actorUserId String?
  tenantId    String?
  action      String                      // "tenant.create", "member.remove", ...
  targetType  String?
  targetId    String?
  metadata    Json?
  ip          String?
  createdAt   DateTime @default(now())

  actor  User?   @relation(fields: [actorUserId], references: [id], onDelete: SetNull)
  tenant Tenant? @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, createdAt])
  @@index([actorUserId, createdAt])
}

enum PlatformRole    { NONE SUPER_ADMIN }
enum TenantRole      { TENANT_ADMIN OPERATOR }
enum UserStatus      { ACTIVE SUSPENDED }
enum MembershipStatus { ACTIVE REMOVED }
enum TenantStatus    { ACTIVE SUSPENDED }
```

`Tenant` gains:

```prisma
  status      TenantStatus @default(ACTIVE)
  createdById String?
  memberships Membership[]
  invitations Invitation[]
  auditEvents AuditEvent[]
```

### Notes on specific choices

**Tokens are stored hashed, never raw.** `Session.tokenHash` and
`Invitation.tokenHash` hold SHA-256 of a 32-byte random value. A database dump
does not yield usable sessions or invitation links. SHA-256 is correct here and
argon2 is not — these are 256-bit random values, not low-entropy passwords, so
there is nothing to brute-force and per-request hashing must stay fast.

**Membership removal is soft.** `status = REMOVED` with `removedAt`, so
`@@unique([userId, tenantId])` still holds if the person is re-invited later,
and the audit trail survives. Every membership lookup filters
`status: "ACTIVE"`.

**`activeTenantId` lives on the session, not the client.** This is the fix for
§0.2. The server knows which tenant a request is for; the URL is only ever a
request to *change* it, validated against memberships.

---

## §3 Session mechanics

**Decision: opaque server-side sessions in an httpOnly cookie. Not JWT.**

Three reasons, in order of weight:

1. **Revocation is a stated requirement.** "Remove users" has to mean the
   person loses access now, not when a token expires. With a `Session` row this
   is one `UPDATE`. With stateless JWTs it needs a denylist — which is a
   session table with extra steps and a worse failure mode.
2. **No token in JavaScript.** An httpOnly cookie is not readable by script, so
   an XSS bug cannot exfiltrate the credential. The current design puts a
   long-lived shared secret in `sessionStorage`, which is exactly the thing
   worth not repeating.
3. **Role changes take effect immediately**, because the role is read from the
   database per request rather than frozen into a signed claim.

The cost is a database read per request. At this scale that is one indexed
lookup on a connection we are already holding.

### Cookie

```
Name:     diya_session
Value:    base64url(32 random bytes)     // only the SHA-256 is stored
HttpOnly: true
Secure:   true in production
SameSite: Lax
Path:     /
Max-Age:  matches idleExpiresAt
```

`SameSite=Lax` is sufficient for the dev topology because cookies ignore port:
`localhost:5174` and `localhost:4002` are the same site. In production, serve
the client and API on the same registrable domain — if they must be split,
`SameSite=None; Secure` plus the origin check in §9.4.

### Lifetimes

- **Idle expiry: 12 hours**, slid forward on each authenticated request (at most
  once a minute, to avoid a write per request).
- **Absolute expiry: 7 days**, never extended. A stolen cookie cannot be kept
  alive indefinitely by using it.
- A sweep deletes rows past `absoluteExpiresAt`; expiry is also checked on read,
  so a missed sweep is not a security failure.

### Choosing the active tenant

A user may belong to several tenants (§14.1 — confirmed). A session is still
pinned to exactly one at a time, so sign-in has to pick one:

1. If `Session.activeTenantId` from the user's most recent session is still an
   `ACTIVE` membership on an `ACTIVE` tenant → reuse it.
2. Otherwise, if the user has exactly one active membership → use it.
3. Otherwise → sign in with `activeTenantId = null` and send the client to a
   **workspace picker**. Nothing tenant-scoped is reachable until one is chosen.

Case 3 is a real screen, not an edge case, the moment one person works for two
brands. `requireTenant` returns `409 { code: "NO_ACTIVE_TENANT" }` rather than
401 so the client can route to the picker instead of the sign-in page.

### Rotation and revocation

- Rotate the session token on sign-in and on password change.

Revocation has to be **scoped**, because a user removed from one tenant may
still legitimately be working in another. Blanket "revoke all sessions" would
sign them out of a tenant that never made a decision about them.

| Event | What is revoked |
|---|---|
| Password changed | All sessions except the one performing the change |
| User suspended (platform) | All sessions |
| Tenant suspended | Sessions whose `activeTenantId` is that tenant |
| **Membership removed** | Only sessions whose `activeTenantId` is that tenant; others untouched |
| **Role changed** | Nothing |

Two of these deserve the explanation:

**Membership removal** clears `activeTenantId` on the matching sessions rather
than deleting them, so the user lands on the workspace picker with their
remaining tenants. Being removed from one client's workspace should not look
like being logged out of the product.

**Role change revokes nothing** because the role is *not* cached in the session
— `requireRole` reads the `Membership` row per request. A demotion therefore
takes effect on the user's very next request without touching their session.
(The earlier draft of this plan revoked on role change; that was only necessary
under a design where the session cached the role, and it is not what we are
building.)

---

## §4 Passwords and invitations

### 4.1 Password hashing

**argon2id**, via `@node-rs/argon2` — OWASP's first choice, actively maintained,
prebuilt binaries. Parameters: `memoryCost 19456 (19 MiB)`, `timeCost 2`,
`parallelism 1`, per OWASP's minimum configuration.

Acceptable zero-dependency alternative: `scrypt` from `node:crypto`
(`N = 2^15, r = 8, p = 1`, 32-byte salt, 64-byte key, compared with
`timingSafeEqual`). This keeps to the standard library if we would rather not
add a native dependency before a demo. `passwordAlgo` on `User` exists so the
two can coexist and migrate lazily on next sign-in.

Not negotiable either way: no SHA-family hash, no unsalted hash, no
`bcrypt` below cost 12.

### 4.2 Password policy

- Minimum 12 characters. No composition rules — length beats symbol soup.
- Reject the top ~1,000 common passwords and anything containing the local part
  of the email address.
- No forced rotation.
- Never log, echo, or return a password or hash. Never put one in an error.

### 4.3 Invitations

Accounts come into existence one way only: an invitation.

```
1. Admin submits { email, role }.
2. Server generates 32 random bytes → `token`; stores SHA-256(token).
3. Invitation row: email (lowercased), tenantId, role, invitedById,
   expiresAt = now + 7 days.
4. Link: {CLIENT_ORIGIN}/accept-invite/{token}
5. Recipient opens it → GET /api/auth/invite/:token returns a *preview*
   (tenant name, role, email) without consuming the invitation.
6. Recipient submits name + password → POST /api/auth/accept-invite.
7. In one transaction: create-or-find User, set passwordHash,
   create Membership, mark acceptedAt, write AuditEvent, open a Session.
```

Rules:

- **Single use.** `acceptedAt` is set inside the transaction; a replayed token
  finds it non-null and is rejected.
- **The role is fixed at invite time.** The acceptance payload cannot carry a
  role — that is the obvious privilege-escalation hole and it is closed by
  simply not reading a role from the request body.
- **Email is bound to the invitation.** The acceptor cannot substitute another
  address.
- **Existing users:** if the email already has an account, acceptance adds a
  membership and does *not* touch the existing password. This is the normal
  path for a shared operator, not a special case — see below.
- Expired, revoked, and already-accepted invitations return the same generic
  error. Admins can revoke a pending invitation, which sets `revokedAt`.

### 4.3.1 Inviting someone who already has an account

Because `User.email` is globally unique, an operator who already works for
tenant A and is then invited by tenant B ends up with **one identity and two
memberships** — one password, one session, a workspace switcher.

Two consequences worth being deliberate about:

**The invite response must not reveal whether the account exists.** If "invite
sent" and "existing user added" look different to the inviting admin, any
tenant admin can probe whether an arbitrary email is a Diya user — and, by
extension, which people work for which competitor. Creating an invitation
returns the same shape regardless, and the acceptance screen is where the
difference shows (an existing user is asked to sign in rather than to set a
password, *after* proving they hold the token).

**Acceptance by a signed-in user is a distinct path.** If the token is opened
by someone already authenticated as that email, skip the password step and
just create the membership. If they are signed in as a *different* email,
refuse and tell them to sign out — silently attaching tenant B to the wrong
account is the worst possible outcome here.

### 4.4 Delivery

Define the seam, not the provider — the same pattern as `CallChannel` and
`CommerceAdapter` already in this codebase:

```ts
export interface InviteDelivery {
  readonly name: "console" | "email";
  send(invite: { email: string; link: string; tenantName: string; role: string }): Promise<void>;
}
```

- **`ConsoleInviteDelivery`** (build this): returns the link to the admin UI to
  copy and send manually, and logs nothing but the invitation id. No SMTP, no
  deliverability problems, demo-safe.
- **`EmailInviteDelivery`** (later): Resend/SES behind the same interface.

For the hackathon the copy-link flow is not a compromise — it is one fewer
external dependency that can fail on stage. Flag it as the deliberate choice it
is, with the seam proving email is a drop-in.

---

## §5 API surface

All paths return `401` when unauthenticated, `403` when authenticated but not
permitted, and never distinguish "no such tenant" from "not your tenant".

### 5.1 Authentication

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/api/auth/sign-in` | none | `{ email, password }` → sets cookie. Rate limited. |
| `POST` | `/api/auth/sign-out` | session | Revokes the current session |
| `POST` | `/api/auth/sign-out-all` | session | Revokes every session for the user |
| `GET` | `/api/auth/me` | session | `{ user, platformRole, memberships[], activeTenant }` |
| `POST` | `/api/auth/switch-tenant` | session | `{ tenantSlug }`, validated against memberships |
| `GET` | `/api/auth/invite/:token` | none | Preview only; does not consume |
| `POST` | `/api/auth/accept-invite` | none | `{ token, name, password }` |
| `POST` | `/api/auth/change-password` | session | `{ currentPassword, newPassword }`; revokes other sessions |

### 5.2 Platform administration — `SUPER_ADMIN` only

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/platform/tenants` | List with member counts |
| `POST` | `/api/platform/tenants` | `{ name, slug, brandTone }` + first-admin email → creates tenant and its first invitation in one transaction |
| `PATCH` | `/api/platform/tenants/:id` | Rename, or `status: SUSPENDED` |
| `POST` | `/api/platform/tenants/:id/invitations` | Invite an additional tenant admin |
| `GET` | `/api/platform/users` | Directory, with memberships |
| `PATCH` | `/api/platform/users/:id` | Suspend / reactivate |

Suspending a tenant revokes every session whose `activeTenantId` is that tenant
and makes `POST /api/calls` fail closed for it.

### 5.3 Tenant administration — `TENANT_ADMIN` of the active tenant

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/tenant/members` | Active members + pending invitations |
| `POST` | `/api/tenant/invitations` | `{ email, role }` |
| `DELETE` | `/api/tenant/invitations/:id` | Revoke a pending invitation |
| `PATCH` | `/api/tenant/members/:userId` | `{ role }` |
| `DELETE` | `/api/tenant/members/:userId` | Soft-remove; revokes their sessions |

**Last-admin guard.** Removing or demoting the final `ACTIVE` `TENANT_ADMIN` is
rejected with a clear message. Enforced inside the transaction with a
`SELECT … FOR UPDATE`-equivalent count, so two concurrent demotions cannot both
pass. A tenant with no admin is unrecoverable without platform intervention.

**Self-protection.** An admin cannot remove or demote themselves; this prevents
the common accident and makes the last-admin rule easier to reason about.

### 5.4 View-as (optional, §5 of the work order)

`POST /api/platform/tenants/:id/view-as` grants the super admin a *time-boxed*
`OPERATOR` context: sets `activeTenantId`, stamps `viewAsExpiresAt` (15 min) on
the session, and writes an `AuditEvent`. A banner is shown in the UI for the
duration. Read-only: mutating routes reject a view-as session.

This exists so the honest answer to "can the platform owner see tenant data" is
"only deliberately, read-only, time-boxed, and it is in the audit log".

---

## §6 Enforcement

### 6.1 The middleware chain

```ts
// src/security/auth.ts
requireAuth      // cookie → Session → User; rejects revoked/expired/suspended
requireTenant    // resolves + attaches the active tenant from the session
requireRole(...)  // asserts the membership role for the active tenant
requirePlatform  // asserts platformRole === SUPER_ADMIN
```

Attached to the request:

```ts
interface AuthContext {
  user: { id: string; email: string; name: string; platformRole: PlatformRole };
  session: { id: string; viewAs: boolean };
  tenant: { id: string; slug: string; name: string };   // present after requireTenant
  role: TenantRole;
}
declare module "express-serve-static-core" {
  interface Request { auth?: AuthContext }
}
```

Mounting:

```ts
app.use("/api/auth",     authRouter);                                    // self-guarding
app.use("/api/platform", requireAuth, requirePlatform, platformRouter);
app.use("/api/tenant",   requireAuth, requireTenant, requireRole("TENANT_ADMIN"), tenantAdminRouter);

app.use("/api/queries",   requireAuth, requireTenant, queriesRouter);
app.use("/api/calls",     requireAuth, requireTenant, callsRouter);
app.use("/api/knowledge", requireAuth, requireTenant, knowledgeRouter);
app.use("/api/console",   requireAuth, requireTenant, consoleRouter);

// Machine callers keep their existing, correct verification — see §10.
app.use("/api/twilio",    twilioRouter);     // X-Twilio-Signature
app.use("/api/approvals", approvalsRouter);  // shared callback secret
app.use("/api/audio",     audioRouter);      // unguessable id, short TTL
```

### 6.2 The tenant-resolution rule

> `tenantSlug` in a query string or body is **never** an authorisation input.
> The only accepted source of tenant identity is `req.auth.tenant.id`,
> derived from the session's `activeTenantId` and re-validated against an
> `ACTIVE` membership on every request.

Concretely, for each of the fourteen call sites in §0.2:

- Delete the `resolveTenantId` / `tenantFromSlug` helpers.
- Replace every `tenantId` derivation with `req.auth!.tenant.id`.
- Drop `tenantSlug` from request bodies entirely (`POST /api/knowledge`
  currently takes it in the body — it becomes implicit).
- The client keeps `?tenantSlug=` in the URL purely as a **UI bookmark**. On
  load, if it disagrees with the session's active tenant, the client calls
  `switch-tenant`; if that is refused, it falls back to the session's tenant.
  The parameter is a navigation hint, never a grant.

### 6.3 Closing the five unscoped routes

Each of the routes in §0.3 changes from a primary-key lookup to a
tenant-qualified one:

```ts
// before
const call = await prisma.callSession.findUnique({ where: { id: req.params.id } });

// after
const call = await prisma.callSession.findFirst({
  where: { id: req.params.id, tenantId: req.auth!.tenant.id },
});
```

Return **404, not 403**, for a row belonging to another tenant — a 403 confirms
the id exists, which is itself a leak.

---

## §7 Making isolation structural

§0.4 is the lesson: a comment telling future code to include `tenantId` did not
survive contact with three new route files. Enforce it in the client instead.

A Prisma client extension that refuses queries on tenant-scoped models when no
`tenantId` appears in the predicate:

```ts
// src/db/tenant-guard.ts
const TENANT_SCOPED = new Set([
  "Customer", "Order", "Ticket", "Message", "AgentAction", "Approval",
  "Product", "Query", "CallSession", "CallTurn", "CallOutcome",
  "KnowledgeArticle", "Membership", "Invitation", "AuditEvent",
]);

export const tenantGuard = Prisma.defineExtension({
  name: "tenant-guard",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!model || !TENANT_SCOPED.has(model)) return query(args);
        if (READ_WRITE_OPS.has(operation) && !hasTenantPredicate(args)) {
          throw new Error(`${model}.${operation} ran without a tenantId predicate`);
        }
        return query(args);
      },
    },
  },
});
```

Deliberately a **hard throw, not a silent injection**. Auto-injecting a tenant
would hide the mistake and make seeders and webhooks behave surprisingly; a
thrown error surfaces in development and in tests, which is where we want it.

Escape hatch for the legitimate cross-tenant paths — seeders, Twilio webhooks
that resolve the tenant *from* the session row, the platform admin tenant list —
via an explicit `prismaUnscoped` export. Grep-able, few call sites, obvious in
review. A test asserts `prismaUnscoped` appears only in that allow-list of files.

This also supersedes `scoped.ts`: keep it as the ergonomic helper, but the
extension is what makes the rule true.

---

## §8 Frontend

### 8.1 Routes

| Route | Guard | Purpose |
|---|---|---|
| `/sign-in` | public | The only entry point |
| `/accept-invite/:token` | public | Set name + password, then straight in |
| `/queries`, `/calls/:id`, `/console`, `/knowledge` | member | Existing console |
| `/demo` | member | Inbound push-to-talk showcase — no longer anonymous (§10.2) |
| `/settings/members` | `TENANT_ADMIN` | Members, roles, invitations |
| `/platform/tenants` | `SUPER_ADMIN` | Tenant list and creation |

`/` stays public — it is a landing page that calls no API. The **Reset demo
data** control on `/demo` renders only for a `SUPER_ADMIN`, matching the
server-side guard on `POST /api/demo/reset`.

### 8.2 AuthProvider replaces the token gate

One `AuthProvider` calls `GET /api/auth/me` on mount and holds
`{ user, memberships, activeTenant, role }`. While loading, render a neutral
splash rather than a flash of the sign-in page.

Then delete all of this:

- `operatorAuthHeaders()` and the `diya:operator-token` key in `web/client/src/lib/api.ts`
- The **Operator key** dropdown in `ConsoleLayout.tsx`
- The duplicated inline token gates in `Queries.tsx`, `QueryDetail.tsx`,
  `CallDetail.tsx` and `Knowledge.tsx` — four copies of the same screen
- Every `headers: { Authorization: \`Bearer ${token}\` }` at the ~18 call sites

`apiFetch` changes in one place:

```ts
const res = await fetch(`${API_BASE_URL}${path}`, {
  ...init,
  credentials: "include",                        // send the cookie
  headers: { "Content-Type": "application/json", ...init?.headers },
});
if (res.status === 401) { redirectToSignIn(); throw new Error("Session expired"); }
```

And the server's CORS must allow credentials — it currently does not:

```ts
app.use(cors({ origin: allowedOrigins, credentials: true }));
```

### 8.3 Workspace switcher becomes real

The sidebar `TenantSwitcher` already exists and reads from
`GET /api/console/tenants`, which today returns **every** tenant. It changes to:

- Populate from `auth.memberships` — only tenants you belong to.
- Selecting one calls `POST /api/auth/switch-tenant`, then refetches.
- Hide the control when a user has exactly one membership; show it whenever
  they have two or more.
- Show the role next to the tenant name, so an admin knows which hat they have on.

`GET /api/console/tenants` must stop returning all tenants; that endpoint is the
current tenant-enumeration leak.

**Switching must hard-reset client state.** Every console page polls
(`Queries` 5s, `CallDetail` and `Console` 2s) and holds tenant rows in
component state. A switch that only changes a variable will paint tenant A's
queries under tenant B's header for a few seconds, and an in-flight poll
started before the switch can land *after* it. Two defences, both needed:

1. Remount the console subtree on change — `key={activeTenantId}` on the
   `<Outlet/>` — so no stale rows survive.
2. Tag each poll with the tenant it was issued for and discard responses whose
   tag no longer matches the active tenant, the same way the existing
   `cancelled` flags already discard responses after unmount.

This is a correctness bug, not a flicker: showing one client's customer phone
numbers under another client's name is precisely the failure the whole plan
exists to prevent, and it would happen entirely in the browser where none of
the server-side guards can see it.

**The workspace picker** (§3, case 3) is the same component rendered full-page
when `activeTenantId` is null, so there is one list of memberships to maintain,
not two.

### 8.4 Members page

Table: Name · Email · Role · Status · Joined · Actions. Role is an inline select
for admins. Pending invitations in a second section with the copy-link button
and a revoke action. The last-admin and self-removal guards are enforced
server-side and mirrored as disabled buttons with a tooltip explaining why —
never only in the UI.

---

## §9 Security hardening

**9.1 Sign-in throttling.** Per-account and per-IP. Exponential backoff after 5
failures; `lockedUntil` on the user after 10, for 15 minutes. Count failures
against the account even when the email does not exist, so timing does not
reveal account existence.

**9.2 No user enumeration.** Sign-in returns one message —
"Invalid email or password" — for unknown email, wrong password, and suspended
account alike. Always run the password hash, even when the user is not found,
against a dummy hash, so response time does not differ.

**9.3 Timing-safe comparison** for every token lookup. Sessions and invitations
are looked up *by hash*, so the comparison is an indexed equality on a
high-entropy value and this is largely automatic.

**9.4 Origin check on mutations.** For every non-GET request, require `Origin`
(or `Referer`) to match the allow-list. With `SameSite=Lax` plus a JSON
content-type requirement this is defence in depth; it is twenty lines and closes
the CSRF question properly.

**9.5 Audit everything that changes access.** `tenant.create`,
`tenant.suspend`, `member.invite`, `member.accept`, `member.remove`,
`member.role_change`, `auth.sign_in`, `auth.sign_in_failed`,
`auth.password_change`, `platform.view_as`. Actor, tenant, target, IP,
timestamp. Never the password, never the token.

**9.6 Attribute actions to real users.** Replace
`overriddenBy: process.env.OUTBOUND_OPERATOR_NAME` in
`routes/calls.ts` with `req.auth!.user.id`, and add `actorUserId` to
`CallOutcome` and `AgentAction`. "Who marked this resolved" becomes answerable —
which is most of the value of having accounts at all.

**9.7 Secrets stay in the environment.** `SESSION_COOKIE_NAME`,
`INVITE_TTL_HOURS`, `SESSION_IDLE_HOURS`, `SESSION_ABSOLUTE_HOURS`,
`ARGON2_MEMORY_COST`. No credential literal in tracked code — and the
super-admin bootstrap below is the one place that rule is easy to break.

**9.8 Bootstrap the first super admin without a hardcoded password.** A CLI
script (`npm run bootstrap:admin`) reads `BOOTSTRAP_ADMIN_EMAIL` and creates a
`SUPER_ADMIN` user with **no password** plus a platform invitation, printing the
accept-link once to stdout. No default credentials, nothing to forget to change,
and the seeded fixture tenants get a dev admin the same way.

---

## §10 Migration from the shared token

`OUTBOUND_OPERATOR_TOKEN` currently guards two different kinds of caller. They
separate cleanly:

| Caller | Today | After |
|---|---|---|
| Humans in the console | shared bearer token | session cookie + membership |
| Twilio webhooks | `X-Twilio-Signature` (already correct) | unchanged |
| NudgeBee approval callback | shared callback secret (already separate) | unchanged |
| Audio fetch by Twilio | unguessable id, 10-min TTL | unchanged |

So `requireOperatorAuth` and `requireOperatorWhenPublic` are **deleted**, not
extended. They protect human routes only, and sessions replace them.

### 10.1 Exactly what disappears

| Deleted | Where |
|---|---|
| `OUTBOUND_OPERATOR_TOKEN`, `OUTBOUND_OPERATOR_NAME` | `.env`, `.env.local`, `.env.example` |
| `isValidOperatorToken`, `requireOperatorAuth` | `src/security/operator-auth.ts` (whole file) |
| `requireOperatorWhenPublic` | `src/index.ts` |
| `operator-auth.test.ts` | replaced by the §11 matrix |
| `operatorAuthHeaders()`, `diya:operator-token` | `web/client/src/lib/api.ts` |
| "Operator key" dropdown | `ConsoleLayout.tsx` |
| Four inline token gates | `Queries`, `QueryDetail`, `CallDetail`, `Knowledge` |
| ~18 `Authorization: Bearer ${token}` call sites | across the client |

What is **not** affected, because none of it is the operator token:
`X-Twilio-Signature`, `APPROVAL_CALLBACK_SECRET`, the audio route's
unguessable-id + TTL scheme, and the outbound service credentials
(`SARVAM_API_KEY`, `FLAGSMITH_SERVER_KEY`, `TWILIO_AUTH_TOKEN`, `DATABASE_URL`).

### 10.2 The conditional guard hides a decision

`requireOperatorWhenPublic` guards `/api/voice`, `/api/console` and
`/api/demo` **only** when `NODE_ENV=production` or `PUBLIC_BASE_URL` is set.
In local development with no tunnel they are wide open today.

Replacing it with `requireAuth` makes them *unconditionally* guarded — strictly
better, but it changes the `/demo` page, which is the inbound push-to-talk
showcase and currently needs no credential at all. After this change it needs
a signed-in session.

**Decided: the demo requires sign-in.** Sign in before the clock starts; no
`DEMO_MODE_ENABLED` escape hatch, no route reaching the voice pipeline without
a session.

But "signed in" is not a single answer for these three, because they are not
equally dangerous:

| Route | Guard | Why |
|---|---|---|
| `/api/console/*` | `requireAuth` + `requireTenant` | Ordinary tenant-scoped reads |
| `/api/voice/*` | `requireAuth` + `requireTenant` | Takes `tenantSlug` + `customerId` in the body today; both become session-derived, with `customerId` validated inside the active tenant |
| `POST /api/demo/reset` | `requireAuth` + **`requirePlatform`** | See below |

**`/api/demo/reset` must be super-admin only, not merely authenticated.** It
calls `reseedDemoData()`, whose first act is `truncateAll()` — and that deletes
**every tenant's** approvals, actions, calls, tickets, queries, articles,
orders, customers and the tenant rows themselves. It is a global destructive
operation wearing the name of a demo helper.

Gating it on `requireAuth` alone would let any operator of any tenant wipe
every other tenant's data. Gating it on `requireTenant` + `TENANT_ADMIN` would
be just as wrong, because the blast radius is not the caller's tenant. It needs
`requirePlatform`, plus a hard refusal when `NODE_ENV === "production"`:

```ts
demoRouter.post("/reset", requireAuth, requirePlatform, async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    res.status(403).json({ error: "demo reset is disabled in production" });
    return;
  }
  // … + AuditEvent { action: "demo.reset" }
});
```

This is the clearest example of why §0.2 matters. The route has no `tenantSlug`
parameter at all, so it never looked like a tenant-isolation problem — and it
is the single most destructive endpoint in the codebase.

Two notes for the cutover:

- `operator-auth.test.ts` goes with it; its replacement is the §11 matrix.
- Delete `OUTBOUND_OPERATOR_TOKEN` and `OUTBOUND_OPERATOR_NAME` from
  `.env.example` in the same commit as the code, so a stale variable never
  reads as a live fallback.

Do the cutover in one commit. A build where both the shared token and sessions
are accepted is a build where the shared token is the weakest link and nothing
has actually improved.

---

## §11 Test matrix

Vitest, alongside the existing 44. The isolation cases are the point — write
them first and watch them fail against the current routes.

**Cross-tenant isolation** (one case per route in §0.3, plus the rewired ones)
- User of tenant B requesting tenant A's `callSessionId` → `404`
- Same for `/end`, `/outcome`, `/consent`, `/do-not-call`, `/queries/:id`
- `POST /api/knowledge` cannot write into another tenant
- `GET /api/console/tenants` returns only the caller's memberships

**Role enforcement**
- `OPERATOR` on every `/api/tenant/*` route → `403`
- Non-super-admin on every `/api/platform/*` route → `403`
- `TENANT_ADMIN` of tenant A on tenant B's member list → `403`

**Session lifecycle**
- Revoked, idle-expired, and absolutely-expired sessions → `401`
- Suspended user with a valid cookie → `401`
- Removed membership → loses tenant access immediately
- Password change revokes sibling sessions but keeps the current one

**Multi-tenant membership**
- A user with memberships in A and B can `switch-tenant` between them; a
  request for C → `403`
- `switch-tenant` to a tenant whose membership was removed → `403`
- Removal from A leaves the B session working, and lands the A session on the
  workspace picker with `NO_ACTIVE_TENANT`
- Role change in A takes effect on the next request with no re-authentication,
  and does not alter the user's role in B
- `TENANT_ADMIN` in A and `OPERATOR` in B: `/api/tenant/*` succeeds while A is
  active and `403`s while B is active, on the same session
- Sign-in with two memberships and no prior session → `activeTenantId` null,
  picker shown
- Inviting an email that already has an account returns the same response
  shape as inviting a new one
- Opening an invite token while signed in as a different email → rejected

**Invitations**
- Replay of an accepted token → rejected
- Expired and revoked tokens → rejected, same generic error
- Acceptance payload carrying `role` or `platformRole` cannot escalate
- Acceptance cannot substitute a different email
- Existing user accepting gains a membership, password untouched

**Guards**
- Removing the last `TENANT_ADMIN` → rejected
- Demoting the last `TENANT_ADMIN` → rejected
- Self-removal → rejected
- Two concurrent demotions of two admins → exactly one succeeds

**Hardening**
- Unknown vs. wrong-password responses are identical in body and shape
- Lockout engages and releases on schedule
- `prismaUnscoped` appears only in the allow-listed files

---

## §12 Work order

Ordered so the security-critical work lands before real accounts exist, not
after. Items 1–3 are one unit: do not stop in the middle.

| # | Task | Est. | Gate |
|---|---|---|---|
| 1 | Schema + migration; argon2/scrypt wrapper; session create/verify/revoke; sign-in, sign-out, `/me`; cookie + CORS credentials; bootstrap CLI | 2.5h | Can sign in and see `/me` |
| 2 | Middleware chain; rewire all 14 `tenantSlug` sites to `req.auth`; delete `requireOperatorAuth` | 1.5h | No route reads a tenant from the client |
| 3 | Close the 5 unscoped routes; Prisma tenant-guard extension + `prismaUnscoped` allow-list | 1h | **Isolation tests pass** |
| 4 | Invitations: create, preview, accept, revoke; `ConsoleInviteDelivery`; members CRUD; last-admin and self-removal guards | 2h | Admin can invite and remove an operator |
| 5 | Platform routes: tenant CRUD, suspend, first-admin invite, user directory | 1h | Super admin can create a working tenant |
| 6 | Frontend: sign-in, accept-invite, `AuthProvider`, delete 4 token gates + header dropdown, workspace switcher **+ picker + switch state-reset**, members page, platform page | 3h | No token prompt anywhere |
| 7 | Test matrix §11 including the multi-tenant cases; attribute outcomes to `userId` | 1.5h | Suite green |
| 8 | *(optional)* Audited, read-only, time-boxed view-as | 1h | Banner + audit row |

**Total ≈ 12.5 hours**, or ≈ 11.5 without item 8.

That is more than one hackathon day. If it must be cut, cut **scope, not
safety**: items 1, 2, 3 and 6 (≈ 8h) give real sign-in with genuine tenant
isolation, with members seeded by script instead of invited through the UI.
Dropping item 3 to save an hour is not an option — it is the item that makes the
other eleven hours mean anything.

---

## §13 Deliberately not building

- **Self-serve sign-up.** Invitation-only was the requirement and it is also the
  right default for a B2B support console.
- **SSO / SAML / OIDC.** Real buyers will ask; it is weeks, not hours. The
  `User` model has no password-shaped assumptions baked into the session layer,
  so it can be added later.
- **MFA.** Worth doing before real customer PII flows through this. `User` has
  room; no stub now.
- **Granular permissions.** Two tenant roles, not a permission matrix. Add
  `VIEWER` if someone genuinely needs read-only.
- **Email delivery.** §4.4 seam, console delivery for now.
- **Org-level billing, SCIM, custom domains.** Not this plan.

---

## §14 Open questions

1. ~~**Can one person belong to several tenants?**~~ **Decided: yes.** An
   operator invited by a second tenant keeps one identity and gains a second
   membership. This makes the workspace picker (§3), the scoped revocation
   table (§3), the existing-account invite path (§4.3.1) and the switcher
   state-reset (§8.3) all required rather than optional.
2. **Should a suspended tenant's in-flight calls be terminated**, or allowed to
   finish? Plan assumes new calls fail closed and live calls continue.
3. **Invite TTL of 7 days** — fine for a demo; a security review may want 48
   hours.
4. **Does the super admin need day-to-day visibility** into tenant queues? If
   yes, item 8 moves from optional to required and gets a proper UI.
