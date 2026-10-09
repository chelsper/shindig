export type ConfirmedEventLocation = {
  address: string;
  matchedAddress: string;
  latitude: number;
  longitude: number;
  source: "census" | "manual" | "published";
};

export type AddressMatch = Pick<ConfirmedEventLocation, "matchedAddress" | "latitude" | "longitude">;

// Details permits either a complete address or street + a separate city/area.
// Use the same composed query for the host's preview, lookup and verification.
const usStateEnding = /\b(?:AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|PR|VI|GU|AS|MP)\s*$/i;
const addressWords = (value: string) => value.toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
export function eventAddressQuery(address: string, cityLabel: string): string {
  const street = address.trim(), city = cityLabel.trim();
  if (!street || !city) return street;
  // A full postal address is authoritative; a display area may be a nickname.
  if (/\s\d{5}(?:-\d{4})?\s*$/.test(street) || usStateEnding.test(street)) return street;
  const streetWords = addressWords(street), cityWords = addressWords(city);
  if (!cityWords || ` ${streetWords} `.includes(` ${cityWords} `)) return street;
  // Avoid repeating a city already entered after the street, while retaining
  // any additional state/ZIP supplied in the separate field.
  const cityParts = city.split(/\s+/);
  for (let count = cityParts.length; count > 0; count--) {
    const prefix = addressWords(cityParts.slice(0, count).join(" "));
    if (prefix && streetWords.endsWith(` ${prefix}`)) {
      const rest = cityParts.slice(count).join(" ").replace(/^[,\s]+/, "");
      return rest ? `${street.replace(/[,\s]+$/, "")}, ${rest}` : street;
    }
  }
  return `${street.replace(/[,\s]+$/, "")}, ${city}`;
}

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
