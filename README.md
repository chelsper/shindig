# Shindig

## Design Studio — public preview

Open `/design` to compare **Classic**, **Coastal** and
**After Dark** on a fictional dinner party. Native radio controls switch between
**Invitation / Event Hub** and **Phone / Desktop**, retaining the chosen style.
The preview, palette and typography update immediately; **Reset to Classic**
resets the style without changing the chosen view or size. Only local React state
is used. Reloading or leaving
resets the selection. There is no save, publish, real RSVP, upload or data request.

The route requires no Google setup, admin password or database. It is available
in production as a noindex, fictional design preview. No navigation,
artwork, global styles or saved appearance of Jasper Shucks or any other real
event has changed. This is design work for review, not yet a saved event setting.

`lib/event-design.ts` is the single preset/token definition; the picker, sample
invitation and sample Hub share it. `lib/design-preview.ts` contains the one
fictional sample event, named preview sizes and fitting calculation. Colors are
scoped through a CSS module and custom
properties. Tests check all normal-text and button foreground/background pairs
against WCAG AA's 4.5:1 contrast minimum, safe defaults, noninteractive sample
content, and production availability without credentials. No packages or migration were added.
Phone uses a 390px canvas; Desktop uses a 960px canvas with a wider, two-column
layout. A resize observer fits the entire canvas to the available space and
recalculates its height as content changes. CSS container queries respond to the
canvas width, not the browser width, so Desktop stays a desktop composition even
when viewed on a phone. Captions explicitly identify the scaled preview.

`DesignPreview` composes the independent invitation/Hub components inside
`PreviewFrame`. The Hub includes only a fictional guest list and host note.
Sample RSVP, calendar and directions controls are visual only; nothing submits,
downloads or navigates. No live Hub components or data layers are imported.
Saved design settings remain separate future work.

### Artwork & framing — Step 3 (preview-only)

Open **Artwork & framing** inside the Design Studio. Choose a JPG, PNG or WebP
from your device (up to 10 MB, 40 megapixels and 16,000 pixels on either side).
HEIC, SVG and other formats receive a friendly conversion message. File metadata,
signatures and decoded dimensions are checked before showing the image. Nothing
is uploaded: the source is a browser-local object URL, never an image-optimizer
request, Blob upload or database write. No original image is edited.

- One selected image appears in both fictional previews, with independent
  invitation and Hub position/zoom settings. Choosing a crop also selects that
  preview. Drag the editor image or use the labeled, keyboard-accessible sliders.
- Zoom is 100–250%; position is clamped to keep the frame covered. Invitation
  artwork uses a 4:5 frame; Hub uses 16:9 on Phone and 3:1 on Desktop. The editor
  and preview share the same geometry. Hub phone/desktop share a focal point,
  so check both sizes before deciding on a crop.
- **Reset invitation/Hub header crop** restores only that crop to center / 100%.
  **Remove artwork** restores the selected style’s original sample appearance.
  Replacing an image resets both crops; a failed replacement keeps the previous
  image and crops. Selecting the same file again is supported.
- New selections cancel older decoding. Failure, removal, replacement and
  unmount release unused object URLs. A decoder timeout prevents a stuck loading
  state. Reload/navigation clears this preview-only state; there is no save.

`lib/design-artwork.ts` owns validation and crop math; `lib/local-design-artwork.ts`
handles local decoding. `useDesignArtwork` owns image lifetime and the two crops;
`ArtworkControls` and `ArtworkCrop` are isolated from live event editors.
No package, environment variable, migration or production guest/admin code changed.

Verified locally: lint, typecheck, 1,185 tests and webpack production build pass;
the existing native PostgreSQL concurrency test is still skipped. Tests cover
invalid/corrupt files, cancellation/timeouts, URL cleanup, crop boundaries and
scaled drag math, independent resets, and both artwork previews. Browser checks
cover image selection, drag, keyboard zoom, per-view preservation/reset, removal,
matching editor/preview crops, and 320px/390px layouts without horizontal overflow.

The isolated Step 3 release passed lint, typecheck, 1,139 tests and a webpack
production build, with the same one native concurrency test skipped. It adds only
preview-local artwork/framing components, utilities, tests and documentation;
host-account code, dependencies and migration 020 remain excluded.

Browser checks covered style switching, keyboard selection, reset/reload, and
320px, 390px and 768px layouts without horizontal overflow. The deployment is
isolated from the pending host-account rollout and requires no new environment
variables or database changes.

The initial isolated release passed lint, typecheck, 1,075 tests and a webpack production
build (one existing native PostgreSQL concurrency test skipped). It retains the
tested Next.js 16.3.8 patch; the production dependency audit reports no known
vulnerabilities. Host-account dependencies and migration 020 are not included.

**Step 2: Invitation/Hub and device previews.** The full working tree passed lint,
typecheck, 1,141 tests and a webpack production build (the existing native
PostgreSQL concurrency test remains skipped). New tests cover all twelve
style/view/size combinations, fitting calculations, sample-only content and
contrast. Browser checks covered keyboard selection, retained styles, reset,
reload, 320px/390px/768px layouts, and no horizontal overflow or console errors.
Keep the unfinished host-account rollout out of any Design Studio deployment.

The isolated Step 2 release passed lint, typecheck, 1,095 tests and a webpack
production build, with the same one native concurrency test skipped. The release
contains only Design Studio components, its fictional fixture, tests and docs.

## RSVP deadlines & event capacity (Step 10 — current)

For new-style Shindig events, open **Your events → event → RSVP & Hub →
A little room to plan**. Both controls default to **off**. Save the private draft,
then **Review & publish** to apply them. Jasper Shucks is unchanged.

- **RSVP deadline:** choose a date/time in the event's timezone, at or before
  the event start. Stored as an unambiguous UTC minute; skipped/repeated daylight
  saving times are rejected by the editor. A passed deadline is allowed intentionally
  and closes new guest replies and all guest edits immediately on publication.
  Hosts can still correct saved responses. No scheduler or cron is needed.
- **Total guest capacity:** 1–10,000 people, separate from the existing 1–20
  per-response maximum. Counts every attending person, including private names
  and host-added guests. Declines have no party size and do not consume places.
  Full events still accept declines and existing guests' unchanged/reduced parties.
  Increases must fit in full; no waitlist, partial allocation or automatic removal.
  Host additions/increases obey the same capacity. Publishing a capacity below
  existing attendance is rejected without changing the live version.
- Guest pages show a friendly full/closed message and event-local reply-by time.
  The server checks every write again; an old browser tab cannot bypass limits.
  The public availability projection includes only a state, never RSVP rows,
  names, comments, tokens or hidden attendance totals. Existing guest-list privacy
  is unchanged. Private edit links and calendar/Hub navigation remain available.
- The immediate manual close switch still takes precedence. Reopening it cannot
  override a deadline or capacity. Disabling limits requires saving and publishing.
  Duplicate Event keeps capacity but clears the deadline along with the event dates.

