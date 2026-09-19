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
   - [`db/migrations/006_create_updates_and_questions.sql`](db/migrations/006_create_updates_and_questions.sql)
   - [`db/migrations/007_music_catalog.sql`](db/migrations/007_music_catalog.sql)
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

The public Event Hub is available at `/event`. Feature availability is controlled only by `features` in [`lib/oyster-roast-event.ts`](lib/oyster-roast-event.ts). Guest List, Playlist, Weather, Questions, and Updates are enabled; Photos and Potluck remain disabled.

The route loads public data on the server and composes the existing header with `EventModules`. Its small module registry contains only implemented modules and filters them using the canonical flags. The same filtered list supplies `HubNavigation` and its content panels, preventing orphaned tabs or placeholders. `HubNavigation` handles touch and keyboard tab switching; each feature owns its own component. To add a future feature, implement its component, register it, and enable its existing event flag. Database access stays on the server.

Weather uses the event's canonical location and transitions from historical context to a real forecast and then an event-day hourly view. Navigation wraps to fit narrow screens and shows one module at a time.

The guest list is rendered server-side and its public query returns only the total attending count plus opted-in guest names and party sizes. Declines and private RSVP fields are never selected. Attending guests can opt out of displaying their name while remaining included in the total count. The host dashboard shows each attending RSVP’s visibility choice.

Authenticated hosts can open `/admin/event` to preview and adjust the Event Hub header’s focal point, zoom, and accessible description. A connected public Vercel Blob store also enables JPG, PNG, WebP, and AVIF uploads up to 10 MB. Upload authorization is issued only after the existing server-side admin session is verified; `BLOB_READ_WRITE_TOKEN` remains server-only.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Playlist and real music catalog search

Migration `005` created the original playlist. Apply [`007_music_catalog.sql`](db/migrations/007_music_catalog.sql) in the same Neon database when deploying the catalog-search version. It preserves all existing suggestions, adds nullable provider/track ID/album/artwork URL/external URL/explicit metadata, and creates an event/provider/track unique index. Legacy manual rows retain NULL provider metadata and their own song/artist uniqueness constraint. This does not guess catalog matches or delete existing suggestions. The old title/artist-only index is replaced, so deploy the new code together with the migration; the old manual-write action is incompatible with the new indexes.

Guests search and choose a song without a Shindig account or music-provider login. The browser calls `/api/music/search`, never Spotify's API. `lib/server/music/provider.ts` defines the provider interface; `catalog.ts` owns caching; `spotify.ts` implements app-only [Client Credentials authorization](https://developer.spotify.com/documentation/web-api/tutorials/client-credentials-flow); `index.ts` registers providers. Adding a provider does not require changing the search UI. Selecting a song submits only the provider ID, track ID, and optional public name (80-character limit). The server resolves canonical metadata from its verified cache or the provider before inserting. Browser-supplied titles, artwork, URLs, and event slugs are ignored. No RSVP/private guest data is read or linked. Public queries never return database UUIDs or timestamps.

Choosing a search result opens a confirmation step with the selected track and an optional name field. Nothing is saved until the guest presses **Add to Playlist**; they can leave the name blank or choose a different song. The confirmation form locks while saving, and the database unique index prevents exact-track duplicates even across concurrent server instances. Duplicates receive “Already on the Shindig playlist 🎵” without changing the first suggestion. Actions revalidate the Event Hub to refresh the list. Database/provider failures retain the selected song and name for retry and never produce false success or a manual-entry fallback. Existing saved songs still load directly from Neon when Spotify is unconfigured or unavailable.

