import type { EventFeatures } from "./oyster-roast-event";

export type HubSection = keyof EventFeatures;

export function hubSectionPath(hubPath: string, section: HubSection) {
  // Always share a public route, never the current page's query or private URL.
  if (!/^\/(?:event|e\/[a-z0-9]+(?:-[a-z0-9]+)*\/event)$/.test(hubPath)) {
    throw new Error("Invalid Event Hub path");
  }
  return `${hubPath}#${section}`;
}

export function resolveHubSection(hash: string, enabled: readonly HubSection[], remembered: string | null): HubSection | undefined {
  const requested = hash ? hash.slice(1) : remembered;
  return enabled.find(id => id === requested) ?? enabled[0];
}

export function hubSectionStorageKey(eventSlug: string) {
  return `shindig:hub-section:v1:${eventSlug}`;
}
