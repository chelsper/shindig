import type { HubContentView } from "./event-hub-content";
import type { EventFeatures } from "./oyster-roast-event";
import type { PublicHostUpdate } from "./updates";
import type { PublicQuestion } from "./questions";

export type PreviewSection<T> = {
  state: "ready" | "disabled" | "unavailable";
  live: boolean | null;
  items: T[];
};
export type PreviewPotluckItem = { title: string; note: string; needed: number; claimed: number };
export type PreviewPoll = {
  question: string; eyebrow: string | null; status: "OPEN" | "CLOSED";
  allowMultiple: boolean; options: { text: string; count: number | null }[];
  responses: number | null;
};
// Only guest-visible fields, even though the containing page is host-only.
export type HubContentPreview = {
  potluck: PreviewSection<PreviewPotluckItem>;
  polls: PreviewSection<PreviewPoll>;
  updates: PreviewSection<PublicHostUpdate>;
  questions: PreviewSection<PublicQuestion>;
};
export function unavailableHubPreview(): HubContentPreview {
  const section = { state: "unavailable" as const, live: null, items: [] };
  return { potluck: { ...section }, polls: { ...section }, updates: { ...section }, questions: { ...section } };
}
export function hubContentReadiness(content: HubContentPreview, features: EventFeatures) {
  const definitions: { id: HubContentView; label: string; empty: string; action: string }[] = [
    { id: "potluck", label: "Bring something", empty: "Add an item and quantity, or leave this section empty for now.", action: "Set up items" },
    { id: "polls", label: "Polls", empty: "No guest-ready polls. Create a poll and make it ready for guests; draft polls stay private and an empty Polls tab stays hidden.", action: "Prepare polls" },
    { id: "updates", label: "Host Updates", empty: "No host notes yet. Add a welcome or parking note whenever you’re ready.", action: "Write an update" },
    { id: "questions", label: "Ask the Host", empty: "Ready for guest questions. No approved answers yet; you don’t need to create any before publishing.", action: "Manage questions" },
  ];
  return definitions.filter(({ id }) => features[id]).map(item => {
    const section = content[item.id];
    const unavailable = section.state !== "ready";
    return { ...item, live: section.live,
      status: unavailable ? "Couldn’t check" : section.items.length ? "Ready" : item.id === "questions" ? "Ready for questions" : "Add content when ready",
      message: unavailable ? "Saved content couldn’t be checked. Reload to try again; nothing has changed." : section.items.length ? `${section.items.length} ${section.items.length === 1 ? "entry" : "entries"} ready for the guest layout.` : item.empty,
    };
  });
}
