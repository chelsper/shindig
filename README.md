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
   - [`db/migrations/003_add_guest_list_visibility.sql`](db/migrations/003_add_guest_list_visibility.sql)
   - [`db/migrations/004_create_event_hub_settings.sql`](db/migrations/004_create_event_hub_settings.sql)
   - [`db/migrations/005_create_playlist_suggestions.sql`](db/migrations/005_create_playlist_suggestions.sql)
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
5. To enable Event Hub image uploads, open **Storage**, create a public Vercel Blob store, connect it to the Shindig project, and include the generated `BLOB_READ_WRITE_TOKEN` in Production.
6. Redeploy the latest commit so the environment variables are available to the deployment.

## Host dashboard

Visit `/admin` and enter the configured host password. A successful login creates a signed, HTTP-only, same-site cookie that expires after 12 hours. Changing `ADMIN_PASSWORD` invalidates existing sessions.

The dashboard reads RSVP data only on the server, supports attending/declined filters, shows event totals, and exports the protected guest list as CSV. Authenticated hosts can also add RSVPs, edit guest responses and guest-list visibility, or permanently delete a response after confirmation. Every mutation is protected by the same server-verified admin session and immediately refreshes the dashboard and public Event Hub.

## Guest RSVP updates

New RSVP submissions receive a private update link. The browser creates a cryptographically secure 256-bit token, while Neon stores only its SHA-256 hash. Opening the link loads only the matching RSVP, and all changes are validated and saved server-side.

RSVPs submitted before migration `002` do not have update tokens. Those records remain valid, but only new submissions can receive a private update link.

## Calendar support

Attending confirmations offer Google Calendar, Apple Calendar, and Outlook actions. Calendar details come from the shared [`lib/oyster-roast-event.ts`](lib/oyster-roast-event.ts) configuration. All calendar descriptions link to the Event Hub at `/event`; Apple Calendar receives a dynamically generated `.ics` file whose event URL also points to the Hub. Persisted RSVPs additionally include a separately labeled private RSVP update link. Previously downloaded/imported calendar entries must be re-added to pick up these links.

## Event Hub

The public Event Hub is available at `/event`. Feature availability is controlled only by `features` in [`lib/oyster-roast-event.ts`](lib/oyster-roast-event.ts). Guest List, Playlist, and Weather are enabled; Questions, Updates, Photos, and Potluck remain disabled.

The route loads public data on the server and composes the existing header with `EventModules`. Its small module registry contains only implemented modules and filters them using the canonical flags. The same filtered list supplies `HubNavigation` and its content panels, preventing orphaned tabs or placeholders. `HubNavigation` handles touch and keyboard tab switching; each feature owns its own component. To add a future feature, implement its component, register it, and enable its existing event flag. Database access stays on the server.

Weather currently displays only “Forecast coming soon,” using the event's existing location/date. It makes no weather API requests and displays no invented forecast. Navigation wraps to fit narrow screens and shows one module at a time.

The guest list is rendered server-side and its public query returns only the total attending count plus opted-in guest names and party sizes. Declines and private RSVP fields are never selected. Attending guests can opt out of displaying their name while remaining included in the total count. The host dashboard shows each attending RSVP’s visibility choice.

Authenticated hosts can open `/admin/event` to preview and adjust the Event Hub header’s focal point, zoom, and accessible description. A connected public Vercel Blob store also enables JPG, PNG, WebP, and AVIF uploads up to 10 MB. Upload authorization is issued only after the existing server-side admin session is verified; `BLOB_READ_WRITE_TOKEN` remains server-only.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Collaborative Playlist V1

Apply migration `005_create_playlist_suggestions.sql` to the existing Neon database before deploying this milestone. It adds `playlist_suggestions` with a UUID primary key, the event slug, song title, artist, optional suggested-by name, and creation timestamp. It uses the existing server-only `DATABASE_URL`; no new environment variables or packages are needed.

Guests can suggest a song from the Playlist tab without an account or a music-provider login. Song titles are limited to 160 characters, artists to 120, and optional names to 80, with server validation and database constraints. Names entered in this form are public; no RSVP/private guest data is read or linked. Public queries and action responses never return suggestion IDs or timestamps.

The submit button locks while saving. Whitespace is normalized server-side, and a case-insensitive unique song/artist index prevents repeat or concurrent submissions across server instances. A duplicate receives a friendly confirmation without changing the original suggestion. Successful actions revalidate the Event Hub so the list updates immediately. Database failures show a retry message instead of success.

Hosts can open **Playlist** from `/admin`, or visit `/admin/playlist`, to review and delete suggestions after confirmation. The existing admin session protects both retrieval and deletion. Deletion is scoped to the configured event and refreshes the guest-facing list on its next load. Setting `features.playlist` to false removes the tab, form, and songs from the Hub, skips its public query, and rejects public submissions. Host moderation remains available.

This milestone adds song suggestions only: no playback, music-provider APIs, voting, guest authentication, or other Event Hub modules.
