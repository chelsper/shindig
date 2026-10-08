import "server-only";
import { neon } from "@neondatabase/serverless";
import { eventScopeSlug, type EventScope } from "./event-scope";
import { isAdminAuthenticated } from "./admin-session";
import { RSVP_CLOSED_MESSAGE } from "../event-lifecycle";
import { RsvpAdmissionError, RSVP_CAPACITY_MESSAGE, RSVP_DEADLINE_MESSAGE } from "../rsvp-policy";
import type { ValidatedRsvpUpdate } from "./rsvp-validation";
import type { SavedRsvp } from "./rsvps";

type Operation = "guest-create" | "guest-update" | "host-create" | "host-update" | "host-delete";
export async function writeEventRsvp(scope: EventScope, operation: Operation, id: string | null, editHash: string | null, fields?: ValidatedRsvpUpdate) {
  const slug = eventScopeSlug(scope);
  if (operation.startsWith("host-") && (scope.access !== "host" || !(await isAdminAuthenticated()))) throw new Error("Host access required.");
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("RSVP storage unavailable.");
  const sql = neon(url);
  const rows = await sql`SELECT shindig_write_event_rsvp(${slug}, ${operation}, ${id}::uuid, ${editHash},
    ${fields?.guestName ?? null}, ${fields?.attending ?? null}::boolean, ${fields?.partySize ?? null}::integer,
    ${fields?.displayOnGuestList ?? null}::boolean, ${fields?.comment ?? null}) AS result`;
  const result = rows[0]?.result as { status?: string; rsvp?: SavedRsvp } | undefined;
  if (result?.status === "full") throw new RsvpAdmissionError(operation.startsWith("host-") ? "This party would exceed the published event capacity. Reduce the party size, or raise/disable capacity in RSVP & Hub and publish that change first." : RSVP_CAPACITY_MESSAGE);
  if (result?.status === "deadline") throw new RsvpAdmissionError(RSVP_DEADLINE_MESSAGE);
  if (result?.status === "closed") throw new RsvpAdmissionError(RSVP_CLOSED_MESSAGE);
  if (result?.status === "invalid") throw new RsvpAdmissionError("The RSVP settings changed. Refresh the page and check your party size before trying again.");
  if (!result || !["created", "duplicate", "updated", "deleted", "missing"].includes(result.status ?? "")) throw new Error("RSVP write could not be confirmed.");
  if (["created", "duplicate", "updated"].includes(result.status!) && !result.rsvp) throw new Error("RSVP response missing.");
  return result;
}
