export const SHINDIG_SITE = {
  name: "Shindig",
  url: "https://www.haveashindig.com/",
  title: "Shindig · Good people. Great gatherings.",
  description: "A thoughtful invitation. An easy RSVP. One place for the plans. Shindig brings your people together.",
} as const;

export const OYSTER_ROAST_WEBSITE = "https://www.jaspershucks.app/";

// The host selects presentation only, never authorization or a database tenant.
// Match exact, known domains; never reflect a request host into shared links.
export function isOysterRoastHost(host: string | null): boolean {
  const match = host?.trim().toLowerCase().match(/^([a-z0-9.-]+)(?::\d{1,5})?$/);
  const hostname = match?.[1].replace(/\.$/, "");
  return hostname === "jaspershucks.app" || hostname === "www.jaspershucks.app";
}
