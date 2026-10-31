export type DuplicateResponse = {
  id: string; guestName: string; attending: boolean; partySize: number | null;
  displayOnGuestList: boolean; comment: string | null; createdAt: string; updatedAt: string; version: string;
  recency?: number;
};
export type DuplicatePair = { older: DuplicateResponse; latest: DuplicateResponse; reason: string };
export type DuplicateReview = { pairs: DuplicatePair[]; total: number };
export type DuplicateDecision = { action: "merge" | "separate"; olderId: string; latestId: string; olderVersion: string; latestVersion: string; confirmed: boolean };
export class DuplicateReviewError extends Error {}

export function normalizedGuestName(name: string) {
  return name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[’']/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}
function oneEditApart(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return edits + (i < a.length || j < b.length ? 1 : 0) <= 1;
}
export function similarGuestNames(first: string, second: string): string | null {
  const a = normalizedGuestName(first), b = normalizedGuestName(second);
  if (!a || !b) return null;
  if (a === b) return "Matching name";
  // Conservative suggestions, not identity verification. Do not fuzzy-match
  // households, initials, unrelated first names, or a surname by itself.
  if (/[&,+/]|\b(and|family|the)\b/i.test(`${first} ${second}`)) return null;
  const x = a.split(" "), y = b.split(" ");
  if (x.length !== 2 || y.length !== 2) return null;
  for (const [same, different] of [[0, 1], [1, 0]]) {
    if (x[same] === y[same] && x[same].length >= 3 && Math.min(x[different].length, y[different].length) >= 4 && oneEditApart(x[different], y[different])) return "Similar spelling — please check";
  }
  return null;
}
export function duplicatePairKey(a: string, b: string) { return [a, b].sort().join(":"); }
export function findDuplicatePairs(responses: DuplicateResponse[], dismissed: Set<string> = new Set()): DuplicateReview {
  const sorted = [...responses].sort((a, b) => (a.recency !== undefined && b.recency !== undefined ? a.recency - b.recency : 0) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id));
  const pairs: DuplicatePair[] = []; let total = 0;
  for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) {
    const latest = sorted[i], older = sorted[j];
    if (dismissed.has(duplicatePairKey(latest.id, older.id))) continue;
    const reason = similarGuestNames(latest.guestName, older.guestName);
    if (reason) { total++; if (pairs.length < 50) pairs.push({ older, latest, reason }); }
  }
  return { pairs, total };
}
export function parseDuplicateDecision(input: unknown): DuplicateDecision | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const v = input as Record<string, unknown>;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  if ((v.action !== "merge" && v.action !== "separate") || typeof v.olderId !== "string" || !uuid.test(v.olderId) || typeof v.latestId !== "string" || !uuid.test(v.latestId) || v.olderId === v.latestId
    || typeof v.olderVersion !== "string" || !/^[a-f0-9]{32}$/.test(v.olderVersion) || typeof v.latestVersion !== "string" || !/^[a-f0-9]{32}$/.test(v.latestVersion)
    || (v.action === "merge" && v.confirmed !== true)) return null;
  return { action: v.action, olderId: v.olderId, latestId: v.latestId, olderVersion: v.olderVersion, latestVersion: v.latestVersion, confirmed: v.confirmed === true };
}
