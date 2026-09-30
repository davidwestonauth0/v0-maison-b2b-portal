# Maison Partner Portal

A standalone Next.js app, owned by Maison, for Maison's B2B partners' own
employees (e.g. Veridian's) to log in and manage their delegated stock,
demonstrating:

- **[Auth0 Organizations](https://auth0.com/docs/manage-users/organizations/organizations-overview)** — each B2B partner is a real Auth0 Organization; an employee logs in scoped to their own partner's org, not a plain account with a role bolted on.
- **Organization-based login with enterprise federation** — each partner organization can have its own SAML/OIDC connection.
- **[Organizations Universal Login self-service management components](https://auth0.com/docs/get-started/universal-components/universal-components-overview)** (`@auth0/universal-components-react`) — member invites, role assignment, and enterprise-connection self-configuration are all Auth0's own pre-built components, not custom UI.
- **[Auth0 FGA](https://auth0.com/docs/get-started/architecture-scenarios/fine-grained-authorization-with-fga)** — per-product-line `viewer`/`manager` delegation within a partner organization (`lib/fga.ts`).
- **FGA tuple lifecycle bound to organization events via Actions** — `auth0-actions/organization-member-fga-tuple-sync.js` keeps FGA's org-roster tuple in sync with Auth0 Organization membership automatically.

This app has no partner hardcoded anywhere: which organization a logged-in
employee belongs to, which backend serves that organization's stock, and
what FGA slug to use are all derived at runtime from the session
(`org_id`) and that Organization's own `metadata` (see
`lib/partner-context.ts`). Veridian is the first partner onboarded, not the
only one this app is built for — a second B2B partner is just another
Organization provisioned with `scripts/provision-partner-org.mjs`, pointed
at its own stock API.

## Why this is its own project, not part of the Maison/Veridian repos

`@auth0/universal-components-react`'s proxy-mode fetchers hit **hardcoded
absolute paths** (`/auth/profile`, `/my-org/*`, `/me/*`) that
`@auth0/nextjs-auth0`'s own `AuthClient` matches literally — confirmed by
reading both libraries' actual source, not just their docs. That means the
components only work cleanly against an `Auth0Client` mounted at the SDK's
*default* `/auth/*` paths. Maison's storefront (`v0-e-commerce-application`)
already owns `/auth/*` for shopper logins with a different Auth0
application, so this portal needed its own deployment with its own
`Auth0Client` free to own `/auth/*` — exactly like Auth0's own
[`examples/next-rwa`](https://github.com/auth0/auth0-ui-components/tree/main/examples/next-rwa)
reference app.

## Getting started

```bash
npm install
```

Set up `.env.local` — see below for everything required — then:

```bash
npm run dev
```

## Environment variables

```bash
# This app's own Auth0 application (Regular Web Application)
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_ISSUER_BASE_URL=https://your-tenant.auth0.com   # alternative to AUTH0_DOMAIN
AUTH0_CLIENT_ID=...
AUTH0_CLIENT_SECRET=...
AUTH0_SECRET=$(openssl rand -hex 32)
APP_BASE_URL=http://localhost:3000
AUTH0_CANONICAL_DOMAIN=your-tenant.auth0.com   # only if using a custom domain — Management API isn't served there

# Client-side, for Auth0ComponentProvider
NEXT_PUBLIC_AUTH0_DOMAIN=your-tenant.auth0.com

# Self-Service SSO (Authentication > Enterprise > Self-Service SSO)
AUTH0_SSP_ID=...

# Auth0 FGA
FGA_API_URL=...
FGA_STORE_ID=...
FGA_MODEL_ID=...            # optional
FGA_API_TOKEN_ISSUER=...
FGA_API_AUDIENCE=...
FGA_CLIENT_ID=...
FGA_CLIENT_SECRET=...

# M2M application for calling a partner's own stock API server-to-server
PORTAL_M2M_CLIENT_ID=...
PORTAL_M2M_CLIENT_SECRET=...

# Session store — reuses the SAME Supabase project as the Maison storefront
# (v0-e-commerce-application), not a dedicated one. Its sessions live in
# their own portal_auth_sessions table so the two apps' session data never
# mixes despite sharing one Postgres database — see
# scripts/001_create_portal_sessions.sql.
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Run `scripts/001_create_portal_sessions.sql` against Maison's Supabase
project before first use — the same project `v0-e-commerce-application`
already uses, just a new table within it.

## Tenant-side setup

1. **Register this app** as a Regular Web Application, with
   `{APP_BASE_URL}/auth/callback` as an allowed callback URL.
2. **Authorize it for the Management API** — client_credentials grant,
   `read:organizations create:organizations update:organizations` (needed by
   `lib/auth0-management.ts` and `scripts/provision-partner-org.mjs`).
3. **Enable the My Organization API** on the tenant and grant this app's
   client User Access to the scopes the Universal Components need (member
   list/invite/roles, SSO provider CRUD — see Auth0's own
   `examples/next-rwa/.env.example` / bootstrap script for the exact list).
4. **Create an FGA store**, write the model documented in `lib/fga.ts`'s
   top-of-file comment.
5. **Create an M2M application** for `PORTAL_M2M_CLIENT_ID`/`SECRET`, and
   authorize it (via a Client Grant) against each partner's stock-API
   audience.
6. **Create an Event Stream** subscribed to `organization.member.added`/
   `organization.member.deleted`, bind
   `auth0-actions/organization-member-fga-tuple-sync.js` to it.
7. **Provision a partner** (e.g. Veridian, the first one onboarded):
   ```bash
   node scripts/provision-partner-org.mjs \
     --name veridian --display-name Veridian \
     --stock-api-base-url https://veridian.westondemos.co.uk \
     --stock-api-audience https://veridian.westondemos.co.uk/api/portal \
     --products-api-url https://veridian.westondemos.co.uk/api/products \
     --client-id <Veridian's own Auth0 application client_id> \
     --admin-user-id auth0|<a real user to seed as org admin>
   ```
   This creates the Organization, sets its metadata
   (`stock_api_base_url`/`stock_api_audience`/`fga_slug`), enables the
   partner's own client for it, and seeds FGA tuples. It prints the org's
   login URL at the end (`/auth/login?organization=<org_id>&returnTo=/`).
   Onboarding a second B2B partner is running this same script again with
   that partner's own name/stock-API details — no code change.
8. Enable an enterprise (SAML/OIDC) connection for the organization — either
   manually in the dashboard, or have an org admin self-configure one via
   this app's own `/security/idp-management` once they can log in.

## Structure

- `app/stock/` — FGA-gated stock list/edit, calling the partner's own
  `/api/portal/stock` API server-to-server (`lib/partner-stock-client.ts`).
- `app/team/` — embedded `OrganizationMemberManagement` (member
  invite/roles) plus this app's own FGA product-line delegation grid
  (`app/team/actions.ts`).
- `app/security/idp-management/` — embedded `SsoProviderTable`/`Create`/`Edit`
  for enterprise-connection self-configuration.
- `lib/partner-context.ts` — resolves the logged-in employee's own
  Organization and its metadata; every page/action calls this instead of
  reading a hardcoded partner name.
- `lib/fga.ts` — the FGA client wrapper and authorization model doc.
- `lib/auth0-management.ts` — Management API calls for Organizations,
  connections, and Self-Service SSO tickets.