**For another environment:** apply [`019_rsvp_deadline_capacity.sql`](db/migrations/019_rsvp_deadline_capacity.sql)
after 001–018 in the intended Neon database, then deploy this application before
enabling limits. The reapplicable migration adds two nullable draft settings,
constraints, a publication check trigger, and a transactional RSVP function. It
does not alter existing RSVP data, enable limits, or publish any event. No new
packages, environment variables, authentication or notifications.

Migration 019 was applied and verified in Shindig production on October 8, 2026.
Function definitions match this migration; existing data and disabled defaults
were preserved. No event was published and no limit was enabled by the release.

The server-only DAL locks the event's publication row before counting/writing
attendance. Guest and host creates/edits/deletes share that lock with publication
and lifecycle changes. The volatile PostgreSQL function obtains fresh READ COMMITTED
snapshots after lock waits; the publication capacity check runs after acquiring
the row lock. Retry keys confirm the original response without adding places.
Do not roll back to pre-019 application code while limits are enabled: old code
does not participate in this admission protocol. Direct SQL writes bypass the
application workflow and should not be used to add/edit attendees.

Tests: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
`tests/rsvp-limits-postgres.test.ts` runs actual migrations/DAL in a disposable
in-memory PostgreSQL with `SHINDIG_TEST_PGLITE` set to a temporary PGlite
`dist/index.js` path. It never connects to Neon. The optional independent-connection
race test uses `SHINDIG_TEST_LIMITS_PG_SOCKET=/private/tmp/shindig-limits-pg.<id>`
and a fresh local database named `shindig_limits_test` on port 55449 with a
`psql` client (override its path with `SHINDIG_TEST_PSQL`). The suite installs migrations itself; never point it at
production or a shared application database.

## Duplicate Event (Step 9)

Open **Your events → select an event → Duplicate Event** at the bottom of its
setup overview. The existing Oyster Roast has a Duplicate Event link directly
on Your events. Name the copy and confirm before anything is created.

- Copies the latest **saved** details (including unpublished edits), RSVP rules,
  enabled Hub modules, and independent private copies of the invitation/header
  artwork and crop. Published, unpublished, archived and draft sources are supported.
  The legacy Oyster Roast copy uses standard Shindig invitation/RSVP labels, not
  its event-specific wording. The source and Jasper Shucks guest pages are unchanged.
- Clears both dates, the RSVP deadline and weather-coordinate confirmation; keeps
  optional capacity. Generates a new event
  identity; no publication, public alias, calendar identity, RSVP, guest edit token,
  playlist suggestion, applause, question/answer, host update, poll or vote is copied.
  Unsaved RSVP defaults still require an explicit save. Review printed artwork and
  descriptions for old names/dates, finish setup, then explicitly review/publish.
  Only publication makes a guest link available. No invitations are sent.
- Every page/action/data operation requires the existing host session. The browser
  submits only the source ID, review fingerprint, new name and confirmation key;
  settings and artwork come from validated server reads. Stale reviews are rejected.
- A request receipt binds each copy attempt to its source/version/name. The event,
  artwork/settings rows and completed receipt are committed atomically. Repeated
  clicks or retrying a lost response return the same copy, never overwrite it.
  Keep the form open and use **Retry the same copy** after a failure; its name locks
  to preserve that identity. Check Your events before starting a separate request.
- Artwork bytes are bounded, format-checked and copied into the new event's private
  Blob namespace, never reused by reference or overwritten/deleted. Pending receipts
  and unused private image copies may remain after interrupted attempts; they are
  retained for safe retries, not automatically deleted. Public source images are
  restricted to the existing Oyster Roast Blob prefixes or bundled original artwork.

**Before deployment:** apply [`018_event_duplication.sql`](db/migrations/018_event_duplication.sql)
after migrations 001–017 in the target Neon database. It adds only the constrained
`event_duplication_requests` receipt table and is safe to reapply. It does not copy,
publish, seed or change existing events/guest records. Then deploy the application.
No new dependencies or environment variables. Existing server-only `DATABASE_URL`,
`ADMIN_PASSWORD` and admin session configuration remain required;
`EVENT_DRAFT_BLOB_READ_WRITE_TOKEN` must point to the existing **private** Blob store
to copy artwork (text-only copies do not need it). Original bundled artwork is
explicitly included in the server build trace.

Tests cover validation/authentication, source version checks, independent artwork,
private storage boundaries, rollback, simultaneous submissions, lost-response
recovery, source preservation, and no guest/publication carry-over. The optional
`tests/event-duplication-postgres.test.ts` executes all migrations and actual data
queries in fresh in-memory PostgreSQL using `SHINDIG_TEST_PGLITE` from a disposable
`/private/tmp/.../node_modules/@electric-sql/pglite/dist/index.js` installation.
It never connects to Neon. Migration 018 was applied to the Shindig production
database on October 8, 2026; columns, constraints and indexes were verified, with
existing event/guest counts unchanged and no duplication requests created.

Step 9 verification: lint, typecheck, all 1,016 tests (including the isolated
PostgreSQL and QR checks), and the production webpack build passed. Synthetic
browser checks covered 320px / 390px and desktop layouts, one request on rapid
double-click, disabled submitting controls, failure without false success, safe
same-request retry, and routing to the new draft's date/setup checklist. No
production events, artwork or guest records were changed during verification.

## Guided event setup (Step 8 — completed)

Open **Your events → select an event** to reach its private setup overview at
`/admin/events/[id]/setup`. New events go there after their first successful save.
Existing editor routes remain available. The guide connects **Details**, optional
**Artwork**, **RSVP & Hub**, **Preview & publish**, and **Share** without introducing
a new event type or changing the Jasper Shucks guest experience.

- Ready / Optional / Needs attention labels reflect saved draft data. Missing start,
  end and address details link directly to the relevant editor section. Suggested
  RSVP defaults must be saved; text-only invitations remain valid.
- The overview, settings checklist and final publication parser share required-field
  checks. Weather coordinates are reused only for the same published address;
  changing that address clears the prefill and requires confirmation in review.
- The overview distinguishes a private draft, unpublished changes, a matching live
  version, an unpublished event and an archive. It cannot publish or restore an
  event. Publication still requires the existing explicit confirmation and final
  server-side checks, including link availability and saved artwork availability.
- Sharing opens the existing invitation/Hub link and QR panel only for published
  events. Archived events retain host tools and the restore path, with no public
  share actions. Saving never changes guest pages or sends invitations.
- Editors share wrapping, mobile-friendly navigation and retain unsaved-change
  guards. Saves invalidate only the event list and that event’s private setup tree.
  Overview reads require an admin session; failures show unavailable, not a false
  ready state. No new database migration, package or environment variable.

Step 8 verification: lint, typecheck, all 939 tests (including optional isolated
PostgreSQL and QR-decoding checks), and the production webpack build passed.
Synthetic browser checks covered 320px / 390px layouts with no horizontal overflow,
desktop navigation, private first-save routing, saved checklist progress, unsaved
change cancellation, and disabled publishing while required details are missing.
No production records were changed or events published during verification.

