export type ConfirmedEventLocation = {
  address: string;
  matchedAddress: string;
  latitude: number;
  longitude: number;
  source: "census" | "manual" | "published";
};

export type AddressMatch = Pick<ConfirmedEventLocation, "matchedAddress" | "latitude" | "longitude">;

export function parseEventLocation(value: unknown, address: string): ConfirmedEventLocation | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || !address.trim()) return null;
  const row = value as Record<string, unknown>;
  if (row.address !== address.trim() || typeof row.matchedAddress !== "string" || !row.matchedAddress.trim() || row.matchedAddress.length > 300 || /[\u0000-\u001f\u007f]/.test(row.matchedAddress) ||
    typeof row.latitude !== "number" || !Number.isFinite(row.latitude) || Math.abs(row.latitude) > 90 ||
    typeof row.longitude !== "number" || !Number.isFinite(row.longitude) || Math.abs(row.longitude) > 180 ||
    !["census", "manual", "published"].includes(String(row.source))) return null;
  return { address: address.trim(), matchedAddress: row.matchedAddress.trim(), latitude: row.latitude, longitude: row.longitude, source: row.source as ConfirmedEventLocation["source"] };
}

// Browser number fields must not silently turn blank input into zero.
export function locationNumbers(latitude: string, longitude: string) {
  if (!latitude.trim() || !longitude.trim()) return null;
  const value = parseEventLocation({ address: "manual", matchedAddress: "manual", latitude: Number(latitude), longitude: Number(longitude), source: "manual" }, "manual");
  return value ? { latitude: value.latitude, longitude: value.longitude } : null;
}
