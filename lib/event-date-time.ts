// Draft events use their own timezone, never the host's computer timezone.
export function normalizeTimeZone(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 100 || !/^(UTC|[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)+)$/.test(value)) return null;
  try { return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone; }
  catch { return null; }
}

export function eventLocalInput(utc: string | null, timeZone: string): string {
  if (!utc) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(utc));
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function eventLocalToUtc(value: string, timeZone: string): string | null {
  if (!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || !normalizeTimeZone(timeZone)) return null;
  const wallTime = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(wallTime) || new Date(wallTime).toISOString().slice(0, 16) !== value) return null;
  // Collect the offsets on both sides of a possible transition. Round-tripping
  // rejects skipped times and repeated times instead of silently guessing.
  const offsets = new Set([-36, -12, 0, 12, 36].map((hours) => {
    const probe = wallTime + hours * 3600000;
    return Date.parse(`${eventLocalInput(new Date(probe).toISOString(), timeZone)}:00Z`) - probe;
  }));
  const candidates = [...offsets].map((offset) => new Date(wallTime - offset).toISOString())
    .filter((utc) => eventLocalInput(utc, timeZone) === value);
  return candidates.length === 1 ? candidates[0] : null;
}