## Friendly event links & QR sharing (Step 7 — completed)

Before the **first publication** of a new Shindig event, choose an optional readable
link in **Your events → select an event → Publish & share**, such as `/e/garden-supper`. A title-based
suggestion is editable; **Check link** checks current availability without reserving
it. Names are normalized to lowercase, use letters/numbers/single hyphens, and must
be 3–60 characters. Reserved names and the entire `event-` namespace are unavailable.
Blank keeps the original ID-based link. First publication reserves the name atomically;
concurrent claims are rejected with a friendly message, not a duplicate publication.

- Links are fixed after first publication, including for already-published events
  that have no alias. Changing the title, archiving or restoring never reassigns a
  name. Existing `/e/event-<UUID>` URLs continue to resolve to the **same event**.
- After publication, the compact share panel switches between **Invitation** and
  **Event Hub**. Copy a link, use device sharing when supported, or expand **Get QR
  code** to preview/download a PNG or SVG for that destination. No messages are sent.
- QR generation is local to the application server using `qrcode`; no external QR
  service receives event URLs. The route requires a host session and a currently
  published event. It encodes only the canonical Shindig invitation/Hub URL, never
  a guest token or caller-supplied URL. Downloads are private/no-store. Keep the
  white border intact and test a scan before printing.
- Public invitation, Hub, calendar, artwork and private RSVP-edit URLs resolve
  aliases through the same published-only data layer. Data scopes, RSVP tokens,
  duplicate-submission keys and calendar UIDs retain their permanent event identity.
  Calendar descriptions/navigation prefer the friendly Hub link. Private edit links
  remain private. Host content edits refresh both URL forms.
- Unpublishing/archiving disables both URL forms, their QR destinations and new QR
  downloads; restoring alone does not make them public. Names remain reserved.
  Previously downloaded codes/files cannot be recalled. Jasper Shucks is unchanged.

**Before deployment:** apply [`017_event_public_aliases.sql`](db/migrations/017_event_public_aliases.sql)
after migrations 001–016 in the target Neon database, then deploy. It adds only a
nullable `public_alias` column, a unique index, format/reserved-name constraints,
and an immutable-alias trigger to `event_publications`. It is safe to reapply and
does not rename, publish, archive or otherwise modify existing events/guest data.
Do not roll back to pre-017 application code after sharing friendly URLs: that code
cannot resolve them. No new environment variables. Added dependencies: `qrcode`
and development-only `@types/qrcode`.

Verification covers alias validation/availability/authentication, races and safe
errors, original-link/RSVP/calendar continuity, archived privacy, QR authorization
and canonical output, and mobile publishing/sharing. The opt-in PostgreSQL test
below exercises the actual migration and data layer against isolated fixtures.
For independent scan verification, install `jsqr` and `sharp` in a temporary
directory, set `SHINDIG_TEST_QR_TOOLS` to that directory's absolute
`/private/tmp/.../node_modules` path, and run
`npm test -- tests/event-qr-decode.test.ts`. It decodes both formats for invitation
and Hub URLs, including maximum-length aliases and original ID-based links. The
normal suite skips this test without the temporary tools.

Step 7 verification: lint, typecheck, production webpack build, and all 907 tests
passed with both optional runtimes enabled; synthetic UI checks covered 320px,
390px and desktop layouts, publication/name collisions, downloads and failures.
No production data was used for these tests.

