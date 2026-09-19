# Shindig

A mobile-first invitation page for the Annualish Oyster Roast, built with Next.js, TypeScript, Tailwind CSS, and Neon Postgres.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

`DATABASE_URL` is optional during local invitation UI work. When it is empty, the RSVP flow still completes but shows a development-only notice that the response was not persisted. Production submissions fail with a friendly message if the variable is missing.

Set `ADMIN_PASSWORD` to a strong, unique password to enable the private host dashboard at [http://localhost:3000/admin](http://localhost:3000/admin). The value is read only on the server and must not use a `NEXT_PUBLIC_` prefix.

## Neon database setup

1. Create a Neon project and use its default database/branch.
2. Open Neon’s SQL Editor and run the migrations in order:
   - [`db/migrations/001_create_rsvps.sql`](db/migrations/001_create_rsvps.sql)
   - [`db/migrations/002_add_rsvp_edit_tokens.sql`](db/migrations/002_add_rsvp_edit_tokens.sql)
3. In the Neon project dashboard, choose **Connect** and copy the pooled Postgres connection string.
4. Put that connection string in `.env.local`:

```dotenv
DATABASE_URL=postgresql://...
```

The connection string is server-only. Do not rename it to `NEXT_PUBLIC_DATABASE_URL` or commit it.

## Vercel setup

1. Open the Shindig project in Vercel.
2. Go to **Settings → Environment Variables**.
3. Add `DATABASE_URL` with the Neon pooled connection string for **Production** (and **Preview** if preview deployments should write to a database).
4. Add `ADMIN_PASSWORD` with a strong, unique host password for **Production** (and **Preview** only if the dashboard should work there).
5. Redeploy the latest commit so the environment variables are available to the deployment.

## Host dashboard

Visit `/admin` and enter the configured host password. A successful login creates a signed, HTTP-only, same-site cookie that expires after 12 hours. Changing `ADMIN_PASSWORD` invalidates existing sessions.

The dashboard reads RSVP data only on the server, supports attending/declined filters, shows event totals, and exports the protected guest list as CSV. The export requires the same authenticated admin session.

## Guest RSVP updates

New RSVP submissions receive a private update link. The browser creates a cryptographically secure 256-bit token, while Neon stores only its SHA-256 hash. Opening the link loads only the matching RSVP, and all changes are validated and saved server-side.

RSVPs submitted before migration `002` do not have update tokens. Those records remain valid, but only new submissions can receive a private update link.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Milestone 4 adds private token-based guest RSVP updates. It does not add accounts, email, SMS, multiple events, RSVP deletion, analytics, or an invitation builder.