Search waits for three meaningful letters/numbers and 400 ms without typing, aborts stale requests, and returns up to five tracks. Server caches hold at most 300 successful entries for five minutes per warm instance, coalescing concurrent identical searches. Tokens remain in server memory and refresh before expiry. The migration also creates `music_request_limits` for cross-instance quotas: 60 searches/minute and 20 adds/minute per Vercel client IP, plus 90 actual upstream requests/minute application-wide. These are conservative Shindig limits, not Spotify quota guarantees. Provider 429 responses persist a shared Retry-After cooldown and return a friendly 429; missing Retry-After defaults to 60 seconds. There is no immediate retry loop. Only Vercel's trusted IP header is hashed into buckets; raw IPs, search text, names, credentials, and tokens are not stored. Stale buckets are cleaned on subsequent requests after ten minutes. Local development shares one client bucket. Rate limiting requires Neon and fails closed if unavailable.

Original album artwork is loaded directly from Spotify's CDN, with no cropping, overlays, recoloring, or image proxy. Metadata and the official full monochrome logo link back to each track. Missing/failed artwork uses a neutral note placeholder. Attribution follows [Spotify's design guidance](https://developer.spotify.com/documentation/design). Saved suggestions are browsed in sets of 20. No new packages are required.

Hosts can open **Playlist** from `/admin`, or visit `/admin/playlist`, to review and delete suggestions after confirmation. The existing admin session protects both retrieval and deletion. Deletion is scoped to the configured event and refreshes the guest-facing list on its next load. Setting `features.playlist` to false removes the tab, form, and songs from the Hub, skips its public query, and rejects public submissions. Host moderation remains available.

### Spotify Developer Dashboard setup

1. Sign in to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) using the host's Spotify account. Spotify currently requires the **app owner to have active Premium** for development-mode API access; guests do not need Spotify or Premium.
2. Choose **Create app**. Use **Shindig** for the name, a description such as **Music catalog search for party song suggestions**, and **https://www.haveashindig.com** for the website. Select **Web API**. Review and accept Spotify's developer terms yourself.
3. This server-to-server Client Credentials flow needs no user scopes or authorization callback. Leave Redirect URIs empty if the dashboard permits; if its form requires one, add **https://www.haveashindig.com/event**. This flow never uses that value or sends guests through Spotify login.
4. In the app's **Settings**, copy **Client ID** and reveal/copy **Client Secret** directly into Vercel. Do not paste the secret in source code, screenshots, or chat. Do not configure a Web Playback SDK, OAuth guest login, or guest allowlist for this app-only flow.
5. Review [Spotify's current access and quota rules](https://developer.spotify.com/documentation/web-api/concepts/quota-modes). Creating credentials does not guarantee unrestricted production access. Development-mode application quotas apply and Spotify may reject requests if the owner's account/app is ineligible or quota is exhausted. The five-user rule concerns authenticated Spotify users; this flow does not authenticate guests. Extended quota approval has separate eligibility requirements and is not automatically granted.

### Vercel setup for music search

1. Apply migration `007` in the Neon production database used by this project's `DATABASE_URL`, coordinated with deploying this version.
2. In **Vercel → Shindig → Settings → Environment Variables**, add **SPOTIFY_CLIENT_ID** and **SPOTIFY_CLIENT_SECRET**, selecting **Production**. Keep the secret sensitive. Neither variable may use a `NEXT_PUBLIC_` prefix.
3. Optionally add **SPOTIFY_MARKET=US** (US is already the default). Keep the existing **DATABASE_URL** and **ADMIN_PASSWORD** unchanged. No new database service or callback URL environment variable is needed.
4. For preview/local testing, also configure credentials in the corresponding environment and apply `007` to its database. Use a separate Neon branch for previews when possible; preview and production sharing Spotify credentials also share upstream quotas.
5. Deploy this code/redeploy after saving the variables; environment changes do not update an already-running deployment.
6. Open **/event → Playlist → Suggest a Song**. Search, select a track, and confirm it appears after refresh and in **/admin/playlist**. Select the exact same track again and confirm the friendly duplicate message and a single row. Check a missing-artwork result if available. A live Spotify search/save check is still required after credentials are configured; mocked tests cannot verify the app's actual provider entitlement.

No playback, previews, provider playlist creation, voting, guest authentication, or additional Event Hub modules are included.

### Catalog verification

`npm test` covers the provider adapter, token refresh, search caching/debounce/stale responses, server validation, selection/save actions, duplicate handling, artwork fallbacks/attribution, feature flags, rate limiting, provider failures, legacy display, and existing host moderation. Provider responses and the Neon driver are mocked in the automated unit tests; these are not proof of live Spotify access.

For real SQL checks, run `psql "$TEST_DATABASE_URL" -f tests/music-catalog.integration.sql` against an **isolated disposable Postgres database only**. It seeds one legacy suggestion, applies and reapplies migrations `005`/`007`, and verifies catalog saves, duplicate constraints, legacy preservation, and shared quota SQL. It must not be run against production. The milestone was also checked with eight simultaneous inserts (one row saved), plus 320px/390px browser layout, missing-configuration, and selection-state checks using synthetic fixtures. Production Neon migration and live Spotify verification remain deployment steps.

## Host Updates and Guest Q&A

Apply `db/migrations/006_create_updates_and_questions.sql` in the same Neon database before deploying. It adds `event_updates` and `event_questions`, validation constraints, and event-scoped ordering indexes. No additional packages or environment variables are required: the existing server-only `DATABASE_URL` and `ADMIN_PASSWORD` are used.

- `/admin/updates`: create, edit, and delete host updates. An optional heading (120 characters) and required message (3,000 characters) are validated on the server. Creating publishes immediately; editing preserves the original publication timestamp. Guests see updates newest first.
- `/admin/questions`: review private guest questions and optional submitter names, save an answer privately, explicitly publish an answered question, unpublish it, or delete it. Question, name, and answer limits are 1,000, 80, and 2,000 characters. Both pages and every mutation verify the existing host session. Deletions require confirmation.
- Guest questions always start private with no answer. Publication fields from guests are ignored. The public SQL query selects **only question and answer**, and filters to answered, explicitly published rows before data leaves the database. Submitter names, IDs, private answers, pending questions, and timestamps are never passed to public components. Host-authored updates use a separate public projection containing only heading, message, and publication time.
- Client submit locks and a database-unique hashed request token prevent duplicate question records on rapid clicks or retries. A failed save shows a retry error; it never returns a false success or database details. Host update creation is similarly idempotent by UUID. All writes use parameterized SQL and the canonical event slug.
- `features.questions` and `features.updates` independently control the tabs, content, and public queries. Disabling questions also blocks new guest submissions; authenticated moderation remains available. Host changes revalidate the Event Hub for subsequent page loads; there is no polling or notification system.

Questions may contain personal details in their text, so the form cautions guests and the host dashboard reminds the host to review before publishing. The separate optional name field is never publicly displayed. This milestone does not add notifications, email, SMS, accounts, guest authentication, or reactions/comments.

## Intelligent event weather

`WeatherModule` calls Shindig's read-only `/api/weather` route. The route uses `lib/server/weather/service.ts` and the `WeatherProvider` interface; only `open-meteo.ts` knows provider URLs/fields. The guest UI never calls the provider, geolocates visitors, or chooses coordinates. The single canonical event config includes a one-time US Census address match rounded to four decimal places. No Neon tables, migrations, or new packages are needed. Disabling `features.weather` removes the module and rejects weather API requests.

### Data and transitions

- **Outside forecast range:** show **Typical Weather**, explicitly historical and not a forecast. Request 20 prior completed years, using November 4–10 in each year (2006–2025 for this event), through `https://archive-api.open-meteo.com/v1/archive`. Use the consistent ERA5 model, daily high/low/precipitation totals, and hourly temperature. Average only complete seven-day windows; require at least 15 valid years. The displayed sample size reflects actual available years/days. Event-hour temperatures use 5 PM in `America/New_York`, not the provider's fixed UTC offset. A wet day means at least 1 mm of precipitation; its historical frequency is **not** a probability of rain at the event. These are regional reanalysis estimates, not measurements in the backyard.
- **Within the provider's available range:** `https://api.open-meteo.com/v1/forecast` supplies current conditions and, only within its maximum 16 calendar days including today, daily/hourly forecasts. A date inside that range is not sufficient: actual non-null target-day values must also exist. For November 7, the earliest possible switch is October 23. Missing target-day data leaves clearly labeled historical context and an unavailable-forecast note. Missing probabilities stay unavailable, not zero.
- **Event day:** actual event-hour data takes priority, with a 3–9 PM local-time timeline, daily high/low, temperature around 5 PM, precipitation chances, and wind when at least 15 mph or gusts reach 25 mph. Forecasts are never extended or fabricated. After the event date, historical context is identified as such, not an event observation.
- **Current Weather** is a separate, explicitly timestamped model estimate for the event location. Open-Meteo's current data is model-derived, not a live backyard sensor. Hourly/current epoch timestamps are formatted using the event's IANA timezone; daily date labels use the API's returned offset as required by its contract.
- **Sunset** and internally supported sunrise are calculated independently with [NOAA's approximate solar equations](https://gml.noaa.gov/grad/solcalc/solareqns.PDF). They work far beyond forecast range and during a provider outage. Sunset is labeled approximate and displayed in event-local time (EST on November 7), not UTC. Polar day/night returns no invented sunset.

References: [forecast API](https://open-meteo.com/en/docs), [historical API and ERA5 data](https://open-meteo.com/en/docs/historical-weather-api). The module credits Open-Meteo/ERA5 under CC BY 4.0 and identifies Shindig's calculated averages.

### Caching and failures

Next.js's server Data Cache stores successful live responses in **10-minute time buckets**, historical windows and aggregates in **30-day buckets**. Versioned keys include only canonical configuration/provider and the bucket, so live requests cannot receive an earlier bucket's stale-while-revalidate result. This is a replaceable cache, not permanent Neon storage. Each warm instance coalesces identical requests and bounds its memory cache to 64 entries. Historical windows use at most three simultaneous calls and successful windows can be reused after a partial failure. Errors are not saved as successful data; warm-instance failures cool down for 60 seconds, with provider Retry-After respected (up to one day). Cooldowns/coalescing are per instance, not a distributed rate-limit guarantee.

Provider calls time out after seven seconds. Historical context loads through `/api/weather?context=typical` separately from live weather, so slow archive work does not block the Hub or current conditions. Client requests are bounded too. The browser refreshes live data every ten minutes while visible and rechecks on focus. It expires live values even when refresh fails; current model values older than 45 minutes or implausibly future-dated are rejected. API errors become compact unavailable messages, retaining valid historical context and astronomical sunset. No raw provider errors, secrets, private guest data, or arbitrary query access are exposed.

### Environment and deployment

No new environment variable is required for this **personal, non-commercial party**. Leave `OPEN_METEO_API_KEY` empty to use the free endpoints within [Open-Meteo's terms](https://open-meteo.com/en/terms). Commercial Shindig use requires the appropriate paid license; the [current plans](https://open-meteo.com/en/pricing) require Professional or higher for historical data. If applicable, obtain that access yourself and set **OPEN_METEO_API_KEY** in Vercel → Shindig → Settings → Environment Variables → Production (and the relevant Preview environment), then redeploy. The server automatically switches to `customer-api.open-meteo.com` and `customer-archive-api.open-meteo.com`. Never use a `NEXT_PUBLIC_` prefix. No subscription is purchased by this implementation.

Deploy the code normally; no Neon migration or existing credential changes are needed. Check `/event` → **Weather**. Automated tests cover provider normalization, date/DST boundaries, all display states, historical completeness, null data, caching/concurrency, feature flags, privacy and outages. Future/event-day examples in tests are synthetic fixtures and are never used as live fallbacks.
