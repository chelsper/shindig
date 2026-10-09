import "server-only";
import { neon } from "@neondatabase/serverless";
import { isAdminAuthenticated } from "./admin-session";
import { isDraftId, validateEventDraft } from "../event-drafts";
import { draftImageUrl, EMPTY_DRAFT_ARTWORK, validateDraftArtwork } from "../event-draft-artwork";
import { DEFAULT_DRAFT_SETTINGS, validateDraftSettings } from "../event-draft-settings";
import { parsePublicationSnapshot } from "../event-publication";
import { compareEventPublication } from "../event-publication-changes";
import { parseEventLocation } from "../event-location";
import { draftEventSlug, eventPaths } from "../event-routes";
import { isEventAlias } from "../event-alias";
import { eventCardDate, type HostEventCard } from "../event-dashboard";
import type { EventVisibility } from "../event-lifecycle";

const timestamp = (value: unknown) => {
  if (value === null) return null;
  if (typeof value !== "string" && !(value instanceof Date)) throw new Error("Invalid event date.");
  return new Date(value).toISOString();
};

// One row per event, from one consistent query. No per-card database requests,
// guest-table reads, writes, or cross-request cache of authenticated data.
export async function listHostEventCards(): Promise<HostEventCard[]> {
  if (!(await isAdminAuthenticated())) throw new Error("Host access required.");
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("Event storage is unavailable.");
  const rows = await neon(url)`SELECT e.id, e.title, e.description, e.host_name AS "hostName", e.venue, e.address,
      e.city_label AS "cityLabel", e.time_zone AS "timeZone", e.starts_at AS "startsAtUtc", e.ends_at AS "endsAtUtc",
      e.location_confirmation AS location, a.settings AS artwork,
      s.event_id AS "settingsId", s.max_party_size AS "maxPartySize", s.allow_comments AS "allowComments",
      s.guest_list_default_visible AS "guestListDefaultVisible", s.rsvp_deadline AS "deadlineAtUtc",
      s.guest_capacity AS capacity, s.features, p.event_id AS "publicationId", p.snapshot,
      p.visibility, p.rsvps_open AS "rsvpsOpen", p.public_alias AS "publicAlias"
    FROM events e
    LEFT JOIN event_draft_artwork a ON a.event_id = e.id
    LEFT JOIN event_draft_settings s ON s.event_id = e.id
    LEFT JOIN event_publications p ON p.event_id = e.id
    WHERE e.status = 'draft'
    ORDER BY greatest(e.updated_at, a.updated_at, s.updated_at, p.published_at) DESC, e.id`;
  return rows.map((row) => {
    if (!isDraftId(row.id)) throw new Error("Invalid event.");
    const id = row.id;
    const draft = validateEventDraft({ ...row, startsAtUtc: timestamp(row.startsAtUtc), endsAtUtc: timestamp(row.endsAtUtc) });
    const artwork = validateDraftArtwork(id, row.artwork ?? EMPTY_DRAFT_ARTWORK);
    const settings = validateDraftSettings(row.settingsId ? {
      rsvp: { maxPartySize: row.maxPartySize, allowComments: row.allowComments, guestListDefaultVisible: row.guestListDefaultVisible, deadlineAtUtc: timestamp(row.deadlineAtUtc), capacity: row.capacity },
      features: row.features,
    } : DEFAULT_DRAFT_SETTINGS);
    if (!draft.ok || !artwork.ok || !settings.ok) throw new Error("Invalid saved event.");
    const location = parseEventLocation(row.location, draft.fields.address);
    if (row.location != null && !location) throw new Error("Invalid saved location.");
    const saved = { details: draft.fields, artwork: artwork.settings, settings: settings.settings,
      coordinates: settings.settings.features.weather && location ? { latitude: location.latitude, longitude: location.longitude } : null };
    const published = row.publicationId != null;
    const status = published ? row.visibility as EventVisibility : "draft";
    if (published && (!["published", "unpublished", "archived"].includes(status) || typeof row.rsvpsOpen !== "boolean" || (status === "archived" && row.rsvpsOpen))) throw new Error("Invalid event status.");
    const alias = row.publicAlias ?? null;
    if (alias !== null && !isEventAlias(alias)) throw new Error("Invalid event link.");
    const lastPublished = published ? parsePublicationSnapshot(id, row.snapshot) : null;
    // Live cards reflect what guests actually see. Inactive events show the last
    // published version, clearly labeled; their working copy stays in this card.
    const display = lastPublished ?? saved;
    const hasUnpublishedChanges = lastPublished ? compareEventPublication(id, lastPublished, saved).changeCount > 0 : false;
    const image = display.artwork.invitation.path ? display.artwork.invitation : display.artwork.header;
    const base = `/admin/events/${id}`;
    return {
      id, title: display.details.title,
      draftTitle: lastPublished && draft.fields.title !== lastPublished.details.title ? draft.fields.title : null,
      dateLabel: eventCardDate(display.details.startsAtUtc, display.details.timeZone), cityLabel: display.details.cityLabel,
      image: image.path ? { src: draftImageUrl(id, image.path), alt: image.alt } : null,
      status, rsvpsOpen: published ? row.rsvpsOpen as boolean : false, hasUnpublishedChanges,
      setupHref: base + "/setup", editHref: base, guestsHref: published ? base + "/guests" : null,
      reviewHref: base + "/publish", shareHref: status === "published" ? base + "/publish#share-event" : null,
      publicHref: status === "published" ? eventPaths(alias ?? draftEventSlug(id)).invitation : null,
      duplicateHref: "/admin/events/duplicate/" + id,
    };
  });
}