Security follow-up (October 7, 2026): upgraded Next.js and its ESLint configuration
to 16.3.6, `sharp` to 0.35.5, and `source-map-js` to 1.2.2. These address the
[Next.js](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j),
[image-processing](https://github.com/advisories/GHSA-wq5f-xc86-pv6w), and
[source-map](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) advisories.
All quality checks above passed again with the patched dependency lockfile;
`npm audit --omit=dev` reports **zero vulnerabilities**.

The full audit still reports five high-severity dependency entries from one
[unpatched `braces` advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
in the ESLint → fast-glob → micromatch chain. This is lint/build tooling, not a
guest-facing dependency; none of that chain appears in the server runtime traces.
Use trusted lint configuration and recheck for an upstream fix before future
dependency upgrades. Do not run `npm audit fix --force`: its proposed downgrade
to the Next.js 14 lint configuration is incompatible with this project's setup.

## Archive & restore events (Step 6B — completed)

Open **Your events → Manage & share → Archive event** for a previously published
Shindig event. Confirm separately before anything changes. Unfinished drafts stay
in the existing draft list; Jasper Shucks is not part of this archive workflow.

- Archiving moves an event out of **Active events** into **Archived**, hides every
  public event page and closes guest RSVP submissions/edits. No event or guest
  data is deleted. Details, both saved/published artwork, RSVP edit tokens,
  responses, songs, questions, updates and polls remain stored.
- The archived review retains **View event responses** and **Export all RSVPs**.
  Authenticated hosts can still manage their saved data; guest access is blocked
  server-side, not merely hidden in the interface.
- **Restore event** requires confirmation and returns it to the active list as
  **Unpublished**, with RSVPs **closed**. It never makes the event public. Review
  and republish separately, then explicitly reopen RSVPs if desired. Existing
  event URLs and guest edit links work again once the relevant controls allow it.
- Archived events cannot be published or reopened directly, including through a
  stale browser tab. Archive, restore and publish share the same revision checks.
  A database constraint also prevents an archived event from having open RSVPs.
- Nothing is sent to guests. Archiving cannot recall calendar downloads,
  screenshots or information already displayed in an open browser. There is no
  automatic archiving, permanent event deletion or extra event settings screen.

**Before deployment:** apply [`016_event_archive.sql`](db/migrations/016_event_archive.sql)
in the target Neon database after migrations 001–015, then deploy. This atomic,
reapplicable migration extends the publication visibility constraint and adds
the archived/closed constraint; it does not update any existing record. Do not
reapply migration 015 or roll back to pre-016 application code after events have
been archived: older code does not understand or fully protect archived events.
No new packages or environment variables are required.

Verification includes lifecycle validation/authentication, active/archived list
separation, empty/error states, confirmation/pending/failure UI, and an isolated
PostgreSQL archive → restore → republish workflow. The latter checks data and
CSV retention, guest-token continuity, stale/rapid actions, the database
constraint and migration reapplication. No production event is used for testing.

## Event lifecycle controls (Step 6A — completed)

Open **Your events → Manage & share** for an event created in Shindig. The review
now shows **Draft**, **Published**, **Published · RSVPs closed**, or **Unpublished**,
plus an **Unpublished changes** indicator when saved details, artwork or settings
differ from the revisions last reviewed. Private working copies remain separate.

- **Close RSVPs** stops both new responses and guest edits. The invitation and
  Hub stay visible; the private edit link shows the saved attendance read-only.
  Attending guests can still add the event to their calendar. Hosts can still
  add/edit/delete responses. **Reopen RSVPs** reverses closure.
- **Unpublish event** requires a separate confirmation. Public invitation, Hub,
  private RSVP-update route, artwork, calendar downloads, search/weather access
  and guest actions become unavailable. The snapshot, artwork, guest data, edit
  tokens and module content remain stored. Authenticated hosts can still manage
  responses, export CSV and moderate content through the retained snapshot.
- **Republish reviewed event** uses the existing explicit review/confirmation of
  saved details, artwork and settings. It restores the same URLs and private edit
  links. It does **not** automatically reopen closed RSVPs. Reopening a private
  event does not publish it or any draft edits.
- Lifecycle changes and publishing share an optimistic revision check. Stale tabs
  cannot overwrite a newer host decision. RSVP writes also lock/check the live
  publication within their SQL statement, preventing a previously open form from
  saving after closure/unpublication. Errors never become a false success.
- These controls apply only to new Shindig events. Jasper Shucks' legacy routes,
  RSVP behavior, presentation and data are unchanged. No automatic date-based
  transitions, archive/delete-event control, accounts or messages are added.
- Unpublishing cannot recall information or calendar files already downloaded,
  screenshots, or content already displayed in a guest's open browser.

**Before deployment:** apply [`015_event_lifecycle.sql`](db/migrations/015_event_lifecycle.sql)
in the same Neon database as the existing server-only `DATABASE_URL`, after
migrations 001–014. It adds only `visibility` (`published`/`unpublished`) and
`rsvps_open` (boolean) to `event_publications`. Existing snapshots default to
published/open. It is safe to reapply and does not publish drafts, remove data,
change any guest response, or touch Jasper Shucks. Then deploy the new application.
Do not use lifecycle controls after rolling back to pre-015 application code:
older code does not enforce these states. No new packages or environment variables.

Checks: lint, typecheck, full tests, production build and synthetic mobile browser
verification. The opt-in PostgreSQL workflow below also tests close/reopen,
unpublish/republish, host access while private, retained tokens/counts, migration
reapplication, stale scopes, stale publish reviews and rapid repeated controls.
No production event is changed for testing. Step 6B adds archiving above.

## Guest management for published events (Step 5 — completed)

Open **Your events → Review & publish → View event responses**. The event's
guest list now supports **Add Guest**, **Edit**, confirmed **Delete**, name search,
and **All / Attending / Can’t Make It** filters. Search and filters combine; totals
always describe the whole event. **Export all RSVPs** still exports the full event,
not just the current search. Submitted/updated dates use the event's timezone.

- Editors live at `/admin/events/[id]/guests/new` and
  `/admin/events/[id]/guests/[guestId]/edit`. All navigation stays in that event.
- Every read/action requires the existing host session. Actions resolve the
  published event again, enforce its party-size limit, and bind every lookup/write
  to its event slug. Never-published/missing events cannot fall back to Jasper Shucks.
  Step 6A also retains host access to previously published events while private.
- Hosts can edit names, attendance, party size, comments and name visibility.
  Declines always store null party size and hidden names. Host comments and saved
  visibility preferences remain manageable when guest-facing features are off;
  the public Guest List still respects its flag and never returns hidden names.
- One add form uses one UUID. Identical retries do not create another RSVP or
  overwrite an existing guest. Updates preserve guest edit-token hashes and
  creation timestamps; deletion invalidates that guest's existing update link.
- Deletion requires a separate visible confirmation and a server-checked
  confirmation value. Save/delete controls cannot run together while pending.
  Failed saves retain typed input and show a friendly retry message.
- Guest edits update the live RSVP list, totals and Hub without republishing event
  settings. No messages are sent and no guest accounts are created.

**Deployment:** no new migration, environment variable or application dependency.
Deploy normally after checks. Existing Jasper Shucks routes/design remain intact.
No production draft was published or production guest data changed for testing.

Quality checks: `npm run lint`, `npm run typecheck`, `npm test`,
`npm run build -- --webpack`. The opt-in
`tests/event-guests-postgres.test.ts` runs the actual publication, guest actions,
host actions and SQL against an isolated PostgreSQL runtime, with synthetic events
only. The normal test command skips this one test unless configured:

- Native: use the disposable `shindig_drafts_test` database with migrations 001–017
  and set `SHINDIG_TEST_PG_SOCKET` to its `/private/tmp/...` Unix socket directory,
  `SHINDIG_TEST_PSQL` to the `psql` executable, and optionally
  `SHINDIG_TEST_PG_PORT` (default 55441). Its random fixtures are cleaned up.
- In-process fallback: install `@electric-sql/pglite` in a **temporary directory**,
  not this project; set `SHINDIG_TEST_PGLITE` to its absolute
  `/private/tmp/.../node_modules/@electric-sql/pglite/dist/index.js` path. The test
  applies all migrations to a fresh in-memory database and closes it afterward.

With either option, run `npm test -- tests/event-guests-postgres.test.ts` (or the
whole suite). Browser checks separately exercise the actual components with
synthetic actions, including confirmation/cancel, failure preservation, pending
states and mobile layout. These tests do not call production Neon or publish a
real event. Step 7 adds custom URLs and QR codes above.

## Review, publish & share (Step 4B — completed)

Open **Your events → a saved draft → Review & publish** at
`/admin/events/[id]/publish`. Review the saved details, artwork, RSVP rules and
Hub modules, check the explicit public-sharing confirmation, then **Publish event**.
The review requires a start, end time, address, saved settings, and valid saved
artwork if selected. Weather requires host-confirmed coordinates; it never uses
the Oyster Roast location as a fallback. Missing music credentials are called out.
No messages or invitations are sent automatically.

Publication is a **snapshot**, not a change to the private working draft. Later
draft edits—including replacement artwork and feature flags—remain private until
**Publish changes**. Publication checks all reviewed revisions and the previous
live revision atomically; stale tabs cannot overwrite a newer review. Rapid clicks
and identical lost-response retries do not create duplicate publications.

- Invitation: `/e/event-<UUID>`; Hub: `/e/event-<UUID>/event`.
- Private RSVP updates: `/e/[slug]/rsvp/[token]`; calendar: `/e/[slug]/calendar.ics`.
- Artwork: `/e/[slug]/artwork/invitation` or `/header`. The server streams only the
  approved snapshot's image from private Blob storage. It accepts no blob path or
  arbitrary URL. Unpublished uploads are still host-only. Images bypass the public
  Next image optimizer and use no-store responses.
- Guest rules and enabled modules come from the published snapshot on every
  server action. Names/comments/privacy, token access, idempotency and all content
  are scoped to that event. Unknown/unpublished events never fall back to Jasper
  Shucks. Calendar descriptions point to this event's Hub and optional private edit
  link. Declined guests do not see calendar actions.
- **View event responses** opens `/admin/events/[id]/guests`: private RSVP list,
  counts/CSV, and the existing question/update/playlist/poll managers, scoped to
  this published event. Module moderation remains possible when a module is hidden.
  Step 5 adds host RSVP management here; guests can still update their own
  response through their private link.

### Deployment preparation

1. Apply [`014_event_publications.sql`](db/migrations/014_event_publications.sql)
   after 001–013 in the target Neon database, then deploy. It adds only the
   publication snapshot table; no event is published, seeded, copied or deleted.
   It is safe to reapply and compatible with the prior app version.
2. **No new packages or environment variables.** Retain server-only `DATABASE_URL`,
   `ADMIN_PASSWORD`, and `EVENT_DRAFT_BLOB_READ_WRITE_TOKEN`. Retain the existing
   Spotify credentials if Playlist is enabled; Open-Meteo requires no key.
3. Review a saved draft in the deployed admin, then explicitly publish only when
   it is intended to be public. Copy the invitation/Hub links from the share panel.
   Check RSVP, private edit link, calendar and enabled modules with that event.
4. Verify an unpublished draft and its artwork stay unavailable without a host
   session, and later draft edits do not change the published version until approved.

Jasper Shucks' existing domains, routes, design, configuration, RSVP/edit links,
calendar identity, guest data and admin workflow are preserved. Shared links use
the canonical Shindig domain rather than trusting a request host. Public event
pages are noindex, not password-protected: anyone with their link can view them.
Unpublishing/archiving, custom event URL aliases, accounts and notifications are
not added in this step.

Checks: `npm run lint`, `npm run typecheck`, `npm test`,
`npm run build -- --webpack`. Apply 001–014 to a disposable database named
`shindig_drafts_test`, then run `tests/event-publications.integration.sql`,
`tests/event-scopes.integration.sql` and `tests/event-draft-settings.integration.sql`
using `psql -v ON_ERROR_STOP=1 -f …`. The scripts refuse other database names and
roll back their synthetic fixtures. Browser interaction/layout checks use synthetic
local data, not real production submissions.

The earlier milestone notes below describe their state at completion; Step 4B
supersedes their statements that publishing/public event routes are still future work.

## Event-specific foundation & private full-page preview (Step 4A — completed)

Open **Your events → a saved draft → Full-page preview** at
`/admin/events/[id]/preview`. Switch between Invitation and Event Hub; all links
stay within that draft's host-only preview/setup. This uses saved basics, private
artwork/crop, RSVP rules and module choices. Unsaved/default choices are labeled.
It is responsive rather than limited to a phone-width mockup. RSVP submission,
calendar and directions are disabled, and no guest data, provider requests or
guest-interaction cookies are loaded. The preview and private images require the
existing host session; previews are dynamic, noindex and no-referrer.

Each draft has an immutable identity `event-<draft UUID>`, independent of its title.
`lib/event-routes.ts` supplies `/e/[slug]` and `/e/[slug]/event`. **These are reserved
routes, not shareable guest links yet.** Every unpublished/unknown slug returns
404 without querying draft content, including for signed-in hosts. Only the
existing `oyster-roast-2026` public scope resolves; its aliases redirect to
`/invitation` and `/event`. Jasper Shucks' domains, existing routes, artwork,
calendar/edit links, live settings and guest experience remain unchanged.

`lib/server/event-scope.ts` issues immutable, server-only event scopes. Serialized
objects, arbitrary slugs and browser-supplied feature flags cannot authorize data
access. Draft scopes additionally require host authentication and an existing
draft/settings record. RSVP, guest-list, playlist, Q&A, updates, applause and poll
operations bind all reads/writes to that scope; unchanged callers default to the
live Oyster Roast. RSVP limits/comment/privacy rules are enforced again at the
data boundary. Token lookups and duplicate retries include the event; question
retry hashes are namespaced for new events while retaining legacy hash compatibility.
Disabled modules skip public queries and block guest writes. Admin moderation of
disabled modules remains possible. Public projections still exclude private fields.

### Deployment preparation

1. Apply [`013_event_data_scopes.sql`](db/migrations/013_event_data_scopes.sql) after
   migrations 001–012 in the database for the target environment, then deploy.
   It adds an identity registry, backfills existing drafts, automatically registers
   new drafts, and replaces four single-event checks with event foreign keys
   (also protecting polls). Existing RSVP/song/question/update/poll rows, edit
   tokens, privacy choices and publication states are preserved. Reapplying is safe.
   It is compatible with the prior app version during a rolling deployment.
2. No new packages, environment variables or external services are required.
3. Check a saved draft's full-page invitation/Hub preview while signed in, then
   verify the same preview requires login in a private browser and its reserved
   `/e/…` routes return 404. Review the existing Jasper Shucks invitation/Hub.

No publishing, guest access to drafts, live-event migration, host content-management
screens for draft modules, or production deployment is performed by this step.
**Step 4B** still needs publication lifecycle/validation, public artwork delivery,
event-configured guest form/action bindings, calendar/edit links, provider readiness
(including confirmed weather coordinates), share links and a deliberate host
publish action. This foundation deliberately does not make a draft live.

Checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build -- --webpack`.
For real SQL isolation checks, apply 001–013 to an **isolated disposable Postgres
database named `shindig_drafts_test`**, then run
`psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/event-scopes.integration.sql`.
The script refuses other database names and rolls back all synthetic fixtures.

## Private draft RSVP & Event Hub settings (Step 3)

Open **Your events → a saved draft → RSVP & Hub settings** at
`/admin/events/[id]/settings`. Event basics and artwork link to this step.

- Set a maximum party size of **1–20, including the person replying**, allow or
  hide optional comments, and choose the initial “Show my name” checkbox state.
  Guests will retain the choice to hide their name. Hidden attending households
  still count; declined guests and comments never belong on the public list.
- Choose the implemented Guest List, Playlist, Ask the Host, Polls, Host Updates,
  and Weather modules. Photos and Potluck cannot be enabled, including through
  forged requests. New drafts default to Guest List only, a party limit of 20,
  optional comments, and a checked name-visibility choice. Defaults are not saved
  until the host confirms them. Disabling Guest List hides its RSVP-specific UI
  while preserving the host's preference for a later re-enable.
- The phone-width preview responds to unsaved settings. Try attending/declined
  and switch Hub tabs. It uses no live guest data, public RSVP actions, music
  search, weather requests or guest-interaction cookies. Submit is disabled.
  Polls are shown as a labeled preview; the eventual public tab remains
  conditional on actual publishable polls.
- A readiness checklist uses saved basics/artwork and the current settings.
  Artwork and a calendar end time are recommended; event name, start, address,
  and saved settings are essentials. Weather additionally calls out coordinate
  confirmation in the future publishing step—never using Oyster Roast coordinates.
  **This is not a publish validator or a publish button.** Event-specific public
  routing/data scoping are covered by Step 4A above; publication, provider readiness,
  and full launch validation remain Step 4B.

Setup: apply [`012_event_draft_settings.sql`](db/migrations/012_event_draft_settings.sql)
after migrations 010 and 011 before deploying this step. It adds only
`event_draft_settings`, with a foreign key to the private `events` table, bounded
party size, non-null booleans, allowlisted boolean feature JSON, timestamps and
revision checks. No live records are seeded, migrated, or changed. No new package,
service, or environment variable is needed.

The page, server action and server-only data layer all require the host session.
Inputs are validated on the server and again at the data boundary. Writes are
bound to the chosen draft; duplicate/stale saves cannot overwrite newer settings.
Save failures preserve the form and do not display success. Pending saves lock
the form, repeated clicks are ignored, and leaving unsaved changes warns the host.
Missing schema/storage shows a setup/retry message rather than pretending to save.
No settings or draft content is exposed through a public endpoint; Jasper Shucks
continues to use its unchanged canonical live configuration and RSVP rules.

Checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build -- --webpack`.
Unit/component tests cover validation, defaults, privacy choices, feature previews,
authentication, errors, revision guards, readiness and isolation. On an **isolated
test database** with migrations 001–012, run
`psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/event-draft-settings.integration.sql`.
The integration test rejects non-test database names and rolls back all test rows.

## Private draft invitation & artwork

After saving event basics, choose **Invitation & artwork** at `/admin/events/[id]`.
The protected `/admin/events/[id]/artwork` editor supports separate invitation and
Hub header images, accessible descriptions, header focal point/zoom, and a
phone-width invitation/Hub preview. Invitations show the whole image; the header
can reuse that image or use its own. Previewed artwork is not saved until **Save
draft artwork**. Saved event basics supply the preview text and event-local date.
The preview has no working RSVP form, calendar, public URL or publish action.

Setup for this step (separate from the deployed draft foundation):

1. Apply [`011_event_draft_artwork.sql`](db/migrations/011_event_draft_artwork.sql)
   after migration 010 in the same Neon database. It adds only
   `event_draft_artwork`, referencing private drafts; existing live data is untouched.
2. In Vercel → Shindig → Storage, create a **Private** Blob store. Configure its
   read/write token as **EVENT_DRAFT_BLOB_READ_WRITE_TOKEN**, server-only, for the
   intended environment. Do **not** replace the existing public
   `BLOB_READ_WRITE_TOKEN` used by the live Oyster Roast editors. Redeploy after
   configuring the variable. No additional npm packages are required.
3. Save a draft, open its artwork editor, upload an image, add a description,
   inspect the two previews, save and reopen. Without private storage, the editor
   explains setup and disables uploads; without migration 011 it shows a retry/setup
   message rather than claiming to save.

Privacy follows [Vercel's private storage guidance](https://vercel.com/docs/vercel-blob/private-storage):
images require storage authentication and are streamed through a host-authenticated
`/admin/events/[id]/artwork/image` route, **not** through Next's public image
optimizer. Responses are private/no-store with `nosniff`. Uploads require a valid
host session, same-origin request, existing draft, allowed image signature/type,
and at most 4 MB (including an actual streamed-body limit). Generated file paths
are scoped to the draft and image slot. Browser previews also check dimensions
(maximum 12,000 pixels per side). SVG, arbitrary external image URLs, and
cross-draft paths are rejected. Credentials are never sent to the browser.

Artwork saves have independent revision checks, preserving event basics and other
drafts. A failed save preserves input, stale saves require reopening, and duplicate
clicks are disabled. Removing/replacing an image changes only the draft reference;
it does **not** permanently delete files. Unattached private uploads are retained
for now; storage cleanup is a future maintenance task. The live Oyster Roast
artwork and settings are unchanged.

Run `psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/event-draft-artwork.integration.sql`
against a disposable local test database with migrations 001–011 applied. The
test checks persistence, isolation and revision guards, then rolls back.

## Private event drafts

Open **`/admin/events`** using **Your events** in the existing host dashboard. The live Oyster Roast has its own **Manage Oyster Roast** link. **Create event** opens `/admin/events/new`; saved drafts reopen at `/admin/events/[id]`.

- Only a trimmed event name is required to save. Description, host name, venue, address, city/area and start/end times can be filled in later.
- Every draft has its own IANA timezone (default `America/New_York`). Dates are stored as UTC and displayed in the event timezone, not the host computer's timezone. Changing the timezone keeps entered local clock times. Invalid dates and ambiguous/skipped DST times are rejected; end times require a start and must be later, within 168 hours.
- **Save draft** persists to the new `events` table. A stable random creation ID prevents repeated first saves from inserting duplicate records. Identical creation retries can recover a lost response. Revision checks reject stale edits without overwriting a newer save. The UI disables repeat clicks, preserves input on failures, confirms successful saves and warns before leaving unsaved edits.
- Drafts are **private and cannot be published in this milestone**. There is no public draft route, API, guest link, event directory, new RSVP flow, or publish action. Private artwork setup is described above. The schema also restricts `status` to `draft`. A UUID is only a record identifier, never authorization. Pages, actions and the draft data layer all require the existing server-verified host session; all draft pages are noindex and request-rendered.
- The existing live Oyster Roast remains in its existing tables/configuration. This milestone does not backfill or alter it, its RSVP records, private edit tokens, features, calendar identity, or public routes. Future publishing must add event-specific public routes and scoped data access before removing the database draft-only restriction.

### Neon / Vercel setup

1. In Neon, select the same project, branch and database used by production `DATABASE_URL`.
2. Run [`010_create_event_drafts.sql`](db/migrations/010_create_event_drafts.sql). It adds only the `events` table and its draft-list index; no live records are seeded or modified. If an unrelated `events` table already exists, stop and inspect it before applying this migration.
3. Deploy the code to the existing Vercel project. Existing **DATABASE_URL** and **ADMIN_PASSWORD** are sufficient; no new packages, credentials, storage services or domains are needed.
4. Sign in at `/admin`, choose **Your events**, create a draft, save it, return to the list and reopen it. Confirm the draft is still labeled private. Repeat visits without a host session must go to the login screen.

If the migration or database connection is missing, the draft list shows a setup/retry message and a save returns an error—not a false success or local-only persistence. Existing event screens are independent of this table.

Quality checks include `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. To verify the schema and write semantics against an **isolated test database** with migrations 001–010 applied, run `psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/event-drafts.integration.sql`. The integration test refuses databases without `test` in their name, seeds disposable sentinel data inside its transaction, and rolls back all changes.

## Brand home and event domains

Both domains stay on the **same Vercel `shindig` project**, codebase and Neon database:

- `www.haveashindig.com/` (and `haveashindig.com/`) is the Shindig brand home page.
- `www.jaspershucks.app/` (and `jaspershucks.app/`) is the unchanged Oyster Roast invitation. `/event` is its Event Hub.
- `/admin` on either domain uses the same protected tools and event data. Changes published from the Shindig admin also appear on Jasper Shucks. Sessions remain secure, host-only cookies; signing in on one domain does not automatically sign in on the other.
- Existing `/event`, `/rsvp/[token]`, and `/calendar/oyster-roast.ics` routes on **both** domains remain available, without redirects that might discard query strings or private edit tokens. `/invitation` explicitly opens the existing invitation on either domain.
- Invitation-return links, newly generated calendar descriptions and calendar RSVP edit URLs use the canonical Jasper Shucks domain. The calendar UID and event slug are unchanged; existing calendar entries and RSVP tokens retain their identity. Previously downloaded calendars are not automatically rewritten.

`lib/site.ts` owns the domain mapping. Only exact Jasper Shucks hostnames select the invitation at `/`; other hosts (including localhost and Vercel previews) show the brand home. Root pages are request-rendered, so the host-dependent response is not statically shared across domains. Host selection changes presentation only, not authorization, credentials, or data access. The brand home does not query Neon or list event/guest details, and remains available during an event database outage.

No new environment variables, dependencies or migrations are required. In Vercel → project → Settings → Domains, keep both domains attached to this project (not redirected to one another). Existing www/apex redirects within the same domain are fine. This step establishes the separate front doors; it does **not** yet add self-service event creation or new accounts.

## Editing the invitation

The host can edit the main invitation at **`/admin/invitation`**, linked as
**Invitation** in the existing host dashboard. The existing `ADMIN_PASSWORD`
session protects the editor, save action and upload authorization server-side.

- Run `db/migrations/009_invitation_settings.sql` in the same Neon production
  branch/database used by `DATABASE_URL` **before deploying this version**.
  It adds only `invitation_settings`; it does not seed content or change RSVPs.
  The current invitation remains the default until the host first publishes.
- Edit title, description, invitation label, RSVP heading, time note, dates,
  venue/address, city label and invitation artwork. Use **Show draft preview**,
  then **Save & publish invitation**. Another host save requires reloading rather
  than silently overwriting it.
- Dates use `America/New_York`, including daylight saving time. Skipped or
  ambiguous DST times are rejected. The end time is used for calendar entries.
  When changing the address, confirm/update the weather coordinates too.
- Shared details feed the invitation, Hub, directions, RSVP confirmation calendar
  links, dynamic `.ics` downloads and weather service. Event identity, existing
  guest update links and feature flags remain unchanged. Already-downloaded
  calendar entries do not update automatically.
- Invitation artwork is independent of the Hub header. Uploaded artwork is shown
  in full and accepts JPG/PNG/WebP/AVIF up to 10 MB and 12,000 pixels per side.
  Text embedded inside artwork is not rewritten when event fields change.
- Artwork replacement requires a **public Vercel Blob store** connected to the
  `shindig` project in Production, providing server-only `BLOB_READ_WRITE_TOKEN`.
  In Vercel: project → Storage → Create/Connect Database → Blob → connect to
  Production, then redeploy. Do not paste or commit the token. Until connected,
  the editor explains that uploads are unavailable; all text/detail editing works.
  Unpublished uploads are not automatically deleted, so no published image can
  accidentally be removed by replacing a draft.

No new packages or environment variable names are required. Settings are fetched
server-side per request (deduplicated within a render), with validated, public-only
event data sent to the UI. Database failure shows a retry state instead of quietly
using outdated event details. The database keeps a revision for atomic conflict
checks; guest-submitted data cannot authorize invitation edits.

For a disposable local PostgreSQL test database with migrations 001–009 applied,
run `psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/invitation-settings.integration.sql`.
The integration test requires a database name containing `test` and rolls back.

A mobile-first invitation page for the Annualish Oyster Roast, built with Next.js, TypeScript, Tailwind CSS, and Neon Postgres.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the Shindig home page or [http://localhost:3000/invitation](http://localhost:3000/invitation) for the invitation. `/event` and `/admin` are unchanged. To check root-domain routing locally, request `/` with `Host: www.jaspershucks.app` and compare it with `Host: www.haveashindig.com`.

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
   - [`db/migrations/008_guest_interactions_and_polls.sql`](db/migrations/008_guest_interactions_and_polls.sql)
   - [`db/migrations/009_invitation_settings.sql`](db/migrations/009_invitation_settings.sql)
   - [`db/migrations/010_create_event_drafts.sql`](db/migrations/010_create_event_drafts.sql)
   - [`db/migrations/011_event_draft_artwork.sql`](db/migrations/011_event_draft_artwork.sql)
   - [`db/migrations/012_event_draft_settings.sql`](db/migrations/012_event_draft_settings.sql)
   - [`db/migrations/013_event_data_scopes.sql`](db/migrations/013_event_data_scopes.sql)
   - [`db/migrations/014_event_publications.sql`](db/migrations/014_event_publications.sql)
   - [`db/migrations/015_event_lifecycle.sql`](db/migrations/015_event_lifecycle.sql)
   - [`db/migrations/016_event_archive.sql`](db/migrations/016_event_archive.sql)
   - [`db/migrations/017_event_public_aliases.sql`](db/migrations/017_event_public_aliases.sql)
   - [`db/migrations/018_event_duplication.sql`](db/migrations/018_event_duplication.sql)
   - [`db/migrations/019_rsvp_deadline_capacity.sql`](db/migrations/019_rsvp_deadline_capacity.sql)
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

The public Event Hub is available at `/event`. Feature availability is controlled only by `features` in [`lib/oyster-roast-event.ts`](lib/oyster-roast-event.ts). Guest List, Playlist, Weather, Questions, Updates, and Polls are enabled; Photos and Potluck remain disabled. Polls have no public tab until there is an open poll or host-approved closed final result to display.

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

No playback, previews, provider playlist creation, or guest authentication are included. Shindig's anonymous playlist applause is independent of Spotify.

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

Next.js's server Data Cache stores successful live responses in **10-minute time buckets** and validated, complete historical windows in **30-day buckets**. Historical aggregates are cached in warm-instance memory only, so nested persistent caching cannot bypass reusable year data. Versioned keys include only canonical configuration/provider and the bucket, so live requests cannot receive an earlier bucket's stale-while-revalidate result. This is a replaceable cache, not permanent Neon storage. Each warm instance coalesces identical requests and bounds its memory cache to 64 entries. Historical windows use at most three simultaneous calls; successful years survive a partial failure. Cache infrastructure failures fall back to the same provider loader without duplicating its calls. Errors and incomplete years are not saved as successful data; warm-instance failures cool down for at least 60 seconds, with provider Retry-After respected (up to one day). Cooldowns/coalescing are per instance, not a distributed rate-limit guarantee.

Provider calls time out after seven seconds. History calls retry a transient failure once within a shared 40-second deadline; isolated failures do not block other years. Authentication/rate-limit responses and explicit Retry-After headers pause further provider requests. Historical context loads through `/api/weather?context=typical` separately from live weather, so slow archive work does not block the Hub or current conditions. Unavailable history returns HTTP 503 with Retry-After, and the visible browser retries independently of the ten-minute live refresh. Client requests are bounded too. The browser rechecks on focus and expires live values even when refresh fails; current model values older than 45 minutes or implausibly future-dated are rejected. API errors become compact unavailable messages, retaining valid historical context and astronomical sunset. Server diagnostics contain only a failure category, HTTP status and year/sample counts—never raw provider errors, URLs, secrets, or private guest data. No arbitrary query access is exposed.

### Environment and deployment

No new environment variable is required for this **personal, non-commercial party**. Leave `OPEN_METEO_API_KEY` empty to use the free endpoints within [Open-Meteo's terms](https://open-meteo.com/en/terms). Commercial Shindig use requires the appropriate paid license; the [current plans](https://open-meteo.com/en/pricing) require Professional or higher for historical data. If applicable, obtain that access yourself and set **OPEN_METEO_API_KEY** in Vercel → Shindig → Settings → Environment Variables → Production (and the relevant Preview environment), then redeploy. The server automatically switches to `customer-api.open-meteo.com` and `customer-archive-api.open-meteo.com`. Never use a `NEXT_PUBLIC_` prefix. No subscription is purchased by this implementation.

Deploy the code normally; no Neon migration or existing credential changes are needed. Check `/event` → **Weather**. Automated tests cover provider normalization, date/DST boundaries, all display states, historical completeness, null data, caching/concurrency, feature flags, privacy and outages. Future/event-day examples in tests are synthetic fixtures and are never used as live fallbacks.

## Compact guest list, playlist applause, and polls

Apply [`008_guest_interactions_and_polls.sql`](db/migrations/008_guest_interactions_and_polls.sql) after the existing migrations and before deploying this version. It is additive and safe to reapply: existing RSVPs/suggestions stay intact. It adds `playlist_applause`, `polls`, `poll_options`, `poll_votes`, random public song locators, derived poll aggregates, and four transactional write functions. It **does not seed or publish a production poll**. No new packages, environment variables, or services are required; retain the existing server-only `DATABASE_URL` and `ADMIN_PASSWORD`.

### Shared anonymous browser marker

`lib/server/guest-token.ts` creates a cryptographically random 256-bit value in a host-only, HttpOnly, SameSite=Lax cookie (`Secure` in production, one-year lifetime). JavaScript never receives the raw value. Neon stores only a domain-separated SHA-256 hash, shared by applause and poll votes. It contains no personal information and is not linked to RSVPs, names, admin sessions, IPs, or device fingerprints. This is **not authentication or proof of a unique person**: a different device/browser, private browsing, cleared cookies, or a different site hostname can produce a separate marker.

The hub initializes the marker once through a server action. Public mutations require it, validate all inputs and feature flags, and use the canonical event slug plus parameterized SQL. Next.js server actions provide same-origin checks. Raw tokens, hashes, individual voters, internal row IDs and vote timestamps are never returned publicly. Browser responses contain public random locators, aggregate counts, and only that browser's own selections. The initial public poll response contains no open-poll totals; those are returned to a voted browser only when the host enables them.

### Guest experience

- **Who's Coming:** one compact card with the full attendance total and up to four public-name previews. Clear first/last names use the first name; household/couple labels remain intact. **See everyone →** expands the complete public list in place; **Show less ↑** collapses it. Private guests still count, and their names and declined responses never enter the public payload. Small lists do not say “+ more.”
- **Playlist:** 👏 toggles one applause per browser/song, with an immediate optimistic count, pressed state, pending lock and retry errors. The server returns authoritative totals; a unique constraint and locked desired-state write make retries idempotent. **Popular** sorts by applause descending, then newest, then public key; **Newest** retains submission order. Popular is the default once there is applause, unless the guest explicitly chooses another sort. Host moderation still works and shows aggregate applause only; song deletion cascades to its applause.
- **Important Research:** single-choice radios or multiple-choice checkboxes, saved selection, in-place confirmation/results, and **Change my answer**. Multiple polls share a compact Previous/Next view. Empty, draft and archived polls have no public module; closed polls appear only when the host elects to retain final results, with voting disabled. Turning `features.polls` off skips public retrieval/UI and rejects voting without deleting history or disabling host management.

### Host polls and safeguards

Open `/admin` → **Polls** (`/admin/polls`). The page and every mutation verify the existing host session. Create private drafts, edit questions/labels/options/order, add/remove/reorder options, choose single/multiple choice, choose live-result and closed-result visibility, open, close, reopen, archive, or explicitly confirm deletion of an unused draft. Hosts see totals/percentages, never voter identities. Archive removes a poll from the Hub and preserves responses.

Votes are normalized rows, not mutable counters. Foreign keys bind each option and voting mode to its poll. Unique indexes enforce one browser/option and, for single-choice polls, one browser/poll. Vote changes atomically replace the browser's set. Row locks serialize vote changes with host edits/closure; a closed poll cannot accept a late vote. After the first vote, option membership/text and single/multiple mode are locked permanently to preserve answer meaning; safe reordering, question/label edits and visibility controls remain available. Percentages use distinct respondents as the denominator; multiple-choice percentages can sum to more than 100%. Rounded single-choice percentages may sum to 99% or 101%.

### Create the initial Oyster Roast poll after deployment

1. Sign in at `/admin`, choose **Polls**, then **+ Create poll**.
2. Leave the label **IMPORTANT RESEARCH**. Enter **Best way to eat an oyster?**.
3. Enter **Raw**, **Grilled**, **Rockefeller**, and **Absolutely not**, using **+ Add option** for the last two.
4. Leave **Allow multiple choices** unchecked. Keep **Show live results after voting** checked. Choose whether final results should remain visible after closing (checked by default).
5. Choose **Save draft**, review it, then **Open poll**. It appears under **Important Research** on `/event`.

No additional Vercel configuration is required. For another environment, apply migration `008` to that environment's database before deploying the code. Do not use the production database for tests.

### Interaction checks

`npm test` includes token/cookie handling, public projections and hidden results, feature flags, validation, sorting, result percentages, guest/admin actions, failure handling, and component rendering. Existing RSVP, calendar, guest-list privacy, music catalog, questions, updates, admin security, and weather tests remain included.

For real database checks, create an **isolated disposable database named `shindig_interactions_test`**, then run `psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/guest-interactions.integration.sql`. The script refuses other database names. It seeds a synthetic legacy song, applies/reapplies migrations `005`/`007`/`008`, and tests transactional writes, duplicate/foreign-key constraints, vote changes, draft editing, closure, archive and history guards. Assertions run in a rolled-back transaction; its initial synthetic legacy fixture remains in that disposable database. Never run it in production.

This milestone was additionally exercised with eight concurrent requests against isolated PostgreSQL and through the local app's real server actions in a mobile browser. Browser checks cover expand/collapse, applause persistence, creating/opening/editing/closing polls, vote changes, hidden results, and narrow layouts. Production deployment checks are read-only; no synthetic production votes or polls are inserted.
