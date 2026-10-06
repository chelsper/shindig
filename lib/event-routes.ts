import { isDraftId } from "./event-drafts";

// A title can change without changing the event's identity. These are locators,
// never authorization tokens. Friendly aliases can be added at publication.
export function draftEventSlug(id: string): string {
  if (!isDraftId(id)) throw new Error("Invalid event identity.");
  return `event-${id.toLowerCase()}`;
}

export function eventPaths(slug: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) throw new Error("Invalid event path.");
  const invitation = `/e/${slug}`;
  return { invitation, hub: `${invitation}/event` };
}
