import type { PublicationSnapshot } from "./event-publication";
import { draftImageUrl, isDraftImagePath } from "./event-draft-artwork";
import { getEventDesign } from "./event-design";
import { appearanceChoices, appearanceSummary, resolveEventAppearance } from "./event-appearance";
import { DRAFT_HUB_MODULES } from "./event-draft-settings";
import { isDraftId } from "./event-drafts";

export type ChangeValue = { text: string; image?: { src: string; alt: string } };
export type PublicationChange = { id: string; label: string; before: ChangeValue; after: ChangeValue; note?: string; editHref?: string };
export type PublicationChangeGroup = { id: string; title: string; editHref: string; changes: PublicationChange[] };
export type PublicationChangeReview = { groups: PublicationChangeGroup[]; changeCount: number; calendarChanged: boolean };

// Called after authenticated reads. Only explicitly compared presentation fields
// leave this helper—not raw snapshots, revisions, provider metadata or guest data.
// Incomplete saved drafts are supported so their publish blockers still render.
export function compareEventPublication(id: string, before: PublicationSnapshot, after: PublicationSnapshot): PublicationChangeReview {
  if (!isDraftId(id)) throw new Error("Invalid event comparison.");
  const base = `/admin/events/${id}`;
  const groups: PublicationChangeGroup[] = [];
  function group(id: string, title: string, destination: string) {
    const result: PublicationChangeGroup = { id, title, editHref: base + destination, changes: [] };
    groups.push(result);
    return (id: string, label: string, oldKey: unknown, newKey: unknown, oldValue: ChangeValue, newValue: ChangeValue, extra: Partial<Pick<PublicationChange, "note" | "editHref">> = {}) => {
      if (JSON.stringify(oldKey) !== JSON.stringify(newKey)) result.changes.push({ id, label, before: oldValue, after: newValue, ...extra });
    };
  }
  const value = (text: string): ChangeValue => ({ text });
  const plain = (text: string, empty = "Not set") => value(text || empty);
  const date = (time: string | null | undefined, zone: string, empty = "Not set") => value(time ? new Intl.DateTimeFormat("en-US", {
    timeZone: zone, weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(time)) + ` · ${zone}` : empty);
  const b = before.details, a = after.details;

  const invitation = group("invitation", "Invitation wording", "#draft-basics-heading");
  for (const [key, label] of [["title", "Event name"], ["hostName", "Host name"], ["description", "Description"]] as const) invitation(key, label, b[key], a[key], plain(b[key]), plain(a[key]));

  const when = group("when", "Date & time", "#draft-date-heading");
  for (const [key, label] of [["startsAtUtc", "Starts"], ["endsAtUtc", "Ends"]] as const) when(key, label,
    [b[key], b[key] ? b.timeZone : null], [a[key], a[key] ? a.timeZone : null], date(b[key], b.timeZone), date(a[key], a.timeZone));
  when("timeZone", "Event timezone", b.timeZone, a.timeZone, value(b.timeZone), value(a.timeZone));

  const where = group("where", "Location", "#draft-place-heading");
  for (const [key, label] of [["venue", "Venue"], ["address", "Street address"], ["cityLabel", "City / area"]] as const) where(key, label, b[key], a[key], plain(b[key]), plain(a[key]));
  const coordinates = (snapshot: PublicationSnapshot) => snapshot.settings.features.weather && snapshot.coordinates
    ? [snapshot.coordinates.latitude, snapshot.coordinates.longitude] : null;
  const location = (snapshot: PublicationSnapshot) => value(!snapshot.settings.features.weather ? "Weather is off" : snapshot.coordinates ? `${snapshot.coordinates.latitude}, ${snapshot.coordinates.longitude}` : "Location confirmation needed");
  where("coordinates", "Weather location", [before.settings.features.weather, coordinates(before)], [after.settings.features.weather, coordinates(after)], location(before), location(after), { editHref: base + "/location" });

  const art = group("artwork", "Design & artwork", "/artwork");
  const oldArt = before.artwork, newArt = after.artwork;
  art("style", "Invitation & Hub style", oldArt.design?.style ?? null, newArt.design?.style ?? null,
    value(oldArt.design ? getEventDesign(oldArt.design.style).name : "Original layout"), value(newArt.design ? getEventDesign(newArt.design.style).name : "Original layout"),
    { note: newArt.design ? appearanceSummary(newArt.design) : undefined });
  // A preset change already describes the resulting look above. Within one
  // preset, compare resolved choices so legacy/default values are equivalent.
  if (oldArt.design && newArt.design && oldArt.design.style === newArt.design.style) {
    const old = appearanceChoices(oldArt.design), next = appearanceChoices(newArt.design);
    const oldDesign = resolveEventAppearance(oldArt.design), nextDesign = resolveEventAppearance(newArt.design);
    art("palette", "Color palette", old.palette, next.palette, value(oldDesign.paletteLabel), value(nextDesign.paletteLabel));
    art("typography", "Font pairing", old.typography, next.typography, value(oldDesign.typographyLabel), value(nextDesign.typographyLabel));
    art("titleWeight", "Title weight", old.titleWeight, next.titleWeight, value(old.titleWeight === "bold" ? "Bold" : "Regular"), value(next.titleWeight === "bold" ? "Bold" : "Regular"));
    art("titleStyle", "Title style", old.titleStyle, next.titleStyle, value(old.titleStyle === "italic" ? "Italic" : "Upright"), value(next.titleStyle === "italic" ? "Italic" : "Upright"));
  }
  const image = (path: string | null, alt: string, caption: string): ChangeValue => {
    if (!path) return value(caption);
    if (!isDraftImagePath(id, path)) throw new Error("Invalid comparison artwork.");
    return { text: caption, image: { src: draftImageUrl(id, path), alt } };
  };
  const oldHeader = oldArt.header.path ?? oldArt.invitation.path, newHeader = newArt.header.path ?? newArt.invitation.path;
  const oldHeaderAlt = oldArt.header.path ? oldArt.header.alt : oldArt.invitation.alt, newHeaderAlt = newArt.header.path ? newArt.header.alt : newArt.invitation.alt;
  const headerCaption = (art: typeof oldArt) => art.header.path ? "Separate Hub artwork" : art.invitation.path ? "Uses invitation artwork" : "No Hub artwork";
  art("invitationImage", "Invitation artwork", oldArt.invitation.path, newArt.invitation.path,
    image(oldArt.invitation.path, oldArt.invitation.alt, oldArt.invitation.path ? "Current artwork" : "Text-only invitation"),
    image(newArt.invitation.path, newArt.invitation.alt, newArt.invitation.path ? "Saved artwork" : "Text-only invitation"), { note: "Images show the full artwork. Use the private previews below to check its framing." });
  art("headerImage", "Event Hub artwork", [oldHeader, Boolean(oldArt.header.path)], [newHeader, Boolean(newArt.header.path)],
    image(oldHeader, oldHeaderAlt, headerCaption(oldArt)), image(newHeader, newHeaderAlt, headerCaption(newArt)), { note: "The Hub uses invitation artwork when no separate header is selected." });
  art("invitationAlt", "Invitation image description", oldArt.invitation.alt, newArt.invitation.alt, plain(oldArt.invitation.alt), plain(newArt.invitation.alt));
  art("headerAlt", "Hub image description", oldHeaderAlt, newHeaderAlt, plain(oldHeaderAlt), plain(newHeaderAlt));

  const invitationCrop = (art: typeof oldArt) => art.invitation.path && art.design ? [art.design.invitationCrop.x, art.design.invitationCrop.y, art.design.invitationCrop.zoom] : null;
  const headerCrop = (art: typeof oldArt) => art.header.path || art.invitation.path ? [art.header.focalX, art.header.focalY, art.header.zoomPercent] : null;
  const cropLabel = (crop: number[] | null, empty: string) => value(crop ? `Horizontal ${crop[0]}% · Vertical ${crop[1]}% · Zoom ${crop[2]}%` : empty);
  art("invitationCrop", "Invitation framing", invitationCrop(oldArt), invitationCrop(newArt), cropLabel(invitationCrop(oldArt), oldArt.invitation.path ? "Full artwork" : "No artwork"), cropLabel(invitationCrop(newArt), newArt.invitation.path ? "Full artwork" : "No artwork"));
  art("headerCrop", "Hub framing", headerCrop(oldArt), headerCrop(newArt), cropLabel(headerCrop(oldArt), "No artwork"), cropLabel(headerCrop(newArt), "No artwork"));

  const rsvp = group("rsvp", "RSVP rules", "/settings#rsvp-limits");
  const oldRsvp = before.settings.rsvp, newRsvp = after.settings.rsvp;
  rsvp("partySize", "Maximum party size", oldRsvp.maxPartySize, newRsvp.maxPartySize, value(`${oldRsvp.maxPartySize} per response`), value(`${newRsvp.maxPartySize} per response`));
  rsvp("comments", "RSVP comments", oldRsvp.allowComments, newRsvp.allowComments, value(oldRsvp.allowComments ? "Allowed" : "Off"), value(newRsvp.allowComments ? "Allowed" : "Off"));
  rsvp("guestNames", "Default guest-list visibility", oldRsvp.guestListDefaultVisible, newRsvp.guestListDefaultVisible, value(oldRsvp.guestListDefaultVisible ? "Name visible by default" : "Name hidden by default"), value(newRsvp.guestListDefaultVisible ? "Name visible by default" : "Name hidden by default"), { note: "A default for new replies only. Guests choose; existing visibility preferences are not changed." });
  rsvp("deadline", "RSVP deadline", [oldRsvp.deadlineAtUtc ?? null, oldRsvp.deadlineAtUtc ? b.timeZone : null], [newRsvp.deadlineAtUtc ?? null, newRsvp.deadlineAtUtc ? a.timeZone : null], date(oldRsvp.deadlineAtUtc, b.timeZone, "No deadline"), date(newRsvp.deadlineAtUtc, a.timeZone, "No deadline"));
  rsvp("capacity", "Total guest capacity", oldRsvp.capacity ?? null, newRsvp.capacity ?? null, value(oldRsvp.capacity == null ? "No attendance limit" : `${oldRsvp.capacity} guests`), value(newRsvp.capacity == null ? "No attendance limit" : `${newRsvp.capacity} guests`));

  const hub = group("hub", "Event Hub features", "/settings#hub-settings-heading");
  for (const feature of DRAFT_HUB_MODULES) hub(feature.id, feature.label, before.settings.features[feature.id], after.settings.features[feature.id], value(before.settings.features[feature.id] ? "Enabled" : "Off"), value(after.settings.features[feature.id] ? "Enabled" : "Off"));
  const changed = groups.filter(({ changes }) => changes.length > 0);
  return { groups: changed, changeCount: changed.reduce((count, group) => count + group.changes.length, 0), calendarChanged: ["title", "description", "address", "startsAtUtc", "endsAtUtc", "timeZone"].some((key) => b[key as keyof typeof b] !== a[key as keyof typeof a]) };
}
