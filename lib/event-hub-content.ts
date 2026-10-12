export const HUB_CONTENT_MODULES = [
  { id: "potluck", label: "Bring something", description: "Items, quantities and helpful notes for your guests." },
  { id: "polls", label: "Polls", description: "A question and a few choices for the crowd." },
  { id: "updates", label: "Host Updates", description: "Parking tips, what to expect, and little notes from you." },
  { id: "questions", label: "Ask the Host", description: "Answer guest questions and choose what to share." },
] as const;
export type HubContentView = typeof HUB_CONTENT_MODULES[number]["id"];
export function isHubContentView(value: unknown): value is HubContentView {
  return HUB_CONTENT_MODULES.some(({ id }) => id === value);
}
// Published visibility wins over an unpublished switch. Turning a live section
// off in the working copy must never suggest that it is already hidden.
export function hubSectionStatus(enabled: boolean, live: boolean) {
  return live ? "Live" : enabled ? "Saved privately" : "Off";
}
export function hubContentView(value?: string): HubContentView {
  return HUB_CONTENT_MODULES.find(({ id }) => id === value)?.id ?? "potluck";
}
